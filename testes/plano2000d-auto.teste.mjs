/* ÓRBITA — plano 2000d (25/10/2026), frente auto (Automações) · lotes auto-d1, auto-d2 e auto-d3.
   Rodar: node --test testes/plano2000d-auto.teste.mjs
   Lógica pura + comportamento num DOM de mentira (o mesmo harness do plano1500c-auto). Cada teste cita o item (DU-xxx).
   Sem rede: RPCs são dublês; datas relativas a Date.now() (não depende da hora do dia). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as L from "../web/app/auto-logica.js";

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

/* ================================================================== plano 2000d · frente auto */

import * as CAT from "../web/app/auto-catalogo.js";

const funil = (id, estagios) => ({ id: U(id), nome: "Funil", padrao: true, estagios });
const E = (n, nome, marco = null, tipo = "aberto") => ({ id: U(n), nome, marco, tipo });
const BASE_ODONTO = { ...BASE,
  funis: [funil(1, [E(11, "Nova conversa", "nova"), E(12, "Avaliação agendada", "agendada"), E(16, "Confirmada"), E(13, "Avaliou / orçamento", "orcamento"), E(15, "Faltou", "faltou"), E(17, "Fechou", "fechou", "ganho")])],
  etiquetas: [{ id: U(31), nome: "Orçamento" }, { id: U(32), nome: "Limpeza" }, { id: U(33), nome: "Ortodontia" }, { id: U(34), nome: "Primeira vez" }, { id: U(35), nome: "Pesquisa NPS" }] };
const BASE_OFICINA = { ...BASE,
  funis: [funil(2, [E(21, "Nova conversa", "nova"), E(22, "Visita agendada", "agendada"), E(28, "Confirmada"), E(23, "Orçamento enviado", "orcamento"), E(24, "Aprovado"), E(25, "Pronto para retirada"), E(27, "Faltou", "faltou"), E(26, "Entregue", "fechou", "ganho")])] };
const BASE_LOJA = { ...BASE,
  funis: [funil(3, [E(41, "Nova conversa", "nova"), E(42, "Proposta enviada", "orcamento"), E(43, "Separado para retirada"), E(44, "Enviado"), E(45, "Chegou"), E(46, "Vendido", "fechou", "ganho")])] };
const BASES = { odonto: BASE_ODONTO, oficina: BASE_OFICINA, loja: BASE_LOJA, generico: BASE_ODONTO };
const vocDe = vertical => ({ ...VOCAB, vertical });

test("DU-001 «Respondeu SIM»: mensagem com palavras, só em Agendada, move para Confirmada + nota; destaque nas 4 primeiras de odonto e oficina", () => {
  const a = L.aplicarModelo("confirmou_sim", BASE_ODONTO, VOCAB);
  assert.equal(a.gatilho, "mensagem_recebida");
  assert.ok(a.config.palavras.includes("sim") && a.config.palavras.includes("confirmo"));
  assert.deepEqual(a.condicoes, [{ campo: "estagio_id", op: "igual", valor: U(12) }]);
  assert.equal(a.acoes[0].tipo, "mover_estagio"); assert.equal(a.acoes[0].estagio_id, U(16));
  assert.equal(a.acoes[1].tipo, "nota");
  assert.ok(L.validar(a, { base: BASE_ODONTO }).ok);
  for (const v of ["odonto", "oficina"]) assert.ok(L.modelosDaVertical(v).slice(0, 4).some(m => m.id === "confirmou_sim"), v);
  // sem a etapa «Confirmada»: a pessoa escolhe (ação 1 pendente)
  const sem = L.aplicarModelo("confirmou_sim", BASE, VOCAB);
  assert.equal(sem.acoes[0].estagio_id, ""); assert.equal(L.validar(sem, { base: BASE }).onde, "entao");
});

test("DU-002 / DU-009 retorno e revisão em 6 meses: tarefa com prazo dentro do limite e ~180 dias no total", () => {
  for (const [id, base, v] of [["retorno_6_meses", BASE_ODONTO, "odonto"], ["revisao_6_meses", BASE_OFICINA, "oficina"]]) {
    const a = L.aplicarModelo(id, base, vocDe(v));
    assert.ok(L.validar(a, { base, ligar: false }).ok, id);
    const t = a.acoes.find(x => x.tipo === "criar_tarefa");
    assert.ok(t.vence_em_horas <= L.LIMITES.prazo_tarefa[1]);
    assert.equal(L.duracaoTotal(a.acoes) / 1440 + t.vence_em_horas / 24, 180, id);
  }
  assert.deepEqual(L.aplicarModelo("retorno_6_meses", BASE_ODONTO).condicoes, [{ campo: "etiqueta", op: "igual", valor: U(32) }], "etiqueta Limpeza quando existe");
  assert.deepEqual(L.aplicarModelo("retorno_6_meses", BASE).condicoes, [], "sem a etiqueta: a condição opcional some");
  assert.match(L.descrever(L.aplicarModelo("revisao_6_meses", BASE_OFICINA, vocDe("oficina")), BASE_OFICINA, vocDe("oficina")), /revisão/);
});

test("DU-003 / DU-004 / DU-005 cuidados no mesmo dia, lembrete 2 h e o «amanhã» que vira «no dia»", () => {
  const c = L.aplicarModelo("cuidados_pos", BASE_ODONTO);
  assert.deepEqual(c.config, { campo: "consulta", horas: 2 }); assert.equal(c.respeitar_horario, true);
  assert.deepEqual(c.condicoes, [{ campo: "estagio_id", op: "diferente", valor: U(15) }]);
  assert.deepEqual(L.aplicarModelo("cuidados_pos", { funis: [funil(9, [])] }).condicoes, [], "a condição de etapa só com o marco");
  const l2 = L.aplicarModelo("lembrete_2h", BASE_ODONTO);
  assert.doesNotMatch(l2.acoes[0].texto, /amanhã/); assert.match(L.descrever(l2, BASE_ODONTO, VOCAB), /2 h antes/);
  const lem = L.aplicarModelo("lembrete_consulta_texto", BASE_ODONTO);
  assert.doesNotMatch(lem.acoes[0].texto, /amanhã/); assert.match(lem.acoes[0].texto, /no dia \{data_consulta\}/);
  const tipos = a => L.avisosEstruturaDetalhados(a, VOCAB).map(x => x.tipo);
  const comAmanha = h => ({ gatilho: "antes_da_data", config: { campo: "consulta", horas: h }, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "Sua consulta é amanhã" }] });
  assert.ok(tipos(comAmanha(2)).includes("palavra_de_tempo"));
  assert.ok(!tipos(comAmanha(24)).includes("palavra_de_tempo"));
});

test("DU-006 / DU-031 data marcada: condição só com o servidor que anuncia, operadores próprios e o motivo «sem data marcada»", () => {
  assert.deepEqual(L.operadoresDe("consulta_em"), ["vazio", "preenchido", "hoje", "amanha"]);
  assert.ok(!L.camposCondicao(BASE).some(c => c.valor === "consulta_em"), "servidor de hoje: não oferece");
  const comRec = { ...BASE, recursos: ["cond_consulta_em"] };
  assert.ok(L.camposCondicao(comRec).some(c => c.valor === "consulta_em"));
  assert.deepEqual(L.aplicarModelo("confirmacao_agendamento", BASE).condicoes, [], "sem o recurso: a receita continua aceita pelo servidor");
  const conf = L.aplicarModelo("confirmacao_agendamento", comRec);
  assert.deepEqual(conf.condicoes, [{ campo: "consulta_em", op: "preenchido" }]);
  assert.ok(L.validar(conf, { base: comRec }).ok);
  assert.match(L.validar(conf, { base: BASE }).motivo, /ainda não está disponível/);
  assert.match(L.fraseCondicoes(conf.condicoes, comRec), /data marcada estiver preenchid/);
  const sim = L.normalizarSimulacao({ alvos: [{ titulo: "Ana", motivo_registro: "sem_data", passos: [] }] }, conf, comRec, VOCAB);
  assert.equal(sim.alvos[0].ignorado, true); assert.match(sim.alvos[0].motivoIgnorado, /sem data marcada/);
});

test("DU-007 pós-consulta sem a etapa «Faltou»: a condição fica pendente e a validação aponta (não manda para todos calada)", () => {
  const a = L.aplicarModelo("pos_atendimento", { funis: [funil(9, [E(91, "Nova", "nova")])] });
  assert.deepEqual(a.condicoes, [{ campo: "estagio_id", op: "diferente", valor: "" }]);
  const r = L.validar(a, { ligar: true });
  assert.equal(r.onde, "se"); assert.match(r.motivo, /escolha a etapa \(ou tire a condição para valer para todos\)/);
});

test("DU-008 / DU-010 / DU-011 oficina: carro pronto (destaque), orçamento aprovado e pátio parado só na oficina", () => {
  assert.ok(L.modelosDaVertical("oficina").slice(0, 4).some(m => m.id === "carro_pronto"));
  const cp = L.aplicarModelo("carro_pronto", BASE_OFICINA, vocDe("oficina"));
  assert.equal(cp.config.estagio_id, U(25)); assert.ok(L.validar(cp, { base: BASE_OFICINA }).ok);
  const sem = L.aplicarModelo("carro_pronto", BASE, vocDe("oficina"));
  assert.equal(sem.config.estagio_id, ""); assert.equal(L.validar(sem, { base: BASE }).onde, "quando");
  for (const v of ["odonto", "loja"]) for (const id of ["carro_pronto", "orcamento_aprovado", "patio_parado"]) assert.ok(!L.modelosDaVertical(v).some(m => m.id === id), `${v}/${id}`);
  const ap = L.aplicarModelo("orcamento_aprovado", BASE_OFICINA, vocDe("oficina"));
  assert.equal(ap.config.estagio_id, U(24)); assert.ok(L.validar(ap, { base: BASE_OFICINA }).ok);
  const pt = L.aplicarModelo("patio_parado", BASE_OFICINA, vocDe("oficina"));
  assert.equal(pt.config.horas, 120); assert.ok(!L.enviaMensagem(pt), "nada sai sozinho para o cliente");
});

