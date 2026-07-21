/* ===== Models Page — Smooth DOM Progress & Fast Load Manager ===== */

function renderModelsPage(container) {
  let currentModelsDir = '';
  let errorMessage = '';
  let pollingInterval = null;
  let expandedModelKey = null;

  const STATIC_ASR_MODELS = [
    { model_id: 'base', name: 'Whisper Base', category: 'asr', size_label: '~281 MB', min_vram_mb: 0, description: 'Balanced accuracy and speed. Default recommended ASR model.', status: 'not_downloaded' },
    { model_id: 'small', name: 'Whisper Small', category: 'asr', size_label: '~922 MB', min_vram_mb: 1024, description: 'Better accuracy for accents and noisy audio.', status: 'not_downloaded' },
    { model_id: 'medium', name: 'Whisper Medium', category: 'asr', size_label: '~1.5 GB', min_vram_mb: 2048, description: 'High accuracy for complex audio or multiple accents.', status: 'not_downloaded' },
    { model_id: 'large-v3', name: 'Whisper Large v3', category: 'asr', size_label: '~3.0 GB', min_vram_mb: 6144, description: 'Maximum accuracy ASR. Slow on CPU — recommend GPU.', status: 'not_downloaded' },
    { model_id: 'turbo', name: 'Whisper Turbo', category: 'asr', size_label: '~1.6 GB', min_vram_mb: 3072, description: 'Optimised large model — high accuracy with faster runtime.', status: 'not_downloaded' },
  ];

  const STATIC_TTS_MODELS = [
    { model_id: 'kokoro', name: 'Kokoro 82M', category: 'tts', size_label: '~82 MB', min_vram_mb: 0, description: 'Ultra lightweight, high-fidelity local speech synthesis.', status: 'not_downloaded' },
    { model_id: 'qwen_1_7b', name: 'Qwen TTS 1.7B', category: 'tts', size_label: '~3.4 GB', min_vram_mb: 4096, description: 'High-fidelity speech synthesis based on Qwen-Audio.', status: 'not_downloaded' },
    { model_id: 'qwen_0_6b', name: 'Qwen TTS 0.6B', category: 'tts', size_label: '~1.2 GB', min_vram_mb: 2048, description: 'Balanced quality and performance version of Qwen TTS.', status: 'not_downloaded' },
    { model_id: 'qwen_custom_1_7b', name: 'Qwen CustomVoice 1.7B', category: 'tts', size_label: '~3.4 GB', min_vram_mb: 4096, description: 'Personalized voice cloning model based on Qwen.', status: 'not_downloaded' },
    { model_id: 'qwen_custom_0_6b', name: 'Qwen CustomVoice 0.6B', category: 'tts', size_label: '~1.2 GB', min_vram_mb: 2048, description: 'Lightweight personal voice cloning model.', status: 'not_downloaded' },
    { model_id: 'luxtts', name: 'LuxTTS', category: 'tts', size_label: '~45 MB', min_vram_mb: 0, description: 'Extremely fast and lightweight voice generation.', status: 'not_downloaded' },
    { model_id: 'chatterbox_tts', name: 'Chatterbox TTS', category: 'tts', size_label: '~350 MB', min_vram_mb: 1024, description: 'Natural sounding voice synthesis across multiple languages.', status: 'not_downloaded' },
    { model_id: 'chatterbox_turbo', name: 'Chatterbox Turbo', category: 'tts', size_label: '~180 MB', min_vram_mb: 512, description: 'High speed English generation with support for emotional tags.', status: 'not_downloaded' },
    { model_id: 'tada_1b', name: 'TADA 1B', category: 'tts', size_label: '~2.0 GB', min_vram_mb: 2048, description: 'Advanced text-to-speech model optimized for expressive speech.', status: 'not_downloaded' },
    { model_id: 'tada_3b', name: 'TADA 3B', category: 'tts', size_label: '~6.0 GB', min_vram_mb: 6144, description: 'Large scale multilingual speech synthesis.', status: 'not_downloaded' },
  ];

  let modelList = [...STATIC_ASR_MODELS, ...STATIC_TTS_MODELS];

  async function getSidecarBaseUrl() {
    let port = 3901;
    if (window.electronAPI && window.electronAPI.getSidecarPort) {
      try { port = await window.electronAPI.getSidecarPort(); } catch (e) {}
    }
    const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? '127.0.0.1'
      : (window.location.hostname || '127.0.0.1');
    return `http://${hostname}:${port}`;
  }

  async function fetchStatus() {
    try {
      const baseUrl = await getSidecarBaseUrl();
      let token = '';
      if (window.electronAPI && window.electronAPI.getSidecarToken) {
        try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
      }

      const headers = token ? { 'X-Sidecar-Token': token } : {};
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          modelList = data.models;
        }
        if (data.current_models_dir) {
          currentModelsDir = data.current_models_dir;
        }
        errorMessage = '';

        const downloadingModels = modelList.filter(m => m.status === 'downloading');
        if (downloadingModels.length > 0) {
          startPolling();
        } else {
          stopPolling();
        }
      }
    } catch (e) {
      // Keep static list if offline
    }
  }

  function startPolling() {
    if (!pollingInterval) {
      pollingInterval = setInterval(async () => {
        if (!document.body.contains(container)) {
          stopPolling();
          return;
        }
        await fetchStatus();
        updateDOMInPlace();
      }, 1000);
    }
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  function updateDOMInPlace() {
    const dirEl = container.querySelector('#models-dir-path');
    if (dirEl && currentModelsDir) {
      dirEl.textContent = currentModelsDir;
    }

    modelList.forEach(m => {
      const id = m.model_id;
      const row = container.querySelector(`.model-row[data-model-id="${id}"]`);
      if (!row) return;

      const isDownloaded = m.downloaded || m.status === 'downloaded' || m.status === 'loaded';
      const isDownloading = m.status === 'downloading';
      const isLoaded = m.loaded || m.status === 'loaded';

      const iconEl = row.querySelector('.model-status-icon');
      if (iconEl) {
        let newIcon = '';
        if (isLoaded) {
          newIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        } else if (isDownloaded) {
          newIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
        } else if (isDownloading) {
          newIcon = `<div class="spinner-models-ring"></div>`;
        } else {
          newIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
        }
        if (iconEl.innerHTML !== newIcon) {
          iconEl.innerHTML = newIcon;
        }
      }

      const actionEl = row.querySelector('.model-details-action');
      if (actionEl && isDownloading) {
        const pct = Math.round((m.progress || 0) * 100);
        const dlStr = formatBytes(m.bytes_downloaded);
        const totStr = formatBytes(m.bytes_total);
        const spdStr = formatSpeed(m.speed_bps);

        actionEl.innerHTML = `
          <div class="download-progress-box">
            <div class="download-progress-track">
              <div class="download-progress-bar" style="width: ${pct}%"></div>
            </div>
            <div class="download-progress-text">
              <span>Downloading: ${dlStr} / ${totStr} (${pct}%) ${spdStr}</span>
              <a href="#" class="btn-cancel-dl" data-id="${id}" style="color: #ef4444; text-decoration: none;">Cancel</a>
            </div>
          </div>
        `;
        bindRowEvents(row);
      }
    });
  }

  async function triggerDownload(modelId) {
    if (localStorage.getItem('internetAccessAllowed') === 'false') {
      errorMessage = 'Internet access is disabled in Settings.';
      Utils.showToast(errorMessage);
      render();
      return;
    }

    try {
      if (window.electronAPI && window.electronAPI.modelsDownload) {
        await window.electronAPI.modelsDownload(modelId);
      } else {
        const baseUrl = await getSidecarBaseUrl();
        let token = '';
        if (window.electronAPI && window.electronAPI.getSidecarToken) {
          try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
        }

        const res = await fetch(`${baseUrl}/models/${encodeURIComponent(modelId)}/download`, {
          method: 'POST',
          headers: token ? { 'X-Sidecar-Token': token } : {}
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Download failed');
        }
      }

      Utils.showToast(`Starting download for ${modelId}...`);
      await fetchStatus();
      startPolling();
      render();
    } catch (e) {
      errorMessage = `Download failed: ${e.message}`;
      Utils.showToast(errorMessage);
      render();
    }
  }

  async function cancelDownload(modelId) {
    try {
      if (window.electronAPI && window.electronAPI.modelsDownloadCancel) {
        await window.electronAPI.modelsDownloadCancel(modelId);
      } else {
        const baseUrl = await getSidecarBaseUrl();
        let token = '';
        if (window.electronAPI && window.electronAPI.getSidecarToken) {
          try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
        }
        await fetch(`${baseUrl}/models/${encodeURIComponent(modelId)}/download/cancel`, {
          method: 'POST',
          headers: token ? { 'X-Sidecar-Token': token } : {}
        });
      }
      Utils.showToast(`Cancelled download for ${modelId}`);
      await fetchStatus();
      render();
    } catch (e) {
      console.error('Cancel failed', e);
    }
  }

  async function deleteModel(modelId) {
    if (!confirm(`Are you sure you want to remove ${modelId} from disk?`)) return;

    try {
      const baseUrl = await getSidecarBaseUrl();
      let token = '';
      if (window.electronAPI && window.electronAPI.getSidecarToken) {
        try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
      }

      const type = modelList.find(m => m.model_id === modelId)?.category || 'asr';
      const res = await fetch(`${baseUrl}/engines/models/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Sidecar-Token': token } : {})
        },
        body: JSON.stringify({ model_type: type, model_name: modelId })
      });

      if (res.ok) {
        Utils.showToast(`Model ${modelId} removed.`);
        await fetchStatus();
        render();
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Deletion failed');
      }
    } catch (e) {
      errorMessage = `Failed to remove model: ${e.message}`;
      Utils.showToast(errorMessage);
      render();
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) return (mb / 1024).toFixed(1) + ' GB';
    return mb.toFixed(1) + ' MB';
  }

  function formatSpeed(bps) {
    if (!bps) return '';
    const kb = bps / 1024;
    if (kb >= 1000) return `• ${(kb / 1024).toFixed(1)} MB/s`;
    return `• ${kb.toFixed(0)} KB/s`;
  }

  function init() {
    if (window.electronAPI && window.electronAPI.getSettings) {
      window.electronAPI.getSettings().then(s => {
        if (s && s.modelsDir) {
          currentModelsDir = s.modelsDir;
          render();
        }
      }).catch(() => {});
    }
    render();
    fetchStatus().then(() => render());
  }

  function render() {
    if (!document.body.contains(container)) {
      stopPolling();
      return;
    }

    const asrModels = modelList.filter(m => (m.category || 'asr') === 'asr');
    const ttsModels = modelList.filter(m => m.category === 'tts');

    container.innerHTML = `
      <style>
        .models-container {
          animation: fade-in-models 300ms ease both;
          max-width: 900px;
          margin: 0 auto;
          padding: var(--sp-6) var(--sp-4);
        }
        @keyframes fade-in-models {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .section-title {
          font-family: var(--ff-display);
          font-size: 11px;
          font-weight: 700;
          color: var(--clr-text-faint);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: var(--sp-3);
          margin-top: var(--sp-6);
        }
        .models-list {
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-xl);
          background: var(--clr-bg-subtle);
          overflow: hidden;
          margin-bottom: var(--sp-6);
        }
        .model-row {
          border-bottom: 1px solid var(--clr-border);
          transition: background var(--dur-fast) ease;
        }
        .model-row:last-child {
          border-bottom: none;
        }
        .model-row:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .model-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          cursor: pointer;
          user-select: none;
        }
        .model-row-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .model-status-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
        }
        .model-row-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--clr-text);
        }
        .model-row-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .model-row-size {
          font-size: 12px;
          color: var(--clr-text-muted);
          font-family: var(--ff-mono);
        }
        .model-row-arrow {
          display: flex;
          align-items: center;
          color: var(--clr-text-faint);
          transition: transform var(--dur-fast) ease;
        }
        .model-row.expanded .model-row-arrow {
          transform: rotate(90deg);
        }
        .model-row-details {
          padding: 0 20px 20px 52px;
          animation: slide-down-details var(--dur-fast) ease both;
        }
        @keyframes slide-down-details {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 250px; }
        }
        .model-details-desc {
          font-size: 12px;
          color: var(--clr-text-muted);
          line-height: 1.5;
          margin: 0 0 10px 0;
        }
        .model-details-meta {
          font-size: 11px;
          color: var(--clr-text-faint);
          margin-bottom: 12px;
        }
        .model-details-meta strong {
          color: var(--clr-text-muted);
        }
        .download-progress-box {
          margin-top: 8px;
        }
        .download-progress-track {
          width: 100%;
          height: 5px;
          background: var(--clr-border-med);
          border-radius: var(--radius-full);
          overflow: hidden;
        }
        .download-progress-bar {
          height: 100%;
          background: var(--clr-primary);
          border-radius: var(--radius-full);
          transition: width 300ms ease;
        }
        .download-progress-text {
          font-size: 11px;
          color: var(--clr-primary);
          margin-top: 6px;
          font-weight: 500;
          display: flex;
          justify-content: space-between;
        }
        .spinner-models-ring {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(212, 163, 89, 0.2);
          border-top-color: var(--clr-primary);
          border-radius: 50%;
          animation: spin-models 1s linear infinite;
        }
        @keyframes spin-models {
          to { transform: rotate(360deg); }
        }
      </style>

      <div class="models-container">
        <div style="margin-bottom: var(--sp-4);">
          <h1 style="font-size: var(--fs-xl); font-weight: var(--fw-bold); color: var(--clr-text); font-family: var(--ff-display); margin: 0 0 var(--sp-1) 0;">Model Manager</h1>
          <p style="font-size: var(--fs-sm); color: var(--clr-text-muted); margin: 0;">Download, load, and manage speech recognition (ASR) and speech synthesis (TTS) models for local processing.</p>
        </div>

        ${errorMessage ? `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-lg); padding: var(--sp-3) var(--sp-4); color: #ef4444; font-size: var(--fs-sm); margin-bottom: var(--sp-4);">
            ${errorMessage}
          </div>
        ` : ''}

        <div style="padding: var(--sp-3) var(--sp-4); display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--clr-border); border-radius: var(--radius-lg); background: var(--clr-bg-subtle); margin-bottom: var(--sp-4);">
          <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <span style="color: var(--clr-text-faint); display: flex;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
            </span>
            <span id="models-dir-path" style="font-size: 11px; font-family: var(--ff-mono); color: var(--clr-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentModelsDir || 'Loading path...'}</span>
          </div>
          <div style="display: flex; gap: 14px; align-items: center; font-size: 12px; font-weight: 600; flex-shrink: 0;">
            ${window.electronAPI ? `
              <a href="#" id="btn-open-models-dir" style="color: var(--clr-text-muted); text-decoration: none; display: flex; align-items: center; gap: 4px;">Open</a>
            ` : ''}
            <a href="#" id="btn-change-models-dir" style="color: var(--clr-text-muted); text-decoration: none; display: flex; align-items: center; gap: 4px;">Change</a>
          </div>
        </div>

        <div>
          <h2 class="section-title">Transcription Models (ASR)</h2>
          <div class="models-list">
            ${asrModels.map(m => renderModelRow(m)).join('')}
          </div>
        </div>

        <div>
          <h2 class="section-title">Voice &amp; Speech Synthesis Models (TTS)</h2>
          <div class="models-list">
            ${ttsModels.map(m => renderModelRow(m)).join('')}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderModelRow(m) {
    const id = m.model_id;
    const isDownloaded = m.downloaded || m.status === 'downloaded' || m.status === 'loaded';
    const isDownloading = m.status === 'downloading';
    const isLoaded = m.loaded || m.status === 'loaded';
    const expanded = expandedModelKey === id;

    let statusIcon = '';
    if (isLoaded) {
      statusIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
    } else if (isDownloaded) {
      statusIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
    } else if (isDownloading) {
      statusIcon = `<div class="spinner-models-ring"></div>`;
    } else {
      statusIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
        </svg>
      `;
    }

    const chevronIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    `;

    let actionHtml = '';
    if (isLoaded) {
      actionHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 12px; color: #10b981; font-weight: 500;">✓ Model loaded in memory and ready.</span>
          <button class="btn btn-secondary btn-sm btn-delete-model" data-id="${id}" style="border-radius: var(--radius-full); padding: 5px 12px; font-size: 11px; color: #ef4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); font-weight: 600;">
            Remove Model
          </button>
        </div>
      `;
    } else if (isDownloaded) {
      actionHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 12px; color: var(--clr-primary); font-weight: 500;">✓ Model downloaded on disk.</span>
          <button class="btn btn-secondary btn-sm btn-delete-model" data-id="${id}" style="border-radius: var(--radius-full); padding: 5px 12px; font-size: 11px; color: #ef4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); font-weight: 600;">
            Remove Model
          </button>
        </div>
      `;
    } else if (isDownloading) {
      const pct = Math.round((m.progress || 0) * 100);
      const dlStr = formatBytes(m.bytes_downloaded);
      const totStr = formatBytes(m.bytes_total);
      const spdStr = formatSpeed(m.speed_bps);

      actionHtml = `
        <div class="download-progress-box">
          <div class="download-progress-track">
            <div class="download-progress-bar" style="width: ${pct}%"></div>
          </div>
          <div class="download-progress-text">
            <span>Downloading: ${dlStr} / ${totStr} (${pct}%) ${spdStr}</span>
            <a href="#" class="btn-cancel-dl" data-id="${id}" style="color: #ef4444; text-decoration: none;">Cancel</a>
          </div>
        </div>
      `;
    } else {
      actionHtml = `
        <button class="btn btn-primary btn-sm btn-dl" data-id="${id}" style="background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 6px 14px; font-size: 11px;">
          Download Model
        </button>
      `;
    }

    return `
      <div class="model-row ${expanded ? 'expanded' : ''}" data-model-id="${id}">
        <div class="model-row-header">
          <div class="model-row-left">
            <span class="model-status-icon">${statusIcon}</span>
            <span class="model-row-name">${m.name || id}</span>
          </div>
          <div class="model-row-right">
            <span class="model-row-size">${m.size_label || ''}</span>
            <span class="model-row-arrow">${chevronIcon}</span>
          </div>
        </div>
        ${expanded ? `
          <div class="model-row-details">
            <p class="model-details-desc">${m.description || ''}</p>
            <div class="model-details-meta">Minimum VRAM / Memory: <strong>${m.min_vram_mb ? m.min_vram_mb + ' MB' : 'CPU Light'}</strong></div>
            <div class="model-details-action">
              ${actionHtml}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindRowEvents(row) {
    row.querySelector('.btn-cancel-dl')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = row.getAttribute('data-model-id');
      cancelDownload(id);
    });
  }

  function bindEvents() {
    container.querySelectorAll('.model-row-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-dl') || e.target.closest('.btn-delete-model') || e.target.closest('.btn-cancel-dl')) return;
        const row = header.closest('.model-row');
        const id = row.getAttribute('data-model-id');
        expandedModelKey = expandedModelKey === id ? null : id;
        render();
      });
    });

    container.querySelectorAll('.btn-dl').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        triggerDownload(id);
      });
    });

    container.querySelectorAll('.btn-cancel-dl').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        cancelDownload(id);
      });
    });

    container.querySelectorAll('.btn-delete-model').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        deleteModel(id);
      });
    });

    document.getElementById('btn-open-models-dir')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.electronAPI && window.electronAPI.openPath && currentModelsDir) {
        await window.electronAPI.openPath(currentModelsDir);
      }
    });

    document.getElementById('btn-change-models-dir')?.addEventListener('click', async (e) => {
      e.preventDefault();
      let newPath = '';
      if (window.electronAPI && window.electronAPI.selectDirectory) {
        const result = await window.electronAPI.selectDirectory();
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          newPath = result.filePaths[0];
        }
      } else {
        newPath = prompt('Enter new absolute folder path for models:', currentModelsDir);
      }

      if (newPath) {
        newPath = newPath.trim();
        if (newPath && newPath !== currentModelsDir) {
          if (confirm(`Change models storage directory to:\n${newPath}?`)) {
            try {
              currentModelsDir = newPath;
              const dirEl = container.querySelector('#models-dir-path');
              if (dirEl) dirEl.textContent = newPath;

              if (window.electronAPI && window.electronAPI.saveSettings) {
                await window.electronAPI.saveSettings({ modelsDir: newPath });
              }

              const baseUrl = await getSidecarBaseUrl();
              let token = '';
              if (window.electronAPI && window.electronAPI.getSidecarToken) {
                try { token = await window.electronAPI.getSidecarToken(); } catch (err) {}
              }

              await fetch(`${baseUrl}/settings/models-dir`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'X-Sidecar-Token': token } : {})
                },
                body: JSON.stringify({ models_dir: newPath })
              });

              Utils.showToast(`Models directory updated to ${newPath}`);
              await fetchStatus();
              render();
            } catch (err) {
              Utils.showToast(`Failed to update models directory: ${err.message}`);
            }
          }
        }
      }
    });
  }

  init();
}

Router.register('dashboard/models', renderModelsPage);
