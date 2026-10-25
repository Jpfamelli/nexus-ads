/* ============================================================
   ÓRBITA — graficos.js (frente F6)
   Gráficos SVG feitos à mão: barras, linha, rosca, funil, calor e o
   diário do Ads (gasto × conversas). Sem dependências e sem imports.
   - A geometria é PURA (escala, ticks, caminhos, arcos) e é testada
     no Node (testes/relatorios.teste.mjs).
   - O desenho usa só createElementNS/textContent (nunca innerHTML) e
     só CLASSES de cor (as cores saem dos tokens do tema em
     relatorios.css); cor vinda do banco entra por --cor já validada.
   - Movimento: classes .g-anim (barras crescem, linha é "desenhada")
     com os tokens --t-dados/--e-out/--escada; nada disso com
     prefers-reduced-motion.
   - Acessível: <title> em cada marca, role="img" com resumo, e todo
     gráfico tem "Ver como tabela".
   ============================================================ */

/* ============================================================
   1. GEOMETRIA PURA
   ============================================================ */
const fin = v => v != null && Number.isFinite(v);

/** Escala linear [d0,d1] → [r0,r1]. Domínio vazio (d0 = d1) cai no começo do intervalo. */
export function escala([d0, d1], [r0, r1]) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = v => r0 + (v - d0) * k;
  f.inverter = y => (k ? d0 + (y - r0) / k : d0);
  return f;
}

/** Topo "bonito" do eixo: ~8% acima do máximo, em `n` degraus de valor inteiro (R$ 15/30/45/60). */
export function topoBonito(v, n = 4) {
  if (!(v > 0)) return n;
  const bruto = v * 1.08 / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p;
  // plano 1500c · RC-247: abaixo de 1 (taxas em fração) entra o degrau 2,5 — 0,9 vira eixo 0 · 0,25 · 0,5 · 0,75 · 1 (antes 0,3 · 0,6 · 0,9 · 1,2);
  // contagens (p ≥ 1) seguem só com degraus inteiros
  const degraus = p >= 10 ? [1, 1.2, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10] : p < 1 ? [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 10];
  const d = degraus.find(x => x >= r - 1e-9) * p;
  return Math.round(d * n * 1e6) / 1e6;
}
/** Marcas do eixo: 0, topo/n, …, topo. */
export function ticks(max, n = 4) {
  const topo = topoBonito(max, n);
  return Array.from({ length: n + 1 }, (_, k) => Math.round(topo * k / n * 1e6) / 1e6);
}

