/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026) · lote teste-1 (só testes de cobertura)
   node --test testes/plano1000b-cobertura.teste.mjs      (Node puro, sem rede e sem navegador)
   Itens AB-/UB-/CB-/RB- do lote teste-1 que ainda não tinham teste nos plano1000b-*.teste.mjs. Nenhum código de produção mudou:
   o que o teste revelou como defeito fica em test.todo (a suíte segue verde) e foi anotado como pendência para a frente dona.
   Datas das fixtures fixas (dias de calendário) ou relativas ao relógio (hojeSP); nada depende da hora em que a suíte roda.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(RAIZ, "web", "app");
const lerRaiz = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");

/* ---------- DOM de mentira (o mesmo do plano1000-sistema.teste.mjs) ---------- */
/* ---------- DOM de mentira: h(), eventos com captura/bolha, seletores simples, closest, foco, dataset, estilo ---------- */
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.isTrusted = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === "object" && n && n.nodeType ? n : new Texto(n)); }
    prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === "object" && n && n.nodeType ? n : new Texto(n), this.firstChild); }
    after(...ns) { const p = this.parentNode; if (!p) return; let ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture), once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { if (o.once) n._ouv = n._ouv.filter(x => x !== o); o.fn(ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
      return !ev.defaultPrevented;
    }
  }
  class Texto extends No {
    constructor(t) { super(); this.nodeType = 3; this.data = String(t); }
    get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
  }
  function splitVirgula(s) {
    const out = []; let nivel = 0, cur = "";
    for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && c === ",") { out.push(cur.trim()); cur = ""; } else cur += c; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  function parseComplexo(s) {
    const partes = []; let nivel = 0, cur = "", comb = null;
    const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } };
    for (const c of s) {
      if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--;
      if (nivel === 0 && (c === " " || c === ">")) { fecha(); if (c === ">") comb = ">"; else if (!comb) comb = " "; } else cur += c;
    }
    fecha(); return partes;
  }
  function casaComposto(el, s) {
    let i = 0; const m0 = /^([a-zA-Z][\w-]*|\*)/.exec(s);
    if (m0) { if (m0[1] !== "*" && el.localName.toLowerCase() !== m0[1].toLowerCase()) return false; i = m0[0].length; }
    while (i < s.length) {
      const resto = s.slice(i); let mm;
      if (resto[0] === "#") { mm = /^#([\w-]+)/.exec(resto); if (el.attrs.get("id") !== mm[1]) return false; }
      else if (resto[0] === ".") { mm = /^\.([\w-]+)/.exec(resto); if (!el.classList.contains(mm[1])) return false; }
      else if (resto[0] === "[") {
        mm = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(resto);
        if (!el.attrs.has(mm[1])) return false;
        if (mm[2]) { const v = el.attrs.get(mm[1]), a = mm[3] ?? mm[4] ?? mm[5]; if (mm[2] === "=" && v !== a) return false; if (mm[2] === "^=" && !v.startsWith(a)) return false; }
      } else if (resto[0] === ":") {
        mm = /^:([\w-]+)(?:\(((?:[^()]|\([^)]*\))*)\))?/.exec(resto);
        if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; }
        // :focus-visible = o elemento ativo, focado pelo teclado (doc.focoPorTeclado); doc.semFocusVisible imita o navegador que não conhece o seletor
        else if (mm[1] === "focus-visible") { if (doc.semFocusVisible) throw new SyntaxError("':focus-visible' is not a valid selector"); if (!(doc.activeElement === el && doc.focoPorTeclado)) return false; }
        else return false;
      } else return false;
      i += mm[0].length;
    }
    return true;
  }
  function casaComplexo(el, partes) {
    if (!casaComposto(el, partes[partes.length - 1])) return false;
    if (partes.length === 1) return true;
    const comb = partes[partes.length - 2], resto = partes.slice(0, -2);
    if (comb === ">") return !!el.parentNode && el.parentNode.nodeType === 1 && casaComplexo(el.parentNode, resto);
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (casaComplexo(p, resto)) return true;
    return false;
  }
  function casaLista(el, lista) { return splitVirgula(lista).some(sel => casaComplexo(el, parseComplexo(sel))); }
  class El extends No {
    constructor(tag, ns) {
      super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); this.namespaceURI = ns || null;
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false;
      this.offsetWidth = 0; this.offsetLeft = 0; this.offsetTop = 0; this.clientWidth = 0; this.selectionStart = null;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      for (const p of ["left", "top", "width", "transform"]) Object.defineProperty(this.style, p, { get: () => estilos.get(p) || "", set: v => { estilos.set(p, String(v)); } });
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined),
        set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; },
        deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; },
      });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = {
        add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); },
        remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); },
        contains: c => cls().includes(c), toggle: (c, forca) => { const t = forca === undefined ? !cls().includes(c) : !!forca; t ? this.classList.add(c) : this.classList.remove(c); return t; },
      };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); }
    set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    matches(sel) { return casaLista(this, sel); }
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
    querySelectorAll(sel) {
      const alvos = splitVirgula(sel).map(parseComplexo);
      const out = [];
      const andar = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (alvos.some(p => casaComplexo(c, p))) out.push(c); andar(c); } };
      andar(this); return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { this.dispatchEvent(new Evento("click")); }
    scrollIntoView() {} setSelectionRange() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => { const f = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (c.attrs.get("id") === id) return c; const r = f(c); if (r) return r; } return null; }; return f(doc.documentElement); };
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.contains = n => doc.documentElement.contains(n);
  return { doc, Evento };
}

