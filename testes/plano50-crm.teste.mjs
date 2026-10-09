/* ÓRBITA — plano «50+ melhorias» (04/10/2026), frente C (CRM). node --test testes/plano50-crm.teste.mjs
   (a) lógica pura nova do crm-logica.js; (b) comportamento das telas num DOM de mentira (Kanban, Tarefas, linha do tempo,
   Contatos, Empresas, Importação); (c) complementos estáticos do crm.css. Sem rede, sem serviços reais. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const L = await import("../web/app/crm-logica.js");
const tique = () => new Promise(r => setTimeout(r, 0));
const DIA = 86400000;
const iso = (dias, hora = 12) => new Date(Date.UTC(2026, 9, 4 + dias, hora)).toISOString();   // 04/10/2026 (UTC) ± dias
const HOJE = "2026-10-04";

/* ============================================================ (a) lógica */
test("faixaTempoEtapa: sem prazo usa 3/7 dias; com sla_horas usa metade/inteiro; sempre há um fio visível; sem data → null", () => {
  const agora = new Date("2026-10-04T12:00:00Z");
  const h = n => new Date(agora.getTime() - n * 3600000).toISOString();
  assert.equal(L.faixaTempoEtapa(null, null, agora), null);
  assert.equal(L.faixaTempoEtapa("data ruim", null, agora), null);
  const hoje = L.faixaTempoEtapa(h(1), null, agora);
  assert.equal(hoje.nivel, "ok"); assert.ok(hoje.pct >= .04, "um fio sempre aparece"); assert.ok(hoje.padrao); assert.match(hoje.texto, /hoje/);
  assert.equal(L.faixaTempoEtapa(h(71), null, agora).nivel, "ok");
  assert.equal(L.faixaTempoEtapa(h(72), null, agora).nivel, "aten");
  assert.equal(L.faixaTempoEtapa(h(167), null, agora).nivel, "aten");
  const ruim = L.faixaTempoEtapa(h(240), null, agora);
  assert.equal(ruim.nivel, "ruim"); assert.equal(ruim.pct, 1); assert.equal(ruim.limiteHoras, 168); assert.match(ruim.texto, /Passou do prazo/);
  // com prazo da etapa (48 h): verde até 24 h, âmbar até 48 h, vermelho depois
  assert.equal(L.faixaTempoEtapa(h(10), 48, agora).nivel, "ok");
  const meio = L.faixaTempoEtapa(h(30), 48, agora);
  assert.equal(meio.nivel, "aten"); assert.ok(!meio.padrao); assert.equal(meio.limiteHoras, 48); assert.match(meio.texto, /48 h/);
  assert.equal(L.faixaTempoEtapa(h(49), 48, agora).nivel, "ruim");
  assert.equal(L.faixaTempoEtapa(h(49), "0", agora).limiteHoras, 168, "sla inválido cai no padrão");
  assert.deepEqual(L.PRAZO_ETAPA_PADRAO_H, { aten: 72, ruim: 168 });
});

const estagios = [
  { id: "s1", nome: "Nova", tipo: "aberto", probabilidade: 10, ordem: 1, cor: "#6FA3CF" }, { id: "s2", nome: "Orçamento", tipo: "aberto", probabilidade: 50, ordem: 2 },
  { id: "s5", nome: "Fechou", tipo: "ganho", probabilidade: 100, ordem: 3 }, { id: "s6", nome: "Perdido", tipo: "perdido", probabilidade: 0, ordem: 4 }];
const colunas = [
  { estagio_id: "s1", total: 4, soma_previsto: 400, soma_valor: 0, itens: [] }, { estagio_id: "s2", total: 2, soma_previsto: 300, soma_valor: 0, itens: [] },
  { estagio_id: "s5", total: 2, soma_previsto: 0, soma_valor: 900, itens: [] }, { estagio_id: "s6", total: 2, soma_previsto: 50, soma_valor: 0, itens: [] }];

test("participacaoEtapas: abertas em relação às abertas, fechadas em relação ao quadro todo", () => {
  const p = L.participacaoEtapas(colunas, estagios);
  assert.deepEqual(p.get("s1"), { n: 4, fracao: .667, pct: 67 });
  assert.deepEqual(p.get("s2"), { n: 2, fracao: .333, pct: 33 });
  assert.deepEqual(p.get("s5"), { n: 2, fracao: .2, pct: 20 });
  assert.deepEqual(L.participacaoEtapas([], estagios).size, 0);
  assert.equal(L.participacaoEtapas([{ estagio_id: "s1", total: 0 }], estagios).get("s1").pct, 0, "sem divisão por zero");
});

test("resumoFunil: «chegaram» acumula para a frente (ganho conta, perdido não), conversão entre etapas e largura pelo topo", () => {
  const r = L.resumoFunil(colunas, estagios);
  assert.deepEqual(r.map(x => [x.id, x.n, x.chegaram, x.pctTopo, x.conversao]), [["s1", 4, 8, 1, .5], ["s2", 2, 4, .5, .5], ["s5", 2, 2, .25, null]]);
  assert.equal(r[2].valor, 900, "a etapa de ganho mostra o valor final"); assert.equal(r[0].valor, 400); assert.equal(r[0].cor, "#6FA3CF");
  assert.deepEqual(L.resumoFunil(colunas, estagios.filter(e => e.tipo !== "aberto")), [], "sem etapa aberta não há resumo");
  const vazio = L.resumoFunil([], estagios);
  assert.deepEqual(vazio.map(x => [x.chegaram, x.pctTopo, x.conversao]), [[0, 0, null], [0, 0, null], [0, 0, null]], "quadro vazio: zeros, sem NaN");
  // etapas fora de ordem no array entram pela `ordem`
  const r2 = L.resumoFunil(colunas, [estagios[1], estagios[2], estagios[0]]);
  assert.deepEqual(r2.map(x => x.id), ["s1", "s2", "s5"]);
  assert.deepEqual(r.fora, [], "sem etapa lateral, nada fica de fora");
});

/* o funil padrão de odonto (o mesmo do dev-falso e do modelo da migração): «Faltou» fica ENTRE «Avaliou / orçamento» e «Fechou tratamento»,
   mas é desvio que sai de «Agendada», não degrau — não pode ganhar «chegaram» nem taxa */
const etapasOdonto = [
  { id: "s1", nome: "Nova conversa", tipo: "aberto", marco: "nova", probabilidade: 10, ordem: 1 }, { id: "s2", nome: "Avaliação agendada", tipo: "aberto", marco: "agendada", probabilidade: 30, ordem: 2 },
  { id: "s3", nome: "Avaliou / orçamento", tipo: "aberto", marco: "orcamento", probabilidade: 50, ordem: 3 }, { id: "s4", nome: "Faltou", tipo: "aberto", marco: "faltou", probabilidade: 10, ordem: 4, cor: "#C9BFAF" },
  { id: "s5", nome: "Fechou tratamento", tipo: "ganho", marco: "fechou", probabilidade: 100, ordem: 5 }, { id: "s6", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0, ordem: 6 }];
const colunasOdonto = (faltas = 0) => [
  { estagio_id: "s1", total: 1, soma_previsto: 950, soma_valor: 0, itens: [] }, { estagio_id: "s2", total: 1, soma_previsto: 6800, soma_valor: 0, itens: [] },
  { estagio_id: "s3", total: 1, soma_previsto: 5200, soma_valor: 0, itens: [] }, { estagio_id: "s4", total: faltas, soma_previsto: 0, soma_valor: 0, itens: [] },
  { estagio_id: "s5", total: 1, soma_previsto: 0, soma_valor: 1450, itens: [] }, { estagio_id: "s6", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }];

test("resumoFunil: etapa com marco «faltou» fica FORA da sequência (sem «chegaram» nem taxa), só com a contagem em `fora`", () => {
  const r = L.resumoFunil(colunasOdonto(0), etapasOdonto);
  assert.deepEqual(r.map(x => [x.id, x.chegaram, x.conversao]), [["s1", 4, .75], ["s2", 3, .667], ["s3", 2, .5], ["s5", 1, null]],
    "o ganho não «passou» por Faltou e o orçamento segue direto para Fechou");
  assert.deepEqual(r.fora, [{ id: "s4", nome: "Faltou", cor: "#C9BFAF", n: 0 }]);
  // 5 faltas e nenhum ganho: quem faltou não conta como tendo chegado a «Avaliou / orçamento» (antes: 15 chegavam e as taxas se distorciam)
  const comFaltas = L.resumoFunil(colunasOdonto(5).map(c => (c.estagio_id === "s5" ? { ...c, total: 0 } : c)), etapasOdonto);
  assert.deepEqual(comFaltas.map(x => [x.id, x.chegaram]), [["s1", 3], ["s2", 2], ["s3", 1], ["s5", 0]]);
  assert.equal(comFaltas.fora[0].n, 5);
  assert.ok(comFaltas.every(x => x.id !== "s4"));
});

