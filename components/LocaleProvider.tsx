'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  detectLocale,
  LOCALE_STORAGE_KEY,
  messages,
  normalizeLocale,
  type Locale,
} from '@/lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  messages: (typeof messages)[Locale];
  setLocale: (locale: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function browserLocale(): Locale {
  try {
    const stored = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;
    return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
  } catch {
    return DEFAULT_LOCALE;
  }
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const local = browserLocale();
    setLocaleState(local);
    applyLocale(local);

    fetch('/api/auth/me')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const accountLocale = normalizeLocale(data?.user?.locale);
        if (!accountLocale) return;
        setLocaleState(accountLocale);
        applyLocale(accountLocale);
        try { localStorage.setItem(LOCALE_STORAGE_KEY, accountLocale); } catch {}
      })
      .catch(() => {});
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    applyLocale(next);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
    try {
      const response = await fetch('/api/preferences/locale', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      // A 401 is expected before login. Other failures intentionally leave the
      // local choice active; the next successful selection can sync it again.
      if (!response.ok && response.status !== 401) return;
    } catch {
      // Anonymous users and temporarily offline clients retain the local choice.
    }
  }, []);

  const value = useMemo(() => ({ locale, messages: messages[locale], setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}