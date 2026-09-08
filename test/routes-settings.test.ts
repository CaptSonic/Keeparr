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
import {
  setApiKey,
  setSonarrInstances,
  getBackupRetention,
  getMaintainerrConfig,
} from '@/lib/settings';
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

  it('PUT round-trips apiKey + backupRetention + automation bridge opt-in', async () => {
    await loginAs('admin', true);
    const res = await settingsPut(putReq({
      apiKey: 'fresh-key', backupRetention: 30, automationBridgeEnabled: true,
    }));
    expect(res.status).toBe(200);
    const body = await settingsGet().then((r) => r.json());
    expect(body.apiKey).toBe('fresh-key');
    expect(body.automationBridgeEnabled).toBe(true);
    expect(getBackupRetention()).toBe(30);
  });

  it('PUT round-trips the Maintainerr hand-off configuration', async () => {
    await loginAs('admin', true);
    const maintainerr = {
      url: 'http://maintainerr:6246/',
      movieCollectionId: 10,
      showCollectionId: 20,
      watchAgeDays: 365,
      enabled: true,
    };
    expect((await settingsPut(putReq({ maintainerr }))).status).toBe(200);
    expect(getMaintainerrConfig()).toEqual({ ...maintainerr, url: 'http://maintainerr:6246' });
    const body = await settingsGet().then((response) => response.json());
    expect(body.maintainerr).toEqual({ ...maintainerr, url: 'http://maintainerr:6246' });
  });

  it('rejects incomplete or duplicate Maintainerr targets', async () => {
    await loginAs('admin', true);
    const incomplete = await settingsPut(putReq({
      maintainerr: {
        url: 'http://maintainerr:6246',
        movieCollectionId: null,
        showCollectionId: null,
        enabled: true,
      },
    }));
    expect(incomplete.status).toBe(400);
    expect((await incomplete.json()).error).toBe('maintainerr_incomplete');

    const duplicate = await settingsPut(putReq({
      maintainerr: {
        url: 'http://maintainerr:6246',
        movieCollectionId: 10,
        showCollectionId: 10,
        enabled: true,
      },
    }));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error).toBe('maintainerr_duplicate_collection');
    expect(getMaintainerrConfig().enabled).toBe(false);
  });

  it('rejects an invalid Maintainerr watch age', async () => {
    await loginAs('admin', true);
    const response = await settingsPut(putReq({
      maintainerr: {
        url: 'http://maintainerr:6246',
        movieCollectionId: 10,
        showCollectionId: 20,
        watchAgeDays: 0,
        enabled: true,
      },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('maintainerr_invalid_watch_age');
  });
});