test("rotuloDia e agruparPorDia: Hoje/Ontem/Amanhã, dia da semana, «Sem data» no fim, ordem asc/desc", () => {
  assert.equal(L.rotuloDia("2026-10-04", HOJE), "Hoje");
  assert.equal(L.rotuloDia("2026-10-03", HOJE), "Ontem");
  assert.equal(L.rotuloDia("2026-10-05", HOJE), "Amanhã");
  assert.equal(L.rotuloDia("2026-10-09", HOJE), "Sex, 09/10");
  assert.equal(L.rotuloDia("2027-01-02", HOJE), "Sáb, 02/01/2027", "outro ano mostra o ano");
  assert.equal(L.rotuloDia("", HOJE), "Sem data");
  const itens = [{ id: 1, em: iso(0) }, { id: 2, em: iso(-1) }, { id: 3, em: null }, { id: 4, em: iso(0, 15) }, { id: 5, em: iso(3) }];
  const g = L.agruparPorDia(itens, { instanteDe: x => x.em, hoje: HOJE });
  assert.deepEqual(g.map(x => [x.rotulo, x.itens.map(i => i.id)]), [["Ontem", [2]], ["Hoje", [1, 4]], ["Qua, 07/10", [5]], ["Sem data", [3]]]);
  const d = L.agruparPorDia(itens, { instanteDe: x => x.em, hoje: HOJE, ordem: "desc" });
  assert.deepEqual(d.map(x => x.rotulo), ["Qua, 07/10", "Hoje", "Ontem", "Sem data"]);
  assert.deepEqual(L.agruparPorDia([], { instanteDe: x => x.em, hoje: HOJE }), []);
});

test("densidadeLista, cabecalhoPrevia, resumoEmpresa e pctInteiro", () => {
  assert.equal(L.densidadeLista("compacta"), "compacta");
  assert.equal(L.densidadeLista("qualquer"), "confortavel");
  assert.equal(L.densidadeLista(null), "confortavel");
  const cab = L.cabecalhoPrevia(["Nome", "", "Convênio"], ["nome", null, "campo:convenio"], [{ valor: "nome", rotulo: "Nome" }, { valor: "campo:convenio", rotulo: "Campo: Convênio" }]);
  assert.deepEqual(cab, [{ i: 0, coluna: "Nome", destino: "nome", rotulo: "Nome" }, { i: 1, coluna: "Coluna 2", destino: null, rotulo: "Ignorada" }, { i: 2, coluna: "Convênio", destino: "campo:convenio", rotulo: "Convênio" }]);
  assert.deepEqual(L.resumoEmpresa({ contatos: [{}, {}], negocios: [{ status: "aberto", valor_previsto: 100 }, { valor_previsto: 50.5 }, { status: "ganho", valor: 900 }, { status: "perdido", valor_previsto: 10 }] }),
    { contatos: 2, abertos: 2, valorAberto: 150.5, ganhos: 1, valorGanho: 900 });
  assert.deepEqual(L.resumoEmpresa(null), { contatos: 0, abertos: 0, valorAberto: 0, ganhos: 0, valorGanho: 0 });
  assert.equal(L.pctInteiro(.6667), "67%"); assert.equal(L.pctInteiro(null), "—"); assert.equal(L.pctInteiro(0), "0%");
});

