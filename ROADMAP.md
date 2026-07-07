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

## Tier 2 — planned next

- [ ] **Logs viewer upgrades** — keyword search, source/component column,
  copy-per-row, auto-refresh with pause, download raw log file. (Benchmark:
  Seerr's Settings → Logs.)
- [ ] **Theme: Auto / Light / Dark** (`prefers-color-scheme`) + a
  color-impaired accessibility mode. (Servarr Settings → UI.)
- [ ] **Toasts** for action feedback (keep/skip/save errors currently mostly
  silent) + **relative dates** ("Today", "2 days ago") as a UI preference.
- [ ] **PWA manifest** — standalone display, maskable icons, app shortcuts
  (Keep / Browse / Big Picture). (Seerr pattern.)
- [ ] **`?` keyboard-shortcuts overlay.** (Servarr pattern.)
- [ ] **"Show Advanced Settings" toggle** — progressive disclosure once the
  Settings surface grows enough to warrant it.

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
