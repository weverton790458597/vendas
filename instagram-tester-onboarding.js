// instagram-tester-onboarding.js
// Passo a passo para conectar uma conta do Instagram, feito para usuário leigo:
// cada conta vira um "cartão" com 4 passos, e só o passo da vez tem botão.
//   1. Enviar o @            (usuário digita e clica)
//   2. Liberação do acesso   (automático — a tela atualiza sozinha)
//   3. Aceitar o convite     (notebook: botão abre o Instagram; celular: botão
//                             tenta abrir direto no navegador, sem copiar/colar)
//   4. Conectar a conta      (botão inicia a conexão)
// Funciona igual no notebook e no celular (os estilos são injetados aqui).
// Não importa nem depende de app.js — usa o próprio client do Supabase. O único
// ponto de contato é o botão #addIgAccountBtn do app.js, que é "clicado" por
// código no passo 4 (e escondido da tela, já que o passo a passo o substitui).
// Markup necessário no index.html: só a <section id="igTesterOnboarding">
// que já existe — todo o conteúdo dela é desenhado por este arquivo.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// IMPORTANTE: só o app.js pode processar o token do link de convite/recuperação
// (detectSessionInUrl). Aqui a gente só LÊ a sessão que ele já estabeleceu —
// nunca cria um segundo client competindo por isso, senão corrompe a sessão
// durante o fluxo de convite.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const TABLE = "instagram_tester_requests";
const CONNECTED_TABLE = "instagram_config";
const INVITES_URL = "https://www.instagram.com/accounts/manage_access/";
const SUPPORT_WHATSAPP = "5598982672165";
const OPENED_KEY = "respondi-ig-invite-opened";      // já aceitou o convite (libera o passo 4)
const LINK_OPENED_KEY = "respondi-ig-link-opened";   // já tocou em "Abrir o Instagram" (celular)

let realtimeChannel = null;
let currentUserId = null;

// Estado da tela
let requests = [];        // solicitações que ainda têm algo a fazer
let connectedCount = 0;   // contas já conectadas de verdade
let showForm = false;     // formulário de "outra conta" aberto
let loadError = "";
let formError = "";
let limitHit = false;     // plano no limite de contas
let loaded = false;
const openedIds = readOpened();
// Celular: quem já tocou em "Abrir o Instagram". Fica salvo no aparelho porque, ao
// voltar do Instagram, o navegador costuma recarregar a página e a memória se perde.
const copiedIds = readSet(LINK_OPENED_KEY);

const IS_ANDROID = /android/i.test(navigator.userAgent);
const IS_IOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Tenta abrir o link NO NAVEGADOR (e não no app do Instagram, que não tem a aba
// "Convites do testador"). Android: pede ao Chrome via intent (com fallback para
// o link normal). iPhone/iPad: esquema x-safari-. Computador: nova aba.
function openInBrowser() {
  const u = INVITES_URL;
  if (IS_ANDROID) {
    window.location.href =
      "intent://" + u.replace(/^https:\/\//, "") +
      "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
      encodeURIComponent(u) + ";end";
  } else if (IS_IOS) {
    window.location.href = "x-safari-" + u;
  } else {
    window.open(u, "_blank", "noopener");
  }
}

// Celular/tablet: lá a aba "Convites do testador" só aparece na versão para
// computador do site do Instagram, então o passo 3 é diferente.
const IS_MOBILE =
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function $(sel) {
  return document.querySelector(sel);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function readSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]").map(String));
  } catch (_e) {
    return new Set();
  }
}
function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (_e) {}
}
function readOpened() { return readSet(OPENED_KEY); }
function saveOpened() { saveSet(OPENED_KEY, openedIds); }

function whatsappHref(text) {
  return "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent(text);
}

