'use client';

import { useEffect, useState } from 'react';

type ThemePref = 'auto' | 'light' | 'dark';

const THEME_KEY = 'keeparr.theme';
const CIM_KEY = 'keeparr.colorImpaired';

function resolvedTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(pref: ThemePref, cim: boolean) {
  document.documentElement.setAttribute('data-theme', resolvedTheme(pref));
  if (cim) document.documentElement.setAttribute('data-cim', '1');
  else document.documentElement.removeAttribute('data-cim');
}

/**
 * Per-user appearance prefs (localStorage; the head script in app/layout.tsx
 * applies them pre-paint on load). Lives in the AppShell user menu so
 * non-admins get it too.
 */
export default function ThemeMenu() {
  const [pref, setPref] = useState<ThemePref>('auto');
  const [cim, setCim] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === 'light' || t === 'dark') setPref(t);
      setCim(localStorage.getItem(CIM_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  // On Auto, follow live OS scheme changes.
  useEffect(() => {
    if (pref !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply('auto', cim);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref, cim]);

  function choosePref(next: ThemePref) {
    setPref(next);
    try {
      if (next === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    apply(next, cim);
  }

  function toggleCim() {
    const next = !cim;
    setCim(next);
    try {
      if (next) localStorage.setItem(CIM_KEY, '1');
      else localStorage.removeItem(CIM_KEY);
    } catch {
      /* ignore */
    }
    apply(pref, next);
  }

  const segBtn = (value: ThemePref, label: string) => (
    <button
      key={value}
      onClick={() => choosePref(value)}
      className={`flex-1 rounded px-2 py-1 text-xs ${
        pref === value
          ? 'bg-slate-700 text-white'
          : 'text-slate-400 hover:text-white'
      }`}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="mt-2 border-t border-slate-700 pt-2">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Theme</div>
      <div className="flex gap-1 rounded-md bg-slate-800 p-0.5">
        {segBtn('auto', 'Auto')}
        {segBtn('light', 'Light')}
        {segBtn('dark', 'Dark')}
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-400 hover:text-white">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-brand"
          checked={cim}
          onChange={toggleCim}
        />
        Color-impaired mode
      </label>
    </div>
  );
}
