// MONGOLIAN MEDIA — PWA Mobile Installation & Offline Diagnostic Controller
// Production Standard for iOS WebKit & Android Chrome (Version 56)

window.PWA = {
  deferredPrompt: null,
  swRegistration: null,
  swError: null,
  swLifecycleLog: [],

  CRITICAL_FILES: [
    { path: '/index.html', label: 'HTML App Shell', required: true },
    { path: '/css/glassmorphism.css', label: 'Загварын CSS файл', required: true },
    { path: '/js/pwa.js', label: 'PWA & Офлайн хянагч', required: true },
    { path: '/js/api.js', label: 'API & Auth хянагч', required: true },
    { path: '/js/storage_manager.js', label: 'Санах ойн менежер', required: true },
    { path: '/js/speech_engine.js', label: 'Яриа & Аудио хөдөлгүүр', required: true },
    { path: '/js/alphabet_data.js', label: 'Үсгийн бэлтгэлийн өгөгдөл', required: true },
    { path: '/js/curriculum_data.js', label: '90 өдрийн хичээлүүд (1.3MB)', required: true },
    { path: '/js/app.js', label: 'Үндсэн апп логик', required: true },
    { path: '/manifest.json', label: 'App Manifest', required: true }
  ],

  logLifecycle(msg) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    this.swLifecycleLog.unshift(entry);
    if (this.swLifecycleLog.length > 60) this.swLifecycleLog.pop();
    console.log('[PWA-SW-Track]', entry);
  },

  init() {
    this.logLifecycle('PWA хянагч эхэллээ (v56)');
    this.registerSW();
    this.setupInstallPrompt();
    this.detectStandalone();
    this.checkInAppBrowser();
    this.listenSWReady();
    this.requestStoragePersistence();
    this.checkAndShowBadge();
  },

  requestStoragePersistence() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persisted) => {
        this.logLifecycle(`Хадгалах сангийн баталгаажуулалт (persist): ${persisted}`);
      }).catch(() => {});
    }
  },

  // 1. Centralized Service Worker Registration (The ONLY place registering /sw.js)
  registerSW() {
    if (!('serviceWorker' in navigator)) {
      this.logLifecycle('Бүртгэл боломжгүй: Энэ хөтөч ServiceWorker дэмжихгүй байна.');
      return;
    }

    this.logLifecycle('register("/sw.js", { scope: "/" }) дуудаж байна...');

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        this.swRegistration = reg;
        this.swError = null;
        this.logLifecycle(`Бүртгэл амжилттай боллоо. Scope: "${reg.scope}"`);
        this.trackWorkers(reg);

        // Listen for new worker versions installing
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          this.logLifecycle(`updatefound үйл явдал илэрлээ! Шинэ worker төлөв: ${newWorker ? newWorker.state : 'байхгүй'}`);
          if (newWorker) {
            this.attachWorkerListener(newWorker, 'installing');
          }
        });

        this.checkAndShowBadge();
      })
      .catch((err) => {
        console.error('[PWA] ServiceWorker registration error:', err);
        this.swError = {
          name: err.name || 'RegistrationError',
          message: err.message || String(err),
          stack: err.stack || ''
        };
        this.logLifecycle(`Бүртгэл АЛДАА өглөө: [${this.swError.name}] ${this.swError.message}`);
        this.checkAndShowBadge();
      });
  },

  trackWorkers(reg) {
    if (reg.installing) this.attachWorkerListener(reg.installing, 'installing');
    if (reg.waiting) this.attachWorkerListener(reg.waiting, 'waiting');
    if (reg.active) this.attachWorkerListener(reg.active, 'active');
  },

  attachWorkerListener(worker, role) {
    if (!worker) return;
    this.logLifecycle(`[${role}] worker хянагдаж эхэллээ (Одоогийн төлөв: "${worker.state}")`);

    worker.addEventListener('statechange', (e) => {
      const currentState = e.target.state;
      this.logLifecycle(`[${role}] worker төлөв шинэчлэгдлээ -> "${currentState}"`);

      if (currentState === 'activated') {
        this.logLifecycle(`[${role}] worker амжилттай идэвхжлээ (activated)!`);
        this.checkAndShowBadge();
      } else if (currentState === 'redundant') {
        this.logLifecycle(`[${role}] worker цуцлагдлаа (redundant)!`);
      }
    });
  },

  listenSWReady() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const ctrl = navigator.serviceWorker.controller;
        this.logLifecycle(`controllerchange үйл явдал дуудагдлаа! Шинэ хянагч: ${ctrl ? ctrl.scriptURL : 'байхгүй'}`);
        this.checkAndShowBadge();
      });

      navigator.serviceWorker.addEventListener('message', (event) => {
        this.logLifecycle(`SW-ээс мессеж хүлээн авлаа: ${JSON.stringify(event.data)}`);
      });
    }

    // Direct cache verification polling
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
      pollCount++;
      const diag = await this.verifyOfflineReadiness();
      if (diag.isOfflineReady || pollCount >= 10) {
        clearInterval(pollInterval);
      }
    }, 1500);
  },

  // 2. Comprehensive Offline Readiness Verification
  async verifyOfflineReadiness() {
    const result = {
      swSupported: 'serviceWorker' in navigator,
      cachesSupported: 'caches' in window,
      registrationScope: null,
      installingWorker: null,
      waitingWorker: null,
      activeWorker: null,
      controller: null,
      hasActive: false,
      hasController: false,
      error: this.swError || null,
      lifecycleLogs: this.swLifecycleLog || [],
      cacheName: null,
      cacheExists: false,
      files: {},
      totalCount: this.CRITICAL_FILES.length,
      cachedCount: 0,
      allCached: false,
      isOfflineReady: false,
      statusKey: 'INIT', // 'READY', 'SW_INACTIVE', 'FILES_MISSING', 'NOT_CACHED'
      statusLabel: ''
    };

    if (!result.swSupported || !result.cachesSupported) {
      result.statusKey = 'UNSUPPORTED';
      result.statusLabel = 'Хөтөч PWA дэмжихгүй байна';
      return result;
    }

    // A. Check Controller
    if (navigator.serviceWorker.controller) {
      result.hasController = true;
      result.controller = {
        state: navigator.serviceWorker.controller.state,
        scriptURL: navigator.serviceWorker.controller.scriptURL
      };
    }

    // B. Check Registration and Workers
    try {
      const reg = this.swRegistration || await navigator.serviceWorker.getRegistration();
      if (reg) {
        this.swRegistration = reg;
        result.registrationScope = reg.scope;

        if (reg.installing) {
          result.installingWorker = {
            state: reg.installing.state,
            scriptURL: reg.installing.scriptURL
          };
        }
        if (reg.waiting) {
          result.waitingWorker = {
            state: reg.waiting.state,
            scriptURL: reg.waiting.scriptURL
          };
        }
        if (reg.active) {
          result.hasActive = true;
          result.activeWorker = {
            state: reg.active.state,
            scriptURL: reg.active.scriptURL
          };
        }
      }
    } catch (e) {
      this.logLifecycle(`getRegistration алдаа: ${e.name} - ${e.message}`);
    }

    // C. Check Caches
    try {
      const keys = await caches.keys();
      const activeCacheKey = keys.find(k => k.startsWith('mm-korean'));
      if (activeCacheKey) {
        result.cacheName = activeCacheKey;
        result.cacheExists = true;

        const cache = await caches.open(activeCacheKey);
        let foundCount = 0;

        for (const item of this.CRITICAL_FILES) {
          let match = await cache.match(item.path, { ignoreSearch: true });
          if (!match && item.path === '/index.html') {
            match = await cache.match('/', { ignoreSearch: true });
          }
          if (!match) {
            match = await cache.match(new URL(item.path, location.origin).href, { ignoreSearch: true });
          }

          const isFound = !!(match && match.ok);
          result.files[item.path] = {
            label: item.label,
            status: isFound ? 'cached' : 'missing',
            ok: isFound
          };

          if (isFound) foundCount++;
        }

        result.cachedCount = foundCount;
        result.allCached = (foundCount === this.CRITICAL_FILES.length);
      }
    } catch (e) {
      console.warn('[PWA] Cache check warn:', e);
    }

    // D. Compute Status Key and Offline Readiness
    const hasConnection = (result.hasController || result.hasActive);

    if (result.allCached && hasConnection) {
      result.isOfflineReady = true;
      result.statusKey = 'READY';
      result.statusLabel = '🟢 Офлайн горим 100% бэлэн (Бүх файл суусан, холболт идэвхтэй)';
    } else if (result.allCached && !hasConnection) {
      result.isOfflineReady = false;
      result.statusKey = 'SW_INACTIVE';
      result.statusLabel = '🟡 Service worker идэвхгүй байна (Бүх 10 файл суусан боловч хөтөч хараахан холбогдоогүй)';
    } else if (result.cachedCount > 0) {
      result.isOfflineReady = false;
      result.statusKey = 'FILES_MISSING';
      result.statusLabel = `🟡 Офлайн файлууд дутуу (${result.cachedCount}/${result.totalCount} файл суусан)`;
    } else {
      result.isOfflineReady = false;
      result.statusKey = 'NOT_CACHED';
      result.statusLabel = '🔴 Офлайн горим бэлтгэгдээгүй байна';
    }

    return result;
  },

  async checkAndShowBadge() {
    const diag = await this.verifyOfflineReadiness();
    if (diag.statusKey === 'READY') {
      this.showOfflineReadyBadge('🟢 Офлайн горим 100% бэлэн (Интернэтгүй ажиллана)');
      this.updateHeaderDot(true);
    } else if (diag.statusKey === 'SW_INACTIVE') {
      this.showOfflineReadyBadge('🟡 10/10 файл бэлэн (Идэвхжүүлэх шаардлагатай)');
      this.updateHeaderDot(false);
    } else if (diag.statusKey === 'FILES_MISSING') {
      this.showOfflineReadyBadge(`🟡 Файлуудыг татаж байна... (${diag.cachedCount}/${diag.totalCount})`);
      this.updateHeaderDot(false);
    } else {
      this.updateHeaderDot(false);
    }
    return diag;
  },

  updateHeaderDot(isReady) {
    const headerTitle = document.querySelector('.brand-titles h1');
    if (!headerTitle) return;

    let dot = document.getElementById('header-offline-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'header-offline-dot';
      dot.style.cssText = 'display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 8px; vertical-align: middle; cursor: pointer; transition: all 0.3s ease;';
      dot.onclick = (e) => {
        e.stopPropagation();
        this.openDiagnosticModal();
      };
      headerTitle.appendChild(dot);
    }

    if (isReady) {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 10px #10b981';
      dot.title = 'Офлайн горим 100% бэлэн — Дарж оношилгоог харах';
    } else {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
      dot.title = 'Офлайн бэлтгэл дутуу — Дарж оношилгоог харах';
    }
  },

  showOfflineReadyBadge(text) {
    let badge = document.getElementById('offline-ready-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'offline-ready-badge';
      badge.style.cssText = `
        position: fixed;
        bottom: 74px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        backdrop-filter: blur(8px);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        z-index: 9998;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: fadeIn 0.4s ease;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      badge.onclick = () => this.openDiagnosticModal();
      document.body.appendChild(badge);
    }

    badge.innerHTML = `<span>${text || '🟢 Офлайн горим бэлэн боллоо'}</span><span style="font-size: 11px; opacity: 0.8; margin-left: 4px;">(Дарж шалгах)</span>`;

    clearTimeout(this._badgeTimer);
    this._badgeTimer = setTimeout(() => {
      badge.style.transition = 'opacity 0.8s ease';
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 800);
    }, 12000);
  },

  // 3. Detailed Diagnostic Modal (Requirements 1, 2, 3)
  async openDiagnosticModal() {
    const diag = await this.verifyOfflineReadiness();

    // Overall Status Banner
    let bannerHtml = '';
    if (diag.statusKey === 'READY') {
      bannerHtml = `
        <div style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
          <span style="font-size: 24px;">🟢</span>
          <div style="font-weight: 800; color: #34d399; margin-top: 4px; font-size: 15px;">Офлайн горим 100% Бэлэн</div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Бүх 10 файл суусан, Service Worker хянаж байна. Интернэтгүй үед апп саадгүй ажиллана.</div>
        </div>
      `;
    } else if (diag.statusKey === 'SW_INACTIVE') {
      bannerHtml = `
        <div style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
          <span style="font-size: 24px;">🟡</span>
          <div style="font-weight: 800; color: #fbbf24; margin-top: 4px; font-size: 15px;">Service Worker идэвхгүй байна</div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Бүх 10 файл суусан боловч хөтөч Service Worker-ийг хараахан холбогдоогүй байна. Доорх <b>"Идэвхжүүлэх"</b> товчийг дарна уу.</div>
        </div>
      `;
    } else if (diag.statusKey === 'FILES_MISSING') {
      bannerHtml = `
        <div style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
          <span style="font-size: 24px;">🟡</span>
          <div style="font-weight: 800; color: #fbbf24; margin-top: 4px; font-size: 15px;">Офлайн файлууд дутуу (${diag.cachedCount}/${diag.totalCount} файл)</div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Доорх "Бүх файлыг албадан кэшлэх" товчийг дарж татаж авна уу.</div>
        </div>
      `;
    } else {
      bannerHtml = `
        <div style="background: rgba(239,68,68,0.15); border: 1px solid #ef4444; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
          <span style="font-size: 24px;">🔴</span>
          <div style="font-weight: 800; color: #f87171; margin-top: 4px; font-size: 15px;">Офлайн горим бэлтгэгдээгүй байна</div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Файлууд хараахан кэшлэгдээгүй байна. "Бүх файлыг албадан кэшлэх" товчийг дарна уу.</div>
        </div>
      `;
    }

    // Error Alert Box (if register failed)
    let errorBoxHtml = '';
    if (diag.error) {
      errorBoxHtml = `
        <div style="background: rgba(239,68,68,0.15); border: 1px solid #ef4444; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 8px; color: #f87171; font-weight: 800; font-size: 13px;">
            <span>⚠️</span>
            <span>Service Worker Бүртгэлийн Алдаа:</span>
          </div>
          <div style="font-size: 12px; color: #fca5a5; margin-top: 6px; font-family: monospace;">
            <div><b>Нэр (error.name):</b> ${diag.error.name}</div>
            <div style="margin-top: 3px;"><b>Мэдээлэл (error.message):</b> ${diag.error.message}</div>
          </div>
        </div>
      `;
    }

    // SW States Display
    const ctrlStatus = diag.hasController 
      ? `<span style="color:#10b981; font-weight:700;">🟢 Тийм (Хянагдсан)</span>` 
      : `<span style="color:#ef4444; font-weight:700;">🔴 Үгүй (Хянагдаагүй)</span>`;

    const activeStatus = diag.hasActive 
      ? `<span style="color:#10b981; font-weight:700;">🟢 Бэлэн (${diag.activeWorker.state})</span>` 
      : `<span style="color:#ef4444; font-weight:700;">🔴 Идэвхгүй</span>`;

    const waitingStatus = diag.waitingWorker 
      ? `<span style="color:#f59e0b; font-weight:700;">🟡 Хүлээгдэж байна (${diag.waitingWorker.state})</span>` 
      : `<span style="color:#94a3b8;">—</span>`;

    const installingStatus = diag.installingWorker 
      ? `<span style="color:#38bdf8; font-weight:700;">🔵 Сууж байна (${diag.installingWorker.state})</span>` 
      : `<span style="color:#94a3b8;">—</span>`;

    const cacheStatus = diag.cacheExists 
      ? `<span style="color:#60a5fa; font-weight:700;">${diag.cacheName}</span>` 
      : `<span style="color:#ef4444; font-weight:700;">Байхгүй</span>`;

    // Files List
    let filesListHtml = '';
    for (const item of this.CRITICAL_FILES) {
      const f = diag.files[item.path];
      const isOk = f && f.ok;
      filesListHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px;">
          <div>
            <div style="font-weight: 600; color: #f1f5f9;">${item.label}</div>
            <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">${item.path}</div>
          </div>
          <div>
            ${isOk 
              ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">✅ Суусан</span>' 
              : '<span style="background: rgba(239,68,68,0.2); color: #f87171; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">❌ Байхгүй</span>'}
          </div>
        </div>
      `;
    }

    // Lifecycle Logs Display
    let logsHtml = '';
    if (diag.lifecycleLogs && diag.lifecycleLogs.length > 0) {
      logsHtml = diag.lifecycleLogs.slice(0, 15).map(log => `
        <div style="font-family: monospace; font-size: 11px; color: #cbd5e1; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); word-break: break-all;">
          ${log}
        </div>
      `).join('');
    } else {
      logsHtml = '<div style="color: #94a3b8; font-size: 11px;">Үйл явдал бүртгэгдээгүй байна.</div>';
    }

    const modalHtml = `
      <div style="text-align: left; max-height: 72vh; overflow-y: auto; padding-right: 4px;">
        ${bannerHtml}
        ${errorBoxHtml}

        <!-- Technical State Breakdown -->
        <div style="background: rgba(15,23,42,0.6); padding: 12px; border-radius: 10px; margin-bottom: 14px; font-size: 13px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">SW Controller:</span>
            <span>${ctrlStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Active Worker:</span>
            <span>${activeStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Waiting Worker:</span>
            <span>${waitingStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Installing Worker:</span>
            <span>${installingStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Бүртгэлийн Scope:</span>
            <span style="font-family:monospace; color:#e2e8f0;">${diag.registrationScope || 'Байхгүй'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Кэшийн нэр:</span>
            <span>${cacheStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Суусан файлууд:</span>
            <span style="font-weight:700; color:#38bdf8;">${diag.cachedCount} / ${diag.totalCount} файл</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
          ${(!diag.hasController || !diag.hasActive) ? `
            <button onclick="window.PWA.activateAndClaim()" class="btn-primary" style="flex: 1 1 100%; padding: 11px; font-size: 13px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #1d4ed8); font-weight: 800;">
              ⚡ Service Worker идэвхжүүлэх (Claim & Reload)
            </button>
          ` : ''}
          <button onclick="window.PWA.forcePrecacheAll()" class="btn-primary" style="flex: 1; padding: 10px; font-size: 13px; border-radius: 10px;">
            📥 Бүх файлыг албадан кэшлэх
          </button>
          <button onclick="window.PWA.openDiagnosticModal()" class="btn-secondary" style="padding: 10px 16px; font-size: 13px; border-radius: 10px;">
            🔄 Дахин шалгах
          </button>
        </div>

        <!-- Required Files Checklist -->
        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: #94a3b8; display: block; margin-bottom: 8px;">Шаардлагатай файлуудын төлөв:</strong>
          <div style="background: rgba(15,23,42,0.4); padding: 6px 12px; border-radius: 10px;">
            ${filesListHtml}
          </div>
        </div>

        <!-- Lifecycle & State Event Logs -->
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 13px; color: #94a3b8; display: block; margin-bottom: 8px;">Системийн үйл явдлын лог (Lifecycle):</strong>
          <div style="background: rgba(15,23,42,0.7); padding: 8px 12px; border-radius: 10px; max-height: 140px; overflow-y: auto;">
            ${logsHtml}
          </div>
        </div>
      </div>
    `;

    if (window.App && window.App.openModal) {
      window.App.openModal('🛠️ Офлайн оношилгооны самбар', modalHtml);
    }
  },

  // 4. Activate and Claim Worker (Takes immediate control of open clients)
  async activateAndClaim() {
    this.logLifecycle('Хэрэглэгч Service Worker идэвхжүүлэх товчийг дарлаа.');
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = this.swRegistration || await navigator.serviceWorker.getRegistration();
      if (!reg) {
        this.logLifecycle('Бүртгэл олдсонгүй. Шинээр registerSW() дуудаж байна...');
        this.registerSW();
        return;
      }

      if (reg.waiting) {
        this.logLifecycle('Waiting worker-т SKIP_WAITING илгээж байна...');
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      if (reg.active) {
        this.logLifecycle('Active worker-т CLAIM_CLIENTS илгээж байна...');
        reg.active.postMessage({ type: 'CLAIM_CLIENTS' });
      }

      if (reg.update) {
        await reg.update().catch(() => {});
      }

      this.logLifecycle('Хуудсыг дахин ачаалж (reload) холболтыг шинэчилж байна...');
      setTimeout(() => {
        location.reload();
      }, 500);
    } catch (e) {
      this.logLifecycle(`activateAndClaim алдаа: ${e.name} - ${e.message}`);
    }
  },

  // 5. Force Pre-caching of all critical files
  async forcePrecacheAll() {
    const btn = event && event.target;
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Татаж байна...';
    }

    try {
      const keys = await caches.keys();
      let activeCacheKey = keys.find(k => k.startsWith('mm-korean'));
      if (!activeCacheKey) {
        activeCacheKey = 'mm-korean-v56';
      }

      const cache = await caches.open(activeCacheKey);
      let successCount = 0;

      for (const item of this.CRITICAL_FILES) {
        try {
          const res = await fetch(item.path, { cache: 'no-cache' });
          if (res && res.ok) {
            const blob = await res.blob();
            const ctype = res.headers.get('content-type') || 'application/javascript; charset=utf-8';
            const makeR = () => new Response(blob, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': ctype,
                'Cache-Control': 'public, max-age=31536000'
              }
            });

            await cache.put(item.path, makeR());
            await cache.put(new URL(item.path, location.origin).href, makeR());

            if (item.path === '/index.html') {
              await cache.put('/', makeR());
              await cache.put(new URL('/', location.origin).href, makeR());
            }

            successCount++;
          }
        } catch (e) {
          console.warn('[PWA] Force precache item error:', item.path, e);
        }
      }

      this.logLifecycle(`Албадан кэшлэлт дууслаа: ${successCount}/${this.CRITICAL_FILES.length} файл`);
      await this.checkAndShowBadge();
      this.openDiagnosticModal();
    } catch (err) {
      alert('Таталт амжилтгүй боллоо: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '📥 Бүх файлыг албадан кэшлэх';
      }
    }
  },

  // 6. Profile View Summary (embedded in Profile Page)
  async renderProfileSummary(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const diag = await this.verifyOfflineReadiness();
    if (diag.statusKey === 'READY') {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🟢</span>
            <span style="color: #34d399; font-weight: 700;">Офлайн горим 100% бэлэн</span>
          </div>
          <span style="color: #94a3b8; font-size: 12px;">(${diag.cachedCount}/${diag.totalCount} файл)</span>
        </div>
      `;
    } else if (diag.statusKey === 'SW_INACTIVE') {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🟡</span>
            <span style="color: #fbbf24; font-weight: 700;">Service worker идэвхгүй (${diag.cachedCount}/${diag.totalCount} файл)</span>
          </div>
          <button onclick="window.PWA.activateAndClaim()" class="btn-primary" style="width: auto; padding: 4px 10px; font-size: 11px;">Идэвхжүүлэх</button>
        </div>
      `;
    } else if (diag.statusKey === 'FILES_MISSING') {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🟡</span>
            <span style="color: #fbbf24; font-weight: 700;">Файлууд дутуу (${diag.cachedCount}/${diag.totalCount})</span>
          </div>
          <button onclick="window.PWA.forcePrecacheAll()" class="btn-primary" style="width: auto; padding: 4px 10px; font-size: 11px;">Татах</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🔴</span>
            <span style="color: #f87171; font-weight: 700;">Офлайн бэлтгэгдээгүй</span>
          </div>
          <button onclick="window.PWA.forcePrecacheAll()" class="btn-primary" style="width: auto; padding: 4px 10px; font-size: 11px;">Татах</button>
        </div>
      `;
    }
  },

  isInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    return /FBAN|FBAV|Instagram|Messenger|Line|MicroMessenger|Snapchat/i.test(ua);
  },

  checkInAppBrowser() {
    if (!this.isInAppBrowser()) return;

    const isIos = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;

    const showBanner = () => {
      this.renderInAppBanner(isIos);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      showBanner();
    } else {
      window.addEventListener('DOMContentLoaded', showBanner);
    }
  },

  renderInAppBanner(isIos) {
    if (document.getElementById('inapp-browser-warning')) return;
    const container = document.querySelector('.app-container');
    if (!container) return;

    const banner = document.createElement('div');
    banner.id = 'inapp-browser-warning';
    banner.style.cssText = `
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: #ffffff;
      padding: 14px 16px;
      border-radius: 14px;
      margin-bottom: 16px;
      box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
      animation: fadeIn 0.4s ease;
      position: relative;
      z-index: 9999;
    `;

    if (isIos) {
      banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
          <div style="display: flex; gap: 10px;">
            <span style="font-size: 26px;">🧭</span>
            <div>
              <strong style="font-size: 14px; display: block; margin-bottom: 4px;">Safari хөтчөөр нээж суулгана уу</strong>
              <p style="font-size: 12px; opacity: 0.9; margin: 0; line-height: 1.4;">
                Та сошиал аппын дотоод хөтөч дээр байна. Офлайн ашиглахын тулд баруун доод <b>3 цэг (...) эсвэл Share</b> товчийг дарж <b>"Open in Safari" (Safari дээр нээх)</b>-ийг сонгоно уу.
              </p>
            </div>
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;">&times;</button>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
          <div style="display: flex; gap: 10px;">
            <span style="font-size: 26px;">🌐</span>
            <div>
              <strong style="font-size: 14px; display: block; margin-bottom: 4px;">Chrome хөтчөөр нээнэ үү</strong>
              <p style="font-size: 12px; opacity: 0.9; margin: 0; line-height: 1.4;">
                Офлайн горимыг бүрэн ажиллуулахын тулд баруун дээд <b>3 цэг (⋮)</b> дарж <b>"Open in Chrome"</b>-ийг сонгоно уу.
              </p>
            </div>
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;">&times;</button>
        </div>
      `;
    }

    container.insertBefore(banner, container.firstChild);
  },

  setupInstallPrompt() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIos = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !window.MSStream;

    const installBanner = document.getElementById('pwa-install-bar');
    const installBtn = document.getElementById('btn-pwa-install');
    const iosHelpBtn = document.getElementById('btn-ios-install');

    if (isStandalone) {
      if (installBanner) installBanner.style.display = 'none';
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (installBanner) {
        installBanner.style.display = 'flex';
        if (installBtn) installBtn.style.display = 'inline-flex';
        if (iosHelpBtn) iosHelpBtn.style.display = 'none';

        installBtn.onclick = async () => {
          if (!this.deferredPrompt) return;
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log('[PWA] User response to install prompt:', outcome);
          this.deferredPrompt = null;
          if (installBanner) installBanner.style.display = 'none';
        };
      }
    });

    if (isIos && !isStandalone) {
      if (installBanner) {
        installBanner.style.display = 'flex';
        if (installBtn) installBtn.style.display = 'none';
        if (iosHelpBtn) iosHelpBtn.style.display = 'inline-flex';
      }
    }

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App successfully installed on device!');
      if (installBanner) installBanner.style.display = 'none';
    });
  },

  detectStandalone() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      document.body.classList.add('pwa-standalone');
    }
  },

  showInstallModal() {
    const isIos = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !window.MSStream;
    let content = '';

    if (isIos) {
      content = `
        <div style="text-align: left; line-height: 1.8;">
          <h3 style="color: #2563eb; margin-bottom: 12px;">📱 iPhone / iPad дээр суулгах:</h3>
          <p><b>1-р алхам:</b> Safari хөтчийн доод талын <b>Хуваалцах (Share ⬆️)</b> товчийг дарна.</p>
          <p><b>2-р алхам:</b> Цэснээс доош гүйлгээд <b>"Add to Home Screen" (Дэлгэцэнд нэмэх ➕)</b>-ийг сонгоно.</p>
          <p><b>3-р алхам:</b> Баруун дээд буланд байх <b>"Add" (Нэмэх)</b> товчийг дарж дэлгэцэндээ суулгана.</p>
          <div style="background: rgba(16, 185, 129, 0.15); border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 6px; margin-top: 10px; font-size: 13px;">
            <b>💡 Чухал:</b> Суулгасны дараа дэлгэц дээр гарсан дүрсээс <b>Wi-Fi асаалттай үедээ 1 удаа дарж нээнэ үү</b>. Үүний дараа интернетгүй үедээ хэзээ ч шууд ашиглах боломжтой болно!
          </div>
        </div>
      `;
    } else {
      content = `
        <div style="text-align: left; line-height: 1.8;">
          <h3 style="color: #2563eb; margin-bottom: 12px;">🤖 Android / Chrome дээр суулгах:</h3>
          <p><b>1-р алхам:</b> Хөтчийн баруун дээд буланд байх <b>3 цэг (⋮)</b> товчийг дарна.</p>
          <p><b>2-р алхам:</b> Цэснээс <b>"Install app" (Апп суулгах)</b> эсвэл "Дэлгэц дээр нэмэх"-ийг сонгоно.</p>
          <p><b>3-р алхам:</b> "Суулгах" товчийг баталгаажуулж дарна.</p>
        </div>
      `;
    }

    if (window.App && window.App.openModal) {
      window.App.openModal('📱 Гар утсандаа АПП суулгах заавар', content);
    } else {
      alert('Хөтчийн цэс (3 цэг эсвэл Share) дээр дараад "Дэлгэц дээр нэмэх"-ийг сонгоно уу.');
    }
  },

  dismissBanner() {
    const banner = document.getElementById('pwa-install-bar');
    if (banner) banner.style.display = 'none';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.PWA.init(); });
} else {
  window.PWA.init();
}
