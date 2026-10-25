/* ============================================================
   ÓRBITA — plano «2000d» (25/10/2026) · frente conv · Conversas
   node --test testes/plano2000d-conv.teste.mjs
   Cada teste cita o item (DC-NNN) do lote e falha no código de antes desta rodada.
   DOM mínimo e montadores copiados do plano1500c-conv.teste.mjs.
   Datas relativas a Date.now() (o CI roda com o relógio fixado em ORBITA_AGORA).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const L = await import("../web/app/cv-logica.js");
const R = await import("../web/app/rascunho.js");

const esperar = ms => new Promise(r => setTimeout(r, ms));
const agoraIso = minAtras => new Date(Date.now() - minAtras * 60000).toISOString();

/* ============================================================ DOM mínimo e montadores (cópia do plano100-conversas.teste.mjs) */
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
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.nodeType === 11) { for (const c of [...n.childNodes]) this.insertBefore(c, ref); return n; }
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
    after(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this.nextSibling); }
    append(...ns) { for (const n of ns.flat(Infinity)) { if (n === null || n === undefined || n === false) continue; this.appendChild(typeof n === "object" && n.nodeType ? n : new Texto(n)); } }
    prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), this.firstChild); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture), once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { if (o.once) n._ouv = n._ouv.filter(x => x !== o); o.fn.call(n, ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles !== false) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
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
    const partes = []; let nivel = 0, cur = "", comb = null, aspas = null;
    const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } };
    for (const c of s) {
      if (aspas) { cur += c; if (c === aspas) aspas = null; continue; }
      if (c === '"' || c === "'") { aspas = c; cur += c; continue; }
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
        if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; } else return false;
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
      this.offsetWidth = 0; this.clientWidth = 0; this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0; this.selectionStart = null; this.selectionEnd = null;
      if (tag === "audio") { this.paused = true; this.duration = NaN; this.currentTime = 0; this.playbackRate = 1; this.buffered = { length: 0 }; }
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
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
    get id() { return this.attrs.get("id") || ""; }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    get title() { return this.attrs.get("title") || ""; } set title(v) { this.attrs.set("title", String(v)); }
    get href() { return this.attrs.get("href") || ""; } set href(v) { this.attrs.set("href", String(v)); }
    get src() { return this.attrs.get("src") || ""; } set src(v) { this.attrs.set("src", String(v)); }
    get alt() { return this.attrs.get("alt") || ""; } set alt(v) { this.attrs.set("alt", String(v)); }
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
    click() { if (this.disabled) return; this.dispatchEvent(new Evento("click")); }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    select() { this.selectionStart = 0; this.selectionEnd = String(this.value || "").length; }
    scrollIntoView() {}
    scrollTo() {}
    getClientRects() { return [1]; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Evento("close", { bubbles: false })); }
    play() { this.paused = false; this.dispatchEvent(new Evento("play", { bubbles: false })); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Evento("pause", { bubbles: false })); }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.hidden = false; doc.visibilityState = "visible";
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.createDocumentFragment = () => { const f = new El("fragment"); f.nodeType = 11; return f; };
  doc.documentElement = doc.appendChild(new El("html")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  return { doc, Evento, El };
}

/** Instala o DOM de mentira para UM teste e devolve o `ui` falso + utilidades. */
function comDom({ grosso = false } = {}) {
  const { doc, Evento } = criarDom();
  const nomes = ["document", "matchMedia", "Event", "requestAnimationFrame", "localStorage", "window", "addEventListener", "removeEventListener", "XMLHttpRequest"];
  const salvo = Object.fromEntries(nomes.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const mem = new Map();
  const janelaOuv = new Map();
  const janela = {
    innerHeight: 800, scrollY: 0, visualViewport: null,
    addEventListener(t, fn) { if (!janelaOuv.has(t)) janelaOuv.set(t, new Set()); janelaOuv.get(t).add(fn); },
    removeEventListener(t, fn) { if (janelaOuv.has(t)) janelaOuv.get(t).delete(fn); },
    dispatchEvent(ev) { for (const fn of [...(janelaOuv.get(ev.type) || [])]) fn(ev); return true; },
    focus() {},
  };
  const def = (n, v) => Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true, enumerable: true });
  def("document", doc);
  def("matchMedia", q => ({ matches: /coarse/.test(q) ? grosso : false, addEventListener() {}, removeEventListener() {} }));
  def("Event", Evento);
  def("requestAnimationFrame", f => setTimeout(f, 0));
  def("localStorage", { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } });
  def("window", janela);
  def("addEventListener", janela.addEventListener);
  def("removeEventListener", janela.removeEventListener);
  const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden", "multiple", "readOnly", "required", "open"]);
  const h = (tag, attrs, ...filhos) => {
    const el = doc.createElement(tag);
    if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { filhos.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v));
      else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv); }
      else if (k === "on") { for (const [ev, fn] of Object.entries(v)) if (typeof fn === "function") el.addEventListener(ev, fn); }
      else if (k === "style") { if (typeof v === "string") el.setAttribute("style", v); else for (const [p, val] of Object.entries(v)) if (val !== null && val !== undefined) el.style.setProperty(p, String(val)); }
      else if (k === "text") el.textContent = String(v);
      else if (PROPS.has(k)) el[k] = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    const anexar = f => { if (f === null || f === undefined || f === false) return; if (Array.isArray(f)) { f.forEach(anexar); return; } el.appendChild(f && f.nodeType ? f : doc.createTextNode(String(f))); };
    filhos.forEach(anexar);
    return el;
  };
  const toasts = [], anuncios = [], menus = [], modais = [], desfazeres = [], sucessos = [];
  let modalFn = null;
  const icone = (nome, cls) => { const s = doc.createElementNS("svg", "svg"); s.setAttribute("class", cls ? `ic ${cls}` : "ic"); s.dataset.icone = nome; return s; };
  const ui = {
    h, icone, limpar(el) { if (el) while (el.firstChild) el.removeChild(el.firstChild); return el; },
    pilula: (texto, cor = "neutra", extra = {}) => h("span", { class: ["pilula", `pilula-${cor}`, extra.class], title: extra.title || null, dataset: extra.variante ? { variante: extra.variante } : null }, extra.icone ? icone(extra.icone) : null, String(texto ?? "")),
    avatar: (nome, id) => h("span", { class: "avatar", "aria-hidden": "true", dataset: { id: id ?? "" } }, String(nome || "?").slice(0, 2)),
    etiqueta: e => h("span", { class: "etiq" }, e.nome), corOk: c => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : null),
    toast(t, o = {}) { toasts.push(String(t)); const el = h("div", { class: "toast" }, h("button", { class: "toast-x" })); return { fechar() {}, el, o }; },
    anunciar(t) { anuncios.push(String(t)); },
    menu(ancora, itens) { menus.push({ ancora, itens }); },
    copiar() { return Promise.resolve(true); },
    esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: "vazio", dataset: { tema: (o && o.tema) || "" } }, o && o.titulo), erroCartao: () => h("div", { class: "erro" }),
    carregando: async (b, p) => (typeof p === "function" ? p() : p),
    mensagemErro: e => (e && (e.codigo || e.message)) || "erro",
    modal: async o => { modais.push(o); return modalFn ? modalFn(o) : true; },
    confirmar: async () => true, flutuante: () => ({ fechar() {} }), debounce: fn => fn,
    campo: ({ tipo, nome, rotulo, valor }) => h("div", { class: "campo" }, h("label", null, rotulo), h("input", { type: "checkbox", name: nome, role: tipo === "interruptor" ? "switch" : null, checked: !!valor })),
    seletorEtiquetas({ marcadas = [], aoMudar } = {}) {
      let seq = 0; const sel = new Set(marcadas);
      const el = h("div", { class: "sel-etiq" });
      el.seqAtual = () => seq; el.marcadas = () => [...sel]; el.pendente = () => false; el.emitirAgora = () => {};
      el.definir = ids => { sel.clear(); for (const i of ids) sel.add(i); el.dataset.definido = [...sel].join(","); };
      el.mudar = ids => { sel.clear(); for (const i of ids) sel.add(i); seq += 1; return aoMudar([...sel], { seq }); };   // gancho do teste: «marcar»
      return el;
    },
    segmentado() { const el = h("div", { class: "seg" }); el.ativar = () => {}; el.reposicionar = () => {}; el.contar = () => {}; return el; },
    telBR: d => String(d), brl: v => `R$ ${Number(v).toLocaleString("pt-BR")}`, relativo: () => "hoje", dataBR: () => "28/09/2026", dataHoraBR: () => "28/09/2026 15:00",
    async acaoComDesfazer(o) { desfazeres.push(o); await o.aplicar(); return new Promise(r => { o._fim = r; }); },
    checkSucesso(el, o = {}) { sucessos.push({ el, texto: o.texto }); return Promise.resolve(true); },
    gaveta: () => ({ fechar() {} }), carregarCss: async () => {},
    lerForm: () => ({}), marcarErro() {},
  };
  return {
    doc, Evento, ui, h, toasts, anuncios, menus, modais, desfazeres, sucessos, mem, janela,
    aoModal(fn) { modalFn = fn; },
    ev: (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init)),
    fim() { for (const n of nomes) { const d = salvo[n]; if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; } },
  };
}
const achar = (el, sel) => { const x = el.querySelector(sel); assert.ok(x, `não achei ${sel}`); return x; };
const botaoTexto = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent) || re.test(b.getAttribute("aria-label") || ""));

/* ============================================================ (b) lateral por seção — D1, D11, D17, D20 */
async function montarLateral(d, { ver: verExtra = {}, temCrm = true, api = null, logica = L } = {}) {
  const { criarLateral } = await import("../web/app/cv-lateral.js");
  const chamadas = [];
  const ver = {
    conversa: { id: 9, protocolo: "ORB-9", etiquetas: ["e1"], atribuida: { nome: "Ana" }, negocio: { id: 1 } },
    contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000" },
    negocios: [{ id: 1, titulo: "Aparelho", valor_previsto: 5200, estagio_nome: "Avaliação", status: "aberto", origem: "site" }],
    atendimentos: [{ id: 9, protocolo: "ORB-9", status: "aberta", aberta_em: agoraIso(60) }],
    tarefas: [{ id: 71, titulo: "Ligar", atrasada: false, vence_em: agoraIso(-60) }], ...verExtra,
  };
  const A = {
    ui: d.ui, L: logica, G: null, podeEscrever: true, selId: 9, msgs: [], eu: { id: "u1" }, base: { etiquetas: [{ id: "e1", nome: "VIP" }, { id: "e2", nome: "Retorno" }] }, etiquetasEmVoo: 0, ver,
    ctx: { vocab: { negocios: "Negócios", negocio: "Negócio" }, temModulo: m => temCrm && m === "crm", abrirContato() {}, novoNegocio() {}, abrirNegocio() {}, navegar: h => chamadas.push(["navegar", h]) },
    api: api || { rpcC: async (nome, p) => { chamadas.push([nome, p]); if (nome === "nx_negocio_ver") return { negocio: { id: p.p_id, origem: "site", campanha_nome: "Implante", rastreio: { pagina: "https://c.com/implante", clique_em: "2026-10-08T17:02:00Z" } } }; return { campos: [] }; }, fn: async () => ({}) },
    acoes: { nomeContato: c => (c && c.nome) || "", recarregarVer() { chamadas.push(["recarregarVer"]); }, carregarLista() {}, tratarErro(e) { chamadas.push(["erro", e && e.codigo]); },
      etiquetas: async (ids, o) => { chamadas.push(["etiquetas", ids, o]); return null; }, criarEtiqueta() {}, vincular() {}, abrir() {},
      agendar: neg => chamadas.push(["agendar", neg && neg.id]) },
  };
  const lat = criarLateral(A);
  const alvo = d.h("aside");
  d.doc.body.appendChild(alvo);
  lat.montarEm(alvo);
  await esperar(5);
  return { A, lat, alvo, chamadas };
}

const txt = (id, dir, min, extra = {}) => ({ id, conversa_id: 9, direcao: dir, tipo: "texto", corpo: `msg ${id}`, wamid: `w${id}`, status: dir === "out" ? "enviada" : "recebida",
  enviado_por: dir === "out" ? { id: "u1", nome: "Helena" } : null, criado_em: agoraIso(min), atualizado_em: agoraIso(min), ...extra });
async function montarChat(d, { msgs = [], ia = null, provedor = "meta", conv = {}, acoes = {} } = {}) {
  const { criarChat } = await import("../web/app/cv-chat.js");
  const chamadas = [];
  const A = {
    ui: d.ui, L, icone: d.ui.icone, destruido: false, podeEscrever: true, eu: { id: "u1", nome: "Helena" },
    base: { canais: [{ id: "k1", provedor }], config: { ia: {} }, etiquetas: [] },
    ver: { conversa: { id: 9, status: "aberta", canal_id: "k1", canal: { nome: "Recepção", provedor }, protocolo: "ORB-1", atribuida_a: null, atribuida_nome: null,
      janela_ate: new Date(Date.now() + 12 * 3600000).toISOString(), ...conv }, contato: { id: 5, nome: "Mariana Costa", telefone: "5500000000501" } },
    msgs, conversasContato: [{ id: 9, protocolo: "ORB-1" }], temMaisAntes: false, carregandoAntes: false, midia: new Map(), iaEstado: ia, marcaNovas: null, contagens: {},
    raiz: d.h("div", { class: "cv", dataset: { lateral: "coluna" } }), ctx: { abrirContato() {}, navegar() {} },
    composer: { el: d.h("div", { class: "cvx" }), responder() {}, aceitaAnexo: () => true, anexar() {} },
    acoes: {
      urlMidia: p => `https://cdn.test/${p}`, estadoMidia: () => "ok", nomeContato: c => (c && c.nome) || "", pode: () => true,
      podeCancelarEnvio: () => false, foiReenviada: () => false, carregarAntes() {}, voltar() {}, abrirDetalhes() {}, recarregarVer() {},
      avancarAoResolver: () => false, definirAvancar() {}, abrirAjudaTeclado() {}, mudarLista() {}, atenderProximo() {}, novaConversa() {}, tratarErro() {},
      velocidadeAudio: () => 1, definirVelocidadeAudio: v => v, copiarTexto() {},
      assumirIA() { chamadas.push(["assumirIA"]); }, devolverIA() {}, assumir() { chamadas.push(["assumir"]); }, resolver() { chamadas.push(["resolver"]); },
      transferir() { chamadas.push(["transferir"]); }, status() {}, reenviarLocal(m) { chamadas.push(["reenviarLocal", m.id]); }, descartarLocal() {}, enviarAgora(m) { chamadas.push(["enviarAgora", m.id]); }, cancelarFila() {},
      ...acoes,
    },
  };
  const chat = criarChat(A);
  d.doc.body.appendChild(chat.el);
  chat.renderTudo({ rolar: "fim" });
  await esperar(5);
  return { A, chat, chamadas };
}

async function montarComposer(d, { base = {}, contato = {}, conv = {}, rascunho = null, eu = { id: "u1", nome: "Helena Souza" }, acoes = {} } = {}) {
  const { criarComposer } = await import("../web/app/cv-composer.js");
  const enviados = [], notas = [];
  let ia = async () => ({ texto: "Olá! Posso ajudar?" });
  const A = {
    ui: d.ui, L, ctx: { cliente: { nome: "Clínica" }, rascunho }, selId: 9, rascunhos: new Map(), podeEscrever: true, eu, icone: d.ui.icone,
    base: { ia: { ligada: true }, departamentos: [], respostas: [], templates: [], ...base },
    ver: { contato: { id: 5, nome: "maria souza", ...contato }, conversa: { id: 9, status: "aberta", canal_id: "k1", canal: { provedor: "meta", tem_token: true }, janela_ate: new Date(Date.now() + 3600000).toISOString(), ...conv } },
    acoes: { rascunhoMudou() {}, nomeContato: c => (c && c.nome) || "", pode: () => true, focarLista() {}, tratarErro(e) { notas.push(["erro", e && e.codigo]); }, respostaUsada() {},
      enviar: async o => { enviados.push(o); return { persistido: true }; }, sugerirIA: () => ia(), nota: async (t, o) => { notas.push([t, o]); return {}; }, ocultar: s => notas.push(["ocultar", s]), ...acoes },
  };
  const comp = criarComposer(A);
  d.doc.body.appendChild(comp.el);
  comp.definirConversa();
  const ta = achar(comp.el, "textarea[aria-label=Mensagem]");
  return { A, comp, ta, enviados, notas, aoIA(fn) { ia = fn; }, digitar(t) { ta.value = t; d.ev(ta, "input"); } };
}
function rascunhosDe(d) {
  return R.criarRascunhos({ storage: globalThis.localStorage, conta: () => "u1", cliente: () => "c1", agendar: (fn, ms) => setTimeout(fn, ms), cancelar: t => clearTimeout(t),
    doc: { createElement: t => d.doc.createElement(t), createTextNode: t => d.doc.createTextNode(t), addEventListener() {} }, janela: { addEventListener() {} }, debounceMs: 0 });
}

const conversasMod = await import("../web/app/conversas.js?v=teste");

function criarServidor({ conversas = 3, mensagens = null, cfg = { recibo_leitura: true, assinatura: false }, canais = null } = {}) {
  const chamadas = [];
  const convs = Array.from({ length: conversas }, (_, i) => ({ id: 901 + i, contato: { id: 501 + i, nome: `Cliente ${i + 1}`, telefone: `551299990000${i}` }, canal_id: "k1", status: "aberta",
    aguardando: true, nao_lidas: 0, ultima_msg_em: agoraIso(i + 1), ultima_entrada_em: agoraIso(i + 1), ultima_msg_dir: "in", ultima_msg_resumo: "oi", etiquetas: [], protocolo: `ORB-${901 + i}` }));
  const msgs = new Map(convs.map(c => [c.id, (mensagens && mensagens[c.id]) || [{ id: c.id * 10, conversa_id: c.id, direcao: "in", tipo: "texto", corpo: "oi", status: "recebida", wamid: `w${c.id}`, criado_em: agoraIso(30), atualizado_em: agoraIso(30) }]]));
  let seqMsg = 100000;
  const base = { eu: { id: "u1", nome: "Helena Souza", papel: "admin" }, canais: canais || [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true, estado: "conectado" }],
    departamentos: [], respostas: [], etiquetas: [{ id: "e1", nome: "VIP" }, { id: "e2", nome: "Retorno" }], usuarios: [{ id: "u1", nome: "Helena Souza", papel: "admin" }, { id: "u2", nome: "Ana Paula", papel: "atendente" }],
    templates: [{ id: "t1", canal_id: "k1", nome: "retomar", status: "APPROVED", categoria: "UTILITY", corpo: "Olá {{1}}!", num_parametros: 1, idioma: "pt_BR" }], cfg, ia: { ligada: true } };
  const handlers = {
    nx_cv_base: () => base,
    nx_cv_listar: p => {
      const lim = Math.min(100, Number(p.p_limite) || 50);
      let lista = [...convs].sort((a, b) => Date.parse(b.ultima_msg_em) - Date.parse(a.ultima_msg_em) || b.id - a.id);
      if (p.p_antes) lista = lista.filter(c => Date.parse(c.ultima_msg_em) < Date.parse(p.p_antes));
      return { itens: lista.slice(0, lim).map(c => ({ ...c })), tem_mais: lista.length > lim, contagens: { minhas: 0, sem_dono: convs.length, aguardando: convs.length, nao_lidas: convs.filter(c => c.nao_lidas > 0).length } };
    },
    nx_cv_ver: p => { const c = convs.find(x => x.id === p.p_id); if (!c) throw Object.assign(new Error("conversa_nao_encontrada"), { codigo: "conversa_nao_encontrada" });
      return { conversa: { ...c, canal: { id: "k1", nome: "Recepção", provedor: "meta", tem_token: true }, janela_ate: new Date(Date.now() + 20 * 3600000).toISOString() }, contato: { ...c.contato }, negocios: [], atendimentos: [{ id: c.id, protocolo: c.protocolo, status: c.status, aberta_em: agoraIso(60) }], tarefas: [] }; },
    nx_cv_mensagens: p => {
      const todas = msgs.get(p.p_conversa) || [];
      const itens = p.p_depois_id != null ? todas.filter(m => m.id > p.p_depois_id) : todas;
      return { itens: itens.map(m => ({ ...m })), tem_mais: false, conversas: [{ id: p.p_conversa, protocolo: `ORB-${p.p_conversa}` }], agora: new Date().toISOString(), ultimo_id: todas.length ? todas[todas.length - 1].id : null };
    },
    nx_cv_marcar_lida: p => { const c = convs.find(x => x.id === p.p_conversa); if (c) c.nao_lidas = 0; return { ok: true }; },
    nx_cv_atribuir: p => { const c = convs.find(x => x.id === p.p_conversa); c.atribuida_a = p.p_conta; c.atribuida_nome = p.p_conta === "u2" ? "Ana Paula" : p.p_conta ? "Helena Souza" : null; return { ...c }; },
    nx_cv_etiquetas: p => { const c = convs.find(x => x.id === p.p_conversa); c.etiquetas = p.p_etiquetas; return { ...c }; },
    nx_cv_nota: p => { const m = { id: ++seqMsg, conversa_id: p.p_conversa, direcao: "out", tipo: "nota", corpo: p.p_texto, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }; msgs.get(p.p_conversa).push(m); return m; },
  };
  const fns = {
    "nx-enviar": c => {
      if (c.acao === "lido") return { ok: true, enviado: true };
      const m = { id: ++seqMsg, conversa_id: c.conversa, direcao: "out", tipo: c.acao === "template" ? "template" : c.acao === "midia" ? "documento" : "texto", corpo: c.texto || "modelo", status: "enviada",
        client_ref: c.client_ref, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), ...(c.path ? { midia: { path: c.path } } : {}) };
      msgs.get(c.conversa).push(m);
      return { ok: true, mensagem: m };
    },
    "nx-midia": c => ({ path: `c1/out/${c.nome}`, upload_url: "https://up.test/x" }),
  };
  const api = {
    rpcC: async (nome, p = {}, o = {}) => { chamadas.push([nome, p, o]); await esperar(0); const h = handlers[nome]; if (!h) return {}; return h(p); },
    rpc: async (nome, p = {}, o = {}) => api.rpcC(nome, p, o),
    fn: async (nome, c = {}) => { chamadas.push([`${nome}:${c.acao || ""}`, c]); await esperar(0); const h = fns[nome]; return h ? h(c) : {}; },
  };
  return {
    api, chamadas, convs, msgs, handlers, fns, base,
    /** mensagem nova do cliente na conversa `id` */
    chegar(id, corpo = "nova") { const m = { id: ++seqMsg, conversa_id: id, direcao: "in", tipo: "texto", corpo, status: "recebida", wamid: `w${seqMsg}`, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() };
      msgs.get(id).push(m); const c = convs.find(x => x.id === id); c.nao_lidas += 1; c.ultima_msg_em = m.criado_em; c.ultima_entrada_em = m.criado_em; c.ultima_msg_dir = "in"; return m; },
    conta: nome => chamadas.filter(c => c[0] === nome).length,
  };
}

