import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import type { ReleaseMode } from '@/lib/types';
import {
  applyDelete,
  getActiveMediaItem,
  isRequestedByUser,
  removeDelete,
} from '@/lib/queries';

export const runtime = 'nodejs';

/**
 * Mark "OK to delete" for the current user (the original requester signing off).
 * Allowed ONLY on items this user requested on Seerr. Clears their keep / "don't
 * care" (mutually exclusive). Does NOT touch anyone else's keep. Body: { ratingKey }.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { ratingKey, releaseMode = 'remove_title' } = (await req.json()) as {
      ratingKey?: string;
      releaseMode?: ReleaseMode;
    };
    if (!ratingKey || !getActiveMediaItem(ratingKey)) {
      return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
    }
    if (!['remove_title', 'archive_existing'].includes(releaseMode)) {
      return NextResponse.json({ error: 'invalid_release_mode' }, { status: 400 });
    }
    const item = getActiveMediaItem(ratingKey)!;
    if (releaseMode === 'archive_existing' && item.library_kind !== 'show') {
      return NextResponse.json({ error: 'archive_requires_series' }, { status: 400 });
    }
    // Gate: you can only release something you requested on Seerr.
    if (!isRequestedByUser(user.plexUserId, ratingKey)) {
      return NextResponse.json({ error: 'not_requested' }, { status: 403 });
    }
    // Exclusive with keep and "don't care" (cleared atomically).
    const changed = applyDelete(user.plexUserId, ratingKey, releaseMode);
    return NextResponse.json({ markedForDelete: true, releaseMode, changed });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Clear the current user's "OK to delete" mark. Body: { ratingKey }. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const { ratingKey } = (await req.json()) as { ratingKey?: string };
    if (!ratingKey) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const changed = removeDelete(user.plexUserId, ratingKey);
    return NextResponse.json({ markedForDelete: false, changed });
  } catch (e) {
    return errorResponse(e);
  }
}
