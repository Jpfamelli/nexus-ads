/* ÓRBITA — plano 1500c (21/10/2026), frente auto (Automações) · lotes auto-a1 e auto-a2.
   Rodar: node --test testes/plano1500c-auto.teste.mjs
   Lógica pura + contratos com a migração vigente + comportamento num DOM de mentira (o mesmo do plano1000b-auto).
   Cada teste cita o item (UCA-xxx). Sem rede: RPCs são dublês; datas relativas a Date.now() (não depende da hora do dia). */
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
const digitar = (d, el, v) => { el.value = v; el.dispatchEvent(new d.Evento("input")); };
const clicar = (d, el) => el.dispatchEvent(new d.Evento("click"));

/* ================================================================== auxiliares deste arquivo */

const VOCAB_V = { ...VOCAB, min: k => ({ contato: "paciente", negocio: "oportunidade" }[k] || k), art: () => "a", um: () => "uma" };
async function abrirTela(d, { partes = [], query = {}, dados = dadosLista(), rpcExtra = {}, confirmar, extra = {}, fn } = {}) {
  const ui = await uiReal();
  const A = await import("../web/app/automacoes.js");
  const chamadas = [];
  const t = ctxAuto(ui, { partes, query, confirmar, fn, extra, rpc: async (nome, p) => { chamadas.push([nome, p]); return rpcLista(dados, rpcExtra)(nome, p); } });
  await A.montar(t.ctx); await tique(4);
  return { ...t, A, ui, chamadas, raiz: t.ctx.alvo };
}
const execsFalsas = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, criado_em: new Date(Date.now() - (i % 3) * 3 * 86400e3).toISOString(), status: i % 2 ? "ok" : "erro" }));

/* ================================================================== plano 1500c · frente auto */

import * as CAT from "../web/app/auto-catalogo.js";
import * as VOC from "../web/app/vocab.js";
import { readdirSync } from "node:fs";

const tarefa = () => ({ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" });
const naEtapa = (extra = {}) => ({ nome: "x", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [tarefa()], ...extra });
const valida = a => L.validar(a, { base: BASE, ligar: false });
const BASE2 = { ...BASE, funis: [...BASE.funis, { id: U(2), nome: "Retorno", estagios: [{ id: U(21), nome: "Primeira", tipo: "aberto" }] }] };

/* ---------------------------------------------------------------- (a) lógica pura */

test("UCA-001 condição por campanha e plataforma do anúncio (operadores e frases do servidor)", () => {
  assert.ok(L.CAMPOS_CONDICAO.some(c => c.id === "campanha") && L.CAMPOS_CONDICAO.some(c => c.id === "plataforma"));
  assert.deepEqual(L.operadoresDe("campanha"), ["contem", "nao_contem", "vazio", "preenchido"]);
  assert.deepEqual(L.operadoresDe("plataforma"), ["igual", "diferente", "vazio", "preenchido"]);
  assert.equal(valida(naEtapa({ condicoes: [{ campo: "campanha", op: "igual", valor: "a" }] })).motivo, "condição 1: para a campanha use «contém» ou «não contém»");
  assert.equal(valida(naEtapa({ condicoes: [{ campo: "plataforma", op: "igual", valor: "tiktok" }] })).motivo, "condição 1: escolha a plataforma (Meta ou Google)");
  assert.equal(valida(naEtapa({ condicoes: [{ campo: "plataforma", op: "igual", valor: "meta" }] })).ok, true);
  assert.match(L.descrever(naEtapa({ condicoes: [{ campo: "plataforma", op: "igual", valor: "meta" }] }), BASE, VOCAB), /se a plataforma for «Meta»/);
  assert.deepEqual(L.limpar(naEtapa({ condicoes: [{ campo: "campanha", op: "contem", valor: "Black" }] })).condicoes, [{ campo: "campanha", op: "contem", valor: "Black" }], "limpar não descarta mais a condição");
});

test("UCA-002 «Tarefa vencida» filtra por tipo e por pessoa (limpar guarda, frase e validação)", () => {
  assert.deepEqual(L.GATILHO.tarefa_vencida.campos.map(c => c.nome), ["tipo_tarefa", "dono_id"]);
  const a = { nome: "x", gatilho: "tarefa_vencida", config: { tipo_tarefa: "ligacao", dono_id: U(41) }, condicoes: [], acoes: [tarefa()] };
  assert.deepEqual(L.limpar(a).config, { tipo_tarefa: "ligacao", dono_id: U(41) }, "antes o limpar apagava os filtros");
  assert.match(L.descrever(a, BASE, VOCAB), /^Quando uma ligação de «Ana Lima» vencer sem ser concluída/);
  assert.equal(valida({ ...a, config: { dono_id: U(99) } }).motivo, "a pessoa escolhida em «Quando» não tem mais acesso");
});

test("UCA-003 execução «filtrada» é «pulada» com o porquê", () => {
  assert.equal(L.situacaoExecucao({ estado: "filtrada" }), "pulado");
  assert.equal(L.estadoExecucaoTexto({ estado: "filtrada" }), "Não passou nas condições: nada foi feito");
});

test("UCA-005 + UCA-006 frase das condições e real com milhar", () => {
  assert.equal(L.fraseCondicoes([{ campo: "valor", op: "maior", valor: 1500 }, { campo: "plataforma", op: "igual", valor: "google" }], BASE),
    "o valor for maior que «R$ 1.500,00» e a plataforma for «Google»");
  assert.equal(L.brl("1.500,50"), "R$ 1.500,50");
  assert.equal(L.brl(1500), "R$ 1.500,00");
});

test("UCA-007 {{1}} do modelo não é variável desconhecida; sugestão normaliza o nome", () => {
  assert.deepEqual(L.variaveisDesconhecidas("Oi {{1}} {nome_x} {primeiro_nome}"), ["nome_x"]);
  assert.equal(L.sugestaoVariavel("Primeiro Nome"), "primeiro_nome");
});

test("UCA-009 + UCA-010 duração total ignora o que vem depois de «parar»; «1,5 hora» = 90 min", () => {
  assert.equal(L.duracaoTotal([{ tipo: "esperar", minutos: 60 }, { tipo: "parar" }, { tipo: "esperar", minutos: 60 }]), 60);
  assert.equal(L.comporDuracao("1,5", "horas"), 90);
  assert.equal(L.comporDuracao("2", "dias"), 2880);
});

test("UCA-012..016 cadeias: etiqueta pelo nome, funil novo, ganho, laço de 3 com caminho e laço consigo mesma", () => {
  const ET = { id: "et", nome: "ET", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(11) }, condicoes: [], acoes: [{ tipo: "etiquetar", etiqueta_nome: "orçamento" }] };
  const E = { id: "e", nome: "E", ativo: true, gatilho: "etiqueta_adicionada", config: { etiqueta_id: U(31) }, condicoes: [], acoes: [tarefa()] };
  assert.deepEqual(L.cadeiasDeAutomacao(ET, [ET, E], BASE).map(c => c.outra.id), ["e"], "UCA-012");
  const F = { id: "f", nome: "F", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "mover_funil", funil_id: U(2) }] };
  const F2 = { id: "f2", nome: "F2", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(21) }, condicoes: [], acoes: [tarefa()] };
  assert.deepEqual(L.cadeiasDeAutomacao(F, [F, F2], BASE2).map(c => c.outra.id), ["f2"], "UCA-013: mover de funil cai na 1ª etapa");
  const N = { id: "n", nome: "N", ativo: true, gatilho: "conversa_nova", config: {}, condicoes: [], acoes: [{ tipo: "criar_negocio", funil_id: U(2) }] };
  const NC = { id: "nc", nome: "NC", ativo: true, gatilho: "negocio_criado", config: {}, condicoes: [], acoes: [tarefa()] };
  assert.ok(L.cadeiasDeAutomacao(N, [N, NC], BASE2).some(c => c.outra.id === "nc"), "UCA-013: criar negócio dispara «criado»");
  const BG = { ...BASE, funis: [{ ...BASE.funis[0], estagios: [...BASE.funis[0].estagios, { id: U(14), nome: "Fechou", tipo: "ganho" }] }] };
  const M = { id: "m", nome: "M", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "mover_estagio", estagio_id: U(14) }] };
  const G = { id: "g", nome: "G", ativo: true, gatilho: "negocio_ganho", config: {}, condicoes: [], acoes: [tarefa()] };
  assert.deepEqual(L.cadeiasDeAutomacao(M, [M, G], BG).map(c => c.outra.id), ["g"], "UCA-014");
  const C1 = { id: "c1", nome: "C1", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(11) }, condicoes: [], acoes: [{ tipo: "mover_estagio", estagio_id: U(12) }] };
  const C2 = { id: "c2", nome: "C2", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(12) }, condicoes: [], acoes: [{ tipo: "mover_estagio", estagio_id: U(13) }] };
  const C3 = { id: "c3", nome: "C3", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "mover_estagio", estagio_id: U(11) }] };
  const c = L.cadeiasDeAutomacao(C1, [C1, C2, C3], BASE)[0];
  assert.equal(c.laco, true, "UCA-015: laço de 3");
  assert.deepEqual(c.caminho, ["C1", "C2", "C3"]);
  assert.equal(L.fraseLaco(c), "Laço: «C1» → «C2» → «C3» → volta para esta. Elas podem rodar sem parar.");
  const S = { id: "s", nome: "S", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "mover_estagio", estagio_id: U(12) }, { tipo: "mover_estagio", estagio_id: U(13) }] };
  assert.equal(L.cadeiasDeAutomacao(S, [S], BASE)[0].autoLaco, true, "UCA-016");
});

