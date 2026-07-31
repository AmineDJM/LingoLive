import { dedupeTargetLanguages, findLanguage, LingoLiveError } from '@lingolive/contracts';
import type { ServerEnv } from '@lingolive/config';
import type { Logger } from '@lingolive/logging';
import type {
  EphemeralTranscriptionCredential,
  TranscriptionCredentialRequest,
  TranscriptionProvider,
  TranslationInput,
  TranslationProvider,
  TranslationResult,
} from './types.js';
import { estimateTokens } from './types.js';

/**
 * OpenAI-backed providers.
 *
 * Two rules govern everything here:
 *
 *  1. `OPENAI_API_KEY` exists only in this process. Clients receive a
 *     short-lived, single-purpose credential minted per session — never the
 *     standard key, never through a `NEXT_PUBLIC_`/`EXPO_PUBLIC_` variable.
 *  2. No parameter is invented. Model identifiers and the realtime session
 *     endpoint come from configuration, so they can be corrected against the
 *     current API documentation at deploy time without a code change.
 *     `docs/REALTIME.md` records exactly what must be verified.
 */

export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'openai';

  constructor(
    private readonly env: ServerEnv,
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  get available(): boolean {
    return Boolean(this.env.OPENAI_API_KEY);
  }

  async createEphemeralCredential(
    request: TranscriptionCredentialRequest,
  ): Promise<EphemeralTranscriptionCredential> {
    if (!this.env.OPENAI_API_KEY) {
      throw new LingoLiveError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'OPENAI_API_KEY is not configured on this server',
      );
    }

    const model = this.env.OPENAI_TRANSCRIPTION_MODEL;
    const transport = this.resolveTransport(request);

    // Realtime session parameters are supplied as documented by the provider;
    // the endpoint is configurable so a path change is a deploy, not a patch.
    const body = {
      model,
      // `auto` lets the model detect the spoken language, which is what the
      // product wants by default — the user picks what to *read*, not what is
      // being spoken.
      language: request.spokenLanguage === 'auto' ? undefined : request.spokenLanguage,
      prompt: request.vocabularyHints.length > 0 ? request.vocabularyHints.join(', ') : undefined,
    };

    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.env.OPENAI_REALTIME_URL}${this.env.OPENAI_REALTIME_SESSION_PATH}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            expires_after: { anchor: 'created_at', seconds: request.ttlSeconds },
            session: { type: 'transcription', audio: { input: body } },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      // Never log the key, the URL query or the response body.
      this.logger.error(
        { sessionId: request.sessionId, provider: 'openai' },
        'Failed to reach the transcription provider',
      );
      throw new LingoLiveError(
        'AI_PROVIDER_UNAVAILABLE',
        'The transcription provider is unreachable',
        { cause: error },
      );
    }

    if (!response.ok) {
      this.logger.error(
        { sessionId: request.sessionId, status: response.status, provider: 'openai' },
        'Transcription provider rejected the credential request',
      );
      throw new LingoLiveError(
        response.status === 429 ? 'RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE',
        'Could not create a transcription credential',
      );
    }

    const payload = (await response.json()) as {
      value?: string;
      client_secret?: { value?: string; expires_at?: number };
      expires_at?: number;
    };

    // Accept either documented shape rather than assuming one.
    const clientSecret = payload.value ?? payload.client_secret?.value;
    if (!clientSecret) {
      throw new LingoLiveError(
        'TRANSCRIPTION_FAILED',
        'The transcription provider returned no client secret',
      );
    }

    const expiresAtSeconds = payload.expires_at ?? payload.client_secret?.expires_at;
    const expiresAt = expiresAtSeconds
      ? new Date(expiresAtSeconds * 1000)
      : new Date(Date.now() + request.ttlSeconds * 1000);

    return {
      clientSecret,
      expiresAt,
      model,
      endpoint: this.env.OPENAI_REALTIME_URL,
      transport,
    };
  }

  /**
   * Web uses WebRTC directly to the provider (lowest latency). Mobile routes
   * audio through this API over WSS — see ADR 0004.
   */
  private resolveTransport(
    request: TranscriptionCredentialRequest,
  ): EphemeralTranscriptionCredential['transport'] {
    if (request.preferredTransport === 'webrtc') return 'webrtc';
    if (request.preferredTransport === 'websocket') return 'websocket';
    return request.platform === 'web' ? 'webrtc' : 'websocket';
  }
}

