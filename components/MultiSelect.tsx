'use client';

import { useEffect, useRef, useState } from 'react';

export interface MSOption {
  value: string;
  label: string;
}
export interface MSGroup {
  /** Group header (with a select-all checkbox). Omit for a flat list. */
  label?: string;
  options: MSOption[];
}

/**
 * A checkbox dropdown for "any of" filtering. Empty selection = no filter (the
 * trigger shows `placeholder`). Supports grouped options with a per-group
 * select-all (used for quality-by-resolution), plus top-level Clear / Select all.
 */
export default function MultiSelect({
  placeholder,
  summaryName,
  groups,
  selected,
  onChange,
}: {
  placeholder: string;
  summaryName: string;
  groups: MSGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const sel = new Set(selected);
  const allValues = groups.flatMap((g) => g.options.map((o) => o.value));

  const toggle = (v: string) => {
    const next = new Set(sel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  };
  const toggleGroup = (opts: MSOption[]) => {
    const vals = opts.map((o) => o.value);
    const allOn = vals.every((v) => sel.has(v));
    const next = new Set(sel);
    vals.forEach((v) => (allOn ? next.delete(v) : next.add(v)));
    onChange([...next]);
  };

  const btnCls =
    'flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-brand focus:outline-none';

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={btnCls} onClick={() => setOpen((o) => !o)}>
        <span className="truncate">
          {selected.length === 0 ? placeholder : `${summaryName} (${selected.length})`}
        </span>
        <span className="text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-slate-700 bg-panel p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-1 text-xs">
            <button
              type="button"
              className="text-slate-400 hover:text-white disabled:opacity-40"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-slate-400 hover:text-white"
              onClick={() => onChange(allValues)}
            >
              Select all
            </button>
          </div>
          {groups.map((g, gi) => {
            const vals = g.options.map((o) => o.value);
            const allOn = vals.length > 0 && vals.every((v) => sel.has(v));
            const someOn = vals.some((v) => sel.has(v));
            return (
              <div key={g.label ?? gi} className="mb-1">
                {g.label && (
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-brand"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = someOn && !allOn;
                      }}
                      onChange={() => toggleGroup(g.options)}
                    />
                    {g.label}
                  </label>
                )}
                <div className={g.label ? 'ml-4' : ''}>
                  {g.options.map((o) => (
                    <label
                      key={o.value}
                      className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-300 hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-brand"
                        checked={sel.has(o.value)}
                        onChange={() => toggle(o.value)}
                      />
                      <span className="truncate">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
