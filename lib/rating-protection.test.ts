import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __closeDb, __setTestDbToMemory, getDb } from './db';
import { defaultRatingProtection, mergeRatingProtection, normalizeMovieRatings, ratingQualifies } from './rating-protection';
import { refreshMovieRatings, protectedMovieRatings } from './rating-cache';
import { normalizeRadarr } from './arr';

describe('movie rating protection', () => {
  beforeEach(() => {
    __setTestDbToMemory();
    getDb().prepare(`INSERT INTO media_items (rating_key, section_id, library_kind, title, last_synced) VALUES ('film', 'movies', 'movie', 'Film', 1)`).run();
  });
  afterEach(() => __closeDb());
  const enabled = () => mergeRatingProtection({ imdb: { enabled: true }, tmdb: { enabled: true } });
  it('defaults to disabled and uses inclusive score and vote thresholds', () => {
    const rating = { source: 'imdb' as const, score: 8, votes: 10000 };
    expect(ratingQualifies(rating, defaultRatingProtection())).toBe(false);
    expect(ratingQualifies(rating, enabled())).toBe(true);
    expect(ratingQualifies({ ...rating, score: 7.99 }, enabled())).toBe(false);
    expect(ratingQualifies({ ...rating, votes: 9999 }, enabled())).toBe(false);
    expect(ratingQualifies({ source: 'tmdb', score: 8, votes: 1000 }, enabled())).toBe(true);
  });
  it.each([null, [], { imdb: null }, { imdb: { enabled: 'true' } }, { imdb: { minimumScore: 11 } }, { tmdb: { minimumVotes: 0 } }])('rejects invalid settings %j', (value) => {
    expect(() => mergeRatingProtection(value)).toThrow();
  });
  it('normalizes only complete valid pairs from Radarr', () => {
    const raw = { imdb: { value: 8.3, votes: 20000 }, tmdb: { value: 8.1, votes: 5000 } };
    expect(normalizeRadarr({ id: 1, title: 'Film', tmdbId: 1, ratings: raw }, { id: 'r1', name: 'Radarr', url: '', apiKey: '' }, new Map())?.ratings).toEqual(normalizeMovieRatings(raw));
    expect(normalizeMovieRatings({ imdb: { value: '8', votes: 10000 }, tmdb: { value: 99, votes: 1 } })).toEqual([]);
    expect(normalizeMovieRatings({ imdb: { value: 8, votes: 0 }, tmdb: { value: NaN, votes: 5000 } })).toEqual([]);
  });
  it('retains unknown and failed refresh values, replaces valid values and removes confirmed missing movies', () => {
    refreshMovieRatings('r1', [{ ratingKey: 'film', ratings: [{ source: 'imdb', score: 8, votes: 10000 }] }]);
    refreshMovieRatings('r1', [{ ratingKey: 'film', ratings: [] }]);
    expect(protectedMovieRatings(enabled(), ['r1']).has('film')).toBe(true);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM keeps').get()).toEqual({ n: 0 });
    refreshMovieRatings('r1', [{ ratingKey: 'film', ratings: [{ source: 'imdb', score: 7, votes: 20000 }] }]);
    expect(protectedMovieRatings(enabled(), ['r1']).size).toBe(0);
    refreshMovieRatings('r1', []);
    expect(getDb().prepare('SELECT * FROM movie_ratings').all()).toEqual([]);
  });
  it('uses any configured instance without combining conflicting score/vote pairs', () => {
    refreshMovieRatings('r1', [{ ratingKey: 'film', ratings: [{ source: 'imdb', score: 9, votes: 100 }] }]);
    refreshMovieRatings('r2', [{ ratingKey: 'film', ratings: [{ source: 'imdb', score: 7, votes: 100000 }] }]);
    expect(protectedMovieRatings(enabled(), ['r1', 'r2']).size).toBe(0);
    refreshMovieRatings('r2', [{ ratingKey: 'film', ratings: [{ source: 'imdb', score: 8, votes: 10000 }] }]);
    expect(protectedMovieRatings(enabled(), ['r1', 'r2']).get('film')?.[0].instanceId).toBe('r2');
    expect(protectedMovieRatings(enabled(), ['r1']).size).toBe(0);
  });
});