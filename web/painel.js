/* ============================================================
   NEXUS ADS — painel.js (módulo ESM, sem build)

   Toda conta passa por M = montar(dataset). O dataset vem do banco
   (nx_dados → datasetDeLinhas) ou do gerador fictício (?demo →
   gerarDemo). O painel não sabe — nem precisa saber — de onde veio.
   ============================================================ */
import {
  datasetDeLinhas, montar, hojeSP, meioDia, isoDe, fin, brl, brl0, int, pc, dec, esc, waHtml, fmtN,
  razao, variacao, plural, nomePlat, CFG_PADRAO, cfgCom, MESES, MES3, SEMANA,
} from "./nucleo.js";
import { gerarDemo } from "./demo.js";
import * as api from "./dados.js";

/* ============================================================
   0. UTILIDADES
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEMO = Q.has("demo");
// ?noanim: tudo estático (capturas de tela e testes)
const NOANIM = Q.has("noanim");
if (NOANIM) document.documentElement.classList.add("noanim");
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches || NOANIM;
const FINE = matchMedia("(pointer: fine)").matches;
const DIAS_JANELA = 130;
const NOME_DEMO = "Clínica Demonstração";

const p2 = n => String(n).padStart(2, "0");
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const soDigitos = s => String(s ?? "").replace(/\D/g, "");
const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slugDe = s => semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const lerLocal = k => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

/* ---------- datas do servidor (sempre no fuso de São Paulo) ---------- */
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const FMT_DDMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const FMT_DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const quando = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
const horaSP = iso => { const d = quando(iso); return d ? FMT_HORA.format(d) : "—"; };
const dataTs = iso => { const d = quando(iso); return d ? FMT_DATA.format(d) : "—"; };
function quandoSP(iso) {
  const d = quando(iso);
  if (!d) return "—";
  const dia = hojeSP(d), hoje = hojeSP();
  const o = meioDia(hoje); o.setDate(o.getDate() - 1);
  const rot = dia === hoje ? "hoje" : dia === isoDe(o) ? "ontem" : `em ${FMT_DDMM.format(d)}`;
  return `${rot} às ${FMT_HORA.format(d)}`;
}
const dataIso = iso => { const [a, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : "—"; };

/* ============================================================
   1. ESTADO
   ============================================================ */
const novoAj = () => ({ carregado: false, integ: null, contas: null, config: null, novoCliente: false, tRecarga: 0 });
const S = {
  aba: "geral", dias: 30, plat: "", sort: { key: "gasto", dir: -1 }, varridoEm: null,
  demo: DEMO, token: null, conta: null, clientes: [], clienteId: null, dados: null, estado: null,
  busca: "", kVer: {}, pedirCodigo: false, aj: novoAj(),
};
let DS = null, M = null;
const gestor = () => !S.demo && !!S.conta && S.conta.papel === "gestor";
const clienteAtual = () => S.clientes.find(c => c.id === S.clienteId) || null;
// plataforma vem do banco e a clínica pode gravar texto livre nela: nunca vai crua para um atributo
const classePlat = p => (p === "meta" || p === "google" ? p : "neutro");
const nomeCliente = () => S.demo ? NOME_DEMO : (clienteAtual() || {}).nome || (DS && DS.nome) || "Nexus Ads";
const semAnuncios = () => !M || !M.LINHAS.length;
const isoI = i => isoDe(M.dataDe(i));
const iDeIso = iso => M.R + Math.round((meioDia(String(iso).slice(0, 10)) - meioDia(isoI(M.R))) / 864e5);
function montarDe(ds) { DS = ds; M = montar(ds); }

const SERV_COR = { "Aparelho invisível": "#2B5A80", "Implante": "#B0761F", "Clareamento": "#C0472F", "Clínica geral": "#6F8FA8", "Limpeza": "#CDBB9B", "Canal / urgência": "#7A5114" };
const COR_EXTRA = ["#3C76A3", "#8E6A3A", "#4E6B5E", "#A0584A", "#5B5F8A", "#9A8F80"];
const corServ = (nome, n) => SERV_COR[nome] || COR_EXTRA[n % COR_EXTRA.length];
const AVC = ["#2B5A80", "#3C76A3", "#7A5114", "#B0761F", "#4E6B5E", "#A0584A", "#132A40"];

const ETAPAS = [
  ["nova", "Nova conversa", "#9FB4C7"],
  ["agendada", "Agendada", "#2B5A80"],
  ["orcamento", "Avaliou · orçamento", "#B0761F"],
  ["fechou", "Fechou", "#2F7D5B"],
  ["nao_fechou", "Não fechou", "#9A8F80"],
  ["faltou", "Faltou", "#C0472F"],
  ["perdida", "Não agendou", "#6F7C86"],
];
const NOME_ETAPA = Object.fromEntries(ETAPAS.map(([k, l]) => [k, l]));
const COM_DATA = new Set(["agendada", "orcamento", "fechou", "nao_fechou", "faltou"]);
const ORIGENS = [
  ["indicacao", "Indicação de alguém"],
  ["organico", "Instagram ou Google, sem anúncio"],
  ["whatsapp", "Chamou direto no WhatsApp"],
  ["site", "Site da clínica"],
  ["manual", "Outro"],
];

/* ============================================================
   2. DESENHO — traço, eixos, sparklines, contagem
   ============================================================ */
/** Traço suave (Catmull-Rom → Bézier). */
function traco(p) {
  if (!p.length) return "";
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}
/** Teto do eixo = 4 degraus "redondos" (1, 2, 2,5, 5 × 10ⁿ): rótulos R$ 10/20/30, nunca R$ 6/13/19. */
const niceMax = v => {
  if (v <= 0) return 4;
  const bruto = v / 4, p = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p * 4;
};
function spark(vals) {
  const v = vals.map(x => (fin(x) ? x : 0)), w = 300, h = 36;
  const mx = Math.max(...v), mn = Math.min(...v), sp = mx - mn || 1;
  const pts = v.map((y, i) => [i / Math.max(1, v.length - 1) * w, h - 3 - (y - mn) / sp * (h - 9)]);
  const d = traco(pts);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d} L${w} ${h} L0 ${h} Z"/><path class="l" pathLength="1" d="${d}"/></svg>`;
}
function contar(root) {
  const els = $$("[data-n]", root).filter(e => fin(+e.dataset.n));
  if (!els.length) return;
  const fim = () => els.forEach(e => { e.textContent = fmtN(+e.dataset.n, e.dataset.f); });
  if (REDUCE) return fim();
  const t0 = performance.now(), D = 950;
  const tick = now => {
    const p = Math.min(1, (now - t0) / D), k = 1 - Math.pow(1 - p, 3);
    els.forEach(e => { e.textContent = fmtN(+e.dataset.n * k, e.dataset.f); });
    if (p < 1) requestAnimationFrame(tick); else fim();
  };
  requestAnimationFrame(tick);
  setTimeout(fim, D + 400);   // rede de segurança se o rAF estiver congelado (aba em segundo plano)
}

/* ---------- estados vazios, avisos ---------- */
function cartaoVazio({ ic = "·", titulo, texto, botoes = "", erro = false }) {
  return `<div class="vazio-card${erro ? " erro" : ""}"><span class="vazio-ic" aria-hidden="true">${ic}</span>` +
    `<div><h2>${titulo}</h2><p>${texto}</p>${botoes ? `<div class="acoes">${botoes}</div>` : ""}</div></div>`;
}
const carregandoHtml = msg => `<p class="carregando"><i aria-hidden="true"></i>${esc(msg)}</p>`;

function htmlSemAnuncios() {
  const ligadas = ((S.dados && S.dados.integracoes) || []).filter(i => i.ativo);
  const btnAj = gestor() ? `<button class="pill pill-ink" type="button" data-ir="ajustes">Abrir Ajustes</button>` : "";
  if (S.demo) return cartaoVazio({ ic: "·", titulo: "Sem números no período", texto: "Escolha outro período." });
  if (ligadas.length) {
    const comErro = ligadas.find(i => /^erro/i.test(i.status || ""));
    if (comErro) return cartaoVazio({
      ic: "!", erro: true, titulo: `A leitura do ${nomePlat(comErro.canal)} deu erro`,
      texto: `${esc(comErro.status)}. ${gestor() ? "Confira as credenciais em Ajustes." : "A Nexus já foi avisada e está vendo isso."}`, botoes: btnAj,
    });
    const nomes = ligadas.map(i => nomePlat(i.canal)).join(" e ");
    return cartaoVazio({
      ic: "⏳", titulo: `${nomes} ${ligadas.length > 1 ? "conectados" : "conectado"} — esperando a primeira leitura`,
      texto: "O servidor lê os anúncios de hora em hora. Os números aparecem aqui sozinhos, sem precisar fazer nada.", botoes: btnAj,
    });
  }
  return gestor()
    ? cartaoVazio({ ic: "🔌", titulo: "Nenhum anúncio conectado ainda", texto: "Conecte o Meta e/ou o Google deste cliente em Ajustes. A primeira leitura chega em até 1 hora.",
        botoes: `<button class="pill pill-ink" type="button" data-ir="ajustes">Conectar em Ajustes</button>` })
    : cartaoVazio({ ic: "📣", titulo: "Os anúncios ainda não começaram", texto: "Os números aparecem aqui assim que os anúncios começarem a rodar. Enquanto isso, a aba Pacientes já funciona: dá para registrar cada paciente que chegar.",
        botoes: `<button class="pill pill-ink" type="button" data-ir="pacientes">Ir para Pacientes</button>` });
}

function toast(msg, tipo = "ok") {
  const t = $("#toast");
  clearTimeout(t._t); clearTimeout(t._t2);
  t.className = "toast" + (tipo === "erro" ? " erro" : "");
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("on"));
  t._t = setTimeout(() => { t.classList.remove("on"); t._t2 = setTimeout(() => { t.textContent = ""; }, 400); }, tipo === "erro" ? 6000 : 3600);
}
function ocupado(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
}
function avisoForm(el, msg, erro) {
  if (!el) return;
  el.textContent = msg;
  el.className = "aj-st " + (erro ? "erro" : "ok");
}
async function copiar(txt, btn) {
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: txt });
    ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch { /* sem área de transferência */ }
    ta.remove();
  }
  if (!btn) return;
  if (!btn.dataset.rotulo) btn.dataset.rotulo = btn.textContent;
  btn.textContent = "Copiado ✓";
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.rotulo; }, 1600);
}

/* ============================================================
   3. VISÃO GERAL
   ============================================================ */
const janela = () => { const de = M.R - S.dias + 1; return { de, ate: M.R, deA: de - S.dias, ateA: de - 1 }; };
const campanhas = () => Object.values(M.CAMP).filter(c => c.plat && (!S.plat || c.plat === S.plat));

function renderGeral() {
  const vazio = semAnuncios();
  $("#vazio-geral").hidden = !vazio;
  $("#corpo-geral").hidden = vazio;
  if (vazio) { $("#vazio-geral").innerHTML = htmlSemAnuncios(); return; }

  const { de, ate, deA, ateA } = janela(), f = { plat: S.plat };
  const t = M.consolidar(M.linhasDe(de, ate, f)), ta = M.consolidar(M.linhasDe(deA, ateA, f));
  const c = M.crmTot(de, ate, f), ca = M.crmTot(deA, ateA, f);
  const roas = t.gasto ? c.receita / t.gasto : null;
  const CFG = M.CFG;

  // herói — a frase que a doutora lê em 3 segundos
  $("#hero-periodo").textContent = `Últimos ${S.dias} dias${S.plat ? " · só " + nomePlat(S.plat) : ""}`;
  $("#hero-frase").innerHTML =
    `Os anúncios trouxeram <b data-n="${c.conversas}" data-f="int">${int(c.conversas)}</b> ${c.conversas === 1 ? "conversa" : "conversas"} no WhatsApp, ` +
    `<b data-n="${c.agendadas}" data-f="int">${int(c.agendadas)}</b> ${c.agendadas === 1 ? "avaliação agendada" : "avaliações agendadas"} e ` +
    `<b data-n="${c.fecharam}" data-f="int">${int(c.fecharam)}</b> <em>${c.fecharam === 1 ? "paciente novo" : "pacientes novos"}</em>.`;

  const meta = CFG.cpaAlvo, cpa = t.cpa, dentro = fin(cpa) && cpa <= meta;
  const dif = fin(cpa) ? Math.abs(cpa - meta) / meta * 100 : null;
  const custoTotal = t.gasto + (S.plat ? 0 : (CFG.fee || 0) * S.dias / 30);
  const retorno = S.plat ? roas : (custoTotal ? c.receita / custoTotal : null);
  $("#hero-side").innerHTML = `
    <p class="hs-l">Custo por conversa</p>
    <p class="hs-big"><span ${fin(cpa) ? `data-n="${cpa}" data-f="brl"` : ""}>${brl(cpa)}</span><small>meta ${brl(meta)}</small></p>
    <div class="meter" style="--w:${fin(cpa) ? Math.min(cpa / (meta * 2), 1) * 100 : 0}%;--m:50%"><i></i><b title="meta"></b></div>
    <p class="hs-note">${!fin(cpa) ? "Sem conversas no período." : dentro
      ? `Dentro da meta — <strong>${pc(dif, 0)} abaixo</strong> do limite.`
      : `<strong>${pc(dif, 0)} acima</strong> da meta — o radar já está de olho.`}</p>
    <div class="hs-roi">
      <div><span class="hs-l">Tratamentos fechados</span><b data-n="${c.receita}" data-f="brl0">${brl0(c.receita)}</b></div>
      <div><span class="hs-l">${S.plat ? "Retorno sobre anúncios" : "Retorno total"}</span><b ${fin(retorno) ? `data-n="${retorno}" data-f="x"` : ""}>${fin(retorno) ? dec(retorno, 1) + "x" : "—"}</b></div>
    </div>
    <p class="hs-note" style="font-size:.74rem">${S.plat ? "Tratamentos ÷ investimento em anúncios." : "Tratamentos ÷ (anúncios + gestão). Estimativa pelo valor de cada tratamento."}</p>`;

  // KPIs com variação contra o período anterior de mesmo tamanho
  const sd = M.porDia(S.plat), idx = Array.from({ length: S.dias }, (_, n) => de + n);
  const K = [
    { l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: "brl0", s: "neutro", sp: idx.map(i => sd.meta[i] + sd.google[i]) },
    { l: "Conversas no WhatsApp", v: c.conversas, a: ca.conversas, f: "int", s: "cima", sp: idx.map(i => M.media7(sd.conv, i)) },
    { l: "Custo por conversa", v: t.cpa, a: ta.cpa, f: "brl", s: "baixo",
      extra: fin(t.cpa) ? (t.cpa <= meta ? `dentro da meta de ${brl(meta)}` : `acima da meta de ${brl(meta)}`) : `meta ${brl(meta)}`,
      sp: idx.map(i => { const g = M.soma7(sd.meta, i) + M.soma7(sd.google, i), n = M.soma7(sd.conv, i); return n ? g / n : null; }) },
    { l: "Avaliações agendadas", v: c.agendadas, a: ca.agendadas, f: "int", s: "cima", sp: idx.map(i => M.media7(sd.ag, i)) },
    { l: "Pacientes novos", v: c.fecharam, a: ca.fecharam, f: "int", s: "cima", sp: idx.map(i => M.media7(sd.fe, i)) },
    { l: "Tratamentos fechados", v: c.receita, a: ca.receita, f: "brl0", s: "cima",
      extra: fin(roas) ? `${dec(roas, 1)}x o investido em anúncios` : "", sp: idx.reduce((acc, i) => (acc.push((acc[acc.length - 1] || 0) + sd.rec[i]), acc), []) },
  ];
  const chipVar = k => {
    const v = variacao(k.v, k.a);
    if (v == null) return `<span class="var var-neutro">sem base</span>`;
    const bom = k.s === "cima" ? v >= 0 : k.s === "baixo" ? v <= 0 : null;
    const cls = bom == null || Math.abs(v) < 1 ? "var-neutro" : bom ? "var-bom" : "var-ruim";
    return `<span class="var ${cls}">${v >= 0 ? "▲" : "▼"} ${pc(Math.abs(v), 0)}</span>`;
  };
  $("#kpis").innerHTML = K.map(k => `
    <div class="kpi">
      <span class="kpi-l">${k.l}</span>
      <span class="kpi-v" ${fin(k.v) ? `data-n="${k.v}" data-f="${k.f}"` : ""}>${fmtN(k.v, k.f)}</span>
      <span class="kpi-row">${chipVar(k)}<span class="kpi-ctx">vs. ${S.dias} dias antes</span></span>
      ${k.extra ? `<span class="kpi-extra">${k.extra}</span>` : ""}
      ${spark(k.sp)}
    </div>`).join("");

  desenharChart(true);
  renderFunil(t, c);
  renderMeses();
  renderLeitura(t, ta, c);
  renderRitmo();
}

