// mobile-ui.js
// Comportamento exclusivo do layout mobile (<= 900px), no estilo "app nativo".
// Não altera os outros arquivos: só lê o que já existe na tela e "clica" nos
// botões que já existem (abas, sub-abas, tema, sair...).
//  - cabeçalho em degradê: avatar + saudação + indicadores (Ativas, Pausadas, DMs, Taxa)
//  - barra de baixo: Início · Painel · [+] · Contas · Mais
//  - "Mais" / avatar abrem a folha: Pagamentos, Admin, Alterar senha, Tema, Sair
//  - botão central "+" abre "Nova automação" de qualquer aba
//  - toque na foto de uma publicação abre a folha de nova automação
//  - tabelas viram cards (os <td> ganham o rótulo do <th> automaticamente)
//  - abre em "Publicações" por padrão e fecha a folha sozinho após salvar
(function () {
  "use strict";

  var mq = window.matchMedia("(max-width: 900px)");
  function isMobile() { return mq.matches; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function click(sel) { var el = $(sel); if (el) el.click(); return !!el; }

  var ICONS = {
    pay: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
    admin: '<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z"/><path d="M9.5 12l1.8 1.8L14.8 10"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M17 6l3 3"/>',
    theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  function svg(name, size, sw) {
    return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  /* ---------------- cliques delegados ---------------- */
  document.addEventListener("click", function (event) {
    var t = event.target;

    if (t.closest("[data-open-new-automation]")) {
      // De qualquer aba: vai para o Painel e abre a folha.
      var dash = $("#tab-dashboard");
      if (isMobile() && dash && dash.classList.contains("hidden")) click('.nav-item[data-tab="dashboard"]');
      click('.subtab-btn[data-subtab="new"]');
      return;
    }
    if (t.closest("[data-close-sheet]")) { click('.subtab-btn[data-subtab="list"]'); return; }

    // "Criar automação" de um post: o outro script só preenche os campos,
    // aqui a gente também abre a folha do formulário.
    if (t.closest(".latest-post-btn")) {
      if (isMobile()) click('.subtab-btn[data-subtab="new"]');
      return;
    }
    // Tocar em qualquer parte do card do post = criar automação.
    var card = t.closest(".latest-post-card");
    if (card && isMobile() && !t.closest("button")) {
      var b = card.querySelector(".latest-post-btn");
      if (b) b.click();
      return;
    }

    if (t.closest("#navMoreBtn") || t.closest("#mHeroAvatar")) { openSettings(); return; }
    if (t.closest("#mHeroTheme")) { click(".app-topbar [data-theme-toggle]"); return; }
    if (t.closest(".app-nav .nav-item")) setTimeout(refreshHero, 0);
  });

  /* ---------------- cabeçalho em degradê ---------------- */
  var PILLS = [
    { id: "pillAtivas", label: "Ativas", get: function () { return txt("#kpiAtivas"); } },
    { id: "pillPausadas", label: "Pausadas", get: function () { return txt("#kpiPausadas"); } },
    { id: "pillDms", label: "DMs enviadas", get: function () { return txt("#ovKpis .kpi-item:nth-child(1) .kpi-value"); } },
    { id: "pillTaxa", label: "Taxa de sucesso", get: function () { return txt("#ovKpis .kpi-item:nth-child(3) .kpi-value"); } }
  ];
  function txt(sel) { var el = $(sel); return el ? el.textContent.trim() : ""; }

  var TITLES = {
    overview: "Resumo das suas automações",
    dashboard: "Suas automações",
    accounts: "Contas e plano",
    payments: "Pagamentos",
    admin: "Administração"
  };

  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }
  function firstName() {
    var raw = txt("#userEmailLabel");
    if (!raw) return "";
    raw = raw.split("@")[0].split(/[\s._-]+/)[0];
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }
  function activeTab() {
    var a = $(".app-nav .nav-item.active");
    return a ? a.getAttribute("data-tab") : "overview";
  }

  function buildHero() {
    if ($("#mHero")) return;
    var app = $("#appScreen");
    var body = app && $(".app-body", app);
    if (!app || !body) return;
    var hero = document.createElement("header");
    hero.id = "mHero";
    hero.className = "m-hero";
    hero.innerHTML =
      '<div class="m-hero-top">' +
      '<button type="button" id="mHeroAvatar" class="m-hero-avatar" aria-label="Configurações da conta"></button>' +
      '<div class="m-hero-hello"><strong id="mHeroHello"></strong><span id="mHeroSub"></span></div>' +
      '<button type="button" id="mHeroTheme" class="m-hero-btn" aria-label="Alternar tema">' + svg("theme", 20) + "</button>" +
      "</div>" +
      '<div id="mHeroPills" class="m-hero-pills" aria-label="Indicadores"></div>';
    app.insertBefore(hero, body);
    var pills = $("#mHeroPills", hero);
    PILLS.forEach(function (p) {
      var d = document.createElement("div");
      d.className = "m-pill";
      d.id = p.id;
      d.innerHTML = '<b>—</b><span></span>';
      d.lastChild.textContent = p.label;
      pills.appendChild(d);
    });
    refreshHero();
  }

  function refreshHero() {
    if (!$("#mHero")) return;
    var name = firstName();
    $("#mHeroHello").textContent = greeting() + (name ? ", " + name : "");
    $("#mHeroSub").textContent = TITLES[activeTab()] || "";
    var av = $("#mHeroAvatar");
    av.textContent = txt("#userAvatar") || (name ? name.charAt(0) : "");
    var founder = $("#founderBadgeIco");
    av.classList.toggle("is-founder", !!founder && !founder.classList.contains("hidden"));
    PILLS.forEach(function (p) {
      var el = $("#" + p.id + " b");
      if (el) el.textContent = p.get() || "—";
    });
    document.documentElement.setAttribute("data-mtab", activeTab());
    syncThemeColor();
  }

  // A barra de status do celular acompanha o degradê do cabeçalho.
  function syncThemeColor() {
    var app = $("#appScreen");
    var on = isMobile() && app && !app.classList.contains("hidden");
    $$('meta[name="theme-color"]').forEach(function (m) {
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute("content");
      m.setAttribute("content", on ? "#2b1560" : m.dataset.orig);
    });
  }

  function watchHero() {
    ["#kpiAtivas", "#kpiPausadas", "#ovKpis", "#userEmailLabel", "#userAvatar"].forEach(function (sel) {
      var el = $(sel);
      if (el) new MutationObserver(refreshHero).observe(el, { childList: true, characterData: true, subtree: true });
    });
    var nav = $(".app-nav");
    if (nav) new MutationObserver(refreshHero).observe(nav, { attributes: true, attributeFilter: ["class"], subtree: true });
    var founder = $("#founderBadgeIco");
    if (founder) new MutationObserver(refreshHero).observe(founder, { attributes: true, attributeFilter: ["class"] });
    var app = $("#appScreen");
    if (app) new MutationObserver(syncThemeColor).observe(app, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------------- barra de baixo: [+] central e "Mais" ---------------- */
  function buildNav() {
    var nav = $(".app-nav");
    if (!nav || $("#navFab")) return;
    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "navFab";
    fab.className = "nav-fab";
    fab.setAttribute("data-open-new-automation", "");
    fab.setAttribute("aria-label", "Nova automação");
    fab.innerHTML = svg("plus", 26, 2.6);
    var more = document.createElement("button");
    more.type = "button";
    more.id = "navMoreBtn";
    more.className = "nav-more";
    more.innerHTML = '<span class="nav-ico">' + svg("more", 24, 2.6) + "</span><span>Mais</span>";
    var collapse = $(".nav-collapse", nav);
    nav.insertBefore(fab, collapse);
    nav.insertBefore(more, collapse);
  }

  /* ---------------- folha de configurações ---------------- */
  function closeSettings() {
    var o = $("#msOverlay");
    if (o) o.remove();
  }

  function openSettings() {
    closeSettings();
    var items = [];
    if ($('.nav-item[data-tab="payments"]')) {
      items.push({ icon: "pay", label: "Pagamentos", run: function () { click('.nav-item[data-tab="payments"]'); } });
    }
    var admin = $("#adminTabBtn");
    if (admin && !admin.classList.contains("hidden")) {
      items.push({ icon: "admin", label: "Administração", run: function () { admin.click(); } });
    }
    if ($("#changePwBtn")) items.push({ icon: "key", label: "Alterar senha", run: function () { click("#changePwBtn"); } });
    items.push({ icon: "theme", label: "Alternar tema claro/escuro", run: function () { click(".app-topbar [data-theme-toggle]"); } });
    items.push({ icon: "out", label: "Sair", danger: true, run: function () { click("#logoutBtn"); } });

    var overlay = document.createElement("div");
    overlay.id = "msOverlay";
    overlay.className = "ms-overlay";
    var sheet = document.createElement("div");
    sheet.className = "ms-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Configurações");

    var head = document.createElement("div");
    head.className = "ms-head";
    var av = document.createElement("span");
    av.className = "ms-avatar";
    av.textContent = txt("#userAvatar");
    var who = document.createElement("div");
    who.className = "ms-user";
    var nm = document.createElement("strong");
    nm.textContent = txt("#userEmailLabel");
    who.appendChild(nm);
    var mail = ($("#userEmailLabel") || {}).title;
    if (mail && mail !== nm.textContent) {
      var sm = document.createElement("span");
      sm.textContent = mail;
      who.appendChild(sm);
    }
    head.appendChild(av);
    head.appendChild(who);
    sheet.appendChild(head);

    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ms-item" + (it.danger ? " danger" : "");
      b.innerHTML = svg(it.icon) + "<span></span>";
      b.lastChild.textContent = it.label;
      b.addEventListener("click", function () {
        closeSettings();
        setTimeout(it.run, 0);
      });
      sheet.appendChild(b);
    });

    overlay.appendChild(sheet);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSettings(); });
    document.body.appendChild(overlay);
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSettings(); });
  mq.addEventListener && mq.addEventListener("change", function () { if (!mq.matches) closeSettings(); applyLabels(); labelTables(); syncThemeColor(); });

  /* ---------------- nomes curtos nas sub-abas (só no celular) ---------------- */
  var SHORT = { posts: "Publicações", list: "Automações" };
  function applyLabels() {
    $$("#automationsSubtabNav .subtab-btn").forEach(function (btn) {
      var key = btn.getAttribute("data-subtab");
      if (!SHORT[key]) return;
      if (!btn.dataset.fullLabel) btn.dataset.fullLabel = btn.textContent;
      var want = isMobile() ? SHORT[key] : btn.dataset.fullLabel;
      if (btn.textContent !== want) btn.textContent = want;
    });
  }

  /* ---------------- tabelas viram cards: <td data-label> automático ---------------- */
  function labelTables() {
    $$("table").forEach(function (table) {
      var heads = $$("thead th", table).map(function (th) { return th.textContent.trim(); });
      if (!heads.length) return;
      table.classList.add("m-cards");
      $$("tbody tr", table).forEach(function (tr) {
        $$("td", tr).forEach(function (td, i) {
          if (td.hasAttribute("data-label") || td.colSpan > 1) return;
          if (heads[i]) td.setAttribute("data-label", heads[i]);
        });
      });
    });
  }
  var labelTimer;
  function scheduleLabelTables() {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(labelTables, 60);
  }

  /* ---------------- após salvar, fecha a folha e mostra a lista ---------------- */
  function watchSave() {
    var banner = $("#statusBanner");
    if (!banner) return;
    new MutationObserver(function () {
      var sheetOpen = $("#subtab-new") && !$("#subtab-new").classList.contains("hidden");
      if (isMobile() && sheetOpen && banner.classList.contains("success") && /salva/i.test(banner.textContent)) {
        click('.subtab-btn[data-subtab="list"]');
      }
    }).observe(banner, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildHero();
    buildNav();
    watchHero();
    applyLabels();
    labelTables();
    watchSave();
    var nav = $("#automationsSubtabNav");
    if (nav) new MutationObserver(applyLabels).observe(nav, { childList: true });
    var main = $(".app-main");
    if (main) new MutationObserver(scheduleLabelTables).observe(main, { childList: true, subtree: true });
    // O topo muda de "Bom dia" para "Boa tarde" sem recarregar.
    setInterval(refreshHero, 5 * 60 * 1000);
    // No celular o Painel abre direto nas publicações (o caminho principal).
    setTimeout(function () { if (isMobile()) click('.subtab-btn[data-subtab="posts"]'); }, 0);
  });
})();
