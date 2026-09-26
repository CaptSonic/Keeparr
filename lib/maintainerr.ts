import { createHash } from 'node:crypto';
import {
  getMediaItem,
  isKept,
  latestWatchedAtByItem,
  listAutomationReleases,
  maintainerrArchiveExclusions,
  maintainerrAutomaticRuleMatches,
  maintainerrRuleTracking,
  markedForDeleteItems,
  recentMaintainerrHistory,
  reconcileMaintainerrRuleTracking,
  recordMaintainerrHistory,
  type MaintainerrAutomaticRule,
} from './queries';
import {
  approveMaintainerrPlan,
  approveMaintainerrReadd,
  clearMaintainerrPlanApproval,
  consumeMaintainerrPlanApproval,
  consumeMaintainerrReaddApproval,
  getMaintainerrConfig,
  getMaintainerrApprovedPlanHash,
  getMaintainerrApprovedReadds,
  getMaintainerrManagedItems,
  isMaintainerrReaddApproved,
  isMaintainerrConfigured,
  setMaintainerrManagedItems,
} from './settings';
import type { JobResult } from './sync';
import type { MaintainerrHistoryEvent } from './types';
import { getReclaimSignalReadiness } from './reclaim-readiness';
import { getBackend } from './mediaserver';

// Maintainerr's membership endpoint can take noticeably longer for large visible
// collections than its lightweight health endpoints. Keep a finite ceiling, but
// do not abort healthy local instances at the generic connector default of 15s.
const REQUEST_TIMEOUT_MS = 60_000;
const HISTORY_DEDUPE_SECONDS = 6 * 3600;
const MASS_CHANGE_MIN = 10;
const MASS_CHANGE_RATIO = 0.25;
const MASS_CHANGE_HARD_LIMIT = 50;

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
  add: Set<string>;
  remove: Set<string>;
  approvedReadds: Set<string>;
}

interface MaintainerrCandidate {
  ratingKey: string;
  sectionId: string;
  libraryKind: 'movie' | 'show';
  title: string;
  year: number | null;
  source: 'requester' | 'campaign' | 'both' | 'automatic' | 'mixed';
  kept: boolean;
  explicitRelease: boolean;
  automaticRules: MaintainerrAutomaticRule[];
  firstEligibleAt: number | null;
  dueAt: number | null;
  automaticDueAt: Partial<Record<MaintainerrAutomaticRule, number>>;
}

export type MaintainerrPreviewStatus =
  | 'add'
  | 'remove'
  | 'managed'
  | 'manual'
  | 'blocked_keep'
  | 'blocked_recent'
  | 'tracking'
  | 'missing'
  | 'outside'
  | 'readd_blocked'
  | 'paused';

export interface MaintainerrPreviewItem {
  ratingKey: string;
  title: string;
  year: number | null;
  libraryKind: 'movie' | 'show';
  collectionId: number | null;
  collectionTitle: string | null;
  source: 'requester' | 'campaign' | 'both' | 'automatic' | 'mixed' | 'managed' | 'manual';
  status: MaintainerrPreviewStatus;
  reason: string;
  lastWatched: number | null;
  dueAt: number | null;
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
  observationDays: number;
  requesterReleases: number;
  campaignReleases: number;
  planHash: string;
  totalChanges: number;
  massBlocked: boolean;
  massApproved: boolean;
  history: MaintainerrHistoryEvent[];
  collections: MaintainerrPreviewCollection[];
  items: MaintainerrPreviewItem[];
  summary: Record<MaintainerrPreviewStatus, number>;
}

interface MaintainerrPlan {
  preview: MaintainerrPreview;
  targets: Target[];
  automaticMatches: Array<{ ratingKey: string; rule: MaintainerrAutomaticRule }>;
}

/**
 * Maintainerr receives explicit requester sign-offs, reviewed closed-campaign
 * releases, and matured automatic watch-rule matches. The global Keep veto stays
 * live for every source; duplicate titles collapse to one media-server id.
 */