/* ------------------------------ estilos ------------------------------ */
function injectStyles() {
  if (document.getElementById("igwStyles")) return;
  const st = document.createElement("style");
  st.id = "igwStyles";
  st.textContent = `
    /* O passo a passo substitui o botão antigo de "Conectar Instagram" da lista de contas
       (ele continua no DOM porque o passo 4 o aciona por código). */
    #addIgAccountBtn { display: none !important; }

    .igw { max-width: 640px; }
    .igw h2 { margin-bottom: .25rem; }
    .igw-sub { color: var(--text-muted); font-size: .92rem; margin: 0 0 1rem; }
    .igw-card { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-md, 14px);
      padding: 1rem 1.1rem; margin-bottom: .9rem; }
    .igw-head { display: flex; align-items: center; justify-content: space-between; gap: .6rem; margin-bottom: .4rem; }
    .igw-head strong { font-size: 1rem; word-break: break-all; }

    .igw-step { display: flex; gap: .85rem; padding: .8rem 0; }
    .igw-step + .igw-step { border-top: 1px dashed var(--border); }
    .igw-num { flex: 0 0 2rem; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 700; font-size: .9rem; border: 1px solid var(--border);
      background: var(--surface-2, transparent); color: var(--text-muted); }
    .igw-num svg { width: 16px; height: 16px; }
    .igw-active .igw-num { background: var(--accent-1); color: #fff; border-color: transparent; }
    .igw-done .igw-num { background: var(--success-bg); color: var(--success); border-color: transparent; }
    .igw-wait .igw-num { background: var(--warning-bg); color: var(--warning); border-color: transparent; }
    .igw-locked { opacity: .5; }
    .igw-step-main { flex: 1; min-width: 0; }
    .igw-step-title { font-weight: 600; font-size: .97rem; line-height: 2rem; }
    .igw-active .igw-step-title, .igw-wait .igw-step-title { font-size: 1.02rem; }
    .igw-step-body { font-size: .88rem; color: var(--text-muted); }
    .igw-step-body p { margin: 0 0 .75rem; }
    .igw-step-body .field { margin-bottom: .6rem; }
    .igw-step-body .banner { margin-bottom: .6rem; }
    .igw-btn { min-height: 48px; font-size: 1rem; }
    .igw-link { background: none; border: 0; padding: 0; color: var(--accent-1); font: inherit;
      font-weight: 600; text-decoration: underline; cursor: pointer; }
    .igw-note { font-size: .8rem; color: var(--text-faint, var(--text-muted)); margin: .6rem 0 0; }
    .igw-help { margin-top: .75rem; font-size: .84rem; }
    .igw-help summary { cursor: pointer; color: var(--accent-1); font-weight: 600; }
    .igw-help ol { margin: .6rem 0 0; padding-left: 1.2rem; }
    .igw-help li { margin-bottom: .4rem; }
    .igw-step-body ol { margin: .2rem 0 .8rem; padding-left: 1.2rem; }
    .igw-step-body li { margin-bottom: .45rem; }
    .igw-linkbox { width: 100%; box-sizing: border-box; margin: 0 0 .7rem; padding: .6rem .7rem; font-size: .8rem;
      border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2, transparent); color: var(--text); }
    .igw-reject { margin: .2rem 0 .9rem; font-size: .9rem; color: var(--text-muted); }
    .igw-add { margin-bottom: .9rem; }
    .igw-limit { border: 1px solid var(--warning); background: var(--warning-bg); border-radius: var(--radius-md, 14px);
      padding: .85rem 1rem; margin-bottom: .9rem; font-size: .9rem; }
    .igw-limit p { margin: 0 0 .6rem; }
    .igw-help-foot { text-align: center; font-size: .85rem; color: var(--text-muted); margin: .4rem 0 0; }
    .igw-help-foot a { color: var(--accent-1); font-weight: 600; }
    .igw-spin { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent;
      border-radius: 50%; animation: igwspin .8s linear infinite; }
    @keyframes igwspin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .igw-spin { animation: none; } }

    @media (max-width: 900px) {
      .igw-card { padding: .9rem .85rem; }
      .igw-step { gap: .7rem; }
      .igw-step-title { font-size: .95rem; }
      .igw-btn { width: 100%; }
    }
  `;
  document.head.appendChild(st);
}

