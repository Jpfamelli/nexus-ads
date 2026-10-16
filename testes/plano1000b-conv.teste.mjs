/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026) · frente conv · Conversas
   node --test testes/plano1000b-conv.teste.mjs
   Cada teste cita o item (CB-NNN) do lote e falha no código de antes desta rodada.
   DOM mínimo e montadores copiados do plano1000-conversas (conversas) e do plano1000-automacoes (cv-config).
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
/* ---------------------------------------------------------------- (a) lógica pura */
test("CB-001 · «Sai como» e o teto usam a 1ª palavra do nome, como o nx-enviar", () => {
  assert.equal(L.prefixoAssinatura("Helena Souza"), "*Helena:*");
  assert.equal(L.nomeAssinatura("  Helena   Souza "), "Helena");
  assert.equal(L.LIMITE_TEXTO - L.tetoTexto({ assinatura: true, nome: "Helena Souza" }), "*Helena:*".length + 1);
});

test("CB-027 · negrito/itálico/riscado só com o fecho seguido de espaço, pontuação ou fim", () => {
  assert.ok(!L.formatarWhats("*promo*valida").some(s => s.tipo === "negrito"));
  assert.ok(!L.formatarWhats("2*3*4").some(s => s.tipo === "negrito"));
  assert.ok(!L.formatarWhats("_a_b").some(s => s.tipo === "italico"));
  assert.deepEqual(L.formatarWhats("*promo* válida")[0], { tipo: "negrito", v: "promo" });
  assert.deepEqual(L.formatarWhats("~x~!")[0], { tipo: "riscado", v: "x" });
  assert.deepEqual(L.formatarWhats("veja *isto*.").map(s => s.tipo), ["texto", "negrito", "texto"]);
});

test("CB-100 · número do canal recusa DDD que não existe (a mesma lista do erroTelefone)", () => {
  assert.equal(CV.normalizarNumeroCanal("(23) 99999-9999").ok, false);
  assert.equal(CV.normalizarNumeroCanal("+55 20 99999-9999").ok, false);
  assert.equal(CV.normalizarNumeroCanal("(12) 99999-9999").ok, true);
  assert.equal(CV.DDD_CANAL.source, L.DDD_VALIDO.source, "as duas listas são a mesma");
});

test("CB-008 · prefixo da mensagem encontrada: IA, automação, colega, eu e «Equipe» (nunca «Você» por padrão)", () => {
  assert.equal(L.prefixoMsgBusca({ direcao: "out", origem: "ia" }, "u1"), "IA: ");
  assert.equal(L.prefixoMsgBusca({ direcao: "out", origem: "automacao" }, "u1"), "Automação: ");
  assert.equal(L.prefixoMsgBusca({ direcao: "out", enviado_por_id: "u1" }, "u1"), "Você: ");
  assert.equal(L.prefixoMsgBusca({ direcao: "out", enviado_por: { id: "u2", nome: "Ana Paula" } }, "u1"), "Ana: ");
  assert.equal(L.prefixoMsgBusca({ direcao: "out" }, "u1"), "Equipe: ");
  assert.equal(L.prefixoMsgBusca({ direcao: "in" }, "u1"), "");
  assert.equal(L.prefixoMsgBusca({ direcao: "out", tipo: "nota" }, "u1"), "");
});

test("CB-038/CB-109/CB-112/CB-060 · lógica: resposta sem o nome do paciente, sigla do documento, trecho do parâmetro e datahora em SP", () => {
  const g = L.generalizarResposta("Olá, Mariana! Sou a Helena. Protocolo ORB-9, Mariana Costa.",
    { nome: "Mariana Costa", primeiro_nome: "Mariana", atendente: "Helena", atendente_nome: "Helena Souza", protocolo: "ORB-9" });
  assert.equal(g.texto, "Olá, {primeiro_nome}! Sou a {atendente}. Protocolo {protocolo}, {nome}.");
  assert.equal(g.trocas, 4);
  assert.equal(L.generalizarResposta("Marianara", { primeiro_nome: "Mariana" }).texto, "Marianara", "palavra inteira");
  assert.equal(L.siglaArquivo("laudo", "text/plain"), "TXT");
  assert.equal(L.siglaArquivo("exame.pdf", ""), "PDF");
  assert.equal(L.siglaArquivo("sem-ext", "application/x-desconhecido"), "ARQ");
  assert.equal(L.trechoParametro("Olá {{1}}, sua consulta é amanhã.", 1), "Olá {{1}}, sua consulta é amanhã.");
  assert.equal(L.trechoParametro("Olá", 1), "");
  const iso = new Date(Date.now() + 86400000).toISOString().replace(/:\d\d\.\d+Z$/, ":00.000Z");
  assert.equal(L.isoDeSP(L.datahoraSP(iso)), iso, "ida e volta pelo horário de São Paulo");
});

test("CB-141/CB-097 · cv-config: descrição das Preferências do atendimento e «Reconferir agora» suave", () => {
  assert.equal(CV.secoesConfig.find(s => s.id === "atendimento").desc, "Confirmação de leitura e assinatura");
  const src = ler("cv-config.js");
  assert.match(src, /async function consultarEstadoCodeWords\(c, botao\) \{[\s\S]*?await carregar\(\{ suave: true \}\);[^\n]*\n    \} catch/);
});

/* ---------------------------------------------------------------- (b) composer */
test("CB-011 (DOM) · «Responder citando» diz o motivo certo: resolvida pede para reabrir; janela fechada fala da janela", async () => {
  await comComposer({ conv: { status: "resolvida" } }, async ({ comp }, d) => {
    comp.responder(txt(1, "in", 5));
    assert.match(d.toasts.at(-1), /Reabra/);
    assert.doesNotMatch(d.toasts.at(-1), /24 h/);
  });
  await comComposer({ conv: { janela_ate: agoraIso(60), ultima_entrada_em: agoraIso(25 * 60) } }, async ({ comp }, d) => {
    comp.responder(txt(1, "in", 5));
    assert.match(d.toasts.at(-1), /janela de 24 h/);
  });
});

test("CB-019 (DOM) · o relógio refaz o composer sem tirar o foco do «Reabrir»", async () => {
  await comComposer({ conv: { status: "resolvida" } }, async ({ comp }, d) => {
    const b = achar(comp.el, '.cvx-trava [data-acao="reabrir"]');
    b.focus();
    comp.atualizar(); comp.atualizar();
    assert.equal(d.doc.activeElement, b);
    assert.ok(b.isConnected, "o mesmo botão continua na tela");
  });
});

test("CB-106 (DOM) · conversa em que o cliente nunca escreveu não diz «Passaram 24 h»", async () => {
  await comComposer({ conv: { janela_ate: null, ultima_entrada_em: null } }, async ({ ta }) => {
    assert.doesNotMatch(ta.placeholder, /Passaram 24 h/);
    assert.match(ta.placeholder, /Para começar/);
  });
});

test("CB-042 (DOM) · no toque, Ctrl+Enter envia (só o Enter puro fica desligado)", async () => {
  await comComposer({ dom: { grosso: true } }, async ({ ta, enviados, digitar }, d) => {
    digitar("oi");
    d.ev(ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.equal(enviados.length, 0, "Enter puro no toque não envia");
    d.ev(ta, "keydown", { key: "Enter", ctrlKey: true });
    await esperar(5);
    assert.equal(enviados.length, 1);
  });
});

test("CB-038 (DOM) · «Salvar como resposta rápida» troca o nome do paciente e o de quem atende por variáveis", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d, { contato: { nome: "Mariana Costa" }, eu: { id: "u1", nome: "Helena Souza" } });
    const chamadas = [];
    t.A.api = { rpcC: async (nome, p) => { chamadas.push([nome, p]); return { id: 78, ...p.p_resposta }; } };
    t.digitar("Olá, Mariana! Sou a Helena.");
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    let previa = null;
    d.aoModal(async o => { previa = achar(o.corpo, ".cvx-rr-salvar-previa").textContent; achar(o.corpo, "#cvx-rr-atalho").value = "oi"; return o.acoes[1].fn({ erro() {} }); });
    await d.menus.at(-1).itens.find(x => x.rotulo === "Salvar como resposta rápida").fn();
    assert.equal(previa, "Olá, {primeiro_nome}! Sou a {atendente}.");
    assert.equal(chamadas[0][1].p_resposta.corpo, "Olá, {primeiro_nome}! Sou a {atendente}.");
    // «Manter como está»: desmarcar grava o texto como foi escrito
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    d.aoModal(async o => { const chk = achar(o.corpo, "#cvx-rr-vars"); chk.checked = false; d.ev(chk, "change"); achar(o.corpo, "#cvx-rr-atalho").value = "oi2"; return o.acoes[1].fn({ erro() {} }); });
    await d.menus.at(-1).itens.find(x => x.rotulo === "Salvar como resposta rápida").fn();
    assert.equal(chamadas[1][1].p_resposta.corpo, "Olá, Mariana! Sou a Helena.");
  } finally { d.fim(); }
});

test("CB-039 (DOM) · sobrou uma foto de duas (a outra é HEIC): o modal de foto única, não «Enviar 1 fotos»", async () => {
  await comComposer({}, async ({ comp }, d) => {
    const modais = [];
    d.aoModal(o => { modais.push(o.titulo); return false; });
    const fotos = [new File([new Uint8Array(2000)], "a.jpg", { type: "image/jpeg" }), new File([new Uint8Array(2000)], "b.heic", { type: "image/heic" })];
    const input = achar(comp.el, "input[type=file]");
    Object.defineProperty(input, "files", { value: fotos, configurable: true });
    d.ev(input, "change");
    await esperar(40);
    assert.equal(modais.length, 1);
    assert.match(modais[0], /^Enviar arquivo para /);
    assert.ok(!modais.some(t => /1 fotos/.test(t)));
  });
});

test("CB-109 (DOM) · documento sem extensão: o ícone diz TXT, não um pedaço do nome ou do tipo", async () => {
  await comComposer({}, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return false; });
    await comp.anexar(new File([new Uint8Array(20)], "laudo", { type: "text/plain" }));
    assert.equal(achar(corpo, ".cv-doc-ic").textContent, "TXT");
  });
});

test("CB-081/CB-112 (DOM) · modelos: nenhum disponível ainda tem um no Tab; o parâmetro mostra o trecho do texto", async () => {
  const pendentes = [{ id: "t1", canal_id: "k1", nome: "a", status: "PENDING", categoria: "UTILITY", corpo: "Oi {{1}}", num_parametros: 1 },
    { id: "t2", canal_id: "k1", nome: "b", status: "PENDING", categoria: "UTILITY", corpo: "Tchau {{1}}", num_parametros: 1 }];
  await comComposer({ base: { templates: pendentes } }, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return null; });
    await comp.abrirModelos();
    const ops = corpo.querySelectorAll(".cv-modelo");
    assert.ok(ops.every(b => b.getAttribute("aria-disabled") === "true"));
    assert.equal(ops.filter(b => b.getAttribute("tabindex") === "0").length, 1);
    ops[0].focus();
    d.ev(achar(corpo, ".cv-modelos"), "keydown", { key: "ArrowDown" });
    assert.equal(d.doc.activeElement, ops[1], "as setas andam pelos indisponíveis");
    assert.equal(ops[1].getAttribute("aria-checked"), "false", "indisponível não é escolhido");
  });
  const prontos = [{ id: "t3", canal_id: "k1", nome: "c", status: "APPROVED", categoria: "UTILITY", corpo: "Olá {{1}}, sua consulta é amanhã.", num_parametros: 1 }];
  await comComposer({ base: { templates: prontos } }, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return null; });
    await comp.abrirModelos();
    achar(corpo, ".cv-modelo").click();
    const ajuda = achar(corpo, ".cvx-par-trecho");
    assert.match(ajuda.textContent, /Olá \{\{1\}\}, sua consulta/);
    assert.match(achar(corpo, "#cvx-par-1").getAttribute("aria-describedby"), new RegExp(ajuda.id));
  });
});

test("CB-132 (DOM) · abrir os modelos relê a base velha (modelo recém-aprovado aparece); base nova não", async () => {
  const pedidos = [];
  await comComposer({ base: { templates: [] }, acoes: { baseFresca: ms => { pedidos.push(ms); return null; } } }, async ({ comp, A }, d) => {
    let corpo = null;
    A.acoes.baseFresca = ms => { pedidos.push(ms); return Promise.resolve().then(() => { A.base.templates = [{ id: "n", canal_id: "k1", nome: "novo", status: "APPROVED", categoria: "UTILITY", corpo: "Oi", num_parametros: 0 }]; }); };
    d.aoModal(o => { corpo = o.corpo; return null; });
    await comp.abrirModelos();
    assert.deepEqual(pedidos, [60000]);
    assert.equal(corpo.querySelectorAll(".cv-modelo").length, 1, "o modelo que chegou na releitura aparece");
  });
});

test("CB-084/CB-119 (DOM) · emoji: setas andam na grade (um só ponto de Tab) e no Mac a dica é Ctrl + ⌘ + Espaço", async () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { platform: "MacIntel", userAgent: "Mac" }, configurable: true });
  try {
    await comComposer({}, async ({ comp }, d) => {
      let pop = null;
      d.ui.flutuante = (anc, el) => { pop = el; return { fechar() {} }; };
      const bt = achar(comp.el, ".cvx-emoji-bt");
      assert.match(bt.title, /⌘/);
      bt.click();
      const grade = achar(pop, ".cvx-emojis");
      const bts = grade.querySelectorAll(".cvx-emoji");
      assert.equal(bts.filter(b => b.getAttribute("tabindex") === "0").length, 1);
      bts[0].focus();
      d.ev(grade, "keydown", { key: "ArrowRight" });
      assert.equal(d.doc.activeElement, bts[1]);
      d.ev(grade, "keydown", { key: "End" });
      assert.equal(d.doc.activeElement, bts.at(-1));
      assert.match(pop.textContent, /Ctrl \+ ⌘ \+ Espaço/);
    });
  } finally { if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator; }
});

/* ---------------------------------------------------------------- (b) chat */
test("CB-022 (DOM) · «Na fila · nova tentativa às…»: o mesmo nó muda o texto (não é recriado a cada reprogramação)", async () => {
  const d = comDom();
  try {
    const local = { id: "L1", local: true, ref: "L1", conversa_id: 9, direcao: "out", tipo: "texto", corpo: "oi", status: "pendente", filaEstado: "fila", erro: "O servidor está ocupado: tentando de novo.", filaProxima: Date.now() + 20000, criado_em: agoraIso(0) };
    const { chat, A } = await montarChat(d, { msgs: [local] });
    const antes = achar(chat.el, ".cv-fila");
    const t1 = antes.textContent;
    A.msgs = [{ ...local, filaProxima: Date.now() + 3600000 }];
    chat.renderMensagens({ rolar: "manter" });
    const depois = achar(chat.el, ".cv-fila");
    assert.equal(depois, antes, "o mesmo nó role=status");
    assert.notEqual(depois.textContent, t1, "o texto acompanhou a nova hora");
  } finally { d.fim(); }
});

test("CB-031 (DOM) · visualizador desiste depois de ~20 tentativas e mostra «Tentar de novo»", async () => {
  const d = comDom();
  const st = globalThis.setTimeout;
  let tentativas = 0;
  try {
    const foto = { id: 1, conversa_id: 9, direcao: "in", tipo: "imagem", corpo: "", status: "recebida", midia: { path: "c1/in/a.jpg" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat, A } = await montarChat(d, { msgs: [foto] });
    const bt = achar(chat.el, ".cv-img-bt");
    A.acoes.urlMidia = () => null; A.acoes.estadoMidia = () => "buscando";
    globalThis.setTimeout = (f, ms, ...r) => { if (ms === 350) { tentativas++; return st(f, 0, ...r); } return st(f, ms, ...r); };
    bt.click();
    for (let k = 0; k < 100 && tentativas < 20; k++) await esperar(5);
    await esperar(30);
    assert.equal(tentativas, 20, "no máximo 20 tentativas");
    const dlg = achar(d.doc.body, "dialog.cv-lb");
    assert.equal(achar(dlg, ".cv-lb-falha").hidden, false);
    A.acoes.urlMidia = p => `https://cdn.test/${p}`; A.acoes.estadoMidia = () => "ok";
    achar(dlg, ".cv-lb-tentar").click();
    assert.equal(achar(dlg, ".cv-lb-falha").hidden, true);
    assert.equal(achar(dlg, "img").getAttribute("src"), "https://cdn.test/c1/in/a.jpg");
  } finally { globalThis.setTimeout = st; d.fim(); }
});

test("CB-034 (DOM) · «Baixar» busca o arquivo e baixa (link temporário com download); sem fetch, sem pop-up silencioso", async () => {
  const d = comDom();
  const f0 = globalThis.fetch, u0 = URL.createObjectURL, r0 = URL.revokeObjectURL, o0 = globalThis.open;
  const objs = [], cliques = [], abertos = [];
  try {
    const pdf = { id: 5, conversa_id: 9, direcao: "in", tipo: "documento", corpo: "", status: "recebida", midia: { path: "c1/in/orc.pdf", nome: "orc.pdf", mime: "application/pdf" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat } = await montarChat(d, { msgs: [pdf] });
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["x"]) });
    URL.createObjectURL = b => { objs.push(b); return "blob:baixar"; };
    URL.revokeObjectURL = () => {};
    const bodyAppend = d.doc.body.appendChild.bind(d.doc.body);
    d.doc.body.appendChild = n => { if (n.localName === "a") n.addEventListener("click", () => cliques.push([n.getAttribute("href"), n.getAttribute("download")])); return bodyAppend(n); };
    achar(chat.el, ".cv-doc-baixar").click();
    await esperar(10);
    assert.equal(objs.length, 1);
    assert.deepEqual(cliques, [["blob:baixar", "orc.pdf"]]);
    // plano 1000b (revisão): o fetch que falha não abre mais a aba por window.open depois do await (o bloqueador engolia) —
    // o aviso traz o link; o teste do fim do arquivo confere o toast
    globalThis.fetch = async () => { throw new Error("cors"); };
    globalThis.open = (u, alvo) => abertos.push([u, alvo]);
    achar(chat.el, ".cv-doc-baixar").click();
    await esperar(10);
    assert.deepEqual(abertos, []);
  } finally { globalThis.fetch = f0; URL.createObjectURL = u0; URL.revokeObjectURL = r0; globalThis.open = o0; d.fim(); }
});

