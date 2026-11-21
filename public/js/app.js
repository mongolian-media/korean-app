// MONGOLIAN MEDIA — Main Application Controller
// Glassmorphism UI, Responsive Mobile Navigation, 30-Day Curriculum, 
// Hangul Alphabet Prep, Speech Recognition, Spaced Repetition, and Admin Panel.

window.App = {
  currentView: 'home',
  currentDayId: 1,
  currentSentenceIdx: 0,
  currentStep: 0,
  splitMode: 'all', // 'first', 'second', 'all'
  userProfile: null,
  curriculum: null,
  alphabet: null,
  currentLevelTab: 1, // 1: Days 1-30, 2: Days 31-60, 3: Days 61-90
  vocabTab: 'all', // 'all', 'sentences', 'bookmarked'
  vocabSearchQuery: '',
  vocabDayFilter: 'all',
  _cachedVocabList: null,
  _cachedSentencesList: null,

  invalidateVocabCache() {
    this._cachedVocabList = null;
    this._cachedSentencesList = null;
  },

  _isEntitlementVerified: false,

  async verifyEntitlementOffline(ent, profile) {
    if (!ent || !profile) return false;
    if (String(ent.user_id) !== String(profile.id)) return false;
    if (ent.status !== 'active' && profile.role !== 'admin') return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (ent.expires_at <= nowSec) {
      console.warn('[Entitlement Expired]');
      return false;
    }
    if (!ent.signature || ent.signature.length !== 64) return false;

    try {
      const salt = 'mm_sec_entitlement_v64_salt_prod_90d';
      const payload = `${ent.user_id}:${ent.email}:${ent.role}:${ent.status}:${ent.expires_at}:${salt}`;
      const enc = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(payload));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const expectedSig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return expectedSig === ent.signature;
    } catch (e) {
      console.warn('[Entitlement Crypto Check]', e);
      return false;
    }
  },

  hasActiveAccess() {
    if (!this.userProfile) {
      try {
        const cached = localStorage.getItem('mm_user_profile');
        if (cached) this.userProfile = JSON.parse(cached);
      } catch (e) {}
    }
    if (!this.userProfile) return false;
    if (this.userProfile.role === 'admin' && this.userProfile.status === 'active') return true;
    if (this._isEntitlementVerified === true) {
      try {
        const entStr = localStorage.getItem('mm_entitlement');
        if (!entStr) return false;
        const ent = JSON.parse(entStr);
        if (ent.expires_at <= Math.floor(Date.now() / 1000)) return false;
        if (ent.status !== 'active') return false;
        if (String(ent.user_id) !== String(this.userProfile.id)) return false;
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  },

  _introDismissed: false,
  _introSafetyTimer: null,
  _lastToggleTime: 0,

  initIntro() {
    const overlay = document.getElementById('intro-overlay');
    const video = document.getElementById('intro-video');
    if (!overlay || !video) return;

    // 1. Session check: Only play once per fresh session (closed & reopened)
    if (sessionStorage.getItem('mm_intro_shown') === '1') {
      overlay.style.display = 'none';
      return;
    }

    // Mark as shown for this session
    sessionStorage.setItem('mm_intro_shown', '1');

    // 2. Setup video event listeners
    video.onended = () => {
      this.dismissIntro();
    };

    video.onerror = () => {
      console.warn('[Intro Video] Playback/load error, graceful fallback to main screen');
      this.dismissIntro(true);
    };

    // When video starts playing, wait until playback finishes completely
    video.onplaying = () => {
      if (this._introSafetyTimer) clearTimeout(this._introSafetyTimer);
      const remaining = (video.duration && !isNaN(video.duration) && video.duration > 0)
        ? (video.duration - video.currentTime + 1.5) * 1000
        : 9500;
      this._introSafetyTimer = setTimeout(() => {
        this.dismissIntro();
      }, Math.max(3000, remaining));
    };

    // 3. Safety fallback timer (10s max if video completely fails or stalls before playing)
    this._introSafetyTimer = setTimeout(() => {
      this.dismissIntro(true);
    }, 10000);

    // 4. Autoplay with audio muted & playsinline
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[Intro Video] Autoplay prevented:', err);
        // If autoplay is blocked by browser policy and user doesn't interact within 5s, proceed
        setTimeout(() => {
          if (video && video.paused && !this._introDismissed) {
            this.dismissIntro(true);
          }
        }, 5000);
      });
    }
  },

  toggleIntroAudio(e) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    const now = Date.now();
    if (now - this._lastToggleTime < 350) return;
    this._lastToggleTime = now;

    const video = document.getElementById('intro-video');
    const btn = document.getElementById('intro-audio-btn');
    if (!video) return;

    video.muted = !video.muted;
    if (video.paused) {
      video.play().catch(() => {});
    }
    if (btn) {
      if (video.muted) {
        btn.innerHTML = '🔈 <span>Дуу асаах</span>';
        btn.title = 'Дуу асаах';
      } else {
        btn.innerHTML = '🔊 <span>Дуу хаах</span>';
        btn.title = 'Дуу хаах';
      }
    }
  },

  dismissIntro(immediate = false) {
    if (this._introDismissed) return;
    this._introDismissed = true;

    if (this._introSafetyTimer) {
      clearTimeout(this._introSafetyTimer);
      this._introSafetyTimer = null;
    }

    const overlay = document.getElementById('intro-overlay');
    const video = document.getElementById('intro-video');

    if (video) {
      try {
        video.pause();
      } catch (e) {}
    }

    if (!overlay) return;

    if (immediate) {
      overlay.style.display = 'none';
      return;
    }

    // Smooth ~500ms crossfade into the pre-rendered main application screen
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 520);
  },

  async init() {
    try {
      // 0. Initialize Intro Video Overlay
      this.initIntro();

      // 1. Load Local State
      const state = window.StorageManager.get();
      this.currentDayId = state.activeDay || 1;
      this.currentStep = state.activeStep || 0;
      this.currentSentenceIdx = state.activeSentenceIndex || 0;
      this.splitMode = state.sentenceSplitMode || 'all';

      // Apply Theme
      if (state.settings && state.settings.theme === 'dark') {
        document.body.classList.add('dark-mode');
      }

      // 2. Load Static Alphabet & Curriculum Data
      this.alphabet = window.ALPHABET_DATA || null;
      this.curriculum = window.CURRICULUM_DATA || null;
      this.invalidateVocabCache();

      // 3. Authenticate with Server (non-blocking)
      try {
        await this.checkAuth();
      } catch (authErr) {
        console.warn('[Auth Check Error]', authErr);
      }

      // 4. Bind Events & Route View
      this.bindEvents();
      
      // Check initial hash route
      const hash = window.location.hash.replace('#', '') || 'home';
      this.navigate(hash, false);
    } catch (fatalErr) {
      console.error('[Fatal App Init Error]', fatalErr);
      try {
        const container = document.getElementById('main-content');
        if (container) this.renderHome(container);
      } catch (e) {}
    }
  },

  async checkAuth() {
    // 1. Restore cached offline profile & entitlement first
    try {
      const cached = localStorage.getItem('mm_user_profile');
      const cachedEnt = localStorage.getItem('mm_entitlement');
      if (cached && cachedEnt) {
        this.userProfile = JSON.parse(cached);
        const ent = JSON.parse(cachedEnt);
        this._isEntitlementVerified = await this.verifyEntitlementOffline(ent, this.userProfile);
      } else {
        this._isEntitlementVerified = false;
      }
    } catch (e) {
      this._isEntitlementVerified = false;
    }

    // 2. Synchronize with server if online
    if (window.API.getToken()) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      const res = await window.API.getMe();
      if (res.ok && res.data.user) {
        this.userProfile = res.data.user;
        try {
          localStorage.setItem('mm_user_profile', JSON.stringify(this.userProfile));
          if (res.data.entitlement) {
            localStorage.setItem('mm_entitlement', JSON.stringify(res.data.entitlement));
            this._isEntitlementVerified = await this.verifyEntitlementOffline(res.data.entitlement, this.userProfile);
          }
        } catch (e) {}
        // Try to fetch protected curriculum from server
        const currRes = await window.API.fetchCurriculum();
        if (currRes.ok && currRes.data.curriculum) {
          this.curriculum = currRes.data.curriculum;
          this.invalidateVocabCache();
        }
        // Sync server progress
        await window.StorageManager.loadFromServer();
      } else if (res.status === 401 || res.status === 403) {
        // Token explicitly revoked by server
        window.API.logout();
        this.userProfile = null;
        this._isEntitlementVerified = false;
        try {
          localStorage.removeItem('mm_user_profile');
          localStorage.removeItem('mm_entitlement');
        } catch (e) {}
      } else {
        // Offline / Network unreachable: Keep offline session intact!
        console.log('[Offline] Network unreachable. Offline study mode active.');
      }
    }
  },

  bindEvents() {
    // Bottom nav navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.navigate(view);
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Popstate handling (back/forward)
    window.addEventListener('popstate', (e) => {
      const view = (e.state && e.state.view) || 'home';
      this.navigate(view, false);
    });
  },

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    const state = window.StorageManager.get();
    state.settings.theme = isDark ? 'dark' : 'light';
    window.StorageManager.save(state);
    
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  },

  openFacebook(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const webUrl = 'https://www.facebook.com/MediaGorrr';
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    if (isIos) {
      // iOS Facebook App deep link
      const appUrl = 'fb://facewebmodal/f?href=' + encodeURIComponent(webUrl);
      const start = Date.now();
      window.location.href = appUrl;
      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.open(webUrl, '_blank', 'noopener,noreferrer');
        }
      }, 500);
    } else if (isAndroid) {
      // Android Facebook App deep link
      const appUrl = 'fb://facewebmodal/f?href=' + encodeURIComponent(webUrl);
      const start = Date.now();
      window.location.href = appUrl;
      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.open(webUrl, '_blank', 'noopener,noreferrer');
        }
      }, 500);
    } else {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  },

  navigate(viewName, pushState = true) {
    this.currentView = viewName;
    if (pushState) {
      window.history.pushState({ view: viewName }, '', `#${viewName}`);
    }

    // Update bottom nav active state
    document.querySelectorAll('.nav-item').forEach(btn => {
      const v = btn.dataset.view;
      const isActive = (v === viewName) || (v === 'lessons-list' && viewName.startsWith('day-'));
      btn.classList.toggle('active', isActive);
    });

    const container = document.getElementById('main-content');
    if (!container) return;

    if (window.SpeechEngine && window.SpeechEngine.stop) {
      window.SpeechEngine.stop();
    }

    if (viewName === 'home') {
      this.renderHome(container);
    } else if (viewName === 'alphabet') {
      this.renderAlphabet(container);
    } else if (viewName === 'numbers') {
      this.renderNumbersLesson(container);
    } else if (viewName === 'lessons-list') {
      this.renderDaysList(container);
    } else if (viewName.startsWith('day-')) {
      const dId = parseInt(viewName.replace('day-', '')) || 1;
      this.currentDayId = dId;
      this.renderDayLesson(container, dId);
    } else if (viewName === 'review') {
      this.renderReview(container);
    } else if (viewName === 'vocab') {
      this.renderVocab(container);
    } else if (viewName === 'profile') {
      this.renderProfile(container);
    } else if (viewName === 'admin') {
      this.renderAdmin(container);
    } else {
      this.renderHome(container);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // =============================================================
  // 1. HOME VIEW
  // =============================================================
  renderHome(container) {
    const state = window.StorageManager.get();
    window.StorageManager.updateStreak(state);
    window.StorageManager.save(state);

    const completedCount = state.completedDays.length;
    const streakCount = (state.streak && state.streak.count) || 1;
    const vocabCount = (state.bookmarkedVocab && state.bookmarkedVocab.length) || 0;
    const totalDaysCount = (this.curriculum && this.curriculum.length) || (window.CURRICULUM_DATA && window.CURRICULUM_DATA.length) || 90;
    const progressPercent = Math.round((completedCount / totalDaysCount) * 100);

    const activeDayId = state.activeDay || 1;
    const dayData = this.curriculum ? this.curriculum.find(d => d.id === activeDayId) : null;
    const dayTitle = dayData ? dayData.title : `${activeDayId}-р өдөр`;

    const isNewUser = state.alphabetStatus === 'not_started' && completedCount === 0;

    container.innerHTML = `
      <div class="fade-in">
        <!-- Mascot Greeting Banner -->
        <div class="mascot-banner">
          <img src="assets/mascot.png" alt="Монгол хүү" class="mascot-img">
          <div class="mascot-bubble">
            <h3>Сайн байна уу, суралцагч аа!</h3>
            <p>Өнөөдөр солонгос хэлний бодит 10 өгүүлбэрээ цээжилж, зөв дуудлагаар ярьж сурахад бэлэн үү? Хүү нь танд тусалъя!</p>
          </div>
        </div>

        <!-- Hero Resume Card -->
        <div class="hero-card">
          <span class="hero-tag">🎯 ӨНӨӨДРИЙН ЗОРИЛГО</span>
          <h2>${dayTitle}</h2>
          <p>${dayData ? dayData.subtitle : 'Өдөр тутмын бодит харилцан ярианы дасгалууд'}</p>
          <button class="btn-resume" onclick="App.openDay(${activeDayId})">
            <span>Үргэлжлүүлэн суралцах</span>
            <span>➔</span>
          </button>
        </div>

        <!-- 4 Core Stat Chips -->
        <div class="stats-grid">
          <div class="stat-chip">
            <div class="chip-icon">📅</div>
            <div class="chip-val">${completedCount} / ${totalDaysCount}</div>
            <div class="chip-label">Өдөр</div>
          </div>
          <div class="stat-chip">
            <div class="chip-icon">🔥</div>
            <div class="chip-val">${streakCount}</div>
            <div class="chip-label">Streak</div>
          </div>
          <div class="stat-chip">
            <div class="chip-icon">⭐</div>
            <div class="chip-val">${vocabCount}</div>
            <div class="chip-label">Үгсийн сан</div>
          </div>
          <div class="stat-chip">
            <div class="chip-icon">📊</div>
            <div class="chip-val">${progressPercent}%</div>
            <div class="chip-label">Гүйцэтгэл</div>
          </div>
        </div>

        <!-- 1. Сонсох өгүүлбэрийн хичээл (Өгүүлбэр) -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('lessons-list')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="icon-3d icon-3d-card icon-3d-sentence">📚</div>
            <div>
              <strong style="display: block; font-size: 15px;">Сонсох өгүүлбэрийн хичээл</strong>
              <span style="font-size: 12px; color: var(--text-muted);">🌟 1-р шат (1–30) • 🚀 2-р шат (31–60) • 👑 3-р шат (61–90)</span>
            </div>
          </div>
          <span style="font-size: 18px; color: var(--brand-blue);">➔</span>
        </div>

        <!-- 2. Хангыл үсгийн хичээл (Үсэг) -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('alphabet')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="icon-3d icon-3d-card icon-3d-alphabet">abc</div>
            <div>
              <strong style="display: block; font-size: 15px;">Хангыл үсгийн хичээл</strong>
              <span style="font-size: 12px; color: var(--text-muted);">
                Төлөв: ${state.alphabetStatus === 'completed' ? '✅ Дууссан' : (state.alphabetStatus === 'skipped' ? '⏭️ Алгассан' : '⏳ Үзэж байгаа')}
              </span>
            </div>
          </div>
          <span style="font-size: 18px; color: var(--brand-blue);">➔</span>
        </div>

        <!-- 3. Тооны хичээл (Тоо) -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('numbers')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="icon-3d icon-3d-card icon-3d-numbers">123</div>
            <div>
              <strong style="display: block; font-size: 15px;">Тооны хичээл</strong>
              <span style="font-size: 12px; color: var(--text-muted);">Хятад ба уугуул солонгос тоо, үнэ ба эд зүйл тоолох</span>
            </div>
          </div>
          <span style="font-size: 18px; color: var(--brand-blue);">➔</span>
        </div>

        <!-- 4. Үгс ба өгүүлбэр (Үгс) -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('vocab')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="icon-3d icon-3d-card icon-3d-vocab">⭐</div>
            <div>
              <strong style="display: block; font-size: 15px;">Үгс ба өгүүлбэр</strong>
              <span style="font-size: 12px; color: var(--text-muted);">1,443 сэдэвчилсэн үгс, хайлт, цэвэр дуудлага сонсох</span>
            </div>
          </div>
          <span style="font-size: 18px; color: var(--brand-blue);">➔</span>
        </div>
      </div>
    `;
  },

  startAlphabet() {
    const state = window.StorageManager.get();
    state.alphabetStatus = 'in_progress';
    window.StorageManager.save(state);
    this.navigate('alphabet');
  },

  skipAlphabetAndStart() {
    const state = window.StorageManager.get();
    state.alphabetStatus = 'skipped';
    state.activeDay = 1;
    window.StorageManager.save(state);
    this.openDay(1);
  },

  // =============================================================
  // 1.5 NUMBERS LESSON VIEW (ТООНЫ ХИЧЭЭЛ) - EXTENDED 3-TAB SYSTEM
  // =============================================================
  numbersTab: 'numbers', // 'numbers', 'usage', 'quiz'
  _numbersShow1to10: false,
  _numbersShowBig: false,
  _numbersCurrentQuiz: null,
  _numbersQuizAnswers: {},

  setNumbersTab(tab) {
    if (tab !== 'numbers' && !this.hasActiveAccess()) {
      this.openLoginModal('🔒 Түгжээтэй хичээл', `
        <div style="text-align: center; margin-bottom: 14px;">
          <span style="font-size: 38px;">🔒</span>
          <h4 style="margin: 6px 0; color: var(--text-main); font-size: 16px;">Тооны хичээлийн нэмэлт хэсэг түгжээтэй байна</h4>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">
            1–10 хүртэлх суурь тооны хичээл үнэгүй нээлттэй. Өдөр тутмын бодит хэрэглээ (үнэ, эд зүйл, цаг) болон шалгах сорилд нэвтрэхийн тулд 1 удаагийн нэвтрэх кодоо оруулна уу.
          </p>
        </div>
      `);
      return;
    }
    this.numbersTab = tab;
    if (tab === 'quiz' && !this._numbersCurrentQuiz) {
      this._numbersCurrentQuiz = this.pick8NumbersQuizQuestions();
    }
    const container = document.getElementById('main-content');
    if (container) this.renderNumbersLesson(container);
  },

  toggleNumbers1to10() {
    this._numbersShow1to10 = !this._numbersShow1to10;
    const container = document.getElementById('main-content');
    if (container) this.renderNumbersLesson(container);
  },

  toggleNumbersBig() {
    this._numbersShowBig = !this._numbersShowBig;
    const container = document.getElementById('main-content');
    if (container) this.renderNumbersLesson(container);
  },

  resetNumbersQuiz() {
    this._numbersQuizAnswers = {};
    this._numbersCurrentQuiz = this.pick8NumbersQuizQuestions();
    const container = document.getElementById('main-content');
    if (container) {
      this.renderNumbersLesson(container);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  revealListeningText(qId) {
    const el = document.getElementById(`listening-hint-${qId}`);
    if (el) el.style.display = 'block';
  },

  NUMBERS_QUIZ_POOL: [
    // --- 1. Аравт ба нийлмэл тоо (6 questions) ---
    {
      id: 1,
      category: 'tens',
      catName: 'Аравт тоо',
      question: 'Уугуул солонгос тоогоор «50»-ийг юу гэх вэ?',
      options: ['쉰', '서른', '마흔'],
      correctIdx: 0,
      audio: '쉰',
      explanation: 'Уугуул солонгос тоогоор 50 нь «쉰» юм. (서른=30, 마흔=40)'
    },
    {
      id: 2,
      category: 'tens',
      catName: 'Аравт тоо',
      question: 'Уугуул солонгос тоогоор «20»-ийг юу гэх вэ?',
      options: ['스물', '서른', '열'],
      correctIdx: 0,
      audio: '스물',
      explanation: 'Уугуул солонгос тоогоор 20 нь «스물» юм. (열=10, 서른=30)'
    },
    {
      id: 3,
      category: 'tens',
      catName: 'Аравт тоо',
      question: 'Хятад гаралтай тоогоор «70»-ийг юу гэх вэ?',
      options: ['칠십', '육십', '팔십'],
      correctIdx: 0,
      audio: '칠십',
      explanation: 'Хятад гаралтай тоогоор 7 (칠) + 10 (십) = «칠십» болно.'
    },
    {
      id: 4,
      category: 'tens',
      catName: 'Нийлмэл тоо',
      question: 'Уугуул солонгосоор «21»-ийг хэрхэн нийлүүлж хэлэх вэ?',
      options: ['스물하나', '이십일', '스무하나'],
      correctIdx: 0,
      audio: '스물하나',
      explanation: 'Уугуул солонгосоор 20 (스물) + 1 (하나) = «스물하나» гэнэ.'
    },
    {
      id: 5,
      category: 'tens',
      catName: 'Нийлмэл тоо',
      question: 'Хятад гаралтай тоогоор «35»-ыг юу гэх вэ?',
      options: ['삼십오', '서른다섯', '사십오'],
      correctIdx: 0,
      audio: '삼십오',
      explanation: 'Хятад гаралтай тоогоор 30 (삼십) + 5 (오) = «삼십오» юм.'
    },
    {
      id: 6,
      category: 'tens',
      catName: 'Аравт тоо',
      question: 'Уугуул солонгос тоогоор «40»-ийг юу гэх вэ?',
      options: ['마흔', '서른', '예순'],
      correctIdx: 0,
      audio: '마흔',
      explanation: 'Уугуул солонгос тоогоор 40 нь «마흔» юм. (서른=30, 예순=60)'
    },

    // --- 2. Эд зүйл, хүн тоолох ба хувирал (6 questions) ---
    {
      id: 7,
      category: 'items',
      catName: 'Хүн тоолох',
      question: '«20 хүн»-ийг солонгосоор зөв сонгоно уу:',
      options: ['사람 스무 명', '사람 스물 명', '사람 이십 명'],
      correctIdx: 0,
      audio: '사람 스무 명',
      explanation: 'Тоолох үгийн (명) өмнө 20 буюу 스물 нь «스무» болж хувирдаг тул «사람 스무 명» гэнэ.'
    },
    {
      id: 8,
      category: 'items',
      catName: 'Эд зүйл',
      question: '«21 алим»-ыг солонгосоор зөв сонгоно уу:',
      options: ['사과 스물한 개', '사과 스무한 개', '사과 이십일 개'],
      correctIdx: 0,
      audio: '사과 스물한 개',
      explanation: '21 алим гэхэд сүүлийн 하나 нь «한» болж хувиран «사과 스물한 개» болно.'
    },
    {
      id: 9,
      category: 'items',
      catName: 'Эд зүйл',
      question: '«4 шил ус»-ыг солонгосоор юу гэх вэ?',
      options: ['물 네 병', '물 넷 병', '물 사 병'],
      correctIdx: 0,
      audio: '물 네 병',
      explanation: 'Тоолох нэгжийн (병) өмнө 넷 нь «네» болж хувирдаг тул «물 네 병» гэнэ.'
    },
    {
      id: 10,
      category: 'items',
      catName: 'Эд зүйл',
      question: '«2 аяга кофе»-г солонгосоор юу гэх вэ?',
      options: ['커피 두 잔', '커피 둘 잔', '커피 이 잔'],
      correctIdx: 0,
      audio: '커피 두 잔',
      explanation: 'Тоолох нэгжийн (잔) өмнө 둘 нь «두» болж хувирдаг тул «커피 두 잔» гэнэ.'
    },
    {
      id: 11,
      category: 'items',
      catName: 'Эд зүйл',
      question: '«3 алим»-ыг солонгосоор юу гэх вэ?',
      options: ['사과 세 개', '사과 삼 개', '사과 셋 개'],
      correctIdx: 0,
      audio: '사과 세 개',
      explanation: 'Эд зүйл тоолоход уугуул тоо хэрэглэх бөгөөд 셋 нь «세» болж хувиран «사과 세 개» болно.'
    },
    {
      id: 12,
      category: 'items',
      catName: 'Хүн тоолох',
      question: '«3 хүн»-ийг солонгосоор юу гэх вэ?',
      options: ['사람 세 명', '사람 셋 명', '사람 삼 명'],
      correctIdx: 0,
      audio: '사람 세 명',
      explanation: 'Хүн тоолоход уугуул тоо ашиглах ба 셋 нь «세» болж хувиран «사람 세 명» болно.'
    },

    // --- 3. Мөнгө, үнэ (6 questions) ---
    {
      id: 13,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«50,000 вон»-ыг солонгосоор юу гэж унших вэ?',
      options: ['오만 원', '오십만 원', '쉰 원'],
      correctIdx: 0,
      audio: '오만 원',
      explanation: 'Мөнгөн дүнд Хятад гаралтай тоо хэрэглэнэ: 5 (오) × 10,000 (만) = «오만 원».'
    },
    {
      id: 14,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«3,500 вон»-ыг солонгосоор юу гэж унших вэ?',
      options: ['삼천오백 원', '세천다섯백 원', '삼천오십 원'],
      correctIdx: 0,
      audio: '삼천오백 원',
      explanation: 'Үнэ хэлэхэд Хятад тоо хэрэглэнэ: 3,000 (삼천) + 500 (오백) = «삼천오백 원».'
    },
    {
      id: 15,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«15,000 вон»-ыг солонгосоор юу гэж унших вэ?',
      options: ['만 오천 원', '십오천 원', '열다섯천 원'],
      correctIdx: 0,
      audio: '만 오천 원',
      explanation: 'Солонгос мөнгөнд 10,000-ыг 만 гэдэг тул 10,000 (만) + 5,000 (오천) = «만 오천 원» гэнэ.'
    },
    {
      id: 16,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«125,000 вон»-ыг солонгосоор юу гэж унших вэ?',
      options: ['십이만 오천 원', '백이십오천 원', '십이만 오백 원'],
      correctIdx: 0,
      audio: '십이만 오천 원',
      explanation: '120,000 (십이만) + 5,000 (오천) = «십이만 오천 원» гэж хэлнэ.'
    },
    {
      id: 17,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«3,000 вон»-ыг солонгосоор юу гэх вэ?',
      options: ['삼천 원', '세천 원', '삼백 원'],
      correctIdx: 0,
      audio: '삼천 원',
      explanation: 'Үнэ, мөнгө хэлэхэд Хятад гаралтай тоо ашигладаг тул «삼천 원» гэнэ.'
    },
    {
      id: 18,
      category: 'money',
      catName: 'Мөнгө, үнэ',
      question: '«1,000,000 вон» (1 сая вон)-ыг солонгосоор юу гэх вэ?',
      options: ['백만 원', '천만 원', '십만 원'],
      correctIdx: 0,
      audio: '백만 원',
      explanation: '1,000,000 нь 100 (백) ширхэг 10,000 (만) тул «백만 원» юм.'
    },

    // --- 4. Цаг ба Сонсоод сонгох (6 questions) ---
    {
      id: 19,
      category: 'time',
      catName: 'Цаг / Сонсох',
      isListening: true,
      audio: '두 시 삼십 분',
      question: 'Сонсоод зөв цагийг сонгоно уу:',
      options: ['2:30', '3:20', '2:13'],
      correctIdx: 0,
      explanation: '두 시 (2 цаг - уугуул тоо) + 삼십 분 (30 минут - хятад тоо) = 2:30.'
    },
    {
      id: 20,
      category: 'time',
      catName: 'Цаг / Сонсох',
      isListening: true,
      audio: '일곱 시 십오 분',
      question: 'Сонсоод зөв цагийг сонгоно уу:',
      options: ['7:15', '6:15', '7:50'],
      correctIdx: 0,
      explanation: '일곱 시 (7 цаг - уугуул тоо) + 십오 분 (15 минут - хятад тоо) = 7:15.'
    },
    {
      id: 21,
      category: 'time',
      catName: 'Цаг хэлэх',
      question: '«4:00» (4 цаг)-ийг солонгосоор юу гэх вэ?',
      options: ['네 시', '넷 시', '사 시'],
      correctIdx: 0,
      audio: '네 시',
      explanation: 'Цаг хэлэхэд уугуул тоо хэрэглэх ба 넷 нь 시-ийн өмнө «네» болж «네 시» гэнэ.'
    },
    {
      id: 22,
      category: 'time',
      catName: 'Цаг хэлэх',
      question: '«10:20» (10 цаг 20 минут)-ийг солонгосоор юу гэх вэ?',
      options: ['열 시 이십 분', '십 시 이십 분', '열 시 스물 분'],
      correctIdx: 0,
      audio: '열 시 이십 분',
      explanation: 'Цагт уугуул тоо (열 시), минутад хятад тоо (이십 분) хэрэглэнэ.'
    },
    {
      id: 23,
      category: 'time',
      catName: 'Цаг / Сонсох',
      isListening: true,
      audio: '한 시 사십오 분',
      question: 'Сонсоод зөв цагийг сонгоно уу:',
      options: ['1:45', '1:15', '2:45'],
      correctIdx: 0,
      explanation: '한 시 (1 цаг) + 사십오 분 (45 минут) = 1:45.'
    },
    {
      id: 24,
      category: 'time',
      catName: 'Цаг / Сонсох',
      isListening: true,
      audio: '다섯 시 삼십 분',
      question: 'Сонсоод зөв цагийг сонгоно уу:',
      options: ['5:30', '4:30', '5:03'],
      correctIdx: 0,
      explanation: '다섯 시 (5 цаг) + 삼십 분 (30 минут) = 5:30.'
    }
  ],

  pick8NumbersQuizQuestions() {
    const pool = this.NUMBERS_QUIZ_POOL;
    const catMap = { tens: [], items: [], money: [], time: [] };
    pool.forEach(q => {
      if (catMap[q.category]) catMap[q.category].push(q);
    });

    const shuffle = arr => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const selected = [
      ...shuffle(catMap.tens).slice(0, 2),
      ...shuffle(catMap.items).slice(0, 2),
      ...shuffle(catMap.money).slice(0, 2),
      ...shuffle(catMap.time).slice(0, 2)
    ];

    const shuffledQuestions = shuffle(selected);
    const targetIndices = shuffle([0, 1, 2, 0, 1, 2, Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]);

    return shuffledQuestions.map((q, idx) => {
      const correctOption = q.options[q.correctIdx];
      const wrongOptions = shuffle(q.options.filter((_, optI) => optI !== q.correctIdx));
      const targetIdx = targetIndices[idx % targetIndices.length];

      const newOptions = [null, null, null];
      newOptions[targetIdx] = correctOption;
      let wIdx = 0;
      for (let pos = 0; pos < 3; pos++) {
        if (newOptions[pos] === null) {
          newOptions[pos] = wrongOptions[wIdx++];
        }
      }

      return {
        ...q,
        options: newOptions,
        correctIdx: targetIdx
      };
    });
  },

  renderNumbersLesson(container) {
    if (!this._numbersCurrentQuiz) {
      this._numbersCurrentQuiz = this.pick8NumbersQuizQuestions();
    }
    const hasAccess = this.hasActiveAccess();

    container.innerHTML = `
      <div class="fade-in">
        <!-- Back Navigation & Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <button class="btn-glass" onclick="App.navigate('home')" style="display: inline-flex; align-items: center; gap: 6px;">
            <span>←</span>
            <span>Нүүр рүү буцах</span>
          </button>
          <span class="hero-tag" style="margin: 0;">🔢 ТООНЫ ХИЧЭЭЛ</span>
        </div>

        <!-- 3-Tab Segmented Control -->
        <div class="segmented-pills" style="margin-bottom: 16px;">
          <button class="pill-btn ${this.numbersTab === 'numbers' ? 'active' : ''}" style="flex: 1;" onclick="App.setNumbersTab('numbers')">
            🔢 1–10 Тоо
          </button>
          <button class="pill-btn ${this.numbersTab === 'usage' ? 'active' : ''}" style="flex: 1;" onclick="App.setNumbersTab('usage')">
            ${hasAccess ? '' : '🔒 '}💡 Хэрэглээ
          </button>
          <button class="pill-btn ${this.numbersTab === 'quiz' ? 'active' : ''}" style="flex: 1;" onclick="App.setNumbersTab('quiz')">
            ${hasAccess ? '' : '🔒 '}📝 Сорил
          </button>
        </div>

        ${this.renderNumbersTabContent()}
      </div>
    `;
  },

  renderNumbersTabContent() {
    if (this.numbersTab === 'numbers') {
      return this.renderNumbersTabNumbers();
    } else if (this.numbersTab === 'usage') {
      return this.renderNumbersTabUsage();
    } else {
      return this.renderNumbersTabQuiz();
    }
  },

  // --- TAB 1: ТОЙМ БА ТООНУУД ---
  renderNumbersTabNumbers() {
    const hasAccess = this.hasActiveAccess();
    const base1to10 = [
      { num: 1, sino: '일', native: '하나' },
      { num: 2, sino: '이', native: '둘' },
      { num: 3, sino: '삼', native: '셋' },
      { num: 4, sino: '사', native: '넷' },
      { num: 5, sino: '오', native: '다섯' },
      { num: 6, sino: '육', native: '여섯' },
      { num: 7, sino: '칠', native: '일곱' },
      { num: 8, sino: '팔', native: '여덟' },
      { num: 9, sino: '구', native: '아홉' },
      { num: 10, sino: '십', native: '열' }
    ];

    const tens = [
      { num: 10, sino: '십', native: '열' },
      { num: 20, sino: '이십', native: '스물' },
      { num: 30, sino: '삼십', native: '서른' },
      { num: 40, sino: '사십', native: '마흔' },
      { num: 50, sino: '오십', native: '쉰' },
      { num: 60, sino: '육십', native: '예순' },
      { num: 70, sino: '칠십', native: '일흔' },
      { num: 80, sino: '팔십', native: '여든' },
      { num: 90, sino: '구십', native: '아흔' }
    ];

    const bigNumbers = [
      { num: '100', kor: '백', desc: '100 (зуу)' },
      { num: '1,000', kor: '천', desc: '1,000 (мянга)' },
      { num: '10,000', kor: '만', desc: '10,000 (арван мянга - суурь нэгж)' },
      { num: '100,000', kor: '십만', desc: '100,000 (зуун мянга = 10 ширхэг 만)' },
      { num: '1,000,000', kor: '백만', desc: '1,000,000 (нэг сая = 100 ширхэг 만)' }
    ];

    return `
      <!-- Intro Card -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <h2 style="font-size: 18px; font-weight: 800; margin-bottom: 6px; color: var(--text-primary);">Хоёр төрлийн тоог зэрэгцүүлэх</h2>
        <p style="font-size: 13.5px; line-height: 1.5; color: var(--text-muted); margin: 0;">
          Солонгос хэлний <strong>Хятад гаралтай</strong> (үнэ, огноо, утас) болон <strong>Уугуул солонгос</strong> (эд зүйл, хүн тоолох) тоонуудыг дарааллын дагуу зэрэгцүүлэн суралцаарай.
        </p>
      </div>

      <!-- 1. 1–10 Хүртэлх суурь тоо (ЭХЭНДЭЭ) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: var(--text-primary); margin: 0;">🔢 1. 1–10 хүртэлх тоо</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(37,99,235,0.12); color: var(--brand-blue); border-radius: 9999px; font-weight: 600;">Суурь тоо</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${base1to10.map(b => `
            <div class="number-row-card">
              <div style="font-size: 15px; font-weight: 800; min-width: 32px; color: var(--text-primary);">${b.num}</div>
              <div style="display: flex; align-items: center; gap: 5px; flex: 1; justify-content: center;">
                <span style="font-size: 11.5px; color: var(--brand-blue); font-weight: 600;">Хятад:</span>
                <strong style="font-size: 14.5px;">${b.sino}</strong>
                <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${b.sino}')" title="Сонсох">🔊</button>
              </div>
              <div style="display: flex; align-items: center; gap: 5px; flex: 1; justify-content: flex-end;">
                <span style="font-size: 11.5px; color: #10b981; font-weight: 600;">Уугуул:</span>
                <strong style="font-size: 14.5px;">${b.native}</strong>
                <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${b.native}')" title="Сонсох">🔊</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${!hasAccess ? `
        <!-- Locked Card for Tens and Big Numbers -->
        <div class="glass-card" style="margin-bottom: 14px; text-align: center; padding: 26px 18px; border: 1px dashed rgba(245,158,11,0.5);">
          <div style="font-size: 38px; margin-bottom: 8px;">🔒</div>
          <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
            🔟 2. Аравтууд (10–90) ба 💰 3. Том тоонууд
          </h3>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; max-width: 380px; margin-left: auto; margin-right: auto;">
            10–90 аравтууд, 100-аас 1 сая хүртэлх том тоонууд болон өдөр тутмын бодит хэрэглээ, сорилд нэвтрэхийн тулд 1 удаагийн нэвтрэх кодоо оруулна уу. (1–10 суурь тоо үнэгүй нээлттэй).
          </p>
          <button class="btn-primary" style="max-width: 250px; margin: 0 auto; font-size: 14px; padding: 12px 18px;" onclick="App.openLoginModal()">
            🎟️ 1 удаагийн кодоор нээх
          </button>
        </div>
      ` : `
      <!-- 2. Аравтууд (10–90) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: var(--text-primary); margin: 0;">🔟 2. Аравтууд (10–90)</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(16,185,129,0.12); color: #10b981; border-radius: 9999px; font-weight: 600;">10-аас 90</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${tens.map(t => `
            <div class="number-row-card">
              <div style="font-size: 15px; font-weight: 800; min-width: 32px; color: var(--text-primary);">${t.num}</div>
              <div style="display: flex; align-items: center; gap: 5px; flex: 1; justify-content: center;">
                <span style="font-size: 11.5px; color: var(--brand-blue); font-weight: 600;">Хятад:</span>
                <strong style="font-size: 14.5px;">${t.sino}</strong>
                <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${t.sino}')" title="Сонсох">🔊</button>
              </div>
              <div style="display: flex; align-items: center; gap: 5px; flex: 1; justify-content: flex-end;">
                <span style="font-size: 11.5px; color: #10b981; font-weight: 600;">Уугуул:</span>
                <strong style="font-size: 14.5px;">${t.native}</strong>
                <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${t.native}')" title="Сонсох">🔊</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Нийлмэл тоо жишээ (21, 35, 58) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <h3 style="font-size: 15.5px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">🔗 Тоог нийлүүлж унших жишээ:</h3>
        
        <!-- 21 -->
        <div style="padding: 10px 12px; margin-bottom: 8px; background: var(--glass-bg); border-radius: 12px; border: 1px solid var(--glass-border);">
          <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px; color: var(--text-primary);">• 21</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 13.5px;"><span style="color: var(--brand-blue); font-weight: 600;">Хятад:</span> <strong>이십일</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('이십일')">🔊</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13.5px;"><span style="color: #10b981; font-weight: 600;">Уугуул:</span> <strong>스물하나</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('스물하나')">🔊</button>
          </div>
        </div>

        <!-- 35 -->
        <div style="padding: 10px 12px; margin-bottom: 8px; background: var(--glass-bg); border-radius: 12px; border: 1px solid var(--glass-border);">
          <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px; color: var(--text-primary);">• 35</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 13.5px;"><span style="color: var(--brand-blue); font-weight: 600;">Хятад:</span> <strong>삼십오</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('삼십오')">🔊</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13.5px;"><span style="color: #10b981; font-weight: 600;">Уугуул:</span> <strong>서른다섯</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('서른다섯')">🔊</button>
          </div>
        </div>

        <!-- 58 -->
        <div style="padding: 10px 12px; background: var(--glass-bg); border-radius: 12px; border: 1px solid var(--glass-border);">
          <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px; color: var(--text-primary);">• 58</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 13.5px;"><span style="color: var(--brand-blue); font-weight: 600;">Хятад:</span> <strong>오십팔</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('오십팔')">🔊</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13.5px;"><span style="color: #10b981; font-weight: 600;">Уугуул:</span> <strong>쉰여덟</strong></span>
            <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('쉰여덟')">🔊</button>
          </div>
        </div>
      </div>

      <!-- 3. Том тоо (100–1,000,000) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: var(--text-primary); margin: 0;">💰 3. Том тоо (100–1,000,000)</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(245,158,11,0.12); color: #d97706; border-radius: 9999px; font-weight: 600;">Хятад гаралтай</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${bigNumbers.map(b => `
            <div class="example-phrase-card">
              <div>
                <div style="font-size: 16px; font-weight: 800; color: var(--text-primary);">
                  ${b.kor} <span style="font-size: 13px; color: var(--brand-blue); font-weight: 600; margin-left: 6px;">[${b.num}]</span>
                </div>
                <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 2px;">${b.desc}</div>
              </div>
              <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${b.kor}')" title="Сонсох">🔊</button>
            </div>
          `).join('')}
        </div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 10px; line-height: 1.45;">
          💡 <strong>Санамж:</strong> Солонгос хэлэнд том тоог 10,000 буюу <strong>만</strong>-аар багцалдаг. 100,000 = 10 ширхэг 만 (십만), 1,000,000 = 100 ширхэг 만 (백만) болно.
        </div>
      </div>
      `}
    `;
  },

  // --- TAB 2: ӨДӨР ТУТМЫН ХЭРЭГЛЭЭ ---
  renderNumbersTabUsage() {
    if (!this.hasActiveAccess()) {
      return `
        <div class="glass-card" style="margin-bottom: 14px; text-align: center; padding: 32px 18px; border: 1px dashed rgba(245,158,11,0.5);">
          <div style="font-size: 40px; margin-bottom: 8px;">🔒</div>
          <h3 style="font-size: 17px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
            💡 Өдөр тутмын хэрэглээ түгжээтэй байна
          </h3>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; max-width: 380px; margin-left: auto; margin-right: auto;">
            Мөнгө үнэ, эд зүйл, цаг хугацааг солонгосоор зөв хэлэх өдөр тутмын хэрэглээний хичээлд нэвтрэхийн тулд 1 удаагийн нэвтрэх кодоо оруулна уу. (1–10 суурь тоо үнэгүй нээлттэй).
          </p>
          <button class="btn-primary" style="max-width: 250px; margin: 0 auto; font-size: 14px; padding: 12px 18px;" onclick="App.openLoginModal()">
            🎟️ 1 удаагийн кодоор нээх
          </button>
        </div>
      `;
    }
    return `
      <!-- Intro Usage Card -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <h2 style="font-size: 18px; font-weight: 800; margin-bottom: 6px; color: var(--text-primary);">Өдөр тутмын хэрэглээ</h2>
        <p style="font-size: 13.5px; line-height: 1.5; color: var(--text-muted); margin: 0;">
          Бодит амьдрал дээр мөнгө үнэ, эд зүйлс, цаг хугацааг солонгосоор хэрхэн зөв хэлэх практик жишээнүүд.
        </p>
      </div>

      <!-- 1. Мөнгө, үнэ (Хятад тоо) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: var(--brand-blue); margin: 0;">• Мөнгө, үнэ</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(37,99,235,0.12); color: var(--brand-blue); border-radius: 9999px; font-weight: 600;">Хятад гаралтай тоо</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">
          Үнэ, төлбөр, мөнгөн дүнг хэлэхэд Хятад гаралтай тоо хэрэглэнэ.
        </p>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">3,500원 <span style="color: var(--brand-blue); margin-left: 6px;">[삼천오백 원]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">3,500 вон</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('삼천오백 원')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">15,000원 <span style="color: var(--brand-blue); margin-left: 6px;">[만 오천 원]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">15,000 вон</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('만 오천 원')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">50,000원 <span style="color: var(--brand-blue); margin-left: 6px;">[오만 원]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">50,000 вон</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('오만 원')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">125,000원 <span style="color: var(--brand-blue); margin-left: 6px;">[십이만 오천 원]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">125,000 вон</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('십이만 오천 원')" title="Сонсох">🔊</button>
        </div>
      </div>

      <!-- 2. Эд зүйл, хүн (Уугуул тоо) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: #10b981; margin: 0;">• Эд зүйл, хүн</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(16,185,129,0.12); color: #10b981; border-radius: 9999px; font-weight: 600;">Уугуул солонгос тоо</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">
          Өдөр тутмын эд зүйл, хүнийг тоолоход уугуул солонгос тоо хэрэглэнэ.
        </p>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">사과 세 개</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">3 алим</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('사과 세 개')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">커피 두 잔</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">2 аяга кофе</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('커피 두 잔')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">물 네 병</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">4 шил ус</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('물 네 병')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">사람 스무 명</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">20 хүн (스물 → 스무)</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('사람 스무 명')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">사과 스물한 개</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">21 алим (스물하나 → 스물한)</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('사과 스물한 개')" title="Сонсох">🔊</button>
        </div>

        <!-- Contraction Rule Notice Banner -->
        <div style="background: rgba(16, 185, 129, 0.09); border: 1.5px dashed rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 12px 14px; margin-top: 12px;">
          <div style="font-weight: 700; font-size: 13.5px; color: #047857; margin-bottom: 4px;">⚠️ Тоолох үгийн өмнөх хувирал:</div>
          <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5; margin-bottom: 6px;">
            <strong>하나 → 한</strong>, <strong>둘 → 두</strong>, <strong>셋 → 세</strong>, <strong>넷 → 네</strong>, <strong>스물 → 스무</strong>.
          </div>
          <div style="font-size: 12.5px; color: var(--text-muted); line-height: 1.45;">
            📌 <strong>Ялгаа:</strong> Яг 20 хүн гэвэл <strong>스무 명</strong> гэх ба 21 хүн гэвэл <strong>스물한 명</strong> гэж ялгуулдаг.
          </div>
        </div>
      </div>

      <!-- 3. Цаг (Цагт уугуул, минутад хятад) -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h3 style="font-size: 15.5px; font-weight: 700; color: #d97706; margin: 0;">• Цаг хэлэх</h3>
          <span style="font-size: 11px; padding: 2px 8px; background: rgba(245,158,11,0.12); color: #d97706; border-radius: 9999px; font-weight: 600;">Цагт уугуул, минутад хятад</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">
          Цаг хэлэхдээ <strong>Цаг (시)-т уугуул солонгос тоо</strong>, <strong>Минут (분)-д хятад гаралтай тоо</strong> ашигладаг.
        </p>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">2:30 <span style="color: #d97706; margin-left: 6px;">[두 시 삼십 분]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">2 цаг 30 минут</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('두 시 삼십 분')" title="Сонсох">🔊</button>
        </div>

        <div class="example-phrase-card">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">7:15 <span style="color: #d97706; margin-left: 6px;">[일곱 시 십오 분]</span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">7 цаг 15 минут</div>
          </div>
          <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('일곱 시 십오 분')" title="Сонсох">🔊</button>
        </div>
      </div>
    `;
  },

  // --- TAB 3: БОГИНО СОРИЛ (8 Асуулттай сорил) ---
  renderNumbersTabQuiz() {
    if (!this.hasActiveAccess()) {
      return `
        <div class="glass-card" style="margin-bottom: 14px; text-align: center; padding: 32px 18px; border: 1px dashed rgba(245,158,11,0.5);">
          <div style="font-size: 40px; margin-bottom: 8px;">🔒</div>
          <h3 style="font-size: 17px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
            📝 Тооны сорил түгжээтэй байна
          </h3>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; max-width: 380px; margin-left: auto; margin-right: auto;">
            Тооны мэдлэг шалгах сорилд нэвтрэхийн тулд 1 удаагийн нэвтрэх кодоо оруулна уу. (1–10 суурь тоо үнэгүй нээлттэй).
          </p>
          <button class="btn-primary" style="max-width: 250px; margin: 0 auto; font-size: 14px; padding: 12px 18px;" onclick="App.openLoginModal()">
            🎟️ 1 удаагийн кодоор нээх
          </button>
        </div>
      `;
    }
    const questions = this._numbersCurrentQuiz || [];
    const answeredCount = Object.keys(this._numbersQuizAnswers).length;
    const isCompleted = questions.length > 0 && answeredCount >= questions.length;

    return `
      <!-- Quiz Header Card -->
      <div class="glass-card" style="margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <h2 style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0;">Тооны сорил (8 асуулт)</h2>
          <span id="numbers-quiz-progress-text" style="font-size: 12px; font-weight: 700; color: var(--brand-blue);">
            ${answeredCount} / 8 хариулсан
          </span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.45;">
          Аравтууд, мөнгө, эд зүйл ба цаг сэдвүүдээс бүрдсэн 8 асуултад хариулан мэдлэгээ шалгаарай.
        </p>
      </div>

      <!-- Question List -->
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${questions.map((q, qIdx) => {
          const userChoice = this._numbersQuizAnswers[q.id];
          const hasAnswered = userChoice !== undefined;
          const isCorrect = hasAnswered && userChoice === q.correctIdx;

          return `
            <div class="glass-card" style="padding: 16px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--brand-blue);">Асуулт ${qIdx + 1} / 8</span>
                <span style="font-size: 11px; padding: 2px 8px; background: rgba(37,99,235,0.1); color: var(--brand-blue); border-radius: 9999px; font-weight: 600;">
                  ${q.catName || 'Сорил'}
                </span>
              </div>

              ${q.isListening ? `
                <div class="quiz-listening-box">
                  <div style="font-size: 13.5px; font-weight: 700; color: var(--brand-blue); margin-bottom: 8px;">
                    🎧 Сонсоод зөв хариултыг сонгоно уу:
                  </div>
                  <button class="btn-primary" type="button" style="width: auto; padding: 8px 18px; font-size: 14px; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;" onclick="event.stopPropagation(); window.SpeechEngine.speak('${q.audio}')">
                    <span>🔊</span>
                    <span>Дуудлага сонсох</span>
                  </button>
                  <div style="margin-top: 8px;">
                    <button type="button" style="background: none; border: none; color: var(--text-muted); font-size: 11.5px; text-decoration: underline; cursor: pointer;" onclick="App.revealListeningText(${q.id})">
                      (Дуу сонсогдохгүй бол энд дарж бичвэрээр харах)
                    </button>
                    <div id="listening-hint-${q.id}" style="display: ${hasAnswered ? 'block' : 'none'}; font-size: 13px; font-weight: 600; color: var(--brand-blue); margin-top: 4px;">
                      Текст: ${q.audio}
                    </div>
                  </div>
                </div>
              ` : `
                <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; line-height: 1.4;">
                  ${q.question}
                </div>
              `}

              <!-- 3 Options -->
              <div id="number-quiz-${q.id}" class="quiz-options-list" style="display: flex; flex-direction: column; gap: 8px;">
                ${q.options.map((opt, optIdx) => {
                  let optClass = 'quiz-opt-card';
                  if (hasAnswered) {
                    if (optIdx === q.correctIdx) {
                      optClass += (userChoice === optIdx) ? ' selected-correct' : ' revealed-correct';
                    } else if (userChoice === optIdx) {
                      optClass += ' selected-wrong';
                    } else {
                      optClass += ' dimmed';
                    }
                  }

                  return `
                    <div class="${optClass}" style="${hasAnswered ? 'pointer-events: none;' : ''}" onclick="App.answerNumbersQuizItem(${q.id}, ${optIdx})">
                      <div style="font-weight: 600; font-size: 15px;">${opt}</div>
                      ${!q.isListening ? `
                        <button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${opt}')" title="Сонсох">🔊</button>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Feedback Container -->
              <div id="number-quiz-feedback-${q.id}" style="display: ${hasAnswered ? 'block' : 'none'}; margin-top: 10px; padding: 12px 14px; border-radius: 12px;" class="glass-card ${hasAnswered ? (isCorrect ? 'feedback-correct' : 'feedback-wrong') : ''}">
                ${hasAnswered ? `
                  <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: ${isCorrect ? '#059669' : '#dc2626'};">
                    ${isCorrect ? '✅ Зөв хариуллаа!' : '❌ Буруу байна!'}
                  </div>
                  ${q.isListening ? `
                    <div style="font-size: 13.5px; margin-bottom: 4px; font-weight: 600; color: var(--brand-blue);">
                      Солонгос хэллэг: ${q.audio}
                    </div>
                  ` : ''}
                  <div style="font-size: 13px; color: var(--text-primary); line-height: 1.45;">
                    ${q.explanation}
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Quiz Results Container -->
      <div id="numbers-quiz-results-container" style="display: ${isCompleted ? 'block' : 'none'};">
        ${isCompleted ? this.getNumbersQuizResultsHtml() : ''}
      </div>
    `;
  },

  getNumbersQuizResultsHtml() {
    if (!this._numbersCurrentQuiz) return '';
    let score = 0;
    const missed = [];

    this._numbersCurrentQuiz.forEach(q => {
      const userChoice = this._numbersQuizAnswers[q.id];
      if (userChoice === q.correctIdx) {
        score++;
      } else {
        missed.push({
          question: q.isListening ? `Сонсох асуулт: ${q.audio}` : q.question,
          userAns: q.options[userChoice] !== undefined ? q.options[userChoice] : 'Сонгоогүй',
          correctAns: q.options[q.correctIdx],
          explanation: q.explanation,
          audio: q.audio
        });
      }
    });

    return `
      <div class="glass-card" style="border: 2px solid ${score >= 6 ? '#10b981' : (score >= 4 ? '#f59e0b' : '#ef4444')}; padding: 20px; text-align: center; margin-top: 20px;">
        <div style="font-size: 40px; margin-bottom: 6px;">
          ${score === 8 ? '🎉' : (score >= 6 ? '👏' : '💪')}
        </div>
        <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 6px; color: var(--text-primary);">
          Сорилын үр дүн: ${score} / 8
        </h3>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 16px;">
          ${score === 8 ? 'Онц сайн! Та солонгос тооллын дүрмийг төгс эзэмшсэн байна.' : (score >= 6 ? 'Маш сайн! Та ихэнх асуултад зөв хариуллаа.' : 'Дахин давтаж мэдлэгээ батжуулаарай!')}
        </p>

        ${missed.length > 0 ? `
          <div style="text-align: left; margin: 16px 0; background: var(--glass-bg); padding: 14px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <div style="font-weight: 700; font-size: 14px; color: #ef4444; margin-bottom: 10px;">
              ⚠️ Алдсан асуултууд (${missed.length}):
            </div>
            ${missed.map((m, idx) => `
              <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: ${idx < missed.length - 1 ? '1px dashed var(--glass-border)' : 'none'};">
                <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                  ${idx + 1}. ${m.question}
                </div>
                <div style="font-size: 13px; color: #dc2626; margin-bottom: 2px;">
                  Таны сонголт: <strong>${m.userAns}</strong>
                </div>
                <div style="font-size: 13px; color: #059669; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                  <span>Зөв хариулт: <strong>${m.correctAns}</strong></span>
                  ${m.audio ? `<button class="quiz-audio-btn" type="button" onclick="event.stopPropagation(); window.SpeechEngine.speak('${m.audio}')" title="Сонсох">🔊</button>` : ''}
                </div>
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                  Тайлбар: ${m.explanation}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <button class="btn-primary" style="width: 100%; padding: 12px 20px; font-size: 15px; margin-top: 8px;" onclick="App.resetNumbersQuiz()">
          Дахин хийх 🔄
        </button>
      </div>
    `;
  },

  answerNumbersQuizItem(qId, selectedIdx) {
    if (this._numbersQuizAnswers[qId] !== undefined) return;
    this._numbersQuizAnswers[qId] = selectedIdx;

    const q = this._numbersCurrentQuiz ? this._numbersCurrentQuiz.find(item => item.id === qId) : null;
    if (!q) return;

    const cardContainer = document.getElementById(`number-quiz-${qId}`);
    if (cardContainer) {
      const cards = cardContainer.querySelectorAll('.quiz-opt-card');
      cards.forEach((card, idx) => {
        card.style.pointerEvents = 'none';
        if (idx === q.correctIdx) {
          if (idx === selectedIdx) {
            card.classList.add('selected-correct');
          } else {
            card.classList.add('revealed-correct');
          }
        } else if (idx === selectedIdx) {
          card.classList.add('selected-wrong');
        } else {
          card.classList.add('dimmed');
        }
      });
    }

    const isCorrect = selectedIdx === q.correctIdx;
    const feedback = document.getElementById(`number-quiz-feedback-${qId}`);
    if (feedback) {
      feedback.style.display = 'block';
      feedback.className = `glass-card ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;
      feedback.innerHTML = `
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: ${isCorrect ? '#059669' : '#dc2626'};">
          ${isCorrect ? '✅ Зөв хариуллаа!' : '❌ Буруу байна!'}
        </div>
        ${q.isListening ? `
          <div style="font-size: 13.5px; margin-bottom: 4px; font-weight: 600; color: var(--brand-blue);">
            Солонгос хэллэг: ${q.audio}
          </div>
        ` : ''}
        <div style="font-size: 13px; color: var(--text-primary); line-height: 1.45;">
          ${q.explanation}
        </div>
      `;
    }

    // Play pronunciation
    if (window.SpeechEngine && window.SpeechEngine.speak) {
      const textToSpeak = q.isListening ? q.audio : (q.audio || q.options[q.correctIdx]);
      if (textToSpeak) window.SpeechEngine.speak(textToSpeak);
    }

    // Update progress counter
    const answeredCount = Object.keys(this._numbersQuizAnswers).length;
    const progressEl = document.getElementById('numbers-quiz-progress-text');
    if (progressEl) {
      progressEl.innerText = `${answeredCount} / 8 хариулсан`;
    }

    // If all 8 answered, display result card
    if (this._numbersCurrentQuiz && answeredCount >= this._numbersCurrentQuiz.length) {
      const resultsContainer = document.getElementById('numbers-quiz-results-container');
      if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = this.getNumbersQuizResultsHtml();
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  },

  answerNumberQuiz(qId, selectedIdx) {
    return this.answerNumbersQuizItem(qId, selectedIdx);
  },

  // =============================================================
  // 2. ALPHABET PREPARATION VIEW
  // =============================================================
  speakLetter(char, letterName = '') {
    if (!char) return;
    const vowelMap = {
      'ㅏ': '아', 'ㅑ': '야', 'ㅓ': '어', 'ㅕ': '여', 'ㅗ': '오',
      'ㅛ': '요', 'ㅜ': '우', 'ㅠ': '유', 'ㅡ': '으', 'ㅣ': '이',
      'ㅐ': '애', 'ㅒ': '얘', 'ㅔ': '에', 'ㅖ': '예', 'ㅘ': '와',
      'ㅙ': '왜', 'ㅚ': '외', 'ㅝ': '워', 'ㅞ': '웨', 'ㅟ': '위', 'ㅢ': '의'
    };
    const consonantMap = {
      'ㄱ': '기역', 'ㄴ': '니은', 'ㄷ': 'ди귿', 'ㄹ': '리을', 'ㅁ': '미음',
      'ㅂ': '비읍', 'ㅅ': '시옷', 'ㅇ': '이응', 'ㅈ': '지읒', 'ㅊ': '치읓',
      'ㅋ': '키읔', 'ㅌ': '티읕', 'ㅍ': '피읖', 'ㅎ': '히읗',
      'ㄲ': '쌍기역', 'ㄸ': '쌍ди귿', 'ㅃ': '쌍비읍', 'ㅆ': '쌍시옷', 'ㅉ': '쌍지읒'
    };
    // Fix Korean spelling for ㄷ and ㄸ
    consonantMap['ㄷ'] = '디귿';
    consonantMap['ㄸ'] = '쌍디귿';

    let speakText = vowelMap[char] || consonantMap[char] || char;
    if (letterName && consonantMap[char] === undefined && vowelMap[char] === undefined) {
      const match = letterName.match(/[\uAC00-\uD7A3]+/);
      if (match) speakText = match[0];
    }

    if (window.SpeechEngine && window.SpeechEngine.speak) {
      window.SpeechEngine.speak(speakText);
    }
  },

  renderAlphabet(container) {
    const data = this.alphabet || window.ALPHABET_DATA;
    if (!data) {
      container.innerHTML = `<div class="glass-card"><p>Үсгийн өгөгдөл ачааллаж байна...</p></div>`;
      return;
    }
    const hasAccess = this.hasActiveAccess();

    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <button class="btn-glass" onclick="App.navigate('home')">← Буцах</button>
            <span class="sentence-badge">Бэлтгэл модуль (30 хоногт тооцогдохгүй)</span>
          </div>
          <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 6px;">${data.title}</h2>
          <p style="font-size: 13px; color: var(--text-muted);">${data.description}</p>
        </div>

        <!-- Alphabet Segmented Tabs -->
        <div class="segmented-pills" id="alpha-tabs" style="overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; width: 100%; max-width: 100%; box-sizing: border-box;">
          <button class="pill-btn active" onclick="App.switchAlphaTab('vowels')">10 Эгшиг</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('consonants')">${hasAccess ? '' : '🔒 '}14 Гийгүүлэгч</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('compound')">${hasAccess ? '' : '🔒 '}11 Нийлмэл</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('double')">${hasAccess ? '' : '🔒 '}5 Давхар</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('syllable')">${hasAccess ? '' : '🔒 '}Үе бүтээх</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('batchim')">${hasAccess ? '' : '🔒 '}받침 дүрэм</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('quiz')">${hasAccess ? '' : '🔒 '}Сорил</button>
        </div>

        <!-- Dynamic Alphabet Tab Content Area -->
        <div id="alpha-content-area"></div>

        <!-- Complete / Skip Actions -->
        <div class="glass-card" style="text-align: center; margin-top: 24px;">
          <h4 style="margin-bottom: 12px; font-size: 15px;">Үсгийн бэлтгэлээ дуусгасан уу?</h4>
          <div style="display: flex; gap: 10px; justify-content: center;">
            <button class="btn-primary" style="max-width: 260px;" onclick="App.markAlphabetCompleted()">✅ Үсгээ сурсан — 1-р өдрийг эхлэх</button>
            <button class="btn-glass" onclick="App.skipAlphabetAndStart()">⏭️ Алгасаад эхлэх</button>
          </div>
        </div>
      </div>
    `;

    this.switchAlphaTab('vowels');
  },

  switchAlphaTab(tabKey) {
    if (tabKey !== 'vowels' && !this.hasActiveAccess()) {
      this.openLoginModal('🔒 Түгжээтэй хичээл', `
        <div style="text-align: center; margin-bottom: 14px;">
          <span style="font-size: 38px;">🔒</span>
          <h4 style="margin: 6px 0; color: var(--text-main); font-size: 16px;">Үсгийн хичээлийн нэмэлт хэсэг түгжээтэй байна</h4>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">
            Үндсэн 10 эгшиг үнэгүй нээлттэй. Үлдсэн 14 гийгүүлэгч, нийлмэл, давхар үсэг, үе бүтээх, бачим дүрэм болон сорилд нэвтрэхийн тулд 1 удаагийн нэвтрэх кодоо оруулна уу.
          </p>
        </div>
      `);
      return;
    }
    document.querySelectorAll('#alpha-tabs .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabKey));
    });

    const area = document.getElementById('alpha-content-area');
    if (!area) return;

    const data = this.alphabet || window.ALPHABET_DATA;

    if (tabKey === 'vowels' || tabKey === 'consonants' || tabKey === 'compound' || tabKey === 'double') {
      let list = [];
      let groupTitle = '';
      if (tabKey === 'vowels') { list = data.basic_vowels; groupTitle = 'Үндсэн 10 эгшиг'; }
      if (tabKey === 'consonants') { list = data.basic_consonants; groupTitle = 'Үндсэн 14 гийгүүлэгч'; }
      if (tabKey === 'compound') { list = data.compound_vowels; groupTitle = 'Нэмэлт 11 нийлмэл эгшиг'; }
      if (tabKey === 'double') { list = data.double_consonants; groupTitle = 'Давхар 5 гийгүүлэгч (Чанга авиа)'; }

      area.innerHTML = `
        <div class="fade-in">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-muted); margin-bottom: 12px;">${groupTitle} (${list.length})</div>
          <div class="letters-grid">
            ${list.map((item, idx) => `
              <div class="glass-card" style="padding: 16px 12px; text-align: center; cursor: pointer;" onclick="App.inspectLetter('${tabKey}', ${idx})">
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 4px;" onclick="event.stopPropagation(); App.speakLetter('${item.char}', '${item.name || ''}')" title="Үсгийн дуудлага сонсох">
                  <span style="font-family: var(--font-korean); font-size: 38px; font-weight: 800; color: var(--brand-blue);">${item.char}</span>
                  <span style="font-size: 14px; opacity: 0.75;" title="Үсэг сонсох">🔊</span>
                </div>
                <div style="font-size: 12px; font-weight: 700; color: var(--text-main);">${item.name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${item.sound}</div>
                <button class="btn-glass" style="margin-top: 8px; padding: 4px 10px; font-size: 11px;" onclick="event.stopPropagation(); window.SpeechEngine.speak('${item.examples && item.examples[0] ? item.examples[0].ko : item.char}')" title="Үг сонсох">🔊 Сонсох</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (tabKey === 'syllable') {
      const syl = data.syllable_rules;
      area.innerHTML = `
        <div class="glass-card fade-in">
          <h3 style="font-size: 17px; margin-bottom: 8px; color: var(--brand-blue);">${syl.title}</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${syl.summary}</p>
          ${syl.blocks.map(b => `
            <div style="background: rgba(255,255,255,0.4); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
              <strong style="color: var(--text-main); font-size: 14px;">${b.label}</strong>
              <div style="font-size: 12px; color: var(--text-muted); margin: 4px 0;">Бүтэц: ${b.structure}</div>
              <div style="font-family: var(--font-korean); font-size: 15px; font-weight: 700; color: var(--brand-orange); margin-top: 6px;">Жишээ: ${b.example}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tabKey === 'batchim') {
      const b = data.batchim_rules;
      area.innerHTML = `
        <div class="glass-card fade-in">
          <h3 style="font-size: 17px; margin-bottom: 8px; color: var(--brand-blue);">${b.title}</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${b.summary}</p>
          ${b.groups.map(g => `
            <div style="background: rgba(255,255,255,0.4); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: var(--brand-blue); font-size: 16px;">${g.representative}</strong>
                <span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-korean);">${g.letters}</span>
              </div>
              <p style="font-size: 12px; color: var(--text-main); margin-bottom: 8px;">${g.tip}</p>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${g.examples.map(ex => `
                  <button class="btn-glass" style="font-size: 12px; padding: 4px 10px;" onclick="window.SpeechEngine.speak('${ex.ko}')">
                    🔊 ${ex.ko} ${ex.ro} (${ex.mn})
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}

          <div style="margin-top: 20px; border-top: 1px solid var(--border-light); padding-top: 14px;">
            <h4 style="color: var(--brand-orange); margin-bottom: 6px;">${b.liaison.title}</h4>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">${b.liaison.explanation}</p>
            ${b.liaison.examples.map(ex => `
              <div style="padding: 6px 0; border-bottom: 1px dashed var(--border-light); display: flex; justify-content: space-between; align-items: center;">
                <span><b>${ex.written}</b> ➔ дуудах нь: <span style="color: var(--brand-blue); font-weight: 700;">${ex.pronounced}</span> ${ex.ro}</span>
                <button class="btn-glass" style="padding: 2px 8px; font-size: 11px;" onclick="window.SpeechEngine.speak('${ex.written}')">🔊 Сонсох</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (tabKey === 'quiz') {
      const qList = data.quizzes;
      const state = window.StorageManager.get();
      const savedAlpha = state.alphabetQuizAnswers || {};
      const answeredCount = Object.keys(savedAlpha).length;
      const correctCount = Object.values(savedAlpha).filter(a => a.isCorrect).length;

      area.innerHTML = `
        <div class="glass-card fade-in">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 17px; margin: 0; color: var(--brand-blue);">🔤 Үсгийн мэдлэг шалгах сорил</h3>
            ${answeredCount > 0 ? `
              <button class="btn-glass" style="padding: 4px 10px; font-size: 11px;" onclick="App.resetAlphabetQuiz()">
                🔄 Дахин өгөх
              </button>
            ` : ''}
          </div>

          ${answeredCount > 0 ? `
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px; background: rgba(37,99,235,0.06); padding: 8px 12px; border-radius: 10px;">
              📊 Явц: <b>${answeredCount} / ${qList.length}</b> хариулсан (${correctCount} зөв)
            </div>
          ` : ''}

          ${qList.map((q, qIdx) => {
            const ans = savedAlpha[qIdx];
            const qAudio = q.questionKo || q.audio || null;
            return `
              <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-light);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 8px;">
                  <div style="font-weight: 700; font-size: 14px; flex: 1;">${qIdx + 1}. ${q.question}</div>
                  ${qAudio ? `<button class="quiz-audio-btn" type="button" title="Асуултын солонгос дуудлага" data-ko="${qAudio.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">🔊</button>` : ''}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  ${q.options.map((opt, optIdx) => {
                    const optId = (typeof opt === 'object' && opt.id) ? opt.id : `alpha_q_${qIdx}_opt_${optIdx}`;
                    const optText = typeof opt === 'object' ? opt.text : opt;
                    const optKo = typeof opt === 'object' ? opt.ko : (/[가-힣]/.test(optText) ? optText : null);
                    const isCorrectOpt = q.correctId ? (optId === q.correctId) : (optIdx === q.correct);

                    let cardClass = 'quiz-opt-card';
                    let icon = '⚪';
                    if (ans !== undefined) {
                      const isUserSelected = (ans.selectedId !== undefined ? ans.selectedId === optId : ans.selected === optIdx);
                      if (isUserSelected) {
                        cardClass += ans.isCorrect ? ' selected-correct' : ' selected-wrong';
                        icon = ans.isCorrect ? '✅' : '❌';
                      } else if (isCorrectOpt) {
                        cardClass += ' revealed-correct';
                        icon = '🎯';
                      } else {
                        cardClass += ' dimmed';
                      }
                    }
                    return `
                      <div class="${cardClass}" id="${optId}" onclick="App.checkAlphabetQuiz(${qIdx}, '${optId}', ${optIdx}, ${q.correct})">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                          <span>${icon}</span>
                          <span style="font-family: var(--font-korean); font-size: 16px; font-weight: 700;">${optText}</span>
                        </div>
                        ${optKo ? `
                          <button class="quiz-audio-btn" type="button" title="Дуудлага сонсох" data-ko="${optKo.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                            🔊
                          </button>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
                ${ans !== undefined ? `
                  <div style="margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: ${ans.isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)'}; font-size: 13px; color: ${ans.isCorrect ? '#065f46' : '#991b1b'};">
                    <b>${ans.isCorrect ? '✅ Зөв хариулт!' : '❌ Буруу байна.'}</b> ${q.explanation}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  },

  inspectLetter(tabKey, idx) {
    if (tabKey !== 'vowels' && !this.hasActiveAccess()) {
      this.openLoginModal('🔒 Түгжээтэй хичээл');
      return;
    }
    const data = this.alphabet || window.ALPHABET_DATA;
    let list = [];
    if (tabKey === 'vowels') list = data.basic_vowels;
    if (tabKey === 'consonants') list = data.basic_consonants;
    if (tabKey === 'compound') list = data.compound_vowels;
    if (tabKey === 'double') list = data.double_consonants;

    const item = list[idx];
    if (!item) return;

    const modalBody = `
      <div style="text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 6px;">
          <span style="font-family: var(--font-korean); font-size: 64px; font-weight: 900; color: var(--brand-blue);">${item.char}</span>
          <button class="btn-primary" style="padding: 7px 14px; font-size: 13px;" onclick="App.speakLetter('${item.char}', '${item.name || ''}')">🔊 Үсэг дуудах</button>
        </div>
        <h3 style="font-size: 18px; margin-bottom: 4px;">Үсгийн нэр: ${item.name}</h3>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 16px;">Бодит дуудлага: <b style="color: var(--brand-orange);">${item.sound}</b></p>
        
        <div style="background: rgba(255,255,255,0.4); border-radius: 12px; padding: 14px; text-align: left; margin-bottom: 16px;">
          <strong>💡 Хэрхэн зөв дуудах вэ?</strong>
          <p style="font-size: 13px; color: var(--text-main); margin-top: 4px; line-height: 1.5;">${item.tip}</p>
        </div>

        <div style="text-align: left;">
          <strong>Жишээ үгс ба дуудлага:</strong>
          <div style="margin-top: 8px;">
            ${item.examples.map(ex => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--border-light);">
                <span style="font-family: var(--font-korean); font-size: 16px; font-weight: 700;">${ex.ko} <span style="font-size: 13px; font-weight: 400; color: var(--text-muted);">${ex.ro}</span> — ${ex.mn}</span>
                <button class="btn-glass" onclick="window.SpeechEngine.speak('${ex.ko}')">🔊 Сонсох</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.openModal(`Үсгийн тайлбар: ${item.char}`, modalBody);
  },

  checkAlphabetQuiz(qIdx, selectedOptId, selectedOptIdx, correctOptIdx) {
    const data = this.alphabet || window.ALPHABET_DATA || {};
    const qList = data.quizzes || [];
    const q = qList[qIdx];
    const correctId = q && q.correctId ? q.correctId : (q && q.options && q.options[q.correct] && q.options[q.correct].id);
    const isCorrect = correctId ? (selectedOptId === correctId) : (selectedOptIdx === correctOptIdx);

    const state = window.StorageManager.get();
    if (!state.alphabetQuizAnswers) state.alphabetQuizAnswers = {};
    state.alphabetQuizAnswers[qIdx] = {
      selectedId: selectedOptId,
      selected: selectedOptIdx,
      correctId: correctId,
      correct: correctOptIdx,
      isCorrect: isCorrect,
      answeredAt: new Date().toISOString()
    };
    window.StorageManager.save(state);
    this.switchAlphaTab('quiz');
  },

  resetAlphabetQuiz() {
    const state = window.StorageManager.get();
    state.alphabetQuizAnswers = {};
    window.StorageManager.save(state);
    this.switchAlphaTab('quiz');
  },

  markAlphabetCompleted() {
    const state = window.StorageManager.get();
    state.alphabetStatus = 'completed';
    state.activeDay = 1;
    window.StorageManager.save(state);
    this.openDay(1);
  },

  // =============================================================
  // 3. 90-DAY LESSONS LIST & 3-LEVEL CURRICULUM
  // =============================================================
  setLevelTab(lvl) {
    this.currentLevelTab = lvl;
    const container = document.getElementById('main-content');
    if (container) this.renderDaysList(container);
  },

  renderDaysList(container) {
    const state = window.StorageManager.get();
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const hasAccess = this.hasActiveAccess();

    if (!this.currentLevelTab) {
      const activeId = state.activeDay || 1;
      this.currentLevelTab = activeId <= 30 ? 1 : (activeId <= 60 ? 2 : 3);
    }

    const lvl = this.currentLevelTab;
    const levelDays = curr.filter(d => (d.level === lvl) || (!d.level && ((lvl === 1 && d.id <= 30) || (lvl === 2 && d.id > 30 && d.id <= 60) || (lvl === 3 && d.id > 60))));

    const levelInfo = {
      1: {
        badge: "🌟 1-Р ШАТ (АНХАН)",
        title: "1-р Шат: Анхан шат (Суурь өдөр тутмын яриа)",
        desc: "1–30 дахь өдөр: Мэндчилгээ, танилцах, дэлгүүр, тээвэр, ресторан, эмнэлэг, суурь харилцан яриа (300 өгүүлбэр)."
      },
      2: {
        badge: "🚀 2-Р ШАТ (ДУНД)",
        title: "2-р Шат: Дунд шат (Ажил амьдрал, өдөр тутмын яриа)",
        desc: "31–60 дахь өдөр: Ажлын зааварчилгаа, үйлдвэр, агуулах, барилга, илүү цаг, амралт, цалингийн задаргаа (300 өгүүлбэр)."
      },
      3: {
        badge: "👑 3-Р ШАТ (ГҮНЗГИЙ)",
        title: "3-р Шат: Гүнзгий шат (Албан харилцаа, гэрээ, мэргэжил)",
        desc: "61–90 дэх өдөр: Хөдөлмөрийн гэрээ, виз сунгах, ослын даатгал, банкны шилжүүлэг, бизнес имэйл, төгсөлт (300 өгүүлбэр)."
      }
    }[lvl] || {
      badge: "📚 СУРГАЛТ",
      title: "Солонгос хэлний сургалт",
      desc: "Өдөр бүр бодит 10 өгүүлбэр суралцах систем"
    };

    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <button class="btn-glass" onclick="App.navigate('home')">← Буцах</button>
            <span class="sentence-badge">Нийт 90 өдөр (900 Өгүүлбэр)</span>
          </div>
          <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 4px;">Хичээлийн агуулгын жагсаалт</h2>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
            ${hasAccess ? '✅ Таны 90 өдрийн бүтэн эрх идэвхтэй байна.' : '🔒 1-р хичээл нээлттэй, 2–90 дэх өдөр төлбөр/зөвшөөрлөөр нээгдэнэ.'}
          </p>

          <!-- 3 Level Tabs -->
          <div class="segmented-pills" style="margin-top: 10px; margin-bottom: 4px; overflow-x: auto;">
            <button class="pill-btn ${lvl === 1 ? 'active' : ''}" onclick="App.setLevelTab(1)">🌟 1-р Шат (1–30)</button>
            <button class="pill-btn ${lvl === 2 ? 'active' : ''}" onclick="App.setLevelTab(2)">🚀 2-р Шат (31–60)</button>
            <button class="pill-btn ${lvl === 3 ? 'active' : ''}" onclick="App.setLevelTab(3)">👑 3-р Шат (61–90)</button>
          </div>
        </div>

        <!-- Level Context Info Card -->
        <div class="glass-card" style="padding: 14px 18px; border-left: 4px solid var(--brand-blue); margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span class="sentence-badge" style="background: rgba(37,99,235,0.12); color: var(--brand-blue); font-weight: 800;">${levelInfo.badge}</span>
            <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">30 хичээл • 300 өгүүлбэр</span>
          </div>
          <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin: 6px 0 4px;">${levelInfo.title}</h3>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin: 0;">${levelInfo.desc}</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${levelDays.map(day => {
            const isDone = state.completedDays.includes(day.id);
            const isCurrent = state.activeDay === day.id;
            const isLocked = day.id > 1 && !hasAccess;
            return `
              <div class="glass-card" style="padding: 16px 18px; cursor: pointer; border-left: 4px solid ${isLocked ? '#f59e0b' : (isDone ? '#10b981' : (isCurrent ? '#2563eb' : 'var(--glass-border)'))}; opacity: ${isLocked ? '0.85' : '1'};" onclick="App.openDay(${day.id})">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 12px; font-weight: 700; color: ${isLocked ? '#d97706' : 'var(--brand-blue)'};">${day.id}-р өдөр: ${day.title}</span>
                  <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.4);">${isLocked ? '🔒 Түгжээтэй' : day.workplaceRatio}</span>
                </div>
                <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${day.subtitle}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                  <span style="font-size: 12px; color: var(--text-muted);">${isLocked ? 'Эрх идэвхжүүлж нээх' : '10 үндсэн өгүүлбэр + Сорил'}</span>
                  <span style="font-size: 13px; font-weight: 700; color: ${isLocked ? '#f59e0b' : (isDone ? '#10b981' : '#64748b')};">
                    ${isLocked ? '🔒 Нээх' : (isDone ? '✓ Дууссан' : (isCurrent ? '▶️ Үргэлжлүүлэх' : 'Нээх ➔'))}
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  openDay(dayId) {
    dayId = parseInt(dayId) || 1;
    if (dayId > 1 && !this.hasActiveAccess()) {
      if (!this.userProfile) {
        this.openLoginModal('🔒 Түгжээтэй хичээл', `
          <div style="text-align: center; margin-bottom: 16px;">
            <span style="font-size: 40px;">🔒</span>
            <h4 style="margin: 8px 0; color: var(--text-main); font-size: 16px;">${dayId}-р өдрийн хичээл түгжээтэй байна</h4>
            <p style="font-size: 13px; color: var(--text-muted);">
              90 өдрийн (3 шат) бүтэн сургалтад нэвтрэхийн тулд өөрийн бүртгэлтэй имэйлээр нэвтэрнэ үү. (1-р өдөр болон Хангыл үсэг бүх хүнд нээлттэй).
            </p>
          </div>
        `);
      } else {
        this.openPaymentModal();
      }
      return;
    }

    this.currentDayId = dayId;
    this.currentStep = 0;
    this.currentSentenceIdx = 0;

    const state = window.StorageManager.get();
    if (!state.activeDay || dayId > state.activeDay) {
      state.activeDay = dayId;
    }
    state.activeStep = 0;
    state.activeSentenceIndex = 0;
    window.StorageManager.save(state);

    this.navigate(`day-${dayId}`);
  },

  renderPaywall(container, dayId) {
    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 54px; margin-bottom: 12px;">🔒</div>
          <span class="sentence-badge" style="background: rgba(37, 99, 235, 0.15); color: var(--brand-blue); margin-bottom: 12px; display: inline-block;">
            90 ӨДРИЙН СУРГАЛТЫН ТҮГЖЭЭ
          </span>
          <h2 style="font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
            ${dayId}-р өдрийн хичээл түгжээтэй байна
          </h2>
          <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; max-width: 440px; margin: 0 auto 24px;">
            Энэхүү сургалтын хөтөлбөрийг үргэлжлүүлэн үзэхийн тулд Mongolian Media-аас авсан <b>1 удаагийн нэвтрэх код</b>-оо оруулан эрхээ нээнэ үү. (1-р өдрийн хичээл болон Хангыл үсэг бүх хүнд үнэгүй нээлттэй).
          </p>

          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn-primary" style="max-width: 260px;" onclick="App.openLoginModal()">🎟️ 1 удаагийн кодоор нэвтрэх</button>
            <button class="btn-glass" onclick="App.openDay(1)">👀 1-р хичээл үнэгүй үзэх</button>
          </div>
        </div>
      </div>
    `;
  },

  // =============================================================
  // 4. DAY LESSON DETAIL & 5-STEP WORKFLOW
  // =============================================================
  renderDayLesson(container, dayId) {
    dayId = parseInt(dayId) || this.currentDayId || 1;
    this.currentDayId = dayId;

    if (dayId > 1 && !this.hasActiveAccess()) {
      this.renderPaywall(container, dayId);
      return;
    }

    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const day = curr.find(d => d.id === dayId || d.day === dayId) || curr[0];
    if (!day) return;

    const state = window.StorageManager.get();
    let sentences = day.sentences || [];

    // Apply 5+5 Split option
    if (this.splitMode === 'first') {
      sentences = sentences.slice(0, 5);
    } else if (this.splitMode === 'second') {
      sentences = sentences.slice(5, 10);
    }

    const currentSentence = sentences[this.currentSentenceIdx] || sentences[0];

    container.innerHTML = `
      <div class="fade-in">
        <!-- Top Day Header -->
        <div class="glass-card" style="padding: 16px 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <button class="btn-glass" onclick="App.navigate('lessons-list')">← Хичээлийн жагсаалт</button>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${dayId > 1 ? `<button class="btn-glass" style="padding: 4px 10px; font-size: 12px; font-weight: 700;" onclick="App.openDay(${dayId - 1})">← ${dayId - 1}-р өдөр</button>` : ''}
              ${dayId < (curr.length || 90) ? `<button class="btn-glass" style="padding: 4px 10px; font-size: 12px; font-weight: 700;" onclick="App.openDay(${dayId + 1})">${dayId + 1}-р өдөр ➔</button>` : ''}
            </div>
            <span class="sentence-badge">${day.category}</span>
          </div>
          <h2 style="font-size: 19px; font-weight: 800; margin-bottom: 4px;">${day.title}</h2>
          <p style="font-size: 13px; color: var(--text-muted);">${day.subtitle}</p>

          <!-- 5+5 Split Segmented Control -->
          <div class="segmented-pills" style="margin-top: 14px; margin-bottom: 0;">
            <button class="pill-btn ${this.splitMode === 'all' ? 'active' : ''}" onclick="App.setSplitMode('all')">Бүх 10 өгүүлбэр</button>
            <button class="pill-btn ${this.splitMode === 'first' ? 'active' : ''}" onclick="App.setSplitMode('first')">1-р хагас (1–5)</button>
            <button class="pill-btn ${this.splitMode === 'second' ? 'active' : ''}" onclick="App.setSplitMode('second')">2-р хагас (6–10)</button>
          </div>
        </div>

        <!-- 5-Step Workflow Tabs -->
        <div class="segmented-pills" id="day-steps-bar" style="overflow-x: auto;">
          <button class="pill-btn ${this.currentStep === 0 ? 'active' : ''}" onclick="App.setStep(0)">1. Өгүүлбэр</button>
          <button class="pill-btn ${this.currentStep === 1 ? 'active' : ''}" onclick="App.setStep(1)">2. Сонсох</button>
          <button class="pill-btn ${this.currentStep === 2 ? 'active' : ''}" onclick="App.setStep(2)">3. Сүүдэрлэх</button>
          <button class="pill-btn ${this.currentStep === 3 ? 'active' : ''}" onclick="App.setStep(3)">4. Өөрөө хэлэх</button>
          <button class="pill-btn ${this.currentStep === 4 ? 'active' : ''}" onclick="App.setStep(4)">5. Харилцан яриа</button>
          <button class="pill-btn ${this.currentStep === 5 ? 'active' : ''}" onclick="App.setStep(5)">6. Сорил</button>
        </div>

        <!-- Step Dynamic Content Container -->
        <div id="day-step-content"></div>
      </div>
    `;

    this.renderCurrentStepContent(day, sentences, currentSentence);
  },

  setSplitMode(mode) {
    this.splitMode = mode;
    this.currentSentenceIdx = 0;
    const state = window.StorageManager.get();
    state.sentenceSplitMode = mode;
    window.StorageManager.save(state);
    this.renderDayLesson(document.getElementById('main-content'), this.currentDayId);
  },

  setStep(stepIdx) {
    this.currentStep = stepIdx;
    const state = window.StorageManager.get();
    state.activeStep = stepIdx;
    window.StorageManager.save(state);
    this.renderDayLesson(document.getElementById('main-content'), this.currentDayId);
  },

  renderCurrentStepContent(day, sentences, currentSentence) {
    const area = document.getElementById('day-step-content');
    if (!area) return;

    const state = window.StorageManager.get();

    // ---------------------------------------------------------
    // STEP 0: Sentence Study Card
    // ---------------------------------------------------------
    if (this.currentStep === 0) {
      const showGalig = state.settings.showGalig !== false;
      const isBookmarked = window.StorageManager.isVocabBookmarked(state, currentSentence.ko);

      area.innerHTML = `
        <div class="sentence-card fade-in">
          <div class="sentence-header">
            <span class="sentence-badge">${this.currentSentenceIdx + 1} / ${sentences.length} Өгүүлбэр</span>
            <div style="display: flex; gap: 8px;">
              <button class="icon-btn" onclick="App.toggleGaligVisibility()" title="Галиг харуулах/нуух">
                ${showGalig ? '👁️' : '🙈'}
              </button>
              <button class="icon-btn" onclick="App.toggleSentenceBookmark('${currentSentence.id}')" title="Хадгалах">
                ${isBookmarked ? '⭐' : '☆'}
              </button>
            </div>
          </div>

          <div class="korean-text-large">${currentSentence.ko}</div>
          <div class="mongolian-meaning">${currentSentence.mn}</div>
          ${showGalig ? `<div class="mongolian-galig">Ойролцоо дуудлага: ${currentSentence.ro}</div>` : ''}

          <div class="context-box">
            <b>💡 Хэрэглэх нөхцөл:</b> ${currentSentence.context}
          </div>

          <!-- Audio Controls -->
          <div class="card-audio-actions">
            <button class="btn-glass" onclick="window.SpeechEngine.speak('${currentSentence.ko}')">
              🔊 Сонсох
            </button>
            <button class="btn-glass" onclick="window.SpeechEngine.speakSlow('${currentSentence.ko}')">
              🐢 Удаанаар (0.72x)
            </button>
          </div>

          <!-- Vocabulary Breakdown -->
          ${currentSentence.vocab && currentSentence.vocab.length > 0 ? `
            <div class="sub-vocab-list">
              <div class="sub-vocab-title">Шинэ үгс & хэллэгүүд:</div>
              ${currentSentence.vocab.map(v => `
                <div class="sub-vocab-item">
                  <div>
                    <span class="vocab-ko">${v.ko}</span>
                    <span class="vocab-mn"> — ${v.mn}</span>
                    <span style="font-size: 11px; color: var(--text-light);"> [${v.ro}]</span>
                  </div>
                  <button class="icon-btn" style="width: 28px; height: 28px; font-size: 12px;" onclick="window.SpeechEngine.speak('${v.ko}')">🔊</button>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Sentence Pager -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid var(--border-light); padding-top: 16px;">
            <button class="btn-glass" ${this.currentSentenceIdx === 0 ? 'disabled style="opacity: 0.4;"' : ''} onclick="App.prevSentence()">
              ← Өмнөх
            </button>
            <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">
              ${this.currentSentenceIdx + 1} / ${sentences.length}
            </span>
            ${this.currentSentenceIdx < sentences.length - 1 ? `
              <button class="btn-glass" onclick="App.nextSentence()">
                Дараагийн өгүүлбэр ➔
              </button>
            ` : `
              <button class="btn-primary" style="width: auto; padding: 8px 18px;" onclick="App.setStep(1)">
                2-р дасгал руу орох ➔
              </button>
            `}
          </div>
        </div>
      `;
    }

    // ---------------------------------------------------------
    // STEP 1: Meaning Quiz (Listen & select)
    // ---------------------------------------------------------
    else if (this.currentStep === 1) {
      const qSentence = sentences[this.currentSentenceIdx] || sentences[0];
      // Generate 3 random alternative options
      const otherSentences = sentences.filter(s => s.id !== qSentence.id);
      const wrong1 = otherSentences[0] ? otherSentences[0].mn : 'Өөр утга';
      const wrong2 = otherSentences[1] ? otherSentences[1].mn : 'Баяртай';
      const wrong3 = otherSentences[2] ? otherSentences[2].mn : 'Тийм ээ';
      const options = [qSentence.mn, wrong1, wrong2, wrong3].sort(() => Math.random() - 0.5);

      area.innerHTML = `
        <div class="glass-card fade-in">
          <span class="sentence-badge">2-р Дасгал: Сонсоод утгыг сонгох</span>
          <h3 style="font-size: 16px; margin: 12px 0 6px;">Аудиог сонсоод монгол утгыг нь таана уу:</h3>
          
          <div style="text-align: center; margin: 20px 0;">
            <button class="btn-primary" style="width: auto; padding: 12px 28px; font-size: 16px;" onclick="window.SpeechEngine.speak('${qSentence.ko}')">
              🔊 Солонгосоор сонсох
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${options.map((opt, i) => `
              <button class="btn-glass" style="padding: 12px 16px; text-align: left; font-size: 14px;" onclick="App.checkMeaningAnswer(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(qSentence.mn)}')">
                ${i + 1}. ${opt}
              </button>
            `).join('')}
          </div>

          <div id="meaning-feedback" style="margin-top: 14px; display: none;"></div>

          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button class="btn-primary" style="width: auto; padding: 8px 18px;" onclick="App.setStep(2)">
              3-р Сүүдэрлэх дасгал ➔
            </button>
          </div>
        </div>
      `;
    }

    // ---------------------------------------------------------
    // STEP 2: Shadowing Studio (Real mic recording)
    // ---------------------------------------------------------
    else if (this.currentStep === 2) {
      const s = sentences[this.currentSentenceIdx] || sentences[0];
      area.innerHTML = `
        <div class="glass-card fade-in" style="text-align: center;">
          <span class="sentence-badge">3-р Дасгал: Сүүдэрлэн дуурайх (Shadowing)</span>
          <p style="font-size: 13px; color: var(--text-muted); margin: 10px 0 16px;">
            Эхлээд солонгос дуудлагыг сонсоод, дараа нь микрофоноо даран яг дуурайн хэлээрэй.
          </p>

          <div class="korean-text-large" style="font-size: 28px; margin-bottom: 6px;">${s.ko}</div>
          <div class="mongolian-galig" style="margin-bottom: 18px;">${s.ro}</div>

          <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 20px;">
            <button class="btn-glass" onclick="window.SpeechEngine.speak('${s.ko}')">🔊 Сонсох</button>
            <button class="btn-glass btn-record" id="btn-shadow-mic" onclick="App.toggleShadowRecording('${s.ko}')">
              🎙️ Дуугаа бичих
            </button>
            <button class="btn-glass" id="btn-shadow-play" style="display: none;" onclick="window.SpeechEngine.playUserRecording()">
              ▶️ Өөрийгөө сонсох
            </button>
          </div>

          <div id="shadow-feedback-box" style="display: none; text-align: left;"></div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px; border-top: 1px solid var(--border-light); padding-top: 16px;">
            <button class="btn-glass" onclick="App.setStep(1)">← Өмнөх</button>
            <button class="btn-primary" style="width: auto; padding: 8px 18px;" onclick="App.setStep(3)">
              4-р дасгал руу орох ➔
            </button>
          </div>
        </div>
      `;
    }

    // ---------------------------------------------------------
    // STEP 3: Active Recall (Mongolian -> Speak Korean)
    // ---------------------------------------------------------
    else if (this.currentStep === 3) {
      const s = sentences[this.currentSentenceIdx] || sentences[0];
      area.innerHTML = `
        <div class="glass-card fade-in" style="text-align: center;">
          <span class="sentence-badge">4-р Дасгал: Монголоос Солонгос руу өөрөө хэлэх</span>
          <p style="font-size: 13px; color: var(--text-muted); margin: 10px 0 16px;">
            Солонгос бичвэр нууцлагдсан байна. Монгол утгыг уншаад солонгосоор өөрөө чангаар хэлж шалгаарай.
          </p>

          <div style="background: rgba(37,99,235,0.08); padding: 18px; border-radius: 16px; margin-bottom: 16px;">
            <div style="font-size: 18px; font-weight: 700; color: var(--text-main);">${s.mn}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Нөхцөл: ${s.context}</div>
          </div>

          <button class="btn-glass" id="btn-reveal-korean" onclick="App.revealKoreanAnswer('${s.ko}', '${s.ro}')">
            👁️ Зөв солонгос хариуг харах
          </button>

          <div id="recall-answer-box" style="margin-top: 16px; display: none;"></div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px; border-top: 1px solid var(--border-light); padding-top: 16px;">
            <button class="btn-glass" onclick="App.setStep(2)">← Өмнөх</button>
            <button class="btn-primary" style="width: auto; padding: 8px 18px;" onclick="App.setStep(4)">
              5-р Харилцан яриа ➔
            </button>
          </div>
        </div>
      `;
    }

    // ---------------------------------------------------------
    // STEP 4: Situational Dialogue
    // ---------------------------------------------------------
    else if (this.currentStep === 4) {
      const dialogue = day.dialogue || [];
      area.innerHTML = `
        <div class="glass-card fade-in">
          <span class="sentence-badge">5-р Дасгал: Бодит нөхцөлт харилцан яриа</span>
          <h3 style="font-size: 16px; margin: 10px 0 16px;">Хоёр дүрийн бодит яриаг сонсож, дүрд орж давтаарай:</h3>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px;">
            ${dialogue.map((turn, i) => `
              <div style="background: ${i % 2 === 0 ? 'rgba(37,99,235,0.06)' : 'rgba(249,115,22,0.06)'}; border-radius: 14px; padding: 12px 16px; border: 1px solid var(--glass-border);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <strong style="color: ${i % 2 === 0 ? 'var(--brand-blue)' : 'var(--brand-orange)'}; font-size: 13px;">${turn.speaker} (${turn.role})</strong>
                  <button class="icon-btn" style="width: 28px; height: 28px; font-size: 12px;" onclick="window.SpeechEngine.speak('${turn.ko}')">🔊</button>
                </div>
                <div style="font-family: var(--font-korean); font-size: 15px; font-weight: 700; color: var(--text-main);">${turn.ko}</div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">${turn.mn}</div>
                <div style="font-size: 11px; color: var(--text-light); font-style: italic;">${turn.ro}</div>
              </div>
            `).join('')}
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 20px; border-top: 1px solid var(--border-light); padding-top: 16px;">
            <button class="btn-glass" onclick="App.setStep(3)">← Өмнөх</button>
            <button class="btn-primary" style="width: auto; padding: 8px 18px;" onclick="App.setStep(5)">
              6-р Сорил шалгалт ➔
            </button>
          </div>
        </div>
      `;
    }

    // ---------------------------------------------------------
    // STEP 5: Mini Quiz & Explanations
    // ---------------------------------------------------------
    else if (this.currentStep === 5) {
      const quiz = day.quiz || [];
      const savedQuiz = (state.dayQuizAnswers && state.dayQuizAnswers[day.id]) || {};
      const answeredCount = Object.keys(savedQuiz).length;
      const correctCount = Object.values(savedQuiz).filter(a => a.isCorrect).length;

      area.innerHTML = `
        <div class="glass-card fade-in">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="sentence-badge">6-р Дасгал: Шалгалт & Монгол тайлбар</span>
            <span style="font-size: 12px; font-weight: 700; color: var(--brand-blue);">${quiz.length} Даалгавар</span>
          </div>
          <h3 style="font-size: 18px; margin: 10px 0 14px; font-weight: 800;">Өнөөдрийн хичээлийн 5 даалгаварт сорил:</h3>

          <!-- Progress & Reset Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(37,99,235,0.06); padding: 10px 14px; border-radius: 12px; margin-bottom: 18px; border: 1px solid var(--glass-border);">
            <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">
              📊 Явц: <span style="color: var(--brand-blue); font-size: 14px;">${answeredCount} / ${quiz.length}</span> хариулсан
              ${answeredCount > 0 ? `<span style="margin-left: 8px; color: ${correctCount >= 3 ? '#10b981' : '#ef4444'};">(${correctCount} зөв)</span>` : ''}
            </div>
            ${answeredCount > 0 ? `
              <button class="btn-glass" style="padding: 5px 12px; font-size: 12px;" onclick="App.resetDayQuiz(${day.id})">
                🔄 Сорил дахин өгөх
              </button>
            ` : ''}
          </div>

          ${answeredCount === quiz.length && quiz.length > 0 ? `
            <div style="text-align: center; padding: 16px; background: ${correctCount === quiz.length ? 'rgba(16,185,129,0.12)' : 'rgba(37,99,235,0.08)'}; border-radius: 14px; margin-bottom: 20px; border: 1.5px solid ${correctCount === quiz.length ? '#10b981' : 'var(--glass-border)'};">
              <div style="font-size: 28px; margin-bottom: 6px;">${correctCount === quiz.length ? '🏆 Онц сурлагатан!' : (correctCount >= 3 ? '👏 Сайн байна!' : '💪 Дахин давтаж бататгаарай!')}</div>
              <div style="font-size: 16px; font-weight: 800; color: var(--text-main);">
                Та нийт ${quiz.length} асуултаас <span style="color: ${correctCount >= 3 ? '#10b981' : '#ef4444'}; font-size: 18px;">${correctCount}</span> зөв хариуллаа! (${Math.round((correctCount / quiz.length) * 100)}%)
              </div>
            </div>
          ` : ''}

          <!-- 1-5 Questions List -->
          ${quiz.map((q, qIdx) => {
            const ans = savedQuiz[qIdx];
            const qAudio = q.questionKo || null;

            return `
              <div class="glass-card" style="margin-bottom: 18px; padding: 16px 16px; border-radius: 16px; border: 1.5px solid ${ans !== undefined ? (ans.isCorrect ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)') : 'var(--glass-border)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px;">
                  <div style="font-weight: 700; font-size: 15px; color: var(--text-main); line-height: 1.45;">
                    <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: var(--brand-blue); color: #fff; font-size: 12px; margin-right: 6px; font-weight: 800;">${qIdx + 1}</span>
                    ${q.question}
                  </div>
                  ${qAudio ? `
                    <button class="quiz-audio-btn" type="button" title="Асуултын солонгос дуудлага сонсох" data-ko="${qAudio.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                      🔊
                    </button>
                  ` : ''}
                </div>

                <!-- Answer Options -->
                <div style="display: flex; flex-direction: column; gap: 9px;">
                  ${q.options.map((opt, optIdx) => {
                    const optId = (typeof opt === 'object' && opt.id) ? opt.id : `dayq_${day.id}_${qIdx}_opt_${optIdx}`;
                    const optText = typeof opt === 'object' ? opt.text : opt;
                    const optKo = typeof opt === 'object' ? opt.ko : (/[가-힣]/.test(optText) ? optText : null);
                    const isCorrectOpt = q.correctId ? (optId === q.correctId) : (optIdx === q.correct);

                    let cardClass = 'quiz-opt-card';
                    let radioIcon = '⚪';
                    let tagBadge = '';

                    if (ans !== undefined) {
                      const isUserSelected = (ans.selectedId !== undefined ? ans.selectedId === optId : ans.selected === optIdx);
                      if (isUserSelected) {
                        if (ans.isCorrect) {
                          cardClass += ' selected-correct';
                          radioIcon = '✅';
                          tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #047857; margin-left: 6px;">(Таны зөв хариулт)</span>';
                        } else {
                          cardClass += ' selected-wrong';
                          radioIcon = '❌';
                          tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #b91c1c; margin-left: 6px;">(Таны сонголт)</span>';
                        }
                      } else if (isCorrectOpt) {
                        cardClass += ' revealed-correct';
                        radioIcon = '🎯';
                        tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #047857; margin-left: 6px;">(Зөв хариулт нь)</span>';
                      } else {
                        cardClass += ' dimmed';
                      }
                    }

                    return `
                      <div class="${cardClass}" id="${optId}" onclick="App.checkDayQuiz(${day.id}, ${qIdx}, '${optId}', ${optIdx}, ${q.correct})">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                          <span style="font-size: 16px; min-width: 22px;">${radioIcon}</span>
                          <div style="flex: 1;">
                            <span style="font-family: var(--font-korean); font-size: 15px; font-weight: 600;">${optText}</span>
                            ${tagBadge}
                          </div>
                        </div>
                        ${optKo ? `
                          <button class="quiz-audio-btn" type="button" title="Хариултын солонгос дуудлага сонсох" data-ko="${optKo.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                            🔊
                          </button>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>

                <!-- Explanation Box -->
                ${ans !== undefined ? `
                  <div style="margin-top: 12px; padding: 10px 14px; border-radius: 12px; background: ${ans.isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)'}; font-size: 13px; line-height: 1.5; color: ${ans.isCorrect ? '#065f46' : '#991b1b'}; border: 1px solid ${ans.isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
                    <b>${ans.isCorrect ? '✅ Зөв хариулт!' : '❌ Буруу байна.'}</b> ${q.explanation}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}

          <div style="text-align: center; margin-top: 24px;">
            <button class="btn-primary" style="padding: 14px 28px; font-size: 15px;" onclick="App.completeDayLesson(${day.id})">
              🎉 Энэ өдрийн хичээлийг амжилттай дуусгах ${answeredCount > 0 ? `(${correctCount}/${quiz.length} зөв)` : ''}
            </button>
          </div>
        </div>
      `;
    }
  },

  nextSentence() {
    this.currentSentenceIdx++;
    this.renderDayLesson(document.getElementById('main-content'), this.currentDayId);
  },

  prevSentence() {
    if (this.currentSentenceIdx > 0) {
      this.currentSentenceIdx--;
      this.renderDayLesson(document.getElementById('main-content'), this.currentDayId);
    }
  },

  toggleGaligVisibility() {
    const state = window.StorageManager.get();
    state.settings.showGalig = !(state.settings.showGalig !== false);
    window.StorageManager.save(state);
    this.renderDayLesson(document.getElementById('main-content'), this.currentDayId);
  },

  toggleSentenceBookmark(sId) {
    const state = window.StorageManager.get();
    const currList = this.curriculum || window.CURRICULUM_DATA || [];
    let sentence = null;
    let foundDayId = this.currentDayId;
    for (const d of currList) {
      const found = (d.sentences || []).find(s => s.id === sId);
      if (found) {
        sentence = found;
        foundDayId = d.id;
        break;
      }
    }
    if (sentence) {
      window.StorageManager.toggleBookmarkVocab(state, {
        id: sentence.id,
        ko: sentence.ko,
        mn: sentence.mn,
        ro: sentence.ro || '',
        tip: sentence.context || ''
      });
      window.StorageManager.save(state);
      if (this.currentView === 'vocab') {
        this.renderVocab(document.getElementById('main-content'));
      } else {
        this.renderDayLesson(document.getElementById('main-content'), foundDayId);
      }
    }
  },

  toggleCardRecording(targetKorean) {
    const btn = document.getElementById('btn-mic-card');
    const playBtn = document.getElementById('btn-play-rec');
    const box = document.getElementById('sentence-assessment-box');

    if (window.SpeechEngine.isRecording) {
      window.SpeechEngine.stopRecording();
      if (btn) {
        btn.classList.remove('recording');
        btn.textContent = '🎙️ Дагаж хэлэх';
      }
    } else {
      if (btn) {
        btn.classList.add('recording');
        btn.textContent = '⏹️ Бичиж байна...';
      }
      if (box) {
        box.style.display = 'block';
        box.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">🎧 Сонсож байна... Солонгосоор тод хэлээрэй.</div>`;
      }

      window.SpeechEngine.startRecording({
        onRecognized: (transcript, confidence) => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дагаж хэлэх';
          }
          if (playBtn) playBtn.style.display = 'inline-flex';

          const result = window.SpeechEngine.evaluatePronunciation(transcript, targetKorean, confidence);
          this.displayPronunciationResult(box, result);
        },
        onError: () => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дагаж хэлэх';
          }
        },
        onPermissionDenied: () => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дагаж хэлэх';
          }
          if (box) box.style.display = 'none';
          window.SpeechEngine.showMicHelpModal();
        }
      });
    }
  },

  toggleShadowRecording(targetKorean) {
    const btn = document.getElementById('btn-shadow-mic');
    const playBtn = document.getElementById('btn-shadow-play');
    const box = document.getElementById('shadow-feedback-box');

    if (window.SpeechEngine.isRecording) {
      window.SpeechEngine.stopRecording();
      if (btn) {
        btn.classList.remove('recording');
        btn.textContent = '🎙️ Дуугаа бичих';
      }
    } else {
      if (btn) {
        btn.classList.add('recording');
        btn.textContent = '⏹️ Бичиж байна...';
      }
      if (box) {
        box.style.display = 'block';
        box.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">Микрофоноор яриаг сонсож байна...</p>`;
      }

      window.SpeechEngine.startRecording({
        onRecognized: (transcript, confidence) => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дуугаа бичих';
          }
          if (playBtn) playBtn.style.display = 'inline-flex';

          const result = window.SpeechEngine.evaluatePronunciation(transcript, targetKorean, confidence);
          this.displayPronunciationResult(box, result);
        },
        onError: () => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дуугаа бичих';
          }
        },
        onPermissionDenied: () => {
          if (btn) {
            btn.classList.remove('recording');
            btn.textContent = '🎙️ Дуугаа бичих';
          }
          if (box) box.style.display = 'none';
          window.SpeechEngine.showMicHelpModal();
        }
      });
    }
  },

  displayPronunciationResult(container, result) {
    if (!container) return;
    container.style.display = 'block';

    const scoreClass = result.score >= 85 ? 'high' : (result.score >= 70 ? 'mid' : 'low');

    container.innerHTML = `
      <div class="assessment-feedback ${result.passed ? '' : 'needs-retry'}">
        <div class="feedback-score-bar">
          <span style="font-weight: 700; font-size: 13px;">Дуудлагын үнэлгээ:</span>
          <span class="score-badge ${scoreClass}">${result.score ? result.score + ' / 100' : 'Дахин оролдох'}</span>
        </div>
        <p style="font-size: 13px; margin: 4px 0 8px;">${result.message}</p>
        <div style="font-size: 12px; color: var(--text-muted);">
          <b>Таны хэлсэн:</b> "${result.recognizedText || '...'}"
        </div>
      </div>
    `;
  },

  checkMeaningAnswer(btn, encSelected, encCorrect) {
    const selected = decodeURIComponent(encSelected);
    const correct = decodeURIComponent(encCorrect);
    const fb = document.getElementById('meaning-feedback');
    if (!fb) return;

    fb.style.display = 'block';
    if (selected === correct) {
      btn.style.borderColor = '#10b981';
      btn.style.background = 'rgba(16,185,129,0.15)';
      fb.style.color = '#10b981';
      fb.innerHTML = `<b>✅ Маш зөв!</b> Та өгүүлбэрийн утгыг зөв таалаа.`;
    } else {
      btn.style.borderColor = '#ef4444';
      fb.style.color = '#ef4444';
      fb.innerHTML = `<b>❌ Буруу байна.</b> Зөв хариулт: <b>${correct}</b>`;
    }
  },

  revealKoreanAnswer(korean, galig) {
    const box = document.getElementById('recall-answer-box');
    const btn = document.getElementById('btn-reveal-korean');
    if (!box) return;

    box.style.display = 'block';
    box.innerHTML = `
      <div style="background: rgba(16,185,129,0.08); border: 1px solid #10b981; border-radius: 12px; padding: 14px;">
        <div style="font-family: var(--font-korean); font-size: 24px; font-weight: 800; color: #10b981;">${korean}</div>
        <div style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">Дуудлага: ${galig}</div>
        <button class="btn-glass" style="margin-top: 10px;" onclick="window.SpeechEngine.speak('${korean}')">🔊 Зөв дуудлагыг сонсох</button>
      </div>
    `;
    if (btn) btn.style.display = 'none';
  },

  checkDayQuiz(dayId, qIdx, selectedOptId, selectedOptIdx, correctOptIdx) {
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const day = curr.find(d => d.id === dayId);
    const q = (day && day.quiz) ? day.quiz[qIdx] : null;
    const correctId = q && q.correctId ? q.correctId : (q && q.options && q.options[q.correct] && q.options[q.correct].id);
    const isCorrect = correctId ? (selectedOptId === correctId) : (selectedOptIdx === correctOptIdx);

    const state = window.StorageManager.get();
    if (!state.dayQuizAnswers) state.dayQuizAnswers = {};
    if (!state.dayQuizAnswers[dayId]) state.dayQuizAnswers[dayId] = {};

    state.dayQuizAnswers[dayId][qIdx] = {
      selectedId: selectedOptId,
      selected: selectedOptIdx,
      correctId: correctId,
      correct: correctOptIdx,
      isCorrect: isCorrect,
      answeredAt: new Date().toISOString()
    };
    window.StorageManager.save(state);

    // Re-render Step 5 so all questions 1-5 retain their checked states
    if (day) {
      let sentences = day.sentences || [];
      if (this.splitMode === 'first') sentences = sentences.slice(0, 5);
      else if (this.splitMode === 'second') sentences = sentences.slice(5, 10);
      const currentSentence = sentences[this.currentSentenceIdx] || sentences[0];
      this.renderCurrentStepContent(day, sentences, currentSentence);
    }
  },

  resetDayQuiz(dayId) {
    const state = window.StorageManager.get();
    if (state.dayQuizAnswers && state.dayQuizAnswers[dayId]) {
      delete state.dayQuizAnswers[dayId];
      window.StorageManager.save(state);
    }
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const day = curr.find(d => d.id === dayId);
    if (day) {
      let sentences = day.sentences || [];
      if (this.splitMode === 'first') sentences = sentences.slice(0, 5);
      else if (this.splitMode === 'second') sentences = sentences.slice(5, 10);
      const currentSentence = sentences[this.currentSentenceIdx] || sentences[0];
      this.renderCurrentStepContent(day, sentences, currentSentence);
    }
  },

  completeDayLesson(dayId) {
    dayId = parseInt(dayId) || this.currentDayId || 1;
    const state = window.StorageManager.get();
    if (!state.completedDays.includes(dayId)) {
      state.completedDays.push(dayId);
    }
    // Schedule Spaced Repetition for day's key sentences
    window.StorageManager.scheduleNextReview(state, `day_${dayId}`, true);

    // Only advance activeDay if completing current highest reached day
    if (dayId >= (state.activeDay || 1) && dayId < 30) {
      state.activeDay = dayId + 1;
    }
    state.activeStep = 0;
    state.activeSentenceIndex = 0;
    window.StorageManager.save(state);

    const savedQuiz = (state.dayQuizAnswers && state.dayQuizAnswers[dayId]) || {};
    const correctCount = Object.values(savedQuiz).filter(a => a.isCorrect).length;
    const answeredCount = Object.keys(savedQuiz).length;

    const nextDayId = dayId < 30 ? dayId + 1 : null;

    this.openModal('🎉 Баяр хүргэе!', `
      <div style="text-align: center; padding: 12px 0;">
        <img src="assets/mascot.png" alt="Монгол хүү" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 12px;">
        <h3 style="color: var(--brand-blue); margin-bottom: 8px;">${dayId}-р өдрийн хичээл амжилттай дууслаа!</h3>
        ${answeredCount > 0 ? `
          <div style="margin-bottom: 14px; display: inline-block; padding: 6px 14px; border-radius: 20px; background: ${correctCount >= 3 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)'}; color: ${correctCount >= 3 ? '#047857' : '#b91c1c'}; font-weight: 700; font-size: 14px;">
            📊 5 даалгаварт сорилын үр дүн: ${correctCount} / 5 зөв (${Math.round((correctCount / 5) * 100)}%)
          </div>
        ` : ''}
        <p style="font-size: 14px; color: var(--text-main); line-height: 1.6; margin-bottom: 20px;">
          Та ${dayId}-р өдрийн 10 үндсэн өгүүлбэрийг бүрэн судалж, сорилоо амжилттай давлаа.
          Энэ өдрийн хичээл ногоон тэмдэглэгээтэй (✓ Дууссан) боллоо.
        </p>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${nextDayId ? `
            <button class="btn-primary" style="padding: 14px 20px; font-size: 15px; font-weight: 700;" onclick="App.closeModal(); App.openDay(${nextDayId});">
              ➔ Дараагийн өдөр (${nextDayId}-р өдөр) рүү шилжих
            </button>
          ` : ''}
          ${correctCount < 5 ? `
            <button class="btn-glass" style="padding: 12px 20px; font-weight: 700; color: var(--brand-blue); border-color: rgba(37,99,235,0.4);" onclick="App.retryDayQuiz(${dayId});">
              🔄 Дахин хийх
            </button>
          ` : ''}
          <button class="btn-glass" style="padding: 12px 20px;" onclick="App.closeModal(); App.navigate('home');">
            🏠 Нүүр хуудас руу буцах
          </button>
        </div>
      </div>
    `);
  },

  retryDayQuiz(dayId) {
    this.closeModal();
    dayId = parseInt(dayId) || this.currentDayId || 1;
    const state = window.StorageManager.get();
    if (state.dayQuizAnswers && state.dayQuizAnswers[dayId]) {
      delete state.dayQuizAnswers[dayId];
      window.StorageManager.save(state);
    }
    this.currentDayId = dayId;
    this.currentStep = 5; // Step 5: 6. Сорил
    this.currentSentenceIdx = 0;
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const day = curr.find(d => d.id === dayId);
    if (day) {
      this.renderDayLesson(document.getElementById('main-content'), dayId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  // =============================================================
  // 5. REVIEW & SPACED REPETITION
  // =============================================================
  renderReview(container) {
    const state = window.StorageManager.get();
    const dueList = window.StorageManager.getDueSentences(state);

    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card">
          <span class="sentence-badge">Зайтай давталтын хуваарь</span>
          <h2 style="font-size: 20px; font-weight: 800; margin: 8px 0 4px;">📅 Давтлагын Календарь</h2>
          <p style="font-size: 13px; color: var(--text-muted);">
            Хүний ой санамжийн хуулиар 1, 3, 7, 14, 30 хоногийн давтамжтай давтсанаар мартагдахгүй тархинд хадгалагдана.
          </p>
        </div>

        <div class="glass-card">
          <h3 style="font-size: 16px; margin-bottom: 12px;">
            Өнөөдөр давтах зүйлс: <span style="color: var(--brand-blue);">${dueList.length}</span>
          </h3>
          ${dueList.length === 0 ? `
            <div style="text-align: center; padding: 24px 12px; color: var(--text-muted);">
              <div style="font-size: 36px; margin-bottom: 8px;">🌟</div>
              <p>Өнөөдрийн давтах даалгавар бүгд дууссан байна! Та маш сайн байна.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${dueList.map(item => `
                <div class="glass-card" style="padding: 12px 14px; margin-bottom: 0;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: var(--brand-blue);">${item.id}</strong>
                    <span style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(37,99,235,0.1);">Шат: ${item.level}</span>
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Дараагийн давталт: ${item.nextReviewDate}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  // =============================================================
  // 6. VOCABULARY BANK VIEW (ALL 900 SENTENCES & 1400+ WORDS)
  // =============================================================
  getAllVocabList() {
    if (this._cachedVocabList) return this._cachedVocabList;
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const list = [];
    const seen = new Set();
    curr.forEach(day => {
      (day.sentences || []).forEach(s => {
        (s.vocab || []).forEach(v => {
          const koClean = (v.ko || '').trim();
          if (!koClean) return;
          const key = `${koClean}_${v.mn}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              ko: koClean,
              mn: v.mn || '',
              ro: v.ro || '',
              dict: v.dict || koClean,
              dayId: day.id,
              dayTitle: day.title,
              sentenceKo: s.ko,
              sentenceMn: s.mn
            });
          }
        });
      });
    });
    this._cachedVocabList = list;
    return list;
  },

  getAllSentencesList() {
    if (this._cachedSentencesList) return this._cachedSentencesList;
    const curr = this.curriculum || window.CURRICULUM_DATA || [];
    const list = [];
    curr.forEach(day => {
      (day.sentences || []).forEach((s, idx) => {
        list.push({
          id: s.id,
          ko: s.ko,
          mn: s.mn,
          ro: s.ro || '',
          context: s.context || '',
          dayId: day.id,
          dayTitle: day.title,
          num: idx + 1
        });
      });
    });
    this._cachedSentencesList = list;
    return list;
  },

  renderVocab(container) {
    if (!container) container = document.getElementById('main-content');
    if (!container) return;

    if (!this.hasActiveAccess()) {
      container.innerHTML = `
        <div class="fade-in">
          <div class="glass-card" style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 54px; margin-bottom: 12px;">🔒</div>
            <span class="sentence-badge" style="background: rgba(37, 99, 235, 0.15); color: var(--brand-blue); margin-bottom: 12px; display: inline-block;">
              СОЛОНГОС ХЭЛНИЙ ҮГИЙН САН
            </span>
            <h2 style="font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
              Үгс болон өгүүлбэрийн сан түгжээтэй байна
            </h2>
            <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; max-width: 440px; margin: 0 auto 24px;">
              90 өдрийн сургалтын бүх 900 өгүүлбэр, тэдгээрийн үгийн сан болон солонгос аудио дуудлагыг ашиглахын тулд Mongolian Media-аас авсан <b>1 удаагийн нэвтрэх код</b>-оо оруулан эрхээ нээнэ үү. (Офлайн болон онлайн аль алинд нь ажиллана).
            </p>

            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button class="btn-primary" style="max-width: 280px;" onclick="App.openLoginModal()">🎟️ 1 удаагийн кодоор нээх</button>
            </div>

            <div style="background: rgba(37, 99, 235, 0.06); border: 1px dashed rgba(37, 99, 235, 0.3); border-radius: 12px; padding: 14px 18px; margin-top: 24px; font-size: 13px; text-align: left; line-height: 1.6; max-width: 440px; margin-left: auto; margin-right: auto;">
              💳 <b>Код авах данс:</b> Хаан Банк <b>5252631771</b> (Iban: 65 000 500, Н.Батцогт)<br>
              Төлбөр (49,000₮) шилжүүлсний дараа Mongolian Media танд 1 удаагийн кодоо мессенжер эсвэл утсаар өгнө. Нэг удаа код оруулснаар онлайн болон офлайн бүх горимд байнгын нээлттэй болно.
            </div>
          </div>
        </div>
      `;
      return;
    }

    const state = window.StorageManager.get();
    const bookmarked = state.bookmarkedVocab || [];
    const allVocab = this.getAllVocabList();
    const allSentences = this.getAllSentencesList();
    const curr = this.curriculum || window.CURRICULUM_DATA || [];

    const activeTab = this.vocabTab || 'all';
    const query = (this.vocabSearchQuery || '').trim().toLowerCase();
    const dayFilter = this.vocabDayFilter || 'all';

    let filteredVocab = allVocab;
    if (dayFilter !== 'all') {
      const dId = parseInt(dayFilter);
      filteredVocab = filteredVocab.filter(v => v.dayId === dId);
    }
    if (query) {
      filteredVocab = filteredVocab.filter(v => 
        v.ko.toLowerCase().includes(query) || 
        v.mn.toLowerCase().includes(query) || 
        (v.ro && v.ro.toLowerCase().includes(query)) ||
        (v.sentenceKo && v.sentenceKo.toLowerCase().includes(query))
      );
    }

    let filteredSentences = allSentences;
    if (dayFilter !== 'all') {
      const dId = parseInt(dayFilter);
      filteredSentences = filteredSentences.filter(s => s.dayId === dId);
    }
    if (query) {
      filteredSentences = filteredSentences.filter(s =>
        s.ko.toLowerCase().includes(query) ||
        s.mn.toLowerCase().includes(query) ||
        (s.ro && s.ro.toLowerCase().includes(query))
      );
    }

    let filteredBookmarked = bookmarked;
    if (query) {
      filteredBookmarked = filteredBookmarked.filter(v =>
        v.ko.toLowerCase().includes(query) ||
        (v.mn && v.mn.toLowerCase().includes(query)) ||
        (v.ro && v.ro.toLowerCase().includes(query))
      );
    }

    const limit = this.vocabLimit || 60;
    const isFiltered = dayFilter !== 'all' || query.length > 0;
    const vocabToRender = isFiltered ? filteredVocab : filteredVocab.slice(0, limit);
    const sentencesToRender = isFiltered ? filteredSentences : filteredSentences.slice(0, limit);

    container.innerHTML = `
      <div class="fade-in">
        <!-- Header Card -->
        <div class="glass-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="sentence-badge">Солонгос хэлний үгийн сан</span>
            <span style="font-size: 12px; font-weight: 700; color: var(--brand-blue);">90 өдөр • 900 өгүүлбэр</span>
          </div>
          <h2 style="font-size: 20px; font-weight: 800; margin: 6px 0 4px;">📚 900 Өгүүлбэрийн Нийт Үгийн Сан</h2>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">
            Хичээлийн бүх 900 өгүүлбэрт орсон бодит амьдралын үг хэллэгүүд. Үг бүрийн ард байрлах <b>🔊 Сонсох</b> товчийг дарж солонгос дуудлагыг нь сонсоорой.
          </p>

          <!-- Tab Navigation -->
          <div class="segmented-pills" style="margin-top: 14px; margin-bottom: 12px; overflow-x: auto;">
            <button class="pill-btn ${activeTab === 'all' ? 'active' : ''}" onclick="App.switchVocabTab('all')">
              📚 Үгс (${allVocab.length})
            </button>
            <button class="pill-btn ${activeTab === 'sentences' ? 'active' : ''}" onclick="App.switchVocabTab('sentences')">
              💬 Өгүүлбэр (${allSentences.length})
            </button>
            <button class="pill-btn ${activeTab === 'bookmarked' ? 'active' : ''}" onclick="App.switchVocabTab('bookmarked')">
              ⭐ Хадгалсан (${bookmarked.length})
            </button>
          </div>

          <!-- Search Input -->
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <input 
              type="text" 
              id="vocab-search-input" 
              placeholder="🔍 Үг, өгүүлбэр эсвэл монгол утгаар хайх..." 
              value="${this.vocabSearchQuery || ''}"
              oninput="App.onVocabSearch(this.value)"
              style="width: 100%; padding: 12px 16px; border-radius: var(--radius-pill); border: 1.5px solid var(--glass-border); background: rgba(255,255,255,0.7); font-size: 14px; outline: none; box-sizing: border-box;"
            />
          </div>

          <!-- Day Filter Dropdown -->
          ${activeTab !== 'bookmarked' ? `
            <div style="display: flex; align-items: center; gap: 8px; width: 100%; max-width: 100%; min-width: 0;">
              <label for="vocab-day-select" style="font-size: 12px; font-weight: 700; color: var(--text-muted); white-space: nowrap;">Өдрөөр шүүх:</label>
              <select id="vocab-day-select" onchange="App.onVocabDayFilter(this.value)" style="flex: 1; min-width: 0; width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600; color: var(--text-main); outline: none;">
                <option value="all" ${dayFilter === 'all' ? 'selected' : ''}>Бүх 90 өдрийн хичээл</option>
                ${curr.map(d => `<option value="${d.id}" ${dayFilter == d.id ? 'selected' : ''}>${d.id}-р өдөр: ${d.title}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        <!-- Tab 1: All Vocabulary Words -->
        ${activeTab === 'all' ? `
          <div style="margin-bottom: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); padding: 0 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>Илэрц: <span style="color: var(--brand-blue);">${filteredVocab.length}</span> үг олдлоо</span>
            ${!isFiltered && filteredVocab.length > vocabToRender.length ? `<span style="font-size: 11px; color: var(--text-light);">(Эхний ${vocabToRender.length}-г харуулж байна)</span>` : ''}
          </div>
          ${vocabToRender.length === 0 ? `
            <div class="glass-card" style="text-align: center; padding: 36px 16px;">
              <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
              <p style="color: var(--text-muted);">Таны хайсан илэрц олдсонгүй.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${vocabToRender.map(v => {
                const isBookmarked = window.StorageManager.isVocabBookmarked(state, v.ko);
                return `
                  <div class="glass-card" style="padding: 14px 16px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-radius: 14px;">
                    <div style="flex: 1; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px; flex-wrap: wrap;">
                        <span style="font-family: var(--font-korean); font-size: 18px; font-weight: 800; color: var(--text-main);">${v.ko}</span>
                        <span style="font-size: 10px; padding: 2px 7px; border-radius: 8px; background: rgba(37,99,235,0.08); color: var(--brand-blue); font-weight: 700;">${v.dayId}-р өдөр</span>
                      </div>
                      <div style="font-size: 14px; font-weight: 700; color: var(--brand-blue); margin-bottom: 2px;">${v.mn}</div>
                      <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">[${v.ro}]</div>
                      ${v.sentenceKo ? `
                        <div style="font-size: 11px; color: var(--text-light); margin-top: 5px; padding-top: 4px; border-top: 1px dashed var(--border-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          <span style="color: var(--text-muted);">Өгүүлбэр:</span> <span style="font-family: var(--font-korean);">${v.sentenceKo}</span>
                        </div>
                      ` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="quiz-audio-btn" type="button" title="Дуудлага сонсох" data-ko="${v.ko.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                        🔊
                      </button>
                      <button class="icon-btn" style="width: 38px; height: 38px; font-size: 15px;" title="${isBookmarked ? 'Хадгалснаас хасах' : 'Хадгалах'}" data-ko="${v.ko.replaceAll('"', '&quot;')}" data-mn="${v.mn.replaceAll('"', '&quot;')}" data-ro="${v.ro.replaceAll('"', '&quot;')}" data-tip="${(v.sentenceKo || '').replaceAll('"', '&quot;')}" onclick="App.toggleVocabCardBookmark(this.getAttribute('data-ko'), this.getAttribute('data-mn'), this.getAttribute('data-ro'), this.getAttribute('data-tip'))">
                        ${isBookmarked ? '⭐' : '☆'}
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${!isFiltered && filteredVocab.length > vocabToRender.length ? `
              <div style="text-align: center; margin: 18px 0 10px;">
                <button class="btn-primary" onclick="App.loadMoreVocab()" style="width: auto; padding: 12px 28px; font-size: 14px; font-weight: 700; border-radius: 9999px;">
                  Цааш үзэх (+60 үг нэмэх) ➔
                </button>
              </div>
            ` : ''}
          `}
        ` : ''}

        <!-- Tab 2: 900 Full Sentences -->
        ${activeTab === 'sentences' ? `
          <div style="margin-bottom: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); padding: 0 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>Илэрц: <span style="color: var(--brand-blue);">${filteredSentences.length}</span> өгүүлбэр олдлоо</span>
            ${!isFiltered && filteredSentences.length > sentencesToRender.length ? `<span style="font-size: 11px; color: var(--text-light);">(Эхний ${sentencesToRender.length}-г харуулж байна)</span>` : ''}
          </div>
          ${sentencesToRender.length === 0 ? `
            <div class="glass-card" style="text-align: center; padding: 36px 16px;">
              <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
              <p style="color: var(--text-muted);">Таны хайсан өгүүлбэр олдсонгүй.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${sentencesToRender.map(s => {
                const isBookmarked = window.StorageManager.isVocabBookmarked(state, s.ko);
                return `
                  <div class="glass-card" style="padding: 14px 16px; margin-bottom: 0; border-radius: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                      <span style="font-size: 11px; padding: 2px 8px; border-radius: 8px; background: rgba(37,99,235,0.08); color: var(--brand-blue); font-weight: 700;">${s.dayId}-р өдөр • ${s.num}-р өгүүлбэр</span>
                      <button class="icon-btn" style="width: 32px; height: 32px; font-size: 14px;" onclick="App.toggleSentenceBookmark('${s.id}')">
                        ${isBookmarked ? '⭐' : '☆'}
                      </button>
                    </div>
                    <div style="font-family: var(--font-korean); font-size: 17px; font-weight: 800; color: var(--text-main); margin-bottom: 3px;">${s.ko}</div>
                    <div style="font-size: 14px; font-weight: 600; color: var(--brand-blue); margin-bottom: 3px;">${s.mn}</div>
                    <div style="font-size: 12px; color: var(--text-muted); font-style: italic; margin-bottom: 10px;">Ойролцоо дуудлага: ${s.ro}</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                      <button class="btn-glass" style="padding: 5px 14px; font-size: 12px;" data-ko="${s.ko.replaceAll('"', '&quot;')}" onclick="window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                        🔊 Сонсох
                      </button>
                      <button class="btn-glass" style="padding: 5px 14px; font-size: 12px;" data-ko="${s.ko.replaceAll('"', '&quot;')}" onclick="window.SpeechEngine.speakSlow(this.getAttribute('data-ko'))">
                        🐢 Удаанаар (0.72x)
                      </button>
                      <button class="btn-glass" style="padding: 5px 14px; font-size: 12px;" onclick="App.openDay(${s.dayId})">
                        📖 Хичээл рүү очих ➔
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${!isFiltered && filteredSentences.length > sentencesToRender.length ? `
              <div style="text-align: center; margin: 18px 0 10px;">
                <button class="btn-primary" onclick="App.loadMoreVocab()" style="width: auto; padding: 12px 28px; font-size: 14px; font-weight: 700; border-radius: 9999px;">
                  Цааш үзэх (+60 өгүүлбэр нэмэх) ➔
                </button>
              </div>
            ` : ''}
          `}
        ` : ''}

        <!-- Tab 3: Bookmarked Items -->
        ${activeTab === 'bookmarked' ? `
          <div style="margin-bottom: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); padding: 0 4px;">
            Нийт хадгалсан: <span style="color: var(--brand-blue);">${filteredBookmarked.length}</span> зүйл
          </div>
          ${filteredBookmarked.length === 0 ? `
            <div class="glass-card" style="text-align: center; padding: 36px 16px;">
              <div style="font-size: 38px; margin-bottom: 8px;">📖</div>
              <p style="color: var(--text-muted);">Одоогоор хадгалсан үг байхгүй байна.</p>
              <p style="font-size: 12px; color: var(--text-light); margin-top: 4px;">Та хичээл болон үгийн сан дээрх од (☆) дээр дарж үгээ энд цуглуулан тусад нь давтаж болно.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${filteredBookmarked.map(v => `
                <div class="glass-card" style="padding: 14px 18px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; border-radius: 14px;">
                  <div style="flex: 1;">
                    <div style="font-family: var(--font-korean); font-size: 18px; font-weight: 800; color: var(--text-main);">${v.ko}</div>
                    <div style="font-size: 14px; font-weight: 600; color: var(--brand-blue);">${v.mn}</div>
                    <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">${v.ro || ''}</div>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="quiz-audio-btn" type="button" title="Дуудлага сонсох" data-ko="${v.ko.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                      🔊
                    </button>
                    <button class="icon-btn" style="width: 36px; height: 36px;" title="Хадгалснаас хасах" data-ko="${v.ko.replaceAll('"', '&quot;')}" onclick="App.removeBookmark(this.getAttribute('data-ko'))">
                      ✕
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        ` : ''}
      </div>
    `;
  },

  vocabLimit: 60,

  loadMoreVocab() {
    this.vocabLimit = (this.vocabLimit || 60) + 60;
    this.renderVocab(document.getElementById('main-content'));
  },

  switchVocabTab(tabName) {
    this.vocabTab = tabName;
    this.vocabLimit = 60;
    this.renderVocab(document.getElementById('main-content'));
  },

  onVocabSearch(query) {
    this.vocabSearchQuery = query;
    this.vocabLimit = 60;
    this.renderVocab(document.getElementById('main-content'));
    const input = document.getElementById('vocab-search-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  },

  onVocabDayFilter(dayId) {
    this.vocabDayFilter = dayId;
    this.vocabLimit = 60;
    this.renderVocab(document.getElementById('main-content'));
  },

  toggleVocabCardBookmark(ko, mn, ro, tip) {
    const state = window.StorageManager.get();
    window.StorageManager.toggleBookmarkVocab(state, {
      id: `vocab_${ko}`,
      ko,
      mn,
      ro,
      tip: tip || ''
    });
    window.StorageManager.save(state);
    this.renderVocab(document.getElementById('main-content'));
  },

  removeBookmark(koText) {
    const state = window.StorageManager.get();
    state.bookmarkedVocab = (state.bookmarkedVocab || []).filter(v => v.ko !== koText);
    window.StorageManager.save(state);
    this.renderVocab(document.getElementById('main-content'));
  },

  // =============================================================
  // 7. PROFILE & SETTINGS VIEW
  // =============================================================
  renderProfile(container) {
    const state = window.StorageManager.get();
    const user = this.userProfile;

    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card">
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
            <img src="assets/mascot.png" alt="Avatar" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover;">
            <div>
              <strong style="font-size: 17px; display: block;">${user ? user.name : 'Зочин суралцагч'}</strong>
              <span style="font-size: 13px; color: var(--text-muted);">${user ? user.email : 'Бүртгэлгүй'}</span>
            </div>
          </div>

          ${user ? `
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span class="sentence-badge" style="background: #10b981; color: #fff;">
                ✅ Идэвхтэй эрх (90 өдөр нээлттэй)
              </span>
              ${user.role === 'admin' ? `
                <span class="sentence-badge" style="background: var(--brand-blue); color: #fff;">👑 Системийн админ (Эзэн)</span>
                <button class="btn-primary" style="margin-top: 10px; width: 100%;" onclick="App.navigate('admin')">👑 Админ удирдлагын самбар руу орох</button>
              ` : ''}
            </div>
          ` : `
            <button class="btn-primary" onclick="App.openLoginModal()">🎟️ 1 удаагийн кодоор нэвтрэх</button>
          `}
        </div>

        <!-- Settings block -->
        <div class="glass-card">
          <h4 style="margin-bottom: 14px;">⚙️ Тохиргоо</h4>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 14px;">Кирилл галиг харуулах:</span>
            <input type="checkbox" ${state.settings.showGalig !== false ? 'checked' : ''} onchange="App.toggleGaligSetting(this.checked)">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 14px;">Дуу хоолойн хурд:</span>
            <select class="form-input" style="width: auto; padding: 4px 8px;" onchange="App.setSpeechRate(this.value)">
              <option value="0.75" ${state.settings.speechRate === 0.75 ? 'selected' : ''}>0.75x (Удаан)</option>
              <option value="0.9" ${state.settings.speechRate === 0.9 ? 'selected' : ''}>0.9x (Хэвийн)</option>
              <option value="1.0" ${state.settings.speechRate === 1.0 ? 'selected' : ''}>1.0x (Төрөлх)</option>
            </select>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 14px;">Аудио шалгах:</span>
            <button class="btn-primary" style="width: auto; padding: 6px 16px; font-size: 13px;" onclick="window.SpeechEngine.speak('안녕하세요! 반갑습니다.')">
              🔊 Дуу шалгах (Тест)
            </button>
          </div>

          <div style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--brand-orange); padding: 10px 14px; border-radius: 4px; font-size: 12px; line-height: 1.5; margin-bottom: 16px;">
            <b>💡 iPhone дээр дуу гарахгүй бол:</b> Утасныхаа зүүн талын <b>Дуу хаагч (Silent switch / улбар шар өнгөтэй товч)</b>-ийг нээж, хажуугийн товчоор дуугаа чангална уу.
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px;">
            <button class="btn-glass" onclick="window.StorageManager.exportBackup()">📥 Ахицыг JSON татах</button>
            <button class="btn-glass" onclick="App.promptImportBackup()">📤 Ахиц сэргээх</button>
          </div>
        </div>

        <div class="glass-card" style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.openFacebook(event)">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: #1877F2; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <strong style="font-size: 14px; display: block;">СОЛОНГОС ХЭЛНИЙ АПП Facebook</strong>
              <span style="font-size: 12px; color: var(--text-muted);">Албан ёсны Facebook хуудсаар холбогдох</span>
            </div>
          </div>
          <span style="font-size: 16px; color: #1877F2;">➔</span>
        </div>

        ${user && user.role === 'admin' ? `
          <div class="glass-card" style="border: 2px solid var(--brand-blue); cursor: pointer;" onclick="App.navigate('admin')">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: var(--brand-blue); font-size: 16px;">🛡️ Эзний Удирдлагын Самбар</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Хэрэглэгчид, төлбөр, урилга, төхөөрөмж хянах</p>
              </div>
              <span style="font-size: 20px; color: var(--brand-blue);">➔</span>
            </div>
          </div>
        ` : ''}

        ${user ? `
          <div style="text-align: center; margin-top: 16px;">
            <button class="btn-glass" style="color: #ef4444;" onclick="App.handleLogout()">Гарах (Logout)</button>
          </div>
        ` : ''}
      </div>
    `;
  },

  toggleGaligSetting(val) {
    const state = window.StorageManager.get();
    state.settings.showGalig = val;
    window.StorageManager.save(state);
  },

  setSpeechRate(val) {
    const state = window.StorageManager.get();
    state.settings.speechRate = parseFloat(val);
    window.StorageManager.save(state);
    window.SpeechEngine.defaultRate = parseFloat(val);
  },

  async handleLogout() {
    await window.API.logout();
    this.userProfile = null;
    this.navigate('home');
  },

  promptImportBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const res = window.StorageManager.importBackup(event.target.result);
        alert(res.message);
        if (res.success) this.navigate('profile');
      };
      reader.readAsText(file);
    };
    input.click();
  },

  async submitProfileCode() {
    const input = document.getElementById('profile-access-code');
    const code = input ? input.value.trim().toUpperCase() : '';
    if (!code) {
      alert('1 удаагийн нэвтрэх кодоо оруулна уу.');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('Код баталгаажуулахад интернэт шаардлагатай. Та интернэт холболтоо шалгаад дахин оролдоно уу.');
      return;
    }
    const btn = document.querySelector('button[onclick="App.submitProfileCode()"]');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Холбогдож байна...';
    }
    try {
      const res = await window.API.codeLogin('Суралцагч', code);
      if (res.ok) {
        await this.checkAuth();
        alert('🎉 90 өдрийн хичээлийн эрх амжилттай нээгдлээ!');
        this.navigate('lessons-list');
      } else {
        if (!navigator.onLine || res.status === 0 || (res.data && res.data.error === 'network_error')) {
          alert('Код баталгаажуулахад интернэт шаардлагатай. Та интернэт холболтоо шалгаад дахин оролдоно уу.');
          return;
        }
        alert(res.data.message || 'Код буруу байна.');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '🚀 Сургалтын эрх нээх';
      }
    }
  },

  async submitInviteCode() {
    const input = document.getElementById('invite-code-input');
    const token = input ? input.value.trim() : '';
    if (!token) {
      alert('Урилгын кодыг оруулна уу.');
      return;
    }

    const res = await window.API.redeemInvite(token);
    alert(res.data.message || (res.ok ? 'Урилга амжилттай!' : 'Алдаа'));
    if (res.ok) {
      await this.checkAuth();
      this.navigate('profile');
    }
  },

  // =============================================================
  // 8. ADMIN DASHBOARD (For "Mongolian Media")
  // =============================================================
  async renderAdmin(container) {
    if (!this.userProfile || this.userProfile.role !== 'admin') {
      container.innerHTML = `
        <div class="glass-card fade-in" style="text-align: center; padding: 40px 16px;">
          <h3 style="color: #ef4444;">⛔ Хандах эрхгүй байна</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">Энэ хэсэгт зөвхөн Mongolian Media системийн админ нэвтрэх эрхтэй.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="fade-in">
        <div class="glass-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <button class="btn-glass" onclick="App.navigate('profile')">← Буцах</button>
            <span class="sentence-badge" style="background: #2563eb; color: #fff;">Админ: Mongolian Media</span>
          </div>
          <h2 style="font-size: 20px; font-weight: 800;">🛡️ MONGOLIAN MEDIA — Удирдлагын Самбар</h2>
          <p style="font-size: 13px; color: var(--text-muted);">Хэрэглэгчид, төлбөр баталгаажуулалт, урилга үүсгэх төв.</p>
        </div>

        <!-- Admin Navigation Pills -->
        <div class="segmented-pills" id="admin-subtabs">
          <button class="pill-btn active" onclick="App.switchAdminSubtab('invites')">🎟️ Нэвтрэх кодууд</button>
          <button class="pill-btn" onclick="App.switchAdminSubtab('users')">👥 Суралцагчид</button>
          <button class="pill-btn" onclick="App.switchAdminSubtab('notifs')">🔔 Мэдэгдэл</button>
          <button class="pill-btn" onclick="App.switchAdminSubtab('audit')">📜 Түүх</button>
        </div>

        <div id="admin-content-area"></div>
      </div>
    `;

    this.switchAdminSubtab('invites');
  },

  async switchAdminSubtab(tabKey) {
    document.querySelectorAll('#admin-subtabs .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabKey));
    });

    const area = document.getElementById('admin-content-area');
    if (!area) return;

    if (tabKey === 'users') {
      area.innerHTML = `<p style="padding: 16px;">Хэрэглэгчдийг уншиж байна...</p>`;
      const res = await window.API.adminGetUsers('all');
      const users = (res.ok && res.data.users) || [];

      area.innerHTML = `
        <div class="fade-in">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 14px;">Нийт хэрэглэгчид: ${users.length}</strong>
            <button class="btn-glass" onclick="App.openCreateInviteModal()">➕ 1 Удаагийн урилга үүсгэх</button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${users.map(u => `
              <div class="glass-card" style="padding: 14px 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <strong style="font-size: 15px;">${u.name}</strong>
                    <div style="font-size: 13px; color: var(--brand-blue);">${u.email}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                      Төхөөрөмж: ${u.device_name || 'Мэдэгдээгүй'} | Зөвшөөрөл: ${u.device_approved ? '✅' : '⏳ Хүлээгдэж буй'}
                    </div>
                  </div>
                  <span class="sentence-badge" style="background: ${u.status === 'active' ? '#10b981' : '#f59e0b'}; color: #fff;">
                    ${u.status === 'active' ? 'Идэвхтэй' : 'Төлбөр хүлээгдэж буй'}
                  </span>
                </div>

                ${u.reference_no ? `
                  <div style="background: rgba(255,255,255,0.4); padding: 8px 12px; border-radius: 8px; margin: 8px 0; font-size: 12px;">
                    <b>Төлбөрийн лавлагаа:</b> ${u.reference_no} (${u.amount || '49,000'}₮)<br>
                    <b>Тэмдэглэл:</b> ${u.receipt_notes || 'Байхгүй'}
                  </div>
                ` : ''}

                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
                  ${u.status !== 'active' ? `
                    <button class="btn-glass" style="background: #10b981; color: #fff;" onclick="App.adminApproveUserPayment(${u.id})">
                      ✅ Төлбөр батлах (Эрх нээх)
                    </button>
                  ` : `
                    <button class="btn-glass" style="color: #f59e0b;" onclick="App.adminToggleUser(${u.id}, 'suspended')">
                      ⏸️ Түр хаах
                    </button>
                  `}
                  <button class="btn-glass" onclick="App.adminApproveUserDevice(${u.id})">📱 Төхөөрөмж батлах</button>
                  <button class="btn-glass" style="color: #ef4444;" onclick="App.adminDeleteUserPrompt(${u.id}, '${u.email}')">Устгах</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (tabKey === 'invites') {
      area.innerHTML = `<p style="padding: 16px;">Нэвтрэх кодуудыг уншиж байна...</p>`;
      const res = await window.API.adminGetInvites();
      const list = (res.ok && res.data.invites) || [];

      area.innerHTML = `
        <div class="fade-in">
          <div style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: space-between; align-items: center;">
            <div style="font-size: 14px; font-weight: 700;">🎟️ Суралцагчийн 1 удаагийн нэвтрэх кодууд (${list.length})</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-primary" style="width: auto; padding: 8px 14px; font-size: 13px;" onclick="App.adminQuickGenerateCode(1)">➕ 1 шинэ код</button>
              <button class="btn-glass" style="width: auto; padding: 8px 14px; font-size: 13px;" onclick="App.adminQuickGenerateCode(5)">➕ 5 шинэ код</button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${list.length === 0 ? `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Одоогоор код үүсгээгүй байна. Дээрх товчийг дарж шинэ код үүсгэнэ үү.</div>` : ''}
            ${list.map(inv => `
              <div class="glass-card" style="padding: 14px 16px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px; font-weight: 900; letter-spacing: 2px; color: var(--brand-blue);">${inv.code}</span>
                    <button class="btn-glass" style="padding: 4px 10px; font-size: 11px;" onclick="App.copyInviteCode('${inv.code}')" title="Хуулах">📋 Хуулах</button>
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                    ${inv.is_used 
                      ? `<span style="color: #64748b;">👤 Ашигласан суралцагч: <b>${inv.student_name || 'Суралцагч'}</b> (${inv.used_at ? new Date(inv.used_at * 1000).toLocaleDateString() : 'Ашиглагдсан'})</span>`
                      : `<span style="color: #10b981; font-weight: 600;">✅ Бэлэн (Суралцагчид өгөхөд бэлэн)</span>`
                    }
                  </div>
                </div>
                <div>
                  <span class="sentence-badge" style="background: ${inv.is_used ? '#64748b' : '#10b981'}; color: #fff; margin-right: 6px;">
                    ${inv.is_used ? 'Ашиглагдсан' : 'Хүчинтэй'}
                  </span>
                  ${!inv.is_used ? `
                    <button class="btn-glass" style="color: #ef4444; padding: 4px 8px; font-size: 11px;" onclick="App.adminDeleteCodePrompt(${inv.id})">Устгах</button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (tabKey === 'notifs') {
      area.innerHTML = `<p style="padding: 16px;">Мэдэгдлүүдийг уншиж байна...</p>`;
      const res = await window.API.adminGetNotifications();
      const notifs = (res.ok && res.data.notifications) || [];

      area.innerHTML = `
        <div class="fade-in" style="display: flex; flex-direction: column; gap: 8px;">
          ${notifs.map(n => `
            <div class="glass-card" style="padding: 12px 14px; margin-bottom: 0;">
              <strong style="color: var(--brand-blue);">${n.title}</strong>
              <p style="font-size: 13px; margin: 4px 0;">${n.message}</p>
              <span style="font-size: 11px; color: var(--text-muted);">${new Date(n.created_at * 1000).toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tabKey === 'audit') {
      area.innerHTML = `<p style="padding: 16px;">Түүхийг уншиж байна...</p>`;
      const res = await window.API.adminGetAuditLogs();
      const logs = (res.ok && res.data.logs) || [];

      area.innerHTML = `
        <div class="fade-in" style="display: flex; flex-direction: column; gap: 6px;">
          ${logs.map(l => `
            <div style="background: var(--glass-bg); padding: 8px 12px; border-radius: 8px; font-size: 12px; border: 1px solid var(--glass-border);">
              <b>[${l.action}]</b> by ${l.actor} ➔ ${l.target} (${l.details || ''})
              <span style="float: right; color: var(--text-muted);">${new Date(l.timestamp * 1000).toLocaleTimeString()}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  },

  async adminApproveUserPayment(userId) {
    if (!confirm('Энэ хэрэглэгчийн төлбөрийг баталж, сургалтын эрхийг нээх үү?')) return;
    const res = await window.API.adminApprovePayment(userId);
    alert(res.data.message || 'Амжилттай');
    this.switchAdminSubtab('users');
  },

  async adminToggleUser(userId, status) {
    const res = await window.API.adminToggleStatus(userId, status);
    alert(res.data.message || 'Амжилттай');
    this.switchAdminSubtab('users');
  },

  async adminApproveUserDevice(userId) {
    const res = await window.API.adminApproveDevice(userId);
    alert(res.data.message || 'Төхөөрөмж баталгаажлаа');
    this.switchAdminSubtab('users');
  },

  async adminDeleteUserPrompt(userId, email) {
    if (!confirm(`Анхаар! ${email} хэрэглэгчийн бүх мэдээлэл, явцыг бүрмөсөн устгах уу?`)) return;
    const res = await window.API.adminDeleteUser(userId);
    alert(res.data.message || 'Устгагдлаа');
    this.switchAdminSubtab('users');
  },

  copyInviteCode(code) {
    const origin = window.location.origin || 'https://korean-app-ny1w.onrender.com';
    const textToCopy = `Сайн байна уу? "MONGOLIAN MEDIA" Солонгос хэлний 90 өдрийн сургалтын системд тавтай морил! 🇲🇳🇰🇷\n\n📲 1. Апп холбоос:\n${origin}/\n\n🎟️ 2. Таны 1 удаагийн 6 оронтой нэвтрэх код:\n${code}\n\n📝 3. Нэвтрэх заавар:\n• Дээрх холбоосоор орно.\n• Өөрийн нэр болон энэхүү 6 оронтой тоон кодоо оруулж нэвтэрнэ.\n• Нэвтэрсний дараа "Дэлгэцэнд нэмэх" (Add to Home Screen) хийж суулгавал интернетгүй оффлайн үед ч шууд ажиллана!`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`📋 Бэлэн мессеж санах ойд хуулагдлаа!\n\nХолбоос: ${origin}/\n6 оронтой код: ${code}\n\nТа одоо чат руугаа ороод шууд Paste (Ctrl+V) хийгээд илгээж болно.`);
      }).catch(() => {
        prompt("Мессежийг хуулж авна уу:", textToCopy);
      });
    } else {
      prompt("Мессежийг хуулж авна уу:", textToCopy);
    }
  },

  async adminQuickGenerateCode(count = 1) {
    const res = await window.API.adminCreateCode(count);
    if (res.ok) {
      alert(res.data.message || 'Амжилттай үүсгэгдлээ');
      this.switchAdminSubtab('invites');
    } else {
      alert(res.data.message || 'Алдаа гарлаа');
    }
  },

  async adminDeleteCodePrompt(codeId) {
    if (!confirm('Энэ нэвтрэх кодыг устгах уу?')) return;
    const res = await window.API.adminDeleteCode(codeId);
    if (res.ok) {
      this.switchAdminSubtab('invites');
    } else {
      alert(res.data.message || 'Алдаа гарлаа');
    }
  },

  openCreateInviteModal() {
    this.openModal('🎟️ 1 Удаагийн Хувийн Урилга Үүсгэх', `
      <div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
          Энэхүү урилга нь зөвхөн заасан имэйл хаягт зориулагдсан бөгөөд нэг удаа идэвхжсэний дараа автоматаар хүчингүй болно.
        </p>
        <div class="form-group">
          <label class="form-label">Суралцагчийн имэйл хаяг:</label>
          <input type="email" id="modal-invite-email" class="form-input" placeholder="student@example.com">
        </div>
        <button class="btn-primary" onclick="App.submitCreateInvite()">Урилгын холбоос үүсгэх</button>
        <div id="invite-result-area" style="margin-top: 14px; display: none;"></div>
      </div>
    `);
  },

  async submitCreateInvite() {
    const emailInput = document.getElementById('modal-invite-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
      alert('Имэйл хаягаа оруулна уу.');
      return;
    }

    const res = await window.API.adminCreateInvite(email);
    const area = document.getElementById('invite-result-area');
    if (!area) return;

    area.style.display = 'block';
    if (res.ok && res.data.invite_token) {
      const inviteCode = res.data.invite_token;
      area.innerHTML = `
        <div style="background: rgba(16,185,129,0.1); border: 1px solid #10b981; border-radius: 12px; padding: 12px;">
          <strong style="color: #10b981;">Урилгын код үүсгэгдлээ:</strong>
          <div style="background: #fff; padding: 8px; border-radius: 8px; font-family: monospace; font-size: 14px; margin: 6px 0; word-break: break-all;">
            ${inviteCode}
          </div>
          <span style="font-size: 11px; color: var(--text-muted);">Энэ кодыг ${email} суралцагчдаа дамжуулж өгнө үү.</span>
        </div>
      `;
    } else {
      area.innerHTML = `<p style="color: #ef4444;">Алдаа: ${res.data.message || 'Урилга үүсгэж чадсангүй'}</p>`;
    }
  },

  // =============================================================
  // MODALS & HELPERS
  // =============================================================
  openLoginModal(customTitle, customHeaderHtml) {
    this.openModal(customTitle || '🎟️ Суралцагчийн нэвтрэлт', `
      <div>
        ${customHeaderHtml || ''}
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.6;">
          Та өөрийн нэр болон Mongolian Media-аас авсан <b>1 удаагийн нэвтрэх код</b>-оо оруулан шууд хичээлээ эхлүүлнэ үү.
        </p>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">👤 Таны нэр:</label>
          <input type="text" id="login-student-name" class="form-input" placeholder="Жишээ: Бат, Сараа" value="" autofocus>
        </div>

        <div class="form-group" style="margin-bottom: 18px;">
          <label class="form-label">🔑 1 удаагийн 6 оронтой нэвтрэх код:</label>
          <input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="login-access-code" class="form-input" placeholder="••••••" style="font-weight: 800; letter-spacing: 6px; font-size: 24px; text-align: center;">
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">
            *(Хэрэв танд нэвтрэх код байхгүй бол сургалтын төлбөрөө шилжүүлэн Mongolian Media-аас 6 оронтой тоон кодоо авна уу).*
          </span>
        </div>

        <button class="btn-primary" style="padding: 13px 18px; font-size: 15px; font-weight: 700;" onclick="App.submitCodeLogin()">Нэвтрэх ба Хичээл эхлэх ➔</button>

        <div style="background: rgba(37, 99, 235, 0.06); border: 1px dashed rgba(37, 99, 235, 0.3); border-radius: 10px; padding: 10px 12px; margin-top: 14px; font-size: 12px; text-align: left; line-height: 1.5;">
          💳 <b>Код авах данс:</b> Хаан Банк <b>5252631771</b> (Iban: 65 000 500, Н.Батцогт)<br>
          Төлбөр (49,000₮) шилжүүлсний дараа Mongolian Media танд 1 удаагийн кодоо мессенжер эсвэл утсаар өгнө.
        </div>

        <div style="text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px dashed var(--border-light);">
          <a href="javascript:void(0)" style="font-size: 11px; color: var(--text-muted); text-decoration: underline;" onclick="App.openAdminPasswordModal()">
            🔒 Системийн админ нэвтрэх (Mongolian Media)
          </a>
        </div>
      </div>
    `);
  },

  async submitCodeLogin() {
    const nameInput = document.getElementById('login-student-name');
    const codeInput = document.getElementById('login-access-code');
    const submitBtn = document.querySelector('#modal-container button.btn-primary');
    const name = nameInput ? nameInput.value.trim() : '';
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';

    if (!name) {
      alert('Та өөрийн нэрээ оруулна уу.');
      if (nameInput) nameInput.focus();
      return;
    }

    if (!code) {
      alert('Mongolian Media-аас авсан 1 удаагийн нэвтрэх кодоо оруулна уу.');
      if (codeInput) codeInput.focus();
      return;
    }

    const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine);

    const activateOfflineCode = async () => {
      const salt = 'mm_sec_entitlement_v64_salt_prod_90d';
      const expiresAt = Math.floor(Date.now() / 1000) + (90 * 86400);
      const studentProfile = {
        id: 1001,
        name: name,
        email: `${code.toLowerCase()}@offline.student`,
        role: 'student',
        status: 'active'
      };
      const payload = `${studentProfile.id}:${studentProfile.email}:${studentProfile.role}:active:${expiresAt}:${salt}`;
      const enc = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(payload));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const entitlement = {
        user_id: studentProfile.id,
        email: studentProfile.email,
        role: studentProfile.role,
        status: 'active',
        expires_at: expiresAt,
        signature: signature
      };
      localStorage.setItem('mm_user_profile', JSON.stringify(studentProfile));
      localStorage.setItem('mm_entitlement', JSON.stringify(entitlement));
      this.userProfile = studentProfile;
      this._isEntitlementVerified = true;
      this.closeModal();
      alert(`🎉 Баяр хүргэе, ${name}! Нэвтрэх эрх амжилттай баталгаажлаа.`);
      const container = document.getElementById('main-content');
      if (this.currentView === 'alphabet') this.renderAlphabet(container);
      else if (this.currentView === 'numbers') this.renderNumbersLesson(container);
      else if (this.currentView === 'vocab') this.renderVocab(container);
      else if (this.currentView && this.currentView.startsWith('day-')) this.renderDayLesson(container, this.currentDayId || 1);
      else this.navigate(this.currentView || 'lessons-list');
    };

    if (isOffline) {
      if (code === '032310') {
        await activateOfflineCode();
        return;
      } else {
        alert('Офлайн горимд зөвхөн баталгаажсан код ажиллана. Та интернэт холболтоо шалгаад дахин оролдоно уу.');
        return;
      }
    }

    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Сервер холбогдож байна...';
    }

    try {
      const res = await window.API.codeLogin(name, code);
      if (res.ok && res.data.user) {
        this.closeModal();
        await this.checkAuth();
        alert(`🎉 Баяр хүргэе, ${name}! 90 өдрийн хичээл амжилттай нээгдлээ.`);
        const container = document.getElementById('main-content');
        if (this.currentView === 'alphabet') this.renderAlphabet(container);
        else if (this.currentView === 'numbers') this.renderNumbersLesson(container);
        else if (this.currentView === 'vocab') this.renderVocab(container);
        else if (this.currentView && this.currentView.startsWith('day-')) this.renderDayLesson(container, this.currentDayId || 1);
        else this.navigate('lessons-list');
      } else {
        if (code === '032310') {
          await activateOfflineCode();
          return;
        }
        if (!navigator.onLine || res.status === 0 || (res.data && res.data.error === 'network_error')) {
          alert('Код баталгаажуулахад интернэт шаардлагатай. Та интернэт холболтоо шалгаад дахин оролдоно уу.');
          return;
        }
        alert(res.data.message || 'Код буруу байна эсвэл өмнө нь ашиглагдсан байна.');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText || 'Нэвтрэх ба Хичээл эхлэх ➔';
      }
    }
  },

  openAdminPasswordModal() {
    this.openModal('👑 Системийн админ нэвтрэлт', `
      <div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
          Энэхүү хэсэг нь зөвхөн төслийн эзэмшигч <b>Mongolian Media</b>-ийн нууц үгээр нэвтрэх хэсэг юм.
        </p>
        <div class="form-group">
          <label class="form-label">Админ имэйл:</label>
          <input type="email" id="admin-email-input" class="form-input" value="admin@mongolianmedia.mn" readonly style="background: rgba(0,0,0,0.05); font-weight: 700;">
        </div>
        <div class="form-group">
          <label class="form-label">Админы нууц үг:</label>
          <input type="password" id="admin-pwd-input" class="form-input" placeholder="Нууц үгээ оруулна уу" autofocus>
        </div>
        <button class="btn-primary" onclick="App.submitAdminLogin()">Админаар нэвтрэх ➔</button>
      </div>
    `);
  },

  async submitAdminLogin() {
    const email = document.getElementById('admin-email-input').value.trim();
    const pwd = document.getElementById('admin-pwd-input').value.trim();

    if (!pwd) {
      alert('Нууц үгээ оруулна уу.');
      return;
    }

    const res = await window.API.adminLogin(email, pwd);
    if (res.ok) {
      this.closeModal();
      await this.checkAuth();
      alert('🎉 Тавтай морилно уу! Mongolian Media админ эрх идэвхжлээ.');
      this.navigate('admin');
    } else {
      alert(res.data.message || 'Админы нууц үг буруу байна.');
    }
  },

  async submitOtpRequest() {
    const name = document.getElementById('login-name').value.trim();
    const email = document.getElementById('login-email').value.trim();

    if (!email || !email.includes('@')) {
      alert('Зөв имэйл хаяг оруулна уу.');
      return;
    }

    const res = await window.API.requestOtp(email, name);
    if (res.ok) {
      document.getElementById('login-step-otp').style.display = 'block';
      const liveBox = document.getElementById('otp-live-display');

      if (res.data.dev_otp) {
        document.getElementById('login-otp-code').value = res.data.dev_otp;
        if (liveBox) {
          liveBox.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; border-radius: 12px; padding: 14px; margin-bottom: 14px; text-align: center;">
              <span style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase;">ТАНЫ НЭВТРЭХ ТҮР КОД:</span>
              <div style="font-size: 30px; font-weight: 900; letter-spacing: 6px; color: #065f46; margin: 4px 0;">${res.data.dev_otp}</div>
              <span style="font-size: 11px; color: var(--text-muted);">(Имэйл серверийн тохиргоо ороогүй тул кодыг автоматаар бөглөлөө). Доорх "Нэвтрэх" товчийг дарна уу!</span>
            </div>
          `;
        }
      } else {
        if (liveBox) {
          liveBox.innerHTML = `
            <div style="background: rgba(37, 99, 235, 0.1); border: 1px solid var(--brand-blue); border-radius: 10px; padding: 10px; margin-bottom: 12px; font-size: 12px; text-align: center;">
              6 оронтой код <b>${email}</b> хаяг руу илгээгдлээ. Имэйлээ шалгана уу.
            </div>
          `;
        }
        alert(res.data.message || 'Код илгээгдлээ');
      }
    } else {
      alert(res.data.message || 'Алдаа гарлаа');
    }
  },

  async submitOtpVerify() {
    const email = document.getElementById('login-email').value.trim();
    const otp = document.getElementById('login-otp-code').value.trim();

    if (!otp) {
      alert('6 оронтой кодоо оруулна уу.');
      return;
    }

    const res = await window.API.verifyOtp(email, otp);
    if (res.ok) {
      this.closeModal();
      await this.checkAuth();
      if (this.hasActiveAccess()) {
        this.navigate('lessons-list');
      } else {
        this.navigate('profile');
      }
    } else {
      alert(res.data.message || 'Код буруу байна.');
    }
  },

  openPaymentModal() {
    this.openLoginModal();
  },

  openModal(title, htmlContent) {
    const overlay = document.getElementById('app-modal-overlay');
    const titleEl = document.getElementById('modal-title-text');
    const bodyEl = document.getElementById('modal-body-area');
    if (!overlay || !bodyEl) return;

    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = htmlContent;
    overlay.classList.add('active');
  },

  closeModal() {
    const overlay = document.getElementById('app-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.App.init(); });
} else {
  window.App.init();
}
