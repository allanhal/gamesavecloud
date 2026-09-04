# gamesavecloud — Recommended TODOs & Features

## 🚀 High Priority (Ship before 2 weeks)

### Phase 5.5 Completion (Phase 3 status)
- [ ] **Download all versions as ZIP** (`/api/v1/games/:slug/slots/:n/download/:version`)
  - Stream from R2 using presigned URLs
  - Show file list with path, size, SHA-256 before download
- [ ] **Recipe browser UI** in dashboard: search/filter existing recipes, view per-game match status
  - Add "Add recipe" form for manually adding games without scan
  - Recipe statistics: how many games matched each tier

### Phase 6 Completion (Phase 4 status)
- [ ] **Steam Cloud detection**: mark Valve-synced games as "no sync needed"
  - Show badge/icon indicating game already has cloud saves via Steam
  - Exclude from user storage when detected
- [ ] **Epic launcher manifest parsing improvement**
  - Handle nested install directories
  - Parse `manifests.manifest` files alongside `.item`
- [ ] **Path override validation**: warn if user-provided path differs from recipe default
  - Still allow it, but show diff and require confirmation

### Phase 8 Completion (Phase 6 status)
- [ ] **Offline queue with SQLite** for `watch` mode
  - When internet unavailable: snapshot to local SQLite first
  - Exponential backoff when re-online
- [ ] **Windows registry Run key installation** for `gamesync watch --install`
  - Add/remove at login via PowerShell
  - Verify registry entry on startup

---

## 🔄 Medium Priority (Nice-to-have)

### Phase 9 Completion (Phase 7 status)
- [ ] **Code signing support** for Windows builds
  - Azure Trusted Signing integration
  - SignPath Foundation fallback
  - Self-signing for development only
  - CI build workflow updates with certificate validation
- [ ] **Tray icon implementation** for desktop app
  - Context menu: sync now, history, preferences, quit
  - Status indicators: synced / watching / error
- [ ] **Background watch service** (not just tray)
  - Run without GUI via Windows service or scheduled task
  - Monitor multiple PCs on same network (future multi-user)

### UI/UX Improvements
- [ ] **Conflict dialog enhancements**:
  - Side-by-side preview windows for both versions
  - Highlight changed files with diff-style overlay
  - Option to "keep everything" vs pick per-file
- [ ] **Storage meter breakdown** by:
  - Unique blobs (R2 cost)
  - Logical bytes (compressed size)
  - Per-game / per-slot contribution
- [ ] **Version timeline visualization** in slot detail
  - Graph view showing sync activity over time
  - Color-code: local upload (green), cloud download (blue), conflict (red)
- [ ] **Download audit log**: show recent file downloads with timestamp, size, SHA-256 verification
- [ ] **Mobile-responsive web dashboard** for storage usage checks on the go

### Advanced Features
- [ ] **Chunk-level deduplication** (only if needed)
  - Benchmark against current per-folder versioning first
  - Consider FastCDC or similar library if benefits are proven
- [ ] **Client-side encryption** option
  - `age` or libsodium for zero-knowledge storage
  - Encrypt before upload; decrypt on restore
  - Never encrypt: keep metadata readable for debugging
- [ ] **Playtime extraction**: parse EA/Ubisoft save files (if accessible)
  - Only for games with known playtime APIs/stored data
  - Do not attempt on encrypted saves
- [ ] **Level/state import**: for UE/Godot games that expose level progress in saves
  - Import into metadata (not the actual binary)
  - Help resolve conflicts by comparing "played levels"

---

## 🧪 Testing & Observability

### Database & Health
- [ ] **Test suite expansion**:
  - Concurrency test: two PCs modify same save simultaneously
  - R2 retry tests: simulate network blips during upload
  - Large file upload (100MB+) with zstd compression
- [ ] **Error injection testing** in CI:
  - Simulate R2 rate limits
  - Database connection failures
  - Steam API timeouts
- [ ] **Health endpoint with metrics**:
  - DB latency, R2 latency
  - Queue depth for GC and uploads
  - Active watch processes count

### Monitoring (Phase 8.5)
- [ ] **Metrics collection** via datadoghq/prometheus client:
  - Uploads per minute
  - Conflicts resolved count
  - Bytes stored / dedup ratio
  - Watch process uptime
- [ ] **Alerting**: notify admin when watch stops on main PC
- [ ] **Audit logging**: every API call logged to R2 (separate bucket)

---

## 🔐 Security Improvements

- [ ] **Token rotation**: implement token refresh mechanism
  - Current single-token design limits multi-user potential
- [ ] **R2 signature verification** for all downloads
  - Prevent data tampering in transit
- [ ] **Rate limiting** on API endpoints
  - Per-IP or per-token
  - Throttle uploads to preserve R2 bandwidth
- [ ] **SSRF protection**: `head` object / presign calls from untrusted sources

---

## 📦 Distribution & Ops

### Desktop Build Pipeline
- [ ] **Build status badges** in README: signed / unsigned indicator
- [ ] **Release notes generator**: auto-generate changelog from commits
- [ ] **Version pinning**: allow pinning specific app version per game
  - UI setting: "update when new version available"
- [ ] **Portable installer with embedded recipes** folder
  - Include bundled recipes in portable build
