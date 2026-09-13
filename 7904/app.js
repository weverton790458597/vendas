/*
 * app.js — lógica principal do Achei & Postei
 *
 * este arquivo é carregado como ES module pelo index.html
 * ( veja <script type="module" src="app.js"> )
 *
 * TODO futuro: se rodar este arquivo no node para teste, usar extensão .mjs
 * ou adicionar "type": "module" no package.json do projeto de teste.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";


const INSTAGRAM_APP_ID = "1432929018522131";
const INSTAGRAM_REDIRECT_URI = SUPABASE_URL + "/functions/v1/instagram-oauth-callback";
const INSTAGRAM_SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  db: { schema: "public" },
});

let currentUser = null;
let currentProfile = null;
let currentUserTable = null; // nome da tabela de automações do usuário logado

const $ = (selector) => document.querySelector(selector);

function showBanner(elId, message, type) {
  const el = $(elId);
  el.textContent = message;
  el.className = "banner " + type;
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

/* ============================================================
   TELA DE AUTENTICAÇÃO
   ============================================================ */

$("#authSubmitBtn").addEventListener("click", async () => {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  if (!email || !password) {
    showBanner("authBanner", "Preencha e-mail e senha.", "error");
    return;
  }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await bootstrapSession();
  } catch (error) {
    showBanner("authBanner", error.message, "error");
  }
});

$("#blockedLogoutBtn").addEventListener("click", () => supabase.auth.signOut().then(() => location.reload()));
$("#logoutBtn").addEventListener("click", () => supabase.auth.signOut().then(() => location.reload()));

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
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    history.replaceState(null, "", window.location.pathname);
    await bootstrapSession();
  } catch (error) {
    showBanner("setPasswordBanner", error.message, "error");
  }
});

/* ============================================================
   INTEGRAÇÃO INSTAGRAM (sem alterações desta seção)
   ============================================================ */

function handleInstagramOauthReturn() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("ig_connected");
  const error = params.get("ig_error");
  if (connected) {
    showBanner("statusBanner", "Instagram conectado com sucesso!", "success");
  } else if (error) {
    showBanner("statusBanner", "Erro ao conectar Instagram: " + error, "error");
  }
  if (connected || error) {
    params.delete("ig_connected");
    params.delete("ig_error");
    const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    history.replaceState(null, "", clean);
  }
}

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

  // ============================================================
  // GUARDAR O NOME DA TABELA DO USUÁRIO LOGADO
  // ============================================================
  currentUserTable = currentProfile.automacoes_table_name;

  if (!profile.is_active) {
    showScreen("blocked");
    return;
  }

  $("#userEmailLabel").textContent = currentUser.email;
  $("#adminTabBtn").classList.toggle("hidden", !profile.is_admin);
  showScreen("app");
  handleInstagramOauthReturn();
  await loadIgConfig();
  await loadAutomations();
}

function showScreen(name) {
  $("#authScreen").classList.toggle("hidden", name !== "auth");
  $("#setPasswordScreen").classList.toggle("hidden", name !== "setPassword");
  $("#blockedScreen").classList.toggle("hidden", name !== "blocked");
  $("#appScreen").classList.toggle("hidden", name !== "app");
}

/* ============================================================
   NAVEGAÇÃO DAS ABAS
   ============================================================ */

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    $("#tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
    $("#tab-admin").classList.toggle("hidden", tab !== "admin");
    if (tab === "admin") loadUsers();
  });
});

/* ============================================================
   INSTAGRAM — sem alterações
   ============================================================ */

