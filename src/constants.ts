const DEFAULT_REMOTE_JSON_URL =
  "https://pub-bffc58c40ead4c63a2c4a971e09daf07.r2.dev/translations.json";
const DEFAULT_GITHUB_RELEASES_API_URL =
  "https://api.github.com/repos/PolarWoIF/polaris-translation-manager/releases/latest";
const RUNTIME_REMOTE_JSON_URL = typeof __REMOTE_JSON_URL__ !== "undefined" ? __REMOTE_JSON_URL__ : "";
const RUNTIME_APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";
const RUNTIME_RELEASE_MANIFEST_URL =
  typeof __REMOTE_APP_RELEASE_URL__ !== "undefined" ? __REMOTE_APP_RELEASE_URL__ : "";
const RUNTIME_GITHUB_RELEASES_API_URL =
  typeof __GITHUB_RELEASES_API_URL__ !== "undefined" ? __GITHUB_RELEASES_API_URL__ : "";

export const REMOTE_JSON_URL = RUNTIME_REMOTE_JSON_URL || DEFAULT_REMOTE_JSON_URL;
export const APP_ID = "polaris_game_manager";
export const CACHE_KEY = "polaris_data_cache";
export const CACHE_SCHEMA_VERSION = 2;
export const REMOTE_FETCH_TIMEOUT_MS = 12_000;

export const APP_VERSION = RUNTIME_APP_VERSION;
export const REMOTE_APP_RELEASE_URL = RUNTIME_RELEASE_MANIFEST_URL;
export const GITHUB_RELEASES_API_URL = RUNTIME_GITHUB_RELEASES_API_URL || DEFAULT_GITHUB_RELEASES_API_URL;

export const UI_COLORS = {
  accent: "#00D2FF",
  bg: "#0B0C10",
  surface: "#1F2833",
  text: "#C5C6C7",
  highlight: "#66FCF1",
};
