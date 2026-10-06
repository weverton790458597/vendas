import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const supabase = createClient("https://abdliioyzkylccfylils.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU", { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
const COLORS = ["var(--accent-1)", "var(--accent-2)", "var(--success)", "var(--muted-accent)"];
const FORMATS = { REELS: "Reels", FEED: "Feed", STORY: "Story", CAROUSEL_ALBUM: "Carrossel", VIDEO: "Vídeo", IMAGE: "Imagem" };
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n || 0).toLocaleString("pt-BR");
let dias = 30;
let busy = false;
let loaded = false;
const empty = (t) => '<div class="empty-state">' + t + "</div>";
const kpi = (cls, label, value) => '<div class="kpi-item ' + cls + '"><span class="kpi-value">' + value + '</span><span class="kpi-label">' + label + "</span></div>";
const fmtDay = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
async function loadAutomations(uid) {
  const { data: p } = await supabase.from("profiles").select("automacoes_table_name").eq("id", uid).maybeSingle();
  const table = p && p.automacoes_table_name;
  if (!table) return [];
  const { data } = await supabase.from(table).select("instagram_media_id, palavra_chave, ativo");
  return data || [];
}
function dailyChart(d) {
  if (!d.some((x) => x.enviadas || x.falhas)) return empty("Nenhum envio neste período ainda.");
  const W = 600, H = 170, max = Math.max(...d.map((x) => x.enviadas + x.falhas), 1), bw = W / d.length;
  const bars = d.map((x, i) => {
    const h = (x.enviadas / max) * H, f = (x.falhas / max) * H, xx = i * bw + bw * 0.15, w = bw * 0.7;
    return "<g><title>" + fmtDay(x.dia) + ": " + x.enviadas + " enviadas, " + x.falhas + " falhas</title>" +
      '<rect x="' + xx + '" y="' + (H - h - f) + '" width="' + w + '" height="' + f + '" class="ov-bar-bad"/>' +
      '<rect x="' + xx + '" y="' + (H - h) + '" width="' + w + '" height="' + h + '" class="ov-bar-ok"/></g>';
  }).join("");
  return '<svg viewBox="0 0 ' + W + " " + (H + 4) + '" preserveAspectRatio="none" class="ov-svg">' + bars + "</svg>" +
    '<div class="ov-axis"><span>' + fmtDay(d[0].dia) + "</span><span>pico: " + num(max) + "/dia</span><span>" + fmtDay(d[d.length - 1].dia) + "</span></div>";
}
function rank(items) {
  if (!items.length) return empty("Sem dados neste período.");
  const m = Math.max(...items.map((i) => i.n), 1);
  return items.map((i) => '<div class="ov-row"><div class="ov-row-top"><span>' + i.label + "</span><b>" + num(i.n) + '</b></div><div class="ov-track"><i style="width:' + (i.n / m) * 100 + '%"></i></div></div>').join("");
}
function donut(list) {
  const t = list.reduce((a, x) => a + Number(x.n), 0);
  if (!t) return empty("Sem dados neste período.");
  let acc = 0;
  const stops = list.map((x, i) => { const s = (acc / t) * 100; acc += Number(x.n); return COLORS[i % 4] + " " + s + "% " + (acc / t) * 100 + "%"; }).join(",");
  const legend = list.map((x, i) => '<li><i style="background:' + COLORS[i % 4] + '"></i>' + esc(FORMATS[x.formato] || x.formato) + " <b>" + Math.round((x.n / t) * 100) + "%</b></li>").join("");
  return '<div class="ov-donut-wrap"><div class="ov-donut" style="background:conic-gradient(' + stops + ')"></div><ul class="ov-legend">' + legend + "</ul></div>";
}
function hoursChart(h) {
  const m = Math.max(...h, 1);
  if (!Math.max(...h)) return empty("Sem dados neste período.");
  return '<div class="ov-hours">' + h.map((n, i) => '<div class="ov-hour" title="' + i + "h: " + n + ' DMs"><i style="height:' + Math.max((n / m) * 100, 3) + '%"></i><span>' + (i % 6 === 0 ? i + "h" : "") + "</span></div>").join("") + "</div>";
}
function render(ov, cons, autos) {
  const d = ov.diario || [];
  const env = d.reduce((a, x) => a + x.enviadas, 0);
  const fal = d.reduce((a, x) => a + x.falhas, 0);
  const taxa = env + fal ? Math.round((env / (env + fal)) * 100) + "%" : "—";
  $("#ovKpis").innerHTML = kpi("accent", "DMs enviadas (" + ov.dias + " dias)", num(env)) + kpi("", "Pessoas alcançadas", num(ov.pessoas)) + kpi("", "Taxa de sucesso", taxa) + kpi("is-danger", "Falhas", num(fal)) + kpi("", "Automações ativas", num(autos.filter((a) => a.ativo).length)) + kpi("", "Contas conectadas", num(cons.length));
  $("#ovDaily").innerHTML = dailyChart(d);
  $("#ovPosts").innerHTML = rank((ov.posts || []).map((p) => {
    const kws = autos.filter((a) => String(a.instagram_media_id || "").indexOf(p.media_id) !== -1).map((a) => "“" + esc(a.palavra_chave) + "”");
    return { label: kws.length ? kws.join(" · ") : "Post …" + esc(String(p.media_id).slice(-6)), n: p.n };
  }));
  $("#ovFormats").innerHTML = donut(ov.formatos || []);
  $("#ovHours").innerHTML = hoursChart(ov.horas || []);
  $("#ovAccounts").innerHTML = rank(cons.map((c) => ({ label: "@" + esc(c.instagram_username), n: c.enviadas })));
  $("#ovErrors").innerHTML = (ov.erros || []).length ? rank(ov.erros.map((e) => ({ label: esc(e.erro), n: e.n }))) : empty("Nenhum erro de envio neste período.");
}
async function load() {
  if (busy || !$("#tab-overview")) return;
  busy = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    loaded = true;
    const [ov, cons, autos] = await Promise.all([
      supabase.rpc("get_dashboard_overview", { p_dias: dias }),
      supabase.rpc("get_consumo_mensagens"),
      loadAutomations(session.user.id).catch(() => []),
    ]);
    if (ov.error) throw ov.error;
    render(ov.data, cons.data || [], autos);
  } catch (e) {
    $("#ovKpis").innerHTML = empty("Não foi possível carregar a visão geral: " + esc(e.message));
  } finally {
    busy = false;
  }
}
function showOverview() {
  document.querySelectorAll(".app-main > .tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "tab-overview"));
  document.querySelectorAll(".app-nav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === "overview"));
}
document.addEventListener("click", (e) => {
  const nav = e.target.closest(".app-nav .nav-item");
  if (nav) {
    if (nav.dataset.tab === "overview") { showOverview(); load(); }
    else $("#tab-overview")?.classList.add("hidden");
    return;
  }
  const r = e.target.closest(".range-btn");
  if (r) {
    dias = Number(r.dataset.dias);
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.toggle("active", b === r));
    load();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  load();
  supabase.auth.onAuthStateChange((ev, s) => { if (s && !loaded) setTimeout(load, 0); });
});
