'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaCardData } from '@/lib/types';
import { formatBytes, formatNumber } from '@/lib/i18n';
import { RES_ORDER, resolutionBucket } from '@/lib/quality';
import { useToast } from './Toaster';
import {
  StackedBar,
  LegendRow,
  Donut,
  compositionSegmentsSplit,
  keptVsUnwatchedSegments,
  UnwatchedBrackets,
  libColor,
  libStroke,
  pct,
  TONE,
  type Overview,
} from './breakdown';
import { useLocale } from './LocaleProvider';

type View = 'largest' | 'reclaimable' | 'unwatched' | 'markedForDelete';

const viewLabel = (view: View, de: boolean) => de
  ? ({ largest: 'Größte auf dem Datenträger', reclaimable: 'Von niemandem behalten', unwatched: 'Nie angesehen', markedForDelete: 'Kann gelöscht werden' } as const)[view]
  : ({ largest: 'Largest on disk', reclaimable: 'Not kept by anyone', unwatched: 'Never watched', markedForDelete: 'OK to delete' } as const)[view];

/** A drill-down row. The "OK to delete" view adds who released it + whether it's
 *  still kept; other views leave those undefined. */
type StatRow = MediaCardData & {
  markedBy?: string[];
  keptByAnyone?: boolean;
};

interface Summary {
  totalItems: number;
  totalBytes: number;
  keptItems: number;
  keptBytes: number;
  reclaimableBytes: number;
}

