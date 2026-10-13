// fluxos.js (v2)
// Construtor de fluxos de conversa (perguntas + botões + links) para as automações.
// Módulo isolado: client próprio do Supabase que só LÊ a sessão do app.js, estilos injetados aqui.
//
//  - Sub-aba "Fluxos" (#fluxosRoot): modelos, lista, editor visual e respostas/leads.
//  - Destinos de link integrados à plataforma: produto cadastrado (window.openProdutoPicker),
//    WhatsApp (número + mensagem pronta), site/outro link e perfil do Instagram conectado.
//  - Injeta no formulário "Nova automação" o seletor #fluxoSelect (lido pelo app.js).
//
// Requer fluxos.sql rodado, a edge function flow-engine e (para lembretes) o cron de fluxos-cron.sql.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const sb = createClient(
  "https://abdliioyzkylccfylils.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
);

const MAX_STEPS = 20;
const MAX_FIRST_OPTIONS = 3; // 1ª mensagem = template de botões (limite da Meta)
const MAX_TEMPLATE_BUTTONS = 3; // template com botão de link: máx. 3
const MAX_OPTIONS = 10;
const TYPES = {
  choice: "Pergunta com botões",
  input: "Pergunta aberta (texto)",
  message: "Mensagem (segue sozinha)",
  link: "Link final (CTA)",
  follower: "Checar se segue (automático)",
};
const DEST_TYPES = {
  produto: "Produto cadastrado",
  whatsapp: "WhatsApp",
  site: "Site",
  perfil: "Perfil do Instagram",
  outro: "Outro link",
};
const BTN_PRESETS = ["🛒 Acessar Produto", "Garantir Oferta", "Ver Detalhes", "Pegar Meu Desconto", "Falar no WhatsApp", "Quero meu link 🔥", "Seguir Perfil", "Já segui ✅"];

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trunc = (s, n) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));
const isUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());
const digits = (v) => String(v || "").replace(/\D/g, "");

let userId = null;
let flows = [];
let stats = {};
let view = "list"; // list | templates | edit | results
let draft = null;
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
    .fx-card p { margin:0; color:var(--text-muted); font-size:.85rem; }
    .fx-card .fx-meta { color:var(--text-muted); font-size:.82rem; }
    .fx-card .fx-actions, .fx-row-actions { display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.3rem; }
    .fx-step { border:1px solid var(--border); border-radius:14px; background:var(--surface); padding:1rem; margin-bottom:.8rem; }
    .fx-step-head { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.8rem; }
    .fx-num { width:26px; height:26px; border-radius:50%; background:var(--accent-1); color:#fff; font-weight:700; font-size:.8rem; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .fx-badge { font-size:.7rem; font-weight:700; padding:.15rem .5rem; border-radius:999px; background:var(--surface-2); color:var(--text-muted); }
    .fx-step-head select { flex:1; min-width:160px; }
    .fx-tools { display:flex; gap:.25rem; margin-left:auto; }
    .fx-opt { border:1px dashed var(--border); border-radius:12px; padding:.7rem; margin-bottom:.6rem; }
    .fx-opt-row { display:grid; grid-template-columns:1fr 150px auto; gap:.5rem; align-items:end; }
    .fx-opt .field, .fx-dest .field { margin:0 0 .5rem; }
    .fx-opt-hint { font-size:.75rem; color:var(--text-faint); margin:.3rem 0 0; }
    .fx-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; }
    .fx-dest { display:grid; grid-template-columns:1fr 1fr; gap:.6rem; align-items:end; margin-top:.5rem; }
    .fx-dest .fx-dest-wide { grid-column:1 / -1; }
    .fx-add { display:flex; gap:.4rem; flex-wrap:wrap; margin:.4rem 0 1rem; }
    .fx-step textarea { width:100%; min-height:70px; resize:vertical; }
    .fx-counter { font-size:.72rem; color:var(--text-faint); text-align:right; }
    .fx-footer { display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; }
    .fx-note { font-size:.8rem; color:var(--text-muted); background:var(--surface-2); border-radius:10px; padding:.6rem .8rem; margin-bottom:1rem; }
    .fx-rem { margin-top:.8rem; padding-top:.8rem; border-top:1px solid var(--border); }
    .fx-rem label.fx-check { display:flex; gap:.5rem; align-items:center; font-size:.85rem; font-weight:600; cursor:pointer; }
    .fx-table { width:100%; border-collapse:collapse; font-size:.85rem; }
    .fx-table th, .fx-table td { text-align:left; padding:.5rem .6rem; border-bottom:1px solid var(--border); vertical-align:top; }
    .fx-ans { display:flex; flex-direction:column; gap:.15rem; }
    .fx-ans b { color:var(--text-muted); font-weight:600; }
    .fx-pill { display:inline-block; padding:.12rem .5rem; border-radius:999px; font-size:.72rem; font-weight:600; background:var(--surface-2); color:var(--text-muted); }
    .fx-pill.ok { background:var(--success-bg); color:var(--success); }
    @media (max-width:700px){ .fx-opt-row, .fx-grid2, .fx-dest { grid-template-columns:1fr; } }
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
    sel.addEventListener("change", () => urlField.classList.toggle("hidden", !!sel.value));
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
        const n = f.definicao && f.definicao.steps ? f.definicao.steps.length : 0;
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
    '<p class="fx-lead">Monte uma conversa no Direct: perguntas com botões, respostas abertas (e-mail, WhatsApp…), checagem de seguidor e, no fim, o link do produto, WhatsApp ou site. ' +
    "Depois escolha o fluxo ao criar a automação de um post.</p>" + cards;
}

