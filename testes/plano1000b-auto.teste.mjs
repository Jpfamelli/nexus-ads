/* ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026), frente auto (Automações) · lotes auto-1 e auto-2 (outros lotes auto acrescentam aqui).
   Rodar: node --test testes/plano1000b-auto.teste.mjs
   Comportamento num DOM de mentira (o mesmo do plano1000-automacoes) + lógica pura. Cada teste cita o item (UB-xxx) do lote.
   Sem rede, sem serviços reais: as RPCs são dublês com o formato das migrações; datas relativas a Date.now(). */
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

/* ================================================================== (a) lógica pura */

test("UB-026 celular de 11 dígitos colados é «telefone», não «CPF»", () => {
  assert.deepEqual(L.dadosPessoaisNoPedido("ligar para 12998303030 amanhã").map(x => x.tipo), ["telefone"]);
  assert.deepEqual(L.dadosPessoaisNoPedido("CPF 12345678909").map(x => x.tipo), ["CPF"], "11 dígitos sem cara de celular continuam CPF");
});

test("UB-028 faixas em horas/dias, sem «2160 horas» nem «43200 minutos»", () => {
  const v = a => L.validar({ nome: "x", condicoes: [], acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }], ...a }, { base: BASE, ligar: false }).motivo;
  assert.equal(v({ gatilho: "tempo_no_estagio", config: { estagio_id: U(13), horas: 9999 } }), "o tempo na etapa vai de 1 hora a 90 dias");
  assert.equal(v({ gatilho: "sem_resposta", config: { minutos: 2 } }), "o tempo sem resposta vai de 5 minutos a 24 horas");
  assert.equal(v({ gatilho: "apos_data", config: { campo: "consulta", horas: 999 } }), "o tempo depois da data vai de 1 hora a 30 dias");
  assert.equal(v({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel", vence_em_horas: 9999 }] }), "ação 1: o prazo vai até 90 dias (0 = para já)");
  assert.doesNotMatch(v({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: [{ tipo: "esperar", minutos: 0 }, { tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] }), /43200/);
  assert.deepEqual(L.ondeDoHint("o tempo sem resposta vai de 5 a 1440 minutos"), { onde: "quando", indice: null }, "a frase do servidor continua reconhecida");
});

test("UB-061 valor de condição com milhar brasileiro («1.500,00») vale 1500, nunca NaN", () => {
  assert.equal(L.numeroBR("1.500,00"), 1500);
  assert.equal(L.numeroBR("1500,5"), 1500.5);
  assert.equal(L.numeroBR("R$ 2.000"), 2000);
  assert.equal(L.numeroBR("1.5"), 1.5);
  assert.equal(L.numeroBR("abc"), null);
  const a = { nome: "x", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [{ campo: "valor", op: "maior", valor: "1.500,00" }], acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] };
  assert.equal(L.validar(a, { base: BASE, ligar: false }).ok, true);
  assert.equal(L.limpar(a).condicoes[0].valor, 1500);
});

test("UB-063 com mais de 40 automações, a paleta fica com as que rodaram por último", () => {
  const itens = Array.from({ length: 45 }, (_, i) => ({ id: `x${i}`, nome: `Auto ${i}`, ativo: true, ultima_execucao_em: i === 44 ? new Date().toISOString() : null }));
  const cmds = L.comandosDasAutomacoes(itens, { podeEditar: false });
  assert.equal(cmds.length, 40);
  assert.ok(cmds.some(c => c.automacao === "x44"), "a 45ª, que rodou agora, entra");
});

test("UB-065 / UB-282 / UB-073: frase da tarefa «com prazo de», «sem resposta» sem tempo e etapa do exemplo pela base", () => {
  const f = L.descrever({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel", vence_em_horas: 24 }] }, BASE, L.vocabPadrao ? L.vocabPadrao() : undefined);
  assert.match(f, /com prazo de 24 h/);
  assert.doesNotMatch(f, / em 24 h/);
  const s = L.descrever({ gatilho: "sem_resposta", config: {}, condicoes: [], acoes: [] }, BASE);
  assert.match(s, /sem resposta há \(escolha o tempo\)/);
  assert.doesNotMatch(s, /0 min/);
  const oficina = { funis: [{ id: "f", nome: "Serviços", padrao: true, estagios: [{ id: "e1", nome: "Carro chegou" }] }] };
  assert.equal(L.exemploVariaveis({ base: oficina }).etapa, "Carro chegou");
  assert.equal(L.exemploVariaveis({}).etapa, "Avaliou / orçamento", "sem base, o exemplo de antes");
});

test("UB-049 / UB-044 / UB-059 / UB-189: busca pela frase, lista que mudou, trecho do modelo e aviso de data/hora", () => {
  const itens = [{ id: "1", nome: "Confirmar consulta de amanhã" }, { id: "2", nome: "Pós-venda" }];
  const frase = x => (x.id === "1" ? "Antes da consulta marcada, enviar a mensagem de lembrete" : "criar tarefa");
  assert.deepEqual(L.listaAutomacoes(itens, { termo: "lembrete", frase }).map(x => x.id), ["1"]);
  assert.deepEqual(L.listaAutomacoes(itens, { termo: "lembrete" }).map(x => x.id), [], "sem a frase, só o nome (como antes)");
  assert.equal(L.listaMudou([{ id: "a" }], [{ id: "a" }]), false);
  assert.equal(L.listaMudou([{ id: "a" }], [{ id: "a" }, { id: "b" }]), true, "criada por outra pessoa");
  assert.equal(L.listaMudou([{ id: "a" }, { id: "b" }], [{ id: "a" }]), true, "excluída por outra pessoa");
  assert.equal(L.listaMudou([{ id: "a" }], [{ id: "a" }, { id: "b" }], new Set(["b"])), false, "a do «Desfazer» desta tela não conta");
  assert.equal(L.listaMudou([{ id: "a" }], undefined), false);
  assert.equal(L.trechoParametro("Olá, {{1}}! Sua consulta é {{2}}.", 1), "Olá, ___! Sua consulta é ___.");
  assert.equal(L.trechoParametro("sem espaço", 1), "");
  assert.match(L.avisoDataHoraConsulta({ gatilho: "apos_data", acoes: [{ tipo: "enviar_mensagem", texto: "Às {hora_consulta}" }] }, "odonto"), /\{hora_consulta\}.*em branco/);
  assert.match(L.avisoDataHoraConsulta({ gatilho: "negocio_estagio", acoes: [{ tipo: "enviar_mensagem", texto: "Dia {data_consulta}" }] }, "odonto"), /\{data_consulta\}/);
  assert.equal(L.avisoDataHoraConsulta({ gatilho: "negocio_estagio", acoes: [{ tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}" }] }, "odonto"), null);
});

/* ================================================================== (b) peças */

test("UB-015 / UB-193 / UB-030 peças: ajuda ligada ao campo; resumo da espera fora de região viva; horas com mínimo 0", async () => {
  const d = comDom();
  try {
    const P = (await import("../web/app/auto-pecas.js")).pecas(await uiReal(), L);
    const s = P.seletor({ rotulo: "Etapa", opcoes: [], ajuda: "Vazio = primeira etapa do funil" });
    const aj = s.querySelector(".campo-ajuda");
    assert.ok(aj.id);
    assert.equal(s.querySelector("select").getAttribute("aria-describedby"), aj.id);
    const e = P.entrada({ rotulo: "Título", ajuda: "Até 160 letras" });
    assert.equal(e.querySelector("input").getAttribute("aria-describedby"), e.querySelector(".campo-ajuda").id);
    const dur = P.campoDuracao({ rotulo: "Esperar", valor: 60, aoMudar: () => {} });
    const res = dur.querySelector(".au-dur-resumo");
    assert.equal(res.getAttribute("aria-live"), null, "sem aria-live: não fala a cada tecla");
    assert.equal(dur.querySelector(".au-dur-num input").getAttribute("aria-describedby"), res.id);
    const vals = [];
    const hr = P.campoHoras({ rotulo: "Prazo", valor: 0, min: 0, max: 2160, ajuda: "0 = para já.", aoMudar: v => vals.push(v) });
    const inp = hr.querySelector("input");
    assert.equal(String(inp.value), "0", "0 aparece como 0 (não vazio)");
    assert.equal(hr.querySelector(".au-hr-resumo").textContent, "0 = para já.");
    inp.value = "7"; hr.querySelector("select").value = "dias"; hr.querySelector("select").dispatchEvent(new d.Evento("change"));
    inp.value = "0"; inp.dispatchEvent(new d.Evento("input"));
    assert.deepEqual(vals, [168, 0]);
  } finally { d.fim(); }
});

test("UB-195 + UB-042 + UB-040 diagrama sem <title> repetido, uma parada de Tab e setas; «Ver como tabela» com texto fixo", async () => {
  const d = comDom();
  try {
    const P = (await import("../web/app/auto-pecas.js")).pecas(await uiReal(), L);
    const auto = { gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "criar_tarefa", titulo: "a", dono: "responsavel" }, { tipo: "criar_tarefa", titulo: "b", dono: "responsavel" }] };
    const svg = P.diagrama({ nos: L.nosDoDiagrama(auto, BASE, VOCAB, { podeEditar: true }), aoFocar: () => {} });
    assert.equal(svg.querySelector("title"), null);
    const nos = svg.querySelectorAll(".au-dg-no");
    assert.deepEqual(nos.map(n => n.getAttribute("tabindex")), ["0", ...nos.slice(1).map(() => "-1")]);
    nos[0].dispatchEvent(new d.Evento("keydown", { key: "ArrowDown" }));
    assert.equal(d.doc.activeElement, nos[1]);
    assert.equal(nos[1].getAttribute("tabindex"), "0"); assert.equal(nos[0].getAttribute("tabindex"), "-1");
    nos[1].dispatchEvent(new d.Evento("keydown", { key: "End" }));
    assert.equal(d.doc.activeElement, nos.at(-1));
    const g = P.graficoDias({ ...L.execucoesPorDia([{ criado_em: new Date().toISOString(), estado: "concluida", ok: true }], { dias: 7 }) });
    const bt = g.querySelector(".au-gd-alt");
    bt.dispatchEvent(new d.Evento("click"));
    assert.equal(bt.textContent, "Ver como tabela");
    assert.equal(bt.getAttribute("aria-pressed"), "true");
  } finally { d.fim(); }
});

test("UB-079 CSS: textos do diagrama por token (rem), sem 11px fixo", () => {
  const css = ler("web/app/automacoes.css");
  for (const cls of ["au-dg-rot", "au-dg-sub", "au-dg-n"]) {
    const regra = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))[0];
    assert.match(regra, /font-size: var\(--fs-12\)/, cls);
  }
});

/* ================================================================== (c) lista */

test("UB-001 + UB-047 no limite: um aviso só no topo; excluir de vez reacende «Criar do zero», a IA e as receitas sem F5", async () => {
  const d = comDom();
  try {
    const dados = dadosLista({ limite: { usadas: 4, limite: 4 } });
    const e = await abrirTela(d, { dados, rpcExtra: { nx_automacao_excluir: async () => ({ ok: true }) } });
    const raiz = e.raiz;
    const btNova = raiz.querySelectorAll("button").find(b => /Criar do zero/.test(b.textContent));
    assert.equal(btNova.disabled, true);
    assert.equal(raiz.querySelectorAll(".aviso").filter(a => /limite de 4 automações/.test(a.textContent)).length, 1, "a frase do limite aparece uma vez");
    assert.equal(raiz.querySelector("#au-limite a").getAttribute("href"), "#/config/plano");
    assert.match(raiz.querySelector(".au-ia-txt").getAttribute("aria-describedby"), /au-limite/);
    clicar(d, cartao(raiz, "a4").querySelector(".au-item-mais"));
    e.menus.at(-1).find(x => x.rotulo === "Excluir").fn(); await tique(4);
    await e.desfazeres[0].manter(); await tique(4);
    assert.equal(dados.limite.usadas, 3);
    assert.equal(btNova.disabled, false, "«Criar do zero» reacende");
    assert.equal(raiz.querySelector("#au-limite"), null, "o aviso sai");
    assert.ok(raiz.querySelectorAll(".au-chip-ex").every(b => !b.disabled), "os exemplos da IA reacendem");
    assert.doesNotMatch(raiz.querySelector(".au-ia-txt").getAttribute("aria-describedby"), /au-limite/);
    assert.ok(raiz.querySelectorAll(".au-usar-receita").every(b => !b.disabled && !b.getAttribute("aria-describedby")), "«Usar receita» reacende");
    assert.match(raiz.querySelector(".au-uso").textContent, /^3 de 4/);
    clicar(d, cartao(raiz, "a1").querySelector(".au-item-mais"));
    const dup = e.menus.at(-1).find(x => /^Duplicar/.test(x.rotulo));
    assert.equal(dup.desabilitado, false, "«Duplicar» também (o menu lê o limite na hora)");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-002 + UB-045 Criar com IA: dois «Parar de esperar» deixam UM aviso; o resultado não é região viva inteira", async () => {
  const d = comDom();
  try {
    const pend = [];
    const e = await abrirTela(d, { fn: () => new Promise(r => pend.push(r)) });
    const raiz = e.raiz, area = raiz.querySelector(".au-ia-txt");
    digitar(d, area, "Quando o orçamento ficar parado 3 dias, crie uma tarefa");
    for (let k = 0; k < 2; k++) {
      clicar(d, raiz.querySelector(".au-ia-bt")); await tique(4);
      clicar(d, raiz.querySelector(".au-ia-parar")); await tique(6);
    }
    assert.equal(raiz.querySelectorAll(".au-ia-desistiu").length, 1);
    clicar(d, raiz.querySelector(".au-ia-bt")); await tique(4);
    pend.at(-1)({ automacao: { nome: "Cobrar orçamento", gatilho: { tipo: "negocio_estagio", campos: { estagio_id: U(13) } }, acoes: [{ tipo: "criar_tarefa", campos: { titulo: "Ligar" } }] }, explicacao: "Monta a tarefa." });
    await tique(8);
    const res = raiz.querySelector(".au-ia-res");
    assert.ok(res);
    assert.notEqual(res.getAttribute("role"), "status", "o bloco inteiro não é lido de uma vez");
    assert.match(textoDe(res.querySelector("[role=status]")), /^A IA montou: /);
    assert.equal(res.getAttribute("aria-labelledby"), res.querySelector(".au-ia-res-nome").id);
    e.A.desmontar();
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "ia-texto"));
  } finally { d.fim(); }
});

test("UB-068 IA desligada: os avisos não citam a Nexus", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { dados: dadosLista({ ia: { disponivel: false } }) });
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-ia")), /Nexus/);
    assert.ok(e.raiz.querySelectorAll(".au-modelo-nota-ia").every(n => !/Nexus/.test(n.textContent)));
    assert.match(textoDe(e.raiz.querySelector(".au-ia")), /suporte da plataforma/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-185 + UB-071 quem não edita: o aviso do topo e o vazio dizem a quem pedir", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { dados: dadosLista({ pode_editar: false }) });
    assert.match(textoDe(e.raiz.querySelector(".au-aviso-papel")), /Peça a Bruno Reis/);
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const e2 = await abrirTela(d, { dados: dadosLista({ pode_editar: false, itens: [] }) });
    assert.match(textoDe(e2.raiz.querySelector(".au-vazio")), /Ainda não há automações criadas\. Peça a Bruno Reis/);
    e2.A.desmontar();
  } finally { d.fim(); }
});