test("UCA-017 + UCA-018 + UCA-022 + UCA-111 + UCA-112 avisos de estrutura dizem o passo", () => {
  const tipos = a => L.avisosEstruturaDetalhados(a, VOCAB).map(x => x.tipo);
  assert.ok(tipos({ gatilho: "mensagem_recebida", config: {}, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "oi" }] }).includes("toda_mensagem"));
  assert.ok(!tipos({ gatilho: "mensagem_recebida", config: { palavras: ["preço"] }, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "oi" }] }).includes("toda_mensagem"));
  assert.ok(tipos({ gatilho: "agendado", config: { horario: "09:00" }, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "oi" }] }).includes("massa_diaria"));
  assert.deepEqual(L.avisosEstrutura(naEtapa({ acoes: [{ tipo: "resolver_conversa" }] })), ["O passo 1 só funciona quando existe conversa aberta com o contato; sem ela, é pulado."]);
  assert.deepEqual(L.avisosEstrutura(naEtapa({ acoes: [{ tipo: "esperar", minutos: 60 }, { tipo: "esperar", minutos: 60 }, tarefa()] })), ["Os passos 1 e 2 são esperas seguidas (somam 2 h): o tempo delas se soma."]);
  assert.deepEqual(L.avisosEstrutura(naEtapa({ acoes: [{ tipo: "esperar", minutos: 60, cancelar_se_cliente_responder: false }, { tipo: "enviar_mensagem", texto: "x" }] })),
    ["A espera do passo 1 não para quando o cliente responde: quem responder ainda vai receber a mensagem do passo 2."]);
});

test("UCA-019 + UCA-020 + UCA-021 condições impossíveis, texto fora de mensagem e maior/menor sem número", () => {
  assert.deepEqual(L.condicoesContraditorias([{ campo: "valor", op: "maior", valor: 100 }, { campo: "valor", op: "menor", valor: 50 }]).map(x => [x.i, x.j]), [[0, 1]]);
  assert.match(L.avisosEstrutura(naEtapa({ condicoes: [{ campo: "valor", op: "maior", valor: 100 }, { campo: "valor", op: "menor", valor: 50 }] }))[0], /nunca valem juntas/);
  assert.ok(!L.camposCondicao(BASE, VOCAB, "negocio_estagio").some(c => c.valor === "texto"), "texto só nos gatilhos de mensagem");
  assert.ok(L.camposCondicao(BASE, VOCAB, "mensagem_recebida").some(c => c.valor === "texto"));
  assert.ok(L.camposCondicao(BASE, VOCAB, "negocio_estagio", "texto").some(c => c.valor === "texto"), "a condição antiga continua visível para ser trocada");
  assert.match(L.avisosEstrutura(naEtapa({ condicoes: [{ campo: "texto", op: "contem", valor: "a" }] }))[0], /^Condição 1: o texto da mensagem só existe/);
  assert.equal(valida(naEtapa({ condicoes: [{ campo: "valor", op: "maior", valor: "abc" }] })).ok, false);
});

