// parceiro.js — Área do Parceiro (página separada: parceiros/index.html)
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
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* ------------------------------ ícones SVG (traço 24×24, cor = currentColor) ------------------------------ */
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1V17h5v-1c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  "credit-card": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  "alert-triangle": '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  "user-check": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  "trending-up": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.87 17 22l-5-3-5 3 1.52-9.13"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  "message-circle": '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  "medal-bronze": '<circle cx="12" cy="8" r="6" stroke="#CD7F32"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" stroke="#CD7F32"/>',
  "medal-silver": '<circle cx="12" cy="8" r="6" stroke="#8A96A3"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" stroke="#8A96A3"/>',
  "medal-gold": '<circle cx="12" cy="8" r="6" stroke="#C48A00"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" stroke="#C48A00"/>',
};

// Monta o <svg> pelo nome. A classe "pc-ico" faz o ícone acompanhar o tamanho do texto.
function icon(name, cls = "pc-ico") {
  return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || "") + "</svg>";
}
// Ícones estáticos do HTML: <span data-icon="home"></span> vira o SVG correspondente
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

// Logo oficial do WhatsApp em SVG (usa a cor do texto, então fica branco no botão)
const WA_ICON =
  '<svg class="pc-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

// Mensagens prontas de acompanhamento por indicado (abrem direto no WhatsApp)
const FOLLOW_UPS = {
  convite: "Oi! Te enviei um convite por e-mail para criar sua senha e começar a usar o Achei & Postei. Se não encontrar, dá uma olhada no spam.",
  ativar: "Oi! Já deu pra ver os comentários virando Direct automático? Se quiser, te ajudo a configurar o primeiro post agora.",
  vencendo: "Oi! Sua mensalidade do Achei & Postei vence em breve. Se tiver qualquer dúvida sobre o pagamento, me avisa.",
  atraso: "Oi! Passando pra lembrar que a mensalidade do Achei & Postei está pendente. Se precisar de ajuda com o pagamento, me avisa.",
};

// Filtros da aba "Meus indicados"
const REF_FILTERS = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "acao", label: "Pedem ação", test: (x) => followUpKey(x) !== null },
  { key: "atrasado", label: "Em atraso", test: (x) => x.payment_status === "atrasado" },
  { key: "em_dia", label: "Em dia", test: (x) => x.payment_status === "em_dia" },
];

// Dias até o vencimento (negativo = já venceu; null = sem data)
function daysUntilDue(x) {
  if (!x.payment_due_date) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const due = new Date(String(x.payment_due_date).slice(0, 10) + "T00:00:00");
  return Math.round((due - hoje) / 864e5);
}

// Pagante em dia cujo vencimento cai nos próximos 3 dias
function isDueSoon(x) {
  const d = daysUntilDue(x);
  return x.payment_status === "em_dia" && d !== null && d >= 0 && d <= 3;
}

// Qual mensagem de WhatsApp faz sentido para o indicado (null = nenhuma)
function followUpKey(x) {
  if (x.payment_status === "cancelado") return null;
  if (!x.accepted_at) return "convite";
  if (x.payment_status === "atrasado") return "atraso";
  if (x.payment_status === "em_dia") return isDueSoon(x) ? "vencendo" : null;
  return "ativar";
}

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

/* ------------------------------ regras de nível ------------------------------ */
// 1–10 clientes no mês = 50% · 11–20 = 60% · 21+ = 70%
const LEVELS = [
  { n: 1, min: 1, pct: 0.5, name: "Bronze", medal: "medal-bronze" },
  { n: 2, min: 11, pct: 0.6, name: "Prata", medal: "medal-silver" },
  { n: 3, min: 21, pct: 0.7, name: "Ouro", medal: "medal-gold" },
];
const pctFor = (n) => (n >= 21 ? 0.7 : n >= 11 ? 0.6 : 0.5);