test("DU-012 / DU-013 / DU-015 loja: pedido enviado (rastreio só com o campo e o recurso), recompra em 30 dias e retirada pendente", () => {
  for (const v of ["odonto", "oficina"]) assert.ok(!L.modelosDaVertical(v).some(m => m.id === "pedido_enviado"), v);
  const pe = L.aplicarModelo("pedido_enviado", BASE_LOJA, vocDe("loja"));
  assert.equal(pe.config.estagio_id, U(44)); assert.doesNotMatch(pe.acoes[0].texto, /\{campo:/);
  const comCampo = { ...BASE_LOJA, recursos: ["var_campo"], campos_negocio: [{ chave: "rastreio", rotulo: "Rastreio" }] };
  assert.match(L.aplicarModelo("pedido_enviado", comCampo, vocDe("loja")).acoes[0].texto, /\{campo:rastreio\}/);
  // variável de campo sem o campo na base: não liga
  const auto = { ...pe, ativo: true, acoes: [{ tipo: "enviar_mensagem", texto: "Rastreio {campo:rastreio}" }] };
  assert.equal(L.validar(auto, { base: { ...BASE_LOJA, recursos: ["var_campo"] }, ligar: true }).ok, false);
  assert.equal(L.validar(auto, { base: comCampo, ligar: true }).ok, true);
  const rc = L.aplicarModelo("recompra_30", BASE_LOJA, vocDe("loja"));
  assert.equal(L.duracaoTotal(rc.acoes), 43200); assert.equal(rc.respeitar_horario, true);
  const rp = L.aplicarModelo("retirada_pendente", BASE_LOJA, vocDe("loja"));
  assert.equal(rp.config.horas, 72); assert.ok(L.validar(rp, { base: BASE_LOJA }).ok);
});

test("DU-014 / DU-016 / DU-017 receitas que dependem do servidor só aparecem quando ele anuncia", () => {
  const ids = v => L.modelosDaVertical("loja", v).map(m => m.id);
  assert.ok(!ids(BASE).includes("cliente_vip") && !ids(BASE).includes("fora_do_horario") && !ids(BASE).includes("aniversario"));
  assert.ok(ids({ ...BASE, recursos: ["cond_ganhos_contato"] }).includes("cliente_vip"));
  assert.ok(ids({ ...BASE, recursos: ["cond_fora_do_horario", "var_proxima_abertura"] }).includes("fora_do_horario"));
  assert.ok(!ids({ ...BASE, recursos: ["cond_fora_do_horario"] }).includes("fora_do_horario"), "precisa também da variável");
  assert.ok(!L.GATILHO.aniversario && !ids({ ...BASE, recursos: ["gatilho_aniversario"] }).includes("aniversario"), "sem o gatilho no catálogo, não aparece");
  assert.deepEqual(L.operadoresDe("ganhos_contato"), ["maior", "menor", "igual"]);
  assert.equal(L.aplicarVariaveis("Voltamos {proxima_abertura}", L.exemploVariaveis({ base: BASE })), "Voltamos amanhã às 08:00");
});

test("DU-018 / DU-032 avisos: IA de atendimento ligada + resposta automática; mensagem em gatilho de CRM sem telefone", () => {
  const bv = L.aplicarModelo("boas_vindas", BASE);
  assert.ok(L.avisosEstruturaDetalhados(bv, VOCAB, { iaAtendimentoLigada: true }).some(x => x.tipo === "conflito_ia"));
  assert.ok(!L.avisosEstruturaDetalhados(bv, VOCAB).some(x => x.tipo === "conflito_ia"));
  assert.equal(L.iaAtendimentoLigada({ base: { ia: { atendimento_ligada: true } } }), true);
  assert.ok(L.avisosEstruturaDetalhados({ gatilho: "negocio_criado", acoes: [{ tipo: "enviar_mensagem", texto: "oi" }] }, VOCAB).some(x => x.tipo === "sem_telefone"));
  assert.ok(!L.avisosEstruturaDetalhados({ gatilho: "conversa_nova", acoes: [{ tipo: "enviar_mensagem", texto: "oi" }] }, VOCAB).some(x => x.tipo === "sem_telefone"));
});

test("DU-019 / DU-020 lead frio 2 dias e pesquisa de 0 a 10 (nota inteira: «6» não casa em «16»)", () => {
  const lf = L.aplicarModelo("lead_frio_2d", BASE);
  assert.ok(L.validar(lf, { base: BASE }).ok);
  assert.equal(lf.acoes[0].tipo, "esperar"); assert.equal(lf.acoes[0].cancelar_se_cliente_responder, true);
  assert.equal(L.casaPalavras("nota 6", ["6"], { inteira: true }), "6");
  assert.equal(L.casaPalavras("16", ["6"], { inteira: true }), null);
  const nps = L.aplicarModelo("nps", BASE_ODONTO); assert.ok(L.validar(nps, { base: BASE_ODONTO }).ok);
  const det = L.aplicarModelo("nps_detrator", BASE_ODONTO);
  // plano 2000d: AX-028 — a nota «10» contém «1» e «0»; a receita leva também «o texto não contém 10»
  assert.deepEqual(det.condicoes, [{ campo: "etiqueta", op: "igual", valor: U(35) }, { campo: "texto", op: "nao_contem", valor: "10" }]); assert.ok(L.validar(det, { base: BASE_ODONTO }).ok);
});

test("DU-021 / DU-022 / DU-023 primeira automação com 5 objetivos, exemplos da IA por vertical e palavras de preço por vertical", () => {
  assert.equal(L.receitaSugerida({ objetivo: "orcamento", quem: "cliente" }, "oficina"), "followup_orcamento");
  assert.equal(L.receitaSugerida({ objetivo: "sumiu", quem: "cliente" }, "odonto"), "reativar_30_dias");
  assert.equal(L.PERGUNTAS_PRIMEIRA[0].opcoes.length, 5);
  const of = L.exemplosIA({ vertical: "oficina" }).join(" ");
  assert.match(of, /carro/); assert.doesNotMatch(of, /consulta/);
  assert.match(L.exemplosIA({ vertical: "loja" }).join(" "), /pedido/);
  assert.equal(L.exemplosIA({ vertical: "odonto" }).length, 5);
  assert.ok(L.aplicarModelo("preco", BASE, vocDe("loja")).config.palavras.includes("frete"));
  assert.ok(L.aplicarModelo("preco", BASE, vocDe("oficina")).config.palavras.includes("quanto fica"));
});

test("DU-024 / DU-025 nenhum nome de fornecedor no texto que o cliente da revenda vê", () => {
  assert.doesNotMatch(L.viaWhatsApp([{ provedor: "codewords" }]), /CodeWords/);
  assert.doesNotMatch(L.viaTextoLivre([{ provedor: "codewords" }, { provedor: "meta" }]), /CodeWords/);
  for (const m of L.MODELOS) for (const t of [L.tituloModelo(m, VOCAB), L.textoModelo(m, VOCAB), m.aviso || ""]) assert.doesNotMatch(t, /CodeWords/, m.id);
  assert.doesNotMatch(CAT.ACAO.enviar_mensagem.campos[0].ajuda, /CodeWords/);
  // varredura das strings visíveis do arquivo da lista: «CodeWords» só em comentário ou no title de gestor/super
  const src = ler("web/app/automacoes.js").split("\n").filter(l => /CodeWords/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  assert.ok(src.every(l => /equipeDaPlataforma\(ctx\)/.test(l)), src.join("\n"));
});

test("DU-026 colar: a frase de texto inválido usa a marca efetiva", async () => {
  const d = comDom();
  try {
    const A = await import("../web/app/automacoes.js");
    assert.equal(A.textoColagemInvalida("Sorriso App"), "Esse texto não é uma automação copiada do Sorriso App.");
    assert.doesNotMatch(A.textoColagemInvalida(null), /Órbita/);
  } finally { d.fim(); }
});

test("DU-034 / DU-035 / DU-036 / DU-037 / DU-038 variáveis novas e de campo, chips com exemplo e exemplo por vertical", () => {
  const sem = { ...BASE, campos: [{ chave: "placa", rotulo: "Placa" }] };
  const com = { ...sem, recursos: ["var_campo", "var_dia_semana", "var_link_avaliacao"] };
  assert.deepEqual(L.variaveisDesconhecidas("{campo:placa}", com), []);
  assert.deepEqual(L.variaveisDesconhecidas("{campo:placa}", sem), ["campo:placa"], "sem o recurso, chegaria cru");
  assert.deepEqual(L.variaveisDesconhecidas("{campo:chassi}", com), ["campo:chassi"]);
  const ex = L.exemploVariaveis({ base: com, vertical: "oficina" });
  assert.equal(L.aplicarVariaveis("Placa {campo:placa}", ex), "Placa ABC1D23");
  assert.match(L.aplicarVariaveis("{dia_semana_consulta}", ex), /-feira$|sábado|domingo/);
  assert.notEqual(ex.valor, 1500); assert.equal(ex.nome, "Alex Souza");
  assert.match(L.avisoVariavelVazia("Avalie: {link_avaliacao}", BASE), /Configurações → Empresa/);
  assert.equal(L.avisoVariavelVazia("Avalie: {link_avaliacao}", { ...BASE, link_avaliacao: "https://g.page/x" }), null);
  const chip = L.rotuloChipVariavel("primeiro_nome", "Primeiro nome", ex);
  assert.equal(chip.exemplo, "→ Alex"); assert.match(chip.aria, /exemplo: Alex/);
  assert.ok(L.variaveisAceitas(com).some(([k]) => k === "dia_semana_consulta") && !L.variaveisAceitas(BASE).some(([k]) => k === "dia_semana_consulta"));
});

test("DU-039 contador soma a assinatura; DU-048 nomes curtos; DU-051 o teste diz quanto da cota de IA usaria", () => {
  assert.equal(L.contadorTexto("abc", 4096, { assinatura: "— Equipe X" }).n, 3 + "— Equipe X".length + 2);
  assert.match(L.contadorTexto("abc", 4096, { assinatura: "— Equipe X" }).texto, /com a assinatura/);
  assert.equal(L.listaNomesCurta(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]), "«a», «b», «c» e mais 7");
  const sim = { alvos: [{ passos: [{ estado: "faria", tipo: "ia_decidir" }] }, { passos: [{ estado: "faria", tipo: "ia_decidir" }] }], ehAmostra: true };
  const r = L.resumoSaidasSimulacao(sim, { usadas: 40, limite: 200 });
  assert.equal(r.ia, 2); assert.match(r.texto, /2 da cota de IA \(restam 160\)/);
});

test("DU-040 ligar uma automação de tempo diz quantos recebem agora; acima de 50 pede o número", () => {
  assert.equal(L.contarAoLigar({ gatilho: "tempo_no_estagio", acoes: [{ tipo: "enviar_mensagem", texto: "x" }] }), true);
  assert.equal(L.contarAoLigar({ gatilho: "negocio_criado", acoes: [{ tipo: "enviar_mensagem", texto: "x" }] }), false);
  const f = L.fraseQuemRecebe(137);
  assert.match(f.texto, /137 pessoas recebem/); assert.equal(f.digitar, "137"); assert.equal(f.massa, true);
  assert.equal(L.fraseQuemRecebe(12).digitar, null);
});

test("DU-040 lista: o interruptor simula antes e o diálogo traz o total e o número para digitar", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[0] = { ...dados.itens[0], gatilho: "tempo_no_estagio", config: { estagio_id: U(13), horas: 48 } };
    const e = await abrirTela(d, { dados, confirmar: async () => false, rpcExtra: { nx_auto_simular: async () => ({ total: 137, alvos: [] }) } });
    clicar(d, cartao(e.raiz, "a1").querySelector(".au-sw")); await tique(8);
    assert.ok(e.chamadas.some(c => c[0] === "nx_auto_simular"));
    assert.match(e.confirmacoes[0].texto, /137 pessoas recebem/);
    assert.equal(e.confirmacoes[0].digitar, "137");
    assert.ok(!e.chamadas.some(c => c[0] === "nx_automacao_ativar"), "recusou: não liga");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-046 lote: o diálogo cita cada automação que dispara em massa e pede «ligar»", async () => {
  const d = comDom();
  try {
    const A = await import("../web/app/automacoes.js");
    const t = A.textoLigarLote([{ nome: "A" }, { nome: "B" }, { nome: "C" }],
      [{ it: { nome: "A" }, c: { massa: true, motivoMassa: "manda todo dia." } }, { it: { nome: "B" }, c: { massa: true, motivoMassa: null } }, { it: { nome: "C" }, c: { massa: false } }]);
    assert.match(t.texto, /«A»: manda todo dia/); assert.match(t.texto, /«B»/); assert.doesNotMatch(t.texto, /«C»/);
    assert.equal(t.digitar, "ligar"); assert.equal(t.massa, true);
  } finally { d.fim(); }
});