/* ------------------------------ modelos ------------------------------ */
function renderTemplates() {
  $("#fluxosRoot").innerHTML =
    '<div class="panel-heading-row"><h2>Novo fluxo</h2><button type="button" class="btn btn-outline btn-sm" data-fx="back">← Voltar</button></div>' +
    '<p class="fx-lead">Comece de um modelo pronto ou do zero. Tudo pode ser editado depois.</p>' +
    '<div class="fx-list">' +
    '<div class="fx-card"><h3>Validar seguidor (pergunta)</h3><p>Pergunta "você já segue?". Quem não segue recebe o botão Seguir Perfil e depois o link. Inclui lembrete.</p>' +
    '<div class="fx-actions"><button type="button" class="btn btn-primary btn-sm" data-fx="tpl" data-tpl="manual">Usar modelo</button></div></div>' +
    '<div class="fx-card"><h3>Validar seguidor (automático)</h3><p>Um toque no botão e o sistema checa se a pessoa segue. Seguidores recebem o link direto.</p>' +
    '<div class="fx-actions"><button type="button" class="btn btn-primary btn-sm" data-fx="tpl" data-tpl="auto">Usar modelo</button></div></div>' +
    '<div class="fx-card"><h3>Capturar lead e enviar link</h3><p>Pergunta o nome e o WhatsApp, depois entrega o link do produto.</p>' +
    '<div class="fx-actions"><button type="button" class="btn btn-primary btn-sm" data-fx="tpl" data-tpl="lead">Usar modelo</button></div></div>' +
    '<div class="fx-card"><h3>Em branco</h3><p>Monte do zero, etapa por etapa.</p>' +
    '<div class="fx-actions"><button type="button" class="btn btn-outline btn-sm" data-fx="tpl" data-tpl="blank">Começar</button></div></div>' +
    "</div>";
}

const R = (label, next) => ({ label, kind: "reply", next });
const LINKBTN = (label, dest) => ({ label, kind: "url", dest });
const MSG = (id, text, next) => ({ id, type: "message", text, next });
const PRODUTO_PENDENTE = () => ({ tipo: "produto" });
const FINAL_TEXT = "Aqui está o link para você conferir todas as informações e garantir o seu com as melhores condições 👇";
const FOLLOW_REMINDER = { minutes: 10, text: "Psiu! Vi que você ainda não pegou seu link. Não vai perder essa, né? 👇", dest: null, button: "Acessar" };

