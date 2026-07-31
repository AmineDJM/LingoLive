import type { RenderedSegment, TranscriptSegment, Translation } from '@lingolive/contracts';
import { ORIGINAL_LANGUAGE } from '@lingolive/contracts';

/**
 * The client-side model of a live transcript.
 *
 * Responsibilities:
 *  - keep final segments ordered and gap-free by `sequence`;
 *  - never let a duplicate (from a reconnect replay) appear twice;
 *  - hold at most one partial per slot, replaced in place;
 *  - drop partials as soon as the matching final arrives;
 *  - expose the sequence to resume from after a reconnection.
 */

export interface StoredSegment {
  readonly segment: TranscriptSegment;
  readonly translations: Map<string, Translation>;
}

export interface PartialEntry {
  readonly slotId: string | null;
  readonly text: string;
  readonly sourceLanguage: string | null;
  readonly sequence: number;
  readonly translations: Map<string, string>;
}

export interface RenderedLine {
  readonly id: string;
  readonly sequence: number;
  readonly slotId: string | null;
  readonly sourceLanguage: string | null;
  readonly isFinal: boolean;
  /** What to show, already resolved for the requested reading language. */
  readonly text: string;
  /** True when `text` is the speaker's own words rather than a translation. */
  readonly isOriginal: boolean;
  /** True while a translation is still catching up with the final text. */
  readonly isTranslationPending: boolean;
}

export class TranscriptStore {
  private readonly segments = new Map<number, StoredSegment>();
  private readonly partials = new Map<string, PartialEntry>();
  private highestSequence = 0;
  private readonly seenClientSegmentIds = new Set<string>();

  /** Highest final sequence received — what a reconnect resumes from. */
  get lastSequence(): number {
    return this.highestSequence;
  }

  get finalCount(): number {
    return this.segments.size;
  }

  /** Adds or replaces a final segment. Idempotent by sequence. */
  applyFinal(segment: TranscriptSegment, translations: Translation[] = []): void {
    const existing = this.segments.get(segment.sequence);
    const map = existing?.translations ?? new Map<string, Translation>();
    for (const translation of translations) {
      map.set(translation.targetLanguage.toLowerCase(), translation);
    }
    this.segments.set(segment.sequence, { segment, translations: map });
    if (segment.sequence > this.highestSequence) this.highestSequence = segment.sequence;

    // The final supersedes any partial for the same slot.
    this.partials.delete(this.partialKey(segment.speakerSlotId ?? null));
  }

  applyTranslation(translation: Translation): void {
    for (const stored of this.segments.values()) {
      if (stored.segment.id === translation.segmentId) {
        stored.translations.set(translation.targetLanguage.toLowerCase(), translation);
        return;
      }
    }
  }

  applyPartial(input: {
    slotId: string | null;
    text: string;
    sourceLanguage: string | null;
    sequence: number;
  }): void {
    const key = this.partialKey(input.slotId);
    // A partial for an already-finalised sequence is stale (late delivery).
    if (input.sequence <= this.highestSequence) return;
    const previous = this.partials.get(key);
    this.partials.set(key, {
      slotId: input.slotId,
      text: input.text,
      sourceLanguage: input.sourceLanguage,
      sequence: input.sequence,
      translations: previous?.translations ?? new Map(),
    });
  }

  applyPartialTranslation(input: {
    slotId?: string | null;
    sequence: number;
    targetLanguage: string;
    text: string;
  }): void {
    for (const [key, partial] of this.partials.entries()) {
      if (partial.sequence !== input.sequence) continue;
      const translations = new Map(partial.translations);
      translations.set(input.targetLanguage.toLowerCase(), input.text);
      this.partials.set(key, { ...partial, translations });
      return;
    }
  }

  clearPartial(slotId: string | null): void {
    this.partials.delete(this.partialKey(slotId));
  }

  /**
   * Records a client-generated segment id so a reconnect mid-flush cannot
   * submit the same utterance twice.
   */
  registerClientSegmentId(id: string): boolean {
    if (this.seenClientSegmentIds.has(id)) return false;
    this.seenClientSegmentIds.add(id);
    return true;
  }

  /** Replaces the whole store from a `session.snapshot`. */
  hydrate(rendered: RenderedSegment[]): void {
    this.segments.clear();
    this.partials.clear();
    this.highestSequence = 0;
    for (const item of rendered) {
      this.applyFinal(item.segment, item.translations);
    }
  }

  reset(): void {
    this.segments.clear();
    this.partials.clear();
    this.seenClientSegmentIds.clear();
    this.highestSequence = 0;
  }

  /** Every sequence number missing between 1 and `lastSequence`. */
  missingSequences(): number[] {
    const missing: number[] = [];
    for (let i = 1; i <= this.highestSequence; i++) {
      if (!this.segments.has(i)) missing.push(i);
    }
    return missing;
  }

  /**
   * The lines to render for one reader.
   *
   * `readingLanguage` of `original` (or a language equal to the source) shows
   * the speaker's own words. Otherwise the translation is shown, falling back
   * to the original while the translation is still in flight — a reader should
   * never stare at an empty screen waiting for a translator.
   */
  render(readingLanguage: string, options: { slotId?: string | null } = {}): RenderedLine[] {
    const target = readingLanguage.toLowerCase();
    const wantsOriginal = target === ORIGINAL_LANGUAGE;
    const lines: RenderedLine[] = [];

    const ordered = [...this.segments.keys()].sort((a, b) => a - b);
    for (const sequence of ordered) {
      const stored = this.segments.get(sequence);
      if (!stored) continue;
      const { segment, translations } = stored;
      // Discussion tiles deliberately show every speaker; the filter exists
      // only for per-speaker exports.
      if (options.slotId != null && segment.speakerSlotId !== options.slotId) continue;
      const translation = translations.get(target);
      const sourceMatches =
        segment.sourceLanguage && segment.sourceLanguage.toLowerCase() === target;
      const useOriginal = wantsOriginal || Boolean(sourceMatches);
      lines.push({
        id: segment.id,
        sequence,
        slotId: segment.speakerSlotId ?? null,
        sourceLanguage: segment.sourceLanguage ?? null,
        isFinal: true,
        text: useOriginal ? segment.originalText : (translation?.translatedText ?? segment.originalText),
        isOriginal: useOriginal || !translation,
        isTranslationPending: !useOriginal && !translation,
      });
    }

    for (const partial of this.partials.values()) {
      const translated = partial.translations.get(target);
      const sourceMatches =
        partial.sourceLanguage && partial.sourceLanguage.toLowerCase() === target;
      const useOriginal = wantsOriginal || Boolean(sourceMatches);
      lines.push({
        id: `partial:${partial.slotId ?? 'main'}`,
        sequence: partial.sequence,
        slotId: partial.slotId,
        sourceLanguage: partial.sourceLanguage,
        isFinal: false,
        text: useOriginal ? partial.text : (translated ?? partial.text),
        isOriginal: useOriginal || !translated,
        isTranslationPending: !useOriginal && !translated,
      });
    }

    return lines.sort((a, b) => a.sequence - b.sequence);
  }

  /** Plain-text export in the reader's chosen language. */
  toPlainText(readingLanguage: string): string {
    return this.render(readingLanguage)
      .filter((line) => line.isFinal)
      .map((line) => line.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  private partialKey(slotId: string | null): string {
    return slotId ?? '__main__';
  }
}
