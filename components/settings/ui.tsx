'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../LocaleProvider';

/** Shared form chrome for the Settings panels. */
export const inputCls =
  'w-full rounded-md bg-panel border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-brand';
export const btnCls =
  'rounded-md bg-brand hover:bg-brand-light text-ink font-semibold px-4 py-2 text-sm disabled:opacity-60';
export const btnGhost =
  'rounded-md border border-slate-700 hover:border-slate-500 px-4 py-2 text-sm disabled:opacity-60';

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-card mb-6 break-inside-avoid rounded border border-slate-800 bg-panel">
      <h2 className="border-b border-slate-800 px-5 py-4 text-base">{title}</h2>
      <div className="p-5">
        {children}
      </div>
    </section>
  );
}

/**
 * Single full-width column of stacked cards. (Multi-column reflow was jarring on
 * resize.) Cards carry their own bottom margin, so they just stack. Jobs & Cache
 * opts out with its own 2-column grid.
 */
export function CardColumns({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

const TABS = [
  { href: '/settings/general', en: 'General', de: 'Allgemein', group: 0, hintDe: 'Name, Bibliotheken und Grundeinstellungen.', hintEn: 'Name, libraries and basic preferences.' },
  { href: '/settings/users', en: 'People & access', de: 'Personen & Zugriff', group: 0, hintDe: 'Konten und Berechtigungen verwalten.', hintEn: 'Manage accounts and permissions.' },
  { href: '/settings/connections', en: 'Connections', de: 'Verbindungen', group: 0, hintDe: 'Medienserver und verbundene Dienste einrichten.', hintEn: 'Connect your media server and services.' },
  { href: '/settings/maintainerr', en: 'Maintainerr hand-off', de: 'Maintainerr-Übergabe', group: 1, hintDe: 'Plan prüfen: Welche Titel werden an Maintainerr übergeben oder zurückgezogen?', hintEn: 'Review which titles will be handed off to or withdrawn from Maintainerr.' },
  { href: '/settings/archive', en: 'Series archive', de: 'Serien archivieren', group: 1, hintDe: 'Archivierungspläne und Wiederherstellungen prüfen.', hintEn: 'Review archive plans and restores.' },
  { href: '/settings/jobs', en: 'Refresh & backups', de: 'Daten & Sicherungen', group: 2, hintDe: 'Daten aktualisieren, Zeitpläne und Sicherungen verwalten.', hintEn: 'Refresh data and manage schedules and backups.' },
  { href: '/settings/logs', en: 'Logs', de: 'Protokolle', group: 2, hintDe: 'Meldungen und Fehler nachvollziehen.', hintEn: 'Inspect messages and errors.' },
  { href: '/settings/about', en: 'About', de: 'Info', group: 2, hintDe: 'Version und Informationen zur Anwendung.', hintEn: 'Version and application information.' },
];

/** Settings shell: task-grouped navigation and an explanation of the active panel. */
export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const de = locale === 'de';
  const current = TABS.find((tab) => pathname.startsWith(tab.href));
  return (
    <div className="mx-auto max-w-screen-2xl px-3 py-5 sm:px-6 sm:py-6">
      <p className="mb-1 text-sm text-slate-400">{de ? 'Einstellungen' : 'Settings'}</p>
      <h1 className="text-xl font-semibold">{current ? de ? current.de : current.en : de ? 'Verwaltung' : 'Administration'}</h1>
      <p className="mt-2 mb-6 max-w-3xl text-sm text-slate-400">{current ? de ? current.hintDe : current.hintEn : ''}</p>
      <nav aria-label={de ? 'Einstellungsbereiche' : 'Settings sections'} className="mb-6 grid gap-4 border-y border-slate-800 py-3 lg:grid-cols-3">
        {[de ? 'Einrichten' : 'Set up', de ? 'Aufräumen' : 'Clean up', de ? 'Betrieb' : 'Maintenance'].map((label, group) => (
          <div key={label}>
            <p className="mb-1 px-2 text-xs text-slate-500">{label}</p>
            <div className="flex flex-wrap gap-1">
              {TABS.filter((tab) => tab.group === group).map((t) => {
                const active = pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? 'page' : undefined}
                    className={`border-b-2 px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'border-brand text-brand'
                        : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {de ? t.de : t.en}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {children}
    </div>
  );
}
