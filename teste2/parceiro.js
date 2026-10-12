// parceiro.js — Área do Parceiro (página separada: parceiro.html)
// Este módulo é o dono do token de convite/recuperação desta página
// (detectSessionInUrl: true). Não importa nada de app.js.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// Lido ANTES de criar o client (ele limpa o hash ao processar o token).
const isInviteLink = /type=(invite|recovery)/.test(window.location.hash || "");

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
const fmtDate = (v) => {
  if (!v) return "—";
  const s = String(v);
  return new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR");
};
const fmtMonth = (v) => {
  const [y, m] = String(v).slice(0, 7).split("-");
  return m + "/" + y;
};

const timers = {};
function banner(id, msg, type) {
  const el = $("#" + id);
  if (!el) return;
  el.textContent = msg;
  el.className = "banner " + type;
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => (el.className = "banner"), 6000);
}

function show(name) {
  ["Loading", "Auth", "SetPassword", "Denied", "App"].forEach((n) =>
    $("#pc" + n).classList.toggle("hidden", n !== name)
  );
}

function denied(title, text, showPanelLink) {
  $("#pcDeniedTitle").textContent = title;
  $("#pcDeniedText").textContent = text;
  $("#pcDeniedLink").classList.toggle("hidden", !showPanelLink);
  show("Denied");
}

/* ------------------------------ sessão ------------------------------ */
async function bootstrap() {
  if (isInviteLink) {
    // O client precisa de um instante para trocar o token do link por sessão.
    await new Promise((r) => setTimeout(r, 400));
    show("SetPassword");
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show("Auth");

  const { data: profile, error } = await sb
    .from("profiles")
    .select("is_partner, is_active, is_admin")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error || !profile) {
    banner("pcAuthBanner", "Erro ao carregar seu perfil. Tente novamente.", "error");
    return show("Auth");
  }
  if (!profile.is_partner) {
    return denied(
      "Esta área é só para parceiros",
      profile.is_admin ? "Você está logado como administrador." : "Sua conta não é de parceiro.",
      true
    );
  }
  if (!profile.is_active) {
    return denied("Sua conta está pausada", "Fale com o suporte para reativar seu acesso de parceiro.", false);
  }
  $("#pcUserEmail").textContent = session.user.email;
  show("App");
  await loadAll();
}

$("#pcLoginBtn").addEventListener("click", async () => {
  const email = $("#pcEmail").value.trim();
  const password = $("#pcPassword").value;
  if (!email || !password) return banner("pcAuthBanner", "Preencha e-mail e senha.", "error");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return banner("pcAuthBanner", error.message, "error");
  await bootstrap();
});
$("#pcPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pcLoginBtn").click(); });

$("#pcSetPasswordBtn").addEventListener("click", async () => {
  const pw = $("#pcNewPassword").value;
  if (!pw || pw.length < 6) return banner("pcSetBanner", "A senha precisa ter pelo menos 6 caracteres.", "error");
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) return banner("pcSetBanner", error.message, "error");
  history.replaceState(null, "", window.location.pathname);
  location.reload();
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-pc-logout]")) sb.auth.signOut().then(() => location.reload());
  const th = e.target.closest("[data-theme-toggle]");
  if (th) {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ap-theme", next); } catch (_) {}
  }
  const tab = e.target.closest("[data-pc-tab]");
  if (tab) {
    const id = tab.dataset.pcTab;
    document.querySelectorAll(".pc-tab").forEach((b) => b.classList.toggle("active", b === tab));
    document.querySelectorAll(".pc-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "pcTab-" + id));
  }
});

/* ------------------------------ dados ------------------------------ */
let referrals = [];
let commissions = [];
let level = { qtd_mes: 0, nivel: 1, percentual: 0.5 };

async function loadAll() {
  $("#pcReferralsBody").innerHTML = '<tr><td colspan="7" class="loading-row">Carregando…</td></tr>';
  const [r, c, l] = await Promise.all([
    sb.rpc("partner_my_referrals"),
    sb.rpc("partner_my_commissions"),
    sb.rpc("partner_my_level"),
  ]);
  const err = r.error || c.error || l.error;
  if (err) {
    banner("pcBanner", "Erro ao carregar dados: " + err.message, "error");
    $("#pcReferralsBody").innerHTML = '<tr><td colspan="7" class="empty-state">Não foi possível carregar.</td></tr>';
    return;
  }
  referrals = r.data || [];
  commissions = c.data || [];
  if (l.data && l.data[0]) level = l.data[0];
  renderKpis();
  renderReferrals();
  renderCommissions();
}

