'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, btnGhost } from './ui';

interface Unmatched {
  source: string;
  instanceName: string;
  title: string;
  extKind: string;
  extId: string;
}
interface Health {
  matched: number;
  unmatched: Unmatched[];
  missing: { shows: number; movies: number; sample: { title: string; kind: string }[] };
  arrJob: { lastStatus: string; lastRun: number | null } | null;
}

/** Sonarr/Radarr match health: matched vs unmatched, the unmatched titles, and
 *  Plex items with no external id (so they can never match). Admin-only. */
export default function MatchHealthCard() {
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

  return (
    <Card title="Match health (Sonarr / Radarr)">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">
          <span className="font-semibold text-white">{data?.matched ?? '—'}</span> matched
        </span>
        <span className="text-slate-300">
          <span className="font-semibold text-white">{data?.unmatched.length ?? '—'}</span> unmatched
        </span>
        <button onClick={resync} disabled={resyncing} className={`${btnGhost} ml-auto`} type="button">
          {resyncing ? 'Resyncing…' : 'Resync'}
        </button>
      </div>

      {missingTotal > 0 && (
        <p className="mb-3 text-sm text-amber-400">
          {missing!.shows} show(s) / {missing!.movies} movie(s) have no tmdb/tvdb id on the Plex
          side — they can never match Sonarr/Radarr.
        </p>
      )}

      {data && data.unmatched.length === 0 ? (
        <p className="text-sm text-slate-400">
          Everything in Sonarr/Radarr matched a Plex item. 🎉
        </p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {(data?.unmatched ?? []).map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-300">{u.title}</span>
              <span className="shrink-0 text-xs uppercase text-slate-500">{u.source}</span>
              <span className="shrink-0 font-mono text-xs text-slate-600">
                {u.extKind}:{u.extId}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Unmatched usually means the Plex item is missing that title&apos;s tmdb/tvdb id (a Plex
        agent/metadata issue) — fix it in Plex, then Resync. Unmatchable titles are fine to leave.
      </p>
    </Card>
  );
}
