/* ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente auto (Automações, Configurações, Números, Admin) · lote auto-1.
   Rodar: node --test testes/plano1000-automacoes.teste.mjs
   (a) lógica pura nova (auto-logica, cv-config, config, admin); (b) lista de Automações; (c) editor; (d) Configurações; (e) Números;
   (f) Admin — comportamento num DOM de mentira (o mesmo do plano100-automacoes). Cada teste cita o item (AS-xxx) do lote.
   Sem rede, sem serviços reais: as RPCs são dublês com o formato das migrações. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as L from "../web/app/auto-logica.js";
import * as CV from "../web/app/cv-config.js";
import * as ADM from "../web/app/admin.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(resolve(RAIZ, f), "utf8");
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BASE = {
  funis: [{ id: U(1), nome: "Pacientes", padrao: true, estagios: [
    { id: U(11), nome: "Nova conversa", marco: "nova", tipo: "aberto" }, { id: U(13), nome: "Avaliou / orçamento", marco: "orcamento", tipo: "aberto" },
    { id: U(12), nome: "Avaliação agendada", marco: "agendada", tipo: "aberto" }] }],
  etiquetas: [{ id: U(31), nome: "Orçamento", cor: "#E5B35C" }],
  usuarios: [{ id: U(41), nome: "Ana Lima", papel: "atendente" }, { id: U(42), nome: "Bruno Reis", papel: "admin" }],
  departamentos: [{ id: U(51), nome: "Recepção" }], canais: [{ id: U(61), nome: "Recepção WhatsApp" }], templates: [], campos: [],
};
const VOCAB = { contato: "Paciente", negocio: "Oportunidade", g_negocio: "a", ganhar: "Fechou", perder: "Não fechou", vertical: "odonto" };
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns.flat(Infinity)) if (n !== undefined && n !== false) this.appendChild(typeof n === "object" && n && n.nodeType ? n : new Texto(n)); }
    prepend(...ns) { const ref = this.firstChild; for (const n of ns) this.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), ref); }
    replaceChildren(...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); }
    after(...ns) { const p = this.parentNode; const ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn) { this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      for (let n = this; n && !ev._parado; n = n.parentNode) {
        ev.currentTarget = n;
        for (const o of [...n._ouv]) if (o.tipo === ev.type) { if (o.once) n.removeEventListener(o.tipo, o.fn); o.fn(ev); }
        if (!ev.bubbles) break;
      }
      return !ev.defaultPrevented;
    }
  }
  // o Texto guarda String(n): um null que escapasse viraria «null» na tela (o mesmo que o Element.append real faz) — os testes procuram
  class Texto extends No { constructor(t) { super(); this.nodeType = 3; this.data = String(t); } get textContent() { return this.data; } set textContent(v) { this.data = String(v); } }
  function splitVirgula(s) { const out = []; let nivel = 0, cur = ""; for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && c === ",") { out.push(cur.trim()); cur = ""; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
  function parseComplexo(s) { const partes = []; let nivel = 0, cur = "", comb = null; const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } }; for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && (c === " " || c === ">")) { fecha(); if (c === ">") comb = ">"; else if (!comb) comb = " "; } else cur += c; } fecha(); return partes; }
  function casaComposto(el, s) {
    let i = 0; const m0 = /^([a-zA-Z][\w-]*|\*)/.exec(s);
    if (m0) { if (m0[1] !== "*" && el.localName.toLowerCase() !== m0[1].toLowerCase()) return false; i = m0[0].length; }
    while (i < s.length) {
      const resto = s.slice(i); let mm;
      if (resto[0] === "#") { mm = /^#([\w-]+)/.exec(resto); if (el.attrs.get("id") !== mm[1]) return false; }
      else if (resto[0] === ".") { mm = /^\.([\w-]+)/.exec(resto); if (!el.classList.contains(mm[1])) return false; }
      else if (resto[0] === "[") { mm = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(resto); if (!el.attrs.has(mm[1])) return false; if (mm[2]) { const v = el.attrs.get(mm[1]), a = mm[3] ?? mm[4] ?? mm[5]; if (mm[2] === "=" && v !== a) return false; if (mm[2] === "^=" && !v.startsWith(a)) return false; } }
      else if (resto[0] === ":") { mm = /^:([\w-]+)(?:\(((?:[^()]|\([^)]*\))*)\))?/.exec(resto); if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; } else return false; }
      else return false;
      i += mm[0].length;
    }
    return true;
  }
  function casaComplexo(el, partes) { if (!casaComposto(el, partes[partes.length - 1])) return false; if (partes.length === 1) return true; const comb = partes[partes.length - 2], resto = partes.slice(0, -2); if (comb === ">") return !!el.parentNode && el.parentNode.nodeType === 1 && casaComplexo(el.parentNode, resto); for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (casaComplexo(p, resto)) return true; return false; }
  function casaLista(el, lista) { return splitVirgula(lista).some(sel => casaComplexo(el, parseComplexo(sel))); }
  class El extends No {
    constructor(tag, ns) {
      super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); this.namespaceURI = ns || null;
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false; this.offsetWidth = 0; this.selectionStart = null; this.readOnly = false;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      this.dataset = new Proxy({}, { get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined), set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; }, deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; } });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = { add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); }, remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); }, contains: c => cls().includes(c), toggle: (c, f) => { const t = f === undefined ? !cls().includes(c) : !!f; t ? this.classList.add(c) : this.classList.remove(c); return t; } };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; } set name(v) { this.attrs.set("name", String(v)); }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get href() { return this.attrs.get("href") || ""; } set href(v) { this.attrs.set("href", String(v)); }
    get rel() { return this.attrs.get("rel") || ""; } set rel(v) { this.attrs.set("rel", String(v)); }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    get innerText() { return this.textContent; }
    matches(sel) { return casaLista(this, sel); }
    closest(sel) { for (let p = this; p && p.nodeType === 1; p = p.parentNode) if (p.matches(sel)) return p; return null; }
    querySelectorAll(sel) { const alvos = splitVirgula(sel).map(parseComplexo); const out = []; const andar = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (alvos.some(p => casaComplexo(c, p))) out.push(c); andar(c); } }; andar(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() { doc.activeElement = this; } blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { this.dispatchEvent(new Evento("click")); }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    scrollIntoView() {} getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.head = doc.documentElement.appendChild(new El("head")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  return { doc, Evento, El };
}
function comDom() {
  globalThis.CSS = globalThis.CSS || { escape: s => String(s) };
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent, KeyboardEvent: globalThis.KeyboardEvent, window: globalThis.window, matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, location: globalThis.location };
  globalThis.document = doc; globalThis.Event = Evento; globalThis.KeyboardEvent = Evento; globalThis.MouseEvent = Evento;
  globalThis.window = globalThis;
  const mem = new Map(), mem2 = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.sessionStorage = { getItem: k => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, String(v)), removeItem: k => mem2.delete(k) };
  return { doc, Evento, mem, fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
const tique = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function uiReal() { return import("../web/app/ui.js"); }
const textoDe = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const semNullNaTela = raiz => assert.doesNotMatch(raiz.textContent, /\bnull\b|\bundefined\b/, "nada de «null»/«undefined» escapando para a tela");

/* ---------------------------------------------------------------- contextos */

function dadosLista(extra = {}) {
  return {
    vertical: "odonto", pode_editar: true, limite: { usadas: 2, limite: 8 }, base: BASE, ia: { disponivel: true, usadas: 2, limite: 300 }, sistema: [],
    itens: [
      { id: "a1", nome: "Lembrete por mensagem", gatilho: "antes_da_data", ativo: false, execucoes: 11, erros: 0, ultima_execucao_em: null, condicoes: [], config: { campo: "consulta", horas: 24 },
        acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}!" }] },
      { id: "a2", nome: "Tarefa de orçamento", gatilho: "negocio_estagio", ativo: true, execucoes: 8, erros: 0, em_espera: 3, condicoes: [], config: { estagio_id: U(13) },
        acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }] },
      { id: "a3", nome: "Aviso de mensagem", gatilho: "negocio_estagio", ativo: true, execucoes: 3, erros: 0, condicoes: [], config: { estagio_id: U(12) },
        acoes: [{ tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}" }] },
      { id: "a4", nome: "Etiqueta de retorno", gatilho: "negocio_estagio", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(11) },
        acoes: [{ tipo: "criar_tarefa", titulo: "Retorno", dono: "responsavel" }] },
    ],
    ...extra,
  };
}
/** ctx das Automações: confirmar, menu, toast e acaoComDesfazer gravam o que receberam (o teste decide as respostas). */
function ctxAuto(ui, { rpc, fn, partes = [], query = {}, confirmar = async () => true, extra = {} }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const navegou = [], toasts = [], confirmacoes = [], menus = [], desfazeres = [];
  const ctx = {
    ui: { ...ui, confirmar: async o => { confirmacoes.push(o); return confirmar(o); }, toast: (t, o) => { toasts.push([t, o || {}]); },
      menu: (ancora, itens) => { menus.push(itens.filter(x => x && x !== "-")); }, carregarCss: () => Promise.resolve(true),
      acaoComDesfazer: async o => { await o.aplicar(); return new Promise(r => desfazeres.push({ o, manter: async () => { await o.firmar(); r({ estado: "mantida" }); }, desfazer: () => { o.reverter(); r({ estado: "desfeita", desfeita: true }); } })); } },
    api: { rpcC: rpc, fn: fn || (async () => ({})), mensagemErro: e => String(e && e.message || e) },
    rota: { partes, query }, alvo, versao: "dev", titulo() {}, navegar: h => navegou.push(h), pulso: null,
    cliente: { id: "cli-1", nome: "Clínica Teste", vertical: "odonto" }, sessao: { conta: { id: "conta-1", nome: "Ana Lima" } }, vocab: VOCAB,
    comandos: { registrar: () => () => {} }, ...extra,
  };
  return { ctx, navegou, toasts, confirmacoes, menus, desfazeres };
}
const rpcLista = (dados, extra = {}) => async (nome, p) => {
  if (nome === "nx_automacoes_listar") return dados;
  if (nome === "nx_automacao_ativar") return { id: p.p_id, ativo: p.p_ativo };
  if (extra[nome]) return extra[nome](p);
  return {};
};
const cartao = (raiz, id) => raiz.querySelector(`.au-item[data-id=${id}]`);

/* ================================================================== (a) lógica pura */

test("AS-024 automação nova em branco nasce DESLIGADA", () => {
  assert.equal(L.novaAutomacao().ativo, false);
  assert.equal(L.novaAutomacao("agendado").ativo, false);
});

test("AS-035 variável digitada errada: sugestão, aviso por passo e bloqueio só para LIGAR", () => {
  assert.equal(L.sugestaoVariavel("primeironome"), "primeiro_nome");
  assert.equal(L.sugestaoVariavel("nomee"), "nome");
  assert.equal(L.sugestaoVariavel("xpto_qualquer"), null);
  const a = { nome: "Oi", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], ativo: true,
    acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }, { tipo: "enviar_mensagem", texto: "Olá {primeironome}, {empresa}!" }] };
  assert.deepEqual(L.variaveisDosPassos(a), [{ indice: 1, desconhecidas: ["primeironome"], sugestoes: ["primeiro_nome"] }]);
  assert.match(L.fraseVariaveis(L.variaveisDosPassos(a)[0]), /variável desconhecida \{primeironome\} \(use \{primeiro_nome\}\)/);
  const ligar = L.validar(a, { base: BASE, ligar: true });
  assert.equal(ligar.ok, false); assert.equal(ligar.onde, "entao"); assert.equal(ligar.indice, 1);
  assert.match(ligar.motivo, /^ação 2: variável desconhecida/);
  assert.equal(L.validar(a, { base: BASE, ligar: false }).ok, true, "desligada pode salvar");
  const tpl = { tipo: "enviar_template", template_id: "t", parametros: ["{nome_completo}"] };
  assert.deepEqual(L.variaveisDosPassos({ acoes: [tpl] })[0].desconhecidas, ["nome_completo"], "parâmetros do modelo também");
});

test("AS-267 rascunho por origem: branco, receita e IA não se misturam", () => {
  assert.equal(L.idRascunho({ item: { id: "a9" } }), "a9");
  assert.equal(L.idRascunho({ origem: "branco" }), "nova");
  assert.equal(L.idRascunho({ origem: "modelo", modelo: "lembrete" }), "nova:modelo:lembrete");
  assert.equal(L.idRascunho({ origem: "ia" }), "nova:ia");
  assert.notEqual(L.idRascunho({ origem: "modelo", modelo: "x" }), L.idRascunho({ origem: "branco" }));
});

test("AS-278 cadeia e laço entre automações ligadas", () => {
  const a = { id: "x1", nome: "Vai", gatilho: "negocio_estagio", config: { estagio_id: U(11) }, acoes: [{ tipo: "mover_estagio", estagio_id: U(13) }] };
  const b = { id: "x2", nome: "Volta", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: [{ tipo: "mover_estagio", estagio_id: U(11) }] };
  const c = { id: "x3", nome: "Etiqueta", ativo: true, gatilho: "etiqueta_adicionada", config: { etiqueta_id: U(31) }, acoes: [{ tipo: "criar_tarefa" }] };
  const r = L.cadeiasDeAutomacao(a, [a, b, { ...b, id: "x4", ativo: false }], BASE);
  assert.equal(r.length, 1, "desligada não conta, e ela mesma não conta");
  assert.deepEqual([r[0].indice, r[0].outra.nome, r[0].laco], [0, "Volta", true]);
  assert.match(r[0].por, /a etapa «Avaliou \/ orçamento»/);
  const e = L.cadeiasDeAutomacao({ acoes: [{ tipo: "etiqueta_adicionar", etiqueta_id: U(31) }] }, [c], BASE);
  assert.deepEqual([e.length, e[0].laco, e[0].por], [1, false, "a etiqueta «Orçamento»"]);
  assert.deepEqual(L.cadeiasDeAutomacao({ acoes: [{ tipo: "etiquetar", etiqueta_id: U(31), remover: true }] }, [c], BASE), [], "tirar etiqueta não dispara");
});

test("AS-277 / AS-016 / AS-070: aviso de esperas, ligadas que enviam e linha da cota", () => {
  assert.equal(L.avisoDesligarEspera({ em_espera: 0 }), null);
  assert.match(L.avisoDesligarEspera({ em_espera: 1 }), /^1 pessoa está no meio/);
  assert.match(L.avisoDesligarEspera({ em_espera: 3 }), /^3 pessoas estão no meio/);
  assert.deepEqual(L.ligadasQueEnviam(dadosLista().itens).map(x => x.id), ["a3"]);
  // plano 1000b: UB-062 — a cota soma sugestões, resumos e montagens (o texto diz isso)
  assert.deepEqual(L.linhaCotaIA({ usadas: 12, limite: 300 }), { texto: "12 de 300 usos de IA este mês (sugestões, resumos e montagens)", tom: "neutra", esgotada: false });
  assert.equal(L.linhaCotaIA({ usadas: 250, limite: 300 }).tom, "aten");
  assert.equal(L.linhaCotaIA({ usadas: 300, limite: 300 }).tom, "ruim");
  assert.equal(L.linhaCotaIA({ usadas: 3, limite: null }), null);
});

test("AS-037 / AS-038: contador do texto e horas ↔ dias", () => {
  assert.deepEqual(L.contadorTexto("x".repeat(100), 4096), { n: 100, texto: "100 / 4.096", tom: "neutra" });
  assert.equal(L.contadorTexto("x".repeat(3700), 4096).tom, "aten");
  assert.equal(L.contadorTexto("x".repeat(5000), 4096).tom, "ruim");
  assert.deepEqual(L.decomporHoras(168), { n: 7, un: "dias" });
  assert.deepEqual(L.decomporHoras(30), { n: 30, un: "horas" });
  assert.equal(L.comporHoras(7, "dias"), 168);
  assert.equal(L.comporHoras("2", "horas"), 2);
  assert.equal(L.comporHoras("", "dias"), null);
});

test("AS-040 etapa de funil desligado: aparece no seletor rotulada e não deixa LIGAR", async () => {
  const base = { ...BASE, funis: [...BASE.funis, { id: U(2), nome: "Antigo", ativo: false, estagios: [{ id: U(21), nome: "Velha", tipo: "aberto" }] }] };
  const a = { nome: "x", gatilho: "negocio_estagio", config: { estagio_id: U(21) }, condicoes: [], acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] };
  assert.deepEqual(L.etapasDeFunilDesligado(a, base), [{ onde: "quando", indice: null, etapa: "Velha", funil: "Antigo" }]);
  assert.match(L.validar(a, { base, ligar: true }).motivo, /é do funil «Antigo», que está desligado/);
  assert.equal(L.validar(a, { base, ligar: false }).ok, true);
  const d = comDom();
  try {
    const ui = await uiReal();
    const P = (await import("../web/app/auto-pecas.js")).pecas(ui, L);
    const sem = P.opcoesBase({ base }, "estagio");
    assert.equal(sem.some(g => /Antigo/.test(g.grupo)), false, "sem valor atual o funil desligado continua fora");
    const com = P.opcoesBase({ base }, "estagio", { atual: U(21) });
    assert.deepEqual(com.at(-1), { grupo: "Antigo (funil desligado)", opcoes: [{ valor: U(21), rotulo: "Velha (funil desligado)" }] });
  } finally { d.fim(); }
});

test("AS-126 / AS-153 / AS-146: número do canal com DDI, dados pessoais na memória e 23:59 → 24:00", () => {
  assert.deepEqual(CV.normalizarNumeroCanal("(12) 99999-0000"), { ok: true, numero: "+55 12 99999-0000", erro: null });
  assert.equal(CV.normalizarNumeroCanal("+55 12 3333-4444").numero, "+55 12 3333-4444");
  assert.equal(CV.normalizarNumeroCanal("99999999").ok, false, "8 dígitos sem DDI");
  assert.equal(CV.normalizarNumeroCanal("+55 02 99999-0000").ok, false, "DDD inválido");
  assert.equal(CV.normalizarNumeroCanal("+351 912 345 678").numero, "+351912345678", "outro país com +");
  const p = CV.dadosPessoaisNoTexto("Paciente João CPF 123.456.789-09, fone (12) 99830-3030, joao@x.com.br, nasceu em 03/05/1980.");
  assert.deepEqual(p.map(x => x.tipo), ["CPF", "e-mail", "telefone", "data"]);
  assert.deepEqual(CV.dadosPessoaisNoTexto("Atendemos de segunda a sexta. Implante em 3 etapas."), []);
  assert.equal(CV.fimDaFaixa("23:59"), "24:00");
  assert.equal(CV.fimDaFaixa("18:00"), "18:00");
});

test("AS-086 / AS-113 / AS-093: telefone do perfil, domínio raiz e troca de papel sensível", async () => {
  const C = await import("../web/app/config.js");
  assert.equal(C.telefoneValido("1299"), false);
  assert.equal(C.telefoneValido("(12) 99830-3030"), true);
  assert.equal(C.telefoneValido("+351 912345678"), true);
  assert.equal(C.ehDominioRaiz("suaagencia.com.br"), true);
  assert.equal(C.ehDominioRaiz("empresa.com"), true);
  assert.equal(C.ehDominioRaiz("crm.suaagencia.com.br"), false);
  assert.equal(C.ehDominioRaiz("app.empresa.com"), false);
  assert.equal(C.trocaDePapelPedeConfirmacao("atendente", "admin"), true);
  assert.equal(C.trocaDePapelPedeConfirmacao("admin", "leitura"), true);
  assert.equal(C.trocaDePapelPedeConfirmacao("atendente", "supervisor"), false);
});

test("AS-155 / AS-168 / AS-161: endereço com filtros, modelo do segmento e módulos ao trocar o plano", () => {
  assert.equal(ADM.hashClientes({}), "#/admin/clientes");
  assert.equal(ADM.hashClientes({ busca: "teste sorriso", status: "teste", org_id: "o1" }), "#/admin/clientes?busca=teste+sorriso&status=teste&org=o1");
  assert.equal(ADM.rotuloModeloSegmento("oficina mecânica"), "Oficina mecânica");
  assert.equal(ADM.rotuloModeloSegmento("consultoria"), "Outro negócio");
  // plataforma: o «automacoes» ligado à mão (fora do plano antigo) continua; «ads», que vinha do plano antigo, sai e é avisado
  const r = ADM.modulosAoTrocarPlano({ atuais: ["crm", "conversas", "ads", "automacoes"], planoAntigo: ["crm", "conversas", "ads"], planoNovo: ["crm", "conversas"], superConta: true });
  assert.deepEqual(r, { marcados: ["crm", "conversas", "automacoes"], sairam: ["ads"] });
  const g = ADM.modulosAoTrocarPlano({ atuais: ["crm", "conversas", "relatorios"], planoAntigo: ["crm", "conversas", "relatorios"], planoNovo: ["crm", "conversas", "relatorios", "ads"] });
  assert.deepEqual(g, { marcados: ["crm", "conversas", "relatorios", "ads"], sairam: [] });
});

/* ================================================================== (b) Automações: lista */

