import { createHash, randomUUID } from 'node:crypto';
import {
  deleteSonarrEpisodeFiles,
  getSonarrEpisodes,
  getSonarrEpisodeFiles,
  getSonarrQueue,
  getSonarrSeries,
  listSonarrSeries,
  setSonarrEpisodesMonitored,
  updateSonarrSeries,
  type SonarrEpisode,
  type SonarrEpisodeFile,
  type SonarrSeries,
} from './arr';
import {
  claimArchiveRun,
  createArchiveRun,
  finishArchiveRun,
  getArchiveRun,
  getArchiveTarget,
  listArchiveTargets,
  logEvent,
  recentArchiveRuns,
} from './queries';
import { getSonarrInstances, type ArrInstance } from './settings';

export type ArchiveBlockReason =
  | 'not_found'
  | 'not_series'
  | 'keep_veto'
  | 'mode_not_supported'
  | 'sonarr_not_configured'
  | 'sonarr_unavailable'
  | 'sonarr_match_missing'
  | 'sonarr_match_ambiguous'
  | 'active_downloads'
  | 'no_episode_files'
  | 'stale_preview'
  | 'already_executed';

export interface ArchivePreview {
  ready: boolean;
  reason?: ArchiveBlockReason;
  ratingKey: string;
  title: string;
  instanceId?: string;
  instanceName?: string;
  seriesId?: number;
  releaseMode?: string;
  fileCount: number;
  totalBytes: number;
  episodeFileIds: number[];
  episodeIds: number[];
  allEpisodeIds: number[];
  episodeFileEpisodeMap: { episodeId: number; episodeFileId: number }[];
  seasonNumbers: number[];
  activeDownloads: number;
  planHash?: string;
  runId?: string;
}

const splitIds = (value: string | null) =>
  new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );

function matches(series: SonarrSeries, tvdb: Set<string>, imdb: Set<string>): boolean {
  return (
    (series.tvdbId != null && tvdb.has(String(series.tvdbId))) ||
    (!!series.imdbId && imdb.has(series.imdbId.toLowerCase()))
  );
}

async function resolveUniqueTarget(
  guidTvdb: string | null,
  guidImdb: string | null,
  preferredInstanceId?: string | null,
  preferredSeriesId?: number | null
): Promise<{ inst: ArrInstance; series: SonarrSeries } | ArchiveBlockReason> {
  const instances = getSonarrInstances();
  if (instances.length === 0) return 'sonarr_not_configured';
  const tvdb = splitIds(guidTvdb);
  const imdb = splitIds(guidImdb);
  if (tvdb.size === 0 && imdb.size === 0) return 'sonarr_match_missing';

  if (preferredInstanceId && preferredSeriesId != null) {
    const preferredInstance = instances.find(
      (instance) => instance.id === preferredInstanceId
    );
    if (preferredInstance) {
      let preferredSeries: SonarrSeries;
      try {
        preferredSeries = await getSonarrSeries(preferredInstance, preferredSeriesId);
      } catch {
        return 'sonarr_unavailable';
      }
      if (matches(preferredSeries, tvdb, imdb)) {
        return { inst: preferredInstance, series: preferredSeries };
      }
    }
  }

  let lists: SonarrSeries[][];
  try {
    lists = await Promise.all(instances.map(listSonarrSeries));
  } catch {
    return 'sonarr_unavailable';
  }
  const found: { inst: ArrInstance; series: SonarrSeries }[] = [];
  lists.forEach((series, index) => {
    for (const item of series) {
      if (matches(item, tvdb, imdb)) found.push({ inst: instances[index], series: item });
    }
  });
  if (found.length === 0) return 'sonarr_match_missing';
  if (found.length !== 1) return 'sonarr_match_ambiguous';
  return found[0];
}

function hashPlan(
  instanceId: string,
  seriesId: number,
  files: SonarrEpisodeFile[],
  episodes: SonarrEpisode[],
  seasons: number[]
): string {
  const fileIds = new Set(files.map((file) => file.id));
  return createHash('sha256')
    .update(
      JSON.stringify({
        instanceId,
        seriesId,
        episodeFileIds: files.map((file) => file.id).sort((a, b) => a - b),
        episodeIds: episodes.map((episode) => episode.id).sort((a, b) => a - b),
        episodeFileEpisodeMap: episodes
          .filter(
            (episode) =>
              episode.episodeFileId != null && fileIds.has(episode.episodeFileId)
          )
          .map((episode) => ({
            episodeId: episode.id,
            episodeFileId: episode.episodeFileId!,
          }))
          .sort(
            (a, b) => a.episodeFileId - b.episodeFileId || a.episodeId - b.episodeId
          ),
        seasonNumbers: [...seasons].sort((a, b) => a - b),
      })
    )
    .digest('hex');
}

