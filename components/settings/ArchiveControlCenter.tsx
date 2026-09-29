'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDate } from '@/lib/i18n';
import { useLocale } from '../LocaleProvider';
import { Card, btnCls, btnGhost, inputCls } from './ui';

interface Target {
  ratingKey: string;
  title: string;
  year: number | null;
  keptByAnyone: boolean;
  effectiveMode: string;
  instanceName: string | null;
}

interface Preview {
  ready: boolean;
  reason?: string;
  runId?: string;
  title: string;
  fileCount: number;
  episodeIds: number[];
  allEpisodeIds: number[];
  totalBytes: number;
  seasonNumbers: number[];
  instanceName?: string;
}

interface Run {
  id: string;
  ratingKey: string;
  status: string;
  createdAt: number;
  executedAt: number | null;
  preview: { title?: string; fileCount?: number };
}

interface ArchivedEpisode {
  episodeId: number;
  instanceId: string;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  status: string;
  lastError: string | null;
}

interface PlaceholderSettings {
  enabled: boolean;
  archiveRoot: string;
  plexArchiveRoot: string;
  templatePath: string;
  automaticRestore: boolean;
  plexRefresh: boolean;
  webhookSecret: string;
}

interface SonarrInstance {
  id: string;
  name: string;
  url: string;
}

