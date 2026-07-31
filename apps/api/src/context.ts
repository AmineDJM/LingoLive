import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { deriveConfig, type DerivedConfig, type ServerEnv } from '@lingolive/config';
import type { Logger } from '@lingolive/logging';
import {
  createAnalytics,
  createErrorReporter,
  type Analytics,
  type ErrorReporter,
} from '@lingolive/observability';
import { createAiProviders, costRatesFor, type AiProviders, type CostRates } from './ai/index.js';
import { InProcessRealtimeHub, type RealtimeHub } from './realtime/hub.js';
import { TranscriptCipher } from './security/crypto.js';
import { InMemoryReplayGuard, RedisReplayGuard, type TokenReplayGuard } from './security/tokens.js';
import { MetricsRegistry } from './modules/metrics.js';
import { RuntimeConfigStore } from './modules/runtime-config.js';

/**
 * The application container.
 *
 * Everything a route or service needs is reachable from here, and every
 * dependency is injectable — which is what makes the integration tests run
 * against a real database and a real hub without a running HTTP server.
 */
export interface AppContext {
  readonly env: ServerEnv;
  readonly derived: DerivedConfig;
  readonly logger: Logger;
  readonly prisma: PrismaClient;
  readonly redis: RedisConnections | null;
  readonly hub: RealtimeHub;
  readonly ai: AiProviders;
  readonly cipher: TranscriptCipher;
  readonly replayGuard: TokenReplayGuard;
  readonly metrics: MetricsRegistry;
  readonly runtimeConfig: RuntimeConfigStore;
  readonly costRates: CostRates;
  /** Both are inert unless explicitly configured. See ADR-0011. */
  readonly analytics: Analytics;
  readonly errorReporter: ErrorReporter;
  readonly startedAt: Date;
  readonly version: string;
}

export interface RedisConnections {
  readonly client: Redis;
  readonly publisher: Redis;
  readonly subscriber: Redis;
}

export interface CreateContextOptions {
  env: ServerEnv;
  logger: Logger;
  prisma?: PrismaClient;
  redis?: RedisConnections | null;
  /** Overridable so tests can assert exactly what would leave the process. */
  analytics?: Analytics;
  errorReporter?: ErrorReporter;
  version?: string;
}

export async function createAppContext(options: CreateContextOptions): Promise<AppContext> {
  const { env, logger } = options;
  const derived = deriveConfig(env);

  const prisma =
    options.prisma ??
    new PrismaClient({
      // Query logs are off by design: a Prisma query log echoes parameter
      // values, which for this product means transcript ciphertext and
      // identifiers in plain server logs.
      log: derived.isDevelopment ? ['warn', 'error'] : ['error'],
    });

  const redis = options.redis ?? (await connectRedis(env, logger));

  const hub = new InProcessRealtimeHub(
    logger,
    redis ? { publisher: redis.publisher, subscriber: redis.subscriber } : undefined,
  );

  const cipher = new TranscriptCipher(
    env.TRANSCRIPT_ENCRYPTION_KEY,
    env.TRANSCRIPT_ENCRYPTION_KEY_VERSION,
  );

  const replayGuard: TokenReplayGuard = redis
    ? new RedisReplayGuard(redis.client as never)
    : new InMemoryReplayGuard();

  return {
    env,
    derived,
    logger,
    prisma,
    redis,
    hub,
    ai: createAiProviders(env, logger),
    cipher,
    replayGuard,
    metrics: new MetricsRegistry(),
    runtimeConfig: new RuntimeConfigStore(prisma, env, logger),
    costRates: costRatesFor(env),
    analytics:
      options.analytics ??
      createAnalytics({
        enabled: env.ANALYTICS_ENABLED,
        apiKey: env.POSTHOG_KEY,
        host: env.POSTHOG_HOST,
        onError: (error) => logger.warn({ err: error }, 'Analytics delivery failed'),
      }),
    errorReporter:
      options.errorReporter ??
      createErrorReporter({
        dsn: env.SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT ?? env.APP_ENV,
        release: options.version ?? '1.0.0',
        sampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
        onError: (error) => logger.warn({ err: error }, 'Error reporting delivery failed'),
      }),
    startedAt: new Date(),
    version: options.version ?? '1.0.0',
  };
}

async function connectRedis(env: ServerEnv, logger: Logger): Promise<RedisConnections | null> {
  if (!env.REDIS_URL) {
    logger.warn(
      'REDIS_URL is not set — running single-instance (no cross-instance realtime fan-out, in-memory rate limits)',
    );
    return null;
  }
  try {
    const { Redis } = await import('ioredis');
    const options = {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      // Never let a Redis outage take the API down: everything that uses it
      // has a degraded in-process path.
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    };
    const client = new Redis(env.REDIS_URL, options);
    const publisher = new Redis(env.REDIS_URL, options);
    const subscriber = new Redis(env.REDIS_URL, options);
    await Promise.all([client.connect(), publisher.connect(), subscriber.connect()]);
    for (const connection of [client, publisher, subscriber]) {
      connection.on('error', (error: Error) => {
        logger.warn({ err: error }, 'Redis connection error');
      });
    }
    logger.info('Redis connected');
    return { client, publisher, subscriber };
  } catch (error) {
    logger.warn({ err: error }, 'Could not connect to Redis — continuing single-instance');
    return null;
  }
}

export async function closeAppContext(context: AppContext): Promise<void> {
  // Flush before the process exits, or the last error of a crash loop — the
  // one that matters — is the one that never gets reported.
  await Promise.allSettled([context.analytics.flush(), context.errorReporter.flush()]);
  await context.hub.close();
  if (context.redis) {
    await Promise.allSettled([
      context.redis.client.quit(),
      context.redis.publisher.quit(),
      context.redis.subscriber.quit(),
    ]);
  }
  await context.prisma.$disconnect();
}
