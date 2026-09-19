// instagram-tester-onboarding.js
// Lista as contas do Instagram que o usuário já solicitou, cada uma com
// seu próprio status (pendente / aprovado / rejeitado), e mantém o
// formulário de adicionar uma nova conta sempre disponível — uma conta
// pendente ou aguardando aceite no Instagram nunca bloqueia as outras.
// Não importa nem depende de app.js — usa o próprio client do Supabase.

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

let realtimeChannel = null;
let currentUserId = null;

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

function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function setError(message) {
  const el = $("#igTesterFormError");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function statusBadge(status) {
  if (status === "aprovado") return '<span class="badge badge-ativo">Aprovado</span>';
  if (status === "rejeitado") return '<span class="badge badge-danger">Rejeitado</span>';
  return '<span class="badge badge-muted">Aguardando aprovação</span>';
}

function statusNote(status) {
  if (status === "aprovado") {
    return (
      '<p class="ig-tester-row-note">' +
      "Falta um passo: abra o <strong>navegador</strong> do seu celular (Chrome ou Safari — " +
      '<strong>não use o app do Instagram</strong>, ele não mostra essa opção) e acesse ' +
      '<a href="https://www.instagram.com/accounts/manage_access/" target="_blank" rel="noopener">' +
      "instagram.com/accounts/manage_access</a>. Vá na aba <strong>\"Convites do testador\"</strong> " +
      "e toque em <strong>Aceitar</strong>." +
      "</p>"
    );
  }
  if (status === "rejeitado") {
    return '<p class="ig-tester-row-note">Não foi possível aprovar esta conta. Confira o @ ou tente novamente.</p>';
  }
  return '<p class="ig-tester-row-note">Aguarde alguns instantes enquanto fazemos as configurações desta conta…</p>';
}

function renderList(requests) {
  const list = $("#igTesterRequestsList");
  if (!list) return;

  if (!requests || requests.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma conta do Instagram cadastrada ainda.</div>';
    return;
  }

  list.innerHTML = requests
    .map((row) => {
      return (
        '<div class="ig-tester-row" data-id="' + row.id + '">' +
        '<div class="ig-tester-row-main">' +
        "<strong>@" + escapeHtml(row.instagram_username) + "</strong>" +
        statusBadge(row.status) +
        "</div>" +
        statusNote(row.status) +
        "</div>"
      );
    })
    .join("");
}

async function loadRequests(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, instagram_username, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    const list = $("#igTesterRequestsList");
    if (list) list.innerHTML = '<div class="empty-state">Erro ao carregar suas contas: ' + escapeHtml(error.message) + "</div>";
    return;
  }
  renderList(data || []);
}

function listenForChanges(userId) {
  stopListening();
  realtimeChannel = supabase
    .channel("instagram_tester_requests_user_" + userId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: "user_id=eq." + userId,
      },
      () => loadRequests(userId)
    )
    .subscribe();
}

function stopListening() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  setError("");

  if (!currentUserId) {
    setError("Sua sessão expirou. Atualize a página e faça login novamente.");
    return;
  }

  const input = $("#igTesterUsernameInput");
  const username = normalizeUsername(input ? input.value : "");
  if (!username || username.length < 2) {
    setError("Digite um @ válido do Instagram.");
    return;
  }

  const submitBtn = $("#igTesterSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
  }

  try {
    const { error } = await supabase.from(TABLE).insert({
      user_id: currentUserId,
      instagram_username: username,
      status: "pendente",
    });

    if (error) {
      // Já existe uma solicitação ativa (pendente/aprovada) pra esse @ — não é um erro grave.
      if (error.code === "23505") {
        setError("Esse @ já está cadastrado e em andamento.");
      } else {
        throw error;
      }
    } else if (input) {
      input.value = "";
    }
  } catch (error) {
    setError("Não foi possível enviar sua solicitação: " + error.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Conectar Instagram";
    }
  }
}

async function bootstrap() {
  const form = $("#igTesterForm");
  const list = $("#igTesterRequestsList");
  if (!form && !list) return; // markup não presente nesta página — não faz nada

  if (form) form.addEventListener("submit", handleSubmit);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !session.user) return;

  currentUserId = session.user.id;
  await loadRequests(currentUserId);
  listenForChanges(currentUserId);
}

document.addEventListener("DOMContentLoaded", bootstrap);

/* ============================================================
   Novo markup esperado em index.html (substitui o bloco anterior
   de igTesterFormStep/igTesterLoadingStep/igTesterApprovedStep):

<section class="panel panel-plain ig-tester-onboarding" id="igTesterOnboarding">
  <h2>Conectar Instagram</h2>

  <form id="igTesterForm">
    <label class="field">
      <span>@ do Instagram</span>
      <input type="text" id="igTesterUsernameInput" placeholder="@sua.loja" autocomplete="off" />
    </label>
    <div id="igTesterFormError" class="banner error hidden"></div>
    <button type="submit" id="igTesterSubmitBtn" class="btn btn-primary btn-full">Conectar Instagram</button>
  </form>

  <div id="igTesterRequestsList" class="ig-tester-list"></div>
</section>

   Script continua o mesmo:
   <script type="module" src="instagram-tester-onboarding.js"></script>
   ============================================================ */
