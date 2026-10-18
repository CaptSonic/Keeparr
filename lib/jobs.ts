import {
  syncArr,
  syncLibrary,
  syncRecentlyAdded,
  syncSeerrRequests,
  syncSizes,
  syncWatchHistory,
  type JobResult,
} from './sync';
import { runBackup } from './backup';
import { syncMaintainerr } from './maintainerr';
import {
  getAllJobState,
  getJobState,
  isJobRunning,
  logEvent,
  recordJobRun,
  setJobState,
} from './queries';
import { getJobSchedules } from './settings';
import type { JobSchedule } from './config';
import type { JobState } from './types';
import { beginFreshness, finishFreshness, freshnessFingerprint } from './data-freshness';
import { getDb } from './db';
import { JobQueue } from './job-queue';

export type JobId =
  | 'recentlyAdded'
  | 'library'
  | 'sizes'
  | 'watch'
  | 'requests'
  | 'arr'
  | 'maintainerr'
  | 'backup';

export interface JobDef {
  id: JobId;
  label: string;
  run: () => Promise<JobResult>;
}

/** The schedulable refresh jobs, in display order. Labels are backend-neutral —
 *  the sync engine serves Plex/Jellyfin/Emby alike (watch = Tautulli on Plex,
 *  native data on Jellyfin/Emby). */
export const JOBS: JobDef[] = [
  { id: 'recentlyAdded', label: 'Recently added scan', run: syncRecentlyAdded },
  { id: 'library', label: 'Full library scan', run: syncLibrary },
  { id: 'sizes', label: 'Library size', run: syncSizes },
  { id: 'watch', label: 'Watch history', run: syncWatchHistory },
  { id: 'requests', label: 'Requests', run: syncSeerrRequests },
  { id: 'arr', label: 'Sonarr / Radarr', run: syncArr },
  { id: 'maintainerr', label: 'Maintainerr hand-off', run: syncMaintainerr },
  { id: 'backup', label: 'Backup', run: runBackup },
];

export const JOB_IDS = JOBS.map((j) => j.id);

/** Refresh inputs before hand-off when a batch is submitted together. */
export const JOB_RUN_ORDER: JobId[] = ['library', 'recentlyAdded', 'sizes', 'watch', 'requests', 'arr', 'maintainerr', 'backup'];

export function isJobId(id: string): id is JobId {
  return (JOB_IDS as string[]).includes(id);
}

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Run a job body with single-flight + status bookkeeping. Exported for tests so
 * the state machine can be exercised with an arbitrary fn. Resolves to false if
 * the job was already running (skipped).
 */
export async function runWithState(
  id: string,
  fn: () => Promise<JobResult>,
  clock: () => number = () => Date.now()
): Promise<boolean> {
  if (isJobRunning(id)) return false;
  const started = clock();
  const startedSec = nowSec();
  const fingerprint = freshnessFingerprint(id);
  beginFreshness(id, fingerprint, startedSec);
  setJobState(id, { lastStatus: 'running', lastMessage: 'Running…' });
  try {
    const { result, message, refreshComplete } = await fn();
    finishFreshness(id, fingerprint, nowSec(), refreshComplete === true ? 'complete' : 'incomplete');
    const durationMs = clock() - started;
    setJobState(id, {
      lastStatus: 'ok',
      lastRun: nowSec(),
      lastMessage: message,
      lastDurationMs: durationMs,
      lastResult: result,
    });
    recordJobRun({
      jobId: id,
      startedAt: startedSec,
      endedAt: nowSec(),
      status: 'ok',
      message,
      durationMs,
      result,
    });
    logEvent('info', `job:${id}`, message);
    return true;
  } catch (e) {
    finishFreshness(id, fingerprint, nowSec(), 'error');
    const durationMs = clock() - started;
    setJobState(id, {
      lastStatus: 'error',
      lastRun: nowSec(),
      lastMessage: String(e),
      lastDurationMs: durationMs,
    });
    recordJobRun({
      jobId: id,
      startedAt: startedSec,
      endedAt: nowSec(),
      status: 'error',
      message: String(e),
      durationMs,
      result: null,
    });
    logEvent('error', `job:${id}`, String(e));
    return true;
  }
}

const queues = new WeakMap<ReturnType<typeof getDb>, JobQueue>();

/** Resource locks cover background jobs, not interactive live previews.
 * Library and hand-off need a stable cache boundary across all refresh sources.
 * Backup uses SQLite's online backup API and deliberately holds no locks. */
export const JOB_RESOURCES: Record<JobId, readonly string[]> = {
  library: ['media', 'arr', 'requests'],
  maintainerr: ['media', 'arr', 'requests'],
  recentlyAdded: ['media'], sizes: ['media'], watch: ['media'],
  arr: ['arr'], requests: ['requests'], backup: [],
};

/** Shared scheduled/manual queue. Resolves after completion; duplicates return false. */
export async function runJob(id: string): Promise<boolean> {
  const job = JOBS.find((j) => j.id === id);
  if (!job) return false;
  const db = getDb();
  let queue = queues.get(db);
  if (!queue) {
    queue = new JobQueue();
    queues.set(db, queue);
  }
  if (queue.has(id) || isJobRunning(id) || getJobState(id).lastStatus === 'queued') return false;
  setJobState(id, { lastStatus: 'queued', lastMessage: 'Waiting for shared resources…' });
  return queue.enqueue(id, JOB_RESOURCES[job.id], () => runWithState(job.id, job.run));
}

/**
 * Whether a job is due now under its schedule: interval (every N min, 0 = off),
 * daily (once per day after a local HH:MM), or weekly (once a week on a local
 * weekday after HH:MM). Pure w.r.t. the passed clock.
 */
export function isDue(
  sch: JobSchedule | undefined,
  lastRun: number,
  nowMs: number
): boolean {
  if (!sch) return false;
  const nowS = Math.floor(nowMs / 1000);
  if (sch.type === 'interval') {
    return sch.minutes > 0 && nowS >= lastRun + sch.minutes * 60;
  }
  // weekly: only on the configured local weekday (0=Sun).
  if (sch.type === 'weekly' && new Date(nowMs).getDay() !== sch.weekday) {
    return false;
  }
  // daily/weekly: due once after the target local time (and, for weekly, only on
  // the matching weekday — already gated above).
  const target = new Date(nowMs);
  target.setHours(sch.hour, sch.minute, 0, 0);
  const targetS = Math.floor(target.getTime() / 1000);
  return nowS >= targetS && lastRun < targetS;
}

export function dueJobs(nowMs: number = Date.now()): JobId[] {
  const schedules = getJobSchedules();
  const due: JobId[] = [];
  for (const id of JOB_RUN_ORDER) {
    if (isJobRunning(id) || getJobState(id).lastStatus === 'queued') continue;
    const lastRun = getJobState(id).lastRun ?? 0;
    if (isDue(schedules[id], lastRun, nowMs)) due.push(id);
  }
  return due;
}

/** Job state for every registered job (with its schedule + label). */
export function jobStates(): (JobState & { label: string; schedule: JobSchedule })[] {
  const schedules = getJobSchedules();
  const byId = new Map(getAllJobState().map((s) => [s.jobId, s]));
  return JOBS.map((j) => {
    const state = byId.get(j.id) ?? getJobState(j.id);
    return {
      ...state,
      label: j.label,
      schedule: schedules[j.id] ?? { type: 'interval', minutes: 0 },
    };
  });
}
