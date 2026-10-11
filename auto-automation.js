import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const sb = createClient(
  "https://abdliioyzkylccfylils.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
);
const TABLE = "auto_automation_settings";
const $ = (id) => document.getElementById(id);
let userId = null;
let ready = false;
let busy = false;
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);
function injectStyles() {
  if ($("autoAutoStyles")) return;
  const st = document.createElement("style");
  st.id = "autoAutoStyles";
  st.textContent = `
    .auto-switch-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.9rem 1rem; border:1px solid var(--border); border-radius:14px; background:var(--surface); margin-bottom:1rem; }
    .auto-switch-copy { display:flex; flex-direction:column; gap:.15rem; }
    .auto-switch-copy span { color:var(--text-muted); font-size:.85rem; }
    .auto-switch { position:relative; width:48px; height:28px; flex-shrink:0; }
    .auto-switch input { position:absolute; inset:0; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; z-index:2; }
    .auto-switch i { position:absolute; inset:0; border-radius:999px; background:var(--surface-2); border:1px solid var(--border); transition:background .2s; }
    .auto-switch i::after { content:""; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform .2s; }
    .auto-switch input:checked + i { background:var(--accent-1); border-color:var(--accent-1); }
    .auto-switch input:checked + i::after { transform:translateX(20px); }
    .auto-mode { display:flex; gap:.6rem; flex-wrap:wrap; margin-bottom:1rem; }
    .auto-mode label { flex:1; min-width:200px; display:flex; gap:.6rem; align-items:flex-start; padding:.8rem 1rem; border:1px solid var(--border); border-radius:12px; cursor:pointer; background:var(--surface); }
    .auto-mode label.active { border-color:var(--accent-1); }
    .auto-mode input { margin-top:.2rem; accent-color:var(--accent-1); }
    .auto-mode small { display:block; color:var(--text-muted); font-size:.8rem; }
    .auto-note { font-size:.82rem; color:var(--text-faint); margin:.8rem 0 0; }
  `;
  document.head.appendChild(st);
}
function setMsg(text, type) {
  const el = $("autoAutoMsg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "banner" + (text ? " " + type : " hidden");
}
function syncUi() {
  const on = $("autoAutoSwitch").checked;
  $("autoAutoForm").classList.toggle("hidden", !on);
  const kw = document.querySelector('input[name="autoAutoMode"]:checked').value === "keyword";
  $("autoAutoKeywordField").classList.toggle("hidden", !kw);
  document.querySelectorAll(".auto-mode label").forEach((l) => l.classList.toggle("active", l.querySelector("input").checked));
}
function fill(row) {
  $("autoAutoSwitch").checked = !!(row && row.enabled);
  const mode = row && row.keyword_mode === "keyword" ? "keyword" : "any";
  document.querySelector('input[name="autoAutoMode"][value="' + mode + '"]').checked = true;
  $("autoAutoKeyword").value = (row && row.palavra_chave) || "";
  $("autoAutoUrl").value = (row && row.produto_url) || "";
  $("autoAutoImg").value = (row && row.imagem_url) || "";
  $("autoAutoTitle").value = (row && row.titulo_produto) || "";
  $("autoAutoPrice").value = (row && row.preco_produto) || "";
  syncUi();
}
async function loadSettings() {
  const { data, error } = await sb.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    setMsg("Erro ao carregar: " + error.message, "error");
    return;
  }
  fill(data);
}
async function save(enabledOverride) {
  if (busy || !userId) return;
  const enabled = typeof enabledOverride === "boolean" ? enabledOverride : $("autoAutoSwitch").checked;
  const mode = document.querySelector('input[name="autoAutoMode"]:checked').value;
  const palavra = $("autoAutoKeyword").value.trim();
  const url = $("autoAutoUrl").value.trim();
  const img = $("autoAutoImg").value.trim();
  if (enabled) {
    if (!url || !isUrl(url)) return setMsg("Informe o link de destino (começando com http:// ou https://).", "error");
    if (img && !isUrl(img)) return setMsg("A URL da imagem precisa começar com http:// ou https://", "error");
    if (mode === "keyword" && !palavra) return setMsg("Informe a palavra-chave ou escolha responder qualquer comentário.", "error");
  }
  busy = true;
  $("autoAutoSaveBtn").disabled = true;
  try {
    const payload = {
      user_id: userId,
      enabled,
      keyword_mode: mode,
      palavra_chave: palavra || null,
      produto_url: url || null,
      imagem_url: img || null,
      titulo_produto: $("autoAutoTitle").value.trim() || null,
      preco_produto: $("autoAutoPrice").value.trim() || null,
    };
    const { error } = await sb.from(TABLE).upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
    setMsg(enabled ? "Automação automática ativada! Os próximos posts e Reels terão a automação criada sozinha." : "Automação automática desativada.", "success");
  } catch (e) {
    setMsg("Erro ao salvar: " + e.message, "error");
  } finally {
    busy = false;
    $("autoAutoSaveBtn").disabled = false;
  }
}
function build() {
  const nav = $("automationsSubtabNav");
  const firstPanel = document.querySelector(".subtab-panel");
  if (!nav || !firstPanel || $("subtab-auto")) return false;
  injectStyles();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "subtab-btn";
  btn.id = "autoAutoTabBtn";
  btn.setAttribute("data-subtab", "auto");
  btn.textContent = "⚡ Automático";
  nav.appendChild(btn);
  const panel = document.createElement("div");
  panel.id = "subtab-auto";
  panel.className = "subtab-panel hidden";
  panel.innerHTML =
    '<section class="panel">' +
    '<div class="panel-heading-row"><h2>Automação automática</h2></div>' +
    '<p class="panel-lead">Publicou um post ou Reel? A automação é criada sozinha, com a mensagem que você definir aqui.</p>' +
    '<div class="auto-switch-row"><div class="auto-switch-copy"><strong>Criar automação em toda nova publicação</strong><span>Verificamos suas contas a cada poucos minutos.</span></div>' +
    '<label class="auto-switch"><input type="checkbox" id="autoAutoSwitch" aria-label="Ativar automação automática" /><i></i></label></div>' +
    '<div id="autoAutoForm" class="hidden">' +
    '<div class="form-step"><b>1</b><span>Quando enviar o Direct?</span></div>' +
    '<div class="auto-mode">' +
    '<label class="active"><input type="radio" name="autoAutoMode" value="any" checked /><span><strong>Qualquer comentário</strong><small>Todo comentário no post recebe o Direct.</small></span></label>' +
    '<label><input type="radio" name="autoAutoMode" value="keyword" /><span><strong>Palavra-chave específica</strong><small>Só quem comentar a palavra recebe o Direct.</small></span></label>' +
    '</div>' +
    '<div class="field hidden" id="autoAutoKeywordField"><span>Palavra-chave do comentário</span><input type="text" id="autoAutoKeyword" placeholder="ex: quero" /></div>' +
    '<div class="form-step"><b>2</b><span>O que enviar?</span></div>' +
    '<div class="produto-picker-row"><div class="field flush"><span>Link de destino (WhatsApp, loja, produto…)</span><input type="text" id="autoAutoUrl" placeholder="https://" /></div>' +
    '<button type="button" id="autoAutoPickBtn" class="btn btn-outline">📦 Escolher produto cadastrado</button></div>' +
    '<div class="automation-form-grid">' +
    '<div class="field field-full"><span>Imagem (URL) — opcional</span><input type="text" id="autoAutoImg" placeholder="https://" /></div>' +
    '<div class="field"><span>Título — opcional</span><input type="text" id="autoAutoTitle" placeholder="Nome que aparece no Direct" /></div>' +
    '<div class="field"><span>Preço — opcional</span><input type="text" id="autoAutoPrice" placeholder="R$ 0,00" /></div>' +
    '</div>' +
    '<button type="button" id="autoAutoSaveBtn" class="btn btn-primary">Salvar</button>' +
    '<p class="auto-note">Vale só para publicações feitas depois de ativar. As automações criadas aparecem em “Automações cadastradas” e podem ser pausadas ou excluídas normalmente.</p>' +
    '</div>' +
    '<div id="autoAutoMsg" class="banner hidden"></div>' +
    '</section>';
  firstPanel.parentElement.insertBefore(panel, $("subtab-produtos") || null);
  btn.addEventListener("click", () => {
    nav.querySelectorAll(".subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "subtab-auto"));
  });
  $("autoAutoSwitch").addEventListener("change", () => {
    syncUi();
    setMsg("");
    if (!$("autoAutoSwitch").checked) save(false);
  });
  document.querySelectorAll('input[name="autoAutoMode"]').forEach((r) => r.addEventListener("change", syncUi));
  $("autoAutoSaveBtn").addEventListener("click", () => save());
  $("autoAutoPickBtn").addEventListener("click", () => {
    if (typeof window.openProdutoPicker !== "function") return;
    window.openProdutoPicker((p) => {
      $("autoAutoUrl").value = p.link_afiliado || "";
      $("autoAutoTitle").value = p.nome || "";
      $("autoAutoImg").value = p.link_imagem || "";
      $("autoAutoPrice").value = p.preco || "";
    });
  });
  return true;
}
async function init() {
  if (ready) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  if (!build()) return;
  ready = true;
  userId = session.user.id;
  await loadSettings();
}
document.addEventListener("DOMContentLoaded", () => {
  init();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { userId = null; return; }
    if (s && !ready) setTimeout(init, 0);
  });
});
