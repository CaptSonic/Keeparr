import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, previewMock, savedMock, approveMassMock, approveReaddMock, syncMock, adoptMock } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  previewMock: vi.fn(),
  savedMock: vi.fn(),
  approveMassMock: vi.fn(),
  approveReaddMock: vi.fn(),
  syncMock: vi.fn(),
  adoptMock: vi.fn(),
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
  savedMaintainerrPreview: savedMock,
  approveCurrentMaintainerrPlan: approveMassMock,
  approveCurrentMaintainerrReadd: approveReaddMock,
  approveCurrentMaintainerrReadds: approveReaddMock,
  syncMaintainerr: syncMock,
  adoptMaintainerrMembers: adoptMock,
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
  savedMock.mockReset();
  approveMassMock.mockReset();
  approveReaddMock.mockReset();
  syncMock.mockReset();
  adoptMock.mockReset();
  __setTestDbToMemory();
});

describe('POST /api/admin/maintainerr-preview', () => {
  const request = (body: unknown) => new Request('http://localhost/api/admin/maintainerr-preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('requires admin and a bounded valid explicit adoption selection', async () => {
    const members = [{ collectionId: 10, ratingKey: 'movie-1' }];
    expect((await POST(request({ action: 'adopt-members', members }))).status).toBe(401);
    await loginAs('user', false);
    expect((await POST(request({ action: 'adopt-members', members }))).status).toBe(403);
    expect(adoptMock).not.toHaveBeenCalled();
    await loginAs('admin', true);
    for (const invalid of [[], [null], [{ collectionId: -1, ratingKey: 'x' }], members.map((m) => ({ ...m, ratingKey: '' }))]) {
      expect((await POST(request({ action: 'adopt-members', members: invalid }))).status).toBe(400);
    }
    adoptMock.mockResolvedValue({ items: [] });
    expect((await POST(request({ action: 'adopt-members', members }))).status).toBe(200);
    expect(adoptMock).toHaveBeenCalledWith(members);
    adoptMock.mockRejectedValue(new Error('Maintainerr adoption is stale.'));
    expect((await POST(request({ action: 'adopt-members', members }))).status).toBe(409);
  });

  it('validates and executes only the explicit admin selection', async () => {
    await loginAs('admin', true);
    const selection = {
      planHash: 'a'.repeat(64),
      operations: [{ collectionId: 10, ratingKey: 'movie-1', action: 'add' }],
    };
    syncMock.mockResolvedValue({ result: 1, message: 'done' });
    expect((await POST(request({ action: 'execute-selection', ...selection }))).status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith(selection);
    expect((await POST(request({ action: 'execute-selection', ...selection, operations: [] }))).status)
      .toBe(400);
    syncMock.mockRejectedValue(new Error('Maintainerr selection is stale.'));
    expect((await POST(request({ action: 'execute-selection', ...selection }))).status).toBe(409);
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

  it('validates admin-only bounded bulk re-add selections and reports stale approvals', async () => {
    const members = [{ collectionId: 10, ratingKey: 'a' }, { collectionId: 10, ratingKey: 'b' }];
    expect((await POST(request({ action: 'approve-readds', members }))).status).toBe(401);
    await loginAs('user', false);
    expect((await POST(request({ action: 'approve-readds', members }))).status).toBe(403);
    await loginAs('admin', true);
    for (const invalid of [[], [null], [{ collectionId: '10', ratingKey: 'a' }],
      [{ collectionId: 10, ratingKey: '' }], [{ collectionId: 10, ratingKey: 'x'.repeat(257) }],
      Array(10001).fill(members[0])]) {
      expect((await POST(request({ action: 'approve-readds', members: invalid }))).status).toBe(400);
    }
    expect(approveReaddMock).not.toHaveBeenCalled();
    approveReaddMock.mockResolvedValue({ items: [] });
    const response = await POST(request({ action: 'approve-readds', members }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(approveReaddMock).toHaveBeenCalledWith(members);
    approveReaddMock.mockRejectedValue(new Error('Maintainerr re-add is not currently blocked.'));
    expect((await POST(request({ action: 'approve-readds', members }))).status).toBe(409);
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
  it('returns display-only snapshots without starting a live check, admin-only', async () => {
    const request = () => new Request('http://localhost/api/admin/maintainerr-preview?snapshot=1');
    expect((await GET(request())).status).toBe(401);
    expect(savedMock).not.toHaveBeenCalled();
    await loginAs('member', false);
    expect((await GET(request())).status).toBe(403);
    expect(savedMock).not.toHaveBeenCalled();
    await loginAs('admin', true);
    savedMock.mockReturnValue(null);
    const empty = await GET(request());
    expect(await empty.json()).toEqual({ preview: null });
    expect(empty.headers.get('cache-control')).toBe('no-store');
    savedMock.mockReturnValue({ generatedAt: 123, snapshot: true, massApproved: false });
    expect(await (await GET(request())).json()).toMatchObject({ preview: { snapshot: true, massApproved: false } });
    expect(previewMock).not.toHaveBeenCalled();
  });
  it('rejects anonymous and non-admin users before planning', async () => {
    expect((await GET(new Request('http://localhost/api/admin/maintainerr-preview'))).status).toBe(401);
    await loginAs('user', false);
    expect((await GET(new Request('http://localhost/api/admin/maintainerr-preview'))).status).toBe(403);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('returns an admin dry run with no-store caching', async () => {
    await loginAs('admin', true);
    previewMock.mockResolvedValue({
      generatedAt: 123, paused: false, pauseReason: null, watchReady: true,
      watchAgeDays: 180, requesterReleases: 1, campaignReleases: 0,
      collections: [], items: [], summary: {},
    });

    const response = await GET(new Request('http://localhost/api/admin/maintainerr-preview'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ generatedAt: 123, paused: false });
    expect(previewMock).toHaveBeenCalledOnce();
  });
});