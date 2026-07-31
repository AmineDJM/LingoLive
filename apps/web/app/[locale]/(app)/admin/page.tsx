import { notFound } from 'next/navigation';
import { localeFromUrlSegment } from '@lingolive/contracts';
import { localeParams } from '@/lib/site';
import { AdminConsole } from '@/components/admin-console';

/**
 * The operator console.
 *
 * Requires both an administrator account and the deployment's shared admin
 * token; the API enforces both independently of this UI. Never indexed.
 */
export function generateStaticParams() {
  return localeParams();
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: segment } = await params;
  const definition = localeFromUrlSegment(segment);
  if (!definition) notFound();
  return <AdminConsole />;
}
