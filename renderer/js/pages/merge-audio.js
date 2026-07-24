// Module-level persistent page state across tab switches
let files = [];
let isMerging = false;
let mergedBlob = null;
let silenceGap = 0; // seconds
let outputName = 'merged_audio_track.wav';
let activePreviewIndex = null;
let activeAudioEl = null;
let draggedIndex = null;

function renderMergeAudioPage(container) {

  function render() {
    container.innerHTML = `
      <style>
        .merge-page-revamped {
          animation: fade-up 280ms cubic-bezier(0.16,1,0.3,1) both;
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
        }
        .merge-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--clr-border);
        }
        .merge-header h2 {
          font-family: var(--ff-display);
          font-size: 22px;
          font-weight: 700;
          color: var(--clr-text);
          margin: 0 0 4px 0;
          letter-spacing: -0.02em;
        }
        .merge-header p {
          font-size: 13px;
          color: var(--clr-text-muted);
          margin: 0;
        }
        .merge-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 820px) {
          .merge-grid {
            grid-template-columns: 1fr;
          }
        }
        .merge-upload-card {
          background: var(--clr-bg-subtle);
          border: 2px dashed var(--clr-border);
          border-radius: var(--radius-lg);
          padding: 32px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 200ms ease;
          position: relative;
        }
        .merge-upload-card:hover, .merge-upload-card.dragover {
          border-color: var(--clr-primary);
          background: rgba(245, 158, 11, 0.04);
        }
        .merge-upload-card input[type="file"] {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        .upload-icon-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--clr-surface-raised, #262626);
          border: 1px solid var(--clr-border);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--clr-primary);
          margin-bottom: 12px;
        }
        .file-list-card {
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .file-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .merge-item-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--clr-surface-raised, #262626);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          cursor: grab;
          transition: all 150ms ease;
          user-select: none;
        }
        .merge-item-row:active {
          cursor: grabbing;
        }
        .merge-item-row.dragging {
          opacity: 0.4;
          border-style: dashed;
          border-color: var(--clr-primary);
        }
        .merge-item-row.drag-over-top {
          border-top: 2px solid var(--clr-primary) !important;
        }
        .merge-item-row.drag-over-bottom {
          border-bottom: 2px solid var(--clr-primary) !important;
        }
        .merge-item-row:hover {
          border-color: var(--clr-border-hover);
        }
        .drag-handle-icon {
          color: var(--clr-text-muted);
          cursor: grab;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .merge-item-badge {
          background: var(--clr-bg);
          color: var(--clr-primary);
          font-family: var(--ff-mono);
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--clr-border);
        }
        .merge-item-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--clr-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }
        .merge-item-meta {
          font-size: 11px;
          color: var(--clr-text-muted);
        }
        .merge-control-btn {
          background: transparent;
          border: 1px solid var(--clr-border);
          color: var(--clr-text-muted);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 150ms ease;
        }
        .merge-control-btn:hover:not(:disabled) {
          color: var(--clr-text);
          background: rgba(255,255,255,0.08);
          border-color: var(--clr-border-hover);
        }
        .merge-control-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .summary-card {
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .summary-stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
        .summary-stat-label {
          color: var(--clr-text-muted);
        }
        .summary-stat-val {
          font-weight: 600;
          color: var(--clr-text);
        }

        /* ── Custom Styled Dropdown Controls ── */
        .select-wrapper-custom {
          position: relative;
          display: block;
          width: 100%;
        }
        .select-wrapper-custom::after {
          content: '';
          position: absolute;
          right: 14px;
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
          box-sizing: border-box;
          padding: 9px 34px 9px 14px;
          background: var(--clr-surface-raised) !important;
          border: 1px solid var(--clr-border) !important;
          color: var(--clr-text) !important;
          border-radius: var(--radius-md, 8px) !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          font-family: var(--ff-sans) !important;
          outline: none !important;
          cursor: pointer !important;
          transition: all 150ms ease !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1) !important;
        }
        .select-input-styled:hover {
          background: var(--clr-bg-muted) !important;
          border-color: var(--clr-border-hover) !important;
        }
        .select-input-styled:focus {
          border-color: var(--clr-primary) !important;
          box-shadow: 0 0 0 2px var(--clr-focus-ring) !important;
        }
        .select-input-styled option {
          background: var(--clr-card) !important;
          color: var(--clr-text) !important;
          padding: 10px !important;
          font-size: 13px !important;
        }
      </style>

      <div class="page-container merge-page-revamped">
        <!-- Header Banner -->
        <div class="merge-header">
          <div>
            <h2>Audio Track Merger</h2>
            <p>Combine multiple audio files into a single master track with drag-and-drop reordering.</p>
          </div>
        </div>

        <div class="merge-grid">
          <!-- Main Content Column -->
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Dropzone -->
            <div class="merge-upload-card" id="merge-upload-zone">
              <input type="file" accept="audio/*" multiple id="merge-file-input">
              <div class="upload-icon-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v4"/><path d="M6 6v12"/><path d="M10 3v18"/><path d="M14 8v8"/><path d="M18 5v14"/><path d="M22 10v4"/></svg>
              </div>
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: var(--clr-text);">
                Drop audio files here or click to browse
              </h4>
              <p style="margin: 0; font-size: 12px; color: var(--clr-text-muted);">
                Supports MP3, WAV, FLAC, M4A, OGG tracks
              </p>
            </div>

            <!-- File List Section -->
            ${files.length > 0 ? renderFileList() : ''}

            <!-- Merged Output Result Card -->
            ${mergedBlob ? renderMergedResult() : ''}
          </div>

          <!-- Sidebar Options & Action Panel -->
          <div class="summary-card">
            <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--clr-text); border-bottom: 1px solid var(--clr-border); padding-bottom: 10px;">
              Merge Configuration
            </h4>

            <div class="summary-stat-row">
              <span class="summary-stat-label">Total Selected Tracks</span>
              <span class="summary-stat-val">${files.length} track${files.length !== 1 ? 's' : ''}</span>
            </div>

            <div class="summary-stat-row">
              <span class="summary-stat-label">Combined Size</span>
              <span class="summary-stat-val">${Utils.formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}</span>
            </div>

            <!-- Silence Gap Styled Dropdown -->
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">Silence Gap Between Tracks</label>
              <div class="select-wrapper-custom">
                <select id="select-silence-gap" class="select-input-styled">
                  <option value="0" ${silenceGap === 0 ? 'selected' : ''}>No Gap (0s)</option>
                  <option value="0.5" ${silenceGap === 0.5 ? 'selected' : ''}>0.5 Seconds</option>
                  <option value="1.0" ${silenceGap === 1.0 ? 'selected' : ''}>1.0 Second</option>
                  <option value="2.0" ${silenceGap === 2.0 ? 'selected' : ''}>2.0 Seconds</option>
                </select>
              </div>
            </div>

            <!-- Output Name Input -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">Output File Name</label>
              <input
                id="input-output-name"
                type="text"
                value="${escapeHtml(outputName)}"
                style="width: 100%; box-sizing: border-box; padding: 8px 12px; background: var(--clr-surface-raised); border: 1px solid var(--clr-border); border-radius: var(--radius-md); color: var(--clr-text); font-size: 12px; outline: none;"
              />
            </div>

            <!-- Submit Button -->
            <button
              id="btn-merge"
              class="btn btn-primary"
              ${files.length < 2 || isMerging ? 'disabled' : ''}
              style="width: 100%; padding: 11px; font-size: 13px; font-weight: 700; margin-top: 8px;"
            >
              ${isMerging ? 'Stitching Audio Tracks...' : 'Merge Audio Tracks'}
            </button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderFileList() {
    return `
      <div class="file-list-card">
        <div class="file-list-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: var(--clr-text);">
              Track Sequence (${files.length})
            </span>
            <span style="font-size: 10px; color: var(--clr-text-muted);">• Drag items to reorder</span>
          </div>
          <button id="btn-clear-all" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; color: var(--clr-error); border-color: var(--clr-border);">
            Clear All
          </button>
        </div>

        <div id="merge-file-list-container" style="display: flex; flex-direction: column; gap: 8px;">
          ${files.map((f, i) => `
            <div
              class="merge-item-row"
              draggable="true"
              data-drag-idx="${i}"
            >
              <div class="drag-handle-icon" title="Drag to reorder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
              </div>

              <span class="merge-item-badge">#${i + 1}</span>
              
              <!-- Mini Play/Pause Preview -->
              <button class="merge-control-btn btn-preview-track" data-preview-idx="${i}" title="Preview audio">
                ${activePreviewIndex === i ? `
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ` : `
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                `}
              </button>

              <div style="flex: 1; min-width: 0;">
                <div class="merge-item-title" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                <div class="merge-item-meta">${Utils.formatFileSize(f.size)} • ${f.type || 'audio track'}</div>
              </div>

              <!-- Move Up / Down Buttons -->
              <div style="display: flex; gap: 4px;">
                <button class="merge-control-btn" data-move-up="${i}" title="Move track up" ${i === 0 ? 'disabled' : ''}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
                </button>
                <button class="merge-control-btn" data-move-down="${i}" title="Move track down" ${i === files.length - 1 ? 'disabled' : ''}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button class="merge-control-btn" data-remove="${i}" title="Remove track" style="color: var(--clr-error);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderMergedResult() {
    return `
      <div style="background: var(--clr-bg-subtle); border: 1px solid var(--clr-primary); border-radius: var(--radius-lg); padding: 18px; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.6);"></span>
            <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--clr-text);">Master Merged Track Ready</h4>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-download-merged" class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;">
              Download WAV
            </button>
            <button id="btn-transcribe-merged" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;">
              Transcribe Track
            </button>
          </div>
        </div>

        <audio id="merged-audio-player" controls style="width: 100%; height: 38px; accent-color: var(--clr-primary); outline: none;"></audio>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function bindEvents() {
    const zone = document.getElementById('merge-upload-zone');
    const fileInput = document.getElementById('merge-file-input');

    if (zone && fileInput) {
      zone.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.merge-item-row')) return;
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
        if (e.dataTransfer.files.length > 0) {
          handleFiles(Array.from(e.dataTransfer.files));
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          handleFiles(Array.from(fileInput.files));
        }
      });
    }

    // HTML5 Drag and Drop Reordering Events for Track List
    const rows = container.querySelectorAll('.merge-item-row[data-drag-idx]');
    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(row.getAttribute('data-drag-idx'));
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        draggedIndex = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetIdx = parseInt(row.getAttribute('data-drag-idx'));
        rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        if (draggedIndex !== null && targetIdx !== draggedIndex) {
          if (targetIdx < draggedIndex) {
            row.classList.add('drag-over-top');
          } else {
            row.classList.add('drag-over-bottom');
          }
        }
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(row.getAttribute('data-drag-idx'));
        if (draggedIndex !== null && targetIdx !== null && draggedIndex !== targetIdx) {
          const item = files.splice(draggedIndex, 1)[0];
          files.splice(targetIdx, 0, item);
          mergedBlob = null;
          stopPreviewAudio();
          render();
        }
      });
    });

    // Silence gap & output name change listeners
    document.getElementById('select-silence-gap')?.addEventListener('change', (e) => {
      silenceGap = parseFloat(e.target.value) || 0;
    });

    document.getElementById('input-output-name')?.addEventListener('input', (e) => {
      outputName = e.target.value.trim() || 'merged_audio_track.wav';
    });

    // Clear all
    document.getElementById('btn-clear-all')?.addEventListener('click', () => {
      stopPreviewAudio();
      files = [];
      mergedBlob = null;
      render();
    });

    // Track Preview
    container.querySelectorAll('[data-preview-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-preview-idx'));
        if (activePreviewIndex === idx) {
          stopPreviewAudio();
          render();
        } else {
          stopPreviewAudio();
          activePreviewIndex = idx;
          const file = files[idx];
          if (file) {
            activeAudioEl = new Audio(URL.createObjectURL(file));
            activeAudioEl.play();
            activeAudioEl.onended = () => {
              stopPreviewAudio();
              render();
            };
          }
          render();
        }
      });
    });

    // Up / Down / Remove
    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopPreviewAudio();
        const idx = parseInt(btn.getAttribute('data-remove'));
        files.splice(idx, 1);
        mergedBlob = null;
        render();
      });
    });

    container.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopPreviewAudio();
        const idx = parseInt(btn.getAttribute('data-move-up'));
        if (idx > 0) {
          const temp = files[idx];
          files[idx] = files[idx - 1];
          files[idx - 1] = temp;
          mergedBlob = null;
          render();
        }
      });
    });

    container.querySelectorAll('[data-move-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopPreviewAudio();
        const idx = parseInt(btn.getAttribute('data-move-down'));
        if (idx < files.length - 1) {
          const temp = files[idx];
          files[idx] = files[idx + 1];
          files[idx + 1] = temp;
          mergedBlob = null;
          render();
        }
      });
    });

    // Merge Action
    document.getElementById('btn-merge')?.addEventListener('click', startMerging);

    // Download WAV Action
    document.getElementById('btn-download-merged')?.addEventListener('click', () => {
      if (!mergedBlob) return;
      Utils.downloadBlob(mergedBlob, outputName || `merged_audio_${Date.now()}.wav`);
    });

    // Transcribe Merged Track Action
    document.getElementById('btn-transcribe-merged')?.addEventListener('click', () => {
      if (!mergedBlob) return;
      const mergedFile = new File([mergedBlob], outputName, { type: 'audio/wav' });
      AppState.selectedAudioFile = mergedFile;
      Router.navigate('dashboard/transcribe');
    });
  }

  function stopPreviewAudio() {
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl = null;
    }
    activePreviewIndex = null;
  }

  function handleFiles(newFiles) {
    const audioFiles = newFiles.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|flac|m4a|ogg|aac|wma)$/i));
    if (audioFiles.length === 0) {
      Utils.showToast('Please select valid audio files only.');
      return;
    }
    files = files.concat(audioFiles);
    mergedBlob = null;
    render();
  }

  async function startMerging() {
    if (files.length < 2 || isMerging) return;

    isMerging = true;
    mergedBlob = null;
    stopPreviewAudio();
    render();

    try {
      Utils.showToast('Merging audio tracks...');
      
      let response;
      const fileDataList = [];
      for (const file of files) {
        const base64 = await Utils.fileToBase64(file);
        fileDataList.push({ name: file.name, data: base64 });
      }

      if (window.electronAPI && window.electronAPI.mergeAudio) {
        response = await window.electronAPI.mergeAudio({ files: fileDataList, silenceGap });
      } else {
        try {
          let port = 5555;
          if (window.electronAPI) port = await window.electronAPI.getSidecarPort();
          const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
          const res = await fetch(`http://${hostname}:${port}/merge-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: fileDataList, silence_gap: silenceGap })
          });
          if (res.ok) response = await res.json();
        } catch (e) {
          console.warn('Sidecar HTTP merge failed, falling back to Web Audio API:', e);
        }
      }

      if (response && response.success && response.audioData) {
        const raw = window.atob(response.audioData);
        const array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
        mergedBlob = new Blob([array], { type: 'audio/wav' });
      } else {
        // Fallback: Perform pure Web Audio API merger in JS
        mergedBlob = await mergeAudioWebAudio(files, silenceGap);
      }

      if (mergedBlob) {
        AppState.addHistory({
          name: outputName,
          mode: 'audio-merge',
          language: 'none',
          duration: 0,
          wordCount: 0,
          segmentCount: files.length,
          text: `[Audio Track Merger]\n\nMerged ${files.length} audio tracks:\n` + files.map((f, i) => `${i + 1}. ${f.name} (${Utils.formatFileSize(f.size)})`).join('\n')
        });

        Utils.showToast('Audio tracks merged successfully!');
      }

    } catch (err) {
      console.error('Audio merge error:', err);
      Utils.showToast('Merge error: ' + (err.message || 'Failed to merge tracks'));
    }

    isMerging = false;
    render();

    if (mergedBlob) {
      setTimeout(() => {
        const player = document.getElementById('merged-audio-player');
        if (player) player.src = URL.createObjectURL(mergedBlob);
      }, 50);
    }
  }

  /* ── Web Audio API Local Merger Fallback ──────────────── */
  async function mergeAudioWebAudio(fileList, gapSec = 0) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffers = [];
    for (const f of fileList) {
      const arrayBuf = await f.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      buffers.push(decoded);
    }

    const numChannels = Math.max(...buffers.map(b => b.numberOfChannels));
    const sampleRate = buffers[0].sampleRate;
    const gapSamples = Math.floor(gapSec * sampleRate);

    let totalSamples = 0;
    buffers.forEach((b, i) => {
      totalSamples += b.length;
      if (i < buffers.length - 1) totalSamples += gapSamples;
    });

    const outBuf = audioCtx.createBuffer(numChannels, totalSamples, sampleRate);
    let offset = 0;

    for (let i = 0; i < buffers.length; i++) {
      const b = buffers[i];
      for (let ch = 0; ch < numChannels; ch++) {
        const outData = outBuf.getChannelData(ch);
        const inData = b.getChannelData(ch < b.numberOfChannels ? ch : 0);
        outData.set(inData, offset);
      }
      offset += b.length + gapSamples;
    }

    return encodeWavBlob(outBuf);
  }

  function encodeWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    let samples;

    if (numChannels === 2) {
      const l = buffer.getChannelData(0);
      const r = buffer.getChannelData(1);
      samples = new Float32Array(l.length + r.length);
      let idx = 0;
      for (let i = 0; i < l.length; i++) {
        samples[idx++] = l[i];
        samples[idx++] = r[i];
      }
    } else {
      samples = buffer.getChannelData(0);
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const bufferLength = 44 + samples.length * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeStr(view, 8, 'WAVE');
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(view, 36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);

    let p = 44;
    for (let i = 0; i < samples.length; i++, p += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  function writeStr(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  render();
}

Router.register('dashboard/merge-audio', renderMergeAudioPage);