- [ ] **Update mechanism**: CLI / Desktop fetches latest release from R2
  - Compare SHA-256 of update.zip before download
  - Extract to temp, migrate data, replace original

### Vercel Optimizations
- [ ] **ISR for dashboard** cache (stale-while-revalidate)
- [ ] **Edge Caching**: use Next.js CDN headers for static assets
- [ ] **Function timeout tuning**: increase if GC takes >10s
- [ ] **Database connection pooling**: use unpooled only for migrations

---

## 🐛 Bug Prevention & Edge Cases

- [ ] **OneDrive sync conflicts**: handle when OneDrive tries to sync R2-delivered saves
  - Detect file in path that was modified externally (not via app)
  - Warn user: "this file may be corrupted if synced with OneDrive"
- [ ] **Anti-virus quarantine**: handle files moved to quarantine by AV
  - Log when a delete fails because file no longer exists at path
  - Re-upload missing blobs and update database
- [ ] **File in use during sync**: better process detection
  - Windows: `Get-Process` or PowerShell check if game handles open
  - macOS/Linux: `lsof -n` equivalent
- [ ] **Empty folder saves**: some games create empty folders as valid state
  - Store zero-byte blobs with hash `e3b0c44...` (SHA-256 of empty)
  - Preserve empty folder structure in slots

---

## 🎮 Platform Support

### Linux / Steam Deck
- [ ] **Linux client**: port to Tauri or use existing CLI as desktop backend
- [ ] **Steam Deck compatibility**: use native XDG paths, Flatpak sandbox
- [ ] **Path templates for Arch/Linux Mint** in recipes (similar to Windows)

### macOS Support
- [ ] **macOS client**: Apple Silicon + Intel builds via electron-builder
- [ ] **Keychain auth** instead of local config file

---

## 📈 User Preferences & Configuration

- [ ] **Per-game retention policy**: override global 10-day limit per game
- [ ] **Storage quota**: warn when approaching R2 bucket limits (customized thresholds)
- [ ] **Compress ratio threshold**: skip compression if `zstd` >5% size increase
- [ ] **Dry-run mode** for all operations: `gamesync sync --dry`
  - Show what would happen without making changes
- [ ] **Import from other services**: OneDrive, Google Drive backup restores

---

## 🤖 CI/CD Enhancements

- [ ] **Pre-commit hooks**: typecheck on change, format with prettier
- [ ] **Automated recipe update detection**: GitHub action to add new games to `/download` when recipes added
- [ ] **Changelog validation**: ensure version bump matches changelog heading
- [ ] **Deprecation policy**: remove support for old Node versions in app
---

## 📝 Documentation & Onboarding

- [ ] **Video tutorials**: 5-minute walkthrough for first-time setup
- [ ] **FAQ page** on GitHub or Vercel dashboard: "Can I sync multiple PCs?" etc.
- [ ] **Troubleshooting guide**: "My sync won't run", "Smart App Control block"
- [ ] **API docs** for developers (TypeDoc + Swagger/OpenAPI spec)
- [ ] **Community examples**: shared recipes for popular indie titles

---

## 🎯 Future Vision (Long-term bets)

### Multi-user / Community Server
- [ ] **Users table**: auth via Passkey, OAuth, or invite codes
- [ ] **Public links**: share a save version as signed URL (expiring 24h)
- [ ] **Device registry**: link multiple PCs/Mac/Linux to same user
- [ ] **Quotas**: 10GB per user free, overage metered storage
- [ ] **Storage sharing**: pool across family members

### Advanced Sync Modes
- [ ] **Selective sync**: only specific folders / file extensions per game
- [ ] **Version branching**: fork a version for experimentation (like Git)
- [ ] **Merge binary saves** (optional): attempt to combine conflicting sections

### Analytics & Insights
- [ ] **Most-synced games**: show top 10 by upload count in dashboard
- [ ] **Bandwidth usage history**: graph R2 API calls per day
- [ ] **Cost estimator**: approximate monthly R2 cost based on storage

---

## ⚠️ Explicitly NOT Doing (Keep in Scope)
- ❌ Merging binary saves (choose one, keep the other)
- ❌ Real-time sync during gameplay (corrupts save state files)
- ❌ Storing bytes in Postgres (always to R2 only)
---

## 💻 Priority Summary

| Priority | Count | Examples | Estimated Time |
|----------|-------|----------|----------------|
| 🚀 **Ship soon** | 3 | Download as ZIP, Recipe browser, Steam cloud detection | 1-2 days |
| 🔄 **Nice-to-have** | 8 | Code signing, Tray icon, Storage breakdown, Playtime detection | 3-5 days |
| 🔐 **Security/Ops** | 6 | Token rotation, Signature verification, Rate limiting, Metrics | 2-4 days |
| ✅ **Total** | **17** | | **~1 week of dev** |

---

## 📌 Notes

This TODO list prioritizes:
1. Completing the dashboard features marked as incomplete in the roadmap
2. Adding Windows signing support (critical for Smart App Control)
3. Improving observability so deployments run silently and reliably
4. Addressing edge cases that cause silent failures

**Start with Phase 5.5 completion** — downloading versions as ZIPs gives immediate user value while fixing incomplete UI features. Then tackle code signing for production builds.
