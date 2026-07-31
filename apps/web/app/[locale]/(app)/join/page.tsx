import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { JoinScreen } from '@/components/join-screen';

export function generateStaticParams() {
  return localeParams();
}

export default async function JoinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <JoinScreen locale={definition.locale} />;
}
