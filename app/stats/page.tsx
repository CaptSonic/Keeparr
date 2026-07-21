import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isServerConfigured } from '@/lib/settings';
import AppShell from '@/components/AppShell';
import StatsView from '@/components/StatsView';
import { NotSetUpYet } from '@/components/LocalizedPageText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <AppShell>
      <div className="px-6 py-6">
        {!isServerConfigured() ? (
          <NotSetUpYet />
        ) : (
          <StatsView />
        )}
      </div>
    </AppShell>
  );
}