test("AS-003 chip «Com erro» existe escondido e aparece quando o pulso traz um erro", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    let batida = null;
    const t = ctxAuto(ui, { rpc: async (nome, p) => (nome === "nx_automacoes_listar" ? (batida ? { itens: [{ ...dados.itens[3], erros: 2 }] } : dados) : rpcLista(dados)(nome, p)) });
    t.ctx.pulso = { assinar: f => { batida = f; return () => { batida = null; }; } };
    await A.montar(t.ctx); await tique();
    const chipErro = () => t.ctx.alvo.querySelectorAll(".au-lista-filtro .au-chip").find(c => /^Com erro/.test(c.textContent));
    assert.ok(chipErro(), "o chip existe desde o começo");
    assert.equal(chipErro().hidden, true);
    const agora = Date.now; Date.now = () => agora() + 30000;
    try { await batida(); await tique(6); } finally { Date.now = agora; }
    assert.equal(chipErro().hidden, false);
    assert.equal(chipErro().textContent, "Com erro · 1");
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-004 filtro «Ligadas»: desligar tira o cartão (depois de um instante) e o foco vai ao próximo interruptor", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    const t = ctxAuto(ui, { rpc: rpcLista(dados) });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    raiz.querySelectorAll(".au-lista-filtro .au-chip").find(c => /^Ligadas/.test(c.textContent)).dispatchEvent(new d.Evento("click"));
    assert.equal(raiz.querySelectorAll(".au-item").length, 3);
    const sw = cartao(raiz, "a4").querySelector(".au-sw");
    sw.focus();
    sw.dispatchEvent(new d.Evento("click")); await tique(6);
    assert.ok(cartao(raiz, "a4").classList.contains("au-saindo"), "esmaece antes de sair");
    await esperar(A.SAIDA_FILTRO_MS + 80);
    assert.equal(cartao(raiz, "a4"), null, "saiu da lista filtrada");
    assert.equal(raiz.querySelectorAll(".au-item").length, 2);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-005 duplicar: dois toques criam UMA cópia; no limite do plano o item do menu vem desabilitado com o motivo", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    let salvar = 0, soltar;
    const t = ctxAuto(ui, { rpc: rpcLista(dados, { nx_automacao_salvar: () => { salvar++; return new Promise(r => { soltar = () => r({ id: "novo" }); }); } }) });
    await A.montar(t.ctx); await tique();
    cartao(t.ctx.alvo, "a4").querySelector(".au-item-mais").dispatchEvent(new d.Evento("click"));
    const dup = t.menus.at(-1).find(i => /^Duplicar/.test(i.rotulo));
    assert.equal(dup.desabilitado, false);
    dup.fn(); dup.fn(); await tique(4);
    assert.equal(salvar, 1, "o 2º toque não grava outra cópia");
    soltar(); await tique(4);
    assert.deepEqual(t.navegou, ["#/automacoes/novo"]);
    A.desmontar();
    d.doc.body.removeChild(t.ctx.alvo);
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista({ limite: { usadas: 4, limite: 4 } })) });
    await A.montar(t2.ctx); await tique();
    cartao(t2.ctx.alvo, "a4").querySelector(".au-item-mais").dispatchEvent(new d.Evento("click"));
    const dup2 = t2.menus.at(-1).find(i => /^Duplicar/.test(i.rotulo));
    assert.equal(dup2.desabilitado, true);
    assert.match(dup2.rotulo, /o plano permite até 4/);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-006 + AS-070 «Criar com IA»: sem cota o botão e os exemplos não acendem; a cota aparece antes de pedir (amarela a 80 %)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista({ ia: { disponivel: true, usadas: 300, limite: 300 } })) });
    await A.montar(t.ctx); await tique();
    const area = t.ctx.alvo.querySelector(".au-ia-txt");
    area.value = "Quando o orçamento ficar parado 3 dias, crie uma tarefa"; area.dispatchEvent(new d.Evento("input"));
    assert.equal(t.ctx.alvo.querySelector(".au-ia-bt").disabled, true, "sem cota: nada de pedir e esperar o «ia_cota»");
    assert.ok(t.ctx.alvo.querySelectorAll(".au-chip-ex").every(b => b.disabled));
    assert.equal(t.ctx.alvo.querySelector(".au-ia-cota").dataset.tom, "ruim");
    A.desmontar();
    d.doc.body.removeChild(t.ctx.alvo);
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "ia-texto"));
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista({ ia: { disponivel: true, usadas: 250, limite: 300 } })) });
    await A.montar(t2.ctx); await tique();
    const linha = t2.ctx.alvo.querySelector(".au-ia-cota");
    assert.equal(textoDe(linha), "250 de 300 usos de IA este mês (sugestões, resumos e montagens)");   // plano 1000b: UB-062
    assert.equal(linha.dataset.tom, "aten");
    const area2 = t2.ctx.alvo.querySelector(".au-ia-txt");
    area2.value = "Quando o orçamento ficar parado 3 dias, crie uma tarefa"; area2.dispatchEvent(new d.Evento("input"));
    assert.equal(t2.ctx.alvo.querySelector(".au-ia-bt").disabled, false);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-019 o texto da caixa «Criar com IA» volta depois de recarregar (fica na aba)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t.ctx); await tique();
    const area = t.ctx.alvo.querySelector(".au-ia-txt");
    area.value = "Quando alguém pedir preço, mova para orçamento"; area.dispatchEvent(new d.Evento("input"));
    await esperar(450);
    A.desmontar();                       // sair do módulo esquece a memória — o que volta é o da aba
    d.doc.body.removeChild(t.ctx.alvo);
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t2.ctx); await tique();
    assert.equal(t2.ctx.alvo.querySelector(".au-ia-txt").value, "Quando alguém pedir preço, mova para orçamento");
    A.desmontar();
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "ia-texto"));
  } finally { d.fim(); }
});

test("AS-010 + AS-011 excluir: o cartão sai na hora sem redesenhar a tela; «Desfazer» devolve sem chamada; fechar o aviso exclui de verdade", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    const excluidas = [];
    let listagens = 0;
    const t = ctxAuto(ui, { rpc: async (nome, p) => { if (nome === "nx_automacoes_listar") { listagens++; return dados; } if (nome === "nx_automacao_excluir") excluidas.push(p.p_id); return {}; } });
    t.ctx.ui.modal = async () => true;   // plano 1500c: UCA-035 — com execuções, o diálogo oferece baixar o CSV antes; aqui a resposta é «Excluir»
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    const kpiLigadas = () => textoDe(raiz.querySelectorAll(".au-resumo > *")[0]);
    cartao(raiz, "a3").querySelector(".au-item-mais").dispatchEvent(new d.Evento("click"));
    t.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    assert.equal(cartao(raiz, "a3"), null, "saiu da lista na hora");
    assert.equal(excluidas.length, 0, "nada excluído ainda");
    assert.equal(listagens, 1, "a tela não foi redesenhada");
    assert.match(kpiLigadas(), /Ligadas de 3/);
    t.desfazeres[0].desfazer(); await tique(4);
    assert.ok(cartao(raiz, "a3"), "voltou");
    assert.equal(raiz.querySelectorAll(".au-item")[2].dataset.id, "a3", "no mesmo lugar");
    assert.match(kpiLigadas(), /Ligadas de 4/);
    assert.equal(excluidas.length, 0);
    cartao(raiz, "a3").querySelector(".au-item-mais").dispatchEvent(new d.Evento("click"));
    t.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    await t.desfazeres[1].manter(); await tique(4);
    assert.deepEqual(excluidas, ["a3"], "fechou o aviso: agora sim");
    assert.equal(listagens, 1);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-012 o link do cartão é só o nome; frase descreve o link e a barra de taxa fica fora do <a>", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t.ctx); await tique();
    const c = cartao(t.ctx.alvo, "a2");
    const links = c.querySelectorAll("a");
    assert.equal(links.length, 1);
    assert.equal(links[0].textContent, "Tarefa de orçamento");
    assert.equal(links[0].getAttribute("href"), "#/automacoes/a2");
    const fr = c.querySelector(`#${links[0].getAttribute("aria-describedby")}`);
    assert.ok(fr && fr.classList.contains("au-item-frase"));
    assert.equal(c.querySelector(".au-item-corpo").localName, "div");
    assert.equal(links[0].querySelector("[role=meter], .au-item-taxa"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-016 «Pausar envios agora»: uma confirmação, desliga só as que mandam WhatsApp e «Religar as mesmas» volta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    const ativar = [];
    const t = ctxAuto(ui, { rpc: async (nome, p) => { if (nome === "nx_automacao_ativar") { ativar.push([p.p_id, p.p_ativo]); return { id: p.p_id, ativo: p.p_ativo }; } return rpcLista(dados)(nome, p); } });
    await A.montar(t.ctx); await tique();
    const bt = t.ctx.alvo.querySelector(".au-pausar");
    assert.equal(bt.hidden, false);
    bt.dispatchEvent(new d.Evento("click")); await tique(8);
    assert.equal(t.confirmacoes.length, 1);
    assert.deepEqual(ativar, [["a3", false]]);
    assert.equal(cartao(t.ctx.alvo, "a3").querySelector(".au-sw").getAttribute("aria-checked"), "false");
    assert.equal(bt.hidden, true, "nada mais enviando: o botão some");
    const aviso = t.toasts.find(x => /pausada/.test(x[0]));
    assert.equal(aviso[1].acao.rotulo, "Religar as mesmas");
    await aviso[1].acao.fn(); await tique(6);
    assert.deepEqual(ativar, [["a3", false], ["a3", true]]);
    assert.equal(cartao(t.ctx.alvo, "a3").querySelector(".au-sw").getAttribute("aria-checked"), "true");
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-277 desligar com gente em espera pergunta; Cancelar mantém ligada sem chamar o servidor", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    let resposta = false;
    const ativar = [];
    const t = ctxAuto(ui, { confirmar: async () => resposta,
      rpc: async (nome, p) => { if (nome === "nx_automacao_ativar") ativar.push(p.p_ativo); return rpcLista(dados)(nome, p); } });
    await A.montar(t.ctx); await tique();
    const sw = cartao(t.ctx.alvo, "a2").querySelector(".au-sw");
    sw.dispatchEvent(new d.Evento("click")); await tique(4);
    assert.match(t.confirmacoes[0].texto, /^3 pessoas estão no meio da sequência/);
    assert.equal(sw.getAttribute("aria-checked"), "true", "Cancelar mantém ligada");
    assert.deepEqual(ativar, []);
    resposta = true;
    sw.dispatchEvent(new d.Evento("click")); await tique(6);
    assert.deepEqual(ativar, [false]);
    assert.equal(textoDe(cartao(t.ctx.alvo, "a2").querySelector(".au-item-espera")), "0 em espera");
    // sem ninguém em espera, desligar não pergunta
    t.confirmacoes.length = 0;
    cartao(t.ctx.alvo, "a4").querySelector(".au-sw").dispatchEvent(new d.Evento("click")); await tique(6);
    assert.equal(t.confirmacoes.length, 0);
    A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (c) Automações: editor */

async function abrirEditor(d, { partes = ["nova"], query = {}, dados = dadosLista(), rpcExtra = {}, confirmar } = {}) {
  const ui = await uiReal();
  const A = await import("../web/app/automacoes.js");
  const chamadas = [];
  const t = ctxAuto(ui, { partes, query, confirmar, rpc: async (nome, p) => { chamadas.push([nome, p]); return rpcLista(dados, rpcExtra)(nome, p); } });
  await A.montar(t.ctx); await tique(4);
  return { ...t, A, chamadas, raiz: t.ctx.alvo };
}
const digitar = (d, el, v) => { el.value = v; el.dispatchEvent(new d.Evento("input")); };

test("AS-024 + AS-025 editor: nova nasce desligada; salvar LIGADA o que manda WhatsApp pede confirmação e Cancelar não grava", async () => {
  const d = comDom();
  try {
    let resposta = false;
    const e = await abrirEditor(d, { query: { modelo: "lembrete_whatsapp_cw" }, confirmar: async () => resposta, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto, id: "n1" }) } });
    const sw = e.raiz.querySelector(".au-ed-cab .au-sw");
    assert.equal(sw.getAttribute("aria-checked"), "false");
    if (!e.raiz.querySelector(".au-nome-inp").value) digitar(d, e.raiz.querySelector(".au-nome-inp"), "Lembrete");
    sw.dispatchEvent(new d.Evento("click"));
    const salvar = e.raiz.querySelectorAll(".au-ed-acoes button").find(b => /Criar automação/.test(b.textContent));
    salvar.dispatchEvent(new d.Evento("click")); await tique(10);
    if (!e.confirmacoes.length) {
      // a receita pode faltar algo para ligar na base de teste: então o editor mostra o «Falta» e não pergunta (nada é gravado)
      assert.equal(e.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 0);
    } else {
      assert.match(e.confirmacoes[0].titulo, /^Ligar «/);
      assert.equal(e.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 0, "Cancelar não salva");
      resposta = true;
      salvar.dispatchEvent(new d.Evento("click")); await tique(10);
      assert.equal(e.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 1);
    }
    e.A.desmontar();
    d.doc.body.removeChild(e.raiz);
    const b = await abrirEditor(d);
    assert.equal(b.raiz.querySelector(".au-ed-cab .au-sw").getAttribute("aria-checked"), "false", "em branco nasce desligada");
    b.A.desmontar();
  } finally { d.fim(); }
});

test("AS-025 editor (automação salva): ligar e salvar uma que manda mensagem pergunta; já ligada não pergunta de novo", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["a1"], confirmar: async () => false, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto }) } });
    e.raiz.querySelector(".au-ed-cab .au-sw").dispatchEvent(new d.Evento("click"));
    e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar").dispatchEvent(new d.Evento("click"));
    await tique(10);
    assert.equal(e.confirmacoes.length, 1);
    assert.match(e.confirmacoes[0].texto, /envia mensagens de WhatsApp/);
    assert.equal(e.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 0);
    e.A.desmontar();
    d.doc.body.removeChild(e.raiz);
    const f = await abrirEditor(d, { partes: ["a3"], confirmar: async () => false, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto }) } });
    digitar(d, f.raiz.querySelector(".au-nome-inp"), "Aviso de mensagem 2");
    f.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar").dispatchEvent(new d.Evento("click"));
    await tique(10);
    assert.equal(f.confirmacoes.length, 0, "já estava ligada");
    assert.equal(f.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 1);
    f.A.desmontar();
  } finally { d.fim(); }
});

test("AS-277 editor: salvar DESLIGADA o que tinha 3 em espera avisa quem perde os próximos passos", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["a2"], confirmar: async () => false, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto }) } });
    e.raiz.querySelector(".au-ed-cab .au-sw").dispatchEvent(new d.Evento("click"));
    e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar").dispatchEvent(new d.Evento("click"));
    await tique(10);
    assert.match(e.confirmacoes[0].texto, /^3 pessoas estão no meio da sequência/);
    assert.equal(e.chamadas.filter(c => c[0] === "nx_automacao_salvar").length, 0);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-026 a alça: tocar e soltar sem arrastar devolve o passo a não-arrastável", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["a2"] });
    const li = e.raiz.querySelector(".au-passo");
    const alca = li.querySelector(".au-alca");
    alca.dispatchEvent(new d.Evento("pointerdown"));
    assert.equal(li.draggable, true);
    alca.dispatchEvent(new d.Evento("pointerup"));
    assert.equal(li.draggable, false);
    alca.dispatchEvent(new d.Evento("pointerdown"));
    alca.dispatchEvent(new d.Evento("pointercancel"));
    assert.equal(li.draggable, false);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-028 diagrama: não é refeito a cada tecla — espera parar e pula quando os nós não mudaram", async () => {
  const d = comDom();
  try {
    const ED = await import("../web/app/auto-editor.js");
    const e = await abrirEditor(d, { partes: ["a2"] });
    const caixa = () => e.raiz.querySelector(".au-dg-caixa");
    const svg0 = caixa().firstChild;
    assert.ok(svg0, "a primeira pintura é imediata");
    const titulo = e.raiz.querySelector(".au-passo input");
    digitar(d, titulo, "Ligar já"); digitar(d, titulo, "Ligar já!");
    assert.equal(caixa().firstChild, svg0, "durante a digitação o SVG não muda");
    await esperar(ED.DIAGRAMA_MS + 60);
    const svg1 = caixa().firstChild;
    assert.notEqual(svg1, svg0, "parou de digitar: redesenha uma vez");
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Outro nome");     // o nome não entra no diagrama
    await esperar(ED.DIAGRAMA_MS + 60);
    assert.equal(caixa().firstChild, svg1, "nós iguais: não redesenha");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-031 + AS-032 cabeçalho do editor com «⋯» no celular e aviso ao fechar a aba com edição pendente", async () => {
  const d = comDom();
  const ouvintes = [];
  const salvo = { add: globalThis.addEventListener, rem: globalThis.removeEventListener };
  globalThis.addEventListener = (tipo, fn) => ouvintes.push([tipo, fn]);
  globalThis.removeEventListener = (tipo, fn) => { const i = ouvintes.findIndex(o => o[0] === tipo && o[1] === fn); if (i >= 0) ouvintes.splice(i, 1); };
  try {
    const e = await abrirEditor(d, { partes: ["a2"] });
    const mais = e.raiz.querySelector(".au-ed-mais");
    assert.ok(mais);
    mais.dispatchEvent(new d.Evento("click"));
    // plano 1000 · AS-051 (lote auto-2): o «⋯» ganhou «Salvar e continuar aqui»
    assert.deepEqual(e.menus.at(-1).map(i => i.rotulo), ["Testar (sem enviar nada)", "Salvar e continuar aqui", "Duplicar", "Copiar para outro cliente (texto)", "Cancelar"]);   // plano 1500c: UCA-103 — copiar a automação como texto para colar em outro cliente
    for (const rot of ["Testar", "Duplicar", "Cancelar", "Salvar"]) assert.ok(e.raiz.querySelectorAll(".au-ed-acoes .au-ed-largo").some(b => b.textContent.includes(rot)), rot);
    const bu = ouvintes.find(o => o[0] === "beforeunload")[1];
    const ev1 = { preventDefault() { this.p = true; } };
    bu(ev1);
    assert.equal(ev1.p, undefined, "sem mudança: fecha sem perguntar");
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Mudou");
    const ev2 = { preventDefault() { this.p = true; } };
    bu(ev2);
    assert.equal(ev2.p, true, "com mudança: o navegador pergunta");
    e.A.desmontar();
    assert.equal(ouvintes.filter(o => o[0] === "beforeunload").length, 0, "sai junto com a tela");
    const css = ler("web/app/automacoes.css");
    assert.match(css, /@media \(max-width: 760px\) \{\s*\.au-ed-largo \{ display: none; \}/);
  } finally { globalThis.addEventListener = salvo.add; globalThis.removeEventListener = salvo.rem; d.fim(); }
});

test("AS-035 + AS-036 + AS-037 passo «Enviar mensagem»: aviso de variável errada, prévia com exemplo e contador", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["a1"] });
    const passo = e.raiz.querySelector(".au-passo-enviar_mensagem");
    const ta = passo.querySelector("textarea");
    assert.equal(textoDe(passo.querySelector(".au-msg-previa .au-bolha")), "Olá, Alex!");   // plano 2000d · DU-038: nome de exemplo neutro
    assert.equal(textoDe(passo.querySelector(".au-cont")), "21 / 4.096");
    digitar(d, ta, "Oi {primeironome}, tudo bem?");
    assert.match(textoDe(passo.querySelector(".au-passo-aviso")), /variável desconhecida \{primeironome\} \(use \{primeiro_nome\}\)/);
    await esperar(200);     // plano 1000b: UB-021 — a lateral espera 120 ms sem tecla (dentro do passo continua na hora)
    assert.ok(e.raiz.querySelectorAll(".au-aviso-lat").some(p => /Passo 1: variável desconhecida/.test(p.textContent)));
    assert.equal(textoDe(passo.querySelector(".au-msg-previa .au-bolha")), "Oi {primeironome}, tudo bem?", "a prévia mostra o buraco");
    digitar(d, ta, "x".repeat(3800));
    assert.equal(passo.querySelector(".au-cont").dataset.tom, "aten");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-038 «parado na etapa»: escolher 7 dias grava 168 horas", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "a5", nome: "Parado", gatilho: "tempo_no_estagio", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(13), horas: 48 },
      acoes: [{ tipo: "criar_tarefa", titulo: "Cobrar", dono: "responsavel" }] });
    const e = await abrirEditor(d, { partes: ["a5"], dados, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto }) } });
    const campo = e.raiz.querySelector(".au-campo-hr");
    assert.equal(String(campo.querySelector("input").value), "2");
    assert.equal(campo.querySelectorAll("option").find(o => o.selected || o.hasAttribute("selected")).value, "dias", "48 h aparece como 2 dias");
    campo.querySelector("select").value = "dias";        // o DOM de mentira não deriva o value da <option selected>
    digitar(d, campo.querySelector("input"), "7");
    assert.match(textoDe(campo.querySelector(".au-hr-resumo")), /= 7 dias \(168 h\)/);   // plano 1500c: UCA-039 — resumo legível
    e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar").dispatchEvent(new d.Evento("click"));
    await tique(10);
    assert.equal(e.chamadas.find(c => c[0] === "nx_automacao_salvar")[1].p_auto.config.horas, 168);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-044 «Testar com…» um registro: a busca usa nx_buscar e o teste vai com p_negocio", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["a2"], rpcExtra: {
      nx_buscar: () => ({ negocios: [{ id: 801, titulo: "Implante — Maria", contato_nome: "Maria Souza", estagio_nome: "Avaliou / orçamento" }] }),
      nx_auto_simular: () => ({ alvos: [], total: 0 }) } });
    const busca = e.raiz.querySelector(".au-teste-busca");
    digitar(d, busca, "mar");
    await esperar(360); await tique(4);
    const op = e.raiz.querySelector(".au-teste-op");
    assert.match(textoDe(op), /Implante — Maria/);
    op.dispatchEvent(new d.Evento("click")); await tique(10);
    assert.match(textoDe(e.raiz.querySelector(".au-teste-escolhido")), /Testando só com «Implante — Maria»/);
    const sim = e.chamadas.filter(c => c[0] === "nx_auto_simular").at(-1);
    assert.equal(sim[1].p_negocio, 801);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-055 execuções: a resposta antiga que chega depois é descartada", async () => {
  const d = comDom();
  try {
    const pend = [];
    const e = await abrirEditor(d, { partes: ["a2"], query: { aba: "execucoes" }, rpcExtra: {
      nx_automacao_execucoes: p => new Promise(r => pend.push({ r, p })), nx_automacao_execucoes_dia: () => null } });
    await tique(4);
    assert.equal(pend.length, 1);
    pend[0].r([{ id: 1, criado_em: new Date().toISOString(), ok: true, estado: "ok", detalhe: "Feito ANTIGO" }]);
    await tique(6);
    e.raiz.querySelectorAll("button").find(b => b.textContent.trim() === "Atualizar").dispatchEvent(new d.Evento("click"));
    await tique(4);
    // Atualizar de novo, e a carga 2 (antiga) chega DEPOIS da 3
    e.raiz.querySelector(".au-painel:not([hidden])");
    const atual = pend.length;
    assert.equal(atual, 2);
    // dispara a 3ª carga direto pelo comando da aba (o painel está em esqueleto, sem botão): reabrir a aba
    e.raiz.querySelectorAll(".au-abas [role=tab]")[0].dispatchEvent(new d.Evento("click"));
    await tique(2);
    pend[1].r([{ id: 2, criado_em: new Date().toISOString(), ok: true, estado: "ok", detalhe: "Feito NOVO" }]);
    await tique(6);
    assert.match(textoDe(e.raiz), /Feito NOVO/);
    assert.doesNotMatch(textoDe(e.raiz), /Feito ANTIGO/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-278 editor: passo que dispara outra automação ligada (laço) é avisado no passo e no resumo", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "b1", nome: "Devolve", gatilho: "negocio_estagio", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(11) },
      acoes: [{ tipo: "mover_estagio", estagio_id: U(12) }] });
    dados.itens.push({ id: "b2", nome: "Vai", gatilho: "negocio_estagio", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(12) },
      acoes: [{ tipo: "mover_estagio", estagio_id: U(11) }] });
    const e = await abrirEditor(d, { partes: ["b2"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-passo .au-passo-aviso")), /Laço: «Vai» → «Devolve» → volta para esta/);   // plano 1500c: UCA-015 — o aviso mostra o caminho do laço
    // plano 1500c: UCA-015 — o aviso do lado mostra o passo e o caminho do laço
    assert.ok(e.raiz.querySelectorAll(".au-aviso-lat").some(p => /^Passo 1 \(usa a etapa «Nova conversa»\): Laço: «Vai» → «Devolve» → volta para esta/.test(textoDe(p))));
    e.A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (d) Configurações */

function ctxCfg(ui, { partes = [], rpc = async () => ({}), confirmar = async () => true, conta = { id: "c1", papel: "clinica", nome: "Ana", email: "ana@x.com" } } = {}) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const navegou = [], toasts = [], confirmacoes = [], chamadas = [];
  const api = { rpcC: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, rpc: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, mensagemErro: e => String(e && e.message || e), fn: async () => ({}) };
  const ctx = {
    ui: { ...ui, carregarCss: () => Promise.resolve(true), toast: (t, o) => toasts.push([t, o || {}]), confirmar: async o => { confirmacoes.push(o); return confirmar(o); }, menu() {} },
    api, rota: { partes, query: {} }, alvo, versao: "dev", titulo() {}, navegar: h => navegou.push(h),
    configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: ["perfil", "usuarios", "ia"] }, recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }) },
    sessao: { conta, org: null }, cliente: { id: "cli-1", nome: "Clínica Teste" }, pode: () => true, temModulo: () => true, linkPublico: l => `https://x/${l}`,
  };
  return { ctx, navegou, toasts, confirmacoes, chamadas };
}

