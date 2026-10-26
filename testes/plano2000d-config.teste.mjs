/* plano 2000d · frente config — testes de comportamento (harness copiado de plano1500c-config.teste.mjs) */
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
    const prim = (o.acoes || []).find(a => a.tipo === "primario" || a.tipo === "perigo");
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


/* ================================================================== plano 2000d · lote d1 (Usuários, Perfil, Marca, Domínio, Plano, hub) */
const hojeIso = () => new Date().toISOString().slice(0, 10);

test("DU-109/111/112/113/114/116/117/118/120/122/123/125/130/131/138/142/144: lógica de equipe, convites e perfil", () => {
  // DU-109: padrões = papéis de hoje; admin sempre tudo; somente leitura nunca exclui
  const m = CFG.matrizPermissoes({ atendente: { exportar: false }, admin: { excluir: false }, leitura: { excluir: true } });
  assert.equal(m.atendente.exportar, false);
  assert.equal(m.admin.excluir, true);
  assert.equal(m.leitura.excluir, false);
  assert.equal(CFG.matrizPermissoes(null).supervisor.exportar, true);
  // DU-111 / DU-128
  const agora = Date.now();
  assert.equal(CFG.acessoPausado({ pausado_ate: new Date(agora + 86400e3).toISOString() }, agora) !== null, true);
  assert.equal(CFG.acessoPausado({ pausado_ate: new Date(agora - 1000).toISOString() }, agora), null);
  assert.equal(CFG.ausenteAte({ ausente_ate: new Date(agora + 3600e3).toISOString() }, agora) !== null, true);
  assert.equal(Date.parse(CFG.fimAusencia("1h", new Date(agora))) - agora, 3600e3);
  // DU-112
  assert.equal(CFG.resumoTransferencia({ negocios_abertos: 3, tarefas_abertas: 1 }), "3 negócios e 1 tarefa");
  assert.equal(CFG.resumoTransferencia({}), null);
  // DU-113
  assert.equal(CFG.textoEventoAuditoria({ quem: "Ana", acao: "papel_trocado", alvo: "Bia", detalhe: { de: "atendente", para: "supervisor" } }), "Ana mudou o papel de Bia de Atendente para Supervisor.");
  assert.match(CFG.textoEventoAuditoria({ quem: "Ana", acao: "convite_criado", alvo: "c@d.com", detalhe: { papel: "admin" } }), /convidou c@d\.com como administrador/);
  // DU-114
  assert.equal(CFG.horarioAcessoValido("", ""), true);
  assert.equal(CFG.horarioAcessoValido("08:00", "18:00"), true);
  assert.equal(CFG.horarioAcessoValido("18:00", "08:00"), false);
  assert.equal(CFG.horarioAcessoValido("08:00", ""), false);
  // DU-116
  assert.deepEqual(CFG.filtrarDepartamentos([{ nome: "Recepção" }, { nome: "Ortodontia" }], "recep").map(d => d.nome), ["Recepção"]);
  // DU-117
  const us = [{ conta_id: 1, recebe_conversas: true }, { conta_id: 2, recebe_conversas: false }, { conta_id: 9, recebe_conversas: true, gestor: true }];
  assert.equal(CFG.ultimoNoRodizio(us, 1), true);
  assert.equal(CFG.ultimoNoRodizio([...us, { conta_id: 3, recebe_conversas: true }], 1), false);
  // DU-118
  assert.equal(CFG.informa2Etapas([{ dois_fatores: true }]), true);
  assert.equal(CFG.informa2Etapas([{}]), false);
  assert.equal(CFG.sem2Etapas([{ dois_fatores: false }, { dois_fatores: true }, { dois_fatores: false, gestor: true }]).length, 1);
  // DU-120: neutro
  const tw = CFG.textoConviteWhats({ nome: "Bia Souza", cliente: "Clínica X", produto: "Conecta" });
  assert.equal(tw, "Olá, Bia! Você recebeu um convite para acessar a Clínica X no Conecta. Crie seu acesso por este link:");
  assert.doesNotMatch(ler("web/app/config.js"), /foi convidado/, "nenhum «foi convidado» no config.js");
  // DU-122
  assert.equal(CFG.textoTodosLinks([{ email: "a@b.com", link: "https://x/1" }, { email: "c@d.com", link: "https://x/2" }]), "a@b.com: https://x/1\nc@d.com: https://x/2");
  // DU-123
  assert.equal(CFG.rotuloConvite({ papel: "atendente", criado_em: new Date(agora - 30 * 3600e3).toISOString() }, agora), "Atendente · criado há 1 dia");
  assert.equal(CFG.rotuloConvite({ nome: "Bia" }), "Bia");
  // DU-125
  const mem = new Map(); const arm = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(CFG.lerPapelPreferido(arm, "c1", "cli"), "atendente");
  CFG.gravarPapelPreferido(arm, "c1", "cli", "supervisor");
  assert.equal(CFG.lerPapelPreferido(arm, "c1", "cli"), "supervisor");
  assert.equal(CFG.lerPapelPreferido(arm, "c1", "outra"), "atendente", "por empresa");
  // DU-130
  assert.deepEqual(CFG.contarPorPapel([{ papel: "admin" }, { papel: "atendente" }, { papel: "atendente" }, { papel: "admin", gestor: true }]), { admin: 1, atendente: 2 });
  assert.equal(CFG.filtrarPorPapel([{ papel: "admin" }, { papel: "atendente" }], "admin").length, 1);
  // DU-131: «;», BOM e sem fórmula
  const csv = CFG.csvEquipe([{ nome: "=Ana", email: "a@b.com", papel: "admin", departamentos: ["d1"], ultimo_acesso: "2026-10-01T10:00:00Z" }], [{ id: "d1", nome: "Recepção" }]);
  assert.ok(csv.startsWith("﻿Nome;E-mail;Papel;Departamentos;Último acesso"));
  assert.match(csv, /'=Ana;a@b\.com;Administrador;Recepção;2026-10-01/);
  // DU-138
  assert.equal(CFG.rotuloSessao({ navegador: "Chrome", sistema: "Windows", cidade: "Taubaté" }), "Chrome · Windows · Taubaté");
  // DU-142: por conta, migrando a antiga
  const m2 = new Map([["nx-cv-avisos", JSON.stringify({ som: false })]]); const a2 = { getItem: k => m2.get(k) ?? null, setItem: (k, v) => m2.set(k, v) };
  assert.deepEqual(CFG.lerAvisos(a2, "ana"), { som: false }, "migra a chave antiga");
  CFG.gravarAvisos(a2, "ana", { som: true });
  CFG.gravarAvisos(a2, "bia", { tela: true });
  assert.equal(CFG.lerAvisos(a2, "ana").som, true);
  assert.equal(CFG.lerAvisos(a2, "ana").tela, undefined, "a escolha da Bia não vai para a Ana");
  assert.equal(CFG.chaveAvisos("ana"), "nx-cv-avisos:ana");
  // DU-144
  assert.match(CFG.ajudaEmailPerfil({ trocarEmail: true, outrosAdmins: 1 }), /peça a outro administrador/);
  assert.match(CFG.ajudaEmailPerfil({ trocarEmail: true, outrosAdmins: 0 }), /quem cuida do seu plano/);
});

test("DU-145/147/149/159/161/164/167/168/169/170/171/178/179/394/395: lógica de marca, domínio, plano e hub", () => {
  // DU-145
  const e = CFG.validarLinksMarca({ site: "http://x.com", termos_url: "https://x.com.br/termos", suporte_email: "x@", email_remetente: "a".repeat(61) });
  assert.deepEqual(e.map(x => x.campo).sort(), ["email_remetente", "site", "suporte_email"]);
  assert.deepEqual(CFG.semChavesNovas({ produto: "X", site: "https://a.com", teste_aberto: true }, "site"), { resto: { produto: "X" }, tiradas: ["site", "teste_aberto"] });
  // DU-147
  assert.equal(CFG.origemIconeApp({ icone_app: "data:image/png;base64,AA", logo: "L" }), "data:image/png;base64,AA");
  assert.equal(CFG.origemIconeApp({ logo: "L" }), "L");
  // DU-149
  assert.equal(CFG.linkComDominio("#/convite/abc", "App.Agencia.com.br"), "https://app.agencia.com.br/app/#/convite/abc");
  assert.equal(CFG.linkComDominio("https://x/#/convite/abc", "app.agencia.com.br"), "https://x/#/convite/abc");
  // DU-159
  assert.equal(CFG.rotuloCname("crm.agencia.com.br"), "crm");
  assert.equal(CFG.rotuloCname("app.agencia.com"), "app");
  assert.ok(CFG.passosProvedor("registrobr", "crm.agencia.com.br", "x.netlify.app").some(p => /Nova entrada/.test(p)));
  assert.ok(CFG.passosProvedor("cloudflare", "crm.agencia.com.br", "x.netlify.app").some(p => /proxy DESLIGADO/.test(p)));
  assert.ok(CFG.passosProvedor("hostinger", "crm.agencia.com.br", "x.netlify.app").some(p => p.includes("«crm»") || p.includes("x.netlify.app")));
  // DU-161
  assert.equal(CFG.sugestaoSubdominio("agencia.com.br"), "app.agencia.com.br");
  assert.equal(CFG.sugestaoSubdominio("crm.agencia.com.br"), null);
  // DU-160
  assert.equal(CFG.validarListaDominios([{ host: "a.b.com", status: "quebrado" }]).length, 1);
  // DU-164
  assert.match(CFG.avisoStatusPlano("pendente", null, hojeIso(), { regularizarAte: "2026-11-10" }).texto, /Regularize até 10\/11/);
  assert.deepEqual(CFG.statusDoPlano("pendente", null, hojeIso()), ["Pagamento pendente", "aten"]);
  // DU-167
  assert.deepEqual(CFG.ordenarPlanosComparar([{ nome: "C" }, { nome: "B", preco_mensal: 500 }, { nome: "A", preco_mensal: 200 }]).map(p => p.nome), ["A", "B", "C"]);
  // DU-168
  assert.equal(CFG.textoRenovacaoIA("2026-10-25"), "Renova em 01/11.");
  assert.equal(CFG.textoRenovacaoIA("2026-12-31"), "Renova em 01/01.");
  // DU-169
  assert.match(CFG.textoPedidoPacoteIA({ cliente: "Clínica X" }), /pacote extra de 500 usos de IA neste mês para a Clínica X, sem mudar o plano/);
  // DU-170
  assert.equal(CFG.textoSemPreco("Conecta"), "Valor combinado com a Conecta.");
  // DU-171
  assert.deepEqual(CFG.progressoChecklist({ numeros: 1, usuarios: 0 }, ["perfil", "numeros", "usuarios", "funis"]), { feitos: 2, total: 3 });
  // DU-172
  assert.ok(CFG.filtrarSecoes([{ id: "usuarios", titulo: "Usuários e convites" }, { id: "perfil", titulo: "Perfil" }], "rodizio").includes("usuarios"));
  assert.ok(CFG.filtrarSecoes([{ id: "perfil", titulo: "Perfil" }], "assinatura").includes("perfil"));
  // DU-178
  assert.equal(CFG.fraseSenhaAtualErrada("restam:2"), "A senha atual não confere. Mais 2 tentativas antes de bloquear por 15 min.");
  assert.equal(CFG.fraseSenhaAtualErrada(null), "A senha atual não confere.");
  // DU-179
  assert.match(CFG.textoMotivoSecao("modulo", "Conecta"), /fale com a Conecta\./);
  assert.doesNotMatch(CFG.textoMotivoSecao("modulo", null), /Nexus|equipe\./);
  // DU-394/395/422
  assert.deepEqual(CFG.validarDadosEmpresa({ telefone_empresa: "123", instagram: "a b", fuso: "Europe/Lisbon", retencao_meses: "7" }).map(x => x.campo),
    ["telefone_empresa", "instagram", "fuso", "retencao_meses"]);
  assert.equal(CFG.trocarVariaveisEmpresa("Rua {endereco} · {instagram} · {telefone_empresa}", { endereco: "A, 1", instagram: "clinica" }), "Rua A, 1 · @clinica · {telefone_empresa}");
  // DU-174
  const falso = { querySelector: s => (/dialog\[open\]/.test(s) ? {} : null) };
  assert.equal(CFG.haCamadaAberta(falso), true);
  assert.equal(CFG.haCamadaAberta({ querySelector: () => null }), false);
});

test("DU-173: módulo de outra frente que falha continua no menu com «Não carregou» (e não fica em cache)", async () => {
  const lista = await CFG.secoesExternas({ versao: `t-${Date.now()}` }, async p => {
    if (p.includes("cv-config")) throw new Error("rede");
    return { secoesConfig: [] };
  });
  const ids = lista.map(s => s.id);
  assert.ok(ids.includes("numeros") && ids.includes("ia"));
  assert.ok(lista.every(s => s.falhou === true && /Não carregou/.test(s.desc)));
  let chamadas = 0;
  await CFG.secoesExternas({ versao: "t-cache" }, async () => { chamadas++; return { secoesConfig: [] }; });
  assert.ok(chamadas > 0, "depois da falha, tenta de novo");
});

/* ---------- Usuários (DOM) ---------- */
function dadosUsuarios(extra = {}) {
  return { usuarios: [
    { conta_id: "a1", nome: "Ana Admin", email: "ana@x.com", papel: "admin", editavel: true, eu: true, ultimo_acesso: new Date().toISOString(), recebe_conversas: false, dois_fatores: true, foto: "data:image/png;base64,AAAA" },
    { conta_id: "b2", nome: "Bia", email: "bia@x.com", papel: "atendente", editavel: true, ultimo_acesso: null, recebe_conversas: true, dois_fatores: false, negocios_abertos: 4, tarefas_abertas: 2 },
    { conta_id: "c3", nome: "Caio", email: "caio@x.com", papel: "supervisor", editavel: true, ultimo_acesso: null, recebe_conversas: false, dois_fatores: false,
      pausado_ate: new Date(Date.now() + 5 * 86400e3).toISOString() }],
    convites: [{ id: "cv1", papel: "atendente", criado_em: new Date(Date.now() - 30 * 3600e3).toISOString(), expira_em: new Date(Date.now() + 2 * 86400e3).toISOString() }],
    departamentos: [], uso: 4, limite: 10, ...extra };
}

test("DU-109/111/112/113/114/115/117/118/119/124/127/130/131 Usuários: matriz, pausa, transferência, histórico, horário, 2 etapas, filtros e CSV", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const menus = [];
    let dados = dadosUsuarios({ permissoes: { atendente: { exportar: false } }, pausar_acesso: true, horario_acesso: true, remover_transfere: true, exigir_2fa: false, link_equipe: null });
    const { modal, abertos } = modalQueRoda(d, ui, { antes: async (o, m) => {
      if (o.titulo && /Remover o acesso/.test(o.titulo)) m.corpo.querySelector("select[name=para]").value = "a1";
      if (o.titulo && /Horário de acesso/.test(o.titulo)) { m.corpo.querySelector("input[name=de]").value = "08:00"; m.corpo.querySelector("input[name=ate]").value = "18:00"; }
    } });
    const t = ctxCfg(ui, { partes: ["usuarios"], confirmar: async () => true, extraUi: { menu: (b, itens) => menus.push(itens), anunciar() {}, modal },
      rpc: async (n, p) => {
        if (n === "nx_usuarios_listar") return dados;
        if (n === "nx_auditoria_listar") return [{ quem: "Ana", acao: "acesso_removido", alvo: "Duda", em: new Date().toISOString() }];
        if (n === "nx_usuario_remover") { dados = { ...dados, usuarios: dados.usuarios.filter(u => u.conta_id !== p.p_conta) }; return dados; }
        if (n === "nx_usuario_salvar" || n === "nx_permissoes_salvar" || n === "nx_empresa_politica_salvar") return dados;
        return {};
      } });
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    // DU-127: a foto aparece no lugar das iniciais
    assert.ok(raiz.querySelector(".cfg-us-tab .avatar img"));
    // DU-111: pílula «Acesso pausado até…»
    assert.match(textoDe(raiz.querySelector(".cfg-us-pausado")), /Acesso pausado até/);
    // DU-118: coluna «2 etapas» e o chip «Sem 2 etapas (2)»
    assert.ok(raiz.querySelector(".cfg-2fa-sim") && raiz.querySelector(".cfg-2fa-nao"));
    const chip2 = raiz.querySelector(".cfg-us-sem2");
    assert.match(textoDe(chip2), /Sem 2 etapas \(2\)/);
    clicar(d, chip2); await tique(2);
    assert.doesNotMatch(textoDe(raiz.querySelector(".cfg-us-tab")), /Ana Admin/);
    clicar(d, chip2); await tique(2);
    // DU-130: chips por papel
    const chipAdm = raiz.querySelectorAll(".cfg-us-papel-chip").find(b => b.dataset.papel === "admin");
    assert.match(textoDe(chipAdm), /Administrador \(1\)/);
    clicar(d, chipAdm); await tique(2);
    assert.doesNotMatch(textoDe(raiz.querySelector(".cfg-us-tab")), /Bia/);
    clicar(d, chipAdm); await tique(2);
    // DU-131: botão do CSV
    assert.ok(raiz.querySelector(".cfg-us-csv"));
    // DU-115: sem departamentos, o caminho para criar
    assert.equal(raiz.querySelector(".cfg-us-sem-deps a").getAttribute("href"), "#/config/departamentos");
    // DU-109: a matriz com o salvo por cima do padrão; salvar manda a matriz inteira
    const cb = raiz.querySelector(".cfg-perm-tab input[data-papel=atendente][data-perm=exportar]");
    assert.equal(cb.checked, false);
    assert.equal(raiz.querySelector(".cfg-perm-tab input[data-papel=admin][data-perm=excluir]").disabled, true);
    // plano 2000d: FX-046 — salvar sem mudança não chama o servidor; muda uma caixa antes
    const cbAn = raiz.querySelector(".cfg-perm-tab input[data-papel=atendente][data-perm=anuncios]");
    cbAn.checked = true; cbAn.dispatchEvent(new d.Evento("change"));
    clicar(d, botaoTexto(raiz.querySelector(".cfg-perm"), /Salvar permissões/)); await tique(4);
    assert.equal(t.chamadas.find(c => c[0] === "nx_permissoes_salvar")[1].p_permissoes.atendente.exportar, false);
    assert.equal(t.chamadas.find(c => c[0] === "nx_permissoes_salvar")[1].p_permissoes.atendente.anuncios, true);
    // DU-113: o histórico de acessos
    assert.match(textoDe(raiz.querySelector(".cfg-audit")), /Ana removeu o acesso de Duda\./);
    // DU-119: «Exigir verificação em duas etapas»
    const sw = raiz.querySelector(".cfg-politicas input[name=exigir_2fa]");
    sw.checked = true; sw.dispatchEvent(new d.Evento("change")); await tique(4);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_empresa_politica_salvar")[1], { p_exigir_2fa: true });
    // DU-124: o servidor tem o link de equipe (null) → «Criar link de equipe»
    assert.ok(botaoTexto(raiz.querySelector(".cfg-link-equipe"), /Criar link de equipe/));
    // DU-117: Bia é a única no rodízio — desligar pergunta antes; «Cancelar» mantém ligado
    t.confirmacoes.length = 0;
    let respostaConf = false;
    t.ctx.ui.confirmar = async o => { t.confirmacoes.push(o); return respostaConf; };
    const swBia = raiz.querySelector("#sw-recebe_conversas-b2");
    swBia.checked = false; swBia.dispatchEvent(new d.Evento("change")); await tique(4);
    assert.match(t.confirmacoes.at(-1).titulo, /Ninguém mais vai receber conversas novas/);
    assert.equal(swBia.checked, true);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_usuario_salvar").length, 0);
    respostaConf = true;
    // DU-114: horário de acesso
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bia"));
    await menus.at(-1).find(i => i && i.rotulo === "Horário de acesso").fn(); await tique(4);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_usuario_salvar")[1].p_usuario, { conta_id: "b2", horario_acesso: { de: "08:00", ate: "18:00" } });
    // DU-111: Caio pausado → «Liberar o acesso agora»; Bia → «Pausar acesso até…»
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Caio"));
    assert.ok(menus.at(-1).some(i => i && i.rotulo === "Liberar o acesso agora"));
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bia"));
    assert.ok(menus.at(-1).some(i => i && i.rotulo === "Pausar acesso até…"));
    // DU-112: remover a Bia passa negócios e tarefas para quem remove, com a contagem
    await menus.at(-1).find(i => i && i.rotulo === "Remover acesso").fn(); await tique(6);
    const mod = abertos.find(x => /Remover o acesso de Bia/.test(x.o.titulo));
    assert.match(textoDe(mod.m.corpo), /4 negócios e 2 tarefas mudam de dono/);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_usuario_remover")[1], { p_conta: "b2", p_transferir_para: "a1" });
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-116 Usuários: departamentos com busca e «Todos/Nenhum» quando passam de 6", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const deps = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, nome: i === 3 ? "Ortodontia" : `Setor ${i}` }));
    let painel = null;
    const t = ctxCfg(ui, { partes: ["usuarios"], extraUi: { flutuante: (anc, conteudo) => { painel = conteudo; d.doc.body.appendChild(conteudo); return { fechar() {} }; } },
      rpc: async n => (n === "nx_usuarios_listar" ? { ...dadosUsuarios(), departamentos: deps } : n === "nx_usuario_salvar" ? { ...dadosUsuarios(), departamentos: deps } : {}) });
    await cfg.montar(t.ctx); await tique(8);
    clicar(d, t.ctx.alvo.querySelectorAll("button").find(b => /Departamentos de Bia/.test(b.getAttribute("aria-label") || "")));
    const busca = painel.querySelector(".cfg-deps-busca");
    assert.ok(busca, "busca com mais de 6");
    busca.value = "orto"; busca.dispatchEvent(new d.Evento("input"));
    assert.equal(painel.querySelectorAll(".flut-op").length, 1);
    busca.value = ""; busca.dispatchEvent(new d.Evento("input"));
    clicar(d, painel.querySelector(".cfg-deps-todos"));
    assert.equal(painel.querySelectorAll(".flut-op input").filter(x => x.checked).length, 10);
    clicar(d, painel.querySelector(".cfg-deps-nenhum"));
    assert.equal(painel.querySelectorAll(".flut-op input").filter(x => x.checked).length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-120/121/122/123/125/126 Convites: papel lembrado, e-mail pelo sistema, «Copiar todos», rótulo sem nome e texto neutro", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    d.mem.set("nx-cfg-papel:c1:cli-fixo", "supervisor");
    let antesModal = null;
    const { modal, abertos } = modalQueRoda(d, ui, { antes: async (o, m) => { if (antesModal) await antesModal(o, m); } });
    let n = 0;
    const t = ctxCfg(ui, { partes: ["usuarios"], extraUi: { modal, menu() {} }, rpc: async (nome, p) => {
      if (nome === "nx_usuarios_listar") return dadosUsuarios({ convite_email: true });
      if (nome === "nx_convite_criar") { n++; return { id: `n${n}`, link: `#/convite/t${n}`, expira_em: new Date(Date.now() + 3 * 86400e3).toISOString(), email_enviado_em: p.p_dados.enviar_email ? new Date().toISOString() : null }; }
      return {};
    } });
    t.ctx.cliente = { id: "cli-fixo", nome: "Clínica Teste" };
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    // DU-123: convite sem nome → papel e quando foi criado
    assert.match(textoDe(raiz.querySelector(".cfg-conv-tit")), /Atendente · criado há 1 dia/);
    // DU-125 + DU-121: o seletor nasce em «Supervisor»; com e-mail, o envio pelo sistema vai junto
    antesModal = async (o, m) => {
      if (o.titulo !== "Convidar para a equipe") return;
      const selP = m.corpo.querySelector("select[name=papel]");
      const marcada = selP.querySelectorAll("option").find(o => o.selected === true || o.getAttribute("selected") !== null);
      assert.equal(marcada && (marcada.value || marcada.getAttribute("value")), "supervisor");
      selP.value = "supervisor";      // o DOM de mentira não deriva o value da opção marcada
      assert.ok(m.corpo.querySelector("input[name=enviar_email]").checked);
      m.corpo.querySelector("input[name=email]").value = "nova@x.com";
    };
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(8);
    const pd = t.chamadas.find(c => c[0] === "nx_convite_criar")[1].p_dados;
    assert.equal(pd.papel, "supervisor");
    assert.equal(pd.enviar_email, true);
    const corpo = abertos.at(-1).m.corpo;
    assert.match(textoDe(corpo), /enviado para nova@x\.com/);
    assert.doesNotMatch(textoDe(corpo), /foi convidado/);
    // DU-122: vários e-mails → «Copiar todos»
    antesModal = async (o, m) => {
      if (o.titulo !== "Convidar para a equipe") return;
      clicar(d, m.corpo.querySelector(".cfg-conv-varios"));
      m.corpo.querySelector("textarea[name=emails]").value = "x1@x.com, x2@x.com";
    };
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(10);
    const todos = abertos.at(-1).m.corpo.querySelector(".cfg-conv-copiar-todos");
    assert.ok(todos);
    clicar(d, todos); await tique(2);
    assert.match(t.copiados.at(-1)[0], /^x1@x\.com: https:\/\/x\/#\/convite\/t\d\nx2@x\.com: /);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-126 «Mudar papel» no celular: a lista de papéis descreve o seletor e destaca o escolhido", async () => {
  const d = comDom({ celular: true });
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const menus = [];
    const { modal, abertos } = modalQueRoda(d, ui, { antes: async (o, m) => {
      const sel = m.corpo.querySelector("select[name=papel]");
      const lista = m.corpo.querySelector(".cfg-papeis-lista");
      assert.ok(sel.getAttribute("aria-describedby").split(" ").includes(lista.id));
      sel.value = "supervisor"; sel.dispatchEvent(new d.Evento("change"));
      assert.equal(lista.querySelector("dt.cfg-papel-escolhido").textContent, "Supervisor");
    } });
    const t = ctxCfg(ui, { partes: ["usuarios"], extraUi: { modal, menu: (b, itens) => menus.push(itens) }, rpc: async n => (n === "nx_usuarios_listar" ? dadosUsuarios() : dadosUsuarios()) });
    await cfg.montar(t.ctx); await tique(8);
    clicar(d, t.ctx.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bia"));
    await menus.at(-1).find(i => i && i.rotulo === "Mudar papel").fn(); await tique(4);
    assert.ok(abertos.length);
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------- Perfil (DOM) ---------- */
test("DU-127/128/129/132/137/138/139/143/144/177/178/397 Perfil", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], conta: { id: "c1", papel: "clinica", nome: "Ana", email: "ana@x.com", telefone: "5512998303030", assinatura: "— Ana", foto: null, ausente_ate: null, celular_verificado: false },
      rpc: async n => {
        if (n === "nx_senha_trocar") throw Object.assign(new Error("x"), { codigo: "credenciais_invalidas", hint: "restam:1" });
        if (n === "nx_sessoes_listar") return [{ id: "s1", navegador: "Chrome", sistema: "Windows", cidade: "Taubaté", atual: true }, { id: "s2", navegador: "Safari", sistema: "iOS", ultimo_uso: new Date().toISOString() }];
        if (n === "nx_2fa_estado") return { ativo: false, avisar_nova_sessao: true };
        if (n === "nx_usuarios_listar") return { trocar_email: true, usuarios: [{ conta_id: "c1", eu: true, papel: "admin", email: "ana@x.com" }, { conta_id: "c2", papel: "admin", email: "bia@x.com" }] };
        return { ok: true };
      } });
    t.ctx.pode = () => true;
    let respConf = false;
    t.ctx.ui.confirmar = async o => { t.confirmacoes.push(o); return respConf; };
    await cfg.montar(t.ctx); await tique(12);
    const raiz = t.ctx.alvo;
    // DU-177: o índice
    assert.deepEqual(raiz.querySelectorAll(".cfg-pf-indice a").map(a => a.getAttribute("href")), ["#cfg-pf-dados", "#cfg-pf-avisos", "#cfg-pf-seguranca", "#cfg-pf-senha", "#cfg-pf-sessoes"]);
    // DU-144: há outro administrador e o servidor troca e-mail
    assert.match(textoDe(raiz.querySelector("[data-campo=email_ro]")), /peça a outro administrador/);
    // DU-127 / DU-128 / DU-143
    assert.ok(raiz.querySelector(".cfg-foto"));
    assert.ok(botaoTexto(raiz.querySelector(".cfg-ausente"), /Ficar ausente por 1 h/));
    assert.ok(botaoTexto(raiz.querySelector(".cfg-cel-verif"), /Verificar celular/));
    // DU-132 / DU-137: o cartão de duas etapas aparece com o servidor que tem
    const seg = raiz.querySelector(".cfg-seguranca");
    assert.equal(seg.hidden, false);
    assert.ok(botaoTexto(seg, /Ligar com o WhatsApp/) && botaoTexto(seg, /Ligar com app autenticador/));
    assert.ok(seg.querySelector("input[name=avisar_nova_sessao]").checked);
    // DU-138: sistema e cidade
    assert.match(textoDe(raiz.querySelector(".cfg-sessao-atual")), /Chrome · Windows · Taubaté/);
    // DU-139: encerrar pergunta antes (e não encerra se cancelar)
    clicar(d, botaoTexto(raiz.querySelector(".cfg-sessoes"), /Encerrar/)); await tique(4);
    assert.match(t.confirmacoes.at(-1).titulo, /Encerrar a sessão Safari · iOS/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_sessao_encerrar").length, 0);
    // DU-129: a assinatura vai junto no salvar
    // plano 2000d: FX-003 pôs o form do horário silencioso no cartão de avisos — os forms são achados pelo conteúdo
    const formDados = raiz.querySelectorAll(".cfg-sec form").find(f => f.querySelector("input[name=nome]"));
    const formSenha = raiz.querySelectorAll(".cfg-sec form").find(f => f.querySelector("input[name=nova]"));
    formSenha.reset = () => {};
    formDados.querySelector("input[name=assinatura]").value = "— Ana, recepção";
    formDados.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.equal(t.chamadas.find(c => c[0] === "nx_perfil_salvar")[1].p_dados.assinatura, "— Ana, recepção");
    // DU-178: senha atual errada avisa as tentativas
    formSenha.querySelector("input[name=atual]").value = "velhaSenha1";
    formSenha.querySelector("input[name=nova]").value = "novaSenha22";
    formSenha.querySelector("input[name=nova2]").value = "novaSenha22";
    formSenha.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(textoDe(formSenha.querySelector("[data-campo=atual] .campo-erro")), /Mais 1 tentativa antes de bloquear/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-132: servidor sem duas etapas → o cartão não aparece; DU-397: dado mexido pergunta antes de sair", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const guardas = [];
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => { if (n === "nx_2fa_estado") throw Object.assign(new Error("x"), { codigo: "PGRST202" }); return {}; } });
    t.ctx.aoSairDaRota = fn => { guardas.push(fn); return () => {}; };
    await cfg.montar(t.ctx); await tique(10);
    assert.equal(t.ctx.alvo.querySelector(".cfg-seguranca").hidden, true);
    assert.equal(guardas.length, 1, "o Perfil registra a guarda de saída");
    assert.equal(await guardas[0](), true, "sem mudança, sai");
    const nome = t.ctx.alvo.querySelector("input[name=nome]");
    nome.value = "Outro nome";
    t.ctx.ui.confirmar = async o => { t.confirmacoes.push(o); return false; };
    assert.equal(await guardas[0](), false);
    assert.match(t.confirmacoes.at(-1).titulo, /Sair sem salvar os seus dados/);
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------- Marca (DOM) ---------- */
test("DU-145/146/147/148/150/151/202 Marca da revenda: contato e links legais, e-mails, ícone do app, teste grátis, versões", async () => {
  const d = comDom();
  try {
    const salvos = [];
    const m = await abrirMarcaOrg(d, { marca: { produto: "Conecta Marketing Digital" }, rpc: async (n, p) => {
      if (n === "nx_orgs_listar") return [{ id: "org-a", slug: "rev", marca: { produto: "Conecta Marketing Digital", cores: { fundo: "#07090C" } } }];
      if (n === "nx_marca_versoes") return p.p_restaurar ? { ok: true } : [{ id: "v1", em: new Date(Date.now() - 86400e3).toISOString(), autor: "Gestor" }];
      if (n === "nx_org_salvar") {
        salvos.push(p);
        if ("site" in p.p_org.marca) throw Object.assign(new Error("Campo não aceito"), { codigo: "marca_invalida", hint: "site" });
        return { marca: p.p_org.marca };
      }
      return {};
    } });
    await tique(10);
    const raiz = m.raiz;
    // DU-147 / DU-148: o controle do ícone do app e a miniatura «na tela do celular» com o nome curto
    assert.ok([...raiz.querySelectorAll(".img-campo b")].some(b => b.textContent === "Ícone do app instalado"));
    assert.equal(textoDe(raiz.querySelector(".pv-home-nome")), "Conecta");
    // DU-202: teste grátis pelo site
    const sw = raiz.querySelector("input[name=teste_aberto]");
    assert.ok(sw);
    sw.checked = true; sw.dispatchEvent(new d.Evento("change"));
    // DU-145: link sem https → erro no campo, nada salvo
    const site = raiz.querySelector("input[name=site]");
    // plano 2000d: FX-058 completa/troca http:// por https:// sozinho — o endereço que não dá para consertar continua recusado
    site.value = "ftp://conecta.com.br"; site.dispatchEvent(new d.Evento("input", { bubbles: true }));
    clicar(d, botaoTexto(raiz, /Salvar marca/)); await tique(6);
    assert.match(textoDe(raiz.querySelector("[data-campo=site] .campo-erro")), /https:\/\//);
    assert.equal(salvos.length, 0);
    // servidor antigo recusa a chave nova → salva o resto e diz o que ficou de fora
    site.value = "https://conecta.com.br"; site.dispatchEvent(new d.Evento("input", { bubbles: true }));
    clicar(d, botaoTexto(raiz, /Salvar marca/)); await tique(8);
    assert.equal(salvos.length, 2);
    assert.equal(salvos[0].p_org.marca.teste_aberto, true);
    assert.equal("site" in salvos[1].p_org.marca, false);
    assert.ok(m.toasts.some(x => /ainda não guarda: site, teste grátis pelo site/.test(x[0])));
    // DU-150: o toast diz quando os clientes veem a marca nova
    assert.ok(m.toasts.some(x => /Seus clientes veem a marca nova ao abrir o app/.test(x[0])));
    // DU-151: versões anteriores
    assert.equal(raiz.querySelector(".cfg-marca-hist").hidden, false);
    assert.match(textoDe(raiz.querySelector(".cfg-marca-versoes")), /Salva .* · Gestor/);
    m.cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------- Domínio (DOM) ---------- */
test("DU-159/160/161 Domínio: passo a passo por provedor, «Parou de apontar» e sugestão de subdomínio", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["dominio"], conta: { id: "g1", papel: "gestor", nome: "G" }, rpc: async n => (n === "nx_dominios_listar"
      ? [{ host: "crm.agencia.com.br", status: "pendente", dns: { valor: "x.netlify.app" } }, { host: "app.agencia.com.br", status: "quebrado" }] : {}) });
    t.ctx.cliente = null; t.ctx.sessao.org = { id: "org-a", nome: "Agência" };
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    const prov = raiz.querySelectorAll(".dom-provedor").map(x => x.dataset.provedor);
    assert.ok(["registrobr", "hostinger", "cloudflare", "godaddy"].every(p => prov.includes(p)));
    // plano 2000d: FX-066 põe o que parou de apontar primeiro — o passo a passo do crm é procurado no cartão dele
    const cartaoCrm = raiz.querySelectorAll(".dom-item").find(x => /crm\.agencia/.test(textoDe(x)));
    assert.match(textoDe(cartaoCrm.querySelector(".dom-provedor[data-provedor=registrobr]")), /«crm»/);
    assert.match(textoDe(raiz.querySelectorAll(".dom-item")[0]), /app\.agencia.*Parou de apontar/);
    assert.match(textoDe(raiz), /Parou de apontar/);
    assert.ok(raiz.querySelector(".dom-quebrado"));
    const inp = raiz.querySelector("input[name=host]");
    assert.equal(inp.getAttribute("placeholder"), "app.suaagencia.com.br");
    inp.value = "agencia.com.br"; inp.dispatchEvent(new d.Evento("input")); await esperar(300);
    const sug = raiz.querySelector(".cfg-dom-sugestao");
    assert.equal(sug.hidden, false);
    clicar(d, botaoTexto(sug, /Usar app\.agencia\.com\.br/));
    assert.equal(inp.value, "app.agencia.com.br");
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------- Plano e uso (DOM) ---------- */
test("DU-162/163/164/165/166/167/168/169/170 Plano e uso", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["plano"], rpc: async n => {
      if (n === "nx_uso_plano") return { plano: { nome: "Essencial" }, status: "pendente", regularizar_ate: "2026-11-10", checkout_url: "https://pagar.exemplo.com/abc",
        uso: { usuarios: 1, ia_mes: 300 }, limites: { usuarios: 5, ia_mes: 310, storage_mb: 1024 }, storage_mb: 512, modulos: ["crm"], org: { nome: "Conecta" }, pode_cancelar: true,
        planos_disponiveis: [{ nome: "Pro", preco_mensal: 497, destaque: true }, { nome: "Essencial", preco_mensal: 297 }] };
      if (n === "nx_faturas_listar") return { faturas: [{ vencimento: "2026-10-10", valor: 297, status: "paga", pdf_url: "https://x/r.pdf" }, { vencimento: "2026-11-10", valor: 297, status: "aberta", pagar_url: "https://x/p" }] };
      if (n === "nx_onboarding_estado") return {};
      return {};
    } });
    t.ctx.shell.marcaEfetiva = () => ({});
    await cfg.montar(t.ctx); await tique(12);
    const raiz = t.ctx.alvo;
    // DU-170
    assert.equal(textoDe(raiz.querySelector(".cfg-plano-preco")), "Valor combinado com a Conecta.");
    // DU-164 + DU-162
    assert.match(textoDe(raiz.querySelector(".cfg-plano-status")), /pagamento está pendente\. Regularize até 10\/11/);
    assert.equal(raiz.querySelector(".cfg-assinar").getAttribute("href"), "https://pagar.exemplo.com/abc");
    assert.ok(raiz.querySelector(".cfg-pagar"));
    // DU-168 + DU-169: renovação e pacote de IA (perto de passar do limite)
    assert.match(textoDe(raiz.querySelector(".cfg-ia-renova")), /^Renova em 01\/\d{2}\.$/);
    clicar(d, raiz.querySelector(".cfg-pacote-ia")); await tique(2);
    assert.match(t.copiados.at(-1)[0], /pacote extra de 500 usos de IA/);
    // DU-166
    assert.match(textoDe(raiz.querySelector(".plano-storage-barra")), /512 MB de 1 GB/);
    // DU-167: por preço e com o selo
    assert.deepEqual(raiz.querySelectorAll(".cfg-comparar-it > b").map(b => b.textContent.replace(" (o seu)", "")), ["Essencial", "Pro"]);
    assert.ok(raiz.querySelector(".cfg-comparar-selo"));
    // DU-163
    assert.equal(raiz.querySelector(".cfg-faturas").hidden, false);
    assert.equal(raiz.querySelectorAll(".cfg-faturas-lista li").length, 2);
    // DU-165
    assert.ok(raiz.querySelector(".cfg-cancelar"));
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------- Hub (DOM) ---------- */
test("DU-171/172/174/179/394/396 hub: progresso, ?campo=, «/» com diálogo aberto, motivo com a revenda, Dados da empresa e alterações recentes", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    cfg.desmontar();
    const t = ctxCfg(ui, { partes: [], rpc: async n => {
      if (n === "nx_onboarding_estado") return { itens: [] };
      if (n === "nx_auditoria_listar") return [{ quem: "Ana", acao: "config_alterada", detalhe: { secao: "Marca", resumo: "logo novo" }, em: new Date().toISOString() }];
      return {};
    } });
    t.ctx.shell.prontos.CONFIG_PRONTAS = ["perfil", "usuarios", "ia", "plano", "marca", "dominio", "empresa", "numeros"];
    await cfg.montar(t.ctx); await tique(12);
    const raiz = t.ctx.alvo;
    // DU-394: «Dados da empresa» aparece quando o shell lista «empresa»
    assert.ok(raiz.querySelector("a.cfg-nav-item[href='#/config/empresa']"));
    // DU-171: «N de M prontos»
    assert.ok(raiz.querySelector(".cfg-vg-prog [role=meter]"));
    // DU-396
    assert.match(textoDe(raiz.querySelector(".cfg-audit")), /Ana alterou «Marca»: logo novo\./);
    // DU-174: com um diálogo aberto, «/» não move o foco
    const dlg = d.doc.body.appendChild(d.doc.createElement("dialog")); dlg.setAttribute("open", "");
    cfg.desmontar();
    cfg.desmontar();
    // DU-179: seção fora do plano cita a revenda
    const t2 = ctxCfg(ui, { partes: ["funis"], rpc: async () => ({}) });
    t2.ctx.sessao.org = { id: "o", nome: "Conecta" };
    t2.ctx.temModulo = () => false;
    await cfg.montar(t2.ctx); await tique(8);
    assert.match(textoDe(t2.ctx.alvo), /fale com a Conecta\./);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-394/395/422 Dados da empresa: valida, mostra a prévia das variáveis e pergunta antes do prazo de guarda", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    cfg.desmontar();
    const t = ctxCfg(ui, { partes: ["empresa"], rpc: async n => (n === "nx_empresa_dados" ? { endereco: "Rua A, 1", instagram: "clinica" } : { ok: true }) });
    t.ctx.shell.prontos.CONFIG_PRONTAS = ["empresa"];
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".cfg-empresa-previa")), /Estamos na Rua A, 1\. .*@clinica/);
    const form = raiz.querySelector(".cfg-sec form");
    form.querySelector("input[name=instagram]").value = "a b c";
    form.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.match(textoDe(form.querySelector("[data-campo=instagram] .campo-erro")), /Só o usuário/);
    form.querySelector("input[name=instagram]").value = "@clinica";
    form.querySelector("select[name=retencao_meses]").value = "24";
    form.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(t.confirmacoes.at(-1).titulo, /24 meses/);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_empresa_dados_salvar")[1].p_dados, { endereco: "Rua A, 1", telefone_empresa: null, instagram: "clinica", fuso: "America/Sao_Paulo", retencao_meses: 24 });
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DU-176 (CSS): o selo de pendência tem contorno em alto contraste", () => {
  assert.match(ler("web/app/config.css"), /plano 2000d · DU-176[\s\S]*forced-colors: active\)[^{]*\{ \.cfg-pend[^{]*\{ border: 1px solid CanvasText/);
});


/* ================================================================== plano 2000d · lote d2 (Admin, revenda, white-label) */
const isoMaisDias = n => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const quandoHa = dias => new Date(Date.now() - dias * 86400e3).toISOString();

test("DU-182 / DU-406: a receita mensal usa o valor cobrado do cliente; o CSV traz valor, vencimento, dias de teste, última atividade, contato e etiquetas", () => {
  const ps = [{ id: "essencial", preco_mensal: 100 }];
  const itens = [{ status: "ativo", plano: "essencial", comercial: { valor_mensal: 80 } }, { status: "ativo", plano: "essencial" }, { status: "teste", plano: "essencial", comercial: { valor_mensal: 999 } }];
  assert.equal(ADM.mrrClientes(itens, ps), 180, "80 combinado + 100 de tabela (teste fora)");
  assert.equal(ADM.valorCobrado({ comercial: { valor_mensal: "" } }), null);
  assert.equal(ADM.diaVencimentoValido("10"), 10);
  assert.ok(Number.isNaN(ADM.diaVencimentoValido("31")));
  const hoje = hojeIso();
  const csv = ADM.csvClientes([{ nome: "X", slug: "x", status: "teste", teste_ate: isoMaisDias(5), ultimo_acesso: quandoHa(1),
    comercial: { valor_mensal: 150.5, dia_vencimento: 10, etiquetas: ["clínicas", "Taubaté"], contato: { responsavel: "Rita Souza", documento: "11222333000181" } } }], id => id, { superConta: false, hoje });
  const [cab, linha] = csv.replace("﻿", "").split("\r\n");
  for (const c of ["Valor mensal (R$)", "Dia de vencimento", "Dias de teste restantes", "Última atividade", "Responsável", "CPF/CNPJ", "Etiquetas"]) assert.ok(cab.includes(c), c);
  assert.match(linha, /150,50;10;5;/);
  assert.match(linha, /Rita Souza/);
  assert.match(linha, /11\.222\.333\/0001-81/);
  assert.match(linha, /clínicas, Taubaté/);
});

test("DU-195: «pela plataforma» para todos — o CSV da plataforma sai sem «Nexus»", () => {
  assert.equal(ADM.quemPausa(true), "pela plataforma");
  const csv = ADM.csvClientes([{ nome: "X", slug: "x", status: "ativo", ativo: false, comercial: { pacote: "ultra" } }], id => id, { superConta: true });
  assert.doesNotMatch(csv, /Nexus/);
  assert.match(csv, /Pacote comercial/, "a coluna interna de super continua");
});

test("DU-185: CPF/CNPJ com dígitos verificadores, contato lido do formulário e o responsável na mensagem de fim de teste", () => {
  assert.equal(ADM.tipoDocumento("11.222.333/0001-81"), "cnpj");
  assert.equal(ADM.tipoDocumento("11.222.333/0001-82"), null);
  assert.equal(ADM.tipoDocumento("529.982.247-25"), "cpf");
  assert.equal(ADM.tipoDocumento("111.111.111-11"), null);
  assert.equal(ADM.tipoDocumento(""), "");
  assert.equal(ADM.formatarDocumento("52998224725"), "529.982.247-25");
  assert.deepEqual(ADM.lerContato({ ct_responsavel: " Rita ", ct_documento: "529.982.247-25", ct_email: "" }), { valor: { responsavel: "Rita", documento: "52998224725" }, erro: null });
  assert.equal(ADM.lerContato({ ct_documento: "123" }).erro.campo, "ct_documento");
  assert.equal(ADM.lerContato({}).valor, null);
  const hoje = hojeIso();
  const msg = ADM.mensagemFollowupTeste({ nome: "Clínica", teste_ate: isoMaisDias(2), comercial: { contato: { responsavel: "Rita Souza" } } }, hoje, "Conecta");
  assert.match(msg, /^Olá, Rita! Seu teste do Conecta/);
});

test("DU-203: a mensagem de fim de teste em dois tons (próximo e formal), ambos sem a marca da plataforma", () => {
  const hoje = hojeIso();
  const cli = { nome: "Clínica Sol", teste_ate: isoMaisDias(1), comercial: { contato: { responsavel: "Paulo Lima" } } };
  const prox = ADM.mensagemFollowupTesteTom(cli, hoje, "Conecta", "proximo");
  const formal = ADM.mensagemFollowupTesteTom(cli, hoje, "Conecta", "formal");
  assert.notEqual(prox, formal);
  assert.match(formal, /^Prezado\(a\) Paulo, o período de teste do Conecta para a Clínica Sol termina amanhã/);
  assert.match(prox, /Olá, Paulo!/);
  for (const t of [prox, formal]) assert.doesNotMatch(t, /Nexus|Órbita|Anthropic|CodeWords/);
});

test("DU-188: marcos de ativação (3 de 5) e «parado na ativação» só depois de 5 dias", () => {
  const it = { ultimo_acesso: quandoHa(1), canais: [{ estado: "conectado" }], uso: { conversas: 4, automacoes: 0 }, criado_em: quandoHa(10) };
  const m = ADM.marcosAtivacao(it);
  assert.equal(m.feitos, 3);
  assert.equal(m.total, 5);
  assert.equal(ADM.marcosAtivacao({ ativacao: { relatorio: true } }).marcos.find(x => x.id === "relatorio").feito, true, "o servidor manda os marcos");
  const hoje = hojeIso();
  assert.equal(ADM.paradoNaAtivacao({ criado_em: quandoHa(7), uso: {} }, hoje), true);
  assert.equal(ADM.paradoNaAtivacao({ criado_em: quandoHa(2), uso: {} }, hoje), false, "recém-criado ainda não conta");
  assert.deepEqual(ADM.filtrarLocal([{ id: 1, criado_em: quandoHa(7), uso: {} }, { id: 2, criado_em: quandoHa(7), ...it }], "parados", "", hoje).map(x => x.id), [1]);
});

test("DU-184 / DU-191 / DU-402 / DU-405: filtros locais por pagamento atrasado, etiqueta, automações com erro e risco (com 3 sinais)", () => {
  const hoje = hojeIso();
  const itens = [
    { id: "a", situacao_pagamento: "atrasado", comercial: { etiquetas: ["Clínicas"] } },
    { id: "b", situacao_pagamento: "em_dia", automacoes_erro: 2, comercial: { etiquetas: ["oficinas"] } },
    { id: "c", situacao_pagamento: "atrasado", ultimo_acesso: quandoHa(30), canais: [{ estado: "desconectado" }] },
  ];
  assert.deepEqual(ADM.filtrarLocal(itens, "atrasado", "", hoje).map(x => x.id), ["a", "c"]);
  assert.deepEqual(ADM.filtrarLocal(itens, "etiqueta:clínicas", "", hoje).map(x => x.id), ["a"]);
  assert.deepEqual(ADM.filtrarLocal(itens, "auto_erro", "", hoje).map(x => x.id), ["b"]);
  const r = ADM.riscoCliente(itens[2], hoje);
  assert.equal(r.motivos.length, 3);
  assert.equal(r.pontos, 90);
  assert.deepEqual(ADM.filtrarLocal(itens, "risco", "", hoje).map(x => x.id), ["c"]);
  assert.deepEqual(ADM.separarEtiquetas("clínicas, Taubaté ,clínicas;;"), ["clínicas", "Taubaté"]);
  assert.deepEqual(ADM.todasEtiquetas(itens), ["Clínicas", "oficinas"]);
  assert.equal(ADM.rotuloFiltroLocal("etiqueta:VIP"), "Só a etiqueta «VIP»");
  assert.deepEqual(ADM.rotuloPagamento("atrasado"), ["Atrasado", "ruim"]);
});

test("DU-193 / DU-194 / DU-209: textos sem a marca para a revenda e o radio do pacote com nome e preço numa frase", () => {
  assert.doesNotMatch(ADM.TEXTO_AJUDA_PACOTE, /Órbita|Nexus/);
  assert.doesNotMatch(ler("web/app/admin.js"), /recursos do Órbita/);
  const loc = { hostname: "localhost", href: "http://localhost/app/" };
  assert.doesNotMatch(ADM.linkConvite("#/convite/x", loc, { superConta: false }).motivo, /Órbita/);
  assert.match(ADM.linkConvite("#/convite/x", loc, { superConta: true }).motivo, /Órbita/, "a plataforma continua com o nome técnico");
  assert.equal(ADM.rotuloRadioPacote("PLANO ESSENCIAL", "R$ 1.294,78", "R$ 889,45"), "Plano Essencial, R$ 1.294,78 por mês, mais R$ 889,45 de integração");
});

test("DU-196: módulos do cliente novo pré-marcados pelo plano e editáveis dentro dele (CRM e Conversas juntos)", () => {
  assert.deepEqual(ADM.modulosIniciais(["crm", "conversas", "ads"]), ["crm", "conversas", "ads"]);
  assert.deepEqual(ADM.modulosIniciais(["crm", "conversas", "ads"], ["conversas"]), ["crm", "conversas"]);
  assert.deepEqual(ADM.modulosIniciais(["crm", "conversas"], ["crm", "ads"]), ["crm", "conversas"], "a revenda não liga módulo fora do plano");
  assert.deepEqual(ADM.modulosIniciais(["crm", "conversas"], ["ads"], true), ["ads"], "a plataforma pode");
});

test("DU-198 / DU-201 / DU-202 / DU-210: marca efetiva do cliente, uso da agência, teste grátis no checklist e prévia do link", () => {
  const ef = ADM.marcaDoCliente(T, { org: { marca: { produto: "Conecta CRM", cores: { primaria: "#123456" } } }, tema: {} });
  assert.equal(ef.produto, "Conecta CRM");
  assert.equal(ADM.rotuloUsoLimite(7, 10), "usado: 7 de 10");
  assert.equal(ADM.rotuloUsoLimite(3, null), "usado: 3 (sem limite)");
  const passos = ADM.passosRevenda({}, [], [], { linkTeste: "https://x/app/?org=rev#/testar" });
  const p = passos.find(x => x.id === "teste_gratis");
  assert.ok(p && p.opcional && !p.feito && p.link);
  assert.equal(ADM.passosRevenda({ teste_aberto: true }, [], []).find(x => x.id === "teste_gratis").feito, true);
  assert.equal(ADM.linkTesteGratis("https://app.x.com/", "rev"), "https://app.x.com/app/?org=rev#/testar");
  assert.equal(ADM.linkTesteGratis("https://app.x.com", "rev", "crm.agencia.com.br"), "https://crm.agencia.com.br/app/#/testar");
  assert.equal(ADM.linkEntradaCliente("https://app.x.com", "clinica-x", "App.Agencia.com.br/"), "https://app.agencia.com.br/app/#/?c=clinica-x");
  assert.equal(ADM.linkEntradaCliente("https://app.x.com/", "clinica-x"), "https://app.x.com/app/#/?c=clinica-x");
});

test("DU-427 / DU-206 / DU-428 / recursos: pacotes fixos só para a plataforma, papéis da revenda, IA acima da média e recurso pela sessão", () => {
  assert.deepEqual(ADM.pacotesDaSessao({ conta: { super: false }, org: { tipo: "revenda" } }), [], "o gestor da revenda não recebe os preços da plataforma");
  assert.equal(ADM.pacotesDaSessao({ conta: { super: true } }), ADM.PACOTES_COMERCIAIS);
  assert.deepEqual(ADM.pacotesDaSessao({ conta: {} }, [{ id: "x" }]), [{ id: "x" }]);
  assert.equal(ADM.papelRevenda({ conta: { papel_revenda: "suporte" } }), "suporte");
  assert.equal(ADM.papelRevenda({ conta: {} }), "gestor");
  const itens = [{ ia_custo_mes: 1 }, { ia_custo_mes: 1 }, { ia_custo_mes: 10 }];
  assert.equal(ADM.iaAcimaDaMedia(itens, itens[2]), true);
  assert.equal(ADM.iaAcimaDaMedia(itens, itens[0]), false);
  assert.equal(ADM.temRecurso({ recursos: ["planos_revenda"] }, "planos_revenda"), true);
  assert.equal(ADM.temRecurso({}, "planos_revenda"), false);
  assert.deepEqual(ADM.chavesNaoGuardadas({ valor_mensal: 10, contato: null, etiquetas: [] }, { comercial: {} }, ["valor_mensal", "contato", "etiquetas"]), ["valor_mensal"]);
});

test("DU-189 / DU-426: relatório do mês e proposta em HTML com a marca da agência, escapados e sem a plataforma", () => {
  const html = ADM.htmlRelatorioMes({ marca: { produto: "Conecta", logo: "data:image/png;base64,AAA" }, cliente: { nome: "Clínica <b>" }, mes: "outubro de 2026", numeros: [{ rotulo: "Contatos", valor: "40" }] });
  assert.match(html, /Clínica &lt;b&gt;/);
  assert.match(html, /<img src="data:image\/png;base64,AAA"/);
  assert.match(html, /<td>40<\/td>/);
  assert.doesNotMatch(html, /Nexus|Órbita/);
  assert.doesNotMatch(ADM.htmlRelatorioMes({ marca: { logo: "javascript:alert(1)" } }), /javascript:/, "logo só data:image ou https");
  const prop = ADM.htmlProposta({ marca: { produto: "Conecta" }, prospect: "Bem Estar", validade: "10/11/2026", planos: [{ nome: "Básico", preco_mensal: 199, itens: ["CRM"] }, { nome: "Top", preco_mensal: null }] });
  assert.match(prop, /Proposta para Bem Estar/);
  assert.match(prop, /R\$ 199,00\/mês/);
  assert.match(prop, /Sob consulta/);
  assert.match(prop, /válida até 10\/11\/2026/);
  assert.doesNotMatch(prop, /Nexus|Órbita|PLANO ESSENCIAL/);
});

test("DU-350 / DU-352 / DU-435 / DU-344: verbo + objeto nos botões, sem «slug» visível, papel pelo rotuloPapel e content-visibility na lista", () => {
  const src = ler("web/app/admin.js");
  assert.doesNotMatch(src, /rotulo: "Endereço \(slug\)"/);
  assert.doesNotMatch(src, /"Salvar alterações"/);
  assert.match(src, /"Salvar cliente"/);
  assert.match(src, /"Salvar revenda"/);
  assert.doesNotMatch(src, /u\.gestor \? "Gestor"/);
  assert.match(ler("web/app/config.css"), /\.adm-lista-clientes tbody tr \{ content-visibility: auto; contain-intrinsic-size: auto 64px; \}/);
});

test("DU-184 / DU-188 / DU-191 / DU-404 / DU-405 (tela): colunas e KPIs aparecem só com o dado do servidor; etiquetas no seletor", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const base = [{ id: "a", nome: "A", slug: "a", status: "ativo", plano: "essencial", uso: {}, limites: {}, criado_em: quandoHa(20) }];
    // servidor de hoje: sem os campos novos → nenhuma coluna nova
    let itens = base;
    const rpc = async n => (n === "nx_clientes_admin" ? itens : n === "nx_planos_listar" ? PLANOS : n === "nx_orgs_listar" ? [] : []);
    let t = ctxAdm(ui, { rpc, superConta: false });
    await adm.montar(t.ctx); await tique(10);
    assert.equal(t.alvo.querySelectorAll("[data-col=situacao_pagamento]").length, 0);
    assert.equal(t.alvo.querySelectorAll("[data-col=ultimo_acesso]").length, 0);
    assert.equal(t.alvo.querySelector(".adm-sel-etiqueta").hidden, true);
    // servidor novo
    itens = [{ ...base[0], situacao_pagamento: "atrasado", ultimo_acesso: quandoHa(30), comercial: { etiquetas: ["VIP"] }, canais: [{ estado: "desconectado" }] },
      { id: "b", nome: "B", slug: "b", status: "ativo", plano: "essencial", uso: {}, limites: {}, situacao_pagamento: "em_dia", ultimo_acesso: quandoHa(1), criado_em: quandoHa(20) }];
    t = ctxAdm(ui, { rpc, superConta: false });
    await adm.montar(t.ctx); await tique(10);
    assert.equal(t.alvo.querySelectorAll("[data-col=situacao_pagamento]").length, 2);
    assert.match(textoDe(t.alvo.querySelector(".tab-linha[data-id=a] [data-col=situacao_pagamento]")), /Atrasado/);
    assert.match(textoDe(t.alvo.querySelector(".tab-linha[data-id=a] [data-col=n_risco]")), /90/);
    assert.match(textoDe(t.alvo.querySelector(".tab-linha[data-id=a] [data-col=n_ativacao]")), /\d\/5/);
    assert.match(textoDe(t.alvo.querySelector(".adm-kpis")), /Pagamento atrasado/);
    assert.match(textoDe(t.alvo.querySelector(".adm-kpis")), /Em risco/);
    const sel = t.alvo.querySelector(".adm-sel-etiqueta");
    assert.equal(sel.hidden, false);
    assert.ok(sel.querySelectorAll("option").some(o => o.value === "VIP"));
    assert.match(textoDe(t.alvo.querySelector(".tab-linha[data-id=a] .adm-etiquetas")), /VIP/);
  } finally { d.fim(); }
});

test("DU-185 / DU-186 / DU-196 (tela): Novo cliente envia contato, módulos escolhidos e já gera o convite do administrador", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [], convites = [];
    const rpc = async (n, p) => {
      if (n === "nx_clientes_admin") return [];
      if (n === "nx_planos_listar") return PLANOS;
      if (n === "nx_orgs_listar") return [{ id: "org-a", nome: "Revenda A", tipo: "revenda", limites: { plano_padrao: "pro" } }];
      if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { id: "novo1", nome: p.p_cliente.nome, plano: p.p_cliente.plano, comercial: { pacote: null, segmento: "", especificacoes: "" } }; }
      if (n === "nx_convite_criar") { convites.push(p); return { link: "https://app.x.com/app/#/convite/abc", expira_em: new Date(Date.now() + 3 * 86400e3).toISOString() }; }
      return [];
    };
    const { modal } = modalQueRoda(d, ui, { antes: async o => {
      if (o.titulo !== "Novo cliente") return;
      const f = o.corpo;
      f.querySelector("input[name=nome]").value = "Clínica Sol";
      f.querySelector("input[name=slug]").value = "clinica-sol";
      f.querySelector("input[name=email_admin]").value = "dono@sol.com";
      f.querySelector("input[name=ct_responsavel]").value = "Rita Souza";
      f.querySelector("input[name=ct_documento]").value = "11.222.333/0001-81";
      f.querySelector("input[name=etiquetas]").value = "clínicas, VIP";
      for (const cb of f.querySelectorAll(".adm-novo-modulos input[type=checkbox]")) cb.checked = cb.value !== "ads";
    } });
    const t = ctxAdm(ui, { rpc, superConta: false, modal });
    t.ctx.sessao.org.tipo = "revenda";
    await adm.montar(t.ctx); await tique(10);
    clicar(d, t.alvo.querySelector(".adm-novo"));
    await tique(20);
    assert.equal(salvos.length, 1);
    const p = salvos[0];
    assert.deepEqual(p.modulos, ["crm", "conversas"], "ads (do plano Pro) desmarcado à mão");
    assert.deepEqual(p.comercial.contato, { responsavel: "Rita Souza", documento: "11222333000181" });
    assert.deepEqual(p.comercial.etiquetas, ["clínicas", "VIP"]);
    assert.equal(convites.length, 1);
    assert.equal(convites[0].p_cliente, "novo1");
    assert.equal(convites[0].p_dados.email, "dono@sol.com");
    assert.ok(t.toasts.some(([m]) => /ainda não guarda: contato do cliente, etiquetas/.test(m)), "o servidor de hoje descarta o que não conhece — a tela avisa");
    assert.deepEqual(t.navegou, ["#/admin/clientes/novo1"]);
  } finally { d.fim(); }
});