async function startInstagramConnect() {
  try {
    const { data, error } = await supabase
      .from("oauth_states")
      .insert({ user_id: currentUser.id })
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

$("#connectIgBtn").addEventListener("click", startInstagramConnect);
$("#reconnectIgBtn").addEventListener("click", startInstagramConnect);

$("#disconnectIgBtn").addEventListener("click", async () => {
  if (!confirm("Tem certeza que deseja desconectar sua conta do Instagram? Suas automações vão parar de funcionar até você reconectar.")) return;
  try {
    const { error } = await supabase.from("instagram_config").delete().eq("user_id", currentUser.id);
    if (error) throw error;
    showBanner("statusBanner", "Instagram desconectado.", "success");
    await loadIgConfig();
  } catch (error) {
    showBanner("statusBanner", "Erro ao desconectar: " + error.message, "error");
  }
});

async function loadIgConfig() {
  const loading = $("#igLoadingStatus");
  const connectedBox = $("#igConnectedBox");
  const disconnectedBox = $("#igDisconnectedBox");
  loading.classList.remove("hidden");
  connectedBox.classList.add("hidden");
  disconnectedBox.classList.add("hidden");
  try {
    const { data, error } = await supabase
      .from("instagram_config")
      .select("instagram_business_account_id, instagram_username")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (error) throw error;

    if (data) {
      $("#igConnectedUsername").textContent = data.instagram_username ? "(@" + data.instagram_username + ")" : "";
      connectedBox.classList.remove("hidden");
    } else {
      disconnectedBox.classList.remove("hidden");
    }
  } catch (error) {
    console.error(error.message);
    disconnectedBox.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
  }
}

/* ============================================================
   CRUD DE AUTOMAÇÕES — usa currentUserTable dinamicamente
   ============================================================ */

async function loadAutomations() {
  const tbody = $("#automationsTableBody");
  const loading = $("#loadingAutomations");
  loading.classList.remove("hidden");
  tbody.innerHTML = "";

  // Se por algum motivo a tabela não foi criada ainda (perfil antigo sem trigger),
  // mostra estado vazio.
  if (!currentUserTable) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Erro: tabela de automações não encontrada para sua conta. Contate o administrador.</td></tr>';
    loading.classList.add("hidden");
    return;
  }

  try {
    // Não precisamos filtrar por user_id: a RLS já garante que cada
    // usuário só vê sua própria tabela.
    const { data, error } = await supabase
      .from(currentUserTable)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma automação cadastrada ainda. Cadastre a primeira acima.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((row) => {
      const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
      const statusText = row.ativo ? "Ativo" : "Inativo";
      const created = new Date(row.created_at).toLocaleString("pt-BR");
      return (
        '<tr data-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.instagram_media_id) + "</td>" +
        "<td>" + escapeHtml(row.palavra_chave) + "</td>" +
        '<td><a href="' + escapeHtml(row.produto_url) + '" target="_blank" rel="noopener">' + truncateUrl(row.produto_url, 46) + "</a></td>" +
        '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
        "<td>" + created + "</td>" +
        '<td class="table-actions">' +
        '<button class="icon-btn toggle-btn" title="' + (row.ativo ? "Desativar" : "Ativar") + '">' + (row.ativo ? "🔇" : "🔊") + "</button>" +
        '<button class="icon-btn delete-btn" title="Excluir">🗑️</button>' +
        "</td></tr>"
      );
    }).join("");

    document.querySelectorAll(".toggle-btn").forEach((btn) => btn.addEventListener("click", toggleActive));
    document.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", deleteAutomation));
  } catch (error) {
    showBanner("statusBanner", "Erro ao carregar automações: " + error.message, "error");
  } finally {
    loading.classList.add("hidden");
  }
}

async function toggleActive(event) {
  const row = event.currentTarget.closest("tr");
  const id = row.getAttribute("data-id");
  const currentAtivo = event.currentTarget.title === "Desativar";
  try {
    // Usa currentUserTable em vez de "posts_automacao"
    const { error } = await supabase.from(currentUserTable).update({ ativo: !currentAtivo }).eq("id", id);
    if (error) throw error;
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao alternar status: " + error.message, "error");
  }
}

async function deleteAutomation(event) {
  const row = event.currentTarget.closest("tr");
  const id = row.getAttribute("data-id");
  if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
  try {
    // Usa currentUserTable em vez de "posts_automacao"
    const { error } = await supabase.from(currentUserTable).delete().eq("id", id);
    if (error) throw error;
    showBanner("statusBanner", "Automação excluída.", "success");
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao excluir: " + error.message, "error");
  }
}

$("#saveAutomationBtn").addEventListener("click", async () => {
  const mediaIdInput = $("#instagramMediaId");
  const palavraChaveInput = $("#palavraChave");
  const produtoUrlInput = $("#produtoUrl");
  const mediaIdRaw = mediaIdInput.value.trim();
  const palavraChave = palavraChaveInput.value.trim();
  const produtoUrl = produtoUrlInput.value.trim();

  if (!mediaIdRaw || !palavraChave || !produtoUrl) {
    showBanner("statusBanner", "Todos os campos são obrigatórios.", "error");
    return;
  }

  const shortcode = extractShortcode(mediaIdRaw);
  try {
    // Insert na tabela do usuário (sem user_id — a tabela é exclusiva dele)
    const { error } = await supabase.from(currentUserTable).insert({
      instagram_media_id: shortcode,
      palavra_chave: palavraChave,
      produto_url: produtoUrl,
      ativo: true,
    });
    if (error) throw error;
    showBanner("statusBanner", "Automação salva com sucesso!", "success");
    mediaIdInput.value = "";
    palavraChaveInput.value = "";
    produtoUrlInput.value = "";
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao salvar automação: " + error.message, "error");
  }
});

/* ============================================================
   PAINEL DE ADMIN — Convidar, listar, reativar, cobrança, automações
   ============================================================ */

$("#inviteUserBtn").addEventListener("click", async () => {
  const emailInput = $("#inviteEmail");
  const email = emailInput.value.trim();
  if (!email) {
    showBanner("statusBanner", "Informe o e-mail do novo cliente.", "error");
    return;
  }
  $("#inviteUserBtn").disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: { email },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    showBanner("statusBanner", "Convite enviado para " + email + ".", "success");
    emailInput.value = "";
    await loadUsers();
  } catch (error) {
    showBanner("statusBanner", "Erro ao convidar: " + error.message, "error");
  } finally {
    $("#inviteUserBtn").disabled = false;
  }
});

