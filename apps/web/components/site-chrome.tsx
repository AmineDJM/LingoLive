import Link from 'next/link';
import type { UiLocale } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { FOOTER_NAV, getPageCopy } from '@/content';
import { localizedPath } from '@/lib/site';
import { LanguageSwitcher } from './language-switcher';

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
    <header className="ll-material-bar sticky top-0 z-10 border-b">
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
