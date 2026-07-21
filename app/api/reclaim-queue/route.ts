import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { thumbUrl } from '@/lib/cards';
import { getJobState, queryReclaimQueue } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';
import {
  getWatchSourceFingerprint,
  isArrConfigured,
  isWatchAvailable,
  readSetting,
} from '@/lib/settings';

export const runtime = 'nodejs';

const PAGE = 40;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const p = new URL(req.url).searchParams;
    const offset = Math.max(0, Number(p.get('offset')) || 0);
    const minScore = Math.max(0, Math.min(100, Number(p.get('minScore')) || 0));
    const sectionIds = (p.get('sections') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // An integration being configured does not prove that its cache is complete.
    // Treat missing watch data as neutral until one refresh finished successfully.
    const watchFingerprint = getWatchSourceFingerprint();
    const watchAvailable =
      isWatchAvailable() &&
      getJobState('watch').lastStatus === 'ok' &&
      watchFingerprint !== null &&
      readSetting('watch_source_fingerprint') === watchFingerprint;
    const arrAvailable = isArrConfigured();
    const rows = queryReclaimQueue({
      plexUserId: user.plexUserId,
      sectionIds,
      minScore,
      watchAvailable,
      arrAvailable,
      limit: PAGE + 1,
      offset,
    });
    const visible = rows.slice(0, PAGE);
    // Window aggregates live on result rows. Preserve the filtered totals when
    // a now-stale/out-of-range offset legitimately returns an empty page.
    const summaryRow =
      visible[0] ??
      (offset > 0
        ? queryReclaimQueue({
            plexUserId: user.plexUserId,
            sectionIds,
            minScore,
            watchAvailable,
            arrAvailable,
            limit: 1,
            offset: 0,
          })[0]
        : undefined);

    const items = visible.map((r) => {
      const reasons = [
        { code: 'size', label: 'Size on disk', points: r.size_points },
        r.delete_points
          ? { code: 'released', label: 'Requester marked OK to delete', points: r.delete_points }
          : null,
        r.watch_points === 25
          ? { code: 'never-watched', label: 'Never watched by anyone', points: r.watch_points }
          : r.watch_points
            ? {
                code: 'stale-watch',
                label: `Not watched in ${r.watch_points === 15 ? '1 year' : r.watch_points === 10 ? '6 months' : '90 days'}`,
                points: r.watch_points,
              }
            : null,
        r.status_points
          ? { code: 'finished', label: 'Finished/released in Sonarr or Radarr', points: r.status_points }
          : null,
        r.mismatch_points
          ? { code: 'size-mismatch', label: 'Media server and *arr sizes differ', points: r.mismatch_points }
          : null,
      ].filter((reason): reason is { code: string; label: string; points: number } => !!reason);

      return {
        ratingKey: r.rating_key,
        sectionId: r.section_id,
        libraryKind: r.library_kind,
        title: r.title,
        year: r.year,
        thumbUrl: thumbUrl(r.thumb),
        sizeBytes: r.size_bytes,
        kept: false,
        keptByMe: false,
        skipped: r.skipped === 1,
        markedForDeleteByMe: r.marked_for_delete_by_me === 1,
        markedForDeleteAny: r.marked_for_delete_any === 1,
        lastWatched: r.last_watched_any,
        status: r.arr_status ?? undefined,
        sizeMismatch: r.mismatch_points > 0 || undefined,
        score: r.score,
        strength: r.score >= 70 ? 'strong' : r.score >= 45 ? 'medium' : 'review',
        reasons,
      };
    });

    return NextResponse.json({
      items,
      summary: {
        items: summaryRow?.total_items ?? 0,
        bytes: summaryRow?.total_bytes ?? 0,
        strong: summaryRow?.total_strong ?? 0,
      },
      signals: { watch: watchAvailable, arr: arrAvailable },
      hasMore: rows.length > PAGE,
      nextOffset: offset + PAGE,
    });
  } catch (e) {
    return errorResponse(e);
  }
}