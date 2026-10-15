// pagamentos.js — aba "Pagamentos" integrada ao Asaas (baseado no módulo original)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =====================  CONFIGURAÇÕES  ===================== */
const CONFIG = {
  SUPABASE_URL: 'https://abdliioyzkylccfylils.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU',

  WHATSAPP: '5598982672165',           // comprovante/suporte no WhatsApp
  FRANQUIA_MENSAGENS: 300,             // mensagens incluídas por conta, por mês
  PRECO_MENSAGEM_EXCEDENTE: 0.10,      // R$ cobrado por cada mensagem acima da franquia
};
/* ============================================================ */

const TAB = 'pagamentos'; // Alinhado com o data-tab="pagamentos" do index.html
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: false },
});

const $ = (id) => document.getElementById(id);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

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

let me = null;        
let loaded = false;
let loading = false;
let rows = [];
let clients = [];     
let filter = 'abertas';
let usage = null;     
let usageError = '';
let usageSeq = 0;     
let usagePlanValue = null; 
let closePlan = null;      

/* ====================  INTEGRAÇÃO ASAAS (PIX)  ==================== */
async function gerarPixAsaas(valorPlano, btn) {
  if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Gerando Pix no Asaas…'; }
  const resDiv = $('payAsaasResult');
  if (resDiv) resDiv.innerHTML = '';

  try {
    const { data, error } = await sb.functions.invoke('asaas-create-payment', {
      body: { plan_type: 'Individual', value: valorPlano || 99.90 },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);

    if (resDiv) {
      resDiv.innerHTML = `
        <div class="pay-pix-box" style="margin-top:1.2rem; background:var(--surface-2, #18181b); padding:1.2rem; border-radius:12px; text-align:center; border: 1px solid var(--border);">
          <p style="margin-bottom:.5rem;"><strong>Escaneie o QR Code ou copie a chave Pix:</strong></p>
          ${data.pix_qr_code_base64 ? `<img src="data:image/png;base64,${data.pix_qr_code_base64}" alt="QR Code Pix" style="max-width:180px; margin:.5rem auto; display:block; border-radius:8px;" />` : ''}
          <textarea readonly style="width:100%; height:60px; font-size:12px; margin-top:.5rem; padding:.4rem; border-radius:6px; border:1px solid var(--border); background:var(--surface); color:var(--text);">${esc(data.pix_copia_e_cola)}</textarea>
          <div style="display:flex; gap:.5rem; margin-top:.8rem;">
            <button type="button" class="btn btn-outline btn-sm btn-full" id="payCopyAsaasPix">Copiar Pix Copia e Cola</button>
            <a href="${esc(data.invoice_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm btn-full">Abrir Fatura Asaas</a>
          </div>
        </div>
      `;
      $('payCopyAsaasPix')?.addEventListener('click', () => {
        navigator.clipboard.writeText(data.pix_copia_e_cola);
        alert('Código Pix copiado com sucesso!');
      });
    }
  } catch (err) {
    showBanner('Erro ao gerar cobrança no Asaas: ' + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || 'Gerar Pix de Pagamento'; }
  }
}

/* ==================== Consumo de Mensagens ==================== */
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);
const round2 = (v) => Math.round(v * 100) / 100;

function usageOf(enviadas) {
  const franquia = CONFIG.FRANQUIA_MENSAGENS;
  const excedentes = Math.max(0, enviadas - franquia);
  return {
    enviadas,
    franquia,
    excedentes,
    restantes: Math.max(0, franquia - enviadas),
    extra: round2(excedentes * CONFIG.PRECO_MENSAGEM_EXCEDENTE),
    pct: franquia > 0 ? Math.min(100, (enviadas / franquia) * 100) : 100,
  };
}

function usageMonthInfo() {
  const n = new Date();
  const prox = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  return {
    label: fmtMonth(iso(n.getFullYear(), n.getMonth(), 1)),
    proximo: fmtMonth(iso(prox.getFullYear(), prox.getMonth(), 1)),
    renova: fmtDate(iso(prox.getFullYear(), prox.getMonth(), 1)),
  };
}

