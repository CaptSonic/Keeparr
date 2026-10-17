# Keeparr roadmap

Platform/polish gaps identified by comparing Keeparr against the conventions of
Sonarr/Radarr (Servarr) and Overseerr/Jellyseerr/Seerr (July 2026 research pass).
Core keep/reclaim functionality is considered complete; these are the "edge"
features self-hosters expect.

**Current status:** Tiers 1 and 2, localization, Smart Reclaim, Cleanup Campaigns,
the optional Maintainerr hand-off, and reviewed Sonarr archiving are implemented.
Continuous delivery publishes releases/images from `main`. The historical tiers
below record earlier planning; the completed retention workflows are summarized
separately. Remaining Tier 3 ideas are parked until there is real demand.

## Retention automation and reviewed archiving — implemented

- [x] **Safe Maintainerr hand-off** — explicit requester/campaign releases plus
  automatic movie/show watch rules, persistent per-rule observation, live inventory
  checks, ownership tracking, mass-change approval, re-add protection, and audit history.
- [x] **Plex collection protection** — live regular/smart collection membership,
  whole-group eligibility and overlap propagation; collection-label-based Agregarr
  exclusions. No Radarr film-series dependency. Failed reads pause reconciliation.
- [x] **Running-series archive routing** — continuing/returning Sonarr series are
  excluded from full-title Maintainerr removal. Mature rules feed the admin-reviewed
  episode archive workflow without inventing requester consent.
- [x] **Observation visibility** — the archive dashboard shows waiting-for-sync,
  observing with due date, and ready states. Early preview/execution stays blocked;
  read-only dashboard refreshes never change observation clocks.
- [x] **Plex placeholders and restore** — durable manifests, approved Sonarr file
  removal, Plex-only placeholders, and Sonarr download-based restore. Archiving
  retains the series but does not back up the original episode files.

See README.md for setup, prerequisites, safety exceptions, and troubleshooting.

## Tier 1 — done (v0.2.0)

- [x] **Health checks** — `lib/health.ts` + `/api/admin/health`; ⚠ chip in the
  top bar (admins) + Health card on Settings → Jobs, each warning linking to a
  README fix-it anchor. (Servarr System → Status → Health pattern.)
- [x] **Version-available check** — GitHub Releases via `lib/version.ts`
  (cached ~6h, never throws); surfaced on About + as a health warning.
  Release process: bump package.json → tag `v<version>` → GitHub release.
- [x] **Backup & restore** — daily `backup` job (retention setting),
  Settings → Jobs → Backups card with create/download/delete/restore
  (restore keeps a pre-restore safety snapshot).
- [x] **Reverse-proxy docs** — README section (NPM/nginx/Caddy, subdomain-only
  stance); cookies were already `x-forwarded-proto`-aware.
- [x] **API docs** — hand-written `openapi.json` served at `/api/openapi.json`,
  rendered by Scalar at `/api-docs`; API-key regenerate already existed.

## Tier 2 — done (v0.3.0)

- [x] **Logs viewer upgrades** — keyword search (`?q=`), auto-refresh with
  pause, copy-per-row, download as .txt (exports the DB log; there is no
  on-disk file), relative timestamps.
- [x] **Theme: Auto / Light / Dark** + **color-impaired mode** — CSS-variable
  palette remap (`data-theme`/`data-cim` on <html>), per-user via the avatar
  menu; zero per-component churn.
- [x] **Toasts** (dependency-free Toaster) for silent-failure paths +
  **relative dates** with absolute-on-hover (no extra preference needed).
- [x] **PWA manifest** — `app/manifest.ts` + generated icons (incl. maskable
  + apple-touch), Keep/Browse/Big Picture shortcuts.
- [x] **`?` keyboard-shortcuts overlay** (+ `/` focuses search).

## Localization — implemented

- [x] **German and English UI** — browser detection (`de*` → German, all other
  locales → English), manual switchers on login and in the app shell, anonymous
  `localStorage` persistence, and a per-account SQLite preference after login.
- [x] **Locale-aware presentation** — visible UI/admin copy, dialogs, toasts,
  empty states, accessibility labels, stable job/health labels, dates, relative
  times, numbers, and byte sizes follow the active locale. API/domain ids remain
  unchanged.
- [x] **Contract and regression coverage** — locale helper tests, real-SQL route
  tests for preference validation/persistence/auth, and OpenAPI documentation.

Localization is part of the current application, not pending uncommitted work.

## Tier 3 — parked (decided July 2026: not needed for now)

- **"Show Advanced Settings" toggle** — progressive disclosure of power-user
  fields (Servarr pattern); the Settings surface doesn't warrant it yet.
- **Subpath hosting** (`example.net/keeparr`) — Next.js bakes `basePath` at
  build time and every client `fetch('/api/…')` would need a prefix helper;
  Overseerr/Jellyseerr (same stack) never shipped it either. Subdomain-only is
  the documented stance; revisit only if real subpath demand shows up.
