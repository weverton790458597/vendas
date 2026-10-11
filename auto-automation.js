import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const sb = createClient(
  "https://abdliioyzkylccfylils.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
);
const TABLE = "auto_automation_settings";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);
let userId = null;
let ready = false;
let busy = false;
let accounts = [];
let saved = null;
let editing = false;
let tableName = null;
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
    .auto-acc-list { display:flex; flex-direction:column; gap:.5rem; margin-bottom:1rem; }
    .auto-acc-list label { display:flex; align-items:center; gap:.6rem; padding:.6rem .9rem; border:1px solid var(--border); border-radius:12px; cursor:pointer; background:var(--surface); }
    .auto-acc-list input { accent-color:var(--accent-1); }
    .auto-summary { display:flex; gap:1rem; flex-wrap:wrap; align-items:flex-start; padding:1rem; border:1px solid var(--border); border-radius:14px; background:var(--surface); margin-bottom:1rem; }
    .auto-summary img { width:84px; height:84px; object-fit:cover; border-radius:12px; background:var(--surface-2); flex-shrink:0; }
    .auto-summary-body { flex:1; min-width:200px; display:flex; flex-direction:column; gap:.25rem; }
    .auto-summary-body span { color:var(--text-muted); font-size:.85rem; word-break:break-all; }
    .auto-pill { display:inline-block; padding:.15rem .6rem; border-radius:999px; font-size:.75rem; font-weight:600; background:var(--surface-2); color:var(--text-muted); }
    .auto-pill.on { background:var(--success-bg); color:var(--success); }
    .auto-apply { display:flex; gap:.6rem; align-items:flex-start; margin:0 0 1rem; font-size:.85rem; color:var(--text-muted); cursor:pointer; }
    .auto-apply input { margin-top:.2rem; accent-color:var(--accent-1); }
    .auto-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
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
  const kw = document.querySelector('input[name="autoAutoMode"]:checked').value === "keyword";
  $("autoAutoKeywordField").classList.toggle("hidden", !kw);
  const accSel = document.querySelector('input[name="autoAutoAccMode"]:checked').value === "selected";
  $("autoAutoAccountList").classList.toggle("hidden", !accSel);
  document.querySelectorAll(".auto-mode label").forEach((l) => l.classList.toggle("active", l.querySelector("input").checked));
}
function accountsLabel(r) {
  if (!r || r.account_mode !== "selected") return "Todas as contas";
  const ids = r.instagram_config_ids || [];
  const names = accounts.filter((a) => ids.indexOf(a.id) !== -1).map((a) => "@" + (a.instagram_username || "conta"));
  return names.length ? names.join(", ") : "Nenhuma conta selecionada";
}
function renderSummary() {
  const r = saved;
  const img = r.imagem_url ? '<img src="' + esc(r.imagem_url) + '" alt="" />' : "";
  $("autoAutoSummary").innerHTML =
    img +
    '<div class="auto-summary-body">' +
    '<div><span class="auto-pill' + (r.enabled ? " on" : "") + '">' + (r.enabled ? "Ativa" : "Pausada") + "</span></div>" +
    "<strong>" + esc(r.titulo_produto || "Mensagem sem título") + "</strong>" +
    (r.preco_produto ? "<span>" + esc(r.preco_produto) + "</span>" : "") +
    "<span>Destino: " + esc(r.produto_url) + "</span>" +
    "<span>Envia: " + (r.keyword_mode === "keyword" ? "quando comentarem “" + esc(r.palavra_chave) + "”" : "para qualquer comentário") + "</span>" +
    "<span>Contas: " + esc(accountsLabel(r)) + "</span>" +
    "</div>" +
    '<button type="button" class="btn btn-outline btn-sm" id="autoAutoEditBtn">✏️ Editar mensagem</button>';
  $("autoAutoEditBtn").addEventListener("click", () => {
    fill(saved);
    editing = true;
    setMsg("");
    render();
  });
}
function render() {
  const on = $("autoAutoSwitch").checked;
  const hasCfg = !!(saved && saved.produto_url);
  $("autoAutoSummary").classList.toggle("hidden", !(hasCfg && !editing));
  $("autoAutoForm").classList.toggle("hidden", !(editing || (on && !hasCfg)));
  $("autoAutoCancelBtn").classList.toggle("hidden", !hasCfg);
  $("autoAutoApplyRow").classList.toggle("hidden", !hasCfg);
  if (hasCfg && !editing) renderSummary();
  syncUi();
}
function selectedAccountIds() {
  return Array.from(document.querySelectorAll("#autoAutoAccountList input:checked")).map((i) => i.value);
}
async function loadAccounts() {
  const { data, error } = await sb.from("instagram_config").select("id, instagram_username").eq("user_id", userId);
  accounts = error || !data ? [] : data;
  $("autoAutoAccountList").innerHTML = accounts.map((a) => '<label><input type="checkbox" value="' + esc(a.id) + '" /><span>@' + esc(a.instagram_username || "conta") + "</span></label>").join("");
  $("autoAutoAccountsBlock").classList.toggle("hidden", accounts.length < 2);
}
function fill(row) {
  $("autoAutoSwitch").checked = !!(row && row.enabled);
  const mode = row && row.keyword_mode === "keyword" ? "keyword" : "any";
  document.querySelector('input[name="autoAutoMode"][value="' + mode + '"]').checked = true;
  const accMode = row && row.account_mode === "selected" && accounts.length > 1 ? "selected" : "all";
  document.querySelector('input[name="autoAutoAccMode"][value="' + accMode + '"]').checked = true;
  const ids = (row && row.instagram_config_ids) || [];
  document.querySelectorAll("#autoAutoAccountList input").forEach((i) => { i.checked = ids.indexOf(i.value) !== -1; });
  $("autoAutoKeyword").value = (row && row.palavra_chave) || "";
  $("autoAutoUrl").value = (row && row.produto_url) || "";
  $("autoAutoImg").value = (row && row.imagem_url) || "";
  $("autoAutoTitle").value = (row && row.titulo_produto) || "";
  $("autoAutoPrice").value = (row && row.preco_produto) || "";
}
async function loadSettings() {
  const { data, error } = await sb.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    setMsg("Erro ao carregar: " + error.message, "error");
    return;
  }
  saved = data;
  editing = false;
  fill(data);
  render();
}
async function getTableName() {
  if (tableName) return tableName;
  const { data } = await sb.from("profiles").select("automacoes_table_name").eq("id", userId).maybeSingle();
  tableName = (data && data.automacoes_table_name) || null;
  return tableName;
}
async function applyToExisting(payload) {
  try {
    const table = await getTableName();
    if (!table || accounts.length === 0) return 0;
    const { data: seen, error: seenError } = await sb
      .from("auto_automation_seen")
      .select("shortcode")
      .eq("automation_created", true)
      .in("instagram_config_id", accounts.map((a) => a.id));
    if (seenError) throw seenError;
    const shortcodes = (seen || []).map((s) => s.shortcode);
    if (shortcodes.length === 0) return 0;
    const { data, error } = await sb
      .from(table)
      .update({
        palavra_chave: payload.keyword_mode === "keyword" ? payload.palavra_chave : "*",
        produto_url: payload.produto_url,
        imagem_url: payload.imagem_url,
        titulo_produto: payload.titulo_produto,
        preco_produto: payload.preco_produto,
      })
      .in("instagram_media_id", shortcodes)
      .select("id");
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    console.error("Automação automática:", e);
    return -1;
  }
}
async function toggleEnabled(on) {
  const { error } = await sb.from(TABLE).update({ enabled: on }).eq("user_id", userId);
  if (error) {
    $("autoAutoSwitch").checked = !on;
    setMsg("Erro ao atualizar: " + error.message, "error");
    return;
  }
  saved = Object.assign({}, saved, { enabled: on });
  setMsg(on ? "Automação automática ativada! Os próximos posts e Reels terão a automação criada sozinha." : "Automação automática pausada. Sua mensagem continua salva.", "success");
}
async function save() {
  if (busy || !userId) return;
  const enabled = $("autoAutoSwitch").checked;
  const mode = document.querySelector('input[name="autoAutoMode"]:checked').value;
  const palavra = $("autoAutoKeyword").value.trim();
  const url = $("autoAutoUrl").value.trim();
  const img = $("autoAutoImg").value.trim();
  const accMode = accounts.length > 1 ? document.querySelector('input[name="autoAutoAccMode"]:checked').value : "all";
  const accIds = accMode === "selected" ? selectedAccountIds() : [];
  if (!url || !isUrl(url)) return setMsg("Informe o link de destino (começando com http:// ou https://).", "error");
  if (img && !isUrl(img)) return setMsg("A URL da imagem precisa começar com http:// ou https://", "error");
  if (mode === "keyword" && !palavra) return setMsg("Informe a palavra-chave ou escolha responder qualquer comentário.", "error");
  if (accMode === "selected" && accIds.length === 0) return setMsg("Escolha pelo menos uma conta do Instagram.", "error");
  const hadCfg = !!(saved && saved.produto_url);
  busy = true;
  $("autoAutoSaveBtn").disabled = true;
  try {
    const payload = {
      user_id: userId,
      enabled,
      keyword_mode: mode,
      palavra_chave: palavra || null,
      account_mode: accMode,
      instagram_config_ids: accIds,
      produto_url: url,
      imagem_url: img || null,
      titulo_produto: $("autoAutoTitle").value.trim() || null,
      preco_produto: $("autoAutoPrice").value.trim() || null,
    };
    const { error } = await sb.from(TABLE).upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
    saved = Object.assign({}, saved || {}, payload);
    editing = false;
    let extra = "";
    if (hadCfg && $("autoAutoApply").checked) {
      const n = await applyToExisting(payload);
      extra = n < 0 ? " Não foi possível atualizar as automações já criadas." : n === 0 ? "" : " " + n + (n === 1 ? " automação já criada foi atualizada." : " automações já criadas foram atualizadas.");
    }
    setMsg((enabled ? "Salvo! Os próximos posts e Reels usarão esta mensagem." : "Salvo! A automação automática está pausada.") + extra, "success");
    render();
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
    '<div id="autoAutoSummary" class="auto-summary hidden"></div>' +
    '<div id="autoAutoForm" class="hidden">' +
    '<div id="autoAutoAccountsBlock" class="hidden"><div class="form-step"><b>1</b><span>Em quais contas?</span></div>' +
    '<div class="auto-mode">' +
    '<label class="active"><input type="radio" name="autoAutoAccMode" value="all" checked /><span><strong>Todas as minhas contas</strong><small>Inclusive contas que você conectar depois.</small></span></label>' +
    '<label><input type="radio" name="autoAutoAccMode" value="selected" /><span><strong>Contas específicas</strong><small>Escolha quais contas terão a criação automática.</small></span></label>' +
    '</div><div id="autoAutoAccountList" class="auto-acc-list hidden"></div></div>' +
    '<div class="form-step"><b>2</b><span>Quando enviar o Direct?</span></div>' +
    '<div class="auto-mode">' +
    '<label class="active"><input type="radio" name="autoAutoMode" value="any" checked /><span><strong>Qualquer comentário</strong><small>Todo comentário no post recebe o Direct.</small></span></label>' +
    '<label><input type="radio" name="autoAutoMode" value="keyword" /><span><strong>Palavra-chave específica</strong><small>Só quem comentar a palavra recebe o Direct.</small></span></label>' +
    '</div>' +
    '<div class="field hidden" id="autoAutoKeywordField"><span>Palavra-chave do comentário</span><input type="text" id="autoAutoKeyword" placeholder="ex: quero" /></div>' +
    '<div class="form-step"><b>3</b><span>O que enviar?</span></div>' +
    '<div class="produto-picker-row"><div class="field flush"><span>Link de destino (WhatsApp, loja, produto…)</span><input type="text" id="autoAutoUrl" placeholder="https://" /></div>' +
    '<button type="button" id="autoAutoPickBtn" class="btn btn-outline">📦 Escolher produto cadastrado</button></div>' +
    '<div class="automation-form-grid">' +
    '<div class="field field-full"><span>Imagem (URL) — opcional</span><input type="text" id="autoAutoImg" placeholder="https://" /></div>' +
    '<div class="field"><span>Título — opcional</span><input type="text" id="autoAutoTitle" placeholder="Nome que aparece no Direct" /></div>' +
    '<div class="field"><span>Preço — opcional</span><input type="text" id="autoAutoPrice" placeholder="R$ 0,00" /></div>' +
    '</div>' +
    '<label class="auto-apply hidden" id="autoAutoApplyRow"><input type="checkbox" id="autoAutoApply" checked /><span>Aplicar também às automações que já foram criadas automaticamente</span></label>' +
    '<div class="auto-actions"><button type="button" id="autoAutoSaveBtn" class="btn btn-primary">Salvar</button>' +
    '<button type="button" id="autoAutoCancelBtn" class="btn btn-outline hidden">Cancelar</button></div>' +
    '<p class="auto-note">Vale só para publicações feitas depois de ativar. As automações criadas aparecem em “Automações cadastradas” e podem ser pausadas ou excluídas normalmente.</p>' +
    '</div>' +
    '<div id="autoAutoMsg" class="banner hidden"></div>' +
    '</section>';
  firstPanel.parentElement.insertBefore(panel, $("subtab-produtos") || null);
  btn.addEventListener("click", () => {
    nav.querySelectorAll(".subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "subtab-auto"));
  });
  $("autoAutoSwitch").addEventListener("change", async () => {
    setMsg("");
    const on = $("autoAutoSwitch").checked;
    if (saved && saved.produto_url) await toggleEnabled(on);
    render();
  });
  document.querySelectorAll('input[name="autoAutoMode"], input[name="autoAutoAccMode"]').forEach((r) => r.addEventListener("change", syncUi));
  $("autoAutoSaveBtn").addEventListener("click", save);
  $("autoAutoCancelBtn").addEventListener("click", () => {
    fill(saved);
    editing = false;
    setMsg("");
    render();
  });
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
  await loadAccounts();
  await loadSettings();
}
document.addEventListener("DOMContentLoaded", () => {
  init();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { userId = null; return; }
    if (s && !ready) setTimeout(init, 0);
  });
});

