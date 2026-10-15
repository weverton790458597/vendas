// nova-automacao.js
// Ajustes da aba "Nova automação":
//  1) Botão "Escolher post da conta": janela com as publicações de uma conta conectada.
//     Ao tocar num post, preenche o post e a conta do formulário.
//  2) Formulário organizado em etapas e botão de fechar no celular.
// Módulo isolado: client próprio que só LÊ a sessão do app.js, estilos injetados aqui.
// Usa os ids do bloco #subtab-new do index.html.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeImg = (u) => (/^https:\/\/\S+$/i.test(String(u || "")) ? String(u) : "");
const oneLine = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const initial = (s) => String(s || "?").replace(/^@/, "").charAt(0).toUpperCase();

let userId = null;
let accounts = [];   // [{ id, instagram_username }]
let activeId = null; // conta com as publicações exibidas
let posts = [];      // publicações da conta ativa
let seq = 0;         // descarta respostas antigas (troca rápida de conta)
const cache = {};    // configId -> publicações
let overlay = null;

/* ------------------------------ estilos ------------------------------ */
function injectStyles() {
  if ($("nfStyles")) return;
  const st = document.createElement("style");
  st.id = "nfStyles";
  st.textContent = `
    .nf-hide { display: none !important; }

    /* ---------- Formulário em etapas ---------- */
    .nf { max-width: 760px; background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); overflow: hidden; }
    .nf-head { display: flex; align-items: center; gap: 0.75rem; padding: 1.1rem 1.3rem; border-bottom: 1px solid var(--border-soft); }
    .nf-head-txt { flex: 1; min-width: 0; }
    .nf-head h2 { margin: 0; font-size: 1.05rem; }
    .nf-head p { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--text-muted); }
    .nf-close { display: none; width: 36px; height: 36px; flex-shrink: 0; align-items: center; justify-content: center;
      border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: 1rem; cursor: pointer; }
    .nf-body { padding: 1.2rem 1.3rem 1.3rem; }
    .nf-sec { padding: 1.1rem 0; border-top: 1px solid var(--border-soft); }
    .nf-sec:first-child { border-top: 0; padding-top: 0; }
    .nf-sec-h { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; font-family: var(--font-display); font-weight: 600; font-size: 0.92rem; }
    .nf-sec-h b { width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border);
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; }
    .nf-toggle { margin-left: auto; border: 0; background: none; color: var(--accent-solid); font-weight: 600; font-size: 0.82rem; cursor: pointer; padding: 0.2rem 0.3rem; }
    .nf-row { display: flex; gap: 0.5rem; align-items: stretch; }
    .nf-row input { flex: 1; min-width: 0; }
    .nf-row .btn { flex-shrink: 0; }
    .nf-hint { font-size: 0.8rem; color: var(--text-faint); margin: 0 0 0.8rem; }
    .nf-picked { margin: 0 0 0.9rem; padding: 0.6rem 0.8rem; border-radius: 10px; background: var(--accent-tint); font-size: 0.84rem; color: var(--text); }
    .nf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; }
    .nf-full { grid-column: 1 / -1; }
    .nf-foot { display: flex; justify-content: flex-end; padding-top: 1.1rem; border-top: 1px solid var(--border-soft); }
    .nf-save { min-width: 200px; min-height: 46px; }

    /* ---------- Janela "Escolher publicação" ----------
       Layout em grid com linhas explícitas: cabeçalho, abas, busca e, por último,
       a grade com a altura que sobra (minmax(0, 1fr)). Só a grade rola. */
    .nf-overlay { position: fixed; inset: 0; z-index: 300; background: var(--overlay);
      display: flex; align-items: center; justify-content: center; padding: 24px;
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: nfFade 0.16s var(--ease); }
    @keyframes nfFade { from { opacity: 0; } to { opacity: 1; } }

    .nf-sheet { width: 100%; max-width: 760px; height: min(86vh, 820px); max-height: 86vh;
      display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); grid-template-columns: minmax(0, 1fr);
      background: var(--surface); border: 1px solid var(--border-soft); border-radius: 18px; box-shadow: var(--shadow-pop);
      overflow: hidden; animation: nfPop 0.2s var(--ease); }
    @keyframes nfPop { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }

    .nf-sheet-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem 0.9rem; }
    .nf-title h3 { margin: 0; font-size: 1.08rem; font-family: var(--font-display); font-weight: 600; }
    .nf-title p { margin: 0.2rem 0 0; font-size: 0.82rem; color: var(--text-muted); }
    .nf-sheet-acts { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
    .nf-iconbtn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px;
      border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); cursor: pointer; transition: color .15s, border-color .15s; }
    .nf-iconbtn:hover { color: var(--text); border-color: var(--text-faint); }

    .nf-tabs { display: flex; gap: 0.4rem; padding: 0 1.25rem 0.9rem; overflow-x: auto; scrollbar-width: none;
      border-bottom: 1px solid var(--border-soft); }
    .nf-tabs::-webkit-scrollbar { display: none; }
    .nf-chip { display: inline-flex; align-items: center; gap: 0.5rem; flex-shrink: 0; padding: 0.35em 0.85em 0.35em 0.35em; border-radius: 999px;
      border: 1px solid var(--border); background: var(--bg-soft); color: var(--text-muted); font: inherit; font-size: 0.84rem; font-weight: 600; cursor: pointer;
      transition: all .15s var(--ease); }
    .nf-chip:hover { color: var(--text); border-color: var(--text-faint); }
    .nf-chip.on { background: var(--accent-tint); border-color: var(--accent-solid); color: var(--text); }
    .nf-av { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      background: var(--surface-2); color: var(--text-muted); font-size: 0.72rem; font-weight: 700; }
    .nf-chip.on .nf-av { background: var(--accent-solid); color: #fff; }

    .nf-toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.9rem 1.25rem; }
    .nf-search { flex: 1; position: relative; display: flex; align-items: center; min-width: 0; }
    .nf-search svg { position: absolute; left: 0.85rem; color: var(--text-faint); pointer-events: none; }
    .nf-search input { margin: 0; padding-left: 2.5rem; height: 42px; border-radius: 12px; background: var(--bg-soft); }
    .nf-count { font-size: 0.78rem; color: var(--text-faint); white-space: nowrap; }

    .nf-grid { min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; align-content: start;
      padding: 0 1.25rem 1.25rem; }

    .nf-post { display: flex; flex-direction: column; width: 100%; min-width: 0; padding: 0; border: 1px solid var(--border-soft); border-radius: 12px;
      background: var(--bg-soft); overflow: hidden; cursor: pointer; text-align: left; color: var(--text); font: inherit;
      transition: border-color .15s var(--ease), transform .15s var(--ease), box-shadow .15s var(--ease); }
    .nf-post:hover { border-color: var(--accent-solid); transform: translateY(-2px); box-shadow: 0 10px 22px -14px rgba(0,0,0,.45); }
    .nf-post:active { transform: scale(0.98); }
    .nf-post:focus-visible { outline: 2px solid var(--accent-solid); outline-offset: 2px; }

    /* Proporção 1:1 com padding-top: funciona em qualquer navegador */
    .nf-media { position: relative; width: 100%; padding-top: 100%; background: var(--surface-2); overflow: hidden; flex-shrink: 0; }
    .nf-media img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; display: block; }
    .nf-media-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: var(--text-faint); }
    .nf-kind { position: absolute; top: 8px; right: 8px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 8px;
      background: rgba(0,0,0,.55); color: #fff; font-size: 0.7rem; display: inline-flex; align-items: center; justify-content: center; }

    /* Legenda com até 3 linhas */
    .nf-meta { display: flex; flex-direction: column; gap: 4px; padding: 0.6rem 0.7rem 0.7rem; }
    .nf-cap { font-size: 0.8rem; line-height: 1.35; color: var(--text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .nf-when { font-size: 0.72rem; color: var(--text-faint); }

    .nf-skel .nf-media { background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-hover) 37%, var(--surface-2) 63%);
      background-size: 400% 100%; animation: nfShim 1.2s ease infinite; }
    .nf-skel .nf-cap { height: 10px; -webkit-line-clamp: 1; margin-top: 4px; border-radius: 6px; background: var(--surface-2); }
    .nf-skel .nf-when { height: 8px; width: 40%; border-radius: 6px; background: var(--surface-2); }
    @keyframes nfShim { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

    .nf-state { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; text-align: center;
      color: var(--text-muted); font-size: 0.9rem; }
    .nf-state .nf-state-ico { width: 44px; height: 44px; border-radius: 14px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
    .nf-state .nf-retry { margin-top: 0.2rem; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: 10px;
      padding: 0.5em 1em; font: inherit; font-size: 0.84rem; font-weight: 600; cursor: pointer; }

    /* ---------- Celular: folha inferior ---------- */
    @media (max-width: 900px) {
      .app-body { z-index: auto !important; }
      #subtab-new:not(.hidden) { position: fixed; inset: 0; z-index: 60; background: var(--bg); overflow-y: auto;
        padding: var(--safe-top) 0 0; animation: none; }
      .nf { display: flex; flex-direction: column; min-height: 100%; max-width: none; border: 0; border-radius: 0; background: transparent; overflow: visible; }
      .nf-head { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--border-soft); padding: 0.85rem 1rem; }
      .nf-close { display: inline-flex; }
      .nf-body { padding: 0.2rem 1rem 1rem; flex: 1; }
      .nf-sec { padding: 1rem 0; }
      .nf-row { flex-direction: column; }
      .nf-row .btn { width: 100%; min-height: 44px; }
      .nf-grid-2 { grid-template-columns: 1fr; }
      .nf-foot { position: sticky; bottom: 0; z-index: 3; background: var(--bg); margin: 0 -1rem; padding: 0.8rem 1rem calc(0.8rem + var(--safe-bottom)); }
      .nf-save { width: 100%; min-width: 0; }

      .nf-overlay { align-items: flex-end; padding: 0; }
      .nf-sheet { max-width: none; width: 100%; height: 92dvh; max-height: 92dvh; border-radius: 22px 22px 0 0; border: 0;
        animation: nfUp 0.24s var(--ease); padding-bottom: var(--safe-bottom); }
      @keyframes nfUp { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .nf-sheet::before { content: none; }
      .nf-sheet-h { padding: 0.9rem 1rem 0.8rem; }
      .nf-title h3 { font-size: 1.02rem; }
      .nf-tabs { padding: 0 1rem 0.8rem; }
      .nf-toolbar { padding: 0.8rem 1rem; }
      .nf-search input { height: 44px; font-size: 16px; }
      .nf-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 0 0.75rem 1.25rem; }
      .nf-post { border-radius: 10px; }
      .nf-post:hover { transform: none; box-shadow: none; }
      .nf-meta { padding: 0.4rem 0.45rem 0.5rem; }
      .nf-cap { font-size: 0.7rem; -webkit-line-clamp: 2; }
      .nf-when { display: none; }
      .nf-kind { top: 5px; right: 5px; min-width: 20px; height: 20px; font-size: 0.6rem; }
    }
  `;
  document.head.appendChild(st);
}

