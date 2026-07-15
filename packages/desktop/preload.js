'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * preload.js — IPC bridge
 *
 * SECURITY: contextIsolation=true, nodeIntegration=false.
 * Only the APIs listed here are accessible to the renderer.
 *
 * License APIs removed. TTS/ASR go through sidecar HTTP (not IPC).
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings:    ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:   (settings) => ipcRenderer.invoke('save-settings', settings),

  // Sidecar
  getSidecarPort: ()         => ipcRenderer.invoke('sidecar-port'),

  // File system dialogs
  openFileDialog: (opts)     => ipcRenderer.invoke('open-file-dialog', opts),
  saveFileDialog: (opts)     => ipcRenderer.invoke('save-file-dialog', opts),
  selectDirectory:()         => ipcRenderer.invoke('select-directory'),
});

contextBridge.exposeInMainWorld('cincoscribe', {
  tts: async (text, voice) => {
    const port = await ipcRenderer.invoke('sidecar-port');
    const res = await fetch(`http://127.0.0.1:${port}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed: 1.0 })
    });
    if (!res.ok) {
       let err;
       try { err = await res.json(); } catch(e) {}
       throw new Error(err?.detail || 'TTS Failed');
    }
    return await res.arrayBuffer();
  },
  transcribe: async (audioPath, language, modelSize) => {
    const port = await ipcRenderer.invoke('sidecar-port');
    const res = await fetch(`http://127.0.0.1:${port}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_path: audioPath, language, model_size: modelSize })
    });
    if (!res.ok) {
       let err;
       try { err = await res.json(); } catch(e) {}
       throw new Error(err?.detail || 'ASR Failed');
    }
    return await res.json();
  }
});

