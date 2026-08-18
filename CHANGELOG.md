# Changelog

## 0.1.0 — 2026-08-18

First working release.

### Server
- Content-addressed blob store on Cloudflare R2, metadata in Neon Postgres
- Snapshot versioning with `baseVersion` optimistic concurrency (409 on conflict)
- Rollback that re-commits an older manifest as a new version, so nothing is deleted
- Device state reporting, so the dashboard can compare cloud against each PC
- Nightly retention + garbage collection with a 24-hour grace period

### Web dashboard
- Games list with per-device sync status and storage/dedup stats
- Version history, restore, pin, delete version, delete game
- Public `/download` page with version, size, and SHA-256

### CLI
- `init` `detect` `add` `remove` `list` `status` `sync` `history` `restore` `launch` `watch`

### Desktop app (Windows)
- Steam and Epic library scan with match tiers (recipe / engine heuristic / manual)
- Conflict resolution, version history, restore
- Play button that syncs down, launches, and syncs back up on exit
- Tray icon and background sync

### Known gaps
- Installers are unsigned, so Windows SmartScreen warns on first run
- No auto-update feed yet
- gzip is the only compression codec; the `codec` column allows adding zstd later
