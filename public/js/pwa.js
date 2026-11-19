// MONGOLIAN MEDIA — PWA Mobile Installation Controller

window.PWA = {
  deferredPrompt: null,

  init() {
    this.registerSW();
    this.setupInstallPrompt();
    this.detectStandalone();
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[PWA] ServiceWorker registered with scope:', reg.scope))
          .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
      });
    }
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
          <p><b>1-р алхам:</b> Safari хөтчийн доод талын <b>Хуваалцах (Share ⎋)</b> товчийг дарна.</p>
          <p><b>2-р алхам:</b> Цэснээс доош гүйлгээд <b>"Нүүр дэлгэц дээр нэмэх" (Add to Home Screen ➕)</b>-ийг сонгоно.</p>
          <p><b>3-р алхам:</b> Баруун дээд буланд байх <b>"Нэмэх" (Add)</b> товчийг дарж утасны дэлгэц дээрээ апп болгоно.</p>
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
