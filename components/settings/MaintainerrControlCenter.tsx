'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatNumber, formatRelativeTime } from '@/lib/i18n';
import { decisionReasonLabel } from '@/lib/decision-labels';
import type {
  MaintainerrPreview,
  MaintainerrPreviewItem,
  MaintainerrPreviewStatus,
} from '@/lib/maintainerr';
import { useLocale } from '../LocaleProvider';
import { Card, btnCls, btnGhost } from './ui';
import { MaintainerrJobProgress } from '../JobProgress';

const statuses: MaintainerrPreviewStatus[] = [
  'add', 'remove', 'managed', 'manual', 'blocked_keep',
  'blocked_recent', 'tracking', 'missing', 'outside', 'readd_blocked', 'paused',
];

const colors: Record<MaintainerrPreviewStatus, string> = {
  add: 'bg-emerald-500/15 text-emerald-300',
  remove: 'bg-red-500/15 text-red-300',
  managed: 'bg-blue-500/15 text-blue-300',
  manual: 'bg-slate-700 text-slate-300',
  blocked_keep: 'bg-violet-500/15 text-violet-300',
  blocked_recent: 'bg-amber-500/15 text-amber-300',
  tracking: 'bg-cyan-500/15 text-cyan-300',
  missing: 'bg-orange-500/15 text-orange-300',
  outside: 'bg-slate-800 text-slate-400',
  readd_blocked: 'bg-rose-500/15 text-rose-300',
  paused: 'bg-yellow-500/15 text-yellow-300',
};

