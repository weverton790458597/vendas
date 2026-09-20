// app.js — Achei & Postei (Redesign 2026)
// Core application logic: auth, session, tabs, automations, users, FAB, responsive sync.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbG...tEmU";
const INSTAGRAM_APP_ID = "1432929018522131";
const INSTAGRAM_REDIRECT_URI = SUPABASE_URL + "/functions/v1/instagram-oauth-callback";
const INSTAGRAM_SCOPES =
  "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  db: { schema: "public" },
});

let currentUser = null;
let currentProfile = null;
let currentUserTable = null;
let allAutomations = [];
let allUsers = [];
let currentIgAccounts = [];
let isMobileView = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

/* ------------------------------------------------------------------
   Utility helpers
------------------------------------------------------------------- */
function showBanner(elId, message, type) {
  const el = $(`#${elId}`);
  if (!el) return;
  el.textContent = message;
  el.className = `banner ${type}`;
  setTimeout(() => { el.className = "banner"; }, 5000);
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function truncateUrl(url, maxLen) {
  return url.length <= maxLen ? url : url.substring(0, maxLen) + "...";
}

function extractShortcode(input) {
  if (!input.includes("instagram.com")) return input.trim();
  const cleanUrl = input.split("?")[0];
  const match = cleanUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ap-theme", theme);
}

function toggleBottomNavVisibility() {
  const adminBtn = $("#bottomNavAdmin");
  if (adminBtn) {
    adminBtn.style.display = currentProfile?.is_admin ? "flex" : "none";
  }
  isMobileView = window.innerWidth <= 768;
  syncBottomNavState();
}

function syncBottomNavState() {
  if (!isMobileView) return;
  const activeTab = $(".nav-item.active")?.getAttribute("data-tab") || "dashboard";
  $$(".bottom-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === activeTab);
  });
  if (currentProfile?.is_admin) {
    $("#bottomNavAdmin").style.display = "flex";
  }
}

/* ------------------------------------------------------------------
   Theme toggle
------------------------------------------------------------------- */
$$("[data-theme-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
});

/* ------------------------------------------------------------------
   Auth flows
------------------------------------------------------------------- */
$("#authSubmitBtn").addEventListener("click", async () => {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  if (!email || !password) {
    showBanner("authBanner", "Preencha e-mail e senha.", "error");
    return;
  }
  $("#authSubmitBtn").disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await bootstrapSession();
  } catch (error) {
    showBanner("authBanner", error.message, "error");
  } finally {
    $("#authSubmitBtn").disabled = false;
  }
});

$("#blockedLogoutBtn").addEventListener("click", () =>
  supabase.auth.signOut().then(() => location.reload())
);
$("#logoutBtn").addEventListener("click", () =>
  supabase.auth.signOut().then(() => location.reload())
);

function isInviteOrRecoveryLink() {
  const hash = window.location.hash || "";
  return hash.includes("type=invite") || hash.includes("type=recovery");
}

$("#setPasswordBtn").addEventListener("click", async () => {
  const newPassword = $("#newPassword").value;
  if (!newPassword || newPassword.length < 6) {
    showBanner("setPasswordBanner", "A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }
  $("#setPasswordBtn").disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    history.replaceState(null, "", window.location.pathname);
    await bootstrapSession();
  } catch (error) {
    showBanner("setPasswordBanner", error.message, "error");
  } finally {
    $("#setPasswordBtn").disabled = false;
  }
});

function handleInstagramOauthReturn() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("ig_connected");
  const error = params.get("ig_error");
  if (connected) showBanner("statusBanner", "Instagram conectado com sucesso!", "success");
  else if (error) showBanner("statusBanner", "Erro ao conectar Instagram: " + error, "error");
  if (connected || error) {
    params.delete("ig_connected");
    params.delete("ig_error");
    const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    history.replaceState(null, "", clean);
  }
}

/* ------------------------------------------------------------------
   Session bootstrap
------------------------------------------------------------------- */
async function bootstrapSession() {
  if (isInviteOrRecoveryLink()) {
    showScreen("setPassword");
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showScreen("auth");
    return;
  }
  currentUser = session.user;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error || !profile) {
    showBanner("authBanner", "Erro ao carregar perfil. Tente novamente.", "error");
    showScreen("auth");
    return;
  }
  currentProfile = profile;
  currentUserTable = profile.automacoes_table_name;
  if (!profile.is_active) {
    showScreen("blocked");
    return;
  }
  $("#userEmailLabel").textContent = currentUser.email;
  $("#userAvatar").textContent = currentUser.email.charAt(0).toUpperCase();
  $("#topUserAvatar").textContent = currentUser.email.charAt(0).toUpperCase();
  $("#adminTabBtn").classList.toggle("hidden", !profile.is_admin);
  showScreen("app");
  handleInstagramOauthReturn();
  await loadIgConfig();
  await loadAutomations();
  setupTopBarTitles();
}

