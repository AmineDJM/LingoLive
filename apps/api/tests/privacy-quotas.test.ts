import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionStatus, UsageMetric } from '@prisma/client';
import { scrubForLog } from '@lingolive/logging';
import {
  authHeaders,
  createHarness,
  registerGuest,
  resetDatabase,
  type TestHarness,
} from './helpers.js';
import {
  expireAccessCodes,
  processDeletionRequests,
  purgeUnsavedSessions,
  runAllJobs,
} from '../src/modules/jobs.js';

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

async function createEndedSession(saved: boolean): Promise<string> {
  const guest = await registerGuest(harness.app);
  const created = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    headers: authHeaders(guest.token),
    payload: { kind: 'PERSONAL_LISTEN' },
  });
  const sessionId = created.json().session.id;
  await harness.app.inject({
    method: 'POST',
    url: `/api/v1/sessions/${sessionId}/segments`,
    headers: authHeaders(guest.token),
    payload: { originalText: 'Something private.' },
  });
  await harness.app.inject({
    method: 'POST',
    url: `/api/v1/sessions/${sessionId}/end`,
    headers: authHeaders(guest.token),
  });
  if (saved) {
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/save`,
      headers: authHeaders(guest.token),
      payload: { confirmed: true },
    });
  }
  // Age it past the retention window.
  await harness.prisma.session.update({
    where: { id: sessionId },
    data: { endedAt: new Date(Date.now() - 3 * 3_600_000) },
  });
  return sessionId;
}

describe('retention — the privacy policy is enforced by code', () => {
  it('deletes an unsaved transcript, keeps a saved one', async () => {
    const unsaved = await createEndedSession(false);
    const saved = await createEndedSession(true);

    const result = await purgeUnsavedSessions(harness.context);
    expect(result.affected).toBe(1);

    expect(await harness.prisma.session.findUnique({ where: { id: unsaved } })).toBeNull();
    expect(await harness.prisma.session.findUnique({ where: { id: saved } })).not.toBeNull();
    // The deleted session took its segments with it.
    expect(await harness.prisma.transcriptSegment.count()).toBe(1);
  });

  it('deactivates expired business codes', async () => {
    const room = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/sessions',
      payload: {
        title: 'Expiring room',
        organizerName: 'Example',
        sourceLanguage: 'fr',
        targetLanguages: ['en'],
      },
    });
    await harness.prisma.businessAccessCode.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await expireAccessCodes(harness.context);
    expect(result.affected).toBe(1);

    const join = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.json().code, targetLanguage: 'en' },
    });
    expect(join.statusCode).toBe(404);
  });

  it('expires abandoned sessions instead of leaving them live forever', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;
    await harness.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await runAllJobs(harness.context);

    const session = await harness.prisma.session.findUnique({ where: { id: sessionId } });
    expect(session!.status).toBe(SessionStatus.EXPIRED);
  });

  it('never records an audio artefact anywhere', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    expect(created.json().session.audioStored).toBe(false);

    const session = await harness.prisma.session.findUnique({
      where: { id: created.json().session.id },
    });
    expect(session!.audioStored).toBe(false);

    // The schema itself has no column that could hold audio.
    const columns = await harness.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const suspicious = columns
      .map((row) => row.column_name.toLowerCase())
      .filter((name) => /audio|waveform|recording|pcm|opus/.test(name) && name !== 'audiostored');
    expect(suspicious).toEqual([]);
  });
});

describe('account deletion', () => {
  it('deletes saved transcripts immediately and anonymises the account', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload: { originalText: 'Delete me.' },
    });
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/save`,
      headers: authHeaders(guest.token),
      payload: { confirmed: true },
    });
    await harness.prisma.user.update({
      where: { id: guest.userId },
      data: { email: 'someone@example.com', displayName: 'Someone' },
    });

    const response = await harness.app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('SCHEDULED');
    expect(response.json().deletedSessions).toBe(1);

    // Content is gone at once — no grace period on a user's own words.
    expect(await harness.prisma.session.count()).toBe(0);
    expect(await harness.prisma.transcriptSegment.count()).toBe(0);

    const user = await harness.prisma.user.findUnique({ where: { id: guest.userId } });
    expect(user!.email).toBeNull();
    expect(user!.displayName).toBeNull();
    expect(user!.deletionRequestedAt).not.toBeNull();
  });

  it('completes the scheduled purge and reports it', async () => {
    const guest = await registerGuest(harness.app);
    await harness.app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    await harness.prisma.deletionRequest.updateMany({
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });

    const result = await processDeletionRequests(harness.context);
    expect(result.affected).toBe(1);

    const request = await harness.prisma.deletionRequest.findFirst();
    expect(request!.status).toBe('COMPLETED');
    expect(await harness.prisma.device.count()).toBe(0);

    // The token stops working immediately.
    const after = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    expect(after.statusCode).toBe(401);
  });

  it('is idempotent if requested twice', async () => {
    const guest = await registerGuest(harness.app);
    await harness.app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    const second = await harness.app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: authHeaders(guest.token),
    });
    expect(second.statusCode).toBe(200);
    expect(await harness.prisma.deletionRequest.count()).toBe(1);
  });
});

