import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { localizedPath } from '@/lib/site';
import { conversation } from '@lingolive/design-tokens';

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
      seat: 'blue' as const,
      primary: true,
    },
    {
      path: 'discuss',
      title: t.t('home.discussTitle'),
      body: t.t('home.discussSubtitle'),
      a11y: t.t('a11y.discussCard'),
      seat: 'coral' as const,
      primary: false,
    },
    {
      path: 'join',
      title: t.t('home.joinTitle'),
      body: t.t('home.joinSubtitle'),
      a11y: t.t('a11y.joinCard'),
      seat: 'mint' as const,
      primary: false,
    },
  ];

  return (
    /*
     * Three actions, and on a wide screen they stop being a list.
     *
     * Listen spans both columns because it is the one most people came for;
     * Discuss and Join sit beside each other underneath. On a phone the grid
     * collapses to a single column in the same priority order — the layout
     * changes, the hierarchy does not.
     */
    <div className="mx-auto w-full max-w-md px-4 py-8 md:max-w-4xl md:py-16">
      <h1 className="text-balance text-h2 font-bold leading-tight text-ink md:text-display">
        {t.t('home.greeting')}
      </h1>

      <ul className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2">
        {actions.map((action) => {
          const seat = conversation[action.seat];
          return (
            <li key={action.path} className={action.primary ? 'md:col-span-2' : undefined}>
              <Link
                href={localizedPath(locale, action.path)}
                aria-label={action.a11y}
                data-testid={`home-${action.path}`}
                className="ll-pressable block h-full"
                style={{
                  ['--seat' as string]: seat.base,
                  ['--seat-soft' as string]: seat.soft,
                  ['--seat-text' as string]: seat.text,
                }}
              >
                {/*
                  Each action owns a colour, and it is the same colour that
                  action uses everywhere else: Listen is Lingo Blue, Discuss is
                  the first two seats at a table, Join is mint. The home screen
                  teaches the vocabulary the rest of the product speaks.
                */}
                <div className="flex h-full flex-col rounded-[var(--radius-hero)] border border-[var(--seat)] bg-[var(--seat-soft)] p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)] md:p-8">
                  <span
                    aria-hidden="true"
                    className="mb-4 block h-1.5 w-12 rounded-full bg-[var(--seat)]"
                  />
                  <h2 className="text-title font-bold text-[var(--seat-text)] md:text-h2">
                    {action.title}
                  </h2>
                  <p className="mt-2 text-body-small leading-relaxed text-ink-secondary md:text-body">
                    {action.body}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-caption text-ink-muted">{t.t('home.guestBanner')}</p>
    </div>
  );
}