const { doc, Evento } = criarDom();
globalThis.document = doc;
globalThis.matchMedia = () => ({ matches: false });
globalThis.Event = Evento;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = f => setTimeout(f, 0);
globalThis.cancelAnimationFrame = t => clearTimeout(t);
if (typeof globalThis.CSS === "undefined") globalThis.CSS = { escape: s => String(s) };
// o DOM de mentira não tem showModal/close: o modal e a gaveta os chamam logo ao abrir
{ const criar = doc.createElement; doc.createElement = t => { const el = criar(t); if (t === "dialog") { el.showModal = () => { el.open = true; }; el.close = () => { el.open = false; }; } return el; }; }
const ev = (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init));
const limparCorpo = () => { for (const c of [...doc.body.childNodes]) c.remove(); };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const tique = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const imp = f => import(pathToFileURL(join(RAIZ, f)).href);
const U = await imp("web/app/ui.js");
const API = await imp("web/app/api.js");
const N = await imp("web/nucleo.js");
const L = await imp("web/app/rel-logica.js");
const A = await imp("web/app/anuncios.js");
const CFG = await imp("web/app/config.js");
const T = await imp("web/app/tema.js");
const AL = await imp("web/app/auto-logica.js");
const CV = await imp("web/app/cv-logica.js");
const CL = await imp("web/app/crm-logica.js");
const V = await imp("web/app/vocab.js");

const REL = lerRaiz("web/app/relatorios.js"), APP_JS = lerRaiz("web/app/app.js"), ENVIAR = lerRaiz("supabase/functions/_compartilhado/enviar.js");
/** Uma função de primeiro nível do app.js rodando sozinha (o app.js não importa em Node): o mesmo esquema do plano1000-sistema. */
const fnDoApp = assinatura => { const i = APP_JS.indexOf(assinatura); assert.ok(i >= 0, assinatura); return APP_JS.slice(i, APP_JS.indexOf("\n}\n", i) + 2); };
const fnApp = (assinatura, deps = {}) => {
  const fonte = fnDoApp(assinatura);
  const n = /function\s+([A-Za-z0-9_]+)/.exec(fonte)[1];
  return new Function(...Object.keys(deps), `"use strict";\n${fonte}\nreturn ${n};`)(...Object.values(deps));
};
const constDoApp = nome => { const m = new RegExp(`const ${nome} = [\\s\\S]*?;\\n`).exec(APP_JS); assert.ok(m, nome); return m[0]; };
/** storage de mentira (localStorage/sessionStorage) */
const loja = (obj = {}) => { const m = new Map(Object.entries(obj)); return { m, get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const montarEm = hoje => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], hoje, dias: 130, cliente: { nome: "X", cfg: {} } }));