function maintainerrCandidates(
  automaticMatches: ReturnType<typeof maintainerrAutomaticRuleMatches>,
  archiveExclusions: Set<string>,
  observationDays: number,
  at: number
): {
  items: MaintainerrCandidate[];
  requesterReleases: number;
  campaignReleases: number;
} {
  const requester = markedForDeleteItems().filter(
    (item) => !archiveExclusions.has(item.ratingKey)
  );
  const campaign = listAutomationReleases().filter(
    (item) => !archiveExclusions.has(item.ratingKey)
  );
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
      explicitRelease: true,
      automaticRules: [],
      firstEligibleAt: null,
      dueAt: null,
      automaticDueAt: {},
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
      explicitRelease: true,
      automaticRules: previous?.automaticRules ?? [],
      firstEligibleAt: previous?.firstEligibleAt ?? null,
      dueAt: previous?.dueAt ?? null,
      automaticDueAt: previous?.automaticDueAt ?? {},
    });
  }
  const persisted = new Map(
    maintainerrRuleTracking().map((row) => [`${row.ratingKey}\0${row.rule}`, row])
  );
  for (const item of automaticMatches) {
    const previous = byId.get(item.rating_key);
    const tracking = persisted.get(`${item.rating_key}\0${item.rule}`);
    const firstEligibleAt = tracking?.firstEligibleAt ?? at;
    const dueAt = firstEligibleAt + observationDays * 86400;
    const automaticRules = [...new Set([
      ...(previous?.automaticRules ?? []), item.rule,
    ])];
    const earliestFirst = previous?.firstEligibleAt == null
      ? firstEligibleAt
      : Math.min(previous.firstEligibleAt, firstEligibleAt);
    const earliestDue = previous?.dueAt == null ? dueAt : Math.min(previous.dueAt, dueAt);
    const automaticDueAt = {
      ...(previous?.automaticDueAt ?? {}),
      [item.rule]: dueAt,
    };
    byId.set(item.rating_key, {
      ratingKey: item.rating_key,
      sectionId: item.section_id,
      libraryKind: item.library_kind,
      title: item.title,
      year: item.year,
      source: previous
        ? previous.explicitRelease ? 'mixed' : 'automatic'
        : 'automatic',
      kept: previous?.kept ?? false,
      explicitRelease: previous?.explicitRelease ?? false,
      automaticRules,
      firstEligibleAt: earliestFirst,
      dueAt: earliestDue,
      automaticDueAt,
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
  'blocked_recent', 'tracking', 'missing', 'outside', 'readd_blocked', 'paused',
];

function planHash(targets: Target[], maintainerrUrl = ''): string {
  const operations = targets
    .flatMap((target) => [
      ...[...target.add].map((ratingKey) => ({
        action: 'add', collectionId: target.collection.id,
        collectionType: target.collection.type,
        libraryId: target.collection.libraryId, ratingKey,
      })),
      ...[...target.remove].map((ratingKey) => ({
        action: 'remove', collectionId: target.collection.id,
        collectionType: target.collection.type,
        libraryId: target.collection.libraryId, ratingKey,
      })),
    ])
    .sort((a, b) =>
      a.collectionId - b.collectionId ||
      a.action.localeCompare(b.action) ||
      a.ratingKey.localeCompare(b.ratingKey)
    );
  return createHash('sha256')
    .update(JSON.stringify({ maintainerrUrl, operations }))
    .digest('hex');
}

function isMassChange(targets: Target[]): boolean {
  const total = targets.reduce((sum, target) => sum + target.add.size + target.remove.size, 0);
  if (total >= MASS_CHANGE_HARD_LIMIT) return true;
  return targets.some((target) => {
    const changes = target.add.size + target.remove.size;
    const baseline = Math.max(target.current.size, target.desired.size, 1);
    return changes >= MASS_CHANGE_MIN && changes / baseline >= MASS_CHANGE_RATIO;
  });
}

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
  const generatedAt = Math.floor(Date.now() / 1000);
  if (!config.url || (!isMaintainerrConfigured() && Object.keys(managedState).length === 0)) {
    return {
      targets: [],
      automaticMatches: [],
      preview: {
        generatedAt,
        paused: true,
        pauseReason: 'not_configured',
        watchReady: getReclaimSignalReadiness().watch,
        watchAgeDays: config.watchAgeDays,
        observationDays: config.observationDays,
        requesterReleases: 0,
        campaignReleases: 0,
        planHash: planHash([], config.url),
        totalChanges: 0,
        massBlocked: false,
        massApproved: false,
        history: recentMaintainerrHistory(100),
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
  const selectedLibraries = new Set(
    selected.flatMap(({ id, kind }) => {
      const collection = collections.get(id);
      return collection ? [`${kind}\0${collection.libraryId}`] : [];
    })
  );
  const watchReady = getReclaimSignalReadiness().watch;
  const archiveExclusions = maintainerrArchiveExclusions();
  const automaticRuleMatches = watchReady
    ? maintainerrAutomaticRuleMatches(generatedAt).filter((item) =>
        selectedLibraries.has(`${item.library_kind}\0${item.section_id}`) &&
        !archiveExclusions.has(item.rating_key)
      )
    : [];
  const automaticMatches = automaticRuleMatches.map((item) => ({
    ratingKey: item.rating_key,
    rule: item.rule,
  }));
  const candidates = maintainerrCandidates(
    automaticRuleMatches,
    archiveExclusions,
    config.observationDays,
    generatedAt
  );
  const selectedCandidates = candidates.items.filter((item) =>
    selectedLibraries.has(`${item.libraryKind}\0${item.sectionId}`)
  );
  const eligibleCandidates = selectedCandidates.filter((item) => !item.kept);
  const inventory = await liveInventoryCandidates(eligibleCandidates);
  const inventoryIds = new Set(inventory.items.map((item) => item.ratingKey));
  const latest = latestWatchedAtByItem();
  const cutoff = generatedAt - config.watchAgeDays * 86400;
  const desiredCandidates = inventory.items.filter((item) => {
    const watchedAt = latest.get(item.ratingKey);
    const explicitEligible = item.explicitRelease &&
      (watchedAt == null || watchedAt <= cutoff);
    const automaticEligible = item.dueAt !== null && item.dueAt <= generatedAt;
    return watchReady && (explicitEligible || automaticEligible);
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
      add: new Set(),
      remove: new Set(),
      approvedReadds: new Set(),
    });
  }

  for (const target of targets) {
    target.remove = new Set(
      [...target.current].filter((id) =>
        archiveExclusions.has(id) ||
        (target.managed.has(id) && !target.desired.has(id))
      )
    );
    for (const id of target.desired) {
      if (target.current.has(id)) continue;
      if (target.managed.has(id)) {
        if (isMaintainerrReaddApproved(target.collection.id, id)) {
          target.add.add(id);
          target.approvedReadds.add(id);
        }
        continue;
      }
      target.add.add(id);
    }
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
    const explicitEligible = item.explicitRelease &&
      (lastWatched === null || lastWatched <= cutoff);
    const automaticEligible = item.dueAt !== null && item.dueAt <= generatedAt;
    const maturedRules = item.automaticRules.filter((rule) =>
      (item.automaticDueAt[rule] ?? Number.POSITIVE_INFINITY) <= generatedAt
    );
    const automaticReason = maturedRules.length > 1
      ? 'automatic_rules_met'
      : maturedRules[0] === 'requester_unwatched_180d'
        ? 'requester_unwatched_180d'
        : 'global_unwatched_540d';
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
    } else if (!explicitEligible && !automaticEligible && item.automaticRules.length > 0) {
      status = 'tracking';
      reason = item.automaticRules.length > 1
        ? 'observing_automatic_rules'
        : item.automaticRules[0] === 'requester_unwatched_180d'
          ? 'observing_requester_unwatched_180d'
          : 'observing_global_unwatched_540d';
    } else if (!explicitEligible && !automaticEligible) {
      status = 'blocked_recent';
      reason = 'watched_too_recently';
    } else if (current && managed) {
      status = 'managed';
      reason = 'already_managed';
    } else if (managed && desiredIds.has(item.ratingKey) && !current &&
               !target?.approvedReadds.has(item.ratingKey)) {
      status = 'readd_blocked';
      reason = 'unexpected_remote_removal';
    } else {
      status = 'add';
      reason = target?.approvedReadds.has(item.ratingKey)
        ? 'readd_approved'
        : automaticEligible
          ? automaticReason
          : lastWatched === null
            ? 'never_watched'
            : 'watch_age_met';
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
      dueAt: item.dueAt,
    });
  }

  // Include remote members that have no current release candidate so the preview
  // explains foreign/manual rows and planned removals. Stale local ownership with
  // no remote member needs no decision or remote write; a successful real run
  // retires it silently below instead of cluttering the Control Center.
  for (const target of targets) {
    for (const ratingKey of new Set([...target.current, ...target.managed])) {
      if (candidateById.has(ratingKey)) continue;
      const label = mediaLabel(ratingKey);
      const managed = target.managed.has(ratingKey);
      const current = target.current.has(ratingKey);
      if (managed && !current) continue;
      const kept = isKept(ratingKey);
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
          : current && (managed || archiveExclusions.has(ratingKey))
            ? 'remove'
            : 'manual',
        reason: paused
          ? 'inventory_unavailable'
          : current && (managed || archiveExclusions.has(ratingKey))
            ? archiveExclusions.has(ratingKey)
              ? 'sonarr_archive_workflow'
              : kept
                ? 'global_keep'
                : 'release_revoked'
            : 'existing_foreign_member',
        lastWatched: latest.get(ratingKey) ?? null,
        dueAt: null,
      });
    }
  }

  const summary = Object.fromEntries(
    previewStatuses.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ])
  ) as Record<MaintainerrPreviewStatus, number>;
  const hash = planHash(targets, config.url);
  const massBlocked = !paused && isMassChange(targets);
  const massApproved = massBlocked && getMaintainerrApprovedPlanHash() === hash;
  const preview: MaintainerrPreview = {
    generatedAt,
    paused,
    pauseReason,
    watchReady,
    watchAgeDays: config.watchAgeDays,
    observationDays: config.observationDays,
    requesterReleases: candidates.requesterReleases,
    campaignReleases: candidates.campaignReleases,
    planHash: hash,
    totalChanges: targets.reduce(
      (sum, target) => sum + target.add.size + target.remove.size,
      0
    ),
    massBlocked,
    massApproved,
    history: recentMaintainerrHistory(100),
    collections: targets.map((target) => ({
      id: target.collection.id,
      title: target.collection.title,
      type: target.collection.type,
      selected: selectedById.has(target.collection.id),
      current: target.current.size,
      managed: target.managed.size,
      desired: target.desired.size,
      add: target.add.size,
      remove: paused
        ? 0
        : target.remove.size,
    })),
    items: items.sort((a, b) =>
      previewStatuses.indexOf(a.status) - previewStatuses.indexOf(b.status) ||
      a.title.localeCompare(b.title)
    ),
    summary,
  };
  return { preview, targets, automaticMatches };
}