function episodePlan(files: SonarrEpisodeFile[], episodes: SonarrEpisode[]) {
  const fileIds = new Set(files.map((file) => file.id));
  const mappings = episodes
    .filter(
      (episode) => episode.episodeFileId != null && fileIds.has(episode.episodeFileId)
    )
    .map((episode) => ({
      episodeId: episode.id,
      episodeFileId: episode.episodeFileId!,
    }))
    .sort((a, b) => a.episodeFileId - b.episodeFileId || a.episodeId - b.episodeId);
  const mappedFileIds = new Set(mappings.map((mapping) => mapping.episodeFileId));
  return {
    mappings,
    episodeIds: [...new Set(mappings.map((mapping) => mapping.episodeId))].sort(
      (a, b) => a - b
    ),
    complete: files.every((file) => mappedFileIds.has(file.id)),
  };
}

function blocked(
  ratingKey: string,
  title: string,
  reason: ArchiveBlockReason
): ArchivePreview {
  return {
    ready: false,
    reason,
    ratingKey,
    title,
    fileCount: 0,
    totalBytes: 0,
    episodeFileIds: [],
    episodeIds: [],
    allEpisodeIds: [],
    episodeFileEpisodeMap: [],
    seasonNumbers: [],
    activeDownloads: 0,
  };
}

export function archiveDashboard() {
  return { targets: listArchiveTargets(), runs: recentArchiveRuns(50) };
}

export async function previewArchive(
  ratingKey: string,
  requestedBy: string
): Promise<ArchivePreview> {
  const target = getArchiveTarget(ratingKey);
  if (!target) return blocked(ratingKey, '', 'not_found');
  if (target.libraryKind !== 'show') return blocked(ratingKey, target.title, 'not_series');
  if (target.keptByAnyone) return blocked(ratingKey, target.title, 'keep_veto');
  if (target.effectiveMode !== 'archive_existing') {
    return blocked(ratingKey, target.title, 'mode_not_supported');
  }

  const resolved = await resolveUniqueTarget(
    target.guidTvdb,
    target.guidImdb,
    target.instanceId,
    target.arrId
  );
  if (typeof resolved === 'string') return blocked(ratingKey, target.title, resolved);

  let series: SonarrSeries;
  let files: SonarrEpisodeFile[];
  let episodes: SonarrEpisode[];
  let activeDownloads: number;
  try {
    const [freshSeries, freshFiles, freshEpisodes, queue] = await Promise.all([
      getSonarrSeries(resolved.inst, resolved.series.id),
      getSonarrEpisodeFiles(resolved.inst, resolved.series.id),
      getSonarrEpisodes(resolved.inst, resolved.series.id),
      getSonarrQueue(resolved.inst, resolved.series.id),
    ]);
    series = freshSeries;
    files = freshFiles;
    episodes = freshEpisodes;
    activeDownloads = queue.length;
  } catch {
    return blocked(ratingKey, target.title, 'sonarr_unavailable');
  }
  if (activeDownloads > 0) {
    return { ...blocked(ratingKey, target.title, 'active_downloads'), activeDownloads };
  }
  if (files.length === 0) return blocked(ratingKey, target.title, 'no_episode_files');
  const plannedEpisodes = episodePlan(files, episodes);
  if (!plannedEpisodes.complete) {
    return blocked(ratingKey, target.title, 'sonarr_unavailable');
  }

  const seasonNumbers = [
    ...new Set((series.seasons ?? []).map((season) => season.seasonNumber)),
  ].sort((a, b) => a - b);
  const planHash = hashPlan(
    resolved.inst.id,
    series.id,
    files,
    episodes,
    seasonNumbers
  );
  const runId = randomUUID();
  const preview: ArchivePreview = {
    ready: true,
    ratingKey,
    title: target.title,
    instanceId: resolved.inst.id,
    instanceName: resolved.inst.name || resolved.inst.url,
    seriesId: series.id,
    releaseMode: target.effectiveMode,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    episodeFileIds: files.map((file) => file.id).sort((a, b) => a - b),
    episodeIds: plannedEpisodes.episodeIds,
    allEpisodeIds: episodes.map((episode) => episode.id).sort((a, b) => a - b),
    episodeFileEpisodeMap: plannedEpisodes.mappings,
    seasonNumbers,
    activeDownloads: 0,
    planHash,
    runId,
  };
  createArchiveRun({
    id: runId,
    ratingKey,
    requestedBy,
    releaseMode: target.effectiveMode,
    status: 'previewed',
    instanceId: resolved.inst.id,
    arrId: series.id,
    planHash,
    preview,
  });
  logEvent(
    'info',
    'archive',
    `Previewed ${target.title}: ${files.length} Sonarr episode files.`
  );
  return preview;
}

