import { z } from 'zod';

/**
 * Plans are an *entitlement* concept, not a price list. Prices live with the
 * billing provider; the product only ever asks "what is this account allowed
 * to do right now?".
 */
export const PLANS = ['GUEST', 'FREE', 'PRO', 'BUSINESS_PARTICIPANT'] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

export const ENTITLEMENT_SOURCES = ['DEFAULT', 'STRIPE', 'REVENUECAT', 'MANUAL', 'PROMO'] as const;
export const entitlementSourceSchema = z.enum(ENTITLEMENT_SOURCES);
export type EntitlementSource = z.infer<typeof entitlementSourceSchema>;

export const entitlementSchema = z.object({
  plan: planSchema,
  source: entitlementSourceSchema,
  active: z.boolean(),
  expiresAt: z.string().nullable(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

/** Resolved, plan-aware limits handed to the client so it can warn early. */
export const quotaSchema = z.object({
  plan: planSchema,
  minutesPerMonth: z.number().int().min(0),
  minutesUsedThisPeriod: z.number().min(0),
  minutesRemaining: z.number().min(0),
  maxSessionMinutes: z.number().int().min(1),
  maxDiscussionLanguages: z.number().int().min(2).max(4),
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Joining a LingoBusiness room never consumes quota. Always true. */
  businessJoinIsFree: z.literal(true),
});
export type Quota = z.infer<typeof quotaSchema>;

export const USAGE_METRICS = [
  'AUDIO_SECONDS',
  'TRANSLATION_CHARACTERS',
  'TRANSLATION_REQUESTS',
  'INPUT_TOKENS',
  'OUTPUT_TOKENS',
  'SESSION_STARTED',
  'BUSINESS_VIEWER_MINUTES',
] as const;
export const usageMetricSchema = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof usageMetricSchema>;

export const usageSummarySchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  audioSeconds: z.number().min(0),
  translationRequests: z.number().int().min(0),
  translationCharacters: z.number().int().min(0),
  sessions: z.number().int().min(0),
  quota: quotaSchema,
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;

/**
 * A quota decision. `allowed: false` never interrupts a sentence in flight —
 * the realtime hub finishes the current segment, then ends the session with a
 * clear reason.
 */
export interface QuotaDecision {
  readonly allowed: boolean;
  readonly reason?: 'QUOTA_EXCEEDED' | 'SESSION_LIMIT' | 'COST_LIMIT';
  readonly minutesRemaining: number;
  readonly warn: boolean;
}

/** Warn the user once they are within this fraction of their allowance. */
export const QUOTA_WARNING_THRESHOLD = 0.9;