- **Read-only / guest permission level** — one step beyond binary admin
  (top Sonarr community wish). Full Seerr-style permission bitmask judged
  overkill for a keep-tagging tool.
- **Notifications** — Webhook + Discord + ntfy agents with per-event opt-in.
  Natural events: "title marked OK-to-delete", weekly reclaimable digest,
  health issue, low disk space.
- **SSO / forward-auth compatibility** — honor a reverse-proxy auth header
  (Authelia/Authentik). Loudest open auth wish across all three peer projects;
  Keeparr's media-server login sidesteps most of the need.
- **Prometheus `/metrics` endpoint** — niche but rising expectation.
- **Maintainerr integration — implemented, no longer parked** — Keeparr collects the human decisions;
  [Maintainerr](https://github.com/jorenn92/Maintainerr) executes deletions
  (rules → collections → grace period → delete/unmonitor/clear-request).
  Hooking them together closes the loop while preserving Keeparr's
  separation of responsibilities: Keeparr reconciles safe internal memberships;
  Maintainerr owns its actions and grace periods. The separate reviewed archive
  workflow removes existing episode files through Sonarr, never entire running series.

  **Safe hand-off implemented:** Keeparr can reconcile requester sign-offs
  plus closed-campaign, currently unprotected releases into selected Maintainerr movie
  and show collections. It only changes Maintainerr's internal membership,
  tracks ownership so foreign manual members are untouched except for archive safety
  exclusions in Keeparr's target collections, removes keep-vetoed
  items first, and hard-blocks unless rules and *arr tagging are disabled.
  Maintainerr owns collection visibility, action, and grace period; Keeparr never
  invokes Maintainerr handling or deletion APIs.

Of these, **notifications** delivers the most day-to-day value if ever
un-parked (a weekly reclaimable digest fits Keeparr's purpose),
**read-only guest** is the cheapest to build. Maintainerr integration has already
shipped; further automation must retain the explicit opt-ins and safety checks.

## Next-level workflow — Smart Reclaim Queue and Cleanup Campaigns done

The strongest product-level next step is a guided workflow from Keeparr's
existing reclaim insights to a household-reviewed action list — while keeping
the report-only default and explicit review/opt-in boundaries for external writes.

Delivery stages:

1. [x] **Smart Reclaim Queue** — implemented July 2026. A deterministic,
   explainable priority list using
   signals Keeparr already stores: protected by nobody, never/stale watched,
   requester marked OK-to-delete, size on disk, ended status, and optional
   quality/size mismatch. Every suggestion must show its reasons; no opaque AI
   score or external service is required. The authenticated `/reclaim` page and
   session-only `/api/reclaim-queue` expose score filters, aggregate potential,
   source readiness, and one-click **Protect / Keep**. Any keep excludes the title
   in SQL; unavailable integrations are neutral and watch scoring waits for one
   successful watch refresh.
2. [x] **Cleanup Campaigns** — implemented July 2026 for v0.5.0. An admin sets a
   reclaim target, review deadline, non-bypassable grace period, and minimum score;
   Keeparr immutably snapshots every matching Smart Reclaim candidate and rejects an
   empty campaign. Household members can add/undo release reviews until the deadline
   or protect titles through the existing Keep workflow. One review releases an
   otherwise unprotected title; the live global rule **any keep wins** remains a veto,
   including after closure. Dynamic planned/reviewed/released/protected item + byte
   totals, admin CSV export, audit events, and close-after-grace complete the report
   workflow. Campaign review itself never deletes or mutates external media.
3. [x] **Optional automation bridge (read-only pull)** — implemented July 2026.
   A separate admin opt-in exposes `GET /api/automation/releases` to an admin
   session or the existing automation API key. It returns only reviewed titles
   from closed campaigns that still exist and remain protected by nobody, with
   one latest campaign record per media item and stable external ids where known.
   Responses are live and `no-store`, so any keep removes the title on the next
   pull. This phase is deliberately report-only: no webhook, media-server label,
   Maintainerr write, or deletion is performed by this read-only endpoint. The
   separately implemented Maintainerr hand-off is its own opt-in and preserves
   the live Keep veto.

Suggested order after the first queue: validate Jellyfin/Emby against live
servers, add storage-history snapshots, then add an in-app weekly reclaim
digest before considering external notification agents.

**Documentation gate:** completed for Smart Reclaim phase 1, Cleanup Campaigns
phase 2, and the read-only Automation Bridge phase 3. Before committing future
push or external-mutation work, update
`README.md` (user-facing behavior and setup), `CLAUDE.md` (architecture,
schema/routes/settings and canonical rules), `openapi.json` for any API changes,
and this roadmap's status. Add real-SQL tests for scoring, protection,
campaign snapshots, and state transitions.

## Explicitly not doing

- **Analytics/telemetry toggle** — Keeparr collects nothing, so there is
  nothing to toggle. README states the no-telemetry stance instead.
- **Calendar / iCal feed** — doesn't map to the keep/reclaim domain.
