const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.env.ELECTRON_RUN_AS_NODE && process.env.POLAR_RELAUNCH_CLEAN_ENV !== "1") {
  // If ELECTRON_RUN_AS_NODE is set globally, Electron starts in Node mode.
  // Relaunch once with that flag removed so the desktop app can open normally
  // in both development and packaged builds.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.POLAR_RELAUNCH_CLEAN_ENV = "1";
  const relaunchArgs =
    process.argv.length > 1 && /\.(mjs|cjs|js)$/i.test(process.argv[1]) ? process.argv.slice(1) : [];

  const child = spawn(process.execPath, relaunchArgs, {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  process.exit(0);
}

const { app, BrowserWindow, ipcMain } = require("electron");
app.setName("Polar Translation");
if (process.platform === "win32") {
  process.title = "Polar Translation";
}

const DEV_URL_CANDIDATES = [process.env.ELECTRON_DEV_URL, "http://localhost:3000", "http://localhost:3001"].filter(
  Boolean
);
const UPDATER_EVENT_CHANNEL = "desktop-updater:event";

let mainWindow = null;
let updaterApi = null;
let updaterInitialized = false;
let updaterHandlersRegistered = false;

let updaterState = {
  phase: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  progressPercent: 0,
  message: "Waiting for update check...",
};

function resolveWindowIconPath() {
  const candidates = [
    path.join(process.resourcesPath || "", "icon.ico"),
    path.join(__dirname, "dist/assets/red-set/windows/icon.ico"),
    path.join(__dirname, "dist/assets/red-set/windows/icon-256x256.png"),
    path.join(__dirname, "dist/assets/red-set/windows/icon-64x64.png"),
    path.join(__dirname, "public/assets/red-set/windows/icon.ico"),
    path.join(__dirname, "public/assets/red-set/windows/icon-256x256.png"),
    path.join(__dirname, "public/assets/red-set/windows/icon-64x64.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function broadcastUpdaterState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(UPDATER_EVENT_CHANNEL, updaterState);
}

function setUpdaterState(patch) {
  updaterState = {
    ...updaterState,
    ...patch,
    currentVersion: app.getVersion(),
  };
  broadcastUpdaterState();
}

function registerUpdaterHandlers() {
  if (updaterHandlersRegistered) return;
  updaterHandlersRegistered = true;

  ipcMain.handle("desktop-updater:get-state", () => updaterState);
  ipcMain.handle("desktop-updater:check-now", async () => {
    if (!updaterApi || !app.isPackaged) {
      setUpdaterState({
        phase: "unsupported",
        message: "Native updater is unavailable in development mode.",
      });
      return updaterState;
    }

    try {
      setUpdaterState({
        phase: "checking",
        message: "Checking GitHub releases for updates...",
      });
      await updaterApi.checkForUpdates();
      return updaterState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setUpdaterState({
        phase: "error",
        message: "Failed to check for updates.",
        error: errorMessage,
      });
      return updaterState;
    }
  });

  ipcMain.handle("desktop-updater:restart-and-install", () => {
    if (!updaterApi || updaterState.phase !== "downloaded") return false;

    // Install over current version while preserving user data in appData.
    updaterApi.quitAndInstall(false, true);
    return true;
  });
}

function initializeAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  registerUpdaterHandlers();

  if (!app.isPackaged || process.platform !== "win32") {
    setUpdaterState({
      phase: "unsupported",
      message: "Native self-update is available only in packaged Windows builds.",
    });
    return;
  }

  let loaded;
  try {
    loaded = require("electron-updater");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setUpdaterState({
      phase: "error",
      message: "Failed to load native updater.",
      error: errorMessage,
    });
    return;
  }

  updaterApi = loaded.autoUpdater;
  updaterApi.autoDownload = true;
  updaterApi.autoInstallOnAppQuit = true;
  updaterApi.allowPrerelease = false;

  updaterApi.on("checking-for-update", () => {
    setUpdaterState({
      phase: "checking",
      progressPercent: 0,
      message: "Checking GitHub releases for updates...",
      error: undefined,
    });
  });

  updaterApi.on("update-available", (info) => {
    setUpdaterState({
      phase: "available",
      latestVersion: info?.version ?? null,
      progressPercent: 0,
      message: `Update v${info?.version ?? "latest"} found. Downloading...`,
      error: undefined,
    });
  });

  updaterApi.on("update-not-available", () => {
    setUpdaterState({
      phase: "not-available",
      latestVersion: app.getVersion(),
      progressPercent: 100,
      message: "App is up to date.",
      error: undefined,
    });
  });

  updaterApi.on("download-progress", (progress) => {
    setUpdaterState({
      phase: "downloading",
      progressPercent: progress?.percent ?? 0,
      message: `Downloading update... ${Math.round(progress?.percent ?? 0)}%`,
      error: undefined,
    });
  });

  updaterApi.on("update-downloaded", (info) => {
    setUpdaterState({
      phase: "downloaded",
      latestVersion: info?.version ?? updaterState.latestVersion,
      progressPercent: 100,
      message: "Update downloaded. Restart to install.",
      error: undefined,
    });
  });

  updaterApi.on("error", (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setUpdaterState({
      phase: "error",
      message: "Updater error.",
      error: errorMessage,
    });
  });

  // Launch a check shortly after startup so existing users get app updates
  // without manual steps.
  setTimeout(() => {
    updaterApi.checkForUpdates().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setUpdaterState({
        phase: "error",
        message: "Failed to check for updates.",
        error: errorMessage,
      });
    });
  }, 4500);
}

async function findAvailableDevUrl() {
  for (const url of DEV_URL_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return url;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function createWindow() {
  const windowIconPath = resolveWindowIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Polar Translation",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: "#0A0A0A",
    icon: windowIconPath,
  });
  const win = mainWindow;

  win.on("closed", () => {
    mainWindow = null;
  });

  // Remove menu bar
  win.setMenuBarVisibility(false);

  const distIndexPath = path.join(__dirname, "dist/index.html");
  const isDevMode = !app.isPackaged && process.env.ELECTRON_FORCE_DIST !== "1";

  if (isDevMode) {
    const devUrl = await findAvailableDevUrl();
    if (devUrl) {
      await win.loadURL(devUrl);
    } else if (fs.existsSync(distIndexPath)) {
      await win.loadFile(distIndexPath);
    } else {
      throw new Error("No running Vite dev server found and dist build is missing.");
    }
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(distIndexPath);
  }

  broadcastUpdaterState();
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.polar.translation");
  initializeAutoUpdater();

  createWindow().catch((error) => {
    try {
      const logPath = path.join(app.getPath("userData"), "startup-error.log");
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${error?.stack || error}\n`, "utf8");
    } catch {
      // Ignore logging errors.
    }
    console.error("Failed to create window:", error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
