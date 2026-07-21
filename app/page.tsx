import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getManagedSections, isServerConfigured } from '@/lib/settings';
import { sectionSizeSummary } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import KeepView from '@/components/KeepView';
import { SetupRequired } from '@/components/LocalizedPageText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const configured = isServerConfigured();

  // Feed filters are the user's actual Plex libraries, biggest first.
  const sizes = new Map(sectionSizeSummary().map((s) => [s.section_id, s.bytes]));
  const libraries = getManagedSections()
    .map((s) => ({ id: s.id, title: s.title, sizeBytes: sizes.get(s.id) ?? 0 }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return (
    <AppShell>
      {!configured ? (
        <SetupRequired isAdmin={user.isAdmin} />
      ) : (
        <KeepView libraries={libraries} />
      )}
    </AppShell>
  );
}
