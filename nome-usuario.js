// nome-usuario.js
// "Humaniza" a plataforma: guarda e usa o NOME das pessoas (além do e-mail).
// Módulo isolado (mesmo padrão dos outros): injeta a UI sozinho; só precisa da tag
//   <script type="module" src="nome-usuario.js"></script>      (index.html do painel)
//   <script type="module" src="../nome-usuario.js"></script>   (parceiros/index.html)
// Requer nome-usuario.sql já rodado no Supabase.
//
// O que faz:
//  1) Tela "criar senha" do convite: pede "Seu nome" (obrigatório).
//  2) Quem já tem conta e ainda não tem nome: uma janelinha "Como podemos te chamar?".
//  3) Admin > Convidar: campo opcional "Nome" (grava no perfil depois do convite).
//  4) Expõe window.NomeUsuario (setByEmail / mapByEmail / mapById) para os outros módulos.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// Só LÊ a sessão que o app.js / parceiro.js estabeleceu.
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PENDING = "respondi-pending-nome";
const DISMISS = "respondi-nome-dispensado";
const hash = () => window.location.hash || "";
const isInvite = () => /type=invite/.test(hash());
const isInviteOrRecovery = () => /type=(invite|recovery)/.test(hash());
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 80);

/* ----------------------- helpers para outros módulos ----------------------- */
async function setByEmail(email, nome) {
  nome = clean(nome);
  if (!nome) return true;
  email = String(email || "").trim().toLowerCase();
  // O perfil é criado pelo convite e pode levar um instante para existir.
  for (let i = 0; i < 6; i++) {
    const { data, error } = await sb.from("profiles").update({ nome }).eq("email", email).select("id");
    if (error) return false;
    if (data && data.length) return true;
    await sleep(800);
  }
  return false;
}

async function mapBy(column, values) {
  const list = [...new Set((values || []).filter(Boolean).map((v) => String(v)))];
  if (!list.length) return {};
  try {
    const { data, error } = await sb.from("profiles").select("id, email, nome").in(column, list);
    if (error || !data) return {};
    const out = {};
    data.forEach((p) => {
      const n = clean(p.nome);
      if (n) out[column === "email" ? String(p.email).toLowerCase() : p.id] = n;
    });
    return out;
  } catch (_) {
    return {};
  }
}
const mapByEmail = (emails) => mapBy("email", (emails || []).map((e) => String(e || "").toLowerCase()));
const mapById = (ids) => mapBy("id", ids);

window.NomeUsuario = { setByEmail, mapByEmail, mapById };

/* ------------------- campo "Seu nome" na tela de criar senha ------------------- */
function fieldHtml(id, label, placeholder) {
  return '<label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" autocomplete="name" maxlength="80" placeholder="' + placeholder + '" />';
}

function injectSetPasswordField() {
  if (!isInvite()) return; // recuperação de senha: a pessoa já tem nome
  [
    { pass: "newPassword", id: "newName" },
    { pass: "pcNewPassword", id: "pcNewName" },
  ].forEach((c) => {
    const pass = $(c.pass);
    if (!pass || $(c.id)) return;
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = fieldHtml(c.id, "Seu nome", "Como podemos te chamar?");
    (pass.closest(".field") || pass).insertAdjacentElement("beforebegin", wrap);
  });
  prefillName();
}

// Se o admin já informou o nome no convite, já vem preenchido (a pessoa pode corrigir).
async function prefillName() {
  for (const wait of [700, 1800, 3500]) {
    await sleep(wait);
    const input = $("newName") || $("pcNewName");
    if (!input || input.value) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) continue;
      const { data } = await sb.from("profiles").select("nome").eq("id", session.user.id).maybeSingle();
      if (data && clean(data.nome)) { input.value = clean(data.nome); return; }
    } catch (_) {}
  }
}

function showBannerFor(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = "banner error";
}

// Captura o clique em "salvar senha" ANTES do app.js / parceiro.js.
document.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest && e.target.closest("#setPasswordBtn, #pcSetPasswordBtn");
    if (!btn) return;
    const input = $("newName") || $("pcNewName");
    if (!input) return; // fluxo sem campo de nome (ex.: recuperar senha)
    const nome = clean(input.value);
    if (nome.length < 2) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showBannerFor(btn.id === "pcSetPasswordBtn" ? "pcSetBanner" : "setPasswordBanner", "Digite seu nome para continuar.");
      input.focus();
      return;
    }
    try { sessionStorage.setItem(PENDING, nome); } catch (_) {}
    // Tenta gravar já; se a sessão ainda não estiver pronta, o ensure() tenta de novo depois.
    sb.rpc("set_my_name", { p_nome: nome }).then((r) => {
      if (!r.error) { try { sessionStorage.removeItem(PENDING); } catch (_) {} announce(nome); }
    });
  },
  true
);

