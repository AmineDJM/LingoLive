import { mockTranslate } from '@lingolive/realtime-core';
import { dedupeTargetLanguages } from '@lingolive/contracts';
import type {
  EphemeralTranscriptionCredential,
  TranscriptionCredentialRequest,
  TranscriptionProvider,
  TranslationInput,
  TranslationProvider,
  TranslationResult,
} from './types.js';
import { estimateTokens } from './types.js';
import { randomBytes } from 'node:crypto';

/**
 * The mock provider is a first-class implementation, not a stub.
 *
 * `AI_PROVIDER=mock` runs the entire product — Listen, Discuss, Join,
 * translation, save, export, reconnection — with no OpenAI account. It backs
 * the test suite, CI, local development and the deterministic store
 * screenshots. The configuration schema forbids it in staging and production.
 */

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'mock';
  readonly available = true;

  async createEphemeralCredential(
    request: TranscriptionCredentialRequest,
  ): Promise<EphemeralTranscriptionCredential> {
    return {
      // Shaped like a real ephemeral secret so client code paths are identical.
      clientSecret: `mock_ek_${randomBytes(16).toString('hex')}`,
      expiresAt: new Date(Date.now() + request.ttlSeconds * 1000),
      model: 'mock-transcribe',
      endpoint: 'mock://transcription',
      transport: 'mock',
    };
  }
}

export class MockTranslationProvider implements TranslationProvider {
  readonly name = 'mock';
  readonly available = true;

  async translateSegment(input: TranslationInput): Promise<TranslationResult[]> {
    // The mock honours the same deduplication contract as the real provider,
    // so cost-control tests are meaningful against it.
    const targets = dedupeTargetLanguages([...input.targetLanguages], input.sourceLanguage);
    const inputTokens = estimateTokens(input.text);

    return targets.map((targetLanguage) => {
      const translatedText = mockTranslate(input.text, targetLanguage);

      // The mock streams too, so the delta path is exercised by the offline
      // suite rather than only against a live provider. One target only, which
      // is the same restriction the real provider has: a partial JSON envelope
      // is not a translation.
      if (input.onDelta && targets.length === 1) {
        const words = translatedText.split(' ');
        for (let i = 1; i <= words.length; i += 1) {
          input.onDelta({ targetLanguage, text: words.slice(0, i).join(' ') });
        }
      }

      return {
        targetLanguage,
        translatedText,
        model: 'mock-translate',
        provider: 'mock',
        inputTokens,
        outputTokens: estimateTokens(translatedText),
      };
    });
  }
}
