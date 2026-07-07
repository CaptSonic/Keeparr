'use client';

import { useEffect, useState } from 'react';
import { Card } from './ui';

interface AboutInfo {
  version: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

export default function AboutPanel() {
  const [info, setInfo] = useState<AboutInfo | null>(null);

  useEffect(() => {
    fetch('/api/about')
      .then((r) => r.json())
      .then((d) =>
        setInfo({
          version: d.version ?? '',
          latest: d.latest ?? null,
          updateAvailable: !!d.updateAvailable,
          releaseUrl: d.releaseUrl ?? null,
        })
      )
      .catch(() => {});
  }, []);

  return (
    <Card title="About Keeparr">
      <p className="text-sm text-slate-300">
        Keeparr helps everyone with access to your media server decide what’s worth{' '}
        <strong>keeping</strong>, and surfaces what could be deleted to reclaim space.
      </p>
      <p className="mt-3 text-sm text-amber-400">
        Keeparr never deletes anything — it only tags and reports. You delete in your
        media server / Sonarr / Radarr.
      </p>
      {info?.updateAvailable && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Update available: v{info.latest}{' '}
          {info.releaseUrl && (
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-amber-200"
            >
              release notes
            </a>
          )}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Version</dt>
        <dd>
          {info?.version || '—'}
          {info && !info.updateAvailable && info.latest && (
            <span className="ml-2 text-xs text-slate-500">(up to date)</span>
          )}
        </dd>
        <dt className="text-slate-500">Keep</dt>
        <dd>Per-user, protective — if anyone keeps a title, it’s safe for all.</dd>
        <dt className="text-slate-500">I don’t care</dt>
        <dd>Per-user — hides a title from your own triage only.</dd>
        <dt className="text-slate-500">OK to delete</dt>
        <dd>The original requester signing off (needs Seerr). Never overrides a keep.</dd>
        <dt className="text-slate-500">Stack</dt>
        <dd>Next.js · SQLite · Plex / Jellyfin / Emby · Tautulli · Seerr · Sonarr / Radarr</dd>
        <dt className="text-slate-500">Telemetry</dt>
        <dd>None. Keeparr only calls GitHub to check for updates.</dd>
      </dl>
    </Card>
  );
}
