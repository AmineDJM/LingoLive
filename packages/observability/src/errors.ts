/**
 * Optional crash/error reporting.
 *
 * Deliberately not built on a vendor SDK. Two reasons:
 *
 *  1. An SDK installs global handlers and instrumentation whose exact
 *     behaviour changes between minor versions; here the *only* thing that
 *     leaves the process is what `buildEvent` produced, and that function is
 *     unit-tested against transcript leakage.
 *  2. LingoLive must run with no vendor at all. With `SENTRY_DSN` empty this
 *     module allocates nothing and sends nothing.
 *
 * The wire format is Sentry's documented envelope endpoint, so an existing
 * Sentry project works unchanged. Swapping in the official SDK later is a
 * change to this file only — see docs/ARCHITECTURE.md.
 */

export interface ErrorReportContext {
  /** Correlates the report with the API log line the user can quote. */
  requestId?: string | undefined;
  route?: string | undefined;
  /** Role only — never an e-mail, never a name. */
  role?: string | undefined;
  tags?: Readonly<Record<string, string>> | undefined;
}

export interface ErrorReporter {
  readonly enabled: boolean;
  captureException(error: unknown, context?: ErrorReportContext): void;
  flush(): Promise<void>;
}

export interface ErrorReporterOptions {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
  /** 0..1. Non-error events are not sent at all, so this gates errors only. */
  sampleRate?: number;
  /** Injected in tests. */
  send?: (url: string, body: string, headers: Record<string, string>) => Promise<void>;
  random?: () => number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

const DISABLED: ErrorReporter = {
  enabled: false,
  captureException: () => undefined,
  flush: async () => undefined,
};

export interface ParsedDsn {
  readonly publicKey: string;
  readonly host: string;
  readonly projectId: string;
  readonly protocol: string;
  readonly path: string;
}

/** `https://<key>@<host>/<project>` → the envelope endpoint parts. */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split('/').filter(Boolean).pop();
    if (!url.username || !projectId) return null;
    const path = url.pathname.split('/').filter(Boolean).slice(0, -1).join('/');
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(':', ''),
      path: path ? `/${path}` : '',
    };
  } catch {
    return null;
  }
}

export function envelopeUrl(dsn: ParsedDsn): string {
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

export interface ReportEvent {
  readonly event_id: string;
  readonly timestamp: number;
  readonly platform: 'node' | 'javascript';
  readonly level: 'error';
  readonly environment?: string;
  readonly release?: string;
  readonly tags: Record<string, string>;
  readonly exception: {
    values: Array<{ type: string; value: string; stacktrace?: { frames: unknown[] } }>;
  };
}

/**
 * Builds the event that would be sent.
 *
 * Exported so the tests can assert the exact payload. Note what is *not* here:
 * no request body, no headers, no query string, no user identity, no message
 * beyond the exception type and a truncated exception message.
 */
export function buildEvent(
  error: unknown,
  options: {
    context?: ErrorReportContext | undefined;
    environment?: string | undefined;
    release?: string | undefined;
    eventId: string;
    timestamp: number;
    platform?: 'node' | 'javascript';
    scrub?: (value: string) => string;
  },
): ReportEvent {
  const scrub = options.scrub ?? scrubMessage;
  const type = error instanceof Error ? error.name : typeof error;
  const rawValue = error instanceof Error ? error.message : String(error);

  const tags: Record<string, string> = {};
  if (options.context?.requestId) tags.request_id = options.context.requestId;
  if (options.context?.route) tags.route = options.context.route;
  if (options.context?.role) tags.role = options.context.role;
  for (const [key, value] of Object.entries(options.context?.tags ?? {})) {
    // Tag values are attacker-influenceable in principle; keep them short and
    // scrubbed like everything else.
    tags[key] = scrub(value).slice(0, 100);
  }

  return {
    event_id: options.eventId,
    timestamp: options.timestamp,
    platform: options.platform ?? 'node',
    level: 'error',
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.release ? { release: options.release } : {}),
    tags,
    exception: {
      values: [{ type, value: scrub(rawValue).slice(0, 500) }],
    },
  };
}

/**
 * Last-resort content filter on the one free-text field that exists.
 *
 * Error messages are written by us, but a message can end up interpolating a
 * value — so anything that looks like a credential, a token or a long quoted
 * string is removed before it can leave the process.
 */
export function scrubMessage(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted-key]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-token]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[redacted-email]')
    .replace(/"[^"]{60,}"/g, '"[redacted]"')
    .replace(/\b\d{6}\b/g, '[redacted-code]');
}

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  const dsn = options.dsn ? parseDsn(options.dsn) : null;
  if (!dsn) return DISABLED;

  const sampleRate = options.sampleRate ?? 1;
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());
  const send = options.send ?? defaultSend;
  const url = envelopeUrl(dsn);
  const inFlight = new Set<Promise<void>>();

  return {
    enabled: true,
    captureException(error, context) {
      if (sampleRate < 1 && random() > sampleRate) return;

      const timestamp = now().getTime() / 1000;
      const eventId = randomEventId(random);
      const event = buildEvent(error, {
        ...(context ? { context } : {}),
        ...(options.environment ? { environment: options.environment } : {}),
        ...(options.release ? { release: options.release } : {}),
        eventId,
        timestamp,
      });

      const envelope = [
        JSON.stringify({ event_id: eventId, sent_at: new Date(timestamp * 1000).toISOString() }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify(event),
      ].join('\n');

      const promise = send(url, envelope, {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=lingolive/1.0.0`,
      })
        .catch((sendError: unknown) => options.onError?.(sendError))
        .finally(() => inFlight.delete(promise));
      inFlight.add(promise);
    },
    async flush() {
      await Promise.allSettled([...inFlight]);
    },
  };
}

async function defaultSend(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) throw new Error(`Error reporter returned ${response.status}`);
}

function randomEventId(random: () => number): string {
  let id = '';
  for (let index = 0; index < 32; index += 1) {
    id += Math.floor(random() * 16).toString(16);
  }
  return id;
}
