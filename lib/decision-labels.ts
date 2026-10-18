import type { Locale } from './i18n';
import type { MaintainerrAutomaticRules } from './maintainerr-rules';
import type { MaintainerrPreviewItem } from './maintainerr';

const reasons: Record<string, [string, string]> = {
  never_watched: ['Never watched', 'Noch nie angesehen'],
  watch_age_met: ['Watch-age threshold met', 'Watch-Alter erreicht'],
  automatic_rules_met: ['Both automatic watch rules matured', 'Beide automatischen Watch-Regeln sind ausgereift'],
  observing_automatic_rules: ['Tracking both automatic watch rules', 'Beide automatischen Watch-Regeln werden beobachtet'],
  readd_approved: ['One-time re-add approved', 'Einmaliges Re-Add freigegeben'],
  already_managed: ['Already managed by Keeparr', 'Bereits von Keeparr verwaltet'],
  existing_foreign_member: ['Existing manual member; Keeparr will not touch it', 'Manuelles Mitglied; Keeparr verändert es nicht'],
  global_keep: ['Protected by a global Keep', 'Durch ein globales Keep geschützt'],
  watched_too_recently: ['Watched within the configured age', 'Innerhalb des konfigurierten Zeitraums angesehen'],
  missing_from_media_server: ['No longer available on the media server', 'Auf dem Medienserver nicht mehr verfügbar'],
  watch_cache_untrusted: ['No trusted watch data for the current source', 'Keine vertrauenswürdigen Wiedergabedaten für die aktuelle Quelle'],
  outside_selected_library: ['Outside the selected Maintainerr libraries', 'Außerhalb der ausgewählten Maintainerr-Bibliotheken'],
  inventory_unavailable: ['Live availability could not be checked', 'Live-Verfügbarkeit konnte nicht geprüft werden'],
  unexpected_remote_removal: ['Maintainerr unexpectedly removed a Keeparr-owned member', 'Maintainerr hat ein Keeparr-eigenes Mitglied unerwartet entfernt'],
  mass_change: ['Mass-change threshold reached', 'Massenschwellwert erreicht'],
  sonarr_archive_workflow: ['Excluded: Sonarr archives episode files without removing the show', 'Ausgeschlossen, weil Sonarr Episodendateien archiviert, ohne die Serie zu entfernen'],
  release_revoked: ['Release is no longer active', 'Freigabe ist nicht mehr aktiv'],
  ownership_stale: ['Ownership recorded, remote member missing', 'Ownership-Eintrag vorhanden, Remote-Mitglied fehlt'],
  plex_collection_protected: ['Plex collection protected: not all present movies are eligible', 'Plex-Collection geschützt: Nicht alle vorhandenen Filme sind freigegeben'],
};

/** Presentation only. Rules and decisions always come from the actual plan. */
export function decisionReasonLabel(
  item: Pick<MaintainerrPreviewItem, 'reason' | 'libraryKind'>,
  locale: Locale,
  automaticRules?: MaintainerrAutomaticRules,
): string {
  const de = locale === 'de';
  const rules = automaticRules?.[item.libraryKind];
  const observing = item.reason.startsWith('observing_');
  const rule = observing ? item.reason.slice('observing_'.length) : item.reason;
  if (rule === 'requester_unwatched_180d' || rule === 'global_unwatched_540d') {
    const days = rules ? (rule === 'requester_unwatched_180d' ? rules.requesterDays : rules.globalDays) : null;
    const description = rule === 'requester_unwatched_180d'
      ? days === null
        ? de ? 'Automatische Anfragenden-Regel erfüllt' : 'Automatic requester rule matched'
        : de ? `Ein Anfragender hat seit ${days} Tagen nicht angesehen` : `A requester has not watched in ${days} days`
      : days === null
        ? de ? 'Automatische serverweite Wiedergaberegel erfüllt' : 'Automatic server-wide watch rule matched'
        : de ? `Seit ${days} Tagen von niemandem angesehen` : `Not watched by anyone in ${days} days`;
    return observing ? `${de ? 'Beobachtung' : 'Tracking'}: ${description}` : description;
  }
  return reasons[item.reason]?.[de ? 1 : 0] ?? (de ? 'Unbekannter Prüfgrund' : 'Unknown check reason');
}

export function decisionStatusLabel(status: MaintainerrPreviewItem['status'], locale: Locale): string {
  const labels: Record<MaintainerrPreviewItem['status'], [string, string]> = {
    add: ['Planned addition', 'Hinzufügen geplant'],
    remove: ['Planned membership removal', 'Mitgliedschaft entfernen geplant'],
    managed: ['Managed', 'Verwaltet'], manual: ['Manual membership', 'Manuelle Mitgliedschaft'],
    blocked_keep: ['Protected', 'Geschützt'], blocked_recent: ['Recently watched', 'Kürzlich angesehen'],
    tracking: ['Observing', 'Beobachtung'], missing: ['Missing', 'Nicht vorhanden'],
    outside: ['Outside selected libraries', 'Außerhalb ausgewählter Bibliotheken'],
    readd_blocked: ['Re-add blocked', 'Re-Add blockiert'], paused: ['Paused', 'Pausiert'],
  };
  return labels[status][locale === 'de' ? 1 : 0];
}