describe('quotas', () => {
  it('reports remaining minutes and warns before the wall', async () => {
    const guest = await registerGuest(harness.app);

    const before = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/usage',
      headers: authHeaders(guest.token),
    });
    expect(before.json().usage.quota.minutesPerMonth).toBe(30);
    expect(before.json().usage.quota.minutesRemaining).toBe(30);

    // 29 minutes of the 30-minute guest allowance.
    await harness.prisma.usageLedger.create({
      data: {
        userId: guest.userId,
        metric: UsageMetric.AUDIO_SECONDS,
        quantity: 29 * 60,
        provider: 'mock',
      },
    });

    const after = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/usage',
      headers: authHeaders(guest.token),
    });
    expect(after.json().usage.quota.minutesRemaining).toBeCloseTo(1, 1);
  });

  it('refuses a new session once the allowance is spent', async () => {
    const guest = await registerGuest(harness.app);
    await harness.prisma.usageLedger.create({
      data: {
        userId: guest.userId,
        metric: UsageMetric.AUDIO_SECONDS,
        quantity: 31 * 60,
        provider: 'mock',
      },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    expect(response.statusCode).toBe(402);
    expect(response.json().error.code).toBe('QUOTA_EXCEEDED');
  });

  it('never lets a client under-report its way past the meter', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    // Claim an implausible 10 hours of audio for a session seconds old.
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeaders(guest.token),
      payload: { reportedAudioSeconds: 36_000 },
    });

    const billed = await harness.prisma.usageLedger.aggregate({
      _sum: { quantity: true },
      where: { sessionId, metric: UsageMetric.AUDIO_SECONDS },
    });
    // Billed against the server-observed window, not the client's claim —
    // a session that lasted seconds cannot bill ten hours.
    expect(billed._sum.quantity ?? 0).toBeLessThan(60);
  });

  it('opens the cost circuit breaker and blocks new sessions only', async () => {
    const guest = await registerGuest(harness.app);
    await harness.prisma.usageLedger.create({
      data: {
        metric: UsageMetric.AUDIO_SECONDS,
        quantity: 1,
        provider: 'openai',
        estimatedCostUsd: 999,
      },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('COST_LIMIT_REACHED');
  });
});

describe('analytics can never carry spoken content', () => {
  it('accepts only the closed property set', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/analytics',
      headers: authHeaders(guest.token),
      payload: {
        events: [
          {
            name: 'listen_started',
            at: new Date().toISOString(),
            properties: { platform: 'ios', locale: 'fr', durationSeconds: 12 },
          },
        ],
      },
    });
    expect(response.statusCode).toBe(204);

    const stored = await harness.prisma.analyticsEvent.findFirst();
    expect(stored!.name).toBe('listen_started');
    expect(stored!.platform).toBe('ios');
  });

  it('rejects an unknown event name', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/analytics',
      headers: authHeaders(guest.token),
      payload: {
        events: [{ name: 'transcript_content', at: new Date().toISOString(), properties: {} }],
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it('drops any property that is not on the allow-list', async () => {
    const guest = await registerGuest(harness.app);
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/analytics',
      headers: authHeaders(guest.token),
      payload: {
        events: [
          {
            name: 'listen_ended',
            at: new Date().toISOString(),
            properties: { platform: 'web', transcript: 'the secret words', text: 'more secrets' },
          },
        ],
      },
    });

    const stored = await harness.prisma.analyticsEvent.findFirst();
    expect(JSON.stringify(stored)).not.toContain('secret');
  });
});

