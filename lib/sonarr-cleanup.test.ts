import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory, getDb } from './db';
import { addKeep, recordMaintainerrHistory, replaceArrItems, replaceArrUnmatched, upsertMediaBatch, upsertUser } from './queries';
import { getSonarrInstances, setSonarrInstances } from './settings';
import { cleanupSonarrHandoffs, trackSonarrHandoff } from './sonarr-cleanup';
import { deleteSonarrSeries, findSonarrSeriesByTvdbId, listSonarrSeries } from './arr';

vi.mock('./arr', () => ({ deleteSonarrSeries: vi.fn(), findSonarrSeriesByTvdbId: vi.fn(), listSonarrSeries: vi.fn() }));

beforeEach(() => {
  __setTestDbToMemory();
  vi.resetAllMocks();
  setSonarrInstances([
    { id: 'hd', name: 'Sonarr', url: 'http://hd', apiKey: 'secret' },
    { id: '4k', name: 'Sonarr4k', url: 'http://4k', apiKey: 'secret', deleteAfterSourceId: 'hd' },
  ]);
  upsertMediaBatch([{ ratingKey: 'show', sectionId: '1', libraryKind: 'show', title: 'Show',
    year: 2020, thumb: null, sizeBytes: 100, addedAt: 1, guidTvdb: '123', guidTmdb: null }]);
  vi.mocked(deleteSonarrSeries).mockResolvedValue();
  vi.mocked(findSonarrSeriesByTvdbId).mockResolvedValue([]);
  vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd'
    ? [{ id: 7, title: 'Show', tvdbId: 123 }]
    : [{ id: 99, title: 'Different title', tvdbId: 123 }]);
});
afterAll(__closeDb);

function handoff(action: 'add' | 'remove' = 'add') {
  trackSonarrHandoff('show', action);
  recordMaintainerrHistory({ eventType: action === 'add' ? 'membership_added' : 'membership_removed',
    ratingKey: 'show', libraryKind: 'show', action, reason: 'test' });
}
async function observedHandoff() {
  handoff();
  expect(await cleanupSonarrHandoffs()).toBe(0);
  vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd'
    ? [] : [{ id: 99, title: 'Show 4K', tvdbId: 123 }]);
}

