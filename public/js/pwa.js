// MONGOLIAN MEDIA — PWA Mobile Installation & Offline Diagnostic Controller
// Production Standard for iOS WebKit & Android Chrome

window.PWA = {
  deferredPrompt: null,

  CRITICAL_FILES: [
    { path: '/index.html', label: 'HTML App Shell', required: true },
    { path: '/css/glassmorphism.css', label: 'Загварын CSS файл', required: true },
    { path: '/js/api.js', label: 'API & Auth хянагч', required: true },
    { path: '/js/storage_manager.js', label: 'Санах ойн менежер', required: true },
    { path: '/js/speech_engine.js', label: 'Яриа & Аудио хөдөлгүүр', required: true },
    { path: '/js/pwa.js', label: 'PWA & Офлайн хянагч', required: true },
    { path: '/js/alphabet_data.js', label: 'Үсгийн бэлтгэлийн өгөгдөл', required: true },
    { path: '/js/curriculum_data.js', label: '90 өдрийн хичээлүүд (1.3MB)', required: true },
    { path: '/js/app.js', label: 'Үндсэн апп логик', required: true },
    { path: '/manifest.json', label: 'App Manifest', required: true }
  ],

  init() {
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
        console.log('[PWA] Storage persistence granted:', persisted);
      }).catch(() => {});
    }
  },

  registerSW() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] ServiceWorker registered with scope:', reg.scope);

        if (reg.active) {
          this.checkAndShowBadge();
        }

        if (reg.installing) {
          reg.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              this.checkAndShowBadge();
            }
          });
        }

        if (reg.waiting) {
          reg.waiting.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              this.checkAndShowBadge();
            }
          });
        }
      })
      .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
  },

  listenSWReady() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Controller changed -> active!');
        this.checkAndShowBadge();
      });
    }

    // Direct cache verification polling (checks actual files in cache)
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
      pollCount++;
      const diag = await this.verifyOfflineReadiness();
      if (diag.isOfflineReady || pollCount >= 10) {
        clearInterval(pollInterval);
      }
    }, 1500);
  },

  // 1. Comprehensive Offline Readiness Verification (Never relies merely on cache name!)
  async verifyOfflineReadiness() {
    const result = {
      swSupported: 'serviceWorker' in navigator,
      cachesSupported: 'caches' in window,
      controller: false,
      controllerScript: null,
      activeWorker: false,
      activeWorkerScript: null,
      scope: null,
      cacheName: null,
      cacheExists: false,
      files: {},
      totalCount: this.CRITICAL_FILES.length,
      cachedCount: 0,
      allCached: false,
      isOfflineReady: false
    };

    if (!result.swSupported || !result.cachesSupported) {
      return result;
    }

    if (navigator.serviceWorker.controller) {
      result.controller = true;
      result.controllerScript = navigator.serviceWorker.controller.scriptURL;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        result.scope = reg.scope;
        if (reg.active) {
          result.activeWorker = true;
          result.activeWorkerScript = reg.active.scriptURL;
        }
      }
    } catch (e) {}

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

    // Ready ONLY when all critical assets are verified in cache AND SW is active/controlling
    result.isOfflineReady = result.allCached && (result.activeWorker || result.controller);
    return result;
  },

  async checkAndShowBadge() {
    const diag = await this.verifyOfflineReadiness();
    if (diag.isOfflineReady) {
      this.showOfflineReadyBadge('🟢 Офлайн горим 100% бэлэн (Бүх файл суусан)');
      this.updateHeaderDot(true);
    } else if (diag.cachedCount > 0 && diag.cachedCount < diag.totalCount) {
      this.showOfflineReadyBadge(`🟡 Офлайн файлуудыг татаж байна... (${diag.cachedCount}/${diag.totalCount})`);
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
      dot.title = 'Офлайн горим бэлэн (Интернэтгүй ажиллана) — Дарж оношилгоог харах';
    } else {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
      dot.title = 'Офлайн файлуудыг бэлтгэж байна — Дарж оношилгоог харах';
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

  // 2. Diagnostic Modal (Item 1 Requirement)
  async openDiagnosticModal() {
    const diag = await this.verifyOfflineReadiness();

    const swControllerStatus = diag.controller 
      ? '<span style="color:#10b981; font-weight:700;">🟢 Тийм (Хянагдсан)</span>' 
      : '<span style="color:#ef4444; font-weight:700;">🔴 Үгүй (Хянагдаагүй)</span>';

    const swActiveStatus = diag.activeWorker 
      ? '<span style="color:#10b981; font-weight:700;">🟢 Бэлэн (Active)</span>' 
      : '<span style="color:#ef4444; font-weight:700;">🔴 Идэвхгүй</span>';

    const cacheStatus = diag.cacheExists 
      ? `<span style="color:#60a5fa; font-weight:700;">${diag.cacheName}</span>` 
      : '<span style="color:#ef4444; font-weight:700;">Байхгүй</span>';

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

    const overallBanner = diag.isOfflineReady
      ? `<div style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
           <span style="font-size: 22px;">🟢</span>
           <div style="font-weight: 800; color: #34d399; margin-top: 4px;">Офлайн горим 100% Бэлэн</div>
           <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Интернэтгүй үед апп саадгүй нээгдэж ажиллана.</div>
         </div>`
      : `<div style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center;">
           <span style="font-size: 22px;">🟡</span>
           <div style="font-weight: 800; color: #fbbf24; margin-top: 4px;">Офлайн горим дутуу (${diag.cachedCount}/${diag.totalCount} файл)</div>
           <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Доорх "Бүх файлыг албадан кэшлэх" товчийг дарна уу.</div>
         </div>`;

    const modalHtml = `
      <div style="text-align: left; max-height: 70vh; overflow-y: auto; padding-right: 4px;">
        ${overallBanner}

        <div style="background: rgba(15,23,42,0.6); padding: 12px; border-radius: 10px; margin-bottom: 14px; font-size: 13px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">SW Controller:</span>
            <span>${swControllerStatus}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#94a3b8;">Active Worker:</span>
            <span>${swActiveStatus}</span>
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

        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: #94a3b8; display: block; margin-bottom: 8px;">Шаардлагатай файлуудын төлөв:</strong>
          <div style="background: rgba(15,23,42,0.4); padding: 6px 12px; border-radius: 10px;">
            ${filesListHtml}
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="window.PWA.forcePrecacheAll()" class="btn-primary" style="flex: 1; padding: 10px; font-size: 13px; border-radius: 10px;">
            📥 Бүх файлыг албадан кэшлэх
          </button>
          <button onclick="window.PWA.openDiagnosticModal()" class="btn-secondary" style="padding: 10px 16px; font-size: 13px; border-radius: 10px;">
            🔄 Дахин шалгах
          </button>
        </div>
      </div>
    `;

    if (window.App && window.App.openModal) {
      window.App.openModal('🛠️ Офлайн оношилгооны самбар', modalHtml);
    }
  },

  // 3. Force Pre-caching of all critical files (Guarantees 100% cache population)
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
        activeCacheKey = 'mm-korean-v55';
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

      console.log(`[PWA] Force precache finished: ${successCount}/${this.CRITICAL_FILES.length}`);
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

  // 4. Render Profile Summary (embedded in Profile View)
  async renderProfileSummary(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const diag = await this.verifyOfflineReadiness();
    if (diag.isOfflineReady) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🟢</span>
            <span style="color: #34d399; font-weight: 700;">Офлайн горим 100% бэлэн</span>
          </div>
          <span style="color: #94a3b8; font-size: 12px;">(${diag.cachedCount}/${diag.totalCount} файл)</span>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🟡</span>
            <span style="color: #fbbf24; font-weight: 700;">Файлууд дутуу (${diag.cachedCount}/${diag.totalCount})</span>
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
            <span style="font-size: 26px;">🍏</span>
            <div>
              <strong style="font-size: 14px; display: block; margin-bottom: 4px;">Safari хөтчөөр нээж суулгана уу!</strong>
              <div style="font-size: 12px; opacity: 0.9; line-height: 1.5;">
                Facebook Messenger дотор апп суулгах боломжгүй тул:<br>
                <b>1.</b> Баруун дээд буланд байх <b>3 цэг (•••)</b> дээр дарна.<br>
                <b>2.</b> Цэснээс <b>"Open in external browser"</b> (Гадаад хөтчөөр нээх)-ийг сонгоно.<br>
                <b>3.</b> Safari дээр нээгдсэний дараа <b>Share (⬆️) ➔ "Add to Home Screen" (➕)</b> дарж суулгаарай!
              </div>
            </div>
          </div>
          <button onclick="document.getElementById('inapp-browser-warning').remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
          <div style="display: flex; gap: 10px;">
            <span style="font-size: 26px;">🤖</span>
            <div>
              <strong style="font-size: 14px; display: block; margin-bottom: 4px;">Chrome хөтчөөр нээж суулгана уу!</strong>
              <div style="font-size: 12px; opacity: 0.9; line-height: 1.5;">
                Facebook Messenger дотор апп суулгах боломжгүй тул:<br>
                <b>1.</b> Баруун дээд буланд байх <b>3 цэг (•••)</b> дээр дарна.<br>
                <b>2.</b> Цэснээс <b>"Open in Chrome"</b> (Chrome дээр нээх)-ийг сонгоно.<br>
                <b>3.</b> Chrome дээр нээгдсэний дараа <b>"Суулгах"</b> товчийг дарж суулгаарай!
              </div>
            </div>
          </div>
          <button onclick="document.getElementById('inapp-browser-warning').remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
      `;
    }

    container.insertBefore(banner, container.firstChild);
  },

  setupInstallPrompt() {
    const installBanner = document.getElementById('pwa-install-bar');
    const installBtn = document.getElementById('btn-pwa-install');
    const iosHelpBtn = document.getElementById('btn-ios-install');

    const isIos = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    if (isStandalone) {
      if (installBanner) installBanner.style.display = 'none';
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      if (installBanner && !isStandalone) {
        installBanner.style.display = 'flex';
        if (installBtn) installBtn.style.display = 'inline-flex';
        if (iosHelpBtn) iosHelpBtn.style.display = 'none';
      }

      if (installBtn) {
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
          <h3 style="color: #2563eb; margin-bottom: 12px;">🍏 iPhone / iPad дээр суулгах:</h3>
          <p><b>1-р алхам:</b> Safari хөтчийн доод талын <b>Хуваалцах (Share ⬆️)</b> товчийг дарна.</p>
          <p><b>2-р алхам:</b> Цэснээс доош гүйлгээд <b>"Add to Home Screen" (Дэлгэцэнд нэмэх ➕)</b>-ийг сонгоно.</p>
          <p><b>3-р алхам:</b> Баруун дээд буланд байх <b>"Add" (Нэмэх)</b> товчийг дарж дэлгэцэндээ суулгана.</p>
          <div style="background: rgba(16, 185, 129, 0.15); border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 6px; margin-top: 10px; font-size: 13px;">
            <b>💡 Чухал:</b> Суулгасны дараа дэлгэц дээр гарсан дүрсээ <b>Wi-Fi асаалттай үедээ 1 удаа дарж нээнэ үү</b>. Үүний дараа интернэтгүй үедээ хэзээ ч шууд ашиглах боломжтой болно!
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
      window.App.openModal('📲 Гар утсандаа АПП суулгах заавар', content);
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
