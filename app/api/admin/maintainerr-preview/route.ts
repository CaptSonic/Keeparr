import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { previewMaintainerr } from '@/lib/maintainerr';
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