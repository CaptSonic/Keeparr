import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH } from './config';
import { applySchema, closeDbForSwap, getDb } from './db';
import { getBackupRetention } from './settings';
import type { JobResult } from './sync';

/**
 * SQLite backup & restore. Everything Keeparr persists (media, keeps, users,
 * settings — secrets stay encrypted) lives in keeparr.db, so a backup is one
 * file. Snapshots are taken with better-sqlite3's online backup API, which is
 * safe against a live WAL database (readers/writers keep working).
 *
 * The poster cache (DATA_DIR/cache) is deliberately NOT backed up — it's
 * rebuildable from the media server.
 */

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export class BackupValidationError extends Error {
  constructor() {
    super('Backup is damaged or incompatible with this Keeparr version.');
    this.name = 'BackupValidationError';
  }
}

/** Validate and migrate an isolated copy, never the original or live database. */
function validateRestore(database: Database.Database): void {
  if (database.pragma('integrity_check', { simple: true }) !== 'ok') throw new BackupValidationError();
  // These persisted core tables distinguish historical Keeparr snapshots from
  // empty/foreign SQLite files; applySchema must not manufacture their contents.
  for (const table of ['media_items', 'users', 'keeps', 'settings']) {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new BackupValidationError();
    }
  }
  applySchema(database);
  const reference = new Database(':memory:');
  try {
    applySchema(reference);
    const tables = reference.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      const expected = reference.pragma(`table_info("${name}")`) as { name: string; type: string; pk: number }[];
      const actual = database.pragma(`table_info("${name}")`) as { name: string; type: string; pk: number }[];
      if (expected.some((column) => !actual.some((found) => found.name === column.name &&
          found.type === column.type && found.pk === column.pk))) throw new BackupValidationError();
    }
  } finally {
    reference.close();
  }
  if ((database.pragma('foreign_key_check') as unknown[]).length > 0 ||
      database.pragma('integrity_check', { simple: true }) !== 'ok') throw new BackupValidationError();
}

/** keeparr-20260706-193000.db (+ the pre-restore safety snapshots; an optional
 *  numeric suffix disambiguates same-second creates). */
const NAME_RE = /^keeparr(?:-pre-restore)?-\d{8}-\d{6}(?:-\d+)?\.db$/;

export interface BackupFile {
  name: string;
  sizeBytes: number;
  /** Unix seconds (file mtime). */
  createdAt: number;
}

/** Validate a user-supplied backup filename (no traversal, exact shape). */
export function isValidBackupName(name: string): boolean {
  return NAME_RE.test(name);
}

function timestamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Snapshot the live database. Returns the created file name. */
export async function createBackup(prefix = 'keeparr'): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const base = `${prefix}-${timestamp()}`;
  let name = `${base}.db`;
  // Same-second creates get a numeric suffix instead of overwriting.
  for (let i = 1; fs.existsSync(path.join(BACKUP_DIR, name)); i++) {
    name = `${base}-${i}.db`;
  }
  await getDb().backup(path.join(BACKUP_DIR, name));
  return name;
}

/** All backups, newest first. */
export function listBackups(): BackupFile[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => isValidBackupName(f))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return {
        name,
        sizeBytes: st.size,
        createdAt: Math.floor(st.mtimeMs / 1000),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function backupPath(name: string): string {
  if (!isValidBackupName(name)) throw new Error('Invalid backup name');
  return path.join(BACKUP_DIR, name);
}

export function deleteBackup(name: string): boolean {
  const p = backupPath(name);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  // Restoring FROM a WAL-mode backup can leave empty sidecars — sweep them.
  for (const suffix of ['-wal', '-shm']) fs.rmSync(`${p}${suffix}`, { force: true });
  return true;
}

/** Drop the oldest backups beyond `keep`. Returns how many were removed. */
export function pruneBackups(keep: number): number {
  const extra = listBackups().slice(Math.max(1, keep));
  for (const b of extra) deleteBackup(b.name);
  return extra.length;
}

/** The scheduled 'backup' job: snapshot + prune to the retention setting. */
export async function runBackup(): Promise<JobResult> {
  const name = await createBackup();
  const pruned = pruneBackups(getBackupRetention());
  return {
    result: 1,
    message: `Backed up to ${name}${pruned ? ` (pruned ${pruned} old)` : ''}.`,
  };
}

/**
 * Restore a backup over the live database.
 *
 * Sequence: stage, validate and migrate an isolated copy → snapshot the CURRENT
 * db (keeparr-pre-restore-…, the safety net) → online-backup the validated copy
 * INTO the live DB_PATH → reopen the singleton.
 *
 * Restoring via SQLite's backup API (instead of deleting/copying the file)
 * matters: it takes proper locks, so it's safe even when OTHER connections
 * hold the file — on Windows an unlink of the -wal sidecar fails with EBUSY
 * while any handle is open (Next dev keeps a second module copy alive via the
 * instrumentation context). Existing connections simply see the new content.
 */
export async function restoreBackup(name: string): Promise<{ safetyNet: string }> {
  const srcPath = backupPath(name);
  if (!fs.existsSync(srcPath)) throw new Error(`Backup not found: ${name}`);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeparr-restore-'));
  let candidate: Database.Database | undefined;
  try {
    // Snapshot once: validation and restore use the same bytes even if the
    // selected backup is replaced/deleted while the safety net is being made.
    try {
      const src = new Database(srcPath, { readonly: true, fileMustExist: true });
      try {
        await src.backup(path.join(stagingDir, 'candidate.db'));
      } finally {
        src.close();
      }
      candidate = new Database(path.join(stagingDir, 'candidate.db'), { fileMustExist: true });
      validateRestore(candidate);
    } catch {
      throw new BackupValidationError();
    }
    const safetyNet = await createBackup('keeparr-pre-restore');
    await candidate.backup(DB_PATH);
    closeDbForSwap();
    getDb();
    return { safetyNet };
  } finally {
    candidate?.close();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
