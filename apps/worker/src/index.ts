import { ConfigurationError, parseServerEnv } from '@lingolive/config';
import { createLogger } from '@lingolive/logging';
import { closeAppContext, createAppContext } from '@lingolive/api/context';
import { runAllJobs } from '@lingolive/api/jobs';

/**
 * The maintenance worker.
 *
 * The API also runs these jobs in-process, so a single-service deployment is
 * fully correct on its own. This worker exists for deployments that scale the
 * API horizontally: running retention and deletion in one place avoids several
 * instances racing on the same rows, and keeps a long purge off the request
 * path entirely.
 *
 * Set `WORKER_RUN_ONCE=true` to execute one cycle and exit — that is the shape
 * a cron-style platform wants.
 */
const INTERVAL_MS = Number.parseInt(process.env.WORKER_INTERVAL_MS ?? '300000', 10);
const RUN_ONCE = process.env.WORKER_RUN_ONCE === 'true';

async function main(): Promise<void> {
  let env;
  try {
    env = parseServerEnv(process.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    level: env.LOG_LEVEL,
    name: 'lingolive-worker',
    environment: env.APP_ENV,
    pretty: env.APP_ENV === 'development',
  });

  const context = await createAppContext({ env, logger });
  await context.runtimeConfig.load();

  let running = false;
  let stopping = false;

  const cycle = async (): Promise<void> => {
    // Never overlap cycles: a slow purge must not be joined by the next tick.
    if (running || stopping) return;
    running = true;
    const startedAt = Date.now();
    try {
      const results = await runAllJobs(context);
      const affected = results.filter((result) => result.affected > 0);
      logger.info(
        { durationMs: Date.now() - startedAt, jobs: affected },
        affected.length > 0 ? 'Maintenance cycle completed' : 'Maintenance cycle: nothing to do',
      );
      if (context.redis) {
        await context.redis.client.set('lingolive:worker:heartbeat', String(Date.now()), 'EX', 900);
      }
    } catch (error) {
      logger.error({ err: error }, 'Maintenance cycle failed');
    } finally {
      running = false;
    }
  };

  if (RUN_ONCE) {
    await cycle();
    await closeAppContext(context);
    return;
  }

  const timer = setInterval(() => void cycle(), INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutting down');
    stopping = true;
    clearInterval(timer);
    // Let an in-flight cycle finish rather than tearing the connection out
    // from under a partially completed deletion.
    for (let waited = 0; running && waited < 30_000; waited += 200) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await closeAppContext(context);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info({ intervalMs: INTERVAL_MS, environment: env.APP_ENV }, 'LingoLive worker started');
  await cycle();
}

void main();
