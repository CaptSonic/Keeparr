import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlexMetadata } from '../plex';
import { isAvailableSectionItem, plexBackend } from './plex';
import { __setTestDbToMemory, __closeDb } from '../db';
import { writeSetting } from '../settings';

beforeEach(() => {
  __setTestDbToMemory();
  writeSetting('plex_base_url', 'http://plex:32400');
  writeSetting('plex_server_token', 'token');
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => __closeDb());

describe('Plex section inventory availability', () => {
  const live: PlexMetadata = {
    ratingKey: 'live', title: 'Live',
    Media: [{ Part: [{ file: '/movies/live.mkv', size: 100 }] }],
  };
  const trashed: PlexMetadata = {
    ratingKey: 'trashed', title: 'Trashed',
    Media: [{ Part: [{ file: '/movies/gone.mkv', size: 100, exists: false }] }],
  };
  const deletedMetadata: PlexMetadata = {
    ratingKey: 'deleted', title: 'Deleted', deletedAt: 1_800_000_000,
    Media: [{ Part: [{ file: '/movies/gone-too.mkv', size: 100 }] }],
  };

  it('marks Plex trash entries unavailable in movie section scans', () => {
    expect(isAvailableSectionItem(live, 'movie')).toBe(true);
    expect(isAvailableSectionItem(trashed, 'movie')).toBe(false);
    expect(isAvailableSectionItem(deletedMetadata, 'movie')).toBe(false);
  });

  it('does not reject show headers merely because Plex omits inline parts', () => {
    const show: PlexMetadata = { ratingKey: 'show', title: 'Show' };
    expect(isAvailableSectionItem(show, 'show')).toBe(true);
  });

  it.each([false, true])('verifies actual episode availability (remaining episode: %s)', async (remaining) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify({
      MediaContainer: { Metadata: String(input).includes('allLeaves')
        ? [trashed, ...(remaining ? [live] : [])] : [{ ratingKey: 'show', title: 'Show' }] },
    }), { headers: { 'content-type': 'application/json' } }));
    expect(await plexBackend.itemExists('show', 'show')).toBe(remaining);
  });

  it('does not interpret malformed episode inventory as an empty series', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('allLeaves') ? {} : { MediaContainer: { Metadata: [{ ratingKey: 'show' }] } }
    ), { headers: { 'content-type': 'application/json' } }));
    await expect(plexBackend.itemExists('show', 'show')).rejects.toThrow();
  });
});