function serieDia(de, ate, plat) {
  const sd = M.porDia(plat), out = [];
  for (let i = de; i <= ate; i++) out.push({ i, meta: sd.meta[i], google: sd.google[i], conv: sd.conv[i], convMedia: M.media7(sd.conv, i) });
  return out;
}

function desenharChart(animar) {
  const el = $("#chart-dia");
  if (!M || semAnuncios()) return;
  // sem largura ainda (primeiro paint, aba oculta): o ResizeObserver redesenha quando houver
  if (!el.clientWidth) { el._pendente = true; return; }
  el._pendente = false;
  el._w = el.clientWidth;
  const { de, ate } = janela(), serie = serieDia(de, ate, S.plat);
  const W = Math.max(300, Math.round(el.clientWidth)), H = W < 560 ? 230 : 280;
  const P = { l: W < 560 ? 46 : 56, r: 28, t: 14, b: 30 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxG = niceMax(Math.max(1, ...serie.map(d => d.meta + d.google)));
  const maxC = Math.max(4, Math.ceil(Math.max(...serie.map(d => d.convMedia)) * 1.1 / 4) * 4);
  const bw = iw / serie.length, base = P.t + ih;
  const y = v => base - v / maxG * ih, yc = v => base - v / maxC * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por plataforma e conversas no WhatsApp nos últimos ${S.dias} dias">`;
  for (let k = 0; k <= 4; k++) {
    const yy = y(maxG * k / 4);
    s += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    s += `<text x="${P.l - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${brl0(maxG * k / 4)}</text>`;
    s += `<text x="${W - P.r + 7}" y="${(yy + 3).toFixed(1)}">${maxC * k / 4}</text>`;
  }
  s += `<g class="bars">`;
  serie.forEach((d, n) => {
    const x = P.l + n * bw + bw * .17, w = Math.max(1.5, bw * .66), rx = Math.min(3, w / 2), dl = Math.round(n / serie.length * 650);
    if (d.meta > 0) s += `<rect class="bm" x="${x.toFixed(1)}" y="${y(d.meta).toFixed(1)}" width="${w.toFixed(1)}" height="${(base - y(d.meta)).toFixed(1)}" rx="${rx}" style="--d:${dl}ms"/>`;
    if (d.google > 0) s += `<rect class="bg" x="${x.toFixed(1)}" y="${y(d.meta + d.google).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(d.meta) - y(d.meta + d.google)).toFixed(1)}" rx="${rx}" style="--d:${dl + 60}ms"/>`;
  });
  s += `</g>`;
  const pts = serie.map((d, n) => [P.l + n * bw + bw / 2, yc(d.convMedia)]);
  const dl = traco(pts);
  s += `<path class="area" d="${dl} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z"/>`;
  s += `<path class="lin" pathLength="1" d="${dl}"/>`;
  const passo = Math.ceil(serie.length / (W < 560 ? 4 : 7));
  serie.forEach((d, n) => { if (n % passo === 0) s += `<text x="${(P.l + n * bw + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle">${M.ddmm(d.i)}</text>`; });
  s += `<line class="cross" x1="0" x2="0" y1="${P.t}" y2="${base}"/><circle class="cross-dot" r="4.5" cx="0" cy="0"/></svg>`;
  if (el._esconder) el._esconder();   // redesenho não pode herdar a mira/tooltip do dia antigo
  el.innerHTML = s;
  el._d = { serie, P, bw, W, yc };
  if (animar && !REDUCE) {
    el.classList.remove("anim"); void el.offsetWidth; el.classList.add("anim");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("anim"), 2600);
  }
}

function ligarChart() {
  const el = $("#chart-dia"), tip = $("#tip");
  const esconder = () => { el.classList.remove("hover"); tip.hidden = true; };
  const mostrar = e => {
    const d = el._d, svg = el.querySelector("svg");
    if (!d || !svg || !M) return;
    const r = svg.getBoundingClientRect(), k = r.width / d.W;
    const n = Math.floor(((e.clientX - r.left) / k - d.P.l) / d.bw);
    if (n < 0 || n >= d.serie.length) return esconder();
    const p = d.serie[n], cx = d.P.l + n * d.bw + d.bw / 2, cy = d.yc(p.convMedia);
    const cross = svg.querySelector(".cross"), dot = svg.querySelector(".cross-dot");
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    el.classList.add("hover");
    const dt = M.dataDe(p.i);
    tip.innerHTML = `<b>${SEMANA[dt.getDay()]} · ${M.ddmm(p.i)}</b>` +
      `<span>Meta <i>${brl(p.meta)}</i></span><span>Google <i>${brl(p.google)}</i></span>` +
      `<span>Conversas <i>${int(p.conv)}</i></span>`;   // Google manda conversão fracionada (1.5)
    tip.hidden = false;
    tip.style.left = Math.min(innerWidth - 100, Math.max(100, r.left + cx * k)) + "px";
    // o tooltip abre PARA CIMA: garante altura real + folga, senão a data some no topo
    tip.style.top = Math.max(tip.offsetHeight + 22, r.top + d.P.t * k) + "px";
  };
  el._esconder = esconder;
  el.addEventListener("pointermove", mostrar);
  el.addEventListener("pointerdown", mostrar);
  el.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") esconder(); });
  document.addEventListener("pointerdown", e => { if (!el.contains(e.target)) esconder(); });
  addEventListener("scroll", esconder, { passive: true });
}

function renderFunil(t, c) {
  const E = [
    { l: "Anúncio exibido", s: "vezes na tela", v: t.impressoes },
    { l: "Cliques", s: "no anúncio", v: t.cliques, r: t.ctr, rl: "CTR (Meta e Google juntos)" },
    { l: "Conversas", s: "no WhatsApp", v: c.conversas, r: razao(c.conversas, t.cliques), rl: "dos cliques" },
    { l: "Agendaram", s: "avaliação", v: c.agendadas, r: razao(c.agendadas, c.conversas), rl: "das conversas", faixa: [30, 50] },
    { l: "Compareceram", s: "à consulta", v: c.compareceram, r: razao(c.compareceram, c.agendadas), rl: "dos agendados", faixa: [60, 80] },
    { l: "Fecharam", s: "tratamento", v: c.fecharam, r: razao(c.fecharam, c.compareceram), rl: "de quem veio", faixa: [30, 50] },
  ];
  const mx = Math.log10(Math.max(...E.map(e => e.v)) + 1) || 1;
  $("#funil").innerHTML = E.map((e, n) => {
    const w = Math.max(7, Math.log10(e.v + 1) / mx * 100), fora = w < 24;
    const r = fin(e.r) ? Math.min(e.r, 100) : null;
    let st = "";
    if (e.faixa && r != null) {
      const fx = `${e.faixa[0]}–${e.faixa[1]}%`;
      st = r > e.faixa[1] ? `<span class="st st-ok">acima da meta (${fx})</span>`
        : r >= e.faixa[0] ? `<span class="st st-ok">na meta (${fx})</span>`
        : `<span class="st st-warn">abaixo da meta (${fx})</span>`;
    }
    return `<div class="fun-row">
        <span class="fun-l">${e.l}<small>${e.s}</small></span>
        <div class="fun-bar"><div class="fun-fill${fora ? " out" : ""}" style="--w:${w.toFixed(1)}%;--i:${n}"><span>${int(e.v)}</span></div></div>
        ${r != null ? `<p class="fun-rate">${pc(r, r < 10 ? 1 : 0)} ${e.rl} ${st}</p>` : ""}
      </div>`;
  }).join("");
}

function renderMeses() {
  const lista = M.mesesDados().filter(m => m.ate - m.de >= 9 || m.ate === M.R).slice(-5);
  const dados = lista.map(m => ({
    m, t: M.consolidar(M.linhasDe(m.de, m.ate, { plat: S.plat })), c: M.crmTot(m.de, m.ate, { plat: S.plat }), parcial: !m.completo,
  }));
  const mx = Math.max(1, ...dados.map(d => d.c.fecharam));
  $("#mes-a-mes").innerHTML = dados.map((d, n) => `
    <div class="mam-col${d.parcial ? " parcial" : ""}">
      <div class="mam-bar-box"><div class="mam-bar" style="--h:${Math.max(6, d.c.fecharam / mx * 86)}%;--i:${n}"><b>${d.c.fecharam}</b></div></div>
      <span class="mam-m">${MES3[d.m.mes]}${d.parcial ? " · parcial" : ""}</span>
      <span class="mam-s">${plural(d.t.conversoes, "conversa", "conversas")}<br>${brl(d.t.cpa)} cada</span>
    </div>`).join("");
}

function linhasCamp() {
  const { de, ate } = janela();
  return campanhas().map(c => {
    const t = M.consolidar(M.linhasDe(de, ate, { camp: c.id }));
    if (!t.gasto) return null;
    const k = M.crmTot(de, ate, { camp: c.id });
    return {
      c, t, k,
      cpp: k.fecharam ? t.gasto / k.fecharam : null,       // custo por paciente
      cpag: k.agendadas ? t.gasto / k.agendadas : null,    // custo por avaliação agendada
      roas: t.gasto ? k.receita / t.gasto : null,
    };
  }).filter(Boolean);
}

function renderLeitura(t, ta, c) {
  const out = [], meta = M.CFG.cpaAlvo;
  if (fin(t.cpa)) {
    const v = variacao(t.cpa, ta.cpa);
    const vt = v == null ? "" : ` (${v <= 0 ? "caiu" : "subiu"} ${pc(Math.abs(v), 0)} em relação aos ${S.dias} dias anteriores)`;
    out.push(t.cpa <= meta
      ? { k: "bom", i: "✓", h: `Custo por conversa de <b>${brl(t.cpa)}</b>, dentro da meta de ${brl(meta)}${vt}.` }
      : { k: "aten", i: "!", h: `Custo por conversa em <b>${brl(t.cpa)}</b>, acima da meta de ${brl(meta)}${vt}.` });
  }
  // campanha com alerta ativo não pode ser elogiada nem receber verba
  const comAlerta = new Set(M.avaliar(M.R).filter(a => a.regra.nivel === "campanha").map(a => a.chave.split("|")[1]));
  const rows = linhasCamp().filter(r => r.t.gasto >= 40);
  const efic = rows.filter(r => r.k.fecharam > 0 && !comAlerta.has(r.c.id)).sort((a, b) => a.cpp - b.cpp)[0];
  if (efic) out.push({ k: "bom", i: "★", h: `<b>${esc(efic.c.nome)}</b> é a campanha mais eficiente: cada paciente novo custou ${brl0(efic.cpp)} em anúncio.` });
  const serv = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v)[0];
  if (serv && c.receita) out.push({ k: "bom", i: "+", h: `<b>${esc(serv[0])}</b> trouxe ${pc(serv[1].v / c.receita * 100, 0)} do valor em tratamentos fechados (${serv[1].n} de ${c.fecharam} ${c.fecharam === 1 ? "paciente" : "pacientes"}).` });
  const al = M.avaliar(M.R, true)[0];
  if (al) out.push({ k: "aten", i: "!", h: `Radar: ${esc(al.msg)}` });
  // Meta × Google: a conversa do Google costuma custar mais, mas chega mais decidida.
  if (!S.plat) {
    const { de } = janela();
    const pm = M.crmTot(de, M.R, { plat: "meta" }), pg = M.crmTot(de, M.R, { plat: "google" });
    if (pm.conversas >= 10 && pg.conversas >= 10) {
      const tm = razao(pm.agendadas, pm.conversas), tg = razao(pg.agendadas, pg.conversas);
      const cm = M.consolidar(M.linhasDe(de, M.R, { plat: "meta" })).cpa, cg = M.consolidar(M.linhasDe(de, M.R, { plat: "google" })).cpa;
      const [a, b, ta2, tb, ca2, cb] = tg >= tm ? ["Google", "Instagram/Facebook", tg, tm, cg, cm] : ["Instagram/Facebook", "Google", tm, tg, cm, cg];
      out.push({ k: "acao", i: "→", h: `No <b>${a}</b>, ${pc(ta2, 0)} das conversas viram avaliação (contra ${pc(tb, 0)} no ${b}). ${ca2 > cb ? `A conversa custa mais (${brl(ca2)} × ${brl(cb)}), mas chega mais decidida.` : "E ainda sai mais barata."}` });
    }
  }
  $("#leitura").innerHTML = out.slice(0, 5).map(x => `<li class="${x.k}"><i aria-hidden="true">${x.i}</i><span>${x.h}</span></li>`).join("")
    || `<li><i aria-hidden="true">·</i><span>Sem dados suficientes no período.</span></li>`;
}

function renderRitmo() {
  const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, m.proj, 1) * 1.08;
  $("#ritmo-sub").textContent = `${MESES[m.mes]} · dia ${m.pass} de ${m.diasMes} · todas as plataformas`;
  const w = m.gasto / escala * 100, wp = m.proj / escala * 100, mo = orc / escala * 100;
  const acima = m.proj > orc * 1.02, noLimite = !acima && m.proj >= orc * .98;
  const msg = m.restam === 0 ? `Mês fechado em ${brl0(m.gasto)}.`
    : acima ? `No ritmo atual o mês fecha ${brl0(m.proj - orc)} acima do orçamento. O radar já sugeriu segurar ${brl((m.proj - orc) / m.restam)} por dia.`
    : noLimite ? `No limite: o mês deve fechar em ${brl0(m.proj)}, praticamente no orçamento.`
    : `Dentro do orçamento: o mês deve fechar em ${brl0(m.proj)} (sobram ${brl0(orc - m.proj)}).`;
  $("#ritmo").innerHTML = `
    <div class="ritmo-num"><strong data-n="${m.gasto}" data-f="brl0">${brl0(m.gasto)}</strong><span>investidos de ${brl0(orc)}</span></div>
    <div class="pbar" style="--w:${w.toFixed(1)}%;--w0:${w.toFixed(1)}%;--w1:${Math.max(0, wp - w).toFixed(1)}%;--m:${mo.toFixed(1)}%"><i></i><u></u><b title="orçamento"></b></div>
    <div class="ritmo-leg"><span>gasto até ontem</span><span>projeção ${brl0(m.proj)}</span><span>▮ orçamento</span></div>
    <p class="ritmo-msg${acima ? " aten" : ""}">${msg}</p>`;
}

/* ============================================================
   4. CAMPANHAS
   ============================================================ */
