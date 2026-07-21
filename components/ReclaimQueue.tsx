'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReclaimQueueItem } from '@/lib/types';
import { formatBytes, formatNumber } from '@/lib/i18n';
import { useKeepState } from './useKeepState';
import { useToast } from './Toaster';
import { useLocale } from './LocaleProvider';

interface Summary {
  items: number;
  bytes: number;
  strong: number;
}

interface Signals {
  watch: boolean;
  arr: boolean;
}

export default function ReclaimQueue() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [items, setItems] = useState<ReclaimQueueItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ items: 0, bytes: 0, strong: 0 });
  const [signals, setSignals] = useState<Signals>({ watch: false, arr: false });
  const [minScore, setMinScore] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const toast = useToast();

  const load = useCallback(async (reset: boolean) => {
    const request = ++seq.current;
    const off = reset ? 0 : offset;
    setLoading(true);
    try {
      const res = await fetch(`/api/reclaim-queue?minScore=${minScore}&offset=${off}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (request !== seq.current) return;
      const next = Array.isArray(data.items) ? data.items : [];
      setItems((old) => (reset ? next : [...old, ...next]));
      setSummary(data.summary ?? { items: 0, bytes: 0, strong: 0 });
      setSignals(data.signals ?? { watch: false, arr: false });
      setHasMore(!!data.hasMore);
      setOffset(typeof data.nextOffset === 'number' ? data.nextOffset : off);
    } catch {
      if (request === seq.current) toast(de ? 'Smart Reclaim konnte nicht geladen werden.' : "Couldn't load Smart Reclaim.", 'error');
    } finally {
      if (request === seq.current) setLoading(false);
    }
  }, [de, minScore, offset, toast]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScore]);

  function protectedNow(item: ReclaimQueueItem) {
    // A pending offset-page was calculated before this row disappeared. Ignore
    // that response; otherwise it can restore the old offset and skip the row
    // that just shifted into the next page's first position.
    seq.current++;
    setLoading(false);
    setItems((old) => old.filter((i) => i.ratingKey !== item.ratingKey));
    setSummary((s) => ({
      ...s,
      items: Math.max(0, s.items - 1),
      bytes: Math.max(0, s.bytes - item.sizeBytes),
      strong: Math.max(0, s.strong - (item.strength === 'strong' ? 1 : 0)),
    }));
    // Offset pagination counts candidates on the server. Removing one of the
    // loaded rows shifts every following page left by one.
    setOffset((current) => Math.max(0, current - 1));
    toast(de ? 'Geschützt – aus der Reclaim-Liste entfernt.' : 'Protected — removed from the reclaim queue.', 'success');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{de ? 'Intelligente Speicherfreigabe' : 'Smart Reclaim'}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {de
            ? 'Eine transparente Prioritätenliste ungeschützter Titel. Keeparr löscht niemals Medien; schütze alles, was du behalten möchtest, bevor du in deinen Medienwerkzeugen aktiv wirst.'
            : 'A transparent priority list of unprotected titles. Keeparr never deletes media; protect anything you want to keep before acting in your media tools.'}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric value={formatBytes(summary.bytes, locale)} label={de ? 'Potenziell freigebbar' : 'Potentially reclaimable'} />
        <Metric value={formatNumber(summary.items, locale)} label={de ? 'Ungeschützte Kandidaten' : 'Unprotected candidates'} />
        <Metric value={formatNumber(summary.strong, locale)} label={de ? 'Starke Kandidaten' : 'Strong candidates'} />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-panel p-3">
        <span className="text-sm font-medium">{de ? 'Minimale Signalstärke' : 'Minimum signal strength'}</span>
        {[0, 45, 70].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setMinScore(score)}
            className={`rounded-md px-3 py-1.5 text-sm ${minScore === score ? 'bg-brand text-ink' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
          >
            {score === 0 ? (de ? 'Alle' : 'All') : score === 45 ? (de ? 'Mittel +' : 'Medium +') : (de ? 'Nur starke' : 'Strong only')}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {de ? 'Wiedergabesignal' : 'Watch signal'} {signals.watch ? (de ? 'aktiv' : 'active') : (de ? 'noch nicht bereit' : 'not ready')} · *arr-{de ? 'Signal' : 'signal'}{' '}
          {signals.arr ? (de ? 'aktiv' : 'active') : (de ? 'nicht verfügbar' : 'unavailable')}
        </span>
      </section>

      <div className="space-y-3">
        {items.map((item, index) => (
          <QueueRow
            key={item.ratingKey}
            item={item}
            rank={index + 1}
            onProtected={protectedNow}
          />
        ))}
        {!loading && items.length === 0 && (
          <div className="rounded-lg border border-slate-800 p-8 text-center text-slate-400">
            {de ? 'Nichts entspricht dieser Signalstärke. Deine geschützten Titel gelangen nie in diese Liste.' : 'Nothing matches this strength. Your protected titles never enter this queue.'}
          </div>
        )}
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => load(false)}
            className="rounded-md border border-slate-700 px-5 py-2 text-sm hover:border-slate-500 disabled:opacity-60"
          >
            {loading ? (de ? 'Wird geladen…' : 'Loading…') : (de ? 'Mehr laden' : 'Load more')}
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-panel p-4">
      <div className="text-2xl font-bold text-brand">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function QueueRow({
  item,
  rank,
  onProtected,
}: {
  item: ReclaimQueueItem;
  rank: number;
  onProtected: (item: ReclaimQueueItem) => void;
}) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const keep = useKeepState({
    ratingKey: item.ratingKey,
    initialSkipped: item.skipped,
    initialMarkedForDelete: item.markedForDeleteByMe,
    onKeptChange: (_key, kept) => kept && onProtected(item),
  });
  const strengthClass =
    item.strength === 'strong'
      ? 'bg-rose-500/15 text-rose-300'
      : item.strength === 'medium'
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-slate-700 text-slate-300';
  return (
    <article className="flex gap-3 rounded-lg border border-slate-800 bg-panel p-3 sm:gap-4">
      <div className="w-7 shrink-0 pt-1 text-center text-sm text-slate-500">#{rank}</div>
      {item.thumbUrl ? (
        // Poster URLs are local authenticated proxy URLs with dynamic dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbUrl}
          alt=""
          className="h-24 w-16 shrink-0 rounded bg-slate-800 object-cover"
        />
      ) : (
        <div className="grid h-24 w-16 shrink-0 place-items-center rounded bg-slate-800 text-slate-600">
          ◇
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              {item.title}
              {item.year ? (
                <span className="font-normal text-slate-500"> ({item.year})</span>
              ) : null}
            </h2>
            <div className="mt-0.5 font-mono text-sm text-slate-400">
              {formatBytes(item.sizeBytes, locale)}
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${strengthClass}`}>
            {item.score}/100 · {de ? ({ strong: 'stark', medium: 'mittel', review: 'prüfen' }[item.strength]) : item.strength}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.reasons.map((reason) => (
            <span
              key={reason.code}
              title={`${reason.points} ${de ? 'Punkte' : 'score points'}`}
              className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
            >
              {reasonLabel(reason.code, reason.label, de)} <span className="text-slate-500">+{reason.points}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={keep.toggleKeep}
            disabled={keep.busy}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {keep.busy ? (de ? 'Wird gespeichert…' : 'Saving…') : (de ? 'Schützen / Behalten' : 'Protect / Keep')}
          </button>
          {item.skipped && (
            <span className="text-xs text-slate-500">{de ? 'Von dir als „Ist mir egal“ markiert' : 'You marked “don’t care”'}</span>
          )}
          {item.markedForDeleteAny && (
            <span className="text-xs text-rose-300">{de ? 'Vom Anfragenden freigegeben' : 'Released by requester'}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function reasonLabel(code: string, fallback: string, de: boolean): string {
  if (!de) return fallback;
  return ({
    size: 'Speicherbedarf', released: 'Zur Löschung freigegeben', 'never-watched': 'Von niemandem angesehen',
    'stale-watch': 'Lange nicht angesehen', finished: 'In Sonarr/Radarr abgeschlossen',
    'size-mismatch': 'Abweichende Größenangaben',
  } as Record<string, string>)[code] ?? fallback;
}