const f1 = v => (Math.round(v * 10) / 10).toString();
/** Traço reto por pontos [[x,y],…]. */
export function caminhoReto(p) {
  return p.length ? p.map((q, i) => `${i ? "L" : "M"}${f1(q[0])} ${f1(q[1])}`).join(" ") : "";
}
/** Traço suave (Catmull-Rom → Bézier), o mesmo "traco" do painel. */
export function caminhoSuave(p) {
  if (!p.length) return "";
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`;
  }
  return d;
}
/** Área fechada sob um traço, até a linha de base. */
export function caminhoArea(p, base, suave = true) {
  if (!p.length) return "";
  const t = suave ? caminhoSuave(p) : caminhoReto(p);
  return `${t} L${f1(p[p.length - 1][0])} ${f1(base)} L${f1(p[0][0])} ${f1(base)} Z`;
}

/** Ponto no círculo; ângulo 0 = topo, sentido horário. */
export function polar(cx, cy, r, a) { return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }
/** Fatia de rosca (anel) de a0 a a1 (radianos). Uma fatia de 100% vira dois meios-arcos. */
export function arcoAnel(cx, cy, r, r0, a0, a1) {
  const vol = a1 - a0;
  if (vol >= Math.PI * 2 - 1e-6) {
    const m = a0 + Math.PI;
    return `${arcoAnel(cx, cy, r, r0, a0, m)} ${arcoAnel(cx, cy, r, r0, m, a0 + Math.PI * 2)}`;
  }
  const g = vol > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  return `M${f1(x0)} ${f1(y0)} A${f1(r)} ${f1(r)} 0 ${g} 1 ${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} A${f1(r0)} ${f1(r0)} 0 ${g} 0 ${f1(x3)} ${f1(y3)} Z`;
}
/** Ângulos das fatias a partir dos valores (≤ 0 fica de fora); soma 0 → lista vazia. */
export function fatiasDe(valores, folga = 0) {
  const tot = valores.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (!tot) return [];
  let a = 0;
  return valores.map((v, i) => {
    if (!(v > 0)) return null;
    const vol = v / tot * Math.PI * 2, a0 = a;
    a += vol;
    const f = Math.min(folga, vol / 4);
    return { i, a0: a0 + f, a1: a - f, pct: v / tot * 100 };
  }).filter(Boolean);
}
/** Nível 0..n de uma célula do mapa de calor (0 só quando o valor é 0). */
export function nivelCalor(v, max, n = 5) {
  if (!(v > 0) || !(max > 0)) return 0;
  return Math.max(1, Math.min(n, Math.ceil(v / max * n)));
}
/** De quantos em quantos rótulos mostrar no eixo X para caber `cabem` rótulos. */
export const passoRotulo = (n, cabem) => Math.max(1, Math.ceil(n / Math.max(1, cabem)));
/**
 * Quais pontos ganham rótulo no eixo X: de `passo` em `passo` e o último (quando sobra mais da metade de um passo). Se o último ficaria
 * colado no rótulo anterior (o anterior é centrado, o último termina no fim do eixo), o ANTERIOR sai: dois textos nunca se sobrepõem.
 * `x(k)` = posição em px; `rotulos[k]` = o texto (a largura vem do comprimento, ~6,6 px por caractere nos 11–12 px do eixo).
 */
export function indicesRotulo(n, passo, x, rotulos) {
  const idx = [];
  for (let k = 0; k < n; k++) if (k % passo === 0) idx.push(k);
  if (n > 1 && (n - 1) % passo > passo / 2) {
    const larg = Math.max(...rotulos.slice(0, n).map(t => String(t ?? "").length), 1) * 6.6;
    const ant = idx[idx.length - 1];
    if (ant !== undefined && x(n - 1) - x(ant) < larg * 1.5 + 6) idx.pop();
    idx.push(n - 1);
  }
  return idx;
}
/** Barras agrupadas: posição e largura de cada barra da série `s` no grupo `g`. */
export function posBarra({ g, s, grupos, series, x0, largura, folga = .28 }) {
  const bw = largura / Math.max(1, grupos), dentro = bw * (1 - folga), w = dentro / Math.max(1, series);
  return { x: x0 + g * bw + bw * folga / 2 + s * w, w: Math.max(1, w - (series > 1 ? 2 : 0)) };
}

/* ============================================================
   2. DESENHO (DOM) — só roda no navegador
   ============================================================ */
/** ui.h do shell com três garantias: filhos nulos/listas achatados, `style` em texto só com
    variáveis CSS (aplicadas por setProperty) e attrs sempre objeto. Usado por anuncios.js,
    inicio.js e relatorios.js (os módulos recebem o ui pelo ctx). */
export function criarH(ui) {
  return (tag, attrs, ...filhos) => {
    const { style, ...resto } = attrs || {};
    if (style && typeof style === "object") resto.style = style;       // objeto {prop: valor}: o ui.h aplica
    const el = ui.h(tag, resto, ...filhos.flat(Infinity).filter(f => f != null && f !== false));
    if (typeof style === "string") for (const par of style.split(";")) {
      const i = par.indexOf(":");
      if (i > 0) el.style.setProperty(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
    return el;
  };
}
const NS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style") for (const [p, q] of Object.entries(v)) el.style.setProperty(p, q);
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(typeof f === "string" ? document.createTextNode(f) : f);
  return el;
}
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "style") for (const [p, q] of Object.entries(v)) el.style.setProperty(p, q);
    else if (k === "texto") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(typeof f === "string" ? document.createTextNode(f) : f);
  return el;
}
const titulo = t => s("title", {}, t);
/** plano 1500c · RC-241/RC-242: número com milhar e até 2 casas no padrão brasileiro («15.200», «2,5»). */
const FMT_NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const fmtInteiro = v => (fin(Number(v)) ? FMT_NUM.format(Math.round(Number(v))) : "0");
export const fmtNumero = v => (fin(Number(v)) ? FMT_NUM.format(Number(v)) : "—");
/**
 * plano 2000d · DR-308: o rótulo curto de um tick do eixo — de 10 mil em diante «120 mil» / «1,2 mi» (com «R$ » quando o formato da série é
 * dinheiro); abaixo disso, o próprio formato. textoEixoCurto(120000, v => `R$ ${v}`) → «R$ 120 mil».
 */
export function textoEixoCurto(v, fmt = fmtNumero) {
  const n = Number(v);
  const cheio = typeof fmt === "function" ? String(fmt(n)) : String(n);
  if (!fin(n) || Math.abs(n) < 1e4) return cheio;
  const um = x => FMT_NUM.format(Math.round(x * 10) / 10);
  const a = Math.abs(n), sinal = n < 0 ? "−" : "";
  const curto = a >= 1e9 ? `${um(a / 1e9)} bi` : a >= 1e6 ? `${um(a / 1e6)} mi` : `${um(a / 1e3)} mil`;
  return `${/^\s*R\$/.test(cheio) ? "R$ " : ""}${sinal}${curto}`;
}
const limpar = el => { while (el.firstChild) el.firstChild.remove(); };
const reduzido = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const corValida = c => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : null);

/** Liga o redesenho por largura (o SVG é medido em px reais: texto nunca estica). */
/** plano 1000b · RB-182: o gráfico grande segue a largura REAL do contêiner (mínimo 200 px; antes 260 fixo estourava o cartão de 2 colunas a 360 px). */
export const LARGURA_MIN_GRAFICO = 200;
export function larguraGrafico(clientWidth) { return Math.max(LARGURA_MIN_GRAFICO, Math.round(clientWidth || 640)); }
/**
 * plano 2000d · DR-310: UM ResizeObserver para todos os gráficos da página (antes um por gráfico: 10 blocos = 10 observadores). Cada alvo
 * registra a sua função; o alvo que saiu da página é solto sozinho. observarTamanho(alvo, fn) → desligar(). Sem ResizeObserver → nada.
 */
let roComum = null, roClasse = null;
const alvosRo = new Map();
export function observarTamanho(alvo, fn) {
  if (typeof ResizeObserver !== "function" || !alvo) return () => {};
  // outra implementação de ResizeObserver (troca de página, polyfill): começa de novo com ela
  if (roComum && roClasse !== ResizeObserver) { try { roComum.disconnect(); } catch { /* ok */ } roComum = null; alvosRo.clear(); }
  if (!roComum) {
    roClasse = ResizeObserver;
    roComum = new ResizeObserver(entradas => {
      const alvos = Array.isArray(entradas) && entradas.length ? entradas.map(e => e && e.target) : [...alvosRo.keys()];
      for (const t of alvos) {
        const f = alvosRo.get(t);
        if (!f) continue;
        // plano 1000b · RB-167: o gráfico saiu da página (a tela redesenhou): solta o nó antigo
        if (t.isConnected === false) { soltar(t); continue; }
        try { f(); } catch (err) { console.error(err); }
      }
    });
  }
  alvosRo.set(alvo, fn);
  roComum.observe(alvo);
  return () => soltar(alvo);
}
function soltar(alvo) {
  if (!alvosRo.has(alvo)) return;
  alvosRo.delete(alvo);
  try { if (roComum) roComum.unobserve(alvo); } catch { /* ok */ }
  if (!alvosRo.size && roComum) { try { roComum.disconnect(); } catch { /* ok */ } roComum = null; }
}
/** Liga o redesenho por largura (o SVG é medido em px reais: texto nunca estica). */
function responsivo(alvo, desenhar) {
  let w = 0, desligar = null;
  const rodar = anim => { const nw = larguraGrafico(alvo.clientWidth); w = nw; desenhar(nw, anim); };
  rodar(true);
  desligar = observarTamanho(alvo, () => { const nw = Math.round(alvo.clientWidth || 0); if (nw && Math.abs(nw - w) > 24) rodar(false); });
  return { destruir() { if (desligar) desligar(); desligar = null; }, redesenhar() { rodar(false); } };
}

/** plano 1000b · RB-186: o vazio dos gráficos de lista (funil, barras) — um texto, nunca o cartão em branco. */
export const TEXTO_SEM_DADOS = "Sem dados no período.";
function semDados() { return h("p", { class: "g-vazio fraco", role: "status", texto: TEXTO_SEM_DADOS }); }

/** Atraso da leitura em voz da dica (RB-261): segurar a seta não empilha um anúncio por passo. */
export const ATRASO_DICA_VIVA = 250;
/** Dica flutuante (visual, muda na hora) + região viva só para o leitor de tela, compartilhadas pelos gráficos com "trilho" (dia a dia).
    plano 1000b · RB-261: a dica visível deixou de ser role=status — percorrer 24 horas com a seta dava 24 anúncios encavalados; agora a região
    `.g-dica-viva` (sr-only) recebe o texto 250 ms depois do último passo (só o ponto onde a pessoa parou é lido). */
function trilho(caixa, { n, texto, aoMostrar, aoEsconder }) {
  const dica = h("div", { class: "g-dica", "aria-hidden": "true" });
  const viva = h("div", { class: "g-dica-viva sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  dica.hidden = true;
  caixa.append(dica, viva);
  let atual = -1, tFala = 0;
  const falar = t => { clearTimeout(tFala); tFala = setTimeout(() => { tFala = 0; viva.textContent = t; }, ATRASO_DICA_VIVA); };
  const mostrar = (k, x) => {
    k = Math.max(0, Math.min(n() - 1, k));
    atual = k;
    dica.textContent = texto(k);
    dica.hidden = false;
    falar(dica.textContent);
    const larg = caixa.clientWidth || 1, dw = dica.offsetWidth || 160;
    dica.style.setProperty("--x", `${Math.max(4, Math.min(larg - dw - 4, x - dw / 2))}px`);
    aoMostrar(k);
  };
  const esconder = () => { atual = -1; dica.hidden = true; clearTimeout(tFala); tFala = 0; aoEsconder(); };
  return { mostrar, esconder, get atual() { return atual; } };
}

/* ---------- 2.1 Diário do Ads: barras de gasto (Meta + Google) × linha de conversas (média 7 dias) ---------- */
/**
 * @param alvo   contêiner (.g-caixa é criado dentro)
 * @param o      {serie:[{i,meta,google,gasto,conv,convMedia}], anterior:[…|null], rotuloDia(i)→"dd/mm",
 *                diaLongo(i)→"seg · dd/mm", fmtGasto(v), fmtGastoCurto(v), fmtNum(v), resumo}
 */
export function grafDiario(alvo, o) {
  limpar(alvo);
  const caixa = h("div", { class: "g-caixa g-diario", tabindex: "0", role: "group", "aria-label": `${o.resumo}. Use as setas para ler dia a dia.` });
  alvo.append(caixa);
  let geo = null;
  const tr = trilho(caixa, {
    n: () => o.serie.length,
    texto: k => {
      const p = o.serie[k], a = o.anterior && o.anterior[k];
      const cpc = p.conv ? p.gasto / p.conv : null;
      return `${o.diaLongo(p.i)} — Meta ${o.fmtGasto(p.meta)} · Google ${o.fmtGasto(p.google)} · ${o.fmtNum(p.conv)} ${p.conv === 1 ? "conversa" : "conversas"}` +
        (fin(cpc) ? ` · ${o.fmtGasto(cpc)} por conversa` : "") + (a ? ` · 30 dias antes: ${o.fmtNum(a.conv)}` : "");
    },
    aoMostrar: k => {
      if (!geo) return;
      const x = geo.xc(k);
      geo.mira.setAttribute("x1", f1(x)); geo.mira.setAttribute("x2", f1(x)); geo.mira.removeAttribute("visibility");
      geo.ponto.setAttribute("cx", f1(x)); geo.ponto.setAttribute("cy", f1(geo.yc(o.serie[k].convMedia))); geo.ponto.removeAttribute("visibility");
      caixa.classList.add("g-foco");
      for (const r of geo.barras) r.classList.toggle("g-ativa", +r.dataset.k === k);
    },
    aoEsconder: () => {
      if (!geo) return;
      geo.mira.setAttribute("visibility", "hidden"); geo.ponto.setAttribute("visibility", "hidden");
      caixa.classList.remove("g-foco");
      for (const r of geo.barras) r.classList.remove("g-ativa");
    },
  });

  const desenhar = (W, anim) => {
    const velho = caixa.querySelector("svg");
    if (velho) velho.remove();
    const serie = o.serie, n = serie.length;
    const H = W < 560 ? 220 : 280;
    // plano 1000b · RB-182: abaixo de 260 px as margens encolhem (o eixo da direita ainda cabe) e o eixo X mostra menos rótulos
    const estreito = W < 260;
    const P = { l: estreito ? 38 : W < 560 ? 46 : 58, r: estreito ? 26 : 34, t: 14, b: 28 }, iw = W - P.l - P.r, ih = H - P.t - P.b, base = P.t + ih;
    const maxG = topoBonito(Math.max(1, ...serie.map(d => d.gasto)));
    const antes = (o.anterior || []).filter(Boolean);
    const maxC = Math.max(4, Math.ceil(Math.max(0, ...serie.map(d => d.convMedia), ...antes.map(d => d.convMedia)) * 1.1 / 4) * 4);
    const bw = iw / Math.max(1, n);
    const y = escala([0, maxG], [base, P.t]), yc = escala([0, maxC], [base, P.t]);
    const xc = k => P.l + k * bw + bw / 2;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": o.resumo, class: anim && !reduzido() ? "g-anim" : "" });
    const grade = s("g", { class: "g-grade", "aria-hidden": "true" });
    for (let k = 0; k <= 4; k++) {
      const v = maxG * k / 4, yy = y(v);
      grade.append(s("line", { x1: P.l, x2: W - P.r, y1: f1(yy), y2: f1(yy) }),
        s("text", { x: P.l - 8, y: f1(yy + 4), "text-anchor": "end" }, o.fmtGastoCurto(v)),
        s("text", { x: W - P.r + 8, y: f1(yy + 4), class: "g-eixo-dir" }, String(Math.round(maxC * k / 4))));
    }
    svg.append(grade);
    const barras = [], gB = s("g", { class: "g-barras" });
    serie.forEach((d, k) => {
      const x = P.l + k * bw + bw * .17, w = Math.max(1.5, bw * .66), rx = Math.min(3, w / 2);
      const t = `${o.rotuloDia(d.i)}: Meta ${o.fmtGasto(d.meta)}, Google ${o.fmtGasto(d.google)}`;
      if (d.meta > 0) { const r = s("rect", { class: "g-barra g-meta", x: f1(x), y: f1(y(d.meta)), width: f1(w), height: f1(base - y(d.meta)), rx, "data-k": k, style: { "--i": k } }, titulo(t)); barras.push(r); gB.append(r); }
      if (d.google > 0) { const r = s("rect", { class: "g-barra g-google", x: f1(x), y: f1(y(d.meta + d.google)), width: f1(w), height: f1(y(d.meta) - y(d.meta + d.google)), rx, "data-k": k, style: { "--i": k } }, titulo(t)); barras.push(r); gB.append(r); }
    });
    svg.append(gB);
    const pts = serie.map((d, k) => [xc(k), yc(d.convMedia)]);
    if (pts.length > 1) {
      svg.append(s("path", { class: "g-area g-s0", d: caminhoArea(pts, base) }));
      const ptsA = (o.anterior || []).map((d, k) => (d ? [xc(k), yc(d.convMedia)] : null)).filter(Boolean);
      if (ptsA.length > 1) svg.append(s("path", { class: "g-ant", d: caminhoSuave(ptsA) }, titulo("Conversas no período anterior (média de 7 dias)")));
      svg.append(s("path", { class: "g-linha g-s0", d: caminhoSuave(pts), pathLength: 1 }, titulo("Conversas no WhatsApp (média de 7 dias)")));
    }
    const passo = passoRotulo(n, estreito ? 3 : W < 560 ? 4 : 7), gX = s("g", { class: "g-eixo-x", "aria-hidden": "true" });
    serie.forEach((d, k) => { if (k % passo === 0) gX.append(s("text", { x: f1(xc(k)), y: H - 8, "text-anchor": "middle" }, o.rotuloDia(d.i))); });
    svg.append(gX);
    const mira = s("line", { class: "g-mira", x1: 0, x2: 0, y1: P.t, y2: base, visibility: "hidden" });
    const ponto = s("circle", { class: "g-ponto", r: 4.5, cx: -20, cy: -20, visibility: "hidden" });
    svg.append(mira, ponto);
    caixa.prepend(svg);
    geo = { xc, yc, mira, ponto, barras, P, bw, W };
    if (tr.atual >= 0) tr.mostrar(tr.atual, xc(tr.atual));
  };
  const ctl = responsivo(caixa, desenhar);

  const indice = e => {
    const svg = caixa.querySelector("svg");
    if (!svg || !geo) return -1;
    const r = svg.getBoundingClientRect(), k = r.width / geo.W;
    return Math.floor(((e.clientX - r.left) / k - geo.P.l) / geo.bw);
  };
  const ponteiro = e => {
    const k = indice(e);
    if (k < 0 || k >= o.serie.length) return tr.esconder();
    const r = caixa.getBoundingClientRect(), sv = caixa.querySelector("svg").getBoundingClientRect();
    tr.mostrar(k, geo.xc(k) * sv.width / geo.W + (sv.left - r.left));
  };
  caixa.addEventListener("pointermove", ponteiro);
  caixa.addEventListener("pointerdown", ponteiro);
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tr.esconder(); });
  caixa.addEventListener("blur", () => tr.esconder());
  caixa.addEventListener("keydown", e => {
    const ult = o.serie.length - 1, n = tr.atual;
    const mapa = { ArrowRight: n < 0 ? 0 : n + 1, ArrowLeft: n < 0 ? ult : n - 1, Home: 0, End: ult };
    if (e.key === "Escape") return tr.esconder();
    if (!(e.key in mapa) || !geo) return;
    e.preventDefault();
    const k = Math.max(0, Math.min(ult, mapa[e.key]));
    const sv = caixa.querySelector("svg").getBoundingClientRect(), r = caixa.getBoundingClientRect();
    tr.mostrar(k, geo.xc(k) * sv.width / geo.W + (sv.left - r.left));
  });
  return ctl;
}

/* ---------- 2.2 Linha (séries diárias: criados × ganhos, novas × resolvidas) ---------- */
/**
 * @param o {pontos:[{rotulo, longo, valores:[n…]}], series:[{nome, classe:'g-s0'…}], fmt(v), resumo}
 */
export function linha(alvo, o) {
  limpar(alvo);
  const caixa = h("div", { class: "g-caixa g-linhas", tabindex: "0", role: "group", "aria-label": `${o.resumo}. Use as setas para ler ponto a ponto.` });
  alvo.append(caixa, legenda(o.series));
  let geo = null;
  const tr = trilho(caixa, {
    n: () => o.pontos.length,
    texto: k => `${o.pontos[k].longo || o.pontos[k].rotulo} — ${o.series.map((se, j) => `${se.nome}: ${o.fmt(o.pontos[k].valores[j])}`).join(" · ")}`,
    aoMostrar: k => {
      if (!geo) return;
      const x = geo.x(k);
      geo.mira.setAttribute("x1", f1(x)); geo.mira.setAttribute("x2", f1(x)); geo.mira.removeAttribute("visibility");
      geo.pontos.forEach((c, j) => { c.setAttribute("cx", f1(x)); c.setAttribute("cy", f1(geo.y(o.pontos[k].valores[j] || 0))); c.removeAttribute("visibility"); });
    },
    aoEsconder: () => { if (!geo) return; geo.mira.setAttribute("visibility", "hidden"); geo.pontos.forEach(c => c.setAttribute("visibility", "hidden")); },
  });
  const desenhar = (W, anim) => {
    const velho = caixa.querySelector("svg");
    if (velho) velho.remove();
    const n = o.pontos.length, H = W < 560 ? 200 : 240;
    const estreito = W < 260;     // plano 1000b · RB-182
    const P = { l: estreito ? 34 : W < 560 ? 40 : 52, r: estreito ? 10 : 16, t: 14, b: 28 }, iw = W - P.l - P.r, ih = H - P.t - P.b, base = P.t + ih;
    const max = topoBonito(Math.max(1, ...o.pontos.flatMap(p => p.valores.map(v => v || 0))));
    const x = k => P.l + (n > 1 ? k / (n - 1) * iw : iw / 2), y = escala([0, max], [base, P.t]);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": o.resumo, class: anim && !reduzido() ? "g-anim" : "" });
    const grade = s("g", { class: "g-grade", "aria-hidden": "true" });
    ticks(Math.max(1, ...o.pontos.flatMap(p => p.valores.map(v => v || 0)))).forEach(v => {
      // plano 2000d · DR-308: sem fmtEixo próprio, o eixo usa a forma curta a partir de 10 mil («R$ 120 mil», não «R$ 120.000» espremido na margem)
      grade.append(s("line", { x1: P.l, x2: W - P.r, y1: f1(y(v)), y2: f1(y(v)) }), s("text", { x: P.l - 8, y: f1(y(v) + 4), "text-anchor": "end" }, o.fmtEixo ? o.fmtEixo(v) : textoEixoCurto(v, o.fmt)));
    });
    svg.append(grade);
    o.series.forEach((se, j) => {
      const pts = o.pontos.map((p, k) => [x(k), y(p.valores[j] || 0)]);
      if (j === 0 && pts.length > 1) svg.append(s("path", { class: `g-area ${se.classe}`, d: caminhoArea(pts, base, false) }));
      const d = pts.length > 1 ? caminhoReto(pts) : `M${f1(pts[0][0] - 3)} ${f1(pts[0][1])} L${f1(pts[0][0] + 3)} ${f1(pts[0][1])}`;
      svg.append(s("path", { class: `g-linha ${se.classe}`, d, pathLength: 1, style: { "--i": j * 4 } }, titulo(`${se.nome}: ${o.pontos.map(p => `${p.rotulo} ${o.fmt(p.valores[j])}`).slice(0, 60).join(", ")}`)));
    });
    const passo = passoRotulo(n, estreito ? 3 : W < 560 ? 4 : 7), gX = s("g", { class: "g-eixo-x", "aria-hidden": "true" });
    for (const k of indicesRotulo(n, passo, x, o.pontos.map(p => p.rotulo))) gX.append(s("text", { x: f1(x(k)), y: H - 8, "text-anchor": k === 0 ? "start" : k === n - 1 ? "end" : "middle" }, o.pontos[k].rotulo));
    svg.append(gX);
    const mira = s("line", { class: "g-mira", x1: 0, x2: 0, y1: P.t, y2: base, visibility: "hidden" });
    svg.append(mira);
    const pontos = o.series.map(se => { const c = s("circle", { class: `g-ponto ${se.classe}`, r: 4, cx: -20, cy: -20, visibility: "hidden" }); svg.append(c); return c; });
    caixa.prepend(svg);
    geo = { x, y, mira, pontos, P, W, iw, n };
  };
  const ctl = responsivo(caixa, desenhar);
  const idx = e => {
    const sv = caixa.querySelector("svg"); if (!sv || !geo) return -1;
    const r = sv.getBoundingClientRect(), k = r.width / geo.W, px = (e.clientX - r.left) / k - geo.P.l;
    return geo.n > 1 ? Math.round(px / geo.iw * (geo.n - 1)) : 0;
  };
  const px = k => { const sv = caixa.querySelector("svg").getBoundingClientRect(), r = caixa.getBoundingClientRect(); return geo.x(k) * sv.width / geo.W + (sv.left - r.left); };
  const ponteiro = e => { const k = idx(e); if (k < 0 || k >= o.pontos.length) return tr.esconder(); tr.mostrar(k, px(k)); };
  caixa.addEventListener("pointermove", ponteiro);
  caixa.addEventListener("pointerdown", ponteiro);
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tr.esconder(); });
  caixa.addEventListener("blur", () => tr.esconder());
  caixa.addEventListener("keydown", e => {
    const ult = o.pontos.length - 1, n = tr.atual;
    const mapa = { ArrowRight: n < 0 ? 0 : n + 1, ArrowLeft: n < 0 ? ult : n - 1, Home: 0, End: ult };
    if (e.key === "Escape") return tr.esconder();
    if (!(e.key in mapa) || !geo) return;
    e.preventDefault();
    const k = Math.max(0, Math.min(ult, mapa[e.key]));
    tr.mostrar(k, px(k));
  });
  return ctl;
}

function legenda(series) {
  return h("ul", { class: "g-legenda", "aria-hidden": "true" },
    series.map(se => h("li", {}, h("i", { class: `g-marca ${se.classe}${se.tracejada ? " g-tracejada" : ""}` }), se.nome)));
}

/* ---------- 2.3 Barras horizontais agrupadas (origem: criados × ganhos; departamento; número) ---------- */
/** Posição de um elemento dentro da caixa (px), para a dica apontar para a linha/célula certa mesmo com rolagem interna. */
function posNaCaixa(caixa, el) {
  try {
    const c = caixa.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top };
  } catch { return { x: 0, y: 0 }; }
}
/**
 * @param o {itens:[{rotulo, valores:[…], extra?}], series:[{nome, classe}], fmt(v), resumo}
 * A dica (plano 50 · A2) aparece ao passar o mouse e no foco de teclado: ↑ ↓ (ou ← →) percorrem as linhas, Home/End vão às pontas, Esc fecha;
 * o texto também vai para a região aria-live da própria dica.
 */
export function barras(alvo, o) {
  limpar(alvo);
  // plano 1000b · RB-186: sem itens, o texto do vazio (antes um <ul> vazio e o cartão em branco)
  if (!Array.isArray(o.itens) || !o.itens.length) { alvo.append(semDados()); return { destruir() {}, mostrar() {}, esconder() {} }; }
  const max = Math.max(1, ...o.itens.flatMap(it => it.valores.map(v => v || 0)));
  const caixa = h("div", { class: "g-caixa g-hcaixa", tabindex: "0", role: "group", "aria-label": `${o.resumo}. Use as setas para ler linha a linha.` });
  const lista = h("ul", { class: "g-hbarras", role: "list", "aria-label": o.resumo });
  const linhas = [];
  o.itens.forEach((it, n) => {
    const li = h("li", { class: "g-hitem", style: { "--i": n }, "data-k": n },
      h("span", { class: "g-hrot" }, h("span", { class: "g-hnome", texto: it.rotulo }), it.extra ? h("span", { class: "g-hextra", texto: it.extra }) : null));
    const trilhos = h("span", { class: "g-htrilhos" });
    it.valores.forEach((v, j) => {
      const pct = Math.max(v > 0 ? 1.5 : 0, (v || 0) / max * 100);
      trilhos.append(h("span", { class: "g-htrilho", title: `${o.series[j].nome}: ${o.fmt(v)}` },
        h("span", { class: `g-hbarra ${o.series[j].classe}`, style: { "--w": `${pct.toFixed(2)}%`, "--i": n } }),
        h("span", { class: "g-hval", texto: o.fmt(v) }),
        h("span", { class: "sr-only", texto: ` ${o.series[j].nome}` })));
    });
    li.append(trilhos);
    lista.append(li);
    linhas.push(li);
  });
  if (!reduzido()) lista.classList.add("g-anim");
  caixa.append(lista);
  const tr = trilho(caixa, {
    n: () => o.itens.length,
    texto: k => { const it = o.itens[k]; return `${it.rotulo}${it.extra ? ` (${it.extra})` : ""} — ${o.series.map((se, j) => `${se.nome}: ${o.fmt(it.valores[j])}`).join(" · ")}`; },
    aoMostrar: k => { linhas.forEach((li, i) => li.classList.toggle("g-ativa", i === k)); caixa.classList.add("g-foco"); },
    aoEsconder: () => { linhas.forEach(li => li.classList.remove("g-ativa")); caixa.classList.remove("g-foco"); },
  });
  const mostrarLinha = k => { const li = linhas[k]; if (!li) return; const p = posNaCaixa(caixa, li); caixa.style.setProperty("--y", `${Math.round(p.y)}px`); tr.mostrar(k, p.x); };
  const aoPonteiroB = e => { const li = e.target && e.target.closest ? e.target.closest(".g-hitem") : null; if (!li) return tr.esconder(); mostrarLinha(+li.dataset.k); };
  caixa.addEventListener("pointermove", aoPonteiroB);
  // plano 2000d · DR-275: no toque (sem hover) tocar numa barra fixa a dica — e ela fica até tocar fora (o pointerleave do toque não esconde)
  caixa.addEventListener("pointerdown", aoPonteiroB);
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tr.esconder(); });
  caixa.addEventListener("blur", () => tr.esconder());
  caixa.addEventListener("keydown", e => {
    const ult = o.itens.length - 1, n = tr.atual;
    const mapa = { ArrowDown: n < 0 ? 0 : n + 1, ArrowRight: n < 0 ? 0 : n + 1, ArrowUp: n < 0 ? ult : n - 1, ArrowLeft: n < 0 ? ult : n - 1, Home: 0, End: ult };
    if (e.key === "Escape") return tr.esconder();
    if (!(e.key in mapa) || ult < 0) return;
    e.preventDefault();
    mostrarLinha(Math.max(0, Math.min(ult, mapa[e.key])));
  });
  alvo.append(...[caixa, o.series.length > 1 ? legenda(o.series) : null].filter(Boolean));
  return { destruir() { tr.esconder(); }, mostrar: mostrarLinha, esconder: () => tr.esconder() };
}

/* ---------- 2.4 Rosca (motivos de perda) ---------- */
/** @param o {fatias:[{rotulo, valor, extra}], fmt(v), centro:{valor, rotulo}, resumo} */
export function rosca(alvo, o) {
  limpar(alvo);
  const tam = 200, cx = 100, cy = 100, r = 92, r0 = 62;
  const fs = fatiasDe(o.fatias.map(f => f.valor), .012);
  const svg = s("svg", { viewBox: `0 0 ${tam} ${tam}`, class: `g-rosca${reduzido() ? "" : " g-anim"}`, role: "img", "aria-label": o.resumo });
  svg.append(s("circle", { class: "g-trilho", cx, cy, r: (r + r0) / 2, "stroke-width": r - r0, fill: "none" }));
  fs.forEach((f, n) => {
    const it = o.fatias[f.i];
    svg.append(s("path", { class: `g-fatia g-c${f.i % 8}`, d: arcoAnel(cx, cy, r, r0, f.a0, f.a1), style: { "--i": n } },
      titulo(`${it.rotulo}: ${o.fmt(it.valor)} (${Math.round(f.pct)}%)`)));
  });
  if (o.centro) {
    svg.append(s("text", { class: "g-rosca-n", x: cx, y: cy + 4, "text-anchor": "middle" }, String(o.centro.valor)),
      s("text", { class: "g-rosca-l", x: cx, y: cy + 24, "text-anchor": "middle" }, o.centro.rotulo));
  }
  const leg = h("ul", { class: "g-rosca-leg" });
  o.fatias.forEach((it, i) => {
    const f = fs.find(x => x.i === i);
    leg.append(h("li", {}, h("i", { class: `g-marca g-c${i % 8}` }), h("span", { class: "g-rl-nome", texto: it.rotulo }),
      h("b", { texto: `${o.fmt(it.valor)}${f ? ` · ${Math.round(f.pct)}%` : ""}` }), it.extra ? h("small", { texto: it.extra }) : null));
  });
  const caixaR = h("div", { class: "g-rosca-caixa" }, svg, leg);
  alvo.append(caixaR);
  tabelaDaRosca(alvo, caixaR, o, fs);      // plano 2000d · DR-306
  return { destruir() {} };
}

/**
 * plano 2000d · DR-306: `tabela: true` na rosca/donut — «Ver como tabela» com rótulo, valor e % (como as linhas e barras já tinham). Quem monta
 * a sua tabela por fora (Relatórios: motivos de perda) não passa a opção. Devolve o botão ou null.
 */
function tabelaDaRosca(alvo, caixa, o, fs) {
  if (!o || o.tabela !== true || !Array.isArray(o.fatias) || !o.fatias.length) return null;
  const rod = h("div", { class: "g-rodape" });
  alvo.append(rod);
  return alternarTabela(rod, caixa, { colunas: [o.colunaRotulo || "Item", o.colunaValor || "Valor", "%"],
    linhas: o.fatias.map((it, i) => { const f = (fs || []).find(x => x.i === i); return [String(it.rotulo ?? ""), o.fmt(Number(it.valor) || 0), f ? `${Math.round(f.pct)}%` : "0%"]; }),
    legenda: o.resumo });
}

/* ---------- 2.5 Funil horizontal por etapa ---------- */
/** Taxa entre duas etapas vizinhas em texto («62% da etapa anterior»); null quando não dá para calcular (sem inventar). */
export function taxaEntreEtapas(qtd, anterior) {
  if (!(anterior > 0) || !fin(qtd)) return null;
  const p = Math.max(0, qtd) / anterior * 100;
  return { pct: p, texto: `${p >= 10 || p === 0 ? Math.round(p) : (Math.round(p * 10) / 10).toString().replace(".", ",")}% da etapa anterior` };
}
/** @param o {etapas:[{nome, cor, qtd, valorTxt, conversao (texto)|null, tipo}], resumo, taxas?: true}
    Sem `conversao` na etapa, a taxa entre etapas vizinhas é calculada das próprias quantidades (plano 50 · A3); `taxas: false` desliga. */
export function funil(alvo, o) {
  limpar(alvo);
  if (!Array.isArray(o.etapas) || !o.etapas.length) { alvo.append(semDados()); return { destruir() {} }; }     // plano 1000b · RB-186
  const max = Math.max(1, ...o.etapas.map(e => e.qtd || 0));
  const lista = h("ol", { class: `g-funil${reduzido() ? "" : " g-anim"}`, "aria-label": o.resumo });
  o.etapas.forEach((e, n) => {
    const cor = corValida(e.cor);
    const pct = Math.max(e.qtd > 0 ? 3 : 0, (e.qtd || 0) / max * 100);
    const ant = n > 0 ? o.etapas[n - 1] : null;
    // só entre etapas ABERTAS vizinhas: «ganho»/«perdido» não vêm da etapa anterior (9 ganhos ÷ 1 em orçamento daria «900%»)
    const sequencial = ant && (e.tipo || "aberto") === "aberto" && (ant.tipo || "aberto") === "aberto";
    const taxa = e.conversao ? null : (o.taxas !== false && sequencial ? taxaEntreEtapas(e.qtd || 0, ant.qtd || 0) : null);
    const convTxt = e.conversao || (taxa ? taxa.texto : "");
    // plano 1000 (pedido de Relatórios): `etapa.dica` explica a conversão (ex.: taxa acima de 100% porque entraram negócios direto na etapa) —
    // vira a dica do valor (title + data-dica do ui.ligarDicas) e uma descrição para o leitor de tela
    const dica = typeof e.dica === "string" && e.dica.trim() ? e.dica.trim().slice(0, 240) : null;
    // plano 1500c · RC-341: `etapa.href` (só «#/…», nada externo) faz o nome da etapa virar link — tocar em «Ganhas» abre quem ganhou
    const href = typeof e.href === "string" && /^#\//.test(e.href) ? e.href : null;
    const nomeEl = h("span", { texto: e.nome });
    // plano 1500c · RC-243: a dica da taxa (acima de 100%) ganha um «i» que abre no toque — antes só title (mouse) e sr-only
    const btDica = dica ? h("button", { type: "button", class: "g-fdica-bt", "aria-label": `Por que «${convTxt}»?`, "aria-expanded": "false", texto: "i" }) : null;
    const textoDica = dica ? h("span", { class: "g-fdica-txt", role: "note", texto: dica }) : null;
    if (btDica) {
      textoDica.hidden = true;
      btDica.addEventListener("click", ev => { if (ev && ev.preventDefault) ev.preventDefault(); const abrir = textoDica.hidden; textoDica.hidden = !abrir; btDica.setAttribute("aria-expanded", String(abrir)); });
    }
    // plano 2000d · DR-403: etapa com 0 não some — classe g-fzero (o CSS mostra o trilho vazio marcado) e «nenhum» para o leitor de tela
    const zero = !(Number(e.qtd) > 0);
    const li = h("li", { class: `g-fetapa g-f-${e.tipo || "aberto"}${href ? " g-fetapa-link" : ""}${zero ? " g-fzero" : ""}`, style: { "--i": n }, ...(zero ? { "data-zero": "1" } : {}) },
      h("span", { class: "g-fnome" }, h("i", { class: "g-fcor", style: cor ? { "--cor": cor } : {} }), href ? h("a", { class: "g-flink", href, "aria-label": `Abrir ${e.nome}: ${typeof o.fmtQtd === "function" ? o.fmtQtd(e.qtd || 0) : fmtInteiro(e.qtd || 0)}` }, nomeEl) : nomeEl),     // plano 1500c · IC-017: o link diz quantos abre
      h("span", { class: "g-ftrilho" }, h("span", { class: "g-fbarra", style: { "--w": `${pct.toFixed(2)}%`, ...(cor ? { "--cor": cor } : {}) } }),
        // plano 1500c · RC-241: «1.500», não «1500» (o.fmtQtd quando a tela quiser outro formato)
        h("span", { class: "g-fqtd", texto: typeof o.fmtQtd === "function" ? o.fmtQtd(e.qtd || 0) : fmtInteiro(e.qtd || 0) })),
      h("span", { class: "g-fvalor", texto: e.valorTxt || "" }),
      h("span", { class: `g-fconv${taxa ? " g-fconv-taxa" : ""}${dica ? " g-fconv-dica" : ""}`, texto: convTxt, ...(taxa ? { "data-taxa": String(Math.round(taxa.pct)) } : {}),
        ...(dica ? { title: dica, "data-dica": dica } : {}) }),
      btDica, textoDica,
      dica ? h("span", { class: "sr-only", texto: `(${dica})` }) : null,
      zero ? h("span", { class: "sr-only", texto: "(nenhum nesta etapa)" }) : null);
    lista.append(li);
  });
  alvo.append(lista);
  return { destruir() {} };
}

/* ---------- 2.6 Mapa de calor 7 × 24 ---------- */
/** Plano 100 · A12: de quantas em quantas horas o eixo mostra rótulo — 1 quando há espaço (≥ 22 px por coluna: desktop), 3 no celular. `largura` em px (0 = desconhecida). */
export function passoHorasCalor(largura, celular = false) {
  if (largura > 0) return largura >= 24 * 22 ? 1 : 3;
  return celular ? 3 : 1;
}
/** @param o {matriz:[7][24] números (0 = domingo), dias:['dom',…], fmt(v), resumo, passoHoras?: 1 | 3}
    Dica (plano 50 · A2): mouse sobre a célula ou teclado — ← → mudam a hora, ↑ ↓ o dia, Home/End as pontas, Esc fecha — com aria-live.
    Rótulos de hora (plano 100 · A12): `passoHoras` 1 ou 3; sem ele, decide pela largura do alvo (1 h no desktop, 3 h no celular). */
export function calor(alvo, o) {
  limpar(alvo);
  // plano 1000b · RB-184: matriz incompleta (dia faltando, linha curta) conta 0 — antes o[d][hr] de uma linha ausente lançava TypeError
  const valorCalor = (d, hr) => (Array.isArray(o.matriz) && Array.isArray(o.matriz[d]) ? +o.matriz[d][hr] || 0 : 0);
  const max = Math.max(0, ...[0, 1, 2, 3, 4, 5, 6].flatMap(d => Array.from({ length: 24 }, (_, hr) => valorCalor(d, hr))));
  const celular = typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;
  const passo = o.passoHoras === 1 || o.passoHoras === 3 ? o.passoHoras : passoHorasCalor(Number(alvo && alvo.clientWidth) || 0, celular);
  const grade = h("div", { class: `g-calor${reduzido() ? "" : " g-anim"}`, role: "img", "aria-label": o.resumo, "data-passo-horas": passo });
  grade.append(h("span", { class: "g-cal-canto", "aria-hidden": "true" }));
  for (let hr = 0; hr < 24; hr++) grade.append(h("span", { class: "g-cal-h", "aria-hidden": "true", texto: hr % passo === 0 ? String(hr).padStart(2, "0") : "" }));
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // semana começando na segunda
  const celulas = [];                      // [linha][hora] → célula (linha 0 = segunda)
  ordem.forEach((d, lin) => {
    grade.append(h("span", { class: "g-cal-d", "aria-hidden": "true", texto: o.dias[d] }));
    celulas.push([]);
    for (let hr = 0; hr < 24; hr++) {
      const v = valorCalor(d, hr);
      const c = h("span", { class: `g-cal-c g-n${nivelCalor(v, max)}`, title: `${o.dias[d]} ${String(hr).padStart(2, "0")}h: ${o.fmt(v)}`, style: { "--i": lin * 3 + Math.floor(hr / 4) }, "data-l": lin, "data-h": hr });
      celulas[lin].push(c);
      grade.append(c);
    }
  });
  const esc = h("div", { class: "g-cal-escala", "aria-hidden": "true" }, h("span", { texto: "menos" }),
    ...[0, 1, 2, 3, 4, 5].map(k => h("i", { class: `g-cal-c g-n${k}` })), h("span", { texto: "mais" }));
  const caixa = h("div", { class: "g-caixa g-calcaixa", tabindex: "0", role: "group", "aria-label": `${o.resumo}. Use as setas para ler dia e hora.` },
    h("div", { class: "g-cal-rolagem" }, grade), esc);
  let atual = -1;   // índice linear lin * 24 + hr
  const tr = trilho(caixa, {
    n: () => 7 * 24,
    texto: k => { const lin = Math.floor(k / 24), hr = k % 24, d = ordem[lin]; return `${o.dias[d]} ${String(hr).padStart(2, "0")}h: ${o.fmt(valorCalor(d, hr))}`; },
    aoMostrar: k => { if (atual >= 0) celulas[Math.floor(atual / 24)][atual % 24].classList.remove("g-ativa"); atual = k; celulas[Math.floor(k / 24)][k % 24].classList.add("g-ativa"); },
    aoEsconder: () => { if (atual >= 0) celulas[Math.floor(atual / 24)][atual % 24].classList.remove("g-ativa"); atual = -1; },
  });
  const celulaMaior = () => {
    let melhor = { lin: 0, hr: 8, v: 0 };
    ordem.forEach((d, lin) => { for (let hr = 0; hr < 24; hr++) { const v = valorCalor(d, hr); if (v > melhor.v) melhor = { lin, hr, v }; } });
    return melhor;
  };
  const mostrarCelula = (lin, hr) => {
    lin = Math.max(0, Math.min(6, lin)); hr = Math.max(0, Math.min(23, hr));
    const c = celulas[lin][hr], p = posNaCaixa(caixa, c);
    caixa.style.setProperty("--y", `${Math.round(p.y)}px`);
    tr.mostrar(lin * 24 + hr, p.x);
  };
  const aoPonteiroC = e => { const c = e.target && e.target.closest ? e.target.closest(".g-calor .g-cal-c") : null; if (!c) return tr.esconder(); mostrarCelula(+c.dataset.l, +c.dataset.h); };
  caixa.addEventListener("pointermove", aoPonteiroC);
  caixa.addEventListener("pointerdown", aoPonteiroC);     // plano 2000d · DR-275: o toque fixa a dica da célula
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tr.esconder(); });
  caixa.addEventListener("blur", () => tr.esconder());
  caixa.addEventListener("keydown", e => {
    if (e.key === "Escape") return tr.esconder();
    // plano 1500c · RC-244: a 1ª seta começa na célula de MAIOR valor (antes segunda 8h fixo — fora do horário de quem abre às 7h ou no sábado)
    const inicio = celulaMaior();
    const lin = atual < 0 ? inicio.lin : Math.floor(atual / 24), hr = atual < 0 ? inicio.hr : atual % 24;
    const mapa = { ArrowRight: [lin, hr + 1], ArrowLeft: [lin, hr - 1], ArrowDown: [lin + 1, hr], ArrowUp: [lin - 1, hr], Home: [lin, 0], End: [lin, 23] };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    if (atual < 0 && e.key !== "Home" && e.key !== "End") return mostrarCelula(lin, hr);
    mostrarCelula(...mapa[e.key]);
  });
  alvo.append(caixa);
  // plano 2000d · DR-307: `tabela: true` — a mesma matriz em tabela (dia × hora) com «Ver como tabela», para o leitor de tela que não entra
  // na grade (role=img); quem já monta a sua tabela por fora (Relatórios) não passa a opção
  if (o.tabela === true) {
    const rod = h("div", { class: "g-rodape" });
    alvo.append(rod);
    alternarTabela(rod, caixa, { colunas: ["Dia", ...Array.from({ length: 24 }, (_, hr) => `${String(hr).padStart(2, "0")}h`)],
      linhas: ordem.map(d => [o.dias[d], ...Array.from({ length: 24 }, (_, hr) => o.fmt(valorCalor(d, hr)))]), legenda: o.resumo });
  }
  // plano 1500c · RC-304: girar o celular/redimensionar troca o passo das horas (1 ↔ 3) sem redesenhar a grade; só quando a tela não fixou o passo
  let ro = null;
  const rotulosH = [...grade.querySelectorAll(".g-cal-h")];
  const aplicarPasso = p => { grade.setAttribute("data-passo-horas", p); rotulosH.forEach((el, hr) => { el.textContent = hr % p === 0 ? String(hr).padStart(2, "0") : ""; }); };
  if (!(o.passoHoras === 1 || o.passoHoras === 3) && typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => {
      if (alvo.isConnected === false) { if (ro) ro.disconnect(); ro = null; return; }
      const w = Number(alvo.clientWidth) || 0;
      if (!w) return;
      const p = passoHorasCalor(w, false);
      if (String(p) !== grade.getAttribute("data-passo-horas")) aplicarPasso(p);
    });
    ro.observe(alvo);
  }
  return { destruir() { tr.esconder(); if (ro) ro.disconnect(); ro = null; }, mostrar: mostrarCelula, esconder: () => tr.esconder(), passo: p => aplicarPasso(p === 1 ? 1 : 3) };
}

/* ---------- 2.7 "Ver como tabela" (alternativa acessível de todo gráfico) ---------- */
/**
 * Cartão com o gráfico e um botão que alterna para uma tabela com os mesmos números.
 * @param o {colunas:[rótulos], linhas:[[células texto]], legenda: texto da <caption>}
 */
export function alternarTabela(rodape, alvoGrafico, o) {
  const tabela = h("div", { class: "g-tabela-caixa" });
  tabela.hidden = true;
  const t = h("table", { class: "g-tabela" }, h("caption", { class: "sr-only", texto: o.legenda || "" }),
    h("thead", {}, h("tr", {}, o.colunas.map((c, j) => h("th", { scope: "col", class: j ? "num" : "", texto: c })))),
    h("tbody", {}, o.linhas.map(l => h("tr", {}, l.map((c, j) => h(j ? "td" : "th", j ? { class: "num", texto: c } : { scope: "row", texto: c }))))));
  tabela.append(t);
  // plano 1000b · RB-181: o texto troca («Ver como gráfico») e por isso NÃO há aria-pressed — os dois juntos davam «Ver como gráfico,
  // pressionado» (estado incoerente). O nome diz a ação seguinte; data-modo guarda o que está à vista para quem precisar ler.
  const btn = h("button", { type: "button", class: "g-ver-tabela", "data-modo": "grafico" }, "Ver como tabela");
  // plano 1500c · RC-245: a tabela recebe o foco quando aparece (o leitor anuncia a tabela, não fica no botão sem saber do que mudou)
  t.setAttribute("tabindex", "-1");
  // plano 1500c · RC-246: «Copiar tabela» (colunas separadas por tabulação: cola certo no Excel/Planilhas) — só com a tabela à vista
  const btCopiar = h("button", { type: "button", class: "g-copiar-tabela", "aria-label": `Copiar a tabela${o.legenda ? `: ${o.legenda}` : ""}` }, "Copiar tabela");
  btCopiar.hidden = true;
  btCopiar.addEventListener("click", () => copiarTexto(tabelaTsv(o.colunas, o.linhas), btCopiar));
  btn.addEventListener("click", () => {
    const ligado = tabela.hidden;
    tabela.hidden = !ligado;
    alvoGrafico.hidden = ligado;
    btCopiar.hidden = !ligado;
    btn.setAttribute("data-modo", ligado ? "tabela" : "grafico");
    btn.textContent = ligado ? "Ver como gráfico" : "Ver como tabela";
    if (ligado && typeof t.focus === "function") { try { t.focus({ preventScroll: true }); } catch { t.focus(); } }
  });
  alvoGrafico.after(tabela);
  rodape.append(btn, btCopiar);
  return btn;
}
/** plano 1500c · RC-246: a tabela em texto TSV (tabulação entre colunas, quebra entre linhas; tabulação/quebra dentro da célula vira espaço). */
export function tabelaTsv(colunas = [], linhas = []) {
  const cel = v => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [colunas, ...linhas].map(l => (Array.isArray(l) ? l : []).map(cel).join("\t")).join("\n");
}
/** Copia para a área de transferência (navigator.clipboard) e diz no próprio botão «Copiada» por 2 s; sem clipboard, «Não deu para copiar». */
function copiarTexto(texto, bt) {
  const rotulo = bt.textContent;
  const dizer = t => { bt.textContent = t; setTimeout(() => { bt.textContent = rotulo; }, 2000); };
  try {
    const cb = typeof navigator !== "undefined" && navigator && navigator.clipboard;
    if (!cb || typeof cb.writeText !== "function") { dizer("Não deu para copiar"); return Promise.resolve(false); }
    return cb.writeText(texto).then(() => { dizer("Copiada"); return true; }, () => { dizer("Não deu para copiar"); return false; });
  } catch { dizer("Não deu para copiar"); return Promise.resolve(false); }
}

/* ---------- 2.8 Números que contam (odômetro simples) ---------- */
/** Lê a duração do tema, mas não anima quando a aba está oculta ou o usuário reduz movimento. */
export function duracaoToken(nome) {
  if (typeof document === "undefined" || document.hidden || typeof getComputedStyle !== "function" || reduzido()) return 0;
  // plano 1000b · RB-185: o valor fica guardado — o Início anima dezenas de números por desenho e cada um relia o estilo do documento.
  // O guardado vale enquanto o tema não muda (mesmo <html>, mesma função de estilo e os mesmos class/style/data-* do <html>).
  const raizDoc = document.documentElement, assin = assinaturaTema(raizDoc);
  if (!cacheDuracao || cacheDuracao.raiz !== raizDoc || cacheDuracao.gcs !== getComputedStyle || cacheDuracao.assin !== assin) {
    cacheDuracao = { raiz: raizDoc, gcs: getComputedStyle, assin, valores: new Map() };
  }
  if (cacheDuracao.valores.has(nome)) return cacheDuracao.valores.get(nome);
  const bruto = String(getComputedStyle(raizDoc).getPropertyValue(nome) || "").trim();
  const m = bruto.match(/^([\d.]+)\s*(ms|s)$/i);
  const ms = m ? Number(m[1]) * (m[2].toLowerCase() === "s" ? 1000 : 1) : 0;
  const v = Number.isFinite(ms) ? Math.max(0, Math.min(2000, ms)) : 0;
  cacheDuracao.valores.set(nome, v);
  return v;
}
let cacheDuracao = null;
/** O que muda quando o tema/marca/movimento muda no <html> (sem ler estilo computado). */
export function assinaturaTema(el) {
  try {
    if (!el || typeof el.getAttribute !== "function") return "";
    const nomes = el.getAttributeNames ? el.getAttributeNames().filter(n => n === "class" || n === "style" || n.startsWith("data-")) : ["class", "style", "data-tema", "data-esquema"];
    // revisão 1000b · RB-185: a preferência de movimento do sistema muda o token (--t-dados em @media reduce) sem tocar no <html>
    let menos = "";
    try { menos = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0"; } catch { menos = ""; }
    return nomes.map(n => `${n}=${el.getAttribute(n) || ""}`).join("|") + `|rm=${menos}`;
  } catch { return ""; }
}

/** Anima um valor visível e mantém seu equivalente acessível completo, encerrando no valor exato ao ocultar a aba.
    Uma contagem nova no MESMO elemento para a anterior sem pintá-la (senão o rAF velho terminava escrevendo o valor antigo por cima);
    quem escreve o número sem contar chama antes `el.__pararContagem()`. */
export function animarValor(el, valor, pintar, acessivel = String(valor)) {
  if (typeof el.__pararContagem === "function") el.__pararContagem();
  const final = () => { pintar(valor); el.setAttribute?.("aria-label", acessivel); };
  el.setAttribute?.("aria-label", acessivel);
  const dur = duracaoToken("--t-dados");
  if (!dur || !fin(valor) || valor === 0 || typeof requestAnimationFrame !== "function") { final(); return el; }
  let ativo = true, frame = 0;
  // plano 2000d · DR-404: aria-label num elemento sem papel (<b>, <span>) é ignorado — o leitor lia «0… 1.200… 15.200» a cada quadro. Durante a
  // contagem o número fica aria-hidden e um sr-only ao lado diz o valor final; no fim os dois saem e o número volta a ser lido
  let sombra = null;
  const tinhaOculto = typeof el.getAttribute === "function" ? el.getAttribute("aria-hidden") : null;
  if (typeof el.setAttribute === "function" && typeof el.after === "function" && typeof document !== "undefined" && document.createElement && !el.getAttribute?.("role") && tinhaOculto !== "true") {
    sombra = document.createElement("span");
    sombra.className = "sr-only g-contando";
    sombra.textContent = acessivel;
    el.setAttribute("aria-hidden", "true");
    try { el.after(sombra); } catch { sombra = null; el.removeAttribute?.("aria-hidden"); }
  }
  const limpar = () => {
    if (!ativo) return false;
    ativo = false;
    if (sombra) { sombra.remove(); sombra = null; if (tinhaOculto === null) el.removeAttribute?.("aria-hidden"); else el.setAttribute("aria-hidden", tinhaOculto); }
    if (el.__pararContagem === limpar) el.__pararContagem = null;
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    document.removeEventListener?.("visibilitychange", visibilidade);
    return true;
  };
  el.__pararContagem = limpar;
  const concluir = () => { if (limpar()) final(); };
  const visibilidade = () => { if (document.hidden) concluir(); };
  document.addEventListener?.("visibilitychange", visibilidade);
  const t0 = performance.now();
  const passo = t => {
    if (!ativo) return;
    // fora da página (montado antes de entrar no DOM, ou já removido): termina no valor final — nunca fica «0»
    if (!el.isConnected) { if (limpar()) final(); return; }
    const p = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);   // o 1º quadro pode vir com t < t0: nada de «-0»
    const v = p < 1 ? valor * e : valor;
    pintar(Number.isInteger(valor) ? Math.round(v) : v);   // inteiro conta em inteiros (sem «15,305» no meio)
    if (p < 1) frame = requestAnimationFrame(passo);
    else { limpar(); final(); }
  };
  pintar(0);
  frame = requestAnimationFrame(passo);
  return el;
}

/** O rótulo de acessibilidade anuncia o valor final; o odômetro visível termina mesmo ao suspender a aba. */
export function contar(el, valor, fmt) { return animarValor(el, valor, n => { el.textContent = fmt(n); }, fmt(valor)); }

/* ---------- 2.9 Resposta ao dado: o número que mudou acende ---------- */
/** G.destacar(el) — flash de 600 ms em --c-prim-suave (classe .destaque do app.css) quando um número muda de valor.
    Sem flash com movimento reduzido; chamar de novo no meio reinicia o flash. Devolve o próprio elemento. */
export function destacar(el) {
  if (!el || !el.classList || reduzido()) return el;
  el.classList.remove("destaque");
  void el.offsetWidth;                      // força o recálculo de estilo para a animação recomeçar
  el.classList.add("destaque");
  clearTimeout(el.__destaqueT);
  el.__destaqueT = setTimeout(() => el.classList.remove("destaque"), 620);
  return el;
}

/* ============================================================
   3. PLANO 50 (04/10/2026) — frente A: sparkline e rosca com legenda clicável
   As classes vivem no app.css (não no relatorios.css): KPI do Início, cartão do CRM e painel de Conversas
   usam estas peças sem carregar o CSS de Relatórios.
   ============================================================ */
/**
 * plano 2000d · DR-280: a tendência da linha em palavras para o leitor de tela (a linha do KPI é aria-hidden) — «Tendência: subindo nos últimos
 * 14 dias.»; com `linha` (a linha mede outra coisa: «conversas novas por dia») o nome vai junto. "" com menos de 2 pontos.
 */
export function resumoTendencia(valores, { linha = null } = {}) {
  const u = (valores || []).filter(v => v !== null && v !== undefined && v !== "").map(Number).filter(fin);     // ponto vazio (null) não conta como zero
  if (u.length < 2) return "";
  const t = tendenciaDe(u);
  const como = t === "sobe" ? "subindo" : t === "desce" ? "caindo" : "estável";
  return `Tendência${linha ? ` de ${linha}` : ""}: ${como} nos últimos ${u.length} dias.`;
}
/** Tendência de uma série: compara o último ponto útil com o primeiro. */
export function tendenciaDe(valores) {
  const u = (valores || []).map(Number).filter(fin);
  if (u.length < 2) return "igual";
  const a = u[0], b = u[u.length - 1];
  return b > a ? "sobe" : b < a ? "desce" : "igual";
}
/** Pontos [x,y] de uma sparkline (PURO): valores nulos ficam de fora; série reta fica no meio da altura. */
export function pontosSparkline(valores, W, H, P = 3) {
  const n = valores.length;
  const uteis = valores.filter(fin);
  if (!uteis.length) return [];
  let min = Math.min(...uteis), max = Math.max(...uteis);
  if (min === max) { min -= 1; max += 1; }
  const x = k => P + (n > 1 ? k / (n - 1) * (W - 2 * P) : (W - 2 * P) / 2);
  const y = escala([min, max], [H - P, P]);
  return valores.map((v, k) => (fin(v) ? [x(k), y(v)] : null)).filter(Boolean);
}
/** Redesenho por largura para peças pequenas (mínimo 48 px; o `responsivo` dos gráficos grandes começa em 260). */
function responsivoMini(alvo, desenhar, minimo = 48) {
  let w = 0, desligar = null;
  const rodar = anim => { const nw = Math.max(minimo, Math.round(alvo.clientWidth || 120)); w = nw; desenhar(nw, anim); };
  rodar(true);
  // plano 2000d · DR-310: o observador comum (a linha que saiu da página é solta sozinha — RB-167)
  desligar = observarTamanho(alvo, () => { const nw = Math.round(alvo.clientWidth || 0); if (nw && Math.abs(nw - w) > 12) rodar(false); });
  return { destruir() { if (desligar) desligar(); desligar = null; }, redesenhar() { rodar(false); } };
}

/* ---------- 3.1 Sparkline: SVG de 32 px, último ponto marcado ---------- */
/**
 * G.sparkline(alvo, {valores:[n…], cor?: "#RRGGBB", area?: bool, rotulo, fmt?, altura?: 28–40}) → {destruir, redesenhar, tendencia}
 * Menos de 2 números úteis: desenha o traço «sem histórico» e diz isso ao leitor de tela (a tela nunca fica em branco, nada é inventado).
 * A cor vem do tema (--g = primária) ou de `cor` validada; data-tendencia="sobe|desce|igual" deixa a tela colorir por sentido.
 */
export function sparkline(alvo, o = {}) {
  limpar(alvo);
  const valores = (o.valores || []).map(v => (fin(Number(v)) ? Number(v) : null));
  const uteis = valores.filter(fin);
  const rotulo = o.rotulo || "Série";
  const fmt = o.fmt || fmtNumero;     // plano 1500c · RC-242: «15.200» no resumo acessível (antes «15200»)
  const H = Math.max(28, Math.min(40, Number(o.altura) || 32));
  alvo.classList.add("g-spark-alvo");
  if (uteis.length < 2) {
    alvo.append(h("span", { class: "g-spark g-spark-vazio", role: "img", "aria-label": `${rotulo}: sem histórico suficiente`, style: { "--h": `${H}px` } }));
    return { destruir() {}, redesenhar() {}, tendencia: "igual" };
  }
  const tendencia = tendenciaDe(uteis);
  const cor = corValida(o.cor);
  const resumo = `${rotulo}: de ${fmt(uteis[0])} a ${fmt(uteis[uteis.length - 1])} em ${uteis.length} pontos` + (tendencia === "igual" ? "" : tendencia === "sobe" ? ", subindo" : ", caindo");
  const desenhar = (W, anim) => {
    const velho = alvo.querySelector("svg"); if (velho) velho.remove();
    const pts = pontosSparkline(valores, W, H, 4);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: `g-spark${anim && !reduzido() ? " g-anim" : ""}`, role: "img", "aria-label": resumo,
      "data-tendencia": tendencia, style: cor ? { "--g": cor } : {} }, titulo(resumo));
    if (o.area !== false) svg.append(s("path", { class: "g-spark-area", d: caminhoArea(pts, H - 1) }));
    svg.append(s("path", { class: "g-spark-linha", d: caminhoSuave(pts), pathLength: 1 }));
    const fim = pts[pts.length - 1];
    svg.append(s("circle", { class: "g-spark-fim", cx: f1(fim[0]), cy: f1(fim[1]), r: 3 }));
    alvo.append(svg);
  };
  const ctl = responsivoMini(alvo, desenhar);
  return { ...ctl, tendencia };
}

/* ---------- 3.2 Rosca com legenda clicável (esconde a fatia) e dica acessível ---------- */
/**
 * G.donut(alvo, {fatias:[{rotulo, valor, extra?, cor?}], fmt(v), centro?: {valor?, rotulo}, resumo, aoMudar?(visiveis)}) → {destruir, ocultas(), alternar(i)}
 * Cada item da legenda é um botão (aria-pressed): tirar uma fatia refaz a rosca e os percentuais com o que ficou; o centro mostra o total visível.
 * As fatias usam a paleta CATEGÓRICA do app (.g-d0…7 → --pal-*, a mesma das etapas e etiquetas), nunca as cores de estado: «Site» em vermelho pareceria erro.
 * (ou `centro.valor`, quando a tela manda um fixo). Mouse na fatia ou foco no item da legenda destacam os dois e falam o texto na dica (aria-live).
 */
export function donut(alvo, o) {
  limpar(alvo);
  const tam = 200, cx = 100, cy = 100, r = 92, r0 = 62;
  const fatias = (o.fatias || []).map((f, i) => ({ ...f, i, valor: fin(Number(f.valor)) ? Number(f.valor) : 0 }));
  const ocultas = new Set();
  const svg = s("svg", { viewBox: `0 0 ${tam} ${tam}`, class: `g-rosca g-donut${reduzido() ? "" : " g-anim"}`, role: "img", "aria-label": o.resumo });
  const gFatias = s("g", { class: "g-donut-fatias" });
  const centroN = s("text", { class: "g-rosca-n g-donut-n", x: cx, y: cy + 4, "text-anchor": "middle" });
  const centroL = s("text", { class: "g-rosca-l g-donut-l", x: cx, y: cy + 24, "text-anchor": "middle" }, (o.centro && o.centro.rotulo) || "");
  svg.append(s("circle", { class: "g-trilho", cx, cy, r: (r + r0) / 2, "stroke-width": r - r0, fill: "none" }), gFatias, centroN, centroL);
  // plano 1000b · RB-183: sem «toque» (vale para mouse e teclado também)
  const leg = h("ul", { class: "g-donut-leg", "aria-label": "Legenda: escolha uma fatia para esconder ou mostrar" });
  const caixa = h("div", { class: "g-caixa g-donut-caixa" }, svg);
  const itens = new Map();   // i → {bt, valorEl, path}
  const tr = trilho(caixa, {
    n: () => fatias.length,
    texto: k => { const f = fatias[k], p = pctDe(k); return `${f.rotulo}: ${o.fmt(f.valor)}${p != null ? ` (${Math.round(p)}%)` : ""}${ocultas.has(k) ? " · escondida" : ""}`; },
    aoMostrar: k => { for (const [i, it] of itens) { const on = i === k; it.bt.classList.toggle("g-ativa", on); if (it.path) it.path.classList.toggle("g-ativa", on); } caixa.classList.add("g-foco"); },
    aoEsconder: () => { for (const it of itens.values()) { it.bt.classList.remove("g-ativa"); if (it.path) it.path.classList.remove("g-ativa"); } caixa.classList.remove("g-foco"); },
  });
  const visiveis = () => fatias.filter(f => !ocultas.has(f.i));
  const pctDe = i => { if (ocultas.has(i)) return null; const tot = visiveis().reduce((a, f) => a + Math.max(0, f.valor), 0); return tot > 0 ? Math.max(0, fatias[i].valor) / tot * 100 : null; };
  function desenharFatias() {
    limpar(gFatias);
    for (const it of itens.values()) it.path = null;
    const fs = fatiasDe(fatias.map(f => (ocultas.has(f.i) ? 0 : f.valor)), .012);
    fs.forEach((f, n) => {
      const it = fatias[f.i], cor = corValida(it.cor);
      const p = s("path", { class: `g-fatia g-d${f.i % 8}`, d: arcoAnel(cx, cy, r, r0, f.a0, f.a1), style: { "--i": n, ...(cor ? { "--g": cor } : {}) }, "data-i": f.i },
        titulo(`${it.rotulo}: ${o.fmt(it.valor)} (${Math.round(f.pct)}%)`));
      gFatias.append(p);
      const reg = itens.get(f.i); if (reg) reg.path = p;
    });
    const tot = visiveis().reduce((a, f) => a + Math.max(0, f.valor), 0);
    const fixo = o.centro && o.centro.valor !== undefined && o.centro.valor !== null && !ocultas.size;
    centroN.textContent = fixo ? String(o.centro.valor) : (visiveis().length ? o.fmt(tot) : "—");
    for (const [i, reg] of itens) { const p = pctDe(i); reg.valorEl.textContent = `${o.fmt(fatias[i].valor)}${p != null ? ` · ${Math.round(p)}%` : ""}`; }
    svg.setAttribute("aria-label", ocultas.size ? `${o.resumo}. ${ocultas.size} ${ocultas.size === 1 ? "fatia escondida" : "fatias escondidas"}.` : o.resumo);
  }
  function alternar(i) {
    if (!itens.has(i)) return;
    if (ocultas.has(i)) ocultas.delete(i); else ocultas.add(i);
    const reg = itens.get(i);
    reg.bt.setAttribute("aria-pressed", String(!ocultas.has(i)));
    reg.bt.parentNode.classList.toggle("g-oculta", ocultas.has(i));
    svg.classList.remove("g-anim");   // a troca não repete a animação de entrada
    desenharFatias();
    if (typeof o.aoMudar === "function") { try { o.aoMudar(visiveis().map(f => f.i)); } catch (e) { console.error(e); } }
  }
  fatias.forEach(f => {
    const cor = corValida(f.cor);
    const valorEl = h("b", {});
    const bt = h("button", { type: "button", class: "g-donut-op", "aria-pressed": "true", "data-i": f.i, title: "Esconder ou mostrar esta fatia" },
      h("i", { class: `g-marca g-d${f.i % 8}`, style: cor ? { "--g": cor } : {} }), h("span", { class: "g-rl-nome", texto: f.rotulo }), valorEl,
      f.extra ? h("small", { texto: f.extra }) : null);
    bt.addEventListener("click", () => alternar(f.i));
    bt.addEventListener("focus", () => tr.mostrar(f.i, posNaCaixa(caixa, svg).x));
    bt.addEventListener("blur", () => tr.esconder());
    bt.addEventListener("pointerenter", e => { if (e.pointerType !== "touch") tr.mostrar(f.i, posNaCaixa(caixa, svg).x); });
    bt.addEventListener("pointerleave", () => tr.esconder());
    itens.set(f.i, { bt, valorEl, path: null });
    leg.append(h("li", {}, bt));
  });
  svg.addEventListener("pointermove", e => { const p = e.target && e.target.closest ? e.target.closest(".g-fatia") : null; if (!p) return tr.esconder(); const pos = posNaCaixa(caixa, p); caixa.style.setProperty("--y", `${Math.round(pos.y)}px`); tr.mostrar(+p.dataset.i, pos.x); });
  svg.addEventListener("pointerleave", () => tr.esconder());
  desenharFatias();
  const env = h("div", { class: "g-rosca-caixa g-donut-env" }, caixa, leg);
  alvo.append(env);
  tabelaDaRosca(alvo, env, o, fatiasDe(fatias.map(f => f.valor)));      // plano 2000d · DR-306
  return { destruir() { tr.esconder(); }, ocultas: () => [...ocultas], alternar };
}