/* ------------------------------ estado ------------------------------ */
let userEmail = "";
let referrals = [];
let commissions = [];
let level = { qtd_mes: 0, nivel: 1, percentual: 0.5 };
let refFilter = "todos"; // filtro ativo na aba "Meus indicados"

const localMonthKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

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
  userEmail = session.user.email || "";
  $("#pcUserEmail").textContent = userEmail;
  show("App");
  renderTemplates();
  renderObjections();
  renderSim();
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

/* ------------------------------ navegação ------------------------------ */
function goTab(id) {
  document.querySelectorAll(".pc-tab").forEach((b) => b.classList.toggle("active", b.dataset.pcTab === id));
  document.querySelectorAll(".pc-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "pcTab-" + id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_e) { /* sem suporte */ }
    ta.remove();
    return ok;
  }
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-pc-logout]")) return sb.auth.signOut().then(() => location.reload());

  if (e.target.closest("[data-theme-toggle]")) {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ap-theme", next); } catch (_) { /* storage indisponível */ }
    return;
  }

  const tab = e.target.closest("[data-pc-tab]");
  if (tab) return goTab(tab.dataset.pcTab);

  const go = e.target.closest("[data-pc-goto]");
  if (go) { e.preventDefault(); return goTab(go.dataset.pcGoto); }

  const copy = e.target.closest("[data-pc-copy]");
  if (copy) {
    const ta = document.getElementById("pcTpl-" + copy.dataset.pcCopy);
    if (!ta) return;
    const ok = await copyText(ta.value);
    banner("pcBanner", ok ? "Mensagem copiada! Agora é só colar na conversa." : "Não consegui copiar. Selecione o texto e copie manualmente.", ok ? "success" : "error");
    return;
  }

  const fu = e.target.closest("[data-pc-fu]");
  if (fu) return window.open("https://wa.me/?text=" + encodeURIComponent(FOLLOW_UPS[fu.dataset.pcFu] || ""), "_blank", "noopener");

  const filt = e.target.closest("[data-pc-filter]");
  if (filt) { refFilter = filt.dataset.pcFilter; return renderReferrals(); }

  const wa = e.target.closest("[data-pc-wa]");
  if (wa) {
    const ta = document.getElementById("pcTpl-" + wa.dataset.pcWa);
    if (!ta) return;
    window.open("https://wa.me/?text=" + encodeURIComponent(ta.value), "_blank", "noopener");
  }
});

/* ------------------------------ dados ------------------------------ */
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
  renderHome();
  renderReferrals();
  renderChart();
  renderCommissions();
}

