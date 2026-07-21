'use client';

import Link from 'next/link';
import { useLocale } from './LocaleProvider';

export function SetupRequired({ isAdmin }: { isAdmin: boolean }) {
  const { locale } = useLocale();
  const de = locale === 'de';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border border-slate-800 bg-panel p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">
          {de ? 'Keeparr ist noch nicht eingerichtet' : 'Keeparr isn’t set up yet'}
        </h1>
        {isAdmin ? (
          <p className="text-slate-400">
            {de ? 'Verbinde deinen Medienserver und starte unter ' : 'Connect your media server and run a scan in '}
            <Link href="/settings/connections" className="text-brand underline">
              {de ? 'Einstellungen' : 'Settings'}
            </Link>
            {de ? ' einen Scan.' : '.'}
          </p>
        ) : (
          <p className="text-slate-400">
            {de
              ? 'Der Besitzer muss die Einrichtung noch abschließen. Schau später noch einmal vorbei.'
              : 'The owner still needs to finish setting things up. Check back soon.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function NotSetUpYet({ className = 'text-slate-400' }: { className?: string }) {
  const { locale } = useLocale();
  return <p className={className}>{locale === 'de' ? 'Noch nicht eingerichtet.' : 'Not set up yet.'}</p>;
}

export function SearchHeading({ query }: { query: string }) {
  const { locale } = useLocale();
  const de = locale === 'de';
  return (
    <h1 className="mb-6 text-2xl font-bold">
      {query ? (de ? `Ergebnisse für „${query}“` : `Results for “${query}”`) : (de ? 'Suche' : 'Search')}
    </h1>
  );
}

export function ApiDocsLoading() {
  const { locale } = useLocale();
  return (
    <p className="p-6 text-sm text-slate-400">
      {locale === 'de' ? 'API-Dokumentation wird geladen…' : 'Loading API docs…'}
    </p>
  );
}