import { DeletionStatus, SessionStatus } from '@prisma/client';
import type { AppContext } from '../context.js';
import type { InProcessRealtimeHub } from '../realtime/hub.js';

/**
 * Periodic maintenance that the privacy policy depends on being real.
 *
 * The retention promises in docs/PRIVACY.md are only true because these jobs
 * run — an unsaved transcript is *deleted*, not merely hidden.
 *
 * These run in-process so a single-service deployment is fully correct; the
 * standalone worker (`apps/worker`) runs the same functions on a schedule when
 * the deployment is split.
 */

export interface JobResult {
  readonly name: string;
  readonly affected: number;
}

/** Deletes personal sessions the user never explicitly saved. */
export async function purgeUnsavedSessions(context: AppContext): Promise<JobResult> {
  const hours = context.runtimeConfig.number('RETENTION_UNSAVED_SESSION_HOURS');
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  const { count } = await context.prisma.session.deleteMany({
    where: {
      saveRequested: false,
      kind: { in: ['PERSONAL_LISTEN', 'PERSONAL_DISCUSS'] },
      status: { in: [SessionStatus.ENDED, SessionStatus.EXPIRED] },
      endedAt: { lt: cutoff },
    },
  });

  return { name: 'purgeUnsavedSessions', affected: count };
}

/** Ends sessions that were abandoned without a clean shutdown. */
export async function expireStaleSessions(context: AppContext): Promise<JobResult> {
  const now = new Date();
  const { count } = await context.prisma.session.updateMany({
    where: {
      status: { in: [SessionStatus.LIVE, SessionStatus.PAUSED, SessionStatus.PENDING] },
      expiresAt: { lt: now },
    },
    data: { status: SessionStatus.EXPIRED, endedAt: now },
  });
  return { name: 'expireStaleSessions', affected: count };
}

/** Deactivates LingoBusiness codes past their expiry. */
export async function expireAccessCodes(context: AppContext): Promise<JobResult> {
  const { count } = await context.prisma.businessAccessCode.updateMany({
    where: { active: true, expiresAt: { lt: new Date() } },
    data: { active: false },
  });
  return { name: 'expireAccessCodes', affected: count };
}

/** Deletes LingoBusiness sessions past their retention window. */
export async function purgeBusinessSessions(context: AppContext): Promise<JobResult> {
  const days = context.runtimeConfig.number('RETENTION_BUSINESS_SESSION_DAYS');
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const { count } = await context.prisma.session.deleteMany({
    where: {
      kind: 'BUSINESS_BROADCAST',
      status: { in: [SessionStatus.ENDED, SessionStatus.EXPIRED] },
      endedAt: { lt: cutoff },
    },
  });
  return { name: 'purgeBusinessSessions', affected: count };
}

/** Completes scheduled account deletions. */
export async function processDeletionRequests(context: AppContext): Promise<JobResult> {
  const due = await context.prisma.deletionRequest.findMany({
    where: { status: DeletionStatus.REQUESTED, scheduledFor: { lte: new Date() } },
    take: 50,
  });

  let processed = 0;
  for (const request of due) {
    try {
      await context.prisma.$transaction(async (tx) => {
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: { status: DeletionStatus.IN_PROGRESS },
        });
        await tx.session.deleteMany({ where: { ownerUserId: request.userId } });
        await tx.device.deleteMany({ where: { userId: request.userId } });
        await tx.entitlement.deleteMany({ where: { userId: request.userId } });
        // The user row is kept, fully anonymised, so foreign keys on the
        // append-only audit log stay valid. Nothing identifying remains.
        await tx.user.update({
          where: { id: request.userId },
          data: {
            deletedAt: new Date(),
            email: null,
            displayName: null,
            externalAuthId: null,
            preferredReadingLanguage: 'en',
          },
        });
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: { status: DeletionStatus.COMPLETED, completedAt: new Date() },
        });
      });
      processed += 1;
    } catch (error) {
      context.logger.error({ err: error, requestId: request.id }, 'Account deletion failed');
      await context.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: DeletionStatus.FAILED,
          error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        },
      });
    }
  }

  return { name: 'processDeletionRequests', affected: processed };
}

/** Drops technical logs past their retention window. */
export async function purgeTechnicalLogs(context: AppContext): Promise<JobResult> {
  const days = context.runtimeConfig.number('RETENTION_TECHNICAL_LOG_DAYS');
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const [errors, analytics] = await Promise.all([
    context.prisma.errorEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    context.prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { name: 'purgeTechnicalLogs', affected: errors.count + analytics.count };
}

/** Disconnects sockets that stopped sending heartbeats. */
export function pruneStaleConnections(context: AppContext): JobResult {
  const hub = context.hub as InProcessRealtimeHub;
  if (typeof hub.pruneStale !== 'function') return { name: 'pruneStaleConnections', affected: 0 };
  const timeoutMs = context.runtimeConfig.number('SESSION_IDLE_TIMEOUT_SECONDS') * 1000;
  return { name: 'pruneStaleConnections', affected: hub.pruneStale(timeoutMs) };
}

export const ALL_JOBS = [
  purgeUnsavedSessions,
  expireStaleSessions,
  expireAccessCodes,
  purgeBusinessSessions,
  processDeletionRequests,
  purgeTechnicalLogs,
] as const;

export async function runAllJobs(context: AppContext): Promise<JobResult[]> {
  const results: JobResult[] = [];
  for (const job of ALL_JOBS) {
    try {
      results.push(await job(context));
    } catch (error) {
      context.logger.error({ err: error, job: job.name }, 'Maintenance job failed');
    }
  }
  results.push(pruneStaleConnections(context));
  return results;
}

/**
 * Starts the in-process scheduler. Returns a stop function so shutdown is
 * clean and tests do not leak timers.
 */
export function startBackgroundJobs(context: AppContext): () => void {
  const timers: NodeJS.Timeout[] = [];

  const every = (ms: number, task: () => void | Promise<void>): void => {
    const timer = setInterval(() => {
      void Promise.resolve(task()).catch((error: unknown) => {
        context.logger.error({ err: error }, 'Scheduled task failed');
      });
    }, ms);
    timer.unref?.();
    timers.push(timer);
  };

  // Connection hygiene is frequent and cheap.
  every(30_000, () => {
    pruneStaleConnections(context);
  });

  // Retention runs every 10 minutes: often enough that "deleted after an hour"
  // is honest, rare enough to be invisible in database load.
  every(600_000, async () => {
    const results = await runAllJobs(context);
    const affected = results.filter((result) => result.affected > 0);
    if (affected.length > 0) {
      context.logger.info({ jobs: affected }, 'Maintenance completed');
    }
  });

  // Heartbeat consumed by the admin console's worker health indicator.
  every(60_000, async () => {
    if (!context.redis) return;
    await context.redis.client.set('lingolive:worker:heartbeat', String(Date.now()), 'EX', 300);
  });

  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
