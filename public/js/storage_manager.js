// MONGOLIAN MEDIA — Storage & Spaced Repetition Manager

const STORAGE_KEY = 'mongolian_media_korean_state_v1';

window.StorageManager = {
  defaultState: {
    version: 1,
    alphabetStatus: 'not_started', // 'not_started', 'in_progress', 'completed', 'skipped'
    activeDay: 1,
    activeStep: 0,
    activeSentenceIndex: 0,
    sentenceSplitMode: 'all', // 'first_half', 'second_half', 'all'
    completedDays: [],
    sentenceProgress: {}, // sentenceId: { status: 'viewed'|'practiced'|'passed_audio', score, attempts, lastStudied }
    bookmarkedVocab: [], // [{ id, ko, mn, ro, tip }]
    spacedRepetition: {}, // sentenceId: { level: 1..5, nextReviewDate: 'YYYY-MM-DD', lastReviewed: 'YYYY-MM-DD' }
    dayQuizAnswers: {}, // dayId: { qIdx: { selected, correct, isCorrect, answeredAt } }
    alphabetQuizAnswers: {}, // qIdx: { selected, correct, isCorrect }
    streak: {
      count: 1,
      lastStudyDate: new Date().toISOString().split('T')[0]
    },
    settings: {
      theme: 'light',
      speechRate: 0.9,
      showGalig: true,
      timezone: 'Asia/Seoul'
    }
  },

  get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...this.defaultState };
      const parsed = JSON.parse(raw);
      return { ...this.defaultState, ...parsed };
    } catch (e) {
      console.warn('[Storage Error]', e);
      return { ...this.defaultState };
    }
  },

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Asynchronously sync with server if logged in
      if (window.API && window.API.getToken()) {
        window.API.saveProgress(state).catch(() => {});
      }
    } catch (e) {
      console.warn('[Storage Save Error]', e);
    }
  },

  async loadFromServer() {
    if (!window.API || !window.API.getToken()) return false;
    const res = await window.API.getProgress();
    if (res.ok && res.data && res.data.progress) {
      const merged = { ...this.get(), ...res.data.progress };
      this.save(merged);
      return true;
    }
    return false;
  },

  updateStreak(state) {
    const today = new Date().toISOString().split('T')[0];
    if (!state.streak) {
      state.streak = { count: 1, lastStudyDate: today };
      return;
    }

    if (state.streak.lastStudyDate === today) {
      return;
    }

    const last = new Date(state.streak.lastStudyDate);
    const curr = new Date(today);
    const diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      state.streak.count += 1;
    } else if (diffDays > 1) {
      state.streak.count = 1;
    }
    state.streak.lastStudyDate = today;
  },

  // -------------------------------------------------------------
  // Spaced Repetition (1, 3, 7, 14, 30 Days)
  // -------------------------------------------------------------
  scheduleNextReview(state, sentenceId, isSuccess) {
    if (!state.spacedRepetition) state.spacedRepetition = {};
    const curr = state.spacedRepetition[sentenceId] || { level: 0, nextReviewDate: null };

    let newLevel = isSuccess ? Math.min(5, curr.level + 1) : Math.max(1, curr.level - 1);
    const intervals = [1, 3, 7, 14, 30]; // Days
    const addDays = intervals[newLevel - 1] || 1;

    const d = new Date();
    d.setDate(d.getDate() + addDays);
    const nextDateStr = d.toISOString().split('T')[0];

    state.spacedRepetition[sentenceId] = {
      level: newLevel,
      nextReviewDate: nextDateStr,
      lastReviewed: new Date().toISOString().split('T')[0]
    };
  },

  getDueSentences(state) {
    const today = new Date().toISOString().split('T')[0];
    const dueList = [];
    if (!state.spacedRepetition) return dueList;

    for (const [sId, item] of Object.entries(state.spacedRepetition)) {
      if (item.nextReviewDate && item.nextReviewDate <= today) {
        dueList.push({ id: sId, ...item });
      }
    }
    return dueList;
  },

  // -------------------------------------------------------------
  // Bookmarks / Unknown Vocabulary
  // -------------------------------------------------------------
  toggleBookmarkVocab(state, vocabItem) {
    if (!state.bookmarkedVocab) state.bookmarkedVocab = [];
    const idx = state.bookmarkedVocab.findIndex(v => v.ko === vocabItem.ko);
    if (idx >= 0) {
      state.bookmarkedVocab.splice(idx, 1);
      return false; // Removed
    } else {
      state.bookmarkedVocab.push(vocabItem);
      return true; // Added
    }
  },

  isVocabBookmarked(state, koText) {
    if (!state.bookmarkedVocab) return false;
    return state.bookmarkedVocab.some(v => v.ko === koText);
  },

  // -------------------------------------------------------------
  // Export & Import
  // -------------------------------------------------------------
  exportBackup() {
    const state = this.get();
    const cleanState = { ...state };
    // Exclude any sensitive tokens
    const jsonStr = JSON.stringify(cleanState, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mongolian_media_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data && typeof data === 'object') {
        const merged = { ...this.defaultState, ...data };
        this.save(merged);
        return { success: true, message: 'Ахиц амжилттай сэргээгдлээ!' };
      }
      return { success: false, message: 'Файлын бүтэц буруу байна.' };
    } catch (e) {
      return { success: false, message: 'JSON файлыг уншихад алдаа гарлаа.' };
    }
  }
};