/* ------------------------------ desenho ------------------------------ */
const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function stepRow(n, state, title, body) {
  const mark = state === "done" ? CHECK : state === "wait" ? '<span class="igw-spin"></span>' : String(n);
  return (
    '<div class="igw-step igw-' + state + '">' +
    '<span class="igw-num">' + mark + "</span>" +
    '<div class="igw-step-main">' +
    '<div class="igw-step-title">' + title + "</div>" +
    (body ? '<div class="igw-step-body">' + body + "</div>" : "") +
    "</div></div>"
  );
}

function statusBadge(status) {
  if (status === "aprovado") return '<span class="badge badge-ativo">Liberado</span>';
  if (status === "rejeitado") return '<span class="badge badge-danger">Não aprovado</span>';
  return '<span class="badge badge-muted">Aguardando</span>';
}

function helpSteps(user) {
  return (
    '<details class="igw-help"><summary>Não achei o convite? Veja o passo a passo</summary><ol>' +
    "<li>Entre em <strong>instagram.com</strong> com a conta <strong>@" + user + "</strong> " +
    "(o convite só aparece nela).</li>" +
    "<li>Abra a página <strong>Apps e sites</strong> (o botão acima leva direto para ela).</li>" +
    "<li>Clique na aba <strong>“Convites do testador”</strong> e depois em <strong>Aceitar</strong>.</li>" +
    "</ol></details>"
  );
}

function mobileInviteStep(id, user, opened) {
  if (!opened) {
    return stepRow(3, "active", "Aceite o convite no Instagram",
      "<p>Toque no botão: vamos abrir o Instagram no navegador do seu celular.</p>" +
      '<button type="button" class="btn btn-primary btn-full igw-btn" data-igw="open-mobile" data-id="' + id + '">Abrir o Instagram</button>');
  }
  return stepRow(3, "active", "Aceite o convite no Instagram",
    "<p>Na página que abriu, entre com a conta <strong>@" + user + "</strong>, toque na aba " +
    "<strong>“Convites do testador”</strong> e depois em <strong>Aceitar</strong>.</p>" +
    '<button type="button" class="btn btn-primary btn-full igw-btn" data-igw="accepted" data-id="' + id + '">Já aceitei o convite</button>' +
    '<details class="igw-help"><summary>Abriu o app do Instagram ou não achou a aba?</summary>' +
    "<p>Abra pelo <strong>navegador</strong> (Chrome ou Safari): copie o link abaixo e cole na barra de endereço.</p>" +
    '<input type="text" class="igw-linkbox" readonly value="' + INVITES_URL + '" aria-label="Link do Instagram" onfocus="this.select()" />' +
    '<button type="button" class="btn btn-outline btn-sm" data-igw="copy-link">Copiar o link</button>' +
    '<ol style="margin-top:.8rem">' +
    "<li>Se não abrir direto em <strong>Apps e sites</strong>: foto de perfil → <strong>☰</strong> → <strong>Configurações e privacidade</strong> → " +
    "“Seu app e suas mídias” → <strong>Permissões do site do app</strong> → <strong>Apps e sites</strong>.</li>" +
    "<li>Se a aba “Convites do testador” não aparecer, ative a <strong>“Versão para computador”</strong> do navegador " +
    "(Chrome: botão <strong>⋮</strong> · Safari: botão <strong>aA</strong>) e abra o link de novo.</li></ol></details>");
}

function formStep() {
  return (
    '<form data-igw-form novalidate>' +
    '<div class="field"><input type="text" id="igTesterUsernameInput" placeholder="@sua.loja" ' +
    'autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="@ do Instagram" /></div>' +
    '<div id="igTesterFormError" class="banner error' + (formError ? "" : " hidden") + '">' + escapeHtml(formError) + "</div>" +
    '<button type="submit" id="igTesterSubmitBtn" class="btn btn-primary btn-full igw-btn">Enviar meu @</button>' +
    '<p class="igw-note">A conta precisa ser profissional (comercial ou criador de conteúdo).</p>' +
    "</form>"
  );
}

