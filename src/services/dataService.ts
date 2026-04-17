import { AppData, Game, Translation } from "../types";
import {
  CACHE_KEY,
  CACHE_SCHEMA_VERSION,
  REMOTE_FETCH_TIMEOUT_MS,
  REMOTE_JSON_URL,
} from "../constants";

export type ContentSource = "remote" | "cache" | "bundled";

export interface ContentLoadResult {
  data: AppData;
  source: ContentSource;
  contentVersion: string;
  syncedAt: string;
  warning?: string;
}

interface FetchDataOptions {
  forceRemote?: boolean;
}

interface CachedEnvelope {
  schemaVersion: number;
  cachedAt: string;
  sourceUrl: string;
  contentVersion: string;
  data: AppData;
}

const DEFAULT_GAME_IMAGE = "/assets/red-set/windows/icon-256x256.png";

interface NodeRuntime {
  http: typeof import("node:http");
  https: typeof import("node:https");
}

function getNodeRuntime(): NodeRuntime | null {
  if (typeof window === "undefined") return null;
  const windowWithRequire = window as typeof window & {
    require?: (name: string) => unknown;
  };

  if (typeof windowWithRequire.require !== "function") return null;

  try {
    return {
      http: windowWithRequire.require("node:http") as typeof import("node:http"),
      https: windowWithRequire.require("node:https") as typeof import("node:https"),
    };
  } catch {
    return null;
  }
}

function getStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best effort caching only.
  }
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isLikelyImagePath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  if (value.startsWith("data:image/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function assertAppDataUsable(data: AppData, source: string) {
  if (data.games.length === 0) {
    throw new Error(`${source} returned no valid games.`);
  }
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeTranslation(raw: unknown, index: number): Translation | null {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!source) return null;

  const name = normalizeString(source.name, `Arabic Patch ${index + 1}`);
  const derivedId = slugify(name) || `translation-${index + 1}`;
  const id = normalizeString(source.id, derivedId) || derivedId;
  const typeValue = normalizeString(source.type, "community").toLowerCase();
  const type: Translation["type"] =
    typeValue === "official" || typeValue === "legacy" ? typeValue : "community";

  const downloadUrl = normalizeString(source.downloadUrl);
  if (!downloadUrl) return null;

  const changelogRaw = Array.isArray(source.changelog) ? source.changelog : [];
  const changelog = changelogRaw
    .map((entry) => normalizeString(entry))
    .filter((entry) => entry.length > 0);

  const releaseDateRaw = normalizeString(source.releaseDate);
  const releaseDate = isValidIsoDate(releaseDateRaw)
    ? releaseDateRaw
    : new Date().toISOString().slice(0, 10);

  return {
    id,
    name,
    version: normalizeString(source.version, "1.0.0"),
    type,
    description: normalizeString(source.description, `${name} translation package.`),
    releaseDate,
    downloadUrl,
    changelog,
    size: normalizeString(source.size, "Unknown"),
    author: normalizeString(source.author, "Polar Team"),
  };
}

function normalizeGame(raw: unknown, index: number): Game | null {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!source) return null;

  const title = normalizeString(source.title, `Game ${index + 1}`);
  const derivedId = slugify(title) || `game-${index + 1}`;
  const id = normalizeString(source.id, derivedId) || derivedId;
  const category = normalizeString(source.category, "Action");

  const ratingRaw = normalizeNumber(source.rating, 0);
  const rating = Math.max(0, Math.min(5, Math.round(ratingRaw * 10) / 10));

  const requestedBannerImage = normalizeString(source.bannerImage);
  const bannerImage = isLikelyImagePath(requestedBannerImage) ? requestedBannerImage : DEFAULT_GAME_IMAGE;

  const requestedThumbnailImage = normalizeString(source.thumbnailImage);
  const thumbnailImage = isLikelyImagePath(requestedThumbnailImage)
    ? requestedThumbnailImage
    : bannerImage || DEFAULT_GAME_IMAGE;

  const translationsRaw = Array.isArray(source.translations) ? source.translations : [];
  const translationIds = new Set<string>();
  const translations = translationsRaw
    .map((entry, translationIndex) => normalizeTranslation(entry, translationIndex))
    .filter((entry): entry is Translation => Boolean(entry))
    .filter((entry) => {
      if (translationIds.has(entry.id)) return false;
      translationIds.add(entry.id);
      return true;
    });

  if (translations.length === 0) {
    return null;
  }

  return {
    id,
    title,
    category,
    rating,
    description: normalizeString(
      source.description,
      `Experience ${title} with professional Arabic localization and cultural precision.`
    ),
    bannerImage,
    thumbnailImage,
    executable: normalizeString(source.executable, ""),
    translations,
  };
}

function normalizeAppData(raw: unknown): AppData {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawGames = Array.isArray(source.games) ? source.games : [];
  const seenGameIds = new Set<string>();
  const seenGameTitles = new Set<string>();

  const games = rawGames
    .map((entry, index) => normalizeGame(entry, index))
    .filter((entry): entry is Game => Boolean(entry))
    .filter((entry) => {
      const titleKey = slugify(entry.title);
      if (seenGameIds.has(entry.id) || (titleKey && seenGameTitles.has(titleKey))) return false;
      seenGameIds.add(entry.id);
      if (titleKey) seenGameTitles.add(titleKey);
      return true;
    });

  const explicitCategories = Array.isArray(source.categories)
    ? source.categories.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  const discoveredCategories = games.map((game) => game.category).filter(Boolean);
  const categories = dedupePreserveOrder([...explicitCategories, ...discoveredCategories]);

  const lastUpdatedRaw = normalizeString(source.lastUpdated);
  const lastUpdated = isValidIsoDate(lastUpdatedRaw)
    ? lastUpdatedRaw
    : new Date().toISOString();

  const contentVersionRaw = normalizeString(source.contentVersion);
  const contentVersion = contentVersionRaw || lastUpdated;

  return {
    games,
    lastUpdated,
    categories,
    contentVersion,
  };
}