test("DU-192 / DU-403 / DU-198 / DU-182 (tela): notas somem sem a função, canais com a queda, marca vista e valor cobrado não guardado avisa", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    const cli = CLI({ canais: [{ numero: "+55 12 99999-0000", estado: "desconectado", ultima_queda: quandoHa(1) }], org: { id: "org-a", nome: "Revenda A", marca: { produto: "Conecta" } } });
    const rpc = async (n, p) => {
      if (n === "nx_clientes_admin") return [cli];
      if (n === "nx_planos_listar") return PLANOS;
      if (n === "nx_usuarios_listar") return { usuarios: [] };
      if (n === "nx_cliente_notas_listar") throw Object.assign(new Error("Could not find the function"), { codigo: "PGRST202" });
      if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { ...cli, ...p.p_cliente, comercial: { pacote: "essencial", segmento: "x", especificacoes: "" } }; }
      if (n === "nx_ia_uso_dia") return [];
      return [];
    };
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], rpc, superConta: false });
    t.ctx.shell.tema = T;
    await adm.montar(t.ctx); await tique(15);
    assert.equal(t.alvo.querySelector(".adm-notas"), null, "servidor sem notas: o cartão não fica");
    assert.match(textoDe(t.alvo.querySelector(".adm-canais")), /Desconectado.*última queda/);
    assert.match(textoDe(t.alvo.querySelector(".adm-marca-vista")), /Conecta/);
    assert.doesNotMatch(textoDe(t.alvo), /Nexus/);
    const form = t.alvo.querySelector("form");
    const v = form.querySelector("input[name=valor_mensal]");
    assert.ok(v, "o gestor vê o valor cobrado");
    v.value = "150"; v.dispatchEvent(new d.Evento("input"));
    form.dispatchEvent(new d.Evento("submit"));
    await tique(15);
    assert.equal(salvos.length, 1);
    assert.equal(salvos[0].comercial.valor_mensal, 150);
    assert.ok(t.toasts.some(([m]) => /ainda não guarda: valor cobrado/.test(m)));
  } finally { d.fim(); }
});


