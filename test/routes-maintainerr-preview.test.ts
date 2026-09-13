import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, previewMock, approveMassMock, approveReaddMock } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  previewMock: vi.fn(),
  approveMassMock: vi.fn(),
  approveReaddMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));
vi.mock('@/lib/maintainerr', () => ({
  previewMaintainerr: previewMock,
  approveCurrentMaintainerrPlan: approveMassMock,
  approveCurrentMaintainerrReadd: approveReaddMock,
}));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { upsertUser } from '@/lib/queries';
import { GET, POST } from '@/app/api/admin/maintainerr-preview/route';

async function loginAs(id: string, admin: boolean) {
  upsertUser({ plexUserId: id, username: id, email: null, thumb: null, isAdmin: admin });
  await setSessionCookie(id);
}

beforeEach(() => {
  cookieJar.clear();
  previewMock.mockReset();
  approveMassMock.mockReset();
  approveReaddMock.mockReset();
  __setTestDbToMemory();
});

describe('POST /api/admin/maintainerr-preview', () => {
  const request = (body: unknown) => new Request('http://localhost/api/admin/maintainerr-preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('requires an admin before reading the approval body', async () => {
    expect((await POST(request({ action: 'approve-mass' }))).status).toBe(401);
    await loginAs('user', false);
    expect((await POST(request({ action: 'approve-mass' }))).status).toBe(403);
    expect(approveMassMock).not.toHaveBeenCalled();
  });

  it('approves the server-recomputed mass plan', async () => {
    await loginAs('admin', true);
    approveMassMock.mockResolvedValue({ massBlocked: true, massApproved: true });
    const response = await POST(request({ action: 'approve-mass', planHash: 'ignored-client-value' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(approveMassMock).toHaveBeenCalledOnce();
  });

  it('validates and forwards only a well-formed re-add identity', async () => {
    await loginAs('admin', true);
    approveReaddMock.mockResolvedValue({ massBlocked: false });
    expect((await POST(request({ action: 'approve-readd', collectionId: 10, ratingKey: 'abc' }))).status)
      .toBe(200);
    expect(approveReaddMock).toHaveBeenCalledWith(10, 'abc');
    expect((await POST(request({ action: 'approve-readd', collectionId: 0, ratingKey: '' }))).status)
      .toBe(400);
  });

  it('returns conflict when the server-recomputed approval is stale', async () => {
    await loginAs('admin', true);
    approveMassMock.mockRejectedValue(new Error('Maintainerr plan is not mass-blocked.'));
    const response = await POST(request({ action: 'approve-mass' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'approval_stale' });
  });
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