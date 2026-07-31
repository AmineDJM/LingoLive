import {
  DEFAULT_LOCALE,
  localeFromUrlSegment,
  UI_LOCALE_DEFINITIONS,
  type UiLocale,
} from '@lingolive/contracts';

/**
 * Site-level configuration.
 *
 * Nothing here assumes a particular domain is registered: everything derives
 * from `NEXT_PUBLIC_SITE_URL`, so a deployment on a different hostname needs
 * no code change.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

export const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';

/**
 * Whether search engines may index this deployment at all.
 *
 * Production says yes. A staging or preview deployment must say no: two
 * indexable copies of the marketing site compete with each other, and a
 * preview URL is not something we want in search results.
 *
 * The explicit flag wins in both directions, so an end-to-end run can exercise
 * the production-shaped `robots.txt` without pretending to be production.
 * Otherwise it is opt-in: a new environment is private until someone decides
 * otherwise.
 */
export function shouldAllowIndexing(flag: string | undefined, environment: string): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return environment === 'production';
}

export const allowIndexing = shouldAllowIndexing(process.env.NEXT_PUBLIC_ALLOW_INDEXING, appEnv);

export const siteName = 'LingoLive';
export const siteTagline = 'LingoLive — Live Translation';
export const deepLinkScheme = 'lingolive';

/** Locale segment → locale, e.g. `pt-br` → `pt-BR`. */
export function localeFromSegment(segment: string): UiLocale {
  return localeFromUrlSegment(segment)?.locale ?? DEFAULT_LOCALE;
}

export function segmentForLocale(locale: UiLocale): string {
  return UI_LOCALE_DEFINITIONS.find((d) => d.locale === locale)?.urlSegment ?? 'en';
}

export function localeParams(): Array<{ locale: string }> {
  return UI_LOCALE_DEFINITIONS.map((definition) => ({ locale: definition.urlSegment }));
}

export function absoluteUrl(path: string): string {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localizedPath(locale: UiLocale, path = ''): string {
  const segment = segmentForLocale(locale);
  const suffix = path.replace(/^\//, '');
  return suffix ? `/${segment}/${suffix}` : `/${segment}`;
}

/**
 * `hreflang` alternates plus `x-default`.
 *
 * Google uses these to serve the right language without treating the seven
 * versions of a page as duplicates. `x-default` points at English as the
 * fallback for a visitor whose language we do not publish.
 */
export function alternatesFor(path = ''): {
  canonical: string;
  languages: Record<string, string>;
} {
  const languages: Record<string, string> = {};
  for (const definition of UI_LOCALE_DEFINITIONS) {
    languages[definition.htmlLang] = absoluteUrl(localizedPath(definition.locale, path));
  }
  languages['x-default'] = absoluteUrl(localizedPath(DEFAULT_LOCALE, path));
  return { canonical: '', languages };
}

export function metadataAlternates(
  locale: UiLocale,
  path = '',
): { canonical: string; languages: Record<string, string> } {
  const { languages } = alternatesFor(path);
  return { canonical: absoluteUrl(localizedPath(locale, path)), languages };
}
