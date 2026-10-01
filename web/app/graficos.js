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
  const degraus = p >= 10 ? [1, 1.2, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 10];
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
const limpar = el => { while (el.firstChild) el.firstChild.remove(); };
const reduzido = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const corValida = c => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : null);

/** Liga o redesenho por largura (o SVG é medido em px reais: texto nunca estica). */
function responsivo(alvo, desenhar) {
  let w = 0, ro = null;
  const rodar = anim => { const nw = Math.max(260, Math.round(alvo.clientWidth || 640)); w = nw; desenhar(nw, anim); };
  rodar(true);
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => { const nw = Math.round(alvo.clientWidth || 0); if (nw && Math.abs(nw - w) > 24) rodar(false); });
    ro.observe(alvo);
  }
  return { destruir() { if (ro) ro.disconnect(); ro = null; }, redesenhar() { rodar(false); } };
}

/** Dica flutuante + região aria-live, compartilhadas pelos gráficos com "trilho" (dia a dia). */
function trilho(caixa, { n, texto, aoMostrar, aoEsconder }) {
  const dica = h("div", { class: "g-dica", role: "status", "aria-live": "polite" });
  dica.hidden = true;
  caixa.append(dica);
  let atual = -1;
  const mostrar = (k, x) => {
    k = Math.max(0, Math.min(n() - 1, k));
    atual = k;
    dica.textContent = texto(k);
    dica.hidden = false;
    const larg = caixa.clientWidth || 1, dw = dica.offsetWidth || 160;
    dica.style.setProperty("--x", `${Math.max(4, Math.min(larg - dw - 4, x - dw / 2))}px`);
    aoMostrar(k);
  };
  const esconder = () => { atual = -1; dica.hidden = true; aoEsconder(); };
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
    const P = { l: W < 560 ? 46 : 58, r: 34, t: 14, b: 28 }, iw = W - P.l - P.r, ih = H - P.t - P.b, base = P.t + ih;
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
    const passo = passoRotulo(n, W < 560 ? 4 : 7), gX = s("g", { class: "g-eixo-x", "aria-hidden": "true" });
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
    const P = { l: W < 560 ? 40 : 52, r: 16, t: 14, b: 28 }, iw = W - P.l - P.r, ih = H - P.t - P.b, base = P.t + ih;
    const max = topoBonito(Math.max(1, ...o.pontos.flatMap(p => p.valores.map(v => v || 0))));
    const x = k => P.l + (n > 1 ? k / (n - 1) * iw : iw / 2), y = escala([0, max], [base, P.t]);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": o.resumo, class: anim && !reduzido() ? "g-anim" : "" });
    const grade = s("g", { class: "g-grade", "aria-hidden": "true" });
    ticks(Math.max(1, ...o.pontos.flatMap(p => p.valores.map(v => v || 0)))).forEach(v => {
      grade.append(s("line", { x1: P.l, x2: W - P.r, y1: f1(y(v)), y2: f1(y(v)) }), s("text", { x: P.l - 8, y: f1(y(v) + 4), "text-anchor": "end" }, o.fmtEixo ? o.fmtEixo(v) : o.fmt(v)));
    });
    svg.append(grade);
    o.series.forEach((se, j) => {
      const pts = o.pontos.map((p, k) => [x(k), y(p.valores[j] || 0)]);
      if (j === 0 && pts.length > 1) svg.append(s("path", { class: `g-area ${se.classe}`, d: caminhoArea(pts, base, false) }));
      const d = pts.length > 1 ? caminhoReto(pts) : `M${f1(pts[0][0] - 3)} ${f1(pts[0][1])} L${f1(pts[0][0] + 3)} ${f1(pts[0][1])}`;
      svg.append(s("path", { class: `g-linha ${se.classe}`, d, pathLength: 1, style: { "--i": j * 4 } }, titulo(`${se.nome}: ${o.pontos.map(p => `${p.rotulo} ${o.fmt(p.valores[j])}`).slice(0, 60).join(", ")}`)));
    });
    const passo = passoRotulo(n, W < 560 ? 4 : 7), gX = s("g", { class: "g-eixo-x", "aria-hidden": "true" });
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
/**
 * @param o {itens:[{rotulo, valores:[…], extra?}], series:[{nome, classe}], fmt(v), resumo}
 */
export function barras(alvo, o) {
  limpar(alvo);
  const max = Math.max(1, ...o.itens.flatMap(it => it.valores.map(v => v || 0)));
  const lista = h("ul", { class: "g-hbarras", role: "list", "aria-label": o.resumo });
  o.itens.forEach((it, n) => {
    const li = h("li", { class: "g-hitem", style: { "--i": n } },
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
  });
  if (!reduzido()) lista.classList.add("g-anim");
  alvo.append(...[lista, o.series.length > 1 ? legenda(o.series) : null].filter(Boolean));
  return { destruir() {} };
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
  alvo.append(h("div", { class: "g-rosca-caixa" }, svg, leg));
  return { destruir() {} };
}

/* ---------- 2.5 Funil horizontal por etapa ---------- */
/** @param o {etapas:[{nome, cor, qtd, valorTxt, conversao (texto)|null, tipo}], resumo} */
export function funil(alvo, o) {
  limpar(alvo);
  const max = Math.max(1, ...o.etapas.map(e => e.qtd || 0));
  const lista = h("ol", { class: `g-funil${reduzido() ? "" : " g-anim"}`, "aria-label": o.resumo });
  o.etapas.forEach((e, n) => {
    const cor = corValida(e.cor);
    const pct = Math.max(e.qtd > 0 ? 3 : 0, (e.qtd || 0) / max * 100);
    const li = h("li", { class: `g-fetapa g-f-${e.tipo || "aberto"}`, style: { "--i": n } },
      h("span", { class: "g-fnome" }, h("i", { class: "g-fcor", style: cor ? { "--cor": cor } : {} }), h("span", { texto: e.nome })),
      h("span", { class: "g-ftrilho" }, h("span", { class: "g-fbarra", style: { "--w": `${pct.toFixed(2)}%`, ...(cor ? { "--cor": cor } : {}) } }),
        h("span", { class: "g-fqtd", texto: String(e.qtd || 0) })),
      h("span", { class: "g-fvalor", texto: e.valorTxt || "" }),
      e.conversao ? h("span", { class: "g-fconv", texto: e.conversao }) : h("span", { class: "g-fconv" }));
    lista.append(li);
  });
  alvo.append(lista);
  return { destruir() {} };
}

/* ---------- 2.6 Mapa de calor 7 × 24 ---------- */
/** @param o {matriz:[7][24] números (0 = domingo), dias:['dom',…], fmt(v), resumo} */
export function calor(alvo, o) {
  limpar(alvo);
  const max = Math.max(0, ...o.matriz.flat());
  const grade = h("div", { class: `g-calor${reduzido() ? "" : " g-anim"}`, role: "img", "aria-label": o.resumo });
  grade.append(h("span", { class: "g-cal-canto", "aria-hidden": "true" }));
  for (let hr = 0; hr < 24; hr++) grade.append(h("span", { class: "g-cal-h", "aria-hidden": "true", texto: hr % 3 === 0 ? String(hr).padStart(2, "0") : "" }));
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // semana começando na segunda
  ordem.forEach((d, lin) => {
    grade.append(h("span", { class: "g-cal-d", "aria-hidden": "true", texto: o.dias[d] }));
    for (let hr = 0; hr < 24; hr++) {
      const v = o.matriz[d][hr] || 0;
      grade.append(h("span", { class: `g-cal-c g-n${nivelCalor(v, max)}`, title: `${o.dias[d]} ${String(hr).padStart(2, "0")}h: ${o.fmt(v)}`, style: { "--i": lin * 3 + Math.floor(hr / 4) } }));
    }
  });
  const esc = h("div", { class: "g-cal-escala", "aria-hidden": "true" }, h("span", { texto: "menos" }),
    ...[0, 1, 2, 3, 4, 5].map(k => h("i", { class: `g-cal-c g-n${k}` })), h("span", { texto: "mais" }));
  alvo.append(h("div", { class: "g-cal-rolagem" }, grade), esc);
  return { destruir() {} };
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
  const btn = h("button", { type: "button", class: "g-ver-tabela", "aria-pressed": "false" }, "Ver como tabela");
  btn.addEventListener("click", () => {
    const ligado = tabela.hidden;
    tabela.hidden = !ligado;
    alvoGrafico.hidden = ligado;
    btn.setAttribute("aria-pressed", String(ligado));
    btn.textContent = ligado ? "Ver como gráfico" : "Ver como tabela";
  });
  alvoGrafico.after(tabela);
  rodape.append(btn);
  return btn;
}

/* ---------- 2.8 Números que contam (odômetro simples) ---------- */
/** Duração de um token de tempo do :root ("900ms"/"0s") — com movimento reduzido o token vale 0. */
export function duracaoToken(nome) {
  if (typeof getComputedStyle !== "function" || reduzido()) return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const m = /^([\d.]+)(ms|s)$/.exec(v);
  return m ? parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1) : 0;
}
/** Faz o texto do elemento contar de 0 até `valor` (formatado por `fmt`) na duração de --t-dados. */
export function contar(el, valor, fmt) {
  el.textContent = fmt(valor);
  const dur = duracaoToken("--t-dados");
  if (!dur || !fin(valor) || valor === 0 || typeof requestAnimationFrame !== "function") return;
  const t0 = performance.now();
  const passo = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(p < 1 ? valor * e : valor);
    if (p < 1 && el.isConnected) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

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