test("CB-075 (DOM) · ver sem o objeto do canal: o cabeçalho busca o nome na base (não diz «número removido»)", async () => {
  const d = comDom();
  try {
    const { chat, A } = await montarChat(d, { conv: { canal: null } });
    A.base.canais = [{ id: "k1", nome: "Recepção", provedor: "meta" }];
    chat.renderCabecalho();
    const cab = achar(chat.el, ".cvc-quem");
    assert.match(cab.title, /via Recepção/);
    assert.doesNotMatch(cab.title, /número removido/);
  } finally { d.fim(); }
});

test("CB-078 (DOM) · foto gravada como falha: «Anexe o arquivo de novo» com botão que abre o clipe", async () => {
  const d = comDom();
  try {
    const falha = { id: 3, conversa_id: 9, direcao: "out", tipo: "imagem", corpo: "", status: "falhou", erro: "mídia recusada", midia: { path: "c1/out/a.jpg" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const abertos = [];
    const { chat, A } = await montarChat(d, { msgs: [falha] });
    A.composer.escolherArquivo = () => abertos.push(1);
    chat.renderMensagens({ rolar: "manter" });
    const b = achar(chat.el, ".cv-anexar-de-novo");
    assert.match(b.closest(".cv-falha").textContent, /Anexe o arquivo de novo/);
    b.click();
    assert.equal(abertos.length, 1);
  } finally { d.fim(); }
});

test("CB-088 (DOM) · folha «Mais ações»: o grupo é nomeado pelo h3 (aria-labelledby), sem aria-label repetido", async () => {
  const d = comDom({ grosso: true });
  const mm = globalThis.matchMedia;
  try {
    globalThis.matchMedia = q => ({ matches: /coarse|max-width: 760px|hover: none/.test(q), addEventListener() {}, removeEventListener() {} });
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5)] });
    achar(chat.el, ".cvc-mais").click();
    const folha = achar(d.doc.body, "dialog.cv-folha");
    const grupos = folha.querySelectorAll("section.cv-folha-grupo");
    assert.ok(grupos.length > 0);
    for (const g of grupos) {
      assert.equal(g.getAttribute("aria-label"), null);
      const id = g.getAttribute("aria-labelledby");
      assert.ok(id && achar(g, `h3#${id}`));
    }
  } finally { globalThis.matchMedia = mm; d.fim(); }
});

test("CB-091 (DOM) · conversa fora do alcance: frase específica e «Voltar à lista» (não o cartão de erro genérico)", async () => {
  const d = comDom();
  try {
    const voltas = [];
    const { chat } = await montarChat(d, { acoes: { voltar: () => voltas.push(1) } });
    chat.mostrarErro({ codigo: "conversa_nao_encontrada" }, () => {});
    assert.match(chat.el.textContent, /não está mais com você/);
    assert.equal(chat.el.querySelector(".erro"), null);
    achar(chat.el, ".cvc-fora-voltar").click();
    assert.equal(voltas.length, 1);
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (b) lista */
test("CB-008 (DOM) · mensagem encontrada que a IA enviou começa com «IA: », não «Você: »", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d);
    t.A.busca = "preço";
    t.A.buscaMsgs = { q: "preço", itens: [{ mensagem_id: 1, conversa_id: 9, contato_nome: "Ana", direcao: "out", origem: "ia", tipo: "texto", trecho: "o preço é 100", criado_em: agoraIso(5) },
      { mensagem_id: 2, conversa_id: 9, contato_nome: "Ana", direcao: "out", tipo: "texto", trecho: "o preço sobe", criado_em: agoraIso(6) }], carregando: false };
    t.lista.render();
    const trechos = t.lista.el.querySelectorAll(".cvl-msg-trecho").map(x => x.textContent);
    assert.ok(trechos.length >= 2, "as mensagens encontradas aparecem");
    assert.match(trechos[0], /^IA: /);
    assert.match(trechos[1], /^Equipe: /);
  } finally { d.fim(); }
});

test("CB-015 (DOM) · sem contagens lidas (ou com a lista em erro) o subtítulo não diz «Tudo respondido»", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { contagens: {} });
    assert.doesNotMatch(t.lista.el.textContent, /Tudo respondido/);
    t.A.erroLista = new Error("rede"); t.A.itens = [conv(1)]; t.lista.render();
    assert.doesNotMatch(t.lista.el.textContent, /Tudo respondido/);
    assert.match(t.lista.el.textContent, /Sem atualizar/);
    t.A.erroLista = null; t.A.contagens = { aguardando: 0, nao_lidas: 0 }; t.lista.render();
    assert.match(t.lista.el.textContent, /Tudo respondido/);
  } finally { d.fim(); }
});

test("CB-066/CB-069 (DOM) · dica do «Selecionar várias» completa; busca com até 100 caracteres (e cortada ao aplicar)", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d);
    assert.match(achar(t.lista.el, ".cvl-sel-bt").title, /transferir, etiquetar/);
    const busca = achar(t.lista.el, 'input[aria-label="Buscar conversas"]');
    assert.equal(busca.getAttribute("maxlength"), "100");
    busca.value = "a".repeat(500);
    d.ev(busca, "keydown", { key: "Enter" });
    const pedido = t.chamadas.filter(c => c[0] === "mudarLista").at(-1);
    assert.ok(pedido && pedido[1].busca.length <= 100);
  } finally { d.fim(); }
});

test("CB-126 (DOM) · tirar um filtro deixa o foco na área de filtros (não no body)", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { base: { etiquetas: [{ id: "e1", nome: "VIP" }, { id: "e2", nome: "Retorno" }] } });
    t.A.filtro = { etiquetas: ["e1", "e2"] };
    t.A.acoes.mudarLista = o => { t.chamadas.push(["mudarLista", o]); if (o.filtro) t.A.filtro = o.filtro; t.lista.render(); };
    t.lista.render();
    const chips = t.lista.el.querySelectorAll(".cvl-filtro-chip");
    assert.equal(chips.length, 2);
    chips[0].click();
    await esperar(5);
    const ativo = d.doc.activeElement;
    assert.ok(ativo && ativo.classList.contains("cvl-filtro-chip") && ativo.isConnected, "o foco foi para o chip que ficou");
    t.lista.el.querySelector(".cvl-filtro-chip").click();
    await esperar(5);
    assert.ok(d.doc.activeElement.classList.contains("cvl-filtro"), "sem chips, o botão Filtros");
  } finally { d.fim(); }
});

test("CB-072 (DOM) · a lista solta o IntersectionObserver ao desmontar", async () => {
  const d = comDom();
  const IO = globalThis.IntersectionObserver;
  const desligados = [];
  globalThis.IntersectionObserver = class { constructor() {} observe() {} disconnect() { desligados.push(1); } };
  try {
    const t = await montarLista(d);
    assert.equal(typeof t.lista.desmontar, "function");
    t.lista.desmontar();
    assert.equal(desligados.length, 1);
  } finally { if (IO) globalThis.IntersectionObserver = IO; else delete globalThis.IntersectionObserver; d.fim(); }
});

/* ---------------------------------------------------------------- (b) lateral */
test("CB-023/CB-228 (DOM) · Desfazer a etapa volta o seletor focado para a etapa anterior", async () => {
  const d = comDom();
  try {
    const funis = [{ id: "f1", estagios: [{ id: "s1", nome: "Nova", tipo: "aberto", ordem: 1 }, { id: "s3", nome: "Orçamento", tipo: "aberto", ordem: 2 }] }];
    const api = { rpcC: async nome => (nome === "nx_crm_base" ? { campos: [], funis } : {}), fn: async () => ({}) };
    const t = await montarLateral(d, { api, ver: { negocios: [{ id: 1, titulo: "Aparelho", funil_id: "f1", estagio_id: "s1", estagio_nome: "Nova", estagio_tipo: "aberto", status: "aberto" }] } });
    await esperar(10);
    const sel = achar(t.alvo, ".cvt-etapa-sel");
    sel.focus();
    sel.value = "s3"; d.ev(sel, "change");
    await esperar(5);
    d.desfazeres.at(-1).reverter();
    assert.equal(sel.value, "s1", "o select (que não é redesenhado com o foco) mostra a etapa anterior");
    assert.ok(d.anuncios.some(a => /Etapa voltou para «Nova»/.test(a)));
  } finally { d.fim(); }
});

test("CB-057 (DOM) · «Veio do anúncio» de lead do Google diz Google Ads (e sem plataforma, só «Anúncio»)", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana", telefone: "5512999990000", origem: "anuncio", plataforma: "google" } } });
    const an = achar(t.alvo, ".cvt-anuncio");
    assert.match(an.textContent, /Google Ads/);
    assert.doesNotMatch(an.textContent, /Meta/);
  } finally { d.fim(); }
  const d2 = comDom();
  try {
    const t = await montarLateral(d2, { ver: { contato: { id: 5, nome: "Mariana", telefone: "5512999990000", origem: "anuncio" } } });
    assert.doesNotMatch(achar(t.alvo, ".cvt-anuncio").textContent, /Meta/);
  } finally { d2.fim(); }
});

test("CB-060 (DOM) · «Adiar → Escolher…» começa no prazo atual da tarefa (horário de São Paulo)", async () => {
  const d = comDom();
  try {
    const campos = [];
    const campo0 = d.ui.campo;
    d.ui.campo = o => { campos.push(o); return campo0(o); };
    const t = await montarLateral(d);
    d.aoModal(() => null);
    achar(t.alvo, ".cvt-tar-adiar").click();
    await d.menus.at(-1).itens.find(x => x.rotulo === "Escolher…").fn();
    const c = campos.find(x => x.nome === "vence_em");
    assert.equal(c.valor, L.datahoraSP(t.A.ver.tarefas[0].vence_em));
    assert.match(c.valor, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  } finally { d.fim(); }
});

test("CB-063 (DOM) · a seção de tarefas não é refeita só porque o minuto virou", async () => {
  const d = comDom();
  const agora0 = Date.now;
  try {
    const t = await montarLateral(d);
    const antes = achar(t.alvo, ".cvt-tar").closest("details, section") || achar(t.alvo, ".cvt-tar").parentNode;
    const base = agora0();
    Date.now = () => base + 61000;
    t.lat.render();
    const depois = achar(t.alvo, ".cvt-tar").closest("details, section") || achar(t.alvo, ".cvt-tar").parentNode;
    assert.equal(depois, antes);
  } finally { Date.now = agora0; d.fim(); }
});

test("CB-135 (DOM) · nova tarefa leva o único negócio aberto do contato (sem negócio ligado à conversa)", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d, { ver: { conversa: { id: 9, protocolo: "ORB-9", etiquetas: [] } } });
    d.ui.lerForm = () => ({ titulo: "Ligar", tipo: "tarefa" });
    d.aoModal(o => o.acoes[1].fn());
    botaoTexto(t.alvo, /^Tarefa$/).click();
    await esperar(10);
    const r = t.chamadas.find(c => c[0] === "nx_tarefa_salvar");
    assert.ok(r, "salvou a tarefa");
    assert.equal(r[1].p_tarefa.negocio_id, 1);
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (c) central */
test("CB-047 (central) · transferir para a mesma pessoa com recado grava o recado como nota (não «Nada mudou»)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.aoModal(async o => { if (!/Transferir/.test(o.titulo)) return true; achar(o.corpo, "#cv-tr-recado").value = "liga depois das 18h"; return o.acoes[1].fn(); });
    achar(c.alvo, ".cvc-transferir").click();
    await esperar(20);
    assert.equal(srv.chamadas.find(x => x[0] === "nx_cv_nota")[1].p_texto, "Recado: liga depois das 18h");
    assert.equal(srv.conta("nx_cv_atribuir"), 0);
    assert.ok(!d.toasts.some(t => /Nada mudou/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("CB-094 (central) · etiquetar em lote conta as que já tinham as etiquetas à parte", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.convs[0].etiquetas = ["e1"]; srv.convs[1].etiquetas = ["e1"];
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    d.aoModal(async o => { achar(o.corpo, "#cv-etl-e1").checked = true; return o.acoes[1].fn({ erro() {} }); });
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(30);
    assert.equal(srv.conta("nx_cv_etiquetas"), 1);
    assert.equal(d.toasts.at(-1), "1 conversa etiquetada · 2 já tinham as etiquetas.");
  } finally { c.fim(); d.fim(); }
});

test("CB-051 (central) · falha nas mensagens anteriores: sem toast a cada rolagem; 10 s de espera e «Tentar de novo» no topo", async () => {
  const d = comDom();
  const srv = criarServidor();
  const mens = srv.handlers.nx_cv_mensagens;
  srv.handlers.nx_cv_mensagens = p => { const r = mens(p); if (p.p_antes_id != null) throw Object.assign(new Error("tempo_rede"), { codigo: "tempo_rede" }); return { ...r, tem_mais: true }; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const topo = () => c.alvo.querySelector(".cvc-antes-falhou") || null;
    botaoTexto(c.alvo, /Ver mensagens anteriores/).click();
    await esperar(10);
    const pedidos = () => srv.chamadas.filter(x => x[0] === "nx_cv_mensagens" && x[1].p_antes_id != null).length;
    assert.equal(pedidos(), 1);
    assert.ok(topo(), "o topo diz que não carregou");
    const toastsAntes = d.toasts.length;
    // a rolagem para cima pede de novo dentro dos 10 s: nada vai ao servidor
    const msgsEl = achar(c.alvo, ".cvc-msgs");
    msgsEl.scrollTop = 500; d.ev(msgsEl, "scroll"); msgsEl.scrollTop = 10; d.ev(msgsEl, "scroll");
    await esperar(10);
    assert.equal(pedidos(), 1);
    assert.equal(d.toasts.length, toastsAntes, "sem toast repetido");
    botaoTexto(topo(), /Tentar de novo/).click();
    await esperar(10);
    assert.equal(pedidos(), 2, "«Tentar de novo» força");
  } finally { c.fim(); d.fim(); }
});

test("CB-054 (central) · exportar busca as páginas sem redesenhar o chat a cada uma", async () => {
  const d = comDom();
  const srv = criarServidor();
  let paginas = 0;
  const mens = srv.handlers.nx_cv_mensagens;
  srv.handlers.nx_cv_mensagens = p => {
    if (p.p_antes_id == null) return { ...mens(p), tem_mais: true };
    paginas++;
    const id = Number(p.p_antes_id) - 1;
    return { itens: [{ id, conversa_id: 901, direcao: "in", tipo: "texto", corpo: `antiga ${id}`, status: "recebida", criado_em: agoraIso(100 + paginas), atualizado_em: agoraIso(100 + paginas) }], tem_mais: paginas < 5, conversas: [] };
  };
  const u0 = URL.createObjectURL, r0 = URL.revokeObjectURL;
  const blobs = [];
  URL.createObjectURL = b => { blobs.push(b); return "blob:exp"; }; URL.revokeObjectURL = () => {};
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const trilho = achar(c.alvo, ".cvc-trilho");
    const n0 = trilho.querySelectorAll(".cv-msg").length;
    achar(c.alvo, ".cvc-mais").click();
    const item = d.menus.at(-1).itens.find(x => x && /Exportar/.test(x.rotulo || ""));
    assert.ok(item, "⋮ tem Exportar");
    await item.fn();
    await esperar(20);
    assert.equal(paginas, 5);
    assert.equal(trilho.querySelectorAll(".cv-msg").length, n0, "o chat não ganhou as páginas antigas");
    assert.match(await blobs.at(-1).text(), /antiga/);
  } finally { URL.createObjectURL = u0; URL.revokeObjectURL = r0; c.fim(); d.fim(); }
});

test("CB-129 (central) · sem IndexedDB, a 1ª mensagem que volta para a fila avisa (uma vez)", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.fns["nx-enviar"] = c => { if (c.acao === "lido") return { ok: true }; throw Object.assign(new Error("servidor"), { status: 503 }); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "oi"; d.ev(ta, "input"); d.ev(ta, "keydown", { key: "Enter" });
    await esperar(40);
    ta.value = "de novo"; d.ev(ta, "input"); d.ev(ta, "keydown", { key: "Enter" });
    await esperar(40);
    assert.equal(d.toasts.filter(t => /não ficam guardadas/.test(t)).length, 1);
  } finally { c.fim(); d.fim(); }
});

