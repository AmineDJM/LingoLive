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

  it('degrades to the bare code when there are no details at all', () => {
    expect(errorReference(new Error('boom'), 'INTERNAL_ERROR')).toBe('INTERNAL_ERROR');
    expect(errorReference(undefined, 'INTERNAL_ERROR')).toBe('INTERNAL_ERROR');
  });

  it('never displays the provider message, which can quote what was typed', () => {
    // The API does not send it. This asserts the display side would not show
    // it even if a future change started including it.
    const error = {
      details: {
        providerCode: 'invalid_prompt',
        providerMessage: 'Invalid prompt: "Dr Amina Haddad"',
        requestId: 'req_1',
      },
    };
    expect(errorReference(error, 'AI_PROVIDER_UNAVAILABLE')).not.toContain('Amina');
  });
});

describe('errorCodeOf', () => {
  it('reads the code off anything the api-client threw', () => {
    expect(errorCodeOf({ code: 'SESSION_FULL' })).toBe('SESSION_FULL');
  });

  it('treats an unrecognised throw as an internal error rather than crashing', () => {
    expect(errorCodeOf(new TypeError('undefined is not an object'))).toBe('INTERNAL_ERROR');
    expect(errorCodeOf(null)).toBe('INTERNAL_ERROR');
  });
});
