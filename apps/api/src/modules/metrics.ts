/**
 * In-process metrics.
 *
 * The operator console must be able to show latency percentiles and error
 * rates on a fresh deployment, before anyone has configured a metrics vendor.
 * This is a bounded reservoir, not a time-series database — enough to answer
 * "is it slow right now, and where", which is what an incident actually needs.
 */

const MAX_SAMPLES = 2000;

export interface LatencySnapshot {
  name: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface HttpRouteSnapshot {
  route: string;
  method: string;
  count: number;
  errorCount: number;
  p95Ms: number;
}

export interface RecentError {
  at: string;
  requestId: string;
  code: string;
  route: string | null;
  message: string;
  count: number;
}

/** The measurements that define whether the product feels live. */
export const LATENCY_METRICS = [
  'realtime.connect',
  'realtime.first_partial',
  'realtime.final_segment',
  'translation.final',
  'business.join',
  'session.create',
] as const;

export class MetricsRegistry {
  private readonly latencies = new Map<string, number[]>();
  private readonly counters = new Map<string, number>();
  private readonly httpSamples = new Map<string, { durations: number[]; errors: number }>();
  private readonly recentErrors: RecentError[] = [];
  private readonly errorKeys = new Map<string, number>();

  recordLatency(name: string, durationMs: number): void {
    let samples = this.latencies.get(name);
    if (!samples) {
      samples = [];
      this.latencies.set(name, samples);
    }
    samples.push(durationMs);
    if (samples.length > MAX_SAMPLES) samples.shift();
  }

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  recordHttp(method: string, route: string, durationMs: number, status: number): void {
    const key = `${method} ${route}`;
    let entry = this.httpSamples.get(key);
    if (!entry) {
      entry = { durations: [], errors: 0 };
      this.httpSamples.set(key, entry);
    }
    entry.durations.push(durationMs);
    if (entry.durations.length > MAX_SAMPLES) entry.durations.shift();
    if (status >= 400) entry.errors += 1;
  }

  /**
   * Records an error for the operator console. Identical errors are collapsed
   * into a count so one failing dependency cannot flood the list.
   */
  recordError(error: {
    requestId: string;
    code: string;
    route?: string | null;
    message: string;
  }): void {
    const key = `${error.code}:${error.route ?? ''}`;
    const existingIndex = this.errorKeys.get(key);
    if (existingIndex !== undefined && this.recentErrors[existingIndex]) {
      const existing = this.recentErrors[existingIndex];
      existing.count += 1;
      existing.at = new Date().toISOString();
      existing.requestId = error.requestId;
      return;
    }
    this.recentErrors.unshift({
      at: new Date().toISOString(),
      requestId: error.requestId,
      code: error.code,
      route: error.route ?? null,
      message: error.message,
      count: 1,
    });
    if (this.recentErrors.length > 100) this.recentErrors.pop();
    this.reindexErrors();
  }

  private reindexErrors(): void {
    this.errorKeys.clear();
    this.recentErrors.forEach((entry, index) => {
      this.errorKeys.set(`${entry.code}:${entry.route ?? ''}`, index);
    });
  }

  latencySnapshot(): LatencySnapshot[] {
    const out: LatencySnapshot[] = [];
    for (const [name, samples] of this.latencies) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      out.push({
        name,
        count: sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        maxMs: sorted[sorted.length - 1] ?? 0,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  counterSnapshot(): Array<{ name: string; value: number }> {
    return [...this.counters.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  httpSnapshot(): HttpRouteSnapshot[] {
    const out: HttpRouteSnapshot[] = [];
    for (const [key, entry] of this.httpSamples) {
      const [method = 'GET', ...rest] = key.split(' ');
      const sorted = [...entry.durations].sort((a, b) => a - b);
      out.push({
        method,
        route: rest.join(' '),
        count: entry.durations.length,
        errorCount: entry.errors,
        p95Ms: percentile(sorted, 0.95),
      });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  errorSnapshot(): RecentError[] {
    return [...this.recentErrors];
  }

  reset(): void {
    this.latencies.clear();
    this.counters.clear();
    this.httpSamples.clear();
    this.recentErrors.length = 0;
    this.errorKeys.clear();
  }
}

export function percentile(sortedSamples: number[], p: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(p * sortedSamples.length) - 1),
  );
  return Math.round((sortedSamples[index] ?? 0) * 100) / 100;
}

/**
 * Event-loop delay, sampled with a plain timer.
 *
 * A blocked event loop is the failure mode that silently ruins a realtime
 * product: sockets stay open, nothing is delivered. This surfaces it.
 */
export class EventLoopMonitor {
  private samples: number[] = [];
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs = 500): void {
    if (this.timer) return;
    let last = process.hrtime.bigint();
    this.timer = setInterval(() => {
      const now = process.hrtime.bigint();
      const elapsedMs = Number(now - last) / 1_000_000;
      last = now;
      this.samples.push(Math.max(0, elapsedMs - intervalMs));
      if (this.samples.length > 240) this.samples.shift();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  p99DelayMs(): number {
    return percentile(
      [...this.samples].sort((a, b) => a - b),
      0.99,
    );
  }
}
