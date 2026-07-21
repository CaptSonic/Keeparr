'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes, formatDate, formatNumber, formatRelativeTime } from '@/lib/i18n';
import { useToast } from '../Toaster';
import { Card, btnCls, btnGhost } from './ui';
import BackupsCard from './BackupsCard';
import HealthCard from './HealthCard';
import { useLocale } from '../LocaleProvider';
import { jobLabel, jobStatusLabel } from '@/lib/ui-labels';

type JobSchedule =
  | { type: 'interval'; minutes: number }
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number };

interface JobRow {
  jobId: string;
  label: string;
  lastStatus: string;
  lastMessage: string | null;
  lastRun: number | null;
  schedule: JobSchedule;
}
interface RunRow {
  id: number;
  jobId: string;
  startedAt: number;
  status: string | null;
  message: string | null;
}

const WEEKDAYS = [['Sun', 'So'], ['Mon', 'Mo'], ['Tue', 'Di'], ['Wed', 'Mi'], ['Thu', 'Do'], ['Fri', 'Fr'], ['Sat', 'Sa']];

function hhmm(s: JobSchedule): string {
  if (s.type === 'daily' || s.type === 'weekly') {
    return `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  }
  return '03:00';
}

/** Display unit for an interval schedule (whole hours collapse to "hours"). */
function intervalUnit(
  s: JobSchedule,
  override: 'min' | 'hr' | undefined
): 'min' | 'hr' {
  if (override) return override;
  if (s.type === 'interval' && s.minutes >= 60 && s.minutes % 60 === 0) return 'hr';
  return 'min';
}

// Inline schedule controls need FIXED widths, so they can't use `inputCls`
// (which is `w-full` — that fights the `w-NN` and stretches one control while
// squeezing the rest). This is the same chrome minus the width.
const ctrl =
  'rounded-md bg-slate-800 border border-slate-700 px-2 py-2 text-sm focus:outline-none focus:border-brand';

interface RunGroup {
  key: number; // first run's id (stable across re-renders)
  jobId: string;
  status: string | null;
  runs: RunRow[];
}

/** Collapse consecutive runs of the same job + status into one group, so a job
 *  firing OK every few minutes shows as a single expandable row, not a flood. */
function groupRuns(runs: RunRow[]): RunGroup[] {
  const groups: RunGroup[] = [];
  for (const r of runs) {
    const last = groups[groups.length - 1];
    if (last && last.jobId === r.jobId && last.status === r.status) {
      last.runs.push(r);
    } else {
      groups.push({ key: r.id, jobId: r.jobId, status: r.status, runs: [r] });
    }
  }
  return groups;
}

export default function JobsCachePanel() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [schedules, setSchedules] = useState<Record<string, JobSchedule>>({});
  const [images, setImages] = useState<{ count: number; bytes: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [cacheMsg, setCacheMsg] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Per-job interval unit (min/hr) — UI-only; the schedule still stores minutes.
  const [units, setUnits] = useState<Record<string, 'min' | 'hr'>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();

  const loadJobs = useCallback(async () => {
    const d = await fetch('/api/admin/jobs').then((r) => r.json());
    const rows: JobRow[] = d.jobs ?? [];
    setJobs(rows);
    setRecent(d.recent ?? []);
    setSchedules((prev) =>
      Object.keys(prev).length ? prev : Object.fromEntries(rows.map((j) => [j.jobId, j.schedule]))
    );
    return rows;
  }, []);

  const loadCache = useCallback(async () => {
    const d = await fetch('/api/admin/cache').then((r) => r.json());
    setImages(d.images ?? null);
  }, []);

  useEffect(() => {
    loadJobs();
    loadCache();
  }, [loadJobs, loadCache]);

  const anyRunning = jobs.some((j) => j.lastStatus === 'running');
  useEffect(() => {
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const rows = await loadJobs();
        if (!rows.some((j) => j.lastStatus === 'running') && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyRunning, loadJobs]);

  function setSchedule(jobId: string, s: JobSchedule) {
    setSchedules((m) => ({ ...m, [jobId]: s }));
  }

  async function saveSchedules() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobSchedules: schedules }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMsg(de ? 'Gespeichert.' : 'Saved.');
    } catch {
      setMsg(de ? 'Speichern fehlgeschlagen — Zeitpläne unverändert.' : "Couldn't save — schedules unchanged.");
    } finally {
      setSaving(false);
    }
  }

  async function runJob(job: string) {
    const res = await fetch('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job }),
    });
    if (!res.ok) toast(de ? `Der Job „${jobLabel(job, locale)}“ konnte nicht gestartet werden.` : `Couldn't start the ${jobLabel(job, locale)} job.`, 'error');
    await loadJobs();
  }

  async function clearCache(target: string) {
    setCacheMsg(de ? 'Leeren…' : 'Clearing…');
    const r = await fetch('/api/admin/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    }).then((x) => x.json());
    setCacheMsg(r.message ?? (de ? 'Fertig.' : 'Done.'));
    loadCache();
  }

  function toggleGroup(key: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = groupRuns(recent);

  return (
    <div className="space-y-5">
    <HealthCard />
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0">
      <Card title={de ? 'Geplante Jobs' : 'Scheduled jobs'}>
        <p className="text-sm text-slate-400 mb-3">
          {de ? 'Jeder Job läuft in einem Intervall oder einmal täglich (lokale Serverzeit). Jeder kann sofort gestartet werden.' : 'Each job runs on an interval or once daily (server local time). Run any now.'}
        </p>
        <div className="space-y-3">
          {jobs.map((j) => {
            const s = schedules[j.jobId] ?? j.schedule;
            return (
              <div
                key={j.jobId}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{jobLabel(j.jobId, locale, j.label)}</div>
                  <div className="truncate text-xs text-slate-500">
                    {j.lastStatus === 'running'
                      ? (de ? 'Läuft…' : 'Running…')
                      : j.lastStatus === 'never'
                        ? (de ? 'Noch nie ausgeführt' : 'Never run')
                        : `${jobStatusLabel(j.lastStatus, locale)}${j.lastMessage ? ` — ${j.lastMessage}` : ''}`}
                  </div>
                </div>
                {/* Schedule controls + Run now stay on one line (shrink-0, no wrap). */}
                <div className="flex shrink-0 items-center gap-3">
                  <select
                    className={`${ctrl} w-28`}
                    value={s.type}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'daily') setSchedule(j.jobId, { type: 'daily', hour: 3, minute: 0 });
                      else if (v === 'weekly')
                        setSchedule(j.jobId, { type: 'weekly', weekday: 0, hour: 3, minute: 0 });
                      else setSchedule(j.jobId, { type: 'interval', minutes: 60 });
                    }}
                  >
                    <option value="interval">{de ? 'Alle…' : 'Every…'}</option>
                    <option value="daily">{de ? 'Täglich um…' : 'Daily at…'}</option>
                    <option value="weekly">{de ? 'Wöchentlich am…' : 'Weekly on…'}</option>
                  </select>

                  {s.type === 'interval' &&
                    (() => {
                      const unit = intervalUnit(s, units[j.jobId]);
                      const shown = unit === 'hr' ? Math.max(1, Math.round(s.minutes / 60)) : s.minutes;
                      return (
                        <div className="flex items-center gap-2">
                          <input
                            className={`${ctrl} w-14`}
                            type="number"
                            min={0}
                            value={shown}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setSchedule(j.jobId, {
                                type: 'interval',
                                minutes: unit === 'hr' ? Math.max(1, n) * 60 : n,
                              });
                            }}
                          />
                          <select
                            className={`${ctrl} w-20`}
                            value={unit}
                            onChange={(e) => {
                              const u = e.target.value as 'min' | 'hr';
                              setUnits((m) => ({ ...m, [j.jobId]: u }));
                              setSchedule(j.jobId, {
                                type: 'interval',
                                minutes:
                                  u === 'hr'
                                    ? Math.max(60, Math.round(s.minutes / 60) * 60)
                                    : s.minutes,
                              });
                            }}
                          >
                            <option value="min">min</option>
                            <option value="hr">{de ? 'Std.' : 'hours'}</option>
                          </select>
                        </div>
                      );
                    })()}

                  {s.type === 'weekly' && (
                    <select
                      className={`${ctrl} w-20`}
                      value={s.weekday}
                      onChange={(e) =>
                        setSchedule(j.jobId, {
                          type: 'weekly',
                          weekday: Number(e.target.value),
                          hour: s.hour,
                          minute: s.minute,
                        })
                      }
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={d[0]} value={i}>
                          {d[de ? 1 : 0]}
                        </option>
                      ))}
                    </select>
                  )}

                  {(s.type === 'daily' || s.type === 'weekly') && (
                    <input
                      className={`${ctrl} w-28`}
                      type="time"
                      value={hhmm(s)}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        setSchedule(
                          j.jobId,
                          s.type === 'weekly'
                            ? { type: 'weekly', weekday: s.weekday, hour: h || 0, minute: m || 0 }
                            : { type: 'daily', hour: h || 0, minute: m || 0 }
                        );
                      }}
                    />
                  )}

                  <button
                    onClick={() => runJob(j.jobId)}
                    disabled={j.lastStatus === 'running'}
                    className={`${btnGhost} shrink-0 whitespace-nowrap`}
                  >
                    {j.lastStatus === 'running' ? (de ? 'Läuft…' : 'Running…') : (de ? 'Jetzt starten' : 'Run now')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveSchedules} disabled={saving} className={btnCls}>
            {saving ? (de ? 'Speichern…' : 'Saving…') : (de ? 'Zeitpläne speichern' : 'Save schedules')}
          </button>
          <button onClick={() => runJob('all')} disabled={anyRunning} className={btnGhost}>
            {de ? 'Alle jetzt starten' : 'Run all now'}
          </button>
          {msg && <span className="text-sm text-slate-300">{msg}</span>}
        </div>
      </Card>

      <Card title="Cache">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="w-40">{de ? 'Posterbilder' : 'Poster images'}</span>
            <span className="text-slate-500">
              {images ? `${formatNumber(images.count, locale)} ${de ? 'Dateien' : 'files'} · ${formatBytes(images.bytes, locale)}` : '—'}
            </span>
            <button onClick={() => clearCache('images')} className={`${btnGhost} ml-auto`}>
              {de ? 'Leeren' : 'Clear'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40">{de ? 'Seerr-Anfragen' : 'Seerr requests'}</span>
            <span className="text-slate-500">{de ? 'wird durch den Anfragen-Job neu aufgebaut' : 'rebuilt by the Requests job'}</span>
            <button onClick={() => clearCache('requests')} className={`${btnGhost} ml-auto`}>
              {de ? 'Leeren' : 'Clear'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40">{de ? 'Wiedergabeverlauf' : 'Watch history'}</span>
            <span className="text-slate-500">{de ? 'wird durch den Wiedergabeverlauf-Job neu aufgebaut' : 'rebuilt by the Watch history job'}</span>
            <button onClick={() => clearCache('watch')} className={`${btnGhost} ml-auto`}>
              {de ? 'Leeren' : 'Clear'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40">Sonarr / Radarr</span>
            <span className="text-slate-500">{de ? 'wird durch den Sonarr-/Radarr-Job neu aufgebaut' : 'rebuilt by the Sonarr / Radarr job'}</span>
            <button onClick={() => clearCache('arr')} className={`${btnGhost} ml-auto`}>
              {de ? 'Leeren' : 'Clear'}
            </button>
          </div>
        </div>
        {cacheMsg && <p className="mt-2 text-xs text-slate-400">{cacheMsg}</p>}
        <p className="mt-2 text-[11px] text-slate-500">
          {de ? 'Bibliothekstitel und Metadaten werden beim nächsten Scan aktualisiert — nach dem Leeren der Poster werden Coverbilder erneut von Plex abgerufen.' : 'Library titles/metadata refresh on the next scan — clearing posters makes cover art re-fetch from Plex.'}
        </p>
      </Card>
      </div>

      <div className="min-w-0 space-y-5">
      <BackupsCard />
      <Card title={de ? 'Letzte Aktivitäten' : 'Recent activity'}>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">{de ? 'Noch keine Job-Ausführungen.' : 'No job runs yet.'}</p>
        ) : (
          <div className="divide-y divide-slate-800 text-sm">
            {groups.map((g) => {
              const head = g.runs[0];
              const multi = g.runs.length > 1;
              const open = expanded.has(g.key);
              const color = g.status === 'error' ? 'text-red-400' : 'text-emerald-400';
              return (
                <div key={g.key} className="py-1.5">
                  <div
                    className={`flex items-center gap-2 text-xs ${multi ? 'cursor-pointer' : ''}`}
                    onClick={multi ? () => toggleGroup(g.key) : undefined}
                  >
                    <span className="w-3 shrink-0 text-slate-500">
                      {multi ? (open ? '▾' : '▸') : ''}
                    </span>
                    <span className={`shrink-0 ${color}`}>{jobStatusLabel(g.status, locale)}</span>
                    <span className="shrink-0 text-slate-400">{jobLabel(head.jobId, locale)}</span>
                    {multi && (
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 text-[11px] text-slate-300">
                        ×{g.runs.length}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-slate-600" title={formatDate(head.startedAt * 1000, locale, { dateStyle: 'medium', timeStyle: 'medium' })}>
                      {formatRelativeTime(head.startedAt, locale)}
                    </span>
                  </div>
                  {head.message && !open && (
                    <div className="truncate pl-5 text-xs text-slate-500">{head.message}</div>
                  )}
                  {open && (
                    <div className="mt-1 space-y-1 border-l border-slate-800 pl-4">
                      {g.runs.map((run) => (
                        <div key={run.id} className="text-[11px] text-slate-500">
                          <div className="flex items-center gap-2">
                            <span className="ml-auto shrink-0 text-slate-600">
                              {formatDate(run.startedAt * 1000, locale, { dateStyle: 'medium', timeStyle: 'medium' })}
                            </span>
                          </div>
                          {run.message && <div className="truncate">{run.message}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      </div>
    </div>
    </div>
  );
}