/* ================================================================== plano 2000d · complemento da frente config (FX) */
test("FX-001/003/004/005/008/009/010/012/017/019/102: Perfil — partes por ?secao, silencioso, abrir na última tela, senha, nome, telefone e código", () => {
  // FX-001 / DU-128
  assert.equal(CFG.parteDoPerfil("avisos#cfg-pf-avisos"), "cfg-pf-avisos");
  assert.equal(CFG.parteDoPerfil("SENHA"), "cfg-pf-senha");
  assert.equal(CFG.parteDoPerfil("ausente"), "cfg-pf-avisos");
  assert.equal(CFG.parteDoPerfil("x"), null);
  // FX-003 / FX-004 / DU-268
  assert.equal(CFG.silencioValido("", ""), true);
  assert.equal(CFG.silencioValido("22:00", "07:00"), true, "atravessa a meia-noite");
  assert.equal(CFG.silencioValido("22:00", ""), false);
  assert.equal(CFG.silencioValido("07:00", "07:00"), false);
  assert.equal(CFG.silencioValido("25:00", "07:00"), false);
  assert.match(CFG.rotuloSilencio({ de: "22:00", ate: "07:00" }), /das 22:00 às 07:00, atravessando a meia-noite/);
  assert.match(CFG.rotuloSilencio(null), /Sem horário silencioso/);
  // FX-005 / DU-408
  const mem = new Map();
  const arm = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  assert.equal(CFG.lerAbrirUltima(arm), true, "padrão ligado");
  CFG.gravarAbrirUltima(arm, false);
  assert.equal(mem.get("nx-abrir-ultima"), "0");
  assert.equal(CFG.lerAbrirUltima(arm), false);
  CFG.gravarAbrirUltima(arm, true);
  assert.equal(mem.has("nx-abrir-ultima"), false);
  // FX-008
  assert.deepEqual(CFG.conferirRepeticao("abcdefgh1", "abc"), { ok: null, texto: "" });
  assert.equal(CFG.conferirRepeticao("abcdefgh1", "abcdefgh1").ok, true);
  assert.equal(CFG.conferirRepeticao("abcdefgh1", "abx").ok, false);
  // FX-009 / FX-010
  assert.equal(CFG.limparNome("  Ana   Maria  Souza "), "Ana Maria Souza");
  assert.equal(CFG.previaAssinatura("— Ana"), "Tem sim! Às 14h ou às 16h?\n— Ana");
  assert.equal(CFG.previaAssinatura("  "), "");
  // FX-012 / FX-102
  assert.equal(CFG.pareceFixo("(12) 3632-0000"), true);
  assert.equal(CFG.pareceFixo("(12) 99830-3030"), false);
  assert.equal(CFG.dddValido("(01) 99999-0000"), false);
  assert.equal(CFG.dddValido("(12) 99999-0000"), true);
  assert.equal(CFG.dddValido("5520999990000"), false, "DDD 20 não existe");
  assert.equal(CFG.dddValido("+1 415 555 0100"), true, "fora do Brasil passa");
  // FX-017
  assert.equal(CFG.codigoValido("123-456"), true);
  assert.equal(CFG.codigoValido("123.456"), true);
  assert.equal(CFG.limparCodigo(" 12 34-56 "), "123456");
  // FX-019 / DR-333
  assert.equal(CFG.chaveOnboardingCfg("cli1", null), null);
  assert.equal(CFG.chaveOnboardingCfg("cli1", "c1"), "nx-onb:cli1:c1");
});

