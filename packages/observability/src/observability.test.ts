import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS,
  ENUM_PROPERTIES,
  analyticsCatalogue,
  buildEvent,
  createAnalytics,
  createErrorReporter,
  envelopeUrl,
  isAnalyticsEvent,
  parseDsn,
  sanitizeProperties,
  scrubMessage,
  type AnalyticsPayload,
} from './index.js';

const TRANSCRIPT = 'Bonjour tout le monde, je suis ravi de vous parler aujourd’hui';

describe('analytics catalogue', () => {
  it('declares a purpose and properties for every event', () => {
    for (const [name, definition] of Object.entries(ANALYTICS_EVENTS)) {
      expect(definition.purpose.length, name).toBeGreaterThan(10);
      expect(Array.isArray(definition.properties), name).toBe(true);
    }
  });

  it('has no property that could plausibly hold spoken content', () => {
    const banned = /text|transcript|content|message|body|caption|phrase|utterance|prompt/i;
    for (const [name, definition] of Object.entries(ANALYTICS_EVENTS)) {
      for (const property of definition.properties) {
        expect(banned.test(property), `${name}.${property}`).toBe(false);
      }
    }
  });

  it('only allows string values on declared enum properties', () => {
    const stringProperties = new Set<string>(ENUM_PROPERTIES);
    for (const definition of Object.values(ANALYTICS_EVENTS)) {
      for (const property of definition.properties) {
        const isCountLike = /Count$|Seconds$/.test(property);
        expect(stringProperties.has(property) || isCountLike).toBe(true);
      }
    }
  });

  it('exposes the catalogue for the privacy documentation', () => {
    const catalogue = analyticsCatalogue();
    expect(catalogue.length).toBe(Object.keys(ANALYTICS_EVENTS).length);
    expect(catalogue.every((entry) => entry.purpose.length > 0)).toBe(true);
  });
});

describe('sanitizeProperties', () => {
  it('drops undeclared properties', () => {
    const result = sanitizeProperties('session_started', {
      kind: 'PERSONAL_LISTEN',
      transcript: TRANSCRIPT,
      secretToken: 'abc',
    });
    expect(result).toEqual({ kind: 'PERSONAL_LISTEN' });
  });

  it('drops a sentence smuggled through a declared enum property', () => {
    const result = sanitizeProperties('session_started', { readingLanguage: TRANSCRIPT });
    expect(result.readingLanguage).toBeUndefined();
  });

  it('keeps counts, durations and booleans', () => {
    const result = sanitizeProperties('session_ended', {
      durationSeconds: 91,
      segmentCount: 12,
      kind: 'PERSONAL_DISCUSS',
      result: 'completed',
    });
    expect(result).toEqual({
      durationSeconds: 91,
      segmentCount: 12,
      kind: 'PERSONAL_DISCUSS',
      result: 'completed',
    });
  });

  it('drops NaN and Infinity rather than sending them', () => {
    const result = sanitizeProperties('session_ended', {
      durationSeconds: Number.NaN,
      segmentCount: Number.POSITIVE_INFINITY,
    });
    expect(result).toEqual({});
  });

  it('recognises catalogue membership', () => {
    expect(isAnalyticsEvent('session_started')).toBe(true);
    expect(isAnalyticsEvent('transcript_text')).toBe(false);
  });
});