function newAccountCard(withHead, canCancel) {
  return (
    '<div class="igw-card">' +
    (withHead ? '<div class="igw-head"><strong>Nova conta</strong></div>' : "") +
    stepRow(1, "active", "Digite o @ da sua conta", formStep() +
      (canCancel ? '<p class="igw-note"><button type="button" class="igw-link" data-igw="cancel">Cancelar</button></p>' : "")) +
    stepRow(2, "locked", "Liberação do acesso") +
    stepRow(3, "locked", "Aceitar o convite no Instagram") +
    stepRow(4, "locked", "Conectar a conta") +
    "</div>"
  );
}

function requestCard(row) {
  const id = escapeHtml(row.id);
  const user = escapeHtml(row.instagram_username);
  const head = '<div class="igw-head"><strong>@' + user + "</strong>" + statusBadge(row.status) + "</div>";

  if (row.status === "rejeitado") {
    return (
      '<div class="igw-card">' + head +
      '<p class="igw-reject">Não foi possível liberar esta conta. Confira se digitou o @ certo e tente de novo.</p>' +
      '<button type="button" class="btn btn-outline btn-full igw-btn" data-igw="retry">Tentar com outro @</button>' +
      "</div>"
    );
  }

  const approved = row.status === "aprovado";
  const opened = approved && openedIds.has(String(row.id));

  const s2 = approved
    ? stepRow(2, "done", "Acesso liberado")
    : stepRow(2, "wait", "Aguardando liberação",
        "<p>Estamos preparando o acesso desta conta. Você não precisa fazer nada: esta tela atualiza sozinha quando estiver pronto.</p>");

  let s3;
  if (!approved) {
    s3 = stepRow(3, "locked", "Aceitar o convite no Instagram");
  } else if (!opened) {
    s3 = IS_MOBILE
      ? mobileInviteStep(id, user, copiedIds.has(String(row.id)))
      : stepRow(3, "active", "Aceite o convite no Instagram",
          "<p>Clique no botão, entre com a conta <strong>@" + user + "</strong> e, na aba <strong>“Convites do testador”</strong>, clique em <strong>Aceitar</strong>.</p>" +
          '<button type="button" class="btn btn-primary btn-full igw-btn" data-igw="open-invite" data-id="' + id + '">Abrir o Instagram</button>' +
          helpSteps(user));
  } else {
    s3 = stepRow(3, "done", "Convite aceito no Instagram",
      "<p>Aceitou o convite? Então siga para o passo 4. Não conseguiu? " +
      (IS_MOBILE
        ? '<button type="button" class="igw-link" data-igw="redo-invite" data-id="' + id + '">Ver o passo a passo de novo</button>'
        : '<button type="button" class="igw-link" data-igw="open-invite" data-id="' + id + '">Abrir de novo</button>') +
      "</p>" + (IS_MOBILE ? "" : helpSteps(user)));
  }

  const s4 = opened
    ? stepRow(4, "active", "Conecte sua conta",
        "<p>Agora é só tocar no botão e autorizar o acesso no Instagram.</p>" +
        '<button type="button" class="btn btn-primary btn-full igw-btn" data-igw="connect">Conectar minha conta</button>' +
        '<p class="igw-note">Se o Instagram avisar que não foi possível conectar, volte ao passo 3 e confira se aceitou o convite.</p>')
    : stepRow(4, "locked", "Conectar a conta");

  return '<div class="igw-card">' + head + stepRow(1, "done", "@ enviado") + s2 + s3 + s4 + "</div>";
}

function limitBanner() {
  return (
    '<div class="igw-limit"><p><strong>Seu plano está no limite de contas.</strong> ' +
    "Para conectar mais uma, chame a gente no WhatsApp e atualizamos seu plano.</p>" +
    '<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="' +
    escapeHtml(whatsappHref("Olá! Quero conectar mais uma conta do Instagram no Respondi e preciso aumentar meu plano.")) +
    '">Falar no WhatsApp</a></div>'
  );
}

