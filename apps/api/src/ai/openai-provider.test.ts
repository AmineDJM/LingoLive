import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@lingolive/config';
import { createSilentLogger } from '@lingolive/logging';
import { LingoLiveError } from '@lingolive/contracts';
import {
  OpenAiTranscriptionProvider,
  OpenAiTranslationProvider,
  readTranslationStream,
} from './openai-provider.js';
import type { TranscriptionCredentialRequest } from './types.js';

/**
 * The request LingoLive sends to mint an ephemeral transcription credential.
 *
 * This is the one call in the product that cannot be exercised by the mock
 * provider and costs money to try for real, so it shipped unverified — with
 * the model one level too high in the body. The provider answered 400, the
 * user saw "an error occurred", and nothing anywhere said why.
 *
 * These tests pin the wire shape and the diagnostics. They assert what leaves
 * the process and what is reported when the answer is a rejection, because
 * those are the two things that were wrong.
 */

function providerFor(
  fetchFn: typeof fetch,
  overrides: Record<string, string> = {},
): OpenAiTranscriptionProvider {
  const env = parseServerEnv({
    ...process.env,
    AI_PROVIDER: 'openai',
    // Deliberately not shaped like a real provider key: the secret scanner
    // rightly flags anything that is, and a test fixture is not worth an
    // exception in a check that exists to stop a key reaching the repository.
    OPENAI_API_KEY: 'test-provider-credential-placeholder',
    OPENAI_TRANSCRIPTION_MODEL: 'gpt-live-transcribe',
    OPENAI_TRANSLATION_MODEL: 'gpt-5.6-luna',
    ...overrides,
  });
  return new OpenAiTranscriptionProvider(env, createSilentLogger(), fetchFn);
}

const baseRequest: TranscriptionCredentialRequest = {
  sessionId: 'session-1',
  spokenLanguage: 'auto',
  vocabularyHints: [],
  platform: 'web',
  preferredTransport: 'auto',
  ttlSeconds: 60,
  vad: { mode: 'server', silenceMs: 600, threshold: 0.5, prefixPaddingMs: 300 },
  noiseReduction: 'far_field',
};

/** The parameters this provider is allowed to send. Written out rather than
 * inferred, so a test reads as a specification of the wire format. */
interface SentBody {
  expires_after?: { anchor: string; seconds: number };
  session?: {
    type?: string;
    audio?: {
      input?: {
        transcription?: { model?: string; language?: string; prompt?: string };
        turn_detection?: {
          type?: string;
          threshold?: number;
          prefix_padding_ms?: number;
          silence_duration_ms?: number;
        };
        noise_reduction?: { type?: string };
        /** Only ever present if the old bug comes back. */
        model?: string;
      };
    };
  };
  input_audio_transcription?: { model?: string; language?: string; prompt?: string };
}

interface RecordedCall {
  url: string;
  body: SentBody;
}

