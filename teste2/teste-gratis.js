// teste-gratis.js
// Usuário de teste de 7 dias. Módulo isolado: não importa nem altera nenhum
// outro arquivo do projeto. Toda a interface é injetada por aqui (nenhum
// markup novo é necessário no index.html — só a tag <script>).
//
// Fluxo:
//  - ADMIN: na aba Admin > "Convidar" aparece o painel "Convidar usuário de
//    teste" (convida pelo mesmo admin-invite-user e marca o perfil como teste)
//    e a lista de testes com +7 dias / Tornar pagante / Encerrar.
//  - USUÁRIO EM TESTE: vê um aviso no topo com os dias restantes. O relógio
//    dos 7 dias só começa no PRIMEIRO acesso (feito no banco, em get_my_trial).
//  - FIM DO TESTE: o banco desativa o perfil (is_active = false) e esta tela
//    mostra o aviso "Seu teste acabou" com botão de assinar pelo WhatsApp.
//
// Requer o SQL de teste-gratis.sql já rodado no Supabase.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = {
  SUPABASE_URL: "https://abdliioyzkylccfylils.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
  TRIAL_DAYS: 7,
  WHATSAPP: "5598982672165", // suporte / assinatura
};

// Mesmo padrão dos outros módulos: só LÊ a sessão que o app.js estabeleceu.
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const wa = (msg) => "https://wa.me/" + CONFIG.WHATSAPP + "?text=" + encodeURIComponent(msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let loaded = false;
let busy = false;
let tickTimer = null;
let adminReady = false;

/* ------------------------------ estilos ------------------------------ */
function injectStyles() {
  if ($("trialStyles")) return;
  const st = document.createElement("style");
  st.id = "trialStyles";
  st.textContent = `
    .trial-banner { display:flex; align-items:center; gap:.8rem; flex-wrap:wrap; margin:0 0 1rem; padding:.75rem 1rem;
      border-radius:14px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-size:.92rem; }
    .trial-banner .trial-ico { font-size:1.25rem; line-height:1; }
    .trial-banner .trial-copy { flex:1; min-width:180px; display:flex; flex-direction:column; gap:.1rem; }
    .trial-banner .trial-copy span { color:var(--text-muted); font-size:.82rem; }
    .trial-banner.urgent { border-color:var(--warning); background:var(--warning-bg); }
    .trial-pill { display:inline-block; padding:.15rem .55rem; border-radius:999px; font-size:.75rem; font-weight:600;
      background:var(--surface-2); color:var(--text-muted); white-space:nowrap; }
    .trial-pill.ok { background:var(--warning-bg); color:var(--warning); }
    .trial-pill.bad { background:var(--danger-bg); color:var(--danger); }
    .trial-hint { font-size:.8rem; color:var(--text-faint); margin:.6rem 0 0; }
    .trial-actions { display:flex; gap:.4rem; flex-wrap:wrap; }
    #trialAdminMsg { margin-top:.6rem; }
    .trial-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center;
      padding:1.25rem; background:rgba(10,7,16,.82); backdrop-filter:blur(6px); }
    .trial-overlay .trial-card { width:100%; max-width:420px; text-align:center; padding:2rem 1.5rem;
      border-radius:20px; background:var(--surface); border:1px solid var(--border); color:var(--text); }
    .trial-overlay .trial-card .big { font-size:2.4rem; margin-bottom:.4rem; }
    .trial-overlay .trial-card h1 { font-size:1.3rem; margin:0 0 .5rem; }
    .trial-overlay .trial-card .btn { margin-top:.6rem; }
  `;
  document.head.appendChild(st);
}

/* ------------------------- lado do usuário ------------------------- */
function removeUserUi() {
  $("trialBanner")?.remove();
  $("trialOverlay")?.remove();
  clearInterval(tickTimer);
  tickTimer = null;
}

function leftText(ms) {
  const hours = Math.ceil(ms / 36e5);
  if (hours <= 24) return hours + (hours === 1 ? " hora" : " horas");
  const days = Math.ceil(ms / 864e5);
  return days + " dias";
}

function showExpired(email) {
  $("trialBanner")?.remove();
  clearInterval(tickTimer);
  if ($("trialOverlay")) return;
  const o = document.createElement("div");
  o.id = "trialOverlay";
  o.className = "trial-overlay";
  o.innerHTML =
    '<div class="trial-card">' +
    '<div class="big">⏳</div>' +
    "<h1>Seu teste grátis terminou</h1>" +
    "<p>Gostou do Respondi? Assine para continuar respondendo comentários e enviando produtos por DM automaticamente.</p>" +
    '<a class="btn btn-primary btn-full" target="_blank" rel="noopener" href="' +
    esc(wa("Olá! Meu teste grátis de " + CONFIG.TRIAL_DAYS + " dias no Respondi terminou e quero assinar. Meu e-mail: " + email)) +
    '">Assinar pelo WhatsApp</a>' +
    '<button type="button" class="btn btn-outline btn-full" id="trialLogoutBtn">Sair</button>' +
    "</div>";
  document.body.appendChild(o);
  $("trialLogoutBtn").addEventListener("click", () => sb.auth.signOut().then(() => location.reload()));
}

function showBanner(t, email) {
  const ends = new Date(t.trial_ends_at).getTime();
  const left = ends - Date.now();
  let el = $("trialBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "trialBanner";
    const anchor = $("statusBanner");
    if (anchor) anchor.insertAdjacentElement("afterend", el);
    else document.querySelector(".app-main")?.prepend(el);
  }
  el.className = "trial-banner" + (left <= 2 * 864e5 ? " urgent" : "");
  el.innerHTML =
    '<span class="trial-ico">🎁</span>' +
    '<div class="trial-copy"><strong>Teste grátis: restam ' + leftText(left) + "</strong>" +
    "<span>Seu acesso de teste termina em " + fmtDate(t.trial_ends_at) + ".</span></div>" +
    '<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="' +
    esc(wa("Olá! Estou testando o Respondi e quero assinar um plano. Meu e-mail: " + email)) +
    '">Assinar agora</a>';

  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (Date.now() >= ends) {
      loaded = false;
      load(); // o banco confirma a expiração e desativa o perfil
    } else {
      showBanner(t, email);
    }
  }, 60000);
}

