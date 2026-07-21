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
const crypto = require('crypto');
const log = require('electron-log/main');
const { SIDECAR_PORT } = require('@cincoscribe/core');

const SIDECAR_TOKEN = crypto.randomBytes(32).toString('hex');

log.initialize();
log.info('CincoScribe Desktop starting (free/MIT build)...');

// ── App settings (no license fields) ────────────────────────────────────────
const store = new Store({
  schema: {
    openAiKey:  { type: 'string' },
    language:   { type: 'string' },
    whisperMode:{ type: 'string' },
    modelsDir:  { type: 'string' },
    internetAccessAllowed: { type: 'boolean' }
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
    icon: path.join(__dirname, 'renderer', 'cincoscribe.svg'),
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
function killPort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = out.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            log.info(`[sidecar] Clearing orphan process on port ${port} (PID ${pid})`);
            try { execSync(`taskkill /pid ${pid} /T /F`); } catch (err) {}
          }
        }
      }
    } catch (e) {}
  }
}

function spawnSidecar() {
  killPort(SIDECAR_PORT);

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
    detached: false,
    windowsHide: true,
    env: {
      ...process.env,
      SIDECAR_PORT: String(SIDECAR_PORT),
      CINCOSCRIBE_MODELS_DIR: store.get('modelsDir') || '',
      VOICEBOX_MODELS_DIR: store.get('modelsDir') || '',   // legacy compat
      SIDECAR_TOKEN: SIDECAR_TOKEN
    }
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
    log.info('[sidecar] Terminating process tree...');
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${sidecarProcess.pid} /T /F`);
      } else {
        sidecarProcess.kill('SIGTERM');
      }
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
      const res = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`, {
        headers: { 'X-Sidecar-Token': SIDECAR_TOKEN }
      });
      if (res.ok) {
        log.info('[main] Sidecar is healthy. Sending settings sync...');
        const syncRes = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/settings/models-dir`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sidecar-Token': SIDECAR_TOKEN
          },
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
  internetAccessAllowed: store.get('internetAccessAllowed', true),
}));

ipcMain.handle('save-settings', async (_event, settings) => {
  if (typeof settings.openAiKey  === 'string') store.set('openAiKey',  settings.openAiKey);
  if (typeof settings.language   === 'string') store.set('language',   settings.language);
  if (typeof settings.whisperMode=== 'string') store.set('whisperMode',settings.whisperMode);
  if (typeof settings.internetAccessAllowed === 'boolean') store.set('internetAccessAllowed', settings.internetAccessAllowed);
  if (typeof settings.modelsDir  === 'string') {
    const oldDir = store.get('modelsDir');
    if (oldDir !== settings.modelsDir) {
      store.set('modelsDir', settings.modelsDir);
      try {
        await fetch(`http://127.0.0.1:${SIDECAR_PORT}/settings/models-dir`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sidecar-Token': SIDECAR_TOKEN
          },
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
ipcMain.handle('sidecar-token', () => SIDECAR_TOKEN);

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
ipcMain.handle('restart-sidecar', async (_event, newModelsDir) => {
  log.info(`[main] Updating sidecar models path: ${newModelsDir}`);
  store.set('modelsDir', newModelsDir);
  try {
    const res = await sidecarFetch('/settings/models-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models_dir: newModelsDir })
    });
    return { success: true, res };
  } catch (err) {
    log.warn('[main] Dynamic modelsDir update failed, restarting sidecar process...', err.message);
    killSidecar();
    await new Promise(r => setTimeout(r, 1000));
    spawnSidecar();
    return { success: true };
  }
});

ipcMain.handle('open-path', async (_event, targetPath) => {
  try {
    await shell.openPath(targetPath);
    return { success: true };
  } catch (err) {
    log.error('[main] openPath error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Model lifecycle IPC (thin HTTP proxies to sidecar) ────────────────────────

async function sidecarFetch(path, opts = {}) {
  const url = `http://127.0.0.1:${SIDECAR_PORT}${path}`;
  const headers = { 'X-Sidecar-Token': SIDECAR_TOKEN, ...opts.headers };
  const res = await fetch(url, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.detail || `HTTP ${res.status}`), { status: res.status, body });
  return body;
}

ipcMain.handle('models:download', async (_e, modelId) => {
  try {
    return await sidecarFetch(`/models/${encodeURIComponent(modelId)}/download`, { method: 'POST' });
  } catch (err) {
    log.error('[main] models:download error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('models:download:cancel', async (_e, modelId) => {
  try {
    return await sidecarFetch(`/models/${encodeURIComponent(modelId)}/download/cancel`, { method: 'POST' });
  } catch (err) {
    log.error('[main] models:download:cancel error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('models:load', async (_e, { modelId, computeType, device, keepOthers } = {}) => {
  try {
    return await sidecarFetch(`/models/${encodeURIComponent(modelId)}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compute_type:  computeType  ?? null,
        device:        device       ?? null,
        keep_others:   keepOthers   ?? false,
      }),
    });
  } catch (err) {
    log.error('[main] models:load error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('models:unload', async (_e, modelId) => {
  try {
    return await sidecarFetch(`/models/${encodeURIComponent(modelId)}/unload`, { method: 'POST' });
  } catch (err) {
    log.error('[main] models:unload error:', err.message);
    return { error: err.message };
  }
});
