import { z } from 'zod';
import { languageCodeSchema } from './languages.js';

/**
 * The canonical unit of the product.
 *
 * `originalText` is the source of truth and is NEVER replaced by a
 * translation. Translations are always additive, keyed by target language.
 *
 * Partial (non-final) segments live in memory only — they are never written to
 * the database and never leave the process they were produced in, other than
 * being pushed to subscribed clients.
 */
export const transcriptSegmentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  /** Which discussion tile produced this, if any. */
  speakerSlotId: z.string().nullable().optional(),
  /** Detected or hinted source language. */
  sourceLanguage: z.string().nullable().optional(),
  originalText: z.string(),
  /** Milliseconds since session start. */
  startedAtMs: z.number().int().min(0).nullable().optional(),
  endedAtMs: z.number().int().min(0).nullable().optional(),
  isFinal: z.boolean(),
  /** Monotonic per-session counter. Drives gap-free reconnection. */
  sequence: z.number().int().min(0),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const translationSchema = z.object({
  segmentId: z.string(),
  targetLanguage: languageCodeSchema,
  translatedText: z.string(),
  /** Model identifier, for cost attribution and admin inspection. */
  model: z.string(),
  /** `true` while this is a best-effort translation of a not-yet-final segment. */
  isProvisional: z.boolean(),
});
export type Translation = z.infer<typeof translationSchema>;

/** A segment plus the translations relevant to one reader. */
export const renderedSegmentSchema = z.object({
  segment: transcriptSegmentSchema,
  translations: z.array(translationSchema),
});
export type RenderedSegment = z.infer<typeof renderedSegmentSchema>;

export const transcriptExportFormatSchema = z.enum(['txt', 'md', 'json']);
export type TranscriptExportFormat = z.infer<typeof transcriptExportFormatSchema>;

/**
 * Deterministic cache key for one translation.
 * Includes the glossary version so a glossary change invalidates cleanly.
 */
export function translationCacheKey(input: {
  text: string;
  sourceLanguage: string | null | undefined;
  targetLanguage: string;
  glossaryVersion: string;
}): string {
  return [
    'tr',
    input.glossaryVersion,
    (input.sourceLanguage ?? 'auto').toLowerCase(),
    input.targetLanguage.toLowerCase(),
    hashText(input.text),
  ].join(':');
}

/**
 * FNV-1a 64-bit (as two 32-bit halves) rendered as hex.
 * Chosen over a crypto hash because it must run identically in Node, the
 * browser and Hermes with zero dependencies, and it is used only for cache
 * addressing — never for security.
 */
export function hashText(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c << 5) | (c >>> 3);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Decide whether a partial transcript is stable enough to be worth spending a
 * translation call on.
 *
 * Translating every delta would be both expensive and visually unstable
 * (flicker). We wait for either sentence-ending punctuation or a meaningful
 * amount of new text since the previous provisional translation.
 */
export function shouldTranslateProvisional(input: {
  text: string;
  lastTranslatedText: string | null;
  minCharsDelta?: number;
  minChars?: number;
}): boolean {
  const { text, lastTranslatedText } = input;
  const minChars = input.minChars ?? 12;
  const minCharsDelta = input.minCharsDelta ?? 25;
  const trimmed = text.trim();
  if (trimmed.length < minChars) return false;
  if (!lastTranslatedText) return true;
  if (trimmed === lastTranslatedText.trim()) return false;
  const grew = trimmed.length - lastTranslatedText.trim().length;
  if (grew >= minCharsDelta) return true;
  // A completed clause is a good, cheap stability signal in every script we
  // support (Latin, Arabic, CJK).
  return /[.!?。！？؟…]\s*$/u.test(trimmed);
}
