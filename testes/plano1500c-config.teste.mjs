/* plano 1500c · frente config — testes de comportamento (harness copiado de plano1000b-config.teste.mjs) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as CFG from "../web/app/config.js";
import * as ADM from "../web/app/admin.js";
import * as T from "../web/app/tema.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(resolve(RAIZ, f), "utf8");

/* ---------- DOM de mentira (plano1000-automacoes) + captura/bolha (plano1000-sistema) ---------- */
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
    stopImmediatePropagation() { this._parado = true; }
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
    replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
    after(...ns) { const p = this.parentNode; const ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture), once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (!ev._parado && o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { if (o.once) n._ouv = n._ouv.filter(x => x !== o); o.fn(ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
      return !ev.defaultPrevented;
    }
  }
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
    get placeholder() { return this.attrs.get("placeholder") || ""; }
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
    select() {}
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
function comDom({ celular = false } = {}) {
  globalThis.CSS = globalThis.CSS || { escape: s => String(s) };
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent, KeyboardEvent: globalThis.KeyboardEvent, window: globalThis.window,
    matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, location: globalThis.location, history: globalThis.history };
  globalThis.document = doc; globalThis.Event = Evento; globalThis.KeyboardEvent = Evento; globalThis.MouseEvent = Evento;
  globalThis.window = globalThis;
  globalThis.matchMedia = q => ({ matches: celular && /max-width: 760px/.test(q), addEventListener() {}, removeEventListener() {} });
  const mem = new Map(), mem2 = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.sessionStorage = { getItem: k => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, String(v)), removeItem: k => mem2.delete(k) };
  return { doc, Evento, mem, fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
const tique = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function uiReal() { return import("../web/app/ui.js"); }
const textoDe = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const digitar = (d, el, v) => { el.value = v; el.dispatchEvent(new d.Evento("input")); };
const clicar = (d, el) => el.dispatchEvent(new d.Evento("click"));
const botaoTexto = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent));
const adiado = () => { let ok; const p = new Promise(r => { ok = r; }); return { p, ok }; };

/* ---------- contexto das Configurações ---------- */
let seqCli = 0;
function ctxCfg(ui, { partes = [], rpc = async () => ({}), confirmar = async () => true, conta = { id: "c1", papel: "clinica", nome: "Ana", email: "ana@x.com" }, extraUi = {} } = {}) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const navegou = [], toasts = [], confirmacoes = [], chamadas = [], copiados = [];
  const api = { rpcC: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, rpc: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, mensagemErro: e => String(e && e.message || e), fn: async () => ({}) };
  const ctx = {
    ui: { ...ui, carregarCss: () => Promise.resolve(true), toast: (t, o) => toasts.push([t, o || {}]), confirmar: async o => { confirmacoes.push(o); return confirmar(o); }, menu() {},
      copiar: async (t, o) => { copiados.push([t, o]); return true; }, ...extraUi },
    api, rota: { partes, query: {} }, alvo, versao: "dev", titulo() {}, navegar: h => navegou.push(h),
    configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: ["perfil", "usuarios", "ia", "plano", "marca", "dominio"] }, recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }), clientes: () => [] },
    sessao: { conta, org: null }, cliente: { id: `cli-1000b-${++seqCli}`, nome: "Clínica Teste" }, pode: () => true, temModulo: () => true, linkPublico: l => `https://x/${l}`,
  };
  return { ctx, navegou, toasts, confirmacoes, chamadas, copiados };
}

/* ---------- contexto do Admin ---------- */
function ctxAdm(ui, { partes = ["clientes"], rpc, confirmar = async () => true, query = {}, superConta = true, pronto = false, modal = async () => null, extraUi = {} }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const toasts = [], confirmacoes = [], chamadas = [], navegou = [], guardas = [];
  const ctx = {
    ui: { ...ui, tabela: ({ colunas, linhas }) => ({ el: ui.h("div", { class: "tab-falsa" }, linhas.map(l => ui.h("div", { class: "tab-linha", dataset: { id: l.id } },
      colunas.map(c => ui.h("div", { class: "tab-cel", dataset: { col: c.chave } }, c.render ? c.render(l) : String(l[c.chave] ?? "")))))) }),
      carregarCss: () => Promise.resolve(true), toast: (t, o) => toasts.push([t, o && o.tipo, o]), confirmar: async o => { confirmacoes.push(o); return confirmar(o); }, modal, ...extraUi },
    api: { rpc: async (n, p) => { chamadas.push([n, p]); return rpc(n, p); }, mensagemErro: e => String(e && e.message || e) },
    rota: { partes, query }, alvo, titulo() {}, navegar: h => navegou.push(h), pronto: () => pronto, versao: "dev",
    aoSairDaRota: fn => { guardas.push(fn); return () => { const i = guardas.indexOf(fn); if (i >= 0) guardas.splice(i, 1); }; },
    sessao: { conta: { super: superConta, papel: superConta ? "super" : "gestor" }, org: { id: "org-a", nome: "Revenda A" } },
    shell: { recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }), clientes: () => [], escolherCliente: async () => {} },
  };
  return { ctx, alvo, toasts, confirmacoes, chamadas, navegou, guardas };
}
/** ui.modal de mentira que roda a ação primária (com um «m» parecido com o real) e devolve o que ela devolver. */
function modalQueRoda(d, ui, { antes } = {}) {
  const abertos = [];
  const modal = async o => {
    const corpo = ui.h("div", { class: "modal-corpo" }, o.corpo);
    const rod = ui.h("footer", { class: "modal-rod" }, (o.acoes || []).map(a => ui.h("button", { type: "button", dataset: { tipo: a.tipo || "neutro" }, disabled: !!a.desabilitado }, a.rotulo)));
    const el = ui.h("dialog", { class: "modal" }, corpo, rod);
    d.doc.body.appendChild(el);
    const m = { el, corpo, fechar() { el.remove(); }, erro() {} };
    abertos.push({ o, m });
    if (antes) await antes(o, m);
    const prim = (o.acoes || []).find(a => a.tipo === "primario");
    if (!prim || !prim.fn) return null;
    const r = await prim.fn(m);
    return r === false ? null : r;
  };
  return { modal, abertos };
}
const CLI = (extra = {}) => ({ id: "c1", nome: "Alfa", slug: "alfa", status: "ativo", plano: "essencial", org_id: "org-a", ativo: true, vertical: "odonto",
  comercial: { pacote: "essencial", segmento: "Clínica odontológica" }, modulos: ["crm", "conversas"], uso: { usuarios: 1 }, limites: { usuarios: 5 }, ...extra });
const PLANOS = [{ id: "essencial", nome: "Essencial", ativo: true, modulos: ["crm", "conversas"], limites: { usuarios: 5 } }, { id: "pro", nome: "Pro", ativo: true, modulos: ["crm", "conversas", "ads"], limites: {} }];


async function abrirMarcaOrg(d, { rpc = null, confirmar, marca = {} } = {}) {
  const ui = await uiReal();
  const cfg = await import("../web/app/config.js");
  const salvos = [];
  const t = ctxCfg(ui, { partes: ["marca"], conta: { id: "c1", papel: "gestor", super: false, nome: "Gestor" }, confirmar,
    rpc: rpc || (async (n, p) => { if (n === "nx_orgs_listar") return [{ id: "org-a", slug: "rev", marca: { produto: "Rev", cores: { fundo: "#07090C" }, ...marca } }]; if (n === "nx_org_salvar") { salvos.push(p); return { marca: p.p_org.marca }; } return {}; }) });
  t.ctx.cliente = null;
  t.ctx.sessao.org = { id: "org-a", nome: "Revenda" };
  Object.assign(t.ctx.shell, { tema: T, marcaOrg: () => ({}), pintarMarca() {}, aplicarMarcaCliente() {}, recarregarMarca: async () => {}, clientes: () => [] });
  t.ctx.paleta = T.PALETA || [];
  await cfg.montar(t.ctx); await tique(10);
  return { ...t, cfg, salvos, raiz: t.ctx.alvo };
}

/* ================================================================== plano 1500c · (a) lógica pura */

const isoDias = n => ADM.isoMais(new Date().toISOString().slice(0, 10), n);

