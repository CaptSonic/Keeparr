import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getCleanupCampaignDetail,
  removeCleanupCampaignReview,
  reviewCleanupCampaignItem,
} from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

async function campaignId(context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = await campaignId(context);
    const { ratingKey } = (await req.json()) as { ratingKey?: string };
    if (!id || typeof ratingKey !== 'string' || !ratingKey) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (!reviewCleanupCampaignItem(id, ratingKey, user.plexUserId)) {
      return NextResponse.json({ error: 'campaign_not_reviewable' }, { status: 409 });
    }
    return NextResponse.json({ campaign: getCleanupCampaignDetail(id, user.plexUserId) });
  } catch (e) {
    return errorResponse(e, 'api/campaigns/review');
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = await campaignId(context);
    const { ratingKey } = (await req.json()) as { ratingKey?: string };
    if (!id || typeof ratingKey !== 'string' || !ratingKey) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (!removeCleanupCampaignReview(id, ratingKey, user.plexUserId)) {
      return NextResponse.json({ error: 'campaign_not_reviewable' }, { status: 409 });
    }
    return NextResponse.json({ campaign: getCleanupCampaignDetail(id, user.plexUserId) });
  } catch (e) {
    return errorResponse(e, 'api/campaigns/review');
  }
}