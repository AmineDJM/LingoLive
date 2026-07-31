import { ConfigurationError, parseServerEnv } from '@lingolive/config';
import { createLogger } from '@lingolive/logging';
import { buildApp } from './app.js';
import { closeAppContext, createAppContext } from './context.js';
import { startBackgroundJobs } from './modules/jobs.js';

/**
 * Process entry point.
 *
 * An invalid configuration fails here, loudly, with the exact list of what is
 * wrong — rather than at 3am inside a request handler.
 */
async function main(): Promise<void> {
  let env;
  try {
    env = parseServerEnv(process.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      // Printed rather than logged: this must be readable in a deploy log even
      // if the log transport itself is misconfigured.
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    level: env.LOG_LEVEL,
    name: 'lingolive-api',
    environment: env.APP_ENV,
    pretty: env.APP_ENV === 'development',
  });

  const context = await createAppContext({ env, logger });
  const app = await buildApp(context);
  const stopJobs = startBackgroundJobs(context);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    stopJobs();
    // Tell every live client the server is going away, so they show
    // "reconnecting" rather than freezing on a stale transcript.
    try {
      await app.close();
      await closeAppContext(context);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  await app.listen({ port: env.PORT, host: env.HOST });

  logger.info(
    {
      port: env.PORT,
      environment: env.APP_ENV,
      aiProvider: env.AI_PROVIDER,
      authProvider: env.AUTH_PROVIDER,
      redis: context.redis ? 'connected' : 'disabled',
      devSimulator: context.derived.devSimulatorEnabled,
    },
    'LingoLive API listening',
  );

  if (env.AI_PROVIDER === 'mock') {
    logger.warn('Running with AI_PROVIDER=mock — transcription and translation are simulated');
  }
}

void main();
