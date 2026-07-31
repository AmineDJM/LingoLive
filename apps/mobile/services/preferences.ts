import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import { resolveLocale, type UiLocale } from '@lingolive/contracts';
import { clampTranscriptScale } from '@lingolive/design-tokens';

/**
 * On-device preferences.
 *
 * Kept on the device, not on the server, so they work before a user has any
 * account and survive without network access.
 */

export interface Preferences {
  locale: UiLocale;
  readingLanguage: string;
  theme: 'system' | 'light' | 'dark';
  transcriptScale: number;
  hapticsEnabled: boolean;
  onboardingCompleted: boolean;
  recentLanguages: string[];
}

const KEY = 'lingolive.preferences';

export function deviceLocale(): UiLocale {
  return resolveLocale(Localization.getLocales()[0]?.languageTag ?? null);
}

export function defaultPreferences(): Preferences {
  const locale = deviceLocale();
  return {
    locale,
    readingLanguage: locale,
    theme: 'system',
    transcriptScale: 1,
    hapticsEnabled: true,
    onboardingCompleted: false,
    recentLanguages: [],
  };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return defaultPreferences();
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const base = defaultPreferences();
    return {
      ...base,
      ...parsed,
      // Never trust a stored value blindly: a corrupted preference must not
      // render the transcript unreadable.
      transcriptScale: clampTranscriptScale(parsed.transcriptScale ?? base.transcriptScale),
      recentLanguages: Array.isArray(parsed.recentLanguages)
        ? parsed.recentLanguages.slice(0, 8)
        : [],
    };
  } catch {
    return defaultPreferences();
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(preferences));
  } catch {
    // Storage failure must never break the app; the preference simply does
    // not survive the next launch.
  }
}

export function rememberLanguage(preferences: Preferences, language: string): Preferences {
  const recentLanguages = [language, ...preferences.recentLanguages.filter((l) => l !== language)];
  return { ...preferences, recentLanguages: recentLanguages.slice(0, 8) };
}
