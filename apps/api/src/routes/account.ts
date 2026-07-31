import type { FastifyInstance } from 'fastify';
import { DeletionStatus } from '@prisma/client';
import {
  analyticsIngestRequestSchema,
  historyQuerySchema,
  updateMeRequestSchema,
  type DeleteMeResponse,
  type HistoryResponse,
  type MeResponse,
  type UsageResponse,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { AuthService } from '../modules/auth.js';
import { SessionService } from '../modules/sessions.js';
import { UsageService } from '../modules/usage.js';
import { parseOrThrow } from '../plugins/errors.js';

export async function registerAccountRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const auth = new AuthService(context);
  const sessions = new SessionService(context);
  const usage = new UsageService(context);

  app.get('/me', async (request): Promise<MeResponse> => {
    const actor = await app.requireActor(request);
    return auth.describeUser(actor.userId);
  });

  app.patch('/me', async (request): Promise<MeResponse> => {
    const actor = await app.requireActor(request);
    const body = parseOrThrow(updateMeRequestSchema, request.body);

    await context.prisma.user.update({
      where: { id: actor.userId },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.preferredLocale ? { preferredLocale: body.preferredLocale } : {}),
        ...(body.preferredReadingLanguage
          ? { preferredReadingLanguage: body.preferredReadingLanguage }
          : {}),
        ...(body.theme ? { theme: body.theme } : {}),
        ...(body.transcriptFontScale !== undefined
          ? { transcriptFontScale: body.transcriptFontScale }
          : {}),
        ...(body.hapticsEnabled !== undefined ? { hapticsEnabled: body.hapticsEnabled } : {}),
        ...(body.autoSaveTranscripts !== undefined
          ? { autoSaveTranscripts: body.autoSaveTranscripts }
          : {}),
        ...(body.onboardingCompleted !== undefined
          ? { onboardingCompleted: body.onboardingCompleted }
          : {}),
        lastSeenAt: new Date(),
      },
    });

    return auth.describeUser(actor.userId);
  });

  /**
   * Account deletion, initiated by the user from inside the app — a hard
   * requirement of both stores.
   *
   * Saved transcripts and their translations are deleted immediately and
   * irreversibly; the account row is anonymised and scheduled for purge so
   * that in-flight sessions and usage reconciliation cannot fail mid-request.
   */
  app.delete('/me', async (request): Promise<DeleteMeResponse> => {
    const actor = await app.requireActor(request);

    const existing = await context.prisma.deletionRequest.findFirst({
      where: {
        userId: actor.userId,
        status: { in: [DeletionStatus.REQUESTED, DeletionStatus.IN_PROGRESS] },
      },
    });
    if (existing) {
      return {
        status: 'SCHEDULED',
        requestId: existing.id,
        scheduledFor: existing.scheduledFor.toISOString(),
        deletedSessions: 0,
      };
    }

    const scheduledFor = new Date(Date.now() + 60_000);
    const sessionCount = await context.prisma.session.count({
      where: { ownerUserId: actor.userId },
    });

    const deletionRequest = await context.prisma.$transaction(async (tx) => {
      // Content goes now. There is no grace period on a user's own words.
      await tx.session.deleteMany({ where: { ownerUserId: actor.userId } });
      await tx.user.update({
        where: { id: actor.userId },
        data: {
          deletionRequestedAt: new Date(),
          email: null,
          displayName: null,
          externalAuthId: null,
        },
      });
      await tx.entitlement.updateMany({ where: { userId: actor.userId }, data: { active: false } });
      return tx.deletionRequest.create({
        data: {
          userId: actor.userId,
          status: DeletionStatus.REQUESTED,
          scheduledFor,
          deletedSessions: sessionCount,
        },
      });
    });

    context.metrics.increment('account.deletion_requested');
    request.log.info({ requestId: request.id }, 'Account deletion requested');

    return {
      status: 'SCHEDULED',
      requestId: deletionRequest.id,
      scheduledFor: scheduledFor.toISOString(),
      deletedSessions: sessionCount,
    };
  });

  app.get('/history', async (request): Promise<HistoryResponse> => {
    const actor = await app.requireActor(request);
    const query = parseOrThrow(historyQuerySchema, request.query);
    const result = await sessions.history(
      { userId: actor.userId, anonymousHash: actor.anonymousHash },
      {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit,
        ...(query.search ? { search: query.search } : {}),
      },
    );
    return result;
  });

  app.get('/usage', async (request): Promise<UsageResponse> => {
    const actor = await app.requireActor(request);
    return {
      usage: await usage.summary(
        { userId: actor.userId, anonymousHash: actor.anonymousHash },
        actor.plan,
      ),
    };
  });

  /**
   * Product analytics ingestion.
   *
   * The schema has no free-text field, so spoken content cannot reach this
   * endpoint even by accident. Disabled entirely when analytics are off.
   */
  app.post('/analytics', async (request, reply) => {
    if (!context.runtimeConfig.flag('analyticsEnabled') || !context.env.ANALYTICS_ENABLED) {
      return reply.status(204).send();
    }
    const actor = await app.optionalActor(request);
    const body = parseOrThrow(analyticsIngestRequestSchema, request.body);

    await context.prisma.analyticsEvent.createMany({
      data: body.events.map((event) => ({
        name: event.name,
        userId: actor?.userId ?? null,
        anonymousHash: actor?.anonymousHash ?? null,
        platform: event.properties.platform ?? null,
        locale: event.properties.locale ?? null,
        sessionKind: event.properties.sessionKind ?? null,
        participantCount: event.properties.participantCount ?? null,
        targetLanguageCount: event.properties.targetLanguageCount ?? null,
        durationSeconds: event.properties.durationSeconds ?? null,
        plan: event.properties.plan ?? null,
        success: event.properties.success ?? null,
        errorCode: event.properties.errorCode ?? null,
        createdAt: new Date(event.at),
      })),
    });
    return reply.status(204).send();
  });
}