/* ============================================================ Relatórios / rel-logica (frente ads) */

test("plano 1000b · AB-228 · tabela do funil e CSV com as mesmas colunas, na mesma ordem e com o mesmo dado em cada uma", () => {
  // plano 1000b · AB-228: o cartão do funil tem DUAS listas de colunas (CSV e tabela «Ver tabela»); elas já divergiram (AB-002)
  const ini = REL.indexOf("// funil por etapa"), fim = REL.indexOf("// série diária", ini);
  assert.ok(ini > 0 && fim > ini, "bloco do funil achado em relatorios.js");
  const bloco = REL.slice(ini, fim);
  const lista = re => { const m = re.exec(bloco); assert.ok(m, String(re)); return JSON.parse(`[${m[1]}]`); };
  const csv = lista(/csv: \{ nome: "funil", colunas: \[([^\]]*)\]/);
  const tab = lista(/legenda: "Funil por etapa", colunas: \[([^\]]*)\]/);
  assert.equal(tab.length, csv.length, `tabela ${JSON.stringify(tab)} × CSV ${JSON.stringify(csv)}`);
  tab.forEach((c, i) => assert.ok(csv[i].startsWith(c), `coluna ${i + 1}: tabela «${c}» × CSV «${csv[i]}»`));
  // o mesmo campo em cada posição: o CSV com o valor cru, a tabela formatada
  // plano 2000d: as linhas do CSV moram em linhasCsvFunil (NX-313: ganho/perdido sem «Seguiram»/«Conversão», como a tabela)
  assert.match(bloco, /linhas: \(\) => linhasCsvFunil\(r\.funil\)/);
  const linhaCsv = /export const linhasCsvFunil = [^\n]*?return \[([^\]]*)\]; \}\);/.exec(REL)[1];
  const linhaTab = /linhas: \(r\.funil \|\| \[\]\)\.map\(e => \[([\s\S]*?)\]\) \}\);/.exec(bloco)[1];
  const campos = s => s.split(/,(?![^(]*\))/).map(p => (p.match(/e\.([a-z_]+)/g) || []).at(-1));
  assert.deepEqual(campos(linhaTab), campos(linhaCsv));
});

test("plano 1000b · AB-232 · «Este mês» e «Mês passado» no dia 1º de março de ano bissexto (e no 1º de outubro)", () => {
  const M = montarEm("2028-03-01");
  assert.equal(N.isoDe(M.dataDe(M.R)), "2028-02-29", "ontem é o dia 29");
  assert.equal(L.rotuloPeriodo("mes", M).titulo, "Fevereiro (até ontem)");
  assert.equal(L.rotuloPeriodo("mes_ant", M).titulo, "Janeiro");
  const iso = (j, k) => N.isoDe(M.dataDe(j[k]));
  const mes = L.janela(M, "mes");
  assert.deepEqual([iso(mes, "de"), iso(mes, "ate"), mes.n], ["2028-02-01", "2028-02-29", 29], "fevereiro inteiro, com o dia 29");
  assert.deepEqual([iso(mes, "deA"), iso(mes, "ateA")], ["2028-01-01", "2028-01-29"], "comparação: o mesmo pedaço de janeiro");
  const ant = L.janela(M, "mes_ant");
  assert.deepEqual([iso(ant, "de"), iso(ant, "ate"), ant.n], ["2028-01-01", "2028-01-31", 31]);
  assert.deepEqual([iso(ant, "deA"), iso(ant, "ateA")], ["2027-12-01", "2027-12-31"]);
  const O = montarEm("2026-10-01");
  const om = L.janela(O, "mes");
  assert.deepEqual([N.isoDe(O.dataDe(om.de)), N.isoDe(O.dataDe(om.ate)), om.n], ["2026-09-01", "2026-09-30", 30]);
  assert.equal(L.rotuloPeriodo("mes", O).nos, "em setembro");
});