test("CB-049 (central) · mensagem nova com a janela visível mas sem foco também toca o som", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  const sons = [];
  const AC0 = globalThis.AudioContext;
  globalThis.AudioContext = class { constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; sons.push(1); }
    createOscillator() { return { type: "", frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } resume() { return Promise.resolve(); } };
  d.janela.AudioContext = globalThis.AudioContext;
  try {
    d.doc.hidden = false;
    d.doc.hasFocus = () => false;
    srv.chegar(902, "olá");
    await c.pulso();
    assert.ok(sons.length >= 1, "tocou com a janela sem foco");
  } finally { if (AC0) globalThis.AudioContext = AC0; else delete globalThis.AudioContext; c.fim(); d.fim(); }
});

test("CB-115 (central) · «Nova conversa»: ↓ na busca leva ao 1º contato e as setas andam entre eles", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.handlers.nx_contatos_listar = () => ({ itens: [{ id: 1, nome: "Ana", telefone: "5512999990001" }, { id: 2, nome: "Bia", telefone: "5512999990002" }], total: 2 });
  const c = await montarCentral(d, srv);
  try {
    let visto = null;
    d.aoModal(async o => {
      if (o.titulo !== "Nova conversa") return null;
      const busca = achar(o.corpo, "#cv-nv-busca");
      busca.value = "an"; d.ev(busca, "input");
      await esperar(20);
      d.ev(busca, "keydown", { key: "ArrowDown" });
      const ops = o.corpo.querySelectorAll(".cv-contato-op");
      visto = { primeiro: d.doc.activeElement === ops[0] };
      d.ev(ops[0], "keydown", { key: "ArrowDown" });
      visto.segundo = d.doc.activeElement === ops[1];
      d.ev(ops[1], "keydown", { key: "ArrowUp" }); d.ev(ops[0], "keydown", { key: "ArrowUp" });
      visto.volta = d.doc.activeElement === busca;
      return null;
    });
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(60);
    assert.deepEqual(visto, { primeiro: true, segundo: true, volta: true });
  } finally { c.fim(); d.fim(); }
});

test("CB-123 (central) · marcar pela lateral: «Avisar paciente» põe a confirmação no campo da conversa (sem enviar)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv, { extraCtx: { temModulo: m => m === "agenda" } });
  try {
    await c.abrir(901);
    // a agenda real é grande: o teste confere o contrato — marcarConsulta recebe `avisar` e ele escreve no composer
    const agenda = await import("../web/app/agenda.js?v=teste");
    const inicio = new Date(Date.now() + 2 * 86400000).toISOString();
    assert.match(agenda.textoConfirmacao({ nome: "Cliente 1", inicio }, "2000-01-01"), /Sua consulta/);
    const src = ler("conversas.js");
    assert.match(src, /m\.marcarConsulta\(E\.ctx, \{ negocio: negocio \|\| null, avisar,/);
    assert.match(src, /E\.composer\.devolverTexto\(texto\)/);
  } finally { c.fim(); d.fim(); }
});

/* ---------------------------------------------------------------- (d) cv-config */
test("CB-103 (Números) · cartão do CodeWords diz «Configurado» e guarda o id do fluxo no title", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const canais = [{ id: "cw1", nome: "Recepção", provedor: "codewords", status: "ativo", estado: "conectado", numero_exibicao: "+55 12 99999-0000",
      codewords: { tem_api_key: true, conectado: true, rota: "fluxo", service_id: "svc_abc123", ia_ligada: true } }];
    const t = ctxNum(ui, { rpc: async n => (n === "nx_canais_listar" ? canais : n === "nx_cv_base" ? { departamentos: [] } : []) });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    const kv = achar(t.alvo, ".cfg-canal-kv");
    assert.match(kv.textContent, /Fluxo de IA Configurado/);
    assert.doesNotMatch(kv.textContent, /svc_abc123/);
    assert.ok(kv.querySelectorAll("b").some(b => /svc_abc123/.test(b.getAttribute("title") || "")));
  } finally { if (sair) sair(); d.fim(); }
});

test("CB-138 (Departamentos) · aplicar um horário pronto tem Desfazer que devolve a grade anterior", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "departamentos").montar;
    const dep = { id: "d1", nome: "Recepção", cor: "#6FA3CF", padrao: true, ativo: true, distribuicao: "rodizio", pessoas: 0,
      horario: { 0: [], 1: [["07:00", "11:00"]], 2: [], 3: [], 4: [], 5: [], 6: [] } };
    let modal = null;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { config: { departamentos: [dep] }, usuarios: [] } : {}), modal: o => { modal = o; return null; } });
    const avisos = [];
    t.ctx.ui.toast = (txt, o) => avisos.push({ txt, o: o || {} });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    t.alvo.querySelectorAll("button").find(b => /Editar/.test(b.textContent)).dispatchEvent(new d.Evento("click")); await tique(4);
    const f = modal.corpo;
    f.querySelector("[data-predef=comercial]").dispatchEvent(new d.Evento("click")); await tique(2);
    assert.ok(f.querySelectorAll('[data-dia="3"] .cfg-faixa').length > 0, "o pronto mudou a grade");
    const av = avisos.find(a => /aplicado/.test(a.txt));
    assert.ok(av && typeof av.o.desfazer === "function", "o aviso tem Desfazer");
    av.o.desfazer(); await tique(2);
    assert.equal(f.querySelectorAll('[data-dia="3"] .cfg-faixa').length, 0, "quarta volta a fechada");
    const [ini, fim] = f.querySelectorAll('[data-dia="1"] input[type=time]');
    assert.deepEqual([ini.value, fim.value], ["07:00", "11:00"]);
  } finally { if (sair) sair(); d.fim(); }
});

/* ============================================================ lote conv-2 (plano 1000b) */
/* ---------------------------------------------------------------- (a) lógica pura */
test("CB-024/CB-229 · limite de envios (429 limite_taxa, muitos_pedidos, aguarde) volta para a fila com backoff", () => {
  for (const e of [{ codigo: "limite_taxa", status: 429 }, { codigo: "muitos_pedidos" }, { codigo: "aguarde" }, { status: 429 }]) {
    const c = L.classificarFalhaEnvio(e);
    assert.equal(c.tipo, "rede", JSON.stringify(e));
    assert.equal(c.subtipo, "servidor");
    assert.match(c.motivo, /Muitos envios em pouco tempo/);
    const r = L.aposFalhaFila({ tentativas: 0 }, c, { agora: 1000 });
    assert.equal(r.fim, false, "sai sozinha depois do backoff");
    assert.equal(r.campos.estado, "fila");
    assert.ok(r.campos.proxima_em > 1000);
  }
  assert.equal(L.classificarFalhaEnvio({ codigo: "fora_da_janela", status: 400 }).tipo, "definitiva", "o resto continua definitivo");
});

test("CB-025/CB-230 · link com «)» final balanceado; o parêntese de fora fica fora; marcador sem fecho válido não formata", () => {
  const seg = L.formatarWhats("veja https://pt.wikipedia.org/wiki/Taubaté_(SP) agora");
  assert.equal(seg.find(x => x.tipo === "link").v, "https://pt.wikipedia.org/wiki/Taubaté_(SP)");
  assert.equal(seg.at(-1).v, " agora");
  const fora = L.formatarWhats("(veja https://x.org/a)");
  assert.equal(fora.find(x => x.tipo === "link").v, "https://x.org/a");
  assert.equal(fora.at(-1).v, ")");
  assert.ok(!L.formatarWhats("*promo*valida").some(x => x.tipo === "negrito"), "CB-027: fecho colado em letra não é negrito");
  // (o caso «www.» sem http é o CB-026, do lote conv-3)
});

test("CB-028 · J e K com Caps Lock andam na lista; Shift+J continua sem atalho", () => {
  assert.equal(L.acordeDoEvento({ key: "J", shiftKey: false }), "mover_baixo");
  assert.equal(L.acordeDoEvento({ key: "K", shiftKey: false }), "mover_cima");
  assert.equal(L.acordeDoEvento({ key: "J", shiftKey: true }), null);
  assert.equal(L.acordeDoEvento({ key: "j" }), "mover_baixo");
});

test("CB-085/CB-242 · exportar: foto e documento com legenda não perdem o tipo", () => {
  const t = L.textoExportacao([
    { id: 1, tipo: "imagem", direcao: "in", corpo: "raio-x", criado_em: agoraIso(5), midia: { path: "p" } },
    { id: 2, tipo: "documento", direcao: "out", corpo: "segue", criado_em: agoraIso(4), midia: { nome: "exame.pdf" }, enviado_por: { nome: "Helena" } },
    { id: 3, tipo: "texto", direcao: "in", corpo: "obrigada", criado_em: agoraIso(3) }], { contato: "Maria" });
  assert.match(t, /Maria: Foto: raio-x/);
  assert.match(t, /Helena: Documento: exame\.pdf · segue/);
  assert.match(t, /Maria: obrigada/);
});

test("CB-036/CB-235 · microfone: cada erro com o seu texto (em uso, sem microfone, permissão, sem suporte)", () => {
  assert.match(L.textoErroMicrofone({ name: "NotReadableError" }), /em uso por outro programa/);
  assert.match(L.textoErroMicrofone({ name: "NotFoundError" }), /Nenhum microfone encontrado/);
  assert.match(L.textoErroMicrofone({ name: "NotAllowedError" }), /Libere a permissão/);
  assert.match(L.textoErroMicrofone({ name: "NotSupportedError" }), /não é suportada/);
  assert.match(L.textoErroMicrofone(null), /Não foi possível acessar o microfone/);
  assert.match(ler("cv-composer.js"), /\} catch \(e\) \{\s+if \(fluxo\)[^]*?ui\.toast\(L\.textoErroMicrofone\(e\)/, "o catch da gravação usa o motivo");
});

test("CB-045 · estado do número para a «Nova conversa»: com erro, configurando, desconectado (ativo e conectado sem rótulo)", () => {
  assert.equal(L.rotuloEstadoCanal({ status: "erro" }), "com erro");
  assert.equal(L.rotuloEstadoCanal({ status: "pendente" }), "configurando");
  assert.equal(L.rotuloEstadoCanal({ status: "ativo", estado: "desconectado" }), "desconectado");
  assert.equal(L.rotuloEstadoCanal({ status: "ativo", estado: "conectado" }), "");
});

test("cv-config (como o UB-026) e CB-098 · celular de 11 dígitos não vira CPF; «1 modelo sincronizado»", () => {
  const a = CV.dadosPessoaisNoTexto("Ligue 12991234567 ou mande o CPF 123.456.789-09");
  assert.deepEqual(a.map(x => x.tipo).sort(), ["CPF", "telefone"]);
  assert.equal(a.find(x => x.tipo === "telefone").trecho, "12991234567");
  assert.equal(a.find(x => x.tipo === "CPF").trecho, "123.456.789-09");
  assert.equal(CV.dadosPessoaisNoTexto("CPF 12345678909")[0].tipo, "CPF", "CPF sem máscara que não parece celular continua CPF");
  assert.equal(CV.textoModelosSincronizados(1), "1 modelo sincronizado");
  assert.equal(CV.textoModelosSincronizados(5), "5 modelos sincronizados");
  assert.equal(CV.textoModelosSincronizados(undefined), "0 modelos sincronizados");
  assert.doesNotMatch(ler("cv-config.js"), /modelo\(s\)/);
});

test("CB-003 · a prévia da assinatura (Configurações) usa a mesma regra do teto e do «Sai como» (L.nomeAssinatura)", async () => {
  assert.match(ler("cv-config.js"), /function previaAssinatura\(\) \{[^]*?const nome = L\.nomeAssinatura\(/);
  assert.equal(L.tetoTexto({ assinatura: true, nome: "Dra. Helena" }), 4096 - `*${L.nomeAssinatura("Dra. Helena")}:*\n`.length);
  const d = comDomCfg();
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "atendimento").montar;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { cfg: { recibo_leitura: true, assinatura: true } } : {}) });
    t.ctx.sessao = { conta: { id: "c", nome: "  Helena   Souza " } };
    await montar(t.ctx, t.alvo); await tique(6);
    assert.equal(achar(t.alvo, ".cfg-previa-ass b").textContent, `${L.nomeAssinatura("Helena Souza")}:`);
  } finally { d.fim(); }
});

test("CB-101/CB-113/CB-124 · pareamento com prazo e espera de 90 s; apagar guardadas confirma antes; Agenda leva o nome do contato", () => {
  const cfg = ler("cv-config.js");
  assert.match(cfg, /O código vale por poucos minutos; se expirar, gere outro\./);
  assert.match(cfg, /esperarNovoCodigo\(90\);/);
  const cv = ler("conversas.js");
  const i = cv.indexOf("CB-113");
  assert.ok(i > 0);
  const trecho = cv.slice(i, i + 900);
  assert.match(trecho, /await E\.ui\.confirmar\(/);
  assert.match(trecho, /Quem escreveu perde o texto/);
  assert.ok(trecho.indexOf("confirmar(") < trecho.indexOf(".delete(it.id)"), "confirma ANTES de apagar");
  assert.match(cv, /const busca = !negocio \? \(E\.ver && E\.ver\.contato && E\.ver\.contato\.nome\) \|\| "" : "";/);
  assert.match(cv, /\.\.\.\(busca \? \{ busca \} : \{\}\)/);
});

/* ---------------------------------------------------------------- (b) chat */
test("CB-006/CB-215 (DOM) · soltar arquivo com anexo indisponível: preventDefault, faixa com o motivo e nada anexado", async () => {
  const d = comDom();
  try {
    const anexados = [];
    const { chat, A } = await montarChat(d, { conv: { status: "resolvida" } });
    A.composer.aceitaAnexo = () => false;
    A.composer.motivoSemAnexo = () => "Atendimento resolvido: reabra para anexar.";
    A.composer.anexar = f => anexados.push(f);
    const corpo = achar(chat.el, ".cvc-corpo");
    const dt = { types: ["Files"], files: [{ name: "exame.pdf" }], dropEffect: "" };
    const entra = new d.Evento("dragenter", { dataTransfer: dt }); corpo.dispatchEvent(entra);
    assert.equal(entra.defaultPrevented, true);
    const faixa = achar(chat.el, ".cvc-arrastar");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /^Não dá para anexar aqui: atendimento resolvido: reabra para anexar\.$/);
    const sobre = new d.Evento("dragover", { dataTransfer: dt }); corpo.dispatchEvent(sobre);
    assert.equal(sobre.defaultPrevented, true, "sem preventDefault o navegador abre o PDF na aba");
    assert.equal(dt.dropEffect, "none");
    const solta = new d.Evento("drop", { dataTransfer: dt }); corpo.dispatchEvent(solta);
    assert.equal(solta.defaultPrevented, true);
    assert.equal(anexados.length, 0);
    assert.ok(d.toasts.some(t => /reabra para anexar/.test(t)));
    A.composer.aceitaAnexo = () => true;
    corpo.dispatchEvent(new d.Evento("drop", { dataTransfer: dt }));
    assert.equal(anexados.length, 1, "aceitando, o soltar anexa");
  } finally { d.fim(); }
});

test("CB-009/CB-219 (DOM) · citação de resposta da IA, de colega e de mensagem não carregada não diz «Você»", async () => {
  const d = comDom();
  try {
    const ia = txt(50, "out", 30, { origem: "ia", enviado_por: null });
    const colega = txt(51, "out", 29, { enviado_por: { id: "u2", nome: "Ana Paula" } });
    const minha = txt(52, "out", 28);
    const cita = (id, rid) => txt(id, "in", 20 - (id - 60), { responde_a: { id: rid, direcao: "out", resumo: "x" } });
    const { chat } = await montarChat(d, { msgs: [ia, colega, minha, cita(60, 50), cita(61, 51), cita(62, 52), cita(63, 999)] });
    const quem = id => achar(chat.el, `.cv-msg[data-id="${id}"] .cv-cita b`).textContent;
    assert.equal(quem(60), "IA");
    assert.equal(quem(61), "Ana Paula");
    assert.equal(quem(62), "Você");
    assert.equal(quem(63), "Equipe", "não carregada: «Equipe»");
  } finally { d.fim(); }
});

