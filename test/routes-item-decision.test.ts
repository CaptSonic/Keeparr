import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, savedMock } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(), savedMock: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));
vi.mock('@/lib/maintainerr', () => ({ savedMaintainerrPreview: savedMock }));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { applyKeep, removeKeep, upsertMediaBatch, upsertUser } from '@/lib/queries';
import { defaultMaintainerrRules } from '@/lib/maintainerr-rules';
import { GET } from '@/app/api/item-decision/route';

const request = (key = '1') => new Request(`http://localhost/api/item-decision?ratingKey=${encodeURIComponent(key)}`);
async function login(id: string, isAdmin = false) {
  upsertUser({ plexUserId: id, username: id, email: null, thumb: null, isAdmin });
  await setSessionCookie(id);
}
beforeEach(() => {
  cookieJar.clear(); savedMock.mockReset(); savedMock.mockReturnValue(null);
  __setTestDbToMemory();
  upsertMediaBatch([{
    ratingKey: '1', sectionId: '1', libraryKind: 'movie', title: 'Film', year: 2020,
    thumb: null, sizeBytes: 100, addedAt: 1, guidTmdb: null, guidTvdb: null,
  }]);
});
afterAll(() => __closeDb());

describe('GET /api/item-decision', () => {
  it('authenticates before accessing decision data', async () => {
    expect((await GET(request())).status).toBe(401);
    expect(savedMock).not.toHaveBeenCalled();
  });
  it('validates keys and rejects unknown items', async () => {
    await login('member');
    expect((await GET(request(''))).status).toBe(400);
    expect((await GET(request('x'.repeat(513)))).status).toBe(400);
    expect((await GET(request('unknown'))).status).toBe(404);
    expect(savedMock).not.toHaveBeenCalled();
  });
  it('returns fresh anonymous Keep protection to members without reading admin plans', async () => {
    await login('other'); applyKeep('other', '1');
    await login('member');
    const response = await GET(request());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ kept: true, keptByMe: false, admin: false, maintainerr: null, freshness: null });
    expect(savedMock).not.toHaveBeenCalled();
    removeKeep('other', '1');
    expect(await (await GET(request())).json()).toMatchObject({ kept: false, keptByMe: false });
    applyKeep('member', '1');
    expect(await (await GET(request())).json()).toMatchObject({ kept: true, keptByMe: true });
  });
  it('returns no fabricated decision without a saved plan', async () => {
    await login('admin', true);
    const response = await (await GET(request())).json();
    expect(response).toMatchObject({ admin: true, maintainerr: null });
    expect(response.freshness).toHaveLength(3);
  });
  it('projects only matching historical rows, never approvals or personal watch data', async () => {
    await login('admin', true);
    applyKeep('admin', '1');
    const row = {
      ratingKey: '1', status: 'add', reason: 'watch_age_met', libraryKind: 'movie',
      dueAt: null, collectionId: 10, collectionTitle: 'Movies', lastWatched: 999,
      source: 'requester', requester: 'private-user',
    };
    savedMock.mockReturnValue({
      generatedAt: 123, paused: false, massBlocked: true, watchReady: true,
      automaticRules: defaultMaintainerrRules(), planHash: 'secret', massApproved: true,
      history: [{ ratingKey: 'private' }], items: [row, { ...row, collectionId: 11 }, { ...row, ratingKey: '2' }],
    });
    const data = await (await GET(request())).json();
    expect(data.kept).toBe(true); // Current veto stays separate from historical "add".
    expect(data.maintainerr.items).toHaveLength(2);
    expect(data.maintainerr.items[0]).toEqual({
      status: 'add', reason: 'watch_age_met', libraryKind: 'movie', dueAt: null,
      collectionId: 10, collectionTitle: 'Movies',
    });
    expect(data.maintainerr.generatedAt).toBe(123);
    expect(data.maintainerr.massBlocked).toBe(true);
    for (const field of ['planHash', 'massApproved', 'history', 'lastWatched', 'private-user']) {
      expect(JSON.stringify(data)).not.toContain(field);
    }
  });
  it('does not invent eligibility when the title is absent from a saved plan', async () => {
    await login('admin', true);
    savedMock.mockReturnValue({ generatedAt: 123, paused: false, massBlocked: false,
      watchReady: true, automaticRules: defaultMaintainerrRules(), items: [] });
    expect((await (await GET(request())).json()).maintainerr.items).toEqual([]);
  });
});