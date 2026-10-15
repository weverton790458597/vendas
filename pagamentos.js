// pagamentos.js — Módulo de gestão de pagamentos integrado ao Asaas
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = {
  SUPABASE_URL: "https://abdliioyzkylccfylils.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU",
};

const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let loaded = false;

function injectStyles() {
  if ($("pagamentosStyles")) return;
  const st = document.createElement("style");
  st.id = "pagamentosStyles";
  st.textContent = `
    .pay-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; margin-bottom: 1rem; color: var(--text); }
    .pay-card h3 { margin-top: 0; font-size: 1.1rem; display: flex; align-items: center; gap: .5rem; }
    .pay-row { display: flex; justify-content: space-between; align-items: center; padding: .6rem 0; border-bottom: 1px dashed var(--border); font-size: .9rem; }
    .pay-row:last-child { border-bottom: none; }
    .pay-pix-box { background: var(--surface-2); border-radius: 12px; padding: 1rem; text-align: center; margin-top: 1rem; }
    .pay-pix-box img { max-width: 180px; height: auto; margin: .5rem auto; display: block; border-radius: 8px; }
    .pay-actions { display: flex; gap: .5rem; margin-top: 1rem; flex-wrap: wrap; }
  `;
  document.head.appendChild(st);
}

async function renderPaymentPanel() {
  const container = $("tab-pagamentos") \vert{}\vert{} $("pagamentosContainer") || document.querySelector(".app-main");
  if (!container) return;

  injectStyles();

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  // Busca perfil atual com status de pagamento
  const { data: profile } = await sb
    .from("profiles")
    .select("payment_status, payment_due_date, monthly_plan_value, is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  const status = profile?.payment_status || "aguardando";
  const dueDate = profile?.payment_due_date;
  const planVal = profile?.monthly_plan_value || 99.90;

  let statusBadge = '<span class="trial-pill bad">Pendente</span>';
  if (status === "em_dia") statusBadge = '<span class="trial-pill ok">Em dia</span>';
  else if (status === "atrasado") statusBadge = '<span class="trial-pill bad">Atrasado</span>';

  let html = `
    <div class="pay-card">
      <h3>💳 Minha Assinatura</h3>
      <div class="pay-row"><span>Status da conta:</span> <b>${statusBadge}</b></div>
      <div class="pay-row"><span>Próximo vencimento:</span> <b>${fmtDate(dueDate)}</b></div>
      <div class="pay-row"><span>Valor mensal:</span> <b>${brl(planVal)}</b></div>
      
      <div class="pay-actions">
        <button type="button" id="payGenPixBtn" class="btn btn-primary">Gerar Pix de Pagamento</button>
      </div>
      <div id="payPixResult"></div>
    </div>
  `;

  // Se for admin, pode listar ou gerenciar outros se necessário, mas mantemos o foco do cliente aqui
  container.innerHTML = html;

  $("payGenPixBtn")?.addEventListener("click", async () => {
    const btn = $("payGenPixBtn");
    const resDiv = $("payPixResult");
    btn.disabled = true;
    btn.textContent = "Gerando cobrança no Asaas...";
    resDiv.innerHTML = "";

    try {
      const { data, error } = await sb.functions.invoke("asaas-create-payment", {
        body: { plan_type: "Individual", value: planVal },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      resDiv.innerHTML = `
        <div class="pay-pix-box">
          <p><strong>Escaneie o QR Code ou copie a chave Pix:</strong></p>
          ${data.pix_qr_code_base64 ? `<img src="data:image/png;base64,${data.pix_qr_code_base64}" alt="QR Code Pix" />` : ""}
          <textarea readonly style="width:100%; height:60px; font-size:12px; margin-top:.5rem; padding:.4rem; border-radius:6px; border:1px solid var(--border);">${esc(data.pix_copia_e_cola)}</textarea>
          <div style="display:flex; gap:.5rem; margin-top:.5rem;">
            <button type="button" class="btn btn-outline btn-sm btn-full" id="payCopyPix">Copiar Pix Copia e Cola</button>
            <a href="${esc(data.invoice_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm btn-full">Abrir Fatura Asaas</a>
          </div>
        </div>
      `;

      $("payCopyPix")?.addEventListener("click", () => {
        navigator.clipboard.writeText(data.pix_copia_e_cola);
        alert("Código Pix copiado com sucesso!");
      });

    } catch (err) {
      resDiv.innerHTML = `<p class="banner error" style="margin-top:1rem;">Erro ao gerar Pix: ${esc(err.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Gerar Pix de Pagamento";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderPaymentPanel();
  sb.auth.onAuthStateChange((ev, s) => {
    if (s && !loaded) {
      loaded = true;
      renderPaymentPanel();
    }
  });
});