/* ------------------------------ INÍCIO ------------------------------ */
function monthTotals() {
  const key = localMonthKey();
  // A comissão total do cliente se repete nas 2 parcelas; contamos só a parcela 1.
  const first = commissions.filter((x) => Number(x.parcela) === 1);
  const thisMonth = first.filter((x) => String(x.mes).slice(0, 7) === key);
  return {
    key,
    thisMonthTotal: thisMonth.reduce((a, x) => a + Number(x.total), 0),
    thisMonthBases: thisMonth.map((x) => Number(x.base)).filter((b) => b > 0),
  };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function firstName() {
  const local = (userEmail.split("@")[0] || "parceiro").split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "parceiro";
}

function renderHome() {
  const pendente = commissions.filter((x) => !x.pago).reduce((a, x) => a + Number(x.valor), 0);
  const pago = commissions.filter((x) => x.pago).reduce((a, x) => a + Number(x.valor), 0);
  const late = referrals.filter((x) => x.payment_status === "atrasado").length;
  const { thisMonthTotal } = monthTotals();
  const lvl = LEVELS[Math.max(0, Math.min(2, (Number(level.nivel) || 1) - 1))];

  let mensagem;
  if (!referrals.length && !commissions.length) mensagem = "Seu primeiro convite é o passo que destrava tudo. Vamos começar?";
  else if (Number(level.qtd_mes) === 0) mensagem = "Mês novo, chance nova: cada cliente que começa a pagar aumenta o seu ganho.";
  else mensagem = "Você tem " + level.qtd_mes + " cliente(s) ativo(s) neste mês. Continue assim!";

  $("#pcHero").innerHTML =
    "<h1>" + greeting() + ", " + esc(firstName()) + "!</h1>" +
    "<p>" + esc(mensagem) + "</p>" +
    '<div class="pc-hero-main">' +
    '<div class="pc-hero-value"><small>Comissões a receber</small><b>' + brl(pendente) + "</b></div>" +
    '<div class="pc-hero-actions">' +
    '<button type="button" class="btn btn-light" data-pc-goto="invite">' + icon("mail") + " Convidar cliente</button>" +
    '<button type="button" class="btn btn-ghost" data-pc-goto="sell">' + icon("rocket") + " Roteiros e simulador</button>" +
    "</div></div>";

  const k = (cls, ico, v, l) => '<div class="pc-kpi ' + cls + '"><i>' + ico + "</i><b>" + v + "</b><span>" + l + "</span></div>";
  $("#pcKpis").innerHTML =
    k("green", icon("check-circle"), brl(pago), "Já recebido") +
    k("", icon("calendar"), brl(thisMonthTotal), "Gerado neste mês (1ª mensalidade)") +
    k("", icon("users"), referrals.length, "Indicados em acompanhamento") +
    k("", icon(lvl.medal), "Nível " + lvl.n + " · " + Math.round(lvl.pct * 100) + "%", "Seu nível agora") +
    k(late ? "danger" : "", late ? icon("alert-triangle") : icon("check"), late, "Pagamentos em atraso");

  renderLevel(lvl);
  renderFocus();
  renderFunnel();
  renderMilestones();
  renderTip();
}

function renderLevel(lvl) {
  const qtd = Number(level.qtd_mes) || 0;
  const next = LEVELS[lvl.n]; // próximo nível (undefined no 3)
  const { thisMonthBases } = monthTotals();
  const avgBase = thisMonthBases.length ? thisMonthBases.reduce((a, b) => a + b, 0) / thisMonthBases.length : 99.9;

  let pct = 100;
  let body;
  if (next) {
    pct = Math.min(100, Math.round((qtd / next.min) * 100));
    const faltam = Math.max(0, next.min - qtd);
    const hoje = qtd * avgBase * lvl.pct;
    const la = next.min * avgBase * next.pct;
    body =
      "<p>Faltam <strong>" + faltam + " cliente(s)</strong> para o Nível " + next.n + " " + icon(next.medal) + " (" + Math.round(next.pct * 100) + "%).</p>" +
      '<div class="pc-bonus">Ao chegar em ' + next.min + " clientes no mês, a comissão sobe de " +
      Math.round(lvl.pct * 100) + "% para " + Math.round(next.pct * 100) + "% em <u>todos</u> os clientes daquele mês. Estimativa: " +
      brl(hoje) + " → " + brl(la) + ".</div>";
  } else {
    body = "<p>Você está no <strong>nível máximo</strong>. 70% de comissão em cada cliente do mês.</p>";
  }

  $("#pcLevel").innerHTML =
    '<div class="pc-level"><div class="pc-ring" style="--p:' + pct + '"><div><b>' + qtd + "</b><span>clientes no mês</span></div></div>" +
    '<div class="pc-level-info"><div class="pc-level-badge">' + icon(lvl.medal) + " Nível " + lvl.n + " · " + lvl.name + " — " + Math.round(lvl.pct * 100) + "%</div>" + body + "</div></div>";
}

function renderFocus() {
  const items = [];
  const late = referrals.filter((x) => x.payment_status === "atrasado");
  if (late.length) items.push({ ico: "alert-triangle", text: late.length + " indicado(s) com pagamento em atraso. Um lembrete gentil costuma resolver.", tab: "sell", cta: "Ver mensagem" });
  const vencendo = referrals.filter(isDueSoon);
  if (vencendo.length) items.push({ ico: "bell", text: vencendo.length + " pagamento(s) vencendo nos próximos 3 dias. Um lembrete antes evita atraso.", tab: "referrals", cta: "Ver indicados" });
  const semCadastro = referrals.filter((x) => !x.accepted_at);
  if (semCadastro.length) items.push({ ico: "mail", text: semCadastro.length + " convite(s) ainda sem cadastro. Avise o cliente pelo WhatsApp.", tab: "referrals", cta: "Ver indicados" });
  const aguardando = referrals.filter((x) => x.accepted_at && !["em_dia", "atrasado", "cancelado"].includes(x.payment_status));
  if (aguardando.length) items.push({ ico: "gift", text: aguardando.length + " cliente(s) cadastrado(s) esperando virar pagante. Hora do follow-up.", tab: "sell", cta: "Ver roteiro" });
  if (!items.length) items.push({ ico: "rocket", text: "Nenhuma pendência por aqui. O melhor momento para convidar o próximo cliente é agora.", tab: "invite", cta: "Convidar" });

  $("#pcFocus").innerHTML = items.slice(0, 3).map((i) =>
    '<div class="pc-focus-item"><span class="pc-focus-ico">' + icon(i.ico) + "</span><p>" + esc(i.text) + "</p>" +
    '<button type="button" class="btn btn-outline btn-sm" data-pc-goto="' + i.tab + '">' + esc(i.cta) + "</button></div>"
  ).join("");
}

function renderFunnel() {
  const convidados = referrals.length;
  const cadastrados = referrals.filter((x) => x.accepted_at).length;
  const pagantes = referrals.filter((x) => x.payment_status === "em_dia" || x.payment_status === "atrasado").length;
  if (!convidados) {
    $("#pcFunnel").innerHTML = '<div class="empty-state">Seu funil aparece aqui depois do primeiro convite.</div>';
    return;
  }
  const row = (label, v, cls) =>
    '<div class="pc-funnel-row"><div class="pc-funnel-top"><span>' + label + "</span><b>" + v + '</b></div><div class="pc-track ' + cls + '"><i style="width:' + Math.round((v / convidados) * 100) + '%"></i></div></div>';
  const conv = Math.round((pagantes / convidados) * 100);
  $("#pcFunnel").innerHTML =
    row(icon("mail") + " Convidados", convidados, "") +
    row(icon("user-check") + " Criaram a conta", cadastrados, "") +
    row(icon("credit-card") + " Viraram pagantes", pagantes, "green") +
    '<p class="pc-funnel-foot">De cada 10 convites, <strong>' + Math.round(conv / 10) + '</strong> viraram pagantes. (Considera só os indicados em acompanhamento.)</p>';
}

function renderMilestones() {
  const paying = new Set(commissions.map((x) => x.email)).size;
  const nivel = Number(level.nivel) || 1;
  const list = [
    { ico: "mail", label: "Primeiro convite", ok: referrals.length > 0 || commissions.length > 0 },
    { ico: "user-check", label: "1º cliente cadastrado", ok: referrals.some((x) => x.accepted_at) || commissions.length > 0 },
    { ico: "credit-card", label: "1º cliente pagante", ok: paying >= 1 },
    { ico: "trending-up", label: "5 clientes pagantes", ok: paying >= 5 },
    { ico: "award", label: "10 clientes pagantes", ok: paying >= 10 },
    { ico: "medal-silver", label: "Nível Prata", ok: nivel >= 2 },
    { ico: "medal-gold", label: "Nível Ouro", ok: nivel >= 3 },
  ];
  const done = list.filter((m) => m.ok).length;
  $("#pcMilestoneCount").textContent = done + " de " + list.length;
  $("#pcMilestones").innerHTML = '<div class="pc-miles">' + list.map((m) =>
    '<div class="pc-mile ' + (m.ok ? "done" : "") + '"><span class="pc-mile-ico">' + icon(m.ico) + "</span><span>" + esc(m.label) + "</span></div>"
  ).join("") + "</div>";
}

const TIPS = [
  "Ajude o cliente a configurar o 1º post durante o teste. Ver o Direct chegando sozinho é o que convence.",
  "Mande o aviso do convite no WhatsApp na hora. Quem sabe que o e-mail está chegando abre e cria a senha.",
  "Mostre o resultado com um exemplo: peça para ele comentar no próprio post e receber o produto no Direct.",
  "Faça follow-up no 3º dia do teste. É quando o cliente costuma ter dúvidas ou esquece de testar.",
  "Foque em quem já vende por link de afiliado ou loja no Instagram: é o cliente que mais entende o valor.",
  "Concentre os fechamentos no mesmo mês: ao passar de 10 clientes ativos, a comissão sobe para 60% em todos.",
  "Apresente o plano Multi para quem tem mais de uma conta. O ticket é maior e a comissão também.",
];
function renderTip() {
  const t = TIPS[Math.floor(Date.now() / 864e5) % TIPS.length];
  $("#pcTip").innerHTML = '<span class="pc-tip-ico">' + icon("lightbulb") + '</span><div><b>Dica do dia</b><p>' + esc(t) + "</p></div>";
}

/* ------------------------------ indicados ------------------------------ */
function payBadge(s) {
  if (s === "em_dia") return '<span class="badge badge-ativo">Em dia</span>';
  if (s === "atrasado") return '<span class="badge badge-danger">Em atraso</span>';
  if (s === "cancelado") return '<span class="badge badge-muted">Cancelado</span>';
  return '<span class="badge badge-muted">Aguardando 1º pagamento</span>';
}

function renderReferrals() {
  const body = $("#pcReferralsBody");
  const bar = $("#pcRefFilters");
  if (bar) {
    bar.innerHTML = !referrals.length ? "" : REF_FILTERS.map((f) =>
      '<button type="button" class="pc-filter' + (f.key === refFilter ? " active" : "") + '" data-pc-filter="' + f.key + '">' +
      esc(f.label) + " <b>" + referrals.filter(f.test).length + "</b></button>"
    ).join("");
  }
  if (!referrals.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum indicado em acompanhamento. Envie seu primeiro convite na aba "Convidar".</td></tr>';
    return;
  }
  const filtro = REF_FILTERS.find((f) => f.key === refFilter) || REF_FILTERS[0];
  const list = referrals.filter(filtro.test);
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum indicado neste filtro.</td></tr>';
    return;
  }
  body.innerHTML = list.map((x) => {
    const fu = followUpKey(x);
    const left = x.manage_until ? Math.max(0, Math.ceil((new Date(x.manage_until) - Date.now()) / 864e5)) : null;
    return "<tr>" +
      "<td>" + esc(x.email) + (x.invite_type === "teste" ? ' <span class="badge badge-founder">Teste 7 dias</span>' : "") + "</td>" +
      "<td>" + (x.accepted_at ? '<span class="badge badge-ativo">Cadastrado</span>' : '<span class="badge badge-muted">Convite enviado</span>') + "</td>" +
      "<td>" + payBadge(x.payment_status) + "</td>" +
      "<td>" + fmtDate(x.payment_due_date) + "</td>" +
      "<td>" + (x.monthly_plan_value ? brl(x.monthly_plan_value) : "—") + "</td>" +
      "<td>" + (x.manage_until ? fmtDate(x.manage_until) + '<span class="pc-sub">' + left + " dia(s) restantes</span>" : '<span class="pc-sub">começa no 1º pagamento</span>') + "</td>" +
      '<td><div class="pc-row-actions"><a class="btn btn-outline btn-sm" href="mailto:' + esc(x.email) + '">E-mail</a>' +
      (fu ? '<button type="button" class="btn btn-wa btn-sm" data-pc-fu="' + fu + '">' + WA_ICON + "WhatsApp</button>" : "") +
      "</div></td>" +
      "</tr>";
  }).join("");
}

