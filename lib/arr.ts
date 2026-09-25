/**
 * Sonarr / Radarr API client (v3; base /api/v3, auth header X-Api-Key). The two
 * apps share a near-identical shape, so one module serves both. Normal syncs are
 * read-only; the explicitly admin-approved archive workflow additionally updates
 * Sonarr monitoring and bulk-deletes episode files through Sonarr itself. The pure
 * `normalize*` functions are split from HTTP calls for network-free unit tests.
 */
import { fetchJson } from './http';
import type { ArrInstance } from './settings';

export type ArrSource = 'sonarr' | 'radarr';

/** A title pulled from an *arr instance, normalized for matching + display. */
export interface ArrRecord {
  source: ArrSource;
  instanceId: string;
  instanceName: string;
  arrId: number;
  /** Primary external id to match a Plex item: tvdbId (Sonarr) / tmdbId (Radarr). */
  matchId: string;
  /** Secondary match axis: the imdb id ("tt…"), if the *arr instance has one. */
  imdbId: string | null;
  title: string;
  monitored: boolean;
  status: string | null;
  quality: string | null;
  qualityKind: 'file' | 'profile';
  rootFolder: string | null;
  sizeOnDisk: number;
  tags: string[];
}

// --- Raw payload shapes (only the fields we read) ---
export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId?: number;
  imdbId?: string;
  monitored?: boolean;
  status?: string;
  qualityProfileId?: number;
  rootFolderPath?: string;
  statistics?: { sizeOnDisk?: number };
  tags?: number[];
  monitorNewItems?: string;
  seasons?: { seasonNumber: number; monitored?: boolean }[];
}
interface RadarrMovie {
  id: number;
  title: string;
  tmdbId?: number;
  imdbId?: string;
  monitored?: boolean;
  status?: string;
  rootFolderPath?: string;
  sizeOnDisk?: number;
  movieFile?: { quality?: { quality?: { name?: string } } };
  tags?: number[];
}
interface ArrTag {
  id: number;
  label: string;
}
interface ArrQualityProfile {
  id: number;
  name: string;
}

function labelsFor(ids: number[] | undefined, tagMap: Map<number, string>): string[] {
  return (ids ?? [])
    .map((id) => tagMap.get(id))
    .filter((l): l is string => !!l);
}

/** Sonarr series → ArrRecord. Series quality = the profile name (target). */
export function normalizeSonarr(
  s: SonarrSeries,
  inst: ArrInstance,
  tagMap: Map<number, string>,
  profileMap: Map<number, string>
): ArrRecord | null {
  if (s.tvdbId == null) return null; // no stable id → can't match a Plex item
  return {
    source: 'sonarr',
    instanceId: inst.id,
    instanceName: inst.name || inst.url,
    arrId: s.id,
    matchId: String(s.tvdbId),
    imdbId: s.imdbId || null,
    title: s.title,
    monitored: !!s.monitored,
    status: s.status ?? null,
    quality: (s.qualityProfileId != null && profileMap.get(s.qualityProfileId)) || null,
    qualityKind: 'profile',
    rootFolder: s.rootFolderPath ?? null,
    sizeOnDisk: s.statistics?.sizeOnDisk ?? 0,
    tags: labelsFor(s.tags, tagMap),
  };
}

/** Radarr movie → ArrRecord. Movie quality = the actual downloaded file quality. */
export function normalizeRadarr(
  m: RadarrMovie,
  inst: ArrInstance,
  tagMap: Map<number, string>
): ArrRecord | null {
  if (m.tmdbId == null) return null;
  return {
    source: 'radarr',
    instanceId: inst.id,
    instanceName: inst.name || inst.url,
    arrId: m.id,
    matchId: String(m.tmdbId),
    imdbId: m.imdbId || null,
    title: m.title,
    monitored: !!m.monitored,
    status: m.status ?? null,
    quality: m.movieFile?.quality?.quality?.name ?? null,
    qualityKind: 'file',
    rootFolder: m.rootFolderPath ?? null,
    sizeOnDisk: m.sizeOnDisk ?? 0,
    tags: labelsFor(m.tags, tagMap),
  };
}

async function arrGet<T>(inst: ArrInstance, path: string): Promise<T> {
  const url = inst.url.replace(/\/$/, '') + '/api/v3' + path;
  return fetchJson<T>(url, {
    headers: { 'X-Api-Key': inst.apiKey },
    label: `${inst.name || inst.url} ${path}`,
  });
}

