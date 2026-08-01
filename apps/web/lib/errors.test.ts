import { describe, expect, it } from 'vitest';
import { createTranslator } from '@lingolive/i18n';
import { API_ERROR_CODES } from '@lingolive/contracts';
import { errorCodeOf, errorReference, localisedError } from './errors';

/**
 * What a person sees when something fails, and what they can quote to whoever
 * fixes it.
 *
 * Both halves were wrong in a real deployment: every provider failure fell
 * through to "an error occurred", and the request id — already generated,
 * already safe to show — was never displayed. Two rounds of guessing followed.
 */

const fr = createTranslator('fr');

describe('localisedError', () => {
  it('never shows a raw error code to a user', () => {
    for (const code of API_ERROR_CODES) {
      const message = localisedError(fr, code);
      expect(message).not.toContain(code);
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it('blames the deployment, not the user, when the API is unreachable', () => {
    // This said "weak connection, reconnecting" — which accuses the user's
    // network and promises a retry that was not happening.
    const message = localisedError(fr, 'NETWORK_UNAVAILABLE');
    expect(message).toBe(fr.t('errors.serverUnreachable'));
    expect(message).not.toBe(fr.t('errors.network'));
  });

  it('distinguishes a provider that failed from one never configured', () => {
    expect(localisedError(fr, 'AI_PROVIDER_UNAVAILABLE')).toBe(
      fr.t('errors.transcriptionUnavailable'),
    );
    expect(localisedError(fr, 'AI_PROVIDER_NOT_CONFIGURED')).toBe(fr.t('errors.notConfigured'));
    expect(localisedError(fr, 'AI_PROVIDER_UNAVAILABLE')).not.toBe(
      localisedError(fr, 'AI_PROVIDER_NOT_CONFIGURED'),
    );
  });

  it('falls back to something rather than nothing for an unknown code', () => {
    expect(localisedError(fr, 'SOMETHING_WE_HAVE_NOT_SEEN')).toBe(fr.t('errors.generic'));
  });
});

describe('errorReference', () => {
  it('carries the request id so a report points at one server log line', () => {
    const error = { code: 'INTERNAL_ERROR', details: { requestId: 'req_abc123' } };
    expect(errorReference(error, 'INTERNAL_ERROR')).toBe('INTERNAL_ERROR · req_abc123');
  });

  it("includes the provider's own code, which is what identifies the failure", () => {
    const error = {
      code: 'AI_PROVIDER_UNAVAILABLE',
      details: { providerCode: 'model_not_found', requestId: 'req_abc123' },
    };
    expect(errorReference(error, 'AI_PROVIDER_UNAVAILABLE')).toBe(
      'AI_PROVIDER_UNAVAILABLE · model_not_found · req_abc123',
    );
  });

  it('falls back to the provider type when there is no code', () => {
    const error = { details: { providerType: 'invalid_request_error' } };
    expect(errorReference(error, 'AI_PROVIDER_UNAVAILABLE')).toBe(
      'AI_PROVIDER_UNAVAILABLE · invalid_request_error',
    );
  });

  it('shows the upstream status, code and reason for a browser-side failure', () => {
    // The SDP exchange never touches our server, so this reference line is the
    // only record that exists anywhere.
    const error = {
      code: 'SDP_EXCHANGE_FAILED',
      details: {
        providerStatus: 400,
        providerCode: 'invalid_request_error',
        providerMessage: "Unknown parameter: 'model'.",
      },
    };
    expect(errorReference(error, 'SDP_EXCHANGE_FAILED')).toBe(
      "SDP_EXCHANGE_FAILED · 400 · invalid_request_error · Unknown parameter: 'model'.",
    );
  });

  it('degrades to the bare code when there are no details at all', () => {
    expect(errorReference(new Error('boom'), 'INTERNAL_ERROR')).toBe('INTERNAL_ERROR');
    expect(errorReference(undefined, 'INTERNAL_ERROR')).toBe('INTERNAL_ERROR');
  });

  it('shows a provider message only because none that reaches here can quote a user', () => {
    // Two sources, one display, and the safety lives at the source rather than
    // here — so this test records WHICH source is allowed to set the field.
    //
    //  - The API mints the credential with the user's vocabulary hints in the
    //    request, so a provider message can echo them back. It therefore never
    //    returns one; `openai-provider.test.ts` asserts that, and it is the
    //    guarantee this display depends on.
    //  - The browser's SDP exchange sends a session description and nothing
    //    else. There is no user content in the request, so none in the reply.
    //
    // If a future change makes the API send `providerMessage`, that test fails
    // first — which is the right place to catch it, because by the time it
    // arrives here the content is already out of the server.
    const fromTransport = {
      details: { providerStatus: 404, providerMessage: 'Unknown request URL.' },
    };
    expect(errorReference(fromTransport, 'SDP_EXCHANGE_FAILED')).toContain('Unknown request URL.');

    const fromApi = { details: { providerCode: 'model_not_found', requestId: 'req_1' } };
    expect(errorReference(fromApi, 'AI_PROVIDER_UNAVAILABLE')).toBe(
      'AI_PROVIDER_UNAVAILABLE · model_not_found · req_1',
    );
  });
});

describe('errorCodeOf', () => {
  it('reads the code off anything the api-client threw', () => {
    expect(errorCodeOf({ code: 'SESSION_FULL' })).toBe('SESSION_FULL');
  });

  it("uses the browser's own name for a failure the API never saw", () => {
    // A CSP that does not list the realtime origin makes `new WebSocket()`
    // throw this. There is no request id and no server log line, because the
    // server was never reached — the name is the only thing identifying it.
    const securityError = new Error('The operation is insecure.');
    securityError.name = 'SecurityError';
    expect(errorCodeOf(securityError)).toBe('SecurityError');

    const micRefused = new Error('Permission denied');
    micRefused.name = 'NotAllowedError';
    expect(errorCodeOf(micRefused)).toBe('NotAllowedError');
  });

  it('prefers the API code over the error name when both exist', () => {
    const apiError = Object.assign(new Error('nope'), { code: 'SESSION_FULL', name: 'TypeError' });
    expect(errorCodeOf(apiError)).toBe('SESSION_FULL');
  });

  it('falls back to an internal error when there is nothing to go on', () => {
    expect(errorCodeOf(new Error('boom'))).toBe('INTERNAL_ERROR');
    expect(errorCodeOf(null)).toBe('INTERNAL_ERROR');
    expect(errorCodeOf('a string')).toBe('INTERNAL_ERROR');
  });
});
