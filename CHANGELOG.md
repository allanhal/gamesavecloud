# Changelog

## 0.4.22 — 2026-09-05

### Changed
- **Save-size wording is more conservative.** The desktop card now describes a
  larger save as a weak hint, with save time as the stronger signal. Hyper
  Echelon's Unity `.dat` saves do not have a public progress schema, so the app
  should not imply size can reliably tell which save is further along.

## 0.4.21 — 2026-09-05

### Changed
- **No more "conflict" status.** When local and cloud differ, the status now
  says which is newer by save time — **Local newer than cloud** or **Cloud newer
  than local** — and you choose with the two buttons. Removed the conflict panel.
- **Progress hint from save size.** Cards show the cloud save's size alongside
  the local one, and when they differ, a line notes which save is larger
  ("usually more progress") — a heuristic, since bigger saves generally mean
  further along.

## 0.4.20 — 2026-09-05

### Changed
- **Explicit push/pull instead of "Sync".** Each game now has **Send to cloud**
  (put this PC's save on the server) and **Override local with latest cloud save**
  (pull the cloud save down; the local one is backed up first). "Send to cloud"
  warns only if the cloud copy is newer.
- **Save times are shown and stored.** The card shows when this PC's save was
  last modified (the save file's own mtime) and when the cloud version was saved.
  A pushed version is now stamped with the save's last-modified time, so history
  reads as when the game was last played — not when it was uploaded.

## 0.4.19 — 2026-09-05

### Added
- **Splash screen** on startup so the cold-start second doesn't look like a
  failed launch. The main window stays hidden behind it until the first paint.
- **Loading states on buttons** for slow actions — Play → "Playing…", Sync →
  "Syncing…", conflict resolve → "Keeping…", Restore → "Restoring…".
- **History has a column header** (Version · When it was saved · Size · Saved by)
  and a one-line explanation of what versions are and what Restore does.

## 0.4.18 — 2026-09-05

### Removed
- **"In your cloud, not set up on this PC" section.** Dropped that dashboard
  panel and its `games:cloud` / `games:adopt` IPC — games are set up via the
  Library scan instead.

## 0.4.17 — 2026-09-05

### Changed
- **Back to a single portable `.exe`.** Ship one file:
  `gamesavecloud-<ver>-x64-portable.exe` — no zip, no installer. (The portable
  target is a self-extracting exe: it unpacks to temp and runs; data stays in
  `gamesavecloud-data` beside the exe.) Keeps the embedded app icon.

## 0.4.16 — 2026-09-05

### Changed
- **Ship a plain executable, not a self-extracting portable.** The build is now
  a single `gamesavecloud-<ver>-x64.zip`: extract once and double-click
  `gamesavecloud.exe` — it runs instantly, no self-extraction on each launch and
  none of the installer-like feel the `portable` target had. Still no installer,
  still portable (data stays in `gamesavecloud-data` beside the exe).
- **App icon** embedded in the exe (cloud + download mark).

### Fixed
- CI verify/signing steps looked for `*-portable.*`; updated them for the zip
  artifact so the release publishes.

## 0.4.14 — 2026-09-05

### Changed
- **Single build target.** Ship one artifact: the Windows x64 portable `.exe`.
  Dropped arm64 and the redundant combined multi-arch exe that 0.4.13 produced.

## 0.4.13 — 2026-09-05

### Fixed
- **Release build was broken.** The desktop `dist` script had been mangled to
  `electron-builder --dir --win portable,exe` — an invalid target that failed CI
  with `Unknown target: portable,exe`, and `--dir` never produced distributable
  artifacts. Restored `dist` to `node dist.mjs` (build + electron-builder) and
  put `esbuild`/`react` back in devDependencies.

### Changed
- **Portable only.** Dropped the `.zip` targets; builds now produce just the
  portable `.exe` for x64 and arm64. No installer.
- Removed the `@gsc/cli` package — the desktop app is the supported client.

## 0.4.12 — 2026-08-25

### Added
- **Recipe**: `hyper-echeleon.json` for multiplayer PC synchronization across R2 cloud storage
- **Docs**: README walkthrough for non-LAN multi-PC sync with GitHub Releases distribution
- **Version bump**: desktop-v0.4.12 portable ZIPs built via CI and available on GitHub releases

## 0.4.11 — 2026-08-25

### Fixed
- **Sync all blanked the window.** The progress reducer treated a first, phase-less event
  as belonging to an existing transfer and read state that was not there; the throw came
  from inside a state updater, so React unmounted everything. The fold is a tested
  function now

### Added
- An error boundary: a render error shows the stack, with Copy error and Reload, instead
  of a blank window
- `gamesavecloud-data/logs/app.log` collects renderer errors, main-process exceptions and
  unhandled rejections

## 0.4.10 — 2026-08-25

### Changed
- Save-folder candidates show minutes and hours, not just whole days: everything written
  today read as "0d ago", which is the exact range that matters when hunting for the
  folder a game just wrote. The absolute timestamp is shown beside it

## 0.4.9 — 2026-08-25

### Added
- Recipe for **Hyper Echelon** (Epic and Steam) — a Unity title saving under
  `LocalLow/GangoGames LLC`

## 0.4.8 — 2026-08-25

### Added
- Sync shows real progress: a bar, files done of total, bytes moved of total, transfer
  rate and an ETA. A filename alone said nothing about how long a save would take
- The CLI prints the same counts on each line when syncing verbosely

## 0.4.7 — 2026-08-25

### Changed
- Closing the window now quits the app. It used to hide to the tray and keep syncing,
  which left gamesavecloud.exe running, kept the install folder locked on Windows, and
  gave no on-screen sign that anything was still alive. The tray icon remains while the
  app is open; background sync runs while it is open

## 0.4.6 — 2026-08-25

### Added
- Code signing via Azure Trusted Signing, switched on by the presence of credentials, so
  an unsigned local build still works. CI prints the Authenticode status of every build
  and warns when it is unsigned
- /download explains Smart App Control properly: it blocks unsigned apps outright, unlike
  SmartScreen there is no "run anyway", and switching it off is permanent

## 0.4.5 — 2026-08-25

### Added
- A cloud game whose save folder does not exist yet can be restored anyway: the recipe
  says where the game would write it, and **Create folder and restore** makes that folder
  and pulls the save into it — no need to launch the game once first
- **Choose folder…** stays available beside it, for a path the recipe does not know

## 0.4.4 — 2026-08-25

### Added
- Dashboard lists games that exist in the cloud but are not set up on this PC, with the
  save folder this machine would use — one click adopts it and pulls the save down
- Version lists show the absolute timestamp next to the relative one, in the app and on
  the web dashboard, with the exact ISO time on hover

## 0.4.3 — 2026-08-25

Portable Windows build.

## 0.4.2 — 2026-08-25

### Fixed
- The app kept its own folder locked on Windows after you closed the window: closing
  only hides to the tray, so gamesavecloud.exe stayed live and Windows refused to delete
  the folder. Quitting now really quits — the sync timer, tray icon and window are all
  torn down, with a hard `app.exit` 4s later if anything still hangs
- `isGameRunning` shelled out to PowerShell **synchronously** every poll, freezing the
  main process for the length of each call and leaving a child running if quit landed
  mid-poll. It is async now, and the child is killed when quitting aborts it
- Launching a game left the exit-poll loop running forever; it is cancelled on quit and
  its timer no longer holds the event loop open
- A second launch started a second process holding the same files; it now focuses the
  running instance instead (`requestSingleInstanceLock`)

### Added
- **Quit** button in the header, for when the tray icon is in the overflow area
- A one-time tray balloon on first close, saying the app is still running

## 0.4.1 — 2026-08-24

### Fixed
- Epic games matched recipes by display name only; the manifest's `AppName` is now
  tried first, so a recipe can name it explicitly
- A recipe with only a `steam` block left the Epic copy of the same game unmatched.
  Every platform's save list is now tried, the named one first
- Owning a game on both stores dropped the Epic entry entirely; both are listed now

### Added
- **Rescan** button in Detected games — re-reads the recipes folder, then scans again,
  so a .json added while the app is open takes effect without a restart
- Games with no save folder are shown by default, with an expandable list of every
  folder that was checked, and a note when Epic manifests list nothing installed

## 0.4.0 — 2026-08-24

**Portable only.** The NSIS installer and the auto-updater are gone. Every build keeps
its data in `gamesavecloud-data` beside the exe, and updating is downloading a newer zip
and replacing the files.

**Recipes are plain .json.** Adding a game is dropping a file into
`gamesavecloud-data/recipes` — no rebuild, no code change.

### Added
- Recipes load from the bundled `games` folder, the user's recipes folder and
  `$GSC_RECIPES_DIR`; later folders override earlier ones by `id`
- "Save recipe" in **Find saves** writes the probed recipe straight into that folder,
  plus a link to open it
- Invalid recipe files are skipped with a warning instead of breaking startup

### Changed
- `pnpm desktop:dist` builds the portable zip (x64 + arm64) and single exe (x64)
- `renderRecipe` emits JSON; the CLI points at the user's recipes folder
- `/download` lists portable builds only; older installer rows are hidden

### Removed
- `electron-updater`, the update UI, and the `/updates/win` feed route

## 0.3.0 — 2026-08-19

**Installers are now built on Windows in CI.** The 0.1.0 and 0.2.0 installers were
cross-built from macOS through wine; NSIS generates its uninstaller by executing the
compiled installer, which does not survive that, so those uninstallers failed their
own integrity check and blocked installing any newer version.

### Added
- Find a game's save folder from inside the app — ranked candidates with file count,
  size and recency, one-click "Use this", and a copyable recipe snippet
- `scripts/windows-cleanup.ps1`, served at `/cleanup.ps1`, removes a wedged install
- Releases record the host they were built on; `/download` flags cross-built installers

### Changed
- NSIS compression dropped from `maximum` to `normal`

### Fixed
- Windows installer and uninstaller integrity failure

## 0.2.0 — 2026-08-18

### Added
- Auto-update for the installer build (electron-updater, feed served from `/updates/win`)
- Portable builds: zip (x64, arm64) and a single self-extracting exe (x64).
  Portable keeps config, sync state and backups in `gamesavecloud-data` next to the
  executable, so the folder can move between PCs or live on a USB stick.
- `gamesync find-saves "<game>"` — locates a game's real save folder and prints a
  ready-to-paste recipe with the Steam appid or Epic AppName filled in
- Detroit: Become Human recipe expanded to 8 candidate paths

### Fixed
- Epic games never got an `appId`, so Play could not launch any of them

### Notes
- Portable builds do not auto-update by design; the NSIS updater cannot replace an
  extracted folder. Download a newer zip and keep `gamesavecloud-data`.

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
## Build Log ### 2024-12-XX

### Release: desktop-v0.19.0 (hypothetical version)

- CI build from commit e65e970 + dummy change
- Portable ZIPs published to GitHub Releases
- Windows x64, macOS ARM64, Linux static builds
