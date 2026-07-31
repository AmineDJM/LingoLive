import {
  ANALYTICS_EVENTS,
  isAnalyticsEvent,
  sanitizeProperties,
  type AnalyticsEventName,
  type AnalyticsValue,
} from './events.js';

/**
 * Product analytics, off by default.
 *
 * `ANALYTICS_ENABLED=false` (the default) makes every `capture()` a no-op —
 * not "queued", not "sampled": nothing is built and nothing is sent. Turning
 * it on still cannot send spoken content, because the catalogue in `events.ts`
 * is closed.
 */

export interface AnalyticsPayload {
  readonly event: AnalyticsEventName;
  readonly distinctId: string;
  readonly properties: Record<string, AnalyticsValue>;
  readonly timestamp: string;
}

export interface AnalyticsTransport {
  send(batch: readonly AnalyticsPayload[]): Promise<void>;
}

export interface AnalyticsOptions {
  enabled: boolean;
  /** PostHog project key. Absent ⇒ disabled, whatever `enabled` says. */
  apiKey?: string | undefined;
  host?: string | undefined;
  /** Injected in tests; defaults to the PostHog batch endpoint. */
  transport?: AnalyticsTransport | undefined;
  /** Events are flushed when the buffer hits this size. */
  batchSize?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface Analytics {
  readonly enabled: boolean;
  capture(event: string, distinctId: string, properties?: Readonly<Record<string, unknown>>): void;
  flush(): Promise<void>;
  /** Test/inspection aid — what would be sent, without sending it. */
  pending(): readonly AnalyticsPayload[];
}

const DISABLED: Analytics = {
  enabled: false,
  capture: () => undefined,
  flush: async () => undefined,
  pending: () => [],
};

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const active = options.enabled && Boolean(options.apiKey);
  if (!active) return DISABLED;

  const batchSize = options.batchSize ?? 20;
  const now = options.now ?? (() => new Date());
  const transport =
    options.transport ??
    createPostHogTransport({
      apiKey: options.apiKey as string,
      host: options.host ?? 'https://eu.i.posthog.com',
    });

  let buffer: AnalyticsPayload[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
      await transport.send(batch);
    } catch (error) {
      // Analytics must never break the product, and must never retry
      // indefinitely into a dead endpoint.
      options.onError?.(error);
    }
  };

  return {
    enabled: true,
    capture(event, distinctId, properties) {
      if (!isAnalyticsEvent(event)) {
        options.onError?.(new Error(`Unknown analytics event: ${event}`));
        return;
      }
      buffer.push({
        event,
        distinctId,
        properties: sanitizeProperties(event, properties),
        timestamp: now().toISOString(),
      });
      if (buffer.length >= batchSize) void flush();
    },
    flush,
    pending: () => buffer,
  };
}

function createPostHogTransport(config: { apiKey: string; host: string }): AnalyticsTransport {
  return {
    async send(batch) {
      const response = await fetch(`${config.host.replace(/\/$/, '')}/batch/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: config.apiKey,
          batch: batch.map((item) => ({
            event: item.event,
            distinct_id: item.distinctId,
            properties: item.properties,
            timestamp: item.timestamp,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`Analytics endpoint returned ${response.status}`);
      }
    },
  };
}

/** Used by `docs/PRIVACY.md` generation and by the admin console. */
export function analyticsCatalogue(): Array<{
  event: string;
  purpose: string;
  properties: readonly string[];
}> {
  return Object.entries(ANALYTICS_EVENTS).map(([event, definition]) => ({
    event,
    purpose: definition.purpose,
    properties: definition.properties,
  }));
}
