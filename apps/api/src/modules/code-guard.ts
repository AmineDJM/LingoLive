/**
 * Throttle for *failed* LingoBusiness code attempts.
 *
 * A blanket rate limit on joining is the wrong tool: at a real conference,
 * hundreds of people join within seconds, and a venue's Wi-Fi puts them all
 * behind one NAT address. Throttling that would break the product for exactly
 * the situation it was built for.
 *
 * What actually needs throttling is *guessing*. A six-digit code has a million
 * possibilities, so this counts only the attempts that fail and blocks a
 * source once it has clearly started enumerating — while a hall full of people
 * entering correct codes passes through untouched.
 */

export interface CodeAttemptGuardOptions {
  /** Failures allowed inside the window before a source is blocked. */
  maxFailures?: number;
  windowMs?: number;
  /** How long a blocked source stays blocked. */
  blockMs?: number;
  now?: () => number;
}

interface Entry {
  failures: number[];
  blockedUntil: number;
}

export class CodeAttemptGuard {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly now: () => number;

  constructor(options: CodeAttemptGuardOptions = {}) {
    this.maxFailures = options.maxFailures ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.blockMs = options.blockMs ?? 300_000;
    this.now = options.now ?? Date.now;
  }

  /** True when this source is currently blocked from trying codes. */
  isBlocked(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.blockedUntil > this.now()) return true;
    if (entry.blockedUntil !== 0 && entry.blockedUntil <= this.now()) {
      // Block expired — start the source with a clean slate.
      this.entries.delete(key);
    }
    return false;
  }

  /** Records a failed attempt. Returns true if the source is now blocked. */
  recordFailure(key: string): boolean {
    const now = this.now();
    const entry = this.entries.get(key) ?? { failures: [], blockedUntil: 0 };
    entry.failures = entry.failures.filter((at) => at > now - this.windowMs);
    entry.failures.push(now);

    if (entry.failures.length >= this.maxFailures) {
      entry.blockedUntil = now + this.blockMs;
      entry.failures = [];
      this.entries.set(key, entry);
      return true;
    }

    this.entries.set(key, entry);
    return false;
  }

  /** A successful join clears the source's failure history. */
  recordSuccess(key: string): void {
    const entry = this.entries.get(key);
    if (entry && entry.blockedUntil <= this.now()) {
      this.entries.delete(key);
    }
  }

  /** Drops expired entries so the map cannot grow without bound. */
  prune(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      const stale =
        entry.blockedUntil <= now && entry.failures.every((at) => at <= now - this.windowMs);
      if (stale) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}
