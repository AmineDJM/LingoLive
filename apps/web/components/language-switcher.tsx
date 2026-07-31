'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALE_URL_SEGMENTS, UI_LOCALE_DEFINITIONS, type UiLocale } from '@lingolive/contracts';
import { localizedPath } from '@/lib/site';
import { cx } from './ui';

/**
 * Language switcher.
 *
 * Switching language must keep you on the page you are reading — someone on
 * `/en/pricing` who picks French belongs on `/fr/pricing`, not back at the
 * home page. That requires the current path, so this is a client component;
 * everything it renders is still a real, crawlable link per locale.
 *
 * Language names are endonyms. There are no flags: a flag is a country, and
 * this is a language.
 */
export function LanguageSwitcher({ locale, label }: { locale: UiLocale; label: string }) {
  const pathname = usePathname() ?? '/';
  const currentPath = stripLocale(pathname);

  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[15px] font-medium text-ink-secondary hover:text-ink"
        aria-label={label}
        data-testid="language-switcher"
        data-touch-target
      >
        <GlobeIcon />
        <span className="hidden sm:inline">
          {UI_LOCALE_DEFINITIONS.find((definition) => definition.locale === locale)?.nativeName}
        </span>
      </summary>
      <ul className="absolute end-0 z-20 mt-2 min-w-[13rem] rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[var(--ll-shadow-raised)]">
        {UI_LOCALE_DEFINITIONS.map((definition) => (
          <li key={definition.locale}>
            <Link
              href={localizedPath(definition.locale, currentPath)}
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

/** `/pt-br/live-transcription` → `live-transcription`. */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const [first] = segments;
  if (first && LOCALE_URL_SEGMENTS.includes(first.toLowerCase())) {
    return segments.slice(1).join('/');
  }
  return segments.join('/');
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 10h15M10 2.5c2 2.2 3 4.8 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.8-3-7.5s1-5.3 3-7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
