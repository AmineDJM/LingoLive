import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { ListenScreen } from '@/components/listen-screen';

export function generateStaticParams() {
  return localeParams();
}

export default async function ListenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <ListenScreen locale={definition.locale} />;
}