describe('Maintainerr Sonarr follow-up deletion', () => {
  it('deletes the TVDB-matched target only after the source disappears, exactly once', async () => {
    await observedHandoff();
    expect(await cleanupSonarrHandoffs()).toBe(1);
    expect(deleteSonarrSeries).toHaveBeenCalledExactlyOnceWith(getSonarrInstances()[1], 99);
    expect(await cleanupSonarrHandoffs()).toBe(0);
  });
  it('never touches titles without a confirmed hand-off', async () => {
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(listSonarrSeries).not.toHaveBeenCalled();
  });
  it('does not treat pre-existing source absence as a removal', async () => {
    handoff();
    vi.mocked(listSonarrSeries).mockResolvedValue([]);
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('fails closed on a source error and retains pending work for retry', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockRejectedValueOnce(new Error('offline'));
    const report = { errors: 0 };
    expect(await cleanupSonarrHandoffs(report)).toBe(0);
    expect(report.errors).toBe(1);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('fails closed on malformed source data', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockResolvedValueOnce([{ id: 1, title: 'Bad' }]);
    const report = { errors: 0 };
    expect(await cleanupSonarrHandoffs(report)).toBe(0);
    expect(report.errors).toBe(1);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('cancels pending deletion on membership revocation', async () => {
    await observedHandoff();
    handoff('remove');
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('vetoes a new Keep', async () => {
    await observedHandoff();
    upsertUser({ plexUserId: 'user', username: 'User', email: null, thumb: null, isAdmin: false });
    addKeep('user', 'show');
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('survives Plex removal and audit pruning', async () => {
    await observedHandoff();
    getDb().exec("DELETE FROM media_items; DELETE FROM maintainerr_history");
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('does not reuse pending work after the target URL changes', async () => {
    await observedHandoff();
    setSonarrInstances(getSonarrInstances().map((inst) => inst.id === '4k' ? { ...inst, url: 'http://other' } : inst));
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('retains pending work when deletion fails', async () => {
    await observedHandoff();
    vi.mocked(deleteSonarrSeries).mockRejectedValueOnce(new Error('timeout'));
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('blocks deletion when the source series returns during target lookup', async () => {
    await observedHandoff();
    vi.mocked(findSonarrSeriesByTvdbId).mockResolvedValue([{ id: 7, title: 'Returned', tvdbId: 123 }]);
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('uses one full source read and a fresh targeted check before deleting', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockClear();
    expect(await cleanupSonarrHandoffs()).toBe(1);
    expect(listSonarrSeries).toHaveBeenCalledTimes(2);
    expect(listSonarrSeries).toHaveBeenCalledWith(getSonarrInstances()[0]);
    expect(listSonarrSeries).toHaveBeenCalledWith(getSonarrInstances()[1]);
    expect(findSonarrSeriesByTvdbId).toHaveBeenCalledExactlyOnceWith(getSonarrInstances()[0], 123);
  });
  it('retains pending work if the final targeted source check fails', async () => {
    await observedHandoff();
    vi.mocked(findSonarrSeriesByTvdbId).mockRejectedValueOnce(new Error('offline'));
    const report = { errors: 0 };
    expect(await cleanupSonarrHandoffs(report)).toBe(0);
    expect(report.errors).toBe(1);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
    expect(getDb().prepare('SELECT * FROM maintainerr_sonarr_cleanup').all()).toHaveLength(1);
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('blocks an ambiguous target TVDB match', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd' ? [] : [
      { id: 99, title: 'A', tvdbId: 123 }, { id: 100, title: 'B', tvdbId: 123 },
    ]);
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('rechecks revocation during a network read before deleting', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockImplementation(async (inst) => {
      if (inst.id === 'hd') return [];
      trackSonarrHandoff('show', 'remove');
      return [{ id: 99, title: 'Show 4K', tvdbId: 123 }];
    });
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('removes only confirmed deleted target cache rows even without a later refresh', async () => {
    await observedHandoff();
    replaceArrItems([{ ratingKey: 'show', source: 'sonarr', instanceId: '4k', instanceName: '4K',
      arrId: 99, monitored: true, status: 'ended', quality: '4K', qualityKind: 'profile',
      rootFolder: '/tv', arrSizeBytes: 100, tags: [] }]);
    replaceArrUnmatched([
      { source: 'sonarr', instanceId: '4k', instanceName: '4K', title: 'Deleted', extKind: 'tvdb', extId: '123', sizeBytes: 100 },
      { source: 'sonarr', instanceId: 'hd', instanceName: 'HD', title: 'Other source', extKind: 'tvdb', extId: '123', sizeBytes: 100 },
    ]);
    expect(await cleanupSonarrHandoffs()).toBe(1);
    expect(getDb().prepare('SELECT * FROM arr_items').all()).toEqual([]);
    expect(getDb().prepare('SELECT instance_id FROM arr_unmatched').all()).toEqual([{ instance_id: 'hd' }]);
  });
  it('continues other series after a failed deletion and logs the outcome', async () => {
    await observedHandoff();
    upsertMediaBatch([{ ratingKey: 'second', sectionId: '1', libraryKind: 'show', title: 'Second',
      year: 2021, thumb: null, sizeBytes: 100, addedAt: 1, guidTvdb: '456', guidTmdb: null }]);
    trackSonarrHandoff('second', 'add');
    getDb().exec('UPDATE maintainerr_sonarr_cleanup SET source_seen = 1');
    vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd' ? [] : [
      { id: 99, title: 'Show 4K', tvdbId: 123 }, { id: 100, title: 'Second 4K', tvdbId: 456 },
    ]);
    vi.mocked(deleteSonarrSeries).mockRejectedValueOnce(new Error('secret-url'));
    const report = { errors: 0 };
    expect(await cleanupSonarrHandoffs(report)).toBe(1);
    expect(report.errors).toBe(1);
    expect(deleteSonarrSeries).toHaveBeenCalledTimes(2);
    expect(getDb().prepare('SELECT rating_key FROM maintainerr_sonarr_cleanup').all()).toEqual([{ rating_key: 'show' }]);
    const logs = getDb().prepare("SELECT message FROM logs WHERE source = 'sonarr-cleanup'").all();
    expect(JSON.stringify(logs)).toContain('Second 4K');
    expect(JSON.stringify(logs)).not.toContain('secret-url');
  });
});