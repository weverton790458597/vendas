import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";
const findKey = () => { try { return Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k)); } catch (e) { return undefined; } };
const storageKey = window.AP_AUTH_KEY || findKey();
const sb = window.sb || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: Object.assign({ persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }, storageKey ? { storageKey } : {}),
});
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const month = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—");
const badge = (txt, cls) => '<span class="badge ' + cls + '">' + esc(txt) + "</span>";
const refLink = (code) => new URL("indicacao.html?ref=" + encodeURIComponent(code), location.href).href;
const SUBS = [["resumo", "Resumo"], ["clientes", "Clientes"], ["financeiro", "Financeiro"], ["perfil", "Meu perfil"]];
let user = null, dash = null, isAdmin = false, ready = false, sub = "resumo";
function table(heads, rows, empty) {
  if (!rows.length) return '<div class="empty-state">' + empty + "</div>";
  return '<div class="pt-scroll"><table><thead><tr>' + heads.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}
function banner(text, type) {
  const el = $("ptBanner");
  if (!el) return;
  el.textContent = text || "";
  el.className = "banner" + (text ? " " + (type || "error") : "");
}
async function loadDash() {
  const { data, error } = await sb.rpc("parceiro_dashboard");
  if (error) throw error;
  return data;
}
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ready = false; user = null; dash = null; isAdmin = false; return false; }
  if (ready && user && user.id === session.user.id) return true;
  user = session.user;
  dash = null;
  const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  isAdmin = !!(prof && prof.is_admin);
  const seg = $("partnersSegBtn");
  if (seg) seg.classList.toggle("hidden", !isAdmin);
  ready = true;
  return true;
}
function showPartnersTab() {
  document.querySelectorAll(".app-main .tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "tab-partners"));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === "partners"));
}
async function openPartners() {
  const host = $("ptHost");
  host.innerHTML = '<div class="loading-row">Carregando…</div>';
  try {
    if (!(await init())) { host.innerHTML = '<div class="empty-state">Faça login para ver esta área.</div>'; return; }
    dash = await loadDash();
  } catch (e) {
    host.innerHTML = '<div class="empty-state">Não foi possível carregar: ' + esc(e.message) + "</div>";
    return;
  }
  render();
}
function render() {
  const host = $("ptHost");
  if (!dash) {
    host.innerHTML =
      '<div class="page-head panel-heading-row"><div><h1>Indique e ganhe</h1><p>Vire parceiro e receba comissão recorrente de cada cliente que você indicar.</p></div></div>' +
      '<div id="ptBanner" class="banner"></div>' +
      '<section class="panel pt-form"><h2>Quero ser parceiro</h2>' +
      '<div class="field"><label for="ptRegNome">Nome completo</label><input id="ptRegNome" autocomplete="name" /></div>' +
      '<div class="field"><label for="ptRegWhats">WhatsApp</label><input id="ptRegWhats" inputmode="tel" placeholder="(98) 90000-0000" /></div>' +
      '<button type="button" class="btn btn-primary" id="ptRegBtn">Criar cadastro de parceiro</button>' +
      '<p class="pt-note">Nossa equipe aprova o seu cadastro e o seu link de indicação é liberado.</p></section>';
    return;
  }
  const p = dash.parceiro, ativo = p.status === "ativo";
  const tag = ativo ? "Ativo" : p.status === "pendente" ? "Aguardando aprovação" : "Suspenso";
  const ativos = dash.clientes.filter((c) => c.ativo).length;
  const views = {};
  views.resumo =
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
      : '<p class="pt-note">Disponível após a aprovação do cadastro.</p>') + "</div>";
  views.clientes =
    '<div class="pt-section"><h2>Meus clientes</h2>' +
    table(["E-mail", "Desde", "Plano", "Pagamento", "Acesso"],
      dash.clientes.map((c) => [esc(c.email), date(c.desde), c.plano ? brl(c.plano) : "—",
        badge(c.pagamento === "em_dia" ? "Em dia" : c.pagamento === "atrasado" ? "Atrasado" : c.pagamento || "—",
          c.pagamento === "em_dia" ? "badge-ativo" : c.pagamento === "atrasado" ? "badge-danger" : "badge-muted"),
        badge(c.ativo ? "Ativo" : "Inativo", c.ativo ? "badge-ativo" : "badge-inativo")]),
      "Nenhum cliente cadastrado pelo seu link ainda.") + "</div>" +
    '<div class="pt-section"><h2>Indicações aguardando cadastro</h2>' +
    table(["Nome", "E-mail", "Indicado em"], dash.leads.map((l) => [esc(l.nome || "—"), esc(l.email), date(l.em)]), "Nenhuma indicação pendente.") + "</div>";
  views.financeiro =
    '<div class="pt-section"><h2>Comissões</h2>' +
    table(["Competência", "Cliente", "Base", "%", "Comissão", "Status"],
      dash.comissoes.map((c) => [month(c.competencia), esc(c.cliente || "—"), brl(c.base), Number(c.pct) + "%", "<b>" + brl(c.valor) + "</b>",
        badge(c.status === "pago" ? "Pago" : "A receber", c.status === "pago" ? "badge-ativo" : "badge-muted")]),
      "Ainda não há comissões. Elas aparecem quando um cliente seu paga a mensalidade.") + "</div>" +
    '<div class="pt-section"><h2>Pagamentos recebidos</h2>' +
    table(["Data", "Valor", "Observação"], dash.repasses.map((r) => [date(r.em), "<b>" + brl(r.valor) + "</b>", esc(r.obs || "—")]), "Nenhum repasse feito ainda.") + "</div>";
  views.perfil =
    '<div class="pt-form panel"><h2>Meus dados</h2>' +
    '<div class="field"><label for="pfNome">Nome</label><input id="pfNome" value="' + esc(p.nome) + '" /></div>' +
    '<div class="field"><label for="pfWhats">WhatsApp</label><input id="pfWhats" value="' + esc(p.whatsapp) + '" /></div>' +
    '<div class="field"><label for="pfPix">Chave Pix para receber</label><input id="pfPix" value="' + esc(p.chave_pix) + '" placeholder="CPF, e-mail, telefone ou chave aleatória" />' +
    '<p class="field-hint">É nessa chave que vamos pagar suas comissões.</p></div>' +
    '<button type="button" class="btn btn-primary" id="pfSaveBtn">Salvar</button>' +
    '<p class="pt-note">Seu código de parceiro: <b>' + esc(p.codigo) + "</b></p></div>";
  host.innerHTML =
    '<div class="page-head panel-heading-row"><div><h1>Parceiros</h1><p>Indique o Achei &amp; Postei e ganhe comissão recorrente.</p></div><span class="pt-tag">' + tag + "</span></div>" +
    '<div id="ptBanner" class="banner"></div>' +
    '<nav class="seg-nav" id="ptSubNav">' + SUBS.map((s) => '<button type="button" class="seg-btn' + (s[0] === sub ? " active" : "") + '" data-psub="' + s[0] + '">' + s[1] + "</button>").join("") + "</nav>" +
    '<div class="pt-sub">' + views[sub] + "</div>";
  banner(ativo ? "" : p.status === "pendente"
    ? "Seu cadastro está em análise. Assim que for aprovado, seu link de indicação é liberado."
    : "Seu acesso de parceiro está suspenso. Fale com o suporte.", "error");
}
async function registrar() {
  const nome = $("ptRegNome").value.trim();
  if (nome.length < 3) return banner("Informe seu nome completo.");
  const btn = $("ptRegBtn");
  btn.disabled = true;
  const r = await sb.rpc("parceiro_registrar", { p_nome: nome, p_whatsapp: $("ptRegWhats").value.trim() || null });
  btn.disabled = false;
  if (r.error) return banner("Erro ao cadastrar: " + r.error.message);
  try { dash = await loadDash(); } catch (e) { return banner(e.message); }
  sub = "resumo";
  render();
}
async function saveProfile() {
  const btn = $("pfSaveBtn");
  btn.disabled = true;
  const { error } = await sb.rpc("parceiro_atualizar", { p_nome: $("pfNome").value, p_whatsapp: $("pfWhats").value, p_pix: $("pfPix").value });
  btn.disabled = false;
  if (error) return banner("Erro ao salvar: " + error.message);
  try { dash = await loadDash(); } catch (e) { return banner(e.message); }
  render();
  banner("Dados salvos.", "success");
}
async function copyRef() {
  const input = $("ptRefInput");
  try { await navigator.clipboard.writeText(input.value); } catch (err) { input.select(); document.execCommand("copy"); }
  const b = $("ptCopyBtn");
  b.textContent = "Copiado!";
  setTimeout(() => { const x = $("ptCopyBtn"); if (x) x.textContent = "Copiar link"; }, 1500);
}
async function loadAdmin() {
  const host = $("seg-partners");
  if (!host) return;
  host.innerHTML = '<div class="loading-row">Carregando…</div>';
  const { data, error } = await sb.rpc("admin_parceiros_overview");
  if (error) { host.innerHTML = '<div class="empty-state">Erro: ' + esc(error.message) + "</div>"; return; }
  const st = { ativo: "badge-ativo", pendente: "badge-muted", suspenso: "badge-danger" };
  host.innerHTML =
    '<section class="panel panel-plain"><div class="panel-heading-row"><h2>Parceiros</h2><button type="button" class="btn btn-outline btn-sm" data-ptadm="refresh">Atualizar</button></div>' +
    table(["Parceiro", "Código", "%", "Clientes", "A pagar", "Pago", "Status", "Ações"],
      data.parceiros.map((p) => [
        "<b>" + esc(p.nome) + "</b><br><span class='pt-muted'>" + esc(p.email) + (p.pix ? " · Pix: " + esc(p.pix) : " · sem Pix") + "</span>",
        esc(p.codigo), Number(p.pct) + "%", p.clientes, brl(p.a_pagar), brl(p.pago), badge(p.status, st[p.status] || "badge-muted"),
        '<div class="pt-actions">' +
        (p.status !== "ativo"
          ? '<button type="button" class="btn btn-primary btn-sm" data-ptadm="status" data-st="ativo" data-id="' + esc(p.id) + '" data-pct="' + esc(p.pct) + '">Aprovar</button>'
          : '<button type="button" class="btn btn-danger-ghost btn-sm" data-ptadm="status" data-st="suspenso" data-id="' + esc(p.id) + '" data-pct="' + esc(p.pct) + '">Suspender</button>') +
        '<button type="button" class="btn btn-outline btn-sm" data-ptadm="pct" data-id="' + esc(p.id) + '" data-st="' + esc(p.status) + '" data-pct="' + esc(p.pct) + '">Editar %</button>' +
        (Number(p.a_pagar) > 0 ? '<button type="button" class="btn btn-outline btn-sm" data-ptadm="pay" data-id="' + esc(p.id) + '" data-nome="' + esc(p.nome) + '" data-val="' + esc(p.a_pagar) + '">Registrar pagamento</button>' : "") +
        "</div>"]),
      "Nenhum parceiro cadastrado.") + "</section>" +
    '<section class="panel panel-plain"><div class="panel-heading-row"><h2>Indicações aguardando convite</h2></div>' +
    '<p class="pt-note">Use o e-mail no convite. O vínculo com o parceiro é automático quando o cliente é criado.</p>' +
    table(["E-mail", "Nome", "WhatsApp", "Parceiro", "Em", ""],
      data.leads.map((l) => [esc(l.email), esc(l.nome || "—"), esc(l.whatsapp || "—"), esc(l.parceiro), date(l.em),
        '<button type="button" class="btn btn-primary btn-sm" data-ptadm="invite" data-email="' + esc(l.email) + '">Usar no convite</button>']),
      "Nenhuma indicação pendente.") + "</section>";
}
async function adminAction(btn) {
  const a = btn.dataset.ptadm, id = btn.dataset.id;
  if (a === "refresh") return loadAdmin();
  if (a === "invite") {
    const seg = document.querySelector('#tab-admin .seg-btn[data-seg="seg-invites"]');
    if (seg) seg.click();
    setTimeout(() => {
      const input = $("inviteEmail");
      if (input) { input.value = btn.dataset.email; input.focus(); input.dispatchEvent(new Event("input", { bubbles: true })); }
    }, 50);
    return;
  }
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
function showAdminSeg() {
  const tab = $("tab-admin");
  if (!tab) return;
  tab.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.seg === "seg-partners"));
  tab.querySelectorAll(".seg-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "seg-partners"));
}
document.addEventListener("click", async (e) => {
  const t = e.target;
  const navBtn = t.closest(".nav-item, [data-tab]");
  if (navBtn) {
    if (navBtn.dataset.tab === "partners") {
      setTimeout(showPartnersTab, 0);
      openPartners();
    } else {
      setTimeout(() => { const p = $("tab-partners"); if (p) p.classList.add("hidden"); }, 0);
    }
  }
  const segBtn = t.closest("#tab-admin .seg-btn");
  if (segBtn) {
    if (segBtn.dataset.seg === "seg-partners") {
      setTimeout(showAdminSeg, 0);
      await init();
      loadAdmin();
    } else {
      setTimeout(() => { const p = $("seg-partners"); if (p) p.classList.add("hidden"); }, 0);
    }
  }
  const subBtn = t.closest("#ptSubNav [data-psub]");
  if (subBtn) { sub = subBtn.dataset.psub; render(); return; }
  if (t.closest("#ptRegBtn")) return registrar();
  if (t.closest("#pfSaveBtn")) return saveProfile();
  if (t.closest("#ptCopyBtn")) return copyRef();
  const adm = t.closest("[data-ptadm]");
  if (adm) adminAction(adm);
});
const appScreen = $("appScreen");
function onScreenChange() {
  if (!appScreen) return;
  if (appScreen.classList.contains("hidden")) {
    ready = false; user = null; dash = null; isAdmin = false; sub = "resumo";
    const seg = $("partnersSegBtn");
    if (seg) seg.classList.add("hidden");
    return;
  }
  init().catch(() => {});
}
if (appScreen) {
  new MutationObserver(onScreenChange).observe(appScreen, { attributes: true, attributeFilter: ["class"] });
  onScreenChange();
}
