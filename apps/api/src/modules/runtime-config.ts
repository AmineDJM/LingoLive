import type { PrismaClient } from '@prisma/client';
import { isSecretKey, type ServerEnv } from '@lingolive/config';
import type { Logger } from '@lingolive/logging';

/**
 * Operator-editable runtime configuration.
 *
 * A subset of settings — quotas, cost ceilings, timeouts, feature flags — can
 * be changed without a redeploy, which is what you need at 03:00 when a
 * runaway session is burning budget. Secrets are explicitly *not* editable:
 * they are not readable here and cannot be written here.
 */

/** The only keys an operator may override. Everything else needs a deploy. */
export const OVERRIDABLE_KEYS = [
  'GUEST_MINUTES_PER_MONTH',
  'FREE_MINUTES_PER_MONTH',
  'PRO_MINUTES_PER_MONTH',
  'MAX_PERSONAL_SESSION_MINUTES',
  'MAX_DISCUSSION_LANGUAGES',
  'MAX_BUSINESS_TARGET_LANGUAGES',
  'SESSION_IDLE_TIMEOUT_SECONDS',
  'DAILY_COST_LIMIT_USD',
  'MONTHLY_COST_LIMIT_USD',
  'COST_CIRCUIT_BREAKER_ENABLED',
  'RETENTION_UNSAVED_SESSION_HOURS',
  'RETENTION_BUSINESS_SESSION_DAYS',
  'RETENTION_TECHNICAL_LOG_DAYS',
  'BUSINESS_CODE_TTL_HOURS',
  'ANALYTICS_ENABLED',
  'REALTIME_TOKEN_TTL_SECONDS',
  'IDLE_AUTO_PAUSE_SECONDS',
] as const;

export type OverridableKey = (typeof OVERRIDABLE_KEYS)[number];

export const FEATURE_FLAGS = [
  'newSessionsEnabled',
  'businessJoinEnabled',
  'translationEnabled',
  'analyticsEnabled',
  'accountCreationEnabled',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  newSessionsEnabled: true,
  businessJoinEnabled: true,
  translationEnabled: true,
  analyticsEnabled: true,
  accountCreationEnabled: true,
};

export function isOverridableKey(key: string): key is OverridableKey {
  return (OVERRIDABLE_KEYS as readonly string[]).includes(key);
}

export class RuntimeConfigStore {
  private overrides = new Map<string, string>();
  private flags: Record<FeatureFlag, boolean> = { ...DEFAULT_FLAGS };
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: ServerEnv,
    private readonly logger: Logger,
  ) {}

  /** Loads overrides from the database. Called at boot and after each write. */
  async load(): Promise<void> {
    try {
      const rows = await this.prisma.configOverride.findMany();
      this.overrides = new Map(rows.map((row) => [row.key, row.value]));
      for (const flag of FEATURE_FLAGS) {
        const stored = this.overrides.get(`flag:${flag}`);
        this.flags[flag] = stored === undefined ? DEFAULT_FLAGS[flag] : stored === 'true';
      }
      this.loadedAt = Date.now();
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not load runtime configuration overrides');
    }
  }

  /** Effective numeric value: override first, then environment. */
  number(key: OverridableKey): number {
    const override = this.overrides.get(key);
    if (override !== undefined) {
      const parsed = Number.parseFloat(override);
      if (Number.isFinite(parsed)) return parsed;
    }
    const value = (this.env as unknown as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : Number.parseFloat(String(value ?? 0)) || 0;
  }

  boolean(key: OverridableKey): boolean {
    const override = this.overrides.get(key);
    if (override !== undefined) return override === 'true';
    const value = (this.env as unknown as Record<string, unknown>)[key];
    return value === true || value === 'true';
  }

  flag(name: FeatureFlag): boolean {
    return this.flags[name];
  }

  allFlags(): Record<string, boolean> {
    return { ...this.flags };
  }

  allOverrides(): Record<string, string> {
    return Object.fromEntries(this.overrides);
  }

  async setOverride(
    key: string,
    value: string | null,
    updatedBy: string,
    reason: string,
  ): Promise<void> {
    if (isSecretKey(key)) {
      throw new Error('Secrets cannot be overridden at runtime');
    }
    const isFlag = key.startsWith('flag:');
    if (!isFlag && !isOverridableKey(key)) {
      throw new Error(`${key} is not runtime-overridable`);
    }
    if (value === null) {
      await this.prisma.configOverride.deleteMany({ where: { key } });
    } else {
      await this.prisma.configOverride.upsert({
        where: { key },
        create: { key, value, updatedBy, reason },
        update: { value, updatedBy, reason },
      });
    }
    await this.load();
  }

  /**
   * The effective configuration as shown in the operator console.
   * Secret values are replaced by a presence flag, never printed.
   */
  effectiveConfig(): Array<{
    key: string;
    value: string;
    source: 'env' | 'override' | 'default';
    secret: boolean;
    editable: boolean;
  }> {
    const rows: Array<{
      key: string;
      value: string;
      source: 'env' | 'override' | 'default';
      secret: boolean;
      editable: boolean;
    }> = [];

    for (const [key, rawValue] of Object.entries(this.env)) {
      const secret = isSecretKey(key);
      const override = this.overrides.get(key);
      rows.push({
        key,
        value: secret ? (rawValue ? 'set' : 'not set') : String(override ?? rawValue ?? ''),
        source: override !== undefined ? 'override' : 'env',
        secret,
        editable: !secret && isOverridableKey(key),
      });
    }

    for (const flag of FEATURE_FLAGS) {
      rows.push({
        key: `flag:${flag}`,
        value: String(this.flags[flag]),
        source: this.overrides.has(`flag:${flag}`) ? 'override' : 'default',
        secret: false,
        editable: true,
      });
    }

    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }

  get lastLoadedAt(): number {
    return this.loadedAt;
  }
}
