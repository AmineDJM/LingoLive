/**
 * Test environment.
 *
 * Integration tests run against a real PostgreSQL database and the real
 * Fastify application — `app.inject()` exercises every plugin, hook, validator
 * and error path exactly as production does. Only the AI provider is mocked,
 * because that is the one dependency that costs money and is non-deterministic.
 */
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.AI_PROVIDER = 'mock';
process.env.AUTH_PROVIDER = 'local';
process.env.ENABLE_DEV_SIMULATOR = 'true';
process.env.ENABLE_REQUEST_LOGGING = 'false';
process.env.ANALYTICS_ENABLED = 'true';

process.env.DATABASE_URL ??=
  'postgresql://lingolive:lingolive@127.0.0.1:5432/lingolive_test?schema=public';
// Redis is optional in tests: the hub and rate limiter both have in-process
// fallbacks, and exercising those is itself worth doing.
delete process.env.REDIS_URL;

process.env.SESSION_SIGNING_SECRET = 'test-session-signing-secret-abcdefghijklmnop';
process.env.AUTH_SECRET = 'test-auth-secret-abcdefghijklmnopqrstuvwx';
process.env.TRANSCRIPT_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64');
process.env.ADMIN_API_TOKEN = 'test-admin-token-0123456789abcdef';
process.env.ADMIN_EMAILS = 'admin@lingolive.test';
process.env.GUEST_MINUTES_PER_MONTH = '30';
process.env.FREE_MINUTES_PER_MONTH = '120';
process.env.MAX_PERSONAL_SESSION_MINUTES = '180';
process.env.API_BASE_URL = 'http://localhost:4000';
process.env.WEB_BASE_URL = 'http://localhost:3000';
