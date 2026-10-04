// pagamentos.js — aba "Pagamentos" (módulo independente; não depende dos outros JS)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =====================  CONFIGURE AQUI  ===================== */
const CONFIG = {
  SUPABASE_URL: 'https://abdliioyzkylccfylils.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU',

  PIX_KEY: '98912345678',                // <- TROQUE pelo seu telefone / chave Pix
  PIX_KEY_LABEL: 'Chave Pix (telefone)',
  PIX_BENEFICIARIO: 'Respondi',          // nome que aparece pro cliente
  PIX_QR_SRC: 'icons/pix-qrcode.png',    // <- coloque seu QR Code PNG aqui
  WHATSAPP: '5598982672165',             // comprovante vai pra esse WhatsApp ('' esconde o botão)
};
/* ============================================================ */

const TAB = 'payments';
// Mesma URL/chave do app.js => reaproveita a sessão já logada.
// autoRefreshToken desligado para não "brigar" com o cliente do app.js.
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false },
});

const $ = (id) => document.getElementById(id);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m = 0..11

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
const fmtDate = (s) => parseDate(s).toLocaleDateString('pt-BR');
const fmtMonth = (s) => {
  const t = parseDate(s).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function effectiveStatus(p) {
  if (p.status === 'pendente' && parseDate(p.vencimento) < todayStart()) return 'atrasado';
  return p.status;
}

const STATUS_UI = {
  pendente:   { label: 'Pendente',   cls: 'badge-muted' },
  atrasado:   { label: 'Atrasado',   cls: 'badge-danger' },
  em_analise: { label: 'Em análise', cls: 'badge-warn' },
  pago:       { label: 'Pago',       cls: 'badge-ativo' },
  cancelado:  { label: 'Cancelado',  cls: 'badge-inativo' },
};

let me = null;        // { id, email, is_admin }
let loaded = false;
let loading = false;
let rows = [];
let clients = [];     // admin: lista de clientes
let filter = 'abertas';

/* ---------------------- Montagem da UI ---------------------- */
function ensureUI() {
  if (!document.querySelector(`.nav-item[data-tab="${TAB}"]`)) {
    const nav = document.querySelector('.app-nav');
    if (nav) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.dataset.tab = TAB;
      btn.innerHTML =
        '<span class="nav-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/></svg></span><span>Pagamentos</span>';
      nav.insertBefore(btn, $('adminTabBtn') || null);
    }
  }
  if (!$('tab-' + TAB)) {
    const main = document.querySelector('.app-main');
    if (!main) return;
    const panel = document.createElement('div');
    panel.id = 'tab-' + TAB;
    panel.className = 'tab-panel hidden';
    panel.innerHTML = `
      <div class="panel-heading-row"><h1 style="margin:0;">Pagamentos</h1>
        <button type="button" id="payRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button>
      </div>
      <div id="payBanner" class="banner"></div>
      <div id="payKpis" class="kpi-strip"></div>

      <section class="panel pay-pix">
        <div class="pay-pix-qr">
          <img id="payQrImg" alt="QR Code Pix" src="${esc(CONFIG.PIX_QR_SRC)}" />
          <div id="payQrFallback" class="pay-qr-fallback hidden">QR Code<br>indisponível</div>
        </div>
        <div class="pay-pix-info">
          <h2>Pague via Pix</h2>
          <p class="panel-lead" style="margin-top:0;">Escaneie o QR Code no app do seu banco ou copie a chave abaixo. Depois de pagar, clique em <b>“Já paguei”</b> na cobrança correspondente.</p>
          <div class="pay-key-label">${esc(CONFIG.PIX_KEY_LABEL)}</div>
          <div class="pay-key-row">
            <code id="payKeyValue">${esc(CONFIG.PIX_KEY)}</code>
            <button type="button" id="payCopyBtn" class="btn btn-primary btn-sm">Copiar chave</button>
          </div>
          <div class="pay-key-benef">Favorecido: ${esc(CONFIG.PIX_BENEFICIARIO)}</div>
          <a id="payWhatsBtn" class="btn btn-outline btn-sm hidden" target="_blank" rel="noopener">💬 Enviar comprovante no WhatsApp</a>
        </div>
      </section>

      <section class="panel panel-plain">
        <div class="panel-heading-row"><h2>Suas cobranças</h2>
          <div class="pay-filter">
            <button type="button" class="subtab-btn active" data-payfilter="abertas">Em aberto</button>
            <button type="button" class="subtab-btn" data-payfilter="pagas">Pagas</button>
            <button type="button" class="subtab-btn" data-payfilter="todas">Todas</button>
          </div>
        </div>
        <div id="payLoading" class="loading-row hidden">Carregando pagamentos…</div>
        <div id="payList" class="pay-list"></div>
      </section>

      <!-- Só aparece para admin -->
      <section id="payAdmin" class="panel hidden">
        <div class="panel-heading-row"><h2>🛠️ Gerenciar clientes (admin)</h2></div>

        <h3 style="margin-bottom:.6rem;">Aguardando confirmação</h3>
        <div id="payAdminPending" style="margin-bottom:1.6rem;"></div>

        <h3 style="margin-bottom:.6rem;">Gerar cobranças</h3>
        <div class="automation-form-grid">
          <div class="field field-full"><span>Cliente</span><select id="payGenUser"></select></div>
          <div class="field"><span>Valor mensal (R$)</span><input type="number" id="payGenValor" step="0.01" min="0" placeholder="49,90" /></div>
          <div class="field"><span>Dia do vencimento (1–28)</span><input type="number" id="payGenDia" min="1" max="28" value="10" /></div>
          <div class="field"><span>Quantidade de meses</span><input type="number" id="payGenMeses" min="1" max="36" value="12" /></div>
          <div class="field">
            <label class="founder-idea-check" style="margin:1.7rem 0 0;">
              <input type="checkbox" id="payGenAtual" /><span>Começar no mês atual</span>
            </label>
          </div>
        </div>
        <button type="button" id="payGenBtn" class="btn btn-primary">Gerar cobranças</button>
        <p class="field-hint">Meses que já têm cobrança para esse cliente são ignorados (não duplica).</p>
      </section>`;
    main.appendChild(panel);
  }
}

