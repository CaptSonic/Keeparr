import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getCleanupCampaignDetail } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: raw } = await context.params;
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const campaign = getCleanupCampaignDetail(id, user.plexUserId);
    if (!campaign) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });
    return NextResponse.json({ campaign, isAdmin: user.isAdmin });
  } catch (e) {
    return errorResponse(e, 'api/campaigns/detail');
  }
}