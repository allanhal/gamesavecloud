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
pnpm desktop:dist               # build Windows installers (x64 + arm64)
pnpm release                    # upload them to R2 and list them on /download
```

Cross-building the Windows installer from macOS works and needs `wine`
(`brew install --cask wine-stable`). Output lands in `apps/desktop/release/`.

Bump `version` in `apps/desktop/package.json` before `pnpm release`, or pass one:
`pnpm release 0.2.0 --notes "conflict dialog fixes"`.

Installers are served from R2 via short-lived presigned URLs; `/download` is public
on purpose, since you need the app on a fresh PC before you have a token.

**Builds are unsigned**, so Windows SmartScreen shows a warning — *More info → Run
anyway*. Signing needs a code-signing certificate.

## Adding a game recipe

Save paths can't be detected generically, so exact ones live in code. Three tiers
resolve a folder: a recipe, an engine heuristic (Unity `app.info`, Unreal
`Saved/SaveGames`, Godot, Steam Cloud `remote`), then the user picking a folder.

Add `packages/recipes/src/games/<id>.ts`:

```ts
import { defineRecipe } from "../types";

export default defineRecipe({
  id: "hollow-knight",
  name: "Hollow Knight",
  platforms: {
    steam: {
      appId: "367520",
      saves: ["<winLocalLow>/Team Cherry/Hollow Knight"],
    },
  },
  exclude: ["**/*.log"],
});
```

Then add it to the `recipes` array in `packages/recipes/src/index.ts`. Placeholders:
`<winDocuments>` `<winAppData>` `<winLocalAppData>` `<winLocalLow>` `<winSavedGames>`
`<winPublic>` `<home>` `<installDir>` `<steamUserId>`. The first path that exists wins.

`<winDocuments>` and `<winSavedGames>` resolve through the Windows registry, so
OneDrive-redirected folders work.

## Retention

Nightly cron keeps the 10 newest versions, one per day for 30 days, and everything
pinned (pre-launch and restore snapshots). Freed blobs sit for a 24-hour grace period
before R2 deletion, so a race can't destroy a live save.
