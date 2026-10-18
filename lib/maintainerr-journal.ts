import { getDb } from './db';

export interface PendingMembership {
  collectionId: number;
  ratingKey: string;
  action: 'add' | 'remove';
  planHash: string;
}

export function pendingMemberships(url: string): PendingMembership[] {
  return getDb().prepare(`SELECT collection_id AS collectionId, rating_key AS ratingKey,
    action, plan_hash AS planHash FROM maintainerr_pending_writes WHERE instance_url = ?`)
    .all(url) as PendingMembership[];
}

export function journalMemberships(url: string, collectionId: number, ids: string[],
  action: 'add' | 'remove', planHash: string): void {
  const db = getDb();
  const insert = db.prepare(`INSERT INTO maintainerr_pending_writes
    (instance_url, collection_id, rating_key, action, plan_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const id of ids) insert.run(url, collectionId, id, action, planHash, Math.floor(Date.now() / 1000));
  })();
}

export function clearPendingMembership(url: string, collectionId: number, ratingKey: string): void {
  getDb().prepare(`DELETE FROM maintainerr_pending_writes
    WHERE instance_url = ? AND collection_id = ? AND rating_key = ?`).run(url, collectionId, ratingKey);
}