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

const $ = (id) => document.getElementById(id);

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

$("authSubmitBtn").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
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

$("blockedLogoutBtn").addEventListener("click", () => supabase.auth.signOut().then(() => location.reload()));
$("logoutBtn").addEventListener("click", () => supabase.auth.signOut().then(() => location.reload()));

function isInviteOrRecoveryLink() {
  const hash = window.location.hash || "";
  return hash.includes("type=invite") || hash.includes("type=recovery");
}

$("setPasswordBtn").addEventListener("click", async () => {
  const newPassword = $("newPassword").value;
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

  if (!profile.is_active) {
    showScreen("blocked");
    return;
  }

  $("userEmailLabel").textContent = currentUser.email;
  $("adminTabBtn").classList.toggle("hidden", !profile.is_admin);
  showScreen("app");
  handleInstagramOauthReturn();
  await loadIgConfig();
  await loadAutomations();
}

function showScreen(name) {
  $("authScreen").classList.toggle("hidden", name !== "auth");
  $("setPasswordScreen").classList.toggle("hidden", name !== "setPassword");
  $("blockedScreen").classList.toggle("hidden", name !== "blocked");
  $("appScreen").classList.toggle("hidden", name !== "app");
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    $("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
    $("tab-admin").classList.toggle("hidden", tab !== "admin");
    if (tab === "admin") loadUsers();
  });
});

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

$("connectIgBtn").addEventListener("click", startInstagramConnect);
$("reconnectIgBtn").addEventListener("click", startInstagramConnect);

$("disconnectIgBtn").addEventListener("click", async () => {
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
  const loading = $("igLoadingStatus");
  const connectedBox = $("igConnectedBox");
  const disconnectedBox = $("igDisconnectedBox");
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
      $("igConnectedUsername").textContent = data.instagram_username ? "(@" + data.instagram_username + ")" : "";
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

async function loadAutomations() {
  const tbody = $("automationsTableBody");
  const loading = $("loadingAutomations");
  loading.classList.remove("hidden");
  tbody.innerHTML = "";
  try {
    const { data, error } = await supabase
      .from("posts_automacao")
      .select("*")
      .eq("user_id", currentUser.id)
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
    const { error } = await supabase.from("posts_automacao").update({ ativo: !currentAtivo }).eq("id", id);
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
    const { error } = await supabase.from("posts_automacao").delete().eq("id", id);
    if (error) throw error;
    showBanner("statusBanner", "Automação excluída.", "success");
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao excluir: " + error.message, "error");
  }
}

$("saveAutomationBtn").addEventListener("click", async () => {
  const mediaIdInput = $("instagramMediaId");
  const palavraChaveInput = $("palavraChave");
  const produtoUrlInput = $("produtoUrl");
  const mediaIdRaw = mediaIdInput.value.trim();
  const palavraChave = palavraChaveInput.value.trim();
  const produtoUrl = produtoUrlInput.value.trim();

  if (!mediaIdRaw || !palavraChave || !produtoUrl) {
    showBanner("statusBanner", "Todos os campos são obrigatórios.", "error");
    return;
  }

  const shortcode = extractShortcode(mediaIdRaw);
  try {
    const { error } = await supabase.from("posts_automacao").insert({
      user_id: currentUser.id,
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

$("inviteUserBtn").addEventListener("click", async () => {
  const emailInput = $("inviteEmail");
  const email = emailInput.value.trim();
  if (!email) {
    showBanner("statusBanner", "Informe o e-mail do novo cliente.", "error");
    return;
  }
  $("inviteUserBtn").disabled = true;
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
    $("inviteUserBtn").disabled = false;
  }
});

async function loadUsers() {
  const tbody = $("usersTableBody");
  const loading = $("loadingUsers");
  loading.classList.remove("hidden");
  tbody.innerHTML = "";
  try {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((u) => {
      const statusClass = u.is_active ? "badge-ativo" : "badge-inativo";
      const statusText = u.is_active ? "Ativo" : "Inativo";
      const created = new Date(u.created_at).toLocaleString("pt-BR");
      const disableSelfToggle = u.id === currentUser.id ? "disabled title='Você não pode desativar a própria conta'" : "";
      return (
        '<tr data-id="' + u.id + '">' +
        "<td>" + escapeHtml(u.email) + (u.is_admin ? ' <span class="badge badge-ativo">admin</span>' : "") + "</td>" +
        "<td>" + created + "</td>" +
        '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
        '<td class="table-actions">' +
        '<button class="icon-btn user-toggle-btn" ' + disableSelfToggle + ' data-active="' + u.is_active + '" style="width:auto;padding:0 12px;">' +
        (u.is_active ? "Desativar" : "Ativar") + "</button></td></tr>"
      );
    }).join("");

    document.querySelectorAll(".user-toggle-btn").forEach((btn) => btn.addEventListener("click", toggleUserActive));
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

supabase.auth.onAuthStateChange((_event, _session) => {});

bootstrapSession();