test("CB-012 (DOM) · subtítulo do cabeçalho sem «·» sobrando (sem protocolo; sem telefone)", async () => {
  const d = comDom();
  try {
    const { chat, A } = await montarChat(d, { conv: { protocolo: null } });
    const sub = () => achar(chat.el, ".cvc-sub").textContent.trim();
    assert.doesNotMatch(sub(), /·$/);
    A.ver = { ...A.ver, contato: { ...A.ver.contato, telefone: null }, conversa: { ...A.ver.conversa, protocolo: "ORB-7" } };
    chat.renderCabecalho();
    assert.doesNotMatch(sub(), /^·/);
    assert.equal(sub(), "via Recepção·ORB-7");
  } finally { d.fim(); }
});

test("CB-014/CB-076 (DOM) · IA pausada sem hora diz «volta sozinha» (nunca «até em breve»); com hora, a de SP pelo L.horaMsg", async () => {
  const d = comDom();
  try {
    const ia = { disponivel: true, ia_ligada: true, pausada: true, pausada_ate: null, pausada_por_nome: "Helena" };
    const { chat, A } = await montarChat(d, { provedor: "codewords", ia });
    const pil = () => achar(chat.el, ".cv-pil-ia").textContent;
    assert.doesNotMatch(pil(), /em breve/);
    assert.match(pil(), /IA pausada \(volta sozinha\)/);
    const ate = new Date(Date.now() + 30 * 60000).toISOString();
    A.iaEstado = { ...ia, pausada_ate: ate };
    chat.renderCabecalho();
    assert.match(pil(), new RegExp(`IA pausada até ${L.ateTexto(ate)}`));   // plano 1000b: CB-013 — perto da meia-noite vira «amanhã HH:MM»
    assert.doesNotMatch(ler("cv-chat.js"), /new Intl\.DateTimeFormat\("pt-BR", \{ timeZone: "America\/Sao_Paulo", hour/, "sem formatador novo a cada desenho");
  } finally { d.fim(); }
});

test("CB-020 (DOM) · separador de dia tem aria-label com o rótulo (o texto do span não é lido no separator)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5), txt(2, "out", 4)] });
    const sep = achar(chat.el, ".cv-dia[role=separator]");
    assert.ok(sep.getAttribute("aria-label"));
    assert.equal(sep.getAttribute("aria-label"), sep.textContent);
  } finally { d.fim(); }
});

test("CB-032 (DOM) · visualizador com a foto em erro oferece «Tentar de novo», que esquece o erro guardado", async () => {
  const d = comDom();
  try {
    const foto = { id: 1, conversa_id: 9, direcao: "in", tipo: "imagem", corpo: "", status: "recebida", midia: { path: "c1/in/a.jpg" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat, A } = await montarChat(d, { msgs: [foto] });
    const bt = achar(chat.el, ".cv-img-bt");
    A.acoes.urlMidia = () => null; A.acoes.estadoMidia = () => "erro";
    A.midia.set("c1/in/a.jpg", { erro: true, em: Date.now() });
    bt.click();
    const dlg = achar(d.doc.body, "dialog.cv-lb");
    assert.equal(achar(dlg, ".cv-lb-falha").hidden, false, "o erro mostra a ação (antes só o alt)");
    A.acoes.urlMidia = p => `https://cdn.test/${p}`; A.acoes.estadoMidia = () => "ok";
    achar(dlg, ".cv-lb-tentar").click();
    assert.equal(A.midia.has("c1/in/a.jpg"), false);
    assert.equal(achar(dlg, "img").getAttribute("src"), "https://cdn.test/c1/in/a.jpg");
  } finally { d.fim(); }
});

test("CB-073 (DOM) · mídias carregando sem role=status em cada bolha; um aviso só quando são muitas", async () => {
  const d = comDom();
  try {
    const midias = [1, 2, 3, 4, 5].map(i => ({ id: i, conversa_id: 9, direcao: "in", tipo: i % 2 ? "imagem" : "documento", corpo: "", status: "recebida",
      midia: { path: `c1/in/${i}` }, criado_em: agoraIso(10 - i), atualizado_em: agoraIso(10 - i) }));
    const { chat } = await montarChat(d, { msgs: midias, acoes: { urlMidia: () => null, estadoMidia: () => "buscando" } });
    const sks = chat.el.querySelectorAll(".cv-midia-sk");
    assert.ok(sks.length >= 5);
    assert.equal(sks.filter(x => x.getAttribute("role") === "status").length, 0);
    assert.equal(achar(chat.el, ".cvc-aviso-midias").textContent, "Carregando 5 mídias…");
  } finally { d.fim(); }
});

test("CB-089 (DOM) · bolha de áudio tem «Baixar áudio» com nome de arquivo", async () => {
  const d = comDom();
  try {
    const au = { id: 3, conversa_id: 9, direcao: "in", tipo: "audio", corpo: "", status: "recebida", midia: { path: "c1/in/au", mime: "audio/ogg", duracao: 12 }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat } = await montarChat(d, { msgs: [au] });
    const b = achar(chat.el, ".cv-audio .cv-au-baixar");
    assert.equal(b.getAttribute("aria-label"), "Baixar áudio");
    assert.equal(b.getAttribute("download"), "audio-3.ogg");
    assert.equal(b.getAttribute("href"), "https://cdn.test/c1/in/au");
  } finally { d.fim(); }
});

test("CB-127 (DOM) · clicar na pílula «Novas mensagens» deixa o foco na região das mensagens", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5)] });
    const pil = achar(chat.el, ".cvc-novas");
    pil.hidden = false; pil.focus();
    pil.click();
    assert.equal(pil.hidden, true);
    assert.equal(d.doc.activeElement, achar(chat.el, ".cvc-msgs"));
  } finally { d.fim(); }
});

test("CB-136 (DOM) · painel vazio sem contagens lidas não diz «Tudo em dia»", async () => {
  const d = comDom();
  try {
    const { chat, A } = await montarChat(d);
    const h2 = () => achar(chat.el, ".cvc-vazio h2").textContent;
    A.contagens = {}; chat.mostrarVazio();
    assert.doesNotMatch(h2(), /em dia/);
    assert.equal(h2(), "Escolha uma conversa.");
    A.contagens = { aguardando: 0, sem_dono: 0, minhas: 0 }; chat.mostrarVazio();
    assert.equal(h2(), "Tudo em dia.");
    A.erroLista = new Error("rede"); chat.mostrarVazio();
    assert.doesNotMatch(h2(), /em dia/, "com a lista em erro também não");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (c) composer */
test("CB-040 (DOM) · anexar numa nota interna ou numa conversa resolvida diz o motivo (não só «agora não»)", async () => {
  await comComposer({}, async ({ comp }, d) => {
    achar(comp.el, 'button[aria-label="Nota interna"]').click();
    await comp.anexar({ name: "a.pdf", type: "application/pdf", size: 10 });
    assert.match(d.toasts.at(-1), /Nota interna não leva anexo/);
  });
  await comComposer({ conv: { status: "resolvida" } }, async ({ comp }, d) => {
    await comp.anexar({ name: "a.pdf", type: "application/pdf", size: 10 });
    assert.match(d.toasts.at(-1), /Atendimento resolvido: reabra para anexar/);
    assert.equal(comp.motivoSemAnexo(), "Atendimento resolvido: reabra para anexar.");
  });
});

test("CB-043/CB-238 (DOM) · número da conversa desconectado: aviso acima do campo (o envio continua)", async () => {
  await comComposer({ acoes: { canalCaido: id => (id === "k1" ? { id: "k1", nome: "Recepção" } : null) } }, async ({ comp, ta }) => {
    const av = achar(comp.el, ".cvx-caido-aviso");
    assert.equal(av.hidden, false);
    assert.equal(av.textContent, "O número Recepção está desconectado: a mensagem espera até reconectar.");
    assert.equal(ta.disabled, false, "a pessoa ainda escreve (vai para a fila)");
  });
  await comComposer({}, async ({ comp }) => { assert.equal(achar(comp.el, ".cvx-caido-aviso").hidden, true); });
});

test("CB-079 (DOM) · o seletor de arquivo lista fotos HEIC/HEIF", async () => {
  await comComposer({}, async ({ comp }) => {
    const acc = achar(comp.el, "input[type=file]").getAttribute("accept");
    assert.match(acc, /image\/heic/);
    assert.match(acc, /image\/heif/);
    assert.match(acc, /\.heic/);
  });
});

test("CB-107 (DOM) · a cota acaba com esta sugestão: «Outra sugestão» desliga como o botão da IA", async () => {
  await comComposer({ base: { ia: { ligada: true, cota: { limite: 10, usadas: 9 } } } }, async ({ A, comp, aoIA }) => {
    aoIA(async () => { A.base.ia.cota.usadas = 10; return { texto: "Olá! Posso ajudar?" }; });
    achar(comp.el, 'button[aria-label="Sugerir resposta com IA"]').click();
    await esperar(10);
    assert.equal(achar(comp.el, ".cvx-ia-outra").disabled, true);
  });
});

test("CB-110 (DOM) · vídeo grande demais sugere gravar mais curto ou mandar um link", async () => {
  await comComposer({}, async ({ comp }, d) => {
    await comp.anexar({ name: "v.mp4", type: "video/mp4", size: 30 * 1024 * 1024 });
    assert.match(d.toasts.at(-1), /Grave mais curto ou mande um link \(Drive, Google Fotos\)/);
  });
});

test("CB-117 (DOM) · número sem token: fora do admin a trava manda pedir ao administrador", async () => {
  await comComposer({ conv: { canal: { provedor: "meta", tem_token: false } }, acoes: { pode: p => p !== "admin" } }, async ({ comp }) => {
    const t = achar(comp.el, ".cvx-trava");
    assert.match(t.textContent, /Peça ao administrador para salvar o token deste número/);
    assert.doesNotMatch(t.textContent, /Configure/);
  });
  await comComposer({ conv: { canal: { provedor: "meta", tem_token: false } } }, async ({ comp }) => {
    assert.match(achar(comp.el, ".cvx-trava").textContent, /Configure em Números de WhatsApp/);
  });
});

test("CB-120 (DOM) · o modal do anexo avisa a janela que fecha em 10 min, com a hora", async () => {
  await comComposer({ conv: { janela_ate: new Date(Date.now() + 10 * 60000).toISOString() } }, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return null; });
    await comp.anexar({ name: "a.pdf", type: "application/pdf", size: 1000 });
    assert.match(achar(corpo, ".cv-aviso-janela").textContent, /fecha às \d{2}:\d{2} \(em 10 min\)/);
  });
});

test("CB-133 (DOM) · parâmetros do modelo sem preenchimento automático do navegador", async () => {
  const prontos = [{ id: "t3", canal_id: "k1", nome: "c", status: "APPROVED", categoria: "UTILITY", corpo: "Olá {{1}}", num_parametros: 1 }];
  await comComposer({ base: { templates: prontos } }, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return null; });
    await comp.abrirModelos();
    achar(corpo, ".cv-modelo").click();
    const inp = achar(corpo, "#cvx-par-1");
    assert.equal(inp.getAttribute("autocomplete"), "off");
    assert.ok(inp.hasAttribute("data-sem-protecao"));
  });
});

test("CB-139 (DOM) · Enviar desligado aponta para o motivo (aria-describedby → trava)", async () => {
  const passado = new Date(Date.now() - 30 * 3600000).toISOString();
  await comComposer({ conv: { janela_ate: passado, ultima_entrada_em: passado } }, async ({ comp }) => {
    const bt = achar(comp.el, ".cvx-enviar");
    assert.equal(bt.disabled, true);
    const trava = achar(comp.el, ".cvx-trava");
    assert.equal(trava.id, "cvx-trava");
    assert.equal(bt.getAttribute("aria-describedby"), "cvx-trava");
  });
  await comComposer({}, async ({ comp }) => { assert.equal(achar(comp.el, ".cvx-enviar").getAttribute("aria-describedby"), null); });
});

test("CB-142 (DOM) · áudio gravado abre como «Enviar áudio gravado (0:42)», sem o nome técnico do arquivo", async () => {
  await comComposer({}, async ({ comp }, d) => {
    let modal = null;
    d.aoModal(o => { modal = o; return null; });
    const f = new File([new Uint8Array(64)], "audio-orbita-1.ogg", { type: "audio/ogg" });
    await comp.anexar(f, { gravadoS: 42 });
    assert.match(modal.titulo, /^Enviar áudio gravado \(0:42\) para /);
    const info = achar(modal.corpo, ".cv-otim-info").textContent;
    assert.match(info, /^Áudio gravado · 0:42/);
    assert.doesNotMatch(info, /audio-orbita/);
  });
});

/* ---------------------------------------------------------------- (d) lista */
test("CB-016 (DOM) · faixa «Sem conexão» com a lista guardada ontem diz «ontem às»", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1)] });
    t.A.listaSoCache = true; t.A.listaCacheEm = new Date(Date.now() - 24 * 3600000).toISOString();
    t.lista.render();
    assert.match(achar(t.lista.el, ".cvl-cache").textContent, /Sem conexão · lista de ontem às \d{2}:\d{2}\./);
  } finally { d.fim(); }
});

test("CB-067 (DOM) · «Selecionar várias» com mouse diz «Clique»; no toque, «Toque»", async () => {
  for (const [grosso, re] of [[false, /^Clique nas conversas para selecionar$/], [true, /^Toque nas conversas para selecionar$/]]) {
    const d = comDom({ grosso });
    try {
      const t = await montarLista(d, { itens: [conv(1)] });
      achar(t.lista.el, ".cvl-sel-bt").click();
      assert.match(achar(t.lista.el, ".cvl-lote-n").textContent, re);
    } finally { d.fim(); }
  }
});

test("CB-070 (DOM) · a busca anuncia quantas conversas vieram (uma vez, depois de uma pausa)", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: Array.from({ length: 12 }, (_, i) => conv(i + 1)) });
    t.A.busca = "maria"; t.lista.render(); t.lista.render();
    await esperar(700);
    assert.deepEqual(d.anuncios.filter(a => /«maria»/.test(a)), ["12 conversas para «maria»"]);
    t.lista.render(); await esperar(700);
    assert.equal(d.anuncios.filter(a => /«maria»/.test(a)).length, 1, "o mesmo resultado não é anunciado de novo");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (e) central */
test("CB-087/CB-241 (central) · 3 falhas seguidas do nx_cv_listar com a lista na tela: «Lista sem atualizar desde…» e «Tentar agora»", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    const listar = srv.handlers.nx_cv_listar;
    srv.handlers.nx_cv_listar = () => { throw Object.assign(new Error("servico_indisponivel"), { codigo: "servico_indisponivel" }); };
    const faixa = () => achar(c.alvo, ".cvl-atraso");
    await c.pulso(); await c.pulso();
    assert.equal(faixa().hidden, true, "duas falhas ainda não avisam");
    await c.pulso();
    assert.equal(faixa().hidden, false);
    assert.match(faixa().textContent, /Lista sem atualizar desde \d{2}:\d{2}\./);
    assert.ok(c.alvo.querySelectorAll(".cvl-item").length > 0, "a lista continua na tela");
    srv.handlers.nx_cv_listar = listar;
    achar(faixa(), ".cvl-atraso-bt").click();
    await esperar(40);
    assert.equal(faixa().hidden, true);
  } finally { c.fim(); d.fim(); }
});

test("CB-045 (central) · «Nova conversa»: o número com erro diz «(com erro)», não «(não verificado)»", async () => {
  const d = comDom();
  const srv = criarServidor({ canais: [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true, estado: "conectado" },
    { id: "k2", nome: "Vendas", provedor: "meta", status: "erro", tem_token: true }] });
  const c = await montarCentral(d, srv);
  try {
    let corpo = null;
    d.aoModal(o => { if (o.corpo && o.corpo.querySelector && o.corpo.querySelector("#cv-nv-canal")) corpo = o.corpo; return null; });
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(10);
    const ops = achar(corpo, "#cv-nv-canal").querySelectorAll("option").map(o => o.textContent);
    assert.deepEqual(ops, ["Recepção", "Vendas (com erro)"]);
  } finally { c.fim(); d.fim(); }
});

test("CB-048 (central) · transferir em lote marca quem não atende o departamento e grava o recado antes de transferir", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 2 });
  srv.base.departamentos = [{ id: "d1", nome: "Ortodontia" }];
  srv.base.usuarios.push({ id: "u3", nome: "Bia", papel: "atendente", departamentos: ["d9"] });
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    let rotulo = "";
    d.aoModal(async o => {
      const corpo = o.corpo;
      const dep = achar(corpo, "#cv-trl-dep"); dep.value = "d1"; d.ev(dep, "change");
      rotulo = achar(corpo, "#cv-trl-pessoa").querySelectorAll("option").find(x => x.value === "u3").textContent;
      achar(corpo, "#cv-trl-pessoa").value = "u3"; d.ev(achar(corpo, "#cv-trl-pessoa"), "change");
      assert.equal(achar(corpo, ".cv-tr-dep-aviso").hidden, false);
      achar(corpo, "#cv-trl-recado").value = "clientes do implante";
      return o.acoes[1].fn();
    });
    achar(c.alvo, ".cvl-lote-transf").click();
    await esperar(30);
    assert.equal(rotulo, "Bia (não atende este departamento)");
    await d.desfazeres.at(-1).firmar();
    const nomes = srv.chamadas.filter(x => x[0] === "nx_cv_nota" || x[0] === "nx_cv_atribuir").map(x => [x[0], x[1].p_conversa, x[1].p_texto || x[1].p_conta]);
    assert.deepEqual(nomes, [["nx_cv_nota", 901, "Transferência: clientes do implante"], ["nx_cv_atribuir", 901, "u3"],
      ["nx_cv_nota", 902, "Transferência: clientes do implante"], ["nx_cv_atribuir", 902, "u3"]]);
  } finally { c.fim(); d.fim(); }
});

