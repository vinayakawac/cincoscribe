/* ===== Merge Audio Page ===== */

function renderMergeAudioPage(container) {
  let files = [];
  let isMerging = false;
  let mergedBlob = null;

  function render() {
    container.innerHTML = `
      <div class="page-container no-scroll-layout">
        <div class="split-layout">
          <div class="layout-main">
            <div class="upload-zone" id="merge-upload-zone" style="border: 2px dashed var(--clr-border-med); background: var(--clr-bg-subtle); border-radius: var(--radius-xl); ${files.length > 0 ? 'padding: 24px var(--sp-4);' : ''}">
              <input type="file" accept="audio/*" multiple id="merge-file-input">
              <div class="upload-zone-content">
                <div class="upload-icon-wrapper" style="${files.length > 0 ? 'width:42px; height:42px; margin-bottom:0;' : ''}">
                  ${Utils.icons.layers}
                </div>
                <p class="upload-title" style="${files.length > 0 ? 'font-size:var(--fs-sm);' : ''}">Drop audio files here or click to browse</p>
                ${files.length === 0 ? `<p class="upload-subtitle">Add 2 or more audio files to merge them in order</p>` : ''}
              </div>
            </div>

            ${files.length > 0 ? renderFileList() : ''}
            ${mergedBlob ? renderMergedResult() : ''}
          </div>

          <div class="layout-sidebar" style="gap: var(--sp-5);">
            ${renderSidebarStats()}
          </div>
        </div>
      </div>
    `;
    bindEvents();

    if (mergedBlob) {
      const audio = document.getElementById('merged-audio');
      if (audio) audio.src = URL.createObjectURL(mergedBlob);
    }
  }

  function renderFileList() {
    return `
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-1);">
          <span class="badge badge-primary" style="font-family: var(--ff-display); font-size: 10px; padding: 2px 6px;">${files.length} file${files.length !== 1 ? 's' : ''} added</span>
          <button class="btn-ghost" id="btn-clear-all" style="color: var(--clr-error); font-size: 11px;">${Utils.icons.trash} Clear all</button>
        </div>
        <div class="merge-file-list" style="flex: 1; overflow-y: auto; border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-xl); padding: var(--sp-4);">
          ${files.map((f, i) => {
            const isFirst = i === 0;
            const isLast = i === files.length - 1;
            return `
              <div class="merge-file-item" style="padding: 10px 14px; gap: var(--sp-3); border: none; background: var(--clr-bg-code); border-radius: var(--radius-lg); margin-bottom: var(--sp-2);">
                <span class="badge badge-primary" style="font-family: var(--ff-display); font-size: 10px; padding: 2px 6px;">#${i + 1}</span>
                <div class="merge-file-info">
                  <div class="merge-file-name" title="${escapeHtml(f.name)}" style="font-size: 13px;">${escapeHtml(f.name)}</div>
                  <div class="merge-file-meta" style="font-size: 10px;">${Utils.formatFileSize(f.size)}</div>
                </div>
                
                <!-- Up / Down Reorder Controls -->
                <div class="merge-item-controls">
                  <button class="btn-merge-control" data-move-up="${i}" title="Move up" ${isFirst ? 'disabled' : ''}>
                    ${Utils.icons.chevronUp || `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`}
                  </button>
                  <button class="btn-merge-control" data-move-down="${i}" title="Move down" ${isLast ? 'disabled' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>

                <button class="merge-file-remove btn-icon-sm" data-remove="${i}" title="Remove file" style="color: var(--clr-error);">
                  ${Utils.icons.x}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderSidebarStats() {
    const disabled = files.length < 2 || isMerging;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    return `
      <div class="settings-section-card" style="border: none; background: transparent; padding: 0; gap: 6px;">
        <label class="settings-section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: var(--clr-text-faint);">Merge summary</label>
        
        <div class="transcript-stats" style="flex-direction: column; gap: var(--sp-3); border: none; background: var(--clr-bg-subtle); padding: 14px 18px; border-radius: var(--radius-lg); margin: 0; font-size: 11px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="stat-label">Total Files</span>
            <span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${files.length}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="stat-label">Combined Size</span>
            <span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatFileSize(totalSize)}</span>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-merge" ${disabled ? 'disabled' : ''} style="background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 10px 18px; font-size: 13px; width: 100%; margin-top: 8px;">
          ${isMerging ? 'Merging tracks...' : 'Merge tracks'}
        </button>
      </div>
    `;
  }

  function renderMergedResult() {
    return `
      <div class="audio-player-wrap" style="border: none; margin-top: var(--sp-4); padding: 14px 18px; background: var(--clr-bg-subtle); border-radius: var(--radius-lg);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <div class="transcript-title" style="margin:0; font-size: var(--fs-xs);">Merged Output Track</div>
          <button class="btn-ghost" id="btn-download-merged" style="font-size: 11px;">
            ${Utils.icons.download} Download
          </button>
        </div>
        <audio id="merged-audio" controls style="width:100%; height: 36px; accent-color: var(--clr-primary);"></audio>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function bindEvents() {
    const zone = document.getElementById('merge-upload-zone');
    const fileInput = document.getElementById('merge-file-input');

    if (zone && fileInput) {
      zone.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.merge-file-item')) return;
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

    const clearAllBtn = document.getElementById('btn-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        files = [];
        mergedBlob = null;
        render();
      });
    }

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove'));
        files.splice(idx, 1);
        mergedBlob = null;
        render();
      });
    });

    container.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', () => {
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

    const mergeBtn = document.getElementById('btn-merge');
    if (mergeBtn) {
      mergeBtn.addEventListener('click', startMerging);
    }

    const downloadBtn = document.getElementById('btn-download-merged');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (!mergedBlob) return;
        Utils.downloadBlob(mergedBlob, `merged_audio_${Date.now()}.wav`);
      });
    }
  }

  function handleFiles(newFiles) {
    const audioFiles = newFiles.filter(f => f.type.startsWith('audio/'));
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
    render();

    try {
      Utils.showToast('Merging audio files locally...');
      
      // Map files to their base64 representation to send to Python sidecar
      const fileDataList = [];
      for (const file of files) {
        const base64 = await Utils.fileToBase64(file);
        fileDataList.push({
          name: file.name,
          data: base64
        });
      }

      let response;
      if (window.electronAPI && window.electronAPI.mergeAudio) {
        response = await window.electronAPI.mergeAudio({ files: fileDataList });
      } else {
        // Fallback to fetch from Python sidecar
        let port = 5555;
        if (window.electronAPI) {
          port = await window.electronAPI.getSidecarPort();
        }
        const hostname = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '127.0.0.1' : (window.location.hostname || 'localhost');
        const res = await fetch(`http://${hostname}:${port}/merge-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: fileDataList })
        });
        if (res.ok) {
          response = await res.json();
        } else {
          const errText = await res.text();
          throw new Error(errText || 'Failed to merge audio via sidecar HTTP');
        }
      }

      if (response && response.success && response.audioData) {
        const raw = window.atob(response.audioData);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));
        for (let i = 0; i < rawLength; i++) {
          array[i] = raw.charCodeAt(i);
        }
        mergedBlob = new Blob([array], { type: 'audio/wav' });

        // Add to history
        AppState.addHistory({
          name: `Merged: ${files[0].name.substring(0, 15)} + ${files.length - 1} files`,
          mode: 'audio-merge',
          language: 'none',
          duration: response.duration || 0,
          wordCount: 0,
          segmentCount: files.length,
          text: `[Audio Merger]\n\nMerged the following files in order:\n` + files.map((f, i) => `${i + 1}. ${f.name} (${Utils.formatFileSize(f.size)})`).join('\n')
        });

        Utils.showToast('Audio files merged successfully!');
      } else {
        throw new Error(response ? response.error : 'Invalid response from merger engine');
      }

    } catch (err) {
      console.error('Audio merge error:', err);
      Utils.showToast('Merge failed: ' + (err.message || 'Unknown error'));
    }

    isMerging = false;
    render();
  }

  render();
}

Router.register('dashboard/merge-audio', renderMergeAudioPage);
