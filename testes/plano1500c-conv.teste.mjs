/* ============================================================
   ÓRBITA — plano «1500c» (21/10/2026) · frente conv · Conversas
   node --test testes/plano1500c-conv.teste.mjs
   Cada teste cita o item (CC-NNN) do lote e falha no código de antes desta rodada.
   DOM mínimo e montadores copiados do plano1000b-conv.teste.mjs.
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

/* ============================================================ testes */

/* ================================================================ lote conv-c1 (CC-001 … CC-060) */
const CSS_CONV = ler("conversas.css");
const SRC_CONV = ler("conversas.js");
const TODO_DIA = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [["00:00", "24:00"]]]));
const COMERCIAL = { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]] };

test("CC-001/CC-002 · horário do departamento sem a config do admin (base.departamentos) e a regra única", () => {
  const base = { departamentos: [{ id: "d1", nome: "Recepção", padrao: true, horario: COMERCIAL }] };
  assert.deepEqual(L.horarioDoDepartamento(base, "d1"), COMERCIAL);
  assert.deepEqual(L.horarioDoDepartamento(base, null), COMERCIAL, "sem departamento: o padrão");
  assert.equal(L.horarioDoDepartamento({ departamentos: [{ id: "d1" }] }, "d1"), undefined, "sem horário: minutos corridos");
  // sexta 19h → segunda 08:05 (SP): 5 min de atendimento, não 61 h
  const c = { status: "aberta", aguardando: true, ultima_entrada_em: "2026-10-16T22:00:00Z", departamento_id: "d1" };
  const e = L.esperaDaConversa(c, base, new Date("2026-10-19T11:05:00Z"));
  assert.equal(e.minutos, 5); assert.equal(e.uteis, true); assert.equal(e.nivel, "ok");
  // a config do admin continua valendo quando vem
  const adm = { config: { departamentos: [{ id: "d1", padrao: true, horario: TODO_DIA }] }, departamentos: [{ id: "d1", horario: COMERCIAL }] };
  assert.deepEqual(L.horarioDoDepartamento(adm, "d1"), TODO_DIA);
  assert.match(ler("cv-lateral.js"), /function horarioDe\(conv\) \{ return L\.horarioDoDepartamento\(A\.base, conv && conv\.departamento_id\); \}/);
});

test("CC-001 · lista do atendente (sem config) conta a espera em minutos de atendimento", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { aba: "aguardando", itens: [conv(1, { aguardando: true, ultima_entrada_em: agoraIso(20) })],
      base: { departamentos: [{ id: "d1", padrao: true, horario: TODO_DIA }] } });
    const sla = achar(lista.el, ".cvl-espera");
    assert.equal(sla.dataset.uteis, "1");
  } finally { d.fim(); }
});

test("CC-003/CC-004 · mensagem da IA no número da Meta: «Lia · IA» (nome do topo do nx_cv_base) e bolha marcada", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { provedor: "meta", msgs: [txt(1, "in", 10), txt(2, "out", 5, { origem: "ia", enviado_por: null })] });
    A.base.ia_assistente_nome = "Lia";
    A.base.config = null;
    chat.renderTudo({ rolar: "fim" }); await esperar(5);
    const b = achar(chat.el, '.cv-msg[data-id="2"]');
    assert.equal(b.dataset.origem, "ia");
    assert.match(b.textContent, /Lia · IA/);
  } finally { d.fim(); }
});

test("CC-005/CC-057/CC-058 · ⋮ da conversa: «Marcar como não lida», «Fixar no topo» e «Silenciar»", async () => {
  const d = comDom();
  try {
    const chamadas = [];
    const { chat } = await montarChat(d, { conv: { atribuida_a: "u1" }, acoes: {
      marcarNaoLida: (id, o) => chamadas.push(["naoLida", id, o]), fixadas: () => [], alternarFixar: id => chamadas.push(["fixar", id]),
      silenciada: () => false, silenciar: (id, h) => chamadas.push(["silenciar", id, h]) } });
    achar(chat.el, ".cvc-mais").click();
    const itens = d.menus.at(-1).itens.filter(x => x && x !== "-");
    const it = re => { const x = itens.find(i => re.test(i.rotulo)); assert.ok(x, `sem ${re}`); return x; };
    it(/^Marcar como não lida$/).fn();
    it(/^Fixar no topo/).fn();
    it(/^Silenciar esta conversa/).fn();
    d.menus.at(-1).itens.find(i => /8 horas/.test(i.rotulo)).fn();
    assert.deepEqual(chamadas, [["naoLida", 9, { voltar: true }], ["fixar", 9], ["silenciar", 9, 8]]);
  } finally { d.fim(); }
});

test("CC-006/CC-055/CC-056 · lote: «Não lidas», «Assumir» e «Pendente» chamam a central com as marcadas", async () => {
  const d = comDom();
  try {
    const { lista, chamadas } = await montarLista(d, { itens: [conv(1), conv(2)], acoes: {
      naoLidaLote: ids => { chamadas.push(["naoLida", ids]); return { restantes: [] }; },
      assumirLote: ids => { chamadas.push(["assumir", ids]); return { restantes: [] }; },
      pendenteLote: ids => { chamadas.push(["pendente", ids]); return { restantes: [2] }; } } });
    const sel = () => { achar(lista.el, ".cvl-sel-bt").click(); d.ev(achar(lista.el, '.cvl-item[data-id="2"]'), "click"); };
    sel(); achar(lista.el, ".cvl-lote-naolida").click(); await esperar(5);
    sel(); achar(lista.el, ".cvl-lote-assumir").click(); await esperar(5);
    sel(); achar(lista.el, ".cvl-lote-pend").click(); await esperar(5);
    assert.deepEqual(chamadas.filter(c => c[0] !== "carregarLista"), [["naoLida", [2]], ["assumir", [2]], ["pendente", [2]]]);
    assert.equal(achar(lista.el, '.cvl-item[data-id="2"]').dataset.sel, "1", "a que falhou volta selecionada");
  } finally { d.fim(); }
});

test("CC-006 (central) · «Não lidas» em lote vai ao nx_cv_marcar_nao_lida só ao firmar; Desfazer devolve", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  srv.handlers.nx_cv_marcar_nao_lida = p => { const c = srv.convs.find(x => x.id === p.p_conversa); c.nao_lidas = 1; return { ok: true }; };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    d.ev(achar(c.alvo, '.cvl-item[data-id="901"]'), "click");
    achar(c.alvo, ".cvl-lote-naolida").click();
    await esperar(10);
    const o = d.desfazeres.at(-1);
    assert.match(o.texto, /1 conversa marcada como não lida/);
    assert.equal(achar(c.alvo, '.cvl-item[data-id="901"]').dataset.naoLida, "1", "a tela acende na hora");
    assert.equal(srv.conta("nx_cv_marcar_nao_lida"), 0, "nada ao servidor antes do aviso fechar");
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    assert.equal(srv.conta("nx_cv_marcar_nao_lida"), 1);
  } finally { c.fim(); d.fim(); }
});

test("CC-007 · deslizar numa conversa já lida oferece «Marcar como não lida»", async () => {
  const d = comDom({ grosso: true });
  const gestos = [];
  d.ui.deslizar = (el, o) => { gestos.push({ el, o }); return () => {}; };
  try {
    const marcadas = [];
    await montarLista(d, { itens: [conv(1, { nao_lidas: 0, atribuida_a: null })], acoes: { lidaComDesfazer() {}, marcarNaoLida: id => marcadas.push(id), podeMarcarLida: () => true } });
    const g = gestos.at(-1);
    assert.equal(g.el.dataset.gestoD, "Marcar como não lida");
    g.o.direita();
    assert.deepEqual(marcadas, [1]);
  } finally { d.fim(); }
});

test("CC-008/CC-029/CC-030 · filtros: origem, número com o final e sem convite pendente", async () => {
  const d = comDom();
  let corpo = null;
  d.ui.flutuante = (anc, c) => { corpo = c; return { fechar() {} }; };
  try {
    const { lista, chamadas } = await montarLista(d, { base: {
      canais: [{ id: "k1", nome: "WhatsApp", numero_exibicao: "+55 12 99999-1111" }, { id: "k2", nome: "WhatsApp", numero_exibicao: "+55 12 98888-2222" }],
      usuarios: [{ id: "u2", nome: "Ana", papel: "atendente" }, { id: "u3", nome: "Convite", papel: "atendente", aprovado: false }] } });
    achar(lista.el, ".cvl-filtro").click();
    const ops = corpo.querySelector("#cvf-canal").querySelectorAll("option").map(o => o.textContent);
    assert.deepEqual(ops.slice(1), ["WhatsApp · final 1111", "WhatsApp · final 2222"]);
    assert.ok(!corpo.querySelector("#cvf-at").textContent.includes("Convite"), "convite pendente fora do filtro");
    for (const r of corpo.querySelectorAll(".cvf-origens input")) r.checked = r.value === "site";   // o grupo de rádio do navegador
    botaoTexto(corpo, /^Aplicar$/).click();
    assert.deepEqual(chamadas.find(c => c[0] === "mudarLista")[1], { filtro: { origem: "site" } });
  } finally { d.fim(); }
});

test("CC-008 · chip «Origem: Site» com o filtro ativo; e o filtro lembrado guarda a origem", async () => {
  const d = comDom();
  try {
    const { A, lista } = await montarLista(d, { itens: [conv(1)] });
    A.filtro = { origem: "site" }; lista.render();
    assert.ok(lista.el.querySelectorAll(".cvl-filtro-chip").some(b => /Origem: Site/.test(b.textContent)));
  } finally { d.fim(); }
  assert.match(SRC_CONV, /const CHAVES_FILTRO = \[[^\]]*"origem"\]/);
});