function showScreen(name) {
  $("#authScreen").classList.toggle("hidden", name !== "auth");
  $("#setPasswordScreen").classList.toggle("hidden", name !== "setPassword");
  $("#blockedScreen").classList.toggle("hidden", name !== "blocked");
  $("#appScreen").classList.toggle("hidden", name !== "app");
  if (name === "app") {
    toggleBottomNavVisibility();
    syncBottomNavState();
  }
}

/* ------------------------------------------------------------------
   Tab navigation (sidebar + bottom nav sync)
------------------------------------------------------------------- */
function switchTab(tab) {
  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  $$(".view").forEach((view) => {
    view.classList.toggle("hidden", view.id !== `tab-${tab}`);
    view.classList.toggle("active", view.id === `tab-${tab}`);
  });
  if (tab === "admin") loadUsers();
  if (tab === "accounts") loadIgConfig();
  syncBottomNavState();
  setupTopBarTitles();
}

$("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    switchTab(tab);
  });
});

function setupTopBarTitles() {
  const titles = {
    dashboard: "Automações",
    accounts: "Contas do Instagram",
    admin: "Administração",
  };
  const subtitles = {
    dashboard: "Palavras-chave em comentários viram links de produto no Direct automaticamente.",
    accounts: "Conecte as contas profissionais que vão responder comentários e enviar Direct.",
    admin: "Convide clientes e gerencie o acesso à plataforma.",
  };
  const activeTab = $(".nav-item.active")?.getAttribute("data-tab") || "dashboard";
  $("#topBarTitle").textContent = titles[activeTab] || "Automações";
  $("#topBarSubtitle").textContent = subtitles[activeTab] || "";
}

/* ------------------------------------------------------------------
   Instagram connect
------------------------------------------------------------------- */
function suggestPlanValue(limit) {
  const n = Number(limit) || 1;
  if (n <= 1) return 49.9;
  if (n <= 3) return 79.9;
  return Math.round((79.9 + (n - 3) * 19.9) * 100) / 100;
}

async function startInstagramConnect(configId) {
  try {
    const insertPayload = { user_id: currentUser.id };
    if (configId) insertPayload.instagram_config_id = configId;
    const { data, error } = await supabase
      .from("oauth_states")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) throw error;
    const params = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      response_type: "code",
      scope: INSTAGRAM_SCOPES,
      state: data.id,
    });
    window.location.href = "https://api.instagram.com/oauth/authorize?" + params.toString();
  } catch (error) {
    showBanner("statusBanner", "Não foi possível iniciar a conexão: " + error.message, "error");
  }
}

async function disconnectIgAccount(configId) {
  if (!confirm("Tem certeza que deseja desconectar esta conta do Instagram?")) return;
  try {
    const { error } = await supabase
      .from("instagram_config")
      .delete()
      .eq("id", configId)
      .eq("user_id", currentUser.id);
    if (error) throw error;
    showBanner("statusBanner", "Instagram desconectado.", "success");
    await loadIgConfig();
  } catch (error) {
    showBanner("statusBanner", "Erro ao desconectar: " + error.message, "error");
  }
}

