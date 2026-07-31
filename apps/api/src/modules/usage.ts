import { Plan, UsageMetric, type PrismaClient } from '@prisma/client';
import {
  QUOTA_WARNING_THRESHOLD,
  type Quota,
  type QuotaDecision,
  type UsageSummary,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { estimateAudioCostUsd, estimateTokenCostUsd } from '../ai/index.js';

/**
 * Usage accounting, quotas and the cost circuit breaker.
 *
 * Principle: the client's counter is a hint, never the truth. Every billable
 * quantity is derived server-side from what the server itself observed.
 */

export interface ActorIdentity {
  readonly userId: string | null;
  readonly anonymousHash: string | null;
}

/** A calendar-month window, computed in UTC for reproducibility. */
export function currentPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export class UsageService {
  constructor(private readonly context: AppContext) {}

  private get prisma(): PrismaClient {
    return this.context.prisma;
  }

  async recordAudioSeconds(
    actor: ActorIdentity,
    sessionId: string,
    seconds: number,
  ): Promise<void> {
    if (seconds <= 0) return;
    await this.prisma.usageLedger.create({
      data: {
        userId: actor.userId,
        anonymousHash: actor.anonymousHash,
        sessionId,
        metric: UsageMetric.AUDIO_SECONDS,
        quantity: seconds,
        provider: this.context.ai.providerName,
        model: this.context.env.OPENAI_TRANSCRIPTION_MODEL,
        estimatedCostUsd: estimateAudioCostUsd(seconds, this.context.costRates),
      },
    });
    this.context.metrics.increment('usage.audio_seconds', seconds);
  }

  async recordTranslation(
    actor: ActorIdentity,
    sessionId: string,
    input: {
      characters: number;
      inputTokens: number;
      outputTokens: number;
      model: string;
      provider: string;
    },
  ): Promise<void> {
    const cost = estimateTokenCostUsd(
      input.inputTokens,
      input.outputTokens,
      this.context.costRates,
    );
    await this.prisma.usageLedger.createMany({
      data: [
        {
          userId: actor.userId,
          anonymousHash: actor.anonymousHash,
          sessionId,
          metric: UsageMetric.TRANSLATION_REQUESTS,
          quantity: 1,
          provider: input.provider,
          model: input.model,
          estimatedCostUsd: cost,
        },
        {
          userId: actor.userId,
          anonymousHash: actor.anonymousHash,
          sessionId,
          metric: UsageMetric.TRANSLATION_CHARACTERS,
          quantity: input.characters,
          provider: input.provider,
          model: input.model,
          estimatedCostUsd: 0,
        },
        {
          userId: actor.userId,
          anonymousHash: actor.anonymousHash,
          sessionId,
          metric: UsageMetric.INPUT_TOKENS,
          quantity: input.inputTokens,
          provider: input.provider,
          model: input.model,
          estimatedCostUsd: 0,
        },
        {
          userId: actor.userId,
          anonymousHash: actor.anonymousHash,
          sessionId,
          metric: UsageMetric.OUTPUT_TOKENS,
          quantity: input.outputTokens,
          provider: input.provider,
          model: input.model,
          estimatedCostUsd: 0,
        },
      ],
    });
    this.context.metrics.increment('usage.translations');
  }

  async recordSessionStarted(actor: ActorIdentity, sessionId: string): Promise<void> {
    await this.prisma.usageLedger.create({
      data: {
        userId: actor.userId,
        anonymousHash: actor.anonymousHash,
        sessionId,
        metric: UsageMetric.SESSION_STARTED,
        quantity: 1,
        provider: this.context.ai.providerName,
      },
    });
  }

  /** Audio seconds consumed by an actor in the current calendar month. */
  async audioSecondsThisPeriod(actor: ActorIdentity, now = new Date()): Promise<number> {
    const { start, end } = currentPeriod(now);
    const where =
      actor.userId !== null
        ? { userId: actor.userId }
        : { anonymousHash: actor.anonymousHash ?? '__none__' };

    const result = await this.prisma.usageLedger.aggregate({
      _sum: { quantity: true },
      where: { ...where, metric: UsageMetric.AUDIO_SECONDS, createdAt: { gte: start, lt: end } },
    });
    return result._sum.quantity ?? 0;
  }

  async quotaFor(actor: ActorIdentity, plan: Plan, now = new Date()): Promise<Quota> {
    const { start, end } = currentPeriod(now);
    const used = await this.audioSecondsThisPeriod(actor, now);
    const minutesPerMonth = this.planMinutes(plan);
    const minutesUsed = used / 60;

    return {
      plan,
      minutesPerMonth,
      minutesUsedThisPeriod: Math.round(minutesUsed * 100) / 100,
      minutesRemaining: Math.max(0, Math.round((minutesPerMonth - minutesUsed) * 100) / 100),
      maxSessionMinutes: this.context.runtimeConfig.number('MAX_PERSONAL_SESSION_MINUTES'),
      maxDiscussionLanguages: this.context.runtimeConfig.number('MAX_DISCUSSION_LANGUAGES'),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      businessJoinIsFree: true,
    };
  }

  private planMinutes(plan: Plan): number {
    switch (plan) {
      case Plan.GUEST:
        return this.context.runtimeConfig.number('GUEST_MINUTES_PER_MONTH');
      case Plan.FREE:
        return this.context.runtimeConfig.number('FREE_MINUTES_PER_MONTH');
      case Plan.PRO:
        return this.context.runtimeConfig.number('PRO_MINUTES_PER_MONTH');
      case Plan.BUSINESS_PARTICIPANT:
        // Joining a LingoBusiness room never consumes personal quota.
        return Number.MAX_SAFE_INTEGER;
    }
  }

  /**
   * Can this actor start (or continue) a session?
   *
   * `warn` is what drives the "about N minutes left" banner — the product
   * warns before the wall rather than cutting a sentence in half.
   */
  async checkQuota(actor: ActorIdentity, plan: Plan, now = new Date()): Promise<QuotaDecision> {
    if (plan === Plan.BUSINESS_PARTICIPANT) {
      return { allowed: true, minutesRemaining: Number.POSITIVE_INFINITY, warn: false };
    }

    const quota = await this.quotaFor(actor, plan, now);
    if (quota.minutesRemaining <= 0) {
      return { allowed: false, reason: 'QUOTA_EXCEEDED', minutesRemaining: 0, warn: true };
    }

    const costBlocked = await this.isCostCircuitOpen(now);
    if (costBlocked) {
      return {
        allowed: false,
        reason: 'COST_LIMIT',
        minutesRemaining: quota.minutesRemaining,
        warn: true,
      };
    }

    const usedFraction =
      quota.minutesPerMonth > 0 ? quota.minutesUsedThisPeriod / quota.minutesPerMonth : 0;

    return {
      allowed: true,
      minutesRemaining: quota.minutesRemaining,
      warn: usedFraction >= QUOTA_WARNING_THRESHOLD,
    };
  }

  /**
   * Global spend guard. Trips on the daily or monthly ceiling and blocks *new*
   * sessions only — an in-flight session is never cut off mid-sentence by a
   * budget check (§33.3).
   */
  async isCostCircuitOpen(now = new Date()): Promise<boolean> {
    if (!this.context.runtimeConfig.boolean('COST_CIRCUIT_BREAKER_ENABLED')) return false;

    const dailyLimit = this.context.runtimeConfig.number('DAILY_COST_LIMIT_USD');
    const monthlyLimit = this.context.runtimeConfig.number('MONTHLY_COST_LIMIT_USD');
    if (dailyLimit <= 0 && monthlyLimit <= 0) return false;

    const spend = await this.spend(now);
    if (dailyLimit > 0 && spend.today >= dailyLimit) return true;
    if (monthlyLimit > 0 && spend.month >= monthlyLimit) return true;
    return false;
  }

  async spend(now = new Date()): Promise<{ today: number; month: number }> {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { start: monthStart } = currentPeriod(now);

    const [today, month] = await Promise.all([
      this.prisma.usageLedger.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { createdAt: { gte: dayStart } },
      }),
      this.prisma.usageLedger.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    return {
      today: today._sum.estimatedCostUsd ?? 0,
      month: month._sum.estimatedCostUsd ?? 0,
    };
  }

  async summary(actor: ActorIdentity, plan: Plan, now = new Date()): Promise<UsageSummary> {
    const { start, end } = currentPeriod(now);
    const where =
      actor.userId !== null
        ? { userId: actor.userId }
        : { anonymousHash: actor.anonymousHash ?? '__none__' };
    const range = { createdAt: { gte: start, lt: end } };

    const grouped = await this.prisma.usageLedger.groupBy({
      by: ['metric'],
      _sum: { quantity: true },
      where: { ...where, ...range },
    });

    const value = (metric: UsageMetric) =>
      grouped.find((row) => row.metric === metric)?._sum.quantity ?? 0;

    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      audioSeconds: value(UsageMetric.AUDIO_SECONDS),
      translationRequests: Math.round(value(UsageMetric.TRANSLATION_REQUESTS)),
      translationCharacters: Math.round(value(UsageMetric.TRANSLATION_CHARACTERS)),
      sessions: Math.round(value(UsageMetric.SESSION_STARTED)),
      quota: await this.quotaFor(actor, plan, now),
    };
  }
}
