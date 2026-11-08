import type { MaintainerrPreviewItem } from '@/lib/maintainerr';
import type { Locale } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n';
import { decisionReasonLabel } from '@/lib/decision-labels';

/** Display-only causes from the preview; opening details never reads or writes remotely. */
export function CollectionProtectionDetails({ item, locale }: {
  item: Pick<MaintainerrPreviewItem, 'title' | 'collectionBlockers'>;
  locale: Locale;
}) {
  const blockers = item.collectionBlockers;
  if (!blockers?.length) return null;
  const de = locale === 'de';
  return (
    <details className="mt-2 min-w-64 max-w-md rounded border border-indigo-500/30 bg-indigo-500/5 text-xs">
      <summary className="cursor-pointer rounded px-2 py-2 text-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
        aria-label={`${de ? 'Collection-Schutz für' : 'Collection protection for'} ${item.title}`}>
        {de ? 'Schützende Filme' : 'Protecting movies'} ({formatNumber(blockers.length, locale)})
      </summary>
      <p className="px-2 pb-2 leading-relaxed text-slate-400">
        {de
          ? 'Diese Filme verhindern die Freigabe der gesamten Plex-Collection. Der Schutz kann sich über überlappende Collections ausbreiten. Die Liste zeigt die Ursachen der angezeigten Vorschau und ist keine Freigabe.'
          : 'These movies prevent release of the entire Plex collection. Protection can propagate through overlapping collections. This list shows the causes in the displayed preview and does not grant approval.'}
      </p>
      <ul className="max-h-64 overflow-y-auto divide-y divide-slate-800 px-2" aria-label={de ? 'Schutzgründe' : 'Protection reasons'}>
        {blockers.map((blocker) => <li key={blocker.ratingKey} className="py-2">
          <p className="break-words font-medium text-slate-200">{blocker.title}{blocker.year !== null ? ` (${blocker.year})` : ''}</p>
          <p className="mt-1 whitespace-normal leading-relaxed text-slate-400">{decisionReasonLabel({ reason: blocker.reason, libraryKind: 'movie' }, locale)}</p>
          <p className="mt-1 break-all text-slate-500">{de ? 'Medien-ID' : 'Media ID'}: {blocker.ratingKey}</p>
        </li>)}
      </ul>
    </details>
  );
}