test("CC-009/CC-032 · «Nas mensagens · 20+» e «Ver mais mensagens»", async () => {
  const d = comDom();
  try {
    let mais = 0;
    const itensMsg = Array.from({ length: 20 }, (_, i) => ({ conversa_id: 9, mensagem_id: 100 - i, contato_nome: "Ana", trecho: "orçamento", criado_em: agoraIso(i + 1) }));
    const { A, lista } = await montarLista(d, { acoes: { maisMensagens: () => { mais++; } } });
    A.busca = "orçamento"; A.buscaMsgs = { q: "orçamento", carregando: false, itens: itensMsg, erro: null, temMais: true };
    lista.render();
    assert.equal(achar(lista.el, ".cvl-msgs-tit").textContent, "Nas mensagens · 20+");
    botaoTexto(lista.el, /Ver mais mensagens/).click();
    assert.equal(mais, 1);
  } finally { d.fim(); }
});

test("CC-009 (central) · a página seguinte da busca vai com p_antes_id e é acrescentada", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.handlers.nx_cv_buscar_msgs = p => {
    const ini = p.p_antes_id ? p.p_antes_id - 1 : 500;
    const n = p.p_antes_id ? 3 : 20;
    return Array.from({ length: n }, (_, i) => ({ conversa_id: 901, mensagem_id: ini - i, contato_nome: "Cliente 1", trecho: "orçamento", criado_em: agoraIso(i + 1) }));
  };
  const c = await montarCentral(d, srv);
  try {
    const busca = achar(c.alvo, "input[type=search]");
    busca.value = "orçamento"; d.ev(busca, "keydown", { key: "Enter" });
    await esperar(30);
    botaoTexto(c.alvo, /Ver mais mensagens/).click();
    await esperar(30);
    const pedidos = srv.chamadas.filter(x => x[0] === "nx_cv_buscar_msgs");
    assert.equal(pedidos.at(-1)[1].p_antes_id, 481);
    assert.equal(c.alvo.querySelectorAll(".cvl-msg").length, 23);
    assert.ok(!botaoTexto(c.alvo, /Ver mais mensagens/), "página incompleta: sem mais");
  } finally { c.fim(); d.fim(); }
});

test("CC-010 (central) · transferir: o departamento começa em «Manter» e só pessoa não muda o departamento", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.base.departamentos = [{ id: "d1", nome: "Recepção" }, { id: "d2", nome: "Financeiro" }];
  let escolha = null, opcoes = null;
  d.aoModal(o => { if (o.titulo !== "Transferir conversa") return true; opcoes = o.corpo.querySelector("#cv-tr-dep").querySelectorAll("option").map(x => [x.value, x.textContent]);
    o.corpo.querySelector("#cv-tr-pessoa").value = "u2"; escolha = o.acoes[1].fn(); return escolha; });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    d.menus.at(-1).itens.find(i => i && i.rotulo === "Transferir…").fn();
    await esperar(20);
    assert.deepEqual(opcoes[0], ["", "Manter (sem departamento)"]);
    assert.equal(escolha.dep, null, "sem p_departamento");
    assert.equal(escolha.conta, "u2");
    const o = d.desfazeres.at(-1);   // fecha o Desfazer (o _pendTransferir é do módulo e passaria para o próximo teste)
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(20);
    assert.equal(srv.chamadas.find(x => x[0] === "nx_cv_atribuir")[1].p_departamento, null, "o departamento não muda");
  } finally { c.fim(); d.fim(); }
});

test("CC-011 (central) · etiquetar em lote uma conversa que saiu da página lê as etiquetas antes", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  srv.convs[0].etiquetas = ["e1"];
  d.aoModal(o => { const cx = o.corpo.querySelectorAll("input[type=checkbox]").find(x => x.value === "e2"); cx.checked = true; return o.acoes[1].fn({ erro() {} }); });
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    d.ev(achar(c.alvo, '.cvl-item[data-id="901"]'), "click");
    const listar = srv.handlers.nx_cv_listar;
    srv.handlers.nx_cv_listar = p => { const r = listar(p); r.itens = r.itens.filter(x => x.id !== 901); return r; };
    await c.pulso();
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(30);
    const gravou = srv.chamadas.find(x => x[0] === "nx_cv_etiquetas");
    assert.deepEqual(gravou[1].p_etiquetas.sort(), ["e1", "e2"], "manteve a etiqueta que ela já tinha");
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_ver" && x[1].p_id === 901));
  } finally { c.fim(); d.fim(); }
});

test("CC-012 (central) · «Atender o próximo» respeita o departamento filtrado", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  srv.base.departamentos = [{ id: "d1", nome: "Recepção" }];
  d.mem.set("nx-cv-filtro:c1", JSON.stringify({ departamento_id: "d1" }));
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-atender").click();
    await esperar(30);
    const p = srv.chamadas.filter(x => x[0] === "nx_cv_listar" && x[1].p_filtro.aba === "aguardando" && x[1].p_limite === 50 && x[1].p_antes === null);
    assert.ok(p.some(x => x[1].p_filtro.departamento_id === "d1"), "pediu a fila da Recepção");
  } finally { c.fim(); d.fim(); }
  assert.match(SRC_CONV, /Não há conversa esperando \$\{onde\}\. Pegar a próxima de outro/);
});

