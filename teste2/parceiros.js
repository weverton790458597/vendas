// parceiros.js — Painel de parceiros/afiliados. Isolado do app.js.
// Sessão SEPARADA do painel principal (storageKey próprio), então logar aqui
// não derruba nem mistura com o login do Achei & Postei.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "ap-parceiros-auth" },
});

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const month = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—");

let mode = "login", dash = null, isAdmin = false, user = null;

function banner(id, text, type) {
  const el = $(id);
  el.textContent = text || "";
  el.className = "banner" + (text ? " " + (type || "error") : "");
}
function showScreen(name) {
  $("pAuth").classList.toggle("hidden", name !== "auth");
  $("pApp").classList.toggle("hidden", name !== "app");
}
function table(heads, rows, empty) {
  if (!rows.length) return '<div class="empty-state">' + empty + "</div>";
  return '<div class="pt-scroll"><table><thead><tr>' + heads.map((h) => "<th>" + h + "</th>").join("") +
    "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}
const badge = (txt, cls) => '<span class="badge ' + cls + '">' + esc(txt) + "</span>";

/* ---------------- Auth ---------------- */
function setMode(m) {
  mode = m;
  document.querySelectorAll("#ptAuthTabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  document.querySelectorAll(".pt-signup").forEach((e) => e.classList.toggle("hidden", m !== "signup"));
  $("ptAuthBtn").textContent = m === "signup" ? "Criar conta" : "Entrar";
  $("ptSenha").autocomplete = m === "signup" ? "new-password" : "current-password";
  banner("ptAuthBanner", "");
}

async function submitAuth() {
  const email = $("ptEmail").value.trim().toLowerCase();
  const senha = $("ptSenha").value;
  if (!email || !senha) return banner("ptAuthBanner", "Informe e-mail e senha.");
  $("ptAuthBtn").disabled = true;
  try {
    if (mode === "signup") {
      const nome = $("ptNome").value.trim();
      if (nome.length < 3) throw new Error("Informe seu nome completo.");
      if (senha.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres.");
      const { data, error } = await sb.auth.signUp({
        email, password: senha,
        options: { data: { parceiro_nome: nome, parceiro_whatsapp: $("ptWhats").value.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        banner("ptAuthBanner", "Conta criada! Confirme seu e-mail e depois entre aqui.", "success");
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("E-mail ou senha incorretos.");
    }
    await boot();
  } catch (e) {
    banner("ptAuthBanner", e.message);
  } finally {
    $("ptAuthBtn").disabled = false;
  }
}

/* ---------------- Boot ---------------- */
async function loadDash() {
  const { data, error } = await sb.rpc("parceiro_dashboard");
  if (error) throw error;
  return data;
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showScreen("auth");
  user = session.user;
  try {
    dash = await loadDash();
    // 1º login depois de confirmar o e-mail: cria o cadastro de parceiro a partir dos dados do signup.
    const meta = user.user_metadata || {};
    if (!dash && meta.parceiro_nome) {
      const r = await sb.rpc("parceiro_registrar", { p_nome: meta.parceiro_nome, p_whatsapp: meta.parceiro_whatsapp || null });
      if (r.error) throw r.error;
      dash = await loadDash();
    }
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    isAdmin = !!(prof && prof.is_admin);
  } catch (e) {
    showScreen("auth");
    return banner("ptAuthBanner", "Não foi possível carregar: " + e.message);
  }
  if (!dash && !isAdmin) {
    await sb.auth.signOut();
    showScreen("auth");
    return banner("ptAuthBanner", "Esta conta não está cadastrada como parceiro. Use “Criar conta de parceiro”.");
  }
  $("ptUserEmail").textContent = user.email;
  showScreen("app");
  setupTabs();
  render();
  if (isAdmin) loadAdmin();
}

function setupTabs() {
  const hasPartner = !!dash;
  document.querySelectorAll("#ptNav button").forEach((b) => {
    const t = b.dataset.ptab;
    b.classList.toggle("hidden", t === "admin" ? !isAdmin : !hasPartner);
  });
  openTab(hasPartner ? "resumo" : "admin");
}
function openTab(name) {
  document.querySelectorAll("#ptNav button").forEach((b) => b.classList.toggle("active", b.dataset.ptab === name));
  document.querySelectorAll(".pt-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "pt-" + name));
}

/* ---------------- Render parceiro ---------------- */
function refLink(code) {
  return new URL("indicacao.html?ref=" + encodeURIComponent(code), location.href).href;
}

function render() {
  if (!dash) return;
  const p = dash.parceiro;
  const ativo = p.status === "ativo";
  $("ptStatusTag").textContent = ativo ? "Ativo" : p.status === "pendente" ? "Aguardando aprovação" : "Suspenso";
  banner("ptBanner", ativo ? "" : p.status === "pendente"
    ? "Seu cadastro está em análise. Assim que for aprovado, seu link de indicação é liberado."
    : "Seu acesso de parceiro está suspenso. Fale com o suporte.", "error");

  const ativos = dash.clientes.filter((c) => c.ativo).length;
  $("pt-resumo").innerHTML =
    '<div class="pt-kpis">' +
    '<div class="pt-kpi accent"><b>' + brl(dash.a_receber) + "</b><span>A receber</span></div>" +
    '<div class="pt-kpi"><b>' + brl(dash.recebido) + "</b><span>Já recebido</span></div>" +
    '<div class="pt-kpi"><b>' + brl(Number(dash.a_receber) + Number(dash.recebido)) + "</b><span>Total gerado</span></div>" +
    '<div class="pt-kpi"><b>' + ativos + "/" + dash.clientes.length + "</b><span>Clientes ativos / total</span></div>" +
    '<div class="pt-kpi"><b>' + dash.leads.length + "</b><span>Indicações aguardando cadastro</span></div></div>" +
    '<div class="pt-section"><h2>Seu link de indicação</h2>' +
    (ativo
      ? '<div class="pt-link"><input id="ptRefInput" readonly value="' + esc(refLink(p.codigo)) + '" />' +
        '<button type="button" class="btn btn-primary" id="ptCopyBtn">Copiar link</button>' +
        '<a class="btn btn-outline" target="_blank" rel="noopener" href="https://wa.me/?text=' +
        encodeURIComponent("Conheça o Achei & Postei — automação de comentários e DM do Instagram: " + refLink(p.codigo)) + '">Enviar no WhatsApp</a></div>' +
        '<p class="pt-note">Você ganha ' + Number(p.pct) + "% de cada mensalidade paga pelos clientes que se cadastrarem pelo seu link.</p>"
      : '<p class="pt-note">Disponível após a aprovação do cadastro.</p>') +
    "</div>";

  $("pt-clientes").innerHTML =
    '<div class="pt-section"><h2>Meus clientes</h2>' +
    table(["E-mail", "Desde", "Plano", "Pagamento", "Acesso"],
      dash.clientes.map((c) => [esc(c.email), date(c.desde), c.plano ? brl(c.plano) : "—",
        badge(c.pagamento === "em_dia" ? "Em dia" : c.pagamento === "atrasado" ? "Atrasado" : c.pagamento || "—",
          c.pagamento === "em_dia" ? "badge-ativo" : c.pagamento === "atrasado" ? "badge-danger" : "badge-muted"),
        badge(c.ativo ? "Ativo" : "Inativo", c.ativo ? "badge-ativo" : "badge-inativo")]),
      "Nenhum cliente cadastrado pelo seu link ainda.") + "</div>" +
    '<div class="pt-section"><h2>Indicações aguardando cadastro</h2>' +
    table(["Nome", "E-mail", "Indicado em"], dash.leads.map((l) => [esc(l.nome || "—"), esc(l.email), date(l.em)]),
      "Nenhuma indicação pendente.") + "</div>";

  $("pt-financeiro").innerHTML =
    '<div class="pt-section"><h2>Comissões</h2>' +
    table(["Competência", "Cliente", "Base", "%", "Comissão", "Status"],
      dash.comissoes.map((c) => [month(c.competencia), esc(c.cliente || "—"), brl(c.base), Number(c.pct) + "%", "<b>" + brl(c.valor) + "</b>",
        badge(c.status === "pago" ? "Pago" : "A receber", c.status === "pago" ? "badge-ativo" : "badge-muted")]),
      "Ainda não há comissões. Elas aparecem quando um cliente seu paga a mensalidade.") + "</div>" +
    '<div class="pt-section"><h2>Pagamentos recebidos</h2>' +
    table(["Data", "Valor", "Observação"], dash.repasses.map((r) => [date(r.em), "<b>" + brl(r.valor) + "</b>", esc(r.obs || "—")]),
      "Nenhum repasse feito ainda.") + "</div>";

  $("pt-perfil").innerHTML =
    '<div class="pt-form panel"><h2>Meus dados</h2>' +
    '<div class="field"><label for="pfNome">Nome</label><input id="pfNome" value="' + esc(p.nome) + '" /></div>' +
    '<div class="field"><label for="pfWhats">WhatsApp</label><input id="pfWhats" value="' + esc(p.whatsapp) + '" /></div>' +
    '<div class="field"><label for="pfPix">Chave Pix para receber</label><input id="pfPix" value="' + esc(p.chave_pix) + '" placeholder="CPF, e-mail, telefone ou chave aleatória" />' +
    '<p class="field-hint">É nessa chave que vamos pagar suas comissões.</p></div>' +
    '<button type="button" class="btn btn-primary" id="pfSaveBtn">Salvar</button>' +
    '<p class="pt-note">Seu código de parceiro: <b>' + esc(p.codigo) + "</b></p></div>";
}

async function saveProfile() {
  const btn = $("pfSaveBtn");
  btn.disabled = true;
  const { error } = await sb.rpc("parceiro_atualizar", { p_nome: $("pfNome").value, p_whatsapp: $("pfWhats").value, p_pix: $("pfPix").value });
  btn.disabled = false;
  if (error) return banner("ptBanner", "Erro ao salvar: " + error.message);
  dash = await loadDash();
  render();
  openTab("perfil");
  banner("ptBanner", "Dados salvos.", "success");
}

/* ---------------- Admin ---------------- */
async function loadAdmin() {
  const host = $("pt-admin");
  host.innerHTML = '<div class="loading-row">Carregando…</div>';
  const { data, error } = await sb.rpc("admin_parceiros_overview");
  if (error) { host.innerHTML = '<div class="empty-state">Erro: ' + esc(error.message) + "</div>"; return; }
  const st = { ativo: "badge-ativo", pendente: "badge-muted", suspenso: "badge-danger" };
  host.innerHTML =
    '<div class="pt-section"><h2>Parceiros</h2>' +
    table(["Parceiro", "Código", "%", "Clientes", "A pagar", "Pago", "Status", "Ações"],
      data.parceiros.map((p) => [
        "<b>" + esc(p.nome) + "</b><br><span class='pt-muted'>" + esc(p.email) + (p.pix ? " · Pix: " + esc(p.pix) : " · sem Pix") + "</span>",
        esc(p.codigo), Number(p.pct) + "%", p.clientes, brl(p.a_pagar), brl(p.pago), badge(p.status, st[p.status] || "badge-muted"),
        '<div class="pt-actions">' +
        (p.status !== "ativo" ? '<button class="btn btn-primary btn-sm" data-adm="status" data-st="ativo" data-id="' + p.id + '" data-pct="' + p.pct + '">Aprovar</button>' : '<button class="btn btn-danger-ghost btn-sm" data-adm="status" data-st="suspenso" data-id="' + p.id + '" data-pct="' + p.pct + '">Suspender</button>') +
        '<button class="btn btn-outline btn-sm" data-adm="pct" data-id="' + p.id + '" data-st="' + p.status + '" data-pct="' + p.pct + '">Editar %</button>' +
        (Number(p.a_pagar) > 0 ? '<button class="btn btn-outline btn-sm" data-adm="pay" data-id="' + p.id + '" data-nome="' + esc(p.nome) + '" data-val="' + p.a_pagar + '">Registrar pagamento</button>' : "") +
        "</div>"]),
      "Nenhum parceiro cadastrado.") + "</div>" +
    '<div class="pt-section"><h2>Indicações aguardando convite</h2>' +
    '<p class="pt-note">Convide o e-mail pelo painel normal (Admin → Convidar). O vínculo com o parceiro é automático.</p>' +
    table(["E-mail", "Nome", "WhatsApp", "Parceiro", "Em", ""],
      data.leads.map((l) => [esc(l.email), esc(l.nome || "—"), esc(l.whatsapp || "—"), esc(l.parceiro), date(l.em),
        '<button class="btn btn-outline btn-sm" data-adm="copy" data-email="' + esc(l.email) + '">Copiar e-mail</button>']),
      "Nenhuma indicação pendente.") + "</div>";
}

async function adminAction(btn) {
  const a = btn.dataset.adm, id = btn.dataset.id;
  if (a === "copy") { try { await navigator.clipboard.writeText(btn.dataset.email); btn.textContent = "Copiado!"; } catch (e) {} return; }
  let res;
  if (a === "status") {
    if (btn.dataset.st === "suspenso" && !confirm("Suspender este parceiro? Novos pagamentos dos clientes dele deixam de gerar comissão.")) return;
    res = await sb.rpc("admin_set_parceiro", { p_id: id, p_status: btn.dataset.st, p_pct: Number(btn.dataset.pct) });
  } else if (a === "pct") {
    const v = prompt("Nova comissão (%) — vale para pagamentos futuros:", btn.dataset.pct);
    if (v == null) return;
    const n = parseFloat(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return alert("Valor inválido.");
    res = await sb.rpc("admin_set_parceiro", { p_id: id, p_status: btn.dataset.st, p_pct: n });
  } else if (a === "pay") {
    if (!confirm("Registrar pagamento de " + brl(btn.dataset.val) + " para " + btn.dataset.nome + "?\n\nFaça o Pix antes — isso marca todas as comissões pendentes como pagas.")) return;
    res = await sb.rpc("admin_pagar_parceiro", { p_id: id, p_obs: "Pix" });
  }
  if (res && res.error) return alert("Erro: " + res.error.message);
  loadAdmin();
}

/* ---------------- Eventos ---------------- */
document.addEventListener("click", async (e) => {
  const t = e.target;
  const tab = t.closest("#ptAuthTabs button"); if (tab) return setMode(tab.dataset.mode);
  const nav = t.closest("#ptNav button"); if (nav) { banner("ptBanner", ""); render(); return openTab(nav.dataset.ptab); }
  if (t.closest("#ptAuthBtn")) return submitAuth();
  if (t.closest("#ptLogout")) { await sb.auth.signOut(); dash = null; showScreen("auth"); return; }
  if (t.closest("#pfSaveBtn")) return saveProfile();
  if (t.closest("#ptCopyBtn")) {
    const input = $("ptRefInput");
    try { await navigator.clipboard.writeText(input.value); } catch (err) { input.select(); document.execCommand("copy"); }
    $("ptCopyBtn").textContent = "Copiado!"; setTimeout(() => { const b = $("ptCopyBtn"); if (b) b.textContent = "Copiar link"; }, 1500);
    return;
  }
  const adm = t.closest("[data-adm]"); if (adm) adminAction(adm);
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("pAuth").classList.contains("hidden")) submitAuth(); });
document.addEventListener("DOMContentLoaded", boot);
