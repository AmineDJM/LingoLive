import { describe, expect, it, vi } from 'vitest';
import {
  constantTimeEquals,
  deriveEncryptionKey,
  generateAccessCode,
  generateAnonymousId,
  hashIdentifier,
  TranscriptCipher,
} from './crypto.js';
import { createToken, InMemoryReplayGuard, RedisReplayGuard, verifyToken } from './tokens.js';
import { CodeAttemptGuard } from '../modules/code-guard.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OLD_KEY = Buffer.alloc(32, 3);
const SECRET = 'a'.repeat(48);

describe('TranscriptCipher', () => {
  const cipher = new TranscriptCipher(KEY, 1);

  it('round-trips text including non-Latin scripts', () => {
    for (const text of [
      'Bonjour à tous.',
      'أهلاً بالجميع، سنبدأ الجلسة الآن.',
      '日本語のテキスト',
      'Emoji survive too 🎙️',
      '',
    ]) {
      expect(cipher.decrypt(cipher.encrypt(text))).toBe(text);
    }
  });

  it('never emits the plaintext', () => {
    const encrypted = cipher.encrypt('the secret phrase');
    expect(encrypted).not.toContain('secret');
    expect(Buffer.from(encrypted.split('.')[3] as string, 'base64url').toString()).not.toContain(
      'secret',
    );
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = cipher.encrypt('same input');
    const b = cipher.encrypt('same input');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe(cipher.decrypt(b));
  });

  it('carries a version prefix so keys can be rotated', () => {
    expect(cipher.encrypt('x').startsWith('v1.')).toBe(true);
  });

  it('decrypts data written under a retired key after rotation', () => {
    const oldCipher = new TranscriptCipher(OLD_KEY.toString('base64'), 1);
    const legacy = oldCipher.encrypt('written before the rotation');

    const rotated = new TranscriptCipher(KEY, 2, [{ version: 1, key: OLD_KEY }]);
    expect(rotated.decrypt(legacy)).toBe('written before the rotation');
    // New writes use the new key.
    expect(rotated.encrypt('after').startsWith('v2.')).toBe(true);
  });

  it('uses a 32-byte base64 key verbatim, so existing ciphertext stays readable', () => {
    // This is the compatibility guarantee. If `deriveEncryptionKey` ever
    // started deriving from this shape instead of using it directly, every
    // transcript encrypted before that change would become unreadable — and
    // nothing would report an error until someone opened an old session.
    expect(deriveEncryptionKey(KEY)).toEqual(Buffer.alloc(32, 7));
    expect(deriveEncryptionKey(OLD_KEY.toString('base64'))).toEqual(OLD_KEY);
  });

  it('derives a key from a platform-generated secret that is not base64 bytes', () => {
    const generated = 'Xk92mQpLvR7dNs4TzBwYh3JfCgEaUiOb';
    const key = deriveEncryptionKey(generated);
    expect(key).toHaveLength(32);
    // Deterministic: two instances of the API must agree.
    expect(deriveEncryptionKey(generated)).toEqual(key);
    // And distinct secrets must not collide.
    expect(deriveEncryptionKey(`${generated}!`)).not.toEqual(key);
  });

  it('round-trips through a derived key', () => {
    const derived = new TranscriptCipher('Xk92mQpLvR7dNs4TzBwYh3JfCgEaUiOb', 1);
    expect(derived.decrypt(derived.encrypt('une phrase privée'))).toBe('une phrase privée');
  });

  it('refuses a secret too short to be worth deriving from', () => {
    expect(() => deriveEncryptionKey('too-short')).toThrow(/at least 32 characters/);
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const encrypted = cipher.encrypt('authentic message');
    const parts = encrypted.split('.');
    const flipped = Buffer.from(parts[3] as string, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.');

    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(cipher.tryDecrypt(tampered)).toBeNull();
  });

  it('rejects a malformed payload', () => {
    expect(() => cipher.decrypt('nonsense')).toThrow(/Malformed/);
    expect(() => cipher.decrypt('v1.a.b')).toThrow(/Malformed/);
    expect(cipher.tryDecrypt('v9.a.b.c')).toBeNull();
  });

  it('refuses a key of the wrong length', () => {
    expect(() => new TranscriptCipher(Buffer.alloc(16).toString('base64'), 1)).toThrow(/32 bytes/);
  });
});

describe('identifier hashing', () => {
  it('is deterministic under the same secret and different under another', () => {
    expect(hashIdentifier('anon_abc', SECRET)).toBe(hashIdentifier('anon_abc', SECRET));
    expect(hashIdentifier('anon_abc', SECRET)).not.toBe(hashIdentifier('anon_abc', 'b'.repeat(48)));
  });

  it('does not reveal the input', () => {
    const hashed = hashIdentifier('anon_0123456789', SECRET);
    expect(hashed).not.toContain('0123456789');
    expect(hashed.length).toBeGreaterThan(20);
  });

  it('compares in constant time without throwing on length mismatch', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('access code generation', () => {
  it('always produces six digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateAccessCode()).toMatch(/^\d{6}$/);
    }
  });

  it('covers the full range including leading zeros', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateAccessCode()));
    // 500 draws from a million values should essentially never collide much.
    expect(codes.size).toBeGreaterThan(490);
  });

  it('generates anonymous ids that are not sequential or guessable', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAnonymousId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^anon_[0-9a-f]{32}$/);
  });
});