test("AS-077 + AS-081 hub: a seção não é região viva (anuncia só «X aberta») e o cabeçalho do hub sai da tela no celular dentro da seção", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"] });
    await cfg.montar(t.ctx); await tique(4);
    assert.equal(t.ctx.alvo.querySelector(".cfg-sec").getAttribute("aria-live"), null);
    assert.ok(t.ctx.alvo.querySelector("header.cfg-cab.na-secao"));
    assert.equal(t.ctx.alvo.querySelectorAll("h1").length, 1);
    await esperar(50);
    assert.equal(d.doc.getElementById("anuncio").textContent, "Perfil aberta.");
    assert.match(ler("web/app/config.css"), /@media \(max-width: 760px\) \{\s*\.cfg-cab\.na-secao \{ position: absolute; width: 1px;/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-086 perfil: celular inválido é recusado na tela, sem ir ao servidor", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"] });
    await cfg.montar(t.ctx); await tique(4);
    const form = t.ctx.alvo.querySelector("form");
    form.querySelector("input[name=telefone]").value = "1299";
    form.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_perfil_salvar").length, 0);
    assert.match(textoDe(form.querySelector("[data-campo=telefone]")), /Use DDD \+ número/);
    cfg.desmontar();
  } finally { d.fim(); }
});

function usuariosFalsos(extra = {}) {
  return { usuarios: [{ conta_id: "u1", nome: "Bruno", email: "b@x.com", papel: "atendente", editavel: true, departamentos: [] }],
    convites: [], departamentos: [], uso: 2, limite: 5, ...extra };
}

test("AS-093 usuários: promover a Administrador pergunta (Cancelar volta o seletor); troca comum salva com «Desfazer»", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["usuarios"], confirmar: async () => false,
      rpc: async (n, p) => (n === "nx_usuarios_listar" ? usuariosFalsos() : n === "nx_usuario_salvar" ? usuariosFalsos({ usuarios: [{ ...usuariosFalsos().usuarios[0], ...p.p_usuario }] }) : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const sel = () => t.ctx.alvo.querySelector("select.papel-sel");
    sel().value = "admin"; sel().dispatchEvent(new d.Evento("change")); await tique(4);
    assert.match(t.confirmacoes[0].titulo, /^Tornar Bruno administrador\?/);
    assert.equal(sel().value, "atendente");
    assert.equal(t.chamadas.filter(c => c[0] === "nx_usuario_salvar").length, 0);
    sel().value = "supervisor"; sel().dispatchEvent(new d.Evento("change")); await tique(6);
    assert.equal(t.confirmacoes.length, 1, "troca comum não pergunta");
    const aviso = t.toasts.at(-1);
    assert.equal(aviso[1].acao.rotulo, "Desfazer");
    aviso[1].acao.fn(); await tique(6);
    assert.deepEqual(t.chamadas.filter(c => c[0] === "nx_usuario_salvar").map(c => c[1].p_usuario.papel), ["supervisor", "atendente"]);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-094 usuários: no limite, «Convidar» desabilitado com o porquê e o caminho para o Plano", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => (n === "nx_usuarios_listar" ? usuariosFalsos({ uso: 5, limite: 5 }) : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const bt = t.ctx.alvo.querySelectorAll("button").find(b => b.textContent.trim() === "Convidar");
    assert.equal(bt.disabled, true);
    const aviso = t.ctx.alvo.querySelector("#cfg-us-limite");
    assert.match(textoDe(aviso), /Plano com 5 de 5 usuários/);
    assert.equal(aviso.querySelector("a").getAttribute("href"), "#/config/plano");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-082 + AS-152 + AS-153 Assistente de IA: sair com alteração pergunta; prévia rotulada «aproximada»; CPF na memória pede confirmação", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    let resposta = false;
    const t = ctxCfg(ui, { partes: ["ia"], confirmar: async () => resposta,
      rpc: async n => (n === "nx_cv_base" ? { ia: { ligada: true, cota: { usadas: 1, limite: 10 } }, config: { ia: { tom: "proximo", sobre: "Clínica" } } } : {}) });
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".cfg-ia-preview")), /PRÉVIA APROXIMADA.*o texto real que o agente recebe é gerado pelo servidor/);
    assert.equal(raiz.querySelectorAll("h1").length, 1, "AS-078: um h1 só (o do hub)");
    // sem alteração, trocar de seção não pergunta
    const link = raiz.querySelectorAll("a.cfg-nav-item").find(a => a.getAttribute("href") === "#/config/perfil");
    const ev0 = new d.Evento("click"); ev0.button = 0; link.dispatchEvent(ev0);
    assert.equal(ev0.defaultPrevented, false);
    const nome = raiz.querySelector("[name=assistente_nome]");
    digitar(d, nome, "Bia");
    const ev = new d.Evento("click"); ev.button = 0; link.dispatchEvent(ev); await tique(4);
    assert.equal(ev.defaultPrevented, true);
    assert.match(t.confirmacoes.at(-1).titulo, /Sair sem salvar o assistente/);
    assert.deepEqual(t.navegou, [], "Cancelar fica");
    // memória com CPF: pergunta antes de salvar; Cancelar não salva
    const mem = raiz.querySelector("[name=memoria_aprovada]");
    digitar(d, mem, "Cliente fiel: CPF 123.456.789-09");
    raiz.querySelector("form.cfg-ia").dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(t.confirmacoes.at(-1).texto, /CPF \(«123\.456\.789-09»\)/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_ia_config_salvar").length, 0);
    resposta = true;
    const ev2 = new d.Evento("click"); ev2.button = 0; link.dispatchEvent(ev2); await tique(4);
    assert.deepEqual(t.navegou, ["#/config/perfil"], "confirmou: segue");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-102 Marca: trocar de aba rápido não deixa o editor antigo pintar por cima do novo", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const lentos = [];
    const t = ctxCfg(ui, { partes: ["marca"], conta: { id: "c1", papel: "gestor", super: false },
      rpc: async n => { if (n === "nx_cliente_tema") return new Promise((_, rej) => lentos.push(() => rej(Object.assign(new Error("lento"), { codigo: "x" })))); if (n === "nx_orgs_listar") throw Object.assign(new Error("rapido"), { codigo: "y" }); return {}; } });
    t.ctx.sessao.org = { id: "org-a", nome: "Revenda" };
    t.ctx.shell.prontos.CONFIG_PRONTAS.push("marca");
    t.ctx.shell.tema = {}; t.ctx.shell.marcaOrg = () => ({});
    await cfg.montar(t.ctx); await tique(6);
    const abas = t.ctx.alvo.querySelectorAll("[role=tab]");
    assert.equal(abas.length, 2, "Tema da empresa + Marca da agência");
    abas[1].dispatchEvent(new d.Evento("click")); await tique(8);
    lentos.forEach(f => f()); await tique(8);
    const erros = t.ctx.alvo.querySelectorAll(".erro-cartao, [role=alert]").filter(x => x.isConnected);
    assert.ok(erros.length <= 1, "só a última aba pinta");
    assert.doesNotMatch(textoDe(t.ctx.alvo), /lento/);
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (e) Números de WhatsApp */

function ctxNum(ui, { rpc, fn, modal }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("div"));
  const toasts = [], modais = [];
  const ctx = {
    ui: { ...ui, toast: (t, o) => toasts.push([t, o && o.tipo]), menu() {}, carregarCss: () => Promise.resolve(true), confirmar: async () => true,
      modal: async o => { modais.push(o); return modal ? modal(o) : null; } },
    api: { rpcC: rpc, fn: fn || (async () => ({ ok: true })), mensagemErro: e => String(e && e.message || e) },
    rota: { partes: ["numeros"], query: {} }, versao: "dev", cliente: { id: "cli-1", nome: "Clínica Teste" }, sessao: { conta: { id: "conta-1" } },
    pode: () => true, temModulo: () => true, pronto: () => true, navegar() {}, comandos: { registrar: () => () => {} },
  };
  return { ctx, alvo, toasts, modais };
}
const canaisCw = () => [{ id: "cw1", nome: "Recepção", provedor: "codewords", status: "ativo", estado: "conectado", numero_exibicao: "+55 12 99999-0000",
  codewords: { tem_api_key: true, conectado: true, rota: "fluxo", service_id: "svc", ia_ligada: true } }];

test("AS-121 + AS-122 Números: com histórico do servidor nada é gravado no aparelho; cartão sem role=status e só mudança é anunciada", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const hist = [{ id: 1, canal_id: "cw1", estado: "conectado", detalhe: null, em: new Date(Date.now() - 3600e3).toISOString() }];
    const t = ctxNum(ui, { rpc: async (n, p) => (n === "nx_canais_listar" ? canaisCw() : n === "nx_cv_base" ? { departamentos: [] } : n === "nx_canal_historico_listar" ? hist : {}) });
    const escritas = [];
    const setItem = localStorage.setItem;
    localStorage.setItem = (k, v) => { escritas.push(k); setItem(k, v); };
    await montar(t.ctx, t.alvo); await tique(6);
    assert.deepEqual(escritas.filter(k => /hist|canal/i.test(k)), [], "histórico do servidor: o localStorage não muda");
    assert.equal(t.alvo.querySelector(".cfg-cw-status-text").getAttribute("role"), null);
    assert.equal(t.alvo.querySelectorAll(".cfg-canal [role=status]").length, 0);
    localStorage.setItem = setItem;
  } finally { d.fim(); }
});

test("AS-129 Números: um botão «Adicionar número» que abre a escolha entre CodeWords (recomendado) e Meta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_canais_listar" ? canaisCw() : n === "nx_cv_base" ? { departamentos: [] } : []),
      modal: o => { if (o.titulo === "Adicionar número de WhatsApp") { let fechou = false; o.aoAbrir({ fechar: () => { fechou = true; } }); o.corpo.querySelector("[data-caminho=meta]").dispatchEvent(new d.Evento("click")); return fechou ? null : null; } return null; } });
    await montar(t.ctx, t.alvo); await tique(6);
    const bts = t.alvo.querySelectorAll(".cab button, header button").map(b => textoDe(b));
    assert.ok(bts.includes("Adicionar número"));
    assert.equal(bts.filter(x => /CodeWords|Conectar número/.test(x)).length, 0, "não há mais dois botões");
    t.alvo.querySelector(".cfg-add-numero").dispatchEvent(new d.Evento("click")); await tique(6);
    const esc = t.modais[0];
    assert.equal(esc.titulo, "Adicionar número de WhatsApp");
    assert.match(textoDe(esc.corpo.querySelector("[data-caminho=codewords]")), /WhatsApp pelo CodeWords.*Recomendado/);
    assert.ok(t.modais.length >= 2, "escolher Meta abre o assistente da Meta");
  } finally { d.fim(); }
});

test("AS-119 + AS-078 + AS-146 (fonte): «Ligar na IA» e «Receber no Órbita» consultam o aparelho em vez de inventar «Conectado»; um h1 por página; 23:59 vira 24:00 ao ler a grade", () => {
  const src = ler("web/app/cv-config.js");
  assert.doesNotMatch(src, /estadoVivo = \{ \.\.\.r, inscrito_certo: true/);
  assert.equal((src.match(/statusAtual\.textContent = "Conferindo o aparelho…";\s*ui\.toast\([^)]*\);\s*await conferirDepoisDoPedido\(\);/g) || []).length, 2);     // revisão 7: consulta que falha redesenha os passos
  assert.doesNotMatch(src, /h\("h1"/);
  assert.match(src, /faixas\.push\(\[a\.value, fimDaFaixa\(b\.value\)\]\)/);
});

/* ================================================================== (f) Admin */

function ctxAdm(ui, { partes = ["clientes"], rpc, confirmar = async () => true, query = {} }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const toasts = [], confirmacoes = [], chamadas = [];
  const ctx = {
    ui: { ...ui, tabela: ({ colunas, linhas }) => ({ el: ui.h("div", { class: "tab-falsa" }, linhas.map(l => ui.h("div", { class: "tab-linha", dataset: { id: l.id } },
      colunas.map(c => ui.h("div", { class: "tab-cel", dataset: { col: c.chave } }, c.render ? c.render(l) : String(l[c.chave] ?? "")))))) }),
      carregarCss: () => Promise.resolve(true), toast: (t, o) => toasts.push([t, o && o.tipo]), confirmar: async o => { confirmacoes.push(o); return confirmar(o); }, modal: async () => null },
    api: { rpc: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, mensagemErro: e => String(e && e.message || e) },
    rota: { partes, query }, alvo, titulo() {}, navegar() {}, pronto: () => false, versao: "dev",
    sessao: { conta: { super: true }, org: { id: "org-a", nome: "Revenda A" } },
    shell: { recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }), clientes: () => [] },
  };
  return { ctx, alvo, toasts, confirmacoes, chamadas };
}
const CLI = () => [{ id: "c1", nome: "Alfa", slug: "alfa", status: "ativo", plano: "essencial", org_id: "org-a", ativo: true, vertical: "odonto",
  comercial: { pacote: "essencial", segmento: "Clínica odontológica" }, modulos: ["crm", "conversas", "automacoes"], uso: {}, limites: {} }];
const PLANOS = [{ id: "essencial", nome: "Essencial", modulos: ["crm", "conversas"] }, { id: "pro", nome: "Pro", modulos: ["crm", "conversas", "ads"] }];

test("AS-155 Admin: mudar o filtro grava ?status= no endereço (replaceState) e o «‹ Clientes» do detalhe volta para ele", async () => {
  const d = comDom();
  const trocas = [];
  const salvo = { history: globalThis.history, location: globalThis.location };
  globalThis.history = { state: null, replaceState: (s, t, u) => trocas.push(u) };
  globalThis.location = { hash: "#/admin/clientes", origin: "https://app.x", host: "app.x", hostname: "app.x", protocol: "https:" };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const t = ctxAdm(ui, { rpc: async n => (n === "nx_clientes_admin" ? CLI() : n === "nx_planos_listar" ? PLANOS : []) });
    await adm.montar(t.ctx); await tique(6);
    const op = t.alvo.querySelectorAll(".adm-seg-status [role=tab], .adm-seg-status button").find(b => /Em teste/.test(b.textContent));
    op.dispatchEvent(new d.Evento("click")); await tique(6);
    assert.equal(trocas.at(-1), "#/admin/clientes?status=teste");
    adm.desmontar();
    d.doc.body.removeChild(t.alvo);
    const t2 = ctxAdm(ui, { partes: ["clientes", "c1"], rpc: async n => (n === "nx_clientes_admin" ? CLI() : n === "nx_planos_listar" ? PLANOS : n === "nx_usuarios_listar" ? { usuarios: [], convites: [] } : []) });
    await adm.montar(t2.ctx); await tique(6);
    assert.equal(t2.alvo.querySelector(".adm-voltar").getAttribute("href"), "#/admin/clientes?status=teste");
    adm.desmontar();
  } finally { globalThis.history = salvo.history; globalThis.location = salvo.location; if (salvo.history === undefined) delete globalThis.history; if (salvo.location === undefined) delete globalThis.location; d.fim(); }
});

test("AS-159 + AS-161 + AS-168 Admin → cliente: convite pendente pergunta antes de gerar outro; trocar o plano mantém o módulo extra e avisa o que sai; modelo do segmento à vista", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], confirmar: async () => false,
      rpc: async n => (n === "nx_clientes_admin" ? CLI() : n === "nx_planos_listar" ? PLANOS
        : n === "nx_usuarios_listar" ? { usuarios: [], convites: [{ id: "cv1", papel: "admin", nome: "Dra. Helena", expira_em: new Date(Date.now() + 86400e3).toISOString() }] } : []) });
    await adm.montar(t.ctx); await tique(8);
    assert.match(textoDe(t.alvo.querySelector(".adm-convites")), /1 convite aguardando.*Dra\. Helena.*Revogar/);
    t.alvo.querySelectorAll("button").find(b => /Gerar convite do administrador/.test(b.textContent)).dispatchEvent(new d.Evento("click"));
    await tique(4);
    assert.match(t.confirmacoes[0].titulo, /Já existe um convite aguardando/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_convite_criar").length, 0, "Cancelar não cria outro");
    // plano: «automacoes» foi ligado à mão (fora do Essencial) e continua ao ir para o Pro
    const sel = t.alvo.querySelector("select[name=plano]");
    sel.value = "pro"; sel.dispatchEvent(new d.Evento("change")); await tique(2);
    const marcados = t.alvo.querySelectorAll(".campo-modulos input[type=checkbox]").filter(x => x.checked).map(x => x.value);
    assert.deepEqual(marcados.sort(), ["ads", "automacoes", "conversas", "crm"]);
    sel.value = "essencial"; sel.dispatchEvent(new d.Evento("change")); await tique(2);
    assert.match(textoDe(t.alvo.querySelector(".adm-mod-aviso")), /Fora do plano novo: Anúncios/);
    // segmento → modelo
    assert.equal(textoDe(t.alvo.querySelector(".adm-modelo")), "Modelo em uso: Clínica odontológica.");
    digitar(d, t.alvo.querySelector("input[name=segmento]"), "oficina mecânica");
    assert.equal(textoDe(t.alvo.querySelector(".adm-modelo")), "Ao salvar, passa a usar o modelo: Oficina mecânica.");
    adm.desmontar();
  } finally { d.fim(); }
});

test("CSS da frente auto (plano 1000): só tokens, sem transition: all, movimento reduzido para o cartão que sai", () => {
  const css = ler("web/app/automacoes.css") + ler("web/app/config.css");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(ler("web/app/automacoes.css"), /prefers-reduced-motion: reduce\) \{\s*\.au-item\.au-saindo \{ transition: none; \}/);
  for (const sel of [".au-item-link::after", ".au-ia-cota-aten", ".au-cont[data-tom=\"aten\"]", ".au-teste-op", ".cfg-caminho", ".adm-mod-aviso"]) assert.ok(css.includes(sel), sel);
  assert.match(css, /\.au-teste-op \{[^}]*min-height: 44px/);
});

/* ################################################################## lote auto-2 (59 itens) */
import * as CFG from "../web/app/config.js";

/* ================================================================== (a2) lógica pura */

test("AS-029 / AS-030 / AS-014: frase sem passos, promessa de «Pronta» por gatilho e período dos números do topo", () => {
  const f = L.descrever({ gatilho: "negocio_estagio", config: { estagio_id: U(12) }, condicoes: [], acoes: [] }, BASE, VOCAB);
  assert.match(f, /ainda sem passos — acrescente o que fazer em «Então»\.$/);
  assert.doesNotMatch(f, /nenhuma ação/);
  assert.match(L.textoProntaLigada("negocio_estagio"), /em até 15 segundos/);
  assert.match(L.textoProntaLigada("sem_resposta"), /quando o tempo escolhido passar/);
  assert.match(L.textoProntaLigada("antes_da_data"), /quando o tempo escolhido passar/);
  assert.match(L.textoProntaLigada("agendado"), /próximo dia e horário escolhidos/);
  assert.equal(L.periodoDoResumo([{ execucoes: 9 }]), "total");
  const de30 = [{ ativo: true, execucoes: 900, erros: 300, ok_30d: 18, erro_30d: 2 }, { ativo: false, execucoes: 5, erros: 0, ok_30d: 0, erro_30d: 0 }];
  assert.equal(L.periodoDoResumo(de30), "30d");
  const r = L.resumoAutomacoes(de30);
  assert.equal(r.execucoes, 20); assert.equal(r.erros, 2); assert.equal(r.pct, 90);
});

