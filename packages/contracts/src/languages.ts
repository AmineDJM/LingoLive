import { z } from 'zod';

/**
 * Audio / translation language catalogue.
 *
 * IMPORTANT: this list is deliberately separate from the UI locale list
 * (see `locales.ts`). The set of languages a user can *read a transcript in*
 * is much larger than the set of languages the product interface is
 * translated into.
 *
 * Rules enforced across the product:
 *  - identifiers are BCP-47 tags;
 *  - every language is displayed by its endonym (native name), never a flag —
 *    flags represent countries, not languages;
 *  - `searchTerms` are pre-folded (accent-free, lowercase) so search works
 *    without a heavy ICU dependency on mobile.
 */
export interface LanguageDefinition {
  /** BCP-47 tag, e.g. `pt-BR`. */
  readonly code: string;
  /** Endonym — how speakers write the language's name themselves. */
  readonly nativeName: string;
  /** English name, used for internal tooling and accessibility fallbacks. */
  readonly englishName: string;
  readonly direction: 'ltr' | 'rtl';
  /** Extra accent-folded lowercase tokens used by the language picker search. */
  readonly searchTerms: readonly string[];
}

export const LANGUAGES: readonly LanguageDefinition[] = [
  {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    searchTerms: ['arabic', 'arabe', 'arabisch', 'العربية'],
  },
  {
    code: 'bn',
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    direction: 'ltr',
    searchTerms: ['bengali', 'bangla'],
  },
  {
    code: 'cs',
    nativeName: 'Čeština',
    englishName: 'Czech',
    direction: 'ltr',
    searchTerms: ['czech', 'cestina', 'tcheque'],
  },
  {
    code: 'da',
    nativeName: 'Dansk',
    englishName: 'Danish',
    direction: 'ltr',
    searchTerms: ['danish', 'dansk', 'danois'],
  },
  {
    code: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    direction: 'ltr',
    searchTerms: ['german', 'deutsch', 'allemand', 'aleman'],
  },
  {
    code: 'el',
    nativeName: 'Ελληνικά',
    englishName: 'Greek',
    direction: 'ltr',
    searchTerms: ['greek', 'grec', 'ellinika'],
  },
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    searchTerms: ['english', 'anglais', 'ingles', 'englisch'],
  },
  {
    code: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    direction: 'ltr',
    searchTerms: ['spanish', 'espanol', 'espagnol', 'castellano'],
  },
  {
    code: 'fa',
    nativeName: 'فارسی',
    englishName: 'Persian',
    direction: 'rtl',
    searchTerms: ['persian', 'farsi', 'perse'],
  },
  {
    code: 'fi',
    nativeName: 'Suomi',
    englishName: 'Finnish',
    direction: 'ltr',
    searchTerms: ['finnish', 'suomi', 'finnois'],
  },
  {
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    direction: 'ltr',
    searchTerms: ['french', 'francais', 'frances', 'franzosisch'],
  },
  {
    code: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    direction: 'rtl',
    searchTerms: ['hebrew', 'hebreu', 'ivrit'],
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    direction: 'ltr',
    searchTerms: ['hindi', 'hindawi'],
  },
  {
    code: 'hu',
    nativeName: 'Magyar',
    englishName: 'Hungarian',
    direction: 'ltr',
    searchTerms: ['hungarian', 'magyar', 'hongrois'],
  },
  {
    code: 'id',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    direction: 'ltr',
    searchTerms: ['indonesian', 'indonesien', 'bahasa'],
  },
  {
    code: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    direction: 'ltr',
    searchTerms: ['italian', 'italiano', 'italien'],
  },
  {
    code: 'ja',
    nativeName: '日本語',
    englishName: 'Japanese',
    direction: 'ltr',
    searchTerms: ['japanese', 'japonais', 'nihongo'],
  },
  {
    code: 'ko',
    nativeName: '한국어',
    englishName: 'Korean',
    direction: 'ltr',
    searchTerms: ['korean', 'coreen', 'hangugeo'],
  },
  {
    code: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    direction: 'ltr',
    searchTerms: ['dutch', 'nederlands', 'neerlandais'],
  },
  {
    code: 'no',
    nativeName: 'Norsk',
    englishName: 'Norwegian',
    direction: 'ltr',
    searchTerms: ['norwegian', 'norsk', 'norvegien'],
  },
  {
    code: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    direction: 'ltr',
    searchTerms: ['polish', 'polski', 'polonais'],
  },
  {
    code: 'pt-BR',
    nativeName: 'Português (Brasil)',
    englishName: 'Portuguese (Brazil)',
    direction: 'ltr',
    searchTerms: ['portuguese', 'portugues', 'portugais', 'brasil', 'brazil'],
  },
  {
    code: 'pt-PT',
    nativeName: 'Português (Portugal)',
    englishName: 'Portuguese (Portugal)',
    direction: 'ltr',
    searchTerms: ['portuguese', 'portugues', 'portugais', 'portugal'],
  },
  {
    code: 'ro',
    nativeName: 'Română',
    englishName: 'Romanian',
    direction: 'ltr',
    searchTerms: ['romanian', 'romana', 'roumain'],
  },
  {
    code: 'ru',
    nativeName: 'Русский',
    englishName: 'Russian',
    direction: 'ltr',
    searchTerms: ['russian', 'russkiy', 'russe'],
  },
  {
    code: 'sv',
    nativeName: 'Svenska',
    englishName: 'Swedish',
    direction: 'ltr',
    searchTerms: ['swedish', 'svenska', 'suedois'],
  },
  {
    code: 'sw',
    nativeName: 'Kiswahili',
    englishName: 'Swahili',
    direction: 'ltr',
    searchTerms: ['swahili', 'kiswahili'],
  },
  {
    code: 'th',
    nativeName: 'ไทย',
    englishName: 'Thai',
    direction: 'ltr',
    searchTerms: ['thai', 'thailandais'],
  },
  {
    code: 'tr',
    nativeName: 'Türkçe',
    englishName: 'Turkish',
    direction: 'ltr',
    searchTerms: ['turkish', 'turkce', 'turc'],
  },
  {
    code: 'uk',
    nativeName: 'Українська',
    englishName: 'Ukrainian',
    direction: 'ltr',
    searchTerms: ['ukrainian', 'ukrainska', 'ukrainien'],
  },
  {
    code: 'ur',
    nativeName: 'اردو',
    englishName: 'Urdu',
    direction: 'rtl',
    searchTerms: ['urdu', 'ourdou'],
  },
  {
    code: 'vi',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
    direction: 'ltr',
    searchTerms: ['vietnamese', 'tieng viet', 'vietnamien'],
  },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    direction: 'ltr',
    searchTerms: ['chinese', 'chinois', 'mandarin', 'simplified', 'zhongwen'],
  },
  {
    code: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Chinese (Traditional)',
    direction: 'ltr',
    searchTerms: ['chinese', 'chinois', 'traditional', 'zhongwen'],
  },
] as const;