function showBanner(msg, type = 'error') {
  const b = $('payBanner');
  if (!b) return;
  b.className = 'banner ' + (msg ? type : '');
  b.textContent = msg || '';
  if (msg && type === 'success') setTimeout(() => showBanner(''), 5000);
}

/* ---------------------- Sessão / perfil ---------------------- */
async function getMe() {
  if (me) return me;
  const { data: sess } = await sb.auth.getSession();
  const user = sess?.session?.user;
  if (!user) return null;
  const { data: prof } = await sb.from('profiles').select('id, email, is_admin').eq('id', user.id).maybeSingle();
  me = { id: user.id, email: prof?.email || user.email, is_admin: !!prof?.is_admin };
  return me;
}

/* ---------------------- Dados (cliente) ---------------------- */
async function loadPayments() {
  if (loading) return;
  loading = true;
  $('payLoading')?.classList.remove('hidden');
  showBanner('');
  try {
    const u = await getMe();
    if (!u) { rows = []; render(); return; }
    const { data, error } = await sb
      .from('pagamentos')
      .select('id, competencia, valor, vencimento, status, informado_em, pago_em, observacao')
      .eq('user_id', u.id) // admin enxerga tudo via RLS, então filtramos aqui
      .order('vencimento', { ascending: true });
    if (error) throw error;
    rows = data || [];
    loaded = true;
    render();
    $('payAdmin')?.classList.toggle('hidden', !u.is_admin);
    if (u.is_admin) await loadAdmin();
  } catch (e) {
    console.error('[pagamentos]', e);
    showBanner('Não consegui carregar os pagamentos. Confira se o SQL do pagamentos foi executado e tente atualizar.');
  } finally {
    loading = false;
    $('payLoading')?.classList.add('hidden');
  }
}

async function informarPagamento(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  const { error } = await sb.rpc('informar_pagamento', { p_id: id });
  if (error) {
    console.error('[pagamentos]', error);
    showBanner('Não foi possível registrar. Tente novamente.');
    if (btn) { btn.disabled = false; btn.textContent = 'Já paguei'; }
    return;
  }
  showBanner('Pagamento informado! Vamos confirmar e atualizar o status em breve.', 'success');
  await loadPayments();
}

/* ---------------------- Admin ---------------------- */
async function loadAdmin() {
  const [{ data: profs, error: e1 }, { data: pend, error: e2 }] = await Promise.all([
    sb.from('profiles').select('id, email, monthly_plan_value, payment_due_date').order('email'),
    sb.from('pagamentos').select('id, user_id, competencia, valor, vencimento, informado_em').eq('status', 'em_analise').order('informado_em'),
  ]);
  if (e1 || e2) { console.error('[pagamentos admin]', e1 || e2); showBanner('Erro ao carregar dados de admin.'); return; }
  clients = profs || [];
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));

  const box = $('payAdminPending');
  if (!pend?.length) {
    box.innerHTML = '<div class="empty-state">Nenhum pagamento aguardando confirmação.</div>';
  } else {
    box.innerHTML = pend.map((p) => `
      <div class="ig-tester-admin-row">
        <div class="ig-tester-admin-info">
          <strong>${esc(byId[p.user_id]?.email || p.user_id)}</strong>
          <span class="ig-tester-admin-date">${esc(fmtMonth(p.competencia))} · ${brl(p.valor)} · informado em ${p.informado_em ? new Date(p.informado_em).toLocaleString('pt-BR') : '—'}</span>
        </div>
        <div class="ig-tester-admin-actions">
          <button type="button" class="btn btn-primary btn-sm" data-pay-confirm="${esc(p.id)}" data-pay-user="${esc(p.user_id)}">Confirmar pago</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-pay-reject="${esc(p.id)}">Não recebi</button>
        </div>
      </div>`).join('');
  }

  const sel = $('payGenUser');
  const prev = sel.value;
  sel.innerHTML = clients.map((c) => `<option value="${esc(c.id)}">${esc(c.email)}</option>`).join('');
  if (prev) sel.value = prev;
  fillGenDefaults();
}

