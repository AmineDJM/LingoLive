import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseJoinLink } from '@lingolive/realtime-core';
import { createHarness, registerGuest, resetDatabase, type TestHarness } from './helpers.js';

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

async function createRoom(
  overrides: Partial<{ targetLanguages: string[]; maxParticipants: number; title: string }> = {},
) {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/dev/business/sessions',
    payload: {
      title: overrides.title ?? 'Conférence internationale 2026',
      organizerName: 'Example Organization',
      sourceLanguage: 'fr',
      targetLanguages: overrides.targetLanguages ?? ['en', 'ar', 'pt-BR'],
      ...(overrides.maxParticipants !== undefined
        ? { maxParticipants: overrides.maxParticipants }
        : {}),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as {
    sessionId: string;
    code: string;
    joinUrl: string;
    deepLink: string;
  };
}

describe('joining a LingoBusiness session', () => {
  it('resolves a six-digit code to a room preview without joining', async () => {
    const room = await createRoom();

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/business/sessions/${room.code}`,
    });

    expect(response.statusCode).toBe(200);
    const session = response.json().session;
    expect(session.title).toBe('Conférence internationale 2026');
    expect(session.organizerName).toBe('Example Organization');
    expect(session.availableLanguages.sort()).toEqual(['ar', 'en', 'pt-BR']);
  });

  it('lets a guest join with no account at all', async () => {
    const room = await createRoom();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: {
        code: room.code,
        targetLanguage: 'ar',
        anonymousId: 'z'.repeat(32),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.requiresAccount).toBe(false);
    expect(body.realtimeToken).toBeTruthy();
    expect(body.targetLanguage).toBe('ar');
    expect(body.realtimeUrl.startsWith('ws')).toBe(true);

    // No user account was created for the viewer.
    expect(await harness.prisma.user.count()).toBe(0);
    expect(await harness.prisma.participant.count()).toBe(1);
  });

  it('accepts a code typed with spaces or dashes', async () => {
    const room = await createRoom();
    const spaced = `${room.code.slice(0, 3)} ${room.code.slice(3)}`;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: spaced, targetLanguage: 'en' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('never stores the access code in the clear', async () => {
    const room = await createRoom();
    const codes = await harness.prisma.businessAccessCode.findMany();
    expect(codes).toHaveLength(1);
    expect(codes[0]!.codeHash).not.toBe(room.code);
    expect(codes[0]!.codeHash).not.toContain(room.code);
  });

  it('produces a QR/deep-link pair that round-trips', async () => {
    const room = await createRoom();
    expect(parseJoinLink(room.joinUrl)?.code).toBe(room.code);
    expect(parseJoinLink(room.deepLink)?.code).toBe(room.code);
    expect(room.deepLink.startsWith('lingolive://join/')).toBe(true);
    // The QR payload is https so a viewer without the app lands on the web player.
    expect(room.joinUrl.startsWith('http')).toBe(true);
  });

  it('rejects an invalid code', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: '000000', targetLanguage: 'en' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('INVALID_ACCESS_CODE');
  });

  it('rejects a malformed code without touching the database', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/business/sessions/12',
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects a code once the session has ended', async () => {
    const room = await createRoom();
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/dev/business/sessions/${room.sessionId}/end`,
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.code, targetLanguage: 'en' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SESSION_ALREADY_ENDED');
  });

  it('rejects an expired code', async () => {
    const room = await createRoom();
    await harness.prisma.businessAccessCode.updateMany({
      where: { sessionId: room.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.code, targetLanguage: 'en' },
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe('ACCESS_CODE_EXPIRED');
  });

  it('enforces a participant limit', async () => {
    const room = await createRoom({ maxParticipants: 1 });

    const first = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.code, targetLanguage: 'en' },
    });
    expect(first.statusCode).toBe(200);

    const second = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.code, targetLanguage: 'fr' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SESSION_FULL');
  });

  it('lets a viewer change reading language mid-session', async () => {
    const room = await createRoom();
    const joined = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code: room.code, targetLanguage: 'en' },
    });
    const { participantId } = joined.json();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/business/sessions/${room.sessionId}/language`,
      payload: { participantId, targetLanguage: 'ar' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().targetLanguage).toBe('ar');

    const participant = await harness.prisma.participant.findUnique({
      where: { id: participantId },
    });
    expect(participant!.targetLanguage).toBe('ar');
  });

  it('joining never consumes personal quota', async () => {
    const room = await createRoom();
    const guest = await registerGuest(harness.app);

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      headers: { authorization: `Bearer ${guest.token}` },
      payload: { code: room.code, targetLanguage: 'en' },
    });

    const usage = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/usage',
      headers: { authorization: `Bearer ${guest.token}` },
    });
    expect(usage.json().usage.audioSeconds).toBe(0);
    expect(usage.json().usage.quota.businessJoinIsFree).toBe(true);
  });
});

describe('fan-out — the cost rule', () => {
  it('translates each utterance once per distinct language, not once per viewer', async () => {
    const room = await createRoom({ targetLanguages: ['en', 'ar'] });

    // Six viewers, but only two distinct reading languages between them.
    for (const language of ['en', 'en', 'en', 'ar', 'ar', 'ar']) {
      const joined = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/business/join',
        payload: { code: room.code, targetLanguage: language },
      });
      expect(joined.statusCode).toBe(200);
    }

    const spoken = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/speak',
      payload: { sessionId: room.sessionId, language: 'fr', count: 1 },
    });

    expect(spoken.statusCode).toBe(200);
    const body = spoken.json();
    expect(body.activeLanguages.sort()).toEqual(['ar', 'en']);
    // Two translations for six viewers.
    expect(body.translationsPerformed).toBe(2);

    const translations = await harness.prisma.translation.findMany();
    expect(translations).toHaveLength(2);
    expect(translations.map((t) => t.targetLanguage).sort()).toEqual(['ar', 'en']);
  });

  it('never translates into the language actually being spoken', async () => {
    const room = await createRoom({ targetLanguages: ['fr', 'en'] });
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/speak',
      payload: { sessionId: room.sessionId, language: 'fr', count: 1 },
    });

    const translations = await harness.prisma.translation.findMany();
    expect(translations.map((t) => t.targetLanguage)).toEqual(['en']);
  });

  it('stores each translation encrypted and exactly once', async () => {
    const room = await createRoom({ targetLanguages: ['en'] });
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/speak',
      payload: { sessionId: room.sessionId, language: 'fr', text: 'Bonjour à tous.' },
    });
    // Speaking the identical line again must not create a second translation
    // row for the same segment.
    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/speak',
      payload: { sessionId: room.sessionId, language: 'fr', text: 'Bonjour à tous.' },
    });

    const translations = await harness.prisma.translation.findMany();
    // Two segments, one translation each — and the second reused the cache.
    expect(translations).toHaveLength(2);
    for (const translation of translations) {
      expect(translation.translatedTextEncrypted.startsWith('v1.')).toBe(true);
      expect(translation.translatedTextEncrypted).not.toContain('Hello');
    }
  });
});

describe('the development simulator is not a production surface', () => {
  it('is absent when the simulator is disabled', async () => {
    const isolated = await createHarness({ ENABLE_DEV_SIMULATOR: 'false' });
    try {
      const response = await isolated.app.inject({
        method: 'POST',
        url: '/api/v1/dev/business/sessions',
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await isolated.close();
    }
  });
});