export class OpenAiTranslationProvider implements TranslationProvider {
  readonly name = 'openai';

  constructor(
    private readonly env: ServerEnv,
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  get available(): boolean {
    return Boolean(this.env.OPENAI_API_KEY && this.env.OPENAI_TRANSLATION_MODEL);
  }

  async translateSegment(input: TranslationInput): Promise<TranslationResult[]> {
    if (!this.available) {
      throw new LingoLiveError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'Translation is not configured on this server',
      );
    }
    const model = this.env.OPENAI_TRANSLATION_MODEL as string;
    const targets = dedupeTargetLanguages([...input.targetLanguages], input.sourceLanguage);
    if (targets.length === 0) return [];

    // One request covering every target language: N languages cost one call,
    // not N calls.
    const results = await this.requestTranslations(model, input, targets);
    return results;
  }

  private async requestTranslations(
    model: string,
    input: TranslationInput,
    targets: string[],
  ): Promise<TranslationResult[]> {
    const targetDescriptions = targets
      .map((code) => {
        const language = findLanguage(code);
        return `"${code}" (${language?.englishName ?? code})`;
      })
      .join(', ');

    const system = [
      'You are a translation engine inside a live captioning product.',
      'Translate the user text faithfully into every requested language.',
      'Rules:',
      '- Preserve numbers, dates, units, currency amounts and proper nouns exactly.',
      '- Preserve the register and the punctuation of the source.',
      '- Do not add, remove, explain, summarise or comment.',
      '- If the text is incomplete, translate what is there without completing it.',
      'Reply with JSON only, of the form {"translations":{"<language code>":"<text>"}}.',
    ].join('\n');

    const contextLines = input.context?.recentSegments?.length
      ? `Preceding context (do not translate, use only for continuity):\n${input.context.recentSegments.join('\n')}\n\n`
      : '';
    const glossaryLines = input.context?.glossary?.length
      ? `Keep these terms unchanged: ${input.context.glossary.join(', ')}\n\n`
      : '';

    const user =
      `${contextLines}${glossaryLines}` +
      `Source language: ${input.sourceLanguage ?? 'unknown, detect it'}\n` +
      `Target languages: ${targetDescriptions}\n\n` +
      `Text:\n${input.text}`;

    let response: Response;
    try {
      response = await this.fetchFn(`${this.env.OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // Structured output: the response is parseable or the call failed.
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.warn({ provider: 'openai', model }, 'Translation request failed to send');
      throw new LingoLiveError('TRANSLATION_FAILED', 'Translation provider unreachable', {
        cause: error,
      });
    }

    if (!response.ok) {
      this.logger.warn(
        { provider: 'openai', model, status: response.status },
        'Translation provider returned an error',
      );
      throw new LingoLiveError(
        response.status === 429 ? 'RATE_LIMITED' : 'TRANSLATION_FAILED',
        'Translation provider returned an error',
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new LingoLiveError('TRANSLATION_FAILED', 'Translation provider returned no content');
    }

    let parsed: { translations?: Record<string, string> };
    try {
      parsed = JSON.parse(content) as { translations?: Record<string, string> };
    } catch {
      throw new LingoLiveError('TRANSLATION_FAILED', 'Translation provider returned invalid JSON');
    }

    const translations = parsed.translations ?? {};
    const inputTokens = payload.usage?.prompt_tokens ?? estimateTokens(user);
    const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(content);
    // Token usage is reported once for the whole call; splitting it evenly
    // across languages keeps per-language attribution honest in aggregate.
    const perTarget = Math.max(1, targets.length);

    const results: TranslationResult[] = [];
    for (const target of targets) {
      const text = translations[target] ?? translations[target.toLowerCase()];
      if (typeof text !== 'string' || text.trim().length === 0) {
        // A missing language degrades to "no translation" — the client falls
        // back to the original text rather than showing an empty line.
        this.logger.warn(
          { provider: 'openai', target },
          'Translation missing for a target language',
        );
        continue;
      }
      results.push({
        targetLanguage: target,
        translatedText: text,
        model,
        provider: 'openai',
        inputTokens: Math.round(inputTokens / perTarget),
        outputTokens: Math.round(outputTokens / perTarget),
      });
    }

    return results;
  }
}
