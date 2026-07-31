import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * @lingolive/logging — structured logs that are *incapable* of carrying spoken
 * content.
 *
 * Two layers of defence:
 *  1. pino's `redact` removes known-sensitive paths from anything logged;
 *  2. `scrubForLog()` is applied to every value the API attaches to a log line,
 *     so a new field cannot accidentally smuggle a transcript through.
 */

/** Object paths pino replaces with `[redacted]`. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-token"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'token',
  'accessToken',
  'refreshToken',
  'realtimeToken',
  'organizerToken',
  'clientSecret',
  'client_secret',
  'apiKey',
  'api_key',
  'password',
  'secret',
  'code',
  'joinToken',
  'identityToken',
  '*.token',
  '*.clientSecret',
  '*.accessToken',
  // Transcript content — must never reach a log sink under any key.
  'text',
  'originalText',
  'translatedText',
  'transcript',
  'segments',
  'partial',
  'audio',
  'prompt',
  '*.text',
  '*.originalText',
  '*.translatedText',
] as const;

/** Keys whose *value* is dropped entirely by `scrubForLog`. */
const FORBIDDEN_KEYS = new Set(
  [
    'text',
    'originaltext',
    'translatedtext',
    'transcript',
    'transcripts',
    'segment',
    'segments',
    'partial',
    'delta',
    'audio',
    'audiodata',
    'buffer',
    'prompt',
    'messages',
    'token',
    'accesstoken',
    'refreshtoken',
    'realtimetoken',
    'organizertoken',
    'identitytoken',
    'jointoken',
    'clientsecret',
    'client_secret',
    'apikey',
    'api_key',
    'authorization',
    'cookie',
    'password',
    'secret',
    'code',
    'codehash',
    'anonymousid',
  ].map((k) => k.toLowerCase()),
);

export const REDACTED = '[redacted]';

/**
 * An e-mail address is often needed for support, but the full address rarely
 * is. `a***e@example.com` is enough to correlate without storing the identity
 * in every log line.
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return REDACTED;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local[0] ?? '';
  const tail = local.length > 1 ? local[local.length - 1] : '';
  return `${head}***${tail}@${domain}`;
}

/** Keeps an identifier correlatable without making it reversible in a log. */
export function maskIdentifier(value: string | null | undefined, keep = 6): string | null {
  if (!value) return null;
  if (value.length <= keep) return REDACTED;
  return `${value.slice(0, keep)}…`;
}

/**
 * Truncates an IP to /24 (IPv4) or /48 (IPv6). Enough to spot an abusive
 * network, not enough to identify a person.
 */
export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const cleaned = ip.replace(/^::ffff:/, '');
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length !== 4) return REDACTED;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    return `${parts.slice(0, 3).join(':')}::/48`;
  }
  return REDACTED;
}

/**
 * Recursively removes anything that could carry user speech or a credential.
 * Long strings are truncated because a 4 000-character field in a log is
 * almost always a transcript that slipped through.
 */
export function scrubForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 120)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubForLog(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        out[key] = REDACTED;
        continue;
      }
      if (/(secret|token|password|apikey|api_key)/i.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      if (key.toLowerCase() === 'email') {
        out[key] = maskEmail(String(entry));
        continue;
      }
      out[key] = scrubForLog(entry, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

export interface CreateLoggerOptions {
  level?: string;
  name?: string;
  environment?: string;
  /** Human-readable output for local development. */
  pretty?: boolean;
  /** Extra static fields attached to every line. */
  base?: Record<string, unknown>;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const {
    level = 'info',
    name = 'lingolive',
    environment = 'development',
    pretty = false,
  } = options;

  const pinoOptions: LoggerOptions = {
    level,
    name,
    base: { env: environment, ...options.base },
    redact: { paths: [...REDACTED_PATHS], censor: REDACTED, remove: false },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  if (pretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,env' },
      },
    });
  }

  return pino(pinoOptions);
}

export type { Logger };

/** No-op logger for tests that assert behaviour rather than output. */
export function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}
