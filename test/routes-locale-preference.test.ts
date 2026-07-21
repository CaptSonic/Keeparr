import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

import { __closeDb, __setTestDbToMemory } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { getUser, upsertUser } from '@/lib/queries';
import { GET as authMe } from '@/app/api/auth/me/route';
import { PUT as putLocale } from '@/app/api/preferences/locale/route';

function request(locale: unknown) {
  return new Request('http://localhost/api/preferences/locale', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
}

async function login() {
  upsertUser({ plexUserId: 'locale-user', username: 'Locale User', email: null, thumb: null, isAdmin: false });
  await setSessionCookie('locale-user');
}

beforeEach(() => {
  cookieJar.clear();
  __setTestDbToMemory();
});

afterAll(() => __closeDb());

describe('PUT /api/preferences/locale', () => {
  it('rejects anonymous requests before reading the preference', async () => {
    expect((await putLocale(request('de'))).status).toBe(401);
  });

  it.each(['de-DE', 'DE', 'fr', '', null])('rejects invalid locale %s', async (locale) => {
    await login();
    const res = await putLocale(request(locale));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_locale' });
  });

  it.each(['de', 'en'] as const)('persists %s and exposes it through auth/me', async (locale) => {
    await login();
    const res = await putLocale(request(locale));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, locale });
    expect(getUser('locale-user')?.locale).toBe(locale);

    const me = await authMe();
    expect(me.status).toBe(200);
    expect((await me.json()).user.locale).toBe(locale);
  });
});