function renderIgAccounts() {
  const list = $("#igAccountsList");
  const footer = $("#igStatusFooter");
  const limitText = $("#igLimitText");
  const addBtn = $("#addIgAccountBtn");
  if (!list || !footer || !limitText || !addBtn) return;
  const limit = (currentProfile && currentProfile.ig_account_limit) || 1;
  const count = currentIgAccounts.length;
  if (count === 0) {
    list.innerHTML = `
      <div class="ig-status-row">
        <span class="ig-dot ig-dot-off"></span>
        <div class="ig-status-text">
          <strong>Instagram não conectado</strong>
          <p>Conecte sua conta profissional para ativar as respostas automáticas.</p>
        </div>
      </div>`;
  } else {
    list.innerHTML = currentIgAccounts
      .map((acc) => {
        const username = acc.instagram_username ? "@" + escapeHtml(acc.instagram_username) : "Conta conectada";
        const automationsCount = (acc.automations_count || 0);
        return `
          <div class="ig-account-card" data-id="${acc.id}">
            <div class="ig-account-header">
              <span class="ig-dot ig-dot-on"></span>
              <strong>${username}</strong>
              <span class="ig-account-badge">${automationsCount} automação${automationsCount !== 1 ? "s" : ""}</span>
            </div>
            <div class="ig-account-actions">
              <button class="btn btn-outline btn-sm ig-reconnect-btn" data-id="${acc.id}">Reconectar</button>
              <button class="btn btn-danger-ghost btn-sm ig-disconnect-btn" data-id="${acc.id}">Desconectar</button>
            </div>
          </div>`;
      })
      .join("");
  }
  list.classList.remove("hidden");
  $$(".ig-reconnect-btn").forEach((btn) =>
    btn.addEventListener("click", () => startInstagramConnect(btn.getAttribute("data-id")))
  );
  $$(".ig-disconnect-btn").forEach((btn) =>
    btn.addEventListener("click", () => disconnectIgAccount(btn.getAttribute("data-id")))
  );
  const atLimit = count >= limit;
  addBtn.textContent = count === 0 ? "Conectar Instagram" : "+ Adicionar conta do Instagram";
  addBtn.disabled = atLimit;
  addBtn.title = atLimit
    ? "Limite de contas do seu plano atingido. Fale com o suporte para aumentar o limite."
    : "";
  limitText.textContent =
    `${count} de ${limit} conta${limit === 1 ? "" : "s"} do plano em uso` +
    (atLimit ? " — limite atingido" : "");
  footer.classList.remove("hidden");
  updateAutomationIgSelector();
  renderIgHealth();
}

function renderIgHealth() {
  const healthList = $("#igHealthList");
  if (!healthList) return;
  if (currentIgAccounts.length === 0) {
    healthList.innerHTML =
      '<li class="health-item"><span class="health-dot health-dot-off"></span>' +
      "<span class='health-label'>Nenhuma conta conectada</span>" +
      '<span class="health-status danger">Revisar</span></li>';
    return;
  }
  healthList.innerHTML = currentIgAccounts
    .map((acc) => {
      const username = acc.instagram_username ? "@" + escapeHtml(acc.instagram_username) : "Conta conectada";
      return `<li class="health-item">
        <span class="health-dot health-dot-ok"></span>
        <span class="health-label">${username}</span>
        <span class="health-status success">Conectada</span>
      </li>`;
    })
    .join("");
}

function updateAutomationIgSelector() {
  const field = $("#automationIgAccountField");
  const select = $("#automationIgAccount");
  if (!field || !select) return;
  if (currentIgAccounts.length <= 1) {
    field.classList.add("hidden");
    select.innerHTML = currentIgAccounts[0]
      ? `<option value="${currentIgAccounts[0].id}">@${escapeHtml(currentIgAccounts[0].instagram_username || currentIgAccounts[0].id)}</option>`
      : "";
    return;
  }
  field.classList.remove("hidden");
  select.innerHTML = currentIgAccounts
    .map((acc) => {
      const label = acc.instagram_username
        ? "@" + escapeHtml(acc.instagram_username)
        : "Conta " + acc.id.slice(0, 8);
      return `<option value="${acc.id}">${label}</option>`;
    })
    .join("");
}

async function loadIgConfig() {
  const loading = $("#igLoadingStatus");
  if (!loading) return;
  loading.classList.remove("hidden");
  $("#igAccountsList").classList.add("hidden");
  $("#igStatusFooter").classList.add("hidden");
  try {
    const { data, error } = await supabase
      .from("instagram_config")
      .select("id, instagram_business_account_id, instagram_username, instagram_followers, instagram_media_publish, instagram_comment_count, automations_count")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    currentIgAccounts = data || [];
    renderIgAccounts();
  } catch (error) {
    console.error(error.message);
    currentIgAccounts = [];
    renderIgAccounts();
  } finally {
    loading.classList.add("hidden");
  }
}

$("#addIgAccountBtn").addEventListener("click", () => startInstagramConnect());
$("#refreshIgBtn").addEventListener("click", loadIgConfig);

