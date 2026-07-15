/* ===== Transcribe Page — Real Whisper Transcription ===== */

function renderTranscribePage(container) {
  let selectedFile = null;
  let fileDuration = 0;
  let modelSize = 'base'; // 'base' | 'small' | 'medium' | 'large' | 'turbo'
  let language = 'en';
  let isTranscribing = false;
  let statusMessage = '';
  let progressPct = 0;
  let transcript = null;
  let liveTranscript = [];

  function render() {
    container.innerHTML = `
      <div class="page-container page-sections">
        ${renderHeader()}
        ${renderUploadZone()}
        ${renderModeCards()}
        ${renderActionRow()}
        ${isTranscribing ? renderProgress() : ''}
        ${transcript ? renderTranscript() : ''}
      </div>
    `;
    bindEvents();
  }

  function renderHeader() {
    return `
      <div class="page-header">
        <h1 class="page-title">Turn Audio Into <span class="page-title-sub">Accurate Text</span></h1>
        <p class="page-subtitle">Upload any audio for AI transcription powered by Whisper</p>
      </div>
    `;
  }

  function renderUploadZone() {
    if (selectedFile) {
      return `
        <div class="upload-zone" id="upload-zone">
          <input type="file" accept="audio/*,video/mp4,video/webm" id="file-input">
          <div class="upload-file-info">
            <div class="upload-icon-wrapper">
              <span style="font-size:22px; display:flex;">${Utils.icons.music}</span>
            </div>
            <p class="upload-file-name">${selectedFile.name}</p>
            <p class="upload-file-meta">${Utils.formatFileSize(selectedFile.size)}${fileDuration ? ' · ' + Utils.formatDuration(fileDuration) : ''}</p>
            <button class="upload-file-remove" id="btn-remove-file">Remove file</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="upload-zone" id="upload-zone">
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

  function renderModeCards() {
    const disabled = isTranscribing;
    return `
      <div class="card" style="display:flex; flex-direction:column; gap:var(--sp-3); border-color: var(--clr-border);">
        <label class="form-label" style="font-weight: 600;">Transcription Model</label>
        <p style="font-size: var(--fs-xs); color: var(--clr-text-muted); margin: 0;">
          Select the Whisper model size. Larger models offer higher accuracy but consume more CPU and memory.
        </p>
        <select id="model-size-select" ${disabled ? 'disabled' : ''} style="width: 100%; padding: 8px 12px; background: var(--clr-bg); border: 1px solid var(--clr-border); color: var(--clr-text); border-radius: var(--radius); font-size: 13px; margin-top: 4px;">
          <option value="base" ${modelSize === 'base' ? 'selected' : ''}>Whisper Base (~145MB) — Light CPU (Pre-installed)</option>
          <option value="small" ${modelSize === 'small' ? 'selected' : ''}>Whisper Small (~460MB) — Medium CPU (Internet required)</option>
          <option value="medium" ${modelSize === 'medium' ? 'selected' : ''}>Whisper Medium (~1.5GB) — Heavy CPU (Internet required)</option>
          <option value="large" ${modelSize === 'large' ? 'selected' : ''}>Whisper Large (~3.0GB) — Very Heavy CPU (Internet required)</option>
          <option value="turbo" ${modelSize === 'turbo' ? 'selected' : ''}>Whisper Turbo (~1.6GB) — Heavy CPU (Internet required)</option>
        </select>
      </div>
    `;
  }

  function renderActionRow() {
    const disabled = !selectedFile || isTranscribing;
    return `
      <div class="action-row">
        <div class="select-wrapper">
          <select id="lang-select" ${disabled ? 'disabled' : ''}>
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
          <span class="select-chevron">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </div>
        <button class="btn btn-primary" id="btn-transcribe" ${disabled ? 'disabled' : ''}>
          Transcribe Audio
        </button>
      </div>
    `;
  }

  function renderProgress() {
    return `
      <div class="transcript-panel">
        <div class="progress-container" id="progress-area">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" id="progress-bar" style="width:${progressPct}%"></div>
          </div>
          <p class="progress-label" id="progress-status">${statusMessage || 'Preparing...'}</p>
          <p class="progress-percent" id="progress-pct">${Math.round(progressPct)}%</p>
        </div>
        ${liveTranscript.length > 0 ? `
        <div class="live-transcript-box">
          <div class="live-transcript-header">
            <span style="display:flex;align-items:center;">${Utils.icons.bolt}</span>
            <span>Agent is thinking (Transcribing live)...</span>
          </div>
          <div class="live-transcript-content" id="live-transcript-content">
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
    return `
      <div class="transcript-panel">
        <div class="transcript-header">
          <div class="transcript-title">
            ${Utils.icons.check}
            Transcript
          </div>
          <div class="transcript-actions">
            <button class="btn-ghost" id="btn-copy">${Utils.icons.copy} Copy all</button>
            <button class="btn-ghost" id="btn-download">${Utils.icons.download} Download .txt</button>
          </div>
        </div>
        <div class="transcript-stats">
          <span><span class="stat-label">Duration </span><span class="stat-value">${Utils.formatDuration(transcript.duration)}</span></span>
          <span><span class="stat-label">Words </span><span class="stat-value">${Utils.formatNumber(transcript.wordCount)}</span></span>
          <span><span class="stat-label">Segments </span><span class="stat-value">${Utils.formatNumber(transcript.segmentCount)}</span></span>
        </div>
        <div class="transcript-body">
          <pre>${escapeHtml(formatted)}</pre>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function bindEvents() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    if (zone && fileInput) {
      zone.addEventListener('click', (e) => {
        if (e.target.id === 'btn-remove-file') return;
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
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        fileDuration = 0;
        transcript = null;
        render();
      });
    }

    const modelSizeSelect = document.getElementById('model-size-select');
    if (modelSizeSelect) {
      modelSizeSelect.value = modelSize;
      modelSizeSelect.addEventListener('change', () => {
        modelSize = modelSizeSelect.value;
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

    const copyBtn = document.getElementById('btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        Utils.copyToClipboard(transcript.formatted);
      });
    }

    const downloadBtn = document.getElementById('btn-download');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const name = selectedFile ? selectedFile.name.replace(/\.[^.]+$/, '') : 'transcript';
        Utils.downloadText(transcript.formatted, name + '_transcript.txt');
      });
    }
  }

  async function handleFile(file) {
    const error = Utils.validateAudioFile(file);
    if (error) {
      Utils.showToast(error);
      return;
    }
    selectedFile = file;
    transcript = null;
    fileDuration = await Utils.getAudioDuration(file);
    render();
  }

  async function startTranscription() {
    if (!selectedFile || isTranscribing) return;

    isTranscribing = true;
    transcript = null;
    liveTranscript = [];
    progressPct = 0;
    statusMessage = 'Initializing Whisper AI...';
    render();

    try {
      const whisper = window.WhisperTranscriber;

      if (!whisper) {
        throw new Error('WhisperTranscriber not found. Please refresh the page.');
      }

      const useOpenAI = !!(typeof AppState !== 'undefined' && AppState.openAiKey);

      const mode = modelSize === 'base' ? 'accuracy' : 'accuracy';

      // Step 1: Load model if using local transcription
      if (!useOpenAI) {
        const targetModel = whisper.models[mode] || whisper.models.fast;
        const modelSizeLabel = mode === 'accuracy' ? '~74MB' : '~40MB';

        if (!whisper.isReady || whisper.currentLoadedModel !== targetModel) {
          updateProgress('Downloading Whisper AI model (' + modelSize + ')... First time only.', 0);

          let lastFileProgress = {};
          await whisper.loadModel(mode, (data) => {
            if (data.status === 'progress' && data.file) {
              lastFileProgress[data.file] = data.progress || 0;
              const values = Object.values(lastFileProgress);
              const avg = values.reduce((a, b) => a + b, 0) / values.length;
              updateProgress(
                'Downloading model: ' + data.file.split('/').pop() + '...',
                Math.min(avg * 0.5, 50)
              );
            } else if (data.status === 'ready') {
              updateProgress('Model loaded! Starting transcription...', 50);
            }
          });
        }

        // Double-check the model actually loaded
        if (!whisper.isReady) {
          throw new Error('Model failed to load. Please refresh the page and try again.');
        }
      }

      // Step 2: Transcribe
      if (!useOpenAI) {
        updateProgress('Transcribing audio with local Whisper AI (' + mode + ' mode)... This may take a minute.', 55);
      }

      const result = await whisper.transcribe(selectedFile, language, mode, (msg, pct, liveChunk) => {
        updateProgress(msg, pct, liveChunk);
      });

      updateProgress('Processing results...', 95);

      // Step 3: Parse results
      const chunks = result.chunks || [];
      const fullText = result.text || '';
      const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
      const duration = fileDuration || 60;

      // Format with timestamps
      let formatted;
      if (chunks.length > 0) {
        formatted = chunks.map(chunk => {
          const start = chunk.timestamp?.[0] ?? 0;
          return '[' + Utils.formatTimestamp(start) + '] ' + chunk.text.trim();
        }).join('\n');
      } else {
        formatted = '[0:00] ' + fullText;
      }

      transcript = {
        text: fullText,
        formatted: formatted,
        duration: duration,
        wordCount: wordCount,
        segmentCount: chunks.length || 1,
      };

      // Save to history
      AppState.addHistory({
        name: selectedFile.name,
        mode: modelSize,
        language: language,
        duration: duration,
        wordCount: wordCount,
        segmentCount: transcript.segmentCount,
        text: formatted,
      });

      Utils.showToast('Transcription complete!');

    } catch (err) {
      console.error('Transcription error:', err);
      Utils.showToast('Transcription failed: ' + (err.message || 'Unknown error'));
    }

    isTranscribing = false;
    progressPct = 100;
    render();
  }

  render();
}

Router.register('dashboard/transcribe', renderTranscribePage);
