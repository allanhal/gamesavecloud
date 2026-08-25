# gamesavecloud

Self-hosted cloud saves for PC games. Neon holds metadata, Cloudflare R2 holds bytes,
Vercel runs the API and web dashboard, and a Windows app (or CLI) syncs your PCs.

**Live:** https://gamesavecloud.vercel.app

## How it works

Files are content-addressed by the SHA-256 of their **raw** bytes. A version is an
atomic manifest of a whole save folder, not a per-file version, so a folder is never
left half-old and half-new. Uploading a new version only transfers files whose hash
changed — the other 20 files in the folder are already stored.

```
PC ──1─► POST /blobs/check      "which of these 24 hashes do you have?"
   ◄──── { missing: [2 hashes] }
   ──2─► POST /blobs/upload-urls  presigned R2 PUTs
   ──3─────────── PUT bytes ─────────────► R2      (never through the function)
   ──4─► POST /snapshots  { baseVersion, files[] }
   ◄──── 200 { version } | 409 conflict
```

`baseVersion` is optimistic concurrency: if another PC pushed since you last synced,
the server returns 409 instead of overwriting. Nothing is ever silently lost.

Downloads verify the SHA-256 after decoding and **refuse to write** on a mismatch,
so a bad codec or a truncated transfer can't corrupt a save.

## Layout

```
app/                     Next.js — web dashboard + API
  api/[[...route]]/        Hono mounted at /api/v1
  api/cron/gc/             nightly retention + garbage collection
src/server/              API logic: routes, Drizzle schema, R2 helpers
packages/shared/         zod contracts shared by client and server
packages/recipes/        per-game save-path recipes + engine heuristics
packages/core/           scan, hash, sync engine, Steam/Epic scanners
apps/cli/                gamesync CLI
apps/desktop/            Electron app for Windows 11
```

## Setup

```bash
pnpm install
pnpm db:migrate          # uses DATABASE_URL_UNPOOLED
pnpm dev                 # http://localhost:3000
```

`.env` needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `R2_*`, `CLOUDFLARE_ACCOUNT_ID`,
and `GAMESYNC_TOKEN` (the single shared bearer token — this is a single-user install).

## CLI

```bash
pnpm cli init https://gamesavecloud.vercel.app <TOKEN>
pnpm cli detect                 # scan Steam + Epic
pnpm cli add "SnowRunner" "C:/Users/you/Documents/My Games/SnowRunner"
pnpm cli sync                   # sync everything
pnpm cli status
pnpm cli history <game>
pnpm cli restore <game> <version>
pnpm cli launch <game>          # sync ↓, play, sync ↑
pnpm cli watch                  # background daemon
```

## Desktop app

```bash
pnpm desktop                    # run it locally
pnpm desktop:dist               # portable zip (x64 + arm64) + single-exe (x64)

pnpm ship                       # release: bump patch, verify, push — CI does the rest
pnpm ship minor                 # or major, or an exact version: pnpm ship 1.0.0
pnpm ship --dry                 # test + typecheck only, writes nothing
pnpm ship:watch                 # follow the CI run it just triggered
pnpm ship:local                 # build here (needs wine) and upload straight to R2
```

`pnpm ship` refuses a dirty tree or a branch other than main, runs the tests and
typecheck first, bumps `apps/desktop/package.json`, dates an `## Unreleased` changelog
heading, then commits and pushes. The push is the trigger.

Every push to main builds on a Windows runner. It publishes only when that version
changed, and then publishes twice: to R2, which is what `/download` lists, and as a
GitHub Release tagged `desktop-v<version>` carrying the same artifacts and the changelog
section. The repo is private, so the GitHub assets need repo access — `/download` is the
public route.

The app ships **portable only** — no installer, no auto-update. A packaged build keeps
its data in `gamesavecloud-data` beside the exe, so the folder carries config, sync
state and your own recipes to another PC or a USB stick. If that folder is not writable
(read-only media) the app falls back to `%APPDATA%` rather than failing to start.

Updating is downloading a newer zip and replacing the files, keeping
`gamesavecloud-data`. Builds run on a Windows runner (`.github/workflows/desktop-release.yml`);
output lands in `apps/desktop/release/`.

Bump `version` in `apps/desktop/package.json` before `pnpm release`, or pass one:
`pnpm release 0.2.0 --notes "conflict dialog fixes"`.

Artifacts are served from R2 via short-lived presigned URLs; `/download` is public
on purpose, since you need the app on a fresh PC before you have a token.

**Builds are unsigned.** SmartScreen shows a warning you can click past, but **Smart App
Control blocks them outright** — it permits only signed or well-known apps and has no
"run anyway", and turning it off requires reinstalling Windows. So an unsigned build is
unusable on a machine that has it on.

Signing is wired and waits only on a certificate. `apps/desktop/dist.mjs` turns it on
when these are set (CI reads them from repo secrets):

```
AZURE_SIGN_ENDPOINT   e.g. https://weu.codesigning.azure.net
AZURE_SIGN_ACCOUNT    Trusted Signing account name
AZURE_SIGN_PROFILE    certificate profile name
AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET
```

Azure Trusted Signing is the cheap route (~$10/month, and it validates individuals, not
just companies); a bought OV/EV certificate works too via electron-builder's
`signtoolOptions`. Every CI build prints the Authenticode status and warns when unsigned.

## Adding a game recipe

Save paths can't be detected generically, so exact ones live in recipe files. Three tiers
resolve a folder: a recipe, an engine heuristic (Unity `app.info`, Unreal
`Saved/SaveGames`, Godot, Steam Cloud `remote`), then the user picking a folder.

Recipes are plain JSON files, one game each, read at startup from:

1. the recipes bundled with the app (`packages/recipes/games/*.json`)
2. `gamesavecloud-data/recipes/*.json` in a portable install (`<configDir>/recipes` elsewhere)
3. `$GSC_RECIPES_DIR`, for one-off overrides

Later folders win on a duplicate `id`, so your own file overrides a bundled one, and a
new game needs no rebuild — drop in `<id>.json`:

```json
{
  "id": "hollow-knight",
  "name": "Hollow Knight",
  "platforms": {
    "steam": {
      "appId": "367520",
      "saves": ["<winLocalLow>/Team Cherry/Hollow Knight"]
    }
  },
  "exclude": ["**/*.log"]
}
```

In the app, **Find saves** on an unmatched game probes the disk and writes exactly this
file for you (*Save recipe*); the CLI's `find-saves` prints it. A file missing `id`,
`name`, `platforms`, or a platform's `saves` array is skipped with a warning.

Placeholders:
`<winDocuments>` `<winAppData>` `<winLocalAppData>` `<winLocalLow>` `<winSavedGames>`
`<winPublic>` `<home>` `<installDir>` `<steamUserId>`. The first path that exists wins.

`<winDocuments>` and `<winSavedGames>` resolve through the Windows registry, so
OneDrive-redirected folders work.

## Retention

Nightly cron keeps the 10 newest versions, one per day for 30 days, and everything
pinned (pre-launch and restore snapshots). Freed blobs sit for a 24-hour grace period
before R2 deletion, so a race can't destroy a live save.
