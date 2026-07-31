import type { FastifyInstance } from 'fastify';
import {
  appendSegmentRequestSchema,
  createSessionRequestSchema,
  endSessionRequestSchema,
  exportQuerySchema,
  renameSessionRequestSchema,
  saveSessionRequestSchema,
  segmentsQuerySchema,
  type SegmentsResponse,
  type SessionResponse,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { SessionService } from '../modules/sessions.js';
import { TranscriptService } from '../modules/transcripts.js';
import { parseOrThrow } from '../plugins/errors.js';

export async function registerSessionRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const sessions = new SessionService(context);
  const transcripts = new TranscriptService(context);

  app.post('/sessions', async (request, reply): Promise<SessionResponse> => {
    const actor = await app.requireActor(request);
    const body = parseOrThrow(createSessionRequestSchema, request.body);
    const session = await sessions.create(
      body,
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      actor.plan,
    );
    void reply.status(201);
    return { session };
  });

  app.get('/sessions/:id', async (request): Promise<SessionResponse> => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    await sessions.requireOwnership(id, {
      userId: actor.userId,
      anonymousHash: actor.anonymousHash,
    });
    return { session: await sessions.get(id) };
  });

  app.post('/sessions/:id/end', async (request): Promise<SessionResponse> => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(endSessionRequestSchema, request.body ?? {});
    const session = await sessions.end(
      id,
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      body.reportedAudioSeconds !== undefined
        ? { reportedAudioSeconds: body.reportedAudioSeconds }
        : {},
    );
    return { session };
  });

  /**
   * The explicit save. `confirmed: true` is required by the schema so a save
   * can never be the accidental result of a default-valued request body.
   */
  app.post('/sessions/:id/save', async (request): Promise<SessionResponse> => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(saveSessionRequestSchema, request.body);
    const session = await sessions.save(
      id,
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      body.title,
    );
    return { session };
  });

  app.patch('/sessions/:id', async (request): Promise<SessionResponse> => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(renameSessionRequestSchema, request.body);
    const session = await sessions.rename(
      id,
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      body.title,
    );
    return { session };
  });

  app.delete('/sessions/:id', async (request, reply) => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    await sessions.remove(id, { userId: actor.userId, anonymousHash: actor.anonymousHash });
    return reply.status(204).send();
  });

  /**
   * REST fallback for appending a segment.
   *
   * The realtime socket is the normal path; this exists for clients recovering
   * from a dropped socket that still hold a finalised utterance to flush.
   * `clientSegmentId` makes the retry idempotent.
   */
  app.post('/sessions/:id/segments', async (request, reply) => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(appendSegmentRequestSchema, request.body);

    await sessions.requireOwnership(id, {
      userId: actor.userId,
      anonymousHash: actor.anonymousHash,
    });

    const segment = await transcripts.appendFinalSegment({
      sessionId: id,
      speakerSlotId: body.speakerSlotId ?? null,
      sourceLanguage: body.sourceLanguage ?? null,
      originalText: body.originalText,
      startedAtMs: body.startedAtMs ?? null,
      endedAtMs: body.endedAtMs ?? null,
      clientSegmentId: body.clientSegmentId ?? null,
      actor: { userId: actor.userId, anonymousHash: actor.anonymousHash },
    });

    context.hub.broadcast(id, { type: 'transcript.final', segment });
    void reply.status(201);
    return { segment };
  });

  app.get('/sessions/:id/segments', async (request): Promise<SegmentsResponse> => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const query = parseOrThrow(segmentsQuerySchema, request.query);

    await sessions.requireOwnership(id, {
      userId: actor.userId,
      anonymousHash: actor.anonymousHash,
    });

    return transcripts.listSegments({
      sessionId: id,
      ...(query.afterSequence !== undefined ? { afterSequence: query.afterSequence } : {}),
      limit: query.limit,
      ...(query.language ? { language: query.language } : {}),
    });
  });

  app.get('/sessions/:id/export', async (request, reply) => {
    const actor = await app.requireActor(request);
    const { id } = request.params as { id: string };
    const query = parseOrThrow(exportQuerySchema, request.query);

    const text = await sessions.exportText(
      id,
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      query.language ?? 'original',
    );

    if (query.format === 'json') {
      const segments = await transcripts.listSegments({
        sessionId: id,
        limit: 500,
        ...(query.language ? { language: query.language } : {}),
      });
      return reply.header('content-type', 'application/json').send(segments);
    }

    return reply
      .header('content-type', query.format === 'md' ? 'text/markdown' : 'text/plain')
      .header('content-disposition', `attachment; filename="lingolive-${id}.${query.format}"`)
      .send(query.format === 'md' ? `# LingoLive transcript\n\n${text}\n` : text);
  });
}
