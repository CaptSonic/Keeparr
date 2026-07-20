'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'keeparr.theme';
const CIM_KEY = 'keeparr.colorImpaired';
const SYSTEM_QUERY = '(prefers-color-scheme: light)';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  colorImpaired: boolean;
  setPreference: (preference: ThemePreference) => void;
  setColorImpaired: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function readColorImpaired(): boolean {
  try {
    return localStorage.getItem(CIM_KEY) === '1';
  } catch {
    return false;
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia(SYSTEM_QUERY).matches ? 'light' : 'dark';
}

function applyTheme(preference: ThemePreference, colorImpaired: boolean): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', preference);
  if (colorImpaired) root.setAttribute('data-cim', '1');
  else root.removeAttribute('data-cim');

  // Keep browser chrome / the installed PWA title bar in step with manual and
  // live system changes. RootLayout renders this tag before hydration.
  let themeColor = document.querySelector<HTMLMetaElement>('meta[data-keeparr-theme-color]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.dataset.keeparrThemeColor = '1';
    document.head.appendChild(themeColor);
  }
  themeColor.content = resolved === 'light' ? '#f8fafc' : '#0f172a';
  return resolved;
}

/**
 * Owns appearance state for the whole document. It stays mounted even while the
 * user menu is closed, so System mode follows OS changes continuously.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [colorImpaired, setColorImpairedState] = useState(false);

  useEffect(() => {
    const syncFromStorage = () => {
      const nextPreference = readPreference();
      const nextColorImpaired = readColorImpaired();
      setPreferenceState(nextPreference);
      setColorImpairedState(nextColorImpaired);
      setResolvedTheme(applyTheme(nextPreference, nextColorImpaired));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === CIM_KEY || event.key === null) {
        syncFromStorage();
      }
    };

    syncFromStorage();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // This listener depends on the in-memory preference instead of re-reading
  // storage, so a manual choice remains stable even when storage is blocked.
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia(SYSTEM_QUERY);
    const onSystemChange = () => setResolvedTheme(applyTheme('system', colorImpaired));
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, [preference, colorImpaired]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Applying the in-memory preference still works without storage. */
    }
    setPreferenceState(next);
    setResolvedTheme(applyTheme(next, colorImpaired));
  }, [colorImpaired]);

  const setColorImpaired = useCallback((enabled: boolean) => {
    try {
      if (enabled) localStorage.setItem(CIM_KEY, '1');
      else localStorage.removeItem(CIM_KEY);
    } catch {
      /* Applying the in-memory preference still works without storage. */
    }
    setColorImpairedState(enabled);
    setResolvedTheme(applyTheme(preference, enabled));
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      colorImpaired,
      setPreference,
      setColorImpaired,
    }),
    [preference, resolvedTheme, colorImpaired, setPreference, setColorImpaired]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}