test("AS-018 / AS-071 / AS-072 / AS-017: por onde sai o WhatsApp, dado pessoal no pedido, pedidos recentes e ajuste das regras fixas", () => {
  // plano 2000d · DU-025: sem nome de fornecedor (o cliente da revenda lê esta frase)
  assert.match(L.viaWhatsApp([{ provedor: "meta" }]), /pelo número oficial/);
  assert.doesNotMatch(L.viaWhatsApp([{ provedor: "meta" }]), /CodeWords/);
  assert.match(L.viaWhatsApp([{ provedor: "codewords" }]), /\(pelo número conectado por aparelho\)$/);
  assert.match(L.viaWhatsApp([{ provedor: "codewords" }, { provedor: "meta" }]), /aparelho ou pelo número oficial/);
  assert.match(L.viaWhatsApp([]), /assim que houver um número conectado/);
  assert.equal(L.viaWhatsApp([{ id: 1 }]), "manda mensagem pelo WhatsApp");
  assert.deepEqual(L.dadosPessoaisNoPedido("Lembrar a Maria (12) 99830-3030 e maria@x.com.br").map(x => x.tipo), ["e-mail", "telefone"]);
  assert.deepEqual(L.dadosPessoaisNoPedido("CPF 123.456.789-09").map(x => x.tipo), ["CPF"]);
  assert.deepEqual(L.dadosPessoaisNoPedido("Quando o orçamento ficar parado 3 dias, crie uma tarefa"), []);
  assert.deepEqual(L.juntarPedidoRecente(["b", "a"], "á"), ["á", "b"], "o mais novo primeiro, sem repetir (sem acento)");
  assert.equal(L.juntarPedidoRecente(["1", "2", "3", "4", "5"], "6").length, 5);
  assert.deepEqual(L.ajusteDaRegraSistema("Fora do horário responde sozinho"), { href: "#/config/departamentos", rotulo: "Configurar horários" });
  assert.equal(L.ajusteDaRegraSistema("Rodízio do departamento").href, "#/config/usuarios");
  assert.equal(L.ajusteDaRegraSistema("Anúncio marca a origem"), null);
});

test("AS-052 / AS-023 / AS-015 / AS-042: nome sugerido, nome repetido, busca/ordem da lista e busca na paleta", () => {
  const a = { gatilho: "negocio_estagio", config: { estagio_id: U(12) }, acoes: [{ tipo: "esperar", minutos: 60 }, { tipo: "criar_tarefa" }] };
  assert.match(L.sugestaoNome(a, BASE, VOCAB), /^Etapa Avaliação agendada → [a-zà-ú]/);
  assert.equal(L.sugestaoNome({ gatilho: "negocio_estagio", config: {}, acoes: [] }, BASE, VOCAB), "", "sem etapa e sem passo não há o que sugerir");
  const itens = dadosLista().itens;
  assert.equal(L.nomeRepetido("aviso de MENSAGEM ", itens).id, "a3");
  assert.equal(L.nomeRepetido("Aviso de mensagem", itens, "a3"), null, "a própria não conta");
  assert.equal(L.nomeRepetido("", itens), null);
  const l = [{ id: 1, nome: "Zeta", erros: 0, ultima_execucao_em: "2026-10-01T10:00:00Z" }, { id: 2, nome: "Ábaco lembrete", erros: 3, ultima_execucao_em: null },
    { id: 3, nome: "Lembrete", erros: 1, ultima_execucao_em: "2026-10-12T10:00:00Z" }];
  assert.deepEqual(L.listaAutomacoes(l, { termo: "lembrete" }).map(x => x.id), [2, 3]);
  assert.deepEqual(L.listaAutomacoes(l, { ordem: "erros" }).map(x => x.id), [2, 3, 1]);
  assert.deepEqual(L.listaAutomacoes(l, { ordem: "nome" }).map(x => x.id), [2, 3, 1]);
  assert.deepEqual(L.listaAutomacoes(l, { ordem: "recente" }).map(x => x.id), [3, 1, 2]);
  const ids = L.acoesDaBusca("etiq", VOCAB);
  assert.ok(ids.length >= 2 && ids.every(id => /etiqu/.test(id)), ids.join(","));
  assert.equal(L.acoesDaBusca("", VOCAB).length, L.ACOES.filter(x => x.disponivel !== false && x.menu !== false).length);
});

test("AS-083 / AS-109 / AS-116 / AS-117 / AS-085 / AS-100: lógica das Configurações", () => {
  const secs = [{ id: "perfil", titulo: "Perfil", desc: "Seu nome, celular e senha", grupo: "Você" },
    { id: "departamentos", titulo: "Departamentos e horários", desc: "Quem atende o quê e em qual horário", grupo: "Equipe" },
    { id: "numeros", titulo: "Números de WhatsApp", desc: "Conecte o WhatsApp", grupo: "Atendimento" }];
  assert.deepEqual(CFG.filtrarSecoes(secs, "horario"), ["departamentos"]);
  assert.deepEqual(CFG.filtrarSecoes(secs, "SENHA"), ["perfil"]);
  assert.deepEqual(CFG.filtrarSecoes(secs, "modelos"), ["numeros"], "palavra-chave fora do título");
  assert.equal(CFG.filtrarSecoes(secs, "").length, 3);
  assert.equal(CFG.suporteWaValido("12345").ok, false);
  assert.equal(CFG.suporteWaValido("12999998888").ok, false, "sem o 55 o wa.me abriria outro país");
  assert.deepEqual(CFG.suporteWaValido("+55 (12) 99999-8888"), { ok: true, digitos: "5512999998888", erro: null });
  assert.equal(CFG.suporteWaValido("+1 415 555 0100").ok, true);
  assert.equal(CFG.suporteWaValido("").ok, true);
  const sexta10h = new Date(2026, 9, 9, 10), segunda11h = new Date(2026, 9, 12, 11), sabado = new Date(2026, 9, 10, 12);
  assert.equal(CFG.diasUteisDesde(sexta10h.toISOString(), sabado), 0);
  assert.equal(CFG.diasUteisDesde(sexta10h.toISOString(), segunda11h), 1);
  assert.equal(CFG.diasUteisDesde("nada", segunda11h), null);
  assert.deepEqual(CFG.statusDoPlano("teste", "2026-10-01", "2026-10-13"), ["Teste encerrado", "ruim"]);
  assert.deepEqual(CFG.statusDoPlano("teste", "2026-10-20", "2026-10-13"), ["Em teste", "info"]);
  assert.deepEqual(CFG.statusDoPlano("ativo", null, "2026-10-13"), ["Ativo", "ok"]);
  const p = CFG.papelNaConta({ sessao: { conta: { papel: "clinica" } }, cliente: { id: "c1", nome: "Clínica X", papel: "admin" },
    shell: { clientes: () => [{ id: "c1", nome: "Clínica X", papel: "admin" }, { id: "c2", nome: "Loja Y", papel: "atendente" }] } });
  assert.equal(p.frase, "Você é Administrador na Clínica X.");
  assert.deepEqual(p.outras, ["Loja Y (Atendente)"]);
  assert.equal(CFG.papelNaConta({ sessao: { conta: { super: true } }, cliente: null }).frase, "Você entra como equipe da plataforma.");
  const us = [{ nome: "João Paulo", email: "jp@x.com" }, { nome: "Ana", email: "ana@clinica.com" }];
  assert.deepEqual(CFG.filtrarUsuarios(us, "joao").map(u => u.nome), ["João Paulo"]);
  assert.deepEqual(CFG.filtrarUsuarios(us, "CLINICA").map(u => u.nome), ["Ana"]);
  assert.equal(CFG.filtrarUsuarios(us, " ").length, 2);
});

test("AS-123 / AS-128 / AS-127 / AS-124: frases do teste da Meta, explicação de cada situação do CodeWords e campos secretos fora do gerenciador de senhas", () => {
  assert.equal(CV.fraseTesteMeta({ app_inscrito: true }), "O número respondeu. O app está inscrito.");
  assert.equal(CV.fraseTesteMeta({ numero: "+55 12 99999-0000", app_inscrito: false }), "O número +55 12 99999-0000 respondeu. O app não está inscrito: as mensagens não chegam. Use «Inscrever o app».");
  assert.doesNotMatch(CV.fraseTesteMeta(null), /✓|✗|\s{2}/);
  for (const rot of ["Conectado", "Aguardando confirmação", "Conectado mas sem receber", "Desconectado"]) assert.ok(CV.explicacaoSituacaoCodeWords(rot).length > 10, rot);
  assert.equal(CV.explicacaoSituacaoCodeWords("Conectado"), "O aparelho e o destino foram conferidos.");
  assert.match(CV.explicacaoSituacaoCodeWords("Sem confirmação"), /Ainda não sabemos/);
  assert.doesNotMatch(CV.explicacaoSituacaoCodeWords("Sem confirmação"), /conferidos/);
  const src = ler("web/app/cv-config.js");
  assert.doesNotMatch(src, /new-password/);
  assert.equal((src.match(/semGerenciadorDeSenha\(ui\.campo\(\{ rotulo: "(Chave da API CodeWords|Token permanente|App secret \(opcional\))"/g) || []).length, 3);
  assert.doesNotMatch(src, /App inscrito \$\{r && r\.app_inscrito \? "✓" : "✗"\}/);
  // AS-124: testar e inscrever recarregam a lista suave (sem esqueleto, sem perder a rolagem)
  assert.match(src, /async function testar\(c, botao\) \{[\s\S]*?carregar\(\{ suave: true \}\);[^\n]*\n  \}/);
  assert.match(src, /async function inscrever\(c, botao\) \{[\s\S]*?carregar\(\{ suave: true \}\);[^\n]*\n  \}/);
  const d = comDom();
  try {
    const el = d.doc.createElement("div"); const inp = d.doc.createElement("input"); el.appendChild(inp);
    assert.equal(CV.semGerenciadorDeSenha(el), el);
    assert.equal(inp.getAttribute("autocomplete"), "off");
    assert.equal(inp.getAttribute("data-lpignore"), "true");
    assert.ok(inp.hasAttribute("data-1p-ignore"));
  } finally { d.fim(); }
});

/* ================================================================== (b2) lista das Automações */

test("AS-007 + AS-013 + AS-022: no limite, exemplos apagados com a frase do limite; «Usar receita» diz o porquê; a pílula avisa que desligadas contam", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista({ limite: { usadas: 4, limite: 4 } })) });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    assert.ok(raiz.querySelectorAll(".au-chip-ex").length >= 3);
    assert.ok(raiz.querySelectorAll(".au-chip-ex").every(b => b.disabled), "exemplos não enchem a caixa sem poder pedir");
    // plano 1000b: UB-047 — um aviso só (o do topo, #au-limite); a caixa da IA e as receitas apontam para ele
    assert.match(textoDe(raiz.querySelector("#au-limite")), /limite de 4 automações \(desligadas também contam\)/);
    assert.equal(raiz.querySelector(".au-ia-limite"), null);
    assert.match(raiz.querySelector(".au-ia-txt").getAttribute("aria-describedby"), / au-limite$/);
    const usar = raiz.querySelectorAll(".au-modelo-rod button").filter(b => b.textContent === "Usar receita");
    assert.ok(usar.length && usar.every(b => b.disabled && /permite até 4 automações/.test(b.getAttribute("title") || b.title) && b.getAttribute("aria-describedby") === "au-limite"));
    const aviso = raiz.querySelector("#au-limite");
    assert.equal(aviso.querySelector("a").getAttribute("href"), "#/config/plano");
    const pil = raiz.querySelector(".au-uso");
    assert.match(pil.getAttribute("title") || pil.title, /Desligadas também contam no plano/);
    A.desmontar();
    // fora do limite: exemplos acesos, sem a frase
    d.doc.body.removeChild(raiz);
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t2.ctx); await tique();
    assert.ok(t2.ctx.alvo.querySelectorAll(".au-chip-ex").every(b => !b.disabled));
    assert.equal(t2.ctx.alvo.querySelector(".au-ia-limite"), null);
    assert.equal(t2.ctx.alvo.querySelector("#au-limite"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-014 + AS-018 + AS-020: os números do topo dizem o período; o subtítulo segue os números da empresa; «WhatsApp» não é verde", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Oficial", provedor: "meta" }] };
    const t = ctxAuto(ui, { rpc: rpcLista(dados) });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    const resumo = raiz.querySelector(".au-resumo");
    const ajudas = [textoDe(resumo), ...resumo.querySelectorAll("[data-dica], [aria-label], [title]").map(e => `${e.getAttribute("data-dica") || ""} ${e.getAttribute("aria-label") || ""} ${e.getAttribute("title") || ""}`)].join(" ");
    assert.match(ajudas, /rodaram desde a criação de cada uma/);
    const sub = textoDe(raiz.querySelector(".au-cab .sub"));
    assert.match(sub, /pelo número oficial/);   // plano 2000d · DU-025
    assert.doesNotMatch(sub, /CodeWords/);
    const pil = cartao(raiz, "a3").querySelectorAll(".pilula").find(p => /WhatsApp/.test(p.textContent));
    assert.ok(pil);
    assert.ok(!pil.classList.contains("pilula-ok"), "etiqueta de tipo não usa o verde de estado");
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-015: com muitas automações, busca por nome (sem acento) e ordem «Com erro primeiro» lembrada no aparelho", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    for (let i = 5; i <= 10; i++) dados.itens.push({ id: `a${i}`, nome: i === 7 ? "Lembrete de revisão" : `Regra ${i}`, gatilho: "negocio_estagio", ativo: false,
      execucoes: i, erros: i === 9 ? 4 : 0, condicoes: [], config: { estagio_id: U(11) }, acoes: [{ tipo: "criar_tarefa", titulo: "x", dono: "responsavel" }] });
    const t = ctxAuto(ui, { rpc: rpcLista(dados) });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    const busca = raiz.querySelector(".au-lista-busca-inp");
    assert.ok(busca, "10 automações: a busca aparece");
    digitar(d, busca, "LEMBRETE"); await esperar(220);
    assert.deepEqual(raiz.querySelectorAll(".au-item").map(li => li.dataset.id), ["a1", "a7"]);
    digitar(d, busca, "zzz"); await esperar(220);
    assert.match(textoDe(raiz.querySelector(".au-lista-vazio")), /Nenhuma automação com «zzz» no nome/);
    digitar(d, busca, ""); await esperar(220);
    const sel = raiz.querySelector(".au-lista-ordem");
    sel.value = "erros"; sel.dispatchEvent(new d.Evento("change"));
    assert.equal(raiz.querySelectorAll(".au-item")[0].dataset.id, "a9");
    assert.equal(localStorage.getItem("nx-au-ordem:cli-1|conta-1"), "erros");
    A.desmontar();
    d.doc.body.removeChild(raiz);
    const t2 = ctxAuto(ui, { rpc: rpcLista(dados) });
    await A.montar(t2.ctx); await tique();
    assert.equal(t2.ctx.alvo.querySelector(".au-lista-ordem").value, "erros", "a ordem volta");
    assert.equal(t2.ctx.alvo.querySelectorAll(".au-item")[0].dataset.id, "a9");
    A.desmontar();
    // poucas automações: sem as ferramentas
    d.doc.body.removeChild(t2.ctx.alvo);
    const t3 = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t3.ctx); await tique();
    assert.equal(t3.ctx.alvo.querySelector(".au-lista-busca-inp"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-017: «Do sistema» recolhível (fechado no celular) e com o atalho para onde cada regra se ajusta", async () => {
  const d = comDom();
  const mm = globalThis.matchMedia;
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const sistema = [{ nome: "Fora do horário responde sozinho", descricao: "…" }, { nome: "Rodízio do departamento", descricao: "…" }, { nome: "Anúncio marca a origem", descricao: "…" }];
    globalThis.matchMedia = q => ({ matches: /max-width: 760px/.test(q), addEventListener() {}, removeEventListener() {} });
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista({ sistema })) });
    await A.montar(t.ctx); await tique();
    const det = t.ctx.alvo.querySelector(".au-sis-det");
    assert.ok(det && det.localName === "details");
    assert.equal(!!(det.open || det.hasAttribute("open")), false, "no celular nasce recolhida");
    // plano 1000b: UB-046 — o título «Do sistema» saiu do summary (fica no cabeçalho da seção); o summary diz «Ver as 3 regras»
    assert.match(textoDe(det.parentNode.querySelector(".au-sec-cab")), /Do sistema.*3 regras prontas/);
    assert.equal(textoDe(det.querySelector("summary")), "Ver as 3 regras");
    const links = det.querySelectorAll(".au-sis-link").map(a => a.getAttribute("href"));
    assert.deepEqual(links, ["#/config/departamentos", "#/config/usuarios"]);
    A.desmontar();
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    d.doc.body.removeChild(t.ctx.alvo);
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista({ sistema })) });
    await A.montar(t2.ctx); await tique();
    const det2 = t2.ctx.alvo.querySelector(".au-sis-det");
    assert.equal(!!(det2.open || det2.hasAttribute("open")), true, "no computador, aberta");
    A.desmontar();
  } finally { if (mm === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = mm; d.fim(); }
});

test("AS-071 + AS-072 + AS-073 Criar com IA: dado pessoal pergunta antes; o pedido vira chip «recente»; «Parar de esperar» libera a caixa", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    let resposta = false;
    const chamadas = [];
    const pendentes = [];
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista()), confirmar: async () => resposta,
      fn: (nome, corpo, opc) => { chamadas.push([nome, corpo, opc]); return new Promise(r => pendentes.push(r)); } });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".au-ia-ajuda")), /Não cole nomes, telefones, CPF ou dados de saúde/);
    const area = raiz.querySelector(".au-ia-txt");
    digitar(d, area, "Mande lembrete para a Maria no (12) 99830-3030 um dia antes");
    raiz.querySelector(".au-ia-bt").dispatchEvent(new d.Evento("click")); await tique(4);
    assert.match(t.confirmacoes[0].titulo, /dados pessoais para a IA/);
    assert.match(t.confirmacoes[0].texto, /telefone \(«\(12\) 99830-3030»\)/);
    assert.equal(chamadas.length, 0, "Cancelar não manda");
    // pedido limpo: vai; a espera tem «Parar de esperar»
    digitar(d, area, "Quando o orçamento ficar parado 3 dias, crie uma tarefa");
    raiz.querySelector(".au-ia-bt").dispatchEvent(new d.Evento("click")); await tique(4);
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0][2] && "sinal" in chamadas[0][2], "o sinal vai junto (para o api.js cancelar a rede quando aceitar)");
    assert.equal(area.readOnly, true);
    const parar = raiz.querySelector(".au-ia-parar");
    assert.ok(parar);
    parar.dispatchEvent(new d.Evento("click")); await tique(6);
    assert.equal(area.readOnly, false, "a caixa volta");
    assert.match(textoDe(raiz.querySelector(".au-ia-desistiu")), /pode ter gastado 1 uso da IA/);
    assert.equal(raiz.querySelector(".au-ia-bt").disabled, false);
    pendentes[0]({ automacao: { nome: "Tarde demais" } }); await tique(4);
    assert.doesNotMatch(textoDe(raiz), /Tarde demais/, "a resposta que chega depois é ignorada");
    // plano 1500c: UCA-102 — «Parar de esperar» (a IA não montou) não vira «recente»: só o pedido que a IA montou fica guardado
    assert.equal(localStorage.getItem("nx-au-ia-recentes:cli-1|conta-1"), null);
    // UCA-101: o recente guarda {texto, em}; semeado aqui para o resto do teste (o chip na próxima abertura)
    localStorage.setItem("nx-au-ia-recentes:cli-1|conta-1", JSON.stringify([{ texto: "Quando o orçamento ficar parado 3 dias, crie uma tarefa", em: Date.now() }]));
    A.desmontar();
    d.doc.body.removeChild(raiz);
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "ia-texto"));
    const t2 = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t2.ctx); await tique();
    const chip = t2.ctx.alvo.querySelector(".au-chip-rec");
    assert.equal(textoDe(chip), "Quando o orçamento ficar parado 3 dias, crie uma tarefa");
    chip.dispatchEvent(new d.Evento("click"));
    assert.equal(t2.ctx.alvo.querySelector(".au-ia-txt").value, "Quando o orçamento ficar parado 3 dias, crie uma tarefa");
    A.desmontar();
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "ia-texto"));
  } finally { d.fim(); }
});

test("AS-075 + AS-076 receitas: as outras que mandam mensagem mostram a bolha a pedido; receita com IA diz o custo por execução", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista()) });
    await A.montar(t.ctx); await tique();
    const raiz = t.ctx.alvo;
    const cards = raiz.querySelectorAll(".au-modelo");
    const comBotao = cards.filter(c => c.querySelector(".au-modelo-ver"));
    assert.ok(comBotao.length >= 2, "várias receitas com mensagem ganham «Ver mensagem»");
    const c3 = comBotao[1];
    const fig = c3.querySelector(".au-modelo-previa");
    assert.equal(fig.hidden, true);
    const bt = c3.querySelector(".au-modelo-ver");
    bt.dispatchEvent(new d.Evento("click"));
    assert.equal(fig.hidden, false);
    assert.equal(bt.getAttribute("aria-expanded"), "true");
    assert.ok(textoDe(fig.querySelector(".au-bolha")).length > 5);
    assert.doesNotMatch(textoDe(fig), /\bnull\b|undefined/);
    const ia = cards.find(c => c.querySelector(".au-modelo-custo"));
    assert.ok(ia, "receita com IA mostra o custo");
    assert.equal(textoDe(ia.querySelector(".au-modelo-custo")), "Cada vez que roda, usa 1 da cota de IA do mês (2 de 300 já usadas).");
    A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (c2) editor */

const titulo = el => (el ? el.getAttribute("title") || el.title || "" : "");
const clicar = (d, el) => el.dispatchEvent(new d.Evento("click"));
const botaoTexto = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent));

