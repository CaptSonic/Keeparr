'use client';

import type { SourceFreshness } from '@/lib/data-freshness';
import { formatDate } from '@/lib/i18n';
import { jobLabel } from '@/lib/ui-labels';
import { useLocale } from './LocaleProvider';

/** Age and trust are intentionally separate; timestamps are not approval. */
export default function DataFreshness({ sources }: { sources: SourceFreshness[] }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  const date = (value: number | null) => value === null ? (de ? 'Unbekannt' : 'Unknown')
    : formatDate(value * 1000, locale, { dateStyle: 'medium', timeStyle: 'short' });
  const outcomes: Record<SourceFreshness['outcome'], string> = de
    ? { unknown: 'Noch nicht erfasst', running: 'Läuft', complete: 'Vollständig abgeschlossen', incomplete: 'Nicht vollständig aktualisiert', error: 'Fehlgeschlagen oder unterbrochen' }
    : { unknown: 'Not recorded yet', running: 'Running', complete: 'Fully completed', incomplete: 'Not fully refreshed', error: 'Failed or interrupted' };
  return <div className="space-y-3 text-sm">
    <p className="text-xs text-slate-400">{de
      ? 'Aktuelle lokale Quelleninformationen, unabhängig von einer gespeicherten Vorschau. Zeitpunkte sind keine Freigabe. Alte Installationen zeigen bis zum nächsten erfassten Abgleich „Unbekannt“.'
      : 'Current local source information, separate from any saved preview. Timestamps are not approval. Existing installations show “Unknown” until the next recorded refresh.'}</p>
    {sources.map((source) => <section key={source.source} className="rounded border border-slate-700 p-3">
      <h4 className="font-semibold">{jobLabel(source.source, locale)}</h4>
      {!source.configured ? <p className="text-slate-400">{de ? 'Nicht konfiguriert' : 'Not configured'}</p> : <>
        <p>{de ? 'Letzter Start' : 'Last attempt started'}: {date(source.lastAttemptAt)}</p>
        <p>{de ? 'Letzter vollständiger Erfolg' : 'Last complete success'}: {date(source.lastSuccessAt)}</p>
        <p className={source.outcome === 'error' || source.outcome === 'incomplete' ? 'text-amber-300' : 'text-slate-400'}>
          {outcomes[source.outcome]}
        </p>
        {source.watchTrusted !== null && <p className={source.watchTrusted ? 'text-slate-400' : 'text-amber-300'}>
          {source.watchTrusted
            ? de ? 'Wiedergabecache passt zur aktuellen Quelle. Das Alter wird separat angezeigt.' : 'Watch cache matches the current source. Its age is shown separately.'
            : de ? 'Keine vertrauenswürdigen Wiedergabedaten für die aktuelle Quelle. Fehlende Daten bedeuten nicht „nie angesehen“.' : 'No trusted watch data for the current source. Missing data does not mean “never watched”.'}
        </p>}
      </>}
    </section>)}
  </div>;
}