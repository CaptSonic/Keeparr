import {
  latestWatchedAtByItem,
  listAutomationReleases,
  markedForDeleteItems,
} from './queries';
import {
  getMaintainerrConfig,
  getMaintainerrManagedItems,
  isMaintainerrConfigured,
  setMaintainerrManagedItems,
} from './settings';
import type { JobResult } from './sync';
import { getReclaimSignalReadiness } from './reclaim-readiness';

const REQUEST_TIMEOUT_MS = 15_000;

export interface MaintainerrCollection {
  id: number;
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  libraryId: string;
  arrAction: number;
  isActive: boolean;
  deleteAfterDays: number | null;
  keepInMaintainerrOnly: boolean;
  tagInArr: boolean;
}

interface MaintainerrRuleGroup {
  useRules?: boolean;
}

interface MaintainerrMember {
  mediaServerId: string;
}

function baseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Maintainerr URL must use HTTP or HTTPS.');
  }
  return parsed.toString().replace(/\/$/, '');
}

async function maintainerrRequest(
  base: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(`${baseUrl(base)}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Maintainerr ${path} returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Maintainerr ${path} returned invalid JSON.`);
  }
}

function parseCollection(value: unknown): MaintainerrCollection | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const type = row.type;
  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    typeof row.title !== 'string' ||
    typeof row.libraryId !== 'string' ||
    (type !== 'movie' && type !== 'show' && type !== 'season' && type !== 'episode') ||
    !Number.isInteger(Number(row.arrAction))
  ) return null;
  return {
    id,
    title: row.title,
    type,
    libraryId: row.libraryId,
    arrAction: Number(row.arrAction),
    isActive: row.isActive !== false,
    deleteAfterDays: row.deleteAfterDays == null ? null : Number(row.deleteAfterDays),
    keepInMaintainerrOnly: row.keepInMaintainerrOnly === true,
    tagInArr: row.tagInArr === true,
  };
}

