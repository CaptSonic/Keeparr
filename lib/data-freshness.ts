import { createHash } from 'node:crypto';
import { getDb } from './db';
import {
  getMediaServerType, getServerBaseUrl, getServerId, getServerToken,
  getManagedSectionIds, getWatchSourceFingerprint, getSonarrInstances, getRadarrInstances,
  isServerConfigured, isArrConfigured,
} from './settings';
import { getReclaimSignalReadiness } from './reclaim-readiness';

export type FreshnessSource = 'library' | 'watch' | 'arr';
export interface SourceFreshness {
  source: FreshnessSource;
  configured: boolean;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  outcome: 'unknown' | 'running' | 'complete' | 'incomplete' | 'error';
  /** Only watch has an existing trust gate; never equate age with safety. */
  watchTrusted: boolean | null;
}

export function freshnessFingerprint(source: string): string | null {
  if (source === 'watch') return getWatchSourceFingerprint();
  let identity: unknown;
  if (source === 'library' && isServerConfigured()) {
    identity = [getMediaServerType(), getServerId(), getServerBaseUrl(), getServerToken(),
      [...getManagedSectionIds()].sort()];
  } else if (source === 'arr' && isArrConfigured()) {
    identity = [getMediaServerType(), getServerId(), getServerBaseUrl(), getServerToken(),
      getSonarrInstances().map(({ id, url, apiKey }) => [id, url, apiKey]).sort(),
      getRadarrInstances().map(({ id, url, apiKey }) => [id, url, apiKey]).sort()];
  } else return null;
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function beginFreshness(source: string, fingerprint: string | null, at: number): void {
  if (!fingerprint) return;
  getDb().prepare(`INSERT INTO source_freshness (source, attempt_at, attempt_fingerprint, outcome)
    VALUES (?, ?, ?, 'running') ON CONFLICT(source) DO UPDATE SET
    attempt_at = excluded.attempt_at, attempt_fingerprint = excluded.attempt_fingerprint, outcome = 'running'`)
    .run(source, at, fingerprint);
}

export function finishFreshness(
  source: string, fingerprint: string | null, at: number, outcome: 'complete' | 'incomplete' | 'error',
): void {
  if (!fingerprint) return;
  const complete = outcome === 'complete' && freshnessFingerprint(source) === fingerprint;
  getDb().prepare(`UPDATE source_freshness SET outcome = ?,
    success_at = CASE WHEN ? THEN ? ELSE success_at END,
    success_fingerprint = CASE WHEN ? THEN ? ELSE success_fingerprint END
    WHERE source = ? AND attempt_fingerprint = ?`)
    .run(outcome === 'complete' && !complete ? 'incomplete' : outcome,
      Number(complete), at, Number(complete), fingerprint, source, fingerprint);
}

/** No inference from legacy job status: ok may mean a no-op or partial refresh. */
export function dataFreshness(): SourceFreshness[] {
  const watchTrusted = getReclaimSignalReadiness().watch;
  return (['library', 'watch', 'arr'] as const).map((source) => {
    const fingerprint = freshnessFingerprint(source);
    const row = getDb().prepare('SELECT * FROM source_freshness WHERE source = ?').get(source) as {
      attempt_at: number; attempt_fingerprint: string; outcome: SourceFreshness['outcome'];
      success_at: number | null; success_fingerprint: string | null;
    } | undefined;
    const sameAttempt = !!fingerprint && row?.attempt_fingerprint === fingerprint;
    return {
      source, configured: fingerprint !== null,
      lastAttemptAt: sameAttempt ? row!.attempt_at : null,
      lastSuccessAt: fingerprint && row?.success_fingerprint === fingerprint ? row.success_at : null,
      outcome: sameAttempt ? row!.outcome : 'unknown',
      watchTrusted: source === 'watch' ? watchTrusted : null,
    };
  });
}