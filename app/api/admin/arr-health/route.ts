import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import {
  arrMatchedCount,
  getArrUnmatched,
  getJobState,
  mediaMissingExternalIds,
} from '@/lib/queries';

export const runtime = 'nodejs';

/** Sonarr/Radarr match health: how many titles matched vs not, the unmatched
 *  list, and Plex items with no external id (which can never match). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({
      matched: arrMatchedCount(),
      unmatched: getArrUnmatched(),
      missing: mediaMissingExternalIds(),
      arrJob: getJobState('arr'),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
