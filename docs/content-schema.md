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
- `downloadUrl` (http/https URL)
- `changelog` (string[])
- `size` (string)
- `author` (string)
