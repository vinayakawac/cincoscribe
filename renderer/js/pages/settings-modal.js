/* ===== Settings Page — CincoScribe (free, MIT) ===== */
/* All license, activation, and LemonSqueezy code removed.  */

async function renderSettingsPage(container) {
  let settings = { language: 'auto', whisperMode: 'base', modelsDir: '', internetAccessAllowed: true };

  if (window.electronAPI && window.electronAPI.getSettings) {
    try {
      settings = await window.electronAPI.getSettings();
    } catch (e) {
      console.warn('[Settings] Could not load settings:', e.message);
    }
  }

  let language = settings.language || 'auto';
  let whisperMode = settings.whisperMode || 'base';
  let modelsDir = settings.modelsDir || '';
  let internetAccessAllowed = settings.internetAccessAllowed !== false;

  if (AppState.internetAccessAllowed !== undefined) {
    internetAccessAllowed = AppState.internetAccessAllowed;
  }

  let activeTab = 'general';
  let isServerOnline = false;
  let logsInterval = null;
  let logsText = 'Loading logs...';

  let cudaStatus = null;
  let cudaPollInterval = null;

  function stopCudaPolling() {
    if (cudaPollInterval) {
      clearInterval(cudaPollInterval);
      cudaPollInterval = null;
    }
  }

  async function fetchCudaStatus() {
    try {
      let port = 5555;
      if (window.electronAPI) port = await window.electronAPI.getSidecarPort();
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      let token = '';
      if (window.electronAPI && window.electronAPI.getSidecarToken) {
        try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
      }
      const headers = token ? { 'X-Sidecar-Token': token } : {};
      const res = await fetch(`http://${hostname}:${port}/system/cuda-status`, { headers });
      if (res.ok) {
        cudaStatus = await res.json();
        if (cudaStatus.downloading && !cudaPollInterval) {
          cudaPollInterval = setInterval(async () => {
            await fetchCudaStatus();
            render();
          }, 800);
        } else if (!cudaStatus.downloading && cudaPollInterval) {
          stopCudaPolling();
        }
      }
    } catch (e) {
      console.warn('Failed to fetch CUDA status:', e);
      stopCudaPolling();
    }
  }

  // Check server health with fast timeout
  async function checkServerHealth() {
    try {
      let port = 5555;
      if (window.electronAPI && window.electronAPI.getSidecarPort) {
        port = await window.electronAPI.getSidecarPort();
      }
      let token = '';
      if (window.electronAPI && window.electronAPI.getSidecarToken) {
        try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
      }
      const headers = token ? { 'X-Sidecar-Token': token } : {};
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const res = await fetch(`http://${hostname}:${port}/health`, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      isServerOnline = res.ok;
    } catch (e) {
      isServerOnline = false;
    }
  }

  // Polling for server logs
  function startLogsPolling() {
    stopLogsPolling();
    fetchLogs();
    logsInterval = setInterval(fetchLogs, 1500);
  }

  function stopLogsPolling() {
    if (logsInterval) {
      clearInterval(logsInterval);
      logsInterval = null;
    }
  }

  async function fetchLogs() {
    try {
      let port = 5555;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`http://${hostname}:${port}/logs`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        logsText = data.logs.join('\n') || 'No logs recorded.';
        const logsEl = document.getElementById('terminal-logs');
        if (logsEl) {
          const atBottom = logsEl.scrollHeight - logsEl.clientHeight - logsEl.scrollTop < 100;
          logsEl.value = logsText;
          if (atBottom) {
            logsEl.scrollTop = logsEl.scrollHeight;
          }
        }
      }
    } catch (e) {
      logsText = 'Could not fetch logs from sidecar backend.';
      const logsEl = document.getElementById('terminal-logs');
      if (logsEl) logsEl.value = logsText;
    }
  }

  async function clearLogs() {
    try {
      let port = 5555;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      await fetch(`http://${hostname}:${port}/logs/clear`, { method: 'POST' });
      logsText = 'Logs cleared.';
      const logsEl = document.getElementById('terminal-logs');
      if (logsEl) logsEl.value = '';
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  }

  function init() {
    render();
    checkServerHealth().then(() => render());
  }

  function render() {
    if (!document.body.contains(container)) {
      stopLogsPolling();
      stopCudaPolling();
      return;
    }

    if (activeTab === 'logs') {
      startLogsPolling();
    } else {
      stopLogsPolling();
    }

    if (activeTab !== 'gpu') {
      stopCudaPolling();
    }

    const tabs = [
      {
        id: 'general',
        label: 'General',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
      },
      {
        id: 'gpu',
        label: 'GPU Acceleration',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`
      },
      {
        id: 'logs',
        label: 'System Logs',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`
      },
      {
        id: 'about',
        label: 'About',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
      }
    ];

    container.innerHTML = `
      <style>
        .settings-revamped {
          animation: fade-up 280ms cubic-bezier(0.16,1,0.3,1) both;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }
        .settings-header-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 20px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--clr-border);
        }
        .settings-title-group h2 {
          font-family: var(--ff-display);
          font-size: 22px;
          font-weight: 700;
          color: var(--clr-text);
          margin: 0 0 4px 0;
          letter-spacing: -0.02em;
        }
        .settings-title-group p {
          font-size: 13px;
          color: var(--clr-text-muted);
          margin: 0;
        }
        .settings-nav-pills {
          display: flex;
          gap: 6px;
          background: var(--clr-bg-subtle);
          padding: 4px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--clr-border);
          margin-bottom: 24px;
        }
        .settings-nav-pill {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: var(--clr-text-muted);
          font-size: 13px;
          font-weight: 500;
          padding: 9px 16px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 180ms ease;
          white-space: nowrap;
        }
        .settings-nav-pill:hover {
          color: var(--clr-text);
          background: rgba(255, 255, 255, 0.04);
        }
        .settings-nav-pill.active {
          color: var(--clr-text);
          background: var(--clr-surface-raised, #262626);
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .settings-card {
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin-bottom: 20px;
        }
        .settings-card-title {
          font-family: var(--ff-display);
          font-size: 15px;
          font-weight: 600;
          color: var(--clr-text);
          margin: 0 0 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .settings-card-subtitle {
          font-size: 12px;
          color: var(--clr-text-muted);
          margin: 0 0 16px 0;
        }
        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .setting-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .setting-row:first-child {
          padding-top: 0;
        }
        .setting-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--clr-text);
          margin: 0 0 2px 0;
        }
        .setting-desc {
          font-size: 11px;
          color: var(--clr-text-muted);
          margin: 0;
          line-height: 1.4;
        }
        .social-card {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg);
          text-decoration: none;
          transition: all 200ms ease;
        }
        .social-card:hover {
          border-color: var(--clr-border-hover);
          background: var(--clr-surface-raised);
        }

        /* ── Custom Styled Dropdowns ──────────────── */
        .select-wrapper-custom {
          position: relative;
          display: inline-block;
          min-width: 190px;
        }
        .select-wrapper-custom::after {
          content: '';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 5px solid var(--clr-text-muted, #a0a0a0);
          pointer-events: none;
          transition: border-top-color 150ms ease;
        }
        .select-wrapper-custom:hover::after {
          border-top-color: var(--clr-text, #ffffff);
        }
        .select-input-styled {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          width: 100%;
          padding: 8px 32px 8px 14px;
          background: var(--clr-surface-raised, #262626);
          border: 1px solid var(--clr-border, rgba(255,255,255,0.12));
          color: var(--clr-text, #ffffff);
          border-radius: var(--radius-md, 8px);
          font-size: 13px;
          font-weight: 500;
          font-family: var(--ff-sans);
          outline: none;
          cursor: pointer;
          transition: all 150ms ease;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        }
        .select-input-styled:hover {
          background: var(--clr-bg-muted, #303030);
          border-color: var(--clr-border-hover, rgba(255,255,255,0.24));
        }
        .select-input-styled:focus {
          border-color: var(--clr-primary, #f59e0b);
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
        }
        .select-input-styled option {
          background: #1d1d1d;
          color: #ffffff;
          padding: 10px;
          font-size: 13px;
        }

        /* Server input button group alignment */
        .server-input-group {
          display: flex;
          align-items: center;
          width: 100%;
          height: 34px;
          box-sizing: border-box;
        }
        .server-input-field {
          flex: 1;
          height: 34px !important;
          min-height: 34px !important;
          box-sizing: border-box;
          padding: 0 10px;
          background: var(--clr-bg);
          border: 1px solid var(--clr-border);
          border-right: none;
          color: var(--clr-text-muted);
          border-top-left-radius: var(--radius);
          border-bottom-left-radius: var(--radius);
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
          font-size: 11px;
          font-family: var(--ff-mono);
          margin: 0;
          outline: none;
        }
        .server-btn-action {
          height: 34px !important;
          min-height: 34px !important;
          box-sizing: border-box;
          padding: 0 14px;
          font-size: 11px;
          font-weight: 600;
          border-top-left-radius: 0 !important;
          border-bottom-left-radius: 0 !important;
          border-top-right-radius: var(--radius) !important;
          border-bottom-right-radius: var(--radius) !important;
          margin: 0 !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          white-space: nowrap;
          cursor: pointer;
        }
      </style>

      <div class="page-container settings-revamped">
        <!-- Header Banner -->
        <div class="settings-header-banner">
          <div class="settings-title-group">
            <h2>Preferences & Workstation</h2>
            <p>Manage local sidecar server, GPU acceleration, and system settings.</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="settings-nav-pills" aria-label="Settings categories">
          ${tabs.map(tab => `
            <button class="settings-nav-pill ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
              ${tab.icon}
              <span>${tab.label}</span>
            </button>
          `).join('')}
        </nav>

        <!-- Tab Body -->
        <div class="settings-tab-content">
          ${renderTabContent()}
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderTabContent() {
    if (activeTab === 'general') {
      return `
        <!-- Support Links Header -->
        <div style="display: flex; gap: 14px; margin-bottom: 20px;">
          <a href="https://ko-fi.com/vinayaka" target="_blank" class="social-card">
            <div>
              <h4 style="font-size: 13px; font-weight: 600; color: var(--clr-text); margin: 0 0 2px 0;">Support Development</h4>
              <p style="font-size: 11px; color: var(--clr-text-muted); margin: 0;">Donate on Ko-fi to support open-source work</p>
            </div>
            <span style="color: var(--clr-text-muted); font-size: 14px;">↗</span>
          </a>
          <a href="https://github.com/vinayakawac/CincoScribe" target="_blank" class="social-card">
            <div>
              <h4 style="font-size: 13px; font-weight: 600; color: var(--clr-text); margin: 0 0 2px 0;">GitHub Project</h4>
              <p style="font-size: 11px; color: var(--clr-text-muted); margin: 0;">View source code, releases and issues</p>
            </div>
            <span style="color: var(--clr-text-muted); font-size: 14px;">↗</span>
          </a>
        </div>

        <!-- Server Card (No Header Title/Subtitle) -->
        <div class="settings-card">
          <div class="setting-row">
            <div>
              <h4 class="setting-label">Server Connection</h4>
              <p class="setting-desc">Local address where sidecar backend process is running.</p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; width: 45%; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${isServerOnline ? '#10b981' : '#ef4444'}; box-shadow: 0 0 8px ${isServerOnline ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'};"></span>
                <span style="color: ${isServerOnline ? '#10b981' : '#ef4444'};">${isServerOnline ? 'Online' : 'Offline'}</span>
              </div>
              <div class="server-input-group">
                <input
                  id="settings-server-url"
                  type="text"
                  value="http://127.0.0.1:5555"
                  disabled
                  class="server-input-field"
                />
                ${isServerOnline ? `
                  <button id="btn-restart-server" class="btn btn-secondary server-btn-action" title="Restart Server" style="border: 1px solid var(--clr-border);" aria-label="Restart Server">
                    Restart Server
                  </button>
                ` : `
                  <button id="btn-start-server" class="btn btn-primary server-btn-action" title="Start Server" aria-label="Start Server">
                    Start Server
                  </button>
                `}
              </div>
            </div>
          </div>
        </div>

        <!-- Recognition & Interface Options Card -->
        <div class="settings-card">
          <div class="settings-card-title">
            <span>Recognition & Appearance</span>
          </div>
          <p class="settings-card-subtitle">Configure default transcription language and theme.</p>

          <div class="setting-row">
            <div>
              <h4 class="setting-label">Default Language</h4>
              <p class="setting-desc">Primary transcription language for new audio jobs.</p>
            </div>
            <div class="select-wrapper-custom">
              <select id="settings-language" class="select-input-styled">
                ${[
                  ['auto', 'Auto Detect'],
                  ['en', 'English'],
                  ['hi', 'Hindi'],
                  ['ar', 'Arabic'],
                  ['zh', 'Chinese'],
                  ['es', 'Spanish'],
                  ['fr', 'French'],
                  ['de', 'German'],
                  ['pt', 'Portuguese'],
                  ['ru', 'Russian'],
                  ['ja', 'Japanese'],
                  ['ko', 'Korean'],
                ].map(([val, label]) =>
                  `<option value="${val}" ${language === val ? 'selected' : ''}>${label}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="setting-row">
            <div>
              <h4 class="setting-label">Network Permission</h4>
              <p class="setting-desc">Allow online connections for downloading models and updates.</p>
            </div>
            <div class="select-wrapper-custom">
              <select id="settings-internet" class="select-input-styled">
                <option value="true" ${internetAccessAllowed === true ? 'selected' : ''}>Allowed (Online)</option>
                <option value="false" ${internetAccessAllowed === false ? 'selected' : ''}>Disabled (Strict Local)</option>
              </select>
            </div>
          </div>

          <div class="setting-row">
            <div>
              <h4 class="setting-label">Appearance Theme</h4>
              <p class="setting-desc">Application color interface theme mode.</p>
            </div>
            <div class="select-wrapper-custom">
              <select id="settings-theme" class="select-input-styled">
                <option value="dark" selected>Dark Theme</option>
                <option value="light">Light Theme</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Save Button Footer -->
        <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 10px;">
          <span id="save-status" style="display: none; margin-right: 14px; font-size: 13px; font-weight: 600; color: #10b981;">✓ Saved successfully</span>
          <button id="btn-save-settings" class="btn btn-primary" style="padding: 10px 24px; font-size: 13px;">Save Settings</button>
        </div>
      `;
    } else if (activeTab === 'gpu') {
      const isAvailable = cudaStatus?.available;
      const isActive = cudaStatus?.active;
      const isDownloading = cudaStatus?.downloading;
      const progress = cudaStatus?.download_progress || {};
      const isSupported = cudaStatus?.download_supported !== false;
      const reason = cudaStatus?.unsupported_reason || '';
      const lastStatus = progress.status || '';
      const hasFailed = !isDownloading && lastStatus.startsWith('Failed:');

      return `
        <div class="settings-card">
          <div class="settings-card-title">
            <span>Hardware Acceleration (CUDA GPU)</span>
          </div>
          <p class="settings-card-subtitle">Enable NVIDIA CUDA GPU acceleration for faster Whisper transcription and TTS.</p>

          <div style="background: var(--clr-bg); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: 18px; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--clr-text);">Active Execution Backend</h4>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--clr-text-muted);">
                  Current engine: <strong style="color: var(--clr-primary); font-size: 13px;">${isActive ? 'NVIDIA CUDA (GPU)' : 'Standard CPU Mode'}</strong>
                </p>
              </div>
              ${isAvailable ? `
                <button id="btn-toggle-cuda" class="btn ${isActive ? 'btn-secondary' : 'btn-primary'}" style="font-size: 12px; padding: 7px 16px;">
                  ${isActive ? 'Switch to CPU' : 'Enable CUDA GPU'}
                </button>
              ` : ''}
            </div>

            ${!isSupported ? `
              <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); padding: 12px; font-size: 12px; color: #ef4444;">
                ${escapeHtml(reason)}
              </div>
            ` : ''}

            ${hasFailed ? `
              <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); padding: 12px; font-size: 12px; color: #ef4444; display: flex; align-items: flex-start; gap: 8px;">
                <span style="flex-shrink: 0; font-size: 14px;">✕</span>
                <span>${escapeHtml(lastStatus.replace('Failed: ', ''))}</span>
              </div>
            ` : ''}

            ${isDownloading ? `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--clr-text-muted);">
                  <span>${escapeHtml(lastStatus || 'Downloading CUDA binaries...')}</span>
                  <span>${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) + '%' : ''}</span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--clr-bg-subtle); border-radius: 3px; overflow: hidden;">
                  <div style="height: 100%; width: ${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%; background: var(--clr-primary); transition: width 200ms ease;"></div>
                </div>
              </div>
            ` : ''}

            <div style="display: flex; gap: 10px; margin-top: 4px;">
              ${isSupported && !isAvailable && !isDownloading ? `
                <button id="btn-download-cuda" class="btn btn-primary" style="font-size: 13px;">
                  ${hasFailed ? 'Retry Download' : 'Download GPU Acceleration Package'}
                </button>
              ` : ''}
              ${isAvailable ? `
                <button id="btn-delete-cuda" class="btn btn-danger" style="font-size: 12px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 6px 14px;">
                  Remove GPU Binaries
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === 'logs') {
      return `
        <div class="settings-card" style="padding: 0; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--clr-surface-raised, #262626); border-bottom: 1px solid var(--clr-border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.6);"></span>
              <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--clr-text);">Sidecar Diagnostics Console</h4>
            </div>
            <button id="btn-clear-logs" class="btn btn-secondary" style="font-size: 11px; height: 28px; padding: 0 12px;">Clear Console</button>
          </div>
          <div style="padding: 14px; background: var(--clr-bg-code, #101010);">
            <textarea
              id="terminal-logs"
              readonly
              style="width: 100%; height: 360px; box-sizing: border-box; background: transparent; color: #a0a0a0; border: none; font-family: var(--ff-mono, monospace); font-size: 11px; line-height: 1.5; resize: none; overflow-y: auto; outline: none; margin: 0;"
            >${escapeHtml(logsText)}</textarea>
          </div>
        </div>
      `;
    } else if (activeTab === 'about') {
      return `
        <div class="settings-card">
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
              <img src="cincoscribe.png" alt="CincoScribe" style="width: 100%; height: 100%; object-fit: contain;">
            </div>
            <div>
              <h3 style="font-family: var(--ff-display); font-size: 20px; font-weight: 800; color: var(--clr-text); margin: 0 0 2px 0;">CincoScribe</h3>
              <p style="font-size: 12px; color: var(--clr-text-muted); margin: 0;">Version 0.1.0 • Offline Audio Workstation</p>
            </div>
          </div>

          <p style="font-size: 13px; color: var(--clr-text-muted); line-height: 1.6; margin: 0 0 20px 0;">
            CincoScribe is a local-first, privacy-focused speech transcription and voice synthesis workstation. All transcriptions and voice generations run locally on your computer—never sent to external cloud servers.
          </p>

          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid var(--clr-border);">
            <div>
              <p style="font-size: 12px; color: var(--clr-text-muted); margin: 0;">Developed by <strong style="color: var(--clr-text);">Vinayaka</strong></p>
              <p style="font-size: 11px; color: var(--clr-text-muted); margin: 2px 0 0 0;">Licensed under MIT License • 100% Free & Open Source</p>
            </div>
            <div style="display: flex; gap: 10px;">
              <a href="https://ko-fi.com/vinayaka" target="_blank" class="btn btn-primary" style="font-size: 12px; padding: 7px 16px; text-decoration: none;">
                Support on Ko-fi
              </a>
              <a href="https://github.com/vinayakawac/CincoScribe" target="_blank" class="btn btn-secondary" style="font-size: 12px; padding: 7px 16px; text-decoration: none;">
                GitHub Repo
              </a>
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function bindEvents() {
    // Server Control Actions
    const startServerBtn = document.getElementById('btn-start-server');
    if (startServerBtn) {
      startServerBtn.addEventListener('click', async () => {
        startServerBtn.disabled = true;
        startServerBtn.textContent = 'Starting...';
        if (window.electronAPI && window.electronAPI.startSidecar) {
          await window.electronAPI.startSidecar();
        }
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 200));
          await checkServerHealth();
          if (isServerOnline) break;
        }
        render();
      });
    }

    const restartServerBtn = document.getElementById('btn-restart-server');
    if (restartServerBtn) {
      restartServerBtn.addEventListener('click', async () => {
        restartServerBtn.disabled = true;
        restartServerBtn.textContent = 'Restarting...';
        if (window.electronAPI && window.electronAPI.restartSidecar) {
          await window.electronAPI.restartSidecar();
        }
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 200));
          await checkServerHealth();
          if (isServerOnline) break;
        }
        render();
      });
    }

    // Tab switching
    container.querySelectorAll('.settings-nav-pill[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        if (activeTab === 'gpu') {
          fetchCudaStatus().then(() => render());
        } else {
          render();
        }
      });
    });

    // GPU Actions
    const downloadBtn = document.getElementById('btn-download-cuda');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', async () => {
        try {
          let port = 5555;
          if (window.electronAPI) port = await window.electronAPI.getSidecarPort();
          const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
          let token = '';
          if (window.electronAPI && window.electronAPI.getSidecarToken) {
            try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
          }
          const headers = token ? { 'X-Sidecar-Token': token } : {};
          await fetch(`http://${hostname}:${port}/system/cuda/download`, { method: 'POST', headers });
          fetchCudaStatus().then(() => render());
        } catch (e) {
          console.error('Download CUDA error:', e);
        }
      });
    }

    const toggleBtn = document.getElementById('btn-toggle-cuda');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        const nextVariant = cudaStatus?.active ? 'cpu' : 'cuda';
        if (window.electronAPI && window.electronAPI.setBackendVariant) {
          await window.electronAPI.setBackendVariant(nextVariant);
        }
        fetchCudaStatus().then(() => render());
      });
    }

    const deleteBtn = document.getElementById('btn-delete-cuda');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to remove the GPU backend files from disk?')) return;
        try {
          let port = 5555;
          if (window.electronAPI) port = await window.electronAPI.getSidecarPort();
          const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
          let token = '';
          if (window.electronAPI && window.electronAPI.getSidecarToken) {
            try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
          }
          const headers = token ? { 'X-Sidecar-Token': token } : {};
          await fetch(`http://${hostname}:${port}/system/cuda/delete`, { method: 'POST', headers });
          if (window.electronAPI && window.electronAPI.setBackendVariant) {
            await window.electronAPI.setBackendVariant('cpu');
          }
          fetchCudaStatus().then(() => render());
        } catch (e) {
          console.error('Delete CUDA error:', e);
        }
      });
    }

    // Save Settings
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      language = document.getElementById('settings-language')?.value || language;
      const internetVal = document.getElementById('settings-internet')?.value === 'true';
      internetAccessAllowed = internetVal;

      AppState.internetAccessAllowed = internetVal;
      localStorage.setItem('internetAccessAllowed', internetVal ? 'true' : 'false');
      AppState.save();

      if (window.electronAPI && window.electronAPI.saveSettings) {
        await window.electronAPI.saveSettings({ language, whisperMode, modelsDir, internetAccessAllowed });
      }

      const statusEl = document.getElementById('save-status');
      if (statusEl) {
        statusEl.style.display = 'inline';
        setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      }
    });

    // Clear Logs
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      clearLogs();
    });
  }

  // Auto scroll terminal to bottom on tab load
  setTimeout(() => {
    const logsEl = document.getElementById('terminal-logs');
    if (logsEl) logsEl.scrollTop = logsEl.scrollHeight;
  }, 100);

  init();
}

Router.register('dashboard/settings', renderSettingsPage);
