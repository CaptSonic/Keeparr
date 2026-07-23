import { requireAdminOrApiKey } from '@/lib/auth';
import { listAutomationReleases } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';
import { isAutomationBridgeEnabled } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * Read-only pull bridge for downstream cleanup tools. It never writes to a media
 * server and recomputes the global keep veto on every request.
 */
export async function GET(req: Request) {
  try {
    await requireAdminOrApiKey(req);
    if (!isAutomationBridgeEnabled()) {
      return Response.json({ error: 'automation_bridge_disabled' }, { status: 403 });
    }
    const items = listAutomationReleases();
    return Response.json({
      generatedAt: Math.floor(Date.now() / 1000),
      mode: 'report-only',
      items,
      summary: {
        items: items.length,
        bytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e, 'api/automation/releases');
  }
}