function excedentesIncluidos(p) {
  const out = [];
  const re = /\[exc:(\d{4}-\d{2}):([\d.]+)\]\s*([^|\[]*)/g;
  const obs = String((p && p.observacao) || '');
  let m;
  while ((m = re.exec(obs))) out.push({ mes: m[1], valor: Number(m[2]), texto: m[3].trim() });
  return out;
}

function mensalidadeDoMes() {
  const n = new Date();
  const comp = iso(n.getFullYear(), n.getMonth(), 1);
  const row = rows.find((p) => String(p.competencia).slice(0, 10) === comp && p.status !== 'cancelado');
  if (row) {
    const inclusos = excedentesIncluidos(row);
    const somaInclusos = round2(inclusos.reduce((sum, e) => sum + e.valor, 0));
    return { valor: round2(Number(row.valor) - somaInclusos), inclusos, fatura: Number(row.valor), paga: row.status === 'pago' };
  }
  return usagePlanValue > 0 ? { valor: usagePlanValue, inclusos: [], fatura: usagePlanValue, paga: false } : null;
}

function injectUsageStyles() {
  if (document.getElementById('payUsageStyles')) return;
  const st = document.createElement('style');
  st.id = 'payUsageStyles';
  st.textContent = `
    #payUsage .kpi-strip { background: var(--bg-soft, var(--surface-2)); margin-bottom: 1rem; }
    .use-list { display: flex; flex-direction: column; gap: 0.65rem; }
    .use-item {
      background: var(--bg-soft, var(--surface)); border: 1px solid var(--border);
      border-radius: var(--radius-md, 12px); padding: 0.95rem 1.1rem;
    }
    .use-item.over { border-color: rgba(239, 67, 96, 0.4); }
    .use-head { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; }
    .use-head strong { font-size: 0.95rem; overflow-wrap: anywhere; }
    .use-right { display: flex; align-items: center; gap: 0.6rem; }
    .use-count { font-family: var(--font-display); font-size: 0.95rem; color: var(--text-muted); }
    .use-count b { font-size: 1.05rem; color: var(--text); }
    .use-item.over .use-count b { color: var(--danger, #ef4444); }
    .use-bar { height: 8px; border-radius: 999px; background: var(--border); overflow: hidden; margin: 0.6rem 0 0.45rem; }
    .use-bar > i { display: block; height: 100%; border-radius: inherit; background: var(--primary, #6366f1); transition: width 0.5s ease; }
    .use-item.warn .use-bar > i { background: var(--warning, #f59e0b); }
    .use-item.over .use-bar > i { background: var(--danger, #ef4444); }
    .use-note { font-size: 0.78rem; color: var(--text-faint, var(--text-muted)); }
    .use-total { margin-top: 1rem; border: 1px dashed var(--border); border-radius: 12px; padding: 0.9rem 1.1rem; }
    .use-total-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.3rem 0; font-size: 0.92rem; color: var(--text-muted); }
    .use-total-row.sum { margin-top: 0.35rem; padding-top: 0.7rem; border-top: 1px solid var(--border); font-weight: 700; font-size: 1.1rem; color: var(--text); }
    .use-total-note { font-size: 0.78rem; color: var(--text-faint, var(--text-muted)); margin: 0.5rem 0 0; }
  `;
  document.head.appendChild(st);
}

async function loadUsage() {
  const seq = ++usageSeq;
  let data = null;
  let error = null;
  try {
    const [res, plan] = await Promise.all([
      sb.rpc('get_consumo_mensagens'),
      me?.id ? sb.from('profiles').select('monthly_plan_value').eq('id', me.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    ({ data, error } = res);
    usagePlanValue = Number(plan?.data?.monthly_plan_value) || null;
  } catch (e) {
    error = e;
  }
  if (seq !== usageSeq) return;
  if (error) {
    console.error('[pagamentos] consumo de mensagens', error);
    usage = null;
    usageError = 'Não foi possível carregar o consumo de mensagens.';
  } else {
    usageError = '';
    usage = (data || []).map((r) => ({
      id: String(r.instagram_config_id),
      username: r.instagram_username || '',
      enviadas: Number(r.enviadas) || 0,
    }));
  }
  renderUsage();
}

function renderUsage() {
  const body = $('payUsageBody');
  if (!body) return;
  const mes = usageMonthInfo();
  const badge = $('payUsageMonth');
  if (badge) badge.textContent = mes.label;

  if (usageError) { body.innerHTML = `<div class="empty-state">${esc(usageError)}</div>`; return; }
  if (usage === null) { body.innerHTML = '<div class="loading-row">Carregando consumo…</div>'; return; }
  if (!usage.length) {
    body.innerHTML = '<div class="empty-state">Nenhuma conta do Instagram conectada ainda.</div>';
    return;
  }

  const preco = CONFIG.PRECO_MENSAGEM_EXCEDENTE;
  const itens = usage.map((a) => ({ ...a, ...usageOf(a.enviadas) }));
  const total = itens.reduce((sum, a) => sum + a.enviadas, 0);
  const restantes = itens.reduce((sum, a) => sum + a.restantes, 0);
  const excedentes = itens.reduce((sum, a) => sum + a.excedentes, 0);
  const extra = round2(itens.reduce((sum, a) => sum + a.extra, 0));

  const kpis = `
    <div class="kpi-strip">
      <div class="kpi-item accent"><span class="kpi-value">${num(total)}</span><span class="kpi-label">Enviadas em ${esc(mes.label)}</span></div>
      <div class="kpi-item"><span class="kpi-value">${num(restantes)}</span><span class="kpi-label">Ainda disponíveis sem custo extra</span></div>
      <div class="kpi-item ${extra > 0 ? 'is-danger' : ''}"><span class="kpi-value">${brl(extra)}</span><span class="kpi-label">${excedentes > 0 ? `${num(excedentes)} excedentes` : 'Nenhum excedente neste mês'}</span></div>
    </div>`;

  const lista = itens.map((a) => {
    const over = a.excedentes > 0;
    const warn = !over && a.pct >= 80;
    const nome = '@' + esc(a.username || 'conta');
    const aviso = over ? '<span class="badge badge-danger">Excedeu a franquia</span>' : warn ? `<span class="badge badge-warn">Perto do limite</span>` : '';
    return `
      <div class="use-item ${over ? 'over' : warn ? 'warn' : ''}">
        <div class="use-head">
          <strong>${nome}</strong>
          <span class="use-right">${aviso}<span class="use-count"><b>${num(a.enviadas)}</b> / ${num(a.franquia)}</span></span>
        </div>
        <div class="use-bar"><i style="width:${a.pct.toFixed(1)}%"></i></div>
      </div>`;
  }).join('');

  const mensal = mensalidadeDoMes();
  const linhaMensal = mensal ? `<div class="use-total-row"><span>Mensalidade de ${esc(mes.label)}</span><span>${brl(mensal.valor)}</span></div>` : '';
  const linhaFatura = mensal ? `<div class="use-total-row sum"><span>Fatura de ${esc(mes.label)}${mensal.paga ? ' (já paga)' : ''}</span><span>${brl(mensal.fatura)}</span></div>` : '';

  body.innerHTML = kpis + `<div class="use-list">${lista}</div>` + `<div class="use-total">${linhaMensal}${linhaFatura}</div>`;
}

/* ---------------------- Montagem e Estrutura da UI ---------------------- */
function ensureUI() {
  let panel = $('tab-' + TAB);
  if (!panel) {
    // Se o index.html contiver a div placeholder, reaproveitamos ela
    panel = $('tab-pagamentos');
  }

  if (!panel) {
    const main = document.querySelector('.app-main');
    if (!main) return;
    panel = document.createElement('div');
    panel.id = 'tab-' + TAB;
    panel.className = 'tab-panel hidden';
    main.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="page-head panel-heading-row">
      <div><h1>Pagamentos e Assinatura</h1><p>Cobranças, faturamento via Pix (Asaas) e consumo de mensagens.</p></div>
      <button type="button" id="payRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button>
    </div>
    <div id="payBanner" class="banner"></div>
    <div id="payKpis" class="kpi-strip"></div>

    <nav class="seg-nav">
      <button type="button" class="seg-btn active" data-seg="seg-pay-list">Cobranças</button>
      <button type="button" class="seg-btn" data-seg="seg-pay-pix">Gerar Pix (Asaas)</button>
      <button type="button" class="seg-btn" data-seg="seg-pay-usage">Consumo</button>
      <button type="button" class="seg-btn" data-seg="seg-pay-admin">Admin</button>
    </nav>

    <div id="seg-pay-list" class="seg-panel">
      <section class="panel panel-plain">
        <div class="panel-heading-row">
          <h2>Suas cobranças</h2>
          <div class="pay-filter">
            <button type="button" class="subtab-btn active" data-payfilter="abertas">Em aberto</button>
            <button type="button" class="subtab-btn" data-payfilter="pagas">Pagas</button>
            <button type="button" class="subtab-btn" data-payfilter="todas">Todas</button>
          </div>
        </div>
        <div id="payLoading" class="loading-row hidden">Carregando pagamentos…</div>
        <div id="payList" class="pay-list"></div>
      </section>
    </div>

    <div id="seg-pay-pix" class="seg-panel hidden">
      <section class="panel pay-pix" style="padding:1.5rem;">
        <div class="pay-pix-info">
          <h2>Pague com Pix via Asaas</h2>
          <p class="panel-lead">Clique no botão abaixo para criar uma cobrança instantânea no Asaas. Você receberá o QR Code e o Pix Copia e Cola para pagamento imediato.</p>
          
          <div style="margin-top:1.2rem;">
            <button type="button" id="payGenAsaasBtn" class="btn btn-primary">Gerar Pix de Pagamento</button>
          </div>
          <div id="payAsaasResult"></div>
        </div>
      </section>
    </div>

    <div id="seg-pay-usage" class="seg-panel hidden">
      <section class="panel" id="payUsage">
        <div class="panel-heading-row"><h2>Consumo de mensagens</h2><span class="badge badge-muted" id="payUsageMonth"></span></div>
        <p class="panel-lead">Cada conta conectada inclui ${esc(num(CONFIG.FRANQUIA_MENSAGENS))} mensagens por mês. Acima disso, cada mensagem extra custa ${esc(brl(CONFIG.PRECO_MENSAGEM_EXCEDENTE))}.</p>
        <div id="payUsageBody"></div>
      </section>
    </div>

    <div id="seg-pay-admin" class="seg-panel hidden">
      <div id="payAdmin" class="pay-admin-stack hidden">
        <section class="panel">
          <div class="panel-heading-row"><h2>Aguardando confirmação</h2></div>
          <div id="payAdminPending"></div>
        </section>
        <section class="panel">
          <div class="panel-heading-row"><h2>Gerar cobranças manuais</h2></div>
          <div class="automation-form-grid">
            <div class="field field-full"><span>Cliente</span><select id="payGenUser"></select></div>
            <div class="field"><span>Valor mensal (R$)</span><input type="number" id="payGenValor" step="0.01" min="0" placeholder="99,90" /></div>
            <div class="field"><span>Dia do vencimento (1–28)</span><input type="number" id="payGenDia" min="1" max="28" value="10" /></div>
            <div class="field"><span>Quantidade de meses</span><input type="number" id="payGenMeses" min="1" max="36" value="12" /></div>
          </div>
          <button type="button" id="payGenBtn" class="btn btn-primary" style="margin-top:1rem;">Gerar cobranças</button>
        </section>
      </div>
    </div>
  `;
}

function showBanner(msg, type = 'error') {
  const b = $('payBanner');
  if (!b) return;
  b.className = 'banner ' + (msg ? type : '');
  b.textContent = msg || '';
  if (msg && type === 'success') setTimeout(() => showBanner(''), 5000);
}

async function getMe() {
  if (me) return me;
  const { data: sess } = await sb.auth.getSession();
  const user = sess?.session?.user;
  if (!user) return null;
  const { data: prof } = await sb.from('profiles').select('id, email, is_admin').eq('id', user.id).maybeSingle();
  me = { id: user.id, email: prof?.email || user.email, is_admin: !!prof?.is_admin };
  return me;
}

async function loadPayments() {
  if (loading) return;
  loading = true;
  $('payLoading')?.classList.remove('hidden');
  showBanner('');
  try {
    const u = await getMe();
    if (!u) { rows = []; usage = null; render(); return; }
    loadUsage();
    const { data, error } = await sb
      .from('pagamentos')
      .select('id, competencia, valor, vencimento, status, informado_em, pago_em, observacao')
      .eq('user_id', u.id)
      .order('vencimento', { ascending: true });
    if (error) throw error;
    rows = data || [];
    loaded = true;
    render();
    $('payAdmin')?.classList.toggle('hidden', !u.is_admin);
    if (u.is_admin) await loadAdmin();
  } catch (e) {
    console.error('[pagamentos]', e);
    showBanner('Não consegui carregar os pagamentos.');
  } finally {
    loading = false;
    $('payLoading')?.classList.add('hidden');
  }
}

async function loadAdmin() {
  const [{ data: profs }, { data: pend }] = await Promise.all([
    sb.from('profiles').select('id, email, nome, monthly_plan_value, payment_due_date').order('email'),
    sb.from('pagamentos').select('id, user_id, competencia, valor, vencimento, informado_em').eq('status', 'em_analise').order('informado_em'),
  ]);
  clients = profs || [];
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));

  const box = $('payAdminPending');
  if (box) {
    if (!pend?.length) {
      box.innerHTML = '<div class="empty-state">Nenhum pagamento aguardando confirmação.</div>';
    } else {
      box.innerHTML = pend.map((p) => `
        <div class="ig-tester-admin-row">
          <div class="ig-tester-admin-info">
            <strong>${esc((byId[p.user_id] && byId[p.user_id].email) || p.user_id)}</strong>
            <span class="ig-tester-admin-date">${esc(fmtMonth(p.competencia))} · ${brl(p.valor)}</span>
          </div>
        </div>`).join('');
    }
  }

  const sel = $('payGenUser');
  if (sel) sel.innerHTML = clients.map((c) => `<option value="${esc(c.id)}">${esc(c.email)}</option>`).join('');
}

function render() {
  const list = $('payList');
  const kpis = $('payKpis');
  if (!list || !kpis) return;

  renderUsage();

  const abertas = rows.filter((p) => ['pendente', 'em_analise'].includes(p.status));
  const atrasadas = abertas.filter((p) => effectiveStatus(p) === 'atrasado');
  const proxima = abertas.find((p) => p.status === 'pendente') || abertas[0];
  const totalAberto = abertas.reduce((s, p) => s + Number(p.valor), 0);

  kpis.innerHTML = `
    <div class="kpi-item accent"><span class="kpi-value">${proxima ? brl(proxima.valor) : '—'}</span><span class="kpi-label">${proxima ? 'Próxima cobrança' : 'Nenhuma cobrança em aberto'}</span></div>
    <div class="kpi-item"><span class="kpi-value">${brl(totalAberto)}</span><span class="kpi-label">Total em aberto</span></div>
    <div class="kpi-item ${atrasadas.length ? 'is-danger' : ''}"><span class="kpi-value">${atrasadas.length}</span><span class="kpi-label">Em atraso</span></div>`;

  let view = rows;
  if (filter === 'abertas') view = abertas;
  if (filter === 'pagas') view = rows.filter((p) => p.status === 'pago').slice().reverse();

  if (!view.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma cobrança encontrada.</div>';
    return;
  }

  list.innerHTML = view.map((p) => {
    const st = effectiveStatus(p);
    const ui = STATUS_UI[st] || STATUS_UI.pendente;
    return `
      <div class="pay-item pay-${st}">
        <div class="pay-item-main">
          <strong>${esc(fmtMonth(p.competencia))}</strong>
          <span class="pay-item-note">Vence em ${fmtDate(p.vencimento)}</span>
        </div>
        <div class="pay-item-value">${brl(p.valor)}</div>
        <span class="badge ${ui.cls}">${ui.label}</span>
      </div>`;
  }).join('');
}

function activateTab() {
  document.querySelectorAll('.app-main > .tab-panel').forEach((p) => p.classList.add('hidden'));
  const target = $('tab-' + TAB) \vert{}\vert{}$('tab-pagamentos');
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.app-nav .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === TAB || b.dataset.tab === 'pagamentos');
  });
  loadPayments();
}

function bind() {
  // Ouve cliques na navegação lateral
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.app-nav .nav-item');
    if (nav) {
      const t = nav.dataset.tab;
      if (t === TAB || t === 'pagamentos') {
        activateTab();
      } else {
        const p = $('tab-' + TAB) \vert{}\vert{}$('tab-pagamentos');
        if (p) p.classList.add('hidden');
      }
    }
  });

  $('payRefreshBtn')?.addEventListener('click', loadPayments);
  
  // Botão de Gerar Pix no Asaas
  $('payGenAsaasBtn')?.addEventListener('click', (e) => {
    const val = usagePlanValue || 99.90;
    gerarPixAsaas(val, e.currentTarget);
  });

  // Filtros (Em aberto / Pagas / Todas)
  document.querySelectorAll('[data-payfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.payfilter;
      document.querySelectorAll('[data-payfilter]').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));

  // Navegação das sub-abas internas (Cobranças / Pix / Consumo / Admin)
  document.addEventListener('click', (e) => {
    const segBtn = e.target.closest('.seg-nav .seg-btn');
    if (segBtn && segBtn.closest('#tab-' + TAB || '#tab-pagamentos')) {
      const targetId = segBtn.dataset.seg;
      const parent = segBtn.closest('.tab-panel');
      parent.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === segBtn));
      parent.querySelectorAll('.seg-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== targetId);
      });
    }
  });

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { me = null; rows = []; loaded = false; usage = null; render(); }
  });
}

function init() {
  injectUsageStyles();
  ensureUI();
  bind();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
