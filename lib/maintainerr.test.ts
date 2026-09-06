import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import {
  addKeep,
  addDelete,
  closeCleanupCampaign,
  createCleanupCampaign,
  reviewCleanupCampaignItem,
  upsertMediaBatch,
} from './queries';
import {
  getMaintainerrManagedItems,
  setMaintainerrConfig,
  setMaintainerrManagedItems,
} from './settings';
import {
  MAINTAINERR_DO_NOTHING,
  syncMaintainerr,
  testMaintainerr,
} from './maintainerr';

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
    arrAction: MAINTAINERR_DO_NOTHING, isActive: true, deleteAfterDays: 14,
    keepInMaintainerrOnly: true, tagInArr: false,
  },
  {
    id: 20, title: 'Keeparr shows', type: 'show', libraryId: 'shows',
    arrAction: MAINTAINERR_DO_NOTHING, isActive: true, deleteAfterDays: 14,
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
  setMaintainerrConfig({
    url: 'http://maintainerr:6246',
    movieCollectionId: 10,
    showCollectionId: 20,
    enabled: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
afterAll(() => __closeDb());

describe('Maintainerr safe hand-off', () => {
  it('discovers collections without writing anything', async () => {
    const { writes } = mockMaintainerr();
    const result = await testMaintainerr('http://maintainerr:6246');
    expect(result).toMatchObject({ ok: true, collections });
    expect(writes).toEqual([]);
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

  it('blocks every write when a selected collection is not Do nothing', async () => {
    releasedMedia();
    const unsafe = collections.map((row) =>
      row.id === 10 ? { ...row, arrAction: 0 } : row
    );
    const { writes } = mockMaintainerr({ rows: unsafe });

    await expect(syncMaintainerr()).rejects.toThrow('not set to Do nothing');
    expect(writes).toEqual([]);
  });

  it('blocks external media-server collection or arr-tag side effects', async () => {
    releasedMedia();
    for (const unsafe of [
      collections.map((row) => row.id === 10 ? { ...row, keepInMaintainerrOnly: false } : row),
      collections.map((row) => row.id === 10 ? { ...row, tagInArr: true } : row),
    ]) {
      const { writes } = mockMaintainerr({ rows: unsafe });
      await expect(syncMaintainerr()).rejects.toThrow('sync blocked');
      expect(writes).toEqual([]);
    }
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
        enabled: true,
      })
    ).toThrow('Disable the Maintainerr hand-off');
    expect(getMaintainerrManagedItems()).toEqual({ '10': ['movie-1'] });
  });
});