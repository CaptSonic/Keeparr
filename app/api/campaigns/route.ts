import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listCleanupCampaigns } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ campaigns: listCleanupCampaigns(), isAdmin: user.isAdmin });
  } catch (e) {
    return errorResponse(e, 'api/campaigns');
  }
}