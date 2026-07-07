import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import { healthIssues } from '@/lib/health';

export const runtime = 'nodejs';

/** Standing health warnings (admin): job failures, config gaps, updates. */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ issues: await healthIssues() });
  } catch (e) {
    return errorResponse(e);
  }
}
