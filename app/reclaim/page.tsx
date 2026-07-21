import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isServerConfigured } from '@/lib/settings';
import AppShell from '@/components/AppShell';
import ReclaimQueue from '@/components/ReclaimQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReclaimPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <AppShell>
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        {isServerConfigured() ? (
          <ReclaimQueue />
        ) : (
          <p className="text-slate-400">Not set up yet.</p>
        )}
      </div>
    </AppShell>
  );
}