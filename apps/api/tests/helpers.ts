import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { parseServerEnv } from '@lingolive/config';
import { createSilentLogger } from '@lingolive/logging';
import {
  createAnalytics,
  type AnalyticsPayload,
  type ErrorReportContext,
} from '@lingolive/observability';
import { buildApp } from '../src/app.js';
import { createAppContext, type AppContext } from '../src/context.js';

let migrated = false;

/** Applies migrations once per test run. */
export function ensureSchema(): void {
  if (migrated) return;
  execSync('pnpm exec prisma migrate deploy --schema ../../prisma/schema.prisma', {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
    env: { ...process.env },
  });
  migrated = true;
}

export interface TestHarness {
  app: FastifyInstance;
  context: AppContext;
  prisma: PrismaClient;
  /** Everything the outbound analytics client would have sent. */
  analyticsSent: AnalyticsPayload[];
  /** Everything the outbound error reporter would have sent. */
  errorsReported: Array<{ error: unknown; context?: ErrorReportContext }>;
  close: () => Promise<void>;
}

export async function createHarness(overrides: Record<string, string> = {}): Promise<TestHarness> {
  ensureSchema();
  // Vitest loads `.env` into process.env, so REDIS_URL can leak in from a
  // developer's local file. Tests must not depend on that: the harness runs
  // without Redis unless a test explicitly asks for it, which also exercises
  // the single-instance fallback paths.
  const { REDIS_URL: _ambientRedis, ...ambient } = process.env;
  const env = parseServerEnv({ ...ambient, ...overrides });
  const prisma = new PrismaClient();

  // Third-party delivery is replaced by a recorder, so a test can assert on
  // the exact bytes that *would* leave the process rather than trusting that
  // the vendor client is well behaved.
  const analyticsSent: AnalyticsPayload[] = [];
  const errorsReported: Array<{ error: unknown; context?: ErrorReportContext }> = [];
  const analytics = createAnalytics({
    enabled: true,
    apiKey: 'phc_test',
    batchSize: 1,
    transport: { send: async (batch) => void analyticsSent.push(...batch) },
  });

  const context = await createAppContext({
    env,
    logger: createSilentLogger(),
    prisma,
    redis: null,
    analytics,
    errorReporter: {
      enabled: true,
      captureException: (error, reportContext) =>
        void errorsReported.push({ error, ...(reportContext ? { context: reportContext } : {}) }),
      flush: async () => undefined,
    },
  });
  const app = await buildApp(context);
  await app.ready();

  return {
    app,
    context,
    prisma,
    analyticsSent,
    errorsReported,
    close: async () => {
      await app.close();
      await context.hub.close();
      await prisma.$disconnect();
    },
  };
}

/** Truncates every table so each test file starts from a known state. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      admin_audit_log, analytics_events, config_overrides, deletion_requests,
      error_events, translations, transcript_segments, usage_ledger,
      business_access_codes, participants, speaker_slots, sessions,
      entitlements, devices, users
    RESTART IDENTITY CASCADE
  `);
}

export function randomAnonymousId(): string {
  return `anon_${randomBytes(16).toString('hex')}`;
}

export interface GuestSession {
  token: string;
  userId: string;
  anonymousId: string;
}

/** Registers a guest and returns a usable bearer token. */
export async function registerGuest(
  app: FastifyInstance,
  overrides: { platform?: string; locale?: string } = {},
): Promise<GuestSession> {
  const anonymousId = randomAnonymousId();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest',
    payload: {
      anonymousId,
      platform: overrides.platform ?? 'web',
      appVersion: '1.0.0',
      locale: overrides.locale ?? 'en',
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Guest registration failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id, anonymousId };
}

/** Promotes a user to admin and returns the headers an admin call needs. */
export async function makeAdmin(
  prisma: PrismaClient,
  userId: string,
  token: string,
): Promise<Record<string, string>> {
  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: true, email: 'admin@lingolive.test', isGuest: false },
  });
  return {
    authorization: `Bearer ${token}`,
    'x-admin-token': process.env.ADMIN_API_TOKEN as string,
  };
}

export function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
