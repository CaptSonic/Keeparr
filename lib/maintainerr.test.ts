import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import {
  addKeep,
  addDelete,
  closeCleanupCampaign,
  createCleanupCampaign,
  reviewCleanupCampaignItem,
  setJobState,
  upsertWatchBatch,
  upsertMediaBatch,
} from './queries';
import {
  getWatchSourceFingerprint,
  getMaintainerrManagedItems,
  setMaintainerrConfig,
  setMaintainerrManagedItems,
  writeSetting,
} from './settings';
import {
  previewMaintainerr,
  syncMaintainerr,
  testMaintainerr,
} from './maintainerr';
import type { MediaBackend } from './mediaserver';

let fakeBackend: MediaBackend;
vi.mock('./mediaserver', () => ({ getBackend: () => fakeBackend }));

const GB = 1024 ** 3;
const BASE = 1_800_000_000;

type Kind = 'movie' | 'show';
interface RemoteCollection {
  id: number;
  title: string;
  type: Kind;
  libraryId: string;
  arrAction: number;
  isActive: boolean;
  deleteAfterDays: number;
  keepInMaintainerrOnly: boolean;
  tagInArr: boolean;
}

const collections: RemoteCollection[] = [
  {
    id: 10, title: 'Keeparr movies', type: 'movie', libraryId: 'movies',
    arrAction: 4, isActive: true, deleteAfterDays: 14,
    keepInMaintainerrOnly: true, tagInArr: false,
  },
  {
    id: 20, title: 'Keeparr shows', type: 'show', libraryId: 'shows',
    arrAction: 4, isActive: true, deleteAfterDays: 14,
    keepInMaintainerrOnly: true, tagInArr: false,
  },
];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function releasedMedia(): void {
  upsertMediaBatch([
    {
      ratingKey: 'movie-1', sectionId: 'movies', libraryKind: 'movie',
      title: 'Movie', year: 2020, thumb: null, sizeBytes: 20 * GB, addedAt: 1,
      guidTmdb: '1', guidTvdb: null,
    },
    {
      ratingKey: 'show-1', sectionId: 'shows', libraryKind: 'show',
      title: 'Show', year: 2021, thumb: null, sizeBytes: 30 * GB, addedAt: 1,
      guidTmdb: null, guidTvdb: '2',
    },
  ]);
  const campaign = createCleanupCampaign({
    name: 'Release', targetBytes: GB, deadlineAt: BASE + 60,
    gracePeriodDays: 0, minScore: 0, createdBy: 'admin',
    watchAvailable: false, arrAvailable: false,
  });
  reviewCleanupCampaignItem(campaign.id, 'movie-1', 'member');
  reviewCleanupCampaignItem(campaign.id, 'show-1', 'member');
  vi.setSystemTime((BASE + 61) * 1000);
  expect(closeCleanupCampaign(campaign.id)).toBe(true);
}

function requesterReleasedMedia(): void {
  upsertMediaBatch([
    {
      ratingKey: 'requester-movie', sectionId: 'movies', libraryKind: 'movie',
      title: 'Requester movie', year: 2022, thumb: null, sizeBytes: 10 * GB, addedAt: 1,
      guidTmdb: '3', guidTvdb: null,
    },
    {
      ratingKey: 'requester-show', sectionId: 'shows', libraryKind: 'show',
      title: 'Requester show', year: 2023, thumb: null, sizeBytes: 15 * GB, addedAt: 1,
      guidTmdb: null, guidTvdb: '4',
    },
  ]);
  addDelete('requester', 'requester-movie');
  addDelete('requester', 'requester-show');
}