export default function StatsView() {
  const { locale, messages: m } = useLocale();
  const de = locale === 'de';
  const [view, setView] = useState<View>('largest');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<StatRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const toast = useToast();
  // Guards against out-of-order responses: only the latest request may commit
  // state (a slow old response must not clobber a newer one).
  const fetchSeq = useRef(0);

  const load = useCallback(
    async (v: View, reset: boolean) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      const off = reset ? 0 : offset;
      try {
        const data = await fetch(`/api/stats?view=${v}&offset=${off}`).then((r) => r.json());
        if (seq !== fetchSeq.current) return; // superseded — drop it
        // An error response has no `items`/`summary` — guard against a crash.
        const list = Array.isArray(data.items) ? data.items : [];
        if (data.summary) setSummary(data.summary);
        setHasMore(!!data.hasMore);
        if (typeof data.nextOffset === 'number') setOffset(data.nextOffset);
        setItems((prev) => (reset ? list : [...prev, ...list]));
      } catch {
        if (seq !== fetchSeq.current) return; // superseded — don't toast for it
        toast(de ? 'Die Statistiken konnten nicht geladen werden — ist der Server erreichbar?' : "Couldn't load the stats — is the server reachable?", 'error');
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [de, offset, toast]
  );

  useEffect(() => {
    load(view, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => setOverview(d))
      .catch(() => {});
  }, []);

  let cumulative = 0;
  // The "Never watched" drill-down only appears when Tautulli is connected; the
  // "OK to delete" drill-down only when Seerr is.
  const views: View[] = [
    'largest',
    'reclaimable',
    ...(overview?.tautulli ? (['unwatched'] as View[]) : []),
    ...(overview?.seerr ? (['markedForDelete'] as View[]) : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Gesamtübersicht' : 'Big Picture'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {de ? 'Was auf deinem Server liegt, was geschützt ist und wie viel Speicherplatz du zurückgewinnen könntest.' : 'What’s on your server, what’s safe to keep, and how much space you could win back.'}
        </p>
      </div>

      {overview && <StorageHero overview={overview} />}
      {overview && <ReviewProgress overview={overview} />}
      {overview && <LibraryGrid overview={overview} />}
      {overview?.arr && overview.qualityBreakdown && (
        <QualityReclaim overview={overview} />
      )}

      {/* Ranked drill-down tables */}
      <div>
        <div className="flex gap-2 mb-4">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-2 text-sm ${
                view === v ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {viewLabel(v, de)}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-rail text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-8">#</th>
                <th className="text-left font-medium px-3 py-2">{de ? 'Titel' : 'Title'}</th>
                <th className="text-right font-medium px-3 py-2">{m.common.size}</th>
                {view === 'reclaimable' ? (
                  <th className="text-right font-medium px-3 py-2">{de ? 'Kumuliert' : 'Cumulative'}</th>
                ) : view === 'markedForDelete' ? (
                  <th className="text-left font-medium px-3 py-2">{de ? 'Markiert von' : 'Marked by'}</th>
                ) : (
                  <th className="text-right font-medium px-3 py-2">{de ? 'Behalten' : 'Kept'}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                cumulative += item.sizeBytes;
                return (
                  <tr key={item.ratingKey} className="border-t border-slate-800 hover:bg-slate-900/60">
                    <td className="px-3 py-2 text-slate-500">{formatNumber(idx + 1, locale)}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{item.title}</span>
                      {item.year && <span className="text-slate-500"> ({item.year})</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatBytes(item.sizeBytes, locale)}</td>
                    {view === 'reclaimable' ? (
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {formatBytes(cumulative, locale)}
                      </td>
                    ) : view === 'markedForDelete' ? (
                      <td className="px-3 py-2 text-slate-300">
                        {(item.markedBy ?? []).join(', ') || '—'}
                        {item.keptByAnyone && (
                          <span
                            className="ml-2 rounded bg-amber-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
                            title={de ? 'Jemand behält diesen Titel weiterhin, daher bleibt er geschützt' : 'Someone still keeps this, so it stays protected'}
                          >
                            {de ? 'weiterhin geschützt' : 'still kept'}
                          </span>
                        )}
                      </td>
                    ) : (
                      <td className="px-3 py-2 text-right">
                        {item.kept ? (
                          <span className="text-brand">✓</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="text-center mt-6">
            <button
              onClick={() => load(view, false)}
              disabled={loading}
              className="rounded-md border border-slate-700 hover:border-slate-500 px-5 py-2 text-sm disabled:opacity-60"
            >
              {loading ? m.common.loading : (de ? 'Mehr laden' : 'Load more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Big headline number + label, with a color dot tying it to the disk bar. */
function BigStat({
  value,
  label,
  tone,
  dot,
  sub,
}: {
  value: string;
  label: string;
  tone?: string;
  dot?: keyof typeof TONE;
  sub?: string;
}) {
  return (
    <div>
      <div className={`text-3xl font-bold leading-none ${tone ?? ''}`}>{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
        {dot && <span className={`h-2.5 w-2.5 rounded-sm ${TONE[dot].dot}`} />}
        {label}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** The signature: one honest disk gauge (fills up; the empty part is free space)
 *  + headline numbers + legend. */
function StorageHero({ overview }: { overview: Overview }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const { totals, storage, mediaUsedBytes } = overview;
  const configured = storage.configured;
  const otherBytes = configured ? Math.max(0, storage.usedBytes - mediaUsedBytes) : 0;
  const denom = configured ? storage.totalBytes : totals.bytes || 1;
  const keptOtherBytes = Math.max(0, totals.keptBytes - totals.keptByMeBytes);
  const keptOtherItems = Math.max(0, totals.keptItems - totals.keptByMeItems);

  // Filled segments only — the unfilled remainder of the bar IS the free space.
  const segments = [
    { tone: 'kept' as const, value: totals.keptByMeBytes, label: de ? 'Von dir behalten' : 'Kept by you' },
    { tone: 'keptOther' as const, value: keptOtherBytes, label: de ? 'Von anderen behalten' : 'Kept by others' },
    { tone: 'dontcare' as const, value: totals.dontcareBytes, label: de ? 'Ist mir egal' : 'I don’t care' },
    { tone: 'undecided' as const, value: totals.undecidedBytes, label: de ? 'Unentschieden' : 'Undecided' },
    ...(configured ? [{ tone: 'other' as const, value: otherBytes, label: de ? 'Andere Dateien' : 'Other files' }] : []),
  ];
  const bracketLabels = {
    keptByYou: de ? 'Von dir behalten' : 'Kept by you',
    keptByOthers: de ? 'Von anderen behalten' : 'Kept by others',
    dontCare: de ? 'Ist mir egal' : 'I don’t care',
    undecided: de ? 'Unentschieden' : 'Undecided',
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-panel p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        {de ? 'Speicher auf einen Blick' : 'Storage at a glance'}
      </h2>
      <div className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
        {configured && (
          <BigStat
            value={formatBytes(storage.freeBytes, locale)}
            label={de ? 'Frei' : 'Free'}
            tone="text-emerald-400"
            sub={`${de ? 'von' : 'of'} ${formatBytes(storage.totalBytes, locale)} · ${formatNumber(pct(
              storage.usedBytes,
              storage.totalBytes
            ), locale)}% ${de ? 'belegt' : 'full'}`}
          />
        )}
        <BigStat
          value={formatBytes(totals.keptByMeBytes, locale)}
          label={de ? 'Von dir behalten' : 'Kept by you'}
          tone="text-brand"
          dot="kept"
          sub={`${formatNumber(totals.keptByMeItems, locale)} ${de ? 'Titel' : 'titles'}`}
        />
        <BigStat
          value={formatBytes(keptOtherBytes, locale)}
          label={de ? 'Von anderen behalten' : 'Kept by others'}
          tone="text-brand-dark"
          dot="keptOther"
          sub={`${formatNumber(keptOtherItems, locale)} ${de ? 'Titel' : 'titles'}`}
        />
        <BigStat
          value={formatBytes(totals.dontcareBytes, locale)}
          label={de ? 'Ist mir egal' : 'I don’t care'}
          tone="text-rose-400"
          dot="dontcare"
          sub={`${formatNumber(totals.dontcareItems, locale)} ${de ? 'Titel' : 'titles'}`}
        />
        <BigStat
          value={formatBytes(totals.undecidedBytes, locale)}
          label={de ? 'Unentschieden' : 'Undecided'}
          tone="text-blue-400"
          dot="undecided"
          sub={`${formatNumber(totals.undecidedItems, locale)} ${de ? 'noch zu prüfende Titel' : 'titles you’ve yet to review'}`}
        />
        {overview.tautulli && (
          <BigStat
            value={formatBytes(totals.unwatchedBytes, locale)}
            label={de ? 'Nie angesehen' : 'Never watched'}
            tone="text-slate-200"
            sub={`${formatNumber(totals.unwatchedItems, locale)} ${de ? 'von niemandem angesehene Titel' : 'titles nobody has watched'}`}
          />
        )}
        {overview.seerr && overview.markedForDelete && (
          <BigStat
            value={formatBytes(overview.markedForDelete.bytes, locale)}
            label={de ? 'Kann gelöscht werden' : 'OK to delete'}
            tone="text-rose-300"
            sub={`${formatNumber(overview.markedForDelete.titles, locale)} ${de ? 'von Anfragenden freigegebene Titel' : 'titles a requester released'}`}
          />
        )}
      </div>

      <div className="mt-5">
        <StackedBar height="h-6" segments={segments} max={configured ? storage.totalBytes : undefined} />
        {/* Brackets below the bar mark the never-watched-by-anyone slice WITHIN
            each keep segment — one per segment, aligned to it. */}
        {overview.tautulli && totals.unwatchedBytes > 0 && (
          <>
            <div className="mt-1">
              <UnwatchedBrackets segments={keptVsUnwatchedSegments(totals, bracketLabels)} max={denom} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              <span className="mr-1 inline-block h-2 w-3 rounded-b-sm border-x border-b border-white/40 align-middle" />
              {de ? 'Klammern markieren in jeder Kategorie Titel, die niemand angesehen hat' : 'Brackets mark titles never watched by anyone within each category'} ·{' '}
              {formatNumber(totals.unwatchedItems, locale)} {de ? 'insgesamt' : 'total'} · {formatBytes(totals.unwatchedBytes, locale)} ·{' '}
              {formatNumber(pct(totals.unwatchedBytes, denom), locale)}% {de ? 'des Datenträgers' : 'of disk'}
            </div>
          </>
        )}
      </div>

      {/* Legend: filled categories + free (the empty part of the bar). */}
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {segments.map((s) => (
          <LegendRow
            key={s.tone}
            tone={s.tone}
            label={s.label}
            value={formatBytes(s.value, locale)}
            sub={`${formatNumber(pct(s.value, denom), locale)}%`}
            muted={s.value <= 0}
          />
        ))}
        {configured && (
          <LegendRow
            dotClass="bg-slate-700"
            label={de ? 'Frei (leer)' : 'Free (empty)'}
            value={formatBytes(storage.freeBytes, locale)}
            sub={`${formatNumber(pct(storage.freeBytes, denom), locale)}%`}
          />
        )}
      </div>
    </section>
  );
}

/** Personal triage progress across all libraries (counts, not bytes). */
function ReviewProgress({ overview }: { overview: Overview }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const { totals } = overview;
  const decided = totals.keptByMeItems + totals.dontcareItems;
  const reviewable = decided + totals.undecidedItems;
  const reviewedPct = pct(decided, reviewable);

  // Where most of your unreviewed space sits — a neutral next step, not a claim
  // about what "should" be deleted.
  const topToReview = [...overview.libraries]
    .map((l) => ({ l, undecided: l.undecidedBytes }))
    .sort((a, b) => b.undecided - a.undecided)[0];

  return (
    <section className="rounded-xl border border-slate-800 bg-panel p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {de ? 'Dein Prüfungsfortschritt' : 'Your review progress'}
      </h2>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
        <div className="flex items-center gap-6">
          <Donut
            segments={[
              { tone: 'kept', value: totals.keptByMeItems },
              { tone: 'dontcare', value: totals.dontcareItems },
              { tone: 'undecided', value: totals.undecidedItems },
            ]}
            center={`${formatNumber(reviewedPct, locale)}%`}
            centerSub={de ? 'geprüft' : 'reviewed'}
          />
          <div className="w-64 space-y-2">
            <p className="mb-3 text-sm text-slate-400">
              {de ? 'Entschieden bei' : 'Decided on'}{' '}
              <span className="font-semibold text-white">{formatNumber(decided, locale)}</span>{' '}
              {de ? 'von' : 'of'}{' '}
              <span className="font-semibold text-white">{formatNumber(reviewable, locale)}</span>{' '}
              {de ? 'Titeln.' : 'titles.'}
            </p>
            <LegendRow
              tone="kept"
              label={de ? 'Von dir behalten' : 'Kept by you'}
              value={formatNumber(totals.keptByMeItems, locale)}
              sub={formatBytes(totals.keptByMeBytes, locale)}
            />
            <LegendRow
              tone="dontcare"
              label={de ? 'Ist mir egal' : 'I don’t care'}
              value={formatNumber(totals.dontcareItems, locale)}
              sub={formatBytes(totals.dontcareBytes, locale)}
            />
            <LegendRow
              tone="undecided"
              label={de ? 'Unentschieden (deine)' : 'Undecided (yours)'}
              value={formatNumber(totals.undecidedItems, locale)}
              sub={formatBytes(totals.undecidedBytes, locale)}
            />
          </div>
        </div>

        {topToReview && topToReview.undecided > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 lg:ml-auto lg:max-w-xs">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {de ? 'Am meisten zu prüfen' : 'Most left to review'}
            </div>
            <div className="mt-1 text-lg font-semibold">{topToReview.l.title}</div>
            <div className="mt-0.5 text-sm">
              <span className="font-mono text-blue-400">
                {formatBytes(topToReview.undecided, locale)}
              </span>{' '}
              <span className="text-slate-400">{de ? 'über die du noch nicht entschieden hast' : 'you haven’t decided on yet'}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Per-library composition cards. */
function LibraryGrid({ overview }: { overview: Overview }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const libs = [...overview.libraries].sort((a, b) => b.bytes - a.bytes);
  if (libs.length === 0) return null;

  const storage = overview.storage;
  const totalBytes = overview.totals.bytes;
  // Per-library bars share one scale (the biggest library) so their lengths are
  // directly comparable — a horizontal bar chart, not 4 full bars.
  const maxLib = Math.max(1, ...libs.map((l) => l.bytes));
  const segmentLabels = {
    keptByYou: de ? 'Von dir behalten' : 'Kept by you',
    keptByOthers: de ? 'Von anderen behalten' : 'Kept by others',
    dontCare: de ? 'Ist mir egal' : 'I don’t care',
    undecided: de ? 'Unentschieden (von dir zu prüfen)' : 'Undecided (yours to review)',
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {de ? 'Nach Bibliothek' : 'By library'}
      </h2>
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        {/* Share of the whole — a donut + library key. */}
        <div className="rounded-xl border border-slate-800 bg-panel p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            {de ? 'Wofür dein Speicher verwendet wird' : 'Where your space goes'}
          </div>
          <div className="flex justify-center py-2">
            <Donut
              size={168}
              thickness={22}
              max={storage.configured ? storage.totalBytes : undefined}
              center={
                storage.configured
                  ? `${formatNumber(pct(storage.usedBytes, storage.totalBytes), locale)}%`
                  : formatBytes(totalBytes, locale)
              }
              centerSub={storage.configured ? (de ? 'belegt' : 'full') : (de ? 'gesamt' : 'total')}
              segments={libs.map((l, i) => ({
                value: l.bytes,
                stroke: libStroke(i),
                dot: libColor(i),
                label: l.title,
              }))}
            />
          </div>
          <div className="mt-2 space-y-1.5">
            {libs.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${libColor(i)}`} />
                <span className="min-w-0 flex-1 truncate text-slate-300">{l.title}</span>
                <span className="shrink-0 font-mono text-slate-300">
                  {formatBytes(l.bytes, locale)}
                </span>
                <span className="shrink-0 min-w-[2.75rem] text-right font-mono text-xs text-slate-500">
                  {formatNumber(pct(l.bytes, storage.configured ? storage.totalBytes : totalBytes), locale)}%
                </span>
              </div>
            ))}
            {storage.configured && (
              <div className="flex items-center gap-2 border-t border-slate-800 pt-1.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-700" />
                <span className="min-w-0 flex-1 truncate text-slate-400">{de ? 'Frei' : 'Free'}</span>
                <span className="shrink-0 font-mono text-emerald-400">
                  {formatBytes(storage.freeBytes, locale)}
                </span>
                <span className="shrink-0 min-w-[2.75rem] text-right font-mono text-xs text-slate-500">
                  {formatNumber(pct(storage.freeBytes, storage.totalBytes), locale)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Per-library composition — bars share one scale (proportional to size). */}
        <div className="space-y-3">
          {libs.map((l, i) => {
            const keptOther = Math.max(0, l.keptBytes - l.keptByMeBytes);
            const keptOtherItems = Math.max(0, l.keptItems - l.keptByMeItems);
            return (
              <div key={l.id} className="rounded-xl border border-slate-800 bg-panel p-4">
                <div className="flex items-baseline gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${libColor(i)}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{l.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatNumber(l.items, locale)} {de ? 'Titel' : 'titles'}</span>
                  <span className="shrink-0 font-mono text-slate-200">
                    {formatBytes(l.bytes, locale)}
                  </span>
                </div>

                {/* The bar's WIDTH is proportional to library size (vs the biggest
                    library); it's fully filled, so there's no empty "free" track.
                    Brackets above each keep segment mark its never-watched slice. */}
                <div className="mt-2.5">
                  <div
                    className="min-w-[10px]"
                    style={{ width: `${(l.bytes / maxLib) * 100}%` }}
                  >
                    <StackedBar height="h-3" segments={compositionSegmentsSplit(l, segmentLabels)} />
                    {overview.tautulli && l.unwatchedBytes > 0 && (
                      <div className="mt-0.5">
                        <UnwatchedBrackets
                          segments={keptVsUnwatchedSegments(l, segmentLabels)}
                          max={l.bytes}
                          height="h-1.5"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {overview.tautulli && (
                  <div className="mt-1.5 text-[11px] text-slate-500">
                    {formatNumber(l.unwatchedItems, locale)} {de ? 'von niemandem angesehen' : 'never watched by anyone'} ·{' '}
                    {formatBytes(l.unwatchedBytes, locale)} · {formatNumber(pct(l.unwatchedBytes, l.bytes), locale)}%
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat tone="kept" label={de ? 'Von dir behalten' : 'Kept by you'} bytes={l.keptByMeBytes} items={l.keptByMeItems} />
                  <MiniStat tone="keptOther" label={de ? 'Von anderen behalten' : 'Kept by others'} bytes={keptOther} items={keptOtherItems} />
                  <MiniStat
                    tone="dontcare"
                    label={de ? 'Ist mir egal' : 'I don’t care'}
                    bytes={l.dontcareBytes}
                    items={l.dontcareItems}
                  />
                  <MiniStat
                    tone="undecided"
                    label={de ? 'Unentschieden' : 'Undecided'}
                    bytes={l.undecidedBytes}
                    items={l.undecidedItems}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Sonarr/Radarr "reclaim by quality": bytes/reclaimable/never-watched bucketed
 *  by resolution, plus a "Not in *arr" row. Surfaces e.g. how much 4K is
 *  reclaimable. Only rendered when arr is connected. */
function QualityReclaim({ overview }: { overview: Overview }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const qb = overview.qualityBreakdown!;
  // Bucket the per-quality rows by resolution (Unknown folds into Other).
  const buckets = new Map<
    string,
    { titles: number; bytes: number; reclaimableBytes: number; unwatchedBytes: number }
  >();
  for (const r of qb.byQuality) {
    const b = resolutionBucket(r.quality);
    const acc = buckets.get(b) ?? { titles: 0, bytes: 0, reclaimableBytes: 0, unwatchedBytes: 0 };
    acc.titles += r.titles;
    acc.bytes += r.bytes;
    acc.reclaimableBytes += r.reclaimableBytes;
    acc.unwatchedBytes += r.unwatchedBytes;
    buckets.set(b, acc);
  }
  const rows: {
    label: string;
    titles: number;
    bytes: number;
    reclaimableBytes: number;
    unwatchedBytes: number;
  }[] = RES_ORDER.filter((b) => buckets.has(b)).map((b) => ({ label: b, ...buckets.get(b)! }));
  if (qb.notInArr.titles > 0) rows.push({ label: de ? 'Nicht in *arr' : 'Not in *arr', ...qb.notInArr });
  const showWatched = !!overview.tautulli;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {de ? 'Nach Qualität' : 'By quality'}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-rail text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{de ? 'Qualität' : 'Quality'}</th>
              <th className="px-3 py-2 text-right font-medium">{de ? 'Titel' : 'Titles'}</th>
              <th className="px-3 py-2 text-right font-medium">{de ? 'Auf Datenträger' : 'On disk'}</th>
              <th className="px-3 py-2 text-right font-medium">{de ? 'Nicht behalten' : 'Not kept'}</th>
              {showWatched && <th className="px-3 py-2 text-right font-medium">{de ? 'Nie angesehen' : 'Never watched'}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-800">
                <td className="px-3 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-right text-slate-400">{formatNumber(r.titles, locale)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatBytes(r.bytes, locale)}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-300">
                  {formatBytes(r.reclaimableBytes, locale)}
                </td>
                {showWatched && (
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {formatBytes(r.unwatchedBytes, locale)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {de
          ? '„Nicht behalten“ = Niemand hat dafür „Behalten“ gewählt — diese Titel kommen für eine Prüfung zur Speicherfreigabe infrage (Keeparr löscht niemals selbst). Prüfe die größten hochauflösenden Zeilen auf mögliche Herabstufungen. „Nicht in *arr“ = Titel, die Keeparr nicht zuordnen konnte.'
          : '“Not kept” = nobody pressed Keep on it — the candidates to review for freeing space (Keeparr never deletes). Scan the biggest high-resolution rows for downgrades. “Not in *arr” = titles Keeparr couldn’t match.'}
      </p>
    </section>
  );
}

function MiniStat({
  tone,
  label,
  bytes,
  items,
}: {
  tone: keyof typeof TONE;
  label: string;
  bytes: number;
  items: number;
}) {
  const { locale } = useLocale();
  const de = locale === 'de';
  return (
    <div className="rounded-lg bg-slate-900/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-sm ${TONE[tone].dot}`} />
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <div className="mt-1 font-mono text-sm">{formatBytes(bytes, locale)}</div>
      <div className="text-[11px] text-slate-500">{formatNumber(items, locale)} {de ? 'Titel' : 'titles'}</div>
    </div>
  );
}