const labels = {
  en: {
    title: 'Maintainerr Control Center', intro: 'Read-only dry run of the exact plan used by the next hand-off.',
    refresh: 'Refresh dry run', refreshing: 'Checking…', run: 'Run entire hand-off now', running: 'Running…',
    current: 'Current', owned: 'Keeparr-owned', desired: 'Desired', add: 'Add', remove: 'Remove',
    all: 'All', item: 'Title', collection: 'Collection', source: 'Source', status: 'Status', reason: 'Reason', watched: 'Last watched',
    empty: 'No rows match this filter.', failed: 'Could not create the dry run. Check Maintainerr and media-server connectivity.',
    paused: 'Reconciliation is paused. No additions or removals will be made.', never: 'Never watched', generated: 'Generated',
    notConfigured: 'Maintainerr hand-off is not configured. Configure it under Connections → Maintainerr first.',
    watchWarning: 'Watch data is not trusted for the current source. A real run will add nothing and withdraw Keeparr-owned memberships.',
    massBlocked: 'Safety stop: {count} planned changes exceed the mass-change threshold. Approve this exact plan once before running it.',
    approveMass: 'Approve entire exact plan once', approving: 'Approving…', approveReadd: 'Allow re-add once',
    history: 'Recent hand-off history', noHistory: 'No hand-off events recorded yet.', action: 'Action', time: 'Time',
    historyFilter: 'Filter history by title or media id',
    statuses: { add: 'Add', remove: 'Remove', managed: 'Managed', manual: 'Manual', blocked_keep: 'Keep blocked', blocked_recent: 'Recently watched', tracking: 'Observing', missing: 'Missing', outside: 'Outside', readd_blocked: 'Re-add blocked', paused: 'Paused' },
    reasons: { never_watched: 'Never watched', watch_age_met: 'Watch-age threshold met', requester_unwatched_180d: 'A requester has not watched in 6 months', global_unwatched_540d: 'Not watched by anyone in 18 months', automatic_rules_met: 'Both automatic watch rules matured', observing_requester_unwatched_180d: 'Tracking: a requester has not watched in 6 months', observing_global_unwatched_540d: 'Tracking: not watched by anyone in 18 months', observing_automatic_rules: 'Tracking both automatic watch rules', readd_approved: 'One-time re-add approved', already_managed: 'Already managed by Keeparr', existing_foreign_member: 'Existing manual member; Keeparr will not touch it', global_keep: 'Protected by a global Keep', watched_too_recently: 'Watched within the configured age', missing_from_media_server: 'No longer available on the media server', watch_cache_untrusted: 'No trusted watch cache for the current source', outside_selected_library: 'Outside the selected Maintainerr libraries', inventory_unavailable: 'Live media availability could not be verified', unexpected_remote_removal: 'Maintainerr removed a Keeparr-owned member unexpectedly', mass_change: 'Mass-change safety threshold reached', sonarr_archive_workflow: 'Excluded because Sonarr archives episode files without removing the series', release_revoked: 'Release is no longer active', ownership_stale: 'Ownership record exists but remote member is absent' },
  },
  de: {
    title: 'Maintainerr-Kontrollzentrum', intro: 'Schreibfreie Vorschau exakt des Plans, den die nächste Übergabe verwendet.',
    refresh: 'Dry-Run aktualisieren', refreshing: 'Prüfung läuft…', run: 'Gesamte Übergabe jetzt ausführen', running: 'Wird ausgeführt…',
    current: 'Aktuell', owned: 'Keeparr-eigen', desired: 'Gewünscht', add: 'Hinzufügen', remove: 'Entfernen',
    all: 'Alle', item: 'Titel', collection: 'Collection', source: 'Quelle', status: 'Status', reason: 'Begründung', watched: 'Zuletzt angesehen',
    empty: 'Keine Einträge entsprechen diesem Filter.', failed: 'Dry-Run konnte nicht erstellt werden. Prüfe Maintainerr und den Medienserver.',
    paused: 'Die Synchronisierung ist pausiert. Es wird nichts hinzugefügt oder entfernt.', never: 'Nie angesehen', generated: 'Erstellt',
    notConfigured: 'Die Maintainerr-Übergabe ist nicht konfiguriert. Richte sie zuerst unter Verbindungen → Maintainerr ein.',
    watchWarning: 'Die Watch-Daten sind für die aktuelle Quelle nicht vertrauenswürdig. Ein echter Lauf fügt nichts hinzu und zieht Keeparr-eigene Memberships zurück.',
    massBlocked: 'Sicherheitsstopp: {count} geplante Änderungen überschreiten den Massenschwellwert. Bestätige diesen exakten Plan einmalig vor der Ausführung.',
    approveMass: 'Gesamten exakten Plan einmalig freigeben', approving: 'Freigabe läuft…', approveReadd: 'Re-Add einmalig erlauben',
    history: 'Letzte Übergabe-Historie', noHistory: 'Noch keine Übergabe-Ereignisse gespeichert.', action: 'Aktion', time: 'Zeitpunkt',
    historyFilter: 'Historie nach Titel oder Medien-ID filtern',
    statuses: { add: 'Hinzufügen', remove: 'Entfernen', managed: 'Verwaltet', manual: 'Manuell', blocked_keep: 'Durch Keep blockiert', blocked_recent: 'Kürzlich angesehen', tracking: 'Beobachtung', missing: 'Nicht vorhanden', outside: 'Außerhalb', readd_blocked: 'Re-Add blockiert', paused: 'Pausiert' },
    reasons: { never_watched: 'Noch nie angesehen', watch_age_met: 'Watch-Alter erreicht', requester_unwatched_180d: 'Ein Anfragender hat den Titel seit 6 Monaten nicht angesehen', global_unwatched_540d: 'Seit 18 Monaten von niemandem angesehen', automatic_rules_met: 'Beide automatischen Watch-Regeln sind ausgereift', observing_requester_unwatched_180d: 'Beobachtung: Ein Anfragender hat den Titel seit 6 Monaten nicht angesehen', observing_global_unwatched_540d: 'Beobachtung: Seit 18 Monaten von niemandem angesehen', observing_automatic_rules: 'Beide automatischen Watch-Regeln werden beobachtet', readd_approved: 'Einmaliges Re-Add freigegeben', already_managed: 'Bereits von Keeparr verwaltet', existing_foreign_member: 'Manuelles Mitglied; Keeparr verändert es nicht', global_keep: 'Durch ein globales Keep geschützt', watched_too_recently: 'Innerhalb des konfigurierten Zeitraums angesehen', missing_from_media_server: 'Auf dem Medienserver nicht mehr verfügbar', watch_cache_untrusted: 'Kein vertrauenswürdiger Watch-Cache für die aktuelle Quelle', outside_selected_library: 'Außerhalb der ausgewählten Maintainerr-Bibliotheken', inventory_unavailable: 'Live-Verfügbarkeit konnte nicht geprüft werden', unexpected_remote_removal: 'Maintainerr hat ein Keeparr-eigenes Mitglied unerwartet entfernt', mass_change: 'Massenschwellwert erreicht', sonarr_archive_workflow: 'Ausgeschlossen, weil Sonarr Episodendateien archiviert, ohne die Serie zu entfernen', release_revoked: 'Freigabe ist nicht mehr aktiv', ownership_stale: 'Ownership-Eintrag vorhanden, Remote-Mitglied fehlt' },
  },
} as const;

