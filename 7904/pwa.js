// pwa.js
// TODO O código de PWA fica isolado aqui, como pedido — nada disso toca ou
// depende do app.js. Cuida de 3 coisas:
//   1) Registrar o service worker (app shell offline / abertura instantânea)
//   2) Prompt de instalação customizado (Android/desktop Chrome) + dica pro
//      iOS (que não tem beforeinstallprompt)
//   3) Toast de "nova versão disponível" quando o SW atualiza
//   4) Atalhos do manifest.json (?tab=) abrindo a aba certa depois do login
(function () {
  "use strict";

  var INSTALL_DISMISS_KEY = "ap-pwa-install-dismissed-at";
  var INSTALL_DISMISS_DAYS = 14;
  var deferredInstallPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function wasRecentlyDismissed() {
    var raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    var elapsedDays = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
    return elapsedDays < INSTALL_DISMISS_DAYS;
  }

  function markDismissed() {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  }

  // ---------- Service worker ----------
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("./service-worker.js")
        .then(function (registration) {
          registration.addEventListener("updatefound", function () {
            var installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", function () {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateToast(registration);
              }
            });
          });
        })
        .catch(function (err) {
          console.warn("Falha ao registrar o service worker:", err);
        });

      var refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }

  function showUpdateToast(registration) {
    var toast = document.createElement("div");
    toast.className = "pwa-update-toast";
    toast.innerHTML =
      '<span class="pwa-update-dot"></span>' +
      "<span>Nova versão disponível</span>" +
      '<button type="button">Atualizar</button>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    toast.querySelector("button").addEventListener("click", function () {
      if (registration.waiting) {
        registration.waiting.postMessage("SKIP_WAITING");
      }
      toast.classList.remove("is-visible");
    });
  }

  // ---------- Prompt de instalação (Android / desktop Chrome, Edge) ----------
  function buildInstallBanner() {
    var banner = document.createElement("div");
    banner.className = "pwa-install-banner";
    banner.id = "pwaInstallBanner";
    banner.innerHTML =
      '<div class="pwa-install-icon"></div>' +
      '<div class="pwa-install-text">' +
      "<strong>Instalar Achei &amp; Postei</strong>" +
      "<span>Acesse direto da tela inicial, sem precisar do navegador.</span>" +
      "</div>" +
      '<div class="pwa-install-actions">' +
      '<button type="button" class="btn btn-primary" id="pwaInstallAcceptBtn">Instalar</button>' +
      '<button type="button" class="pwa-install-dismiss" id="pwaInstallDismissBtn" aria-label="Fechar">✕</button>' +
      "</div>";
    document.body.appendChild(banner);
    return banner;
  }

  function showInstallBanner(onAccept) {
    if (wasRecentlyDismissed() || isStandalone()) return;
    var existing = document.getElementById("pwaInstallBanner");
    var banner = existing || buildInstallBanner();

    document.getElementById("pwaInstallDismissBtn").addEventListener("click", function () {
      banner.classList.remove("is-visible");
      markDismissed();
    });
    document.getElementById("pwaInstallAcceptBtn").addEventListener("click", function () {
      banner.classList.remove("is-visible");
      onAccept();
    });

    requestAnimationFrame(function () {
      banner.classList.add("is-visible");
    });
  }

  function showIosInstallBanner() {
    showInstallBanner(function () {});
    // No iOS não existe prompt programático — troca o botão "Instalar" por
    // instruções do Safari (Compartilhar → Adicionar à Tela de Início).
    var acceptBtn = document.getElementById("pwaInstallAcceptBtn");
    var textEl = document.querySelector("#pwaInstallBanner .pwa-install-text");
    if (acceptBtn) acceptBtn.style.display = "none";
    if (textEl) {
      textEl.querySelector("span").textContent =
        "Toque em Compartilhar (□↑) e depois em \"Adicionar à Tela de Início\".";
    }
  }

  function setupInstallPrompt() {
    if (isStandalone()) return;

    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      showInstallBanner(function () {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.finally(function () {
          deferredInstallPrompt = null;
        });
      });
    });

    window.addEventListener("appinstalled", function () {
      markDismissed();
      var banner = document.getElementById("pwaInstallBanner");
      if (banner) banner.classList.remove("is-visible");
    });

    // iOS Safari não dispara beforeinstallprompt — mostra dica própria,
    // com um pequeno atraso pra não competir com a tela de login.
    if (isIos() && !window.MSStream) {
      setTimeout(showIosInstallBanner, 4000);
    }
  }

  // ---------- Atalhos do manifest.json (?tab=) ----------
  function applyShortcutTab() {
    var params = new URLSearchParams(window.location.search);
    var tab = params.get("tab");
    if (!tab) return;

    var appScreen = document.getElementById("appScreen");
    if (!appScreen) return;

    var tryClick = function () {
      if (appScreen.classList.contains("hidden")) return false;
      var target = document.querySelector('.nav-item[data-tab="' + tab + '"]');
      if (target) target.click();
      params.delete("tab");
      var clean =
        window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      history.replaceState(null, "", clean);
      return true;
    };

    if (tryClick()) return;

    var observer = new MutationObserver(function () {
      if (tryClick()) observer.disconnect();
    });
    observer.observe(appScreen, { attributes: true, attributeFilter: ["class"] });
    // Não fica observando pra sempre caso o usuário nunca conclua o login.
    setTimeout(function () {
      observer.disconnect();
    }, 60000);
  }

  registerServiceWorker();
  setupInstallPrompt();
  document.addEventListener("DOMContentLoaded", applyShortcutTab);
})();