async function loadUsers() {
  const tbody = $("#usersTableBody");
  const loading = $("#loadingUsers");
  loading.classList.remove("hidden");
  tbody.innerHTML = "";
  try {
    // Pega os novos campos de cobrança junto com o resto do profile
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((u) => {
      const statusClass = u.is_active ? "badge-ativo" : "badge-inativo";
      const statusText = u.is_active ? "Ativo" : "Inativo";
      const created = new Date(u.created_at).toLocaleString("pt-BR");

      // ---- Badge de status de pagamento ----
      let paymentBadge = "";
      const ps = u.payment_status; // 'em_dia' | 'atrasado' | 'cancelado'
      if (ps === "em_dia") {
        paymentBadge = '<span class="badge badge-ativo">Em dia</span>';
      } else if (ps === "atrasado") {
        paymentBadge = '<span class="badge badge-danger">Atrasado</span>';
      } else if (ps === "cancelado") {
        paymentBadge = '<span class="badge badge-muted">Cancelado</span>';
      } else {
        paymentBadge = '<span class="badge badge-muted">—</span>';
      }

      // ---- Formatação do vencimento ----
      const dueDateStr = u.payment_due_date
        ? new Date(u.payment_due_date).toLocaleDateString("pt-BR")
        : "—";

      // ---- Formatação do valor do plano ----
      const planValueStr = u.monthly_plan_value
        ? "R$ " + Number(u.monthly_plan_value).toFixed(2).replace(".", ",")
        : "—";

      // ---- Botões de ação ----
      const disableSelfToggle = u.id === currentUser.id
        ? "disabled title='Você não pode desativar a própria conta'"
        : "";

      return (
        '<tr data-id="' + u.id + '">' +
        "<td>" + escapeHtml(u.email) +
          (u.is_admin ? ' <span class="badge badge-ativo">admin</span>' : "") + "</td>" +
        "<td>" + created + "</td>" +
        '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
        // Nova coluna: status de pagamento
        "<td>" + paymentBadge + "</td>" +
        // Nova coluna: vencimento
        "<td>" + escapeHtml(dueDateStr) + "</td>" +
        // Nova coluna: valor do plano
        "<td>" + escapeHtml(planValueStr) + "</td>" +
        '<td class="table-actions">' +
        // Botão alternar ativo/inativo
        '<button class="btn btn-outline btn-sm user-toggle-btn" ' + disableSelfToggle +
          ' data-active="' + u.is_active + '">' +
          (u.is_active ? "Desativar" : "Ativar") + "</button> " +
        // Botão editar cobrança
        '<button class="btn btn-outline btn-sm edit-payment-btn" data-user-id="' + u.id + '">' +
          "Editar cobrança</button> " +
        // Botão ver automações
        '<button class="btn btn-outline btn-sm view-autos-btn" data-user-id="' + u.id + '">' +
          "Ver automações</button>" +
        "</td></tr>"
      );
    }).join("");

    document.querySelectorAll(".user-toggle-btn").forEach((btn) => btn.addEventListener("click", toggleUserActive));
    document.querySelectorAll(".edit-payment-btn").forEach((btn) => btn.addEventListener("click", openEditPaymentModal));
    document.querySelectorAll(".view-autos-btn").forEach((btn) => btn.addEventListener("click", openViewAutosModal));
  } catch (error) {
    showBanner("statusBanner", "Erro ao carregar usuários: " + error.message, "error");
  } finally {
    loading.classList.add("hidden");
  }
}

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

/* ============================================================
   MODAL GENÉRICO (reutilizável para editar cobrança e ver automações)
   ============================================================ */

