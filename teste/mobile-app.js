/* mobile-app.js
 * Gerencia: splash screen timing, instalação PWA (beforeinstallprompt),
 * banner de download nativo para iOS/Android, e smooth scroll behavior.
 * Este arquivo é o ÚNICO novo JS criado — não toca nos módulos existentes.
 */

(function () {
  "use strict";

  /* ---- Elementos ---- */
  const splash = document.getElementById("splashScreen");
  const installBanner = document.getElementById("installBanner");
  const installBtn = document.getElementById("installPromptBtn");
  const installDismiss = document.getElementById("installDismissBtn");
  const downloadTriggers = document.querySelectorAll(".download-trigger");

  /* ---- iOS/Android app store links ---- */
  const APP_STORE_IOS = "https://apps.apple.com/app/hermes-pro-automation/id1234567890";
  const PLAY_STORE_ANDROID = "https://play.google.com/store/apps/details?id=pro.hermes.android";

  /* ---- Defer hide splash ---- */
  let splashHidden = false;

  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;

    if (splash) {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 0.4s ease";
      setTimeout(() => {
        if (splash && splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      }, 400);
    }

    showInstallBanner();
  }

  /* ---- Espera o app estar pronto (supabase carregado ou timeout) ---- */
  function waitForAppReady() {
    let attempts = 0;
    const maxAttempts = 100; // 10s max

    function check() {
      attempts++;

      // Considera pronto quando supabase tem sessão ou houve erro de conexão
      // (qualquer coisa — o splash não deve ficar infinito)
      const screens = document.querySelectorAll(".screen");

      // Verifica se não há mais "loading-row" visível no grid principal
      const loadingRows = document.querySelectorAll(".loading-row");
      const hasLoading = Array.from(loadingRows).some(el => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      if (
        // Telas já renderizaram conteúdo (auth, app, blocked, etc.)
        document.getElementById("authScreen") ||
        document.getElementById("appScreen") ||
        document.getElementById("blockedScreen") ||
        document.getElementById("setPasswordScreen") ||
        !hasLoading ||
        attempts >= maxAttempts
      ) {
        hideSplash();
      } else {
        setTimeout(check, 100);
      }
    }

    // Garante que o splash suma mesmo se nada carregar
    setTimeout(hideSplash, 5000);
    setTimeout(check, 300);
  }

  /* ---- PWA Install Prompt ---- */
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (!installBanner) return;
    if (isPWA()) return; // já é PWA — não precisa de banner

    installBanner.classList.remove("hidden");
    installBanner.classList.add("show");
  }

  function isPWA() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  /* ---- iOS não tem beforeinstallprompt → usa banner customizado ---- */
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isAndroid() {
    return /Android/.test(navigator.userAgent);
  }

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          console.log("Instalação PWA aceita");
        }
        deferredPrompt = null;
        dismissBanner();
      } else if (isIOS() || isAndroid()) {
        // Redireciona para a loja nativa
        window.open(
          isIOS() ? APP_STORE_IOS : PLAY_STORE_ANDROID,
          "_blank",
          "noopener,noreferrer"
        );
        dismissBanner();
      }
    });
  }

  if (installDismiss) {
    installDismiss.addEventListener("click", () => {
      dismissBanner();
      // Não volta a mostrar por 1 dia
      localStorage.setItem("hermes-install-dismissed", Date.now().toString());
    });
  }

  function dismissBanner() {
    if (installBanner) {
      installBanner.classList.remove("show");
      installBanner.classList.add("hidden");
    }
  }

  // Não mostra o banner se foi dismissado recentemente
  const dismissedAt = localStorage.getItem("hermes-install-dismissed");
  if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 86400000) {
    dismissBanner();
  }

  /* ---- Botões "download" dispersos (ex: no footer de auth) ---- */
  if (downloadTriggers.length) {
    downloadTriggers.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const action = btn.getAttribute("data-download-action");
        if (action === "info") {
          showDownloadInfo();
        }
      });
    });
  }

  function showDownloadInfo() {
    // Cria um mini modal informativo sobre o app nativo
    const existing = document.getElementById("downloadInfoModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "downloadInfoModal";

    const isIOSDevice = isIOS();

    overlay.innerHTML =
      '<div class="modal-box">' +
      '<div class="modal-header">' +
      "<h2>App Nativo Hermes Pro</h2>" +
      '<button type="button" class="modal-close" aria-label="Fechar">&times;</button>' +
      "</div>" +
      '<div class="modal-body">' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<div style="font-size:24px;">📱</div>' +
      '<div>' +
      "<p>Instale o app nativo para:</p>" +
      "<ul style='margin:6px 0 0;padding-left:18px;line-height:1.8;font-size:13px;color:var(--text-2);'>" +
      "<li>Notificações push em tempo real</li>" +
      "<li>Acesso offline às automações</li>" +
      "<li>A integração com a câmera do celular</li>" +
      "<li>Ícone na tela inicial como app real</li>" +
      "</ul>" +
      "</div>" +
      "</div>" +
      (isIOSDevice
        ? '<div style="margin-top:8px;"><p style="font-size:12px;color:var(--text-3);">Toque no botão abaixo para abrir a App Store.</p></div>'
        : '<div style="margin-top:8px;"><p style="font-size:12px;color:var(--text-3);">Toque no botão abaixo para abrir o Google Play.</p></div>') +
      "</div>" +
      '<div class="modal-footer" style="justify-content:space-between;">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="closeDownloadInfo">Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="goToStoreBtn">' +
      (isIOSDevice ? "App Store" : "Google Play") +
      "</button>" +
      "</div>" +
      "</div>";

    document.body.appendChild(overlay);

    overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById("closeDownloadInfo").addEventListener("click", () => overlay.remove());
    document.getElementById("goToStoreBtn").addEventListener("click", () => {
      window.open(
        isIOSDevice ? APP_STORE_IOS : PLAY_STORE_ANDROID,
        "_blank",
        "noopener,noreferrer"
      );
    });
  }

  /* ---- Smooth scroll behavior para âncoras ---- */
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  /* ---- Inicia ---- */
  // Mostra o splash se ele existe
  if (splash) {
    splash.style.display = "flex";
    waitForAppReady();
  } else {
    showInstallBanner();
  }

  // Se o DOM já carregou, já pode tentar esconder o splash apáginas sem JS app (ex: tela de login estática)
  if (document.readyState === "complete") {
    hideSplash();
  }
})();