test("CC-013/CC-014/CC-018/CC-019 · avisos e atualizações (fonte)", () => {
  assert.match(SRC_CONV, /if \(!await esperarConversa\(c\.id\)\) \{\s*\/\/ plano 1500c · CC-013[^\n]*\n\s*if \(A\) \{ A\.ui\.toast\("A conversa ainda está chegando\. Abrindo…"/);
  assert.match(SRC_CONV, /setInterval\(\(\) => \{ if \(!document\.hidden && Date\.now\(\) - \(A\.baseEm \|\| 0\) > 5 \* 60000\) carregarBase\(\)/);
  assert.match(SRC_CONV, /icon: "\/app\/icones\/icon-192\.png"/);
  assert.match(SRC_CONV, /if \(A && A\.selId !== convId\) \{[\s\S]{0,300}atualizarItemLista\(\{ id: convId, ultima_msg_em:[\s\S]{0,200}carregarLista\(\{\}\);\s*return;/);
});

test("CC-015 · um pedaço da central que não baixa mostra o cartão de erro com «Tentar de novo»", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  try {
    conversasMod.desmontar();
    const alvo = d.h("main"); d.doc.body.appendChild(alvo);
    const ui = { ...d.ui, carregarCss: () => Promise.reject(new Error("css_falhou")) };
    await conversasMod.montar({ ui, api: srv.api, versao: "teste", pode: () => true, papel: "admin", sessao: { conta: { id: "u1" } }, cliente: { id: "c1" }, alvo, rota: { partes: [], query: {} },
      pulso: { assinar: () => () => {} }, navegar() {}, titulo() {}, badge() {}, vocab: {}, temModulo: () => false });
    assert.ok(alvo.querySelector(".erro"), "cartão de erro na tela");
  } finally { conversasMod.desmontar(); d.fim(); }
});

test("CC-016 (central) · ir para mensagem que não está carregada avisa", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 1 });
  const c = await montarCentral(d, srv);
  try {
    await c.ctx.navegar("#/conversas/901?msg=12345");
    await esperar(60);
    assert.ok(d.toasts.some(t => /muito antiga para abrir aqui/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("CC-017 · várias conversas novas numa notificação só", () => {
  const nome = c => c.contato.nome;
  const t = L.textoNotificacao([{ id: 1, contato: { nome: "Ana Souza" } }, { id: 2, contato: { nome: "Bruno" } }, { id: 3, contato: { nome: "Carla" } }], { quem: true }, nome);
  assert.equal(t.titulo, "3 conversas novas"); assert.equal(t.corpo, "Ana, Bruno e Carla"); assert.equal(t.tag, "nx-cv-varias"); assert.equal(t.id, null);
  const sem = L.textoNotificacao([{ id: 1, contato: { nome: "Ana" } }, { id: 2, contato: { nome: "Bruno" } }], { quem: false }, nome);
  assert.doesNotMatch(sem.corpo, /Ana|Bruno/, "sem «quem»: nada do paciente");
  const um = L.textoNotificacao([{ id: 7, contato: { nome: "Ana" }, ultima_msg_resumo: "oi" }], { quem: true, texto: false }, nome);
  assert.deepEqual([um.titulo, um.corpo, um.tag, um.id], ["Ana", "Mensagem nova", "nx-cv-7", 7]);
});

test("CC-020 · carregar mensagens antigas: role=log ocupado e um aviso curto com a contagem", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(10, "in", 5)] });
    A.msgs = [txt(7, "in", 30), txt(8, "out", 20), ...A.msgs];
    chat.renderMensagens({ rolar: "anterior" });
    const log = achar(chat.el, ".cvc-msgs");
    assert.equal(log.getAttribute("aria-busy"), "true");
    assert.ok(d.anuncios.includes("2 mensagens anteriores carregadas"));
    await esperar(5);
    assert.equal(log.getAttribute("aria-busy"), null);
  } finally { d.fim(); }
});

test("CC-021 · rascunho regravado depois da cota cheia conta como salvo e entra no índice (fonte)", () => {
  const src = ler("rascunho.js");
  assert.match(src, /const ok2 = seguro\(\(\) => \{ storage\.setItem\(k, bruto\); return true; \}, false\);\s*if \(ok2\) indice\.set\(k,/);
  assert.match(src, /return ok2;/);
});

test("CC-022/CC-023 · rascunho em contentEditable e «descartar» com Desfazer", async () => {
  const d = comDom();
  try {
    const R1 = rascunhosDe(d);
    const campo = d.h("div");
    campo.isContentEditable = true; campo.value = undefined;
    d.doc.body.appendChild(campo);
    const ta = d.h("textarea"); d.doc.body.appendChild(ta);
    const l1 = R1.ligar(ta, "nota-rica"); ta.value = "texto longo da nota"; d.ev(ta, "input"); l1.salvarAgora(); l1.desligar();
    ta.value = "";
    const l2 = R1.ligar(campo, "nota-rica");
    assert.equal(campo.textContent, "texto longo da nota", "o contentEditable recebe o texto");
    l2.desligar();
    // descartar → «desfazer» devolve o texto
    const ta2 = d.h("textarea"); d.doc.body.appendChild(ta2);
    const l3 = R1.ligar(ta2, "nota-rica");
    assert.equal(ta2.value, "texto longo da nota");
    const selo = achar(d.doc.body, ".rascunho-selo");
    selo.querySelector("button").click();
    assert.equal(ta2.value, "");
    assert.match(selo.textContent, /Rascunho descartado · desfazer/);
    selo.querySelector("button").click();
    assert.equal(ta2.value, "texto longo da nota", "o Desfazer devolveu o texto");
    l3.desligar();
  } finally { d.fim(); }
});

test("CC-024/CC-025/CC-026 · estado do número, nome em caixa alta e erros de envio da Meta", () => {
  assert.equal(L.rotuloEstadoCanal({ status: "banido" }), "bloqueado pela Meta");
  assert.equal(L.rotuloEstadoCanal({ status: "inativo" }), "desativado");
  assert.match(L.rotuloEstadoCanal({ status: "xyz" }), /situação desconhecida — confira em Configurações › Números/);
  assert.equal(L.primeiroNome("MARIA SOUZA"), "Maria");
  assert.equal(L.primeiroNome("JP Famelli"), "JP");
  assert.equal(L.primeiroNome("ÉRICA"), "Érica");
  for (const c of ["131026", "meta_131047", "131051", "131053", "codewords_desconectado"]) assert.ok(L.dicaErroEnvio(c), c);
  assert.match(L.dicaErroEnvio("131026"), /bloqueou o número da empresa/);
});

test("CC-027 · SLA com os limites do departamento (quando o servidor mandar sla_*)", () => {
  const base = { departamentos: [{ id: "d1", padrao: true, sla_aten: 60, sla_atraso: 90, sla_critico: 120 }] };
  assert.deepEqual({ ...L.limitesSla(base, "d1") }, { aten: 60, ruim: 90, critico: 120 });
  assert.equal(L.limitesSla({ departamentos: [{ id: "d1", sla_aten: 50, sla_atraso: 10, sla_critico: 5 }] }, "d1"), L.SLA_MINUTOS, "fora de ordem: padrão");
  const c = { status: "aberta", aguardando: true, ultima_entrada_em: agoraIso(45), departamento_id: "d1" };
  assert.equal(L.esperaDaConversa(c, base).nivel, "ok", "45 min com limite de 60: ok (antes «ruim»)");
  assert.equal(L.esperaDaConversa(c, {}).nivel, "ruim", "sem os campos: 15/30/60");
});

test("CC-028 · .mov do iPhone com o caminho para resolver", () => {
  assert.equal(L.ehVideoIphone({ name: "IMG_1.MOV", type: "" }), true);
  assert.equal(L.ehVideoIphone({ name: "a.mp4", type: "video/mp4" }), false);
  assert.match(L.TEXTO_MOV_IPHONE, /Ajustes › Câmera › Formatos › Mais compatível/);
  assert.match(ler("cv-composer.js"), /: L\.ehVideoIphone\(escolhidoInicial\) \? L\.TEXTO_MOV_IPHONE/);
});

test("CC-031/CC-033 · placeholder da busca e a faixa diz quais números caíram", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { acoes: { canaisCaidos: () => [{ id: "k1", nome: "Recepção" }, { id: "k2", nome: "Comercial" }] } });
    assert.equal(achar(lista.el, "input[type=search]").getAttribute("placeholder"), "Buscar nome, telefone ou palavra da conversa");
    assert.match(achar(lista.el, ".cvl-caido").textContent, /«Recepção» e «Comercial» estão desconectados/);
  } finally { d.fim(); }
  assert.equal(L.textoCanaisCaidos([{ nome: "A" }, { nome: "B" }, { nome: "C" }, { nome: "D" }]), "Os números «A», «B», «C» e mais 1 estão desconectados: as mensagens não chegam nem saem por eles até reconectar.");
});

test("CC-034…CC-047 · alvos de toque e fontes da central (CSS)", () => {
  assert.match(CSS_CONV, /\.cvl-busca \.busca input \{ min-height: 44px; \}/);
  assert.match(CSS_CONV, /\.cvl-busca \.busca input \{ font-size: 16px; \}/);
  assert.match(CSS_CONV, /\.cfg-faixa \.bt-icone \{ width: 44px; height: 44px; \}/);
  assert.match(CSS_CONV, /\.cfg-faixas input\[type="time"\] \{ min-height: 44px;/);
  assert.match(CSS_CONV, /@media \(pointer: coarse\) \{ \.cv-msg-acoes \.bt-icone \{ width: 44px; min-width: 44px; height: 44px; min-height: 44px; \} \}/);
  assert.match(CSS_CONV, /\.cvl-item \.cvl-dono \{ width: 24px; height: 24px; font-size: var\(--fs-11, 11px\); \}/);
  assert.match(CSS_CONV, /\.cv-doc-ic \{ font-size: var\(--fs-11\); font-weight: 700; \}/);
  assert.match(CSS_CONV, /\.cvt-ligado \{ font-size: var\(--fs-12, 12px\); color: var\(--c-texto-2\); \}/);
});

test("CC-049 · o fuso dos departamentos com um nome só", () => {
  const src = ler("cv-config.js");
  assert.doesNotMatch(src, /horário de Brasília \(São Paulo\)/);
});

test("CC-050 · seção «Consultas» na lateral quando o servidor manda contato.consultas", async () => {
  const d = comDom();
  try {
    const textos = [];
    const futura = new Date(Date.now() + 3 * 86400000).toISOString();
    const { alvo, A, lat } = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000",
      consultas: [{ negocio_id: 1, inicio: futura, servico: "Limpeza" }, { negocio_id: 1, inicio: agoraIso(60 * 24 * 10), servico: "Avaliação", presenca: "compareceu" }] } } });
    A.acoes.colocarTexto = t => textos.push(t);
    lat.render();
    const sec = achar(alvo, '.cvt-sec[data-sec="consultas"]');
    assert.match(sec.textContent, /Limpeza/); assert.match(sec.textContent, /compareceu/);
    botaoTexto(sec, /Lembrar/).click();
    assert.match(textos[0], /^Olá, Mariana! Passando para lembrar da sua consulta \(Limpeza\)/);
  } finally { d.fim(); }
  const d2 = comDom();
  try { const { alvo } = await montarLateral(d2); assert.ok(!alvo.querySelector('.cvt-sec[data-sec="consultas"]'), "sem o campo: sem a seção"); } finally { d2.fim(); }
});

test("CC-051 · segurar a conversa (toque) entra no modo seleção com ela marcada", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1), conv(2)] });
    const item = achar(lista.el, '.cvl-item[data-id="2"]');
    d.ev(item, "pointerdown", { pointerType: "touch", clientX: 10, clientY: 10 });
    await esperar(560);
    assert.equal(achar(lista.el, '.cvl-item[data-id="2"]').dataset.sel, "1");
    assert.equal(achar(lista.el, ".cvl-sel-bt").getAttribute("aria-pressed"), "true");
    const ev = new d.Evento("click"); achar(lista.el, '.cvl-item[data-id="2"]').dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true, "o clique que segue o toque longo não abre a conversa");
  } finally { d.fim(); }
});

test("CC-052/CC-053/CC-054 · selecionar todas, shift+clique e Esc", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1), conv(2), conv(3), conv(4)] });
    achar(lista.el, ".cvl-sel-bt").click();
    const cx = achar(lista.el, ".cvl-lote-todas-cx");
    assert.match(achar(lista.el, ".cvl-lote-todas").textContent, /Selecionar todas \(4 carregadas\)/);
    cx.checked = true; d.ev(cx, "change");
    assert.equal(achar(lista.el, ".cvl-lote-n").textContent, "4 selecionadas");
    cx.checked = false; d.ev(cx, "change");
    d.ev(achar(lista.el, '.cvl-item[data-id="1"]'), "click");
    d.ev(achar(lista.el, '.cvl-item[data-id="3"]'), "click", { shiftKey: true });
    assert.equal(achar(lista.el, ".cvl-lote-n").textContent, "3 selecionadas");
    d.ev(achar(lista.el, '.cvl-item[data-id="1"]'), "keydown", { key: "Escape" });
    assert.equal(achar(lista.el, ".cvl-sel-bt").getAttribute("aria-pressed"), "false");
    assert.equal(d.doc.activeElement, achar(lista.el, ".cvl-sel-bt"));
  } finally { d.fim(); }
});

