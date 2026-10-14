// admin-parceiros.js
// Aba Admin > "Parceiros": convidar parceiro, ver parceiros, notificações de
// indicações (usuário X cadastrado via parceiro Y) e acerto de comissões.
// Módulo isolado (como teste-gratis.js): toda a UI é injetada aqui; só precisa
// da tag <script type="module" src="admin-parceiros.js"></script> no index.html.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// Só LÊ a sessão que o app.js estabeleceu (mesmo padrão dos outros módulos).
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
const fmtDate = (v) => (v ? new Date(String(v).length === 10 ? v + "T00:00:00" : v).toLocaleDateString("pt-BR") : "—");
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const fmtMonth = (v) => { const [y, m] = String(v).slice(0, 7).split("-"); return m + "/" + y; };

let ready = false;
let channel = null;
let partners = [];
let nomes = {}; // e-mail (minúsculo) -> nome
const lbl = (email) => {
  const n = nomes[String(email || "").toLowerCase()];
  return (n ? "<strong>" + esc(n) + "</strong><br>" : "") + esc(email);
};

function msg(text, type) {
  const el = $("apMsg");
  if (!el) return;
  el.textContent = text;
  el.className = "banner " + type;
  clearTimeout(msg._t);
  msg._t = setTimeout(() => (el.className = "banner"), 7000);
}

async function errMsg(error) {
  let m = error.message;
  try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (_) {}
  return m;
}

/* ------------------------------ UI ------------------------------ */
function setup() {
  if (ready) return;
  const tab = $("tab-admin");
  const nav = tab && tab.querySelector(".seg-nav");
  const after = $("seg-invites");
  if (!nav || !after) return;
  ready = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "seg-btn";
  btn.dataset.seg = "seg-partners";
  btn.innerHTML = 'Parceiros <span id="apBadge" class="badge badge-danger hidden"></span>';
  nav.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "seg-partners";
  panel.className = "seg-panel hidden";
  panel.innerHTML =
    '<section class="panel">' +
    '<div class="panel-heading-row"><h2>🤝 Convidar parceiro</h2></div>' +
    '<div class="produto-picker-row mb-sm">' +
    '<div class="field flush"><span>Nome (opcional)</span><input type="text" id="apInviteNome" maxlength="80" placeholder="Nome do parceiro" /></div>' +
    '<div class="field flush"><span>E-mail do parceiro</span><input type="email" id="apInviteEmail" placeholder="parceiro@email.com" /></div>' +
    '<button type="button" id="apInviteBtn" class="btn btn-primary">Enviar convite de parceiro</button></div>' +
    '<p class="field-hint">O parceiro cria a senha pelo link e entra só em <strong>parceiro.html</strong> — sem acesso ao painel de automação.</p>' +
    '<div id="apMsg" class="banner"></div></section>' +

    '<section class="panel panel-plain"><div class="panel-heading-row"><h2>Indicações recentes</h2>' +
    '<div><button type="button" id="apSeenAll" class="btn btn-outline btn-sm">Marcar tudo como visto</button> ' +
    '<button type="button" id="apRefresh" class="btn btn-outline btn-sm">Atualizar</button></div></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Cliente indicado</th><th>Parceiro</th><th>Situação</th><th>Pagamento</th><th>Quando</th><th></th></tr></thead>' +
    '<tbody id="apRefBody"></tbody></table></div></section>' +

    '<section class="panel panel-plain"><div class="panel-heading-row"><h2>Parceiros</h2></div>' +
    '<div class="table-scroll"><table><thead><tr><th>E-mail</th><th>Status</th><th>Convidados</th><th>Cadastrados</th><th>Ativos</th><th>Ações</th></tr></thead>' +
    '<tbody id="apPartnersBody"></tbody></table></div>' +
    '<div id="apComm" class="hidden" style="margin-top:1.2rem"></div></section>';
  after.insertAdjacentElement("afterend", panel);

  $("apInviteBtn").addEventListener("click", invitePartner);
  $("apInviteEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") invitePartner(); });
  $("apRefresh").addEventListener("click", loadAll);
  $("apSeenAll").addEventListener("click", markAllSeen);
  panel.addEventListener("click", onPanelClick);
}

