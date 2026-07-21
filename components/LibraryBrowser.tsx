'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LibrarySection, MediaCardData } from '@/lib/types';
import { formatBytes } from '@/lib/i18n';
import MediaCard, { CARD_GRID_CLASS } from './MediaCard';
import MediaRow from './MediaRow';
import MultiSelect, { type MSGroup } from './MultiSelect';
import { useToast } from './Toaster';
import { RES_ORDER, resolutionBucket } from '@/lib/quality';
import { useLocale } from './LocaleProvider';

type Sort =
  | 'size'
  | 'title'
  | 'added'
  | 'year'
  | 'library'
  | 'quality'
  | 'tags'
  | 'status'
  | 'watched';
type Dir = 'asc' | 'desc';
const SORT_KEYS: Sort[] = ['size', 'title', 'added', 'year', 'library', 'quality', 'tags', 'status', 'watched'];
// Numeric-ish columns read best high→low by default; text columns A→Z.
const defaultDir = (col: Sort): Dir => (col === 'size' || col === 'watched' ? 'desc' : 'asc');
type View = 'grid' | 'list';
// Combinable "Status" buckets (per-user decision states). Any checked are OR'd
// together server-side; none checked = All. Mirrors lib/queries StateBucket.
type StateBucket =
  | 'keptByMe'
  | 'keptOther'
  | 'dontcare'
  | 'okDeleteMine'
  | 'okDeleteAny'
  | 'undecided';
const STATE_OPTIONS: { value: StateBucket; seerrOnly?: boolean }[] = [
  { value: 'undecided' }, { value: 'keptByMe' }, { value: 'keptOther' },
  { value: 'dontcare' }, { value: 'okDeleteMine', seerrOnly: true },
  { value: 'okDeleteAny', seerrOnly: true },
];

interface Facets {
  instances: { id: string; name: string; source: string }[];
  tags: string[];
  qualities: string[];
  statuses: string[];
}
type Match = 'all' | 'matched' | 'unmatched';

function arrStatusLabel(status: string, de: boolean): string {
  const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const labels: Record<string, [string, string]> = {
    continuing: ['Continuing', 'Laufend'],
    ended: ['Ended', 'Beendet'],
    upcoming: ['Upcoming', 'Bevorstehend'],
    deleted: ['Deleted', 'Gelöscht'],
    missing: ['Missing', 'Fehlend'],
    downloaded: ['Downloaded', 'Heruntergeladen'],
    available: ['Available', 'Verfügbar'],
    announced: ['Announced', 'Angekündigt'],
    incinemas: ['In cinemas', 'Im Kino'],
    released: ['Released', 'Veröffentlicht'],
  };
  const label = labels[normalized];
  return label ? label[de ? 1 : 0] : status;
}

const VIEW_KEY = 'keeparr.browseView';
const SORT_KEY = 'keeparr.browseSort';

// Grouped Quality filter: bucket each value by resolution (shared with the Big
// Picture breakdown via lib/quality). Selecting a bucket's "select all" picks
// every variant present (Bluray/WEB/Remux/profile names).
function qualityGroups(qualities: string[]): MSGroup[] {
  const buckets = new Map<string, { value: string; label: string }[]>();
  for (const q of qualities) {
    const b = resolutionBucket(q);
    (buckets.get(b) ?? buckets.set(b, []).get(b)!).push({ value: q, label: q });
  }
  return RES_ORDER.filter((b) => buckets.has(b)).map((b) => ({ label: b, options: buckets.get(b)! }));
}
type Watch =
  | 'all'
  | 'watched'
  | 'unwatched'
  | 'unwatchedAny'
  | 'recent30'
  | 'recent60'
  | 'recent90'
  | 'stale90';