function parseCachedEnvelope(rawValue: string | null): CachedEnvelope | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as CachedEnvelope;
    if (
      !parsed ||
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION ||
      typeof parsed.cachedAt !== "string" ||
      typeof parsed.contentVersion !== "string" ||
      typeof parsed.sourceUrl !== "string" ||
      !parsed.data
    ) {
      return null;
    }

    return {
      schemaVersion: parsed.schemaVersion,
      cachedAt: parsed.cachedAt,
      sourceUrl: parsed.sourceUrl,
      contentVersion: parsed.contentVersion,
      data: normalizeAppData(parsed.data),
    };
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: abortController.signal,
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function downloadJsonFromNode(url: string, runtime: NodeRuntime): Promise<unknown> {
  const maxRedirects = 5;
  const timeoutMs = REMOTE_FETCH_TIMEOUT_MS;

  const requestFrom = (targetUrl: string, redirectCount: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        reject(new Error("Invalid remote content URL."));
        return;
      }

      const transport =
        parsedUrl.protocol === "https:"
          ? runtime.https
          : parsedUrl.protocol === "http:"
            ? runtime.http
            : null;

      if (!transport) {
        reject(new Error(`Unsupported remote protocol: ${parsedUrl.protocol}`));
        return;
      }

      const request = transport.get(
        parsedUrl,
        {
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= maxRedirects) {
              reject(new Error("Too many redirects while loading Cloudflare content."));
              return;
            }

            response.resume();
            const redirectUrl = new URL(response.headers.location, parsedUrl).toString();
            requestFrom(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            reject(new Error(`Cloudflare content request failed (HTTP ${statusCode}).`));
            return;
          }

          const chunks: Uint8Array[] = [];
          response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
          response.on("error", reject);
          response.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              resolve(JSON.parse(body));
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              reject(new Error(`Cloudflare content is not valid JSON: ${message}`));
            }
          });
        }
      );

      const timeout = setTimeout(() => {
        request.destroy(new Error(`Cloudflare content request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      request.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      request.on("close", () => {
        clearTimeout(timeout);
      });
    });

  return requestFrom(url, 0);
}

async function fetchRemoteJson(url: string): Promise<unknown> {
  const cacheBustedUrl = new URL(url);
  cacheBustedUrl.searchParams.set("_ts", Date.now().toString());
  const targetUrl = cacheBustedUrl.toString();

  const runtime = getNodeRuntime();
  if (runtime) {
    return downloadJsonFromNode(targetUrl, runtime);
  }

  return fetchJsonWithTimeout(targetUrl);
}

export const dataService = {
  async fetchData(options: FetchDataOptions = {}): Promise<ContentLoadResult> {
    const remoteAttempt = await this.tryFetchRemote(options.forceRemote === true);
    if (remoteAttempt) {
      this.cacheData(remoteAttempt.data, remoteAttempt.contentVersion);
      return {
        data: remoteAttempt.data,
        source: "remote",
        contentVersion: remoteAttempt.contentVersion,
        syncedAt: new Date().toISOString(),
      };
    }

    const cached = this.getCached();
    if (cached) {
      return {
        data: cached.data,
        source: "cache",
        contentVersion: cached.contentVersion,
        syncedAt: cached.cachedAt,
        warning: "Cloudflare content unavailable. Using cached library data.",
      };
    }

    const bundled = await this.getBundledFallback();
    return {
      data: bundled.data,
      source: "bundled",
      contentVersion: bundled.contentVersion,
      syncedAt: new Date().toISOString(),
      warning: "Cloudflare and cache unavailable. Using bundled library data.",
    };
  },

  async refreshData(): Promise<ContentLoadResult> {
    return this.fetchData({ forceRemote: true });
  },

  cacheData(data: AppData, contentVersion: string) {
    const payload: CachedEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      cachedAt: new Date().toISOString(),
      sourceUrl: REMOTE_JSON_URL,
      contentVersion,
      data,
    };
    setStorageItem(CACHE_KEY, JSON.stringify(payload));
  },

  getCached(): CachedEnvelope | null {
    return parseCachedEnvelope(getStorageItem(CACHE_KEY));
  },

  async tryFetchRemote(forceRemote: boolean): Promise<{ data: AppData; contentVersion: string } | null> {
    try {
      const remoteRaw = await fetchRemoteJson(REMOTE_JSON_URL);
    const remoteData = normalizeAppData(remoteRaw);
    assertAppDataUsable(remoteData, "Cloudflare content");
    const contentVersion = remoteData.contentVersion || remoteData.lastUpdated;

      if (forceRemote) {
        console.info(`[Content] Forced refresh succeeded. Version: ${contentVersion}`);
      }

      return { data: remoteData, contentVersion };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[Content] Remote fetch failed (${reason}).`);
      return null;
    }
  },

  async getBundledFallback(): Promise<{ data: AppData; contentVersion: string }> {
    const response = await fetch("/data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Bundled fallback data is unavailable (HTTP ${response.status}).`);
    }

    const rawData = await response.json();
    const data = normalizeAppData(rawData);
    assertAppDataUsable(data, "Bundled fallback content");
    const contentVersion = data.contentVersion || data.lastUpdated;
    return { data, contentVersion };
  },
};
