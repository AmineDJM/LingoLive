'use client';

import { ApiClient } from '@lingolive/api-client';
import { apiUrl } from './site';

/**
 * Browser-side API access.
 *
 * A guest identity is created silently on first use and kept in
 * `localStorage`, so the product works immediately with no sign-up screen —
 * which is the whole point of the guest mode.
 */

const ANONYMOUS_KEY = 'lingolive.anonymousId';
const TOKEN_KEY = 'lingolive.accessToken';
const TOKEN_EXPIRY_KEY = 'lingolive.accessTokenExpiry';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode or blocked storage: the app still works, it just cannot
    // remember the guest between reloads.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Non-fatal. */
  }
}

export function getAnonymousId(): string {
  const existing = readStorage(ANONYMOUS_KEY);
  if (existing && existing.length >= 16) return existing;

  // 128 bits from the platform CSPRNG. Never an advertising identifier.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const generated = `anon_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  writeStorage(ANONYMOUS_KEY, generated);
  return generated;
}

let inFlight: Promise<string> | null = null;

/** Returns a valid access token, registering a guest if necessary. */
export async function ensureToken(): Promise<string> {
  const token = readStorage(TOKEN_KEY);
  const expiry = Number(readStorage(TOKEN_EXPIRY_KEY) ?? 0);
  // Refresh a minute early so a request cannot start with a token that
  // expires mid-flight.
  if (token && expiry > Date.now() + 60_000) return token;

  inFlight ??= (async () => {
    const client = new ApiClient({ baseUrl: apiUrl });
    const response = await client.registerDevice({
      anonymousId: getAnonymousId(),
      platform: 'web',
      appVersion: '1.0.0',
      locale: navigator.language,
    });
    writeStorage(TOKEN_KEY, response.accessToken);
    writeStorage(TOKEN_EXPIRY_KEY, String(new Date(response.expiresAt).getTime()));
    inFlight = null;
    return response.accessToken;
  })();

  try {
    return await inFlight;
  } catch (error) {
    inFlight = null;
    throw error;
  }
}

export function createApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: apiUrl,
    getToken: () => ensureToken(),
    onUnauthorized: () => {
      try {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
      } catch {
        /* Non-fatal. */
      }
    },
  });
}

export function realtimeUrl(): string {
  return `${apiUrl.replace(/^http/, 'ws')}/realtime`;
}

/**
 * A single, honest capability check.
 *
 * Browsers refuse microphone access on an insecure origin, and some
 * environments have no `getUserMedia` at all. Telling the user which of those
 * it is turns a dead end into an actionable message.
 */
export type MicrophoneAvailability =
  { available: true } | { available: false; reason: 'insecure-context' | 'unsupported' };

export function checkMicrophoneAvailability(): MicrophoneAvailability {
  if (typeof window === 'undefined') return { available: false, reason: 'unsupported' };
  if (!window.isSecureContext) return { available: false, reason: 'insecure-context' };
  if (!navigator.mediaDevices?.getUserMedia) return { available: false, reason: 'unsupported' };
  return { available: true };
}

export function readTranscriptScale(): number {
  const stored = Number(readStorage('lingolive.transcriptScale') ?? '1');
  return Number.isFinite(stored) && stored > 0 ? stored : 1;
}

export function writeTranscriptScale(scale: number): void {
  writeStorage('lingolive.transcriptScale', String(scale));
  document.documentElement.style.setProperty('--ll-transcript-scale', String(scale));
}
