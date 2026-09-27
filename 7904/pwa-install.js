// pwa-install.js
// Cuida só da parte de "instalar o app": registra o service worker e
// controla os botões/banners de instalação (data-pwa-install). Isolado dos
// outros scripts do projeto — não importa nem é importado por eles.
//
// IMPORTANTE: o navegador só instala de verdade (ícone próprio, sem barra
// de navegador) quando a página está servida por HTTPS (ou localhost), com
// o manifest.json e o service worker respondendo. Aberto direto do arquivo
// (file://) ou por um link http sem certificado, o Chrome nunca oferece a
// instalação real — no máximo cria um atalho que abre no navegador. Este
// script detecta essa diferença e avisa em vez de fingir que funcionou.

(function () {
  "use strict";

  var deferredPrompt = null;
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  var isSecureHost =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  var swSupported = "serviceWorker" in navigator && isSecureHost;

  if (swSupported) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }

  function closeSheet() {
    var overlay = document.getElementById("installSheetOverlay");
    if (overlay) overlay.remove();
  }

  function sheet(title, bodyHtml) {
    closeSheet();
    var overlay = document.createElement("div");
    overlay.className = "install-sheet-overlay";
    overlay.id = "installSheetOverlay";
    overlay.innerHTML =
      '<div class="install-sheet">' +
      "<h3>" + title + "</h3>" +
      bodyHtml +
      '<button type="button" class="btn btn-primary btn-full" id="installSheetCloseBtn">Entendi</button>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeSheet();
    });
    document.getElementById("installSheetCloseBtn").addEventListener("click", closeSheet);
  }

  function openIosInstructions() {
    sheet(
      "Instalar o Respondi",
      "<p>Isso instala de verdade — vira um app com ícone próprio, sem a barra do Safari.</p>" +
      "<ol>" +
      "<li>Toque no ícone de compartilhar " +
      '<svg class="share-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' +
      " na barra do Safari.</li>" +
      '<li>Escolha <strong>"Adicionar à Tela de Início"</strong>.</li>' +
      '<li>Toque em <strong>"Adicionar"</strong>.</li>' +
      "</ol>"
    );
  }

  function openNotReadyExplanation() {
    var reason = !isSecureHost
      ? "Esta página está aberta " +
        (window.location.protocol === "file:" ? "direto do arquivo" : "por um endereço sem HTTPS") +
        ", e por isso o navegador não libera a instalação de verdade — no máximo salva um atalho que abre no navegador, não um app."
      : "Este navegador ainda não sinalizou suporte à instalação automática nesta página.";
    sheet(
      "Instalação ainda não disponível aqui",
      "<p>" + reason + "</p>" +
      "<p>Hospede esta pasta em um endereço com HTTPS (ex: Vercel, Netlify, Cloudflare Pages ou seu próprio domínio) e abra por lá — no Chrome/Edge o botão \"Instalar\" passa a funcionar sozinho, com o app de verdade indo pra tela inicial.</p>"
    );
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
    if (isIos) {
      openIosInstructions();
      return;
    }
    openNotReadyExplanation();
  }

  function bindInstallButtons() {
    document.querySelectorAll("[data-pwa-install]").forEach(function (btn) {
      btn.addEventListener("click", triggerInstall);
    });
  }

  // Banner leve no mobile — só aparece quando a instalação é de fato
  // possível (prompt real do Chrome/Edge, ou iOS onde o atalho vira app de verdade).
  function maybeShowBanner() {
    if (isStandalone) return;
    if (window.innerWidth > 900) return;
    if (!deferredPrompt && !isIos) return;
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
    if (isIos) maybeShowBanner();
  });
})();
