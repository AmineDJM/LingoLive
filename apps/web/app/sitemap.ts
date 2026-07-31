import type { MetadataRoute } from 'next';
import { UI_LOCALE_DEFINITIONS } from '@lingolive/contracts';
import { ALL_PAGES } from '@/content';
import { absoluteUrl, localizedPath } from '@/lib/site';

/**
 * A localized sitemap.
 *
 * Each URL is listed once per locale, and every entry carries the full
 * `alternates.languages` map, so a crawler discovers all seven versions of a
 * page from any one of them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of ALL_PAGES) {
    const languages: Record<string, string> = {};
    for (const definition of UI_LOCALE_DEFINITIONS) {
      languages[definition.htmlLang] = absoluteUrl(localizedPath(definition.locale, page.path));
    }

    for (const definition of UI_LOCALE_DEFINITIONS) {
      entries.push({
        url: absoluteUrl(localizedPath(definition.locale, page.path)),
        lastModified,
        changeFrequency: page.kind === 'home' ? 'weekly' : 'monthly',
        priority: page.kind === 'home' ? 1 : page.kind === 'use-case' ? 0.8 : 0.5,
        alternates: { languages },
      });
    }
  }

  return entries;
}
