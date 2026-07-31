import { z } from 'zod';

/**
 * UI locales — the languages the LingoLive *interface* is fully translated
 * into. Deliberately a much smaller list than the audio/translation catalogue.
 * Adding one here means adding a complete dictionary in `@lingolive/i18n`.
 */
export const UI_LOCALES = ['fr', 'en', 'ar', 'es', 'pt-BR', 'it', 'de'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = 'en';

export const localeSchema = z.enum(UI_LOCALES);

export interface UiLocaleDefinition {
  readonly locale: UiLocale;
  readonly nativeName: string;
  readonly englishName: string;
  readonly direction: 'ltr' | 'rtl';
  /** URL segment. Lowercase because URLs are case-sensitive in practice. */
  readonly urlSegment: string;
  /** BCP-47 value for the `<html lang>` attribute and `hreflang`. */
  readonly htmlLang: string;
  /** Default reading language proposed to a user arriving on this locale. */
  readonly defaultReadingLanguage: string;
}

export const UI_LOCALE_DEFINITIONS: readonly UiLocaleDefinition[] = [
  { locale: 'fr', nativeName: 'Français', englishName: 'French', direction: 'ltr', urlSegment: 'fr', htmlLang: 'fr', defaultReadingLanguage: 'fr' },
  { locale: 'en', nativeName: 'English', englishName: 'English', direction: 'ltr', urlSegment: 'en', htmlLang: 'en', defaultReadingLanguage: 'en' },
  { locale: 'ar', nativeName: 'العربية', englishName: 'Arabic', direction: 'rtl', urlSegment: 'ar', htmlLang: 'ar', defaultReadingLanguage: 'ar' },
  { locale: 'es', nativeName: 'Español', englishName: 'Spanish', direction: 'ltr', urlSegment: 'es', htmlLang: 'es', defaultReadingLanguage: 'es' },
  { locale: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', direction: 'ltr', urlSegment: 'pt-br', htmlLang: 'pt-BR', defaultReadingLanguage: 'pt-BR' },
  { locale: 'it', nativeName: 'Italiano', englishName: 'Italian', direction: 'ltr', urlSegment: 'it', htmlLang: 'it', defaultReadingLanguage: 'it' },
  { locale: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr', urlSegment: 'de', htmlLang: 'de', defaultReadingLanguage: 'de' },
] as const;

const BY_LOCALE = new Map<string, UiLocaleDefinition>(
  UI_LOCALE_DEFINITIONS.map((d) => [d.locale.toLowerCase(), d]),
);
const BY_SEGMENT = new Map<string, UiLocaleDefinition>(
  UI_LOCALE_DEFINITIONS.map((d) => [d.urlSegment, d]),
);

export const LOCALE_URL_SEGMENTS: readonly string[] = UI_LOCALE_DEFINITIONS.map(
  (d) => d.urlSegment,
);

export function getLocaleDefinition(locale: string): UiLocaleDefinition | undefined {
  return BY_LOCALE.get(locale.toLowerCase());
}

export function localeFromUrlSegment(segment: string): UiLocaleDefinition | undefined {
  return BY_SEGMENT.get(segment.toLowerCase());
}

export function isRtlLocale(locale: string): boolean {
  return getLocaleDefinition(locale)?.direction === 'rtl';
}

export function localeDirection(locale: string): 'ltr' | 'rtl' {
  return getLocaleDefinition(locale)?.direction ?? 'ltr';
}

/**
 * Best-effort locale negotiation used by the device, the web middleware and
 * the API. Accepts anything (`fr-CA`, `pt`, `PT-br`, an Accept-Language
 * header) and always resolves to a supported locale.
 */
export function resolveLocale(
  candidate: string | null | undefined,
  fallback: UiLocale = DEFAULT_LOCALE,
): UiLocale {
  if (!candidate) return fallback;
  const tags = candidate
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);

  for (const tag of tags) {
    const exact = BY_LOCALE.get(tag.toLowerCase());
    if (exact) return exact.locale;
  }
  for (const tag of tags) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (!base) continue;
    // `pt` alone resolves to pt-BR because that is the dictionary we ship.
    const match = UI_LOCALE_DEFINITIONS.find((d) => d.locale.toLowerCase().split('-')[0] === base);
    if (match) return match.locale;
  }
  return fallback;
}