async function invitePartner() {
  const input = $("apInviteEmail");
  const btn = $("apInviteBtn");
  const email = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("Informe um e-mail válido.", "error");
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("admin-invite-partner", { body: { email } });
    if (error) throw new Error(await errMsg(error));
    if (data && data.error) throw new Error(data.error);
    const nomeInput = $("apInviteNome");
    const nomeConvidado = nomeInput ? nomeInput.value.trim() : "";
    if (nomeConvidado && window.NomeUsuario) await window.NomeUsuario.setByEmail(email, nomeConvidado);
    if (nomeInput) nomeInput.value = "";
    msg("Convite de parceiro enviado para " + (nomeConvidado ? nomeConvidado + " (" + email + ")" : email) + ".", "success");
    input.value = "";
    await loadAll();
  } catch (e) {
    msg(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------ dados ------------------------------ */
async function loadAll() {
  $("apRefBody").innerHTML = '<tr><td colspan="6" class="loading-row">Carregando…</td></tr>';
  $("apPartnersBody").innerHTML = '<tr><td colspan="6" class="loading-row">Carregando…</td></tr>';
  const [refs, pts] = await Promise.all([sb.rpc("admin_list_referrals"), sb.rpc("admin_list_partners")]);
  if (refs.error || pts.error) {
    const m = (refs.error || pts.error).message;
    $("apRefBody").innerHTML = '<tr><td colspan="6" class="empty-state">Erro: ' + esc(m) + " (o parceiros.sql já foi rodado?)</td></tr>";
    $("apPartnersBody").innerHTML = "";
    return;
  }
  partners = pts.data || [];
  const emails = [].concat(
    (refs.data || []).map((r) => r.referred_email),
    (refs.data || []).map((r) => r.partner_email),
    partners.map((p) => p.email)
  );
  nomes = window.NomeUsuario ? await window.NomeUsuario.mapByEmail(emails) : {};
  renderRefs(refs.data || []);
  renderPartners();
}

function renderRefs(rows) {
  const unseen = rows.filter((r) => r.accepted_at && !r.admin_seen_at);
  const badge = $("apBadge");
  badge.textContent = unseen.length;
  badge.classList.toggle("hidden", !unseen.length);
  $("apSeenAll").disabled = !unseen.length;
  $("apRefBody").dataset.unseen = JSON.stringify(unseen.map((r) => r.id));

  if (!rows.length) {
    $("apRefBody").innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma indicação ainda.</td></tr>';
    return;
  }
  $("apRefBody").innerHTML = rows.map((r) => {
    const isNew = r.accepted_at && !r.admin_seen_at;
    const sit = r.accepted_at
      ? '<span class="badge badge-ativo">Cadastrado</span>'
      : '<span class="badge badge-muted">Convite pendente</span>';
    const pay = r.payment_status === "em_dia" ? '<span class="badge badge-ativo">Em dia</span>'
      : r.payment_status === "atrasado" ? '<span class="badge badge-danger">Atrasado</span>'
      : '<span class="badge badge-muted">—</span>';
    return "<tr" + (isNew ? ' style="background:var(--warning-bg)"' : "") + ">" +
      "<td>" + lbl(r.referred_email) + (r.invite_type === "teste" ? ' <span class="badge badge-founder">Teste 7 dias</span>' : ' <span class="badge badge-muted">Pagante</span>') + (isNew ? ' <span class="badge badge-danger">novo</span>' : "") + "</td>" +
      "<td>via " + esc(nomes[String(r.partner_email || "").toLowerCase()] || r.partner_email) + "</td>" +
      "<td>" + sit + "</td><td>" + pay + "</td>" +
      "<td>" + fmtDateTime(r.accepted_at || r.invited_at) + "</td>" +
      "<td>" + (isNew ? '<button type="button" class="btn btn-outline btn-sm" data-ap-seen="' + esc(r.id) + '">Marcar visto</button>' : "") + "</td></tr>";
  }).join("");
}

function renderPartners() {
  if (!partners.length) {
    $("apPartnersBody").innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum parceiro ainda.</td></tr>';
    return;
  }
  $("apPartnersBody").innerHTML = partners.map((p) =>
    "<tr><td>" + lbl(p.email) + "</td>" +
    "<td>" + (p.is_active ? '<span class="badge badge-ativo">Ativo</span>' : '<span class="badge badge-inativo">Pausado</span>') + "</td>" +
    "<td>" + p.convidados + "</td><td>" + p.cadastrados + "</td><td>" + p.ativos + "</td>" +
    '<td><button type="button" class="btn btn-outline btn-sm" data-ap-comm="' + esc(p.id) + '">Comissões</button> ' +
    '<button type="button" class="btn btn-outline btn-sm" data-ap-toggle="' + esc(p.id) + '" data-active="' + p.is_active + '">' + (p.is_active ? "Pausar" : "Ativar") + "</button></td></tr>"
  ).join("");
}

async function markSeen(ids) {
  if (!ids.length) return;
  const { error } = await sb.rpc("admin_mark_referrals_seen", { p_ids: ids });
  if (error) return msg("Erro: " + error.message, "error");
  await loadAll();
}
function markAllSeen() {
  try { markSeen(JSON.parse($("apRefBody").dataset.unseen || "[]")); } catch (_) {}
}

async function showCommissions(partnerId) {
  const host = $("apComm");
  const p = partners.find((x) => x.id === partnerId);
  host.classList.remove("hidden");
  host.innerHTML = '<div class="loading-row">Carregando comissões…</div>';
  const { data, error } = await sb.rpc("admin_partner_commissions", { p_partner: partnerId });
  if (error) { host.innerHTML = '<div class="empty-state">Erro: ' + esc(error.message) + "</div>"; return; }
  if (!data.length) { host.innerHTML = '<div class="empty-state">' + esc(p ? p.email : "") + " ainda não tem comissões.</div>"; return; }
  const pend = data.filter((x) => !x.pago).reduce((a, x) => a + Number(x.valor), 0);
  host.innerHTML =
    '<div class="panel-heading-row"><h2>Comissões — ' + esc(p ? p.email : "") + '</h2><span class="badge badge-muted">A pagar: ' + brl(pend) + "</span></div>" +
    '<div class="table-scroll"><table><thead><tr><th>Mês</th><th>Cliente</th><th>Nível</th><th>1ª mensalidade</th><th>Parcela</th><th>Valor</th><th>Acerto</th><th></th></tr></thead><tbody>' +
    data.map((x) =>
      "<tr><td>" + fmtMonth(x.mes) + "</td><td>" + esc(x.email) + "</td>" +
      "<td>" + x.nivel + " · " + Math.round(x.percentual * 100) + "%</td><td>" + brl(x.base) + "</td>" +
      "<td>" + x.parcela + "/2</td><td>" + brl(x.valor) + "</td><td>" + fmtDate(x.vencimento) + "</td>" +
      '<td><button type="button" class="btn ' + (x.pago ? "btn-outline" : "btn-primary") + ' btn-sm" data-ap-pay="' + esc(x.referral_id) + '" data-parcela="' + x.parcela + '" data-paid="' + x.pago + '" data-partner="' + esc(partnerId) + '">' +
      (x.pago ? "Pago ✓ (desfazer)" : "Marcar pago") + "</button></td></tr>"
    ).join("") + "</tbody></table></div>";
}

async function onPanelClick(e) {
  const seen = e.target.closest("[data-ap-seen]");
  if (seen) return markSeen([seen.dataset.apSeen]);

  const comm = e.target.closest("[data-ap-comm]");
  if (comm) return showCommissions(comm.dataset.apComm);

  const pay = e.target.closest("[data-ap-pay]");
  if (pay) {
    pay.disabled = true;
    const { error } = await sb.rpc("admin_set_commission_paid", {
      p_referral: pay.dataset.apPay,
      p_parcela: Number(pay.dataset.parcela),
      p_paid: pay.dataset.paid !== "true",
    });
    if (error) { msg("Erro: " + error.message, "error"); pay.disabled = false; return; }
    return showCommissions(pay.dataset.partner);
  }

  const tg = e.target.closest("[data-ap-toggle]");
  if (tg) {
    tg.disabled = true;
    const { error } = await sb.from("profiles").update({ is_active: tg.dataset.active !== "true" }).eq("id", tg.dataset.apToggle);
    if (error) { msg("Erro: " + error.message, "error"); tg.disabled = false; return; }
    await loadAll();
  }
}

/* ------------------------------ bootstrap ------------------------------ */
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data: p } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
  if (!p || !p.is_admin) return;
  setup();
  await loadAll();
  if (!channel) {
    // Notificação ao vivo: qualquer mudança nas indicações recarrega a lista.
    channel = sb.channel("admin_partner_referrals")
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_referrals" }, () => loadAll())
      .subscribe();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT" && channel) { sb.removeChannel(channel); channel = null; }
    if (s && !ready) setTimeout(init, 0);
  });
});
