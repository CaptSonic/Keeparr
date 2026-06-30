import { describe, expect, it } from 'vitest';
import {
  providerId,
  sumMediaSources,
  toBackendItem,
  type JfItem,
} from './jellyfin';

const GB = 1024 ** 3;

describe('jellyfin mapping (pure)', () => {
  it('providerId is case-insensitive and handles missing ids', () => {
    expect(providerId({ Tmdb: '550' }, 'tmdb')).toBe('550');
    expect(providerId({ tvdb: '81189' }, 'Tvdb')).toBe('81189');
    expect(providerId({ Imdb: 'tt0137523' }, 'tmdb')).toBeNull();
    expect(providerId(undefined, 'tmdb')).toBeNull();
  });

  it('sumMediaSources counts each physical file once (multi-episode files dedupe by Path)', () => {
    const items: JfItem[] = [
      // Two episodes packed in ONE file → Plex/Jellyfin report the full size on
      // each; must be counted once.
      { MediaSources: [{ Path: '/tv/show/s01e01e02.mkv', Size: 2 * GB }] },
      { MediaSources: [{ Path: '/tv/show/s01e01e02.mkv', Size: 2 * GB }] },
      // A distinct file → added.
      { MediaSources: [{ Path: '/tv/show/s01e03.mkv', Size: 1 * GB }] },
      // No path → can't dedupe, summed as-is.
      { MediaSources: [{ Size: 500 }] },
    ];
    expect(sumMediaSources(items)).toBe(3 * GB + 500);
  });

  it('toBackendItem maps id/title/year/guids/date/size', () => {
    const it: JfItem = {
      Id: 'abc123',
      Name: 'The Matrix',
      ProductionYear: 1999,
      DateCreated: '2020-01-02T03:04:05.000Z',
      ProviderIds: { Tmdb: '603' },
      MediaSources: [{ Path: '/movies/matrix.mkv', Size: 8 * GB }],
    };
    const row = toBackendItem(it, true); // movie → include size
    expect(row.ratingKey).toBe('abc123');
    expect(row.title).toBe('The Matrix');
    expect(row.year).toBe(1999);
    expect(row.thumb).toBe('abc123'); // image proxy builds the URL from the id
    expect(row.guidTmdb).toBe('603');
    expect(row.guidTvdb).toBeNull();
    expect(row.sizeBytes).toBe(8 * GB);
    expect(row.addedAt).toBe(Math.floor(Date.parse('2020-01-02T03:04:05.000Z') / 1000));
  });

  it('toBackendItem with withSize=false (series) returns size 0 (sized via showSize)', () => {
    const it: JfItem = {
      Id: 'series1',
      Name: 'Breaking Bad',
      ProviderIds: { Tvdb: '81189' },
      MediaSources: [{ Path: '/x', Size: 99 * GB }],
    };
    const row = toBackendItem(it, false);
    expect(row.sizeBytes).toBe(0);
    expect(row.guidTvdb).toBe('81189');
  });
});
