import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { HistoryScreen } from '@/components/history-screen';

export function generateStaticParams() {
  return localeParams();
}

export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <HistoryScreen locale={definition.locale} />;
}