test("CB-052 (central) · 10 resizes no mesmo quadro: um trabalho só (requestAnimationFrame)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  const mm = globalThis.matchMedia;
  try {
    let n = 0;
    globalThis.matchMedia = q => { if (q === "(max-width: 1280px)") n++; return mm(q); };
    for (let i = 0; i < 10; i++) d.janela.dispatchEvent({ type: "resize" });
    await esperar(20);
    assert.equal(n, 1, "posicionarLateral (que refaz o cabeçalho) uma vez só");
  } finally { globalThis.matchMedia = mm; c.fim(); d.fim(); }
});

test("CB-130/CB-055 (central) · exportar confirma antes; o aviso tem «Cancelar» e cancelar no meio não baixa nada", async () => {
  const d = comDom();
  const srv = criarServidor();
  let paginas = 0, prog = null;
  const mens = srv.handlers.nx_cv_mensagens;
  srv.handlers.nx_cv_mensagens = p => {
    if (p.p_antes_id == null) return { ...mens(p), tem_mais: true };
    paginas++;
    if (paginas === 3 && prog) prog.o.acao.fn();       // a pessoa toca em «Cancelar» no meio
    const id = Number(p.p_antes_id) - 1;
    return { itens: [{ id, conversa_id: 901, direcao: "in", tipo: "texto", corpo: `antiga ${id}`, status: "recebida", criado_em: agoraIso(100 + paginas), atualizado_em: agoraIso(100 + paginas) }], tem_mais: true, conversas: [] };
  };
  const u0 = URL.createObjectURL;
  const blobs = [];
  URL.createObjectURL = b => { blobs.push(b); return "blob:exp"; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const confirmacoes = [];
    d.ui.confirmar = async o => { confirmacoes.push(o); return false; };
    const exportar = () => { achar(c.alvo, ".cvc-mais").click(); return d.menus.at(-1).itens.find(x => x && /Exportar/.test(x.rotulo || "")).fn(); };
    await exportar(); await esperar(10);
    assert.match(confirmacoes[0].texto, /dados do paciente e fica neste computador/);
    assert.equal(paginas, 0); assert.equal(blobs.length, 0, "recusou: nada buscado nem baixado");
    const toast0 = d.ui.toast;
    d.ui.toast = (t, o = {}) => { const r = toast0(t, o); if (o.fixo && o.acao) prog = { t, o }; return r; };
    d.ui.confirmar = async () => true;
    await exportar(); await esperar(20);
    assert.match(prog.t, /Preparando a exportação… 0 de até 40 páginas/);
    assert.equal(prog.o.acao.rotulo, "Cancelar");
    assert.equal(paginas, 3, "parou na página em que cancelou");
    assert.equal(blobs.length, 0, "cancelado: nenhum arquivo");
    assert.match(d.toasts.at(-1), /Exportação cancelada/);
  } finally { URL.createObjectURL = u0; c.fim(); d.fim(); }
});

test("CB-092 (central) · «Agenda» que falha avisa antes de abrir a Agenda", async () => {
  const d = comDom();
  const srv = criarServidor();
  // abre direto na 901 (sem c.abrir, que remonta com uma cópia do ctx): o ctx do teste é o A.ctx da central
  const c = await montarCentral(d, srv, { rota: { partes: ["901"], query: {} }, extraCtx: { temModulo: m => m === "crm" || m === "agenda" } });
  const erro0 = console.error;
  try {
    await esperar(20);
    const ordem = [];
    const toast0 = d.ui.toast;
    d.ui.toast = (t, o) => { ordem.push(["toast", t]); return toast0(t, o); };
    c.ctx.navegar = h => { ordem.push(["navegar", h]); };
    c.ctx.pode = p => { if (p === "atendente") throw new Error("agenda quebrou"); return true; };
    console.error = () => {};
    achar(c.alvo, '[data-foco="agenda"]').click();
    for (let i = 0; i < 50 && !ordem.some(x => x[0] === "navegar"); i++) await esperar(10);
    const iT = ordem.findIndex(x => x[0] === "toast" && /Não deu para marcar por aqui; abrindo a Agenda/.test(x[1]));
    const iN = ordem.findIndex(x => x[0] === "navegar" && x[1] === "#/agenda");
    assert.ok(iT >= 0 && iN > iT, JSON.stringify(ordem));
  } finally { console.error = erro0; c.fim(); d.fim(); }
});

test("CB-095 (central) · «Imprimir» os atalhos: a classe fica até o afterprint (print que não bloqueia)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    let corpo = null;
    d.aoModal(o => { corpo = o.corpo; return new Promise(() => {}); });
    let imprimiu = 0;
    d.janela.print = () => { imprimiu++; };
    d.ev(d.doc, "keydown", { key: "?" });
    await esperar(5);
    botaoTexto(corpo, /Imprimir/).click();
    const html = d.doc.documentElement;
    assert.equal(imprimiu, 1);
    assert.equal(html.classList.contains("cv-imprimindo-atalhos"), true, "o print voltou, mas a impressão ainda não aconteceu");
    d.janela.dispatchEvent({ type: "afterprint" });
    assert.equal(html.classList.contains("cv-imprimindo-atalhos"), false);
  } finally { c.fim(); d.fim(); }
});

/* ---------------------------------------------------------------- (f) lateral */
test("CB-058 (DOM) · mais de 4 campos personalizados: «+2 campos na ficha» abre a ficha", async () => {
  const d = comDom();
  try {
    const abertos = [];
    const campos = { a: "1", b: "2", c: "3", d: "4", e: "5", f: "6" };
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana", telefone: "5512999990000", campos } } });
    t.A.ctx.abrirContato = id => abertos.push(id);
    const mais = achar(t.alvo, ".cvt-mais-campos button");
    assert.equal(mais.textContent, "+2 campos na ficha");
    mais.click();
    assert.deepEqual(abertos, [5]);
  } finally { d.fim(); }
});

test("CB-061 (DOM) · nova tarefa com prazo no passado: o 1º toque avisa e não grava; o 2º cria assim mesmo", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    const salvas = [], erros = [];
    t.A.api.rpcC = async (nome, p) => { if (nome === "nx_tarefa_salvar") salvas.push(p.p_tarefa); return { id: 1 }; };
    const ontem = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .format(new Date(Date.now() - 86400000)).replace(" ", "T");
    d.ui.lerForm = () => ({ titulo: "Ligar", tipo: "ligacao", vence_em: ontem });
    d.ui.marcarErro = (f, campo, msg) => erros.push([campo, msg]);
    let primeiro, gravadasNo1o = -1;
    d.aoModal(async o => { primeiro = await o.acoes[1].fn(); gravadasNo1o = salvas.length; return o.acoes[1].fn(); });
    achar(t.alvo, '[data-foco="nova-tarefa"]').click();
    await esperar(5);
    assert.equal(primeiro, false);
    assert.equal(gravadasNo1o, 0);
    assert.deepEqual(erros[0], ["vence_em", "Esse horário já passou. Toque em «Criar tarefa» de novo para criar assim mesmo."]);
    assert.equal(salvas.length, 1);
  } finally { d.fim(); }
});

test("CB-064 (DOM) · a base do CRM que falhou é relida 60 s depois (os rótulos voltam)", async () => {
  const d = comDom();
  const agora0 = Date.now;
  try {
    let n = 0;
    const api = { rpcC: async nome => { if (nome === "nx_crm_base") { n++; if (n === 1) throw new Error("rede"); return { campos: [{ entidade: "contato", chave: "convenio", rotulo: "Convênio" }], funis: [] }; } return {}; }, fn: async () => ({}) };
    const t = await montarLateral(d, { api, ver: { contato: { id: 5, nome: "Mariana", telefone: "5512999990000", campos: { convenio: "Unimed" } } } });
    await esperar(5);
    assert.equal(n, 1);
    assert.doesNotMatch(t.alvo.textContent, /Convênio/);
    t.lat.render(); await esperar(5);
    assert.equal(n, 1, "antes de 60 s não pede de novo");
    const base = agora0();
    Date.now = () => base + 61000;
    t.lat.render(); await esperar(5);
    assert.equal(n, 2);
    assert.match(t.alvo.textContent, /Convênio/);
  } finally { Date.now = agora0; d.fim(); }
});

/* ---------------------------------------------------------------- (g) cv-config */
test("CB-082 (Assistente de IA) · o contador não é região viva; só cruzar 80% é anunciado", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "ia").montar;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { ia: { ligada: true }, config: { ia: { sobre: "" } } } : {}) });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    assert.equal(achar(t.alvo, ".cfg-ia-cont").getAttribute("aria-live"), null);
    const anuncio = achar(t.alvo, ".cfg-ia-cont-anuncio");
    const ta = achar(t.alvo, 'textarea[name="sobre"]');
    ta.value = "a"; ta.dispatchEvent(new d.Evento("input"));
    assert.equal(anuncio.textContent, "", "abaixo de 80% nada é anunciado");
    ta.value = "x".repeat(12500); ta.dispatchEvent(new d.Evento("input"));
    assert.match(anuncio.textContent, /^Perto do limite: 12\.500 \/ 15\.000 caracteres\.$/);
  } finally { if (sair) sair(); d.fim(); }
});

test("CB-104 (Respostas rápidas) · importar diz QUAIS atalhos o servidor recusou", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "respostas").montar;
    const t = ctxNum(ui, { rpc: async (n, p) => {
      if (n === "nx_cv_base") return { respostas: [], departamentos: [] };
      if (n === "nx_resposta_salvar") { if (/^(b|d)$/.test(p.p_resposta.atalho)) throw new Error("atalho_repetido"); return { id: 1 }; }
      return {};
    } });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    const json = JSON.stringify([..."abcde"].map(a => ({ atalho: a, titulo: `T ${a}`, corpo: `corpo ${a}` })));
    const inp = achar(t.alvo, 'input[type="file"]');
    inp.files = [{ text: async () => json }];
    inp.dispatchEvent(new d.Evento("change")); await tique(14);
    const fim = t.toasts.at(-1)[0];
    assert.match(fim, /^3 de 5 importadas\. Recusadas pelo servidor: \/b, \/d\.$/);
    assert.ok(t.toasts.some(x => /^Importando \d de 5…$/.test(x[0])), "progresso enquanto grava");
  } finally { if (sair) sair(); d.fim(); }
});

/* ============================================================ lote conv-3 (plano 1000b) */
/* ---------------------------------------------------------------- (a) lógica pura */
test("CB-004/CB-214 · o DDD 29 não existe (Nova conversa e número do canal); o 27 continua valendo", () => {
  assert.match(L.erroTelefone("29999999999"), /DDD 29 não existe/);
  assert.equal(L.erroTelefone("27999999999"), "");
  assert.equal(CV.normalizarNumeroCanal("(29) 99999-9999").ok, false);
  assert.equal(CV.normalizarNumeroCanal("(28) 99999-9999").ok, true);
  assert.equal(CV.DDD_CANAL.source, L.DDD_VALIDO.source, "as duas listas continuam iguais");
});

test("CB-026/CB-230 · «www.clinica.com.br» sem http vira link com href https:// (e «xwww.» colado numa palavra não)", () => {
  const segs = L.formatarWhats("veja www.exemplo.com.br.");
  const link = segs.find(s => s.tipo === "link");
  assert.ok(link, "virou link");
  assert.match(link.v, /^https:\/\/www\.exemplo\.com\.br$/);
  assert.equal(link.texto, "www.exemplo.com.br", "mostra como foi escrito");
  assert.equal(segs.at(-1).v, ".", "o ponto final fica fora");
  assert.ok(!L.formatarWhats("xwww.a.com").some(s => s.tipo === "link"));
  assert.deepEqual(L.formatarWhats("https://www.b.com")[0], { tipo: "link", v: "https://www.b.com" }, "com http segue igual");
});

test("CB-029 · frase falada e title dizem «3 dias» (o «3 d» fica só no selo)", () => {
  const agora = new Date();
  const c = dias => ({ status: "aberta", aguardando: true, contato: { nome: "Mariana" }, ultima_entrada_em: new Date(agora.getTime() - dias * 86400000 - 60000).toISOString() });
  assert.equal(L.textoNovaMensagem([c(3)], agora), "Nova mensagem de Mariana, aguardando há 3 dias");
  assert.equal(L.textoNovaMensagem([c(1)], agora), "Nova mensagem de Mariana, aguardando há 1 dia");
  assert.equal(L.tempoEspera(c(3).ultima_entrada_em, agora), "3 d", "o selo curto continua");
  assert.equal(L.tempoEsperaLongo(new Date(agora.getTime() - 2 * 3600000 - 1000).toISOString(), agora), "2 horas");
});

test("CB-086/CB-243 · «Pausar a IA até as 8h» de madrugada é hoje às 8h (02:00 → 6 h), à noite é amanhã", () => {
  assert.equal(L.horasAteAmanha8(new Date("2026-10-13T02:00:00-03:00")), 6);
  assert.equal(L.horasAteAmanha8(new Date("2026-10-13T20:00:00-03:00")), 12);
  assert.equal(L.rotuloPausa8(new Date("2026-10-13T02:00:00-03:00")), "Pausar a IA até as 8h");
  assert.equal(L.rotuloPausa8(new Date("2026-10-13T09:00:00-03:00")), "Pausar a IA até amanhã às 8h");
});

test("CB-013 · prazo da pausa com o dia: hoje só a hora; amanhã «amanhã 08:00»; na semana, o dia", () => {
  const agora = new Date("2026-10-13T10:00:00-03:00");   // terça
  assert.equal(L.ateTexto("2026-10-13T18:00:00-03:00", agora), "18:00");
  assert.equal(L.ateTexto("2026-10-14T08:00:00-03:00", agora), "amanhã 08:00");
  assert.match(L.ateTexto("2026-10-16T08:00:00-03:00", agora), /^sex\.? 08:00$/);
  assert.equal(L.ateTexto("2026-10-30T08:00:00-03:00", agora), "30/10 08:00");
});

test("CB-010 · faixa do «responder citando»: a Mariana, à sua mensagem, à IA, a Ana (nunca «Respondendo Você»)", () => {
  assert.equal(L.rotuloRespondendo({ direcao: "in" }, { nomeContato: "Mariana" }), "Respondendo a Mariana");
  assert.equal(L.rotuloRespondendo({ direcao: "out", enviado_por: { id: "u1", nome: "Helena" } }, { euId: "u1" }), "Respondendo à sua mensagem");
  assert.equal(L.rotuloRespondendo({ direcao: "out", origem: "ia" }, { euId: "u1" }), "Respondendo à IA");
  assert.equal(L.rotuloRespondendo({ direcao: "out", enviado_por: { id: "u2", nome: "Ana Paula" } }, { euId: "u1" }), "Respondendo a Ana");
  assert.equal(L.rotuloRespondendo({ direcao: "out" }, { euId: "u1" }), "Respondendo à equipe");
});

test("CB-007 · regra única do «marcar como lida»: sem dono ou minha; de colega ou papel leitura, não", () => {
  assert.equal(L.podeMarcarLida({ atribuida_a: null }, { id: "u1" }, true), true);
  assert.equal(L.podeMarcarLida({ atribuida_a: "u1" }, { id: "u1" }, true), true);
  assert.equal(L.podeMarcarLida({ atribuida_a: "u2" }, { id: "u1" }, true), false);
  assert.equal(L.podeMarcarLida({ atribuida_a: null }, { id: "u1" }, false), false);
});

test("CB-056 · prazo do envio de arquivo proporcional ao tamanho (60 s + 30 s/MB, teto de 10 min)", async () => {
  assert.equal(conversasMod.prazoUpload(0), 60000);
  assert.ok(conversasMod.prazoUpload(16 * 1048576) >= 540000);
  assert.equal(conversasMod.prazoUpload(100 * 1048576), 600000);
  const d = comDom();
  try {
    let visto = null;
    class XHRPrazo {
      constructor() { this.upload = { addEventListener() {} }; this.ouv = {}; this.status = 0; }
      open() {} setRequestHeader() {}
      addEventListener(t, fn) { this.ouv[t] = fn; }
      send() { visto = this.timeout; setTimeout(() => { this.status = 200; this.ouv.load(); }, 0); }
      abort() {}
    }
    Object.defineProperty(globalThis, "XMLHttpRequest", { value: XHRPrazo, configurable: true, writable: true });
    await conversasMod.subirArquivo("https://up.test/x", { size: 16 * 1048576 }, "video/mp4");
    assert.ok(visto >= 540000, `x.timeout = ${visto}`);
  } finally { d.fim(); }
});

