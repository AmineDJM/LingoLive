import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ApiClient } from '@lingolive/api-client';

/**
 * Device identity and API access.
 *
 * The anonymous identifier is 128 bits from the platform CSPRNG, stored in the
 * Keychain / Keystore — never an advertising identifier, and never readable by
 * another app. It is what makes the guest experience possible without asking
 * anyone to create an account.
 */

const ANONYMOUS_KEY = 'lingolive.anonymousId';
const TOKEN_KEY = 'lingolive.accessToken';
const TOKEN_EXPIRY_KEY = 'lingolive.accessTokenExpiry';

export const apiBaseUrl: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:4000';

export const webBaseUrl: string =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_WEB_URL ??
  'https://lingolive.app';

export const deepLinkScheme: string =
  (Constants.expoConfig?.extra?.deepLinkScheme as string | undefined) ?? 'lingolive';

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function getAnonymousId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ANONYMOUS_KEY);
  if (existing && existing.length >= 16) return existing;
  const generated = `anon_${randomHex(16)}`;
  await SecureStore.setItemAsync(ANONYMOUS_KEY, generated, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return generated;
}

let pending: Promise<string> | null = null;

export async function ensureToken(): Promise<string> {
  const [token, expiry] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(TOKEN_EXPIRY_KEY),
  ]);
  // Refresh a minute early so no request starts with a token that expires
  // while it is in flight.
  if (token && Number(expiry ?? 0) > Date.now() + 60_000) return token;

  pending ??= (async () => {
    const client = new ApiClient({ baseUrl: apiBaseUrl });
    const response = await client.registerDevice({
      anonymousId: await getAnonymousId(),
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
      appVersion: Constants.expoConfig?.version ?? '1.0.0',
      locale: Localization.getLocales()[0]?.languageTag ?? 'en',
    });
    await SecureStore.setItemAsync(TOKEN_KEY, response.accessToken);
    await SecureStore.setItemAsync(
      TOKEN_EXPIRY_KEY,
      String(new Date(response.expiresAt).getTime()),
    );
    pending = null;
    return response.accessToken;
  })();

  try {
    return await pending;
  } catch (error) {
    pending = null;
    throw error;
  }
}

export function createApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: apiBaseUrl,
    getToken: () => ensureToken(),
    onUnauthorized: () => {
      void SecureStore.deleteItemAsync(TOKEN_KEY);
      void SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
    },
  });
}

export function realtimeUrl(): string {
  return `${apiBaseUrl.replace(/^http/, 'ws')}/realtime`;
}

/** Clears every credential this app holds. Used by account deletion. */
export async function clearIdentity(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY),
    SecureStore.deleteItemAsync(ANONYMOUS_KEY),
  ]);
}
