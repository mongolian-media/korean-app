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

  hasActiveAccess() {
    if (!this.userProfile) return false;
    if (this.userProfile.role === 'admin') return true;
    if (this.userProfile.status === 'active') return true;
    return false;
  },

  async init() {
    try {
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
    // 1. Restore cached offline profile first
    try {
      const cached = localStorage.getItem('mm_user_profile');
      if (cached) {
        this.userProfile = JSON.parse(cached);
      }
    } catch (e) {}

    // 2. Synchronize with server if online
    if (window.API.getToken()) {
      const res = await window.API.getMe();
      if (res.ok && res.data.user) {
        this.userProfile = res.data.user;
        try {
          localStorage.setItem('mm_user_profile', JSON.stringify(this.userProfile));
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
        localStorage.removeItem('mm_user_profile');
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

  navigate(viewName, pushState = true) {
    this.currentView = viewName;
    if (pushState) {
      window.history.pushState({ view: viewName }, '', `#${viewName}`);
    }

    // Update bottom nav active state
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
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

        ${isNewUser ? `
          <!-- New Learner Choice Grid -->
          <div class="choice-cards-grid">
            <div class="choice-box" onclick="App.startAlphabet()">
              <div class="choice-icon">🔤</div>
              <h4>Үсгээ суръя</h4>
              <p>19 гийгүүлэгч, 21 эгшиг, үе бүтээх, бачим дүрмийг эхнээс нь сурах</p>
            </div>
            <div class="choice-box" onclick="App.skipAlphabetAndStart()">
              <div class="choice-icon">🚀</div>
              <h4>Үсэг мэднэ</h4>
              <p>1-р хичээлээс шууд өгүүлбэрийн ярианы сургалтаа эхлүүлэх</p>
            </div>
          </div>
        ` : ''}

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

        <!-- Quick Access to Alphabet Prep if not finished -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('alphabet')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 28px;">🔤</span>
            <div>
              <strong style="display: block; font-size: 15px;">Хангылын үсгийн бэлтгэл</strong>
              <span style="font-size: 12px; color: var(--text-muted);">
                Төлөв: ${state.alphabetStatus === 'completed' ? '✅ Дууссан' : (state.alphabetStatus === 'skipped' ? '⏭️ Алгассан' : '⏳ Үзэж байгаа')}
              </span>
            </div>
          </div>
          <span style="font-size: 18px; color: var(--brand-blue);">➔</span>
        </div>

        <!-- 90-Day Quick Roadmap Shortcut -->
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="App.navigate('lessons-list')">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 28px;">📚</span>
            <div>
              <strong style="display: block; font-size: 15px;">90 Өдрийн хөтөлбөр (3 шат, 900 Өгүүлбэр)</strong>
              <span style="font-size: 12px; color: var(--text-muted);">🌟 1-р шат (1–30) • 🚀 2-р шат (31–60) • 👑 3-р шат (61–90)</span>
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
  // 2. ALPHABET PREPARATION VIEW
  // =============================================================
  renderAlphabet(container) {
    const data = this.alphabet || window.ALPHABET_DATA;
    if (!data) {
      container.innerHTML = `<div class="glass-card"><p>Үсгийн өгөгдөл ачааллаж байна...</p></div>`;
      return;
    }

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
          <button class="pill-btn" onclick="App.switchAlphaTab('consonants')">14 Гийгүүлэгч</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('compound')">11 Нийлмэл</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('double')">5 Давхар</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('syllable')">Үе бүтээх</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('batchim')">받침 дүрэм</button>
          <button class="pill-btn" onclick="App.switchAlphaTab('quiz')">Сорил</button>
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
                <div style="font-family: var(--font-korean); font-size: 36px; font-weight: 800; color: var(--brand-blue); margin-bottom: 4px;">${item.char}</div>
                <div style="font-size: 12px; font-weight: 700; color: var(--text-main);">${item.name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${item.sound}</div>
                <button class="btn-glass" style="margin-top: 8px; padding: 4px 10px; font-size: 11px;" onclick="event.stopPropagation(); window.SpeechEngine.speak('${item.examples[0] ? item.examples[0].ko : item.char}')">🔊 Сонсох</button>
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
            return `
              <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-light);">
                <div style="font-weight: 700; margin-bottom: 8px; font-size: 14px;">${qIdx + 1}. ${q.question}</div>
                ${q.audio ? `<button class="btn-glass" style="margin-bottom: 10px; padding: 4px 12px; font-size: 12px;" onclick="window.SpeechEngine.speak('${q.audio}')">🔊 Асуултыг сонсох</button>` : ''}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  ${q.options.map((opt, optIdx) => {
                    let cardClass = 'quiz-opt-card';
                    let icon = '⚪';
                    if (ans !== undefined) {
                      if (ans.selected === optIdx) {
                        cardClass += ans.isCorrect ? ' selected-correct' : ' selected-wrong';
                        icon = ans.isCorrect ? '✅' : '❌';
                      } else if (optIdx === q.correct) {
                        cardClass += ' revealed-correct';
                        icon = '🎯';
                      } else {
                        cardClass += ' dimmed';
                      }
                    }
                    return `
                      <div class="${cardClass}" onclick="App.checkAlphabetQuiz(${qIdx}, ${optIdx}, ${q.correct})">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                          <span>${icon}</span>
                          <span style="font-family: var(--font-korean); font-size: 16px; font-weight: 700;">${opt}</span>
                        </div>
                        <button class="quiz-audio-btn" type="button" title="Дуудлага сонсох" data-ko="${opt.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                          🔊
                        </button>
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
        <div style="font-family: var(--font-korean); font-size: 72px; font-weight: 900; color: var(--brand-blue); margin-bottom: 4px;">${item.char}</div>
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

  checkAlphabetQuiz(qIdx, selectedOpt, correctOpt) {
    const state = window.StorageManager.get();
    if (!state.alphabetQuizAnswers) state.alphabetQuizAnswers = {};
    state.alphabetQuizAnswers[qIdx] = {
      selected: selectedOpt,
      correct: correctOpt,
      isCorrect: selectedOpt === correctOpt
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

          <!-- Audio & Mic Controls -->
          <div class="card-audio-actions">
            <button class="btn-glass" onclick="window.SpeechEngine.speak('${currentSentence.ko}')">
              🔊 Сонсох
            </button>
            <button class="btn-glass" onclick="window.SpeechEngine.speakSlow('${currentSentence.ko}')">
              🐢 Удаанаар (0.72x)
            </button>
            <button class="btn-glass btn-record" id="btn-mic-card" onclick="App.toggleCardRecording('${currentSentence.ko}')">
              🎙️ Дагаж хэлэх
            </button>
            <button class="btn-glass" id="btn-play-rec" style="display: none;" onclick="window.SpeechEngine.playUserRecording()">
              ▶️ Миний бичлэг
            </button>
          </div>

          <!-- Assessment Result Area -->
          <div id="sentence-assessment-box" style="display: none;"></div>

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
            const koMatch = q.question.match(/[가-힣\s\?\!\,\.\~]+/);
            const questionKorean = koMatch && koMatch[0].trim().length > 1 ? koMatch[0].trim() : null;

            return `
              <div class="glass-card" style="margin-bottom: 18px; padding: 16px 16px; border-radius: 16px; border: 1.5px solid ${ans !== undefined ? (ans.isCorrect ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)') : 'var(--glass-border)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px;">
                  <div style="font-weight: 700; font-size: 15px; color: var(--text-main); line-height: 1.45;">
                    <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: var(--brand-blue); color: #fff; font-size: 12px; margin-right: 6px; font-weight: 800;">${qIdx + 1}</span>
                    ${q.question}
                  </div>
                  ${questionKorean ? `
                    <button class="quiz-audio-btn" type="button" title="Асуултыг сонсох" data-ko="${questionKorean.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                      🔊
                    </button>
                  ` : ''}
                </div>

                <!-- Answer Options -->
                <div style="display: flex; flex-direction: column; gap: 9px;">
                  ${q.options.map((opt, optIdx) => {
                    let cardClass = 'quiz-opt-card';
                    let radioIcon = '⚪';
                    let tagBadge = '';

                    if (ans !== undefined) {
                      if (ans.selected === optIdx) {
                        if (ans.isCorrect) {
                          cardClass += ' selected-correct';
                          radioIcon = '✅';
                          tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #047857; margin-left: 6px;">(Таны зөв хариулт)</span>';
                        } else {
                          cardClass += ' selected-wrong';
                          radioIcon = '❌';
                          tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #b91c1c; margin-left: 6px;">(Таны сонголт)</span>';
                        }
                      } else if (optIdx === q.correct) {
                        cardClass += ' revealed-correct';
                        radioIcon = '🎯';
                        tagBadge = '<span style="font-size: 11px; font-weight: 700; color: #047857; margin-left: 6px;">(Зөв хариулт нь)</span>';
                      } else {
                        cardClass += ' dimmed';
                      }
                    }

                    return `
                      <div class="${cardClass}" id="dayq_${day.id}_${qIdx}_opt_${optIdx}" onclick="App.checkDayQuiz(${day.id}, ${qIdx}, ${optIdx}, ${q.correct})">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                          <span style="font-size: 16px; min-width: 22px;">${radioIcon}</span>
                          <div style="flex: 1;">
                            <span style="font-family: var(--font-korean); font-size: 15px; font-weight: 600;">${opt}</span>
                            ${tagBadge}
                          </div>
                        </div>
                        <button class="quiz-audio-btn" type="button" title="Хариултын солонгос дуудлага сонсох" data-ko="${opt.replaceAll('"', '&quot;')}" onclick="event.stopPropagation(); window.SpeechEngine.speak(this.getAttribute('data-ko'))">
                          🔊
                        </button>
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

  checkDayQuiz(dayId, qIdx, selectedOpt, correctOpt) {
    const state = window.StorageManager.get();
    if (!state.dayQuizAnswers) state.dayQuizAnswers = {};
    if (!state.dayQuizAnswers[dayId]) state.dayQuizAnswers[dayId] = {};

    state.dayQuizAnswers[dayId][qIdx] = {
      selected: selectedOpt,
      correct: correctOpt,
      isCorrect: selectedOpt === correctOpt,
      answeredAt: new Date().toISOString()
    };
    window.StorageManager.save(state);

    // Re-render Step 5 so all questions 1-5 retain their checked states
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
          <button class="btn-glass" style="padding: 12px 20px;" onclick="App.closeModal(); App.navigate('home');">
            🏠 Нүүр хуудас руу буцах
          </button>
        </div>
      </div>
    `);
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

        ${!user ? `
          <!-- Quick Code Entry for Guests -->
          <div class="glass-card">
            <h4 style="margin-bottom: 8px;">🔑 1 удаагийн 6 оронтой кодоо идэвхжүүлэх</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Mongolian Media-аас авсан 6 оронтой тоон кодоо оруулаад сургалтаа шууд эхлүүлнэ үү.</p>
            <div style="display: flex; gap: 8px;">
              <input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="profile-access-code" class="form-input" placeholder="123456" style="font-weight: 800; letter-spacing: 4px; font-size: 18px; text-align: center;">
              <button class="btn-primary" style="width: auto; padding: 10px 18px;" onclick="App.submitProfileCode()">Нэвтрэх</button>
            </div>
          </div>
        ` : ''}

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
          <input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="login-access-code" class="form-input" placeholder="123456" style="font-weight: 800; letter-spacing: 6px; font-size: 24px; text-align: center;">
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">
            *(Хэрэв танд нэвтрэх код байхгүй бол сургалтын төлбөрөө шилжүүлэн Mongolian Media-аас 6 оронтой тоон кодоо авна уу).*
          </span>
        </div>

        <button class="btn-primary" style="padding: 13px 18px; font-size: 15px; font-weight: 700;" onclick="App.submitCodeLogin()">Нэвтрэх ба Хичээл эхлэх ➔</button>

        <div style="background: rgba(37, 99, 235, 0.06); border: 1px dashed rgba(37, 99, 235, 0.3); border-radius: 10px; padding: 10px 12px; margin-top: 14px; font-size: 12px; text-align: left; line-height: 1.5;">
          💳 <b>Код авах данс:</b> Хаан Банк <b>5946179010</b> (Н.Батцогт)<br>
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
        this.navigate('lessons-list');
      } else {
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

document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
