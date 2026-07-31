import type { FastifyInstance } from 'fastify';
import { ParticipantRole, SessionKind } from '@prisma/client';
import {
  LingoLiveError,
  transcriptionTokenRequestSchema,
  translationTokenRequestSchema,
  type TranscriptionTokenResponse,
  type TranslationTokenResponse,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { SessionService } from '../modules/sessions.js';
import { UsageService } from '../modules/usage.js';
import { createToken } from '../security/tokens.js';
import { parseOrThrow } from '../plugins/errors.js';

/**
 * Ephemeral credential minting.
 *
 * This is the single point where the product's most important security
 * property is enforced: the standard provider API key exists only in this
 * process. A client receives a short-lived credential scoped to one session,
 * plus a signed token for the LingoLive realtime hub.
 */
export async function registerRealtimeTokenRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const sessions = new SessionService(context);
  const usage = new UsageService(context);

  app.post(
    '/realtime/transcription-token',
    async (request): Promise<TranscriptionTokenResponse> => {
      const actor = await app.requireActor(request);
      const body = parseOrThrow(transcriptionTokenRequestSchema, request.body);

      const session = await sessions.requireOwnership(body.sessionId, {
        userId: actor.userId,
        anonymousHash: actor.anonymousHash,
      });
      if (session.status === 'ENDED' || session.status === 'EXPIRED') {
        throw new LingoLiveError('SESSION_ALREADY_ENDED', 'This session has ended');
      }

      // Quota is re-checked at credential time, not just at session creation:
      // a long session must not be able to outrun the limit it was allowed under.
      const decision = await usage.checkQuota(
        { userId: actor.userId, anonymousHash: actor.anonymousHash },
        actor.plan,
      );
      if (!decision.allowed) {
        throw new LingoLiveError(
          decision.reason === 'COST_LIMIT' ? 'COST_LIMIT_REACHED' : 'QUOTA_EXCEEDED',
          'Usage limit reached',
          { details: { minutesRemaining: decision.minutesRemaining } },
        );
      }

      if (!context.ai.transcription.available) {
        throw new LingoLiveError(
          'AI_PROVIDER_NOT_CONFIGURED',
          'Transcription is not configured on this server',
        );
      }

      const ttl = context.runtimeConfig.number('REALTIME_TOKEN_TTL_SECONDS');
      const credential = await context.ai.transcription.createEphemeralCredential({
        sessionId: body.sessionId,
        spokenLanguage: body.spokenLanguage,
        vocabularyHints: body.vocabularyHints,
        platform: body.platform,
        preferredTransport: body.preferredTransport,
        ttlSeconds: ttl,
      });

      // The owner participates in their own session as OWNER.
      const participant = await context.prisma.participant.upsert({
        where: { id: `${body.sessionId}:${actor.userId}` },
        create: {
          id: `${body.sessionId}:${actor.userId}`,
          sessionId: body.sessionId,
          userId: actor.userId,
          role: ParticipantRole.OWNER,
          targetLanguage: session.readingLanguage,
        },
        update: { leftAt: null },
      });

      const { token: realtimeToken } = createToken(
        {
          sub: actor.userId,
          typ: 'realtime',
          sessionId: body.sessionId,
          participantId: participant.id,
          role: 'OWNER',
          targetLanguage: session.readingLanguage,
          isGuest: actor.isGuest,
          anonymousHash: actor.anonymousHash,
          // Long enough for a full session; the *provider* credential is the
          // short-lived one.
          ttlSeconds: Math.max(
            3600,
            context.runtimeConfig.number('MAX_PERSONAL_SESSION_MINUTES') * 60,
          ),
        },
        context.env.SESSION_SIGNING_SECRET,
      );

      context.metrics.increment('realtime.token_issued');

      return {
        config: {
          sessionId: body.sessionId,
          clientSecret: credential.clientSecret,
          expiresAt: credential.expiresAt.toISOString(),
          model: credential.model,
          endpoint: credential.endpoint,
          transport: credential.transport,
          audio: audioProfileFor(credential.transport),
          vad: vadProfileFor(session.kind),
          spokenLanguage: body.spokenLanguage,
          vocabularyHints: body.vocabularyHints,
          noiseReduction: 'near_field',
        },
        realtimeToken,
        realtimeUrl: realtimeUrl(context),
      };
    },
  );

  /**
   * A translation-only token: used by a client that renders someone else's
   * transcript (a Business viewer, or a Discuss tile) and needs the socket but
   * never sends audio.
   */
  app.post('/realtime/translation-token', async (request): Promise<TranslationTokenResponse> => {
    const actor = await app.requireActor(request);
    const body = parseOrThrow(translationTokenRequestSchema, request.body);

    await sessions.requireOwnership(body.sessionId, {
      userId: actor.userId,
      anonymousHash: actor.anonymousHash,
    });

    const maxLanguages = context.runtimeConfig.number('MAX_BUSINESS_TARGET_LANGUAGES');
    if (body.targetLanguages.length > maxLanguages) {
      throw new LingoLiveError(
        'VALIDATION_FAILED',
        `At most ${maxLanguages} target languages are supported`,
      );
    }

    const { token, expiresAt } = createToken(
      {
        sub: actor.userId,
        typ: 'realtime',
        sessionId: body.sessionId,
        participantId: `${body.sessionId}:${actor.userId}`,
        role: 'SPEAKER_SLOT',
        targetLanguage: body.targetLanguages[0] ?? null,
        ttlSeconds: 3600,
      },
      context.env.SESSION_SIGNING_SECRET,
    );

    return {
      realtimeToken: token,
      realtimeUrl: realtimeUrl(context),
      expiresAt: expiresAt.toISOString(),
      targetLanguages: body.targetLanguages,
    };
  });
}

function realtimeUrl(context: AppContext): string {
  const base = context.env.API_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '');
  return `${base}/realtime`;
}

/**
 * Audio parameters live in one place so a provider requirement change is a
 * single edit rather than a hunt through two client codebases.
 * See docs/REALTIME.md for what must be verified against provider docs.
 */
function audioProfileFor(transport: string) {
  return {
    sampleRateHz: 24_000,
    encoding: 'pcm16' as const,
    channels: 1,
    // 20 ms frames: small enough for low latency, large enough that per-frame
    // overhead does not dominate on a mobile connection.
    chunkMs: transport === 'webrtc' ? 20 : 40,
  };
}

/**
 * Listen mode leans on server-side voice activity detection: nobody is holding
 * a button. Discuss mode is push-to-talk, so detection only needs to decide
 * when a turn has finished — with conservative thresholds, because these
 * conversations happen in bars, corridors and waiting rooms.
 */
function vadProfileFor(kind: SessionKind) {
  if (kind === SessionKind.PERSONAL_DISCUSS) {
    return { mode: 'manual' as const, silenceMs: 900, threshold: 0.6, prefixPaddingMs: 300 };
  }
  return { mode: 'server' as const, silenceMs: 600, threshold: 0.5, prefixPaddingMs: 300 };
}
