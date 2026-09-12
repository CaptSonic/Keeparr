import {
  getMediaItem,
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
import { getBackend } from './mediaserver';

// Maintainerr's membership endpoint can take noticeably longer for large visible
// collections than its lightweight health endpoints. Keep a finite ceiling, but
// do not abort healthy local instances at the generic connector default of 15s.
const REQUEST_TIMEOUT_MS = 60_000;

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
  let response: Response;
  try {
    response = await fetch(`${baseUrl(base)}${path}`, {
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new Error(`Maintainerr ${path} timed out after 60 seconds.`);
    }
    throw error;
  }
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
  collection: MaintainerrCollection & { type: 'movie' | 'show' };
  current: Set<string>;
  desired: Set<string>;
  managed: Set<string>;
}

interface MaintainerrCandidate {
  ratingKey: string;
  sectionId: string;
  libraryKind: 'movie' | 'show';
  title: string;
  year: number | null;
  source: 'requester' | 'campaign' | 'both';
  kept: boolean;
}

export type MaintainerrPreviewStatus =
  | 'add'
  | 'remove'
  | 'managed'
  | 'manual'
  | 'blocked_keep'
  | 'blocked_recent'
  | 'missing'
  | 'outside'
  | 'paused';

export interface MaintainerrPreviewItem {
  ratingKey: string;
  title: string;
  year: number | null;
  libraryKind: 'movie' | 'show';
  collectionId: number | null;
  collectionTitle: string | null;
  source: 'requester' | 'campaign' | 'both' | 'managed' | 'manual';
  status: MaintainerrPreviewStatus;
  reason: string;
  lastWatched: number | null;
}

export interface MaintainerrPreviewCollection {
  id: number;
  title: string;
  type: 'movie' | 'show';
  selected: boolean;
  current: number;
  managed: number;
  desired: number;
  add: number;
  remove: number;
}

export interface MaintainerrPreview {
  generatedAt: number;
  paused: boolean;
  pauseReason: 'not_configured' | 'inventory_unavailable' | null;
  watchReady: boolean;
  watchAgeDays: number;
  requesterReleases: number;
  campaignReleases: number;
  collections: MaintainerrPreviewCollection[];
  items: MaintainerrPreviewItem[];
  summary: Record<MaintainerrPreviewStatus, number>;
}

interface MaintainerrPlan {
  preview: MaintainerrPreview;
  targets: Target[];
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
  const requester = markedForDeleteItems();
  const campaign = listAutomationReleases();
  const byId = new Map<string, MaintainerrCandidate>();
  for (const item of requester) {
    byId.set(item.ratingKey, {
      ratingKey: item.ratingKey,
      sectionId: item.sectionId,
      libraryKind: item.libraryKind,
      title: item.title,
      year: item.year,
      source: 'requester',
      kept: item.keptByAnyone,
    });
  }
  for (const item of campaign) {
    const previous = byId.get(item.ratingKey);
    byId.set(item.ratingKey, {
      ratingKey: item.ratingKey,
      sectionId: item.sectionId,
      libraryKind: item.libraryKind,
      title: item.title,
      year: item.year,
      source: previous ? 'both' : 'campaign',
      kept: false,
    });
  }
  return {
    items: [...byId.values()],
    requesterReleases: requester.filter((item) => !item.keptByAnyone).length,
    campaignReleases: campaign.length,
  };
}

async function liveInventoryCandidates(
  candidates: MaintainerrCandidate[]
): Promise<{ items: MaintainerrCandidate[]; missing: number; inventoryReady: boolean }> {
  if (candidates.length === 0) {
    return { items: [], missing: 0, inventoryReady: true };
  }
  try {
    const backend = getBackend();
    const items: MaintainerrCandidate[] = [];
    for (let offset = 0; offset < candidates.length; offset += 8) {
      const batch = candidates.slice(offset, offset + 8);
      const availability = await Promise.all(
        batch.map((item) => backend.itemExists(item.ratingKey, item.libraryKind))
      );
      for (let index = 0; index < batch.length; index++) {
        if (availability[index]) items.push(batch[index]);
      }
    }
    return {
      items,
      missing: candidates.length - items.length,
      inventoryReady: true,
    };
  } catch {
    return { items: [], missing: 0, inventoryReady: false };
  }
}

const previewStatuses: MaintainerrPreviewStatus[] = [
  'add', 'remove', 'managed', 'manual', 'blocked_keep',
  'blocked_recent', 'missing', 'outside', 'paused',
];

function mediaLabel(ratingKey: string): {
  title: string;
  year: number | null;
  libraryKind: 'movie' | 'show';
} {
  const media = getMediaItem(ratingKey);
  return {
    title: media?.title ?? `Media ${ratingKey}`,
    year: media?.year ?? null,
    libraryKind: media?.library_kind ?? 'movie',
  };
}

/** Build the exact reconciliation plan without mutating Maintainerr or ownership. */
async function buildMaintainerrPlan(): Promise<MaintainerrPlan> {
  const config = getMaintainerrConfig();
  const managedState = getMaintainerrManagedItems();
  if (!config.url || (!isMaintainerrConfigured() && Object.keys(managedState).length === 0)) {
    return {
      targets: [],
      preview: {
        generatedAt: Math.floor(Date.now() / 1000),
        paused: true,
        pauseReason: 'not_configured',
        watchReady: getReclaimSignalReadiness().watch,
        watchAgeDays: config.watchAgeDays,
        requesterReleases: 0,
        campaignReleases: 0,
        collections: [],
        items: [],
        summary: Object.fromEntries(
          previewStatuses.map((status) => [status, 0])
        ) as Record<MaintainerrPreviewStatus, number>,
      },
    };
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
  const selectedLibraries = new Set(
    selected.flatMap(({ id, kind }) => {
      const collection = collections.get(id);
      return collection ? [`${kind}\0${collection.libraryId}`] : [];
    })
  );
  const selectedCandidates = candidates.items.filter((item) =>
    selectedLibraries.has(`${item.libraryKind}\0${item.sectionId}`)
  );
  const eligibleCandidates = selectedCandidates.filter((item) => !item.kept);
  const inventory = await liveInventoryCandidates(eligibleCandidates);
  const inventoryIds = new Set(inventory.items.map((item) => item.ratingKey));
  const watchReady = getReclaimSignalReadiness().watch;
  const latest = latestWatchedAtByItem();
  const cutoff = Math.floor(Date.now() / 1000) - config.watchAgeDays * 86400;
  const desiredCandidates = inventory.items.filter((item) => {
    const watchedAt = latest.get(item.ratingKey);
    return watchReady && (watchedAt == null || watchedAt <= cutoff);
  });
  const desiredIds = new Set(desiredCandidates.map((item) => item.ratingKey));
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
    const targetCollection = collection as MaintainerrCollection & {
      type: 'movie' | 'show';
    };
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
        ? desiredCandidates
            .filter((item) =>
              item.libraryKind === selectedKind && item.sectionId === collection.libraryId
            )
            .map((item) => item.ratingKey)
        : []
    );
    targets.push({
      collection: targetCollection,
      current,
      desired,
      managed: new Set(managedState[String(collection.id)] ?? []),
    });
  }

  const paused = !inventory.inventoryReady;
  const pauseReason = paused ? 'inventory_unavailable' : null;
  const items: MaintainerrPreviewItem[] = [];
  const candidateById = new Map(candidates.items.map((item) => [item.ratingKey, item]));
  const targetByLibrary = new Map(
    targets
      .filter((target) => selectedById.has(target.collection.id))
      .map((target) => [
        `${target.collection.type}\0${target.collection.libraryId}`,
        target,
      ])
  );

  for (const item of candidates.items) {
    const selectedTarget = targetByLibrary.get(`${item.libraryKind}\0${item.sectionId}`);
    const ownedTarget = targets.find((target) => target.managed.has(item.ratingKey));
    const target = selectedTarget ?? ownedTarget;
    const managed = target?.managed.has(item.ratingKey) ?? false;
    const current = target?.current.has(item.ratingKey) ?? false;
    const lastWatched = latest.get(item.ratingKey) ?? null;
    let status: MaintainerrPreviewStatus;
    let reason: string;
    if (!selectedTarget && managed && current && !paused) {
      status = 'remove';
      reason = 'outside_selected_library';
    } else if (!selectedTarget) {
      status = 'outside';
      reason = 'outside_selected_library';
    } else if (paused) {
      status = 'paused';
      reason = 'inventory_unavailable';
    } else if (current && !managed) {
      status = 'manual';
      reason = 'existing_foreign_member';
    } else if (managed && current && !desiredIds.has(item.ratingKey)) {
      status = 'remove';
      reason = item.kept
        ? 'global_keep'
        : !watchReady
          ? 'watch_cache_untrusted'
          : !inventoryIds.has(item.ratingKey)
            ? 'missing_from_media_server'
            : 'watched_too_recently';
    } else if (item.kept) {
      status = 'blocked_keep';
      reason = 'global_keep';
    } else if (!inventoryIds.has(item.ratingKey)) {
      status = 'missing';
      reason = 'missing_from_media_server';
    } else if (!watchReady) {
      status = 'paused';
      reason = 'watch_cache_untrusted';
    } else if (lastWatched !== null && lastWatched > cutoff) {
      status = 'blocked_recent';
      reason = 'watched_too_recently';
    } else if (current && managed) {
      status = 'managed';
      reason = 'already_managed';
    } else {
      status = 'add';
      reason = lastWatched === null ? 'never_watched' : 'watch_age_met';
    }
    items.push({
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year,
      libraryKind: item.libraryKind,
      collectionId: target?.collection.id ?? null,
      collectionTitle: target?.collection.title ?? null,
      source: item.source,
      status,
      reason,
      lastWatched,
    });
  }

  // Include remote members that have no current release candidate so the preview
  // also explains foreign/manual rows and planned cleanup of old Keeparr ownership.
  for (const target of targets) {
    for (const ratingKey of new Set([...target.current, ...target.managed])) {
      if (candidateById.has(ratingKey)) continue;
      const label = mediaLabel(ratingKey);
      const managed = target.managed.has(ratingKey);
      const current = target.current.has(ratingKey);
      items.push({
        ratingKey,
        title: label.title,
        year: label.year,
        libraryKind: target.collection.type,
        collectionId: target.collection.id,
        collectionTitle: target.collection.title,
        source: managed ? 'managed' : 'manual',
        status: paused
          ? 'paused'
          : managed && current
            ? 'remove'
            : 'manual',
        reason: paused
          ? 'inventory_unavailable'
          : managed && current
            ? 'release_revoked'
            : current
              ? 'existing_foreign_member'
              : 'ownership_stale',
        lastWatched: latest.get(ratingKey) ?? null,
      });
    }
  }

  const summary = Object.fromEntries(
    previewStatuses.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ])
  ) as Record<MaintainerrPreviewStatus, number>;
  const preview: MaintainerrPreview = {
    generatedAt: Math.floor(Date.now() / 1000),
    paused,
    pauseReason,
    watchReady,
    watchAgeDays: config.watchAgeDays,
    requesterReleases: candidates.requesterReleases,
    campaignReleases: candidates.campaignReleases,
    collections: targets.map((target) => ({
      id: target.collection.id,
      title: target.collection.title,
      type: target.collection.type,
      selected: selectedById.has(target.collection.id),
      current: target.current.size,
      managed: target.managed.size,
      desired: target.desired.size,
      add: [...target.desired].filter((id) => !target.current.has(id)).length,
      remove: paused
        ? 0
        : [...target.managed].filter(
            (id) => target.current.has(id) && !target.desired.has(id)
          ).length,
    })),
    items: items.sort((a, b) =>
      previewStatuses.indexOf(a.status) - previewStatuses.indexOf(b.status) ||
      a.title.localeCompare(b.title)
    ),
    summary,
  };
  return { preview, targets };
}

