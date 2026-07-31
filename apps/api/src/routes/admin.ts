import type { FastifyInstance } from 'fastify';
import {
  AdminAuditAction,
  DeletionStatus,
  Plan,
  SessionKind,
  SessionStatus,
  UsageMetric,
  type Prisma,
} from '@prisma/client';
import {
  adminAuditQuerySchema,
  adminCreateBusinessSessionRequestSchema,
  adminEndSessionRequestSchema,
  adminRevealTranscriptRequestSchema,
  adminSessionListQuerySchema,
  adminUpdateConfigRequestSchema,
  adminUpdateUserRequestSchema,
  adminUsageQuerySchema,
  adminUserListQuerySchema,
  LingoLiveError,
  resolveLocale,
  type AdminMetricsResponse,
  type AdminOverview,
  type AdminRealtimeResponse,
  type AdminSessionDetail,
  type AdminUsageResponse,
  type AdminUserDetail,
} from '@lingolive/contracts';
import { maskEmail } from '@lingolive/logging';
import type { AppContext } from '../context.js';
import { BusinessService } from '../modules/business.js';
import { UsageService } from '../modules/usage.js';
import { resolvePlan } from '../modules/auth.js';
import { EventLoopMonitor } from '../modules/metrics.js';
import { parseOrThrow } from '../plugins/errors.js';

/**
 * The operator console API.
 *
 * Design per ADR 0010: an operator can see and act on **everything about the
 * system**. The single gated resource is the *content* of what a user said,
 * which requires a separate permission, a written reason and an immutable
 * audit entry.
 */

const eventLoop = new EventLoopMonitor();
eventLoop.start();

