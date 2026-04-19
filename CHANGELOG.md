# Changelog

All notable changes to this project will be documented in this file.

## [1.0.6] - 2026-04-19

### Added
- Added support for multi-part translation downloads via `downloadParts[]` (sequential download/apply order).

### Changed
- Installer now processes patch parts in order (Part 1 -> Part 2 -> ...), then applies files safely to the game folder.
- Content normalizer/validator now accepts translation records that use `downloadParts` with `downloadUrl` or `assetKey` per part.
- Secure content preparation script now converts `downloadParts` entries to secure `assetKey` format and manifest entries.

### Fixed
- Firewatch-style split archives are now supported by app logic when remote JSON provides two parts.

## [1.0.5] - 2026-04-19

### Added
- Added optional secure Cloudflare download gateway support with short-lived authorization flow (`VITE_DOWNLOAD_GATEWAY_URL`).
- Added strict gateway mode (`VITE_DOWNLOAD_GATEWAY_STRICT`) to block fallback direct downloads in hardened deployments.
- Added Cloudflare Worker template for protected patch delivery at `cloudflare/download-gateway-worker.js`.
- Added secure content preparation script: `npm run content:secure:prepare` (outputs `assetKey` manifest-based content).
- Added documentation for security deployment and gateway rollout in `docs/cloudflare-security.md`.

### Changed
- Installer now resolves patch downloads through gateway when configured, while preserving existing install UX.
- Translation schema now supports `assetKey` and `archiveFormat` (in addition to `downloadUrl`) for private bucket architecture.
- Release packaging now produces official installer EXE only (plus updater metadata), removing portable/zip release outputs.
- Production renderer build hardened with terser minification, no sourcemaps, and dropped debug console output.
- Branding consistency improved by shipping a dedicated runtime icon resource for packaged builds.

### Fixed
- Validation now accepts secure manifest-based entries (`assetKey`) so content updates remain compatible in protected mode.

## [1.0.4] - 2026-04-18

### Fixed
- Updated Sekiro translation entry to the newly uploaded ZIP package.
- Hardened non-ZIP extraction flow with multiple 7z binary fallbacks to avoid installer failures on `.rar` / `.7z` archives.
- Improved archive extraction error reporting so failures no longer appear as ZIP-only parser errors for non-ZIP packages.

## [1.0.3] - 2026-04-18

### Added
- Added Cloudflare content cards for `Firewatch` and `Mouthwashing`.
- Updated Sekiro translation source to the newly uploaded archive.

### Changed
- Installer now supports extracting archives via 7z engine for non-zip formats (`.rar`, `.7z`, and other 7z-supported formats).
- Normal game install flow now handles mixed archive formats without requiring ZIP-only uploads.

## [1.0.2] - 2026-04-18

### Added
- Added new Cloudflare-driven game card and translation package for `Haunted Room : 205`.

### Changed
- Updated Windows executable metadata to `Polar Translation` (process/app identity branding).
- Updated NSIS installer desktop shortcut behavior to explicitly offer shortcut creation during setup.
- Refreshed production build artifacts to include latest branding and content updates.

## [1.0.0] - 2026-04-17

### Added
- Production Windows packaging (NSIS installer + portable EXE).
- CI and release GitHub Actions workflows.
- Dynamic Cloudflare startup sync with local cache fallback.
- Manual content refresh in-app.
- App update check plumbing (remote manifest / GitHub API fallback).
- Bundled content validation script for release quality checks.

### Changed
- Release scripts and metadata for public distribution.
- Remote content configuration moved to environment-based build defines.
- Improved remote content normalization, deduplication, and safety checks.

### Fixed
- Improved handling for content-load failure states with retry UI.