test("AS-023 + AS-052 + AS-049: nome repetido avisa; sem nome há sugestão («Usar sugestão»); «Duplicar» diz que copia o que está na tela", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["nova"] });
    const nome = e.raiz.querySelector(".au-nome-inp");
    const aviso = e.raiz.querySelector(".au-nome-aviso");
    assert.equal(aviso.hidden, true);
    digitar(d, nome, "aviso de mensagem");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /Já existe uma automação chamada «Aviso de mensagem»/);
    assert.equal(nome.getAttribute("aria-describedby"), aviso.id);
    digitar(d, nome, "");
    const selEtapa = e.raiz.querySelector("[data-cfg=estagio_id] select");
    selEtapa.value = U(12); selEtapa.dispatchEvent(new d.Evento("change"));
    const sug = e.raiz.querySelector(".au-nome-sug");
    assert.equal(sug.hidden, false);
    assert.match(sug.textContent, /^Usar sugestão: «Etapa Avaliação agendada»$/);
    assert.equal(nome.placeholder, "Ex.: Etapa Avaliação agendada");
    clicar(d, sug);
    assert.equal(nome.value, "Etapa Avaliação agendada");
    assert.equal(sug.hidden, true);
    e.A.desmontar();
    d.doc.body.removeChild(e.raiz);
    const e2 = await abrirEditor(d, { partes: ["a2"] });
    const dup = e2.raiz.querySelectorAll(".au-ed-acoes button").find(b => /Duplicar/.test(b.textContent));
    assert.equal(dup.textContent.trim(), "Duplicar");
    digitar(d, e2.raiz.querySelector(".au-nome-inp"), "Tarefa de orçamento 2");
    assert.equal(dup.textContent.trim(), "Duplicar como está na tela");
    clicar(d, e2.raiz.querySelector(".au-ed-mais"));
    assert.ok(e2.menus.at(-1).some(i => i.rotulo === "Duplicar como está na tela"));
    e2.A.desmontar();
  } finally { d.fim(); }
});

test("AS-030 + AS-063 + AS-067: «Pronta» conforme o gatilho; qual horário vale; passo depois de «Parar» com aviso escrito", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, departamentos: [{ id: U(51), nome: "Recepção", padrao: true }] };
    dados.itens.push({ id: "t1", nome: "Sem resposta", gatilho: "sem_resposta", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { minutos: 240 },
      acoes: [{ tipo: "parar" }, { tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }] });
    const e = await abrirEditor(d, { partes: ["t1"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-estado")), /quando o tempo escolhido passar|Falta/);
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-estado")), /começa a rodar em até 15 segundos/);
    assert.equal(textoDe(e.raiz.querySelector(".au-horario-qual")), "Vale o horário do departamento da conversa; sem conversa (gatilhos do CRM), o do departamento padrão («Recepção»).");
    const passos = e.raiz.querySelectorAll(".au-passo");
    assert.equal(passos[0].querySelector(".au-passo-nunca"), null);
    const nunca = passos[1].querySelector(".au-passo-nunca");
    assert.match(textoDe(nunca), /nunca roda porque vem depois de «Parar»/);
    assert.equal(passos[1].querySelector(".au-acao").getAttribute("aria-describedby"), nunca.id);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-039: «sem resposta há» aceita horas — 240 min aparece como 4 horas e 2 horas grava 120", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "t2", nome: "Sem resposta", gatilho: "sem_resposta", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { minutos: 240 },
      acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }] });
    const salvos = [];
    const e = await abrirEditor(d, { partes: ["t2"], dados, rpcExtra: { nx_automacao_salvar: p => { salvos.push(p.p_auto); return { ...p.p_auto, id: "t2" }; } } });
    const campo = e.raiz.querySelector(".au-campo-min");
    assert.ok(campo, "o campo de minutos virou minutos/horas");
    assert.equal(String(campo.querySelector("input").value), "4");
    assert.equal(campo.querySelectorAll("option").find(o => o.selected || o.hasAttribute("selected")).value, "horas", "240 min aparece como 4 horas");
    campo.querySelector("select").value = "horas";        // o DOM de mentira não deriva o value da <option selected>
    digitar(d, campo.querySelector("input"), "2");
    assert.match(textoDe(campo.querySelector(".au-hr-resumo")), /= 2 h/);   // plano 1500c: UCA-039 — resumo legível (antes «= 120 minutos»)
    clicar(d, e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar")); await tique(10);
    assert.equal(salvos[0].config.minutos, 120);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-042 + AS-043: a paleta tem «Buscar passo» (foco nele ao abrir) e, depois de adicionar, «Outro passo» reabre a paleta ali", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["nova"] });
    const bloco = e.raiz.querySelector("[data-onde=entao]");
    clicar(d, bloco.querySelector(".au-mais"));
    const busca = bloco.querySelector(".au-paleta-busca-inp");
    assert.equal(d.doc.activeElement, busca, "o foco cai na busca");
    digitar(d, busca, "etiq");
    const vis = bloco.querySelectorAll(".au-tile").filter(t => !t.hidden);
    assert.ok(vis.length >= 2 && vis.every(t => /etiqu/.test(t.dataset.acao)), vis.map(t => t.dataset.acao).join(","));
    assert.ok(bloco.querySelectorAll(".au-paleta-grupo").some(g => g.hidden), "grupos sem nada somem");
    digitar(d, busca, "xyzw");
    assert.equal(bloco.querySelector(".au-paleta-vazio").hidden, false);
    digitar(d, busca, "tarefa");
    clicar(d, bloco.querySelectorAll(".au-tile").find(t => !t.hidden));
    const outro = e.raiz.querySelector(".au-passo .au-outro-passo");
    assert.ok(outro, "«Outro passo» logo abaixo do passo novo");
    clicar(d, outro);
    assert.equal(e.raiz.querySelector("[data-onde=entao] .au-paleta").hidden, false);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-045 + AS-046 + AS-062: «Testar» do topo gira no próprio botão (e ocupa o da lateral); no celular abre numa gaveta; só o gatilho já dá para testar", async () => {
  const d = comDom();
  const mm = globalThis.matchMedia;
  try {
    let soltar;
    const e = await abrirEditor(d, { partes: ["a2"], rpcExtra: { nx_auto_simular: () => new Promise(r => { soltar = r; }) } });
    const topo = e.raiz.querySelectorAll(".au-ed-acoes button").find(b => /^Testar$/.test(b.textContent.trim()));
    const lado = botaoTexto(e.raiz, /Testar agora/);
    clicar(d, topo); await tique(2);
    assert.equal(topo.getAttribute("aria-busy"), "true", "o giro é no botão clicado");
    assert.equal(lado.getAttribute("aria-busy"), "true");
    soltar({ alvos: [], total: 0 }); await tique(6);
    assert.equal(topo.getAttribute("aria-busy"), null);
    assert.equal(lado.getAttribute("aria-busy"), null);
    e.A.desmontar();
    d.doc.body.removeChild(e.raiz);
    // celular: gaveta
    globalThis.matchMedia = q => ({ matches: /max-width: 1080px/.test(q), addEventListener() {}, removeEventListener() {} });
    const gavetas = [];
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const sim = [];
    const t = ctxAuto(ui, { partes: ["nova"], rpc: async (n, p) => { if (n === "nx_auto_simular") { sim.push(p); return { alvos: [], total: 0 }; } return rpcLista(dadosLista())(n, p); } });
    t.ctx.ui.gaveta = o => { gavetas.push(o); return { fechar() {} }; };
    await A.montar(t.ctx); await tique(4);
    const sel = t.ctx.alvo.querySelector("[data-cfg=estagio_id] select");
    sel.value = U(12); sel.dispatchEvent(new d.Evento("change"));
    clicar(d, t.ctx.alvo.querySelector(".au-ed-mais"));
    t.menus.at(-1).find(i => /^Testar/.test(i.rotulo)).fn(); await tique(8);
    assert.equal(gavetas.length, 1);
    assert.equal(gavetas[0].titulo, "Teste da automação");
    assert.equal(sim.length, 1, "sem nome e sem passos: o gatilho sozinho foi testado");
    assert.match(textoDe(gavetas[0].corpo), /Ainda sem passos: o teste mostra só quem o gatilho pegaria/);
    assert.equal(textoDe(t.ctx.alvo.querySelector(".au-sim")), "", "o cartão da lateral não foi usado");
    A.desmontar();
  } finally { if (mm === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = mm; d.fim(); }
});

test("AS-047 + AS-051: Ctrl/⌘+S salva sem sair; «Salvar e continuar» fica no editor, põe o id no endereço e o 2º salvar atualiza a mesma", async () => {
  const d = comDom();
  const trocas = [];
  const hist = globalThis.history;
  globalThis.history = { state: null, replaceState: (s, t, u) => trocas.push(u) };
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const atalhos = [];
    const salvos = [];
    const t = ctxAuto(ui, { partes: ["nova"], query: { modelo: "orcamento" },
      rpc: async (n, p) => { if (n === "nx_automacao_salvar") { salvos.push(p.p_auto); return { ...p.p_auto, id: "n9" }; } return rpcLista(dadosLista())(n, p); } });
    t.ctx.ui.atalho = (comb, fn) => { const reg = { comb, fn, ativo: true }; atalhos.push(reg); return () => { reg.ativo = false; }; };
    await A.montar(t.ctx); await tique(4);
    const raiz = t.ctx.alvo;
    if (!raiz.querySelector(".au-nome-inp").value) digitar(d, raiz.querySelector(".au-nome-inp"), "Orçamento parado");
    clicar(d, raiz.querySelector(".au-salvar-seguir")); await tique(10); await esperar(650);   // o ✓ do botão segura o 2º salvar por 500 ms
    assert.equal(salvos.length, 1);
    assert.equal(salvos[0].id, undefined, "a 1ª gravação cria");
    assert.deepEqual(t.navegou, [], "fica no editor");
    assert.equal(trocas.at(-1), "#/automacoes/n9");
    const s = atalhos.find(a => a.comb === "mod+s");
    assert.ok(s && s.ativo);
    let impedido = false;
    s.fn({ preventDefault() { impedido = true; } }); await tique(10); await esperar(650);
    assert.ok(impedido, "o «Salvar página» do navegador não abre");
    assert.equal(salvos.length, 2);
    assert.equal(salvos[1].id, "n9", "o 2º salvar atualiza a mesma automação");
    assert.deepEqual(t.navegou, ["#/automacoes"], "o atalho é o «Salvar» normal (volta para a lista)");
    A.desmontar();
    assert.equal(s.ativo, false, "o atalho sai junto com a tela");
  } finally { if (hist === undefined) delete globalThis.history; else globalThis.history = hist; d.fim(); }
});

test("AS-050: receita aberta e não mexida volta sem perguntar; mexida, pergunta", async () => {
  const d = comDom();
  try {
    const e = await abrirEditor(d, { partes: ["nova"], query: { modelo: "orcamento" }, confirmar: async () => false });
    clicar(d, e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Cancelar")); await tique(4);
    assert.equal(e.confirmacoes.length, 0);
    assert.deepEqual(e.navegou, ["#/automacoes"]);
    e.A.desmontar();
    d.doc.body.removeChild(e.raiz);
    const e2 = await abrirEditor(d, { partes: ["nova"], query: { modelo: "orcamento" }, confirmar: async () => false });
    digitar(d, e2.raiz.querySelector(".au-nome-inp"), "Outro nome");
    clicar(d, e2.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Cancelar")); await tique(4);
    assert.match(e2.confirmacoes[0].titulo, /Descartar esta automação\?/);
    assert.deepEqual(e2.navegou, []);
    e2.A.desmontar();
  } finally { d.fim(); }
});

test("AS-048 + AS-056 + AS-060 + AS-061 execuções: a aba vai para o endereço; recarrega sozinha pelo pulso; avisa o teto de 200; detalhes sem chave técnica", async () => {
  const d = comDom();
  const trocas = [];
  const hist = globalThis.history;
  globalThis.history = { state: null, replaceState: (s, t, u) => trocas.push(u) };
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const pedidos = [];
    const exec = n => Array.from({ length: n }, (_, i) => ({ criado_em: new Date(Date.now() - i * 60000).toISOString(), ok: true, detalhe: "Ação 1 (criar tarefa): ok.",
      chave: `te:${i}:2026-10-02`, link: "#/crm/negocio/7", estado: "ok", passo: 1, total_passos: 1 }));
    let pulso = null;
    const t = ctxAuto(ui, { partes: ["a2"], rpc: async (n, p) => {
      if (n === "nx_automacao_execucoes") { pedidos.push(p.p_limite); return exec(p.p_limite); }
      if (n === "nx_automacao_execucoes_dia") return null;
      return rpcLista(dadosLista())(n, p);
    } });
    t.ctx.pulso = { assinar: f => { pulso = f; return () => { pulso = null; }; } };
    await A.montar(t.ctx); await tique(4);
    const raiz = t.ctx.alvo;
    const abas = raiz.querySelectorAll(".au-abas [role=tab]");
    clicar(d, abas[1]); await tique(8);
    assert.equal(trocas.at(-1), "#/automacoes/a2?aba=execucoes");
    // detalhes: o link do registro em palavras, sem a chave técnica (conta comum)
    const det = raiz.querySelector(".au-ex-mais");
    assert.doesNotMatch(textoDe(det), /te:0:2026/);
    assert.doesNotMatch(textoDe(det), /Detalhe técnico/);
    assert.ok(det.querySelector("a[href='#/crm/negocio/7']"));
    // pulso: antes de 20 s nada; depois, recarrega sem esqueleto
    const antes = pedidos.length;
    await pulso(); await tique(4);
    assert.equal(pedidos.length, antes);
    const agora = Date.now; Date.now = () => agora() + 21000;
    try { d.doc.activeElement = d.doc.body; await pulso(); await tique(8); } finally { Date.now = agora; }
    assert.equal(pedidos.length, antes + 1, "recarregou sozinha");
    // carregar mais até o teto: a frase aparece
    const painelEx = () => raiz.querySelectorAll(".au-painel")[1];
    for (let i = 0; i < 3; i++) { clicar(d, painelEx().querySelector(".au-mais")); await tique(8); }
    assert.equal(pedidos.at(-1), 200);
    assert.equal(painelEx().querySelector(".au-mais"), null);
    assert.match(textoDe(raiz.querySelector(".au-ex-teto")), /Mostrando as 200 execuções mais recentes/);
    clicar(d, abas[0]);
    assert.equal(trocas.at(-1), "#/automacoes/a2");
    A.desmontar();
    // conta da equipe: o detalhe técnico aparece
    d.doc.body.removeChild(raiz);
    const t2 = ctxAuto(ui, { partes: ["a2"], query: { aba: "execucoes" }, rpc: async (n, p) => (n === "nx_automacao_execucoes" ? exec(2) : n === "nx_automacao_execucoes_dia" ? null : rpcLista(dadosLista())(n, p)) });
    t2.ctx.sessao = { conta: { id: "conta-1", nome: "Equipe", super: true } };
    await A.montar(t2.ctx); await tique(10);
    assert.match(textoDe(t2.ctx.alvo.querySelector(".au-ex-mais")), /Detalhe técnico · chave.*te:0:2026-10-02/);
    A.desmontar();
  } finally { if (hist === undefined) delete globalThis.history; else globalThis.history = hist; d.fim(); }
});

test("AS-053 + AS-054 modelo da Meta: de outro número avisa (sai por lá e abre outra conversa); «Sincronizar agora» recarrega os modelos sem sair", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    const tpl = (id, canal, status = "APPROVED") => ({ id, canal_id: canal, nome: `conf_${id}`, idioma: "pt_BR", categoria: "UTILITY", status, num_parametros: 0, corpo: "Oi!" });
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Recepção" }, { id: U(62), nome: "Comercial" }], templates: [tpl("t1", U(61)), tpl("t2", U(62))] };
    dados.itens.push({ id: "m1", nome: "Modelo", gatilho: "conversa_nova", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { canal_id: U(62) },
      acoes: [{ tipo: "enviar_template", template_id: "t1", parametros: [] }] });
    const fns = [];
    let listagens = 0;
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const t = ctxAuto(ui, { partes: ["m1"], fn: async (n, c) => { fns.push(c); return { total: 3 }; },
      rpc: async (n, p) => { if (n === "nx_automacoes_listar") { listagens++; if (listagens > 1) return { ...dados, base: { ...dados.base, templates: [...dados.base.templates, tpl("t3", U(62))] } }; return dados; } return rpcLista(dados)(n, p); } });
    await A.montar(t.ctx); await tique(4);
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".au-tpl-canal")), /do número «Recepção», mas o gatilho é do número «Comercial»: a mensagem sai pelo «Recepção» e abre outra conversa lá/);
    const opcoes = raiz.querySelectorAll(".au-passo-enviar_template option").map(o => o.textContent);
    assert.ok(opcoes.some(o => /conf_t1.*de outro número/.test(o)));
    clicar(d, raiz.querySelector(".au-tpl-sincronizar")); await tique(12);
    assert.deepEqual(fns.map(c => [c.acao, c.canal]), [["sincronizar_templates", U(61)], ["sincronizar_templates", U(62)]]);
    assert.equal(listagens, 2);
    assert.ok(raiz.querySelectorAll(".au-passo-enviar_template option").some(o => /conf_t3/.test(o.textContent)), "o modelo novo aparece sem sair do editor");
    assert.match(t.toasts.at(-1)[0], /Modelos sincronizados: 3 aprovados/);
    A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (d2) Configurações */

test("AS-080 + AS-083: trocar de seção reaproveita o menu e o checklist (1 chamada em 60 s); «Buscar ajuste» filtra e as seções entram na paleta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => (n === "nx_onboarding_estado" ? {} : n === "nx_usuarios_listar" ? usuariosFalsos() : {}) });
    const regs = [];
    t.ctx.comandos = { registrar: c => { regs.push(c); return () => { c.cancelado = true; }; } };
    t.ctx.cliente = { id: "cli-80", nome: "Clínica 80" };      // o checklist fica em memória por cliente (60 s): um cliente só deste teste
    await cfg.montar(t.ctx); await tique(6);
    const nav = t.ctx.alvo.querySelector("nav.cfg-lista");
    t.ctx.rota.partes = ["usuarios"];
    await cfg.montar(t.ctx); await tique(6);
    t.ctx.rota.partes = ["perfil"];
    await cfg.montar(t.ctx); await tique(6);
    assert.equal(t.ctx.alvo.querySelector("nav.cfg-lista"), nav, "o menu é o mesmo (não foi refeito)");
    assert.equal(t.chamadas.filter(c => c[0] === "nx_onboarding_estado").length, 1, "o checklist não é pedido de novo a cada seção");
    assert.equal(nav.querySelector("[aria-current=page]").getAttribute("href"), "#/config/perfil");
    assert.equal(t.ctx.alvo.querySelectorAll(".cfg-sec form").length >= 1, true, "a seção nova foi desenhada");
    // busca
    const busca = nav.querySelector(".cfg-busca-inp");
    digitar(d, busca, "horario");
    const vis = nav.querySelectorAll("a.cfg-nav-item").filter(a => !a.hidden).map(a => a.dataset.secao);
    assert.ok(vis.includes("departamentos"), vis.join(","));
    assert.ok(!vis.includes("perfil"));
    digitar(d, busca, "qwerty");
    assert.equal(nav.querySelector(".cfg-busca-vazio").hidden, false);
    digitar(d, busca, "");
    assert.ok(nav.querySelectorAll("a.cfg-nav-item").every(a => !a.hidden));
    // paleta
    const dep = regs.find(c => c.id === "config.departamentos");
    assert.ok(dep && /^Configurações: Departamentos/.test(dep.rotulo));
    dep.fazer();
    assert.equal(t.navegou.at(-1), "#/config/departamentos");
    cfg.desmontar();
    assert.ok(regs.every(c => c.cancelado), "sair das Configurações tira as seções da paleta");
  } finally { d.fim(); }
});

test("AS-085 + AS-090 + AS-091 Perfil: papel na empresa; avisos de mensagem nova com a mesma chave de Conversas; «Sair de todos» como perigo", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], confirmar: async () => false });
    t.ctx.cliente = { id: "cli-1", nome: "Clínica Teste", papel: "admin" };
    t.ctx.shell.clientes = () => [t.ctx.cliente, { id: "cli-2", nome: "Loja Y", papel: "leitura" }];
    localStorage.setItem("nx-cv-avisos", JSON.stringify({ texto: true }));
    await cfg.montar(t.ctx); await tique(6);
    const raiz = t.ctx.alvo;
    assert.equal(textoDe(raiz.querySelector(".cfg-papel")), "Você é Administrador na Clínica Teste.");
    assert.match(textoDe(raiz.querySelector(".cfg-papel-outras")), /Loja Y \(Somente leitura\)/);
    const som = raiz.querySelector("#cfg-av-som");
    assert.equal(som.checked, true, "som ligado por padrão (igual a Conversas)");
    som.checked = false; som.dispatchEvent(new d.Evento("change"));
    assert.deepEqual(JSON.parse(localStorage.getItem("nx-cv-avisos")), { texto: true, som: false }, "as outras preferências ficam");
    const tela = raiz.querySelector("#cfg-av-tela");
    assert.equal(tela.checked, false);
    globalThis.Notification = { permission: "denied" };
    tela.checked = true; tela.dispatchEvent(new d.Evento("change")); await tique(4);
    assert.equal(tela.checked, false, "o navegador bloqueou: volta a desligado");
    assert.match(textoDe(raiz.querySelector(".cfg-avisos-nota")), /bloqueou os avisos/);
    delete globalThis.Notification;
    botaoTexto(raiz, /Sair de todos os aparelhos/).dispatchEvent(new d.Evento("click")); await tique(4);
    assert.equal(t.confirmacoes.at(-1).perigo, true);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_sair_todas").length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-099 + AS-100 Usuários: convite com papel em pílula e departamentos; busca por nome/e-mail com muita gente", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const usuarios = Array.from({ length: 19 }, (_, i) => ({ conta_id: `p${i}`, nome: `Pessoa ${String(i).padStart(2, "0")}`, email: `p${i}@x.com`, papel: "atendente", editavel: false, departamentos: [] }));
    usuarios.push({ conta_id: "u1", nome: "Bruno Reis", email: "bruno@clinica.com", papel: "atendente", editavel: false, departamentos: [] });
    const dados = usuariosFalsos({ usuarios, limite: null, departamentos: [{ id: "d1", nome: "Recepção" }],
      convites: [{ id: "cv1", papel: "admin", nome: "Dra. Helena", departamentos: ["d1"], expira_em: new Date(Date.now() + 86400e3).toISOString() }] });
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => (n === "nx_usuarios_listar" ? dados : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const raiz = t.ctx.alvo;
    const conv = raiz.querySelector(".convite-item");
    assert.equal(textoDe(conv.querySelector(".cfg-conv-papel")), "Administrador");
    assert.match(textoDe(conv), /Departamentos: Recepção/);
    const busca = raiz.querySelector(".cfg-us-busca-inp");
    assert.ok(busca, "20 pessoas: busca");
    digitar(d, busca, "BRUNO"); await esperar(220);
    const tab = raiz.querySelector(".cfg-us-tab");
    assert.match(textoDe(tab), /Bruno Reis/);
    assert.doesNotMatch(textoDe(tab), /Pessoa 05/);
    digitar(d, busca, "clinica.com"); await esperar(220);
    assert.match(textoDe(raiz.querySelector(".cfg-us-tab")), /Bruno Reis/);
    cfg.desmontar();
  } finally { d.fim(); }
});

