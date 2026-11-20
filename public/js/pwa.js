// MONGOLIAN MEDIA — PWA Mobile Installation Controller (Production Standard)

window.PWA = {
  deferredPrompt: null,

  init() {
    this.registerSW();
    this.setupInstallPrompt();
    this.detectStandalone();
    this.checkInAppBrowser();
    this.listenSWReady();
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
          if (reg.update) reg.update();
        })
        .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
    }
  },

  listenSWReady() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        console.log('[PWA] Service Worker is active and offline cache is ready!');
        this.showOfflineReadyBadge();
      }).catch(() => {});
    }
  },

  showOfflineReadyBadge() {
    if (document.getElementById('offline-ready-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'offline-ready-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 74px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.95);
      backdrop-filter: blur(8px);
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 9998;
      display: flex;
      align-items: center;
      gap: 6px;
      animation: fadeIn 0.4s ease;
      pointer-events: none;
    `;
    badge.innerHTML = `<span>🟢</span><span>Офлайн горим бэлэн (Интернэтгүй ажиллана)</span>`;
    document.body.appendChild(badge);
    setTimeout(() => {
      badge.style.transition = 'opacity 0.6s ease';
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 600);
    }, 4500);
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
      box-shadow: 0 8px 24px rgba(37,99,235,0.35);
      border: 1px solid rgba(255,255,255,0.25);
      position: relative;
      z-index: 9999;
    `;

    if (isIos) {
      banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
          <div style="display: flex; gap: 10px;">
            <span style="font-size: 26px;">🍏</span>
            <div>
              <div style="font-size: 15px; font-weight: 800; margin-bottom: 4px; color: #fff;">iPhone: Messenger-ээс гарах</div>
              <div style="font-size: 13px; line-height: 1.5; color: #dbeafe;">
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
          <div style="display: flex; gap: 10px; flex: 1;">
            <span style="font-size: 26px;">🤖</span>
            <div style="flex: 1;">
              <div style="font-size: 15px; font-weight: 800; margin-bottom: 4px; color: #fff;">Android: Messenger-ээс гарах</div>
              <div style="font-size: 13px; line-height: 1.5; color: #dbeafe; margin-bottom: 10px;">
                Facebook Messenger дотор апп суулгах боломжгүй тул Chrome хөтөч рүү шилжинэ үү:
              </div>
              <button onclick="PWA.openInChrome()" style="background: #ffffff; color: #1e3a8a; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 100%; justify-content: center;">
                <span>🚀 Chrome хөтөч дээр шууд нээх</span>
              </button>
              <div style="font-size: 11px; color: #cbd5e1; margin-top: 6px; text-align: center;">
                (Эсвэл баруун дээд талын <b>3 цэг (⋮)</b> ➔ <b>Chrome-д нээх</b>)
              </div>
            </div>
          </div>
          <button onclick="document.getElementById('inapp-browser-warning').remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
      `;
    }

    container.prepend(banner);
  },

  openInChrome() {
    const hostAndPath = window.location.host + window.location.pathname + window.location.search;
    window.location.href = `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;end`;
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
      if (installBanner) installBanner.style.display = 'flex';
      if (installBtn) installBtn.style.display = 'inline-flex';
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log('[PWA] User response to install:', outcome);
          this.deferredPrompt = null;
          if (installBanner) installBanner.style.display = 'none';
        } else {
          this.showInstallModal();
        }
      });
    }

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
          <p><b>3-р алхам:</b> Баруун дээд буланд байх <b>"Add" (Нэмэх)</b> товчийг дарж утасны дэлгэц дээрээ апп болгоно.</p>
        </div>
      `;
    } else {
      content = `
        <div style="text-align: left; line-height: 1.8;">
          <h3 style="color: #2563eb; margin-bottom: 12px;">🤖 Android / Chrome дээр суулгах:</h3>
          <p><b>1-р алхам:</b> Хөтчийн баруун дээд буланд байх <b>3 цэг (⋮)</b> товчийг дарна.</p>
          <p><b>2-р алхам:</b> <b>"Апп суулгах" (Install App)</b> эсвэл <b>"Нүүр дэлгэц дээр нэмэх"</b> сонгоно.</p>
          <p><b>3-р алхам:</b> "Суулгах" товчийг баталгаажуулснаар утасны үндсэн аппууд дунд нэмэгдэнэ.</p>
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

document.addEventListener('DOMContentLoaded', () => {
  window.PWA.init();
});