test("plano 1000b · AB-233 · «not a valid WhatsApp user» (erro real da API) vira português", () => {
  // PENDÊNCIA (frente ads + classico): web/app/rel-logica.js:358 e web/painel.js:138 — incluir «not a valid whatsapp user» na regra do 131026
  assert.match(L.erroEnvioPt("Error: not a valid WhatsApp user"), /^o número não recebeu a mensagem/);
  assert.equal(L.erroEnvioPt("whatsapp não configurado"), "whatsapp não configurado", "erro desconhecido mantém o texto");
});

test("plano 1000b · AB-236 · origensVendas: origem null e '' viram UMA linha «Sem origem»", () => {
  const o = L.origensVendas([{ origem: null, criados: 2, ganhos: 1, perdidos: 0, receita: 0 }, { origem: "", criados: 1, ganhos: 0, perdidos: 1, receita: 0 }]);
  assert.deepEqual(o.map(x => [x.rotulo, x.criados, x.ganhos, x.perdidos]), [["Sem origem", 3, 1, 1]]);
});
test("plano 1000b · AB-236 · origem só com espaços também cai em «Sem origem» (sem 2 linhas com o mesmo rótulo)", () => {
  // PENDÊNCIA (frente ads): web/app/rel-logica.js:1321 — usar String(o.origem ?? "").trim() || "sem_origem"
  const o = L.origensVendas([{ origem: null, criados: 2 }, { origem: "   ", criados: 1 }]);
  assert.deepEqual(o.map(x => [x.rotulo, x.criados]), [["Sem origem", 3]]);
});

test("plano 1000b · AB-243 · faxina dos silenciados: a chamada usa o dia avaliado pelo radar (ontem) — o silêncio que vence ontem ainda vale hoje", () => {
  // AB-078 pedia trocar para hojeSP: NÃO é defeito. O radar avalia M.R (ontem) com N.silenciado(cfg, chave, ontem); apagar com «hoje» o
  // silêncio que vence ontem faria o aviso voltar hoje, um dia antes do combinado. Este teste fixa a regra.
  const M = montarEm(N.hojeSP());
  const ontem = N.isoDe(M.dataDe(M.R)), anteontem = N.isoDe(M.dataDe(M.R - 1));
  const cfg = { silenciados: { "r1|a": { desde: anteontem, ate: ontem }, "r1|b": { ate: anteontem } } };
  assert.equal(N.silenciado(cfg, "r1|a", ontem), true, "vence ontem: o radar de hoje (que avalia ontem) ainda o respeita");
  const mapa = A.mapaSilenciados(cfg.silenciados, "r2|c", { desde: N.hojeSP(), ate: "2999-01-01" }, ontem);
  assert.deepEqual(Object.keys(mapa).sort(), ["r1|a", "r2|c"], "o vencido antes de ontem sai; o de ontem fica");
  assert.match(lerRaiz("web/app/anuncios.js"), /mapaSilenciados\(atual, chave, periodo, N\.isoDe\(M\.dataDe\(M\.R\)\)\)/, "a chamada real passa o dia avaliado");
  // com «hoje» o de ontem sairia (é o que a proposta do AB-078 faria)
  assert.deepEqual(Object.keys(A.mapaSilenciados(cfg.silenciados, "r2|c", null, N.hojeSP())), []);
});

/* ============================================================ Conversas: assinatura igual à do servidor (frente conv × srv) */

test("plano 1000b · CB-212 · prefixoAssinatura do painel = regra do nx-enviar (primeiroNome do _compartilhado/enviar.js)", async () => {
  // (integrador: desde o CB-002 o enviar.js delega a comum.primeiroNomeSemTratamento — o teste usa a função de verdade)
  assert.match(ENVIAR, /const primeiroNome = n => primeiroNomeSemTratamento\(n\);/, "primeiroNome do enviar.js = comum.primeiroNomeSemTratamento");
  const { primeiroNomeSemTratamento: primeiroNome } = await import("../supabase/functions/_compartilhado/comum.js");
  assert.match(ENVIAR, /const prefixo = assinar && cx\.cfg_cv\?\.assinatura && nome \? `\*\$\{nome\}:\*\\n` : "";/, "o servidor assina «*Nome:*» + quebra de linha");
  for (const nome of ["Helena Souza", "Dra. Helena", "  Helena   Souza ", "Ana", "", null, undefined, "José\tda Silva"]) {
    const srv = primeiroNome(nome);
    assert.equal(CV.prefixoAssinatura(nome), srv ? `*${srv}:*` : "", `nome ${JSON.stringify(nome)}`);
    assert.equal(CV.nomeAssinatura(nome), srv);
  }
});

