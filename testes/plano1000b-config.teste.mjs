/* ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026), frente config (Configurações, Marca, Domínio, Plano e Admin) · lote config-1.
   Rodar: node --test testes/plano1000b-config.teste.mjs
   (a) lógica pura nova (config.js / admin.js); (b) Configurações — hub, Perfil, Usuários, Marca, Domínio, Plano; (c) Admin — lista, detalhe,
   revendas, planos, domínios. Comportamento num DOM de mentira (o do plano1000-automacoes, com fase de CAPTURA nos eventos, que a guarda
   da gaveta da marca usa). Cada teste cita o item (UB-xxx). Sem rede: as RPCs são dublês com o formato das migrações. Datas relativas ao
   relógio (ui.hojeSP / Date.now), nada preso à hora do dia. */
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

/* ================================================================== (a) lógica pura */

test("UB-178 + UB-098 + UB-106 + UB-263 + UB-100 + UB-259: lógica nova das Configurações", () => {
  // UB-178: a mesma régua do tema.js (10 a 15 dígitos fora do Brasil), com uma frase só
  assert.equal(CFG.suporteWaValido("+35112345678").ok, true);
  assert.deepEqual(T.validarMarca({ suporte_wa: "35112345678" }, false).filter(e => e.campo === "suporte_wa"), [], "o tema.js aceita o mesmo número");
  const curto = CFG.suporteWaValido("+123456789");
  assert.equal(curto.ok, false, "9 dígitos: antes passava aqui e sumia no marcaEfetiva");
  assert.equal(curto.erro, CFG.ERRO_SUPORTE_WA);
  assert.equal(T.marcaEfetiva({ suporte_wa: "123456789" }, {}).suporte_wa, null, "é o que o tema.js faria com ele");
  // UB-098
  assert.equal(CFG.formatarArmazenamento(1536.237), "1,5 GB");
  assert.equal(CFG.formatarArmazenamento(12.345678), "12,3 MB");
  assert.equal(CFG.formatarArmazenamento(null), "0 MB");
  // UB-106 / UB-263
  assert.equal(CFG.normalizarHost("  HTTPS://Crm.X.com.br/caminho?x=1 "), "crm.x.com.br");
  assert.equal(CFG.normalizarHost("crm.x.com.br:443"), "crm.x.com.br");
  assert.equal(CFG.erroHostDominio("crm.x.com.br", "orbita-nexus-ads.netlify.app"), null);
  assert.match(CFG.erroHostDominio("orbita-nexus-ads.netlify.app", "orbita-nexus-ads.netlify.app"), /Netlify/);
  assert.match(CFG.erroHostDominio("outro-site.netlify.app", "crm.agencia.com.br"), /Netlify/);
  assert.match(CFG.erroHostDominio("crm.agencia.com.br", "crm.agencia.com.br"), /já está aberto/);
  assert.match(CFG.erroHostDominio("crm", ""), /Use algo como/);
  // UB-100: mês atual e os dois anteriores; o mais antigo fica «parcial» quando a série começa depois do dia 1
  const serie = [{ dia: "2026-07-18", chamadas: 1 }, { dia: "2026-08-03", chamadas: 4 }, { dia: "2026-09-10", chamadas: 2 }, { dia: "2026-10-01", chamadas: 5 }, { dia: "2026-10-14", chamadas: 1 }];
  const m = CFG.usoIAPorMes(serie, "2026-10-15");
  assert.deepEqual(m.map(x => [x.mes, x.chamadas]), [["2026-10", 6], ["2026-09", 2], ["2026-08", 4]]);
  assert.equal(m[0].rotulo, "outubro de 2026");
  assert.equal(m[2].parcial, false, "a série começa em julho: agosto está inteiro");
  assert.equal(CFG.usoIAPorMes([{ dia: "2026-08-20", chamadas: 1 }], "2026-10-15")[2].parcial, true);
  assert.equal(CFG.usoIAPorMes({}, "2026-10-15"), null);
  // UB-259: quem grava (pela api.ehLeitura quando existe; senão pelo nome)
  assert.equal(CFG.rpcGrava({}, "nx_usuario_salvar"), true);
  assert.equal(CFG.rpcGrava({}, "nx_onboarding_estado"), false);
  assert.equal(CFG.rpcGrava({ ehLeitura: n => n === "nx_x_salvar" }, "nx_x_salvar"), false, "api.ehLeitura vence o nome");
  // UB-264
  assert.equal(CFG.GERENCIAR_USO.usuarios.href, "#/config/usuarios");
  assert.equal(CFG.GERENCIAR_USO.canais.href, "#/config/numeros");
});

test("UB-103 + UB-105 + UB-110 + UB-112 + UB-114 + UB-115 + UB-203 + UB-265: lógica nova do Admin", () => {
  // UB-103: fórmula de planilha sai como texto
  const csv = ADM.csvClientes([{ nome: "=1+1", slug: "+x", status: "ativo", org: { nome: "@rev" } }, { nome: "-2", slug: "ok" }]);
  const linhas = csv.split("\r\n");
  assert.ok(linhas[1].startsWith("'=1+1;'+x;'@rev;"), linhas[1]);
  assert.ok(linhas[2].startsWith("'-2;ok;"), linhas[2]);
  assert.ok(!/(^|;)=1\+1/.test(csv), "nenhuma célula começa com =");
  // UB-105
  assert.equal(ADM.contagem(1, "cliente", "clientes"), "1 cliente");
  assert.equal(ADM.contagem(3, "cliente", "clientes"), "3 clientes");
  assert.equal(ADM.contagem(undefined, "usuário", "usuários"), "0 usuários");
  // UB-110
  const p = { limites: { usuarios: 5 }, modulos: ["crm", "conversas"] };
  assert.equal(ADM.mudouLimitesOuModulos(p, { limites: { usuarios: 5 }, modulos: ["conversas", "crm"] }), false);
  assert.equal(ADM.mudouLimitesOuModulos(p, { limites: { usuarios: 4 }, modulos: ["crm", "conversas"] }), true);
  assert.equal(ADM.mudouLimitesOuModulos(p, { limites: {}, modulos: ["crm", "conversas"] }), true, "virar «sem limite» também muda");
  assert.equal(ADM.mudouLimitesOuModulos(p, { limites: { usuarios: 5 }, modulos: ["crm", "conversas", "ads"] }), true);
  assert.equal(ADM.contarClientesDoPlano([{ plano: "essencial" }, { plano: "pro" }, { plano: "essencial" }], "essencial"), 2);
  // UB-112
  assert.equal(ADM.diasDeTesteValidos(14), 14);
  assert.equal(ADM.diasDeTesteValidos("90"), 90);
  for (const v of [0, 91, 120, "", null, "abc", 2.5]) assert.equal(ADM.diasDeTesteValidos(v), null, String(v));
  // UB-114 / UB-115
  assert.equal(ADM.rotuloCoresRevenda({ primaria: "#111111", secundaria: "#222222", fundo: "#333333" }), "Cores: primária #111111, secundária #222222, fundo #333333");
  assert.deepEqual(ADM.statusRevenda("cancelado"), ["Cancelada", "ruim"]);
  assert.deepEqual(ADM.statusRevenda("suspenso"), ["Suspensa", "aten"]);
  assert.deepEqual(ADM.statusRevenda("ativo"), ["Ativa", "ok"]);
  // UB-203
  const os = [{ id: "o1", slug: "rev-a", nome: "Rev A" }, { id: "o2", slug: "rev-b", nome: "Rev B" }];
  assert.equal(ADM.slugDeRevendaTomado(os, "REV-A", null).nome, "Rev A");
  assert.equal(ADM.slugDeRevendaTomado(os, "rev-a", "o1"), null, "o próprio endereço não conta");
  // UB-265
  assert.equal(ADM.hashDominios({ status: "pendente", busca: "crm x" }), "#/admin/dominios?status=pendente&busca=crm+x");
  assert.equal(ADM.hashDominios({}), "#/admin/dominios");
});

