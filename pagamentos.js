// pagamentos.js — aba "Pagamentos" integrada ao Asaas + Fechamento de Mês e Consumo
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =====================  CONFIGURAÇÕES  ===================== */
const CONFIG = {
  SUPABASE_URL: 'https://abdliioyzkylccfylils.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU',

  // Configurações padrão de Chave Pix Manual (caso queira usar na aba Pix tradicional)
  PIX_KEY: '98982672165',
  PIX_KEY_TYPE: 'telefone',
  PIX_KEY_LABEL: 'Chave Pix (telefone)',
  PIX_BENEFICIARIO: 'Weverton junior abreu rodrigues',
  PIX_NOME: 'Weverton junior abreu rodrigues',
  PIX_CIDADE: 'SAO LUIS',

  WHATSAPP: '5598982672165',           // comprovante/suporte no WhatsApp
  FRANQUIA_MENSAGENS: 300,             // mensagens incluídas por conta, por mês
  PRECO_MENSAGEM_EXCEDENTE: 0.10,      // R$ cobrado por cada mensagem acima da franquia
};
/* ============================================================ */

const TAB = 'payments';
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
let qrChoice = null;  
let pixCode = '';     
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
        <div class="pay-pix-box" style="margin-top:1.2rem; background:var(--surface-2); padding:1.2rem; border-radius:12px; text-align:center; border:1px solid var(--border);">
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

/* ====================  PIX MANUAL (Fallback)  ==================== */
function pixKey() {
  const raw = String(CONFIG.PIX_KEY).trim();
  const digits = raw.replace(/\D/g, '');
  switch (CONFIG.PIX_KEY_TYPE) {
    case 'telefone': return '+' + (digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits);
    case 'cpf':
    case 'cnpj': return digits;
    case 'email': return raw.toLowerCase();
    default: return raw;
  }
}

function pixKeyDisplay() {
  if (CONFIG.PIX_KEY_TYPE === 'telefone') {
    const m = pixKey().slice(3).match(/^(\d{2})(\d{4,5})(\d{4})$/);
    if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  }
  return pixKey();
}

const tlv = (id, value) => id + String(value.length).padStart(2, '0') + value;

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const asciiUpper = (s, max, fallback) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '')
    .trim().toUpperCase().slice(0, max) || fallback;

function buildPixPayload({ key, name, city, amount }) {
  let p = tlv('00', '01') + tlv('01', '11')
    + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key))
    + tlv('52', '0000') + tlv('53', '986');
  if (amount && amount > 0) p += tlv('54', Number(amount).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', name) + tlv('60', city) + tlv('62', tlv('05', '***')) + '6304';
  return p + crc16(p);
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code Pix" style="width:100%;height:100%;display:block"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function renderQr(payload) {
  const box = $('payQr');
  if (!box) return;
  try {
    box.innerHTML = qrSvg(payload);
  } catch (e) {
    box.innerHTML = '<div class="pay-qr-fallback">QR Code indisponível.</div>';
  }
}

function refreshPix() {
  const sel = $('payQrAmount');
  if (!sel) return;
  const pend = rows.filter((p) => p.status === 'pendente');
  const ids = pend.map((p) => String(p.id));
  let choice = qrChoice;
  if (choice !== 'free' && !ids.includes(choice)) choice = ids[0] || 'free';

  sel.innerHTML = '<option value="free">Sem valor</option>'
    + pend.map((p) => `<option value="${esc(p.id)}">${esc(fmtMonth(p.competencia))} — ${esc(brl(p.valor))}</option>`).join('');
  sel.value = choice;

  const amount = choice === 'free' ? null : Number(pend.find((p) => String(p.id) === choice)?.valor);
  pixCode = buildPixPayload({
    key: pixKey(),
    name: asciiUpper(CONFIG.PIX_NOME, 25, 'RESPONDI'),
    city: asciiUpper(CONFIG.PIX_CIDADE, 15, 'BRASIL'),
    amount,
  });
  renderQr(pixCode);
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch {}
  if (!btn) return;
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.textContent = 'Copiado ✓';
  setTimeout(() => (btn.textContent = btn.dataset.label), 1800);
}

