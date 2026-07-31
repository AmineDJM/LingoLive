import type { TranscriptionConfig } from '@lingolive/contracts';

/**
 * Provider abstractions. Feature code depends only on these, so `mock` and
 * `openai` are genuinely interchangeable — which is what lets the entire
 * product, its tests and its screenshot pipeline run with no provider account.
 */

export interface TranslationContext {
  /** Previous final segments, for pronoun and tense continuity. */
  readonly recentSegments?: readonly string[];
  /** Domain terms and proper nouns to preserve verbatim. */
  readonly glossary?: readonly string[];
  readonly sessionKind?: string;
}

export interface TranslationInput {
  readonly text: string;
  readonly sourceLanguage?: string | undefined;
  readonly targetLanguages: readonly string[];
  readonly context?: TranslationContext | undefined;
}

export interface TranslationResult {
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly model: string;
  readonly provider: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface TranslationProvider {
  readonly name: string;
  readonly available: boolean;
  translateSegment(input: TranslationInput): Promise<TranslationResult[]>;
}

export interface EphemeralTranscriptionCredential {
  /** SHORT-LIVED client secret. Never the standard API key. */
  readonly clientSecret: string;
  readonly expiresAt: Date;
  readonly model: string;
  readonly endpoint: string;
  readonly transport: TranscriptionConfig['transport'];
}

export interface TranscriptionCredentialRequest {
  readonly sessionId: string;
  readonly spokenLanguage: string;
  readonly vocabularyHints: readonly string[];
  readonly platform: string;
  readonly preferredTransport: 'webrtc' | 'websocket' | 'auto';
  readonly ttlSeconds: number;
}

export interface TranscriptionProvider {
  readonly name: string;
  readonly available: boolean;
  /**
   * Mints a credential the client uses to talk to the speech backend.
   * The standard API key never leaves this process.
   */
  createEphemeralCredential(
    request: TranscriptionCredentialRequest,
  ): Promise<EphemeralTranscriptionCredential>;
}

/**
 * Reserved for a future speech-to-speech path (ADR 0006). Declared now so the
 * boundary exists; deliberately not wired into any V1 surface.
 */
export interface SpeechTranslationProvider {
  readonly name: string;
  readonly available: boolean;
  createSpeechSession(input: {
    sessionId: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<EphemeralTranscriptionCredential>;
}

export interface AiProviders {
  readonly transcription: TranscriptionProvider;
  readonly translation: TranslationProvider;
  readonly providerName: 'mock' | 'openai';
}

/**
 * Server-side cost estimation.
 *
 * These are configurable placeholders, not published prices: a deployment sets
 * its own rates so the ledger, the admin console and the circuit breaker all
 * reason in the same units. Zero is a valid value.
 */
export interface CostRates {
  readonly audioPerMinuteUsd: number;
  readonly inputTokensPerMillionUsd: number;
  readonly outputTokensPerMillionUsd: number;
}

export const MOCK_COST_RATES: CostRates = {
  audioPerMinuteUsd: 0,
  inputTokensPerMillionUsd: 0,
  outputTokensPerMillionUsd: 0,
};

/**
 * Default non-zero rates so a real deployment sees meaningful cost numbers
 * before it has tuned them. Override with COST_* environment variables.
 */
export const DEFAULT_COST_RATES: CostRates = {
  audioPerMinuteUsd: 0.006,
  inputTokensPerMillionUsd: 0.15,
  outputTokensPerMillionUsd: 0.6,
};

export function estimateAudioCostUsd(seconds: number, rates: CostRates): number {
  return (seconds / 60) * rates.audioPerMinuteUsd;
}

export function estimateTokenCostUsd(
  inputTokens: number,
  outputTokens: number,
  rates: CostRates,
): number {
  return (
    (inputTokens / 1_000_000) * rates.inputTokensPerMillionUsd +
    (outputTokens / 1_000_000) * rates.outputTokensPerMillionUsd
  );
}

/** Rough token estimate for providers that do not report usage. */
export function estimateTokens(text: string): number {
  // ~4 characters per token for Latin scripts; CJK and Arabic run denser, so
  // this is a deliberate under-estimate corrected by real usage when reported.
  return Math.ceil(text.length / 4);
}
