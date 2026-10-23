'use client';

import { useEffect, useState } from 'react';
import type { JobProgress as Progress } from '@/lib/job-progress';
import { useLocale } from './LocaleProvider';

export default function JobProgress({ progress, queued = false }: { progress: Progress | null; queued?: boolean }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  if (!progress && !queued) return null;
  const known = !queued && progress?.total != null && progress.total > 0;
  const percent = known ? Math.min(100, Math.max(0, Math.floor(progress!.completed / progress!.total! * 100))) : undefined;
  const label = queued ? (de ? 'Wartet auf gemeinsame Ressourcen' : 'Waiting for shared resources')
    : progress!.status === 'error' ? (de ? 'Abgebrochen — letzten bestätigten Stand prüfen' : 'Stopped — check last acknowledged state')
    : progress!.status === 'complete' ? (de ? 'Beendet' : 'Finished')
    : (de ? progress!.phaseDe : progress!.phase);
  return <div className="mt-2 text-xs text-slate-400" aria-live="polite">
    <div className="mb-1 flex justify-between gap-2"><span>{label}</span>
      {!queued && progress && <span className="shrink-0">{progress.completed.toLocaleString(locale)}{known ? ` / ${progress.total!.toLocaleString(locale)} (${percent}%)` : ''}</span>}
    </div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      className="h-1.5 overflow-hidden rounded bg-slate-800">
      <div className={`h-full rounded ${progress?.status === 'error' ? 'bg-red-400' : 'bg-brand'} ${percent === undefined && progress?.status === 'running' && !queued ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        style={{ width: percent === undefined ? '100%' : `${percent}%` }} />
    </div>
    {progress && progress.status !== 'running' && !queued && <div className="mt-1">{de ? progress.phaseDe : progress.phase}</div>}
  </div>;
}

/** Also observes selected hand-offs, which run outside the scheduled job wrapper. */
export function MaintainerrJobProgress() {
  const [state, setState] = useState<{ progress: Progress | null; lastStatus: string } | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch('/api/admin/jobs', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (live) setState(data.jobs?.find((job: { jobId: string }) => job.jobId === 'maintainerr') ?? null);
        }
      } catch { /* Keep the last observed state; never invent completion. */ }
      if (live) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, []);
  return <JobProgress progress={state?.progress ?? null} queued={state?.lastStatus === 'queued'} />;
}