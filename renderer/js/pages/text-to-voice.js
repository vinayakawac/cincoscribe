/* ===== Text to Speech Page ===== */

function renderTextToVoicePage(container) {
  let text = '';
  let selectedVoice = 'Raunak M';
  let speed = 1.0;
  let modelSize = 'kokoro';
  let isGenerating = false;
  let progressPct = 0;
  let statusMessage = '';
  let generatedAudioBase64 = null;
  let generatedAudioDuration = 0;
  let showVoiceGrid = false;

  // Default fallback models
  let downloadedModels = [
    { id: 'kokoro', name: 'Kokoro 82M (Local)' }
  ];

  const voices = [
    { name: 'Raunak M', gender: 'Male', tag: 'Viral' },
    { name: 'Bella', gender: 'Female', tag: 'Clear' },
    { name: 'Jasper', gender: 'Male', tag: 'Warm' },
    { name: 'Luna', gender: 'Female', tag: 'Soft' },
    { name: 'Bruno', gender: 'Male', tag: 'Deep' },
    { name: 'Rosie', gender: 'Female', tag: 'Expressive' },
    { name: 'Hugo', gender: 'Male', tag: 'Formal' },
    { name: 'Kiki', gender: 'Female', tag: 'Energetic' },
    { name: 'Leo', gender: 'Male', tag: 'Friendly' }
  ];

  async function fetchModelStatus() {
    try {
      let port = 5555;
      if (window.electronAPI) {
        port = await window.electronAPI.getSidecarPort();
      }
      const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
      const res = await fetch(`http://${hostname}:${port}/engines/models/status`);
      if (res.ok) {
        const data = await res.json();
        const ttsModelsInfo = [
          { id: 'kokoro', name: 'Kokoro 82M (Local)' }
        ];

        const trueDownloaded = ttsModelsInfo.filter(m => data.tts[m.id] === true || m.id === 'kokoro');
        if (trueDownloaded.length > 0) {
          downloadedModels = trueDownloaded;
        }

        if (!downloadedModels.some(m => m.id === modelSize)) {
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

            <!-- Generated Audio Player (shown at bottom of settings tab when ready) -->
            ${renderAudioPlayerZone()}
          </div>
        </div>
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
    const voiceDescMap = {
      'Raunak M': 'Viral & Relatable Reel Voice',
      'Bella': 'Clear & Professional Voice',
      'Jasper': 'Warm & Natural Narration Voice',
      'Luna': 'Soft & Peaceful Audiobook Voice',
      'Bruno': 'Deep & Engaging Podcast Voice',
      'Rosie': 'Expressive & Energetic Ad Voice',
      'Hugo': 'Formal & Clear Presentation Voice',
      'Kiki': 'Energetic & Fun Character Voice',
      'Leo': 'Friendly & Welcoming Assistant Voice'
    };
    const desc = voiceDescMap[selectedVoice] || 'Natural Speech Voice';

    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Voice</label>
        <div class="voice-select-card" id="btn-select-voice" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); transition: background var(--dur-fast);">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; width: 90%;">
            <span style="font-size: 13px; font-weight: 500; color: var(--clr-text); text-overflow: ellipsis; overflow: hidden;">${selectedVoice} - ${desc}</span>
          </div>
          <span style="color: var(--clr-text-muted); font-size: 12px; margin-left: 6px; transform: ${showVoiceGrid ? 'rotate(90deg)' : 'none'}; transition: transform var(--dur-fast);">&gt;</span>
        </div>
      </div>
    `;
  }

  function renderVoiceGrid() {
    return `
      <div class="settings-section-card" style="padding: 10px; border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); margin-top: -8px;">
        <div class="voice-grid" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: var(--sp-2); max-height: 160px; overflow-y: auto;">
          ${voices.map(voice => `
            <div class="voice-card ${selectedVoice === voice.name ? 'selected' : ''}" data-voice-name="${voice.name}" style="padding: 8px; gap: 4px; border-radius: var(--radius-md); border: none;">
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
        
        <!-- Custom Audio Player Controller -->
        <div class="custom-player" style="display: flex; align-items: center; gap: var(--sp-3);">
          <button class="player-btn" id="custom-play-pause-btn" style="width: 32px; height: 32px; border-radius: 50%; background: var(--clr-primary); color: black; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;">
            ${Utils.icons.play}
          </button>
          
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <!-- Progress Slider Track -->
            <div class="player-slider" id="player-slider" style="height: 4px; background: var(--clr-border-med); border-radius: var(--radius-full); cursor: pointer; position: relative;">
              <div class="player-progress" id="player-progress" style="width: 0%; height: 100%; background: var(--clr-primary); border-radius: var(--radius-full);"></div>
            </div>
            <!-- Timestamps -->
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

  function renderProgress() {
    return `
      <div class="transcript-panel" style="margin-top: 10px; border: none; padding: 0; background: transparent; width: 100%;">
        <div class="progress-container" id="progress-area" style="padding: 0;">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" id="progress-bar" style="width:${progressPct}%"></div>
          </div>
          <p class="progress-label" id="progress-status">${statusMessage || 'Preparing...'}</p>
          <p class="progress-percent" id="progress-pct">${Math.round(progressPct)}%</p>
        </div>
      </div>
    `;
  }

  function updateProgress(msg, pct) {
    if (msg !== null) statusMessage = msg;
    if (pct !== null && pct !== undefined) progressPct = pct;

    const bar = document.getElementById('progress-bar');
    const status = document.getElementById('progress-status');
    const pctEl = document.getElementById('progress-pct');
    if (bar) bar.style.width = progressPct + '%';
    if (status) status.textContent = statusMessage;
    if (pctEl) pctEl.textContent = Math.round(progressPct) + '%';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function bindEvents() {
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

    // Voice Selector card click
    container.querySelectorAll('[data-voice-name]').forEach(card => {
      card.addEventListener('click', () => {
        selectedVoice = card.getAttribute('data-voice-name');
        showVoiceGrid = false;
        render();
      });
    });

    // Model Selector dropdown selection
    const modelSelectEl = document.getElementById('select-model');
    if (modelSelectEl) {
      modelSelectEl.addEventListener('change', () => {
        modelSize = modelSelectEl.value;
      });
    }

    // Voice preview play click
    const previewPlayBtn = document.getElementById('btn-play-voice-preview');
    if (previewPlayBtn) {
      previewPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Utils.showToast(`Playing sample preview for ${selectedVoice}...`);
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(440, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
          console.error(e);
        }
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
        Utils.downloadBlob(blob, `speech_${selectedVoice.toLowerCase()}_${Date.now()}.wav`);
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

      playPauseBtn.addEventListener('click', () => {
        if (realAudio.paused) {
          realAudio.play();
          playPauseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;
        } else {
          realAudio.pause();
          playPauseBtn.innerHTML = Utils.icons.play;
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
        playPauseBtn.innerHTML = Utils.icons.play;
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

    isGenerating = true;
    generatedAudioBase64 = null;
    progressPct = 0;
    statusMessage = 'Initializing KittenTTS AI engine...';
    render();

    try {
      updateProgress('Loading voice model and synthesis pipeline...', 25);

      let response;
      if (window.electronAPI && window.electronAPI.generateSpeech) {
        response = await window.electronAPI.generateSpeech({
          text: text.trim(),
          voice: selectedVoice,
          speed: speed,
          modelSize: modelSize
        });
      } else {
        // Fallback to sidecar API directly over HTTP
        let port = 5555;
        if (window.electronAPI) {
          port = await window.electronAPI.getSidecarPort();
        }

        const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
        const res = await fetch(`http://${hostname}:${port}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.trim(),
            voice: selectedVoice,
            speed: speed
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
          const errText = await res.text();
          throw new Error(errText || 'TTS generation failed on sidecar');
        }
      }

      if (response && response.success && response.audioData) {
        updateProgress('Processing synthesized audio...', 90);

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
        throw new Error(response ? response.error : 'Invalid response from engine');
      }

    } catch (err) {
      console.error('Speech generation error:', err);
      Utils.showToast('Speech generation failed: ' + (err.message || 'Unknown error'));
    }

    isGenerating = false;
    progressPct = 100;
    render();
  }

  fetchModelStatus();
  render();
}

Router.register('dashboard/text-to-voice', renderTextToVoicePage);