export async function listMaintainerrCollections(url: string): Promise<MaintainerrCollection[]> {
  const body = await maintainerrRequest(url, '/api/collections/overlay-data');
  if (!Array.isArray(body)) {
    throw new Error('Maintainerr returned an invalid collection list.');
  }
  const collections = body.map(parseCollection);
  if (collections.some((c) => c === null)) {
    throw new Error('Maintainerr returned an unsupported collection record.');
  }
  return (collections as MaintainerrCollection[]).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

export async function testMaintainerr(url: string): Promise<{
  ok: boolean;
  message: string;
  collections?: MaintainerrCollection[];
}> {
  try {
    const collections = await listMaintainerrCollections(url);
    return {
      ok: true,
      message: `Reached Maintainerr (${collections.length} collection(s)).`,
      collections,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function ruleGroupForCollection(
  url: string,
  collectionId: number
): Promise<MaintainerrRuleGroup> {
  const body = await maintainerrRequest(url, `/api/rules/collection/${collectionId}`);
  if (!body || typeof body !== 'object') {
    throw new Error(`Maintainerr collection #${collectionId} has no rule group.`);
  }
  return body as MaintainerrRuleGroup;
}

async function collectionMembers(url: string, collectionId: number): Promise<Set<string>> {
  const body = await maintainerrRequest(
    url,
    `/api/collections/media/?collectionId=${collectionId}`
  );
  if (!Array.isArray(body)) {
    throw new Error(`Maintainerr returned invalid members for collection #${collectionId}.`);
  }
  const ids = new Set<string>();
  for (const value of body) {
    if (!value || typeof value !== 'object') {
      throw new Error(`Maintainerr returned an invalid member for collection #${collectionId}.`);
    }
    const id = (value as Partial<MaintainerrMember>).mediaServerId;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new Error(`Maintainerr returned an invalid media id for collection #${collectionId}.`);
    }
    ids.add(String(id));
  }
  return ids;
}

async function changeMembership(
  url: string,
  collectionId: number,
  ids: string[],
  action: 'add' | 'remove'
): Promise<void> {
  if (ids.length === 0) return;
  const media = ids.map((mediaServerId) => ({ mediaServerId }));
  await maintainerrRequest(url, `/api/collections/${action}`, {
    method: 'POST',
    body: JSON.stringify({ collectionId, media, ...(action === 'add' ? { manual: true } : {}) }),
  });
}

interface Target {
  collection: MaintainerrCollection;
  current: Set<string>;
  desired: Set<string>;
  managed: Set<string>;
}

interface MaintainerrCandidate {
  ratingKey: string;
  sectionId: string;
  libraryKind: 'movie' | 'show';
}

/**
 * Maintainerr receives both explicit requester sign-offs ("OK to delete") and
 * reviewed releases from closed cleanup campaigns. The global keep veto stays
 * live for both sources; duplicate titles collapse to one media-server id.
 */
function maintainerrCandidates(): {
  items: MaintainerrCandidate[];
  requesterReleases: number;
  campaignReleases: number;
} {
  const requester = markedForDeleteItems().filter((item) => !item.keptByAnyone);
  const campaign = listAutomationReleases();
  const byId = new Map<string, MaintainerrCandidate>();
  for (const item of requester) {
    byId.set(item.ratingKey, {
      ratingKey: item.ratingKey,
      sectionId: item.sectionId,
      libraryKind: item.libraryKind,
    });
  }
  for (const item of campaign) {
    byId.set(item.ratingKey, {
      ratingKey: item.ratingKey,
      sectionId: item.sectionId,
      libraryKind: item.libraryKind,
    });
  }
  return {
    items: [...byId.values()],
    requesterReleases: requester.length,
    campaignReleases: campaign.length,
  };
}

function watchEligibleCandidates(
  candidates: MaintainerrCandidate[],
  watchAgeDays: number
): { items: MaintainerrCandidate[]; recentlyWatched: number; watchReady: boolean } {
  if (!getReclaimSignalReadiness().watch) {
    return { items: [], recentlyWatched: 0, watchReady: false };
  }
  const cutoff = Math.floor(Date.now() / 1000) - watchAgeDays * 86400;
  const latest = latestWatchedAtByItem();
  const items = candidates.filter((item) => {
    const watchedAt = latest.get(item.ratingKey);
    return watchedAt == null || watchedAt <= cutoff;
  });
  return {
    items,
    recentlyWatched: candidates.length - items.length,
    watchReady: true,
  };
}

/**
 * Reconcile Keeparr's live release set into two non-destructive Maintainerr
 * collections. This function NEVER calls Maintainerr's handle/delete endpoints.
 * All targets are validated and read before the first write (fail closed).
 */
export async function syncMaintainerr(): Promise<JobResult> {
  const config = getMaintainerrConfig();
  const managedState = getMaintainerrManagedItems();
  if (!config.url || (!isMaintainerrConfigured() && Object.keys(managedState).length === 0)) {
    return { result: 0, message: 'Maintainerr hand-off is not configured.' };
  }
  if (
    config.enabled &&
    config.movieCollectionId !== null &&
    config.movieCollectionId === config.showCollectionId
  ) {
    throw new Error('Maintainerr movie and show collections must be different.');
  }
  const selected = config.enabled
    ? [
        config.movieCollectionId ? { id: config.movieCollectionId, kind: 'movie' as const } : null,
        config.showCollectionId ? { id: config.showCollectionId, kind: 'show' as const } : null,
      ].filter((v): v is { id: number; kind: 'movie' | 'show' } => v !== null)
    : [];
  const collections = new Map(
    (await listMaintainerrCollections(config.url)).map((collection) => [collection.id, collection])
  );
  const candidates = maintainerrCandidates();
  const watch = watchEligibleCandidates(candidates.items, config.watchAgeDays);
  const releases = watch.items;
  const targets: Target[] = [];
  const selectedById = new Map(selected.map((value) => [value.id, value.kind]));
  const targetIds = new Set([
    ...selected.map((value) => value.id),
    ...Object.keys(managedState)
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  ]);

  // Validate every target and read every membership before changing anything.
  for (const collectionId of targetIds) {
    const collection = collections.get(collectionId);
    if (!collection) throw new Error(`Maintainerr collection #${collectionId} was not found.`);
    if (collection.type !== 'movie' && collection.type !== 'show') {
      throw new Error(`Maintainerr collection “${collection.title}” has an unsupported media type.`);
    }
    const selectedKind = selectedById.get(collectionId);
    if (selectedKind && collection.type !== selectedKind) {
      throw new Error(
        `Maintainerr collection “${collection.title}” must contain ${selectedKind} items.`
      );
    }
    if (!collection.isActive) {
      throw new Error(`Maintainerr collection “${collection.title}” is inactive.`);
    }
    if (collection.tagInArr) {
      throw new Error(
        `Maintainerr sync blocked: disable *arr tagging for collection “${collection.title}”.`
      );
    }
    const ruleGroup = await ruleGroupForCollection(config.url, collection.id);
    if (ruleGroup.useRules !== false) {
      throw new Error(
        `Maintainerr sync blocked: disable Use rules for collection “${collection.title}”.`
      );
    }
    const current = await collectionMembers(config.url, collection.id);
    const desired = new Set(
      selectedKind
        ? releases
            .filter((item) =>
              item.libraryKind === selectedKind && item.sectionId === collection.libraryId
            )
            .map((item) => item.ratingKey)
        : []
    );
    targets.push({
      collection,
      current,
      desired,
      managed: new Set(managedState[String(collection.id)] ?? []),
    });
  }

  let added = 0;
  let removed = 0;
  // Keep vetoes first: only remove memberships previously managed by Keeparr.
  for (const target of targets) {
    const remove = [...target.managed].filter(
      (id) => target.current.has(id) && !target.desired.has(id)
    );
    await changeMembership(config.url, target.collection.id, remove, 'remove');
    removed += remove.length;
    for (const id of remove) target.managed.delete(id);
    setMaintainerrManagedItems(
      Object.fromEntries(targets.map((t) => [String(t.collection.id), [...t.managed].sort()]))
    );
  }
  // Only after every removal succeeded, add new desired memberships.
  for (const target of targets) {
    const add = [...target.desired].filter((id) => !target.current.has(id));
    await changeMembership(config.url, target.collection.id, add, 'add');
    added += add.length;
    for (const id of add) target.managed.add(id);
    setMaintainerrManagedItems(
      Object.fromEntries(targets.map((t) => [String(t.collection.id), [...t.managed].sort()]))
    );
  }

  const nextState: Record<string, string[]> = {};
  for (const target of targets) {
    const owned = [...target.managed].filter((id) => target.desired.has(id)).sort();
    if (owned.length > 0 || selectedById.has(target.collection.id)) {
      nextState[String(target.collection.id)] = owned;
    }
  }
  setMaintainerrManagedItems(nextState);
  const matched = targets.reduce((sum, target) => sum + target.desired.size, 0);
  const skipped = releases.length - matched;
  return {
    result: added + removed,
    message:
      `Maintainerr hand-off: ${added} added, ${removed} removed, ${matched} managed; ` +
      `${candidates.requesterReleases} requester release(s), ` +
      `${candidates.campaignReleases} closed-campaign release(s), ` +
      (watch.watchReady
        ? `${watch.recentlyWatched} watched within ${config.watchAgeDays} day(s)`
        : 'watch data not ready — all Keeparr memberships withdrawn') +
      `${skipped ? `, ${skipped} outside selected libraries` : ''}.`,
  };
}
