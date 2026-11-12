# MyDiary Changelog & Releases

Every release of **MyDiary** is published on [GitHub Releases](https://github.com/kaushalboii/MyDiary/releases) with source archives (`Source code (zip)` and `Source code (tar.gz)`), a full changelog, and version tags (`v1`–`v13`, plus automatic sequential `vN` releases for every future push to `main`).

---

## How to Download & Work on Any Previous Version

### Option A — Download ZIP directly from GitHub Releases
1. Open [MyDiary Releases](https://github.com/kaushalboii/MyDiary/releases).
2. Scroll to the version you want (e.g., `v7`, `v10`, `v12`).
3. Under **Assets**, download **`Source code (zip)`** (or **`Source code (tar.gz)`**).
4. Extract it and run locally:
   ```bash
   npm install
   npm --prefix storage-server install
   npm run dev:all
   ```
   Open `http://127.0.0.1:5203` in your browser.

### Option B — Switch or Branch from Git
```bash
git fetch --tags

# Inspect or run a previous version without leaving main
git worktree add ../MyDiary-v7 v7

# Or start a working branch based on a previous release
git checkout -b work-from-v11 v11
```

---

## Release History

### `v14` — Security Audit Hardening, Upload Retention, Flush Cover Opening, Verlet Rope & Full Docs
- **Image & Draft Retention:** Fixed `cleanupOrphanedUploads` in `storage-server/server.mjs` so uploaded photos referenced via `url` are never deleted during edits even if `filename` metadata is omitted; improved legacy owner file recovery (`migrateLegacyDataToOwner` + `/uploads` fallback recovery); added one-click **Restore to Archive** banner in `/book` for cached IndexedDB drafts; surfaced `4xx` validation errors (`StorageClientError`) instead of silently falling back offline.
- **Zero-Leak Frontend & Security Hardening:** Updated `.github/workflows/deploy.yml` so public GitHub Pages builds bake `NEXT_PUBLIC_STORAGE_URL=""` (no backend endpoints, no unauthenticated backend calls, only starter template volumes live publicly); moved tokens & book caches exclusively into `sessionStorage`; rejected proxied forwarding headers (`X-Forwarded-For`, etc.) from `isLoopbackReq`; defaulted `ALLOW_ACCESS_REQUESTS=false`; added scrypt password length cap, per-IP+username auth rate limiting, `/api/sync` field allowlisting, base64 decoded byte cap, and `Cache-Control: no-store, private` on API responses; removed personal placeholders and unused manifest files.
- **Flush 3D Cover Opening (`FlipBookReader`):** Aligned `[data-testid="flipbook-cover-opening"]` pixel-for-pixel with the outer `.flipbook-hardcover-frame` padding (`--flip-pad`), removed `duration-75` transform lag, and synchronized `leftBoardReveal` past vertical `-90deg`.
- **Free-Swinging Verlet Rope (`ThemeToggle`):** Rewrote the hanging dark/light switch with a 6-node Verlet pendulum + pointer brush impulse + 360° free drag/throw simulation.
- **Documentation & Showcase (`README.md`):** Added professional developer/AI architecture guide with verified desktop & mobile light/dark screenshots (`docs/screenshots/`).

### `v13` — Automatic Release Versioning & Full Changelog
- Updated [`.github/workflows/release.yml`](.github/workflows/release.yml) so **every push to `main`** automatically creates the next sequential `vN` tag and publishes a GitHub Release with commit notes, changed files, compare link, and download instructions whenever a manual tag isn't already attached to `HEAD`.
- Added this [`CHANGELOG.md`](CHANGELOG.md) summarizing all releases (`v1`–`v13`) and explaining how to download and work on any version locally.

### `v12` — Top-Left Home Navigation, Optional Memory Fields, Freeform Spread Layout & Studio Open-Page Preview
- Made clicking **MY DIARY** in the top-left header navigate back to `/` from `/book`, `/compose`, and `/memory` (and exit inspect mode back to shelf browsing on `/`).
- Removed the required-title gate across composer & server APIs so images-only, words-only, note-only, or mixed memories save cleanly without empty placeholders.
- Added freeform drag-and-drop and resizable open-book spread layout (`FreeformPageBlocks`, `memory-layout.ts`, persistent `layoutBlocks`) in both `/book` (**Arrange**) and `/compose` (**05 · Open Book Page Placement**).
- Upgraded Book Studio (`VolumeEditorModal`) with a 3-mode miniature preview (**Cover & Spine**, **Open Book Pages**, **Back Cover**) plus expanded page customization (`paperStyle`, `pageTint`, `pageInk`, `pageAccent`, `pageNumberStyle`, `pageHeaderStyle`).

### `v11` — Multi-User Login & Isolation, Zero-Leak Security, Smooth Opening & Braided Pull Rope
- Added multi-user authentication, invite keys, and per-user isolated storage directories (`users` & invite/session management in `storage-server/server.mjs`, `VaultLockGate`, `StorageSettingsModal`, `storage-client.ts`).
- Removed exposed backend hostnames, URLs, and server disk telemetry from public UI and workflow outputs.
- Fixed the brief start frame stall in `FlipBookReader` real-time cover opening and upgraded the theme toggle to a taller, tactile braided hanging pull-rope (`ThemeToggle`).

### `v10` — Real-Time Full-Book Opening, Compact Menu Dock & Owner Vault Security
- Replaced the interim cover reveal with real-time 3D-matched full-book opening directly inside `FlipBookReader`.
- Unified floating header buttons into a compact collapsible **Menu** dock (`ExpandableDock`) and portaled modals cleanly to `document.body`.
- Added client passphrase **Browser Vault Lock** (`VaultLockGate`, `vault-security.ts`) and token-authenticated storage protection.

### `v9` — Animated Book Reveal, Hanging Pull-Rope Switch & Unique Curated Covers
- Introduced animated book reveal transition (`BookOpeningReveal`), hanging pull-rope Light/Dark toggle (`ThemeToggle`), unified top dock, and expanded non-repeating front/spine artwork across `cover-art.ts` and `BookMotifPreview`.

### `v8` — Performance Optimization & Release Workflow Foundation
- Optimized LCP, Total Blocking Time, variable font preloading, WebGL startup responsiveness (`ShelfEngine.ts`), and mobile/desktop touch-target sizing.
- Added initial GitHub Releases automation workflow (`.github/workflows/release.yml`).

### `v7` — Light & Soft Minimal Palette (`#7`–`#19`) & Top-of-Studio Color Picker
- Upgraded volumes `#7`–`#19` to bright Light & Soft Minimal palettes (`19` unique covers and accents) while preserving `#1`–`#6`.
- Added top-of-tab **Color Studio** in `VolumeEditorModal` (`LIGHT & SOFT`, `BOLD & RICH`, `ALL 24`, **TRY NEXT**, **SWAP**, custom `#HEX` pickers, auto contrast) and safer default snapshot migration.

### `v6` — Legacy Migration Fix, Zero-Flash Cache Hydration & Favicon
- Expanded `LEGACY_COVER_HEXES` upgrades, synchronized cached server book hydration before first render to remove stale cover flashes, and added layered-book favicons (`icon.svg`, `icon.png`, `apple-icon.png`, `favicon.ico`).

### `v5` — Theme-Invariant Book Colors & 19 Unique Tri-Color Covers
- Decoupled book cloth colors from Light/Dark polarity and added tri-color `secondary` band support across 3D textures (`cover-art.ts`) and 2D studio previews.

### `v4` — FlipBook Page-Size Invariance & Light/Dark Theme
- Fixed `FlipBookReader` page sizing across all page turns on desktop and mobile and added persistent Light/Dark theme switching (`ThemeToggle`).

### `v3` — 19-Volume Archive Shelf & UI Polish
- Restored all 19 soft minimal archive volumes on a unified single-row shelf and refined focus transitions, flipbook alignment, and Book Studio controls.

### `v2` — Natural Page Flipping, Blank Welcome Books & Studio Customization
- Added natural multi-page `FlipBookReader`, blank welcome spreads, thin pocket book sizing, and expanded `VolumeEditorModal` templates, spine styles, trim sizes, and slot ordering.

### `v1` — Core 3D Shelf, Mini-Server Storage & Open-Book Reader
- Initial release with the Three.js 3D bookshelf (`ShelfEngine`), cover generators, open-book reader (`/book`), memory composer (`/compose`), memory spread viewer (`/memory`), and private storage server (`storage-server/server.mjs`).

