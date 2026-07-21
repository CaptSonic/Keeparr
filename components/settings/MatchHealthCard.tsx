'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes, formatNumber } from '@/lib/i18n';
import { Card, btnGhost } from './ui';
import { useLocale } from '../LocaleProvider';

interface Unmatched {
  source: string;
  instanceName: string;
  title: string;
  extKind: string;
  extId: string;
  sizeBytes: number;
}
interface Health {
  matched: number;
  unmatched: Unmatched[];
  missing: { shows: number; movies: number; sample: { title: string; kind: string }[] };
  arrJob: { lastStatus: string; lastRun: number | null } | null;
}

/** Sonarr/Radarr match health: matched count, and titles that are DOWNLOADED in
 *  *arr but not found in Plex (media on disk Plex can't see — actionable). Plex
 *  items missing an external id (can never match) are shown as a count. Admin-only. */
export default function MatchHealthCard() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [data, setData] = useState<Health | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const d = await fetch('/api/admin/arr-health').then((r) => r.json());
    setData(d);
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  async function resync() {
    setResyncing(true);
    await fetch('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: 'arr' }),
    });
    // Poll the arr job until it finishes, then reload the health snapshot.
    pollRef.current = setInterval(async () => {
      const j = await fetch('/api/admin/jobs').then((r) => r.json());
      const arr = (j.jobs ?? []).find((x: { jobId: string }) => x.jobId === 'arr');
      if (arr && arr.lastStatus !== 'running') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setResyncing(false);
        load();
      }
    }, 2000);
  }

  const missing = data?.missing;
  const missingTotal = (missing?.shows ?? 0) + (missing?.movies ?? 0);
  const unmatched = data?.unmatched ?? [];
  const unmatchedBytes = unmatched.reduce((a, u) => a + (u.sizeBytes || 0), 0);

  return (
    <Card title={de ? 'Zuordnungsstatus (Sonarr / Radarr)' : 'Match health (Sonarr / Radarr)'}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">
          <span className="font-semibold text-white">{data ? formatNumber(data.matched, locale) : '—'}</span> {de ? 'zugeordnet' : 'matched'}
        </span>
        <span className="text-slate-300">
          <span className="font-semibold text-white">{data ? formatNumber(unmatched.length, locale) : '—'}</span>{' '}
          {de ? 'heruntergeladen, nicht in Plex' : 'downloaded, not in Plex'}
          {unmatchedBytes > 0 && (
            <span className="text-slate-500"> · {formatBytes(unmatchedBytes, locale)}</span>
          )}
        </span>
        <button onClick={resync} disabled={resyncing} className={`${btnGhost} ml-auto`} type="button">
          {resyncing ? (de ? 'Neu synchronisieren…' : 'Resyncing…') : (de ? 'Neu synchronisieren' : 'Resync')}
        </button>
      </div>

      {missingTotal > 0 && (
        <div className="mb-3">
          <p className="text-sm text-amber-400">
            {formatNumber(missing!.shows, locale)} {de ? 'Serie(n)' : 'show(s)'} / {formatNumber(missing!.movies, locale)} {de ? 'Film(e) haben auf Plex-Seite keine tmdb/tvdb-ID — sie können Sonarr/Radarr niemals zugeordnet werden.' : 'movie(s) have no tmdb/tvdb id on the Plex side — they can never match Sonarr/Radarr.'}
          </p>
          {(missing!.sample?.length ?? 0) > 0 && (
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-2 text-xs">
              {missing!.sample.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-slate-400">{m.title}</span>
                  <span className="shrink-0 uppercase text-slate-600">{m.kind}</span>
                </div>
              ))}
              {missingTotal > missing!.sample.length && (
                <div className="mt-1 text-slate-600">
                  …{de ? 'und' : 'and'} {formatNumber(missingTotal - missing!.sample.length, locale)} {de ? 'weitere' : 'more'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data && unmatched.length === 0 ? (
        <p className="text-sm text-slate-400">
          {de ? 'Alles in Sonarr/Radarr Heruntergeladene ist in Plex vorhanden. 🎉' : 'Everything downloaded in Sonarr/Radarr is in Plex. 🎉'}
        </p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {unmatched.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-300">{u.title}</span>
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {formatBytes(u.sizeBytes, locale)}
              </span>
              <span className="shrink-0 text-xs uppercase text-slate-500">{u.source}</span>
              <span className="shrink-0 font-mono text-xs text-slate-600">
                {u.extKind}:{u.extId}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        {de ? 'Dies sind Titel mit Dateien auf dem Datenträger in Sonarr/Radarr, die Keeparr nicht in Plex finden konnte — meist fehlt dem Plex-Eintrag die tmdb/tvdb-ID oder Plex hat die Datei noch nicht gescannt. Korrigiere dies in Plex (oder scanne erneut) und synchronisiere dann neu. Gesuchte, aber nicht heruntergeladene Titel werden nicht aufgeführt — das sind lediglich fehlende Medien.' : 'These are titles with files on disk in Sonarr/Radarr that Keeparr couldn’t find in Plex — usually the Plex item is missing its tmdb/tvdb id, or Plex hasn’t scanned the file yet. Fix it in Plex (or rescan), then Resync. Wanted-but-not-downloaded titles aren’t listed — that’s just missing media.'}
      </p>
    </Card>
  );
}
