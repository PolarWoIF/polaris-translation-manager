# Changelog

All notable changes to this project will be documented in this file.

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
