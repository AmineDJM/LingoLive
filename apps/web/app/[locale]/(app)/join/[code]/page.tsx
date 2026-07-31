import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { JoinScreen } from '@/components/join-screen';

/**
 * The deep-link landing page.
 *
 * `lingolive://join/728416` and `https://lingolive.app/join/728416` both end
 * up here. Rendered dynamically because the code is not known at build time —
 * and because a page that lists valid codes is the last thing this product
 * should statically generate.
 */
export const dynamic = 'force-dynamic';

export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale: segment, code } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <JoinScreen locale={definition.locale} initialCode={code} />;
}
