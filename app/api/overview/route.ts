import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import {
  arrQualitySummary,
  librarySummary,
  unmatchedMediaSummary,
  usedBytesBySection,
} from '@/lib/queries';
import { buildStorageReport } from '@/lib/storage';
import {
  getDevStorageTotal,
  getManagedSections,
  getStorageMappings,
  isArrConfigured,
  isTautulliConfigured,
} from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * Everything the Keep totals column and the Big Picture dashboard need in one
 * call: per-library keep/don't-care/undecided breakdown (per user) plus real
 * disk capacity. Buckets partition each library's bytes so stacked bars add up.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const summary = new Map(
      librarySummary(user.plexUserId).map((r) => [r.section_id, r])
    );
    const report = await buildStorageReport(
      getStorageMappings(),
      usedBytesBySection(),
      { fakeTotalBytes: getDevStorageTotal() ?? undefined }
    );

    const libraries = getManagedSections().map((s) => {
      const r = summary.get(s.id);
      return {
        id: s.id,
        title: s.title,
        kind: s.type === 'movie' ? 'movie' : 'show',
        items: r?.items ?? 0,
        bytes: r?.bytes ?? 0,
        keptItems: r?.kept_items ?? 0,
        keptBytes: r?.kept_bytes ?? 0,
        keptByMeItems: r?.kept_by_me_items ?? 0,
        keptByMeBytes: r?.kept_by_me_bytes ?? 0,
        dontcareItems: r?.dontcare_items ?? 0,
        dontcareBytes: r?.dontcare_bytes ?? 0,
        undecidedItems: r?.undecided_items ?? 0,
        undecidedBytes: r?.undecided_bytes ?? 0,
        unwatchedItems: r?.unwatched_items ?? 0,
        unwatchedBytes: r?.unwatched_bytes ?? 0,
        unwatchedKeptBytes: r?.unwatched_kept_bytes ?? 0,
        unwatchedKeptByMeBytes: r?.unwatched_kept_by_me_bytes ?? 0,
        unwatchedDontcareBytes: r?.unwatched_dontcare_bytes ?? 0,
        unwatchedUndecidedBytes: r?.unwatched_undecided_bytes ?? 0,
      };
    });

    const sum = (k: keyof (typeof libraries)[number]) =>
      libraries.reduce((a, l) => a + (l[k] as number), 0);

    const totals = {
      items: sum('items'),
      bytes: sum('bytes'),
      keptItems: sum('keptItems'),
      keptBytes: sum('keptBytes'),
      keptByMeItems: sum('keptByMeItems'),
      keptByMeBytes: sum('keptByMeBytes'),
      dontcareItems: sum('dontcareItems'),
      dontcareBytes: sum('dontcareBytes'),
      undecidedItems: sum('undecidedItems'),
      undecidedBytes: sum('undecidedBytes'),
      unwatchedItems: sum('unwatchedItems'),
      unwatchedBytes: sum('unwatchedBytes'),
      unwatchedKeptBytes: sum('unwatchedKeptBytes'),
      unwatchedKeptByMeBytes: sum('unwatchedKeptByMeBytes'),
      unwatchedDontcareBytes: sum('unwatchedDontcareBytes'),
      unwatchedUndecidedBytes: sum('unwatchedUndecidedBytes'),
    };

    const storage = report.totals
      ? {
          configured: true as const,
          totalBytes: report.totals.totalBytes,
          freeBytes: report.totals.freeBytes,
          usedBytes: report.totals.usedBytes,
        }
      : { configured: false as const };

    const arr = isArrConfigured();
    const qualityBreakdown = arr
      ? { byQuality: arrQualitySummary(), notInArr: unmatchedMediaSummary() }
      : undefined;

    // Tracked media that lives on disk (= sum of library bytes); the disk bar
    // shows "other" = usedBytes - mediaUsedBytes for everything Keeparr can't see.
    return NextResponse.json({
      storage,
      mediaUsedBytes: totals.bytes,
      libraries,
      totals,
      // Watch data (badges, never-watched metric) only makes sense when Tautulli
      // is connected — the UI hides those surfaces otherwise.
      tautulli: isTautulliConfigured(),
      // Sonarr/Radarr-derived "reclaim by quality" breakdown (when connected).
      arr,
      qualityBreakdown,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
