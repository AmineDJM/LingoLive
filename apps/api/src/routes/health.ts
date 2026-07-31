import type { FastifyInstance } from 'fastify';
import { UI_LOCALES, type ConfigResponse, type ReadyResponse } from '@lingolive/contracts';
import type { AppContext } from '../context.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  /** Liveness: is the process up? Deliberately touches nothing external. */
  app.get('/health', async () => ({
    status: 'ok' as const,
    version: context.version,
    environment: context.env.APP_ENV,
    uptimeSeconds: Math.round((Date.now() - context.startedAt.getTime()) / 1000),
  }));

  /** Readiness: can this instance actually serve traffic? */
  app.get('/ready', async (_request, reply): Promise<ReadyResponse> => {
    const checks: ReadyResponse['checks'] = {
      database: 'ok',
      redis: 'ok',
      aiProvider: 'ok',
    };

    try {
      await context.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'error';
    }

    if (!context.redis) {
      // Single-instance operation is a supported development mode, not an
      // outage — reported as degraded rather than failing readiness.
      checks.redis = context.derived.isStagingOrProduction ? 'error' : 'degraded';
    } else {
      try {
        await context.redis.client.ping();
      } catch {
        checks.redis = 'error';
      }
    }

    if (context.ai.providerName === 'mock') {
      checks.aiProvider = 'mock';
    } else if (!context.ai.transcription.available) {
      checks.aiProvider = 'not_configured';
    }

    const status: ReadyResponse['status'] =
      checks.database === 'error' || checks.redis === 'error' || checks.aiProvider === 'error'
        ? 'error'
        : checks.aiProvider === 'not_configured' || checks.redis === 'degraded'
          ? 'degraded'
          : 'ok';

    void reply.status(status === 'error' ? 503 : 200);
    return { status, checks };
  });

  /**
   * Public runtime configuration. Contains nothing secret — it exists so
   * clients can honestly say "translation is unavailable" instead of failing
   * silently, and so the web app knows which deep-link scheme to use.
   */
  app.get('/config', async (): Promise<ConfigResponse> => ({
    aiProvider: context.env.AI_PROVIDER,
    billingProvider: context.env.BILLING_PROVIDER,
    authProvider: context.env.AUTH_PROVIDER,
    devSimulatorEnabled: context.derived.devSimulatorEnabled,
    maxDiscussionLanguages: context.runtimeConfig.number('MAX_DISCUSSION_LANGUAGES'),
    maxPersonalSessionMinutes: context.runtimeConfig.number('MAX_PERSONAL_SESSION_MINUTES'),
    supportedLocales: [...UI_LOCALES],
    deepLinkScheme: context.env.DEEP_LINK_SCHEME,
    webBaseUrl: context.env.WEB_BASE_URL,
    translationAvailable:
      context.derived.translationAvailable && context.runtimeConfig.flag('translationEnabled'),
  }));
}
