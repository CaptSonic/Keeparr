'use client';

import type { MediaCardData } from '@/lib/types';
import { formatGB } from '@/lib/format';
import { useKeepState } from './useKeepState';

/** One row of Browse's List view — the dense, quality/tags-forward counterpart
 *  to MediaCard. Reuses `useKeepState` for the same keep / "I don't care" logic. */
export default function MediaRow({
  item,
  sectionTitle,
}: {
  item: MediaCardData;
  sectionTitle: string;
}) {
  const keptByOthers = item.kept && !item.keptByMe;
  const { keptByMe, skipped, busy, skipBusy, toggleKeep, toggleSkip } = useKeepState({
    ratingKey: item.ratingKey,
    initialKeptByMe: item.keptByMe,
    initialSkipped: item.skipped,
  });

  return (
    <tr
      className={`border-t border-slate-800 hover:bg-slate-900/60 ${skipped ? 'opacity-50' : ''}`}
    >
      {/* Tiny poster, capped to the row height (h-9) so rows don't grow. */}
      <td className="py-1 pl-3 pr-0">
        <div className="h-9 w-6 overflow-hidden rounded bg-slate-800">
          {item.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="font-medium">{item.title}</span>
        {item.year && <span className="text-slate-500"> ({item.year})</span>}
      </td>
      <td className="px-3 py-2 text-slate-400">{sectionTitle}</td>
      <td className="px-3 py-2 text-right font-mono">
        {item.sizeMismatch && (
          <span
            className="mr-1 cursor-help text-amber-400"
            title={`Plex ${formatGB(item.sizeBytes)} vs *arr ${
              item.arrSizeBytes != null ? formatGB(item.arrSizeBytes) : '—'
            } — possible partial/broken file`}
          >
            ⚠
          </span>
        )}
        {formatGB(item.sizeBytes)}
      </td>
      <td className="px-3 py-2">
        {item.quality ? (
          <span>
            <span className="text-slate-200">{item.quality}</span>
            {item.qualityKind === 'profile' && (
              <span className="ml-1 text-[10px] uppercase text-slate-500">target</span>
            )}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {item.tags && item.tags.length ? (
          <span className="flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                {t}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-400">
        {item.status ? <span className="capitalize">{item.status}</span> : <span className="text-slate-600">—</span>}
        {item.monitored === false && (
          <span className="ml-1 text-[10px] uppercase text-slate-600">unmonitored</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {item.watched ? <span className="text-slate-300">✓</span> : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-2">
        {/* Fixed-width buttons so toggling their label (Keep ↔ ✓ Keep, I don't
            care ↔ ↺ Care) never reflows the column / table. */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void toggleKeep()}
            disabled={busy}
            title={keptByOthers && !keptByMe ? 'Kept by someone else — keep it yourself too' : undefined}
            className={`w-16 shrink-0 rounded px-2 py-1 text-center text-[11px] disabled:opacity-60 ${
              keptByMe
                ? 'bg-brand font-semibold text-slate-900'
                : keptByOthers
                  ? 'border border-amber-700/60 text-amber-200'
                  : 'border border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {keptByMe ? '✓ Keep' : keptByOthers ? 'Kept' : 'Keep'}
          </button>
          <button
            type="button"
            onClick={() => void toggleSkip()}
            disabled={skipBusy}
            className={`w-24 shrink-0 rounded px-2 py-1 text-center text-[11px] disabled:opacity-60 ${
              skipped
                ? 'bg-slate-700 text-slate-200'
                : 'border border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {skipped ? '↺ Care' : "I don't care"}
          </button>
        </div>
      </td>
    </tr>
  );
}