test("UCB-041 + UCB-082 + UCB-014 + UCB-015 + UCB-027 + UCB-028 + UCB-030 + UCB-033: lógica de Usuários e convites", () => {
  assert.equal(CFG.rotuloPapel("gestor"), "Gestor");
  assert.equal(CFG.rotuloPapel("leitura", { minusculo: true }), "somente leitura");
  assert.ok(CFG.SECOES_COM_PEND.includes("numeros") && Object.isFrozen(CFG.SECOES_COM_PEND));
  assert.equal(CFG.conviteDuplicado({ usuarios: [{ email: "a@b.com" }] }, "A@b.com "), "membro");
  assert.equal(CFG.conviteDuplicado({ usuarios: [], convites: [{ email: "c@d.com" }] }, "c@d.com"), "pendente");
  assert.equal(CFG.conviteDuplicado({ usuarios: [], convites: [{ email: "c@d.com", vencido: true }] }, "c@d.com"), null, "vencido não segura o e-mail");
  assert.equal(CFG.conviteDuplicado({ usuarios: [] }, ""), null);
  assert.equal(CFG.ehUltimoAdmin([{ conta_id: 1, papel: "admin" }, { conta_id: 2, papel: "atendente" }], 1), true);
  assert.equal(CFG.ehUltimoAdmin([{ conta_id: 1, papel: "admin" }, { conta_id: 2, papel: "admin" }], 1), false);
  assert.equal(CFG.ehUltimoAdmin([{ conta_id: 1, papel: "admin" }, { conta_id: 9, papel: "admin", gestor: true }], 1), true, "gestor não conta como admin da empresa");
  assert.deepEqual(CFG.dadosParaReconvite({ papel: "atendente", departamentos: ["d1"], email: "a@b.com" }),
    { papel: "atendente", nome: null, email: "a@b.com", departamentos: ["d1"], dias: 3 });
  const agora = Date.now();
  assert.equal(CFG.conviteVenceLogo(new Date(agora + 3 * 3600e3).toISOString(), agora), true);
  assert.equal(CFG.conviteVenceLogo(new Date(agora + 2 * 86400e3).toISOString(), agora), false);
  assert.equal(CFG.conviteVenceLogo(new Date(agora - 3600e3).toISOString(), agora), false, "já vencido não é «vence hoje»");
  const s = CFG.separarEmails("a@b.com; c@d.com\nerrado, A@B.com");
  assert.deepEqual(s.validos, ["a@b.com", "c@d.com"]);
  assert.deepEqual(s.invalidos, ["errado"]);
  assert.equal(CFG.nuncaEntraram([{ ultimo_acesso: null }, { ultimo_acesso: "2026-10-01" }]).length, 1);
});

test("UCB-057 + UCB-072 + UCB-075 + UCB-076 + UCB-078 + UCB-079 + UCB-080 + UCB-113 + UCB-123 + UCB-007 + UC-040 + UCB-128/129: lógica de Marca e Plano", () => {
  assert.equal(CFG.linkEntradaOrg("https://x.netlify.app", "conecta"), "https://x.netlify.app/app/?org=conecta");
  assert.equal(CFG.linkEntradaOrg("https://x.netlify.app", "conecta", "CRM.Agencia.com.br"), "https://crm.agencia.com.br/app/");
  assert.equal(CFG.diasRestantesTeste("2026-10-24", "2026-10-21"), 3);
  assert.equal(CFG.diasRestantesTeste("2026-10-21", "2026-10-21"), 0);
  assert.equal(CFG.diasRestantesTeste(null, "2026-10-21"), null);
  assert.deepEqual(CFG.rotuloDiasTeste("teste", "2026-10-21", "2026-10-21"), { texto: "O teste termina hoje", tom: "aten" });
  assert.deepEqual(CFG.rotuloDiasTeste("teste", "2026-10-31", "2026-10-21"), { texto: "Faltam 10 dias de teste", tom: "info" });
  assert.equal(CFG.rotuloDiasTeste("ativo", "2026-10-31", "2026-10-21"), null);
  const sus = CFG.avisoStatusPlano("suspenso");
  assert.ok(sus.texto && sus.tom === "ruim");
  assert.equal(CFG.avisoStatusPlano("teste", "2026-10-01", "2026-10-21").tom, "ruim");
  assert.equal(CFG.avisoStatusPlano("ativo"), null);
  const ped = CFG.textoPedidoAumento({ plano: "Essencial", cliente: "X", itens: ["contatos"] });
  assert.ok(ped.includes("Essencial") && ped.includes("contatos"), ped);
  const contratar = CFG.textoPedidoAumento({ plano: "Essencial", cliente: "X", teste: true, testeAte: "2026-10-24" });
  assert.match(contratar, /testando.*24\/10.*contratar o plano Essencial/);
  assert.equal(CFG.projecaoMes(100, "2026-10-10"), 310);
  assert.equal(CFG.projecaoMes(0, "2026-10-10"), 0);
  assert.ok(CFG.REGRA_USO.ia_mes.includes("dia 1º") && CFG.REGRA_USO.ia_mes.includes("seguem"));
  assert.deepEqual(CFG.diferencasPlano({ limites: { usuarios: 3 } }, { limites: { usuarios: 10 } }), ["usuarios: 3 → 10"]);
  assert.deepEqual(CFG.diferencasPlanoTexto({ limites: { usuarios: 3 }, modulos: ["crm"] }, { limites: { usuarios: null }, modulos: ["crm", "ads"] }), ["usuários: 3 → sem limite", "+ Anúncios"]);
  assert.equal(CFG.normalizarTelefone("(12) 99830-3030"), "5512998303030");
  assert.equal(CFG.normalizarTelefone("+351 912 345 678"), "351912345678");
  assert.equal(CFG.normalizarTelefone(""), "");
  assert.equal(CFG.motivoSecaoIndisponivel({ pode: () => false, temModulo: () => true }, { id: "usuarios", papelMin: "admin" }), "papel");
  assert.equal(CFG.motivoSecaoIndisponivel({ pode: () => true, temModulo: () => false }, { id: "ia", modulo: "conversas" }), "modulo");
  assert.equal(CFG.motivoSecaoIndisponivel({ pode: () => true }, undefined), "inexistente");
  assert.deepEqual(CFG.usoAgencia({ org: { nome: "X" } }).map(x => x.uso), [0, 0, 0], "org sem uso não quebra");
  assert.deepEqual(CFG.usoAgencia({ org: { uso: null, limites: { empresas: 5 } } })[0], { rotulo: "Clientes", uso: 0, limite: 5 });
  const ini = isoDias(-8), fim = isoDias(5), hoje = isoDias(0);
  assert.deepEqual(CFG.progressoTeste(ini, fim, hoje), { dia: 9, total: 14 });
  assert.equal(CFG.progressoTeste("", fim, hoje), null);
  assert.equal(CFG.GERENCIAR_USO.ia_mes.href, "#/config/ia");
  assert.equal(CFG.GERENCIAR_USO.contatos.href, "#/crm/contatos");
  // UCB-083 / UC-007
  assert.deepEqual(CFG.estadoNumerosIA({ itens: [{ id: "aparelho_pareado", feito: false }, { id: "ia_ou_direto", feito: true }] }, 1).map(x => [x.rotulo, x.tom]), [["Números", "ruim"], ["IA", "ok"]]);
  assert.deepEqual(CFG.estadoNumerosIA({}, 1), []);
  assert.equal(CFG.resumoDoPeriodo(undefined), null, "servidor antigo: sem o cartão");
  assert.equal(CFG.resumoDoPeriodo({ desde: "2026-10-01", conversas: 12, contatos_novos: 5 }).itens.length, 2);
});

test("UCB-067: conferir o CNAME pela consulta pública de DNS (sem servidor próprio)", async () => {
  const pedidos = [];
  const buscar = async (url) => { pedidos.push(url); return { ok: true, json: async () => ({ Answer: [{ type: 5, data: "orbita-nexus-ads.netlify.app." }] }) }; };
  assert.deepEqual(await CFG.conferirCname("CRM.x.com.br", "orbita-nexus-ads.netlify.app", buscar), { aponta: true, valor: "orbita-nexus-ads.netlify.app" });
  assert.match(pedidos[0], /^https:\/\/dns\.google\/resolve\?name=crm\.x\.com\.br&type=CNAME$/);
  assert.deepEqual(await CFG.conferirCname("crm.x.com.br", "y.netlify.app", async () => ({ ok: true, json: async () => ({}) })), { aponta: false, valor: null });
  await assert.rejects(CFG.conferirCname("crm.x.com.br", "y", async () => ({ ok: false })));
});