test("UB-187 abrir uma automação mostra o esqueleto do editor (não o de lista)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    let soltar;
    const t = ctxAuto(ui, { partes: ["a1"], rpc: () => new Promise(r => { soltar = () => r(dadosLista()); }) });
    const p = A.montar(t.ctx); await tique(2);
    const esq = t.ctx.alvo.querySelector(".au-esq-editor");
    assert.ok(esq, "esqueleto próprio");
    assert.equal(esq.querySelectorAll(".au-esq-ed-fluxo .sk-cartao").length, 3, "3 blocos (Quando/Se/Então)");
    soltar(); await p; await tique(4);
    assert.equal(t.ctx.alvo.querySelector(".au-esq-editor"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("UB-256 + UB-258 cartão: interruptor descrito pela frase e pelo estado; menu «Ver execuções (11)»", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d);
    const c = cartao(e.raiz, "a1");
    const ids = c.querySelector(".au-sw").getAttribute("aria-describedby").split(" ");
    assert.equal(ids.length, 2);
    assert.equal(c.querySelector(".au-item-estado").id, ids[0]);
    assert.equal(c.querySelector(".au-item-frase").id, ids[1]);
    clicar(d, c.querySelector(".au-item-mais"));
    assert.ok(e.menus.at(-1).some(x => x.rotulo === "Ver execuções (11)"));
    clicar(d, cartao(e.raiz, "a4").querySelector(".au-item-mais"));
    assert.ok(e.menus.at(-1).some(x => x.rotulo === "Ver execuções"), "sem execução, sem número");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-044 pulso: automação criada por outra pessoa → faixa «A lista mudou · Atualizar» (sem redesenhar sozinho)", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    let batida = null, novos = null;
    const e = await abrirTela(d, { dados, extra: { pulso: { assinar: f => { batida = f; return () => {}; } } },
      rpcExtra: {} });
    // a lista do servidor passa a ter uma a mais
    const rpcAntes = e.ctx.api.rpcC;
    e.ctx.api.rpcC = async (n, p) => (n === "nx_automacoes_listar" && novos ? novos : rpcAntes(n, p));
    novos = { itens: [...dados.itens, { id: "a9", nome: "Nova de outra pessoa", gatilho: "negocio_estagio", ativo: false, config: {}, acoes: [] }] };
    const agora = Date.now; Date.now = () => agora() + 30000;
    try { await batida(); await tique(6); } finally { Date.now = agora; }
    const faixa = e.raiz.querySelector(".au-lista-mudou");
    assert.ok(faixa);
    assert.match(textoDe(faixa), /A lista mudou/);
    assert.equal(cartao(e.raiz, "a9"), null, "não aparece sozinha embaixo de quem está usando");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-051 «Pausar envios agora»: os interruptores ficam travados durante a série", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    let soltar = null, travados = null;
    const e = await abrirTela(d, { dados });
    const rpcAntes = e.ctx.api.rpcC;
    e.ctx.api.rpcC = (n, p) => (n === "nx_automacao_ativar" ? new Promise(r => { soltar = () => r({ id: p.p_id, ativo: p.p_ativo }); }) : rpcAntes(n, p));
    clicar(d, e.raiz.querySelector(".au-pausar")); await tique(4);
    travados = e.raiz.querySelectorAll(".au-sw").map(b => b.disabled);
    assert.ok(travados.every(Boolean), "todos travados no meio da série");
    assert.equal(e.raiz.querySelector(".au-lista").getAttribute("aria-busy"), "true");
    soltar(); await tique(8);
    assert.ok(e.raiz.querySelectorAll(".au-sw").every(b => !b.disabled), "voltam no fim");
    assert.equal(e.raiz.querySelector(".au-lista").getAttribute("aria-busy"), null);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-069 receita «sai pelo CodeWords» numa empresa só com Meta diz o que falta", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Oficial", provedor: "meta" }] };
    const e = await abrirTela(d, { dados });
    assert.ok(e.raiz.querySelector(".au-pil-falta-cw"), "a pílula troca");
    assert.ok(!e.raiz.querySelectorAll(".au-pil-tipo").some(p => /sai pelo CodeWords/.test(p.textContent)));
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const dados2 = dadosLista(); dados2.base = { ...BASE, canais: [{ id: U(61), nome: "Recepção", provedor: "codewords" }] };
    const e2 = await abrirTela(d, { dados: dados2 });
    assert.equal(e2.raiz.querySelector(".au-pil-falta-cw"), null);
    e2.A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (d) editor */

