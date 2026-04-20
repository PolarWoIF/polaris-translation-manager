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
  const downloadGatewayUrl =
    env.VITE_DOWNLOAD_GATEWAY_URL ?? "https://polar-download-gateway.mdmrksad1ksa.workers.dev";
  const downloadGatewayStrict = (env.VITE_DOWNLOAD_GATEWAY_STRICT ?? "true") === "true";

  return {
    plugins: [react(), tailwindcss()],
    base: "./",
    build: {
      sourcemap: false,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ["console.info", "console.debug", "console.trace"],
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: false,
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __REMOTE_JSON_URL__: JSON.stringify(remoteContentUrl),
      __REMOTE_APP_RELEASE_URL__: JSON.stringify(remoteAppReleaseUrl),
      __GITHUB_RELEASES_API_URL__: JSON.stringify(githubReleasesApiUrl),
      __DOWNLOAD_GATEWAY_URL__: JSON.stringify(downloadGatewayUrl),
      __DOWNLOAD_GATEWAY_STRICT__: JSON.stringify(downloadGatewayStrict),
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
