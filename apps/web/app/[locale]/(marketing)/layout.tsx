import { localeFromUrlSegment } from '@lingolive/contracts';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

/**
 * Marketing shell.
 *
 * Nothing in this subtree imports the realtime engine or the audio stack —
 * the home page must not pay for a feature it does not use. A CI bundle check
 * enforces that.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader locale={definition.locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={definition.locale} />
    </div>
  );
}