test("CB-099 · cv-config: pílulas «Enviada» e «App inscrito» sem ✓ no texto (o ícone já marca)", () => {
  const src = ler("cv-config.js");
  assert.doesNotMatch(src, /pilula\("[^"]*✓/);
});

/* ---------------------------------------------------------------- (b) chat */
test("CB-026 (DOM) · o link «www.» mostra o que foi escrito e abre em https://", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5, { corpo: "site: www.clinica.com.br" })] });
    const a = achar(chat.el, '.cv-msg[data-id="1"] a');
    assert.equal(a.getAttribute("href"), "https://www.clinica.com.br");
    assert.match(a.textContent, /^www\.clinica\.com\.br/);
  } finally { d.fim(); }
});

test("CB-013/CB-222 (DOM) · IA pausada até amanhã às 8h: a pílula diz «amanhã»", async () => {
  const d = comDom();
  try {
    const ate = `${L.diaSP(Date.now() + 86400000)}T08:00:00-03:00`;
    const { chat } = await montarChat(d, { provedor: "codewords", ia: { disponivel: true, ia_ligada: true, pausada: true, pausada_ate: new Date(ate).toISOString(), pausada_por_nome: "Helena" } });
    assert.match(achar(chat.el, ".cv-pil-ia").textContent, /IA pausada até amanhã 08:00/);
  } finally { d.fim(); }
});

test("CB-021/CB-227 (DOM) · falha antiga (desenhada ao abrir) sem role=alert; falha nova e bolha local com alert", async () => {
  const d = comDom();
  try {
    const velha = txt(1, "out", 30, { status: "falhou", erro: "Número inválido" });
    const { chat, A } = await montarChat(d, { msgs: [velha] });
    assert.equal(achar(chat.el, '.cv-msg[data-id="1"] .cv-falha').getAttribute("role"), null, "a antiga não dispara alerta ao abrir");
    A.msgs = [...A.msgs, txt(2, "out", 1, { status: "falhou", erro: "O canal recusou" }),
      { ...txt("tmp-9", "out", 0), local: true, status: "falhou", falhaLocal: true, pedido: { tipo: "texto" }, erro: "sem rede" }];
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(achar(chat.el, '.cv-msg[data-id="2"] .cv-falha').getAttribute("role"), "alert", "falha que surgiu com a conversa aberta");
    assert.equal(achar(chat.el, '.cv-msg[data-id="tmp-9"] .cv-falha').getAttribute("role"), "alert", "bolha local");
    assert.equal(achar(chat.el, '.cv-msg[data-id="1"] .cv-falha').getAttribute("role"), null);
  } finally { d.fim(); }
});

const audioMsg = (id, extra = {}) => ({ id, conversa_id: 9, direcao: "in", tipo: "audio", corpo: "", status: "recebida", midia: { path: `c1/in/a${id}.ogg`, mime: "audio/ogg", duracao: 100 },
  criado_em: agoraIso(5), atualizado_em: agoraIso(5), ...extra });

test("CB-030/CB-232 (DOM) · áudio que o navegador não toca: aviso com «Baixar» (antes ficava calado)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [audioMsg(1)] });
    const audio = achar(chat.el, "audio");
    audio.play = () => Promise.reject(Object.assign(new Error("no supported source"), { name: "NotSupportedError" }));
    achar(chat.el, ".cv-au-play").click();
    await esperar(5);
    const av = achar(chat.el, ".cv-au-naotoca");
    assert.match(av.textContent, /Este navegador não toca este áudio/);
    assert.equal(achar(av, "a").getAttribute("href"), "https://cdn.test/c1/in/a1.ogg");
    assert.match(achar(av, "a").textContent, /Baixar/);
  } finally { d.fim(); }
});

test("CB-090 (DOM) · arrastar no trilho do áudio acompanha (pointermove com o botão pressionado)", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [audioMsg(1)] });
    const trilho = achar(chat.el, ".cv-au-trilho"), audio = achar(chat.el, "audio");
    trilho.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 10, right: 100, bottom: 10 });
    d.ev(trilho, "pointerdown", { clientX: 10, pointerId: 1 });
    assert.equal(Math.round(audio.currentTime), 10);
    d.ev(trilho, "pointermove", { clientX: 55, pointerId: 1 });
    assert.equal(Math.round(audio.currentTime), 55, "acompanha o arrasto");
    d.ev(trilho, "pointerup", { pointerId: 1 });
    d.ev(trilho, "pointermove", { clientX: 90, pointerId: 1 });
    assert.equal(Math.round(audio.currentTime), 55, "solto, o movimento não mexe");
  } finally { d.fim(); }
});

test("CB-134 (DOM) · áudio e vídeo fora da tela não pedem metadados (preload none até entrar na tela)", async () => {
  const d = comDom();
  const IO0 = globalThis.IntersectionObserver;
  const obs = [];
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.alvos = []; obs.push(this); } observe(el) { this.alvos.push(el); } unobserve() {} disconnect() {} };
  try {
    const video = { id: 2, conversa_id: 9, direcao: "in", tipo: "video", corpo: "", status: "recebida", midia: { path: "c1/in/v.mp4", duracao: 12 }, criado_em: agoraIso(4), atualizado_em: agoraIso(4) };
    const { chat } = await montarChat(d, { msgs: [audioMsg(1), video] });
    const audio = achar(chat.el, "audio"), v = achar(chat.el, "video");
    assert.equal(audio.getAttribute("preload"), "none");
    assert.equal(v.getAttribute("preload"), "none");
    const io = obs.find(o => o.alvos.some(a => a.classList && a.classList.contains("cv-audio")));
    assert.ok(io, "a bolha é vigiada");
    io.cb(io.alvos.map(target => ({ isIntersecting: true, target })));
    assert.equal(audio.getAttribute("preload"), "metadata", "entrou na tela: pede os metadados");
    assert.equal(v.getAttribute("preload"), "metadata");
  } finally { if (IO0) globalThis.IntersectionObserver = IO0; else delete globalThis.IntersectionObserver; d.fim(); }
});

test("CB-033 (DOM) · grade de fotos: a célula que não abriu é botão «Tentar de novo» que esquece o erro", async () => {
  const d = comDom();
  try {
    const foto = (id, min) => ({ id, conversa_id: 9, direcao: "in", tipo: "imagem", corpo: "", status: "recebida", midia: { path: `c1/in/f${id}.jpg` }, criado_em: agoraIso(min), atualizado_em: agoraIso(min) });
    const { chat, A } = await montarChat(d, { msgs: [foto(1, 5), foto(2, 5)], acoes: { urlMidia: () => null, estadoMidia: () => "erro" } });
    A.midia.set("c1/in/f1.jpg", { erro: true, em: Date.now() });
    const cel = achar(chat.el, '.cv-grade-erro[data-id="1"]');
    assert.equal(cel.localName, "button");
    assert.match(cel.textContent, /Tentar de novo/);
    cel.click();
    assert.equal(A.midia.has("c1/in/f1.jpg"), false, "o clique limpa o cache");
    assert.ok(chat.el.contains(d.doc.activeElement) && d.doc.activeElement !== d.doc.body, "CB-128: o foco fica na bolha nova");
  } finally { d.fim(); }
});

test("CB-074 (DOM) · dica do visualizador: no toque só «Deslize»; no computador só as teclas", async () => {
  for (const grosso of [true, false]) {
    const d = comDom({ grosso });
    try {
      const foto = { id: 1, conversa_id: 9, direcao: "in", tipo: "imagem", corpo: "", status: "recebida", midia: { path: "c1/in/a.jpg" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
      const { chat } = await montarChat(d, { msgs: [foto] });
      achar(chat.el, ".cv-img-bt").click();
      await esperar(5);
      const dica = achar(d.doc.body, "dialog.cv-lb .cv-lb-dica");
      if (grosso) { assert.equal(dica.querySelector("kbd"), null); assert.match(dica.textContent, /Deslize para trocar/); }
      else { assert.ok(dica.querySelector("kbd")); assert.doesNotMatch(dica.textContent, /celular/); }
    } finally { d.fim(); }
  }
});

test("CB-077 (DOM) · separador de atendimento sem protocolo: «Atendimento de …», sem espaço duplo", async () => {
  const d = comDom();
  try {
    const { chat, A } = await montarChat(d, { msgs: [txt(1, "in", 50, { conversa_id: 8 }), txt(2, "in", 5)] });
    A.conversasContato = [{ id: 8, protocolo: null, aberta_em: agoraIso(60) }, { id: 9, protocolo: "ORB-1", aberta_em: agoraIso(10) }];
    chat.renderMensagens({ rolar: "manter" });
    const seps = chat.el.querySelectorAll(".cv-atend");
    const sem = seps.find(s => !/ORB-1/.test(s.textContent));
    assert.ok(sem, "há o separador da conversa sem protocolo");
    assert.equal(sem.textContent, "Atendimento de 28/09/2026 15:00");
    assert.equal(sem.getAttribute("aria-label"), "Atendimento de 28/09/2026 15:00");
    assert.doesNotMatch(sem.textContent, / {2}/);
  } finally { d.fim(); }
});

test("CB-128 (DOM) · «Ver mensagens anteriores»: o foco continua no topo do histórico durante e depois da carga", async () => {
  const d = comDom();
  try {
    let chatRef = null, Aref = null;
    const { chat, A } = await montarChat(d, { msgs: [txt(1, "in", 5)], acoes: { carregarAntes() { Aref.carregandoAntes = true; chatRef.renderTopo(); } } });
    chatRef = chat; Aref = A;
    A.temMaisAntes = true; chat.renderTopo();
    const topo = achar(chat.el, ".cvc-topo-hist");
    const bt = achar(topo, "button");
    bt.focus(); bt.click();
    assert.ok(topo.contains(d.doc.activeElement), "carregando: o foco segue no topo");
    assert.equal(achar(topo, "button").getAttribute("aria-busy"), "true");
    A.carregandoAntes = false; chat.renderTopo();
    assert.ok(topo.contains(d.doc.activeElement), "carregou: o foco segue no topo");
    assert.match(d.doc.activeElement.textContent, /Ver mensagens anteriores/);
  } finally { d.fim(); }
});

test("CB-140 (DOM) · progresso do envio muda a barra no lugar (a bolha não é refeita a cada tique)", async () => {
  const d = comDom();
  try {
    const local = { id: "tmp-1", local: true, conversa_id: 9, direcao: "out", tipo: "documento", status: "pendente", criado_em: agoraIso(1), atualizado_em: agoraIso(1),
      midia: { estado: "enviando", progresso: 10, fase: "subindo", local_url: "blob:x", nome: "a.pdf" } };
    const { chat, A } = await montarChat(d, { msgs: [local] });
    const bolha = achar(chat.el, '.cv-msg[data-id="tmp-1"]');
    for (let p = 20; p <= 80; p += 10) {
      A.msgs = A.msgs.map(m => (m.id === "tmp-1" ? { ...m, midia: { ...m.midia, progresso: p } } : m));
      assert.equal(chat.pintarProgresso("tmp-1", p), true);
      chat.renderMensagens({ rolar: "manter" });
    }
    assert.equal(achar(chat.el, '.cv-msg[data-id="tmp-1"]'), bolha, "a mesma bolha: nada foi redesenhado");
    const pr = achar(bolha, ".cv-prog");
    assert.equal(pr.getAttribute("aria-valuenow"), "80");
    assert.equal(achar(pr, ".cv-prog-barra i").style.getPropertyValue("width"), "80%");
    assert.equal(achar(pr, ".cv-prog-txt").textContent, "80 %");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (c) composer */
test("CB-010/CB-219 (DOM) · responder: «Respondendo a <cliente>», «à sua mensagem», «à IA»", async () => {
  await comComposer({}, async ({ comp }) => {
    const faixa = () => achar(comp.el, ".cvx-resp b").textContent;
    comp.responder(txt(1, "in", 5));
    assert.equal(faixa(), "Respondendo a maria souza");
    comp.responder(txt(2, "out", 4));
    assert.equal(faixa(), "Respondendo à sua mensagem");
    comp.responder(txt(3, "out", 3, { origem: "ia", enviado_por: null }));
    assert.equal(faixa(), "Respondendo à IA");
    comp.responder(txt(4, "out", 2, { enviado_por: { id: "u2", nome: "Ana Paula" } }));
    assert.equal(faixa(), "Respondendo a Ana");
  });
});

test("CB-037/CB-236 (DOM) · áudio do medidor «suspended»: resume() e nada de «Não estamos ouvindo nada»", async () => {
  const salvo = { MR: globalThis.MediaRecorder, AC: globalThis.AudioContext, OAC: globalThis.OfflineAudioContext, seguro: globalThis.isSecureContext,
    nav: Object.getOwnPropertyDescriptor(globalThis, "navigator"), agora: Date.now };
  const regs = { resumidos: 0 };
  globalThis.MediaRecorder = class {
    static isTypeSupported(t) { return /ogg/.test(t); }
    constructor() { this.state = "inactive"; this.mimeType = "audio/ogg"; this.ouv = {}; }
    addEventListener(t, f) { (this.ouv[t] ||= []).push(f); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; for (const f of this.ouv.stop || []) f(); }
  };
  class ACSuspenso {
    constructor() { this.state = "suspended"; }
    createAnalyser() { return { fftSize: 512, getFloatTimeDomainData(b) { b.fill(0); } }; }
    createMediaStreamSource() { return { connect() {} }; }
    resume() { regs.resumidos++; return Promise.resolve(); }   // continua «suspended» (o navegador ainda não deixou)
    close() { return Promise.resolve(); }
  }
  globalThis.AudioContext = ACSuspenso;
  globalThis.OfflineAudioContext = class {};
  globalThis.isSecureContext = true;
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } });
  try {
    await comComposer({}, async ({ comp }, d) => {
      achar(comp.el, ".cvx-audio").click();
      await esperar(10);
      assert.equal(regs.resumidos, 1, "pede resume() logo ao criar");
      let k = 0; const real = salvo.agora;
      Date.now = () => real() + (k++) * 1000;          // o relógio corre: o silêncio passaria de 3 s em poucos tiques
      await esperar(1300);
      Date.now = real;
      assert.equal(achar(comp.el, ".cvx-rec-mudo").hidden, true, "com o áudio suspenso não acusa microfone mudo");
      const cancelar = comp.el.querySelectorAll("button").find(b => b.textContent === "Cancelar" && !b.closest(".cv-fila"));
      if (cancelar) cancelar.click();
      await esperar(5);
      void d;
    });
  } finally {
    Date.now = salvo.agora;
    globalThis.MediaRecorder = salvo.MR; globalThis.AudioContext = salvo.AC; globalThis.OfflineAudioContext = salvo.OAC; globalThis.isSecureContext = salvo.seguro;
    if (salvo.nav) Object.defineProperty(globalThis, "navigator", salvo.nav); else delete globalThis.navigator;
  }
});

test("CB-041 (DOM) · sugestão da IA que passa do limite: toast «o fim ficou de fora»", async () => {
  await comComposer({}, async (t, d) => {
    t.digitar("a".repeat(4000));
    t.aoIA(async () => ({ texto: "b".repeat(300) }));
    achar(t.comp.el, '[aria-label="Sugerir resposta com IA"]').click();
    await esperar(10);
    assert.ok(d.toasts.some(x => /passou do limite: o fim ficou de fora/.test(x)), d.toasts.join(" | "));
    assert.equal(t.ta.value.length, 4096);
  });
});

test("CB-080 (DOM) · várias fotos: «Tirar» uma deixa «Enviar 2» e só as que ficaram saem", async () => {
  await comComposer({}, async ({ comp, enviados }, d) => {
    let titulo = null, botao = null;
    d.aoModal(o => {
      const el = d.h("div", null, d.h("h2", null, o.titulo), d.h("footer", null, d.h("button", { dataset: { tipo: "primario" } }, o.acoes[1].rotulo)));
      o.aoAbrir({ el, fechar() {} });
      o.corpo.querySelectorAll(".cvx-multi-tirar")[1].click();
      titulo = el.querySelector("h2").textContent; botao = el.querySelector("button").textContent;
      return true;
    });
    const fotos = ["a", "b", "c"].map(n => new File([new Uint8Array(2000)], `${n}.jpg`, { type: "image/jpeg" }));
    const input = achar(comp.el, "input[type=file]");
    Object.defineProperty(input, "files", { value: fotos, configurable: true });
    d.ev(input, "change");
    await esperar(60);
    assert.equal(botao, "Enviar 2");
    assert.match(titulo, /^Enviar 2 fotos para /);
    assert.deepEqual(enviados.map(e => e.arquivo.name), ["a.jpg", "c.jpg"]);
  });
});

test("CB-083 (DOM) · «Modelos aprovados» no menu + do celular usa o mesmo ícone do botão do computador", async () => {
  await comComposer({}, async ({ comp }, d) => {
    achar(comp.el, '[aria-label="Mais opções"]').click();
    const it = d.menus.at(-1).itens.find(x => x && x.rotulo === "Modelos aprovados");
    assert.equal(it.icone, "modelo");
  });
});

test("CB-108 (DOM) · arquivo recusado diz a extensão («.zip não é aceito…»)", async () => {
  await comComposer({}, async ({ comp }, d) => {
    await comp.anexar(new File(["PK"], "exames.zip", { type: "application/zip" }));
    assert.match(d.toasts.at(-1), /^\.zip não é aceito pelo WhatsApp/);
  });
});

test("CB-111 (DOM) · contador da legenda não é região viva; o status fala só ao entrar nas faixas", async () => {
  await comComposer({}, async ({ comp }, d) => {
    let corpo = null;
    d.aoModal(async o => { corpo = o.corpo; return false; });
    await comp.anexar(new File(["%PDF"], "orc.pdf", { type: "application/pdf" }));
    const leg = achar(corpo, "#cvx-legenda"), n = achar(corpo, ".cvx-legenda-n"), st = achar(corpo, ".cvx-legenda-status");
    assert.equal(n.getAttribute("aria-live"), null);
    leg.value = "x".repeat(950); d.ev(leg, "input");
    const primeiro = st.textContent;
    assert.match(primeiro, /74 caracteres restantes/);
    leg.value = "x".repeat(960); d.ev(leg, "input");
    assert.equal(st.textContent, primeiro, "na mesma faixa não fala de novo");
    assert.equal(n.textContent, "64 caracteres restantes", "o contador visível acompanha");
    leg.value = "x".repeat(1010); d.ev(leg, "input");
    assert.match(st.textContent, /14 caracteres restantes/);
  });
});

test("CB-118 (DOM) · trocar de conversa com as respostas rápidas fechadas não anuncia «fechadas»", async () => {
  await comComposer({}, async ({ comp }) => {
    comp.definirConversa(); comp.definirConversa();
    assert.ok(!comp.el.querySelectorAll('[role="status"]').some(s => /Respostas rápidas fechadas/.test(s.textContent)));
  });
});

/* ---------------------------------------------------------------- (d) lista e lateral */
test("CB-017/CB-225 (DOM) · modo seleção: Espaço na linha marca a conversa (e o foco fica nela)", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1), conv(2)] });
    achar(lista.el, ".cvl-sel-bt").click();
    const item = achar(lista.el, '.cvl-item[data-id="1"]');
    assert.equal(item.getAttribute("aria-checked"), "false");
    const ok = d.ev(item, "keydown", { key: " " });
    assert.equal(ok, false, "preventDefault (a lista não rola)");
    const novo = achar(lista.el, '.cvl-item[data-id="1"]');
    assert.equal(novo.getAttribute("aria-checked"), "true");
    assert.equal(d.doc.activeElement, novo);
    d.ev(novo, "keydown", { key: "Enter" });
    assert.equal(achar(lista.el, '.cvl-item[data-id="1"]').getAttribute("aria-checked"), "false", "Enter desmarca");
  } finally { d.fim(); }
});

