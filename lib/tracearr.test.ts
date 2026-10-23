import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setTestDbToMemory, __closeDb } from './db';
import { getSetting, upsertWatchBatch, watchedRatingKeys } from './queries';
import { getPlexWatchSource, getWatchSourceFingerprint, isWatchAvailable, readSetting, writeSetting } from './settings';
import { tracearrActivePlaybackTitles, tracearrWatchHistory, testTracearr } from './tracearr';
import { activePlaybackTitles } from './watch-source';
import { syncWatchHistory } from './sync';
import { getJobProgress } from './job-progress';

const serverId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const server = { server_id: serverId, server_name: 'Main Plex', server_type: 'plex', status: 'up', historical: false };
const account = { server_id: serverId, server_type: 'plex', server_user_id: 'internal-user', external_user_id: '42' };
const history = { id: 'play-1', server_id: serverId, server_type: 'plex', media_type: 'episode',
  rating_key: '900', grandparent_rating_key: '77', started_at: '2026-01-01T00:00:00Z',
  stopped_at: '2026-01-01T01:00:00Z', user: { server_user_id: 'internal-user' } };
const page = (data: unknown[], nextCursor: string | null = null) => ({ data, meta: { nextCursor, pageSize: 100 } });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  __setTestDbToMemory();
  writeSetting('plex_watch_source', 'tracearr');
  writeSetting('tracearr_url', 'http://tracearr:3000/prefix/');
  writeSetting('tracearr_api_key', 'private-key');
  writeSetting('tracearr_server_id', serverId);
});
afterEach(() => { vi.restoreAllMocks(); __closeDb(); });

function mockApi(options: { history?: unknown; users?: unknown; streams?: unknown; servers?: unknown } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'servers') return response(options.servers ?? { data: [server,
      { ...server, server_id: otherId, server_name: 'Other Plex' }] });
    if (endpoint === 'users') return response(options.users ?? page([{ accounts: [account,
      { ...account, server_id: otherId, external_user_id: '999' }] }]));
    if (endpoint === 'history') return response(options.history ?? page([history]));
    if (endpoint === 'streams') return response(options.streams ?? { data: [] });
    throw new Error(`Unexpected endpoint: ${url.pathname}`);
  });
}