/* ============================================================ CRM (frente crm) */

test("plano 1000b · RB-088 · termosNegocio por vertical e sem vocabulário", () => {
  assert.deepEqual(CL.termosNegocio(V.vocab("odonto")), { n: "oportunidade", ns: "oportunidades", N: "Oportunidade", a: "a", fem: true, os: "as", Os: "As" });
  assert.deepEqual(CL.termosNegocio(V.vocab("oficina")), { n: "orçamento", ns: "orçamentos", N: "Orçamento", a: "o", fem: false, os: "os", Os: "Os" });
  assert.deepEqual(CL.termosNegocio(V.vocab("loja")), { n: "venda", ns: "vendas", N: "Venda", a: "a", fem: true, os: "as", Os: "As" });
  const sem = CL.termosNegocio();
  assert.deepEqual(sem, { n: "negócio", ns: "negócios", N: "Negócio", a: "o", fem: false, os: "os", Os: "Os" });
  assert.deepEqual(CL.termosNegocio({}), sem, "objeto sem min/art: o padrão");
});
test("plano 1000b · RB-088 · origemDaPlanilha: rótulo da tela e sinônimos viram a chave; rede social fica como veio", () => {
  const casos = { "Indicação": "indicacao", "Whats": "whatsapp", "boca a boca": "indicacao", "Boca a Boca!": "indicacao", "  Cadastro manual ": "manual",
    "Zap": "whatsapp", "Formulário do site": "site", "Tráfego pago": "anuncio", "Instagram": "Instagram", "Facebook": "Facebook", " Google ": "Google", "": "" };
  for (const [v, esperado] of Object.entries(casos)) assert.equal(CL.origemDaPlanilha(v), esperado, v);
  assert.equal(CL.origemDaPlanilha(null), "");
});

/* ============================================================ Automações (frente auto) */

test("plano 1000b · UB-232 · dadosPessoaisNoPedido: celular colado, CPF com pontos e celular sem DDD", () => {
  const tipos = s => AL.dadosPessoaisNoPedido(s).map(x => x.tipo);
  assert.deepEqual(tipos("ligar para 12998303030 amanhã"), ["telefone"], "11 dígitos de celular não é CPF");
  assert.deepEqual(tipos("CPF 123.456.789-09 do paciente"), ["CPF"]);
  assert.deepEqual(tipos("chamar no 98765-4321"), ["telefone"], "sem DDD");
  assert.deepEqual(tipos("fone (12) 99830-3030"), ["telefone"]);
  assert.deepEqual(tipos("pedido 1234 de 2026"), [], "número curto não é dado pessoal");
});

/* ============================================================ Configurações × tema (frente config/sis) */

test("plano 1000b · UB-237 · WhatsApp de suporte: o que Configurações aceita, validarMarca e marcaEfetiva também aceitam", () => {
  const casos = ["5512999998888", "551299998888", "+55 (12) 99999-8888", "+351 123 456 789", "+1 202 555 0143", "+447911123456", "+123456789",
    "12999998888", "5512345", "55129999988881234", "abc", ""];
  for (const v of casos) {
    const c = CFG.suporteWaValido(v);
    if (c.ok && c.digitos) {
      assert.deepEqual(T.validarMarca({ suporte_wa: c.digitos }, false).filter(e => e.campo === "suporte_wa"), [], `validarMarca recusou ${v}`);
      assert.equal(T.marcaEfetiva({ suporte_wa: c.digitos }, {}).suporte_wa, c.digitos, `marcaEfetiva apagou ${v}`);
    } else if (!c.ok) {
      assert.equal(c.erro, CFG.ERRO_SUPORTE_WA, v);
    }
  }
});

