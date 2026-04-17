import { APP_VERSION, GITHUB_RELEASES_API_URL, REMOTE_APP_RELEASE_URL } from "../constants";

export interface AppUpdateState {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  releaseUrl: string | null;
  source: "remote-manifest" | "github" | "none";
  error?: string;
}

interface ReleaseManifest {
  latestVersion: string;
  releaseUrl?: string;
}

interface GithubReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

const UPDATE_FETCH_TIMEOUT_MS = 8_000;

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(".").map((part) => Number(part) || 0);
  const right = normalizeVersion(b).split(".").map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchJson(url: string): Promise<unknown> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), UPDATE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: abortController.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function emptyUpdateState(error?: string): AppUpdateState {
  return {
    checkedAt: new Date().toISOString(),
    currentVersion: APP_VERSION,
    latestVersion: null,
    available: false,
    releaseUrl: null,
    source: "none",
    error,
  };
}

export const updateService = {
  async checkForUpdates(): Promise<AppUpdateState> {
    const manifestUrl = REMOTE_APP_RELEASE_URL.trim();
    if (manifestUrl) {
      try {
        const data = (await fetchJson(manifestUrl)) as ReleaseManifest;
        const latestVersion = normalizeVersion(data.latestVersion || "");
        if (latestVersion) {
          return {
            checkedAt: new Date().toISOString(),
            currentVersion: APP_VERSION,
            latestVersion,
            available: compareVersions(latestVersion, APP_VERSION) > 0,
            releaseUrl: data.releaseUrl?.trim() || null,
            source: "remote-manifest",
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyUpdateState(`Release manifest check failed: ${message}`);
      }
    }

    const githubUrl = GITHUB_RELEASES_API_URL.trim();
    if (!githubUrl) {
      return emptyUpdateState();
    }

    try {
      const data = (await fetchJson(githubUrl)) as GithubReleaseResponse;
      const latestVersion = normalizeVersion(data.tag_name || "");
      if (!latestVersion) {
        return emptyUpdateState("GitHub releases API response missing tag_name.");
      }
      return {
        checkedAt: new Date().toISOString(),
        currentVersion: APP_VERSION,
        latestVersion,
        available: compareVersions(latestVersion, APP_VERSION) > 0,
        releaseUrl: data.html_url?.trim() || null,
        source: "github",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return emptyUpdateState(`GitHub update check failed: ${message}`);
    }
  },
};
