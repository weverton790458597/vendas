/* ============================================================
   app-interface.js — Camada de interface do Hermes Pro
   Responsável por: navegação entre telas, PWA install prompt,
   status bar mobile, sync de navegação entre desktop nav e
   mobile bottom nav, e botão de download do app.
   NÃO toca no app.js (Supabase/auth) — apenas UI/UX.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initStatusBar();
  initThemeToggle();
  initNavigationSync();
  initInstallPrompt();
  initAppDownload();
  initSafeArea();
  initBottomNavSync();
});

/* ---- Status bar: simula a status bar do celular em mobile ---- */
function initStatusBar() {
  const statusBar = document.getElementById('statusBar');
  if (!statusBar) return;

  // Só mostra em dispositivos móveis (toque + tela pequena)
  const isMobile = window.matchMedia('(hover: none) and (max-width: 767px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    statusBar.style.display = 'flex';
    updateTime();
    setInterval(updateTime, 60000); // atualiza a cada minuto
  } else {
    statusBar.style.display = 'none';
  }
}

function updateTime() {
  const timeEl = document.getElementById('statusTime');
  if (!timeEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  timeEl.textContent = `${hours}:${minutes}`;
}

/* ---- Theme toggle ---- */
function initThemeToggle() {
  // Carrega o tema salvo ou usa o sistema
  const savedTheme = localStorage.getItem('ap-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  const toggles = document.querySelectorAll('[data-theme-toggle]');
  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ap-theme', next);
    });
  });
}

/* ---- Sync desktop nav e mobile bottom nav ---- */
function initNavigationSync() {
  // Quando app.js chama showScreen, ele alterna os *Screen.
  // A nav (desktop) e bottom-nav (mobile) precisam refletir a aba ativa.
  // Observa cliques em .nav-item e mantém o estado sincronizado.
  const items = document.querySelectorAll('.nav-item[data-tab]');

  items.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');

      // Sincroniza desktop + mobile
      document.querySelectorAll('.nav-item[data-tab]').forEach(i => {
        i.classList.toggle('active', i.getAttribute('data-tab') === tab);
      });

      // Alterna as tabs
      document.querySelectorAll('[id^="tab-"]').forEach(t => {
        t.classList.toggle('active', t.id === `tab-${tab}`);
      });
    });
  });
}

/* ===== PWA Install Prompt ===== */
let deferredPrompt = null;

function initInstallPrompt() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!isMobile) return;

  const prompt = document.getElementById('installPrompt');
  if (!prompt) return;

  // Captura o evento beforeinstallprompt (disparado pelo inline script no HTML)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPrompt(prompt);
  });

  // Se já instalado, esconde
  if (window.matchMedia('(display-mode: standalone)').matches) {
    prompt.classList.remove('show');
  }
}

function showInstallPrompt(promptEl) {
  const btn = document.getElementById('installAppBtn');
  const dismiss = document.getElementById('installDismiss');

  if (btn && deferredPrompt) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Instalando…';
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('App instalado via PWA');
        }
      } catch (err) {
        // Fallback: tenta instalar via URL do app (APK/IPA)
        triggerAppDownload();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Baixar app';
        promptEl.classList.remove('show');
        deferredPrompt = null;
      }
    });
  } else if (btn) {
    // Fallback: sem evento beforeinstallprompt (iOS ou PWA não elegível)
    btn.addEventListener('click', () => {
      triggerAppDownload();
    });
  }

  if (dismiss) {
    dismiss.addEventListener('click', () => {
      promptEl.classList.remove('show');
      // Não perguntar de novo por 1 dia
      localStorage.setItem('installPromptDismissed', Date.now().toString());
    });
  }

  // Mostra o prompt (não se já foi dismissado recentmente)
  const dismissed = localStorage.getItem('installPromptDismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 86400000) {
    return; // não mostra de novo por 1 dia
  }

  // Mostra após breve delay
  setTimeout(() => {
    promptEl.classList.add('show');
  }, 1500);
}

/* ---- App Download (APK / IPA) ---- */
function initAppDownload() {
  const btn = document.getElementById('installAppBtn');
  if (!btn) return;

  // Se beforeinstallprompt existir, o handler já foi adicionado em initInstallPrompt.
  // Caso contrário, adiciona handler de fallback.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (!isIOS && !isAndroid) return; // desktop

  // Se não tiver evento beforeinstallprompt, usar download direto
  btn.addEventListener('click', () => {
    if (!deferredPrompt) {
      triggerAppDownload();
    }
    // Se deferredPrompt existir, o handler de initInstallPrompt já trata
  });
}

function triggerAppDownload() {
  // URLs de download do app nativo
  const iosUrl = 'https://apps.apple.com/app/hermes-pro/id0000000000';
  const androidUrl = 'https://play.google.com/store/apps/details?id=com.hermespro.app';

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isIOS) {
    window.location.href = iosUrl;
  } else if (isAndroid) {
    window.location.href = androidUrl;
  }
}

/* ---- Safe area insets ---- */
function initSafeArea() {
  // Adiciona classes para suportar notch/dinheiro no iOS
  const html = document.documentElement;
  const set = (prop, val) => html.style.setProperty(prop, val);

  // Define CSS custom properties para safe-area (usado pelo CSS)
  set('--safe-top', 'env(safe-area-inset-top, 0px)');
  set('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
  set('--safe-left', 'env(safe-area-inset-left, 0px)');
  set('--safe-right', 'env(safe-area-inset-right, 0px)');
}

/* ---- Bottom nav sync (mobile) ---- */
function initBottomNavSync() {
  // Sincroniza o bottom nav mobile com a desktop nav.
  // Quando o usuário clica em um item do desktop nav,
  // o mobile bottom nav deve refletir.
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item[data-tab]');
    if (!item) return;

    const tab = item.getAttribute('data-tab');
    // Sincroniza todos os .nav-item[data-tab] (desktop + mobile)
    document.querySelectorAll('.nav-item[data-tab]').forEach(navItem => {
      navItem.classList.toggle('active', navItem.getAttribute('data-tab') === tab);
    });
  });
}

/* ---- Helper: detect PWA standalone ---- */
window.isPWA = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

/* ---- Hide status bar when not mobile ---- */
window.addEventListener('resize', () => {
  const statusBar = document.getElementById('statusBar');
  if (statusBar) {
    const isMobile = window.innerWidth <= 767;
    statusBar.style.display = isMobile ? 'flex' : 'none';
  }
});
