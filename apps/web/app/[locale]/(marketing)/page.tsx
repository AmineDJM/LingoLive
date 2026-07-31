import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { getPageCopy } from '@/content';
import { localeParams, metadataAlternates } from '@/lib/site';
import { ButtonLink, Card, PageHeading } from '@/components/ui';
import { OrganizationSchema, SoftwareApplicationSchema } from '@/components/structured-data';
import { localizedPath } from '@/lib/site';

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
  const copy = definition ? getPageCopy('', definition.locale) : undefined;
  if (!definition || !copy) return {};

  return {
    title: copy.title,
    description: copy.description,
    alternates: metadataAlternates(definition.locale),
    openGraph: { title: copy.title, description: copy.description, type: 'website' },
    twitter: { title: copy.title, description: copy.description },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  const locale = definition.locale;
  const copy = getPageCopy('', locale);
  if (!copy) notFound();
  const t = createTranslator(locale);

  const actions = [
    {
      path: 'listen',
      title: t.t('home.listenTitle'),
      body: t.t('home.listenSubtitle'),
      primary: true,
    },
    {
      path: 'discuss',
      title: t.t('home.discussTitle'),
      body: t.t('home.discussSubtitle'),
      primary: false,
    },
    { path: 'join', title: t.t('home.joinTitle'), body: t.t('home.joinSubtitle'), primary: false },
  ];

  return (
    <>
      <OrganizationSchema />
      <SoftwareApplicationSchema locale={locale} copy={copy} />

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <PageHeading title={copy.h1} intro={copy.intro} />

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href={localizedPath(locale, 'listen')} size="lg">
            {copy.ctaLabel}
          </ButtonLink>
          <ButtonLink href={localizedPath(locale, 'how-it-works')} size="lg" variant="secondary">
            {t.t('marketing.heroSecondaryCta')}
          </ButtonLink>
        </div>

        {/*
          The three product actions, in the priority order the product uses
          everywhere: Listen, Discuss, Join. Nothing else competes with them.
        */}
        <ul className="mt-16 grid gap-5 md:grid-cols-3">
          {actions.map((action) => (
            <Card
              as="li"
              key={action.path}
              className={action.primary ? 'border-primary' : undefined}
            >
              <h2 className="text-xl font-bold text-ink">{action.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{action.body}</p>
              <ButtonLink
                href={localizedPath(locale, action.path)}
                variant={action.primary ? 'primary' : 'secondary'}
                className="mt-5 w-full"
              >
                {action.title}
              </ButtonLink>
            </Card>
          ))}
        </ul>

        <div className="mt-20 grid gap-10 md:grid-cols-3">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-ink">{section.heading}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{section.body}</p>
            </section>
          ))}
        </div>

        <Card className="mt-20 border-live bg-live-soft">
          <h2 className="text-2xl font-bold text-ink">{t.t('marketing.privacyTitle')}</h2>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-secondary">
            {t.t('marketing.privacyBody')}
          </p>
        </Card>
      </div>
    </>
  );
}
