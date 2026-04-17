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
4. Verify attached installer/portable files in GitHub Release.

## Content-Only Updates (No App Rebuild)
1. Upload new game assets + patch files to Cloudflare R2.
2. Update remote `translations.json`.
3. Increase `contentVersion` (or `lastUpdated`) in remote JSON.
4. Users receive updates automatically on app startup or manual refresh.