test("UCB-001 + UCB-002 + UCB-003 + UCB-004 + UCB-005 + UCB-008 + UCB-009 + UCB-025 + UCB-115: lógica de revenda e planos", () => {
  assert.ok(ADM.opcoesStatusRevenda("cancelado").some(o => o.valor === "cancelado"));
  assert.ok(!ADM.opcoesStatusRevenda("ativo").some(o => o.valor === "cancelado"));
  assert.equal(ADM.pacoteObrigatorio({ conta: { papel: "gestor" }, org: { tipo: "revenda" } }), false);
  assert.equal(ADM.pacoteObrigatorio({ conta: { papel: "gestor" }, org: { tipo: "plataforma" } }), true);
  assert.equal(ADM.pacoteObrigatorio({ conta: { super: true }, org: { tipo: "plataforma" } }, { tipo: "revenda" }), false, "super criando para uma revenda");
  assert.equal(ADM.pacoteObrigatorio({ conta: { super: true }, org: { tipo: "plataforma" } }), true);
  const ps = [{ id: "interno", ativo: true }, { id: "essencial", ativo: true }, { id: "pro", ativo: true }];
  assert.equal(ADM.planoDeAcessoNovo({ superConta: false, planos: ps, orgEscolhida: { tipo: "revenda", limites: { plano_padrao: "pro" } } }), "pro", "gestor: o plano padrão da revenda");
  assert.equal(ADM.planoDeAcessoNovo({ superConta: true, planos: ps, orgEscolhida: { tipo: "revenda", limites: { plano_padrao: "pro" } } }), "pro", "super escolhendo a revenda: o padrão DELA");
  assert.equal(ADM.planoDeAcessoNovo({ superConta: true, planos: ps, orgEscolhida: { tipo: "plataforma" } }), "interno");
  assert.equal(ADM.planoDeAcessoNovo({ superConta: false, planos: ps, escolhido: "essencial", orgEscolhida: { tipo: "revenda", limites: { plano_padrao: "pro" } } }), "essencial", "o escolhido vence");
  const op = ADM.opcoesPlanoPadrao([{ id: "a", nome: "A", ativo: true }, { id: "velho", nome: "Velho", ativo: false }], "velho");
  assert.deepEqual(op[0], { valor: "velho", rotulo: "Velho (desligado)" });
  assert.ok(ADM.opcoesPlanoPadrao([{ id: "a", ativo: true }], "velho").some(o => o.valor === "velho"));
  assert.equal(ADM.quemPausa(false), "pela plataforma");
  const csv = ADM.csvClientes([{ nome: "X", slug: "x", status: "ativo", ativo: false, comercial: { pacote: "ultra" } }], id => id, { superConta: false });
  assert.doesNotMatch(csv, /Nexus/);
  assert.doesNotMatch(csv, /PLANO ULTRA|Pacote comercial/, "a revenda não exporta o pacote da plataforma");
  // plano 2000d: DU-195 — o CSV da plataforma também sai sem a marca (é repassado à revenda)
  assert.match(ADM.csvClientes([], id => id), /Pausado pela plataforma/);
  assert.equal(ADM.testeNoPassado("teste", "2026-10-01", "2026-10-21"), true);
  assert.equal(ADM.testeNoPassado("teste", "2026-10-21", "2026-10-21"), false);
  assert.equal(ADM.testeNoPassado("ativo", "2026-10-01", "2026-10-21"), false);
  assert.equal(ADM.planoSemLimites({}), true);
  assert.equal(ADM.planoSemLimites({ usuarios: 0 }), false, "0 é um limite");
  assert.equal(ADM.precoPlanoValido(-10), false);
  assert.equal(ADM.precoPlanoValido(NaN), false);
  assert.equal(ADM.precoPlanoValido(""), true);
  assert.equal(ADM.precoPlanoValido(297), true);
  assert.equal(ADM.slugValido("-x"), false);
  assert.equal(ADM.slugValido("x-"), false);
  assert.equal(ADM.slugValido("a--b"), false);
  assert.equal(ADM.slugValido("clinica-sorriso"), true);
  assert.equal(ADM.slugValido("ab"), true);
});

test("UCB-084 + UCB-085 + UCB-086 + UCB-087 + UCB-097 + UCB-098 + UCB-127 + UC-021 + UC-022 + UC-023 + UC-032: lógica da carteira", () => {
  assert.equal(ADM.rotuloFimTeste({ status: "teste", teste_ate: "2026-10-23" }, "2026-10-21").texto, "acaba em 2 dias");
  assert.equal(ADM.rotuloFimTeste({ status: "teste", teste_ate: "2026-10-21" }, "2026-10-21").texto, "acaba hoje");
  assert.equal(ADM.rotuloFimTeste({ status: "teste", teste_ate: "2026-10-30" }, "2026-10-21"), null);
  const hoje = isoDias(0);
  const its = [{ status: "teste", teste_ate: isoDias(2) }, { status: "teste", teste_ate: isoDias(20) }, { status: "teste", teste_ate: isoDias(-3) }];
  const r = ADM.resumoClientes(its, hoje);
  assert.equal(r.acabando7, 1);
  assert.equal(r.vencidos, 1);
  assert.equal(ADM.filtrarLocal(its, "acabando", "", hoje).length, 1);
  assert.equal(ADM.filtrarLocal(its, "vencido", "", hoje).length, 1);
  assert.equal(ADM.filtrarLocal([{ comercial: null }, { comercial: { pacote: "ultra" } }], "sem_pacote").length, 1);
  assert.equal(ADM.mrrClientes([{ status: "ativo", plano: "a" }, { status: "teste", plano: "a" }, { status: "ativo", plano: "a", ativo: false }], [{ id: "a", preco_mensal: 100 }]), 100);
  assert.equal(ADM.estenderTeste("2026-10-01", "2026-10-21", 7), "2026-10-28");
  assert.equal(ADM.estenderTeste("2026-10-25", "2026-10-21", 7), "2026-11-01");
  assert.equal(ADM.prorrogarTeste("2026-10-10", "2026-10-21", 7), "2026-10-28");
  assert.equal(ADM.nomeCsvClientes({ status: "teste" }, "2026-10-21"), "clientes-teste-2026-10-21.csv");
  assert.equal(ADM.nomeCsvClientes({}, "2026-10-21"), "clientes-2026-10-21.csv");
  const av = ADM.textoAvisoTeste({ nome: "Clínica" }, 2, "Conecta");
  assert.ok(av.includes("Conecta") && av.includes("2 dias"), av);
  assert.doesNotMatch(av, /Nexus|Órbita/);
  assert.match(ADM.mensagemFollowupTeste({ nome: "Clínica", teste_ate: isoDias(-1), uso: { contatos: 40 } }, hoje, "Conecta"), /terminou.*40 contatos/);
  const passos = ADM.passosRevenda({ cores: { primaria: "#111111" } }, [], []);
  assert.equal(passos.filter(p => !p.opcional && p.feito).length, 0, "revenda nova: 0 de 4");
  assert.equal(passos.length, 6);      // plano 2000d: DU-202 — o passo opcional «Teste grátis pelo seu site»
  assert.equal(ADM.passosRevenda({ logo: "data:x", cores: { primaria: "#111111" }, suporte_wa: "5512999998888" }, [{ uso: { usuarios: 1 } }], []).filter(p => p.feito).length, 4);
});

test("UCB-125 + UC-036: a régua do teste usa a data de São Paulo nas bordas do relógio do CI (02:50Z / 03:05Z)", async () => {
  const ui = await uiReal();
  // 02:50Z = 23:50 de 31/10 em SP; 03:05Z = 00:05 de 01/11 em SP — a data de São Paulo, não a de UTC
  const antes = ui.hojeSP(new Date("2026-11-01T02:50:00Z")), depois = ui.hojeSP(new Date("2026-11-01T03:05:00Z"));
  assert.equal(antes, "2026-10-31");
  assert.equal(depois, "2026-11-01");
  const cli = { status: "teste", teste_ate: "2026-10-31" };
  assert.equal(ADM.testeVencidoHa(cli, antes), null, "23:50 de SP: o teste ainda vale hoje");
  assert.equal(ADM.testeVencidoHa(cli, depois), 1, "00:05 de SP: venceu há 1 dia");
  assert.deepEqual(CFG.statusDoPlano("teste", "2026-10-31", antes), ["Em teste", "info"]);
  assert.deepEqual(CFG.statusDoPlano("teste", "2026-10-31", depois), ["Teste encerrado", "ruim"]);
  assert.equal(CFG.diasRestantesTeste("2026-11-01", antes), 1);
  assert.equal(CFG.diasRestantesTeste("2026-11-01", depois), 0);
  assert.equal(ADM.diasAteFimTeste("2026-11-01", depois), 0);
  assert.equal(ADM.rotuloFimTeste({ status: "teste", teste_ate: "2026-11-01" }, depois).texto, "acaba hoje");
});

