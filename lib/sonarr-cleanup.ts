import { getDb } from './db';
import { getSonarrInstances } from './settings';
import { logEvent } from './queries';
import { deleteSonarrSeries, findSonarrSeriesByTvdbId, listSonarrSeries, type SonarrSeries } from './arr';

/** Called only after an acknowledged/recovered Maintainerr membership write. */
export function trackSonarrHandoff(ratingKey: string, action: 'add' | 'remove'): void {
  const db = getDb();
  if (action === 'remove') {
    db.prepare('DELETE FROM maintainerr_sonarr_cleanup WHERE rating_key = ?').run(ratingKey);
    return;
  }
  const item = db.prepare("SELECT guid_tvdb FROM media_items WHERE rating_key = ? AND library_kind = 'show'")
    .get(ratingKey) as { guid_tvdb: string | null } | undefined;
  if (!item?.guid_tvdb || !/^[1-9]\d*$/.test(item.guid_tvdb)) return;
  const instances = getSonarrInstances();
  for (const target of instances) {
    const source = instances.find((row) => row.id === target.deleteAfterSourceId);
    if (!source || source.id === target.id || source.url === target.url || source.deleteAfterSourceId) continue;
    const seen = db.prepare("SELECT 1 FROM arr_items WHERE rating_key = ? AND instance_id = ? AND source = 'sonarr'")
      .get(ratingKey, source.id);
    db.prepare(`INSERT OR IGNORE INTO maintainerr_sonarr_cleanup
      (rating_key, tvdb_id, source_id, source_url, target_id, target_url, source_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(ratingKey, item.guid_tvdb, source.id, source.url, target.id, target.url, seen ? 1 : 0);
  }
}

interface CleanupRow {
  rating_key: string; tvdb_id: string; source_id: string; source_url: string;
  target_id: string; target_url: string; source_seen: number;
}

/** Fresh successful reads only; network/shape errors never mean absence. */
export async function cleanupSonarrHandoffs(report: { errors: number } = { errors: 0 }): Promise<number> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM maintainerr_sonarr_cleanup').all() as CleanupRow[];
  const instances = getSonarrInstances();
  const listings = new Map<string, SonarrSeries[]>();
  const read = async (id: string) => {
    if (!listings.has(id)) {
      const series = await listSonarrSeries(instances.find((row) => row.id === id)!);
      if (!Array.isArray(series) || series.some((row) => !row || !Number.isSafeInteger(row.id) || row.id <= 0 ||
          !Number.isSafeInteger(row.tvdbId) || row.tvdbId! <= 0)) {
        throw new Error('Unsafe Sonarr series listing; follow-up deletion blocked.');
      }
      listings.set(id, series);
    }
    return listings.get(id)!;
  };
  const retire = (row: CleanupRow) => db.prepare(`DELETE FROM maintainerr_sonarr_cleanup
    WHERE rating_key = ? AND source_id = ? AND target_id = ?`)
    .run(row.rating_key, row.source_id, row.target_id);
  let deleted = 0;
  const kept = (row: CleanupRow) => db.prepare(`SELECT 1 FROM keeps k JOIN media_items m ON m.rating_key = k.rating_key
    WHERE k.rating_key = ? OR instr(',' || COALESCE(m.guid_tvdb, '') || ',', ',' || ? || ',') > 0 LIMIT 1`)
    .get(row.rating_key, row.tvdb_id);
  const pending = (row: CleanupRow) => db.prepare(`SELECT 1 FROM maintainerr_sonarr_cleanup
    WHERE rating_key = ? AND tvdb_id = ? AND source_id = ? AND source_url = ?
      AND target_id = ? AND target_url = ? AND source_seen = 1`)
    .get(row.rating_key, row.tvdb_id, row.source_id, row.source_url, row.target_id, row.target_url);
  for (const row of rows) {
    try {
    const source = instances.find((inst) => inst.id === row.source_id && inst.url === row.source_url);
    const target = instances.find((inst) => inst.id === row.target_id && inst.url === row.target_url);
    if (!source || !target || target.deleteAfterSourceId !== source.id || source.deleteAfterSourceId ||
        source.id === target.id || source.url === target.url) { retire(row); continue; }
    // Protect every Plex representation of the same TVDB title, not just the handed-off key.
    if (kept(row)) {
      logEvent('info', 'sonarr-cleanup', `TVDB ${row.tvdb_id}: Keep veto; follow-up deletion cancelled on ${target.name || target.id}.`);
      retire(row); continue;
    }
    if ((await read(source.id)).some((series) => String(series.tvdbId) === row.tvdb_id)) {
      db.prepare(`UPDATE maintainerr_sonarr_cleanup SET source_seen = 1
        WHERE rating_key = ? AND source_id = ? AND target_id = ?`)
        .run(row.rating_key, row.source_id, row.target_id);
      continue;
    }
    // Never propagate pre-existing absence unless this source was observed owning the title.
    if (!row.source_seen) continue;
    const matches = (await read(target.id)).filter((series) => String(series.tvdbId) === row.tvdb_id);
    if (matches.length > 1) throw new Error('Ambiguous Sonarr TVDB match; follow-up deletion blocked.');
    if (matches.length === 1) {
      // Network reads yield control: re-check protection and source immediately before writing.
      if ((await findSonarrSeriesByTvdbId(source, Number(row.tvdb_id))).length > 0) continue;
      const current = getSonarrInstances();
      if (!pending(row) || kept(row) || !current.some((inst) => inst.id === target.id && inst.url === target.url &&
          inst.deleteAfterSourceId === source.id) ||
          !current.some((inst) => inst.id === source.id && inst.url === source.url && !inst.deleteAfterSourceId)) continue;
      await deleteSonarrSeries(target, matches[0].id);
      deleted++;
      db.transaction(() => {
        db.prepare("DELETE FROM arr_items WHERE source = 'sonarr' AND instance_id = ? AND arr_id = ?")
          .run(target.id, matches[0].id);
        db.prepare("DELETE FROM arr_unmatched WHERE source = 'sonarr' AND instance_id = ? AND ext_kind = 'tvdb' AND ext_id = ?")
          .run(target.id, row.tvdb_id);
      })();
      logEvent('info', 'sonarr-cleanup', `${matches[0].title} (TVDB ${row.tvdb_id}): deleted series and files from ${target.name || target.id}.`);
    }
    retire(row);
    } catch {
      report.errors++;
      // Do not log raw connector errors: URLs or credentials may be included.
      logEvent('warn', 'sonarr-cleanup', `TVDB ${row.tvdb_id}: follow-up deletion on target ${row.target_id} could not be confirmed; pending work retained for retry.`);
    }
  }
  return deleted;
}