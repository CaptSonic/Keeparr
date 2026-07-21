'use client';

import { useTheme, type ThemePreference } from './ThemeProvider';
import { useLocale } from './LocaleProvider';
import { interpolate } from '@/lib/i18n';

/**
 * Appearance controls live in the AppShell user menu so every signed-in user
 * can reach them. ThemeProvider owns persistence and live System-mode updates.
 */
export default function ThemeMenu() {
  const { messages: m } = useLocale();
  const { preference, resolvedTheme, colorImpaired, setPreference, setColorImpaired } =
    useTheme();

  const choices: {
    value: ThemePreference;
    label: string;
    detail: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'system',
      label: m.appearance.system,
      detail: interpolate(m.appearance.currently, { theme: resolvedTheme === 'light' ? m.appearance.light : m.appearance.dark }),
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
    },
    {
      value: 'light',
      label: m.appearance.light,
      detail: m.appearance.bright,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: m.appearance.dark,
      detail: m.appearance.dimmed,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mt-3 border-t border-slate-700 pt-3">
      <div className="mb-2">
        <div className="text-xs font-semibold text-slate-200">{m.appearance.title}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{m.appearance.description}</div>
      </div>
      <div className="space-y-1" role="group" aria-label={m.appearance.theme}>
        {choices.map((choice) => {
          const active = preference === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={active}
              onClick={() => setPreference(choice.value)}
              className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
                active
                  ? 'border-brand/70 bg-brand/15 text-white'
                  : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                  active ? 'bg-brand text-ink' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {choice.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{choice.label}</span>
                <span className="block text-[10px] text-slate-500">{choice.detail}</span>
              </span>
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${active ? 'bg-brand' : 'bg-slate-700'}`}
              />
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md px-1 text-xs text-slate-400 hover:text-white">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 accent-brand"
          checked={colorImpaired}
          onChange={(event) => setColorImpaired(event.target.checked)}
        />
        <span>
          <span className="block">{m.appearance.impaired}</span>
          <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
            {m.appearance.impairedDetail}
          </span>
        </span>
      </label>
    </div>
  );
}
