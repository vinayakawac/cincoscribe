/* ===== Transcribe Page — Real Whisper Transcription ===== */

function renderTranscribePage(container) {
  let selectedFile = null;
  let fileDuration = 0;
  const WASM_MODELS = [
    { id: 'fast',     name: 'Whisper Tiny' },
    { id: 'accuracy', name: 'Whisper Base' },
    { id: 'small',    name: 'Whisper Small' },
    { id: 'medium',   name: 'Whisper Medium' },
    { id: 'large-v3', name: 'Whisper Large v3' },
    { id: 'turbo',    name: 'Whisper Turbo' },
  ];

  let modelMode = localStorage.getItem('whisperMode') || 'accuracy'; // whisper mode key
  let language = 'auto';
  let formatMode = 'normal'; // 'normal' | 'timestamps'
  let isTranscribing = false;
  let statusMessage = '';
  let progressPct = 0;
  let transcript = null;
  let liveTranscript = [];
  let activeTranscriptTab = 'plain'; // 'timestamps' | 'plain'

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

  function render() {
    container.innerHTML = `
      <div class="page-container no-scroll-layout">
        <div class="split-layout">
          <div class="layout-main">
            ${renderUploadZone()}
            ${isTranscribing ? renderProgress() : ''}
            ${transcript ? renderTranscript() : ''}
          </div>
          <div class="layout-sidebar" style="gap: var(--sp-5);">
            ${renderModelSelectorZone()}
            ${renderFormatModeSelector()}
            ${renderActionRow()}
          </div>
        </div>
      </div>
    `;
    bindEvents();
    
    // Set preview source if file selected
    if (selectedFile && !isTranscribing) {
      const preview = document.getElementById('preview-audio');
      if (preview) {
        preview.src = URL.createObjectURL(selectedFile);
      }
    }
  }

  function renderUploadZone() {
    if (selectedFile) {
      const isW = isTranscribing;
      return `
        <div class="uploaded-file-card" style="border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-xl); padding: var(--sp-5);">
          <div class="uploaded-file-header" style="border: none; padding: 0;">
            <div class="uploaded-file-icon">
              ${Utils.icons.music}
            </div>
            <div class="uploaded-file-details">
              <p class="uploaded-file-name-text" title="${escapeHtml(selectedFile.name)}">${escapeHtml(selectedFile.name)}</p>
              <div class="uploaded-file-meta-text">
                <span>${Utils.formatFileSize(selectedFile.size)}</span>
                <span>•</span>
                <span>${fileDuration ? Utils.formatDuration(fileDuration) : 'Calculating...'}</span>
              </div>
            </div>
            <div class="uploaded-file-actions">
              <div class="waveform-simulation ${isW ? 'active' : ''}">
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
              </div>
              <button class="btn-icon-sm" id="btn-remove-file" title="Remove file" ${isW ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                ${Utils.icons.x}
              </button>
            </div>
          </div>
          ${!isW && fileDuration ? `
            <div style="margin-top: var(--sp-3);">
              <audio id="preview-audio" controls style="width: 100%; height: 32px; border-radius: var(--radius-md); accent-color: var(--clr-primary);"></audio>
            </div>
          ` : ''}
        </div>
      `;
    }
    return `
      <div class="upload-zone" id="upload-zone" style="border: 2px dashed var(--clr-border-med); background: var(--clr-bg-subtle); border-radius: var(--radius-xl); padding: var(--sp-6);">
        <input type="file" accept="audio/*,video/mp4,video/webm" id="file-input">
        <div class="upload-zone-content">
          <div class="upload-icon-wrapper">
            ${Utils.icons.upload}
          </div>
          <p class="upload-title">Drop audio here or click to browse</p>
          <p class="upload-subtitle">MP3 · WAV · M4A · OGG · FLAC · WebM · Max 100MB</p>
          <div class="upload-hint">
            <span style="display:flex; align-items:center; gap:4px;">${Utils.icons.lightbulb} Have audio in multiple parts?</span>
            <a href="#/dashboard/merge-audio">Merge them first</a>
            <span>for best results.</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderModelSelectorZone() {
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Transcription Model</label>
        <div style="position: relative; width: 100%;">
          <select id="select-model" style="width: 100%; padding: 12px 16px; font-size: 13px; font-weight: 500; color: var(--clr-text); border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); outline: none; appearance: none; cursor: pointer;">
            ${WASM_MODELS.map(m => `
              <option value="${m.id}" ${modelMode === m.id ? 'selected' : ''}>${m.name}</option>
            `).join('')}
          </select>
          <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--clr-text-muted); font-size: 10px;">
            ▼
          </div>
        </div>
      </div>
    `;
  }

  function renderFormatModeSelector() {
    const disabled = isTranscribing;
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Transcription Mode</label>
        <div style="position: relative; width: 100%;">
          <select id="format-mode-select" ${disabled ? 'disabled' : ''} style="width: 100%; padding: 12px 16px; font-size: 13px; font-weight: 500; color: var(--clr-text); border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); outline: none; appearance: none; cursor: pointer;">
            <option value="normal" ${formatMode === 'normal' ? 'selected' : ''}>Normal (Formatted Paragraphs)</option>
            <option value="timestamps" ${formatMode === 'timestamps' ? 'selected' : ''}>Timestamps Mode</option>
          </select>
          <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--clr-text-muted); font-size: 10px;">
            ▼
          </div>
        </div>
      </div>
    `;
  }

  function renderActionRow() {
    const disabled = !selectedFile || isTranscribing;
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Language &amp; Action</label>
        <div style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <div style="position: relative; width: 100%;">
            <select id="lang-select" ${disabled ? 'disabled' : ''} style="width: 100%; padding: 12px 16px; font-size: 13px; font-weight: 500; color: var(--clr-text); border: none; border-radius: var(--radius-lg); background: var(--clr-bg-subtle); outline: none; appearance: none; cursor: pointer;">
              <option value="auto">Auto-detect Language</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ar">Arabic</option>
              <option value="zh">Chinese</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="it">Italian</option>
              <option value="tr">Turkish</option>
              <option value="ur">Urdu</option>
              <option value="bn">Bengali</option>
              <option value="pa">Punjabi</option>
              <option value="id">Indonesian</option>
              <option value="ms">Malay</option>
              <option value="nl">Dutch</option>
              <option value="pl">Polish</option>
              <option value="sv">Swedish</option>
              <option value="fa">Persian</option>
              <option value="vi">Vietnamese</option>
              <option value="th">Thai</option>
            </select>
            <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--clr-text-muted); font-size: 10px;">
              ▼
            </div>
          </div>
          <button class="btn btn-primary" id="btn-transcribe" ${disabled ? 'disabled' : ''} style="background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 10px 18px; font-size: 13px; width: 100%; margin-top: var(--sp-2);">
            ${isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
          </button>
        </div>
      </div>
    `;
  }

  function renderProgress() {
    return `
      <div class="transcript-panel" style="margin-top: 10px; border: none; padding: 0; background: transparent;">
        <div class="progress-container" id="progress-area" style="padding: 0;">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" id="progress-bar" style="width:${progressPct}%"></div>
          </div>
          <p class="progress-label" id="progress-status">${statusMessage || 'Preparing...'}</p>
          <p class="progress-percent" id="progress-pct">${Math.round(progressPct)}%</p>
        </div>
        ${liveTranscript.length > 0 ? `
        <div class="live-transcript-box" style="border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); padding: 12px 14px; margin-top: 8px;">
          <div class="live-transcript-header" style="font-size: 11px; margin-bottom: 6px; color: var(--clr-primary);">
            <span style="display:flex;align-items:center; gap: 4px;">${Utils.icons.bolt} Transcribing live...</span>
          </div>
          <div class="live-transcript-content" id="live-transcript-content" style="font-size: 13px; max-height: 120px; overflow-y: auto; line-height: 1.5; color: var(--clr-text-muted);">
            ${escapeHtml(liveTranscript.map(c => c.text).join(' '))}
            <span class="live-transcript-cursor"></span>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function updateProgress(msg, pct, liveChunk) {
    if (msg !== null) statusMessage = msg;
    if (pct !== null && pct !== undefined) progressPct = pct;

    if (liveChunk) {
      liveTranscript.push(liveChunk);
      const liveEl = document.getElementById('live-transcript-content');
      if (liveEl) {
        const cursor = liveEl.querySelector('.live-transcript-cursor');
        if (cursor) cursor.remove();

        liveEl.appendChild(document.createTextNode((liveTranscript.length > 1 ? ' ' : '') + liveChunk.text.trim()));

        const newCursor = document.createElement('span');
        newCursor.className = 'live-transcript-cursor';
        liveEl.appendChild(newCursor);

        liveEl.scrollTop = liveEl.scrollHeight;
      } else {
        render(); // First chunk received, re-render to show box
      }
    } else {
      const bar = document.getElementById('progress-bar');
      const status = document.getElementById('progress-status');
      const pctEl = document.getElementById('progress-pct');
      if (bar) bar.style.width = progressPct + '%';
      if (status) status.textContent = statusMessage;
      if (pctEl) pctEl.textContent = Math.round(progressPct) + '%';
    }
  }

  function renderTranscript() {
    const formatted = transcript.formatted;
    const plainText = transcript.text;
    const textToShow = activeTranscriptTab === 'timestamps' ? formatted : plainText;

    return `
      <div class="transcript-panel" style="border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-xl); padding: var(--sp-4); gap: var(--sp-3); display: flex; flex-direction: column; flex: 1; min-height: 0;">
        <div class="transcript-header" style="border: none; padding: 0;">
          <div class="transcript-title">
            ${Utils.icons.check}
            Transcript
          </div>
          <div class="transcript-actions">
            <button class="btn-ghost" id="btn-copy">${Utils.icons.copy} Copy</button>
            <button class="btn-ghost" id="btn-download">${Utils.icons.download} Download</button>
          </div>
        </div>

        <div class="layout-tabs" style="margin: 0; padding: 0; background: transparent; border: none;">
          <div class="layout-tab ${activeTranscriptTab === 'timestamps' ? 'active' : ''}" data-tab-id="timestamps" style="font-size: 13px;">Timestamps</div>
          <div class="layout-tab ${activeTranscriptTab === 'plain' ? 'active' : ''}" data-tab-id="plain" style="font-size: 13px;">Plain Text</div>
        </div>

        <div class="transcript-stats" style="border: none; background: transparent; padding: 0; margin: 0; font-size: 11px;">
          <span><span class="stat-label">Duration </span><span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatDuration(transcript.duration)}</span></span>
          <span><span class="stat-label">Words </span><span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatNumber(transcript.wordCount)}</span></span>
          <span><span class="stat-label">Segments </span><span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatNumber(transcript.segmentCount)}</span></span>
        </div>
        
        <div class="transcript-body" style="background: var(--clr-bg-code); border: none; border-radius: var(--radius-lg); padding: var(--sp-4); flex: 1; min-height: 0;">
          <pre style="margin: 0; white-space: pre-wrap; font-size: 13px; line-height: 1.6; color: var(--clr-text-muted); font-family: var(--ff-mono);">${escapeHtml(textToShow)}</pre>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatParagraphs(text) {
    if (!text) return '';
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
    const paragraphs = [];
    let currentParagraph = [];
    
    for (let i = 0; i < sentences.length; i++) {
      currentParagraph.push(sentences[i].trim());
      if (currentParagraph.length === 3 || i === sentences.length - 1) {
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
    }
    
    return paragraphs.join('\n\n');
  }

  function bindEvents() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    if (zone && fileInput) {
      zone.addEventListener('click', (e) => {
        if (e.target.id === 'btn-remove-file' || e.target.closest('#btn-remove-file')) return;
        fileInput.click();
      });

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }

    const removeBtn = document.getElementById('btn-remove-file');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        selectedFile = null;
        fileDuration = 0;
        transcript = null;
        liveTranscript = [];
        render();
      });
    }

    // Model Selector dropdown selection
    const modelSelectEl = document.getElementById('select-model');
    if (modelSelectEl) {
      modelSelectEl.addEventListener('change', () => {
        modelMode = modelSelectEl.value;
        localStorage.setItem('whisperMode', modelMode);
      });
    }

    const formatModeSelect = document.getElementById('format-mode-select');
    if (formatModeSelect) {
      formatModeSelect.value = formatMode;
      formatModeSelect.addEventListener('change', () => {
        formatMode = formatModeSelect.value;
      });
    }

    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
      langSelect.value = language;
      langSelect.addEventListener('change', () => {
        language = langSelect.value;
      });
    }

    const transcribeBtn = document.getElementById('btn-transcribe');
    if (transcribeBtn) {
      transcribeBtn.addEventListener('click', startTranscription);
    }

    // Transcript tabs
    container.querySelectorAll('[data-tab-id]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTranscriptTab = tab.getAttribute('data-tab-id');
        render();
      });
    });

    const copyBtn = document.getElementById('btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!transcript) return;
        const textToCopy = activeTranscriptTab === 'timestamps' ? transcript.formatted : transcript.text;
        navigator.clipboard.writeText(textToCopy);
        Utils.showToast('Copied to clipboard!');
      });
    }

    const downloadBtn = document.getElementById('btn-download');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (!transcript) return;
        const textToDownload = activeTranscriptTab === 'timestamps' ? transcript.formatted : transcript.text;
        const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
        const ext = activeTranscriptTab === 'timestamps' ? '_timestamps.txt' : '.txt';
        Utils.downloadBlob(blob, selectedFile.name.replace(/\.[^/.]+$/, "") + ext);
      });
    }
  }

  function handleFile(file) {
    selectedFile = file;
    transcript = null;
    liveTranscript = [];
    render();

    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(file);
    audio.addEventListener('loadedmetadata', () => {
      fileDuration = audio.duration;
      render();
    });
  }

  async function startTranscription() {
    if (!selectedFile || isTranscribing) return;

    isTranscribing = true;
    transcript = null;
    liveTranscript = [];
    progressPct = 0;
    statusMessage = 'Preparing audio file...';
    render();

    try {
      const apiKey = AppState.openAiKey;
      const whisperService = window.WhisperTranscriber;
      const modelSizeKey = modelMode === 'fast' ? 'tiny' : (modelMode === 'accuracy' ? 'base' : modelMode);
      let result = null;

      // 1. Try local Python sidecar ASR backend if active and in Electron desktop mode
      let sidecarAvailable = false;
      let baseUrl = '';
      try {
        baseUrl = await getSidecarBaseUrl();
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 1500);
        const hc = await fetch(`${baseUrl}/health`, { signal: controller.signal });
        clearTimeout(tid);
        if (hc.ok) sidecarAvailable = true;
      } catch (e) {}

      if (sidecarAvailable && !apiKey) {
        updateProgress('Transcribing via local Whisper sidecar...', 40);
        let token = '';
        if (window.electronAPI && window.electronAPI.getSidecarToken) {
          try { token = await window.electronAPI.getSidecarToken(); } catch (e) {}
        }

        const headers = token ? { 'X-Sidecar-Token': token } : {};
        let response = null;
        const filePath = selectedFile.path || (window.electronAPI && window.electronAPI.webUtils && window.electronAPI.webUtils.getPathForFile ? window.electronAPI.webUtils.getPathForFile(selectedFile) : null);

        if (filePath) {
          response = await fetch(`${baseUrl}/transcribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers
            },
            body: JSON.stringify({
              audio_path: filePath,
              language: language === 'auto' ? 'auto' : language,
              model_size: modelSizeKey
            })
          });
        } else {
          const formData = new FormData();
          formData.append('file', selectedFile, selectedFile.name);
          formData.append('language', language === 'auto' ? 'auto' : language);
          formData.append('model_size', modelSizeKey);

          response = await fetch(`${baseUrl}/transcribe/upload`, {
            method: 'POST',
            headers: headers,
            body: formData
          });
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Sidecar transcription failed');
        }

        const data = await response.json();
        const chunks = (data.segments || []).map(seg => ({
          timestamp: [seg.start || 0, seg.end || 0],
          text: (seg.text || '').trim()
        }));
        result = {
          text: data.text || chunks.map(c => c.text).join(' '),
          chunks: chunks
        };
      } else {
        // 2. Fallback to OpenAI API or WASM Whisper Transcriber
        if (!apiKey) {
          if (!whisperService) {
            throw new Error('Whisper service is not loaded on this page.');
          }
          
          const mode = modelMode; // 'fast' or 'accuracy'
          const targetModel = whisperService.models[mode] || whisperService.models.accuracy;
          
          if (!whisperService.isReady || whisperService.currentLoadedModel !== targetModel) {
            const modelLabel = mode === 'fast' ? 'Tiny' : 'Base';
            updateProgress('Downloading Whisper ' + modelLabel + ' model... First time only.', 0);
            
            await whisperService.loadModel(mode, (data) => {
              if (data.status === 'progress') {
                updateProgress(
                  'Downloading model: ' + data.file.split('/').pop() + '...',
                  Math.round(data.progress * 0.4)
                );
              } else if (data.status === 'ready') {
                updateProgress('Model loaded! Starting transcription...', 50);
              }
            });
          }
          
          if (!whisperService.isReady) {
            throw new Error('Model failed to load. Please refresh the page and try again.');
          }
        }

        updateProgress('Transcribing audio segments...', 60);

        result = await (whisperService || window.WhisperTranscriber).transcribe(selectedFile, language, modelMode, (liveData) => {
          updateProgress(null, null, liveData);
        });
      }

      progressPct = 100;
      statusMessage = 'Transcription complete!';

      const paragraphText = formatParagraphs(result.text);
      transcript = {
        text: paragraphText,
        formatted: result.chunks.map(c => `[${Utils.formatDuration(c.timestamp[0])} - ${Utils.formatDuration(c.timestamp[1])}] ${c.text.trim()}`).join('\n'),
        duration: fileDuration,
        wordCount: result.text.split(/\s+/).length,
        segmentCount: result.chunks.length
      };

      // Set default tab based on active format mode
      activeTranscriptTab = formatMode === 'timestamps' ? 'timestamps' : 'plain';

      // Add to history
      AppState.addHistory({
        name: selectedFile.name,
        mode: modelMode,
        language: language === 'auto' ? 'auto' : language,
        duration: fileDuration,
        wordCount: transcript.wordCount,
        segmentCount: transcript.segmentCount,
        text: formatMode === 'timestamps' ? transcript.formatted : transcript.text
      });

      Utils.showToast('Transcription completed!');

    } catch (err) {
      console.error('Transcription error:', err);
      Utils.showToast('Transcription failed: ' + (err.message || 'Unknown error'));
    }

    isTranscribing = false;
    render();
  }

  render();
}

Router.register('dashboard/transcribe', renderTranscribePage);
