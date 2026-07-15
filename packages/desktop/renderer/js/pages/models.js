/* ===== Models Page ===== */

function renderModelsPage(container) {
  let modelStatus = {
    asr: { base: true, small: false, medium: false, large: false, turbo: false },
    tts: { kokoro: false }
  };
  let currentModelsDir = '';
  let isDownloading = {};
  let errorMessage = '';

  async function fetchStatus() {
    try {
      let port = 3901;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const res = await fetch(`http://127.0.0.1:${port}/engines/models/status`);
      if (res.ok) {
        const data = await res.json();
        modelStatus = data;
        currentModelsDir = data.current_models_dir || '';
        errorMessage = '';
      } else {
        errorMessage = 'Failed to fetch model status from sidecar backend.';
      }
    } catch (e) {
      errorMessage = 'Sidecar backend offline or unreachable.';
    }
  }

  async function triggerDownload(modelType, modelName) {
    const key = `${modelType}:${modelName}`;
    if (isDownloading[key]) return;
    
    isDownloading[key] = true;
    errorMessage = '';
    render();

    try {
      let port = 3901;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const res = await fetch(`http://127.0.0.1:${port}/engines/models/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: modelType, model_name: modelName })
      });
      if (res.ok) {
        isDownloading[key] = false;
        await fetchStatus();
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Download failed');
      }
    } catch (e) {
      isDownloading[key] = false;
      errorMessage = `Download failed: ${e.message}`;
    }
    render();
  }

  async function init() {
    await fetchStatus();
    render();
  }

  function render() {
    const asrModels = [
      { name: 'Whisper Base', key: 'base', size: '145 MB', cpu: 'Light', desc: 'Default pre-installed model. Fast and fits most normal transcription tasks.' },
      { name: 'Whisper Small', key: 'small', size: '460 MB', cpu: 'Medium', desc: 'Balanced accuracy and resource usage. Requires download.' },
      { name: 'Whisper Medium', key: 'medium', size: '1.5 GB', cpu: 'Heavy', desc: 'High accuracy for complex audio or multiple accents. Requires download.' },
      { name: 'Whisper Large', key: 'large', size: '3.0 GB', cpu: 'Very Heavy', desc: 'Maximum accuracy model. Slow on low-end CPUs. Requires download.' },
      { name: 'Whisper Turbo', key: 'turbo', size: '1.6 GB', cpu: 'Heavy', desc: 'Optimized large model. High accuracy with faster runtime. Requires download.' }
    ];

    const ttsModels = [
      { name: 'Kokoro TTS (v0.19)', key: 'kokoro', size: '85 MB', cpu: 'Light', desc: 'High quality text-to-speech engine. Requires download.' }
    ];

    container.innerHTML = `
      <style>
        .spinner-small {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin-models 1s linear infinite;
          display: inline-block;
        }
        @keyframes spin-models {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="page-container page-sections">
        <div class="page-header">
          <h1 class="page-title">Model <span class="page-title-sub">Management</span></h1>
          <p class="page-subtitle">View, download, and configure your local transcription and voice synthesis models</p>
        </div>

        ${errorMessage ? `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-lg); padding: var(--sp-4); color: #ef4444; font-size: var(--fs-sm); display: flex; gap: var(--sp-2); align-items: center;">
            <span>${Utils.icons.info}</span>
            <span>${errorMessage}</span>
          </div>
        ` : ''}

        ${currentModelsDir ? `
          <div class="card" style="padding: var(--sp-4); display: flex; align-items: center; justify-content: space-between; border-color: var(--clr-border);">
            <div style="display: flex; align-items: center; gap: var(--sp-3);">
              <div style="font-size: 20px; display: flex; color: var(--clr-text-muted);">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                  <path d="M3.3 7 12 12l8.7-5"/>
                  <path d="M12 22V12"/>
                </svg>
              </div>
              <div>
                <p style="font-size: var(--fs-xs); color: var(--clr-text-faint); margin: 0; text-transform: uppercase; font-weight: var(--fw-bold);">Active Storage Path</p>
                <p style="font-size: var(--fs-sm); font-family: var(--ff-mono); color: var(--clr-text-muted); margin: 0; margin-top: 2px; word-break: break-all;">${currentModelsDir}</p>
              </div>
            </div>
          </div>
        ` : ''}

        <div style="margin-top: var(--sp-4);">
          <h2 style="font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--clr-text); margin-bottom: var(--sp-3);">Transcription Models (ASR)</h2>
          <div class="models-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-4);">
            ${asrModels.map(model => {
              const installed = modelStatus.asr[model.key];
              const dlKey = `asr:${model.key}`;
              const downloading = isDownloading[dlKey];
              return renderModelCard('asr', model, installed, downloading);
            }).join('')}
          </div>
        </div>

        <div style="margin-top: var(--sp-6);">
          <h2 style="font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--clr-text); margin-bottom: var(--sp-3);">Speech Synthesis Models (TTS)</h2>
          <div class="models-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-4);">
            ${ttsModels.map(model => {
              const installed = modelStatus.tts[model.key];
              const dlKey = `tts:${model.key}`;
              const downloading = isDownloading[dlKey];
              return renderModelCard('tts', model, installed, downloading);
            }).join('')}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderModelCard(type, model, installed, downloading) {
    let buttonHtml = '';
    let statusBadge = '';

    if (installed) {
      statusBadge = `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: var(--fw-semibold);">Installed</span>`;
      buttonHtml = `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.6; cursor: not-allowed;">Ready</button>`;
    } else if (downloading) {
      statusBadge = `<span style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: var(--fw-semibold);">Downloading...</span>`;
      buttonHtml = `<button class="btn btn-secondary btn-sm" disabled style="display: flex; align-items: center; gap: 6px;"><div class="spinner-small"></div> Downloading</button>`;
    } else {
      statusBadge = `<span style="background: rgba(107, 114, 128, 0.1); color: var(--clr-text-muted); border: 1px solid var(--clr-border); font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: var(--fw-semibold);">Not Downloaded</span>`;
      buttonHtml = `<button class="btn btn-primary btn-sm btn-dl" data-type="${type}" data-name="${model.key}">Download</button>`;
    }

    return `
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; gap: var(--sp-3); border-color: var(--clr-border);">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <h3 style="font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--clr-text); margin: 0;">${model.name}</h3>
            ${statusBadge}
          </div>
          <div style="display: flex; gap: var(--sp-2); margin-top: var(--sp-2);">
            <span style="font-size: var(--fs-xs); color: var(--clr-text-faint);">Size: <strong>${model.size}</strong></span>
            <span style="font-size: var(--fs-xs); color: var(--clr-text-faint);">|</span>
            <span style="font-size: var(--fs-xs); color: var(--clr-text-faint);">CPU Load: <strong>${model.cpu}</strong></span>
          </div>
          <p style="font-size: var(--fs-xs); color: var(--clr-text-muted); margin-top: var(--sp-3); line-height: 1.4;">${model.desc}</p>
        </div>
        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--clr-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
          ${buttonHtml}
        </div>
      </div>
    `;
  }

  function bindEvents() {
    container.querySelectorAll('.btn-dl').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const name = btn.getAttribute('data-name');
        triggerDownload(type, name);
      });
    });
  }

  init();
}

Router.register('dashboard/models', renderModelsPage);