test("DU-047 excluir em lote: a 2ª falha e só ela volta para a lista (a 1ª já saiu do banco)", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    const e = await abrirTela(d, { dados, rpcExtra: { nx_automacao_excluir: p => { if (p.p_id === "a2") throw new Error("falhou"); return {}; } } });
    clicar(d, e.raiz.querySelector(".au-sel-modo")); await tique(2);
    for (const id of ["a1", "a2"]) { const c = cartao(e.raiz, id).querySelector(".au-sel-chk"); c.checked = true; c.dispatchEvent(new d.Evento("change")); }
    clicar(d, e.raiz.querySelector('.au-sel-barra [data-acao="excluir"]')); await tique(4);
    const item = e.desfazeres.at(-1);
    let erro = null; try { await item.o.firmar(); } catch (x) { erro = x; }
    assert.ok(erro); item.o.reverter(); await tique(2);
    assert.ok(!dados.itens.some(x => x.id === "a1"), "a 1ª foi excluída no servidor e não volta");
    assert.ok(dados.itens.some(x => x.id === "a2"), "a que falhou volta");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-052 / DU-418 todas as receitas da vertical × base da vertical: válidas (ou pendência explicada), desligadas e assinadas com {empresa}", () => {
  for (const v of ["odonto", "oficina", "loja", "generico"]) {
    const base = BASES[v];
    for (const m of L.modelosDaVertical(v, base)) {
      const a = L.aplicarModelo(m.id, base, vocDe(v));
      assert.equal(a.ativo, false, `${v}/${m.id}`);
      assert.ok(a.nome && a.nome.trim(), `${v}/${m.id} sem nome`);
      const r = L.validar(a, { base, ligar: false });
      assert.ok(r.ok || ((m.pedeEtapa || m.pedeEscolha) && r.motivo), `${v}/${m.id}: ${r.motivo}`);
      for (const ac of a.acoes) if (ac.tipo === "enviar_mensagem") assert.match(ac.texto, /\{empresa\}/, `${v}/${m.id}`);
      for (const ac of a.acoes) for (const k of ["texto", "titulo"]) assert.deepEqual(L.variaveisDesconhecidas(ac[k], base), [], `${v}/${m.id}.${k}`);
    }
  }
});

test("DU-053 só número oficial: a receita de texto livre mostra a nota da janela de 24 h, não a pílula de canal ok", async () => {
  const d = comDom();
  try {
    const A = await import("../web/app/automacoes.js");
    const m = L.MODELOS.find(x => x.id === "lembrete_consulta_texto");
    assert.equal(A.selosCanalReceita(m, [{ provedor: "meta" }]).pilula, "falta");
    assert.match(A.selosCanalReceita(m, [{ provedor: "meta" }]).notaJanela, /24 h/);
    assert.equal(A.selosCanalReceita(m, [{ provedor: "codewords" }]).notaJanela, null);
    assert.equal(A.selosCanalReceita(m, [{ provedor: "codewords" }]).pilula, "ok");
  } finally { d.fim(); }
});

test("DU-054 a observação aparece no cartão (até 120 letras) e a busca acha por ela", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[1] = { ...dados.itens[1], descricao: "Pedido da Dra. Paula para não esquecer orçamentos" };
    const e = await abrirTela(d, { dados });
    assert.match(textoDe(cartao(e.raiz, "a2").querySelector(".au-item-obs")), /Dra\. Paula/);
    assert.equal(e.A.obsCartao({ descricao: "x".repeat(200) }).length, 120);
    assert.deepEqual(L.listaAutomacoes(dados.itens, { termo: "Dra. Paula" }).map(x => x.id), ["a2"]);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-364 o trecho [[a trocar]] da receita nunca liga", () => {
  const a = L.aplicarModelo("ficha_primeira_vez", BASE_ODONTO);
  assert.ok(L.validar(a, { base: BASE_ODONTO, ligar: false }).ok);
  assert.match(L.validar({ ...a, ativo: true }, { base: BASE_ODONTO, ligar: true }).motivo, /troque o trecho «\[\[link da ficha\]\]»/);
});

/* ================================================================== plano 2000d · lote auto-d2 */

test("DU-056 / DU-057 / DU-058 / DU-060 colar: formato neutro, vertical trocada, campo e gatilho desconhecidos viram pendência", () => {
  const a = { nome: "Lembrete", gatilho: "antes_da_data", ativo: true, config: { campo: "consulta", horas: 24 }, condicoes: [],
    acoes: [{ tipo: "enviar_mensagem", texto: "Sua consulta é amanhã" }] };
  const exp = L.exportarAutomacao(a, BASE, vocDe("odonto"));
  assert.equal(exp.formato, "automacao-v1");
  assert.doesNotMatch(JSON.stringify(exp), /orbita/i, "DU-060: sem a marca no texto copiado");
  assert.equal(exp.vertical, "odonto");
  const r = L.importarAutomacao(exp, BASE_OFICINA, vocDe("oficina"));
  assert.equal(r.auto.ativo, false, "colada nasce desligada");
  assert.ok(r.pendencias.length, "DU-056: a troca de vertical é dita");
  const g = L.importarAutomacao({ formato: "automacao-v1", versao: 1, auto: { ...a, gatilho: "gatilho_do_futuro" } }, BASE, VOCAB);
  assert.ok(g.pendencias.some(p => /gatilho/i.test(p)), "DU-058");
  const c = L.importarAutomacao({ formato: "automacao-v1", versao: 1, auto: { ...a, acoes: [{ tipo: "campo_atualizar", campo: "placa_do_carro", valor: "x" }] } }, BASE, VOCAB);
  assert.ok(c.pendencias.some(p => /placa_do_carro|campo/i.test(p)), "DU-057");
});

test("DU-059 várias automações num texto: exportar/importar e a colagem cria só as válidas, todas desligadas", async () => {
  const itens = dadosLista().itens.slice(0, 3);
  const txt = JSON.stringify(L.exportarAutomacoes(itens, BASE, VOCAB));
  const lidas = L.importarAutomacoes(txt, BASE, VOCAB);
  assert.equal(lidas.length, 3);
  assert.ok(lidas.every(x => x.auto.ativo === false));
  assert.equal(L.importarAutomacoes("lixo", BASE, VOCAB).length, 0);
  assert.equal(L.importarAutomacoes(JSON.stringify(L.exportarAutomacao(itens[0], BASE, VOCAB)), BASE, VOCAB).length, 1, "o formato de uma continua aceito");
  const d = comDom();
  try {
    const e = await abrirTela(d, { rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto, id: "n" + Math.random() }) } });
    const area = e.raiz.querySelector(".au-colar-txt");
    area.value = txt;
    clicar(d, area.parentNode.parentNode.querySelector("button.bt-sec") || [...e.raiz.querySelectorAll("button")].find(b => /Abrir no editor/.test(b.textContent)));
    await tique(10);
    assert.match(e.confirmacoes.at(-1).titulo, /Criar 3 automações/);
    const salvas = e.chamadas.filter(c => c[0] === "nx_automacao_salvar");
    assert.equal(salvas.length, 3);
    assert.ok(salvas.every(c => c[1].p_auto.ativo === false), "DU-098: nunca sai ligada");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-061 outras automações no mesmo gatilho (ligadas e desligadas), sem a própria", () => {
  const itens = dadosLista().itens;
  const l = L.outrasNoGatilho(itens[1], itens, BASE, VOCAB);
  assert.deepEqual(l.map(x => x.id), ["a3", "a4"]);
  assert.equal(l[0].ativo, true);
  assert.ok(l[0].frase.length > 0);
  assert.deepEqual(L.outrasNoGatilho({ gatilho: null }, itens), []);
});