test("UB-008 editor registra a guarda de rota do shell: com edição pendente pergunta; sem, deixa sair", async () => {
  const d = comDom();
  try {
    const guardas = [];
    const e = await abrirTela(d, { partes: ["a1"], confirmar: async () => false, extra: { aoSairDaRota: f => { guardas.push(f); return () => {}; } } });
    assert.equal(guardas.length, 1);
    assert.equal(await guardas[0]({ destino: "#/crm" }), true, "nada mexido: sai sem perguntar");
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Outro nome");
    assert.equal(await guardas[0]({ destino: "#/crm" }), false, "mexido e «Cancelar» no diálogo: fica");
    assert.equal(e.confirmacoes.at(-1).titulo, "Sair sem salvar?");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-013 + UB-055 + UB-057 + UB-077 editor: chips de variável com nome; «Adicionar passo» aponta a paleta; busca do teste no vocabulário; «Ver o fluxo» fixo", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a1"], extra: { vocab: VOCAB_V } });
    const v = e.raiz.querySelector(".au-var");
    assert.match(v.getAttribute("aria-label"), /^Inserir /);
    // plano 2000d · DU-037: a chave na 1ª linha e o exemplo na 2ª («→ Alex»)
    assert.match(v.querySelector(".au-var-chave").textContent, /^\{.+\}$/, "o texto visível continua a chave");
    const mais = e.raiz.querySelectorAll(".au-mais").find(b => /Adicionar passo/.test(b.textContent));
    const pal = e.raiz.querySelector(`#${mais.getAttribute("aria-controls")}`);
    assert.ok(pal && pal.classList.contains("au-paleta"));
    assert.equal(e.raiz.querySelector(".au-teste-busca").placeholder || e.raiz.querySelector(".au-teste-busca").getAttribute("placeholder"), "Busque o paciente ou oportunidade");
    const bf = e.raiz.querySelector(".au-dg-toggle");
    const antes = textoDe(bf);
    clicar(d, bf);
    assert.equal(textoDe(bf), antes);
    assert.equal(antes, "Ver o fluxo");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-022 + UB-023 + UB-252 tirar passo / condição e trocar o campo oferecem «Desfazer»", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1].condicoes = [{ campo: "texto", op: "contem", valor: "implante" }];
    dados.itens[1].acoes = [{ tipo: "enviar_mensagem", texto: "Mensagem longa que não pode sumir" }, { tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }];
    const e = await abrirTela(d, { partes: ["a2"], dados });
    const raiz = e.raiz;
    clicar(d, raiz.querySelector(".au-passo .au-x")); await tique(2);
    assert.equal(raiz.querySelectorAll(".au-passo").length, 1);
    const [txtP, oP] = e.toasts.at(-1);
    assert.match(txtP, /^Passo 1 .* tirado\.$/);
    oP.desfazer(); await tique(2);
    assert.equal(raiz.querySelectorAll(".au-passo").length, 2);
    const ta = raiz.querySelector(".au-passo textarea");
    assert.equal(ta.value || ta.textContent, "Mensagem longa que não pode sumir", "o mesmo passo volta no lugar");
    // trocar o campo da condição limpa o valor, com «Desfazer»
    const selCampo = raiz.querySelector(".au-cond-campo select");
    selCampo.value = "origem"; selCampo.dispatchEvent(new d.Evento("change")); await tique(2);
    const [txtC, oC] = e.toasts.at(-1);
    assert.match(txtC, /«implante» foi limpo/);
    oC.desfazer(); await tique(2);
    assert.equal(raiz.querySelector(".au-cond-val input").value, "implante");
    // tirar a condição
    clicar(d, raiz.querySelector(".au-cond .au-x")); await tique(2);
    assert.equal(raiz.querySelectorAll(".au-cond").length, 0);
    e.toasts.at(-1)[1].desfazer(); await tique(2);
    assert.equal(raiz.querySelectorAll(".au-cond").length, 1);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-030 + UB-032 editor: prazo da tarefa em horas ou dias; palavras repetidas contam uma vez", async () => {
  const d = comDom();
  const hist = globalThis.history; globalThis.history = { state: null, replaceState() {} };
  try {
    const salvos = [];
    const dados = dadosLista();
    dados.itens[1] = { ...dados.itens[1], gatilho: "mensagem_recebida", config: {}, acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel", vence_em_horas: 24 }] };
    const e = await abrirTela(d, { partes: ["a2"], dados, rpcExtra: { nx_automacao_salvar: p => { salvos.push(p.p_auto); return { ...p.p_auto }; } } });
    const passo = e.raiz.querySelector(".au-passo-criar_tarefa");
    const hr = passo.querySelector(".au-campo-hr");
    assert.ok(hr, "campo de horas/dias");
    const opSel = hr.querySelectorAll("option").find(o => o.hasAttribute("selected") || o.selected);
    assert.deepEqual([String(hr.querySelector("input").value), opSel && (opSel.getAttribute("value") || opSel.value)], ["1", "dias"], "24 h aparece como 1 dia");
    const inpP = e.raiz.querySelectorAll("input").find(i => i.getAttribute("placeholder") === "preço, valor, quanto custa");
    digitar(d, inpP, "preço, Preço, preco, valor");
    clicar(d, e.raiz.querySelector(".au-salvar-seguir")); await tique(10);
    assert.deepEqual(salvos.at(-1).config.palavras, ["preço", "valor"]);
    e.A.desmontar();
  } finally { if (hist === undefined) delete globalThis.history; else globalThis.history = hist; d.fim(); }
});

test("UB-034 «Testar com um registro»: combobox com aria-expanded, setas e Esc", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a1"], rpcExtra: { nx_buscar: async () => ({ negocios: [{ id: 1, titulo: "Maria" }, { id: 2, titulo: "João" }] }) } });
    const b = e.raiz.querySelector(".au-teste-busca");
    const lista = e.raiz.querySelector(`#${b.getAttribute("aria-controls")}`);
    assert.ok(lista);
    assert.equal(b.getAttribute("aria-expanded"), "false");
    digitar(d, b, "Ma"); await esperar(350); await tique(4);
    assert.equal(b.getAttribute("aria-expanded"), "true");
    b.dispatchEvent(new d.Evento("keydown", { key: "ArrowDown" }));
    const ops = lista.querySelectorAll(".au-teste-op");
    assert.equal(d.doc.activeElement, ops[0]);
    ops[0].dispatchEvent(new d.Evento("keydown", { key: "ArrowDown" }));
    assert.equal(d.doc.activeElement, ops[1]);
    ops[1].dispatchEvent(new d.Evento("keydown", { key: "Escape" }));
    assert.equal(lista.hidden, true);
    assert.equal(b.getAttribute("aria-expanded"), "false");
    assert.equal(d.doc.activeElement, b);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-248 «Recuperar rascunho»: só a frase é região viva (os botões ficam fora)", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    sessionStorage.setItem(L.chaveRascunho("cli-1", "conta-1", "a1"), L.empacotarRascunho({ ...dados.itens[0], nome: "Rascunho mexido" }));
    const e = await abrirTela(d, { partes: ["a1"], dados });
    const of = e.raiz.querySelector(".au-rasc");
    assert.ok(of);
    assert.equal(of.getAttribute("role"), null);
    const viva = of.querySelector("[role=status]");
    assert.ok(viva && viva.localName === "p");
    assert.equal(viva.querySelectorAll("button").length, 0);
    e.A.desmontar();
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "a1"));
  } finally { d.fim(); }
});

test("UB-250 + UB-053 salvar: Ctrl+S não salva com diálogo aberto; o botão não fica ocupado enquanto a confirmação está aberta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const atalhos = [], salvos = [];
    let responder = null;
    const t = ctxAuto(ui, { partes: ["a1"], confirmar: () => new Promise(r => { responder = r; }),
      rpc: async (n, p) => { if (n === "nx_automacao_salvar") { salvos.push(p.p_auto); return { ...p.p_auto }; } return rpcLista(dadosLista())(n, p); } });
    t.ctx.ui.atalho = (comb, fn) => { atalhos.push({ comb, fn }); return () => {}; };
    await A.montar(t.ctx); await tique(4);
    const raiz = t.ctx.alvo;
    const dlg = d.doc.body.appendChild(d.doc.createElement("dialog")); dlg.setAttribute("open", "");
    atalhos.find(a => a.comb === "mod+s").fn({ preventDefault() {} }); await tique(6);
    assert.equal(salvos.length, 0, "com diálogo aberto o atalho não salva");
    assert.equal(responder, null, "nem pergunta");
    dlg.remove();
    // ligar uma que manda mensagem: a confirmação abre e o Salvar NÃO fica ocupado enquanto isso
    clicar(d, raiz.querySelector(".au-ed-acoes .au-sw")); await tique(2);
    const bt = raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar");
    clicar(d, bt); await tique(4);
    assert.ok(responder, "a confirmação abriu");
    assert.notEqual(bt.getAttribute("aria-busy"), "true");
    assert.equal(bt.disabled, false);
    responder(true); await tique(10);
    assert.equal(salvos.length, 1);
    A.desmontar();
  } finally { d.fim(); }
});

test("UB-007 nova salva com «continuar»: aba Execuções e «Duplicar» aparecem sem recarregar", async () => {
  const d = comDom();
  const hist = globalThis.history; globalThis.history = { state: null, replaceState() {} };
  try {
    const e = await abrirTela(d, { partes: ["nova"], query: { modelo: "orcamento" }, rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto, id: "n9", execucoes: 0, erros: 0 }) } });
    assert.equal(e.raiz.querySelector(".au-abas"), null);
    assert.equal(e.raiz.querySelector(".au-ed-duplicar"), null);
    if (!e.raiz.querySelector(".au-nome-inp").value) digitar(d, e.raiz.querySelector(".au-nome-inp"), "Orçamento parado");
    clicar(d, e.raiz.querySelector(".au-salvar-seguir")); await tique(10); await esperar(650);
    assert.ok(e.raiz.querySelector(".au-abas"), "abas na hora");
    assert.ok(e.raiz.querySelector(".au-ed-duplicar"), "«Duplicar» na hora");
    e.A.desmontar();
  } finally { if (hist === undefined) delete globalThis.history; else globalThis.history = hist; d.fim(); }
});