function render() {
  const root = $("#igTesterOnboarding");
  if (!root) return;

  // Mantém o que o usuário já digitou (a tela se redesenha sozinha quando algo muda).
  const prev = $("#igTesterUsernameInput");
  const keepValue = prev ? prev.value : "";
  const hadFocus = prev && document.activeElement === prev;

  let html = "<h2>Conectar Instagram</h2>";

  if (!loaded) {
    html += '<div class="loading-row">Carregando…</div>';
    root.innerHTML = html;
    return;
  }

  html += '<p class="igw-sub">É rápido: é só ir clicando nos botões, um de cada vez.</p>';
  if (loadError) html += '<div class="banner error">' + escapeHtml(loadError) + "</div>";
  if (limitHit) html += limitBanner();

  const hasAny = requests.length > 0 || connectedCount > 0;
  html += requests.map(requestCard).join("");

  if (!hasAny) {
    html += newAccountCard(false, false);
  } else if (showForm) {
    html += newAccountCard(true, true);
  } else {
    html += '<button type="button" class="btn btn-outline btn-full igw-btn igw-add" data-igw="add">+ Adicionar outra conta</button>';
  }

  html +=
    '<p class="igw-help-foot">Precisa de ajuda? <a target="_blank" rel="noopener" href="' +
    escapeHtml(whatsappHref("Olá! Preciso de ajuda para conectar meu Instagram no Respondi.")) +
    '">Chame no WhatsApp</a></p>';

  root.innerHTML = html;

  const input = $("#igTesterUsernameInput");
  if (input) {
    input.value = keepValue;
    if (hadFocus) input.focus();
  }
}

/* ------------------------------ dados ------------------------------ */
async function fetchConnectedUsernames(userId) {
  const { data, error } = await supabase
    .from(CONNECTED_TABLE)
    .select("instagram_username")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set(
    data
      .map((row) => normalizeUsername(row.instagram_username))
      .filter(Boolean)
  );
}