/* ------------------------------------------------------------------
   Automations
------------------------------------------------------------------- */
function updateAutomationKpis(rows) {
  const total = rows.length;
  const ativas = rows.filter((r) => r.ativo).length;
  const pausadas = total - ativas;
  const linksEnviados = rows.reduce((sum, r) => sum + (Number(r.links_enviados) || 0), 0);
  $("#kpiTotal").textContent = total;
  $("#kpiAtivas").textContent = ativas;
  $("#kpiPausadas").textContent = pausadas;
  $("#kpiLinksEnviados").textContent = linksEnviados;
}

function renderAutomations(rows) {
  const grid = $("#automationsTableBody");
  if (!grid) return;
  if (!rows || rows.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhuma automação encontrada. Cadastre a primeira acima.</div>';
    return;
  }
  grid.innerHTML = rows
    .map((row) => {
      const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
      const statusText = row.ativo ? "Ativo" : "Inativo";
      const created = new Date(row.created_at).toLocaleString("pt-BR");
      const igAccount = currentIgAccounts.length > 1
        ? `<span class="automation-ig-account">@${escapeHtml(row.instagram_username || "")}</span>`
        : "";
      return `
        <div class="automation-card" data-id="${row.id}">
          <div class="automation-card-top">
            <span class="badge ${statusClass}">${statusText}</span>
            <div class="automation-card-actions">
              <button class="icon-btn toggle-btn" title="${row.ativo ? "Desativar" : "Ativar"}" data-active="${row.ativo}">
                <span class="toggle-slider" data-on="${row.ativo}"></span>
              </button>
              <button class="icon-btn delete-btn" title="Excluir">🗑️</button>
            </div>
          </div>
          <div class="automation-card-keyword">
            <span class="keyword-chip">${escapeHtml(row.palavra_chave)}</span>
            ${igAccount}
          </div>
          <div class="automation-card-post">Post: ${escapeHtml(truncateUrl(row.instagram_media_id, 34))}</div>
          <a class="automation-card-link" href="${escapeHtml(row.produto_url)}" target="_blank" rel="noopener">
            ${escapeHtml(truncateUrl(row.produto_url, 40))}
          </a>
          <div class="automation-card-footer">Criado em ${created}</div>
        </div>`;
    })
    .join("");

  // Toggle switches
  $$(".toggle-slider").forEach((slider) => {
    slider.addEventListener("click", toggleActive);
  });
  $$(".delete-btn").forEach((btn) => btn.addEventListener("click", deleteAutomation));
}

async function loadAutomations() {
  const loading = $("#loadingAutomations");
  if (!loading) return;
  loading.classList.remove("hidden");
  $("#automationsTableBody").innerHTML = "";
  if (!currentUserTable) {
    $("#automationsTableBody").innerHTML =
      '<div class="empty-state">Erro: tabela de automações não encontrada para sua conta. Contate o administrador.</div>';
    loading.classList.add("hidden");
    return;
  }
  try {
    const { data, error } = await supabase
      .from(currentUserTable)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    allAutomations = data || [];
    updateAutomationKpis(allAutomations);
    renderAutomations(allAutomations);
  } catch (error) {
    showBanner("statusBanner", "Erro ao carregar automações: " + error.message, "error");
  } finally {
    loading.classList.add("hidden");
  }
}

$("#automationSearch").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) {
    renderAutomations(allAutomations);
    return;
  }
  const filtered = allAutomations.filter(
    (r) =>
      (r.palavra_chave || "").toLowerCase().includes(term) ||
      (r.produto_url || "").toLowerCase().includes(term) ||
      (r.instagram_media_id || "").toLowerCase().includes(term)
  );
  renderAutomations(filtered);
});

// Global search from top bar
$("#globalSearch").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  const activeTab = $(".nav-item.active")?.getAttribute("data-tab");
  if (!term) {
    if (activeTab === "dashboard") renderAutomations(allAutomations);
    if (activeTab === "admin") renderUsers(allUsers);
    return;
  }
  if (activeTab === "dashboard") {
    renderAutomations(
      allAutomations.filter(
        (r) =>
          (r.palavra_chave || "").toLowerCase().includes(term) ||
          (r.produto_url || "").toLowerCase().includes(term) ||
          (r.instagram_media_id || "").toLowerCase().includes(term)
      )
    );
  }
  if (activeTab === "admin") {
    renderUsers(allUsers.filter((u) => (u.email || "").toLowerCase().includes(term)));
  }
});

