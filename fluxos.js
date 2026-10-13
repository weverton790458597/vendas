// fluxos.js
// Construtor de fluxos de conversa (perguntas + botões) para as automações.
// Módulo isolado, no mesmo padrão dos outros: client próprio do Supabase que
// só LÊ a sessão do app.js, estilos injetados por aqui.
//
//  - Sub-aba "Fluxos" (#fluxosRoot): lista, editor visual e resultados/leads.
//  - Injeta no formulário "Nova automação" o seletor #fluxoSelect (lido pelo app.js).
//  - Expõe window.fluxoNameById e preenche os chips .fluxo-chip-name das automações.
//
// Requer fluxos.sql rodado e a edge function flow-engine publicada.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const sb = createClient(
  "https://abdliioyzkylccfylils.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
);

const MAX_STEPS = 15;
const MAX_FIRST_OPTIONS = 3; // 1ª mensagem = template de botões (limite da Meta)
const MAX_OPTIONS = 10;
const TYPES = {
  choice: "Pergunta com botões",
  input: "Pergunta aberta (texto)",
  message: "Mensagem",
  link: "Link final",
};

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trunc = (s, n) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));
const isUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());

let userId = null;
let flows = [];
let stats = {}; // fluxo_id -> {total, concluidos}
let view = "list"; // list | edit | results
let draft = null; // fluxo em edição {id, nome, steps[]}
let seq = 1;
let loaded = false;
let busy = false;

