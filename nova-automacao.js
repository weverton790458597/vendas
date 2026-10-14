// nova-automacao.js
// Ajustes da aba "Nova automação":
//  1) Botão "Escolher post da conta": lista as publicações de uma conta conectada
//     e preenche o post e a conta do formulário ao tocar.
//  2) Estilos do formulário organizado em etapas e do botão de fechar no celular.
// Módulo isolado (mesmo padrão dos outros): client próprio que só LÊ a sessão do app.js,
// estilos injetados aqui. Usa os ids do bloco #subtab-new do index.html.

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

    /* ---------- Janela de escolher post ---------- */
    .nf-overlay { position: fixed; inset: 0; z-index: 300; background: var(--overlay); display: flex; align-items: center; justify-content: center;
      padding: 1rem; backdrop-filter: blur(4px); }
    .nf-sheet { width: 100%; max-width: 680px; max-height: 88vh; display: flex; flex-direction: column; background: var(--surface);
      border: 1px solid var(--border-soft); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); overflow: hidden; }
    .nf-sheet-h { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1rem 1.1rem; border-bottom: 1px solid var(--border-soft); }
    .nf-sheet-h h3 { margin: 0; font-size: 1.02rem; }
    .nf-sheet-acts { display: flex; align-items: center; gap: 0.5rem; }
    .nf-link { border: 0; background: none; color: var(--accent-solid); font-weight: 600; font-size: 0.84rem; cursor: pointer; padding: 0.3rem; }
    .nf-xbtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 0.95rem; }
    .nf-chips { display: flex; gap: 0.45rem; flex-wrap: wrap; padding: 0.9rem 1.1rem 0; }
    .nf-chips:empty { display: none; }
    .nf-chip { border: 1px solid var(--border); background: var(--bg-soft); color: var(--text-muted); border-radius: 999px; padding: 0.42em 0.9em;
      font-size: 0.82rem; font-weight: 600; cursor: pointer; }
    .nf-chip.on { background: var(--accent-tint); border-color: var(--accent-solid); color: var(--text); }
    .nf-search { padding: 0.8rem 1.1rem 0; }
    .nf-search input { margin: 0; }
    .nf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.6rem; padding: 0.9rem 1.1rem 1.2rem; overflow-y: auto; }
    .nf-post { display: flex; flex-direction: column; padding: 0; border: 1px solid var(--border-soft); border-radius: 12px; background: var(--bg-soft);
      overflow: hidden; cursor: pointer; text-align: left; color: var(--text); font: inherit; transition: border-color 0.15s var(--ease); }
    .nf-post:hover, .nf-post:focus-visible { border-color: var(--accent-solid); outline: none; }
    .nf-thumb { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; background: var(--surface-2); font-size: 1.4rem; overflow: hidden; }
    .nf-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .nf-cap { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; padding: 0.5rem 0.6rem 0; font-size: 0.76rem; line-height: 1.35; }
    .nf-when { display: block; padding: 0.2rem 0.6rem 0.6rem; font-size: 0.7rem; color: var(--text-faint); }
    .nf-msg { grid-column: 1 / -1; padding: 2rem 1rem; text-align: center; color: var(--text-faint); font-size: 0.9rem; }

    /* ---------- Celular: formulário em tela cheia com botão de fechar ---------- */
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
      .nf-sheet { max-height: 90dvh; border-radius: 20px 20px 0 0; border-bottom: 0; }
      .nf-overlay { align-items: flex-end; padding: 0; }
      .nf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `;
  document.head.appendChild(st);
}

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
  overlay.className = "nf-overlay hidden";
  overlay.innerHTML =
    '<div class="nf-sheet" role="dialog" aria-modal="true" aria-label="Escolher post">' +
    '<div class="nf-sheet-h"><h3>Escolher post</h3>' +
    '<div class="nf-sheet-acts"><button type="button" class="nf-link" data-nf="reload">Atualizar</button>' +
    '<button type="button" class="nf-xbtn" data-nf="close" aria-label="Fechar">✕</button></div></div>' +
    '<div id="nfChips" class="nf-chips"></div>' +
    '<div class="nf-search"><input type="search" id="nfSearch" placeholder="Buscar pela legenda" /></div>' +
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
  if (overlay) overlay.classList.add("hidden");
}

function renderChips() {
  const box = $("nfChips");
  if (!box) return;
  if (accounts.length < 2) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = accounts
    .map((a) =>
      '<button type="button" class="nf-chip' + (a.id === activeId ? " on" : "") + '" data-acc="' + esc(a.id) + '">@' +
      esc(a.instagram_username || "conta") + "</button>"
    )
    .join("");
}

function renderPosts() {
  const grid = $("nfGrid");
  if (!grid) return;
  if (!posts.length) {
    grid.innerHTML = '<div class="nf-msg">Nenhuma publicação encontrada nesta conta.</div>';
    return;
  }
  const term = (($("nfSearch") && $("nfSearch").value) || "").trim().toLowerCase();
  const list = term ? posts.filter((p) => String(p.caption || "").toLowerCase().includes(term)) : posts;
  if (!list.length) {
    grid.innerHTML = '<div class="nf-msg">Nada encontrado para essa busca.</div>';
    return;
  }
  grid.innerHTML = list
    .map((p) => {
      const code = p.shortcode || p.media_id || "";
      const img = safeImg(p.thumbnail_url);
      const cap = p.caption ? oneLine(p.caption, 90) : "(sem legenda)";
      const when = p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "";
      return (
        '<button type="button" class="nf-post" data-code="' + esc(code) + '">' +
        '<span class="nf-thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" />' : "📷") + "</span>" +
        '<span class="nf-cap">' + esc(cap) + "</span>" +
        '<small class="nf-when">' + esc(when) + "</small></button>"
      );
    })
    .join("");
}

async function showAccount(id, force) {
  activeId = id;
  renderChips();
  const token = ++seq;
  const grid = $("nfGrid");
  if (grid) grid.innerHTML = '<div class="loading-row">Buscando publicações…</div>';
  try {
    const list = await fetchPosts(id, force);
    if (token !== seq) return;
    posts = list;
    renderPosts();
  } catch (e) {
    if (token !== seq) return;
    if (grid) grid.innerHTML = '<div class="nf-msg">Não foi possível carregar: ' + esc(e.message) + "</div>";
  }
}

async function open() {
  ensureOverlay();
  overlay.classList.remove("hidden");
  $("nfSearch").value = "";
  $("nfGrid").innerHTML = '<div class="loading-row">Carregando contas…</div>';

  if (!userId) {
    const { data: { session } } = await sb.auth.getSession();
    userId = session ? session.user.id : null;
  }
  if (!userId) {
    $("nfGrid").innerHTML = '<div class="nf-msg">Sua sessão expirou. Atualize a página e entre novamente.</div>';
    return;
  }

  accounts = await getAccounts();
  if (!accounts.length) {
    $("nfChips").innerHTML = "";
    $("nfGrid").innerHTML = '<div class="nf-msg">Nenhuma conta conectada. Conecte uma conta do Instagram primeiro.</div>';
    return;
  }

  // Começa pela conta que já está selecionada no formulário (se houver).
  const sel = $("automationIgAccount");
  const current = sel ? sel.value : "";
  const start = accounts.some((a) => a.id === current) ? current : accounts[0].id;
  renderChips();
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
    picked.classList.remove("hidden");
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
      if (picked && !$("instagramMediaId").value) picked.classList.add("hidden");
    }, 1500);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("hidden")) close();
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
