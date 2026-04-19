# Cloudflare Security Hardening

## Goal
- Keep patch files installable in-app.
- Reduce direct public R2 scraping.
- Keep secrets server-side only.

## Recommended Architecture
- Make patch R2 bucket private.
- Use Cloudflare Worker as download gateway:
  - `POST /api/download/authorize` to validate game/translation request.
  - Return short-lived signed URL/token.
  - `GET /api/download/file?token=...` streams the file.
- Apply rate limiting per IP.

## Worker File
- Worker template is included at:
  - `cloudflare/download-gateway-worker.js`

## Required Worker Setup
1. Bind private R2 bucket as `PRIVATE_PATCH_BUCKET`.
2. Set secret:
   - `DOWNLOAD_SIGNING_SECRET`
3. Configure manifest source:
   - `DOWNLOAD_MANIFEST_JSON` (inline), or
   - `DOWNLOAD_MANIFEST_URL` (remote JSON).
4. Optional rate limit binding:
   - KV namespace `RATE_LIMIT_KV`
   - `RATE_LIMIT_MAX_PER_MINUTE` (default `40`)
   - `TOKEN_TTL_SECONDS` (default `120`)

## Manifest Example
```json
{
  "entries": [
    {
      "gameId": "the-last-faith",
      "translationId": "the-last-faith-ar-v1",
      "assetKey": "games/the_last_faith/ar/v1/thelastfaithv1.zip"
    }
  ]
}
```

## App Configuration
- Configure app build env (`.env.local`) with:
```bash
VITE_DOWNLOAD_GATEWAY_URL="https://downloads.your-domain.com"
VITE_DOWNLOAD_GATEWAY_STRICT="true"
```

Behavior:
- `strict=true`: install fails if gateway authorization fails.
- `strict=false`: compatibility fallback to direct URL is allowed.

## Content JSON Migration
- To stop exposing direct R2 links in content JSON:
  - Use `assetKey` + `archiveFormat`.
  - For split archives, use `downloadParts[]` and provide each part in order.
  - Optionally remove `downloadUrl`.
- Helper script:
  - `npm run content:secure:prepare`

## Security Notes
- Never put Cloudflare API keys in renderer code or `public/`.
- Keep all signing logic in Worker secrets.
- If releasing publicly, use strict mode and private bucket only.