function templateSteps(kind) {
  if (kind === "manual") {
    return {
      nome: "Validar seguidor + link",
      steps: [
        { id: "s1", type: "choice", text: "Oie! 👋 Você já segue nosso perfil?", options: [R("Sim, já sigo!", "s3"), R("Ainda não", "s2")], save_as: "segue" },
        { id: "s2", type: "choice", text: "Sem problemas! Toque em Seguir Perfil e depois em Já segui para liberar seu link exclusivo agora mesmo 👇",
          options: [LINKBTN("Seguir Perfil", { tipo: "perfil" }), R("Já segui ✅", "s4")], reminder: { ...FOLLOW_REMINDER } },
        MSG("s3", "Que demais! Muito obrigado por acompanhar nosso trabalho! 🙌 Já preparei tudo para você.", "s5"),
        MSG("s4", "Prontinho! Como promessa é dívida, aqui está o seu acesso:", "s5"),
        { id: "s5", type: "link", text: FINAL_TEXT, dest: PRODUTO_PENDENTE(), button: "🛒 Acessar Produto" },
      ],
    };
  }
  if (kind === "auto") {
    return {
      nome: "Seguidor automático + link",
      steps: [
        { id: "s1", type: "choice", text: "Oie! 👋 Preparei um link exclusivo pra você. Toque abaixo para liberar:", options: [R("Quero meu link 🔥", "s2")], save_as: "inicio" },
        { id: "s2", type: "follower", text: "", next_yes: "s5", next_no: "s3", save_as: "segue" },
        { id: "s3", type: "choice", text: "Para liberar o link, siga nosso perfil e depois toque em Já segui 👇",
          options: [LINKBTN("Seguir Perfil", { tipo: "perfil" }), R("Já segui ✅", "s4")], reminder: { ...FOLLOW_REMINDER } },
        MSG("s4", "Prontinho! Como promessa é dívida, aqui está o seu acesso:", "s5"),
        { id: "s5", type: "link", text: FINAL_TEXT, dest: PRODUTO_PENDENTE(), button: "🛒 Acessar Produto" },
      ],
    };
  }
  if (kind === "lead") {
    return {
      nome: "Capturar lead + link",
      steps: [
        { id: "s1", type: "choice", text: "Oie! 👋 Vou te mandar o link, mas antes uma pergunta rápida: você já conhece o nosso produto?",
          options: [R("Já conheço", "s2"), R("Quero conhecer", "s2")], save_as: "conhece" },
        { id: "s2", type: "input", text: "Show! Qual o seu nome?", save_as: "nome", validate: "none", next: "s3" },
        { id: "s3", type: "input", text: "Prazer, {{nome}}! Qual seu WhatsApp com DDD? Assim te aviso das novidades 📲", save_as: "whatsapp", validate: "phone", next: "s4" },
        { id: "s4", type: "link", text: "Obrigado, {{nome}}! Aqui está o seu link 👇", dest: PRODUTO_PENDENTE(), button: "Garantir Oferta" },
      ],
    };
  }
  return { nome: "", steps: null };
}

/* ------------------------------ editor ------------------------------ */
const defaultDest = () => ({ tipo: "produto" });
const newStep = (type) => {
  const id = "s" + seq++;
  const base = { id, type, text: "", next: "__seq" };
  if (type === "choice") base.options = [R("", "__seq"), R("", "__seq")];
  if (type === "input") { base.save_as = ""; base.validate = "none"; }
  if (type === "link") { base.dest = defaultDest(); base.button = "🛒 Acessar Produto"; delete base.next; }
  if (type === "follower") { delete base.next; base.next_yes = "__seq"; base.next_no = "__seq"; base.save_as = "segue"; }
  return base;
};