test("UB-182 + UB-183 + UB-086 + UB-221 (CSS): «do limite» em rem, seletor de modelo com 44 px, buraco da grade de senha some no celular", () => {
  const css = ler("web/app/config.css");
  assert.match(css, /\.adm-anel-sub \{[^}]*font-size: var\(--fs-12\)/);
  assert.doesNotMatch(css, /\.adm-anel-sub \{[^}]*font-size: 10px/);
  assert.match(css, /\.adm-modelo-sel \{ min-height: 44px; \}/);
  assert.match(css, /@media \(max-width: 760px\) \{ \.form-grade-quebra \{ display: none; \} \}/);
  assert.match(css, /\.cfg-us-mais > summary \{[^}]*min-height: 44px/);
  assert.doesNotMatch(css.slice(css.indexOf("plano 1000b (lote config-1)")), /#[0-9a-fA-F]{3,8}\b/, "só tokens");
  for (const f of ["web/app/config.js", "web/app/admin.js"]) {
    const novos = ler(f).split("\n").filter(l => /plano 1000b/.test(l)).join("\n");
    assert.doesNotMatch(novos, /#[0-9a-fA-F]{6}\b/, `${f}: nada de cor em hex nas linhas novas`);
  }
});

/* ================================================================== (b) Configurações */

test("UB-081 + UB-082 + UB-259 + UB-260 hub: Enter abre a 1ª seção achada; escolher a seção limpa a busca; selo com texto para leitor e conferido de novo depois de gravar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => (n === "nx_onboarding_estado" ? { itens: [{ id: "colega_convidado", feito: false }] } : n === "nx_usuarios_listar" ? { usuarios: [], convites: [], departamentos: [] } : n === "nx_perfil_salvar" ? { ok: true } : {}) });
    await cfg.montar(t.ctx); await tique(10);
    const nav = t.ctx.alvo.querySelector("nav.cfg-lista");
    const onb = () => t.chamadas.filter(c => c[0] === "nx_onboarding_estado").length;
    assert.equal(onb(), 1);
    // UB-260: o link mantém título E descrição; o número é decoração e o leitor ouve «, 1 passo pendente»
    const us = nav.querySelector("a.cfg-nav-item[data-secao=usuarios]");
    assert.equal(us.getAttribute("aria-label"), null, "o aria-label não apaga mais a descrição da seção");
    assert.equal(us.querySelector(".cfg-pend").getAttribute("aria-hidden"), "true");
    assert.equal(textoDe(us.querySelector(".cfg-pend-sr")), ", 1 passo pendente");
    assert.match(textoDe(us), /Usuários e convites.*Quem entra e com qual papel.*1 passo pendente/);
    // UB-081: Enter na busca abre a 1ª seção visível
    const busca = nav.querySelector(".cfg-busca-inp");
    digitar(d, busca, "senha");
    const clicados = [];
    nav.addEventListener("click", ev => clicados.push(ev.target.getAttribute("href")));
    const enter = new d.Evento("keydown", { key: "Enter" });
    busca.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.deepEqual(clicados, ["#/config/perfil"]);
    // UB-082: o shell monta a seção pedida → o menu volta completo
    t.ctx.rota.partes = ["perfil"];
    await cfg.montar(t.ctx); await tique(6);
    assert.equal(busca.value, "");
    assert.equal(nav.querySelectorAll("a.cfg-nav-item").filter(a => a.hidden).length, 0, "nenhum item escondido");
    // UB-259: só navegar não pede o checklist de novo; depois de GRAVAR (salvar o perfil) e trocar de seção, o selo é conferido de novo
    t.ctx.rota.partes = ["usuarios"]; await cfg.montar(t.ctx); await tique(6);
    assert.equal(onb(), 1, "AS-080 continua: navegar usa o mesmo estado");
    t.ctx.rota.partes = ["perfil"]; await cfg.montar(t.ctx); await tique(6);
    const form = t.ctx.alvo.querySelector(".cfg-sec form");
    form.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_perfil_salvar").length, 1);
    t.ctx.rota.partes = ["usuarios"]; await cfg.montar(t.ctx); await tique(10);
    assert.equal(onb(), 2, "gravou: o checklist é lido de novo");
    assert.equal(nav.querySelectorAll(".cfg-pend").length, 1, "o selo é redesenhado (não duplica)");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-083 + UB-084 + UB-085 + UB-086 + UB-087 + UB-196 + UB-197 + UB-198 Perfil", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    let caso = "ok";
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => {
      if (n === "nx_sessoes_encerrar") throw Object.assign(new Error("Sem conexão. Tente de novo em instantes."), { codigo: "sem_conexao" });
      if (n === "nx_senha_trocar") return { ok: true };
      return caso === "ok" ? { ok: true } : {};
    } });
    t.ctx.shell.recarregarSessao = async () => { throw new Error("sessão não releu"); };
    await cfg.montar(t.ctx); await tique(8);
    const raiz = t.ctx.alvo;
    const [formDados, formSenha] = raiz.querySelectorAll(".cfg-sec form");
    // UB-196 / UB-197
    assert.match(textoDe(formDados.querySelector("[data-campo=telefone]")), /Para avisos do sistema a você; clientes não veem\./);
    assert.match(textoDe(formDados.querySelector("[data-campo=email_ro]")), /Para trocar o e-mail, peça a um administrador\./);
    // UB-083: salvou; a releitura falhou → só o toast de sucesso
    formDados.dispatchEvent(new d.Evento("submit")); await tique(8);
    assert.deepEqual(t.toasts.map(x => x[1].tipo), ["ok"]);
    assert.equal(t.toasts[0][0], "Dados salvos.");
    // UB-085: medidor de força na senha nova; UB-086: a célula vazia tem a classe que o CSS esconde no celular
    assert.ok(formSenha.querySelector("[data-campo=nova] .medidor"), "medidor na senha nova");
    assert.ok(formSenha.querySelector("span.form-grade-quebra[aria-hidden=true]"));
    // UB-084: nova = atual → erro inline, sem servidor
    formSenha.querySelector("input[name=atual]").value = "senhaAntiga1";
    formSenha.querySelector("input[name=nova]").value = "senhaAntiga1";
    formSenha.querySelector("input[name=nova2]").value = "senhaAntiga1";
    formSenha.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.match(textoDe(formSenha.querySelector("[data-campo=nova] .campo-erro")), /Use uma senha diferente da atual\./);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_senha_trocar").length, 0);
    // UB-087: título honesto
    assert.ok(raiz.querySelectorAll("h2").some(x => textoDe(x) === "Sessões em outros aparelhos"));
    assert.ok(!raiz.querySelectorAll("h2").some(x => textoDe(x) === "Aparelhos conectados"));
    // UB-198: o erro não repete «Tente de novo»
    clicar(d, botaoTexto(raiz, /Sair de todos os aparelhos/)); await tique(8);
    const erro = t.toasts.at(-1);
    assert.equal(erro[1].tipo, "erro");
    assert.equal(erro[0], "Não deu para encerrar as sessões dos outros aparelhos. Sem conexão. Tente de novo em instantes.");
    assert.equal((erro[0].match(/Tente de novo/g) || []).length, 1);
    cfg.desmontar();
  } finally { d.fim(); }
});

