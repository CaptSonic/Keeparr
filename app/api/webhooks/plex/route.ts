import { NextResponse } from 'next/server';
import { requestArchiveRestoreByPlexPath } from '@/lib/archive-restore';
import { errorResponse } from '@/lib/route-helpers';
import { getArchivePlaceholderConfig, getMachineId } from '@/lib/settings';
import { archiveWebhookAuthorized, readBodyWithinLimit } from '@/lib/webhook-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlexWebhookPayload {
  event?: string;
  Server?: { uuid?: string; machineIdentifier?: string };
  Metadata?: {
    type?: string;
    Media?: { Part?: { file?: string }[] }[];
  };
}

function plexPartPaths(payload: PlexWebhookPayload): string[] {
  return (payload.Metadata?.Media ?? []).flatMap((media) =>
    (media.Part ?? []).map((part) => part.file).filter((file): file is string => !!file)
  );
}

export async function POST(request: Request) {
  try {
    if (!archiveWebhookAuthorized(request)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const body = await readBodyWithinLimit(request);
    if (!body) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    const config = getArchivePlaceholderConfig();
    if (!config.enabled || !config.automaticRestore) {
      return NextResponse.json({ ignored: 'automatic_restore_disabled' });
    }
    const limitedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    });
    const form = await limitedRequest.formData();
    const raw = form.get('payload');
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
    }
    const payload = JSON.parse(raw) as PlexWebhookPayload;
    if (payload.event !== 'media.play' && payload.event !== 'playback.started') {
      return NextResponse.json({ ignored: 'event' });
    }
    if (payload.Metadata?.type !== 'episode') {
      return NextResponse.json({ ignored: 'not_episode' });
    }
    const expectedMachine = getMachineId();
    const actualMachine = payload.Server?.uuid ?? payload.Server?.machineIdentifier;
    if (!expectedMachine || actualMachine !== expectedMachine) {
      return NextResponse.json({ ignored: 'server_mismatch' });
    }
    const root = config.plexArchiveRoot.replace(/\\/g, '/').replace(/\/$/, '');
    const paths = plexPartPaths(payload)
      .map((part) => part.replace(/\\/g, '/'))
      .filter((normalized) =>
        !!root && (normalized === root || normalized.startsWith(`${root}/`))
      );
    for (const part of paths) {
      const result = await requestArchiveRestoreByPlexPath(part);
      if (result.matched) return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
    return NextResponse.json({ matched: false, requested: 0 });
  } catch (error) {
    return errorResponse(error, 'api/webhooks/plex');
  }
}