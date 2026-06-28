import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import { getServerIdentity } from '@/lib/plex';
import { getServerToken } from '@/lib/settings';
import { logEvent } from '@/lib/queries';
import { testTautulli } from '@/lib/tautulli';
import { testSeerr } from '@/lib/seerr';

export const runtime = 'nodejs';

interface Body {
  service: 'plex' | 'tautulli' | 'seerr';
  url: string;
  apiKey?: string;
  token?: string;
}

/** Probe a service's reachability with the provided (unsaved) credentials. The
 *  result is also written to the app log (Settings → Logs) so failures are
 *  diagnosable without server console access. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as Body;

    let result: { ok: boolean; message: string };
    if (body.service === 'plex') {
      try {
        // Fall back to the saved server token (e.g. when re-testing a manual URL).
        const token = body.token || getServerToken() || '';
        const id = await getServerIdentity(body.url, token);
        result = { ok: true, message: `Reached ${id.friendlyName}` };
      } catch (e) {
        result = { ok: false, message: String(e) };
      }
    } else if (body.service === 'tautulli') {
      result = await testTautulli(body.url, body.apiKey ?? '');
    } else if (body.service === 'seerr') {
      result = await testSeerr(body.url, body.apiKey ?? '');
    } else {
      return NextResponse.json({ error: 'bad_service' }, { status: 400 });
    }

    logEvent(
      result.ok ? 'info' : 'warn',
      'connection',
      `Test ${body.service} (${body.url}): ${result.ok ? 'OK' : 'failed'} — ${result.message}`
    );
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