/* ============================================================ Sistema (frente sis): ui.js, api.js, app.js */

test("plano 1000b · UB-241 · telBR: celular com DDD, com 55 e número de fora", () => {
  assert.equal(U.telBR("12998303030"), "(12) 99830-3030");
  assert.equal(U.telBR("5512998303030"), "(12) 99830-3030");
  assert.equal(U.telBR("1238303030"), "(12) 3830-3030");
  assert.equal(U.telBR("447911123456"), "+447911123456", "12 dígitos sem 55: internacional");
});
test("plano 1000b · UB-241 · telBR sem DDD (8/9 dígitos) não vira «+998303030» (parece número de fora)", () => {
  // corrigido pela frente sis (era pendência): web/app/ui.js:1689 — 8/9 dígitos: «99830-3030» / «3830-3030» em vez de `+${d}`
  assert.equal(U.telBR("998303030"), "99830-3030");
  assert.equal(U.telBR("38303030"), "3830-3030");
});

test("plano 1000b · UB-234 · modal: Esc e X não fecham enquanto a ação do botão roda; ao terminar fecha com o valor", async () => {
  limparCorpo();
  let soltar;
  const p = U.modal({ titulo: "Gerar link", corpo: U.h("p", null, "Convite"), acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false },
    { rotulo: "Gerar", tipo: "primario", fn: () => new Promise(r => { soltar = r; }) }] });
  let fechou = false, valor; p.then(v => { fechou = true; valor = v; });
  const dlg = [...doc.body.querySelectorAll("dialog")].pop();
  await esperar(5);
  [...dlg.querySelectorAll(".modal-rod button")].find(b => b.textContent === "Gerar").click();
  await tique();
  assert.equal(typeof soltar, "function", "a ação começou");
  const esc = new Evento("cancel"); dlg.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  dlg.querySelector(".modal-x").click();
  await tique();
  assert.equal(fechou, false, "Esc/X no meio da ação: continua aberto");
  assert.ok(dlg.isConnected);
  soltar("https://link");
  await tique(5);
  assert.equal(fechou, true); assert.equal(valor, "https://link");
  await esperar(200);
});

test("plano 1000b · UB-233 · gaveta: o X com texto digitado pergunta «Descartar?» (como o Esc e o X do modal)", async () => {
  // corrigido pela frente sis (era pendência): web/app/ui.js:585 — o .gaveta-x chama g.fechar() direto; trocar por tentarFechar() (o AS-210 já fez isso no modal)
  limparCorpo();
  let fechou = 0;
  const g = U.gaveta({ titulo: "Negócio", corpo: U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" })), aoFechar: () => { fechou++; } });
  await esperar(5);
  const input = g.corpo.querySelector("input[name=titulo]");
  ev(input, "pointerdown"); input.value = "Implante"; ev(input, "input");
  g.el.querySelector(".gaveta-x").click();
  await esperar(260);
  assert.equal(g.el.querySelector(".protege-faixa").hidden, false, "a faixa «Descartar o que você digitou?» aparece");
  assert.equal(fechou, 0, "a gaveta continua aberta");
});

test("plano 1000b · UB-236 · api.fn: a repetição (503) vai para a MESMA empresa mesmo se a pessoa trocar no meio", async () => {
  let empresa = "emp-A";
  const corpos = [];
  const api = API.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "tk", cliente: () => empresa, retentar: true,
    agora: () => 0, aleatorio: () => 0.5, online: () => true, esperar: async () => { empresa = "emp-B"; },
    fetch: async (url, init) => { corpos.push(JSON.parse(init.body)); return corpos.length === 1 ? new Response("{}", { status: 503 }) : new Response('{"ok":true,"r":1}', { status: 200 }); } });
  const r = await api.fn("nx-ia", { acao: "sugerir", texto: "oi" }, { leitura: true });
  assert.equal(r.r, 1);
  assert.equal(corpos.length, 2, "repetiu uma vez");
  assert.deepEqual(corpos.map(c => c.cliente), ["emp-A", "emp-A"], "a 2ª tentativa não foi para a empresa nova");
  assert.equal(corpos[1].token, "tk");
});

