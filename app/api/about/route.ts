import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import { getVersionInfo } from '@/lib/version';

export const runtime = 'nodejs';

/** Build/version info for the About page, incl. the update-available check. */
export async function GET() {
  try {
    await requireUser();
    const v = await getVersionInfo();
    return NextResponse.json({
      name: 'Keeparr',
      version: v.current,
      latest: v.latest,
      updateAvailable: v.updateAvailable,
      releaseUrl: v.releaseUrl,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
