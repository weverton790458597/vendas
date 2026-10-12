// pwa-install.js
// Cuida só da parte de "instalar o app": registra o service worker e
// controla os botões/banners de instalação (data-pwa-install). Isolado dos
// outros scripts do projeto — não importa nem é importado por eles.
//
// Para o navegador instalar DE VERDADE (app com ícone próprio, sem barra de
// navegador) é preciso: HTTPS (ou localhost) + manifest.json válido
// (name, start_url, display "standalone", ícones 192x192 e 512x512) +
// service worker com handler de "fetch". Se algo disso faltar, o Chrome só
// oferece "Adicionar à tela inicial" (atalho que abre no navegador).
// Este script confere cada item e avisa o que está faltando.

(function () {
  "use strict";

  var deferredPrompt = null;
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  var ua = window.navigator.userAgent;
  var isIos = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  var isAndroid = /android/i.test(ua);
  var isSecureHost =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  var swSupported = "serviceWorker" in navigator && isSecureHost;
  var swRegistration = null;

  function isMobileViewport() {
    return window.innerWidth <= 900;
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  if (swSupported) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("service-worker.js")
        .then(function (reg) { swRegistration = reg; })
        .catch(function () {});
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
      "<p>No iPhone a instalação é pelo Safari — vira um app com ícone próprio, sem a barra do navegador.</p>" +
      "<ol>" +
      "<li>Abra esta página no <strong>Safari</strong> (não funciona dentro de outros navegadores).</li>" +
      "<li>Toque no ícone de compartilhar " +
      '<svg class="share-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' +
      " na barra do Safari.</li>" +
      '<li>Escolha <strong>"Adicionar à Tela de Início"</strong>.</li>' +
      '<li>Toque em <strong>"Adicionar"</strong>.</li>' +
      "</ol>"
    );
  }

  function openAndroidInstructions() {
    sheet(
      "Instalar o Respondi",
      "<p>Use o <strong>Chrome</strong> no Android:</p>" +
      "<ol>" +
      "<li>Toque nos três pontinhos <strong>⋮</strong> no canto do Chrome.</li>" +
      '<li>Escolha <strong>"Instalar app"</strong> (ou "Instalar aplicativo").</li>' +
      '<li>Confirme em <strong>"Instalar"</strong>.</li>' +
      "</ol>" +
      '<p>Se aparecer só <strong>"Adicionar à tela inicial"</strong>, isso cria apenas um atalho do navegador. ' +
      "A opção de app de verdade só aparece quando o site tem HTTPS, manifest e service worker corretos.</p>"
    );
  }

  // Confere manifest.json e service worker e devolve uma lista de problemas.
  async function diagnose() {
    var problems = [];
    if (!isSecureHost) {
      problems.push(
        "A página está aberta " +
        (window.location.protocol === "file:" ? "direto do arquivo" : "sem HTTPS") +
        ". Abra pelo endereço https:// do site publicado."
      );
      return problems;
    }
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      problems.push("Falta a tag <link rel=\"manifest\"> no index.html.");
    } else {
      try {
        var res = await fetch(link.href, { cache: "no-store" });
        if (!res.ok) throw new Error("status " + res.status);
        var m = await res.json();
        if (!m.name && !m.short_name) problems.push("manifest.json sem \"name\" / \"short_name\".");
        if (!m.start_url) problems.push("manifest.json sem \"start_url\".");
        if (["standalone", "fullscreen", "minimal-ui"].indexOf(m.display) === -1) {
          problems.push("manifest.json precisa de \"display\": \"standalone\" (hoje: " + (m.display || "não definido") + ").");
        }
        var sizes = (m.icons || []).map(function (i) { return String(i.sizes || ""); }).join(" ");
        if (!/\b192x192\b/.test(sizes)) problems.push("manifest.json sem ícone de 192x192.");
        if (!/\b512x512\b/.test(sizes)) problems.push("manifest.json sem ícone de 512x512.");
      } catch (e) {
        problems.push("Não consegui abrir o manifest.json (" + e.message + "). Confira se o arquivo está publicado na raiz do site.");
      }
    }
    if (!("serviceWorker" in navigator)) {
      problems.push("Este navegador não suporta service worker.");
    } else {
      try {
        var reg = swRegistration || (await navigator.serviceWorker.getRegistration());
        if (!reg) problems.push("O service-worker.js não foi registrado. Confira se o arquivo está publicado na raiz do site.");
      } catch (e) {
        problems.push("Não foi possível verificar o service worker.");
      }
    }
    return problems;
  }

  async function openNotReadyExplanation() {
    var problems = await diagnose();
    var list = problems.length
      ? "<p>O que impede a instalação de app agora:</p><ul>" +
        problems.map(function (p) { return "<li>" + p + "</li>"; }).join("") +
        "</ul>"
      : "<p>Manifest e service worker parecem corretos, mas o navegador ainda não liberou a instalação. " +
        "Recarregue a página, navegue um pouco e tente de novo. Se você já instalou antes, o Chrome não oferece de novo — procure o ícone do Respondi na tela inicial.</p>";
    sheet(
      "Instalação ainda não disponível",
      list +
      (isAndroid ? "<p>Enquanto isso, no Chrome: menu <strong>⋮</strong> → <strong>Instalar app</strong>.</p>" : "")
    );
  }

  async function triggerInstall() {
    if (isStandalone) return;
    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      try {
        var choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") hideBanner();
      } catch (e) {}
      return;
    }
    if (isIos) {
      openIosInstructions();
      return;
    }
    if (isAndroid) {
      // Sem prompt do Chrome: mostra o diagnóstico (se algo estiver errado)
      // ou o passo a passo manual.
      var problems = await diagnose();
      if (problems.length) {
        openNotReadyExplanation();
      } else {
        openAndroidInstructions();
      }
      return;
    }
    openNotReadyExplanation();
  }

  function bindInstallButtons() {
    document.querySelectorAll("[data-pwa-install]").forEach(function (btn) {
      if (btn.dataset.pwaBound === "1") return;
      btn.dataset.pwaBound = "1";
      btn.addEventListener("click", triggerInstall);
    });
  }

  // Banner no mobile. Aparece sempre que o app ainda não está instalado:
  // com o prompt real do Chrome/Edge ele instala direto; sem o prompt,
  // o botão abre o passo a passo (Android/iPhone) ou o diagnóstico.
  function maybeShowBanner() {
    if (isStandalone) return;
    if (!isMobileViewport()) return;
    if (storageGet("respondi-install-banner-dismissed") === "1") return;
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
    storageSet("respondi-install-banner-dismissed", "1");
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
    maybeShowBanner();
  });
})();