export async function executeArchive(runId: string, requestedBy: string) {
  const run = getArchiveRun(runId);
  if (!run) return { ok: false, reason: 'not_found' as ArchiveBlockReason };
  if (run.status !== 'previewed') {
    return { ok: false, reason: 'already_executed' as ArchiveBlockReason };
  }
  if (!claimArchiveRun(runId)) {
    return { ok: false, reason: 'already_executed' as ArchiveBlockReason };
  }

  const target = getArchiveTarget(run.ratingKey);
  if (!target || target.keptByAnyone || target.effectiveMode !== 'archive_existing') {
    const reason: ArchiveBlockReason = target?.keptByAnyone ? 'keep_veto' : 'stale_preview';
    finishArchiveRun(runId, 'blocked', { reason, requestedBy });
    return { ok: false, reason };
  }

  const resolved = await resolveUniqueTarget(
    target.guidTvdb,
    target.guidImdb,
    target.instanceId,
    target.arrId
  );
  if (
    typeof resolved === 'string' ||
    resolved.inst.id !== run.instanceId ||
    resolved.series.id !== run.arrId
  ) {
    const reason: ArchiveBlockReason =
      typeof resolved === 'string' ? resolved : 'stale_preview';
    finishArchiveRun(runId, 'blocked', { reason, requestedBy });
    return { ok: false, reason };
  }

  try {
    const [series, files, episodes, queue] = await Promise.all([
      getSonarrSeries(resolved.inst, resolved.series.id),
      getSonarrEpisodeFiles(resolved.inst, resolved.series.id),
      getSonarrEpisodes(resolved.inst, resolved.series.id),
      getSonarrQueue(resolved.inst, resolved.series.id),
    ]);
    if (queue.length > 0) {
      finishArchiveRun(runId, 'blocked', {
        reason: 'active_downloads',
        count: queue.length,
      });
      return { ok: false, reason: 'active_downloads' as ArchiveBlockReason };
    }
    const seasons = [
      ...new Set((series.seasons ?? []).map((season) => season.seasonNumber)),
    ].sort((a, b) => a - b);
    const plannedEpisodes = episodePlan(files, episodes);
    if (
      !plannedEpisodes.complete ||
      hashPlan(resolved.inst.id, series.id, files, episodes, seasons) !== run.planHash
    ) {
      finishArchiveRun(runId, 'stale', { reason: 'stale_preview' });
      return { ok: false, reason: 'stale_preview' as ArchiveBlockReason };
    }

    const updated: SonarrSeries = {
      ...series,
      monitored: true,
      monitorNewItems: 'all',
      seasons: (series.seasons ?? []).map((season) => ({
        ...season,
        monitored: false,
      })),
    };
    await updateSonarrSeries(resolved.inst, updated);
    await setSonarrEpisodesMonitored(
      resolved.inst,
      episodes.map((episode) => episode.id),
      false
    );
    await deleteSonarrEpisodeFiles(
      resolved.inst,
      files.map((file) => file.id)
    );
    await setSonarrEpisodesMonitored(
      resolved.inst,
      plannedEpisodes.episodeIds,
      true
    );

    const [verifiedSeries, remaining, verifiedEpisodes] = await Promise.all([
      getSonarrSeries(resolved.inst, series.id),
      getSonarrEpisodeFiles(resolved.inst, series.id),
      getSonarrEpisodes(resolved.inst, series.id),
    ]);
    const archivedEpisodeIds = new Set(plannedEpisodes.episodeIds);
    const originalEpisodeIds = new Set(episodes.map((episode) => episode.id));
    const verified =
      verifiedSeries.monitored === true &&
      verifiedSeries.monitorNewItems === 'all' &&
      (verifiedSeries.seasons ?? []).every((season) => season.monitored === false) &&
      remaining.length === 0 &&
      verifiedEpisodes.length === episodes.length &&
      verifiedEpisodes.every((episode) => originalEpisodeIds.has(episode.id)) &&
      verifiedEpisodes.every((episode) =>
        archivedEpisodeIds.has(episode.id)
          ? episode.monitored === true &&
            episode.hasFile === false &&
            !episode.episodeFileId
          : episode.monitored === false
      );
    if (!verified) throw new Error('Sonarr archive verification failed');

    const result = {
      ok: true,
      deletedFiles: files.length,
      archivedEpisodes: plannedEpisodes.episodeIds.length,
      deletedBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    };
    finishArchiveRun(runId, 'succeeded', result);
    logEvent(
      'warn',
      'archive',
      `Archived ${target.title}: removed ${files.length} episode files through Sonarr.`
    );
    return result;
  } catch (error) {
    const result = {
      ok: false,
      reason: 'sonarr_unavailable' as ArchiveBlockReason,
      message: String(error),
    };
    finishArchiveRun(runId, 'failed', result);
    logEvent('error', 'archive', `Archive failed for ${target.title}: ${String(error)}`);
    return result;
  }
}