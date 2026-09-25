import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import ArchiveControlCenter from '@/components/settings/ArchiveControlCenter';
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
        <ArchiveControlCenter />
      </SettingsLayout>
    </AppShell>
  );
}