test("UB-059 + UB-075 modelo da Meta: «1º espaço do modelo» com o trecho; sincronizar devolve o foco ao passo clicado", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Oficial", provedor: "meta" }],
      templates: [{ id: "t1", nome: "lembrete", idioma: "pt_BR", status: "APPROVED", canal_id: U(61), num_parametros: 1, corpo: "Olá, {{1}}! Até amanhã." }] };
    dados.itens[1] = { ...dados.itens[1], acoes: [{ tipo: "enviar_template", template_id: "t1", parametros: ["{primeiro_nome}"] }, { tipo: "enviar_template", template_id: "t1", parametros: ["{nome}"] }] };
    const e = await abrirTela(d, { partes: ["a2"], dados, rpcExtra: {}, fn: async () => ({ total: 1 }) });
    const lab = e.raiz.querySelector(".au-tpl-pars label");
    assert.match(textoDe(lab), /^1º espaço do modelo/);
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-tpl-pars")), /Parâmetro \{\{1\}\}/);
    assert.match(textoDe(e.raiz.querySelector(".au-tpl-pars .campo-ajuda")), /«Olá, ___! Até amanhã\.»/);
    const sinc = e.raiz.querySelectorAll(".au-tpl-sincronizar");
    assert.equal(sinc.length, 2);
    clicar(d, sinc[1]); await tique(12);
    const passo2 = e.raiz.querySelector('.au-passo[data-i="1"]');
    assert.ok(passo2.contains(d.doc.activeElement), "o foco fica no 2º passo, não no 1º");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-189 + UB-212 editor: aviso de {hora_consulta} em «Depois da data»; quem mudou por último quando o servidor manda", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[0] = { ...dados.itens[0], gatilho: "apos_data", config: { campo: "consulta", horas: 2 }, acoes: [{ tipo: "enviar_mensagem", texto: "Como foi às {hora_consulta}?" }],
      atualizado_em: new Date(Date.now() - 2 * 86400e3).toISOString(), atualizado_por_nome: "Ana Lima" };
    const e = await abrirTela(d, { partes: ["a1"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-avisos")), /\{hora_consulta\}: quem tiver só a data/);
    assert.match(textoDe(e.raiz.querySelector(".au-ed-autor")), /^Alterada por Ana, /);
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const e2 = await abrirTela(d, { partes: ["a2"] });
    assert.equal(e2.raiz.querySelector(".au-ed-autor"), null, "sem o dado do servidor, nada");
    e2.A.desmontar();
  } finally { d.fim(); }
});

test("UB-019 simulação: cada «Abrir» diz de quem é", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a3"], rpcExtra: { nx_auto_simular: async () => ({ amostra: [{ titulo: "Maria", link: "#/crm/negocio/1", passos: [{ tipo: "enviar_mensagem", resultado: "faria" }] }] }) } });
    clicar(d, e.raiz.querySelectorAll("button").find(b => /Testar agora/.test(b.textContent))); await tique(10);
    const a = e.raiz.querySelector(".au-sim-link");
    assert.ok(a);
    assert.equal(a.getAttribute("aria-label"), "Abrir Maria");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-004 + UB-017 + UB-038 + UB-191 + UB-036 execuções: número das esperas abatido; «Detalhes» com contexto; chips do dia; Atualizar e Carregar mais suaves", async () => {
  const d = comDom();
  try {
    const agora = Date.now();
    const lista = [{ id: 1, criado_em: new Date(agora - 60e3).toISOString(), status: "espera", chave: "k1" }, { id: 2, criado_em: new Date(agora - 120e3).toISOString(), status: "erro" },
      { id: 3, criado_em: new Date(agora - 4 * 86400e3).toISOString(), status: "ok" }];
    let pendente = null, segurar = false;
    const e = await abrirTela(d, { partes: ["a2"], query: { aba: "execucoes" }, confirmar: async () => true,
      rpcExtra: { nx_automacao_execucoes: () => (segurar ? new Promise(r => { pendente = () => r(lista); }) : lista), nx_automacao_execucoes_dia: async () => { throw new Error("sem"); },
        nx_automacao_cancelar_espera: async () => ({ canceladas: 2 }) } });
    await tique(10);
    const raiz = e.raiz;
    // UB-017
    const det = raiz.querySelectorAll(".au-ex-det-bt");
    assert.ok(det.every(b => /^Detalhes da execução de \d{2}:\d{2}/.test(b.getAttribute("aria-label"))));
    assert.ok(det.some(b => /\(com erro\)$/.test(b.getAttribute("aria-label"))));
    // UB-004: em_espera 3 → cancelou 2 → o próximo diálogo diz 1
    clicar(d, raiz.querySelectorAll("button").find(b => /Cancelar todas as esperas/.test(b.textContent))); await tique(10);
    assert.equal(e.confirmacoes.at(-1).titulo, "Cancelar as 3 esperas desta automação?");
    clicar(d, raiz.querySelectorAll("button").find(b => /Cancelar todas as esperas/.test(b.textContent))); await tique(10);
    assert.equal(e.confirmacoes.at(-1).titulo, "Cancelar a espera desta automação?", "3 − 2 = 1 (não repete o 3)");
    // UB-038: escolher o dia de hoje no gráfico recontam os chips
    const barras = raiz.querySelectorAll("button.au-gd-col");
    clicar(d, barras.at(-1)); await tique(2);
    const chips = raiz.querySelectorAll(".au-ex-filtro .au-chip");
    assert.equal(chips[0].textContent, "Todas · 2");
    assert.match(chips[0].getAttribute("aria-label"), /^Todas, 2 execuções em /);
    // UB-191: «Atualizar» gira no botão e a lista fica até a nova chegar (sem esqueleto)
    segurar = true;
    const atu = raiz.querySelectorAll("button").find(b => b.textContent.trim() === "Atualizar");
    clicar(d, atu); await tique(2);
    assert.equal(atu.getAttribute("aria-busy"), "true");
    assert.ok(raiz.querySelectorAll(".au-ex").length > 0, "a lista antiga continua");
    pendente(); await tique(8);
    segurar = false;
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-036 «Carregar mais» não troca a lista por esqueleto", async () => {
  const d = comDom();
  try {
    let segurar = false, soltar = null;
    const e = await abrirTela(d, { partes: ["a2"], query: { aba: "execucoes" },
      rpcExtra: { nx_automacao_execucoes: p => (segurar ? new Promise(r => { soltar = () => r(execsFalsas(p.p_limite)); }) : execsFalsas(p.p_limite)), nx_automacao_execucoes_dia: async () => { throw new Error("sem"); } } });
    await tique(10);
    const mais = e.raiz.querySelectorAll(".au-mais").find(b => /Carregar mais/.test(b.textContent));
    assert.ok(mais);
    segurar = true;
    clicar(d, mais); await tique(2);
    assert.equal(e.raiz.querySelector(".au-painel .sk-lista"), null, "sem esqueleto");
    assert.ok(e.raiz.querySelectorAll(".au-ex").length >= 50, "as 50 de antes continuam à vista");
    soltar(); await tique(10);
    assert.ok(e.raiz.querySelectorAll(".au-ex").length >= 100);
    e.A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== lote auto-2 */

const comandosFalsos = () => { const cmds = []; return { cmds, comandos: { registrar: c => { cmds.push(c); return () => { const i = cmds.indexOf(c); if (i >= 0) cmds.splice(i, 1); }; } } }; };

/* ---------------------------------------------------------------- (a) lógica pura */

test("UB-024 + UB-025 horário que nunca abre: «semHorario» (não «Na hora»); proximaAbertura rápida e igual ao laço antigo", () => {
  const tl = L.linhaDoTempo([{ tipo: "enviar_mensagem", texto: "x" }, { tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }], { inicio: Date.now(), horario: {} });
  assert.equal(tl[0].semHorario, true);
  assert.equal(tl[0].envio, null);
  assert.equal(tl[1].semHorario, undefined, "só os passos de mensagem dependem do horário");
  assert.equal(L.linhaDoTempo([{ tipo: "enviar_mensagem", texto: "x" }], { inicio: Date.now(), horario: null })[0].semHorario, undefined, "null = 24 h");
  // o laço antigo (5 em 5 min, Intl a cada volta) é a referência: o rápido dá o MESMO instante
  const lento = (h, t) => { if (L.abertoNoHorario(h, t)) return t; let x = Math.ceil(t / 300000) * 300000; for (let i = 0; i < 8 * 288; i++, x += 300000) if (L.abertoNoHorario(h, x)) return x; return null; };
  const uteis = { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "12:00"], ["13:00", "18:00"]], 6: [["22:00", "02:00"]] };
  for (let k = 0; k < 120; k++) {
    const t = Date.now() + Math.floor(((k * 7919) % 1000) / 1000 * 14 * 86400e3);
    assert.equal(L.proximaAbertura(uteis, t), lento(uteis, t), `t=${new Date(t).toISOString()}`);
  }
  const passos = Array.from({ length: 10 }, () => ({ tipo: "enviar_mensagem", texto: "x" }));
  L.linhaDoTempo(passos, { inicio: Date.now(), horario: {} });       // aquece o Intl
  const t0 = performance.now();
  L.linhaDoTempo(passos, { inicio: Date.now(), horario: {} });
  assert.ok(performance.now() - t0 < 40, `10 passos sem horário em ${Math.round(performance.now() - t0)} ms (antes ~75 ms)`);
});

test("UB-027 + UB-281 + UB-062 + UB-066 + UB-067 + UB-074: celular sem DDD, «(e mais N)», cota, vocabulário da IA, sem «Nexus», passos cortados", () => {
  assert.deepEqual(L.dadosPessoaisNoPedido("avisar 98765-4321").map(x => x.tipo), ["telefone"]);
  assert.deepEqual(L.dadosPessoaisNoPedido("ligar 9 8765 4321").map(x => x.trecho), ["9 8765 4321"]);
  assert.equal(L.dadosPessoaisNoPedido("ligar (12) 99830-3030").length, 1, "com DDD continua UM telefone");
  assert.deepEqual(L.dadosPessoaisNoPedido("CPF 123.456.789-09").map(x => x.tipo), ["CPF"]);
  const f = L.descrever({ gatilho: "mensagem_recebida", config: { palavras: ["a1", "b2", "c3", "d4", "e5", "f6", "g7"] }, condicoes: [], acoes: [] }, BASE);
  assert.match(f, /\(e mais 3\)/);
  assert.match(L.linhaCotaIA({ usadas: 5, limite: 100 }).texto, /^5 de 100 usos de IA este mês \(sugestões, resumos e montagens\)$/);
  const ia = L.descrever({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "ia_decidir", tarefa: "pontuar_lead" }] }, BASE, VOCAB);
  assert.match(ia, /pontuar o interesse do paciente/);
  assert.doesNotMatch(ia, /lead/);
  const tar = L.tarefasIA(VOCAB).find(([k]) => k === "pontuar_lead");
  assert.equal(tar[1], "Pontuar o interesse");
  assert.match(tar[2], /interesse do paciente/);
  for (const cod of ["ia_cota", "sem_chave", "ia_desligada"]) {
    assert.doesNotMatch(L.erroDaIA({ codigo: cod }).texto, /Nexus/, cod);
    assert.match(L.erroDaIA({ codigo: cod }).texto, /a equipe de suporte/, cod);
  }
  assert.match(L.erroDaIA({ codigo: "ia_cota" }, "", "Órbita Pro").texto, /equipe de suporte de Órbita Pro/);
  assert.doesNotMatch(L.AVISO_IA_DESLIGADA, /Nexus/);
  const sim = L.normalizarSimulacao({ amostra: [{ rotulo: "Maria", passos: Array.from({ length: 14 }, (_, i) => ({ n: i + 1, tipo: "nota", texto: `p${i}` })) }] }, { acoes: [] }, BASE);
  assert.equal(sim.alvos[0].passos.length, 12);
  assert.equal(sim.alvos[0].passosOcultos, 2);
  assert.equal(L.normalizarSimulacao({ amostra: [{ rotulo: "x", passos: [] }] }, { acoes: [] }, BASE).alvos[0].passosOcultos, 0);
});

