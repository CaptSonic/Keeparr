import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  approveCurrentMaintainerrPlan,
  approveCurrentMaintainerrReadd,
  previewMaintainerr,
} from '@/lib/maintainerr';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only Maintainerr reconciliation plan. Never writes membership or ownership. */
export async function GET() {
  try {
    await requireAdmin();
    const response = NextResponse.json(await previewMaintainerr());
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error, 'api/admin/maintainerr-preview');
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      action?: string;
      collectionId?: unknown;
      ratingKey?: unknown;
    };
    let preview;
    if (body.action === 'approve-mass') {
      preview = await approveCurrentMaintainerrPlan();
    } else if (
      body.action === 'approve-readd' &&
      Number.isSafeInteger(Number(body.collectionId)) &&
      Number(body.collectionId) > 0 &&
      typeof body.ratingKey === 'string' &&
      body.ratingKey.length > 0
    ) {
      preview = await approveCurrentMaintainerrReadd(
        Number(body.collectionId),
        body.ratingKey
      );
    } else {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const response = NextResponse.json(preview);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Maintainerr plan is not mass-blocked.' ||
      error.message === 'Maintainerr re-add is not currently blocked.'
    )) {
      return NextResponse.json({ error: 'approval_stale' }, { status: 409 });
    }
    return errorResponse(error, 'api/admin/maintainerr-preview');
  }
}
