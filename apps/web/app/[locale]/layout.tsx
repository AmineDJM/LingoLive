import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment, UI_LOCALE_DEFINITIONS } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { localeParams, metadataAlternates, siteName } from '@/lib/site';
import { LocaleHtmlAttributes } from '@/components/locale-html';

/**
 * Locale segment.
 *
 * Everything below here knows its language and its text direction. The
 * `<html lang>` / `<html dir>` attributes are set from the client component
 * below rather than duplicating a root layout per locale, which keeps a single
 * document shell while still emitting correct, per-locale markup.
 */

export function generateStaticParams() {
  return localeParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) return {};

  return {
    alternates: metadataAlternates(definition.locale),
    openGraph: {
      siteName,
      locale: definition.htmlLang.replace('-', '_'),
      type: 'website',
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();

  const t = createTranslator(definition.locale);

  return (
    <>
      <LocaleHtmlAttributes lang={definition.htmlLang} dir={definition.direction} />
      <a className="ll-skip-link" href="#main">
        {t.t('a11y.skipToContent')}
      </a>
      {children}
    </>
  );
}

export const dynamicParams = false;

/** Used by the sitemap and the language switcher. */
export const SUPPORTED_LOCALES = UI_LOCALE_DEFINITIONS;
