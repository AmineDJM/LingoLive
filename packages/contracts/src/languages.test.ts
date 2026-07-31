import { describe, expect, it } from 'vitest';
import {
  dedupeTargetLanguages,
  findLanguage,
  foldSearchText,
  isRtlLanguage,
  LANGUAGES,
  languageCodeSchema,
  languagesAreEquivalent,
  normalizeLanguageTag,
  readingLanguageSchema,
  searchLanguages,
} from './languages.js';

describe('language catalogue', () => {
  it('has unique codes', () => {
    const codes = LANGUAGES.map((l) => l.code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('never uses a flag emoji as a language marker', () => {
    // Regional indicator symbols U+1F1E6–U+1F1FF form flag emoji.
    const flagPattern = /[\u{1F1E6}-\u{1F1FF}]/u;
    for (const language of LANGUAGES) {
      expect(flagPattern.test(language.nativeName)).toBe(false);
      expect(flagPattern.test(language.englishName)).toBe(false);
    }
  });

  it('marks Arabic, Hebrew, Persian and Urdu as RTL', () => {
    for (const code of ['ar', 'he', 'fa', 'ur']) {
      expect(isRtlLanguage(code)).toBe(true);
    }
    for (const code of ['fr', 'en', 'ja', 'pt-BR']) {
      expect(isRtlLanguage(code)).toBe(false);
    }
  });

  it('resolves codes case-insensitively', () => {
    expect(findLanguage('PT-br')?.code).toBe('pt-BR');
    expect(normalizeLanguageTag('ZH-hans')).toBe('zh-Hans');
    expect(findLanguage('klingon')).toBeUndefined();
  });
});

describe('accent-insensitive search', () => {
  it('folds diacritics', () => {
    expect(foldSearchText('Español')).toBe('espanol');
    expect(foldSearchText('  FRANÇAIS ')).toBe('francais');
  });

  it('finds Español when typing espanol', () => {
    expect(searchLanguages('espanol').map((l) => l.code)).toContain('es');
  });

  it('finds languages by their native name', () => {
    expect(searchLanguages('العربية').map((l) => l.code)).toContain('ar');
    expect(searchLanguages('日本語').map((l) => l.code)).toContain('ja');
  });

  it('finds languages by an alternative name in another UI language', () => {
    expect(searchLanguages('allemand').map((l) => l.code)).toContain('de');
    expect(searchLanguages('anglais').map((l) => l.code)).toContain('en');
  });

  it('returns the full catalogue for an empty query', () => {
    expect(searchLanguages('').length).toBe(Math.min(50, LANGUAGES.length));
  });
});

describe('dedupeTargetLanguages — the core cost control', () => {
  it('translates once when several people read the same language', () => {
    expect(dedupeTargetLanguages(['fr', 'en', 'fr', 'EN'], 'pt-BR')).toEqual(['fr', 'en']);
  });

  it('never translates into the source language', () => {
    expect(dedupeTargetLanguages(['fr', 'en'], 'fr')).toEqual(['en']);
  });

  it('drops the original and auto sentinels', () => {
    expect(dedupeTargetLanguages(['original', 'auto', 'de'], 'en')).toEqual(['de']);
  });

  it('keeps pt-BR and pt-PT apart — they are different reading languages', () => {
    expect(dedupeTargetLanguages(['pt-BR', 'pt-PT'], 'en')).toEqual(['pt-BR', 'pt-PT']);
    expect(languagesAreEquivalent('pt-BR', 'pt-PT')).toBe(false);
  });

  it('treats an unqualified tag as equivalent to its qualified form', () => {
    expect(languagesAreEquivalent('pt', 'pt-BR')).toBe(true);
    expect(languagesAreEquivalent('fr', 'fr')).toBe(true);
  });

  it('normalises spelling so the cache key is stable', () => {
    expect(dedupeTargetLanguages(['PT-br', 'pt-BR'], 'en')).toEqual(['pt-BR']);
  });

  it('returns an empty list when there is nothing to translate', () => {
    expect(dedupeTargetLanguages([], 'en')).toEqual([]);
    expect(dedupeTargetLanguages(['en'], 'en')).toEqual([]);
  });
});

describe('language schemas', () => {
  it('accepts the original sentinel as a reading language only', () => {
    expect(readingLanguageSchema.safeParse('original').success).toBe(true);
    expect(languageCodeSchema.safeParse('original').success).toBe(false);
  });

  it('rejects unknown languages', () => {
    expect(readingLanguageSchema.safeParse('xx-YY').success).toBe(false);
  });
});