async function loadRequests(userId) {
  const [requestsResult, connectedUsernames] = await Promise.all([
    supabase
      .from(TABLE)
      .select("id, instagram_username, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    fetchConnectedUsernames(userId),
  ]);

  const { data, error } = requestsResult;
  loaded = true;
  connectedCount = connectedUsernames.size;
  if (error) {
    loadError = "Erro ao carregar suas contas: " + error.message;
    requests = [];
    render();
    return;
  }
  loadError = "";

  // Não muda o status no banco — só esconde da lista o @ que já foi
  // conectado de verdade (via OAuth), porque pra ele não sobrou mais
  // nada pendente de fazer. Se o mesmo @ aparece mais de uma vez
  // (ex.: foi rejeitado e pedido de novo), vale só a solicitação mais recente.
  const seen = new Set();
  requests = (data || []).filter((row) => {
    const u = normalizeUsername(row.instagram_username);
    if (connectedUsernames.has(u) || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  render();
}

function listenForChanges(userId) {
  stopListening();
  realtimeChannel = supabase
    .channel("instagram_tester_requests_user_" + userId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: "user_id=eq." + userId },
      () => loadRequests(userId)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: CONNECTED_TABLE, filter: "user_id=eq." + userId },
      () => loadRequests(userId)
    )
    .subscribe();
}

function stopListening() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

/* ------------------------------ ações ------------------------------ */
function setError(message) {
  formError = message || "";
  const el = $("#igTesterFormError");
  if (!el) return;
  el.textContent = formError;
  el.classList.toggle("hidden", !formError);
}

async function handleSubmit(event) {
  event.preventDefault();
  setError("");

  if (!currentUserId) {
    setError("Sua sessão expirou. Atualize a página e faça login novamente.");
    return;
  }

  const input = $("#igTesterUsernameInput");
  const username = normalizeUsername(input ? input.value : "");
  if (!username || username.length < 2) {
    setError("Digite o @ da sua conta do Instagram.");
    return;
  }

  const submitBtn = $("#igTesterSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
  }

  try {
    const { error } = await supabase.from(TABLE).insert({
      user_id: currentUserId,
      instagram_username: username,
      status: "pendente",
    });

    if (error) {
      // Já existe uma solicitação ativa (pendente/aprovada) pra esse @ — não é um erro grave.
      if (error.code === "23505") {
        setError("Esse @ já está cadastrado e em andamento.");
      } else {
        throw error;
      }
    } else {
      showForm = false;
      formError = "";
      await loadRequests(currentUserId);
      return;
    }
  } catch (error) {
    setError("Não foi possível enviar: " + error.message);
  }
  const btn = $("#igTesterSubmitBtn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Enviar meu @";
  }
}

// Passo 4: aciona o botão de conexão do app.js (escondido da tela).
function connectNow() {
  const realBtn = document.getElementById("addIgAccountBtn");
  if (!realBtn) return;
  if (realBtn.disabled) {
    // Limite de contas do plano atingido.
    limitHit = true;
    render();
    return;
  }
  realBtn.click();
}

function onClick(event) {
  const t = event.target.closest("[data-igw]");
  if (!t) return;
  const act = t.getAttribute("data-igw");

  if (act === "open-invite") {
    // window.open precisa rodar dentro do próprio clique (senão o navegador bloqueia).
    window.open(INVITES_URL, "_blank", "noopener");
    openedIds.add(String(t.getAttribute("data-id")));
    saveOpened();
    render();
  } else if (act === "open-mobile") {
    // Tem que rodar dentro do próprio clique, senão o navegador bloqueia.
    copiedIds.add(String(t.getAttribute("data-id"))); // = "já abriu o Instagram"
    saveSet(LINK_OPENED_KEY, copiedIds); // salva ANTES de sair da página
    openInBrowser();
    render();
  } else if (act === "copy-link") {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(INVITES_URL).catch(() => {});
    } catch (_e) {}
    const box = t.parentElement && t.parentElement.querySelector(".igw-linkbox");
    if (box) box.select();
    t.textContent = "Copiado!";
  } else if (act === "accepted") {
    openedIds.add(String(t.getAttribute("data-id")));
    saveOpened();
    render();
  } else if (act === "redo-invite") {
    const rid = String(t.getAttribute("data-id"));
    openedIds.delete(rid);
    copiedIds.add(rid);
    saveOpened();
    saveSet(LINK_OPENED_KEY, copiedIds);
    render();
  } else if (act === "connect") {
    connectNow();
  } else if (act === "add") {
    const realBtn = document.getElementById("addIgAccountBtn");
    if (realBtn && realBtn.disabled) {
      limitHit = true;
    } else {
      limitHit = false;
      showForm = true;
      formError = "";
    }
    render();
    const input = $("#igTesterUsernameInput");
    if (input) input.focus();
  } else if (act === "retry") {
    limitHit = false;
    showForm = true;
    formError = "";
    render();
    const input = $("#igTesterUsernameInput");
    if (input) input.focus();
  } else if (act === "cancel") {
    showForm = false;
    formError = "";
    render();
  }
}

/* ------------------------------ bootstrap ------------------------------ */
async function start() {
  if (currentUserId) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !session.user) return;

  currentUserId = session.user.id;
  await loadRequests(currentUserId);
  listenForChanges(currentUserId);
}

function bootstrap() {
  const root = $("#igTesterOnboarding");
  if (!root) return; // markup não presente nesta página — não faz nada

  injectStyles();
  root.classList.add("igw");
  root.addEventListener("click", onClick);
  root.addEventListener("submit", (event) => {
    if (event.target.matches("[data-igw-form]")) handleSubmit(event);
  });
  render();

  start();
  // Ao voltar do Instagram para esta aba, relê o estado salvo e atualiza a tela.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    readSet(LINK_OPENED_KEY).forEach((id) => copiedIds.add(id));
    readSet(OPENED_KEY).forEach((id) => openedIds.add(id));
    if (loaded) render();
  });
  // Se o login acontecer depois da página abrir, começa nesse momento.
  supabase.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") {
      stopListening();
      currentUserId = null;
      loaded = false;
      requests = [];
      connectedCount = 0;
      showForm = false;
      render();
      return;
    }
    if (s && !currentUserId) setTimeout(start, 0);
  });
}

document.addEventListener("DOMContentLoaded", bootstrap);
