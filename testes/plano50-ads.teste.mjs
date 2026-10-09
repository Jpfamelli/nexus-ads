/* Plano 50 — frente F (Anúncios e Relatórios), itens 45–51. Sem dependências, sem rede: a lógica roda pura e as peças de tela
   rodam num DOM mínimo (createElement/createElementNS, classList, atributos, eventos, querySelector simples). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");

/* ---------- DOM mínimo ---------- */
class No {
  constructor(tag, ns = null) { this.tagName = String(tag).toUpperCase(); this.tag = String(tag).toLowerCase(); this.ns = ns; this.nodeType = 1; this.attrs = {}; this.childNodes = []; this.parentNode = null; this.eventos = {}; this.hidden = false; this.isConnected = true;
    const self = this; this.style = { _p: {}, setProperty(k, v) { this._p[k] = String(v); }, getPropertyValue(k) { return this._p[k] || ""; } };
    // dataset espelha data-* (como no navegador): el.dataset.campId = "7" vira [data-camp-id="7"] no seletor
    this.dataset = new Proxy({}, { set(o, k, v) { o[k] = String(v); self.attrs[`data-${String(k).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`] = String(v); return true; } });
    this.classList = { add: (...c) => { const s = new Set(self._cls()); c.forEach(x => s.add(x)); self.attrs.class = [...s].join(" "); }, remove: (...c) => { self.attrs.class = self._cls().filter(x => !c.includes(x)).join(" "); },
      toggle: (c, f) => { const tem = self._cls().includes(c); const on = f === undefined ? !tem : !!f; on ? self.classList.add(c) : self.classList.remove(c); return on; }, contains: c => self._cls().includes(c) }; }
  _cls() { return String(this.attrs.class || "").split(/\s+/).filter(Boolean); }
  get className() { return this.attrs.class || ""; } set className(v) { this.attrs.class = String(v); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.nodeType === 3 ? this._t : this.childNodes.map(c => c.textContent).join(""); }
  set textContent(v) { this.childNodes = []; if (v !== "") this.append(txt(v)); }
  get clientWidth() { return 600; } get offsetWidth() { return 120; }
  getBoundingClientRect() { return { width: 600, height: 260, left: 0, top: 0, right: 600, bottom: 260 }; }
  append(...xs) { for (const x of xs.flat(Infinity)) { if (x == null || x === false) continue; const n = typeof x === "string" ? txt(x) : x; n.parentNode = this; this.childNodes.push(n); } }
  prepend(...xs) { for (const x of xs.reverse()) { const n = typeof x === "string" ? txt(x) : x; n.parentNode = this; this.childNodes.unshift(n); } }
  after(x) { const i = this.parentNode.childNodes.indexOf(this); x.parentNode = this.parentNode; this.parentNode.childNodes.splice(i + 1, 0, x); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(c => c !== this); this.parentNode = null; }
  replaceChildren(...xs) { this.childNodes = []; this.append(...xs); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  getAttributeNames() { return Object.keys(this.attrs); }
  addEventListener(t, fn) { (this.eventos[t] ||= []).push(fn); }
  emitir(t, ev = {}) { const e = { type: t, target: this, currentTarget: this, preventDefault() {}, ...ev }; for (const fn of this.eventos[t] || []) fn(e); return e; }
  click() { this.emitir("click"); } focus() { document.activeElement = this; } blur() {}
  closest(sel) { let n = this; while (n) { if (n.nodeType === 1 && casa(n, sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { const partes = sel.split(/\s+/); const out = []; const anda = (n, i) => { for (const c of n.children) { if (casa(c, partes[i])) { if (i === partes.length - 1) out.push(c); else anda(c, i + 1); } anda(c, i); } }; anda(this, 0); return [...new Set(out)]; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const txt = v => { const n = new No("#text"); n.nodeType = 3; n._t = String(v); return n; };
function casa(n, simples) {
  if (!simples || n.nodeType !== 1) return false;
  const m = simples.match(/^([a-z0-9]+)?((?:[.#\[][^.#\[]+)*)$/i); if (!m) return false;
  if (m[1] && n.tag !== m[1].toLowerCase()) return false;
  for (const parte of (m[2] || "").match(/[.#\[][^.#\[]+/g) || []) {
    if (parte[0] === ".") { if (!n._cls().includes(parte.slice(1))) return false; }
    else if (parte[0] === "#") { if (n.attrs.id !== parte.slice(1)) return false; }
    else { const a = parte.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"'\]]*)["']?)?$/); if (!a) return false; if (!(a[1] in n.attrs)) return false; if (a[2] !== undefined && n.attrs[a[1]] !== a[2]) return false; }
  }
  return true;
}
const document = { activeElement: null, documentElement: new No("html"), body: new No("body"), hidden: false,
  createElement: t => new No(t), createElementNS: (ns, t) => new No(t, ns), createTextNode: txt };
globalThis.document = document;
// ui.h simplificado (mesmas regras: class, dataset, on, style objeto/texto, hidden, atributos)
function h(tag, attrs = {}, ...filhos) {
  const el = new No(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.attrs.class = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "on") for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
    else if (k === "style") { if (typeof v === "string") for (const par of v.split(";")) { const i = par.indexOf(":"); if (i > 0) el.style.setProperty(par.slice(0, i).trim(), par.slice(i + 1).trim()); } else for (const [p, q] of Object.entries(v)) el.style.setProperty(p, q); }
    else if (k === "hidden") el.hidden = !!v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

const N = await import("../web/nucleo.js");
const { gerarDemo } = await import("../web/demo.js");
const L = await import("../web/app/rel-logica.js");
const G = await import("../web/app/graficos.js");
const A = await import("../web/app/anuncios.js");
const Rel = await import("../web/app/relatorios.js");
const HOJE = "2026-10-03";
const M = N.montar(gerarDemo({ nome: "Clínica Fictícia", hoje: HOJE }));
const cent = v => Math.round(v * 100);

/* ============================================================ lógica pura */
test("45 · série de tendência reconcilia com os totais do período (gasto do Ads e conversas/agendamentos/fechamentos do CRM) em todo recorte", () => {
  for (const dias of [7, 30, 60]) for (const plat of ["", "meta", "google"]) {
    const t = L.serieTendencia(M, { dias, plat }), P = L.numerosPeriodo(M, { dias, plat });
    assert.equal(t.length, dias);
    assert.equal(cent(t.reduce((s, d) => s + d.gasto, 0)), cent(P.t.gasto), `${dias}/${plat}: gasto`);
    assert.equal(t.reduce((s, d) => s + d.convAds, 0), P.t.conversoes, `${dias}/${plat}: conversões Ads`);
    assert.equal(t.reduce((s, d) => s + d.conversas, 0), P.c.conversas, `${dias}/${plat}: conversas CRM`);
    assert.equal(t.reduce((s, d) => s + d.agendadas, 0), P.c.agendadas, `${dias}/${plat}: agendamentos`);
    assert.equal(t.reduce((s, d) => s + d.fecharam, 0), P.c.fecharam, `${dias}/${plat}: fechamentos`);
    assert.equal(cent(t.reduce((s, d) => s + d.receita, 0)), cent(P.c.receita), `${dias}/${plat}: receita`);
  }
});

test("46 · funil por plataforma: 4 etapas, taxa entre pares (null sem base), só plataformas com movimento e soma igual ao total", () => {
  const fp = L.funilPorPlataforma(M, { dias: 30 });
  assert.deepEqual(fp.map(x => x.plat), ["meta", "google"]);
  const tudo = L.numerosPeriodo(M, { dias: 30 });
  assert.equal(fp.reduce((s, p) => s + p.etapas[1].v, 0), tudo.c.conversas);
  assert.equal(fp.reduce((s, p) => s + p.etapas[3].v, 0), tudo.c.fecharam);
  for (const p of fp) {
    assert.deepEqual(p.etapas.map(e => e.id), ["convAds", "conversas", "agendadas", "fecharam"]);
    assert.equal(p.taxas.length, 3);
    p.taxas.forEach((tx, k) => { const base = p.etapas[k].v; if (base > 0) assert.equal(tx.pct, Math.round(p.etapas[k + 1].v / base * 1000) / 10); else assert.equal(tx.pct, null); });
    assert.equal(p.max, Math.max(...p.etapas.map(e => e.v)));
  }
  // dataset sem Google: a coluna some em vez de aparecer zerada
  const soMeta = { consolidar: ls => ({ gasto: ls.length ? 10 : 0, conversoes: ls.length ? 2 : 0 }), linhasDe: (de, ate, f) => (f.plat === "meta" ? [1] : []), crmTot: (de, ate, f) => (f.plat === "meta" ? { conversas: 2, agendadas: 0, fecharam: 0, receita: 0 } : { conversas: 0, agendadas: 0, fecharam: 0, receita: 0 }), R: 10 };
  const um = L.funilPorPlataforma(soMeta, { dias: 7 });
  assert.deepEqual(um.map(x => x.plat), ["meta"]);
  assert.equal(um[0].taxas[1].pct, 0); assert.equal(um[0].taxas[2].pct, null);
});

test("47 · calor dia da semana × semana: a matriz soma todas as conversas, as semanas começam na segunda e o pico/dia mais forte são coerentes", () => {
  for (const dias of [7, 30, 60]) {
    const c = L.calorSemanal(M, { dias }), t = L.serieTendencia(M, { dias });
    assert.equal(c.matriz.length, 7);
    assert.equal(c.matriz.flat().reduce((s, v) => s + v, 0), t.reduce((s, d) => s + d.conversas, 0), `${dias} dias: soma`);
    assert.equal(c.semanas.length, c.matriz[0].length);
    assert.ok(c.semanas.length >= Math.ceil(dias / 7) && c.semanas.length <= Math.ceil(dias / 7) + 1, `${dias} dias: ${c.semanas.length} semanas`);
    const primeiro = t[0].i, dowPrimeiro = M.dataDe(primeiro).getDay();
    assert.equal(c.semanas[0].ini, primeiro - ((dowPrimeiro + 6) % 7), "a 1ª coluna começa na segunda-feira da semana do 1º dia");
    if (c.max > 0) { assert.equal(c.matriz[c.pico.dow][c.pico.semana], c.max); assert.equal(c.porDow[c.melhorDow], Math.max(...c.porDow)); }
  }
  const vazio = L.calorSemanal({ porDia: () => ({ meta: [], google: [], conv: [], ag: [], fe: [], rec: [] }), LEADS: [], DIAS: 0, R: -1, dataDe: () => new Date() }, { dias: 7 });
  assert.equal(vazio.max, 0); assert.equal(vazio.pico, null); assert.deepEqual(vazio.semanas, []);
});

test("49 · sparkline/valores: geometria da polilinha, série ausente fica vazia, melhor dia e faixas do calor", () => {
  assert.equal(L.pontosSparkline([1, 3, 2, 5], 96, 28), "2,26 32.7,14 63.3,20 94,2");
  assert.equal(L.pontosSparkline([4, 4, 4], 60, 20).split(" ").length, 3, "série constante não divide por zero");
  assert.equal(L.pontosSparkline([], 96, 28), ""); assert.equal(L.pontosSparkline([null, "x"], 96, 28), "");
  assert.deepEqual(L.valoresSerie([{ d: "2026-10-01", criados: 2 }, { d: "2026-10-02", criados: "3" }], "criados"), [2, 3]);
  assert.deepEqual(L.valoresSerie([{ d: "2026-10-01", criados: 2 }], "ticket_medio"), [], "KPI sem série diária não ganha sparkline inventada");
  assert.deepEqual(L.melhorDia([{ d: "a", ganhos: 1 }, { d: "b", ganhos: 3 }, { d: "c", ganhos: 3 }], "ganhos"), { d: "b", v: 3 });
  assert.equal(L.melhorDia([{ d: "a", ganhos: 0 }], "ganhos"), null);
  const fx = L.faixasCalor(L.matrizCalor([{ dow: 1, hora: 9, qtd: 5 }, { dow: 2, hora: 15, qtd: 3 }, { dow: 3, hora: 23, qtd: 2 }]));
  assert.equal(fx.total, 10); assert.equal(fx.forte.nome, "manhã"); assert.deepEqual(fx.faixas.map(f => f.pct), [0, 50, 30, 20]);
  assert.deepEqual(Rel.SPARK_KPI, { vendas: { criados: "criados", ganhos: "ganhos", receita: "receita" }, atendimento: { novas: "novas", resolvidas: "resolvidas" } });
});

test("50 · exportação: nome de arquivo seguro e SVG serializado com estilos calculados, sem <title>/class/on*, com fundo e xmlns", () => {
  assert.equal(L.nomeArquivoExport("Tendência · Ads", "2026-09-04", "2026-10-03", "png"), "orbita-tendencia-ads-2026-09-04-a-2026-10-03.png");
  assert.equal(L.nomeArquivoExport("", null, null, "csv"), "orbita-grafico.csv");
  assert.ok(L.ESTILOS_SVG_EXPORT.includes("fill") && L.ESTILOS_SVG_EXPORT.includes("stroke") && L.ESTILOS_SVG_EXPORT.includes("font-family"));
  const svg = new No("svg", "svg"); svg.setAttribute("viewBox", "0 0 10 10"); svg.setAttribute("class", "g-anim"); svg.setAttribute("onload", "x()");
  const p = new No("path", "svg"); p.setAttribute("class", "g-linha g-s0"); p.setAttribute("d", "M0 0 L1 1"); p.append(h("title", {}, "dica"));
  const t = new No("text", "svg"); t.append(txt("R$ <5>"));
  svg.append(p, t);
  const estilos = { PATH: { fill: "none", stroke: "rgb(1, 2, 3)", "stroke-width": "2.5px" }, TEXT: { fill: "rgb(9, 9, 9)", "font-family": "Plex", "font-size": "11px" }, SVG: { fill: "rgb(0, 0, 0)" } };
  const out = A.svgParaTexto(svg, el => ({ getPropertyValue: k => (estilos[el.tagName] || {})[k] || "" }), ["fill", "stroke", "stroke-width", "font-family", "font-size"], { fundo: "#fff" });
  assert.match(out, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10" style="fill:rgb\(0, 0, 0\);stroke:none"><rect width="100%" height="100%" fill="#fff"\/>/);
  assert.match(out, /<path d="M0 0 L1 1" style="fill:none;stroke:rgb\(1, 2, 3\);stroke-width:2\.5px"><\/path>/);
  assert.match(out, /<text style="fill:rgb\(9, 9, 9\);stroke:none;font-family:Plex;font-size:11px">R\$ &lt;5&gt;<\/text>/);
  assert.doesNotMatch(out, /title|class=|onload/);
});

test("51 · semáforo do Radar: verde sem ativos, amarelo com atenção, vermelho com conexão caída; contagens, frase para leigo e filtro", () => {
  const ep = (sev, ativo, regra = "r1") => ({ chave: `${regra}|x`, regra, nome: "n", sev, ativo, msg: "", acao: "Pausar" });
  const verde = L.semaforoRadar({ conexoes: [], episodios: [ep("alerta", false)] });
  assert.equal(verde.nivel, "verde"); assert.equal(verde.cor, "ok"); assert.equal(verde.ativos, 0); assert.match(verde.frase, /Tudo dentro do combinado/);
  const amarelo = L.semaforoRadar({ conexoes: [], episodios: [ep("alerta", true), ep("info", true, "r3"), ep("alerta", false)] });
  assert.equal(amarelo.nivel, "amarelo"); assert.deepEqual(amarelo.contagens, { critico: 0, alerta: 1, info: 1 });
  assert.equal(amarelo.frase, "Vale olhar esta semana: 1 ponto de atenção e 1 aviso informativo.");
  assert.equal(amarelo.acao, L.explicarRegra("r1").acao); assert.equal(amarelo.primeiro.regra, "r1");
  const vermelho = L.semaforoRadar({ conexoes: [{ ativo: true, nome: "Conexão com o Meta", a: {} }], episodios: [ep("alerta", true)] });
  assert.equal(vermelho.nivel, "vermelho"); assert.equal(vermelho.contagens.critico, 1); assert.match(vermelho.frase, /^Precisa de ação hoje: 1 problema crítico e 1 ponto de atenção\./);
  assert.equal(vermelho.acao, L.explicarRegra("integracao").acao); assert.equal(vermelho.primeiro.tipo, "conexao");
  for (const id of ["r1", "r2", "r3", "r4", "ritmo", "integracao", "desconhecida"]) { const e = L.explicarRegra(id); assert.ok(e.oQue && e.porque && e.acao, id); assert.doesNotMatch(e.oQue, /CPA|ROAS|CTR/, `${id}: sem sigla na explicação simples`); }
  // sem nenhum número de anúncio: nada a avaliar — nível neutro, nunca o verde do «tudo certo»
  const neutro = L.semaforoRadar({ conexoes: [], episodios: [] }, { semDados: true });
  assert.equal(neutro.nivel, "neutro"); assert.equal(neutro.cor, "neutro"); assert.equal(neutro.frase, "Ainda sem números de anúncio para avaliar.");
  assert.doesNotMatch(neutro.frase + neutro.acao, /Tudo dentro do combinado|nenhuma campanha precisa/);
  assert.match(neutro.acao, /primeira leitura/);
  const caiuSemDados = L.semaforoRadar({ conexoes: [{ ativo: true, nome: "Conexão com o Meta", a: {} }], episodios: [] }, { semDados: true });
  assert.equal(caiuSemDados.nivel, "vermelho", "conexão caída continua vermelha mesmo sem números");
  assert.equal(L.semaforoRadar({ conexoes: [], episodios: [] }).nivel, "verde", "com números e nada ativo: verde");
  const itens = L.ordenarRadar({ conexoes: [], episodios: [ep("alerta", true), ep("info", false)] });
  assert.equal(L.filtrarRadar(itens, "ativos").length, 1); assert.equal(L.filtrarRadar(itens, "resolvidos").length, 1); assert.equal(L.filtrarRadar(itens, "todos").length, 2); assert.equal(L.filtrarRadar(itens, "qualquer").length, 2);
});

/* ============================================================ peças de tela (DOM mínimo) */
const serieT = L.serieTendencia(M, { dias: 14 });
const opcT = alvo => ({ G, serie: serieT, rotuloDia: M.ddmm, diaLongo: i => `dia ${M.ddmm(i)}`, fmtMoeda: v => `R$ ${v.toFixed(2)}`, fmtMoedaCurto: v => `R$ ${Math.round(v)}`, fmtNum: v => String(v), resumo: "resumo", alvo });

test("45 · tendência (DOM): 3 séries e 3 botões de legenda; esconder uma série reescala e some do SVG; a última ligada não desliga; setas leem dia a dia", () => {
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT(alvo));
  const svg = alvo.querySelector("svg");
  assert.ok(svg && svg.getAttribute("role") === "img");
  assert.equal(alvo.querySelectorAll("path.g-linha").length, 3); assert.equal(alvo.querySelectorAll("path.g-area").length, 1);
  assert.equal(alvo.querySelectorAll(".g-leg-b").length, 3);
  assert.ok(alvo.querySelectorAll(".g-grade text").some(t => /^R\$/.test(t.textContent)), "eixo da esquerda em R$");
  assert.equal(g.alternar("gasto"), true);
  assert.equal(alvo.querySelector('.g-leg-b[data-serie="gasto"]').getAttribute("aria-pressed"), "false");
  assert.equal(alvo.querySelectorAll("path.g-linha").length, 2); assert.equal(alvo.querySelectorAll("path.g-area").length, 0);
  assert.ok(!alvo.querySelectorAll(".g-grade text").some(t => /^R\$/.test(t.textContent)), "sem série de R$ o eixo da esquerda some");
  g.alternar("conversas");
  assert.equal(g.alternar("agendadas"), false, "a última série ligada fica"); assert.deepEqual(g.ativas, ["agendadas"]);
  alvo.querySelector('.g-leg-b[data-serie="gasto"]').click();
  assert.deepEqual(g.ativas.sort(), ["agendadas", "gasto"]);
  const caixa = alvo.querySelector(".g-tendencia"), dica = alvo.querySelector(".g-dica");
  assert.equal(dica.hidden, true);
  caixa.emitir("keydown", { key: "ArrowRight" });
  assert.equal(dica.hidden, false); assert.equal(g.atual, 0); assert.match(dica.textContent, /^dia \d\d\/\d\d — investimento R\$ [\d.]+ · \d+ agendamentos?$/);
  assert.doesNotMatch(dica.textContent, /conversa/, "série escondida não entra na leitura");
  caixa.emitir("keydown", { key: "End" }); assert.equal(g.atual, serieT.length - 1);
  caixa.emitir("keydown", { key: "ArrowLeft" }); assert.equal(g.atual, serieT.length - 2);
  assert.equal(alvo.querySelector(".g-mira").getAttribute("visibility"), null);
  caixa.emitir("keydown", { key: "Escape" }); assert.equal(dica.hidden, true); assert.equal(alvo.querySelector(".g-mira").getAttribute("visibility"), "hidden");
  g.destruir();
});

test("49 · sparkline (DOM): sem graficos.sparkline desenha o fallback; com ela, delega; menos de 2 pontos não desenha nada", () => {
  const alvo = new No("span");
  assert.equal(A.desenharSparkline({ G: {}, L, alvo, valores: [1, 2, 3] }).tag, "svg");
  assert.equal(alvo.querySelectorAll("polyline").length, 2); assert.ok(alvo.querySelector("circle.spark-fim"));
  const chamadas = [];
  const alvo2 = new No("span");
  A.desenharSparkline({ G: { sparkline: (a, o) => { chamadas.push(o); return { destruir() {} }; } }, L, alvo: alvo2, valores: [1, 2], rotulo: "r" });
  assert.equal(chamadas.length, 1); assert.deepEqual(chamadas[0].valores, [1, 2]); assert.equal(chamadas[0].rotulo, "r");
  assert.equal(A.desenharSparkline({ G: {}, L, alvo: new No("span"), valores: [7] }), null);
});

test("46 · funil por plataforma (DOM): uma coluna por plataforma, barras proporcionais e «sem base» quando não há denominador", () => {
  const el = A.criarFunilPlataformas({ h, dados: L.funilPorPlataforma(M, { dias: 30 }), fmtInt: String, fmtMoeda: v => `R$ ${Math.round(v)}`, pctTxt: v => `${v}%` });
  assert.equal(el.querySelectorAll(".ads-fp-col").length, 2);
  assert.equal(el.querySelectorAll(".ads-fp-meta .ads-fp-etapa").length, 4);
  const barras = el.querySelectorAll(".ads-fp-meta .ads-fp-barra").map(b => parseFloat(b.style.getPropertyValue("--w")));
  assert.equal(barras[0], 100); assert.ok(barras.every(w => w >= 0 && w <= 100));
  const semBase = A.criarFunilPlataformas({ h, dados: [{ plat: "google", nome: "Google", gasto: 5, receita: 0, max: 0, etapas: [{ id: "a", rotulo: "A", v: 0 }, { id: "b", rotulo: "B", v: 0 }], taxas: [{ de: "a", para: "b", pct: null }] }] });
  assert.match(semBase.textContent, /sem base/);
  assert.match(A.criarFunilPlataformas({ h, dados: [] }).textContent, /Nenhuma plataforma/);
});

test("47 · calor semanal (DOM): 7 linhas × n semanas, título legível por célula, pico marcado e escala", () => {
  const cal = L.calorSemanal(M, { dias: 30 });
  const el = A.criarCalorSemanal({ h, calor: cal, dias: L.SEMANA, fmt: v => `${v} conversas`, nivel: G.nivelCalor, resumo: "r" });
  const celulas = el.querySelectorAll(".ads-cal .g-cal-c");
  assert.equal(celulas.length, 7 * cal.semanas.length);
  assert.equal(el.querySelectorAll(".ads-cal-pico").length, 1);
  assert.ok(celulas.every(c => /^(dom|seg|ter|qua|qui|sex|sáb) · semana de \d\d\/\d\d: \d+ conversas$/.test(c.getAttribute("title"))));
  assert.equal(el.querySelector(".ads-cal").style.getPropertyValue("--n"), String(cal.semanas.length));
  assert.equal(el.querySelectorAll(".g-cal-escala .g-cal-c").length, 6);
});

test("51 · semáforo (DOM): cor do cartão, luzes acesas, frase e filtro que avisa e marca o botão", () => {
  const R = L.montarRadar(M, { alertas: [], integracoes: [] });
  const sem = L.semaforoRadar(R);
  const mudancas = [];
  const c = A.criarSemaforoRadar({ h, semaforo: sem, filtro: "todos", aoFiltrar: f => mudancas.push(f) });
  assert.ok(c.elemento.classList.contains(`ads-semaforo-${sem.cor}`));
  assert.equal(c.elemento.querySelectorAll(".ads-sem-luz.acesa").length, Object.values(sem.contagens).filter(Boolean).length);
  assert.equal(c.elemento.querySelector(".ads-sem-frase").textContent, sem.frase);
  assert.match(c.elemento.querySelector(".ads-sem-acao").textContent, /Sugestão/);
  c.elemento.querySelector('[data-filtro="ativos"]').click();
  assert.deepEqual(mudancas, ["ativos"]); assert.equal(c.filtro, "ativos");
  assert.equal(c.elemento.querySelector('[data-filtro="ativos"]').getAttribute("aria-pressed"), "true");
  assert.equal(c.elemento.querySelector('[data-filtro="todos"]').getAttribute("aria-pressed"), "false");
  c.elemento.querySelector('[data-filtro="ativos"]').click();
  assert.equal(mudancas.length, 1, "repetir o filtro atual não dispara de novo");
});

test("51 · semáforo (DOM): luzes com plural no leitor de tela; sem números de anúncio o cartão fica neutro (sem verde) e quem gere ganha «Conectar em Ajustes de anúncios»", () => {
  const ep = (sev, regra) => ({ chave: `${regra}|x`, regra, nome: "n", sev, ativo: true, msg: "", acao: "Pausar" });
  const varios = A.criarSemaforoRadar({ h, semaforo: L.semaforoRadar({ conexoes: [], episodios: [ep("alerta", "r1"), ep("alerta", "r2"), ep("info", "r3"), ep("info", "r4")] }) });
  assert.deepEqual(varios.elemento.querySelectorAll(".ads-sem-luz").map(l => l.getAttribute("aria-label")), ["0 críticos", "2 pontos de atenção", "2 informativos"]);
  const um = A.criarSemaforoRadar({ h, semaforo: L.semaforoRadar({ conexoes: [{ ativo: true, nome: "Meta", a: {} }], episodios: [ep("alerta", "r1"), ep("info", "r3")] }) });
  assert.deepEqual(um.elemento.querySelectorAll(".ads-sem-luz").map(l => l.getAttribute("aria-label")), ["1 crítico", "1 ponto de atenção", "1 informativo"]);
  // radar de uma conta sem nenhum número (como abaRadar monta): neutro, nenhuma luz acesa, nada de «Tudo dentro do combinado»
  const Mvazio = { LINHAS: [], REGRAS: [] };
  const R = L.montarRadar(Mvazio, { alertas: [], integracoes: [] });
  const neutro = A.criarSemaforoRadar({ h, semaforo: L.semaforoRadar(R, { semDados: L.semAnuncios(Mvazio) }), link: { rotulo: "Conectar em Ajustes de anúncios", href: "#/config/anuncios" } });
  assert.ok(neutro.elemento.classList.contains("ads-semaforo-neutro")); assert.ok(!neutro.elemento.classList.contains("ads-semaforo-ok"));
  assert.equal(neutro.elemento.querySelectorAll(".ads-sem-luz.acesa").length, 0);
  assert.equal(neutro.elemento.querySelector(".ads-sem-frase").textContent, "Ainda sem números de anúncio para avaliar.");
  const link = neutro.elemento.querySelector("a.ads-sem-link");
  assert.equal(link.getAttribute("href"), "#/config/anuncios"); assert.equal(link.textContent, "Conectar em Ajustes de anúncios");
  assert.equal(A.criarSemaforoRadar({ h, semaforo: L.semaforoRadar(R, { semDados: true }) }).elemento.querySelector("a.ads-sem-link"), null, "sem `link` (quem não gere): sem botão");
});

test("50 · PNG (DOM): o rótulo leva o nome do gráfico (dois gráficos na tela não têm o mesmo nome para o leitor de tela)", () => {
  const a = A.botaoPng({ h, alvo: new No("div"), nome: "x.png", L, titulo: "Tendência" });
  const b = A.botaoPng({ h, alvo: new No("div"), nome: "y.png", L, titulo: "Investimento diário" });
  assert.equal(a.getAttribute("aria-label"), "Baixar «Tendência» em PNG"); assert.equal(b.getAttribute("aria-label"), "Baixar «Investimento diário» em PNG");
  assert.equal(A.botaoPng({ h, alvo: new No("div"), nome: "z.png", L }).getAttribute("aria-label"), "Baixar gráfico em PNG", "sem título, o rótulo genérico");
  const falhas = [];
  A.botaoPng({ h, alvo: new No("div"), nome: "z.png", L, titulo: "T", aoFalhar: t => falhas.push(t) }).click();
  assert.match(falhas[0], /não tem gráfico/);
  // as chamadas das telas passam o título (anúncios: tendência e investimento diário; relatórios: o título do cartão)
  const ads = ler("anuncios.js"), rel = ler("relatorios.js");
  assert.match(ads, /botaoPng\(\{ h, alvo: alvoT, [^\n]{0,200}?titulo: "Tendência"/); assert.match(ads, /botaoPng\(\{ h, alvo: alvoG, [^\n]{0,200}?titulo: "Investimento diário"/);
  assert.match(rel, /X\.botaoPng\(\{ h, alvo, L, titulo,/);
  assert.equal((ads.match(/botaoCsv\("[^"]+", \[/g) || []).length, (ads.match(/\), "(Tendência|Investimento diário|Do anúncio à venda, por plataforma|Quando as conversas de anúncio chegam)"\)/g) || []).length, "cada CSV com o nome do bloco");
});

test("48 · barras por campanha (DOM): ordenadas pelo investimento, no máximo 8, destaque pela comparação, realce ao passar e clique que escolhe", () => {
  const { linhas } = L.linhasCampanhas(M, { dias: 30 });
  const escolhidas = [];
  const b = A.criarBarrasCampanhas({ h, linhas, fmtMoeda: v => `R$ ${Math.round(v)}`, fmtInt: String, nomePlat: L.nomePlat, aoEscolher: r => escolhidas.push(r.c.id) });
  const itens = b.elemento.querySelectorAll(".ads-cb-item");
  assert.ok(itens.length > 1 && itens.length <= 8);
  const gastos = itens.map(i => linhas.find(r => String(r.c.id) === i.dataset.campId).t.gasto);
  assert.deepEqual(gastos, gastos.slice().sort((x, y) => y - x));
  assert.equal(itens[0].querySelector(".ads-cb-barra").style.getPropertyValue("--w"), "100.0%");
  b.destacar([linhas[1].c.id]);
  assert.equal(b.elemento.querySelectorAll('.ads-cb-item[aria-pressed="true"]').length, 1);
  assert.equal(b.itens.get(String(linhas[1].c.id)).getAttribute("aria-pressed"), "true");
  b.realcar(linhas[0].c.id); assert.ok(b.itens.get(String(linhas[0].c.id)).classList.contains("ads-cb-hover"));
  b.realcar(null); assert.ok(!b.itens.get(String(linhas[0].c.id)).classList.contains("ads-cb-hover"));
  itens[0].click(); assert.equal(String(escolhidas[0]), itens[0].dataset.campId); assert.equal(escolhidas.length, 1);
  assert.equal(A.criarBarrasCampanhas({ h, linhas: Array.from({ length: 12 }, (_, i) => ({ c: { id: i, nome: `c${i}`, plat: "meta" }, t: { gasto: i, conversoes: 0 }, k: { agendadas: 0 } })) }).elemento.querySelectorAll(".ads-cb-item").length, 8);
});

/* ============================================================ amarras na tela (complemento) */
test("as telas usam as peças novas e a folha de estilo cobre celular, movimento reduzido e impressão", () => {
  // plano 100: os KPIs do Anúncios passaram para ui.kpi (a sparkline vem por `serie`); o desenharSparkline segue nos Relatórios
  const ads = ler("anuncios.js"), rel = ler("relatorios.js"), css = ler("relatorios.css");
  for (const re of [/L\.serieTendencia\(M/, /criarGraficoTendencia\(alvoT/, /L\.funilPorPlataforma\(M/, /L\.calorSemanal\(M/, /typeof G\.donut === "function" \? G\.donut : G\.rosca/, /criarBarrasCampanhas\(\{ h, linhas/, /L\.semaforoRadar\(R, \{ semDados \}\)/, /const semDados = L\.semAnuncios\(M\);/, /L\.explicarRegra\(/, /botaoPng\(\{ h, alvo: alvoT/, /serie: k\.serie \? sparkDe\(k\.serie\)/]) assert.match(ads, re, String(re));
  for (const re of [/import\(`\.\/anuncios\.js\?v=\$\{ctx\.versao\}`\)/, /X\.desenharSparkline\(/, /png: "vendas-dia-a-dia"/, /png: "atendimento-dia-a-dia"/, /L\.melhorDia\(serie/, /L\.faixasCalor\(m\)/, /window\.print\(\)/]) assert.match(rel, re, String(re));
  assert.match(css, /@media print \{[\s\S]*\.rel-filtros, \.rel-topo-acoes[\s\S]*display: none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.rel \*, \.rel \*::before, \.rel \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 760px\) \{ \.g-leg-b \{ min-height: 44px; \} \}/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.ads-sem-topo \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 760px\) \{ \.ads-regra-det summary \{ min-height: 44px; \} \}/, "«Como a regra funciona» com 44 px no toque");
  assert.match(css, /\.ads-semaforo-neutro \{ border-left-color: var\(--c-borda-2\); \}/, "neutro sem a cor verde");
  const bloco = css.slice(css.indexOf("PLANO 50 — frente F"));
  assert.doesNotMatch(bloco, /transition: all/);
  assert.doesNotMatch(bloco.slice(0, bloco.indexOf("@media print")), /#[0-9a-f]{3,6}\b/i, "cores só por token (o papel branco da impressão é a única exceção)");
});
