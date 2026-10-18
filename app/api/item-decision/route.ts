import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getActiveMediaItem, isKept, isKeptByUser } from '@/lib/queries';
import { savedMaintainerrPreview } from '@/lib/maintainerr';
import { projectItemDecision } from '@/lib/item-decision';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Local, display-only explanation. Never starts a live plan or authorizes changes. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const ratingKey = new URL(request.url).searchParams.get('ratingKey');
    if (!ratingKey || ratingKey.length > 512) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (!getActiveMediaItem(ratingKey)) {
      return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
    }
    return NextResponse.json({
      ...projectItemDecision(ratingKey, isKept(ratingKey), isKeptByUser(user.plexUserId, ratingKey),
        user.isAdmin ? savedMaintainerrPreview() : null),
      admin: user.isAdmin,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error, 'api/item-decision');
  }
}