/* ============================================================ DOM de mentira (elementos, classes, dataset, ouvintes, seletores simples e descendentes) */
function domDeMentira({ medias = {} } = {}) {
  let ativo = null, sobOPonto = null;
  const rolagens = [];
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
      this._cls = new Set(); this._l = {}; this._t = ""; this.rect = null; this.scrollLeft = 0; this.scrollTop = 0; this.checked = false;
      this.style = new Proxy({}, { get: (o, p) => (p === "setProperty" ? (a, b) => { o[a] = b; } : p === "getPropertyValue" ? a => o[a] : o[p]), set: (o, p, v) => { o[p] = v; return true; } });
      const eu = this;
      this.classList = { add: (...c) => c.forEach(x => eu._cls.add(x)), remove: (...c) => c.forEach(x => eu._cls.delete(x)), contains: c => eu._cls.has(c),
        toggle: (c, f) => { const on = f === undefined ? !eu._cls.has(c) : !!f; if (on) eu._cls.add(c); else eu._cls.delete(c); return on; } };
    }
    get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
    get className() { return [...this._cls].join(" "); }
    get value() { return this._v ?? ""; } set value(v) { this._v = v; }
    setAttribute(a, v) { this.attrs[a] = String(v); } getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; } removeAttribute(a) { delete this.attrs[a]; }
    get els() { return this.children.filter(c => c instanceof El); }
    appendChild(c) { if (c instanceof El) { c.remove(); c.parentElement = this; } this.children.push(c); return c; }
    // como o append NATIVO: null/undefined viram o texto «null»/«undefined» (o h() de mentira filtra antes, como o ui.h)
    append(...cs) { for (const c of cs) this.appendChild(c instanceof El ? c : { texto: String(c) }); }
    appendFiltrado(...cs) { for (const c of cs.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; this.appendChild(c instanceof El ? c : { texto: String(c) }); } }
    prepend(...cs) { const antigos = this.children; this.children = []; this.append(...cs); this.children.push(...antigos); }
    insertBefore(n, ref) { n.remove(); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentElement = this; return n; }
    after(...ns) { const p = this.parentElement; if (!p) return; let ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    remove() { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentElement = null; }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    contains(x) { for (let n = x; n; n = n.parentElement) if (n === this) return true; return false; }
    get isConnected() { return doc.body.contains(this); } get offsetWidth() { return 0; } get offsetParent() { return this.parentElement; }
    matches(sel) { return sel.split(",").some(s => this._desc(s.trim().split(/\s+/))); }
    _desc(partes) {
      if (!this._m(partes[partes.length - 1])) return false;
      if (partes.length === 1) return true;
      for (let p = this.parentElement; p; p = p.parentElement) if (p._desc(partes.slice(0, -1))) return true;
      return false;
    }
    _m(s) {
      const m = /^([a-z0-9]*)((?:\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\))*)$/i.exec(s);
      if (!m) throw new Error("seletor não suportado no DOM de mentira: " + s);
      if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
      for (const p of m[2].match(/\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\)/g) || []) {
        if (p[0] === ".") { if (!this._cls.has(p.slice(1))) return false; continue; }
        if (p === ":not([hidden])") { if (this.hidden) return false; continue; }
        const a = /^\[([\w-]+)(?:=(?:"([^"]*)"|([\w-]+)))?\]$/.exec(p);
        const esperado = a[2] !== undefined ? a[2] : a[3];
        const v = a[1].startsWith("data-") ? this.dataset[a[1].slice(5)] : this.attrs[a[1]];
        if (v === undefined || v === null || (esperado !== undefined && String(v) !== esperado)) return false;
      }
      return true;
    }
    querySelectorAll(sel) { const out = []; (function ir(n) { for (const c of n.els) { if (c.matches(sel)) out.push(c); ir(c); } })(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
    addEventListener(t, f) { (this._l[t] || (this._l[t] = [])).push(f); } removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
    dispara(t, ev = {}) { for (const f of [...(this._l[t] || [])]) f({ type: t, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
    clique() { this.dispara("click"); }
    getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
    focus() { ativo = this; } blur() { if (ativo === this) ativo = null; } select() {} scrollTo(o) { rolagens.push({ el: this, ...o }); } scrollIntoView() { rolagens.push({ el: this, into: true }); }
    cloneNode() { const c = new El(this.tagName); c._cls = new Set(this._cls); c.attrs = { ...this.attrs }; c.dataset = { ...this.dataset }; return c; }
    get textContent() { return this._t + this.children.map(c => (c instanceof El ? c.textContent : c.texto)).join(""); }
    set textContent(v) { for (const c of this.els) c.parentElement = null; this.children = []; this._t = String(v ?? ""); }
    get innerText() { return this.textContent; }
  }
  const h = (tag, attrs, ...filhos) => {
    const el = new El(tag);
    for (const [a, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (a === "class") [].concat(v).flat(Infinity).filter(Boolean).forEach(c => String(c).split(/\s+/).filter(Boolean).forEach(x => el._cls.add(x)));
      else if (a === "dataset") for (const [x, y] of Object.entries(v)) el.dataset[x] = String(y);
      else if (a === "style") for (const [x, y] of Object.entries(v || {})) el.style[x] = y;
      else if (a === "on") for (const [x, y] of Object.entries(v)) el.addEventListener(x, y);
      else if (a === "hidden" || a === "disabled" || a === "checked" || a === "selected") el[a] = !!v;
      else if (a === "value") el.value = v;
      else el.setAttribute(a, v === true ? "" : v);
    }
    el.appendFiltrado(...filhos);
    return el;
  };
  const daJanela = {}, doDoc = {};
  const doc = { body: new El("body"), hidden: false, get activeElement() { return ativo || this.body; },
    addEventListener: (t, f) => (doDoc[t] || (doDoc[t] = [])).push(f), removeEventListener: (t, f) => { doDoc[t] = (doDoc[t] || []).filter(x => x !== f); },
    getElementById: () => null, querySelector: sel => doc.body.querySelector(sel), elementFromPoint: () => sobOPonto, createTextNode: t => ({ texto: String(t) }) };
  const storage = new Map();
  const globais = { document: doc, addEventListener: (t, f) => (daJanela[t] || (daJanela[t] = [])).push(f), removeEventListener: (t, f) => { daJanela[t] = (daJanela[t] || []).filter(x => x !== f); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    matchMedia: q => ({ matches: !!medias[q] }), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, history: { state: null, replaceState() {} },
    location: { pathname: "/app/", search: "", hash: "#/crm" }, innerHeight: 800, scrollBy() {} };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  return { h, doc, daJanela, doDoc, storage, rolagens, ativo: () => ativo, sob: el => { sobOPonto = el || null; },
    documento: (t, ev = {}) => { for (const f of [...(doDoc[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    janela: (t, ev = {}) => { for (const f of [...(daJanela[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    desfazer() { for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}

/** ui de mentira: o suficiente para as telas do CRM montarem (cada stub devolve um elemento com a classe real). */
function uiDeMentira(h, registro = {}) {
  const seg = o => {
    const el = h("div", { class: ["seg", o.classe], role: "tablist", "aria-label": o.rotulo });
    for (const op of o.opcoes || []) el.appendChild(h("button", { type: "button", class: "seg-op", role: "tab", "aria-selected": String(op.valor === o.valor), dataset: { valor: op.valor },
      on: { click: () => { el.ativar(op.valor); if (o.aoMudar) o.aoMudar(op.valor); } } }, op.rotulo, h("span", { class: "seg-n" })));
    el.valor = o.valor;
    el.ativar = v => { el.valor = v; for (const b of el.querySelectorAll(".seg-op")) b.setAttribute("aria-selected", String(b.dataset.valor === v)); };
    el.contar = (id, n) => { const b = el.querySelectorAll(".seg-op").find(x => x.dataset.valor === id); if (b) b.querySelector(".seg-n").textContent = n == null ? "" : String(n); };
    el.__mudar = v => { el.ativar(v); if (o.aoMudar) o.aoMudar(v); };
    return el;
  };
  return {
    h, limpar: el => { el.textContent = ""; return el; }, icone: n => h("svg", { class: "ic", dataset: { n } }), debounce: f => f,
    cabecalho: o => h("header", { class: "cab" }, h("h1", { class: "cab-titulo" }, o.titulo), o.sub || null, ...[].concat(o.acoes || []).filter(Boolean)),
    segmentado: seg, abas: o => { const el = seg({ ...o, classe: "abas" }); return { el, ativar: el.ativar, contar: el.contar, get ativo() { return el.valor; } }; },
    esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: ["vazio", o.tipo && `vazio-${o.tipo}`] }, o.titulo || ""), erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    brl: (v, o) => `R$ ${o && o.centavos === false ? Math.round(Number(v)) : Number(v).toFixed(2)}`, num: v => String(v), pct: v => `${Math.round(v * 100)}%`,
    relativo: isoT => (Date.parse(isoT) < Date.now() ? "há 2 dias" : "amanhã"), hojeSP: d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10),
    dataBR: () => "04/10/2026", dataCurtaBR: () => "04/10", horaBR: isoT => String(isoT || "").slice(11, 16), dataHoraBR: isoT => `04/10/2026 ${String(isoT || "").slice(11, 16)}`, telBR: t => `(${String(t).slice(2, 4)}) …`,
    avatar: (nome, id) => h("span", { class: "avatar", dataset: { id: String(id) }, title: nome }), pilula: (t, cor, x = {}) => h("span", { class: ["pilula", `pilula-${cor}`, x.class], title: x.title || null, dataset: x.variante ? { variante: x.variante, chave: cor } : null }, String(t ?? cor)),
    etiqueta: e => h("span", { class: "etiq" }, e.nome),
    tabela: o => {
      const el = h("div", { class: "tabela-env" }, h("table", { class: "tabela" }, h("tbody")));
      registro.colunas = o.colunas;
      const api = { el, atualizar(l) { registro.linhas = l; const tb = el.querySelector("tbody"); tb.textContent = ""; for (const x of l) tb.appendChild(h("tr", null, o.colunas.map(c => h("td", null, c.render ? c.render(x) : x[c.chave])))); }, selecionados: () => [] };
      api.atualizar(o.linhas || []);
      return api;
    },
    toast: t => { (registro.toasts || (registro.toasts = [])).push(t); return { fechar() {} }; }, anunciar: t => { (registro.avisos || (registro.avisos = [])).push(t); }, comportamentoRolagem: () => "auto",
    acaoComDesfazer: o => new Promise(res => { (registro.desfazer || (registro.desfazer = [])).push({ ...o, res }); if (o.aplicar) o.aplicar(); }),
    modal: async () => null, confirmar: async () => true, menu: () => ({ fechar() {} }), deslizar: () => {}, flutuante: () => ({ fechar() {} }), carregando: async (b, p) => p,
    campo: o => h("label", { class: "campo", dataset: { campo: o.nome } }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : o.tipo === "select" ? "select" : "input", { name: o.nome, type: o.tipo === "interruptor" ? "checkbox" : "text", value: o.valor ?? "", checked: !!o.valor })),
    seletorEtiquetas: () => h("div", { class: "sel-etiq" }), seletorPessoa: () => h("select", { class: "sel" }), lerForm: () => ({}), marcarErro() {}, copiar: async () => {},
  };
}

/* ============================================================ (b) Kanban */
const cardsDoQuadro = () => ({ colunas: [
  { estagio_id: "s1", total: 2, soma_previsto: 300, soma_valor: 0, itens: [
    { id: 1, titulo: "Ana", status: "aberto", estagio_id: "s1", valor_previsto: 100, ordem: 1, estagio_em: new Date(Date.now() - 10 * DIA).toISOString(), contato: { id: 501, nome: "Ana Souza" }, origem: "whatsapp", tarefa: { vence_em: new Date(Date.now() + DIA).toISOString(), atrasada: false } },
    { id: 2, titulo: "Bia", status: "aberto", estagio_id: "s1", valor_previsto: 200, ordem: 2, estagio_em: new Date().toISOString(), contato: { id: 502, nome: "Bia Lima" }, origem: "manual" }] },
  { estagio_id: "s2", total: 1, soma_previsto: 50, soma_valor: 0, itens: [{ id: 3, titulo: "Caio", status: "aberto", estagio_id: "s2", valor_previsto: 50, ordem: 1, estagio_em: new Date(Date.now() - 30 * 3600000).toISOString() }] },
  { estagio_id: "s5", total: 1, soma_previsto: 0, soma_valor: 900, itens: [{ id: 4, titulo: "Dani", status: "ganho", estagio_id: "s5", valor: 900, ordem: 1 }] },
  { estagio_id: "s6", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }] });

async function montarKanbanDeMentira(D, { G = null, cli = "cli-50", etapas: etapasDadas = null, rpcC = null } = {}) {
  const { h } = D;
  const reg = { leituras: [], movidos: [] };
  const ui = uiDeMentira(h, reg);
  const etapas = etapasDadas || [{ id: "s1", nome: "Nova", tipo: "aberto", probabilidade: 10, ordem: 1 }, { id: "s2", nome: "Orçamento", tipo: "aberto", probabilidade: 50, ordem: 2, sla_horas: 48 },
    { id: "s5", nome: "Fechou", tipo: "ganho", probabilidade: 100, ordem: 3 }, { id: "s6", nome: "Perdido", tipo: "perdido", probabilidade: 0, ordem: 4 }];
  const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: etapas }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} };
  const k = { ui, h, L, base, G, v: { crm: "CRM", negocios: "Oportunidades", negocio: "Oportunidade", ganhar: "Fechou", perder: "Não fechou", min: x => ({ negocios: "oportunidades", negocio: "oportunidade" })[x] || x, art: () => "a", novo: () => "Nova oportunidade", nenhum: () => "Nenhuma oportunidade" },
    ctx: { cliente: { id: cli }, titulo() {}, navegar() {}, pulso: null },
    mod: async nome => nome === "visoes" ? { controlesVisoes: () => ({ el: h("div", { class: "crm-visoes" }), atualizar() {} }) }
      : ({ abrirNegocio() {}, novoNegocio() {}, prepararMovimento: async () => ({}), moverNegocio: async (k_, card, destino) => { reg.movidos.push({ id: card.id, para: destino.id }); return { id: card.id, estagio_id: destino.id }; } }),
    api: { rpcC: async (nome, p, o) => { reg.leituras.push(nome); if (rpcC) return rpcC(nome, p, o); return nome === "nx_negocios_kanban" ? cardsDoQuadro() : {}; } },
    pode: () => true, cor: c => c || null, usuario: () => null, etiqueta: () => null, toastErro() {}, erro: e => String(e && (e.codigo || e.message)),
    funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], funilDoEstagio: () => base.funis[0],
    estagio: id => etapas.find(x => x.id === id) || null, aoBaseMudar: () => () => {} };
  const { montarKanban } = await import("../web/app/crm-kanban.js");
  const tela = h("div", { class: "crm" });
  D.doc.body.appendChild(tela);
  const api = await montarKanban(k, tela, { query: {} });
  return { tela, api, reg, k };
}

test("Kanban (DOM): cartão com avatar, barra de tempo na etapa pelo prazo (ok/aten/ruim), próxima tarefa e selo da origem", async () => {
  const D = domDeMentira();
  try {
    const { tela, api } = await montarKanbanDeMentira(D);
    const cartao = id => tela.querySelector(`.kc[data-id="${id}"]`);
    // avatar do contato na 1ª linha, com o id do contato (cor estável)
    assert.equal(cartao(1).querySelector(".kc-l1 .avatar").dataset.id, "501");
    assert.ok(cartao(1).querySelector(".kc-l1 .kc-t"), "o título continua na 1ª linha");
    // 10 dias sem prazo → vermelho; hoje → verde; 30 h numa etapa com prazo de 48 h → âmbar
    assert.ok(cartao(1).querySelector(".kc-tempo.ruim") && cartao(1).classList.contains("kc-prazo-ruim"));
    assert.equal(cartao(1).querySelector(".kc-tempo i").style["--w"], "100%");
    assert.ok(cartao(2).querySelector(".kc-tempo.ok"));
    assert.ok(cartao(3).querySelector(".kc-tempo.aten"), "prazo da etapa (sla_horas) manda");
    assert.match(cartao(3).querySelector(".kc-tempo").attrs.title, /48 h/);
    assert.equal(cartao(4).querySelector(".kc-tempo"), null, "etapa fechada não tem barra");
    assert.ok(cartao(1).querySelector(".kc-dias.ruim"), "o texto «há 10 dias» fica vermelho junto");
    assert.match(cartao(1).attrs["aria-label"], /passou do prazo/i, "o leitor de tela ouve o prazo");
    // próxima tarefa com o prazo relativo; selo da origem (WhatsApp) quando não é anúncio; cadastro manual não ganha selo
    assert.equal(cartao(1).querySelector(".kc-tarefa-txt").textContent, "amanhã");
    // plano 100 · C4: o selo virou a pílula padrão de origem (ui.pilula variante «origem»)
    assert.equal(cartao(1).querySelector(".kc-origem-outra").dataset.chave, "whatsapp");
    assert.equal(cartao(1).querySelector(".kc-origem-outra").dataset.variante, "origem");
    assert.equal(cartao(2).querySelector(".kc-origem-outra"), null);
    api.desmontar();
  } finally { D.desfazer(); }
});

test("Kanban (DOM): mini-barra de participação na coluna, resumo do funil com conversão, recolher lembrado e versão em tabela", async () => {
  const D = domDeMentira({ medias: { "(min-height: 900px)": true } });   // tela alta: o resumo começa aberto
  try {
    const { tela, api, reg } = await montarKanbanDeMentira(D);
    const col = id => tela.querySelector(`.kb-col[data-estagio="${id}"]`);
    assert.equal(col("s1").querySelector(".kb-col-pct").textContent, "67%");
    assert.equal(col("s1").querySelector(".kb-col-prop").style["--w"], "66.7%", "a largura vai na trilha (o <i> herda a variável)");
    assert.equal(col("s2").querySelector(".kb-col-pct").textContent, "33%");
    assert.equal(col("s5").querySelector(".kb-col-pct").textContent, "25%", "fechadas em relação ao quadro todo");
    assert.match(col("s1").querySelector(".kb-col-prop").attrs["aria-label"], /67% das oportunidades abertas/);
    // resumo do funil: Nova (chegaram 4), Orçamento (2), Fechou (1); 50% seguem de Nova para Orçamento
    const fr = tela.querySelector(".crm-fr");
    assert.ok(fr && !fr.hidden);
    const its = fr.querySelectorAll(".crm-fr-it");
    assert.deepEqual(its.map(x => x.querySelector(".crm-fr-nome span").textContent), ["Nova", "Orçamento", "Fechou"]);
    assert.deepEqual(its.map(x => x.querySelector(".crm-fr-trilho b").textContent), ["4", "2", "1"]);
    assert.equal(its[0].querySelector(".crm-fr-barra").style["--w"], "100.0%");
    assert.equal(its[1].querySelector(".crm-fr-barra").style["--w"], "50.0%");
    assert.match(its[0].querySelector(".crm-fr-conv").textContent, /^50% seguem para Orçamento$/);
    assert.ok(its[0].querySelector(".crm-fr-conv").classList.contains("boa"));
    assert.match(its[2].querySelector(".crm-fr-conv").textContent, /fim do funil/);
    assert.match(its[2].querySelector(".crm-fr-agora").textContent, /1 agora/);
    assert.ok(fr.querySelector(".crm-fr-lista").classList.contains("anim"), "as barras crescem na entrada (sem movimento reduzido)");
    // a linha do resumo leva à coluna
    its[1].querySelector(".crm-fr-nome").clique();
    assert.ok(D.rolagens.some(r => r.el.classList.contains("kb")), "rolou o quadro até a coluna");
    // recolher: aria-expanded, corpo escondido e lembrado por empresa
    const cab = fr.querySelector(".crm-fr-cab");
    assert.equal(cab.attrs["aria-expanded"], "true", "em tela alta começa aberto");
    // a faixa compacta do cabeçalho (vale quando recolhido): ponto por etapa, quantos chegaram e a % que segue
    assert.deepEqual(fr.querySelectorAll(".crm-fr-mini b").map(b => b.textContent), ["4", "2", "1"]);
    assert.deepEqual(fr.querySelectorAll(".crm-fr-mini small").map(s => s.textContent), ["→ 50% →", "→ 50% →"]);
    assert.equal(fr.querySelectorAll(".crm-fr-mini-p").length, 3);
    assert.ok(!/null|undefined/.test(fr.querySelector(".crm-fr-mini").textContent), "o append nativo não pode receber null");
    cab.clique();
    assert.equal(cab.attrs["aria-expanded"], "false"); assert.ok(fr.querySelector(".crm-fr-corpo").hidden);
    assert.equal(D.storage.get("nx-app-crm-fr-cli-50"), "0");
    cab.clique();
    // versão em tabela com os mesmos números
    const bt = fr.querySelector(".crm-fr-vertabela");
    bt.clique();
    assert.equal(bt.attrs["aria-pressed"], "true"); assert.equal(bt.textContent, "Ver como barras");
    assert.ok(fr.querySelector(".crm-fr-lista").hidden && !fr.querySelector(".crm-fr-tabela").hidden);
    const linhas = fr.querySelectorAll(".crm-fr-tab tr").filter(tr => tr.querySelector("td"));
    assert.equal(linhas.length, 3);
    assert.deepEqual(linhas[0].querySelectorAll("td").map(td => td.textContent), ["4", "2", "R$ 300", "50%"]);
    // legenda da distribuição também leva à coluna
    D.rolagens.length = 0;
    tela.querySelectorAll(".crm-dist-leg-b")[2].clique();
    assert.ok(D.rolagens.length >= 1);
    assert.equal(reg.leituras.filter(x => x === "nx_negocios_kanban").length, 1, "nada disso pediu outra leitura ao servidor");
    api.desmontar();
  } finally { D.desfazer(); }
});

test("Kanban (DOM): no celular e em tela baixa (768 px) o resumo começa recolhido, com a faixa compacta; estado guardado vence o padrão", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const { tela, api } = await montarKanbanDeMentira(D, { cli: "cli-m" });
    assert.equal(tela.querySelector(".crm-fr-cab").attrs["aria-expanded"], "false");
    assert.ok(tela.querySelector(".crm-fr-corpo").hidden && tela.querySelectorAll(".crm-fr-mini b").length === 3, "recolhido, mas a faixa compacta tem os números");
    api.desmontar();
    const baixa = await montarKanbanDeMentira(domDeMentiraSemTrocar(D), { cli: "cli-b" });   // desktop de 768 px: nem pequena nem alta → recolhido
    assert.equal(baixa.tela.querySelector(".crm-fr-cab").attrs["aria-expanded"], "false");
    baixa.api.desmontar();
    D.storage.set("nx-app-crm-fr-cli-m", "1");
    const segunda = await montarKanbanDeMentira(D, { cli: "cli-m" });
    assert.equal(segunda.tela.querySelector(".crm-fr-cab").attrs["aria-expanded"], "true");
    segunda.api.desmontar();
  } finally { D.desfazer(); }
});

test("Kanban (DOM): totais contam ao entrar (G.contar) e acendem ao mudar (G.destacar); cartão solto ganha a animação; «/» foca a busca", async () => {
  const D = domDeMentira();
  try {
    const contados = [], destacados = [];
    const G = { contar: (el, v, fmt) => { contados.push(v); el.textContent = fmt(v); return el; }, destacar: el => { destacados.push(el.textContent); return el; } };
    const { tela, api, reg } = await montarKanbanDeMentira(D, { G });
    assert.deepEqual(contados, [3, 350, 55], "abertos, soma em aberto e previsão ponderada contam na 1ª pintura");
    assert.equal(destacados.length, 0);
    // arrasta o cartão 3 (Orçamento, R$ 50) para Nova: os totais mudam → acendem (abertos continua 3: não acende)
    const art = tela.querySelector('.kc[data-id="3"]');
    art.rect = { left: 10, top: 10, right: 210, bottom: 90 };
    art.dispara("pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientX: 20, clientY: 20 });
    D.sob(tela.querySelector('.kb-col[data-estagio="s1"] .kb-lista'));
    D.janela("pointermove", { pointerId: 1, clientX: 50, clientY: 50 });
    assert.ok(tela.querySelector(".kb-lugar"), "marcador na coluna de destino");
    D.janela("pointerup", { pointerId: 1 }); await tique(); await tique(); await tique();
    const solto = tela.querySelector('.kc[data-id="3"]');   // a coluna foi redesenhada: o cartão é um elemento novo
    assert.equal(solto.closest(".kb-col").dataset.estagio, "s1");
    assert.ok(solto.classList.contains("kc-solto") && solto.classList.contains("assenta"), "o cartão solto assenta com a animação");
    assert.deepEqual(reg.movidos, [{ id: 3, para: "s1" }]);
    assert.ok(destacados.includes("R$ 55") || destacados.includes("R$ 35"), "a previsão ponderada mudou (50 × 50% → 50 × 10%) e acendeu");
    assert.equal(contados.length, 3, "depois da 1ª pintura não conta de novo");
    // «/» fora de campo foca a busca; dentro de um campo não
    D.documento("keydown", { key: "/", target: D.doc.body });
    assert.equal(D.ativo().attrs.type, "search");
    api.desmontar();
  } finally { D.desfazer(); }
});

/* Totais com o graficos.js DE VERDADE e o relógio de quadros na mão: a 1ª pintura vem do quadro guardado (aoCache) e conta por rAF;
   a rede chega depois — no meio da contagem ou depois dela. */
async function kanbanComContagem(D, { rede, cli }) {
  const G = await import("../web/app/graficos.js");
  const frames = [];
  globalThis.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
  globalThis.getComputedStyle = () => ({ getPropertyValue: n => (n === "--t-dados" ? "900ms" : "") });
  D.doc.documentElement = D.doc.body;
  let liberar;
  const chegou = new Promise(r => { liberar = r; });
  const destacados = [];
  const Gk = { contar: G.contar, destacar: el => { destacados.push(el.textContent); return el; } };
  const m = await montarKanbanDeMentira(D, { G: Gk, cli, rpcC: async (nome, p, o) => {
    if (nome !== "nx_negocios_kanban") return {};
    o.aoCache(cardsDoQuadro());          // o último quadro guardado: abertos 3, em aberto R$ 350, previsão R$ 55
    await chegou;
    return rede();
  } });
  const tot = () => [...m.tela.querySelectorAll(".crm-tot")].slice(0, 3).map(t => { const b = t.querySelector("b"); return [b.textContent, b.getAttribute("aria-label")]; });
  const quadro = t => { for (const f of frames.splice(0)) f(t); };
  const rede_ = async () => { liberar(); for (let i = 0; i < 4; i++) await tique(); };
  return { ...m, tot, quadro, rede: rede_, destacados };
}
const quadroMaisDezMil = () => { const q = cardsDoQuadro(); q.colunas[0].soma_previsto += 10000; q.colunas[0].itens[0].valor_previsto += 10000; return q; };

test("Kanban (DOM): a rede que chega NO MEIO da contagem do quadro guardado vence (texto e aria-label) e acende; total igual segue contando sem acender", async () => {
  const D = domDeMentira();
  const gcs = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  try {
    const K = await kanbanComContagem(D, { rede: quadroMaisDezMil, cli: "cli-corrida" });
    assert.deepEqual(K.tot(), [["0", "3"], ["R$ 0", "R$ 350"], ["R$ 0", "R$ 55"]], "a 1ª pintura (cache) começou a contar; o aria-label já tem o valor final");
    K.quadro(performance.now() + 300);                                        // um terço da contagem: número parcial na tela
    assert.notEqual(K.tot()[1][0], "R$ 0");
    await K.rede();                                                           // a rede traz +R$ 10.000 na 1ª coluna
    K.quadro(performance.now() + 5000);                                       // os quadros que sobraram da contagem velha não podem pintar por cima
    assert.deepEqual(K.tot(), [["3", "3"], ["R$ 10350", "R$ 10350"], ["R$ 1055", "R$ 1055"]], "vale o valor da rede, no texto e no aria-label");
    assert.deepEqual(K.destacados.sort(), ["R$ 10350", "R$ 1055"], "só o que mudou acende (abertos continuou 3 e terminou a contagem)");
    K.api.desmontar();
  } finally { D.desfazer(); if (gcs) Object.defineProperty(globalThis, "getComputedStyle", gcs); else delete globalThis.getComputedStyle; }
});

test("Kanban (DOM): a rede que chega DEPOIS da contagem troca o texto e também o aria-label; a mesma soma com outro cartão não acende", async () => {
  const D = domDeMentira();
  const gcs = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  try {
    const K = await kanbanComContagem(D, { rede: quadroMaisDezMil, cli: "cli-depois" });
    K.quadro(performance.now() + 5000);
    assert.deepEqual(K.tot(), [["3", "3"], ["R$ 350", "R$ 350"], ["R$ 55", "R$ 55"]], "a contagem do cache terminou");
    await K.rede();
    assert.deepEqual(K.tot(), [["3", "3"], ["R$ 10350", "R$ 10350"], ["R$ 1055", "R$ 1055"]], "o aria-label não fica com o valor do cache");
    K.api.desmontar();
    // a rede muda um cartão (outro título) mas não os totais: no meio da contagem, nada de troca nem de destaque falso
    const K2 = await kanbanComContagem(D, { rede: () => { const q = cardsDoQuadro(); q.colunas[0].itens[1].titulo = "Bia (retorno)"; return q; }, cli: "cli-igual" });
    K2.quadro(performance.now() + 300);
    await K2.rede();
    assert.ok(K2.tela.querySelector('.kc[data-id="2"]').textContent.includes("Bia (retorno)"), "o quadro foi refeito com a rede");
    K2.quadro(performance.now() + 5000);
    assert.deepEqual(K2.tot(), [["3", "3"], ["R$ 350", "R$ 350"], ["R$ 55", "R$ 55"]]);
    assert.deepEqual(K2.destacados, [], "comparar com o número parcial acendia um destaque falso");
    K2.api.desmontar();
  } finally { D.desfazer(); if (gcs) Object.defineProperty(globalThis, "getComputedStyle", gcs); else delete globalThis.getComputedStyle; }
});

test("graficos.animarValor: uma contagem nova no mesmo elemento para a anterior (termina no 2º valor); o 1º quadro com t < t0 não pinta negativo", async () => {
  const G = await import("../web/app/graficos.js");
  const D = domDeMentira();
  const gcs = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  const frames = [];
  try {
    globalThis.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "900ms" });
    D.doc.documentElement = D.doc.body;
    const el = D.h("b"); D.doc.body.appendChild(el);
    G.contar(el, 100, n => String(Math.round(n)));
    frames.splice(0).forEach(f => f(performance.now() + 200));
    G.contar(el, 40, n => String(Math.round(n)));
    frames.splice(0).reverse().forEach(f => f(performance.now() + 5000));   // a nova termina primeiro; o quadro da velha vem depois e não pode pintar
    frames.splice(0).forEach(f => f(performance.now() + 9000));
    assert.equal(el.textContent, "40"); assert.equal(el.getAttribute("aria-label"), "40");
    assert.equal(el.__pararContagem, null, "terminou e soltou o cancelador");
    const vistos = [];
    const el2 = D.h("b"); D.doc.body.appendChild(el2);
    G.animarValor(el2, 500, n => vistos.push(n));
    frames.splice(0).forEach(f => f(performance.now() - 40));               // rAF com carimbo anterior ao performance.now() da partida
    assert.ok(vistos.every(v => v >= 0), `nada negativo: ${vistos.join(",")}`);
  } finally { D.desfazer(); if (gcs) Object.defineProperty(globalThis, "getComputedStyle", gcs); else delete globalThis.getComputedStyle; }
});

test("Kanban (DOM): no funil com «Faltou» o resumo pula a etapa lateral e a nota a cita só com a contagem; a tabela leva o rótulo de cada coluna (cartões no celular)", async () => {
  const D = domDeMentira({ medias: { "(min-height: 900px)": true } });
  try {
    const quadro = () => ({ colunas: colunasOdonto(0).map(c => ({ ...c, itens: [] })) });
    const { tela, api } = await montarKanbanDeMentira(D, { etapas: etapasOdonto, rpcC: async nome => (nome === "nx_negocios_kanban" ? quadro() : {}), cli: "cli-odonto" });
    const fr = tela.querySelector(".crm-fr");
    assert.deepEqual(fr.querySelectorAll(".crm-fr-it .crm-fr-nome span").map(s => s.textContent), ["Nova conversa", "Avaliação agendada", "Avaliou / orçamento", "Fechou tratamento"]);
    assert.match(fr.querySelectorAll(".crm-fr-conv")[2].textContent, /^50% seguem para Fechou tratamento$/, "orçamento segue direto para o ganho");
    assert.ok(!/Faltou/.test(fr.querySelector(".crm-fr-lista").textContent) && !/Faltou/.test(fr.querySelector(".crm-fr-mini").textContent), "nenhuma taxa para ou a partir de «Faltou»");
    const nota = fr.querySelector(".crm-fr-nota").textContent;
    assert.match(nota, /«Faltou» \(0 agora\) fica fora da sequência/);
    assert.ok(!/Faltou[^.]*%/.test(nota), "a nota não dá porcentagem para a etapa lateral");
    const tds = fr.querySelectorAll(".crm-fr-tab tbody tr")[0].querySelectorAll("td");
    assert.deepEqual(tds.map(td => td.dataset.rotulo), ["Chegaram", "Agora", "Valor", "Seguem"]);
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Tarefas e linha do tempo */
function kitTarefas(D, reg, { itens, contagens }) {
  const { h } = D;
  const ui = uiDeMentira(h, reg);
  const base = { usuarios: [{ id: "u1", nome: "Dra. Helena" }], etiquetas: [], campos: [], motivos: [] };
  return { ui, h, L, base, v: { contato: "Paciente", negocio: "Oportunidade", negocios: "Oportunidades", ganhar: "Fechou", perder: "Não fechou", min: x => x, art: () => "a", novo: () => "Novo" },
    ctx: { cliente: { id: "cli-t" }, titulo() {}, navegar() {}, pulso: null, temModulo: () => false },
    api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); if (nome === "nx_tarefas_listar") return { itens: itens(p.p_filtro.situacao), ...contagens }; return {}; } },
    pode: () => true, eu: () => "u1", nomes: () => ({ u1: "Dra. Helena" }), motivosPorId: () => ({}), erro: e => String(e && e.codigo), toastErro() {}, cor: () => null,
    rascunho: () => ({ apagar() {}, desligar() {} }), novaReq: () => "req", escrever: async () => ({ resultado: {} }), mod: async () => ({}) };
}

test("Tarefas (DOM): painel do dia lê as contagens soltas ou em r.contagens, grupos por dia («Ontem» em vermelho, «Hoje», «Amanhã») e o painel troca a aba", async () => {
  const D = domDeMentira();
  try {
    const reg = { chamadas: [] };
    const tarefas = [{ id: 1, titulo: "Ligar", tipo: "ligacao", vence_em: iso(0), concluida_em: null }, { id: 2, titulo: "Orçamento", tipo: "tarefa", vence_em: iso(1), concluida_em: null },
      { id: 3, titulo: "Atrasada", tipo: "whatsapp", vence_em: iso(-1), atrasada: true, concluida_em: null }, { id: 4, titulo: "Sem prazo", tipo: "tarefa", vence_em: null, concluida_em: null }];
    const k = kitTarefas(D, reg, { itens: () => tarefas, contagens: { hoje: 2, atrasadas: 1 } });   // formato do servidor fictício: contagens soltas
    k.ui.hojeSP = d => (d ? new Date(d) : new Date(Date.UTC(2026, 9, 4, 12))).toISOString().slice(0, 10);
    const { montarTarefas } = await import("../web/app/crm-tarefas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await montarTarefas(k, tela, { query: {} });
    const painel = tela.querySelector(".tfp-painel");
    assert.deepEqual(painel.querySelectorAll(".tfp-pn b").map(b => b.textContent), ["2", "1", "0"]);
    assert.ok(painel.querySelector(".tfp-pn-atrasadas").classList.contains("alerta"));
    assert.ok(painel.querySelector(".tfp-pn-proximas").classList.contains("zero"));
    assert.equal(painel.querySelector(".tfp-pn-hoje").attrs["aria-pressed"], "true");
    const grupos = tela.querySelectorAll(".tfp-grupo");
    assert.deepEqual(grupos.map(g => g.querySelector(".tfp-grupo-t span").textContent), ["Ontem", "Hoje", "Amanhã", "Sem data"]);
    assert.ok(grupos[0].classList.contains("passado"), "dia que já passou fica marcado");
    assert.ok(!grupos[1].classList.contains("passado"));
    assert.deepEqual(grupos.map(g => g.querySelectorAll(".tf-li").length), [1, 1, 1, 1]);
    assert.equal(grupos[1].querySelector(".tfp-grupo-n").textContent, "1");
    // o painel troca a aba (e pede a lista certa)
    painel.querySelector(".tfp-pn-proximas").clique(); await tique(); await tique();
    assert.equal(reg.chamadas.at(-1).p.p_filtro.situacao, "proximas");
    assert.equal(painel.querySelector(".tfp-pn-proximas").attrs["aria-pressed"], "true");
    assert.equal(painel.querySelector(".tfp-pn-hoje").attrs["aria-pressed"], "false");
    assert.equal(D.storage.get("nx-app-tarefas-aba"), "proximas");
    api.desmontar();
    // r.contagens (banco) também vale
    const reg2 = { chamadas: [] };
    const k2 = kitTarefas(D, reg2, { itens: () => [], contagens: { contagens: { hoje: 5, atrasadas: 0, proximas: 3 } } });
    const tela2 = h0(D, "div", { class: "crm" });
    const api2 = await montarTarefas(k2, tela2, { query: { aba: "hoje" } });
    assert.deepEqual(tela2.querySelectorAll(".tfp-pn b").map(b => b.textContent), ["5", "0", "3"]);
    assert.ok(tela2.querySelector(".tfp-pn-atrasadas").classList.contains("zero") && !tela2.querySelector(".tfp-pn-atrasadas").classList.contains("alerta"));
    assert.ok(tela2.querySelector(".vazio"), "sem itens: vazio da aba");
    api2.desmontar();
  } finally { D.desfazer(); }
});
function h0(D, ...a) { const el = D.h(...a); D.doc.body.appendChild(el); return el; }
/** O mesmo DOM, mas com matchMedia respondendo «não» a tudo (desktop comum de 768 px de altura). */
function domDeMentiraSemTrocar(D) { globalThis.matchMedia = () => ({ matches: false }); return D; }

test("Linha do tempo (DOM): agrupada por dia, ícone por família do evento, hora com a data completa na dica", async () => {
  const D = domDeMentira();
  try {
    const reg = { chamadas: [] };
    const k = kitTarefas(D, reg, { itens: () => [], contagens: {} });
    k.ui.hojeSP = d => (d ? new Date(d) : new Date(Date.UTC(2026, 9, 4, 12))).toISOString().slice(0, 10);
    const { blocoTempo, familiaTempo } = await import("../web/app/crm-tarefas.js");
    const itens = [
      { tipo: "ganho", em: iso(0, 9), dados: { valor: 900 } }, { tipo: "estagio", em: iso(0, 8), dados: { de_nome: "Nova", para_nome: "Orçamento" } },
      { fonte: "nota", em: iso(-1, 15), dados: { texto: "ligar" }, autor: { nome: "Ana" } }, { tipo: "conversa_aberta", em: iso(-1, 10), dados: { protocolo: "ORB-1" }, conversa_id: 9 },
      { tipo: "automacao", em: iso(-3, 10), dados: { nome: "Lembrete" } }];
    const bloco = blocoTempo(k, itens);
    const dias = bloco.querySelectorAll(".tempo-dia");
    assert.deepEqual(dias.map(d => d.querySelector(".tempo-dia-t span").textContent), ["Hoje", "Ontem", "Qui, 01/10"]);
    assert.deepEqual(dias.map(d => d.querySelector(".tempo-dia-n").textContent), ["2", "2", "1"]);
    const its = bloco.querySelectorAll(".tempo-it");
    assert.deepEqual(its.map(i => i.className.replace("tempo-it", "").trim()), ["ganho", "estagio", "nota", "conversa", "automacao"]);
    const t = its[0].querySelector("time");
    assert.equal(t.textContent, "09:00"); assert.equal(t.attrs.datetime, iso(0, 9)); assert.match(t.attrs.title, /04\/10\/2026 09:00/);
    assert.ok(its[3].querySelector("a").attrs.href === "#/conversas/9");
    assert.equal(familiaTempo({ fonte: "tarefa", tipo: "tarefa_concluida" }), "tarefa");
    assert.equal(familiaTempo({ tipo: "dono" }), "");
    assert.ok(blocoTempo(k, []).querySelector(".fraco"), "vazio continua com a frase");
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Contatos */
async function montarContatosDeMentira(D, { rota = { query: {} }, cli = "cli-c" } = {}) {
  const { h } = D;
  const reg = { chamadas: [] };
  const ui = uiDeMentira(h, reg);
  const base = { usuarios: [], etiquetas: [{ id: "e1", nome: "VIP", cor: null }], campos: [], motivos: [], funis: [] };
  const k = { ui, h, L, base, v: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", min: x => ({ contato: "paciente", contatos: "pacientes", negocio: "oportunidade" })[x] || x, art: () => "a", novo: () => "Novo paciente", nenhum: () => "Nenhum paciente" },
    ctx: { cliente: { id: cli }, titulo() {}, navegar() {}, temModulo: () => false },
    api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); return { itens: [{ id: 1, nome: "Ana", telefone: "5512999990000", ultimo_contato_em: iso(-2), etiquetas: ["e1"], negocios_abertos: 1 }], total: 1, tem_mais: false }; } },
    pode: () => true, eu: () => "u1", erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, etiqueta: id => base.etiquetas.find(e => e.id === id) || null, usuario: () => null,
    mod: async nome => nome === "visoes" ? { controlesVisoes: () => ({ el: h("div", { class: "crm-visoes" }), atualizar() {} }) } : {} };
  const { montarContatos } = await import("../web/app/crm-listas.js");
  const tela = h0(D, "div", { class: "crm" });
  const api = await montarContatos(k, tela, rota);
  return { tela, api, reg, k };
}

test("Contatos (DOM): densidade compacta/confortável lembrada por empresa, «último contato» com a data na dica e filtro de empresa pela rota", async () => {
  const D = domDeMentira();
  try {
    const { tela, api, reg } = await montarContatosDeMentira(D);
    assert.equal(tela.dataset.densidade, "confortavel");
    const seg = tela.querySelector(".crm-dens");
    seg.__mudar("compacta");
    assert.ok(tela.classList.contains("crm-dens-compacta")); assert.equal(D.storage.get("nx-app-crm-ct-dens-cli-c"), "compacta");
    assert.match(reg.avisos.at(-1), /compacta/);
    // a coluna «Último contato» é um <time> com a data completa na dica e no rótulo acessível
    const col = reg.colunas.find(c => c.chave === "ultimo_contato_em");
    const t = col.render({ ultimo_contato_em: "2026-10-02T14:30:00Z" });
    assert.equal(t.tagName, "TIME"); assert.equal(t.attrs.datetime, "2026-10-02T14:30:00Z"); assert.match(t.attrs.title, /02\/10|04\/10\/2026 14:30/); assert.match(t.attrs["aria-label"], /Último contato em/);
    assert.equal(col.render({}), null);
    // a lista compacta do celular mostra o relativo na 2ª linha
    assert.match(tela.querySelector(".ct-sub").textContent, /há 2 dias/);
    api.desmontar();
    // remonta: a densidade guardada volta aplicada; a rota com empresa já filtra e mostra o chip removível
    const seg2 = await montarContatosDeMentira(D, { rota: { query: { empresa: "77", empresa_nome: "Clínica Vida" } } });
    assert.ok(seg2.tela.classList.contains("crm-dens-compacta"));
    assert.equal(seg2.reg.chamadas[0].p.p_filtro.empresa_id, "77");
    const chip = seg2.tela.querySelector(".crm-chip");
    assert.match(chip.textContent, /Empresa: Clínica Vida/);
    chip.querySelector("button").clique(); await tique();
    assert.equal(seg2.reg.chamadas.at(-1).p.p_filtro.empresa_id, undefined, "tirar o chip tira o filtro");
    seg2.api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Empresas */
test("Empresas (DOM): cartões com contagens, «Ver negócios» abre a empresa na seção e «Ver pacientes» filtra a lista; página com resumo e foco", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [{ id: "f1", estagios: [{ id: "s1", nome: "Nova", tipo: "aberto", cor: null }] }] };
    const empresas = [{ id: 7, nome: "Clínica Vida", cidade: "Taubaté", uf: "SP", contatos: 3, negocios_abertos: 2 }, { id: 8, nome: "Frota Sul", documento: "12.345", contatos: 0, negocios_abertos: 0 }];
    const k = { ui, h, L, base, v: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", ganhar: "Fechou", min: x => ({ contato: "paciente", contatos: "pacientes", negocio: "oportunidade", negocios: "oportunidades" })[x] || x, art: () => "a", nenhum: () => "Nenhuma oportunidade" },
      ctx: { cliente: { id: "cli-e" }, titulo() {}, navegar() {} },
      api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); if (nome === "nx_empresas_listar") return { itens: empresas, total: 2, tem_mais: false };
        if (nome === "nx_empresa_ver") return { empresa: empresas[0], contatos: [{ id: 1, nome: "Ana", telefone: "5512999990000" }, { id: 2, nome: "Bia" }, { id: 3 }], negocios: [{ id: 1, estagio_id: "s1", status: "aberto", valor_previsto: 1200 }, { id: 2, estagio_id: "s1", status: "aberto", valor_previsto: 300 }, { id: 3, estagio_id: "s1", status: "ganho", valor: 2500 }] }; return {}; } },
      pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, estagio: () => ({ nome: "Nova" }), funil: () => null,
      mod: async () => ({ abrirNegocio() {}, campoPersonalizado: () => h("div"), lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) }) };
    const { montarEmpresas, montarEmpresa, cartaoEmpresa } = await import("../web/app/crm-listas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await montarEmpresas(k, tela);
    const cartoes = tela.querySelectorAll(".emp-cartao");
    assert.equal(cartoes.length, 2);
    assert.deepEqual(cartoes[0].querySelectorAll(".emp-num b").map(b => b.textContent), ["3", "2"]);
    assert.ok(cartoes[0].querySelectorAll(".emp-num")[1].classList.contains("tem") && !cartoes[1].querySelectorAll(".emp-num")[1].classList.contains("tem"));
    assert.match(cartoes[0].querySelector(".emp-txt small").textContent, /Taubaté\/SP/);
    assert.equal(cartoes[0].querySelector(".emp-ver-neg").attrs.href, "#/empresas/7?sec=negocios");
    assert.equal(cartoes[0].querySelector(".emp-ver-ct").attrs.href, "#/contatos?empresa=7&empresa_nome=Cl%C3%ADnica%20Vida");
    assert.match(cartoes[1].querySelectorAll(".emp-num small")[0].textContent, /pacientes/); assert.match(cartoes[0].querySelectorAll(".emp-num small")[1].textContent, /oportunidades abertas/);
    assert.match(cartaoEmpresa(k, { id: 9, nome: "X", contatos: 1, negocios_abertos: 1 }).querySelectorAll(".emp-num small").map(s => s.textContent).join("|"), /paciente\|oportunidade aberta/);
    assert.equal(tela.querySelector(".tabela-env"), null, "a tabela deu lugar aos cartões");
    api.desmontar();
    // página da empresa: resumo pelo que o servidor devolveu e foco na seção de negócios quando a rota pede
    const pag = h0(D, "div", { class: "crm" });
    const api2 = await montarEmpresa(k, pag, "7", { query: { sec: "negocios" } });
    assert.deepEqual(pag.querySelectorAll(".emp-res-it b").map(b => b.textContent), ["3", "2", "1"]);
    assert.match(pag.querySelectorAll(".emp-res-it small")[0].textContent, /R\$ 1500/);
    assert.ok(pag.querySelectorAll(".emp-res-it")[1].classList.contains("tem") && pag.querySelectorAll(".emp-res-it")[2].classList.contains("ok"));
    // o foco vai à seção DEPOIS do shell (que, ao fim do montar, foca o <h1> e volta ao topo): simula o focarTitulo e confere quem ganha
    pag.querySelector("h1").focus();
    await tique();
    assert.ok(D.ativo() && D.ativo().classList.contains("emp-negocios"), "a seção de negócios recebeu o foco (depois do <h1> do shell)");
    assert.ok(D.rolagens.some(r => r.into && r.el.classList.contains("emp-negocios")));
    assert.match(pag.querySelector(".ng-bloco .bt-fant").attrs.href, /#\/contatos\?empresa=7/);
    api2.desmontar();
  } finally { D.desfazer(); }
});

test("Empresas (DOM): resposta fora do formato vira a frase de erro do app (resposta_invalida), nunca a exceção em inglês; listas que não são lista viram vazias", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    let resposta = {};
    const k = { ui, h, L, base: { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [] },
      v: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", ganhar: "Fechou", min: x => x, art: () => "a", nenhum: () => "Nenhuma oportunidade" },
      ctx: { cliente: { id: "cli-e2" }, titulo() {}, navegar() {} }, api: { rpcC: async () => resposta },
      pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, estagio: () => null, funil: () => null,
      mod: async () => ({ abrirNegocio() {}, campoPersonalizado: () => h("div"), lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) }) };
    const { montarEmpresas, montarEmpresa } = await import("../web/app/crm-listas.js");
    for (const r of [{}, null, { itens: "x" }]) {
      resposta = r;
      const tela = h0(D, "div", { class: "crm" });
      const api = await montarEmpresas(k, tela);
      assert.equal(tela.querySelector(".erro-cartao").textContent, "resposta_invalida", JSON.stringify(r));
      assert.ok(!/Cannot read|undefined/.test(tela.textContent));
      api.desmontar();
    }
    resposta = { contatos: [] };            // sem «empresa»
    const pag = h0(D, "div", { class: "crm" });
    await montarEmpresa(k, pag, "7", {});
    assert.equal(pag.querySelector(".erro-cartao").textContent, "resposta_invalida");
    resposta = { empresa: { id: 7, nome: "Clínica Vida" }, contatos: "?", negocios: null };
    const pag2 = h0(D, "div", { class: "crm" });
    await montarEmpresa(k, pag2, "7", {});
    assert.equal(pag2.querySelector(".erro-cartao"), null);
    assert.deepEqual(pag2.querySelectorAll(".emp-res-it b").map(b => b.textContent), ["0", "0", "0"]);
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Importação */
test("Importação (DOM): prévia ao vivo com o destino de cada coluna no cabeçalho; mudar o mapeamento atualiza a prévia e a contagem; barra com % e aria-valuetext", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [{ id: "f1", nome: "Pacientes", ativo: true, padrao: true, conta_no_ads: false, estagios: [{ id: "s1", nome: "Nova", tipo: "aberto" }] }] };
    const k = { ui, h, L, base, v: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", min: x => ({ contatos: "pacientes", contato: "paciente", negocio: "oportunidade" })[x] || x, art: () => "a", nenhum: () => "Nenhum" },
      ctx: { cliente: { id: "cli-i" }, titulo() {}, navegar() {} },
      api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); if (nome === "nx_contatos_importar") return { importacao_id: "imp1", criados: p.p_linhas.length, atualizados: 0, ignorados: 0, erros: [], avisos: [] }; return {}; } },
      pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], estagio: () => base.funis[0].estagios[0],
      etiqueta: () => null, usuario: () => null, recarregarBase: async () => base, criarEtiqueta: async () => null };
    const { montarImportar } = await import("../web/app/crm-importar.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await montarImportar(k, tela, {});
    const botao = txt => tela.querySelectorAll("button").find(b => b.textContent.trim() === txt);
    // passo 1: cola 3 linhas
    tela.querySelector("textarea").value = "Nome;Telefone;Obs\nAna;(12) 99830-3030;x\nBeto;12 3456-7890;y\nCris;;z\n";
    botao("Usar o texto colado").clique();
    botao("Continuar").clique();
    // passo 2: prévia com os destinos; «Obs» é reconhecida como observação
    const ths = tela.querySelectorAll(".imp-previa-mapa th");
    assert.equal(ths.length, 3);
    assert.deepEqual(ths.map(t => t.querySelector(".imp-th-col").textContent), ["Nome", "Telefone", "Obs"]);
    assert.deepEqual(ths.map(t => t.classList.contains("mapeada")), [true, true, true]);
    assert.deepEqual(ths.map(t => t.querySelector(".imp-th-dest").textContent), ["Nome", "Telefone / WhatsApp", "Observação"]);
    assert.equal(tela.querySelectorAll(".imp-previa-mapa tbody tr").length, 3, "3 primeiras linhas");
    assert.match(tela.querySelector(".imp-col-sub").textContent, /3 de 3 colunas reconhecidas/);
    // ignora a coluna Obs: cabeçalho apagado, células marcadas, contagem atualizada
    const selects = tela.querySelectorAll(".imp-mapa-l select");
    selects[2].value = ""; selects[2].dispara("change");
    const ths2 = tela.querySelectorAll(".imp-previa-mapa th");
    assert.ok(ths2[2].classList.contains("ignorada")); assert.equal(ths2[2].querySelector(".imp-th-dest").textContent, "Ignorada");
    assert.equal(tela.querySelectorAll(".imp-previa-mapa td.ignorada").length, 3);
    assert.match(tela.querySelector(".imp-col-sub").textContent, /2 de 3 colunas reconhecidas/);
    // passos 3 e 4: importa; a barra chega a 100 % com texto acessível e fica «pronta»
    botao("Continuar").clique();
    botao("Continuar").clique();
    assert.equal(tela.querySelector(".imp-barra-pct").textContent, "0%");
    botao("Importar 3 linhas").clique();
    for (let i = 0; i < 12; i++) await tique();
    const barra = tela.querySelector(".imp-barra");
    assert.equal(barra.attrs["aria-valuenow"], "3"); assert.match(barra.attrs["aria-valuetext"], /^100% — 3 de 3 linhas/);
    assert.equal(tela.querySelector(".imp-barra-pct").textContent, "100%");
    assert.ok(barra.classList.contains("pronta") && !barra.classList.contains("andando"));
    assert.equal(reg.chamadas.filter(c => c.nome === "nx_contatos_importar").length, 1);
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (c) estáticos (complemento) */
test("crm.css (plano 50): só tokens, sem 1fr solto, sem transition: all, movimento novo parado com reduced-motion, nada abaixo de 12 px no cartão", () => {
  const css = ler("crm.css");
  const bloco = css.slice(css.indexOf("plano 50 (04/10/2026)"));
  assert.ok(bloco.length > 2000, "o bloco do plano 50 existe");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bloco) && !/\brgba?\(/.test(bloco), "sem cor fixa");
  assert.ok(!/transition:\s*all/.test(css), "sem transition: all");
  assert.ok(!/(^|[\s(,])1fr/.test(bloco.replace(/minmax\(0,\s*1fr\)/g, "")), "1fr só dentro de minmax(0, 1fr)");
  for (const anim of ["crmFrCresce", "kbAlvoPulsa", "kbLugarRespira", "kcSolta", "tfCheck", "impListras"]) assert.ok(new RegExp(`@keyframes ${anim}\\b`).test(bloco), anim);
  const reduzido = bloco.slice(bloco.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const sel of [".crm-fr-lista.anim .crm-fr-barra", ".kb-col.alvo", ".kb-lugar", ".kc.kc-solto", ".imp-barra.andando i", ".tf-check input:checked + span::after"]) assert.ok(reduzido.includes(sel), `reduced-motion cobre ${sel}`);
  for (const l of bloco.split("\n").filter(l => /^\.kc(-[a-z-]+)?\b/.test(l.trim()))) { assert.ok(!/--fs-11\b/.test(l), l.slice(0, 60)); const m = l.match(/font-size:\s*(\d+(?:\.\d+)?)px/); assert.ok(!m || Number(m[1]) >= 12, l.slice(0, 60)); }
  assert.ok(/\.ng \.ng-kv \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(bloco), "gaveta: campos em 2 colunas também no desktop");
  assert.ok(/\.ng-acoes-rodape \{ position: sticky; bottom: /.test(bloco), "ações fixas no rodapé da gaveta (celular)");
  assert.ok(/\.crm-dens \{ display: none; \}/.test(bloco), "densidade some no celular");
  assert.ok(/\.kc-tarefa-txt \{ display: none; \}/.test(bloco), "3 linhas no celular");
  // revisão: alvos de 44 px no toque também para as ações do cartão de empresa e o «Ver como tabela»; no celular a tabela e a faixa compacta ficam
  const toque = bloco.slice(bloco.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  assert.ok(/\.crm-fr-nome, \.crm-dist-leg-b, \.crm-fr-vertabela, \.emp-acoes \.bt \{ min-height: 44px; \}/.test(toque.slice(0, toque.indexOf("}") + 1)), "44 px no toque");
  const movel = bloco.slice(bloco.indexOf("/* ---------- celular ---------- */"), bloco.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  assert.ok(!/\.crm-fr-vertabela[^{]*\{[^}]*display: none/.test(movel) && !/\.crm-fr-mini[^{]*\{[^}]*display: none/.test(movel), "no celular a versão em tabela e a faixa compacta não somem");
  assert.ok(/\.crm-fr-mini \{ flex-basis: 100%; order: 3;/.test(movel), "a faixa compacta desce para a 2ª linha do cabeçalho");
  assert.ok(/\.crm-fr-tabela \.crm-fr-tab tbody th \{ display: block;/.test(movel), "a tabela vira cartões com o nome da etapa no título");
  assert.ok(/\.fx-proto > span\.avatar \{ flex: none;/.test(css), "o avatar do contato na página da empresa não estica");
  const kjs = ler("crm-kanban.js");
  assert.ok(/typeof G\.contar === "function"/.test(kjs) && /typeof G\.destacar === "function"/.test(kjs), "graficos.js por detecção");
  assert.ok(/L\.faixaTempoEtapa\(c\.estagio_em, e\.sla_horas\)/.test(kjs), "o prazo da etapa vem da base (sla_horas); sem ele, 3/7 dias do crm-logica");
  const neg = ler("crm-negocio.js");
  assert.ok(/class: \["ng", movel && "ng-com-rodape"\]/.test(neg) && /class: "ng-acoes-rodape"/.test(neg), "rodapé de ações só no celular");
});