/** A sortable List-view column header: click to sort, shows the active arrow. */
function SortTh({
  col,
  align,
  sort,
  dir,
  onSort,
  children,
}: {
  col: Sort;
  align: 'left' | 'right' | 'center';
  sort: Sort;
  dir: Dir;
  onSort: (c: Sort) => void;
  children: string;
}) {
  const { messages: m } = useLocale();
  const active = sort === col;
  const arrow = active ? (dir === 'desc' ? ' ↓' : ' ↑') : '';
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-slate-300 ${alignCls} ${active ? 'text-slate-300' : ''}`}
      onClick={() => onSort(col)}
      title={m.library.sortColumn}
    >
      {children}
      {arrow}
    </th>
  );
}

export default function LibraryBrowser({
  sections,
  tautulli = false,
  arr = false,
  seerr = false,
}: {
  sections: LibrarySection[];
  /** Tautulli connected → show the Watched filter (otherwise hidden). */
  tautulli?: boolean;
  /** Sonarr/Radarr connected → show the quality/tag/monitored filters. */
  arr?: boolean;
  /** Seerr connected → show the "OK to delete" status options. */
  seerr?: boolean;
}) {
  const { locale, messages: m } = useLocale();
  const de = locale === 'de';
  const messagesRef = useRef(m);
  useEffect(() => { messagesRef.current = m; }, [m]);
  // Library selection lives in the URL (?sections=) — driven by the nav rail's
  // Browse list. Empty = all libraries.
  const searchParams = useSearchParams();
  const selectedKey = (searchParams.get('sections') || '')
    .split(',')
    .filter(Boolean)
    .sort()
    .join(',');

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<Sort>('size');
  const [dir, setDir] = useState<Dir>('desc');
  // Combinable Status filter (OR'd buckets; empty = All). Defaults to Undecided
  // so decided items (kept / don't-care / your own "OK to delete") are hidden.
  const [states, setStates] = useState<string[]>(['undecided']);
  const [watch, setWatch] = useState<Watch>('all');
  const [requestedByMe, setRequestedByMe] = useState(false);
  // Sonarr/Radarr multi-select filters (only used/shown when arr is connected).
  const [sources, setSources] = useState<string[]>([]);
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [qualities, setQualities] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [monitoredSel, setMonitoredSel] = useState<string[]>([]);
  const [match, setMatch] = useState<Match>('all');
  const [sizeMismatch, setSizeMismatch] = useState(false);
  const [facets, setFacets] = useState<Facets>({ instances: [], tags: [], qualities: [], statuses: [] });
  const [view, setView] = useState<View>('grid');
  const toast = useToast();

  const [items, setItems] = useState<MediaCardData[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  // Guards against out-of-order responses: only the latest request may commit
  // state (a slow old response must not clobber a newer one).
  const fetchSeq = useRef(0);

  const selectedIds = useMemo(
    () => new Set(selectedKey.split(',').filter(Boolean)),
    [selectedKey]
  );
  const sectionTitle = useMemo(
    () => new Map(sections.map((s) => [s.sectionId, s.title])),
    [sections]
  );

  // Remember the Grid/List choice across visits.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* localStorage can throw under strict privacy settings */
    }
  }, []);
  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // Remember the last sort column + direction (used by both views; List sets it
  // via the column headers, Grid via the dropdown).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (SORT_KEYS.includes(s.col)) setSort(s.col);
        if (s.dir === 'asc' || s.dir === 'desc') setDir(s.dir);
      }
    } catch {
      /* ignore */
    }
  }, []);
  function applySort(col: Sort, nextDir: Dir) {
    setSort(col);
    setDir(nextDir);
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify({ col, dir: nextDir }));
    } catch {
      /* ignore */
    }
  }
  // Header click: same column flips direction; a new column uses its default.
  function sortByHeader(col: Sort) {
    if (sort === col) applySort(col, dir === 'desc' ? 'asc' : 'desc');
    else applySort(col, defaultDir(col));
  }

  // Load the arr filter facets (instances/tags/qualities) when connected.
  useEffect(() => {
    if (!arr) return;
    fetch('/api/library/facets')
      .then((r) => r.json())
      .then((d) =>
        setFacets({
          instances: d.instances ?? [],
          tags: d.tags ?? [],
          qualities: d.qualities ?? [],
          statuses: d.statuses ?? [],
        })
      )
      .catch(() => {});
  }, [arr]);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Load Seerr requested keys once.
  useEffect(() => {
    fetch('/api/requests')
      .then((r) => r.json())
      .then((d) => setRequested(new Set<string>(d.ratingKeys ?? [])))
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      const off = reset ? 0 : offset;
      const params = new URLSearchParams();
      if (selectedKey) params.set('sections', selectedKey);
      if (debouncedQ) params.set('q', debouncedQ);
      params.set('sort', sort);
      params.set('dir', dir);
      // Combinable Status buckets (OR'd server-side); empty = All.
      if (states.length) params.set('state', states.join(','));
      if (tautulli && watch !== 'all') params.set('watch', watch);
      if (requestedByMe) params.set('requestedByMe', '1');
      if (arr) {
        if (sources.length) params.set('source', sources.join(','));
        if (instanceIds.length) params.set('instance', instanceIds.join(','));
        if (tags.length) params.set('tag', tags.join(','));
        if (qualities.length) params.set('quality', qualities.join(','));
        if (statuses.length) params.set('status', statuses.join(','));
        if (monitoredSel.length) params.set('monitored', monitoredSel.join(','));
        if (match !== 'all') params.set('match', match);
        if (sizeMismatch) params.set('sizeMismatch', '1');
      }
      params.set('offset', String(off));
      try {
        const data = await fetch(`/api/library?${params}`).then((r) => r.json());
        if (seq !== fetchSeq.current) return; // superseded — drop it
        // An error response (e.g. a 500) has no `items` — guard so the view
        // doesn't crash on a spread/map of undefined.
        const list = Array.isArray(data.items) ? data.items : [];
        setHasMore(!!data.hasMore);
        if (typeof data.nextOffset === 'number') setOffset(data.nextOffset);
        setItems((prev) => (reset ? list : [...prev, ...list]));
      } catch {
        if (seq !== fetchSeq.current) return; // superseded — don't toast for it
        toast(messagesRef.current.library.loadError, 'error');
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [selectedKey, debouncedQ, sort, dir, states, watch, tautulli, requestedByMe,
     arr, sources, instanceIds, tags, qualities, statuses, monitoredSel, match, sizeMismatch, offset, toast]
  );

  // Reset + reload whenever a filter (or the rail selection) changes. (View
  // toggle is NOT here — Grid/List render the same data, no refetch.)
  const filterKey = `${selectedKey}|${debouncedQ}|${sort}|${dir}|${states}|${watch}|${requestedByMe}|${sources}|${instanceIds}|${tags}|${qualities}|${statuses}|${monitoredSel}|${match}|${sizeMismatch}`;
  useEffect(() => {
    setOffset(0);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const inputCls =
    'rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-brand';

  const shownLibs = selectedIds.size
    ? sections.filter((s) => selectedIds.has(s.sectionId))
    : sections;
  const shownBytes = shownLibs.reduce((a, s) => a + s.sizeBytes, 0);

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <h1 className="text-2xl font-bold">{m.library.title}</h1>
        <span className="text-sm text-slate-500 break-words">
          {selectedIds.size === 0
            ? m.library.allLibraries
            : shownLibs.map((s) => s.title).join(' + ')}{' '}
          · {formatBytes(shownBytes, locale)}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {m.library.hintBefore} <span className="text-slate-300">{m.library.title}</span>{' '}
        {m.library.hintAfter}
      </p>

      <div className="mb-5 flex flex-wrap items-start gap-2 sm:items-center sm:gap-3">
        <input
          className={`${inputCls} min-w-0 basis-full sm:basis-auto sm:min-w-[220px] sm:flex-1`}
          placeholder={m.library.searchTitles}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {/* In List view, sorting is done by clicking column headers, so the
            Sort dropdown + direction toggle only appear in Grid view. */}
        {view === 'grid' && (
          <>
            <select
              className={inputCls}
              value={sort}
              onChange={(e) => applySort(e.target.value as Sort, dir)}
            >
              <option value="size">{m.common.size}</option>
              <option value="title">{m.library.titleColumn}</option>
              <option value="year">{m.library.releaseYear}</option>
              <option value="added">{m.library.recentlyAdded}</option>
            </select>
            <button
              onClick={() => applySort(sort, dir === 'desc' ? 'asc' : 'desc')}
              className={inputCls}
              title={dir === 'desc' ? m.library.descending : m.library.ascending}
            >
              {dir === 'desc' ? '↓' : '↑'}
            </button>
          </>
        )}
        <MultiSelect
          placeholder={m.library.statusAll}
          summaryName={m.library.status}
          selected={states}
          onChange={setStates}
          groups={[
            {
              options: STATE_OPTIONS.filter((o) => !o.seerrOnly || seerr).map((o) => ({
                value: o.value,
                label: ({ undecided: m.library.undecided, keptByMe: m.library.keptByYou,
                  keptOther: m.library.keptByOthers, dontcare: m.media.dontCare,
                  okDeleteMine: m.library.okDeleteYou, okDeleteAny: m.library.okDeleteAnyone } as Record<StateBucket, string>)[o.value],
              })),
            },
          ]}
        />
        {tautulli && (
          <select
            className={inputCls}
            value={watch}
            onChange={(e) => setWatch(e.target.value as Watch)}
            title={m.library.watchFilterTitle}
          >
            <option value="all">{m.library.watchedAny}</option><option value="watched">{m.library.watchedByYou}</option>
            <option value="unwatched">{m.library.notWatchedByYou}</option><option value="unwatchedAny">{m.library.notWatchedAnyone}</option>
            <option value="recent30">{m.library.watched30}</option><option value="recent60">{m.library.watched60}</option>
            <option value="recent90">{m.library.watched90}</option><option value="stale90">{m.library.stale90}</option>
          </select>
        )}
        {arr && (
          <>
            <MultiSelect
              placeholder={m.library.allApps}
              summaryName={m.library.apps}
              selected={sources}
              onChange={setSources}
              groups={[
                {
                  options: [
                    { value: 'sonarr', label: 'Sonarr (TV)' },
                    { value: 'radarr', label: `Radarr (${de ? 'Filme' : 'Movies'})` },
                  ],
                },
              ]}
            />
            {facets.instances.length > 1 && (
              <MultiSelect
                placeholder={m.library.allInstances}
                summaryName={m.library.instances}
                selected={instanceIds}
                onChange={setInstanceIds}
                groups={[
                  { options: facets.instances.map((i) => ({ value: i.id, label: i.name })) },
                ]}
              />
            )}
            {facets.tags.length > 0 && (
              <MultiSelect
                placeholder={m.library.allTags}
                summaryName={m.library.tags}
                selected={tags}
                onChange={setTags}
                groups={[{ options: facets.tags.map((t) => ({ value: t, label: t })) }]}
              />
            )}
            {facets.qualities.length > 0 && (
              <MultiSelect
                placeholder={m.library.allQualities}
                summaryName={m.library.quality}
                selected={qualities}
                onChange={setQualities}
                groups={qualityGroups(facets.qualities)}
              />
            )}
            {facets.statuses.length > 0 && (
              <MultiSelect
                placeholder={m.library.anyStatus}
                summaryName={m.library.status}
                selected={statuses}
                onChange={setStatuses}
                groups={[{ options: facets.statuses.map((s) => ({ value: s, label: arrStatusLabel(s, de) })) }]}
              />
            )}
            <MultiSelect
              placeholder={m.library.anyMonitoring}
              summaryName={m.library.monitoring}
              selected={monitoredSel}
              onChange={setMonitoredSel}
              groups={[
                {
                  options: [
                    { value: 'monitored', label: m.library.monitored },
                    { value: 'unmonitored', label: m.library.unmonitored },
                  ],
                },
              ]}
            />
            <select
              className={inputCls}
              value={match}
              onChange={(e) => setMatch(e.target.value as Match)}
              title={m.library.arrTitle}
            >
              <option value="all">{m.library.arrAny}</option><option value="matched">{m.library.inArr}</option>
              <option value="unmatched">{m.library.notInArr}</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={sizeMismatch}
                onChange={(e) => setSizeMismatch(e.target.checked)}
              />
              {m.library.sizeMismatch}
            </label>
          </>
        )}
        {seerr && (
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={requestedByMe}
            onChange={(e) => setRequestedByMe(e.target.checked)}
          />
          {m.library.requestedByMe}
        </label>
        )}
        {/* Grid ↔ List view toggle (remembered across visits). */}
        <div className="flex w-full overflow-hidden rounded-md border border-slate-700 sm:ml-auto sm:w-auto">
          {(['grid', 'list'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => chooseView(v)}
              className={`flex-1 px-3 py-2 text-sm sm:flex-none ${
                view === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title={v === 'grid' ? m.library.gridView : m.library.listView}
            >
              {v === 'grid' ? `▦ ${m.library.grid}` : `☰ ${m.library.list}`}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <p className="text-slate-400 py-12 text-center">{m.library.noMatches}</p>
      ) : view === 'grid' ? (
        <div className={CARD_GRID_CLASS}>
          {items.map((item) => (
            <MediaCard
              key={item.ratingKey}
              item={item}
              skippable
              requested={requested.has(item.ratingKey)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-rail text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2" />
                <SortTh col="title" align="left" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.titleColumn}</SortTh>
                <SortTh col="library" align="left" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.libraryColumn}</SortTh>
                <SortTh col="size" align="right" sort={sort} dir={dir} onSort={sortByHeader}>{m.common.size}</SortTh>
                <SortTh col="quality" align="left" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.quality}</SortTh>
                <SortTh col="tags" align="left" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.tags}</SortTh>
                <SortTh col="status" align="left" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.status}</SortTh>
                <SortTh col="watched" align="center" sort={sort} dir={dir} onSort={sortByHeader}>{m.library.watched}</SortTh>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <MediaRow
                  key={item.ratingKey}
                  item={item}
                  sectionTitle={sectionTitle.get(item.sectionId) ?? item.sectionId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchPage(false)}
            disabled={loading}
            className="rounded-md border border-slate-700 hover:border-slate-500 px-5 py-2 text-sm disabled:opacity-60"
          >
            {loading ? m.common.loading : m.library.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}