/* ------------------------------ ícones ------------------------------ */
const ICON_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const ICON_REFRESH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 4v5h-5"/></svg>';
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* ------------------------------ dados ------------------------------ */
async function getAccounts() {
  const { data, error } = await sb
    .from("instagram_config")
    .select("id, instagram_username")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return error ? [] : data || [];
}

async function fetchPosts(configId, force) {
  if (!force && cache[configId]) return cache[configId];
  const { data, error } = await sb.functions.invoke("list-instagram-posts", {
    body: { mode: "all", instagram_config_id: configId },
  });
  if (error) throw error;
  cache[configId] = (data && data.posts) || [];
  return cache[configId];
}

/* ------------------------------ janela ------------------------------ */
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "nf-overlay nf-hide";
  overlay.innerHTML =
    '<div class="nf-sheet" role="dialog" aria-modal="true" aria-labelledby="nfTitle">' +
    '<header class="nf-sheet-h">' +
    '<div class="nf-title"><h3 id="nfTitle">Escolher publicação</h3>' +
    "<p>Toque em um post para usar na automação.</p></div>" +
    '<div class="nf-sheet-acts">' +
    '<button type="button" class="nf-iconbtn" data-nf="reload" title="Atualizar" aria-label="Atualizar">' + ICON_REFRESH + "</button>" +
    '<button type="button" class="nf-iconbtn" data-nf="close" title="Fechar" aria-label="Fechar">' + ICON_CLOSE + "</button>" +
    "</div></header>" +
    '<div id="nfTabs" class="nf-tabs"></div>' +
    '<div class="nf-toolbar">' +
    '<label class="nf-search">' + ICON_SEARCH +
    '<input type="search" id="nfSearch" placeholder="Buscar pela legenda" autocomplete="off" /></label>' +
    '<span id="nfCount" class="nf-count"></span>' +
    "</div>" +
    '<div id="nfGrid" class="nf-grid"></div>' +
    "</div>";
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) return close();
    const act = e.target.closest("[data-nf]");
    if (act) {
      if (act.dataset.nf === "close") close();
      if (act.dataset.nf === "reload") showAccount(activeId, true);
      return;
    }
    const chip = e.target.closest("[data-acc]");
    if (chip) return showAccount(chip.dataset.acc);
    const post = e.target.closest("[data-code]");
    if (post) choose(post.dataset.code);
  });
  overlay.querySelector("#nfSearch").addEventListener("input", renderPosts);
  return overlay;
}

