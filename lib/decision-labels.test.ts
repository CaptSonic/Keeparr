import { describe, expect, it } from 'vitest';
import { collectionProtectionTooltip, decisionReasonLabel, decisionStatusLabel } from './decision-labels';
import { defaultMaintainerrRules } from './maintainerr-rules';

describe('shared decision presentation', () => {
  it('uses configured thresholds instead of legacy numbers in reason codes', () => {
    const rules = defaultMaintainerrRules();
    rules.movie.requesterDays = 42;
    rules.show.globalDays = 730;
    expect(decisionReasonLabel({ reason: 'observing_requester_unwatched_180d', libraryKind: 'movie' }, 'de', rules))
      .toBe('Beobachtung: Ein Anfragender hat seit 42 Tagen nicht angesehen');
    expect(decisionReasonLabel({ reason: 'global_unwatched_540d', libraryKind: 'show' }, 'en', rules))
      .toBe('Not watched by anyone in 730 days');
  });
  it('does not fabricate thresholds when configuration is unavailable', () => {
    expect(decisionReasonLabel({ reason: 'requester_unwatched_180d', libraryKind: 'movie' }, 'en'))
      .toBe('Automatic requester rule matched');
  });
  it('distinguishes planned membership changes from deletion', () => {
    expect(decisionStatusLabel('remove', 'de')).toBe('Mitgliedschaft entfernen geplant');
    expect(decisionStatusLabel('add', 'en')).toBe('Planned addition');
    expect(decisionReasonLabel({ reason: 'global_keep', libraryKind: 'movie' }, 'de')).toContain('Keep');
    expect(decisionReasonLabel({ reason: 'plex_collection_protected', libraryKind: 'movie' }, 'en')).toContain('Plex collection protected');
  });
  it('does not expose unknown internal reason strings', () => {
    expect(decisionReasonLabel({ reason: 'internal-detail', libraryKind: 'movie' }, 'de')).toBe('Unbekannter Prüfgrund');
  });
  it('distinguishes collection protection from an actual Keep', () => {
    expect(decisionStatusLabel('blocked_collection', 'de')).toBe('Durch Collection geschützt');
    expect(decisionStatusLabel('blocked_keep', 'de')).toBe('Durch Keep blockiert');
    expect(decisionStatusLabel('blocked_collection', 'en')).toBe('Collection protected');
  });
  it('lists protecting movie titles, years and reasons in a localized tooltip', () => {
    const item = { collectionBlockers: [
      { ratingKey: 'a', title: 'Film A', year: 2011, reason: 'global_keep' },
      { ratingKey: 'b', title: 'Film B', year: null, reason: 'collection_member_observing' },
    ] };
    expect(collectionProtectionTooltip(item, 'de')).toBe('Schützende Filme der Plex-Collection:\nFilm A (2011) — Durch ein globales Keep geschützt\nFilm B — Beobachtungszeit noch nicht abgeschlossen');
    expect(collectionProtectionTooltip(item, 'en')).toContain('Film A (2011) — Protected by a global Keep');
    expect(collectionProtectionTooltip({}, 'de')).toBeUndefined();
  });
});