import { describe, expect, it } from 'vitest';
import { UI_LOCALES } from '@lingolive/contracts';
import { ALL_PAGES, findContentProblems, GUIDES } from './index';
import { shouldAllowIndexing } from '../lib/site';

/**
 * The marketing corpus is data, so it can be checked like data. These tests
 * are what make "every page exists in seven languages, with a unique title"
 * a fact rather than an intention.
 */

describe('marketing content', () => {
  it('is complete and free of duplicate titles or descriptions', () => {
    expect(findContentProblems()).toEqual([]);
  });

  it('covers every page listed in the specification', () => {
    const paths = new Set(ALL_PAGES.map((page) => page.path));
    for (const required of [
      '',
      'live-transcription',
      'live-translation',
      'conversation-translator',
      'conference-captions',
      'meeting-transcription',
      'travel-translation',
      'accessibility/live-captions',
      'how-it-works',
      'pricing',
      'security',
      'privacy',
      'terms',
      'help',
      'guides',
    ]) {
      expect(paths.has(required), `missing page: /${required}`).toBe(true);
    }
  });

  it('publishes every page in all seven locales', () => {
    for (const page of ALL_PAGES) {
      expect(Object.keys(page.copy).sort()).toEqual([...UI_LOCALES].sort());
    }
  });

  it('keeps titles and descriptions within a usable length for search results', () => {
    for (const page of ALL_PAGES) {
      for (const locale of UI_LOCALES) {
        const copy = page.copy[locale];
        expect(copy.title.length, `${page.path} [${locale}] title too long`).toBeLessThanOrEqual(
          70,
        );
        expect(
          copy.description.length,
          `${page.path} [${locale}] description too long`,
        ).toBeLessThanOrEqual(200);
        expect(copy.description.length).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('emits FAQ data only where a FAQ exists', () => {
    const withFaq = ALL_PAGES.filter((page) => page.copy.en.faq);
    expect(withFaq.length).toBeGreaterThan(0);
    for (const page of withFaq) {
      for (const locale of UI_LOCALES) {
        expect(page.copy[locale].faq?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('never claims to replace a human interpreter', () => {
    // The promise on every page must stay assistive. A page claiming
    // certified interpretation would be a legal problem, not a copy problem.
    const forbidden =
      /\b(certified interpreter|professional interpretation guaranteed|100% accurate)\b/i;
    for (const page of ALL_PAGES) {
      for (const locale of UI_LOCALES) {
        const copy = page.copy[locale];
        const text = [
          copy.title,
          copy.description,
          copy.h1,
          copy.intro,
          ...copy.sections.map((s) => s.body),
        ].join(' ');
        expect(forbidden.test(text), `${page.path} [${locale}]`).toBe(false);
      }
    }
  });

  it('ships guides with publication dates for Article structured data', () => {
    for (const guide of GUIDES) {
      expect(guide.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(guide.copy).sort()).toEqual([...UI_LOCALES].sort());
    }
  });
});

describe('indexing policy', () => {
  it('indexes production and nothing else by default', () => {
    expect(shouldAllowIndexing(undefined, 'production')).toBe(true);
    expect(shouldAllowIndexing(undefined, 'staging')).toBe(false);
    expect(shouldAllowIndexing(undefined, 'development')).toBe(false);
    // A brand-new environment name is private until someone says otherwise.
    expect(shouldAllowIndexing(undefined, 'preview-42')).toBe(false);
  });

  it('lets the explicit flag win in both directions', () => {
    expect(shouldAllowIndexing('true', 'development')).toBe(true);
    expect(shouldAllowIndexing('false', 'production')).toBe(false);
  });
});
