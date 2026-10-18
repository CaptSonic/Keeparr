import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { __closeDb, __setTestDbToMemory, getDb } from './db';
import { beginFreshness, dataFreshness, finishFreshness, freshnessFingerprint } from './data-freshness';
import { clearArrItems, clearWatchHistory, recordJobRun, resetInterruptedJobs, setJobState } from './queries';
import { getWatchSourceFingerprint, setRadarrInstances, writeSetting } from './settings';
import { runWithState } from './jobs';

beforeEach(() => {
  __setTestDbToMemory();
  writeSetting('plex_machine_id', 'server');
  writeSetting('plex_base_url', 'http://plex');
  writeSetting('plex_server_token', 'secret');
  writeSetting('tautulli_url', 'http://tautulli');
  writeSetting('tautulli_api_key', 'private-key');
});
afterAll(() => __closeDb());
const source = (id: string) => dataFreshness().find((value) => value.source === id)!;
function success(id: string, start = 100, end = 110) {
  const fingerprint = freshnessFingerprint(id);
  beginFreshness(id, fingerprint, start);
  finishFreshness(id, fingerprint, end, 'complete');
}

describe('informational source freshness', () => {
  it('does not infer success from legacy ok status or old unscoped job history', () => {
    setJobState('watch', { lastRun: 123, lastStatus: 'ok' });
    recordJobRun({ jobId: 'watch', startedAt: 120, endedAt: 123, status: 'ok', message: 'done', durationMs: 3, result: 0 });
    expect(source('watch')).toMatchObject({ configured: true, lastAttemptAt: null, lastSuccessAt: null, outcome: 'unknown', watchTrusted: false });
    expect(source('arr')).toMatchObject({ configured: false, lastSuccessAt: null });
  });
  it('keeps last complete success through later incomplete and failed attempts', () => {
    success('library');
    const fp = freshnessFingerprint('library');
    beginFreshness('library', fp, 200);
    finishFreshness('library', fp, 210, 'incomplete');
    expect(source('library')).toMatchObject({ lastAttemptAt: 200, lastSuccessAt: 110, outcome: 'incomplete' });
    beginFreshness('library', fp, 300);
    finishFreshness('library', fp, 310, 'error');
    expect(source('library')).toMatchObject({ lastAttemptAt: 300, lastSuccessAt: 110, outcome: 'error' });
  });
  it('does not claim success for a changed source, including changes during a run', () => {
    success('watch');
    const previous = freshnessFingerprint('watch');
    beginFreshness('watch', previous, 200);
    writeSetting('tautulli_api_key', 'new-key');
    finishFreshness('watch', previous, 210, 'complete');
    expect(source('watch')).toMatchObject({ lastAttemptAt: null, lastSuccessAt: null, outcome: 'unknown' });
    const current = freshnessFingerprint('watch');
    beginFreshness('watch', current, 300);
    finishFreshness('watch', current, 310, 'error');
    expect(source('watch')).toMatchObject({ lastAttemptAt: 300, lastSuccessAt: null, outcome: 'error' });
  });
  it('survives pruning of all old job history and never exposes fingerprints or secrets', () => {
    success('library');
    for (let index = 0; index < 110; index++) recordJobRun({
      jobId: 'recentlyAdded', startedAt: 1000 + index, endedAt: 1001 + index,
      status: 'ok', message: null, durationMs: 1, result: 0,
    });
    expect(source('library').lastSuccessAt).toBe(110);
    const json = JSON.stringify(dataFreshness());
    expect(json).not.toContain('fingerprint');
    expect(json).not.toContain('private-key');
    expect(json).not.toContain('http://');
  });
  it('invalidates watch freshness and trust when the cache is cleared', () => {
    success('watch');
    writeSetting('watch_source_fingerprint', getWatchSourceFingerprint()!);
    expect(source('watch').watchTrusted).toBe(true);
    clearWatchHistory();
    expect(source('watch')).toMatchObject({ lastSuccessAt: null, watchTrusted: false, outcome: 'unknown' });
  });
  it('marks interrupted attempts as errors without discarding older success', () => {
    success('library');
    beginFreshness('library', freshnessFingerprint('library'), 200);
    resetInterruptedJobs();
    expect(source('library')).toMatchObject({ outcome: 'error', lastAttemptAt: 200, lastSuccessAt: 110 });
  });
  it('invalidates arr timestamps when its cache is cleared', () => {
    setRadarrInstances([{ id: 'r1', name: 'Movies', url: 'http://radarr', apiKey: 'key' }]);
    success('arr');
    clearArrItems();
    expect(source('arr')).toMatchObject({ lastSuccessAt: null, outcome: 'unknown' });
  });
  it('invalidates library and arr provenance when configuration changes', () => {
    setRadarrInstances([{ id: 'r1', name: 'Movies', url: 'http://radarr', apiKey: 'key' }]);
    success('arr'); success('library');
    writeSetting('plex_base_url', 'http://other-plex');
    expect(source('library').lastSuccessAt).toBeNull();
    expect(source('arr').lastSuccessAt).toBeNull();
    success('arr');
    setRadarrInstances([{ id: 'r1', name: 'Movies', url: 'http://radarr', apiKey: 'changed' }]);
    expect(source('arr').lastSuccessAt).toBeNull();
  });
  it('records completion only when the job explicitly confirms a full refresh', async () => {
    await runWithState('library', async () => ({ result: 1, message: 'done', refreshComplete: true }));
    const complete = source('library');
    expect(complete.outcome).toBe('complete');
    expect(complete.lastSuccessAt).not.toBeNull();
    await runWithState('library', async () => ({ result: 0, message: 'partial', refreshComplete: false }));
    expect(source('library')).toMatchObject({ outcome: 'incomplete', lastSuccessAt: complete.lastSuccessAt });
    await runWithState('library', async () => { throw new Error('offline'); });
    expect(source('library')).toMatchObject({ outcome: 'error', lastSuccessAt: complete.lastSuccessAt });
  });
  it('is idempotent on existing databases without fabricating legacy provenance', async () => {
    const { applySchema } = await import('./db');
    applySchema(getDb());
    applySchema(getDb());
    expect(source('library').lastSuccessAt).toBeNull();
  });
});