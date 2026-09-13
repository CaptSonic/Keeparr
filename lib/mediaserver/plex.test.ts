import { describe, expect, it } from 'vitest';
import type { PlexMetadata } from '../plex';
import { isAvailableSectionItem } from './plex';

describe('Plex section inventory availability', () => {
  const live: PlexMetadata = {
    ratingKey: 'live', title: 'Live',
    Media: [{ Part: [{ file: '/movies/live.mkv', size: 100 }] }],
  };
  const trashed: PlexMetadata = {
    ratingKey: 'trashed', title: 'Trashed',
    Media: [{ Part: [{ file: '/movies/gone.mkv', size: 100, exists: false }] }],
  };

  it('marks Plex trash entries unavailable in movie section scans', () => {
    expect(isAvailableSectionItem(live, 'movie')).toBe(true);
    expect(isAvailableSectionItem(trashed, 'movie')).toBe(false);
  });

  it('does not reject show headers merely because Plex omits inline parts', () => {
    const show: PlexMetadata = { ratingKey: 'show', title: 'Show' };
    expect(isAvailableSectionItem(show, 'show')).toBe(true);
  });
});