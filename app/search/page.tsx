import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import SearchResults from '@/components/SearchResults';
import { SearchHeading } from '@/components/LocalizedPageText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { q } = await searchParams;
  const query = (q ?? '').trim();

  return (
    <AppShell>
      <div className="px-6 py-6">
        <SearchHeading query={query} />
        <SearchResults query={query} />
      </div>
    </AppShell>
  );
}
