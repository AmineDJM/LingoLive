import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createHarness,
  makeAdmin,
  registerGuest,
  resetDatabase,
  type TestHarness,
} from './helpers.js';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createHarness();
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
});

async function adminHeaders(): Promise<Record<string, string>> {
  const guest = await registerGuest(harness.app);
  return makeAdmin(harness.prisma, guest.userId, guest.token);
}

describe('admin access control', () => {
  it('refuses an unauthenticated caller', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/admin/overview' });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a normal user', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: authHeaders(guest.token),
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses an admin without the shared admin token — defence in depth', async () => {
    const guest = await registerGuest(harness.app);
    await makeAdmin(harness.prisma, guest.userId, guest.token);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: authHeaders(guest.token),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ADMIN_TOKEN_REQUIRED');
  });

  it('refuses a wrong admin token', async () => {
    const guest = await registerGuest(harness.app);
    await makeAdmin(harness.prisma, guest.userId, guest.token);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { ...authHeaders(guest.token), 'x-admin-token': 'wrong-token-value-padded-out' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('admits an admin with both credentials', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers,
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('operator visibility', () => {
  it('reports live state, totals, health and process metrics', async () => {
    const headers = await adminHeaders();
    const guest = await registerGuest(harness.app);
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers,
    });
    const body = response.json();

    expect(body.live.activeSessions).toBe(1);
    expect(body.live.activeListenSessions).toBe(1);
    expect(body.today.sessionsStarted).toBe(1);
    expect(body.totals.users).toBeGreaterThanOrEqual(2);
    expect(body.health.database).toBe('ok');
    expect(body.health.aiProvider).toBe('mock');
    expect(body.process.nodeVersion).toBe(process.version);
    expect(body.process.rssBytes).toBeGreaterThan(0);
  });

  it('lists and searches users with their usage', async () => {
    const headers = await adminHeaders();
    await registerGuest(harness.app);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?limit=10',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThanOrEqual(2);
    expect(response.json().items[0]).toHaveProperty('audioSeconds');
    expect(response.json().items[0]).toHaveProperty('estimatedCostUsd');
  });

  it('shows a full user profile with devices, entitlements and sessions', async () => {
    const headers = await adminHeaders();
    const guest = await registerGuest(harness.app);
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${guest.userId}`,
      headers,
    });
    const body = response.json();

    expect(body.user.id).toBe(guest.userId);
    expect(body.devices).toHaveLength(1);
    // Even an operator only sees a truncated device identifier.
    expect(body.devices[0].anonymousIdPreview.endsWith('…')).toBe(true);
    expect(body.devices[0].anonymousIdPreview.length).toBeLessThan(12);
    expect(body.entitlements[0].plan).toBe('GUEST');
    expect(body.recentSessions).toHaveLength(1);
    expect(Array.isArray(body.monthlyUsage)).toBe(true);
  });

  it('reports usage and cost with the circuit-breaker state', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/usage?granularity=day',
      headers,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.limits.circuitBreakerOpen).toBe(false);
    expect(body.limits.dailyLimitUsd).toBeGreaterThan(0);
    expect(Array.isArray(body.byModel)).toBe(true);
  });

  it('exposes realtime connections and per-room fan-out', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/realtime',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals).toHaveProperty('connections');
  });

  it('exposes latency percentiles and recent errors', async () => {
    const headers = await adminHeaders();
    // Generate a failure so there is something to report.
    await harness.app.inject({ method: 'GET', url: '/api/v1/sessions/does-not-exist' });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/metrics',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().http)).toBe(true);
    expect(Array.isArray(response.json().latency)).toBe(true);
  });
});

describe('transcript content is gated, everything else is not', () => {
  async function sessionWithSecret(): Promise<{ sessionId: string; secret: string }> {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;
    const secret = 'Mon numéro de dossier est 4471 et je suis suivi depuis mars.';
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload: { originalText: secret, sourceLanguage: 'fr' },
    });
    return { sessionId, secret };
  }

  it('shows metadata but not content by default', async () => {
    const headers = await adminHeaders();
    const { sessionId, secret } = await sessionWithSecret();

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/admin/sessions/${sessionId}`,
      headers,
    });
    const body = response.json();

    expect(body.transcriptRevealed).toBe(false);
    expect(body.segments).toHaveLength(1);
    // Metadata is fully visible…
    expect(body.segments[0].sequence).toBe(1);
    expect(body.segments[0].characterCount).toBe(secret.length);
    expect(body.segments[0].sourceLanguage).toBe('fr');
    // …content is not.
    expect(body.segments[0].originalText).toBeNull();
    expect(response.body).not.toContain('4471');
  });

  it('reveals content only with a written reason, and records it forever', async () => {
    const headers = await adminHeaders();
    const { sessionId, secret } = await sessionWithSecret();

    const rejected = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/sessions/${sessionId}/reveal`,
      headers,
      payload: { reason: 'why' },
    });
    expect(rejected.statusCode).toBe(422);

    const revealed = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/sessions/${sessionId}/reveal`,
      headers,
      payload: { reason: 'Support ticket 8812: user reports garbled transcript' },
    });
    expect(revealed.statusCode).toBe(200);
    expect(revealed.json().transcriptRevealed).toBe(true);
    expect(revealed.json().segments[0].originalText).toBe(secret);

    const audit = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit?action=TRANSCRIPT_REVEALED',
      headers,
    });
    expect(audit.json().items).toHaveLength(1);
    expect(audit.json().items[0].reason).toContain('8812');
    expect(audit.json().items[0].targetId).toBe(sessionId);
    expect(audit.json().items[0].requestId).toMatch(/^req_/);
  });

  it('has no route that deletes an audit entry', async () => {
    const headers = await adminHeaders();
    const { sessionId } = await sessionWithSecret();
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/sessions/${sessionId}/reveal`,
      headers,
      payload: { reason: 'Investigating a support ticket about missing text' },
    });

    const entry = await harness.prisma.adminAuditLog.findFirst();
    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/audit/${entry!.id}`,
      headers,
    });
    expect(response.statusCode).toBe(404);
    expect(await harness.prisma.adminAuditLog.count()).toBe(1);
  });
});

