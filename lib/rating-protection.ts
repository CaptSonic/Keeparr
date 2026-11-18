export type RatingSource = 'imdb' | 'tmdb';
export interface MovieRating { source: RatingSource; score: number; votes: number }
export interface RatingProtectionRule { enabled: boolean; minimumScore: number; minimumVotes: number }
export type RatingProtectionConfig = Record<RatingSource, RatingProtectionRule>;

export function defaultRatingProtection(): RatingProtectionConfig {
  return {
    imdb: { enabled: false, minimumScore: 8, minimumVotes: 10000 },
    tmdb: { enabled: false, minimumScore: 8, minimumVotes: 1000 },
  };
}

/** Reject malformed settings rather than silently enabling or weakening protection. */
export function mergeRatingProtection(value: unknown, previous = defaultRatingProtection()): RatingProtectionConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid rating protection');
  const result = { ...previous };
  for (const source of ['imdb', 'tmdb'] as const) {
    const patch = (value as Record<string, unknown>)[source];
    if (patch === undefined) continue;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid rating rule');
    const rule = { ...previous[source], ...patch };
    if (typeof rule.enabled !== 'boolean' || typeof rule.minimumScore !== 'number' ||
        !Number.isFinite(rule.minimumScore) || rule.minimumScore < 0 || rule.minimumScore > 10 ||
        !Number.isSafeInteger(rule.minimumVotes) || rule.minimumVotes < 1) throw new Error('Invalid rating thresholds');
    result[source] = rule;
  }
  return result;
}

export function normalizeMovieRatings(value: unknown): MovieRating[] {
  if (!value || typeof value !== 'object') return [];
  return (['imdb', 'tmdb'] as const).flatMap((source) => {
    const raw = (value as Record<string, unknown>)[source];
    if (!raw || typeof raw !== 'object') return [];
    const { value: score, votes } = raw as Record<string, unknown>;
    return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10 &&
      typeof votes === 'number' && Number.isSafeInteger(votes) && votes > 0
      ? [{ source, score, votes }] : [];
  });
}

export function ratingQualifies(rating: MovieRating, config: RatingProtectionConfig): boolean {
  const rule = config[rating.source];
  return rule.enabled && rating.score >= rule.minimumScore && rating.votes >= rule.minimumVotes;
}