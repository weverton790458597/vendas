// layout.js
// Cola de interface do novo layout. Não faz chamadas ao Supabase e não altera
// regras de negócio: só cuida de comportamento visual que os outros scripts
// não cobrem. Se este arquivo falhar ou for removido, nenhuma função some.
//
//  1. Enter envia os formulários de login / definir senha (não são <form>).
//  2. Botão de mostrar/ocultar senha.
//  3. No celular, "Nova automação" é uma folha: começa fechada (lista aberta),
//     trava a rolagem do fundo enquanto aberta.
//  4. Botões "Criar automação" dos cards de publicações abrem a folha/sub-aba
//     "Nova automação" antes de preencher o formulário.
//  5. Diálogos fixos (produto / seletor): fecham com Esc e clicando fora.
//  6. Ao trocar de aba no menu, volta ao topo da página.

(function () {
  "use strict";

  var mq = window.matchMedia("(max-width: 900px)");
  var $ = function (id) { return document.getElementById(id); };

  /* 1. Enter nos formulários de autenticação */
  function enterToClick(inputId, buttonId) {
    var input = $(inputId);
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var btn = $(buttonId);
        if (btn && !btn.disabled) btn.click();
      }
    });
  }

  /* 2. Mostrar / ocultar senha */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle-password]");
    if (!t) return;
    var input = $(t.getAttribute("data-toggle-password"));
    if (input) input.type = input.type === "password" ? "text" : "password";
  });

  /* 3. Folha "Nova automação" no celular */
  function setSubtab(name) {
    document.querySelectorAll("#automationsSubtabNav .subtab-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-subtab") === name);
    });
    document.querySelectorAll(".subtab-panel").forEach(function (p) {
      p.classList.toggle("hidden", p.id !== "subtab-" + name);
    });
  }

  function syncSheetState() {
    var sheet = $("subtab-new");
    var dash = $("tab-dashboard");
    var open =
      mq.matches &&
      sheet && !sheet.classList.contains("hidden") &&
      dash && !dash.classList.contains("hidden");
    document.body.classList.toggle("sheet-open", !!open);
  }

  /* 5. Diálogos fixos */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".dialog-overlay:not(.hidden)").forEach(function (ov) {
      var closeBtn = ov.querySelector("[data-dialog-close]");
      if (closeBtn) closeBtn.click();
      else ov.classList.add("hidden");
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.classList || !e.target.classList.contains("dialog-overlay")) return;
    var closeBtn = e.target.querySelector("[data-dialog-close]");
    if (closeBtn) closeBtn.click();
    else e.target.classList.add("hidden");
  });

  /* 4. "Criar automação" a partir de um post: mostra o formulário primeiro.
        Captura (true) para rodar antes do handler do próprio botão, que dá
        foco em um campo que ainda estaria escondido. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".create-automation-from-post-btn, .latest-post-btn")) return;
    var newBtn = document.querySelector('#automationsSubtabNav .subtab-btn[data-subtab="new"]');
    if (newBtn) newBtn.click();
  }, true);

  /* 6. Voltar ao topo ao trocar de aba */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".app-nav .nav-item")) {
      setTimeout(function () { window.scrollTo(0, 0); }, 0);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    enterToClick("authEmail", "authSubmitBtn");
    enterToClick("authPassword", "authSubmitBtn");
    enterToClick("newPassword", "setPasswordBtn");

    // No celular, abre na lista (a folha só abre pelo botão flutuante).
    if (mq.matches) setSubtab("list");

    var obs = new MutationObserver(syncSheetState);
    ["subtab-new", "tab-dashboard"].forEach(function (id) {
      var el = $(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    });
    var onChange = function () { syncSheetState(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    syncSheetState();
  });
})();
