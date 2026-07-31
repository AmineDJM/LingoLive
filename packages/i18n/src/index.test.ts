import { describe, expect, it } from 'vitest';
import { UI_LOCALES, type UiLocale } from '@lingolive/contracts';
import {
  allMessageKeys,
  createTranslator,
  dictionaries,
  findMissingKeys,
  interpolate,
} from './index.js';

describe('dictionary completeness', () => {
  it('ships a dictionary for every declared UI locale', () => {
    for (const locale of UI_LOCALES) {
      expect(dictionaries[locale], `missing dictionary for ${locale}`).toBeDefined();
    }
    expect(Object.keys(dictionaries).sort()).toEqual([...UI_LOCALES].sort());
  });

  for (const locale of UI_LOCALES) {
    it(`${locale} has no missing or empty keys`, () => {
      expect(findMissingKeys(locale as UiLocale)).toEqual([]);
    });
  }

  it('has no locale with extra keys English does not define', () => {
    const canonical = new Set(allMessageKeys());
    for (const locale of UI_LOCALES) {
      const dict = dictionaries[locale] as unknown as Record<string, Record<string, string>>;
      for (const [section, entries] of Object.entries(dict)) {
        for (const key of Object.keys(entries)) {
          expect(canonical.has(`${section}.${key}`), `${locale}: extra key ${section}.${key}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('preserves every interpolation placeholder in every translation', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const englishDict = dictionaries.en as unknown as Record<string, Record<string, string>>;

    for (const locale of UI_LOCALES) {
      const dict = dictionaries[locale] as unknown as Record<string, Record<string, string>>;
      for (const [section, entries] of Object.entries(englishDict)) {
        for (const [key, englishValue] of Object.entries(entries)) {
          const translated = dict[section]?.[key];
          expect(translated, `${locale}: ${section}.${key}`).toBeDefined();
          expect(
            placeholders(translated as string),
            `${locale}: ${section}.${key} placeholder mismatch`,
          ).toEqual(placeholders(englishValue));
        }
      }
    }
  });
});

describe('translator', () => {
  it('translates and interpolates', () => {
    const t = createTranslator('fr');
    expect(t.t('home.listenTitle')).toBe('Écouter');
    expect(t.t('listen.endedDuration', { duration: '18 min' })).toBe('Durée : 18 min');
  });

  it('reports RTL for Arabic and LTR otherwise', () => {
    expect(createTranslator('ar').direction).toBe('rtl');
    expect(createTranslator('fr').direction).toBe('ltr');
    expect(createTranslator('pt-BR').direction).toBe('ltr');
  });

  it('negotiates an unknown or regional locale', () => {
    expect(createTranslator('fr-CA').locale).toBe('fr');
    expect(createTranslator('pt').locale).toBe('pt-BR');
    expect(createTranslator('kl-GL').locale).toBe('en');
    expect(createTranslator('de-CH,de;q=0.9,en;q=0.8').locale).toBe('de');
  });

  it('formats durations in the active locale', () => {
    expect(createTranslator('fr').formatDuration(1122)).toBe('18 min 42 s');
    expect(createTranslator('en').formatDuration(45)).toBe('45 s');
    expect(createTranslator('de').formatDuration(1122)).toBe('18 Min. 42 Sek.');
  });

  it('formats a live clock', () => {
    const t = createTranslator('en');
    expect(t.formatClock(0)).toBe('00:00');
    expect(t.formatClock(522)).toBe('08:42');
    expect(t.formatClock(3723)).toBe('1:02:03');
  });
});

describe('interpolation', () => {
  it('leaves unknown placeholders untouched rather than printing undefined', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
    expect(interpolate('Hello {name}', { name: 'Amine' })).toBe('Hello Amine');
    expect(interpolate('{a} and {b}', { a: 1, b: 2 })).toBe('1 and 2');
  });
});

describe('no hard-coded UI strings leak into the catalogue', () => {
  it('never contains a flag emoji', () => {
    const flagPattern = /[\u{1F1E6}-\u{1F1FF}]/u;
    for (const locale of UI_LOCALES) {
      const dict = dictionaries[locale] as unknown as Record<string, Record<string, string>>;
      for (const entries of Object.values(dict)) {
        for (const [key, value] of Object.entries(entries)) {
          expect(flagPattern.test(value), `${locale}.${key} contains a flag emoji`).toBe(false);
        }
      }
    }
  });
});
