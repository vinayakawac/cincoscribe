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



  // Check server health with fast timeout
  async function checkServerHealth() {
    try {
      let port = 5555;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const res = await fetch(`http://${hostname}:${port}/health`, { signal: controller.signal });
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
    // Render UI IMMEDIATELY so page load is 0ms instant
    render();
    // Check server health asynchronously in background
    checkServerHealth().then(() => render());
  }

  function render() {
    if (!document.body.contains(container)) {
      stopLogsPolling();
      return;
    }

    // Trigger log polling if logs tab is active
    if (activeTab === 'logs') {
      startLogsPolling();
    } else {
      stopLogsPolling();
    }

    const tabs = [
      { id: 'general', label: 'General' },
      { id: 'gpu', label: 'GPU' },
      { id: 'logs', label: 'Logs' },
      { id: 'about', label: 'About' }
    ];



    container.innerHTML = `
      <style>
        .settings-container {
          animation: fade-up 280ms cubic-bezier(0.16,1,0.3,1) both;
          width: 100%;
        }
        .settings-tab-btn {
          background: none;
          border: none;
          color: var(--clr-text-muted);
          font-size: 14px;
          font-weight: 500;
          padding: 8px 0;
          cursor: pointer;
          position: relative;
          transition: color 150ms ease;
        }
        .settings-tab-btn:hover {
          color: var(--clr-text);
        }
        .settings-tab-btn.active {
          color: var(--clr-text);
          font-weight: 600;
        }
        .settings-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -9px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: var(--clr-text);
        }
        .social-card {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-4);
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg);
          text-decoration: none;
          transition: all 200ms ease;
        }
        .social-card:hover {
          border-color: var(--clr-border-med);
          background: var(--clr-bg-muted);
        }
        .setting-group {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--sp-4) 0;
          border-bottom: 1px solid var(--clr-border);
        }
        .setting-group:last-child {
          border-bottom: none;
        }
        .setting-info {
          flex: 1;
          padding-right: var(--sp-4);
        }
        .setting-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--clr-text);
          margin: 0 0 4px 0;
        }
        .setting-desc {
          font-size: 11px;
          color: var(--clr-text-muted);
          margin: 0;
          line-height: 1.4;
        }
      </style>
      <div class="page-container page-sections settings-container" style="position: relative;">
        <!-- Navigation Tabs -->
        <div style="display: flex; gap: var(--sp-6); border-bottom: 1px solid var(--clr-border); margin-bottom: var(--sp-6);">
          ${tabs.map(tab => `
            <button class="settings-tab-btn ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>

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
        <!-- Support Links -->
        <div style="display: flex; gap: var(--sp-4); margin-bottom: var(--sp-6);">
          <a href="https://ko-fi.com/vinayaka" target="_blank" class="social-card">
            <div>
              <h4 style="font-size: 13px; font-weight: 600; color: var(--clr-text); margin: 0 0 4px 0;">Support on Ko-fi</h4>
              <p style="font-size: 11px; color: var(--clr-text-muted); margin: 0;">Consider donating to support development</p>
            </div>
            <span style="color: var(--clr-text-faint);">${Utils.icons.chevronRight || '→'}</span>
          </a>
          <a href="https://github.com/vinayakawac/CincoScribe" target="_blank" class="social-card">
            <div>
              <h4 style="font-size: 13px; font-weight: 600; color: var(--clr-text); margin: 0 0 4px 0;">Join the GitHub</h4>
              <p style="font-size: 11px; color: var(--clr-text-muted); margin: 0;">View codebase and report issues</p>
            </div>
            <span style="color: var(--clr-text-faint);">${Utils.icons.chevronRight || '→'}</span>
          </a>
        </div>

        <!-- Server URL -->
        <div class="setting-group" style="padding-top: 0;">
          <div class="setting-info">
            <h4 class="setting-label">Server URL</h4>
            <p class="setting-desc">The address of your CincoScribe sidecar backend server.</p>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-2); width: 40%; min-width: 200px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${isServerOnline ? '#10b981' : '#ef4444'};"></span>
              <span style="color: ${isServerOnline ? '#10b981' : '#ef4444'};">${isServerOnline ? 'Online' : 'Offline'}</span>
            </div>
            <input
              id="settings-server-url"
              type="text"
              value="http://127.0.0.1:5555"
              disabled
              style="width: 100%; padding: 6px 10px; background: var(--clr-bg); border: 1px solid var(--clr-border); color: var(--clr-text-muted); border-radius: var(--radius); font-size: 12px; font-family: var(--ff-mono);"
            />
          </div>
        </div>

        <!-- Default Language -->
        <div class="setting-group">
          <div class="setting-info">
            <h4 class="setting-label">Language</h4>
            <p class="setting-desc">Choose the default transcription target language.</p>
          </div>
          <select id="settings-language" style="padding: 6px 10px; background: var(--clr-bg); border: 1px solid var(--clr-border); color: var(--clr-text); border-radius: var(--radius); font-size: 13px; min-width: 150px;">
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

        <!-- Internet Access -->
        <div class="setting-group">
          <div class="setting-info">
            <h4 class="setting-label">Internet Access</h4>
            <p class="setting-desc">Permit downloading models and checking for updates online.</p>
          </div>
          <select id="settings-internet" style="padding: 6px 10px; background: var(--clr-bg); border: 1px solid var(--clr-border); color: var(--clr-text); border-radius: var(--radius); font-size: 13px; min-width: 150px;">
            <option value="true" ${internetAccessAllowed === true ? 'selected' : ''}>On</option>
            <option value="false" ${internetAccessAllowed === false ? 'selected' : ''}>Off</option>
          </select>
        </div>

        <!-- Theme Selection -->
        <div class="setting-group">
          <div class="setting-info">
            <h4 class="setting-label">Theme</h4>
            <p class="setting-desc">Match your system appearance, or select dark view mode.</p>
          </div>
          <select id="settings-theme" style="padding: 6px 10px; background: var(--clr-bg); border: 1px solid var(--clr-border); color: var(--clr-text); border-radius: var(--radius); font-size: 13px; min-width: 150px;">
            <option value="dark" selected>Dark</option>
            <option value="light">Light</option>
          </select>
        </div>



        <!-- Footer Action -->
        <div style="display: flex; justify-content: flex-end; margin-top: var(--sp-6);">
          <button id="btn-save-settings" class="btn btn-primary">Save Settings</button>
          <span id="save-status" style="display: none; margin-left: 12px; align-self: center; font-size: 13px; color: #10b981;">Saved!</span>
        </div>
      `;
    } else if (activeTab === 'gpu') {
      return `
        <div style="text-align: center; padding: var(--sp-8) 0; display: flex; flex-direction: column; align-items: center; gap: var(--sp-4);">
          <div style="font-size: 48px; color: var(--clr-text-muted); margin-bottom: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div>
            <h3 style="font-family: var(--ff-display); font-size: 18px; font-weight: 700; color: var(--clr-text); margin: 0;">GPU Acceleration</h3>
            <p style="font-size: 13px; color: var(--clr-text-muted); margin: 6px 0 0 0;">Inference is automatically accelerated via CUDA if matching hardware is detected.</p>
          </div>
        </div>
      `;
    } else if (activeTab === 'logs') {
      return `
        <div style="display: flex; flex-direction: column; height: 350px;">
          <textarea
            id="terminal-logs"
            readonly
            style="flex: 1; background: var(--clr-bg-code); color: #86868b; border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: var(--sp-4); font-family: var(--ff-mono); font-size: 11px; line-height: 1.5; resize: none; overflow-y: auto; outline: none; margin-bottom: var(--sp-3);"
          >${escapeHtml(logsText)}</textarea>
          <div style="display: flex; justify-content: flex-end; gap: var(--sp-2);">
            <button id="btn-clear-logs" class="btn btn-secondary" style="font-size: 12px; height: 32px; padding: 0 16px;">Clear Logs</button>
          </div>
        </div>
      `;
    } else if (activeTab === 'about') {
      return `
        <div style="padding: var(--sp-2) 0;">
          <h2 style="font-family: var(--ff-display); font-size: 20px; font-weight: 800; color: var(--clr-text); margin: 0 0 4px 0;">CincoScribe</h2>
          <p style="font-size: 12px; color: var(--clr-text-faint); margin: 0 0 var(--sp-4) 0;">Version 0.1.0 • Built on Electron & FastAPI</p>
          
          <p style="font-size: 13px; color: var(--clr-text-muted); line-height: 1.6; margin: 0 0 var(--sp-6) 0; max-width: 600px;">
            A local-first, privacy-focused speech transcription and voice synthesis workstation. All audio transcription and voice generations are processed locally on your computer—never sent to the cloud.
          </p>

          <p style="font-size: 12px; color: var(--clr-text-faint); margin: 0 0 8px 0; font-weight: 500;">
            Created by <span style="color: var(--clr-text-muted); font-weight: 600;">Vinayaka</span>
          </p>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <a href="https://ko-fi.com/vinayaka" target="_blank" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; font-size: 13px; padding: 6px 16px;">
              Support on Ko-fi
            </a>
            <a href="https://github.com/vinayakawac/CincoScribe" target="_blank" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; font-size: 13px; padding: 6px 16px;">
              GitHub Repository
            </a>
          </div>
          <p style="font-size: 11px; color: var(--clr-text-faint); margin-top: var(--sp-4);">Licensed under MIT License • 100% Offline & Private</p>
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
    // Tab switching
    container.querySelectorAll('.settings-tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        render();
      });
    });

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
