// pagamentos.js — aba "Pagamentos" (módulo independente; não depende dos outros JS)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =====================  CONFIGURE AQUI  ===================== */
const CONFIG = {
  SUPABASE_URL: 'https://abdliioyzkylccfylils.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU',

  // ---- Pix: o QR Code é gerado sozinho a partir destes dados ----
  PIX_KEY: '98982672165',              // sua chave Pix
  PIX_KEY_TYPE: 'telefone',            // 'telefone' | 'cpf' | 'cnpj' | 'email' | 'aleatoria'
  PIX_KEY_LABEL: 'Chave Pix (telefone)',
  PIX_BENEFICIARIO: 'Weverton junior abreu rodrigues',        // texto "Favorecido" mostrado na tela
  PIX_NOME: 'Weverton junior abreu rodrigues',                // nome dentro do Pix (máx. 25, sem acento)
  PIX_CIDADE: 'SAO LUIS',              // cidade dentro do Pix (máx. 15, sem acento)

  WHATSAPP: '5598982672165',           // comprovante vai pra esse WhatsApp ('' esconde o botão)

  // ---- Franquia de mensagens (vale POR CONTA do Instagram conectada, renova todo mês) ----
  FRANQUIA_MENSAGENS: 500,             // mensagens incluídas por conta, por mês
  PRECO_MENSAGEM_EXCEDENTE: 0.10,      // R$ cobrado por cada mensagem acima da franquia
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
let qrChoice = null;  // 'free' | id da cobrança | null (ainda não escolhido => usa a próxima pendente)
let pixCode = '';     // Pix copia e cola atual
let usage = null;     // consumo de mensagens: null = ainda não carregou | [{ id, username, enviadas }]
let usageError = '';
let usageSeq = 0;     // descarta respostas antigas se chegarem fora de ordem
let usagePlanValue = null; // profiles.monthly_plan_value (reserva, se não houver cobrança do mês)
let closePlan = null;      // admin: prévia do fechamento do mês { mes, proxIso, itens }

/* ====================  PIX: copia e cola + QR Code  ==================== */

// Chave no formato que o Pix exige dentro do QR (telefone = +55DDNNNNNNNNN).
function pixKey() {
  const raw = String(CONFIG.PIX_KEY).trim();
  const digits = raw.replace(/\D/g, '');
  switch (CONFIG.PIX_KEY_TYPE) {
    case 'telefone': return '+' + (digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits);
    case 'cpf':
    case 'cnpj': return digits;
    case 'email': return raw.toLowerCase();
    default: return raw; // chave aleatória
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

// CRC16-CCITT (poly 0x1021, init 0xFFFF) exigido pelo BR Code do Banco Central.
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

// Monta o "Pix copia e cola" (BR Code estático). amount = null => cliente digita o valor.
function buildPixPayload({ key, name, city, amount }) {
  let p = tlv('00', '01') + tlv('01', '11')
    + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key))
    + tlv('52', '0000') + tlv('53', '986');
  if (amount && amount > 0) p += tlv('54', Number(amount).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', name) + tlv('60', city) + tlv('62', tlv('05', '***')) + '6304';
  return p + crc16(p);
}

// Desenha o QR Code como SVG (nítido em qualquer tela, sem imagem externa).
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
    console.error('[pagamentos] QR', e);
    box.innerHTML = '<div class="pay-qr-fallback">QR Code indisponível.<br>Use a chave ao lado.</div>';
  }
}

// Atualiza o seletor de valor, o copia e cola e o QR conforme as cobranças pendentes.
function refreshPix() {
  const sel = $('payQrAmount');
  if (!sel) return;
  const pend = rows.filter((p) => p.status === 'pendente');
  const ids = pend.map((p) => String(p.id));
  let choice = qrChoice;
  if (choice !== 'free' && !ids.includes(choice)) choice = ids[0] || 'free';

  sel.innerHTML = '<option value="free">Sem valor (eu digito no app do banco)</option>'
    + pend.map((p) => `<option value="${esc(p.id)}">${esc(fmtMonth(p.competencia))} — ${esc(brl(p.valor))}</option>`).join('');
  sel.value = choice;

  const amount = choice === 'free' ? null : Number(pend.find((p) => String(p.id) === choice)?.valor);
  pixCode = buildPixPayload({
    key: pixKey(),
    name: asciiUpper(CONFIG.PIX_NOME, 25, 'RESPONDI'),
    city: asciiUpper(CONFIG.PIX_CIDADE, 15, 'BRASIL'),
    amount,
  });
  const hint = $('payQrHint');
  if (hint) hint.textContent = amount > 0
    ? `QR Code já com o valor de ${brl(amount)} preenchido.`
    : 'QR Code sem valor: digite o valor no app do banco.';
  renderQr(pixCode);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (!btn) return;
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.textContent = 'Copiado ✓';
  setTimeout(() => (btn.textContent = btn.dataset.label), 1800);
}

