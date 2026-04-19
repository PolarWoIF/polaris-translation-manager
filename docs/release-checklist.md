# Release Checklist

## Before Tagging
1. Update `public/data.json` baseline (optional but recommended).
2. Run:
```bash
npm install
npm run lint
npm run validate:content
npm run build:release
```
3. Smoke-test installer from `dist_electron/`.

## Publish
1. Bump version:
```bash
npm version patch
```
2. Push commit and tag:
```bash
git push
git push --tags
```
3. Wait for `Release Windows Build` workflow to finish.
4. Verify attached installer EXE in GitHub Release.
5. Keep release assets clean: setup EXE + updater metadata (`latest.yml` + blockmap).

## Content-Only Updates (No App Rebuild)
1. Upload new game assets + patch files to private Cloudflare R2 bucket.
2. Update remote `translations.json` (prefer `assetKey` + `archiveFormat`).
3. Increase `contentVersion` (or `lastUpdated`) in remote JSON.
4. Users receive updates automatically on app startup or manual refresh.
5. If secure gateway is enabled, update gateway manifest entries for new translations.

### Optional Local Baseline Sync
1. Run `npm run sync:cloudflare-content` to mirror Cloudflare content into `public/data.json`.
2. Run `npm run validate:content` before committing.

### Optional Secure Content Prep
1. Run `npm run content:secure:prepare`.
2. Upload generated `cloudflare/secure-translations.json` and `cloudflare/download-manifest.json`.
