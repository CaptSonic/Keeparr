import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  approveCurrentMaintainerrPlan,
  approveCurrentMaintainerrReadd,
  approveCurrentMaintainerrReadds,
  previewMaintainerr,
  savedMaintainerrPreview,
  syncMaintainerr,
  adoptMaintainerrMembers,
  type MaintainerrSelection,
} from '@/lib/maintainerr';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only Maintainerr reconciliation plan. Never writes membership or ownership. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    if (new URL(request.url).searchParams.get('snapshot') === '1') {
      return NextResponse.json({ preview: savedMaintainerrPreview() }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
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
      planHash?: unknown;
      operations?: unknown;
      members?: unknown;
    };
    if (body.action === 'adopt-members' || body.action === 'approve-readds') {
      if (!Array.isArray(body.members) || body.members.length === 0 || body.members.length > 10000 ||
          !body.members.every((member) => member && Number.isSafeInteger(member.collectionId) &&
            member.collectionId > 0 && typeof member.ratingKey === 'string' &&
            member.ratingKey.length > 0 && member.ratingKey.length <= 256)) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      }
      return NextResponse.json(await (body.action === 'approve-readds'
        ? approveCurrentMaintainerrReadds(body.members)
        : adoptMaintainerrMembers(body.members)), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (body.action === 'execute-selection') {
      if (typeof body.planHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.planHash) ||
          !Array.isArray(body.operations) || body.operations.length === 0 ||
          body.operations.length > 10000 || !body.operations.every((operation) =>
            operation && Number.isSafeInteger(operation.collectionId) && operation.collectionId > 0 &&
            typeof operation.ratingKey === 'string' && operation.ratingKey.length > 0 &&
            (operation.action === 'add' || operation.action === 'remove'))) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      }
      const result = await syncMaintainerr({
        planHash: body.planHash,
        operations: body.operations as MaintainerrSelection['operations'],
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
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
      error.message === 'Maintainerr selection is stale.' ||
      error.message === 'Maintainerr adoption is stale.' ||
      error.message === 'Maintainerr mutation already running.' ||
      error.message === 'Maintainerr plan is not mass-blocked.' ||
      error.message === 'Maintainerr re-add is not currently blocked.'
    )) {
      return NextResponse.json({ error: 'approval_stale' }, { status: 409 });
    }
    return errorResponse(error, 'api/admin/maintainerr-preview');
  }
}
