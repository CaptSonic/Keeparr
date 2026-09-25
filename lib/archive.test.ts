import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import { executeArchive, previewArchive } from './archive';
import {
  addDelete,
  addKeep,
  replaceArrItems,
  upsertMediaBatch,
  type UpsertMediaInput,
} from './queries';
import { setSonarrInstances } from './settings';

const item: UpsertMediaInput = {
  ratingKey: 'show',
  sectionId: '1',
  libraryKind: 'show',
  title: 'Show',
  year: 2020,
  thumb: null,
  sizeBytes: 300,
  addedAt: 1,
  guidTmdb: null,
  guidTvdb: '123',
  guidImdb: 'tt123',
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  __setTestDbToMemory();
  upsertMediaBatch([item]);
  addDelete('requester', 'show', 'archive_existing');
  setSonarrInstances([
    { id: 's1', name: 'Sonarr', url: 'http://sonarr', apiKey: 'key' },
  ]);
  vi.restoreAllMocks();
});

afterAll(() => __closeDb());

describe('Sonarr archive workflow', () => {
  it('lets a remove_title decision veto archive_existing', async () => {
    addDelete('other', 'show', 'remove_title');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await previewArchive('show', 'admin')).toMatchObject({
      ready: false,
      reason: 'mode_not_supported',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks on a global keep before contacting Sonarr', async () => {
    addKeep('other', 'show');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await previewArchive('show', 'admin')).toMatchObject({
      ready: false,
      reason: 'keep_veto',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the synchronized Sonarr instance when the same series exists twice', async () => {
    setSonarrInstances([
      { id: 's1', name: 'Primary', url: 'http://primary', apiKey: 'key1' },
      { id: 's2', name: 'Archive', url: 'http://archive', apiKey: 'key2' },
    ]);
    replaceArrItems([
      {
        ratingKey: 'show',
        source: 'sonarr',
        instanceId: 's2',
        instanceName: 'Archive',
        arrId: 22,
        monitored: true,
        status: 'ended',
        quality: 'HD-1080p',
        qualityKind: 'profile',
        rootFolder: '/archive',
        arrSizeBytes: 300,
        tags: [],
      },
    ]);
    const preferredSeries = {
      id: 22,
      title: 'Show',
      tvdbId: 123,
      imdbId: 'tt123',
      seasons: [{ seasonNumber: 1, monitored: true }],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://archive/api/v3/series/22') return json(preferredSeries);
      if (url.includes('/episodefile?')) return json([{ id: 11, size: 300 }]);
      if (url.includes('/episode?')) {
        return json([{ id: 101, episodeFileId: 11, hasFile: true, monitored: true }]);
      }
      if (url.includes('/queue?')) return json({ records: [] });
      return json({ unexpected: url }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await previewArchive('show', 'admin')).toMatchObject({
      ready: true,
      instanceId: 's2',
      instanceName: 'Archive',
      seriesId: 22,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      'http://primary/api/v3/series'
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      'http://archive/api/v3/series'
    );
  });

  it('still blocks a true ambiguity when no synchronized target exists', async () => {
    setSonarrInstances([
      { id: 's1', name: 'Primary', url: 'http://primary', apiKey: 'key1' },
      { id: 's2', name: 'Archive', url: 'http://archive', apiKey: 'key2' },
    ]);
    const duplicate = { id: 7, title: 'Show', tvdbId: 123, imdbId: 'tt123' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/api/v3/series')) return json([duplicate]);
        return json({}, 404);
      })
    );

    expect(await previewArchive('show', 'admin')).toMatchObject({
      ready: false,
      reason: 'sonarr_match_ambiguous',
    });
  });

  it('previews, revalidates, updates monitoring, bulk deletes, and verifies', async () => {
    let deleted = false;
    let updated = false;
    const monitorWrites: { episodeIds: number[]; monitored: boolean }[] = [];
    const episodeState = new Map<number, { monitored: boolean; episodeFileId?: number }>([
      [101, { monitored: true, episodeFileId: 11 }],
      [102, { monitored: true, episodeFileId: 12 }],
      [103, { monitored: true, episodeFileId: undefined }],
    ]);
    const series = () => ({
      id: 7,
      title: 'Show',
      tvdbId: 123,
      imdbId: 'tt123',
      monitored: updated,
      monitorNewItems: updated ? 'all' : 'none',
      seasons: [
        { seasonNumber: 0, monitored: !updated },
        { seasonNumber: 1, monitored: !updated },
      ],
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/api/v3/series') && method === 'GET') return json([series()]);
      if (url.endsWith('/api/v3/series/7') && method === 'GET') return json(series());
      if (url.includes('/api/v3/episodefile?')) {
        return json(
          deleted
            ? []
            : [
                { id: 11, seriesId: 7, seasonNumber: 0, size: 100 },
                { id: 12, seriesId: 7, seasonNumber: 1, size: 200 },
              ]
        );
      }
      if (url.includes('/api/v3/episode?') && method === 'GET') {
        return json(
          [...episodeState.entries()].map(([id, state]) => ({
            id,
            seriesId: 7,
            seasonNumber: id === 101 ? 0 : 1,
            episodeNumber: id - 100,
            monitored: state.monitored,
            hasFile: state.episodeFileId != null,
            episodeFileId: state.episodeFileId,
          }))
        );
      }
      if (url.includes('/api/v3/queue?')) return json({ records: [] });
      if (url.endsWith('/api/v3/series/7') && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        updated =
          body.monitored === true &&
          body.monitorNewItems === 'all' &&
          body.seasons.every((season: { monitored: boolean }) => !season.monitored);
        return json(body);
      }
      if (url.endsWith('/api/v3/episode/monitor') && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as {
          episodeIds: number[];
          monitored: boolean;
        };
        monitorWrites.push(body);
        for (const episodeId of body.episodeIds) {
          episodeState.get(episodeId)!.monitored = body.monitored;
        }
        return json({});
      }
      if (url.endsWith('/api/v3/episodefile/bulk') && method === 'DELETE') {
        expect(JSON.parse(String(init?.body))).toEqual({ episodeFileIds: [11, 12] });
        deleted = true;
        // Simulate Sonarr's "Unmonitor Deleted Episodes" behavior.
        for (const state of episodeState.values()) {
          if (state.episodeFileId != null) {
            state.episodeFileId = undefined;
            state.monitored = false;
          }
        }
        return new Response(null, { status: 204 });
      }
      return json({ unexpected: url }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const preview = await previewArchive('show', 'admin');
    expect(preview).toMatchObject({
      ready: true,
      fileCount: 2,
      totalBytes: 300,
      episodeIds: [101, 102],
      episodeFileEpisodeMap: [
        { episodeId: 101, episodeFileId: 11 },
        { episodeId: 102, episodeFileId: 12 },
      ],
      seasonNumbers: [0, 1],
    });
    const result = await executeArchive(preview.runId!, 'admin');
    expect(result).toMatchObject({ ok: true, deletedFiles: 2, archivedEpisodes: 2 });
    expect(updated).toBe(true);
    expect(deleted).toBe(true);
    expect(monitorWrites).toEqual([
      { episodeIds: [101, 102, 103], monitored: false },
      { episodeIds: [101, 102], monitored: true },
    ]);
    expect([...episodeState.entries()]).toEqual([
      [101, { monitored: true, episodeFileId: undefined }],
      [102, { monitored: true, episodeFileId: undefined }],
      [103, { monitored: false, episodeFileId: undefined }],
    ]);
  });

  it('blocks execution when the episode-file plan changed', async () => {
    let fileCalls = 0;
    const series = {
      id: 7,
      title: 'Show',
      tvdbId: 123,
      seasons: [{ seasonNumber: 1, monitored: true }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/api/v3/series')) return json([series]);
        if (url.endsWith('/api/v3/series/7')) return json(series);
        if (url.includes('/episodefile?')) {
          fileCalls++;
          return json(fileCalls === 1 ? [{ id: 1, size: 1 }] : [{ id: 2, size: 1 }]);
        }
        if (url.includes('/episode?')) {
          return json([{ id: 101, episodeFileId: fileCalls === 1 ? 1 : 2 }]);
        }
        if (url.includes('/queue?')) return json({ records: [] });
        return json({}, 404);
      })
    );

    const preview = await previewArchive('show', 'admin');
    expect(await executeArchive(preview.runId!, 'admin')).toMatchObject({
      ok: false,
      reason: 'stale_preview',
    });
  });

  it('blocks execution when the same file is assigned to a different episode', async () => {
    let episodeCalls = 0;
    const series = {
      id: 7,
      title: 'Show',
      tvdbId: 123,
      seasons: [{ seasonNumber: 1, monitored: true }],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v3/series')) return json([series]);
      if (url.endsWith('/api/v3/series/7')) return json(series);
      if (url.includes('/episodefile?')) return json([{ id: 11, size: 1 }]);
      if (url.includes('/episode?')) {
        episodeCalls++;
        return json([
          { id: episodeCalls === 1 ? 101 : 102, episodeFileId: 11, hasFile: true },
        ]);
      }
      if (url.includes('/queue?')) return json({ records: [] });
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const preview = await previewArchive('show', 'admin');
    expect(preview).toMatchObject({ ready: true, episodeIds: [101] });
    expect(await executeArchive(preview.runId!, 'admin')).toMatchObject({
      ok: false,
      reason: 'stale_preview',
    });
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    ).toBe(false);
  });

  it('fails final verification if a never-downloaded episode becomes monitored', async () => {
    let deleted = false;
    let updated = false;
    const series = () => ({
      id: 7,
      title: 'Show',
      tvdbId: 123,
      monitored: updated,
      monitorNewItems: updated ? 'all' : 'none',
      seasons: [{ seasonNumber: 1, monitored: !updated }],
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/api/v3/series') && method === 'GET') return json([series()]);
      if (url.endsWith('/api/v3/series/7') && method === 'GET') return json(series());
      if (url.includes('/episodefile?')) {
        return json(deleted ? [] : [{ id: 11, seriesId: 7, size: 100 }]);
      }
      if (url.includes('/episode?') && method === 'GET') {
        return json([
          {
            id: 101,
            monitored: deleted,
            hasFile: !deleted,
            episodeFileId: deleted ? undefined : 11,
          },
          { id: 102, monitored: deleted, hasFile: false },
        ]);
      }
      if (url.includes('/queue?')) return json({ records: [] });
      if (url.endsWith('/series/7') && method === 'PUT') {
        updated = true;
        return json(JSON.parse(String(init?.body)));
      }
      if (url.endsWith('/episode/monitor') && method === 'PUT') return json({});
      if (url.endsWith('/episodefile/bulk') && method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const preview = await previewArchive('show', 'admin');
    expect(await executeArchive(preview.runId!, 'admin')).toMatchObject({
      ok: false,
      reason: 'sonarr_unavailable',
      message: expect.stringContaining('verification failed'),
    });
  });
});