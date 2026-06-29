import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

import { __setTestDbToMemory, __closeDb } from '@/lib/db';
import {
  addKeep,
  addSkip,
  isKeptByUser,
  isMarkedForDelete,
  isSkipped,
  replaceSeerrRequests,
  upsertMediaBatch,
  upsertUser,
  type UpsertMediaInput,
} from '@/lib/queries';
import { setSessionCookie } from '@/lib/auth';
import { POST as markPost, DELETE as markDelete } from '@/app/api/mark-delete/route';

function media(rk: string, over: Partial<UpsertMediaInput> = {}): UpsertMediaInput {
  return {
    ratingKey: rk,
    sectionId: '1',
    libraryKind: 'movie',
    title: `Title ${rk}`,
    year: 2020,
    thumb: null,
    sizeBytes: 1024 ** 3,
    addedAt: 1000,
    guidTmdb: null,
    guidTvdb: null,
    ...over,
  };
}

function jsonReq(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/mark-delete', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function loginAs(plexUserId: string) {
  upsertUser({
    plexUserId,
    username: `user${plexUserId}`,
    email: null,
    thumb: null,
    isAdmin: false,
  });
  await setSessionCookie(plexUserId);
}

beforeEach(() => {
  cookieJar.clear();
  __setTestDbToMemory();
});
afterAll(() => {
  __closeDb();
});

describe('mark-delete route ("OK to delete")', () => {
  it('401 without a session', async () => {
    upsertMediaBatch([media('1')]);
    const res = await markPost(jsonReq({ ratingKey: '1' }));
    expect(res.status).toBe(401);
  });

  it('403 when the item was not requested by this user', async () => {
    upsertMediaBatch([media('1')]);
    await loginAs('userA');
    const res = await markPost(jsonReq({ ratingKey: '1' }));
    expect(res.status).toBe(403);
    expect(isMarkedForDelete('userA', '1')).toBe(false);
  });

  it('POST marks it (and clears the user\'s keep + don\'t-care) when requested', async () => {
    upsertMediaBatch([media('1')]);
    await loginAs('userA');
    replaceSeerrRequests('userA', ['1']);
    addKeep('userA', '1');
    addSkip('userA', '1');
    const res = await markPost(jsonReq({ ratingKey: '1' }));
    expect(res.status).toBe(200);
    expect(isMarkedForDelete('userA', '1')).toBe(true);
    expect(isKeptByUser('userA', '1')).toBe(false); // keep cleared
    expect(isSkipped('userA', '1')).toBe(false); // don't-care cleared
  });

  it('does not affect another user\'s keep (item stays protected)', async () => {
    upsertMediaBatch([media('1')]);
    addKeep('userB', '1'); // someone else keeps it
    await loginAs('userA');
    replaceSeerrRequests('userA', ['1']);
    await markPost(jsonReq({ ratingKey: '1' }));
    expect(isMarkedForDelete('userA', '1')).toBe(true);
    expect(isKeptByUser('userB', '1')).toBe(true); // untouched
  });

  it('404 for an unknown item', async () => {
    await loginAs('userA');
    const res = await markPost(jsonReq({ ratingKey: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('DELETE clears the mark', async () => {
    upsertMediaBatch([media('1')]);
    await loginAs('userA');
    replaceSeerrRequests('userA', ['1']);
    await markPost(jsonReq({ ratingKey: '1' }));
    const res = await markDelete(jsonReq({ ratingKey: '1' }, 'DELETE'));
    expect(res.status).toBe(200);
    expect(isMarkedForDelete('userA', '1')).toBe(false);
  });
});
