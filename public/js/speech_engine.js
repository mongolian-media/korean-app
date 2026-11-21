// MONGOLIAN MEDIA — Speech Engine & Pronunciation Assessment
// Dual-Engine: High-Definition Audio Stream (Google TTS) + Web Speech Synthesis (ko-KR)
// Optimized for 100% Mobile (iPhone/iPad/Android) & Desktop compatibility.

window.SpeechEngine = {
  isSpeaking: false,
  isRecording: false,
  currentAudio: null,
  mediaRecorder: null,
  audioChunks: [],
  userAudioUrl: null,
  recognition: null,
  defaultRate: 1.0,
  audioEnginePreference: 'auto', // 'auto', 'stream', 'webspeech'

  init() {
    // 0. Set iOS AudioSession category to 'playback' (plays even in Silent mode on iOS 16.4+)
    if ('audioSession' in navigator) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (e) {}
    }

    // 1. Pre-unlock iOS AudioContext / SpeechSynthesis on first user touch/tap
    const unlockAudio = () => {
      try {
        if ('audioSession' in navigator) {
          navigator.audioSession.type = 'playback';
        }
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => ctx.close());
          } else {
            ctx.close();
          }
        }
      } catch (e) {}
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio, { passive: true });

    // 2. Pre-fetch Korean voice in WebSpeech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.getKoreanVoice();
      };
      this.getKoreanVoice();
    }
  },

  cleanKoreanText(text) {
    if (!text) return '';
    return text
      .replace(/\[.*?\]/g, '') // remove bracketed comments like [Зөвхөн дотно найздаа]
      .replace(/\(.*?\)/g, '') // remove parenthesized acronyms
      .replace(/['"“”‘’]/g, '') // remove quotes
      .replace(/[^가-힣ㄱ-ㅣ0-9.,?!~ \n]/g, ' ') // keep Korean characters (including jamo letters), numbers, basic punctuation
      .replace(/\s+/g, ' ')
      .trim();
  },

  getKoreanVoice(requireLocal = false) {
    if (!('speechSynthesis' in window)) return null;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) return null;
      const koVoices = voices.filter(v =>
        v.lang === 'ko-KR' || v.lang === 'ko_KR' || (v.lang && v.lang.toLowerCase().startsWith('ko'))
      );
      if (!koVoices.length) return null;

      if (requireLocal) {
        // Strictly filter to local on-device installed voices (offline capable)
        const localVoices = koVoices.filter(v => v.localService === true);
        if (localVoices.length > 0) {
          const premium = localVoices.find(v => /premium|enhanced|siri|yuna|sora|natural/i.test(v.name));
          return premium || localVoices[0];
        }
        return null;
      }

      // Prioritize Siri, Enhanced, Premium, Yuna, Sora Korean voices
      const premium = koVoices.find(v => /premium|enhanced|siri|yuna|sora|natural/i.test(v.name));
      if (premium) return premium;

      return koVoices[0];
    } catch (e) {
      return null;
    }
  },

  stop() {
    // Stop active HTML5 audio stream
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }

    // Stop WebSpeech without triggering deadlock
    if ('speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch (e) {}
    }

    this.isSpeaking = false;
  },

  // Master Speak Router - Prioritizes 100% Fluent HD Google Studio TTS, resilient on-device & cached offline
  speak(text, options = {}) {
    if (!text || !text.trim()) return;

    this.stop();

    const cleanText = this.cleanKoreanText(text) || text.trim();
    const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);

    // If completely offline:
    if (isOffline) {
      // 1. First, check on-device Korean voice (ko-KR, localService === true)
      const localVoice = this.getKoreanVoice(true);
      if (localVoice) {
        this.speakWebSpeech(cleanText, {
          ...options,
          voice: localVoice,
          requireLocal: true,
          onFallback: () => {
            // If local voice fails or doesn't start, fallback to previously cached audio stream
            this.playAudioStream(cleanText, { ...options, isOffline: true });
          }
        });
        return;
      }

      // 2. If no on-device voice installed, play previously cached audio stream
      this.playAudioStream(cleanText, { ...options, isOffline: true });
      return;
    }

    const pref = options.engine || this.audioEnginePreference;
    if (pref === 'webspeech') {
      this.speakWebSpeech(cleanText, options);
      return;
    }

    // Default online: play Studio HD audio stream (automatically cached in Service Worker audio cache)
    this.playAudioStream(cleanText, {
      ...options,
      onFallback: () => {
        this.speakWebSpeech(cleanText, options);
      }
    });
  },

  speakSlow(text, options = {}) {
    this.speak(text, { ...options, rate: 0.75 });
  },

  showOfflineNotice() {
    let toast = document.getElementById('audio-offline-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'audio-offline-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #f8fafc;
        border: 1px solid rgba(249, 115, 22, 0.45);
        padding: 10px 18px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 10px 28px rgba(0,0,0,0.45);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        transition: opacity 0.3s ease;
        max-width: 90vw;
        text-align: center;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>🔊</span><span>Энэ өгүүлбэрийн дуу хараахан хадгалагдаагүй байна. Интернэттэй үед 1 удаа сонсоход автоматаар хадгалагдана.</span>`;
    toast.style.opacity = '1';
    clearTimeout(this._offlineToastTimer);
    this._offlineToastTimer = setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, 3200);
  },

  showPlayingToast(text) {
    let toast = document.getElementById('audio-play-indicator');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'audio-play-indicator';
      toast.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.35);
        padding: 8px 18px;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>🔊</span><span>Солонгосоор уншиж байна...</span>`;
    toast.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, 2500);
  },

  // -------------------------------------------------------------
  // Engine 1: Native Studio Audio Stream (Backend Proxy + Fallback)
  // Hardened for iOS Safari & Android WebKit
  // -------------------------------------------------------------
  playAudioStream(text, options = {}) {
    const cleanText = text.replace(/[\r\n\t]+/g, ' ').trim();
    // 1. Same-Origin Backend Proxy (Zero CORS issues, completely trusted by iOS Safari)
    const backendUrl = `/api/tts?q=${encodeURIComponent(cleanText)}`;
    // 2. Direct Google TTS fallback
    const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

    if ('audioSession' in navigator) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (e) {}
    }

    const audio = this.audioElement || new Audio();
    this.audioElement = audio;
    audio.playsInline = true;
    audio.referrerPolicy = 'no-referrer';
    audio.removeAttribute('crossorigin');
    this.currentAudio = audio;

    const rate = options.rate !== undefined ? options.rate : this.defaultRate;
    audio.onloadedmetadata = () => {
      if (rate && rate !== 1.0) {
        try { audio.playbackRate = Math.max(0.5, Math.min(rate, 2.0)); } catch (e) {}
      }
    };

    audio.onplay = () => {
      this.isSpeaking = true;
      this.showPlayingToast(cleanText);
      if (options.onStart) options.onStart();
    };

    audio.onended = () => {
      this.isSpeaking = false;
      this.currentAudio = null;
      if (options.onEnd) options.onEnd();
    };

    const handleAudioFailure = (err) => {
      console.warn('[Audio Stream Error]', err);
      this.isSpeaking = false;
      this.currentAudio = null;

      if (options.isOffline) {
        // Completely offline: device voice didn't work and audio isn't cached
        this.showOfflineNotice();
        if (options.onFallback) options.onFallback();
        return;
      }

      // Online stream failure: fallback immediately to Web Speech synthesis
      if (options.onFallback) {
        options.onFallback();
      } else {
        this.speakWebSpeech(cleanText, options);
      }
    };

    audio.onerror = (err) => {
      handleAudioFailure(err);
    };

    audio.src = backendUrl;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        handleAudioFailure(err);
      });
    }
  },

  // -------------------------------------------------------------
  // Engine 2: Web Speech Synthesis (ko-KR)
  // Hardened for iOS Safari (GC protection & synchronous dispatch)
  // -------------------------------------------------------------
  speakWebSpeech(text, options = {}) {
    if (!('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis is not supported on this browser.');
      if (options.onFallback) options.onFallback();
      return;
    }

    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    const rate = options.rate !== undefined ? options.rate : this.defaultRate;
    utterance.rate = Math.max(0.6, Math.min(rate, 1.8));
    utterance.pitch = 1.0;

    let voice = options.voice || this.getKoreanVoice(options.requireLocal || false);
    if (!voice && !options.requireLocal && 'speechSynthesis' in window) {
      const vList = window.speechSynthesis.getVoices() || [];
      const kMatch = vList.find(v => v.lang && v.lang.toLowerCase().includes('ko'));
      if (kMatch) voice = kMatch;
    }
    if (voice) {
      utterance.voice = voice;
    } else if (options.requireLocal) {
      // Local voice requested but none found on device
      if (options.onFallback) options.onFallback();
      return;
    }

    // iOS WebKit Bug Fix: keep global reference to prevent garbage collection mid-speech
    window._activeUtterance = utterance;

    let started = false;
    utterance.onstart = () => {
      started = true;
      this.isSpeaking = true;
      this.showPlayingToast(text);
      if (options.onStart) options.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      window._activeUtterance = null;
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = (err) => {
      this.isSpeaking = false;
      window._activeUtterance = null;
      console.warn('[WebSpeech Error]', err);
      if (!started && options.onFallback) {
        options.onFallback();
      } else if (options.onError) {
        options.onError(err);
      }
    };

    // Synchronous execution inside user gesture handler for iOS Safari
    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[SpeechSynthesis Exception]', e);
      if (options.onFallback) options.onFallback();
    }
  },

  // -------------------------------------------------------------
  // Microphone Recording & User Audio Playback
  // -------------------------------------------------------------
  async startRecording(callbacks = {}) {
    if (this.isSpeaking) {
      this.stop(); // Never record app's own TTS output
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.isRecording = false;
      if (callbacks.onPermissionDenied) {
        callbacks.onPermissionDenied(new Error('mediaDevices not supported'));
      } else {
        this.showMicHelpModal();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        if (this.userAudioUrl) {
          URL.revokeObjectURL(this.userAudioUrl);
        }
        this.userAudioUrl = URL.createObjectURL(audioBlob);
        this.isRecording = false;

        // Stop media tracks
        stream.getTracks().forEach(track => track.stop());

        if (callbacks.onAudioReady) {
          callbacks.onAudioReady(this.userAudioUrl, audioBlob);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      if (callbacks.onStart) callbacks.onStart();

      // Start live speech recognition simultaneously if available
      this.startRecognition(callbacks.onRecognized, callbacks.onError);

    } catch (err) {
      this.isRecording = false;
      console.warn('[Microphone Permission Error]', err);
      if (callbacks.onPermissionDenied) {
        callbacks.onPermissionDenied(err);
      } else {
        this.showMicHelpModal();
      }
    }
  },

  showMicHelpModal() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

    let stepsHtml = '';
    if (isIos) {
      stepsHtml = `
        <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: 12px; padding: 14px; margin-bottom: 14px; line-height: 1.7;">
          <strong style="color: var(--brand-blue); display: block; margin-bottom: 8px;">🍎 iPad / iPhone дээр микрофон зөвшөөрөх алхам:</strong>
          1. iPad-ийнхаа үндсэн <b>Тохиргоо (Settings ⚙️)</b> руу орно.<br>
          2. Зүүн цэснээс <b>Safari</b> ➔ <b>Микрофон (Microphone)</b> ➔ <b>"Allow" (Зөвшөөрөх)</b> сонгоно.<br>
          3. Мөн <b>Нууцлал ба аюулгүй байдал (Privacy & Security 🛡️)</b> ➔ <b>Микрофон</b> цэснээс Safari эсвэл Апп-аа <b>Ногоон (Идэвхтэй)</b> болгоно.<br>
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 6px;">
            *(Хэрэв iPad дээрээс дуу бичих боломжгүй бол доорх "Сонсох" товчоор солонгос дуудлагаа сонсоод амандаа даган давтаж цээжилнэ).*
          </span>
        </div>
      `;
    } else {
      stepsHtml = `
        <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: 12px; padding: 14px; margin-bottom: 14px; line-height: 1.7;">
          <strong style="color: var(--brand-blue); display: block; margin-bottom: 6px;">🤖 Android / Chrome дээр нээх алхам:</strong>
          1. Дэлгэцийн баруун дээд талын <b>3 цэг (⋮)</b> ➔ <b>Сайтын тохиргоо</b> ➔ <b>Микрофон</b> сонгоно.<br>
          2. <b>Зөвшөөрөх (Allow)</b>-ийг сонгоно.
        </div>
      `;
    }

    const content = `
      <div style="text-align: left; line-height: 1.7; font-size: 13px;">
        <p style="color: var(--text-main); margin-bottom: 12px; font-weight: 600;">
          🎙️ Микрофоны эрх хаалттай байна.
        </p>

        ${stepsHtml}

        <div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main); margin-bottom: 16px;">
          💡 <b>Маш чухал зөвлөгөө:</b><br>
          Та заавал микрофоноор ярьж оноо авах шаардлагагүй! Хамгийн үр дүнтэй арга бол дээр байрлах <b>"🔊 Сонсох"</b> болон <b>"🐢 Удаанаар"</b> товчийг дараад цэвэр солонгос хүний унаган дуудлагыг хэдэн ч удаа сонсож, өөрөө амандаа даган дуурайж давтах юм.
        </div>

        <button class="btn-primary" onclick="App.closeModal()">Ойлголоо, хичээлээ үргэлжлүүлье</button>
      </div>
    `;

    if (window.App && window.App.openModal) {
      window.App.openModal('🎙️ Микрофон ашиглах заавар', content);
    } else {
      alert('iPad Тохиргоо -> Нууцлал -> Микрофон хэсгээс зөвшөөрнө үү.');
    }
  },

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  },

  playUserRecording(callbacks = {}) {
    if (!this.userAudioUrl) {
      if (callbacks.onError) callbacks.onError('Бичлэг байхгүй байна.');
      return;
    }
    const audio = new Audio(this.userAudioUrl);
    if (callbacks.onStart) callbacks.onStart();
    audio.onended = () => {
      if (callbacks.onEnd) callbacks.onEnd();
    };
    audio.onerror = (e) => {
      if (callbacks.onError) callbacks.onError(e);
    };
    audio.play();
  },

  // -------------------------------------------------------------
  // Speech Recognition & Pronunciation Assessment
  // -------------------------------------------------------------
  startRecognition(onResult, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API энэ төхөөрөмж дээр дэмжигдээгүй.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'ko-KR';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event) => {
        if (event.results && event.results.length > 0) {
          const transcript = event.results[0][0].transcript;
          const confidence = event.results[0][0].confidence || 0.85;
          if (onResult) onResult(transcript, confidence);
        }
      };

      this.recognition.onerror = (e) => {
        console.warn('[STT Error]', e);
        if (onError) onError(e);
      };

      this.recognition.start();
    } catch (err) {
      console.warn('[STT Init Error]', err);
    }
  },

  // Realistic Pronunciation Evaluation
  evaluatePronunciation(userTranscript, targetKoreanText, confidence = 0.85) {
    if (!userTranscript || userTranscript.trim().length === 0) {
      return {
        score: null,
        status: 'too_quiet',
        message: 'Сайн сонсогдсонгүй. Чанга тод дахин хэлээрэй.',
        passed: false,
        wordDetails: []
      };
    }

    const clean = (str) => str.replace(/[.,!?~]/g, '').trim().toLowerCase();
    const cleanUser = clean(userTranscript);
    const cleanTarget = clean(targetKoreanText);

    const targetWords = cleanTarget.split(/\s+/).filter(Boolean);
    const userWords = cleanUser.split(/\s+/).filter(Boolean);

    let matchCount = 0;
    const wordDetails = targetWords.map((tw) => {
      const isMatched = userWords.some(uw => uw === tw || uw.includes(tw) || tw.includes(uw));
      if (isMatched) matchCount++;
      return {
        word: tw,
        matched: isMatched
      };
    });

    const wordMatchRatio = targetWords.length > 0 ? (matchCount / targetWords.length) : 0;

    let baseScore = Math.round((wordMatchRatio * 70) + (Math.min(1, confidence) * 30));
    baseScore = Math.max(30, Math.min(100, baseScore));

    const passed = baseScore >= 75;
    let message = '';

    if (baseScore >= 90) {
      message = '🎉 Маш сайн! Төрөлх солонгос хүн шиг маш тод, зөв дуудлаа.';
    } else if (baseScore >= 75) {
      message = '👍 Сайн байна! Өгүүлбэрийн утга болон дуудлага бүрэн ойлгогдлоо.';
    } else if (baseScore >= 60) {
      message = '⚠️ Бага зэрэг зөрүүтэй сонсогдлоо. Тодруулсан үгийг анхаарч удаанаар дахин сонсоод хэлээрэй.';
    } else {
      message = '❌ Дуудлага зөрсөн байна. Аудиог удаанаар сонсоод дахин нэг оролдоорой.';
    }

    return {
      score: baseScore,
      status: passed ? 'passed' : 'retry',
      passed,
      message,
      recognizedText: userTranscript,
      targetText: targetKoreanText,
      wordDetails
    };
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.SpeechEngine.init();
});