function showModal(html) {
  // Remove modal anterior se existir
  const old = document.querySelector(".modal-overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  // Fechar ao clicar fora
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
}

function closeModal() {
  const overlay = document.querySelector(".modal-overlay");
  if (overlay) overlay.remove();
}

// Fechar com Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ============================================================
   MODAL: EDITAR COBRANÇA
   ============================================================ */

async function openEditPaymentModal(event) {
  const userId = event.currentTarget.getAttribute("data-user-id");
  const overlay = document.querySelector(".modal-overlay");
  if (overlay) overlay.remove();

  const overlay2 = document.createElement("div");
  overlay2.className = "modal-overlay";
  overlay2.id = "editPaymentModal";
  overlay2.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2>Editar cobrança</h2>
        <button class="modal-close" id="closeEditPaymentModal" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">
        <p class="modal-sub">Alterando os dados abaixo para <strong>${escapeHtml(userId)}</strong>.</p>
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
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="cancelEditPayment">Cancelar</button>
        <button class="btn btn-primary" id="saveEditPayment">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay2);

  // Preencher valores atuais via RPC ou query direta
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("payment_status, payment_due_date, monthly_plan_value")
      .eq("id", userId)
      .single();
    if (error) throw error;

    $("#editPaymentStatus").value = data.payment_status || "em_dia";
    $("#editPaymentDue").value = data.payment_due_date || "";
    $("#editPaymentValue").value = data.monthly_plan_value || "";
  } catch (err) {
    showBanner("statusBanner", "Erro ao carregar dados de cobrança: " + err.message, "error");
    closeModal();
    return;
  }

  $("#closeEditPaymentModal").addEventListener("click", closeModal);
  $("#cancelEditPayment").addEventListener("click", closeModal);

  $("#saveEditPayment").addEventListener("click", async () => {
    const status = $("#editPaymentStatus").value;
    const dueRaw = $("#editPaymentDue").value;
    const valueRaw = $("#editPaymentValue").value;

    const dueDate = dueRaw ? dueRaw : null; // formato ISO YYYY-MM-DD
    const monthlyPlanValue = valueRaw ? parseFloat(valueRaw) : null;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          payment_status: status,
          payment_due_date: dueDate,
          monthly_plan_value: monthlyPlanValue,
        })
        .eq("id", userId);
      if (error) throw error;
      showBanner("statusBanner", "Cobrança atualizada com sucesso.", "success");
      closeModal();
      await loadUsers();
    } catch (err) {
      showBanner("statusBanner", "Erro ao atualizar cobrança: " + err.message, "error");
    }
  });
}

/* ============================================================
   MODAL: VER AUTOMAÇÕES DO CLIENTE
   ============================================================ */

async function openViewAutosModal(event) {
  const userId = event.currentTarget.getAttribute("data-user-id");
  closeModal(); // fecha qualquer modal aberto

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
              <tr>
                <th>Post / Media ID</th>
                <th>Palavra-chave</th>
                <th>Link do produto</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody id="viewAutosBody"></tbody>
          </table>
        </div>
        <div id="viewAutosEmpty" class="empty-state hidden">Nenhuma automação encontrada.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary btn-full" id="closeViewAutos">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  $("#closeViewAutosModal").addEventListener("click", closeModal);
  $("#closeViewAutos").addEventListener("click", closeModal);

  $("#viewAutosLoading").classList.remove("hidden");
  $("#viewAutosBody").innerHTML = "";
  $("#viewAutosEmpty").classList.add("hidden");
  $("#viewAutosError").classList.add("hidden");

  try {
    const { data, error } = await supabase.rpc("admin_get_user_automacoes", {
      target_user_id: userId,
    });
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

    $("#viewAutosBody").innerHTML = rows.map((r) => {
      // r é jsonb retornado pela função; as chaves seguem a estrutura
      // da tabela de automações (instagram_media_id, palavra_chave, etc.)
      const row = typeof r === "string" ? JSON.parse(r) : r;
      const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
      const statusText = row.ativo ? "Ativo" : "Inativo";
      const created = row.created_at
        ? new Date(row.created_at).toLocaleString("pt-BR")
        : "—";
      return (
        '<tr>' +
        "<td>" + escapeHtml(row.instagram_media_id) + "</td>" +
        "<td>" + escapeHtml(row.palavra_chave) + "</td>" +
        '<td><a href="' + escapeHtml(row.produto_url) + '" target="_blank" rel="noopener">' +
          escapeHtml(truncateUrl(row.produto_url, 40)) + "</a></td>" +
        '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
        "<td>" + created + "</td>" +
        "</tr>"
      );
    }).join("");
  } catch (err) {
    $("#viewAutosLoading").classList.add("hidden");
    $("#viewAutosError").textContent = "Erro inesperado: " + err.message;
    $("#viewAutosError").classList.remove("hidden");
  }
}

supabase.auth.onAuthStateChange((_event, _session) => {});

bootstrapSession();