test("UB-043 + UB-249 + UB-031 + UB-064 + UB-029: nome da cópia, resumo do rascunho, por onde sai, palavra curta e rótulo de tempo", () => {
  assert.equal(L.nomeDaCopia("Lembrete"), "Lembrete (cópia)");
  assert.equal(L.nomeDaCopia("Lembrete (cópia)"), "Lembrete (cópia 2)");
  assert.equal(L.nomeDaCopia("Lembrete (cópia 2)"), "Lembrete (cópia 3)");
  assert.equal(L.nomeDaCopia("Lembrete", ["Lembrete (cópia)", "lembrete (copia 2)"]), "Lembrete (cópia 3)", "pula nomes que já existem (sem acento/caixa)");
  assert.ok(L.nomeDaCopia("x".repeat(80)).length <= 80);
  assert.match(L.nomeDaCopia("x".repeat(80)), / \(cópia\)$/, "corta a base, não o sufixo");
  const salvo = { nome: "A", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [{ tipo: "nota", texto: "a" }] };
  assert.equal(L.resumoDiferencas(salvo, salvo), "");
  assert.equal(L.resumoDiferencas({ ...salvo, nome: "B" }, salvo), "o nome mudou");
  assert.equal(L.resumoDiferencas({ ...salvo, nome: "B", acoes: [{ tipo: "nota", texto: "b" }, { tipo: "nota", texto: "c" }], condicoes: [{ campo: "origem", op: "igual", valor: "x" }] }, salvo),
    "o nome, 2 passos e 1 condição mudaram");
  assert.doesNotMatch(L.viaTextoLivre([{ id: 1, provedor: "meta" }]), /CodeWords/);
  assert.match(L.viaTextoLivre([{ id: 1, provedor: "meta" }]), /24 h/);
  assert.match(L.viaTextoLivre([{ id: 1, provedor: "codewords" }]), /conectado por aparelho/);   // plano 2000d · DU-025
  assert.equal(L.viaTextoLivre([]), "");
  assert.equal(L.viaTextoLivre([{ id: 1 }]), "", "sem provedor: não promete nada");
  assert.deepEqual(L.palavrasCurtas(["oi", "preço", "a", " é ", "valor"]), ["oi", "a", "é"]);
  assert.equal(L.rotuloCampoTempo("Horas parado na etapa"), "Tempo parado na etapa");
  assert.equal(L.rotuloCampoTempo("Quantas horas antes"), "Quanto tempo antes");
  assert.equal(L.rotuloCampoTempo("Quantas horas depois"), "Quanto tempo depois");
  assert.equal(L.rotuloCampoTempo("Prazo da tarefa"), "Prazo da tarefa");
  assert.equal(L.ACAO.enviar_mensagem.descricao, "Manda um texto pelo WhatsApp.", "UB-031: o catálogo não cita CodeWords");
});

/* ---------------------------------------------------------------- (b) peças */