test("UCA-023 + UCA-024 + UCA-025 palavras sem repetição, fim de semana e «sem resposta» legível", () => {
  assert.deepEqual(L.limpar({ nome: "x", gatilho: "mensagem_recebida", config: { palavras: ["Preço", "preco", "valor"] }, condicoes: [], acoes: [tarefa()] }).config.palavras, ["Preço", "valor"]);
  assert.equal(L.frasePeriodo([5, 6, 0]), "de sexta a domingo");
  assert.equal(L.frasePeriodo([6, 0]), "aos sábados e domingos");
  assert.match(L.descrever({ nome: "x", gatilho: "sem_resposta", config: { minutos: 90 }, condicoes: [], acoes: [tarefa()] }, BASE, VOCAB), /sem resposta há 1 h 30 min/);
});

test("UCA-026 + UCA-027 erro e taxa na régua dos 30 dias quando o servidor manda", () => {
  assert.equal(L.temErro({ execucoes: 10, erros: 5, ok_30d: 3, erro_30d: 0 }, "30d"), false, "5 erros antigos não contam");
  assert.equal(L.temErro({ execucoes: 10, erros: 5 }, "total"), true);
  assert.deepEqual(L.taxaSucesso({ execucoes: 300, erros: 3, ok_30d: 2, erro_30d: 3 }, { periodo: "30d" }), { total: 5, ok: 2, erros: 3, pct: 40 });
  const l = [{ id: 1, erros: 9, ok_30d: 5, erro_30d: 0 }, { id: 2, erros: 1, ok_30d: 5, erro_30d: 1 }];
  assert.deepEqual(L.listaAutomacoes(l, { ordem: "erros" }).map(x => x.id), [2, 1]);
});