async function toggleActive(event) {
  const slider = event.currentTarget;
  const card = slider.closest(".automation-card");
  const id = card.getAttribute("data-id");
  const currentAtivo = slider.getAttribute("data-on") === "true";
  slider.setAttribute("data-on", String(!currentAtivo));
  slider.classList.add("pulse");
  setTimeout(() => slider.classList.remove("pulse"), 1200);
  try {
    const { error } = await supabase
      .from(currentUserTable)
      .update({ ativo: !currentAtivo })
      .eq("id", id);
    if (error) throw error;
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao alternar status: " + error.message, "error");
  }
}

async function deleteAutomation(event) {
  const card = event.currentTarget.closest(".automation-card");
  const id = card.getAttribute("data-id");
  if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
  try {
    const { error } = await supabase.from(currentUserTable).delete().eq("id", id);
    if (error) throw error;
    showBanner("statusBanner", "Automação excluída.", "success");
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao excluir: " + error.message, "error");
  }
}

$("#toggleImagemUrlBtn").addEventListener("click", () => {
  $("#imagemUrlField").classList.toggle("hidden");
});

$("#saveAutomationBtn").addEventListener("click", async () => {
  const mediaIdInput = $("#instagramMediaId");
  const palavraChaveInput = $("#palavraChave");
  const produtoUrlInput = $("#produtoUrl");
  const imagemUrlInput = $("#imagemUrl");
  const tituloProdutoInput = $("#tituloProduto");
  const mediaIdRaw = mediaIdInput.value.trim();
  const palavraChave = palavraChaveInput.value.trim();
  const produtoUrl = produtoUrlInput.value.trim();
  const imagemUrl = imagemUrlInput.value.trim() || null;
  const tituloProduto = tituloProdutoInput.value.trim() || null;
  const igAccountId = $("#automationIgAccount").value || null;
  if (!mediaIdRaw || !palavraChave || !produtoUrl) {
    showBanner("statusBanner", "Todos os campos são obrigatórios.", "error");
    return;
  }
  if (currentIgAccounts.length === 0) {
    showBanner("statusBanner", "Conecte uma conta do Instagram antes de criar uma automação.", "error");
    return;
  }
  if (currentIgAccounts.length > 1 && !igAccountId) {
    showBanner("statusBanner", "Selecione a conta do Instagram desta automação.", "error");
    return;
  }
  const shortcode = extractShortcode(mediaIdRaw);
  $("#saveAutomationBtn").disabled = true;
  try {
    const { error } = await supabase.from(currentUserTable).insert({
      instagram_media_id: shortcode,
      palavra_chave: palavraChave,
      produto_url: produtoUrl,
      imagem_url: imagemUrl,
      titulo_produto: tituloProduto,
      instagram_config_id: igAccountId,
      ativo: true,
    });
    if (error) throw error;
    showBanner("statusBanner", "Automação salva com sucesso!", "success");
    mediaIdInput.value = "";
    palavraChaveInput.value = "";
    produtoUrlInput.value = "";
    imagemUrlInput.value = "";
    tituloProdutoInput.value = "";
    $("#imagemUrlField").classList.add("hidden");
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao salvar automação: " + error.message, "error");
  } finally {
    $("#saveAutomationBtn").disabled = false;
  }
});

/* ------------------------------------------------------------------
   Admin: Users
------------------------------------------------------------------- */
function updateAdminKpis(rows) {
  const total = rows.length;
  const active = rows.filter((u) => u.is_active).length;
  const mrr = rows
    .filter((u) => u.payment_status === "em_dia")
    .reduce((sum, u) => sum + (Number(u.monthly_plan_value) || 0), 0);
  const late = rows.filter((u) => u.payment_status === "atrasado").length;
  $("#kpiUsers").textContent = total;
  $("#kpiActiveUsers").textContent = active;
  $("#kpiMrr").textContent = "R$ " + mrr.toFixed(2).replace(".", ",");
  $("#kpiLate").textContent = late;
}