test("UB-016 + UB-039 + UB-041 + UB-194 peças: teclado numérico, dia marcado no gráfico, «hoje», número desconectado", async () => {
  const d = comDom();
  try {
    const P = (await import("../web/app/auto-pecas.js")).pecas(await uiReal(), L);
    assert.equal(P.entrada({ rotulo: "Qtd", tipo: "number", passo: 1 }).querySelector("input").getAttribute("inputmode"), "numeric");
    assert.equal(P.entrada({ rotulo: "Qtd", tipo: "number" }).querySelector("input").getAttribute("inputmode"), "numeric");
    assert.equal(P.entrada({ rotulo: "Peso", tipo: "number", passo: 0.5 }).querySelector("input").getAttribute("inputmode"), "decimal");
    const porDia = L.execucoesPorDia([{ criado_em: new Date().toISOString(), estado: "concluida", ok: true }], { dias: 7 });
    const dia = porDia.serie.find(p => p.total).dia;
    const g = P.graficoDias({ ...porDia, aoEscolherDia: () => {}, diaAtivo: dia });
    const bt = g.querySelector(`button.au-gd-col[data-dia="${dia}"]`);
    assert.equal(bt.getAttribute("aria-pressed"), "true");
    assert.ok(bt.classList.contains("au-gd-col-ativa"));
    g.marcarDia(null);
    assert.equal(bt.getAttribute("aria-pressed"), "false");
    assert.match(textoDe(P.graficoDias({ serie: [{ dia: "2026-10-01", total: 0, ok: 0, erro: 0, espera: 0, pulado: 0, rotulo: "01/10", semana: "qua" }], dias: 1, n: 0 })), /Nenhuma execução hoje\./);
    assert.match(textoDe(P.graficoDias({ serie: [], dias: 7, n: 0 })), /Nenhuma execução nos últimos 7 dias\./);
    const op = P.opcoesBase({ base: { canais: [{ id: 1, nome: "Recepção", status: "erro" }, { id: 2, nome: "Vendas", status: "ativo" }, { id: 3, nome: "Novo", status: "pendente" }] } }, "canal");
    assert.deepEqual(op.map(o => o.rotulo), ["Recepção (desconectado)", "Vendas", "Novo (aguardando conexão)"]);
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (c) lista */

test("UB-012 + UB-184 + UB-070 + UB-186 + UB-046 lista: receita com nome, pílula fora do Tab, «automações do plano», Ctrl+Enter visível, h2 fora do summary", async () => {
  const d = comDom();
  try {
    const cf = comandosFalsos();
    const e = await abrirTela(d, { dados: dadosLista({ sistema: [{ nome: "Rodízio do departamento", descricao: "…" }] }), extra: { comandos: cf.comandos } });
    const raiz = e.raiz;
    const usar = raiz.querySelectorAll(".au-usar-receita");
    assert.ok(usar.length > 1);
    assert.ok(usar.every(b => /^Usar a receita «.+»$/.test(b.getAttribute("aria-label"))));
    assert.equal(new Set(usar.map(b => b.getAttribute("aria-label"))).size, usar.length, "cada uma diz qual");
    const pil = raiz.querySelector(".au-uso");
    assert.equal(pil.getAttribute("tabindex"), null, "a pílula não para no Tab");
    assert.equal(pil.firstChild.textContent, "2 de 8 automações do plano");
    assert.match(textoDe(raiz.querySelector(".au-ia-atalho")), /^(Ctrl|⌘)\+Enter para enviar$/);
    assert.equal(raiz.querySelector(".au-ia-txt").getAttribute("aria-keyshortcuts"), "Control+Enter Meta+Enter");
    const cmd = cf.cmds.find(c => c.id === "automacoes.ia-enviar");
    assert.ok(cmd && cmd.atalho === "Ctrl+Enter", "na folha «?» (atalhos da tela)");
    const h2 = raiz.querySelector("#au-sis");
    assert.equal(h2.localName, "h2");
    assert.equal(h2.closest("summary"), null, "o título não fica dentro do summary");
    assert.equal(textoDe(raiz.querySelector(".au-sis-sum")), "Ver a regra");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-217 cartão: «12 mensagens em 30 dias» só quando o servidor manda mensagens_30d", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[0].mensagens_30d = 12;
    const e = await abrirTela(d, { dados });
    const m = cartao(e.raiz, "a1").querySelector(".au-item-msgs");
    assert.equal(m.hidden, false);
    assert.equal(textoDe(m), "12 mensagens em 30 dias");
    assert.equal(cartao(e.raiz, "a2").querySelector(".au-item-msgs").hidden, true, "sem o dado, nada");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-255 + UB-050 «Pausar envios agora» diz o que continua; «Religar as mesmas» só religa as que ainda existem desligadas", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    const e = await abrirTela(d, { dados });
    const ativar = [];
    const rpcAntes = e.ctx.api.rpcC;
    e.ctx.api.rpcC = (n, p) => { if (n === "nx_automacao_ativar") ativar.push(p); return rpcAntes(n, p); };
    clicar(d, e.raiz.querySelector(".au-pausar")); await tique(8);
    assert.match(e.confirmacoes.at(-1).texto, /só criam tarefas, etiquetam ou avisam a equipe continuam ligadas/);
    const religar = e.toasts.at(-1)[1].acao;
    assert.equal(religar.rotulo, "Religar as mesmas");
    await religar.fn(); await tique(4);
    assert.equal(e.toasts.at(-1)[0], "1 automação religada.");
    assert.deepEqual(ativar.map(p => [p.p_id, p.p_ativo]), [["a3", false], ["a3", true]]);
    // pausa de novo; alguém exclui a3 no meio; «Religar as mesmas» não chama nada
    clicar(d, e.raiz.querySelector(".au-pausar")); await tique(8);
    const religar2 = e.toasts.at(-1)[1].acao;
    dados.itens.splice(dados.itens.findIndex(x => x.id === "a3"), 1);
    const antes = ativar.length;
    await religar2.fn(); await tique(4);
    assert.equal(ativar.length, antes, "nenhuma chamada para a excluída");
    assert.match(e.toasts.at(-1)[0], /Nenhuma para religar/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-257 ligar recusado por automacao_invalida: o toast leva ao editor («Abrir e corrigir»)", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d);
    const rpcAntes = e.ctx.api.rpcC;
    e.ctx.api.rpcC = (n, p) => (n === "nx_automacao_ativar" ? Promise.reject(Object.assign(new Error("automacao_invalida"), { codigo: "automacao_invalida" })) : rpcAntes(n, p));
    clicar(d, cartao(e.raiz, "a1").querySelector(".au-sw")); await tique(8);
    const [, o] = e.toasts.at(-1);
    assert.equal(o.tipo, "erro");
    assert.equal(o.acao.rotulo, "Abrir e corrigir");
    o.acao.fn();
    assert.equal(e.navegou.at(-1), "#/automacoes/a1");
    // outro erro (rede) não oferece o atalho
    e.ctx.api.rpcC = (n, p) => (n === "nx_automacao_ativar" ? Promise.reject(Object.assign(new Error("sem_conexao"), { codigo: "sem_conexao" })) : rpcAntes(n, p));
    clicar(d, cartao(e.raiz, "a4").querySelector(".au-sw")); await tique(8);
    assert.equal(e.toasts.at(-1)[1].acao, undefined);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-043 duplicar a cópia: «X (cópia 2)», sem repetir nome existente", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push({ ...dados.itens[0], id: "a5", nome: "Lembrete por mensagem (cópia)" });
    const salvos = [];
    const e = await abrirTela(d, { dados, rpcExtra: { nx_automacao_salvar: p => { salvos.push(p.p_auto); return { ...p.p_auto, id: "n1" }; } } });
    clicar(d, cartao(e.raiz, "a5").querySelector(".au-item-mais"));
    e.menus.at(-1).find(x => x.rotulo === "Duplicar").fn(); await tique(6);
    assert.equal(salvos.at(-1).nome, "Lembrete por mensagem (cópia 2)");
    clicar(d, cartao(e.raiz, "a1").querySelector(".au-item-mais"));
    e.menus.at(-1).find(x => x.rotulo === "Duplicar").fn(); await tique(6);
    assert.equal(salvos.at(-1).nome, "Lembrete por mensagem (cópia 2)", "a (cópia) já existe: pula para a 2");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-048 comando da paleta acha o cartão de id com «\\» e aspas (sem seletor CSS montado à mão)", async () => {
  const d = comDom();
  try {
    const cf = comandosFalsos();
    const id = 'x"\\y';
    const dados = dadosLista();
    dados.itens.push({ id, nome: "Estranha", gatilho: "negocio_estagio", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(11) },
      acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] });
    const e = await abrirTela(d, { dados, extra: { comandos: cf.comandos } });
    const ativar = [];
    const rpcAntes = e.ctx.api.rpcC;
    e.ctx.api.rpcC = (n, p) => { if (n === "nx_automacao_ativar") ativar.push(p); return rpcAntes(n, p); };
    cf.cmds.find(c => c.id === `automacoes.alternar.${id}`).fazer(); await tique(6);
    assert.deepEqual(ativar.map(p => [p.p_id, p.p_ativo]), [[id, false]], "desligou pelo interruptor do cartão certo");
    assert.equal(e.navegou.length, 0, "não caiu no «abrir a automação»");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-052 + UB-210 receitas: contagens seguem a busca; «outros segmentos» mostra as escondidas e fica lembrado", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d);
    const raiz = e.raiz;
    const chipWa = () => raiz.querySelectorAll(".au-modelos-filtro .au-chip").find(c => /^WhatsApp · /.test(c.textContent));
    const total = L.modelosDaVertical("odonto").filter(m => m.categoria === "whatsapp").length;
    assert.equal(chipWa().textContent, `WhatsApp · ${total}`);
    const busca = raiz.querySelector(".au-modelos-busca input");
    digitar(d, busca, "lembrete"); await esperar(200);
    const comIA = L.filtrarModelos(L.modelosDaVertical("odonto"), "lembrete", VOCAB).filter(m => m.categoria === "whatsapp").length;
    assert.ok(comIA < total, "a busca muda o número");
    assert.equal(chipWa().textContent, `WhatsApp · ${comIA}`);
    e.A.desmontar(); d.doc.body.removeChild(raiz);
    // loja: «Faltou? Remarcar» é escondida — o filtro mostra
    const e2 = await abrirTela(d, { dados: dadosLista({ vertical: "loja" }) });
    const escondida = L.MODELOS.find(m => m.id === "faltou_remarcar");
    const nome = `Usar a receita «${L.tituloModelo(escondida, VOCAB)}»`;
    const temEscondida = () => e2.raiz.querySelectorAll(".au-usar-receita").some(b => b.getAttribute("aria-label") === nome);
    assert.equal(temEscondida(), false);
    const chk = e2.raiz.querySelector(".au-modelos-outros-chk");
    assert.ok(chk);
    chk.checked = true; chk.dispatchEvent(new d.Evento("change"));
    assert.equal(temEscondida(), true);
    assert.equal(localStorage.getItem("nx-au-receitas-outros"), "1");
    e2.A.desmontar(); d.doc.body.removeChild(e2.raiz);
    const e3 = await abrirTela(d, { dados: dadosLista({ vertical: "loja" }) });
    assert.equal(e3.raiz.querySelector(".au-modelos-outros-chk").checked, true, "lembrado no aparelho");
    assert.ok(e3.raiz.querySelectorAll(".au-usar-receita").some(b => b.getAttribute("aria-label") === nome));
    e3.A.desmontar();
  } finally { d.fim(); }
});

test("UB-072 #/automacoes/nova?ia=1 sem montagem volta à lista com a caixa «Criar com IA» em foco", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["nova"], query: { ia: "1" } });
    assert.equal(e.navegou.at(-1), "#/automacoes");
    assert.equal(e.raiz.querySelector(".au-ed-cab"), null, "não abre o editor em branco");
    e.ctx.rota = { partes: [], query: {} };
    await e.A.montar(e.ctx); await tique(4);
    assert.ok(d.doc.activeElement && d.doc.activeElement.classList.contains("au-ia-txt"));
    e.A.desmontar();
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (d) editor */

test("UB-003 + UB-006 aba Execuções sem somar erros; «Salvar e continuar» troca botões, título e comando da paleta", async () => {
  const d = comDom();
  const hist = globalThis.history; globalThis.history = { state: null, replaceState() {} };
  try {
    const dados = dadosLista();
    dados.itens[0] = { ...dados.itens[0], execucoes: 10, erros: 2 };
    const e = await abrirTela(d, { partes: ["a1"], dados });
    const abaEx = e.raiz.querySelectorAll(".au-abas .aba").find(b => /Execuções/.test(b.textContent));
    assert.equal(textoDe(abaEx.querySelector(".abas-n")), "10", "o mesmo total do cartão (não 12)");
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const cf = comandosFalsos();
    const e2 = await abrirTela(d, { partes: ["nova"], query: { modelo: "orcamento" }, extra: { comandos: cf.comandos },
      rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto, id: "n9", execucoes: 0, erros: 0 }) } });
    assert.equal(cf.cmds.find(c => c.id === "automacoes.salvar").rotulo, "Criar automação");
    const nome = e2.raiz.querySelector(".au-nome-inp");
    if (!nome.value) digitar(d, nome, "Orçamento parado");
    clicar(d, e2.raiz.querySelector(".au-salvar-seguir")); await tique(10); await esperar(650);
    const sal = e2.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.classList.contains("bt-prim"));
    assert.equal(sal.textContent.trim(), "Salvar");
    assert.equal(e2.raiz.querySelector(".au-rodape-movel .bt-prim").textContent.trim(), "Salvar");
    assert.equal(textoDe(e2.raiz.querySelector("h1.sr-only")), `Automação: ${nome.value}`);
    const cmds = cf.cmds.filter(c => c.id === "automacoes.salvar");
    assert.equal(cmds.length, 1, "o comando antigo saiu");
    assert.equal(cmds[0].rotulo, "Salvar automação");
    e2.A.desmontar();
  } finally { if (hist === undefined) delete globalThis.history; else globalThis.history = hist; d.fim(); }
});

