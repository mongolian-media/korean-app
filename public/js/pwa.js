// MONGOLIAN MEDIA — PWA Mobile Installation & Offline Controller (Version 65)
// Built on drive.uugiscar.com standard: updateViaCache: 'none', silent background caching

window.PWA = {
  deferredPrompt: null,

  init() {
    this.registerSW();
    this.setupInstallPrompt();
    this.detectStandalone();
    this.checkInAppBrowser();
    this.requestStoragePersistence();
  },

  requestStoragePersistence() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  },

  // 1. Silent Automatic Background Registration with updateViaCache: 'none'
  registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker is not supported in this browser.');
      return;
    }

    navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none'
    })
    .then((reg) => {
      console.log('[PWA] Service Worker registered successfully. Scope:', reg.scope);
      if (reg.installing) {
        console.log('[PWA] Service Worker installing...');
      } else if (reg.waiting) {
        console.log('[PWA] Service Worker waiting...');
      } else if (reg.active) {
        console.log('[PWA] Service Worker active and ready.');
      }
    })
    .catch((err) => {
      console.error('[PWA] Service Worker registration failed:', err.name, err.message);
    });
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
