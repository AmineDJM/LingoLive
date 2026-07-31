import type { UiLocale } from '@lingolive/contracts';
import type { PageCopy } from '@/content';
import { absoluteUrl, localizedPath, siteName, siteUrl } from '@/lib/site';

/**
 * Structured data.
 *
 * One rule, applied everywhere: the markup must describe what is actually on
 * the page. FAQ markup is emitted only when a FAQ is rendered, breadcrumbs
 * only when there is a real hierarchy, and no rating, price or review is ever
 * claimed — because none of those exist yet.
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Serialised from typed literals in the content module, never user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationSchema() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: siteName,
        url: siteUrl,
        logo: absoluteUrl('/icons/icon-512.png'),
      }}
    />
  );
}

export function SoftwareApplicationSchema({ locale, copy }: { locale: UiLocale; copy: PageCopy }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'LingoLive',
        url: absoluteUrl(localizedPath(locale)),
        description: copy.description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'iOS, Android, Web',
        inLanguage: locale,
        browserRequirements: 'Requires JavaScript, a microphone and an internet connection.',
      }}
    />
  );
}

export function FaqSchema({ copy }: { copy: PageCopy }) {
  if (!copy.faq || copy.faq.length === 0) return null;
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: copy.faq.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      }}
    />
  );
}

export function BreadcrumbSchema({
  locale,
  trail,
}: {
  locale: UiLocale;
  trail: Array<{ name: string; path: string }>;
}) {
  if (trail.length < 2) return null;
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: absoluteUrl(localizedPath(locale, item.path)),
        })),
      }}
    />
  );
}

export function ArticleSchema({
  locale,
  copy,
  slug,
  publishedAt,
  updatedAt,
}: {
  locale: UiLocale;
  copy: PageCopy;
  slug: string;
  publishedAt: string;
  updatedAt: string;
}) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: copy.h1,
        description: copy.description,
        inLanguage: locale,
        datePublished: publishedAt,
        dateModified: updatedAt,
        mainEntityOfPage: absoluteUrl(localizedPath(locale, `guides/${slug}`)),
        publisher: { '@type': 'Organization', name: siteName },
      }}
    />
  );
}