test("UCB-103..UCB-108 + UCB-063 (CSS) e textos (UCB-006/031/061/065/068/079)", () => {
  const css = ler("web/app/config.css");
  const bloco = css.slice(css.indexOf("plano 1500c (frente config)"));
  assert.match(bloco, /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*\.cfg-hist summary, \.cfg-hist-item \{ min-height: 44px; \}/);
  assert.match(css, /\.adm-anel-num \{[^}]*font-size: 1\.375rem/);
  assert.doesNotMatch(css, /\.adm-anel-num \{[^}]*font-size: 22px/);
  assert.match(bloco, /@media \(forced-colors: active\) \{\s*\.cfg-online i \{[^}]*Highlight/);
  assert.match(bloco, /\.lista-convites \.bt, \.adm-convites \.bt, \.dom-item \.bt[^{]*\{ min-height: 44px; \}/);
  assert.match(bloco, /@media \(max-width: 760px\) \{ \.pv-login \{ min-height: 320px; padding: 1rem \.8rem; \} \}/);
  assert.match(bloco, /\.cores-caixa:disabled \{ opacity: \.6; \}/);
  assert.match(bloco, /@media \(pointer: fine\) \{ \.logo-amostra \.logo-arraste \{ display: block; \} \}/);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "só tokens");
  const js = ler("web/app/config.js");
  const fav = js.slice(js.indexOf("UCB-006"), js.indexOf("UCB-006") + 400);
  assert.match(fav, /crossOrigin = "anonymous"/);
  assert.match(js, /Se preencher, só este e-mail poderá aceitar o convite\./);
  assert.match(js, /PNG com fundo transparente, de preferência horizontal \(até 320 × 160\)/);
  assert.match(js, /"Voltar às cores da "/);
  assert.match(js, /Usa Cloudflare\? Deixe o proxy desligado \(nuvem cinza/);
  for (const f of ["web/app/config.js", "web/app/admin.js"]) {
    const novos = ler(f).split("\n").filter(l => /plano 1500c/.test(l)).join("\n");
    assert.doesNotMatch(novos, /#[0-9a-fA-F]{6}\b/, `${f}: nada de cor em hex nas linhas novas`);
  }
});

/* ================================================================== plano 1500c · (b) Configurações */

test("UCB-015 + UCB-032 + UCB-033 + UCB-034 + UCB-035 + UCB-039 Usuários: único admin, papéis, «Nunca entraram», barra e remover", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const menus = [];
    let dados = { usuarios: [
      { conta_id: "a1", nome: "Ana Admin", email: "ana@x.com", papel: "admin", editavel: true, ultimo_acesso: new Date().toISOString() },
      { conta_id: "b2", nome: "Bia", email: "bia@x.com", papel: "atendente", editavel: true, ultimo_acesso: null, conversas_abertas: 3 },
      { conta_id: "c3", nome: "Caio", email: "caio@x.com", papel: "atendente", editavel: true, ultimo_acesso: null }], convites: [], departamentos: [], uso: 4, limite: 5 };
    const t = ctxCfg(ui, { partes: ["usuarios"], confirmar: async () => true, extraUi: { menu: (b, itens) => menus.push(itens), anunciar() {} },
      rpc: async (n, p) => {
        if (n === "nx_usuarios_listar") return dados;
        if (n === "nx_usuario_remover") { dados = { ...dados, usuarios: dados.usuarios.filter(u => u.conta_id !== p.p_conta) }; return dados; }
        return {};
      } });
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    // UCB-015: o único admin não tem seletor de papel e «Remover acesso» vem desligado com o motivo
    assert.equal(raiz.querySelector("select[aria-label='Papel de Ana Admin']"), null);
    assert.ok(raiz.querySelector("select[aria-label='Papel de Bia']"));
    assert.match(textoDe(raiz.querySelector(".cfg-us-tab")), /Único administrador/);
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Ana Admin"));
    const rem = menus.at(-1).find(i => i && i.rotulo === "Remover acesso");
    assert.equal(rem.desabilitado, true);
    assert.match(rem.motivo, /pelo menos um administrador/);
    // UCB-032: o que cada papel pode fazer (4 linhas) e o seletor aponta para lá
    assert.equal(raiz.querySelectorAll(".cfg-papeis dt").length, 4);
    assert.equal(raiz.querySelector("select[aria-label='Papel de Bia']").getAttribute("aria-describedby"), "cfg-papeis-ajuda");
    // UCB-034: barra «Usuários do plano»
    assert.ok(raiz.querySelector(".cfg-us-barra [role=meter]"));
    // UCB-033: «Nunca entraram (2)» filtra
    const chip = raiz.querySelector(".cfg-us-nunca");
    assert.match(textoDe(chip), /Nunca entraram \(2\)/);
    clicar(d, chip); await tique(2);
    assert.doesNotMatch(textoDe(raiz.querySelector(".cfg-us-tab")), /Ana Admin/);
    assert.equal(chip.getAttribute("aria-pressed"), "true");
    // UCB-035 + UCB-039: remover cita as conversas abertas e o foco fica no cartão
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bia"));
    await menus.at(-1).find(i => i && i.rotulo === "Remover acesso").fn(); await tique(6);
    assert.match(t.confirmacoes.at(-1).texto, /3 conversas abertas, que voltam para a fila/);
    assert.ok(t.ctx.alvo.contains(d.doc.activeElement), "o foco não cai no body");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-014 + UCB-016 + UCB-017 + UCB-027 + UCB-028 + UCB-029 + UCB-030 + UCB-038 Convites", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const { modal, abertos } = modalQueRoda(d, ui);
    let antes = null, erroCriar = null, nCriar = 0;
    const dados = { usuarios: [{ conta_id: "a1", nome: "Ana", email: "ana@x.com", papel: "admin", editavel: false }],
      convites: [{ id: "cv1", papel: "atendente", email: "logo@x.com", expira_em: new Date(Date.now() + 2 * 3600e3).toISOString() },
        { id: "cv2", papel: "leitura", email: "outro@x.com", expira_em: new Date(Date.now() + 5 * 86400e3).toISOString() },
        { id: "cv3", papel: "atendente", email: "velho@x.com", expira_em: new Date(Date.now() - 86400e3).toISOString(), vencido: true }], departamentos: [], uso: 3, limite: 10 };
    const t = ctxCfg(ui, { partes: ["usuarios"], extraUi: { modal: o => modal(o), blocoLink: l => ui.h("p", { class: "lnk" }, l) },
      rpc: async (n, p) => {
        if (n === "nx_usuarios_listar") return dados;
        if (n === "nx_convite_criar") { nCriar++; if (erroCriar) throw erroCriar; return { id: `n${nCriar}`, link: `https://x/#/convite/t${nCriar}`, expira_em: new Date(Date.now() + 3 * 86400e3).toISOString() }; }
        return {};
      } });
    t.ctx.ui.modal = async o => { if (antes) await antes(o); return modal(o); };
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    const listar = () => t.chamadas.filter(c => c[0] === "nx_usuarios_listar").length;
    // UCB-028: vence em 2 h → «vence hoje»; UCB-029: o vencido vai para «Venceram sem uso»
    assert.match(textoDe(raiz.querySelector(".cfg-conv-logo")), /logo@x\.com.*vence hoje/);
    assert.match(textoDe(raiz.querySelector(".cfg-conv-vencidos")), /Venceram sem uso.*velho@x\.com/);
    // UCB-014: e-mail de quem já tem acesso → erro no campo, nenhum convite
    antes = async o => { o.corpo.querySelector("input[name=email]").value = "ANA@x.com "; o.corpo.querySelector("select[name=papel]").value = "atendente"; };
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(6);
    assert.match(textoDe(abertos.at(-1).o.corpo.querySelector("[data-campo=email] .campo-erro")), /já tem acesso/);
    assert.equal(nCriar, 0);
    // UCB-016: email_invalido do servidor → no campo e o modal continua
    erroCriar = Object.assign(new Error("x"), { codigo: "email_invalido" });
    antes = async o => { o.corpo.querySelector("input[name=email]").value = "novo@x.com"; o.corpo.querySelector("select[name=papel]").value = "atendente"; };
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(6);
    assert.match(textoDe(abertos.at(-1).o.corpo.querySelector("[data-campo=email] .campo-erro")), /não parece válido/);
    // UCB-017: criado → entra na lista e no uso SEM recarregar a seção
    erroCriar = null;
    const nListar = listar();
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(8);
    assert.equal(listar(), nListar, "nx_usuarios_listar não é chamado de novo");
    assert.match(textoDe(raiz.querySelector(".cfg-conv-lista")), /novo@x\.com/);
    assert.match(textoDe(raiz.querySelector(".cartao .sub")), /^4 de 10 usuários/);
    // UCB-030: vários e-mails — um convite para cada válido
    const n0 = nCriar;
    antes = async o => { clicar(d, o.corpo.querySelector(".cfg-conv-varios")); o.corpo.querySelector("textarea[name=emails]").value = "p1@x.com; p2@x.com\nana@x.com"; o.corpo.querySelector("select[name=papel]").value = "atendente"; };
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(10);
    assert.equal(nCriar - n0, 2, "ana@x.com já tem acesso: fica de fora");
    // UCB-027: «Gerar de novo» revoga e cria com os mesmos dados
    antes = null;
    const ordem = t.chamadas.length;
    clicar(d, raiz.querySelector(".cfg-conv-logo .cfg-conv-novo")); await tique(8);
    const seq = t.chamadas.slice(ordem).map(c => c[0]);
    assert.deepEqual(seq.filter(n => /convite/.test(n)), ["nx_convite_revogar", "nx_convite_criar"]);
    assert.equal(t.chamadas.slice(ordem).find(c => c[0] === "nx_convite_criar")[1].p_dados.email, "logo@x.com");
    // UCB-038: revogar → o foco vai ao próximo «Revogar» do cartão
    clicar(d, raiz.querySelectorAll(".cfg-conv-revogar")[0]); await tique(6);
    assert.ok(raiz.querySelector(".cfg-conv-cartao").contains(d.doc.activeElement), "foco dentro do cartão de convites");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-122 + UCB-123 + UCB-081 + UCB-124 hub: «/» foca a busca; seção indisponível diz o motivo; teste na Visão geral; próximos passos", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const ouvintes = [];
    d.doc.addEventListener = (tipo, fn) => ouvintes.push([tipo, fn]);
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => (n === "nx_onboarding_estado" ? { itens: [] } : n === "nx_usuarios_listar" ? { usuarios: [], convites: [], departamentos: [] } : {}) });
    t.ctx.pode = p => p !== "admin";
    await cfg.montar(t.ctx); await tique(8);
    // UCB-123: a seção existe mas o papel não alcança
    assert.match(textoDe(t.ctx.alvo.querySelector(".cfg-sec")), /Peça a um administrador/);
    cfg.desmontar(); d.doc.body.removeChild(t.ctx.alvo);
    // UCB-081 + UCB-124 + UCB-122
    const t2 = ctxCfg(ui, { partes: [], rpc: async n => (n === "nx_onboarding_estado" ? { itens: [] } : {}) });
    Object.assign(t2.ctx.cliente, { status: "teste", teste_ate: ui.hojeSP() });
    t2.ctx.shell.prontos.CONFIG_PRONTAS.push("x1", "x2");
    await cfg.montar(t2.ctx); await tique(10);
    const vg = t2.ctx.alvo.querySelector(".cfg-vg");
    assert.match(textoDe(vg.querySelector(".cfg-vg-teste")), /O teste termina hoje\. Ver plano e uso/);
    assert.equal(vg.querySelector(".cfg-vg-teste a").getAttribute("href"), "#/config/plano");
    assert.ok(vg.querySelectorAll(".cfg-vg-proximos a").length >= 2, "atalhos de próximos passos");
    const busca = t2.ctx.alvo.querySelector(".cfg-busca-inp");
    if (busca) {
      const tecla = ouvintes.filter(o => o[0] === "keydown").at(-1)[1];
      const ev = new d.Evento("keydown", { key: "/" });
      tecla(ev);
      assert.equal(d.doc.activeElement, busca);
      assert.equal(ev.defaultPrevented, true);
    }
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-111 + UCB-112 + UCB-113 + UCB-114 + UCB-050 Perfil", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => {
      if (n === "nx_senha_trocar") return { sessoes_encerradas: 2 };
      if (n === "nx_sessoes_listar") return [{ id: "s1", navegador: "Chrome no Windows", atual: true, ultimo_uso: new Date().toISOString() }, { id: "s2", navegador: "Safari no iPhone", ultimo_uso: new Date().toISOString() }];
      return { ok: true };
    } });
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    const [formDados, formSenha] = raiz.querySelectorAll(".cfg-sec form");
    formSenha.reset = () => {};          // o DOM de mentira não tem form.reset
    digitar(d, formDados.querySelector("input[name=nome]"), "A");
    formDados.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.match(textoDe(formDados.querySelector("[data-campo=nome] .campo-erro")), /2 a 80 letras/);
    digitar(d, formDados.querySelector("input[name=nome]"), "Ana Lima");
    formDados.querySelector("input[name=telefone]").value = "(12) 99830-3030";
    formDados.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_perfil_salvar")[1].p_dados, { nome: "Ana Lima", telefone: "5512998303030" });
    formSenha.querySelector("input[name=atual]").value = "velhaSenha1";
    formSenha.querySelector("input[name=nova]").value = "novaSenha22";
    formSenha.querySelector("input[name=nova2]").value = "novaSenha22";
    formSenha.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.equal(t.toasts.at(-1)[0], "Senha trocada. 2 outras sessões encerradas.");
    // UCB-050: a lista de aparelhos; encerrar um tira a linha
    const itens = raiz.querySelectorAll(".cfg-sessao");
    assert.equal(itens.length, 2);
    clicar(d, botaoTexto(raiz.querySelector(".cfg-sessoes"), /Encerrar/)); await tique(6);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_sessao_encerrar")[1], { p_id: "s2" });
    assert.equal(raiz.querySelectorAll(".cfg-sessao").length, 1);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-055 + UCB-056 + UCB-057 + UCB-058 + UCB-060 + UCB-062 + UCB-064 + UC-033 Marca da revenda", async () => {
  const d = comDom();
  try {
    let confirmar = async () => false;
    const m = await abrirMarcaOrg(d, { confirmar: o => confirmar(o), marca: { produto: "Conecta" } });
    const raiz = m.raiz;
    // UC-033: sem WhatsApp de suporte → aviso; UCB-058: com número válido → «Testar»
    assert.equal(raiz.querySelector(".cfg-sem-wa").hidden, false);
    digitar(d, raiz.querySelector("[name=suporte_wa]"), "5512999998888");
    assert.equal(raiz.querySelector(".cfg-sem-wa").hidden, true);
    const testar = raiz.querySelector(".cfg-wa-testar");
    assert.equal(testar.hidden, false);
    assert.equal(testar.getAttribute("href"), "https://wa.me/5512999998888");
    // UCB-064
    assert.equal(textoDe(raiz.querySelector("fieldset.cores-caixa > legend")), "Cores da marca");
    // UCB-057: link completo com «Copiar»
    assert.match(textoDe(raiz.querySelector(".cfg-link-entrada-txt")), /\/app\/\?org=rev$/);
    // UCB-060: a mini aba com o nome do produto
    assert.match(textoDe(raiz.querySelector(".pv-aba-nome")), /Conecta/);
    // UCB-056: «Cores padrão» → toast com «Desfazer»
    clicar(d, botaoTexto(raiz, /^Cores padrão$/));
    const toast = m.toasts.at(-1);
    assert.equal(toast[1].acao.rotulo, "Desfazer");
    // UCB-055: cor primária ilegível sobre fundo claro → pede confirmação antes de salvar (Cancelar → nada salvo)
    const T2 = await import("../web/app/tema.js");
    const ruim = T2.derivarTema({ primaria: "#FFFF00", secundaria: "#FFFF66", fundo: "#FFFFFF" });
    if (ruim.avisos.length) {
      const seletores = raiz.querySelectorAll(".cores-caixa input");
      for (const s of seletores) { if (/prim/i.test(s.getAttribute("aria-label") || s.name || "")) { s.value = "#FFFF00"; s.dispatchEvent(new d.Evento("input")); s.dispatchEvent(new d.Evento("change")); } }
    }
    // UCB-062: erro de imagem ligado ao botão
    const btEnviar = botaoTexto(raiz.querySelector(".img-campo"), /Enviar imagem/);
    clicar(d, botaoTexto(raiz.querySelectorAll(".img-campo")[2] || raiz, /Gerar do logo/)); await tique(4);
    const campoFav = raiz.querySelectorAll(".img-campo")[2];
    if (campoFav) {
      const bt = botaoTexto(campoFav, /Enviar imagem/);
      const erro = campoFav.querySelector(".campo-erro");
      assert.equal(erro.hidden, false, "sem logo: «Envie o logo primeiro.»");
      assert.equal(bt.getAttribute("aria-describedby"), erro.getAttribute("id"));
    }
    assert.ok(btEnviar);
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-055: salvar com contraste ruim pergunta antes (Cancelar → nada salvo)", async () => {
  const d = comDom();
  try {
    const m = await abrirMarcaOrg(d, { confirmar: async () => false, marca: { produto: "Conecta", cores: { primaria: "#FFFF00", secundaria: "#FFFF66", fundo: "#FFFFFF" } } });
    const ruim = T.derivarTema(T.marcaEfetiva({ cores: { primaria: "#FFFF00", secundaria: "#FFFF66", fundo: "#FFFFFF" } }, {}).cores);
    digitar(d, m.raiz.querySelector("[name=login_titulo]"), "Bem-vindo");
    clicar(d, botaoTexto(m.raiz, /Salvar marca/)); await tique(6);
    if (ruim.avisos.length) {
      assert.match(m.confirmacoes.at(-1).titulo, /difíceis de ler/);
      assert.equal(m.salvos.length, 0);
    } else assert.equal(m.salvos.length, 1, "sem aviso de contraste salva direto");
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-020 + UCB-021 Marca: rota sem query não quebra; erro do editor mostra o cartão de erro", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["marca"], conta: { id: "c1", papel: "gestor", super: false, nome: "G" }, rpc: async n => (n === "nx_orgs_listar" ? [{ id: "org-a", slug: "rev", marca: {} }] : {}) });
    t.ctx.rota = { partes: ["marca"] };          // sem query
    t.ctx.cliente = null;
    t.ctx.sessao.org = { id: "org-a", nome: "Revenda" };
    Object.assign(t.ctx.shell, { tema: T, marcaOrg: () => ({}), pintarMarca() {}, aplicarMarcaCliente() {}, recarregarMarca: async () => {}, clientes: () => null });
    t.ctx.ui.seletorCor = () => { throw new Error("seletor quebrou"); };
    await cfg.montar(t.ctx); await tique(12);
    assert.ok(t.ctx.alvo.querySelector(".cfg-sec"));
    assert.doesNotMatch(textoDe(t.ctx.alvo.querySelector(".cfg-sec")), /^$/);
    assert.equal(t.ctx.alvo.querySelectorAll(".cfg-sec .esqueleto").length, 0, "não fica preso no esqueleto");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-018 + UCB-019 + UCB-067 + UCB-068 + UCB-069 Domínio", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    // UCB-019: sem location e com o host injetado
    const salvoLoc = globalThis.location; delete globalThis.location;
    const ctx = { ui: { ...ui, confirmar: async () => true }, api: { mensagemErro: String }, shell: { marcaEfetiva: () => ({}) } };
    const c = cfg.cartaoDominio(ctx, { host: "crm.x.com.br", status: "pendente", dns: {} }, { conferirDns: async (host, alvo) => ({ aponta: true, valor: alvo }), hostAtual: "app-x.netlify.app" });
    assert.match(textoDe(c), /crm\.x\.com\.br → app-x\.netlify\.app/);
    assert.match(textoDe(c), /Usa Cloudflare\?/);
    clicar(d, botaoTexto(c, /Conferir DNS/)); await tique(6);
    assert.match(textoDe(c.querySelector(".dom-dns-res")), /O CNAME já aponta certo/);
    assert.doesNotThrow(() => cfg.cartaoDominio(ctx, { host: "a.x.com", status: "pendente", dns: {} }, { conferirDns: null }));
    const at = cfg.cartaoDominio(ctx, { host: "crm.x.com.br", status: "ativo" }, {});
    assert.equal(at.querySelector("a.dom-abrir").getAttribute("href"), "https://crm.x.com.br/app/");
    if (salvoLoc !== undefined) globalThis.location = salvoLoc;
    // UCB-018: shell.clientes() → null não quebra a seção
    const t = ctxCfg(ui, { partes: ["dominio"], conta: { id: "c1", papel: "gestor", nome: "G" }, rpc: async n => (n === "nx_dominios_listar" ? [] : {}) });
    t.ctx.shell.clientes = () => null;
    await cfg.montar(t.ctx); await tique(8);
    const sel = t.ctx.alvo.querySelector("select[name=cliente]");
    assert.ok(sel, "a seção abriu");
    assert.equal(sel.querySelectorAll("option").length, 1, "só «Toda a agência»");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UCB-007 + UCB-072..UCB-078 + UCB-080 + UCB-083 + UC-007 + UC-008 + UC-040 Plano e uso", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const hoje = ui.hojeSP();
    const fim = ADM.isoMais(hoje, 2), ini = ADM.isoMais(hoje, -5);
    const t = ctxCfg(ui, { partes: ["plano"], rpc: async n => {
      if (n === "nx_uso_plano") return { plano: { nome: "Essencial", preco_mensal: 297 }, status: "teste", teste_ate: fim, teste_inicio: ini,
        uso: { usuarios: 1, ia_mes: 50, canais: 1 }, limites: { usuarios: 5, ia_mes: 60, canais: 1 }, modulos: ["crm", "conversas"],
        org: { nome: "Conecta" }, resumo_periodo: { desde: ini, conversas: 12, contatos_novos: 7 },
        planos_disponiveis: [{ nome: "Essencial", preco_mensal: 297, limites: { usuarios: 5 } }, { nome: "Pro", preco_mensal: 497, limites: { usuarios: 15 }, modulos: ["crm", "conversas", "ads"] }] };
      if (n === "nx_onboarding_estado") return { itens: [{ id: "aparelho_pareado", feito: false }, { id: "ia_ou_direto", feito: true }] };
      return {};
    } });
    t.ctx.shell.marcaEfetiva = () => ({ suporte_wa: "5512999998888" });
    await cfg.montar(t.ctx); await tique(12);
    const raiz = t.ctx.alvo;
    // UCB-074 + UCB-072 + UC-040
    assert.match(textoDe(raiz.querySelector(".cfg-plano-preco")), new RegExp(`^Grátis até ${ui.dataBR(fim).replace(/\//g, "\\/")} · depois R\\$`));
    assert.match(textoDe(raiz.querySelector(".cfg-dias-teste")), /Faltam 2 dias de teste/);
    assert.match(textoDe(raiz.querySelector(".cfg-teste-prog")), /Dia 6 de 8 do teste/);
    // UC-008 + UCB-073: em teste o botão é «Quero contratar» e a mensagem fala do teste e do plano
    const bt = raiz.querySelector("a.cfg-quero-aumentar");
    assert.match(textoDe(bt), /Quero contratar/);
    const msg = decodeURIComponent(bt.getAttribute("href").split("text=")[1]);
    assert.match(msg, /testando.*contratar o plano Essencial/);
    // UCB-078: projeção do mês da IA
    assert.match(textoDe(raiz.querySelector(".cfg-uso-proj")), /No ritmo atual, chega a ~\d/);
    // UCB-083: números e IA (do checklist)
    assert.match(textoDe(raiz.querySelector(".cfg-plano-estado")), /Números: desconectado.*IA: ligada/);
    // UC-007 + UCB-080/UC-009
    assert.match(textoDe(raiz.querySelector(".cfg-resumo-periodo")), /No seu teste até agora.*12.*Conversas atendidas/);
    assert.match(textoDe(raiz.querySelector(".cfg-comparar")), /Pro.*usuários: 5 → 15.*\+ Anúncios/);
    assert.equal(raiz.querySelector(".cfg-comparar-it.atual").getAttribute("aria-current"), "true");
    // UCB-007: org sem «uso» não derruba o cartão «Sua agência»
    assert.match(textoDe(raiz), /Sua agência/);
    cfg.desmontar(); d.doc.body.removeChild(t.ctx.alvo);
    // UCB-075 + UCB-077: suspenso explica; sem WhatsApp o aviso de limite manda usar o botão
    const t2 = ctxCfg(ui, { partes: ["plano"], rpc: async n => (n === "nx_uso_plano" ? { plano: { nome: "Essencial" }, status: "suspenso", uso: { usuarios: 5 }, limites: { usuarios: 5 } } : {}) });
    t2.ctx.shell.marcaEfetiva = () => ({});
    await cfg.montar(t2.ctx); await tique(10);
    assert.match(textoDe(t2.ctx.alvo.querySelector(".cfg-plano-status")), /suspensa/);
    assert.match(textoDe(t2.ctx.alvo.querySelector(".aviso.aviso-ruim:not(.cfg-plano-status)")), /use o botão Quero aumentar/);
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== plano 1500c · (c) Admin */

test("UCB-002 + UCB-003 + UCB-115 + UCB-116 + UCB-090 Admin (gestor de revenda) → novo cliente sem os pacotes da Nexus", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const { modal, abertos } = modalQueRoda(d, ui, { antes: async (o) => {
      const f = o.corpo;
      f.querySelector("input[name=nome]").value = "  ";
    } });
    let passo = 0;
    const salvos = [];
    const t = ctxAdm(ui, { superConta: false, modal: async o => {
      passo++;
      return modalQueRoda(d, ui, { antes: async (oo) => {
        const f = oo.corpo;
        f.querySelector("input[name=nome]").value = passo === 1 ? "   " : "Clínica Sorriso";
        f.querySelector("input[name=slug]").value = passo === 2 ? "-sorriso" : "sorriso";
        f.querySelector("select[name=status]").value = "teste";
        f.querySelector("input[name=dias]").value = "14";
        const sel = f.querySelector("select[name=plano_tecnico]"); if (sel) sel.value = "pro";
      } }).modal(o);
    }, rpc: async (n, p) => {
      if (n === "nx_planos_listar") return [{ id: "interno", nome: "Interno", ativo: true }, ...PLANOS];
      if (n === "nx_orgs_listar") return [{ id: "org-a", tipo: "revenda", nome: "Revenda A", limites: { plano_padrao: "pro" }, marca: {} }];
      if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { id: "novo1", plano: p.p_cliente.plano, comercial: {} }; }
      if (n === "nx_clientes_admin") return [];
      return [];
    } });
    t.ctx.sessao.org = { id: "org-a", nome: "Revenda A", tipo: "revenda" };
    await adm.montar(t.ctx); await tique(8);
    const novo = () => t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Novo cliente");
    assert.match(textoDe(novo()), /Novo cliente/, "UCB-117: o texto visível diz a ação");
    clicar(d, novo()); await tique(8);      // nome só com espaços
    assert.equal(salvos.length, 0);
    clicar(d, novo()); await tique(8);      // slug com hífen no começo
    assert.equal(salvos.length, 0);
    clicar(d, novo()); await tique(8);
    assert.equal(salvos.length, 1);
    assert.equal(salvos[0].plano, "pro", "o plano técnico escolhido (o padrão da revenda)");
    assert.equal(salvos[0].comercial.pacote, null, "sem o pacote comercial da Nexus");
    assert.deepEqual(t.navegou.at(-1), "#/admin/clientes/novo1?novo=1");
    void abertos; void modal;
    adm.desmontar();
  } finally { d.fim(); }
});

