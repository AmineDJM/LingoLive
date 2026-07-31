import type { UiLocale } from '@lingolive/contracts';

/**
 * Marketing content model.
 *
 * Every public page is data, not markup: one structured record per page, with
 * a complete translation for each of the seven published locales. That is what
 * makes it possible to guarantee — and test — that no locale ships a page with
 * missing copy, an English fallback in the middle of a French page, or a
 * duplicated title across two URLs.
 */

export interface PageSection {
  readonly heading: string;
  readonly body: string;
}

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

export interface PageCopy {
  /** `<title>` — unique per page and per locale. */
  readonly title: string;
  /** `<meta name="description">` — unique per page and per locale. */
  readonly description: string;
  readonly h1: string;
  readonly intro: string;
  readonly sections: readonly PageSection[];
  /**
   * Present only where the page genuinely shows a FAQ. FAQPage structured
   * data is emitted if and only if this exists, so the markup always matches
   * what a visitor can actually see.
   */
  readonly faq?: readonly FaqEntry[];
  readonly ctaLabel: string;
}

export type PageKind = 'home' | 'use-case' | 'informational' | 'legal' | 'guide-index';

export interface MarketingPage {
  /** URL suffix after the locale segment. Empty string is the locale home. */
  readonly path: string;
  readonly kind: PageKind;
  /** Where the primary call to action goes. */
  readonly ctaPath: string;
  readonly copy: Readonly<Record<UiLocale, PageCopy>>;
}

export interface Guide {
  readonly slug: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly copy: Readonly<Record<UiLocale, PageCopy>>;
}