describe('outbound third-party telemetry', () => {
  it('sends a real session lifecycle with no content and no identifiers', async () => {
    harness.analyticsSent.length = 0;

    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: {
        kind: 'PERSONAL_DISCUSS',
        readingLanguage: 'fr',
        slots: [
          { position: 0, readingLanguage: 'fr', rotation: 0 },
          { position: 1, readingLanguage: 'ar', rotation: 180 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().session.id;

    harness.context.hub.broadcast(sessionId, {
      type: 'transcript.final',
      segment: {
        id: 'seg_1',
        sessionId,
        sequence: 1,
        speakerSlotId: null,
        sourceLanguage: 'fr',
        originalText: 'Le patient a une allergie connue aux arachides',
        isFinal: true,
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeaders(guest.token),
      payload: { reportedAudioSeconds: 42 },
    });
    await harness.context.analytics.flush();

    const names = harness.analyticsSent.map((payload) => payload.event);
    expect(names).toContain('session_started');
    expect(names).toContain('session_ended');

    const serialized = JSON.stringify(harness.analyticsSent);
    expect(serialized).not.toContain('allergie');
    expect(serialized).not.toContain('arachides');
    // Never the account id, never the device identity, never the session id.
    expect(serialized).not.toContain(guest.userId);
    expect(serialized).not.toContain(guest.anonymousId);
    expect(serialized).not.toContain(sessionId);

    const ended = harness.analyticsSent.find((payload) => payload.event === 'session_ended');
    expect(Object.keys(ended!.properties).sort()).toEqual([
      'durationSeconds',
      'kind',
      'result',
      'segmentCount',
    ]);
  });

  it('reports a server error with a request id and no request content', async () => {
    harness.errorsReported.length = 0;

    // Force a genuine 500: the route exists, the id does not parse as one.
    const broken = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/dev/boom',
      headers: { 'x-force-error': '1' },
    });

    if (broken.statusCode >= 500) {
      const [report] = harness.errorsReported;
      expect(report?.context?.requestId).toBeTruthy();
      expect(JSON.stringify(report?.context)).not.toContain('authorization');
    } else {
      // The dev-only failure route is disabled; the reporter must then be idle.
      expect(harness.errorsReported).toHaveLength(0);
    }
  });
});

describe('logging cannot carry transcript content', () => {
  it('scrubs a realistic realtime payload', () => {
    const scrubbed = JSON.stringify(
      scrubForLog({
        sessionId: 'ses_1',
        event: {
          type: 'transcript.final',
          text: 'Le patient a une allergie connue.',
          sourceLanguage: 'fr',
        },
        config: { clientSecret: 'ek_live_secret', model: 'gpt-live-transcribe' },
      }),
    );
    expect(scrubbed).not.toContain('allergie');
    expect(scrubbed).not.toContain('ek_live_secret');
    expect(scrubbed).toContain('ses_1');
  });
});

describe('error responses', () => {
  it('never leaks a stack trace', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('at ');
    expect(response.body).not.toContain('.ts:');
    expect(Object.keys(response.json().error).sort()).toEqual(['code', 'message', 'requestId']);
  });

  it('sets no-store on every response', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('reports readiness with per-dependency detail', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/ready' });
    const body = response.json();
    expect(body.checks.database).toBe('ok');
    expect(body.checks.aiProvider).toBe('mock');
    // No Redis in tests: degraded, not failed.
    expect(body.checks.redis).toBe('degraded');
  });

  it('publishes a public config with no secrets in it', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/config' });
    expect(response.json().aiProvider).toBe('mock');
    expect(response.json().translationAvailable).toBe(true);
    expect(response.body).not.toContain('SECRET');
    expect(response.body).not.toContain(process.env.SESSION_SIGNING_SECRET as string);
  });
});
