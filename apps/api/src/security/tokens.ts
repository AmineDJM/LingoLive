import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { LingoLiveError } from '@lingolive/contracts';

/**
 * Compact signed tokens (JWT-shaped, HS256) used for:
 *  - guest and account access tokens;
 *  - realtime participant tokens (one per session join);
 *  - LingoBusiness join tokens embedded in a QR/deep link.
 *
 * Written here rather than pulled from a JWT library because the surface we
 * need is tiny and completely specified, and because realtime tokens carry an
 * extra property no JWT library models: single use.
 */

export interface TokenClaims {
  /** Subject: user id, or `guest:<hash>` for an anonymous participant. */
  sub: string;
  /** Token purpose. A token minted for one purpose cannot be used for another. */
  typ: 'access' | 'refresh' | 'realtime' | 'business_join' | 'organizer';
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Random per-token id, used to enforce single use on realtime tokens. */
  jti: string;
  sessionId?: string;
  participantId?: string;
  role?: string;
  targetLanguage?: string;
  isAdmin?: boolean;
  isGuest?: boolean;
  [key: string]: unknown;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createToken(
  claims: Omit<TokenClaims, 'iat' | 'exp' | 'jti'> & { ttlSeconds: number; jti?: string },
  secret: string,
): { token: string; expiresAt: Date; jti: string } {
  const { ttlSeconds, jti: providedJti, ...rest } = claims;
  const now = Math.floor(Date.now() / 1000);
  const jti = providedJti ?? randomBytes(12).toString('base64url');
  const payload = { ...rest, iat: now, exp: now + ttlSeconds, jti } as TokenClaims;

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`, secret);

  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: new Date(payload.exp * 1000),
    jti,
  };
}

export function verifyToken(
  token: string,
  secret: string,
  expectedType?: TokenClaims['typ'],
): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new LingoLiveError('UNAUTHORIZED', 'Malformed token');
  }
  const [header, body, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${body}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new LingoLiveError('UNAUTHORIZED', 'Invalid token signature');
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenClaims;
  } catch {
    throw new LingoLiveError('UNAUTHORIZED', 'Malformed token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    throw new LingoLiveError(
      expectedType === 'realtime' ? 'REALTIME_TOKEN_EXPIRED' : 'UNAUTHORIZED',
      'Token expired',
    );
  }
  if (expectedType && claims.typ !== expectedType) {
    throw new LingoLiveError(
      expectedType === 'realtime' ? 'REALTIME_TOKEN_INVALID' : 'UNAUTHORIZED',
      `Token is not valid for ${expectedType}`,
    );
  }

  return claims;
}

/**
 * Single-use enforcement for realtime tokens.
 *
 * A leaked short-lived token is bad; a leaked short-lived token that can be
 * replayed to open a second stream is bad *and* expensive. Backed by Redis in
 * production so the guarantee holds across API instances; the in-memory
 * fallback keeps development and tests working without Redis.
 */
export interface TokenReplayGuard {
  /** Returns true the first time a jti is seen, false on every replay. */
  claim(jti: string, ttlSeconds: number): Promise<boolean>;
}

export class InMemoryReplayGuard implements TokenReplayGuard {
  private readonly seen = new Map<string, number>();

  async claim(jti: string, ttlSeconds: number): Promise<boolean> {
    this.prune();
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, Date.now() + ttlSeconds * 1000);
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [jti, expiry] of this.seen) {
      if (expiry <= now) this.seen.delete(jti);
    }
  }
}

export interface RedisLike {
  set(
    key: string,
    value: string,
    mode: 'EX',
    seconds: number,
    condition: 'NX',
  ): Promise<string | null>;
}

export class RedisReplayGuard implements TokenReplayGuard {
  constructor(private readonly redis: RedisLike) {}

  async claim(jti: string, ttlSeconds: number): Promise<boolean> {
    // SET NX is atomic: exactly one caller can win, across every instance.
    const result = await this.redis.set(`jti:${jti}`, '1', 'EX', Math.max(1, ttlSeconds), 'NX');
    return result === 'OK';
  }
}