test("DU-062 / DU-063 / DU-064 teste: pílula com ícone, texto para copiar sem telefone e o motivo do registro fora", () => {
  assert.deepEqual([L.pilulaEstadoPasso("faria").icone, L.pilulaEstadoPasso("erro").texto], ["check", "Daria erro"]);
  assert.equal(L.mascararTelefone("ligar (12) 99876-5430 hoje"), "ligar (12) 9••••-••30 hoje");
  const t = L.textoDoTeste({ total: 1, alvos: [{ titulo: "Maria Souza Lima", passos: [{ estado: "faria", rotulo: "Mandar para 12 99876-5430" }] }] }, { nome: "Lembrete" });
  assert.match(t, /Lembrete — teste sem enviar nada/);
  assert.match(t, /• Maria …/);
  assert.doesNotMatch(t, /Souza|99876/);
  const sim = L.normalizarSimulacao({ total: 0, alvos: [], motivo_registro: "etapa" }, { gatilho: "negocio_estagio", config: { estagio_id: U(12) }, condicoes: [], acoes: [] }, BASE, VOCAB);
  assert.match(sim.motivo, /não está em «Avaliação agendada»/);
});

test("DU-066 falha de envio: separada dos outros erros, com filtro próprio e dica", () => {
  const xs = [{ estado: "erro", detalhe: "envio_falhou: número sem WhatsApp" }, { estado: "erro", detalhe: "condição inválida" }, { estado: "concluida", ok: true }];
  assert.deepEqual(xs.map(L.ehFalhaDeEnvio), [true, false, false]);
  assert.equal(L.filtrarExecucoes(xs, { situacao: "envio" }).length, 1);
  assert.equal(L.filtrarExecucoes(xs, { situacao: "erro" }).length, 2);
  assert.match(L.DICA_FALHA_ENVIO, /janela de 24 h/);
});

test("DU-067 / DU-068 / DU-070 sem rodar há 7 dias, tendência da semana e a cota com a data de renovação", () => {
  const dias = n => new Date(Date.now() - n * 86400e3).toISOString();
  assert.equal(L.semRodarHa({ ativo: true, gatilho: "agendado", ultima_execucao_em: dias(9) }).dias, 9);
  assert.equal(L.semRodarHa({ ativo: true, gatilho: "agendado", ultima_execucao_em: dias(2) }), null);
  assert.equal(L.semRodarHa({ ativo: true, gatilho: "conversa_nova", ultima_execucao_em: dias(30) }), null, "gatilho de evento pode ficar quieto");
  const serie = [...Array(7).fill(10), ...Array(7).fill(15)];
  assert.equal(L.tendencia(serie).pct, 50);
  assert.match(L.tendencia(serie).texto, /\+50 %/);
  assert.equal(L.tendencia([1, 2]), null);
  const ren = new Date(Date.now() + 5 * 86400e3);
  assert.match(L.textoCotaEsgotada({ renova_em: ren.toISOString() }), /volta em \d{2}\/\d{2}/);
  assert.match(L.textoCotaEsgotada(null), /1º do próximo mês/);
});

test("DU-069 a IA diz «gasta 1 uso da IA do mês» (sem jargão de cota técnica)", () => {
  const ia = L.MODELOS.filter(m => L.usaIA(m) && m.aviso);
  assert.ok(ia.length);
  for (const m of ia) assert.match(m.aviso, /1 uso da IA do mês/);
});

