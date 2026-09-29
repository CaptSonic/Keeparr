import {
  getSonarrEpisodes,
  searchSonarrEpisodes,
  setSonarrEpisodesMonitored,
} from './arr';
import { removeManagedPlaceholder } from './archive-files';
import {
  claimArchiveRestoreByEpisodes,
  failRestoringArchiveEpisodes,
  findArchivedEpisodesByPlexPath,
  logEvent,
  restoringEpisodesForSeries,
  setArchiveEpisodesStatus,
  type ArchiveEpisodeRow,
} from './queries';
import {
  getArchivePlaceholderConfig,
  getMediaServerType,
  getPlexBaseUrl,
  getServerToken,
  getSonarrInstances,
} from './settings';
import { refreshPlexSection } from './plex';

function instanceById(instanceId: string) {
  return getSonarrInstances().find((instance) => instance.id === instanceId) ?? null;
}

export async function requestArchiveRestore(input: {
  instanceId: string;
  episodeIds: number[];
  source: 'manual' | 'plex';
}): Promise<{ ok: boolean; requested: number; alreadyRunning?: boolean; error?: string }> {
  const instance = instanceById(input.instanceId);
  if (!instance) return { ok: false, requested: 0, error: 'sonarr_instance_missing' };
  const claimed = claimArchiveRestoreByEpisodes(input.instanceId, input.episodeIds);
  if (claimed.length === 0) return { ok: true, requested: 0, alreadyRunning: true };
  const episodeIds = claimed.map((row) => row.episodeId);
  try {
    await setSonarrEpisodesMonitored(instance, episodeIds, true);
    await searchSonarrEpisodes(instance, episodeIds);
    logEvent(
      'info',
      'archive',
      `Restore requested via ${input.source} for ${claimed[0].seriesTitle}: ${episodeIds.length} episode(s).`
    );
    return { ok: true, requested: episodeIds.length };
  } catch (error) {
    failRestoringArchiveEpisodes(input.instanceId, episodeIds, String(error));
    logEvent('error', 'archive', `Restore request failed: ${String(error)}`);
    return { ok: false, requested: 0, error: 'sonarr_unavailable' };
  }
}

export async function requestArchiveRestoreByPlexPath(
  plexPath: string
): Promise<{ ok: boolean; requested: number; matched: boolean }> {
  const rows = findArchivedEpisodesByPlexPath(plexPath);
  if (rows.length === 0) return { ok: true, requested: 0, matched: false };
  const result = await requestArchiveRestore({
    instanceId: rows[0].instanceId,
    episodeIds: rows.map((row) => row.episodeId),
    source: 'plex',
  });
  return { ok: result.ok, requested: result.requested, matched: true };
}

async function refreshSection(sectionId: string): Promise<void> {
  const config = getArchivePlaceholderConfig();
  if (!config.plexRefresh || getMediaServerType() !== 'plex') return;
  const baseUrl = getPlexBaseUrl();
  const token = getServerToken();
  if (baseUrl && token) await refreshPlexSection(baseUrl, token, sectionId);
}

/** Complete a restore only after Sonarr itself reports real files for every row. */
export async function finalizeRestoredSeries(
  instanceId: string,
  seriesId: number
): Promise<{ restored: number; removedPlaceholders: number }> {
  const rows = restoringEpisodesForSeries(instanceId, seriesId);
  if (rows.length === 0) return { restored: 0, removedPlaceholders: 0 };
  const instance = instanceById(instanceId);
  if (!instance) throw new Error('Sonarr instance no longer configured');
  const live = await getSonarrEpisodes(instance, seriesId);
  const byId = new Map(live.map((episode) => [episode.id, episode]));
  const readyFiles = new Set<number>();
  const grouped = new Map<number, ArchiveEpisodeRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.originalFileId) ?? [];
    group.push(row);
    grouped.set(row.originalFileId, group);
  }
  for (const [fileId, group] of grouped) {
    if (group.every((row) => {
      const episode = byId.get(row.episodeId);
      return episode?.hasFile === true && !!episode.episodeFileId;
    })) readyFiles.add(fileId);
  }
  const readyRows = rows.filter((row) => readyFiles.has(row.originalFileId));
  if (readyRows.length === 0) return { restored: 0, removedPlaceholders: 0 };

  const config = getArchivePlaceholderConfig();
  const paths = [...new Set(readyRows.map((row) => row.placeholderPath))];
  let removed = 0;
  for (const placeholderPath of paths) {
    if (removeManagedPlaceholder(config.archiveRoot, placeholderPath)) removed++;
  }
  setArchiveEpisodesStatus(instanceId, readyRows.map((row) => row.episodeId), 'restored');
  await refreshSection(readyRows[0].sectionId).catch((error) =>
    logEvent('warn', 'archive', `Plex refresh after restore failed: ${String(error)}`)
  );
  logEvent(
    'info',
    'archive',
    `Restored ${readyRows[0].seriesTitle}: ${readyRows.length} episode(s), ${removed} placeholder(s) removed.`
  );
  return { restored: readyRows.length, removedPlaceholders: removed };
}