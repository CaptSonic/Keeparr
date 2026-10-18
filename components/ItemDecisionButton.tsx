'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ItemDecision } from '@/lib/item-decision';
import { decisionReasonLabel, decisionStatusLabel } from '@/lib/decision-labels';
import { formatDate } from '@/lib/i18n';
import { useLocale } from './LocaleProvider';

/** Fetch only on demand; opening an explanation never triggers a live Plex scan. */
export default function ItemDecisionButton({ ratingKey, title }: { ratingKey: string; title: string }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`${de ? 'Warum?' : 'Why?'} ${title}`} aria-haspopup="dialog"
        className="mt-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500">
        {de ? 'Warum?' : 'Why?'}
      </button>
      {open && createPortal(
        <DecisionDialog ratingKey={ratingKey} title={title} close={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
}

function DecisionDialog({ ratingKey, title, close }: { ratingKey: string; title: string; close: () => void }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<(ItemDecision & { admin: boolean }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch(`/api/item-decision?ratingKey=${encodeURIComponent(ratingKey)}`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('decision_failed');
      const result = await response.json();
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [ratingKey, attempt]);
  const date = (seconds: number) => formatDate(seconds * 1000, locale, { dateStyle: 'medium', timeStyle: 'short' });
  const preview = data?.maintainerr;
  return (
    <dialog ref={dialog} onCancel={(event) => { event.stopPropagation(); close(); }} onClose={close}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}
      onKeyDown={(event) => event.stopPropagation()} aria-label={`${de ? 'Entscheidung' : 'Decision'}: ${title}`}
      className="m-auto max-h-[85vh] w-[min(92vw,40rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-xl backdrop:bg-black/70">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={close} className="rounded border border-slate-600 px-2 py-1 text-sm">
          {de ? 'Schließen' : 'Close'}
        </button>
      </div>
      {!data && !failed && <p role="status">{de ? 'Lädt…' : 'Loading…'}</p>}
      {failed && <div role="alert">
        <p>{de ? 'Die Erklärung konnte nicht geladen werden.' : 'Could not load the explanation.'}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 underline">
          {de ? 'Erneut versuchen' : 'Retry'}
        </button>
      </div>}
      {data && <div className="space-y-4 text-sm">
        <section>
          <h3 className="font-semibold">{de ? 'Aktueller Keep-Schutz' : 'Current Keep protection'}</h3>
          <p className={data.kept ? 'text-amber-300' : 'text-slate-300'}>
            {data.kept
              ? data.keptByMe
                ? de ? 'Du behältst diesen Titel. Ein Keep hat immer Vorrang.' : 'You keep this title. A Keep always wins.'
                : de ? 'Jemand behält diesen Titel. Ein Keep hat immer Vorrang.' : 'Someone keeps this title. A Keep always wins.'
              : de ? 'Aktuell kein Keep gesetzt. Das ist keine Löschfreigabe.' : 'No Keep is currently set. This is not deletion approval.'}
          </p>
          <p className="mt-1 text-xs text-slate-400">{de ? 'Lokal geprüft' : 'Checked locally'}: {date(data.checkedAt)}</p>
        </section>
        {data.admin ? <section className="space-y-2 border-t border-slate-700 pt-3">
          <h3 className="font-semibold">{de ? 'Letzte Maintainerr-Vorschau' : 'Last Maintainerr preview'}</h3>
          {!preview ? <p>{de ? 'Nicht geprüft: Keine passende gespeicherte Vorschau vorhanden.' : 'Not checked: no matching saved preview available.'}</p> : <>
            <p className="text-slate-400">{date(preview.generatedAt)}</p>
            <p className="text-amber-300">{de
              ? 'Historischer Stand, keine aktuelle Freigabe. Jede Ausführung prüft erneut live. Seitdem können sich Keeps, Wiedergaben und Mitgliedschaften geändert haben.'
              : 'Historical snapshot, not current approval. Every execution checks live again. Keeps, watches and memberships may have changed since then.'}</p>
            {preview.paused && <p>{de ? 'Dieser Plan war pausiert; keine Änderungen vorgesehen.' : 'This plan was paused; no changes would be executed.'}</p>}
            {preview.massBlocked && <p>{de ? 'Massenschwellwert erreicht; eine neue Prüfung und gegebenenfalls Freigabe sind erforderlich.' : 'Mass-change threshold reached; a fresh check and, if needed, approval are required.'}</p>}
            {!preview.watchReady && <p>{de ? 'Wiedergabedaten waren nicht vertrauenswürdig.' : 'Watch data was not trusted.'}</p>}
            {preview.items.length === 0
              ? <p>{de ? 'Der Titel war in dieser Vorschau nicht enthalten. Daraus folgt keine Freigabe.' : 'This title was not included in that preview. This does not imply approval.'}</p>
              : <ul className="space-y-3">{preview.items.map((item, index) => <li key={`${item.collectionId}:${index}`} className="rounded bg-slate-800 p-3">
                <p className="font-semibold">{decisionStatusLabel(item.status, locale)}</p>
                <p>{decisionReasonLabel(item, locale, preview.automaticRules)}</p>
                {item.collectionTitle && <p className="text-slate-400">{item.collectionTitle}</p>}
                {item.status === 'tracking' && item.dueAt !== null && <p>{de ? 'Beobachtung bis' : 'Observing until'}: {date(item.dueAt)}</p>}
              </li>)}</ul>}
          </>}
          <p className="text-xs text-slate-400">{de
            ? 'Hinzufügen und Entfernen beziehen sich auf Maintainerr-Mitgliedschaften, nicht auf eine hier ausgeführte Dateilöschung. Der Archivablauf wird hier noch nicht dargestellt.'
            : 'Add and remove refer to Maintainerr memberships, not file deletion performed here. The archive workflow is not shown here yet.'}</p>
        </section> : <p className="text-slate-400">{de
          ? 'Automatisierungsdetails sind nur für Administratoren sichtbar. Kein Keep bedeutet nicht, dass ein Titel gelöscht werden darf.'
          : 'Automation details are visible to administrators only. No Keep does not mean a title may be deleted.'}</p>}
      </div>}
    </dialog>
  );
}