function renderUsers(rows) {
  const tbody = $("#usersTableBody");
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum usuário encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((u) => {
      const statusClass = u.is_active ? "badge-ativo" : "badge-inativo";
      const statusText = u.is_active ? "Ativo" : "Inativo";
      const created = new Date(u.created_at).toLocaleString("pt-BR");
      let paymentBadge = "";
      const ps = u.payment_status;
      if (ps === "em_dia") {
        paymentBadge = '<span class="badge badge-ativo">Em dia</span>';
      } else if (ps === "atrasado") {
        paymentBadge = '<span class="badge badge-danger">Atrasado</span>';
      } else if (ps === "cancelado") {
        paymentBadge = '<span class="badge badge-muted">Cancelado</span>';
      } else {
        paymentBadge = '<span class="badge badge-muted">—</span>';
      }
      const dueDateStr = u.payment_due_date
        ? new Date(u.payment_due_date).toLocaleDateString("pt-BR")
        : "—";
      const planValueStr = u.monthly_plan_value
        ? "R$ " + Number(u.monthly_plan_value).toFixed(2).replace(".", ",")
        : "—";
      const disableSelfToggle = u.id === currentUser?.id
        ? 'disabled title="Você não pode desativar a própria conta"'
        : "";
      return `
        <tr data-id="${u.id}">
          <td>${escapeHtml(u.email)}${u.is_admin ? ' <span class="badge badge-ativo">admin</span>' : ""}</td>
          <td>${created}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>${paymentBadge}</td>
          <td>${escapeHtml(dueDateStr)}</td>
          <td>${escapeHtml(planValueStr)}</td>
          <td>${u.ig_account_limit || 1}</td>
          <td class="table-actions">
            <button class="btn btn-outline btn-sm user-toggle-btn" ${disableSelfToggle} data-active="${u.is_active}">
              ${u.is_active ? "Desativar" : "Ativar"}
            </button>
            <button class="btn btn-outline btn-sm edit-payment-btn" data-user-id="${u.id}">Editar cobrança</button>
            <button class="btn btn-outline btn-sm view-autos-btn" data-user-id="${u.id}">Ver automações</button>
          </td>
        </tr>`;
    })
    .join("");
  $$(".user-toggle-btn").forEach((btn) => btn.addEventListener("click", toggleUserActive));
  $$(".edit-payment-btn").forEach((btn) => btn.addEventListener("click", openEditPaymentModal));
  $$(".view-autos-btn").forEach((btn) => btn.addEventListener("click", openViewAutosModal));
}

async function loadUsers() {
  const loading = $("#loadingUsers");
  if (!loading) return;
  loading.classList.remove("hidden");
  $("#usersTableBody").innerHTML = "";
  try {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    allUsers = data || [];
    updateAdminKpis(allUsers);
    renderUsers(allUsers);
  } catch (error) {
    showBanner("statusBanner", "Erro ao carregar usuários: " + error.message, "error");
  } finally {
    loading.classList.add("hidden");
  }
}

$("#userSearch").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) {
    renderUsers(allUsers);
    return;
  }
  renderUsers(allUsers.filter((u) => (u.email || "").toLowerCase().includes(term)));
});

async function toggleUserActive(event) {
  const row = event.currentTarget.closest("tr");
  const id = row.getAttribute("data-id");
  const currentActive = event.currentTarget.getAttribute("data-active") === "true";
  try {
    const { error } = await supabase.from("profiles").update({ is_active: !currentActive }).eq("id", id);
    if (error) throw error;
    await loadUsers();
  } catch (error) {
    showBanner("statusBanner", "Erro ao alternar status do usuário: " + error.message, "error");
  }
}