function renderKpis() {
  const pendente = commissions.filter((x) => !x.pago).reduce((a, x) => a + Number(x.valor), 0);
  const pago = commissions.filter((x) => x.pago).reduce((a, x) => a + Number(x.valor), 0);
  const late = referrals.filter((x) => x.payment_status === "atrasado").length;
  const k = (cls, v, l) => '<div class="pc-kpi ' + cls + '"><b>' + v + "</b><span>" + l + "</span></div>";
  $("#pcKpis").innerHTML =
    k("", referrals.length, "Indicados em acompanhamento") +
    k("", level.qtd_mes, "Clientes ativos gerados neste mês") +
    k("accent", "Nível " + level.nivel + " · " + Math.round(level.percentual * 100) + "%", "Seu nível agora") +
    k("", late, "Pagamentos em atraso") +
    k("accent", brl(pendente), "Comissões a receber") +
    k("", brl(pago), "Comissões já acertadas");
}

function payBadge(s) {
  if (s === "em_dia") return '<span class="badge badge-ativo">Em dia</span>';
  if (s === "atrasado") return '<span class="badge badge-danger">Em atraso</span>';
  if (s === "cancelado") return '<span class="badge badge-muted">Cancelado</span>';
  return '<span class="badge badge-muted">Aguardando 1º pagamento</span>';
}

function renderReferrals() {
  const body = $("#pcReferralsBody");
  if (!referrals.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum indicado em acompanhamento. Envie seu primeiro convite na aba "Convidar cliente".</td></tr>';
    return;
  }
  body.innerHTML = referrals.map((x) => {
    const left = x.manage_until ? Math.max(0, Math.ceil((new Date(x.manage_until) - Date.now()) / 864e5)) : null;
    return "<tr>" +
      "<td>" + esc(x.email) + "</td>" +
      "<td>" + (x.accepted_at ? '<span class="badge badge-ativo">Cadastrado</span>' : '<span class="badge badge-muted">Convite enviado</span>') + "</td>" +
      "<td>" + payBadge(x.payment_status) + "</td>" +
      "<td>" + fmtDate(x.payment_due_date) + "</td>" +
      "<td>" + (x.monthly_plan_value ? brl(x.monthly_plan_value) : "—") + "</td>" +
      "<td>" + (x.manage_until ? fmtDate(x.manage_until) + '<span class="pc-sub">' + left + " dia(s) restantes</span>" : '<span class="pc-sub">começa no 1º pagamento</span>') + "</td>" +
      '<td><a class="btn btn-outline btn-sm" href="mailto:' + esc(x.email) + '">Contatar</a></td>' +
      "</tr>";
  }).join("");
}

function renderCommissions() {
  const host = $("#pcCommissions");
  if (!commissions.length) {
    host.innerHTML = '<div class="empty-state">Suas comissões aparecem aqui quando um indicado fizer o primeiro pagamento.</div>';
    return;
  }
  const byMonth = {};
  commissions.forEach((x) => { (byMonth[x.mes] = byMonth[x.mes] || []).push(x); });
  host.innerHTML = Object.keys(byMonth).sort().reverse().map((mes) => {
    const rows = byMonth[mes];
    const f = rows[0];
    return '<div class="pc-month"><h3>' + fmtMonth(mes) +
      '<span class="badge badge-founder">Nível ' + f.nivel + " · " + Math.round(f.percentual * 100) + "%</span>" +
      '<span class="pc-sub">' + f.qtd_mes + " cliente(s) ativo(s) no mês</span></h3>" +
      '<div class="table-scroll"><table class="pc-small"><thead><tr><th>Cliente</th><th>1ª mensalidade</th><th>Comissão total</th><th>Parcela</th><th>Valor</th><th>Acerto</th><th>Situação</th></tr></thead><tbody>' +
      rows.map((x) =>
        "<tr><td>" + esc(x.email) + "</td><td>" + brl(x.base) + "</td><td>" + brl(x.total) + "</td>" +
        "<td>" + x.parcela + "/2</td><td>" + brl(x.valor) + "</td><td>" + fmtDate(x.vencimento) + "</td>" +
        "<td>" + (x.pago ? '<span class="badge badge-ativo">Pago</span>' : '<span class="badge badge-muted">Pendente</span>') + "</td></tr>"
      ).join("") + "</tbody></table></div></div>";
  }).join("");
}

/* ------------------------------ convites ------------------------------ */
async function invite() {
  const input = $("#pcInviteEmail");
  const btn = $("#pcInviteBtn");
  const email = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return banner("pcBanner", "Informe um e-mail válido.", "error");
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("partner-invite-user", { body: { email } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    banner("pcBanner", "Convite enviado para " + email + ".", "success");
    input.value = "";
    await loadAll();
  } catch (e) {
    banner("pcBanner", "Não foi possível enviar: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}
$("#pcInviteBtn").addEventListener("click", invite);
$("#pcInviteEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") invite(); });
$("#pcRefresh").addEventListener("click", loadAll);

bootstrap();
