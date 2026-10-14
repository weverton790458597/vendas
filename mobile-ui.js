// mobile-ui.js  (v2 — estilo app nativo)
// Comportamento exclusivo do layout mobile (<= 900px). No desktop nada aparece.
//  - cabeçalho escuro com saudação + "pílulas" de números (como em apps nativos)
//  - barra inferior: Início · Painel · [+] · Contas · Mais   (o "+" cria automação)
//  - folha "Mais": Pagamentos, Administração, Alterar senha, Tema, Sair
//  - tabelas viram cartões (sem rolagem lateral)
//  - tocar no card de uma publicação abre a folha de nova automação
//  - abre em "Publicações" e fecha a folha sozinho após salvar
// Não altera os outros arquivos: só "clica" nos botões que já existem.
(function () {
  "use strict";

  var mq = window.matchMedia("(max-width: 900px)");
  function isMobile() { return mq.matches; }
  function $(sel) { return document.querySelector(sel); }
  function click(sel) { var el = $(sel); if (el) el.click(); return !!el; }
  function tap() { try { if (isMobile() && navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function num(n) { return Number(n || 0).toLocaleString("pt-BR"); }

  /* ---------------- ícones ---------------- */
  var ICONS = {
    pay: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
    admin: '<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z"/><path d="M9.5 12l1.8 1.8L14.8 10"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M17 6l3 3"/>',
    theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    dots: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>',
    cam: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>'
  };
  function svg(name, size, sw) {
    return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  /* ---------------- estado compartilhado ---------------- */
  var TITLES = { overview: "Início", dashboard: "Painel", accounts: "Contas", payments: "Pagamentos", admin: "Administração" };
  var lastOverview = null;

  function currentTab() {
    var a = $(".app-nav .nav-item.active");
    return a ? a.getAttribute("data-tab") : "overview";
  }

  function userInfo() {
    var label = $("#userEmailLabel");
    var text = ((label || {}).textContent || "").trim();
    var email = ((label || {}).title || "").trim() || (text.indexOf("@") > -1 ? text : "");
    var name = text && text.indexOf("@") === -1 ? text : "";
    var first = name ? name.split(" ")[0] : (email ? email.split("@")[0] : "");
    var initial = (($("#userAvatar") || {}).textContent || first.charAt(0) || "?").trim().charAt(0).toUpperCase();
    return { name: name || email, email: email, first: first, initial: initial };
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ---------------- cabeçalho (hero) ---------------- */
  function pill(icon, id, label) {
    return '<div class="mh-pill"><span class="mh-pill-ico">' + svg(icon, 16, 2.2) + '</span><b id="' + id + '">—</b><small>' + label + "</small></div>";
  }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function buildHero() {
    var bar = $(".app-topbar");
    if (!bar || $("#mHero")) return;
    var hero = document.createElement("div");
    hero.id = "mHero";
    hero.className = "m-hero";
    hero.innerHTML =
      '<div class="mh-greet">' +
      '<span class="mh-avatar" id="mhAvatar"></span>' +
      '<div class="mh-text"><div class="mh-hi" id="mhHi">Olá!</div><div class="mh-sub" id="mhSub">Carregando seus resultados…</div></div>' +
      "</div>" +
      '<div class="mh-pills" id="mhPills">' +
      pill("send", "mhDms", "DMs") + pill("zap", "mhAtivas", "ativas") + pill("cam", "mhContas", "contas") +
      "</div>" +
      '<h1 class="mh-title" id="mhTitle"></h1>';
    bar.insertAdjacentElement("afterend", hero);
    renderHero();
  }

  function renderHero() {
    var hero = $("#mHero");
    if (!hero) return;
    var tab = currentTab();
    var u = userInfo();
    hero.classList.toggle("is-home", tab === "overview");
    document.body.setAttribute("data-m-tab", tab);
    setText("mhAvatar", u.initial);
    setText("mhHi", u.first ? "Olá, " + u.first + "!" : "Olá!");
    setText("mhTitle", TITLES[tab] || "");
    if (lastOverview) {
      var o = lastOverview;
      setText("mhDms", num(o.enviadas));
      setText("mhAtivas", num(o.ativas));
      setText("mhContas", num(o.contas));
      setText("mhTaxa", o.taxa);
      var sub = $("#mhSub");
      if (sub) {
        var hoje = o.hoje && o.hoje.dia === todayKey() ? o.hoje.enviadas : null;
        sub.innerHTML = hoje !== null
          ? "Hoje você enviou <b>" + num(hoje) + "</b> " + (hoje === 1 ? "DM" : "DMs")
          : "Em " + num(o.dias || 30) + " dias você enviou <b>" + num(o.enviadas) + "</b> DMs";
      }
    }
    var more = $("#navMoreBtn");
    if (more) more.classList.toggle("active", tab === "payments" || tab === "admin");
  }

  window.addEventListener("overview-loaded", function (e) { lastOverview = e.detail || null; renderHero(); });
  window.addEventListener("user-nome-changed", function () { setTimeout(renderHero, 0); });

  /* ---------------- barra inferior: [+] e "Mais" ---------------- */
  function injectNav() {
    var nav = $(".app-nav");
    if (!nav || $("#navFab")) return;
    // Atenção: estes dois NÃO levam a classe "nav-item" de propósito — app.js, visao-geral.js e
    // pagamentos.js ligam cliques em todo ".nav-item" para trocar de aba e esconderiam a aba atual.
    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "navFab";
    fab.className = "nav-fab";
    fab.setAttribute("aria-label", "Nova automação");
    fab.setAttribute("data-open-new-automation", "");
    fab.innerHTML = svg("plus", 28, 2.6);
    var more = document.createElement("button");
    more.type = "button";
    more.id = "navMoreBtn";
    more.className = "nav-more";
    more.setAttribute("aria-label", "Mais opções");
    more.innerHTML = '<span class="nav-ico">' + svg("dots", 24, 2) + "</span><span>Mais</span>";
    nav.appendChild(fab);
    nav.appendChild(more);
    new MutationObserver(renderHero).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  function openNewAutomation() {
    if (currentTab() !== "dashboard") click('.nav-item[data-tab="dashboard"]');
    click('.subtab-btn[data-subtab="new"]');
  }

  /* ---------------- cliques delegados ---------------- */
  document.addEventListener("click", function (event) {
    var t = event.target;

    if (t.closest("[data-open-new-automation]")) { tap(); openNewAutomation(); return; }
    if (t.closest("[data-close-sheet]")) { click('.subtab-btn[data-subtab="list"]'); return; }
    if (t.closest(".app-nav .nav-item")) tap();

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

    if (t.closest("#navMoreBtn")) { tap(); openSettings(); return; }
  });

  /* ---------------- folha "Mais" ---------------- */
  function closeSettings() {
    var o = $("#msOverlay");
    if (!o) return;
    o.classList.add("closing");
    setTimeout(function () { if (o.parentNode) o.remove(); }, 160);
  }

  function openSettings() {
    var old = $("#msOverlay");
    if (old) old.remove();
    var u = userInfo();
    var items = [];
    if ($('.nav-item[data-tab="payments"]')) {
      items.push({ icon: "pay", label: "Pagamentos", run: function () { click('.nav-item[data-tab="payments"]'); } });
    }
    var admin = $("#adminTabBtn");
    if (admin && !admin.classList.contains("hidden")) {
      items.push({ icon: "admin", label: "Administração", run: function () { admin.click(); } });
    }
    if ($("#changePwBtn")) items.push({ icon: "key", label: "Alterar senha", run: function () { click("#changePwBtn"); } });
    var dark = document.documentElement.getAttribute("data-theme") !== "light";
    items.push({ icon: "theme", label: dark ? "Mudar para tema claro" : "Mudar para tema escuro", run: function () { click(".app-topbar [data-theme-toggle]"); } });
    items.push({ icon: "out", label: "Sair", danger: true, run: function () { click("#logoutBtn"); } });

    var overlay = document.createElement("div");
    overlay.id = "msOverlay";
    overlay.className = "ms-overlay";
    var sheet = document.createElement("div");
    sheet.className = "ms-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Mais opções");

    var head = document.createElement("div");
    head.className = "ms-user";
    var av = document.createElement("span");
    av.className = "ms-avatar";
    av.textContent = u.initial;
    var who = document.createElement("div");
    who.className = "ms-who";
    var strong = document.createElement("strong");
    strong.textContent = u.name || "Minha conta";
    who.appendChild(strong);
    if (u.email && u.email !== u.name) {
      var em = document.createElement("span");
      em.textContent = u.email;
      who.appendChild(em);
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
  if (mq.addEventListener) mq.addEventListener("change", function () { if (!mq.matches) closeSettings(); applyLabels(); });

  /* ---------------- nomes curtos nas sub-abas (só no celular) ---------------- */
  var SHORT = { posts: "Publicações", list: "Automações" };
  function applyLabels() {
    document.querySelectorAll("#automationsSubtabNav .subtab-btn").forEach(function (btn) {
      var key = btn.getAttribute("data-subtab");
      if (!SHORT[key]) return;
      if (!btn.dataset.fullLabel) btn.dataset.fullLabel = btn.textContent;
      btn.textContent = isMobile() ? SHORT[key] : btn.dataset.fullLabel;
    });
  }

  /* ---------------- tabelas viram cartões: cada célula ganha o nome da coluna ---------------- */
  var labelQueued = false;
  function labelTables() {
    labelQueued = false;
    document.querySelectorAll(".table-scroll table").forEach(function (table) {
      var heads = [].map.call(table.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      table.querySelectorAll("tbody tr").forEach(function (tr) {
        [].forEach.call(tr.children, function (td, i) {
          if (td.colSpan > 1 || td.hasAttribute("data-label") || !heads[i]) return;
          td.setAttribute("data-label", heads[i]);
        });
      });
    });
  }
  function queueLabels() {
    if (labelQueued) return;
    labelQueued = true;
    requestAnimationFrame(labelTables);
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
    injectNav();
    applyLabels();
    watchSave();
    labelTables();
    new MutationObserver(queueLabels).observe(document.body, { childList: true, subtree: true });
    var nav = $("#automationsSubtabNav");
    if (nav) new MutationObserver(applyLabels).observe(nav, { childList: true });
    var label = $("#userEmailLabel");
    if (label) new MutationObserver(renderHero).observe(label, { childList: true, characterData: true, subtree: true });
    // No celular o Painel abre direto nas publicações (o caminho principal).
    setTimeout(function () { if (isMobile()) click('.subtab-btn[data-subtab="posts"]'); }, 0);
  });
})();
