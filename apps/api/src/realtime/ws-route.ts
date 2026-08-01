import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SessionStatus } from '@prisma/client';
import { LingoLiveError, type ApiErrorCode } from '@lingolive/contracts';
import {
  parseClientEvent,
  REALTIME_PROTOCOL_VERSION,
  shouldTranslateProvisional,
  type ClientEvent,
  type ServerEvent,
} from '@lingolive/contracts';
import { maskIpAddress } from '@lingolive/logging';
import type { AppContext } from '../context.js';
import type { Connection } from './hub.js';
import { verifyToken } from '../security/tokens.js';
import { TranscriptService } from '../modules/transcripts.js';
import { BusinessService } from '../modules/business.js';
import { UsageService } from '../modules/usage.js';

/**
 * The realtime endpoint.
 *
 * A client connects, authenticates with a signed participant token, receives a
 * snapshot from its last sequence, and from then on exchanges typed events.
 *
 * Everything expensive happens here exactly once per utterance: persist,
 * translate into the distinct languages the room needs, fan out. Viewers cost
 * a socket, not a model call.
 */

interface ConnectionState {
  connection: Connection;
  sessionId: string;
  participantId: string;
  role: string;
  userId: string | null;
  anonymousHash: string | null;
  /** Last provisional text translated, per slot — drives debouncing. */
  lastProvisional: Map<string, string>;
  /**
   * Slots with a provisional translation in flight, and the newest text
   * waiting behind it.
   *
   * Partials arrive several times a second and each message is handled
   * concurrently, so without this a single sentence fires a translation call
   * per growth step, all at once. They then land in whatever order they
   * finish and overwrite each other on the same sequence — the reader sees
   * the line jump backwards — and the burst is what pushes the provider into
   * rate limiting, which is where the multi-second delays came from.
   *
   * One call per slot at a time; the newest text is translated as soon as the
   * current one returns. Never more than one request in flight, never a stale
   * result overwriting a fresher one.
   */
  provisionalInFlight: Set<string>;
  provisionalPending: Map<string, string>;
  authenticated: boolean;
  /** Audio seconds this connection reported, reconciled at session end. */
  reportedAudioSeconds: number;
}

