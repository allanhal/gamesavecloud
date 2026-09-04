# gamesavecloud — Multi-PC Save Synchronization Server

![Vercel Status](https://img.shields.io/badge/Vercel-Live-blue) ![Platform]([Windows]&#9744;&#10356;[Linux]&#9744;&#10356;macOS) ![License]
(https://img.shields.io/badge/license-MIT-yellow)

Self-hosted cloud saves for PC games. **Synchronize Hyper Echeleon (and 15+ other titles)** across your home computers using Cloudflare R2 as central storage and Vercel API gateway. No LAN required — each computer sends/save files to the same cloud bucket, and the server handles conflicts intelligently.

**Live:** https://gamesavecloud.vercel.app

> **For this setup**: Single API endpoint at `https://gamesavecloud.vercel.app/api/v1/` with R2 backend. Desktop app (`pnpm desktop:dist`) distributes portable ZIP builds via GitHub Releases so each computer can be deployed independently without network sharing.

## How this multi-PC setup works

```
   PC-A                   API Gateway        PC-B
  (Windows 11)         Vercel/Cloudflare    (macOS)
      │                    │                    │
      │     sync ↑         │     sync ↓        │
      └─────────1──────────┼──────────3────────►│
      ←2-Confirm missing   │    ←4-download────│
      ←5-upload & version  │
        │◄────R2 Bucket─────────►│          │
       (Central Storage)         │
       Holds all save bytes for  │
      all PCs. No LAN sync needed.  │
```

**The flow**:
1. **Desktop app on PC-A** uploads modified saves to R2 central storage via API
2. **API detects conflicts** — if PC-B also uploaded changes simultaneously, get a conflict resolution prompt
3. **R2 deduplicates** — only new/unchanged files transfer over network
4. **Desktop app on PC-B** downloads updated bytes from the same R2 bucket
5. **Repeat** whenever either game is played

**Key features**: Atomic folder-level snapshots (never half-synced), SHA-256 verification on all uploads/downloads, retention policy (10 days + pinned backups).

## Quick Start — Sync Your First Game

### Prerequisites

```bash
# On your main PC where you'll build desktop app:
pnpm install                # Install dependencies
pnpm db:migrate             # Initialize database from .env values
pnpm dev                    # Test dashboard locally on http://localhost:3000
```

**Required `.env` variables**:

- `DATABASE_URL` = PostgreSQL/SQLite connection string
- `DATABASE_URL_UNPOOLED` = Additional read replica (optional high-concurrency tier)
- `R2_*` = Cloudflare R2 credentials and bucket name
- `CLOUDFLARE_ACCOUNT_ID` = Optional for advanced features
- `GAMESYNC_TOKEN` = Single bearer token for API auth (single-user install, future multi-user with auth)
- `VERCEL_URL` = Production domain or http://localhost:3000
- `NODE_ENV=production` for Vercel deployments

### 1. Add Game Recipe — Hyper Echeleon Example

Save paths must be configured manually per game. Start with the recipe file we created:

```bash
cd packages/recipes/hyper-echeleon.json    # Already exists
pnpm cli add "hyper-echeleon" -f ./packages/recipes/hyper-echeleon.json
```

If Hyper Echeleon installed to a different path, edit `packages/recipes/hyper-echeleon.json` and update the `"paths"` object:

- Windows: `%LOCALAPPDATA%\\HyperEcheleon\\Saved\` or similar
- macOS: `~/Library/Application\ Support/HyperEcheleon/Saved/`
- Linux: `~/.config/HyperEcheleon/Saved/`

### 2. Generate Desktop Build

```bash
pnpm desktop:dist           # Creates portable ZIP in apps/desktop/release/
# Output includes:
#   - Windows x64 + ARM64, macOS ARM64, Linux static binaries
#   - Embedded recipes folder with hyper-echeleon.json included
#   - SHA-256 hashes for verification
```

### 3. Distribute to Other PCs

Upload the ZIP via **GitHub Releases**:

```bash
pnpm ship                  # Bump version, verify, push
# Automatically publishes artifacts as:
#   apps/desktop/release/desktop-vX.Y.Z-win-x64.zip
#   apps/desktop/release/desktop-vX.Y.Z-macos-arm64.zip
#   etc. (GitHub releases publish)
```

Download the ZIP on each computer you want to sync from:

- Computer 1 → `desktop-v0.x.x-win-x64.zip`
- Computer 2 → same ZIP (runs portable or installs)
- Computer 3 → same ZIP (no rebuild needed!)

### 4. Deploy on Second PC — Manual Setup

On each new computer:

```bash
# Extract the downloaded release ZIP to C:/Users/Name/Desktop/gamesavecloud/
cd gamesavecloud
pnpm install               # Only needed first time or after pnpm updates
pnpm cli init https://gamesavecloud.vercel.app \
  <GAMESYNC_TOKEN>         # Token from server .env
pnpm cli add "hyper-echeleon"   # Recipe path already configured in bundled recipes
pnpm cli status            # Verify Hyper Echeleon recognized

# First sync will upload local saves to R2 for first time:
pnpm cli sync              # Upload PC 1 saves (or download if R2 has updates)
```

**Note**: The second computer doesn't need database setup — it shares R2 storage and queries the Vercel API. Database only exists on the **main server**.

## Conflict Handling Workflow

When two PCs modify the same save simultaneously:

1. **Server detects** — PC-A uploads version v3, but PC-B already has v4 uploaded earlier
2. **API returns 409 conflict** — prevents silent overwrites
3. **Desktop app prompts** — side-by-side view of both versions
4. **Manual resolution** — keep latest for level progress OR merge per-file (binary saves stay separate)

**Example**: You complete a puzzle on PC-A while your wife plays on PC-B. When next sync:
- ✅ PC-A's new puzzle state → server stores, notifies client
- ❌ Conflict: PC-B had newer level completion → keep latest or review both
- **Resolution**: Choose per-game strategy via UI preferences

## Dashboard Features — Sync Status Overview

After setup, visit https://gamesavecloud.vercel.app to see:

- **Storage usage** — Total bytes across all games and slots
- **Recipe browser** — Search/filter existing recipes (including Hyper Echeleon)
- **Per-game match status** — How many save versions exist per game
- **Conflicts count** — Number of manual resolution sessions handled
- **Tier summary** — Breakout by Steam/Valve-synced, Epic, GOG/local-only titles

## CLI Commands Refresher

```bash
pnpm cli init endpoint https://gamesavecloud.vercel.app <TOKEN>
pnpm cli detect                    # Scan Steam/Epic libraries for existing games
pnpm cli add "game-name"           # Add new game (prompts for save path)
pnpm cli sync                      # Upload missing, download updates, resolve conflicts
pnpm cli status                    # List all synced games with version counts
pnpm cli history <game>            # View upload/download log
pnpm cli restore <game> <version>  # Revert to previous backup state

# Desktop app CLI (included in portable builds):
pnpm cli watch                     # Background daemon mode — auto-triggers on game launch
pnpm cli install                  # Register with Windows Run key for startup
```

### Advanced CLI Options

```bash
pnpm cli sync --dry               # Preview changes without uploading/downloading
pnpm cli sync --game="hyper-echeleon-only"        # Sync single game
pnpm cli status --storage-breakdown        # Show usage by game/category
pnpm cli import "gdrive.csv"  # Restore from Google Drive backup CSV
```

### Retention Policy

Nightly cron keeps:
- **10 newest versions** per slot total (not per-day limit)
- **Pinned snapshots** (pre-launch, recent conflict resolutions, restore points) never deleted
- Freed blobs sit 24 hours before R2 cleanup for race-condition safety

## Desktop App Distribution — GitHub Releases Model

```bash
pnpm desktop:dist           # Build portable ZIPs (includes data folder config)
# Output in apps/desktop/release/ :
#   desktop-v0.19.0-win-x64.zip  (25+ MB: bundled recipes, electron app)
#   desktop-v0.19.0-macos-arm64.zip
#   desktop-v0.19.0-linux.tar.xz

pnpm ship                   # Release workflow: bump, verify, push to main, builds on CI
```

**Portable build notes**:
- Data folder (`gamesavecloud-data/`) carries recipes and sync state between PCs — copy this USB stick drive for easy deployment
- No installer needed — drag extracted ZIP anywhere (except read-only media; falls back to `%APPDATA%` then)
- Builds remain **unsigned** until Azure Trusted Signing or SignPath Foundation enabled — SmartAppControl requires signed EXE on Windows 11 Enterprise+

## Adding More Games

1. Download bundled recipe from existing game in `packages/recipes/games/`
2. Copy `your-game.json` from that folder to `/packages/recipes/games/` (or portable install)
3. Edit paths for your installation: update `"paths.windows"` with correct `%LOCALAPPDATA%\\<Game>\Saved\` location
4. Sync on desktop app — new game automatically appears if path matches existing save

**Recipes support placeholders**: `<winLocalAppData>`, `<steamUserId>`, etc. resolve to actual paths at runtime.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Vercel API Gateway                │
│        https://gamesavecloud.vercel.app/api/v1/     │
│                                                       │
│  ┌──────────────────┐   ┌─────────────────────────┐ │
│  │ Next.js/Dashboard│   │  Hono Server            │ │
│  └──────────────────┘   │  - Auth (bearer token)  │ │
│                         │  - Conflict resolution   │ │
│                         └────────────┬─────────────┘ │
└──────────────────────────────────────┼━━━━━━━━━━━━━━┘
                                        │
                              ┌──────────▼──────────┐
                              │ Cloudflare Workers  │
                              └──────────┬──────────┘
                                         │
                            R2 Bucket (Central Storage)
                    Holds all save bytes across clouds
```

- **API Gateway**: Vercel at `/api/v1/` endpoints — handles auth, conflict logic, presigned URLs
- **Database**: Unpooled/PostgreSQL (or SQLite for dev) on main server only — stores metadata, version manifest, not blobs
- **Storage**: R2 cloud bucket as single source of truth — same bytes shared across all PCs
- **Uploads**: Direct PUT to R2 via presigned URL (never through Vercel function) — faster, cheaper bandwidth

## Environment Variables

Set in server `.env`:

```env
DATABASE_URL             # PostgreSQL or SQLite path
DATABASE_URL_UNPOOLED    # High-concurrency read replica (optional)
R2_ACCOUNT_ID            # Cloudflare account ID
R2_ACCESS_KEY_ID         # R2 access key
R2_SECRET_ACCESS_KEY     # R2 secret key
R2_BUCKET_NAME           # Central storage bucket name
R2_ENDPOINT              # For self-hosted R2-compatible (e.g. S3 MinIO)

# Optional advanced features:
CLOUDFLARE_ACCOUNT_ID    # Organization ID for teams/multi-account support
GAMESYNC_TOKEN           # Bearer token — change per new deployment or use auth
VERCEL_URL               # Production domain (for Vercel)

# Signing (CI secrets):
AZURE_TENANT_ID          # Azure AD tenant for Trusted Signing
AZURE_SIGN_ENDPOINT      # https://weu.codesigning.azure.net
SIGNPATH_API_TOKEN       # SignPath Foundation access token (future)

# Rate Limiting / Security:
RATE_LIMIT_UPLOADS_PER_MIN   # Uploads per minute (per-request or global)
XSS_PROTECTION_ENABLED        # Disable for debug only
```

## License

MIT — see [LICENSE](LICENSE).

---

**Need help syncing**? Open a GitHub issue with your game name + save path example. The recipe file shows where the app looks on disk — if installation varies, override the saved-path field manually.