function sourceLabel(source: MaintainerrPreviewItem['source'], de: boolean): string {
  const map = de
    ? { requester: 'Anforderer', campaign: 'Kampagne', both: 'Beides', automatic: 'Automatische Regel', mixed: 'Freigabe + Regel', managed: 'Keeparr', manual: 'Manuell' }
    : { requester: 'Requester', campaign: 'Campaign', both: 'Both', automatic: 'Automatic rule', mixed: 'Release + rule', managed: 'Keeparr', manual: 'Manual' };
  return map[source];
}

function actionLabel(action: string, de: boolean): string {
  const labels: Record<string, [string, string]> = {
    add: ['Add', 'Hinzufügen'],
    remove: ['Remove', 'Entfernen'],
    approve: ['Approve', 'Freigeben'],
    adopt: ['Adopt management', 'Verwaltung übernehmen'],
    none: ['Blocked', 'Blockiert'],
  };
  const value = labels[action];
  return value ? value[de ? 1 : 0] : action;
}

export default function MaintainerrControlCenter() {
  const { locale } = useLocale();
  const text = labels[locale];
  const [data, setData] = useState<MaintainerrPreview | null>(null);
  const [filter, setFilter] = useState<'all' | MaintainerrPreviewStatus>('all');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adoptSelected, setAdoptSelected] = useState<Set<string>>(new Set());
  const [readdSelected, setReaddSelected] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    let liveFinished = false;
    setLoading(true);
    setError('');
    setSelected(new Set());
    setAdoptSelected(new Set());
    setReaddSelected(new Set());
    setData((previous) => previous ? { ...previous, snapshot: true, massApproved: false } : null);
    // A separate lightweight request lets the last successful result render
    // while the expensive live request is still running. Never overwrite it.
    void fetch('/api/admin/maintainerr-preview?snapshot=1', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const saved = await response.json();
        if (!liveFinished && loadId.current === id && saved.preview) {
          setData({ ...saved.preview, snapshot: true, massApproved: false });
        }
      }).catch(() => undefined);
    try {
      const response = await fetch('/api/admin/maintainerr-preview', { cache: 'no-store' });
      if (!response.ok) throw new Error('preview_failed');
      const preview = await response.json();
      if (loadId.current === id) setData({ ...preview, snapshot: false });
    } catch {
      if (loadId.current === id) setError(text.failed);
    } finally {
      liveFinished = true;
      if (loadId.current === id) setLoading(false);
    }
  }, [text.failed]);

  useEffect(() => {
    load();
    return () => { loadId.current++; if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  async function runNow() {
    if (!data || data.snapshot || loading || running || approving) return;
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
      if (job && job.lastStatus !== 'running' && job.lastStatus !== 'queued') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setRunning(false);
        load();
      }
    }, 1500);
  }

  async function executeSelection() {
    if (!data || data.snapshot || loading || running || approving || selected.size === 0) return;
    const operations = data.items.filter((item) =>
      selected.has(`${item.collectionId}:${item.ratingKey}`) &&
      (item.status === 'add' || item.status === 'remove') && item.collectionId !== null
    ).map((item) => ({ collectionId: item.collectionId!, ratingKey: item.ratingKey, action: item.status }));
    if (!window.confirm(locale === 'de'
      ? `Nur diese ${operations.length} ausgewählten Änderungen jetzt einmalig ausführen? Alle anderen bleiben unverändert.`
      : `Execute only these ${operations.length} selected changes once? All others remain unchanged.`)) return;
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/admin/maintainerr-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute-selection', planHash: data.planHash, operations }),
      });
      if (!response.ok) throw new Error('selection_failed');
      await load();
    } catch {
      setError(locale === 'de'
        ? 'Auswahl nicht ausgeführt oder nur teilweise abgeschlossen. Vorschau aktualisieren und erneut prüfen; der Plan könnte sich geändert haben.'
        : 'Selection not executed or only partially completed. Refresh and review the plan; it may have changed.');
      setSelected(new Set());
    } finally {
      setRunning(false);
    }
  }

  async function adoptSelection() {
    if (!data || data.snapshot || data.paused || loading || running || approving) return;
    const members = data.items.filter((item) => item.status === 'manual' && item.collectionId !== null &&
      adoptSelected.has(`${item.collectionId}:${item.ratingKey}`))
      .map((item) => ({ collectionId: item.collectionId!, ratingKey: item.ratingKey }));
    if (!members.length || !window.confirm(locale === 'de'
      ? `${members.length} bestehende Mitglieder ausdrücklich in Keeparrs Verwaltung übernehmen? Dies fügt keine Medien hinzu und löscht keine Dateien. Danach die neue Vorschau prüfen: geschützte oder nicht mehr berechtigte Titel können zur Entfernung aus der Maintainerr-Sammlung vorgesehen sein.`
      : `Explicitly adopt ${members.length} existing members into Keeparr management? This adds no media and deletes no files. Review the new preview afterwards: protected or ineligible titles may be scheduled for removal from the Maintainerr collection.`)) return;
    setApproving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/maintainerr-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adopt-members', members }),
      });
      if (!response.ok) throw new Error('adoption_failed');
      setData(await response.json());
      setSelected(new Set());
      setAdoptSelected(new Set());
    } catch { setError(text.failed); }
    finally { setApproving(false); }
  }

  async function approve(action: 'approve-mass' | 'approve-readd' | 'approve-readds', item?: MaintainerrPreviewItem) {
    if (!data || data.snapshot || loading || running || approving) return;
    const members = data.items.filter((row) => row.status === 'readd_blocked' &&
      row.collectionId !== null && readdSelected.has(`${row.collectionId}:${row.ratingKey}`)
    ).map((row) => ({ collectionId: row.collectionId!, ratingKey: row.ratingKey }));
    if (action === 'approve-readds' && (members.length === 0 || !window.confirm(locale === 'de'
      ? `${members.length} ausgewählte Titel einmalig für die Wiederaufnahme entsperren? Es wird noch nichts hinzugefügt. Alle Gates bleiben aktiv.`
      : `Allow one-time re-add for ${members.length} selected titles? Nothing is added yet. All safety gates remain active.`))) return;
    setApproving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/maintainerr-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          collectionId: item?.collectionId,
          ratingKey: item?.ratingKey,
          members: action === 'approve-readds' ? members : undefined,
        }),
      });
      if (response.status === 409 && action === 'approve-readds') {
        setError(locale === 'de'
          ? 'Die Auswahl ist nicht mehr aktuell. Es wurde nichts entsperrt. Bitte die Live-Vorschau aktualisieren und erneut auswählen.'
          : 'The selection is stale. Nothing was approved. Refresh the live preview and select again.');
        return;
      }
      if (!response.ok) throw new Error('approval_failed');
      setData(await response.json());
      setSelected(new Set());
      setReaddSelected(new Set());
    } catch {
      setError(text.failed);
    } finally {
      setApproving(false);
    }
  }

  const rows = useMemo(() =>
    data?.items.filter((item) => filter === 'all' || item.status === filter) ?? [],
  [data, filter]);
  const blockedRows = rows.filter((item) => item.status === 'readd_blocked' && item.collectionId !== null);

  function reasonLabel(item: MaintainerrPreviewItem): string {
    return decisionReasonLabel(item, locale, data?.automaticRules);
  }
  const history = useMemo(() => {
    const query = historyFilter.trim().toLocaleLowerCase(locale);
    if (!query) return data?.history ?? [];
    return (data?.history ?? []).filter((event) =>
      `${event.title ?? ''} ${event.ratingKey ?? ''}`.toLocaleLowerCase(locale).includes(query)
    );
  }, [data, historyFilter, locale]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">{text.title}</h2><p className="mt-1 text-sm text-slate-400">{text.intro}</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={loading || running || approving} className={btnGhost}>{loading ? text.refreshing : text.refresh}</button>
          <button type="button" onClick={runNow} disabled={loading || running || approving || !data || data.snapshot || data.paused || (data.massBlocked && !data.massApproved)} className={btnCls}>{running ? text.running : text.run}</button>
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <div className="mb-4"><MaintainerrJobProgress /></div>
      {data?.snapshot && <div className="mb-4 rounded-lg border border-cyan-800 bg-cyan-950/30 p-3 text-sm text-cyan-300">
        {locale === 'de'
          ? `Gespeicherte Vorschau – keine aktuelle Freigabe.${loading ? ' Live-Prüfung läuft im Hintergrund.' : ' Live-Prüfung erneut starten, um Aktionen freizuschalten.'}`
          : `Saved preview — not a current authorization.${loading ? ' Live check is running in the background.' : ' Retry the live check to enable actions.'}`}
      </div>}
      {data?.paused && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">{data.pauseReason === 'not_configured' ? text.notConfigured : text.paused}</div>}
      {data && !data.paused && !data.watchReady && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">{text.watchWarning}</div>}
      {!!data?.pendingWrites && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">{locale === 'de'
        ? `${data.pendingWrites} protokollierte Änderungen sind noch unbestätigt. Der nächste Übergabe-Job prüft Maintainerr erneut. Unklare Anfragen werden nicht automatisch wiederholt. Nicht alles entfernen und neu hinzufügen; bei dauerhaft unklarem Ergebnis zuerst Maintainerr prüfen.`
        : `${data.pendingWrites} journaled changes remain unconfirmed. The next hand-off job reads Maintainerr again. Ambiguous requests are never automatically retried. Do not remove everything and re-add it; inspect Maintainerr first if the outcome remains unclear.`}</div>}
      {data?.massBlocked && !data.massApproved && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300"><span className="min-w-0 flex-1">{text.massBlocked.replace('{count}', formatNumber(data.totalChanges, locale))}</span><button type="button" className={btnGhost} disabled={loading || running || approving || data.snapshot} onClick={() => approve('approve-mass')}>{approving ? text.approving : text.approveMass}</button></div>}
      {data && <p className="mb-4 text-xs text-slate-500">{text.generated}: {formatDate(data.generatedAt * 1000, locale, { dateStyle: 'medium', timeStyle: 'medium' })} · Watch age: {formatNumber(data.watchAgeDays, locale)} days</p>}

      {data?.diagnostics && <p className="mb-4 text-xs text-slate-500">
        {locale === 'de' ? 'Prüfzeiten' : 'Check timings'}: {data.diagnostics.totalMs} ms ·
        {' '}{locale === 'de' ? 'Verfügbarkeit' : 'Availability'}: {data.diagnostics.inventoryMs} ms
        {' '}({data.diagnostics.candidatesChecked}) · Plex collections: {data.diagnostics.plexCollectionsMs} ms
        {' '}({data.diagnostics.plexCollectionsRead}) · Maintainerr: {data.diagnostics.maintainerrMs} ms
      </p>}
      {data?.diagnostics?.collectionReads && <details className="mb-4 rounded border border-slate-800 p-3 text-xs text-slate-400">
        <summary className="cursor-pointer">{locale === 'de' ? 'Plex-Collection-Abfragen' : 'Plex collection requests'}: {data.diagnostics.collectionReads.requests}</summary>
        {data.diagnostics.collectionReads.concurrency !== undefined && <p className="mt-2">
          {locale === 'de' ? 'Parallelität: Limit / maximal aktive Abfragen' : 'Concurrency: limit / peak active requests'}:
          {' '}{data.diagnostics.collectionReads.concurrency} / {data.diagnostics.collectionReads.peakRequests}
        </p>}
        <p className="mt-2">
          {locale === 'de' ? 'Übersicht / Metadaten / Mitglieder-Seiten' : 'Listing / metadata / member pages'}:
          {' '}{data.diagnostics.collectionReads.listingRequests} / {data.diagnostics.collectionReads.metadataRequests} / {data.diagnostics.collectionReads.memberRequests}
          {' · '}{locale === 'de' ? 'Collections / ignoriert / Mitgliedschaften' : 'Collections / ignored / memberships'}:
          {' '}{data.diagnostics.collectionReads.collections} / {data.diagnostics.collectionReads.ignoredCollections} / {data.diagnostics.collectionReads.members}
        </p>
        {data.diagnostics.collectionReads.listingMs !== undefined && <p className="mt-2">
          {locale === 'de' ? 'Summierte Anfragezeiten – Übersicht / Metadaten / Mitglieder' : 'Summed request times — listing / metadata / members'}:
          {' '}{data.diagnostics.collectionReads.listingMs} / {data.diagnostics.collectionReads.metadataMs} / {data.diagnostics.collectionReads.memberMs} ms.
          {' '}{locale === 'de' ? 'Parallele Abfragen überlappen; keine Gesamtlaufzeit.' : 'Concurrent requests overlap; not elapsed runtime.'}
        </p>}
        <p className="mt-2">{locale === 'de' ? 'Langsamste Collections (inkl. Metadatenabruf)' : 'Slowest collections (including metadata reads)'}</p>
        <ul className="mt-1 space-y-1">{data.diagnostics.collectionReads.slowest.map((row, index) => <li key={`${row.ratingKey}:${index}`}>
          {row.title}: {row.durationMs} ms · {row.requests} {locale === 'de' ? 'Abfragen' : 'requests'} · {row.members} {locale === 'de' ? 'Mitglieder' : 'members'}{row.ignored ? (locale === 'de' ? ' · ignoriert' : ' · ignored') : ''}
          {row.metadataMs !== undefined && <span className="ml-1">({locale === 'de' ? 'Metadaten' : 'Metadata'}: {row.metadataMs} ms · {locale === 'de' ? 'Mitglieder' : 'Members'}: {row.memberMs} ms)</span>}
          {row.memberPath && <code className="ml-1 break-all text-slate-500">{row.memberPath}</code>}
        </li>)}</ul>
      </details>}
      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.collections ?? []).map((collection) => <Card key={collection.id} title={`${collection.title} · ${collection.type}`}>
          <div className="grid grid-cols-5 gap-2 text-center">
            {([[text.current, collection.current], [text.owned, collection.managed], [text.desired, collection.desired], [text.add, collection.add], [text.remove, collection.remove]] as const).map(([label, value]) =>
              <div key={label} className="rounded bg-slate-900/50 p-2"><div className="text-lg font-bold text-white">{formatNumber(value, locale)}</div><div className="text-[10px] uppercase text-slate-500">{label}</div></div>)}
          </div>
        </Card>)}
      </div>

      <Card title={locale === 'de' ? 'Entscheidungen' : 'Decisions'}>
        <p className="mb-3 text-sm text-slate-400">{locale === 'de'
          ? '„Manuell“ bedeutet: bereits in Maintainerr vorhanden, aber ohne Keeparr-Verwaltungsnachweis (auch nach früheren Timeouts möglich). Nur bekannte Einträge ausdrücklich übernehmen; anschließend die neue Vorschau prüfen und den Übergabe-Job ausführen.'
          : '“Manual” means already in Maintainerr without Keeparr ownership evidence (also possible after older timeouts). Explicitly adopt only known entries, then review the new preview and run the hand-off job.'}</p>
        <button type="button" className={`${btnGhost} mb-3`}
          disabled={loading || running || approving || !data || data.snapshot || data.paused || adoptSelected.size === 0}
          onClick={adoptSelection}>
          {locale === 'de' ? 'Ausgewählte bestehende Mitglieder übernehmen' : 'Adopt selected existing members'} ({adoptSelected.size})
        </button>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-400">{locale === 'de'
            ? 'Änderungen einzeln auswählen. Nicht ausgewählte Einträge werden nicht ausgeführt.'
            : 'Select individual changes. Unselected entries will not be executed.'}</span>
          <button type="button" className={btnCls}
            disabled={loading || running || approving || !data || data.snapshot || data.paused || selected.size === 0}
            onClick={executeSelection}>
            {locale === 'de' ? 'Auswahl einmalig ausführen' : 'Execute selection once'} ({selected.size})
          </button>
        </div>
        {(data?.summary.readd_blocked ?? 0) > 0 && <div className="mb-3 space-y-2 rounded-md border border-slate-700 p-3">
          <p className="text-sm text-slate-400">{locale === 'de'
            ? 'Re-Add-Sperren gemeinsam freigeben. Dies erlaubt nur die einmalige Wiederaufnahme; es führt keine Übergabe aus und umgeht keine Gates.'
            : 'Approve re-add blocks together. This only authorizes one-time re-add; it does not execute a hand-off or bypass any gates.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} disabled={loading || running || approving || data?.snapshot || data?.paused || blockedRows.length === 0}
              onClick={() => setReaddSelected((previous) => new Set([...previous, ...blockedRows.map((item) => `${item.collectionId}:${item.ratingKey}`)]))}>
              {locale === 'de' ? 'Alle sichtbaren Re-Add-Sperren auswählen' : 'Select all visible re-add blocks'}
            </button>
            <button type="button" className={btnGhost} disabled={loading || running || approving || readdSelected.size === 0} onClick={() => setReaddSelected(new Set())}>
              {locale === 'de' ? 'Auswahl aufheben' : 'Clear selection'}
            </button>
            <button type="button" className={btnCls} disabled={loading || running || approving || data?.snapshot || data?.paused || readdSelected.size === 0} onClick={() => approve('approve-readds')}>
              {locale === 'de' ? 'Ausgewählte einmalig entsperren' : 'Allow selected re-adds once'} ({readdSelected.size})
            </button>
          </div>
        </div>}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter('all')} className={`rounded-full px-3 py-1 text-xs ${filter === 'all' ? 'bg-brand text-ink' : 'bg-slate-800 text-slate-300'}`}>{text.all} ({formatNumber(data?.items.length ?? 0, locale)})</button>
          {statuses.map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1 text-xs ${filter === status ? colors[status] : 'bg-slate-800 text-slate-400'}`}>{text.statuses[status]} ({formatNumber(data?.summary[status] ?? 0, locale)})</button>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">{text.item}</th><th className="px-3 py-2">{text.collection}</th><th className="px-3 py-2">{text.source}</th><th className="px-3 py-2">{text.status}</th><th className="px-3 py-2">{text.reason}</th><th className="px-3 py-2">{text.watched}</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((item) => <tr key={`${item.collectionId ?? 'none'}:${item.ratingKey}`}>
                <td className="px-3 py-2 font-medium text-slate-200">
                  {item.status === 'manual' && item.collectionId !== null &&
                    <input type="checkbox" className="mr-2" disabled={loading || running || approving || data?.snapshot || data?.paused}
                      aria-label={`${locale === 'de' ? 'Verwaltung übernehmen' : 'Adopt management'}: ${item.title}`}
                      checked={adoptSelected.has(`${item.collectionId}:${item.ratingKey}`)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setAdoptSelected((previous) => {
                          const next = new Set(previous);
                          const key = `${item.collectionId}:${item.ratingKey}`;
                          if (checked) next.add(key); else next.delete(key);
                          return next;
                        });
                      }} />}
                  {(item.status === 'add' || item.status === 'remove') && item.collectionId !== null &&
                    <input type="checkbox" className="mr-2" disabled={loading || running || approving || data?.snapshot}
                      aria-label={`${locale === 'de' ? 'Auswählen' : 'Select'}: ${item.title}`}
                      checked={selected.has(`${item.collectionId}:${item.ratingKey}`)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelected((previous) => {
                          const next = new Set(previous);
                          const key = `${item.collectionId}:${item.ratingKey}`;
                          if (checked) next.add(key); else next.delete(key);
                          return next;
                        });
                      }} />}
                  {item.status === 'readd_blocked' && item.collectionId !== null &&
                    <input type="checkbox" className="mr-2" disabled={loading || running || approving || data?.snapshot || data?.paused}
                      aria-label={`${locale === 'de' ? 'Zum Entsperren auswählen' : 'Select for re-add approval'}: ${item.title}`}
                      checked={readdSelected.has(`${item.collectionId}:${item.ratingKey}`)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setReaddSelected((previous) => {
                          const next = new Set(previous);
                          const key = `${item.collectionId}:${item.ratingKey}`;
                          if (checked) next.add(key); else next.delete(key);
                          return next;
                        });
                      }} />}
                  {item.title}{item.year ? <span className="ml-1 text-xs text-slate-500">({item.year})</span> : null}</td>
                <td className="px-3 py-2 text-slate-400">{item.collectionTitle ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{sourceLabel(item.source, locale === 'de')}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[item.status]}`}>{text.statuses[item.status]}</span></td>
                <td className="px-3 py-2 text-slate-400">{reasonLabel(item)}{item.status === 'tracking' && item.dueAt ? <span className="ml-1 text-xs text-cyan-400">({locale === 'de' ? 'bis' : 'until'} {formatDate(item.dueAt * 1000, locale, { dateStyle: 'medium' })})</span> : null}{item.status === 'readd_blocked' && item.collectionId !== null ? <button type="button" className="ml-2 rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:border-rose-500" disabled={loading || running || approving || data?.snapshot} onClick={() => approve('approve-readd', item)}>{text.approveReadd}</button> : null}</td>
                <td className="px-3 py-2 text-slate-500">{item.lastWatched ? formatRelativeTime(item.lastWatched, locale) : text.never}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{text.empty}</p>}
      </Card>
      <Card title={text.history}>
        <input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder={text.historyFilter} className="mb-3 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        {history.length === 0 ? <p className="text-sm text-slate-500">{text.noHistory}</p> : <div className="max-h-96 overflow-y-auto divide-y divide-slate-800 text-sm">{history.map((event) => <div key={event.id} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr_8rem_10rem_12rem]"><span className="text-slate-500">{formatDate(event.ts * 1000, locale, { dateStyle: 'short', timeStyle: 'medium' })}</span><span className="text-slate-200">{event.title ?? event.ratingKey ?? event.eventType}</span><span className="text-slate-400">{actionLabel(event.action, locale === 'de')}</span><span className="text-slate-400">{event.collectionTitle ?? '—'}</span><span className="text-slate-400">{text.reasons[event.reason as keyof typeof text.reasons] ?? event.reason}</span></div>)}</div>}
      </Card>
    </div>
  );
}