test("UB-014 + UB-021 validação: o alerta não é reescrito a cada tecla; a lateral espera parar de digitar", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1] = { ...dados.itens[1], acoes: [{ tipo: "criar_tarefa", titulo: "", dono: "responsavel" }, { tipo: "enviar_mensagem", texto: "Oi" }] };
    const e = await abrirTela(d, { partes: ["a2"], dados });
    const ei = e.raiz.querySelector(".au-passo .au-item-erro");
    assert.equal(ei.hidden, false);
    const no = ei.firstChild;
    assert.ok(no && /^Falta: /.test(no.textContent));
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Outro nome");
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Outro nome 2");
    assert.equal(ei.firstChild, no, "o mesmo texto: o nó não é trocado (o NVDA não repete)");
    // a lateral: variável errada só aparece depois de ~120 ms sem tecla (dentro do passo, na hora)
    const ta = e.raiz.querySelector(".au-passo-enviar_mensagem textarea");
    digitar(d, ta, "Oi {primeironome}");
    assert.ok(e.raiz.querySelector(".au-passo-enviar_mensagem .au-passo-aviso"), "no passo, na hora");
    assert.ok(!e.raiz.querySelectorAll(".au-aviso-lat").some(p => /variável desconhecida/.test(p.textContent)), "a lateral ainda não");
    await esperar(160);
    assert.ok(e.raiz.querySelectorAll(".au-aviso-lat").some(p => /Passo 2: variável desconhecida/.test(p.textContent)));
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-024 editor: «Respeitar horário» com departamento padrão sem horário — o passo diz que não sai e a lateral avisa", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, departamentos: [{ id: U(51), nome: "Recepção", padrao: true, horario: {} }] };
    dados.itens[0] = { ...dados.itens[0], respeitar_horario: true };
    const e = await abrirTela(d, { partes: ["a1"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-passo-enviar_mensagem .au-passo-quando")), /^Não sai: o departamento padrão está sem horário de atendimento$/);
    assert.match(textoDe(e.raiz.querySelector(".au-avisos")), /não tem horário de atendimento: as mensagens não sairiam/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-029 + UB-058 + UB-033 + UB-064 + UB-035 campos do «Quando»", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens.push(
      { id: "a5", nome: "Parado", gatilho: "tempo_no_estagio", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(13), horas: 48 }, acoes: [{ tipo: "criar_tarefa", titulo: "Cobrar", dono: "responsavel" }] },
      { id: "a6", nome: "Todo dia", gatilho: "agendado", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { horario: "09:00", dias_semana: [1] }, acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] },
      { id: "a7", nome: "Palavras", gatilho: "mensagem_recebida", ativo: false, execucoes: 0, erros: 0, condicoes: [], config: { palavras: ["oi", "preço"] }, acoes: [{ tipo: "criar_tarefa", titulo: "t", dono: "responsavel" }] });
    let e = await abrirTela(d, { partes: ["a5"], dados });
    assert.match(textoDe(e.raiz.querySelector(".au-campo-hr label")), /^Tempo parado na etapa/);
    assert.equal(e.raiz.querySelector(".au-teste-com").hidden, false, "gatilho do CRM: dá para testar com um registro");
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    e = await abrirTela(d, { partes: ["a6"], dados });
    assert.equal(textoDe(e.raiz.querySelector(".au-campo-hora .campo-ajuda")), "Horário de Brasília.");
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    e = await abrirTela(d, { partes: ["a7"], dados });
    const curtas = e.raiz.querySelector(".au-palavras-curtas");
    assert.equal(curtas.hidden, false);
    assert.match(textoDe(curtas), /«oi»: palavra muito curta — dispara em quase toda mensagem/);
    const inpP = e.raiz.querySelectorAll("input").find(i => i.getAttribute("placeholder") === "preço, valor, quanto custa");
    assert.match(inpP.getAttribute("aria-describedby"), new RegExp(curtas.id));
    digitar(d, inpP, "preço, valor");
    assert.equal(curtas.hidden, true);
    const fr = e.raiz.querySelector(".au-frase-inp");
    assert.equal(fr.getAttribute("aria-describedby"), e.raiz.querySelector(".au-frase-res").id);
    assert.equal(e.raiz.querySelector(".au-teste-com").hidden, true, "gatilho de conversa: sem busca de registro do funil");
    assert.equal(e.raiz.querySelector(".au-teste-conversa").hidden, false);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-020 + UB-188 + UB-054 + UB-056 + UB-060 + UB-253 editor: condições numeradas, horário travado sem mensagem, contador do nome, «Toque», prévia vazia", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1] = { ...dados.itens[1], condicoes: [{ campo: "texto", op: "contem", valor: "a" }, { campo: "texto", op: "contem", valor: "b" }],
      acoes: [{ tipo: "mover_estagio", estagio_id: U(12) }] };
    let e = await abrirTela(d, { partes: ["a2"], dados });
    const conds = e.raiz.querySelectorAll(".au-cond");
    assert.deepEqual(conds.map(c => [c.getAttribute("role"), c.getAttribute("aria-label")]), [["group", "Condição 1"], ["group", "Condição 2 (e)"]]);
    assert.ok(e.raiz.querySelectorAll(".au-mais").some(b => b.textContent.trim() === "Acrescentar condição"));
    const sw = e.raiz.querySelector(".au-horario .au-sw");
    assert.equal(sw.disabled, true, "sem passo de mensagem o interruptor não vale");
    assert.match(textoDe(d.doc.getElementById(sw.getAttribute("aria-describedby"))), /Só vale para passos que mandam mensagem/);
    const nome = e.raiz.querySelector(".au-nome-inp");
    digitar(d, nome, "x".repeat(70));
    const cont = e.raiz.querySelector(".au-nome-cont");
    assert.equal(cont.hidden, false);
    assert.equal(cont.textContent, "70/80");
    assert.match(nome.getAttribute("aria-describedby"), new RegExp(cont.id));
    digitar(d, nome, "curto");
    assert.equal(cont.hidden, true);
    clicar(d, e.raiz.querySelector(".au-var"));
    assert.equal(e.toasts.at(-1)[0], "Toque num texto de um passo e depois na variável.");
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const dados2 = dadosLista();
    dados2.itens[0] = { ...dados2.itens[0], acoes: [{ tipo: "enviar_mensagem", texto: "" }] };
    e = await abrirTela(d, { partes: ["a1"], dados: dados2 });
    const prev = e.raiz.querySelector(".au-msg-previa");
    assert.equal(prev.querySelector(".au-bolha").hidden, true, "a bolha não finge ser mensagem");
    assert.equal(textoDe(prev.querySelector(".au-bolha")), "");
    assert.equal(textoDe(prev.querySelector(".au-bolha-vazia")), "Escreva a mensagem para ver a prévia.");
    assert.equal(e.raiz.querySelector(".au-horario .au-sw").disabled, false, "com mensagem, o interruptor vale");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-031 + UB-066 paleta: «Enviar mensagem» sem CodeWords para quem só tem Meta; IA pontua o interesse do paciente", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, canais: [{ id: U(61), nome: "Oficial", provedor: "meta" }] };
    dados.itens[1] = { ...dados.itens[1], acoes: [{ tipo: "ia_decidir", tarefa: "pontuar_lead" }] };
    let e = await abrirTela(d, { partes: ["a2"], dados });
    const tile = e.raiz.querySelector('.au-tile[data-acao="enviar_mensagem"] small');
    assert.doesNotMatch(textoDe(tile), /CodeWords/);
    assert.match(textoDe(tile), /número oficial/);   // plano 2000d · DU-025
    const tit = e.raiz.querySelectorAll(".au-esc-tit").map(textoDe);
    assert.ok(tit.includes("Pontuar o interesse") && !tit.some(t => /lead/.test(t)));
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const dados2 = dadosLista(); dados2.base = { ...BASE, canais: [{ id: U(61), nome: "Recepção", provedor: "codewords" }] };
    e = await abrirTela(d, { partes: ["a2"], dados: dados2 });
    assert.match(textoDe(e.raiz.querySelector('.au-tile[data-acao="enviar_mensagem"] small')), /conectado por aparelho/);   // plano 2000d · DU-025
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-247 + UB-249 salvar com erro genérico foca a caixa do erro; o rascunho diz o que mudou", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    const e = await abrirTela(d, { partes: ["a2"], dados, rpcExtra: { nx_automacao_salvar: () => { throw Object.assign(new Error("sem_permissao"), { codigo: "sem_permissao" }); } } });
    digitar(d, e.raiz.querySelector(".au-nome-inp"), "Outro nome");
    clicar(d, e.raiz.querySelectorAll(".au-ed-acoes button").find(b => b.textContent.trim() === "Salvar")); await tique(10);
    const cx = e.raiz.querySelector(".au-erro-salvar");
    assert.equal(cx.hidden, false);
    assert.equal(cx.getAttribute("tabindex"), "-1");
    assert.equal(d.doc.activeElement, cx);
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    sessionStorage.setItem(L.chaveRascunho("cli-1", "conta-1", "a2"), L.empacotarRascunho({ ...dados.itens[1], nome: "Mexido", acoes: [...dados.itens[1].acoes, { tipo: "nota", texto: "n" }] }));
    const e2 = await abrirTela(d, { partes: ["a2"], dados });
    assert.match(textoDe(e2.raiz.querySelector(".au-rasc [role=status]")), /O nome e 1 passo mudaram\.$/);
    e2.A.desmontar();
    sessionStorage.removeItem(L.chaveRascunho("cli-1", "conta-1", "a2"));
  } finally { d.fim(); }
});

