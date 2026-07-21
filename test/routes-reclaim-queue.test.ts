import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

import { __setTestDbToMemory, __closeDb } from '@/lib/db';
import {
  addDelete,
  addKeep,
  clearWatchHistory,
  setJobState,
  upsertMediaBatch,
  upsertUser,
  type UpsertMediaInput,
} from '@/lib/queries';
import { setSessionCookie } from '@/lib/auth';
import { GET } from '@/app/api/reclaim-queue/route';
import {
  getWatchSourceFingerprint,
  setMediaServerType,
  setServerField,
  writeSetting,
} from '@/lib/settings';

const GB = 1024 ** 3;
const media = (ratingKey: string, sizeBytes: number): UpsertMediaInput => ({
  ratingKey, sectionId: '1', libraryKind: 'movie', title: `Title ${ratingKey}`,
  year: 2020, thumb: null, sizeBytes, addedAt: 1000, guidTmdb: null, guidTvdb: null,
});

beforeEach(() => {
  cookieJar.clear();
  __setTestDbToMemory();
});
afterAll(() => __closeDb());

describe('GET /api/reclaim-queue', () => {
  it('returns explainable unprotected suggestions and clamps the strength filter', async () => {
    upsertUser({ plexUserId: 'me', username: 'Me', email: null, thumb: null, isAdmin: false });
    await setSessionCookie('me');
    upsertMediaBatch([media('released', 20 * GB), media('protected', 200 * GB)]);
    addDelete('requester', 'released');
    addKeep('other', 'protected');

    const res = await GET(new Request('http://localhost/api/reclaim-queue?minScore=45'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      ratingKey: 'released', kept: false, score: 50, strength: 'medium',
      markedForDeleteAny: true,
    });
    expect(body.items[0].reasons.map((r: { code: string }) => r.code)).toEqual(['size', 'released']);
    expect(body.summary).toMatchObject({ items: 1, bytes: 20 * GB });
  });

  it('enables never-watched points only for the source that completed the refresh', async () => {
    upsertUser({ plexUserId: 'me', username: 'Me', email: null, thumb: null, isAdmin: false });
    await setSessionCookie('me');
    upsertMediaBatch([media('unwatched', 5 * GB)]);
    setMediaServerType('plex');
    setServerField('plex', 'id', 'server');
    setServerField('plex', 'url', 'http://plex');
    setServerField('plex', 'token', 'token');
    writeSetting('tautulli_url', 'http://tautulli-a');
    writeSetting('tautulli_api_key', 'key-a');
    setJobState('watch', { lastStatus: 'ok' });
    writeSetting('watch_source_fingerprint', getWatchSourceFingerprint()!);

    const ready = await GET(new Request('http://localhost/api/reclaim-queue'));
    const readyBody = await ready.json();
    expect(readyBody.signals.watch).toBe(true);
    expect(readyBody.items[0]).toMatchObject({ score: 35 });

    writeSetting('tautulli_url', 'http://tautulli-b');
    const changed = await GET(new Request('http://localhost/api/reclaim-queue'));
    const changedBody = await changed.json();
    expect(changedBody.signals.watch).toBe(false);
    expect(changedBody.items[0]).toMatchObject({ score: 10 });
  });

  it('invalidates watch readiness when the watch cache is cleared', async () => {
    upsertUser({ plexUserId: 'me', username: 'Me', email: null, thumb: null, isAdmin: false });
    await setSessionCookie('me');
    upsertMediaBatch([media('unwatched', 5 * GB)]);
    writeSetting('tautulli_url', 'http://tautulli');
    writeSetting('tautulli_api_key', 'key');
    setJobState('watch', { lastStatus: 'ok' });
    writeSetting('watch_source_fingerprint', getWatchSourceFingerprint()!);

    clearWatchHistory();
    const res = await GET(new Request('http://localhost/api/reclaim-queue'));
    const body = await res.json();
    expect(body.signals.watch).toBe(false);
    expect(body.items[0]).toMatchObject({ score: 10 });
  });

  it('keeps filtered totals on an empty out-of-range page', async () => {
    upsertUser({ plexUserId: 'me', username: 'Me', email: null, thumb: null, isAdmin: false });
    await setSessionCookie('me');
    upsertMediaBatch([media('only', 5 * GB)]);

    const res = await GET(new Request('http://localhost/api/reclaim-queue?offset=40'));
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.summary).toMatchObject({ items: 1, bytes: 5 * GB, strong: 0 });
  });
});