describe('createAnalytics', () => {
  it('is a no-op when disabled', async () => {
    const sent: AnalyticsPayload[][] = [];
    const analytics = createAnalytics({
      enabled: false,
      apiKey: 'phc_test',
      transport: { send: async (batch) => void sent.push([...batch]) },
    });
    analytics.capture('app_opened', 'anon_1', { platform: 'web' });
    await analytics.flush();
    expect(analytics.enabled).toBe(false);
    expect(sent).toEqual([]);
  });

  it('is a no-op when enabled but unconfigured', () => {
    const analytics = createAnalytics({ enabled: true });
    analytics.capture('app_opened', 'anon_1', { platform: 'web' });
    expect(analytics.pending()).toEqual([]);
  });

  it('rejects an event that is not in the catalogue', () => {
    const errors: unknown[] = [];
    const analytics = createAnalytics({
      enabled: true,
      apiKey: 'phc_test',
      transport: { send: async () => undefined },
      onError: (error) => errors.push(error),
    });
    analytics.capture('user_said_something', 'anon_1', { text: TRANSCRIPT });
    expect(analytics.pending()).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('batches and sends sanitized payloads', async () => {
    const batches: AnalyticsPayload[][] = [];
    const analytics = createAnalytics({
      enabled: true,
      apiKey: 'phc_test',
      transport: { send: async (batch) => void batches.push([...batch]) },
      now: () => new Date('2026-07-31T10:00:00.000Z'),
    });

    analytics.capture('session_started', 'anon_1', {
      kind: 'PERSONAL_LISTEN',
      readingLanguage: 'fr',
      text: TRANSCRIPT,
    });
    await analytics.flush();

    expect(batches).toHaveLength(1);
    expect(batches[0]?.[0]).toEqual({
      event: 'session_started',
      distinctId: 'anon_1',
      properties: { kind: 'PERSONAL_LISTEN', readingLanguage: 'fr' },
      timestamp: '2026-07-31T10:00:00.000Z',
    });
    expect(JSON.stringify(batches)).not.toContain('Bonjour');
  });

  it('swallows transport failures instead of breaking the caller', async () => {
    const errors: unknown[] = [];
    const analytics = createAnalytics({
      enabled: true,
      apiKey: 'phc_test',
      transport: {
        send: async () => {
          throw new Error('posthog is down');
        },
      },
      onError: (error) => errors.push(error),
    });
    analytics.capture('app_opened', 'anon_1', { platform: 'ios' });
    await expect(analytics.flush()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});

describe('error reporter', () => {
  it('parses a DSN into an envelope endpoint', () => {
    const dsn = parseDsn('https://abc123@o1.ingest.sentry.io/456');
    expect(dsn).toEqual({
      publicKey: 'abc123',
      host: 'o1.ingest.sentry.io',
      projectId: '456',
      protocol: 'https',
      path: '',
    });
    expect(envelopeUrl(dsn!)).toBe('https://o1.ingest.sentry.io/api/456/envelope/');
  });

  it('rejects a malformed DSN instead of throwing at startup', () => {
    expect(parseDsn('not-a-dsn')).toBeNull();
    expect(parseDsn('https://o1.ingest.sentry.io/456')).toBeNull();
  });

  it('is disabled with no DSN', () => {
    const reporter = createErrorReporter({});
    reporter.captureException(new Error('boom'));
    expect(reporter.enabled).toBe(false);
  });

  it('sends only type, scrubbed message and enum tags', async () => {
    const sent: Array<{ url: string; body: string }> = [];
    const reporter = createErrorReporter({
      dsn: 'https://key@sentry.example/9',
      environment: 'staging',
      release: '1.0.0',
      random: () => 0.5,
      now: () => new Date('2026-07-31T10:00:00.000Z'),
      send: async (url, body) => void sent.push({ url, body }),
    });

    reporter.captureException(new Error(`Translation failed for "${TRANSCRIPT}"`), {
      requestId: 'req_1',
      route: '/api/v1/sessions',
      role: 'GUEST',
    });
    await reporter.flush();

    expect(sent).toHaveLength(1);
    const lines = sent[0]!.body.split('\n');
    const event = JSON.parse(lines[2]!) as Record<string, unknown>;
    expect((event.exception as { values: Array<{ type: string }> }).values[0]?.type).toBe('Error');
    expect(event.tags).toEqual({ request_id: 'req_1', route: '/api/v1/sessions', role: 'GUEST' });
    expect(sent[0]!.body).not.toContain('Bonjour');
  });

  it('respects the sample rate', async () => {
    const sent: string[] = [];
    const reporter = createErrorReporter({
      dsn: 'https://key@sentry.example/9',
      sampleRate: 0.1,
      random: () => 0.9,
      send: async (_url, body) => void sent.push(body),
    });
    reporter.captureException(new Error('boom'));
    await reporter.flush();
    expect(sent).toEqual([]);
  });

  it('never lets a failing reporter surface to the caller', async () => {
    const errors: unknown[] = [];
    const reporter = createErrorReporter({
      dsn: 'https://key@sentry.example/9',
      random: () => 0.1,
      send: async () => {
        throw new Error('sentry unreachable');
      },
      onError: (error) => errors.push(error),
    });
    expect(() => reporter.captureException(new Error('boom'))).not.toThrow();
    await reporter.flush();
    expect(errors).toHaveLength(1);
  });
});

describe('scrubMessage', () => {
  it('removes credentials, tokens, e-mails, codes and long quoted strings', () => {
    expect(scrubMessage('key sk-abcdefgh12345678 rejected')).toContain('[redacted-key]');
    expect(scrubMessage('token aaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc bad')).toContain(
      '[redacted-token]',
    );
    expect(scrubMessage('no user amine@example.com here')).toContain('[redacted-email]');
    expect(scrubMessage('join code 728416 invalid')).toContain('[redacted-code]');
    expect(scrubMessage(`failed on "${TRANSCRIPT}"`)).toBe('failed on "[redacted]"');
  });

  it('leaves an ordinary engineering message intact', () => {
    expect(scrubMessage('Prisma connection pool timeout after 10s')).toBe(
      'Prisma connection pool timeout after 10s',
    );
  });
});

describe('buildEvent', () => {
  it('contains no request body, headers or user identity', () => {
    const event = buildEvent(new Error('boom'), {
      eventId: 'a'.repeat(32),
      timestamp: 1_780_000_000,
      context: { requestId: 'req_9', tags: { transport: 'websocket' } },
    });
    const serialized = JSON.stringify(event);
    for (const forbidden of ['authorization', 'cookie', 'body', 'headers', 'email', 'user']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
    expect(event.level).toBe('error');
  });

  it('handles a thrown non-Error', () => {
    const event = buildEvent('plain string failure', {
      eventId: 'b'.repeat(32),
      timestamp: 1_780_000_000,
    });
    expect(event.exception.values[0]).toEqual({ type: 'string', value: 'plain string failure' });
  });
});
