# gamesavecloud — Roadmap

Self-hosted Steam Cloud for any game. Single user (my PCs). Neon = metadata, R2 = bytes.

**Rules that never bend**
- Postgres stores pointers, never save bytes.
- Blobs are content-addressed by sha256 of **raw** bytes (hash before compressing).
- A version is an atomic folder snapshot, never a per-file version.
- Client works fully offline. Cloud is sync, not source of truth.
- Never overwrite on conflict. Never delete a save automatically.

---

## Phase 0 — Foundations
- [x] Monorepo: `apps/server` (Next.js API), `apps/cli` (Node/TS), `packages/shared` (types, zod schemas)
- [x] Fill `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / Neon password in `.env`
- [x] Drizzle schema + first migration (unpooled URL)
- [x] Bearer-token auth middleware (single `GAMESYNC_TOKEN`)
- [x] R2 client (`@aws-sdk/client-s3`, `region: "auto"`), presign helpers
- [x] Health endpoint that proves DB + R2 both reachable

## Phase 1 — Blob store (the core)
- [x] `POST /v1/blobs/check`  → which of these hashes do you already have
- [x] `POST /v1/blobs/upload-urls` → presigned PUTs, 10 min TTL, key `blobs/<aa>/<bb>/<sha256>`
- [x] `GET  /v1/blobs/:hash/url` → presigned GET
- [x] Server-side verify blob exists (HeadObject) before accepting a snapshot
- [x] zstd compress client-side, hash raw, store compressed + record both sizes

## Phase 2 — Snapshots & versioning
- [x] `GET  /v1/games` / `POST /v1/games` (register game by slug)
- [x] `GET  /v1/games/:slug/slots`
- [x] `POST /v1/snapshots` — { slug, slot, baseVersion, files:[{path,hash,size}] }
      → 200 new version, or 409 conflict with both manifests
- [x] `GET  /v1/snapshots/:id` — full manifest for restore
- [x] `GET  /v1/games/:slug/slots/:n/history`
- [x] blob refcounting on snapshot insert/delete

## Phase 3 — CLI, manual config
- [x] `gamesync init` — write config, verify server reachable
- [x] `gamesync add <name> <path>` — manual game folder
- [x] `gamesync scan` — walk folders, sha256 every file, local SQLite state
- [x] `gamesync sync` — the whole algorithm: check → upload missing → snapshot
- [x] `gamesync status` — per game: in sync / local ahead / remote ahead / conflict
- [x] Ignore rules (`*.tmp`, `*.log`, thumbnails)
- [ ] **Ship it. Use it on 2 PCs for two weeks before anything below.**

## Phase 4 — Conflicts & restore
- [x] Conflict detection via `baseVersion` (409 path)
- [x] `gamesync resolve <game> --keep-local | --keep-remote | --keep-both`
- [x] `gamesync history <game>` — versions with date, size, playtime if known
- [x] `gamesync restore <game> <version>` — always snapshots current state first
- [x] Pre-restore + pre-launch safety snapshots

## Phase 5 — Launch wrapper (highest-value feature)
- [x] `gamesync launch <game>` — sync down → snapshot → spawn → wait exit → sync up
- [x] Steam launch via `steam://rungameid/<appid>`, Epic via `com.epicgames.launcher://apps/<id>`
- [x] Process poll to detect real exit (launcher hands off, parent process dies early)
- [x] Refuse to sync down if game already running

## Phase 5.5 — Web dashboard (Next.js, same deploy)
- [x] Convert server to Next.js App Router; mount Hono at `app/api/[[...route]]/route.ts`
- [x] Login with `GAMESYNC_TOKEN` (cookie session, single user)
- [x] Games list: name, slots, current version, total size, last sync, device
- [x] Slot detail: version history timeline, size + device + playtime per version
- [ ] Download any version as a zip (server streams from R2 presigned GETs)
- [x] Add game manually (slug + display name), edit, delete
- [x] Delete a version / delete a whole slot (with confirm; blobs go to GC queue)
- [x] Pin / unpin a version so retention never prunes it
- [x] Storage meter: unique bytes stored vs logical bytes, dedup ratio
- [ ] Recipe browser: which recipes exist, which of my games matched

## Phase 6 — Auto-detect Steam & Epic
- [x] Steam: `libraryfolders.vdf` → roots → `appmanifest_*.acf` (appid, name, installdir)
- [x] Epic: `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item`
- [x] Recipes-in-code registry (`packages/recipes`) — one file per game, added as we go
- [x] Tier 2 engine heuristics: Unity `app.info`, Unreal `Saved/SaveGames`, Godot, Steam Cloud `remote`
- [x] OneDrive-redirect-safe path resolution via User Shell Folders registry
- [x] `gamesync detect` — list found games, user confirms which to sync
- [x] Detect Steam Cloud games and flag them (Valve already syncs those)
- [x] Unmatched games fall back to manual folder — same storage path, not a lesser one

## Phase 7 — Retention & GC
- [x] Policy: keep 10 recent + 1 daily for 30d + all pre-launch snapshots
- [x] Vercel cron: prune snapshot rows nightly
- [x] GC: delete R2 blobs with refcount 0, **24h grace period** before real delete
- [ ] `used_bytes` tracking = unique blobs referenced (charge real cost, not logical size)
- [x] Sweep orphaned uploads (blob in R2, no snapshot references it)

## Phase 8 — Watch mode
- [x] `gamesync watch` — chokidar on all save folders
- [x] Debounce 15s idle **and** game process not running before snapshotting
- [x] Copy to temp with shared-read before hashing (never read a file mid-write)
- [ ] Offline queue in SQLite, exponential backoff drain
- [x] Run at login (`HKCU\...\Run`)

## Phase 9 — Windows 11 desktop app (Electron)
- [x] `packages/core` — scan, hash, sync engine, recipes; shared by CLI and desktop
- [x] Electron shell: main process runs core, renderer is React (same design as web dashboard)
- [x] Library screen: scan Steam + Epic, show every detected game with match tier
      (recipe / engine heuristic / needs folder)
- [x] Per-game toggle to enable sync, manual folder picker for unmatched games
- [x] Sync status per game: in sync / local ahead / cloud ahead / conflict
- [x] Conflict dialog with side-by-side local vs cloud
- [x] Version history + one-click restore
- [x] Tray icon, run at login, background watch
- [x] Windows installer built (NSIS, x64 + arm64), published to R2
- [x] Public /download page with version, size, SHA-256
- [ ] Signed installer (SmartScreen) — needs a code-signing cert
- [ ] Auto-update feed

---

## Later / maybe
- [ ] Chunk-level dedup (FastCDC + packfiles) — only if per-file CAS proves insufficient. Measure first.
- [ ] Detect pre-compressed saves (zip/gzip magic) and decompress before chunking
- [ ] Client-side encryption before upload (age/libsodium, key never leaves PC)
- [ ] Playtime / level extraction from UE `.sav` + Unity saves — makes conflict dialogs decidable
- [ ] Linux + Steam Deck client (path templates already platform-aware)
- [ ] Multi-user: users table, quotas, device registry, real auth
- [ ] Share a save version via a signed public link

## Explicitly NOT doing
- Merging binary saves. Pick one side, keep the other.
- Real-time sync during gameplay. Corrupts saves.
- Storing bytes in Postgres.
