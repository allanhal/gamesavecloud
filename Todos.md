# gamesavecloud — TODO

Fresh list, written from the code (verified 2026-09-05 against v0.4.22, 43/43 tests passing, tsc clean).
Supersedes the old list, which referenced the removed CLI and features that already shipped (tray, signing wiring, probe, save times).

## 1. Data safety — fix before anything else

- [ ] **Sweep true R2 orphans in the nightly GC.**
  A client that crashes between `PUT` (presigned) and `POST /snapshots` leaves an object in R2 with no `blobs` row.
  Nothing ever deletes it: `GC` and `/admin/purge-orphans` only inspect the `blobs` *table*, and `src/server/r2.ts` has no `ListObjects`.
  Add `listBlobKeys()` (paginated `ListObjectsV2` over `blobs/`), diff against the table, and delete matches in the GC route after the 24h grace.
- [ ] **Prune local backups.** `pull` writes a full copy to `configDir()/backups/<game>/<stamp>` on every override/restore and nothing ever deletes them — they grow forever on the user's disk.
  Keep the N newest per game (e.g. 10) after each backup.
- [ ] **Quota guard in `POST /snapshots`.** R2 free tier is 10 GB. The dashboard shows the meter, but a big game can still push the bucket over.
  Reject new blob *rows* (413) when `sum(compressed_size)` + incoming would cross the cap, unless the token owner passes a confirm.

## 2. Desktop app — the gaps users actually feel

- [ ] **File watching instead of 10-minute polling.**
  `startBackgroundSync()` in `apps/desktop/src/main.ts` re-runs `syncGame` every 10 min; there is no watcher (chokidar was in the removed CLI).
  Watch each enabled game's save folder in the main process: 15 s debounce, skip while `isGameRunning`, then sync. Keep the poll as a fallback.
- [ ] **Run at login.** `app.setLoginItemSettings` is never called — after a reboot the app is off and no sync ever happens until the user remembers to launch it.
  Settings toggle + a "start with Windows" item in the tray menu.
- [ ] **Update nudge.** Portable builds have no auto-update by design, but the app should know when a newer one exists:
  add a public `GET /api/v1/releases/latest` (data the `/download` page already renders), compare with `app.getVersion()`,
  show "version X is out" with an "open /download" button. Never auto-download.
- [ ] **Offline retry with backoff.** When `syncGame` fails on network, the game just sits "offline" until the next 10-min tick or a user action.
  Record a pending push per game in the local state and retry with exponential backoff while the app is open.

## 3. Web dashboard

- [ ] **Download a whole version as a ZIP** (roadmap 5.5, still open).
  Version pages (`app/g/[slug]/v/[id]/page.tsx`) offer per-blob links only.
  Add `GET /g/[slug]/v/[id]/download` — stream a zip assembled from presigned R2 GETs (saves are small; `yazl`/`zip-stream`), with a button on the version page.
  Lets you recover a save on a machine that has no desktop app installed.
- [ ] **Recipe browser.** Recipes (`@gsc/recipes`) are invisible on the web.
  A page listing every bundled + user recipe, and which of the connected devices have the matching game, so a second PC can see "the app knows this game."
- [ ] **Storage meter states.** The meter exists (`app/games/page.tsx`); make it warn (amber) at 75% of the 10 GB quota and red at 90% so the §1 guard has a visible face.
- [ ] **Per-game storage contribution** — the dedup stats are global; show each game's unique-blob share on the game page so "which game costs me R2" has an answer.

## 4. Release & ops

- [ ] **Get a signing certificate** — the only real blocker left for Smart App Control.
  CI wiring is done (Azure Trusted Signing, auto-on when secrets exist, `scripts/self-sign.ps1` for dev); buy/provision the cert and set the six `AZURE_*` secrets.
  Then flip `/download` from "unsigned — expect a block" to signed.
- [ ] **Release notes from git.** `scripts/ship.ts` bumps and publishes; notes are still hand-written into the CHANGELOG.
  Generate the GitHub Release body from `git log --oneline` since the previous `desktop-v*` tag so release notes stop drifting.
- [ ] **Move `pnpm.onlyBuiltDependencies` out of `package.json`** into `pnpm-workspace.yaml` — pnpm 10 warns the field is ignored (visible on every command).

## 5. Code quality

- [ ] **Test the sync engine.** `packages/core/src/sync.ts` is the heart of the app and has zero tests (only `probe` and the Steam scanner do).
  Drive `syncGame` against a fake `Api` + temp dirs: push, pull, conflict-both-sides, missing-local-folder-restore, backup-before-override, temp-file rename.
- [ ] **Test the codec.** `codec.ts` (gzip/zstd pick + round-trip, `pickCodec` size thresholds) is untested.
- [ ] **Test config/state** (`config.ts`): portable vs APPDATA resolution, corrupt-JSON recovery, state key shape.

## 6. Shelved (roadmap "later/maybe" — keep, don't plan)

- Client-side encryption (age/libsodium) before upload.
- Chunk-level dedup — only if per-file CAS ever shows a problem; measure first.
- Linux / Steam Deck client, then macOS.
- Multi-user: users table, quotas, real auth (today: one bearer token by design).
- Playtime/level extraction from UE + Unity saves to make conflicts decidable.

---

### Suggested order

1. §1 (orphan sweep, backup prune, quota) — silent data/billing problems, small surface area.
2. §2 watcher + run-at-login — the two things that decide whether saves actually make it to the cloud.
3. §4 signing cert — external dependency (a purchase), so kick it off early; everything else is code.
4. §3 dashboard items, §5 tests in parallel.