test("CB-065/CB-068/CB-071 (DOM) · «Mais situações» lista as abas de verdade; «Comigo» some para quem só lê; busca com filtro avisa", async () => {
  const d = comDom();
  try {
    const { A, lista } = await montarLista(d, { itens: [conv(1)] });
    assert.match(achar(lista.el, ".cvl-visoes").getAttribute("title"), /Ocultas/);
    let corpo = null;
    d.ui.flutuante = (ancora, c) => { corpo = c; return { fechar() {} }; };
    A.podeEscrever = false;
    achar(lista.el, ".cvl-filtro").click();
    assert.ok(corpo, "abriu os filtros");
    const valores = achar(corpo, "#cvf-at").querySelectorAll("option").map(o => o.value);
    assert.ok(!valores.includes("eu"), "sem «Comigo»");
    assert.ok(valores.includes("sem"));
    A.busca = "mari"; A.filtro = { departamento_id: "d1" };
    lista.render();
    assert.match(achar(lista.el, ".cvl-busca-info").textContent, /em todas as abas, com os filtros/);
  } finally { d.fim(); }
});

test("CB-029 (DOM) · o title da espera na lista diz «há 3 dias»; o selo continua «3 d»", async () => {
  const d = comDom();
  try {
    const { lista } = await montarLista(d, { itens: [conv(1, { aguardando: true, ultima_entrada_em: new Date(Date.now() - 3 * 86400000 - 60000).toISOString() })] });
    const esp = achar(lista.el, ".cvl-espera");
    assert.match(esp.getAttribute("title"), /3 dias/);
    assert.match(esp.textContent, /3 d$/);
  } finally { d.fim(); }
});

test("CB-059/CB-096 (DOM) · lateral sem protocolo sem a linha «Atendimento»; atendimento atual alcançável (aria-current, sem disabled)", async () => {
  const d = comDom();
  try {
    const { alvo } = await montarLateral(d, { ver: { conversa: { id: 9, protocolo: null, etiquetas: [], atribuida: { nome: "Ana" } } } });
    assert.ok(!alvo.querySelectorAll(".cvt-dl dt").some(dt => dt.textContent === "Atendimento"));
    const at = achar(alvo, ".cvt-at");
    assert.equal(at.getAttribute("aria-current"), "true");
    assert.equal(at.disabled, false);
    assert.equal(at.hasAttribute("disabled"), false);
    assert.equal(at.getAttribute("aria-disabled"), "true");
  } finally { d.fim(); }
});

test("CB-062 (DOM) · «Refazer» o resumo diz que usa a cota; com menos de 10% sobrando, pergunta antes", async () => {
  const d = comDom();
  try {
    let pedidos = 0;
    const api = { rpcC: async () => ({ campos: [] }), fn: async () => { pedidos++; return { texto: "Quer marcar avaliação." }; } };
    const { A, lat, alvo } = await montarLateral(d, { api });
    A.base.ia = { ligada: true, cota: { limite: 100, usadas: 5 } };
    lat.render(); await esperar(5);
    achar(alvo, '[data-foco="resumir"]').click(); await esperar(10);
    const b = achar(alvo, '[data-foco="resumir"]');
    assert.match(b.textContent, /Refazer/);
    assert.match(b.getAttribute("title"), /usa 1 da cota/);
    const perguntas = [];
    d.ui.confirmar = async o => { perguntas.push(o); return false; };
    A.base.ia.cota.usadas = 95;
    b.click(); await esperar(10);
    assert.equal(perguntas.length, 1, "com 5 de 100 sobrando, confirma antes");
    assert.equal(pedidos, 1, "não confirmou: não gastou a cota");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (e) central */
const convDeColega = srv => { srv.convs[1].atribuida_a = "u2"; srv.convs[1].atribuida_nome = "Ana Paula"; for (const c of srv.convs) c.nao_lidas = 2; };

test("CB-007/CB-216/CB-093 (central) · «Marcar como lida» em lote pula a de colega, avisa e só grava quando o Desfazer fecha", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  convDeColega(srv);
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    botaoTexto(achar(c.alvo, ".cvl-lote"), /Marcar como lida/).click();
    await esperar(10);
    assert.ok(d.toasts.some(t => /1 conversa de colega ficou como estava/.test(t)), d.toasts.join(" | "));
    assert.equal(srv.conta("nx_cv_marcar_lida"), 0, "CB-093: nada vai ao servidor antes do aviso fechar");
    const o = d.desfazeres.at(-1);
    assert.match(o.texto, /^2 conversas marcadas como lidas/);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    const ids = srv.chamadas.filter(x => x[0] === "nx_cv_marcar_lida").map(x => x[1].p_conversa);
    assert.deepEqual(ids, [901, 903], "a da Ana ficou como estava");
  } finally { c.fim(); d.fim(); }
});

test("CB-007/CB-217 (central) · deslizar: a linha da colega não oferece «Marcar como lida»", async () => {
  const d = comDom({ grosso: true });
  const gestos = [];
  d.ui.deslizar = (el, o) => { gestos.push({ el, o }); return () => {}; };
  const srv = criarServidor({ conversas: 3 });
  convDeColega(srv);
  const c = await montarCentral(d, srv);
  try {
    const ult = id => gestos.filter(g => g.el.dataset.id === String(id)).at(-1);
    assert.equal(ult(901).el.dataset.gestoD, "Marcar como lida");
    assert.ok(!ult(902).el.dataset.gestoD, "linha da Ana sem o gesto");
    assert.equal(ult(902).o.direita, null);
  } finally { c.fim(); d.fim(); }
});

test("CB-018 (central) · lote que falha no meio: as que não foram voltam selecionadas", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  for (const cv of srv.convs) cv.nao_lidas = 1;
  const marcar = srv.handlers.nx_cv_marcar_lida;
  srv.handlers.nx_cv_marcar_lida = p => { if (p.p_conversa === 902) throw Object.assign(new Error("falhou"), { codigo: "erro_rede" }); return marcar(p); };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    botaoTexto(achar(c.alvo, ".cvl-lote"), /Marcar como lida/).click();
    await esperar(10);
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(20);
    assert.equal(achar(c.alvo, ".cvl-lote").hidden, false, "a seleção voltou");
    const marcadas = c.alvo.querySelectorAll('.cvl-item[aria-checked="true"]').map(x => Number(x.dataset.id));
    assert.deepEqual(marcadas.sort(), [902, 903]);
    assert.ok(d.toasts.some(t => /2 conversas ficaram sem marcar/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("CB-044 (central) · «Nova conversa»: número caído com «(desconectado)», o select começa no conectado e avisa ao escolher o caído", async () => {
  const d = comDom();
  const srv = criarServidor({ canais: [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true, estado: "desconectado" },
    { id: "k2", nome: "Vendas", provedor: "meta", status: "ativo", tem_token: true, estado: "conectado" }] });
  const c = await montarCentral(d, srv);
  try {
    let corpo = null;
    d.aoModal(o => { if (o.corpo && o.corpo.querySelector && o.corpo.querySelector("#cv-nv-canal")) corpo = o.corpo; return null; });
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(10);
    const sel = achar(corpo, "#cv-nv-canal");
    assert.deepEqual(sel.querySelectorAll("option").map(o => o.textContent), ["Recepção (desconectado)", "Vendas"]);
    assert.equal(sel.value, "k2", "começa no número que funciona");
    const aviso = achar(corpo, ".cv-nv-caido");
    assert.equal(aviso.hidden, true);
    sel.value = "k1"; d.ev(sel, "change");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /Recepção está desconectado/);
  } finally { c.fim(); d.fim(); }
});

test("CB-046/CB-239 (central) · «Ver mais» da Nova conversa não repete contato que já está na tela", async () => {
  const d = comDom();
  const srv = criarServidor();
  const pessoa = id => ({ id, nome: `Contato ${id}`, telefone: `55129999900${String(id).padStart(2, "0")}` });
  srv.handlers.nx_contatos_listar = p => (p.p_pagina === 1 ? { itens: [1, 2, 3, 4, 5, 6, 7, 8].map(pessoa), tem_mais: true } : { itens: [pessoa(8), pessoa(9)], tem_mais: false });
  const c = await montarCentral(d, srv);
  try {
    let corpo = null;
    d.aoModal(o => { if (o.corpo && o.corpo.querySelector && o.corpo.querySelector("#cv-nv-busca")) corpo = o.corpo; return null; });
    botaoTexto(c.alvo, /Nova conversa/).click();
    await esperar(10);
    const busca = achar(corpo, "#cv-nv-busca");
    busca.value = "Contato"; d.ev(busca, "input");
    await esperar(20);
    achar(corpo, ".cv-nv-mais").click();
    await esperar(20);
    const nomes = corpo.querySelectorAll(".cv-contato-op b").map(b => b.textContent);
    assert.equal(nomes.filter(n => n === "Contato 8").length, 1, "o 8 aparece uma vez só");
    assert.equal(nomes.length, 9);
  } finally { c.fim(); d.fim(); }
});

test("CB-116/CB-244 (central) · filtro lembrado com departamento e etiqueta que não existem mais: sai do filtro e avisa", async () => {
  const d = comDom();
  globalThis.localStorage.setItem("nx-cv-filtro:c1", JSON.stringify({ departamento_id: "d-apagado", etiquetas: ["e1", "e-apagada"] }));
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await esperar(20);
    assert.ok(d.toasts.some(t => /Um filtro guardado foi removido/.test(t)));
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("nx-cv-filtro:c1")), { etiquetas: ["e1"] });
    const ult = srv.chamadas.filter(x => x[0] === "nx_cv_listar").at(-1)[1].p_filtro;
    assert.equal(ult.departamento_id, undefined);
    assert.deepEqual(ult.etiquetas, ["e1"]);
  } finally { c.fim(); d.fim(); }
});

test("CB-050 (central) · «Mostrar quem escreveu» desligado: o aviso da tela bloqueada não leva o nome do paciente", async () => {
  const d = comDom();
  const N0 = globalThis.Notification;
  const avisos = [];
  class NotificacaoFalsa { constructor(t, o) { avisos.push({ t, o }); } addEventListener() {} close() {} }
  NotificacaoFalsa.permission = "granted";
  globalThis.Notification = NotificacaoFalsa; d.janela.Notification = NotificacaoFalsa;
  globalThis.localStorage.setItem("nx-cv-avisos", JSON.stringify({ som: false, tela: true, texto: false, quem: false }));
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    d.doc.hidden = true;
    srv.chegar(902, "minha dor de dente");
    await c.pulso();
    assert.ok(avisos.length >= 1, "avisou");
    assert.equal(avisos[0].t, "Mensagem nova na central");
    assert.doesNotMatch(JSON.stringify(avisos), /Cliente 2|dor de dente/);
  } finally { if (N0) globalThis.Notification = N0; else delete globalThis.Notification; c.fim(); d.fim(); }
});

test("CB-053 (central) · 25 arquivos enviados: os object URLs mais velhos são soltos (no máximo 20 presos)", async () => {
  const d = comDom();
  const srv = criarServidor();
  class XHROk { constructor() { this.upload = { addEventListener() {} }; this.ouv = {}; this.status = 0; } open() {} setRequestHeader() {}
    addEventListener(t, fn) { this.ouv[t] = fn; } send() { setTimeout(() => { this.status = 200; this.ouv.load(); }, 0); } abort() {} }
  Object.defineProperty(globalThis, "XMLHttpRequest", { value: XHROk, configurable: true, writable: true });
  const rev0 = URL.revokeObjectURL, criados = [], soltos = [];
  const cria0 = URL.createObjectURL;
  URL.createObjectURL = b => { const u = cria0.call(URL, b); criados.push(u); return u; };
  URL.revokeObjectURL = u => { soltos.push(u); return rev0.call(URL, u); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.aoModal(async () => true);
    const input = c.alvo.querySelector('input[type="file"]');
    for (let i = 0; i < 25; i++) {
      Object.defineProperty(input, "files", { value: [new File(["%PDF-1.4"], `doc-${i}.pdf`, { type: "application/pdf" })], configurable: true });
      d.ev(input, "change");
      await esperar(15);
    }
    for (let k = 0; k < 100 && srv.chamadas.filter(x => x[0] === "nx-enviar:midia").length < 25; k++) await esperar(10);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx-enviar:midia").length, 25);
    const presos = criados.filter(u => !soltos.includes(u));
    assert.ok(presos.length <= 20, `${presos.length} URLs presas`);
    assert.ok(soltos.length >= 5, "revokeObjectURL chamado para as mais velhas");
  } finally { URL.revokeObjectURL = rev0; URL.createObjectURL = cria0; c.fim(); d.fim(); }
});

test("CB-114 (central) · «Cancelar» na fila com o envio a caminho avisa (antes saía calado)", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.fns["nx-enviar"] = cc => { if (cc.acao === "lido") return { ok: true }; throw Object.assign(new Error("servidor"), { status: 503 }); };
  const c = await montarCentral(d, srv);
  const agora0 = Date.now;
  try {
    await c.abrir(901);
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "volto já"; d.ev(ta, "input"); d.ev(ta, "keydown", { key: "Enter" });
    await esperar(40);
    const cancelar = botaoTexto(achar(c.alvo, ".cv-fila"), /^Cancelar$/);   // voltou para a fila: «Cancelar» à vista
    let emVoo = 0;
    srv.fns["nx-enviar"] = cc => { if (cc.acao === "lido") return { ok: true }; emVoo++; return new Promise(() => {}); };   // a nova tentativa fica a caminho
    Date.now = () => agora0() + 200000;                                     // passaram os 90 s: o pulso manda de novo
    await c.pulso();
    assert.equal(emVoo, 1, "a nova tentativa saiu");
    cancelar.click();
    await esperar(10);
    assert.ok(d.toasts.some(t => /Já está saindo; se falhar, o texto volta para o campo/.test(t)), d.toasts.join(" | "));
  } finally { Date.now = agora0; c.fim(); d.fim(); }
});

