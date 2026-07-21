'use client';

import { useLocale } from './LocaleProvider';

export default function LanguageMenu({ compact = false }: { compact?: boolean }) {
  const { locale, messages: m, setLocale } = useLocale();
  return (
    <div className={compact ? '' : 'mt-3 border-t border-slate-700 pt-3'}>
      {!compact && <div className="mb-2 text-xs font-semibold text-slate-200">{m.common.language}</div>}
      <div className="inline-flex rounded-md border border-slate-700 bg-slate-900/60 p-0.5" role="group" aria-label={m.common.language}>
        {(['de', 'en'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={locale === value}
            onClick={() => void setLocale(value)}
            className={`rounded px-2.5 py-1.5 text-xs transition-colors ${locale === value ? 'bg-brand text-ink' : 'text-slate-400 hover:text-white'}`}
          >
            {value === 'de' ? m.common.german : m.common.english}
          </button>
        ))}
      </div>
    </div>
  );
}