export async function registerAdminRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const usage = new UsageService(context);
  const business = new BusinessService(context);

  const audit = async (input: {
    actorUserId: string;
    actorEmail?: string | null;
    action: AdminAuditAction;
    targetType: string;
    targetId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    requestId: string;
  }): Promise<void> => {
    await context.prisma.adminAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason ?? null,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
        requestId: input.requestId,
      },
    });
  };

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  app.get('/admin/overview', async (request): Promise<AdminOverview> => {
    await app.requireAdmin(request);

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const connections = context.hub.allConnections();

    const [
      liveSessions,
      sessionsToday,
      audioToday,
      segmentsToday,
      translationsToday,
      newUsersToday,
      errorsToday,
      totals,
      costToday,
    ] = await Promise.all([
      context.prisma.session.groupBy({
        by: ['kind'],
        _count: true,
        where: { status: { in: [SessionStatus.LIVE, SessionStatus.PAUSED] } },
      }),
      context.prisma.session.count({ where: { startedAt: { gte: dayStart } } }),
      context.prisma.usageLedger.aggregate({
        _sum: { quantity: true },
        where: { metric: UsageMetric.AUDIO_SECONDS, createdAt: { gte: dayStart } },
      }),
      context.prisma.transcriptSegment.count({ where: { createdAt: { gte: dayStart } } }),
      context.prisma.translation.count({ where: { createdAt: { gte: dayStart } } }),
      context.prisma.user.count({ where: { createdAt: { gte: dayStart } } }),
      context.prisma.errorEvent.count({ where: { createdAt: { gte: dayStart } } }),
      Promise.all([
        context.prisma.user.count({ where: { deletedAt: null } }),
        context.prisma.user.count({ where: { isGuest: true, deletedAt: null } }),
        context.prisma.device.count(),
        context.prisma.session.count(),
        context.prisma.session.count({ where: { saveRequested: true } }),
        context.prisma.transcriptSegment.count(),
        context.prisma.translation.count(),
        context.prisma.entitlement.count({ where: { plan: Plan.PRO, active: true } }),
      ]),
      context.prisma.usageLedger.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { createdAt: { gte: dayStart } },
      }),
    ]);

    const uniqueUsersToday = await context.prisma.session.findMany({
      where: { startedAt: { gte: dayStart } },
      select: { ownerUserId: true, anonymousOwnerHash: true },
      distinct: ['ownerUserId', 'anonymousOwnerHash'],
    });

    const countFor = (kind: SessionKind) =>
      liveSessions.find((row) => row.kind === kind)?._count ?? 0;

    const [database, redis] = await Promise.all([checkDatabase(context), checkRedis(context)]);
    const memory = process.memoryUsage();

    return {
      generatedAt: now.toISOString(),
      live: {
        activeSessions: liveSessions.reduce((sum, row) => sum + row._count, 0),
        activeListenSessions: countFor(SessionKind.PERSONAL_LISTEN),
        activeDiscussSessions: countFor(SessionKind.PERSONAL_DISCUSS),
        activeBroadcastSessions: countFor(SessionKind.BUSINESS_BROADCAST),
        connectedClients: connections.length,
        businessViewers: connections.filter((c) => c.role === 'VIEWER').length,
        speakingNow: connections.filter((c) => c.role !== 'VIEWER').length,
      },
      today: {
        sessionsStarted: sessionsToday,
        audioMinutes: Math.round(((audioToday._sum.quantity ?? 0) / 60) * 100) / 100,
        segments: segmentsToday,
        translations: translationsToday,
        uniqueUsers: uniqueUsersToday.length,
        newUsers: newUsersToday,
        estimatedCostUsd: Math.round((costToday._sum.estimatedCostUsd ?? 0) * 10_000) / 10_000,
        errors: errorsToday,
      },
      totals: {
        users: totals[0],
        guests: totals[1],
        devices: totals[2],
        sessions: totals[3],
        savedSessions: totals[4],
        segments: totals[5],
        translations: totals[6],
        proSubscribers: totals[7],
      },
      health: {
        database,
        redis,
        aiProvider:
          context.ai.providerName === 'mock'
            ? 'mock'
            : context.ai.transcription.available
              ? 'ok'
              : 'not_configured',
        worker: await workerHealth(context),
        costCircuitBreaker: (await usage.isCostCircuitOpen()) ? 'open' : 'closed',
      },
      process: {
        version: context.version,
        environment: context.env.APP_ENV,
        uptimeSeconds: Math.round((Date.now() - context.startedAt.getTime()) / 1000),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        eventLoopDelayP99Ms: eventLoop.p99DelayMs(),
        nodeVersion: process.version,
      },
    };
  });

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  app.get('/admin/users', async (request) => {
    await app.requireAdmin(request);
    const query = parseOrThrow(adminUserListQuerySchema, request.query);

    const where: Prisma.UserWhereInput = {
      ...(query.plan ? { entitlements: { some: { plan: query.plan, active: true } } } : {}),
      ...(query.isGuest !== undefined ? { isGuest: query.isGuest } : {}),
      ...(query.isAdmin !== undefined ? { isAdmin: query.isAdmin } : {}),
      ...(query.deleted !== undefined
        ? query.deleted
          ? { deletedAt: { not: null } }
          : { deletedAt: null }
        : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { id: query.search },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      context.prisma.user.findMany({
        where,
        orderBy:
          query.sort === 'lastSeenAt'
            ? { lastSeenAt: query.direction }
            : { createdAt: query.direction },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          entitlements: { where: { active: true } },
          _count: { select: { sessions: true, devices: true } },
        },
      }),
      context.prisma.user.count({ where }),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const usageByUser = await context.prisma.usageLedger.groupBy({
      by: ['userId'],
      _sum: { quantity: true, estimatedCostUsd: true },
      where: { userId: { in: page.map((u) => u.id) }, metric: UsageMetric.AUDIO_SECONDS },
    });

    return {
      items: page.map((user) => {
        const stats = usageByUser.find((row) => row.userId === user.id);
        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          isGuest: user.isGuest,
          isAdmin: user.isAdmin,
          plan: resolvePlan(user.entitlements),
          preferredLocale: resolveLocale(user.preferredLocale),
          preferredReadingLanguage: user.preferredReadingLanguage,
          createdAt: user.createdAt.toISOString(),
          lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
          deletedAt: user.deletedAt?.toISOString() ?? null,
          deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
          suspendedAt: user.suspendedAt?.toISOString() ?? null,
          sessionCount: user._count.sessions,
          audioSeconds: stats?._sum.quantity ?? 0,
          deviceCount: user._count.devices,
          estimatedCostUsd: stats?._sum.estimatedCostUsd ?? 0,
        };
      }),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  });

  app.get('/admin/users/:id', async (request): Promise<AdminUserDetail> => {
    await app.requireAdmin(request);
    const { id } = request.params as { id: string };

    const user = await context.prisma.user.findUnique({
      where: { id },
      include: {
        entitlements: { orderBy: { createdAt: 'desc' } },
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 50 },
        sessions: {
          orderBy: { startedAt: 'desc' },
          take: 25,
          include: { _count: { select: { segments: true } } },
        },
        _count: { select: { sessions: true, devices: true } },
      },
    });
    if (!user) throw new LingoLiveError('NOT_FOUND', 'User not found');

    const [usageRows, audioTotal, monthly] = await Promise.all([
      context.prisma.usageLedger.groupBy({
        by: ['metric', 'provider', 'model'],
        _sum: { quantity: true },
        where: { userId: id },
      }),
      context.prisma.usageLedger.aggregate({
        _sum: { quantity: true, estimatedCostUsd: true },
        where: { userId: id, metric: UsageMetric.AUDIO_SECONDS },
      }),
      context.prisma.$queryRaw<Array<{ month: string; audio_seconds: number; sessions: bigint }>>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
               COALESCE(SUM(CASE WHEN metric = 'AUDIO_SECONDS' THEN quantity ELSE 0 END), 0) AS audio_seconds,
               COUNT(DISTINCT CASE WHEN metric = 'SESSION_STARTED' THEN "sessionId" END) AS sessions
        FROM usage_ledger
        WHERE "userId" = ${id}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      `,
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isGuest: user.isGuest,
        isAdmin: user.isAdmin,
        plan: resolvePlan(user.entitlements),
        preferredLocale: resolveLocale(user.preferredLocale),
        preferredReadingLanguage: user.preferredReadingLanguage,
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        deletedAt: user.deletedAt?.toISOString() ?? null,
        deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
        suspendedAt: user.suspendedAt?.toISOString() ?? null,
        sessionCount: user._count.sessions,
        audioSeconds: audioTotal._sum.quantity ?? 0,
        deviceCount: user._count.devices,
        estimatedCostUsd: audioTotal._sum.estimatedCostUsd ?? 0,
      },
      devices: user.devices.map((device) => ({
        id: device.id,
        platform: device.platform,
        appVersion: device.appVersion,
        // Never the full hash: enough to correlate two rows, not to reverse.
        anonymousIdPreview: `${device.anonymousIdHash.slice(0, 8)}…`,
        locale: device.locale,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt.toISOString(),
      })),
      entitlements: user.entitlements.map((entitlement) => ({
        id: entitlement.id,
        plan: entitlement.plan,
        source: entitlement.source,
        active: entitlement.active,
        expiresAt: entitlement.expiresAt?.toISOString() ?? null,
        createdAt: entitlement.createdAt.toISOString(),
      })),
      usageByMetric: usageRows.map((row) => ({
        metric: row.metric,
        quantity: row._sum.quantity ?? 0,
        provider: row.provider,
        model: row.model,
      })),
      recentSessions: user.sessions.map((session) => ({
        id: session.id,
        kind: session.kind,
        status: session.status,
        title: session.title,
        startedAt: session.startedAt.toISOString(),
        durationSeconds: session.durationSeconds,
        segmentCount: session._count.segments,
        saved: session.saveRequested,
      })),
      monthlyUsage: monthly.map((row) => ({
        month: row.month,
        audioSeconds: Number(row.audio_seconds),
        sessions: Number(row.sessions),
      })),
    };
  });

  app.patch('/admin/users/:id', async (request) => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(adminUpdateUserRequestSchema, request.body);

    const target = await context.prisma.user.findUnique({ where: { id } });
    if (!target) throw new LingoLiveError('NOT_FOUND', 'User not found');

    if (body.plan) {
      await context.prisma.entitlement.updateMany({
        where: { userId: id, active: true },
        data: { active: false },
      });
      await context.prisma.entitlement.create({
        data: {
          userId: id,
          plan: body.plan,
          source: 'MANUAL',
          active: true,
          expiresAt: body.planExpiresAt ? new Date(body.planExpiresAt) : null,
        },
      });
      await audit({
        actorUserId: admin.userId,
        action: AdminAuditAction.PLAN_CHANGED,
        targetType: 'user',
        targetId: id,
        reason: body.reason,
        metadata: { plan: body.plan },
        requestId: request.id,
      });
    }

    if (
      body.suspended !== undefined ||
      body.isAdmin !== undefined ||
      body.displayName !== undefined
    ) {
      await context.prisma.user.update({
        where: { id },
        data: {
          ...(body.suspended !== undefined
            ? { suspendedAt: body.suspended ? new Date() : null }
            : {}),
          ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        },
      });
      await audit({
        actorUserId: admin.userId,
        action:
          body.suspended === true
            ? AdminAuditAction.USER_SUSPENDED
            : body.suspended === false
              ? AdminAuditAction.USER_UNSUSPENDED
              : AdminAuditAction.USER_UPDATED,
        targetType: 'user',
        targetId: id,
        reason: body.reason,
        metadata: { isAdmin: body.isAdmin, suspended: body.suspended },
        requestId: request.id,
      });
    }

    return { ok: true };
  });

  app.delete('/admin/users/:id', async (request) => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    const reason = (request.query as { reason?: string }).reason ?? 'operator request';

    const sessionCount = await context.prisma.session.count({ where: { ownerUserId: id } });
    await context.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { ownerUserId: id } });
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          email: null,
          displayName: null,
          externalAuthId: null,
        },
      });
      await tx.deletionRequest.create({
        data: {
          userId: id,
          status: DeletionStatus.COMPLETED,
          scheduledFor: new Date(),
          completedAt: new Date(),
          deletedSessions: sessionCount,
        },
      });
    });

    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.USER_DELETED,
      targetType: 'user',
      targetId: id,
      reason,
      metadata: { deletedSessions: sessionCount },
      requestId: request.id,
    });

    return { ok: true, deletedSessions: sessionCount };
  });

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  app.get('/admin/sessions', async (request) => {
    await app.requireAdmin(request);
    const query = parseOrThrow(adminSessionListQuerySchema, request.query);

    const where: Prisma.SessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.userId ? { ownerUserId: query.userId } : {}),
      ...(query.liveOnly ? { status: { in: [SessionStatus.LIVE, SessionStatus.PAUSED] } } : {}),
      ...(query.since ? { startedAt: { gte: new Date(query.since) } } : {}),
    };

    const [rows, total] = await Promise.all([
      context.prisma.session.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          owner: { select: { email: true } },
          slots: true,
          _count: { select: { segments: true, participants: true } },
        },
      }),
      context.prisma.session.count({ where }),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const [translationCounts, costs] = await Promise.all([
      context.prisma.translation.groupBy({
        by: ['segmentId'],
        _count: true,
        where: { segment: { sessionId: { in: page.map((s) => s.id) } } },
      }),
      context.prisma.usageLedger.groupBy({
        by: ['sessionId'],
        _sum: { estimatedCostUsd: true },
        where: { sessionId: { in: page.map((s) => s.id) } },
      }),
    ]);

    return {
      items: page.map((session) => ({
        id: session.id,
        kind: session.kind,
        status: session.status,
        title: session.title,
        ownerUserId: session.ownerUserId,
        ownerEmail: maskEmail(session.owner?.email ?? null),
        anonymousOwnerPreview: session.anonymousOwnerHash
          ? `${session.anonymousOwnerHash.slice(0, 8)}…`
          : null,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        durationSeconds: session.durationSeconds,
        segmentCount: session._count.segments,
        translationCount: translationCounts.length,
        participantCount: session._count.participants,
        connectedNow: context.hub.connectionsFor(session.id).length,
        languages: [...new Set(session.slots.map((slot) => slot.readingLanguage))],
        saved: session.saveRequested,
        estimatedCostUsd: costs.find((c) => c.sessionId === session.id)?._sum.estimatedCostUsd ?? 0,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  });

  /**
   * Session detail.
   *
   * Segment *metadata* is always visible — sequence, language, length, timing,
   * which languages it was translated into. That answers almost every real
   * support question. Text is null unless explicitly revealed below.
   */
  app.get('/admin/sessions/:id', async (request): Promise<AdminSessionDetail> => {
    await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    return buildSessionDetail(context, id, false);
  });

  /**
   * The one gated action in the whole admin surface.
   * Requires a written reason and writes an immutable audit entry.
   */
  app.post('/admin/sessions/:id/reveal', async (request): Promise<AdminSessionDetail> => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(adminRevealTranscriptRequestSchema, request.body);

    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.TRANSCRIPT_REVEALED,
      targetType: 'session',
      targetId: id,
      reason: body.reason,
      requestId: request.id,
    });
    context.metrics.increment('admin.transcript_revealed');
    request.log.warn(
      { sessionId: id, actor: admin.userId },
      'Transcript content revealed to an operator',
    );

    return buildSessionDetail(context, id, true);
  });

  app.post('/admin/sessions/:id/end', async (request) => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseOrThrow(adminEndSessionRequestSchema, request.body);

    const session = await context.prisma.session.findUnique({ where: { id } });
    if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');

    const endedAt = new Date();
    await context.prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.ENDED,
        endedAt,
        durationSeconds: Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      },
    });
    context.hub.closeRoom(id, {
      type: 'session.ended',
      sessionId: id,
      durationSeconds: Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      reason: 'ORGANIZER_ENDED',
    });

    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.SESSION_ENDED,
      targetType: 'session',
      targetId: id,
      reason: body.reason,
      requestId: request.id,
    });

    return { ok: true };
  });

  app.delete('/admin/sessions/:id', async (request) => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    await context.prisma.session.delete({ where: { id } });
    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.SESSION_DELETED,
      targetType: 'session',
      targetId: id,
      requestId: request.id,
    });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Cost and usage
  // -------------------------------------------------------------------------

  app.get('/admin/usage', async (request): Promise<AdminUsageResponse> => {
    await app.requireAdmin(request);
    const query = parseOrThrow(adminUsageQuerySchema, request.query);

    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date();
    const truncUnit = query.granularity;

    const buckets = await context.prisma.$queryRaw<
      Array<{
        bucket: Date;
        audio_seconds: number;
        translation_requests: number;
        translation_characters: number;
        input_tokens: number;
        output_tokens: number;
        sessions: bigint;
        cost: number;
      }>
    >`
      SELECT date_trunc(${truncUnit}, "createdAt") AS bucket,
             COALESCE(SUM(CASE WHEN metric = 'AUDIO_SECONDS' THEN quantity ELSE 0 END), 0) AS audio_seconds,
             COALESCE(SUM(CASE WHEN metric = 'TRANSLATION_REQUESTS' THEN quantity ELSE 0 END), 0) AS translation_requests,
             COALESCE(SUM(CASE WHEN metric = 'TRANSLATION_CHARACTERS' THEN quantity ELSE 0 END), 0) AS translation_characters,
             COALESCE(SUM(CASE WHEN metric = 'INPUT_TOKENS' THEN quantity ELSE 0 END), 0) AS input_tokens,
             COALESCE(SUM(CASE WHEN metric = 'OUTPUT_TOKENS' THEN quantity ELSE 0 END), 0) AS output_tokens,
             COUNT(DISTINCT CASE WHEN metric = 'SESSION_STARTED' THEN "sessionId" END) AS sessions,
             COALESCE(SUM("estimatedCostUsd"), 0) AS cost
      FROM usage_ledger
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const [byModel, byLanguage, spend] = await Promise.all([
      context.prisma.usageLedger.groupBy({
        by: ['provider', 'model', 'metric'],
        _sum: { quantity: true, estimatedCostUsd: true },
        where: { createdAt: { gte: from, lte: to } },
      }),
      context.prisma.translation.groupBy({
        by: ['targetLanguage'],
        _count: true,
        where: { createdAt: { gte: from, lte: to } },
      }),
      usage.spend(),
    ]);

    return {
      buckets: buckets.map((row) => ({
        bucket: row.bucket.toISOString(),
        audioSeconds: Number(row.audio_seconds),
        translationRequests: Math.round(Number(row.translation_requests)),
        translationCharacters: Math.round(Number(row.translation_characters)),
        inputTokens: Math.round(Number(row.input_tokens)),
        outputTokens: Math.round(Number(row.output_tokens)),
        sessions: Number(row.sessions),
        estimatedCostUsd: Math.round(Number(row.cost) * 10_000) / 10_000,
      })),
      byModel: byModel.map((row) => ({
        provider: row.provider,
        model: row.model ?? 'unknown',
        quantity: row._sum.quantity ?? 0,
        metric: row.metric,
        estimatedCostUsd: row._sum.estimatedCostUsd ?? 0,
      })),
      byLanguage: byLanguage.map((row) => ({
        language: row.targetLanguage,
        translations: row._count,
      })),
      limits: {
        dailyLimitUsd: context.runtimeConfig.number('DAILY_COST_LIMIT_USD'),
        monthlyLimitUsd: context.runtimeConfig.number('MONTHLY_COST_LIMIT_USD'),
        spentTodayUsd: Math.round(spend.today * 10_000) / 10_000,
        spentThisMonthUsd: Math.round(spend.month * 10_000) / 10_000,
        circuitBreakerOpen: await usage.isCostCircuitOpen(),
      },
    };
  });

  // -------------------------------------------------------------------------
  // Realtime, metrics, configuration
  // -------------------------------------------------------------------------

  app.get('/admin/realtime', async (request): Promise<AdminRealtimeResponse> => {
    await app.requireAdmin(request);
    const connections = context.hub.allConnections();
    const rooms = context.hub.rooms();

    const kinds = await context.prisma.session.findMany({
      where: { id: { in: rooms.map((room) => room.sessionId) } },
      select: { id: true, kind: true },
    });

    return {
      connections: connections.map((connection) => ({
        connectionId: connection.id,
        sessionId: connection.sessionId,
        participantId: connection.participantId,
        role: connection.role,
        targetLanguage: connection.targetLanguage,
        connectedAt: connection.connectedAt.toISOString(),
        lastHeartbeatAt: connection.lastHeartbeatAt.toISOString(),
        lastSequenceSent: connection.lastSequenceSent,
        messagesSent: connection.messagesSent,
        messagesReceived: connection.messagesReceived,
        networkPrefix: connection.networkPrefix,
      })),
      rooms: rooms.map((room) => ({
        sessionId: room.sessionId,
        kind: kinds.find((k) => k.id === room.sessionId)?.kind ?? SessionKind.PERSONAL_LISTEN,
        subscribers: room.subscribers,
        activeLanguages: room.activeLanguages,
        // Viewers served per translation performed — the number that proves
        // the fan-out design is working.
        fanOutRatio:
          room.activeLanguages.length > 0
            ? Math.round((room.subscribers / room.activeLanguages.length) * 100) / 100
            : room.subscribers,
        lastSequence: room.lastSequence,
      })),
      totals: {
        connections: connections.length,
        rooms: rooms.length,
        messagesPerMinute: 0,
      },
    };
  });

  app.get('/admin/metrics', async (request): Promise<AdminMetricsResponse> => {
    await app.requireAdmin(request);
    const recentErrors = await context.prisma.errorEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      latency: context.metrics.latencySnapshot(),
      counters: context.metrics.counterSnapshot(),
      http: context.metrics.httpSnapshot(),
      recentErrors: recentErrors.map((row) => ({
        at: row.createdAt.toISOString(),
        requestId: row.requestId,
        code: row.code,
        route: row.route,
        message: row.message,
        count: row.count,
      })),
    };
  });

  app.get('/admin/config', async (request) => {
    await app.requireAdmin(request);
    return {
      runtime: context.runtimeConfig.effectiveConfig(),
      overrides: context.runtimeConfig.allOverrides(),
      featureFlags: context.runtimeConfig.allFlags(),
    };
  });

  app.patch('/admin/config', async (request) => {
    const admin = await app.requireAdmin(request);
    const body = parseOrThrow(adminUpdateConfigRequestSchema, request.body);

    try {
      await context.runtimeConfig.setOverride(body.key, body.value, admin.userId, body.reason);
    } catch (error) {
      throw new LingoLiveError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Invalid configuration key',
      );
    }

    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.CONFIG_OVERRIDDEN,
      targetType: 'config',
      targetId: body.key,
      reason: body.reason,
      metadata: { value: body.value },
      requestId: request.id,
    });

    return {
      runtime: context.runtimeConfig.effectiveConfig(),
      overrides: context.runtimeConfig.allOverrides(),
      featureFlags: context.runtimeConfig.allFlags(),
    };
  });

  // -------------------------------------------------------------------------
  // Business rooms
  // -------------------------------------------------------------------------

  app.post('/admin/business/sessions', async (request, reply) => {
    const admin = await app.requireAdmin(request);
    const body = parseOrThrow(adminCreateBusinessSessionRequestSchema, request.body);

    const created = await business.createSession({
      title: body.title,
      organizerName: body.organizerName,
      sourceLanguage: body.sourceLanguage,
      targetLanguages: body.targetLanguages,
      ...(body.maxParticipants !== undefined ? { maxParticipants: body.maxParticipants } : {}),
      expiresInHours: body.expiresInHours,
      createdByUserId: admin.userId,
    });
    await context.prisma.session.update({
      where: { id: created.sessionId },
      data: { status: SessionStatus.LIVE },
    });

    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.BUSINESS_SESSION_CREATED,
      targetType: 'session',
      targetId: created.sessionId,
      metadata: { title: body.title, languages: body.targetLanguages.length },
      requestId: request.id,
    });

    void reply.status(201);
    return {
      sessionId: created.sessionId,
      code: created.code,
      joinUrl: created.joinUrl,
      deepLink: created.deepLink,
      organizerToken: created.organizerToken,
      realtimeUrl: context.env.API_BASE_URL.replace(/^http/, 'ws') + '/realtime',
      expiresAt: created.expiresAt.toISOString(),
    };
  });

  app.get('/admin/business/codes', async (request) => {
    await app.requireAdmin(request);
    const codes = await context.prisma.businessAccessCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { session: { select: { title: true } } },
    });
    return {
      items: codes.map((code) => ({
        id: code.id,
        sessionId: code.sessionId,
        sessionTitle: code.session.title,
        active: code.active && !code.revokedAt,
        expiresAt: code.expiresAt.toISOString(),
        maxParticipants: code.maxParticipants,
        usedCount: code.usedCount,
        createdAt: code.createdAt.toISOString(),
      })),
    };
  });

  app.post('/admin/business/codes/:id/revoke', async (request) => {
    const admin = await app.requireAdmin(request);
    const { id } = request.params as { id: string };
    await business.revokeCode(id);
    await audit({
      actorUserId: admin.userId,
      action: AdminAuditAction.ACCESS_CODE_REVOKED,
      targetType: 'access_code',
      targetId: id,
      requestId: request.id,
    });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Audit trail and analytics
  // -------------------------------------------------------------------------

  app.get('/admin/audit', async (request) => {
    await app.requireAdmin(request);
    const query = parseOrThrow(adminAuditQuerySchema, request.query);

    const rows = await context.prisma.adminAuditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: page.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString(),
        actorUserId: row.actorUserId,
        actorEmail: maskEmail(row.actorEmail),
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        requestId: row.requestId,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  });

  app.get('/admin/analytics', async (request) => {
    await app.requireAdmin(request);
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [events, byDay] = await Promise.all([
      context.prisma.analyticsEvent.groupBy({
        by: ['name'],
        _count: true,
        where: { createdAt: { gte: since } },
      }),
      context.prisma.$queryRaw<Array<{ day: string; name: string; count: bigint }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, name, COUNT(*) AS count
        FROM analytics_events
        WHERE "createdAt" >= ${since}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
    ]);

    const counts = new Map(events.map((row) => [row.name, row._count]));
    const funnelSteps = [
      'onboarding_completed',
      'listen_started',
      'listen_ended',
      'transcript_saved',
      'paywall_viewed',
      'subscription_started',
    ];

    const dayMap = new Map<string, Record<string, number>>();
    for (const row of byDay) {
      const entry = dayMap.get(row.day) ?? {};
      entry[row.name] = Number(row.count);
      dayMap.set(row.day, entry);
    }

    return {
      events: events.map((row) => ({
        name: row.name,
        count: row._count,
        uniqueActors: row._count,
      })),
      funnel: funnelSteps.map((step) => ({ step, count: counts.get(step) ?? 0 })),
      byDay: [...dayMap.entries()].map(([day, countsForDay]) => ({ day, counts: countsForDay })),
    };
  });
}

// ---------------------------------------------------------------------------

async function buildSessionDetail(
  context: AppContext,
  id: string,
  reveal: boolean,
): Promise<AdminSessionDetail> {
  const session = await context.prisma.session.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true } },
      slots: { orderBy: { position: 'asc' } },
      participants: true,
      segments: {
        orderBy: { sequence: 'asc' },
        take: 500,
        include: { translations: { select: { targetLanguage: true } } },
      },
      _count: { select: { segments: true, participants: true } },
    },
  });
  if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');

  const [usageRows, translationCount] = await Promise.all([
    context.prisma.usageLedger.groupBy({
      by: ['metric', 'provider', 'model'],
      _sum: { quantity: true, estimatedCostUsd: true },
      where: { sessionId: id },
    }),
    context.prisma.translation.count({ where: { segment: { sessionId: id } } }),
  ]);

  const gaps: number[] = [];
  for (let i = 1; i < session.segments.length; i++) {
    const previous = session.segments[i - 1]!;
    const current = session.segments[i]!;
    gaps.push(current.createdAt.getTime() - previous.createdAt.getTime());
  }
  gaps.sort((a, b) => a - b);

  const connected = new Set(
    context.hub.connectionsFor(id).map((connection) => connection.participantId),
  );

  return {
    session: {
      id: session.id,
      kind: session.kind,
      status: session.status,
      title: session.title,
      ownerUserId: session.ownerUserId,
      ownerEmail: maskEmail(session.owner?.email ?? null),
      anonymousOwnerPreview: session.anonymousOwnerHash
        ? `${session.anonymousOwnerHash.slice(0, 8)}…`
        : null,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      durationSeconds: session.durationSeconds,
      segmentCount: session._count.segments,
      translationCount,
      participantCount: session._count.participants,
      connectedNow: context.hub.connectionsFor(id).length,
      languages: [...new Set(session.slots.map((slot) => slot.readingLanguage))],
      saved: session.saveRequested,
      estimatedCostUsd: usageRows.reduce((sum, row) => sum + (row._sum.estimatedCostUsd ?? 0), 0),
    },
    slots: session.slots.map((slot) => ({
      id: slot.id,
      position: slot.position,
      readingLanguage: slot.readingLanguage,
      spokenLanguageHint: slot.spokenLanguageHint,
      rotation: slot.rotation,
      displayName: slot.displayName,
    })),
    participants: session.participants.map((participant) => ({
      id: participant.id,
      role: participant.role,
      targetLanguage: participant.targetLanguage,
      joinedAt: participant.joinedAt.toISOString(),
      leftAt: participant.leftAt?.toISOString() ?? null,
      lastSequenceReceived: participant.lastSequenceReceived,
      connected: connected.has(participant.id),
    })),
    usage: usageRows.map((row) => ({
      metric: row.metric,
      quantity: row._sum.quantity ?? 0,
      provider: row.provider,
      model: row.model,
    })),
    timings: {
      firstSegmentAtMs: session.segments[0]?.startedAtMs ?? null,
      lastSegmentAtMs: session.segments.at(-1)?.endedAtMs ?? null,
      medianSegmentGapMs: gaps.length > 0 ? (gaps[Math.floor(gaps.length / 2)] ?? null) : null,
    },
    segments: session.segments.map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      sourceLanguage: segment.sourceLanguage,
      characterCount: segment.characterCount,
      createdAt: segment.createdAt.toISOString(),
      translationLanguages: segment.translations.map((t) => t.targetLanguage),
      // Null unless an operator explicitly revealed it with a recorded reason.
      originalText: reveal ? context.cipher.tryDecrypt(segment.originalTextEncrypted) : null,
    })),
    transcriptRevealed: reveal,
  };
}

async function checkDatabase(context: AppContext): Promise<'ok' | 'degraded' | 'error'> {
  try {
    await context.prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(context: AppContext): Promise<'ok' | 'degraded' | 'error'> {
  if (!context.redis) return 'degraded';
  try {
    await context.redis.client.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}

async function workerHealth(context: AppContext): Promise<'ok' | 'stale' | 'unknown'> {
  if (!context.redis) return 'unknown';
  try {
    const beat = await context.redis.client.get('lingolive:worker:heartbeat');
    if (!beat) return 'unknown';
    // The worker beats once a minute; three missed beats means something is wrong.
    return Date.now() - Number(beat) < 180_000 ? 'ok' : 'stale';
  } catch {
    return 'unknown';
  }
}
