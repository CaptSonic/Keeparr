'use client';

import { useEffect, useState } from 'react';
import { Card } from './ui';
import { useLocale } from '../LocaleProvider';

interface AboutInfo {
  version: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

export default function AboutPanel() {
  const { locale } = useLocale();
  const de = locale === 'de';
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
    <Card title={de ? 'Über Keeparr' : 'About Keeparr'}>
      <p className="text-sm text-slate-300">
        {de ? 'Keeparr hilft allen Personen mit Zugriff auf deinen Medienserver zu entscheiden, was ' : 'Keeparr helps everyone with access to your media server decide what’s worth '}<strong>{de ? 'behalten' : 'keeping'}</strong>{de ? ' werden soll, und zeigt, was zur Speicherfreigabe gelöscht werden könnte.' : ', and surfaces what could be deleted to reclaim space.'}
      </p>
      <p className="mt-3 text-sm text-amber-400">
        {de ? 'Keeparr löscht niemals etwas — es markiert und berichtet nur. Du löschst in deinem Medienserver / Sonarr / Radarr.' : 'Keeparr never deletes anything — it only tags and reports. You delete in your media server / Sonarr / Radarr.'}
      </p>
      {info?.updateAvailable && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {de ? 'Aktualisierung verfügbar' : 'Update available'}: v{info.latest}{' '}
          {info.releaseUrl && (
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-amber-200"
            >
              {de ? 'Versionshinweise' : 'release notes'}
            </a>
          )}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Version</dt>
        <dd>
          {info?.version || '—'}
          {info && !info.updateAvailable && info.latest && (
            <span className="ml-2 text-xs text-slate-500">({de ? 'aktuell' : 'up to date'})</span>
          )}
        </dd>
        <dt className="text-slate-500">Keep</dt>
        <dd>{de ? 'Pro Benutzer, schützend — wenn jemand einen Titel behält, ist er für alle geschützt.' : 'Per-user, protective — if anyone keeps a title, it’s safe for all.'}</dd>
        <dt className="text-slate-500">{de ? 'Ist mir egal' : 'I don’t care'}</dt>
        <dd>{de ? 'Pro Benutzer — blendet einen Titel nur aus deiner eigenen Prüfung aus.' : 'Per-user — hides a title from your own triage only.'}</dd>
        <dt className="text-slate-500">{de ? 'Kann gelöscht werden' : 'OK to delete'}</dt>
        <dd>{de ? 'Die ursprünglich anfragende Person gibt ihn frei (benötigt Seerr). Überschreibt niemals „Behalten“.' : 'The original requester signing off (needs Seerr). Never overrides a keep.'}</dd>
        <dt className="text-slate-500">Stack</dt>
        <dd>Next.js · SQLite · Plex / Jellyfin / Emby · Tautulli · Seerr · Sonarr / Radarr</dd>
        <dt className="text-slate-500">{de ? 'Telemetrie' : 'Telemetry'}</dt>
        <dd>{de ? 'Keine. Keeparr ruft GitHub nur zur Prüfung auf Aktualisierungen auf.' : 'None. Keeparr only calls GitHub to check for updates.'}</dd>
      </dl>
    </Card>
  );
}