test("CC-057/CC-058 · fixadas primeiro (até 5) e silenciadas", async () => {
  assert.deepEqual(L.ordenarFixadas([{ id: 1 }, { id: 2 }, { id: 3 }], [3]).map(c => c.id), [3, 1, 2]);
  assert.equal(L.alternarFixada([1, 2, 3, 4, 5], 6).ok, false);
  assert.deepEqual(L.alternarFixada([1, 2], 2).fixadas, [1]);
  const agora = Date.now();
  const m = L.silenciar({}, 9, 8, agora);
  assert.equal(L.estaSilenciada(m, 9, agora + 3600000), true);
  assert.equal(L.estaSilenciada(m, 9, agora + 9 * 3600000), false);
  assert.equal(L.estaSilenciada(L.silenciar({}, 9, 0, agora), 9, agora + 1e12), true, "sempre");
  assert.equal(L.estaSilenciada(L.silenciar(m, 9, null, agora), 9, agora), false);
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1), conv(2), conv(3)], acoes: { fixadas: () => [3], silenciada: id => id === 2 } });
    const ids = lista.el.querySelectorAll(".cvl-item").map(x => x.dataset.id);
    assert.deepEqual(ids, ["3", "1", "2"]);
    assert.ok(achar(lista.el, '.cvl-item[data-id="3"]').querySelector(".cvl-fixada"));
    assert.ok(achar(lista.el, '.cvl-item[data-id="2"]').querySelector(".cvl-silenciada"));
  } finally { d.fim(); }
  assert.match(SRC_CONV, /const chegaram = todas\.filter\(c => !conversaSilenciada\(c\.id\)\);/);
});

/* ================================================================ lote conv-c2 (CC-061 … CC-120) */
const SRC_COMP = ler("cv-composer.js");
const SRC_CFG = ler("cv-config.js");

test("CC-065 · «Sem som fora do horário de atendimento» cala o som com o departamento padrão fechado", () => {
  assert.match(SRC_CONV, /foraHorario: p\.foraHorario === true/);
  assert.match(SRC_CONV, /if \(pref\.som && !somCaladoAgora\(pref\)\) tocarSom\(\);/);
  assert.match(SRC_CONV, /const hor = A\.L\.horarioDoDepartamento\(A\.base, null\);\s*return hor !== undefined && hor !== null && !A\.L\.horarioAberto\(hor, new Date\(\)\);/);
  assert.match(SRC_CONV, /Sem som fora do horário de atendimento: ligado/);
});

test("CC-066/CC-119/CC-120 · ⋮ do chat: Ligar, Marcar consulta e Copiar link da conversa", async () => {
  const d = comDom();
  try {
    const agendou = [], copiados = [];
    d.ui.copiar = t => { copiados.push(t); return Promise.resolve(true); };
    const { A, chat } = await montarChat(d, { acoes: { agendar: n => agendou.push(n) } });
    A.ctx.temModulo = m => m === "crm";
    A.ver.negocios = [{ id: 44, status: "aberto", titulo: "Implante" }];
    chat.renderCabecalho();
    achar(chat.el, ".cvc-mais").click();
    const itens = d.menus.at(-1).itens.filter(x => x && x !== "-");
    assert.ok(itens.find(i => i.rotulo === "Ligar"));
    itens.find(i => i.rotulo === "Marcar consulta").fn();
    assert.equal(agendou.length, 1);
    itens.find(i => i.rotulo === "Copiar link da conversa").fn();
    assert.match(copiados[0], /#\/conversas\/9$/);
  } finally { d.fim(); }
});

test("CC-067 · botão direito no Enviar: «Enviar e resolver» envia e resolve", async () => {
  await comComposer({ acoes: { resolver() { this._r = (this._r || 0) + 1; } } }, async ({ A, comp, ta, enviados }, d) => {
    let resolveu = 0;
    A.acoes.resolver = () => { resolveu++; };
    ta.value = "Obrigado, até mais!"; d.ev(ta, "input");
    const bt = achar(comp.el, ".cvx-enviar");
    const ev = new d.Evento("contextmenu"); bt.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true);
    const it = d.menus.at(-1).itens.find(i => i.rotulo === "Enviar e resolver");
    await it.fn(); await esperar(5);
    assert.equal(enviados.length, 1); assert.equal(enviados[0].texto, "Obrigado, até mais!");
    assert.equal(resolveu, 1);
  });
});

test("CC-070/CC-071 · bolha: «Encaminhar» e «Criar tarefa» no menu da mensagem", async () => {
  const d = comDom();
  try {
    const chamadas = [];
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 10, { corpo: "Me liga amanhã às 10" })], acoes: {
      encaminhar: m => chamadas.push(["enc", m.id]), tarefaDeMensagem: m => chamadas.push(["tar", m.id]) } });
    achar(chat.el, '.cv-msg[data-id="1"] .cv-msg-mais').click();
    for (const it of d.menus.at(-1).itens) it.fn();
    assert.deepEqual(chamadas, [["enc", 1], ["tar", 1]]);
  } finally { d.fim(); }
  assert.equal(L.tituloTarefaDeMensagem({ corpo: "Me liga\namanhã às 10" }), "Me liga amanhã às 10");
  // o texto encaminhado vai direto para o campo (nada de texto do paciente no endereço)
  assert.match(SRC_CONV, /A\.ctx\.navegar\(`#\/conversas\/\$\{destino\}`\);\s*if \(await esperarConversa\(destino\) && A === E\) colocarTextoPronto\(destino, texto\);/);
});

test("CC-071/CC-080 · nova tarefa com o título da mensagem e prazos rápidos", async () => {
  const d = comDom();
  try {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return null; });
    d.ui.campo = ({ nome, valor, tipo }) => d.h("div", { class: "campo" }, d.h(tipo === "select" ? "select" : "input", { name: nome, value: valor ?? "" }));
    const { lat } = await montarLateral(d);
    lat.novaTarefa({ titulo: "Me liga amanhã às 10" });
    await esperar(5);
    assert.equal(corpo.querySelector('[name="titulo"]').value, "Me liga amanhã às 10");
    botaoTexto(corpo, /Amanhã 9h/).click();
    assert.match(corpo.querySelector('[name="vence_em"]').value, /^\d{4}-\d{2}-\d{2}T09:00$/);
  } finally { d.fim(); }
  const agora = Date.parse("2026-10-21T15:00:00Z");   // quarta 12h em SP
  assert.equal(L.prazoRapido("hoje17", agora), "2026-10-21T17:00");
  assert.equal(L.prazoRapido("amanha9", agora), "2026-10-22T09:00");
  assert.equal(L.prazoRapido("segunda9", agora), "2026-10-26T09:00");
  assert.equal(L.prazoRapido("semana", agora), "2026-10-28T09:00");
  assert.equal(L.prazoRapido("hoje17", Date.parse("2026-10-21T21:00:00Z")), "2026-10-21T20:00", "depois das 17h: 20h");
});

test("CC-075/CC-076/CC-077 · vídeo com «Baixar»; visualizador gira e copia (fonte)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 10, { tipo: "video", corpo: null, midia: { path: "c1/v.mp4", nome: "v.mp4" } })] });
    const b = achar(chat.el, '.cv-msg[data-id="1"] .cv-video-baixar');
    assert.equal(b.getAttribute("download"), "v.mp4");
  } finally { d.fim(); }
  const chat = ler("cv-chat.js");
  assert.match(chat, /giro = \(giro \+ 90\) % 360; img\.style\.setProperty\("--giro", `\$\{giro\}deg`\)/);
  assert.match(chat, /navigator\.clipboard\.write\(\[new globalThis\.ClipboardItem\(\{ "image\/png": png \}\)\]\)/);
  assert.match(CSS_CONV, /\.cv-lb-fig img \{ transform: rotate\(var\(--giro, 0deg\)\);/);
});