/** Read-only dry run used by the Maintainerr Control Center. */
export async function previewMaintainerr(): Promise<MaintainerrPreview> {
  return (await buildMaintainerrPlan()).preview;
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
  const { preview, targets } = await buildMaintainerrPlan();

  // An unavailable live inventory is uncertainty, not evidence that every title
  // disappeared. Freeze both membership and ownership state so a transient media-
  // server timeout cannot reset Maintainerr's grace periods through remove/re-add.
  if (preview.paused) {
    return {
      result: 0,
      message:
        'Maintainerr hand-off paused: media-server inventory not ready; ' +
        'existing memberships left unchanged.',
    };
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
  const selectedIds = new Set(
    preview.collections.filter((collection) => collection.selected).map((collection) => collection.id)
  );
  for (const target of targets) {
    const owned = [...target.managed].filter((id) => target.desired.has(id)).sort();
    if (owned.length > 0 || selectedIds.has(target.collection.id)) {
      nextState[String(target.collection.id)] = owned;
    }
  }
  setMaintainerrManagedItems(nextState);
  const matched = targets.reduce((sum, target) => sum + target.desired.size, 0);
  const missing = preview.items.filter(
    (item) => item.reason === 'missing_from_media_server'
  ).length;
  const recentlyWatched = preview.items.filter(
    (item) => item.reason === 'watched_too_recently'
  ).length;
  return {
    result: added + removed,
    message:
      `Maintainerr hand-off: ${added} added, ${removed} removed, ${matched} managed; ` +
      `${preview.requesterReleases} requester release(s), ` +
      `${preview.campaignReleases} closed-campaign release(s), ` +
      `${missing} no longer on media server, ` +
      (preview.watchReady
        ? `${recentlyWatched} watched within ${config.watchAgeDays} day(s)`
        : 'watch data not ready — all Keeparr memberships withdrawn') +
      `${preview.summary.outside ? `, ${preview.summary.outside} outside selected libraries` : ''}.`,
  };
}