/* ------------------------------------------------------------------
   Modals
------------------------------------------------------------------- */
function closeModal() {
  const overlay = $(".modal-overlay");
  if (overlay) overlay.remove();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

async function openEditPaymentModal(event) {
  const userId = event.currentTarget.getAttribute("data-user-id");
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "editPaymentModal";
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2>Editar cobrança</h2>
        <button class="modal-close" id="closeEditPaymentModal" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">
        <p class="modal-sub">Alterando os dados de cobrança para <strong>${escapeHtml(userId)}</strong>.</p>
        <div class="field">
          <label>Status de pagamento</label>
          <select id="editPaymentStatus">
            <option value="em_dia">Em dia</option>
            <option value="atrasado">Atrasado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div class="field">
          <label for="editPaymentDue">Vencimento</label>
          <input type="date" id="editPaymentDue" />
        </div>
        <div class="field">
          <label for="editPaymentValue">Valor do plano (R$)</label>
          <input type="number" id="editPaymentValue" step="0.01" min="0" placeholder="0,00" />
        </div>
        <div class="field">
          <label for="editIgLimit">Limite de contas do Instagram</label>
          <input type="number" id="editIgLimit" step="1" min="1" placeholder="1" />
          <p class="field-hint">1 conta = R$49,90 · até 3 contas = R$79,90 · cada conta extra = +R$19,90</p>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="suggestPlanValueBtn">Sugerir valor do plano com base no limite</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="cancelEditPayment">Cancelar</button>
        <button class="btn btn-primary" id="saveEditPayment">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("payment_status, payment_due_date, monthly_plan_value, ig_account_limit")
      .eq("id", userId)
      .single();
    if (error) throw error;
    $("#editPaymentStatus").value = data.payment_status || "em_dia";
    $("#editPaymentDue").value = data.payment_due_date || "";
    $("#editPaymentValue").value = data.monthly_plan_value || "";
    $("#editIgLimit").value = data.ig_account_limit || 1;
  } catch (err) {
    showBanner("statusBanner", "Erro ao carregar dados de cobrança: " + err.message, "error");
    closeModal();
    return;
  }
  $("#closeEditPaymentModal").addEventListener("click", closeModal);
  $("#cancelEditPayment").addEventListener("click", closeModal);
  $("#suggestPlanValueBtn").addEventListener("click", () => {
    const limit = parseInt($("#editIgLimit").value, 10) || 1;
    $("#editPaymentValue").value = suggestPlanValue(limit).toFixed(2);
  });
  $("#saveEditPayment").addEventListener("click", async () => {
    const status = $("#editPaymentStatus").value;
    const dueRaw = $("#editPaymentDue").value;
    const valueRaw = $("#editPaymentValue").value;
    const igLimitRaw = $("#editIgLimit").value;
    const dueDate = dueRaw ? dueRaw : null;
    const monthlyPlanValue = valueRaw ? parseFloat(valueRaw) : null;
    const igAccountLimit = igLimitRaw ? Math.max(1, parseInt(igLimitRaw, 10)) : 1;
    $("#saveEditPayment").disabled = true;
    try {
      const { error } = await supabase.from("profiles").update({
        payment_status: status,
        payment_due_date: dueDate,
        monthly_plan_value: monthlyPlanValue,
        ig_account_limit: igAccountLimit,
      }).eq("id", userId);
      if (error) throw error;
      showBanner("statusBanner", "Cobrança atualizada com sucesso.", "success");
      closeModal();
      await loadUsers();
    } catch (err) {
      showBanner("statusBanner", "Erro ao atualizar cobrança: " + err.message, "error");
    } finally {
      $("#saveEditPayment").disabled = false;
    }
  });
}

async function openViewAutosModal(event) {
  const userId = event.currentTarget.getAttribute("data-user-id");
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "viewAutosModal";
  overlay.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <h2>Automações — ${escapeHtml(userId)}</h2>
        <button class="modal-close" id="closeViewAutosModal" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh; overflow:auto;">
        <div id="viewAutosLoading" class="loading-row">Carregando automações…</div>
        <div id="viewAutosError" class="banner error hidden"></div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Post / Media ID</th><th>Palavra-chave</th><th>Link do produto</th><th>Status</th><th>Criado em</th></tr>
            </thead>
            <tbody id="viewAutosBody"></tbody>
          </table>
        </div>
        <div id="viewAutosEmpty" class="empty-state hidden">Nenhuma automação encontrada.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary btn-full" id="closeViewAutos">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  $("#closeViewAutosModal").addEventListener("click", closeModal);
  $("#closeViewAutos").addEventListener("click", closeModal);
  $("#viewAutosLoading").classList.remove("hidden");
  $("#viewAutosBody").innerHTML = "";
  $("#viewAutosEmpty").classList.add("hidden");
  $("#viewAutosError").classList.add("hidden");
  try {
    const { data, error } = await supabase.rpc("admin_get_user_automacoes", { target_user_id: userId });
    $("#viewAutosLoading").classList.add("hidden");
    if (error) {
      $("#viewAutosError").textContent = "Erro ao carregar automações: " + error.message;
      $("#viewAutosError").classList.remove("hidden");
      return;
    }
    const rows = data || [];
    if (rows.length === 0) {
      $("#viewAutosEmpty").classList.remove("hidden");
      return;
    }
    $("#viewAutosBody").innerHTML = rows
      .map((r) => {
        const row = typeof r === "string" ? JSON.parse(r) : r;
        const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
        const statusText = row.ativo ? "Ativo" : "Inativo";
        const created = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—";
        return `
          <tr>
            <td>${escapeHtml(row.instagram_media_id)}</td>
            <td>${escapeHtml(row.palavra_chave)}</td>
            <td><a href="${escapeHtml(row.produto_url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(row.produto_url, 40))}</a></td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${created}</td>
          </tr>`;
      })
      .join("");
  } catch (err) {
    $("#viewAutosLoading").classList.add("hidden");
    $("#viewAutosError").textContent = "Erro inesperado: " + err.message;
    $("#viewAutosError").classList.remove("hidden");
  }
}