describe('signed tokens', () => {
  it('round-trips claims', () => {
    const { token } = createToken(
      { sub: 'user_1', typ: 'access', isGuest: true, ttlSeconds: 60 },
      SECRET,
    );
    const claims = verifyToken(token, SECRET, 'access');
    expect(claims.sub).toBe('user_1');
    expect(claims.isGuest).toBe(true);
    expect(claims.jti).toBeTruthy();
  });

  it('rejects a token signed with another secret', () => {
    const { token } = createToken({ sub: 'u', typ: 'access', ttlSeconds: 60 }, SECRET);
    expect(() => verifyToken(token, 'b'.repeat(48), 'access')).toThrow(/signature/);
  });

  it('rejects a tampered payload', () => {
    const { token } = createToken({ sub: 'u', typ: 'access', ttlSeconds: 60 }, SECRET);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', typ: 'access', exp: 9e9 })).toString(
      'base64url',
    );
    expect(() => verifyToken(`${header}.${forged}.${signature}`, SECRET, 'access')).toThrow();
  });

  it('rejects an expired token', () => {
    const { token } = createToken({ sub: 'u', typ: 'access', ttlSeconds: 60 }, SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(() => verifyToken(token, SECRET, 'access')).toThrow(/expired/);
    vi.useRealTimers();
  });

  it('refuses to use a token minted for another purpose', () => {
    const { token } = createToken(
      { sub: 'u', typ: 'business_join', sessionId: 's', ttlSeconds: 60 },
      SECRET,
    );
    expect(() => verifyToken(token, SECRET, 'access')).toThrow(/not valid for access/);
    expect(() => verifyToken(token, SECRET, 'realtime')).toThrow(/not valid for realtime/);
    expect(verifyToken(token, SECRET, 'business_join').sessionId).toBe('s');
  });

  it('reports a realtime token expiry with a realtime-specific code', () => {
    const { token } = createToken({ sub: 'u', typ: 'realtime', ttlSeconds: 1 }, SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);
    expect(() => verifyToken(token, SECRET, 'realtime')).toThrowError(
      expect.objectContaining({ code: 'REALTIME_TOKEN_EXPIRED' }),
    );
    vi.useRealTimers();
  });

  it('rejects a structurally invalid token', () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c.d']) {
      expect(() => verifyToken(bad, SECRET)).toThrow();
    }
  });
});

describe('replay protection', () => {
  it('accepts a jti once and refuses it afterwards', async () => {
    const guard = new InMemoryReplayGuard();
    expect(await guard.claim('jti-1', 60)).toBe(true);
    expect(await guard.claim('jti-1', 60)).toBe(false);
    expect(await guard.claim('jti-2', 60)).toBe(true);
  });

  it('uses an atomic SET NX when Redis is available', async () => {
    const calls: unknown[][] = [];
    const guard = new RedisReplayGuard({
      set: async (...args: unknown[]) => {
        calls.push(args);
        return calls.length === 1 ? 'OK' : null;
      },
    } as never);

    expect(await guard.claim('jti-x', 60)).toBe(true);
    expect(await guard.claim('jti-x', 60)).toBe(false);
    expect(calls[0]).toEqual(['jti:jti-x', '1', 'EX', 60, 'NX']);
  });
});

describe('CodeAttemptGuard — throttle guessing, not a conference hall', () => {
  it('never blocks a source that keeps succeeding', () => {
    const guard = new CodeAttemptGuard({ maxFailures: 3 });
    for (let i = 0; i < 1000; i++) guard.recordSuccess('ip:1');
    expect(guard.isBlocked('ip:1')).toBe(false);
  });

  it('blocks after repeated failures', () => {
    const guard = new CodeAttemptGuard({ maxFailures: 3 });
    expect(guard.recordFailure('ip:1')).toBe(false);
    expect(guard.recordFailure('ip:1')).toBe(false);
    expect(guard.recordFailure('ip:1')).toBe(true);
    expect(guard.isBlocked('ip:1')).toBe(true);
    // Other sources are unaffected.
    expect(guard.isBlocked('ip:2')).toBe(false);
  });

  it('forgets failures that fall outside the window', () => {
    let now = 1_000_000;
    const guard = new CodeAttemptGuard({ maxFailures: 3, windowMs: 1000, now: () => now });
    guard.recordFailure('ip:1');
    guard.recordFailure('ip:1');
    now += 2000;
    expect(guard.recordFailure('ip:1')).toBe(false);
    expect(guard.isBlocked('ip:1')).toBe(false);
  });

  it('unblocks once the block expires', () => {
    let now = 1_000_000;
    const guard = new CodeAttemptGuard({
      maxFailures: 2,
      blockMs: 5000,
      now: () => now,
    });
    guard.recordFailure('ip:1');
    guard.recordFailure('ip:1');
    expect(guard.isBlocked('ip:1')).toBe(true);
    now += 6000;
    expect(guard.isBlocked('ip:1')).toBe(false);
  });

  it('clears a source’s history after a success', () => {
    const guard = new CodeAttemptGuard({ maxFailures: 3 });
    guard.recordFailure('ip:1');
    guard.recordFailure('ip:1');
    guard.recordSuccess('ip:1');
    expect(guard.recordFailure('ip:1')).toBe(false);
    expect(guard.recordFailure('ip:1')).toBe(false);
    expect(guard.isBlocked('ip:1')).toBe(false);
  });

  it('prunes stale entries so the map cannot grow without bound', () => {
    let now = 1_000_000;
    const guard = new CodeAttemptGuard({ windowMs: 1000, now: () => now });
    for (let i = 0; i < 100; i++) guard.recordFailure(`ip:${i}`);
    expect(guard.size).toBe(100);
    now += 10_000;
    expect(guard.prune()).toBe(100);
    expect(guard.size).toBe(0);
  });
});