function close() {
  if (overlay) overlay.classList.add("nf-hide");
}

function renderTabs() {
  const box = $("nfTabs");
  if (!box) return;
  if (accounts.length < 2) {
    box.classList.add("nf-hide");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("nf-hide");
  box.innerHTML = accounts
    .map((a) => {
      const on = a.id === activeId;
      return (
        '<button type="button" class="nf-chip' + (on ? " on" : "") + '" data-acc="' + esc(a.id) + '" aria-pressed="' + on + '">' +
        '<span class="nf-av">' + esc(initial(a.instagram_username)) + "</span>@" +
        esc(a.instagram_username || "conta") + "</button>"
      );
    })
    .join("");
}

function setCount(n) {
  const el = $("nfCount");
  if (el) el.textContent = n == null ? "" : n === 1 ? "1 publicação" : n + " publicações";
}

function renderSkeleton() {
  const grid = $("nfGrid");
  if (!grid) return;
  setCount(null);
  let h = "";
  for (let i = 0; i < 8; i++) {
    h += '<div class="nf-post nf-skel" aria-hidden="true"><div class="nf-media"></div><div class="nf-meta"><span class="nf-cap"></span><span class="nf-when"></span></div></div>';
  }
  grid.innerHTML = h;
}

function renderState(icon, html, retry) {
  const grid = $("nfGrid");
  if (!grid) return;
  setCount(null);
  grid.innerHTML =
    '<div class="nf-state"><span class="nf-state-ico">' + icon + "</span><span>" + html + "</span>" +
    (retry ? '<button type="button" class="nf-retry" data-nf="reload">Tentar novamente</button>' : "") +
    "</div>";
}

function renderPosts() {
  const grid = $("nfGrid");
  if (!grid) return;
  if (!posts.length) {
    renderState("🗂️", "Nenhuma publicação encontrada nesta conta.", false);
    return;
  }
  const rawTerm = (($("nfSearch") && $("nfSearch").value) || "").trim();
  const term = rawTerm.toLowerCase();
  const list = term ? posts.filter((p) => String(p.caption || "").toLowerCase().includes(term)) : posts;
  if (!list.length) {
    renderState("🔎", "Nada encontrado para &ldquo;" + esc(rawTerm) + "&rdquo;.", false);
    setCount(0);
    return;
  }
  setCount(list.length);
  grid.innerHTML = list
    .map((p) => {
      const code = p.shortcode || p.media_id || "";
      const img = safeImg(p.thumbnail_url);
      const full = p.caption ? oneLine(p.caption, 400) : "Sem legenda";
      const when = p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "";
      const type = String(p.media_type || "").toUpperCase();
      const kind = type === "VIDEO" ? "▶" : type === "CAROUSEL_ALBUM" ? "❏" : "";
      return (
        '<button type="button" class="nf-post" data-code="' + esc(code) + '" title="' + esc(full) + '" aria-label="' + esc(full) + '">' +
        '<div class="nf-media">' +
        (img
          ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
          : '<div class="nf-media-empty">📷</div>') +
        (kind ? '<span class="nf-kind">' + kind + "</span>" : "") +
        "</div>" +
        '<div class="nf-meta"><span class="nf-cap">' + esc(full) + "</span>" +
        (when ? '<span class="nf-when">' + esc(when) + "</span>" : "") +
        "</div></button>"
      );
    })
    .join("");
  grid.scrollTop = 0;
}

async function showAccount(id, force) {
  activeId = id;
  renderTabs();
  const token = ++seq;
  renderSkeleton();
  try {
    const list = await fetchPosts(id, force);
    if (token !== seq) return;
    posts = list;
    renderPosts();
  } catch (e) {
    if (token !== seq) return;
    renderState("⚠️", "Não foi possível carregar as publicações.<br><small>" + esc(e.message) + "</small>", true);
  }
}

async function open() {
  ensureOverlay();
  overlay.classList.remove("nf-hide");
  $("nfSearch").value = "";
  renderSkeleton();

  if (!userId) {
    const { data: { session } } = await sb.auth.getSession();
    userId = session ? session.user.id : null;
  }
  if (!userId) {
    renderState("🔒", "Sua sessão expirou. Atualize a página e entre novamente.", false);
    return;
  }

  accounts = await getAccounts();
  if (!accounts.length) {
    renderTabs();
    renderState("📸", "Nenhuma conta conectada. Conecte uma conta do Instagram primeiro.", false);
    return;
  }

  // Começa pela conta que já está selecionada no formulário (se houver).
  const sel = $("automationIgAccount");
  const current = sel ? sel.value : "";
  const start = accounts.some((a) => a.id === current) ? current : accounts[0].id;
  await showAccount(start);
}

function choose(code) {
  const post = posts.find((p) => (p.shortcode || p.media_id) === code);
  const input = $("instagramMediaId");
  if (input) input.value = code;

  const sel = $("automationIgAccount");
  if (sel && activeId && [...sel.options].some((o) => o.value === activeId)) sel.value = activeId;

  const picked = $("postEscolhido");
  if (picked) {
    const acc = accounts.find((a) => a.id === activeId);
    const cap = post && post.caption ? oneLine(post.caption, 60) : "post sem legenda";
    picked.textContent = "Post escolhido: " + cap + (acc ? " · @" + (acc.instagram_username || "conta") : "");
    picked.classList.remove("nf-hide");
  }
  close();
}

/* ------------------------------ bootstrap ------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  if (!$("escolherPostBtn")) return; // markup não presente nesta página
  injectStyles();
  ensureOverlay();

  $("escolherPostBtn").addEventListener("click", open);

  // Depois de salvar, o app.js limpa o campo do post; esconde o aviso do post escolhido junto.
  $("saveAutomationBtn")?.addEventListener("click", () => {
    setTimeout(() => {
      const picked = $("postEscolhido");
      if (picked && !$("instagramMediaId").value) picked.classList.add("nf-hide");
    }, 1500);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("nf-hide")) close();
  });

  sb.auth.getSession().then(({ data: { session } }) => {
    userId = session ? session.user.id : null;
  });
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") {
      userId = null;
      Object.keys(cache).forEach((k) => delete cache[k]);
      return;
    }
    if (s) userId = s.user.id;
  });
});