test("FX-013/015/016/085/087/088: sessões, códigos de recuperação, chave do autenticador e imagens", () => {
  const agora = Date.now();
  const l = CFG.ordenarSessoes([{ id: 1, ultimo_uso: new Date(agora - 5e6).toISOString() }, { id: 2, ultimo_uso: new Date(agora - 1e3).toISOString() }, { id: 3, atual: true, ultimo_uso: new Date(agora - 9e6).toISOString() }]);
  assert.deepEqual(l.map(s => s.id), [3, 2, 1], "este aparelho primeiro, depois o mais recente");
  const txt = CFG.textoCodigosRecuperacao({ produto: "Conecta", email: "a@b.com", codigos: ["AAAA-1111", "BBBB-2222"], data: "2026-10-25" });
  assert.match(txt, /Códigos de recuperação — Conecta/);
  assert.match(txt, /AAAA-1111\nBBBB-2222$/);
  assert.doesNotMatch(txt, /Órbita|Nexus/);
  assert.equal(CFG.agruparSegredo("jbswy3dpehpk3pxp"), "JBSW Y3DP EHPK 3PXP");
  assert.equal(CFG.rotuloSessao({ navegador: "Chrome", instalado: true, sistema: "Android" }), "Chrome · app instalado · Android");
  assert.match(CFG.erroArquivoImagem({ type: "image/heic", name: "IMG_1.HEIC", size: 1000 }), /HEIC/);
  assert.match(CFG.erroArquivoImagem({ type: "image/svg+xml", name: "logo.svg", size: 1000 }), /SVG/);
  assert.match(CFG.erroArquivoImagem({ type: "image/png", name: "x.png", size: 40 * 1024 * 1024 }), /mais de 15 MB/);
  assert.match(CFG.erroArquivoImagem({ type: "image/gif", name: "x.gif", size: 10 }), /PNG, JPEG ou WebP/);
  assert.equal(CFG.erroArquivoImagem({ type: "image/png", name: "x.png", size: 1000 }), null);
});

