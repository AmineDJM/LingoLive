import type { createTranslator } from '@lingolive/i18n';

/**
 * Error codes → localised copy.
 *
 * A raw code shown to a user is a bug, not a diagnostic. Someone in a waiting
 * room who reads `SERVICE_UNAVAILABLE` learns nothing they can act on, and it
 * is not even in their language. The join screen had this mapping; the listen
 * screen printed the code. Now there is one of them, and both use it.
 *
 * The `requestId` is the diagnostic, and it is shown separately — it is safe
 * to quote and it points at the exact server log line.
 */
export type Translator = ReturnType<typeof createTranslator>;

export function localisedError(t: Translator, code: string): string {
  switch (code) {
    case 'INVALID_ACCESS_CODE':
      return t.t('errors.invalidCode');
    case 'ACCESS_CODE_EXPIRED':
      return t.t('errors.codeExpired');
    case 'SESSION_ALREADY_ENDED':
    case 'SESSION_NOT_FOUND':
      return t.t('errors.sessionEnded');
    case 'SESSION_FULL':
      return t.t('errors.sessionFull');
    case 'QUOTA_EXCEEDED':
    case 'COST_LIMIT_REACHED':
      return t.t('errors.quotaExceeded');
    case 'SESSION_LIMIT_REACHED':
      return t.t('errors.sessionTooLong');
    case 'TRANSLATION_FAILED':
      return t.t('errors.translationUnavailable');
    // The client could not reach the API at all.
    //
    // NOT `errors.network`. That string says "weak connection, reconnecting",
    // which blames the user's network and promises a retry that is not
    // happening. When the app is served from the same origin it calls, a
    // failure here is the deployment's problem, not theirs — and a message
    // that misdirects is worse than a vague one.
    case 'NETWORK_UNAVAILABLE':
      return t.t('errors.serverUnreachable');
    case 'UPSTREAM_TIMEOUT':
      return t.t('errors.network');
    case 'SERVICE_UNAVAILABLE':
      return t.t('errors.serverUnavailable');
    default:
      return t.t('errors.generic');
  }
}

/** Pulls the code out of anything thrown by `@lingolive/api-client`. */
export function errorCodeOf(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'INTERNAL_ERROR';
}