async function abrirMarcaOrg(d, { rpc = null, confirmar } = {}) {
  const ui = await uiReal();
  const cfg = await import("../web/app/config.js");
  const T = await import("../web/app/tema.js");
  const salvos = [];
  const t = ctxCfg(ui, { partes: ["marca"], conta: { id: "c1", papel: "gestor", super: false, nome: "Gestor" }, confirmar,
    rpc: rpc || (async (n, p) => { if (n === "nx_orgs_listar") return [{ id: "org-a", slug: "rev", marca: { produto: "Rev", cores: { fundo: "#07090C" } } }]; if (n === "nx_org_salvar") { salvos.push(p); return { marca: p.p_org.marca }; } return {}; }) });
  t.ctx.cliente = null;
  t.ctx.sessao.org = { id: "org-a", nome: "Revenda" };
  t.ctx.shell.prontos.CONFIG_PRONTAS.push("marca");
  Object.assign(t.ctx.shell, { tema: T, marcaOrg: () => ({}), pintarMarca() {}, aplicarMarcaCliente() {}, recarregarMarca: async () => {}, clientes: () => [] });
  t.ctx.paleta = T.PALETA || ["#C9A227", "#3B82F6"];
  await cfg.montar(t.ctx); await tique(10);
  return { ...t, cfg, T, salvos, raiz: t.ctx.alvo };
}

test("AS-104 + AS-108 + AS-109 Marca: «Salvar marca» só acende com mudança; placeholder curto; WhatsApp de suporte validado com a prévia do link", async () => {
  const d = comDom();
  try {
    const m = await abrirMarcaOrg(d);
    const bt = botaoTexto(m.raiz, /Salvar marca/);
    assert.ok(bt, "o editor abriu");
    // plano 1000b: UB-261 — aria-disabled no lugar de disabled (o Tab alcança o botão e o clique diz «Nada para salvar»)
    assert.equal(bt.getAttribute("aria-disabled"), "true", "sem mudança, nada a salvar");
    assert.equal(textoDe(m.raiz.querySelector(".marca-estado")), "Tudo salvo.");
    assert.equal(m.raiz.querySelector("[name=assinatura]").placeholder || m.raiz.querySelector("[name=assinatura]").getAttribute("placeholder"), "Equipe Sorriso");
    const wa = m.raiz.querySelector("[name=suporte_wa]");
    digitar(d, wa, "12345");
    assert.equal(bt.getAttribute("aria-disabled"), "false");
    const prev = m.raiz.querySelector(".cfg-wa-previa");
    assert.match(textoDe(prev), /Use 55 \+ DDD \+ número/);
    assert.ok(prev.classList.contains("campo-erro"));
    clicar(d, bt); await tique(6);
    assert.equal(m.salvos.length, 0, "número inválido não vai ao servidor");
    digitar(d, wa, "5512999998888");
    assert.equal(textoDe(prev), "O botão de suporte abre: wa.me/5512999998888");
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-105 + AS-110 + AS-112 Marca: «Gerar do logo» mostra carregando; arrastar uma imagem para a amostra usa o mesmo caminho do botão; prévia em claro/escuro", async () => {
  const d = comDom();
  const salvoImg = globalThis.Image;
  try {
    globalThis.Image = class { decode() { return new Promise(() => {}); } };
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const m = await abrirMarcaOrg(d, { rpc: async n => (n === "nx_orgs_listar" ? [{ id: "org-a", slug: "rev", marca: { produto: "Rev", logo, cores: { fundo: "#07090C" } } }] : {}) });
    const gerar = botaoTexto(m.raiz, /Gerar do logo/);
    clicar(d, gerar); await tique(2);
    assert.equal(gerar.getAttribute("aria-busy"), "true", "decodificando: o botão diz que está trabalhando");
    // soltar um GIF na amostra do logo: o mesmo processarImagem recusa o formato
    const amostra = m.raiz.querySelector(".logo-amostra");
    const ev = new d.Evento("drop", { dataTransfer: { types: ["Files"], files: [{ type: "image/gif", size: 10, name: "x.gif" }] } });
    amostra.dispatchEvent(ev); await tique(4);
    assert.equal(ev.defaultPrevented, true);
    const erro = amostra.parentNode.parentNode.querySelector(".campo-erro");
    assert.equal(erro.hidden, false);
    assert.match(erro.textContent, /PNG, JPEG ou WebP/);
    // claro/escuro
    const previa = m.raiz.querySelector(".previa");
    assert.equal(previa.dataset.esquema, "escuro");
    const claro = m.raiz.querySelectorAll(".cfg-esq-prev button").find(b => b.textContent === "Claro");
    clicar(d, claro);
    assert.equal(previa.dataset.esquema, "claro");
    assert.equal(claro.getAttribute("aria-pressed"), "true");
    assert.match(textoDe(m.raiz.querySelector(".marca-previa-env .pilula")), /Palco escuro · prévia no outro esquema/);
    assert.equal(botaoTexto(m.raiz, /Salvar marca/).getAttribute("aria-disabled"), "true", "ver no outro esquema não muda o que será salvo");   // plano 1000b: UB-261
    assert.match(ler("web/app/config.css"), /\.previa \.pv-kpi b \{ display: block; white-space: nowrap;/, "AS-107: «18,4 mil» não quebra");
    m.cfg.desmontar();
  } finally { if (salvoImg === undefined) delete globalThis.Image; else globalThis.Image = salvoImg; d.fim(); }
});

test("AS-115 + AS-116 + AS-117 Domínio e Plano: voltar a pendente pergunta; pendente diz a idade e oferece «Avisar a Nexus»; teste vencido não é «Em teste»", async () => {
  const d = comDom();
  const loc = globalThis.location;
  globalThis.location = { hostname: "orbita-nexus-ads.netlify.app", hash: "#/config/dominio" };
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const confirmacoes = [];
    let mudou = 0;
    const ctx = { ui: { ...ui, confirmar: async o => { confirmacoes.push(o); return false; } }, api: { mensagemErro: String },
      shell: { marcaEfetiva: () => ({ suporte_wa: "5512999998888" }) } };
    const ativo = cfg.cartaoDominio(ctx, { host: "crm.x.com.br", status: "ativo", ativado_em: "2026-10-01T10:00:00Z" }, { aoStatus: async () => { mudou++; } });
    clicar(d, botaoTexto(ativo, /Voltar a pendente/)); await tique(4);
    assert.match(confirmacoes[0].titulo, /Voltar crm\.x\.com\.br a pendente\?/);
    assert.equal(confirmacoes[0].perigo, true);
    assert.equal(mudou, 0, "Cancelar não mexe");
    const velho = new Date(Date.now() - 6 * 86400e3).toISOString();
    const pend = cfg.cartaoDominio(ctx, { host: "app.y.com.br", status: "pendente", criado_em: velho, dns: { valor: "orbita.netlify.app" } }, {});
    assert.match(textoDe(pend.querySelector(".dom-idade")), /Cadastrado .*passou de 1 dia útil/);
    const avisar = pend.querySelector(".dom-avisar");
    assert.ok(avisar && /wa\.me\/5512999998888/.test(avisar.getAttribute("href")));
    const novo = cfg.cartaoDominio(ctx, { host: "app.z.com.br", status: "pendente", criado_em: new Date().toISOString() }, {});
    assert.equal(novo.querySelector(".dom-avisar"), null, "dentro do prazo, sem cobrar a Nexus");
    // plano: teste vencido
    const t = ctxCfg(ui, { partes: ["plano"], rpc: async n => (n === "nx_uso_plano" ? { plano: { nome: "Essencial" }, status: "teste", teste_ate: "2026-01-01", uso: {}, limites: {}, modulos: [] } : {}) });
    t.ctx.shell.prontos.CONFIG_PRONTAS.push("plano");
    t.ctx.shell.marcaEfetiva = () => ({});
    await cfg.montar(t.ctx); await tique(8);
    const pilulas = t.ctx.alvo.querySelectorAll(".plano-lado .pilula").map(p => textoDe(p));
    assert.ok(pilulas.includes("Teste encerrado"), pilulas.join(" | "));
    assert.ok(!pilulas.includes("Em teste"));
    cfg.desmontar();
  } finally { if (loc === undefined) delete globalThis.location; else globalThis.location = loc; d.fim(); }
});

/* ================================================================== lote auto-3 — (a) lógica pura */

test("AS-145 (front) departamentos salvam a faixa que passa da meia-noite: validarHorario com meiaNoite nas duas chamadas", () => {
  const src = ler("web/app/cv-config.js");
  assert.equal((src.match(/L\.validarHorario\((g|lerGrade\(\)), \{ meiaNoite: true \}\)/g) || []).length, 2);
  assert.doesNotMatch(src, /L\.validarHorario\((g|lerGrade\(\))\)/);
});

test("AS-131 / AS-285 / AS-286 / AS-137 Números: rótulo do reconferir, qualidade da Meta em palavras, modelos por situação e impacto de excluir", () => {
  assert.equal(CV.rotuloReconferindo(2, 4), "Reconferindo 2 de 4…");
  assert.equal(CV.rotuloReconferindo(1, 1), "Reconferindo…");
  assert.deepEqual([CV.qualidadeMeta("GREEN").rotulo, CV.qualidadeMeta("yellow").tom, CV.qualidadeMeta("RED").rotulo], ["Boa", "aten", "Baixa"]);
  assert.match(CV.qualidadeMeta("YELLOW").explicacao, /bloquearam ou denunciaram/);
  assert.equal(CV.qualidadeMeta(null), null);
  const tpl = [{ canal_id: "m1", status: "APPROVED" }, { canal_id: "m1", status: "APPROVED" }, { canal_id: "m1", status: "PENDING" }, { canal_id: "m1", status: "REJECTED" }, { canal_id: "x", status: "APPROVED" }];
  assert.deepEqual(CV.resumoModelos(tpl, "m1").map(m => m.rotulo), ["2 aprovados", "1 em análise", "1 recusado ou pausado"]);
  assert.deepEqual(CV.resumoModelos([], "m1"), []);
  assert.match(CV.impactoExcluirNumero({ abertas: 3, automacoes: ["Lembrete"] }), /^3 conversas abertas ficam sem canal.*A automação «Lembrete» depende dele e para de disparar\.$/);
  assert.match(CV.impactoExcluirNumero({ abertas: 50, maisDe: true }), /^Mais de 50 conversas abertas/);
  assert.equal(CV.impactoExcluirNumero({ abertas: 0 }), "Nenhuma conversa aberta usa este número agora.");
  assert.equal(CV.impactoExcluirNumero({}), "", "sem os dados, a frase some (a exclusão continua possível)");
});

test("AS-141 / AS-142 / AS-143 / AS-240 Respostas: ordem por usos, atalho repetido, rótulo falado das variáveis e exportar/importar", () => {
  const rs = [{ id: "r1", atalho: "ola", titulo: "Olá", corpo: "Oi", usos: 2 }, { id: "r2", atalho: "end", titulo: "Endereço", corpo: "Rua X", usos: 9 }, { id: "r3", atalho: "pix", titulo: "Pix", corpo: "chave", usos: null }];
  assert.deepEqual(CV.ordenarRespostas(rs).map(r => r.atalho), ["end", "ola", "pix"]);
  assert.equal(CV.atalhoRepetido(rs, "/OLA").id, "r1");
  assert.equal(CV.atalhoRepetido(rs, "ola", "r1"), null, "a própria resposta em edição não conta");
  assert.equal(CV.rotuloVariavel("primeiro_nome"), "Inserir primeiro nome");
  assert.equal(CV.rotuloVariavel("empresa"), "Inserir nome da empresa");
  const arq = CV.exportarRespostas(rs);
  assert.equal(arq.tipo, "orbita-respostas");
  assert.deepEqual(Object.keys(arq.respostas[0]).sort(), ["atalho", "ativo", "corpo", "titulo"], "sem id, usos nem departamento");
  const lido = CV.lerImportacaoRespostas(JSON.stringify({ respostas: [...arq.respostas, { atalho: "novo", titulo: "Novo", corpo: "Texto" }, { atalho: "Com espaço", titulo: "x", corpo: "y" }] }), [rs[0]]);
  assert.deepEqual(lido.novas.map(r => r.atalho), ["end", "pix", "novo"]);
  assert.deepEqual(lido.repetidas, ["ola"]);
  assert.equal(lido.invalidas, 1);
  assert.match(CV.lerImportacaoRespostas("não é json").erro, /JSON válido/);
});

test("AS-150 / AS-235 / AS-237 / AS-288 Departamentos: predefinições, pessoas do departamento, contraste da cor e motivo do item desabilitado", () => {
  const c = CV.predefinicaoHorario("comercial");
  assert.deepEqual([c[1], c[5], c[6], c[0]], [[["08:00", "18:00"]], [["08:00", "18:00"]], [], []]);
  assert.deepEqual(CV.predefinicaoHorario("almoco")[3], [["08:00", "12:00"], ["13:00", "18:00"]]);
  const s = CV.predefinicaoHorario("sabado", c);
  assert.deepEqual([s[6], s[1]], [[["08:00", "12:00"]], [["08:00", "18:00"]]], "sábado soma ao que existe");
  assert.equal(CV.predefinicaoHorario("x"), null);
  const us = [{ id: "u1", nome: "Ana", departamentos: ["d1"] }, { id: "u2", nome: "Bia", departamentos: [] }, { id: "u3", nome: "Caio", departamentos: ["d1", "d2"] }];
  assert.deepEqual(CV.pessoasDoDepartamento(us, "d1").map(u => u.nome), ["Ana", "Caio"]);
  assert.match(CV.avisoCorDepartamento("#FFF8E1"), /clara demais/);
  assert.match(CV.avisoCorDepartamento("#0A0B10"), /escura demais/);
  assert.equal(CV.avisoCorDepartamento("#6FA3CF"), "");
  assert.equal(CV.avisoCorDepartamento(null), "");
  assert.ok(CV.contrasteRgb([255, 255, 255], [0, 0, 0]) > 20);
  const m = CV.motivosMenuDepartamento({ padrao: true, ativo: true });
  assert.match(m.excluir, /padrão não pode ser excluído/);
  assert.equal(CV.motivosMenuDepartamento({ padrao: false, ativo: true }).excluir, null);
  assert.match(ler("web/app/cv-config.js"), /desabilitado: d\.padrao, motivo: motivos\.excluir/);
});

test("AS-273 / AS-297 / AS-242 / AS-275 Configurações: online, validade do convite, o que conta no plano e título da seção", async () => {
  const C = await import("../web/app/config.js");
  const agora = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(C.estaOnline("2026-10-13T11:57:00Z", agora), true);
  assert.equal(C.estaOnline("2026-10-13T11:50:00Z", agora), false);
  assert.equal(C.estaOnline(null, agora), false);
  assert.equal(C.DIAS_CONVITE_PADRAO, "3");
  assert.match(C.avisoValidadeConvite("30"), /valendo por um mês/);
  assert.equal(C.avisoValidadeConvite("7"), "");
  assert.match(C.REGRA_USO.usuarios, /convites ainda válidos/);
  assert.match(C.REGRA_USO.funis, /Só os funis ligados/);
  assert.match(C.REGRA_USO.contatos, /Todos os contatos/);
  assert.equal(C.tituloSecao({ titulo: "Departamentos e horários" }), "Departamentos e horários · Configurações");
  assert.equal(C.tituloSecao(null), "Configurações");
});

test("AS-158 / AS-164 / AS-165 / AS-166 / AS-169 / AS-171 / AS-248 Admin: lógica", () => {
  assert.equal(ADM.testeVencidoHa({ status: "teste", teste_ate: "2026-10-10" }, "2026-10-13"), 3);
  assert.equal(ADM.testeVencidoHa({ status: "teste", teste_ate: "2026-10-13" }, "2026-10-13"), null);
  assert.equal(ADM.testeVencidoHa({ status: "ativo", teste_ate: "2026-01-01" }, "2026-10-13"), null);
  assert.equal(ADM.rotuloTesteVencido(1), "Teste vencido há 1 dia");
  const l = [{ status: "ativo", ativo: true }, { status: "ativo", ativo: false, uso: { usuarios: 9 }, limites: { usuarios: 10 } }, { status: "teste" }];
  const r = ADM.resumoClientes(l);
  assert.deepEqual([r.ativo, r.pausados, r.perto_limite], [1, 1, 1], "pausado pela Nexus não conta como ativo");
  assert.equal(ADM.resumoClientes([{ status: "ativo" }]).pausados, undefined, "sem pausado, o resumo é o de antes");
  assert.equal(ADM.filtrarLocal(l, "pausados").length, 1);
  assert.equal(ADM.filtrarLocal(l, "perto").length, 1);
  const csv = ADM.csvClientes([{ nome: "Alfa; Ltda", slug: "alfa", status: "ativo", plano: "pro", uso: { usuarios: 2 }, limites: { usuarios: 5 } }], id => id.toUpperCase());
  assert.ok(csv.startsWith("﻿Cliente;Endereço;"));
  assert.match(csv, /\r\n"Alfa; Ltda";alfa;;PRO;;Ativo;não;;;2;5/);
  assert.equal(ADM.slugTomado([{ id: "c1", slug: "alfa-2" }, { id: "c2", slug: "alfa" }], "alfa").id, "c2");
  assert.equal(ADM.slugTomado([{ id: "c2", slug: "alfa" }], "alfa", "c2"), null, "o próprio cliente não conta");
  const doms = [{ host: "crm.a.com.br", status: "ativo", cliente: { nome: "Clínica Sorriso" } }, { host: "app.b.com", status: "pendente", cliente: null }];
  assert.deepEqual(ADM.filtrarDominios(doms, { busca: "sorriso" }).map(x => x.host), ["crm.a.com.br"]);
  assert.deepEqual(ADM.filtrarDominios(doms, { status: "pendente" }).map(x => x.host), ["app.b.com"]);
  const mem = new Map();
  const st = { setItem: (k, v) => mem.set(k, v) };
  assert.equal(ADM.lembrarVoltaAdmin("#/admin/clientes/c1", st), true);
  assert.equal(mem.get(ADM.CHAVE_VOLTA_ADMIN), "#/admin/clientes/c1");
  assert.equal(ADM.lembrarVoltaAdmin("#/crm", st), false);
  assert.deepEqual(ADM.resumoSaude({ problemas: ["fila atrasada"], envios_pausados: true, clientes_pausados: 2 }), { ok: false, problemas: ["fila atrasada"], pausaGeral: true, clientesPausados: 2, em: null });
  assert.equal(ADM.resumoSaude({}), null);
});

test("AS-219 / AS-222 / AS-223 / AS-224 / AS-284 / AS-270 / AS-298 / AS-228 / AS-232 / AS-230 / AS-229 Automações: lógica", () => {
  // AS-219: «Tempo na etapa» → «Etapa» → volta: as horas continuam
  const memoria = {};
  let a = { gatilho: "tempo_no_estagio", config: { estagio_id: U(13), horas: 168 } };
  a = L.trocarGatilho(a, "negocio_estagio", memoria);
  assert.deepEqual(a.config, { estagio_id: U(13) });
  a = L.trocarGatilho(a, "tempo_no_estagio", memoria);
  assert.deepEqual(a.config, { estagio_id: U(13), horas: 168 });
  assert.equal(L.trocarGatilho({ gatilho: "negocio_estagio", config: {} }, "tempo_no_estagio").config.horas, 48, "sem memória: o padrão");
  // AS-222
  assert.equal(L.rotuloValorNegocio(VOCAB), "Valor da oportunidade (R$)");
  assert.equal(L.camposCondicao(BASE, VOCAB).find(c => c.valor === "valor").rotulo, "Valor da oportunidade (R$)");
  // AS-223
  assert.equal(L.exemploContinuacao(2880, Date.parse("2026-10-14T10:00:00-03:00")), "Exemplo: se começar agora, continua sex, 16/10 às 10:00.");
  assert.equal(L.exemploContinuacao(0), "");
  // AS-224: sexta 17:50 + 30 min, horário seg–sex 08–18 → segunda 08:00
  const hor = { 0: [], 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [] };
  const tl = L.linhaDoTempo([{ tipo: "esperar", minutos: 30 }, { tipo: "enviar_mensagem", texto: "Oi" }], { inicio: Date.parse("2026-10-16T17:50:00-03:00"), horario: hor });
  assert.equal(new Date(tl[1].envio).toISOString(), "2026-10-19T11:00:00.000Z");
  assert.equal(tl[1].adiada, true);
  assert.equal(L.linhaDoTempo([{ tipo: "enviar_mensagem" }])[0].envio, undefined, "sem horário, a linha do tempo é a de antes");
  assert.equal(L.proximaAbertura(null, 123), 123, "24 h: sai na hora");
  // AS-284
  assert.equal(L.casaPalavras("Qual o PRECO do implante?", ["valor", "preço"]), "preço");
  assert.equal(L.casaPalavras("bom dia", ["preço"]), null);
  // AS-270
  const sim = { ehAmostra: false, total: 5, alvos: [{ passos: [{ estado: "faria", tipo: "enviar_mensagem" }, { estado: "faria", tipo: "criar_tarefa" }, { estado: "espera", tipo: "esperar" }] },
    { passos: [{ estado: "faria", tipo: "enviar_template" }] }, { ignorado: true, passos: [{ estado: "faria", tipo: "enviar_mensagem" }] }] };
  const rs = L.resumoSaidasSimulacao(sim);
  assert.deepEqual([rs.mensagens, rs.tarefas], [2, 1]);
  assert.equal(rs.texto, "Agora sairiam: 2 mensagens de WhatsApp e 1 tarefa (nos 3 mostrados).");
  const norm = L.normalizarSimulacao({ amostra: [{ titulo: "Maria", passos: [{ resultado: "faria" }] }] }, { acoes: [{ tipo: "enviar_mensagem" }] }, BASE, VOCAB);
  assert.equal(norm.alvos[0].passos[0].tipo, "enviar_mensagem", "sem tipo do servidor: o da mesma posição");
  // AS-298
  assert.match(L.dicaDoErro("falta a hora da consulta").dica, /data e a hora/);
  assert.equal(L.dicaDoErro("Sem número conectado").href, "#/config/numeros");
  assert.equal(L.dicaDoErro("algo nada a ver"), null);
  // AS-228
  assert.equal(L.frasePedirAdmin(BASE.usuarios), "Peça a Bruno Reis (administrador da empresa).");
  assert.equal(L.frasePedirAdmin([]), "Peça a um administrador da sua empresa.");
  // AS-232
  assert.equal(L.temCanalMeta({ canais: [{ provedor: "codewords" }] }), false);
  assert.equal(L.temCanalMeta({ canais: [{ provedor: "meta" }] }), true);
  assert.equal(L.temCanalMeta({ canais: [{ id: 1 }], templates: [] }), null, "sem o provedor: não dá para saber");
  assert.equal(L.temCanalMeta({ canais: [{ id: 1 }], templates: [{ id: "t" }] }), true);
  // AS-230
  assert.match(L.resumoFluxo({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "esperar", minutos: 60 }, { tipo: "criar_tarefa" }, { tipo: "enviar_mensagem" }] }, BASE, VOCAB),
    /→ 3 passos \(1 espera\)$/);
  // AS-229
  const cmds = L.comandosDasAutomacoes(dadosLista().itens, { podeEditar: true });
  assert.equal(cmds.find(c => c.id === "automacoes.alternar.a1").rotulo, "Ligar a automação «Lembrete por mensagem»");
  assert.equal(cmds.find(c => c.id === "automacoes.alternar.a2").rotulo, "Desligar a automação «Tarefa de orçamento»");
  assert.equal(L.comandosDasAutomacoes(dadosLista().itens, { podeEditar: false }).some(c => c.acao === "alternar"), false);
});

