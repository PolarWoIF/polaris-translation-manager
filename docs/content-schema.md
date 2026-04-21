# Remote Content Schema

Use this schema in your Cloudflare `translations.json` so the app can auto-populate games without a binary update.

## Root
- `contentVersion` (string, recommended)
- `lastUpdated` (ISO string)
- `categories` (string[])
- `games` (Game[])

## Game
- `id` (string, unique)
- `title` (string)
- `category` (string)
- `rating` (number, `0` to `5`)
- `description` (string)
- `bannerImage` (http/https URL or `/assets/...`)
- `thumbnailImage` (http/https URL or `/assets/...`)
- `executable` (string, optional)
- `translations` (Translation[], at least 1)

## Translation
- `id` (string, unique per game)
- `name` (string)
- `version` (string)
- `type` (`official` | `community` | `legacy`)
- `description` (string)
- `releaseDate` (ISO date)
- `downloadUrl` (http/https URL, optional when `assetKey` or `downloadParts` is provided)
- `assetKey` (string, optional)
- `archiveFormat` (string, optional: `zip`, `7z`, `rar`, `exe`, ...)
- `downloadParts` (array, optional multi-part downloads)
- `changelog` (string[])
- `size` (string)
- `author` (string)

## Installer Behavior
- Archive formats (`zip`, `7z`, `rar`, etc.) are extracted, then files are copied into the selected game root.
- `exe` format is treated as an installer payload:
  - The `.exe` is copied into the selected game root.
  - The app runs that executable automatically.
- This behavior is data-driven from JSON only (no UI hardcoding per game).