/* ----------------- janelinha "Como podemos te chamar?" (contas antigas) ----------------- */
function announce(nome) {
  window.dispatchEvent(new CustomEvent("user-nome-changed", { detail: { nome } }));
  const label = $("userEmailLabel");
  if (label) label.textContent = nome;
  const avatar = $("userAvatar");
  if (avatar) avatar.textContent = nome.charAt(0).toUpperCase();
}

function appVisible() {
  const a = $("appScreen") || $("pcApp");
  return !!a && !a.classList.contains("hidden");
}

function showModal() {
  if ($("nomeModal")) return;
  const m = document.createElement("div");
  m.id = "nomeModal";
  m.className = "modal-overlay";
  m.innerHTML =
    '<div class="modal-box"><div class="modal-header"><h2>Como podemos te chamar?</h2></div>' +
    '<div class="modal-body">' +
    '<p class="field-hint" style="margin-top:0">Queremos te atender pelo nome, não só pelo e-mail.</p>' +
    '<div id="nomeMsg" class="banner hidden"></div>' +
    '<div class="field">' + fieldHtml("nomeInput", "Seu nome", "Ex.: Maria Silva") + "</div>" +
    '</div><div style="display:flex;gap:.5rem;justify-content:flex-end;padding:0 1.25rem 1.25rem">' +
    '<button type="button" class="btn btn-outline" id="nomeLater">Agora não</button>' +
    '<button type="button" class="btn btn-primary" id="nomeSave">Salvar</button></div></div>';
  document.body.appendChild(m);
  const input = $("nomeInput");
  input.focus();

  const close = () => m.remove();
  $("nomeLater").addEventListener("click", () => {
    try { sessionStorage.setItem(DISMISS, "1"); } catch (_) {}
    close();
  });
  const save = async () => {
    const nome = clean(input.value);
    const msg = $("nomeMsg");
    if (nome.length < 2) {
      msg.textContent = "Digite seu nome.";
      msg.className = "banner error";
      return;
    }
    $("nomeSave").disabled = true;
    const { error } = await sb.rpc("set_my_name", { p_nome: nome });
    if (error) {
      msg.textContent = "Não foi possível salvar: " + error.message;
      msg.className = "banner error";
      $("nomeSave").disabled = false;
      return;
    }
    announce(nome);
    close();
  };
  $("nomeSave").addEventListener("click", save);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}

let busy = false;
async function ensure() {
  if (busy) return;
  busy = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data: prof, error } = await sb.from("profiles").select("nome").eq("id", session.user.id).maybeSingle();
    if (error || !prof) return; // coluna ainda não existe (SQL não rodado) ou sem perfil
    if (clean(prof.nome)) { try { sessionStorage.removeItem(PENDING); } catch (_) {} return; }

    let pend = null;
    try { pend = sessionStorage.getItem(PENDING); } catch (_) {}
    if (pend) {
      const r = await sb.rpc("set_my_name", { p_nome: pend });
      if (!r.error) { try { sessionStorage.removeItem(PENDING); } catch (_) {} announce(pend); }
      return;
    }
    if (isInviteOrRecovery()) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS) === "1"; } catch (_) {}
    if (dismissed) return;

    for (let i = 0; i < 20 && !appVisible(); i++) await sleep(500); // espera o painel aparecer
    if (appVisible()) showModal();
  } catch (_) {
    /* silencioso: nunca atrapalha o painel */
  } finally {
    busy = false;
  }
}

/* ------------------ admin: campo "Nome" no convite do painel ------------------ */
function injectInviteField() {
  const email = $("inviteEmail");
  if (!email || $("inviteNome")) return;
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = '<label for="inviteNome">Nome (opcional)</label><input type="text" id="inviteNome" maxlength="80" placeholder="Nome do cliente" />';
  (email.closest(".field") || email).insertAdjacentElement("beforebegin", wrap);
}

document.addEventListener("DOMContentLoaded", () => {
  injectSetPasswordField();
  injectInviteField();
  setTimeout(injectInviteField, 1500);
  setTimeout(ensure, 1200);
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") return;
    if (s) setTimeout(ensure, 800);
  });
});