/** Read-only dry run used by the Maintainerr Control Center. */
export async function previewMaintainerr(): Promise<MaintainerrPreview> {
  return (await buildMaintainerrPlan()).preview;
}

/** Approve only the currently recomputed mass-change plan. */
export async function approveCurrentMaintainerrPlan(): Promise<MaintainerrPreview> {
  const { preview } = await buildMaintainerrPlan();
  if (!preview.massBlocked) throw new Error('Maintainerr plan is not mass-blocked.');
  approveMaintainerrPlan(preview.planHash);
  recordMaintainerrHistory({
    eventType: 'mass_approved', action: 'approve', reason: 'mass_change',
    planHash: preview.planHash,
  });
  return (await buildMaintainerrPlan()).preview;
}

/** Approve one currently blocked re-add after recomputing and validating it. */
export async function approveCurrentMaintainerrReadd(
  collectionId: number,
  ratingKey: string
): Promise<MaintainerrPreview> {
  const { preview } = await buildMaintainerrPlan();
  const item = preview.items.find((row) =>
    row.collectionId === collectionId && row.ratingKey === ratingKey &&
    row.status === 'readd_blocked'
  );
  if (!item) throw new Error('Maintainerr re-add is not currently blocked.');
  approveMaintainerrReadd(collectionId, ratingKey);
  recordMaintainerrHistory({
    eventType: 'readd_approved', ratingKey, title: item.title, year: item.year,
    libraryKind: item.libraryKind, collectionId,
    collectionTitle: item.collectionTitle, action: 'approve',
    reason: 'unexpected_remote_removal', planHash: preview.planHash,
  });
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
  const { preview, targets, automaticMatches } = await buildMaintainerrPlan();

  // An unavailable live inventory is uncertainty, not evidence that every title
  // disappeared. Freeze both membership and ownership state so a transient media-
  // server timeout cannot reset Maintainerr's grace periods through remove/re-add.
  if (preview.paused) {
    recordMaintainerrHistory({
      eventType: 'paused', action: 'none',
      reason: preview.pauseReason ?? 'unknown', planHash: preview.planHash,
    }, HISTORY_DEDUPE_SECONDS);
    return {
      result: 0,
      message:
        'Maintainerr hand-off paused: media-server inventory not ready; ' +
        'existing memberships left unchanged.',
    };
  }

  // Preview is strictly read-only. Only a real run with trusted watch data and
  // successful live inventory checks advances or resets automatic-rule clocks.
  // Missing media is excluded so stale inventory cannot mature into a hand-off.
  if (preview.watchReady) {
    const available = new Set(
      preview.items
        .filter((item) => item.reason !== 'missing_from_media_server')
        .map((item) => item.ratingKey)
    );
    reconcileMaintainerrRuleTracking(
      automaticMatches.filter((match) => available.has(match.ratingKey)),
      preview.generatedAt
    );
  } else {
    // Unknown watch state cannot prove uninterrupted eligibility. Reset the
    // automatic clocks so recovery starts a fresh observation period.
    reconcileMaintainerrRuleTracking([], preview.generatedAt);
  }

  // A one-time approval is valid only while its exact operation set is current.
  // Invalidate stale approvals during a safe real-job plan; uncertainty above
  // freezes approvals along with membership and ownership state.
  const approvedPlanHash = getMaintainerrApprovedPlanHash();
  if (approvedPlanHash && approvedPlanHash !== preview.planHash) {
    clearMaintainerrPlanApproval();
  }
  const activeReadds = new Set(
    targets.flatMap((target) =>
      [...target.approvedReadds].map((id) => `${target.collection.id}\0${id}`)
    )
  );
  for (const [collectionId, ids] of Object.entries(getMaintainerrApprovedReadds())) {
    for (const id of ids) {
      if (!activeReadds.has(`${collectionId}\0${id}`)) {
        consumeMaintainerrReaddApproval(Number(collectionId), id);
      }
    }
  }
  if (preview.massBlocked && !preview.massApproved) {
    recordMaintainerrHistory({
      eventType: 'mass_blocked', action: 'none', reason: 'mass_change',
      planHash: preview.planHash,
    }, HISTORY_DEDUPE_SECONDS);
    return {
      result: 0,
      message:
        `Maintainerr hand-off blocked: ${preview.totalChanges} planned changes ` +
        'require approval in the Control Center.',
    };
  }

  // Consume every one-time approval before the first remote write. A partial or
  // failed run therefore cannot silently reuse authorization on a later plan.
  if (preview.massBlocked && !consumeMaintainerrPlanApproval(preview.planHash)) {
    return { result: 0, message: 'Maintainerr hand-off blocked: plan approval expired.' };
  }
  for (const target of targets) {
    for (const id of target.approvedReadds) {
      if (!consumeMaintainerrReaddApproval(target.collection.id, id)) {
        return { result: 0, message: 'Maintainerr hand-off blocked: re-add approval expired.' };
      }
    }
  }
  for (const item of preview.items.filter((row) => row.status === 'readd_blocked')) {
    recordMaintainerrHistory({
      eventType: 'readd_blocked', ratingKey: item.ratingKey, title: item.title,
      year: item.year, libraryKind: item.libraryKind,
      collectionId: item.collectionId, collectionTitle: item.collectionTitle,
      action: 'none', reason: item.reason, planHash: preview.planHash,
    }, HISTORY_DEDUPE_SECONDS);
  }

  let added = 0;
  let removed = 0;
  // Keep vetoes first: only remove memberships previously managed by Keeparr.
  for (const target of targets) {
    const remove = [...target.remove];
    await changeMembership(config.url, target.collection.id, remove, 'remove');
    removed += remove.length;
    for (const id of remove) target.managed.delete(id);
    setMaintainerrManagedItems(
      Object.fromEntries(targets.map((t) => [String(t.collection.id), [...t.managed].sort()]))
    );
    for (const id of remove) {
      const item = preview.items.find((row) =>
        row.collectionId === target.collection.id && row.ratingKey === id
      );
      recordMaintainerrHistory({
        eventType: 'membership_removed', ratingKey: id, title: item?.title,
        year: item?.year, libraryKind: item?.libraryKind ?? target.collection.type,
        collectionId: target.collection.id, collectionTitle: target.collection.title,
        action: 'remove', reason: item?.reason ?? 'release_revoked',
        planHash: preview.planHash,
      });
    }
  }
  // Only after every removal succeeded, add new desired memberships.
  for (const target of targets) {
    const add = [...target.add];
    await changeMembership(config.url, target.collection.id, add, 'add');
    added += add.length;
    for (const id of add) target.managed.add(id);
    setMaintainerrManagedItems(
      Object.fromEntries(targets.map((t) => [String(t.collection.id), [...t.managed].sort()]))
    );
    for (const id of add) {
      const item = preview.items.find((row) =>
        row.collectionId === target.collection.id && row.ratingKey === id
      );
      recordMaintainerrHistory({
        eventType: 'membership_added', ratingKey: id, title: item?.title,
        year: item?.year, libraryKind: item?.libraryKind ?? target.collection.type,
        collectionId: target.collection.id, collectionTitle: target.collection.title,
        action: 'add', reason: item?.reason ?? 'eligible', planHash: preview.planHash,
      });
    }
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
      `Maintainerr hand-off: ${added} added, ${removed} removed, ${matched} desired; ` +
      `${preview.requesterReleases} requester release(s), ` +
      `${preview.campaignReleases} closed-campaign release(s), ` +
      `${preview.summary.tracking} automatic title(s) under observation, ` +
      `${missing} no longer on media server, ` +
      (preview.watchReady
        ? `${recentlyWatched} watched within ${config.watchAgeDays} day(s)`
        : 'watch data not ready — all Keeparr memberships withdrawn') +
      `${preview.summary.outside ? `, ${preview.summary.outside} outside selected libraries` : ''}.`,
  };
}
