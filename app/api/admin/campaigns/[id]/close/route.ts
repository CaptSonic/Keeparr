import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { closeCleanupCampaign, getCleanupCampaign, logEvent } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const current = getCleanupCampaign(id);
    if (!current) {
      return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });
    }
    if (current.status !== 'active') {
      return NextResponse.json({ error: 'campaign_not_active' }, { status: 409 });
    }
    if (!closeCleanupCampaign(id)) {
      return NextResponse.json({ error: 'grace_period_active' }, { status: 409 });
    }
    const campaign = getCleanupCampaign(id)!;
    logEvent(
      'info',
      'campaign',
      `${user.username ?? user.plexUserId} closed cleanup campaign #${campaign.id} (${campaign.name}).`
    );
    return NextResponse.json({ campaign });
  } catch (e) {
    return errorResponse(e, 'api/admin/campaigns/close');
  }
}