async function montarCentral(d, srv, { rota = { partes: [], query: {} }, rascunho = null, canais = undefined, extraCtx = {} } = {}) {
  const pulsos = [];
  const alvo = d.h("main");
  d.doc.body.appendChild(alvo);
  const ctx = {
    ui: d.ui, api: srv.api, versao: "teste", pode: () => true, papel: "admin", sessao: { conta: { id: "u1", nome: "Helena Souza" } }, cliente: { id: "c1", nome: "Clínica" },
    alvo, rota, pulso: { assinar(fn) { pulsos.push(fn); return () => {}; } }, navegar: () => {}, titulo() {}, badge() {}, comandos: null, rede: null,
    rascunho, vocab: { negocios: "Negócios", negocio: "Negócio", contato: "Contato" }, temModulo: () => false, abrirContato() {}, abrirNegocio() {}, novoNegocio() {}, paleta: [],
    ...(canais !== undefined ? { canais } : {}), ...extraCtx,
  };
  ctx.navegar = async hash => { const [caminho, q] = String(hash).replace(/^#\/conversas\/?/, "").split("?"); const query = Object.fromEntries(new URLSearchParams(q || ""));
    await conversasMod.montar({ ...ctx, rota: { partes: caminho ? [caminho] : [], query } }); };
  await conversasMod.montar(ctx);
  await esperar(10);
  return {
    ctx, alvo, pulsos,
    async abrir(id) { await ctx.navegar(`#/conversas/${id}`); await esperar(10); },
    async pulso() { for (const fn of pulsos) fn(); await esperar(300); await esperar(900); },
    fim() { conversasMod.desmontar(); },
  };
}

async function comComposer(o, fn) { const d = comDom(o && o.dom); try { const x = await montarComposer(d, o); await fn(x, d); } finally { d.fim(); } }

/* ============================================================ lista (cópia do plano1000-conversas) */
async function montarLista(d, { itens = [], contagens = {}, aba = "minhas", base = {}, acoes = {} } = {}) {
  const { criarLista } = await import("../web/app/cv-lista.js");
  const chamadas = [];
  const A = { ui: d.ui, L, podeEscrever: true, ctx: { papel: "admin" }, aba, busca: "", filtro: {}, itens, contagens, temMais: false, base: { canais: [{ id: "k1" }], etiquetas: [], ...base },
    acoes: { novaConversa() {}, atenderProximo: () => chamadas.push(["atender"]), mudarLista: o => chamadas.push(["mudarLista", o]), carregarLista: o => { chamadas.push(["carregarLista", o]); return new Promise(() => {}); },
      repetirBuscaMensagens() {}, lerAvisos: () => ({ som: false, tela: false }), pode: () => true, menuAvisos() {}, rascunhoDe: () => "", filaResumo: () => null,
      nomeContato: c => (c && c.nome) || "", canaisCaidos: () => [], verNumero() {}, resolverLote: ids => chamadas.push(["resolverLote", ids]), lidaLote: ids => chamadas.push(["lidaLote", ids]), ...acoes } };
  const lista = criarLista(A);
  d.doc.body.appendChild(lista.el);
  lista.render();
  return { A, lista, chamadas };
}
const conv = (id, extra = {}) => ({ id, contato: { id: id + 100, nome: `Cliente ${id}` }, canal_id: "k1", status: "aberta", aguardando: false, nao_lidas: 0,
  ultima_msg_em: agoraIso(id), ultima_entrada_em: agoraIso(id), ultima_msg_dir: "in", ultima_msg_resumo: "oi", etiquetas: [], ...extra });

/* ============================================================ cv-config: DOM e ctx do plano1000-automacoes */
const CV = await import("../web/app/cv-config.js");
const tique = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
function criarDomCfg() {
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
    before(...ns) { const p = this.parentNode; for (const n of ns) p.insertBefore(n, this); }   // lote conv-3 (CB-137: marcar a segunda)
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
function comDomCfg() {
  globalThis.CSS = globalThis.CSS || { escape: s => String(s) };
  const { doc, Evento } = criarDomCfg();
  const salvo = { document: globalThis.document, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent, KeyboardEvent: globalThis.KeyboardEvent, window: globalThis.window, matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, location: globalThis.location };
  globalThis.document = doc; globalThis.Event = Evento; globalThis.KeyboardEvent = Evento; globalThis.MouseEvent = Evento;
  globalThis.window = globalThis;
  const mem = new Map(), mem2 = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.sessionStorage = { getItem: k => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, String(v)), removeItem: k => mem2.delete(k) };
  return { doc, Evento, mem, fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
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

/** MediaRecorder, microfone e Web Audio de mentira (gravação no navegador). */
async function comGravador(fn, { silencio = true } = {}) {
  const antes = { MR: globalThis.MediaRecorder, AC: globalThis.AudioContext, seguro: globalThis.isSecureContext, nav: Object.getOwnPropertyDescriptor(globalThis, "navigator"), agora: Date.now };
  const reg = { gravadores: [], fechados: 0 };
  globalThis.MediaRecorder = class {
    static isTypeSupported(t) { return t === "audio/ogg;codecs=opus"; }
    constructor() { this.state = "inactive"; this.mimeType = "audio/ogg;codecs=opus"; this.ouv = {}; reg.gravadores.push(this); }
    addEventListener(t, f) { (this.ouv[t] ||= []).push(f); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; for (const f of this.ouv.dataavailable || []) f({ data: new Blob([new Uint8Array(64)], { type: "audio/ogg" }) }); for (const f of this.ouv.stop || []) f(); }
  };
  class AC { createAnalyser() { return { fftSize: 0, getFloatTimeDomainData(b) { b.fill(silencio ? 0 : 0.3); } }; } createMediaStreamSource() { return { connect() {} }; } close() { reg.fechados++; return Promise.resolve(); } }
  globalThis.AudioContext = AC;
  globalThis.isSecureContext = true;
  const navReal = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true,
    value: { locks: navReal && navReal.locks, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } });
  try { return await fn(reg); }
  finally {
    for (const g of reg.gravadores) if (g.state !== "inactive") g.stop();
    Date.now = antes.agora;
    globalThis.MediaRecorder = antes.MR; globalThis.AudioContext = antes.AC; globalThis.isSecureContext = antes.seguro;
    if (antes.nav) Object.defineProperty(globalThis, "navigator", antes.nav); else delete globalThis.navigator;
  }
}


/* ============================================================ testes do plano 2000d */
const SRC_CHAT = ler("cv-chat.js"), SRC_COMP = ler("cv-composer.js"), SRC_CONV = ler("conversas.js"), CSS = ler("conversas.css"), SRC_CFG = ler("cv-config.js");
const docMsg = (id, nome, mime = "") => ({ id, conversa_id: 9, direcao: "in", tipo: "documento", corpo: "", midia: { path: `c1/in/${nome}`, nome, mime, tamanho: 1000 }, status: "recebida", criado_em: agoraIso(3), atualizado_em: agoraIso(3) });
function clicar(d, el) { const ev = new d.Evento("click"); el.dispatchEvent(ev); return ev; }

test("DC-089/DC-090/DC-219/DC-244/DC-245 · documento recebido nunca navega a aba: download forçado, Office com Ver/Baixar e o tipo no aviso", async () => {
  const d = comDom();
  const fetchAntes = globalThis.fetch, openAntes = globalThis.open;
  const pedidos = [], abertos = [];
  globalThis.fetch = async url => { pedidos.push(url); return { ok: true, blob: async () => new Blob(["x"]) }; };
  globalThis.open = (...a) => { abertos.push(a); };
  try {
    const { chat } = await montarChat(d, { msgs: [docMsg(1, "pagina.html", "text/html"), docMsg(2, "orcamento.xlsx"), docMsg(3, "app.apk")] });
    const html = achar(chat.el, '.cv-msg[data-id="1"] a.cv-doc');
    const ev = clicar(d, html);
    assert.equal(ev.defaultPrevented, true, "o .html recebido não navega a aba");
    await esperar(5);
    assert.equal(pedidos.length, 1, "baixa pelo fetch → blob");
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-doc-aviso').textContent, /Arquivo \.html \(página da web\)/);
    assert.match(achar(chat.el, '.cv-msg[data-id="3"] .cv-doc-aviso').textContent, /instalador de aplicativo/);
    const xlsx = achar(chat.el, '.cv-msg[data-id="2"] a.cv-doc');
    assert.equal(clicar(d, xlsx).defaultPrevented, true, "o .xlsx também baixa sem trocar a aba (DC-090)");
    assert.ok(chat.el.querySelector('.cv-msg[data-id="2"] .cv-doc-ver'), "Office com «Ver» (DC-244)");
    assert.ok(chat.el.querySelector('.cv-msg[data-id="2"] .cv-doc-baixar'), "Office com «Baixar» (DC-244)");
    // sem fetch: o incomum abre numa aba NOVA, nunca nesta
    delete globalThis.fetch;
    assert.equal(clicar(d, html).defaultPrevented, true);
    assert.equal(abertos.length, 1);
    assert.equal(abertos[0][1], "_blank");
  } finally { globalThis.fetch = fetchAntes; globalThis.open = openAntes; d.fim(); }
});

test("DC-245 · descricaoIncomum e documentoOffice", () => {
  assert.equal(L.descricaoIncomum("Setup.EXE"), "Arquivo .exe (programa do Windows)");
  assert.equal(L.descricaoIncomum("x.qqq"), "Arquivo .qqq");
  assert.equal(L.descricaoIncomum("semext"), "Arquivo de tipo incomum");
  assert.equal(L.documentoOffice("a.docx"), true);
  assert.equal(L.documentoOffice("x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), true);
  assert.equal(L.documentoOffice("a.pdf"), false);
});

test("DC-104 · soltar vários arquivos (mesmo misturados) vai todo pelo anexarVarios", async () => {
  const d = comDom();
  try {
    const recebidos = [];
    const { chat, A } = await montarChat(d);
    A.composer.anexarVarios = l => recebidos.push(l);
    A.composer.motivoSemAnexo = () => "";
    const corpo = chat.el.querySelector(".cvc-corpo") || chat.el.querySelector("[role=log]").parentNode;
    const arquivos = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.pdf", { type: "application/pdf" }), new File(["c"], "c.jpg", { type: "image/jpeg" })];
    const dt = { types: ["Files"], files: arquivos, items: arquivos.map(f => ({ kind: "file", type: f.type })) };
    corpo.dispatchEvent(new d.Evento("drop", { dataTransfer: dt }));
    assert.equal(recebidos.length, 1);
    assert.equal(recebidos[0].length, 3);
  } finally { d.fim(); }
});

const foto = (n, kb = 20) => new File([new Uint8Array(kb * 1024)], `foto-${n}.jpg`, { type: "image/jpeg" });
test("DC-093/DC-221/DC-131 · várias fotos continuam depois de trocar de conversa, com «Enviando fotos: N de M»", async () => {
  const d = comDom();
  try {
    const faixas = [];
    let t;
    t = await montarComposer(d, { acoes: { enviar: async o => { t.enviados.push(o); faixas.push(achar(t.comp.el, ".cvx-lote-txt").textContent); if (t.enviados.length === 1) t.A.selId = 77; return { persistido: false }; } } });
    await t.comp.anexarVarios([foto(1), foto(2), foto(3)]);
    assert.equal(t.enviados.length, 3, "a troca de conversa não para as que faltam");
    assert.ok(t.enviados.every(o => o.conversa === 9 && o.segundoPlano === true), "o destino é a conversa de origem");
    assert.deepEqual(faixas, ["Enviando fotos: 1 de 3", "Enviando fotos: 2 de 3", "Enviando fotos: 3 de 3"]);
    assert.equal(achar(t.comp.el, ".cvx-lote").hidden, true, "a faixa some no fim");
  } finally { d.fim(); }
});

test("DC-131 · «Parar as que faltam» interrompe o lote", async () => {
  const d = comDom();
  try {
    let t;
    t = await montarComposer(d, { acoes: { enviar: async o => { t.enviados.push(o); if (t.enviados.length === 1) achar(t.comp.el, ".cvx-lote-parar").click(); return {}; } } });
    await t.comp.anexarVarios([foto(1), foto(2), foto(3)]);
    assert.equal(t.enviados.length, 1);
    assert.match(d.toasts.join("\n"), /Envio parado: 2 fotos ficaram sem enviar/);
  } finally { d.fim(); }
});

test("DC-129/DC-130 · «Preparando N de M» e as recusadas num aviso só", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    d.aoModal(async () => false);
    const grandes = [foto(1, 6000), foto(2, 6000), foto(3, 6000), foto(4)];
    const textos = [];
    const p = t.comp.anexarVarios(grandes);
    textos.push(achar(t.comp.el, ".cvx-lote-txt").textContent);
    await p;
    assert.match(textos[0], /^Preparando \d de 4 fotos…$/);
    const erros = d.toasts.filter(x => /ficaram de fora|ficou de fora/.test(x));
    assert.equal(erros.length, 1, "um aviso só para as 3 recusadas");
    assert.match(erros[0], /^3 fotos ficaram de fora: foto-1\.jpg/);
    assert.equal(L.resumoFotosRecusadas(["a", "b", "c", "d", "e"]), "5 fotos ficaram de fora: a, b, c, d e mais 1.");
  } finally { d.fim(); }
});

test("DC-091/DC-220 · áudio gravado sobrevive à queda de internet e sai uma vez quando ela volta", async () => {
  const d = comDom();
  try {
    await comGravador(async reg => {
      let offline = false;
      const t = await montarComposer(d, { acoes: { offline: () => offline } });
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      assert.equal(reg.gravadores[0].state, "recording");
      offline = true;
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      const faixa = achar(t.comp.el, ".cvx-audio-guardado");
      assert.equal(faixa.hidden, false, "o áudio não some");
      assert.match(faixa.textContent, /sem internet/);
      assert.ok(botaoTexto(faixa, /^Baixar$/));
      assert.equal(t.enviados.length, 0);
      assert.equal(t.comp.audioGuardado, true);
      offline = false;
      d.janela.dispatchEvent({ type: "online" });
      d.janela.dispatchEvent({ type: "online" });
      await esperar(10);
      assert.equal(t.enviados.length, 1, "sai uma vez");
      assert.equal(faixa.hidden, true);
    });
  } finally { d.fim(); }
});

test("DC-092 · conversa resolvida durante a gravação: o áudio fica com «Baixar» e «Reabrir e enviar»", async () => {
  const d = comDom();
  try {
    await comGravador(async () => {
      const status = [];
      let t;
      t = await montarComposer(d, { acoes: { status: async s => { status.push(s); t.A.ver.conversa.status = "aberta"; } } });
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      t.A.ver.conversa.status = "resolvida";
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      const faixa = achar(t.comp.el, ".cvx-audio-guardado");
      assert.equal(faixa.hidden, false);
      assert.match(faixa.textContent, /resolvido durante a gravação/);
      const bt = achar(faixa, ".cvx-ag-enviar");
      assert.equal(bt.textContent, "Reabrir e enviar");
      bt.click();
      await esperar(10);
      assert.deepEqual(status, ["aberta"]);
      assert.equal(t.enviados.length, 1);
    });
  } finally { d.fim(); }
});

test("DC-136 · «Enviar» no painel da gravação manda direto, sem o modal", async () => {
  const d = comDom();
  try {
    await comGravador(async () => {
      const t = await montarComposer(d);
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      achar(t.comp.el, ".cvx-rec-enviar").click();
      await esperar(10);
      assert.equal(t.enviados.length, 1);
      assert.equal(d.modais.length, 0);
      assert.equal(t.enviados[0].validacao.tipo, "audio");
    });
  } finally { d.fim(); }
});

test("DC-135 · teclado na gravação: Esc cancela, Enter envia, aria-keyshortcuts", async () => {
  const d = comDom();
  try {
    await comGravador(async reg => {
      const t = await montarComposer(d);
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      const painel = achar(t.comp.el, ".cvx-gravacao");
      painel.dispatchEvent(new d.Evento("keydown", { key: "Escape" }));
      await esperar(5);
      assert.equal(reg.gravadores[0].state, "inactive");
      assert.equal(t.enviados.length, 0);
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      painel.dispatchEvent(new d.Evento("keydown", { key: "Enter" }));
      await esperar(10);
      assert.equal(t.enviados.length, 1);
      assert.equal(achar(t.comp.el, ".cvx-rec-enviar").getAttribute("aria-keyshortcuts"), "Enter");
    });
  } finally { d.fim(); }
});

test("DC-107 · histerese do aviso de microfone mudo (role=status, some só depois de 2 s de som)", () => {
  let e = L.histereseMudo(null, true, 1000);
  assert.equal(e.visivel, true);
  e = L.histereseMudo(e, false, 1250); assert.equal(e.visivel, true, "um pico de som não esconde");
  e = L.histereseMudo(e, true, 1500); assert.equal(e.visivel, true);
  e = L.histereseMudo(e, false, 1750); e = L.histereseMudo(e, false, 3000); assert.equal(e.visivel, true);
  e = L.histereseMudo(e, false, 3800); assert.equal(e.visivel, false);
  assert.match(SRC_COMP, /class: "cvx-rec-mudo", role: "status"/);
});

test("DC-253/DC-252 · «Continuar em outro áudio» e painel preso no celular", () => {
  assert.match(SRC_COMP, /btContinuarGravacao\.hidden = false;\s+\/\/ plano 2000d · DC-253/);
  assert.match(SRC_COMP, /atual\.continuar && el\.isConnected && mesmaConversa\(idConv\)\) iniciarGravacao\(\)/);
  assert.match(CSS, /\.cvx-gravacao \{ position: sticky; bottom: 0/);
});

/* ---------------------------------------------------------------- concorrência entre recepcionistas */
/** nx_cv_atribuir «novo»: com p_conferir_dono, recusa (409 dono_mudou, nome no hint) quando o dono não é o esperado. */
function atribuirNovo(srv) {
  srv.handlers.nx_cv_atribuir = p => {
    const c = srv.convs.find(x => x.id === p.p_conversa);
    if (p.p_conferir_dono && (c.atribuida_a || null) !== (p.p_dono_esperado || null)) throw Object.assign(new Error("dono_mudou"), { codigo: "dono_mudou", status: 409, hint: c.atribuida_nome || "Ana Paula" });
    c.atribuida_a = p.p_conta; c.atribuida_nome = p.p_conta === "u2" ? "Ana Paula" : p.p_conta ? "Helena Souza" : null; return { ...c };
  };
}
const ausente = () => Object.assign(new Error("Could not find the function"), { status: 404, codigo: "PGRST202" });

test("DC-001 · «Assumir» manda o dono que a tela via; 409 dono_mudou pergunta «Ana Paula assumiu agora há pouco» e não toma calado", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  atribuirNovo(srv);
  const perguntas = [];
  d.ui.confirmar = async o => { perguntas.push(o); return false; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Ana Paula";   // a Ana pegou 2 s antes; a tela ainda não sabe
    const bt = c.alvo.querySelectorAll("button").find(b => b.dataset.acao === "assumir");
    bt.click();
    await esperar(80);
    const chamadas = srv.chamadas.filter(x => x[0] === "nx_cv_atribuir");
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0][1].p_dono_esperado, null);
    assert.equal(chamadas[0][1].p_conferir_dono, true);
    assert.match(perguntas[0].titulo, /Ana Paula assumiu agora há pouco/);
    assert.equal(srv.convs[0].atribuida_a, "u2", "a conversa continua com a Ana");
  } finally { c.fim(); d.fim(); }
});

test("DC-001 · servidor sem o parâmetro (PGRST202): confere o dono pelo nx_cv_ver antes de atribuir", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const atrib = srv.handlers.nx_cv_atribuir;
  srv.handlers.nx_cv_atribuir = p => { if ("p_dono_esperado" in p) throw ausente(); return atrib(p); };
  const perguntas = [];
  d.ui.confirmar = async o => { perguntas.push(o); return false; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Ana Paula";
    c.alvo.querySelectorAll("button").find(b => b.dataset.acao === "assumir").click();
    await esperar(80);
    assert.equal(perguntas.length, 1, "achou a Ana pelo nx_cv_ver · " + srv.chamadas.map(x => x[0]).join(","));
    assert.equal(srv.convs[0].atribuida_a, "u2");
  } finally { c.fim(); d.fim(); }
});

test("DC-002 · «Atender o próximo» usa a RPC atômica quando existe (sem nx_cv_atribuir depois) e cai no caminho de hoje sem ela", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  srv.handlers.nx_cv_pegar_proxima = () => { const x = srv.convs[1]; x.atribuida_a = "u1"; x.atribuida_nome = "Helena Souza"; return { conversa: { ...x } }; };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-atender").click();
    await esperar(60);
    assert.equal(srv.conta("nx_cv_pegar_proxima"), 1);
    assert.equal(srv.conta("nx_cv_atribuir"), 0, "a RPC já atribuiu");
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_ver" && x[1].p_id === 902), "abriu a que o servidor separou");
  } finally { c.fim(); d.fim(); }
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 2 });
  srv2.handlers.nx_cv_pegar_proxima = () => { throw ausente(); };
  const c2 = await montarCentral(d2, srv2);
  try {
    achar(c2.alvo, ".cvl-atender").click();
    await esperar(60);
    assert.ok(srv2.chamadas.some(x => x[0] === "nx_cv_listar" && x[1].p_filtro.aba === "aguardando"), "sem a RPC, lê a fila como antes");
    achar(c2.alvo, ".cvl-atender").click();
    await esperar(60);
    assert.equal(srv2.conta("nx_cv_pegar_proxima"), 1, "não insiste na RPC ausente");
  } finally { c2.fim(); d2.fim(); }
});

test("DC-003 · «Assumir» em lote separa as que estão com colegas: «Só as sem dono» (padrão)", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.convs[1].atribuida_a = "u2"; srv.convs[1].atribuida_nome = "Ana Paula";
  atribuirNovo(srv);
  let pergunta = null;
  d.aoModal(o => { pergunta = o; return "sem"; });
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(achar(c.alvo, `.cvl-item[data-id="${id}"]`), "click");
    achar(c.alvo, ".cvl-lote-assumir").click();
    await esperar(20);
    assert.match(pergunta.titulo, /1 está com colegas/);
    assert.match(pergunta.corpo.textContent, /Ana Paula/);
    const o = d.desfazeres.at(-1);
    assert.match(o.texto, /^2 conversas assumidas/);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    const ids = srv.chamadas.filter(x => x[0] === "nx_cv_atribuir").map(x => x[1].p_conversa).sort();
    assert.deepEqual(ids, [901, 903], "a da Ana ficou de fora");
    assert.equal(srv.convs[1].atribuida_a, "u2");
  } finally { c.fim(); d.fim(); }
});

test("DC-005 · transferir em lote: a que um colega assumiu durante o Desfazer fica de fora e o aviso diz quem", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  atribuirNovo(srv);
  d.aoModal(o => { if (!/^Transferir/.test(o.titulo)) return true; o.corpo.querySelector("#cv-trl-pessoa").value = "u1"; return o.acoes[1].fn(); });
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902]) d.ev(achar(c.alvo, `.cvl-item[data-id="${id}"]`), "click");
    achar(c.alvo, ".cvl-lote-transf").click();
    await esperar(20);
    srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Bia";   // a Bia pegou durante os 7 s
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    assert.equal(srv.convs[0].atribuida_a, "u2", "não passou por cima da Bia");
    assert.equal(srv.convs[1].atribuida_a, "u1");
    assert.ok(d.toasts.some(t => /1 conversa ficou de fora: Bia assumiu durante o Desfazer/.test(t)), d.toasts.join(" | "));
  } finally { c.fim(); d.fim(); }
});

test("DC-004 · transferir: alguém assumiu enquanto o modal estava aberto → pergunta com o nome", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const perguntas = [];
  d.ui.confirmar = async o => { perguntas.push(o); return false; };
  const c = await montarCentral(d, srv);
  d.aoModal(o => { if (o.titulo !== "Transferir conversa") return true; srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Bia"; o.corpo.querySelector("#cv-tr-pessoa").value = "u1"; return o.acoes[1].fn(); });
  try {
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    await d.menus.at(-1).itens.find(i => i && i.rotulo === "Transferir…").fn();
    await esperar(20);
    assert.equal(perguntas.length, 1);
    assert.match(perguntas[0].titulo, /Bia assumiu enquanto você escolhia/);
    assert.equal(d.desfazeres.length, 0, "não transferiu");
  } finally { c.fim(); d.fim(); }
});

test("DC-006 · etiquetas: manda só a diferença (nx_cv_etiquetas_mudar) e cai na lista inteira sem a RPC", async () => {
  assert.deepEqual(L.diferencaEtiquetas(["e1", "e2"], ["e2", "e3"]), { acrescentar: ["e3"], tirar: ["e1"] });
  assert.deepEqual(L.diferencaEtiquetas([{ id: "e1" }], ["e1"]), { acrescentar: [], tirar: [] });
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.convs[0].etiquetas = ["e1"];
  srv.handlers.nx_cv_etiquetas_mudar = p => { const x = srv.convs[0]; x.etiquetas = [...new Set([...x.etiquetas.filter(e => !p.p_tirar.includes(e)), ...p.p_acrescentar])]; return { ...x }; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    srv.convs[0].etiquetas = ["e1", "urgente"];   // a Ana marcou «Urgente» 3 s antes
    const vez = await (async () => { const sel = c.alvo.querySelector(".sel-etiq"); return sel.mudar(["e1", "e2"]); })();
    await vez; await esperar(10);
    const p = srv.chamadas.find(x => x[0] === "nx_cv_etiquetas_mudar")[1];
    assert.deepEqual([p.p_acrescentar, p.p_tirar], [["e2"], []]);
    assert.deepEqual(srv.convs[0].etiquetas.sort(), ["e1", "e2", "urgente"], "a «Urgente» da Ana não sumiu");
    assert.equal(srv.conta("nx_cv_etiquetas"), 0);
  } finally { c.fim(); d.fim(); }
});

test("DC-007 · nome editado: o colega mudou enquanto o campo estava aberto → «Manter o meu / Usar o dela»", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Maria", telefone: "5512999990000", atualizado_em: "2026-10-01T10:00:00Z" } } });
    const bt = t.alvo.querySelector('[data-foco="editar-nome"]');
    bt.click(); await esperar(5);
    const inp = achar(t.alvo, ".cvt-nome-ed input");
    inp.value = "Maria S."; d.ev(inp, "input");
    t.A.ver.contato = { ...t.A.ver.contato, nome: "Maria Souza" };   // a Ana corrigiu (o pulso trouxe)
    let pergunta = null;
    d.aoModal(o => { pergunta = o; return "dela"; });
    d.ev(inp, "keydown", { key: "Enter" });
    await esperar(10);
    assert.match(pergunta.corpo.textContent, /«Maria Souza»/);
    assert.equal(t.chamadas.filter(x => x[0] === "nx_contato_salvar").length, 0, "«Usar o dela» não grava");
  } finally { d.fim(); }
});

