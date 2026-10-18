import { describe, expect, it } from 'vitest';
import { decisionReasonLabel, decisionStatusLabel } from './decision-labels';
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
});