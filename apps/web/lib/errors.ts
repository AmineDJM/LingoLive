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
    // The provider call failed or was never configured. Both are the
    // operator's problem, and saying so beats "an error occurred" — which
    // tells a user nothing and tells whoever they report it to even less.
    case 'AI_PROVIDER_UNAVAILABLE':
      return t.t('errors.transcriptionUnavailable');
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return t.t('errors.notConfigured');
    case 'RATE_LIMITED':
      return t.t('errors.serverUnavailable');
    case 'SESSION_EXPIRED':
    case 'SESSION_MAX_DURATION_REACHED':
      return t.t('errors.sessionTooLong');
    default:
      return t.t('errors.generic');
  }
}

/**
 * Pulls the code out of anything thrown while starting a session.
 *
 * Not everything comes from the API. `new WebSocket()` throws a `SecurityError`
 * when the Content-Security-Policy does not list the origin it is dialling, and
 * `getUserMedia` throws a `NotAllowedError` when the microphone is refused.
 * Both used to collapse into a bare `INTERNAL_ERROR`, which says only that
 * something happened somewhere — and neither leaves a trace in the server log,
 * because the server was never reached.
 *
 * The browser's own name for the failure is far more use than our fallback, so
 * it becomes the code. It has no localised copy and does not need one: the
 * message stays generic, and the name goes in the reference line for whoever
 * has to fix it.
 */
export function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  if (error instanceof Error && error.name && error.name !== 'Error') {
    return error.name;
  }
  return 'INTERNAL_ERROR';
}

/**
 * The one line that makes a report actionable.
 *
 * Every API failure carries a `requestId` that points at the exact server log
 * entry, and it is safe to show: it contains no transcript, no token and no
 * identity. Without it, "an error occurred" is all anyone — the user, support,
 * whoever wrote the code — ever has to go on.
 *
 * Shown small, under the human-readable message. The message is for the
 * person; this is for whoever they forward it to.
 */
export function errorReference(error: unknown, code: string): string {
  const details =
    typeof error === 'object' && error && 'details' in error
      ? (error as { details?: Record<string, unknown> }).details
      : undefined;

  const parts = [code];

  // When an upstream provider is the one refusing, its own code says which
  // refusal it is — a key that was rejected, a model the account cannot use, a
  // parameter in the wrong place. Without it every one of those looks
  // identical from here, which cost several rounds of guessing once.
  //
  // Safe to display: these are the provider's vocabulary, not its prose. The
  // message, which can quote what the user typed, is deliberately not sent.
  // The upstream HTTP status. For a failure that happens in the browser — the
  // SDP exchange with the provider — there is no server log line at all, so
  // this is the only thing separating a wrong URL (404) from a rejected
  // parameter (400) from an expired credential (401).
  const providerStatus = details?.['providerStatus'];
  if (typeof providerStatus === 'number') parts.push(String(providerStatus));

  const providerCode = details?.['providerCode'] ?? details?.['providerType'];
  if (typeof providerCode === 'string' && providerCode) parts.push(providerCode);

  // Which field was rejected. `invalid_value` says a parameter is wrong;
  // `param` says which one, and without it the two are equally undiagnosable.
  const providerParam = details?.['providerParam'];
  if (typeof providerParam === 'string' && providerParam) parts.push(providerParam);

  // Only ever set by a transport whose request carried no user content. The
  // API deliberately does not send this back; see the note in the provider.
  const providerMessage = details?.['providerMessage'];
  if (typeof providerMessage === 'string' && providerMessage) parts.push(providerMessage);

  const requestId = details?.['requestId'];
  if (typeof requestId === 'string' && requestId) parts.push(requestId);

  return parts.join(' · ');
}
