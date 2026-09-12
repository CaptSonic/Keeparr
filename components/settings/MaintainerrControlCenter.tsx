'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatNumber, formatRelativeTime } from '@/lib/i18n';
import type {
  MaintainerrPreview,
  MaintainerrPreviewItem,
  MaintainerrPreviewStatus,
} from '@/lib/maintainerr';
import { useLocale } from '../LocaleProvider';
import { Card, btnCls, btnGhost } from './ui';

const statuses: MaintainerrPreviewStatus[] = [
  'add', 'remove', 'managed', 'manual', 'blocked_keep',
  'blocked_recent', 'missing', 'outside', 'paused',
];

const colors: Record<MaintainerrPreviewStatus, string> = {
  add: 'bg-emerald-500/15 text-emerald-300',
  remove: 'bg-red-500/15 text-red-300',
  managed: 'bg-blue-500/15 text-blue-300',
  manual: 'bg-slate-700 text-slate-300',
  blocked_keep: 'bg-violet-500/15 text-violet-300',
  blocked_recent: 'bg-amber-500/15 text-amber-300',
  missing: 'bg-orange-500/15 text-orange-300',
  outside: 'bg-slate-800 text-slate-400',
  paused: 'bg-yellow-500/15 text-yellow-300',
};

const labels = {
  en: {
    title: 'Maintainerr Control Center', intro: 'Read-only dry run of the exact plan used by the next hand-off.',
    refresh: 'Refresh dry run', refreshing: 'Checking…', run: 'Run hand-off now', running: 'Running…',
    current: 'Current', owned: 'Keeparr-owned', desired: 'Desired', add: 'Add', remove: 'Remove',
    all: 'All', item: 'Title', collection: 'Collection', source: 'Source', status: 'Status', reason: 'Reason', watched: 'Last watched',
    empty: 'No rows match this filter.', failed: 'Could not create the dry run. Check Maintainerr and media-server connectivity.',
    paused: 'Reconciliation is paused. No additions or removals will be made.', never: 'Never watched', generated: 'Generated',
    notConfigured: 'Maintainerr hand-off is not configured. Configure it under Connections → Maintainerr first.',
    watchWarning: 'Watch data is not trusted for the current source. A real run will add nothing and withdraw Keeparr-owned memberships.',
    statuses: { add: 'Add', remove: 'Remove', managed: 'Managed', manual: 'Manual', blocked_keep: 'Keep blocked', blocked_recent: 'Recently watched', missing: 'Missing', outside: 'Outside', paused: 'Paused' },
    reasons: { never_watched: 'Never watched', watch_age_met: 'Watch-age threshold met', already_managed: 'Already managed by Keeparr', existing_foreign_member: 'Existing manual member; Keeparr will not touch it', global_keep: 'Protected by a global Keep', watched_too_recently: 'Watched within the configured age', missing_from_media_server: 'No longer available on the media server', watch_cache_untrusted: 'No trusted watch cache for the current source', outside_selected_library: 'Outside the selected Maintainerr libraries', inventory_unavailable: 'Live media availability could not be verified', release_revoked: 'Release is no longer active', ownership_stale: 'Ownership record exists but remote member is absent' },
  },
  de: {
    title: 'Maintainerr-Kontrollzentrum', intro: 'Schreibfreie Vorschau exakt des Plans, den die nächste Übergabe verwendet.',
    refresh: 'Dry-Run aktualisieren', refreshing: 'Prüfung läuft…', run: 'Übergabe jetzt ausführen', running: 'Wird ausgeführt…',
    current: 'Aktuell', owned: 'Keeparr-eigen', desired: 'Gewünscht', add: 'Hinzufügen', remove: 'Entfernen',
    all: 'Alle', item: 'Titel', collection: 'Collection', source: 'Quelle', status: 'Status', reason: 'Begründung', watched: 'Zuletzt angesehen',
    empty: 'Keine Einträge entsprechen diesem Filter.', failed: 'Dry-Run konnte nicht erstellt werden. Prüfe Maintainerr und den Medienserver.',
    paused: 'Die Synchronisierung ist pausiert. Es wird nichts hinzugefügt oder entfernt.', never: 'Nie angesehen', generated: 'Erstellt',
    notConfigured: 'Die Maintainerr-Übergabe ist nicht konfiguriert. Richte sie zuerst unter Verbindungen → Maintainerr ein.',
    watchWarning: 'Die Watch-Daten sind für die aktuelle Quelle nicht vertrauenswürdig. Ein echter Lauf fügt nichts hinzu und zieht Keeparr-eigene Memberships zurück.',
    statuses: { add: 'Hinzufügen', remove: 'Entfernen', managed: 'Verwaltet', manual: 'Manuell', blocked_keep: 'Durch Keep blockiert', blocked_recent: 'Kürzlich angesehen', missing: 'Nicht vorhanden', outside: 'Außerhalb', paused: 'Pausiert' },
    reasons: { never_watched: 'Noch nie angesehen', watch_age_met: 'Watch-Alter erreicht', already_managed: 'Bereits von Keeparr verwaltet', existing_foreign_member: 'Manuelles Mitglied; Keeparr verändert es nicht', global_keep: 'Durch ein globales Keep geschützt', watched_too_recently: 'Innerhalb des konfigurierten Zeitraums angesehen', missing_from_media_server: 'Auf dem Medienserver nicht mehr verfügbar', watch_cache_untrusted: 'Kein vertrauenswürdiger Watch-Cache für die aktuelle Quelle', outside_selected_library: 'Außerhalb der ausgewählten Maintainerr-Bibliotheken', inventory_unavailable: 'Live-Verfügbarkeit konnte nicht geprüft werden', release_revoked: 'Freigabe ist nicht mehr aktiv', ownership_stale: 'Ownership-Eintrag vorhanden, Remote-Mitglied fehlt' },
  },
} as const;

