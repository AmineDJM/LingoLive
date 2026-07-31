import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { localizedPath } from '@/lib/site';
import { Card } from '@/components/ui';

/**
 * The in-app home.
 *
 * Exactly three actions, in priority order, and nothing else competing for
 * attention. This is the screen the whole product is organised around.
 */
export default async function AppHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  const locale = definition.locale;
  const t = createTranslator(locale);

  const actions = [
    {
      path: 'listen',
      title: t.t('home.listenTitle'),
      body: t.t('home.listenSubtitle'),
      a11y: t.t('a11y.listenCard'),
      primary: true,
    },
    {
      path: 'discuss',
      title: t.t('home.discussTitle'),
      body: t.t('home.discussSubtitle'),
      a11y: t.t('a11y.discussCard'),
      primary: false,
    },
    {
      path: 'join',
      title: t.t('home.joinTitle'),
      body: t.t('home.joinSubtitle'),
      a11y: t.t('a11y.joinCard'),
      primary: false,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-balance text-[28px] font-bold leading-tight text-ink">
        {t.t('home.greeting')}
      </h1>

      <ul className="mt-8 space-y-4">
        {actions.map((action) => (
          <li key={action.path}>
            <Link
              href={localizedPath(locale, action.path)}
              aria-label={action.a11y}
              data-testid={`home-${action.path}`}
              className="block"
            >
              <Card
                className={
                  action.primary
                    ? 'border-primary bg-primary-soft transition-colors hover:border-primary-hover'
                    : 'transition-colors hover:border-border-strong'
                }
              >
                <h2 className="text-xl font-bold text-ink">{action.title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-secondary">
                  {action.body}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-[13px] text-ink-muted">{t.t('home.guestBanner')}</p>
    </div>
  );
}