/* ------------------------------------------------------------------
   Invite user
------------------------------------------------------------------- */
$("#inviteUserBtn").addEventListener("click", async () => {
  const emailInput = $("#inviteEmail");
  const email = emailInput.value.trim();
  if (!email) {
    showBanner("statusBanner", "Informe o e-mail do novo cliente.", "error");
    return;
  }
  $("#inviteUserBtn").disabled = true;
  $("#inviteUserBtn").textContent = "Enviando…";
  try {
    const { data, error } = await supabase.functions.invoke("admin-invite-user", { body: { email } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    showBanner("statusBanner", "Convite enviado para " + email + ".", "success");
    emailInput.value = "";
    await loadUsers();
  } catch (error) {
    showBanner("statusBanner", "Erro ao convidar: " + error.message, "error");
  } finally {
    $("#inviteUserBtn").disabled = false;
    $("#inviteUserBtn").textContent = "Enviar convite";
  }
});

/* ------------------------------------------------------------------
   FAB (Floating Action Button)
------------------------------------------------------------------- */
const fab = $("#fabContainer");
const fabToggle = $("#fabToggle");
const fabBackdrop = $("#fabBackdrop");

function openFab() {
  if (!fab) return;
  fab.setAttribute("data-open", "true");
  if (fabBackdrop) fabBackdrop.classList.add("active");
}

function closeFab() {
  if (!fab) return;
  fab.removeAttribute("data-open");
  if (fabBackdrop) fabBackdrop.classList.remove("active");
}

function toggleFab() {
  if (!fab) return;
  const isOpen = fab.hasAttribute("data-open");
  if (isOpen) closeFab();
  else openFab();
}

["#fabNewAutomation", "#fabConnectIg", "#fabInviteClient"].forEach((sel) => {
  const btn = $(sel);
  if (btn) {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      handleFabAction(action);
      closeFab();
    });
  }
});

function handleFabAction(action) {
  const activeTab = $(".nav-item.active")?.getAttribute("data-tab") || "dashboard";
  switch (action) {
    case "new-automation":
      if (activeTab !== "dashboard") switchTab("dashboard");
      $("#newAutomationPanel").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#toggleImagemUrlBtn").closest(".field, .panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
      break;
    case "connect-ig":
      if (activeTab !== "accounts") switchTab("accounts");
      $("#igTesterSubmitBtn")?.closest("form")?.scrollIntoView({ behavior: "smooth", block: "center" }) ||
        $("#addIgAccountBtn")?.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    case "invite-client":
      if (activeTab !== "admin") switchTab("admin");
      $("#inviteEmail").focus();
      break;
  }
}

if (fabToggle) {
  fabToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFab();
  });
}
if (fabBackdrop) {
  fabBackdrop.addEventListener("click", closeFab);
}
document.addEventListener("click", (e) => {
  if (fab && fab.hasAttribute("data-open") && !fab.contains(e.target)) {
    closeFab();
  }
});

// Update FAB options based on context
function updateFabOptions() {
  const activeTab = $(".nav-item.active")?.getAttribute("data-tab") || "dashboard";
  $("#fabInviteClient").style.display = (currentProfile?.is_admin && activeTab === "admin") ? "flex" : "none";
}
setInterval(updateFabOptions, 500);

/* ------------------------------------------------------------------
   Responsive: resize listener
------------------------------------------------------------------- */
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    isMobileView = window.innerWidth <= 768;
    toggleBottomNavVisibility();
    syncBottomNavState();
  }, 250);
});

/* ------------------------------------------------------------------
   Bootstrap
------------------------------------------------------------------- */
supabase.auth.onAuthStateChange((_event, _session) => {});
bootstrapSession();

/* ------------------------------------------------------------------
   DOM Content Loaded: finalize setup
------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (!localStorage.getItem("ap-theme")) {
    applyTheme(prefersDark ? "dark" : "light");
  }
  toggleBottomNavVisibility();
  syncBottomNavState();
  setupTopBarTitles();
});

/* ==========================================================================
   EXPORTS (for external modules)
========================================================================== */
export {
  supabase,
  escapeHtml,
  truncateUrl,
  suggestPlanValue,
  currentProfile,
  currentUserTable,
  currentIgAccounts,
  startInstagramConnect,
  disconnectIgAccount,
  loadIgConfig,
  showBanner,
};