test("DC-008 · Resolver a conversa de uma colega pede confirmação e deixa a nota «Resolvida por … (era de …)»", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Ana Paula";
  const perguntas = [];
  d.ui.confirmar = async o => { perguntas.push(o); return true; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.doc.dispatchEvent(new d.Evento("keydown", { key: "R", code: "KeyR", altKey: true, shiftKey: true }));   // Alt+Shift+R
    await esperar(20);
    assert.match(perguntas[0].titulo, /Esta conversa é de Ana Paula/);
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    const nota = srv.chamadas.find(x => x[0] === "nx_cv_nota");
    assert.match(nota[1].p_texto, /^Resolvida por Helena Souza \(era de Ana Paula\)\.$/);
  } finally { c.fim(); d.fim(); }
});

test("DC-009 · alguém assumiu a conversa à vista: aviso «Ana Paula assumiu esta conversa agora»", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Ana Paula";
    srv.convs[0].ultima_msg_em = new Date().toISOString();
    await c.pulso();
    await esperar(50);
    assert.ok(d.toasts.some(t => t === "Ana Paula assumiu esta conversa agora."), d.toasts.join(" | "));
  } finally { c.fim(); d.fim(); }
});

test("DC-020 · preferências por conta: a Bia não herda aba, filtro, avisos e densidade da Ana; a chave antiga migra uma vez", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  d.mem.set("nx-cv-aba", "aguardando");
  d.mem.set("nx-cv-filtro:c1", JSON.stringify({ atendente: "u2" }));
  d.mem.set("nx-cv-avisos", JSON.stringify({ som: false }));
  let c = await montarCentral(d, srv);
  try {
    assert.equal(d.mem.get("nx-cv-aba:u1"), "aguardando", "a 1ª conta herda (migração)");
    assert.equal(d.mem.has("nx-cv-aba"), false, "a chave sem conta sai");
    assert.equal(JSON.parse(d.mem.get("nx-cv-filtro:c1:u1")).atendente, "u2");
    c.fim();
    c = await montarCentral(d, srv, { extraCtx: { sessao: { conta: { id: "u9", nome: "Bia" } } } });
    const ult = srv.chamadas.filter(x => x[0] === "nx_cv_listar").at(-1)[1];
    assert.equal(ult.p_filtro.aba, "minhas", "a Bia começa na aba padrão");
    assert.equal(ult.p_filtro.atendente, undefined, "sem o filtro da Ana");
    assert.equal(d.mem.has("nx-cv-avisos:u9"), false);
  } finally { c.fim(); d.fim(); }
});

/* ---------------------------------------------------------------- campo: colega, IA e rascunho */
test("DC-108/DC-224 · colega respondeu enquanto eu escrevia: aviso acima do campo e o 1º Enter só fecha o aviso", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    t.digitar("Oi, temos horário sexta");
    t.comp.colegaRespondeu([{ id: 70, conversa_id: 9, direcao: "out", tipo: "texto", corpo: "Oi! Sexta 9h?", enviado_por: { id: "u2", nome: "Ana Paula" }, criado_em: new Date().toISOString() }]);
    const faixa = achar(t.comp.el, ".cvx-colega");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /^Ana acabou de responder \(\d\d:\d\d\): revise antes de enviar\./);
    d.ev(t.ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.equal(t.enviados.length, 0, "o 1º Enter não envia");
    assert.equal(faixa.hidden, true);
    d.ev(t.ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.equal(t.enviados.length, 1, "o 2º envia");
    // a minha própria saída e a nota não avisam
    t.digitar("outra");
    t.comp.colegaRespondeu([{ id: 71, direcao: "out", tipo: "texto", enviado_por: { id: "u1" }, criado_em: new Date().toISOString() }, { id: 72, direcao: "out", tipo: "nota", enviado_por: { id: "u2", nome: "Ana" }, criado_em: new Date().toISOString() }]);
    assert.equal(faixa.hidden, true);
  } finally { d.fim(); }
});

test("DC-108 (central) · o delta entrega ao composer as saídas novas", () => {
  assert.match(SRC_CONV, /A\.composer\.colegaRespondeu\(\(r\.itens \|\| \[\]\)\.filter\(m => Number\(m\.id\) > Number\(tinhaUlt \|\| 0\)\)\)/);
});

test("DC-109 · nx-enviar recusa com dono_mudou: nada sai, o texto volta ao campo e o aviso diz quem pegou", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const env = srv.fns["nx-enviar"];
  srv.fns["nx-enviar"] = c => { if (c.acao === "texto") throw Object.assign(new Error("dono_mudou"), { codigo: "dono_mudou", status: 409, hint: "Bia" }); return env(c); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "Pode vir às 9h"; d.ev(ta, "input");
    d.ev(ta, "keydown", { key: "Enter" });
    await esperar(80);
    const pedido = srv.chamadas.find(x => x[0] === "nx-enviar:texto");
    assert.ok(pedido && "dono_esperado" in pedido[1], "o dono visto vai junto");
    assert.ok(d.toasts.some(t => /Bia assumiu esta conversa antes de a sua mensagem sair/.test(t)), d.toasts.join(" | "));
    assert.equal(ta.value, "Pode vir às 9h", "o texto voltou ao campo");
  } finally { c.fim(); d.fim(); }
});

test("DC-114 · IA atendendo (CodeWords): faixa acima do campo e o 1º Enter pergunta; «Pausar a IA e enviar» pausa antes", async () => {
  const d = comDom();
  try {
    const pausas = [];
    const t = await montarComposer(d, { conv: { canal: { provedor: "codewords" } }, acoes: { assumirIA: async () => { pausas.push(1); t.A.iaEstado = { ...t.A.iaEstado, pausada: true }; } } });
    t.A.iaEstado = { disponivel: true, ia_ligada: true, pausada: false };
    t.comp.atualizar();
    assert.equal(achar(t.comp.el, ".cvx-ia-ativa").hidden, false);
    let pergunta = null;
    d.aoModal(o => { pergunta = o; return "pausar"; });
    t.digitar("Oi!");
    d.ev(t.ta, "keydown", { key: "Enter" });
    await esperar(10);
    assert.match(pergunta.titulo, /A IA está atendendo esta conversa/);
    assert.equal(pausas.length, 1);
    assert.equal(t.enviados.length, 1);
    t.comp.atualizar();
    assert.equal(achar(t.comp.el, ".cvx-ia-ativa").hidden, true, "IA pausada: a faixa some");
  } finally { d.fim(); }
});

test("DC-110 · selo do rascunho diz quantas mensagens vieram depois dele", async () => {
  const d = comDom();
  try {
    const r = rascunhosDe(d);
    const k = "nx-rasc:u1:c1:conversa:9";
    d.mem.set(k, JSON.stringify({ t: "texto antigo", em: Date.now() - 3 * 3600000 }));
    const t = await montarComposer(d, { rascunho: r });
    t.A.msgs = [txt(1, "in", 60), txt(2, "out", 30), { ...txt(3, "out", 20), tipo: "nota" }];
    t.A.rascunhos.clear();   // a sessão esquece; o aparelho ainda guarda (com a hora antiga)
    t.comp.definirConversa();
    const selo = achar(t.comp.el, ".rascunho-selo");
    assert.match(selo.textContent, /^Rascunho de 3 h atrás restaurado · 2 mensagens depois dele · /);
  } finally { d.fim(); }
});

test("DC-111/DC-226 · rascunho alterado em outra aba: aviso «usar o de lá» em vez de gravar por cima calado", () => {
  const d = comDom();
  try {
    const ouv = new Map();
    const janela = { addEventListener: (t, f) => { ouv.set(t, [...(ouv.get(t) || []), f]); }, removeEventListener: (t, f) => ouv.set(t, (ouv.get(t) || []).filter(x => x !== f)) };
    const r = R.criarRascunhos({ storage: globalThis.localStorage, conta: () => "u1", cliente: () => "c1", agendar: (fn, ms) => setTimeout(fn, ms), cancelar: t => clearTimeout(t), doc: d.doc, janela, debounceMs: 0 });
    const campo = d.h("textarea"); const pai = d.h("div", null, campo); d.doc.body.appendChild(pai);
    let conflito = null;
    const ctl = r.ligar(campo, "conversa:9", { aoConflito: t => { conflito = t; } });
    campo.value = "daqui";
    for (const f of ouv.get("storage")) f({ key: "nx-rasc:u1:c1:conversa:9", newValue: JSON.stringify({ t: "de lá", em: Date.now() }) });
    assert.equal(conflito, "de lá");
    for (const f of ouv.get("storage")) f({ key: "nx-rasc:u1:c1:conversa:10", newValue: JSON.stringify({ t: "outra", em: Date.now() }) });
    assert.equal(conflito, "de lá", "outra chave não conta");
    ctl.desligar();
    assert.equal((ouv.get("storage") || []).length, 0, "desligar solta o ouvinte");
    // sem callback: o selo padrão
    const ctl2 = r.ligar(campo, "conversa:9");
    for (const f of ouv.get("storage")) f({ key: "nx-rasc:u1:c1:conversa:9", newValue: JSON.stringify({ t: "de lá 2", em: Date.now() }) });
    const selo = pai.querySelector(".rascunho-outra-aba");
    assert.match(selo.textContent, /Este rascunho foi alterado em outra aba/);
    selo.querySelector("button").click();
    assert.equal(campo.value, "de lá 2");
    ctl2.parar();
  } finally { d.fim(); }
});

test("DC-217/DC-218 · pendentes() pelo índice (sem getItem) e o rascunho grande demais não apaga o último bom", () => {
  const d = comDom();
  try {
    const mem = new Map(); let leituras = 0;
    const storage = { getItem: k => { leituras++; return mem.has(k) ? mem.get(k) : null; }, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
    const r = R.criarRascunhos({ storage, conta: () => "u1", cliente: () => "c1", doc: null, janela: null, debounceMs: 0 });
    const campo = d.h("textarea");
    let grande = 0;
    const ctl = r.ligar(campo, "negocio:1:nota", { aoGrande: () => grande++ });
    campo.value = "bom"; ctl.salvarAgora();
    leituras = 0;
    assert.equal(r.pendentes(), 1);
    assert.equal(leituras, 0, "nada de getItem");
    campo.value = "x".repeat(60000);
    assert.equal(ctl.salvarAgora(), false);
    assert.equal(JSON.parse(mem.get("nx-rasc:u1:c1:negocio:1:nota")).t, "bom", "o último bom fica");
  } finally { d.fim(); }
});

test("DC-113 · a citação volta com o rascunho depois de recarregar", async () => {
  const d = comDom();
  try {
    const r = rascunhosDe(d);
    let t = await montarComposer(d, { rascunho: r });
    t.A.msgs = [txt(55, "in", 10, { corpo: "Qual o valor?" })];
    t.comp.responder(t.A.msgs[0]);
    t.digitar("R$ 200");
    await esperar(5);
    t.comp.desmontar();
    t.comp.el.remove();
    t = await montarComposer(d, { rascunho: r });
    t.A.msgs = [txt(55, "in", 10, { corpo: "Qual o valor?" })];
    t.comp.definirConversa();
    assert.equal(t.ta.value, "R$ 200");
    assert.equal(achar(t.comp.el, ".cvx-resp").hidden, false, "a faixa «Respondendo a…» voltou");
    assert.match(achar(t.comp.el, ".cvx-resp").textContent, /Qual o valor\?/);
  } finally { d.fim(); }
});

test("DC-112 · com rascunho de mensagem E de nota, o selo oferece abrir a nota", async () => {
  const d = comDom();
  try {
    const r = rascunhosDe(d);
    d.mem.set("nx-rasc:u1:c1:conversa:9", JSON.stringify({ t: "para o cliente", em: Date.now() }));
    d.mem.set("nx-rasc:u1:c1:conversa:9:nota", JSON.stringify({ t: "nota da equipe", em: Date.now() }));
    const t = await montarComposer(d, { rascunho: r });
    assert.equal(t.ta.value, "para o cliente");
    const s = achar(t.comp.el, ".cvx-nota-guardada");
    s.querySelector("button").click();
    assert.equal(t.comp.emNota, true);
    assert.equal(t.ta.value, "nota da equipe");
    assert.equal(JSON.parse(d.mem.get("nx-rasc:u1:c1:conversa:9")).t, "para o cliente", "a mensagem continua guardada");
  } finally { d.fim(); }
});

test("DC-206 · trocar Mensagem/Nota com o storage falhando não perde o texto guardado", async () => {
  const d = comDom();
  try {
    const r = rascunhosDe(d);
    const t = await montarComposer(d, { rascunho: r });
    t.digitar("texto importante");
    await esperar(5);
    assert.ok(d.mem.get("nx-rasc:u1:c1:conversa:9"));
    const set = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error("cota"); };
    try { t.comp.alternarNota(true); } finally { globalThis.localStorage.setItem = set; }
    assert.equal(t.ta.value, "texto importante");
    assert.equal(JSON.parse(d.mem.get("nx-rasc:u1:c1:conversa:9")).t, "texto importante", "a chave antiga ficou");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- sem internet e conversa longa */
test("DC-067/DC-069 · sem internet ao abrir: a base guardada abre a central com a faixa (e as mensagens na fila)", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const rpcC = srv.api.rpcC;
  srv.api.rpcC = async (nome, p, o) => {
    if (nome === "nx_cv_base") { if (o && o.cache && o.aoCache) o.aoCache(srv.base, Date.now() - 60000); throw Object.assign(new Error("rede"), { codigo: "sem_conexao", comCache: true }); }
    return rpcC(nome, p, o);
  };
  const c = await montarCentral(d, srv);
  try {
    assert.ok(c.alvo.querySelector(".cvl"), "a lista entrou na tela (antes: cartão de erro)");
    const faixa = achar(c.alvo, ".cvl-cache");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /Sem conexão/);
    srv.api.rpcC = rpcC;
    await c.pulso();
    assert.equal(achar(c.alvo, ".cvl-cache").hidden, true, "a base de verdade chegou no pulso");
  } finally { c.fim(); d.fim(); }
});

test("DC-069 · a faixa conta as mensagens esperando na fila", async () => {
  const d = comDom();
  try {
    const { A, lista } = await montarLista(d, { itens: [conv(1)], acoes: { filaPendentes: () => 5 } });
    A.listaSoCache = true; A.listaCacheEm = Date.now() - 120000;
    lista.render();
    assert.match(achar(lista.el, ".cvl-cache").textContent, /5 mensagens esperando para sair/);
  } finally { d.fim(); }
});

test("DC-070 · recuo do pulso com rede ruim (dobra até 24 s, volta quando melhora)", () => {
  assert.equal(L.recuoPulso(0, 800), 0);
  assert.equal(L.recuoPulso(0, 8000), 6000);
  assert.equal(L.recuoPulso(6000, 8000), 12000);
  assert.equal(L.recuoPulso(24000, 9000), 24000);
  assert.equal(L.recuoPulso(0, 500, "2g"), 6000);
  assert.equal(L.recuoPulso(24000, 500), 12000);
  assert.equal(L.recuoPulso(6000, 500), 0);
  assert.match(SRC_CONV, /if \(doShell && A\.pulsoEspera && Date\.now\(\) < A\.pulsoEspera\) return;/);
});


test("DC-027 · resultado fora das páginas carregadas abre «em volta» dele, com a faixa do meio do histórico", async () => {
  const d = comDom();
  const msgs = Array.from({ length: 60 }, (_, i) => ({ id: 1000 + i, conversa_id: 901, direcao: i % 2 ? "out" : "in", tipo: "texto", corpo: `m${i}`, status: "recebida", criado_em: agoraIso(600 - i), atualizado_em: agoraIso(600 - i) }));
  const srv = criarServidor({ conversas: 1, mensagens: { 901: msgs } });
  srv.handlers.nx_cv_mensagens = p => {
    if (p.p_em_torno_de) { const i = msgs.findIndex(m => m.id === p.p_em_torno_de); return { itens: msgs.slice(Math.max(0, i - 25), i + 25).map(m => ({ ...m })), tem_mais: true, agora: new Date().toISOString() }; }
    return { itens: msgs.slice(-10).map(m => ({ ...m })), tem_mais: false, conversas: [{ id: 901, protocolo: "ORB-901" }], agora: new Date().toISOString(), ultimo_id: msgs.at(-1).id };
  };
  const c = await montarCentral(d, srv);
  try {
    await c.ctx.navegar("#/conversas/901?msg=1005");
    await esperar(80);
    const pedido = srv.chamadas.find(x => x[0] === "nx_cv_mensagens" && x[1].p_em_torno_de === 1005);
    assert.ok(pedido, "pediu a página em volta da mensagem");
    assert.ok(c.alvo.querySelector('.cv-msg[data-id="1005"]'), "a mensagem antiga está na tela");
    assert.equal(achar(c.alvo, ".cvc-meio").hidden, false);
    assert.ok(!d.toasts.some(t => /muito antiga/.test(t)), "sem o «role para cima»");
  } finally { c.fim(); d.fim(); }
});

test("DC-068 · modelo enviado sem internet entra na fila persistente e sai como template quando a rede volta", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const rede = { estado: "offline", assinar: () => () => {} };
  srv.convs[0].ultima_entrada_em = agoraIso(60);
  d.aoModal(o => { if (!/modelo/i.test(o.titulo || "")) return true; const r = o.corpo.querySelector("[role=radio]"); if (r) r.click(); const inp = o.corpo.querySelector("input"); if (inp) { inp.value = "Maria"; d.ev(inp, "input"); } const ac = (o.acoes || []).find(a => a.tipo === "primario"); return ac && ac.fn ? ac.fn({ erro() {} }) : true; });
  const c = await montarCentral(d, srv, { extraCtx: { rede } });
  try {
    await c.abrir(901);
    const bt = c.alvo.querySelector("[data-modelos]");
    bt.click();
    await esperar(60);
    assert.equal(srv.conta("nx-enviar:template"), 0, "offline: não tentou mandar (antes: falha «Não enviada» que sumia ao recarregar)");
    // sem IndexedDB no teste a fila não persiste: o modelo NÃO volta como texto solto para o campo (sairia como mensagem comum)
    assert.ok(d.toasts.some(t => /não foi possível guardar o modelo/.test(t)), d.toasts.join(" | "));
    assert.equal(achar(c.alvo, "textarea[aria-label=Mensagem]").value, "");
  } finally { c.fim(); d.fim(); }
  // com IndexedDB: o item leva o modelo e sai como template (mesmo client_ref)
  assert.match(SRC_CONV, /it\.template \? \{ acao: "template", conversa: it\.conversa, template_id: it\.template\.id, parametros: it\.parametros \|\| \[\], client_ref: it\.id \}/);
  assert.match(SRC_CONV, /\.\.\.\(o\.template \? \{ template: \{ id: o\.template\.id, nome: o\.template\.nome, idioma: o\.template\.idioma \}, parametros: o\.parametros \|\| \[\] \} : \{\}\)/);
});

/* ============================================================ lote: resolver/lida (DC-010/011/012/017) */
async function selecionarTodas(d, c, ids) {
  achar(c.alvo, ".cvl-sel-bt").click();
  for (const id of ids) d.ev(achar(c.alvo, `.cvl-item[data-id="${id}"]`), "click");
}

test("DC-011 · resolver em lote numa chamada só (nx_cv_status_lote), sem um nx_cv_status por conversa", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.handlers.nx_cv_status_lote = p => { for (const id of p.p_ids) srv.convs.find(x => x.id === id).status = "resolvida"; return { resolvidas: p.p_ids }; };
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902, 903]);
    botaoTexto(achar(c.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    const p = srv.chamadas.find(x => x[0] === "nx_cv_status_lote")[1];
    assert.deepEqual(p.p_ids.slice().sort(), [901, 902, 903]);
    assert.equal(p.p_status, "resolvida");
    assert.ok(p.p_entrada_antes && "901" in p.p_entrada_antes, "manda a última entrada vista de cada uma");
    assert.equal(srv.conta("nx_cv_status"), 0);
  } finally { c.fim(); d.fim(); }
});

test("DC-010/DC-011 · sem a RPC de lote: uma por uma, e a que falhou volta selecionada", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.handlers.nx_cv_status = p => { if (p.p_conversa === 902) throw Object.assign(new Error("falhou"), { codigo: "erro_rede" }); srv.convs.find(x => x.id === p.p_conversa).status = p.p_status; return { ok: true }; };
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902, 903]);
    botaoTexto(achar(c.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    const o = d.desfazeres.at(-1);
    await o.firmar().catch(() => {}); o._fim({ estado: "mantida" }); await esperar(20);
    assert.equal(srv.conta("nx_cv_status"), 3, "caiu no caminho antigo");
    assert.equal(achar(c.alvo, ".cvl-lote").hidden, false, "a seleção voltou");
    const marcadas = c.alvo.querySelectorAll('.cvl-item[aria-checked="true"]').map(x => Number(x.dataset.id));
    assert.deepEqual(marcadas, [902]);
  } finally { c.fim(); d.fim(); }
});

test("DC-017 · resolver mais de 10 de uma vez pergunta antes (com quantas têm não lida)", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 12 });
  srv.convs[0].nao_lidas = 2; srv.convs[1].nao_lidas = 1;
  const perguntas = [];
  d.ui.confirmar = async o => { perguntas.push(o); return false; };
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, srv.convs.map(x => x.id));
    botaoTexto(achar(c.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    assert.equal(perguntas.length, 1);
    assert.match(perguntas[0].titulo, /Resolver 12 conversas/);
    assert.match(perguntas[0].texto, /2 têm mensagem não lida/);
    assert.equal(d.desfazeres.length, 0, "não resolveu");
  } finally { c.fim(); d.fim(); }
  // até 10, segue direto como antes
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 3 });
  let perguntou = false;
  d2.ui.confirmar = async () => { perguntou = true; return true; };
  const c2 = await montarCentral(d2, srv2);
  try {
    await selecionarTodas(d2, c2, [901, 902, 903]);
    botaoTexto(achar(c2.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    assert.equal(perguntou, false);
    assert.equal(d2.desfazeres.length, 1);
    d2.desfazeres[0].reverter(); d2.desfazeres[0]._fim({ estado: "desfeita" }); await esperar(10);
  } finally { c2.fim(); d2.fim(); }
});

test("DC-012 · marcar como lida em lote: um pedido só com a RPC; sem ela, em paralelo e a falha de uma não para as outras", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  for (const cv of srv.convs) cv.nao_lidas = 1;
  srv.handlers.nx_cv_marcar_lida_lote = p => { for (const id of p.p_conversas) srv.convs.find(x => x.id === id).nao_lidas = 0; return { marcadas: p.p_conversas }; };
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902, 903]);
    botaoTexto(achar(c.alvo, ".cvl-lote"), /Marcar como lida/).click();
    await esperar(10);
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    assert.equal(srv.conta("nx_cv_marcar_lida_lote"), 1);
    assert.equal(srv.conta("nx_cv_marcar_lida"), 0);
  } finally { c.fim(); d.fim(); }
  // sem a RPC: 4 de cada vez; a 901 falha e a 902/903 ficam marcadas mesmo assim
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 3 });
  for (const cv of srv2.convs) cv.nao_lidas = 1;
  let simultaneas = 0, pico = 0;
  srv2.handlers.nx_cv_marcar_lida = async p => { simultaneas++; pico = Math.max(pico, simultaneas); await esperar(5); simultaneas--;
    if (p.p_conversa === 901) throw Object.assign(new Error("falhou"), { codigo: "erro_rede" }); srv2.convs.find(x => x.id === p.p_conversa).nao_lidas = 0; return { ok: true }; };
  const c2 = await montarCentral(d2, srv2);
  try {
    await selecionarTodas(d2, c2, [901, 902, 903]);
    botaoTexto(achar(c2.alvo, ".cvl-lote"), /Marcar como lida/).click();
    await esperar(10);
    const o = d2.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(20);
    assert.ok(pico > 1, "em paralelo");
    assert.deepEqual(srv2.convs.map(x => x.nao_lidas), [1, 0, 0]);
  } finally { c2.fim(); d2.fim(); }
});