export const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((l) => l.code);

const LANGUAGE_BY_CODE = new Map<string, LanguageDefinition>(
  LANGUAGES.map((l) => [l.code.toLowerCase(), l]),
);

/** Sentinel meaning "show me the speaker's own words, untranslated". */
export const ORIGINAL_LANGUAGE = 'original' as const;

/** Sentinel meaning "let the model detect what is being spoken". */
export const AUTO_DETECT_LANGUAGE = 'auto' as const;

/**
 * A *reading* language: a real language, or the "keep the original" sentinel.
 * Used by transcript views, discussion tiles and Business viewers.
 */
export const readingLanguageSchema = z
  .string()
  .min(2)
  .max(20)
  .refine((v) => v === ORIGINAL_LANGUAGE || LANGUAGE_BY_CODE.has(v.toLowerCase()), {
    message: 'Unsupported reading language',
  });

/** A concrete translation target. `original` is not a valid target. */
export const languageCodeSchema = z
  .string()
  .min(2)
  .max(20)
  .refine((v) => LANGUAGE_BY_CODE.has(v.toLowerCase()), { message: 'Unsupported language' });

/** A spoken-language hint: a real language, or `auto`. */
export const spokenLanguageSchema = z
  .string()
  .min(2)
  .max(20)
  .refine((v) => v === AUTO_DETECT_LANGUAGE || LANGUAGE_BY_CODE.has(v.toLowerCase()), {
    message: 'Unsupported spoken language',
  });

export function findLanguage(code: string | null | undefined): LanguageDefinition | undefined {
  if (!code) return undefined;
  return LANGUAGE_BY_CODE.get(code.toLowerCase());
}

export function isRtlLanguage(code: string | null | undefined): boolean {
  return findLanguage(code)?.direction === 'rtl';
}

/** Lowercase + strip diacritics so "espanol" matches "Español". */
export function foldSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function searchLanguages(query: string, limit = 50): LanguageDefinition[] {
  const folded = foldSearchText(query);
  if (!folded) return LANGUAGES.slice(0, limit);
  const matches = LANGUAGES.filter((language) => {
    if (foldSearchText(language.code).startsWith(folded)) return true;
    if (foldSearchText(language.nativeName).includes(folded)) return true;
    if (foldSearchText(language.englishName).includes(folded)) return true;
    return language.searchTerms.some((term) => foldSearchText(term).includes(folded));
  });
  return matches.slice(0, limit);
}

/**
 * Collapse a target-language list to the minimum set of translations actually
 * required. This is the single most important cost control in the product:
 * four people sharing two reading languages must cost two translations, not
 * four.
 *
 * - de-duplicates case-insensitively while keeping the first spelling seen;
 * - drops the `original` sentinel;
 * - drops the source language (translating fr → fr is waste).
 */
export function dedupeTargetLanguages(
  targets: readonly string[],
  sourceLanguage?: string | null,
): string[] {
  const seen = new Set<string>();
  const source = sourceLanguage ? normalizeLanguageTag(sourceLanguage) : null;
  const result: string[] = [];
  for (const raw of targets) {
    if (!raw || raw === ORIGINAL_LANGUAGE || raw === AUTO_DETECT_LANGUAGE) continue;
    const normalized = normalizeLanguageTag(raw);
    if (!normalized) continue;
    if (source && languagesAreEquivalent(normalized, source)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** Canonical spelling from the catalogue, or the trimmed input if unknown. */
export function normalizeLanguageTag(code: string): string {
  const found = LANGUAGE_BY_CODE.get(code.toLowerCase().trim());
  return found ? found.code : code.trim();
}

/**
 * `pt-BR` and `pt-PT` are different reading languages but the same base
 * language: never skip a translation between them, but do skip `fr` → `fr-FR`.
 */
export function languagesAreEquivalent(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const baseA = a.split('-')[0]?.toLowerCase();
  const baseB = b.split('-')[0]?.toLowerCase();
  if (!baseA || !baseB || baseA !== baseB) return false;
  // Same base language: equivalent only when at least one side is unqualified.
  return !a.includes('-') || !b.includes('-');
}