function equipe(n = 9, extra = {}) {
  const usuarios = Array.from({ length: n }, (_, i) => ({ conta_id: `u${i}`, nome: i === 1 ? "Bruno Reis" : `Pessoa ${String(i).padStart(2, "0")}`, email: `p${i}@x.com`,
    papel: "atendente", editavel: true, departamentos: [], ver_todas: false, recebe_conversas: true }));
  return { usuarios, convites: [], departamentos: [{ id: "d1", nome: "Recepção" }], uso: 2, limite: 5, ...extra };
}

test("UB-088 + UB-089 + UB-090 + UB-091 Usuários: interruptor mantém filtro e foco e não aceita toque duplo; «Aplicar» sem mudança não salva; link de senha pede confirmação", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    let dados = equipe();
    const resp = adiado();
    const menus = [];
    const t = ctxCfg(ui, { partes: ["usuarios"], confirmar: async () => false,
      extraUi: { menu: (b, itens) => menus.push(itens), flutuante: (b, el) => { d.doc.body.appendChild(el); return { fechar() { el.remove(); } }; } },
      rpc: async (n, p) => {
        if (n === "nx_usuarios_listar") return dados;
        if (n === "nx_usuario_salvar") { await resp.p; dados = { ...dados, usuarios: dados.usuarios.map(u => (u.conta_id === p.p_usuario.conta_id ? { ...u, ...p.p_usuario } : u)) }; return dados; }
        return {};
      } });
    await cfg.montar(t.ctx); await tique(6);
    const raiz = t.ctx.alvo;
    digitar(d, raiz.querySelector(".cfg-us-busca-inp"), "bruno"); await esperar(220);
    assert.doesNotMatch(textoDe(raiz.querySelector(".cfg-us-tab")), /Pessoa 05/);
    const sw = raiz.querySelector("#sw-ver_todas-u1");
    sw.checked = true; sw.dispatchEvent(new d.Evento("change"));
    sw.dispatchEvent(new d.Evento("change"));          // UB-089: 2º toque antes da resposta
    assert.equal(sw.disabled, true); assert.equal(sw.getAttribute("aria-busy"), "true");
    resp.ok(); await tique(8);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_usuario_salvar").length, 1, "um toque, uma chamada");
    // UB-088: o filtro continua e o foco volta ao mesmo interruptor
    assert.equal(raiz.querySelector(".cfg-us-busca-inp").value, "bruno");
    assert.doesNotMatch(textoDe(raiz.querySelector(".cfg-us-tab")), /Pessoa 05/);
    assert.equal(d.doc.activeElement.id, "sw-ver_todas-u1");
    assert.equal(d.doc.activeElement.checked, true);
    // UB-090: abrir os departamentos e «Aplicar» sem mexer → nenhuma chamada
    const btDep = raiz.querySelectorAll("button").find(b => /^Departamentos de Bruno Reis/.test(b.getAttribute("aria-label") || ""));
    clicar(d, btDep);
    clicar(d, botaoTexto(d.doc.body, /^Aplicar$/)); await tique(4);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_usuario_salvar").length, 1, "Aplicar sem mudança não chama");
    // UB-091: «Gerar link de nova senha» pede confirmação (Cancelar → nada criado)
    clicar(d, raiz.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Ações para Bruno Reis"));
    await menus.at(-1)[0].fn(); await tique(4);
    assert.match(t.confirmacoes.at(-1).titulo, /^Gerar um link de nova senha para Bruno Reis\?/);
    assert.match(t.confirmacoes.at(-1).texto, /24 horas/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_senha_link_criar").length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-092 + UB-093 + UB-199 Usuários: revogar não pisca a tabela; ajuda do papel ligada ao seletor; «Enviar pela central» sem o token no endereço", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const dados = equipe(2, { uso: 5, limite: 5, convites: [{ id: "cv1", papel: "atendente", nome: "Carla", expira_em: new Date(Date.now() + 86400e3).toISOString() }] });
    const abertos = [];
    const t = ctxCfg(ui, { partes: ["usuarios"],
      extraUi: { modal: async o => { const corpo = ui.h("div", null, o.corpo); const el = ui.h("div", null, corpo, ui.h("footer", { class: "modal-rod" })); abertos.push({ o, corpo }); await o.acoes[1].fn({ corpo, el, fechar() {} }); return null; } },
      rpc: async (n, p) => (n === "nx_usuarios_listar" ? dados : n === "nx_convite_revogar" ? { ok: true } : n === "nx_convite_criar" ? { link: "#/convite/TOKEN-SECRETO-123", expira_em: new Date(Date.now() + 3 * 86400e3).toISOString(), _p: p } : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const raiz = t.ctx.alvo;
    const tab = raiz.querySelector(".cfg-us-tab");
    assert.equal(botaoTexto(raiz, /^Convidar$/).disabled, true, "5 de 5");
    clicar(d, botaoTexto(raiz, /^Revogar$/)); await tique(8);
    assert.ok(raiz.querySelector(".cfg-us-tab") === tab && tab.isConnected, "a tabela é a mesma (não foi redesenhada nem trocada pelo esqueleto)");
    assert.equal(t.chamadas.filter(c => c[0] === "nx_usuarios_listar").length, 1, "sem recarregar tudo");
    assert.match(textoDe(raiz.querySelector(".cfg-conv-lista")), /Nenhum convite aguardando\./);
    assert.match(textoDe(raiz), /4 de 5 usuários do plano/);
    assert.equal(botaoTexto(raiz, /^Convidar$/).disabled, false, "a vaga voltou");
    assert.equal(raiz.querySelector("#cfg-us-limite"), null);
    // UB-093 + UB-199
    clicar(d, botaoTexto(raiz, /^Convidar$/)); await tique(8);
    const corpo = abertos[0].corpo;
    const formConv = abertos[0].o.corpo;          // o formulário (a ação primária já trocou o corpo pelo link)
    const ajuda = formConv.querySelector("p.campo-ajuda[id^=ajuda-papel-]");
    assert.ok(ajuda);
    assert.ok((formConv.querySelector("select[name=papel]").getAttribute("aria-describedby") || "").split(" ").includes(ajuda.id));
    const central = botaoTexto(corpo, /Enviar pela central/);
    assert.ok(central, "o convite oferece a central");
    clicar(d, central); await tique(4);
    assert.deepEqual(t.navegou, ["#/conversas"]);
    assert.ok(!t.navegou.join(" ").includes("TOKEN-SECRETO-123"), "o token não vai para o endereço (histórico)");
    assert.match(t.copiados.at(-1)[0], /TOKEN-SECRETO-123/, "vai pela área de transferência");
    assert.match(t.copiados.at(-1)[1].aviso, /cole no campo/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-221 Usuários no celular: «Vê colegas», «Rodízio» e «Acesso» num «Mais» recolhido", async () => {
  const d = comDom({ celular: true });
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["usuarios"], rpc: async n => (n === "nx_usuarios_listar" ? equipe(2) : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const raiz = t.ctx.alvo;
    const mais = raiz.querySelectorAll("details.cfg-us-mais");
    assert.equal(mais.length, 2, "um por pessoa");
    assert.ok(mais[0].querySelector("#sw-ver_todas-u0") && mais[0].querySelector("#sw-recebe_conversas-u0"));
    assert.match(textoDe(mais[0]), /Mais.*Vê colegas.*Rodízio.*Acesso.*Nunca entrou/);
    assert.equal(raiz.querySelectorAll("th").filter(th => /Vê colegas|Rodízio/.test(textoDe(th))).length, 0, "sem as colunas soltas");
    cfg.desmontar();
  } finally { d.fim(); }
});

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

test("UB-094 + UB-095 + UB-178 + UB-200 + UB-261 + UB-262 Marca", async () => {
  const d = comDom();
  try {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const m = await abrirMarcaOrg(d, { marca: { logo } });
    const raiz = m.raiz;
    const bt = botaoTexto(raiz, /Salvar marca/);
    // UB-261: sem mudança, o botão continua alcançável (não disabled) e o clique diz o porquê
    assert.equal(bt.disabled, false);
    assert.equal(bt.getAttribute("aria-disabled"), "true");
    clicar(d, bt); await tique(4);
    assert.match(m.toasts.at(-1)[0], /^Nada para salvar/);
    assert.equal(m.salvos.length, 0);
    // UB-200: digitar sem mudar o contraste não reescreve os avisos (região viva)
    const avisos = raiz.querySelector(".avisos-marca");
    const primeiroAviso = avisos.firstChild;
    const estado = raiz.querySelector(".marca-estado");
    digitar(d, raiz.querySelector("[name=login_titulo]"), "Bem-vindo");
    assert.ok(avisos.firstChild === primeiroAviso, "o aviso de contraste é o mesmo nó");
    const noEstado = estado.firstChild;
    digitar(d, raiz.querySelector("[name=login_titulo]"), "Bem-vindo!");
    assert.ok(estado.firstChild === noEstado, "«Alterações ainda não salvas.» não é reescrita a cada tecla");
    assert.equal(bt.getAttribute("aria-disabled"), "false");
    // UB-095: texto fixo + aria-pressed
    const btApp = botaoTexto(raiz, /Ver no app inteiro/);
    clicar(d, btApp);
    assert.equal(btApp.getAttribute("aria-pressed"), "true");
    assert.match(textoDe(btApp), /Ver no app inteiro/);
    clicar(d, btApp);
    // UB-094 + UB-178: produto vazio e WhatsApp curto → foco no 1º erro; a frase do WhatsApp é uma só
    digitar(d, raiz.querySelector("[name=produto]"), "");
    digitar(d, raiz.querySelector("[name=suporte_wa]"), "+123456789");
    clicar(d, bt); await tique(4);
    assert.ok(d.doc.activeElement === raiz.querySelector("[name=produto]"), "foco no primeiro erro (Nome do produto)");
    assert.equal(textoDe(raiz.querySelector("[data-campo=suporte_wa] .campo-erro")), CFG.ERRO_SUPORTE_WA);
    assert.equal(m.salvos.length, 0);
    // UB-262: remover o logo oferece «Desfazer», que devolve a imagem
    const amostra = raiz.querySelector(".logo-amostra");
    assert.ok(amostra.querySelector("img"));
    clicar(d, botaoTexto(amostra.parentNode, /Remover/));
    assert.equal(amostra.querySelector("img"), null);
    const aviso = m.toasts.at(-1);
    assert.equal(aviso[1].acao.rotulo, "Desfazer");
    aviso[1].acao.fn(); await tique(2);
    assert.equal(amostra.querySelector("img").getAttribute("src"), logo);
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-096 + UB-097 + UB-263 Domínio: sem «Nexus» no cartão; aberto por domínio próprio não vira destino do CNAME; o endereço do app é recusado", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const ctx = { ui: { ...ui, confirmar: async () => false }, api: { mensagemErro: String }, shell: { marcaEfetiva: () => ({ suporte_wa: "5512999998888" }) } };
    const velho = new Date(Date.now() - 6 * 86400e3).toISOString();
    globalThis.location = { hostname: "crm.agencia.com.br", hash: "#/config/dominio" };
    const c1 = cfg.cartaoDominio(ctx, { host: "app.cliente.com.br", status: "pendente", criado_em: velho, dns: { valor: null } }, {});
    const txt = textoDe(c1);
    assert.doesNotMatch(txt, /Nexus/, txt);
    assert.match(txt, /a plataforma informa/);
    assert.match(txt, /Peça à plataforma o destino/);
    assert.ok(!txt.includes("→ crm.agencia.com.br"), "o domínio próprio aberto não vira destino");
    assert.match(textoDe(c1.querySelector(".dom-avisar")), /Avisar o suporte/);
    globalThis.location = { hostname: "orbita-nexus-ads.netlify.app", hash: "#/config/dominio" };
    assert.match(textoDe(cfg.cartaoDominio(ctx, { host: "app.cliente.com.br", status: "pendente", dns: {} }, {})), /app\.cliente\.com\.br → orbita-nexus-ads\.netlify\.app/);
    // UB-263: cadastrar o próprio endereço do app → erro na linha, sem servidor
    const t = ctxCfg(ui, { partes: ["dominio"], conta: { id: "c1", papel: "gestor", nome: "G" }, rpc: async n => (n === "nx_dominios_listar" ? [] : {}) });
    await cfg.montar(t.ctx); await tique(8);
    const form = t.ctx.alvo.querySelector(".cfg-sec form");
    form.querySelector("input[name=host]").value = "https://orbita-nexus-ads.netlify.app/app/";
    form.dispatchEvent(new d.Evento("submit")); await tique(4);
    assert.match(textoDe(form.querySelector("[data-campo=host] .campo-erro")), /Netlify, não um domínio próprio/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_dominio_salvar").length, 0);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-098 + UB-099 + UB-100 + UB-264 Plano e uso: mídia em GB; limite 0 é «não incluído» e fica fora do aviso; IA por mês; «Gerenciar» leva à tela certa", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const hoje = ui.hojeSP();
    const serie = [{ dia: hoje, chamadas: 7, tokens_in: 0, tokens_out: 0, custo_usd: 0 }];
    const t = ctxCfg(ui, { partes: ["plano"], rpc: async n => {
      if (n === "nx_uso_plano") return { plano: { nome: "Essencial" }, status: "ativo", uso: { usuarios: 1, ia_mes: 0, canais: 1 }, limites: { usuarios: 5, ia_mes: 0, canais: 1 }, modulos: ["crm", "conversas"], storage_mb: 1536.237 };
      if (n === "nx_ia_uso_dia") return serie;
      return {};
    } });
    t.ctx.shell.marcaEfetiva = () => ({});
    await cfg.montar(t.ctx); await tique(10);
    const raiz = t.ctx.alvo;
    assert.match(textoDe(raiz.querySelector(".plano-storage")), /Mídia guardada: 1,5 GB/);
    const fora = raiz.querySelector(".uso-fora");
    assert.match(textoDe(fora), /Sugestões de IA neste mês.*não incluído no plano/);
    assert.equal(fora.querySelector("[role=meter]"), null, "sem barra cheia «0 / 0»");
    const aviso = textoDe(raiz.querySelector(".aviso.aviso-ruim"));
    assert.match(aviso, /No limite do plano: números de WhatsApp\./);
    assert.doesNotMatch(aviso, /IA/, "o recurso fora do plano não entra no aviso");
    const ir = raiz.querySelectorAll("a.cfg-uso-ir").map(a => a.getAttribute("href"));
    assert.ok(ir.includes("#/config/usuarios") && ir.includes("#/config/numeros"), ir.join(","));
    assert.ok(ir.includes("#/automacoes"), "com o módulo, Automações também leva à tela");
    assert.equal(raiz.querySelector(".uso-fora .cfg-uso-ir"), null, "recurso fora do plano não tem «Gerenciar»");
    // UB-100
    const hist = raiz.querySelector(".cfg-ia-hist");
    await hist.pronto;
    assert.equal(hist.querySelectorAll("li").length, 3);
    assert.match(textoDe(hist.querySelectorAll("li")[0]), /\(até hoje\).*7 chamadas/);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_ia_uso_dia")[1], { p_dias: 90 });
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== (c) Admin */

test("UB-116 + UB-117 + UB-118 + UB-225 Admin → lista: espera a folha; busca sem esqueleto; resumo pedido uma vez; 50 linhas e «Mostrar mais»", async () => {
  const d = comDom();
  const salvo = { history: globalThis.history, location: globalThis.location };
  globalThis.history = { state: null, replaceState() {} };
  globalThis.location = { hash: "#/admin/clientes?busca=a", hostname: "app.x" };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const muitos = Array.from({ length: 120 }, (_, i) => CLI({ id: `c${i}`, nome: `Cliente ${i}`, slug: `c${i}` }));
    let travaBusca = null, travaResumo = adiado();
    const css = adiado();
    const t = ctxAdm(ui, { query: { busca: "a" }, superConta: false, extraUi: { carregarCss: () => css.p },
      rpc: async (n, p) => {
        if (n === "nx_planos_listar") return PLANOS;
        if (n === "nx_clientes_admin") {
          if (!p.p_filtro.busca) { await travaResumo.p; return muitos; }      // o resumo (sem busca)
          if (travaBusca) await travaBusca.p;
          return muitos;
        }
        return [];
      } });
    const p = adm.montar(t.ctx); await tique(4);
    // UB-116: nada desenhado antes da folha chegar
    assert.equal(t.alvo.childNodes.length, 0, "espera a config.css");
    css.ok(true); await p; await tique(6);
    const lista = () => t.alvo.querySelector(".tab-falsa");
    // UB-225
    assert.equal(lista().querySelectorAll(".tab-linha").length, 50);
    const chamadasLista = t.chamadas.filter(c => c[0] === "nx_clientes_admin").length;
    clicar(d, botaoTexto(t.alvo, /Mostrar mais/)); await tique(2);
    assert.equal(lista().querySelectorAll(".tab-linha").length, 100);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_clientes_admin").length, chamadasLista, "paginação local: sem nova chamada");
    // UB-117: digitar mantém a tabela (aria-busy) até a resposta
    travaBusca = adiado();
    const busca = t.alvo.querySelector("input[type=search]");
    const antes = lista();
    digitar(d, busca, "cli"); await esperar(350);
    assert.ok(lista() === antes, "a tabela não some");
    assert.ok(!t.alvo.querySelectorAll("*").some(e => /esqueleto/.test(e.getAttribute("class") || "")), "sem esqueleto");
    assert.equal(antes.parentNode.getAttribute("aria-busy"), "true");
    // UB-118: mais buscas antes de o resumo chegar não repetem a lista inteira
    digitar(d, busca, "clie"); await esperar(350);
    digitar(d, busca, "clien"); await esperar(350);
    travaBusca.ok(); await tique(6);
    const resumos = t.chamadas.filter(c => c[0] === "nx_clientes_admin" && !c[1].p_filtro.busca && !c[1].p_filtro.id);
    assert.equal(resumos.length, 1, "um resumo só");
    travaResumo.ok(); await tique(6);
    assert.equal(lista().querySelectorAll(".tab-linha").length, 50, "busca nova volta à 1ª página");
    adm.desmontar();
  } finally { globalThis.history = salvo.history; globalThis.location = salvo.location; if (salvo.history === undefined) delete globalThis.history; if (salvo.location === undefined) delete globalThis.location; d.fim(); }
});

test("UB-104 Admin: nx_saude com erro mostra «Não deu para conferir» com «Tentar de novo»", async () => {
  const d = comDom();
  const salvo = { history: globalThis.history, location: globalThis.location };
  globalThis.history = { state: null, replaceState() {} };
  globalThis.location = { hash: "#/admin/clientes", hostname: "app.x" };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    let falhar = true;
    const t = ctxAdm(ui, { rpc: async n => {
      if (n === "nx_saude") { if (falhar) throw Object.assign(new Error("Erro 500 no servidor."), { codigo: "http_500" }); return { problemas: [], envios_pausados: false, clientes_pausados: 0 }; }
      return n === "nx_clientes_admin" ? [CLI()] : n === "nx_planos_listar" ? PLANOS : [];
    } });
    await adm.montar(t.ctx); await tique(8);
    const caixa = t.alvo.querySelector(".adm-saude");
    assert.equal(caixa.hidden, false, "o cartão não some");
    assert.match(textoDe(caixa), /Não deu para conferir a saúde da operação agora\. Erro 500/);
    falhar = false;
    clicar(d, botaoTexto(caixa, /Tentar de novo/)); await tique(8);
    assert.match(textoDe(caixa), /Operação em ordem/);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_saude").length, 2);
    adm.desmontar();
  } finally { globalThis.history = salvo.history; globalThis.location = salvo.location; if (salvo.history === undefined) delete globalThis.history; if (salvo.location === undefined) delete globalThis.location; d.fim(); }
});

test("UB-112 + UB-113 Admin → novo cliente: nenhum pacote marcado; dias de teste com data final e erro fora de 1–90", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const forms = [];
    const t = ctxAdm(ui, { modal: async o => { forms.push(o.corpo); d.doc.body.appendChild(o.corpo); return null; },
      rpc: async n => (n === "nx_clientes_admin" ? [CLI()] : n === "nx_planos_listar" ? PLANOS : n === "nx_orgs_listar" ? [] : []) });
    await adm.montar(t.ctx); await tique(6);
    clicar(d, t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Novo cliente")); await tique(8);
    const form = forms[0];
    assert.equal(form.querySelectorAll("input[name=pacote_comercial]").filter(r => r.checked).length, 0, "nenhum pacote marcado");
    const dias = form.querySelector("input[name=dias]");
    assert.match(textoDe(form.querySelector(".adm-teste-fim")), /^Termina em \d{2}\/\d{2}\/\d{4}\.$/);
    const fim14 = ui.dataBR(ADM.isoMais(ui.hojeSP(), 14));
    assert.equal(textoDe(form.querySelector(".adm-teste-fim")), `Termina em ${fim14}.`);
    digitar(d, dias, "120");
    assert.match(textoDe(form.querySelector("[data-campo=dias] .campo-erro")), /Use de 1 a 90 dias\./);
    assert.equal(textoDe(form.querySelector(".adm-teste-fim")), "");
    digitar(d, dias, "7");
    assert.equal(textoDe(form.querySelector("[data-campo=dias] .campo-erro")), "");
    assert.equal(textoDe(form.querySelector(".adm-teste-fim")), `Termina em ${ui.dataBR(ADM.isoMais(ui.hojeSP(), 7))}.`);
    adm.desmontar();
  } finally { d.fim(); }
});

test("UB-102 + UB-226 + UB-201 + UB-202 + UB-109 + UB-111 + UB-120 + UB-267 + UB-268 Admin → detalhe do cliente", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    const { modal } = modalQueRoda(d, ui);
    let resposta = false;
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], modal, confirmar: async () => resposta,
      rpc: async (n, p) => {
        if (n === "nx_clientes_admin") return [CLI({ status: "teste", teste_ate: null })];
        if (n === "nx_planos_listar") return PLANOS;
        if (n === "nx_usuarios_listar") return { usuarios: [], convites: [] };
        if (n === "nx_convite_criar") return { id: "cvN", link: "https://app.x/#/convite/abc", expira_em: new Date(Date.now() + 3 * 86400e3).toISOString() };
        if (n === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { ...CLI(), ...p.p_cliente, limites: { usuarios: 9 }, uso: undefined }; }
        if (n === "nx_ia_uso_dia") return [{ dia: "2026-10-08", chamadas: 2, tokens_in: 100, tokens_out: 10, custo_usd: 0.01 }];
        return [];
      } });
    let falharEntrar = true;
    t.ctx.shell.escolherCliente = async () => { if (falharEntrar) throw new Error("Sessão expirou."); };
    await adm.montar(t.ctx); await tique(10);
    const raiz = t.alvo;
    // UB-102: falha ao entrar vira toast e o botão volta
    const entrar = botaoTexto(raiz, /^Entrar$/);
    clicar(d, entrar); await tique(6);
    assert.match(t.toasts.at(-1)[0], /Não deu para entrar na Alfa\. Sessão expirou\./);
    assert.equal(entrar.disabled, false);
    assert.deepEqual(t.navegou, []);
    // UB-226: «Ver números» entra e abre a seção de números
    falharEntrar = false;
    clicar(d, botaoTexto(raiz, /Ver números/)); await tique(6);
    assert.deepEqual(t.navegou, ["#/config/numeros"]);
    // UB-201 + UB-202: validade escolhida (padrão 3) e o convite entra na lista na hora
    assert.equal(raiz.querySelector(".adm-convites"), null);
    clicar(d, botaoTexto(raiz, /Gerar convite do administrador/)); await tique(8);
    const cv = t.chamadas.find(c => c[0] === "nx_convite_criar");
    assert.equal(cv[1].p_dados.dias, 3);
    assert.match(textoDe(raiz.querySelector(".adm-convites")), /1 convite aguardando/);
    // UB-120: a ajuda do interruptor é curta
    assert.ok(textoDe(raiz.querySelector(".adm-ativo .campo-ajuda")).split(" ").length <= 20);
    // UB-267: a guarda de rota só pergunta com o formulário mexido
    const guarda = t.guardas.at(-1);
    assert.equal(await guarda({ motivo: "rota" }), true, "sem mudança: sai direto");
    // UB-109: «Em teste» sem data ganha hoje + 14; apagar a data é erro ao salvar
    // (o <select> do DOM de mentira não deriva o value das <option selected>: a tela é posta em «Em teste» como a pessoa faria)
    raiz.querySelector("select[name=plano]").value = "essencial";
    const selSt = raiz.querySelector("select[name=status]");
    selSt.value = "teste"; selSt.dispatchEvent(new d.Evento("change"));
    const inpTeste = raiz.querySelector("input[name=teste_ate]");
    assert.equal(inpTeste.value, ADM.isoMais(ui.hojeSP(), 14));
    assert.equal(await guarda({ motivo: "rota" }), false, "mexido + Cancelar: fica");
    assert.match(t.confirmacoes.at(-1).titulo, /Sair sem salvar Alfa\?/);
    inpTeste.value = "";
    const form = raiz.querySelector(".adm-det form");
    form.dispatchEvent(new d.Evento("submit")); await tique(6);
    assert.match(textoDe(form.querySelector("[data-campo=teste_ate] .campo-erro")), /Informe até quando vai o teste\./);
    assert.equal(salvos.length, 0);
    // UB-111: salvar com limite novo redesenha as barras (e o uso que a resposta não traz continua)
    inpTeste.value = ADM.isoMais(ui.hojeSP(), 10);
    form.dispatchEvent(new d.Evento("submit")); await tique(8);
    assert.equal(salvos.length, 1);
    assert.match(textoDe(raiz.querySelector(".adm-det .adm-uso")), /1 \/ 9/);
    assert.equal(await guarda({ motivo: "rota" }), true, "depois de salvar, o que está na tela é o salvo");
    // UB-268: a revenda vê que o custo é em dólar; a plataforma não precisa
    const caixaG = adm.usoIAPorDia({ ui, api: { rpc: async () => [{ dia: "2026-10-08", chamadas: 1, tokens_in: 1, tokens_out: 1, custo_usd: 0.01 }], mensagemErro: String }, sessao: { conta: { papel: "gestor" } } }, { id: "c1" });
    await caixaG.pronto;
    assert.match(textoDe(caixaG.querySelector(".adm-ia-dolar")), /Custo estimado em dólar \(cotação do dia não aplicada\)/);
    const caixaS = adm.usoIAPorDia({ ui, api: { rpc: async () => [{ dia: "2026-10-08", chamadas: 1, tokens_in: 1, tokens_out: 1, custo_usd: 0.01 }], mensagemErro: String }, sessao: { conta: { super: true } } }, { id: "c1" });
    await caixaS.pronto;
    assert.equal(caixaS.querySelector(".adm-ia-dolar"), null);
    adm.desmontar();
  } finally { d.fim(); }
});

test("UB-105 + UB-114 + UB-115 + UB-119 + UB-203 Admin → revendas", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const corpos = [];
    let falharPlanos = false;
    const t = ctxAdm(ui, { partes: ["revendas"], pronto: true, modal: async o => { corpos.push(o); d.doc.body.appendChild(o.corpo); return null; },
      rpc: async n => {
        if (n === "nx_orgs_listar") return [{ id: "plat", tipo: "plataforma", nome: "Nexus", slug: "nexus", empresas: 1, usuarios: 1, marca: {} },
          { id: "o2", tipo: "revenda", nome: "Rev Cancelada", slug: "rev-c", status: "cancelado", empresas: 0, usuarios: 0, canais: 0, limites: {}, marca: { cores: { primaria: "#C9A227" } } }];
        if (n === "nx_planos_listar") { if (falharPlanos) throw new Error("Sem conexão."); return PLANOS; }
        return [];
      } });
    t.ctx.shell.tema = T;
    await adm.montar(t.ctx); await tique(8);
    const raiz = t.alvo;
    assert.match(textoDe(raiz.querySelector(".rev-plat")), /plataforma · 1 cliente · 1 usuário/);
    const rev = raiz.querySelector(".rev-cartao");
    assert.match(textoDe(rev.querySelector(".pilula")), /^Cancelada$/);
    const cores = rev.querySelector(".rev-cores");
    assert.equal(cores.getAttribute("role"), "img");
    assert.match(cores.getAttribute("aria-label"), /^Cores: primária #C9A227, secundária #[0-9A-F]{6}, fundo #[0-9A-F]{6}$/i);
    // UB-119: lista de planos falhou → aviso e «Criar revenda» desligado (planos em cache: zera pela recarga da tela)
    falharPlanos = true;
    adm.desmontar(); d.doc.body.removeChild(t.alvo);
    const t2 = ctxAdm(ui, { partes: ["revendas"], pronto: true, modal: async o => { corpos.push(o); d.doc.body.appendChild(o.corpo); return null; },
      rpc: async n => { if (n === "nx_orgs_listar") return [{ id: "o2", tipo: "revenda", nome: "Rev A", slug: "rev-a", status: "ativo", limites: {}, marca: {} }]; if (n === "nx_planos_listar") throw new Error("Sem conexão."); return []; } });
    t2.ctx.shell.tema = T;
    await adm.montar(t2.ctx); await tique(8);
    clicar(d, t2.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Nova revenda")); await tique(8);
    const o = corpos.at(-1);
    assert.match(textoDe(o.corpo.querySelector(".adm-planos-falha")), /Não deu para carregar os planos: Sem conexão\./);
    assert.equal(o.acoes.find(a => a.tipo === "primario").desabilitado, true);
    assert.equal(await o.acoes.find(a => a.tipo === "primario").fn(), false, "nem pelo código salva");
    // UB-203: endereço de outra revenda avisado enquanto digita
    digitar(d, o.corpo.querySelector("input[name=slug]"), "rev-a"); await esperar(380);
    const aviso = o.corpo.querySelector("[data-campo=slug] .adm-slug-tomado");
    assert.equal(aviso.hidden, false);
    assert.match(textoDe(aviso), /Esse endereço já é da revenda «Rev A»/);
    adm.desmontar();
  } finally { d.fim(); }
});

test("UB-204 Admin → marca da revenda: fechar a gaveta com mudança não salva pergunta antes", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    let resposta = false;
    const t = ctxAdm(ui, { partes: ["revendas"], pronto: true, confirmar: async () => resposta,
      rpc: async n => (n === "nx_orgs_listar" ? [{ id: "o2", tipo: "revenda", nome: "Rev A", slug: "rev-a", status: "ativo", limites: {}, marca: { produto: "Rev" } }] : n === "nx_planos_listar" ? PLANOS : []) });
    Object.assign(t.ctx.shell, { tema: T, marcaOrg: () => ({}), pintarMarca() {}, aplicarMarcaCliente() {}, recarregarMarca: async () => {} });
    t.ctx.paleta = [];
    await adm.montar(t.ctx); await tique(8);
    clicar(d, botaoTexto(t.alvo, /^Marca$/)); await tique(20);
    const gav = d.doc.body.querySelector("dialog.gaveta");
    assert.ok(gav, "a gaveta abriu");
    assert.ok(gav.querySelector("[name=produto]"), "o editor montou");
    // sem mudança: o X fecha direto
    // com mudança: pergunta (Cancelar fica)
    digitar(d, gav.querySelector("[name=produto]"), "Rev Nova");
    clicar(d, gav.querySelector(".gaveta-x")); await tique(4);
    assert.match(t.confirmacoes.at(-1).titulo, /Fechar sem salvar a marca\?/);
    await esperar(260);
    assert.ok(gav.isConnected, "Cancelar: a gaveta fica");
    const esc = new d.Evento("keydown", { key: "Escape" });
    gav.dispatchEvent(esc); await tique(4);
    assert.equal(esc.defaultPrevented, true, "Esc também pergunta");
    assert.equal(t.confirmacoes.length, 2);
    resposta = true;
    clicar(d, gav.querySelector(".gaveta-voltar")); await tique(4);
    await esperar(260);
    assert.equal(gav.isConnected, false, "confirmou: fecha");
    adm.desmontar();
  } finally { d.fim(); }
});