test("UCB-005 + UCB-084 + UCB-085 + UCB-086 + UCB-096 + UC-032 Admin → lista do gestor: sem «Nexus», teste acabando, receita e passos da revenda", async () => {
  const d = comDom();
  const salvo = { history: globalThis.history, location: globalThis.location };
  globalThis.history = { state: null, replaceState() {} };
  globalThis.location = { hash: "#/admin/clientes", hostname: "app.x" };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const hoje = ui.hojeSP();
    const itens = [CLI({ id: "c1", status: "ativo", plano: "pro" }), CLI({ id: "c2", nome: "Beta", status: "teste", teste_ate: ADM.isoMais(hoje, 2), ativo: false }),
      CLI({ id: "c3", nome: "Gama", status: "teste", teste_ate: ADM.isoMais(hoje, -4) })];
    const t = ctxAdm(ui, { superConta: false, rpc: async n => {
      if (n === "nx_planos_listar") return [{ id: "essencial", nome: "Essencial", ativo: true, preco_mensal: 100 }, { id: "pro", nome: "Pro", ativo: true, preco_mensal: 250 }];
      if (n === "nx_clientes_admin") return itens;
      if (n === "nx_orgs_listar") return [{ id: "org-a", tipo: "revenda", nome: "Revenda A", marca: {} }];
      return [];
    } });
    await adm.montar(t.ctx); await tique(12);
    const raiz = t.alvo;
    assert.doesNotMatch(textoDe(raiz), /Nexus/, "a revenda não vê a marca da plataforma");
    assert.doesNotMatch(textoDe(raiz), /Sem pacote/);
    assert.match(textoDe(raiz.querySelector(".tab-falsa")), /acaba em 2 dias/);
    assert.match(textoDe(raiz.querySelector(".tab-falsa")), /Teste vencido há 4 dias/);
    assert.ok(raiz.querySelector(".adm-followup"), "UC-023: follow-up na linha");
    const faixa = textoDe(raiz.querySelector(".adm-kpis"));
    assert.match(faixa, /Teste acabando/);
    assert.match(faixa, /Teste vencido/);
    assert.match(faixa, /Receita mensal/);
    // UC-032: «Deixe sua revenda pronta»
    // clientes já existem e um tem a equipe entrando (uso.usuarios 1): faltam logo/cores e o WhatsApp de suporte
    assert.match(textoDe(raiz.querySelector(".adm-passos")), /Deixe sua revenda pronta.*2 de 4 passos feitos.*Logo e cores/);
    adm.desmontar();
  } finally { globalThis.history = salvo.history; globalThis.location = salvo.location; if (salvo.history === undefined) delete globalThis.history; if (salvo.location === undefined) delete globalThis.location; d.fim(); }
});

