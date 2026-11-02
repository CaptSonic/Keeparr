import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory, getDb } from './db';
import { addKeep, recordMaintainerrHistory, upsertMediaBatch, upsertUser } from './queries';
import { getSonarrInstances, setSonarrInstances } from './settings';
import { cleanupSonarrHandoffs, trackSonarrHandoff } from './sonarr-cleanup';
import { deleteSonarrSeries, listSonarrSeries } from './arr';

vi.mock('./arr', () => ({ deleteSonarrSeries: vi.fn(), listSonarrSeries: vi.fn() }));

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
    await expect(cleanupSonarrHandoffs()).rejects.toThrow('offline');
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('fails closed on malformed source data', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockResolvedValueOnce([{ id: 1, title: 'Bad' }]);
    await expect(cleanupSonarrHandoffs()).rejects.toThrow('Unsafe');
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
    await expect(cleanupSonarrHandoffs()).rejects.toThrow('timeout');
    expect(await cleanupSonarrHandoffs()).toBe(1);
  });
  it('blocks deletion when the source series returns during target lookup', async () => {
    await observedHandoff();
    let sourceReads = 0;
    vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd'
      ? (++sourceReads === 1 ? [] : [{ id: 7, title: 'Returned', tvdbId: 123 }])
      : [{ id: 99, title: '4K', tvdbId: 123 }]);
    expect(await cleanupSonarrHandoffs()).toBe(0);
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
  it('blocks an ambiguous target TVDB match', async () => {
    await observedHandoff();
    vi.mocked(listSonarrSeries).mockImplementation(async (inst) => inst.id === 'hd' ? [] : [
      { id: 99, title: 'A', tvdbId: 123 }, { id: 100, title: 'B', tvdbId: 123 },
    ]);
    await expect(cleanupSonarrHandoffs()).rejects.toThrow('Ambiguous');
    expect(deleteSonarrSeries).not.toHaveBeenCalled();
  });
});