describe('Tracearr public API v2', () => {
  it('loads Plex servers, keeps base paths, and sends the key only in the bearer header', async () => {
    const spy = mockApi();
    const result = await testTracearr('http://tracearr/prefix/', 'private-key');
    expect(result.ok).toBe(true);
    expect(result.servers).toHaveLength(2);
    expect(String(spy.mock.calls[0][0])).toBe('http://tracearr/prefix/api/v2/public/servers');
    expect(spy.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer private-key' });
    expect(String(spy.mock.calls[0][0])).not.toContain('private-key');
  });

  it('maps server-local accounts to Plex users and rolls episodes up to the series', async () => {
    const spy = mockApi({ history: page([history, { ...history, id: 'play-2', rating_key: '901' }]) });
    expect(await tracearrWatchHistory()).toEqual([{ plexUserId: '42', ratingKey: '77', plays: 2,
      lastWatched: Date.parse(history.stopped_at) / 1000 }]);
    const url = new URL(String(spy.mock.calls.find(([input]) => String(input).includes('/history'))![0]));
    expect(url.searchParams.get('server_id')).toBe(serverId);
  });

  it('pages both users and history, including removed accounts, without counting repeated plays twice', async () => {
    const spy = mockApi();
    spy.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const next = url.searchParams.has('cursor');
      if (url.pathname.endsWith('/servers')) return response({ data: [server] });
      if (url.pathname.endsWith('/users')) {
        expect(url.searchParams.get('include_removed')).toBe('true');
        return response(next ? page([{ accounts: [account] }]) : page([], 'users-next'));
      }
      expect(url.searchParams.get('server_id')).toBe(serverId);
      return response(next ? page([history, { ...history, id: 'play-2', media_type: 'movie', rating_key: '88' }])
        : page([history], 'history-next'));
    });
    expect(await tracearrWatchHistory()).toMatchObject([
      { plexUserId: '42', ratingKey: '77', plays: 1 }, { plexUserId: '42', ratingKey: '88', plays: 1 },
    ]);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(getJobProgress('watch')).toMatchObject({ completed: 3, total: null });
    expect(getJobProgress('watch')?.phase).toContain('2 pages');
  });

  it.each([
    { server_id: otherId }, { server_type: 'jellyfin' }, { grandparent_rating_key: null },
    { started_at: 'bad' }, { stopped_at: 'bad' }, { user: { server_user_id: 'missing' } }, { media_type: 'unknown' },
  ])('rejects unsafe history %j', async (patch) => {
    mockApi({ history: page([{ ...history, ...patch }]) });
    await expect(tracearrWatchHistory()).rejects.toThrow(/Tracearr/);
  });

  it('rejects malformed envelopes and repeating cursors rather than truncating history', async () => {
    const spy = mockApi({ history: { data: [] } });
    await expect(tracearrWatchHistory()).rejects.toThrow(/Tracearr/);
    spy.mockRestore();
    mockApi({ history: page([history], 'same') });
    await expect(tracearrWatchHistory()).rejects.toThrow(/cursor/);
  });

  it.each(['down', 'unknown'])('blocks reads when the selected server is %s', async (status) => {
    const spy = mockApi({ servers: { data: [{ ...server, status }] } });
    await expect(tracearrActivePlaybackTitles()).rejects.toThrow(/unavailable/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('blocks historical or deleted servers', async () => {
    const spy = mockApi({ servers: { data: [{ ...server, historical: true }] } });
    await expect(tracearrWatchHistory()).rejects.toThrow(/unavailable/);
    spy.mockRestore();
    mockApi({ servers: { data: [] } });
    await expect(tracearrWatchHistory()).rejects.toThrow(/unavailable/);
  });

  it('protects paused series and movies through the shared live-playback seam', async () => {
    mockApi({ streams: { data: [{ ...history, state: 'paused', username: 'private' },
      { ...history, media_type: 'movie', rating_key: '88' }] } });
    expect(await activePlaybackTitles()).toEqual(new Set(['77', '88']));
  });

  it.each([{ server_id: otherId }, { grandparent_rating_key: null }, { media_type: 'unknown' }])(
    'fails closed on unsafe live sessions %j', async (patch) => {
      mockApi({ streams: { data: [{ ...history, ...patch }] } });
      await expect(activePlaybackTitles()).rejects.toThrow(/Tracearr/);
    });

  it('replaces old-source watch data only after a successful complete sync', async () => {
    upsertWatchBatch([{ plexUserId: 'old', ratingKey: '99', plays: 1, lastWatched: 1 }]);
    const spy = mockApi({ history: { data: [] } });
    await expect(syncWatchHistory()).rejects.toThrow(/Tracearr/);
    expect(watchedRatingKeys('old').has('99')).toBe(true);
    expect(readSetting('watch_source_fingerprint')).toBeNull();
    spy.mockRestore();
    mockApi();
    expect((await syncWatchHistory()).refreshComplete).toBe(true);
    expect(watchedRatingKeys('old').size).toBe(0);
    expect(watchedRatingKeys('42').has('77')).toBe(true);
    expect(readSetting('watch_source_fingerprint')).toBe(getWatchSourceFingerprint());
  });

  it('does not fall back to configured Tautulli when Tracearr is incomplete', async () => {
    writeSetting('tautulli_url', 'http://tautulli');
    writeSetting('tautulli_api_key', 'taut-key');
    writeSetting('tracearr_server_id', '');
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(isWatchAvailable()).toBe(false);
    expect((await syncWatchHistory()).refreshComplete).toBe(false);
    await expect(activePlaybackTitles()).rejects.toThrow(/selected Plex server/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('encrypts keys and invalidates readiness when source, server or Plex mapping changes', () => {
    expect(getSetting('tracearr_api_key')).not.toContain('private-key');
    expect(readSetting('tracearr_api_key')).toBe('private-key');
    const original = getWatchSourceFingerprint();
    writeSetting('tracearr_server_id', otherId);
    expect(getWatchSourceFingerprint()).not.toBe(original);
    const changed = getWatchSourceFingerprint();
    writeSetting('plex_machine_id', 'new-plex');
    expect(getWatchSourceFingerprint()).not.toBe(changed);
    writeSetting('plex_watch_source', 'tautulli');
    expect(getPlexWatchSource()).toBe('tautulli');
    expect(getWatchSourceFingerprint()).toBeNull();
  });
});