import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createLogger } from '@lingolive/logging';
import type { AppContext } from './context.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerAuth } from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';
import { registerRealtimeRoute } from './realtime/ws-route.js';
import { generateRequestId } from './security/crypto.js';

/**
 * Per-request access logs are noise in tests and in some deployments; errors
 * and application logs are unaffected either way.
 */
function createLogController(
  disableRequestLogging: boolean,
  options: FastifyServerOptions,
): NonNullable<FastifyServerOptions['logController']> {
  const controller = new LogController(options);
  controller.disableRequestLogging = disableRequestLogging;
  return controller;
}

/**
 * Builds the Fastify instance.
 *
 * Exported separately from `server.ts` so integration tests can drive the
 * whole application through `app.inject()` — real routes, real database, real
 * hub — without binding a port.
 */
export async function buildApp(context: AppContext): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    // Pino's concrete `Logger` type would otherwise narrow the instance's
    // generics and make every plugin registration incompatible.
    loggerInstance: createLogger({
      level: context.env.LOG_LEVEL,
      name: 'lingolive-api',
      environment: context.env.APP_ENV,
      pretty: context.derived.isDevelopment,
    }) as FastifyBaseLogger,
    // Correlates a user-visible failure with the exact server log line.
    genReqId: () => generateRequestId(),
    trustProxy: true,
    // Transcript payloads are bounded by the contracts; anything larger is an
    // attack or a bug, not a legitimate request.
    bodyLimit: 256 * 1024,
    requestTimeout: 30_000,
    ajv: { customOptions: { removeAdditional: false } },
  };

  // The controller needs the resolved options, so it is attached afterwards.
  options.logController = createLogController(!context.env.ENABLE_REQUEST_LOGGING, options);

  const app = Fastify(options);

  await app.register(helmet, {
    // The API serves JSON only; a restrictive default CSP costs nothing here.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: context.derived.isStagingOrProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // No Origin header: native apps and server-to-server calls.
      if (!origin) return callback(null, true);
      const allowed = context.env.CORS_ALLOWED_ORIGINS;
      if (allowed.includes('*') && !context.derived.isStagingOrProduction) {
        return callback(null, true);
      }
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-admin-token', 'x-client-version'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Rate limit by identity where we have one, by network otherwise, so a
    // shared NAT does not throttle everyone behind it.
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      if (auth?.startsWith('Bearer ')) return `t:${auth.slice(7, 40)}`;
      return `ip:${request.ip}`;
    },
    ...(context.redis ? { redis: context.redis.client } : {}),
    // Health checks must never be throttled.
    allowList: (request) => request.url === '/health' || request.url === '/ready',
  });

  await app.register(websocket, {
    options: {
      maxPayload: 512 * 1024,
      // The hub prunes on heartbeat; this is the transport-level backstop.
      clientTracking: true,
    },
  });

  registerErrorHandler(app, context);
  registerAuth(app, context);

  // Measured on every request so the operator console has real percentiles.
  app.addHook('onResponse', async (request, reply) => {
    context.metrics.recordHttp(
      request.method,
      request.routeOptions?.url ?? request.url,
      reply.elapsedTime,
      reply.statusCode,
    );
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    // Nothing served by this API should ever be cached by an intermediary.
    void reply.header('cache-control', 'no-store');
    void reply.header('x-content-type-options', 'nosniff');
    return payload;
  });

  await registerRealtimeRoute(app, context);
  await registerRoutes(app, context);

  await context.runtimeConfig.load();

  return app;
}
