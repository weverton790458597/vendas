// mobile-ui.js
// Comportamento exclusivo do layout mobile (<= 900px). Não altera os outros
// arquivos: só "clica" nos botões que já existem (sub-abas, menu, sair, etc.).
//  - botão flutuante "Nova automação" e "fechar" da folha
//  - tocar na foto de uma publicação abre a folha de nova automação
//  - engrenagem no topo com: Pagamentos, Admin, Alterar senha, Tema, Sair
//  - abre em "Publicações" por padrão e fecha a folha sozinho após salvar
//  - nomes curtos nas sub-abas (só no celular)
(function () {
  "use strict";

  var mq = window.matchMedia("(max-width: 900px)");
  function isMobile() { return mq.matches; }
  function $(sel) { return document.querySelector(sel); }
  function click(sel) { var el = $(sel); if (el) el.click(); return !!el; }

  /* ---------------- cliques delegados ---------------- */
  document.addEventListener("click", function (event) {
    var t = event.target;

    if (t.closest("[data-open-new-automation]")) { click('.subtab-btn[data-subtab="new"]'); return; }
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

    if (t.closest("#mobileSettingsBtn")) { openSettings(); return; }
  });

  /* ---------------- engrenagem + folha de configurações ---------------- */
  var ICONS = {
    pay: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
    admin: '<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z"/><path d="M9.5 12l1.8 1.8L14.8 10"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M17 6l3 3"/>',
    theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };
  function svg(name) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function injectGear() {
    var host = $(".topbar-actions");
    if (!host || $("#mobileSettingsBtn")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.id = "mobileSettingsBtn";
    b.className = "ms-gear";
    b.setAttribute("aria-label", "Configurações");
    b.title = "Configurações";
    b.innerHTML = svg("gear");
    host.insertBefore(b, host.firstChild);
  }

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
    var user = document.createElement("div");
    user.className = "ms-user";
    user.textContent = (($("#userEmailLabel") || {}).textContent || "").trim();
    sheet.appendChild(user);

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
  mq.addEventListener && mq.addEventListener("change", function () { if (!mq.matches) closeSettings(); applyLabels(); });

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
    injectGear();
    applyLabels();
    watchSave();
    var nav = $("#automationsSubtabNav");
    if (nav) new MutationObserver(applyLabels).observe(nav, { childList: true });
    // No celular o Painel abre direto nas publicações (o caminho principal).
    setTimeout(function () { if (isMobile()) click('.subtab-btn[data-subtab="posts"]'); }, 0);
  });
})();
