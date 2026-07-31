import Link from 'next/link';
import type { UiLocale } from '@lingolive/contracts';
import { UI_LOCALE_DEFINITIONS } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { FOOTER_NAV, getPageCopy } from '@/content';
import { localizedPath } from '@/lib/site';
import { cx } from './ui';

/**
 * Public site header and footer.
 *
 * These render on the marketing pages only. The product surfaces have their
 * own, much quieter chrome — a marketing navigation bar on top of a live
 * transcript would be noise at exactly the wrong moment.
 */

export function SiteHeader({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const home = localizedPath(locale);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_88%,transparent)] backdrop-blur">
      <nav
        aria-label={t.t('nav.home')}
        className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6"
      >
        <Link href={home} className="flex items-center gap-2 font-bold text-ink" data-touch-target>
          <LingoLiveMark />
          <span className="text-[17px]">LingoLive</span>
        </Link>

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <Link
            href={localizedPath(locale, 'how-it-works')}
            className="hidden rounded-[var(--radius-md)] px-3 py-2 text-[15px] font-medium text-ink-secondary hover:text-ink sm:block"
          >
            {getPageCopy('how-it-works', locale)?.h1}
          </Link>
          <Link
            href={localizedPath(locale, 'pricing')}
            className="hidden rounded-[var(--radius-md)] px-3 py-2 text-[15px] font-medium text-ink-secondary hover:text-ink sm:block"
          >
            {getPageCopy('pricing', locale)?.h1}
          </Link>
          <LanguageSwitcher locale={locale} label={t.t('marketing.footerLanguage')} />
          <Link
            href={localizedPath(locale, 'listen')}
            className="inline-flex items-center rounded-[var(--radius-md)] bg-primary px-4 py-2.5 text-[15px] font-semibold text-on-primary hover:bg-primary-hover"
            data-touch-target
          >
            {t.t('home.listenTitle')}
          </Link>
        </div>
      </nav>
    </header>
  );
}

/**
 * Language switcher.
 *
 * A plain list of links, each a real URL for that locale — so it works without
 * JavaScript, is crawlable, and lets someone share the page in the language
 * they are reading it in. Language names are endonyms; there are no flags,
 * because a flag is a country and this is a language.
 */
export function LanguageSwitcher({
  locale,
  label,
  path = '',
}: {
  locale: UiLocale;
  label: string;
  path?: string;
}) {
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[15px] font-medium text-ink-secondary hover:text-ink"
        aria-label={label}
        data-touch-target
      >
        <GlobeIcon />
        <span className="hidden sm:inline">
          {UI_LOCALE_DEFINITIONS.find((d) => d.locale === locale)?.nativeName}
        </span>
      </summary>
      <ul className="absolute end-0 z-20 mt-2 min-w-[13rem] rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[var(--ll-shadow-raised)]">
        {UI_LOCALE_DEFINITIONS.map((definition) => (
          <li key={definition.locale}>
            <Link
              href={localizedPath(definition.locale, path)}
              hrefLang={definition.htmlLang}
              lang={definition.htmlLang}
              dir={definition.direction}
              className={cx(
                'flex items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px]',
                definition.locale === locale
                  ? 'bg-primary-soft font-semibold text-primary-text'
                  : 'text-ink hover:bg-primary-soft',
              )}
              aria-current={definition.locale === locale ? 'true' : undefined}
            >
              {definition.nativeName}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SiteFooter({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);

  const groups: Array<{ heading: string; paths: readonly string[] }> = [
    { heading: t.t('marketing.footerProduct'), paths: FOOTER_NAV.product },
    { heading: t.t('home.listenTitle'), paths: FOOTER_NAV.useCases },
    { heading: t.t('marketing.footerCompany'), paths: FOOTER_NAV.company },
    { heading: t.t('marketing.footerLegal'), paths: FOOTER_NAV.legal },
  ];

  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                {group.heading}
              </h2>
              <ul className="space-y-2">
                {group.paths.map((path) => {
                  const copy = getPageCopy(path, locale);
                  if (!copy) return null;
                  return (
                    <li key={path}>
                      <Link
                        href={localizedPath(locale, path)}
                        className="text-[15px] text-ink-secondary hover:text-ink"
                      >
                        {copy.h1}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            {t.t('marketing.notAnInterpreter')}
          </p>
          <p className="mt-4 text-[14px] text-ink-muted">
            © {new Date().getUTCFullYear()} LingoLive
          </p>
        </div>
      </div>
    </footer>
  );
}

function LingoLiveMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <rect width="26" height="26" rx="7" fill="var(--color-primary)" />
      <path
        d="M9 7.5v11M13 5.5v15M17 9.5v7"
        stroke="var(--color-on-primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 10h15M10 2.5c2 2.2 3 4.8 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.8-3-7.5s1-5.3 3-7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
