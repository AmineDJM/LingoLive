import { normalizeAccessCode } from '@lingolive/contracts';

/**
 * Deep links for joining a LingoBusiness session.
 *
 * Two shapes are supported, deliberately:
 *   lingolive://join/728416          — custom scheme, opens the installed app
 *   https://lingolive.app/join/728416 — universal/app link, and the web
 *                                       fallback when the app is not installed
 *
 * A signed `t=` token may replace the visible code so a screenshot of the URL
 * does not hand out room access. Both forms resolve through the same parser.
 */

export interface JoinLink {
  readonly code: string | null;
  readonly joinToken: string | null;
  /** Optional preselected reading language from the QR payload. */
  readonly language: string | null;
}

export interface DeepLinkConfig {
  readonly scheme: string;
  readonly webBaseUrl: string;
}

export const DEFAULT_DEEP_LINK_CONFIG: DeepLinkConfig = {
  scheme: 'lingolive',
  webBaseUrl: 'https://lingolive.app',
};

/**
 * Parses anything a user can arrive with: a scanned QR payload, a tapped
 * universal link, a pasted URL, or a bare 6-digit code typed by hand.
 * Returns `null` when the input is not a LingoLive join target at all.
 */
export function parseJoinLink(
  input: string,
  config: DeepLinkConfig = DEFAULT_DEEP_LINK_CONFIG,
): JoinLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A bare code, typed manually.
  if (/^[0-9\s-]{6,10}$/.test(trimmed)) {
    const code = normalizeAccessCode(trimmed);
    return code.length === 6 ? { code, joinToken: null, language: null } : null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const isCustomScheme = url.protocol === `${config.scheme}:`;
  const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
  if (!isCustomScheme && !isHttp) return null;

  // `lingolive://join/728416` parses with host="join", pathname="/728416".
  const segments = [
    ...(isCustomScheme && url.hostname ? [url.hostname] : []),
    ...url.pathname.split('/').filter(Boolean),
  ];

  const joinIndex = segments.findIndex((segment) => segment.toLowerCase() === 'join');
  if (joinIndex === -1) return null;

  const rawCode = segments[joinIndex + 1] ?? null;
  const joinToken = url.searchParams.get('t');
  const language = url.searchParams.get('lang');

  const code = rawCode ? normalizeAccessCode(rawCode) : '';
  if (code.length !== 6 && !joinToken) return null;

  return {
    code: code.length === 6 ? code : null,
    joinToken,
    language,
  };
}

export function buildJoinUrl(
  options: { code?: string; joinToken?: string; language?: string },
  config: DeepLinkConfig = DEFAULT_DEEP_LINK_CONFIG,
): string {
  const base = config.webBaseUrl.replace(/\/$/, '');
  const path = options.code ? `/join/${options.code}` : '/join';
  const url = new URL(`${base}${path}`);
  if (options.joinToken) url.searchParams.set('t', options.joinToken);
  if (options.language) url.searchParams.set('lang', options.language);
  return url.toString();
}

export function buildJoinDeepLink(
  options: { code?: string; joinToken?: string; language?: string },
  config: DeepLinkConfig = DEFAULT_DEEP_LINK_CONFIG,
): string {
  const path = options.code ? `join/${options.code}` : 'join';
  const params = new URLSearchParams();
  if (options.joinToken) params.set('t', options.joinToken);
  if (options.language) params.set('lang', options.language);
  const query = params.toString();
  return `${config.scheme}://${path}${query ? `?${query}` : ''}`;
}

/**
 * The payload encoded into the organizer's QR code.
 *
 * It is an https URL rather than a custom scheme, so a participant without the
 * app installed lands on the web player instead of a browser error — the
 * "works without installation" requirement.
 */
export function buildQrPayload(
  options: { code?: string; joinToken?: string },
  config: DeepLinkConfig = DEFAULT_DEEP_LINK_CONFIG,
): string {
  return buildJoinUrl(options, config);
}
