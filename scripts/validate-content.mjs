#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const defaultPath = path.resolve(process.cwd(), "public/data.json");
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isLikelyUrlOrPath(value) {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function fail(errors) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

async function main() {
  let rawText;
  try {
    rawText = await fs.readFile(inputPath, "utf8");
  } catch (error) {
    console.error(`Unable to read content file: ${inputPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    console.error(`Invalid JSON in ${inputPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== "object") {
    errors.push("Root JSON value must be an object.");
  }

  const games = Array.isArray(payload?.games) ? payload.games : null;
  if (!games) {
    errors.push("`games` must be an array.");
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  if (games.length === 0) {
    errors.push("`games` array is empty.");
  }

  const gameIds = new Set();
  const gameTitles = new Set();

  for (let index = 0; index < games.length; index += 1) {
    const game = games[index];
    const label = `games[${index}]`;

    if (!game || typeof game !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }

    const gameId = game.id;
    const title = game.title;

    if (!isNonEmptyString(gameId)) {
      errors.push(`${label}.id is required.`);
    } else if (gameIds.has(gameId.trim().toLowerCase())) {
      errors.push(`${label}.id is duplicated: ${gameId}`);
    } else {
      gameIds.add(gameId.trim().toLowerCase());
    }

    if (!isNonEmptyString(title)) {
      errors.push(`${label}.title is required.`);
    } else if (gameTitles.has(title.trim().toLowerCase())) {
      warnings.push(`${label}.title appears duplicated: ${title}`);
    } else {
      gameTitles.add(title.trim().toLowerCase());
    }

    if (!isNonEmptyString(game.category)) {
      errors.push(`${label}.category is required.`);
    }

    if (typeof game.rating !== "number" || Number.isNaN(game.rating) || game.rating < 0 || game.rating > 5) {
      errors.push(`${label}.rating must be a number between 0 and 5.`);
    }

    if (!isNonEmptyString(game.description)) {
      warnings.push(`${label}.description is empty.`);
    }

    if (!isLikelyUrlOrPath(game.bannerImage)) {
      errors.push(`${label}.bannerImage must be a valid URL/path.`);
    }

    if (!isLikelyUrlOrPath(game.thumbnailImage)) {
      errors.push(`${label}.thumbnailImage must be a valid URL/path.`);
    }

    if (!Array.isArray(game.translations) || game.translations.length === 0) {
      errors.push(`${label}.translations must be a non-empty array.`);
      continue;
    }

    const translationIds = new Set();
    for (let tIndex = 0; tIndex < game.translations.length; tIndex += 1) {
      const translation = game.translations[tIndex];
      const tLabel = `${label}.translations[${tIndex}]`;

      if (!translation || typeof translation !== "object") {
        errors.push(`${tLabel} must be an object.`);
        continue;
      }

      if (!isNonEmptyString(translation.id)) {
        errors.push(`${tLabel}.id is required.`);
      } else {
        const tid = translation.id.trim().toLowerCase();
        if (translationIds.has(tid)) {
          errors.push(`${tLabel}.id is duplicated in the same game: ${translation.id}`);
        }
        translationIds.add(tid);
      }

      if (!isNonEmptyString(translation.name)) {
        errors.push(`${tLabel}.name is required.`);
      }

      const hasDownloadUrl = isLikelyUrlOrPath(translation.downloadUrl);
      const hasAssetKey = isNonEmptyString(translation.assetKey);

      if (!hasDownloadUrl && !hasAssetKey) {
        errors.push(`${tLabel} must include either downloadUrl or assetKey.`);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn("Validation warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("Validation errors:");
    fail(errors);
    return;
  }

  console.log(`Content validation passed (${games.length} games): ${inputPath}`);
}

await main();
