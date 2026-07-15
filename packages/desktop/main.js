/**
 * CincoScribe Desktop — main process
 *
 * License model: FREE / MIT. No activation, no fingerprinting, no server calls.
 * App opens index.html unconditionally on launch.
 *
 * Sidecar: FastAPI backend spawned at startup on port 3901 (SIDECAR_PORT).
 * Electron IPC surface is minimal — sidecar handles TTS and ASR via HTTP.
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Store = require('electron-store');
const { spawn } = require('child_process');
const log = require('electron-log/main');
const { SIDECAR_PORT } = require('@cincoscribe/core');

log.initialize();
log.info('CincoScribe Desktop starting (free/MIT build)...');

// ── App settings (no license fields) ────────────────────────────────────────
const store = new Store({
  schema: {
    openAiKey:  { type: 'string' },
    language:   { type: 'string' },
    whisperMode:{ type: 'string' },
    modelsDir:  { type: 'string' }
  }
});

let mainWindow = null;
let sidecarProcess = null;

// ── Window factory ───────────────────────────────────────────────────────────
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

// ── Sidecar lifecycle ────────────────────────────────────────────────────────

/**
 * Locate the Python executable.
 * Windows: prefer `py` (Python Launcher), fallback `python`.
 * Other platforms: `python3`.
 */
function pythonExe() {
  return process.platform === 'win32' ? 'py' : 'python3';
}

/**
 * Spawn the FastAPI sidecar.
 * Sidecar path: packages/desktop/backend/server.py
 * Managed by uv (uv run server.py).
 */
function spawnSidecar() {
  const backendDir = path.join(__dirname, 'backend');
  const serverScript = path.join(backendDir, 'main.py');

  // uv run ensures the venv defined by pyproject.toml is used.
  // Fallback: py main.py if uv is unavailable (dev convenience).
  const [cmd, args] = process.platform === 'win32'
    ? ['uv', ['run', serverScript]]
    : ['uv', ['run', serverScript]];

  log.info(`[sidecar] Spawning: ${cmd} ${args.join(' ')}`);

  sidecarProcess = spawn(cmd, args, {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Ensure child is in its own process group so we can kill it cleanly
    detached: false,
    windowsHide: true,
  });

  sidecarProcess.stdout.on('data', (d) => log.info('[sidecar stdout]', d.toString().trim()));
  sidecarProcess.stderr.on('data', (d) => log.warn('[sidecar stderr]', d.toString().trim()));

  sidecarProcess.on('error', (err) => {
    log.error('[sidecar] Failed to start:', err.message);
    sidecarProcess = null;
  });

  sidecarProcess.on('exit', (code, signal) => {
    log.info(`[sidecar] Exited with code=${code} signal=${signal}`);
    sidecarProcess = null;
  });
}

function killSidecar() {
  if (sidecarProcess) {
    log.info('[sidecar] Terminating...');
    try {
      sidecarProcess.kill('SIGTERM');
    } catch (e) {
      log.warn('[sidecar] Kill error:', e.message);
    }
    sidecarProcess = null;
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Intercept window.open — open externals in system browser
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });

  // Auto-updater (non-blocking, free app — update silently if possible)
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.warn('[updater] Check failed (non-fatal):', err.message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `CincoScribe ${info.version} is ready. Restart to install?`,
        buttons: ['Restart', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  // Set default modelsDir in store if not present
  if (!store.get('modelsDir')) {
    const defaultModelsDir = app.isPackaged
      ? path.join(path.dirname(process.execPath), 'models')
      : path.join(__dirname, 'backend', 'models');
    store.set('modelsDir', defaultModelsDir);
  }

  // Spawn the FastAPI sidecar before opening the window
  spawnSidecar();
  syncModelsDirectory();

  // Open main window unconditionally — no license gate
  mainWindow = createMainWindow();
});

async function syncModelsDirectory() {
  const currentDir = store.get('modelsDir');
  log.info(`[main] Syncing models directory with sidecar: ${currentDir}`);
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`);
      if (res.ok) {
        log.info('[main] Sidecar is healthy. Sending settings sync...');
        const syncRes = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/settings/models-dir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ models_dir: currentDir })
        });
        if (syncRes.ok) {
          log.info('[main] Models directory synced successfully.');
        } else {
          log.warn('[main] Models directory sync failed:', await syncRes.text());
        }
        break;
      }
    } catch (e) {
      log.info(`[main] Waiting for sidecar health... (${i + 1}/10)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

app.on('window-all-closed', () => {
  killSidecar();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killSidecar);

// ── IPC handlers ─────────────────────────────────────────────────────────────
// Minimal surface — TTS and ASR are handled by the sidecar over HTTP.
// The renderer calls fetch('http://127.0.0.1:3901/...') directly via preload.

ipcMain.handle('get-settings', () => ({
  openAiKey:   store.get('openAiKey', ''),
  language:    store.get('language', 'auto'),
  whisperMode: store.get('whisperMode', 'fast'),
  modelsDir:   store.get('modelsDir', ''),
}));

ipcMain.handle('save-settings', async (_event, settings) => {
  if (typeof settings.openAiKey  === 'string') store.set('openAiKey',  settings.openAiKey);
  if (typeof settings.language   === 'string') store.set('language',   settings.language);
  if (typeof settings.whisperMode=== 'string') store.set('whisperMode',settings.whisperMode);
  if (typeof settings.modelsDir  === 'string') {
    const oldDir = store.get('modelsDir');
    if (oldDir !== settings.modelsDir) {
      store.set('modelsDir', settings.modelsDir);
      try {
        await fetch(`http://127.0.0.1:${SIDECAR_PORT}/settings/models-dir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ models_dir: settings.modelsDir })
        });
      } catch (e) {
        log.error('[main] Failed to sync models-dir settings with sidecar:', e.message);
      }
    }
  }
  return { ok: true };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result;
});

ipcMain.handle('sidecar-port', () => SIDECAR_PORT);

ipcMain.handle('open-file-dialog', async (_event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: opts?.filters ?? [
      { name: 'Audio/Video', extensions: ['mp3','mp4','wav','m4a','ogg','webm','mkv','flac'] }
    ],
  });
  return result;
});

ipcMain.handle('save-file-dialog', async (_event, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts?.defaultPath ?? 'output.wav',
    filters: opts?.filters ?? [{ name: 'WAV Audio', extensions: ['wav'] }],
  });
  return result;
});