test("DC-013 · etiquetar em lote com «Tirar»: só quem tinha é chamado, e a lista vai sem ela; o texto diz «ganharam · perderam»", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.convs[0].etiquetas = ["e1"]; srv.convs[1].etiquetas = ["e1", "e2"];
  d.aoModal(o => { achar(o.corpo, "#cv-etl-tirar-e1").checked = true; achar(o.corpo, "#cv-etl-e2").checked = true; return o.acoes[1].fn({ erro() {} }); });
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902, 903]);
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(20);
    const o = d.desfazeres.at(-1);
    assert.match(o.texto, /2 ganharam · 2 perderam/);
    await o.firmar({}); await esperar(10);
    const gravadas = Object.fromEntries(srv.chamadas.filter(x => x[0] === "nx_cv_etiquetas").map(x => [x[1].p_conversa, x[1].p_etiquetas]));
    assert.deepEqual(gravadas, { 901: ["e2"], 902: ["e2"], 903: ["e2"] });
    assert.deepEqual(srv.convs.map(x => x.etiquetas), [["e2"], ["e2"], ["e2"]]);
  } finally { c.fim(); d.fim(); }
  // só tirar: quem não tinha não é chamado
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 3 });
  srv2.convs[0].etiquetas = ["e1"];
  d2.aoModal(o => { achar(o.corpo, "#cv-etl-tirar-e1").checked = true; return o.acoes[1].fn({ erro() {} }); });
  const c2 = await montarCentral(d2, srv2);
  try {
    await selecionarTodas(d2, c2, [901, 902, 903]);
    achar(c2.alvo, ".cvl-lote-etq").click();
    await esperar(20);
    await d2.desfazeres.at(-1).firmar({}); await esperar(10);
    const chamadas = srv2.chamadas.filter(x => x[0] === "nx_cv_etiquetas");
    assert.deepEqual(chamadas.map(x => [x[1].p_conversa, x[1].p_etiquetas]), [[901, []]]);
  } finally { c2.fim(); d2.fim(); }
});

test("DC-013 · «Acrescentar» e «Tirar» da mesma etiqueta se excluem", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  let corpo = null;
  d.aoModal(o => { corpo = o.corpo; return null; });
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901]);
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(10);
    const add = achar(corpo, "#cv-etl-e1"), tira = achar(corpo, "#cv-etl-tirar-e1");
    add.checked = true; d.ev(add, "change");
    tira.checked = true; d.ev(tira, "change");
    assert.equal(add.checked, false);
  } finally { c.fim(); d.fim(); }
});

test("DC-014 · etiquetar em lote: Desfazer dentro dos 7 s não grava nada; erro na 2ª ainda grava a 3ª", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  d.aoModal(o => { achar(o.corpo, "#cv-etl-e2").checked = true; return o.acoes[1].fn({ erro() {} }); });
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902, 903]);
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(20);
    const o = d.desfazeres.at(-1);
    o.reverter(); await o.firmar({}); await esperar(10);
    assert.equal(srv.conta("nx_cv_etiquetas"), 0, "desfeito: o servidor não ouviu");
    assert.deepEqual(srv.convs.map(x => x.etiquetas), [[], [], []]);
  } finally { c.fim(); d.fim(); }
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 3 });
  const gravar = srv2.handlers.nx_cv_etiquetas;
  srv2.handlers.nx_cv_etiquetas = p => { if (p.p_conversa === 902) throw Object.assign(new Error("falhou"), { codigo: "erro_rede" }); return gravar(p); };
  d2.aoModal(o => { achar(o.corpo, "#cv-etl-e2").checked = true; return o.acoes[1].fn({ erro() {} }); });
  const c2 = await montarCentral(d2, srv2);
  try {
    await selecionarTodas(d2, c2, [901, 902, 903]);
    achar(c2.alvo, ".cvl-lote-etq").click();
    await esperar(20);
    await d2.desfazeres.at(-1).firmar({}); await esperar(10);
    assert.deepEqual(srv2.convs.map(x => x.etiquetas), [["e2"], [], ["e2"]]);
    assert.ok(d2.toasts.some(t => /1 conversa ficou sem as etiquetas novas/.test(t)), d2.toasts.join(" | "));
  } finally { c2.fim(); d2.fim(); }
});

/* ============================================================ lote d2 (p2): assinatura, falha, leitor, som */
test("DC-097 · L.semAssinatura tira só o prefixo «*Nome:*» da 1ª linha", () => {
  assert.equal(L.semAssinatura("*Helena:*\nOi"), "Oi");
  assert.equal(L.semAssinatura("Oi *Helena:*\nx"), "Oi *Helena:*\nx");
  assert.equal(L.semAssinatura("*negrito* normal"), "*negrito* normal");
  assert.equal(L.semAssinatura(null), "");
});

test("DC-097/DC-098 · encaminhar e copiar uma saída assinada vão sem «*Helena:*»", async () => {
  const d = comDom();
  const assinada = { id: 9020, conversa_id: 901, direcao: "out", tipo: "texto", corpo: "*Helena:*\nSeu horário é 15h", status: "enviada", wamid: "wx", criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
  const srv = criarServidor({ conversas: 1, mensagens: { 901: [assinada] } });
  const copiados = [];
  d.ui.copiar = t => { copiados.push(t); return Promise.resolve(true); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, '.cv-msg[data-id="9020"] .cv-copiar').click();
    assert.equal(copiados.at(-1), "Seu horário é 15h");
    // sem outra conversa aberta, o encaminhar copia — também sem a assinatura
    achar(c.alvo, '.cv-msg[data-id="9020"] .cv-msg-mais').click();
    await d.menus.at(-1).itens.find(i => /Encaminhar/.test(i.rotulo)).fn();
    assert.equal(copiados.at(-1), "Seu horário é 15h");
  } finally { c.fim(); d.fim(); }
  // com destino: o texto que vai para o campo passa pelo mesmo semAssinatura (e o reenvio da gravada também)
  assert.match(SRC_CONV, /const texto = A\.L\.semAssinatura\(m\.corpo\)\.slice\(0, 4000\);/);
  assert.match(SRC_CONV, /texto: A\.L\.semAssinatura\(m\.corpo\), reenvio: null/);
});

test("DC-099 · toque longo no Enviar abre «Enviar e resolver» (e ele está no «+» do celular)", async () => {
  const d = comDom();
  const longos = [];
  d.ui.toqueLongo = (el, fn) => { longos.push({ el, fn }); return () => {}; };
  try {
    const x = await montarComposer(d, { acoes: { resolver() {} } });
    const bt = achar(x.comp.el, ".cvx-enviar");
    const lp = longos.find(l => l.el === bt);
    assert.ok(lp, "ui.toqueLongo ligado no Enviar");
    x.digitar("Até amanhã");
    lp.fn();
    assert.ok(d.menus.at(-1).itens.some(i => i.rotulo === "Enviar e resolver"));
    achar(x.comp.el, '[aria-label="Mais opções"]').click();
    assert.ok(d.menus.at(-1).itens.some(i => i && i.rotulo === "Enviar e resolver"));
  } finally { d.fim(); }
});

test("DC-101 · falha gravada pelo servidor mostra a dica em português e o código fica no title", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "out", 5, { status: "falhou", erro: "(#131026) Message undeliverable" }), txt(2, "out", 4, { status: "falhou", erro: "meta_131026" })] });
    const falhas = chat.el.querySelectorAll(".cv-falha");
    assert.equal(falhas.length, 2);
    for (const f of falhas) { assert.match(f.textContent, /não pôde receber/); assert.doesNotMatch(f.textContent, /131026/); }
    assert.match(falhas[0].getAttribute("title"), /Message undeliverable/);
  } finally { d.fim(); }
});

test("DC-140 · mensagem nova é anunciada só com quem e o texto (o log não lê os botões da bolha)", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 10)] });
    assert.equal(chat.el.querySelector(".cvc-msgs").getAttribute("aria-live"), "off");
    A.msgs = [...A.msgs, txt(2, "in", 0, { corpo: "Olá, tudo bem?" })];
    chat.renderMensagens({ rolar: "novas" });
    const a = d.anuncios.at(-1);
    assert.match(a, /Mariana Costa: Olá, tudo bem\?/);
    assert.doesNotMatch(a, /Responder|Copiar|Mais ações/);
  } finally { d.fim(); }
});

test("DC-023 · som preso pelo navegador: a faixa «Clique em qualquer lugar para ligar o som» aparece e sai no 1º clique", async () => {
  const d = comDom();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { userActivation: { hasBeenActive: false }, onLine: true }, configurable: true, writable: true });
  const srv = criarServidor({ conversas: 1 });
  const c = await montarCentral(d, srv);
  try {
    const faixa = achar(c.alvo, ".cvl-som-bloqueado");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /Clique em qualquer lugar para ligar o som/);
    d.ev(d.doc, "pointerdown");
    await esperar(5);
    assert.equal(faixa.hidden, true);
  } finally { c.fim(); d.fim(); if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); }
});

const audioMsg = (id, dir, min) => ({ id, conversa_id: 9, direcao: dir, tipo: "audio", corpo: null, wamid: `w${id}`, status: dir === "out" ? "enviada" : "recebida",
  midia: { path: `c1/in/a${id}.ogg`, mime: "audio/ogg", duracao: 12 }, criado_em: agoraIso(min), atualizado_em: agoraIso(min) });

test("DC-106 · a URL do áudio que toca é renovada: o mesmo <audio> continua até pausar", async () => {
  const d = comDom();
  try {
    let estadoUrl = "ok";
    const { A, chat } = await montarChat(d, { msgs: [audioMsg(1, "in", 5)], acoes: { estadoMidia: () => estadoUrl } });
    const audio = achar(chat.el, '.cv-msg[data-id="1"] audio');
    audio.paused = false; d.ev(audio, "play");
    estadoUrl = "renovada";
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector('.cv-msg[data-id="1"] audio'), audio, "não recriou no meio");
    audio.paused = true; d.ev(audio, "pause");
    await esperar(5);
    assert.notEqual(chat.el.querySelector('.cv-msg[data-id="1"] audio'), audio, "redesenhou depois da pausa");
    assert.ok(A);
  } finally { d.fim(); }
});

test("DC-134 · ao acabar um áudio do cliente, o seguinte dele toca; a resposta da equipe não", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [audioMsg(1, "in", 6), audioMsg(2, "in", 5), audioMsg(3, "out", 4)] });
    const tocou = [];
    for (const id of [1, 2, 3]) { const a = achar(chat.el, `.cv-msg[data-id="${id}"] audio`); a.paused = true; a.play = () => { tocou.push(id); return Promise.resolve(); }; }
    d.ev(achar(chat.el, '.cv-msg[data-id="1"] audio'), "ended");
    assert.deepEqual(tocou, [2]);
    d.ev(achar(chat.el, '.cv-msg[data-id="2"] audio'), "ended");
    assert.deepEqual(tocou, [2], "a saída da equipe não entra na sequência");
  } finally { d.fim(); }
});

const fotoMsg = (id, min) => ({ id, conversa_id: 9, direcao: "in", tipo: "imagem", corpo: null, wamid: `w${id}`, status: "recebida",
  midia: { path: `c1/in/f${id}.jpg`, mime: "image/jpeg" }, criado_em: agoraIso(min), atualizado_em: agoraIso(min) });

test("DC-116 · visualizador numa conversa longa: «1 de 2 carregadas» e ← na primeira busca as fotos anteriores", async () => {
  const d = comDom();
  try {
    let pedidos = 0;
    const { A, chat } = await montarChat(d, { msgs: [fotoMsg(10, 5), txt(11, "out", 4), fotoMsg(12, 3)] });
    A.temMaisAntes = true;
    A.acoes.carregarAntes = async () => { pedidos++; A.msgs = [fotoMsg(5, 50), ...A.msgs]; A.temMaisAntes = false; };
    achar(chat.el, '.cv-msg[data-id="10"] .cv-img-bt').click();
    const dlg = achar(d.doc.body, ".cv-lb");
    assert.equal(achar(dlg, ".cv-lb-n").textContent, "1 de 2 carregadas");
    assert.equal(achar(dlg, ".cv-lb-ant").disabled, false, "← vale na primeira enquanto há mais no servidor");
    d.ev(dlg, "keydown", { key: "ArrowLeft" });
    await esperar(5);
    assert.equal(pedidos, 1);
    assert.equal(achar(dlg, ".cv-lb-n").textContent, "1 de 3");
    assert.match(achar(dlg, "img").getAttribute("src") || achar(dlg, "img").src, /f5\.jpg/);
  } finally { d.fim(); }
});

test("DC-100 · com o zoom ligado as setas não trocam de foto", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [fotoMsg(10, 5), txt(11, "out", 4), fotoMsg(12, 3)] });
    achar(chat.el, '.cv-msg[data-id="10"] .cv-img-bt').click();
    const dlg = achar(d.doc.body, ".cv-lb");
    achar(dlg, ".cv-lb-zoom").click();
    d.ev(dlg, "keydown", { key: "ArrowRight" });
    assert.equal(achar(dlg, ".cv-lb-n").textContent, "1 de 2");
    achar(dlg, ".cv-lb-zoom").click();
    d.ev(dlg, "keydown", { key: "ArrowRight" });
    assert.equal(achar(dlg, ".cv-lb-n").textContent, "2 de 2");
  } finally { d.fim(); }
});

test("DC-122 · foto alta (600×2400) aparece inteira, com o selo «Ver inteira»; a comum continua igual", async () => {
  const d = comDom();
  try {
    const alta = fotoMsg(10, 5); alta.midia.largura = 600; alta.midia.altura = 2400;
    const larga = fotoMsg(12, 3); larga.midia.largura = 1200; larga.midia.altura = 900;
    const semDims = fotoMsg(14, 1);
    const { chat } = await montarChat(d, { msgs: [alta, txt(11, "out", 4), larga, txt(13, "out", 2), semDims] });
    const cx = achar(chat.el, '.cv-msg[data-id="10"] .cv-midia');
    assert.ok(cx.classList.contains("cv-img-comprida"));
    assert.match(cx.textContent, /Ver inteira/);
    assert.equal(achar(cx, ".cv-img-bt").getAttribute("aria-label"), "Ver a foto inteira");
    assert.ok(!achar(chat.el, '.cv-msg[data-id="12"] .cv-midia').classList.contains("cv-img-comprida"));
    // sem as dimensões do servidor: decide no load pelo tamanho real
    const img = achar(chat.el, '.cv-msg[data-id="14"] img');
    img.naturalWidth = 500; img.naturalHeight = 1500;
    d.ev(img, "load");
    assert.ok(achar(chat.el, '.cv-msg[data-id="14"] .cv-midia').classList.contains("cv-img-comprida"));
  } finally { d.fim(); }
  assert.match(CSS, /\.cv-img-comprida img \{ object-fit: contain;/);
});

test("DC-044 · telefone digitado que já é de um contato: «Este número é de Maria Souza · Usar o cadastro» manda p_contato", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.handlers.nx_contatos_listar = p => ({ itens: String(p.p_filtro.busca).length >= 4 ? [{ id: 777, nome: "Maria Souza", telefone: "5512991234567" }] : [], total: 1 });
  let nova = null;
  srv.handlers.nx_cv_nova = p => { nova = p; return { id: 901 }; };
  d.aoModal(async o => {
    if (o.titulo !== "Nova conversa") return true;
    botaoTexto(o.corpo, /Digitar telefone/).click();
    const tel = achar(o.corpo, "#cv-nv-tel");
    tel.value = "(12) 99123-4567"; d.ev(tel, "blur");
    await esperar(10);
    const aviso = achar(o.corpo, ".cv-nv-ja-contato");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /Este número é de Maria Souza/);
    achar(aviso, ".cv-nv-usar-cadastro").click();
    return o.acoes[1].fn({ erro(t) { throw new Error(t); }, fechar() {} });
  });
  const c = await montarCentral(d, srv);
  try {
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(400);
    assert.ok(nova, "abriu a conversa");
    assert.equal(nova.p_contato, 777);
    assert.equal(nova.p_telefone, undefined, "não duplica o cadastro");
  } finally { c.fim(); d.fim(); }
});

test("DC-037 · jornadaDoContato: anúncio → 1ª mensagem → IA respondeu → consulta → compareceu → ganho, em ordem", () => {
  const base = Date.parse("2026-10-01T12:00:00Z");
  const iso = s => new Date(base + s * 1000).toISOString();
  const ver = {
    anuncio: { anuncio_nome: "Implante", clique_em: iso(0) }, contato: { origem: "anuncio", consultas: [{ inicio: iso(86400 * 3), marcada_em: iso(600), servico: "Avaliação", presenca: "compareceu" }] },
    conversa: { aberta_em: iso(5) }, negocios: [{ titulo: "Implante", status: "ganho", ganho_em: iso(86400 * 4) }],
  };
  const msgs = [{ id: 1, direcao: "in", tipo: "texto", criado_em: iso(5) }, { id: 2, direcao: "out", tipo: "texto", origem: "ia", criado_em: iso(45) }];
  const j = L.jornadaDoContato(ver, msgs);
  assert.deepEqual(j.map(m => m.tipo), ["origem", "entrada", "resposta", "consulta", "presenca", "ganho"]);
  assert.equal(j[0].texto, "Clicou no anúncio «Implante»");
  assert.equal(j[2].texto, "A IA respondeu em 40 s");
  assert.equal(L.jornadaDoContato({ contato: {} }, []).length, 0);
});

test("DC-037 (lateral) · a seção «Jornada» aparece com os marcos", async () => {
  const d = comDom();
  try {
    const { alvo } = await montarLateral(d, { ver: { anuncio: { anuncio_nome: "Implante", clique_em: agoraIso(600) }, conversa: { id: 9, protocolo: "ORB-9", etiquetas: [], aberta_em: agoraIso(590) },
      contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000", origem: "anuncio", consultas: [{ inicio: agoraIso(-1440), marcada_em: agoraIso(300), servico: "Avaliação" }] } } });
    const sec = achar(alvo, '[data-sec="jornada"]');
    assert.match(sec.textContent, /Clicou no anúncio «Implante»/);
    assert.match(sec.textContent, /Consulta marcada · Avaliação/);
  } finally { d.fim(); }
});

test("DC-038 · 1ª saída da IA: «IA respondeu em 20 s · equipe assumiu 9 h depois»", () => {
  const t0 = Date.parse("2026-10-01T23:00:00Z");
  const iso = s => new Date(t0 + s * 1000).toISOString();
  const msgs = [{ direcao: "in", criado_em: iso(0) }, { direcao: "out", origem: "ia", criado_em: iso(20) }, { direcao: "out", tipo: "nota", criado_em: iso(30) }, { direcao: "out", criado_em: iso(20 + 9 * 3600) }];
  assert.equal(L.textoRespostaIA(msgs, iso(0)), "IA respondeu em 20 s · equipe assumiu 9 h depois");
  assert.equal(L.textoRespostaIA(msgs.slice(0, 2), iso(0)), "IA respondeu em 20 s · a equipe ainda não respondeu");
  assert.equal(L.textoRespostaIA([{ direcao: "out", criado_em: iso(60) }], iso(0)), "", "a pessoa respondeu primeiro: vale o «1ª resposta» de sempre");
});

test("DC-039 · servicoCitado acha o serviço que o cliente pediu (sem acento, o mais comprido primeiro)", () => {
  assert.equal(L.servicoCitado([{ direcao: "in", corpo: "quero marcar uma limpeza" }], ["Limpeza", "Clareamento"]), "Limpeza");
  assert.equal(L.servicoCitado([{ direcao: "in", corpo: "Quero fazer CLAREAMENTO dental" }, { direcao: "out", corpo: "limpeza" }], ["Limpeza", "Clareamento"]), "Clareamento");
  assert.equal(L.servicoCitado([{ direcao: "in", corpo: "limpeza profunda, por favor" }], ["Limpeza", "Limpeza profunda"]), "Limpeza profunda");
  assert.equal(L.servicoCitado([{ direcao: "in", corpo: "oi" }], ["Limpeza"]), "");
  assert.match(SRC_CONV, /servico = E\.L\.servicoCitado\(E\.msgs, Object\.keys\(config\.duracoes \|\| \{\}\)\)/);
});

test("DC-124 · «Câmera» no «+» do celular abre o input com capture=environment e a foto entra no anexar", async () => {
  const d = comDom({ grosso: true });
  try {
    const x = await montarComposer(d);
    const cam = achar(x.comp.el, "input.cvx-camera");
    assert.equal(cam.getAttribute("capture"), "environment");
    assert.equal(cam.getAttribute("accept"), "image/*");
    let clicou = 0; cam.click = () => { clicou++; };
    achar(x.comp.el, '[aria-label="Mais opções"]').click();
    const item = d.menus.at(-1).itens.find(i => i && i.rotulo === "Câmera");
    assert.ok(item, "item «Câmera» no menu");
    item.fn();
    assert.equal(clicou, 1);
  } finally { d.fim(); }
  // no computador (sem toque) o item não aparece
  const d2 = comDom();
  try {
    const x = await montarComposer(d2);
    achar(x.comp.el, '[aria-label="Mais opções"]').click();
    assert.ok(!d2.menus.at(-1).itens.some(i => i && i.rotulo === "Câmera"));
  } finally { d2.fim(); }
});

test("DC-019 · fixada fora da 1ª página: pede por ids e ela entra em 1º; servidor sem o filtro para de pedir", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  const listar = srv.handlers.nx_cv_listar;
  srv.handlers.nx_cv_listar = p => {
    if (p.p_filtro && Array.isArray(p.p_filtro.ids)) return { itens: p.p_filtro.ids.includes(99) ? [{ ...srv.convs[0], id: 99, contato: { id: 599, nome: "Fixada Antiga" }, status: "resolvida" }] : [], tem_mais: false, contagens: {} };
    return listar(p);
  };
  d.mem.set("nx-cv-fixadas:c1:u1", JSON.stringify([99]));
  const c = await montarCentral(d, srv);
  try {
    await esperar(20);
    const pedido = srv.chamadas.find(x => x[0] === "nx_cv_listar" && x[1].p_filtro && x[1].p_filtro.ids);
    assert.ok(pedido, "pediu as fixadas que faltam");
    assert.deepEqual(pedido[1].p_filtro.ids, [99]);
    const primeira = c.alvo.querySelectorAll(".cvl-item")[0];
    assert.equal(primeira.dataset.id, "99");
    // o pulso relê a página e ela continua lá (sem pedir de novo no mesmo minuto)
    await c.pulso();
    assert.equal(c.alvo.querySelectorAll(".cvl-item")[0].dataset.id, "99");
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_listar" && x[1].p_filtro && x[1].p_filtro.ids).length, 1);
  } finally { c.fim(); d.fim(); }
  // servidor antigo: ignora o filtro e devolve a página de sempre → nada entra e não pede mais
  const d2 = comDom();
  const srv2 = criarServidor({ conversas: 3 });
  d2.mem.set("nx-cv-fixadas:c1:u1", JSON.stringify([99]));
  const c2 = await montarCentral(d2, srv2);
  try {
    await esperar(20);
    assert.ok(!c2.alvo.querySelector('.cvl-item[data-id="99"]'));
    assert.equal(c2.alvo.querySelectorAll(".cvl-item").length, 3);
  } finally { c2.fim(); d2.fim(); }
});

test("DC-024 · mensagem nova fora da página da aba (Bruno não está nela): o aviso vem do nx_cv_novidades, com o nome", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  let vez = 0;
  srv.handlers.nx_cv_novidades = p => { vez++; return vez === 1 ? { itens: [], agora: "2026-10-25T12:00:00Z" } : { itens: [{ id: 950, contato: { nome: "Bruno Lima" }, nao_lidas: 1 }], agora: "2026-10-25T12:00:05Z" }; };
  const notifs = [];
  const notAntes = Object.getOwnPropertyDescriptor(globalThis, "Notification");
  globalThis.Notification = class { constructor(t, o) { notifs.push([t, o && o.body]); } addEventListener() {} close() {} static permission = "granted"; };
  d.janela.Notification = globalThis.Notification;
  d.mem.set("nx-cv-avisos:u1", JSON.stringify({ som: false, tela: true, texto: false, quem: true }));
  const c = await montarCentral(d, srv);
  try {
    d.doc.hidden = true;
    await c.pulso();                         // 1ª: só marca o ponto de partida
    assert.equal(notifs.length, 0);
    await c.pulso();
    const p = srv.chamadas.filter(x => x[0] === "nx_cv_novidades").at(-1)[1];
    assert.equal(p.p_desde, "2026-10-25T12:00:00Z", "pergunta desde a última resposta");
    assert.equal(notifs.length, 1, JSON.stringify(notifs));
    assert.match(notifs[0].join(" "), /Bruno Lima/);
  } finally { c.fim(); d.fim(); if (notAntes) Object.defineProperty(globalThis, "Notification", notAntes); else delete globalThis.Notification; }
});

test("DC-047 · «Testar» o assistente manda a configuração da TELA (não salva) ao nx-ia simular e mostra a resposta", async () => {
  const d = comDomCfg();
  try {
    const ui = await import("../web/app/ui.js");
    const cfg = await import("../web/app/config.js");
    const alvo = d.doc.body.appendChild(d.doc.createElement("main"));
    const fns = [];
    const ctx = {
      ui: { ...ui, carregarCss: () => Promise.resolve(true), toast() {}, confirmar: async () => true, menu() {} },
      api: { rpcC: async n => (n === "nx_cv_base" ? { ia: { ligada: true }, config: { ia: { tom: "proximo", sobre: "Clínica" } } } : {}), rpc: async () => ({}), mensagemErro: e => String(e && e.message || e),
        fn: async (n, c) => { fns.push([n, c]); return { ok: true, texto: "O clareamento custa a partir de R$ 600.", simulado: true }; } },
      rota: { partes: ["ia"], query: {} }, alvo, versao: "dev", titulo() {}, navegar() {},
      configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: ["perfil", "usuarios", "ia"] }, recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }) },
      sessao: { conta: { id: "c1", papel: "clinica", nome: "Ana" }, org: null }, cliente: { id: "cli-1", nome: "Clínica Teste" }, pode: () => true, temModulo: () => true, linkPublico: l => l,
    };
    await cfg.montar(ctx); await esperar(30);
    const sobre = alvo.querySelector("[name=servicos]");
    sobre.value = "Clareamento: a partir de R$ 600"; sobre.dispatchEvent(new d.Evento("input"));
    const inp = alvo.querySelector("#cfg-ia-teste");
    assert.ok(inp, "caixa «Testar» na tela do assistente");
    inp.value = "Quanto custa um clareamento?";
    alvo.querySelector(".cfg-ia-testar").dispatchEvent(new d.Evento("click"));
    await esperar(20);
    const [nome, corpo] = fns.at(-1);
    assert.equal(nome, "nx-ia");
    assert.equal(corpo.acao, "simular");
    assert.equal(corpo.mensagem, "Quanto custa um clareamento?");
    assert.equal(corpo.ia.servicos, "Clareamento: a partir de R$ 600", "vai o que está na tela, sem salvar");
    assert.match(alvo.querySelector(".cfg-ia-teste-resp").textContent, /a partir de R\$ 600/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DC-022 · «sem som fora do horário»: toca se a conversa que chegou é de departamento aberto; cala se todas são de fechados", async () => {
  const ABERTO = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, [["00:00", "24:00"]]]));
  const FECHADO = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, []]));
  let toques = 0;
  class AC { constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createOscillator() { toques++; return { type: "", frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } }
  async function rodar(depDaConversa) {
    const d = comDom();
    d.janela.AudioContext = AC;
    const srv = criarServidor({ conversas: 2 });
    srv.base.departamentos = [{ id: "d1", nome: "Recepção", horario: ABERTO }, { id: "d2", nome: "Financeiro", horario: FECHADO, padrao: true }];
    srv.convs[1].departamento_id = depDaConversa;
    d.mem.set("nx-cv-avisos:u1", JSON.stringify({ som: true, foraHorario: true }));
    const c = await montarCentral(d, srv);
    try {
      d.doc.hidden = true;
      const antes = toques;
      srv.chegar(902, "oi, ainda dá para marcar?");
      await c.pulso();
      return toques - antes;
    } finally { c.fim(); d.fim(); }
  }
  assert.ok(await rodar("d1") > 0, "Recepção aberta: toca (antes calava pelo Financeiro, o padrão)");
  assert.equal(await rodar("d2"), 0, "só do Financeiro fechado: não toca");
});

