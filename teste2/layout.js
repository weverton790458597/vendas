// layout.js
// Seletor "premium" de conta do Instagram (substitui a lista nativa do <select>).
// O <select id="automationIgAccount"> continua no DOM, escondido, e é a fonte da
// verdade: app.js lê .value dele e instagram-latest-posts.js define .value nele.
// Este script só desenha um menu bonito por cima e mantém os dois sincronizados.

(function () {
  "use strict";

  var CHEV = '<svg class="cs-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var CHECK = '<svg class="cs-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function initialOf(text) {
    var t = String(text || "").replace(/^@/, "").trim();
    return t ? t.charAt(0).toUpperCase() : "?";
  }

  function enhance(select) {
    if (!select || select.dataset.csReady) return;
    select.dataset.csReady = "1";

    var field = select.closest(".field");
    var labelText = (field && field.querySelector(":scope > span, :scope > label") || {}).textContent || "Selecionar";

    var wrap = document.createElement("div");
    wrap.className = "cs";
    wrap.innerHTML =
      '<button type="button" class="cs-trigger" aria-haspopup="listbox" aria-expanded="false">' +
      '<span class="cs-avatar" aria-hidden="true"></span>' +
      '<span class="cs-value"></span>' + CHEV +
      "</button>" +
      '<div class="cs-backdrop"></div>' +
      '<div class="cs-menu" role="listbox" tabindex="-1">' +
      '<div class="cs-sheet-title"></div><div class="cs-list"></div></div>';

    var trigger = wrap.querySelector(".cs-trigger");
    var avatar = wrap.querySelector(".cs-avatar");
    var valueEl = wrap.querySelector(".cs-value");
    var menu = wrap.querySelector(".cs-menu");
    var list = wrap.querySelector(".cs-list");
    wrap.querySelector(".cs-sheet-title").textContent = labelText;
    trigger.setAttribute("aria-label", labelText);
    menu.setAttribute("aria-label", labelText);

    select.classList.add("cs-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.insertAdjacentElement("afterend", wrap);

    function items() {
      return Array.prototype.slice.call(list.querySelectorAll(".cs-item"));
    }

    function render() {
      list.innerHTML = "";
      var opts = Array.prototype.slice.call(select.options);
      opts.forEach(function (opt, i) {
        var selected = i === select.selectedIndex;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "cs-item";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", selected ? "true" : "false");
        b.dataset.index = String(i);
        var av = document.createElement("span");
        av.className = "cs-avatar";
        av.textContent = initialOf(opt.textContent);
        var name = document.createElement("span");
        name.className = "cs-name";
        name.textContent = opt.textContent;
        b.appendChild(av);
        b.appendChild(name);
        b.insertAdjacentHTML("beforeend", CHECK);
        list.appendChild(b);
      });
      var cur = select.options[select.selectedIndex];
      if (cur) {
        avatar.textContent = initialOf(cur.textContent);
        avatar.classList.remove("is-empty");
        valueEl.textContent = cur.textContent;
        valueEl.classList.remove("is-placeholder");
      } else {
        avatar.textContent = "?";
        avatar.classList.add("is-empty");
        valueEl.textContent = "Selecione uma conta";
        valueEl.classList.add("is-placeholder");
      }
    }

    function isOpen() { return wrap.classList.contains("open"); }

    function open() {
      if (isOpen() || !select.options.length) return;
      var rect = trigger.getBoundingClientRect();
      var below = window.innerHeight - rect.bottom;
      wrap.classList.toggle("up", below < 260 && rect.top > below);
      wrap.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      var sel = list.querySelector('[aria-selected="true"]') || items()[0];
      if (sel) sel.focus({ preventScroll: true });
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      wrap.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    }

    function choose(index) {
      if (select.selectedIndex !== index) {
        select.selectedIndex = index;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      render();
      close(true);
    }

    trigger.addEventListener("click", function () {
      if (isOpen()) close(false); else open();
    });
    trigger.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
      }
    });

    list.addEventListener("click", function (e) {
      var b = e.target.closest(".cs-item");
      if (b) choose(Number(b.dataset.index));
    });
    menu.addEventListener("keydown", function (e) {
      var els = items();
      var i = els.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); els[Math.min(i + 1, els.length - 1)].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); els[Math.max(i - 1, 0)].focus(); }
      else if (e.key === "Home") { e.preventDefault(); els[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); els[els.length - 1].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") { close(false); }
    });
    wrap.querySelector(".cs-backdrop").addEventListener("click", function () { close(false); });
    document.addEventListener("mousedown", function (e) {
      if (isOpen() && !wrap.contains(e.target)) close(false);
    });

    // Mantém sincronizado quando o app.js reescreve as opções...
    new MutationObserver(render).observe(select, { childList: true, subtree: true });
    // ...e quando outro script define select.value por código (não dispara "change").
    var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    Object.defineProperty(select, "value", {
      configurable: true,
      get: function () { return desc.get.call(this); },
      set: function (v) { desc.set.call(this, v); render(); },
    });

    render();
  }

  enhance(document.getElementById("automationIgAccount"));
})();