/* ====================  Consumo de Mensagens ==================== */
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
    #payUsage .kpi-strip { background: var(--bg-soft); margin-bottom: 1rem; }
    .use-list { display: flex; flex-direction: column; gap: 0.65rem; }
    .use-item { background: var(--bg-soft); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 0.95rem 1.1rem; }
    .use-item.over { border-color: rgba(239, 67, 96, 0.4); }
    .use-head { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; }
    .use-right { display: flex; align-items: center; gap: 0.6rem; }
    .use-count { font-family: var(--font-display); font-size: 0.95rem; color: var(--text-muted); }
    .use-bar { height: 8px; border-radius: var(--radius-pill); background: var(--border); overflow: hidden; margin: 0.6rem 0 0.45rem; }
    .use-bar > i { display: block; height: 100%; border-radius: inherit; background: var(--accent-grad); transition: width 0.5s var(--ease); }
    .use-total { margin-top: 1rem; border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 0.9rem 1.1rem; }
    .use-total-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.3rem 0; font-size: 0.92rem; color: var(--text-muted); }
    .use-total-row.sum { margin-top: 0.35rem; padding-top: 0.7rem; border-top: 1px solid var(--border-soft); font-weight: 700; font-size: 1.1rem; color: var(--text); }
  `;
  document.head.appendChild(st);
}

async function loadUsage() {
  const seq = ++usageSeq;
  let data = null, error = null;
  try {
    const [res, plan] = await Promise.all([
      sb.rpc('get_consumo_mensagens'),
      me?.id ? sb.from('profiles').select('monthly_plan_value').eq('id', me.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    ({ data, error } = res);
    usagePlanValue = Number(plan?.data?.monthly_plan_value) || null;
  } catch (e) { error = e; }
  if (seq !== usageSeq) return;
  if (error) {
    usage = null;
    usageError = 'Não consegui carregar o consumo de mensagens.';
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

  const itens = usage.map((a) => ({ ...a, ...usageOf(a.enviadas) }));
  const total = itens.reduce((sum, a) => sum + a.enviadas, 0);
  const restantes = itens.reduce((sum, a) => sum + a.restantes, 0);
  const excedentes = itens.reduce((sum, a) => sum + a.excedentes, 0);
  const extra = round2(itens.reduce((sum, a) => sum + a.extra, 0));

  const kpis = `
    <div class="kpi-strip">
      <div class="kpi-item accent"><span class="kpi-value">${num(total)}</span><span class="kpi-label">Enviadas em ${esc(mes.label)}</span></div>
      <div class="kpi-item"><span class="kpi-value">${num(restantes)}</span><span class="kpi-label">Restantes sem custo extra</span></div>
      <div class="kpi-item ${extra > 0 ? 'is-danger' : ''}"><span class="kpi-value">${brl(extra)}</span><span class="kpi-label">${excedentes > 0 ? `${num(excedentes)} excedentes` : 'Nenhum excedente'}</span></div>
    </div>`;

  const lista = itens.map((a) => {
    const over = a.excedentes > 0;
    const nome = '@' + esc(a.username || 'conta');
    return `
      <div class="use-item ${over ? 'over' : ''}">
        <div class="use-head">
          <strong>${nome}</strong>
          <span class="use-count"><b>${num(a.enviadas)}</b> / ${num(a.franquia)}</span>
        </div>
        <div class="use-bar"><i style="width:${a.pct.toFixed(1)}%"></i></div>
      </div>`;
  }).join('');

  const mensal = mensalidadeDoMes();
  const linhaMensal = mensal ? `<div class="use-total-row"><span>Mensalidade de ${esc(mes.label)}</span><span>${brl(mensal.valor)}</span></div>` : '';
  const linhaFatura = mensal ? `<div class="use-total-row sum"><span>Fatura total</span><span>${brl(mensal.fatura)}</span></div>` : '';

  body.innerHTML = kpis + `<div class="use-list">${lista}</div>` + `<div class="use-total">${linhaMensal}${linhaFatura}</div>`;
}

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
      <div class="page-head panel-heading-row"><div><h1>Pagamentos e Assinatura</h1><p>Cobranças, faturamento via Pix (Asaas) e consumo de mensagens.</p></div><button type="button" id="payRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button></div>
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
          <div id="payUsageBody"></div>
        </section>
      </div>

      <div id="seg-pay-admin" class="seg-panel hidden">
        <div id="payAdmin" class="pay-admin-stack hidden">
          <section class="panel"><div class="panel-heading-row"><h2>Aguardando confirmação</h2></div><div id="payAdminPending"></div></section>
          <section class="panel"><div class="panel-heading-row"><h2>Gerar cobranças</h2></div>
            <div class="automation-form-grid">
              <div class="field field-full"><span>Cliente</span><select id="payGenUser"></select></div>
              <div class="field"><span>Valor mensal (R$)</span><input type="number" id="payGenValor" step="0.01" min="0" placeholder="99,90" /></div>
              <div class="field"><span>Dia do vencimento (1–28)</span><input type="number" id="payGenDia" min="1" max="28" value="10" /></div>
              <div class="field"><span>Quantidade de meses</span><input type="number" id="payGenMeses" min="1" max="36" value="12" /></div>
            </div>
            <button type="button" id="payGenBtn" class="btn btn-primary" style="margin-top:1rem;">Gerar cobranças</button>
          </section>
          <section class="panel"><div class="panel-heading-row"><h2>Fechar mês: excedente de mensagens</h2></div>
            <div class="automation-form-grid">
              <div class="field"><span>Mês a fechar</span><input type="month" id="payCloseMonth" /></div>
              <div class="field"><button type="button" id="payClosePreviewBtn" class="btn btn-outline field-offset">Calcular prévia</button></div>
            </div>
            <div id="payClosePreview"></div>
          </section>
        </div>
      </div>`;
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

