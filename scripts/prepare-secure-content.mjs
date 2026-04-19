import fs from "node:fs/promises";
import path from "node:path";

function getExtension(downloadUrl) {
  if (typeof downloadUrl !== "string" || !downloadUrl.trim()) return "";
  try {
    const parsed = new URL(downloadUrl.trim());
    const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function toAssetKey(downloadUrl) {
  if (typeof downloadUrl !== "string" || !downloadUrl.trim()) return "";
  try {
    const parsed = new URL(downloadUrl.trim());
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

async function main() {
  const root = process.cwd();
  const inputPath = path.resolve(root, "public", "data.json");
  const outputContentPath = path.resolve(root, "cloudflare", "secure-translations.json");
  const outputManifestPath = path.resolve(root, "cloudflare", "download-manifest.json");

  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const games = Array.isArray(payload.games) ? payload.games : [];

  const entries = [];
  for (const game of games) {
    const translations = Array.isArray(game.translations) ? game.translations : [];
    for (const translation of translations) {
      const parts = Array.isArray(translation.downloadParts) ? translation.downloadParts : [];
      if (parts.length > 0) {
        for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
          const part = parts[partIndex];
          if (!part || typeof part !== "object") continue;

          const partDownloadUrl = typeof part.downloadUrl === "string" ? part.downloadUrl.trim() : "";
          const partAssetKey = (typeof part.assetKey === "string" ? part.assetKey.trim() : "") || toAssetKey(partDownloadUrl);
          const partArchiveFormat =
            (typeof part.archiveFormat === "string" ? part.archiveFormat.trim().replace(/^\./, "") : "") ||
            getExtension(partDownloadUrl);

          if (!partAssetKey) continue;

          part.assetKey = partAssetKey;
          if (partArchiveFormat) {
            part.archiveFormat = partArchiveFormat;
          }
          delete part.downloadUrl;

          entries.push({
            gameId: game.id,
            translationId: translation.id,
            assetKey: partAssetKey,
            partId: typeof part.id === "string" && part.id.trim() ? part.id.trim() : `part-${partIndex + 1}`,
          });
        }

        delete translation.downloadUrl;
        delete translation.assetKey;
        delete translation.archiveFormat;
        continue;
      }

      const downloadUrl = typeof translation.downloadUrl === "string" ? translation.downloadUrl.trim() : "";
      const assetKey = (typeof translation.assetKey === "string" ? translation.assetKey.trim() : "") || toAssetKey(downloadUrl);
      const archiveFormat =
        (typeof translation.archiveFormat === "string" ? translation.archiveFormat.trim().replace(/^\./, "") : "") ||
        getExtension(downloadUrl);

      if (!assetKey) continue;

      translation.assetKey = assetKey;
      if (archiveFormat) {
        translation.archiveFormat = archiveFormat;
      }
      delete translation.downloadUrl;

      entries.push({
        gameId: game.id,
        translationId: translation.id,
        assetKey,
      });
    }
  }

  await fs.mkdir(path.dirname(outputContentPath), { recursive: true });
  await fs.mkdir(path.dirname(outputManifestPath), { recursive: true });

  await fs.writeFile(outputContentPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(outputManifestPath, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");

  console.log(`Created secure content file: ${outputContentPath}`);
  console.log(`Created download manifest: ${outputManifestPath}`);
  console.log(`Entries: ${entries.length}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`content:secure:prepare failed: ${message}`);
  process.exit(1);
});
