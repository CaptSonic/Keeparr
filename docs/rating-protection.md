# Rating protection implementation

- `lib/rating-protection.ts`: shared pure settings validation, disabled defaults,
  Radarr rating normalization, inclusive score/vote thresholds.
- `movie_ratings`: additive schema in `lib/db.ts`, keyed by media item, instance,
  and source. Foreign-key cascade follows media item deletion. No Keep writes.
- `lib/rating-cache.ts`: transactional per-instance replacement of valid pairs;
  missing/invalid pairs retain last valid values and timestamps. Successful full
  reads remove absent titles. Failed reads do not touch that instance's ratings.
- `lib/sync.ts`: gathers ratings before the normal first-instance-wins Arr cache
  deduplication, so all Radarr instances contribute independent observations.
- `maintainerr_rating_protection`: JSON setting exposed in Maintainerr config,
  validated on PUT and by the settings writer. Changing it clears one-time plan
  and re-add approvals, but does not reset automatic observation clocks.
- `lib/maintainerr.ts`: filters automatic eligibility before collection propagation;
  explicit eligible releases keep their existing bypass. Keeps always win.
  Collection inventory/exclusion/error handling is unchanged.
- Preview payloads use `blocked_rating` / `rating_protected` and include the exact
  matching source, score, votes, instance ID and retrieval timestamp. Collection
  blockers carry the same evidence. Timestamps describe retrieval, not provider
  freshness; there is deliberately no TTL that could silently remove protection.

No production jobs or remote writes are needed for migration. The feature is
disabled until an administrator enables a source. Ratings become available after
a successful Sonarr/Radarr refresh. Manual media-server verification remains a
separate deployment check.