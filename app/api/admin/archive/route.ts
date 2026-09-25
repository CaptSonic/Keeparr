import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { archiveDashboard, executeArchive, previewArchive } from '@/lib/archive';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const response = NextResponse.json(archiveDashboard());
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error, 'api/admin/archive');
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const { ratingKey } = (await request.json()) as { ratingKey?: string };
    if (!ratingKey) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const preview = await previewArchive(ratingKey, user.plexUserId);
    return NextResponse.json(preview, { status: preview.ready ? 200 : 409 });
  } catch (error) {
    return errorResponse(error, 'api/admin/archive');
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdmin();
    const { runId } = (await request.json()) as { runId?: string };
    if (!runId) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const result = await executeArchive(runId, user.plexUserId);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return errorResponse(error, 'api/admin/archive');
  }
}