/* ------------------------------ comissões ------------------------------ */
function renderChart() {
  const host = $("#pcChart");
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: localMonthKey(d), label: MONTH_NAMES[d.getMonth()], value: 0, current: i === 0 });
  }
  commissions.filter((x) => Number(x.parcela) === 1).forEach((x) => {
    const m = months.find((mm) => mm.key === String(x.mes).slice(0, 7));
    if (m) m.value += Number(x.total);
  });
  const max = Math.max(...months.map((m) => m.value), 0);
  if (!max) {
    host.innerHTML = '<div class="empty-state">O gráfico aparece quando você tiver as primeiras comissões.</div>';
    return;
  }
  host.innerHTML = '<div class="pc-chart">' + months.map((m) => {
    const h = m.value ? Math.max(6, Math.round((m.value / max) * 100)) : 0;
    return '<div class="pc-bar ' + (m.value ? "" : "empty") + (m.current ? " current" : "") + '">' +
      '<span class="pc-bar-val">' + (m.value ? brl(m.value) : "—") + "</span>" +
      '<div class="pc-bar-fill" style="height:' + (m.value ? h * 1.15 : 3) + 'px"></div>' +
      '<span class="pc-bar-label">' + m.label + "</span></div>";
  }).join("") + "</div>";
}

// Exporta as comissões em CSV (abre no Excel em pt-BR: separador ";" e vírgula decimal)
function exportCommissions() {
  if (!commissions.length) return banner("pcBanner", "Ainda não há comissões para exportar.", "error");
  const money = (v) => Number(v || 0).toFixed(2).replace(".", ",");
  const head = ["Mês", "Cliente", "Nível", "Percentual", "Clientes no mês", "1ª mensalidade (R$)", "Comissão total (R$)", "Parcela", "Valor da parcela (R$)", "Acerto", "Situação"];
  const rows = commissions.map((x) => [
    fmtMonth(x.mes), x.email, x.nivel, Math.round(Number(x.percentual) * 100) + "%", x.qtd_mes,
    money(x.base), money(x.total), x.parcela + "/2", money(x.valor), fmtDate(x.vencimento), x.pago ? "Pago" : "Pendente",
  ]);
  const csv = [head, ...rows]
    .map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "comissoes-" + localMonthKey() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  banner("pcBanner", "Planilha de comissões exportada.", "success");
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

/* ------------------------------ roteiros e objeções ------------------------------ */
const TEMPLATES = [
  {
    key: "first", ico: "message-circle", title: "1º contato", when: "Para apresentar a ferramenta",
    text: "Oi, [nome]! Tudo bem? Vi que você vende pelo Instagram e queria te mostrar uma coisa: com o Achei & Postei, quando alguém comenta uma palavra-chave no seu post, o link do produto (com foto e preço) chega direto no Direct, na hora, sem você precisar responder um por um. Posso liberar 7 dias grátis pra você testar?",
  },
  {
    key: "invite", ico: "mail", title: "Aviso do convite", when: "Logo depois de enviar o convite",
    text: "[nome], acabei de te enviar o convite por e-mail para criar sua senha e testar o Achei & Postei por 7 dias. Se não aparecer na caixa de entrada, dá uma olhada no spam ou em promoções. Qualquer dúvida me chama!",
  },
  {
    key: "followup", ico: "message-square", title: "Follow-up do teste", when: "No 3º dia do teste",
    text: "[nome], como está indo o teste? Já deu pra ver os comentários virando Direct automático? Se quiser, te ajudo a configurar o primeiro post agora.",
  },
  {
    key: "close", ico: "credit-card", title: "Fechamento", when: "Quando o cliente gostou",
    text: "Que bom que gostou! O plano Individual é R$ 99,90/mês (1 conta do Instagram e 300 mensagens por mês) e o Multi é R$ 189,90/mês (até 3 contas). Qual combina mais com o seu momento?",
  },
  {
    key: "late", ico: "bell", title: "Lembrete de pagamento", when: "Cliente em atraso",
    text: "Oi, [nome]! Passando pra lembrar que a mensalidade do Achei & Postei está pendente. Se precisar de ajuda com o pagamento, me avisa que eu te ajudo.",
  },
];

function tplCard(t, prefix) {
  const id = prefix + "-" + t.key;
  return '<div class="pc-tpl"><div><h3>' + icon(t.ico) + esc(t.title) + "</h3><small>" + esc(t.when) + "</small></div>" +
    '<textarea id="pcTpl-' + id + '">' + esc(t.text) + "</textarea>" +
    '<div class="pc-tpl-actions"><button type="button" class="btn btn-outline btn-sm" data-pc-copy="' + id + '">' + icon("copy") + " Copiar</button>" +
    '<button type="button" class="btn btn-wa btn-sm" data-pc-wa="' + id + '">' + WA_ICON + "WhatsApp</button></div></div>";
}

function renderTemplates() {
  $("#pcScripts").innerHTML = TEMPLATES.map((t) => tplCard(t, "s")).join("");
}

const OBJECTIONS = [
  ["“Já uso outra ferramenta.”", "Pergunte o que falta nela. No Achei & Postei, o cliente cadastra o produto uma vez e o Direct sai com foto, nome e preço, e dá para montar uma conversa com perguntas (fluxo) antes de enviar o link. Ofereça os 7 dias grátis para comparar na prática."],
  ["“Está caro.”", "O plano Individual sai a pouco mais de R$ 3 por dia e já inclui 300 mensagens por mês. Se um comentário a mais vira venda, a ferramenta se paga. Convide o cliente a testar 7 dias sem compromisso."],
  ["“Não entendo de tecnologia.”", "Não precisa. Não tem código: ele conecta o Instagram, escolhe o post, a palavra-chave e o produto. A configuração técnica inicial é feita pela administração depois que ele aceita o convite."],
  ["“E se o Instagram bloquear minha conta?”", "A conexão é pelo login oficial do Instagram, e a plataforma nunca pede a senha da conta. O cliente pode desconectar quando quiser."],
  ["“Vou pensar e te falo depois.”", "Combine uma data: “Perfeito! Posso te chamar na quinta pra ver o que achou?”. Enquanto isso, o teste de 7 dias fica rodando e mostra o resultado por ele."],
];
function renderObjections() {
  $("#pcObjections").innerHTML = OBJECTIONS.map(([q, a]) =>
    "<details><summary>" + esc(q) + "</summary><p>" + esc(a) + "</p></details>"
  ).join("");
}

/* ------------------------------ simulador ------------------------------ */
function renderSim() {
  const n = Number($("#pcSimN").value) || 1;
  const plan = Number($("#pcSimPlan").value) || 99.9;
  const pct = pctFor(n);
  const total = n * plan * pct;
  $("#pcSimNLabel").textContent = n;

  let up = "";
  [[11, 0.6], [21, 0.7]].forEach(([min, p]) => {
    if (n < min) {
      const alvo = min * plan * p;
      up += '<div class="pc-sim-line up"><span>Com ' + min + " clientes (" + Math.round(p * 100) + "%)</span><b>" + brl(alvo) + "</b></div>";
    }
  });

  $("#pcSimOut").innerHTML =
    '<div class="pc-sim-big">' + brl(total) + "</div>" +
    '<div class="pc-sim-sub">em comissões com ' + n + " cliente(s) no mês · Nível " + (n >= 21 ? 3 : n >= 11 ? 2 : 1) + " (" + Math.round(pct * 100) + "%)</div>" +
    '<div class="pc-sim-line"><span>Por cliente</span><b>' + brl(plan * pct) + "</b></div>" +
    '<div class="pc-sim-line"><span>Mantendo esse ritmo por 12 meses</span><b>' + brl(total * 12) + "</b></div>" + up;
}
$("#pcSimN").addEventListener("input", renderSim);
$("#pcSimPlan").addEventListener("change", renderSim);

/* ------------------------------ convites ------------------------------ */
document.querySelectorAll('input[name="pcTipo"]').forEach((r) =>
  r.addEventListener("change", () => {
    $("#pcInviteBtn").textContent = r.value === "teste" && r.checked ? "Enviar convite de teste" : "Enviar convite de pagante";
  })
);

async function invite() {
  const input = $("#pcInviteEmail");
  const btn = $("#pcInviteBtn");
  const email = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return banner("pcBanner", "Informe um e-mail válido.", "error");
  const tipo = (document.querySelector('input[name="pcTipo"]:checked') || {}).value === "pago" ? "pago" : "teste";
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("partner-invite-user", { body: { email, tipo } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    banner("pcBanner", (tipo === "teste" ? "Convite de teste de 7 dias enviado para " : "Convite (pagante) enviado para ") + email + ".", "success");
    input.value = "";
    $("#pcAfterInvite").innerHTML =
      '<div class="pc-after"><h3>' + icon("check-circle") + " Convite enviado!</h3>" +
      "<p>Agora avise o cliente pelo WhatsApp. Quem sabe que o e-mail está chegando abre e cria a senha mais rápido.</p>" +
      tplCard(TEMPLATES.find((t) => t.key === "invite"), "after") + "</div>";
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
$("#pcExportCsv")?.addEventListener("click", exportCommissions);

/* ------------------------------ esqueci minha senha ------------------------------ */
const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
$("#pcForgotBtn").addEventListener("click", async () => {
  const email = $("#pcEmail").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return banner("pcAuthBanner", "Digite seu e-mail no campo acima e clique de novo.", "error");
  const { error } = await verifier.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) return banner("pcAuthBanner", "Não foi possível enviar: " + error.message, "error");
  banner("pcAuthBanner", "Se esse e-mail tiver cadastro, enviamos um link para criar uma nova senha.", "success");
});

/* ------------------------------ alterar senha (logado) ------------------------------ */
function pwMsg(text, type) { const el = $("#pcPwMsg"); el.textContent = text; el.className = "banner " + type; }
$("#pcChangePwBtn").addEventListener("click", () => {
  $("#pcPwMsg").className = "banner hidden";
  ["#pcPwCurrent", "#pcPwNew", "#pcPwConfirm"].forEach((id) => { $(id).value = ""; $(id).type = "password"; });
  $("#pcPwShow").checked = false;
  $("#pcPwModal").classList.remove("hidden");
  $("#pcPwCurrent").focus();
});
const closePw = () => $("#pcPwModal").classList.add("hidden");
$("#pcPwClose").addEventListener("click", closePw);
$("#pcPwCancel").addEventListener("click", closePw);
$("#pcPwModal").addEventListener("click", (e) => { if (e.target.id === "pcPwModal") closePw(); });
$("#pcPwShow").addEventListener("change", (e) => {
  ["#pcPwCurrent", "#pcPwNew", "#pcPwConfirm"].forEach((id) => ($(id).type = e.target.checked ? "text" : "password"));
});
$("#pcPwSave").addEventListener("click", async () => {
  const cur = $("#pcPwCurrent").value, nw = $("#pcPwNew").value, cf = $("#pcPwConfirm").value;
  if (!cur) return pwMsg("Digite sua senha atual.", "error");
  if (nw.length < 6) return pwMsg("A nova senha precisa ter pelo menos 6 caracteres.", "error");
  if (nw !== cf) return pwMsg("As senhas novas não são iguais.", "error");
  if (nw === cur) return pwMsg("A nova senha precisa ser diferente da atual.", "error");
  const btn = $("#pcPwSave");
  btn.disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
    const check = await verifier.auth.signInWithPassword({ email: session.user.email, password: cur });
    if (check.error) throw new Error("Senha atual incorreta.");
    const { error } = await sb.auth.updateUser({ password: nw });
    if (error) throw new Error(error.message);
    pwMsg("Senha alterada com sucesso!", "success");
    setTimeout(closePw, 1600);
  } catch (e) {
    pwMsg(e.message, "error");
  } finally {
    btn.disabled = false;
  }
});

bootstrap();
