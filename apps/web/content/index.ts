import { UI_LOCALES, type UiLocale } from '@lingolive/contracts';
import { MARKETING_PAGES } from './pages';
import { USE_CASE_PAGES } from './pages-use-cases';
import { INFORMATIONAL_PAGES } from './pages-informational';
import { LEGAL_PAGES } from './pages-legal';
import { GUIDES, GUIDES_INDEX } from './guides';
import type { Guide, MarketingPage, PageCopy } from './types';

export type { Guide, MarketingPage, PageCopy, PageSection, FaqEntry } from './types';
export { GUIDES, GUIDES_INDEX } from './guides';

/** Every indexable public page, in the order they appear in navigation. */
export const ALL_PAGES: readonly MarketingPage[] = [
  ...MARKETING_PAGES,
  ...USE_CASE_PAGES,
  ...INFORMATIONAL_PAGES,
  ...LEGAL_PAGES,
  GUIDES_INDEX,
  // Individual guides are pages too: they need titles, hreflang and sitemap
  // entries exactly like the rest.
  ...GUIDES.map((g) => ({
    path: `guides/${g.slug}`,
    kind: 'informational' as const,
    ctaPath: 'listen',
    copy: g.copy,
  })),
];

const BY_PATH = new Map<string, MarketingPage>(ALL_PAGES.map((page) => [page.path, page]));

export function getPage(path: string): MarketingPage | undefined {
  return BY_PATH.get(path);
}

export function getPageCopy(path: string, locale: UiLocale): PageCopy | undefined {
  return BY_PATH.get(path)?.copy[locale];
}

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/** Paths for `generateStaticParams` and the sitemap. */
export function allPagePaths(): string[] {
  return ALL_PAGES.map((page) => page.path);
}

/** Navigation groupings used by the footer. */
export const FOOTER_NAV = {
  product: [
    'live-transcription',
    'live-translation',
    'conversation-translator',
    'how-it-works',
    'pricing',
  ],
  useCases: [
    'conference-captions',
    'meeting-transcription',
    'travel-translation',
    'accessibility/live-captions',
  ],
  company: ['guides', 'help', 'security'],
  legal: ['privacy', 'terms'],
} as const;

/**
 * Completeness check used by the test suite and by a CI guard.
 *
 * A locale missing a title, or two pages sharing one, is an SEO defect that is
 * invisible until traffic drops — so it fails the build instead.
 */
export function findContentProblems(): string[] {
  const problems: string[] = [];
  const seenTitles = new Map<string, string>();
  const seenDescriptions = new Map<string, string>();

  for (const page of ALL_PAGES) {
    for (const locale of UI_LOCALES) {
      const copy = page.copy[locale];
      if (!copy) {
        problems.push(`${page.path || '(home)'}: missing ${locale}`);
        continue;
      }
      for (const [field, value] of Object.entries({
        title: copy.title,
        description: copy.description,
        h1: copy.h1,
        intro: copy.intro,
        ctaLabel: copy.ctaLabel,
      })) {
        if (!value || value.trim().length === 0) {
          problems.push(`${page.path || '(home)'} [${locale}]: empty ${field}`);
        }
      }
      if (copy.sections.length === 0) {
        problems.push(`${page.path || '(home)'} [${locale}]: no sections`);
      }

      const titleKey = `${locale}:${copy.title}`;
      const existingTitle = seenTitles.get(titleKey);
      if (existingTitle) {
        problems.push(
          `duplicate title in ${locale}: "${copy.title}" on ${existingTitle} and ${page.path || '(home)'}`,
        );
      } else {
        seenTitles.set(titleKey, page.path || '(home)');
      }

      const descriptionKey = `${locale}:${copy.description}`;
      const existingDescription = seenDescriptions.get(descriptionKey);
      if (existingDescription) {
        problems.push(
          `duplicate description in ${locale} on ${existingDescription} and ${page.path || '(home)'}`,
        );
      } else {
        seenDescriptions.set(descriptionKey, page.path || '(home)');
      }
    }
  }

  return problems;
}
