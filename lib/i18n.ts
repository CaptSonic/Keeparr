export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'keeparr.locale';

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return language === 'de' || language === 'en' ? language : null;
}

export function detectLocale(languages: readonly string[] = []): Locale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export const messages = {
  en: {
    common: {
      language: 'Language', german: 'Deutsch', english: 'English', save: 'Save', cancel: 'Cancel',
      close: 'Close', back: 'Back', continue: 'Continue', loading: 'Loading…', retry: 'Try again',
      items: 'Items', size: 'Size', all: 'All', none: 'None', yes: 'Yes', no: 'No', search: 'Search',
    },
    meta: { description: 'Decide what media to keep, and find what can be deleted.' },
    nav: {
      keep: 'Keep', browse: 'Browse', allLibraries: 'All libraries', reclaim: 'Smart Reclaim',
      campaigns: 'Campaigns', stats: 'Big Picture', settings: 'Settings', openMenu: 'Open menu',
      closeMenu: 'Close menu', collapseLibraries: 'Collapse libraries', expandLibraries: 'Expand libraries',
      issue: 'issue', issues: 'issues', profile: 'Profile', signedInAs: 'Signed in as', logout: 'Sign out',
      logoutAll: 'Sign out on all devices', shortcuts: 'Keyboard shortcuts',
    },
    appearance: {
      title: 'Appearance', description: 'Choose how Keeparr looks.', theme: 'Color theme', system: 'System',
      currently: 'Currently {theme}', light: 'Light', dark: 'Dark', bright: 'Bright surfaces',
      dimmed: 'Dimmed surfaces', impaired: 'Color-impaired mode', impairedDetail: 'Uses more distinguishable status colors.',
    },
    login: {
      chooseServer: 'Which media server do you use?', chooseOnce: 'You can only choose this once during setup.',
      address: 'Enter your {server} server address.', connecting: 'Connecting…', unreachable: 'Could not reach that server.',
      signInAccount: 'Sign in with your {server} account.', username: 'Username', password: 'Password',
      signingIn: 'Signing in…', signIn: 'Sign in', invalidCredentials: 'Invalid username or password.',
      signInError: 'Something went wrong signing in.', plexIntro: 'Sign in with Plex to mark what to keep.',
      plexWaiting: 'Waiting for Plex…', plexSignIn: 'Sign in with Plex',
      plexComplete: 'Complete the login in the Plex window, then come back here.',
      plexDenied: "That Plex account doesn't have access to this server. Ask the owner to share a library with you, then try again.",
      plexError: 'Something went wrong talking to Plex. Please try again.',
    },
    keep: {
      title: 'What should we keep?', forYou: 'For you', largest: 'Largest',
      triageHint: 'Tap anything you want to keep — everything else gets marked “I don’t care.”',
      largestHint: 'Your biggest titles by size on disk.', caughtUp: 'You’re all caught up here. Try another library above.',
      feedError: "Couldn't load the feed — is the server reachable?", saveError: "Couldn't save this batch — nothing was marked.",
      kept: 'kept', next: 'Next →', refresh: 'Refresh', markRest: 'Marks everything you didn’t keep as',
      markRestEnd: 'and loads a fresh set.', freshLargest: 'Loads a fresh set of your biggest titles.',
      diskSpace: 'Disk space', free: 'free', of: 'of', full: 'full', byLibrary: 'By library', noLibraries: 'No libraries yet.',
      keptLabel: 'Kept', dontCare: 'I don’t care', undecided: 'Undecided', otherFiles: 'Other files',
      progress: 'Your progress', reviewed: 'reviewed', leftToReview: 'left to review', keptByYou: 'Kept by you',
    },
    media: {
      keep: 'Keep', kept: 'Kept', dontCare: "I don't care", careAgain: 'I care after all', care: 'Care',
      okDelete: 'OK to delete', neverMind: 'Never mind', requested: 'Requested', watched: 'Watched',
      watchedTitle: 'You’ve watched this', quality: 'Quality', qualityProfile: 'Quality profile', target: 'target',
      unmonitored: 'unmonitored', keptByOtherTitle: 'Kept by someone else — keep it yourself too',
      requestedDeleteTitle: 'You requested this — mark it OK to delete', possibleBroken: 'possible partial/broken file',
    },
    searchResults: {
      prompt: 'Type something to search.', noMatches: 'No matches for “{query}”.',
      loadError: "Couldn't load search results — is the server reachable?",
    },
    library: {
      title: 'Browse', allLibraries: 'All libraries', hintBefore: 'Pick libraries from the', hintAfter: 'list in the sidebar (all shown by default).',
      searchTitles: 'Search titles…', releaseYear: 'Release year', recentlyAdded: 'Recently added', titleColumn: 'Title',
      libraryColumn: 'Library', quality: 'Quality', tags: 'Tags', status: 'Status', watched: 'Watched',
      ascending: 'Ascending', descending: 'Descending', sortColumn: 'Sort by this column', statusAll: 'Status: All',
      undecided: 'Undecided', keptByYou: 'Kept by you', keptByOthers: 'Kept by others', okDeleteYou: 'OK to delete (by you)',
      okDeleteAnyone: 'OK to delete (by anyone)', watchFilterTitle: "Filter by what you've watched", watchedAny: 'Watched: any',
      watchedByYou: 'Watched by you', notWatchedByYou: 'Not watched by you', notWatchedAnyone: 'Not watched by anyone',
      watched30: 'Watched ≤ 30 days', watched60: 'Watched ≤ 60 days', watched90: 'Watched ≤ 90 days', stale90: 'Not watched in 90+ days',
      allApps: 'All apps', apps: 'Apps', allInstances: 'All instances', instances: 'Instances', allTags: 'All tags',
      allQualities: 'All qualities', anyStatus: 'Any status', anyMonitoring: 'Any monitoring', monitoring: 'Monitoring',
      monitored: 'Monitored', unmonitored: 'Unmonitored', arrTitle: 'Whether the title exists in Sonarr/Radarr',
      arrAny: 'In *arr: any', inArr: 'In Sonarr / Radarr', notInArr: 'Not in Sonarr / Radarr', sizeMismatch: 'Size mismatch',
      requestedByMe: 'Requested by me', gridView: 'Grid view', listView: 'List view', grid: 'Grid', list: 'List',
      noMatches: 'No matches.', loadMore: 'Load more', loadError: "Couldn't load the library — is the server reachable?",
      clear: 'Clear', selectAll: 'Select all',
    },
  },
  de: {
    common: {
      language: 'Sprache', german: 'Deutsch', english: 'English', save: 'Speichern', cancel: 'Abbrechen',
      close: 'Schließen', back: 'Zurück', continue: 'Weiter', loading: 'Wird geladen…', retry: 'Erneut versuchen',
      items: 'Titel', size: 'Größe', all: 'Alle', none: 'Keine', yes: 'Ja', no: 'Nein', search: 'Suchen',
    },
    meta: { description: 'Gemeinsam entscheiden, welche Medien bleiben und was Speicherplatz freigeben kann.' },
    nav: {
      keep: 'Behalten', browse: 'Bibliothek', allLibraries: 'Alle Bibliotheken', reclaim: 'Smart Reclaim',
      campaigns: 'Kampagnen', stats: 'Gesamtübersicht', settings: 'Einstellungen', openMenu: 'Menü öffnen',
      closeMenu: 'Menü schließen', collapseLibraries: 'Bibliotheken einklappen', expandLibraries: 'Bibliotheken ausklappen',
      issue: 'Problem', issues: 'Probleme', profile: 'Profil', signedInAs: 'Angemeldet als', logout: 'Abmelden',
      logoutAll: 'Auf allen Geräten abmelden', shortcuts: 'Tastenkürzel',
    },
    appearance: {
      title: 'Darstellung', description: 'Lege fest, wie Keeparr aussieht.', theme: 'Farbschema', system: 'System',
      currently: 'Aktuell {theme}', light: 'Hell', dark: 'Dunkel', bright: 'Helle Oberflächen',
      dimmed: 'Gedämpfte Oberflächen', impaired: 'Modus für Farbsehschwäche',
      impairedDetail: 'Verwendet besser unterscheidbare Statusfarben.',
    },
    login: {
      chooseServer: 'Welchen Medienserver verwendest du?', chooseOnce: 'Diese Auswahl ist nur einmal bei der Einrichtung möglich.',
      address: 'Gib die Adresse deines {server}-Servers ein.', connecting: 'Verbindung wird hergestellt…',
      unreachable: 'Der Server konnte nicht erreicht werden.', signInAccount: 'Melde dich mit deinem {server}-Konto an.',
      username: 'Benutzername', password: 'Passwort', signingIn: 'Anmeldung läuft…', signIn: 'Anmelden',
      invalidCredentials: 'Benutzername oder Passwort ist ungültig.', signInError: 'Bei der Anmeldung ist etwas schiefgelaufen.',
      plexIntro: 'Melde dich mit Plex an, um Titel zu schützen.', plexWaiting: 'Warte auf Plex…',
      plexSignIn: 'Mit Plex anmelden', plexComplete: 'Schließe die Anmeldung im Plex-Fenster ab und kehre dann hierher zurück.',
      plexDenied: 'Dieses Plex-Konto hat keinen Zugriff auf den Server. Bitte den Besitzer, eine Bibliothek mit dir zu teilen, und versuche es erneut.',
      plexError: 'Bei der Verbindung mit Plex ist etwas schiefgelaufen. Bitte versuche es erneut.',
    },
    keep: {
      title: 'Was soll bleiben?', forYou: 'Für dich', largest: 'Größte',
      triageHint: 'Tippe alles an, was bleiben soll — alles andere wird als „Ist mir egal“ markiert.',
      largestHint: 'Deine größten Titel nach Speicherbedarf.', caughtUp: 'Hier bist du auf dem neuesten Stand. Probiere oben eine andere Bibliothek aus.',
      feedError: 'Der Feed konnte nicht geladen werden — ist der Server erreichbar?', saveError: 'Dieser Stapel konnte nicht gespeichert werden — es wurde nichts markiert.',
      kept: 'behalten', next: 'Weiter →', refresh: 'Aktualisieren', markRest: 'Markiert alles, was du nicht behältst, als',
      markRestEnd: 'und lädt eine neue Auswahl.', freshLargest: 'Lädt eine neue Auswahl deiner größten Titel.',
      diskSpace: 'Speicherplatz', free: 'frei', of: 'von', full: 'belegt', byLibrary: 'Nach Bibliothek', noLibraries: 'Noch keine Bibliotheken.',
      keptLabel: 'Behalten', dontCare: 'Ist mir egal', undecided: 'Unentschieden', otherFiles: 'Andere Dateien',
      progress: 'Dein Fortschritt', reviewed: 'geprüft', leftToReview: 'noch zu prüfen', keptByYou: 'Von dir behalten',
    },
    media: {
      keep: 'Behalten', kept: 'Behalten', dontCare: 'Ist mir egal', careAgain: 'Doch wichtig', care: 'Wichtig',
      okDelete: 'Kann gelöscht werden', neverMind: 'Doch nicht', requested: 'Angefragt', watched: 'Angesehen',
      watchedTitle: 'Du hast diesen Titel angesehen', quality: 'Qualität', qualityProfile: 'Qualitätsprofil', target: 'Ziel',
      unmonitored: 'nicht überwacht', keptByOtherTitle: 'Von jemand anderem behalten — behalte den Titel ebenfalls selbst',
      requestedDeleteTitle: 'Von dir angefragt — zur Löschung freigeben', possibleBroken: 'möglicherweise unvollständige/defekte Datei',
    },
    searchResults: {
      prompt: 'Gib einen Suchbegriff ein.', noMatches: 'Keine Treffer für „{query}“.',
      loadError: 'Die Suchergebnisse konnten nicht geladen werden — ist der Server erreichbar?',
    },
    library: {
      title: 'Bibliothek', allLibraries: 'Alle Bibliotheken', hintBefore: 'Wähle Bibliotheken in der', hintAfter: 'Liste der Seitenleiste aus (standardmäßig werden alle angezeigt).',
      searchTitles: 'Titel suchen…', releaseYear: 'Erscheinungsjahr', recentlyAdded: 'Kürzlich hinzugefügt', titleColumn: 'Titel',
      libraryColumn: 'Bibliothek', quality: 'Qualität', tags: 'Tags', status: 'Status', watched: 'Angesehen',
      ascending: 'Aufsteigend', descending: 'Absteigend', sortColumn: 'Nach dieser Spalte sortieren', statusAll: 'Status: Alle',
      undecided: 'Unentschieden', keptByYou: 'Von dir behalten', keptByOthers: 'Von anderen behalten', okDeleteYou: 'Kann gelöscht werden (von dir)',
      okDeleteAnyone: 'Kann gelöscht werden (von jemandem)', watchFilterTitle: 'Nach deinem Wiedergabestatus filtern', watchedAny: 'Angesehen: beliebig',
      watchedByYou: 'Von dir angesehen', notWatchedByYou: 'Von dir nicht angesehen', notWatchedAnyone: 'Von niemandem angesehen',
      watched30: 'In den letzten 30 Tagen angesehen', watched60: 'In den letzten 60 Tagen angesehen', watched90: 'In den letzten 90 Tagen angesehen', stale90: 'Seit mindestens 90 Tagen nicht angesehen',
      allApps: 'Alle Apps', apps: 'Apps', allInstances: 'Alle Instanzen', instances: 'Instanzen', allTags: 'Alle Tags',
      allQualities: 'Alle Qualitäten', anyStatus: 'Beliebiger Status', anyMonitoring: 'Beliebige Überwachung', monitoring: 'Überwachung',
      monitored: 'Überwacht', unmonitored: 'Nicht überwacht', arrTitle: 'Ob der Titel in Sonarr/Radarr vorhanden ist',
      arrAny: 'In *arr: beliebig', inArr: 'In Sonarr / Radarr', notInArr: 'Nicht in Sonarr / Radarr', sizeMismatch: 'Abweichende Größenangaben',
      requestedByMe: 'Von mir angefragt', gridView: 'Rasteransicht', listView: 'Listenansicht', grid: 'Raster', list: 'Liste',
      noMatches: 'Keine Treffer.', loadMore: 'Mehr laden', loadError: 'Die Bibliothek konnte nicht geladen werden — ist der Server erreichbar?',
      clear: 'Leeren', selectAll: 'Alle auswählen',
    },
  },
} as const;

export type Messages = (typeof messages)['en'];

export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function localeTag(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-US';
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

export function formatDate(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(localeTag(locale), options).format(value);
}

export function formatBytes(value: number, locale: Locale): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${formatNumber(value / 1024 ** index, locale, { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
}

export function formatRelativeTime(epochSeconds: number, locale: Locale, now = Date.now()): string {
  const seconds = epochSeconds - Math.floor(now / 1000);
  const abs = Math.abs(seconds);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] = abs < 60
    ? [seconds, 'second']
    : abs < 3600
      ? [Math.round(seconds / 60), 'minute']
      : abs < 86400
        ? [Math.round(seconds / 3600), 'hour']
        : abs < 2592000
          ? [Math.round(seconds / 86400), 'day']
          : abs < 31536000
            ? [Math.round(seconds / 2592000), 'month']
            : [Math.round(seconds / 31536000), 'year'];
  return new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' }).format(value, unit);
}