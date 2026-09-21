// instagram-latest-posts.js
// Mostra o último post de cada conta do Instagram conectada, com um botão
// que pré-preenche o formulário de "Nova automação" já existente. Não salva
// nada — busca ao vivo toda vez que a tela é aberta. Isolado de app.js,
// usa o próprio client do Supabase.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// IMPORTANTE: só o app.js pode processar o token do link de convite/recuperação
// (detectSessionInUrl). Aqui a gente só LÊ a sessão que ele já estabeleceu.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

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

function renderPosts(posts) {
  const container = $("#latestPostsGrid");
  if (!container) return;

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum post encontrado nas contas conectadas.</div>';
    return;
  }

  container.innerHTML = posts
    .map((post) => {
      const captionShort = escapeHtml(post.caption || "(sem legenda)").slice(0, 90);
      const imageHtml = post.image
        ? '<img src="' + escapeHtml(post.image) + '" alt="" class="latest-post-thumb" />'
        : '<div class="latest-post-thumb latest-post-thumb-empty">Sem prévia</div>';
      return (
        '<div class="latest-post-card">' +
        imageHtml +
        '<div class="latest-post-info">' +
        "<strong>@" + escapeHtml(post.username || "") + "</strong>" +
        "<p>" + captionShort + (post.caption && post.caption.length > 90 ? "…" : "") + "</p>" +
        "</div>" +
        '<button type="button" class="btn btn-primary btn-sm latest-post-btn" ' +
        'data-media-id="' + escapeHtml(post.media_id || "") + '" ' +
        'data-config-id="' + escapeHtml(post.instagram_config_id || "") + '">' +
        "Criar automação" +
        "</button>" +
        "</div>"
      );
    })
    .join("");

  container.querySelectorAll(".latest-post-btn").forEach((btn) =>
    btn.addEventListener("click", () => useForAutomation(btn))
  );
}

function useForAutomation(btn) {
  const mediaId = btn.getAttribute("data-media-id");
  const configId = btn.getAttribute("data-config-id");

  const mediaInput = document.getElementById("instagramMediaId");
  if (mediaInput && mediaId) mediaInput.value = mediaId;

  const accountSelect = document.getElementById("automationIgAccount");
  if (accountSelect && configId) accountSelect.value = configId;

  const panel = document.getElementById("saveAutomationBtn");
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const palavraChaveInput = document.getElementById("palavraChave");
  if (palavraChaveInput) palavraChaveInput.focus();
}

async function loadLatestPosts() {
  const container = $("#latestPostsGrid");
  if (!container) return;
  container.innerHTML = '<div class="loading-row">Buscando os últimos posts das suas contas…</div>';

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    container.innerHTML = '<div class="empty-state">Sua sessão expirou. Atualize a página.</div>';
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke("list-latest-posts", { method: "POST" });
    if (error) throw error;
    renderPosts(data?.posts || []);
  } catch (error) {
    container.innerHTML = '<div class="empty-state">Não foi possível buscar os posts: ' + escapeHtml(error.message) + "</div>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!$("#latestPostsGrid")) return; // markup não presente nesta página
  loadLatestPosts();
  const refreshBtn = $("#latestPostsRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadLatestPosts);
});

/* ============================================================
   Markup esperado dentro de #tab-dashboard, ANTES da seção
   "Nova automação" (index.html):

<section class="panel panel-plain">
  <div class="panel-heading-row">
    <h2>Últimas publicações</h2>
    <button id="latestPostsRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button>
  </div>
  <div id="latestPostsGrid" class="latest-posts-grid"></div>
</section>

   E, antes de </body>:
   <script type="module" src="instagram-latest-posts.js"></script>
   ============================================================ */
