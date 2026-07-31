import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { localizedPath } from '@/lib/site';

/**
 * Product shell.
 *
 * Everything under here is `noindex`: a live session, a saved transcript, a
 * join code or the operator console appearing in a search result would be a
 * privacy incident. `robots.txt` says the same thing; both are needed, since
 * a page can be reached by a link `robots.txt` never sees.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function AppLayout({
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
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      <nav
        aria-label={t.t('nav.home')}
        className="sticky bottom-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md">
          {[
            { path: 'app', label: t.t('nav.home') },
            { path: 'history', label: t.t('nav.history') },
            { path: 'settings', label: t.t('nav.settings') },
          ].map((item) => (
            <li key={item.path} className="flex-1">
              <Link
                href={localizedPath(definition.locale, item.path)}
                className="flex min-h-12 items-center justify-center px-3 py-3 text-[14px] font-medium text-ink-secondary hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
