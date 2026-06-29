import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import {
  addDelete,
  getMediaItem,
  isRequestedByUser,
  removeDelete,
  removeKeep,
  removeSkip,
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
    const { ratingKey } = (await req.json()) as { ratingKey?: string };
    if (!ratingKey || !getMediaItem(ratingKey)) {
      return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
    }
    // Gate: you can only release something you requested on Seerr.
    if (!isRequestedByUser(user.plexUserId, ratingKey)) {
      return NextResponse.json({ error: 'not_requested' }, { status: 403 });
    }
    const changed = addDelete(user.plexUserId, ratingKey);
    removeKeep(user.plexUserId, ratingKey);
    removeSkip(user.plexUserId, ratingKey);
    return NextResponse.json({ markedForDelete: true, changed });
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