test("AS-266 movimento reduzido: toda animação de automacoes.css (menos o giro de carregando) para com prefers-reduced-motion", () => {
  const css = ler("web/app/automacoes.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const reduzido = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join("\n");
  const animados = [...css.matchAll(/(^|\})\s*([^{}@]+)\{[^{}]*\banimation:\s*(?!none)[^;]+;/g)].map(m => m[2].trim()).filter(s => !/au-giro/.test(s));
  assert.ok(animados.length >= 5);
  for (const sel of animados) for (const s of sel.split(",").map(x => x.trim()).filter(Boolean)) {
    const chave = s.replace(/:nth-child\([^)]*\)/, "");
    assert.ok(reduzido.includes(chave), `sem parada com movimento reduzido: ${s}`);
  }
  assert.match(reduzido, /\.au-ponto-on::after \{ animation: none; display: none; \}/, "o ponto pulsante «ligada» para");
});

/* ================================================================== lote auto-3 — (b) telas */

const canalMeta = () => ({ id: "m1", nome: "Comercial Meta", provedor: "meta", status: "ativo", qualidade: "YELLOW", phone_number_id: "1234567", waba_id: "7654321",
  numero_exibicao: "+55 12 98888-0000", tem_app_secret: false, tem_token: true, app_inscrito: true });

test("AS-131 + AS-135 + AS-136 + AS-285 + AS-286 + AS-256 Números: reconferir diz «2 de 2»; cartão da Meta com qualidade em palavras, modelos, IDs recolhidos e pílula sem jargão", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const rotulos = [];
    const t = ctxNum(ui, {
      rpc: async n => (n === "nx_canais_listar" ? [...canaisCw(), canalMeta()] : n === "nx_cv_base" ? { departamentos: [], templates: [{ id: "t1", canal_id: "m1", status: "APPROVED" }, { id: "t2", canal_id: "m1", status: "PENDING" }] } : []),
      fn: async () => { rotulos.push(textoDe(t.alvo.querySelector(".cfg-reconf-txt"))); return { ok: true }; } });
    await montar(t.ctx, t.alvo); await tique(6);
    const meta = t.alvo.querySelectorAll(".cfg-canal").find(c => /Comercial Meta/.test(c.textContent));
    assert.match(textoDe(meta.querySelector(".cfg-qualidade")), /Qualidade Atenção/);
    assert.match(textoDe(meta.querySelector(".cfg-qualidade-exp")), /bloquearam ou denunciaram/);
    assert.deepEqual(meta.querySelectorAll(".cfg-modelos .pilula").map(textoDe), ["1 aprovado", "1 em análise"]);
    assert.doesNotMatch(textoDe(meta.querySelector(".cfg-canal-kv")), /Phone number ID|WABA/, "IDs fora do destaque");
    assert.match(textoDe(meta.querySelector("details.cfg-tecnicos")), /Dados técnicos.*1234567.*7654321/);
    assert.doesNotMatch(meta.textContent, /Webhook do app da plataforma/);
    const pil = meta.querySelectorAll(".pilula").find(p => /Recebe pelo app da plataforma/.test(p.textContent));
    assert.ok(pil && pil.dataset.dica && /app secret/.test(pil.dataset.dica), "a pílula explica quando usar app próprio");
    const bt = t.alvo.querySelector(".cfg-reconferir");
    clicar(d, bt); await tique(10);
    assert.deepEqual(rotulos, ["Reconferindo 1 de 2…", "Reconferindo 2 de 2…"]);
    assert.equal(textoDe(t.alvo.querySelector(".cfg-reconf-txt")), "Reconferir agora", "volta ao rótulo ao terminar");
    assert.match(ler("web/app/cv-config.js"), /lista\.appendChild\(ui\.esqueleto\("cartao"\)\)/, "AS-256: o esqueleto lembra o cartão");
  } finally { d.fim(); }
});

test("AS-247 + AS-245 + AS-140 CodeWords: «Sincronizado» explica; Fechar com campo mexido pergunta; depois de «Ligar na IA» a tela consulta o aparelho (honesto pós-ação)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const cw = canaisCw();
    cw[0].codewords.sync = { em: new Date(Date.now() - 600e3).toISOString(), erro: null };
    let modalCw = null;
    const chamadasFn = [];
    const t = ctxNum(ui, {
      rpc: async n => (n === "nx_canais_listar" ? cw : n === "nx_cv_base" ? { departamentos: [] } : n === "nx_codewords_canal_salvar" ? { canal: { id: "cw1" } } : []),
      fn: async (_f, p) => { chamadasFn.push(p.acao); return { ok: true, inscrito_certo: true, pareado: true }; },
      modal: o => { if (/^WhatsApp CodeWords/.test(o.titulo)) modalCw = o; return null; } });
    await montar(t.ctx, t.alvo); await tique(6);
    const sync = t.alvo.querySelectorAll(".pilula").find(p => /^Sincronizado/.test(textoDe(p)));
    assert.match(sync.dataset.dica, /Última recuperação de mensagens do aparelho/);
    const abrir = t.alvo.querySelectorAll(".cfg-cw-card button").find(b => /Configurar|Continuar/.test(b.textContent));
    clicar(d, abrir); await tique(8);
    assert.ok(modalCw, "abriu o assistente");
    const confirmacoes = [];
    t.ctx.ui.confirmar = async o => { confirmacoes.push(o.titulo); return false; };
    digitar(d, modalCw.corpo.querySelector("input[name=nome]"), "Recepção 2");
    const fechar = await modalCw.acoes[0].fn();
    assert.equal(fechar, false, "Cancelar na pergunta mantém o assistente aberto");
    assert.deepEqual(confirmacoes, ["Fechar sem salvar?"]);
    // AS-140: «Ligar o número na IA» — o CodeWords aceita o pedido e a tela pergunta ao aparelho antes de dizer «Conectado»
    t.ctx.ui.confirmar = async () => true;
    chamadasFn.length = 0;
    const bFluxo = modalCw.corpo.querySelectorAll("button").find(b => /Ligar o número na IA/.test(b.textContent));
    bFluxo.disabled = false;
    clicar(d, bFluxo); await tique(12);
    const i = chamadasFn.indexOf("ligar_fluxo");
    assert.ok(i >= 0, chamadasFn.join(","));
    assert.equal(chamadasFn.slice(i + 1).includes("estado"), true, "depois de ligar, consulta o estado real");
  } finally { d.fim(); }
});

test("AS-141 + AS-142 + AS-143 + AS-144 + AS-240 Respostas: mais usadas primeiro, chips de departamento, atalho repetido ao digitar, variáveis com nome falado e Exportar/Importar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "respostas").montar;
    let modal = null;
    const t = ctxNum(ui, {
      rpc: async n => (n === "nx_cv_base" ? { departamentos: [{ id: "d1", nome: "Comercial" }], respostas: [
        { id: "r1", atalho: "ola", titulo: "Olá", corpo: "Oi {primeiro_nome}", usos: 1, departamento_id: null },
        { id: "r2", atalho: "preco", titulo: "Preço", corpo: "R$ 100", usos: 12, departamento_id: "d1" }] } : {}),
      modal: o => { modal = o; return null; } });
    t.ctx.sessao = { conta: { id: "conta-1", nome: "Ana Lima" } };
    await montar(t.ctx, t.alvo); await tique(6);
    const linhas = t.alvo.querySelectorAll("tbody tr").map(tr => textoDe(tr.querySelector("td")));
    assert.deepEqual(linhas, ["/preco", "/ola"], "padrão: usos desc");
    assert.ok(t.alvo.querySelectorAll("th button.th-ord").some(b => /Usos/.test(b.textContent)), "Usos ordenável");
    const chips = t.alvo.querySelector(".cfg-resp-deps");
    assert.equal(chips.hidden, false);
    clicar(d, chips.querySelectorAll("button").find(b => /Comercial/.test(b.textContent))); await tique(2);
    assert.deepEqual(t.alvo.querySelectorAll("tbody tr").map(tr => textoDe(tr.querySelector("td"))), ["/preco"]);
    assert.ok(t.alvo.querySelector(".cfg-resp-exportar") && t.alvo.querySelector(".cfg-resp-importar"));
    clicar(d, t.alvo.querySelectorAll("button").find(b => /Nova resposta/.test(b.textContent))); await tique(4);
    const inp = modal.corpo.querySelector("input[name=atalho]");
    digitar(d, inp, "PRECO");
    const av = modal.corpo.querySelector(".cfg-atalho-repetido");
    assert.equal(av.hidden, false);
    assert.match(av.textContent, /Já existe \/preco \(«Preço»\)/);
    assert.equal(inp.getAttribute("aria-invalid"), "true");
    const vars = modal.corpo.querySelectorAll(".cfg-vars button");
    assert.equal(vars[0].getAttribute("aria-label"), "Inserir primeiro nome");
  } finally { d.fim(); }
});

test("AS-145 + AS-148 + AS-149 + AS-150 + AS-235 + AS-237 + AS-238 Departamentos: rostos com atalho, «Aberto agora» vivo, fuso, horários prontos, grupo por dia, contraste e faixa noturna salva", async () => {
  const d = comDom();
  const relogios = [];
  const si = globalThis.setInterval, ci = globalThis.clearInterval;
  globalThis.setInterval = (f, ms) => { relogios.push({ f, ms, vivo: true }); return relogios.length; };
  globalThis.clearInterval = id => { if (relogios[id - 1]) relogios[id - 1].vivo = false; };
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "departamentos").montar;
    const dep = { id: "d1", nome: "Recepção", cor: "#6FA3CF", padrao: true, ativo: true, distribuicao: "rodizio", pessoas: 2,
      horario: { 0: [], 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [] } };
    let modal = null;
    const salvos = [];
    const t = ctxNum(ui, {
      rpc: async (n, p) => { if (n === "nx_departamento_salvar") { salvos.push(p.p_departamento); return { id: "d1" }; }
        return n === "nx_cv_base" ? { config: { departamentos: [dep] }, usuarios: [{ id: "u1", nome: "Ana Lima", departamentos: ["d1"] }, { id: "u2", nome: "Bia", departamentos: [] }] } : {}; },
      modal: o => { modal = o; return null; } });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    const rostos = t.alvo.querySelector(".cfg-dep-pessoas");
    assert.equal(rostos.getAttribute("href"), "#/config/usuarios?dep=d1");
    assert.match(rostos.getAttribute("aria-label"), /Pessoas do Recepção: Ana Lima/);
    assert.match(textoDe(t.alvo.querySelector(".cfg-dep-hor")), /horário de Brasília/);
    const viva = relogios.find(r => r.ms === 60000);
    assert.ok(viva, "a pílula «agora» é refeita a cada minuto");
    assert.equal(typeof limpar, "function");
    limpar();
    assert.equal(viva.vivo, false, "sair da seção para o relógio");
    clicar(d, t.alvo.querySelectorAll("button").find(b => /Editar/.test(b.textContent))); await tique(4);
    const f = modal.corpo;
    assert.match(textoDe(f.querySelector("[data-campo=horario] legend")), /horário de Brasília \(São Paulo\)/);
    const seg = f.querySelector('[data-dia="1"]');
    assert.equal(seg.getAttribute("role"), "group");
    assert.ok(seg.getAttribute("aria-labelledby"));
    const dom = f.querySelector('[data-dia="0"] input[type=checkbox]');
    assert.ok(/fechado$/.test(dom.getAttribute("aria-describedby") || ""), "«Fechado» descreve o dia");
    clicar(d, f.querySelector("[data-predef=almoco]")); await tique(2);
    assert.equal(f.querySelectorAll('[data-dia="3"] .cfg-faixa').length, 2, "«Com almoço» aplicou 2 faixas");
    // faixa noturna na segunda (última do dia): salva
    clicar(d, f.querySelector("[data-predef=comercial]")); await tique(2);
    const [ini, fim] = f.querySelectorAll('[data-dia="1"] input[type=time]');
    ini.value = "22:00"; fim.value = "02:00"; fim.dispatchEvent(new d.Evento("change"));
    assert.equal(f.querySelector("[data-campo=horario] .campo-erro").hidden, true, "sem erro de «fim antes do início»");
    assert.match(textoDe(f.querySelector(".cfg-hor-resumo")), /madrugada do dia seguinte/);
    const r = await modal.acoes.find(a => a.tipo === "primario").fn();
    assert.ok(r, "salvou");
    assert.deepEqual(salvos[0].horario[1], [["22:00", "02:00"]]);
    // contraste
    const oculto = f.querySelector("[data-campo=cor] input[type=hidden]");
    oculto.value = "#FFF8E1"; oculto.dispatchEvent(new d.Evento("change")); await tique(2);
    assert.match(textoDe(f.querySelector(".cfg-cor-aviso")), /clara demais/);
  } finally { globalThis.setInterval = si; globalThis.clearInterval = ci; d.fim(); }
});

test("AS-233 Preferências do atendimento: o interruptor mostra «Salvo» ao lado por 2 s (sem toast solto)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "atendimento").montar;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { cfg: { recibo_leitura: true, assinatura: false } } : n === "nx_cv_config_salvar" ? { assinatura: true } : {}) });
    t.ctx.sessao = { conta: { id: "c", nome: "Ana" } };
    await montar(t.ctx, t.alvo); await tique(4);
    const inp = t.alvo.querySelector("input[name=assinatura]");
    inp.checked = true; inp.dispatchEvent(new d.Evento("change")); await tique(4);
    const est = inp.closest(".campo").querySelector(".cfg-pref-estado");
    assert.equal(est.textContent, "Salvo");
    assert.equal(est.getAttribute("role"), "status");
    assert.equal(t.toasts.length, 0);
  } finally { d.fim(); }
});

test("AS-293 + AS-275 + AS-273 + AS-235 + AS-241 + AS-242 Configurações: visão geral no #/config, título da aba, online, filtro por departamento e plano com próximo passo", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const titulos = [];
    const t = ctxCfg(ui, { partes: [] });
    t.ctx.titulo = x => titulos.push(x);
    await cfg.montar(t.ctx); await tique(6);
    const vg = t.ctx.alvo.querySelector(".cfg-vg");
    assert.ok(vg, "#/config abre a visão geral");
    assert.ok(vg.querySelectorAll("a.cfg-vg-item").some(a => a.getAttribute("href") === "#/config/perfil"));
    assert.equal(titulos.at(-1), "Configurações");
    cfg.desmontar(); d.doc.body.removeChild(t.ctx.alvo);
    // seção: «Usuários e convites · Configurações»; ?dep= filtra; online
    const agora = new Date().toISOString();
    const t2 = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => (n === "nx_usuarios_listar" ? usuariosFalsos({
      usuarios: [{ conta_id: "u1", nome: "Bruno", email: "b@x.com", papel: "atendente", editavel: true, departamentos: ["d1"], ultimo_acesso: agora },
        { conta_id: "u2", nome: "Carla", email: "c@x.com", papel: "atendente", editavel: true, departamentos: [] }],
      departamentos: [{ id: "d1", nome: "Comercial" }] }) : {}) });
    t2.ctx.titulo = x => titulos.push(x);
    t2.ctx.rota.query = { dep: "d1" };
    await cfg.montar(t2.ctx); await tique(6);
    assert.equal(titulos.at(-1), "Usuários e convites · Configurações");
    assert.match(textoDe(t2.ctx.alvo.querySelector(".cfg-us-dep")), /Departamento Comercial · 1 pessoa/);
    assert.ok(t2.ctx.alvo.querySelector(".cfg-online"), "Bruno acessou agora: online");
    assert.doesNotMatch(textoDe(t2.ctx.alvo.querySelector(".cfg-us-tab")), /Carla/);
    cfg.desmontar(); d.doc.body.removeChild(t2.ctx.alvo);
    // plano sem WhatsApp de suporte: «Quero aumentar» existe e cada barra diz o que conta
    const t3 = ctxCfg(ui, { partes: ["plano"], rpc: async n => (n === "nx_uso_plano" ? { plano: { nome: "Essencial" }, status: "ativo", uso: { usuarios: 5 }, limites: { usuarios: 5 }, modulos: [] } : {}) });
    t3.ctx.shell.prontos.CONFIG_PRONTAS.push("plano");
    t3.ctx.shell.marcaEfetiva = () => ({});
    await cfg.montar(t3.ctx); await tique(8);
    assert.ok(t3.ctx.alvo.querySelector("button.cfg-quero-aumentar"));
    assert.match(textoDe(t3.ctx.alvo.querySelector(".cfg-uso-regra")), /convites ainda válidos/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("AS-158 + AS-164 + AS-165 + AS-166 + AS-289 + nx_saude Admin (lista): teste vencido em vermelho, KPI de pausados que filtra, nome como link, CSV e saúde da operação", async () => {
  const d = comDom();
  const salvoH = globalThis.history;
  globalThis.history = { state: null, replaceState() {} };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const clis = [...CLI(), { id: "c2", nome: "Beta", slug: "beta", status: "teste", teste_ate: "2026-01-01", ativo: true, plano: "essencial", uso: {}, limites: {}, comercial: {} },
      { id: "c3", nome: "Gama", slug: "gama", status: "ativo", ativo: false, plano: "essencial", uso: {}, limites: {}, comercial: {} }];
    const t = ctxAdm(ui, { rpc: async n => (n === "nx_clientes_admin" ? clis : n === "nx_planos_listar" ? PLANOS
      : n === "nx_saude" ? { problemas: ["3 mensagens na fila atrasadas há mais de 30 min"], envios_pausados: false, clientes_pausados: 0 } : n === "nx_orgs_listar" ? [] : []) });
    await adm.montar(t.ctx); await tique(10);
    assert.match(textoDe(t.alvo.querySelector(".adm-saude")), /1 ponto de atenção.*fila atrasadas/);
    assert.ok(t.alvo.querySelectorAll(".adm-saude button").some(b => /Pausar todos os envios/.test(b.textContent)));
    const kpis = t.alvo.querySelectorAll(".adm-kpis button");
    const rot = kpis.map(textoDe);
    assert.ok(rot.some(x => /Ativos.*1/.test(x)), rot.join(" | "));
    const paus = kpis.find(b => /Pausados/.test(b.textContent));
    assert.ok(paus, "KPI separado de pausados");
    clicar(d, paus); await tique(8);
    assert.deepEqual(t.alvo.querySelectorAll(".tab-linha").map(l => l.dataset.id), ["c3"]);
    assert.match(textoDe(t.alvo.querySelector(".adm-filtro-local")), /Só os pausados/);
    clicar(d, t.alvo.querySelector(".adm-filtro-local button")); await tique(8);
    assert.equal(t.alvo.querySelectorAll(".tab-linha").length, 3);
    const link = t.alvo.querySelector('.tab-linha[data-id="c1"] a.adm-nome-link');
    assert.equal(link.getAttribute("href"), "#/admin/clientes/c1");
    assert.match(textoDe(t.alvo.querySelector('.tab-linha[data-id="c2"] [data-col=teste_ate]')), /Teste vencido há \d+ dias/);
    assert.ok(t.alvo.querySelector(".adm-csv"));
    adm.desmontar();
  } finally { if (salvoH === undefined) delete globalThis.history; else globalThis.history = salvoH; d.fim(); }
});

test("AS-162 + AS-290 + AS-158 + nx_envios_pausar Admin (cliente): salvar atualiza o cabeçalho sem remontar; 0 bloqueia; pausa de envios só da plataforma", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const pausas = [];
    const navegou = [];
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], rpc: async (n, p) => {
      if (n === "nx_clientes_admin") return [{ ...CLI()[0], status: "teste", teste_ate: "2026-01-02" }];
      if (n === "nx_planos_listar") return PLANOS;
      if (n === "nx_usuarios_listar") return { usuarios: [{ conta_id: "u1", nome: "Dra. Helena", email: "h@x.com", papel: "admin" }], convites: [] };
      if (n === "nx_cliente_admin_salvar") return { ...CLI()[0], ...p.p_cliente, criado_em: "2026-01-01" };
      if (n === "nx_envios_pausar") { pausas.push(p); return { ok: true, pausado: p.p_pausar }; }
      return [];
    } });
    t.ctx.navegar = h => navegou.push(h);
    await adm.montar(t.ctx); await tique(10);
    assert.match(textoDe(t.alvo.querySelector(".cartao-cab .linha")), /Teste vencido há/);
    assert.match(t.alvo.textContent, /0 bloqueia o recurso/);
    assert.ok(t.alvo.querySelector(".adm-us-acoes"), "ação de suporte por pessoa");
    const bP = t.alvo.querySelectorAll(".adm-envios button").find(b => /Pausar envios/.test(b.textContent));
    clicar(d, bP); await tique(6);
    assert.deepEqual([pausas[0].p_cliente, pausas[0].p_pausar], ["c1", true]);
    assert.match(textoDe(t.alvo.querySelector(".adm-envios-estado")), /Pausados/);
    const form = t.alvo.querySelector("form");
    form.querySelector("input[name=nome]").value = "Alfa Odonto";
    form.querySelector("select[name=status]").value = "ativo";
    form.dispatchEvent(new d.Evento("submit")); await tique(10);
    assert.equal(textoDe(t.alvo.querySelector(".cartao-cab h1")), "Alfa Odonto");
    assert.doesNotMatch(textoDe(t.alvo.querySelector(".cartao-cab .linha")), /Teste vencido/);
    assert.equal(navegou.length, 0, "não remonta (a rolagem fica onde estava)");
    adm.desmontar();
  } finally { d.fim(); }
});