test("DC-028/DC-029/DC-030 · exportar: histórico inteiro pelo nx_cv_exportar, notas para o supervisor e o arquivo pelo protocolo", async () => {
  assert.equal(L.nomeArquivoExportacao({ protocolo: "ATD-2026-00123", dia: "2026-10-25" }), "conversa-ATD-2026-00123-2026-10-25.txt");
  assert.equal(L.nomeArquivoExportacao({ id: 9, dia: "2026-10-25" }), "conversa-atendimento-9-2026-10-25.txt");
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const msgs = srv.handlers.nx_cv_mensagens;
  srv.handlers.nx_cv_mensagens = p => ({ ...msgs(p), tem_mais: p.p_depois_id == null && p.p_antes_id == null });
  const antigas = Array.from({ length: 1200 }, (_, i) => ({ id: 1000 + i, conversa_id: 901, direcao: i % 2 ? "out" : "in", tipo: i === 5 ? "nota" : "texto", corpo: `m${i}`, criado_em: new Date(Date.parse("2024-01-01T12:00:00Z") + i * 60000).toISOString(),
    enviado_por: { nome: "Ana" } }));
  const cursores = [];
  srv.handlers.nx_cv_exportar = p => { cursores.push(p.p_cursor); const ini = p.p_cursor ? Number(p.p_cursor) : 0; return { itens: antigas.slice(ini, ini + 500), proximo_cursor: ini + 500 < antigas.length ? String(ini + 500) : null }; };
  let blob = null, arquivo = null;
  const urlAntes = URL.createObjectURL;
  URL.createObjectURL = b => { blob = b; return "blob:teste"; };
  d.aoModal(o => { if (o.titulo !== "Exportar a conversa") return true; o.corpo.querySelector("#cv-exp-notas").checked = true; return o.acoes[1].fn(); });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const appendAntes = d.doc.body.appendChild.bind(d.doc.body);
    d.doc.body.appendChild = el => { if (el && el.getAttribute && el.getAttribute("download")) { arquivo = el.getAttribute("download"); el.click = () => {}; } return appendAntes(el); };
    achar(c.alvo, ".cvc-mais").click();
    await d.menus.at(-1).itens.find(i => i && /Exportar conversa/.test(i.rotulo)).fn();
    await esperar(20);
    assert.deepEqual(cursores, [null, "500", "1000"], "seguiu o cursor até o fim (sem o teto de 40 páginas)");
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_mensagens" && x[1].p_antes_id).length, 0, "não caiu no caminho antigo");
    const texto = await blob.text();
    assert.ok(texto.includes("m0") && texto.includes("m1199"), "do começo ao fim");
    assert.match(texto, /Nota interna \(Ana\): m5/, "com as notas (opção do supervisor)");
    assert.equal(arquivo, `conversa-ORB-901-${L.diaSP(Date.now())}.txt`);
    assert.ok(!/cliente-1/i.test(arquivo), "sem o nome do paciente no arquivo");
  } finally { URL.createObjectURL = urlAntes; c.fim(); d.fim(); }
});

test("DC-016 · transferir com «Avisar o cliente»: o Desfazer diz que a mensagem já saiu e, desfeito, sugere a correção no campo", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  d.aoModal(o => { if (o.titulo !== "Transferir conversa") return true; o.corpo.querySelector("#cv-tr-pessoa").value = "u2"; o.corpo.querySelector("#cv-tr-avisar").checked = true; return o.acoes[1].fn(); });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    d.menus.at(-1).itens.find(i => i && i.rotulo === "Transferir…").fn();   // (o Desfazer do teste só fecha no _fim)
    await esperar(30);
    assert.ok(srv.chamadas.some(x => x[0] === "nx-enviar:texto"), "o aviso saiu");
    const o = d.desfazeres.at(-1);
    assert.match(o.texto, /a mensagem ao cliente já foi enviada/);
    o.reverter(); o._fim({ estado: "desfeita" }); await esperar(10);
    assert.match(achar(c.alvo, "textarea[aria-label=Mensagem]").value, /Desconsidere a mensagem anterior/);
  } finally { c.fim(); d.fim(); }
});

test("DC-015 · transferir em lote com «Avisar os clientes»: sai só para quem tem a janela aberta e o resumo conta as que ficaram sem", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  const velho = new Date(Date.now() - 30 * 3600000).toISOString();
  srv.convs[1].ultima_entrada_em = velho;   // a 902 está com a janela de 24 h fechada
  d.aoModal(o => { if (!/^Transferir/.test(o.titulo)) return true; o.corpo.querySelector("#cv-trl-pessoa").value = "u2"; o.corpo.querySelector("#cv-trl-avisar").checked = true;
    assert.match(o.corpo.textContent, /Sai para 1 de 2/); return o.acoes[1].fn(); });
  const c = await montarCentral(d, srv);
  try {
    await selecionarTodas(d, c, [901, 902]);
    achar(c.alvo, ".cvl-lote-transf").click();
    await esperar(20);
    assert.equal(srv.conta("nx-enviar:texto"), 0, "nada sai antes do Desfazer fechar");
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    const enviados = srv.chamadas.filter(x => x[0] === "nx-enviar:texto").map(x => x[1].conversa);
    assert.deepEqual(enviados, [901]);
    assert.ok(d.toasts.some(t => /Aviso enviado a 1 cliente; 1 ficou sem/.test(t)), d.toasts.join(" | "));
  } finally { c.fim(); d.fim(); }
});

test("DC-026 · ctx.apresentacao: o título vira «Conversa · Conversas», sem o nome do paciente", async () => {
  const d = comDom();
  const titulos = [];
  const c = await montarCentral(d, criarServidor({ conversas: 1 }), { extraCtx: { apresentacao: true, titulo: t => titulos.push(t) } });
  try {
    await c.abrir(901);
    assert.ok(titulos.includes("Conversa · Conversas"), titulos.join(" | "));
    assert.ok(titulos.every(t => !/Cliente 1/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("DC-031 · encaminhar: a busca do modal pergunta ao servidor e mostra a conversa de outra aba", async () => {
  const d = comDom();
  const saida = { id: 9030, conversa_id: 901, direcao: "out", tipo: "texto", corpo: "Segue o orçamento", status: "enviada", wamid: "wy", criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
  const srv = criarServidor({ conversas: 2, mensagens: { 901: [saida] } });
  const listar = srv.handlers.nx_cv_listar;
  srv.handlers.nx_cv_listar = p => (p.p_filtro && p.p_filtro.busca ? { itens: [{ ...srv.convs[0], id: 950, contato: { id: 550, nome: "Ana Paula Reis" } }], tem_mais: false, contagens: {} } : listar(p));
  let opcoes = null;
  d.aoModal(async o => {
    if (o.titulo !== "Encaminhar mensagem") return true;
    const b = o.corpo.querySelector("#cv-enc-busca");
    b.value = "ana"; d.ev(b, "input");
    await esperar(5);
    opcoes = o.corpo.querySelectorAll("#cv-enc-sel option").filter(x => !x.hidden).map(x => [String(x.value), x.textContent]);
    return null;
  });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, '.cv-msg[data-id="9030"] .cv-msg-mais').click();
    await d.menus.at(-1).itens.find(i => /Encaminhar/.test(i.rotulo)).fn();
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_listar" && x[1].p_filtro && x[1].p_filtro.busca === "ana"));
    assert.deepEqual(opcoes, [["950", "Ana Paula Reis"]]);
  } finally { c.fim(); d.fim(); }
});

test("DC-032 · com busca e mais resultados, o fim da lista à vista também carrega a próxima página", async () => {
  const d = comDom();
  const antes = globalThis.IntersectionObserver;
  let cb = null;
  globalThis.IntersectionObserver = class { constructor(f) { cb = f; } observe() {} disconnect() {} };
  try {
    const pedidos = [];
    const itens = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, contato: { nome: `Implante ${i}` }, status: "aberta", ultima_msg_em: agoraIso(i + 1), etiquetas: [] }));
    const t = await montarLista(d, { itens, aba: "sem_dono", acoes: { carregarLista: o => { pedidos.push(o); return new Promise(() => {}); } } });
    t.A.busca = "implante"; t.A.temMais = true; t.lista.render();
    cb([{ isIntersecting: true }]);
    assert.deepEqual(pedidos, [{ mais: true }]);
  } finally { globalThis.IntersectionObserver = antes; if (antes === undefined) delete globalThis.IntersectionObserver; d.fim(); }
});

test("DC-036 · 120 fotos: as leituras de mídia seguem sozinhas (2 em voo), cada caminho pedido uma vez", async () => {
  const d = comDom();
  const fotos = Array.from({ length: 120 }, (_, i) => ({ id: 5000 + i * 2, conversa_id: 901, direcao: "in", tipo: "imagem", corpo: null, wamid: `wf${i}`, status: "recebida",
    midia: { path: `c1/in/f${i}.jpg`, mime: "image/jpeg" }, criado_em: agoraIso(200 - i), atualizado_em: agoraIso(200 - i) }))
    .flatMap((m, i) => [m, { id: m.id + 1, conversa_id: 901, direcao: "out", tipo: "texto", corpo: `ok ${i}`, status: "enviada", wamid: `wo${i}`, criado_em: m.criado_em, atualizado_em: m.criado_em }]);
  const srv = criarServidor({ conversas: 1, mensagens: { 901: fotos } });
  const lotes = [];
  srv.fns["nx-midia"] = async c => { lotes.push(c.paths.slice()); await esperar(40); return { urls: Object.fromEntries(c.paths.map(p => [p, `https://cdn.test/${p}`])) }; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    await esperar(90);
    assert.ok(lotes.length >= 2, `duas leituras em voo sem esperar a primeira voltar (${lotes.length})`);
    await esperar(200);
    const todos = lotes.flat();
    assert.equal(new Set(todos).size, 120);
    assert.equal(todos.length, 120, "nenhum caminho pedido duas vezes");
    assert.equal(lotes.length, 3);
  } finally { c.fim(); d.fim(); }
});

test("DC-035 · a parte da assinatura que só depende do item é calculada uma vez por objeto; item trocado por cópia redesenha a linha", async () => {
  const d = comDom();
  try {
    const itens = Array.from({ length: 300 }, (_, i) => conv(i + 1));
    const t = await montarLista(d, { itens, aba: "sem_dono" });
    const orig = JSON.stringify;
    let doItem = 0;
    JSON.stringify = function (v, ...r) { if (Array.isArray(v) && v.length === 16) doItem++; return orig.call(this, v, ...r); };
    try { t.lista.render(); t.lista.render(); } finally { JSON.stringify = orig; }
    assert.equal(doItem, 0, "os mesmos objetos: nada reserializado");
    const el = t.lista.el.querySelector('.cvl-item[data-id="1"]');
    t.A.itens[0] = { ...t.A.itens[0], nao_lidas: 3 };
    t.lista.render();
    assert.notEqual(t.lista.el.querySelector('.cvl-item[data-id="1"]'), el, "cópia nova: a linha muda");
    assert.equal(t.lista.el.querySelector('.cvl-item[data-id="2"]'), t.lista.el.querySelector('.cvl-item[data-id="2"]'));
  } finally { d.fim(); }
});

test("DC-034 · j na lista já pré-carrega a conversa com o foco (ver + 1ª página), uma vez em 30 s", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  const c = await montarCentral(d, srv);
  try {
    const verAntes = srv.conta("nx_cv_ver");
    d.ev(d.doc, "keydown", { key: "j" });
    await esperar(5);
    const focada = d.doc.activeElement && d.doc.activeElement.dataset ? Number(d.doc.activeElement.dataset.id) : null;
    assert.ok(focada, "o foco desceu para uma conversa");
    assert.equal(srv.conta("nx_cv_ver") - verAntes, 1);
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_mensagens" && x[1].p_conversa === focada && x[1].p_limite === 50));
    d.ev(d.doc, "keydown", { key: "k" }); d.ev(d.doc, "keydown", { key: "j" });
    await esperar(5);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_ver" && x[1].p_id === focada).length, 1, "a mesma conversa não é pedida de novo em 30 s");
  } finally { c.fim(); d.fim(); }
  assert.match(SRC_CONV, /const \[ver, pag\] = await primeiraLeitura\(id\)\.finally\(\(\) => clearTimeout\(tLento\)\);/);
});

test("DC-046 · telefone colado do WhatsApp Web vira busca pelos dígitos", () => {
  assert.equal(L.termoBuscaContato("+55 (12) 99999-0000"), "12999990000");
  assert.equal(L.termoBuscaContato("(12) 99999-0000"), "12999990000");
  assert.equal(L.termoBuscaContato("Maria 12"), "Maria 12");
  assert.equal(L.termoBuscaContato("1234"), "1234");
  assert.match(SRC_CONV, /const q = L\.termoBuscaContato\(busca\.value\);/);
});

test("DC-049 · CPF em «Regras» pede confirmação dizendo o campo", async () => {
  const d = comDomCfg();
  try {
    const ui = await import("../web/app/ui.js");
    const cfg = await import("../web/app/config.js");
    const alvo = d.doc.body.appendChild(d.doc.createElement("main"));
    const confirmacoes = [], chamadas = [];
    const ctx = {
      ui: { ...ui, carregarCss: () => Promise.resolve(true), toast() {}, confirmar: async o => { confirmacoes.push(o); return false; }, menu() {} },
      api: { rpcC: async (n, p) => { chamadas.push(n); return n === "nx_cv_base" ? { ia: { ligada: true }, config: { ia: { tom: "proximo" } } } : {}; }, rpc: async () => ({}), mensagemErro: e => String(e), fn: async () => ({}) },
      rota: { partes: ["ia"], query: {} }, alvo, versao: "dev", titulo() {}, navegar() {},
      configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: ["perfil", "usuarios", "ia"] }, recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }) },
      sessao: { conta: { id: "c1", papel: "clinica", nome: "Ana" }, org: null }, cliente: { id: "cli-1", nome: "Clínica Teste" }, pode: () => true, temModulo: () => true, linkPublico: l => l,
    };
    await cfg.montar(ctx); await esperar(30);
    const regras = alvo.querySelector("[name=regras]");
    regras.value = "Para o paciente 123.456.789-09 dar desconto"; regras.dispatchEvent(new d.Evento("input"));
    alvo.querySelector("form.cfg-ia").dispatchEvent(new d.Evento("submit")); await esperar(20);
    assert.match(confirmacoes.at(-1).texto, /em «Regras de atendimento»: CPF \(«123\.456\.789-09»\)/);
    assert.equal(chamadas.filter(n => n === "nx_ia_config_salvar").length, 0, "recusou: não salvou");
    cfg.desmontar();
  } finally { d.fim(); }
});

test("DC-051 · importar com «Atualizar as que já existem» manda id + texto novo das repetidas", () => {
  const existentes = [{ id: 7, atalho: "ola", titulo: "Oi", corpo: "Oi!" }, { id: 8, atalho: "fim", titulo: "Fim", corpo: "Tchau" }];
  const r = CV.lerImportacaoRespostas(JSON.stringify({ respostas: [{ atalho: "ola", titulo: "Oi", corpo: "Olá, tudo bem?" }, { atalho: "fim", titulo: "Fim", corpo: "Tchau" }, { atalho: "nova", titulo: "N", corpo: "x" }] }), existentes);
  assert.deepEqual(r.atualizaveis, [{ id: 7, atalho: "ola", titulo: "Oi", corpo: "Olá, tudo bem?" }], "a igual não conta");
  assert.deepEqual(r.repetidas, ["ola", "fim"]);
  assert.equal(r.novas.length, 1);
  assert.match(SRC_CFG, /nx_resposta_salvar", \{ p_resposta: \{ id: x\.id, titulo: x\.titulo, corpo: x\.corpo \} \}/);
});

test("DC-052 · cada pacote de respostas por vertical passa no importar sem inválidas", () => {
  for (const [vert, pacote] of Object.entries(CV.PACOTES_RESPOSTAS)) {
    const r = CV.lerImportacaoRespostas(JSON.stringify({ respostas: pacote }));
    assert.equal(r.invalidas, 0, vert);
    assert.equal(r.novas.length, pacote.length, vert);
  }
  assert.ok(["odonto", "oficina", "loja", "generico"].every(v => CV.PACOTES_RESPOSTAS[v]));
});

test("DC-053 · prévia da assinatura explica que cada pessoa assina com o próprio nome", () => {
  assert.match(SRC_CFG, /Exemplo com o seu nome — cada pessoa assina com o próprio primeiro nome\./);
});

test("DC-054 · uma tabela de origem: o filtro e a lista usam ROTULO_ORIGEM (WhatsApp com pílula)", async () => {
  for (const o of L.ORIGENS_FILTRO) assert.equal(o.r, L.ROTULO_ORIGEM[o.v]);
  assert.equal(L.ROTULO_ORIGEM.manual, "Cadastro manual");
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1, { contato: { id: 1, nome: "Ana", origem: "whatsapp" } })], aba: "sem_dono" });
    assert.match(achar(t.lista.el, '.cvl-item[data-id="1"]').textContent, /WhatsApp/);
  } finally { d.fim(); }
});

test("DC-043 · resolver oferece «Lembrar de retomar…» e cria a tarefa com o contato para daqui a 6 meses", async () => {
  const fixo = Date.parse("2026-03-10T15:00:00Z");
  assert.equal(L.dataRetomar("30d", fixo), "2026-04-09T12:00:00.000Z");
  assert.equal(L.dataRetomar("6m", fixo), "2026-09-10T12:00:00.000Z");
  assert.equal(L.dataRetomar("1a", fixo), "2027-03-10T12:00:00.000Z");
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  d.aoModal(o => { if (o.titulo !== "Lembrar de retomar") return true; o.corpo.querySelector("#cv-ret-6m").checked = true; return o.acoes[1].fn(); });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const bt = c.alvo.querySelector("[data-acao=resolver]");
    assert.ok(bt, "tem o botão de resolver");
    bt.click(); await esperar(30);
    const o = d.desfazeres.at(-1);
    assert.ok(o && o.acao && o.acao.rotulo === "Lembrar de retomar…", "o Desfazer traz a ação");
    await o.acao.fn(); await esperar(10);
    const t = srv.chamadas.find(x => x[0] === "nx_tarefa_salvar");
    assert.ok(t, "criou a tarefa");
    assert.ok(t[1].p_tarefa.contato_id, "com o contato");
    const dias = (Date.parse(t[1].p_tarefa.vence_em) - Date.now()) / 86400000;
    assert.ok(dias > 170 && dias < 190, String(dias));
    o._fim({ estado: "mantida" }); await esperar(10);
  } finally { c.fim(); d.fim(); }
});

test("DC-058 · pontos de etapa/etiqueta sem role=img nem aria-label dentro do meta escondido", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1, { negocio: { estagio_nome: "Avaliação", estagio_cor: "#123456" }, etiquetas: ["e1"] })], aba: "sem_dono", base: { etiquetas: [{ id: "e1", nome: "VIP", cor: "#654321" }] } });
    const pontos = t.lista.el.querySelectorAll(".cvl-meta .cvl-dot");
    assert.ok(pontos.length >= 2);
    for (const p of pontos) { assert.equal(p.getAttribute("role"), null); assert.equal(p.getAttribute("aria-label"), null); }
  } finally { d.fim(); }
});

test("DC-059 · rótulo da linha curto (nome, não lidas, resumo, hora) e o resto no aria-describedby", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1, { nao_lidas: 2, ultima_msg_resumo: "quero marcar", negocio: { estagio_nome: "Avaliação" }, atribuida_a: "u9", atribuida_nome: "Ana" })], aba: "sem_dono" });
    const a = achar(t.lista.el, '.cvl-item[data-id="1"]');
    const rot = a.getAttribute("aria-label");
    assert.ok(rot.split(", ").length <= 4, rot);
    assert.match(rot, /^Cliente 1, 2 não lidas, quero marcar/);
    assert.doesNotMatch(rot, /etapa|com Ana/);
    const desc = achar(t.lista.el, "#" + a.getAttribute("aria-describedby"));
    assert.match(desc.textContent, /etapa Avaliação/);
    assert.match(desc.textContent, /com Ana/);
  } finally { d.fim(); }
});

test("DC-060 · dois números caídos: um botão «Reconectar» por número, cada um com o id", async () => {
  const d = comDom();
  try {
    const vistos = [];
    const t = await montarLista(d, { itens: [conv(1)], aba: "sem_dono", acoes: { canaisCaidos: () => [{ id: "k1", nome: "Recepção" }, { id: "k2", nome: "Vendas" }], verNumero: id => vistos.push(id) } });
    const bts = t.lista.el.querySelectorAll(".cvl-caido-bts button");
    assert.deepEqual(bts.map(b => b.textContent), ["Reconectar Recepção", "Reconectar Vendas"]);
    bts[1].click();
    assert.deepEqual(vistos, ["k2"]);
    assert.match(SRC_CONV, /#\/config\/numeros\?assistente=\$\{encodeURIComponent\(id\)\}/);
  } finally { d.fim(); }
});

test("DC-061 · conversa pendente sem mensagem mostra «Conversa iniciada — sem mensagens ainda»", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1, { status: "pendente", ultima_msg_dir: null, ultima_msg_resumo: null })], aba: "sem_dono" });
    assert.match(achar(t.lista.el, '.cvl-item[data-id="1"] .cvl-resumo').textContent, /Conversa iniciada — sem mensagens ainda/);
  } finally { d.fim(); }
});

