import { requireAdmin } from '@/lib/auth';
import { getCleanupCampaignDetail } from '@/lib/queries';
import { errorResponse } from '@/lib/route-helpers';

export const runtime = 'nodejs';

const csv = (value: unknown) => {
  const raw = String(value ?? '');
  // Prevent externally sourced titles/reasons from becoming formulas when an
  // admin opens the report in Excel or LibreOffice.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
    const campaign = getCleanupCampaignDetail(id, user.plexUserId);
    if (!campaign) return Response.json({ error: 'campaign_not_found' }, { status: 404 });
    const rows = [
      ['rank', 'rating_key', 'title', 'year', 'size_bytes', 'score', 'outcome', 'review_count', 'protected', 'reasons'],
      ...campaign.items.map((item) => [
        item.rank, item.ratingKey, item.title, item.year ?? '', item.sizeBytes, item.score,
        item.outcome, item.reviewCount, item.protectedByAnyone,
        item.reasons.map((r) => `${r.label} (+${r.points})`).join('; '),
      ]),
    ];
    const body = rows.map((row) => row.map(csv).join(',')).join('\r\n') + '\r\n';
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="keeparr-campaign-${id}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e, 'api/admin/campaigns/export');
  }
}