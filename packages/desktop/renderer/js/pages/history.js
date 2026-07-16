/* ===== History Page ===== */

function renderHistoryPage(container) {
  let selectedIdx = null;
  let activeFilterTab = 'all'; // 'all' | 'transcribe' | 'speech'

  function render() {
    const rawItems = AppState.history;

    // Filter items based on activeFilterTab
    const items = rawItems.filter(item => {
      const modeLower = (item.mode || '').toLowerCase();
      const isSpeech = modeLower.includes('kittentts') || (item.text || '').includes('[Speech Synthesis');
      
      if (activeFilterTab === 'transcribe') {
        return !isSpeech;
      }
      if (activeFilterTab === 'speech') {
        return isSpeech;
      }
      return true;
    });

    // Safety bounds check
    if (items.length > 0) {
      if (selectedIdx === null || selectedIdx >= items.length) {
        selectedIdx = 0;
      }
    } else {
      selectedIdx = null;
    }

    container.innerHTML = `
      <div class="page-container no-scroll-layout">
        ${rawItems.length === 0 ? `
          <div class="empty-state" style="margin-top: var(--sp-8); border: none; background: transparent;">
            <div class="empty-icon" style="display:flex; justify-content:center; align-items:center;">${Utils.icons.clipboard}</div>
            <p class="empty-title">No history yet</p>
            <p class="empty-desc">Your transcription and speech history will appear here once generated.</p>
            <button class="btn btn-primary btn-sm" style="margin-top:var(--sp-4); background: white; color: black; font-weight: bold; border-radius: var(--radius-full); padding: 8px 18px;" onclick="Router.navigate('dashboard/transcribe')">Start Transcribing</button>
          </div>
        ` : `
          <div class="split-layout" style="grid-template-columns: 1fr 1.3fr;">
            <div class="layout-main" style="display:flex; flex-direction:column; gap:var(--sp-3); height: 100%;">
              <!-- Filter Tabs -->
              <div class="layout-tabs" style="margin: 0; padding: 0; background: transparent; border: none; display: flex; gap: var(--sp-2);">
                <div class="layout-tab ${activeFilterTab === 'all' ? 'active' : ''}" data-filter-tab="all" style="font-size: 13px;">All</div>
                <div class="layout-tab ${activeFilterTab === 'transcribe' ? 'active' : ''}" data-filter-tab="transcribe" style="font-size: 13px;">Transcribe</div>
                <div class="layout-tab ${activeFilterTab === 'speech' ? 'active' : ''}" data-filter-tab="speech" style="font-size: 13px;">Speech</div>
              </div>

              ${items.length === 0 ? `
                <div class="empty-state" style="margin-top: var(--sp-6); border: none; background: transparent; flex: 1;">
                  <p class="empty-title" style="font-size: 14px;">No items found</p>
                  <p class="empty-desc" style="font-size: 12px;">There are no entries matching the selected filter.</p>
                </div>
              ` : `
                <div class="history-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                  ${items.map((item, idx) => {
                    const modeLower = (item.mode || '').toLowerCase();
                    const isSpeech = modeLower.includes('kittentts') || (item.text || '').includes('[Speech Synthesis');
                    return `
                      <div class="history-item ${selectedIdx === idx ? 'selected' : ''}" data-select-history="${idx}" style="border: none; background: var(--clr-bg-subtle); border-radius: var(--radius-lg); padding: 12px 14px; cursor: pointer; transition: background var(--dur-fast);">
                        <div class="history-info">
                          <p class="history-name" style="font-size:13px; font-weight:var(--fw-semibold); margin-bottom:4px; line-height:1.4; color: var(--clr-text);" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
                          <div class="history-item-meta" style="font-size:10px; color: var(--clr-text-faint); display: flex; gap: 8px; align-items: center;">
                            <span>${Utils.formatDate(item.date)}</span>
                            <span>•</span>
                            <span>${Utils.formatDuration(item.duration)}</span>
                            <span>•</span>
                            <span>${Utils.formatNumber(item.wordCount)} words</span>
                            <span>•</span>
                            <span style="display:inline-flex; align-items:center; gap:2px;">
                              ${isSpeech ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>` : item.mode === 'accuracy' ? Utils.icons.target : Utils.icons.bolt}
                              ${isSpeech ? 'Speech' : item.mode === 'accuracy' ? 'Accuracy' : item.mode === 'audio-merge' ? 'Merge' : 'Fast'}
                            </span>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <div class="layout-sidebar">
              ${renderDetailsPane(items[selectedIdx])}
            </div>
          </div>
        `}
      </div>
    `;
    bindEvents();
  }

  function renderDetailsPane(activeItem) {
    if (!activeItem) return '';
    const modeLower = (activeItem.mode || '').toLowerCase();
    const isSpeech = modeLower.includes('kittentts') || (activeItem.text || '').includes('[Speech Synthesis');

    return `
      <div style="display:flex; flex-direction:column; gap:var(--sp-4); flex: 1; min-height: 0; height: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--sp-4);">
          <div style="min-width:0;">
            <h3 class="transcript-title" style="margin:0; font-size:var(--fs-sm); font-weight:var(--fw-semibold); color:var(--clr-text); word-break:break-all;" title="${escapeHtml(activeItem.name)}">${escapeHtml(activeItem.name)}</h3>
            <p style="font-size:11px; color:var(--clr-text-faint); margin:4px 0 0 0;">${isSpeech ? 'Generated' : 'Transcribed'} on ${Utils.formatDate(activeItem.date)}</p>
          </div>
          <div style="display:flex; gap:var(--sp-2); flex-shrink:0;">
            <button class="btn-ghost btn-sm" id="btn-copy-history" title="Copy transcript" style="font-size: 11px;">${Utils.icons.copy} Copy</button>
            <button class="btn-ghost btn-sm" id="btn-download-history" title="Download transcript" style="font-size: 11px;">${Utils.icons.download} Download</button>
            <button class="btn-ghost btn-sm" id="btn-delete-history" style="color:var(--clr-error); font-size: 11px;" title="Delete entry">${Utils.icons.trash} Delete</button>
          </div>
        </div>

        <div class="transcript-stats" style="border: none; background: var(--clr-bg-subtle); padding: 12px 14px; border-radius: var(--radius-lg); margin: 0; font-size: 11px;">
          <span><span class="stat-label">Duration </span><span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatDuration(activeItem.duration)}</span></span>
          <span><span class="stat-label">Words </span><span class="stat-value" style="font-weight: 600; color: var(--clr-text);">${Utils.formatNumber(activeItem.wordCount)}</span></span>
          <span><span class="stat-label">${isSpeech ? 'Voice Model' : 'Language'} </span><span class="stat-value" style="text-transform: capitalize; font-weight: 600; color: var(--clr-text);">${isSpeech ? activeItem.mode : (activeItem.language || 'auto')}</span></span>
        </div>

        <!-- Scrollable text content block -->
        <div class="textarea-wrapper" style="flex:1; display:flex; flex-direction:column; min-height: 0;">
          <pre style="margin: 0; padding: var(--sp-4); overflow-y: auto; flex: 1; font-size: 13px; font-family: var(--ff-mono); line-height: 1.6; white-space: pre-wrap; word-break: break-word; background: var(--clr-bg-code); color: var(--clr-text-muted); border-radius: var(--radius-xl); border: none; height: 100%;">${escapeHtml(activeItem.text)}</pre>
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
    container.querySelectorAll('[data-filter-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeFilterTab = tab.getAttribute('data-filter-tab');
        selectedIdx = 0;
        render();
      });
    });

    container.querySelectorAll('[data-select-history]').forEach(item => {
      item.addEventListener('click', () => {
        selectedIdx = parseInt(item.getAttribute('data-select-history'));
        render();
      });
    });

    const copyBtn = document.getElementById('btn-copy-history');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const rawItems = AppState.history;
        const items = rawItems.filter(item => {
          const modeLower = (item.mode || '').toLowerCase();
          const isSpeech = modeLower.includes('kittentts') || (item.text || '').includes('[Speech Synthesis');
          
          if (activeFilterTab === 'transcribe') return !isSpeech;
          if (activeFilterTab === 'speech') return isSpeech;
          return true;
        });

        const activeItem = items[selectedIdx];
        if (activeItem) {
          navigator.clipboard.writeText(activeItem.text);
          Utils.showToast('Transcript copied to clipboard!');
        }
      });
    }

    const downloadBtn = document.getElementById('btn-download-history');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const rawItems = AppState.history;
        const items = rawItems.filter(item => {
          const modeLower = (item.mode || '').toLowerCase();
          const isSpeech = modeLower.includes('kittentts') || (item.text || '').includes('[Speech Synthesis');
          
          if (activeFilterTab === 'transcribe') return !isSpeech;
          if (activeFilterTab === 'speech') return isSpeech;
          return true;
        });

        const activeItem = items[selectedIdx];
        if (activeItem) {
          const blob = new Blob([activeItem.text], { type: 'text/plain;charset=utf-8' });
          Utils.downloadBlob(blob, activeItem.name.replace(/\.[^/.]+$/, "") + '.txt');
        }
      });
    }

    const deleteBtn = container.querySelector('#btn-delete-history');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const rawItems = AppState.history;
        const items = rawItems.filter(item => {
          const modeLower = (item.mode || '').toLowerCase();
          const isSpeech = modeLower.includes('kittentts') || (item.text || '').includes('[Speech Synthesis');
          
          if (activeFilterTab === 'transcribe') return !isSpeech;
          if (activeFilterTab === 'speech') return isSpeech;
          return true;
        });

        const activeItem = items[selectedIdx];
        if (activeItem) {
          if (confirm(`Are you sure you want to delete "${activeItem.name}" from history?`)) {
            AppState.deleteHistory(activeItem.id || activeItem.date);
            selectedIdx = null;
            render();
            Utils.showToast('Entry deleted from history.');
          }
        }
      });
    }
  }

  render();
}

Router.register('dashboard/history', renderHistoryPage);