function fillGenDefaults() {
  const c = clients.find((x) => x.id === $('payGenUser').value);
  if (!c) return;
  if (c.monthly_plan_value) $('payGenValor').value = Number(c.monthly_plan_value).toFixed(2);
  if (c.payment_due_date) {
    const d = parseDate(String(c.payment_due_date).slice(0, 10)).getDate();
    $('payGenDia').value = Math.min(d, 28);
  }
}

async function confirmarPago(id, userId, btn) {
  btn.disabled = true;
  const { error } = await sb.from('pagamentos').update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', id);
  if (error) { console.error(error); showBanner('Erro ao confirmar: ' + error.message); btn.disabled = false; return; }
  // Mantém o painel Admin antigo coerente: cliente em dia + próximo vencimento.
  const { data: next } = await sb.from('pagamentos').select('vencimento')
    .eq('user_id', userId).eq('status', 'pendente').order('vencimento').limit(1);
  const upd = { payment_status: 'em_dia' };
  if (next?.[0]) upd.payment_due_date = next[0].vencimento;
  await sb.from('profiles').update(upd).eq('id', userId);
  showBanner('Pagamento confirmado.', 'success');
  await loadPayments();
}

async function recusarPagamento(id, btn) {
  if (!confirm('Voltar esta cobrança para "pendente"? (o cliente poderá informar de novo)')) return;
  btn.disabled = true;
  const { error } = await sb.from('pagamentos').update({ status: 'pendente', informado_em: null }).eq('id', id);
  if (error) { showBanner('Erro: ' + error.message); btn.disabled = false; return; }
  showBanner('Cobrança voltou para pendente.', 'success');
  await loadPayments();
}

async function gerarCobrancas() {
  const userId = $('payGenUser').value;
  const valor = parseFloat($('payGenValor').value);
  const dia = Math.min(28, Math.max(1, parseInt($('payGenDia').value, 10) || 10));
  const meses = Math.min(36, Math.max(1, parseInt($('payGenMeses').value, 10) || 12));
  const atual = $('payGenAtual').checked;
  if (!userId || !Number.isFinite(valor) || valor <= 0) { showBanner('Escolha o cliente e informe um valor válido.'); return; }

  const now = new Date();
  const list = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + (atual ? 0 : 1) + i, 1);
    list.push({
      user_id: userId,
      competencia: iso(d.getFullYear(), d.getMonth(), 1),
      valor,
      vencimento: iso(d.getFullYear(), d.getMonth(), dia),
    });
  }
  const btn = $('payGenBtn');
  btn.disabled = true; btn.textContent = 'Gerando…';
  const { error } = await sb.from('pagamentos').upsert(list, { onConflict: 'user_id,competencia', ignoreDuplicates: true });
  btn.disabled = false; btn.textContent = 'Gerar cobranças';
  if (error) { console.error(error); showBanner('Erro ao gerar: ' + error.message); return; }
  showBanner(`Cobranças geradas para ${meses} mês(es). Meses já existentes foram mantidos.`, 'success');
  if (userId === me?.id) await loadPayments();
}

