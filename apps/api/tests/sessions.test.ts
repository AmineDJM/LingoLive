import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createHarness,
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

describe('guest onboarding — no account required', () => {
  it('registers a device and returns a usable token', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { anonymousId: 'a'.repeat(32), platform: 'ios', locale: 'fr' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.user.isGuest).toBe(true);
    expect(body.user.preferredLocale).toBe('fr');
    expect(body.user.entitlement.plan).toBe('GUEST');
    expect(body.user.quota.businessJoinIsFree).toBe(true);
  });

  it('never stores the raw anonymous identifier', async () => {
    const anonymousId = 'b'.repeat(32);
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { anonymousId, platform: 'web' },
    });

    const devices = await harness.prisma.device.findMany();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.anonymousIdHash).not.toBe(anonymousId);
    expect(devices[0]!.anonymousIdHash).not.toContain(anonymousId);
  });

  it('recognises the same device on a second launch', async () => {
    const anonymousId = 'c'.repeat(32);
    const first = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { anonymousId, platform: 'web' },
    });
    const second = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { anonymousId, platform: 'web' },
    });

    expect(first.json().user.id).toBe(second.json().user.id);
    expect(await harness.prisma.user.count()).toBe(1);
  });

  it('rejects a too-short anonymous identifier', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { anonymousId: 'short', platform: 'web' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('listen sessions', () => {
  it('creates, transcribes, ends and saves a session', async () => {
    const guest = await registerGuest(harness.app);

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN', readingLanguage: 'fr' },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().session.id;
    expect(created.json().session.status).toBe('LIVE');
    // The privacy guarantee, asserted on the wire.
    expect(created.json().session.audioStored).toBe(false);

    const segment = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload: { originalText: 'Bonjour à tous.', sourceLanguage: 'fr' },
    });
    expect(segment.statusCode).toBe(201);
    expect(segment.json().segment.sequence).toBe(1);

    const ended = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeaders(guest.token),
      payload: { reportedAudioSeconds: 42 },
    });
    expect(ended.json().session.status).toBe('ENDED');

    // Nothing is in history until the user explicitly saves.
    const beforeSave = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/history',
      headers: authHeaders(guest.token),
    });
    expect(beforeSave.json().items).toHaveLength(0);

    const saved = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/save`,
      headers: authHeaders(guest.token),
      payload: { confirmed: true, title: 'Réunion produit' },
    });
    expect(saved.json().session.saveRequested).toBe(true);

    const afterSave = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/history',
      headers: authHeaders(guest.token),
    });
    expect(afterSave.json().items).toHaveLength(1);
    expect(afterSave.json().items[0].title).toBe('Réunion produit');
    expect(afterSave.json().items[0].preview).toContain('Bonjour');
  });

  it('refuses to save without explicit confirmation', async () => {
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
      url: `/api/v1/sessions/${sessionId}/save`,
      headers: authHeaders(guest.token),
      payload: { title: 'sneaky' },
    });
    expect(response.statusCode).toBe(422);
  });

  it('stores transcript text encrypted, never as plaintext', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN', readingLanguage: 'fr' },
    });
    const sessionId = created.json().session.id;

    const secret = 'Le patient présente une allergie à la pénicilline.';
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload: { originalText: secret, sourceLanguage: 'fr' },
    });

    const rows = await harness.prisma.transcriptSegment.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.originalTextEncrypted).not.toContain('pénicilline');
    expect(rows[0]!.originalTextEncrypted).not.toContain(secret);
    expect(rows[0]!.originalTextEncrypted.startsWith('v1.')).toBe(true);
    // Length metadata is kept in the clear so the operator console can show
    // it without ever decrypting.
    expect(rows[0]!.characterCount).toBe(secret.length);

    // And it round-trips through the API.
    const segments = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
    });
    expect(segments.json().segments[0].segment.originalText).toBe(secret);
  });

  it('assigns gap-free sequence numbers', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    for (let i = 0; i < 5; i++) {
      await harness.app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/segments`,
        headers: authHeaders(guest.token),
        payload: { originalText: `Line ${i}` },
      });
    }

    const segments = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
    });
    const sequences = segments
      .json()
      .segments.map((s: { segment: { sequence: number } }) => s.segment.sequence);
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
  });

  it('is idempotent on a retried segment — a reconnect cannot duplicate it', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    const payload = { originalText: 'Retried line', clientSegmentId: 'client-abc' };
    const first = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload,
    });
    const second = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload,
    });

    expect(first.json().segment.id).toBe(second.json().segment.id);
    expect(await harness.prisma.transcriptSegment.count()).toBe(1);
  });

  it('replays only the missing segments after a reconnection', async () => {
    const guest = await registerGuest(harness.app);
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    for (let i = 1; i <= 6; i++) {
      await harness.app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/segments`,
        headers: authHeaders(guest.token),
        payload: { originalText: `Line ${i}` },
      });
    }

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/segments?afterSequence=4`,
      headers: authHeaders(guest.token),
    });
    const sequences = response
      .json()
      .segments.map((s: { segment: { sequence: number } }) => s.segment.sequence);
    expect(sequences).toEqual([5, 6]);
  });

  it('hides another user’s session behind a 404, not a 403', async () => {
    const owner = await registerGuest(harness.app);
    const stranger = await registerGuest(harness.app);

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(owner.token),
      payload: { kind: 'PERSONAL_LISTEN' },
    });
    const sessionId = created.json().session.id;

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: authHeaders(stranger.token),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('SESSION_NOT_FOUND');
  });

  it('deletes a session and everything under it', async () => {
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
      payload: { originalText: 'To be deleted' },
    });

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/sessions/${sessionId}`,
      headers: authHeaders(guest.token),
    });
    expect(response.statusCode).toBe(204);
    expect(await harness.prisma.session.count()).toBe(0);
    expect(await harness.prisma.transcriptSegment.count()).toBe(0);
  });

  it('exports a transcript as text', async () => {
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
      payload: { originalText: 'First line.' },
    });
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/segments`,
      headers: authHeaders(guest.token),
      payload: { originalText: 'Second line.' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/export?format=txt`,
      headers: authHeaders(guest.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('First line.\n\nSecond line.');
  });
});

describe('discussion sessions', () => {
  it('creates a four-person discussion with per-tile languages and rotations', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: {
        kind: 'PERSONAL_DISCUSS',
        slots: [
          { position: 0, readingLanguage: 'fr', rotation: 0 },
          { position: 1, readingLanguage: 'en', rotation: 90 },
          { position: 2, readingLanguage: 'ar', rotation: 180 },
          { position: 3, readingLanguage: 'pt-BR', rotation: 270 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const slots = response.json().session.slots;
    expect(slots).toHaveLength(4);
    expect(slots.map((s: { rotation: number }) => s.rotation)).toEqual([0, 90, 180, 270]);
    expect(slots.map((s: { readingLanguage: string }) => s.readingLanguage)).toEqual([
      'fr',
      'en',
      'ar',
      'pt-BR',
    ]);
  });

  it('rejects a discussion with fewer than two people', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: {
        kind: 'PERSONAL_DISCUSS',
        slots: [{ position: 0, readingLanguage: 'fr', rotation: 0 }],
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it('rejects an unsupported language', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: {
        kind: 'PERSONAL_DISCUSS',
        slots: [
          { position: 0, readingLanguage: 'fr', rotation: 0 },
          { position: 1, readingLanguage: 'xx-ZZ', rotation: 180 },
        ],
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it('refuses to create a broadcast session through the personal endpoint', async () => {
    const guest = await registerGuest(harness.app);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'BUSINESS_BROADCAST' },
    });
    expect(response.statusCode).toBe(422);
  });
});

describe('authentication boundaries', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered token', async () => {
    const guest = await registerGuest(harness.app);
    const tampered = `${guest.token.slice(0, -4)}AAAA`;
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeaders(tampered),
    });
    expect(response.statusCode).toBe(401);
  });

  it('always includes a requestId in an error response', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.json().error.requestId).toMatch(/^req_/);
  });
});