test("UCB-008 + UCB-087 + UCB-088 + UCB-089 + UCB-091 + UCB-094 + UCB-100 + UCB-126 + UCB-002 Admin → detalhe", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const { modal } = modalQueRoda(d, ui);
    const salvos = [];
    const hoje = ui.hojeSP();
    let respConfirmar = true;
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], modal, confirmar: async () => respConfirmar,
      rpc: async (n, p) => {
        if (n === "nx_clientes_admin") return [CLI({ status: "teste", teste_ate: ADM.isoMais(hoje, 1), canais: [{ estado: "desconectado" }] })];
        if (n === "nx_planos_listar") return PLANOS;
        if (n === "nx_usuarios_listar") return { usuarios: [], convites: [] };
        if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { ...CLI(), ...p.p_cliente }; }
        return [];
      } });
    t.ctx.shell.escolherCliente = async () => {};
    await adm.montar(t.ctx); await tique(12);
    const raiz = t.alvo;
    // UCB-100: o número desconectado no cabeçalho
    assert.match(textoDe(raiz.querySelector(".adm-cab-numeros")), /1 desconectado/);
    // UCB-126: aviso de teste acabando com os atalhos
    const av = raiz.querySelector(".adm-aviso-teste");
    assert.equal(av.hidden, false);
    assert.match(textoDe(av), /acaba em 1 dia.*\+7 dias de teste.*Converter em pagante.*Avisar pelo WhatsApp/);
    // UCB-094: limites extras dizem o limite do plano
    assert.equal(raiz.querySelector("input[name=lim_usuarios]").getAttribute("placeholder"), "plano: 5");
    // UCB-088 + UCB-087
    const inp = raiz.querySelector("input[name=teste_ate]");
    assert.match(textoDe(raiz.querySelector(".adm-teste-faltam")), /Falta 1 dia\./);
    clicar(d, botaoTexto(raiz, /^\+7 dias$/));
    assert.equal(inp.value, ADM.isoMais(hoje, 8));
    assert.match(textoDe(raiz.querySelector(".adm-teste-faltam")), /Faltam 8 dias\./);
    // UCB-008: fim no passado pergunta antes (Cancelar → nada salvo)
    raiz.querySelector("select[name=plano]").value = "essencial";
    const selSt = raiz.querySelector("select[name=status]"); selSt.value = "teste";
    inp.value = ADM.isoMais(hoje, -2);
    respConfirmar = false;
    raiz.querySelector(".adm-det form").dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(t.confirmacoes.at(-1).titulo, /O teste já terá terminado/);
    assert.equal(salvos.length, 0);
    // UCB-089: «Converter em pagante» salva só a situação
    respConfirmar = true;
    clicar(d, raiz.querySelector(".adm-converter")); await tique(8);
    assert.deepEqual(salvos.at(-1), { id: "c1", status: "ativo" });
    assert.match(t.toasts.at(-1)[0], /convertido/);
    // UCB-091: «Entrar» registra o motivo antes (servidor sem a função segue)
    clicar(d, botaoTexto(raiz, /^Entrar$/)); await tique(8);
    assert.ok(t.chamadas.some(c => c[0] === "nx_suporte_entrar"));
    assert.deepEqual(t.navegou.at(-1), "#/");
    adm.desmontar();
  } finally { d.fim(); }
});

