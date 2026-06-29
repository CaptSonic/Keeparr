/**
 * Map a Sonarr/Radarr quality string (movie file quality like "Bluray-2160p" or
 * a series profile name like "Ultra-HD") to a coarse resolution bucket. Pure +
 * dependency-free so both the Browse filter (LibraryBrowser) and the Big Picture
 * "Reclaim by quality" breakdown (StatsView) bucket the same way.
 */
export const RES_ORDER = ['2160p', '1080p', '720p', 'SD', 'Other'] as const;
export type ResBucket = (typeof RES_ORDER)[number];

export function resolutionBucket(q: string): ResBucket {
  const s = q.toLowerCase();
  if (s.includes('2160') || s.includes('4k') || s.includes('uhd') || s.includes('ultra')) return '2160p';
  if (s.includes('1080')) return '1080p';
  if (s.includes('720')) return '720p';
  if (s.includes('480') || s.includes('576') || s.includes('dvd') || s.includes('sdtv') || s === 'sd') return 'SD';
  return 'Other';
}
