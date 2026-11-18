import { getDb } from './db';
import type { MovieRating, RatingProtectionConfig } from './rating-protection';
import { ratingQualifies } from './rating-protection';

export interface CachedMovieRating extends MovieRating { instanceId: string; fetchedAt: number }

/** Called only after a successful full instance read. Unknown ratings keep last known values. */
export function refreshMovieRatings(instanceId: string, movies: Array<{ ratingKey: string; ratings: MovieRating[] }>): void {
  const db = getDb();
  db.transaction(() => {
    const present = new Set(movies.map((movie) => movie.ratingKey));
    const old = db.prepare('SELECT DISTINCT rating_key FROM movie_ratings WHERE instance_id = ?').all(instanceId) as Array<{ rating_key: string }>;
    const remove = db.prepare('DELETE FROM movie_ratings WHERE instance_id = ? AND rating_key = ?');
    for (const row of old) if (!present.has(row.rating_key)) remove.run(instanceId, row.rating_key);
    const upsert = db.prepare(`INSERT INTO movie_ratings (rating_key, instance_id, source, score, votes, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(rating_key, instance_id, source) DO UPDATE SET
      score = excluded.score, votes = excluded.votes, fetched_at = excluded.fetched_at`);
    const now = Math.floor(Date.now() / 1000);
    for (const movie of movies) for (const rating of movie.ratings) {
      upsert.run(movie.ratingKey, instanceId, rating.source, rating.score, rating.votes, now);
    }
  })();
}

/** Any configured instance may confirm protection; never combine score/votes across instances. */
export function protectedMovieRatings(config: RatingProtectionConfig, instanceIds: string[]): Map<string, CachedMovieRating[]> {
  const result = new Map<string, CachedMovieRating[]>();
  if (!instanceIds.length || (!config.imdb.enabled && !config.tmdb.enabled)) return result;
  const rows = getDb().prepare(`SELECT r.rating_key AS ratingKey, r.instance_id AS instanceId,
    r.source, r.score, r.votes, r.fetched_at AS fetchedAt FROM movie_ratings r
    JOIN media_items m ON m.rating_key = r.rating_key WHERE m.library_kind = 'movie' AND m.removed = 0`).all() as Array<CachedMovieRating & { ratingKey: string }>;
  for (const row of rows) if (instanceIds.includes(row.instanceId) && ratingQualifies(row, config)) {
    const ratings = result.get(row.ratingKey) ?? [];
    ratings.push(row);
    result.set(row.ratingKey, ratings);
  }
  return result;
}