test("CB-121 (central) · «Atender o próximo» lê a página seguinte quando as 50 primeiras são de colegas", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  const listar = srv.handlers.nx_cv_listar;
  srv.handlers.nx_cv_listar = p => {
    if (!(p.p_filtro && p.p_filtro.aba === "aguardando")) return listar(p);
    if (!p.p_antes) return { itens: Array.from({ length: 50 }, (_, i) => ({ id: 5000 + i, status: "aberta", aguardando: true, atribuida_a: "u2", ultima_entrada_em: agoraIso(500 - i) })), tem_mais: true };
    return { itens: [{ ...srv.convs[2], atribuida_a: null, aguardando: true, ultima_entrada_em: agoraIso(400) }], tem_mais: false };
  };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-atender").click();
    await esperar(60);
    const pags = srv.chamadas.filter(x => x[0] === "nx_cv_listar" && x[1].p_filtro.aba === "aguardando");
    assert.equal(pags.length, 2, "leu a 2ª página");
    assert.ok(pags[1][1].p_antes, "a 2ª página continua da última da 1ª");
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_ver" && x[1].p_id === 903), "abriu a sem dono da 2ª página");
    assert.ok(!d.toasts.some(t => /Ninguém/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("CB-125/CB-247 (central) · texto pronto (?texto=) numa conversa resolvida: copia e diz «Reabra»", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[0].status = "resolvida";
  const copias = [];
  d.ui.copiar = (t, o) => { copias.push([t, o]); return Promise.resolve(true); };
  const c = await montarCentral(d, srv, { rota: { partes: ["901"], query: { texto: "Sua consulta é amanhã às 9h" } } });
  try {
    await esperar(20);
    assert.ok(d.toasts.some(t => /Reabra o atendimento para enviar/.test(t)), d.toasts.join(" | "));
    assert.equal(copias[0][0], "Sua consulta é amanhã às 9h");
    assert.equal(achar(c.alvo, "textarea[aria-label=Mensagem]").value, "", "não ficou preso no campo desligado");
  } finally { c.fim(); d.fim(); }
});

test("CB-131/CB-248 (central) · a conversa não abre: a lateral sai do esqueleto («Sem detalhes»)", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.handlers.nx_cv_ver = () => { throw Object.assign(new Error("falhou"), { codigo: "erro_rede" }); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const lat = achar(c.alvo, ".cv-col-lat");
    assert.equal(lat.querySelector(".esqueleto"), null);
    assert.match(achar(lat, ".cvt-sem-detalhes").textContent, /Sem detalhes: a conversa não abriu/);
  } finally { c.fim(); d.fim(); }
});

/* ---------------------------------------------------------------- (f) cv-config */
test("CB-102/CB-099 (Números · Meta) · título «Passo 2 de 5 · …» anunciado; «App inscrito» sem ✓", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    let assist = null;
    const t = ctxNum(ui, {
      rpc: async (n, p) => (n === "nx_canais_listar" ? [] : n === "nx_cv_base" ? { departamentos: [] } : n === "nx_canal_salvar" ? { canal: { id: "m1", ...p.p_canal }, webhook: { modo: "plataforma" } } : {}),
      fn: async (n, c) => (c.acao === "inscrever_app" ? { app_inscrito: true } : { ok: true }),
      modal: o => {
        if (o.titulo === "Adicionar número de WhatsApp") { o.aoAbrir({ fechar() {} }); o.corpo.querySelector("[data-caminho=meta]").dispatchEvent(new d.Evento("click")); return null; }
        if (o.titulo === "Conectar número de WhatsApp") assist = o;
        return null;
      } });
    const anuncios = [];
    t.ctx.ui.anunciar = x => anuncios.push(x);
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    t.alvo.querySelector(".cfg-add-numero").dispatchEvent(new d.Evento("click")); await tique(6);
    assert.ok(assist, "abriu o assistente da Meta");
    const api = { el: d.doc.createElement("div"), fechar() {}, erro() {} };
    assist.aoAbrir(api);
    assert.equal(achar(assist.corpo, "h3").textContent, "Passo 1 de 5 · O que é preciso");
    await assist.acoes[1].fn(api);
    assert.equal(achar(assist.corpo, "h3").textContent, "Passo 2 de 5 · Dados do número");
    assert.ok(anuncios.includes("Passo 2 de 5 · Dados do número"), "a troca de passo é anunciada");
    const campo = (nome, v) => { assist.corpo.querySelector(`[name="${nome}"]`).value = v; };
    campo("nome", "Recepção"); campo("phone_number_id", "123456789"); campo("waba_id", "987654321"); campo("token", "EAAGteste");
    await assist.acoes[1].fn(api);
    assert.match(achar(assist.corpo, "h3").textContent, /^Passo 3 de 5/);
    await assist.acoes[1].fn(api);
    assert.match(achar(assist.corpo, "h3").textContent, /^Passo 4 de 5/);
    assist.corpo.querySelectorAll("button").find(b => /Inscrever o app/.test(b.textContent)).dispatchEvent(new d.Evento("click"));
    await tique(6);
    const pil = achar(assist.corpo, ".cfg-resultado .pilula");
    assert.match(pil.textContent, /App inscrito/);
    assert.doesNotMatch(pil.textContent, /✓/);
  } finally { if (sair) sair(); d.fim(); }
});

test("CB-137/CB-143/CB-105 (Departamentos) · «Copiar segunda» desligado com a segunda fechada; «Intervalo (almoço)»; tirar a faixa mantém o foco na linha", async () => {
  const d = comDomCfg();
  let sair = null;
  try {
    const ui = await import("../web/app/ui.js");
    const montar = CV.secoesConfig.find(s => s.id === "departamentos").montar;
    const dep = { id: "d1", nome: "Recepção", cor: "#6FA3CF", padrao: true, ativo: true, distribuicao: "rodizio", pessoas: 0,
      horario: { 0: [], 1: [], 2: [["08:00", "12:00"], ["13:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [], 5: [], 6: [] } };
    let modal = null;
    const t = ctxNum(ui, { rpc: async n => (n === "nx_cv_base" ? { config: { departamentos: [dep] }, usuarios: [] } : {}), modal: o => { modal = o; return null; } });
    const limpar = await montar(t.ctx, t.alvo); await tique(6);
    sair = typeof limpar === "function" ? limpar : null;
    t.alvo.querySelectorAll("button").find(b => /Editar/.test(b.textContent)).dispatchEvent(new d.Evento("click")); await tique(4);
    const f = modal.corpo;
    const copiar = f.querySelectorAll("button").find(b => /Copiar segunda/.test(b.textContent));
    assert.equal(copiar.disabled, true, "segunda fechada: não copia");
    assert.match(copiar.getAttribute("title"), /segunda está fechada/);
    const seg = f.querySelector('[data-dia="1"] input[type=checkbox]');
    seg.checked = true; seg.dispatchEvent(new d.Evento("change"));
    assert.equal(copiar.disabled, false, "marcou a segunda: libera");
    const bInt = f.querySelector('[data-dia="3"] .cfg-mais-faixa');
    assert.match(bInt.textContent, /Intervalo \(almoço\)/);
    assert.match(bInt.getAttribute("title"), /Divide o horário em duas faixas/);
    const x = f.querySelector('[data-dia="2"] [aria-label="Tirar o intervalo de Terça"]');
    x.focus(); x.dispatchEvent(new d.Evento("click"));
    const linha = f.querySelector('[data-dia="2"]');
    assert.ok(linha.contains(d.doc.activeElement) && d.doc.activeElement !== x, "o foco ficou na linha do dia");
    assert.ok(d.doc.activeElement.classList.contains("cfg-mais-faixa"));
  } finally { if (sair) sair(); d.fim(); }
});

test("CB-003/CB-205 (integrador) · assinatura pula pronome de tratamento como o nx-enviar; a página seguinte manda antes_id", async () => {
  const CV = await import("../web/app/cv-logica.js");
  const { primeiroNomeSemTratamento } = await import("../supabase/functions/_compartilhado/comum.js");
  for (const n of ["Dra. Helena Souza", "Dr Paulo", "Prof. Ana", "Helena", "Sra. Márcia Lima", ""]) assert.equal(CV.nomeAssinatura(n), primeiroNomeSemTratamento(n), n);
  assert.equal(CV.nomeAssinatura("Dra. Helena Souza"), "Helena");
  const src = readFileSync(new URL("../web/app/conversas.js", import.meta.url), "utf8");
  assert.match(src, /\{ \.\.\.filtro, antes_id: ultLinha\.id \}/);
});

/* ================================================================ revisão 1000b (achados da revisão adversarial) */
test("CB-132 (revisão 1000b) · toque duplo em «Modelos» durante a espera da base abre UM modal; o botão fica aria-busy e solta no fim", async () => {
  await comComposer({ base: { templates: [] } }, async ({ comp, A }, d) => {
    let soltar = null, pedidos = 0;
    A.acoes.baseFresca = () => (++pedidos === 1 ? new Promise(r => { soltar = r; }) : null);
    let modais = 0;
    d.aoModal(() => { modais++; return null; });
    const bt = achar(comp.el, '[aria-label="Enviar modelo aprovado"]');
    const p1 = comp.abrirModelos(), p2 = comp.abrirModelos();
    await esperar(0);
    assert.equal(bt.getAttribute("aria-busy"), "true", "esperando a base: aria-busy");
    soltar();
    await Promise.all([p1, p2]);
    assert.equal(modais, 1, "o 2º toque não abriu outro modal");
    assert.equal(bt.getAttribute("aria-busy"), null);
    await comp.abrirModelos();
    assert.equal(modais, 2, "a trava solta quando o modal fecha");
  });
});

test("CB-093 (revisão 1000b) · durante o «Desfazer» do lote o pulso não traz as não lidas de volta; o firmar vai por api.rpc com o cliente do clique", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  for (const cv of srv.convs) cv.nao_lidas = 2;
  const viaRpc = [];
  const rpc0 = srv.api.rpc;
  srv.api.rpc = async (n, p = {}, o = {}) => { viaRpc.push([n, p]); return rpc0(n, p, o); };
  const c = await montarCentral(d, srv);
  try {
    const naoLida = id => c.alvo.querySelector(`.cvl-item[data-id="${id}"]`).dataset.naoLida;
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    botaoTexto(achar(c.alvo, ".cvl-lote"), /Marcar como lida/).click();
    await esperar(10);
    assert.equal(naoLida(901), "0");
    const lidas0 = srv.conta("nx_cv_listar");
    await c.pulso();
    assert.ok(srv.conta("nx_cv_listar") > lidas0, "o pulso releu a lista");
    assert.equal(naoLida(901), "0", "o servidor ainda tem 2 não lidas, mas o Desfazer está aberto");
    assert.equal(naoLida(902), "0");
    assert.equal(naoLida(903), "1", "a que não foi marcada continua não lida");
    const cli0 = c.ctx.cliente;
    c.ctx.cliente = { id: "c9", nome: "Outra" };          // a empresa mudou depois do clique
    const o = d.desfazeres.at(-1);
    await o.firmar(); o._fim({ estado: "mantida" }); await esperar(10);
    c.ctx.cliente = cli0;
    const marcadas = viaRpc.filter(x => x[0] === "nx_cv_marcar_lida");
    assert.deepEqual(marcadas.map(x => [x[1].p_cliente, x[1].p_conversa]), [["c1", 901], ["c1", 902]], "api.rpc com o cliente do clique");
    srv.chegar(901, "de novo");
    await c.pulso();
    assert.equal(naoLida(901), "1", "firmado: a pendência saiu e a mensagem nova aparece");
  } finally { c.fim(); d.fim(); }
});

test("CB-018 (revisão 1000b) · a falha do lote chega depois: a seleção só volta se a aba/busca não mudou e não há outra seleção", async () => {
  const d = comDom();
  try {
    let soltar = null;
    const { A, lista } = await montarLista(d, { itens: [conv(1), conv(2), conv(3)], acoes: { lidaLote: () => new Promise(r => { soltar = r; }) } });
    const marcar = ids => { for (const id of ids) d.ev(lista.el.querySelector(`.cvl-item[data-id="${id}"]`), "click"); };
    const marcadas = () => lista.el.querySelectorAll('.cvl-item[aria-checked="true"]').map(x => Number(x.dataset.id)).sort();
    const loteLida = () => botaoTexto(achar(lista.el, ".cvl-lote"), /Marcar como lida/).click();
    // 1) trocou de aba
    achar(lista.el, ".cvl-sel-bt").click(); marcar([1, 2]); loteLida();
    A.aba = "sem_dono"; lista.render();
    soltar({ restantes: [2] }); await esperar(5);
    assert.equal(achar(lista.el, ".cvl-lote").hidden, true, "outra aba: a seleção não volta");
    A.aba = "minhas"; lista.render();
    // 2) começou outra seleção
    achar(lista.el, ".cvl-sel-bt").click(); marcar([1, 2]); loteLida();
    achar(lista.el, ".cvl-sel-bt").click(); marcar([3]);
    soltar({ restantes: [2] }); await esperar(5);
    assert.deepEqual(marcadas(), [3], "a seleção nova não foi atropelada");
    botaoTexto(achar(lista.el, ".cvl-lote"), /^Cancelar$/).click();
    // 3) nada mudou: volta como antes
    achar(lista.el, ".cvl-sel-bt").click(); marcar([1, 2]); loteLida();
    soltar({ restantes: [2] }); await esperar(5);
    assert.deepEqual(marcadas(), [2]);
  } finally { d.fim(); }
});

test("CB-038 (revisão 1000b) · «Salvar como resposta» troca só o PRIMEIRO nome de quem atende por {atendente}", () => {
  const g = L.generalizarResposta("Sou a Helena Souza. Qualquer coisa, chame a Helena.", { atendente: "Helena", atendente_nome: "Helena Souza" });
  assert.equal(g.texto, "Sou a {atendente} Souza. Qualquer coisa, chame a {atendente}.");
  assert.equal(g.trocas, 2);
  // com a variável preenchida pela colega, nada some nem fica pela metade de outra forma
  assert.equal(L.aplicarVariaveis(g.texto, { atendente: "Ana" }), "Sou a Ana Souza. Qualquer coisa, chame a Ana.");
});

test("CB-134 (revisão 1000b) · bolha de áudio que sai do DOM é «unobserve» no renderMensagens", async () => {
  const d = comDom();
  const IO0 = globalThis.IntersectionObserver;
  const soltas = [];
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve(el) { soltas.push(el); } disconnect() {} };
  try {
    const { chat, A } = await montarChat(d, { msgs: [audioMsg(1), audioMsg(2)] });
    const caixas = chat.el.querySelectorAll(".cv-audio");
    assert.equal(caixas.length, 2);
    A.msgs = [audioMsg(2)];
    chat.renderMensagens({ rolar: "manter" });
    assert.ok(soltas.includes(caixas[0]), "a que saiu deixou de ser vigiada");
    assert.equal(caixas[0]._media, null, "sem referência à mídia morta");
    const viva = achar(chat.el, ".cv-audio");
    assert.ok(viva.isConnected && !soltas.includes(viva), "a que está na tela continua vigiada");
  } finally { if (IO0) globalThis.IntersectionObserver = IO0; else delete globalThis.IntersectionObserver; d.fim(); }
});

test("CB-034 (revisão 1000b) · «Baixar» que falha avisa com um link de verdade (nada de window.open silencioso depois do await)", async () => {
  const d = comDom();
  const f0 = globalThis.fetch, o0 = globalThis.open;
  const abertos = [], avisos = [];
  try {
    const pdf = { id: 5, conversa_id: 9, direcao: "in", tipo: "documento", corpo: "", status: "recebida", midia: { path: "c1/in/orc.pdf", nome: "orc.pdf", mime: "application/pdf" }, criado_em: agoraIso(5), atualizado_em: agoraIso(5) };
    const { chat } = await montarChat(d, { msgs: [pdf] });
    const t0 = d.ui.toast;
    d.ui.toast = (t, o) => { const r = t0(t, o); avisos.push({ t, o, r }); return r; };
    globalThis.fetch = async () => { throw new Error("cors"); };
    globalThis.open = (u, alvo) => abertos.push([u, alvo]);
    achar(chat.el, ".cv-doc-baixar").click();
    await esperar(10);
    assert.deepEqual(abertos, [], "sem pop-up (o bloqueador engolia)");
    const av = avisos.at(-1);
    assert.match(av.t, /Não deu para baixar aqui: toque no link para abrir o arquivo/);
    const link = achar(av.r.el, "a");
    assert.equal(link.getAttribute("href"), "https://cdn.test/c1/in/orc.pdf");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.match(link.getAttribute("rel"), /noopener/);
  } finally { globalThis.fetch = f0; globalThis.open = o0; d.fim(); }
});
