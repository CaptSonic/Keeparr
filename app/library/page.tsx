import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import {
  getManagedSections,
  isArrConfigured,
  isSeerrConfigured,
  isServerConfigured,
  isWatchAvailable,
} from '@/lib/settings';
import { sectionSizeSummary } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import LibraryBrowser from '@/components/LibraryBrowser';
import type { LibrarySection } from '@/lib/types';
import { NotSetUpYet } from '@/components/LocalizedPageText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const summary = new Map(
    sectionSizeSummary().map((s) => [s.section_id, s])
  );
  const sections: LibrarySection[] = getManagedSections().map((s) => ({
    sectionId: s.id,
    title: s.title,
    kind: s.type === 'movie' ? 'movie' : 'show',
    itemCount: summary.get(s.id)?.n ?? 0,
    sizeBytes: summary.get(s.id)?.bytes ?? 0,
  }));

  return (
    <AppShell>
      {!isServerConfigured() ? (
        <NotSetUpYet className="p-6 text-slate-400" />
      ) : (
        <LibraryBrowser
          sections={sections}
          tautulli={isWatchAvailable()}
          arr={isArrConfigured()}
          seerr={isSeerrConfigured()}
        />
      )}
    </AppShell>
  );
}