/** Captures the outgoing request and answers with a valid credential. */
function recordingFetch(): { calls: RecordedCall[]; fetchFn: typeof fetch } {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as SentBody,
    });
    return new Response(
      JSON.stringify({ value: 'ek_ephemeral_secret', expires_at: 1_800_000_000 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('OpenAI transcription credential request', () => {
  it('nests the model under audio.input.transcription, not audio.input', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential(baseRequest);

    const input = calls[0]?.body.session?.audio?.input;
    expect(calls[0]?.body.session?.type).toBe('transcription');
    expect(input?.transcription?.model).toBe('gpt-live-transcribe');
    // The bug: these sat directly on `audio.input`, which the API rejects as
    // an unknown parameter.
    expect(input?.model).toBeUndefined();
  });

  it('sends the turn detection that decides when a sentence settles', async () => {
    // Computed per session kind, returned to the client, and previously never
    // sent — so every session ran on the provider's defaults and text hung
    // unfinished for seconds after the speaker stopped. That reads as a slow
    // product, not as a missing parameter.
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential(baseRequest);

    expect(calls[0]?.body.session?.audio?.input?.turn_detection).toEqual({
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 600,
    });
  });

  it('tells the provider how far away the voices are', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential(baseRequest);
    expect(calls[0]?.body.session?.audio?.input?.noise_reduction).toEqual({ type: 'far_field' });
  });

  it('omits noise reduction entirely rather than inventing a "none" type', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential({
      ...baseRequest,
      noiseReduction: 'none',
    });
    expect(calls[0]?.body.session?.audio?.input?.noise_reduction).toBeUndefined();
  });

  it('sends the TTL as expires_after so the credential cannot outlive the session', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential({ ...baseRequest, ttlSeconds: 45 });

    expect(calls[0]?.body.expires_after).toEqual({ anchor: 'created_at', seconds: 45 });
  });

  it('omits the language entirely when it is auto-detected', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential(baseRequest);

    // `auto` is a LingoLive concept, not a language code. Sending the literal
    // string would be rejected; the absence of the field is what means "detect".
    const transcription = calls[0]?.body.session?.audio?.input?.transcription ?? {};
    expect(Object.keys(transcription)).not.toContain('language');
  });

  it('passes a chosen spoken language through', async () => {
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn).createEphemeralCredential({ ...baseRequest, spokenLanguage: 'fr' });

    expect(calls[0]?.body.session?.audio?.input?.transcription?.language).toBe('fr');
  });

  it('switches to the legacy body when pointed at the legacy endpoint', async () => {
    // The reason OPENAI_REALTIME_SESSION_PATH is configurable: the two entry
    // points do not take the same body, so changing the path must change the
    // shape too or the switch is useless.
    const { calls, fetchFn } = recordingFetch();
    await providerFor(fetchFn, {
      OPENAI_REALTIME_SESSION_PATH: '/transcription_sessions',
    }).createEphemeralCredential(baseRequest);

    expect(calls[0]?.url).toContain('/transcription_sessions');
    expect(calls[0]?.body.input_audio_transcription?.model).toBe('gpt-live-transcribe');
    expect(calls[0]?.body.session).toBeUndefined();
  });

  it('never puts the API key anywhere but the Authorization header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      return new Response(JSON.stringify({ value: 'ek_secret' }), { status: 200 });
    }) as unknown as typeof fetch;

    await providerFor(fetchFn).createEphemeralCredential(baseRequest);

    expect(calls[0]?.url).not.toContain('test-provider-credential');
    expect(String(calls[0]?.init?.body)).not.toContain('test-provider-credential');
  });
});

describe('when the provider rejects the audio tuning', () => {
  /** Answers 400 to the first call and 200 to the second. */
  function pickyFetch(): { bodies: SentBody[]; fetchFn: typeof fetch } {
    const bodies: SentBody[] = [];
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as SentBody);
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Invalid value for turn_detection.type',
              type: 'invalid_request_error',
              code: 'invalid_value',
              param: 'session.audio.input.turn_detection.type',
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ value: 'ek_secret' }), { status: 200 });
    }) as unknown as typeof fetch;
    return { bodies, fetchFn };
  }

  it('retries without the tuning rather than failing the session', async () => {
    // Listening on the provider's defaults is worse than listening on ours.
    // It is far better than not listening at all, which is what a hard failure
    // here means to someone who just pressed Listen.
    const { bodies, fetchFn } = pickyFetch();
    const credential = await providerFor(fetchFn).createEphemeralCredential(baseRequest);

    expect(credential.clientSecret).toBe('ek_secret');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.session?.audio?.input?.turn_detection).toBeDefined();
    expect(bodies[1]?.session?.audio?.input?.turn_detection).toBeUndefined();
    expect(bodies[1]?.session?.audio?.input?.noise_reduction).toBeUndefined();
  });

  it('keeps the model and language on the retry — only the tuning is dropped', async () => {
    const { bodies, fetchFn } = pickyFetch();
    await providerFor(fetchFn).createEphemeralCredential({ ...baseRequest, spokenLanguage: 'fr' });

    const retried = bodies[1]?.session?.audio?.input?.transcription;
    expect(retried?.model).toBe('gpt-live-transcribe');
    expect(retried?.language).toBe('fr');
  });

  it('does not retry a rejected key, which no retry can fix', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), { status: 401 });
    }) as unknown as typeof fetch;

    await providerFor(fetchFn)
      .createEphemeralCredential(baseRequest)
      .catch(() => undefined);
    expect(calls).toBe(1);
  });

  it('reports the second failure when the retry fails too', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: { code: 'model_not_found' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const error = await providerFor(fetchFn)
      .createEphemeralCredential(baseRequest)
      .catch((caught: unknown) => caught);

    expect((error as LingoLiveError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((error as LingoLiveError).details?.providerCode).toBe('model_not_found');
  });
});

