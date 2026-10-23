/** Tracearr public API v2. Never mix rating keys or user accounts across servers.
 * Older APIs lack the identity fields needed for safe history/live protection.
 * Contract: connorgallopo/Tracearr apps/server/src/routes/publicV2/{users,history,streams,servers}.ts
 */
import { fetchJson } from './http';
import { getTracearrUrl, getTracearrKey, getTracearrServerId } from './settings';
import type { WatchRow } from './mediaserver/types';
import { reportJobProgress } from './job-progress';

type Row = Record<string, unknown>;
export interface TracearrServer {
  id: string;
  name: string;
  status: string;
  historical: boolean;
}

function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Tracearr response.');
  }
  return value as Row;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid Tracearr identity.');
  return value;
}

function ratingKey(value: unknown): string {
  const key = text(value);
  if (!/^[1-9]\d*$/.test(key)) throw new Error('Invalid Tracearr Plex rating key.');
  return key;
}

async function call(base: string, key: string, path: string, params: Record<string, string> = {}): Promise<Row> {
  const url = new URL(`${base.replace(/\/+$/, '')}/api/v2/public/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return object(await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${key}` }, label: `Tracearr ${path}`,
  }));
}

function rows(data: Row): Row[] {
  if (!Array.isArray(data.data)) throw new Error('Invalid Tracearr data list (public API v2 required).');
  return data.data.map(object);
}

export async function listTracearrServers(base: string, key: string): Promise<TracearrServer[]> {
  return rows(await call(base, key, 'servers'))
    .filter((row) => row.server_type === 'plex')
    .map((row) => {
      if (typeof row.historical !== 'boolean' || !['up', 'down', 'unknown'].includes(String(row.status))) {
        throw new Error('Invalid Tracearr server status.');
      }
      return { id: text(row.server_id), name: text(row.server_name),
        status: String(row.status), historical: row.historical };
    });
}

export async function testTracearr(base: string, key: string) {
  try {
    const servers = await listTracearrServers(base, key);
    return { ok: true, message: `Connected: ${servers.length} Plex server(s) (public API v2).`, servers };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

async function connection() {
  const base = getTracearrUrl();
  const key = getTracearrKey();
  const serverId = getTracearrServerId();
  if (!base || !key || !serverId) throw new Error('Tracearr requires URL, API key and selected Plex server.');
  const server = (await listTracearrServers(base, key)).find((row) => row.id === serverId);
  if (!server || server.historical || server.status !== 'up') {
    throw new Error('Selected Tracearr Plex server is unavailable or not live.');
  }
  return { base, key, serverId };
}

/** Fetch every cursor page before allowing the caller to replace the trusted cache. */
async function pages(base: string, key: string, path: string, params: Record<string, string>): Promise<Row[]> {
  const result: Row[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 10000; page++) {
    const data = await call(base, key, path, { ...params, pageSize: '100', ...(cursor ? { cursor } : {}) });
    result.push(...rows(data));
    reportJobProgress('watch', `Tracearr ${path}: ${page + 1} pages, ${result.length} entries`,
      `Tracearr ${path === 'users' ? 'Benutzer' : 'Verlauf'}: ${page + 1} Seiten, ${result.length} Einträge`, result.length);
    const next = object(data.meta).nextCursor;
    if (next === null) return result;
    cursor = text(next);
    if (seen.has(cursor)) throw new Error('Tracearr repeated a pagination cursor.');
    seen.add(cursor);
  }
  throw new Error('Tracearr history exceeds the pagination safety limit; no partial data imported.');
}

export async function tracearrWatchHistory(): Promise<WatchRow[]> {
  const { base, key, serverId } = await connection();
  const accounts = new Map<string, string>();
  for (const user of await pages(base, key, 'users', { include_removed: 'true' })) {
    if (!Array.isArray(user.accounts)) throw new Error('Invalid Tracearr user accounts.');
    for (const value of user.accounts) {
      const account = object(value);
      if (account.server_id !== serverId) continue;
      if (account.server_type !== 'plex') throw new Error('Invalid Tracearr account server type.');
      const id = text(account.server_user_id);
      const externalId = ratingKey(account.external_user_id);
      if (accounts.has(id) && accounts.get(id) !== externalId) throw new Error('Ambiguous Tracearr user account.');
      accounts.set(id, externalId);
    }
  }
  const aggregated = new Map<string, WatchRow>();
  const seen = new Set<string>();
  for (const row of await pages(base, key, 'history', { server_id: serverId })) {
    // Reject ignored filters rather than accepting a partial/foreign history.
    if (row.server_id !== serverId || row.server_type !== 'plex') throw new Error('Tracearr history server mismatch.');
    if (['track', 'live', 'photo', 'trailer'].includes(String(row.media_type))) continue;
    if (row.media_type !== 'movie' && row.media_type !== 'episode') throw new Error('Invalid Tracearr media type.');
    const id = text(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const rating = ratingKey(row.media_type === 'episode' ? row.grandparent_rating_key : row.rating_key);
    const userId = accounts.get(text(object(row.user).server_user_id));
    if (!userId) throw new Error('Tracearr history user cannot be mapped to a Plex account.');
    const date = Date.parse(text(row.started_at));
    const stopped = row.stopped_at == null ? date : Date.parse(text(row.stopped_at));
    if (!Number.isFinite(date) || !Number.isFinite(stopped) || date <= 0 || stopped < date) {
      throw new Error('Invalid Tracearr history timestamp.');
    }
    const lastWatched = Math.floor(stopped / 1000);
    const mapKey = `${userId}:${rating}`;
    const previous = aggregated.get(mapKey);
    if (previous) {
      previous.plays++;
      previous.lastWatched = Math.max(previous.lastWatched ?? 0, lastWatched);
    } else {
      aggregated.set(mapKey, { plexUserId: userId, ratingKey: rating, plays: 1, lastWatched });
    }
  }
  return [...aggregated.values()];
}

/** Paused/buffering playback also vetoes the whole movie/series. */
export async function tracearrActivePlaybackTitles(): Promise<Set<string>> {
  const { base, key, serverId } = await connection();
  const titles = new Set<string>();
  for (const row of rows(await call(base, key, 'streams', { server_id: serverId }))) {
    if (row.server_id !== serverId || row.server_type !== 'plex') throw new Error('Tracearr playback server mismatch.');
    if (['track', 'live', 'photo', 'trailer'].includes(String(row.media_type))) continue;
    if (row.media_type !== 'movie' && row.media_type !== 'episode') throw new Error('Invalid Tracearr playback media type.');
    titles.add(ratingKey(row.media_type === 'episode' ? row.grandparent_rating_key : row.rating_key));
  }
  return titles;
}