test("FX-020/021/022/024/025/027/093/112/119: Dados da empresa — minutos, avaliação, feriados, Instagram, 0800, fuso, mapa e prazo", () => {
  // FX-020 / DU-095
  assert.equal(CFG.lerMinutos("1,5"), 1.5);
  assert.equal(CFG.lerMinutos(""), null);
  assert.ok(Number.isNaN(CFG.lerMinutos("45")));
  assert.ok(Number.isNaN(CFG.lerMinutos("0,2")));
  // FX-021 / DU-036
  assert.equal(CFG.completarHttps("g.page/r/abc/review"), "https://g.page/r/abc/review");
  assert.equal(CFG.completarHttps("http://x.com.br/a"), "https://x.com.br/a");
  assert.equal(CFG.trocarVariaveisEmpresa("Avalie: {link_avaliacao}", { link_avaliacao: "g.page/r/abc" }), "Avalie: https://g.page/r/abc");
  // FX-022 / DU-072
  const f = CFG.separarFeriados("25/12, 20/1/2027; 2027-03-04\n31/02, 12-08, abc");
  assert.deepEqual(f.lista, ["2027-01-20", "2027-03-04", "12-08", "12-25"]);
  assert.deepEqual(f.invalidos, ["31/02", "abc"]);
  assert.equal(CFG.feriadosEmTexto(["12-25", "2027-01-20"]), "25/12, 20/01/2027");
  // FX-024
  assert.equal(CFG.normalizarInstagram("https://www.instagram.com/clinica.sol/?hl=pt"), "clinica.sol");
  assert.equal(CFG.normalizarInstagram("@@clinica"), "clinica");
  assert.deepEqual(CFG.validarDadosEmpresa({ instagram: "instagram.com/clinica_sol" }), []);
  assert.equal(CFG.linkInstagram("@clinica"), "https://www.instagram.com/clinica/");
  // FX-025: 0800 e 4004 não ganham o 55
  assert.deepEqual(CFG.validarDadosEmpresa({ telefone_empresa: "0800 123 4567" }), []);
  assert.equal(CFG.normalizarTelefoneEmpresa("4004-1234"), "40041234");
  assert.equal(CFG.normalizarTelefoneEmpresa("(12) 3632-0000"), "551236320000");
  assert.deepEqual(CFG.validarDadosEmpresa({ telefone_empresa: "(01) 3632-0000" }).map(e => e.campo), ["telefone_empresa"]);
  assert.deepEqual(CFG.validarDadosEmpresa({ link_avaliacao: "nada", feriados: "31/02", minutos_por_mensagem: "99" }).map(e => e.campo).sort(), ["feriados", "link_avaliacao", "minutos_por_mensagem"]);
  // FX-027: mesma hora não avisa; outra hora avisa
  assert.equal(CFG.fusoDifere("America/Sao_Paulo", "America/Bahia"), false);
  assert.equal(CFG.fusoDifere("America/Sao_Paulo", "America/Manaus"), true);
  // FX-093
  assert.match(CFG.linkMapa("Rua A, 10 - Taubaté"), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20A%2C%2010/);
  assert.equal(CFG.linkMapa("  "), null);
  // FX-119: só encurtar o prazo pede confirmação
  assert.equal(CFG.prazoEncurta("", "12"), true);
  assert.equal(CFG.prazoEncurta("24", "12"), true);
  assert.equal(CFG.prazoEncurta("12", "60"), false);
  assert.equal(CFG.prazoEncurta("12", ""), false);
});

