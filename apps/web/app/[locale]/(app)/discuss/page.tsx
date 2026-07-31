import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { DiscussScreen } from '@/components/discuss-screen';

export function generateStaticParams() {
  return localeParams();
}

export default async function DiscussPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <DiscussScreen locale={definition.locale} />;
}
