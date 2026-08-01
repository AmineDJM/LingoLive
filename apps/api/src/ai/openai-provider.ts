import { dedupeTargetLanguages, findLanguage, LingoLiveError } from '@lingolive/contracts';
import type { ServerEnv } from '@lingolive/config';
import { scrubForLog, type Logger } from '@lingolive/logging';
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

    let response: Response;
    try {
      response = await this.post(this.sessionRequestBody(model, request));

      /**
       * The tuning is an optimisation, not a requirement.
       *
       * `turn_detection` and `noise_reduction` are what make the transcript
       * keep up and hear a distant speaker, but which of them a given model
       * accepts is not something this code can know — and a provider that
       * rejects one currently takes the whole session down with it. Listening
       * with default settings is worse than listening with tuned ones; it is
       * far better than not listening at all.
       *
       * So a 400 is retried once without them, loudly. The log names the exact
       * parameter, which is the thing needed to stop doing this permanently.
       */
      if (response.status === 400) {
        const failure = await describeProviderFailure(response);
        this.logger.warn(
          {
            sessionId: request.sessionId,
            provider: 'openai',
            model,
            ...failure,
            providerMessage: scrubForLog(failure.providerMessage),
          },
          'Provider rejected the audio tuning; retrying with its defaults. ' +
            'Latency and accuracy will be worse until the parameter above is corrected.',
        );
        response = await this.post(this.sessionRequestBody(model, request, { omitTuning: true }));
      }
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
      // The provider says exactly what is wrong — a rejected key, a model this
      // account cannot use, a parameter in the wrong place. Throwing that away
      // and reporting "an error occurred" turned a one-line fix into several
      // rounds of guessing against a deployment we cannot see.
      const failure = await describeProviderFailure(response);
      this.logger.error(
        {
          sessionId: request.sessionId,
          provider: 'openai',
          model,
          // The path, never the full URL: it carries no key, but there is no
          // reason to put a credentialled endpoint in a log either.
          sessionPath: this.env.OPENAI_REALTIME_SESSION_PATH,
          ...failure,
          // A provider error message quotes the value that caused it, and
          // vocabulary hints are typed by the user.
          providerMessage: scrubForLog(failure.providerMessage),
        },
        'Transcription provider rejected the credential request',
      );
      throw new LingoLiveError(
        response.status === 429 ? 'RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE',
        'Could not create a transcription credential',
        {
          // `type`, `code` and `param` are the provider's own vocabulary —
          // `invalid_request_error`, `model_not_found`, a parameter path. No
          // transcript, no key, nothing the user said. The message is NOT
          // included: it is the one field that can quote user input.
          details: {
            providerStatus: failure.providerStatus,
            ...(failure.providerType ? { providerType: failure.providerType } : {}),
            ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
            ...(failure.providerParam ? { providerParam: failure.providerParam } : {}),
          },
        },
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

  /** One credential request. Separate so the tuning fallback can repeat it. */
  private post(body: Record<string, unknown>): Promise<Response> {
    return this.fetchFn(`${this.env.OPENAI_REALTIME_URL}${this.env.OPENAI_REALTIME_SESSION_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.env.OPENAI_API_KEY ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  /**
   * The body that mints an ephemeral transcription credential.
   *
   * There are two documented entry points and they do NOT take the same shape,
   * so the body follows the configured path rather than assuming one. That is
   * what makes `OPENAI_REALTIME_SESSION_PATH` a real switch: if one endpoint is
   * not available to an account, changing that one variable moves to the other
   * without a code change.
   *
   * In both shapes the model, the language and the prompt belong to a
   * `transcription` object. They were previously sent one level too high, at
   * `audio.input`, which the API rejects as an unknown parameter — a 400 that
   * reached the user as an unexplained error on the first tap of Listen.
   *
   * `omitTuning` drops the turn detection and noise reduction, leaving only
   * what is required to transcribe at all. It is what the retry uses when the
   * provider refuses one of them.
   */
  private sessionRequestBody(
    model: string,
    request: TranscriptionCredentialRequest,
    options: { omitTuning?: boolean } = {},
  ): Record<string, unknown> {
    const transcription = {
      model,
      // `auto` lets the model detect the spoken language, which is what the
      // product wants by default — the user picks what to *read*, not what is
      // being spoken. Omitted entirely rather than sent as the string "auto".
      language: request.spokenLanguage === 'auto' ? undefined : request.spokenLanguage,
      prompt: request.vocabularyHints.length > 0 ? request.vocabularyHints.join(', ') : undefined,
    };

    /**
     * When a turn ends, and therefore when text is allowed to settle.
     *
     * This is the single biggest lever on perceived latency. Left unsent, the
     * provider applies its own defaults and a sentence can hang unfinished for
     * seconds after the speaker has stopped — which reads as the product being
     * slow, not as a parameter being absent.
     */
    const turnDetection = options.omitTuning
      ? undefined
      : {
          type: 'server_vad',
          threshold: request.vad.threshold,
          prefix_padding_ms: request.vad.prefixPaddingMs,
          silence_duration_ms: request.vad.silenceMs,
        };

    // `none` means "send no object at all" rather than a type the API does not
    // define.
    const noiseReduction =
      options.omitTuning || request.noiseReduction === 'none'
        ? undefined
        : { type: request.noiseReduction };

    if (this.env.OPENAI_REALTIME_SESSION_PATH.includes('transcription_sessions')) {
      return {
        input_audio_transcription: transcription,
        turn_detection: turnDetection,
        input_audio_noise_reduction: noiseReduction,
      };
    }

    return {
      expires_after: { anchor: 'created_at', seconds: request.ttlSeconds },
      session: {
        type: 'transcription',
        audio: {
          input: {
            transcription,
            turn_detection: turnDetection,
            noise_reduction: noiseReduction,
          },
        },
      },
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

interface ProviderFailure {
  readonly providerStatus: number;
  readonly providerType?: string;
  readonly providerCode?: string;
  readonly providerParam?: string;
  readonly providerMessage?: string;
}

/**
 * Reads the reason out of a provider error response.
 *
 * Deliberately total: a body that is empty, truncated, HTML from a gateway or
 * simply not JSON still yields the status. A diagnostic helper that can itself
 * throw would replace the real error with its own, which is how the original
 * failure stays invisible.
 */
async function describeProviderFailure(response: Response): Promise<ProviderFailure> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: unknown; type?: unknown; code?: unknown; param?: unknown };
    };
    const error = payload.error;
    const asString = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 ? value : undefined;
    return {
      providerStatus: response.status,
      providerType: asString(error?.type),
      providerCode: asString(error?.code),
      providerParam: asString(error?.param),
      providerMessage: asString(error?.message),
    };
  } catch {
    return { providerStatus: response.status };
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

    // One target is the common case — a person reading a room in their own
    // language — and it gets the shortest possible instruction and reply.
    const single = targets.length === 1;
    const rules = [
      'You are a translation engine inside a live captioning product.',
      'Rules:',
      '- Preserve numbers, dates, units, currency amounts and proper nouns exactly.',
      '- Preserve the register and the punctuation of the source.',
      '- Do not add, remove, explain, summarise or comment.',
      '- If the text is incomplete, translate what is there without completing it.',
    ];
    const system = single
      ? [...rules, 'Reply with the translation only, and nothing else.'].join('\n')
      : [
          ...rules,
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
          // JSON only when there is something to key by. A personal session has
          // exactly one reading language, and wrapping one sentence in
          // `{"translations":{"fr":…}}` spends output tokens — and therefore
          // time, on the critical path between someone speaking and someone
          // reading — on a structure with one slot in it.
          ...(single ? {} : { response_format: { type: 'json_object' } }),
          // A translation is about as long as its input. Without a ceiling, one
          // confused generation stalls the line for the full timeout.
          max_tokens: Math.min(1200, 64 + estimateTokens(input.text) * 3 * targets.length),
          temperature: 0,
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
      // Same reasoning as the transcription path: the reason the call was
      // rejected is the whole diagnostic, and a wrong model name here is
      // exactly as likely as it is there.
      const failure = await describeProviderFailure(response);
      this.logger.warn(
        {
          provider: 'openai',
          model,
          ...failure,
          providerMessage: scrubForLog(failure.providerMessage),
        },
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

    let translations: Record<string, string>;
    if (single) {
      const target = targets[0] as string;
      translations = { [target]: content.trim() };
    } else {
      try {
        const parsed = JSON.parse(content) as { translations?: Record<string, string> };
        translations = parsed.translations ?? {};
      } catch {
        throw new LingoLiveError(
          'TRANSLATION_FAILED',
          'Translation provider returned invalid JSON',
        );
      }
    }
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