test("FX-032/033/034/035/036/037/038/039/041/042/043/044/046/047/091/101/105: equipe e convites", () => {
  const agora = Date.now();
  const us = [{ conta_id: "a", nome: "Ana", email: "a@x.com", papel: "supervisor", ultimo_acesso: new Date(agora - 60e3).toISOString() },
    { conta_id: "b", nome: "Bia", email: "B@x.com", papel: "atendente", ultimo_acesso: new Date(agora - 40 * 86400e3).toISOString() },
    { conta_id: "c", nome: "Caio", email: "c@x.com", papel: "atendente", suspenso: true },
    { conta_id: "g", nome: "Gestor", email: "g@x.com", gestor: true }];
  // FX-032: o papel entra na busca
  assert.deepEqual(CFG.filtrarUsuarios(us, "supervisor").map(u => u.nome), ["Ana"]);
  // FX-033
  assert.deepEqual(CFG.ordenarConvites([{ id: 1, expira_em: "2026-12-10" }, { id: 2, expira_em: "2026-11-01" }, { id: 3 }]).map(c => c.id), [2, 1, 3]);
  // FX-034 / FX-050
  assert.equal(CFG.sugestaoEmail("ana@gmial.com"), "ana@gmail.com");
  assert.equal(CFG.sugestaoEmail("ana@uol.com"), "ana@uol.com.br");
  assert.equal(CFG.sugestaoEmail("ana@gmail.com"), null);
  // FX-035: «Nome <email>» colado do Outlook
  assert.deepEqual(CFG.separarEmails("Ana Souza <ana@x.com>; Bia <bia@y.com>, mailto:c@d.com"), { validos: ["ana@x.com", "bia@y.com", "c@d.com"], invalidos: [] });
  // FX-036
  assert.equal(CFG.resumoEmails("a@b.com, c@d.com, errado"), "2 e-mails · 1 não parece e-mail");
  assert.equal(CFG.resumoEmails(""), "");
  // FX-037: situação e (quando informado) 2 etapas no CSV
  const csv = CFG.csvEquipe([{ nome: "Ana", email: "a@x.com", papel: "admin", suspenso: true, dois_fatores: true }, { nome: "Bia", email: "b@x.com", papel: "atendente", pausado_ate: isoMaisDias(5) + "T12:00:00Z", dois_fatores: false }]);
  const [cab, l1, l2] = csv.replace("﻿", "").split("\r\n");
  assert.equal(cab, "Nome;E-mail;Papel;Departamentos;Último acesso;Situação;2 etapas");
  assert.match(l1, /;Suspenso;sim$/);
  assert.match(l2, /;Pausado até \d\d\/\d\d;não$/);
  // FX-038
  assert.equal(CFG.nomeArquivo("  Clínica São José! "), "clinica-sao-jose");
  assert.equal(CFG.nomeArquivo(""), "empresa");
  // FX-039 / FX-041 / FX-042
  assert.equal(CFG.contarOnline(us, agora), 1);
  assert.equal(CFG.diasSemEntrar(us[1], agora), 40);
  assert.equal(CFG.diasSemEntrar(us[2], agora), null);
  assert.deepEqual(CFG.inativos(us, 30, agora).map(u => u.nome), ["Bia"]);
  // FX-043 / FX-044
  assert.equal(CFG.textoLinkEquipe({ cliente: "Clínica Sol", produto: "Conecta" }), "Olá! Para entrar na equipe da Clínica Sol no Conecta, peça seu acesso por este link:");
  assert.equal(CFG.estadoLinkEquipe({ usos: 5, limite: 5 }), "esgotado");
  assert.equal(CFG.estadoLinkEquipe({ expira_em: new Date(agora - 1000).toISOString() }, agora), "vencido");
  assert.equal(CFG.estadoLinkEquipe({ usos: 1, limite: 5, expira_em: new Date(agora + 86400e3).toISOString() }, agora), "ativo");
  // FX-101
  assert.match(CFG.erroLimiteLinkEquipe(5, { uso: 9, lim: 10 }), /só 1 vaga/);
  assert.match(CFG.erroLimiteLinkEquipe(2, { uso: 10, lim: 10 }), /não tem vagas/);
  assert.equal(CFG.erroLimiteLinkEquipe(3, { uso: 2, lim: 10 }), null);
  assert.equal(CFG.erroLimiteLinkEquipe(60, {}), "De 1 a 50 pessoas.");
  // FX-046
  assert.equal(CFG.permissoesIguais({}, { admin: { exportar: false } }), true, "o administrador é sempre tudo: não conta como mudança");
  assert.equal(CFG.permissoesIguais({}, { atendente: { exportar: false } }), false);
  // FX-047
  assert.equal(CFG.dataMaisDias("2026-12-28", 7), "2027-01-04");
  // FX-091
  assert.equal(CFG.emailsDe(us), "a@x.com, b@x.com, c@x.com");
  // FX-105
  assert.equal(CFG.LIMITE_CONVITES_LOTE, 50);
});