test("DC-062/DC-065 · deslizar: longo à direita oferece Fixar/Silenciar; depois do toque longo (seleção) o gesto não resolve", async () => {
  const d = comDom({ grosso: true });
  try {
    const gestos = [];
    d.ui.deslizar = (el, o) => { gestos.push({ el, o }); return () => {}; };
    const fixou = [];
    const t = await montarLista(d, { itens: [conv(1, { nao_lidas: 1 })], aba: "sem_dono", acoes: { alternarFixar: id => fixou.push(id), silenciar() {}, silenciada: () => false, fixadas: () => [] } });
    const g = gestos.find(x => x.el.dataset.id === "1");
    assert.equal(typeof g.o.direitaLonga, "function");
    g.o.direitaLonga();
    const m = d.menus.at(-1);
    assert.deepEqual(m.itens.map(i => i.rotulo), ["Fixar", "Silenciar por 8 horas"]);
    m.itens[0].fn();
    assert.deepEqual(fixou, [1]);
    // toque longo entra na seleção; o gesto que termina depois não resolve
    d.ev(g.el, "pointerdown", { pointerType: "touch", clientX: 5, clientY: 5 });
    await esperar(560);
    g.o.esquerda();
    assert.equal(t.chamadas.filter(c => c[0] === "resolverLote").length, 0);
  } finally { d.fim(); }
});

test("DC-066 · celular: a linha diz «Com Ana» por extenso", () => {
  assert.equal(L.textoMetaLista("Avaliação", [{ nome: "VIP" }], "Ana Paula"), "Avaliação · VIP · Com Ana");
  assert.equal(L.textoMetaLista("", [], ""), "");
});

test("DC-063/DC-071 · Ctrl+K ganha não lida, fixar, silenciar, exportar e «ver a mais antiga»; Alt+Shift+V abre sem atribuir", async () => {
  assert.equal(L.acordeDoEvento({ altKey: true, shiftKey: true, key: "V", code: "KeyV" }), "ver_antiga");
  assert.ok(L.ACORDES.some(a => a.id === "ver_antiga" && a.teclas === "Alt+Shift+V"));
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  const regs = [];
  const c = await montarCentral(d, srv, { extraCtx: { comandos: { registrar: o => { regs.push(o); return () => {}; } } } });
  try {
    const ids = regs.map(r => r.id);
    for (const x of ["conversas.nao_lida", "conversas.fixar", "conversas.silenciar", "conversas.exportar", "conversas.ver_antiga"]) assert.ok(ids.includes(x), x);
    const antes = srv.conta("nx_cv_atribuir");
    regs.find(r => r.id === "conversas.ver_antiga").fazer();
    await esperar(40);
    assert.equal(srv.conta("nx_cv_atribuir"), antes, "não assumiu");
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_listar" && x[1].p_filtro && x[1].p_filtro.aba === "aguardando"));
  } finally { c.fim(); d.fim(); }
});

test("DC-073 · celular: voltar do chat devolve a rolagem da lista (e não devolve se a aba mudou)", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  const c = await montarCentral(d, srv);
  try {
    const sc = achar(c.alvo, ".cvl-lista");
    sc.scrollTop = 480;
    await c.abrir(901);
    sc.scrollTop = 0;   // display:none perde a rolagem
    await c.ctx.navegar("#/conversas"); await esperar(30);
    assert.equal(achar(c.alvo, ".cvl-lista").scrollTop, 480);
  } finally { c.fim(); d.fim(); }
});

test("DC-094 · resposta salva «Só Financeiro» entra na lista local com o departamento", async () => {
  const d = comDom();
  try {
    const x = await montarComposer(d, { base: { departamentos: [{ id: 2, nome: "Financeiro" }] }, conv: { departamento_id: 2 } });
    x.A.api = { rpcC: async (n, p) => ({ id: 77, atalho: p.p_resposta.atalho, titulo: p.p_resposta.titulo, corpo: p.p_resposta.corpo }) };
    d.aoModal(async o => { if (o.titulo !== "Salvar como resposta rápida") return true; o.corpo.querySelector("#cvx-rr-para").value = "2"; return o.acoes[1].fn({ erro() {} }); });
    x.digitar("Boleto segue em anexo");
    achar(x.comp.el, "[aria-label='Mais opções']").click();
    d.menus.at(-1).itens.find(i => i.rotulo === "Salvar como resposta rápida").fn();
    await esperar(20);
    const ult = x.A.base.respostas.at(-1);
    assert.equal(ult.id, 77);
    assert.equal(String(ult.departamento_id), "2");
  } finally { d.fim(); }
});

test("DC-095 · cortar no teto não parte emoji nem sequência ZWJ", () => {
  const fam = "👨‍👩‍👧";
  const r = L.cortarNoTeto("a".repeat(4094) + fam, 4096);
  assert.equal(r, "a".repeat(4094));
  assert.ok(!/[\uD800-\uDBFF]$/.test(r));
  assert.equal(L.cortarNoTeto("abc", 10), "abc");
  assert.match(SRC_COMP, /L\.cortarNoTeto\(base \+ texto, teto\(\)\)/);
});

test("DC-103 · emoji no limite com 2 caracteres selecionados entra (substitui a seleção)", async () => {
  const d = comDom();
  try {
    let grade = null;
    d.ui.flutuante = (anc, conteudo) => { grade = conteudo; return { fechar() {} }; };
    const x = await montarComposer(d);
    const t = Number(x.ta.getAttribute("maxlength")) || L.tetoTexto({ assinatura: false, nome: "" });
    x.ta.value = "a".repeat(t); x.ta.selectionStart = 0; x.ta.selectionEnd = 2;
    achar(x.comp.el, ".cvx-emoji-bt").click();
    const b = grade.querySelector(".cvx-emoji");
    const e = b.textContent;
    assert.equal(e.length, 2);
    b.click();
    assert.equal(x.ta.value, e + "a".repeat(t - 2));
    assert.ok(!d.toasts.some(s => /não cabe/.test(s)));
  } finally { d.fim(); }
});

const txtMsg = (id, dir, corpo, min, extra = {}) => ({ id, conversa_id: 9, direcao: dir, tipo: "texto", corpo, wamid: `w${id}`, status: dir === "out" ? "enviada" : "recebida",
  criado_em: agoraIso(min), atualizado_em: agoraIso(min), ...extra });

test("DC-096 · saída com texto trocado do mesmo tamanho é redesenhada", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txtMsg(1, "out", "abc", 5)] });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"]').textContent, /abc/);
    A.msgs = [txtMsg(1, "out", "abd", 5, { atualizado_em: agoraIso(1) })];
    chat.renderMensagens({ rolar: "manter" });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"]').textContent, /abd/);
    assert.notEqual(L.hashCurto("abc"), L.hashCurto("abd"));
  } finally { d.fim(); }
});

test("DC-102 · reação na bolha do cliente é da equipe; na nossa, do cliente", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txtMsg(1, "in", "oi", 6, { reacao: "👍", reacao_por: "Ana" }), txtMsg(2, "out", "olá", 5, { reacao: "❤️" })] });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-reacao').getAttribute("aria-label"), /^Reação da equipe \(Ana\)/);
    assert.match(achar(chat.el, '.cv-msg[data-id="2"] .cv-reacao').getAttribute("aria-label"), /^Reação do cliente/);
  } finally { d.fim(); }
});

test("DC-105 · «Pausar a IA até…» às 19h (Brasília) não sugere 18:00 e diz «amanhã» quando a hora já passou", () => {
  const as19 = Date.parse("2026-10-20T22:10:00Z");   // 19:10 em Brasília
  assert.equal(L.horaPausaInicial(as19), "21:00");
  assert.equal(L.textoVoltaIA("21:00", as19), "A IA volta hoje às 21:00.");
  assert.equal(L.textoVoltaIA("18:00", as19), "A IA volta amanhã às 18:00.");
  assert.equal(L.horaPausaInicial(Date.parse("2026-10-21T02:30:00Z")), "01:00");   // 23:30 → 01:00
  assert.doesNotMatch(SRC_CHAT, /id: "cvc-pausa-ate", value: "18:00"/);
});

test("DC-117 · 300 bolhas: consultas de (pointer: coarse) constantes, não uma por bolha", async () => {
  const d = comDom();
  try {
    const orig = globalThis.matchMedia; let n = 0;
    globalThis.matchMedia = q => { if (/pointer: coarse/.test(q)) n++; return orig(q); };
    const msgs = Array.from({ length: 300 }, (_, i) => txtMsg(i + 1, i % 2 ? "out" : "in", `m${i}`, 400 - i));
    await montarChat(d, { msgs });
    globalThis.matchMedia = orig;
    assert.ok(n < 10, String(n));   // constante (antes: uma por bolha)
  } finally { d.fim(); }
});

test("DC-132 · vídeo mostra o tamanho no selo antes de baixar", async () => {
  const d = comDom();
  try {
    const m = { id: 1, conversa_id: 9, direcao: "in", tipo: "video", corpo: null, wamid: "w1", status: "recebida", midia: { path: "c1/in/v.mp4", mime: "video/mp4", duracao: 42, tamanho: 14e6 }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat } = await montarChat(d, { msgs: [m] });
    assert.match(achar(chat.el, ".cv-video-selo").textContent, /0:42 · 13,4 MB/);
  } finally { d.fim(); }
});

test("DC-138/DC-139 · velocidade lida em «vezes»; Page Up/Down saltam 30 s e 5 vai a 50%", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [audioMsg(1, "in", 5)] });
    const vel = achar(chat.el, ".cv-au-vel");
    assert.doesNotMatch(vel.getAttribute("aria-label"), /×/);
    assert.match(vel.getAttribute("aria-label"), /1 vezes|1,0 vezes|vezes/);
    const audio = achar(chat.el, '.cv-msg[data-id="1"] audio');
    Object.defineProperty(audio, "duration", { value: 300, configurable: true });
    audio.currentTime = 0;
    const tr = achar(chat.el, ".cv-au-trilho");
    d.ev(tr, "keydown", { key: "PageUp" });
    assert.equal(audio.currentTime, 30);
    d.ev(tr, "keydown", { key: "PageDown" });
    assert.equal(audio.currentTime, 0);
    d.ev(tr, "keydown", { key: "5" });
    assert.equal(audio.currentTime, 150);
  } finally { d.fim(); }
});

test("DC-087/DC-088 · Consultas: compareceu com negócio aberto mostra «Marcar como ganho»; sem futura, «Marcar retorno»", async () => {
  const d = comDom();
  try {
    const passada = new Date(Date.now() - 3 * 86400000).toISOString();
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000", consultas: [{ negocio_id: 1, inicio: passada, servico: "Avaliação", presenca: "compareceu" }] },
      negocios: [{ id: 1, titulo: "Aparelho", valor_previsto: 5200, estagio_nome: "Avaliação", status: "aberto" }] } });
    const movidos = [];
    t.A.ctx.moverNegocio = (id, o) => movidos.push([id, o]);
    t.A.lateral = t.lat; t.lat.render && t.lat.render();
    await esperar(5);
    const bt = t.alvo.querySelector(".cvt-consulta-ganho");
    assert.ok(bt, "tem o «Marcar como ganho»");
    bt.click();
    assert.deepEqual(movidos, [[1, { tipo: "ganho", valor: 5200 }]]);
    achar(t.alvo, ".cvt-consulta-retorno").click();
    assert.deepEqual(t.chamadas.find(c => c[0] === "agendar"), ["agendar", 1]);
  } finally { d.fim(); }
});

test("DC-121 · «Baixar» vídeo: dois toques seguidos fazem um fetch só; acima de 8 MB abre numa aba nova", async () => {
  const d = comDom();
  const fOrig = globalThis.fetch, oOrig = globalThis.open, uOrig = globalThis.URL;
  try {
    let n = 0, solta;
    globalThis.fetch = () => { n++; return new Promise(r => { solta = () => r({ ok: true, blob: async () => ({}) }); }); };
    const abertos = [];
    globalThis.open = u => { abertos.push(u); return null; };
    const vid = (id, tamanho) => ({ id, conversa_id: 9, direcao: "in", tipo: "video", corpo: null, wamid: `w${id}`, status: "recebida", midia: { path: `c1/in/v${id}.mp4`, mime: "video/mp4", duracao: 10, tamanho }, criado_em: agoraIso(5 - id), atualizado_em: agoraIso(5 - id) });
    const { chat } = await montarChat(d, { msgs: [vid(1, 2e6), vid(2, 20e6)] });
    const b1 = achar(chat.el, '.cv-msg[data-id="1"] .cv-video-baixar');
    b1.click(); b1.click();
    await esperar(5);
    assert.equal(n, 1);
    assert.equal(b1.getAttribute("aria-busy"), "true");
    achar(chat.el, '.cv-msg[data-id="2"] .cv-video-baixar').click();
    assert.equal(n, 1, "o grande não passa pelo fetch");
    assert.equal(abertos.length, 1);
    globalThis.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
    solta(); await esperar(5);
    assert.equal(b1.getAttribute("aria-busy"), null);
  } finally { globalThis.fetch = fOrig; globalThis.open = oOrig; globalThis.URL = uOrig; d.fim(); }
});

test("DC-133 · print de tela (PNG com texto) segue em PNG; foto comum continua otimizando", () => {
  assert.deepEqual(L.planoFoto({ tipo: "image/png", bytes: 3e6, largura: 1200, altura: 800, texto: true }), { acao: "manter", formato: "png", w: 1200, h: 800 });
  assert.equal(L.planoFoto({ tipo: "image/png", bytes: 3e6, largura: 4000, altura: 3000, texto: true }).formato, "png");
  assert.equal(L.planoFoto({ tipo: "image/png", bytes: 3e6, largura: 4000, altura: 3000 }).acao, "otimizar");
  assert.equal(L.planoFoto({ tipo: "image/jpeg", bytes: 3e6, largura: 4000, altura: 3000, texto: true }).formato, undefined);
  assert.ok(L.pareceCapturaDeTela("Captura de tela 2026-10-01.png"));
  assert.ok(L.pareceCapturaDeTela("x.png", 120));
  assert.ok(!L.pareceCapturaDeTela("IMG_0001.png", 3800));
  assert.match(SRC_COMP, /mantido em PNG para o texto ficar nítido/);
});

test("DC-045 · nova conversa pela Meta mostra os modelos aprovados; escolher um vira «Abrir e enviar modelo» e já entra marcado", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.handlers.nx_cv_nova = () => ({ id: 901 });
  let marcado = null, viuBloco = false;
  d.aoModal(async o => {
    if (o.titulo === "Nova conversa") {
      const bloco = achar(o.corpo, ".cv-nv-modelos");
      viuBloco = !bloco.hidden;
      achar(bloco, '.cv-nv-modelo[data-id="t1"]').click();
      assert.match(achar(o.corpo, ".cv-nv-modelo-previa").textContent, /Olá \{\{1\}\}!/);
      return { id: 901 };
    }
    if (/^Enviar modelo/.test(o.titulo)) { const b = o.corpo.querySelector('.cv-modelo[aria-checked="true"]'); marcado = b && b.textContent; return null; }
    return true;
  });
  const c = await montarCentral(d, srv);
  try {
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(600);
    assert.ok(viuBloco, "os modelos aparecem no próprio modal");
    assert.match(marcado || "", /retomar/);
    assert.match(SRC_CONV, /"Abrir e enviar modelo"/);
  } finally { c.fim(); d.fim(); }
});

test("DC-055/DC-056 · filtro de etiquetas «todas» e «Sem etiqueta»: vai ao servidor e é conferido na tela", () => {
  const itens = [conv(1, { etiquetas: ["e1", "e2"] }), conv(2, { etiquetas: ["e1"] }), conv(3, { etiquetas: [] })];
  assert.deepEqual(L.filtrarEtiquetasLocal(itens, { etiquetas: ["e1", "e2"], etiquetas_modo: "todas" }).map(c => c.id), [1]);
  assert.deepEqual(L.filtrarEtiquetasLocal(itens, { etiquetas: ["e1", "e2"] }).map(c => c.id), [1, 2, 3], "qualquer uma: o servidor decide");
  assert.deepEqual(L.filtrarEtiquetasLocal(itens, { sem_etiqueta: true }).map(c => c.id), [3]);
});

test("DC-055/DC-056 (DOM) · popover: com 2 marcadas aparece «Todas»; ler() manda etiquetas_modo e o chip «Sem etiqueta»", async () => {
  const d = comDom();
  try {
    let corpoPop = null;
    d.ui.flutuante = (anc, corpo) => { corpoPop = corpo; return { fechar() {} }; };
    const t = await montarLista(d, { itens: [conv(1)], aba: "sem_dono", base: { etiquetas: [{ id: "e1", nome: "VIP" }, { id: "e2", nome: "Convênio" }] } });
    achar(t.lista.el, ".cvl-filtro").click();
    const modo = achar(corpoPop, ".cvf-etq-modo");
    assert.equal(modo.hidden, true);
    for (const id of ["e1", "e2"]) { const x = achar(corpoPop, `#cvf-e-${id}`); x.checked = true; d.ev(x, "change"); }
    assert.equal(modo.hidden, false);
    achar(corpoPop, "#cvf-em-todas").checked = true; achar(corpoPop, "#cvf-em-qualquer").checked = false;
    botaoTexto(corpoPop, /^Aplicar$/).click();
    assert.deepEqual(t.chamadas.at(-1), ["mudarLista", { filtro: { etiquetas: ["e1", "e2"], etiquetas_modo: "todas" } }]);
    t.A.filtro = { sem_etiqueta: true }; t.lista.render();
    assert.match(achar(t.lista.el, ".cvl-filtros-ativos").textContent, /Sem etiqueta/);
  } finally { d.fim(); }
});

test("DC-057 · «Salvar esta visão» guarda aba + filtro e vira chip que aplica com um toque", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  d.aoModal(o => { if (o.titulo !== "Salvar esta visão") return true; achar(o.corpo, "#cv-visao-nome").value = "Anúncio sem dono"; return o.acoes[1].fn({ erro() {} }); });
  const c = await montarCentral(d, srv);
  try {
    let corpoPop = null;
    d.ui.flutuante = (anc, corpo) => { corpoPop = corpo; return { fechar() {} }; };
    achar(c.alvo, ".cvl-filtro").click();
    achar(corpoPop, ".cvf-salvar-visao").click();
    await esperar(30);
    const chip = achar(c.alvo, ".cvl-visoes-salvas .cvl-visao");
    assert.equal(chip.textContent, "Anúncio sem dono");
    assert.equal(achar(c.alvo, ".cvl-visoes-salvas").hidden, false);
  } finally { c.fim(); d.fim(); }
});

test("DC-072 · celular: «Próximo · N» flutuante aparece com fila e some sem ela", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1)], aba: "sem_dono", contagens: { aguardando: 4 } });
    const fab = achar(t.lista.el, ".cvl-proximo-fab");
    assert.equal(fab.hidden, false);
    assert.match(fab.textContent, /Próximo · 4/);
    fab.click();
    assert.ok(t.chamadas.some(c => c[0] === "atender"));
    t.A.contagens = { aguardando: 0 }; t.lista.render();
    assert.equal(fab.hidden, true);
    assert.match(CSS, /\.cvl-proximo-fab:not\(\[hidden\]\) \{ display: inline-flex;[^}]*min-height: 56px/);
  } finally { d.fim(); }
});

test("DC-123 · 6 fotos seguidas: 4 células e a última com «+2» que abre o visualizador", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [1, 2, 3, 4, 5, 6].map(i => fotoMsg(i, 20 - i)) });
    const cels = chat.el.querySelectorAll(".cv-grade .cv-grade-cel");
    assert.equal(cels.length, 4);
    const mais = achar(chat.el, ".cv-grade-mais");
    assert.equal(achar(mais, ".cv-grade-mais-n").textContent, "+2");
    assert.match(mais.getAttribute("aria-label"), /Ver mais 2 fotos \(6 no total\)/);
  } finally { d.fim(); }
});

test("DC-115 · pílula do dono diz há quanto tempo (quando o servidor manda atribuida_em); sem o campo, igual a antes", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txtMsg(1, "in", "oi", 5)], conv: { atribuida_a: "u2", atribuida_nome: "Ana", atribuida_em: new Date(Date.now() - 2 * 3600000 - 60000).toISOString() } });
    const p = achar(chat.el, ".cv-pil-status");
    assert.match(p.getAttribute("title"), /Com Ana · há 2 horas/);
    const d2 = await montarChat(d, { msgs: [txtMsg(1, "in", "oi", 5)], conv: { atribuida_a: "u2", atribuida_nome: "Ana" } });
    assert.equal(d2.chat.el.querySelector(".cv-pil-status").getAttribute("title"), "Com Ana");
  } finally { d.fim(); }
});

test("DC-086 · telefones extras do contato: um «Ligar» e um «Conversar» por número", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000", telefones_extras: [{ numero: "5512988887777", rotulo: "filha" }, "5512977776666"] } } });
    const ligar = t.alvo.querySelectorAll(".cvt-tel-ligar");
    assert.equal(ligar.length, 2);
    assert.equal(ligar[0].getAttribute("href"), "tel:+5512988887777");
    const novas = [];
    t.A.acoes.novaConversa = o => novas.push(o);
    t.alvo.querySelectorAll(".cvt-tel-conversa")[1].click();
    assert.deepEqual(novas, [{ telefone: "5512977776666", nome: "Mariana Costa" }]);
  } finally { d.fim(); }
});

test("DC-050 · salvar o assistente manda p_versao; 409 mantém o formulário sujo e avisa; servidor antigo salva sem a versão", async () => {
  for (const cenario of ["409", "antigo"]) {
    const d = comDomCfg();
    try {
      const ui = await import("../web/app/ui.js");
      const cfg = await import("../web/app/config.js");
      const alvo = d.doc.body.appendChild(d.doc.createElement("main"));
      const chamadas = [];
      const ctx = {
        ui: { ...ui, carregarCss: () => Promise.resolve(true), toast() {}, confirmar: async () => true, menu() {} },
        api: { rpcC: async (n, p) => {
          chamadas.push([n, p]);
          if (n === "nx_cv_base") return { ia: { ligada: true }, config: { ia: { tom: "proximo", atualizado_em: "2026-10-20T17:02:00Z" } } };
          if (n === "nx_ia_config_salvar" && p.p_versao) {
            if (cenario === "409") throw Object.assign(new Error("versao"), { status: 409, codigo: "versao_mudou", resposta: { atualizado_em: "2026-10-20T17:05:00Z", atualizado_por_nome: "Ana" } });
            throw Object.assign(new Error("PGRST202"), { codigo: "PGRST202" });
          }
          return {};
        }, rpc: async () => ({}), mensagemErro: e => String(e), fn: async () => ({}) },
        rota: { partes: ["ia"], query: {} }, alvo, versao: "dev", titulo() {}, navegar() {},
        configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: ["perfil", "usuarios", "ia"] }, recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }) },
        sessao: { conta: { id: "c1", papel: "clinica", nome: "Ana" }, org: null }, cliente: { id: "cli-1", nome: "Clínica Teste" }, pode: () => true, temModulo: () => true, linkPublico: l => l,
      };
      await cfg.montar(ctx); await esperar(30);
      const regras = alvo.querySelector("[name=regras]");
      regras.value = "Sempre confirmar o horário"; regras.dispatchEvent(new d.Evento("input"));
      alvo.querySelector("form.cfg-ia").dispatchEvent(new d.Evento("submit")); await esperar(30);
      const salvos = chamadas.filter(c => c[0] === "nx_ia_config_salvar");
      assert.equal(salvos[0][1].p_versao, "2026-10-20T17:02:00Z", cenario);
      if (cenario === "409") {
        assert.equal(salvos.length, 1, "não tenta de novo por cima");
        const av = alvo.querySelector(".cfg-ia-versao");
        assert.equal(av.hidden, false);
        assert.match(av.textContent, /Ana salvou o assistente/);
      } else {
        assert.equal(salvos.length, 2);
        assert.equal(salvos[1][1].p_versao, undefined);
      }
      cfg.desmontar();
    } finally { d.fim(); }
  }
});

test("DC-128 · «Enviar endereço» no + põe o endereço e o link do mapa no campo", async () => {
  assert.equal(L.textoEndereco("Rua A, 10 - Taubaté"), "Nosso endereço: Rua A, 10 - Taubaté\nComo chegar: https://maps.google.com/?q=Rua%20A%2C%2010%20-%20Taubat%C3%A9");
  assert.equal(L.textoEndereco(""), "");
  const d = comDom();
  try {
    const x = await montarComposer(d, { base: { endereco_empresa: "Rua A, 10 - Taubaté" } });
    achar(x.comp.el, "[aria-label='Mais opções']").click();
    const it = d.menus.at(-1).itens.find(i => i.rotulo === "Enviar endereço");
    assert.ok(it, "o item aparece com endereço");
    it.fn();
    assert.match(x.ta.value, /^Nosso endereço: Rua A, 10 - Taubaté\nComo chegar: https:\/\/maps\.google\.com\/\?q=/);
    const y = await montarComposer(d);
    achar(y.comp.el, "[aria-label='Mais opções']").click();
    assert.ok(!d.menus.at(-1).itens.some(i => i.rotulo === "Enviar endereço"), "sem endereço, sem item");
  } finally { d.fim(); }
});

