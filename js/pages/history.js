/* ===== Revamped History Page — CincoScribe ===== */

function renderHistoryPage(container) {
  let selectedId = null;
  let activeFilterTab = 'all'; // 'all' | 'transcribe' | 'speech' | 'merge'
  let searchQuery = '';
  let sortBy = 'newest'; // 'newest' | 'oldest' | 'words' | 'duration'

  function getFilteredItems() {
    const rawItems = AppState.history || [];

    return rawItems.filter(item => {
      const modeLower = (item.mode || '').toLowerCase();
      const textContent = (item.text || '').toLowerCase();
      const nameContent = (item.name || '').toLowerCase();

      const isSpeech = modeLower.includes('kittentts') || modeLower.includes('tts') || modeLower.includes('kokoro') || modeLower.includes('chatterbox') || modeLower.includes('speech') || textContent.includes('[speech synthesis');
      const isMerge = modeLower.includes('merge');
      const isTranscribe = !isSpeech && !isMerge;

      if (activeFilterTab === 'transcribe' && !isTranscribe) return false;
      if (activeFilterTab === 'speech' && !isSpeech) return false;
      if (activeFilterTab === 'merge' && !isMerge) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return nameContent.includes(q) || textContent.includes(q);
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
      if (sortBy === 'words') return (b.wordCount || 0) - (a.wordCount || 0);
      if (sortBy === 'duration') return (b.duration || 0) - (a.duration || 0);
      return new Date(b.date) - new Date(a.date); // newest default
    });
  }

  function render() {
    const rawItems = AppState.history || [];
    const items = getFilteredItems();

    const transcribeCount = rawItems.filter(item => {
      const modeLower = (item.mode || '').toLowerCase();
      const isSpeech = modeLower.includes('kittentts') || modeLower.includes('tts') || modeLower.includes('kokoro') || modeLower.includes('chatterbox') || modeLower.includes('speech') || (item.text || '').includes('[speech synthesis');
      const isMerge = modeLower.includes('merge');
      return !isSpeech && !isMerge;
    }).length;

    const speechCount = rawItems.filter(item => {
      const modeLower = (item.mode || '').toLowerCase();
      return modeLower.includes('kittentts') || modeLower.includes('tts') || modeLower.includes('kokoro') || modeLower.includes('chatterbox') || modeLower.includes('speech') || (item.text || '').includes('[speech synthesis');
    }).length;

    const mergeCount = rawItems.filter(item => (item.mode || '').toLowerCase().includes('merge')).length;

    // Maintain selection state
    if (items.length > 0) {
      if (!selectedId || !items.some(i => (i.id || i.date) === selectedId)) {
        selectedId = items[0].id || items[0].date;
      }
    } else {
      selectedId = null;
    }

    const activeItem = items.find(i => (i.id || i.date) === selectedId);

    container.innerHTML = `
      <style>
        .history-revamped-page {
          animation: fade-up 280ms cubic-bezier(0.16,1,0.3,1) both;
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
          width: 100%;
          padding: 24px;
          box-sizing: border-box;
        }
        .history-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--clr-border);
        }
        .history-search-input {
          background: var(--clr-bg-subtle);
          border: 1px solid var(--clr-border-input);
          border-radius: var(--radius-full, 9999px);
          padding: 8px 16px;
          color: var(--clr-text);
          font-size: 13px;
          outline: none;
          width: 280px;
          transition: border-color 0.2s ease;
        }
        .history-search-input:focus {
          border-color: var(--clr-primary);
        }
        .history-card-item {
          background: var(--clr-card);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius-lg, 10px);
          padding: 14px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .history-card-item:hover {
          background: var(--clr-surface-raised);
          border-color: var(--clr-border-hover);
        }
        .history-card-item.selected {
          border-color: var(--clr-primary);
          background: var(--clr-primary-subtle);
        }
        .history-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: var(--radius-full, 9999px);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .history-badge-speech { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
        .history-badge-transcribe { background: rgba(16, 185, 129, 0.18); color: #34d399; }
        .history-badge-merge { background: rgba(168, 85, 247, 0.18); color: #c084fc; }
        [data-theme="light"] .history-badge-speech { background: rgba(37, 99, 235, 0.12); color: #1d4ed8; }
        [data-theme="light"] .history-badge-transcribe { background: rgba(5, 150, 105, 0.12); color: #047857; }
        [data-theme="light"] .history-badge-merge { background: rgba(126, 34, 206, 0.12); color: #7e22ce; }
      </style>

      <div class="history-revamped-page">
        <!-- Top Toolbar -->
        <div class="history-topbar">
          <!-- Filter Tabs -->
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-ghost btn-sm ${activeFilterTab === 'all' ? 'active' : ''}" data-filter-tab="all" style="font-size: 12px; border-radius: var(--radius-full); padding: 6px 14px; ${activeFilterTab === 'all' ? 'background: var(--clr-primary); color: var(--clr-bg); font-weight: bold;' : 'color: var(--clr-text-muted);'}">
              All (${rawItems.length})
            </button>
            <button class="btn-ghost btn-sm ${activeFilterTab === 'transcribe' ? 'active' : ''}" data-filter-tab="transcribe" style="font-size: 12px; border-radius: var(--radius-full); padding: 6px 14px; ${activeFilterTab === 'transcribe' ? 'background: var(--clr-primary); color: var(--clr-bg); font-weight: bold;' : 'color: var(--clr-text-muted);'}">
              Transcribe (${transcribeCount})
            </button>
            <button class="btn-ghost btn-sm ${activeFilterTab === 'speech' ? 'active' : ''}" data-filter-tab="speech" style="font-size: 12px; border-radius: var(--radius-full); padding: 6px 14px; ${activeFilterTab === 'speech' ? 'background: var(--clr-primary); color: var(--clr-bg); font-weight: bold;' : 'color: var(--clr-text-muted);'}">
              Speech (${speechCount})
            </button>
            <button class="btn-ghost btn-sm ${activeFilterTab === 'merge' ? 'active' : ''}" data-filter-tab="merge" style="font-size: 12px; border-radius: var(--radius-full); padding: 6px 14px; ${activeFilterTab === 'merge' ? 'background: var(--clr-primary); color: var(--clr-bg); font-weight: bold;' : 'color: var(--clr-text-muted);'}">
              Merges (${mergeCount})
            </button>
          </div>

          <!-- Search & Controls -->
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="text" id="history-search-input" class="history-search-input" placeholder="Search history items..." value="${escapeHtml(searchQuery)}">
            <select id="history-sort-select" style="background: var(--clr-bg-subtle); border: 1px solid var(--clr-border-input); border-radius: var(--radius-lg); padding: 8px 12px; color: var(--clr-text); font-size: 12px; outline: none; cursor: pointer;">
              <option value="newest" ${sortBy === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="oldest" ${sortBy === 'oldest' ? 'selected' : ''}>Oldest First</option>
              <option value="words" ${sortBy === 'words' ? 'selected' : ''}>Most Words</option>
              <option value="duration" ${sortBy === 'duration' ? 'selected' : ''}>Longest Duration</option>
            </select>
            ${rawItems.length > 0 ? `
              <button class="btn-ghost btn-sm" id="btn-clear-all-history" style="color: var(--clr-error, #ef4444); font-size: 12px; padding: 6px 12px;" title="Clear entire history">
                ${Utils.icons.trash} Clear All
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Main Body Grid -->
        ${rawItems.length === 0 ? `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 20px; background: var(--clr-bg-subtle); border-radius: var(--radius-xl); border: 1px solid var(--clr-border);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--clr-primary-subtle); display: flex; align-items: center; justify-content: center; color: var(--clr-primary); margin-bottom: 16px;">
              ${Utils.icons.clipboard}
            </div>
            <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: var(--clr-text);">No History Yet</h3>
            <p style="margin: 0 0 20px 0; font-size: 13px; color: var(--clr-text-muted); max-width: 360px; line-height: 1.5;">Your audio transcriptions and generated speech tracks will automatically be saved here.</p>
            <div style="display: flex; gap: 12px;">
              <button class="btn btn-primary btn-sm" style="border-radius: var(--radius-full); padding: 10px 22px; font-size: 12px;" onclick="Router.navigate('dashboard/transcribe')">Start Transcribing</button>
              <button class="btn btn-secondary btn-sm" style="border-radius: var(--radius-full); padding: 10px 22px; font-size: 12px;" onclick="Router.navigate('dashboard/text-to-voice')">Generate Speech</button>
            </div>
          </div>
        ` : `
          <div class="split-layout" style="grid-template-columns: 1fr 1.3fr; gap: 16px; flex: 1; min-height: 0;">
            <!-- Left Item List -->
            <div style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-right: 4px;">
              ${items.length === 0 ? `
                <div style="padding: 32px; text-align: center; color: var(--clr-text-muted); font-size: 13px; background: var(--clr-bg-subtle); border-radius: var(--radius-lg);">
                  No history items match your search filter.
                </div>
              ` : `
                ${items.map(item => {
                  const itemId = item.id || item.date;
                  const modeLower = (item.mode || '').toLowerCase();
                  const isSpeech = modeLower.includes('kittentts') || modeLower.includes('tts') || modeLower.includes('kokoro') || modeLower.includes('chatterbox') || modeLower.includes('speech') || (item.text || '').includes('[speech synthesis');
                  const isMerge = modeLower.includes('merge');

                  let badgeClass = 'history-badge-transcribe';
                  let badgeLabel = 'Transcribe';
                  if (isSpeech) { badgeClass = 'history-badge-speech'; badgeLabel = 'Speech'; }
                  if (isMerge) { badgeClass = 'history-badge-merge'; badgeLabel = 'Merge'; }

                  return `
                    <div class="history-card-item ${selectedId === itemId ? 'selected' : ''}" data-select-history-id="${itemId}">
                      <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="history-badge ${badgeClass}">${badgeLabel}</span>
                        <span style="font-size: 10px; color: var(--clr-text-faint);">${Utils.formatDate(item.date)}</span>
                      </div>
                      <div style="font-size: 13px; font-weight: 700; color: var(--clr-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.name)}">
                        ${escapeHtml(item.name)}
                      </div>
                      <div style="font-size: 11px; color: var(--clr-text-muted); display: flex; gap: 10px; align-items: center;">
                        <span>Duration: ${Utils.formatDuration(item.duration)}</span>
                        <span>•</span>
                        <span>${Utils.formatNumber(item.wordCount || 0)} words</span>
                        ${item.language ? `<span>•</span><span style="text-transform: uppercase;">${escapeHtml(item.language)}</span>` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              `}
            </div>

            <!-- Right Detail Preview Pane -->
            <div style="background: var(--clr-bg-subtle); border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: 20px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: hidden;">
              ${renderDetailsPane(activeItem)}
            </div>
          </div>
        `}
      </div>
    `;

    bindEvents();
  }

  function renderDetailsPane(activeItem) {
    if (!activeItem) {
      return `
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--clr-text-muted); font-size: 13px;">
          Select a history entry from the list to view details and export options.
        </div>
      `;
    }

    const modeLower = (activeItem.mode || '').toLowerCase();
    const isSpeech = modeLower.includes('kittentts') || modeLower.includes('tts') || modeLower.includes('kokoro') || modeLower.includes('chatterbox') || modeLower.includes('speech') || (activeItem.text || '').includes('[speech synthesis');

    return `
      <!-- Header Info & Actions -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--clr-text); line-height: 1.3; word-break: break-word;" title="${escapeHtml(activeItem.name)}">
            ${escapeHtml(activeItem.name)}
          </h3>
          <div style="font-size: 11px; color: var(--clr-text-faint); margin-top: 4px;">
            Created on ${Utils.formatDate(activeItem.date)}
          </div>
        </div>

        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <button class="btn-ghost btn-sm" id="btn-copy-history" title="Copy transcript text" style="font-size: 11px; padding: 6px 10px;">
            ${Utils.icons.copy} Copy
          </button>
          <button class="btn-ghost btn-sm" id="btn-download-history" title="Download text file" style="font-size: 11px; padding: 6px 10px;">
            ${Utils.icons.download} Download
          </button>
          <button class="btn-ghost btn-sm" id="btn-delete-history" style="color: var(--clr-error, #ef4444); font-size: 11px; padding: 6px 10px;" title="Delete this entry">
            ${Utils.icons.trash}
          </button>
        </div>
      </div>

      <!-- Key Metadata Stats Bar -->
      <div style="display: flex; gap: 16px; padding: 10px 14px; background: var(--clr-surface-raised); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); font-size: 11px; color: var(--clr-text-muted);">
        <div>
          <span style="color: var(--clr-text-muted);">Duration:</span>
          <strong style="color: var(--clr-text); margin-left: 4px;">${Utils.formatDuration(activeItem.duration)}</strong>
        </div>
        <div>
          <span style="color: var(--clr-text-muted);">Word Count:</span>
          <strong style="color: var(--clr-text); margin-left: 4px;">${Utils.formatNumber(activeItem.wordCount || 0)}</strong>
        </div>
        <div>
          <span style="color: var(--clr-text-muted);">${isSpeech ? 'Voice / Engine:' : 'Mode / Model:'}</span>
          <strong style="color: var(--clr-text); margin-left: 4px; text-transform: capitalize;">${escapeHtml(activeItem.mode || 'standard')}</strong>
        </div>
      </div>

      <!-- Transcript / Text Viewer -->
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
        <pre style="margin: 0; padding: 14px; font-family: var(--ff-mono); font-size: 12px; line-height: 1.6; color: var(--clr-text); background: var(--clr-bg-code); border-radius: var(--radius-lg); border: 1px solid var(--clr-border); overflow-y: auto; flex: 1; white-space: pre-wrap; word-break: break-word;">${escapeHtml(activeItem.text || '')}</pre>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function bindEvents() {
    // Filter tabs
    container.querySelectorAll('[data-filter-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeFilterTab = tab.getAttribute('data-filter-tab');
        render();
      });
    });

    // Search input
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        render();
        const reSearch = document.getElementById('history-search-input');
        if (reSearch) {
          reSearch.focus();
          reSearch.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
    }

    // Sort select
    const sortSelect = document.getElementById('history-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        sortBy = sortSelect.value;
        render();
      });
    }

    // Select history item
    container.querySelectorAll('[data-select-history-id]').forEach(card => {
      card.addEventListener('click', () => {
        selectedId = card.getAttribute('data-select-history-id');
        render();
      });
    });

    // Copy action
    const copyBtn = document.getElementById('btn-copy-history');
    if (copyBtn && selectedId) {
      copyBtn.addEventListener('click', () => {
        const item = (AppState.history || []).find(i => (i.id || i.date) === selectedId);
        if (item && item.text) {
          Utils.copyToClipboard(item.text);
        }
      });
    }

    // Download action
    const downloadBtn = document.getElementById('btn-download-history');
    if (downloadBtn && selectedId) {
      downloadBtn.addEventListener('click', () => {
        const item = (AppState.history || []).find(i => (i.id || i.date) === selectedId);
        if (item && item.text) {
          const fname = (item.name || 'transcript').replace(/\.[^/.]+$/, '') + '.txt';
          Utils.downloadText(item.text, fname);
        }
      });
    }

    // Delete single entry
    const deleteBtn = document.getElementById('btn-delete-history');
    if (deleteBtn && selectedId) {
      deleteBtn.addEventListener('click', () => {
        const item = (AppState.history || []).find(i => (i.id || i.date) === selectedId);
        if (item) {
          if (confirm(`Delete "${item.name}" from history?`)) {
            AppState.deleteHistory(selectedId);
            selectedId = null;
            render();
            Utils.showToast('Entry deleted');
          }
        }
      });
    }

    // Clear all history
    const clearAllBtn = document.getElementById('btn-clear-all-history');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your entire history? This cannot be undone.')) {
          AppState.history = [];
          AppState.save();
          AppState._notify();
          render();
          Utils.showToast('History cleared');
        }
      });
    }
  }

  render();
}

Router.register('dashboard/history', renderHistoryPage);
