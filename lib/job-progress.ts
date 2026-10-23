import { getDb } from './db';

export interface JobProgress {
  status: 'running' | 'complete' | 'error';
  phase: string;
  phaseDe: string;
  completed: number;
  total: number | null;
  updatedAt: number;
}

/** Stored separately from run history; also covers interactive selected hand-offs. */
export function getJobProgress(jobId: string): JobProgress | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?')
    .get(`job_progress:${jobId}`) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as JobProgress; } catch { return null; }
}

export function reportJobProgress(jobId: string, phase: string, phaseDe: string,
  completed = 0, total: number | null = null): void {
  save(jobId, { status: 'running', phase, phaseDe, completed, total, updatedAt: Date.now() });
}

export function finishJobProgress(jobId: string, success: boolean): void {
  const current = getJobProgress(jobId);
  if (current) save(jobId, { ...current, status: success ? 'complete' : 'error', updatedAt: Date.now() });
}

function save(jobId: string, value: JobProgress): void {
  getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(`job_progress:${jobId}`, JSON.stringify(value));
}