test("UB-110 + UB-266 Admin → planos: mudar limite diz quantos clientes afeta; cartão mexido pergunta ao sair", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    let resposta = false;
    const t = ctxAdm(ui, { partes: ["planos"], pronto: true, confirmar: async () => resposta,
      rpc: async (n, p) => {
        if (n === "nx_planos_listar") return PLANOS.map(x => ({ ...x }));
        if (n === "nx_clientes_admin") return [CLI({ id: "a" }), CLI({ id: "b" }), CLI({ id: "c", plano: "pro" })];
        if (n === "nx_plano_salvar") return { ...p.p_plano };
        return [];
      } });
    await adm.montar(t.ctx); await tique(8);
    const guarda = t.guardas.at(-1);
    assert.equal(await guarda({ motivo: "rota" }), true, "nada mexido");
    const cartao = t.alvo.querySelector(".plano-cartao");
    digitar(d, cartao.querySelector("input[name=lim_usuarios]"), "6");
    assert.equal(await guarda({ motivo: "rota" }), false, "mexido + Cancelar: fica");
    assert.match(t.confirmacoes.at(-1).titulo, /Sair sem salvar o plano\?/);
    cartao.querySelector("form").dispatchEvent(new d.Evento("submit")); await tique(8);
    assert.equal(t.confirmacoes.at(-1).titulo, "Afeta 2 clientes");
    assert.equal(t.chamadas.filter(c => c[0] === "nx_plano_salvar").length, 0, "Cancelar não salva");
    resposta = true;
    cartao.querySelector("form").dispatchEvent(new d.Evento("submit")); await tique(10);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_plano_salvar").length, 1);
    resposta = false;
    assert.equal(await guarda({ motivo: "rota" }), true, "salvou e recarregou: nada pendente");
    // só o nome (sem limite nem módulo): salva sem a pergunta
    const n0 = t.confirmacoes.length;
    const c2 = t.alvo.querySelector(".plano-cartao");
    digitar(d, c2.querySelector("input[name=nome]"), "Essencial 2");
    c2.querySelector("form").dispatchEvent(new d.Evento("submit")); await tique(10);
    assert.equal(t.confirmacoes.length, n0);
    adm.desmontar();
  } finally { d.fim(); }
});