function renderUserSide(t, email) {
  if (!t || !t.is_trial) {
    removeUserUi();
    return;
  }
  if (t.expired) showExpired(email);
  else showBanner(t, email);
}

/* ------------------------------ admin ------------------------------ */
function adminMsg(text, type) {
  const el = $("trialAdminMsg");
  if (!el) return;
  el.textContent = text;
  el.className = "banner " + type;
  clearTimeout(adminMsg._t);
  adminMsg._t = setTimeout(() => (el.className = "banner"), 7000);
}

function situation(r) {
  const ends = r.trial_ends_at ? new Date(r.trial_ends_at).getTime() : null;
  if (!ends) return { cls: "", text: "Aguardando 1º acesso" };
  if (ends <= Date.now()) return { cls: "bad", text: "Expirado" };
  if (!r.is_active) return { cls: "bad", text: "Desativado" };
  return { cls: "ok", text: "Ativo · " + leftText(ends - Date.now()) };
}

async function loadTrials() {
  const body = $("trialListBody");
  if (!body) return;
  body.innerHTML = '<tr><td colspan="5" class="loading-row">Carregando testes…</td></tr>';
  const { data, error } = await sb.rpc("admin_list_trials");
  if (error) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Erro ao carregar: ' + esc(error.message) + "</td></tr>";
    return;
  }
  if (!data || !data.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum usuário de teste ainda.</td></tr>';
    return;
  }
  body.innerHTML = data
    .map((r) => {
      const s = situation(r);
      return (
        "<tr>" +
        "<td>" + esc(r.email) + "</td>" +
        "<td>" + fmtDate(r.created_at) + "</td>" +
        '<td><span class="trial-pill ' + s.cls + '">' + esc(s.text) + "</span></td>" +
        "<td>" + fmtDate(r.trial_ends_at) + "</td>" +
        '<td><div class="trial-actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-trial-act="extend" data-id="' + esc(r.id) + '">+' + CONFIG.TRIAL_DAYS + " dias</button>" +
        '<button type="button" class="btn btn-outline btn-sm" data-trial-act="convert" data-id="' + esc(r.id) + '">Tornar pagante</button>' +
        '<button type="button" class="btn btn-danger-ghost btn-sm" data-trial-act="end" data-id="' + esc(r.id) + '">Encerrar</button>' +
        "</div></td></tr>"
      );
    })
    .join("");
}