function openEditor(flow, tpl) {
  if (flow) {
    const steps = JSON.parse(JSON.stringify((flow.definicao && flow.definicao.steps) || []));
    steps.forEach((s) => {
      // compat. v1: link com url solta
      if (s.type === "link" && !s.dest) s.dest = { tipo: "outro", url: s.url || "" };
      if (s.type === "choice") (s.options || []).forEach((o) => { if (!o.kind) o.kind = "reply"; });
    });
    seq = steps.reduce((m, s) => Math.max(m, parseInt(String(s.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
    draft = { id: flow.id, nome: flow.nome, steps };
  } else if (tpl && tpl.steps) {
    seq = tpl.steps.length + 1;
    draft = { id: null, nome: tpl.nome, steps: JSON.parse(JSON.stringify(tpl.steps)) };
  } else {
    seq = 1;
    draft = { id: null, nome: "", steps: [newStep("choice")] };
  }
  view = "edit";
  render();
}

function getDestRef(scope, sid, oi) {
  const step = findStep(sid);
  if (!step) return null;
  if (scope === "opt") { const o = step.options[Number(oi)]; return (o.dest = o.dest || defaultDest()); }
  if (scope === "rem") return (step.reminder.dest = step.reminder.dest || defaultDest());
  return (step.dest = step.dest || defaultDest());
}

function destHtml(d, scope, sid, oi) {
  d = d || defaultDest();
  const a = 'data-scope="' + scope + '" data-sid="' + esc(sid) + '"' + (oi != null ? ' data-opt="' + oi + '"' : "");
  const types = Object.keys(DEST_TYPES).map((k) => '<option value="' + k + '"' + (d.tipo === k ? " selected" : "") + ">" + DEST_TYPES[k] + "</option>").join("");
  let extra = "";
  if (d.tipo === "produto") {
    const chosen = d.produto_id || d.url;
    extra = '<div class="field"><span>Produto</span><button type="button" class="btn btn-outline btn-sm" data-fx="pick-produto" ' + a + ">" +
      (chosen ? "✓ " + esc(trunc(d.nome || d.url, 28)) + " (trocar)" : "Escolher produto cadastrado") + "</button></div>";
  } else if (d.tipo === "whatsapp") {
    extra = '<div class="field"><span>Número com DDD</span><input type="text" data-dfield="numero" ' + a + ' value="' + esc(d.numero) + '" placeholder="98999999999" /></div>' +
      '<div class="field fx-dest-wide"><span>Mensagem pronta (opcional)</span><input type="text" data-dfield="mensagem" ' + a + ' value="' + esc(d.mensagem) + '" placeholder="Oi! Vim pelo Instagram e quero saber mais" /></div>';
  } else if (d.tipo === "site" || d.tipo === "outro") {
    extra = '<div class="field"><span>Link</span><input type="text" data-dfield="url" ' + a + ' value="' + esc(d.url) + '" placeholder="https://" /></div>';
  } else if (d.tipo === "perfil") {
    extra = '<p class="fx-opt-hint">Abre o perfil do Instagram conectado a esta automação.</p>';
  }
  return '<div class="fx-dest"><div class="field"><span>Destino</span><select data-dfield="tipo" ' + a + ">" + types + "</select></div>" + extra + "</div>";
}

function nextSelect(step, current, field, optIdx) {
  const opts =
    '<option value="__seq">Próxima etapa da lista</option><option value="">Fim da conversa</option>' +
    draft.steps.filter((s) => s.id !== step.id).map((s) => {
      const i = draft.steps.indexOf(s) + 1;
      return '<option value="' + esc(s.id) + '">Ir para etapa ' + i + " — " + esc(trunc(s.text || TYPES[s.type], 24)) + "</option>";
    }).join("");
  const attrs = 'data-field="' + field + '" data-sid="' + esc(step.id) + '"' + (optIdx != null ? ' data-opt="' + optIdx + '"' : "");
  const cur = esc(current == null ? "" : current);
  return "<select " + attrs + ">" + opts.replace('value="' + cur + '"', 'value="' + cur + '" selected') + "</select>";
}

function reminderHtml(step) {
  const r = step.reminder;
  let h = '<div class="fx-rem"><label class="fx-check"><input type="checkbox" data-field="rem-on" data-sid="' + esc(step.id) + '"' + (r ? " checked" : "") + " /> ⏰ Lembrete automático se a pessoa não responder</label>";
  if (r) {
    h += '<div class="fx-grid2" style="margin-top:.6rem">' +
      '<div class="field"><span>Enviar depois de</span><select data-field="rem-minutes" data-sid="' + esc(step.id) + '">' +
      [5, 10, 30, 60, 180].map((m) => '<option value="' + m + '"' + (Number(r.minutes) === m ? " selected" : "") + ">" + (m >= 60 ? m / 60 + " h" : m + " min") + "</option>").join("") + "</select></div>" +
      '<div class="field"><span>Botão de link no lembrete</span><select data-field="rem-dest-on" data-sid="' + esc(step.id) + '"><option value="0"' + (r.dest ? "" : " selected") + '>Sem botão (repete as opções)</option><option value="1"' + (r.dest ? " selected" : "") + ">Com botão de link</option></select></div></div>" +
      '<div class="field"><span>Texto do lembrete</span><textarea data-field="rem-text" data-sid="' + esc(step.id) + '" maxlength="500" placeholder="Psiu! Vi que você não pegou seu link ainda…">' + esc(r.text) + "</textarea></div>";
    if (r.dest) {
      h += destHtml(r.dest, "rem", step.id) +
        '<div class="field"><span>Texto do botão</span><input type="text" maxlength="20" list="fxBtnPresets" data-field="rem-button" data-sid="' + esc(step.id) + '" value="' + esc(r.button) + '" /></div>';
    }
    h += '<p class="fx-opt-hint">O Instagram só permite lembrete para quem já tocou/respondeu algo (janela de 24h). Quem nunca interagiu não recebe.</p>';
  }
  return h + "</div>";
}

function stepHtml(step, i) {
  const n = i + 1;
  const isFirst = i === 0;
  const typeOpts = Object.keys(TYPES)
    .filter((t) => !(isFirst && (t === "message" || t === "follower")))
    .map((t) => '<option value="' + t + '"' + (t === step.type ? " selected" : "") + ">" + TYPES[t] + "</option>").join("");
  const sid = esc(step.id);

  let body = "";
  if (step.type !== "follower") {
    body +=
      '<div class="field"><span>' + (step.type === "link" ? "Mensagem antes do botão" : "Mensagem") + "</span>" +
      '<textarea data-field="text" data-sid="' + sid + '" maxlength="600" placeholder="' +
      (step.type === "choice" ? "Ex.: Você já segue nosso perfil?" : step.type === "input" ? "Ex.: Qual o seu melhor e-mail?" : step.type === "link" ? "Ex.: Aqui está o seu link 👇" : "Texto da mensagem") +
      '">' + esc(step.text) + "</textarea>" +
      '<div class="fx-counter">use {{nome_da_resposta}} para citar uma resposta anterior</div></div>';
  }

  if (step.type === "choice") {
    const hasUrl = (step.options || []).some((o) => o.kind === "url");
    const max = isFirst ? MAX_FIRST_OPTIONS : hasUrl ? MAX_TEMPLATE_BUTTONS : MAX_OPTIONS;
    body += (step.options || []).map((o, oi) => {
      const isUrlOpt = o.kind === "url";
      return (
        '<div class="fx-opt"><div class="fx-opt-row">' +
        '<div class="field"><span>Botão ' + (oi + 1) + '</span><input type="text" maxlength="20" list="fxBtnPresets" data-field="opt-label" data-sid="' + sid + '" data-opt="' + oi + '" value="' + esc(o.label) + '" placeholder="Até 20 caracteres" /></div>' +
        '<div class="field"><span>Tipo</span><select data-field="opt-kind" data-sid="' + sid + '" data-opt="' + oi + '"><option value="reply"' + (isUrlOpt ? "" : " selected") + '>Resposta</option><option value="url"' + (isUrlOpt ? " selected" : "") + ">Abre link</option></select></div>" +
        '<button type="button" class="btn btn-danger-ghost btn-sm" data-fx="del-opt" data-sid="' + sid + '" data-opt="' + oi + '" aria-label="Remover botão">✕</button></div>' +
        (isUrlOpt ? destHtml(o.dest, "opt", step.id, oi) : '<div class="field" style="margin-top:.5rem"><span>Depois vai para</span>' + nextSelect(step, o.next, "opt-next", oi) + "</div>") +
        "</div>"
      );
    }).join("");
    if ((step.options || []).length < max) body += '<button type="button" class="btn btn-outline btn-sm" data-fx="add-opt" data-sid="' + sid + '">+ Adicionar botão</button>';
    body += '<p class="fx-opt-hint">' + (isFirst ? "A 1ª mensagem aceita até 3 botões. " : hasUrl ? "Com botão de link, o limite é 3 botões. " : "") +
      "Botão que abre link não avisa o sistema quando é clicado — para continuar a conversa, use também um botão de Resposta (ex.: “Já segui ✅”).</p>";
    if (!isFirst) body += reminderHtml(step);
  } else if (step.type === "input") {
    body +=
      '<div class="fx-grid2"><div class="field"><span>Salvar resposta como</span><input type="text" maxlength="30" data-field="save_as" data-sid="' + sid + '" value="' + esc(step.save_as) + '" placeholder="ex: email" /></div>' +
      '<div class="field"><span>Validar como</span><select data-field="validate" data-sid="' + sid + '">' +
      [["none", "Qualquer texto"], ["email", "E-mail"], ["phone", "Telefone / WhatsApp"]].map((v) => '<option value="' + v[0] + '"' + (step.validate === v[0] ? " selected" : "") + ">" + v[1] + "</option>").join("") +
      "</select></div></div>" +
      '<div class="field"><span>Depois vai para</span>' + nextSelect(step, step.next, "next") + "</div>";
    if (!isFirst) body += reminderHtml(step);
  } else if (step.type === "message") {
    body += '<p class="fx-opt-hint">Envia sozinha logo depois da etapa anterior — use para mandar mais de uma mensagem em sequência.</p>' +
      '<div class="field" style="margin-top:.5rem"><span>Depois vai para</span>' + nextSelect(step, step.next, "next") + "</div>";
  } else if (step.type === "link") {
    body += destHtml(step.dest, "step", step.id) +
      '<div class="field"><span>Texto do botão</span><input type="text" maxlength="20" list="fxBtnPresets" data-field="button" data-sid="' + sid + '" value="' + esc(step.button) + '" /></div>' +
      '<p class="fx-opt-hint">Produto cadastrado envia um card com foto, nome e preço. Esta etapa encerra a conversa.</p>';
  } else if (step.type === "follower") {
    body += '<p class="fx-opt-hint">O sistema consulta se a pessoa segue o perfil e escolhe o caminho sozinho. Se o Instagram não liberar a verificação, ela cai em “Se não seguir”.</p>' +
      '<div class="fx-grid2"><div class="field"><span>Se seguir, vai para</span>' + nextSelect(step, step.next_yes, "next_yes") + "</div>" +
      '<div class="field"><span>Se não seguir, vai para</span>' + nextSelect(step, step.next_no, "next_no") + "</div></div>";
  }

  return (
    '<div class="fx-step" data-sid="' + sid + '">' +
    '<div class="fx-step-head"><span class="fx-num">' + n + "</span>" +
    (isFirst ? '<span class="fx-badge">INÍCIO</span>' : "") +
    '<select data-field="type" data-sid="' + sid + '">' + typeOpts + "</select>" +
    '<div class="fx-tools">' +
    '<button type="button" class="icon-btn" data-fx="up" data-sid="' + sid + '" title="Subir"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
    '<button type="button" class="icon-btn" data-fx="down" data-sid="' + sid + '" title="Descer"' + (i === draft.steps.length - 1 ? " disabled" : "") + ">↓</button>" +
    '<button type="button" class="icon-btn" data-fx="del-step" data-sid="' + sid + '" title="Excluir etapa">🗑️</button>' +
    "</div></div>" + body + "</div>"
  );
}

function renderEditor() {
  $("#fluxosRoot").innerHTML =
    '<div class="panel-heading-row"><h2>' + (draft.id ? "Editar fluxo" : "Novo fluxo") + "</h2>" +
    '<button type="button" class="btn btn-outline btn-sm" data-fx="back">← Voltar</button></div>' +
    '<div class="fx-note">A 1ª mensagem sai quando a pessoa comenta. Depois que ela toca num botão ou responde, o fluxo continua e você pode mandar várias mensagens seguidas. Se ela não responder, a conversa para (a não ser que haja lembrete).</div>' +
    '<datalist id="fxBtnPresets">' + BTN_PRESETS.map((p) => '<option value="' + esc(p) + '"></option>').join("") + "</datalist>" +
    '<div class="field"><span>Nome do fluxo</span><input type="text" id="fxNome" maxlength="60" value="' + esc(draft.nome) + '" placeholder="Ex.: Qualificação curso" /></div>' +
    draft.steps.map(stepHtml).join("") +
    '<div class="fx-add">' +
    Object.keys(TYPES).map((t) => '<button type="button" class="btn btn-outline btn-sm" data-fx="add-step" data-type="' + t + '">+ ' + TYPES[t] + "</button>").join("") +
    "</div>" +
    '<div id="fxError" class="banner"></div>' +
    '<div class="fx-footer"><button type="button" class="btn btn-primary" data-fx="save">Salvar fluxo</button>' +
    '<button type="button" class="btn btn-outline" data-fx="back">Cancelar</button></div>';
}

function findStep(sid) { return draft.steps.find((s) => s.id === sid); }

function onEditorInput(e) {
  const t = e.target;
  if (t.id === "fxNome") { draft.nome = t.value; return; }
  const sid = t.getAttribute("data-sid");
  if (!draft || !sid) return;
  const step = findStep(sid);
  if (!step) return;

  // campos do destino (produto/whatsapp/site/perfil)
  const df = t.getAttribute("data-dfield");
  if (df) {
    const d = getDestRef(t.getAttribute("data-scope"), sid, t.getAttribute("data-opt"));
    if (df === "tipo") {
      if (d.tipo === t.value) return;
      Object.keys(d).forEach((k) => delete d[k]);
      d.tipo = t.value;
      renderEditor();
    } else d[df] = t.value;
    return;
  }

  const field = t.getAttribute("data-field");
  if (!field) return;
  const oi = t.getAttribute("data-opt");

  if (field === "type") {
    if (t.value === step.type) return;
    const keepReminder = step.reminder;
    const fresh = newStep(t.value);
    fresh.id = step.id; fresh.text = step.text;
    if (keepReminder && (t.value === "choice" || t.value === "input")) fresh.reminder = keepReminder;
    Object.keys(step).forEach((k) => delete step[k]);
    Object.assign(step, fresh);
    renderEditor();
    return;
  }
  if (field === "opt-kind") {
    const o = step.options[Number(oi)];
    if (t.value === o.kind) return;
    o.kind = t.value;
    if (o.kind === "url") { o.dest = o.dest || { tipo: "perfil" }; delete o.next; } else { o.next = "__seq"; delete o.dest; }
    renderEditor();
    return;
  }
  if (field === "rem-on") {
    step.reminder = t.checked ? { minutes: 10, text: "", dest: null, button: "Acessar" } : null;
    renderEditor();
    return;
  }
  if (field === "rem-dest-on") {
    step.reminder.dest = t.value === "1" ? { tipo: "produto" } : null;
    renderEditor();
    return;
  }
  if (field === "rem-minutes") step.reminder.minutes = Number(t.value);
  else if (field === "rem-text") step.reminder.text = t.value;
  else if (field === "rem-button") step.reminder.button = t.value;
  else if (field === "opt-label") step.options[Number(oi)].label = t.value;
  else if (field === "opt-next") step.options[Number(oi)].next = t.value;
  else step[field] = t.value;
}

/* ---- salvar: valida, resolve destinos e "próxima etapa da lista" ---- */
function cleanDest(d) {
  const o = { tipo: d.tipo };
  if (d.tipo === "produto") Object.assign(o, { produto_id: d.produto_id || null, nome: d.nome || "", preco: d.preco || "", imagem: d.imagem || "", url: d.url || "" });
  else if (d.tipo === "whatsapp") {
    const dg = digits(d.numero);
    const full = dg.length <= 11 ? "55" + dg : dg;
    o.numero = d.numero || "";
    o.mensagem = d.mensagem || "";
    o.url = "https://wa.me/" + full + (d.mensagem ? "?text=" + encodeURIComponent(d.mensagem) : "");
  } else if (d.tipo === "site" || d.tipo === "outro") o.url = String(d.url || "").trim();
  return o;
}

function destError(d, where) {
  d = d || {};
  if (d.tipo === "produto" && !(d.produto_id || d.url)) return where + ": escolha o produto (ou troque o tipo de destino).";
  if (d.tipo === "whatsapp" && digits(d.numero).length < 10) return where + ": informe o número do WhatsApp com DDD.";
  if ((d.tipo === "site" || d.tipo === "outro") && !isUrl(d.url)) return where + ": o link precisa começar com http:// ou https://";
  return null;
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
    const out = { id: s.id, type: s.type, text: (s.text || "").trim() };
    if (s.type === "choice") {
      out.options = s.options.map((o) => o.kind === "url"
        ? { label: o.label.trim(), kind: "url", dest: cleanDest(o.dest || defaultDest()) }
        : { label: o.label.trim(), kind: "reply", next: resolveNext(o.next, idx) });
      out.save_as = (s.save_as || "").trim() || s.id;
    } else if (s.type === "input") {
      out.save_as = (s.save_as || "").trim().replace(/[^\w-]/g, "_") || s.id;
      out.validate = s.validate || "none";
      out.next = resolveNext(s.next, idx);
    } else if (s.type === "message") {
      out.next = resolveNext(s.next, idx);
    } else if (s.type === "link") {
      out.dest = cleanDest(s.dest || defaultDest());
      out.button = (s.button || "").trim();
    } else if (s.type === "follower") {
      out.save_as = (s.save_as || "").trim() || "segue";
      out.next_yes = resolveNext(s.next_yes, idx);
      out.next_no = resolveNext(s.next_no, idx);
    }
    if ((s.type === "choice" || s.type === "input") && s.reminder && s.reminder.text.trim()) {
      out.reminder = { minutes: Number(s.reminder.minutes) || 10, text: s.reminder.text.trim() };
      if (s.reminder.dest) { out.reminder.dest = cleanDest(s.reminder.dest); out.reminder.button = (s.reminder.button || "Acessar").trim(); }
    }
    return out;
  });
  return { version: 2, start: steps[0].id, steps };
}

function validateDraft() {
  if (!draft.nome.trim()) return "Dê um nome ao fluxo.";
  if (!draft.steps.length) return "Adicione pelo menos uma etapa.";
  const first = draft.steps[0];
  if (first.type === "message" || first.type === "follower") return "A 1ª etapa precisa ser uma pergunta ou um link (a 1ª mensagem do Instagram não pode ser seguida de outra sem resposta).";
  for (let i = 0; i < draft.steps.length; i++) {
    const s = draft.steps[i];
    const n = "Etapa " + (i + 1);
    if (s.type !== "follower" && !(s.text || "").trim()) return n + ": escreva a mensagem.";
    if (s.type === "choice") {
      const hasUrl = s.options.some((o) => o.kind === "url");
      const max = i === 0 ? MAX_FIRST_OPTIONS : hasUrl ? MAX_TEMPLATE_BUTTONS : MAX_OPTIONS;
      if (!s.options.length) return n + ": adicione pelo menos um botão.";
      if (s.options.length > max) return n + ": no máximo " + max + " botões" + (hasUrl ? " (há botão de link)." : ".");
      const labels = s.options.map((o) => o.label.trim().toLowerCase());
      if (labels.some((l) => !l)) return n + ": todos os botões precisam de texto.";
      if (new Set(labels).size !== labels.length) return n + ": há botões com o mesmo texto.";
      if (!s.options.some((o) => o.kind !== "url")) return n + ": inclua pelo menos um botão de Resposta para a conversa continuar.";
      for (const o of s.options) if (o.kind === "url") { const e = destError(o.dest, n + ' (botão "' + o.label + '")'); if (e) return e; }
    }
    if (s.type === "link") {
      if (!(s.button || "").trim()) return n + ": informe o texto do botão.";
      const e = destError(s.dest, n); if (e) return e;
    }
    if ((s.type === "choice" || s.type === "input") && s.reminder) {
      if (!s.reminder.text.trim()) return n + ": escreva o texto do lembrete (ou desmarque o lembrete).";
      if (s.reminder.dest) { const e = destError(s.reminder.dest, n + " (lembrete)"); if (e) return e; }
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
    const res = draft.id ? await sb.from("fluxos").update(row).eq("id", draft.id) : await sb.from("fluxos").insert(row);
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
  if (error) { $("#fluxosRoot").innerHTML = '<div class="empty-state">Erro: ' + esc(error.message) + "</div>"; return; }
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
  if (!$("#fluxosRoot")) return;
  if (view === "edit" && draft) renderEditor();
  else if (view === "templates") renderTemplates();
  else if (view === "results") renderResults();
  else renderList();
}

function onClick(e) {
  const b = e.target.closest("[data-fx]");
  if (!b) return;
  const act = b.getAttribute("data-fx");
  const sid = b.getAttribute("data-sid");
  const id = b.getAttribute("data-id");

  if (act === "new") { view = "templates"; return render(); }
  if (act === "tpl") return openEditor(null, templateSteps(b.getAttribute("data-tpl")));
  if (act === "edit") return openEditor(flows.find((f) => f.id === id));
  if (act === "results") return openResults(id);
  if (act === "delete") return deleteFlow(id);
  if (act === "csv") return exportCsv();
  if (act === "back") { view = "list"; draft = null; return render(); }
  if (act === "save") return saveDraft(b);

  if (!draft) return;
  if (act === "pick-produto") {
    if (typeof window.openProdutoPicker !== "function") return showFxError("O seletor de produtos não está disponível. Recarregue a página.");
    const scope = b.getAttribute("data-scope");
    const oi = b.getAttribute("data-opt");
    window.openProdutoPicker((p) => {
      const d = getDestRef(scope, sid, oi);
      Object.keys(d).forEach((k) => delete d[k]);
      Object.assign(d, { tipo: "produto", produto_id: p.id, nome: p.nome || "", preco: p.preco || "", imagem: p.link_imagem || "", url: p.link_afiliado || "" });
      renderEditor();
    });
    return;
  }
  if (act === "add-step") {
    if (draft.steps.length >= MAX_STEPS) return showFxError("Máximo de " + MAX_STEPS + " etapas por fluxo.");
    draft.steps.push(newStep(b.getAttribute("data-type")));
    return renderEditor();
  }
  const i = draft.steps.findIndex((s) => s.id === sid);
  if (act === "del-step") {
    if (draft.steps.length === 1) return showFxError("O fluxo precisa de pelo menos uma etapa.");
    draft.steps.splice(i, 1);
    draft.steps.forEach((s) => {
      ["next", "next_yes", "next_no"].forEach((k) => { if (s[k] === sid) s[k] = ""; });
      (s.options || []).forEach((o) => { if (o.next === sid) o.next = ""; });
    });
    return renderEditor();
  }
  if (act === "up" && i > 0) { [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]]; return renderEditor(); }
  if (act === "down" && i < draft.steps.length - 1) { [draft.steps[i + 1], draft.steps[i]] = [draft.steps[i], draft.steps[i + 1]]; return renderEditor(); }
  if (act === "add-opt") {
    const s = findStep(sid);
    const hasUrl = s.options.some((o) => o.kind === "url");
    const max = i === 0 ? MAX_FIRST_OPTIONS : hasUrl ? MAX_TEMPLATE_BUTTONS : MAX_OPTIONS;
    if (s.options.length < max) s.options.push(R("", "__seq"));
    return renderEditor();
  }
  if (act === "del-opt") {
    findStep(sid).options.splice(Number(b.getAttribute("data-opt")), 1);
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
  document.addEventListener("click", (e) => {
    const t = e.target.closest('.subtab-btn[data-subtab="fluxos"]');
    if (t && loaded) { view = "list"; fetchFlows().then(render).catch(() => {}); }
  });
  const grid = $("#automationsTableBody");
  if (grid) new MutationObserver(labelChips).observe(grid, { childList: true });
});