export default function ArchiveControlCenter() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [targets, setTargets] = useState<Target[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [episodes, setEpisodes] = useState<ArchivedEpisode[]>([]);
  const [settings, setSettings] = useState<PlaceholderSettings | null>(null);
  const [sonarrInstances, setSonarrInstances] = useState<SonarrInstance[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [response, settingsResponse] = await Promise.all([
      fetch('/api/admin/archive', { cache: 'no-store' }),
      fetch('/api/admin/settings', { cache: 'no-store' }),
    ]);
    if (!response.ok || !settingsResponse.ok) throw new Error('load_failed');
    const [data, settingsData] = await Promise.all([response.json(), settingsResponse.json()]);
    setTargets(data.targets ?? []);
    setRuns(data.runs ?? []);
    setEpisodes(data.episodes ?? []);
    setSettings(settingsData.archivePlaceholders ?? null);
    setSonarrInstances(settingsData.sonarr?.instances ?? []);
  }, []);

  useEffect(() => {
    load().catch(() =>
      setError(
        de
          ? 'Archivierungsdaten konnten nicht geladen werden.'
          : 'Could not load archive data.'
      )
    );
  }, [load, de]);

  async function createPreview(ratingKey: string) {
    setBusy(ratingKey);
    setError('');
    setPreview(null);
    try {
      const response = await fetch('/api/admin/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      const data = (await response.json()) as Preview;
      setPreview(data);
      if (!response.ok) {
        setError(`${de ? 'Blockiert' : 'Blocked'}: ${data.reason ?? 'unknown'}`);
      }
    } catch {
      setError(de ? 'Vorschau fehlgeschlagen.' : 'Preview failed.');
    } finally {
      setBusy(null);
      await load().catch(() => undefined);
    }
  }

  async function execute() {
    if (!preview?.runId) return;
    const confirmed = window.confirm(
      de
        ? `${preview.fileCount} Episodendateien wirklich über Sonarr entfernen?`
        : `Really remove ${preview.fileCount} episode files through Sonarr?`
    );
    if (!confirmed) return;
    setBusy(preview.runId);
    setError('');
    try {
      const response = await fetch('/api/admin/archive', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: preview.runId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          `${de ? 'Ausführung blockiert/fehlgeschlagen' : 'Execution blocked/failed'}: ${
            data.reason ?? data.error ?? 'unknown'
          }`
        );
      } else {
        setPreview(null);
      }
    } catch {
      setError(de ? 'Ausführung fehlgeschlagen.' : 'Execution failed.');
    } finally {
      setBusy(null);
      await load().catch(() => undefined);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy('settings');
    setError('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivePlaceholders: settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'save_failed');
      await load();
    } catch (reason) {
      setError(`${de ? 'Speichern fehlgeschlagen' : 'Save failed'}: ${String(reason)}`);
    } finally {
      setBusy(null);
    }
  }

  async function restore(instanceId: string, episodeIds: number[]) {
    setBusy(`restore:${instanceId}:${episodeIds.join(',')}`);
    setError('');
    try {
      const response = await fetch('/api/admin/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, episodeIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'restore_failed');
      await load();
    } catch (reason) {
      setError(`${de ? 'Wiederherstellung fehlgeschlagen' : 'Restore failed'}: ${String(reason)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold">
          {de ? 'Serien-Archivierung' : 'Series archiving'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {de
            ? 'Sichere Zwei-Schritt-Ausführung über Sonarr mit integrierten Plex-Platzhaltern und Wiederherstellung.'
            : 'Safe two-step execution through Sonarr with integrated Plex placeholders and restore.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {preview?.ready && (
        <Card title={de ? 'Freigabevorschau' : 'Execution preview'}>
          <p className="text-sm">
            <strong>{preview.title}</strong> · {preview.instanceName}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {preview.fileCount} {de ? 'Dateien' : 'files'} ·{' '}
            {preview.episodeIds.length} {de ? 'Episoden' : 'episodes'} ·{' '}
            {formatBytes(preview.totalBytes, locale)} · {de ? 'Staffeln' : 'seasons'}:{' '}
            {preview.seasonNumbers.join(', ') || '—'}
          </p>
          <div className="mt-4 flex gap-2">
            <button className={btnCls} disabled={!!busy} onClick={execute}>
              {de ? 'Jetzt über Sonarr archivieren' : 'Archive through Sonarr now'}
            </button>
            <button className={btnGhost} onClick={() => setPreview(null)}>
              {de ? 'Verwerfen' : 'Discard'}
            </button>
          </div>
        </Card>
      )}

      {settings && (
        <Card title={de ? 'Plex-Platzhalter' : 'Plex placeholders'}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
            {de ? 'Platzhalter bei neuen Archivierungen erzeugen' : 'Create placeholders for new archives'}
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">{de ? 'Archiv-Root in Keeparr' : 'Archive root in Keeparr'}</span>
              <input className={inputCls} value={settings.archiveRoot}
                onChange={(event) => setSettings({ ...settings, archiveRoot: event.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">{de ? 'Derselbe Root aus Plex-Sicht' : 'Same root as seen by Plex'}</span>
              <input className={inputCls} value={settings.plexArchiveRoot}
                onChange={(event) => setSettings({ ...settings, plexArchiveRoot: event.target.value })} />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-slate-400">{de ? 'Abspielbare Placeholder-Vorlage' : 'Playable placeholder template'}</span>
              <input className={inputCls} value={settings.templatePath}
                onChange={(event) => setSettings({ ...settings, templatePath: event.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox"
              checked={settings.automaticRestore}
              onChange={(event) => setSettings({ ...settings, automaticRestore: event.target.checked })} />
              {de ? 'Plex-Wiedergabe startet Restore' : 'Plex playback starts restore'}
            </label>
            <label className="flex items-center gap-2"><input type="checkbox"
              checked={settings.plexRefresh}
              onChange={(event) => setSettings({ ...settings, plexRefresh: event.target.checked })} />
              {de ? 'Plex nach Änderungen scannen' : 'Refresh Plex after changes'}
            </label>
          </div>
          <div className="mt-4 rounded-md bg-slate-950/50 p-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-300">Plex webhook</p>
            <code className="break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/plex?token={settings.webhookSecret}</code>
            <p className="mt-2 font-semibold text-slate-300">Sonarr webhook ({de ? 'je Instanz' : 'per instance'})</p>
            {sonarrInstances.length === 0 ? (
              <p>
                {de
                  ? 'Keine Sonarr-Instanz konfiguriert. Füge sie zuerst unter Einstellungen → Verbindungen hinzu.'
                  : 'No Sonarr instance configured. Add one under Settings → Connections first.'}
              </p>
            ) : (
              <div className="mt-1 space-y-2">
                {sonarrInstances.map((instance) => (
                  <div key={instance.id}>
                    <p>
                      <span className="font-semibold text-slate-300">
                        {instance.name || 'Sonarr'}
                      </span>{' '}
                      · Instance ID: <code>{instance.id}</code>
                    </p>
                    <code className="block break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/sonarr?instance={encodeURIComponent(instance.id)}&amp;token={encodeURIComponent(settings.webhookSecret)}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className={`${btnCls} mt-4`} disabled={!!busy} onClick={saveSettings}>
            {busy === 'settings' ? (de ? 'Speichere…' : 'Saving…') : (de ? 'Konfiguration speichern' : 'Save configuration')}
          </button>
        </Card>
      )}

      <Card title={de ? 'Ausstehende Serien' : 'Pending series'}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">{de ? 'Serie' : 'Series'}</th>
                <th className="p-2">Sonarr</th>
                <th className="p-2">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {targets.map((target) => (
                <tr key={target.ratingKey}>
                  <td className="p-2">
                    {target.title}
                    {target.year ? ` (${target.year})` : ''}
                  </td>
                  <td className="p-2 text-slate-400">
                    {target.instanceName ?? '—'}
                  </td>
                  <td className="p-2">
                    {target.keptByAnyone ? (
                      <span className="text-amber-300">Keep-Veto</span>
                    ) : (
                      target.effectiveMode
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <button
                      className={btnGhost}
                      disabled={
                        !!busy ||
                        target.keptByAnyone ||
                        target.effectiveMode !== 'archive_existing'
                      }
                      onClick={() => createPreview(target.ratingKey)}
                    >
                      {busy === target.ratingKey
                        ? de
                          ? 'Prüfe…'
                          : 'Checking…'
                        : de
                          ? 'Vorschau'
                          : 'Preview'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {targets.length === 0 && (
          <p className="py-4 text-sm text-slate-500">
            {de
              ? 'Keine Serien zur Archivierung freigegeben.'
              : 'No series released for archiving.'}
          </p>
        )}
      </Card>

      <Card title={de ? 'Archivierte Episoden' : 'Archived episodes'}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr>
              <th className="p-2">{de ? 'Episode' : 'Episode'}</th><th className="p-2">Status</th><th className="p-2" />
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {episodes.map((episode) => (
                <tr key={`${episode.instanceId}:${episode.episodeId}`}>
                  <td className="p-2">{episode.seriesTitle} · S{String(episode.seasonNumber).padStart(2, '0')}E{String(episode.episodeNumber).padStart(2, '0')}{episode.episodeTitle ? ` · ${episode.episodeTitle}` : ''}
                    {episode.lastError && <div className="text-xs text-red-300">{episode.lastError}</div>}</td>
                  <td className="p-2 text-slate-400">{episode.status}</td>
                  <td className="p-2 text-right"><button className={btnGhost}
                    disabled={!!busy || episode.status !== 'archived'}
                    onClick={() => restore(episode.instanceId, [episode.episodeId])}>
                    {episode.status === 'restoring' ? (de ? 'Läuft…' : 'Running…') : (de ? 'Wiederherstellen' : 'Restore')}
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {episodes.length === 0 && <p className="py-4 text-sm text-slate-500">{de ? 'Noch keine manifestierten Platzhalter.' : 'No manifested placeholders yet.'}</p>}
      </Card>

      <Card title={de ? 'Audit-Verlauf' : 'Audit history'}>
        <div className="divide-y divide-slate-800 text-sm">
          {runs.map((run) => (
            <div
              key={run.id}
              className="grid gap-1 py-2 sm:grid-cols-[1fr_8rem_12rem]"
            >
              <span>{run.preview?.title ?? run.ratingKey}</span>
              <span className="text-slate-400">{run.status}</span>
              <span className="text-slate-500">
                {formatDate((run.executedAt ?? run.createdAt) * 1000, locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}