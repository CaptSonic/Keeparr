# Incremental usability and reliability improvements

## Safety boundaries

- Keeps always veto automatic hand-off.
- Display snapshots never authorize mutations; execution rebuilds a live plan.
- Missing or uncertain data must not be presented as eligibility.
- Explanations use existing plan decisions, not an independent UI rules engine.
- No personal watch/request identities are exposed to household members.
- Each package requires focused tests, the full suite, TypeScript and a production build.

## 1. Per-title explanations — pushed as 9c7b0e6

- On-demand Why? dialog in cards and list rows.
- Fresh local Keep state for signed-in users, without other users' identities.
- Admin-only historical Maintainerr rows projected from the saved preview.
- Multiple collection rows retained; absent rows explicitly mean no conclusion.
- Shared reason formatting with configured thresholds, reused by the Control Center.
- No live network reads or authorization data in the explanation endpoint.
- Archive decisions and completed-action history are intentionally not included yet.
- Browser interaction/accessibility still needs a manual smoke test.

## 2. Data freshness and uncertainty — implemented locally

- Separate last attempt from last successful refresh for library/watch/arr sources.
- Audit successful run history, retention and source fingerprint handling first.
- Never fabricate historical timestamps; unavailable values remain unknown.
- Add compact freshness information to the explanation and settings overview.
- Do not silently change existing trust or reconciliation rules in an informational package.
- Test failed latest runs, changed sources, never-run jobs and legacy databases.
- Durable source-scoped provenance is recorded separately from the 100-run log.
- Partial/no-op refreshes never advance complete-success timestamps.
- Watch and arr cache clears invalidate their provenance; interrupted runs are marked failed at boot.
- Admin-only freshness display is shared by Why? and Jobs & Cache.

## 3. Job coordination — planned

- Audit shared resources and job dependencies before defining scheduling groups.
- Apply coordination consistently to scheduled, individual manual and run-all starts.
- Preserve useful concurrency and per-job single-flight.
- Expose queued/running states; test duplicate starts, errors and restart recovery.

## 4. Understandable change history — planned

- Reuse existing history before introducing additional storage.
- Distinguish detected changes, planned operations and completed operations.
- Add only missing events, with deduplication and explicit privacy/retention rules.
- Filter by title and time; repeated previews must not create event floods.

## 5. Recoverability — planned

- Audit backup and restore implementation and version compatibility.
- Validate integrity, contents and schema/app version information.
- Add an isolated restore test and practical recovery instructions.
- Never restore tests over a production database.

## Delivery

Keep packages separately reviewable. Do not commit, push or release automatically.
Recheck the remote branch before any later push because automatic releases add commits.