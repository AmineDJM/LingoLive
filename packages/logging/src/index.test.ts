import { describe, expect, it } from 'vitest';
import { maskEmail, maskIdentifier, maskIpAddress, REDACTED, scrubForLog } from './index.js';

describe('scrubForLog — transcripts can never reach a log sink', () => {
  it('removes transcript content under any of its known keys', () => {
    const scrubbed = scrubForLog({
      sessionId: 'ses_123',
      text: 'Nous allons présenter les résultats du troisième trimestre.',
      originalText: 'confidential words',
      translatedText: 'palabras confidenciales',
      segments: [{ originalText: 'secret' }],
    }) as Record<string, unknown>;

    expect(scrubbed.sessionId).toBe('ses_123');
    expect(scrubbed.text).toBe(REDACTED);
    expect(scrubbed.originalText).toBe(REDACTED);
    expect(scrubbed.translatedText).toBe(REDACTED);
    expect(scrubbed.segments).toBe(REDACTED);
    expect(JSON.stringify(scrubbed)).not.toContain('trimestre');
    expect(JSON.stringify(scrubbed)).not.toContain('confidencial');
  });

  it('removes credentials under any casing or nesting', () => {
    const scrubbed = scrubForLog({
      accessToken: 'eyJ-secret',
      config: { clientSecret: 'ek_live_abc', model: 'gpt-live-transcribe' },
      headers: { Authorization: 'Bearer abc123' },
      openaiApiKey: 'sk-live-xyz',
    }) as Record<string, unknown>;

    const serialised = JSON.stringify(scrubbed);
    expect(serialised).not.toContain('eyJ-secret');
    expect(serialised).not.toContain('ek_live_abc');
    expect(serialised).not.toContain('abc123');
    expect(serialised).not.toContain('sk-live-xyz');
    expect((scrubbed.config as Record<string, unknown>).model).toBe('gpt-live-transcribe');
  });

  it('masks e-mail addresses', () => {
    const scrubbed = scrubForLog({ email: 'amine.djouamaii@example.com' }) as Record<
      string,
      unknown
    >;
    expect(scrubbed.email).toBe('a***i@example.com');
  });

  it('truncates suspiciously long strings', () => {
    const scrubbed = scrubForLog({ note: 'x'.repeat(500) }) as { note: string };
    expect(scrubbed.note.endsWith('…[truncated]')).toBe(true);
    expect(scrubbed.note.length).toBeLessThan(200);
  });

  it('caps recursion and array length', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(() => scrubForLog(deep)).not.toThrow();
    const array = scrubForLog(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(array.length).toBe(20);
  });

  it('keeps errors loggable without leaking a stack in the payload', () => {
    const scrubbed = scrubForLog(new Error('boom')) as Record<string, unknown>;
    expect(scrubbed.message).toBe('boom');
    expect(scrubbed.stack).toBeUndefined();
  });

  it('passes through safe operational fields', () => {
    const scrubbed = scrubForLog({
      requestId: 'req_1',
      durationMs: 42,
      status: 200,
      ok: true,
    }) as Record<string, unknown>;
    expect(scrubbed).toEqual({ requestId: 'req_1', durationMs: 42, status: 200, ok: true });
  });
});

describe('masking helpers', () => {
  it('masks e-mails safely', () => {
    expect(maskEmail('ab@example.com')).toBe('a***b@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
    expect(maskEmail('not-an-email')).toBe(REDACTED);
    expect(maskEmail(null)).toBeNull();
  });

  it('masks identifiers', () => {
    expect(maskIdentifier('anon_0123456789abcdef')).toBe('anon_0…');
    expect(maskIdentifier('short')).toBe(REDACTED);
  });

  it('truncates IP addresses to a network prefix', () => {
    expect(maskIpAddress('203.0.113.42')).toBe('203.0.113.0/24');
    expect(maskIpAddress('::ffff:203.0.113.42')).toBe('203.0.113.0/24');
    expect(maskIpAddress('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::/48');
    expect(maskIpAddress(null)).toBeNull();
  });
});
