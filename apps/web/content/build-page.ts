import type { UiLocale } from '@lingolive/contracts';
import type { FaqEntry, MarketingPage, PageCopy, PageKind } from './types';

/**
 * Compact authoring format for the marketing corpus.
 *
 * A page is the same nine fields in seven languages. Writing them as a
 * positional tuple keeps the seven translations of a given sentence adjacent
 * and reviewable, instead of separated by dozens of lines of key names.
 *
 * Order: title, description, h1, intro, heading 1, body 1, heading 2, body 2,
 * CTA label.
 */
export type CopyRow = readonly [
  title: string,
  description: string,
  h1: string,
  intro: string,
  heading1: string,
  body1: string,
  heading2: string,
  body2: string,
  cta: string,
];

export type LocalisedRows = Readonly<Record<UiLocale, CopyRow>>;

/** Optional third section, when a page needs one. */
export type ExtraSection = Readonly<Record<UiLocale, readonly [heading: string, body: string]>>;

export type LocalisedFaq = Readonly<Record<UiLocale, readonly FaqEntry[]>>;

export function buildPage(input: {
  path: string;
  kind: PageKind;
  ctaPath: string;
  rows: LocalisedRows;
  extraSection?: ExtraSection;
  faq?: LocalisedFaq;
}): MarketingPage {
  const copy = {} as Record<UiLocale, PageCopy>;

  for (const [locale, row] of Object.entries(input.rows) as Array<[UiLocale, CopyRow]>) {
    const sections = [
      { heading: row[4], body: row[5] },
      { heading: row[6], body: row[7] },
    ];
    const extra = input.extraSection?.[locale];
    if (extra) sections.push({ heading: extra[0], body: extra[1] });

    copy[locale] = {
      title: row[0],
      description: row[1],
      h1: row[2],
      intro: row[3],
      sections,
      ...(input.faq ? { faq: input.faq[locale] } : {}),
      ctaLabel: row[8],
    };
  }

  return { path: input.path, kind: input.kind, ctaPath: input.ctaPath, copy };
}