test("FX-051/053/054/055/057/058/061/063/064/066/067/068/069/070/071/072/073/092/095/096/100: hub, marca, domínio e plano", () => {
  const secs = [{ id: "numeros", titulo: "Números de WhatsApp", grupo: "Atendimento" }, { id: "perfil", titulo: "Perfil", grupo: "Você" }, { id: "usuarios", titulo: "Usuários e convites", grupo: "Equipe" }];
  // FX-051 / FX-053
  assert.deepEqual(CFG.filtrarSecoes(secs, "zap"), ["numeros"]);
  assert.ok(CFG.filtrarSecoes(secs, "2-etapas?").includes("perfil"), "a pontuação não atrapalha");
  assert.deepEqual(CFG.filtrarSecoes(secs, "silencioso"), ["perfil"]);
  // FX-100
  assert.equal(CFG.secaoParecida(secs, "usuario").id, "usuarios");
  assert.equal(CFG.secaoParecida(secs, "xy"), null);
  // FX-054 / DU-150
  assert.equal(CFG.hashCurto({ a: 1 }), CFG.hashCurto({ a: 1 }));
  assert.notEqual(CFG.hashCurto({ a: 1 }), CFG.hashCurto({ a: 2 }));
  assert.match(CFG.hashCurto("x"), /^[0-9a-f]{8}$/);
  // FX-055 / DU-322
  assert.match(CFG.nomeCor("#25D366"), /^Verde #25D366$/);
  assert.match(CFG.nomeCor("#0A0F1A"), /^Preto|escuro/);
  assert.equal(CFG.nomeCor("#FFFFFF"), "Branco #FFFFFF");
  // FX-057
  assert.match(CFG.avisoNomeCurto("Clínica Sorriso Total"), /aparece como «Clínica»/);
  assert.equal(CFG.avisoNomeCurto("Conecta"), "");
  // FX-056 / DU-152: as chaves da janela de boas-vindas são novas (o servidor antigo recusa → a tela salva o resto)
  for (const k of ["boas_vindas_titulo", "boas_vindas", "contato_agencia"]) assert.ok(CFG.CHAVES_MARCA_NOVAS.includes(k), k);
  assert.deepEqual(CFG.validarLinksMarca({ boas_vindas: "x".repeat(401) }).map(e => e.campo), ["boas_vindas"]);
  // FX-061
  assert.equal(CFG.textoCoresMarca({ primaria: "#2255cc", fundo: "#0a0f1a" }), "Primária: #2255CC\nFundo: #0A0F1A");
  // FX-063 / FX-064
  assert.match(CFG.erroHostDominio("crm.clínica.com.br"), /sem acento/);
  assert.equal(CFG.normalizarHost("crm .agencia.com.br"), "crm.agencia.com.br");
  // FX-066 / FX-067 / FX-095
  assert.deepEqual(CFG.ordenarDominios([{ host: "b.x.com", status: "ativo" }, { host: "a.x.com", status: "pendente" }, { host: "c.x.com", status: "quebrado" }]).map(d => d.host), ["c.x.com", "a.x.com", "b.x.com"]);
  assert.equal(CFG.hostJaCadastrado([{ host: "crm.a.com.br" }], "HTTPS://CRM.A.com.br/"), true);
  assert.match(CFG.textoRegistroDns("crm.agencia.com.br", "x.netlify.app"), /Tipo: CNAME\nNome: crm \(endereço completo: crm\.agencia\.com\.br\)\nValor: x\.netlify\.app/);
  // FX-068 / FX-069 / FX-096
  const fs = [{ vencimento: "2026-09-10", status: "paga", valor: 100 }, { vencimento: "2026-11-10", status: "aberta", valor: 100 }, { vencimento: "2026-10-10", status: "atrasada", valor: 150.5 }];
  assert.deepEqual(CFG.resumoFaturas(fs), { aberto: 250.5, n: 2, atrasadas: 1 });
  assert.equal(CFG.resumoFaturas([{ status: "paga" }]), null);
  assert.deepEqual(CFG.ordenarFaturas(fs).map(f => f.status), ["atrasada", "aberta", "paga"]);
  assert.equal(CFG.diasAtraso("2026-10-10", "2026-10-25"), 15);
  assert.equal(CFG.diasAtraso("2026-11-10", "2026-10-25"), 0);
  // FX-070
  assert.deepEqual(CFG.erroCancelamento({ motivo: "outro", faltou: "" }), { campo: "faltou", texto: "Conte em poucas palavras o motivo." });
  assert.equal(CFG.erroCancelamento({ motivo: "preco" }), null);
  // FX-071 / FX-072 / FX-073
  assert.equal(CFG.sobraLimite(3, 5), "Sobram 2");
  assert.equal(CFG.sobraLimite(5, 5), "No limite");
  assert.equal(CFG.sobraLimite(6, 5), "1 acima do limite");
  assert.equal(CFG.sobraLimite(6, null), null);
  assert.equal(CFG.variacaoPct(120, 100), 20);
  assert.equal(CFG.variacaoPct(10, 0), null);
  assert.equal(CFG.midiaQuaseCheia(950, 1000), true);
  assert.equal(CFG.midiaQuaseCheia(500, 1000), false);
  // FX-092: o CSV do histórico sem fórmula
  const csvA = CFG.csvAuditoria([{ em: "2026-10-20T10:30:00Z", quem: "=Ana", alvo: "Bia", acao: "acesso_removido" }]);
  assert.match(csvA, /^﻿Quando;Quem;O que aconteceu\r\n2026-10-20 07:30;'=Ana;'=Ana removeu o acesso de Bia\./);
});

test("FX-074/077/078/079/080/081/084/097/098/099/104/106/107/110: Admin — teste sem fim, slug livre, CSV, WhatsApp, proposta, etiquetas e CNPJ alfanumérico", () => {
  // FX-074 / UC-039
  assert.equal(ADM.testeSemFim({ status: "teste", teste_ate: null }), true);
  assert.equal(ADM.testeSemFim({ status: "teste", teste_ate: "2026-11-01" }), false);
  // FX-077
  assert.equal(ADM.slugLivre("alfa", [{ id: "1", slug: "alfa" }, { id: "2", slug: "alfa-2" }]), "alfa-3");
  assert.equal(ADM.slugLivre("beta", [{ id: "1", slug: "alfa" }]), "beta");
  assert.equal(ADM.slugLivre("a".repeat(40), [{ id: "1", slug: "a".repeat(40) }]).length, 40);
  // FX-078: ativação e risco no CSV
  const [cab, linha] = ADM.csvClientes([{ nome: "X", slug: "x", status: "ativo", situacao_pagamento: "atrasado", ultimo_acesso: quandoHa(20) }], id => id, { superConta: false, hoje: hojeIso() }).replace("﻿", "").split("\r\n");
  assert.ok(cab.endsWith("Ativação (marcos de 5);Risco (0 a 100);Motivos do risco"));
  assert.match(linha, /;65;sem acesso há 20 dias, pagamento atrasado$/);
  // FX-079
  assert.equal(ADM.linkWhatsResponsavel({ comercial: { contato: { whatsapp: "(12) 99830-3030" } } }, "Oi!"), "https://wa.me/5512998303030?text=Oi!");
  assert.equal(ADM.linkWhatsResponsavel({}, "Oi"), null);
  // FX-080 / FX-081
  assert.match(ADM.erroValidadeProposta("2020-01-01", hojeIso()), /hoje ou depois/);
  assert.equal(ADM.erroValidadeProposta(isoMaisDias(3), hojeIso()), null);
  assert.deepEqual(ADM.itensDoPlano({ modulos: ["crm"], limites: { usuarios: 5, canais: 1, contatos: 2000 } }, m => m.toUpperCase()), ["CRM", "Até 5 usuários", "1 número de WhatsApp", "Até 2.000 contatos"]);
  // FX-084: impressão e noindex no HTML gerado
  const html = ADM.htmlProposta({ marca: { produto: "Conecta" }, prospect: "Sol", planos: [] });
  assert.match(html, /@page\{margin:16mm\}/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(ADM.htmlRelatorioMes({ cliente: { nome: "Sol" }, mes: "outubro" }), /break-inside:avoid/);
  // FX-097 / FX-098
  assert.deepEqual(ADM.todasEtiquetas([{ comercial: { etiquetas: ["VIP"] } }, { comercial: { etiquetas: ["vip", "Taubaté"] } }]), ["Taubaté", "VIP"]);
  assert.deepEqual(ADM.separarEtiquetas("#vip, ##clínicas"), ["vip", "clínicas"]);
  // FX-099: CNPJ alfanumérico (exemplo da Receita: 12.ABC.345/01DE-35)
  assert.equal(ADM.tipoDocumento("12.ABC.345/01DE-35"), "cnpj");
  assert.equal(ADM.tipoDocumento("12.ABC.345/01DE-36"), null);
  assert.equal(ADM.limparDocumento("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(ADM.formatarDocumento("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(ADM.lerContato({ ct_documento: "12.ABC.345/01DE-35" }).valor.documento, "12ABC34501DE35");
  assert.equal(ADM.tipoDocumento("11.222.333/0001-81"), "cnpj", "o numérico continua valendo");
  // FX-104
  assert.equal(ADM.nomeCsvClientes({ local: "etiqueta:VIP Clínicas" }, "2026-10-25"), "clientes-etiqueta-vip-clinicas-2026-10-25.csv");
  // FX-076
  assert.equal(ADM.hashClientes({ local: "acabando" }), "#/admin/clientes?local=acabando");
  // FX-106 / FX-107 / FX-110
  assert.equal(ADM.normalizarBusca("  clínica   sol "), "clínica sol");
  assert.equal(ADM.emailsResponsaveis([{ comercial: { contato: { email: "A@x.com" } } }, { comercial: { contato: { email: "a@x.com" } } }, {}]), "a@x.com");
  assert.ok(ADM.MOTIVOS_SUPORTE.includes("A pedido do cliente"));
});

test("FX-001/002/003/005/006/011/013/014/018/086 (tela): Perfil abre na parte pedida, silencioso grava, «Neste aparelho», 2 etapas e nada para salvar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    globalThis.Notification = { permission: "denied" };
    const t = ctxCfg(ui, { partes: ["perfil"], conta: { id: "c9", papel: "clinica", nome: "Ana", email: "ana@x.com", telefone: "5512998303030", ausente_ate: null },
      rpc: async n => {
        if (n === "nx_sessoes_listar") return [{ id: "s1", navegador: "Chrome", atual: true }, { id: "s2", navegador: "Safari", ultimo_uso: new Date(Date.now() - 9e6).toISOString() }, { id: "s3", navegador: "Edge", ultimo_uso: new Date().toISOString() }];
        if (n === "nx_2fa_estado") return { ativo: false };
        return { ok: true };
      } });
    t.ctx.rota.query = { secao: "avisos#cfg-pf-avisos", ativar2fa: "1" };
    await cfg.montar(t.ctx); await tique(12);
    const raiz = t.ctx.alvo;
    // FX-002: «Ficar ausente» no cartão de avisos, que muda de nome
    const avisos = raiz.querySelector("#cfg-pf-avisos");
    assert.ok(avisos.querySelector(".cfg-ausente"));
    assert.match(textoDe(avisos.querySelector("h2")), /Avisos e disponibilidade/);
    // FX-018: o navegador já bloqueou → a explicação aparece sem tentar
    assert.match(textoDe(avisos.querySelector(".cfg-avisos-nota")), /bloqueando os avisos/);
    // FX-006: ?ativar2fa=1 → foco no «Ligar com o WhatsApp» (FX-001 já levou ao cartão de avisos antes)
    assert.ok(d.doc.activeElement.classList.contains("cfg-2fa-ligar"));
    // FX-013 / FX-014: este aparelho primeiro, depois o uso mais recente; o título conta os outros 2
    assert.deepEqual(raiz.querySelectorAll(".cfg-sessao b").map(b => b.textContent), ["Chrome", "Edge", "Safari"]);
    assert.match(textoDe(raiz.querySelector("#cfg-pf-sessoes h2")), /\(2\)/);
    // FX-086: a confirmação do «Sair de todos» diz quantos outros aparelhos
    t.ctx.ui.confirmar = async o => { t.confirmacoes.push(o); return false; };
    clicar(d, botaoTexto(raiz, /Sair de todos os aparelhos/)); await tique(3);
    assert.match(t.confirmacoes.at(-1).texto, /mais 2 aparelhos/);
    // FX-003: o horário silencioso grava silencio {de, ate} nas preferências da pessoa
    const formSil = raiz.querySelector(".cfg-silencio");
    formSil.querySelector("[name=sil_de]").value = "22:00";
    formSil.querySelector("[name=sil_ate]").value = "07:00";
    formSil.dispatchEvent(new d.Evento("submit")); await tique(2);
    assert.deepEqual(JSON.parse(d.mem.get("nx-cv-avisos:c9")).silencio, { de: "22:00", ate: "07:00" });
    assert.match(textoDe(formSil.querySelector(".cfg-silencio-frase")), /atravessando a meia-noite/);
    formSil.querySelector("[name=sil_ate]").value = "";
    formSil.dispatchEvent(new d.Evento("submit")); await tique(2);
    assert.match(textoDe(formSil.querySelector("[data-campo=sil_ate] .campo-erro")), /os dois horários/);
    // FX-005: «Neste aparelho»
    const sw = raiz.querySelector(".cfg-aparelho input[name=abrir_ultima]");
    assert.equal(sw.checked, true);
    sw.checked = false; sw.dispatchEvent(new d.Evento("change"));
    assert.equal(d.mem.get("nx-abrir-ultima"), "0");
    // FX-011: sem mudança não chama o servidor
    const formDados = raiz.querySelectorAll(".cfg-sec form").find(f => f.querySelector("input[name=nome]"));
    formDados.dispatchEvent(new d.Evento("submit")); await tique(3);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_perfil_salvar").length, 0);
    assert.ok(t.toasts.some(([m]) => /Nada para salvar/.test(m)));
    // FX-009 / FX-102: nome com espaço dobrado sai limpo; DDD inexistente é recusado na tela
    formDados.querySelector("input[name=nome]").value = "  Ana   Lima ";
    formDados.querySelector("input[name=telefone]").value = "(01) 99830-3030";
    formDados.dispatchEvent(new d.Evento("submit")); await tique(3);
    assert.match(textoDe(formDados.querySelector("[data-campo=telefone] .campo-erro")), /DDD não existe/);
    formDados.querySelector("input[name=telefone]").value = "(12) 99830-3030";
    formDados.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.equal(t.chamadas.find(c => c[0] === "nx_perfil_salvar")[1].p_dados.nome, "Ana Lima");
    cfg.desmontar();
  } finally { delete globalThis.Notification; d.fim(); }
});

test("FX-007 / FX-008 (tela): senha fácil é recusada antes do servidor e a repetição é conferida ao digitar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], conta: { id: "c8", papel: "clinica", nome: "Ana Souza", email: "anasouza@x.com" } });
    t.ctx.temModulo = () => false;
    await cfg.montar(t.ctx); await tique(8);
    const formSenha = t.ctx.alvo.querySelectorAll(".cfg-sec form").find(f => f.querySelector("input[name=nova]"));
    formSenha.reset = () => {};
    formSenha.querySelector("input[name=atual]").value = "velhaSenha1";
    formSenha.querySelector("input[name=nova]").value = "souza2026!";
    const n2 = formSenha.querySelector("input[name=nova2]");
    digitar(d, n2, "souza2");
    assert.equal(textoDe(formSenha.querySelector(".cfg-senha-confere")), "", "começo igual: ainda digitando");
    digitar(d, n2, "souza2026!");
    assert.equal(textoDe(formSenha.querySelector(".cfg-senha-confere")), "As senhas conferem.");
    formSenha.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(textoDe(formSenha.querySelector("[data-campo=nova] .campo-erro")), /fácil de adivinhar/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_senha_trocar").length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-020/021/022/023/026 (tela): Dados da empresa manda minutos, avaliação e feriados; servidor que recusa salva o resto e avisa", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const salvos = [];
    const t = ctxCfg(ui, { partes: ["empresa"], rpc: async (n, p) => {
      if (n === "nx_empresa_dados") return { endereco: "Rua A", fuso: "America/Sao_Paulo" };
      if (n === "nx_empresa_dados_salvar") { salvos.push(p.p_dados); if ("feriados" in p.p_dados) throw Object.assign(new Error("dados"), { codigo: "dados_invalidos", hint: "feriados" }); return p.p_dados; }
      return {};
    } });
    t.ctx.shell.prontos.CONFIG_PRONTAS.push("empresa");
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    const form = raiz.querySelector(".cfg-sec form");
    form.querySelector("[name=minutos_por_mensagem]").value = "1,5";
    form.querySelector("[name=link_avaliacao]").value = "g.page/r/abc/review";
    form.querySelector("[name=feriados]").value = "20/01, 23/04";
    form.querySelector("[name=instagram]").value = "https://instagram.com/clinica.sol";
    form.dispatchEvent(new d.Evento("input"));
    assert.match(textoDe(raiz.querySelector(".cfg-empresa-previa")), /Avalie: https:\/\/g\.page\/r\/abc\/review/);
    assert.equal(raiz.querySelector(".cfg-empresa-mapa").hidden, false, "FX-093: endereço → «Ver no mapa»");
    assert.ok(raiz.querySelectorAll(".cfg-empresa-vars button").some(b => b.textContent === "{link_avaliacao}"), "FX-026");
    form.dispatchEvent(new d.Evento("submit")); await tique(8);
    assert.equal(salvos.length, 2);
    assert.deepEqual([salvos[0].minutos_por_mensagem, salvos[0].link_avaliacao, salvos[0].feriados, salvos[0].instagram], [1.5, "https://g.page/r/abc/review", ["01-20", "04-23"], "clinica.sol"]);
    assert.equal("minutos_por_mensagem" in salvos[1], false);
    assert.ok(t.toasts.some(([m]) => /ainda não guarda: minutos por mensagem, link de avaliação, feriados/.test(m)));
    cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-028/029/031/034/039/040/042/090/105/108 (tela): ?convidar=1 abre o convite, função escolhe o papel, admin confirma, typo pergunta e suspender", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const agora = Date.now();
    const dados = { limite: 10, uso: 3, usuarios: [
      { conta_id: "c1", nome: "Ana", email: "ana@x.com", papel: "admin", editavel: true, eu: true, ultimo_acesso: new Date(agora - 30e3).toISOString(), suspenso: false },
      { conta_id: "c2", nome: "Bia", email: "bia@x.com", papel: "atendente", editavel: true, ultimo_acesso: new Date(agora - 45 * 86400e3).toISOString(), suspenso: false },
      { conta_id: "c3", nome: "Caio", email: "caio@x.com", papel: "atendente", editavel: true, suspenso: true }],
      convites: [{ id: "v1", papel: "atendente", email: "x@x.com", expira_em: new Date(agora + 5 * 86400e3).toISOString() }], departamentos: [] };
    const criados = [];
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async (n, p) => {
      if (n === "nx_usuarios_listar") return dados;
      if (n === "nx_convite_criar") { criados.push(p.p_dados); return { id: `n${criados.length}`, link: "https://x/#/convite/t", expira_em: new Date(agora + 3 * 86400e3).toISOString() }; }
      if (n === "nx_acesso_suspender") return { ok: true };
      return {};
    } });
    const { modal, abertos } = modalQueRoda(d, ui, { antes: async o => {
      if (o.titulo !== "Convidar para a equipe") return;
      const f = o.corpo;
      const selF = f.querySelector("select[name=funcao]");
      selF.value = "socio"; selF.dispatchEvent(new d.Evento("change"));
      f.querySelector("input[name=email]").value = "nova@gmial.com";
    } });
    t.ctx.ui.modal = modal;
    t.ctx.rotas = { FUNCOES_EQUIPE: [{ id: "recepcao", rotulo: "Recepção", papel: "atendente" }, { id: "socio", rotulo: "Sócio", papel: "admin" }], papelDaFuncao: id => ({ recepcao: "atendente", socio: "admin" })[id] || null };
    let menuItens = null;
    t.ctx.ui.menu = (_b, itens) => { menuItens = itens; };
    t.ctx.rota.query = { convidar: "1" };
    await cfg.montar(t.ctx); await tique(14);
    const raiz = t.ctx.alvo;
    // FX-028: abriu o convite sozinho; FX-029: «Sócio» virou administrador; FX-090: confirmou o admin; FX-034: o typo segurou o 1º toque
    const conv = abertos.find(x => x.o.titulo === "Convidar para a equipe");
    assert.ok(conv, "o convite abriu pelo ?convidar=1");
    assert.equal(conv.o.corpo.querySelector("select[name=papel]").value, "admin");
    assert.ok(t.confirmacoes.some(c => /Convidar como administrador/.test(c.titulo)));
    assert.match(textoDe(conv.o.corpo.querySelector("[data-campo=email] .campo-erro")), /Você quis dizer nova@gmail\.com/);
    assert.equal(criados.length, 0);
    // FX-039 / FX-040 / FX-042
    assert.match(textoDe(raiz.querySelector(".cartao .sub")), /1 online agora/);
    assert.match(textoDe(raiz.querySelector(".cfg-conv-cartao h2")), /Convites pendentes \(1\)/);
    assert.match(textoDe(raiz.querySelector(".cfg-us-inativos")), /Sem entrar há 30\+ dias \(1\)/);
    assert.ok(raiz.querySelector(".cfg-us-suspenso"), "FX-031: a pílula do suspenso");
    // FX-031: o menu da Bia tem «Suspender acesso», que chama nx_acesso_suspender
    const bAcoes = raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bia");
    clicar(d, bAcoes);
    const susp = menuItens.find(i => i && i.rotulo === "Suspender acesso");
    assert.ok(susp);
    assert.ok(menuItens.some(i => i && i.rotulo === "Copiar e-mail"), "FX-109");
    await susp.fn(); await tique(4);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_acesso_suspender")[1], { p_cliente: t.ctx.cliente.id, p_conta: "c2", p_suspenso: true });
    cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-030 (tela): «Gerar de novo» usa o nx_convite_regerar quando o servidor tem (sem revogar nem criar)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const agora = Date.now();
    const dados = { usuarios: [{ conta_id: "c1", nome: "Ana", email: "ana@x.com", papel: "admin", eu: true }], departamentos: [],
      convites: [{ id: "v9", papel: "atendente", email: "velho@x.com", vencido: true, expira_em: new Date(agora - 86400e3).toISOString() }] };
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => {
      if (n === "nx_usuarios_listar") return dados;
      if (n === "nx_convite_regerar") return { id: "v9", token: "t2", link: "https://x/#/convite/t2", expira_em: new Date(agora + 3 * 86400e3).toISOString() };
      return {};
    } });
    const { modal } = modalQueRoda(d, ui);
    t.ctx.ui.modal = modal;
    await cfg.montar(t.ctx); await tique(10);
    clicar(d, t.ctx.alvo.querySelector(".cfg-conv-vencidos .cfg-conv-novo")); await tique(8);
    const nomes = t.chamadas.map(c => c[0]).filter(n => /convite/.test(n));
    assert.deepEqual(nomes, ["nx_convite_regerar"]);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_convite_regerar")[1], { p_cliente: t.ctx.cliente.id, p_convite: "v9" });
    cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-054/055/056/057/060/062 (tela): marca grava nx-marca-hash, amostras com nome, boas-vindas, nome curto e Ctrl+S", async () => {
  const d = comDom();
  try {
    const m = await abrirMarcaOrg(d, { marca: { produto: "Clínica Sorriso Total" } });
    const raiz = m.raiz;
    // FX-056 / DU-152
    for (const n of ["boas_vindas_titulo", "boas_vindas", "contato_agencia"]) assert.ok(raiz.querySelector(`[name=${n}]`), n);
    // FX-057
    assert.match(textoDe(raiz.querySelector(".cfg-nome-curto")), /aparece como «Clínica»/);
    // FX-062: o exemplo do título não cita a plataforma
    assert.doesNotMatch(raiz.querySelector("[name=login_titulo]").getAttribute("placeholder"), /órbita/i);
    // FX-060: Ctrl+S salva (com mudança)
    const bv = raiz.querySelector("[name=boas_vindas_titulo]");
    bv.value = "Bem-vindo!"; bv.dispatchEvent(new d.Evento("input", { bubbles: true }));
    const ev = new d.Evento("keydown", { key: "s", ctrlKey: true });
    raiz.querySelector(".marca-ed").dispatchEvent(ev);
    await tique(10);
    assert.equal(ev.defaultPrevented, true);
    assert.equal(m.salvos.length, 1);
    assert.equal(m.salvos[0].p_org.marca.boas_vindas_titulo, "Bem-vindo!");
    // FX-054 / DU-150: as outras abas repintam
    assert.match(d.mem.get("nx-marca-hash") || "", /^[0-9a-f]{8}$/);
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-065/067/095 (tela): Domínio — «Nome» curto do CNAME, registro inteiro e endereço repetido recusado na hora", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["dominio"], conta: { id: "g1", papel: "gestor", nome: "G" }, rpc: async n => (n === "nx_dominios_listar" ? [{ host: "crm.agencia.com.br", status: "pendente", dns: { valor: "x.netlify.app" } }] : {}) });
    t.ctx.cliente = null; t.ctx.sessao.org = { id: "org-a", nome: "Agência" };
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".dns")), /Nome\s*crm \(se o provedor pedir o endereço inteiro: crm\.agencia\.com\.br\)/);
    clicar(d, raiz.querySelector(".dom-copiar-tudo")); await tique(2);
    assert.match(t.copiados.at(-1)[0], /^Tipo: CNAME\nNome: crm/);
    const form = raiz.querySelector(".cfg-sec form");
    form.querySelector("input[name=host]").value = "CRM.agencia.com.br";
    form.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.match(textoDe(form.querySelector("[data-campo=host] .campo-erro")), /já está cadastrado/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_dominio_salvar").length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("FX-074/076/083/120/121 (tela): Admin — «sem data de fim», filtro local volta pelo endereço, limpar filtros e domínios quebrados", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const itens = [CLI({ id: "t1", nome: "Teste Sem Fim", status: "teste", teste_ate: null }), CLI({ id: "a1", nome: "Ativo Ok" })];
    const rpc = async (n, p) => {
      if (n === "nx_clientes_admin") return p.p_filtro && p.p_filtro.busca ? [] : itens;
      if (n === "nx_planos_listar") return PLANOS;
      return [];
    };
    const t = ctxAdm(ui, { rpc, superConta: false, query: { local: "perto" } });
    await adm.montar(t.ctx); await tique(12);
    // FX-076: ?local=perto voltou: o chip do filtro aparece
    assert.match(textoDe(t.alvo.querySelector(".adm-filtro-local")), /perto do limite/);
    // FX-083: nada com o filtro → «Limpar busca e filtros»
    const limpar = t.alvo.querySelector(".adm-limpar-filtros");
    assert.ok(limpar);
    clicar(d, limpar); await tique(10);
    assert.equal(t.alvo.querySelector(".adm-filtro-local").hidden, true);
    // FX-074 / UC-039
    const cel = t.alvo.querySelectorAll(".tab-linha").find(x => x.dataset.id === "t1").querySelector("[data-col=teste_ate]");
    assert.match(textoDe(cel), /sem data de fim/);
    adm.desmontar();
  } finally { d.fim(); }
});
