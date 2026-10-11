// layout.js
// Melhorias só de INTERFACE. Não faz chamadas ao Supabase, não altera dados
// e não depende de nenhum outro script do projeto. Se este arquivo for
// removido, tudo continua funcionando (só perde estes extras):
//   1. Título da página (topbar + aba do navegador) acompanha o menu ativo
//   2. Sombra na topbar ao rolar a página
//   3. Volta ao topo ao trocar de aba do menu
//   4. Trava a rolagem do fundo quando há modal / folha aberta
//   5. Mostrar/ocultar senha
//   6. Enter envia login, criação de senha e convite
//   7. Botões [data-goto-subtab] (ex.: "Escolher nas últimas publicações")
//   8. Esc / clique fora fecham os modais de produto
//   9. Sub-aba ativa centraliza na faixa horizontal (celular)
(function () {
  "use strict";

  var BASE_TITLE = "Achei & Postei";
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var isMobile = function () { return window.matchMedia("(max-width: 900px)").matches; };

  /* 1. Título acompanha o menu ativo ---------------------------------- */
  function syncTitle() {
    var crumb = $("#pageCrumb");
    var active = $(".app-nav .nav-item.active");
    if (!active) return;
    var label = active.querySelector("span:not(.nav-ico)");
    if (!label) return;
    var text = label.textContent.trim();
    if (crumb && crumb.textContent !== text) crumb.textContent = text;
    var appScreen = $("#appScreen");
    if (appScreen && !appScreen.classList.contains("hidden")) {
      document.title = text + " — " + BASE_TITLE;
    }
  }

  function watchNav() {
    var nav = $(".app-nav");
    if (!nav) return;
    // pagamentos.js insere botões depois do carregamento, por isso observa filhos também
    new MutationObserver(syncTitle).observe(nav, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    var appScreen = $("#appScreen");
    if (appScreen) {
      new MutationObserver(syncTitle).observe(appScreen, { attributes: true, attributeFilter: ["class"] });
    }
    syncTitle();
  }

  /* 2. Sombra da topbar ------------------------------------------------ */
  function watchScroll() {
    var bar = $(".app-topbar");
    if (!bar) return;
    var tick = false;
    function update() {
      tick = false;
      bar.classList.toggle("is-scrolled", window.scrollY > 4);
    }
    window.addEventListener("scroll", function () {
      if (!tick) { tick = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* 4. Trava de rolagem com modal aberto -------------------------------- */
  var lockQueued = false;
  function updateScrollLock() {
    lockQueued = false;
    var modalOpen = !!document.querySelector(".modal-overlay:not(.hidden), .install-sheet-overlay, .trial-overlay");
    var sheet = $("#subtab-new");
    var sheetOpen = isMobile() && sheet && !sheet.classList.contains("hidden");
    document.body.classList.toggle("no-scroll", modalOpen || !!sheetOpen);
  }
  function queueLock() {
    if (lockQueued) return;
    lockQueued = true;
    requestAnimationFrame(updateScrollLock);
  }
  function watchLock() {
    new MutationObserver(queueLock).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("resize", queueLock);
  }

  /* Cliques delegados ---------------------------------------------------- */
  document.addEventListener("click", function (e) {
    var t = e.target;

    // 3. voltar ao topo ao trocar de aba do menu
    if (t.closest(".app-nav .nav-item")) window.scrollTo(0, 0);

    // 5. mostrar / ocultar senha
    var pw = t.closest("[data-pw-toggle]");
    if (pw) {
      var input = document.getElementById(pw.getAttribute("data-pw-toggle"));
      if (input) {
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        pw.classList.toggle("on", show);
        var label = show ? "Ocultar senha" : "Mostrar senha";
        pw.setAttribute("aria-label", label);
        pw.setAttribute("title", label);
        input.focus();
      }
      return;
    }

    // 7. atalhos para sub-abas
    var go = t.closest("[data-goto-subtab]");
    if (go) {
      var target = $('.subtab-btn[data-subtab="' + go.getAttribute("data-goto-subtab") + '"]');
      if (target) target.click();
      return;
    }

    // 9. centraliza a sub-aba ativa na faixa horizontal
    var sub = t.closest(".subtab-btn");
    if (sub && typeof sub.scrollIntoView === "function") {
      sub.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }

    // 8. clique no fundo escuro fecha os modais de produto
    if (t.id === "produtoModal") { var c1 = $("#closeProdutoModalBtn"); if (c1) c1.click(); }
    if (t.id === "produtoPickerModal") { var c2 = $("#closeProdutoPickerBtn"); if (c2) c2.click(); }
  });

  /* 6 e 8. Teclado -------------------------------------------------------- */
  var ENTER_MAP = {
    authEmail: "authSubmitBtn",
    authPassword: "authSubmitBtn",
    newPassword: "setPasswordBtn",
    inviteEmail: "inviteUserBtn",
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && ENTER_MAP[e.target.id]) {
      var btn = document.getElementById(ENTER_MAP[e.target.id]);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      return;
    }
    if (e.key === "Escape") {
      var pm = $("#produtoModal:not(.hidden)");
      var pk = $("#produtoPickerModal:not(.hidden)");
      var is = $("#installSheetOverlay");
      if (pm) { var a = $("#closeProdutoModalBtn"); if (a) a.click(); }
      else if (pk) { var b = $("#closeProdutoPickerBtn"); if (b) b.click(); }
      else if (is) { var c = $("#installSheetCloseBtn"); if (c) c.click(); }
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    watchNav();
    watchScroll();
    watchLock();
    updateScrollLock();
  });
})();
