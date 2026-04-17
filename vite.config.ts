import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import packageJson from "./package.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const appVersion = packageJson.version;
  const remoteContentUrl = env.VITE_REMOTE_JSON_URL ?? "";
  const remoteAppReleaseUrl = env.VITE_REMOTE_APP_RELEASE_URL ?? "";
  const githubReleasesApiUrl = env.VITE_GITHUB_RELEASES_API_URL ?? "";

  return {
    plugins: [react(), tailwindcss()],
    base: "./",
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      __APP_VERSION__: JSON.stringify(appVersion),
      __REMOTE_JSON_URL__: JSON.stringify(remoteContentUrl),
      __REMOTE_APP_RELEASE_URL__: JSON.stringify(remoteAppReleaseUrl),
      __GITHUB_RELEASES_API_URL__: JSON.stringify(githubReleasesApiUrl),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR can be disabled via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
