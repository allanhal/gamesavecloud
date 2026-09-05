# gamesavecloud

Self-hosted cloud saves for PC games. The current client is the Windows desktop app; it syncs save folders through a Vercel API, stores blobs in Cloudflare R2, and keeps snapshot metadata in Postgres.

Live app/download page: https://gamesavecloud.vercel.app

## Current State

- Latest desktop release: `0.4.22`
- Distribution: single Windows x64 portable `.exe`
- Config/data location: `gamesavecloud-data` beside the portable exe when writable, otherwise the normal app config folder
- Bundled recipes: Detroit: Become Human, Hyper Echelon, SnowRunner
- User recipes: JSON files in the app's recipes folder
- Auth: single bearer token via `GAMESYNC_TOKEN`

## Desktop App

- Connect to a gamesavecloud server with URL + token.
- Scan Steam and Epic libraries for supported games.
- Add detected games or manually choose a save folder.
- Sync all games or one game at a time.
- Use **Send to cloud** to upload this PC's save.
- Use **Override local with latest cloud save** to download the cloud save; the local save is backed up first.
- Show local/cloud versions, save times, file counts, sizes, and transfer progress.
- Show whether local or cloud is newer by save modified time.
- Show save size only as a weak hint; it is not treated as reliable progress.
- View history and restore older snapshots.
- Launch a game, wait for it to exit, then sync again.
- Background sync runs while the app is open.
- Closing the window quits the app.

## Sync Model

- Saves are stored as folder-level snapshots.
- Files are addressed by SHA-256 hash and uploaded/downloaded through presigned R2 URLs.
- Snapshot writes use `baseVersion` optimistic concurrency.
- The app never overwrites a local save during download/restore without first making a backup.
- A pushed cloud version is timestamped with the newest local save file mtime, not upload time.
- When local and cloud differ, the UI asks the user to choose direction instead of pretending to know true game progress.

## Server

- Next.js app with Hono API under `/api/v1`.
- Vercel hosts the web/API surface.
- Cloudflare R2 stores save bytes.
- Postgres stores games, slots, snapshots, device state, releases, and blob metadata.
- Nightly garbage collection keeps current/recent/pinned snapshots and removes unreferenced blobs after a grace period.

## Releases

- `pnpm test`
- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm -F @gsc/desktop dist`
- Pushes to `main` run `.github/workflows/desktop-release.yml`.
- A desktop version change publishes to R2 and creates a GitHub Release tagged `desktop-vX.Y.Z`.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm exec tsc --noEmit -p tsconfig.json
pnpm -F @gsc/desktop build
pnpm -F @gsc/desktop dist
pnpm ship
pnpm ship:watch
```

## Environment

Required for the server/release path:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `GAMESYNC_TOKEN`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Optional signing secrets are wired in CI; unsigned builds still publish, but Windows Smart App Control may block them.

## License

MIT
