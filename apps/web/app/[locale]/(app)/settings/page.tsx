import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { SettingsScreen } from '@/components/settings-screen';

export function generateStaticParams() {
  return localeParams();
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <SettingsScreen locale={definition.locale} />;
}