test("AS-281 + AS-229 + AS-228 + AS-226 lista de automações: interruptor com o nome, comandos por automação, quem pedir e chips com contagem falada", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    const reg = [];
    const t = ctxAuto(ui, { rpc: rpcLista(dados), extra: { comandos: { registrar: c => { reg.push(c); return () => {}; } } } });
    await A.montar(t.ctx); await tique(6);
    assert.equal(cartao(t.ctx.alvo, "a1").querySelector(".au-sw").getAttribute("aria-label"), "Lembrete por mensagem");
    const alt = reg.find(c => c.id === "automacoes.alternar.a1");
    assert.equal(alt.rotulo, "Ligar a automação «Lembrete por mensagem»");
    alt.fazer(); await tique(6);
    assert.ok(t.confirmacoes.some(c => /Ligar «Lembrete por mensagem»/.test(c.titulo)), "pela paleta, as mesmas confirmações do interruptor");
    const chip = t.ctx.alvo.querySelectorAll(".au-lista-filtro .au-chip")[0];
    assert.equal(chip.getAttribute("aria-label"), "Todas, 4 automações");
    A.desmontar();
    d.doc.body.removeChild(t.ctx.alvo);
    const t2 = ctxAuto(ui, { partes: ["nova"], rpc: rpcLista({ ...dadosLista(), pode_editar: false }) });
    await A.montar(t2.ctx); await tique(6);
    assert.match(textoDe(t2.ctx.alvo), /Peça a Bruno Reis \(administrador da empresa\)/);
    A.desmontar();
  } finally { d.fim(); }
});

test("AS-220 + AS-221 + AS-222 + AS-268 + AS-230 + AS-284 editor: «+ Condição» abre os campos; valor em R$ com máscara; «Liga ao salvar»; resumo do fluxo; testar uma frase", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "a5", nome: "Pergunta de preço", gatilho: "mensagem_recebida", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { palavras: ["preço", "valor"] },
      acoes: [{ tipo: "criar_tarefa", titulo: "Responder", dono: "responsavel" }] });
    const e = await abrirEditor(d, { partes: ["a5"], dados });
    const btCond = e.raiz.querySelector('[data-onde="se"] .au-mais');
    clicar(d, btCond); await tique(2);
    const itens = e.menus.at(-1);
    const valor = itens.find(x => x.rotulo === "Valor da oportunidade (R$)");
    assert.ok(valor, itens.map(x => x.rotulo).join(" | "));
    valor.fn(); await tique(2);
    const cond = e.raiz.querySelector(".au-cond");
    const inp = cond.querySelector("input[data-moeda]");
    assert.ok(inp, "campo de moeda");
    assert.match(textoDe(cond.querySelector(".au-cond-val label")), /Valor da oportunidade \(R\$\)/);
    // interruptor do topo
    const sw = e.raiz.querySelector(".au-ed-acoes .au-sw");
    clicar(d, sw); await tique(2);
    assert.equal(textoDe(e.raiz.querySelector(".au-sw-nota")), "Liga ao salvar");
    clicar(d, sw); await tique(2);
    assert.equal(e.raiz.querySelector(".au-sw-nota").hidden, true);
    // resumo do fluxo
    await esperar(200);
    assert.match(textoDe(e.raiz.querySelector(".au-dg-resumo")), /1 condição → 1 passo$/);
    // testar uma frase
    const fr = e.raiz.querySelector(".au-frase-inp");
    digitar(d, fr, "Qual o PRECO do clareamento?");
    assert.equal(textoDe(e.raiz.querySelector(".au-frase-res")), "Dispara: casou com «preço».");
    digitar(d, fr, "bom dia");
    assert.match(textoDe(e.raiz.querySelector(".au-frase-res")), /Não dispara/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-269 + AS-298 editor: erro do servidor ao salvar fica fixo no topo (com dica) até a próxima tentativa", async () => {
  const d = comDom();
  try {
    let falhar = true;
    const e = await abrirEditor(d, { partes: ["a2"], rpcExtra: { nx_automacao_salvar: async p => { if (falhar) throw Object.assign(new Error("Sem número conectado para enviar"), { codigo: "x" }); return { ...p.p_auto, id: "a2" }; } } });
    const bt = e.raiz.querySelectorAll("button").find(b => /^Salvar$/.test(textoDe(b)));
    clicar(d, bt); await tique(10);
    const av = e.raiz.querySelector(".au-erro-salvar");
    assert.equal(av.hidden, false);
    assert.equal(av.getAttribute("role"), "alert");
    assert.match(textoDe(av), /Não foi salva\..*Ver os números/);
    assert.equal(e.toasts.filter(x => x[1].tipo === "erro").length, 0, "não some num toast");
    falhar = false;
    clicar(d, bt); await tique(10);
    assert.equal(av.hidden, true, "a nova tentativa limpa o aviso");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-270 + AS-232 simulação conta o que sairia; aviso lateral sem a Meta quando os números são só CodeWords", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Recepção", provedor: "codewords" }] };
    const e = await abrirEditor(d, { partes: ["a3"], dados, rpcExtra: { nx_auto_simular: async () => ({ amostra: [{ titulo: "Maria", passos: [{ tipo: "enviar_mensagem", resultado: "faria" }] }] }) } });
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-avisos")), /24 h/);
    assert.match(textoDe(e.raiz.querySelector(".au-avisos")), /conectado por aparelho \(texto livre a qualquer hora\)/);
    clicar(d, e.raiz.querySelectorAll("button").find(b => /Testar agora/.test(b.textContent))); await tique(10);
    assert.equal(textoDe(e.raiz.querySelector(".au-sim-saidas")), "Agora sairiam: 1 mensagem de WhatsApp.");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-225 + AS-226 + AS-227 execuções: chips com contagem falada; «Cancelar todas» diz quantas; barra do gráfico filtra o dia", async () => {
  const d = comDom();
  try {
    const hoje = new Date(), ontem = new Date(Date.now() - 86400e3);
    const lista = [{ id: 1, criado_em: hoje.toISOString(), status: "espera", chave: "k1" }, { id: 2, criado_em: hoje.toISOString(), status: "espera", chave: "k2" },
      { id: 3, criado_em: ontem.toISOString(), status: "ok" }];
    const e = await abrirEditor(d, { partes: ["a2"], query: { aba: "execucoes" }, confirmar: async () => false,
      rpcExtra: { nx_automacao_execucoes: async () => lista, nx_automacao_execucoes_dia: async () => { throw new Error("sem"); } } });
    await tique(10);
    const chips = e.raiz.querySelectorAll(".au-ex-filtro .au-chip");
    assert.equal(chips[0].getAttribute("aria-label"), "Todas, 3 execuções");
    clicar(d, e.raiz.querySelectorAll("button").find(b => /Cancelar todas as esperas/.test(b.textContent))); await tique(4);
    assert.equal(e.confirmacoes.at(-1).titulo, "Cancelar as 3 esperas desta automação?", "a contagem do servidor (em_espera) vale");
    const barras = e.raiz.querySelectorAll("button.au-gd-col");
    assert.equal(barras.length, 2);
    clicar(d, barras[0]); await tique(2);
    assert.equal(e.raiz.querySelector(".au-ex-dia-filtro").hidden, false);
    assert.equal(e.raiz.querySelectorAll(".au-ex").length, 1, "só o dia escolhido");
    clicar(d, e.raiz.querySelector(".au-ex-dia-filtro button")); await tique(2);
    assert.equal(e.raiz.querySelectorAll(".au-ex").length, 3);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("AS-223 + AS-231 + AS-224 (fonte): «Esperar» mostra quando continuaria; a explicação da IA volta; a linha do tempo usa o horário quando a base traz", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const P = (await import("../web/app/auto-pecas.js")).pecas(ui, L);
    const c = P.campoDuracao({ rotulo: "Esperar", valor: 2880, aoMudar() {} });
    assert.match(textoDe(c.querySelector(".au-dur-resumo")), /^Esperar 2 dias\. Exemplo: se começar agora, continua /);
  } finally { d.fim(); }
  const src = ler("web/app/auto-editor.js");
  assert.match(src, /Ver o que a IA explicou/);
  assert.match(src, /btVerIA\.hidden = false;/);
  assert.match(src, /L\.linhaDoTempo\(auto\.acoes, opcoesTempo\(\)\)/);
});

/* ================================================================== revisão do lote (achados 1–10) */

test("revisão 1 · AS-229 Ctrl+K «Ligar/Desligar»: o comando guarda o estado pedido; o rótulo acompanha o interruptor; comando velho não inverte", async () => {
  const d = comDom();
  try {
    assert.equal(L.comandosDasAutomacoes(dadosLista().itens, { podeEditar: true }).find(c => c.id === "automacoes.alternar.a4").ligar, false);
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const reg = new Map();         // como a paleta real: mesmo id substitui; o cancelar velho não apaga o novo
    const ativar = [];
    const t = ctxAuto(ui, { rpc: rpcLista(dadosLista(), {}),
      extra: { comandos: { registrar: c => { reg.set(c.id, c); return () => { if (reg.get(c.id) === c) reg.delete(c.id); }; } } } });
    const rpc0 = t.ctx.api.rpcC;
    t.ctx.api.rpcC = async (n, p, o) => { if (n === "nx_automacao_ativar") ativar.push(p.p_ativo); return rpc0(n, p, o); };
    await A.montar(t.ctx); await tique(6);
    const velho = reg.get("automacoes.alternar.a4");
    assert.equal(velho.rotulo, "Desligar a automação «Etiqueta de retorno»");
    velho.fazer(); await tique(8);
    assert.deepEqual(ativar, [false], "desligou");
    assert.equal(cartao(t.ctx.alvo, "a4").querySelector(".au-sw").getAttribute("aria-checked"), "false");
    assert.equal(reg.get("automacoes.alternar.a4").rotulo, "Ligar a automação «Etiqueta de retorno»", "o rótulo segue o estado atual");
    velho.fazer(); await tique(8);
    assert.deepEqual(ativar, [false], "o comando velho («Desligar») não religa");
    assert.match(t.toasts.at(-1)[0], /«Etiqueta de retorno» já está desligada\./);
    A.desmontar();
    assert.equal([...reg.keys()].some(k => k.startsWith("automacoes.alternar.")), false, "sair da tela tira os comandos");
  } finally { d.fim(); }
});

test("revisão 2 · excluir automação: a página saindo antes do «Desfazer» firma com keepalive", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const pedidos = [];
    const t = ctxAuto(ui, { rpc: async (n, p, o) => { if (n === "nx_automacoes_listar") return dadosLista(); if (n === "nx_automacao_excluir") pedidos.push([p.p_id, o]); return {}; } });
    await A.montar(t.ctx); await tique(4);
    cartao(t.ctx.alvo, "a4").querySelector(".au-item-mais").dispatchEvent(new d.Evento("click"));
    t.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    await t.desfazeres[0].o.firmar({ saindo: true });
    assert.deepEqual(pedidos, [["a4", { keepalive: true }]]);
    await t.desfazeres[0].o.firmar();
    assert.deepEqual(pedidos[1], ["a4", {}], "fechando normalmente: sem keepalive");
    A.desmontar();
  } finally { d.fim(); }
});

test("revisão 3 · AS-082 Configurações: a seção com alteração registra a guarda do shell (menu, paleta, Voltar); troca de seção desregistra", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    let resposta = false;
    const guardas = new Set();
    const t = ctxCfg(ui, { partes: ["ia"], confirmar: async () => resposta,
      rpc: async n => (n === "nx_cv_base" ? { ia: { ligada: true, cota: { usadas: 1, limite: 10 } }, config: { ia: { tom: "proximo", sobre: "Clínica" } } } : {}) });
    t.ctx.aoSairDaRota = fn => { guardas.add(fn); return () => guardas.delete(fn); };
    await cfg.montar(t.ctx); await tique(8);
    assert.equal(guardas.size, 1, "a seção do assistente pode segurar a saída");
    const guarda = [...guardas][0];
    assert.equal(await guarda({ destino: { modulo: "crm" }, motivo: "rota" }), true, "sem alteração: sai sem perguntar");
    assert.equal(t.confirmacoes.length, 0);
    digitar(d, t.ctx.alvo.querySelector("[name=assistente_nome]"), "Bia");
    assert.equal(await guarda({ destino: { modulo: "crm" }, motivo: "rota" }), false, "com alteração: pergunta e fica");
    assert.match(t.confirmacoes.at(-1).titulo, /Sair sem salvar o assistente/);
    resposta = true;
    assert.equal(await guarda({ destino: null, motivo: "sair" }), true);
    // o link da própria lista já perguntou: a guarda não pergunta de novo
    const link = t.ctx.alvo.querySelectorAll("a.cfg-nav-item").find(a => a.getAttribute("href") === "#/config/perfil");
    const n0 = t.confirmacoes.length;
    const ev = new d.Evento("click"); ev.button = 0; link.dispatchEvent(ev); await tique(4);
    assert.equal(t.confirmacoes.length, n0 + 1);
    assert.equal(await guarda({ destino: { modulo: "config" }, motivo: "rota" }), true);
    assert.equal(t.confirmacoes.length, n0 + 1, "sem segunda pergunta");
    cfg.desmontar();
    assert.equal(guardas.size, 0, "desmontar tira a guarda");
  } finally { d.fim(); }
});

test("revisão 4 · editor: «Salvar e continuar» numa automação nova passa o rascunho para o id salvo (não fica «nova» e não duplica)", () => {
  const src = ler("web/app/auto-editor.js");
  assert.match(src, /let idRasc = L\.idRascunho\(/);
  assert.match(src, /if \(rasc\) rasc\.apagar\(idRasc\);\n\s+idRasc = String\(salvo\.id\);/);
  assert.equal(L.idRascunho({ item: null, origem: "branco" }), "nova");
  assert.equal(L.idRascunho({ item: { id: 7 } }), "7");
});

test("revisão 5 · Admin: editar o cliente sem mudar o segmento mantém o modelo escolhido; mudar o segmento recalcula", () => {
  assert.equal(ADM.verticalAoEditar("Clínica odontológica", "Clínica odontológica", "generico"), "generico", "segmento igual: modelo intacto");
  assert.equal(ADM.verticalAoEditar("  clínica   odontológica ", "Clínica odontológica", "generico"), "generico", "espaço/caixa não é mudança");
  assert.equal(ADM.verticalAoEditar("", "Clínica odontológica", "oficina"), "oficina");
  assert.equal(ADM.verticalAoEditar("Clínica odontológica", "Loja de roupas", "loja"), ADM.verticalPorSegmento("Clínica odontológica"), "mudou: recalcula");
  const src = readFileSync(resolve(RAIZ, "web/app/admin.js"), "utf8");
  assert.match(src, /vertical: verticalAoEditar\(d\.segmento, segmentoInicial, cli\.vertical\)/);
  assert.match(src, /Ao salvar, passa a usar o modelo/, "o aviso de troca continua");
});

test("revisão 6 · Admin: a lista filtrada por «Ativo» segue a régua do contador (pausado pela Nexus não entra)", () => {
  const l = [{ id: 1, status: "ativo", ativo: true }, { id: 2, status: "ativo", ativo: false }, { id: 3, status: "ativo" }];
  assert.equal(ADM.resumoClientes(l).ativo, 2);
  assert.deepEqual(ADM.filtrarLocal(l, "", "ativo").map(x => x.id), [1, 3], "o mesmo número do KPI");
  assert.equal(ADM.filtrarLocal(l, "", "").length, 3);
  assert.deepEqual(ADM.filtrarLocal(l, "pausados").map(x => x.id), [2]);
  assert.match(readFileSync(resolve(RAIZ, "web/app/admin.js"), "utf8"), /filtrarLocal\(todosDoFiltro, filtro\.local, filtro\.status\)/);
});

test("revisão 7 · Números: «Ligar na IA» / «Receber no Órbita» com a consulta ao aparelho falhando não ficam em «Conferindo o aparelho…»", () => {
  const src = ler("web/app/cv-config.js");
  assert.equal((src.match(/await conferirDepoisDoPedido\(\);/g) || []).length, 2, "os dois botões");
  const fn = src.slice(src.indexOf("async function conferirDepoisDoPedido()"), src.indexOf("async function consultar("));
  assert.match(fn, /const r = await consultar\(\);\n\s+if \(r \|\| fechado\) return r;/);
  assert.match(fn, /statusAtual\.textContent = "Não deu para conferir o aparelho agora\./);
  assert.match(fn, /desenharPassos\(\);/);
});

test("revisão 8 · AS-265 interruptor (checkbox role=switch dentro de label): nome acessível de um elemento só", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const c = ui.campo({ rotulo: "Receber por e-mail", nome: "email_ok", tipo: "interruptor", valor: true });
    const inp = c.querySelector("input");
    const txt = c.querySelector(".check-txt");
    assert.equal(inp.getAttribute("role"), "switch");
    assert.ok(txt.getAttribute("id"));
    assert.equal(inp.getAttribute("aria-labelledby"), txt.getAttribute("id"));
    assert.equal(textoDe(txt), "Receber por e-mail");
  } finally { d.fim(); }
  const src = ler("web/app/config.js");
  assert.match(src, /role: "switch", checked: !!u\[chave\], disabled: !u\.editavel, "aria-labelledby": `\$\{id\}-rot`/);
  assert.match(src, /h\("span", \{ class: "sr-only", id: `\$\{id\}-rot` \}, `\$\{rotulo\}: \$\{u\.nome\}`\)/);
  assert.match(src, /role: "switch", checked: ligado, "aria-labelledby": `\$\{id\}-rot`/);
});

test("revisão 9 · AS-272 convite «Enviar pela central»: abre Conversas com ?texto= (até 1000), que só preenche o campo — nunca envia", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    let recebido = null;
    const b = ui.blocoLink("https://x/convite/abc", { rotulo: "Link do convite", textoWhats: "Olá!", central: t => { recebido = t; } });
    const bt = b.querySelectorAll("button").find(x => /Enviar pela central/.test(x.textContent));
    assert.ok(bt);
    bt.dispatchEvent(new d.Evento("click"));
    assert.equal(recebido, "Olá!\nhttps://x/convite/abc");
    assert.equal(ui.blocoLink("https://x").querySelectorAll("button").some(x => /central/.test(x.textContent)), false, "sem central: sem botão");
  } finally { d.fim(); }
  const CV2 = await import("../web/app/conversas.js");
  assert.equal(CV2.textoProntoDaRota({ texto: "a".repeat(1500) }).length, 1000);
  assert.equal(CV2.textoProntoDaRota({ texto: "  " }), "");
  assert.equal(CV2.textoProntoDaRota({}), "");
  assert.equal(CV2.textoProntoDaRota({ texto: "oi\r\nlink" }), "oi\nlink");
  const conv = ler("web/app/conversas.js");
  assert.match(conv, /if \(textoPronto\) colocarTextoPronto\(id, textoPronto\);/);
  assert.match(conv, /A\.composer\.devolverTexto\(texto\);/, "preenche o campo");
  assert.match(conv, /if \(textoPronto\) copiarTextoPronto\(textoPronto, \{ limparRota: true \}\);/, "sem conversa: copia e avisa");
  const fnTexto = conv.slice(conv.indexOf("function colocarTextoPronto("), conv.indexOf("async function abrirPorContato("));
  assert.doesNotMatch(fnTexto, /nx_cv_enviar|rpcC|api\.fn|\.enviar\(/, "nada é enviado");
  // plano 1000b: UB-199 — o convite (com o token) não vai mais no endereço: copia o texto e abre #/conversas (teste em plano1000b-config)
  assert.doesNotMatch(ler("web/app/config.js"), /#\/conversas\?texto=/);
  assert.match(ler("web/app/config.js"), /ctx\.navegar\("#\/conversas"\)/);
});

test("revisão 10 · SV-128 «Sair de todos os aparelhos» chama nx_sessoes_encerrar (com confirmação); erro avisa e não sai; servidor antigo cai no nx_sair_todas", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    for (const caso of ["ok", "erro", "antigo"]) {
      let saiu = 0;
      const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => {
        if (n === "nx_sessoes_encerrar") {
          if (caso === "erro") throw Object.assign(new Error("Sem conexão."), { codigo: "sem_conexao" });
          if (caso === "antigo") throw Object.assign(new Error("Could not find the function public.nx_sessoes_encerrar"), { codigo: "PGRST202" });
          return { ok: true, encerradas: 2 };
        }
        return {};
      } });
      t.ctx.shell.sair = async () => { saiu++; };
      await cfg.montar(t.ctx); await tique(6);
      botaoTexto(t.ctx.alvo, /Sair de todos os aparelhos/).dispatchEvent(new d.Evento("click")); await tique(8);
      assert.equal(t.confirmacoes.at(-1).perigo, true, caso);
      const enc = t.chamadas.filter(c => c[0] === "nx_sessoes_encerrar");
      assert.equal(enc.length, 1, caso); assert.equal(enc[0][1].p_todas, true);
      if (caso === "ok") { assert.equal(saiu, 1); assert.match(t.toasts.at(-1)[0], /outros aparelhos foram encerradas/); }
      if (caso === "erro") { assert.equal(saiu, 0, "não sai: os outros aparelhos seguiriam conectados"); assert.equal(t.toasts.at(-1)[1].tipo, "erro"); }
      if (caso === "antigo") { assert.equal(t.chamadas.filter(c => c[0] === "nx_sair_todas").length, 1); assert.equal(saiu, 1); }
      cfg.desmontar();
      d.doc.body.removeChild(t.ctx.alvo);
    }
  } finally { d.fim(); }
});