const COLS_CAMP = [
  ["nome", "Campanha"], ["gasto", "Investido"], ["conv", "Conversas"], ["cpa", "Custo/conversa"], ["ctr", "CTR"],
  ["ag", "Agendadas"], ["fe", "Pacientes"], ["rec", "Tratamentos"], ["roas", "Retorno"],
];
const VAL_CAMP = {
  nome: r => r.c.nome, gasto: r => r.t.gasto, conv: r => r.t.conversoes, cpa: r => r.t.cpa, ctr: r => r.t.ctr,
  ag: r => r.k.agendadas, fe: r => r.k.fecharam, rec: r => r.k.receita, roas: r => r.roas,
};
const pontoCpa = cpa => !fin(cpa) ? "dot-bad" : cpa <= M.CFG.cpaAlvo ? "dot-ok" : cpa <= M.CFG.cpaAlvo * 1.35 ? "dot-warn" : "dot-bad";

function renderCampanhas() {
  const vazio = semAnuncios();
  $("#vazio-campanhas").hidden = !vazio;
  $("#corpo-campanhas").hidden = vazio;
  if (vazio) { $("#vazio-campanhas").innerHTML = htmlSemAnuncios(); return; }

  const rows = linhasCamp(), { key, dir } = S.sort, fv = VAL_CAMP[key], { de } = janela();
  rows.sort((a, b) => {
    const x = fv(a), y = fv(b);
    if (typeof x === "string") return x.localeCompare(y, "pt-BR") * dir;
    return ((fin(x) ? x : -Infinity) - (fin(y) ? y : -Infinity)) * dir;
  });
  const T = M.consolidar(rows.flatMap(r => M.linhasDe(de, M.R, { camp: r.c.id })));
  const K = rows.reduce((a, r) => ({ ag: a.ag + r.k.agendadas, fe: a.fe + r.k.fecharam, rec: a.rec + r.k.receita }), { ag: 0, fe: 0, rec: 0 });
  const th = COLS_CAMP.map(([k, l]) => `<th scope="col"><button type="button" data-sort="${k}"${k === key ? ` aria-sort="${dir < 0 ? "descending" : "ascending"}"` : ""}>${l}</button></th>`).join("");
  $("#tbl-campanhas").innerHTML = rows.length ? `<table>
    <caption class="sr-only">Campanhas nos últimos ${S.dias} dias</caption>
    <thead><tr>${th}</tr></thead>
    <tbody>${rows.map((r, n) => `<tr style="--i:${n}">
      <td><div class="nm"><span class="dot ${pontoCpa(r.t.cpa)}" title="custo por conversa vs. meta"></span><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span></small></div></div></td>
      <td>${brl0(r.t.gasto)}</td><td>${int(r.t.conversoes)}</td><td>${brl(r.t.cpa)}</td><td>${pc(r.t.ctr, 2)}</td>
      <td>${r.k.agendadas}</td><td>${r.k.fecharam}</td><td>${brl0(r.k.receita)}</td><td>${fin(r.roas) ? dec(r.roas, 1) + "x" : "—"}</td>
    </tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td>${brl0(T.gasto)}</td><td>${int(T.conversoes)}</td><td>${brl(T.cpa)}</td><td>${pc(T.ctr, 2)}</td>
      <td>${K.ag}</td><td>${K.fe}</td><td>${brl0(K.rec)}</td><td>${T.gasto ? dec(K.rec / T.gasto, 1) + "x" : "—"}</td></tr></tfoot>
  </table>` : `<p class="vazio">Nenhuma campanha com investimento nos últimos ${S.dias} dias${S.plat ? " no " + nomePlat(S.plat) : ""}.</p>`;

  // a situação vem do radar (janela recente), não da média do período — senão a
  // tabela diria "ok" para o criativo que o radar acabou de acusar
  const agora = M.avaliar(M.R), sitDe = id => agora.filter(a => a.chave === `r4|${id}` || a.chave === `r3|${id}`);
  const cris = Object.values(M.CRI).filter(k => k.plat && (!S.plat || k.plat === S.plat)).map(k => ({ k, t: M.consolidar(M.linhasDe(de, M.R, { cri: k.id })) }))
    .filter(x => x.t.gasto > 0).sort((a, b) => b.t.gasto - a.t.gasto);
  $("#tbl-criativos").innerHTML = cris.length ? `<table>
    <caption class="sr-only">Criativos nos últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Criativo</th><th scope="col">Investido</th><th scope="col">Impressões</th><th scope="col">CTR</th><th scope="col">Frequência</th><th scope="col">Conversas</th><th scope="col">Custo/conversa</th><th scope="col">Situação agora</th></tr></thead>
    <tbody>${cris.map(({ k, t }, n) => {
      const s = sitDe(k.id), a4 = s.find(a => a.regra.id === "r4"), a3 = s.find(a => a.regra.id === "r3");
      const sit = (a4 ? `<span class="chip chip-bad" title="frequência nos últimos ${a4.regra.janela} dias">fadiga · ${dec(a4.valor, 1)} em ${a4.regra.janela}d</span> ` : "")
        + (a3 ? `<span class="chip chip-warn" title="CTR nos últimos ${a3.regra.janela} dias">CTR ${pc(a3.valor, 2)} em ${a3.regra.janela}d</span>` : "")
        || `<span class="chip chip-ok">ok</span>`;
      const fq = fin(t.freq)
        ? `<span class="fq"><span class="fq-bar${a4 ? " alto" : ""}"><i style="--w:${Math.min(100, t.freq / 4 * 100)}%"></i><b></b></span>${dec(t.freq, 1)}</span>`
        : "—";
      const camp = M.CAMP[k.camp];
      return `<tr style="--i:${n}">
        <td><div class="nm-t"><span>${esc(k.nome)}</span><small>${esc(camp ? camp.curto : "")} · <span class="chip chip-${classePlat(k.plat)}">${nomePlat(k.plat)}</span></small></div></td>
        <td>${brl0(t.gasto)}</td><td>${int(t.impressoes)}</td><td>${pc(t.ctr, 2)}</td><td>${fq}</td><td>${int(t.conversoes)}</td><td>${brl(t.cpa)}</td><td>${sit}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhum criativo com investimento no período.</p>`;
}

/* ============================================================
   5. PACIENTES — kanban, tabela de origem, donut, gaveta
   ============================================================ */
const COLS_K = [
  ["nova", "Nova conversa", "#9FB4C7"],
  ["agendada", "Avaliação agendada", "#2B5A80"],
  ["orcamento", "Avaliou · orçamento", "#B0761F"],
  ["fechou", "Fechou (30 dias)", "#2F7D5B"],
  ["parou", "Não seguiu (30 dias)", "#9A8F80"],
];
const K_MAX = 8, K_PASSO = 24;
const refParou = L => L.iConsulta ?? L.iAgenda ?? L.i;

function colunaDe(L) {
  const e = M.etapa(L), R = M.R;
  if (e === "fechou") return (L.iConsulta ?? L.i) >= R - 29 ? "fechou" : null;
  if (e === "faltou" || e === "nao_fechou" || e === "perdida") return refParou(L) >= R - 29 ? "parou" : null;
  return e;
}

function quandoLead(L, e) {
  const R = M.R, dd = i => M.ddmm(i);
  if (e === "nova") { const d = R - L.i + 1; return { txt: d <= 0 ? "chamou hoje" : d === 1 ? "chamou ontem" : `chamou há ${d} dias` }; }
  if (e === "agendada") {
    if (L.iConsulta == null || (!S.demo && !(L.bruto && L.bruto.data_consulta))) return { txt: "sem data da consulta", atraso: true };
    const d = L.iConsulta - R;
    if (d <= 0) return { txt: `consulta era em ${dd(L.iConsulta)} — atualizar`, atraso: true };
    return { txt: d === 1 ? "consulta hoje" : d === 2 ? "consulta amanhã" : `consulta em ${dd(L.iConsulta)}` };
  }
  if (e === "orcamento") return { txt: L.iConsulta != null ? `avaliou em ${dd(L.iConsulta)} · orçamento enviado` : "orçamento enviado" };
  if (e === "fechou") return { txt: L.iConsulta != null ? `fechou em ${dd(L.iConsulta)}` : "fechou" };
  if (e === "faltou") return { txt: L.iConsulta != null ? `faltou em ${dd(L.iConsulta)}` : "faltou à consulta" };
  if (e === "nao_fechou") return { txt: "avaliou e não fechou" };
  return { txt: `chamou em ${dd(L.i)} · não agendou` };
}

function cardLead(L, col, n) {
  const e = M.etapa(L);
  const ini = String(L.nome).split(/\s+/).map(p => p[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  const q = quandoLead(L, e), camp = M.CAMP[L.camp];
  const origem = L.plat
    ? `<span class="chip chip-${classePlat(L.plat)}">${nomePlat(L.plat)}</span><span class="chip chip-neutro">${esc(camp ? camp.curto : "")}</span>`
    : `<span class="chip chip-neutro">${esc(camp ? camp.curto : "Sem anúncio")}</span>`;
  const etq = col === "parou" ? `<span class="chip ${e === "faltou" ? "chip-bad" : "chip-neutro"}">${NOME_ETAPA[e] || e}</span>` : "";
  return `<button type="button" class="lead" data-lead="${esc(String(L.id))}" style="--i:${n}" aria-haspopup="dialog">
    <span class="av" style="--c:${AVC[hash(L.nome) % AVC.length]}" aria-hidden="true">${esc(ini)}</span>
    <span><strong>${esc(L.nome)}</strong><span class="lp${q.atraso ? " atrasada" : ""}">${esc(L.servico)} · ${esc(q.txt)}</span>
      <span class="chips">${etq}${origem}${e === "fechou" ? `<span class="val">${brl0(M.valorLead(L))}</span>` : ""}</span></span></button>`;
}

function renderKanban() {
  const g = Object.fromEntries(COLS_K.map(([k]) => [k, []]));
  const q = semAcento(S.busca.trim()), qd = soDigitos(S.busca);
  for (const L of M.LEADS) {
    if (S.plat && L.plat !== S.plat) continue;
    if (q && !(semAcento(L.nome).includes(q) || (qd.length >= 3 && soDigitos(L.telefone).includes(qd)))) continue;
    const col = colunaDe(L);
    if (col && g[col]) g[col].push(L);
  }
  const ord = v => (v == null ? Infinity : v);
  g.nova.sort((a, b) => b.i - a.i);
  g.agendada.sort((a, b) => ord(a.iConsulta) - ord(b.iConsulta));
  g.orcamento.sort((a, b) => (b.iConsulta ?? b.i) - (a.iConsulta ?? a.i));
  g.fechou.sort((a, b) => (b.iConsulta ?? b.i) - (a.iConsulta ?? a.i));
  g.parou.sort((a, b) => refParou(b) - refParou(a));
  let n = 0;
  $("#kanban").innerHTML = COLS_K.map(([k, l, cor]) => {
    const tot = g[k].length, ver = Math.min(tot, S.kVer[k] || K_MAX), resto = tot - ver;
    return `<section class="kcol" aria-label="${l}: ${tot} ${tot === 1 ? "paciente" : "pacientes"}">
      <header class="kcol-h"><span><i class="kd" style="background:${cor}"></i>${l}</span><b>${tot}</b></header>
      ${g[k].slice(0, ver).map(L => cardLead(L, k, n++)).join("")}
      ${resto > 0 ? `<button type="button" class="kmore" data-kmais="${k}">Mostrar mais ${Math.min(resto, K_PASSO)} de ${resto}</button>` : ""}
      ${!tot ? `<p class="kmore">${q ? "nenhum encontrado" : "nenhum no momento"}</p>` : ""}
    </section>`;
  }).join("");
}

function renderPacientes() {
  renderKanban();

  // anúncio × consultório (+ quem chegou sem anúncio, para o dono ver o todo)
  const { de } = janela(), rows = linhasCamp().sort((a, b) => b.k.receita - a.k.receita);
  const orgs = S.plat ? [] : Object.values(M.CAMP).filter(c => !c.plat)
    .map(c => ({ c, k: M.crmTot(de, M.R, { camp: c.id, organicos: true }) }))
    .filter(x => x.k.conversas || x.k.agendadas || x.k.fecharam);
  $("#tbl-origem").innerHTML = rows.length || orgs.length ? `<table>
    <caption class="sr-only">Resultado de cada campanha no consultório, últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Origem</th><th scope="col">Conversas</th><th scope="col">Agendaram</th><th scope="col">Vieram</th><th scope="col">Pacientes</th><th scope="col">Tratamentos</th><th scope="col">Custo/paciente</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="--i:${i}">
      <td><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span></small></div></td>
      <td>${r.k.conversas}</td><td>${r.k.agendadas}</td><td>${r.k.compareceram}</td><td>${r.k.fecharam}</td><td>${brl0(r.k.receita)}</td><td>${brl0(r.cpp)}</td>
    </tr>`).join("")}${orgs.map(({ c, k }, i) => `<tr class="org" style="--i:${rows.length + i}">
      <td><div class="nm-t"><span>${esc(c.nome)}</span><small><span class="chip chip-neutro">sem anúncio</span></small></div></td>
      <td>${k.conversas}</td><td>${k.agendadas}</td><td>${k.compareceram}</td><td>${k.fecharam}</td><td>${brl0(k.receita)}</td><td>—</td>
    </tr>`).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhuma conversa registrada nos últimos ${S.dias} dias.</p>`;

  // tratamentos fechados (donut)
  const c = M.crmTot(de, M.R, { plat: S.plat });
  const segs = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v).map(([nome, s], n) => ({ nome, ...s, cor: corServ(nome, n) }));
  $("#donut-sub").textContent = `Pacientes dos anúncios, últimos ${S.dias} dias · estimativa pelo valor de cada tratamento.`;
  if (!c.receita) { $("#donut").innerHTML = `<p class="vazio">Nenhum tratamento fechado no período.</p>`; return; }
  let acc = 0;
  const arcs = segs.map(s => {
    const p = s.v / c.receita * 100, gap = segs.length > 1 ? .8 : 0;
    const d = `<circle class="seg-c" cx="21" cy="21" r="15.915" stroke="${s.cor}" stroke-dasharray="${Math.max(.1, p - gap).toFixed(2)} ${(100 - p + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
    acc += p; return d;
  }).join("");
  $("#donut").innerHTML = `
    <div class="donut"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.915" stroke="var(--paper-2)"/>${arcs}</svg>
      <div class="ctr"><b data-n="${c.receita}" data-f="brl0">${brl0(c.receita)}</b><small>${c.fecharam} ${c.fecharam === 1 ? "paciente" : "pacientes"}</small></div></div>
    <ul class="dleg">${segs.map(s => `<li><i style="background:${s.cor}"></i>${esc(s.nome)} <span>${s.n} · ${brl0(s.v)}</span></li>`).join("")}</ul>`;
}

/* ---------- gaveta do paciente ---------- */
const gv = { lead: null, volta: null };
const gvEtapa = () => { const r = $('input[name="lf-etapa"]:checked'); return r ? r.value : "nova"; };
const hojeDados = () => (S.dados && S.dados.hoje) || hojeSP();

function opcoesOrigem() {
  const camps = Object.values(M.CAMP).filter(c => c.plat).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return `<optgroup label="Sem anúncio">${ORIGENS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</optgroup>` +
    (camps.length ? `<optgroup label="Veio de um anúncio">${camps.map(c => `<option value="camp:${esc(c.id)}">${esc(c.nome)} (${nomePlat(c.plat)})</option>`).join("")}</optgroup>` : "");
}

function gvAtualizar() {
  const e = gvEtapa();
  $("#lf-box-consulta").hidden = !COM_DATA.has(e);
  $("#lf-consulta-l").textContent = e === "agendada" ? "Quando é a consulta?" : e === "faltou" ? "Dia da consulta que faltou" : "Dia da consulta";
  $("#lf-box-valor").hidden = e !== "fechou";
  const v = $("#lf-valor"), sug = M.CFG.ticket[$("#lf-servico").value];
  $("#lf-valor-dica").textContent = sug ? `Sugestão pelo tratamento: ${brl0(sug)}. Ajuste para o valor combinado.` : "Informe o valor combinado com o paciente.";
  // sugestão só entra se o campo estiver vazio ou ainda com a sugestão anterior
  if (e === "fechou" && sug && (!v.value || v.value === v.dataset.sug)) v.value = sug;
  v.dataset.sug = sug ? String(sug) : "";
}

function abrirGaveta(L) {
  if (!M) return;
  tourFim();
  gv.lead = L || null;
  gv.volta = document.activeElement;
  const b = (L && L.bruto) || {};
  const e = L ? M.etapa(L) : "nova";
  $("#gv-titulo").textContent = L ? L.nome : "Novo paciente";
  $("#gv-eyebrow").textContent = L ? `Conversa de ${M.dataBR(L.i)}` : "Cadastro manual";
  $("#gv-demo").hidden = !S.demo;
  $("#gv-erro").textContent = "";

  // quem veio de anúncio identificado pelo WhatsApp não muda de origem na mão
  const travado = !!(L && L.plat && (S.demo || b.anuncio_ext));
  if (travado) {
    const k = L.cri && M.CRI[L.cri], c = M.CAMP[L.camp];
    $("#gv-origem-info").innerHTML = k
      ? `Veio do anúncio <b>${esc(k.nome)}</b>, da campanha <b>${esc(c ? c.nome : "—")}</b> (${nomePlat(L.plat)}).`
      : `Veio de um anúncio da campanha <b>${esc(c ? c.nome : "—")}</b> (${nomePlat(L.plat)}).`;
  } else {
    $("#lf-origem").innerHTML = opcoesOrigem();
    const v = L && L.plat && M.CAMP[L.camp] ? "camp:" + L.camp : (b.origem && b.origem !== "anuncio" ? b.origem : (L && L.origem && L.origem !== "anuncio" ? L.origem : L ? "whatsapp" : "indicacao"));
    $("#lf-origem").value = v;
    if ($("#lf-origem").value !== v) $("#lf-origem").value = "manual";
  }
  $("#gv-origem-info").hidden = !travado;
  $("#lf-box-origem").hidden = travado;

  const servs = Object.keys(M.CFG.ticket);
  const sv = L ? L.servico : (servs.includes("Clínica geral") ? "Clínica geral" : servs[0]);
  if (sv && !servs.includes(sv)) servs.push(sv);
  $("#lf-servico").innerHTML = servs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("#lf-servico").value = sv || "";

  $("#lf-nome").value = L && L.nome !== "Sem nome" ? L.nome : "";
  $("#lf-tel").value = L ? L.telefone || "" : "";
  $("#lf-obs").value = L ? L.obs || "" : "";
  $("#lf-consulta").value = !L ? "" : S.demo ? (L.iConsulta != null ? isoI(L.iConsulta) : "") : (b.data_consulta ? String(b.data_consulta).slice(0, 10) : "");
  const v = $("#lf-valor");
  v.value = !L ? "" : S.demo ? (L.fechou ? M.valorLead(L) : "") : (b.valor != null ? b.valor : "");
  v.dataset.sug = "";
  $$('input[name="lf-etapa"]').forEach(r => { r.checked = r.value === e; });
  gvAtualizar();

  $("#gaveta-fundo").hidden = false;
  $("#gaveta").hidden = false;
  $("#app").inert = true;
  document.body.style.overflow = "hidden";
  const foco = L ? $('input[name="lf-etapa"]:checked') : $("#lf-nome");
  if (foco) foco.focus();
}

function fecharGaveta(semFoco) {
  if ($("#gaveta").hidden) return;
  $("#gaveta").hidden = true;
  $("#gaveta-fundo").hidden = true;
  $("#app").inert = false;
  document.body.style.overflow = "";
  if (!semFoco) {
    let v = gv.volta;
    if (!v || !document.contains(v)) v = gv.lead ? $(`[data-lead="${CSS.escape(String(gv.lead.id))}"]`) : $("#btn-novo-lead");
    if (v) v.focus();
  }
  gv.lead = null;
}

async function salvarLead(ev) {
  ev.preventDefault();
  const erro = msg => { $("#gv-erro").textContent = msg; };
  if (S.demo) return erro("Demonstração: nada foi salvo. No painel da clínica, este botão grava na hora.");
  const L = gv.lead, b = (L && L.bruto) || {}, e = gvEtapa(), hoje = hojeDados();
  const nome = $("#lf-nome").value.trim(), tel = soDigitos($("#lf-tel").value);
  if (!L && !nome && !tel) { $("#lf-nome").focus(); return erro("Informe pelo menos o nome ou o telefone."); }
  const p = { nome, telefone: tel, servico: $("#lf-servico").value, etapa: e, obs: $("#lf-obs").value.trim() };
  if (L) p.id = L.id; else p.data_conversa = hoje;

  if (!$("#lf-box-origem").hidden) {
    const v = $("#lf-origem").value;
    if (v.startsWith("camp:")) {
      const c = M.CAMP[v.slice(5)];
      if (c) { p.origem = "anuncio"; p.plataforma = c.plat; p.campanha_ext = c.id.slice(c.plat.length + 1); }
    } else {
      p.origem = v;
      if (b.plataforma || b.campanha_ext) { p.plataforma = ""; p.campanha_ext = ""; }
    }
  }

  const consulta = $("#lf-consulta").value;
  if (e === "agendada") {
    if (!consulta) { $("#lf-consulta").focus(); return erro("Informe o dia da consulta."); }
    p.data_consulta = consulta;
    if (!b.data_agenda) p.data_agenda = hoje;
  } else if (COM_DATA.has(e)) {
    p.data_consulta = consulta || b.data_consulta || hoje;
  } else if (b.data_agenda || b.data_consulta) {
    // voltou para "nova"/"não agendou": o funil não pode continuar contando o agendamento
    p.data_agenda = ""; p.data_consulta = "";
  }
  if (e === "fechou") {
    const bruto = $("#lf-valor").value.trim();
    if (bruto === "") p.valor = "";
    else {
      const n = parseFloat(bruto.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { $("#lf-valor").focus(); return erro("Valor inválido."); }
      p.valor = n;
    }
  }

  const btn = $("#gv-salvar");
  ocupado(btn, true);
  try {
    await api.leadSalvar(S.token, S.clienteId, p);
    fecharGaveta();
    toast(L ? "Paciente atualizado ✓" : "Paciente cadastrado ✓");
    await carregarDados({ entrada: false });
    // o kanban foi redesenhado: o cartão que tinha o foco não existe mais
    if (document.activeElement === document.body || !document.activeElement) {
      const volta = L && $(`[data-lead="${CSS.escape(String(L.id))}"]`);
      (volta || $("#btn-novo-lead")).focus();
    }
  } catch (err) {
    if (err.codigo !== "sessao_invalida") erro(api.mensagemErro(err));
  } finally { ocupado(btn, false); }
}

/* ============================================================
   6. RADAR
   ============================================================ */
const OPS = { ">": "acima de", "<": "abaixo de", ">=": "a partir de", "<=": "até" };
const ROT_MET = { cpa: "Custo por conversa", ctr: "CTR", freq: "Frequência", conversoes: "Conversas" };
const SEV_NOME = { critico: "crítico", alerta: "alerta", info: "informativo" };
const horaCheia = () => `${p2(new Date().getHours())}:00`;
const ultimoSync = () => ((S.dados && S.dados.integracoes) || []).map(i => i.ultimo_sync).filter(Boolean).sort().pop() || null;

function alertasServidor() {
  const m = new Map();
  for (const a of (S.dados && S.dados.alertas) || []) {
    const e = m.get(a.chave);
    if (!e || String(a.criado_em) > String(e.criado_em)) m.set(a.chave, a);
  }
  return m;
}

function renderRadar() {
  const vazio = semAnuncios();
  const atuais = M.avaliar(M.R, true), hist = vazio ? [] : M.historico(), srv = alertasServidor();
  const scope = $("#scope");
  $$(".blip", scope).forEach(b => b.remove());
  atuais.forEach((a, n) => {
    const ang = (n * 137.5 + 40) * Math.PI / 180, rad = { critico: 17, alerta: 27, info: 37 }[a.sev];
    const b = document.createElement("span");
    b.className = "blip " + a.sev;
    b.style.left = 50 + rad * Math.cos(ang) + "%";
    b.style.top = 50 + rad * Math.sin(ang) + "%";
    b.style.animationDelay = n * .45 + "s";
    scope.appendChild(b);
  });
  const qtd = `${atuais.length} ${atuais.length === 1 ? "alerta ativo" : "alertas ativos"}`;
  const u = ultimoSync();
  $("#scope-status").innerHTML = vazio && !S.demo ? "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar."
    : S.varridoEm ? `Conferido às <b>${S.varridoEm}</b> · ${qtd}.`
    : S.demo ? `Última varredura: <b>hoje, ${horaCheia()}</b> · ${qtd}.`
    : u ? `Última leitura dos anúncios: <b>${quandoSP(u)}</b> · ${qtd}.` : `${qtd}.`;
  $("#btn-varrer").textContent = S.demo ? "Varrer agora" : "Conferir agora";

  $("#alerts").innerHTML = hist.length ? hist.slice(0, 8).map((e, n) => {
    const ativo = e.ate === M.R, a = e.a;
    const desde = ativo ? (e.desde === M.R ? "desde ontem · continua" : `desde ${M.dMes(e.desde)} · continua`)
      : e.desde === e.ate ? `em ${M.dMes(e.desde)}` : `de ${M.dMes(e.desde)} a ${M.dMes(e.ate)}`;
    const s = srv.get(a.chave);
    const env = s && s.enviado_em ? ` · <span class="al-env">aviso enviado no WhatsApp ${quandoSP(s.enviado_em)}</span>` : "";
    return `<li style="--i:${n}"><span class="sev sev-${a.sev}" role="img" aria-label="${SEV_NOME[a.sev]}">${M.ICONE[a.sev]}</span>
      <div><p class="al-t">${esc(a.regra.nome)} <span class="chip ${ativo ? (a.sev === "critico" ? "chip-bad" : "chip-warn") : "chip-ok"}">${ativo ? "ativo" : "resolvido"}</span></p>
      <p class="al-m">${esc(a.msg)}</p><p class="al-d">${desde}${env}</p></div></li>`;
  }).join("") : `<li class="vazio">Nenhum alerta nos últimos 14 dias.</li>`;

  const pode = S.demo || gestor();
  $("#rules").innerHTML = M.REGRAS.map(r => {
    const f = M.FMT_MET[r.metrica];
    const cond = `${ROT_MET[r.metrica]} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
    return `<li><div><p class="rl-t">${esc(r.nome)} <span class="chip ${r.sev === "critico" ? "chip-bad" : r.sev === "alerta" ? "chip-warn" : "chip-meta"}">${SEV_NOME[r.sev]}</span></p><p class="rl-c">${cond}</p></div>
      <button class="sw" type="button" role="switch" aria-checked="${r.ativa}" aria-label="Regra ${esc(r.nome)}" data-regra="${r.id}"${pode ? "" : ` aria-disabled="true" title="Só a equipe da Nexus liga ou desliga regras"`}></button></li>`;
  }).join("");
  $("#rules-nota").textContent = S.demo ? "Na demonstração, ligar e desligar regras e mexer nas metas não salva nada — é só para ver o efeito."
    : gestor() ? "Ligar ou desligar uma regra vale na hora para este cliente." : "Só a equipe da Nexus liga ou desliga regras.";

  $("#metas-demo").hidden = !S.demo;
  $("#metas-real").hidden = S.demo;
  if (S.demo) {
    $("#in-cpa").value = M.CFG.cpaAlvo; $("#out-cpa").textContent = brl(M.CFG.cpaAlvo);
    $("#in-orc").value = M.CFG.orcamento; $("#out-orc").textContent = brl0(M.CFG.orcamento);
  } else {
    $("#metas-real").innerHTML = `<p class="metas-l"><span>Meta de custo por conversa</span><b>${brl(M.CFG.cpaAlvo)}</b></p>` +
      `<p class="metas-l"><span>Orçamento de anúncios do mês</span><b>${brl0(M.CFG.orcamento)}</b></p>` +
      (gestor() ? `<button class="link-b" type="button" data-ir="ajustes">Alterar metas em Ajustes</button>` : "");
  }
  $("#wa-alerta").innerHTML = `<div class="bubble">${waHtml(M.textoAlerta(atuais))}<span class="hr">${horaCheia()}</span></div>`;

  const log = ((S.dados && S.dados.alertas) || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 10);
  const nomeRegra = id => (M.REGRAS.find(r => r.id === id) || { nome: id === "ritmo" ? "Ritmo do orçamento" : "Alerta" }).nome;
  $("#avisos-log").innerHTML = S.demo
    ? `<li class="vazio">Na demonstração nada é enviado. No painel real, aqui fica o registro de cada aviso que saiu no WhatsApp.</li>`
    : !log.length ? `<li class="vazio">Nenhum aviso enviado ainda.</li>`
    : log.map((a, n) => `<li style="--i:${n}"><span class="sev sev-${esc(a.severidade)}" role="img" aria-label="${SEV_NOME[a.severidade] || "alerta"}">${M.ICONE[a.severidade] || "•"}</span>
        <div><p class="al-t">${esc(nomeRegra(a.regra))}</p><p class="al-m">${esc(a.mensagem)}</p>
        <p class="al-d">${a.enviado_em ? `<span class="al-env">enviado no WhatsApp ${quandoSP(a.enviado_em)}</span>` : `registrado ${quandoSP(a.criado_em)} · ainda não enviado`}</p></div></li>`).join("");
  atualizarBadge(atuais.length);
}

function atualizarBadge(n) {
  if (n == null) n = M && !semAnuncios() ? M.avaliar(M.R, true).length : 0;
  $$("[data-badge]").forEach(b => { b.textContent = n; b.hidden = !n; });
}

async function alternarRegra(id) {
  const antes = [...(DS.CFG.regrasOff || [])];
  const off = new Set(antes);
  if (off.has(id)) off.delete(id); else off.add(id);
  DS.CFG.regrasOff = [...off];
  M = montar(DS);
  const focar = () => { const nb = $(`#rules [data-regra="${id}"]`); if (nb) nb.focus(); };
  renderRadar(); focar();
  if (S.demo) return;
  try {
    await salvarCfgCliente({ regrasOff: DS.CFG.regrasOff });
    toast(`Regra ${off.has(id) ? "desligada" : "ligada"} ✓`);
  } catch (err) {
    DS.CFG.regrasOff = antes;
    M = montar(DS);
    if (S.aba === "radar") { renderRadar(); focar(); }
    if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro");
  }
}

async function salvarCfgCliente(parcial) {
  const c = clienteAtual();
  if (!c) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  // "ativo" vai com o valor atual: o contrato não garante que a chave ausente mantém o cliente pausado
  const r = await api.clienteSalvar(S.token, { id: c.id, slug: c.slug, nome: c.nome, ativo: c.ativo !== false, cfg: parcial });
  c.cfg = (r && r.cfg) || { ...(c.cfg || {}), ...parcial };
}

/* ============================================================
   7. RELATÓRIOS
   ============================================================ */
let relDe = null;   // M para o qual os seletores de dia/mês foram montados

function relServidor() {
  const m = new Map();
  for (const r of (S.dados && S.dados.relatorios) || []) m.set(`${r.tipo}|${String(r.referencia).slice(0, 10)}`, r);
  return m;
}

function digitar(el, txt, dia, hora, naoEnviado) {
  clearTimeout(el._t);
  el._texto = txt;
  const fim = () => {
    el.innerHTML = `<span class="ph-day">${esc(dia)}</span><div class="bubble">${waHtml(txt)}<span class="hr${naoEnviado ? " nao" : ""}">${esc(hora)}</span></div>`;
    el.scrollTop = 0;
  };
  if (REDUCE) return fim();
  el.innerHTML = `<span class="ph-day">${esc(dia)}</span><div class="typing" role="img" aria-label="digitando"><i></i><i></i><i></i></div>`;
  el._t = setTimeout(fim, 850);
}

function mostrarRel(tipo, rel, previa, dia, horaPadrao) {
  const el = $("#ph-" + tipo), st = $("#st-" + tipo);
  if (rel && rel.texto) {
    digitar(el, rel.texto, dia, rel.enviado_em ? horaSP(rel.enviado_em) : horaPadrao, !rel.enviado_em);
    st.innerHTML = (rel.enviado_em ? `<span class="chip chip-ok">enviado ${quandoSP(rel.enviado_em)}</span>`
      : rel.erro ? `<span class="chip chip-bad">não enviado</span> ${esc(String(rel.erro).slice(0, 140))}`
      : `<span class="chip chip-warn">gerado, ainda não enviado</span>`) + (rel.leitura_ia ? ` <span class="chip chip-ia">leitura por IA</span>` : "");
  } else if (semAnuncios() || !previa) {
    clearTimeout(el._t);
    el._texto = "";
    el.innerHTML = `<p class="vazio">Ainda não há números de anúncio para montar este relatório.</p>`;
    st.innerHTML = "";
  } else {
    digitar(el, previa(), dia, horaPadrao, false);
    st.innerHTML = S.demo ? "" : `<span class="chip chip-neutro">prévia</span> calculada agora com os números do painel`;
  }
}

function montarSeletoresRel() {
  const sd = $("#sel-dia"), sm = $("#sel-mes"), vd = sd.value, vm = sm.value;
  sd.innerHTML = ""; sm.innerHTML = "";
  for (let k = 0; k < 14; k++) { const i = M.R - k; sd.add(new Option(`${k === 0 ? "Ontem" : SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`, isoI(i))); }
  M.mesesDados().filter(m => m.completo).reverse().forEach(m => sm.add(new Option(`${MESES[m.mes]} de ${m.ano}`, isoI(m.de))));
  if (vd && [...sd.options].some(o => o.value === vd)) sd.value = vd;
  if (vm && [...sm.options].some(o => o.value === vm)) sm.value = vm;
  relDe = M;
}

function renderRelatorios() {
  if (relDe !== M) montarSeletoresRel();
  const sd = $("#sel-dia"), sm = $("#sel-mes"), srv = relServidor();
  $("#ph-av-cli").textContent = (M.NOME || "C").trim().charAt(0).toUpperCase();
  $("#ph-nome-cli").textContent = `${M.NOME} · Resultados`;

  const isoD = sd.value, iD = iDeIso(isoD);
  mostrarRel("diario", srv.get(`diario|${isoD}`), iD >= 0 && iD <= M.R ? () => M.relDiario(iD) : null,
    iD === M.R ? "hoje" : M.dMes(iD + 1), "08:00");

  const isoM = sm.value;
  if (!isoM) {
    const el = $("#ph-mensal");
    clearTimeout(el._t); el._texto = "";
    el.innerHTML = `<p class="vazio">Ainda não há um mês completo.</p>`;
    $("#st-mensal").innerHTML = "";
  } else {
    const m = M.mesesDados().find(x => isoI(x.de) === isoM), mes = +isoM.slice(5, 7);
    mostrarRel("mensal", srv.get(`mensal|${isoM}`), m ? () => M.relMensal(m) : null, `1º de ${MESES[mes % 12]}`, "09:00");
  }

  const lista = ((S.dados && S.dados.relatorios) || []).slice()
    .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)) || (a.tipo === "mensal" ? -1 : 1)).slice(0, 12);
  $("#rel-lista").innerHTML = S.demo
    ? `<li class="vazio">Na demonstração nada é enviado. No painel real, aqui aparecem os últimos relatórios que saíram no WhatsApp.</li>`
    : !lista.length ? `<li class="vazio">Nenhum relatório enviado ainda. O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios.</li>`
    : lista.map(r => {
      const ref = String(r.referencia).slice(0, 10);
      const tit = r.tipo === "mensal" ? `Resumo de ${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : `Diário de ${dataIso(ref)}`;
      const st = r.enviado_em ? `<span class="chip chip-ok">enviado</span> ${quandoSP(r.enviado_em)}`
        : r.erro ? `<span class="chip chip-bad">não enviado</span> ${esc(String(r.erro).slice(0, 80))}` : `<span class="chip chip-warn">não enviado</span>`;
      return `<li><div class="rl-q"><b>${esc(tit)}</b><span>${st}${r.leitura_ia ? ` <span class="chip chip-ia">IA</span>` : ""}</span></div>
        <button class="pill pill-ghost pill-sm" type="button" data-ver-rel="${esc(r.tipo)}|${esc(ref)}" aria-label="Ver ${esc(tit)}">Ver</button></li>`;
    }).join("");
  $("#rel-nota").textContent = S.demo
    ? "No sistema real, a “leitura do dia” é escrita por IA a partir dos números. Aqui ela sai de regras fixas, só para demonstrar o formato."
    : "Quando o servidor já enviou o relatório do dia escolhido, o celular mostra o texto que foi enviado. Nos outros dias, mostra uma prévia calculada agora.";
}

function verRelatorio(chave) {
  const [tipo, ref] = chave.split("|"), sel = $(tipo === "mensal" ? "#sel-mes" : "#sel-dia");
  if (![...sel.options].some(o => o.value === ref)) {
    const rot = tipo === "mensal" ? `${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : dataIso(ref);
    sel.add(new Option(rot, ref));
  }
  sel.value = ref;
  renderRelatorios();
  const col = sel.closest(".phone-col");
  if (col) col.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "start" });
}

/* ============================================================
   8. AJUSTES (só gestor)
   ============================================================ */
const CANAIS = {
  meta: {
    nome: "Meta (Instagram e Facebook)", curto: "Meta",
    campos: [["meta_access_token", "Token de acesso", true], ["meta_ad_account_id", "ID da conta de anúncios", false, "act_1234567890"], ["conta_nome", "Nome da conta (opcional)", false]],
  },
  google: {
    nome: "Google Ads", curto: "Google",
    campos: [["google_developer_token", "Developer token", true], ["google_customer_id", "ID do cliente (só números)", false, "1234567890"],
      ["google_login_customer_id", "ID da conta gerente — MCC (opcional)", false], ["google_client_id", "OAuth client ID", false],
      ["google_client_secret", "OAuth client secret", true], ["google_refresh_token", "Refresh token", true]],
  },
};
const REGRAS_NOMES = [["r1", "Custo por conversa alto"], ["r2", "Campanha sem conversa"], ["r3", "Criativo com CTR baixo"], ["r4", "Fadiga de criativo"]];

function renderAjustes() {
  if (!gestor()) return;
  if (!S.aj.carregado) carregarAjustes();
  renderFormCliente();
  renderIntegracoes();
  renderContas();
  renderConfig();
}

let ajN = 0;
async function carregarAjustes() {
  S.aj.carregado = true;
  S.aj.integ = null; S.aj.contas = null; S.aj.config = null;
  const id = S.clienteId, n = ++ajN;
  const [integ, contas, config] = await Promise.allSettled([
    id ? api.integracoesStatus(S.token, id) : Promise.resolve([]),
    api.contasListar(S.token),
    api.configVer(S.token),
  ]);
  // só vale a leitura mais recente (trocar de cliente ou salvar dispara outra)
  if (n !== ajN || id !== S.clienteId) return;
  const val = r => (r.status === "fulfilled" ? r.value : { erro: r.reason });
  S.aj.integ = val(integ); S.aj.contas = val(contas); S.aj.config = val(config);
  if (S.aba === "ajustes") { renderIntegracoes(); renderContas(); renderConfig(); }
  atualizarBadgeContas();
}

const linhaTicket = (s = "", v = "") => `<div class="tk-row">
  <input type="text" aria-label="Tratamento" value="${esc(s)}" placeholder="Tratamento" data-tk-s>
  <input type="number" aria-label="Valor de ${esc(s || "tratamento")} em reais" value="${esc(v)}" min="0" step="10" inputmode="decimal" placeholder="R$" data-tk-v>
  <button class="tk-x" type="button" aria-label="Remover ${esc(s || "tratamento")}" data-tk-x>×</button></div>`;

function renderFormCliente() {
  const c = clienteAtual(), novo = S.aj.novoCliente || !c;
  const base = novo ? { nome: "", slug: "", ativo: true, cfg: {} } : c;
  const cfg = cfgCom(base.cfg), off = new Set(cfg.regrasOff || []);
  const lista = v => [].concat(v || []).join("\n");
  $("#aj-cliente-h").textContent = novo ? "Novo cliente" : "Cliente";
  $("#btn-novo-cliente").hidden = novo;
  $("#form-cliente").innerHTML = `
    <h3>Identificação</h3>
    <div class="form-2">
      <label class="campo"><span>Nome do cliente</span><input type="text" id="cl-nome" value="${esc(base.nome)}" required></label>
      <label class="campo"><span>Nome curto (relatórios)</span><input type="text" id="cl-curto" value="${esc((base.cfg && base.cfg.nomeCurto) || "")}" placeholder="ex.: Kamiguchi"></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>Identificador</span><input type="text" id="cl-slug" value="${esc(base.slug)}" placeholder="gerado pelo nome" spellcheck="false" autocapitalize="off"><small>Só letras minúsculas, números e hífen.</small></label>
      <div class="campo"><span id="cl-ativo-l">Cliente ativo</span><span class="sw-l"><button class="sw" type="button" role="switch" id="cl-ativo" aria-checked="${base.ativo !== false}" aria-labelledby="cl-ativo-l"></button><small>Desligado: o servidor para de ler e de enviar.</small></span></div>
    </div>
    <h3>Metas</h3>
    <div class="form-3">
      <label class="campo"><span>Custo por conversa (R$)</span><input type="number" id="cl-cpa" min="1" step="0.5" inputmode="decimal" value="${esc(cfg.cpaAlvo)}"></label>
      <label class="campo"><span>Orçamento do mês (R$)</span><input type="number" id="cl-orc" min="0" step="50" inputmode="decimal" value="${esc(cfg.orcamento)}"></label>
      <label class="campo"><span>Gestão mensal (R$)</span><input type="number" id="cl-fee" min="0" step="1" inputmode="decimal" value="${esc(cfg.fee)}"></label>
    </div>
    <h3>Valor de cada tratamento</h3>
    <p class="nota-sm">Estima o resultado quando a clínica não informa o valor fechado.</p>
    <div class="tickets" id="cl-tickets">${Object.entries(cfg.ticket).map(([s, v]) => linhaTicket(s, v)).join("")}</div>
    <p><button class="link-b" type="button" id="cl-tk-add">+ tratamento</button></p>
    <h3>WhatsApp</h3>
    <div class="form-2">
      <label class="campo"><span>Gestor (alertas e diário)</span><textarea id="cl-wagestor" rows="2" placeholder="5512999998888">${esc(lista(cfg.waGestor))}</textarea><small>Um número por linha, com DDD.</small></label>
      <label class="campo"><span>Clínica (resumo do mês)</span><textarea id="cl-wacliente" rows="2" placeholder="5512997552370">${esc(lista(cfg.waCliente))}</textarea><small>Um número por linha, com DDD.</small></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>ID do número da clínica (Cloud API)</span><input type="text" id="cl-waphone" inputmode="numeric" spellcheck="false" autocomplete="off" placeholder="${novo ? "phone_number_id" : "em branco = mantém o atual"}"><small>Liga as conversas que chegam pelo webhook a este cliente.</small></label>
      <label class="campo"><span>Assinatura do resumo</span><input type="text" id="cl-assinatura" value="${esc(cfg.assinatura)}"></label>
    </div>
    <h3>Regras do radar</h3>
    <ul class="regras-aj">${REGRAS_NOMES.map(([id, n]) => `<li><span id="cl-rg-${id}-l">${n}</span><button class="sw" type="button" role="switch" data-rg="${id}" aria-checked="${!off.has(id)}" aria-labelledby="cl-rg-${id}-l"></button></li>`).join("")}</ul>
    <div class="aj-pe">
      <button class="pill pill-bronze" type="submit" id="cl-salvar">${novo ? "Criar cliente" : "Salvar cliente"}</button>
      ${novo && S.clientes.length ? `<button class="pill pill-ghost" type="button" id="cl-cancelar">Cancelar</button>` : ""}
    </div>
    <p class="aj-st" id="cl-status" role="status"></p>`;
}

async function salvarCliente(ev) {
  ev.preventDefault();
  const st = $("#cl-status"), btn = $("#cl-salvar");
  const c = clienteAtual(), novo = S.aj.novoCliente || !c;
  const nome = $("#cl-nome").value.trim();
  if (!nome) { $("#cl-nome").focus(); return avisoForm(st, "Informe o nome do cliente.", true); }
  const slug = $("#cl-slug").value.trim().toLowerCase() || slugDe(nome);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { $("#cl-slug").focus(); return avisoForm(st, "Identificador: use só letras minúsculas, números e hífen.", true); }
  const num = (sel, pad) => { const v = parseFloat(String($(sel).value).replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : pad; };
  const ticket = {};
  $$("#cl-tickets .tk-row").forEach(r => {
    const s = $("[data-tk-s]", r).value.trim(), v = parseFloat(String($("[data-tk-v]", r).value).replace(",", "."));
    if (s && Number.isFinite(v)) ticket[s] = v;
  });
  // separa por linha, vírgula ou ponto e vírgula — espaço faz parte de "(12) 99999-8888"
  const numeros = sel => [...new Set($(sel).value.split(/[\n,;]+/).map(soDigitos).filter(n => n.length >= 10))];
  const cfg = {
    nomeCurto: $("#cl-curto").value.trim(),
    cpaAlvo: num("#cl-cpa", CFG_PADRAO.cpaAlvo), orcamento: num("#cl-orc", CFG_PADRAO.orcamento), fee: num("#cl-fee", CFG_PADRAO.fee),
    ticket, waGestor: numeros("#cl-wagestor"), waCliente: numeros("#cl-wacliente"),
    assinatura: $("#cl-assinatura").value.trim() || CFG_PADRAO.assinatura,
    regrasOff: $$("#form-cliente [data-rg]").filter(b => b.getAttribute("aria-checked") !== "true").map(b => b.dataset.rg),
  };
  const p = { slug, nome, ativo: $("#cl-ativo").getAttribute("aria-checked") === "true", cfg };
  if (!novo) p.id = c.id;
  const wa = $("#cl-waphone").value.trim();
  if (wa) p.wa_phone_number_id = wa;

  ocupado(btn, true);
  try {
    const r = await api.clienteSalvar(S.token, p);
    const s = await api.sessao(S.token);
    S.clientes = ordenarClientes(s.clientes || []);
    if (novo && r && r.id) S.clienteId = r.id;
    if (!clienteAtual() && S.clientes[0]) S.clienteId = S.clientes[0].id;
    gravarLocal("nx-cliente", S.clienteId);
    S.aj.novoCliente = false;
    S.aj.carregado = false;
    preencherSeletor();
    toast(novo ? "Cliente criado ✓" : "Cliente salvo ✓");
    if (novo) { DS = null; M = null; S.dados = null; relDe = null; }
    renderAjustes();
    await carregarDados({ entrada: false });
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}

function htmlCanal(canal) {
  const d = CANAIS[canal], lista = Array.isArray(S.aj.integ) ? S.aj.integ : [];
  const st = lista.find(i => i.canal === canal) || {}, pre = new Set(st.preenchidos || []);
  const status = !st.canal ? "Ainda não configurada."
    : st.ultimo_sync ? `Última leitura ${quandoSP(st.ultimo_sync)}${st.status ? " · " + st.status : ""}` : (st.status || "Ainda não leu os anúncios.");
  const cls = /^erro/i.test(st.status || "") ? " erro" : /^ok/i.test(st.status || "") ? " ok" : "";
  return `<form class="integ" data-canal="${canal}" novalidate>
    <div class="integ-h"><h3>${d.nome}</h3><span class="sw-l"><span id="ig-${canal}-l">Ligada</span><button class="sw" type="button" role="switch" data-ig-ativo aria-checked="${!!st.ativo}" aria-labelledby="ig-${canal}-l"></button></span></div>
    <p class="integ-st${cls}">${esc(status)}</p>
    ${d.campos.map(([k, rot, secreto, ph]) => `<label class="campo"><span>${rot}${pre.has(k) ? `<b class="ok-preenchido">✓ preenchido</b>` : ""}</span>
      <input type="${secreto ? "password" : "text"}" name="${k}" id="ig-${canal}-${k}" autocomplete="${secreto ? "new-password" : "off"}" spellcheck="false" autocapitalize="off" placeholder="${pre.has(k) ? "em branco = mantém o atual" : esc(ph || "")}"></label>`).join("")}
    <div class="aj-pe"><button class="pill pill-ink" type="submit">Salvar ${d.curto}</button></div>
    <p class="aj-st" role="status"></p>
  </form>`;
}

function renderIntegracoes() {
  const box = $("#aj-integracoes");
  if (!S.clienteId || S.aj.novoCliente) { box.innerHTML = `<p class="vazio">Salve o cliente primeiro; depois conecte o Meta e o Google aqui.</p>`; return; }
  if (S.aj.integ == null) { box.innerHTML = carregandoHtml("Lendo as integrações…"); return; }
  if (S.aj.integ.erro) { box.innerHTML = `<p class="vazio">${esc(api.mensagemErro(S.aj.integ.erro))}</p>`; return; }
  box.innerHTML = Object.keys(CANAIS).map(htmlCanal).join("");
}

async function salvarIntegracao(form) {
  const canal = form.dataset.canal, st = $(".aj-st", form), btn = $('[type="submit"]', form);
  const cred = {};
  $$("input[name]", form).forEach(i => { const v = i.value.trim(); if (v) cred[i.name] = v; });
  const ativo = $("[data-ig-ativo]", form).getAttribute("aria-checked") === "true";
  ocupado(btn, true);
  try {
    const r = await api.integracaoSalvar(S.token, S.clienteId, canal, cred, ativo);
    if (Array.isArray(r)) S.aj.integ = r;
    else if (r && r.canal) S.aj.integ = [...(Array.isArray(S.aj.integ) ? S.aj.integ : []).filter(i => i.canal !== r.canal), r];
    if (S.dados && Array.isArray(S.aj.integ)) S.dados.integracoes = S.aj.integ.map(({ canal: c, ativo: a, ultimo_sync, status }) => ({ canal: c, ativo: a, ultimo_sync, status }));
    // redesenha o bloco: credencial digitada não fica na tela
    form.outerHTML = htmlCanal(canal);
    avisoForm($(`#aj-integracoes [data-canal="${canal}"] .aj-st`), `Salvo ✓ — a próxima leitura já usa estes dados.`, false);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

async function executarTarefa(tipo, btn) {
  const cid = S.clienteId, st = $("#exec-status");
  if (!cid) return avisoForm(st, "Cadastre ou escolha um cliente primeiro.", true);
  const [tarefa, corpo] = tipo === "ciclo" ? ["nx-ciclo", { cliente: cid }] : ["nx-relatorio", { tipo, cliente: cid, forcar: true }];
  ocupado(btn, true);
  try {
    await api.executar(S.token, tarefa, corpo);
    const h = FMT_HORA.format(new Date());
    avisoForm(st, tipo === "ciclo"
      ? `Pedido enviado às ${h}. Os números novos aparecem em 1 ou 2 minutos — o painel recarrega sozinho.`
      : `Pedido enviado às ${h}. O ${tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp dos destinos em instantes.`, false);
    clearTimeout(S.aj.tRecarga);
    S.aj.tRecarga = setTimeout(() => { if (S.clienteId === cid) carregarDados({ entrada: false }); }, tipo === "ciclo" ? 90000 : 45000);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}

function htmlConta(c) {
  const eu = S.conta && c.id === S.conta.id, clis = new Set(c.clientes || []), pend = !c.aprovado, id = esc(c.id);
  return `<li class="conta${pend ? " pendente" : ""}" data-conta="${id}">
    <div class="ct-q"><strong>${esc(c.nome || "Sem nome")}${eu ? " (você)" : ""}</strong><span>${esc(c.email)}</span><small>conta criada em ${dataTs(c.criado_em)}</small>
      <span class="chips">${pend ? `<span class="chip chip-warn">aguardando aprovação</span>` : `<span class="chip chip-ok">acesso liberado</span>`}<span class="chip chip-neutro">${c.papel === "gestor" ? "gestor" : "clínica"}</span></span></div>
    <div class="ct-ctrl">
      <div class="ct-linha">
        <label class="campo"><span>Tipo de conta</span><select data-ct-papel>
          <option value="clinica"${c.papel !== "gestor" ? " selected" : ""}>Clínica — vê só os clientes marcados</option>
          <option value="gestor"${c.papel === "gestor" ? " selected" : ""}>Gestor da Nexus — vê todos</option></select></label>
        <span class="sw-l"><button class="sw" type="button" role="switch" data-ct-aprov aria-checked="${!!c.aprovado}" aria-labelledby="ct-${id}-l"></button><span id="ct-${id}-l">Acesso liberado</span></span>
      </div>
      <fieldset class="ct-clis" data-ct-clis${c.papel === "gestor" ? " hidden" : ""}><legend>Clientes que esta conta vê</legend>
        ${S.clientes.length ? S.clientes.map(k => `<label class="chk"><input type="checkbox" value="${esc(k.id)}"${clis.has(k.id) ? " checked" : ""}> ${esc(k.nome)}</label>`).join("") : `<span class="nota-sm">Nenhum cliente cadastrado ainda.</span>`}
      </fieldset>
      <div class="aj-pe">${pend ? `<button class="pill pill-bronze" type="button" data-ct-aprovar>Aprovar e salvar</button>` : ""}<button class="pill pill-ink" type="button" data-ct-salvar>Salvar</button></div>
      <p class="aj-st" role="status"></p>
    </div></li>`;
}

function renderContas() {
  const ul = $("#aj-contas"), L = S.aj.contas;
  if (L == null) { ul.innerHTML = `<li>${carregandoHtml("Lendo as contas…")}</li>`; return; }
  if (L.erro) { ul.innerHTML = `<li class="vazio">${esc(api.mensagemErro(L.erro))}</li>`; return; }
  if (!L.length) { ul.innerHTML = `<li class="vazio">Nenhuma conta ainda.</li>`; return; }
  ul.innerHTML = L.slice().sort((a, b) => (!!a.aprovado - !!b.aprovado) || String(b.criado_em).localeCompare(String(a.criado_em))).map(htmlConta).join("");
}

function atualizarBadgeContas() {
  const n = Array.isArray(S.aj.contas) ? S.aj.contas.filter(c => !c.aprovado).length : 0;
  $$("[data-badge-aj]").forEach(b => { b.textContent = n; b.hidden = !n; });
}

async function salvarConta(li, aprovar, btn) {
  const st = $(".aj-st", li), sw = $("[data-ct-aprov]", li);
  const papel = $("[data-ct-papel]", li).value;
  if (aprovar) sw.setAttribute("aria-checked", "true");
  const aprovado = sw.getAttribute("aria-checked") === "true";
  const clientes = papel === "gestor" ? [] : $$("[data-ct-clis] input:checked", li).map(i => i.value);
  if (aprovado && papel !== "gestor" && !clientes.length) return avisoForm(st, "Marque pelo menos um cliente para esta conta ver.", true);
  ocupado(btn, true);
  try {
    const r = await api.contaDefinir(S.token, li.dataset.conta, aprovado, papel, clientes);
    if (Array.isArray(r)) S.aj.contas = r;
    renderContas();
    atualizarBadgeContas();
    toast("Conta atualizada ✓");
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

const nomeTarefa = t => ({ "nx-ciclo": "Leitura dos anúncios + radar", "nx-relatorio": "Relatório", "nx-whatsapp": "Webhook do WhatsApp" }[t] || t || "Tarefa");
const resumoTxt = r => !r ? "" : typeof r === "string" ? r.slice(0, 180) : JSON.stringify(r).slice(0, 180);

function renderConfig() {
  const c = S.aj.config, f = $("#form-config"), ex = $("#aj-execucoes");
  if (c == null) { f.innerHTML = carregandoHtml("Lendo a configuração…"); ex.innerHTML = ""; return; }
  if (c.erro) { f.innerHTML = `<p class="vazio">${esc(api.mensagemErro(c.erro))}</p>`; ex.innerHTML = ""; return; }
  $("#cfg-webhook").textContent = c.webhook_url || "—";
  $("#cfg-verify").textContent = c.wa_verify_token || "—";
  const sec = (k, rot, tem, dica) => `<label class="campo"><span>${rot}${tem ? `<b class="ok-preenchido">✓ preenchido</b>` : ""}</span>` +
    `<input type="password" name="${k}" id="cf-${k}" autocomplete="new-password" spellcheck="false" placeholder="${tem ? "em branco = mantém o atual" : ""}">${dica ? `<small>${dica}</small>` : ""}</label>`;
  const txt = (k, rot, dica = "", ph = "") => `<label class="campo"><span>${rot}</span>` +
    `<input type="text" name="${k}" id="cf-${k}" value="${esc(c[k] ?? "")}" spellcheck="false" autocapitalize="off" placeholder="${esc(ph)}"${k === "modelo_ia" ? ` list="cf-modelos"` : ""}>${dica ? `<small>${dica}</small>` : ""}</label>`;
  f.innerHTML = `
    <h3>WhatsApp da Nexus (quem envia os avisos)</h3>
    <div class="form-2">${txt("wa_phone_number_id", "ID do número (phone_number_id)")}${sec("wa_access_token", "Token de acesso", c.tem_wa_token)}</div>
    <div class="form-2">${txt("wa_template", "Modelo aprovado (fora da janela de 24h)", "Parâmetros do modelo: título curto e link do painel.")}${sec("meta_app_secret", "App secret (confere o webhook)", c.tem_app_secret)}</div>
    <h3>Leitura por IA</h3>
    <div class="form-2">${sec("anthropic_api_key", "Chave da API", c.tem_ia, "Sem chave, a leitura sai por regras fixas.")}${txt("modelo_ia", "Modelo", "", "claude-opus-5")}</div>
    <datalist id="cf-modelos"><option value="claude-opus-5"></option><option value="claude-fable-5-1"></option></datalist>
    <h3>Outros</h3>
    <div class="form-2">${txt("painel_url", "Endereço do painel", "Vai como link no modelo de WhatsApp.")}${txt("google_api_versao", "Versão da API do Google", "Em branco: o servidor descobre sozinho.", "automático")}</div>
    <div class="aj-pe"><button class="pill pill-bronze" type="submit" id="cf-salvar">Salvar configuração</button></div>
    <p class="aj-st" id="cf-status" role="status"></p>`;
  const L = c.ultimas_execucoes || [];
  ex.innerHTML = `<h3>Últimas execuções do servidor</h3>` + (L.length
    ? `<ul>${L.slice(0, 8).map(e => `<li><span aria-hidden="true">${e.ok === false ? "✗" : e.ok ? "✓" : "…"}</span><div><b>${esc(nomeTarefa(e.tarefa))}</b> · ${quandoSP(e.inicio)}` +
        `<span class="sr-only">${e.ok === false ? " — deu erro" : e.ok ? " — deu certo" : " — em andamento"}</span>${e.ok === false ? ` <span class="chip chip-bad">erro</span>` : ""}<small>${esc(resumoTxt(e.resumo))}</small></div></li>`).join("")}</ul>`
    : `<p class="vazio">Nenhuma execução registrada ainda.</p>`);
}

async function salvarConfig(ev) {
  ev.preventDefault();
  const f = $("#form-config"), st = $("#cf-status"), btn = $("#cf-salvar");
  // segredo em branco = mantém; texto em branco só é mandado quando "vazio" tem sentido
  const LIMPAVEIS = new Set(["wa_template", "google_api_versao"]);
  const cfg = {};
  $$("input[name]", f).forEach(i => {
    const v = i.value.trim();
    if (v || (i.type !== "password" && LIMPAVEIS.has(i.name))) cfg[i.name] = v;
  });
  ocupado(btn, true);
  try {
    const r = await api.configSalvar(S.token, cfg);
    if (r && typeof r === "object" && !Array.isArray(r)) S.aj.config = r;
    renderConfig();
    avisoForm($("#cf-status"), "Configuração salva ✓", false);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

/* ============================================================
   9. AURORA — cores da marca dançando no fundo escuro
   ============================================================ */
// mistura em RGB, não em matiz: entre azul e bronze o caminho pelo matiz passa pelo verde
const PAL = [[60, 118, 163], [207, 149, 64], [34, 64, 96], [176, 118, 31], [120, 150, 180]];
function cor(u) {
  const n = PAL.length, i = Math.floor(((u % n) + n) % n), f = ((u % 1) + 1) % 1, a = PAL[i], b = PAL[(i + 1) % n];
  const t = f * f * (3 - 2 * f);
  return a.map((v, k) => Math.round(v + (b[k] - v) * t));
}
class Aurora {
  constructor(cv, semente = 11) {
    this.cv = cv; this.ctx = cv.getContext("2d"); this.t = 4; this.on = false; this.vis = true;
    this.mx = .5; this.my = .5; this.tx = .5; this.ty = .5;
    const r = mulberry32(semente);
    this.blobs = Array.from({ length: 6 }, () => ({ px: r() * 6.3, py: r() * 6.3, sx: .06 + r() * .1, sy: .05 + r() * .09, rr: .5 + r() * .45, u: r() * 4, us: .025 + r() * .035, a: .16 + r() * .14 }));
    this.loop = this.loop.bind(this);
    if (FINE && !REDUCE) cv.parentElement.addEventListener("pointermove", e => {
      const b = cv.getBoundingClientRect();
      this.tx = (e.clientX - b.left) / b.width; this.ty = (e.clientY - b.top) / b.height;
    });
  }
  medir() {
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h) {
      const d = Math.min(devicePixelRatio || 1, 2);
      this.w = w; this.h = h; this.cv.width = w * d; this.cv.height = h * d;
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    return true;
  }
  desenhar() {
    if (!this.medir()) return;
    const { ctx, w, h } = this;
    this.mx += (this.tx - this.mx) * .05; this.my += (this.ty - this.my) * .05;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.blobs) {
      const x = w * (.5 + .46 * Math.sin(this.t * b.sx + b.px)) + (this.mx - .5) * 90;
      const y = h * (.5 + .46 * Math.cos(this.t * b.sy + b.py)) + (this.my - .5) * 60;
      const [r, gg, bb] = cor(b.u + this.t * b.us), rad = Math.max(w, h) * b.rr * .55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${r},${gg},${bb},${b.a})`);
      g.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ligar(on) {
    const deve = on && this.vis;
    if (REDUCE) { if (on) this.desenhar(); return; }
    if (deve && !this.on) { this.on = true; requestAnimationFrame(this.loop); }
    if (!deve) this.on = false;
  }
  loop() {
    if (!this.on) return;
    if (!document.hidden) { this.t += .016; this.desenhar(); }
    requestAnimationFrame(this.loop);
  }
}
let aurora = null, auroraAuth = null;

/* ============================================================
   10. ABAS, FILTROS, TOUR
   ============================================================ */
const ABAS = {
  geral: ["Visão geral", "Anúncios → WhatsApp → consultório", renderGeral],
  campanhas: ["Campanhas", "O que cada anúncio entrega", renderCampanhas],
  pacientes: ["Pacientes", "Do WhatsApp à cadeira do consultório", renderPacientes],
  radar: ["Radar", "Vigilância automática das campanhas", renderRadar],
  relatorios: ["Relatórios", "O que chega no WhatsApp", renderRelatorios],
  ajustes: ["Ajustes", "Cliente, integrações, contas e WhatsApp", renderAjustes],
};
const COM_FILTRO = ["geral", "campanhas", "pacientes"];

function estadoApp(tipo, o = {}) {
  S.estado = tipo || null;
  const el = $("#estado-app");
  el.innerHTML = !tipo ? "" : tipo === "carregando" ? carregandoHtml(o.msg || "Carregando os números…") : cartaoVazio(o);
  aplicarVisibilidade();
}

function aplicarVisibilidade() {
  const dadosOk = !S.estado && !!M;
  const ver = S.aba === "ajustes" ? gestor() : dadosOk;
  $$(".view").forEach(v => { v.hidden = !(ver && v.id === "view-" + S.aba); });
  $("#estado-app").hidden = !S.estado || S.aba === "ajustes";
  $("#filters").hidden = !COM_FILTRO.includes(S.aba) || !dadosOk || (S.aba !== "pacientes" && semAnuncios());
  $("#btn-tour").hidden = !S.demo || !dadosOk;
  // sem filtro nem tour, a caixa vazia ainda ocupava o espaçamento do cabeçalho
  $(".top-tools").hidden = $("#filters").hidden && $("#btn-tour").hidden;
}

function render(entrada) {
  aplicarVisibilidade();
  if (S.aba !== "ajustes" && (S.estado || !M)) return;
  const view = $("#view-" + S.aba);
  ABAS[S.aba][2]();
  $$(".card, .kpi, .phone-col", view).forEach((el, n) => el.style.setProperty("--i", n));
  if (entrada && !REDUCE) {
    view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
    // tira a classe depois: conteúdo nunca fica refém de animação congelada
    clearTimeout(view._t); view._t = setTimeout(() => view.classList.remove("enter"), 2400);
  }
  contar(view);
  posicionarSegs();
}

function setAba(aba, o = {}) {
  if (!ABAS[aba] || (aba === "ajustes" && !gestor())) aba = "geral";
  if (!o.doTour) tourFim();
  S.aba = aba;
  $$("[data-aba]").forEach(b => { if (b.dataset.aba === aba) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  $("#top-h1").textContent = ABAS[aba][0];
  $("#top-eyebrow").textContent = ABAS[aba][1];
  document.title = `${ABAS[aba][0]} · ${nomeCliente()} · Nexus Ads${S.demo ? " (demonstração)" : ""}`;
  if (!o.semRolar) scrollTo(0, 0);
  render(true);
  if (aurora) aurora.ligar(aba === "geral");
  try { history.replaceState(null, "", "#" + aba); } catch { /* file:// */ }
}

function ligarSeg(seg, aoMudar) {
  const btns = $$("button", seg), ind = $(".seg-ind", seg);
  const pos = () => {
    const on = btns.find(b => b.getAttribute("aria-checked") === "true");
    if (!on || !on.offsetWidth) return;
    ind.style.left = on.offsetLeft + "px"; ind.style.width = on.offsetWidth + "px";
  };
  const sel = b => {
    btns.forEach(x => { const s = x === b; x.setAttribute("aria-checked", String(s)); x.tabIndex = s ? 0 : -1; });
    pos(); aoMudar(b.dataset.v);
  };
  btns.forEach((b, n) => {
    b.tabIndex = b.getAttribute("aria-checked") === "true" ? 0 : -1;
    b.addEventListener("click", () => { if (b.getAttribute("aria-checked") !== "true") sel(b); });
    b.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const nb = btns[(n + d + btns.length) % btns.length];
      sel(nb); nb.focus();
    });
  });
  seg._pos = pos;
}
const posicionarSegs = () => $$(".seg").forEach(s => s._pos && s._pos());

const TOUR = [
  { aba: "geral", alvo: '[data-tour="hero"]', txt: "Tudo o que importa, numa frase: quantas pessoas chamaram no WhatsApp, quantas agendaram e quantas viraram pacientes — e quanto isso rendeu." },
  { aba: "geral", alvo: '[data-tour="funil"]', txt: "O funil mostra onde cada paciente entrou e onde parou. Cada etapa é comparada com a meta, para saber exatamente o que melhorar." },
  { aba: "pacientes", alvo: '[data-tour="kanban"]', txt: "Cada conversa vira um cartão. A senhora vê quais pacientes vieram dos anúncios, de qual anúncio e quanto cada um rendeu — e muda a etapa com um toque." },
  { aba: "radar", alvo: '[data-tour="radar"]', txt: "O radar confere tudo de hora em hora. Se um anúncio começa a gastar mal, o aviso chega na hora — antes de desperdiçar verba." },
  { aba: "relatorios", alvo: '[data-tour="relatorio"]', txt: "E todo dia 1º, este resumo chega no WhatsApp da senhora. Sem precisar abrir sistema nenhum." },
];
let tourI = -1, tourEl = null;

/** Rola para o alvo caber na faixa LIVRE: abaixo do cabeçalho fixo (desktop) e
    acima do cartão do tour e da tab bar (celular). */
function tourRolar(el) {
  const topo = $(".top"), card = $("#tour");
  const sobe = topo && getComputedStyle(topo).position === "sticky" ? topo.getBoundingClientRect().height : 0;
  const desce = card.hidden ? innerHeight : card.getBoundingClientRect().top;
  const livre = Math.max(120, desce - sobe - 24);
  const r = el.getBoundingClientRect();
  const alvoTopo = scrollY + r.top;
  const y = r.height <= livre ? alvoTopo - sobe - 12 - (livre - r.height) / 2 : alvoTopo - sobe - 12;
  scrollTo({ top: Math.max(0, y), behavior: REDUCE ? "auto" : "smooth" });
}

function tourIr(n) {
  if (tourEl) tourEl.classList.remove("tour-on");
  if (n < 0 || n >= TOUR.length) return tourFim();
  tourI = n;
  const p = TOUR[n];
  if (S.aba !== p.aba) setAba(p.aba, { doTour: true, semRolar: true });
  tourEl = $(p.alvo);
  // mostra ANTES de preencher: região viva que acabou de aparecer não é anunciada
  $("#tour").hidden = false;
  $("#tour-step").textContent = `${n + 1} de ${TOUR.length}`;
  $("#tour-text").textContent = p.txt;
  $("#tour-next").textContent = n === TOUR.length - 1 ? "Concluir ✓" : "Próximo →";
  setTimeout(() => {
    if (!tourEl) return;
    tourEl.classList.add("tour-on");
    tourRolar(tourEl);
  }, 80);
  $("#tour-next").focus({ preventScroll: true });
}
function tourFim() {
  const estavaAberto = tourI >= 0;
  if (tourEl) tourEl.classList.remove("tour-on");
  tourEl = null; tourI = -1;
  $("#tour").hidden = true;
  // o foco estava num botão que acabou de sumir: devolve para quem abriu o tour
  if (estavaAberto && ($("#tour").contains(document.activeElement) || document.activeElement === document.body)) {
    const b = $("#btn-tour");
    if (b && b.offsetParent) b.focus({ preventScroll: true });
  }
}

/* ============================================================
   11. SESSÃO — entrar, criar conta, cliente, carregar dados
   ============================================================ */
function mostrarTela(t) {
  $("#boot").hidden = t !== "boot";
  $("#tela-auth").hidden = t !== "auth";
  $("#app").hidden = t !== "app";
  $(".skip").setAttribute("href", t === "auth" ? "#tela-auth" : "#main");
  if (auroraAuth) auroraAuth.ligar(t === "auth");
  if (aurora && t !== "app") aurora.ligar(false);
}
function bootMsg(msg, comAcoes = false) {
  $("#boot-msg").textContent = msg;
  $("#boot-acoes").hidden = !comAcoes;
}

function authModo(modo, msg = "") {
  $("#form-entrar").hidden = modo !== "entrar";
  $("#form-criar").hidden = !(modo === "criar" || modo === "primeiro");
  $("#auth-pendente").hidden = modo !== "pendente";
  if (modo === "primeiro") S.pedirCodigo = true;
  if (modo === "criar") S.pedirCodigo = false;
  $("#cr-codigo-box").hidden = !S.pedirCodigo;
  $("#criar-h").textContent = modo === "primeiro" ? "Primeiro acesso" : "Criar conta";
  $("#criar-sub").textContent = modo === "primeiro"
    ? "A primeira conta é da Nexus e precisa do código de ativação."
    : "Depois de criada, a Nexus libera o seu acesso.";
  $("#auth-erro").textContent = msg;
  document.title = `${modo === "pendente" ? "Aguardando aprovação" : modo === "entrar" ? "Entrar" : "Criar conta"} · Nexus Ads`;
  const foco = modo === "entrar" ? $("#en-email") : modo === "pendente" ? $("#pend-h") : $("#cr-nome");
  if (foco) setTimeout(() => foco.focus(), 30);
}

async function entrar(ev) {
  ev.preventDefault();
  const email = $("#en-email").value.trim(), senha = $("#en-senha").value, btn = $("#btn-entrar");
  if (!email || !senha) return void ($("#auth-erro").textContent = "Preencha o e-mail e a senha.");
  $("#auth-erro").textContent = "";
  ocupado(btn, true);
  try {
    const r = await api.entrar(email, senha);
    api.guardarToken(r.token);
    S.token = r.token;
    $("#en-senha").value = "";
    await carregarSessao();
  } catch (err) {
    if (err.codigo === "conta_pendente") authModo("pendente");
    else $("#auth-erro").textContent = api.mensagemErro(err);
  } finally { ocupado(btn, false); }
}

async function criarConta(ev) {
  ev.preventDefault();
  const nome = $("#cr-nome").value.trim(), email = $("#cr-email").value.trim(), senha = $("#cr-senha").value;
  const codigo = S.pedirCodigo ? $("#cr-codigo").value.trim() : "";
  const erro = (msg, el) => { $("#auth-erro").textContent = msg; if (el) el.focus(); };
  if (!nome) return erro("Informe o seu nome.", $("#cr-nome"));
  if (!email) return erro("Informe o e-mail.", $("#cr-email"));
  if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.", $("#cr-senha"));
  $("#auth-erro").textContent = "";
  const btn = $("#btn-criar");
  ocupado(btn, true);
  try {
    const r = await api.criarConta({ email, senha, nome, codigo });
    if (r && r.aprovado) {
      const s = await api.entrar(email, senha);
      api.guardarToken(s.token);
      S.token = s.token;
      $("#cr-senha").value = "";
      await carregarSessao();
    } else authModo("pendente");
  } catch (err) {
    if (err.codigo === "codigo_invalido") {
      const semCodigo = !S.pedirCodigo || !codigo;
      S.pedirCodigo = true;
      $("#cr-codigo-box").hidden = false;
      erro(semCodigo ? "Esta é a primeira conta do sistema: informe o código de ativação da Nexus." : api.mensagemErro(err), $("#cr-codigo"));
    } else erro(api.mensagemErro(err));
  } finally { ocupado(btn, false); }
}

function sessaoExpirou() {
  api.apagarToken();
  S.token = null; S.conta = null;
  // a recarga agendada pelo "Fazer agora" viraria outra chamada sem token e roubaria o foco do login
  clearTimeout(S.aj.tRecarga);
  fecharGaveta(true); tourFim();
  mostrarTela("auth");
  authModo("entrar", api.MENSAGENS.sessao_invalida);
}

async function sair() {
  const t = S.token;
  api.apagarToken();
  S.token = null;
  try { if (t) await api.sair(t); } catch { /* o token já saiu do navegador */ }
  location.replace(location.pathname);
}

const ordenarClientes = l => l.slice().sort((a, b) => ((b.ativo !== false) - (a.ativo !== false)) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));

function preencherSeletor() {
  const mostra = !S.demo && S.clientes.length > 0 && (gestor() || S.clientes.length > 1);
  const html = S.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}${c.ativo === false ? " (pausado)" : ""}</option>`).join("");
  for (const [sel, box] of [["#sel-cliente", "#sel-cliente-box"], ["#sel-cliente-m", "#sel-cliente-m-box"]]) {
    $(sel).innerHTML = html;
    if (S.clienteId) $(sel).value = S.clienteId;
    $(box).hidden = !mostra;
  }
  const nome = S.demo ? NOME_DEMO : (clienteAtual() || {}).nome || (gestor() ? "Nenhum cliente ainda" : "Nenhuma clínica ligada");
  $("#side-cliente-nome").textContent = nome;
  $("#side-cliente-nome").hidden = mostra;
  $("#top-cliente").textContent = nome;
  $("#top-cliente").hidden = mostra;
}

function prepararApp() {
  const g = gestor();
  $$('[data-aba="ajustes"]').forEach(b => { b.hidden = !g; });
  $("#ribbon").hidden = !S.demo;
  $("#side-demo").hidden = !S.demo;
  $("#side-user").hidden = S.demo;
  $("#btn-sair-m").hidden = S.demo;
  if (!S.demo && S.conta) {
    $("#side-nome").textContent = S.conta.nome || S.conta.email || "";
    $("#side-papel").textContent = g ? "gestor · Nexus" : "clínica";
  }
  $("#side-cli-l").textContent = g ? "Cliente" : "Clínica";
  $("#foot-txt").innerHTML = S.demo
    ? `<b>${NOME_DEMO}</b> · painel de demonstração operado por <b>Nexus</b>`
    : `Painel operado por <b>Nexus</b> · Taubaté — SP`;
  $("#foot-link").textContent = S.demo ? "Entrar no painel →" : "Ver a demonstração";
  $("#foot-link").setAttribute("href", S.demo ? location.pathname : "?demo");
  $("#kanban-sub").textContent = S.demo
    ? "Situação de agora. Os nomes são fictícios — toque num cartão para ver a gaveta do paciente."
    : "Situação de agora. Toque num cartão para mudar a etapa do paciente.";
  preencherSeletor();
}

function atualizarTopo() {
  if (!M) { $("#top-sync").textContent = ""; return; }
  const ate = `Números até ontem, ${M.ddmm(M.R)}`;
  if (S.demo) { $("#top-sync").textContent = `${ate} · demonstração`; return; }
  const u = ultimoSync();
  $("#top-sync").textContent = u ? `${ate} · anúncios lidos ${quandoSP(u)}` : ate;
}

function semCliente() {
  estadoApp("sem-cliente", gestor()
    ? { ic: "＋", titulo: "Cadastre o primeiro cliente", texto: "Comece pelo cliente: nome, metas e valor de cada tratamento. Depois conecte o Meta e o Google e o painel se enche sozinho.",
        botoes: `<button class="pill pill-bronze" type="button" data-acao="novo-cliente">Cadastrar cliente</button>` }
    : { ic: "🔗", titulo: "Sua conta ainda não está ligada a uma clínica", texto: "A Nexus precisa marcar qual clínica você acompanha. Assim que isso acontecer, é só abrir o painel de novo.",
        botoes: `<button class="pill pill-ink" type="button" data-acao="recarregar-sessao">Já liberaram — abrir de novo</button>` });
}

async function carregarSessao() {
  mostrarTela("boot");
  bootMsg("Abrindo o painel…");
  let s;
  try { s = await api.sessao(S.token); }
  catch (e) {
    if (e.codigo !== "sessao_invalida") bootMsg(api.mensagemErro(e), true);
    return;
  }
  S.conta = s.conta || null;
  S.clientes = ordenarClientes(s.clientes || []);
  DS = null; M = null; S.dados = null; relDe = null; S.aj = novoAj(); S.kVer = {}; S.busca = "";
  const salvo = lerLocal("nx-cliente");
  const escolhido = S.clientes.find(c => c.id === salvo) || S.clientes.find(c => c.ativo !== false) || S.clientes[0];
  S.clienteId = escolhido ? escolhido.id : null;
  prepararApp();
  mostrarTela("app");
  if (S.clienteId) estadoApp("carregando"); else semCliente();
  abrirAbaInicial();
  if (S.clienteId) carregarDados({ entrada: true });
  if (gestor()) api.contasListar(S.token).then(l => { if (!S.aj.contas) { S.aj.contas = l; atualizarBadgeContas(); } }).catch(() => {});
}

let cargaN = 0;
async function carregarDados(o = {}) {
  const id = S.clienteId;
  if (!id || !S.token) return;
  const n = ++cargaN, primeira = !M;
  if (primeira) estadoApp("carregando"); else $("#main").classList.add("recarregando");
  try {
    const r = await api.dados(S.token, id, DIAS_JANELA) || {};
    if (n !== cargaN || id !== S.clienteId) return;
    S.dados = r;
    const c = clienteAtual();
    if (c && r.cliente) { c.cfg = r.cliente.cfg || c.cfg; c.nome = r.cliente.nome || c.nome; }
    montarDe(datasetDeLinhas({ metricas: r.metricas || [], leads: r.leads || [], cliente: r.cliente || c || {}, hoje: r.hoje || hojeSP(), dias: DIAS_JANELA }));
    relDe = null;
    estadoApp(null);
    atualizarTopo();
    document.title = `${ABAS[S.aba][0]} · ${nomeCliente()} · Nexus Ads`;
    // Ajustes não depende dos números: redesenhar apagaria o que está sendo digitado
    if (S.aba !== "ajustes") render(primeira || o.entrada);
    atualizarBadge();
  } catch (e) {
    if (n !== cargaN || e.codigo === "sessao_invalida") return;
    if (primeira) {
      estadoApp("erro", { ic: "!", erro: true, titulo: e.codigo === "sem_acesso" ? "Sem acesso a esta clínica" : "Não deu para carregar os números",
        texto: esc(api.mensagemErro(e)), botoes: `<button class="pill pill-ink" type="button" data-acao="recarregar">Tentar de novo</button>` });
    } else toast(api.mensagemErro(e), "erro");
  } finally {
    if (n === cargaN) $("#main").classList.remove("recarregando");
  }
}

function trocarCliente(id) {
  if (!id || id === S.clienteId) return;
  S.clienteId = id;
  gravarLocal("nx-cliente", id);
  preencherSeletor();
  DS = null; M = null; S.dados = null; relDe = null;
  S.kVer = {}; S.busca = ""; $("#k-busca").value = ""; S.varridoEm = null;
  clearTimeout(S.aj.tRecarga);
  S.aj.carregado = false; S.aj.novoCliente = false;
  tourFim(); fecharGaveta(true);
  estadoApp("carregando");
  atualizarTopo();
  atualizarBadge(0);
  if (S.aba === "ajustes") renderAjustes();
  carregarDados({ entrada: true });
}

function abrirAbaInicial() {
  const h = location.hash.slice(1);
  setAba(ABAS[h] ? h : "geral", { semRolar: true });
}

/* ============================================================
   12. INÍCIO
   ============================================================ */
function ligarEventos() {
  // gradientes compartilhados pelos gráficos
  document.body.insertAdjacentHTML("afterbegin", `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B5A80" stop-opacity=".2"/><stop offset="1" stop-color="#2B5A80" stop-opacity="0"/></linearGradient>
    <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C0472F" stop-opacity=".16"/><stop offset="1" stop-color="#C0472F" stop-opacity="0"/></linearGradient>
  </defs></svg>`);

  /* ---------- entrar / criar conta ---------- */
  $("#form-entrar").addEventListener("submit", entrar);
  $("#form-criar").addEventListener("submit", criarConta);
  $("#ir-criar").addEventListener("click", () => authModo("criar"));
  $("#ir-primeiro").addEventListener("click", () => authModo("primeiro"));
  $("#ir-entrar").addEventListener("click", () => authModo("entrar"));
  $("#pend-voltar").addEventListener("click", () => authModo("entrar"));
  $("#boot-tentar").addEventListener("click", () => carregarSessao());
  $("#boot-sair").addEventListener("click", sair);
  $("#btn-sair").addEventListener("click", sair);
  $("#btn-sair-m").addEventListener("click", sair);

  /* ---------- navegação ---------- */
  $$("[data-aba]").forEach(b => b.addEventListener("click", () => setAba(b.dataset.aba)));
  ligarSeg($("#seg-periodo"), v => { S.dias = +v; render(true); });
  ligarSeg($("#seg-plat"), v => { S.plat = v; S.kVer = {}; render(true); });
  $("#sel-cliente").addEventListener("change", e => trocarCliente(e.target.value));
  $("#sel-cliente-m").addEventListener("change", e => trocarCliente(e.target.value));
  // botões dos estados vazios e atalhos entre abas
  $("#main").addEventListener("click", e => {
    const ir = e.target.closest("[data-ir]");
    if (ir) return setAba(ir.dataset.ir);
    const ac = e.target.closest("[data-acao]");
    if (!ac) return;
    if (ac.dataset.acao === "recarregar") { M = null; carregarDados({ entrada: true }); }
    else if (ac.dataset.acao === "recarregar-sessao") carregarSessao();
    else if (ac.dataset.acao === "novo-cliente") { S.aj.novoCliente = true; setAba("ajustes"); }
  });
  ligarChart();

  /* ---------- campanhas ---------- */
  $("#tbl-campanhas").addEventListener("click", e => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    const k = b.dataset.sort;
    S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (k === "nome" ? 1 : -1) };
    renderCampanhas();
    const nb = $(`#tbl-campanhas [data-sort="${k}"]`);
    if (nb) nb.focus();
  });

  /* ---------- pacientes ---------- */
  $("#kanban").addEventListener("click", e => {
    const mais = e.target.closest("[data-kmais]");
    if (mais) {
      const k = mais.dataset.kmais, antes = S.kVer[k] || K_MAX;
      S.kVer[k] = antes + K_PASSO;
      renderKanban();
      // o foco vai para o primeiro cartão que acabou de aparecer
      const col = $$("#kanban .kcol")[COLS_K.findIndex(c => c[0] === k)];
      const prox = col && $$(".lead", col)[antes];
      if (prox) prox.focus();
      return;
    }
    const b = e.target.closest("[data-lead]");
    if (!b) return;
    const L = M.LEADS.find(x => String(x.id) === b.dataset.lead);
    if (L) abrirGaveta(L);
  });
  let buscaT;
  $("#k-busca").addEventListener("input", e => {
    clearTimeout(buscaT);
    buscaT = setTimeout(() => { S.busca = e.target.value; S.kVer = {}; if (M) renderKanban(); }, 140);
  });
  $("#btn-novo-lead").addEventListener("click", () => abrirGaveta(null));

  /* ---------- gaveta ---------- */
  $("#lf-etapas-op").innerHTML = ETAPAS.map(([v, l, c]) =>
    `<label class="etapa-op"><input type="radio" name="lf-etapa" value="${v}"><span><i style="--c:${c}"></i>${l}</span></label>`).join("");
  $("#lf-etapas-op").addEventListener("change", gvAtualizar);
  $("#lf-servico").addEventListener("change", gvAtualizar);
  $("#form-lead").addEventListener("submit", salvarLead);
  $("#gv-fechar").addEventListener("click", () => fecharGaveta());
  $("#gv-cancelar").addEventListener("click", () => fecharGaveta());
  $("#gaveta-fundo").addEventListener("click", () => fecharGaveta());
  $("#gaveta").addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); fecharGaveta(); } });

  /* ---------- radar ---------- */
  $("#rules").addEventListener("click", e => {
    const b = e.target.closest("[data-regra]");
    if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") return toast("Só a equipe da Nexus liga ou desliga regras.");
    alternarRegra(b.dataset.regra);
  });
  let metaT;
  const aoMeta = () => {
    if (!S.demo || !DS) return;
    DS.CFG.cpaAlvo = +$("#in-cpa").value; DS.CFG.orcamento = +$("#in-orc").value;
    $("#out-cpa").textContent = brl(DS.CFG.cpaAlvo); $("#out-orc").textContent = brl0(DS.CFG.orcamento);
    clearTimeout(metaT);
    metaT = setTimeout(() => {
      M = montar(DS);
      const foco = document.activeElement;
      renderRadar();
      atualizarBadge();
      if (foco && foco.id) { const f = document.getElementById(foco.id); if (f) f.focus(); }
    }, 120);
  };
  $("#in-cpa").addEventListener("input", aoMeta);
  $("#in-orc").addEventListener("input", aoMeta);
  $("#btn-varrer").addEventListener("click", async () => {
    const scope = $("#scope"), btn = $("#btn-varrer");
    btn.disabled = true;
    scope.classList.add("scanning");
    $("#scope-status").textContent = `Varrendo ${plural(campanhasTodas(), "campanha", "campanhas")} e ${plural(Object.values(M.CRI).filter(k => k.plat).length, "criativo", "criativos")}…`;
    const t0 = Date.now();
    if (!S.demo) await carregarDados({ entrada: false });
    setTimeout(() => {
      scope.classList.remove("scanning");
      const d = new Date();
      S.varridoEm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      btn.disabled = false;
      if (S.aba === "radar" && M) renderRadar();
    }, Math.max(0, (REDUCE ? 0 : 1500) - (Date.now() - t0)));
  });

  /* ---------- relatórios ---------- */
  $("#sel-dia").addEventListener("change", renderRelatorios);
  $("#sel-mes").addEventListener("change", renderRelatorios);
  $$("[data-copiar]").forEach(b => b.addEventListener("click", () => {
    const el = $("#ph-" + b.dataset.copiar);
    if (el._texto) copiar(el._texto, b);
  }));
  $("#rel-lista").addEventListener("click", e => {
    const b = e.target.closest("[data-ver-rel]");
    if (b) verRelatorio(b.dataset.verRel);
  });

  /* ---------- ajustes ---------- */
  $("#btn-novo-cliente").addEventListener("click", () => { S.aj.novoCliente = true; renderFormCliente(); renderIntegracoes(); $("#cl-nome").focus(); });
  const fc = $("#form-cliente");
  fc.addEventListener("submit", salvarCliente);
  fc.addEventListener("click", e => {
    const t = e.target;
    const sw = t.closest(".sw");
    if (sw) return sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
    if (t.closest("[data-tk-x]")) {
      const row = t.closest(".tk-row"), prox = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      const f = prox ? $("[data-tk-s]", prox) : $("#cl-tk-add");
      if (f) f.focus();
      return;
    }
    if (t.closest("#cl-tk-add")) {
      $("#cl-tickets").insertAdjacentHTML("beforeend", linhaTicket());
      const ult = $$("#cl-tickets [data-tk-s]").pop();
      if (ult) ult.focus();
      return;
    }
    if (t.closest("#cl-cancelar")) { S.aj.novoCliente = false; renderFormCliente(); renderIntegracoes(); $("#btn-novo-cliente").focus(); }
  });
  fc.addEventListener("input", e => {
    // identificador acompanha o nome enquanto ninguém mexeu nele
    if (e.target.id === "cl-nome" && (S.aj.novoCliente || !clienteAtual())) {
      const s = $("#cl-slug");
      if (s && (!s.value || s.dataset.auto === "1")) { s.value = slugDe(e.target.value); s.dataset.auto = "1"; }
    }
    if (e.target.id === "cl-slug") e.target.dataset.auto = "";
  });
  const ig = $("#aj-integracoes");
  ig.addEventListener("submit", e => { e.preventDefault(); salvarIntegracao(e.target); });
  ig.addEventListener("click", e => {
    const sw = e.target.closest("[data-ig-ativo]");
    if (sw) sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
  });
  $$("[data-exec]").forEach(b => b.addEventListener("click", () => executarTarefa(b.dataset.exec, b)));
  const ct = $("#aj-contas");
  ct.addEventListener("click", e => {
    const li = e.target.closest("[data-conta]");
    if (!li) return;
    const sw = e.target.closest("[data-ct-aprov]");
    if (sw) return sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
    const b = e.target.closest("[data-ct-salvar], [data-ct-aprovar]");
    if (b) salvarConta(li, b.hasAttribute("data-ct-aprovar"), b);
  });
  ct.addEventListener("change", e => {
    const sel = e.target.closest("[data-ct-papel]");
    if (sel) $("[data-ct-clis]", sel.closest("[data-conta]")).hidden = sel.value === "gestor";
  });
  $("#form-config").addEventListener("submit", salvarConfig);
  $$("[data-copiar-el]").forEach(b => b.addEventListener("click", () => {
    const t = $("#" + b.dataset.copiarEl).textContent.trim();
    if (t && t !== "—") copiar(t, b);
  }));

  /* ---------- tour ---------- */
  $("#btn-tour").addEventListener("click", () => tourIr(0));
  $("#tour-next").addEventListener("click", () => tourIr(tourI + 1));
  $("#tour-sair").addEventListener("click", tourFim);
  addEventListener("keydown", e => {
    if (tourI < 0) return;
    if (e.key === "Escape") return tourFim();
    // setas são do controle que estiver focado (slider, filtro, select) — não do tour
    const t = e.target;
    if (e.defaultPrevented || (t && t.closest && t.closest("input, select, textarea, [role='radio'], [role='switch']"))) return;
    if (e.key === "ArrowRight") tourIr(tourI + 1);
    if (e.key === "ArrowLeft" && tourI > 0) tourIr(tourI - 1);
  });

  /* ---------- topo, gráfico, aurora ---------- */
  const top = $(".top");
  addEventListener("scroll", () => top.classList.toggle("stuck", scrollY > 8), { passive: true });
  const chartEl = $("#chart-dia");
  if ("ResizeObserver" in window) {
    let rzc;
    new ResizeObserver(() => {
      const w = chartEl.clientWidth;
      if (!w || S.aba !== "geral" || !M || (w === chartEl._w && !chartEl._pendente)) return;
      clearTimeout(rzc);
      rzc = setTimeout(() => desenharChart(chartEl._pendente), 120);
    }).observe(chartEl);
  }
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(posicionarSegs, 180); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(posicionarSegs);

  aurora = new Aurora($("#hero-aurora"));
  new IntersectionObserver(en => { aurora.vis = en[0].isIntersecting; aurora.ligar(S.aba === "geral" && !$("#app").hidden); }).observe($(".card-hero"));
  auroraAuth = new Aurora($("#auth-aurora"), 29);
}
const campanhasTodas = () => Object.values(M.CAMP).filter(c => c.plat).length;

function iniciar() {
  ligarEventos();
  api.aoSessaoInvalida(sessaoExpirou);
  if (S.demo) {
    montarDe(gerarDemo({ nome: NOME_DEMO }));
    prepararApp();
    mostrarTela("app");
    atualizarTopo();
    abrirAbaInicial();
    atualizarBadge();
    return;
  }
  S.token = api.lerToken();
  if (!S.token) { mostrarTela("auth"); authModo("entrar"); return; }
  carregarSessao();
}

iniciar();
