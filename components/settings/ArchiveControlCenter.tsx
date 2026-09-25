'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDate } from '@/lib/i18n';
import { useLocale } from '../LocaleProvider';
import { Card, btnCls, btnGhost } from './ui';

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

export default function ArchiveControlCenter() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [targets, setTargets] = useState<Target[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/archive', { cache: 'no-store' });
    if (!response.ok) throw new Error('load_failed');
    const data = await response.json();
    setTargets(data.targets ?? []);
    setRuns(data.runs ?? []);
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

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold">
          {de ? 'Serien-Archivierung' : 'Series archiving'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {de
            ? 'Sichere Zwei-Schritt-Ausführung über Sonarr. Keeparr löscht nie direkt im Dateisystem. Placeholdarr kann anschließend auf Sonarr-Webhooks reagieren.'
            : 'Safe two-step execution through Sonarr. Keeparr never deletes files directly. Placeholdarr can react to the resulting Sonarr webhooks.'}
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