import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import { clearLogs, recentLogs } from '@/lib/queries';

export const runtime = 'nodejs';

/** Recent app-event logs. Query: ?level=info|warn|error|all&q=<search>&limit= */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const p = new URL(req.url).searchParams;
    const level = p.get('level') ?? 'all';
    const q = p.get('q') ?? undefined;
    // Default 300 for the viewer; up to the full retained log (1000) for export.
    const limit = Math.min(1000, Math.max(1, Number(p.get('limit')) || 300));
    return NextResponse.json({ logs: recentLogs({ level, q, limit }) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Clear the log. */
export async function DELETE() {
  try {
    await requireAdmin();
    clearLogs();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