/* ---------------------- Render ---------------------- */
function render() {
  const list = $('payList');
  const kpis = $('payKpis');
  if (!list || !kpis) return;

  const abertas = rows.filter((p) => ['pendente', 'em_analise'].includes(p.status));
  const atrasadas = abertas.filter((p) => effectiveStatus(p) === 'atrasado');
  const proxima = abertas.find((p) => p.status === 'pendente') || abertas[0];
  const totalAberto = abertas.reduce((s, p) => s + Number(p.valor), 0);

  kpis.innerHTML = `
    <div class="kpi-item accent"><span class="kpi-value">${proxima ? brl(proxima.valor) : '—'}</span><span class="kpi-label">${proxima ? 'Próxima cobrança · vence ' + fmtDate(proxima.vencimento) : 'Nenhuma cobrança em aberto'}</span></div>
    <div class="kpi-item"><span class="kpi-value">${brl(totalAberto)}</span><span class="kpi-label">Total em aberto</span></div>
    <div class="kpi-item ${atrasadas.length ? 'is-danger' : ''}"><span class="kpi-value">${atrasadas.length}</span><span class="kpi-label">Em atraso</span></div>`;

  let view = rows;
  if (filter === 'abertas') view = abertas;
  if (filter === 'pagas') view = rows.filter((p) => p.status === 'pago').slice().reverse();

  if (!view.length) {
    const msgs = {
      abertas: 'Tudo em dia! Nenhuma cobrança em aberto. 🎉',
      pagas: 'Você ainda não tem pagamentos confirmados.',
      todas: 'Nenhuma cobrança cadastrada ainda.',
    };
    list.innerHTML = `<div class="empty-state">${msgs[filter]}</div>`;
    return;
  }

  list.innerHTML = view.map((p) => {
    const st = effectiveStatus(p);
    const ui = STATUS_UI[st] || STATUS_UI.pendente;
    let note;
    if (p.status === 'pago' && p.pago_em) note = 'Confirmado em ' + new Date(p.pago_em).toLocaleDateString('pt-BR');
    else if (p.status === 'em_analise') note = 'Aguardando confirmação do pagamento';
    else if (st === 'atrasado') note = 'Venceu em ' + fmtDate(p.vencimento);
    else note = 'Vence em ' + fmtDate(p.vencimento);
    return `
      <div class="pay-item pay-${st}">
        <div class="pay-item-main">
          <strong>${esc(fmtMonth(p.competencia))}</strong>
          <span class="pay-item-note">${esc(note)}</span>
        </div>
        <div class="pay-item-value">${brl(p.valor)}</div>
        <span class="badge ${ui.cls}">${ui.label}</span>
        ${p.status === 'pendente' ? `<button type="button" class="btn btn-outline btn-sm" data-pay-informar="${esc(p.id)}">Já paguei</button>` : '<span></span>'}
      </div>`;
  }).join('');
}

/* ---------------------- Eventos ---------------------- */
function activateTab() {
  // O app.js só conhece as abas dele: aqui mostramos a nossa e escondemos as outras.
  document.querySelectorAll('.app-main > .tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + TAB));
  document.querySelectorAll('.app-nav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === TAB));
  loadPayments();
}

function bind() {
  // Clique em qualquer item do menu: se for o nosso, abre; se for outro, esconde o nosso
  // (o app.js não sabe que a aba Pagamentos existe, então não a esconderia sozinho).
  document.querySelectorAll('.app-nav .nav-item').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.tab === TAB) setTimeout(activateTab, 0);
      else $('tab-' + TAB)?.classList.add('hidden');
    }));

  $('payRefreshBtn')?.addEventListener('click', loadPayments);

  $('payCopyBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    try {
      await navigator.clipboard.writeText(CONFIG.PIX_KEY);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = CONFIG.PIX_KEY; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = 'Copiado ✓';
    setTimeout(() => (btn.textContent = old), 1800);
  });

  $('payQrImg')?.addEventListener('error', () => {
    $('payQrImg').classList.add('hidden');
    $('payQrFallback')?.classList.remove('hidden');
  });

  document.querySelectorAll('[data-payfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.payfilter;
      document.querySelectorAll('[data-payfilter]').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));

  $('payList')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pay-informar]');
    if (btn && confirm('Confirmar que você já fez este pagamento via Pix?')) informarPagamento(btn.dataset.payInformar, btn);
  });

  $('payAdminPending')?.addEventListener('click', (ev) => {
    const ok = ev.target.closest('[data-pay-confirm]');
    if (ok) return confirmarPago(ok.dataset.payConfirm, ok.dataset.payUser, ok);
    const no = ev.target.closest('[data-pay-reject]');
    if (no) recusarPagamento(no.dataset.payReject, no);
  });
  $('payGenUser')?.addEventListener('change', fillGenDefaults);
  $('payGenBtn')?.addEventListener('click', gerarCobrancas);

  if (CONFIG.WHATSAPP) {
    const w = $('payWhatsBtn');
    if (w) {
      w.href = 'https://wa.me/' + CONFIG.WHATSAPP + '?text=' + encodeURIComponent('Olá! Segue o comprovante do meu pagamento do Respondi.');
      w.classList.remove('hidden');
    }
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { me = null; rows = []; clients = []; loaded = false; render(); }
  });

  // Se a aba for aberta por outro código, carrega mesmo assim.
  const panel = $('tab-' + TAB);
  if (panel) {
    new MutationObserver(() => {
      if (!panel.classList.contains('hidden') && !loaded && !loading) loadPayments();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
}

function init() {
  ensureUI();
  bind();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