/* ====================  Consumo de mensagens (franquia por conta)  ====================
   Fonte: RPC get_consumo_mensagens() (ver consumo_mensagens.sql). Ela conta as linhas de
   message_queue com status 'sent' no mês corrente (fuso America/Fortaleza), uma linha por
   conta do Instagram conectada do usuário logado. Cada conta tem a própria franquia:
   não acumula e não soma com as outras contas. */
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

// Quando o admin "fecha o mês", o excedente de mensagens do mês anterior é somado ao `valor`
// da cobrança do mês seguinte e registrado em `observacao` neste formato (usado como trava
// anti-duplicidade e para mostrar ao cliente por que a fatura está maior):
//   [exc:2026-09:6.00] Inclui R$ 6,00 de excedente de mensagens de Setembro de 2026 (60 × R$ 0,10)
function excedentesIncluidos(p) {
  const out = [];
  const re = /\[exc:(\d{4}-\d{2}):([\d.]+)\]\s*([^|\[]*)/g;
  const obs = String((p && p.observacao) || '');
  let m;
  while ((m = re.exec(obs))) out.push({ mes: m[1], valor: Number(m[2]), texto: m[3].trim() });
  return out;
}

// Fatura do mês corrente: a cobrança (competência = dia 1 do mês) tem prioridade; se ainda
// não foi gerada, cai no valor do plano cadastrado em profiles. `valor` aqui é só a
// mensalidade (já sem o excedente de meses anteriores que a cobrança possa carregar).
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
    .use-item {
      background: var(--bg-soft); border: 1px solid var(--border-soft);
      border-radius: var(--radius-md); padding: 0.95rem 1.1rem;
    }
    .use-item.over { border-color: rgba(239, 67, 96, 0.4); }
    .use-head { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; }
    .use-head strong { font-size: 0.95rem; overflow-wrap: anywhere; }
    .use-right { display: flex; align-items: center; gap: 0.6rem; }
    .use-count { font-family: var(--font-display); font-size: 0.95rem; color: var(--text-muted); }
    .use-count b { font-size: 1.05rem; color: var(--text); }
    .use-item.over .use-count b { color: var(--danger); }
    .use-bar { height: 8px; border-radius: var(--radius-pill); background: var(--border); overflow: hidden; margin: 0.6rem 0 0.45rem; }
    .use-bar > i { display: block; height: 100%; border-radius: inherit; background: var(--accent-grad); transition: width 0.5s var(--ease); }
    .use-item.warn .use-bar > i { background: var(--warning); }
    .use-item.over .use-bar > i { background: var(--danger); }
    .use-note { font-size: 0.78rem; color: var(--text-faint); }
    .use-item.over .use-note { color: var(--danger); }
    .use-item.over .use-note b { color: var(--danger); }
    .use-total { margin-top: 1rem; border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 0.9rem 1.1rem; }
    .use-total-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.3rem 0; font-size: 0.92rem; color: var(--text-muted); }
    .use-total-row.extra.on { color: var(--danger); }
    .use-total-row.sum { margin-top: 0.35rem; padding-top: 0.7rem; border-top: 1px solid var(--border-soft); font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--text); }
    .use-total-row.soon { margin-top: 0.6rem; padding-top: 0.7rem; border-top: 1px dashed var(--border-soft); }
    .use-total-note { font-size: 0.78rem; color: var(--text-faint); margin: 0.5rem 0 0; }
    @media (prefers-reduced-motion: reduce) { .use-bar > i { transition: none; } }
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
    usagePlanValue = Number(plan?.data?.monthly_plan_value) || null; // falha aqui não derruba o painel
  } catch (e) {
    error = e;
  }
  if (seq !== usageSeq) return; // já existe uma consulta mais nova
  if (error) {
    console.error('[pagamentos] consumo de mensagens', error);
    usage = null;
    usageError = 'Não consegui carregar o consumo de mensagens. Confira se o SQL consumo_mensagens.sql foi executado e tente atualizar.';
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
    body.innerHTML = '<div class="empty-state">Nenhuma conta do Instagram conectada ainda. O consumo aparece aqui assim que você conectar uma conta.</div>';
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
      <div class="kpi-item ${extra > 0 ? 'is-danger' : ''}"><span class="kpi-value">${brl(extra)}</span><span class="kpi-label">${excedentes > 0
        ? `${num(excedentes)} ${plural(excedentes, 'mensagem', 'mensagens')} × ${brl(preco)} · entra na fatura de ${esc(mes.proximo)}`
        : 'Nenhum excedente neste mês'}</span></div>
    </div>`;

  const lista = itens.map((a) => {
    const over = a.excedentes > 0;
    const warn = !over && a.pct >= 80;
    const nome = '@' + esc(a.username || 'conta');
    const aviso = over
      ? '<span class="badge badge-danger">Excedeu a franquia</span>'
      : warn ? `<span class="badge badge-warn">${a.restantes === 0 ? 'Franquia esgotada' : 'Perto do limite'}</span>` : '';
    const nota = over
      ? `${num(a.excedentes)} ${plural(a.excedentes, 'mensagem acima', 'mensagens acima')} da franquia × ${brl(preco)} = <b>${brl(a.extra)}</b> a pagar neste mês`
      : `Restam ${num(a.restantes)} ${plural(a.restantes, 'mensagem', 'mensagens')} · a franquia renova em ${esc(mes.renova)}`;
    return `
      <div class="use-item ${over ? 'over' : warn ? 'warn' : ''}">
        <div class="use-head">
          <strong>${nome}</strong>
          <span class="use-right">${aviso}<span class="use-count"><b>${num(a.enviadas)}</b> / ${num(a.franquia)}</span></span>
        </div>
        <div class="use-bar" role="progressbar" aria-label="Mensagens enviadas por ${nome}" aria-valuemin="0" aria-valuemax="${a.franquia}" aria-valuenow="${Math.min(a.enviadas, a.franquia)}"><i style="width:${a.pct.toFixed(1)}%"></i></div>
        <div class="use-note">${nota}</div>
      </div>`;
  }).join('');

  const mensal = mensalidadeDoMes();
  const linhaMensal = mensal
    ? `<div class="use-total-row"><span>Mensalidade de ${esc(mes.label)}</span><span>${brl(mensal.valor)}</span></div>`
    : '';
  const linhasIncl = mensal
    ? mensal.inclusos.map((e) => `<div class="use-total-row extra on"><span>Excedente de ${esc(fmtMonth(e.mes + '-01'))} (cobrado nesta fatura)</span><span>${brl(e.valor)}</span></div>`).join('')
    : '';
  const linhaFatura = mensal
    ? `<div class="use-total-row sum"><span>Fatura de ${esc(mes.label)}${mensal.paga ? ' (já paga)' : ''}</span><span>${brl(mensal.fatura)}</span></div>`
    : '';
  const linhaAcumulando = `<div class="use-total-row soon extra ${extra > 0 ? 'on' : ''}"><span>Excedente de ${esc(mes.label)} até agora${excedentes > 0 ? ` (${num(excedentes)} × ${brl(preco)})` : ''}</span><span>${brl(extra)}</span></div>`;
  const notaTotal = (extra > 0
    ? `Esse valor será somado à fatura de ${mes.proximo} e continua sendo atualizado a cada mensagem enviada até o fim do mês.`
    : `Se alguma conta passar da franquia, o excedente de ${mes.label} entra na fatura de ${mes.proximo}.`)
    + (mensal ? '' : ' Não encontrei a fatura deste mês para mostrar a mensalidade.');
  const resumo = `<div class="use-total">${linhaMensal}${linhasIncl}${linhaFatura}${linhaAcumulando}<p class="use-total-note">${esc(notaTotal)}</p></div>`;

  body.innerHTML = kpis + `<div class="use-list">${lista}</div>` + resumo;
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
      <div class="panel-heading-row"><h1 style="margin:0;">Pagamentos</h1>
        <button type="button" id="payRefreshBtn" class="btn btn-outline btn-sm">Atualizar</button>
      </div>
      <div id="payBanner" class="banner"></div>
      <div id="payKpis" class="kpi-strip"></div>

      <section class="panel" id="payUsage">
        <div class="panel-heading-row"><h2>Consumo de mensagens</h2>
          <span class="badge badge-muted" id="payUsageMonth"></span>
        </div>
        <p class="panel-lead">Cada conta conectada inclui ${esc(num(CONFIG.FRANQUIA_MENSAGENS))} mensagens por mês. Acima disso, cada mensagem extra custa ${esc(brl(CONFIG.PRECO_MENSAGEM_EXCEDENTE))}. A franquia é individual: a sobra de uma conta não cobre o excedente de outra. O excedente de cada mês é somado à fatura do mês seguinte.</p>
        <div id="payUsageBody"></div>
      </section>

      <section class="panel pay-pix">
        <div class="pay-pix-qr" style="width:220px;height:220px;">
          <div id="payQr" style="width:100%;height:100%;"></div>
        </div>
        <div class="pay-pix-info">
          <h2>Pague via Pix</h2>
          <p class="panel-lead" style="margin-top:0;">Escaneie o QR Code no app do seu banco ou use o Pix copia e cola. Depois de pagar, clique em <b>“Já paguei”</b> na cobrança correspondente.</p>

          <div class="field" style="margin-bottom:0.9rem;">
            <span>Valor do QR Code</span>
            <select id="payQrAmount"></select>
            <p id="payQrHint" class="field-hint"></p>
          </div>

          <div class="pay-key-label">${esc(CONFIG.PIX_KEY_LABEL)}</div>
          <div class="pay-key-row">
            <code id="payKeyValue">${esc(pixKeyDisplay())}</code>
            <button type="button" id="payCopyBtn" class="btn btn-primary btn-sm">Copiar chave</button>
          </div>
          <div class="pay-key-benef">Favorecido: ${esc(CONFIG.PIX_BENEFICIARIO)}</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" id="payCopyCodeBtn" class="btn btn-outline btn-sm">📋 Copiar Pix copia e cola</button>
            <a id="payWhatsBtn" class="btn btn-outline btn-sm hidden" target="_blank" rel="noopener">💬 Enviar comprovante no WhatsApp</a>
          </div>
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

        <h3 style="margin:1.8rem 0 .4rem;">Fechar mês: excedente de mensagens</h3>
        <p class="field-hint" style="margin-top:0;">Soma o excedente de cada cliente (acima de ${esc(num(CONFIG.FRANQUIA_MENSAGENS))} por conta, ${esc(brl(CONFIG.PRECO_MENSAGEM_EXCEDENTE))} cada) na cobrança pendente do mês seguinte. Você confere a prévia antes de aplicar.</p>
        <div class="automation-form-grid">
          <div class="field"><span>Mês a fechar</span><input type="month" id="payCloseMonth" /></div>
          <div class="field"><button type="button" id="payClosePreviewBtn" class="btn btn-outline" style="margin-top:1.7rem;">Calcular prévia</button></div>
        </div>
        <div id="payClosePreview"></div>
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
    if (!u) { rows = []; usage = null; render(); return; }
    loadUsage(); // consumo de mensagens: roda em paralelo e tem tratamento de erro próprio
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

/* ---------------------- Admin: fechar mês (excedente de mensagens) ---------------------- */
function fillCloseDefault() {
  const input = $('payCloseMonth');
  if (!input || input.value) return;
  const n = new Date();
  const ant = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const val = `${ant.getFullYear()}-${pad(ant.getMonth() + 1)}`;
  input.value = val;
  input.max = val; // só meses já encerrados
}

const CLOSE_STATES = {
  ok:           { badge: 'badge-ativo', label: 'Pronto' },
  ja:           { badge: 'badge-muted', label: 'Já aplicado' },
  sem_cobranca: { badge: 'badge-warn',  label: 'Sem cobrança' },
  bloqueada:    { badge: 'badge-warn',  label: 'Bloqueada' },
};

async function calcularFechamento() {
  const val = $('payCloseMonth').value; // 'YYYY-MM'
  if (!/^\d{4}-\d{2}$/.test(val)) { showBanner('Escolha o mês que será fechado.'); return; }
  const [y, m] = val.split('-').map(Number);
  const mesIso = iso(y, m - 1, 1);
  const hoje = new Date();
  if (mesIso >= iso(hoje.getFullYear(), hoje.getMonth(), 1)) {
    showBanner('Só dá para fechar meses já encerrados.');
    return;
  }
  const prox = new Date(y, m, 1); // m é 1-12, então isto já é o mês seguinte
  const proxIso = iso(prox.getFullYear(), prox.getMonth(), 1);
  const marcador = `[exc:${val}:`;

  const btn = $('payClosePreviewBtn');
  btn.disabled = true; btn.textContent = 'Calculando…';
  showBanner('');
  try {
    const { data, error } = await sb.rpc('admin_get_consumo_mensagens', { p_mes: mesIso });
    if (error) throw error;

    // Excedente por cliente = soma dos excedentes de cada conta (franquia é por conta).
    const porUser = new Map();
    for (const r of data || []) {
      const u = usageOf(Number(r.enviadas) || 0);
      const e = porUser.get(r.user_id) || { userId: r.user_id, email: r.email, excedentes: 0, extra: 0 };
      e.excedentes += u.excedentes;
      e.extra = round2(e.extra + u.extra);
      porUser.set(r.user_id, e);
    }
    const devedores = [...porUser.values()].filter((e) => e.extra > 0);

    let cobrancas = [];
    if (devedores.length) {
      const { data: cs, error: e2 } = await sb.from('pagamentos')
        .select('id, user_id, competencia, valor, status, observacao')
        .eq('competencia', proxIso)
        .in('user_id', devedores.map((d) => d.userId));
      if (e2) throw e2;
      cobrancas = cs || [];
    }
    const porCobranca = Object.fromEntries(cobrancas.map((c) => [c.user_id, c]));

    const itens = devedores.map((d) => {
      const alvo = porCobranca[d.userId] || null;
      let estado = 'ok';
      let motivo = '';
      if (!alvo) {
        estado = 'sem_cobranca';
        motivo = `Não existe cobrança de ${fmtMonth(proxIso)}. Gere as cobranças desse cliente primeiro.`;
      } else if (String(alvo.observacao || '').includes(marcador)) {
        estado = 'ja';
        motivo = 'Esse excedente já foi somado nesta cobrança.';
      } else if (alvo.status !== 'pendente') {
        estado = 'bloqueada';
        motivo = `A cobrança está “${(STATUS_UI[alvo.status] || {}).label || alvo.status}”; só dá para alterar o valor de cobrança pendente.`;
      }
      const novo = alvo ? round2(Number(alvo.valor) + d.extra) : null;
      return { ...d, alvo, novo, estado, motivo };
    });

    closePlan = { val, mesIso, proxIso, itens };
    renderFechamento(!(data || []).length);
  } catch (e) {
    console.error('[pagamentos fechamento]', e);
    closePlan = null;
    $('payClosePreview').innerHTML = '';
    showBanner(String(e?.message || '').includes('acesso negado')
      ? 'Apenas administradores podem fechar o mês.'
      : 'Não consegui calcular o fechamento. Confira se o SQL fechamento_excedente.sql foi executado. (' + (e?.message || e) + ')');
  } finally {
    btn.disabled = false; btn.textContent = 'Calcular prévia';
  }
}

function renderFechamento(semContas) {
  const box = $('payClosePreview');
  if (!box || !closePlan) return;
  const { mesIso, proxIso, itens } = closePlan;
  const cab = `<p class="field-hint" style="margin:1rem 0 .6rem;">Fechando <b>${esc(fmtMonth(mesIso))}</b> → o excedente entra na cobrança de <b>${esc(fmtMonth(proxIso))}</b>.</p>`;
  if (!itens.length) {
    box.innerHTML = cab + `<div class="empty-state">${semContas ? 'Nenhuma conta do Instagram conectada.' : 'Nenhum cliente passou da franquia neste mês. Nada a cobrar. 🎉'}</div>`;
    return;
  }
  const prontos = itens.filter((i) => i.estado === 'ok');
  const totalProntos = round2(prontos.reduce((sum, i) => sum + i.extra, 0));
  const linhas = itens.map((i) => {
    const st = CLOSE_STATES[i.estado];
    const detalhe = i.estado === 'ok'
      ? `${num(i.excedentes)} ${plural(i.excedentes, 'mensagem', 'mensagens')} acima da franquia · +${brl(i.extra)} · cobrança de ${fmtMonth(proxIso)}: ${brl(i.alvo.valor)} → <b>${brl(i.novo)}</b>`
      : `${num(i.excedentes)} ${plural(i.excedentes, 'mensagem', 'mensagens')} acima da franquia · ${brl(i.extra)} · ${esc(i.motivo)}`;
    return `
      <div class="ig-tester-admin-row">
        <div class="ig-tester-admin-info">
          <strong>${esc(i.email || i.userId)}</strong>
          <span class="ig-tester-admin-date">${detalhe}</span>
        </div>
        <div class="ig-tester-admin-actions"><span class="badge ${st.badge}">${st.label}</span></div>
      </div>`;
  }).join('');
  const acao = prontos.length
    ? `<button type="button" class="btn btn-primary" id="payCloseApplyBtn" style="margin-top:.9rem;">Aplicar em ${prontos.length} ${plural(prontos.length, 'cobrança', 'cobranças')} (+${brl(totalProntos)})</button>`
    : '<p class="field-hint">Nada pronto para aplicar.</p>';
  box.innerHTML = cab + linhas + acao;
}

async function aplicarFechamento(btn) {
  if (!closePlan) return;
  const { val, mesIso, proxIso, itens } = closePlan;
  const prontos = itens.filter((i) => i.estado === 'ok');
  if (!prontos.length) return;
  const total = round2(prontos.reduce((sum, i) => sum + i.extra, 0));
  if (!confirm(`Somar ${brl(total)} de excedente em ${prontos.length} cobrança(s) de ${fmtMonth(proxIso)}?\n\nO valor da cobrança de cada cliente será alterado.`)) return;

  btn.disabled = true; btn.textContent = 'Aplicando…';
  let ok = 0;
  const falhas = [];
  for (const i of prontos) {
    const texto = `Inclui ${brl(i.extra)} de excedente de mensagens de ${fmtMonth(mesIso)} (${num(i.excedentes)} × ${brl(CONFIG.PRECO_MENSAGEM_EXCEDENTE)})`;
    const obs = (i.alvo.observacao ? String(i.alvo.observacao) + ' | ' : '') + `[exc:${val}:${i.extra.toFixed(2)}] ${texto}`;
    // Trava: só altera se a cobrança continua pendente e com o mesmo valor visto na prévia.
    const { data, error } = await sb.from('pagamentos')
      .update({ valor: i.novo, observacao: obs })
      .eq('id', i.alvo.id).eq('status', 'pendente').eq('valor', i.alvo.valor)
      .select('id');
    if (error || !data?.length) {
      console.error('[pagamentos fechamento]', error || 'nenhuma linha alterada', i.email);
      falhas.push(i.email || i.userId);
    } else ok++;
  }
  await calcularFechamento(); // atualiza a prévia (essas cobranças passam a "Já aplicado")
  await loadPayments();
  // O aviso vem por último porque as duas chamadas acima limpam o banner.
  if (falhas.length) showBanner(`Aplicado em ${ok}. Não consegui aplicar em: ${falhas.join(', ')} (a cobrança mudou ou houve erro). Confira a prévia.`);
  else showBanner(`Excedente somado em ${ok} ${plural(ok, 'cobrança', 'cobranças')}.`, 'success');
}

/* ---------------------- Render ---------------------- */
function render() {
  const list = $('payList');
  const kpis = $('payKpis');
  if (!list || !kpis) return;

  refreshPix();
  renderUsage();

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
          ${excedentesIncluidos(p).map((e) => `<span class="pay-item-note" style="display:block;">${esc(e.texto)}</span>`).join('')}
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

  $('payCopyBtn')?.addEventListener('click', (ev) => copyText(pixKey(), ev.currentTarget));
  $('payCopyCodeBtn')?.addEventListener('click', (ev) => copyText(pixCode, ev.currentTarget));
  $('payQrAmount')?.addEventListener('change', (ev) => { qrChoice = ev.target.value; refreshPix(); });

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
  $('payClosePreviewBtn')?.addEventListener('click', calcularFechamento);
  $('payClosePreview')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('#payCloseApplyBtn');
    if (b) aplicarFechamento(b);
  });

  if (CONFIG.WHATSAPP) {
    const w = $('payWhatsBtn');
    if (w) {
      w.href = 'https://wa.me/' + CONFIG.WHATSAPP + '?text=' + encodeURIComponent('Olá! Segue o comprovante do meu pagamento do Respondi.');
      w.classList.remove('hidden');
    }
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { me = null; rows = []; clients = []; loaded = false; qrChoice = null; usage = null; usageError = ''; usagePlanValue = null; closePlan = null; render(); }
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
  injectUsageStyles();
  ensureUI();
  fillCloseDefault();
  bind();
  render();
}

/* ====================  Biblioteca de QR Code (embutida)  ====================
   qrcode-generator 1.4.4 — Copyright (c) 2009 Kazuhiko Arase — licença MIT
   https://github.com/kazuhikoarase/qrcode-generator
   Embutida aqui para o QR Code nunca depender de CDN/internet. Não precisa mexer. */
const qrcode = (function () {
var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=b(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=M(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=b(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1})},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},f};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),b=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},M=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)};
return qrcode;
})();


if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