test("UB-251 trocar o funil do passo com etapa marcada avisa que a etapa foi limpa", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.base = { ...BASE, funis: [...BASE.funis, { id: U(2), nome: "Implantes", estagios: [{ id: U(21), nome: "Triagem" }] }] };
    dados.itens[1] = { ...dados.itens[1], acoes: [{ tipo: "mover_funil", funil_id: U(1), estagio_id: U(13) }] };
    const e = await abrirTela(d, { partes: ["a2"], dados });
    const n0 = e.toasts.length;
    const sel = e.raiz.querySelector(".au-passo-mover_funil select");
    sel.value = U(2); sel.dispatchEvent(new d.Evento("change"));
    assert.equal(e.toasts.length, n0 + 1);
    assert.match(e.toasts.at(-1)[0], /A etapa escolhida era de outro funil e foi limpa/);
    // sem etapa marcada, trocar de novo não avisa
    const sel2 = e.raiz.querySelector(".au-passo-mover_funil select");
    sel2.value = U(1); sel2.dispatchEvent(new d.Evento("change"));
    assert.equal(e.toasts.length, n0 + 1);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-192 + UB-078 «Testar com um registro» mostra «Buscando…»; o «Ver o fluxo» fica lembrado", async () => {
  const d = comDom();
  try {
    let e = await abrirTela(d, { partes: ["a1"], rpcExtra: { nx_buscar: async () => ({ negocios: [{ id: 1, titulo: "Maria" }] }) } });
    const b = e.raiz.querySelector(".au-teste-busca");
    const lista = e.raiz.querySelector(`#${b.getAttribute("aria-controls")}`);
    digitar(d, b, "Ma");
    assert.equal(lista.hidden, false);
    assert.equal(textoDe(lista), "Buscando…");
    await esperar(350); await tique(4);
    assert.equal(lista.querySelector(".au-teste-buscando"), null);
    assert.ok(lista.querySelector(".au-teste-op"));
    const bf = e.raiz.querySelector(".au-dg-toggle");
    const aberto = bf.getAttribute("aria-expanded") === "true";
    clicar(d, bf);
    assert.equal(localStorage.getItem("nx-au-fluxo"), aberto ? "fechado" : "aberto");
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    e = await abrirTela(d, { partes: ["a1"] });
    assert.equal(e.raiz.querySelector(".au-dg-toggle").getAttribute("aria-expanded"), String(!aberto), "volta como a pessoa deixou");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-074 simulação com mais de 12 passos diz «e mais N passos»", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a3"], rpcExtra: { nx_auto_simular: async () => ({ amostra: [{ titulo: "Maria",
      passos: Array.from({ length: 14 }, (_, i) => ({ n: i + 1, tipo: "nota", texto: `p${i}` })) }] }) } });
    clicar(d, e.raiz.querySelectorAll("button").find(x => /Testar agora/.test(x.textContent))); await tique(10);
    assert.equal(textoDe(e.raiz.querySelector(".au-sim-mais-passos")), "e mais 2 passos");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-005 + UB-018 + UB-039 + UB-190 execuções: sem «últimas 0»; «Cancelar» diz de quem; dia escolhido marcado; Atualizar com data-acao", async () => {
  const d = comDom();
  try {
    let e = await abrirTela(d, { partes: ["a4"], query: { aba: "execucoes" }, rpcExtra: { nx_automacao_execucoes: () => [], nx_automacao_execucoes_dia: async () => { throw new Error("sem"); } } });
    await tique(10);
    assert.doesNotMatch(textoDe(e.raiz.querySelector(".au-ex-cab")), /últimas 0/);
    e.A.desmontar(); d.doc.body.removeChild(e.raiz);
    const agora = Date.now();
    const lista = [
      { id: 1, criado_em: new Date(agora - 60e3).toISOString(), status: "espera", estado: "esperando", chave: "k1", contato_nome: "Maria", continua_em: new Date(agora + 3600e3).toISOString() },
      { id: 2, criado_em: new Date(agora - 90e3).toISOString(), status: "espera", estado: "esperando", chave: "k2", contato_nome: "João", continua_em: new Date(agora + 7200e3).toISOString() },
      { id: 3, criado_em: new Date(agora - 4 * 86400e3).toISOString(), status: "ok" }];
    e = await abrirTela(d, { partes: ["a2"], query: { aba: "execucoes" }, rpcExtra: { nx_automacao_execucoes: () => lista, nx_automacao_execucoes_dia: async () => { throw new Error("sem"); } } });
    await tique(10);
    const canc = e.raiz.querySelectorAll(".au-ex-acoes button").filter(b => b.textContent.trim() === "Cancelar").map(b => b.getAttribute("aria-label"));
    assert.equal(canc.length, 2);
    assert.match(canc[0], /^Cancelar a espera de Maria \(continua /);
    assert.match(canc[1], /^Cancelar a espera de João \(continua /);
    const barras = e.raiz.querySelectorAll("button.au-gd-col");
    assert.ok(barras.every(b => b.getAttribute("aria-pressed") === "false"));
    clicar(d, barras.at(-1)); await tique(2);
    assert.equal(barras.at(-1).getAttribute("aria-pressed"), "true");
    assert.ok(barras.at(-1).classList.contains("au-gd-col-ativa"));
    clicar(d, barras.at(-1)); await tique(2);
    assert.equal(barras.at(-1).getAttribute("aria-pressed"), "false", "tocar de novo tira o filtro");
    const atu = e.raiz.querySelectorAll("button").find(b => b.textContent.trim() === "Atualizar");
    assert.equal(atu.dataset.acao, "atualizar");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("UB-037 + UB-076 recarga automática: a série de 14 dias não é relida a cada 20 s; com foco na lista, «Há execuções novas»", async () => {
  const d = comDom();
  const agoraReal = Date.now;
  try {
    let batida = null, nDia = 0;
    const lista = execsFalsas(3);
    const e = await abrirTela(d, { partes: ["a2"], query: { aba: "execucoes" }, extra: { pulso: { assinar: f => { batida = f; return () => {}; } } },
      rpcExtra: { nx_automacao_execucoes: () => lista.slice(), nx_automacao_execucoes_dia: async () => { nDia++; throw new Error("sem"); } } });
    await tique(10);
    assert.equal(nDia, 1);
    let dt = 0;
    Date.now = () => agoraReal() + dt;
    for (let k = 1; k <= 3; k++) { dt = k * 21000; batida(); await tique(8); }
    assert.equal(nDia, 1, "a lista não mudou e não passaram 5 min: a série fica a mesma");
    lista.unshift({ id: 99, criado_em: new Date(agoraReal()).toISOString(), status: "ok" });
    dt = 4 * 21000; batida(); await tique(8);
    assert.equal(nDia, 2, "chegou execução nova: a série é relida");
    // foco num «Detalhes»: não troca a lista, mas avisa quando há novas
    e.raiz.querySelector(".au-ex-det-bt").focus();
    lista.unshift({ id: 100, criado_em: new Date(agoraReal()).toISOString(), status: "erro" });
    dt = 5 * 21000; batida(); await tique(8);
    const faixa = e.raiz.querySelector(".au-ex-novas");
    assert.ok(faixa);
    assert.match(textoDe(faixa), /Há execuções novas\./);
    assert.equal(faixa.querySelector("button").dataset.acao, "atualizar");
    e.A.desmontar();
  } finally { Date.now = agoraReal; d.fim(); }
});

test("UB-080 + UB-046 CSS: a nota do interruptor quebra linha; o summary «Ver as regras» tem alvo de 44 px", () => {
  const css = ler("web/app/automacoes.css");
  const nota = css.match(/\.au-sw-nota \{[^}]*\}/)[0];
  assert.doesNotMatch(nota, /nowrap/);
  assert.match(nota, /white-space: normal/);
  assert.match(css, /\.au-sis-sum \{[^}]*min-height: 44px/);
  assert.match(css, /\.au-gd-clicavel button\.au-gd-col-ativa/);
});

/* ================================================================== revisão 1000b */
const SEL_ESCRITA_APP = (/const SEL_ESCRITA = "([^"]+)"/.exec(ler("web/app/app.js")) || [])[1] || "";
const ehEscrita = b => !!b && b.getAttribute("data-escrita") !== null;

test("UB-122 (revisão 1000b) · «Salvar» do editor (topo e rodapé) e «Pausar envios agora» são botões de escrita (data-escrita: sem internet o shell avisa antes)", async () => {
  assert.match(SEL_ESCRITA_APP, /\[data-escrita\]/, "o shell marca [data-escrita]");
  const d = comDom();
  try {
    const lista = await abrirTela(d, {});
    const pausar = lista.raiz.querySelector(".au-pausar");
    assert.ok(pausar, "a lista tem o «Pausar envios agora»");
    assert.ok(ehEscrita(pausar), "antes: o Pausar não era marcado sem internet");
    lista.A.desmontar();
    const ed = await abrirTela(d, { partes: ["a1"] });
    const salvar = ed.raiz.querySelectorAll("button").filter(b => /^\s*Salvar\s*$/.test(b.textContent));
    assert.equal(salvar.length, 2, "Salvar do topo e do rodapé (celular)");
    assert.ok(salvar.every(ehEscrita), "antes: o Salvar do editor (type=button, fora de form e de .modal-rod) escapava do SEL_ESCRITA");
    ed.A.desmontar();
  } finally { d.fim(); }
});

test("UB-209 (revisão 1000b) · o esqueleto da tela de Automações fala «Carregando…» uma vez só", async () => {
  for (const partes of [[], ["a1"]]) {
    const d = comDom();
    try {
      const ui = await uiReal();
      const A = await import("../web/app/automacoes.js");
      let soltar;
      const t = ctxAuto(ui, { partes, rpc: () => new Promise(r => { soltar = () => r(dadosLista()); }) });
      const p = A.montar(t.ctx); await tique(2);
      const esq = t.ctx.alvo.querySelector(".au-esq");
      assert.ok(esq, "esqueleto na tela");
      assert.equal(esq.querySelectorAll("[role=status]").length, 1, `antes: cada pedaço anunciava (${partes.length ? "editor" : "lista"})`);
      soltar(); await p; await tique(4);
      A.desmontar();
    } finally { d.fim(); }
  }
});
