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
  caixa.addEventListener("pointermove", e => { const li = e.target && e.target.closest ? e.target.closest(".g-hitem") : null; if (!li) return tr.esconder(); mostrarLinha(+li.dataset.k); });
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
  alvo.append(h("div", { class: "g-rosca-caixa" }, svg, leg));
  return { destruir() {} };
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
    const li = h("li", { class: `g-fetapa g-f-${e.tipo || "aberto"}`, style: { "--i": n } },
      h("span", { class: "g-fnome" }, h("i", { class: "g-fcor", style: cor ? { "--cor": cor } : {} }), h("span", { texto: e.nome })),
      h("span", { class: "g-ftrilho" }, h("span", { class: "g-fbarra", style: { "--w": `${pct.toFixed(2)}%`, ...(cor ? { "--cor": cor } : {}) } }),
        h("span", { class: "g-fqtd", texto: String(e.qtd || 0) })),
      h("span", { class: "g-fvalor", texto: e.valorTxt || "" }),
      h("span", { class: `g-fconv${taxa ? " g-fconv-taxa" : ""}`, texto: convTxt, ...(taxa ? { "data-taxa": String(Math.round(taxa.pct)) } : {}) }));
    lista.append(li);
  });
  alvo.append(lista);
  return { destruir() {} };
}

/* ---------- 2.6 Mapa de calor 7 × 24 ---------- */
/** @param o {matriz:[7][24] números (0 = domingo), dias:['dom',…], fmt(v), resumo}
    Dica (plano 50 · A2): mouse sobre a célula ou teclado — ← → mudam a hora, ↑ ↓ o dia, Home/End as pontas, Esc fecha — com aria-live. */
export function calor(alvo, o) {
  limpar(alvo);
  const max = Math.max(0, ...o.matriz.flat());
  const grade = h("div", { class: `g-calor${reduzido() ? "" : " g-anim"}`, role: "img", "aria-label": o.resumo });
  grade.append(h("span", { class: "g-cal-canto", "aria-hidden": "true" }));
  for (let hr = 0; hr < 24; hr++) grade.append(h("span", { class: "g-cal-h", "aria-hidden": "true", texto: hr % 3 === 0 ? String(hr).padStart(2, "0") : "" }));
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // semana começando na segunda
  const celulas = [];                      // [linha][hora] → célula (linha 0 = segunda)
  ordem.forEach((d, lin) => {
    grade.append(h("span", { class: "g-cal-d", "aria-hidden": "true", texto: o.dias[d] }));
    celulas.push([]);
    for (let hr = 0; hr < 24; hr++) {
      const v = o.matriz[d][hr] || 0;
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
    texto: k => { const lin = Math.floor(k / 24), hr = k % 24, d = ordem[lin]; return `${o.dias[d]} ${String(hr).padStart(2, "0")}h: ${o.fmt(o.matriz[d][hr] || 0)}`; },
    aoMostrar: k => { if (atual >= 0) celulas[Math.floor(atual / 24)][atual % 24].classList.remove("g-ativa"); atual = k; celulas[Math.floor(k / 24)][k % 24].classList.add("g-ativa"); },
    aoEsconder: () => { if (atual >= 0) celulas[Math.floor(atual / 24)][atual % 24].classList.remove("g-ativa"); atual = -1; },
  });
  const mostrarCelula = (lin, hr) => {
    lin = Math.max(0, Math.min(6, lin)); hr = Math.max(0, Math.min(23, hr));
    const c = celulas[lin][hr], p = posNaCaixa(caixa, c);
    caixa.style.setProperty("--y", `${Math.round(p.y)}px`);
    tr.mostrar(lin * 24 + hr, p.x);
  };
  caixa.addEventListener("pointermove", e => { const c = e.target && e.target.closest ? e.target.closest(".g-calor .g-cal-c") : null; if (!c) return tr.esconder(); mostrarCelula(+c.dataset.l, +c.dataset.h); });
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tr.esconder(); });
  caixa.addEventListener("blur", () => tr.esconder());
  caixa.addEventListener("keydown", e => {
    if (e.key === "Escape") return tr.esconder();
    const lin = atual < 0 ? 0 : Math.floor(atual / 24), hr = atual < 0 ? 8 : atual % 24;   // começa na segunda às 8h (horário comercial)
    const mapa = { ArrowRight: [lin, hr + 1], ArrowLeft: [lin, hr - 1], ArrowDown: [lin + 1, hr], ArrowUp: [lin - 1, hr], Home: [lin, 0], End: [lin, 23] };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    if (atual < 0 && e.key !== "Home" && e.key !== "End") return mostrarCelula(lin, hr);
    mostrarCelula(...mapa[e.key]);
  });
  alvo.append(caixa);
  return { destruir() { tr.esconder(); }, mostrar: mostrarCelula, esconder: () => tr.esconder() };
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
/** Lê a duração do tema, mas não anima quando a aba está oculta ou o usuário reduz movimento. */
export function duracaoToken(nome) {
  if (typeof document === "undefined" || document.hidden || typeof getComputedStyle !== "function" || reduzido()) return 0;
  const bruto = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const m = bruto.match(/^([\d.]+)\s*(ms|s)$/i);
  if (!m) return 0;
  const ms = Number(m[1]) * (m[2].toLowerCase() === "s" ? 1000 : 1);
  return Number.isFinite(ms) ? Math.max(0, Math.min(2000, ms)) : 0;
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
  const limpar = () => {
    if (!ativo) return false;
    ativo = false;
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
    if (!el.isConnected) { limpar(); return; }
    const p = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);   // o 1º quadro pode vir com t < t0: nada de «-0»
    pintar(p < 1 ? valor * e : valor);
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
  let w = 0, ro = null;
  const rodar = anim => { const nw = Math.max(minimo, Math.round(alvo.clientWidth || 120)); w = nw; desenhar(nw, anim); };
  rodar(true);
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => { const nw = Math.round(alvo.clientWidth || 0); if (nw && Math.abs(nw - w) > 12) rodar(false); });
    ro.observe(alvo);
  }
  return { destruir() { if (ro) ro.disconnect(); ro = null; }, redesenhar() { rodar(false); } };
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
  const fmt = o.fmt || (v => String(Math.round(v * 100) / 100).replace(".", ","));
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
  const leg = h("ul", { class: "g-donut-leg", "aria-label": "Legenda: toque para esconder ou mostrar uma fatia" });
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
  alvo.append(h("div", { class: "g-rosca-caixa g-donut-env" }, caixa, leg));
  return { destruir() { tr.esconder(); }, ocultas: () => [...ocultas], alternar };
}
