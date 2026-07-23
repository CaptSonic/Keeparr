import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  set: (name: string, value: string) => cookieJar.set(name, value),
  delete: (name: string) => cookieJar.delete(name),
}) }));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import {
  addKeep,
  closeCleanupCampaign,
  createCleanupCampaign,
  reviewCleanupCampaignItem,
  upsertMediaBatch,
} from '@/lib/queries';
import { setApiKey, setAutomationBridgeEnabled } from '@/lib/settings';
import { GET } from '@/app/api/automation/releases/route';

const GB = 1024 ** 3;

beforeEach(() => { cookieJar.clear(); __setTestDbToMemory(); vi.useRealTimers(); });
afterAll(() => __closeDb());

describe('GET /api/automation/releases', () => {
  it('requires authentication and a separate bridge opt-in', async () => {
    expect((await GET(new Request('http://x/api/automation/releases'))).status).toBe(401);
    setApiKey('secret');
    const req = new Request('http://x/api/automation/releases', { headers: { 'X-Api-Key': 'secret' } });
    const disabled = await GET(req);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toEqual({ error: 'automation_bridge_disabled' });
  });

  it('returns closed releases and removes a title immediately after a keep', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
    const base = Math.floor(Date.now() / 1000);
    upsertMediaBatch([{ ratingKey: 'one', sectionId: '1', libraryKind: 'movie', title: 'One',
      year: 2020, thumb: null, sizeBytes: 20 * GB, addedAt: 1,
      guidTmdb: '123', guidTvdb: null, guidImdb: 'tt123' }]);
    const c = createCleanupCampaign({ name: 'Closed', targetBytes: GB, deadlineAt: base + 60,
      gracePeriodDays: 0, minScore: 0, createdBy: 'admin', watchAvailable: false, arrAvailable: false });
    reviewCleanupCampaignItem(c.id, 'one', 'member');
    vi.setSystemTime((base + 61) * 1000);
    closeCleanupCampaign(c.id);
    setApiKey('secret');
    setAutomationBridgeEnabled(true);
    const request = () => new Request('http://x/api/automation/releases', { headers: { 'X-Api-Key': 'secret' } });
    const first = await GET(request());
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(await first.json()).toMatchObject({
      mode: 'report-only', summary: { items: 1, bytes: 20 * GB },
      items: [{ campaignId: c.id, ratingKey: 'one', guidTmdb: '123', guidImdb: 'tt123' }],
    });
    addKeep('protector', 'one');
    expect(await GET(request()).then((r) => r.json())).toMatchObject({ items: [], summary: { items: 0, bytes: 0 } });
  });
});
