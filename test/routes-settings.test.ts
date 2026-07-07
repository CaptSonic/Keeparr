import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

import { __setTestDbToMemory, __closeDb } from '@/lib/db';
import { upsertUser } from '@/lib/queries';
import { setSessionCookie } from '@/lib/auth';
import { setApiKey, setSonarrInstances, getBackupRetention } from '@/lib/settings';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/admin/settings/route';

beforeEach(() => {
  cookieJar.clear();
  __setTestDbToMemory();
});
afterAll(() => __closeDb());

async function loginAs(plexUserId: string, isAdmin = false) {
  upsertUser({ plexUserId, username: plexUserId, email: null, thumb: null, isAdmin });
  await setSessionCookie(plexUserId);
}

const putReq = (body: unknown) =>
  new Request('http://localhost/api/admin/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/admin/settings', () => {
  it('401 without a session, 403 for non-admin', async () => {
    expect((await settingsGet()).status).toBe(401);
    await loginAs('user', false);
    expect((await settingsGet()).status).toBe(403);
  });

  it('GET returns the automation apiKey (masked+copyable in the UI) but never service secrets', async () => {
    await loginAs('admin', true);
    setApiKey('my-automation-key');
    setSonarrInstances([{ id: 's1', name: 'M', url: 'http://s', apiKey: 'arr-secret' }]);
    const body = await settingsGet().then((r) => r.json());
    expect(body.apiKey).toBe('my-automation-key');
    expect(body.apiKeyConfigured).toBe(true);
    // arr instance keys stay hidden — only hasKey booleans.
    expect(JSON.stringify(body)).not.toContain('arr-secret');
    expect(body.sonarr.instances[0]).toMatchObject({ hasKey: true });
  });

  it('GET reports an empty apiKey when none is set', async () => {
    await loginAs('admin', true);
    const body = await settingsGet().then((r) => r.json());
    expect(body.apiKey).toBe('');
    expect(body.apiKeyConfigured).toBe(false);
  });

  it('PUT round-trips apiKey + backupRetention', async () => {
    await loginAs('admin', true);
    const res = await settingsPut(putReq({ apiKey: 'fresh-key', backupRetention: 30 }));
    expect(res.status).toBe(200);
    const body = await settingsGet().then((r) => r.json());
    expect(body.apiKey).toBe('fresh-key');
    expect(getBackupRetention()).toBe(30);
  });
});