describe('OpenAI transcription failures', () => {
  function rejectingFetch(status: number, payload: unknown): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
  }

  it("reports the provider's own reason instead of an unexplained failure", async () => {
    const fetchFn = rejectingFetch(400, {
      error: {
        message: "Unknown parameter: 'session.audio.input.model'.",
        type: 'invalid_request_error',
        code: 'unknown_parameter',
        param: 'session.audio.input.model',
      },
    });

    const error = await providerFor(fetchFn)
      .createEphemeralCredential(baseRequest)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LingoLiveError);
    const details = (error as LingoLiveError).details;
    expect(details?.providerStatus).toBe(400);
    expect(details?.providerType).toBe('invalid_request_error');
    expect(details?.providerCode).toBe('unknown_parameter');
    expect(details?.providerParam).toBe('session.audio.input.model');
  });

  it('does not surface the provider message, which can quote what the user typed', async () => {
    // Vocabulary hints are typed by the user and are echoed back in provider
    // error messages. The type/code/param triple is provider vocabulary and is
    // safe; the message is not, so it stays in the log and off the wire.
    const fetchFn = rejectingFetch(400, {
      error: {
        message: 'Invalid prompt: "Dr Amina Haddad, mitral valve"',
        type: 'invalid_request_error',
      },
    });

    const error = await providerFor(fetchFn)
      .createEphemeralCredential({ ...baseRequest, vocabularyHints: ['Dr Amina Haddad'] })
      .catch((caught: unknown) => caught);

    expect(JSON.stringify((error as LingoLiveError).details)).not.toContain('Amina');
  });

  it('maps a rate limit to RATE_LIMITED and everything else to AI_PROVIDER_UNAVAILABLE', async () => {
    const limited = await providerFor(rejectingFetch(429, { error: { type: 'rate_limit_error' } }))
      .createEphemeralCredential(baseRequest)
      .catch((caught: unknown) => caught);
    expect((limited as LingoLiveError).code).toBe('RATE_LIMITED');

    const rejected = await providerFor(rejectingFetch(401, { error: { code: 'invalid_api_key' } }))
      .createEphemeralCredential(baseRequest)
      .catch((caught: unknown) => caught);
    expect((rejected as LingoLiveError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((rejected as LingoLiveError).details?.providerCode).toBe('invalid_api_key');
  });

  it('still reports the status when the body is not JSON', async () => {
    // A gateway between us and the provider answers HTML. The diagnostic helper
    // must not throw over it and hide the real failure.
    const fetchFn = (async () =>
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
      })) as unknown as typeof fetch;

    const error = await providerFor(fetchFn)
      .createEphemeralCredential(baseRequest)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LingoLiveError);
    expect((error as LingoLiveError).details?.providerStatus).toBe(502);
  });

  it('accepts either documented shape for the returned secret', async () => {
    const nested = (async () =>
      new Response(JSON.stringify({ client_secret: { value: 'ek_nested', expires_at: 1_800 } }), {
        status: 200,
      })) as unknown as typeof fetch;

    const credential = await providerFor(nested).createEphemeralCredential(baseRequest);
    expect(credential.clientSecret).toBe('ek_nested');
  });
});

