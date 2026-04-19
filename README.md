# Polar Translation Manager

Production-ready Electron desktop app for managing Arabic game translation patches.

## Stack
- `Electron` desktop shell
- `React + Vite + TypeScript` renderer
- `JSZip` patch extraction
- `Cloudflare R2` remote content source
- `electron-updater` for app self-updates from GitHub Releases

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create `.env.local` from `.env.example` and set your URLs.
3. Run in development:
```bash
npm run dev
```
4. Run Electron shell:
```bash
npm run electron:dev
```

## Production Build
- Build renderer only:
```bash
npm run build
```
- Build official Windows installer (NSIS EXE):
```bash
npm run build:desktop
```
- Full release pipeline (clean + typecheck + package):
```bash
npm run build:release
```

Release artifacts are generated in `dist_electron/`.

## Cloudflare Content System
The app fetches remote content on startup from `VITE_REMOTE_JSON_URL` and caches it locally.

Behavior:
- Try remote Cloudflare JSON first
- If unavailable/invalid, use cached content
- If cache missing, use bundled `public/data.json`
- Startup refresh checks remote content every launch
- Manual refresh button re-checks Cloudflare on demand

### Secure Download Gateway (Recommended)
For production hardening:
- Keep R2 patch bucket private
- Use Cloudflare Worker download gateway for short-lived authorized links
- Enable strict mode in app build:
```bash
VITE_DOWNLOAD_GATEWAY_URL="https://downloads.your-domain.com"
VITE_DOWNLOAD_GATEWAY_STRICT="true"
```

Docs and worker template:
- `docs/cloudflare-security.md`
- `cloudflare/download-gateway-worker.js`

## App Self-Update
Packaged Windows builds check GitHub Releases on startup:
- checks for newer app version
- downloads update automatically when available
- installs on restart (`Restart & Install` in-app)
- preserves user data under app data folder

### Remote JSON Contract (minimum)
```json
{
  "contentVersion": "2026.04.17.1",
  "lastUpdated": "2026-04-17T17:11:43Z",
  "categories": ["Action", "Adventure", "RPG"],
  "games": [
    {
      "id": "the-last-faith",
      "title": "The Last Faith",
      "category": "Adventure",
      "rating": 4.2,
      "description": "....",
      "bannerImage": "https://...",
      "thumbnailImage": "https://...",
      "executable": "TheLastFaith.exe",
      "translations": [
        {
          "id": "the-last-faith-ar-v1",
          "name": "Arabic Translation Pack",
          "version": "1.0.0",
          "type": "community",
          "description": "....",
          "releaseDate": "2026-04-17",
          "downloadUrl": "https://...", 
          "assetKey": "games/the_last_faith/ar/v1/thelastfaithv1.zip",
          "archiveFormat": "zip",
          "changelog": ["Initial release"],
          "size": "32.9 MB",
          "author": "Polaris Team"
        }
      ]
    }
  ]
}
```

## Content vs App Updates
- `Content updates` (games/translations/images/metadata): update Cloudflare JSON/files only. No app reinstall needed.
- `App updates` (code/features/fixes): publish a new GitHub release binary.

## TLOU Special Flow
Only `The Last of Us Part I` uses custom installer behavior:
- uses selected game root path
- resolves `build\pc\main\core.psarc`
- runs `TLOU PSARC Tool.exe` automation
- copies `fonts` + `text2`
- removes `core.psarc`

All other games use the normal ZIP patch install flow.

## GitHub Release Publishing
1. Update version:
```bash
npm version patch
```
2. Push commit + tag:
```bash
git push && git push --tags
```
3. GitHub Actions workflow `release.yml` builds Windows artifacts and attaches them to the release.

## Commands
- `npm run icons:generate` - Regenerate Windows `.ico` files from PNG sizes
- `npm run lint` - TypeScript type check
- `npm run validate:content` - Validate bundled `public/data.json`
- `npm run sync:cloudflare-content` - Pull latest `translations.json` from Cloudflare into `public/data.json`
- `npm run content:secure:prepare` - Generate secure content + manifest (`assetKey` based, no direct URLs)
- `npm run verify:existing-user-update` - Simulate installed-user Cloudflare content update flow
- `npm run build` - Production renderer build
- `npm run build:desktop` - Build official installer EXE only
- `npm run build:release` - Clean + lint + package