test("CC-081 · transferir: quem não recebe conversas vai por último e diz isso", () => {
  const ps = [{ id: "a", nome: "Ana", recebe_conversas: false }, { id: "b", nome: "Bia" }, { id: "c", nome: "Caio" }];
  assert.deepEqual(L.ordenarPessoasTransferir(ps).map(p => p.id), ["b", "c", "a"]);
  assert.equal(L.rotuloPessoaTransferir(ps[0], "x"), "Ana — não recebe conversas agora");
  assert.equal(L.rotuloPessoaTransferir(ps[1], "b"), "Bia (você)");
  assert.equal((SRC_CONV.match(/A\.L\.ordenarPessoasTransferir\(/g) || []).length, 2, "transferir e transferir em lote");
});

test("CC-084 · parâmetro do modelo com a data, a hora e o serviço da próxima consulta", () => {
  const prox = new Date(Date.now() + 2 * 86400000);
  const s = L.sugestoesParametroConsulta([{ inicio: prox.toISOString(), servico: "Limpeza" }, { inicio: agoraIso(60 * 24 * 30) }]);
  assert.deepEqual(s.map(x => x.rotulo), ["Data", "Hora", "Serviço"]);
  assert.match(s[0].valor, /^\d{2}\/\d{2}$/); assert.match(s[1].valor, /^\d{2}:\d{2}$/);
  assert.deepEqual(L.sugestoesParametroConsulta(undefined), []);
  assert.match(SRC_COMP, /L\.sugestoesParametroConsulta\(contato\(\)\.consultas\)/);
});

test("CC-085 · várias fotos: antes/depois mudam a ordem do envio (fonte)", () => {
  assert.match(SRC_COMP, /function moverFoto\(p, d, bt\) \{[\s\S]{0,400}prontas\[a\] = outro; prontas\[b\] = p;/);
  assert.match(SRC_COMP, /"aria-label": "Mover a foto para antes"/);
});

test("CC-086 · «Salvar como resposta» pode ficar só no departamento da conversa", async () => {
  await comComposer({ base: { departamentos: [{ id: "d1", nome: "Financeiro" }] }, conv: { departamento_id: "d1" } }, async ({ A, comp, ta }, d) => {
    const gravadas = [];
    A.api = { rpcC: async (n, p) => { gravadas.push([n, p]); return { atalho: "x", titulo: "t", corpo: "c" }; } };
    ta.value = "Segue o boleto"; d.ev(ta, "input");
    d.aoModal(async o => { achar(o.corpo, "#cvx-rr-para").value = "d1"; achar(o.corpo, "#cvx-rr-atalho").value = "boleto"; return o.acoes[1].fn({ erro() {} }); });
    achar(comp.el, '[aria-label="Mais opções"]').click();
    await d.menus.at(-1).itens.find(x => x.rotulo === "Salvar como resposta rápida").fn();
    const g = gravadas.find(x => x[0] === "nx_resposta_salvar");
    assert.ok(g, "gravou");
    assert.equal(g[1].p_resposta.departamento_id, "d1");
  });
});

test("CC-087/CC-088/CC-091 · respostas: duplicar com atalho -copia, interruptor na linha e limite com a assinatura", () => {
  assert.equal(L.atalhoDeCopia("ola", [{ atalho: "ola" }]), "ola-copia");
  assert.equal(L.atalhoDeCopia("ola", [{ atalho: "ola" }, { atalho: "ola-copia" }]), "ola-copia2");
  assert.equal(L.atalhoDeCopia("a".repeat(30), []).length, 30);
  assert.match(SRC_CFG, /if \(!nova\) acoes\.unshift\(\{ rotulo: "Duplicar", tipo: "neutro", valor: "duplicar" \}\);/);
  assert.match(SRC_CFG, /if \(res === "duplicar"\) \{ await editar\(r, \{ copia: true \}\); return; \}/);
  assert.match(SRC_CFG, /await ctx\.api\.rpcC\("nx_resposta_salvar", \{ p_resposta: \{ id: r\.id, ativo: !ligada \} \}\);/);
  assert.match(SRC_CFG, /cabem \$\{tetoAss\.toLocaleString\("pt-BR"\)\} com a assinatura/);
});

test("CC-094 · Nova conversa no CodeWords: «Primeira mensagem» vai para o campo (fonte)", () => {
  assert.match(SRC_CONV, /blocoPrimeira\.hidden = !\(k && k\.provedor === "codewords"\);/);
  assert.match(SRC_CONV, /if \(textoPrimeira\) \{ const E = A; if \(await esperarConversa\(item\.id\) && A === E\) colocarTextoPronto\(item\.id, textoPrimeira\); \}/);
});

test("CC-095 · gravação com pausar/continuar; as pausas não contam no tempo (fonte)", () => {
  assert.match(SRC_COMP, /const decorrido = \(\) => \(Date\.now\(\) - atual\.inicio - atual\.pausadaMs - \(atual\.pausadaEm \? Date\.now\(\) - atual\.pausadaEm : 0\)\) \/ 1000;/);
  assert.match(SRC_COMP, /rec\.pause\(\); atual\.pausadaEm = Date\.now\(\);/);
  assert.match(SRC_COMP, /btPausarGravacao\.hidden = !\(typeof rec\.pause === "function" && typeof rec\.resume === "function"\);/);
});

test("CC-096 · texto devolvido com a conversa resolvida vai para o rascunho e avisa", async () => {
  await comComposer({ conv: { status: "resolvida" } }, async ({ A, comp }, d) => {
    comp.devolverTexto("Sua consulta é amanhã");
    assert.equal(A.rascunhos.get(9), "Sua consulta é amanhã");
    assert.ok(d.toasts.some(t => /ficou guardado como rascunho/.test(t)));
  });
});

test("CC-097/CC-098 · exportação com responsável, departamento, número, período e onde pegar o arquivo", () => {
  const t = L.textoExportacao([
    { id: 1, tipo: "texto", direcao: "in", corpo: "oi", criado_em: "2026-10-13T17:02:00Z" },
    { id: 2, tipo: "documento", direcao: "out", corpo: null, criado_em: "2026-10-13T17:05:00Z", midia: { nome: "orcamento.pdf" }, enviado_por: { nome: "Ana" } }],
  { contato: "Maria", titulo: "Conversa com Maria", cabecalho: ["Responsável: Ana", "Departamento: Recepção", null] });
  const l = t.split("\n");
  assert.deepEqual(l.slice(0, 4), ["Conversa com Maria", "Responsável: Ana", "Departamento: Recepção", "Período: 13/10/2026 14:02 a 13/10/2026 14:05"]);
  assert.match(t, /Ana: Documento: orcamento\.pdf \[arquivo «orcamento\.pdf» — baixe pela conversa no Órbita\]/);
  assert.match(SRC_CONV, /`Responsável: \$\{\(conv\.atribuida && conv\.atribuida\.nome\) \|\| conv\.atribuida_nome \|\| "sem dono"\}`/);
});

test("CC-099 · o resumo guardado como nota volta para a seção ao reabrir", async () => {
  const d = comDom();
  try {
    const { A, lat, alvo } = await montarLateral(d);
    A.base.ia = { ligada: true };
    A.msgs = [{ id: 80, tipo: "nota", direcao: "out", corpo: "Resumo da IA: quer remarcar para sexta", criado_em: agoraIso(30) }];
    lat.render();
    const sec = achar(alvo, '.cvt-sec[data-sec="resumo-ia"]');
    assert.match(sec.textContent, /quer remarcar para sexta/);
    assert.match(sec.textContent, /Guardado como nota/i);
  } finally { d.fim(); }
  assert.equal(L.resumoDaNota([{ tipo: "nota", corpo: "outra" }]), null);
});

test("CC-103/CC-104/CC-105/CC-106/CC-107 · departamentos e pareamento", () => {
  const COM = { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]] };
  assert.equal(L.proximaAbertura(COM, new Date("2026-10-24T15:00:00Z")), "seg 08:00", "sábado meio-dia");
  assert.equal(L.proximaAbertura(COM, new Date("2026-10-21T22:00:00Z")), "amanhã 08:00", "quarta 19h");
  assert.equal(L.proximaAbertura(COM, new Date("2026-10-21T09:00:00Z")), "hoje 08:00", "quarta 6h");
  assert.equal(L.proximaAbertura(null), "");
  assert.match(SRC_CFG, /return prox \? `Fechado · abre \$\{prox\}` : "Fechado agora";/);
  assert.match(SRC_CFG, /on: \{ click: \(\) => editar\(d, \{ foco: "msg_fora_horario" \}\) \} \}, ui\.icone\("alerta"\), "Sem mensagem fora do horário · Ligar"\)/);
  assert.equal(L.textoContagem(161), "2:41");
  assert.match(SRC_CFG, /`Código de pareamento: \$\{String\(r\.codigo \|\| ""\)\.replace\(\/\[\\s-\]\/g, ""\)\.split\(""\)\.join\(" "\)\}`/);
  assert.match(SRC_CFG, /if \(!form\.isConnected\) \{ pararPolling\(\); return; \}/);
});

test("CC-115 · o mesmo SLA para o admin (config) e o atendente (base.departamentos)", () => {
  const c = { status: "aberta", aguardando: true, ultima_entrada_em: "2026-10-16T22:00:00Z", departamento_id: "d1" };
  const agora = new Date("2026-10-19T11:05:00Z");
  const dep = { id: "d1", padrao: true, horario: COMERCIAL };
  const admin = L.esperaDaConversa(c, { config: { departamentos: [dep] }, departamentos: [{ id: "d1" }] }, agora);
  const atendente = L.esperaDaConversa(c, { departamentos: [dep] }, agora);
  assert.equal(admin.minutos, atendente.minutos);
  assert.equal(atendente.uteis, true);
});

test("CC-118 · rascunho regravado depois da cota cheia entra no índice e o aparar o enxerga", () => {
  const mem = new Map(); let falhar = true;
  const storage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
    setItem: (k, v) => { if (falhar && k.endsWith(":a")) { falhar = false; const e = new Error("cheio"); e.name = "QuotaExceededError"; throw e; } mem.set(k, String(v)); },
  };
  let t = 1000;
  const R1 = R.criarRascunhos({ storage, conta: () => "u1", cliente: () => "c1", agora: () => (t += 1000), agendar: (fn, ms) => setTimeout(fn, ms), cancelar: clearTimeout,
    doc: null, janela: null, debounceMs: 0, tetoTotal: 450, varrerMs: 1e12 });
  const campo = () => { const ouv = []; return { tagName: "TEXTAREA", value: "", addEventListener: (_, f) => ouv.push(f), removeEventListener() {}, dispatchEvent() {}, parentNode: null }; };
  const ca = campo(); const la = R1.ligar(ca, "a"); ca.value = "x".repeat(100); la.salvarAgora();
  assert.ok([...mem.keys()].some(k => k.endsWith(":a")), "a 2ª tentativa gravou");
  const cb = campo(); const lb = R1.ligar(cb, "b"); cb.value = "y".repeat(100); lb.salvarAgora();
  assert.ok(![...mem.keys()].some(k => k.endsWith(":a")), "passou do teto: o mais antigo (a) saiu — antes ele ficava fora do índice e nunca saía");
  assert.ok([...mem.keys()].some(k => k.endsWith(":b")));
});

/* ================================================================ lote conv-c3 (CC-121 … CC-335) */
const SRC_CHAT = ler("cv-chat.js");
const SRC_LISTA = ler("cv-lista.js");