describe('translation on the critical path', () => {
  /**
   * Between someone speaking and someone reading. Every token here is time a
   * person spends watching a line that has not arrived, which is why the
   * single-language case — a person reading a room in their own language, i.e.
   * most of them — is treated separately.
   */
  interface ChatBody {
    messages?: Array<{ role: string; content: string }>;
    response_format?: { type: string };
    max_tokens?: number;
    temperature?: number;
  }

  function chatFetch(content: string): { bodies: ChatBody[]; fetchFn: typeof fetch } {
    const bodies: ChatBody[] = [];
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as ChatBody);
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return { bodies, fetchFn };
  }

  function translatorFor(fetchFn: typeof fetch): OpenAiTranslationProvider {
    const env = parseServerEnv({
      ...process.env,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-provider-credential-placeholder',
      OPENAI_TRANSLATION_MODEL: 'gpt-5.6-luna',
    });
    return new OpenAiTranslationProvider(env, createSilentLogger(), fetchFn);
  }

  it('asks for plain text when there is one reading language', async () => {
    const { bodies, fetchFn } = chatFetch('Bonjour tout le monde.');
    const results = await translatorFor(fetchFn).translateSegment({
      text: 'Hello everyone.',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
    });

    // No JSON envelope to generate: the wrapper is pure latency when there is
    // exactly one slot to fill.
    expect(bodies[0]?.response_format).toBeUndefined();
    expect(results[0]?.translatedText).toBe('Bonjour tout le monde.');
    expect(results[0]?.targetLanguage).toBe('fr');
  });

  it('still uses JSON when several languages must be told apart', async () => {
    const { bodies, fetchFn } = chatFetch(
      JSON.stringify({ translations: { fr: 'Bonjour.', es: 'Hola.' } }),
    );
    const results = await translatorFor(fetchFn).translateSegment({
      text: 'Hello.',
      sourceLanguage: 'en',
      targetLanguages: ['fr', 'es'],
    });

    expect(bodies[0]?.response_format).toEqual({ type: 'json_object' });
    expect(results).toHaveLength(2);
  });

  it('bounds the reply so one confused generation cannot stall the line', async () => {
    const { bodies, fetchFn } = chatFetch('Bonjour.');
    await translatorFor(fetchFn).translateSegment({
      text: 'Hello.',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
    });

    expect(bodies[0]?.max_tokens).toBeGreaterThan(0);
    expect(bodies[0]?.max_tokens).toBeLessThanOrEqual(1200);
    // A live caption is a translation, not a rewrite.
    expect(bodies[0]?.temperature).toBe(0);
  });

  it('never asks for a translation into the language already being spoken', async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const results = await translatorFor(fetchFn).translateSegment({
      text: 'Bonjour.',
      sourceLanguage: 'fr',
      targetLanguages: ['fr'],
    });

    expect(results).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('reading a streamed translation', () => {
  function streamOf(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  const frame = (content: string): string =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

  it('announces the text so far as each piece arrives', async () => {
    const seen: string[] = [];
    const result = await readTranslationStream(
      streamOf([frame('Bonjour'), frame(' tout'), frame(' le monde.'), 'data: [DONE]\n\n']),
      (text) => seen.push(text),
    );

    expect(seen).toEqual(['Bonjour', 'Bonjour tout', 'Bonjour tout le monde.']);
    expect(result.content).toBe('Bonjour tout le monde.');
  });

  it('survives a frame split across two reads', async () => {
    // A chunk boundary lands wherever the network puts it, and half a frame is
    // not JSON. Dropping it loses tokens silently — the translation simply
    // comes out missing words, with nothing logged anywhere.
    const whole = frame('Bonjour tout le monde.');
    const cut = Math.floor(whole.length / 2);
    const seen: string[] = [];
    const result = await readTranslationStream(
      streamOf([whole.slice(0, cut), whole.slice(cut), 'data: [DONE]\n\n']),
      (text) => seen.push(text),
    );

    expect(result.content).toBe('Bonjour tout le monde.');
    expect(seen).toEqual(['Bonjour tout le monde.']);
  });

  it('ignores [DONE] and malformed frames rather than ending the translation', async () => {
    const seen: string[] = [];
    const result = await readTranslationStream(
      streamOf([frame('Bonjour'), 'data: {not json}\n\n', frame(' !'), 'data: [DONE]\n\n']),
      (text) => seen.push(text),
    );
    expect(result.content).toBe('Bonjour !');
  });

  it('keeps the usage figures the cost ledger depends on', async () => {
    const usageFrame = `data: ${JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 42, completion_tokens: 7 },
    })}\n\n`;
    const result = await readTranslationStream(
      streamOf([frame('Bonjour.'), usageFrame, 'data: [DONE]\n\n']),
      () => {},
    );

    expect(result.usage?.promptTokens).toBe(42);
    expect(result.usage?.completionTokens).toBe(7);
  });

  it('flushes a stream that ends without a trailing newline', async () => {
    const result = await readTranslationStream(
      streamOf([`data: ${JSON.stringify({ choices: [{ delta: { content: 'Bonjour.' } }] })}`]),
      () => {},
    );
    expect(result.content).toBe('Bonjour.');
  });
});

describe('when the provider rejects the translation tuning', () => {
  interface ChatRequest {
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    stream_options?: unknown;
  }

  /** Answers 400 to the first call and a translation to the second. */
  function pickyChat(): { bodies: ChatRequest[]; fetchFn: typeof fetch } {
    const bodies: ChatRequest[] = [];
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as ChatRequest);
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Unsupported parameter: 'max_tokens'.",
              type: 'invalid_request_error',
              code: 'unsupported_parameter',
              param: 'max_tokens',
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Bonjour.' } }], usage: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    return { bodies, fetchFn };
  }

  function translatorFor(fetchFn: typeof fetch): OpenAiTranslationProvider {
    const env = parseServerEnv({
      ...process.env,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-provider-credential-placeholder',
      OPENAI_TRANSLATION_MODEL: 'gpt-5.6-luna',
    });
    return new OpenAiTranslationProvider(env, createSilentLogger(), fetchFn);
  }

  it('still translates rather than falling back to the untranslated original', async () => {
    // This is the failure mode that matters most in the whole product. A
    // rejected translation raises nothing a user sees: it is caught upstream
    // and degrades to the original text, so someone reading in French simply
    // keeps seeing English with no explanation anywhere.
    const { bodies, fetchFn } = pickyChat();
    const results = await translatorFor(fetchFn).translateSegment({
      text: 'Hello.',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
    });

    expect(results[0]?.translatedText).toBe('Bonjour.');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.max_tokens).toBeDefined();
    expect(bodies[1]?.max_tokens).toBeUndefined();
    expect(bodies[1]?.temperature).toBeUndefined();
  });

  it('drops streaming on the retry so the reply shape matches how it is read', async () => {
    // The retry is read as a whole body. Asking for a stream and then parsing
    // it as JSON would turn one rejected parameter into a parse failure.
    const { bodies, fetchFn } = pickyChat();
    const results = await translatorFor(fetchFn).translateSegment({
      text: 'Hello.',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
      onDelta: () => {},
    });

    expect(bodies[0]?.stream).toBe(true);
    expect(bodies[1]?.stream).toBeUndefined();
    expect(bodies[1]?.stream_options).toBeUndefined();
    expect(results[0]?.translatedText).toBe('Bonjour.');
  });
});