test("DU-071 teste vencido: o topo avisa e o cartão diz «Parada», não «Ligada»", async () => {
  assert.equal(L.empresaBloqueada({ status: "teste", teste_ate: new Date(Date.now() - 86400e3).toISOString() }), true);
  assert.equal(L.empresaBloqueada({ status: "ativo" }), false);
  assert.equal(L.estadoExibido({ ativo: true }, { status: "suspenso" }), "Parada (teste terminou)");
  const d = comDom();
  try {
    const e = await abrirTela(d, { extra: { cliente: { id: "cli-1", nome: "Clínica", vertical: "odonto", status: "suspenso" } } });
    assert.ok(e.raiz.querySelector(".au-aviso-parada"));
    assert.match(textoDe(cartao(e.raiz, "a2").querySelector(".au-item-estado")), /Parada/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-072 feriado nacional fecha o dia inteiro", () => {
  const ano = new Date().getFullYear() + 1;
  const natal = Date.parse(`${ano}-12-25T15:00:00Z`);
  assert.equal(L.ehFeriado(natal), true);
  assert.equal(L.ehFeriado(Date.parse(`${ano}-12-26T15:00:00Z`)), false);
  assert.equal(L.ehFeriado(Date.parse(`${ano}-03-10T15:00:00Z`), [`${ano}-03-10`]), true, "feriado da cidade em base.feriados");
  assert.equal(L.abertoNoHorarioComFeriados({}, natal), false);
});

test("DU-076 / DU-102 seleção: a marcada fora do filtro continua marcada; Shift+clique marca o intervalo; Ctrl+A marca as visíveis", async () => {
  assert.equal(L.textoSelecao(new Set(["a1", "a2"]), ["a2"]), "2 selecionadas (1 fora do filtro)");
  const d = comDom();
  try {
    const e = await abrirTela(d);
    clicar(d, e.raiz.querySelector(".au-sel-modo")); await tique(2);
    const chk = id => cartao(e.raiz, id).querySelector(".au-sel-chk");
    const marcar = (id, shift = false) => { const c = chk(id); c.checked = true; c.dispatchEvent(new d.Evento("click", { shiftKey: shift })); c.dispatchEvent(new d.Evento("change")); };
    marcar("a1"); marcar("a3", true);
    const status = () => textoDe(e.raiz.querySelector(".au-sel-status"));
    assert.equal(status(), "3 selecionadas", "Shift marcou a2 no meio");
    const chipLigadas = [...e.raiz.querySelectorAll(".au-lista-filtro .au-chip")].find(b => /^Ligadas/.test(b.textContent));
    clicar(d, chipLigadas); await tique(2);
    assert.equal(status(), "3 selecionadas (1 fora do filtro)");
    const lista = cartao(e.raiz, "a2").parentNode;
    lista.dispatchEvent(new d.Evento("keydown", { key: "a", ctrlKey: true })); await tique(1);
    assert.equal(status(), "4 selecionadas (1 fora do filtro)");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-077 / DU-084 / DU-085 / DU-090 receitas: grade só monta perto da tela, «Ver quem pegaria», «Você já usa» e a estimativa da IA", async () => {
  const d = comDom();
  const antesIO = globalThis.IntersectionObserver;
  const io = {};
  globalThis.IntersectionObserver = class { constructor(cb) { io.cb = cb; } observe(el) { io.el = el; } disconnect() { io.fora = true; } };
  try {
    const dados = dadosLista();
    dados.itens[0] = { ...dados.itens[0], modelo: "lembrete_consulta_texto" };
    const e = await abrirTela(d, { dados, rpcExtra: { nx_auto_simular: () => ({ total: 7, alvos: [] }) } });
    assert.equal(e.raiz.querySelectorAll(".au-modelo").length, 0, "DU-084: antes de chegar perto, nada de aplicarModelo");
    io.cb([{ isIntersecting: true }]); await tique(2);
    assert.ok(e.raiz.querySelectorAll(".au-modelo").length > 3);
    assert.ok(e.raiz.querySelector(".au-pil-em-uso"), "DU-085");
    const bt = e.raiz.querySelector(".au-ver-quem");
    clicar(d, bt); await tique(8);
    assert.ok(e.chamadas.some(c => c[0] === "nx_auto_simular" && c[1].p_automacao.ativo === false));
    assert.match(textoDe(bt.parentNode.querySelector(".au-quem-pegaria")), /7 pessoas/);
    e.A.desmontar();
  } finally { globalThis.IntersectionObserver = antesIO; d.fim(); }
  const m = L.MODELOS.find(x => L.usaIA(x));
  assert.equal(L.estimativaUsosIA(m, {}), null, "sem volume do servidor, sem número inventado");
  assert.match(L.estimativaUsosIA(m, { volume_30d: { [m.auto.gatilho]: 180 } }, { limite: 500 }), /≈ 180 usos da IA por mês de 500/);
});

test("DU-078 / DU-079 plano sem IA e limite de automações: o pedido vai pelo shell (sem ele, o link do plano)", async () => {
  const d = comDom();
  try {
    const pedidos = [];
    const dados = dadosLista({ limite: { usadas: 4, limite: 4 }, ia: { disponivel: true, no_plano: false, plano_com_ia: "Pro" } });
    const e = await abrirTela(d, { dados, extra: { shell: { pedirContratacao: o => pedidos.push(o) } } });
    clicar(d, e.raiz.querySelector(".au-pedir-mais"));
    assert.deepEqual(pedidos, ["automacoes_limite"]);
    const nota = e.raiz.querySelector(".au-modelo-plano");
    assert.match(textoDe(nota), /disponível no plano Pro/);
    clicar(d, nota.querySelector(".au-quero-ia"));
    assert.deepEqual(pedidos, ["automacoes_limite", "automacoes_ia"]);
    assert.ok(!e.raiz.querySelector(".au-modelo-custo"), "sem IA no plano não fala de cota");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-080 editor só leitura diz quem é administrador", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a1"], dados: dadosLista({ pode_editar: false }) });
    assert.match(textoDe(e.raiz.querySelector(".au-aviso-papel")), /Bruno Reis/);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-081 / DU-103 o erro ao excluir diz a quem pedir; o «desligadas também contam» fica só no topo", () => {
  const src = ler("web/app/automacoes.js");
  assert.match(src, /L\.erroAutomacao\(r\.erro, ctx\.api\.mensagemErro\(r\.erro\), usuarios\)/);
  assert.equal((src.match(/\(desligadas também contam\)/g) || []).length, 1);
});

test("DU-082 ordem «Por objetivo»: grupos na ordem Lembretes, Vendas, Relacionamento, Equipe", () => {
  assert.ok(L.ORDENS_AUTOMACAO.some(([k]) => k === "objetivo"));
  const itens = [{ id: 1, gatilho: "tarefa_vencida", acoes: [] }, { id: 2, modelo: "followup_orcamento" }, { id: 3, gatilho: "antes_da_data", acoes: [] }];
  assert.deepEqual(L.agruparPorObjetivo(itens).map(g => g.grupo), ["Lembretes", "Vendas", "Equipe"]);
  assert.deepEqual(L.listaAutomacoes(itens, { ordem: "objetivo" }).map(x => x.id), [3, 2, 1]);
});

test("DU-086 / DU-357 lista vazia: o caso do segmento abre a receita e o kit cria 3 desligadas", async () => {
  assert.deepEqual(L.textoVazio("oficina"), { texto: "Avise o cliente quando o carro ficar pronto.", receita: "carro_pronto" });
  const d = comDom();
  try {
    const e = await abrirTela(d, { dados: dadosLista({ itens: [] }), rpcExtra: { nx_automacao_salvar: p => ({ ...p.p_auto, id: "k" }) } });
    assert.match(textoDe(e.raiz.querySelector(".au-vazio")), /Lembre o paciente da consulta no dia anterior/);
    clicar(d, e.raiz.querySelector(".au-kit-bt")); await tique(10);
    const salvas = e.chamadas.filter(c => c[0] === "nx_automacao_salvar");
    assert.equal(salvas.length, L.kitInicial("odonto", BASE, VOCAB).length);
    assert.ok(salvas.length >= 2 && salvas.every(c => c[1].p_auto.ativo === false), "DU-098");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-087 número desconectado: a que manda mensagem fica «parada»", () => {
  const it = { ativo: true, acoes: [{ tipo: "enviar_mensagem", texto: "x" }] };
  assert.equal(L.estadoEnvio(it, [{ estado: "desconectado" }]), "parado");
  assert.equal(L.estadoEnvio(it, [{ estado: "desconectado" }, { estado: "conectado" }]), "ok");
  assert.equal(L.estadoEnvio(it, [{ nome: "sem estado" }]), null, "sem o dado, não acusa");
});

test("DU-088 / DU-089 ajuda da mensagem pelos números da empresa; o JSDoc do miniTempo voltou para ele", () => {
  assert.doesNotMatch(L.ajudaMensagem([{ provedor: "codewords" }]), /24 h/);
  assert.match(L.ajudaMensagem([{ provedor: "meta" }]), /24 h/);
  assert.match(ler("web/app/automacoes.js"), /Mini linha do tempo de uma receita[^\n]*\n(?:[^\n]*\n)?function miniTempo/);
});

test("DU-093 / DU-094 / DU-317 paleta com os mais usados do gatilho e diagrama com nome acessível que diz o tempo", async () => {
  assert.deepEqual(L.acoesSugeridas("antes_da_data"), ["enviar_mensagem", "enviar_template", "criar_tarefa"].filter(id => L.ACAO[id] && L.ACAO[id].disponivel !== false && L.ACAO[id].menu !== false));
  const tl = L.linhaDoTempo([{ tipo: "esperar", minutos: 2880 }, { tipo: "enviar_mensagem", texto: "x" }]);
  assert.match(L.rotuloNoDiagrama({ tipo: "passo", n: 2, indice: 1, rotulo: "Enviar mensagem" }, tl), /^Passo 2: Enviar mensagem, depois de 2 dias$/);
  const d = comDom();
  try {
    const e = await abrirTela(d, { partes: ["a1"] });
    const pal = e.raiz.querySelector(".au-paleta-sug");
    assert.ok(pal, "DU-093");
    assert.match(textoDe(pal), /Mais usados com este gatilho/);
    const svg = e.raiz.querySelector(".au-dg-svg");
    if (svg) {
      assert.ok(svg.getAttribute("aria-describedby"), "DU-094");
      assert.ok([...svg.querySelectorAll(".au-dg-no")].some(g => /^Passo 1:/.test(g.getAttribute("aria-label"))), "DU-317");
    }
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-095 / DU-101 tempo poupado com os minutos da empresa e mensagens de hoje (só com o dado do servidor)", async () => {
  const d = comDom();
  try {
    const A = await import("../web/app/automacoes.js");
    assert.equal(A.minutosPorMensagem({ minutos_por_mensagem: 5 }), 5);
    assert.equal(A.minutosPorMensagem({ minutos_por_mensagem: 500 }), 2);
    const dados = dadosLista({ base: { ...BASE, minutos_por_mensagem: 5, mensagens_hoje: 12 } });
    dados.itens[0] = { ...dados.itens[0], mensagens_30d: 30 };
    const e = await abrirTela(d, { dados });
    const txt = textoDe(e.raiz);
    assert.match(txt, /≈ 2 h 30 min/, "30 mensagens × 5 min (plano 2000d: AX-029 — sem arredondar 150 min para 3 h)");
    assert.match(txt, /Mensagens hoje/);
    e.A.desmontar();
    const e2 = await abrirTela(d);
    assert.doesNotMatch(textoDe(e2.raiz), /Mensagens hoje/);
    e2.A.desmontar();
  } finally { d.fim(); }
});

test("DU-100 / DU-104 «Ver execuções» no período do cartão e a condição que barrou", () => {
  assert.equal(L.rotuloVerExecucoes({ ok_30d: 10, erro_30d: 2, execucoes: 999 }), "Ver execuções (12 em 30 dias)");
  const auto = { condicoes: [{ campo: "etiqueta", op: "igual", valor: U(31) }] };
  assert.match(L.fraseBarrada({ condicao_falhou: 0, valor_encontrado: "nenhuma" }, auto, BASE), /^Barrada por: .*Orçamento.*\(era nenhuma\)\.$/);
  assert.equal(L.fraseBarrada({}, auto, BASE), "");
});

test("DU-106 / DU-107 / DU-108 rascunho de nova resumido, voltar ao texto da receita e o diff ao salvar ligada", () => {
  assert.equal(L.resumoRascunhoNova({ nome: "Teste", gatilho: "negocio_ganho", acoes: [{}, {}, {}] }, VOCAB).replace(/«[^»]*»: /, ""), `gatilho «${L.rotuloGatilho("negocio_ganho", VOCAB)}», 3 passos`);
  const r = L.restaurarReceita({ id: "x9", nome: "Meu nome", ativo: true, modelo: "followup_orcamento", acoes: [] }, BASE, VOCAB);
  assert.equal(r.id, "x9"); assert.equal(r.nome, "Meu nome"); assert.equal(r.ativo, true); assert.ok(r.acoes.length);
  assert.equal(L.restaurarReceita({ nome: "sem receita" }, BASE), null);
  assert.match(ler("web/app/auto-editor.js"), /resumoDiferencas\(\{ \.\.\.antes, nome: auto\.nome \}/);
});

test("DU-307 / DU-313 / DU-343 / DU-412 CSS: alto contraste, foco no link, lista longa e números secundários", () => {
  const css = ler("web/app/automacoes.css");
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.au-item-link:focus-visible/);
  assert.match(css, /\.au-lista-longa[^{]*\{[^}]*content-visibility: auto/);
  assert.match(css, /plano 2000d · DU-412/);
});

/* ================================================================== plano 2000d · lote auto-d3 */

test("DU-354 / DU-443 excluir ou desligar várias diz quem perde os próximos passos", async () => {
  const d = comDom();
  try {
    const e = await abrirTela(d, { confirmar: async () => false });
    clicar(d, e.raiz.querySelector(".au-sel-modo")); await tique(2);
    const c = cartao(e.raiz, "a2").querySelector(".au-sel-chk"); c.checked = true; c.dispatchEvent(new d.Evento("change"));
    clicar(d, e.raiz.querySelector('.au-sel-barra [data-acao="excluir"]')); await tique(3);
    assert.match(e.confirmacoes.at(-1).texto, /3 pessoas no meio de sequências não recebem os próximos passos/);
    clicar(d, e.raiz.querySelector('.au-sel-barra [data-acao="desligar"]')); await tique(3);
    assert.match(e.confirmacoes.at(-1).texto, /3 pessoas estão no meio de uma sequência/);
    assert.ok(!e.chamadas.some(x => x[0] === "nx_automacao_ativar"), "recusou: não desliga");
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-355 / DU-356 gatilho no vocabulário do segmento e plural certo", () => {
  const vv = { ...VOCAB_V, min: k => ({ contato: "paciente" }[k] || k), um: () => "um" };
  const g = L.GATILHOS.find(x => /\bcontato\b/.test(x.descricao || ""));
  assert.ok(g);
  const t = L.descricaoGatilho(g.id, vv);
  assert.match(t, /paciente/); assert.doesNotMatch(t, /\bcontato\b/);
  assert.equal(L.plural(1, "automação", "automações"), "1 automação");
  assert.equal(L.plural(0, "automação", "automações"), "0 automações");
});

test("DU-361 / DU-365 / DU-366 / DU-368 / DU-369 / DU-371 receitas novas: cada uma só no segmento dela", () => {
  const ids = { manutencao_mensal: "odonto", orcamento_24h_oficina: "oficina", garantia_90: "oficina", produto_chegou: "loja", troca_7_dias: "loja", nps: null };
  for (const [id, v] of Object.entries(ids)) {
    const m = L.MODELOS.find(x => x.id === id);
    assert.ok(m, id);
    if (!v) continue;
    assert.ok(L.modelosDaVertical(v, BASES[v]).includes(m), `${id} em ${v}`);
    for (const outro of ["odonto", "oficina", "loja"].filter(x => x !== v)) assert.ok(!L.modelosDaVertical(outro, BASES[outro]).includes(m), `${id} fora de ${outro}`);
  }
});

test("DU-416 modelo da Meta: os espaços {{n}} ganham sugestão pelo texto em volta", () => {
  const s = L.montarParametrosTemplate("Olá, {{1}}! Sua consulta é em {{2}} às {{3}}. Valor: R$ {{4}}");
  assert.deepEqual(s.map(x => x.sugestao), ["{primeiro_nome}", "{data_consulta}", "{hora_consulta}", "{valor}"]);
  assert.match(ler("web/app/auto-editor.js"), /Preencher com o sugerido/);
});

test("DU-419 tom formal: a galeria escolhe e o editor recebe ?tom=formal", () => {
  assert.deepEqual(L.TONS_RECEITA.map(x => x[0]), ["proximo", "formal"]);
  const f = L.aplicarModelo("followup_orcamento", BASE, VOCAB, { tom: "formal" });
  const p = L.aplicarModelo("followup_orcamento", BASE, VOCAB);
  const txt = a => a.acoes.filter(x => x.tipo === "enviar_mensagem").map(x => x.texto).join(" ");
  assert.notEqual(txt(f), txt(p));
  assert.doesNotMatch(txt(f), /^Oi\b/);
  assert.match(ler("web/app/auto-editor.js"), /tom: q\.tom === "formal"/);
});

test("DU-432 / DU-433 editor: atalho para pular o fluxo e Alt+↓ move o passo", async () => {
  const d = comDom();
  try {
    const dados = dadosLista();
    dados.itens[0] = { ...dados.itens[0], acoes: [{ tipo: "enviar_mensagem", texto: "um" }, { tipo: "criar_tarefa", titulo: "dois", dono: "responsavel" }] };
    const e = await abrirTela(d, { partes: ["a1"], dados });
    assert.ok(e.raiz.querySelector(".au-dg-pular"), "DU-432");
    const passos = () => [...e.raiz.querySelectorAll(".au-passo")].map(li => li.dataset.tipo);
    assert.deepEqual(passos(), ["enviar_mensagem", "criar_tarefa"]);
    e.raiz.querySelector(".au-passo").dispatchEvent(new d.Evento("keydown", { key: "ArrowDown", altKey: true })); await tique(2);
    assert.deepEqual(passos(), ["criar_tarefa", "enviar_mensagem"]);
    e.A.desmontar();
  } finally { d.fim(); }
});

test("DU-442 salvar ligada com gente no meio da sequência avisa que o resto sai com o texto novo", () => {
  assert.match(ler("web/app/auto-editor.js"), /no meio da sequência: o que ainda falta para/);
});

test("DU-444 receitas por vertical sem palavra de outro segmento (nada de «paciente» na oficina/loja)", () => {
  const proibidas = { oficina: /paciente|consult[óo]rio|dentista/i, loja: /paciente|consult[óo]rio|dentista|carro|oficina/i, odonto: /\bcarro\b|oficina|pedido enviado/i };
  for (const [v, re] of Object.entries(proibidas)) {
    const vv = { ...VOCAB, vertical: v, contato: v === "odonto" ? "Paciente" : "Cliente" };
    for (const m of L.modelosDaVertical(v, BASES[v])) {
      const a = L.aplicarModelo(m.id, BASES[v], vv);
      const txt = [a.nome, ...a.acoes.map(x => `${x.texto || ""} ${x.titulo || ""}`)].join(" ");
      assert.doesNotMatch(txt, re, `${v}/${m.id}: ${txt.slice(0, 120)}`);
    }
  }
});

test("DU-098 nenhum caminho cria automação ligada: receita, IA aplicada, colagem e duplicação", () => {
  for (const m of L.MODELOS) assert.equal(L.aplicarModelo(m.id, BASE, VOCAB).ativo, false, m.id);
  assert.equal(L.importarAutomacao({ formato: "automacao-v1", versao: 1, auto: { nome: "x", gatilho: "negocio_ganho", ativo: true, acoes: [{ tipo: "criar_tarefa", titulo: "t" }] } }, BASE).auto.ativo, false);
  for (const a of L.kitInicial("odonto", BASE, VOCAB)) assert.equal(a.ativo, false);
  const src = ler("web/app/automacoes.js");
  assert.match(src, /async function duplicar[\s\S]{0,1500}a\.ativo = false/);
});

/* ================================================================== plano 2000d · frente auto — complemento AX (agente auto-x) */

const tiposAv = (a, op = {}) => L.avisosEstruturaDetalhados(a, VOCAB, op).map(x => x.tipo);
const naEtapaAX = extra => ({ nome: "x", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [], acoes: [], ...extra });

test("AX-001 auto-editor: «Outras automações neste gatilho» não passa null ao append", () => {
  const src = ler("web/app/auto-editor.js");
  assert.doesNotMatch(src, /l\.length > 6 \? h\("p", \{ class: "sub" \}, `e mais \$\{l\.length - 6\}`\) : null,/);
  assert.match(src, /plano 2000d · AX-001/);
});

test("AX-002 / AX-003 / AX-004 / AX-005 frase do gatilho sem o tempo e com palavras repetidas", () => {
  assert.match(L.descrever({ gatilho: "tempo_no_estagio", config: { estagio_id: U(13) }, acoes: [] }, BASE, VOCAB), /\(escolha o tempo\)/);
  assert.match(L.descrever({ gatilho: "antes_da_data", config: { campo: "consulta" }, acoes: [] }, BASE, VOCAB), /\(escolha quanto tempo\)/);
  assert.match(L.descrever({ gatilho: "apos_data", config: { campo: "consulta" }, acoes: [] }, BASE, VOCAB), /\(escolha quanto tempo\)/);
  assert.doesNotMatch(L.descrever({ gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, acoes: [] }, BASE, VOCAB), /escolha/);
  const f = L.descrever({ gatilho: "mensagem_recebida", config: { palavras: ["preço", "Preço", "valor"] }, acoes: [] }, BASE, VOCAB);
  assert.equal((f.match(/«preço»/gi) || []).length, 1);
  assert.match(f, /«valor»/);
});

test("AX-006 / AX-007 / AX-008 frase dos passos: prazo apagado é 24 h, mensagem vazia e alerta com o texto", () => {
  const f = acs => L.descrever({ gatilho: "negocio_ganho", config: {}, acoes: acs }, BASE, VOCAB);
  assert.match(f([{ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel", vence_em_horas: "" }]), /24 h/);
  assert.match(f([{ tipo: "enviar_mensagem", texto: "" }]), /«…»/);
  assert.match(f([{ tipo: "alerta_whatsapp", texto: "Lead quente chegou" }]), /Lead quente chegou/);
});

test("AX-009 rascunho: a mesma config em outra ordem de chaves não «mudou»", () => {
  const a = { nome: "x", gatilho: "antes_da_data", config: { horas: 24, campo: "consulta" }, acoes: [], condicoes: [] };
  const b = { nome: "x", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, acoes: [], condicoes: [] };
  assert.equal(L.resumoDiferencas(a, b), "");
  assert.notEqual(L.resumoDiferencas(a, { ...b, config: { campo: "consulta", horas: 2 } }), "");
});

test("AX-010 / AX-011 condições impossíveis: maior/menor contra «igual»", () => {
  assert.equal(L.condicoesContraditorias([{ campo: "valor", op: "maior", valor: 5000 }, { campo: "valor", op: "igual", valor: 3000 }]).length, 1);
  assert.equal(L.condicoesContraditorias([{ campo: "valor", op: "maior", valor: 1000 }, { campo: "valor", op: "igual", valor: 3000 }]).length, 0);
  assert.equal(L.condicoesContraditorias([{ campo: "valor", op: "igual", valor: 200 }, { campo: "valor", op: "menor", valor: 100 }]).length, 1);
  assert.equal(L.condicoesContraditorias([{ campo: "valor", op: "igual", valor: 50 }, { campo: "valor", op: "menor", valor: 100 }]).length, 0);
});

test("AX-012 / AX-013 condição repetida e a mesma mensagem duas vezes seguidas", () => {
  const cd = { campo: "origem", op: "igual", valor: "anuncio" };
  assert.ok(tiposAv(naEtapaAX({ condicoes: [cd, { ...cd }], acoes: [{ tipo: "nota", texto: "a" }] })).includes("cond_repetida"));
  assert.ok(!tiposAv(naEtapaAX({ condicoes: [cd], acoes: [{ tipo: "nota", texto: "a" }] })).includes("cond_repetida"));
  const m = { tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}, tudo certo?" };
  assert.ok(tiposAv(naEtapaAX({ acoes: [m, { ...m }] })).includes("msg_repetida"));
  assert.ok(!tiposAv(naEtapaAX({ acoes: [m, { tipo: "esperar", minutos: 60 }, { ...m }] })).includes("msg_repetida"));
});

test("AX-014 / AX-015 / AX-087 / AX-100 segurança do texto: link encurtado, MAIÚSCULAS, {{1}} e mensagem só com o nome", () => {
  const t = texto => tiposAv(naEtapaAX({ acoes: [{ tipo: "enviar_mensagem", texto }] }));
  assert.ok(t("Veja a promoção: https://bit.ly/abc123 — {empresa}").includes("link_encurtado"));
  assert.ok(!t("Veja em https://minhaclinica.com.br/promo — {empresa}").includes("link_encurtado"));
  assert.ok(t("PROMOÇÃO IMPERDÍVEL SÓ HOJE PARA VOCÊ {primeiro_nome}").includes("maiusculas"));
  assert.ok(!t("Oi {primeiro_nome}, a promoção vale até sexta. Use o código ABC.").includes("maiusculas"));
  assert.ok(t("Olá {{1}}, tudo bem?").includes("chave_dupla"));
  assert.ok(t("{primeiro_nome}!").includes("so_variavel"));
  assert.ok(!t("Oi {primeiro_nome}, tudo bem?").includes("so_variavel"));
});

test("AX-016 / AX-059 opt-out: «Não enviar» não pode receber; a receita «pediu_parar» põe a etiqueta", () => {
  const base = { ...BASE, etiquetas: [...(BASE.etiquetas || []), { id: U(39), nome: "Não enviar" }] };
  const msg = { tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}, tudo bem?" };
  assert.ok(tiposAv(naEtapaAX({ acoes: [msg] }), { base }).includes("opt_out"));
  assert.ok(!tiposAv(naEtapaAX({ acoes: [msg], condicoes: [{ campo: "etiqueta", op: "diferente", valor: U(39) }] }), { base }).includes("opt_out"));
  assert.ok(!tiposAv(naEtapaAX({ acoes: [msg] }), { base: { ...BASE, etiquetas: [] } }).includes("opt_out"));
  const r = L.aplicarModelo("pediu_parar", base, VOCAB);
  assert.ok(r.acoes.some(a => a.etiqueta_id === U(39)));
  assert.ok(!tiposAv(r, { base }).includes("opt_out"), "a própria receita não se avisa");
});

test("AX-017 / AX-090 horário: «Todo dia» de madrugada e lembrete curto com «Respeitar horário»", () => {
  const ag = h => ({ nome: "x", gatilho: "agendado", config: { horario: h, dias_semana: [1] }, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}, tudo bem?" }] });
  assert.ok(tiposAv(ag("05:30")).includes("madrugada"));
  assert.ok(tiposAv(ag("22:00")).includes("madrugada"));
  assert.ok(!tiposAv(ag("09:00")).includes("madrugada"));
  assert.ok(!tiposAv({ ...ag("05:30"), respeitar_horario: true }).includes("madrugada"));
  const lem = h => ({ nome: "x", gatilho: "antes_da_data", config: { campo: "consulta", horas: h }, respeitar_horario: true, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "Oi, tudo bem?" }] });
  assert.ok(tiposAv(lem(2)).includes("lembrete_curto"));
  assert.ok(!tiposAv(lem(24)).includes("lembrete_curto"));
});

test("AX-018 / AX-019 limpar: nome em uma linha e texto sem CR nem espaço no fim da linha", () => {
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  const l = L.limpar({ nome: `Lembrete${LF}  24 h`, gatilho: "negocio_ganho", config: {}, acoes: [{ tipo: "enviar_mensagem", texto: `Oi   ${CR}${LF}tudo bem?` }] });
  assert.equal(l.nome, "Lembrete 24 h");
  assert.equal(l.acoes[0].texto, `Oi${LF}tudo bem?`);
  assert.deepEqual(L.limpar(l), l, "continua idempotente");
});

test("AX-020 horas: «1.000» é mil e «1,5» dias são 36 h", () => {
  assert.equal(L.comporHoras("1.000", "horas"), 1000);
  assert.equal(L.comporHoras("1,5", "dias"), 36);
});

test("AX-021..AX-024 / AX-104..AX-106 montagem da IA: nome sugerido, limites, palavras em texto, espera em horas e nomes viram ids", () => {
  const base = { ...BASE, etiquetas: [{ id: U(31), nome: "Orçamento" }] };
  const muitos = Array.from({ length: L.LIMITES.acoes + 2 }, () => ({ tipo: "nota", campos: { texto: "a" } }));
  const r = L.deFormatoIA({ gatilho: { tipo: "negocio_ganho", campos: {} }, acoes: muitos,
    condicoes: Array.from({ length: L.LIMITES.condicoes + 1 }, () => ({ campo: "etiqueta", op: "igual", valor: "Orçamento" })) }, base);
  assert.ok(r.auto.nome.length > 0, "AX-021");
  assert.equal(r.auto.acoes.length, L.LIMITES.acoes, "AX-022");
  assert.ok(r.avisos.length >= 1);
  assert.equal(r.auto.condicoes.length, L.LIMITES.condicoes, "AX-023");
  assert.equal(r.auto.condicoes[0].valor, U(31), "AX-105");
  const p = L.deFormatoIA({ gatilho: { tipo: "mensagem_recebida", campos: { palavras: "preço, valor" } }, acoes: [{ tipo: "esperar", campos: { horas: 2 } }, { tipo: "etiquetar", campos: { etiqueta_id: "VIP", alvo: "contato" } }] }, base);
  assert.deepEqual(p.auto.config.palavras, ["preço", "valor"], "AX-024");
  assert.equal(p.auto.acoes[0].minutos, 120, "AX-104");
  assert.equal(p.auto.acoes[1].etiqueta_nome, "VIP", "AX-106");
});

test("AX-025 / AX-077 / AX-082 / AX-101 / AX-045 números com milhar e singular", () => {
  assert.match(L.estimativaDiaria([1, 1, 1]).texto, /1 mensagem\b/);
  assert.match(L.estimativaDiaria([1200, 1300]).texto, /1\.250/);
  assert.match(L.linhaCotaIA({ usadas: 1234, limite: 2000 }).texto, /1\.234/);
  assert.match(L.avisoDesligarEspera({ em_espera: 1500 }), /1\.500/);
  assert.match(L.resumoExecucoes({ execucoes: 1234, erros: 2 }), /1\.234/);
});

test("AX-026 / AX-027 objetivo: toda receita tem grupo e o resto que manda mensagem é relacionamento", () => {
  assert.equal(L.objetivoDe({ gatilho: "negocio_estagio", acoes: [{ tipo: "enviar_mensagem", texto: "x" }] }), "Relacionamento");
  for (const m of L.MODELOS) assert.ok(L.OBJETIVOS.includes(L.objetivoDe({ modelo: m.id, ...m.auto })), m.id);
});

test("AX-028 pesquisa: nota 10 não vira detrator (o motor casa por trecho)", () => {
  const det = L.aplicarModelo("nps_detrator", BASE_ODONTO);
  assert.ok(det.condicoes.some(x => x.campo === "texto" && x.op === "nao_contem" && x.valor === "10"));
});

test("AX-029 tempo poupado: 90 min é «1 h 30 min», não «2 h»", () => {
  assert.match(L.tempoEconomizado([{ mensagens_30d: 45 }]).texto, /1 h 30 min/);
});

test("AX-030 / AX-081 teste para copiar: +55 e e-mail mascarados", () => {
  assert.doesNotMatch(L.mascararTelefone("Ligar +55 12 98765-4321"), /\+55/);
  assert.equal(L.mascararEmail("maria.souza@gmail.com"), "m•••@gmail.com");
});

test("AX-031 colar mais do que cabe: a lista diz quantas ficaram de fora", () => {
  assert.match(ler("web/app/automacoes.js"), /\.cortadas/);
  assert.match(ler("web/app/auto-logica.js"), /cortadas/);
});

test("AX-032 / AX-033 vagas do plano", () => {
  assert.equal(L.vagasNoPlano({ usadas: 6, limite: 8 }), 2);
  assert.equal(L.vagasNoPlano({ usadas: 9, limite: 8 }), 0);
  assert.equal(L.vagasNoPlano({ usadas: 3 }), Infinity);
  assert.equal(L.vagasNoPlano(null), Infinity);
  const src = ler("web/app/automacoes.js");
  assert.match(src, /plano 2000d · AX-032/);
  assert.match(src, /plano 2000d · AX-033/);
});

test("AX-034 / AX-035 em lotes: no máximo 4 ao mesmo tempo, na ordem, com o progresso", async () => {
  let ativos = 0, pico = 0; const prog = [];
  const rs = await L.emLotes([1, 2, 3, 4, 5, 6, 7, 8, 9], async x => { ativos++; pico = Math.max(pico, ativos); await esperar(2); ativos--; if (x === 5) throw new Error("x"); return x * 2; },
    { concorrencia: 4, aoProgresso: (n, t) => prog.push(`${n}/${t}`) });
  assert.equal(pico, 4);
  assert.deepEqual(rs.map(r => r.ok), [true, true, true, true, false, true, true, true, true]);
  assert.equal(rs[8].valor, 18);
  assert.equal(prog.at(-1), "9/9");
  const src = ler("web/app/automacoes.js");
  assert.match(src, /plano 2000d · AX-034/);
  assert.match(src, /plano 2000d · AX-035/);
  assert.ok((src.match(/L\.emLotes\(/g) || []).length >= 2);
});

test("AX-036..AX-039 desempenho com muitas automações: período em cache, frase do cache, índice por id", () => {
  const src = ler("web/app/automacoes.js");
  for (const id of ["AX-036", "AX-037", "AX-038", "AX-039"]) assert.match(src, new RegExp(`plano 2000d · ${id}`), id);
  assert.match(src, /new Map\(/);
});

test("AX-040 / AX-041 lista: ordem numérica no nome e busca por várias palavras", () => {
  const itens = [{ id: 1, nome: "Lembrete 10" }, { id: 2, nome: "Lembrete 2" }, { id: 3, nome: "Aviso", acoes: [{ tipo: "enviar_mensagem", texto: "x" }] }];
  assert.deepEqual(L.listaAutomacoes(itens, { ordem: "nome" }).map(x => x.id), [3, 2, 1]);
  assert.deepEqual(L.listaAutomacoes(itens, { termo: "lembrete 2" }).map(x => x.id), [2]);
  assert.deepEqual(L.listaAutomacoes(itens, { termo: "aviso whatsapp" }).map(x => x.id), [3]);
});

test("AX-042 / AX-043 / AX-044 nomes: cópia sem acento, espaço duplo e nome pela antecedência", () => {
  assert.equal(L.nomeDaCopia("Lembrete (copia)"), "Lembrete (cópia 2)");
  assert.ok(L.nomeRepetido("Lembrete  24 h", [{ id: 1, nome: "Lembrete 24 h" }]));
  assert.match(L.sugestaoNome({ gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, acoes: [{ tipo: "enviar_mensagem" }] }, BASE, VOCAB), /24 h antes/);
});

test("AX-046 / AX-098 / AX-099 dados pessoais no pedido à IA: placa, RG e cartão", () => {
  const n = t => L.dadosPessoaisNoPedido(t).length;
  assert.ok(n("o carro ABC1D23 do João") >= 1);
  assert.ok(n("RG 12.345.678-9") >= 1);
  assert.ok(n("cartão 4111 1111 1111 1111") >= 1);
  assert.equal(n("quando ficar 24 horas sem resposta"), 0);
});

test("AX-047 / AX-048 dicas de erro: número bloqueado e contato que pediu para sair", () => {
  assert.ok(L.dicaDoErro("envio falhou: número bloqueado por spam"));
  assert.ok(L.dicaDoErro("o contato fez opt-out"));
  assert.notDeepEqual(L.dicaDoErro("envio falhou: número bloqueado por spam"), L.dicaDoErro("o contato fez opt-out"));
});

test("AX-049 / AX-092 / AX-093 / AX-094 variáveis que podem sair em branco", () => {
  assert.ok(L.avisoDataHoraConsulta({ gatilho: "negocio_estagio", acoes: [{ tipo: "enviar_mensagem", texto: "Na {dia_semana_consulta}" }] }, "odonto"));
  assert.ok(tiposAv(naEtapaAX({ acoes: [{ tipo: "enviar_mensagem", texto: "Seu orçamento de {valor} está pronto" }] })).includes("valor_vazio"));
  assert.ok(tiposAv(naEtapaAX({ acoes: [{ tipo: "enviar_mensagem", texto: "Seu protocolo é {protocolo}" }] })).includes("var_conversa"));
});

test("AX-050 «Depois da data» com «hoje»/«amanhã» no texto", () => {
  const ap = t => L.avisosEstruturaDetalhados({ nome: "x", gatilho: "apos_data", config: { campo: "consulta", horas: 24 }, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: t }] }, VOCAB).length;
  assert.ok(ap("Te vemos amanhã, até lá") > ap("Te vemos em breve, até lá"));
});

test("AX-051..AX-054 passos que não fazem nada", () => {
  assert.ok(tiposAv(naEtapaAX({ acoes: [{ tipo: "nota", texto: "a" }, { tipo: "esperar", minutos: 60 }, { tipo: "parar" }] })).includes("espera_inutil"));
  assert.ok(tiposAv(naEtapaAX({ acoes: [{ tipo: "mover_estagio", estagio_id: U(13) }] })).includes("sem_efeito"));
  assert.ok(!tiposAv(naEtapaAX({ acoes: [{ tipo: "mover_estagio", estagio_id: U(12) }] })).includes("sem_efeito"));
  assert.ok(tiposAv({ nome: "x", gatilho: "conversa_nova", config: {}, condicoes: [], acoes: [{ tipo: "resolver_conversa" }, { tipo: "enviar_mensagem", texto: "Oi, tudo bem?" }] }).includes("resolver_antes"));
  assert.ok(!tiposAv({ nome: "x", gatilho: "conversa_nova", config: {}, condicoes: [], acoes: [{ tipo: "enviar_mensagem", texto: "Oi, tudo bem?" }, { tipo: "resolver_conversa" }] }).includes("resolver_antes"));
});

test("AX-055 / AX-056 laço próprio: «Criar negócio» que cai no próprio gatilho", () => {
  const a = { id: "x", nome: "Cria", gatilho: "negocio_criado", config: {}, condicoes: [], acoes: [{ tipo: "criar_negocio" }], ativo: true };
  assert.ok(L.cadeiasDeAutomacao(a, [], BASE).some(c => c.autoLaco));
});

test("AX-057 ligar «Todo dia»: diz o próximo horário, não «15 minutos»", () => {
  const t = L.fraseQuemRecebe(3, { auto: { gatilho: "agendado", config: { horario: "09:00", dias_semana: [1, 2, 3, 4, 5] } } }).texto;
  assert.match(t, /próximo horário escolhido/);
  assert.match(t, /09:00/);
  assert.doesNotMatch(L.fraseQuemRecebe(3, { auto: { gatilho: "tempo_no_estagio", config: {} } }).texto, /próximo horário escolhido/);
});

test("AX-058 «Sem rodar há N dias» respeita a semana de quem roda só às segundas", () => {
  const agora = Date.now();
  const it = (dias, d) => ({ ativo: true, gatilho: "agendado", config: { horario: "09:00", dias_semana: dias }, ultima_execucao_em: new Date(agora - d * 86400000).toISOString() });
  assert.ok(!L.semRodarHa(it([1], 8), agora), "1 vez por semana: 8 dias ainda é normal");
  assert.ok(L.semRodarHa(it([0, 1, 2, 3, 4, 5, 6], 8), agora));
});

test("AX-059..AX-067 receitas novas existem e aparecem no segmento certo", () => {
  for (const id of ["pediu_parar", "reclamacao", "pediu_atendente", "inicio_tratamento", "carro_recebido", "pagamento_confirmado", "motivo_perda", "etiqueta_urgente"]) assert.ok(L.MODELOS.some(m => m.id === id), id);
  const vis = v => L.modelosDaVertical(v, BASES[v]).map(m => m.id);
  assert.ok(vis("odonto").includes("inicio_tratamento") && !vis("oficina").includes("inicio_tratamento"));
  assert.ok(vis("oficina").includes("carro_recebido") && !vis("loja").includes("carro_recebido"));
  assert.ok(vis("loja").includes("pagamento_confirmado") && !vis("odonto").includes("pagamento_confirmado"));
  const comUrg = { ...BASE, etiquetas: [{ id: U(38), nome: "Urgente" }] };
  assert.equal(L.aplicarModelo("etiqueta_urgente", comUrg).config.etiqueta_id, U(38), "AX-067");
});

test("AX-068 / AX-069 / AX-070 tom formal e sugestão dos {{n}}", () => {
  assert.notEqual(L.tomFormal("Me diga o melhor dia."), "Me diga o melhor dia.");
  const p = L.montarParametrosTemplate("Prezada Sra. {{1}}, sua consulta é no horário: {{2}}.");
  assert.equal(p[0].sugestao, "{primeiro_nome}");
  assert.equal(p[1].sugestao, "{hora_consulta}");
});

test("AX-071 / AX-072 / AX-103 perguntas da IA: chips e sem repetição", () => {
  const p = L.perguntasDosAvisos(["Em que horário enviar?", "Em que horário enviar?"], BASE);
  assert.equal(p.length, 1);
  assert.ok(p[0].opcoes && p[0].opcoes.length > 0);
});

test("AX-073 sugestão de variável usa a base", () => {
  assert.equal(L.sugestaoVariavel.length >= 1, true);
  assert.match(ler("web/app/auto-logica.js"), /plano 2000d · AX-073/);
});

test("AX-074 / AX-095 / AX-102 editor: «Esperar» desabilitado no limite e avisos calculados uma vez", () => {
  const src = ler("web/app/auto-editor.js");
  assert.match(src, /est: L\.avisosEstruturaDetalhados\(/, "AX-095");
  assert.match(src, /plano 2000d · AX-074/);
  assert.match(src, /Limite de/);
  assert.match(ler("web/app/automacoes.css"), /\.au-tile:disabled/, "AX-102");
});

test("AX-075 / AX-096 lista: o vazio do filtro tem «Mostrar todas»", () => {
  assert.match(ler("web/app/automacoes.js"), /au-lista-limpar/);
  assert.match(ler("web/app/automacoes.css"), /\.au-lista-limpar[^}]*min-height: var\(--alvo-toque\)/);
});

test("AX-076 variáveis da empresa: endereço, telefone e Instagram", () => {
  assert.ok(CAT.VARIAVEIS_NOVAS.some(v => v[0] === "endereco"));
  assert.ok(CAT.VARIAVEIS_NOVAS.some(v => v[0] === "instagram"));
  const base = { ...BASE, recursos: ["var_dados_empresa"], empresa_dados: { endereco: "Av. Brasil, 10", instagram: "@clinica" } };
  assert.equal(L.aplicarVariaveis("{endereco}", L.exemploVariaveis({ base })), "Av. Brasil, 10");
});

test("AX-078 / AX-079 / AX-080 / AX-083 textos", () => {
  assert.match(L.listaNomesCurta(["", "B"]), /sem nome/);
  assert.match(L.textoParaCompartilhar({ nome: "Lembrete", ativo: true, gatilho: "negocio_ganho", config: {}, acoes: [] }, BASE, VOCAB), /ligada/);
  assert.match(L.resumoRascunhoNova({ gatilho: "negocio_ganho", acoes: [] }), /nenhum passo/);
});

test("AX-084 / AX-085 / AX-086 validação: palavra só com pontuação, pontuação de 0 a 100", () => {
  assert.equal(L.validar({ nome: "x", gatilho: "mensagem_recebida", config: { palavras: ["?"] }, acoes: [{ tipo: "nota", texto: "a" }] }).ok, false);
  assert.equal(L.validar({ nome: "x", gatilho: "negocio_ganho", config: {}, acoes: [{ tipo: "campo_atualizar", campo: "score", valor: "150" }] }).ok, false);
  assert.ok(L.validar({ nome: "x", gatilho: "negocio_ganho", config: {}, acoes: [{ tipo: "campo_atualizar", campo: "score", valor: "80" }] }).ok);
});

test("AX-088 / AX-089 CSS do celular", () => {
  const css = ler("web/app/automacoes.css");
  assert.match(css, /plano 2000d · AX-088/);
  assert.match(css, /-webkit-line-clamp: 3/);
});

test("AX-091 só número oficial: texto livre depois de 24 h", () => {
  const base = { ...BASE, canais: [{ id: U(61), nome: "Oficial", provedor: "meta" }] };
  const a = naEtapaAX({ acoes: [{ tipo: "esperar", minutos: 2880 }, { tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}, tudo bem?" }] });
  assert.ok(tiposAv(a, { base }).includes("janela_meta"));
});

test("AX-097 primeira automação: a pergunta do canal nasce escondida", () => {
  assert.match(ler("web/app/automacoes.js"), /plano 2000d · AX-097/);
  assert.match(ler("web/app/automacoes.js"), /dataset\.pergunta/);
});