async function trialAction(act, id, btn) {
  if (act === "convert" && !confirm("Tornar este usuário pagante? O teste deixa de existir e ele não será mais desativado automaticamente. Depois defina valor e vencimento em Clientes > Editar cobrança.")) return;
  if (act === "end" && !confirm("Encerrar o teste agora? O acesso do usuário será desativado.")) return;
  btn.disabled = true;
  try {
    let res;
    if (act === "extend") res = await sb.rpc("admin_extend_trial", { p_user_id: id, p_days: CONFIG.TRIAL_DAYS });
    else res = await sb.rpc("admin_end_trial", { p_user_id: id, p_convert: act === "convert" });
    if (res.error) throw res.error;
    adminMsg(
      act === "extend" ? "Teste estendido em " + CONFIG.TRIAL_DAYS + " dias." :
      act === "convert" ? "Usuário agora é pagante. Defina a cobrança em Clientes > Editar cobrança." :
      "Teste encerrado.",
      "success"
    );
    await loadTrials();
  } catch (e) {
    adminMsg("Erro: " + e.message, "error");
    btn.disabled = false;
  }
}

async function inviteTrial() {
  const input = $("trialInviteEmail");
  const btn = $("trialInviteBtn");
  const email = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    adminMsg("Informe um e-mail válido.", "error");
    return;
  }
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("admin-invite-user", { body: { email, is_founder: false } });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);

    // O perfil é criado pelo convite; pode levar um instante para existir.
    let lastErr = null;
    for (let i = 0; i < 6; i++) {
      const r = await sb.rpc("admin_set_trial", { p_email: email, p_days: CONFIG.TRIAL_DAYS });
      if (!r.error) { lastErr = null; break; }
      lastErr = r.error;
      if (!String(r.error.message).includes("perfil_nao_encontrado")) break;
      await sleep(800);
    }
    if (lastErr) throw new Error("Convite enviado, mas não foi possível marcar como teste: " + lastErr.message);

    adminMsg("Convite de teste (" + CONFIG.TRIAL_DAYS + " dias) enviado para " + email + ".", "success");
    input.value = "";
    await loadTrials();
  } catch (e) {
    adminMsg(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function setupAdmin() {
  if (adminReady) return;
  const host = $("seg-invites") || $("tab-admin");
  if (!host) return;
  adminReady = true;

  const invite = document.createElement("section");
  invite.className = "panel";
  invite.innerHTML =
    '<div class="panel-heading-row"><h2>🎁 Convidar usuário de teste (' + CONFIG.TRIAL_DAYS + " dias)</h2></div>" +
    '<div class="produto-picker-row mb-sm">' +
    '<div class="field flush"><span>E-mail do usuário de teste</span>' +
    '<input type="email" id="trialInviteEmail" placeholder="teste@email.com" /></div>' +
    '<button type="button" id="trialInviteBtn" class="btn btn-primary">Enviar convite de teste</button></div>' +
    '<p class="trial-hint">O prazo de ' + CONFIG.TRIAL_DAYS + " dias começa no primeiro acesso do usuário. O teste vale para 1 conta do Instagram e o acesso é desativado automaticamente ao fim do prazo.</p>" +
    '<div id="trialAdminMsg" class="banner"></div>';

  const list = document.createElement("section");
  list.className = "panel panel-plain";
  list.innerHTML =
    '<div class="panel-heading-row"><h2>Usuários de teste</h2>' +
    '<button type="button" id="trialRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button></div>' +
    '<div class="table-scroll"><table><thead><tr>' +
    "<th>E-mail</th><th>Convidado em</th><th>Situação</th><th>Termina em</th><th>Ações</th>" +
    '</tr></thead><tbody id="trialListBody"></tbody></table></div>';

  const first = host.querySelector(":scope > section");
  if (first) first.after(invite, list);
  else host.append(invite, list);

  $("trialInviteBtn").addEventListener("click", inviteTrial);
  $("trialInviteEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") inviteTrial(); });
  $("trialRefreshBtn").addEventListener("click", loadTrials);
  $("trialListBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-trial-act]");
    if (b) trialAction(b.dataset.trialAct, b.dataset.id, b);
  });
}

/* ------------------------------ bootstrap ------------------------------ */
async function load() {
  if (busy) return;
  busy = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    loaded = true;
    injectStyles();

    const [t, p] = await Promise.all([
      sb.rpc("get_my_trial"),
      sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle(),
    ]);
    if (t.error) console.error("Teste grátis:", t.error.message);
    else renderUserSide(t.data, session.user.email);

    if (p.data && p.data.is_admin) {
      setupAdmin();
      loadTrials();
    }
  } catch (e) {
    console.error("Teste grátis:", e);
  } finally {
    busy = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { loaded = false; removeUserUi(); return; }
    if (s && !loaded) setTimeout(load, 0);
  });
});
