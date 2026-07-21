import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  set: (name: string, value: string) => cookieJar.set(name, value),
  delete: (name: string) => cookieJar.delete(name),
}) }));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { addKeep, upsertMediaBatch, upsertUser } from '@/lib/queries';
import { GET as list } from '@/app/api/campaigns/route';
import { GET as detail } from '@/app/api/campaigns/[id]/route';
import { POST as create } from '@/app/api/admin/campaigns/route';
import { DELETE as undoReview, POST as review } from '@/app/api/campaigns/[id]/review/route';
import { GET as exportCsv } from '@/app/api/admin/campaigns/[id]/export/route';
import { POST as close } from '@/app/api/admin/campaigns/[id]/close/route';

const GB = 1024 ** 3;
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
async function login(id: string, admin: boolean) {
  upsertUser({ plexUserId: id, username: id, email: null, thumb: null, isAdmin: admin });
  await setSessionCookie(id);
}

beforeEach(() => { cookieJar.clear(); __setTestDbToMemory(); });
afterAll(() => __closeDb());

describe('Cleanup Campaign routes', () => {
  it('guards all dynamic campaign routes', async () => {
    const request = new Request('http://x', { method: 'POST', body: JSON.stringify({ ratingKey: 'one' }) });
    expect((await detail(new Request('http://x'), params(1))).status).toBe(401);
    expect((await review(request, params(1))).status).toBe(401);
    expect((await undoReview(new Request('http://x', { method: 'DELETE', body: JSON.stringify({ ratingKey: 'one' }) }), params(1))).status).toBe(401);
    expect((await close(new Request('http://x', { method: 'POST' }), params(1))).status).toBe(401);
    expect((await exportCsv(new Request('http://x'), params(1))).status).toBe(401);
  });

  it('rejects empty campaign snapshots', async () => {
    await login('admin', true);
    const response = await create(new Request('http://x/api/admin/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name: 'Empty', targetBytes: GB,
        deadlineAt: Math.floor(Date.now() / 1000) + 86400, gracePeriodDays: 7, minScore: 100 }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'no_campaign_candidates' });
  });

  it('requires admin creation but allows signed-in household review and CSV admin export', async () => {
    upsertMediaBatch([{ ratingKey: 'one', sectionId: '1', libraryKind: 'movie', title: 'One',
      year: 2020, thumb: null, sizeBytes: 20 * GB, addedAt: 1, guidTmdb: null, guidTvdb: null }]);
    await login('member', false);
    const body = { name: 'Cleanup', targetBytes: 10 * GB,
      deadlineAt: Math.floor(Date.now() / 1000) + 86400, gracePeriodDays: 7, minScore: 0 };
    expect((await create(new Request('http://x/api/admin/campaigns', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(403);

    await login('admin', true);
    const made = await create(new Request('http://x/api/admin/campaigns', { method: 'POST', body: JSON.stringify(body) }));
    expect(made.status).toBe(201);
    const id = (await made.json()).campaign.id as number;
    expect((await list()).status).toBe(200);

    await login('member', false);
    const reviewed = await review(new Request('http://x/api/campaigns/x/review', {
      method: 'POST', body: JSON.stringify({ ratingKey: 'one' }),
    }), params(id));
    expect(reviewed.status).toBe(200);
    const got = await detail(new Request('http://x'), params(id));
    expect((await got.json()).campaign).toMatchObject({ releasedBytes: 20 * GB });
    expect((await exportCsv(new Request('http://x'), params(id))).status).toBe(403);

    addKeep('other', 'one');
    await login('admin', true);
    const csv = await exportCsv(new Request('http://x'), params(id));
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(await csv.text()).toContain('protected');
  });

  it('reports an already closed campaign as inactive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    try {
      upsertMediaBatch([{ ratingKey: 'one', sectionId: '1', libraryKind: 'movie', title: 'One',
        year: 2020, thumb: null, sizeBytes: GB, addedAt: 1, guidTmdb: null, guidTvdb: null }]);
      await login('admin', true);
      const made = await create(new Request('http://x', { method: 'POST', body: JSON.stringify({
        name: 'Closable', targetBytes: GB, deadlineAt: Math.floor(Date.now() / 1000) + 60,
        gracePeriodDays: 0, minScore: 0,
      }) }));
      const id = (await made.json()).campaign.id as number;
      vi.advanceTimersByTime(61_000);
      expect((await close(new Request('http://x', { method: 'POST' }), params(id))).status).toBe(200);
      const again = await close(new Request('http://x', { method: 'POST' }), params(id));
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ error: 'campaign_not_active' });
    } finally {
      vi.useRealTimers();
    }
  });
});