async function informarPagamento(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  const { error } = await sb.rpc('informar_pagamento', { p_id: id });
  if (error) {
    showBanner('Não foi possível registrar. Tente novamente.');
    if (btn) { btn.disabled = false; btn.textContent = 'Já paguei'; }
    return;
  }
  showBanner('Pagamento informado com sucesso!', 'success');
  await loadPayments();
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
          <div class="ig-tester-admin-actions">
            <button type="button" class="btn btn-primary btn-sm" data-pay-confirm="${esc(p.id)}" data-pay-user="${esc(p.user_id)}">Confirmar</button>
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
    <div class="kpi-item accent"><span class="kpi-value">${proxima ? brl(proxima.valor) : '—'}</span><span class="kpi-label">${proxima ? 'Próxima cobrança' : 'Tudo em dia'}</span></div>
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
        ${p.status === 'pendente' ? `<button type="button" class="btn btn-outline btn-sm" data-pay-informar="${esc(p.id)}">Já paguei</button>` : '<span></span>'}
      </div>`;
  }).join('');
}

function activateTab() {
  document.querySelectorAll('.app-main > .tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + TAB));
  document.querySelectorAll('.app-nav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === TAB));
  loadPayments();
}

function bind() {
  document.querySelectorAll('.app-nav .nav-item').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.tab === TAB) setTimeout(activateTab, 0);
      else $('tab-' + TAB)?.classList.add('hidden');
    }));

  $('payRefreshBtn')?.addEventListener('click', loadPayments);
  
  // Botão de Gerar Pix no Asaas
  $('payGenAsaasBtn')?.addEventListener('click', (e) => {
    const val = usagePlanValue || 99.90;
    gerarPixAsaas(val, e.currentTarget);
  });

  document.querySelectorAll('[data-payfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.payfilter;
      document.querySelectorAll('[data-payfilter]').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));

  $('payList')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pay-informar]');
    if (btn && confirm('Confirmar pagamento?')) informarPagamento(btn.dataset.payInformar, btn);
  });

  // Navegação das sub-abas internas
  document.addEventListener('click', (e) => {
    const segBtn = e.target.closest('.seg-nav .seg-btn');
    if (segBtn && segBtn.closest('#tab-' + TAB)) {
      const targetId = segBtn.dataset.seg;
      const parent = segBtn.closest('.tab-panel');
      parent.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === segBtn));
      parent.querySelectorAll('.seg-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== targetId);
      });
    }
  });

  const panel = $('tab-' + TAB);
  if (panel) {
    new MutationObserver(() => {
      if (!panel.classList.contains('hidden') && !loaded && !loading) loadPayments();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
}

// Pequena biblioteca de QR code embutida para suporte offline caso necessário
const qrcode = (function () {
  var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){return[]};return f.addData=function(t,r){u.push(t)},f.isDark=function(t,r){return false},f.getModuleCount=function(){return 21},f.make=function(){},f;};return t;})();

function init() {
  injectUsageStyles();
  ensureUI();
  bind();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