test("UB-106 + UB-107 + UB-108 + UB-205 + UB-265 Admin → domínios: endereço limpo, domínio raiz pergunta, filtro no endereço", async () => {
  const d = comDom();
  const salvo = { history: globalThis.history, location: globalThis.location };
  const trocas = [];
  globalThis.history = { state: null, replaceState: (s, t, u) => trocas.push(u) };
  globalThis.location = { hash: "#/admin/dominios?status=pendente", hostname: "orbita-nexus-ads.netlify.app" };
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    let hostModal = "";
    const { modal } = modalQueRoda(d, ui, { antes: (o, m) => { m.corpo.querySelector("input[name=host]").value = hostModal; } });
    const t = ctxAdm(ui, { partes: ["dominios"], query: { status: "pendente" }, pronto: true, modal, confirmar: async () => false,
      rpc: async (n, p) => {
        if (n === "nx_dominios_listar") return [{ host: "a.x.com.br", status: "pendente" }, { host: "b.x.com.br", status: "ativo" }];
        if (n === "nx_dominio_salvar") { salvos.push(p); return [{ host: p.p_host, status: "pendente" }]; }
        return [];
      } });
    await adm.montar(t.ctx); await tique(10);
    const sel = t.alvo.querySelector("select[aria-label='Filtrar por situação']");
    // UB-265: o filtro vem do endereço e volta para ele
    assert.equal(sel.value, "pendente");
    assert.equal(t.alvo.querySelectorAll(".dom-item").length, 1);
    sel.value = "ativo"; sel.dispatchEvent(new d.Evento("change"));
    assert.equal(trocas.at(-1), "#/admin/dominios?status=ativo");
    // UB-106: «https://Crm.X.com.br/» vira crm.x.com.br
    hostModal = "https://Crm.X.com.br/";
    clicar(d, t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Novo domínio")); await tique(10);
    assert.equal(salvos.at(-1).p_host, "crm.x.com.br");
    // UB-107: domínio raiz pergunta; Cancelar não cadastra
    hostModal = "agencia.com.br";
    clicar(d, t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Novo domínio")); await tique(10);
    assert.match(t.confirmacoes.at(-1).titulo, /domínio raiz/);
    assert.equal(salvos.length, 1);
    adm.desmontar();
    // UB-108 + UB-205: domínio do cliente no detalhe
    d.doc.body.removeChild(t.alvo);
    const t2 = ctxAdm(ui, { partes: ["clientes", "c1"], pronto: true, confirmar: async () => false,
      rpc: async (n, p) => {
        if (n === "nx_clientes_admin") return [CLI()];
        if (n === "nx_planos_listar") return PLANOS;
        if (n === "nx_usuarios_listar") return { usuarios: [], convites: [] };
        if (n === "nx_dominios_listar") return [];
        if (n === "nx_dominio_salvar") { salvos.push(p); return []; }
        return [];
      } });
    await adm.montar(t2.ctx); await tique(10);
    const inp = t2.alvo.querySelector("form.dom-add input");
    assert.equal(inp.getAttribute("placeholder"), "crm.empresadocliente.com.br");
    inp.value = "HTTPS://Crm.Y.com.br";
    t2.alvo.querySelector("form.dom-add").dispatchEvent(new d.Evento("submit")); await tique(10);
    assert.deepEqual(salvos.at(-1), { p_host: "crm.y.com.br", p_cliente: "c1" });
    inp.value = "cliente.com.br";
    t2.alvo.querySelector("form.dom-add").dispatchEvent(new d.Evento("submit")); await tique(10);
    assert.match(t2.confirmacoes.at(-1).titulo, /domínio raiz/);
    assert.equal(salvos.length, 2, "Cancelar não cadastra o raiz");
    adm.desmontar();
  } finally { globalThis.history = salvo.history; globalThis.location = salvo.location; if (salvo.history === undefined) delete globalThis.history; if (salvo.location === undefined) delete globalThis.location; d.fim(); }
});

/* ================================================================== revisão 1000b */
test("UB-122 (revisão 1000b) · «Salvar marca» é botão de escrita (data-escrita): sem internet o shell avisa antes do clique", async () => {
  assert.match(ler("web/app/app.js"), /const SEL_ESCRITA = "[^"]*\[data-escrita\]/);
  const d = comDom();
  try {
    const m = await abrirMarcaOrg(d);
    const bt = botaoTexto(m.raiz, /Salvar marca/);
    assert.ok(bt, "o botão existe");
    assert.notEqual(bt.getAttribute("data-escrita"), null, "antes: type=button fora de form/.modal-rod escapava do SEL_ESCRITA");
    m.cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-176 (revisão 1000b) · a <section> das Configurações tem nome acessível (aria-labelledby → título da seção aberta)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const t = ctxCfg(ui, { partes: ["perfil"], rpc: async n => (n === "nx_perfil" ? { nome: "Ana", email: "ana@x.com" } : {}) });
    await cfg.montar(t.ctx); await tique(6);
    const nomeDe = () => {
      const sec = t.ctx.alvo.querySelector("section.cfg-sec");
      const id = sec.getAttribute("aria-labelledby");
      assert.ok(id, "antes: a section não tinha nome (não vira região)");
      const alvos = t.ctx.alvo.querySelectorAll(`#${id}`);
      assert.equal(alvos.length, 1, "um só elemento com o id");
      assert.ok(sec.contains(alvos[0]));
      return textoDe(alvos[0]);
    };
    assert.match(nomeDe(), /Perfil|Seus dados/);
    t.ctx.rota.partes = ["usuarios"]; await cfg.montar(t.ctx); await tique(6);
    assert.match(nomeDe(), /Usuários/, "a seção nova leva o nome dela (o hub é reaproveitado)");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("UB-209 (revisão 1000b) · detalhe do cliente no Admin: os cartões que ainda carregam não repetem «Carregando…»", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const nunca = new Promise(() => {});
    const t = ctxAdm(ui, { partes: ["clientes", "c1"], pronto: true,
      rpc: async n => {
        if (n === "nx_clientes_admin") return [CLI()];
        if (n === "nx_planos_listar") return PLANOS;
        if (n === "nx_usuarios_listar" || n === "nx_ia_uso_dia" || n === "nx_dominios_listar") return nunca;
        return [];
      } });
    await adm.montar(t.ctx); await tique(10);
    assert.ok(t.alvo.querySelectorAll(".sk-item").length >= 2, "o cartão de usuários ainda carrega (esqueleto na tela)");
    const falam = t.alvo.querySelectorAll("[role=status]").filter(e => /Carregando/.test(textoDe(e)));
    assert.equal(falam.length, 0, "antes: usuários, uso de IA e domínios anunciavam «Carregando…» cada um");
    adm.desmontar();
  } finally { d.fim(); }
});