/* ------------------------------ estilos ------------------------------ */
function injectStyles() {
  if ($("#fluxosStyles")) return;
  const st = document.createElement("style");
  st.id = "fluxosStyles";
  st.textContent = `
    .fx-lead { color:var(--text-muted); font-size:.9rem; margin:0 0 1rem; }
    .fx-list { display:grid; gap:.8rem; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
    .fx-card { padding:1rem; border:1px solid var(--border); border-radius:14px; background:var(--surface); display:flex; flex-direction:column; gap:.5rem; }
    .fx-card h3 { margin:0; font-size:1rem; }
    .fx-card .fx-meta { color:var(--text-muted); font-size:.82rem; }
    .fx-card .fx-actions, .fx-row-actions { display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.3rem; }
    .fx-step { border:1px solid var(--border); border-radius:14px; background:var(--surface); padding:1rem; margin-bottom:.8rem; }
    .fx-step-head { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.8rem; }
    .fx-num { width:26px; height:26px; border-radius:50%; background:var(--accent-1); color:#fff; font-weight:700; font-size:.8rem; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .fx-badge { font-size:.7rem; font-weight:700; padding:.15rem .5rem; border-radius:999px; background:var(--surface-2); color:var(--text-muted); }
    .fx-step-head select { flex:1; min-width:160px; }
    .fx-tools { display:flex; gap:.25rem; margin-left:auto; }
    .fx-opt { display:grid; grid-template-columns:1fr 1fr auto; gap:.5rem; align-items:end; margin-bottom:.5rem; }
    .fx-opt .field { margin:0; }
    .fx-opt-hint { font-size:.75rem; color:var(--text-faint); }
    .fx-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; }
    .fx-add { display:flex; gap:.4rem; flex-wrap:wrap; margin:.4rem 0 1rem; }
    .fx-step textarea { width:100%; min-height:70px; resize:vertical; }
    .fx-counter { font-size:.72rem; color:var(--text-faint); text-align:right; }
    .fx-footer { display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; }
    .fx-note { font-size:.8rem; color:var(--text-muted); background:var(--surface-2); border-radius:10px; padding:.6rem .8rem; margin-bottom:1rem; }
    .fx-table { width:100%; border-collapse:collapse; font-size:.85rem; }
    .fx-table th, .fx-table td { text-align:left; padding:.5rem .6rem; border-bottom:1px solid var(--border); vertical-align:top; }
    .fx-ans { display:flex; flex-direction:column; gap:.15rem; }
    .fx-ans b { color:var(--text-muted); font-weight:600; }
    .fx-pill { display:inline-block; padding:.12rem .5rem; border-radius:999px; font-size:.72rem; font-weight:600; background:var(--surface-2); color:var(--text-muted); }
    .fx-pill.ok { background:var(--success-bg); color:var(--success); }
    @media (max-width:700px){ .fx-opt, .fx-grid2 { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(st);
}

/* ------------------------------ dados ------------------------------ */
async function fetchFlows() {
  const { data, error } = await sb.from("fluxos").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  flows = data || [];
  const { data: ses } = await sb.from("fluxo_sessoes").select("fluxo_id, status").eq("user_id", userId).limit(5000);
  stats = {};
  (ses || []).forEach((s) => {
    const k = s.fluxo_id;
    if (!k) return;
    stats[k] = stats[k] || { total: 0, concluidos: 0 };
    stats[k].total++;
    if (s.status === "concluido") stats[k].concluidos++;
  });
}

async function load() {
  if (busy) return;
  busy = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    userId = session.user.id;
    loaded = true;
    injectStyles();
    await fetchFlows();
    syncSelect();
    labelChips();
    if (view === "list") render();
  } catch (e) {
    const root = $("#fluxosRoot");
    if (root) root.innerHTML = '<div class="empty-state">Não foi possível carregar os fluxos: ' + esc(e.message) + "</div>";
  } finally {
    busy = false;
  }
}

/* ------------------- integração com o form e a lista ------------------- */
window.fluxoNameById = (id) => (flows.find((f) => f.id === id) || {}).nome || "Fluxo de conversa";

function labelChips() {
  document.querySelectorAll(".fluxo-chip-name[data-fluxo-id]").forEach((el) => {
    const name = window.fluxoNameById(el.getAttribute("data-fluxo-id"));
    if (el.textContent !== "Fluxo: " + name) el.textContent = "Fluxo: " + name;
  });
}

function syncSelect() {
  const urlInput = $("#produtoUrl");
  if (!urlInput) return;
  let sel = $("#fluxoSelect");
  if (!sel) {
    const urlField = urlInput.closest(".field");
    if (!urlField) return;
    const wrap = document.createElement("div");
    wrap.className = "field field-full";
    wrap.innerHTML =
      "<span>Fluxo de conversa (opcional)</span>" +
      '<select id="fluxoSelect"></select>' +
      '<p class="field-hint" id="fluxoHint"></p>';
    urlField.before(wrap);
    sel = $("#fluxoSelect");
    sel.addEventListener("change", () => {
      urlField.classList.toggle("hidden", !!sel.value);
    });
  }
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Sem fluxo — enviar o link direto</option>' +
    flows.map((f) => '<option value="' + esc(f.id) + '">' + esc(f.nome) + "</option>").join("");
  sel.value = flows.some((f) => f.id === current) ? current : "";
  $("#fluxoHint").textContent = flows.length
    ? "Com um fluxo, o Direct inicia uma conversa com perguntas em vez de enviar só o link."
    : "Você ainda não tem fluxos. Crie o primeiro na aba Fluxos.";
  urlInput.closest(".field").classList.toggle("hidden", !!sel.value);
}

/* ------------------------------ lista ------------------------------ */
function renderList() {
  const root = $("#fluxosRoot");
  const cards = flows.length
    ? '<div class="fx-list">' +
      flows.map((f) => {
        const n = (f.definicao && f.definicao.steps ? f.definicao.steps.length : 0);
        const st = stats[f.id] || { total: 0, concluidos: 0 };
        const pct = st.total ? Math.round((st.concluidos / st.total) * 100) + "% concluíram" : "sem conversas ainda";
        return (
          '<div class="fx-card"><h3>' + esc(f.nome) + "</h3>" +
          '<div class="fx-meta">' + n + (n === 1 ? " etapa" : " etapas") + " · " + st.total + " conversas · " + pct + "</div>" +
          '<div class="fx-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-fx="edit" data-id="' + esc(f.id) + '">Editar</button>' +
          '<button type="button" class="btn btn-outline btn-sm" data-fx="results" data-id="' + esc(f.id) + '">Respostas</button>' +
          '<button type="button" class="btn btn-danger-ghost btn-sm" data-fx="delete" data-id="' + esc(f.id) + '">Excluir</button>' +
          "</div></div>"
        );
      }).join("") + "</div>"
    : '<div class="empty-state">Nenhum fluxo criado ainda. Crie um funil com perguntas para qualificar seus leads antes de enviar o link.</div>';

  root.innerHTML =
    '<div class="panel-heading-row"><h2>Fluxos de conversa</h2>' +
    '<button type="button" class="btn btn-primary btn-sm" data-fx="new">+ Novo fluxo</button></div>' +
    '<p class="fx-lead">Monte uma conversa no Direct: perguntas com botões, respostas abertas (e-mail, WhatsApp…) e, no fim, o link. ' +
    "Depois escolha o fluxo ao criar a automação de um post.</p>" + cards;
}

/* ------------------------------ editor ------------------------------ */
const newStep = (type) => {
  const id = "s" + seq++;
  const base = { id, type, text: "", next: "__seq" };
  if (type === "choice") base.options = [{ label: "", next: "__seq" }, { label: "", next: "__seq" }];
  if (type === "input") { base.save_as = ""; base.validate = "none"; }
  if (type === "link") { base.url = ""; base.button = "Quero ver"; delete base.next; }
  return base;
};

function openEditor(flow) {
  if (flow) {
    const steps = JSON.parse(JSON.stringify((flow.definicao && flow.definicao.steps) || []));
    // ids novos continuam a numeração
    seq = steps.reduce((m, s) => Math.max(m, parseInt(String(s.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
    draft = { id: flow.id, nome: flow.nome, steps };
  } else {
    seq = 1;
    draft = { id: null, nome: "", steps: [newStep("choice")] };
  }
  view = "edit";
  render();
}

function nextSelect(step, current, field, optIdx) {
  const idx = draft.steps.findIndex((s) => s.id === step.id);
  const opts =
    '<option value="__seq">Próxima etapa da lista</option><option value="">Fim da conversa</option>' +
    draft.steps
      .filter((s) => s.id !== step.id)
      .map((s) => {
        const i = draft.steps.indexOf(s) + 1;
        return '<option value="' + esc(s.id) + '">Ir para etapa ' + i + " — " + esc(trunc(s.text || TYPES[s.type], 24)) + "</option>";
      }).join("");
  const attrs = 'data-field="' + field + '" data-sid="' + esc(step.id) + '"' + (optIdx != null ? ' data-opt="' + optIdx + '"' : "");
  return "<select " + attrs + ">" + opts.replace('value="' + esc(current == null ? "" : current) + '"', 'value="' + esc(current == null ? "" : current) + '" selected') + "</select>";
}

function stepHtml(step, i) {
  const n = i + 1;
  const isFirst = i === 0;
  const typeOpts = Object.keys(TYPES)
    .filter((t) => !(isFirst && t === "message"))
    .map((t) => '<option value="' + t + '"' + (t === step.type ? " selected" : "") + ">" + TYPES[t] + "</option>").join("");

  let body =
    '<div class="field"><span>' + (step.type === "link" ? "Mensagem antes do botão" : "Mensagem") + "</span>" +
    '<textarea data-field="text" data-sid="' + esc(step.id) + '" maxlength="600" placeholder="' +
    (step.type === "choice" ? "Ex.: Qual a sua faixa de idade?" : step.type === "input" ? "Ex.: Qual o seu melhor e-mail?" : step.type === "link" ? "Ex.: Perfeito! Toque abaixo para ver sua oferta 👇" : "Texto da mensagem") +
    '">' + esc(step.text) + "</textarea>" +
    '<div class="fx-counter">use {{nome_da_resposta}} para citar uma resposta anterior</div></div>';

  if (step.type === "choice") {
    const max = isFirst ? MAX_FIRST_OPTIONS : MAX_OPTIONS;
    body += (step.options || []).map((o, oi) =>
      '<div class="fx-opt">' +
      '<div class="field"><span>Botão ' + (oi + 1) + '</span><input type="text" maxlength="20" data-field="opt-label" data-sid="' + esc(step.id) + '" data-opt="' + oi + '" value="' + esc(o.label) + '" placeholder="Até 20 caracteres" /></div>' +
      '<div class="field"><span>Depois vai para</span>' + nextSelect(step, o.next, "opt-next", oi) + "</div>" +
      '<button type="button" class="btn btn-danger-ghost btn-sm" data-fx="del-opt" data-sid="' + esc(step.id) + '" data-opt="' + oi + '" aria-label="Remover botão">✕</button></div>'
    ).join("");
    if ((step.options || []).length < max) {
      body += '<button type="button" class="btn btn-outline btn-sm" data-fx="add-opt" data-sid="' + esc(step.id) + '">+ Adicionar botão</button>';
    }
    if (isFirst) body += '<p class="fx-opt-hint">A 1ª mensagem aceita até 3 botões (limite do Instagram).</p>';
  } else if (step.type === "input") {
    body +=
      '<div class="fx-grid2">' +
      '<div class="field"><span>Salvar resposta como</span><input type="text" maxlength="30" data-field="save_as" data-sid="' + esc(step.id) + '" value="' + esc(step.save_as) + '" placeholder="ex: email" /></div>' +
      '<div class="field"><span>Validar como</span><select data-field="validate" data-sid="' + esc(step.id) + '">' +
      [["none", "Qualquer texto"], ["email", "E-mail"], ["phone", "Telefone / WhatsApp"]].map((v) => '<option value="' + v[0] + '"' + (step.validate === v[0] ? " selected" : "") + ">" + v[1] + "</option>").join("") +
      "</select></div></div>" +
      '<div class="field"><span>Depois vai para</span>' + nextSelect(step, step.next, "next") + "</div>";
  } else if (step.type === "message") {
    body += '<div class="field"><span>Depois vai para</span>' + nextSelect(step, step.next, "next") + "</div>";
  } else if (step.type === "link") {
    body +=
      '<div class="fx-grid2">' +
      '<div class="field"><span>Texto do botão</span><input type="text" maxlength="20" data-field="button" data-sid="' + esc(step.id) + '" value="' + esc(step.button) + '" /></div>' +
      '<div class="field"><span>Link de destino</span><input type="text" data-field="url" data-sid="' + esc(step.id) + '" value="' + esc(step.url) + '" placeholder="https://" /></div></div>' +
      '<p class="fx-opt-hint">Esta etapa encerra a conversa.</p>';
  }

  return (
    '<div class="fx-step" data-sid="' + esc(step.id) + '">' +
    '<div class="fx-step-head"><span class="fx-num">' + n + "</span>" +
    (isFirst ? '<span class="fx-badge">INÍCIO</span>' : "") +
    '<select data-field="type" data-sid="' + esc(step.id) + '">' + typeOpts + "</select>" +
    '<div class="fx-tools">' +
    '<button type="button" class="icon-btn" data-fx="up" data-sid="' + esc(step.id) + '" title="Subir"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
    '<button type="button" class="icon-btn" data-fx="down" data-sid="' + esc(step.id) + '" title="Descer"' + (i === draft.steps.length - 1 ? " disabled" : "") + ">↓</button>" +
    '<button type="button" class="icon-btn" data-fx="del-step" data-sid="' + esc(step.id) + '" title="Excluir etapa">🗑️</button>' +
    "</div></div>" + body + "</div>"
  );
}

function renderEditor() {
  const root = $("#fluxosRoot");
  root.innerHTML =
    '<div class="panel-heading-row"><h2>' + (draft.id ? "Editar fluxo" : "Novo fluxo") + "</h2>" +
    '<button type="button" class="btn btn-outline btn-sm" data-fx="back">← Voltar</button></div>' +
    '<div class="fx-note">Como funciona: o comentário envia a 1ª mensagem. Quando a pessoa toca num botão ou responde, ' +
    "o fluxo continua com a próxima etapa. Se ela não responder, a conversa para.</div>" +
    '<div class="field"><span>Nome do fluxo</span><input type="text" id="fxNome" maxlength="60" value="' + esc(draft.nome) + '" placeholder="Ex.: Qualificação curso" /></div>' +
    draft.steps.map(stepHtml).join("") +
    '<div class="fx-add">' +
    Object.keys(TYPES).filter((t) => t !== "message").concat(["message"]).map((t) =>
      '<button type="button" class="btn btn-outline btn-sm" data-fx="add-step" data-type="' + t + '">+ ' + TYPES[t] + "</button>").join("") +
    "</div>" +
    '<div id="fxError" class="banner"></div>' +
    '<div class="fx-footer"><button type="button" class="btn btn-primary" data-fx="save">Salvar fluxo</button>' +
    '<button type="button" class="btn btn-outline" data-fx="back">Cancelar</button></div>';
}

function findStep(sid) { return draft.steps.find((s) => s.id === sid); }

function onEditorInput(e) {
  const t = e.target;
  if (t.id === "fxNome") { draft.nome = t.value; return; }
  const field = t.getAttribute("data-field");
  const sid = t.getAttribute("data-sid");
  if (!field || !sid) return;
  const step = findStep(sid);
  if (!step) return;
  const oi = t.getAttribute("data-opt");
  if (field === "type") {
    if (t.value === step.type) return;
    const fresh = newStep(t.value);
    fresh.id = step.id; fresh.text = step.text;
    Object.keys(step).forEach((k) => delete step[k]);
    Object.assign(step, fresh);
    renderEditor();
    return;
  }
  if (field === "opt-label") step.options[Number(oi)].label = t.value;
  else if (field === "opt-next") step.options[Number(oi)].next = t.value;
  else step[field] = t.value;
}

function resolveNext(value, idx) {
  if (value === "__seq" || value === undefined) {
    const nx = draft.steps[idx + 1];
    return nx ? nx.id : null;
  }
  return value || null;
}

function buildDefinition() {
  const steps = draft.steps.map((s, idx) => {
    const out = { id: s.id, type: s.type, text: s.text.trim() };
    if (s.type === "choice") {
      out.options = s.options.map((o) => ({ label: o.label.trim(), next: resolveNext(o.next, idx) }));
      out.save_as = (s.save_as || "").trim() || s.id;
    } else if (s.type === "input") {
      out.save_as = (s.save_as || "").trim().replace(/[^\w-]/g, "_") || s.id;
      out.validate = s.validate || "none";
      out.next = resolveNext(s.next, idx);
    } else if (s.type === "message") {
      out.next = resolveNext(s.next, idx);
    } else if (s.type === "link") {
      out.url = s.url.trim();
      out.button = s.button.trim();
    }
    return out;
  });
  return { version: 1, start: steps[0].id, steps };
}

function validateDraft() {
  if (!draft.nome.trim()) return "Dê um nome ao fluxo.";
  if (!draft.steps.length) return "Adicione pelo menos uma etapa.";
  const first = draft.steps[0];
  if (first.type === "message") return "A 1ª etapa precisa ser uma pergunta ou um link (a 1ª mensagem do Instagram não pode ser seguida de outra sem resposta).";
  for (let i = 0; i < draft.steps.length; i++) {
    const s = draft.steps[i];
    const n = "Etapa " + (i + 1);
    if (!s.text.trim()) return n + ": escreva a mensagem.";
    if (s.type === "choice") {
      const max = i === 0 ? MAX_FIRST_OPTIONS : MAX_OPTIONS;
      if (!s.options.length) return n + ": adicione pelo menos um botão.";
      if (s.options.length > max) return n + ": no máximo " + max + " botões.";
      const labels = s.options.map((o) => o.label.trim().toLowerCase());
      if (labels.some((l) => !l)) return n + ": todos os botões precisam de texto.";
      if (new Set(labels).size !== labels.length) return n + ": há botões com o mesmo texto.";
    }
    if (s.type === "link") {
      if (!s.button.trim()) return n + ": informe o texto do botão.";
      if (!isUrl(s.url)) return n + ": o link precisa começar com http:// ou https://";
    }
  }
  return null;
}

function showFxError(msg) {
  const el = $("#fxError");
  if (!el) return;
  el.textContent = msg;
  el.className = "banner error";
}

async function saveDraft(btn) {
  const err = validateDraft();
  if (err) { showFxError(err); return; }
  btn.disabled = true;
  try {
    const row = { user_id: userId, nome: draft.nome.trim(), definicao: buildDefinition(), updated_at: new Date().toISOString() };
    const res = draft.id
      ? await sb.from("fluxos").update(row).eq("id", draft.id)
      : await sb.from("fluxos").insert(row);
    if (res.error) throw res.error;
    view = "list";
    draft = null;
    await fetchFlows();
    syncSelect();
    labelChips();
    render();
  } catch (e) {
    showFxError("Erro ao salvar: " + e.message);
    btn.disabled = false;
  }
}

async function deleteFlow(id) {
  const f = flows.find((x) => x.id === id);
  if (!f) return;
  const { count } = await sb.from("post_automacao").select("id", { count: "exact", head: true }).eq("fluxo_id", id);
  if (count && count > 0) {
    alert("Este fluxo está em uso por " + count + (count === 1 ? " automação." : " automações.") + " Troque ou exclua essas automações antes.");
    return;
  }
  if (!confirm('Excluir o fluxo "' + f.nome + '"? As respostas coletadas também deixam de aparecer.')) return;
  const { error } = await sb.from("fluxos").delete().eq("id", id);
  if (error) { alert("Erro ao excluir: " + error.message); return; }
  await fetchFlows();
  syncSelect();
  render();
}

/* ------------------------------ resultados ------------------------------ */
let resultsRows = [];
let resultsFlow = null;

async function openResults(id) {
  resultsFlow = flows.find((f) => f.id === id);
  if (!resultsFlow) return;
  view = "results";
  $("#fluxosRoot").innerHTML = '<div class="loading-row">Carregando respostas…</div>';
  const { data, error } = await sb.from("fluxo_sessoes").select("*").eq("fluxo_id", id).order("created_at", { ascending: false }).limit(300);
  if (error) {
    $("#fluxosRoot").innerHTML = '<div class="empty-state">Erro: ' + esc(error.message) + "</div>";
    return;
  }
  resultsRows = data || [];
  renderResults();
}

function renderResults() {
  const rows = resultsRows;
  const done = rows.filter((r) => r.status === "concluido").length;
  const body = rows.length
    ? '<div class="table-scroll"><table class="fx-table"><thead><tr><th>Quando</th><th>Pessoa</th><th>Status</th><th>Respostas</th></tr></thead><tbody>' +
      rows.map((r) => {
        const ans = Object.entries(r.respostas || {}).map(([k, v]) => "<span><b>" + esc(k) + ":</b> " + esc(v) + "</span>").join("") || '<span class="fx-opt-hint">—</span>';
        return (
          "<tr><td>" + new Date(r.created_at).toLocaleString("pt-BR") + "</td>" +
          "<td>" + (r.instagram_username ? "@" + esc(r.instagram_username) : esc(r.instagram_user_id)) + "</td>" +
          '<td><span class="fx-pill ' + (r.status === "concluido" ? "ok" : "") + '">' + (r.status === "concluido" ? "Concluiu" : r.status === "ativo" ? "Em andamento" : "Encerrada") + "</span></td>" +
          '<td><div class="fx-ans">' + ans + "</div></td></tr>"
        );
      }).join("") + "</tbody></table></div>"
    : '<div class="empty-state">Ninguém passou por este fluxo ainda.</div>';

  $("#fluxosRoot").innerHTML =
    '<div class="panel-heading-row"><h2>Respostas — ' + esc(resultsFlow.nome) + "</h2>" +
    '<div class="fx-row-actions"><button type="button" class="btn btn-outline btn-sm" data-fx="csv">Exportar CSV</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-fx="back">← Voltar</button></div></div>' +
    '<p class="fx-lead">' + rows.length + " conversas · " + done + " concluíram" + (rows.length >= 300 ? " (mostrando as 300 mais recentes)" : "") + "</p>" + body;
}

function exportCsv() {
  const keys = [];
  resultsRows.forEach((r) => Object.keys(r.respostas || {}).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [["data", "usuario", "status"].concat(keys).map(cell).join(",")];
  resultsRows.forEach((r) => {
    lines.push([new Date(r.created_at).toLocaleString("pt-BR"), r.instagram_username || r.instagram_user_id, r.status]
      .concat(keys.map((k) => (r.respostas || {})[k])).map(cell).join(","));
  });
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "respostas-" + (resultsFlow.nome || "fluxo").replace(/\W+/g, "-").toLowerCase() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------ render + eventos ------------------------------ */
function render() {
  const root = $("#fluxosRoot");
  if (!root) return;
  if (view === "edit" && draft) renderEditor();
  else if (view === "results") renderResults();
  else renderList();
}

function onClick(e) {
  const b = e.target.closest("[data-fx]");
  if (!b) return;
  const act = b.getAttribute("data-fx");
  const sid = b.getAttribute("data-sid");
  const id = b.getAttribute("data-id");

  if (act === "new") return openEditor(null);
  if (act === "edit") return openEditor(flows.find((f) => f.id === id));
  if (act === "results") return openResults(id);
  if (act === "delete") return deleteFlow(id);
  if (act === "csv") return exportCsv();
  if (act === "back") { view = "list"; draft = null; return render(); }
  if (act === "save") return saveDraft(b);

  if (!draft) return;
  if (act === "add-step") {
    if (draft.steps.length >= MAX_STEPS) return showFxError("Máximo de " + MAX_STEPS + " etapas por fluxo.");
    draft.steps.push(newStep(b.getAttribute("data-type")));
    return renderEditor();
  }
  const i = draft.steps.findIndex((s) => s.id === sid);
  if (act === "del-step") {
    if (draft.steps.length === 1) return showFxError("O fluxo precisa de pelo menos uma etapa.");
    draft.steps.splice(i, 1);
    // referências para a etapa removida viram "fim da conversa"
    draft.steps.forEach((s) => {
      if (s.next === sid) s.next = "";
      (s.options || []).forEach((o) => { if (o.next === sid) o.next = ""; });
    });
    return renderEditor();
  }
  if (act === "up" && i > 0) { [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]]; return renderEditor(); }
  if (act === "down" && i < draft.steps.length - 1) { [draft.steps[i + 1], draft.steps[i]] = [draft.steps[i], draft.steps[i + 1]]; return renderEditor(); }
  if (act === "add-opt") {
    const s = findStep(sid);
    const max = i === 0 ? MAX_FIRST_OPTIONS : MAX_OPTIONS;
    if (s.options.length < max) s.options.push({ label: "", next: "__seq" });
    return renderEditor();
  }
  if (act === "del-opt") {
    const s = findStep(sid);
    s.options.splice(Number(b.getAttribute("data-opt")), 1);
    return renderEditor();
  }
}

function bind() {
  const root = $("#fluxosRoot");
  if (!root || root.dataset.fxBound) return;
  root.dataset.fxBound = "1";
  root.addEventListener("click", onClick);
  root.addEventListener("input", onEditorInput);
  root.addEventListener("change", onEditorInput);
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  load();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { loaded = false; flows = []; return; }
    if (s && !loaded) setTimeout(load, 0);
  });
  // recarrega ao abrir a sub-aba e rotula os chips quando a lista de automações é redesenhada
  document.addEventListener("click", (e) => {
    const t = e.target.closest('.subtab-btn[data-subtab="fluxos"]');
    if (t && loaded) { view = "list"; fetchFlows().then(render).catch(() => {}); }
  });
  const grid = $("#automationsTableBody");
  if (grid) new MutationObserver(labelChips).observe(grid, { childList: true });
});