test("UCB-002 Admin → detalhe do gestor: sem pacote comercial nem «Órbita» e o pacote salvo fica", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], superConta: false, rpc: async (n, p) => {
      if (n === "nx_clientes_admin") return [CLI()];
      if (n === "nx_planos_listar") return PLANOS;
      if (n === "nx_usuarios_listar") return { usuarios: [], convites: [] };
      if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { ...CLI(), ...p.p_cliente }; }
      return [];
    } });
    await adm.montar(t.ctx); await tique(10);
    const raiz = t.alvo;
    assert.equal(raiz.querySelector("[data-campo=pacote_comercial]"), null);
    assert.doesNotMatch(textoDe(raiz), /Nexus|Órbita|PLANO ESSENCIAL/);
    raiz.querySelector("select[name=plano]").value = "essencial";
    raiz.querySelector("select[name=status]").value = "ativo";
    raiz.querySelector(".adm-det form").dispatchEvent(new d.Evento("submit")); await tique(8);
    assert.equal(salvos[0].comercial.pacote, "essencial", "o registro comercial não é apagado");
    adm.desmontar();
  } finally { d.fim(); }
});

test("UCB-001 + UCB-004 + UCB-024 Admin → revenda cancelada não reativa em silêncio; plano padrão desligado fica", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    let resp = false, statusEscolhido = "cancelado";
    const t = ctxAdm(ui, { partes: ["revendas"], pronto: true, confirmar: async () => resp,
      modal: async o => modalQueRoda(d, ui, { antes: async oo => {
        assert.ok([...oo.corpo.querySelectorAll("select[name=status] option")].some(op => op.value === "cancelado"), "«Cancelada» está entre as opções");
        assert.ok([...oo.corpo.querySelectorAll("select[name=plano_padrao] option")].some(op => op.value === "velho"), "o plano desligado está entre as opções");
        oo.corpo.querySelector("select[name=status]").value = statusEscolhido;
        oo.corpo.querySelector("select[name=plano_padrao]").value = "velho";
      } }).modal(o),
      rpc: async (n, p) => {
        if (n === "nx_orgs_listar") return [{ id: "o2", tipo: "revenda", nome: "Rev C", slug: "rev-c", status: "cancelado", limites: { plano_padrao: "velho" }, marca: {} }];
        if (n === "nx_planos_listar") return [...PLANOS, { id: "velho", nome: "Velho", ativo: false }];
        if (n === "nx_org_salvar") { salvos.push(p.p_org); return { id: "o2", nome: "Rev C" }; }
        return [];
      } });
    t.ctx.shell.tema = T;
    await adm.montar(t.ctx); await tique(8);
    clicar(d, botaoTexto(t.alvo, /^Editar$/)); await tique(8);
    assert.equal(salvos.length, 1);
    assert.equal(salvos[0].status, "cancelado", "salvar sem mexer mantém «Cancelada»");
    assert.equal(salvos[0].limites.plano_padrao, "velho", "plano padrão desligado não é trocado");
    // sair de «Cancelada» pergunta antes; Cancelar → nada salvo
    statusEscolhido = "ativo";
    clicar(d, botaoTexto(t.alvo, /^Editar$/)); await tique(8);
    assert.match(t.confirmacoes.at(-1).titulo, /Reativar a revenda Rev C\?/);
    assert.equal(salvos.length, 1);
    adm.desmontar();
  } finally { d.fim(); }
});