test("CC-121 · «Imprimir ou salvar em PDF»: página escapada e o item no ⋮", async () => {
  const html = L.htmlImpressao({ titulo: "Conversa <Maria>", empresa: "Clínica & Cia", texto: "linha 1\n\n<script>alert(1)</script>" });
  assert.match(html, /<title>Conversa &lt;Maria&gt;<\/title>/);
  assert.match(html, /<b>Clínica &amp; Cia<\/b>/);
  assert.doesNotMatch(html, /<script>/, "nada do texto vira HTML");
  assert.match(html, /<p>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/p>/);
  const d = comDom();
  try {
    const pedidos = [];
    const { chat } = await montarChat(d, { acoes: { exportar() {}, exportarPdf: () => pedidos.push(1) } });
    achar(chat.el, ".cvc-mais").click();
    d.menus.at(-1).itens.find(i => i && i.rotulo === "Imprimir ou salvar em PDF").fn();
    assert.equal(pedidos.length, 1);
  } finally { d.fim(); }
  assert.match(SRC_CONV, /if \(pdf\) \{ imprimirPagina\(A\.L\.htmlImpressao\(/);
  assert.match(SRC_CONV, /quadro\.srcdoc = html;/);
});

test("CC-122 · o cabeçalho usa um MediaQueryList só (não cria dois por desenho)", async () => {
  const d = comDom();
  const mm = globalThis.matchMedia;
  let criados = 0;
  globalThis.matchMedia = q => { if (/max-width: 760px/.test(q)) criados++; return { matches: false, addEventListener() {}, removeEventListener() {} }; };
  try {
    const { A, chat } = await montarChat(d);
    const antes = criados;
    for (let i = 0; i < 5; i++) { A.ver.conversa = { ...A.ver.conversa, protocolo: `ORB-${i + 2}` }; chat.renderCabecalho(); }
    assert.ok(criados - antes <= 1, `criou ${criados - antes} MediaQueryList em 5 desenhos`);
  } finally { globalThis.matchMedia = mm; d.fim(); }
});

test("CC-123 · placeholder curto «Mensagem» (sem «/ para respostas rápidas» com espaços duplos)", async () => {
  await comComposer({}, async ({ ta }) => {
    assert.equal(ta.placeholder, "Mensagem");
  });
  assert.doesNotMatch(SRC_COMP, /Mensagem {2}· {2}\/ para respostas rápidas/);
});

test("CC-124 · dono sem nome na linha: procura na equipe; sem nada, ícone (nunca «?»)", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1, { atribuida_a: "u7", atribuida_nome: null }), conv(2, { atribuida_a: "u8", atribuida_nome: null })],
      aba: "todas", base: { usuarios: [{ id: "u7", nome: "Paula Reis" }] } });
    const d1 = achar(lista.el, '.cvl-item[data-id="1"] .cvl-dono');
    assert.equal(d1.getAttribute("title"), "Com Paula Reis");
    assert.notEqual(d1.textContent, "?");
    const d2 = achar(lista.el, '.cvl-item[data-id="2"] .cvl-dono');
    assert.ok(d2.classList.contains("cvl-dono-sem"));
    assert.notEqual(d2.textContent, "?");
  } finally { d.fim(); }
});

test("CC-125/CC-126 · assistente: horário e serviços vindos da agenda", () => {
  assert.equal(L.textoHorarioIA(COMERCIAL, [["12:00", "13:00"]]), "Seg a Sex 08:00–18:00 · Sáb e Dom fechado (horário de Brasília). Pausas: 12:00–13:00.");
  assert.deepEqual(L.linhasServicosIA({ "Avaliação": 30, Limpeza: 45, "": 10 }, "Fazemos LIMPEZA dental"), ["- Avaliação (30 min)"]);
  assert.deepEqual(L.linhasServicosIA(null, ""), []);
  assert.match(SRC_CFG, /ctx\.api\.rpcC\("nx_agenda_config_ver", \{\}\)/);
  assert.match(SRC_CFG, /k === "horarios" \? "Usar o horário da agenda" : "Trazer serviços da agenda"/);
});

test("CC-128/CC-129/CC-130/CC-335 · textos do assistente e das preferências", () => {
  assert.doesNotMatch(SRC_CFG, /"Passou de 15\.000 caracteres/);
  assert.match(SRC_CFG, /`Passou de \$\{L\.IA_MAX\.toLocaleString\("pt-BR"\)\} caracteres\. Resuma algum texto\.`/);
  assert.match(SRC_CFG, /rotulo: cws\.length === 1 \? "Copiar prompt atualizado" : "Abrir Números"/);
  assert.match(SRC_CFG, /ctx\.api\.fn\("nx-codewords", \{ acao: "receita", canal: cws\[0\]\.id \}\)/);
  assert.doesNotMatch(SRC_CFG, /Sua avaliação ficou para quinta/);
  assert.match(SRC_CFG, /No número do CodeWords o Órbita e a IA não mandam a confirmação de leitura/);
});

test("CC-137/CC-138 · «Sem dono» assume; a janela é lida por inteiro", async () => {
  const d = comDom();
  try {
    const { chat, chamadas } = await montarChat(d, { conv: { ultima_entrada_em: agoraIso(60) } });
    const p = achar(chat.el, ".cv-pil-assumir");
    assert.match(p.getAttribute("aria-label"), /Sem dono\. Assumir esta conversa/);
    p.click();
    assert.deepEqual(chamadas.at(-1), ["assumir"]);
    const jan = achar(chat.el, ".cv-janela");
    assert.match(achar(jan, ".sr-only").textContent, /^Janela aberta · \d+ h restantes?$/);
    assert.equal(achar(jan, ".so-curto-txt").getAttribute("aria-hidden"), "true");
  } finally { d.fim(); }
  const d2 = comDom();
  try {
    const { A, chat } = await montarChat(d2);
    A.podeEscrever = false; chat.renderCabecalho();
    assert.equal(chat.el.querySelector(".cv-pil-assumir"), null, "só leitura: continua pílula");
  } finally { d2.fim(); }
});

test("CC-140/CC-313 · ⋮: abrir no WhatsApp do aparelho e «Pausar a IA até…»", async () => {
  assert.equal(L.linkWhatsApp("(12) 99999-0000"), "https://wa.me/5512999990000");
  const agora = new Date("2026-10-21T15:00:00Z");   // 12h em SP
  assert.equal(L.horasAteHora("18:00", agora), 6);
  assert.equal(L.horasAteHora("08:00", agora), 20, "já passou: amanhã");
  assert.equal(L.horasAteHora("25:00", agora), null);
  const d = comDom();
  try {
    const pausas = [];
    const { A, chat } = await montarChat(d, { provedor: "codewords", ia: { disponivel: true, ia_ligada: true, pausada: false },
      acoes: { assumirIA: (_b, o) => pausas.push(o) } });
    A.ver.conversa.canal.provedor = "codewords"; chat.renderCabecalho();
    achar(chat.el, ".cvc-mais").click();
    const itens = d.menus.at(-1).itens.filter(x => x && x !== "-");
    assert.ok(itens.find(i => i.rotulo === "Abrir no WhatsApp deste aparelho"));
    d.aoModal(async o => { achar(o.corpo, "#cvc-pausa-ate").value = "23:30"; return o.acoes[1].fn({ erro() {} }); });
    await itens.find(i => i.rotulo === "Pausar a IA até…").fn();
    await esperar(5);
    assert.equal(pausas.length, 1);
    assert.equal(pausas[0].horas, L.horasAteHora("23:30"));
  } finally { d.fim(); }
});

test("CC-141 · conversa resolvida: «Reabrir e responder» reabre e põe o cursor no campo", async () => {
  await comComposer({ conv: { status: "resolvida" } }, async ({ A, comp, ta }) => {
    const pedidos = [];
    A.acoes.status = async s => { pedidos.push(s); A.ver.conversa.status = "aberta"; comp.atualizar(); };
    const b = botaoTexto(comp.el, /Reabrir e responder/);
    assert.ok(b);
    b.click(); await esperar(10);
    assert.deepEqual(pedidos, ["aberta"]);
    assert.equal(globalThis.document.activeElement, ta);
  });
});

test("CC-146/CC-311/CC-312 · transferir: recados usados antes, aviso ao cliente e nota com o destino", () => {
  assert.equal(L.textoRecadoTransferencia({ pessoa: "Ana", departamento: "Financeiro", recado: " boleto " }), "Transferida para Ana (Financeiro): boleto");
  assert.equal(L.textoRecadoTransferencia({ departamento: "Financeiro", recado: "x" }), "Transferida para a fila de Financeiro: x");
  assert.equal(L.textoAvisoTransferencia({ pessoa: "ANA SOUZA", departamento: "Financeiro" }), "Vou te passar para Ana, do Financeiro, que continua o seu atendimento por aqui.");
  assert.equal(L.textoAvisoTransferencia({ departamento: "Financeiro" }), "Vou te passar para o Financeiro, já te respondem por aqui.");
  assert.match(SRC_CONV, /gravarJsonLocal\(RECADOS_CHAVE, \[s, \.\.\.lista\]\.slice\(0, 4\)\);/);
  assert.equal((SRC_CONV.match(/chipsRecado\(recado\)/g) || []).length, 2, "transferir e transferir em lote");
  assert.match(SRC_CONV, /if \(escolha\.aviso && \(\(escolha\.conta \|\| null\) !== \(conv\.atribuida_a \|\| null\) \|\| escolha\.dep\)\) \{\s*try \{ await enviarTexto\(\{ tipo: "texto", texto: escolha\.aviso \}\); \}/);
});

test("CC-147/CC-156 · nomes acessíveis da folha do ⋮ e da citação", async () => {
  assert.match(SRC_CHAT, /abrirFolha\(mais, itens, \["Atendimento", "Contato", "Bloqueio"\], `Ações da conversa com \$\{nome\}`\)/);
  assert.match(SRC_CHAT, /const dlg = h\("dialog", \{ class: "cv-folha", "aria-label": rotulo \}\);/);
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 10), txt(2, "out", 5, { responde_a: { id: 1, direcao: "in", resumo: "msg 1" } })] });
    assert.equal(achar(chat.el, '.cv-msg[data-id="2"] .cv-cita').getAttribute("aria-label"), "Ir para a mensagem citada de Mariana Costa: msg 1");
  } finally { d.fim(); }
});