test("UCA-034 + UCA-035 execuções em CSV para o Excel brasileiro e nome de arquivo seguro", () => {
  const csv = L.execucoesParaCSV([{ id: 1, criado_em: "2026-10-01T15:00:00Z", status: "erro", detalhe: "=SOMA(1)", passo: 2 }], { vocab: VOCAB });
  assert.equal(csv.charCodeAt(0), 0xFEFF, "BOM para o Excel ler acentos");
  const linhas = csv.slice(1).split(String.fromCharCode(13, 10));
  assert.equal(linhas[0], "Data;Hora;Situação;Passo;Paciente;Oportunidade;O que aconteceu");
  assert.match(linhas[1], /^01\/10\/2026;12:00;Com erro;Passo 2;/, "data e hora de São Paulo");
  assert.match(linhas[1], /;'=SOMA\(1\)$/, "fórmula protegida");
  assert.equal(L.nomeArquivo("Lembrete de Consulta! ção"), "lembrete-de-consulta-cao");
});

test("UCA-038 + UCA-039 + UCA-041 trocar unidade mantém o tempo, resumo legível e duplicar passo", () => {
  assert.equal(L.converterUnidade(48, "horas", "dias"), 2);
  assert.equal(L.converterUnidade(2, "horas", "dias"), null, "não inteiro: mantém o número");
  assert.equal(L.resumoTempo(10080), "= 7 dias (168 h)");
  assert.equal(L.resumoTempo(90), "= 1 h 30 min");
  assert.deepEqual(L.duplicarPasso([{ tipo: "a" }, { tipo: "b" }], 0), [{ tipo: "a" }, { tipo: "a" }, { tipo: "b" }]);
  const cheia = Array.from({ length: L.LIMITES.acoes }, () => tarefa());
  assert.equal(L.duplicarPasso(cheia, 0).length, cheia.length, "no limite não duplica");
});

test("UCA-047 palavra inteira (pura): «preço» não casa dentro de «preçomaior»", () => {
  assert.ok(L.casaPalavras("quero o preço", ["preço"], { inteira: true }));
  assert.ok(!L.casaPalavras("preçomaior", ["preço"], { inteira: true }));
});

test("UCA-054 filtrar execuções por situação e passo", () => {
  const l = [{ status: "erro", criado_em: new Date().toISOString(), passo: 2 }, { status: "ok", criado_em: new Date().toISOString(), passo: 1 }];
  assert.equal(L.filtrarExecucoes(l, { situacao: "erro" }).length, 1);
  assert.equal(L.filtrarExecucoes(l, { passo: 1 }).length, 1);
});

test("UCA-057 + UCA-058 teste com exemplo fictício e receita sugerida pelas 3 perguntas", () => {
  const s = L.simulacaoDemonstracao(naEtapa({ acoes: [{ tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}" }] }), BASE, VOCAB);
  assert.equal(s.ehExemplo, true);
  assert.deepEqual(s.alvos.map(a => a.titulo), ["Maria Souza", "João Lima"]);
  assert.equal(s.alvos[0].passos[0].rotulo, "Enviar: «Oi Maria»");
  assert.deepEqual(L.PERGUNTAS_PRIMEIRA.map(p => p.id), ["objetivo", "quem", "canal"]);
  assert.equal(L.receitaSugerida({ objetivo: "lembrar", quem: "cliente", canal: "texto" }, "odonto"), "lembrete_consulta_texto");
  assert.equal(L.receitaSugerida({ objetivo: "lead", quem: "equipe" }, "loja"), "lead_anuncio");
});

test("UCA-059..064 + UCA-066 receitas novas válidas e «Recomendado para começar» no genérico", () => {
  for (const id of ["reengajar_perdido", "boas_vindas", "valor_alto", "tarefa_atrasada", "pediu_desmarcar", "agradecer_indicar"]) {
    const m = L.MODELOS.find(x => x.id === id);
    assert.ok(m, id);
    const a = L.aplicarModelo(m, BASE, VOCAB);
    assert.equal(L.validar(a, { base: BASE, ligar: false }).ok, true, `${id}: ${L.validar(a, { base: BASE, ligar: false }).motivo}`);
  }
  assert.ok(!L.modelosDaVertical("loja").some(m => m.id === "pediu_desmarcar"));
  const sel = L.modelosDaVertical("generico").filter(m => L.seloModelo(m, "generico"));
  assert.ok(sel.length >= 2 && sel.length <= 4);
  assert.equal(L.seloModelo(sel[0], "generico"), "Recomendado para começar");
  for (const v of ["odonto", "oficina", "loja"]) assert.ok(L.modelosDaVertical(v).filter(m => L.seloModelo(m, v)).length <= 4, v);
});

test("UCA-070 + UCA-093 ordem «Por gatilho» em grupos e busca pela descrição", () => {
  const l = [{ id: 1, gatilho: "agendado", nome: "b" }, { id: 2, gatilho: "conversa_nova", nome: "a" }, { id: 3, gatilho: "negocio_estagio", nome: "c" }];
  assert.deepEqual(L.listaAutomacoes(l, { ordem: "gatilho" }).map(x => x.id), [2, 3, 1]);
  assert.deepEqual(L.agruparPorGatilho([...l, { id: 4, gatilho: "zzz" }]).map(g => [g.grupo, g.itens.length]), [["Conversas", 1], ["CRM", 1], ["Agenda", 1], ["Outros", 1]]);
  assert.equal(L.listaAutomacoes([{ id: 1, nome: "x", descricao: "lembrete dos pacientes" }], { termo: "lembrete" }).length, 1);
});

test("UCA-071 + UCA-072 erros do servidor com o que fazer e pessoa sem acesso no passo", () => {
  assert.match(L.erroAutomacao({ codigo: "automacao_nao_encontrada" }, "x"), /excluída por outra pessoa/);
  assert.match(L.erroAutomacao({ codigo: "limite_plano" }, "x"), /Desligar não libera vaga/);
  assert.match(L.erroAutomacao({ codigo: "sem_permissao" }, "x", BASE.usuarios), /Peça a Bruno Reis \(administrador da empresa\)/);
  assert.equal(valida(naEtapa({ acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: U(99) }] })).motivo, "ação 1: a pessoa escolhida não tem mais acesso; escolha outra");
});

test("UCA-073 + UCA-085 texto da IA sem «você definiu» e índice da base reaproveitado", () => {
  assert.doesNotMatch(L.ACAO.ia_decidir.descricao, /você definiu/);
  assert.equal(L.indexarBase(BASE), L.indexarBase(BASE), "mesma base, mesmo índice");
  assert.notEqual(L.indexarBase(BASE), L.indexarBase({ ...BASE, etiquetas: [] }));
});

test("UCA-087 + UCA-088 etapa de outro funil e outra automação que manda mensagem no mesmo gatilho", () => {
  assert.equal(L.avisoEtapaOutroFunil(naEtapa(), { tipo: "mover_estagio", estagio_id: U(21) }, BASE2), "Essa etapa é do funil «Retorno»; para trocar de funil, use «Mover de funil».");
  assert.equal(L.avisoEtapaOutroFunil(naEtapa(), { tipo: "mover_estagio", estagio_id: U(12) }, BASE2), null);
  const msg = [{ tipo: "enviar_mensagem", texto: "x" }];
  const outras = [{ id: "b", nome: "B", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: msg },
    { id: "c", nome: "C", ativo: true, gatilho: "negocio_estagio", config: { estagio_id: U(12) }, acoes: msg },
    { id: "d", nome: "D", ativo: false, gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: msg }];
  assert.deepEqual(L.automacoesConcorrentes({ id: "a", ...naEtapa({ acoes: msg }) }, outras), [{ id: "b", nome: "B" }]);
});

test("UCA-092 + UCA-099 histórico de edição e prévia com a formatação do WhatsApp", () => {
  const h = L.historicoEdicao(3);
  h.empilhar({ a: 1 }); h.empilhar({ a: 2 });
  assert.equal(h.podeDesfazer(), true);
  assert.deepEqual(h.desfazer(), { a: 1 });
  assert.deepEqual(h.refazer(), { a: 2 });
  assert.deepEqual(L.partesWhatsApp("*a* _b_ ~c~ ```d```").filter(p => p.estilo).map(p => [p.t, p.estilo]), [["a", "negrito"], ["b", "italico"], ["c", "riscado"], ["d", "mono"]]);
  assert.deepEqual(L.partesWhatsApp("5 * 3").map(p => p.estilo), [null], "asterisco solto não vira negrito");
});

test("UCA-100 + UCA-101 dado pessoal (CNPJ, nascimento) e recentes que expiram", () => {
  assert.deepEqual(L.dadosPessoaisNoPedido("cnpj 12.345.678/0001-90 nasceu 10/05/1990").map(x => x.tipo), ["CNPJ", "data de nascimento"]);
  assert.equal(L.dadosPessoaisNoPedido(`reunião dia 10/05/${new Date().getFullYear()}`).length, 0, "data deste ano não é nascimento");
  const r = L.pedidosRecentes([{ texto: "a", em: Date.now() }, { texto: "b", em: Date.now() - 40 * 864e5 }], "c", { max: 5 });
  assert.deepEqual(r.map(x => x.texto), ["c", "a"], "o de 40 dias some");
});

test("UCA-103 exportar/importar entre clientes pelo nome", () => {
  const a = { nome: "A", gatilho: "etiqueta_adicionada", config: { etiqueta_id: U(31) }, condicoes: [], acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: U(41) }] };
  const x = L.exportarAutomacao(a, BASE);
  assert.equal(x.formato, "orbita-automacao");
  assert.deepEqual(x.auto.config.etiqueta_id, { $tipo: "etiquetas", $nome: "Orçamento" });
  const ok = L.importarAutomacao(JSON.stringify(x), { ...BASE, etiquetas: [{ id: "zz", nome: "orçamento" }] });
  assert.equal(ok.auto.config.etiqueta_id, "zz");
  assert.equal(ok.auto.ativo, false, "nasce desligada");
  assert.deepEqual(ok.pendencias, []);
  const falta = L.importarAutomacao(x, { ...BASE, etiquetas: [], usuarios: [] });
  assert.equal(falta.pendencias.length, 2);
});

test("UCA-105 + UCA-106 + UCA-113 tempo poupado, texto para compartilhar e estimativa diária", () => {
  assert.deepEqual(L.tempoEconomizado([{ mensagens_30d: 30, acoes: [{ tipo: "enviar_mensagem" }] }]), { minutos: 60, texto: "1 h" });
  assert.equal(L.tempoEconomizado([{}]), null, "sem o dado do servidor, nada");
  const t = L.textoParaCompartilhar(naEtapa({ nome: "A" }), BASE, VOCAB);
  assert.match(t, /^A/);
  assert.match(t, /Passo a passo:/);
  assert.deepEqual(L.estimativaDiaria([{ total: 2 }, { total: 4 }, { total: 0 }]), { media: 2, pico: 4, texto: "cerca de 2 mensagens por dia (pico de 4)" });
  assert.equal(L.estimativaDiaria([]), null);
});

test("UCA-110 + UCA-121 respeitar horário só com mensagem; «Todo dia» diz o funil da etapa", () => {
  assert.equal(L.limpar(naEtapa({ respeitar_horario: true })).respeitar_horario, false);
  assert.equal(L.limpar(naEtapa({ respeitar_horario: true, acoes: [{ tipo: "enviar_mensagem", texto: "x" }] })).respeitar_horario, true);
  const ag = { nome: "x", gatilho: "agendado", config: { horario: "09:00", dias_semana: [1, 2], estagio_id: U(13) }, condicoes: [], acoes: [tarefa()] };
  assert.match(L.descrever(ag, BASE2, VOCAB), /na etapa «Avaliou \/ orçamento» \(funil «Pacientes»\)/);
  assert.doesNotMatch(L.descrever(ag, BASE, VOCAB), /\(funil/, "com um funil só, não precisa");
});

test("UCA-123 teste mostra quando a mensagem sai de verdade com «Respeitar horário»", () => {
  // o dia de hoje (em São Paulo) fica fechado: a mensagem sempre cai num dia seguinte, a qualquer hora que o teste rodar
  const hoje = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date())];
  const horario = {};
  for (let d = 0; d < 7; d++) if (d !== hoje) horario[d] = [["08:00", "18:00"]];
  const auto = { respeitar_horario: true, acoes: [{ tipo: "enviar_mensagem", texto: "x" }] };
  const r = L.normalizarSimulacao({ alvos: [{ titulo: "Maria", passos: [{ tipo: "enviar_mensagem", texto: "Oi" }] }] }, auto, BASE, VOCAB, { horario, agora: Date.now() });
  assert.match(r.alvos[0].passos[0].quando, /^sai .+ \(no horário de atendimento\)$/);
  const sem = L.normalizarSimulacao({ alvos: [{ titulo: "Maria", passos: [{ tipo: "enviar_mensagem", texto: "Oi" }] }] }, { ...auto, respeitar_horario: false }, BASE, VOCAB, { horario, agora: Date.now() });
  assert.equal(sem.alvos[0].passos[0].quando, "");
});

