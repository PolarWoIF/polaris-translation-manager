import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_REMOTE_JSON_URL =
  "https://polar-download-gateway.mdmrksad1ksa.workers.dev/api/content";

function assertRemotePayloadUsable(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Remote payload is not a JSON object.");
  }

  const games = Array.isArray(payload.games) ? payload.games : [];
  if (games.length === 0) {
    throw new Error("Remote payload has no games.");
  }
}

async function main() {
  const remoteBaseUrl = process.env.REMOTE_JSON_URL?.trim() || DEFAULT_REMOTE_JSON_URL;
  const remoteUrl = new URL(remoteBaseUrl);
  remoteUrl.searchParams.set("_ts", Date.now().toString());

  const response = await fetch(remoteUrl, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare request failed (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  assertRemotePayloadUsable(payload);

  const outputPath = path.resolve(process.cwd(), "public", "data.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const gameCount = Array.isArray(payload.games) ? payload.games.length : 0;
  const contentVersion = payload.contentVersion || payload.lastUpdated || "unknown";

  console.log(`Synced Cloudflare content to public/data.json`);
  console.log(`Version: ${contentVersion}`);
  console.log(`Games: ${gameCount}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync:cloudflare-content failed: ${message}`);
  process.exit(1);
});