test("CC-149 · Nova conversa mostra para onde o número vai", () => {
  assert.equal(L.previaTelefone("12 99999-0000"), "Vai para +55 12 99999-0000");
  assert.equal(L.previaTelefone("(12) 3333-4444"), "Vai para +55 12 3333-4444");
  assert.equal(L.previaTelefone("+1 415 555 1234"), "Vai para +14155551234");
  assert.equal(L.previaTelefone("12"), "", "incompleto: nada");
  assert.match(SRC_CONV, /const pintarPrevia = \(\) => \{ const t = L\.previaTelefone\(tel\.value\);/);
});

test("CC-151 · «mostrar» no traço fino vale só para esta conversa", async () => {
  const d = comDom();
  try {
    const sis = (id, min, corpo) => ({ id, conversa_id: 9, direcao: "out", tipo: "sistema", corpo, criado_em: agoraIso(min), atualizado_em: agoraIso(min) });
    let global = false, mudou = 0;
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 9), sis(2, 8, "IA respondeu"), sis(3, 7, "IA pausada")],
      acoes: { mostrarSistema: () => global, definirMostrarSistema: v => { global = v; mudou++; } } });
    const fino = achar(chat.el, ".cv-sis-fino");
    assert.match(fino.textContent, /mostrar nesta conversa$/);
    achar(fino, "button").click();
    assert.ok(achar(chat.el, "details.cv-sis-grupo"), "à vista nesta conversa");
    assert.equal(mudou, 0, "a preferência global não mudou");
    A.ver.conversa = { ...A.ver.conversa, id: 10 };
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector("details.cv-sis-grupo"), null, "outra conversa: recolhidos de novo");
  } finally { d.fim(); }
});

test("CC-152/CC-153 · vídeo em rede lenta não baixa ao rolar; localização com rota no Waze", async () => {
  assert.equal(L.economiaDeDados({ saveData: true }), true);
  assert.equal(L.economiaDeDados({ effectiveType: "3g" }), true);
  assert.equal(L.economiaDeDados({ effectiveType: "slow-2g" }), true);
  assert.equal(L.economiaDeDados({ effectiveType: "4g" }), false);
  assert.equal(L.economiaDeDados(undefined), false);
  assert.match(SRC_CHAT, /if \(economia\) cxVideo\.dataset\.economia = "1"; else preloadPreguicoso\(v, cxVideo\);/);
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5, { tipo: "localizacao", corpo: "Localização: Clínica (-23.0265, -45.5558)" })] });
    const w = achar(chat.el, '.cv-msg[data-id="1"] .cv-waze');
    assert.match(w.getAttribute("href"), /^https:\/\/waze\.com\/ul\?ll=-23\.0265%2C-45\.5558&navigate=yes$/);
  } finally { d.fim(); }
});

test("CC-157/CC-158/CC-159/CC-316 · números e respostas: o que fica de fora, os 4 dígitos, rótulos e erro da sincronização", () => {
  assert.equal(L.finalNumero({ numero_exibicao: "+55 12 99999-1234" }), "1234");
  assert.equal(L.finalNumero({}), "");
  assert.match(SRC_CFG, /digitar: final \|\| "excluir"/);
  assert.match(SRC_CFG, /"ID do número na Meta \(Phone number ID\)"/);
  assert.match(SRC_CFG, /`A última recuperação falhou: \$\{sync\.erro\}\. Toque em «Reconferir agora»\.`/);
  assert.match(SRC_CFG, /com atalho que já existe \(\$\{nomesRep\}; as daqui continuam como estão\)/);
});

test("CC-160/CC-315 · departamento: «Duplicar» abre como novo; rodízio sem ninguém avisa", async () => {
  const dc = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const dep = { id: "d1", nome: "Recepção", cor: null, padrao: false, ativo: true, distribuicao: "rodizio", pessoas: 0, horario: COMERCIAL, msg_fora_horario: "Volto já" };
    let modal = null;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { config: { departamentos: [dep] }, usuarios: [] } : {}), modal: o => { modal = o; return null; } });
    const menus = [];
    t.ctx.ui.menu = (_a, itens) => menus.push(itens);
    const limpar = await CV.secoesConfig.find(s => s.id === "departamentos").montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    assert.ok(t.alvo.querySelector(".cfg-dep-ninguem"), "rodízio sem ninguém: aviso no cartão");
    t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais opções de Recepção").dispatchEvent(new dc.Evento("click"));
    menus.at(-1).find(i => i && i.rotulo === "Duplicar").fn(); await tique(4);
    assert.equal(modal.titulo, "Duplicar departamento");
    assert.equal(modal.acoes[1].rotulo, "Criar departamento");
    assert.equal(modal.corpo.querySelector('[name="nome"]').value, "Recepção (cópia)");
  } finally { if (sair) sair(); dc.fim(); }
  assert.match(SRC_CFG, /if \(d && !copia\) payload\.id = d\.id;/);
});

test("CC-162 · colar 2 imagens vai para o envio de várias fotos (DOM)", async () => {
  await comComposer({}, async ({ ta }, d) => {
    const titulos = [];
    d.aoModal(o => { titulos.push(o.titulo); return false; });
    const imgs = ["a.png", "b.png"].map(n => new File([new Uint8Array(2000)], n, { type: "image/png" }));
    const ev = new d.Evento("paste");
    ev.clipboardData = { items: imgs.map(f => ({ kind: "file", type: f.type, getAsFile: () => f })), files: imgs };
    ta.dispatchEvent(ev); await esperar(30);
    assert.ok(titulos.some(t => /2 fotos/.test(String(t))), `modal: ${titulos.join(" | ")}`);
  });
});

test("CC-163/CC-164 · notificação agrupada (1, 2, 3 e 10) e cada código de erro da Meta", () => {
  const nome = c => c.contato.nome;
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, contato: { nome: `P${i + 1}` }, ultima_msg_resumo: "oi" }));
  assert.match(L.textoNotificacao(mk(1), { quem: true, texto: true }, nome).titulo, /P1/);
  for (const n of [2, 3, 10]) assert.match(JSON.stringify(L.textoNotificacao(mk(n), { quem: true }, nome)), new RegExp(String(n)), `${n} conversas`);
  for (const [cod, re] of [["131026", /bloqueou o número da empresa/], ["131047", /24 h|janela|modelo/i], ["131051", /tipo|suportad/i], ["131053", /arquivo|mídia|midia/i]])
    assert.match(L.dicaErroEnvio(cod), re, cod);
});

test("CC-307 · «Sugerir com IA» diz quanto resta da cota", async () => {
  assert.equal(L.textoCotaIA({ limite: 200, usadas: 80 }), "Restam 120 sugestões de IA este mês");
  assert.equal(L.textoCotaIA({ limite: 200, usadas: 190 }), "Restam 10 sugestões de IA este mês (quase no fim)");
  assert.equal(L.textoCotaIA({ limite: null }), null);
  await comComposer({ base: { ia: { ligada: true, cota: { usadas: 5, limite: 100 } } } }, async ({ comp }) => {
    assert.equal(achar(comp.el, '.cvx-ferr button[aria-label="Sugerir resposta com IA"]').title, "Sugerir com IA · Restam 95 sugestões de IA este mês");
  });
});

test("CC-314 · «Não quer marketing» abre a ficha para o supervisor registrar", async () => {
  const d = comDom();
  try {
    const abertos = [];
    const { A, chat } = await montarChat(d);
    A.ver.contato.optin_marketing = false;
    A.ctx.abrirContato = id => abertos.push(id);
    d.ui.confirmar = async () => true;
    chat.renderCabecalho();
    achar(chat.el, ".cv-pil-optin").click(); await esperar(5);
    assert.deepEqual(abertos, [5]);
  } finally { d.fim(); }
});

