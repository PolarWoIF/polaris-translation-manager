const DEFAULT_REMOTE_JSON_URL =
  "https://pub-bffc58c40ead4c63a2c4a971e09daf07.r2.dev/translations.json";

export const REMOTE_JSON_URL = __REMOTE_JSON_URL__ || DEFAULT_REMOTE_JSON_URL;
export const APP_ID = "polaris_game_manager";
export const CACHE_KEY = "polaris_data_cache";
export const CACHE_SCHEMA_VERSION = 2;
export const REMOTE_FETCH_TIMEOUT_MS = 12_000;

export const APP_VERSION = __APP_VERSION__;
export const REMOTE_APP_RELEASE_URL = __REMOTE_APP_RELEASE_URL__;
export const GITHUB_RELEASES_API_URL = __GITHUB_RELEASES_API_URL__;

export const UI_COLORS = {
  accent: "#00D2FF",
  bg: "#0B0C10",
  surface: "#1F2833",
  text: "#C5C6C7",
  highlight: "#66FCF1",
};
