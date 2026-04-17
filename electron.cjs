const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');

if (process.env.ELECTRON_RUN_AS_NODE && process.env.POLAR_RELAUNCH_CLEAN_ENV !== '1') {
  // If ELECTRON_RUN_AS_NODE is set globally, Electron starts in Node mode.
  // Relaunch once with that flag removed so the desktop app can open normally
  // in both development and packaged builds.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.POLAR_RELAUNCH_CLEAN_ENV = '1';
  const relaunchArgs =
    process.argv.length > 1 && /\.(mjs|cjs|js)$/i.test(process.argv[1]) ? process.argv.slice(1) : [];

  const child = spawn(process.execPath, relaunchArgs, {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  process.exit(0);
}

const { app, BrowserWindow } = require('electron');

const DEV_URL_CANDIDATES = [
  process.env.ELECTRON_DEV_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);
let mainWindow = null;

function resolveWindowIconPath() {
  const candidates = [
    path.join(__dirname, 'dist/assets/red-set/windows/icon-64x64.png'),
    path.join(__dirname, 'public/assets/red-set/windows/icon-64x64.png'),
    path.join(__dirname, 'public/assets/red-set/windows/icon.ico'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function findAvailableDevUrl() {
  for (const url of DEV_URL_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#0A0A0A',
    icon: windowIconPath,
  });
  const win = mainWindow;
  win.on('closed', () => {
    mainWindow = null;
  });

  // Remove menu bar
  win.setMenuBarVisibility(false);

  const distIndexPath = path.join(__dirname, 'dist/index.html');
  const isDevMode = !app.isPackaged && process.env.ELECTRON_FORCE_DIST !== '1';

  if (isDevMode) {
    const devUrl = await findAvailableDevUrl();
    if (devUrl) {
      await win.loadURL(devUrl);
    } else if (fs.existsSync(distIndexPath)) {
      await win.loadFile(distIndexPath);
    } else {
      throw new Error('No running Vite dev server found and dist build is missing.');
    }
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await win.loadFile(distIndexPath);
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    try {
      const logPath = path.join(app.getPath('userData'), 'startup-error.log');
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] ${error?.stack || error}\n`,
        'utf8'
      );
    } catch {
      // ignore logging errors
    }
    console.error('Failed to create window:', error);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