export async function registerRealtimeRoute(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const transcripts = new TranscriptService(context);
  const business = new BusinessService(context);
  const usage = new UsageService(context);

  app.get('/realtime', { websocket: true }, (socket, request) => {
    const connectionId = randomUUID();
    const networkPrefix = maskIpAddress(request.ip);
    let state: ConnectionState | null = null;

    const send = (event: ServerEvent): void => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // Socket already closed.
      }
    };

    const fail = (code: ApiErrorCode, message: string, retryable: boolean): void => {
      send({ type: 'error', code, message, requestId: request.id, retryable });
      socket.close(retryable ? 1013 : 1008, code);
    };

    // A socket that never authenticates is dropped, so an unauthenticated
    // client cannot hold a connection slot open.
    const authTimeout = setTimeout(() => {
      if (!state?.authenticated) {
        fail('UNAUTHORIZED', 'No session.join received', false);
      }
    }, 10_000);
    authTimeout.unref?.();

    socket.on('message', (raw: Buffer | string) => {
      void (async () => {
        let parsed: ClientEvent | null;
        try {
          parsed = parseClientEvent(JSON.parse(raw.toString()));
        } catch {
          parsed = null;
        }
        if (!parsed) {
          send({
            type: 'error',
            code: 'BAD_REQUEST',
            message: 'Unrecognised event',
            requestId: request.id,
            retryable: true,
          });
          return;
        }

        if (state) state.connection.messagesReceived += 1;

        try {
          if (parsed.type === 'session.join') {
            state = await handleJoin(parsed);
            return;
          }
          if (!state?.authenticated) {
            fail('UNAUTHORIZED', 'Join the session first', false);
            return;
          }
          await handleEvent(state, parsed);
        } catch (error) {
          context.logger.warn(
            { connectionId, err: error, type: parsed.type },
            'Realtime event failed',
          );
          // Surface the real code so the client can tell "your token expired,
          // fetch a new one" apart from "try again in a moment".
          if (error instanceof LingoLiveError) {
            const retryable = error.status >= 500 || error.code === 'RATE_LIMITED';
            if (parsed.type === 'session.join') {
              fail(error.code, error.message, retryable);
            } else {
              send({
                type: 'error',
                code: error.code,
                message: error.message,
                requestId: request.id,
                retryable,
              });
            }
            return;
          }
          send({
            type: 'error',
            code: 'INTERNAL_ERROR',
            message: 'Could not process the event',
            requestId: request.id,
            retryable: true,
          });
        }
      })();
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      if (!state) return;
      context.hub.leave(connectionId);
      void markLeft(state).catch(() => undefined);
      context.metrics.increment('realtime.disconnected');
      broadcastParticipantCount(state.sessionId);
    });

    socket.on('error', () => {
      context.hub.leave(connectionId);
    });

    // -- handlers ---------------------------------------------------------

    async function handleJoin(
      event: Extract<ClientEvent, { type: 'session.join' }>,
    ): Promise<ConnectionState | null> {
      const started = Date.now();
      const claims = verifyToken(event.token, context.env.SESSION_SIGNING_SECRET, 'realtime');

      if (!claims.sessionId || !claims.participantId) {
        fail('REALTIME_TOKEN_INVALID', 'Token is missing session information', false);
        return null;
      }

      const session = await context.prisma.session.findUnique({
        where: { id: claims.sessionId },
        include: { _count: { select: { participants: true } } },
      });
      if (!session) {
        fail('SESSION_NOT_FOUND', 'Session not found', false);
        return null;
      }
      if (session.status === SessionStatus.ENDED || session.status === SessionStatus.EXPIRED) {
        fail('SESSION_ALREADY_ENDED', 'This session has ended', false);
        return null;
      }

      const connection: Connection = {
        id: connectionId,
        sessionId: session.id,
        participantId: claims.participantId,
        role: claims.role ?? 'VIEWER',
        targetLanguage: claims.targetLanguage ?? null,
        connectedAt: new Date(),
        lastHeartbeatAt: new Date(),
        lastSequenceSent: event.lastSequence ?? 0,
        messagesSent: 0,
        messagesReceived: 1,
        networkPrefix,
        send,
        close: (code, reason) => socket.close(code, reason),
      };
      context.hub.join(connection);

      const newState: ConnectionState = {
        connection,
        sessionId: session.id,
        participantId: claims.participantId,
        role: connection.role,
        userId: claims.isGuest ? null : claims.sub,
        anonymousHash: typeof claims.anonymousHash === 'string' ? claims.anonymousHash : null,
        lastProvisional: new Map(),
        provisionalInFlight: new Set(),
        provisionalPending: new Map(),
        authenticated: true,
        reportedAudioSeconds: 0,
      };

      // Replay exactly the gap: everything strictly after what the client
      // already rendered, translated for its reading language.
      const { segments, lastSequence } = await transcripts.listSegments({
        sessionId: session.id,
        afterSequence: event.lastSequence ?? 0,
        limit: 200,
        language: connection.targetLanguage ?? undefined,
      });

      send({
        type: 'session.snapshot',
        sessionId: session.id,
        status: session.status,
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        title: session.title,
        organizerName: session.organizerName,
        kind: session.kind,
        startedAt: session.startedAt.toISOString(),
        readingLanguage: connection.targetLanguage ?? session.readingLanguage,
        segments,
        lastSequence: Math.max(lastSequence, event.lastSequence ?? 0),
        participantCount: context.hub.connectionsFor(session.id).length,
        serverTimeMs: Date.now(),
      });

      context.metrics.recordLatency('realtime.connect', Date.now() - started);
      context.metrics.increment('realtime.connected');
      broadcastParticipantCount(session.id);
      return newState;
    }

    async function handleEvent(current: ConnectionState, event: ClientEvent): Promise<void> {
      switch (event.type) {
        case 'session.heartbeat':
          context.hub.heartbeat(connectionId);
          send({ type: 'pong', serverTimeMs: Date.now() });
          return;

        case 'session.leave':
          socket.close(1000, 'left');
          return;

        case 'language.set': {
          context.hub.setLanguage(connectionId, event.language);
          current.connection.targetLanguage = event.language;
          await context.prisma.participant
            .update({
              where: { id: current.participantId },
              data: { targetLanguage: event.language },
            })
            .catch(() => undefined);
          // Re-send what the reader has already seen, in the new language.
          const { segments, lastSequence } = await transcripts.listSegments({
            sessionId: current.sessionId,
            limit: 200,
            language: event.language,
          });
          const session = await context.prisma.session.findUnique({
            where: { id: current.sessionId },
          });
          if (session) {
            send({
              type: 'session.snapshot',
              sessionId: session.id,
              status: session.status,
              protocolVersion: REALTIME_PROTOCOL_VERSION,
              title: session.title,
              organizerName: session.organizerName,
              kind: session.kind,
              startedAt: session.startedAt.toISOString(),
              readingLanguage: event.language,
              segments,
              lastSequence,
              participantCount: context.hub.connectionsFor(current.sessionId).length,
              serverTimeMs: Date.now(),
            });
          }
          return;
        }

        case 'speaker.start':
          context.hub.broadcast(current.sessionId, {
            type: 'speaker.state',
            slotId: event.slotId ?? null,
            speaking: true,
          });
          return;

        case 'speaker.stop':
          context.hub.broadcast(current.sessionId, {
            type: 'speaker.state',
            slotId: event.slotId ?? null,
            speaking: false,
          });
          return;

        case 'slot.rotate':
          await context.prisma.speakerSlot
            .update({ where: { id: event.slotId }, data: { rotation: event.rotation } })
            .catch(() => undefined);
          return;

        case 'transcript.partial':
          await handlePartial(current, event);
          return;

        case 'transcript.final':
          await handleFinal(current, event);
          return;

        case 'audio.usage':
          current.reportedAudioSeconds += event.seconds;
          return;

        case 'session.pause':
          await setStatus(current.sessionId, SessionStatus.PAUSED);
          return;

        case 'session.resume':
          await setStatus(current.sessionId, SessionStatus.LIVE);
          return;

        case 'session.end':
          await endSession(current);
          return;
      }
    }

    /**
     * Partials are pushed immediately in the original language, because seeing
     * words appear is what makes the product feel live. Translation of a
     * partial is deliberately debounced — translating every keystroke-sized
     * delta would flicker and cost a fortune.
     */
    async function handlePartial(
      current: ConnectionState,
      event: Extract<ClientEvent, { type: 'transcript.partial' }>,
    ): Promise<void> {
      const session = await context.prisma.session.findUnique({
        where: { id: current.sessionId },
        select: { lastSequence: true },
      });
      const provisionalSequence = (session?.lastSequence ?? 0) + 1;

      context.hub.broadcast(current.sessionId, {
        type: 'transcript.partial',
        sessionId: current.sessionId,
        slotId: event.slotId ?? null,
        text: event.text,
        sourceLanguage: event.sourceLanguage ?? null,
        sequence: provisionalSequence,
      });

      const slotKey = event.slotId ?? '__main__';
      const lastTranslated = current.lastProvisional.get(slotKey) ?? null;
      if (!shouldTranslateProvisional({ text: event.text, lastTranslatedText: lastTranslated })) {
        return;
      }
      current.lastProvisional.set(slotKey, event.text);

      // Something is already translating this slot. Leave the newest text for
      // it to pick up and return: firing a second call now would race the
      // first, and whichever finished last would win regardless of which was
      // newer.
      if (current.provisionalInFlight.has(slotKey)) {
        current.provisionalPending.set(slotKey, event.text);
        return;
      }

      current.provisionalInFlight.add(slotKey);
      try {
        let text = event.text;
        for (;;) {
          await translateProvisional(current, {
            slotId: event.slotId ?? null,
            text,
            sourceLanguage: event.sourceLanguage,
            sequence: provisionalSequence,
          });

          // Whatever arrived while that call was out is now the truth. Anything
          // between it and `text` is skipped on purpose — it is already stale,
          // and the reader would never see it.
          const pending = current.provisionalPending.get(slotKey);
          current.provisionalPending.delete(slotKey);
          if (pending === undefined || pending === text) break;
          text = pending;
        }
      } finally {
        current.provisionalInFlight.delete(slotKey);
        current.provisionalPending.delete(slotKey);
      }
    }

    async function translateProvisional(
      current: ConnectionState,
      segment: {
        slotId: string | null;
        text: string;
        sourceLanguage: string | undefined;
        sequence: number;
      },
    ): Promise<void> {
      const targets = await resolveTargetLanguages(current, segment.slotId);
      if (targets.length === 0) return;

      try {
        const results = await context.ai.translation.translateSegment({
          text: segment.text,
          sourceLanguage: segment.sourceLanguage,
          targetLanguages: targets,
        });
        for (const result of results) {
          context.hub.broadcastToLanguage(current.sessionId, result.targetLanguage, {
            type: 'translation.partial',
            sessionId: current.sessionId,
            sequence: segment.sequence,
            targetLanguage: result.targetLanguage,
            text: result.translatedText,
          });
        }
      } catch {
        // A provisional translation failing is not worth surfacing: the final
        // translation will replace it in under two seconds anyway.
        context.metrics.increment('translation.provisional_failures');
      }
    }

    async function handleFinal(
      current: ConnectionState,
      event: Extract<ClientEvent, { type: 'transcript.final' }>,
    ): Promise<void> {
      const started = Date.now();
      const actor = { userId: current.userId, anonymousHash: current.anonymousHash };

      const segment = await transcripts.appendFinalSegment({
        sessionId: current.sessionId,
        speakerSlotId: event.slotId ?? null,
        sourceLanguage: event.sourceLanguage ?? null,
        originalText: event.text,
        startedAtMs: event.startedAtMs ?? null,
        endedAtMs: event.endedAtMs ?? null,
        clientSegmentId: event.clientSegmentId ?? null,
        actor,
      });

      current.lastProvisional.delete(event.slotId ?? '__main__');

      context.hub.broadcast(current.sessionId, { type: 'transcript.final', segment });
      context.metrics.recordLatency('realtime.final_segment', Date.now() - started);

      const targets = await resolveTargetLanguages(current, event.slotId ?? null);
      if (targets.length === 0) return;

      const recentContext = await transcripts.recentContext(current.sessionId, 2);
      const translations = await transcripts.translateSegment({
        segmentId: segment.id,
        sessionId: current.sessionId,
        text: segment.originalText,
        sourceLanguage: segment.sourceLanguage ?? null,
        targetLanguages: targets,
        actor,
        recentContext,
      });

      // One translation per language, delivered to everyone reading it.
      for (const translation of translations) {
        context.hub.broadcastToLanguage(current.sessionId, translation.targetLanguage, {
          type: 'translation.final',
          translation,
        });
      }
    }

    /**
     * The distinct languages this utterance must be translated into.
     *
     * For a broadcast that is every language viewers are reading; for a
     * discussion it is every *other* tile's language. In both cases the source
     * language and duplicates are removed before a single model call is made.
     */
    async function resolveTargetLanguages(
      current: ConnectionState,
      speakingSlotId: string | null,
    ): Promise<string[]> {
      const session = await context.prisma.session.findUnique({
        where: { id: current.sessionId },
        include: { slots: true },
      });
      if (!session) return [];

      if (session.kind === 'BUSINESS_BROADCAST') {
        return business.activeTargetLanguages(current.sessionId);
      }

      if (session.kind === 'PERSONAL_DISCUSS') {
        return session.slots
          .filter((slot) => slot.id !== speakingSlotId)
          .map((slot) => slot.readingLanguage);
      }

      // Listen mode: a single reader, who may want the original.
      return session.readingLanguage && session.readingLanguage !== 'original'
        ? [session.readingLanguage]
        : [];
    }

    async function setStatus(sessionId: string, status: SessionStatus): Promise<void> {
      await context.prisma.session
        .update({ where: { id: sessionId }, data: { status } })
        .catch(() => undefined);
      context.hub.broadcast(sessionId, { type: 'session.status', status });
    }

    async function endSession(current: ConnectionState): Promise<void> {
      const session = await context.prisma.session.findUnique({
        where: { id: current.sessionId },
      });
      if (!session || session.status === SessionStatus.ENDED) return;

      const endedAt = new Date();
      const durationSeconds = Math.max(
        0,
        Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      );

      await context.prisma.session.update({
        where: { id: current.sessionId },
        data: { status: SessionStatus.ENDED, endedAt, durationSeconds },
      });

      // Bill the server-observed window, capped by what the client says it
      // actually transmitted (a paused session sends nothing).
      const billable =
        current.reportedAudioSeconds > 0
          ? Math.min(durationSeconds, current.reportedAudioSeconds)
          : durationSeconds;
      await usage.recordAudioSeconds(
        { userId: current.userId, anonymousHash: current.anonymousHash },
        current.sessionId,
        billable,
      );

      context.hub.closeRoom(current.sessionId, {
        type: 'session.ended',
        sessionId: current.sessionId,
        durationSeconds,
        reason: 'USER_ENDED',
      });
    }

    async function markLeft(current: ConnectionState): Promise<void> {
      await context.prisma.participant.updateMany({
        where: { id: current.participantId, leftAt: null },
        data: { leftAt: new Date(), lastSequenceReceived: current.connection.lastSequenceSent },
      });
    }

    function broadcastParticipantCount(sessionId: string): void {
      context.hub.broadcast(sessionId, {
        type: 'participant.count',
        count: context.hub.connectionsFor(sessionId).length,
      });
    }
  });
}
