# Keeparr roadmap

Platform/polish gaps identified by comparing Keeparr against the conventions of
Sonarr/Radarr (Servarr) and Overseerr/Jellyseerr/Seerr (July 2026 research pass).
Core keep/reclaim functionality is considered complete; these are the "edge"
features self-hosters expect.

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
- [ ] **"Show Advanced Settings" toggle** — still deferred; the Settings
  surface doesn't warrant it yet.

## Tier 3 — parked (not needed for now)

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

## Explicitly not doing

- **Analytics/telemetry toggle** — Keeparr collects nothing, so there is
  nothing to toggle. README states the no-telemetry stance instead.
- **Calendar / iCal feed** — doesn't map to the keep/reclaim domain.