/* ---------------------------------------------------------------- (b) contratos com o servidor */

function corpoVigente(nome) {
  const pasta = resolve(RAIZ, "supabase", "migrations");
  const marca = `create or replace function public.${nome}(`;
  for (const arq of readdirSync(pasta).filter(a => a.endsWith(".sql")).sort().reverse()) {
    const sql = readFileSync(resolve(pasta, arq), "utf8");
    const i = sql.lastIndexOf(marca);
    if (i < 0) continue;
    const fim = sql.indexOf("end $$;", i);
    return { arquivo: arq, sql: sql.slice(i, fim > i ? fim : undefined), inteiro: sql };
  }
  throw new Error(`nenhuma migração define ${nome}`);
}

test("UCA-107 contrato catálogo × nx_auto_normalizar (gatilhos, campos de condição e config por gatilho)", () => {
  const { sql, arquivo } = corpoVigente("nx_auto_normalizar");
  const lista = /v_gat not in \(([^)]*)\)/.exec(sql);
  assert.ok(lista, `${arquivo}: lista de gatilhos`);
  const doServidor = [...lista[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(L.GATILHOS.map(g => g.id).sort(), doServidor, "gatilhos do front = gatilhos aceitos");
  const campos = [...sql.matchAll(/when v_campo = '([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(L.CAMPOS_CONDICAO.map(c => c.id).filter(id => !id.includes(".")).sort(), campos, "campos de condição");
  // config por gatilho: as chaves que o servidor guarda (jsonb_build_object('chave', …)) são os campos do catálogo
  const ini = sql.indexOf("case v_gat"), fim = sql.indexOf("end case;", ini);
  const blocos = sql.slice(ini, fim).split(/\n\s*when /).slice(1);
  for (const b of blocos) {
    const gats = [...b.slice(0, b.indexOf(" then")).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    const chaves = [...b.matchAll(/(?<!p_cliente,\s*)'([a-z_]+)',\s*(?=public\.|c ->>|n\b|v_id|w\b|case|coalesce|nullif)/g)].map(m => m[1]);
    for (const g of gats) {
      const front = (L.GATILHO[g].campos || []).map(c => c.nome);
      for (const k of chaves) assert.ok(front.includes(k), `${g}: o servidor guarda «${k}», o catálogo não tem o campo`);
      for (const k of front) assert.ok(chaves.includes(k), `${g}: o catálogo tem «${k}», o servidor descarta`);
    }
  }
});

test("UCA-108 toda frase de nx_auto_falha da migração vigente cai num bloco da tela (ondeDoHint)", () => {
  const { inteiro, arquivo } = corpoVigente("nx_auto_normalizar");
  const frases = [...inteiro.matchAll(/nx_auto_falha\(\s*(?:p \|\| )?'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'"));
  assert.ok(frases.length > 20, `${arquivo}: frases`);
  // «dados da automação inválidos» é o pacote inteiro (não há bloco); «ação » || n é só o começo de uma frase montada
  const soltas = frases.filter(f => f !== "dados da automação inválidos" && !/^(ação|condição) $/.test(f)).filter(f => {
    const cands = f.startsWith(":") ? [`ação 1${f}`, `condição 1${f}`] : [f];
    return cands.every(c => L.ondeDoHint(c).onde === null);
  });
  assert.deepEqual(soltas, [], "frases sem bloco: a tela mostraria um erro genérico");
});

test("UCA-109 limpar() é idempotente e não perde campo aceito pelo servidor (receitas das 4 verticais e fixtures)", () => {
  for (const v of VOC.VERTICAIS) {
    const vv = VOC.vocab(v);
    for (const m of L.modelosDaVertical(v)) {
      const x = L.limpar(L.aplicarModelo(m, BASE, vv));
      assert.deepEqual(L.limpar(x), x, `${v}/${m.id}`);
    }
  }
  const fixtures = [
    { nome: "a", gatilho: "tarefa_vencida", config: { tipo_tarefa: "ligacao", dono_id: U(41) }, condicoes: [], acoes: [tarefa()] },
    { nome: "b", gatilho: "sem_resposta", config: { minutos: 30, departamento_id: U(51), so_no_horario: true }, condicoes: [], acoes: [tarefa()] },
    { nome: "c", gatilho: "agendado", config: { horario: "09:00", dias_semana: [1, 2], funil_id: U(1), estagio_id: U(13) }, condicoes: [], acoes: [tarefa()] },
    naEtapa({ condicoes: [{ campo: "campanha", op: "contem", valor: "Black" }, { campo: "plataforma", op: "igual", valor: "meta" }] }),
  ];
  for (const f of fixtures) {
    const x = L.limpar(f);
    assert.deepEqual(L.limpar(x), x, f.nome);
    assert.deepEqual(Object.keys(x.config).sort(), Object.keys(f.config).sort(), `${f.nome}: nenhuma chave aceita some`);
    assert.equal(x.condicoes.length, f.condicoes.length, `${f.nome}: condições`);
  }
});

test("UCA-077 CSS sem seletores mortos (as classes .au-* do CSS existem no JS da frente)", () => {
  const css = ler("web/app/automacoes.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const js = ["automacoes.js", "auto-editor.js", "auto-pecas.js", "auto-logica.js"].map(f => ler(`web/app/${f}`)).join(" ");
  for (const morto of ["au-gd-barra", "au-ia-limite", "au-mod-limite"]) assert.ok(!new RegExp(`\\.${morto}(?![\\w-])`).test(css), morto);
  assert.ok(!/\.au-uso\[tabindex\]/.test(css));
  assert.match(css, /\.au-frase-inp \{[^}]*min-height: 44px/, "UCA-075");
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\.au-modelo:hover \{ transform: none; \}/, "UCA-076");
  assert.match(css, /forced-colors: active\) \{[^}]*\.au-dg-no:focus-visible \.au-dg-ret/, "UCA-079");
  assert.match(css, /top: calc\(var\(--topo\) \+ var\(--au-cab-h/, "UCA-078");
  void js;
});

/* ---------------------------------------------------------------- (c) peças e tela (DOM de mentira) */

async function pecas(ui) { const PE = await import("../web/app/auto-pecas.js"); return PE.pecas(ui, L); }

test("UCA-080 barra de taxa sem execuções não é medidor; com execuções continua meter", async () => {
  const d = comDom();
  try {
    const P = await pecas(await uiReal());
    const v = P.barraTaxa({ pct: null, total: 0 });
    assert.equal(v.getAttribute("role"), null);
    assert.match(v.textContent, /ainda sem execuções/);
    assert.equal(P.barraTaxa({ pct: 50, total: 2 }).getAttribute("role"), "meter");
  } finally { d.fim(); }
});

test("UCA-038 + UCA-039 campo de horas: trocar «48 horas» para dias vira «2 dias»; resumo legível", async () => {
  const d = comDom();
  try {
    const P = await pecas(await uiReal());
    const vals = [];
    const c = P.campoHoras({ rotulo: "Tempo", valor: 48, aoMudar: v => vals.push(v) });
    const inp = c.querySelector("input"), sel = c.querySelector("select");
    assert.equal(String(inp.value), "2", "48 h já abre como 2 dias");
    sel.value = "horas"; sel.dispatchEvent(new d.Evento("change"));
    assert.equal(inp.value, "48", "dias → horas mantém o tempo");
    assert.equal(vals.at(-1), 48);
    assert.equal(textoDe(c.querySelector(".au-hr-resumo")), "= 2 dias (48 h)");
  } finally { d.fim(); }
});

test("UCA-089 + UCA-017 ligar pela lista: IA confirma com a cota; disparo em massa pede «Ligar mesmo assim»", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "a5", nome: "IA classifica", gatilho: "negocio_estagio", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(13) },
      acoes: [{ tipo: "ia_decidir", tarefa: "pontuar_lead" }] });
    dados.itens.push({ id: "a6", nome: "Responde tudo", gatilho: "mensagem_recebida", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: {},
      acoes: [{ tipo: "enviar_mensagem", texto: "Oi" }] });
    const e = await abrirTela(d, { dados, confirmar: async () => false });
    clicar(d, cartao(e.raiz, "a5").querySelector(".au-sw")); await tique(4);
    assert.match(e.confirmacoes.at(-1).texto, /usa a IA a cada execução.*2 de 300 usos de IA/);
    clicar(d, cartao(e.raiz, "a6").querySelector(".au-sw")); await tique(4);
    assert.equal(e.confirmacoes.at(-1).rotulo, "Ligar mesmo assim");
    assert.match(e.confirmacoes.at(-1).texto, /^Atenção: Ela responde a toda mensagem/);
    assert.ok(!e.chamadas.some(([n]) => n === "nx_automacao_ativar"), "recusou: nada ligado");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-069 selecionar várias: «2 selecionadas» e desligar as duas numa ação", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d);
    const bt = e.raiz.querySelector(".au-sel-modo");
    assert.ok(bt, "o botão «Selecionar» existe para quem edita");
    clicar(d, bt); await tique(2);
    const caixas = e.raiz.querySelectorAll(".au-sel-chk");
    assert.equal(caixas.length, 4);
    for (const id of ["a2", "a3"]) { const c = cartao(e.raiz, id).querySelector(".au-sel-chk"); c.checked = true; c.dispatchEvent(new d.Evento("change")); }
    assert.equal(textoDe(e.raiz.querySelector(".au-sel-status")), "2 selecionadas");
    assert.equal(e.raiz.querySelector(".au-sel-status").getAttribute("role"), "status");
    clicar(d, e.raiz.querySelector('.au-sel-barra [data-acao="desligar"]')); await tique(8);
    assert.deepEqual(e.chamadas.filter(([n]) => n === "nx_automacao_ativar").map(([, p]) => [p.p_id, p.p_ativo]), [["a2", false], ["a3", false]]);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-070 «Por gatilho» mostra o título de cada grupo na lista", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ id: "a5", nome: "Boas-vindas", gatilho: "conversa_nova", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: {}, acoes: [tarefa()] },
      { id: "a6", nome: "Outra", gatilho: "conversa_nova", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: {}, acoes: [tarefa()] });
    const e = await abrirTela(d, { dados });
    const sel = e.raiz.querySelector(".au-lista-ordem");
    sel.value = "gatilho"; sel.dispatchEvent(new d.Evento("change")); await tique(2);
    assert.deepEqual(e.raiz.querySelectorAll(".au-lista-grupo-tit").map(textoDe), ["Conversas · 2", "CRM · 3", "Agenda · 1"]);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-035 excluir com execuções oferece baixar o CSV antes", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d);
    const pedidos = [];
    e.ctx.ui.modal = async o => { pedidos.push(o); return false; };
    clicar(d, cartao(e.raiz, "a3").querySelector(".au-item-mais"));
    await e.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    assert.equal(pedidos.length, 1);
    assert.deepEqual(pedidos[0].acoes.map(a => a.rotulo), ["Cancelar", "Baixar execuções (CSV)", "Excluir"]);
    assert.ok(cartao(e.raiz, "a3"), "cancelou: o cartão fica");
    // sem execuções, vai direto para o «Desfazer»
    clicar(d, cartao(e.raiz, "a4").querySelector(".au-item-mais"));
    e.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    assert.equal(pedidos.length, 1);
    assert.equal(cartao(e.raiz, "a4"), null);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-026 chip «Com erro (30 dias)» na régua do resumo", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.forEach(x => { x.ok_30d = 1; x.erro_30d = 0; });
    dados.itens[0].erros = 7;                       // erro antigo
    dados.itens[1].erros = 1; dados.itens[1].erro_30d = 1;
    const e = await abrirTela(d, { dados });
    const chip = e.raiz.querySelectorAll(".au-lista-filtro .au-chip").find(c => /^Com erro/.test(c.textContent));
    assert.equal(chip.textContent, "Com erro (30 dias) · 1");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-120 bolha da receita usa o corpo do modelo aprovado escolhido", async () => {
  const A = await import("../web/app/automacoes.js");
  const m = L.MODELOS.find(x => x.auto.acoes.some(a => a.tipo === "enviar_template"));
  assert.ok(m, "existe receita com modelo da Meta");
  const auto = { acoes: [{ tipo: "enviar_template", template_id: "t1", parametros: [] }] };
  const base = { ...BASE, templates: [{ id: "t1", status: "APPROVED", corpo: "Corpo próprio da empresa" }] };
  assert.deepEqual(A.textoBolhaReceita(m, auto, base, "odonto", {}), { texto: "Corpo próprio da empresa", sugestao: false });
  assert.equal(A.textoBolhaReceita(m, { acoes: [{ tipo: "enviar_template" }] }, BASE, "odonto", {}).sugestao, true);
});

test("UCA-011 + UCA-037 + UCA-041 + UCA-106 editor: «Automação ativa», receita nasce desligada, duplicar passo e copiar a frase", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["nova"], query: { modelo: "followup_orcamento" } });
    const sw = e.raiz.querySelector(".au-sw-caixa .au-sw");
    assert.equal(sw.getAttribute("aria-label"), "Automação ativa");
    assert.equal(sw.getAttribute("aria-checked"), "false", "a receita abre desligada: ligar é uma decisão");
    const dups = e.raiz.querySelectorAll(".au-dup");
    assert.ok(dups.length >= 1);
    assert.equal(dups[0].getAttribute("aria-label"), "Duplicar o passo 1");
    const antes = e.raiz.querySelectorAll(".au-passo").length;
    clicar(d, dups[0]); await tique(2);
    assert.equal(e.raiz.querySelectorAll(".au-passo").length, antes + 1);
    assert.ok(e.raiz.querySelector(".au-previa-cab .au-previa-copiar"), "Copiar ao lado de «Em uma frase»");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-091 editor: «Alterada por você» quando quem mexeu fui eu", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[0].atualizado_em = new Date(Date.now() - 3600e3).toISOString();
    dados.itens[0].atualizado_por = "conta-1";
    const e = await abrirTela(d, { partes: ["a1"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-ed-autor")), /^Alterada por você, /);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-004 + UCA-034 + UCA-056 execuções: busca por nome no servidor, «Baixar CSV» e «Cancelar todas» com as esperas do servidor", async () => {
  const d = comDom();
  try {
    const pedidos = [];
    const e = await abrirTela(d, { partes: ["a2"], query: { aba: "execucoes" },
      rpcExtra: { nx_automacao_execucoes: p => { pedidos.push(p); return execsFalsas(4); }, nx_automacao_execucoes_dia: async () => { throw new Error("sem"); } } });
    await tique(10);
    assert.ok(e.raiz.querySelectorAll(".bt").some(b => /Baixar CSV/.test(b.textContent)), "UCA-034");
    assert.ok(e.raiz.querySelectorAll(".bt").some(b => /Cancelar todas as esperas/.test(b.textContent)), "UCA-056: a2 tem 3 em espera no servidor");
    const busca = e.raiz.querySelector(".au-ex-busca-inp");
    assert.ok(busca, "UCA-004");
    digitar(d, busca, "Maria"); await esperar(380); await tique(6);
    assert.equal(pedidos.at(-1).p_busca, "Maria");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-058 + UCA-103 lista vazia: primeira automação em 3 perguntas e «Colar automação de outro cliente»", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { dados: dadosLista({ itens: [] }) });
    assert.ok(e.raiz.querySelector(".au-prim"), "assistente da primeira automação");
    assert.ok(e.raiz.querySelector(".au-colar"), "colar de outro cliente");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-105 KPI «Tempo poupado» só quando o servidor manda mensagens_30d", async () => {
  const d = comDom();
  try {
    let e = await abrirTela(d);
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-resumo")), /Tempo poupado/);
    e.A.desmontar();
    const dados = dadosLista();
    dados.itens[2].mensagens_30d = 30;
    e = await abrirTela(d, { dados });
    assert.match(textoDe(e.raiz.querySelector(".au-resumo")), /Tempo poupado/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-032 «Pausar envios agora» conta «Pausando 1 de 2…» para o leitor de tela", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1].acoes = [{ tipo: "enviar_mensagem", texto: "x" }];
    const soltar = [];
    const e = await abrirTela(d, { dados, rpcExtra: {} });
    const rpcAntigo = e.ctx.api.rpcC;
    e.ctx.api.rpcC = (n, p) => (n === "nx_automacao_ativar" ? new Promise(r => soltar.push(() => r({ id: p.p_id, ativo: p.p_ativo }))) : rpcAntigo(n, p));
    clicar(d, e.raiz.querySelector(".au-pausar")); await tique(4);
    const prog = e.raiz.querySelector(".au-pausa-prog");
    assert.ok(prog);
    assert.equal(prog.getAttribute("role"), "status");
    assert.equal(textoDe(prog), "Pausando 1 de 2…");
    soltar.shift()(); await tique(4);
    assert.equal(textoDe(prog), "Pausando 2 de 2…");
    soltar.shift()(); await tique(6);
    assert.equal(textoDe(prog), "");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-030 + UCA-031 receitas: mini linha do tempo no vocabulário e o modelo aplicado uma vez por receita", () => {
  const src = ler("web/app/automacoes.js");
  assert.match(src, /miniTempo\(ui, m, vv\)/, "UCA-030");
  assert.match(src, /L\.rotuloAcao\(ac\.tipo, vv \|\| \{\}\)/, "UCA-030");
  assert.match(src, /cacheReceitas\.has\(m\.id\)/, "UCA-031: cache por receita");
  assert.equal((src.match(/L\.aplicarModelo\(m, dados\.base, vv\)/g) || []).length, 1, "UCA-031: uma chamada só, dentro do cache");
});

test("UCA-074 gráfico de execuções no celular: 7 dias (alvos maiores)", async () => {
  const d = comDom();
  const mm = globalThis.matchMedia;
  try {
    globalThis.matchMedia = q => ({ matches: /max-width: 479px/.test(q), addEventListener() {}, removeEventListener() {} });
    const P = await pecas(await uiReal());
    const serie = Array.from({ length: 14 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, rotulo: `${i + 1}/10`, semana: "seg", total: 1, ok: 1, erro: 0, espera: 0, pulado: 0 }));
    const g = P.graficoDias({ serie, dias: 14, n: 14 });
    assert.equal(g.querySelectorAll(".au-gd-col").length, 7);
    assert.match(textoDe(g.querySelector(".au-gd-sub")), /Últimos 7 dias · 7 execuç/);
  } finally { globalThis.matchMedia = mm; d.fim(); }
});

test("UCA-028 + UCA-029 pulso assinado com a lista vazia e no editor de uma automação nova", async () => {
  const d = comDom();
  try {
    let assinou = 0;
    const pulso = { assinar: () => { assinou++; return () => {}; } };
    let e = await abrirTela(d, { dados: dadosLista({ itens: [] }), extra: { pulso } });
    assert.equal(assinou, 1, "UCA-028");
    e.A.desmontar();
    e = await abrirTela(d, { partes: ["nova"], extra: { pulso } });
    assert.ok(assinou >= 2, "UCA-029");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-090 sem limite no plano a pílula acompanha a exclusão", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { dados: dadosLista({ limite: { usadas: 4, limite: null } }) });
    clicar(d, cartao(e.raiz, "a4").querySelector(".au-item-mais"));
    e.menus.at(-1).find(i => i.rotulo === "Excluir").fn(); await tique(4);
    await e.desfazeres[0].manter(); await tique(6);
    assert.equal(textoDe(e.raiz.querySelector(".au-uso")), "3 automações · sem limite no plano");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-083 + UCA-125 trocar a comparação para «está vazio» oferece «Desfazer» e o foco fica na comparação", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1].condicoes = [{ campo: "valor", op: "maior", valor: 1500 }];
    const e = await abrirTela(d, { partes: ["a2"], dados });
    const sel = e.raiz.querySelector(".au-cond .au-cond-op select");
    sel.value = "vazio"; sel.dispatchEvent(new d.Evento("change")); await tique(2);
    const t = e.toasts.at(-1);
    assert.match(t[0], /^Comparação trocada: o valor «1500» foi limpo\.$/);
    assert.equal(typeof t[1].desfazer, "function");
    assert.ok(d.doc.activeElement.closest(".au-cond-op"), "foco na comparação recriada");
    t[1].desfazer(); await tique(2);
    assert.match(textoDe(e.raiz), /maior que «R\$ 1\.500,00»/, "a comparação e o valor voltaram (a frase mostra)");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-118 + UCA-119 mudanças nos passos são anunciadas (role=status)", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a2"] });
    const st = e.raiz.querySelector(".au-passos-status");
    assert.equal(st.getAttribute("role"), "status");
    clicar(d, e.raiz.querySelector(".au-dup")); await esperar(60);
    assert.match(textoDe(st), /^Passo «Criar tarefa» duplicado: a cópia é o 2º\.$/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UCA-101 + UCA-102 recentes da IA: «Limpar recentes» e só vira recente o pedido que a IA montou", async () => {
  const d = comDom();
  try {
    localStorage.setItem("nx-au-ia-recentes:cli-1|conta-1", JSON.stringify([{ texto: "Quando entrar em orçamento, crie uma tarefa", em: Date.now() }]));
    const e = await abrirTela(d);
    assert.ok(e.raiz.querySelector(".au-ia-rec-limpar"));
    clicar(d, e.raiz.querySelector(".au-ia-rec-limpar")); await tique(2);
    assert.equal(e.raiz.querySelector(".au-chip-rec"), null);
    assert.ok(!localStorage.getItem("nx-au-ia-recentes:cli-1|conta-1") || JSON.parse(localStorage.getItem("nx-au-ia-recentes:cli-1|conta-1")).length === 0);
    e.A.desmontar();
    const src = ler("web/app/automacoes.js");
    assert.match(src, /guardarRecente\(descricao\);\s*\/\/ plano 1500c · UCA-102/, "UCA-102: guardado depois do sucesso");
  } finally { d.fim(); }
});

test("UCA-040 inserir variável respeita o maxlength do campo", () => {
  const src = ler("web/app/auto-editor.js");
  assert.match(src, /if \(teto > 0 && t\.value\.length - \(fim - ini\) \+ tok\.length > teto\) \{ ui\.toast\(`Não cabe: o campo vai até \$\{teto\} caracteres\.`/);
});

test("UCA-114 (parte do front) cartão diz para quem rodou quando o servidor manda ultima_execucao_contato", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1].ultima_execucao_em = new Date(Date.now() - 120e3).toISOString();
    dados.itens[1].ultima_execucao_contato = "Maria Souza";
    dados.itens[2].ultima_execucao_em = new Date(Date.now() - 120e3).toISOString();
    const e = await abrirTela(d, { dados });
    assert.match(textoDe(cartao(e.raiz, "a2").querySelector(".au-item-ult")), /^última: Maria, /);
    assert.match(textoDe(cartao(e.raiz, "a3").querySelector(".au-item-ult")), /^última /, "sem o campo, como antes");
    e.A.desmontar();
  } finally { d.fim(); }
});
