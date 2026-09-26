// pwa-install.js
// Cuida só da parte de "instalar o app": registra o service worker e
// controla os botões/banners de instalação (data-pwa-install). Isolado dos
// outros scripts do projeto — não importa nem é importado por eles.

(function () {
  "use strict";

  var deferredPrompt = null;
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {
        // Sem suporte (ex.: aberto via file://) — segue funcionando normal, só sem o cache do app shell.
      });
    });
  }

  function closeSheet() {
    var overlay = document.getElementById("installSheetOverlay");
    if (overlay) overlay.remove();
  }

  function openManualSheet() {
    closeSheet();
    var overlay = document.createElement("div");
    overlay.className = "install-sheet-overlay";
    overlay.id = "installSheetOverlay";
    var steps = isIos
      ? [
          "Toque no ícone de compartilhar " +
            '<svg class="share-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' +
            " na barra do Safari.",
          'Escolha <strong>"Adicionar à Tela de Início"</strong>.',
          'Toque em <strong>"Adicionar"</strong> — pronto, o Respondi vira um app.',
        ]
      : [
          "Toque no menu (⋮) do seu navegador.",
          'Escolha <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.',
          "Confirme — o Respondi abre como um app, sem barra de navegador.",
        ];
    overlay.innerHTML =
      '<div class="install-sheet">' +
      "<h3>Instalar o Respondi</h3>" +
      "<p>Tenha o painel como um app, com ícone na tela inicial.</p>" +
      "<ol>" + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
      '<button type="button" class="btn btn-primary btn-full" id="installSheetCloseBtn">Entendi</button>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeSheet();
    });
    document.getElementById("installSheetCloseBtn").addEventListener("click", closeSheet);
  }

  async function triggerInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (e) {}
      deferredPrompt = null;
      hideBanner();
      return;
    }
    openManualSheet();
  }

  function bindInstallButtons() {
    document.querySelectorAll("[data-pwa-install]").forEach(function (btn) {
      btn.addEventListener("click", triggerInstall);
    });
  }

  // Banner leve, só no celular, lembrando a pessoa de que dá pra instalar.
  function maybeShowBanner() {
    if (isStandalone) return;
    if (window.innerWidth > 900) return;
    if (localStorage.getItem("respondi-install-banner-dismissed") === "1") return;
    var host = document.querySelector("#tab-dashboard .panel-heading-row");
    if (!host || document.getElementById("installBanner")) return;
    var banner = document.createElement("div");
    banner.id = "installBanner";
    banner.className = "install-banner mobile-only";
    banner.innerHTML =
      '<span class="install-ico">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
      "</span>" +
      '<span class="install-copy"><strong>Instale o Respondi</strong><span>Abra como um app, direto da tela inicial.</span></span>' +
      '<button type="button" class="btn btn-primary btn-sm" data-pwa-install>Instalar</button>' +
      '<button type="button" class="install-close" id="installBannerClose" aria-label="Fechar">&times;</button>';
    host.insertAdjacentElement("afterend", banner);
    bindInstallButtons();
    document.getElementById("installBannerClose").addEventListener("click", hideBanner);
  }

  function hideBanner() {
    var banner = document.getElementById("installBanner");
    if (banner) banner.remove();
    localStorage.setItem("respondi-install-banner-dismissed", "1");
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    maybeShowBanner();
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hideBanner();
  });

  document.addEventListener("DOMContentLoaded", function () {
    bindInstallButtons();
    // iOS nunca dispara beforeinstallprompt — oferece o banner manual mesmo assim.
    if (isIos) maybeShowBanner();
  });
})();
