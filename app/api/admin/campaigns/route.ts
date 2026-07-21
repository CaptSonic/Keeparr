import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  CleanupCampaignHasNoCandidatesError,
  createCleanupCampaign,
  logEvent,
} from '@/lib/queries';
import { getReclaimSignalReadiness } from '@/lib/reclaim-readiness';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

interface Body {
  name?: string;
  targetBytes?: number;
  deadlineAt?: number;
  gracePeriodDays?: number;
  minScore?: number;
  sectionIds?: string[];
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = (await req.json()) as Body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const targetBytes = Number(body.targetBytes);
    const deadlineAt = Number(body.deadlineAt);
    const gracePeriodDays = Number(body.gracePeriodDays ?? 7);
    const minScore = Number(body.minScore ?? 45);
    const sectionIds = Array.isArray(body.sectionIds)
      ? body.sectionIds
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0
          )
          .map((value) => value.trim())
      : undefined;
    const current = Math.floor(Date.now() / 1000);
    if (
      !name || name.length > 100 || !Number.isSafeInteger(targetBytes) || targetBytes <= 0 ||
      !Number.isSafeInteger(deadlineAt) || deadlineAt <= current ||
      !Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 90 ||
      !Number.isInteger(minScore) || minScore < 0 || minScore > 100 ||
      (body.sectionIds !== undefined && !Array.isArray(body.sectionIds)) ||
      (sectionIds !== undefined && sectionIds.length > 100)
    ) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const signals = getReclaimSignalReadiness();
    const campaign = createCleanupCampaign({
      name,
      targetBytes,
      deadlineAt,
      gracePeriodDays,
      minScore,
      createdBy: user.plexUserId,
      watchAvailable: signals.watch,
      arrAvailable: signals.arr,
      sectionIds: sectionIds ? [...new Set(sectionIds)] : undefined,
    });
    logEvent(
      'info',
      'campaign',
      `${user.username ?? user.plexUserId} created cleanup campaign #${campaign.id} (${campaign.name}) with ${campaign.plannedItems} titles.`
    );
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (e) {
    if (e instanceof CleanupCampaignHasNoCandidatesError) {
      return NextResponse.json({ error: 'no_campaign_candidates' }, { status: 409 });
    }
    return errorResponse(e, 'api/admin/campaigns');
  }
}