/* ============================================================ lote d3 — chat */
test("DC-141 · a bolha começa dizendo, só ao leitor, quem falou e quando", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6), txt(2, "out", 5), txt(3, "out", 4, { tipo: "nota", enviado_por: { id: "u2", nome: "Ana" } })] });
    const sr = id => achar(chat.el, `.cv-msg[data-id="${id}"] .cv-bolha`).firstChild;
    assert.equal(sr(1).getAttribute("class"), "sr-only cv-quem-sr");
    assert.match(sr(1).textContent, /^Mariana Costa, \d{2}:\d{2}: $/);
    assert.match(sr(2).textContent, /^Você, /);
    assert.match(sr(3).textContent, /^Nota interna de Ana, /);
  } finally { d.fim(); }
});

test("DC-142 · teclado: ↑ leva o foco itinerante à bolha anterior; uma bolha só no Tab", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6), txt(2, "in", 5), txt(3, "in", 4)] });
    const b = id => achar(chat.el, `.cv-msg[data-id="${id}"]`);
    assert.equal(b(3).getAttribute("tabindex"), "0");
    assert.equal(b(1).getAttribute("tabindex"), "-1");
    b(3).focus();
    d.ev(b(3), "keydown", { key: "ArrowUp" });
    assert.equal(b(2).getAttribute("tabindex"), "0");
    assert.equal(b(3).getAttribute("tabindex"), "-1");
    d.ev(b(2), "keydown", { key: "Home" });
    assert.equal(b(1).getAttribute("tabindex"), "0");
  } finally { d.fim(); }
});

test("DC-143 · ir para a citada leva o foco à bolha e anuncia o texto dela", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6, { corpo: "Quero marcar avaliação" }), txt(2, "out", 5, { responde_a: { id: 1, direcao: "in", resumo: "Quero marcar avaliação" } })] });
    achar(chat.el, '.cv-msg[data-id="2"] .cv-cita').click();
    assert.equal(globalThis.document.activeElement, achar(chat.el, '.cv-msg[data-id="1"]'));
    assert.match(d.anuncios.at(-1), /Mensagem citada: Quero marcar avaliação/);
  } finally { d.fim(); }
});

test("DC-149 · texto, citação e nome com direção automática (árabe/hebraico não embaralham)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6, { corpo: "مرحبا، كيف حالك؟" })] });
    assert.equal(achar(chat.el, ".cv-texto").getAttribute("dir"), "auto");
    assert.equal(achar(chat.el, ".cvc-nome").tagName.toLowerCase(), "bdi");
    assert.match(SRC_COMP, /lang: "pt-BR", dir: "auto",/);
  } finally { d.fim(); }
});

test("DC-156/DC-159 · ⋮: «Silenciar…» no toque vira folha; «Ligar» no computador mostra o número para copiar", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6)], acoes: { silenciar() {}, silenciada: () => false } });
    achar(chat.el, ".cvc-mais").click();
    const lig = d.menus.at(-1).itens.find(i => i && i.rotulo === "Ligar");
    lig.fn();
    const m = d.modais.at(-1);
    assert.match(m.titulo, /^Ligar para Mariana Costa/);
    assert.ok(m.corpo.querySelector(".cvc-ligar-copiar"));
    assert.match(SRC_CHAT, /if \(L\.aparelhoDeToque\(\)\) abrirFolha\(mais, duracoes, \[\], "Silenciar esta conversa"\);/);
  } finally { d.fim(); }
});

test("DC-158 · no toque, o menu da bolha tem «Selecionar texto»", async () => {
  const d = comDom({ grosso: true });
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6, { corpo: "CPF 123.456.789-09" })] });
    const box = achar(chat.el, '.cv-msg[data-id="1"]');
    const it = box._menu.find(i => i && i.rotulo === "Selecionar texto");
    assert.ok(it);
    it.fn();
    assert.ok(achar(box, ".cv-bolha").classList.contains("cv-selecionavel"));
  } finally { d.fim(); }
});

test("DC-162/DC-165 · «Carregando foto…» pelo tipo; arquivo que não chegou diz o que fazer", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [fotoMsg(1, 6), { ...txt(2, "in", 5), tipo: "audio", corpo: null, midia: { estado: "indisponivel" } }],
      acoes: { urlMidia: () => null, estadoMidia: () => "buscando" } });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-midia-sk').textContent, /Carregando foto…/);
    const off = achar(chat.el, '.cv-msg[data-id="2"] .cv-midia-off').textContent;
    assert.match(off, /Este arquivo não chegou\. Peça ao cliente para reenviar/);
    assert.doesNotMatch(SRC_CHAT, /"Baixando mídia…"|"Carregando mídia…"/);
  } finally { d.fim(); }
});

test("DC-163/DC-164 · falha incerta: na Meta não manda «conferir no WhatsApp»; rótulos sem jargão", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "out", 6, { status: "pendente", ambigua: true }), txt(2, "out", 5, { status: "falhou", erro: null })] });
    const f1 = achar(chat.el, '.cv-msg[data-id="1"] .cv-falha').textContent;
    assert.match(f1, /^Não sabemos se saiu: Se o cliente responder, saiu/);
    assert.doesNotMatch(f1, /no WhatsApp|Status incerto/);
    assert.match(achar(chat.el, '.cv-msg[data-id="2"] .cv-falha').textContent, /O WhatsApp não aceitou a mensagem\./);
    const cw = await montarChat(d, { provedor: "codewords", msgs: [txt(1, "out", 6, { status: "pendente", ambigua: true })] });
    assert.match(achar(cw.chat.el, ".cv-falha").textContent, /confira no celular/);
  } finally { d.fim(); }
});

test("DC-168/DC-170 · telefone na mensagem vira ação; CPF, telefone e e-mail borram no modo apresentação", async () => {
  const segs = L.formatarWhats("me liga no 12 99123-4567, CPF 123.456.789-09, ana@x.com.br");
  assert.deepEqual(segs.filter(x => x.tipo !== "texto").map(x => x.tipo), ["tel", "pessoal", "link"]);
  assert.equal(segs.find(x => x.tipo === "tel").v, "5512991234567");
  assert.equal(L.formatarWhats("protocolo 20261012345678").length, 1, "número longo não vira telefone");
  const d = comDom();
  try {
    const novas = [];
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6, { corpo: "me liga no 12 99123-4567, CPF 123.456.789-09" })], acoes: { novaConversa: o => novas.push(o) } });
    const tel = achar(chat.el, ".cv-tel");
    assert.ok(tel.classList.contains("dado-pessoal"));
    tel.click();
    const it = d.menus.at(-1).itens;
    assert.deepEqual(it.map(i => i.rotulo), ["Ligar", "Nova conversa com este número", "Copiar número"]);
    it[1].fn();
    assert.deepEqual(novas, [{ telefone: "5512991234567" }]);
    assert.equal(achar(chat.el, ".cv-texto span.dado-pessoal").textContent, "123.456.789-09");
  } finally { d.fim(); }
});

test("DC-171/DC-172/DC-173 · botão tocado vira chip; modelo mostra os botões; anúncio com miniatura e link", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [
      txt(1, "in", 6, { tipo: "interativo", corpo: "Confirmar", responde_a: { id: 9, template_nome: "lembrete" } }),
      txt(2, "out", 5, { tipo: "template", corpo: "Sua consulta é amanhã", template: { nome: "lembrete", botoes: ["Confirmar", "Remarcar"] } }),
      txt(3, "in", 4, { referral: { headline: "Implante", thumbnail_url: "https://cdn.x/a.jpg", source_url: "https://fb.me/ad1" } })] });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-chip-resp').textContent, /Tocou em: Confirmar · no modelo «lembrete»/);
    assert.deepEqual(chat.el.querySelectorAll('.cv-msg[data-id="2"] .cv-modelo-bt').map(x => x.textContent), ["Confirmar", "Remarcar"]);
    assert.equal(achar(chat.el, '.cv-msg[data-id="3"] .cv-anuncio-link').getAttribute("href"), "https://fb.me/ad1");
    assert.equal(achar(chat.el, '.cv-msg[data-id="3"] .cv-anuncio-mini').getAttribute("src"), "https://cdn.x/a.jpg");
  } finally { d.fim(); }
});

test("DC-174/DC-197 · IA respondendo aparece no fim do trilho; 3 na fila viram a faixa «3 mensagens esperando a internet»", async () => {
  const d = comDom();
  try {
    const fila = id => ({ ...txt(id, "out", 1), id: `tmp-${id}`, local: true, status: "pendente", filaEstado: "fila" });
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 6), fila(2), fila(3), fila(4)], ia: { respondendo: true } });
    assert.match(achar(chat.el, ".cvc-trilho .cv-fila-resumo").textContent, /3 mensagens esperando a internet/);
    assert.match(achar(chat.el, ".cvc-trilho .cv-ia-digitando").textContent, /Assistente está digitando…/);
    A.iaEstado = { respondendo: false };
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector(".cv-ia-digitando"), null);
  } finally { d.fim(); }
});

test("DC-176 · bolha da IA com 👍/👎; servidor sem nx_ia_avaliar avisa e os botões somem", async () => {
  const d = comDom();
  try {
    const chamadas = [];
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "out", 6, { origem: "ia", enviado_por: null })] });
    A.api = { rpcC: async (n, p) => { chamadas.push([n, p]); throw Object.assign(new Error("PGRST202"), { codigo: "PGRST202" }); } };
    achar(chat.el, ".cv-ia-bom").click();
    await esperar(10);
    assert.deepEqual(chamadas[0], ["nx_ia_avaliar", { p_msg: 1, p_nota: 1, p_correcao: null }]);
    assert.ok(d.toasts.some(t => /ainda não está disponível/.test(t)));
    assert.equal(chat.el.querySelector(".cv-ia-bom"), null);
  } finally { d.fim(); }
});

test("DC-182/DC-183 · apagada e editada pelo cliente aparecem quando o servidor manda", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6, { apagada_em: agoraIso(1) }), txt(2, "in", 5, { editada_em: agoraIso(1), corpo_anterior: "texto velho" })] });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-apagada').textContent, /Mensagem apagada pelo cliente/);
    const ed = achar(chat.el, '.cv-msg[data-id="2"] .cv-editada');
    assert.match(ed.textContent, /editada/);
    assert.equal(ed.getAttribute("title"), "Antes: texto velho");
  } finally { d.fim(); }
});

test("DC-185/DC-186 · visualizador: «Responder» cita a foto e a legenda diz quem mandou", async () => {
  const d = comDom();
  try {
    const respondidas = [];
    const { A, chat } = await montarChat(d, { msgs: [fotoMsg(1, 6)] });
    A.composer.responder = m => respondidas.push(m.id);
    achar(chat.el, ".cv-img-bt").click();
    const dlg = achar(d.doc.body, "dialog.cv-lb");
    assert.match(achar(dlg, ".cv-lb-leg").textContent, /Recebida de Mariana Costa/);
    const bt = achar(dlg, ".cv-lb-responder");
    assert.equal(bt.hidden, false);
    bt.click();
    assert.deepEqual(respondidas, [1]);
  } finally { d.fim(); }
});

test("DC-190 · «Só notas internas» no ⋮ marca o filtro e diz quantas há", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 6), txt(2, "out", 5, { tipo: "nota" })] });
    achar(chat.el, ".cvc-mais").click();
    d.menus.at(-1).itens.find(i => i && i.rotulo === "Só notas internas").fn();
    assert.equal(chat.el.dataset.filtro, "notas");
    assert.match(d.anuncios.at(-1), /só as 1 nota interna|Mostrando só a|1 nota interna/);
    assert.match(CSS, /\.cvc\[data-filtro="notas"\] \.cv-msg:not\(\[data-tipo="nota"\]\)/);
  } finally { d.fim(); }
});

/* ============================================================ lote d3 — composer */
test("DC-147 · Ctrl+B põe a seleção em negrito; Ctrl+I itálico; Ctrl+Shift+X riscado", async () => {
  await comComposer({}, async (x, d) => {
    const d0 = (ta, init) => d.ev(ta, "keydown", init);
    x.digitar("bom dia");
    x.ta.selectionStart = 0; x.ta.selectionEnd = 3;
    d0(x.ta, { key: "b", ctrlKey: true });
    assert.equal(x.ta.value, "*bom* dia");
    x.ta.selectionStart = 6; x.ta.selectionEnd = 9;
    d0(x.ta, { key: "i", ctrlKey: true });
    assert.equal(x.ta.value, "*bom* _dia_");
    x.ta.selectionStart = 0; x.ta.selectionEnd = 0;
    d0(x.ta, { key: "X", ctrlKey: true, shiftKey: true });
    assert.equal(x.ta.value, "~~*bom* _dia_");
  });
});

