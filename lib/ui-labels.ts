import type { Locale } from './i18n';

const JOB_LABELS: Record<string, [string, string]> = {
  recentlyAdded: ['Recently added scan', 'Scan neu hinzugefügter Titel'],
  library: ['Full library scan', 'Vollständiger Bibliotheksscan'],
  sizes: ['Library size', 'Bibliotheksgröße'],
  watch: ['Watch history', 'Wiedergabeverlauf'],
  requests: ['Requests', 'Anfragen'],
  arr: ['Sonarr / Radarr', 'Sonarr / Radarr'],
  backup: ['Backup', 'Datensicherung'],
  all: ['all', 'alle'],
};

export function jobLabel(jobId: string, locale: Locale, fallback?: string): string {
  const label = JOB_LABELS[jobId];
  return label ? label[locale === 'de' ? 1 : 0] : fallback ?? jobId;
}

export function jobStatusLabel(status: string | null, locale: Locale): string {
  if (!status) return locale === 'de' ? 'Unbekannt' : 'Unknown';
  const labels: Record<string, [string, string]> = {
    running: ['Running', 'Läuft'],
    never: ['Never run', 'Noch nie ausgeführt'],
    ok: ['OK', 'OK'],
    error: ['Error', 'Fehler'],
    success: ['Success', 'Erfolgreich'],
    failed: ['Failed', 'Fehlgeschlagen'],
  };
  const label = labels[status];
  return label ? label[locale === 'de' ? 1 : 0] : status;
}

interface HealthIssueText {
  id: string;
  message: string;
}

export function healthIssueMessage(issue: HealthIssueText, locale: Locale): string {
  if (locale === 'en') return issue.message;
  if (issue.id === 'server-not-configured') {
    return 'Kein Medienserver verbunden — verbinde Plex, Jellyfin oder Emby unter Einstellungen → Verbindungen.';
  }
  if (issue.id === 'no-storage-mappings') {
    return 'Keine Speicherzuordnungen eingerichtet — die Übersicht kann Kapazität und freien Speicherplatz nicht anzeigen.';
  }
  if (issue.id === 'backups-disabled') {
    return 'Geplante Datensicherungen sind deaktiviert — stelle den Sicherungsjob unter Einstellungen → Jobs auf täglich.';
  }
  if (issue.id === 'update-available') {
    const versions = issue.message.match(/v([^\s)]+).*v([^\s)]+)\.?$/);
    return versions
      ? `Keeparr v${versions[1]} ist verfügbar (installiert ist v${versions[2]}).`
      : 'Eine neue Keeparr-Version ist verfügbar.';
  }
  const jobMatch = issue.id.match(/^job-(.+)-(failing|stale)$/);
  if (jobMatch) {
    const label = jobLabel(jobMatch[1], locale);
    if (jobMatch[2] === 'failing') {
      const detail = issue.message.includes(': ') ? issue.message.slice(issue.message.indexOf(': ') + 2) : '';
      return `Der Job „${label}“ schlägt fehl${detail ? `: ${detail}` : '.'}`;
    }
    const hours = issue.message.match(/over (\d+)h/)?.[1];
    return `Der Job „${label}“ wurde seit über ${hours ?? '?'} Stunden nicht ausgeführt — der Scheduler hängt möglicherweise (ein Neustart behebt dies).`;
  }
  return issue.message;
}