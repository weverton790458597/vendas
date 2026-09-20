// instagram-tester-admin.js — Painel do admin (Redesign 2026)
// Lista solicitações pendentes de conexão do Instagram e permite aprovar/rejeitar.
// Isolado de app.js — usa seu próprio client de Supabase.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbG...tEmU";

// IMPORTANT: apenas app.js processa o token do link de convite/recuperação.
// Aqui lemos a sessão já estabelecida — nunca criamos um segundo client
// competindo por isso, senão corrompe a sessão durante o fluxo de convite.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const TABLE = "instagram_tester_requests";
const META_APP_URL =
  "https://developers.facebook.com/apps/1610537103353620/use_cases/customize/" +
  "?use_case_enum=INSTAGRAM_BUSINESS&selected_tab=API-Setup&product_route=instagram-business&business_id=26726695600333766";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/* ------------------------------------------------------------------
   Load pending requests
------------------------------------------------------------------- */
async function loadPendingRequests() {
  const list = $("#igTesterAdminList");
  if (!list) return;

  list.innerHTML = '<div class="loading-row">Carregando solicitações…</div>';

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, instagram_username, status, created_at, user_id")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  if (error) {
    list.innerHTML = `
      <div class="empty-state">
        Erro ao carregar: ${escapeHtml(error.message)}
      </div>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div class="admin-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <p>Nenhuma solicitação pendente no momento.</p>
        <small>As contas que os clientes solicitarem para conexão aparecerão aqui.</small>
      </div>`;
    return;
  }

  list.innerHTML = data
    .map((row) => {
      const created = formatDateTime(row.created_at);
      const username = escapeHtml(row.instagram_username);
      return `
        <div class="ig-tester-admin-row" data-id="${row.id}">
          <div class="ig-tester-admin-info">
            <strong>@${username}</strong>
            <span class="ig-tester-admin-date">Solicitado em ${created}</span>
          </div>
          <div class="ig-tester-admin-actions">
            <button class="btn btn-ghost btn-sm btn-icon ig-tester-copy-btn" data-username="${username}" aria-label="Copiar @">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 5H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/></svg>
            </button>
            <a class="btn btn-outline btn-sm" href="${META_APP_URL}" target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              Meta
            </a>
            <button class="btn btn-primary btn-sm ig-tester-approve-btn" data-id="${row.id}" data-username="${username}">
              Enviar / Aprovar
            </button>
            <button class="btn btn-ghost btn-sm btn-icon ig-tester-reject-btn" data-id="${row.id}" aria-label="Rejeitar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>`;
    })
    .join("");

  // Re-attach event listeners
  $$(".ig-tester-copy-btn").forEach((btn) =>
    btn.addEventListener("click", () => copyUsername(btn))
  );
  $$(".ig-tester-approve-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      // Abre a Meta e copia o @ antes de qualquer await — navegadores
      // só deixam window.open/clipboard funcionar no próprio clique.
      window.open(META_APP_URL, "_blank", "noopener");
      copyUsername(btn, { silent: true });
      updateStatus(btn.getAttribute("data-id"), "aprovado", btn);
    });
  });
  $$(".ig-tester-reject-btn").forEach((btn) =>
    btn.addEventListener("click", () => updateStatus(btn.getAttribute("data-id"), "rejeitado", btn))
  );
}

/* ------------------------------------------------------------------
   Copy username to clipboard
------------------------------------------------------------------- */
async function copyUsername(btn, opts) {
  const username = btn.getAttribute("data-username");
  if (!username) return;
  try {
    await navigator.clipboard.writeText(username);
    if (!opts || !opts.silent) {
      const original = btn.textContent || "";
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = original; }, 1400);
    }
  } catch (_err) {
    // Sem permissão de clipboard — sem problema, só não copia.
  }
}

/* ------------------------------------------------------------------
   Update request status
------------------------------------------------------------------- */
async function updateStatus(requestId, status, triggerBtn) {
  if (triggerBtn) triggerBtn.disabled = true;
  try {
    // Marque como "aprovado" só depois de adicionar manualmente o @
    // como tester/convidado no Meta Developer Console — é esse convite
    // que a tela do usuário vai instruir a aceitar.
    const { error } = await supabase
      .from(TABLE)
      .update({ status })
      .eq("id", requestId);
    if (error) throw error;
    await loadPendingRequests();
  } catch (error) {
    alert("Erro ao atualizar status: " + error.message);
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------
   Bootstrap
------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  if (!$("#igTesterAdminList")) return; // markup não presente nesta página
  loadPendingRequests();
  const refreshBtn = $("#igTesterAdminRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadPendingRequests);
});

/* ==========================================================================
   Markup esperado dentro de #tab-admin (index.html):

<section class="panel panel-plain">
  <div class="panel-header">
    <h2>Solicitações de conexão do Instagram</h2>
    <button id="igTesterAdminRefreshBtn" class="btn btn-ghost btn-sm btn-icon" aria-label="Atualizar">
      <svg ...></svg>
    </button>
  </div>
  <div id="igTesterAdminList"></div>
</section>

   E, antes de </body>:
   <script type="module" src="instagram-tester-admin.js"></script>
========================================================================== */
