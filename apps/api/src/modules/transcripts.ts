import type {
  PrismaClient,
  TranscriptSegment as DbSegment,
  Translation as DbTranslation,
} from '@prisma/client';
import {
  dedupeTargetLanguages,
  LingoLiveError,
  ORIGINAL_LANGUAGE,
  translationCacheKey,
  type RenderedSegment,
  type TranscriptSegment,
  type Translation,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { UsageService, type ActorIdentity } from './usage.js';

/**
 * Transcript persistence and the translation fan-out.
 *
 * This is where the product's central cost rule is enforced (ADR 0008):
 *   one utterance → one transcription → one translation per distinct target
 *   language → delivered to everyone reading that language.
 *
 * Everything a user said is encrypted before it reaches the database.
 */

const GLOSSARY_VERSION = '1';

export interface AppendSegmentInput {
  sessionId: string;
  speakerSlotId?: string | null;
  sourceLanguage?: string | null;
  originalText: string;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  clientSegmentId?: string | null;
  actor: ActorIdentity;
}

export class TranscriptService {
  private readonly usage: UsageService;
  /**
   * In-process translation cache. Keyed by
   * hash(text + source + target + glossaryVersion), so identical utterances
   * across sessions are translated once.
   */
  private readonly translationCache = new Map<string, { text: string; model: string }>();
  private static readonly MAX_CACHE_ENTRIES = 5000;

  constructor(private readonly context: AppContext) {
    this.usage = new UsageService(context);
  }

  private get prisma(): PrismaClient {
    return this.context.prisma;
  }

  /**
   * Persists one final segment.
   *
   * Sequence assignment is done inside a transaction that increments the
   * session counter, so two concurrent speakers can never receive the same
   * sequence number.
   */
  async appendFinalSegment(input: AppendSegmentInput): Promise<TranscriptSegment> {
    const text = input.originalText.trim();
    if (text.length === 0) {
      throw new LingoLiveError('BAD_REQUEST', 'Segment text is empty');
    }

    // Idempotency: a reconnect mid-flush must not create a second row.
    if (input.clientSegmentId) {
      const existing = await this.prisma.transcriptSegment.findFirst({
        where: { sessionId: input.sessionId, clientSegmentId: input.clientSegmentId },
      });
      if (existing) return this.toContract(existing);
    }

    const encrypted = this.context.cipher.encrypt(text);

    const segment = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.update({
        where: { id: input.sessionId },
        data: { lastSequence: { increment: 1 } },
        select: { lastSequence: true, status: true },
      });

      if (session.status === 'ENDED' || session.status === 'EXPIRED') {
        throw new LingoLiveError('SESSION_ALREADY_ENDED', 'This session has ended');
      }

      return tx.transcriptSegment.create({
        data: {
          sessionId: input.sessionId,
          speakerSlotId: input.speakerSlotId ?? null,
          sequence: session.lastSequence,
          sourceLanguage: input.sourceLanguage ?? null,
          originalTextEncrypted: encrypted,
          encryptionVersion: this.context.cipher.version,
          characterCount: text.length,
          startedAtMs: input.startedAtMs ?? null,
          endedAtMs: input.endedAtMs ?? null,
          clientSegmentId: input.clientSegmentId ?? null,
        },
      });
    });

    this.context.metrics.increment('transcript.segments');
    return this.toContract(segment);
  }

  /**
   * Translates one segment into every target language that is actually needed,
   * persists the results and returns them.
   *
   * De-duplication happens twice: `dedupeTargetLanguages` collapses the
   * request, and the unique `(segmentId, targetLanguage)` constraint makes a
   * duplicate write impossible even under a race.
   */
  async translateSegment(input: {
    segmentId: string;
    sessionId: string;
    text: string;
    sourceLanguage: string | null;
    targetLanguages: readonly string[];
    actor: ActorIdentity;
    recentContext?: readonly string[];
    /** Announces the translation as it is generated. See TranslationInput. */
    onDelta?: (update: { targetLanguage: string; text: string }) => void;
  }): Promise<Translation[]> {
    const targets = dedupeTargetLanguages([...input.targetLanguages], input.sourceLanguage);
    if (targets.length === 0) return [];
    if (!this.context.runtimeConfig.flag('translationEnabled')) return [];

    const results: Translation[] = [];
    const uncached: string[] = [];

    for (const target of targets) {
      const key = translationCacheKey({
        text: input.text,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: target,
        glossaryVersion: GLOSSARY_VERSION,
      });
      const cached = this.translationCache.get(key);
      if (cached) {
        results.push({
          segmentId: input.segmentId,
          targetLanguage: target,
          translatedText: cached.text,
          model: cached.model,
          isProvisional: false,
        });
        this.context.metrics.increment('translation.cache_hit');
      } else {
        uncached.push(target);
      }
    }

    if (uncached.length > 0) {
      const started = Date.now();
      try {
        const translated = await this.context.ai.translation.translateSegment({
          text: input.text,
          sourceLanguage: input.sourceLanguage ?? undefined,
          targetLanguages: uncached,
          context: input.recentContext ? { recentSegments: input.recentContext } : undefined,
          ...(input.onDelta ? { onDelta: input.onDelta } : {}),
        });
        this.context.metrics.recordLatency('translation.final', Date.now() - started);

        for (const result of translated) {
          this.rememberTranslation(
            translationCacheKey({
              text: input.text,
              sourceLanguage: input.sourceLanguage,
              targetLanguage: result.targetLanguage,
              glossaryVersion: GLOSSARY_VERSION,
            }),
            { text: result.translatedText, model: result.model },
          );
          results.push({
            segmentId: input.segmentId,
            targetLanguage: result.targetLanguage,
            translatedText: result.translatedText,
            model: result.model,
            isProvisional: false,
          });
          await this.usage.recordTranslation(input.actor, input.sessionId, {
            characters: result.translatedText.length,
            inputTokens: result.inputTokens ?? 0,
            outputTokens: result.outputTokens ?? 0,
            model: result.model,
            provider: result.provider,
          });
        }
      } catch (error) {
        // A translation failure degrades to showing the original text.
        // It must never take down the transcript itself.
        this.context.logger.warn(
          { sessionId: input.sessionId, targets: uncached.length, err: error },
          'Translation failed; falling back to the original text',
        );
        this.context.metrics.increment('translation.failures');
      }
    }

    await this.persistTranslations(input.segmentId, results);
    return results;
  }

  private rememberTranslation(key: string, value: { text: string; model: string }): void {
    if (this.translationCache.size >= TranscriptService.MAX_CACHE_ENTRIES) {
      // Simple FIFO eviction: this cache exists to collapse repeated phrases
      // within and across live sessions, not to be a long-lived store.
      const oldest = this.translationCache.keys().next().value;
      if (oldest !== undefined) this.translationCache.delete(oldest);
    }
    this.translationCache.set(key, value);
  }

  private async persistTranslations(segmentId: string, translations: Translation[]): Promise<void> {
    if (translations.length === 0) return;
    await this.prisma.translation.createMany({
      data: translations.map((translation) => ({
        segmentId,
        targetLanguage: translation.targetLanguage,
        translatedTextEncrypted: this.context.cipher.encrypt(translation.translatedText),
        encryptionVersion: this.context.cipher.version,
        characterCount: translation.translatedText.length,
        model: translation.model,
        provider: this.context.ai.providerName,
      })),
      // The unique constraint is the deduplication guarantee; a concurrent
      // writer that got there first is a success, not an error.
      skipDuplicates: true,
    });
  }

  /** Segments after a sequence, decrypted, with the reader's translation. */
  async listSegments(options: {
    sessionId: string;
    afterSequence?: number;
    limit?: number;
    language?: string;
  }): Promise<{ segments: RenderedSegment[]; lastSequence: number; hasMore: boolean }> {
    const limit = Math.min(500, options.limit ?? 200);
    const rows = await this.prisma.transcriptSegment.findMany({
      where: {
        sessionId: options.sessionId,
        ...(options.afterSequence !== undefined ? { sequence: { gt: options.afterSequence } } : {}),
      },
      orderBy: { sequence: 'asc' },
      take: limit + 1,
      include: {
        translations:
          options.language && options.language !== ORIGINAL_LANGUAGE
            ? { where: { targetLanguage: options.language } }
            : false,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const segments: RenderedSegment[] = page.map((row) => ({
      segment: this.toContract(row),
      translations: ((row as { translations?: DbTranslation[] }).translations ?? []).map((t) =>
        this.translationToContract(t),
      ),
    }));

    return {
      segments,
      lastSequence: page.at(-1)?.sequence ?? options.afterSequence ?? 0,
      hasMore,
    };
  }

  /** The last few final segments, used as translation continuity context. */
  async recentContext(sessionId: string, take = 3): Promise<string[]> {
    const rows = await this.prisma.transcriptSegment.findMany({
      where: { sessionId },
      orderBy: { sequence: 'desc' },
      take,
      select: { originalTextEncrypted: true },
    });
    return rows
      .reverse()
      .map((row) => this.context.cipher.tryDecrypt(row.originalTextEncrypted))
      .filter((text): text is string => Boolean(text));
  }

  async plainTextExport(sessionId: string, language: string): Promise<string> {
    const { segments } = await this.listSegments({ sessionId, language, limit: 500 });
    return segments
      .map(({ segment, translations }) => {
        if (language === ORIGINAL_LANGUAGE) return segment.originalText;
        return translations[0]?.translatedText ?? segment.originalText;
      })
      .join('\n\n');
  }

  toContract(row: DbSegment): TranscriptSegment {
    return {
      id: row.id,
      sessionId: row.sessionId,
      speakerSlotId: row.speakerSlotId,
      sourceLanguage: row.sourceLanguage,
      originalText: this.context.cipher.tryDecrypt(row.originalTextEncrypted) ?? '',
      startedAtMs: row.startedAtMs,
      endedAtMs: row.endedAtMs,
      isFinal: true,
      sequence: row.sequence,
    };
  }

  translationToContract(row: DbTranslation): Translation {
    return {
      segmentId: row.segmentId,
      targetLanguage: row.targetLanguage,
      translatedText: this.context.cipher.tryDecrypt(row.translatedTextEncrypted) ?? '',
      model: row.model,
      isProvisional: false,
    };
  }

  /** Diagnostics for the operator console. */
  cacheStats(): { entries: number; maxEntries: number } {
    return {
      entries: this.translationCache.size,
      maxEntries: TranscriptService.MAX_CACHE_ENTRIES,
    };
  }
}