describe('operator actions', () => {
  it('changes a plan and audits it', async () => {
    const headers = await adminHeaders();
    const guest = await registerGuest(harness.app);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${guest.userId}`,
      headers,
      payload: { plan: 'PRO', reason: 'Comped for a conference partnership' },
    });
    expect(response.statusCode).toBe(200);

    const me = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    expect(me.json().entitlement.plan).toBe('PRO');

    const audit = await harness.prisma.adminAuditLog.findFirst({
      where: { action: 'PLAN_CHANGED' },
    });
    expect(audit!.reason).toContain('conference');
  });

  it('suspends an account and locks it out immediately', async () => {
    const headers = await adminHeaders();
    const guest = await registerGuest(harness.app);

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${guest.userId}`,
      headers,
      payload: { suspended: true, reason: 'Abuse report 44' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    expect(response.statusCode).toBe(403);
  });

  it('ends a live session on demand', async () => {
    const headers = await adminHeaders();
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/sessions/${sessionId}/end`,
      headers,
      payload: { reason: 'Runaway session burning quota' },
    });
    expect(response.statusCode).toBe(200);

    const session = await harness.prisma.session.findUnique({ where: { id: sessionId } });
    expect(session!.status).toBe('ENDED');
  });

  it('creates a LingoBusiness room and revokes its code', async () => {
    const headers = await adminHeaders();

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/admin/business/sessions',
      headers,
      payload: {
        title: 'Annual conference',
        organizerName: 'Example Org',
        targetLanguages: ['en', 'fr'],
        expiresInHours: 8,
      },
    });
    expect(created.statusCode).toBe(201);
    const code = created.json().code;
    expect(code).toMatch(/^\d{6}$/);

    const codes = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/business/codes',
      headers,
    });
    const codeId = codes.json().items[0].id;

    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/business/codes/${codeId}/revoke`,
      headers,
    });

    const join = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code, targetLanguage: 'en' },
    });
    expect(join.statusCode).toBe(404);
  });
});

describe('runtime configuration', () => {
  it('never exposes a secret value', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/config',
      headers,
    });

    const runtime = response.json().runtime as Array<{
      key: string;
      value: string;
      secret: boolean;
      editable: boolean;
    }>;
    const secretKey = runtime.find((row) => row.key === 'SESSION_SIGNING_SECRET');
    expect(secretKey!.secret).toBe(true);
    expect(secretKey!.value).toBe('set');
    expect(secretKey!.editable).toBe(false);
    expect(response.body).not.toContain(process.env.SESSION_SIGNING_SECRET as string);
    expect(response.body).not.toContain(process.env.TRANSCRIPT_ENCRYPTION_KEY as string);
  });

  it('applies a quota override without a redeploy', async () => {
    const headers = await adminHeaders();

    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'FREE_MINUTES_PER_MONTH', value: '999', reason: 'Promotional period' },
    });
    expect(response.statusCode).toBe(200);
    expect(harness.context.runtimeConfig.number('FREE_MINUTES_PER_MONTH')).toBe(999);

    // And it is reversible.
    await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'FREE_MINUTES_PER_MONTH', value: null, reason: 'Promotion ended' },
    });
    expect(harness.context.runtimeConfig.number('FREE_MINUTES_PER_MONTH')).toBe(120);
  });

  it('refuses to override a secret', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'SESSION_SIGNING_SECRET', value: 'hijacked', reason: 'testing' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to override a key that is not on the allow-list', async () => {
    const headers = await adminHeaders();
    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'DATABASE_URL', value: 'postgres://evil', reason: 'testing' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('toggles a feature flag and the product honours it', async () => {
    const headers = await adminHeaders();
    await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'flag:newSessionsEnabled', value: 'false', reason: 'Incident 12' },
    });

    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    expect(response.statusCode).toBe(503);

    await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/config',
      headers,
      payload: { key: 'flag:newSessionsEnabled', value: 'true', reason: 'Incident resolved' },
    });
  });
});
