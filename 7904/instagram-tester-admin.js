// instagram-tester-admin.js
// Painel do admin: lista solicitações pendentes de conexão do Instagram
// e permite aprovar/rejeitar. Isolado de app.js — usa o próprio client.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// IMPORTANTE: só o app.js pode processar o token do link de convite/recuperação
// (detectSessionInUrl). Aqui a gente só LÊ a sessão que ele já estabeleceu —
// nunca cria um segundo client competindo por isso, senão corrompe a sessão
// durante o fluxo de convite.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const TABLE = "instagram_tester_requests";

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
    list.innerHTML = '<div class="empty-state">Erro ao carregar: ' + escapeHtml(error.message) + "</div>";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma solicitação pendente.</div>';
    return;
  }

  list.innerHTML = data.map((row) => {
    const created = new Date(row.created_at).toLocaleString("pt-BR");
    return (
      '<div class="ig-tester-admin-row" data-id="' + row.id + '">' +
      '<div class="ig-tester-admin-info">' +
      "<strong>@" + escapeHtml(row.instagram_username) + "</strong>" +
      '<span class="ig-tester-admin-date">Solicitado em ' + created + "</span>" +
      "</div>" +
      '<div class="ig-tester-admin-actions">' +
      '<button class="btn btn-primary btn-sm ig-tester-approve-btn" data-id="' + row.id + '">Enviar / Aprovar</button>' +
      '<button class="btn btn-outline btn-sm ig-tester-reject-btn" data-id="' + row.id + '">Rejeitar</button>' +
      "</div></div>"
    );
  }).join("");

  list.querySelectorAll(".ig-tester-approve-btn").forEach((btn) =>
    btn.addEventListener("click", () => updateStatus(btn.getAttribute("data-id"), "aprovado", btn))
  );
  list.querySelectorAll(".ig-tester-reject-btn").forEach((btn) =>
    btn.addEventListener("click", () => updateStatus(btn.getAttribute("data-id"), "rejeitado", btn))
  );
}

async function updateStatus(requestId, status, triggerBtn) {
  if (triggerBtn) triggerBtn.disabled = true;
  try {
    // IMPORTANTE: marque como "aprovado" só depois de já ter adicionado
    // manualmente o @ como tester/convidado no Meta Developer Console —
    // é esse convite que a tela do usuário vai instruir a aceitar.
    const { error } = await supabase.from(TABLE).update({ status }).eq("id", requestId);
    if (error) throw error;
    await loadPendingRequests();
  } catch (error) {
    alert("Erro ao atualizar status: " + error.message);
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!$("#igTesterAdminList")) return; // markup não presente nesta página
  loadPendingRequests();
  const refreshBtn = $("#igTesterAdminRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadPendingRequests);
});

/* ============================================================
   Markup esperado dentro de #tab-admin (index.html):

<section class="panel panel-plain">
  <div class="panel-heading-row">
    <h2>Solicitações de conexão do Instagram</h2>
    <button id="igTesterAdminRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button>
  </div>
  <div id="igTesterAdminList"></div>
</section>

   E, antes de </body>:
   <script type="module" src="instagram-tester-admin.js"></script>
   ============================================================ */
