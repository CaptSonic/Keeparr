import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import MaintainerrControlCenter from '@/components/settings/MaintainerrControlCenter';
import { SettingsLayout } from '@/components/settings/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.isAdmin) redirect('/');
  return (
    <AppShell>
      <SettingsLayout>
        <MaintainerrControlCenter />
      </SettingsLayout>
    </AppShell>
  );
}