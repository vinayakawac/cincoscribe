// Module-level persistent page state across tab switches
let text = '';
let selectedVoice = 'Bella';
let selectedProfileId = null; // Set when a custom voice profile is selected
let speed = 1.0;
let modelSize = 'kokoro';
let isGenerating = false;
let ttsProgressPct = 0;
let ttsStatusMessage = '';
let generationError = null;
let generatedAudioBase64 = null;
let generatedAudioDuration = 0;
let showVoiceGrid = false;
let showProfileModal = false;
let activeProfileDetailId = null; // Profile ID currently being edited in modal

let customProfiles = [];
let profileSamplesMap = {};

// Audio file upload state & timeline per profile
let selectedFileMap = {}; // profileId -> File
let sampleTimelineState = {}; // profileId -> { startTime, endTime, duration, autoTranscribe }

// Default fallback models
let downloadedModels = [
  { id: 'kokoro', name: 'Kokoro 82M (Local)' }
];

function renderTextToVoicePage(container) {

  const presetVoices = [
    { name: 'Bella', gender: 'Female', tag: 'Clear' },
    { name: 'Jasper', gender: 'Male', tag: 'Warm' },
    { name: 'Luna', gender: 'Female', tag: 'Soft' },
    { name: 'Bruno', gender: 'Male', tag: 'Deep' },
    { name: 'Rosie', gender: 'Female', tag: 'Expressive' },
    { name: 'Hugo', gender: 'Male', tag: 'Formal' },
    { name: 'Kiki', gender: 'Female', tag: 'Energetic' },
    { name: 'Leo', gender: 'Male', tag: 'Friendly' }
  ];

  async function getSidecarBaseUrl() {
    let port = 5555;
    if (window.electronAPI && window.electronAPI.getSidecarPort) {
      try {
        const p = await window.electronAPI.getSidecarPort();
        if (p) port = p;
      } catch (e) { }
    }
    const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? '127.0.0.1'
      : (window.location.hostname || '127.0.0.1');
    return `http://${hostname}:${port}`;
  }

  async function getSidecarHeaders() {
    const headers = {};
    if (window.electronAPI && window.electronAPI.getSidecarToken) {
      try {
        const token = await window.electronAPI.getSidecarToken();
        if (token) headers['X-Sidecar-Token'] = token;
      } catch (e) { }
    }
    return headers;
  }

  async function fetchCustomProfiles() {
    try {
      const baseUrl = await getSidecarBaseUrl();
      const headers = await getSidecarHeaders();
      let res = await fetch(`${baseUrl}/voices`, { headers });
      if (!res.ok) {
        res = await fetch(`${baseUrl}/profiles`, { headers });
      }
      if (res.ok) {
        const data = await res.json();
        const profilesList = Array.isArray(data.voices) ? data.voices : (Array.isArray(data.profiles) ? data.profiles : []);
        customProfiles = profilesList;
        render();
      }
    } catch (e) {
      console.warn('[tts] Failed to fetch voices from sidecar:', e);
    }
  }

  async function fetchModelStatus() {
    try {
      const baseUrl = await getSidecarBaseUrl();
      const headers = await getSidecarHeaders();
      let res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        res = await fetch(`${baseUrl}/engines/models/status`, { headers });
      }
      if (res.ok) {
        const data = await res.json();
        const modelsArr = Array.isArray(data.models) ? data.models : [];
        const ttsModelsInfo = [
          { id: 'kokoro', name: 'Kokoro 82M (Local)' },
          { id: 'qwen_1_7b', name: 'Qwen TTS 1.7B' },
          { id: 'qwen_0_6b', name: 'Qwen TTS 0.6B' },
          { id: 'qwen_custom_1_7b', name: 'Qwen CustomVoice 1.7B' },
          { id: 'qwen_custom_0_6b', name: 'Qwen CustomVoice 0.6B' },
          { id: 'luxtts', name: 'LuxTTS (Fast)' },
          { id: 'chatterbox_tts', name: 'Chatterbox TTS' },
          { id: 'chatterbox_turbo', name: 'Chatterbox Turbo' },
          { id: 'tada_1b', name: 'TADA 1B (English)' },
          { id: 'tada_3b', name: 'TADA 3B Multilingual' }
        ];

        const trueDownloaded = ttsModelsInfo.filter(m => {
          if (m.id === 'kokoro') return true;
          const found = modelsArr.find(x => x && x.model_id === m.id);
          if (found) return found.downloaded || found.status === 'downloaded' || found.status === 'loaded';
          return data.tts && data.tts[m.id] === true;
        });

        if (trueDownloaded.length > 0) {
          downloadedModels = trueDownloaded;
        }

        if (!Array.isArray(downloadedModels) || downloadedModels.length === 0) {
          downloadedModels = [{ id: 'kokoro', name: 'Kokoro 82M (Local)' }];
        }

        if (!downloadedModels.some(m => m && m.id === modelSize)) {
          modelSize = downloadedModels[0].id;
        }
        render();
      }
    } catch (e) {
      console.error('Failed to fetch model status', e);
    }
  }

  function render() {
    container.innerHTML = `
      <div class="page-container no-scroll-layout">
        <div class="split-layout">
          <div class="layout-main">
            ${renderTextInputZone()}
            ${renderErrorBanner()}
            ${isGenerating ? renderProgress() : ''}
            ${renderMainActionRow()}
          </div>
          <div class="layout-sidebar" style="gap: var(--sp-5);">
            <!-- Voice Selector -->
            ${renderVoiceSelectorZone()}

            <!-- Voice selection grid (shown only if expanded) -->
            ${showVoiceGrid ? renderVoiceGrid() : ''}

            <!-- Model Selector -->
            ${renderModelSelectorZone()}

            <!-- Speed control -->
            ${renderSpeedControlZone()}

            <!-- Generated Audio Player -->
            ${renderAudioPlayerZone()}
          </div>
        </div>

        <!-- Voice Management Modal -->
        ${showProfileModal ? renderVoiceProfileModal() : ''}
      </div>
    `;
    bindEvents();
  }

  function renderTextInputZone() {
    return `
      <div style="display:flex; flex-direction:column; gap:var(--sp-2); flex: 1; min-height: 0;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label class="form-label" style="margin-bottom:0; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; font-weight: 700; color: var(--clr-text-faint);">Input Text</label>
          ${text.trim() ? `<button class="btn-ghost" id="btn-clear-text" style="padding: 2px 8px; font-size: 11px;">Clear Text</button>` : ''}
        </div>
        <div class="textarea-wrapper" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
          <textarea class="textarea" id="tts-text-input" placeholder="Type or paste your text here to convert it to speech..." maxlength="2000" style="flex: 1; min-height: 100px; height: 100%; resize: none; font-size: 14px; line-height: 1.6; border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-xl); padding: var(--sp-5);">${escapeHtml(text)}</textarea>
        </div>
      </div>
    `;
  }

  function renderVoiceSelectorZone() {
    let desc = 'Preset Voice';
    if (selectedProfileId) {
      const prof = customProfiles.find(p => p.id === selectedProfileId);
      if (prof) {
        desc = `Cloned Voice (${prof.sample_count || 0} samples)`;
      }
    } else {
      const voiceDescMap = {
        'Bella': 'Clear & Professional Voice',
        'Jasper': 'Warm & Natural Narration Voice',
        'Luna': 'Soft & Peaceful Audiobook Voice',
        'Bruno': 'Deep & Engaging Podcast Voice',
        'Rosie': 'Expressive & Energetic Ad Voice',
        'Hugo': 'Formal & Clear Presentation Voice',
        'Kiki': 'Energetic & Fun Character Voice',
        'Leo': 'Friendly & Welcoming Assistant Voice'
      };
      desc = voiceDescMap[selectedVoice] || 'Natural Speech Voice';
    }

    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Voice</label>
          <button class="btn-ghost" id="btn-open-profile-manager" style="font-size: 11px; padding: 2px 8px; color: var(--clr-primary); font-weight: 600;">
            + Manage Voices
          </button>
        </div>
        <div class="voice-select-card" id="btn-select-voice" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); transition: background var(--dur-fast);">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; width: 90%;">
            <span style="font-size: 13px; font-weight: 500; color: var(--clr-text); text-overflow: ellipsis; overflow: hidden;">${escapeHtml(selectedVoice)} - ${desc}</span>
          </div>
          <span style="color: var(--clr-text-muted); font-size: 12px; margin-left: 6px; transform: ${showVoiceGrid ? 'rotate(90deg)' : 'none'}; transition: transform var(--dur-fast);">&gt;</span>
        </div>
      </div>
    `;
  }

  function renderVoiceGrid() {
    return `
      <div class="settings-section-card" style="padding: 10px; border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); margin-top: -8px;">
        ${customProfiles.length > 0 ? `
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--clr-primary); margin-bottom: 6px; letter-spacing: 0.05em;">Cloned Voices</div>
          <div class="voice-grid" style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: var(--sp-2); margin-bottom: 12px;">
            ${customProfiles.map(p => `
              <div class="voice-card ${selectedProfileId === p.id ? 'selected' : ''}" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}" style="padding: 8px; gap: 4px; border-radius: var(--radius-md); border: none;">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                  <div class="voice-card-name" style="font-size: 12px; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(p.name)}</div>
                  <div class="mode-radio" style="width: 12px; height: 12px; border-width: 1.5px;"></div>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; font-size: 9px; color: var(--clr-text-faint);">
                  <span>${p.sample_count || 0} samples</span>
                  <span class="voice-tag" style="font-size: 8px; padding: 1px 4px; margin:0; background: rgba(59, 130, 246, 0.15); color: #60a5fa;">Cloned</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--clr-text-faint); margin-bottom: 6px; letter-spacing: 0.05em;">Preset Voices</div>
        ` : ''}
        
        <div class="voice-grid" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: var(--sp-2); max-height: 160px; overflow-y: auto;">
          ${presetVoices.map(voice => `
            <div class="voice-card ${(!selectedProfileId && selectedVoice === voice.name) ? 'selected' : ''}" data-preset-name="${voice.name}" style="padding: 8px; gap: 4px; border-radius: var(--radius-md); border: none;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div class="voice-card-name" style="font-size: 12px; font-weight: 600;">${voice.name}</div>
                <div class="mode-radio" style="width: 12px; height: 12px; border-width: 1.5px;"></div>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; font-size: 9px; color: var(--clr-text-faint);">
                <span>${voice.gender}</span>
                <span class="voice-tag" style="font-size: 8px; padding: 1px 3px; margin:0;">${voice.tag}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderModelSelectorZone() {
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Model</label>
        
        <div style="position: relative; width: 100%;">
          <select id="select-model" style="width: 100%; padding: 12px 16px; font-size: 13px; font-weight: 500; color: var(--clr-text); border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); outline: none; appearance: none; cursor: pointer;">
            ${downloadedModels.map(m => `
              <option value="${m.id}" ${modelSize === m.id ? 'selected' : ''}>${m.name}</option>
            `).join('')}
          </select>
          <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--clr-text-muted); font-size: 10px;">
            ▼
          </div>
        </div>
      </div>
    `;
  }

  function renderSpeedControlZone() {
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Speed</label>
          <span id="speed-val" style="font-size: 12px; font-weight: bold; color: var(--clr-primary);">${speed.toFixed(1)}x</span>
        </div>
        <div style="padding: 12px 16px; border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); display: flex; align-items: center; min-height: 48px;">
          <input type="range" min="0.5" max="2.0" step="0.1" value="${speed}" id="speed-slider" style="width: 100%; accent-color: var(--clr-primary); cursor: pointer;">
        </div>
      </div>
    `;
  }

  function renderAudioPlayerZone() {
    if (!generatedAudioBase64) return '';

    return `
      <div class="audio-player-wrap" style="border: none; padding: 14px 18px; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <div class="transcript-title" style="margin:0; font-size: var(--fs-xs);">Generated Speech</div>
          <button class="btn-ghost" id="btn-download-speech" style="font-size: 11px;">
            ${Utils.icons.download} Download
          </button>
        </div>
        <audio id="tts-audio-player" style="display: none;"></audio>
        
        <div class="custom-player" style="display: flex; align-items: center; gap: var(--sp-3);">
          <button class="player-btn" id="custom-play-pause-btn" style="width: 32px; height: 32px; border-radius: 50%; background: var(--clr-primary); color: black; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;">
            ${Utils.icons.play}
          </button>
          
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <div class="player-slider" id="player-slider" style="height: 4px; background: var(--clr-border-med); border-radius: var(--radius-full); cursor: pointer; position: relative;">
              <div class="player-progress" id="player-progress" style="width: 0%; height: 100%; background: var(--clr-primary); border-radius: var(--radius-full);"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--clr-text-faint);">
              <span id="player-time-current">0:00</span>
              <span id="player-time-duration">${Utils.formatTimestamp(generatedAudioDuration)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMainActionRow() {
    const disabled = !text.trim() || isGenerating;
    return `
      <div style="display:flex; align-items:center; justify-content:flex-end; margin-top:var(--sp-2);">
        <button class="btn btn-primary" id="btn-generate-speech" ${disabled ? 'disabled' : ''} style="background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 10px 24px; font-size: 13px;">
          ${isGenerating ? 'Generating speech...' : 'Generate speech'}
        </button>
      </div>
    `;
  }

  function renderErrorBanner() {
    if (!generationError) return '';
    return `
      <div class="transcript-panel" style="margin-top: 14px; border: 1px solid rgba(239, 68, 68, 0.4); padding: 14px 18px; background: rgba(239, 68, 68, 0.15); border-radius: var(--radius-lg); width: 100%;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <span style="color: #ef4444; font-size: 16px; font-weight: bold; line-height: 1;">✕</span>
          <div style="flex: 1;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #ef4444;">Speech Generation Failed</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #fca5a5; line-height: 1.4; word-break: break-word;">${escapeHtml(generationError)}</p>
          </div>
          <button class="btn-ghost" id="btn-dismiss-error" style="color: #fca5a5; border: none; background: transparent; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1;">&times;</button>
        </div>
      </div>
    `;
  }

  function renderProgress() {
    return `
      <div class="transcript-panel" style="margin-top: 14px; border: none; padding: 14px 18px; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); width: 100%;">
        <div class="progress-container" id="progress-area" style="padding: 0; display: flex; flex-direction: column; gap: 8px;">
          <div class="progress-bar-wrapper" style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 9999px; overflow: hidden; position: relative;">
            <div class="progress-bar-fill" id="progress-bar" style="width:${ttsProgressPct}%; height: 100%; background: linear-gradient(90deg, var(--clr-primary), #60a5fa); border-radius: 9999px; transition: width 0.2s ease;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <p class="progress-label" id="progress-status" style="margin: 0; font-size: 11px; color: var(--clr-text-muted); font-weight: 500;">${ttsStatusMessage || 'Preparing...'}</p>
            <p class="progress-percent" id="progress-pct" style="margin: 0; font-size: 11px; color: var(--clr-primary); font-weight: 700;">${Math.round(ttsProgressPct)}%</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderVoiceProfileModal() {
    return `
      <div class="modal-backdrop" id="modal-profile-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div class="modal-card" style="background: #141414; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-xl); width: 100%; max-width: 640px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Modal Header -->
          <div style="padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #fff;">Voice Management</h3>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--clr-text-muted);">Create custom voices and upload audio reference samples for speech synthesis.</p>
            </div>
            <button class="btn-ghost" id="btn-close-profile-modal" style="font-size: 18px; line-height: 1; color: var(--clr-text-muted); border: none; cursor: pointer;">&times;</button>
          </div>

          <!-- Modal Content -->
          <div style="padding: 20px 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
            <!-- Create New Voice Card -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-lg); padding: 16px;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--clr-primary); margin-bottom: 12px; letter-spacing: 0.05em;">Create New Voice</div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <input type="text" id="input-new-profile-name" placeholder="Voice Name (e.g. My Voice, Narrator)" style="width: 100%; padding: 10px 14px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); color: #fff; font-size: 13px; outline: none;">
                <input type="text" id="input-new-profile-desc" placeholder="Description (optional)" style="width: 100%; padding: 10px 14px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); color: #fff; font-size: 13px; outline: none;">
                <div style="display: flex; justify-content: flex-end;">
                  <button class="btn btn-primary btn-sm" id="btn-submit-create-profile" style="background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 8px 18px; font-size: 12px;">
                    Create Voice
                  </button>
                </div>
              </div>
            </div>

            <!-- Existing Voices List -->
            <div>
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--clr-text-faint); margin-bottom: 12px; letter-spacing: 0.05em;">Your Voices (${customProfiles.length})</div>
              ${customProfiles.length === 0 ? `
                <div style="text-align: center; padding: 24px; background: rgba(255,255,255,0.02); border-radius: var(--radius-lg); color: var(--clr-text-muted); font-size: 13px;">
                  No custom voices created yet. Create your first voice above to get started.
                </div>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                  ${customProfiles.map(p => `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-lg); padding: 14px 16px;">
                      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div>
                          <span style="font-size: 14px; font-weight: 700; color: #fff;">${escapeHtml(p.name)}</span>
                          <span style="font-size: 11px; margin-left: 8px; color: var(--clr-primary); background: rgba(59, 130, 246, 0.15); padding: 2px 6px; border-radius: var(--radius-full);">${p.sample_count || 0} samples</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                          <button class="btn btn-ghost btn-sm btn-manage-profile-samples" data-profile-id="${p.id}" style="font-size: 11px; padding: 4px 10px; color: #60a5fa;">
                            ${activeProfileDetailId === p.id ? 'Close Samples' : 'Manage Samples'}
                          </button>
                          <button class="btn btn-ghost btn-sm btn-delete-profile" data-profile-id="${p.id}" style="font-size: 11px; padding: 4px 10px; color: #ef4444;">
                            Delete
                          </button>
                        </div>
                      </div>
                      ${p.description ? `<p style="margin: 0 0 8px 0; font-size: 12px; color: var(--clr-text-muted);">${escapeHtml(p.description)}</p>` : ''}

                      <!-- Expanded Samples Panel -->
                      ${activeProfileDetailId === p.id ? renderProfileSamplesSection(p) : ''}
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderProfileSamplesSection(profile) {
    const samples = profileSamplesMap[profile.id] || [];
    const selectedFile = selectedFileMap[profile.id];
    const tState = sampleTimelineState[profile.id] || { startTime: 0, endTime: 30, duration: 0, autoTranscribe: true };

    return `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 12px;">
        <!-- Upload Sample Form -->
        <div style="background: rgba(0,0,0,0.3); border: 1px dashed rgba(255,255,255,0.15); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="font-size: 11px; font-weight: 700; color: #fff;">Upload Reference Sample (WAV, MP3, M4A, OGG, FLAC)</div>
          
          <!-- Modern File Dropzone / Selected File Card -->
          ${selectedFile ? `
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; color: #60a5fa;">${Utils.icons.music}</span>
                <div style="overflow: hidden; white-space: nowrap;">
                  <div style="font-size: 12px; font-weight: 700; color: #fff; text-overflow: ellipsis; overflow: hidden;">${escapeHtml(selectedFile.name)}</div>
                  <div style="font-size: 10px; color: #60a5fa;">Size: ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ${tState.duration ? `• Total Duration: ${tState.duration.toFixed(1)}s` : ''}</div>
                </div>
              </div>
              <button type="button" class="btn-ghost btn-sm btn-trigger-choose-file" data-profile-id="${profile.id}" style="font-size: 11px; color: #60a5fa; font-weight: 600; padding: 4px 8px;">
                Change File
              </button>
            </div>
          ` : `
            <div class="file-dropzone" id="dropzone-${profile.id}" data-profile-id="${profile.id}" style="border: 2px dashed rgba(255,255,255,0.15); border-radius: var(--radius-md); padding: 16px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.02); transition: all 0.2s ease;">
              <div style="display: flex; justify-content: center; margin-bottom: 4px; color: var(--clr-primary);">${Utils.icons.upload}</div>
              <div style="font-size: 12px; font-weight: 600; color: #fff;">Click to Choose Audio File or Drag & Drop</div>
              <div style="font-size: 10px; color: var(--clr-text-faint); margin-top: 2px;">Supported: WAV, MP3, M4A, OGG, FLAC, AAC, WebM, Opus</div>
            </div>
          `}

          <input type="file" id="input-sample-file-${profile.id}" accept=".wav,.mp3,.m4a,.ogg,.flac,.aac,.webm,.opus" style="display: none;">
          
          <!-- Timeline Trimming & Range Options -->
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm); padding: 10px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 10px; font-weight: 700; color: var(--clr-primary); text-transform: uppercase; letter-spacing: 0.05em;">Timeline Trim (Default Cut: First 30s)</span>
              <span id="timeline-badge-${profile.id}" style="font-size: 10px; color: var(--clr-text-muted);">Slice: ${tState.startTime.toFixed(1)}s - ${(tState.endTime || 30).toFixed(1)}s (${((tState.endTime || 30) - tState.startTime).toFixed(1)}s clip)</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 10px; color: var(--clr-text-faint); display: block; margin-bottom: 2px;">Start Time (seconds):</label>
                <input type="number" id="input-sample-start-${profile.id}" value="${tState.startTime}" min="0" step="0.5" style="width: 100%; padding: 6px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); color: #fff; font-size: 11px;">
              </div>
              <div>
                <label style="font-size: 10px; color: var(--clr-text-faint); display: block; margin-bottom: 2px;">End Time (seconds, max 60s):</label>
                <input type="number" id="input-sample-end-${profile.id}" value="${tState.endTime || 30}" min="1" step="0.5" style="width: 100%; padding: 6px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); color: #fff; font-size: 11px;">
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <input type="checkbox" id="check-auto-transcribe-${profile.id}" ${tState.autoTranscribe ? 'checked' : ''} style="accent-color: var(--clr-primary); cursor: pointer;">
              <label for="check-auto-transcribe-${profile.id}" style="font-size: 11px; color: #fff; cursor: pointer; font-weight: 500;">
                Auto-Transcribe audio clip with Whisper AI (Auto-fills transcript)
              </label>
            </div>
          </div>

          <textarea id="input-sample-text-${profile.id}" placeholder="Reference Transcript (Leave blank to auto-transcribe with AI, or type manually)" rows="2" style="width: 100%; padding: 8px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); color: #fff; font-size: 12px; outline: none; resize: none;"></textarea>

          <div style="display: flex; justify-content: flex-end;">
            <button class="btn btn-primary btn-sm btn-upload-sample" data-profile-id="${profile.id}" style="background: var(--clr-primary); color: black; font-weight: bold; border-radius: var(--radius-full); padding: 6px 16px; font-size: 11px;">
              Auto-Crop & Upload Sample
            </button>
          </div>
        </div>

        <!-- Sample List -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 10px; font-weight: 700; color: var(--clr-text-faint); text-transform: uppercase;">Uploaded Samples (${samples.length})</div>
          ${samples.length === 0 ? `
            <div style="font-size: 11px; color: var(--clr-text-muted); font-style: italic;">No samples uploaded yet.</div>
          ` : `
            ${samples.map(s => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 8px 10px; border-radius: var(--radius-sm);">
                <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; margin-right: 10px;">
                  <span style="font-size: 11px; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">"${escapeHtml(s.reference_text)}"</span>
                  <span style="font-size: 9px; color: var(--clr-text-faint);">${s.audio_path}</span>
                </div>
                <button class="btn btn-ghost btn-sm btn-delete-sample" data-sample-id="${s.id}" data-profile-id="${profile.id}" style="font-size: 10px; color: #ef4444; padding: 2px 6px;">
                  Remove
                </button>
              </div>
            `).join('')}
          `}
        </div>
      </div>
    `;
  }

  function updateProgress(msg, pct) {
    if (msg !== null) ttsStatusMessage = msg;
    if (pct !== null && pct !== undefined) ttsProgressPct = pct;

    const bar = document.getElementById('progress-bar');
    const status = document.getElementById('progress-status');
    const pctEl = document.getElementById('progress-pct');
    if (bar) bar.style.width = ttsProgressPct + '%';
    if (status) status.textContent = ttsStatusMessage;
    if (pctEl) pctEl.textContent = Math.round(ttsProgressPct) + '%';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchProfileSamples(profileId) {
    try {
      const baseUrl = await getSidecarBaseUrl();
      const headers = await getSidecarHeaders();
      const res = await fetch(`${baseUrl}/profiles/${profileId}/samples`, { headers });
      if (res.ok) {
        const data = await res.json();
        profileSamplesMap[profileId] = data.samples || [];
        render();
      }
    } catch (e) {
      console.error('Failed to fetch profile samples', e);
    }
  }

  function processFileSelection(pid, file) {
    if (!file) return;
    selectedFileMap[pid] = file;
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      const dur = audio.duration || 0;
      sampleTimelineState[pid] = {
        startTime: 0,
        endTime: Math.min(dur, 30),
        duration: dur,
        autoTranscribe: true
      };
      URL.revokeObjectURL(url);
      render();
    };
    audio.onerror = () => {
      sampleTimelineState[pid] = {
        startTime: 0,
        endTime: 30,
        duration: 30,
        autoTranscribe: true
      };
      URL.revokeObjectURL(url);
      render();
    };
  }

  function bindEvents() {
    const dismissErrBtn = document.getElementById('btn-dismiss-error');
    if (dismissErrBtn) {
      dismissErrBtn.addEventListener('click', () => {
        generationError = null;
        render();
      });
    }

    const textInput = document.getElementById('tts-text-input');
    if (textInput) {
      textInput.addEventListener('input', () => {
        text = textInput.value;
        const generateBtn = document.getElementById('btn-generate-speech');
        if (generateBtn) {
          generateBtn.disabled = !text.trim() || isGenerating;
        }
      });
    }

    const clearTextBtn = document.getElementById('btn-clear-text');
    if (clearTextBtn) {
      clearTextBtn.addEventListener('click', () => {
        text = '';
        render();
      });
    }

    // Voice Selector toggle
    const selectVoiceBtn = document.getElementById('btn-select-voice');
    if (selectVoiceBtn) {
      selectVoiceBtn.addEventListener('click', () => {
        showVoiceGrid = !showVoiceGrid;
        render();
      });
    }

    // Open Profile Manager Modal
    const openProfileMgrBtn = document.getElementById('btn-open-profile-manager');
    if (openProfileMgrBtn) {
      openProfileMgrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProfileModal = true;
        render();
      });
    }

    // Close Profile Manager Modal
    const closeProfileModalBtn = document.getElementById('btn-close-profile-modal');
    if (closeProfileModalBtn) {
      closeProfileModalBtn.addEventListener('click', () => {
        showProfileModal = false;
        activeProfileDetailId = null;
        render();
      });
    }

    const modalBackdrop = document.getElementById('modal-profile-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          showProfileModal = false;
          activeProfileDetailId = null;
          render();
        }
      });
    }

    // Preset voice selection
    container.querySelectorAll('[data-preset-name]').forEach(card => {
      card.addEventListener('click', () => {
        selectedVoice = card.getAttribute('data-preset-name');
        selectedProfileId = null;
        showVoiceGrid = false;
        render();
      });
    });

    // Custom voice profile selection
    container.querySelectorAll('[data-profile-id]').forEach(card => {
      if (card.classList.contains('voice-card')) {
        card.addEventListener('click', () => {
          selectedProfileId = card.getAttribute('data-profile-id');
          selectedVoice = card.getAttribute('data-profile-name');
          showVoiceGrid = false;
          render();
        });
      }
    });

    // Submit Create Profile
    const submitCreateProfileBtn = document.getElementById('btn-submit-create-profile');
    if (submitCreateProfileBtn) {
      submitCreateProfileBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('input-new-profile-name');
        const descInput = document.getElementById('input-new-profile-desc');
        const name = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';

        if (!name) {
          Utils.showToast('Voice name is required.');
          return;
        }

        try {
          const baseUrl = await getSidecarBaseUrl();
          const headers = await getSidecarHeaders();
          headers['Content-Type'] = 'application/json';

          let res = await fetch(`${baseUrl}/voices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, description })
          });
          if (!res.ok) {
            res = await fetch(`${baseUrl}/profiles`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ name, description })
            });
          }

          if (res.ok) {
            Utils.showToast(`Voice '${name}' created!`);
            await fetchCustomProfiles();
          } else {
            const errData = await res.json();
            Utils.showToast('Failed to create voice: ' + (errData.detail || 'Error'));
          }
        } catch (e) {
          console.error(e);
          Utils.showToast('Network error creating voice');
        }
      });
    }

    // Toggle manage samples drawer
    container.querySelectorAll('.btn-manage-profile-samples').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-profile-id');
        if (activeProfileDetailId === pid) {
          activeProfileDetailId = null;
          render();
        } else {
          activeProfileDetailId = pid;
          await fetchProfileSamples(pid);
        }
      });
    });

    // Dropzone & File choice triggers
    customProfiles.forEach(p => {
      const pid = p.id;
      const dropzone = document.getElementById(`dropzone-${pid}`);
      const fileInput = document.getElementById(`input-sample-file-${pid}`);

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'var(--clr-primary)';
          dropzone.style.background = 'rgba(59, 130, 246, 0.1)';
        });
        dropzone.addEventListener('dragleave', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
          dropzone.style.background = 'rgba(255,255,255,0.02)';
        });
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
          dropzone.style.background = 'rgba(255,255,255,0.02)';
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFileSelection(pid, e.dataTransfer.files[0]);
          }
        });
      }

      container.querySelectorAll('.btn-trigger-choose-file').forEach(btn => {
        if (btn.getAttribute('data-profile-id') === pid && fileInput) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
          });
        }
      });

      if (fileInput) {
        fileInput.addEventListener('change', () => {
          if (fileInput.files && fileInput.files[0]) {
            processFileSelection(pid, fileInput.files[0]);
          }
        });
      }
    });

    // Delete profile
    container.querySelectorAll('.btn-delete-profile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-profile-id');
        if (!confirm('Are you sure you want to delete this voice and all its samples?')) return;

        try {
          const baseUrl = await getSidecarBaseUrl();
          const headers = await getSidecarHeaders();
          const res = await fetch(`${baseUrl}/profiles/${pid}`, {
            method: 'DELETE',
            headers
          });

          if (res.ok) {
            Utils.showToast('Voice deleted.');
            delete selectedFileMap[pid];
            delete sampleTimelineState[pid];
            if (selectedProfileId === pid) {
              selectedProfileId = null;
              selectedVoice = 'Bella';
            }
            if (activeProfileDetailId === pid) activeProfileDetailId = null;
            await fetchCustomProfiles();
          }
        } catch (e) {
          console.error(e);
          Utils.showToast('Failed to delete voice');
        }
      });
    });

    // Upload sample with auto-crop & auto-transcribe using selectedFileMap[pid]
    container.querySelectorAll('.btn-upload-sample').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-profile-id');
        const file = selectedFileMap[pid];
        const textInput = document.getElementById(`input-sample-text-${pid}`);
        const startInput = document.getElementById(`input-sample-start-${pid}`);
        const endInput = document.getElementById(`input-sample-end-${pid}`);
        const checkAuto = document.getElementById(`check-auto-transcribe-${pid}`);

        if (!file) {
          Utils.showToast('Please select an audio file to upload.');
          return;
        }

        const textVal = textInput ? textInput.value.trim() : '';
        const startTime = startInput ? parseFloat(startInput.value) || 0 : 0;
        const endTime = endInput ? parseFloat(endInput.value) || 30 : 30;
        const autoTranscribe = checkAuto ? checkAuto.checked : true;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('start_time', startTime.toString());
        formData.append('end_time', endTime.toString());
        formData.append('auto_transcribe', autoTranscribe ? 'true' : 'false');
        if (textVal) {
          formData.append('reference_text', textVal);
        }

        try {
          btn.disabled = true;
          btn.textContent = 'Cropping & Transcribing...';

          const baseUrl = await getSidecarBaseUrl();
          const headers = await getSidecarHeaders();

          const res = await fetch(`${baseUrl}/profiles/${pid}/samples`, {
            method: 'POST',
            headers,
            body: formData
          });

          if (res.ok) {
            const sampleData = await res.json();
            Utils.showToast(`Sample uploaded & transcribed: "${sampleData.reference_text.substring(0, 30)}..."`);
            delete selectedFileMap[pid];
            delete sampleTimelineState[pid];
            await fetchProfileSamples(pid);
            await fetchCustomProfiles();
          } else {
            const errData = await res.json();
            Utils.showToast('Upload error: ' + (errData.detail || 'Failed'));
          }
        } catch (e) {
          console.error(e);
          Utils.showToast('Upload failed due to network exception');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Auto-Crop & Upload Sample';
        }
      });
    });

    // Delete sample
    container.querySelectorAll('.btn-delete-sample').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sid = btn.getAttribute('data-sample-id');
        const pid = btn.getAttribute('data-profile-id');

        try {
          const baseUrl = await getSidecarBaseUrl();
          const headers = await getSidecarHeaders();
          const res = await fetch(`${baseUrl}/profiles/samples/${sid}`, {
            method: 'DELETE',
            headers
          });

          if (res.ok) {
            Utils.showToast('Sample removed.');
            await fetchProfileSamples(pid);
            await fetchCustomProfiles();
          }
        } catch (e) {
          console.error(e);
          Utils.showToast('Failed to delete sample');
        }
      });
    });

  async function switchTTSModel(targetModelId) {
    modelSize = targetModelId;
    try {
      const baseUrl = await getSidecarBaseUrl();
      const headers = await getSidecarHeaders();
      Utils.showToast(`Loading ${targetModelId} (unloading inactive models)...`);
      const res = await fetch(`${baseUrl}/models/${targetModelId}/load`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_others: false })
      });
      if (res.ok) {
        Utils.showToast(`Active model: ${targetModelId} (others unloaded)`);
        return true;
      }
    } catch (e) {
      console.warn('[tts] Model switch request skipped:', e);
    }
    return false;
  }

    // Model Selector dropdown selection
    const modelSelectEl = document.getElementById('select-model');
    if (modelSelectEl) {
      modelSelectEl.addEventListener('change', () => {
        switchTTSModel(modelSelectEl.value);
      });
    }

    const speedSlider = document.getElementById('speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        speed = parseFloat(speedSlider.value);
        const speedVal = document.getElementById('speed-val');
        if (speedVal) speedVal.textContent = `${speed.toFixed(1)}x`;
      });
    }

    const generateBtn = document.getElementById('btn-generate-speech');
    if (generateBtn) {
      generateBtn.addEventListener('click', startSpeechGeneration);
    }

    const downloadBtn = document.getElementById('btn-download-speech');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (!generatedAudioBase64) return;
        const raw = window.atob(generatedAudioBase64);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));
        for (let i = 0; i < rawLength; i++) {
          array[i] = raw.charCodeAt(i);
        }
        const blob = new Blob([array], { type: 'audio/wav' });
        Utils.downloadBlob(blob, `speech_${selectedVoice.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.wav`);
      });
    }

    // Custom Audio Player bindings
    const realAudio = document.getElementById('tts-audio-player');
    const playPauseBtn = document.getElementById('custom-play-pause-btn');
    const timeCurrent = document.getElementById('player-time-current');
    const timeDuration = document.getElementById('player-time-duration');
    const progressFill = document.getElementById('player-progress');
    const playerSlider = document.getElementById('player-slider');

    if (realAudio && playPauseBtn) {
      if (generatedAudioBase64) {
        realAudio.src = `data:audio/wav;base64,${generatedAudioBase64}`;
      }

      playPauseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

      playPauseBtn.addEventListener('click', () => {
        if (realAudio.paused) {
          realAudio.play();
          playPauseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;
        } else {
          realAudio.pause();
          playPauseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        }
      });

      realAudio.addEventListener('timeupdate', () => {
        const cur = realAudio.currentTime;
        const dur = realAudio.duration || 0;
        if (timeCurrent) timeCurrent.textContent = Utils.formatTimestamp(cur);
        if (timeDuration && dur) timeDuration.textContent = Utils.formatTimestamp(dur);
        if (progressFill && dur > 0) {
          progressFill.style.width = (cur / dur * 100) + '%';
        }
      });

      realAudio.addEventListener('loadedmetadata', () => {
        const dur = realAudio.duration || 0;
        if (timeDuration && dur) timeDuration.textContent = Utils.formatTimestamp(dur);
      });

      realAudio.addEventListener('ended', () => {
        playPauseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        if (progressFill) progressFill.style.width = '0%';
        if (timeCurrent) timeCurrent.textContent = '0:00';
      });

      if (playerSlider) {
        playerSlider.addEventListener('click', (e) => {
          const rect = playerSlider.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const percentage = clickX / rect.width;
          const dur = realAudio.duration || 0;
          if (dur > 0) {
            realAudio.currentTime = percentage * dur;
          }
        });
      }
    }
  }

  async function startSpeechGeneration() {
    if (!text.trim() || isGenerating) return;

    const baseUrl = await getSidecarBaseUrl();
    const headers = await getSidecarHeaders();

      // Check model loaded status before generating
      let isLoaded = false;
      try {
        const modelsRes = await fetch(`${baseUrl}/models`, { headers });
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          const modelsList = Array.isArray(modelsData) ? modelsData : (modelsData.models || []);
          const target = modelsList.find(m => (m.id || m.model_id) === modelSize);
          if (target && (target.status === 'loaded' || target.loaded)) {
            isLoaded = true;
          } else if (target && (target.status === 'downloaded' || target.downloaded)) {
            isLoaded = await switchTTSModel(modelSize);
          }
        }
      } catch (e) {
        // Fallback: assume loaded if sidecar check fails
        isLoaded = true;
      }

      if (!isLoaded) {
        Utils.showToast(`Model ${modelSize} is not loaded. Please load the model first.`);
        return;
      }

      isGenerating = true;
      generationError = null;
      generatedAudioBase64 = null;
      ttsProgressPct = 0;
      ttsStatusMessage = 'Initializing TTS AI engine...';
      render();

      let animTimer = null;

      try {
        updateProgress('Loading voice model and synthesis pipeline...', 20);

      const baseUrl = await getSidecarBaseUrl();
      const headers = await getSidecarHeaders();

      let voicePromptData = null;
      if (selectedProfileId) {
        updateProgress('Assembling cloned voice prompt...', 35);
        const promptRes = await fetch(`${baseUrl}/profiles/${selectedProfileId}/voice-prompt`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ use_cache: true })
        });
        if (promptRes.ok) {
          voicePromptData = await promptRes.json();
        } else {
          let errDetail = 'Failed to assemble voice prompt';
          try {
            const errJson = await promptRes.json();
            if (errJson && errJson.detail) errDetail = errJson.detail;
          } catch (e) {
            const errText = await promptRes.text();
            if (errText) errDetail = errText;
          }
          throw new Error(errDetail);
        }
      }

      updateProgress('Synthesizing speech output...', 50);

      // Smooth progress animation while sidecar generates audio
      animTimer = setInterval(() => {
        if (ttsProgressPct < 95) {
          let msg = null;
          if (ttsProgressPct > 70) {
            msg = selectedProfileId
              ? 'Downloading / assembling voice cloning model...'
              : `Synthesizing speech with ${modelSize}...`;
          }
          updateProgress(msg, ttsProgressPct + 1.2);
        }
      }, 250);

      let response;
      if (window.electronAPI && window.electronAPI.generateSpeech) {
        response = await window.electronAPI.generateSpeech({
          text: text.trim(),
          voice: selectedVoice,
          speed: speed,
          modelSize: modelSize,
          voicePrompt: voicePromptData
        });
      } else {
        const res = await fetch(`${baseUrl}/tts`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.trim(),
            voice: selectedVoice,
            speed: speed,
            model_size: modelSize,
            model_id: modelSize,
            voice_prompt: voicePromptData
          })
        });

        if (res.ok) {
          const blob = await res.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              resolve(result.substring(result.indexOf(',') + 1));
            };
            reader.readAsDataURL(blob);
          });
          response = {
            success: true,
            audioData: base64,
            duration: text.trim().split(/\s+/).length * 0.4
          };
        } else {
          let errDetail = 'TTS generation failed on sidecar';
          try {
            const errJson = await res.json();
            if (errJson && errJson.detail) errDetail = errJson.detail;
          } catch (e) {
            const errText = await res.text();
            if (errText) errDetail = errText;
          }
          throw new Error(errDetail);
        }
      }

      if (animTimer) {
        clearInterval(animTimer);
        animTimer = null;
      }

      if (response && response.success && response.audioData) {
        updateProgress('Processing synthesized audio...', 95);

        generatedAudioBase64 = response.audioData;
        generatedAudioDuration = response.duration || 0;

        // Add to history
        AppState.addHistory({
          name: `Voice: ${text.trim().substring(0, 30)}${text.trim().length > 30 ? '...' : ''}`,
          mode: `KittenTTS ${modelSize.charAt(0).toUpperCase() + modelSize.slice(1)}`,
          language: 'en',
          duration: generatedAudioDuration,
          wordCount: response.word_count || text.trim().split(/\s+/).length,
          segmentCount: 1,
          text: `[Speech Synthesis - Voice: ${selectedVoice}, Speed: ${speed}x]\n\n${text.trim()}`
        });

        Utils.showToast('Speech generation complete!');
      } else {
        throw new Error(response && response.error ? response.error : 'Invalid response from speech synthesis engine');
      }

    } catch (err) {
      if (animTimer) clearInterval(animTimer);
      console.error('Speech generation error:', err);
      const errMsg = err.message || 'Speech generation failed';
      generationError = errMsg;
      ttsStatusMessage = 'Speech generation failed';
      Utils.showToast('Speech generation failed: ' + errMsg);
    }

    isGenerating = false;
    ttsProgressPct = 100;
    render();
  }

  fetchCustomProfiles();
  fetchModelStatus();
  render();
}

Router.register('dashboard/text-to-voice', renderTextToVoicePage);
Router.register('dashboard/tts', renderTextToVoicePage);
Router.register('text-to-voice', renderTextToVoicePage);
Router.register('tts', renderTextToVoicePage);
