import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment, UI_LOCALE_DEFINITIONS } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { ALL_PAGES, getGuide, getPage, getPageCopy, GUIDES } from '@/content';
import { localizedPath, metadataAlternates } from '@/lib/site';
import { ButtonLink, Card, PageHeading, Prose, Section } from '@/components/ui';
import { ArticleSchema, BreadcrumbSchema, FaqSchema } from '@/components/structured-data';

/**
 * Every marketing page other than the locale home.
 *
 * One catch-all route rather than fourteen near-identical files: the content
 * is data, the rendering is uniform, and adding a page means adding a record —
 * which also means it cannot be added without its seven translations.
 */

export function generateStaticParams() {
  const params: Array<{ locale: string; slug: string[] }> = [];
  for (const definition of UI_LOCALE_DEFINITIONS) {
    for (const page of ALL_PAGES) {
      if (page.path === '') continue;
      params.push({ locale: definition.urlSegment, slug: page.path.split('/') });
    }
  }
  return params;
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale: segment, slug } = await params;
  const definition = localeFromUrlSegment(segment);
  const path = slug.join('/');
  const copy = definition ? getPageCopy(path, definition.locale) : undefined;
  if (!definition || !copy) return {};

  return {
    title: copy.title,
    description: copy.description,
    alternates: metadataAlternates(definition.locale, path),
    openGraph: { title: copy.title, description: copy.description, type: 'article' },
    twitter: { title: copy.title, description: copy.description },
  };
}

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale: segment, slug } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  const locale = definition.locale;
  const path = slug.join('/');
  const page = getPage(path);
  const copy = getPageCopy(path, locale);
  if (!page || !copy) notFound();

  const t = createTranslator(locale);
  const guide = getGuide(slug[1] ?? '');
  const homeCopy = getPageCopy('', locale);

  const trail = [
    { name: homeCopy?.h1 ?? 'LingoLive', path: '' },
    ...(path.startsWith('guides/')
      ? [{ name: getPageCopy('guides', locale)?.h1 ?? 'Guides', path: 'guides' }]
      : []),
    { name: copy.h1, path },
  ];

  return (
    <>
      <BreadcrumbSchema locale={locale} trail={trail} />
      <FaqSchema copy={copy} />
      {guide ? (
        <ArticleSchema
          locale={locale}
          copy={copy}
          slug={guide.slug}
          publishedAt={guide.publishedAt}
          updatedAt={guide.updatedAt}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <nav aria-label="Breadcrumb" className="mx-auto mb-8 max-w-3xl text-sm text-ink-muted">
          <ol className="flex flex-wrap items-center gap-2">
            {trail.map((item, index) => (
              <li key={item.path} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {index === trail.length - 1 ? (
                  <span aria-current="page">{item.name}</span>
                ) : (
                  <Link href={localizedPath(locale, item.path)} className="hover:text-ink">
                    {item.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <PageHeading title={copy.h1} intro={copy.intro} />

        <Prose>
          <div className="mt-14 space-y-10">
            {copy.sections.map((section) => (
              <Section key={section.heading} heading={section.heading} body={section.body} />
            ))}
          </div>

          {copy.faq ? (
            <section aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="text-2xl font-bold text-ink">
                FAQ
              </h2>
              <dl className="mt-5 space-y-6">
                {copy.faq.map((entry) => (
                  <div key={entry.question}>
                    <dt className="font-semibold text-ink">{entry.question}</dt>
                    <dd className="mt-1.5 text-body leading-relaxed text-ink-secondary">
                      {entry.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {page.kind === 'guide-index' ? (
            <section aria-labelledby="guide-list">
              <h2 id="guide-list" className="sr-only">
                {copy.h1}
              </h2>
              <ul className="grid gap-4">
                {GUIDES.map((entry) => {
                  const guideCopy = entry.copy[locale];
                  return (
                    <Card as="li" key={entry.slug}>
                      <h3 className="text-xl font-bold text-ink">
                        <Link
                          href={localizedPath(locale, `guides/${entry.slug}`)}
                          className="hover:text-primary-text"
                        >
                          {guideCopy.h1}
                        </Link>
                      </h3>
                      <p className="mt-2 text-body-small leading-relaxed text-ink-secondary">
                        {guideCopy.description}
                      </p>
                    </Card>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {page.kind === 'legal' ? (
            <Card className="border-[var(--color-warning)]">
              <p className="text-body-small leading-relaxed text-ink-secondary">
                {t.t('marketing.notAnInterpreter')}
              </p>
            </Card>
          ) : null}

          <div className="pt-4">
            <ButtonLink href={localizedPath(locale, page.ctaPath)} size="lg">
              {copy.ctaLabel}
            </ButtonLink>
          </div>
        </Prose>
      </div>
    </>
  );
}
