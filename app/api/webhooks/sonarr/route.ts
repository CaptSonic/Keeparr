import { NextResponse } from 'next/server';
import { finalizeRestoredSeries } from '@/lib/archive-restore';
import { errorResponse } from '@/lib/route-helpers';
import { getArchivePlaceholderConfig, getSonarrInstances } from '@/lib/settings';
import { archiveWebhookAuthorized, readBodyWithinLimit } from '@/lib/webhook-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SonarrWebhookPayload {
  eventType?: string;
  series?: { id?: number };
}

export async function POST(request: Request) {
  try {
    if (!archiveWebhookAuthorized(request)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const body = await readBodyWithinLimit(request, 1024 * 1024);
    if (!body) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    if (!getArchivePlaceholderConfig().enabled) {
      return NextResponse.json({ ignored: 'placeholders_disabled' });
    }
    const url = new URL(request.url);
    const instanceId = url.searchParams.get('instance') ?? '';
    if (!getSonarrInstances().some((instance) => instance.id === instanceId)) {
      return NextResponse.json({ error: 'unknown_instance' }, { status: 400 });
    }
    const payload = JSON.parse(new TextDecoder().decode(body)) as SonarrWebhookPayload;
    const event = String(payload.eventType ?? '').toLowerCase();
    if (event === 'test') return NextResponse.json({ ok: true, test: true });
    if (event !== 'download' && event !== 'importcomplete') {
      return NextResponse.json({ ignored: 'event' });
    }
    const seriesId = Number(payload.series?.id);
    if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
      return NextResponse.json({ error: 'invalid_series' }, { status: 400 });
    }
    return NextResponse.json(await finalizeRestoredSeries(instanceId, seriesId));
  } catch (error) {
    return errorResponse(error, 'api/webhooks/sonarr');
  }
}