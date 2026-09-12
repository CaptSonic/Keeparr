import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, previewMock } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  previewMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));
vi.mock('@/lib/maintainerr', () => ({ previewMaintainerr: previewMock }));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { upsertUser } from '@/lib/queries';
import { GET } from '@/app/api/admin/maintainerr-preview/route';

async function loginAs(id: string, admin: boolean) {
  upsertUser({ plexUserId: id, username: id, email: null, thumb: null, isAdmin: admin });
  await setSessionCookie(id);
}

beforeEach(() => {
  cookieJar.clear();
  previewMock.mockReset();
  __setTestDbToMemory();
});
afterAll(() => __closeDb());

describe('GET /api/admin/maintainerr-preview', () => {
  it('rejects anonymous and non-admin users before planning', async () => {
    expect((await GET()).status).toBe(401);
    await loginAs('user', false);
    expect((await GET()).status).toBe(403);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('returns an admin dry run with no-store caching', async () => {
    await loginAs('admin', true);
    previewMock.mockResolvedValue({
      generatedAt: 123, paused: false, pauseReason: null, watchReady: true,
      watchAgeDays: 180, requesterReleases: 1, campaignReleases: 0,
      collections: [], items: [], summary: {},
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ generatedAt: 123, paused: false });
    expect(previewMock).toHaveBeenCalledOnce();
  });
});