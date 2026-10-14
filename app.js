import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";
const INSTAGRAM_APP_ID = "1432929018522131";
const INSTAGRAM_REDIRECT_URI = SUPABASE_URL + "/functions/v1/instagram-oauth-callback";
const INSTAGRAM_SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";
// WhatsApp de suporte (só dígitos, com DDI 55 + DDD).
const SUPPORT_WHATSAPP_NUMBER = "5598981460747";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  db: { schema: "public" },
});
let currentUser = null;
let currentProfile = null;
const AUTOMATIONS_TABLE = "post_automacao";
let allAutomations = [];
let allUsers = [];
// Cache de publicações por conta (config_id -> Promise<Map<shortcode, post>>),
// usado só para mostrar miniatura/legenda do post em cada automação cadastrada.
const accountPostsCache = {};
// Lista crua de posts por conta (config_id -> Promise<post[]>), compartilhada entre as
// miniaturas das automações e o seletor de post da nova automação.
const accountPostsListCache = {};
const $ = (selector) => document.querySelector(selector);
const bannerTimers = {};
function showBanner(elId, message, type) {
  const el = $("#" + elId);
  if (!el) return;
  el.textContent = message;
  el.className = "banner " + type;
  clearTimeout(bannerTimers[elId]);
  bannerTimers[elId] = setTimeout(() => { el.className = "banner"; }, 5000);
}
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
function truncateUrl(url, maxLen) {
  const s = url === null || url === undefined ? "" : String(url);
  return s.length <= maxLen ? s : s.substring(0, maxLen) + "...";
}
// Só permite http(s) em links — bloqueia javascript: e afins.
function safeUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
  } catch {
    return "#";
  }
}
function isValidHttpUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function extractShortcode(input) {
  const value = String(input || "").trim();
  if (!value.includes("instagram.com")) return value;
  const cleanUrl = value.split("?")[0];
  const match = cleanUrl.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : value;
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("ap-theme", theme); } catch (_) { /* storage indisponível */ }
}
(function restoreTheme() {
  try {
    const saved = localStorage.getItem("ap-theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  } catch (_) { /* ignora */ }
})();
document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
});
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
["#authEmail", "#authPassword"].forEach((sel) =>
  $(sel).addEventListener("keydown", (e) => { if (e.key === "Enter") $("#authSubmitBtn").click(); })
);
$("#newPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#setPasswordBtn").click(); });
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
  // Parceiros (afiliados) não usam este painel: vão para a área deles.
  if (profile.is_partner && !profile.is_admin) {
    window.location.replace("parceiros/");
    return;
  }
  if (!profile.is_active) {
    showScreen("blocked");
    return;
  }
  const displayName = String(profile.nome || "").trim() || currentUser.email;
  $("#userEmailLabel").textContent = displayName;
  $("#userEmailLabel").title = currentUser.email;
  $("#userAvatar").textContent = displayName.charAt(0).toUpperCase();
  $("#adminTabBtn").classList.toggle("hidden", !profile.is_admin);
  const founderBadge = $("#founderBadgeIco");
  const founderPanel = $("#founderPanel");
  if (founderBadge) founderBadge.classList.toggle("hidden", !profile.is_founder);
  if (founderPanel) founderPanel.classList.toggle("hidden", !profile.is_founder);
  updatePlanLinks();
  showScreen("app");
  handleInstagramOauthReturn();
  await loadIgConfig();
  await loadAutomations();
  // As publicações são carregadas por instagram-latest-posts.js (dono do grid).
  // Antes os dois módulos disputavam o mesmo #latestPostsGrid e o último a responder vencia.
  if (profile.is_founder) await loadFounderIdeaTermsState();
}
// ---------- Planos / mais contas ----------
function introNome() {
  const n = currentProfile && currentProfile.nome ? String(currentProfile.nome).trim() : "";
  return n ? "Meu nome é " + n + ". " : "";
}
// O nome pode ser preenchido depois do login (nome-usuario.js): atualiza os links de WhatsApp.
window.addEventListener("user-nome-changed", (e) => {
  if (currentProfile) currentProfile.nome = e.detail && e.detail.nome;
  updatePlanLinks();
});
function updatePlanLinks() {
  const email = currentUser ? currentUser.email : "";
  const oneBtn = $("#planOneAccountBtn");
  if (oneBtn) {
    oneBtn.href = whatsappLink(
      "Olá! " + introNome() + "Quero contratar o plano de 1 conta do Instagram (R$ 99,90/mês) no Achei & Postei. Meu e-mail: " + email
    );
  }
  const threeBtn = $("#planThreeAccountsBtn");
  if (threeBtn) {
    threeBtn.href = whatsappLink(
      "Olá! " + introNome() + "Quero contratar o plano de até 3 contas do Instagram (R$ 189,90/mês) no Achei & Postei. Meu e-mail: " + email
    );
  }
  const slider = $("#planAccountsSlider");
  const sliderBtn = $("#planSliderBtn");
  if (slider && sliderBtn) {
    const n = parseInt(slider.value, 10) || 3;
    const price = suggestPlanValue(n);
    $("#planAccountsCount").textContent = n;
    $("#planSliderPrice").textContent = formatBRL(price);
    sliderBtn.href = whatsappLink(
      "Olá! " + introNome() + "Quero atualizar meu plano no Achei & Postei para " + n + " contas do Instagram (" +
      formatBRL(price) + "/mês). Meu e-mail: " + email
    );
  }
}
function initPlansUI() {
  const slider = $("#planAccountsSlider");
  if (slider) slider.addEventListener("input", updatePlanLinks);
  updatePlanLinks();
}
initPlansUI();
// ---------- Selo de Membro Fundador: termo de uso de ideias ----------
function renderFounderIdeaState(accepted) {
  const acceptedBox = $("#founderIdeaAccepted");
  const pendingBox = $("#founderIdeaPending");
  const suggestBtn = $("#founderSuggestBtn");
  if (!acceptedBox || !pendingBox) return;
  acceptedBox.classList.toggle("hidden", !accepted);
  pendingBox.classList.toggle("hidden", accepted);
  if (accepted && suggestBtn && currentUser) {
    suggestBtn.href = whatsappLink(
      "Olá! " + introNome() + "Sou membro fundador do Achei & Postei e já aceitei os Termos de Uso de Ideias. " +
      "Quero sugerir uma nova função pra plataforma: [descreva sua ideia aqui]. Meu e-mail: " + currentUser.email
    );
  }
}
async function loadFounderIdeaTermsState() {
  try {
    const { data, error } = await supabase
      .from("idea_terms_acceptances")
      .select("id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (error) throw error;
    renderFounderIdeaState(!!data);
  } catch (error) {
    // Tabela pode não existir ainda em ambientes antigos — não trava o painel por isso.
    console.error("Erro ao verificar aceite dos termos de ideias:", error.message);
    renderFounderIdeaState(false);
  }
}
const founderIdeaCheckbox = $("#founderIdeaTermsCheckbox");
const founderIdeaAcceptBtn = $("#founderIdeaAcceptBtn");
if (founderIdeaCheckbox && founderIdeaAcceptBtn) {
  founderIdeaCheckbox.addEventListener("change", () => {
    founderIdeaAcceptBtn.disabled = !founderIdeaCheckbox.checked;
  });
  founderIdeaAcceptBtn.addEventListener("click", async () => {
    if (!currentUser || !founderIdeaCheckbox.checked) return;
    founderIdeaAcceptBtn.disabled = true;
    founderIdeaAcceptBtn.textContent = "Salvando…";
    try {
      const { error } = await supabase.from("idea_terms_acceptances").upsert({
        user_id: currentUser.id,
        accepted_at: new Date().toISOString(),
      });
      if (error) throw error;
      renderFounderIdeaState(true);
    } catch (error) {
      showBanner("statusBanner", "Erro ao registrar aceite dos termos: " + error.message, "error");
      founderIdeaAcceptBtn.disabled = false;
    } finally {
      founderIdeaAcceptBtn.textContent = "Aceitar e sugerir função no WhatsApp";
    }
  });
}
function showScreen(name) {
  $("#authScreen").classList.toggle("hidden", name !== "auth");
  $("#setPasswordScreen").classList.toggle("hidden", name !== "setPassword");
  $("#blockedScreen").classList.toggle("hidden", name !== "blocked");
  $("#appScreen").classList.toggle("hidden", name !== "app");
}
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    $("#tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
    $("#tab-accounts").classList.toggle("hidden", tab !== "accounts");
    $("#tab-admin").classList.toggle("hidden", tab !== "admin");
    if (tab === "admin") loadUsers();
    if (tab === "accounts") loadIgConfig();
  });
});
let currentIgAccounts = [];
// Tabela de preços oficial: 1 conta R$99,90 | até 3 contas R$189,90 | cada conta extra além de 3, +R$49,90
// (300 mensagens/mês por conta; excedente R$0,10 por mensagem)
function suggestPlanValue(limit) {
  const n = Number(limit) || 1;
  if (n <= 1) return 99.9;
  if (n <= 3) return 189.9;
  return Math.round((189.9 + (n - 3) * 49.9) * 100) / 100;
}
function formatBRL(value) {
  return "R$ " + Number(value).toFixed(2).replace(".", ",");
}
function whatsappLink(message) {
  return "https://wa.me/" + SUPPORT_WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
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
  if (!confirm("Tem certeza que deseja desconectar esta conta do Instagram? As automações ligadas a ela vão parar de funcionar até você reconectar.")) return;
  try {
    const { error } = await supabase.from("instagram_config").delete().eq("id", configId).eq("user_id", currentUser.id);
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
  const limit = (currentProfile && currentProfile.ig_account_limit) || 1;
  const count = currentIgAccounts.length;
  if (count === 0) {
    list.innerHTML =
      '<div class="ig-status-row">' +
      '<span class="ig-dot ig-dot-off"></span>' +
      '<div class="ig-status-text">' +
      "<strong>Instagram não conectado</strong>" +
      "<p>Conecte sua conta profissional para ativar as respostas automáticas.</p>" +
      "</div></div>";
  } else {
    list.innerHTML = currentIgAccounts.map((acc) => {
      const username = acc.instagram_username ? "@" + escapeHtml(acc.instagram_username) : "Conta conectada";
      return (
        '<div class="ig-status-row ig-account-row" data-id="' + escapeHtml(acc.id) + '">' +
        '<span class="ig-dot ig-dot-on"></span>' +
        '<div class="ig-status-text">' +
        "<strong>" + username + "</strong>" +
        "<p>As automações já podem responder comentários e enviar Direct.</p>" +
        "</div>" +
        '<div class="ig-status-actions">' +
        '<button class="btn btn-outline btn-sm ig-reconnect-btn" data-id="' + escapeHtml(acc.id) + '">Reconectar</button>' +
        '<button class="btn btn-danger-ghost btn-sm ig-disconnect-btn" data-id="' + escapeHtml(acc.id) + '">Desconectar</button>' +
        "</div></div>"
      );
    }).join("");
  }
  list.classList.remove("hidden");
  document.querySelectorAll(".ig-reconnect-btn").forEach((btn) =>
    btn.addEventListener("click", () => startInstagramConnect(btn.getAttribute("data-id")))
  );
  document.querySelectorAll(".ig-disconnect-btn").forEach((btn) =>
    btn.addEventListener("click", () => disconnectIgAccount(btn.getAttribute("data-id")))
  );
  const atLimit = count >= limit;
  addBtn.textContent = count === 0 ? "Conectar Instagram" : "+ Adicionar conta do Instagram";
  addBtn.disabled = atLimit;
  addBtn.title = atLimit ? "Limite de contas do seu plano atingido. Fale com o suporte para aumentar o limite." : "";
  limitText.textContent = count + " de " + limit + " conta" + (limit === 1 ? "" : "s") + " do plano em uso" + (atLimit ? " — limite atingido" : "");
  footer.classList.remove("hidden");
  updateAutomationIgSelector();
}
$("#addIgAccountBtn").addEventListener("click", () => startInstagramConnect());
function updateAutomationIgSelector() {
  const field = $("#automationIgAccountField");
  const select = $("#automationIgAccount");
  if (currentIgAccounts.length <= 1) {
    field.classList.add("hidden");
    select.innerHTML = currentIgAccounts[0]
      ? '<option value="' + escapeHtml(currentIgAccounts[0].id) + '">' + escapeHtml(currentIgAccounts[0].id) + "</option>"
      : "";
    return;
  }
  field.classList.remove("hidden");
  select.innerHTML = currentIgAccounts.map((acc) =>
    '<option value="' + escapeHtml(acc.id) + '">' + (acc.instagram_username ? "@" + escapeHtml(acc.instagram_username) : "Conta " + escapeHtml(String(acc.id).slice(0, 8))) + "</option>"
  ).join("");
}
async function loadIgConfig() {
  const loading = $("#igLoadingStatus");
  loading.classList.remove("hidden");
  $("#igAccountsList").classList.add("hidden");
  $("#igStatusFooter").classList.add("hidden");
  try {
    const { data, error } = await supabase
      .from("instagram_config")
      .select("id, instagram_business_account_id, instagram_username")
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
function updateAutomationKpis(rows) {
  const total = rows.length;
  const ativas = rows.filter((r) => r.ativo).length;
  $("#kpiTotal").textContent = total;
  $("#kpiAtivas").textContent = ativas;
  $("#kpiPausadas").textContent = total - ativas;
}
function renderLatestPosts(posts) {
  const grid = $("#latestPostsGrid");
  if (!grid) return;
  if (!posts || posts.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhuma publicação encontrada nas contas conectadas.</div>';
    return;
  }
  grid.innerHTML = posts.map((post) => {
    const caption = post.caption ? escapeHtml(truncateUrl(post.caption.replace(/\s+/g, " "), 60)) : "(sem legenda)";
    const when = post.timestamp ? new Date(post.timestamp).toLocaleDateString("pt-BR") : "";
    return (
      '<div class="automation-card">' +
      (post.thumbnail_url
        ? '<img src="' + escapeHtml(safeUrl(post.thumbnail_url)) + '" alt="" style="width:100%;border-radius:var(--radius-sm);aspect-ratio:1;object-fit:cover;" />'
        : "") +
      '<div class="automation-card-top"><span class="badge badge-muted">@' + escapeHtml(post.instagram_username || "") + "</span>" +
      (when ? '<span class="automation-card-footer" style="padding:0;border:none;">' + when + "</span>" : "") +
      "</div>" +
      '<div class="automation-card-post" style="white-space:normal;">' + caption + "</div>" +
      '<div class="automation-card-actions" style="justify-content:flex-start;gap:0.5rem;">' +
      '<button class="btn btn-primary btn-sm create-automation-from-post-btn" data-shortcode="' + escapeHtml(post.shortcode || post.media_id) + '">Criar automação</button>' +
      '<button class="btn btn-outline btn-sm view-all-posts-btn" data-config-id="' + escapeHtml(post.instagram_config_id) + '" data-username="' + escapeHtml(post.instagram_username || "") + '">Ver todas</button>' +
      "</div></div>"
    );
  }).join("");
  grid.querySelectorAll(".create-automation-from-post-btn").forEach((btn) =>
    btn.addEventListener("click", () => fillAutomationForm(btn.getAttribute("data-shortcode")))
  );
  grid.querySelectorAll(".view-all-posts-btn").forEach((btn) =>
    btn.addEventListener("click", () => openAllPostsModal(btn.getAttribute("data-config-id"), btn.getAttribute("data-username")))
  );
}
async function loadLatestPosts() {
  const grid = $("#latestPostsGrid");
  if (!grid) return;
  grid.innerHTML = '<div class="loading-row">Carregando publicações…</div>';
  try {
    const { data, error } = await supabase.functions.invoke("list-instagram-posts", {
      body: { mode: "latest" },
    });
    if (error) throw error;
    renderLatestPosts(data && data.posts);
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Erro ao carregar publicações: ' + escapeHtml(error.message) + "</div>";
  }
}
function fillAutomationForm(shortcode) {
  $("#instagramMediaId").value = shortcode || "";
  syncPostPreview();
  $("#palavraChave").focus();
  const panel = $("#instagramMediaId").closest("section");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  closeAllPostsModal();
}
function closeAllPostsModal() {
  const existing = document.getElementById("allPostsModalOverlay");
  if (existing) existing.remove();
}
async function openAllPostsModal(instagramConfigId, username) {
  closeAllPostsModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "allPostsModalOverlay";
  overlay.innerHTML =
    '<div class="modal-box modal-box-lg">' +
    '<div class="modal-header"><h2>Publicações de @' + escapeHtml(username || "") + '</h2>' +
    '<button type="button" class="modal-close" id="allPostsModalCloseBtn">&times;</button></div>' +
    '<div class="modal-body"><div id="allPostsModalGrid" class="automation-grid"><div class="loading-row">Carregando…</div></div></div>' +
    "</div>";
  document.body.appendChild(overlay);
  $("#allPostsModalCloseBtn").addEventListener("click", closeAllPostsModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAllPostsModal();
  });

  try {
    const { data, error } = await supabase.functions.invoke("list-instagram-posts", {
      body: { mode: "all", instagram_config_id: instagramConfigId },
    });
    if (error) throw error;
    const posts = (data && data.posts) || [];
    const modalGrid = $("#allPostsModalGrid");
    if (!modalGrid) return;
    if (posts.length === 0) {
      modalGrid.innerHTML = '<div class="empty-state">Nenhuma publicação encontrada.</div>';
      return;
    }
    modalGrid.innerHTML = posts.map((post) => {
      const caption = post.caption ? escapeHtml(truncateUrl(post.caption.replace(/\s+/g, " "), 50)) : "(sem legenda)";
      return (
        '<div class="automation-card">' +
        (post.thumbnail_url
          ? '<img src="' + escapeHtml(safeUrl(post.thumbnail_url)) + '" alt="" style="width:100%;border-radius:var(--radius-sm);aspect-ratio:1;object-fit:cover;" />'
          : "") +
        '<div class="automation-card-post" style="white-space:normal;">' + caption + "</div>" +
        '<button class="btn btn-primary btn-sm create-automation-from-post-btn" data-shortcode="' + escapeHtml(post.shortcode || post.media_id) + '">Criar automação</button>' +
        "</div>"
      );
    }).join("");
    modalGrid.querySelectorAll(".create-automation-from-post-btn").forEach((btn) =>
      btn.addEventListener("click", () => fillAutomationForm(btn.getAttribute("data-shortcode")))
    );
  } catch (error) {
    const modalGrid = $("#allPostsModalGrid");
    if (modalGrid) modalGrid.innerHTML = '<div class="empty-state">Erro ao carregar: ' + escapeHtml(error.message) + "</div>";
  }
}
// ---------- Nova automação: escolher o post das contas conectadas ----------
const POST_THUMB_FALLBACK =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>';
let pickedPost = null;        // post escolhido no seletor (ou encontrado pelo link colado)
let postPickerConfigId = null; // conta exibida no seletor
let postPickerPosts = [];      // posts da conta exibida
let postPickerToken = 0;       // descarta respostas antigas ao trocar de conta
let postPreviewToken = 0;

function igAccountLabel(acc) {
  return acc && acc.instagram_username ? "@" + acc.instagram_username : "Conta conectada";
}
function postKey(post) {
  return String(post.shortcode || post.media_id || "");
}
function postMatches(post, code) {
  return !!code && (String(post.shortcode || "") === code || String(post.media_id || "") === code);
}
function uniquePosts(posts) {
  const seen = new Set();
  return (posts || []).filter((p) => {
    const key = postKey(p);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function automationCountForPost(post) {
  return allAutomations.filter((r) =>
    postMatches(post, String(r.instagram_media_id || ""))
  ).length;
}

function renderPostPickerTabs() {
  const box = $("#postPickerAccounts");
  if (currentIgAccounts.length <= 1) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = currentIgAccounts.map((acc) =>
    '<button type="button" class="pp-tab' + (String(acc.id) === String(postPickerConfigId) ? " active" : "") +
    '" data-config-id="' + escapeHtml(acc.id) + '">' + escapeHtml(igAccountLabel(acc)) + "</button>"
  ).join("");
  box.classList.remove("hidden");
}
function renderPostPickerGrid() {
  const body = $("#postPickerBody");
  const term = $("#postPickerSearch").value.trim().toLowerCase();
  const selectedCode = extractShortcode($("#instagramMediaId").value);
  const posts = term
    ? postPickerPosts.filter((p) => String(p.caption || "").toLowerCase().includes(term))
    : postPickerPosts;
  if (posts.length === 0) {
    body.innerHTML = '<div class="empty-state">' +
      (term ? "Nenhum post com essa legenda." : "Nenhuma publicação encontrada nesta conta.") + "</div>";
    return;
  }
  body.innerHTML = '<div class="pp-grid">' + posts.map((post) => {
    const key = postKey(post);
    const caption = post.caption ? escapeHtml(post.caption.replace(/\s+/g, " ")) : "Sem legenda";
    const count = automationCountForPost(post);
    const selected = postMatches(post, selectedCode);
    return (
      '<button type="button" class="pp-tile' + (selected ? " is-selected" : "") + '" data-key="' + escapeHtml(key) +
      '" aria-pressed="' + selected + '">' +
      '<span class="pp-thumb">' +
      (post.thumbnail_url
        ? '<img loading="lazy" src="' + escapeHtml(safeUrl(post.thumbnail_url)) + '" alt="" />'
        : '<span class="pp-thumb-empty">' + POST_THUMB_FALLBACK + "</span>") +
      (count ? '<span class="pp-badge">' + count + (count === 1 ? " automação" : " automações") + "</span>" : "") +
      "</span>" +
      '<span class="pp-cap">' + caption + "</span>" +
      "</button>"
    );
  }).join("") + "</div>";
}
async function loadPostPicker(configId) {
  postPickerConfigId = configId;
  const token = ++postPickerToken;
  const body = $("#postPickerBody");
  renderPostPickerTabs();
  body.innerHTML = '<div class="loading-row">Carregando posts…</div>';
  try {
    const posts = await fetchAccountPosts(configId);
    if (token !== postPickerToken) return;
    postPickerPosts = uniquePosts(posts);
    renderPostPickerGrid();
  } catch (error) {
    if (token !== postPickerToken) return;
    postPickerPosts = [];
    body.innerHTML = '<div class="empty-state">Não foi possível carregar os posts. ' +
      '<button type="button" class="btn btn-outline btn-sm" id="postPickerRetryBtn">Tentar de novo</button></div>';
  }
}
function openPostPicker() {
  if (currentIgAccounts.length === 0) {
    showBanner("statusBanner", "Conecte uma conta do Instagram para escolher um post.", "error");
    return;
  }
  const selectedId = $("#automationIgAccount").value;
  const start = currentIgAccounts.find((a) => String(a.id) === String(selectedId)) || currentIgAccounts[0];
  $("#postPickerSearch").value = "";
  $("#postPickerModal").classList.remove("hidden");
  loadPostPicker(start.id);
}
function closePostPicker() {
  $("#postPickerModal").classList.add("hidden");
}
function choosePost(post) {
  const select = $("#automationIgAccount");
  const configId = String(post.instagram_config_id || postPickerConfigId || "");
  if (configId && Array.from(select.options).some((o) => o.value === configId)) select.value = configId;
  $("#instagramMediaId").value = postKey(post);
  pickedPost = Object.assign({}, post, { instagram_config_id: configId });
  closePostPicker();
  syncPostPreview();
}

function renderPostPreview(info) {
  const box = $("#postPreview");
  $("#pickPostBtn").classList.toggle("hidden", !!info);
  $("#postManualField").classList.toggle("hidden", !!info);
  box.classList.toggle("hidden", !info);
  if (!info) {
    box.innerHTML = "";
    return;
  }
  const post = info.post;
  const acc = currentIgAccounts.find((a) => String(a.id) === String(info.configId));
  const owner = post && post.instagram_username ? "@" + post.instagram_username : acc ? igAccountLabel(acc) : "";
  const title = post ? owner || "Post selecionado" : "Post informado";
  const detail = post
    ? (post.caption ? post.caption.replace(/\s+/g, " ") : "Sem legenda")
    : info.code;
  box.innerHTML =
    (post && post.thumbnail_url
      ? '<img class="post-preview-thumb" src="' + escapeHtml(safeUrl(post.thumbnail_url)) + '" alt="" />'
      : '<span class="post-preview-thumb">' + POST_THUMB_FALLBACK + "</span>") +
    '<div class="post-preview-info"><strong>' + escapeHtml(title) + "</strong><span>" + escapeHtml(detail) + "</span></div>" +
    '<div class="post-preview-actions">' +
    '<button type="button" class="btn btn-outline btn-sm" data-post-action="change">Trocar</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-post-action="clear">Remover</button>' +
    "</div>";
}
// Mostra o post atual (escolhido no seletor, colado ou vindo de "Últimas publicações").
async function syncPostPreview() {
  const raw = $("#instagramMediaId").value.trim();
  const token = ++postPreviewToken;
  if (!raw) {
    pickedPost = null;
    renderPostPreview(null);
    return;
  }
  const code = extractShortcode(raw);
  const configId = $("#automationIgAccount").value;
  let post = null;
  if (pickedPost && postMatches(pickedPost, code) &&
      (!pickedPost.instagram_config_id || !configId || String(pickedPost.instagram_config_id) === String(configId))) {
    post = pickedPost;
  }
  renderPostPreview({ code, post, configId });
  if (post || !configId) return;
  try {
    const posts = await fetchAccountPosts(configId);
    if (token !== postPreviewToken) return;
    const found = posts.find((p) => postMatches(p, code));
    if (found) renderPostPreview({ code, post: found, configId });
  } catch (_) { /* sem miniatura: o preview simples já está na tela */ }
}

$("#pickPostBtn").addEventListener("click", openPostPicker);
$("#closePostPickerBtn").addEventListener("click", closePostPicker);
$("#postPickerModal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closePostPicker();
});
$("#postPickerSearch").addEventListener("input", renderPostPickerGrid);
$("#postPickerAccounts").addEventListener("click", (event) => {
  const tab = event.target.closest(".pp-tab");
  if (!tab || tab.classList.contains("active")) return;
  $("#postPickerSearch").value = "";
  loadPostPicker(tab.getAttribute("data-config-id"));
});
$("#postPickerBody").addEventListener("click", (event) => {
  if (event.target.closest("#postPickerRetryBtn")) {
    loadPostPicker(postPickerConfigId);
    return;
  }
  const tile = event.target.closest(".pp-tile");
  if (!tile) return;
  const post = postPickerPosts.find((p) => postKey(p) === tile.getAttribute("data-key"));
  if (post) choosePost(post);
});
$("#postPreview").addEventListener("click", (event) => {
  const action = event.target.closest("[data-post-action]");
  if (!action) return;
  if (action.getAttribute("data-post-action") === "change") {
    openPostPicker();
    return;
  }
  $("#instagramMediaId").value = "";
  pickedPost = null;
  syncPostPreview();
  $("#instagramMediaId").focus();
});
$("#instagramMediaId").addEventListener("change", syncPostPreview);
$("#automationIgAccount").addEventListener("change", syncPostPreview);

// A folha "Nova automação" é aberta/fechada por outro módulo (só troca a classe "hidden"):
// aqui só reagimos a isso — travar a rolagem do fundo no celular e atualizar o preview.
(function watchNewAutomationSheet() {
  const sheet = $("#subtab-new");
  const tab = $("#tab-dashboard");
  if (!sheet) return;
  const sync = () => {
    const open = sheet.getClientRects().length > 0;
    document.body.classList.toggle("sheet-open", open);
    if (open) syncPostPreview();
  };
  const observer = new MutationObserver(sync);
  [sheet, tab].forEach((el) => el && observer.observe(el, { attributes: true, attributeFilter: ["class"] }));
})();

// ---------- Automações cadastradas: conta + post de cada automação ----------
// Descobre a qual conta do Instagram a automação pertence. Automações antigas
// sem instagram_config_id caem na única conta conectada (se houver só uma).
function resolveAutomationAccount(row) {
  if (row.instagram_config_id) {
    return currentIgAccounts.find((a) => String(a.id) === String(row.instagram_config_id)) || null;
  }
  return currentIgAccounts.length === 1 ? currentIgAccounts[0] : null;
}
function automationAccountLabel(row) {
  const acc = resolveAutomationAccount(row);
  if (acc) return acc.instagram_username ? "@" + acc.instagram_username : "Conta conectada";
  if (row.instagram_config_id) return "Conta desconectada";
  return "Conta não identificada";
}
// Link público do post; só quando o valor guardado parece um shortcode
// (IDs numéricos longos de mídia não abrem como /p/<id>).
function instagramPostLink(mediaId) {
  const code = String(mediaId || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  if (/^\d{12,}$/.test(code)) return null;
  return "https://www.instagram.com/p/" + code + "/";
}
// Busca (uma vez por conta) a lista de publicações. Rejeita em caso de erro.
function fetchAccountPosts(configId) {
  if (!accountPostsListCache[configId]) {
    accountPostsListCache[configId] = supabase.functions
      .invoke("list-instagram-posts", { body: { mode: "all", instagram_config_id: configId } })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data && data.posts) || [];
      })
      .catch((err) => {
        delete accountPostsListCache[configId]; // permite tentar de novo depois
        throw err;
      });
  }
  return accountPostsListCache[configId];
}
// Busca (uma vez por conta) as publicações para achar miniatura e legenda.
function getAccountPosts(configId) {
  if (!configId) return Promise.resolve(new Map());
  if (!accountPostsCache[configId]) {
    accountPostsCache[configId] = fetchAccountPosts(configId)
      .then((posts) => {
        const map = new Map();
        posts.forEach((p) => {
          if (p.shortcode) map.set(String(p.shortcode), p);
          if (p.media_id) map.set(String(p.media_id), p);
        });
        return map;
      })
      .catch((err) => {
        console.error("Erro ao buscar posts da conta:", err.message);
        delete accountPostsCache[configId]; // permite tentar de novo depois
        return new Map();
      });
  }
  return accountPostsCache[configId];
}
async function enrichAutomationCards(rows) {
  const configIds = new Set();
  rows.forEach((row) => {
    const acc = resolveAutomationAccount(row);
    if (acc) configIds.add(acc.id);
  });
  await Promise.all(Array.from(configIds).map(async (configId) => {
    const postsMap = await getAccountPosts(configId);
    document.querySelectorAll('.automation-card[data-config-id="' + configId + '"]').forEach((card) => {
      const code = card.getAttribute("data-media");
      const post = postsMap.get(String(code));
      const thumbBox = card.querySelector(".auto-post-thumb");
      const captionEl = card.querySelector(".auto-post-caption");
      if (!thumbBox || !captionEl) return;
      if (!post) {
        captionEl.textContent = "Legenda indisponível (post antigo ou removido)";
        thumbBox.textContent = "📷";
        return;
      }
      captionEl.textContent = post.caption
        ? truncateUrl(post.caption.replace(/\s+/g, " "), 90)
        : "(sem legenda)";
      if (post.thumbnail_url) {
        thumbBox.innerHTML =
          '<img src="' + escapeHtml(safeUrl(post.thumbnail_url)) + '" alt="" style="width:100%;height:100%;object-fit:cover;" />';
      } else {
        thumbBox.textContent = "📷";
      }
    });
  }));
}
function renderAutomations(rows) {
  const grid = $("#automationsTableBody");
  if (!rows || rows.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhuma automação ainda. Toque em “+ Nova automação” para criar a primeira.</div>';
    return;
  }
  grid.innerHTML = rows.map((row) => {
    const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
    const statusText = row.ativo ? "Ativo" : "Inativo";
    const created = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—";
    const acc = resolveAutomationAccount(row);
    const accountLabel = automationAccountLabel(row);
    const accountBadgeClass = acc ? "badge-muted" : "badge-danger";
    const postLink = instagramPostLink(row.instagram_media_id);
    const postLinkHtml = postLink
      ? '<a class="automation-card-link" href="' + escapeHtml(postLink) + '" target="_blank" rel="noopener noreferrer">Ver post no Instagram ↗</a>'
      : "";
    const productTitle = row.titulo_produto ? escapeHtml(truncateUrl(row.titulo_produto, 40)) : "";
    return (
      '<div class="automation-card" data-id="' + escapeHtml(row.id) + '" data-ativo="' + (row.ativo ? "true" : "false") + '"' +
      ' data-config-id="' + escapeHtml(acc ? acc.id : "") + '" data-media="' + escapeHtml(row.instagram_media_id) + '">' +
      '<div class="automation-card-top">' +
      '<span class="badge ' + statusClass + '">' + statusText + "</span>" +
      '<div class="automation-card-actions">' +
      '<button class="icon-btn toggle-btn" title="' + (row.ativo ? "Desativar" : "Ativar") + '">' + (row.ativo ? "🔇" : "🔊") + "</button>" +
      '<button class="icon-btn delete-btn" title="Excluir">🗑️</button>' +
      "</div></div>" +
      '<div><span class="badge ' + accountBadgeClass + '" title="Conta do Instagram desta automação">📸 ' + escapeHtml(accountLabel) + "</span></div>" +
      '<div class="automation-card-postinfo" style="display:flex;gap:0.65rem;align-items:center;">' +
      '<div class="auto-post-thumb" style="width:56px;height:56px;border-radius:var(--radius-sm);background:var(--surface-2);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:var(--text-faint);">📷</div>' +
      '<div style="min-width:0;flex:1;">' +
      '<div class="auto-post-caption" style="font-size:0.8rem;color:var(--text-muted);line-height:1.35;word-break:break-word;">' +
      (acc ? "Carregando legenda…" : "Conecte a conta para ver o post") + "</div>" +
      postLinkHtml +
      "</div></div>" +
      '<div class="automation-card-keyword"><span class="keyword-chip">' + escapeHtml(row.palavra_chave === "*" ? "Qualquer comentário" : row.palavra_chave) + "</span></div>" +
      '<div class="automation-card-post">ID do post: ' + escapeHtml(truncateUrl(row.instagram_media_id, 34)) + "</div>" +
      (productTitle ? '<div class="automation-card-post" style="color:var(--text);font-weight:600;">🛍️ ' + productTitle + "</div>" : "") +
      (row.fluxo_id
        ? '<div class="automation-card-post" style="color:var(--text);font-weight:600;">🔀 <span class="fluxo-chip-name" data-fluxo-id="' + escapeHtml(row.fluxo_id) + '">Fluxo de conversa</span></div>'
        : '<a class="automation-card-link" href="' + escapeHtml(safeUrl(row.produto_url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(truncateUrl(row.produto_url, 40)) + "</a>") +
      '<div class="automation-card-footer">Criado em ' + created + "</div>" +
      "</div>"
    );
  }).join("");
  document.querySelectorAll(".toggle-btn").forEach((btn) => btn.addEventListener("click", toggleActive));
  document.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", deleteAutomation));
  enrichAutomationCards(rows);
}
async function loadAutomations() {
  const loading = $("#loadingAutomations");
  loading.classList.remove("hidden");
  $("#automationsTableBody").innerHTML = "";
  try {
    const { data, error } = await supabase
      .from(AUTOMATIONS_TABLE)
      .select("*")
      .eq("user_id", currentUser.id)
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
function renderFilteredAutomations() {
  const input = $("#automationSearch");
  const term = input ? input.value.trim().toLowerCase() : "";
  if (!term) {
    renderAutomations(allAutomations);
    return;
  }
  const filtered = allAutomations.filter((r) =>
    (r.palavra_chave || "").toLowerCase().includes(term) ||
    (r.palavra_chave === "*" && "qualquer comentário".includes(term)) ||
    (r.produto_url || "").toLowerCase().includes(term) ||
    (r.instagram_media_id || "").toLowerCase().includes(term) ||
    (r.titulo_produto || "").toLowerCase().includes(term) ||
    automationAccountLabel(r).toLowerCase().includes(term)
  );
  renderAutomations(filtered);
}
$("#automationSearch").addEventListener("input", renderFilteredAutomations);
async function toggleActive(event) {
  const card = event.currentTarget.closest(".automation-card");
  const id = card.getAttribute("data-id");
  const currentAtivo = card.getAttribute("data-ativo") === "true";
  try {
    const { error } = await supabase.from(AUTOMATIONS_TABLE).update({ ativo: !currentAtivo }).eq("id", id);
    if (error) throw error;
    const row = allAutomations.find((r) => String(r.id) === String(id));
    if (row) row.ativo = !currentAtivo;
    updateAutomationKpis(allAutomations);
    renderFilteredAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao alternar status: " + error.message, "error");
  }
}
async function deleteAutomation(event) {
  const card = event.currentTarget.closest(".automation-card");
  const id = card.getAttribute("data-id");
  if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
  try {
    const { error } = await supabase.from(AUTOMATIONS_TABLE).delete().eq("id", id);
    if (error) throw error;
    showBanner("statusBanner", "Automação excluída.", "success");
    allAutomations = allAutomations.filter((r) => String(r.id) !== String(id));
    updateAutomationKpis(allAutomations);
    renderFilteredAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao excluir: " + error.message, "error");
  }
}
$("#toggleImagemUrlBtn").addEventListener("click", () => {
  $("#imagemUrlField").classList.toggle("hidden");
});
document.querySelectorAll('input[name="triggerMode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const anyMode = document.querySelector('input[name="triggerMode"]:checked').value === "any";
    $("#palavraChaveField").classList.toggle("hidden", anyMode);
  });
});
$("#saveAutomationBtn").addEventListener("click", async () => {
  const mediaIdInput = $("#instagramMediaId");
  const palavraChaveInput = $("#palavraChave");
  const produtoUrlInput = $("#produtoUrl");
  const imagemUrlInput = $("#imagemUrl");
  const tituloProdutoInput = $("#tituloProduto");
  const precoProdutoInput = $("#precoProduto");
  const mediaIdRaw = mediaIdInput.value.trim();
  const anyMode = document.querySelector('input[name="triggerMode"]:checked').value === "any";
  const palavraChave = anyMode ? "*" : palavraChaveInput.value.trim();
  const produtoUrl = produtoUrlInput.value.trim();
  const imagemUrl = imagemUrlInput.value.trim() || null;
  const tituloProduto = tituloProdutoInput.value.trim() || null;
  const precoProduto = precoProdutoInput.value.trim() || null;
  const igAccountId = $("#automationIgAccount").value || null;
  const fluxoId = ($("#fluxoSelect") || {}).value || null;
  if (!mediaIdRaw || !palavraChave || (!produtoUrl && !fluxoId)) {
    showBanner("statusBanner", "Post, palavra-chave (ou \"qualquer comentário\") e link do produto (ou um fluxo) são obrigatórios.", "error");
    return;
  }
  if (produtoUrl && !isValidHttpUrl(produtoUrl)) {
    showBanner("statusBanner", "O link do produto precisa começar com http:// ou https://", "error");
    return;
  }
  if (imagemUrl && !isValidHttpUrl(imagemUrl)) {
    showBanner("statusBanner", "A URL da imagem precisa começar com http:// ou https://", "error");
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
  if (anyMode && allAutomations.some((r) => r.instagram_media_id === shortcode && String(r.palavra_chave || "").trim() === "*")) {
    showBanner("statusBanner", "Esse post já tem uma automação de qualquer comentário. Nele, só é possível criar outras com palavra-chave específica.", "error");
    return;
  }
  try {
    const { error } = await supabase.from(AUTOMATIONS_TABLE).insert({
      user_id: currentUser.id,
      instagram_media_id: shortcode,
      palavra_chave: palavraChave,
      produto_url: produtoUrl || "",
      ...(fluxoId ? { fluxo_id: fluxoId } : {}),
      imagem_url: imagemUrl,
      titulo_produto: tituloProduto,
      preco_produto: precoProduto,
      instagram_config_id: igAccountId,
      ativo: true,
    });
    if (error) throw error;
    showBanner("statusBanner", "Automação salva com sucesso!", "success");
    mediaIdInput.value = "";
    pickedPost = null;
    syncPostPreview();
    palavraChaveInput.value = "";
    document.querySelector('input[name="triggerMode"][value="keyword"]').checked = true;
    $("#palavraChaveField").classList.remove("hidden");
    produtoUrlInput.value = "";
    imagemUrlInput.value = "";
    tituloProdutoInput.value = "";
    precoProdutoInput.value = "";
    $("#imagemUrlField").classList.add("hidden");
    const fluxoSel = $("#fluxoSelect");
    if (fluxoSel) { fluxoSel.value = ""; fluxoSel.dispatchEvent(new Event("change")); }
    await loadAutomations();
  } catch (error) {
    showBanner("statusBanner", "Erro ao salvar automação: " + error.message, "error");
  }
});
$("#inviteUserBtn").addEventListener("click", async () => {
  const emailInput = $("#inviteEmail");
  const founderCheckbox = $("#inviteFounderCheckbox");
  const email = emailInput.value.trim();
  const nomeInput = $("#inviteNome");
  const nomeConvidado = nomeInput ? nomeInput.value.trim() : "";
  const isFounder = !!(founderCheckbox && founderCheckbox.checked);
  if (!email) {
    showBanner("statusBanner", "Informe o e-mail do novo cliente.", "error");
    return;
  }
  $("#inviteUserBtn").disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: { email, is_founder: isFounder },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    showBanner(
      "statusBanner",
      "Convite enviado para " + email + (isFounder ? " (membro fundador 🏅)." : "."),
      "success"
    );
    // Grava o nome no perfil do convidado (o perfil nasce com o convite).
    if (nomeConvidado && window.NomeUsuario) await window.NomeUsuario.setByEmail(email, nomeConvidado);
    emailInput.value = "";
    if (nomeInput) nomeInput.value = "";
    if (founderCheckbox) founderCheckbox.checked = false;
    await loadUsers();
  } catch (error) {
    showBanner("statusBanner", "Erro ao convidar: " + error.message, "error");
  } finally {
    $("#inviteUserBtn").disabled = false;
  }
});
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
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum usuário encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((u) => {
    const statusClass = u.is_active ? "badge-ativo" : "badge-inativo";
    const statusText = u.is_active ? "Ativo" : "Inativo";
    const created = u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "—";
    let paymentBadge = "";
    const ps = u.payment_status;
    if (ps === "em_dia") {
      paymentBadge = '<span class="badge badge-ativo">Em dia</span>';
    } else if (ps === "atrasado") {
      paymentBadge = '<span class="badge badge-danger">Atrasado' + (u._lateDays ? " · " + u._lateDays + "d" : "") + "</span>";
    } else if (ps === "cancelado") {
      paymentBadge = '<span class="badge badge-muted">Cancelado</span>';
    } else {
      paymentBadge = '<span class="badge badge-muted">—</span>';
    }
    const dueDateStr = u.payment_due_date
      ? new Date(u.payment_due_date + (String(u.payment_due_date).length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR")
      : "—";
    const planValueStr = u.monthly_plan_value
      ? "R$ " + Number(u.monthly_plan_value).toFixed(2).replace(".", ",")
      : "—";
    const disableSelfToggle = u.id === currentUser.id
      ? "disabled title='Você não pode desativar a própria conta'"
      : "";
    return (
      '<tr data-id="' + escapeHtml(u.id) + '">' +
      "<td>" + (u.nome ? "<strong>" + escapeHtml(u.nome) + "</strong><br>" : "") + escapeHtml(u.email) +
      (u.is_admin ? ' <span class="badge badge-ativo">admin</span>' : "") +
      (u.is_founder ? ' <span class="badge badge-founder">🏅 fundador</span>' : "") + "</td>" +
      "<td>" + created + "</td>" +
      '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
      "<td>" + paymentBadge + "</td>" +
      "<td>" + escapeHtml(dueDateStr) + "</td>" +
      "<td>" + escapeHtml(planValueStr) + "</td>" +
      "<td>" + (u.ig_account_limit || 1) + "</td>" +
      '<td class="table-actions">' +
      '<button class="btn btn-outline btn-sm user-toggle-btn" ' + disableSelfToggle +
      ' data-active="' + u.is_active + '">' +
      (u.is_active ? "Desativar" : "Ativar") + "</button> " +
      '<button class="btn btn-outline btn-sm edit-payment-btn" data-user-id="' + escapeHtml(u.id) + '">' +
      "Editar cobrança</button> " +
      '<button class="btn btn-outline btn-sm view-autos-btn" data-user-id="' + escapeHtml(u.id) + '">' +
      "Ver automações</button>" +
      "</td></tr>"
    );
  }).join("");
  document.querySelectorAll(".user-toggle-btn").forEach((btn) => btn.addEventListener("click", toggleUserActive));
  document.querySelectorAll(".edit-payment-btn").forEach((btn) => btn.addEventListener("click", openEditPaymentModal));
  document.querySelectorAll(".view-autos-btn").forEach((btn) => btn.addEventListener("click", openViewAutosModal));
}
// Atraso de verdade vem da tabela `pagamentos` (cobrança pendente já vencida).
// Marca como "atrasado" quem está "em dia"/sem status mas tem cobrança vencida.
async function applyOverdue(rows) {
  try {
    const n = new Date();
    const hoje = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
    const { data, error } = await supabase
      .from("pagamentos")
      .select("user_id, vencimento")
      .eq("status", "pendente")
      .lt("vencimento", hoje)
      .order("vencimento", { ascending: true });
    if (error || !data) return rows;
    const oldest = {};
    data.forEach((p) => { if (!oldest[p.user_id]) oldest[p.user_id] = p.vencimento; });
    rows.forEach((u) => {
      const v = oldest[u.id];
      if (!v) return;
      if (!u.payment_status || u.payment_status === "em_dia") u.payment_status = "atrasado";
      if (u.payment_status === "atrasado") {
        u._lateDays = Math.max(1, Math.floor((Date.now() - new Date(String(v).slice(0, 10) + "T00:00:00")) / 864e5));
      }
    });
  } catch (_) { /* sem tabela/permissão: mantém o status do cadastro */ }
  return rows;
}
async function loadUsers() {
  const loading = $("#loadingUsers");
  loading.classList.remove("hidden");
  $("#usersTableBody").innerHTML = "";
  try {
    try { await supabase.rpc("admin_sync_atrasados"); } catch (_) { /* atrasados.sql ainda não rodado */ }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    allUsers = await applyOverdue(data || []);
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
  renderUsers(allUsers.filter((u) => ((u.nome || "") + " " + (u.email || "")).toLowerCase().includes(term)));
});
// O módulo de Pagamentos (pagamentos.js) avisa quando muda valor/vencimento de um cliente.
window.addEventListener("admin-users-changed", () => {
  if (currentProfile && currentProfile.is_admin) loadUsers();
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
function userLabel(userId) {
  const u = allUsers.find((x) => x.id === userId);
  return (u && (u.nome ? u.nome + " (" + u.email + ")" : u.email)) || userId;
}
// Modais que já existem no index.html (ou foram injetados por outros módulos) só são
// escondidos; remover do DOM quebrava "Novo produto"/seletor de produto depois do 1º Esc.
const PERSISTENT_MODALS = ["produtoModal", "produtoPickerModal", "postPickerModal", "pwModal"];
function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    if (PERSISTENT_MODALS.includes(overlay.id)) overlay.classList.add("hidden");
    else overlay.remove();
  });
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
        <p class="modal-sub">Alterando os dados abaixo para <strong>${escapeHtml(userLabel(userId))}</strong>.</p>
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
          <p class="field-hint">1 conta = R$99,90 · até 3 contas = R$189,90 · cada conta extra = +R$49,90</p>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="suggestPlanValueBtn">Sugerir valor do plano com base no limite</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="cancelEditPayment">Cancelar</button>
        <button class="btn btn-primary" id="saveEditPayment">Salvar</button>
      </div>
    </div>
  `;
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
    const parsedValue = valueRaw ? parseFloat(valueRaw) : null;
    const monthlyPlanValue = Number.isFinite(parsedValue) ? parsedValue : null;
    const parsedLimit = igLimitRaw ? parseInt(igLimitRaw, 10) : 1;
    const igAccountLimit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 1;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          payment_status: status,
          payment_due_date: dueDate,
          monthly_plan_value: monthlyPlanValue,
          ig_account_limit: igAccountLimit,
        })
        .eq("id", userId);
      if (error) throw error;
      // Definir valor de plano para quem está em teste grátis = ele escolheu um plano → vira pagante.
      if (monthlyPlanValue && monthlyPlanValue > 0) {
        try {
          const { data: trials } = await supabase.rpc("admin_list_trials");
          if (Array.isArray(trials) && trials.some((t) => t.id === userId)) {
            await supabase.rpc("admin_end_trial", { p_user_id: userId, p_convert: true });
          }
        } catch (_) { /* sem teste ativo ou função indisponível: segue normal */ }
      }
      showBanner("statusBanner", "Cobrança atualizada com sucesso.", "success");
      closeModal();
      await loadUsers();
    } catch (err) {
      showBanner("statusBanner", "Erro ao atualizar cobrança: " + err.message, "error");
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
        <h2>Automações — ${escapeHtml(userLabel(userId))}</h2>
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
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
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
    const loadingEl = $("#viewAutosLoading");
    if (!loadingEl) return; // modal foi fechado enquanto carregava
    loadingEl.classList.add("hidden");
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
      const row = typeof r === "string" ? JSON.parse(r) : r;
      const statusClass = row.ativo ? "badge-ativo" : "badge-inativo";
      const statusText = row.ativo ? "Ativo" : "Inativo";
      const created = row.created_at
        ? new Date(row.created_at).toLocaleString("pt-BR")
        : "—";
      return (
        "<tr>" +
        "<td>" + escapeHtml(row.instagram_media_id) + "</td>" +
        "<td>" + escapeHtml(row.palavra_chave === "*" ? "Qualquer comentário" : row.palavra_chave) + "</td>" +
        '<td><a href="' + escapeHtml(safeUrl(row.produto_url)) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(truncateUrl(row.produto_url, 40)) + "</a></td>" +
        '<td><span class="badge ' + statusClass + '">' + statusText + "</span></td>" +
        "<td>" + created + "</td>" +
        "</tr>"
      );
    }).join("");
  } catch (err) {
    const loadingEl = $("#viewAutosLoading");
    if (!loadingEl) return;
    loadingEl.classList.add("hidden");
    $("#viewAutosError").textContent = "Erro inesperado: " + err.message;
    $("#viewAutosError").classList.remove("hidden");
  }
}
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && currentUser) {
    currentUser = null;
    currentProfile = null;
    showScreen("auth");
  }
});
bootstrapSession();