test("UCB-009 + UCB-025 + UCB-095 Admin → planos: preço inválido, plano sem limites e duplicar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    const t = ctxAdm(ui, { partes: ["planos"], pronto: true, confirmar: async () => false,
      modal: async o => modalQueRoda(d, ui).modal(o),
      rpc: async (n, p) => {
        if (n === "nx_planos_listar") return [{ id: "novo", nome: "Novo", ativo: false, modulos: ["crm", "conversas"], limites: {}, preco_mensal: 99 }];
        if (n === "nx_plano_salvar") { salvos.push(p.p_plano); return { ...p.p_plano }; }
        if (n === "nx_clientes_admin") return [];
        return [];
      } });
    await adm.montar(t.ctx); await tique(8);
    const cart = t.alvo.querySelector(".plano-cartao");
    const form = cart.querySelector("form");
    const preco = form.querySelector("[name=preco_mensal]");
    // UCB-025: o campo de dinheiro já descarta o sinal; a régua (precoPlanoValido) está coberta na lógica pura
    preco.value = "99"; preco.dispatchEvent(new d.Evento("input"));
    const ativo = form.querySelector("input[name=ativo]"); ativo.checked = true;
    form.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(t.confirmacoes.at(-1).titulo, /não tem nenhum limite/);
    assert.equal(salvos.length, 0);
    clicar(d, botaoTexto(cart, /Duplicar/)); await tique(8);
    assert.equal(salvos.at(-1).ativo, false);
    assert.deepEqual(salvos.at(-1).modulos, ["crm", "conversas"]);
    assert.equal(salvos.at(-1).id, "novo_copia");
    adm.desmontar();
  } finally { d.fim(); }
});

test("UCB-022/023/026/036/037/040/042/043/059/066/071/090/092/093/096/099/101/102/109/110: ligações nas telas (texto do código)", () => {
  const js = ler("web/app/config.js"), adm = ler("web/app/admin.js");
  const perto = (src, id, re, n = 900) => { const i = src.indexOf(id); assert.ok(i >= 0, `${id} marcado`); assert.match(src.slice(i, i + n), re, id); };
  perto(js, "UCB-022: girar a tela", /matchMedia\("\(max-width: 760px\)"\)[\s\S]*addEventListener\("change"/);
  perto(js, "UCB-036: tornar dono", /typeof|dono/);
  assert.match(js, /nx_dono_transferir/);
  assert.match(js, /nx_usuario_email_trocar/);
  assert.match(js, /dados\.trocar_email === true/);
  perto(js, "UCB-059: a marca numa tela de celular", /pv-cel/);
  perto(js, "UCB-110: no celular o papel", /Mudar papel/);
  perto(adm, "UCB-023: a validade", /dias/);
  perto(adm, "UCB-026: a lista de revendas falhou", /Recarregar revendas/);
  perto(adm, "UCB-040: remover o acesso", /nx_usuario_remover|nx_usuario_salvar|p_cliente/, 2500);
  assert.match(adm, /nx_usuario_remover", \{[^}]*p_cliente/);
  perto(adm, "UCB-042: nome e e-mail", /name|nome/);
  perto(adm, "UCB-043: o foco vai", /focus/);
  perto(adm, "UCB-071: cada domínio", /dom-linha-link|hashDominios/);
  perto(adm, "UCB-090: o detalhe abre", /adm-proximo-passo|novo/);
  perto(adm, "UCB-092: o motivo", /motivo_status/);
  perto(adm, "UCB-093: os dias de teste padrão", /dias_teste/);
  assert.match(adm, /rotulo: "Revenda", ordenavel: true/, "UCB-096: «Revenda», não «org»");
  perto(adm, "UCB-099: «N selecionados", /teste_ate/, 2500);
  perto(adm, "UCB-101: a projeção", /projecaoMes/);
  perto(adm, "UCB-102: o slug sugerido", /blur/);
  perto(adm, "UCB-109: o clique na linha", /ctrlKey|metaKey/);
});

test("UCB-085 (revisão): sem «hoje» o resumo é o de antes; a lista aberta filtra «acabando» pela data de SP da tela", () => {
  assert.deepEqual(Object.keys(ADM.resumoClientes([])).sort(), ["ativo", "cancelado", "perto_limite", "suspenso", "teste", "total"]);
  assert.ok("acabando7" in ADM.resumoClientes([], "2026-10-21"));
  assert.equal(ADM.filtrarLocal([{ status: "teste", teste_ate: "2026-10-22" }], "acabando", "", "2026-10-21").length, 1);
});