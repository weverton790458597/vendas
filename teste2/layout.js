// layout.js
// Comportamento da interface nova. Não acessa Supabase nem dados: só cuida de
// layout. Isolado — não depende de nenhum outro arquivo do projeto.
//
//  1. Cor da barra do navegador (theme-color) acompanha o tema claro/escuro.
//  2. Trava a rolagem da página quando a folha "Nova automação" (celular) ou
//     um modal está aberto.
//  3. Tabelas viram cartões no celular: copia o título de cada coluna para
//     data-label nas células (o CSS mostra esse rótulo).
//  4. Abas e menu: rolam até a aba tocada, voltam ao topo ao trocar de tela e
//     marcam aria-current no item ativo.
//  5. Barra de topo (celular) ganha uma linha ao rolar. Esc fecha a folha.

(function () {
  "use strict";

  var root = document.documentElement;
  var MOBILE = window.matchMedia("(max-width: 900px)");
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  var THEME_COLORS = { light: "#eef0f7", dark: "#0f0d1f" };

  function $(sel) { return document.querySelector(sel); }
  function all(sel) { return document.querySelectorAll(sel); }

  /* 1. theme-color */
  function syncThemeColor() {
    var meta = document.getElementById("themeColorMeta");
    var theme = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  }
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* 2. trava de rolagem */
  function isShown(el) { return el && !el.classList.contains("hidden"); }
  function syncScrollLock() {
    var sheetOpen = MOBILE.matches && isShown(document.getElementById("subtab-new"));
    var modalOpen = false;
    all(".modal-overlay, .install-sheet-overlay").forEach(function (m) {
      if (isShown(m)) modalOpen = true;
    });
    document.body.classList.toggle("is-locked", sheetOpen || modalOpen);
  }

  /* 3. rótulos das células */
  function labelTables() {
    all("table").forEach(function (table) {
      var heads = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
        return th.textContent.trim();
      });
      if (!heads.length) return;
      table.querySelectorAll("tbody tr").forEach(function (tr) {
        if (tr.dataset.labelled === "1") return;
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (!td.hasAttribute("colspan") && heads[i]) td.setAttribute("data-label", heads[i]);
        });
        tr.dataset.labelled = "1";
      });
    });
  }

  /* 4. menu ativo */
  function syncNavState() {
    all(".app-nav .nav-item").forEach(function (b) {
      if (b.classList.contains("active")) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  var queued = false;
  function refresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      syncScrollLock();
      labelTables();
      syncNavState();
    });
  }
  new MutationObserver(refresh).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["class"]
  });
  MOBILE.addEventListener && MOBILE.addEventListener("change", refresh);

  var behavior = function () { return REDUCED.matches ? "auto" : "smooth"; };

  document.addEventListener("click", function (e) {
    var tab = e.target.closest(".subtab-btn, .seg-btn");
    if (tab && tab.scrollIntoView) {
      tab.scrollIntoView({ inline: "center", block: "nearest", behavior: behavior() });
    }
    if (e.target.closest(".app-nav .nav-item")) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  });

  /* 5. barra de topo e Esc */
  var topbar = null;
  window.addEventListener("scroll", function () {
    topbar = topbar || $(".app-topbar");
    if (topbar) topbar.classList.toggle("is-scrolled", window.scrollY > 4);
  }, { passive: true });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !MOBILE.matches) return;
    if (isShown(document.getElementById("subtab-new"))) {
      var close = $("[data-close-sheet]");
      if (close) close.click();
    }
  });

  document.addEventListener("DOMContentLoaded", refresh);
  refresh();
})();
