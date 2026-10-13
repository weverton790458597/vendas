// alterar-senha.js
// 1) Botão 🔑 no topo (ao lado do "Sair") para o usuário logado trocar a própria senha.
// 2) Link "Esqueci minha senha" na tela de login (envia e-mail de recuperação; o
//    app.js já sabe tratar o link type=recovery e pedir a nova senha).
// Módulo isolado: injeta tudo sozinho, só precisa da tag <script type="module">.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// Só LÊ a sessão do app.js (não renova token, não processa link) — mesmo padrão dos outros módulos.
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});
// Client descartável só para CONFERIR a senha atual (não grava sessão nenhuma).
const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);

function injectModal() {
  if ($("pwModal")) return;
  const m = document.createElement("div");
  m.id = "pwModal";
  m.className = "modal-overlay hidden";
  m.innerHTML =
    '<div class="modal-box"><div class="modal-header"><h2>Alterar senha</h2>' +
    '<button type="button" class="modal-close" id="pwClose" aria-label="Fechar">&times;</button></div>' +
    '<div class="modal-body">' +
    '<div id="pwMsg" class="banner hidden"></div>' +
    '<div class="field"><label for="pwCurrent">Senha atual</label><input type="password" id="pwCurrent" autocomplete="current-password" /></div>' +
    '<div class="field"><label for="pwNew">Nova senha</label><input type="password" id="pwNew" autocomplete="new-password" placeholder="Mínimo 6 caracteres" /></div>' +
    '<div class="field"><label for="pwConfirm">Repita a nova senha</label><input type="password" id="pwConfirm" autocomplete="new-password" /></div>' +
    '<label class="field-hint" style="display:flex;gap:.4rem;align-items:center;cursor:pointer"><input type="checkbox" id="pwShow" /> Mostrar senhas</label>' +
    '<p class="field-hint">Esqueceu a senha atual? Saia, e na tela de login use "Esqueci minha senha".</p>' +
    '</div><div class="modal-footer" style="display:flex;gap:.5rem;justify-content:flex-end;padding:0 1.25rem 1.25rem">' +
    '<button type="button" class="btn btn-outline" id="pwCancel">Cancelar</button>' +
    '<button type="button" class="btn btn-primary" id="pwSave">Salvar nova senha</button></div></div>';
  document.body.appendChild(m);

  const close = () => m.classList.add("hidden");
  $("pwClose").addEventListener("click", close);
  $("pwCancel").addEventListener("click", close);
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  $("pwShow").addEventListener("change", (e) => {
    ["pwCurrent", "pwNew", "pwConfirm"].forEach((id) => ($(id).type = e.target.checked ? "text" : "password"));
  });
  $("pwSave").addEventListener("click", save);
}

function msg(text, type) {
  const el = $("pwMsg");
  el.textContent = text;
  el.className = "banner " + type;
}

async function save() {
  const cur = $("pwCurrent").value;
  const nw = $("pwNew").value;
  const cf = $("pwConfirm").value;
  if (!cur) return msg("Digite sua senha atual.", "error");
  if (nw.length < 6) return msg("A nova senha precisa ter pelo menos 6 caracteres.", "error");
  if (nw !== cf) return msg("As senhas novas não são iguais.", "error");
  if (nw === cur) return msg("A nova senha precisa ser diferente da atual.", "error");

  const btn = $("pwSave");
  btn.disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sua sessão expirou. Atualize a página e entre novamente.");

    const check = await verifier.auth.signInWithPassword({ email: session.user.email, password: cur });
    if (check.error) throw new Error("Senha atual incorreta.");

    const { error } = await sb.auth.updateUser({ password: nw });
    if (error) throw new Error(error.message);

    msg("Senha alterada com sucesso!", "success");
    ["pwCurrent", "pwNew", "pwConfirm"].forEach((id) => ($(id).value = ""));
    setTimeout(() => $("pwModal").classList.add("hidden"), 1600);
  } catch (e) {
    msg(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function openModal() {
  injectModal();
  $("pwMsg").className = "banner hidden";
  ["pwCurrent", "pwNew", "pwConfirm"].forEach((id) => { $(id).value = ""; $(id).type = "password"; });
  $("pwShow").checked = false;
  $("pwModal").classList.remove("hidden");
  $("pwCurrent").focus();
}

function injectHeaderButton() {
  const logout = $("logoutBtn");
  if (!logout || $("changePwBtn")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "changePwBtn";
  b.className = "icon-btn";
  b.title = "Alterar senha";
  b.setAttribute("aria-label", "Alterar senha");
  b.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M17 6l3 3"/><path d="M15 8l2 2"/></svg>';
  b.addEventListener("click", openModal);
  logout.insertAdjacentElement("beforebegin", b);
}

/* ---------- Esqueci minha senha (tela de login) ---------- */
function injectForgot() {
  const submit = $("authSubmitBtn");
  if (!submit || $("forgotPwBtn")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "forgotPwBtn";
  b.className = "btn btn-outline btn-full";
  b.style.marginTop = ".5rem";
  b.textContent = "Esqueci minha senha";
  b.addEventListener("click", async () => {
    const email = ($("authEmail").value || "").trim();
    const banner = $("authBanner");
    const show = (t, type) => { if (banner) { banner.textContent = t; banner.className = "banner " + type; } };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show("Digite seu e-mail no campo acima e clique de novo.", "error");
    b.disabled = true;
    const { error } = await verifier.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    b.disabled = false;
    if (error) return show("Não foi possível enviar: " + error.message, "error");
    show("Se esse e-mail tiver cadastro, enviamos um link para criar uma nova senha.", "success");
  });
  submit.insertAdjacentElement("afterend", b);
}

document.addEventListener("DOMContentLoaded", () => {
  injectForgot();
  injectHeaderButton();
  // O header só ganha vida depois do login; tenta de novo quando a sessão muda.
  sb.auth.onAuthStateChange(() => setTimeout(injectHeaderButton, 0));
  setTimeout(injectHeaderButton, 1500);
});