test("CC-326/CC-292 · transferir: sem departamento escolhido manda null (mantém o de cada conversa)", () => {
  assert.deepEqual(L.argumentosTransferir({ conta: "u3", dep: null }), { p_conta: "u3", p_departamento: null });
  assert.deepEqual(L.argumentosTransferir({ conta: null, dep: "" }), { p_conta: null, p_departamento: null });
  assert.deepEqual(L.argumentosTransferir({ conta: "", dep: "d2" }), { p_conta: null, p_departamento: "d2" });
  assert.equal((SRC_CONV.match(/argumentosTransferir\(/g) || []).length, 2, "transferir e transferir em lote");
});

/* ============================================================ plano 1500c · complemento CX (conv-x) */

test("CX-003/CX-004 · tipo do arquivo: apelidos (image/jpg, audio/x-m4a, audio/mp3) e tipo genérico usam a extensão", () => {
  for (const [type, esperado] of [["image/jpg", "image/jpeg"], ["image/pjpeg", "image/jpeg"], ["audio/x-m4a", "audio/mp4"], ["audio/mp3", "audio/mpeg"], ["audio/x-aac", "audio/aac"], ["audio/opus", "audio/ogg"]])
    assert.equal(L.mimeDe({ name: "x", type }), esperado, type);
  assert.equal(L.validarArquivo({ name: "foto.jpg", type: "image/jpg", size: 1000 }).tipo, "imagem");
  assert.equal(L.validarArquivo({ name: "voz.m4a", type: "audio/x-m4a", size: 1000 }).tipo, "audio");
  assert.equal(L.mimeDe({ name: "laudo.pdf", type: "application/octet-stream" }), "application/pdf");
  assert.equal(L.validarArquivo({ name: "laudo.pdf", type: "application/octet-stream", size: 1000 }).tipo, "documento");
  assert.equal(L.validarArquivo({ name: "coisa.bin", type: "application/octet-stream", size: 1000 }).erro, "midia_tipo", "sem extensão conhecida continua recusado");
  assert.equal(L.mimeDe({ name: "semextensao", type: "" }), "");
});

test("CX-005 · arquivo vazio (0 byte) tem motivo próprio, não «tipo não aceito»", () => {
  const v = L.validarArquivo({ name: "laudo.pdf", type: "application/pdf", size: 0 });
  assert.equal(v.ok, false); assert.equal(v.erro, "midia_vazia");
  const src = ler("cv-composer.js");
  assert.match(src, /v\.erro === "midia_vazia" \? `«\$\{escolhidoInicial\.name/);
  assert.match(src, /v\.erro === "midia_vazia" \? "o arquivo está vazio \(0 byte\)"/);
});

test("CX-006 · primeiro nome pula emoji e símbolo do começo do nome do WhatsApp", () => {
  assert.equal(L.primeiroNome("🌸 Maria Souza"), "Maria");
  assert.equal(L.primeiroNome("~Ana~ Lima"), "Ana");
  assert.equal(L.primeiroNome("💙💙"), "");
  assert.equal(L.primeiroNome("Dra. Helena"), "Helena");
  assert.equal(L.primeiroNome("João, da padaria"), "João");
  assert.equal(L.primeiroNome("MARIA"), "Maria");
});

test("CX-007 · resposta rápida acha com várias palavras em qualquer ordem", () => {
  const lista = [{ id: 1, atalho: "limpeza", titulo: "Limpeza: preço e duração", corpo: "A limpeza custa R$ 200." }, { id: 2, atalho: "ola", titulo: "Saudação", corpo: "Olá!" }];
  assert.deepEqual(L.filtrarRespostas(lista, "preco limpeza").map(r => r.id), [1]);
  assert.deepEqual(L.filtrarRespostas(lista, "duracao custa").map(r => r.id), [1]);
  assert.deepEqual(L.filtrarRespostas(lista, "preco ola").map(r => r.id), []);
});

test("CX-008/CX-009/CX-010 · dica para os códigos de limite, modelo e conta da Meta", () => {
  for (const [cod, re] of [["130429", /velocidade/], ["meta_131048", /spam/], ["131049", /marketing/], ["131056", /seguidas/],
    ["132000", /campos/], ["132001", /Sincronize/], ["132005", /longo/], ["132012", /formato/], ["132015", /pausado/], ["132016", /desativado/],
    ["131021", /próprio número/], ["131031", /bloqueada/], ["131042", /pagamento/], ["133010", /registrado/]])
    assert.match(L.dicaErroEnvio(cod), re, cod);
});

test("CX-011 · limite da Meta (130429/131056) espera e tenta de novo; o resto continua definitivo", () => {
  const c = L.classificarFalhaEnvio({ codigo: "meta_130429", status: 400 });
  assert.equal(c.tipo, "rede"); assert.equal(c.subtipo, "servidor"); assert.match(c.motivo, /velocidade/);
  assert.equal(L.classificarFalhaEnvio({ codigo: "131056" }).tipo, "rede");
  assert.equal(L.classificarFalhaEnvio({ codigo: "meta_131026" }).tipo, "definitiva");
});

test("CX-012 · telefone só com letras tem um erro que faz sentido", () => {
  assert.match(L.erroTelefone("maria"), /só os números/);
  assert.match(L.erroTelefone("12 9"), /Faltam números/);
});

test("CX-013 · modelo não aprovado diz o motivo de cada situação da Meta", () => {
  assert.match(L.modeloDisponivel({ status: "REJECTED" }).motivo, /Recusado/);
  assert.match(L.modeloDisponivel({ status: "PAUSED" }).motivo, /Pausado/);
  assert.match(L.modeloDisponivel({ status: "DISABLED" }).motivo, /Desativado/);
  assert.equal(L.modeloDisponivel({ status: "PENDING" }).motivo, "Ainda não aprovado pela Meta.");
});

test("CX-014/CX-015 · lembrete usa a palavra da vertical e diz «amanhã»/«hoje»", () => {
  const agora = Date.now();
  const diaDepois = new Date(agora + 2 * 86400000).toISOString();
  assert.match(L.textoLembrarConsulta({ inicio: diaDepois }, "Ana", "Visita", agora), /da sua visita (no dia|amanhã)/);
  assert.match(L.textoLembrarConsulta({ inicio: diaDepois }, "Ana"), /da sua consulta/);
  const amanha = new Date(Date.parse(`${L.diaSP(agora + 86400000)}T10:00:00-03:00`)).toISOString();
  assert.match(L.textoLembrarConsulta({ inicio: amanha }, "Ana", "consulta", agora), /amanhã \(\d\d\/\d\d\) às 10:00/);
  const daqui5 = new Date(Date.parse(`${L.diaSP(agora + 5 * 86400000)}T10:00:00-03:00`)).toISOString();
  assert.match(L.textoLembrarConsulta({ inicio: daqui5 }, "", "Entrega", agora), /^Olá! Passando para lembrar da sua entrega no dia/);
  assert.match(ler("cv-lateral.js"), /textoLembrarConsulta\(c, A\.acoes\.nomeContato\(ct\), \(A\.ctx\.vocab && A\.ctx\.vocab\.compromisso\)/);
});

test("CX-016 · e-mail na mensagem vira link mailto:", () => {
  const segs = L.formatarWhats("mande para ana@clinica.com.br, obrigado");
  assert.deepEqual(segs, [{ tipo: "texto", v: "mande para " }, { tipo: "link", v: "mailto:ana@clinica.com.br", texto: "ana@clinica.com.br" }, { tipo: "texto", v: ", obrigado" }]);
  assert.equal(L.formatarWhats("@ana oi").length, 1, "menção não é e-mail");
  assert.match(ler("cv-chat.js"), /if \(\/\^mailto:\/i\.test\(url\)\) return h\("a"/);
});

test("CX-017 · tamanho perto de 1 MB não vira «1.024 KB»", () => {
  assert.equal(L.tamanhoLegivel(1048570), "1 MB");
  assert.equal(L.tamanhoLegivel(1536), "1,5 KB");
  assert.equal(L.tamanhoLegivel(512.4), "512 B", "byte fracionado não aparece com vírgula");
});

test("CX-018 · hora da lista: data de outro ano leva o ano", () => {
  const agora = new Date();
  const anoPassado = new Date(agora.getTime() - 400 * 86400000).toISOString();
  assert.match(L.horaLista(anoPassado, agora), /^\d\d\/\d\d\/\d\d$/);
  const ha10 = new Date(agora.getTime() - 10 * 86400000);
  if (L.diaSP(ha10).slice(0, 4) === L.diaSP(agora).slice(0, 4)) assert.match(L.horaLista(ha10.toISOString(), agora), /^\d\d\/\d\d$/);
});

test("CX-001 · nome, telefone e e-mail do cliente levam .dado-pessoal (borrados no modo apresentação)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d);
    assert.match(achar(chat.el, ".cvc-nome").getAttribute("class"), /dado-pessoal/);
    assert.ok(chat.el.querySelectorAll(".cvc-sub .dado-pessoal").length >= 1, "telefone do cabeçalho");
    const { lista } = await montarLista(d, { itens: [conv(1)] });
    assert.match(achar(lista.el, ".cvl-nome").getAttribute("class"), /dado-pessoal/);
    const { alvo } = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000" } } });
    assert.match(achar(alvo, ".cvt-nome h2").getAttribute("class"), /dado-pessoal/);
    assert.match(achar(alvo, ".cvt-tel").getAttribute("class"), /dado-pessoal/);
  } finally { d.fim(); }
  assert.match(SRC_CONV, /ui\.h\("b", \{ class: "dado-pessoal" \}, nomeContato\(escolhido\)\)/, "nova conversa");
  assert.match(ler("cv-lista.js"), /h\("b", \{ class: "dado-pessoal" \}, r\.contato_nome/, "resultado da busca em mensagens");
});

test("CX-002 · mensagem que saiu dispara nx:mensagem-enviada (o «Comece aqui» marca o passo)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const antes = Object.getOwnPropertyDescriptor(globalThis, "CustomEvent");
  Object.defineProperty(globalThis, "CustomEvent", { value: class extends d.Evento {}, configurable: true, writable: true });
  const recebidos = [];
  d.doc.addEventListener("nx:mensagem-enviada", e => recebidos.push(e.detail));
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "Bom dia!"; d.ev(ta, "input");
    achar(c.alvo, ".cvx-enviar").click();
    await esperar(80);
    assert.equal(srv.conta("nx-enviar:texto"), 1);
    assert.deepEqual(recebidos, [{ conversa: 901, tipo: "texto" }]);
  } finally {
    c.fim(); d.fim();
    if (antes) Object.defineProperty(globalThis, "CustomEvent", antes); else delete globalThis.CustomEvent;
  }
  assert.match(SRC_CONV, /if \(r && r\.mensagem && r\.mensagem\.id && r\.ambigua !== true\) avisarEnviada\(convId/);
});
