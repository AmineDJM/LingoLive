import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionStatus } from '@prisma/client';
import { LingoLiveError } from '@lingolive/contracts';
import { MOCK_SCRIPTS } from '@lingolive/realtime-core';
import type { AppContext } from '../context.js';
import { BusinessService } from '../modules/business.js';
import { TranscriptService } from '../modules/transcripts.js';
import { parseOrThrow } from '../plugins/errors.js';

/**
 * Internal LingoBusiness organizer simulator.
 *
 * The organizer dashboard is out of scope for this build, but the participant
 * experience has to be testable end to end — you cannot verify "join a live
 * conference and read it in Arabic" without something producing the speech.
 *
 * These routes are mounted **only** when `ENABLE_DEV_SIMULATOR=true`, which
 * the configuration schema rejects outright in staging and production. The
 * guard below is a second, independent check.
 */
export async function registerDevRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  if (context.derived.isStagingOrProduction) {
    throw new Error('The development simulator must never be mounted outside development');
  }

  const business = new BusinessService(context);
  const transcripts = new TranscriptService(context);

  app.addHook('onRequest', async () => {
    if (context.derived.isStagingOrProduction) {
      throw new LingoLiveError('NOT_FOUND', 'Not found');
    }
  });

  const createSchema = z.object({
    title: z.string().default('LingoLive demo session'),
    organizerName: z.string().default('LingoLive'),
    sourceLanguage: z.string().default('fr'),
    targetLanguages: z.array(z.string()).default(['en', 'ar', 'pt-BR']),
    maxParticipants: z.number().int().positive().optional(),
    expiresInHours: z.number().int().min(1).max(24).default(4),
  });

  /** Creates a broadcast room and returns its code, join URL and QR payload. */
  app.post('/dev/business/sessions', async (request, reply) => {
    const body = parseOrThrow(createSchema, request.body ?? {});
    const created = await business.createSession({
      title: body.title,
      organizerName: body.organizerName,
      sourceLanguage: body.sourceLanguage,
      targetLanguages: body.targetLanguages,
      ...(body.maxParticipants !== undefined ? { maxParticipants: body.maxParticipants } : {}),
      expiresInHours: body.expiresInHours,
      createdByUserId: null,
    });
    await context.prisma.session.update({
      where: { id: created.sessionId },
      data: { status: SessionStatus.LIVE },
    });
    void reply.status(201);
    return created;
  });

  const speakSchema = z.object({
    sessionId: z.string(),
    /** Explicit text, or a fixture script language to draw a line from. */
    text: z.string().max(2000).optional(),
    language: z.string().default('fr'),
    /** Emit N lines from the fixture script. */
    count: z.number().int().min(1).max(20).default(1),
  });

  /**
   * Simulates the organizer speaking: persists final segments, translates them
   * into the languages the room's viewers are actually reading, and fans the
   * results out — exactly the path real audio would take.
   */
  app.post('/dev/business/speak', async (request) => {
    const body = parseOrThrow(speakSchema, request.body);
    const session = await context.prisma.session.findUnique({ where: { id: body.sessionId } });
    if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');

    const script = MOCK_SCRIPTS[body.language] ?? MOCK_SCRIPTS.en!;
    const lines = body.text
      ? [body.text]
      : Array.from(
          { length: body.count },
          (_, index) => script.sentences[index % script.sentences.length]!,
        );

    const targets = await business.activeTargetLanguages(body.sessionId);
    const produced: Array<{ sequence: number; translations: number }> = [];

    for (const line of lines) {
      const segment = await transcripts.appendFinalSegment({
        sessionId: body.sessionId,
        sourceLanguage: body.language,
        originalText: line,
        actor: { userId: null, anonymousHash: null },
      });
      context.hub.broadcast(body.sessionId, { type: 'transcript.final', segment });

      const translations = await transcripts.translateSegment({
        segmentId: segment.id,
        sessionId: body.sessionId,
        text: segment.originalText,
        sourceLanguage: body.language,
        targetLanguages: targets,
        actor: { userId: null, anonymousHash: null },
      });
      for (const translation of translations) {
        context.hub.broadcastToLanguage(body.sessionId, translation.targetLanguage, {
          type: 'translation.final',
          translation,
        });
      }
      produced.push({ sequence: segment.sequence, translations: translations.length });
    }

    return {
      produced,
      activeLanguages: targets,
      viewers: context.hub.connectionsFor(body.sessionId).length,
      // The whole point of the fan-out design, made visible.
      translationsPerformed: produced.reduce((sum, p) => sum + p.translations, 0),
    };
  });

  app.post('/dev/business/sessions/:id/end', async (request) => {
    const { id } = request.params as { id: string };
    const endedAt = new Date();
    const session = await context.prisma.session.update({
      where: { id },
      data: { status: SessionStatus.ENDED, endedAt },
    });
    context.hub.closeRoom(id, {
      type: 'session.ended',
      sessionId: id,
      durationSeconds: Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      reason: 'ORGANIZER_ENDED',
    });
    return { ok: true };
  });

  /** Everything the simulator UI needs to show room state. */
  app.get('/dev/business/sessions/:id', async (request) => {
    const { id } = request.params as { id: string };
    const session = await context.prisma.session.findUnique({
      where: { id },
      include: {
        slots: true,
        accessCodes: true,
        participants: { where: { leftAt: null } },
        _count: { select: { segments: true } },
      },
    });
    if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');

    return {
      id: session.id,
      title: session.title,
      status: session.status,
      segments: session._count.segments,
      participants: session.participants.length,
      connected: context.hub.connectionsFor(id).length,
      activeLanguages: await business.activeTargetLanguages(id),
      expiresAt: session.accessCodes[0]?.expiresAt ?? null,
    };
  });
}