/** Verify a connection (used by the Settings Test button). Never throws. */
export async function testArr(
  url: string,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const status = await arrGet<{ version?: string; appName?: string }>(
      { id: '', name: '', url, apiKey },
      '/system/status'
    );
    const app = status?.appName ? `${status.appName} ` : '';
    return {
      ok: true,
      message: status?.version ? `Connected (${app}v${status.version})` : 'Connected',
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

async function tagMap(inst: ArrInstance): Promise<Map<number, string>> {
  const tags = await arrGet<ArrTag[]>(inst, '/tag');
  return new Map(tags.map((t) => [t.id, t.label]));
}

/** All series from a Sonarr instance, normalized (tags + profile resolved). */
export async function fetchSonarr(inst: ArrInstance): Promise<ArrRecord[]> {
  const [series, tags, profiles] = await Promise.all([
    arrGet<SonarrSeries[]>(inst, '/series'),
    tagMap(inst),
    arrGet<ArrQualityProfile[]>(inst, '/qualityprofile'),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, p.name]));
  return series
    .map((s) => normalizeSonarr(s, inst, tags, profileMap))
    .filter((r): r is ArrRecord => r !== null);
}

/** All movies from a Radarr instance, normalized (tags resolved). */
export async function fetchRadarr(inst: ArrInstance): Promise<ArrRecord[]> {
  const [movies, tags] = await Promise.all([
    arrGet<RadarrMovie[]>(inst, '/movie'),
    tagMap(inst),
  ]);
  return movies
    .map((m) => normalizeRadarr(m, inst, tags))
    .filter((r): r is ArrRecord => r !== null);
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId?: number;
  seasonNumber?: number;
  relativePath?: string;
  path?: string;
  size?: number;
}

export interface SonarrEpisode {
  id: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  monitored?: boolean;
  hasFile?: boolean;
  episodeFileId?: number;
}

export interface SonarrQueueRecord {
  id?: number;
  seriesId?: number;
  title?: string;
  status?: string;
  trackedDownloadStatus?: string;
}

async function arrWrite<T>(
  inst: ArrInstance,
  path: string,
  method: 'PUT' | 'DELETE',
  body: unknown
): Promise<T | null> {
  const url = inst.url.replace(/\/$/, '') + '/api/v3' + path;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': inst.apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${inst.name || inst.url} ${path} → HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

export async function listSonarrSeries(inst: ArrInstance): Promise<SonarrSeries[]> {
  return arrGet<SonarrSeries[]>(inst, '/series');
}

export async function getSonarrSeries(
  inst: ArrInstance,
  seriesId: number
): Promise<SonarrSeries> {
  return arrGet<SonarrSeries>(inst, `/series/${seriesId}`);
}

export async function getSonarrEpisodeFiles(
  inst: ArrInstance,
  seriesId: number
): Promise<SonarrEpisodeFile[]> {
  return arrGet<SonarrEpisodeFile[]>(inst, `/episodefile?seriesId=${seriesId}`);
}

export async function getSonarrEpisodes(
  inst: ArrInstance,
  seriesId: number
): Promise<SonarrEpisode[]> {
  return arrGet<SonarrEpisode[]>(inst, `/episode?seriesId=${seriesId}`);
}

export async function getSonarrQueue(
  inst: ArrInstance,
  seriesId: number
): Promise<SonarrQueueRecord[]> {
  const value = await arrGet<
    SonarrQueueRecord[] | { records?: SonarrQueueRecord[] }
  >(
    inst,
    `/queue?seriesIds=${seriesId}&page=1&pageSize=1000&includeUnknownSeriesItems=true`
  );
  const records = Array.isArray(value) ? value : value.records ?? [];
  return records.filter((row) => row.seriesId === seriesId);
}

export async function updateSonarrSeries(
  inst: ArrInstance,
  series: SonarrSeries
): Promise<SonarrSeries> {
  return (await arrWrite<SonarrSeries>(inst, `/series/${series.id}`, 'PUT', series))!;
}

export async function deleteSonarrEpisodeFiles(
  inst: ArrInstance,
  episodeFileIds: number[]
): Promise<void> {
  if (episodeFileIds.length === 0) return;
  await arrWrite(inst, '/episodefile/bulk', 'DELETE', { episodeFileIds });
}

export async function setSonarrEpisodesMonitored(
  inst: ArrInstance,
  episodeIds: number[],
  monitored: boolean
): Promise<void> {
  if (episodeIds.length === 0) return;
  await arrWrite(inst, '/episode/monitor', 'PUT', { episodeIds, monitored });
}
