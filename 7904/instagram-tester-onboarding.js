// instagram-tester-onboarding.js
// Fluxo isolado de "solicitar acesso como tester do Instagram".
// Não importa nem depende de app.js — usa o próprio client do Supabase.
// Requer os elementos de HTML descritos no bloco de comentário no final do arquivo.

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

function $(sel) {
  return document.querySelector(sel);
}

function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function showStep(step) {
  // step: "form" | "loading" | "approved"
  const els = {
    form: $("#igTesterFormStep"),
    loading: $("#igTesterLoadingStep"),
    approved: $("#igTesterApprovedStep"),
  };
  Object.entries(els).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", key !== step);
  });
}

function setError(message) {
  const el = $("#igTesterFormError");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function stopListening() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function listenForApproval(requestId) {
  stopListening();
  realtimeChannel = supabase
    .channel("instagram_tester_requests_" + requestId)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE,
        filter: "id=eq." + requestId,
      },
      (payload) => {
        const newStatus = payload.new && payload.new.status;
        if (newStatus === "aprovado") {
          stopListening();
          showStep("approved");
        } else if (newStatus === "rejeitado") {
          stopListening();
          showStep("form");
          setError(
            "Sua solicitação não pôde ser aprovada agora. Confira o @ e tente novamente, ou fale com o suporte."
          );
        }
      }
    )
    .subscribe();

  // Checagem de segurança (fallback) caso o evento realtime não chegue —
  // por exemplo, se a aba ficou em segundo plano e o socket caiu.
  pollAsFallback(requestId);
}

async function pollAsFallback(requestId, attempt = 0) {
  // Só entra em ação se ainda estivermos esperando aprovação para essa solicitação.
  if (!realtimeChannel) return;
  const maxAttempts = 180; // ~15 minutos com intervalo de 5s
  if (attempt >= maxAttempts) return;

  await new Promise((resolve) => setTimeout(resolve, 5000));
  if (!realtimeChannel) return; // já resolvido via realtime nesse meio-tempo

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    if (!error && data) {
      if (data.status === "aprovado") {
        stopListening();
        showStep("approved");
        return;
      }
      if (data.status === "rejeitado") {
        stopListening();
        showStep("form");
        setError(
          "Sua solicitação não pôde ser aprovada agora. Confira o @ e tente novamente, ou fale com o suporte."
        );
        return;
      }
    }
  } catch (_err) {
    // silencioso — só tenta de novo no próximo ciclo
  }
  pollAsFallback(requestId, attempt + 1);
}

async function findExistingPendingRequest(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function handleSubmit(event) {
  event.preventDefault();
  setError("");

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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || !session.user) {
      setError("Sua sessão expirou. Atualize a página e faça login novamente.");
      return;
    }
    const userId = session.user.id;

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: userId,
        instagram_username: username,
        status: "pendente",
      })
      .select("id")
      .single();

    if (error) throw error;

    showStep("loading");
    listenForApproval(data.id);
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
  if (!form) return; // markup não presente nesta página — não faz nada

  form.addEventListener("submit", handleSubmit);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !session.user) return;

  const existing = await findExistingPendingRequest(session.user.id);
  if (!existing) {
    showStep("form");
    return;
  }
  if (existing.status === "pendente") {
    showStep("loading");
    listenForApproval(existing.id);
  } else if (existing.status === "aprovado") {
    showStep("approved");
  } else {
    showStep("form");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

/* ============================================================
   Markup esperado em index.html (adicione onde fizer sentido,
   por exemplo dentro de #tab-accounts, sem remover o que já existe):

<div id="igTesterOnboarding" class="ig-tester-onboarding">

  <form id="igTesterForm" class="ig-tester-step" id="igTesterFormStep">
    <label class="field">
      <span>Seu @ do Instagram</span>
      <input type="text" id="igTesterUsernameInput" placeholder="@sua.loja" autocomplete="off" />
    </label>
    <div id="igTesterFormError" class="banner error hidden"></div>
    <button type="submit" id="igTesterSubmitBtn" class="btn btn-primary btn-full">Conectar Instagram</button>
  </form>

  <div id="igTesterLoadingStep" class="ig-tester-step hidden">
    <span class="ig-tester-spinner" aria-hidden="true"></span>
    <p>Aguarde alguns instantes enquanto fazemos todas as configurações da sua conta…</p>
  </div>

  <div id="igTesterApprovedStep" class="ig-tester-step hidden">
    <p>
      Tudo pronto por aqui! Agora, acesse o seu Instagram no celular, vá até as
      configurações e aceite o convite de parceria/testador para autorizar
      nossa plataforma a enviar mensagens no seu perfil.
    </p>
  </div>

</div>

   E, antes de </body>, adicione:
   <script type="module" src="instagram-tester-onboarding.js"></script>
   ============================================================ */