test("plano 1000b · UB-229 · sessão renovada na janela «Sua sessão expirou»: o pulso volta a rodar e o sino atualiza", async () => {
  let iniciou = 0, sino = 0;
  const toasts = [];
  const E = { sessao: { conta: { id: "c1", email: "ana@x.com" } }, cliente: { id: "e1" }, rascunhos: { salvarTudo() {} },
    pulso: { estado: { rodando: false }, iniciar() { iniciou++; this.estado.rodando = true; } },
    ui: { h: () => ({}), campo: () => ({}), modal: async () => "ok", toast: (t, o) => toasts.push([t, o && o.tipo]) } };
  const pedir = fnApp("async function pedirLoginNaTela() {", { E, atualizarSinoUI: () => { sino++; } });
  assert.equal(await pedir(), true);
  assert.equal(iniciou, 1); assert.equal(E.pulso.estado.rodando, true);
  assert.equal(sino, 1);
  assert.deepEqual(toasts, [["Sessão renovada. Pode continuar.", "ok"]]);
  // sem empresa aberta (Admin) não há pulso para ligar
  E.cliente = null; E.pulso.estado.rodando = false;
  assert.equal(await pedir(), true);
  assert.equal(iniciou, 1);
});

const limparAparelho = (E, local, sessao) => fnApp("function limparDadosDoAparelho() {", {
  E, localStorage: local, sessionStorage: sessao, LS: { lerTxt: k => local.getItem(k), apagar: k => local.removeItem(k) },
  PREFIXOS_DA_CONTA: new Function(`${constDoApp("PREFIXOS_DA_CONTA")}\nreturn PREFIXOS_DA_CONTA;`)(), CHAVE_CONTA: "nx-app-conta", CHAVE_RASCUNHOS_DE: "nx-app-rascunhos-de" });
test("plano 1000b · UB-230 · Sair: o localStorage da conta sai; com manterRascunhos os rascunhos das Automações ficam", async () => {
  const base = { "nx-au-rasc:e1:c1:nova": "{}", "nx-cmd:c1": "1", "nx-app-esquema": "escuro" };
  const local = loja(base);
  await limparAparelho({ cache: null, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, local, loja())();
  assert.deepEqual([...local.m.keys()], ["nx-app-esquema"]);
  const local2 = loja(base);
  await limparAparelho({ cache: null, manterRascunhos: true, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, local2, loja())();
  assert.deepEqual([...local2.m.keys()].sort(), ["nx-app-esquema", "nx-au-rasc:e1:c1:nova"]);
});
test("plano 1000b · UB-230 · Sair limpa os rascunhos das Automações guardados na sessionStorage (e os mantém com manterRascunhos)", async () => {
  // corrigido pela frente sis (era pendência): web/app/app.js:913 (limparDadosDoAparelho) só varre o localStorage — os rascunhos do editor e o texto da IA
  // (automacoes.js:49-51 e 404-405, chave «nx-au-rasc:<empresa>:<conta>:<id>») ficam na aba para a próxima conta. Sugestão: o mesmo laço
  // de prefixos sobre o sessionStorage (respeitando `manter` para «nx-au-rasc:»).
  const sessao = loja({ "nx-au-rasc:e1:c1:nova": "{}", "nx-au-rasc:e1:c1:ia-texto": "pedido", "nx-app-destino": "#/crm" });
  await limparAparelho({ cache: null, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, loja(), sessao)();
  assert.deepEqual([...sessao.m.keys()], ["nx-app-destino"]);
  const sessao2 = loja({ "nx-au-rasc:e1:c1:nova": "{}" });
  await limparAparelho({ cache: null, manterRascunhos: true, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, loja(), sessao2)();
  assert.deepEqual([...sessao2.m.keys()], ["nx-au-rasc:e1:c1:nova"]);
});
