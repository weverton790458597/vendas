import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const sb = createClient(
  "https://abdliioyzkylccfylils.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
);
const RULES = "auto_automation_rules";
const SEEN = "auto_automation_seen";
const MAX_BUTTON = 20;
const LINK_TYPES = {
  whatsapp: { label: "WhatsApp", icon: "💬", button: "Ir para WhatsApp", urlLabel: "Link do WhatsApp (ou número com DDD)", placeholder: "https://wa.me/5598999999999 ou 98999999999" },
  site: { label: "Site", icon: "🌐", button: "Ir para o site", urlLabel: "Link do site", placeholder: "https://seusite.com" },
  produto: { label: "Produto", icon: "🛍️", button: "Ver produto", urlLabel: "Link do produto", placeholder: "https://" },
  outro: { label: "Outro", icon: "🔗", button: "", urlLabel: "Link de destino", placeholder: "https://" },
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);
const val = (name) => document.querySelector('input[name="' + name + '"]:checked').value;
let userId = null;
let ready = false;
let busy = false;
let accounts = [];
let rules = [];
let formOpen = false;
let editingId = null;
let tableName = null;
function injectStyles() {
  if ($("autoAutoStyles")) return;
  const st = document.createElement("style");
  st.id = "autoAutoStyles";
  st.textContent = `
    .auto-switch { position:relative; width:48px; height:28px; flex-shrink:0; }
    .auto-switch input { position:absolute; inset:0; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; z-index:2; }
    .auto-switch i { position:absolute; inset:0; border-radius:999px; background:var(--surface-2); border:1px solid var(--border); transition:background .2s; }
    .auto-switch i::after { content:""; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform .2s; }
    .auto-switch input:checked + i { background:var(--accent-1); border-color:var(--accent-1); }
    .auto-switch input:checked + i::after { transform:translateX(20px); }
    .auto-mode, .auto-types { display:flex; gap:.6rem; flex-wrap:wrap; margin-bottom:1rem; }
    .auto-mode label { flex:1; min-width:200px; display:flex; gap:.6rem; align-items:flex-start; padding:.8rem 1rem; border:1px solid var(--border); border-radius:12px; cursor:pointer; background:var(--surface); }
    .auto-types label { flex:1; min-width:120px; display:flex; gap:.5rem; align-items:center; justify-content:center; padding:.7rem .9rem; border:1px solid var(--border); border-radius:12px; cursor:pointer; background:var(--surface); font-weight:600; }
    .auto-mode label.active, .auto-types label.active { border-color:var(--accent-1); }
    .auto-mode label.disabled, .auto-types label.disabled { opacity:.5; cursor:not-allowed; }
    .auto-mode input, .auto-types input { accent-color:var(--accent-1); }
    .auto-mode input { margin-top:.2rem; }
    .auto-mode small { display:block; color:var(--text-muted); font-size:.8rem; }
    .auto-acc-list { display:flex; flex-direction:column; gap:.5rem; margin-bottom:1rem; }
    .auto-acc-list label { display:flex; align-items:center; gap:.6rem; padding:.6rem .9rem; border:1px solid var(--border); border-radius:12px; cursor:pointer; background:var(--surface); }
    .auto-acc-list input { accent-color:var(--accent-1); }
    .auto-rule { display:flex; gap:1rem; flex-wrap:wrap; align-items:flex-start; padding:1rem; border:1px solid var(--border); border-radius:14px; background:var(--surface); margin-bottom:.8rem; }
    .auto-rule img { width:84px; height:84px; object-fit:cover; border-radius:12px; background:var(--surface-2); flex-shrink:0; }
    .auto-rule-body { flex:1; min-width:200px; display:flex; flex-direction:column; gap:.25rem; }
    .auto-rule-body span { color:var(--text-muted); font-size:.85rem; word-break:break-all; }
    .auto-rule-side { display:flex; flex-direction:column; align-items:flex-end; gap:.6rem; }
    .auto-pill-row { display:flex; gap:.4rem; flex-wrap:wrap; }
    .auto-pill { display:inline-block; padding:.15rem .6rem; border-radius:999px; font-size:.75rem; font-weight:600; background:var(--surface-2); color:var(--text-muted); }
    .auto-pill.on { background:var(--success-bg); color:var(--success); }
    .auto-btn-preview { font-size:.85rem; color:var(--text-muted); margin:-.3rem 0 1rem; }
    .auto-btn-chip { display:inline-block; padding:.25rem .8rem; border-radius:8px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); font-weight:600; }
    .auto-count { color:var(--text-faint); font-size:.75rem; align-self:flex-end; }
    .auto-apply { display:flex; gap:.6rem; align-items:flex-start; margin:0 0 1rem; font-size:.85rem; color:var(--text-muted); cursor:pointer; }
    .auto-apply input { margin-top:.2rem; accent-color:var(--accent-1); }
    .auto-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
    .auto-post-row { display:flex; gap:.65rem; align-items:center; }
    .auto-post-thumb { width:56px; height:56px; border-radius:10px; background:var(--surface-2); overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-faint); }
    .auto-post-thumb img { width:100%; height:100%; object-fit:cover; }
    .auto-post-caption { font-size:.8rem; color:var(--text-muted); line-height:1.35; word-break:break-word; }
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
function errorText(e) {
  const m = String((e && e.message) || e || "");
  if (m.indexOf("conta_ja_tem_qualquer_comentario") !== -1) return "Essa conta já tem uma automação de qualquer comentário. Nela, só é possível criar outras com palavra-chave específica.";
  if (m.indexOf("palavra_chave_repetida") !== -1) return "Já existe uma automação com essa palavra-chave nessa conta.";
  return m;
}
function normalizeUrl(type, v) {
  if (type === "whatsapp" && /^\+?[\d\s()-]{8,}$/.test(v)) return "https://wa.me/" + v.replace(/\D/g, "");
  return v;
}
function overlaps(a, b) {
  if (a.account_mode === "all" || b.account_mode === "all") return true;
  const ids = b.instagram_config_ids || [];
  return (a.instagram_config_ids || []).some((i) => ids.indexOf(i) !== -1);
}
function conflictMessage(c, exceptId) {
  const others = rules.filter((r) => r.id !== exceptId && r.enabled);
  if (c.keyword_mode === "any") {
    return others.some((r) => r.keyword_mode === "any" && overlaps(c, r))
      ? "Essa conta já tem uma automação de qualquer comentário. Nela, só é possível criar outras com palavra-chave específica."
      : "";
  }
  const k = String(c.palavra_chave || "").trim().toUpperCase();
  return others.some((r) => r.keyword_mode === "keyword" && String(r.palavra_chave || "").trim().toUpperCase() === k && overlaps(c, r))
    ? "Já existe uma automação com essa palavra-chave nessa conta."
    : "";
}
function takenAnyIds() {
  const taken = new Set();
  rules.filter((r) => r.id !== editingId && r.enabled && r.keyword_mode === "any").forEach((r) => {
    if (r.account_mode === "all") accounts.forEach((a) => taken.add(a.id));
    else (r.instagram_config_ids || []).forEach((i) => taken.add(i));
  });
  return taken;
}
function refreshAvailability() {
  const taken = val("autoAutoMode") === "any" ? takenAnyIds() : new Set();
  const allRadio = document.querySelector('input[name="autoAutoAccMode"][value="all"]');
  const selRadio = document.querySelector('input[name="autoAutoAccMode"][value="selected"]');
  allRadio.disabled = taken.size > 0;
  if (allRadio.disabled && allRadio.checked && accounts.length > 1) selRadio.checked = true;
  document.querySelectorAll("#autoAutoAccountList input").forEach((i) => {
    const blocked = taken.has(i.value);
    i.disabled = blocked;
    if (blocked) i.checked = false;
    i.nextElementSibling.textContent = i.getAttribute("data-name") + (blocked ? " — já tem automação de qualquer comentário" : "");
  });
}
function syncUi() {
  $("autoAutoKeywordField").classList.toggle("hidden", val("autoAutoMode") !== "keyword");
  refreshAvailability();
  $("autoAutoAccountList").classList.toggle("hidden", val("autoAutoAccMode") !== "selected");
  const type = val("autoAutoType");
  const t = LINK_TYPES[type];
  $("autoAutoUrlLabel").textContent = t.urlLabel;
  $("autoAutoUrl").placeholder = t.placeholder;
  $("autoAutoBtnField").classList.toggle("hidden", type !== "outro");
  $("autoAutoPickBtn").classList.toggle("hidden", type !== "produto");
  const custom = $("autoAutoBtnLabel").value.trim();
  $("autoAutoBtnPreview").innerHTML = 'Botão que aparece no Direct: <span class="auto-btn-chip">' + esc(type === "outro" ? custom || "seu texto" : t.button) + "</span>";
  $("autoAutoBtnCount").textContent = $("autoAutoBtnLabel").value.length + "/" + MAX_BUTTON;
  document.querySelectorAll(".auto-mode label, .auto-types label").forEach((l) => {
    const i = l.querySelector("input");
    l.classList.toggle("active", i.checked);
    l.classList.toggle("disabled", i.disabled);
  });
}
function accountsLabel(r) {
  if (r.account_mode !== "selected") return "Todas as contas";
  const ids = r.instagram_config_ids || [];
  const names = accounts.filter((a) => ids.indexOf(a.id) !== -1).map((a) => "@" + (a.instagram_username || "conta"));
  return names.length ? names.join(", ") : "Nenhuma conta selecionada";
}
function buttonLabelOf(r) {
  const t = LINK_TYPES[r.link_type] || LINK_TYPES.produto;
  return r.link_type === "outro" ? r.button_label || "" : t.button;
}
function renderRules() {
  const box = $("autoAutoRules");
  if (rules.length === 0) {
    box.innerHTML = '<div class="empty-state">Você ainda não tem nenhuma automação automática. Clique em “Nova automação automática” para criar a primeira.</div>';
    return;
  }
  box.innerHTML = rules.map((r) => {
    const t = LINK_TYPES[r.link_type] || LINK_TYPES.produto;
    const img = r.imagem_url && isUrl(r.imagem_url) ? '<img src="' + esc(r.imagem_url) + '" alt="" />' : "";
    return (
      '<div class="auto-rule" data-id="' + esc(r.id) + '">' + img +
      '<div class="auto-rule-body">' +
      '<div class="auto-pill-row"><span class="auto-pill' + (r.enabled ? " on" : "") + '">' + (r.enabled ? "Ativa" : "Pausada") + '</span><span class="auto-pill">' + t.icon + " " + t.label + "</span></div>" +
      "<strong>" + esc(r.titulo_produto || "Mensagem sem título") + "</strong>" +
      (r.preco_produto ? "<span>" + esc(r.preco_produto) + "</span>" : "") +
      "<span>Destino: " + esc(r.produto_url) + "</span>" +
      "<span>Botão: " + esc(buttonLabelOf(r)) + "</span>" +
      "<span>Envia: " + (r.keyword_mode === "keyword" ? "quando comentarem “" + esc(r.palavra_chave) + "”" : "para qualquer comentário") + "</span>" +
      "<span>Contas: " + esc(accountsLabel(r)) + "</span>" +
      "</div>" +
      '<div class="auto-rule-side">' +
      '<label class="auto-switch"><input type="checkbox" class="auto-rule-switch" aria-label="Ativar ou pausar"' + (r.enabled ? " checked" : "") + ' /><i></i></label>' +
      '<div class="auto-actions"><button type="button" class="btn btn-outline btn-sm auto-rule-edit">✏️ Editar</button>' +
      '<button type="button" class="btn btn-danger-ghost btn-sm auto-rule-del">🗑️ Apagar</button></div>' +
      "</div></div>"
    );
  }).join("");
}
function render() {
  $("autoAutoListView").classList.toggle("hidden", formOpen);
  $("autoAutoFormView").classList.toggle("hidden", !formOpen);
  $("autoAutoNewBtn").classList.toggle("hidden", formOpen);
  if (!formOpen) renderRules();
  syncUi();
}
function selectedAccountIds() {
  return Array.from(document.querySelectorAll("#autoAutoAccountList input:checked")).map((i) => i.value);
}
async function loadAccounts() {
  const { data, error } = await sb.from("instagram_config").select("id, instagram_username").eq("user_id", userId);
  accounts = error || !data ? [] : data;
  $("autoAutoAccountList").innerHTML = accounts.map((a) => '<label><input type="checkbox" value="' + esc(a.id) + '" data-name="@' + esc(a.instagram_username || "conta") + '" /><span>@' + esc(a.instagram_username || "conta") + "</span></label>").join("");
  $("autoAutoAccountsBlock").classList.toggle("hidden", accounts.length < 2);
}
async function getTableName() {
  if (tableName) return tableName;
  const { data } = await sb.from("profiles").select("automacoes_table_name").eq("id", userId).maybeSingle();
  tableName = (data && data.automacoes_table_name) || null;
  if (tableName) {
    const { error } = await sb.rpc("ensure_automacao_columns", { p_table: tableName });
    if (error) console.error("Automação automática:", error.message);
  }
  return tableName;
}
async function loadRules() {
  const { data, error } = await sb.from(RULES).select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) {
    setMsg("Erro ao carregar: " + error.message, "error");
    return;
  }
  rules = data || [];
  render();
}
function fill(r) {
  const row = r || {};
  document.querySelector('input[name="autoAutoType"][value="' + (row.link_type || "produto") + '"]').checked = true;
  document.querySelector('input[name="autoAutoMode"][value="' + (row.keyword_mode === "keyword" ? "keyword" : "any") + '"]').checked = true;
  const accMode = row.account_mode === "selected" && accounts.length > 1 ? "selected" : "all";
  document.querySelector('input[name="autoAutoAccMode"][value="' + accMode + '"]').checked = true;
  const ids = row.instagram_config_ids || [];
  document.querySelectorAll("#autoAutoAccountList input").forEach((i) => { i.checked = ids.indexOf(i.value) !== -1; });
  $("autoAutoKeyword").value = row.palavra_chave || "";
  $("autoAutoUrl").value = row.produto_url || "";
  $("autoAutoBtnLabel").value = row.button_label || "";
  $("autoAutoImg").value = row.imagem_url || "";
  $("autoAutoTitle").value = row.titulo_produto || "";
  $("autoAutoPrice").value = row.preco_produto || "";
}
function openForm(rule) {
  editingId = rule ? rule.id : null;
  fill(rule);
  $("autoAutoFormTitle").textContent = rule ? "Editar automação automática" : "Nova automação automática";
  $("autoAutoApplyRow").classList.toggle("hidden", !rule);
  setMsg("");
  formOpen = true;
  render();
}
function closeForm() {
  formOpen = false;
  editingId = null;
  render();
}
function readForm() {
  const type = val("autoAutoType");
  const mode = val("autoAutoMode");
  const accMode = accounts.length > 1 ? val("autoAutoAccMode") : "all";
  return {
    link_type: type,
    keyword_mode: mode,
    account_mode: accMode,
    instagram_config_ids: accMode === "selected" ? selectedAccountIds() : [],
    palavra_chave: mode === "keyword" ? $("autoAutoKeyword").value.trim() : null,
    button_label: type === "outro" ? $("autoAutoBtnLabel").value.trim() : null,
    produto_url: normalizeUrl(type, $("autoAutoUrl").value.trim()),
    imagem_url: $("autoAutoImg").value.trim() || null,
    titulo_produto: $("autoAutoTitle").value.trim() || null,
    preco_produto: $("autoAutoPrice").value.trim() || null,
  };
}
function validate(f) {
  if (accounts.length === 0) return "Conecte uma conta do Instagram antes de criar uma automação automática.";
  if (!f.produto_url || !isUrl(f.produto_url)) return "Informe o link de destino (começando com http:// ou https://).";
  if (f.link_type === "outro" && !f.button_label) return "Escreva o texto do botão (até " + MAX_BUTTON + " caracteres).";
  if (f.button_label && f.button_label.length > MAX_BUTTON) return "O texto do botão pode ter no máximo " + MAX_BUTTON + " caracteres.";
  if (f.imagem_url && !isUrl(f.imagem_url)) return "A URL da imagem precisa começar com http:// ou https://";
  if (f.keyword_mode === "keyword" && !f.palavra_chave) return "Informe a palavra-chave ou escolha responder qualquer comentário.";
  if (f.keyword_mode === "any") {
    const taken = takenAnyIds();
    if (accounts.length > 0 && accounts.every((a) => taken.has(a.id))) return "Todas as suas contas já têm uma automação de qualquer comentário. Crie uma com palavra-chave específica.";
  }
  if (f.account_mode === "selected" && f.instagram_config_ids.length === 0) return "Escolha pelo menos uma conta do Instagram.";
  const current = rules.find((r) => r.id === editingId);
  if (!current || current.enabled) return conflictMessage(f, editingId);
  return "";
}
async function fetchCreated(ruleId) {
  const table = await getTableName();
  if (!table) return [];
  let q = sb
    .from(SEEN)
    .select("rule_id, instagram_config_id, shortcode, automation_id, caption, thumbnail_url, permalink, created_at")
    .eq("automation_created", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ruleId) q = q.eq("rule_id", ruleId);
  const { data: seen, error } = await q;
  if (error || !seen || seen.length === 0) return [];
  const ids = seen.map((s) => s.automation_id).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: rows } = await sb.from(table).select("*").in("id", ids);
  const map = new Map();
  (rows || []).forEach((r) => map.set(String(r.id), r));
  return seen.filter((s) => s.automation_id && map.has(String(s.automation_id))).map((s) => ({ seen: s, row: map.get(String(s.automation_id)) }));
}
async function applyToExisting(ruleId, f) {
  try {
    const table = await getTableName();
    if (!table) return 0;
    const created = await fetchCreated(ruleId);
    if (created.length === 0) return 0;
    const { data, error } = await sb
      .from(table)
      .update({
        palavra_chave: f.keyword_mode === "keyword" ? f.palavra_chave : "*",
        produto_url: f.produto_url,
        imagem_url: f.imagem_url,
        titulo_produto: f.titulo_produto,
        preco_produto: f.preco_produto,
        botao_texto: f.link_type === "outro" ? f.button_label : (LINK_TYPES[f.link_type] || LINK_TYPES.produto).button,
        tipo_link: f.link_type,
      })
      .in("id", created.map((c) => c.row.id))
      .select("id");
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    console.error("Automação automática:", e);
    return -1;
  }
}
async function save() {
  if (busy || !userId) return;
  const f = readForm();
  const problem = validate(f);
  if (problem) return setMsg(problem, "error");
  busy = true;
  $("autoAutoSaveBtn").disabled = true;
  try {
    const wasEditing = editingId;
    let ruleId = editingId;
    if (wasEditing) {
      const { error } = await sb.from(RULES).update(f).eq("id", wasEditing);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from(RULES).insert(Object.assign({ user_id: userId, enabled: true }, f)).select("id");
      if (error) throw error;
      ruleId = data && data[0] ? data[0].id : null;
    }
    let extra = "";
    if (wasEditing && $("autoAutoApply").checked) {
      const n = await applyToExisting(ruleId, f);
      extra = n < 0 ? " Não foi possível atualizar as automações já criadas." : n === 0 ? "" : " " + n + (n === 1 ? " automação já criada foi atualizada." : " automações já criadas foram atualizadas.");
    }
    formOpen = false;
    editingId = null;
    await loadRules();
    setMsg((wasEditing ? "Alterações salvas!" : "Automação automática criada! Os próximos posts e Reels terão a automação criada sozinha.") + extra, "success");
  } catch (e) {
    setMsg("Erro ao salvar: " + errorText(e), "error");
  } finally {
    busy = false;
    $("autoAutoSaveBtn").disabled = false;
  }
}
async function toggleRule(id, on, input) {
  const r = rules.find((x) => x.id === id);
  if (!r) return;
  if (on) {
    const problem = conflictMessage(r, id);
    if (problem) {
      input.checked = false;
      setMsg(problem, "error");
      return;
    }
  }
  const { error } = await sb.from(RULES).update({ enabled: on }).eq("id", id);
  if (error) {
    input.checked = !on;
    setMsg("Erro ao atualizar: " + errorText(error), "error");
    return;
  }
  await loadRules();
  setMsg(on ? "Automação automática ativada." : "Automação automática pausada. Ela continua salva.", "success");
}
async function deleteRule(id) {
  if (!confirm("Apagar esta automação automática? Novos posts deixarão de receber automação por ela.")) return;
  const created = await fetchCreated(id);
  let removeCreated = false;
  if (created.length > 0) {
    removeCreated = confirm("Existem " + created.length + " automações já criadas por ela.\n\nOK = excluir também essas automações\nCancelar = manter elas");
  }
  const { error } = await sb.from(RULES).delete().eq("id", id);
  if (error) {
    setMsg("Erro ao apagar: " + error.message, "error");
    return;
  }
  if (removeCreated) {
    const table = await getTableName();
    if (table) await sb.from(table).delete().in("id", created.map((c) => c.row.id));
  }
  await loadRules();
  await loadPosts();
  setMsg("Automação automática apagada." + (removeCreated ? " As automações criadas por ela também foram excluídas." : ""), "success");
}
function renderPostCard(item) {
  const s = item.seen;
  const row = item.row;
  const acc = accounts.find((a) => a.id === s.instagram_config_id);
  const fallback = "https://www.instagram.com/p/" + s.shortcode + "/";
  const link = s.permalink && isUrl(s.permalink) ? s.permalink : fallback;
  const thumb = s.thumbnail_url && isUrl(s.thumbnail_url) ? '<img src="' + esc(s.thumbnail_url) + '" alt="" loading="lazy" />' : "📷";
  const kw = row.palavra_chave === "*" ? "Qualquer comentário" : row.palavra_chave;
  const created = s.created_at ? new Date(s.created_at).toLocaleString("pt-BR") : "—";
  return (
    '<div class="automation-card" data-id="' + esc(row.id) + '" data-ativo="' + (row.ativo ? "true" : "false") + '">' +
    '<div class="automation-card-top">' +
    '<span class="badge ' + (row.ativo ? "badge-ativo" : "badge-inativo") + '">' + (row.ativo ? "Ativo" : "Inativo") + "</span>" +
    '<div class="automation-card-actions">' +
    '<button type="button" class="icon-btn auto-post-toggle" title="' + (row.ativo ? "Desativar" : "Ativar") + '">' + (row.ativo ? "🔇" : "🔊") + "</button>" +
    '<button type="button" class="icon-btn auto-post-del" title="Excluir">🗑️</button>' +
    "</div></div>" +
    '<div><span class="badge badge-muted">📸 @' + esc(acc ? acc.instagram_username : "conta") + '</span> <span class="badge badge-muted">⚡ Automático</span></div>' +
    '<div class="auto-post-row"><div class="auto-post-thumb">' + thumb + "</div>" +
    '<div style="min-width:0;flex:1;"><div class="auto-post-caption">' + esc(s.caption || "(sem legenda)") + "</div>" +
    '<a class="automation-card-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Ver post no Instagram ↗</a></div></div>' +
    '<div class="automation-card-keyword"><span class="keyword-chip">' + esc(kw) + "</span></div>" +
    (row.titulo_produto ? '<div class="automation-card-post" style="color:var(--text);font-weight:600;">🛍️ ' + esc(row.titulo_produto) + "</div>" : "") +
    '<a class="automation-card-link" href="' + esc(isUrl(row.produto_url || "") ? row.produto_url : "#") + '" target="_blank" rel="noopener noreferrer">' + esc(row.produto_url) + "</a>" +
    '<div class="automation-card-footer">Criado automaticamente em ' + created + "</div>" +
    "</div>"
  );
}
async function loadPosts() {
  const sec = $("autoAutoPostsSection");
  if (!sec || !userId) return;
  const items = await fetchCreated();
  sec.classList.toggle("hidden", items.length === 0);
  $("autoAutoPostsGrid").innerHTML = items.map(renderPostCard).join("");
}
async function onPostsClick(e) {
  const tg = e.target.closest(".auto-post-toggle");
  const dl = e.target.closest(".auto-post-del");
  if (!tg && !dl) return;
  const card = e.target.closest(".automation-card");
  const id = card.getAttribute("data-id");
  const table = await getTableName();
  if (!table) return;
  if (tg) {
    const { error } = await sb.from(table).update({ ativo: card.getAttribute("data-ativo") !== "true" }).eq("id", id);
    if (error) return setMsg("Erro ao alternar status: " + error.message, "error");
  } else {
    if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) return setMsg("Erro ao excluir: " + error.message, "error");
  }
  await loadPosts();
}
function ensurePostsSection() {
  const host = $("subtab-list");
  if (!host || $("autoAutoPostsSection")) return;
  const sec = document.createElement("section");
  sec.id = "autoAutoPostsSection";
  sec.className = "panel panel-plain hidden";
  sec.innerHTML = '<div class="panel-heading-row"><h2>⚡ Posts cadastrados automaticamente</h2><button type="button" id="autoAutoPostsRefresh" class="btn btn-outline btn-sm">Atualizar</button></div><div id="autoAutoPostsGrid" class="automation-grid"></div>';
  host.insertBefore(sec, host.firstChild);
  $("autoAutoPostsRefresh").addEventListener("click", loadPosts);
  $("autoAutoPostsGrid").addEventListener("click", onPostsClick);
}
function build() {
  const nav = $("automationsSubtabNav");
  const firstPanel = document.querySelector(".subtab-panel");
  if (!nav || !firstPanel || $("subtab-auto")) return false;
  injectStyles();
  ensurePostsSection();
  const listBtn = nav.querySelector('.subtab-btn[data-subtab="list"]');
  if (listBtn) listBtn.addEventListener("click", loadPosts);
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
  const typeChips = Object.keys(LINK_TYPES).map((k) =>
    '<label class="' + (k === "produto" ? "active" : "") + '"><input type="radio" name="autoAutoType" value="' + k + '"' + (k === "produto" ? " checked" : "") + " /><span>" + LINK_TYPES[k].icon + " " + LINK_TYPES[k].label + "</span></label>"
  ).join("");
  panel.innerHTML =
    '<section class="panel">' +
    '<div class="panel-heading-row"><h2>Automações automáticas</h2><button type="button" id="autoAutoNewBtn" class="btn btn-primary btn-sm">＋ Nova automação automática</button></div>' +
    '<p class="panel-lead">Publicou um post ou Reel? A automação é criada sozinha. Você pode ter várias, cada uma com sua conta, seu link e sua mensagem.</p>' +
    '<div id="autoAutoListView"><div id="autoAutoRules"></div></div>' +
    '<div id="autoAutoFormView" class="hidden">' +
    '<div class="panel-heading-row"><h3 id="autoAutoFormTitle"></h3></div>' +
    '<div id="autoAutoAccountsBlock" class="hidden"><div class="form-step"><b>1</b><span>Em quais contas?</span></div>' +
    '<div class="auto-mode">' +
    '<label class="active"><input type="radio" name="autoAutoAccMode" value="all" checked /><span><strong>Todas as minhas contas</strong><small>Inclusive contas que você conectar depois.</small></span></label>' +
    '<label><input type="radio" name="autoAutoAccMode" value="selected" /><span><strong>Contas específicas</strong><small>Escolha quais contas terão esta automação.</small></span></label>' +
    '</div><div id="autoAutoAccountList" class="auto-acc-list hidden"></div></div>' +
    '<div class="form-step"><b>2</b><span>Quando enviar o Direct?</span></div>' +
    '<div class="auto-mode">' +
    '<label class="active"><input type="radio" name="autoAutoMode" value="any" checked /><span><strong>Qualquer comentário</strong><small>Todo comentário no post recebe o Direct. Só uma por conta.</small></span></label>' +
    '<label><input type="radio" name="autoAutoMode" value="keyword" /><span><strong>Palavra-chave específica</strong><small>Só quem comentar a palavra recebe o Direct. Pode ter várias por conta.</small></span></label>' +
    '</div>' +
    '<div class="field hidden" id="autoAutoKeywordField"><span>Palavra-chave do comentário</span><input type="text" id="autoAutoKeyword" placeholder="ex: quero" /></div>' +
    '<div class="form-step"><b>3</b><span>Para onde o link leva?</span></div>' +
    '<div class="auto-types">' + typeChips + '</div>' +
    '<div class="produto-picker-row"><div class="field flush"><span id="autoAutoUrlLabel">Link do produto</span><input type="text" id="autoAutoUrl" placeholder="https://" /></div>' +
    '<button type="button" id="autoAutoPickBtn" class="btn btn-outline">📦 Escolher produto cadastrado</button></div>' +
    '<div class="field hidden" id="autoAutoBtnField"><span>Texto do botão (máx. ' + MAX_BUTTON + " caracteres)</span>" +
    '<input type="text" id="autoAutoBtnLabel" maxlength="' + MAX_BUTTON + '" placeholder="ex: Quero saber mais" /><small class="auto-count" id="autoAutoBtnCount">0/' + MAX_BUTTON + "</small></div>" +
    '<div class="auto-btn-preview" id="autoAutoBtnPreview"></div>' +
    '<div class="automation-form-grid">' +
    '<div class="field field-full"><span>Imagem (URL) — opcional</span><input type="text" id="autoAutoImg" placeholder="https://" /></div>' +
    '<div class="field"><span>Título — opcional</span><input type="text" id="autoAutoTitle" placeholder="Nome que aparece no Direct" /></div>' +
    '<div class="field"><span>Preço — opcional</span><input type="text" id="autoAutoPrice" placeholder="R$ 0,00" /></div>' +
    '</div>' +
    '<label class="auto-apply hidden" id="autoAutoApplyRow"><input type="checkbox" id="autoAutoApply" checked /><span>Aplicar também às automações que já foram criadas por esta regra</span></label>' +
    '<div class="auto-actions"><button type="button" id="autoAutoSaveBtn" class="btn btn-primary">Salvar</button>' +
    '<button type="button" id="autoAutoCancelBtn" class="btn btn-outline">Cancelar</button></div>' +
    '<p class="auto-note">Vale só para publicações feitas depois de ativar. As automações criadas aparecem em “Automações cadastradas” e podem ser pausadas ou excluídas normalmente.</p>' +
    '</div>' +
    '<div id="autoAutoMsg" class="banner hidden"></div>' +
    '</section>';
  firstPanel.parentElement.insertBefore(panel, $("subtab-produtos") || null);
  btn.addEventListener("click", () => {
    nav.querySelectorAll(".subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "subtab-auto"));
  });
  $("autoAutoNewBtn").addEventListener("click", () => openForm(null));
  $("autoAutoCancelBtn").addEventListener("click", () => {
    setMsg("");
    closeForm();
  });
  $("autoAutoSaveBtn").addEventListener("click", save);
  $("autoAutoRules").addEventListener("click", (e) => {
    const card = e.target.closest(".auto-rule");
    if (!card) return;
    const id = card.getAttribute("data-id");
    if (e.target.closest(".auto-rule-edit")) openForm(rules.find((r) => r.id === id));
    else if (e.target.closest(".auto-rule-del")) deleteRule(id);
  });
  $("autoAutoRules").addEventListener("change", (e) => {
    const input = e.target.closest(".auto-rule-switch");
    if (!input) return;
    toggleRule(input.closest(".auto-rule").getAttribute("data-id"), input.checked, input);
  });
  document.querySelectorAll('input[name="autoAutoMode"], input[name="autoAutoAccMode"], input[name="autoAutoType"]').forEach((r) => r.addEventListener("change", syncUi));
  $("autoAutoBtnLabel").addEventListener("input", syncUi);
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
  await getTableName();
  await loadRules();
  await loadPosts();
}
document.addEventListener("DOMContentLoaded", () => {
  init();
  document.addEventListener("visibilitychange", () => { if (ready && !document.hidden) loadPosts(); });
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { userId = null; return; }
    if (s && !ready) setTimeout(init, 0);
  });
});
