/* ===== CincoScribe Global State ===== */

const AppState = {
  user: {
    name: '',
    email: '',
    avatar: '',
    plan: 'Free Plan',
    remainingMinutes: 10,
    resetDays: 27,
    country: 'NL',
    companyName: '',
    companyAddress: '',
    taxId: ''
  },
  isLoggedIn: false,
  credits: 9999,
  maxCredits: 10000,
  openAiKey: '',
  theme: 'light',
  history: [],
  currentTranscript: null,

  /* ── Persistence ────────────────────── */
  _key: 'cincoscribe_state',

  load() {
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.credits != null) this.credits = saved.credits;
        if (saved.openAiKey != null) this.openAiKey = saved.openAiKey;
        if (saved.theme)          this.theme = saved.theme;
        if (saved.history)        this.history = saved.history;
        if (saved.user)           Object.assign(this.user, saved.user);
        if (saved.isLoggedIn != null) this.isLoggedIn = saved.isLoggedIn;
        // Migrate from old credit system (max 500 → 10000)
        if (!saved.maxCredits || saved.maxCredits <= 500) {
          this.credits = 9999;
          this.save();
        }
      }
    } catch { /* ignore corrupt data */ }
  },

  save() {
    try {
      localStorage.setItem(this._key, JSON.stringify({
        credits: this.credits,
        maxCredits: this.maxCredits,
        openAiKey: this.openAiKey,
        theme: this.theme,
        history: this.history,
        user: this.user,
        isLoggedIn: this.isLoggedIn,
      }));
    } catch { /* quota exceeded etc */ }
  },

  /* ── Credits ────────────────────────── */
  deductCredits(amount) {
    this.credits = Math.max(0, this.credits - amount);
    this.save();
    this._notify();
  },

  getCreditsPercent() {
    return Math.round((this.credits / this.maxCredits) * 100);
  },

  /* ── History ────────────────────────── */
  addHistory(entry) {
    this.history.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      ...entry,
    });
    // keep last 50
    if (this.history.length > 50) this.history.length = 50;
    this.save();
  },

  deleteHistory(id) {
    this.history = this.history.filter(item => (item.id || item.date) !== id);
    this.save();
    this._notify();
  },

  /* ── Observer pattern ───────────────── */
  _listeners: [],

  subscribe(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  },

  _notify() {
    this._listeners.forEach(fn => fn(this));
  },
};

// Load on init
AppState.load();

// Apply initial theme
document.documentElement.setAttribute('data-theme', AppState.theme);

window.AppState = AppState;