function mockMaintainerr(opts: {
  rows?: RemoteCollection[];
  movieMembers?: string[];
  showMembers?: string[];
  invalidMembers?: boolean;
} = {}) {
  const members = new Map<number, Set<string>>([
    [10, new Set(opts.movieMembers ?? [])],
    [20, new Set(opts.showMembers ?? [])],
  ]);
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/collections/overlay-data') {
      return json(opts.rows ?? collections);
    }
    const rule = url.pathname.match(/^\/api\/rules\/collection\/(\d+)$/);
    if (rule) return json({ useRules: false });
    if (url.pathname === '/api/collections/media/') {
      if (opts.invalidMembers) return json({ unexpected: true });
      const id = Number(url.searchParams.get('collectionId'));
      return json([...(members.get(id) ?? [])].map((mediaServerId) => ({ mediaServerId })));
    }
    if (url.pathname === '/api/collections/add' || url.pathname === '/api/collections/remove') {
      const body = JSON.parse(String(init?.body)) as {
        collectionId: number;
        media: { mediaServerId: string }[];
        manual?: boolean;
      };
      writes.push({ path: url.pathname, body });
      const target = members.get(body.collectionId)!;
      for (const row of body.media) {
        if (url.pathname.endsWith('/add')) target.add(row.mediaServerId);
        else target.delete(row.mediaServerId);
      }
      return new Response(null, { status: 201 });
    }
    return json({ error: 'unexpected route' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { members, writes, fetchMock };
}

beforeEach(() => {
  __setTestDbToMemory();
  vi.useFakeTimers();
  vi.setSystemTime(BASE * 1000);
  fakeBackend = {
    listSections: async () => [
      { id: 'movies', title: 'Movies', kind: 'movie', paths: [] },
      { id: 'shows', title: 'Shows', kind: 'show', paths: [] },
    ],
    listSectionItems: async (sectionId) => sectionId === 'movies'
      ? [
          { ratingKey: 'movie-1', title: 'Movie', year: 2020, thumb: null,
            addedAt: 1, guidTmdb: '1', guidTvdb: null, guidImdb: null, sizeBytes: 20 * GB },
          { ratingKey: 'requester-movie', title: 'Requester movie', year: 2022, thumb: null,
            addedAt: 1, guidTmdb: '3', guidTvdb: null, guidImdb: null, sizeBytes: 10 * GB },
        ]
      : [
          { ratingKey: 'show-1', title: 'Show', year: 2021, thumb: null,
            addedAt: 1, guidTmdb: null, guidTvdb: '2', guidImdb: null, sizeBytes: 30 * GB },
          { ratingKey: 'requester-show', title: 'Requester show', year: 2023, thumb: null,
            addedAt: 1, guidTmdb: null, guidTvdb: '4', guidImdb: null, sizeBytes: 15 * GB },
        ],
    itemExists: async () => true,
    recentItems: async () => [],
    showSize: async () => 0,
    getWatchData: async () => null,
  };
  setMaintainerrConfig({
    url: 'http://maintainerr:6246',
    movieCollectionId: 10,
    showCollectionId: 20,
    watchAgeDays: 180,
    enabled: true,
  });
  writeSetting('tautulli_url', 'http://tautulli:8181');
  writeSetting('tautulli_api_key', 'watch-key');
  setJobState('watch', { lastStatus: 'ok', lastRun: BASE });
  writeSetting('watch_source_fingerprint', getWatchSourceFingerprint()!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
afterAll(() => __closeDb());

describe('Maintainerr safe hand-off', () => {
  it('returns a paused empty preview when the hand-off is not configured', async () => {
    setMaintainerrConfig({
      url: '', movieCollectionId: null, showCollectionId: null,
      watchAgeDays: 180, enabled: false,
    });

    const preview = await previewMaintainerr();

    expect(preview).toMatchObject({
      paused: true, pauseReason: 'not_configured', collections: [], items: [],
    });
    expect(preview.summary.add).toBe(0);
  });

  it('discovers collections without writing anything', async () => {
    const { writes } = mockMaintainerr();
    const result = await testMaintainerr('http://maintainerr:6246');
    expect(result).toMatchObject({ ok: true, collections });
    expect(writes).toEqual([]);
  });

  it('reports the Maintainerr endpoint clearly when a request times out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal('fetch', fetchMock);

    const result = await testMaintainerr('http://maintainerr:6246');

    expect(result).toEqual({
      ok: false,
      message: 'Maintainerr /api/collections/overlay-data timed out after 60 seconds.',
    });
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('also maps an aborted Maintainerr request to the endpoint timeout message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('This operation was aborted', 'AbortError'))
    );

    const result = await testMaintainerr('http://maintainerr:6246');

    expect(result.message).toBe(
      'Maintainerr /api/collections/overlay-data timed out after 60 seconds.'
    );
  });

  it('adds released movies and shows as manual collection members only', async () => {
    releasedMedia();
    const { members, writes } = mockMaintainerr();

    await expect(syncMaintainerr()).resolves.toMatchObject({ result: 2 });
    expect([...members.get(10)!]).toEqual(['movie-1']);
    expect([...members.get(20)!]).toEqual(['show-1']);
    expect(writes.map((write) => write.path)).toEqual([
      '/api/collections/add',
      '/api/collections/add',
    ]);
    expect(writes.every((write) => write.body.manual === true)).toBe(true);
    expect(getMaintainerrManagedItems()).toEqual({
      '10': ['movie-1'],
      '20': ['show-1'],
    });
  });

  it('previews the exact add plan without writing membership or ownership', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr();

    const preview = await previewMaintainerr();

    expect(preview.paused).toBe(false);
    expect(preview.summary.add).toBe(2);
    expect(preview.collections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 10, selected: true, add: 1, remove: 0 }),
      expect.objectContaining({ id: 20, selected: true, add: 1, remove: 0 }),
    ]));
    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ratingKey: 'requester-movie', status: 'add', reason: 'never_watched',
      }),
    ]));
    expect(remote.writes).toEqual([]);
    expect(getMaintainerrManagedItems()).toEqual({});
  });

  it('explains keep, recent watch, missing and foreign manual members', async () => {
    requesterReleasedMedia();
    addKeep('protector', 'requester-movie');
    upsertWatchBatch([{
      plexUserId: 'viewer', ratingKey: 'requester-show', plays: 1,
      lastWatched: BASE - 10 * 86400,
    }]);
    const remote = mockMaintainerr({ movieMembers: ['foreign'] });
    fakeBackend.itemExists = async (ratingKey) => ratingKey !== 'requester-show';

    const preview = await previewMaintainerr();

    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ ratingKey: 'requester-movie', status: 'blocked_keep' }),
      expect.objectContaining({ ratingKey: 'requester-show', status: 'missing' }),
      expect.objectContaining({ ratingKey: 'foreign', status: 'manual' }),
    ]));
    expect(remote.writes).toEqual([]);
  });

  it('keeps foreign manual members unchanged when watch data is not ready', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr({ movieMembers: ['requester-movie'] });
    writeSetting('watch_source_fingerprint', 'different-source');

    const preview = await previewMaintainerr();

    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ratingKey: 'requester-movie', status: 'manual', reason: 'existing_foreign_member',
      }),
    ]));
    expect(remote.writes).toEqual([]);
  });

  it('keeps a missing foreign manual member marked as untouched', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr({ movieMembers: ['requester-movie'] });
    fakeBackend.itemExists = async (ratingKey) => ratingKey !== 'requester-movie';

    const preview = await previewMaintainerr();

    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ratingKey: 'requester-movie', status: 'manual', reason: 'existing_foreign_member',
      }),
    ]));
    expect(preview.collections.find((row) => row.id === 10)?.remove).toBe(0);
    expect(remote.writes).toEqual([]);
  });

  it('previews an inventory failure as paused without planning removals', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr({ movieMembers: ['requester-movie'] });
    setMaintainerrManagedItems({ '10': ['requester-movie'] });
    fakeBackend.itemExists = async () => { throw new Error('offline'); };

    const preview = await previewMaintainerr();

    expect(preview).toMatchObject({ paused: true, pauseReason: 'inventory_unavailable' });
    expect(preview.collections.find((row) => row.id === 10)?.remove).toBe(0);
    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ ratingKey: 'requester-movie', status: 'paused' }),
    ]));
    expect(remote.writes).toEqual([]);
    expect(getMaintainerrManagedItems()).toEqual({ '10': ['requester-movie'] });
  });

  it('previews a managed recent title as removal with its reason', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr({ movieMembers: ['requester-movie'] });
    setMaintainerrManagedItems({ '10': ['requester-movie'] });
    upsertWatchBatch([{
      plexUserId: 'viewer', ratingKey: 'requester-movie', plays: 1,
      lastWatched: BASE - 10 * 86400,
    }]);

    const preview = await previewMaintainerr();

    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ratingKey: 'requester-movie', status: 'remove', reason: 'watched_too_recently',
      }),
    ]));
    expect(preview.collections.find((row) => row.id === 10)?.remove).toBe(1);
    expect(remote.writes).toEqual([]);
  });

  it('previews removal from a collection that is no longer selected', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    remote.writes.length = 0;
    setMaintainerrConfig({
      url: 'http://maintainerr:6246', movieCollectionId: null,
      showCollectionId: 20, watchAgeDays: 180, enabled: true,
    });

    const preview = await previewMaintainerr();

    expect(preview.collections.find((row) => row.id === 10)).toMatchObject({
      selected: false, remove: 1,
    });
    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ratingKey: 'requester-movie', collectionId: 10,
        status: 'remove', reason: 'outside_selected_library',
      }),
    ]));
    expect(remote.writes).toEqual([]);
  });

  it('adds direct requester OK-to-delete marks without requiring a campaign', async () => {
    requesterReleasedMedia();
    const { members } = mockMaintainerr();

    const result = await syncMaintainerr();

    expect([...members.get(10)!]).toEqual(['requester-movie']);
    expect([...members.get(20)!]).toEqual(['requester-show']);
    expect(result).toMatchObject({ result: 2 });
    expect(result.message).toContain('2 requester release(s)');
    expect(result.message).toContain('0 closed-campaign release(s)');
  });

  it('does not add releases that disappeared since the last full library scan', async () => {
    requesterReleasedMedia();
    fakeBackend.itemExists = async (ratingKey) => ratingKey !== 'requester-movie';
    const { members } = mockMaintainerr();

    const result = await syncMaintainerr();

    expect([...members.get(10)!]).toEqual([]);
    expect([...members.get(20)!]).toEqual(['requester-show']);
    expect(result.message).toContain('1 no longer on media server');
  });

  it('freezes owned memberships when live inventory cannot be read safely', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    expect([...remote.members.get(10)!]).toEqual(['requester-movie']);
    fakeBackend.itemExists = async () => { throw new Error('server unavailable'); };

    const result = await syncMaintainerr();

    expect([...remote.members.get(10)!]).toEqual(['requester-movie']);
    expect([...remote.members.get(20)!]).toEqual(['requester-show']);
    expect(result.message).toContain('existing memberships left unchanged');
    expect(getMaintainerrManagedItems()).toEqual({
      '10': ['requester-movie'],
      '20': ['requester-show'],
    });
  });

  it('includes never-watched and stale titles but excludes recently watched titles', async () => {
    requesterReleasedMedia();
    upsertWatchBatch([
      {
        plexUserId: 'viewer-a',
        ratingKey: 'requester-movie',
        plays: 1,
        lastWatched: BASE - 200 * 86400,
      },
      {
        plexUserId: 'viewer-b',
        ratingKey: 'requester-show',
        plays: 1,
        lastWatched: BASE - 30 * 86400,
      },
    ]);
    const { members } = mockMaintainerr();

    const result = await syncMaintainerr();

    expect([...members.get(10)!]).toEqual(['requester-movie']);
    expect([...members.get(20)!]).toEqual([]);
    expect(result.message).toContain('1 watched within 180 day(s)');
  });

  it('uses the newest watch across all users', async () => {
    requesterReleasedMedia();
    upsertWatchBatch([
      {
        plexUserId: 'old-viewer',
        ratingKey: 'requester-movie',
        plays: 1,
        lastWatched: BASE - 300 * 86400,
      },
      {
        plexUserId: 'recent-viewer',
        ratingKey: 'requester-movie',
        plays: 1,
        lastWatched: BASE - 10 * 86400,
      },
    ]);
    const { members } = mockMaintainerr();

    await syncMaintainerr();

    expect([...members.get(10)!]).toEqual([]);
    expect([...members.get(20)!]).toEqual(['requester-show']);
  });

  it('applies the live keep veto to direct requester releases', async () => {
    requesterReleasedMedia();
    addKeep('protector', 'requester-movie');
    const { members } = mockMaintainerr();

    const result = await syncMaintainerr();

    expect([...members.get(10)!]).toEqual([]);
    expect([...members.get(20)!]).toEqual(['requester-show']);
    expect(result.message).toContain('1 requester release(s)');
  });

  it('deduplicates a title released by requester and closed campaign', async () => {
    releasedMedia();
    addDelete('requester', 'movie-1');
    const { members } = mockMaintainerr();

    const result = await syncMaintainerr();

    expect([...members.get(10)!]).toEqual(['movie-1']);
    expect(result.message).toContain('1 requester release(s)');
    expect(result.message).toContain('2 closed-campaign release(s)');
  });

  it('removes Keeparr-owned membership first after a later keep', async () => {
    releasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    remote.writes.length = 0;

    addKeep('protector', 'movie-1');
    await syncMaintainerr();

    expect([...remote.members.get(10)!]).toEqual([]);
    expect([...remote.members.get(20)!]).toEqual(['show-1']);
    expect(remote.writes).toHaveLength(1);
    expect(remote.writes[0]).toMatchObject({ path: '/api/collections/remove' });
  });

  it('removes Keeparr-owned memberships when the hand-off is disabled', async () => {
    releasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    remote.writes.length = 0;
    setMaintainerrConfig({
      url: 'http://maintainerr:6246',
      movieCollectionId: 10,
      showCollectionId: 20,
      watchAgeDays: 180,
      enabled: false,
    });

    await syncMaintainerr();
    expect([...remote.members.get(10)!]).toEqual([]);
    expect([...remote.members.get(20)!]).toEqual([]);
    expect(remote.writes.map((write) => write.path)).toEqual([
      '/api/collections/remove',
      '/api/collections/remove',
    ]);
    expect(getMaintainerrManagedItems()).toEqual({});
  });

  it('never claims or removes a member that was already present manually', async () => {
    releasedMedia();
    const remote = mockMaintainerr({ movieMembers: ['movie-1'] });
    await syncMaintainerr();
    expect(getMaintainerrManagedItems()['10']).toEqual([]);

    addKeep('protector', 'movie-1');
    await syncMaintainerr();
    expect([...remote.members.get(10)!]).toEqual(['movie-1']);
    expect(remote.writes.some((write) => write.path.endsWith('/remove'))).toBe(false);
  });

  it('withdraws Keeparr-owned memberships when watch data is not ready', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    expect([...remote.members.get(10)!]).toEqual(['requester-movie']);
    expect([...remote.members.get(20)!]).toEqual(['requester-show']);
    writeSetting('watch_source_fingerprint', 'stale-source');

    const result = await syncMaintainerr();

    expect([...remote.members.get(10)!]).toEqual([]);
    expect([...remote.members.get(20)!]).toEqual([]);
    expect(result.message).toContain('watch data not ready');
    expect(getMaintainerrManagedItems()).toEqual({ '10': [], '20': [] });
  });

  it('keeps using the last trusted watch cache while its refresh is running', async () => {
    requesterReleasedMedia();
    const remote = mockMaintainerr();
    await syncMaintainerr();
    remote.writes.length = 0;
    setJobState('watch', { lastStatus: 'running' });

    const result = await syncMaintainerr();

    expect([...remote.members.get(10)!]).toEqual(['requester-movie']);
    expect([...remote.members.get(20)!]).toEqual(['requester-show']);
    expect(remote.writes).toEqual([]);
    expect(result.message).not.toContain('watch data not ready');
  });

  it('allows Maintainerr to own the configured collection action', async () => {
    releasedMedia();
    const destructive = collections.map((row) =>
      row.id === 10 ? { ...row, arrAction: 0 } : row
    );
    const { members, writes } = mockMaintainerr({ rows: destructive });

    await expect(syncMaintainerr()).resolves.toMatchObject({ result: 2 });
    expect([...members.get(10)!]).toEqual(['movie-1']);
    expect(writes.every((write) => write.path.endsWith('/add'))).toBe(true);
  });

  it('allows Maintainerr to expose its collection on the media server', async () => {
    releasedMedia();
    const visible = collections.map((row) =>
      row.id === 10 ? { ...row, keepInMaintainerrOnly: false } : row
    );
    const { members } = mockMaintainerr({ rows: visible });
    await expect(syncMaintainerr()).resolves.toMatchObject({ result: 2 });
    expect([...members.get(10)!]).toEqual(['movie-1']);
  });

  it('blocks arr-tag side effects', async () => {
    releasedMedia();
    const tagged = collections.map((row) =>
      row.id === 10 ? { ...row, tagInArr: true } : row
    );
    const { writes } = mockMaintainerr({ rows: tagged });
    await expect(syncMaintainerr()).rejects.toThrow('sync blocked');
    expect(writes).toEqual([]);
  });

  it('fails closed before writing when a membership response is invalid', async () => {
    releasedMedia();
    const { writes } = mockMaintainerr({ invalidMembers: true });
    await expect(syncMaintainerr()).rejects.toThrow('invalid members');
    expect(writes).toEqual([]);
  });

  it('rejects using the same collection for movies and shows', async () => {
    setMaintainerrConfig({
      url: 'http://maintainerr:6246',
      movieCollectionId: 10,
      showCollectionId: 10,
      watchAgeDays: 180,
      enabled: true,
    });
    const { writes } = mockMaintainerr();
    await expect(syncMaintainerr()).rejects.toThrow('must be different');
    expect(writes).toEqual([]);
  });

  it('blocks a Maintainerr URL change while remote memberships are owned', () => {
    setMaintainerrManagedItems({ '10': ['movie-1'] });
    expect(() => setMaintainerrConfig({
        url: 'http://another-maintainerr:6246',
        movieCollectionId: 10,
        showCollectionId: 20,
        watchAgeDays: 180,
        enabled: true,
      })
    ).toThrow('Disable the Maintainerr hand-off');
    expect(getMaintainerrManagedItems()).toEqual({ '10': ['movie-1'] });
  });
});