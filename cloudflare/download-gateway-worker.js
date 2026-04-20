/**
 * Polar Translation - Cloudflare Download Gateway Worker
 *
 * Purpose:
 * - Serve secure app content index (`/api/content`) from private R2.
 * - Keep R2 patch bucket private.
 * - Issue short-lived signed download links.
 * - Stream files only for validated game/translation requests.
 * - Add basic per-IP rate limiting.
 *
 * Required bindings/secrets:
 * - PRIVATE_PATCH_BUCKET (R2 bucket binding)
 * - DOWNLOAD_SIGNING_SECRET (secret text)
 *
 * Optional:
 * - RATE_LIMIT_KV (KV binding for rate limiting state)
 * - RATE_LIMIT_MAX_PER_MINUTE (number, default 40)
 * - TOKEN_TTL_SECONDS (number, default 120)
 * - CONTENT_INDEX_KEY (object key in PRIVATE_PATCH_BUCKET, default "secure-translations.json")
 * - DOWNLOAD_MANIFEST_OBJECT_KEY (object key in PRIVATE_PATCH_BUCKET)
 * - DOWNLOAD_MANIFEST_JSON (JSON string)
 * - DOWNLOAD_MANIFEST_URL (URL that returns JSON manifest)
 *
 * Manifest shape:
 * {
 *   "entries": [
 *     { "gameId": "the-last-faith", "translationId": "the-last-faith-ar-v1", "assetKey": "games/the_last_faith/ar/v1/thelastfaithv1.zip" }
 *   ]
 * }
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const AUTH_PATH = "/api/download/authorize";
const FILE_PATH = "/api/download/file";
const CONTENT_PATH = "/api/content";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === AUTH_PATH && request.method === "POST") {
      return handleAuthorize(request, env, ctx);
    }

    if (url.pathname === FILE_PATH && request.method === "GET") {
      return handleFile(request, env);
    }

    if (url.pathname === CONTENT_PATH && request.method === "GET") {
      return handleContent(env);
    }

    return json(
      {
        ok: false,
        error: "Not found",
      },
      404
    );
  },
};

async function handleAuthorize(request, env, ctx) {
  if (!env.DOWNLOAD_SIGNING_SECRET) {
    return json({ ok: false, error: "Gateway signing secret is missing." }, 500);
  }
  if (!env.PRIVATE_PATCH_BUCKET) {
    return json({ ok: false, error: "Private patch bucket binding is missing." }, 500);
  }

  const clientIp =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const allowed = await enforceRateLimit(clientIp, env, ctx);
  if (!allowed) {
    return json({ ok: false, error: "Too many requests. Please retry shortly." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  const gameId = typeof body?.gameId === "string" ? body.gameId.trim() : "";
  const translationId = typeof body?.translationId === "string" ? body.translationId.trim() : "";
  const requestedAssetKey = typeof body?.assetKey === "string" ? body.assetKey.trim() : "";
  if (!gameId || !translationId) {
    return json({ ok: false, error: "gameId and translationId are required." }, 400);
  }

  const manifest = await loadManifest(env);
  const entry = resolveManifestEntry(manifest, gameId, translationId, requestedAssetKey);
  if (!entry) {
    return json({ ok: false, error: "Translation entry is not authorized." }, 403);
  }

  const tokenTtl = safePositiveInt(env.TOKEN_TTL_SECONDS, 120);
  const expiresAt = Math.floor(Date.now() / 1000) + tokenTtl;
  const tokenPayload = {
    key: entry.assetKey,
    gameId,
    translationId,
    exp: expiresAt,
  };

  const token = await signToken(tokenPayload, env.DOWNLOAD_SIGNING_SECRET);
  const responseUrl = new URL(FILE_PATH, request.url);
  responseUrl.searchParams.set("token", token);

  return json(
    {
      ok: true,
      downloadUrl: responseUrl.toString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    },
    200
  );
}

async function handleContent(env) {
  if (!env.PRIVATE_PATCH_BUCKET) {
    return json({ ok: false, error: "Private patch bucket binding is missing." }, 500);
  }

  const contentKey =
    typeof env.CONTENT_INDEX_KEY === "string" && env.CONTENT_INDEX_KEY.trim()
      ? env.CONTENT_INDEX_KEY.trim()
      : "secure-translations.json";

  const object = await env.PRIVATE_PATCH_BUCKET.get(contentKey);
  if (!object) {
    return json({ ok: false, error: "Content index file not found." }, 404);
  }

  const payload = await object.text();
  let parsed;
  try {
    parsed = safeParseJson(payload);
  } catch {
    return json({ ok: false, error: "Content index is not valid JSON." }, 500);
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
      "x-content-type-options": "nosniff",
    },
  });
}

async function handleFile(request, env) {
  if (!env.DOWNLOAD_SIGNING_SECRET) {
    return json({ ok: false, error: "Gateway signing secret is missing." }, 500);
  }
  if (!env.PRIVATE_PATCH_BUCKET) {
    return json({ ok: false, error: "Private patch bucket binding is missing." }, 500);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  if (!token) {
    return json({ ok: false, error: "Missing token." }, 400);
  }

  let payload;
  try {
    payload = await verifyToken(token, env.DOWNLOAD_SIGNING_SECRET);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: `Invalid token: ${reason}` }, 403);
  }

  if (!payload?.key || typeof payload.key !== "string") {
    return json({ ok: false, error: "Token payload is missing asset key." }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return json({ ok: false, error: "Token has expired." }, 403);
  }

  const object = await env.PRIVATE_PATCH_BUCKET.get(payload.key);
  if (!object) {
    return json({ ok: false, error: "Patch file not found." }, 404);
  }

  const fileName = payload.key.split("/").pop() || "patch.bin";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", `attachment; filename="${fileName}"`);
  headers.set("content-type", headers.get("content-type") || "application/octet-stream");

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

async function enforceRateLimit(clientIp, env, ctx) {
  if (!env.RATE_LIMIT_KV || !clientIp || clientIp === "unknown") {
    return true;
  }

  const windowSeconds = 60;
  const maxPerWindow = safePositiveInt(env.RATE_LIMIT_MAX_PER_MINUTE, 40);
  const currentWindow = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${clientIp}:${currentWindow}`;

  let count = 0;
  try {
    const current = await env.RATE_LIMIT_KV.get(key);
    count = Number(current || 0);
    if (count >= maxPerWindow) {
      return false;
    }
  } catch {
    return true;
  }

  const nextCount = count + 1;
  ctx.waitUntil(
    env.RATE_LIMIT_KV.put(key, String(nextCount), {
      expirationTtl: windowSeconds + 10,
    })
  );
  return true;
}

async function loadManifest(env) {
  if (env.DOWNLOAD_MANIFEST_OBJECT_KEY) {
    if (!env.PRIVATE_PATCH_BUCKET) {
      throw new Error("PRIVATE_PATCH_BUCKET binding is required for object-key manifest source.");
    }

    const key = String(env.DOWNLOAD_MANIFEST_OBJECT_KEY).trim();
    const object = await env.PRIVATE_PATCH_BUCKET.get(key);
    if (!object) {
      throw new Error(`Manifest object not found: ${key}`);
    }
    const raw = await object.text();
    return safeParseJson(raw);
  }

  if (env.DOWNLOAD_MANIFEST_JSON) {
    return safeParseJson(env.DOWNLOAD_MANIFEST_JSON);
  }

  if (env.DOWNLOAD_MANIFEST_URL) {
    const response = await fetch(env.DOWNLOAD_MANIFEST_URL, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    if (!response.ok) {
      throw new Error(`Manifest request failed (HTTP ${response.status})`);
    }
    return await response.json();
  }

  throw new Error("No manifest source configured.");
}

function resolveManifestEntry(manifest, gameId, translationId, requestedAssetKey) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryGameId = typeof entry.gameId === "string" ? entry.gameId.trim() : "";
    const entryTranslationId = typeof entry.translationId === "string" ? entry.translationId.trim() : "";
    const entryAssetKey = typeof entry.assetKey === "string" ? entry.assetKey.trim() : "";
    if (!entryGameId || !entryTranslationId || !entryAssetKey) continue;
    if (entryGameId !== gameId || entryTranslationId !== translationId) continue;
    if (requestedAssetKey && requestedAssetKey !== entryAssetKey) continue;
    return {
      gameId: entryGameId,
      translationId: entryTranslationId,
      assetKey: entryAssetKey,
    };
  }
  return null;
}

async function signToken(payload, secret) {
  const payloadBase = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256(payloadBase, secret);
  return `${payloadBase}.${signature}`;
}

async function verifyToken(token, secret) {
  const [payloadBase, signature] = token.split(".");
  if (!payloadBase || !signature) {
    throw new Error("Malformed token.");
  }

  const expected = await hmacSha256(payloadBase, secret);
  if (expected !== signature) {
    throw new Error("Signature mismatch.");
  }

  const payloadJson = decoder.decode(base64UrlDecode(payloadBase));
  return safeParseJson(payloadJson);
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes) {
  const base = btoa(String.fromCharCode(...bytes));
  return base.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4 || 4)) % 4;
  const base = padded + "=".repeat(padLength);
  const binary = atob(base);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeParseJson(raw) {
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw);
}

function safePositiveInt(rawValue, fallback) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