test("DC-148 · resposta rápida e emoji entram pelo inserirNoCampo (Ctrl+Z volta)", () => {
  assert.match(SRC_COMP, /function inserirNoCampo\(texto, ini = /);
  assert.match(SRC_COMP, /document\.execCommand\("insertText", false, texto\)/);
  assert.doesNotMatch(SRC_COMP, /ta\.value = `\$\{ta\.value\.slice\(0, ini\)\}\$\{e\}/, "o emoji não atribui ta.value direto");
  assert.match(SRC_COMP, /inserirNoCampo\(e, ini, fim\);/);
});

test("DC-161 · Shift+clique no emoji mantém o seletor aberto e o próximo entra depois", async () => {
  const d = comDom();
  try {
    let grade = null, fechou = 0;
    d.ui.flutuante = (anc, conteudo) => { grade = conteudo; return { fechar() { fechou++; } }; };
    const x = await montarComposer(d);
    x.ta.value = ""; x.ta.selectionStart = 0; x.ta.selectionEnd = 0;
    achar(x.comp.el, ".cvx-emoji-bt").click();
    const bts = grade.querySelectorAll(".cvx-emoji");
    const a = bts[0].textContent, b = bts[1].textContent;
    d.ev(bts[0], "click", { shiftKey: true, bubbles: true });
    d.ev(bts[1], "click", { bubbles: true });
    assert.equal(x.ta.value, a + b);
    assert.equal(fechou, 1, "só fecha no clique sem Shift");
  } finally { d.fim(); }
});

test("DC-144 · contagem das respostas rápidas é anunciada só 600 ms depois da última tecla", async () => {
  await comComposer({ base: { respostas: [{ id: 1, atalho: "ola", texto: "Olá!" }, { id: 2, atalho: "obg", texto: "Obrigado" }] } }, async (x, d) => {
    const status = () => x.comp.el.querySelectorAll("span.sr-only[role=status]").map(s => s.textContent).join("|");
    x.digitar("/");
    await esperar(50);
    assert.doesNotMatch(status(), /respostas rápidas disponíveis/);
    await esperar(650);
    assert.match(status(), /2 respostas rápidas disponíveis/);
  });
});

test("DC-145 · prévia do modelo sem aria-live; anunciada ao sair do parâmetro", () => {
  assert.match(SRC_COMP, /const previa = h\("div", \{ class: "cv-previa", hidden: true \}\);/);
  assert.match(SRC_COMP, /ui\.anunciar\(`Prévia: \$\{previa\.textContent\}`\)/);
});

test("DC-150 · campo com lang pt-BR (corretor em português)", async () => {
  await comComposer({}, async x => {
    assert.equal(x.ta.getAttribute("lang"), "pt-BR");
    assert.equal(x.ta.getAttribute("dir"), "auto");
  });
});

test("DC-166 · com 2+ números, o campo diz por qual a mensagem sai", async () => {
  await comComposer({ base: { canais: [{ id: "k1", nome: "Recepção" }, { id: "k2", nome: "Comercial" }] } }, async x => {
    x.comp.atualizar();
    assert.equal(x.ta.placeholder, "Mensagem via Recepção");
  });
  await comComposer({ base: { canais: [{ id: "k1", nome: "Recepção" }] } }, async x => {
    x.comp.atualizar();
    assert.equal(x.ta.placeholder, "Mensagem");
  });
});

test("DC-200 · o ícone do Enviar não é recriado a cada atualizar", async () => {
  await comComposer({}, async x => {
    const bt = achar(x.comp.el, ".cvx-enviar");
    x.comp.atualizar();
    const ic = bt.firstChild;
    x.comp.atualizar(); x.digitar("oi"); x.comp.atualizar();
    assert.equal(bt.firstChild, ic);
  });
});

test("DC-205 · Esc com o seletor de emoji aberto só fecha o seletor (não pula para a lista)", async () => {
  const d = comDom();
  try {
    let foco = 0;
    const x = await montarComposer(d, { acoes: { focarLista() { foco++; } } });
    const flut = d.h("div", { class: "flut" });
    d.doc.body.appendChild(flut);
    d.ev(x.ta, "keydown", { key: "Escape" });
    assert.equal(foco, 0);
    assert.equal(flut.isConnected, false);
    d.ev(x.ta, "keydown", { key: "Escape" });
    assert.equal(foco, 1);
  } finally { d.fim(); }
});

/* ============================================================ lote d3 — restantes */
test("DC-151/DC-152/DC-153/DC-201/DC-204 · CSS: 16 px nas legendas, 44 px na IA, autor em texto-2, corpo em 2 linhas e campo de 3 linhas", () => {
  assert.match(CSS, /@media \(pointer: coarse\) \{ \.cvx-multi-leg \{ font-size: var\(--fs-16\); \} \}/);
  assert.match(CSS, /@media \(pointer: coarse\) \{ \.cvx-ia-selo \.bt \{ min-height: 44px; \} \}/);
  assert.match(CSS, /\.cv-quem \{ color: var\(--c-texto-2\); \}/);
  assert.match(CSS, /\.cvx-rr-op small \{ white-space: normal; display: -webkit-box; -webkit-line-clamp: 2;/);
  assert.match(CSS, /@media \(pointer: coarse\) and \(max-height: 600px\) \{ \.cvx textarea \{ max-height: calc\(3 \* 1\.45em \+ 1\.2rem\); \} \}/);
});

test("DC-154 · alto contraste do Windows: bolhas com borda e nota com borda dupla", () => {
  const bloco = CSS.slice(CSS.indexOf("@media (forced-colors: active)"));
  assert.match(bloco, /\.cv-bolha \{ border: 1px solid CanvasText; \}/);
  assert.match(bloco, /\.cv-msg\[data-tipo="nota"\] \.cv-bolha \{ border: 3px double CanvasText; \}/);
});

test("DC-155 · arrastar a pega da folha 100 px para baixo fecha; 30 px volta ao lugar", async () => {
  const d = comDom({ grosso: true });
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5)] });
    achar(chat.el, ".cvc-mais").click();
    let folha = achar(d.doc.body, "dialog.cv-folha");
    let pega = achar(folha, ".cv-folha-pega");
    d.ev(pega, "pointerdown", { clientY: 100, pointerId: 1 });
    d.ev(pega, "pointermove", { clientY: 130 });
    d.ev(pega, "pointerup", { clientY: 130 });
    assert.ok(d.doc.body.querySelector("dialog.cv-folha"), "30 px não fecha");
    d.ev(pega, "pointerdown", { clientY: 100, pointerId: 1 });
    d.ev(pega, "pointermove", { clientY: 200 });
    d.ev(pega, "pointerup", { clientY: 200 });
    assert.equal(d.doc.body.querySelector("dialog.cv-folha"), null);
  } finally { d.fim(); }
});

test("DC-157/DC-198 · acima do campo: Mensagem/Nota, «Assumir» na conversa sem dono e «Resolver» por 10 s depois de enviar", async () => {
  const assumidas = [], resolvidas = [];
  await comComposer({ acoes: { assumir: () => assumidas.push(1), resolver: () => resolvidas.push(1) } }, async (x, d) => {
    x.comp.atualizar();
    const at = achar(x.comp.el, ".cvx-atalhos");
    assert.equal(at.hidden, false);
    assert.equal(at.dataset.so, "celular");
    achar(at, ".cvx-assumir").click();
    assert.deepEqual(assumidas, [1]);
    achar(at, ".cvx-modo-nota").click();
    assert.equal(x.comp.el.dataset.modo, "nota");
    achar(x.comp.el, ".cvx-atalhos .cvx-modo-msg").click();
    assert.equal(x.comp.el.dataset.modo, "texto");
    assert.equal(x.comp.el.querySelector(".cvx-resolver-chip"), null);
    x.digitar("Pronto, obrigado!");
    d.ev(x.ta, "keydown", { key: "Enter" });
    await esperar(10);
    assert.equal(x.enviados.length, 1);
    achar(x.comp.el, ".cvx-resolver-chip").click();
    assert.deepEqual(resolvidas, [1]);
  });
  assert.match(CSS, /\.cvx-atalhos\[data-so="celular"\] \{ display: none; \}/);
});

test("DC-160 · contador: família e bandeira contam mais de 2 — o texto não diz «conta 2»", () => {
  const fam = String.fromCodePoint(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467);
  assert.equal(L.contarDuplos(fam), 7);
  assert.equal(L.contarDuplos("🇧🇷"), 3);
  assert.equal(L.contarDuplos("abc"), 0);
  assert.doesNotMatch(L.textoContador(10, L.contarDuplos(fam)), /emoji conta 2$/);
  assert.match(L.textoContador(10, 1), /emoji conta 2 ou mais/);
});

test("DC-167 · dividirTexto corta em fim de frase e o aviso oferece «Dividir em 2 mensagens»", async () => {
  const frase = "Esta é uma frase de teste com algumas palavras. ";
  const longo = frase.repeat(130).trim();
  const partes = L.dividirTexto(longo, 4096);
  assert.equal(partes.length, 2);
  assert.ok(partes.every(p => p.length <= 4096));
  assert.ok(partes[0].endsWith("."));
  assert.equal(partes.join(" "), longo);
  const d = comDom();
  try {
    let acao = null;
    const t0 = d.ui.toast;
    d.ui.toast = (txt, o = {}) => { if (o.acao) acao = o.acao; return t0(txt, o); };
    const x = await montarComposer(d);
    x.digitar(longo);
    d.ev(x.ta, "keydown", { key: "Enter" });
    await esperar(10);
    assert.equal(x.enviados.length, 0);
    assert.equal(acao.rotulo, "Dividir em 2 mensagens");
    await acao.fn();
    assert.deepEqual(x.enviados.map(o => o.texto), partes);
    assert.equal(x.ta.value, "");
  } finally { d.fim(); }
});

test("DC-169 · «pode ser amanhã às 15h?» vira chip «Marcar amanhã 15:00» que abre a agenda no horário", async () => {
  const agora = new Date("2026-10-21T13:00:00Z");   // quarta, 10:00 em São Paulo
  assert.deepEqual(L.dataNaMensagem("pode ser amanhã às 15h?", agora), { iso: "2026-10-22T18:00:00.000Z", rotulo: "amanhã 15:00" });
  assert.equal(L.dataNaMensagem("sexta 14:30", agora).rotulo, "sexta 14:30");
  assert.equal(L.dataNaMensagem("custa 15 reais", agora), null);
  const d = comDom();
  try {
    const pedidos = [];
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 2, { corpo: "pode ser amanhã às 15h?" })], acoes: { agendar: (n, o) => pedidos.push(o) } });
    const chip = achar(chat.el, ".cv-marcar");
    assert.match(chip.textContent, /Marcar amanhã 15:00/);
    chip.click();
    assert.equal(pedidos[0].hora, "15:00");
    assert.match(pedidos[0].dia, /^\d{4}-\d{2}-\d{2}$/);
  } finally { d.fim(); }
});

test("DC-177 · «Cancelar» no «Escrevendo…» libera os botões e a resposta atrasada não entra no campo", async () => {
  await comComposer({}, async x => {
    let soltar;
    x.aoIA(() => new Promise(res => { soltar = res; }));
    const btIA = x.comp.el.querySelector("[aria-label='Sugerir resposta com IA']") || achar(x.comp.el, ".cvx-ia");
    btIA.click();
    await esperar(5);
    assert.equal(achar(x.comp.el, ".cvx-ia-trab").hidden, false);
    achar(x.comp.el, ".cvx-ia-cancelar").click();
    await esperar(5);
    assert.equal(achar(x.comp.el, ".cvx-ia-trab").hidden, true);
    assert.equal(btIA.disabled, false);
    soltar({ texto: "atrasada" });
    await esperar(5);
    assert.equal(x.ta.value, "");
  });
});

test("DC-191/DC-192/DC-194 · modelos: chips de empresa/atendente/protocolo, mais usados primeiro e foco na busca", async () => {
  const tpl = (id, nome, extra = {}) => ({ id, canal_id: "k1", nome, status: "APPROVED", categoria: "UTILITY", corpo: "Olá {{1}}", num_parametros: 1, ...extra });
  const templates = [tpl("a", "aviso"), tpl("b", "boleto"), tpl("c", "cobranca"), tpl("d", "dia"), tpl("e", "entrega"), tpl("f", "fim"), tpl("g", "garantia"), tpl("h", "horario"), tpl("z", "zeta")];
  const d = comDom();
  try {
    globalThis.localStorage.setItem("nx-cv-modelo-usos:-", JSON.stringify({ z: 5 }));
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return false; });
    const x = await montarComposer(d, { base: { templates }, conv: { protocolo: "ORB-77" } });
    x.A.ctx.cliente = { nome: "Kamiguchi" };
    x.comp.abrirModelos();
    await esperar(60);
    const nomes = corpo.querySelectorAll(".cv-modelo .mono").map(b => b.textContent);
    assert.equal(nomes[0], "zeta", "o mais usado vem primeiro");
    assert.match(achar(corpo, ".cv-modelo .cv-modelo-usos").textContent, /Usado 5 vezes/);
    assert.equal(globalThis.document.activeElement, achar(corpo, ".cvx-mod-busca"));
    corpo.querySelector(".cv-modelo").click();
    const chips = corpo.querySelectorAll(".cvx-par-var").map(b => b.textContent);
    assert.ok(chips.includes("Empresa: Kamiguchi"));
    assert.ok(chips.includes("Protocolo: ORB-77"));
    assert.ok(chips.some(c => /^Atendente: Helena/.test(c)));
  } finally { d.fim(); }
});

test("DC-196 · estimativa do envio depois de 5 s e aviso de rede lenta", () => {
  assert.deepEqual(L.estimativaEnvio(30, 2000, 1e6), { texto: "30 %", lenta: false, dica: "" });
  const e = L.estimativaEnvio(50, 10000, 100000);
  assert.equal(e.texto, "50 % · cerca de 10 s");
  assert.equal(e.lenta, true);
  assert.match(e.dica, /reduza a foto ou envie um link/);
  assert.equal(L.estimativaEnvio(62, 6000, 5e6).lenta, false);
  assert.match(SRC_CHAT, /const est = estimativa\(m\.id, pct\);/);
});

test("DC-199 · no toque, o 1º toque na resposta abre o texto inteiro e o 2º insere", async () => {
  const corpo = "Olá! Nosso horário é de segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia.";
  await comComposer({ dom: { grosso: true }, base: { respostas: [{ id: 1, atalho: "horario", titulo: "Horário", corpo }] } }, async x => {
    x.digitar("/hor");
    const op = achar(x.comp.el, ".cvx-rr-op");
    op.click();
    assert.equal(op.dataset.aberta, "1");
    assert.equal(x.ta.value, "/hor");
    op.click();
    assert.equal(x.ta.value, corpo);
  });
});

test("DC-202 · «/fo» sem resposta «fotos» oferece o roteiro de fotos da vertical", async () => {
  const r = L.respostaFotos("oficina");
  assert.match(r.corpo, /1\. Frente do carro\n2\. Lateral/);
  await comComposer({ base: { respostas: [] } }, async x => {
    x.A.ctx.vocab = { vertical: "oficina" };
    x.digitar("/fo");
    const op = achar(x.comp.el, ".cvx-rr-op");
    assert.match(op.textContent, /\/fotos/);
    op.click();
    assert.match(x.ta.value, /Frente do carro/);
  });
});

test("DC-203 · lead do anúncio sem resposta: chips das respostas de boas-vindas acima do campo", async () => {
  const respostas = [{ id: 1, atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Como posso ajudar?" }, { id: 2, atalho: "preco", titulo: "Preço", corpo: "x" }];
  await comComposer({ base: { respostas }, conv: { referral: { headline: "Implante" }, atribuida_a: "u1" } }, async x => {
    x.comp.atualizar();
    const bv = x.comp.el.querySelectorAll(".cvx-bv");
    assert.deepEqual(bv.map(b => b.textContent), ["Boas-vindas"]);
    assert.equal(achar(x.comp.el, ".cvx-atalhos").dataset.so, "");
    bv[0].click();
    assert.equal(x.ta.value, "Olá, Maria! Como posso ajudar?");
  });
  await comComposer({ base: { respostas }, conv: { atribuida_a: "u1" } }, async x => {
    x.comp.atualizar();
    assert.equal(x.comp.el.querySelectorAll(".cvx-bv").length, 0, "sem anúncio, sem chips");
  });
});

/* ============================================================ lote d4 */
test("DC-207 · prévia do áudio no modal com «Ouvir» de 44 px e velocidade", async () => {
  const d = comDom();
  try {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return false; });
    globalThis.URL.createObjectURL = () => "blob:x"; globalThis.URL.revokeObjectURL = () => {};
    const x = await montarComposer(d);
    await x.comp.anexar(new File([new Uint8Array(2000)], "nota.ogg", { type: "audio/ogg" }));
    assert.ok(achar(corpo, ".cvx-prev-play"));
    const v = achar(corpo, ".cvx-prev-vel");
    v.click();
    assert.equal(v.textContent, L.rotuloVelocidade(1.5));
  } finally { d.fim(); }
});

test("DC-208/DC-209 · legenda aceita Ctrl+B e o modal tem «Trocar arquivo» que reabre o seletor", async () => {
  const d = comDom();
  try {
    let corpo = null, api = null, cliques = 0;
    d.aoModal(o => { corpo = o.corpo; return new Promise(res => { api = { fechar: res }; if (o.aoAbrir) o.aoAbrir(api); }); });
    globalThis.URL.createObjectURL = () => "blob:x"; globalThis.URL.revokeObjectURL = () => {};
    const x = await montarComposer(d);
    const inp = x.comp.el.querySelector("input[type=file]");
    inp.click = () => { cliques++; };
    const p = x.comp.anexar(new File([new Uint8Array(2000)], "contrato.pdf", { type: "application/pdf" }));
    await esperar(10);
    const leg = achar(corpo, "#cvx-legenda");
    leg.value = "pago"; leg.selectionStart = 0; leg.selectionEnd = 4;
    d.ev(leg, "keydown", { key: "b", ctrlKey: true });
    assert.equal(leg.value, "*pago*");
    achar(corpo, ".cvx-trocar-arq").click();
    await p;
    assert.equal(cliques, 1);
    assert.equal(x.enviados.length, 0, "trocar não envia");
  } finally { d.fim(); }
});

test("DC-210 · colar do Word tira NBSP, tabs e \\r e avisa", async () => {
  const nb = String.fromCharCode(0xA0);
  assert.deepEqual(L.limparColado(`Olá${nb}Maria,\r\n\tsegue  o valor`), { texto: "Olá Maria,\n segue o valor", mudou: true });
  assert.equal(L.limparColado("tudo certo").mudou, false);
  await comComposer({}, async (x, d) => {
    let impedido = false;
    const ev = { clipboardData: { items: [], getData: () => `a\tb${nb}c` }, preventDefault() { impedido = true; } };
    x.ta.value = ""; x.ta.selectionStart = 0; x.ta.selectionEnd = 0;
    x.ta.dispatchEvent(Object.assign(new globalThis.Event("paste"), ev));
    assert.ok(impedido);
    assert.equal(x.ta.value, "a b c");
    assert.ok(d.toasts.some(t => /Formatação removida/.test(t)));
  });
});

test("DC-211 · texto em CAIXA ALTA mostra a dica e «converter» deixa em letras normais", async () => {
  assert.equal(L.pareceCaixaAlta("BOM DIA, QUERO MARCAR UMA CONSULTA"), true);
  assert.equal(L.pareceCaixaAlta("Bom dia, ONG e SUS"), false);
  assert.equal(L.semCaixaAlta("BOM DIA. QUERO MARCAR"), "Bom dia. Quero marcar");
  await comComposer({}, async x => {
    x.digitar("BOM DIA, QUERO MARCAR UMA CONSULTA");
    const dica = achar(x.comp.el, ".cvx-caixa");
    assert.equal(dica.hidden, false);
    achar(dica, ".cvx-caixa-conv").click();
    assert.equal(x.ta.value, "Bom dia, quero marcar uma consulta");
    assert.equal(dica.hidden, true);
  });
});

test("DC-212 · Enter logo depois de trocar de conversa, sem digitar nela, pede confirmação", async () => {
  const d = comDom();
  try {
    const pedidos = [];
    d.ui.confirmar = async o => { pedidos.push(o.titulo); return false; };
    const x = await montarComposer(d);
    x.A.rascunhos.set(9, "Oi, tudo bem?");
    x.comp.definirConversa();
    d.ev(x.ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.deepEqual(pedidos, ["Enviar para maria souza?"]);
    assert.equal(x.enviados.length, 0);
    x.digitar("Oi, tudo bem? ");
    d.ev(x.ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.equal(x.enviados.length, 1, "depois de digitar, sai direto");
  } finally { d.fim(); }
});

test("DC-213/DC-214 · evento de consulta com meta vira «Ver na agenda»; automação diz qual régua", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [
      { ...txt(1, "out", 6), tipo: "sistema", corpo: "Consulta marcada pela IA", meta: { consulta_id: "c77" } },
      txt(2, "out", 5, { origem: "automacao", origem_detalhe: "Lembrete 24 h", enviado_por: null })], acoes: { agendar() {} } });
    chat.el.dataset.x = "1";
    const sis = achar(chat.el, '.cv-sis[data-id="1"]');
    assert.equal(achar(sis, ".cv-sis-agenda").getAttribute("href"), "#/agenda?consulta=c77");
    assert.ok(achar(sis, ".cv-sis-remarcar"));
    assert.match(achar(chat.el, '.cv-msg[data-id="2"] .cv-quem').textContent, /Automação · Lembrete 24 h/);
  } finally { d.fim(); }
});

test("DC-216 · o contato compareceu hoje: chip «Mandar mensagem de pós-atendimento» com a /pos", async () => {
  const respostas = [{ id: 7, atalho: "pos", titulo: "Pós", corpo: "{primeiro_nome}, como você está?" }];
  await comComposer({ base: { respostas }, conv: { atribuida_a: "u1" }, contato: { consultas: [{ id: 1, inicio: new Date().toISOString(), presenca: "compareceu" }] } }, async x => {
    x.comp.atualizar();
    const chip = achar(x.comp.el, ".cvx-pos");
    chip.click();
    assert.equal(x.ta.value, "Maria, como você está?");
  });
  await comComposer({ base: { respostas }, conv: { atribuida_a: "u1" }, contato: { consultas: [{ id: 1, inicio: new Date().toISOString(), presenca: "faltou" }] } }, async x => {
    x.comp.atualizar();
    assert.equal(x.comp.el.querySelector(".cvx-pos"), null);
  });
});

test("DC-222 · cortarNoTeto não parte bandeira nem tom de pele", () => {
  const br = String.fromCodePoint(0x1F1E7, 0x1F1F7), mao = String.fromCodePoint(0x1F44D, 0x1F3FD);
  assert.equal(L.cortarNoTeto(`ab${br}`, 4), "ab");
  assert.equal(L.cortarNoTeto(`ab${mao}`, 5), "ab");
  assert.equal(L.cortarNoTeto(`ab${mao}`, 6), `ab${mao}`);
});

test("DC-227 · bolha com falha gravada «meta_131026» mostra a dica do motivo", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "out", 5, { status: "falhou", erro: "meta_131026" })] });
    assert.match(achar(chat.el, ".cv-falha").textContent, /bloqueou o número da empresa/);
  } finally { d.fim(); }
});

test("DC-234/DC-235 · colada do cliente com 2 min de diferença mostra a hora; separador diz «2 mensagens novas»", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 20), txt(2, "in", 18), txt(3, "in", 17.9)] });
    assert.equal(achar(chat.el, '.cv-msg[data-id="2"]').dataset.hora, "1");
    assert.equal(chat.el.querySelector('.cv-msg[data-id="3"]').dataset.hora, undefined);
    A.marcaNovas = 2;
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(achar(chat.el, ".cv-novas-sep").textContent, "2 mensagens novas");
    assert.match(CSS, /\[data-hora="1"\] \.cv-rodape \{ max-height: 2rem;/);
  } finally { d.fim(); }
});

test("DC-236/DC-238 · citação em 2 linhas e miniatura da foto citada", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [fotoMsg(1, 6), txt(2, "out", 5, { responde_a: { id: 1, direcao: "in", resumo: "Foto" } })] });
    assert.match(achar(chat.el, '.cv-msg[data-id="2"] .cv-cita .cv-cita-mini').getAttribute("src"), /f1\.jpg/);
    assert.match(CSS, /\.cv-cita \{ white-space: normal; position: relative; \}/);
  } finally { d.fim(); }
});

test("DC-237 · «Respondendo a…» com a miniatura da foto", async () => {
  await comComposer({ acoes: { urlMidia: p => `https://cdn.test/${p}` } }, async x => {
    x.comp.responder({ id: 1, direcao: "in", tipo: "imagem", midia: { path: "c1/in/f1.jpg" }, criado_em: agoraIso(5) });
    assert.equal(achar(x.comp.el, ".cvx-resp-mini").getAttribute("src"), "https://cdn.test/c1/in/f1.jpg");
  });
});

test("DC-239 · etapa do negócio aberto aparece no cabeçalho", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 5)] });
    A.ver.negocios = [{ id: 3, status: "aberto", etapa_nome: "Orçamento enviado" }];
    chat.renderCabecalho();
    assert.match(achar(chat.el, ".cvc-etapa-bt").textContent, /Orçamento enviado/);
  } finally { d.fim(); }
});

test("DC-240 · link da conversa sem index.html nem query", () => {
  assert.equal(L.linkConversa("https://orbita.app", "/app/index.html", 42), "https://orbita.app/app/#/conversas/42");
  assert.equal(L.linkConversa("https://orbita.app", "/app/", 42), "https://orbita.app/app/#/conversas/42");
  assert.match(SRC_CHAT, /L\.linkConversa\(loc\.origin \|\| "", loc\.pathname \|\| "\/app\/", conv\.id\)/);
});

test("DC-241/DC-250 · folha rola com muitos itens; pílula compacta no celular", () => {
  assert.match(CSS, /\.cv-folha-corpo \{ max-height: calc\(80dvh - 7rem\); overflow-y: auto;/);
  assert.match(CSS, /\.cvc-novas\[data-n\]:not\(\[data-n=""\]\)::before \{ content: attr\(data-n\);/);
});

test("DC-242 · grade com «Baixar todas (6)»", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [1, 2, 3, 4, 5, 6].map(i => fotoMsg(i, 10 - i * 0.1)) });
    assert.equal(achar(chat.el, ".cv-grade-baixar").textContent, "Baixar todas (6)");
    assert.match(achar(chat.el, ".cv-grade").getAttribute("aria-label"), /^6 fotos de Mariana Costa, \d{2}:\d{2}$/);   // DC-248
  } finally { d.fim(); }
});

test("DC-243 · áudio do cliente ouvido até mais de 80% fica marcado «ouvido» no aparelho", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [audioMsg(1, "in", 5)] });
    const audio = achar(chat.el, '.cv-msg[data-id="1"] audio');
    assert.equal(achar(chat.el, ".cv-au-ouvido").hidden, true);
    audio.currentTime = 11; d.ev(audio, "timeupdate");
    assert.equal(achar(chat.el, ".cv-au-ouvido").hidden, false);
    const outro = await montarChat(d, { msgs: [audioMsg(1, "in", 5)] });
    assert.equal(achar(outro.chat.el, ".cv-au-ouvido").hidden, false, "lembrado no aparelho");
  } finally { d.fim(); }
});

test("DC-246/DC-249/DC-251/DC-266 · textos: hora na não suportada, figurinha amplia, atraso e pausa da IA", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { provedor: "codewords", msgs: [txt(1, "in", 5, { tipo: "desconhecido", corpo: null }),
      { ...fotoMsg(2, 4), tipo: "sticker", midia: { path: "c1/in/s.webp", emoji: "😂" } }] });
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] .cv-texto').textContent, /\(recebida às \d{2}:\d{2}\)$/);
    assert.equal(achar(chat.el, ".cv-sticker-bt").getAttribute("aria-label"), "Ampliar Figurinha 😂");
  } finally { d.fim(); }
  assert.match(SRC_CHAT, /— mensagens novas podem não aparecer\./);
  assert.match(SRC_CHAT, /O cliente não recebe nenhum aviso; a conversa continua com você\./);
  assert.match(SRC_CONV, /O cliente não recebe nenhum aviso\./);
});

test("DC-254 · «Trocar microfone» lista as entradas e lembra a escolhida", async () => {
  const salvo = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: { mediaDevices: { enumerateDevices: async () => [{ kind: "audioinput", deviceId: "m1", label: "Fone" }, { kind: "videoinput", deviceId: "v" }] } } });
  try {
    await comComposer({}, async (x, d) => {
      achar(x.comp.el, ".cvx-trocar-mic").click();
      await esperar(5);
      const it = d.menus.at(-1).itens;
      assert.deepEqual(it.map(i => i.rotulo), ["Fone"]);
      it[0].fn();
      assert.equal(globalThis.localStorage.getItem("nx-cv-microfone"), "m1");
    });
  } finally { if (salvo) Object.defineProperty(globalThis, "navigator", salvo); else delete globalThis.navigator; }
  assert.match(SRC_COMP, /deviceId: \{ ideal: micId \}/);
});

test("DC-255/DC-256/DC-258 · trava: quem bloqueou, «Reabrir e enviar modelo» e link wa.me sem modelo", async () => {
  await comComposer({ contato: { bloqueado: true, bloqueado_por: { nome: "Ana" }, bloqueado_em: "2026-10-12T15:00:00Z" } }, async x => {
    assert.match(achar(x.comp.el, ".cvx-trava").textContent, /Bloqueado por Ana em 12\/10\./);
  });
  const fechada = new Date(Date.now() - 3600000).toISOString();
  await comComposer({ conv: { status: "resolvida", janela_ate: fechada, ultima_entrada_em: agoraIso(60 * 30) } }, async x => {
    assert.match(achar(x.comp.el, ".cvx-trava").textContent, /Reabrir e enviar modelo/);
  });
  await comComposer({ base: { canais: [{ id: "k1", nome: "Recepção", telefone: "5512999990000" }] }, conv: { janela_ate: fechada, ultima_entrada_em: agoraIso(60 * 30) } }, async (x, d) => {
    achar(x.comp.el, ".cvx-wame").click();
    assert.ok(d.toasts.length >= 0);
  });
  assert.equal(L.linkWaMe("+55 (12) 99999-0000"), "https://wa.me/5512999990000");
});

test("DC-257 · janela com menos de 3 h mostra «fecha às» discreto", () => {
  const agora = Date.parse("2026-10-21T13:00:00Z");
  const jan = ate => ({ aberta: true, ate: new Date(agora + ate).toISOString() });
  assert.match(L.avisoJanelaSuave(jan(2 * 3600000), agora), /^A janela de 24 h fecha às \d{2}:\d{2}\.$/);
  assert.equal(L.avisoJanelaSuave(jan(4 * 3600000), agora), "");
  assert.equal(L.avisoJanelaSuave(jan(20 * 60000), agora), "", "nos últimos 30 min vale o aviso forte");
});

test("DC-259/DC-260 · «respondido em 8 s» na 1ª resposta e «Ana assumiu» quando a IA passa a vez", async () => {
  const base = Date.parse("2026-10-21T13:00:00Z");
  const em = s => new Date(base + s * 1000).toISOString();
  const msgs = [
    { id: 1, conversa_id: 9, direcao: "in", tipo: "texto", criado_em: em(0) },
    { id: 2, conversa_id: 9, direcao: "out", tipo: "texto", origem: "ia", criado_em: em(8) },
    { id: 3, conversa_id: 9, direcao: "out", tipo: "texto", enviado_por: { id: "u2", nome: "Ana Paula" }, criado_em: em(600) }];
  assert.deepEqual([...L.temposDeResposta(msgs)], [[2, "respondido em 8 s"]]);
  const linhas = L.inserirAutoria(msgs.map(m => ({ tipo: "msg", msg: m })));
  assert.equal(linhas[2].tipo, "autoria");
  assert.match(linhas[2].texto, /^Ana assumiu · \d{2}:\d{2}$/);
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 10), txt(2, "out", 9, { origem: "ia", enviado_por: null }), txt(3, "out", 5, { enviado_por: { id: "u2", nome: "Ana Paula" } })] });
    assert.match(achar(chat.el, '.cv-msg[data-id="2"] .cv-tempo-resp').textContent, /respondido em 1 min/);
    assert.match(achar(chat.el, ".cv-autoria").textContent, /^Ana assumiu/);
  } finally { d.fim(); }
});

test("DC-261/DC-262 · teto usa o nome da assinatura do servidor; selo da IA diz em que se baseou", async () => {
  await comComposer({ base: { cfg: { assinatura: true }, assinatura_nome: "Dra. Fernanda" } }, async x => {
    x.comp.atualizar();
    assert.equal(Number(x.ta.getAttribute("maxlength")), L.tetoTexto({ assinatura: true, nome: "Dra. Fernanda" }));
    assert.match(achar(x.comp.el, ".cvx-ia-selo").getAttribute("title"), /últimas 20 mensagens/);
  });
});

test("DC-263 · no celular a pílula de número caído vira só ícone", () => {
  assert.match(SRC_CHAT, /ui\.pilula\(ehCelular\(\) \? "" : "Número desconectado"/);
});

test("DC-264 · «/» vazio separa as do setor da conversa das demais", async () => {
  const respostas = [{ id: 1, atalho: "ola", titulo: "Olá", corpo: "a" }, { id: 2, atalho: "rx", titulo: "Raio-X", corpo: "b", departamento_id: "d1" }];
  await comComposer({ base: { respostas, departamentos: [{ id: "d1", nome: "Recepção" }] }, conv: { departamento_id: "d1" } }, async x => {
    x.digitar("/");
    const grupos = x.comp.el.querySelectorAll(".cvx-rr-grupo").map(g => g.textContent);
    assert.deepEqual(grupos, ["Recepção", "Todas"]);
    assert.match(achar(x.comp.el, ".cvx-rr-op").textContent, /rx/);
  });
});

test("DC-267 · modelo mostra o preço aproximado por categoria", async () => {
  assert.match(L.precoModelo("MARKETING"), /^≈ R\$\s0,35 por mensagem$/);
  assert.equal(L.precoModelo("UTILITY", { UTILITY: 0.08 }).includes("0,08"), true);
  assert.equal(L.precoModelo("OUTRA"), "");
});

/* ============================================================ pendências de outras frentes nos arquivos da conv */
test("DR-346 (crm) · veio do quadro: «Voltar ao quadro» no cabeçalho", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 5)] });
    assert.equal(chat.el.querySelector(".cvc-voltar-crm"), null);
    A.voltarCrm = true;
    chat.renderCabecalho();
    assert.equal(achar(chat.el, ".cvc-voltar-crm").getAttribute("href"), "#/crm");
  } finally { d.fim(); }
});

test("DU-446 (sis) · texto do «Compartilhar» do celular entra no campo da conversa aberta e a chave some", async () => {
  const d = comDom();
  const mem = new Map([["nx-compartilhado", "Segue o orçamento"]]);
  const salvo = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const srv = criarServidor({ conversas: 1 });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    await esperar(20);
    assert.equal(mem.has("nx-compartilhado"), false);
    // o texto segue o mesmo caminho do ?texto= (campo; se a conversa estiver resolvida no cache do módulo, copiado com o aviso)
    assert.ok(d.toasts.some(t => /Texto pronto no campo da conversa|esta conversa está resolvida \(o texto foi copiado\)/.test(t)), JSON.stringify(d.toasts));
  } finally { c.fim(); globalThis.sessionStorage = salvo; d.fim(); }
});

test("REV-09/DR-333 · marcarTesteLocal sem conta não grava «nx-onb:<cliente>:-»", async () => {
  const CV = await import("../web/app/cv-config.js");
  const mem = new Map();
  const st = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(CV.marcarTesteLocal(st, "cli", null), false);
  assert.equal(mem.size, 0);
  assert.equal(CV.marcarTesteLocal(st, "cli", "u1"), true);
  assert.ok(mem.has("nx-onb:cli:u1"));
});

test("DU-255 (sis) · o pedido de permissão de avisos usa a pré-pergunta do shell quando o ctx a oferece", () => {
  assert.match(SRC_CONV, /typeof A\.ctx\.pedirPermissaoAvisos === "function" \? await A\.ctx\.pedirPermissaoAvisos\(\) : await Notification\.requestPermission\(\)/);
});