function sourceLabel(source: MaintainerrPreviewItem['source'], de: boolean): string {
  const map = de
    ? { requester: 'Anforderer', campaign: 'Kampagne', both: 'Beides', managed: 'Keeparr', manual: 'Manuell' }
    : { requester: 'Requester', campaign: 'Campaign', both: 'Both', managed: 'Keeparr', manual: 'Manual' };
  return map[source];
}

export default function MaintainerrControlCenter() {
  const { locale } = useLocale();
  const text = labels[locale];
  const [data, setData] = useState<MaintainerrPreview | null>(null);
  const [filter, setFilter] = useState<'all' | MaintainerrPreviewStatus>('all');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/maintainerr-preview', { cache: 'no-store' });
      if (!response.ok) throw new Error('preview_failed');
      setData(await response.json());
    } catch {
      setError(text.failed);
    } finally {
      setLoading(false);
    }
  }, [text.failed]);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  async function runNow() {
    setRunning(true);
    setError('');
    const response = await fetch('/api/admin/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: 'maintainerr' }),
    });
    if (!response.ok) {
      setRunning(false);
      setError(text.failed);
      return;
    }
    pollRef.current = setInterval(async () => {
      const jobs = await fetch('/api/admin/jobs', { cache: 'no-store' }).then((r) => r.json());
      const job = (jobs.jobs ?? []).find((row: { jobId: string }) => row.jobId === 'maintainerr');
      if (job && job.lastStatus !== 'running') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setRunning(false);
        load();
      }
    }, 1500);
  }

  const rows = useMemo(() =>
    data?.items.filter((item) => filter === 'all' || item.status === filter) ?? [],
  [data, filter]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">{text.title}</h2><p className="mt-1 text-sm text-slate-400">{text.intro}</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={loading || running} className={btnGhost}>{loading ? text.refreshing : text.refresh}</button>
          <button type="button" onClick={runNow} disabled={loading || running || !data || data.paused} className={btnCls}>{running ? text.running : text.run}</button>
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      {data?.paused && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">{data.pauseReason === 'not_configured' ? text.notConfigured : text.paused}</div>}
      {data && !data.paused && !data.watchReady && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">{text.watchWarning}</div>}
      {data && <p className="mb-4 text-xs text-slate-500">{text.generated}: {formatDate(data.generatedAt * 1000, locale, { dateStyle: 'medium', timeStyle: 'medium' })} · Watch age: {formatNumber(data.watchAgeDays, locale)} days</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.collections ?? []).map((collection) => <Card key={collection.id} title={`${collection.title} · ${collection.type}`}>
          <div className="grid grid-cols-5 gap-2 text-center">
            {([[text.current, collection.current], [text.owned, collection.managed], [text.desired, collection.desired], [text.add, collection.add], [text.remove, collection.remove]] as const).map(([label, value]) =>
              <div key={label} className="rounded bg-slate-900/50 p-2"><div className="text-lg font-bold text-white">{formatNumber(value, locale)}</div><div className="text-[10px] uppercase text-slate-500">{label}</div></div>)}
          </div>
        </Card>)}
      </div>

      <Card title={locale === 'de' ? 'Entscheidungen' : 'Decisions'}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter('all')} className={`rounded-full px-3 py-1 text-xs ${filter === 'all' ? 'bg-brand text-ink' : 'bg-slate-800 text-slate-300'}`}>{text.all} ({formatNumber(data?.items.length ?? 0, locale)})</button>
          {statuses.map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1 text-xs ${filter === status ? colors[status] : 'bg-slate-800 text-slate-400'}`}>{text.statuses[status]} ({formatNumber(data?.summary[status] ?? 0, locale)})</button>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">{text.item}</th><th className="px-3 py-2">{text.collection}</th><th className="px-3 py-2">{text.source}</th><th className="px-3 py-2">{text.status}</th><th className="px-3 py-2">{text.reason}</th><th className="px-3 py-2">{text.watched}</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((item) => <tr key={`${item.collectionId ?? 'none'}:${item.ratingKey}`}>
                <td className="px-3 py-2 font-medium text-slate-200">{item.title}{item.year ? <span className="ml-1 text-xs text-slate-500">({item.year})</span> : null}</td>
                <td className="px-3 py-2 text-slate-400">{item.collectionTitle ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{sourceLabel(item.source, locale === 'de')}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[item.status]}`}>{text.statuses[item.status]}</span></td>
                <td className="px-3 py-2 text-slate-400">{text.reasons[item.reason as keyof typeof text.reasons] ?? item.reason}</td>
                <td className="px-3 py-2 text-slate-500">{item.lastWatched ? formatRelativeTime(item.lastWatched, locale) : text.never}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{text.empty}</p>}
      </Card>
    </div>
  );
}