/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026) · lote conv-1 · Conversas
   node --test testes/plano1000-conversas.teste.mjs
   (a) cv-logica.js: tratamento no {atendente}, vírgula órfã, horário (ordem e meia-noite), espera em minutos de atendimento,
       telefone com uma regra só, WhatsApp aninhado/blocos, datas, parâmetro de modelo, documento incomum, colagem, gravação
   (b) peças sobre o DOM mínimo do plano 100 (copiado abaixo): chat, composer, lista e lateral
   (c) a central inteira (conversas.js montar) com o servidor de mentira
   (d) fonte e CSS
   Cada teste falha no código de antes desta rodada (o id do item está no nome).
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

/* ============================================================ (a) lógica pura */
test("CA-002 · primeiroNome pula o pronome de tratamento: {atendente} de «Dra. Helena» é «Helena»", () => {
  assert.equal(L.primeiroNome("Dra. Helena Souza"), "Helena");
  assert.equal(L.primeiroNome("Dr Paulo"), "Paulo");
  assert.equal(L.primeiroNome("sra. ângela dias"), "Ângela");
  assert.equal(L.primeiroNome("Dra."), "Dra.", "só o título: devolve o que há");
  assert.equal(L.primeiroNome("maria souza"), "Maria", "sem título nada muda");
  assert.equal(L.aplicarVariaveis("Aqui é {atendente}, da {empresa}", { atendente: L.primeiroNome("Dra. Helena Souza"), empresa: "Clínica" }), "Aqui é Helena, da Clínica");
});

test("CA-020 · variável vazia no começo leva a vírgula DEPOIS e a frase começa em maiúscula (aplicarVariaveis e partesVariaveis iguais)", () => {
  assert.equal(L.aplicarVariaveis("{primeiro_nome}, tudo bem?", {}), "Tudo bem?");
  assert.equal(L.aplicarVariaveis("Oi!\n{primeiro_nome}, tudo bem?", {}), "Oi!\nTudo bem?");
  assert.equal(L.aplicarVariaveis("Olá, {primeiro_nome}!", { nome: "" }), "Olá!", "a regra de antes continua");
  assert.equal(L.aplicarVariaveis("{primeiro_nome}, tudo bem?", { nome: "ana" }), "Ana, tudo bem?");
  for (const corpo of ["{primeiro_nome}, tudo bem?", "Oi!\n{primeiro_nome}, tudo bem?", "{nome} {primeiro_nome} oi", "Olá, {primeiro_nome}! Aqui é {atendente}."]) {
    assert.equal(L.partesVariaveis(corpo, {}).map(p => p.t).join(""), L.aplicarVariaveis(corpo, {}), corpo);
  }
});

test("CA-021 · validarHorario: faixas fora de ordem não são «sobreposição» e voltam ordenadas", () => {
  const r = L.validarHorario({ 1: [["14:00", "18:00"], ["08:00", "12:00"]] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.horario[1], [["08:00", "12:00"], ["14:00", "18:00"]]);
  assert.equal(L.validarHorario({ 1: [["14:00", "18:00"], ["08:00", "15:00"]] }).ok, false, "sobreposição de verdade continua recusada");
});

test("AS-145 · faixa que passa da meia-noite: horarioAberto lê como o nx_horario_aberto (S-B4); salvar só com meiaNoite (o normalizar do servidor ainda recusa)", () => {
  const plantao = { 1: [["22:00", "02:00"]] };
  assert.equal(L.horarioAberto(plantao, "2026-10-13T01:00:00-03:00"), true, "terça 01:00 ainda é o plantão de segunda");
  assert.equal(L.horarioAberto(plantao, "2026-10-12T23:00:00-03:00"), true, "segunda 23:00");
  assert.equal(L.horarioAberto(plantao, "2026-10-13T03:00:00-03:00"), false);
  assert.equal(L.horarioAberto(plantao, "2026-10-12T21:59:00-03:00"), false);
  assert.equal(L.validarHorario(plantao, { meiaNoite: true }).ok, true);
  const sem = L.validarHorario(plantao);
  assert.equal(sem.ok, false);
  assert.match(sem.erro.texto, /passa da meia-noite ainda não pode ser salva/);
});

test("CA-024 · telefoneDigitado: uma regra só — a busca da «Nova conversa» e o campo concordam", () => {
  for (const t of ["20 99999 8888", "(12) 99777-3031", "012 99777-3031", "+1 415 555 1234", "12 8777-30311", "1299777", "14155551234"]) {
    const r = L.telefoneDigitado(t);
    assert.equal(!!r.numero, !L.erroTelefone(t), t);
    assert.equal(L.normalizarTelefone(t), r.numero, t);
  }
  assert.equal(L.normalizarTelefone("20 99999 8888"), null, "DDD 20 não existe (antes virava 552099999888)");
  assert.equal(L.normalizarTelefone("012 99777-3031"), "5512997773031", "zero de tronco sai");
});

test("CA-022/CA-023 · formatarWhats: link dentro do negrito; `código`; blocosWhats: citação e listas", () => {
  const [seg] = L.formatarWhats("*veja https://x.com*");
  assert.equal(seg.tipo, "negrito");
  assert.deepEqual(seg.partes, [{ tipo: "texto", v: "veja " }, { tipo: "link", v: "https://x.com" }]);
  assert.deepEqual(L.formatarWhats("use `npm i` já").map(x => x.tipo), ["texto", "mono", "texto"]);
  assert.deepEqual(L.formatarWhats("Oi *Ana*"), [{ tipo: "texto", v: "Oi " }, { tipo: "negrito", v: "Ana" }], "sem aninhar: igual a antes");
  assert.deepEqual(L.blocosWhats("Itens:\n- a\n- b\n> veja\n1. um\n2. dois"), [
    { tipo: "p", texto: "Itens:" }, { tipo: "lista", ordenada: false, itens: ["a", "b"] }, { tipo: "citacao", texto: "veja" },
    { tipo: "lista", ordenada: true, itens: ["um", "dois"] }]);
  assert.deepEqual(L.blocosWhats("só texto\nem duas linhas"), [{ tipo: "p", texto: "só texto\nem duas linhas" }]);
});

test("CA-052 · minutosUteis: sábado 20h → segunda 9h15 com seg–sex 8–18 = 75 min; sem horário, minutos corridos", () => {
  const seg = Object.fromEntries([1, 2, 3, 4, 5].map(d => [d, [["08:00", "18:00"]]]));
  assert.equal(L.minutosUteis("2026-10-10T20:00:00-03:00", "2026-10-12T09:15:00-03:00", seg), 75);
  assert.equal(L.minutosUteis("2026-10-10T20:00:00-03:00", "2026-10-12T09:15:00-03:00", null), 37 * 60 + 15);
  assert.equal(L.minutosUteis("2026-10-12T23:00:00-03:00", "2026-10-13T01:00:00-03:00", { 1: [["22:00", "02:00"]] }), 120, "faixa da madrugada");
  const n = L.nivelEsperaUtil("2026-10-10T20:00:00-03:00", "2026-10-12T09:15:00-03:00", seg);
  assert.deepEqual([n.minutos, n.nivel, n.uteis, n.chegouFechado], [75, "critico", true, true]);
  assert.equal(L.nivelEsperaUtil("2026-10-12T09:00:00-03:00", "2026-10-12T09:20:00-03:00", seg).nivel, "aten");
  assert.equal(L.textoMinutos(75), "1 h 15 min");
});

test("CA-007/CA-033/CA-036 · desdeTexto sem maiúscula no meio, data por extenso e hora digitada lida em São Paulo", () => {
  const agora = new Date("2026-10-13T15:00:00-03:00");
  assert.equal(L.desdeTexto("2026-10-13T14:02:00-03:00", agora), "desde 14:02");
  assert.equal(L.desdeTexto("2026-10-12T14:02:00-03:00", agora), "desde ontem às 14:02");
  assert.equal(L.desdeTexto("2026-09-25T14:02:00-03:00", agora), "desde 25/09 às 14:02");
  assert.match(L.dataLonga("2026-10-08T17:05:00Z"), /^qui\.?, 8 de out\.? de 2026 às 14:05$/);
  assert.equal(L.isoDeSP("2026-10-13T14:00"), "2026-10-13T17:00:00.000Z", "14:00 em SP é 17:00Z, qualquer que seja o fuso do aparelho");
  assert.equal(L.isoDeSP(""), null);
});

test("CA-027/CA-119/CA-011/CA-010/CA-026/CA-227 · regras do parâmetro, documento incomum, colagem, etiqueta igual, departamento e pausa da IA", () => {
  assert.match(L.erroParametroModelo("a     b", 2), /\{\{2\}\} não pode ter quebra de linha, tab nem mais de 4 espaços/);
  assert.match(L.erroParametroModelo("a\tb", 1), /tab/);
  assert.equal(L.erroParametroModelo("a    b", 1), "", "4 espaços a Meta aceita");
  assert.equal(L.corrigirParametroModelo(" a \n\n b     c "), "a b c");
  assert.equal(L.documentoIncomum("app.apk"), true);
  assert.equal(L.documentoIncomum("pagina.html"), true);
  assert.equal(L.documentoIncomum("orcamento.pdf"), false);
  assert.equal(L.documentoIncomum("", "application/pdf"), false);
  assert.match(L.avisoColagem({ colado: 5000, atual: 0, teto: 4088 }), /tinha 5\.000 caracteres e só cabem 4\.088/);
  assert.equal(L.avisoColagem({ colado: 10, atual: 0, teto: 4096 }), "");
  const etqs = [{ id: "e1", nome: "Urgente" }];
  assert.equal(L.etiquetaIgual(etqs, "urgênte ").id, "e1");
  assert.equal(L.etiquetaIgual(etqs, "Retorno"), null);
  assert.equal(L.atendeDepartamento({ papel: "atendente", departamentos: ["dA"] }, "dB"), false);
  assert.equal(L.atendeDepartamento({ papel: "atendente", departamentos: [] }, "dB"), true, "sem departamentos = todos");
  assert.equal(L.atendeDepartamento({ papel: "admin", departamentos: ["dA"] }, "dB"), true);
  assert.equal(L.horasAteAmanha8(new Date("2026-10-13T20:00:00-03:00")), 12);
  // plano 1000b: CB-086 — antes das 8h o alvo é hoje às 8h (07:30 → 1 h, não 25)
  assert.equal(L.horasAteAmanha8(new Date("2026-10-13T07:30:00-03:00")), 1);
});

test("CA-029/CA-030 · gravação até 5 min com aviso aos 4:30; microfone mudo depois de 3 s de silêncio", () => {
  assert.equal(L.GRAVACAO_MAX_S, 300);
  assert.equal(L.GRAVACAO_AVISO_S, 270);
  assert.equal(L.textoLimiteGravacao(), "até 5 minutos");
  const silencio = [0, 1000, 2000, 3000].map(t => ({ t, nivel: 0.001 }));
  assert.equal(L.microfoneMudo(silencio), true);
  assert.equal(L.microfoneMudo(silencio.slice(0, 2)), false, "antes de 3 s não dá para saber");
  assert.equal(L.microfoneMudo([...silencio.slice(0, 3), { t: 3000, nivel: 0.2 }]), false, "alguém falou");
});

test("CA-043/CA-050/CA-059 · textos da lista e das respostas rápidas", () => {
  assert.equal(L.textoMetaLista("Avaliação", [{ nome: "Urgente" }, { nome: "VIP" }]), "Avaliação · Urgente +1");
  assert.equal(L.textoMetaLista(null, [{ nome: "VIP" }]), "VIP");
  assert.equal(L.textoMetaLista(null, []), "");
  assert.equal(L.textoCarregarMais(340, 50), "Carregar mais (faltam 290)");
  assert.equal(L.textoCarregarMais(undefined, 50), "Carregar mais");
  assert.equal(L.textoContagemRespostas(30, 45), "30 de 45 · continue digitando para achar as outras");
  assert.equal(L.textoContagemRespostas(23, 23), "");
});

/* ============================================================ (b) chat */
test("CA-006 (DOM) · abrir a conversa não despeja o histórico no leitor de tela: aria-busy durante o desenho e uma frase curta", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5), txt(2, "out", 4)], conv: { nao_lidas: 3 } });
    const log = achar(chat.el, ".cvc-msgs");
    assert.equal(log.getAttribute("aria-busy"), "false", "depois do 1º quadro a região volta a falar (só o delta)");
    chat.mostrarCarregando();
    assert.equal(log.getAttribute("aria-busy"), "true");
    chat.renderTudo({ rolar: "fim" });
    assert.equal(log.getAttribute("aria-busy"), "true", "o desenho inicial não é «adição»");
    await esperar(5);
    assert.equal(log.getAttribute("aria-busy"), "false");
    assert.match(d.anuncios.at(-1), /^Conversa com Mariana Costa, 3 mensagens novas\.$/);
  } finally { d.fim(); }
});

test("CA-009 (DOM) · citação de mensagem que não está na tela pede irParaMensagem (carrega as anteriores); a que está, destaca", async () => {
  const d = comDom();
  try {
    const pedidos = [];
    const resp = txt(3, "out", 1, { responde_a: { id: 10, direcao: "in", resumo: "antiga" } });
    const resp2 = txt(4, "out", 1, { responde_a: { id: 1, direcao: "in", resumo: "msg 1" } });
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 5), resp, resp2], acoes: { irParaMensagem: id => { pedidos.push(id); return Promise.resolve(); } } });
    achar(chat.el, '.cv-msg[data-id="3"] .cv-cita').click();
    assert.deepEqual(pedidos, [10]);
    assert.deepEqual(d.toasts, [], "antes: só «role para cima»");
    achar(chat.el, '.cv-msg[data-id="4"] .cv-cita').click();
    assert.deepEqual(pedidos, [10], "a citada já está na tela: só destaca");
    assert.equal(achar(chat.el, '.cv-msg[data-id="1"]').dataset.destaque, "1");
  } finally { d.fim(); }
});

test("CA-012 (DOM) · soltar 3 arquivos avisa que só o 1º vai agora", async () => {
  const d = comDom();
  try {
    const anexos = [];
    const { chat, A } = await montarChat(d);
    A.composer.anexar = f => anexos.push(f.name);
    const arqs = ["a.pdf", "b.pdf", "c.pdf"].map(n => new File(["x"], n, { type: "application/pdf" }));
    const corpo = achar(chat.el, ".cvc-corpo");
    d.ev(corpo, "drop", { dataTransfer: { types: ["Files"], files: arqs } });
    assert.deepEqual(anexos, ["a.pdf"]);
    assert.match(d.toasts.at(-1), /3 arquivos soltos: enviando o primeiro \(a\.pdf\)/);
  } finally { d.fim(); }
});

test("CA-034/CA-033/CA-022/CA-023/CA-119 (DOM) · reação com nome, hora com a data por extenso, link no negrito, lista e documento incomum", async () => {
  const d = comDom();
  try {
    const msgs = [
      txt(1, "in", 5, { reacao: "👍", corpo: "*veja https://x.com*" }),
      txt(2, "in", 4, { corpo: "Itens:\n- limpeza\n- clareamento\n> pode ser sexta?" }),
      { id: 3, conversa_id: 9, direcao: "in", tipo: "documento", corpo: "", midia: { path: "c1/in/app.apk", nome: "app.apk", tamanho: 1000 }, status: "recebida", criado_em: agoraIso(3), atualizado_em: agoraIso(3) },
      { id: 4, conversa_id: 9, direcao: "in", tipo: "documento", corpo: "", midia: { path: "c1/in/orc.pdf", nome: "orc.pdf", tamanho: 1000 }, status: "recebida", criado_em: agoraIso(2), atualizado_em: agoraIso(2) },
    ];
    const { chat } = await montarChat(d, { msgs });
    const r = achar(chat.el, '.cv-msg[data-id="1"] .cv-reacao');
    assert.equal(r.getAttribute("role"), "img");
    assert.equal(r.getAttribute("aria-label"), "Reação do cliente: 👍");
    assert.equal(achar(chat.el, '.cv-msg[data-id="1"] .cv-texto strong a').getAttribute("href"), "https://x.com");
    assert.match(achar(chat.el, '.cv-msg[data-id="1"] time').title, /\d{4} às \d\d:\d\d$/);
    const b2 = achar(chat.el, '.cv-msg[data-id="2"] .cv-texto');
    assert.equal(b2.querySelectorAll("ul.cv-lista li").length, 2);
    assert.equal(achar(b2, "blockquote.cv-citacao").textContent, "pode ser sexta?");
    const apk = achar(chat.el, '.cv-msg[data-id="3"] a.cv-doc');
    assert.equal(apk.getAttribute("target"), null, "tipo incomum não abre direto numa aba");
    assert.equal(apk.getAttribute("download"), "app.apk");
    assert.match(achar(chat.el, '.cv-msg[data-id="3"] .cv-doc-aviso').textContent, /Arquivo \.apk \(instalador de aplicativo\) — baixe só se confia no remetente/);   // plano 2000d: DC-245 diz o tipo
    assert.equal(achar(chat.el, '.cv-msg[data-id="4"] a.cv-doc').getAttribute("target"), "_blank", "PDF continua abrindo");
  } finally { d.fim(); }
});

test("CA-042/CA-227 (DOM) · IA atendendo conversa que já é minha: «Pausar IA e responder»; ⋮ pausa por 1 h, até amanhã 8h ou até devolver", async () => {
  const d = comDom();
  try {
    const pausas = [];
    const ia = { disponivel: true, ia_ligada: true, pausada: false };
    const { chat, A } = await montarChat(d, { provedor: "codewords", ia, conv: { atribuida_a: "u1", atribuida_nome: "Helena" },
      acoes: { assumirIA: (b, o) => pausas.push(o ? o.horas : "padrao") } });
    assert.match(achar(chat.el, ".cvc-ia-acao").textContent, /Pausar IA e responder/);
    achar(chat.el, ".cvc-mais").click();
    const itens = d.menus.at(-1).itens.filter(x => x && x.rotulo);
    itens.find(x => x.rotulo === "Pausar a IA por 1 hora").fn();
    itens.find(x => x.rotulo === "Pausar a IA até eu devolver").fn();
    itens.find(x => /^Pausar a IA até (amanhã às|as) 8h$/.test(x.rotulo)).fn();   // plano 1000b: CB-086 — de madrugada o rótulo é «até as 8h»
    assert.equal(pausas[0], 1);
    assert.equal(pausas[1], 0, "0 = até alguém devolver (o servidor grava «infinity»)");
    assert.ok(pausas[2] >= 1 && pausas[2] <= 168);
    A.ver.conversa = { ...A.ver.conversa, atribuida_a: "u2", atribuida_nome: "Ana" };
    chat.renderCabecalho();
    assert.match(achar(chat.el, ".cvc-ia-acao").textContent, /Assumir \(pausa a IA\)/);
  } finally { d.fim(); }
});

test("CA-095 (DOM) · 2.000 bolhas: o delta põe a nova no fim sem refazer as outras (e sem a checagem quadrática)", async () => {
  const d = comDom();
  try {
    const msgs = Array.from({ length: 2000 }, (_, i) => txt(i + 1, i % 2 ? "out" : "in", 3000 - i));
    const { chat, A } = await montarChat(d, { msgs });
    const antes = achar(chat.el, '.cv-msg[data-id="1500"]');
    A.msgs = [...msgs, txt(2001, "in", 0)];
    const t0 = performance.now();
    chat.renderMensagens({ rolar: "novas" });
    const ms = performance.now() - t0;
    assert.equal(chat.el.querySelector('.cv-msg[data-id="1500"]'), antes, "a bolha antiga é a mesma");
    const todas = chat.el.querySelectorAll(".cv-msg");
    assert.equal(todas.at(-1).dataset.id, "2001");
    assert.ok(ms < 5000, `render lento demais: ${ms} ms`);
    assert.doesNotMatch(ler("cv-chat.js"), /ordem\.includes\(/);
  } finally { d.fim(); }
});

test("CA-137 (DOM) · a página anterior só é pedida quando a pessoa rola PARA CIMA, e no máximo uma a cada 150 ms", async () => {
  const d = comDom();
  try {
    let pedidos = 0;
    const { chat, A } = await montarChat(d, { msgs: [txt(1, "in", 5)], acoes: { carregarAntes() { pedidos++; } } });
    A.temMaisAntes = true;
    const log = achar(chat.el, ".cvc-msgs");
    log.scrollTop = 100; d.ev(log, "scroll");
    assert.equal(pedidos, 0, "descer (ou o ajuste da rolagem) não pede página");
    log.scrollTop = 50; d.ev(log, "scroll");
    assert.equal(pedidos, 1);
    log.scrollTop = 40; d.ev(log, "scroll");
    assert.equal(pedidos, 1, "1 rolagem → 1 página (antes: duas seguidas)");
    await esperar(170);
    log.scrollTop = 30; d.ev(log, "scroll");
    assert.equal(pedidos, 2);
  } finally { d.fim(); }
});

test("CA-239 (DOM) · contato removido (sem id): a ficha não abre gaveta de erro — botão desligado com o motivo", async () => {
  const d = comDom();
  try {
    const abertas = [];
    const { chat, A } = await montarChat(d);
    A.ctx.abrirContato = id => abertas.push(id);
    A.ver.contato = { nome: "Ex-cliente" };
    chat.renderCabecalho();
    const quem = achar(chat.el, ".cvc-quem");
    assert.equal(quem.disabled, true);
    assert.match(quem.title, /Contato removido/);
    quem.click();
    assert.deepEqual(abertas, []);
    d.fim();
    const d2 = comDom();
    try {
      const t = await montarLateral(d2, { ver: { contato: { nome: "Ex-cliente" } } });
      const b = achar(t.alvo, '[data-foco="abrir-ficha"]');
      assert.equal(b.disabled, true);
      assert.match(b.textContent, /Contato removido/);
    } finally { d2.fim(); }
  } finally { try { d.fim(); } catch { /* já restaurado */ } }
});

test("CA-017/CA-018 (DOM) · no toque: sem tooltip de atalho nos botões do cabeçalho e sem «Atalhos de teclado» no ⋮", async () => {
  const d = comDom({ grosso: true });
  try {
    const dicas = [];
    d.ui.dica = (b, t) => dicas.push(t);
    const { chat } = await montarChat(d);
    assert.deepEqual(dicas, [], "a dica ficava presa por cima do menu no toque");
    assert.equal(chat.el.querySelector(".cv-kbd"), null);
    achar(chat.el, ".cvc-mais").click();
    // plano 1000 · CA-111 (conv-2): no toque o ⋮ abre a folha de baixo (não mais o ui.menu) — e ela também não tem «Atalhos de teclado»
    const folha = achar(d.doc.body, "dialog.cv-folha");
    assert.equal(folha.querySelectorAll(".cv-folha-item").some(b => /Atalhos de teclado/.test(b.textContent)), false);
  } finally { d.fim(); }
  const d2 = comDom();
  try {
    const dicas = [];
    d2.ui.dica = (b, t) => dicas.push(t);
    const { chat } = await montarChat(d2);
    assert.ok(dicas.length > 0, "no computador a dica continua");
    achar(chat.el, ".cvc-mais").click();
    assert.equal(d2.menus.at(-1).itens.some(x => x && x.rotulo === "Atalhos de teclado"), true);
  } finally { d2.fim(); }
});

test("CA-008 (DOM) · «Devolver para a fila» do ⋮ vai pelo caminho com Desfazer (nada de nx_cv_atribuir direto)", async () => {
  const d = comDom();
  try {
    const devolvidas = [];
    let direto = 0;
    const { chat, A } = await montarChat(d, { conv: { atribuida_a: "u2", atribuida_nome: "Ana" }, acoes: { devolverFila: c => devolvidas.push(c.id) } });
    A.api = { rpcC: async () => { direto++; return {}; } };
    achar(chat.el, ".cvc-mais").click();
    d.menus.at(-1).itens.find(x => x && x.rotulo === "Devolver para a fila").fn();
    assert.deepEqual(devolvidas, [9]);
    assert.equal(direto, 0);
  } finally { d.fim(); }
});

/* ============================================================ (b) composer */
test("CA-004 (DOM) · IA não configurada: «Sugerir com IA» some (botão e menu «+»); cota gasta: desligado com o motivo", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d, { base: { ia: { ligada: false, cota: { usadas: 0, limite: 100 } } } });
    // plano 1500c: o title agora diz quanto resta da cota (CC-307) — o botão é achado pelo nome acessível
    const bt = achar(t.comp.el, '.cvx-ferr button[aria-label="Sugerir resposta com IA"]');
    assert.equal(bt.hidden, true, "antes: aparecia e só dava «A IA não está disponível agora»");
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    assert.equal(d.menus.at(-1).itens.some(x => /Sugerir com IA/.test(x.rotulo)), false);
    t.A.base.ia = { ligada: true, cota: { usadas: 100, limite: 100 } };
    t.comp.atualizar();
    assert.equal(bt.hidden, false);
    assert.equal(bt.disabled, true);
    assert.equal(bt.title, "A cota de IA do mês acabou");
    t.A.base.ia = { ligada: true, cota: { usadas: 1, limite: 100 } };
    t.comp.atualizar();
    assert.equal(bt.disabled, false);
  } finally { d.fim(); }
});

test("CA-011/CA-013 (DOM) · colar texto longo avisa os números; colar um PDF copiado anexa", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    d.ev(t.ta, "paste", { clipboardData: { items: [], getData: () => "x".repeat(5000) } });
    assert.match(d.toasts.at(-1), /O texto colado tinha 5\.000 caracteres e só cabem 4\.096/);
    let modal = null;
    d.aoModal(async o => { modal = o; return false; });
    const pdf = new File(["%PDF-1.4"], "orcamento.pdf", { type: "application/pdf" });
    const ev = d.ev(t.ta, "paste", { clipboardData: { items: [{ kind: "file", type: "application/pdf", getAsFile: () => pdf }] } });
    await esperar(10);
    assert.equal(ev, false, "a colagem do arquivo não vira texto no campo");
    assert.ok(modal, "o PDF abre o modal de anexo (antes: nada acontecia)");
    assert.match(modal.titulo, /Enviar arquivo para/);
  } finally { d.fim(); }
});

test("CA-019/CA-059/CA-002 (DOM) · respostas rápidas: passar o mouse não refaz a lista; até 30 opções com contador; {atendente} sem o «Dra.»", async () => {
  const d = comDom();
  try {
    const respostas = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, atalho: `r${String(i).padStart(2, "0")}`, titulo: `Resposta ${i}`, corpo: i === 0 ? "Aqui é {atendente}" : `texto ${i}`, ativo: true }));
    const t = await montarComposer(d, { base: { respostas }, eu: { id: "u1", nome: "Dra. Helena Souza" } });
    achar(t.comp.el, ".cvx-rr-bt").click();
    const ops = t.comp.el.querySelectorAll(".cvx-rr-op");
    assert.equal(ops.length, 23, "antes: só 8");
    assert.match(achar(t.comp.el, ".cvx-rr-cab").textContent, /· 23/);
    assert.match(ops[0].textContent, /Aqui é Helena/);
    d.ev(ops[1], "mouseenter");
    const depois = t.comp.el.querySelectorAll(".cvx-rr-op");
    assert.equal(depois[1], ops[1], "o mesmo nó (antes a lista inteira era refeita a cada passada)");
    assert.equal(ops[1].getAttribute("aria-selected"), "true");
    assert.equal(ops[0].getAttribute("aria-selected"), "false");
    t.A.base.respostas = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, atalho: `s${i}`, titulo: `S ${i}`, corpo: "x", ativo: true }));
    achar(t.comp.el, ".cvx-rr-bt").click(); achar(t.comp.el, ".cvx-rr-bt").click();
    assert.equal(t.comp.el.querySelectorAll(".cvx-rr-op").length, 30);
    assert.match(achar(t.comp.el, ".cvx-rr-cab").textContent, /30 de 35 · continue digitando/);
  } finally { d.fim(); }
});

test("CA-058/CA-028/CA-027/CA-069 (DOM) · modelos: radiogroup, parâmetro vazio com «Usar nome», parâmetro com espaços recusado antes do envio e busca", async () => {
  const d = comDom();
  try {
    const templates = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, canal_id: "k1", nome: `modelo_${i}`, status: "APPROVED", categoria: i === 9 ? "MARKETING" : "UTILITY", corpo: `Sua consulta é dia {{1}} (${i})`, num_parametros: 1, idioma: "pt_BR" }));
    const t = await montarComposer(d, { base: { templates }, contato: { optin_marketing: false } });
    const erros = [];
    d.aoModal(async o => {
      const corpo = o.corpo;
      const grupo = achar(corpo, ".cv-modelos");
      assert.equal(grupo.getAttribute("role"), "radiogroup");
      const ops = corpo.querySelectorAll(".cv-modelo");
      assert.equal(ops[0].getAttribute("role"), "radio");
      const mkt = ops.find(b => b.dataset.categoria === "MARKETING");
      assert.equal(mkt.getAttribute("aria-disabled"), "true");
      assert.ok(achar(corpo, `#${mkt.getAttribute("aria-describedby")}`).textContent.includes("não receber marketing"), "o motivo é lido");
      ops[0].click();
      assert.equal(ops[0].getAttribute("aria-checked"), "true");
      assert.equal(ops[1].getAttribute("aria-checked"), "false");
      const inp = achar(corpo, "#cvx-par-1");
      assert.equal(inp.value, "", "o {{1}} não vem com o nome (pode ser a data)");
      achar(corpo, ".cvx-par-nome").click();
      assert.equal(inp.value, "Maria");
      inp.value = "13/10     às 14h"; d.ev(inp, "input");
      assert.equal(o.acoes[1].fn({ erro: e => erros.push(e) }), false);
      achar(corpo, ".cvx-par-corrigir").click();
      assert.equal(inp.value, "13/10 às 14h");
      const busca = achar(corpo, ".cvx-mod-busca");
      busca.value = "modelo_3"; d.ev(busca, "input");
      assert.equal(ops.filter(b => !b.hidden).length, 1);
      return null;
    });
    await t.comp.abrirModelos();
    assert.match(erros.join(" "), /não pode ter quebra de linha, tab nem mais de 4 espaços seguidos/);
    assert.deepEqual(t.enviados, [], "nada foi para a Meta");
  } finally { d.fim(); }
});

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

test("CA-031 (DOM) · sair de Conversas no meio da gravação descarta o áudio com aviso (nunca calado)", async () => {
  const d = comDom();
  try {
    await comGravador(async reg => {
      const t = await montarComposer(d);
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      assert.equal(reg.gravadores[0].state, "recording");
      assert.equal(t.comp.gravando, true);
      t.comp.desmontar();
      assert.equal(reg.gravadores[0].state, "inactive");
      assert.match(d.toasts.join("\n"), /Gravação descartada: você saiu de Conversas\. Nada foi enviado\./);
    });
  } finally { d.fim(); }
});

test("CA-029/CA-030 (DOM) · gravação vai até 5 min (aviso aos 4:30) e avisa quando o microfone não capta nada", async () => {
  const d = comDom();
  try {
    await comGravador(async () => {
      const real = Date.now;
      let agora = real();
      Date.now = () => agora;
      const t = await montarComposer(d);
      d.aoModal(async () => false);
      achar(t.comp.el, ".cvx-audio").click();
      await esperar(10);
      for (let i = 0; i < 4; i++) { agora += 1000; await esperar(300); }
      assert.equal(achar(t.comp.el, ".cvx-rec-mudo").hidden, false, "3 s de silêncio: «Não estamos ouvindo nada»");
      agora += 62000; await esperar(300);
      assert.equal(achar(t.comp.el, ".cvx-gravacao").hidden, false, "passou de 1 minuto e continua gravando (antes: parava)");
      agora += 210000; await esperar(300);
      assert.match(achar(t.comp.el, ".cvx-rec-fim").textContent, /Faltam 30 s/);
      agora += 31000; await esperar(300);
      assert.match(d.toasts.join("\n"), /Limite de 5 minutos atingido/);
      await esperar(20);
    });
  } finally { d.fim(); }
});

test("CA-062/CA-067/CA-068 (DOM) · «Outra sugestão» troca a sugestão; emoji entra no cursor; «Ctrl+Enter envia» deixa o Enter quebrar a linha", async () => {
  const d = comDom();
  try {
    let quebra = false;
    const t = await montarComposer(d, { acoes: { enterQuebra: () => quebra } });
    const textos = ["Primeira sugestão", "Segunda sugestão"];
    let pedidos = 0;
    t.aoIA(async () => ({ texto: textos[pedidos++] }));
    achar(t.comp.el, '[aria-label="Sugerir resposta com IA"]').click();
    await esperar(5);
    assert.equal(t.ta.value, "Primeira sugestão");
    achar(t.comp.el, ".cvx-ia-outra").click();
    await esperar(5);
    assert.equal(pedidos, 2);
    assert.equal(t.ta.value, "Segunda sugestão", "troca, não acrescenta embaixo");
    // emoji
    let conteudo = null;
    d.ui.flutuante = (anc, c) => { conteudo = c; return { fechar() {} }; };
    t.digitar("Oi ");
    t.ta.setSelectionRange(3, 3);
    achar(t.comp.el, ".cvx-emoji-bt").click();
    achar(conteudo, ".cvx-emoji").click();
    assert.equal(t.ta.value, `Oi ${L.EMOJIS_RAPIDOS[0]}`);
    // Enter x Ctrl+Enter
    quebra = true; t.comp.atualizar();
    assert.match(achar(t.comp.el, ".cvx-dica").textContent, /Ctrl\+Enter envia/);
    t.digitar("linha 1");
    d.ev(t.ta, "keydown", { key: "Enter" });
    await esperar(5);
    assert.deepEqual(t.enviados, [], "Enter não envia");
    d.ev(t.ta, "keydown", { key: "Enter", ctrlKey: true });
    await esperar(5);
    assert.equal(t.enviados.length, 1);
  } finally { d.fim(); }
});

test("CA-060 (DOM) · supervisor salva o texto do campo como resposta rápida (nx_resposta_salvar) e ela já entra no «/»", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    const chamadas = [];
    t.A.api = { rpcC: async (nome, p) => { chamadas.push([nome, p]); return { id: 77, ...p.p_resposta }; } };
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    assert.equal(d.menus.at(-1).itens.find(x => x.rotulo === "Salvar como resposta rápida").desabilitado, true, "campo vazio");
    t.digitar("Pode vir em jejum de 2 horas.");
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    d.aoModal(async o => { achar(o.corpo, "#cvx-rr-atalho").value = "jejum"; return o.acoes[1].fn({ erro() {} }); });
    await d.menus.at(-1).itens.find(x => x.rotulo === "Salvar como resposta rápida").fn();
    assert.deepEqual(chamadas.map(c => [c[0], c[1].p_resposta.atalho, c[1].p_resposta.corpo]), [["nx_resposta_salvar", "jejum", "Pode vir em jejum de 2 horas."]]);
    assert.ok(t.A.base.respostas.some(r => r.atalho === "jejum"));
  } finally { d.fim(); }
});

test("CA-075 (DOM) · 1ª mensagem numa conversa da Ana pergunta antes; «Assumir e responder» assume e envia; a 2ª não pergunta", async () => {
  const d = comDom();
  try {
    const assumidas = [];
    const t = await montarComposer(d, { conv: { atribuida_a: "u2", atribuida_nome: "Ana" }, acoes: { assumir: async () => assumidas.push(1) } });
    let titulo = null;
    d.aoModal(async o => { titulo = o.titulo; return "assumir"; });
    t.digitar("Bom dia!");
    achar(t.comp.el, ".cvx-enviar").click();
    await esperar(10);
    assert.equal(titulo, "Esta conversa é de Ana");
    assert.deepEqual(assumidas, [1]);
    assert.equal(t.enviados.length, 1);
    titulo = null;
    t.digitar("Tudo certo?");
    achar(t.comp.el, ".cvx-enviar").click();
    await esperar(10);
    assert.equal(titulo, null, "já confirmado para esta conversa");
    assert.equal(t.enviados.length, 2);
  } finally { d.fim(); }
});

test("CA-106/CA-107/CA-154 (DOM) · sem internet: clipe/microfone desligados com o motivo e a nota não chama o servidor; «Salvar nota» à vista", async () => {
  const d = comDom();
  try {
    let off = true;
    const t = await montarComposer(d, { acoes: { offline: () => off } });
    t.comp.atualizar();
    const clipe = achar(t.comp.el, '.cvx-ferr button[title^="Sem internet"]');
    assert.equal(clipe.getAttribute("aria-disabled"), "true");
    t.comp.alternarNota(true);
    const enviar = achar(t.comp.el, ".cvx-enviar");
    assert.equal(enviar.getAttribute("aria-label"), "Salvar nota");
    assert.equal(achar(enviar, ".cvx-enviar-rot").textContent, "Salvar nota");
    t.digitar("cliente pediu boleto");
    enviar.click();
    await esperar(5);
    assert.deepEqual(t.notas.filter(n => n[0] === "cliente pediu boleto"), [], "offline: nenhuma RPC");
    assert.match(d.toasts.at(-1), /Sem internet: a nota fica no campo/);
    assert.equal(t.ta.value, "cliente pediu boleto");
    off = false; t.comp.alternarNota(false);
    const clipe2 = achar(t.comp.el, '.cvx-ferr [aria-label="Anexar arquivo"]');
    assert.equal(clipe2.getAttribute("aria-disabled"), "false", "a conexão voltou: o clipe volta");
  } finally { d.fim(); }
});

test("CA-243/CA-071 (DOM) · anexo com a janela fechando avisa no modal; legenda ganha contador a partir de 900", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d, { conv: { janela_ate: new Date(Date.now() + 60000).toISOString() } });
    let corpo = null;
    d.aoModal(async o => { corpo = o.corpo; return false; });
    await t.comp.anexar(new File(["%PDF"], "orc.pdf", { type: "application/pdf" }));
    assert.match(achar(corpo, ".cv-aviso-janela").textContent, /A janela de 24 h fecha às \d{2}:\d{2} \(em 1 min\)/);   // plano 1000b: CB-120 — a hora em que fecha
    const leg = achar(corpo, "#cvx-legenda");
    const n = achar(corpo, ".cvx-legenda-n");
    assert.equal(n.hidden, true);
    leg.value = "x".repeat(950); d.ev(leg, "input");
    assert.equal(n.hidden, false);
    assert.equal(n.textContent, "74 caracteres restantes");
  } finally { d.fim(); }
});

/* ============================================================ (b) lista */
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

test("CA-043 (DOM) · a linha diz a etapa e a 1ª etiqueta por extenso (no celular os pontos viram texto)", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1, { negocio: { estagio_nome: "Avaliação" }, etiquetas: ["e1", "e2"] })], base: { etiquetas: [{ id: "e1", nome: "Urgente" }, { id: "e2", nome: "VIP" }] } });
    assert.equal(achar(t.lista.el, ".cvl-meta-txt").textContent, "Avaliação · Urgente +1");
    const css = ler("conversas.css");
    assert.match(css, /@media \(max-width: 760px\), \(hover: none\) \{\s*\.cvl-meta \.cvl-dot, \.cvl-meta \.cvl-mais-etq \{ display: none; \}/);
  } finally { d.fim(); }
});

test("CA-049 (DOM) · «Minhas» vazia com gente esperando oferece «Atender o próximo (2 esperando)» e «Ver Sem dono»", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { contagens: { aguardando: 2, sem_dono: 1 } });
    const b = achar(t.lista.el, ".cvl-vazio-atender");
    assert.match(b.textContent, /Atender o próximo \(2 esperando\)/);
    b.click();
    assert.deepEqual(t.chamadas.filter(c => c[0] === "atender").length, 1);
    achar(t.lista.el, ".cvl-vazio-semdono").click();
    assert.deepEqual(t.chamadas.find(c => c[0] === "mudarLista")[1], { aba: "sem_dono", busca: "" });
  } finally { d.fim(); }
});

test("CA-050 (DOM) · o fim da lista à vista carrega a próxima página sozinho (uma vez por vez) e o botão diz quantas faltam", async () => {
  const d = comDom();
  const antes = globalThis.IntersectionObserver;
  let cb = null;
  globalThis.IntersectionObserver = class { constructor(f) { cb = f; } observe() {} disconnect() {} };
  try {
    const itens = Array.from({ length: 50 }, (_, i) => conv(i + 1));
    const t = await montarLista(d, { itens, aba: "sem_dono", contagens: { sem_dono: 340 } });
    t.A.temMais = true; t.lista.render();
    assert.equal(botaoTexto(t.lista.el, /Carregar mais/).textContent, "Carregar mais (faltam 290)");
    cb([{ isIntersecting: true }]);
    cb([{ isIntersecting: true }]);
    assert.deepEqual(t.chamadas.filter(c => c[0] === "carregarLista"), [["carregarLista", { mais: true }]], "a trava segura o 2º aviso enquanto a página vem");
  } finally { globalThis.IntersectionObserver = antes; if (antes === undefined) delete globalThis.IntersectionObserver; d.fim(); }
});

test("CA-092 (DOM) · virar o minuto refaz só as linhas com SLA (aguardando), não as 300", async () => {
  const d = comDom();
  const real = Date.now;
  try {
    const itens = Array.from({ length: 300 }, (_, i) => conv(i + 1, i < 10 ? { aguardando: true } : {}));
    const t = await montarLista(d, { itens });
    let refeitas = 0;
    for (const el of t.lista.el.querySelectorAll(".cvl-item")) { const orig = el.replaceWith.bind(el); el.replaceWith = n => { refeitas++; orig(n); }; }
    const base = real();
    Date.now = () => base + 61000;
    t.lista.render();
    assert.equal(refeitas, 10);
  } finally { Date.now = real; d.fim(); }
});

test("CA-007/CA-052 (DOM) · faixa «desde ontem às…»; espera conta só o horário de atendimento quando a tela o conhece", async () => {
  const d = comDom();
  try {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const t = await montarLista(d, { itens: [conv(1, { aguardando: true, ultima_entrada_em: agoraIso(120) })], acoes: { canaisCaidos: () => [{ id: "k1", nome: "Recepção", desde: ontem }] } });
    assert.match(achar(t.lista.el, ".cvl-caido").textContent, /desconectado desde ontem às \d\d:\d\d/);
    assert.equal(achar(t.lista.el, ".cvl-espera").dataset.sla, "critico", "sem horário conhecido: 2 h corridas");
    t.A.base.config = { departamentos: [{ id: "d1", padrao: true, horario: {} }] };       // fechado a semana toda
    t.A.itens = [{ ...t.A.itens[0] }];
    t.lista.render();
    const esp = achar(t.lista.el, ".cvl-espera");
    assert.equal(esp.dataset.sla, "ok", "fechado: nada conta");
    assert.equal(esp.dataset.uteis, "1");
    assert.match(esp.title, /chegou fora do horário/);
  } finally { d.fim(); }
});

test("CA-046 (DOM) · modo seleção: tocar marca (não abre); a barra resolve as marcadas de uma vez", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1), conv(2), conv(3)] });
    achar(t.lista.el, ".cvl-sel-bt").click();
    assert.equal(achar(t.lista.el, ".cvl-lote").hidden, false);
    const item = id => t.lista.el.querySelector(`.cvl-item[data-id="${id}"]`);
    const ev1 = d.ev(item(1), "click");
    d.ev(item(3), "click");
    assert.equal(ev1, false, "o link não navega no modo seleção");
    assert.equal(item(1).getAttribute("aria-checked"), "true");
    assert.equal(item(2).getAttribute("aria-checked"), "false");
    assert.match(achar(t.lista.el, ".cvl-lote-n").textContent, /2 selecionadas/);
    botaoTexto(achar(t.lista.el, ".cvl-lote"), /^Resolver$/).click();
    assert.deepEqual(t.chamadas.find(c => c[0] === "resolverLote")[1], [1, 3]);
    assert.equal(achar(t.lista.el, ".cvl-lote").hidden, true, "sai do modo seleção");
  } finally { d.fim(); }
});

/* ============================================================ (b) lateral */
test("CA-035 (DOM) · concluir tarefa tem Desfazer: risca na hora, grava só ao fechar o aviso; Desfazer desmarca", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    const rpcs = [];
    t.A.api.rpcC = async (nome, p) => { rpcs.push([nome, p]); return {}; };
    const chk = achar(t.alvo, ".cvt-tar input[type=checkbox]");
    chk.checked = true; d.ev(chk, "change");
    await esperar(2);
    assert.equal(chk.closest(".cvt-tar").dataset.feita, "1");
    assert.deepEqual(rpcs, [], "nada no servidor antes de o aviso fechar");
    const des = d.desfazeres.at(-1);
    assert.match(des.texto, /Tarefa concluída · Ligar/);
    des.reverter();
    assert.equal(chk.checked, false);
    chk.checked = true; d.ev(chk, "change");
    await d.desfazeres.at(-1).firmar({});
    assert.deepEqual(rpcs, [["nx_tarefa_concluir", { p_id: 71, p_concluida: true }]]);
  } finally { d.fim(); }
});

test("CA-036/CA-037 (DOM) · nova tarefa: hora em São Paulo e «Para quem» manda o dono_id", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    t.A.base.usuarios = [{ id: "u1", nome: "Helena", papel: "admin" }, { id: "u2", nome: "Dr. Paulo", papel: "atendente" }];
    const salvas = [];
    t.A.api.rpcC = async (nome, p) => { if (nome === "nx_tarefa_salvar") salvas.push(p.p_tarefa); return { id: 1 }; };
    d.ui.lerForm = () => ({ titulo: "Ligar para o paciente", tipo: "ligacao", vence_em: "2026-10-13T14:00", dono_id: "u2" });
    // plano 1000b: CB-061 — prazo no passado avisa no 1º toque e cria no 2º (a data fixa deste teste já passou)
    d.aoModal(async o => (await o.acoes[1].fn()) || o.acoes[1].fn());
    achar(t.alvo, '[data-foco="nova-tarefa"]').click();
    await esperar(5);
    assert.equal(salvas.length, 1);
    assert.equal(salvas[0].vence_em, "2026-10-13T17:00:00.000Z");
    assert.equal(salvas[0].dono_id, "u2");
  } finally { d.fim(); }
});

test("CA-038/CA-040/CA-039/CA-004 (DOM) · e-mail com mailto e copiar; sem «Ficha» nos atalhos; resumo da IA vira nota; sem IA, sem «Resumir»", async () => {
  const d = comDom();
  try {
    const notas = [];
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana", telefone: "5512999990000", email: "mariana@exemplo.com" } } });
    assert.equal(achar(t.alvo, 'a[href^="mailto:"]').getAttribute("href"), "mailto:mariana@exemplo.com");
    achar(t.alvo, '[data-foco="copiar-email"]');
    assert.equal(t.alvo.querySelector('.cvt-atalho[data-foco="ficha"]'), null);
    assert.equal(t.alvo.querySelector('[data-foco="resumir"]'), null, "sem a IA configurada não há botão que só dá erro");
    t.A.base.ia = { ligada: true, cota: { usadas: 0, limite: 50 } };
    t.A.acoes.nota = async (texto, o) => { notas.push([texto, o.conversa]); return {}; };
    t.A.api.fn = async () => ({ texto: "Cliente quer clareamento na sexta." });
    t.lat.render();
    achar(t.alvo, '[data-foco="resumir"]').click();
    await esperar(10);
    achar(t.alvo, ".cvt-resumo-nota").click();
    await esperar(10);
    assert.deepEqual(notas, [["Resumo da IA: Cliente quer clareamento na sexta.", 9]]);
    assert.match(achar(t.alvo, ".cvt-resumo-nota").textContent, /Guardado como nota/);
  } finally { d.fim(); }
});

/* ============================================================ (c) a central inteira */
test("CA-025 (central) · 3 falhas seguidas do delta mostram «Sem atualizar desde…»; o primeiro sucesso tira", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const original = srv.handlers.nx_cv_mensagens;
    srv.handlers.nx_cv_mensagens = () => { throw Object.assign(new Error("sem_conexao"), { codigo: "sem_conexao" }); };
    for (let i = 0; i < 3; i++) await c.pulso();
    const faixa = achar(c.alvo, ".cvc-atraso");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /Sem atualizar desde \d\d:\d\d/);
    assert.ok(botaoTexto(faixa, /Tentar agora/));
    srv.handlers.nx_cv_mensagens = original;
    await c.pulso();
    assert.equal(faixa.hidden, true);
  } finally { c.fim(); d.fim(); }
});

test("CA-096 (central) · 5 pulsos sem mudança na conversa aberta → no máximo 1 nx_cv_ver (antes: 1 por pulso)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    await c.pulso();
    const antes = srv.conta("nx_cv_ver");
    for (let i = 0; i < 5; i++) await c.pulso();
    assert.ok(srv.conta("nx_cv_ver") - antes <= 1, `nx_cv_ver: ${srv.conta("nx_cv_ver") - antes}`);
    srv.convs[0].atribuida_a = "u2"; srv.convs[0].atribuida_nome = "Ana Paula";
    const antes2 = srv.conta("nx_cv_ver");
    await c.pulso();
    assert.equal(srv.conta("nx_cv_ver") - antes2, 1, "mudou na lista: relê");
  } finally { c.fim(); d.fim(); }
});

test("CA-136 (central) · delta com tem_mais (voltou de uma queda com 250 novas) pede o resto na hora", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const original = srv.handlers.nx_cv_mensagens;
    srv.handlers.nx_cv_mensagens = p => {
      if (p.p_depois_id == null) return original(p);
      const todas = srv.msgs.get(p.p_conversa).filter(m => m.id > p.p_depois_id);
      const pag = todas.slice(0, 200);
      return { itens: pag.map(m => ({ ...m })), tem_mais: todas.length > 200, conversas: [{ id: p.p_conversa }], agora: new Date().toISOString(), ultimo_id: pag.length ? pag[pag.length - 1].id : p.p_depois_id };
    };
    for (let i = 0; i < 250; i++) srv.chegar(901, `m${i}`);
    const antes = srv.chamadas.filter(x => x[0] === "nx_cv_mensagens" && x[1].p_depois_id != null).length;
    await c.pulso();
    const depois = srv.chamadas.filter(x => x[0] === "nx_cv_mensagens" && x[1].p_depois_id != null).length;
    assert.equal(depois - antes, 2, "a 2ª página veio no mesmo pulso");
    assert.equal(c.alvo.querySelectorAll(".cv-msg").length, 251);
  } finally { c.fim(); d.fim(); }
});

test("CA-009 (central) · clicar na citação de uma mensagem antiga carrega as páginas anteriores e destaca", async () => {
  const d = comDom();
  const msgs = Array.from({ length: 120 }, (_, i) => ({ id: 1000 + i, conversa_id: 901, direcao: i % 2 ? "out" : "in", tipo: "texto", corpo: `m${i}`, status: i % 2 ? "enviada" : "recebida",
    wamid: `w${i}`, criado_em: agoraIso(500 - i), atualizado_em: agoraIso(500 - i) }));
  msgs[119].responde_a = { id: 1009, direcao: "out", resumo: "m9" };
  const srv = criarServidor({ mensagens: { 901: msgs } });
  srv.handlers.nx_cv_mensagens = p => {
    const todas = srv.msgs.get(p.p_conversa);
    let lista = todas;
    if (p.p_depois_id != null) lista = todas.filter(m => m.id > p.p_depois_id);
    else if (p.p_antes_id != null) lista = todas.filter(m => m.id < p.p_antes_id).slice(-50);
    else lista = todas.slice(-50);
    const tem = p.p_depois_id == null && todas.indexOf(lista[0]) > 0;
    return { itens: lista.map(m => ({ ...m })), tem_mais: tem, conversas: [{ id: p.p_conversa }], agora: new Date().toISOString(), ultimo_id: todas[todas.length - 1].id };
  };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    assert.equal(c.alvo.querySelector('.cv-msg[data-id="1009"]'), null);
    achar(c.alvo, '.cv-msg[data-id="1119"] .cv-cita').click();
    // plano 1000b: espera até a 2ª página chegar (teto 2 s) — os 60 ms fixos falhavam às vezes com a suíte em paralelo
    for (let t = 0; t < 100 && !(c.alvo.querySelector('.cv-msg[data-id="1009"]') && c.alvo.querySelector('.cv-msg[data-id="1009"]').dataset.destaque === "1"); t++) await esperar(20);
    const alvo = achar(c.alvo, '.cv-msg[data-id="1009"]');
    assert.equal(alvo.dataset.destaque, "1");
    assert.ok(srv.chamadas.filter(x => x[0] === "nx_cv_mensagens" && x[1].p_antes_id != null).length >= 2);
  } finally { c.fim(); d.fim(); }
});

test("CA-008 (central) · «Devolver para a fila» com Desfazer: nada vai ao servidor antes do aviso fechar", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[0].atribuida_a = "u1"; srv.convs[0].atribuida_nome = "Helena Souza";
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    d.menus.at(-1).itens.find(x => x && x.rotulo === "Devolver para a fila").fn();        // o aviso com Desfazer fica aberto (não espera)
    await esperar(10);
    const des = d.desfazeres.at(-1);
    assert.match(des.texto, /Devolvida para a fila · Cliente 1/);
    assert.equal(srv.conta("nx_cv_atribuir"), 0);
    await des.firmar({});
    assert.equal(srv.conta("nx_cv_atribuir"), 1);
    assert.equal(srv.chamadas.find(x => x[0] === "nx_cv_atribuir")[1].p_conta, null);
  } finally { c.fim(); d.fim(); }
});

test("CA-026/CA-054/CA-055 (central) · transferir: pessoa fora do departamento avisada; busca com mais de 10 pessoas; recado vira nota", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.base.departamentos = [{ id: "dA", nome: "Recepção" }, { id: "dB", nome: "Ortodontia" }];
  srv.base.usuarios = [{ id: "u1", nome: "Helena Souza", papel: "admin", departamentos: [] },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, nome: `Pessoa ${i}`, papel: "atendente", departamentos: ["dA"] }))];
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const visto = {};
    d.aoModal(async o => {
      if (!/Transferir/.test(o.titulo)) return true;
      const corpo = o.corpo;
      const busca = achar(corpo, "#cv-tr-busca");
      busca.value = "pessoa 3"; d.ev(busca, "input");
      visto.visiveis = corpo.querySelectorAll("#cv-tr-pessoa option").filter(op => op.value && !op.hidden).map(op => op.value);
      const dep = achar(corpo, "#cv-tr-dep"); dep.value = "dB"; d.ev(dep, "change");
      const p = achar(corpo, "#cv-tr-pessoa"); p.value = "p3"; d.ev(p, "change");
      visto.aviso = achar(corpo, ".cv-tr-dep-aviso");
      visto.opcao = corpo.querySelectorAll("#cv-tr-pessoa option").find(op => op.value === "p3").textContent;
      achar(corpo, "#cv-tr-recado").value = "quer remarcar para sexta";
      return o.acoes[1].fn();
    });
    achar(c.alvo, ".cvc-transferir").click();
    await esperar(20);
    assert.deepEqual(visto.visiveis, ["p3"]);
    assert.equal(visto.aviso.hidden, false);
    assert.match(visto.aviso.textContent, /Pessoa 3 não atende Ortodontia/);
    assert.match(visto.opcao, /\(não atende este departamento\)/);
    await d.desfazeres.at(-1).firmar({});
    const ordem = srv.chamadas.map(x => x[0]).filter(n => n === "nx_cv_atribuir" || n === "nx_cv_nota");
    // revisão 13/10: o recado é gravado ANTES (depois de transferir, quem transferiu pode deixar de ver a conversa e a nota falhava)
    assert.deepEqual(ordem, ["nx_cv_nota", "nx_cv_atribuir"]);
    // plano 1500c: a nota do recado diz para quem foi (CC-312)
    assert.equal(srv.chamadas.find(x => x[0] === "nx_cv_nota")[1].p_texto, "Transferida para Pessoa 3 (Ortodontia): quer remarcar para sexta");
  } finally { c.fim(); d.fim(); }
});

test("CA-056/CA-057 (central) · «Nova conversa»: o texto acompanha o número (Meta x CodeWords) e os resultados são <li><button aria-pressed>", async () => {
  const d = comDom();
  const srv = criarServidor({ canais: [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true }, { id: "k2", nome: "Celular", provedor: "codewords", status: "ativo", tem_token: true }] });
  srv.handlers.nx_contatos_listar = () => ({ itens: [{ id: 7, nome: "Mariana", telefone: "5512999990000" }] });
  const c = await montarCentral(d, srv);
  try {
    let modal = null;
    d.aoModal(async o => { modal = o; return null; });
    botaoTexto(c.alvo, /^Nova$/).click();
    await esperar(5);
    const regra = achar(modal.corpo, ".cv-nv-regra");
    assert.match(regra.textContent, /Número da Meta/);
    const s = achar(modal.corpo, "#cv-nv-canal"); s.value = "k2"; d.ev(s, "change");
    assert.match(regra.textContent, /WhatsApp comum \(CodeWords\)/);
    const busca = achar(modal.corpo, "#cv-nv-busca"); busca.value = "mari"; d.ev(busca, "input");
    await esperar(10);
    const op = achar(modal.corpo, "ul.cv-contato-lista > li > button.cv-contato-op");
    assert.equal(op.getAttribute("role"), null, "o botão não vira listitem");
    assert.equal(op.getAttribute("aria-pressed"), "false");
  } finally { c.fim(); d.fim(); }
});

test("CA-010 (central) · criar «vip» com «VIP» existente usa a que existe (nenhum nx_etiqueta_salvar)", async () => {
  const d = comDom();
  const srv = criarServidor();
  let podeCriar = null;
  const original = d.ui.seletorEtiquetas;
  d.ui.seletorEtiquetas = o => { podeCriar = o.podeCriar; return original(o); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const e = await podeCriar("vip ");
    assert.equal(e.id, "e1");
    assert.equal(srv.conta("nx_etiqueta_salvar"), 0);
    assert.match(d.toasts.at(-1), /Já existia: usei a etiqueta «VIP»/);
  } finally { c.fim(); d.fim(); }
});

test("CA-046 (central) · resolver 3 em lote: um Desfazer, e só 3 nx_cv_status quando o aviso fecha", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 4 });
  srv.handlers.nx_cv_status = p => { const cv = srv.convs.find(x => x.id === p.p_conversa); cv.status = p.p_status; return { ...cv }; };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    botaoTexto(achar(c.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    const des = d.desfazeres.at(-1);
    assert.match(des.texto, /3 conversas resolvidas/);
    assert.equal(srv.conta("nx_cv_status"), 0);
    await des.firmar({});
    assert.equal(srv.conta("nx_cv_status"), 3);
  } finally { c.fim(); d.fim(); }
});

test("CA-103 (central) · sem conexão, a lista guardada no aparelho aparece com «Sem conexão · lista de…»", async () => {
  const d = comDom();
  const srv = criarServidor();
  const rpc = srv.api.rpcC;
  const guardado = { itens: [{ id: 950, contato: { id: 1, nome: "Guardada" }, canal_id: "k1", status: "aberta", aguardando: false, nao_lidas: 0, ultima_msg_em: agoraIso(5), etiquetas: [] }], tem_mais: false, contagens: {} };
  srv.api.rpcC = async (nome, p = {}, o = {}) => {
    if (nome === "nx_cv_listar" && o && o.cache) {
      o.aoCache(guardado, Date.now() - 3600000);
      await esperar(0);
      throw Object.assign(new Error("sem_conexao"), { codigo: "sem_conexao", comCache: true });
    }
    return rpc(nome, p, o);
  };
  const c = await montarCentral(d, srv);
  try {
    assert.equal(achar(c.alvo, ".cvl-item").dataset.id, "950");
    const faixa = achar(c.alvo, ".cvl-cache");
    assert.equal(faixa.hidden, false);
    // plano 1000b: CB-016 — guardada 1 h antes da 00:05 de SP (relógio do CI) é «ontem às 23:05»
    assert.match(faixa.textContent, /Sem conexão · lista de (ontem às )?\d\d:\d\d/);
    assert.equal(c.alvo.querySelector(".cvl-lista .erro"), null, "nada de cartão de erro por cima da lista guardada");
  } finally { c.fim(); d.fim(); }
});

/* ============================================================ (d) fonte e CSS */
test("CA-016/CA-041/CA-015/CA-032 · CSS: selos em duas linhas no celular, composer por container, protocolo some antes de cortar, pinça na foto; tokens", () => {
  const css = ler("conversas.css");
  const bloco = css.slice(css.indexOf("Plano 1000 (13/10/2026) — lote conv-1"));
  assert.ok(bloco.length > 500);
  assert.match(bloco, /@media \(max-width: 760px\) \{\s*\.cvc-selos \{ flex-wrap: wrap; overflow: visible;/, "CA-016: antes nowrap + rolagem escondida");
  assert.match(bloco, /\.cv-col-chat \{ container: cvchat \/ inline-size; \}/);
  assert.match(bloco, /@container cvchat \(max-width: 640px\) \{\s*\.cvx-linha \{ display: grid;[^}]*grid-template-areas: "campo campo" "ferr enviar";/, "CA-041");
  assert.match(bloco, /@container \(max-width: 360px\) \{ \.cvc-sub \.mono, \.cvc-sub \.cvc-proto-sep \{ display: none; \} \}/, "CA-015");
  assert.match(bloco, /\.cv-lb-fig img \{ touch-action: pinch-zoom; \}/, "CA-032");
  assert.match(bloco, /\.cv-lb\[data-zoom="1"\] \.cv-lb-palco \{ overflow: auto;/);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "sem hex");
  assert.doesNotMatch(bloco, /transition:\s*all/);
  assert.match(bloco, /@media \(prefers-reduced-motion: reduce\) \{ \.cvx-rec-nivel i \{ transition: none; \} \}/);
  assert.match(bloco, /\.cvc-atraso\[hidden\][^{]*\{ display: none !important; \}/);
  // o título do cabeçalho carrega a linha inteira (protocolo incluído) para quando o CSS esconde o protocolo
  assert.match(ler("cv-chat.js"), /`Abrir a ficha · \$\{subTitulo\}`/);
});

/* ============================================================================================================================
   LOTE conv-2 (13/10/2026) — mesmos montadores acima; cada teste falha no código de antes desta rodada (o id do item está no nome)
   ============================================================================================================================ */
const NL = String.fromCharCode(10);
/** Composer numa página própria (cada cenário com o seu DOM). */
async function comComposer(o, fn) { const d = comDom(o && o.dom); try { const x = await montarComposer(d, o); await fn(x, d); } finally { d.fim(); } }

/* ---------------------------------------------------------------- (a) lógica pura */
test("CA-145/CA-088/CA-089/CA-074/CA-094/CA-077 · lógica: 0,75×, erro da IA por motivo, janela sem jargão, aviso da janela, junção linear e prefixo da assinatura", () => {
  assert.deepEqual([1, 1.5, 2, 0.75].map(L.proximaVelocidade), [1.5, 2, 0.75, 1]);
  assert.equal(L.rotuloVelocidade(0.75), "0,75×");
  assert.equal(L.velocidadeValida("0.75"), 0.75);
  assert.equal(L.erroIA({ codigo: "ia_indisponivel", detalhe: "sem_chave" }).texto, "A IA ainda não foi configurada para esta empresa.");
  assert.match(L.erroIA({ codigo: "tempo_rede" }).texto, /demorou demais/);
  assert.match(L.erroIA({ codigo: "x", status: 504 }).texto, /demorou demais/);
  assert.match(L.erroIA({ codigo: "ia_indisponivel", detalhe: "conversa_vazia" }).texto, /Ainda não há mensagens para a IA ler/);
  assert.equal(L.erroIA({ codigo: "ia_cota" }).tipo, "info");
  assert.equal(L.erroIA({ codigo: "ia_indisponivel", resposta: { mensagem: "A IA está fora do ar neste momento." } }).texto, "A IA está fora do ar neste momento.");
  assert.equal(L.erroIA(null).texto, "A IA não está disponível agora.");
  assert.doesNotMatch(L.JANELA_FECHADA_LONGO, /janela/i);
  assert.match(L.JANELA_FECHADA_LONGO, /24 h.*aprovada pela Meta/);
  const agora = new Date("2026-10-13T17:00:00Z");
  assert.equal(L.avisoJanelaFechando(L.janela({ janela_ate: new Date(agora.getTime() + 20 * 60000).toISOString() }, agora)),
    "A janela fecha às 14:20 — depois disso, só mensagem aprovada pela Meta (modelo).");
  assert.equal(L.avisoJanelaFechando(L.janela({ janela_ate: new Date(agora.getTime() + 3 * 3600000).toISOString() }, agora)), "");
  assert.equal(L.avisoJanelaFechando(L.janela({}, agora)), "");
  const muitos = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
  const pagina = Array.from({ length: 50 }, (_, i) => ({ id: 4990 + i }));
  const t0 = performance.now();
  const junto = L.juntarPagina(muitos, pagina);
  assert.ok(performance.now() - t0 < 20, "5.000 + 50 juntam na hora");
  assert.equal(junto.length, 5040);
  assert.equal(new Set(junto.map(x => x.id)).size, 5040, "nenhuma conversa repetida");
  const cv = ler("conversas.js");
  assert.match(cv, /A\.L\.juntarPagina\(A\.itens, r\.itens \|\| \[\]\)/, "CA-094: a central usa a junção linear");
  assert.doesNotMatch(cv, /filter\(n => !A\.itens\.some\(/, "a junção quadrática saiu");
  assert.equal(L.prefixoAssinatura("Helena"), "*Helena:*");
  assert.equal(L.prefixoAssinatura(""), "");
});

test("CA-232/CA-121/CA-142/CA-080/CA-115/CA-126/CA-087/CA-084/CA-247 · lógica: exportação, destino do link, localização/contato, +55, eventos, diagnóstico, separador, adiar e «Você:»", () => {
  const msgs = [
    { id: 2, direcao: "out", tipo: "texto", corpo: `Pode sim${NL}às 9h`, criado_em: "2026-10-13T17:03:00Z", enviado_por: { nome: "Helena" } },
    { id: 1, direcao: "in", tipo: "texto", corpo: "Tem horário?", criado_em: "2026-10-13T17:02:00Z" },
    { id: 3, direcao: "out", tipo: "nota", corpo: "segredo da equipe", criado_em: "2026-10-13T17:04:00Z" },
    { id: "tmp-1", local: true, direcao: "out", tipo: "texto", corpo: "ainda na fila", criado_em: "2026-10-13T17:05:00Z" },
  ];
  const t = L.textoExportacao(msgs, { contato: "Mariana" });
  const linhas = t.trim().split(NL);
  assert.equal(linhas[0], "13/10/2026 14:02 · Mariana: Tem horário?");
  assert.equal(linhas[1], "13/10/2026 14:03 · Helena: Pode sim");
  assert.equal(linhas[2], "    às 9h");
  assert.doesNotMatch(t, /segredo/, "sem notas internas");
  assert.doesNotMatch(t, /ainda na fila/, "o que não saiu não entra");
  assert.match(L.textoExportacao(msgs, { contato: "Mariana", notas: true }), /Nota interna \(equipe\): segredo/);
  assert.deepEqual(L.destinoLink("https://xn--pple-43d.com/login"), { host: "xn--pple-43d.com", encurtador: false, idn: true });
  assert.equal(L.destinoLink("https://bit.ly/abc").encurtador, true);
  assert.equal(L.destinoLink("nada disso"), null);
  assert.deepEqual(L.localizacaoDe("Localização: Clínica — Rua X (-23.02, -45.55)"), { nome: "Clínica — Rua X", lat: -23.02, lng: -45.55 });
  assert.equal(L.localizacaoDe("Localização: sem nome"), null);
  assert.deepEqual(L.contatosDe("Contato: Ana Lima 5512999990000; Zé 12"), [{ nome: "Ana Lima", telefone: "5512999990000" }]);
  assert.equal(L.telefoneInternacional("55 (12) 99999-0000"), "+5512999990000");
  assert.equal(L.rotuloGrupoSistema([{ corpo: "IA respondeu", criado_em: "2026-10-13T17:00:00Z" }, { corpo: "IA pausada", criado_em: "2026-10-13T17:02:00Z" }]),
    "2 eventos do sistema, último: IA pausada às 14:02");
  const diag = L.textoDiagnostico({ versao: "v1", conta: "u1", cliente: "c1", aba: "minhas", conversa: 9, fila: [{ estado: "fila", texto: "olá paciente", p_token: "segredo-tok" }, { estado: "falhou" }],
    erros: [{ em: Date.now(), codigo: "sem_conexao" }] });
  assert.match(diag, /fila de saída: fila=1, falhou=1/);
  assert.match(diag, /erros recentes: .*sem_conexao/);
  assert.doesNotMatch(diag, /olá paciente|p_token|segredo-tok/, "nada de texto de mensagem nem token");
  assert.equal(L.abrirNoSeparador(5, 4), true);
  assert.equal(L.abrirNoSeparador(5, 3), false);
  assert.equal(L.abrirNoSeparador(null, 9), false);
  assert.equal(L.adiarTarefa("amanha9", new Date("2026-10-13T23:30:00Z")), "2026-10-14T12:00:00.000Z", "20:30 de 13/10 em SP → 14/10 às 9h de SP");
  assert.equal(L.adiarTarefa("1h", new Date("2026-10-13T12:00:00Z")), "2026-10-13T13:00:00.000Z");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "out" }, "u1"), "Você: ");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "out", ultima_msg_origem: "ia" }, "u1"), "IA: ");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "out", ultima_msg_origem: "automacao" }, "u1"), "Automação: ");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "out", ultima_msg_por: "u2", ultima_msg_por_nome: "Ana Paula" }, "u1"), "Ana: ");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "out", ultima_msg_por: "u1", ultima_msg_por_nome: "Helena" }, "u1"), "Você: ");
  assert.equal(L.prefixoResumoLista({ ultima_msg_dir: "in" }, "u1"), "");
});

test("CA-157/CA-158 · Alt+Shift+O abre o negócio e Alt+Shift+E as etiquetas (valem dentro do campo; Ctrl junto não dispara)", () => {
  const ev = o => ({ key: "", code: "", altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...o });
  assert.equal(L.acordeDoEvento(ev({ key: "O", code: "KeyO", altKey: true, shiftKey: true }), { emCampo: true }), "abrir_negocio");
  assert.equal(L.acordeDoEvento(ev({ key: "E", code: "KeyE", altKey: true, shiftKey: true }), { emCampo: true }), "etiquetas");
  assert.equal(L.acordeDoEvento(ev({ key: "E", code: "KeyE", altKey: true, shiftKey: true, ctrlKey: true })), null);
  assert.equal(L.atalhoDe("abrir_negocio"), "Alt+Shift+O");
  assert.equal(L.atalhoDe("etiquetas"), "Alt+Shift+E");
});

test("CA-127 · fila: o vencido (8 dias) de outra conta/empresa sai; nos 7 dias ele fica; sem escopo nada se mexe", () => {
  const AG = Date.parse("2026-10-13T12:00:00Z");
  const velho = { id: "x", conta: "u9", cliente: "c1", criada_em: AG - 8 * 86400000 };
  assert.equal(L.filaDestino(velho, { conta: "u1", cliente: "c1", agora: AG }), "apagar");
  assert.equal(L.filaDestino({ ...velho, conta: "u1", cliente: "c2" }, { conta: "u1", cliente: "c1", agora: AG }), "apagar");
  assert.equal(L.filaDestino({ ...velho, criada_em: AG - 86400000 }, { conta: "u1", cliente: "c1", agora: AG }), "pular");
  assert.equal(L.filaDestino(velho, { agora: AG }), "pular");
  const cv = ler("conversas.js");
  assert.match(cv, /mensagens de outra conta guardadas/, "o admin fica sabendo");
  assert.match(cv, /A\.L\.pode\(A\.ctx\.papel, "admin"\)/);
});

test("CA-100/CA-122 · rascunho: 20 gravações seguidas não varrem o armazenamento a cada tecla; o texto da conversa some em 24 h e a nota do CRM fica 7 dias", async () => {
  let agora = Date.parse("2026-10-13T12:00:00Z");
  const mem = new Map();
  let lidasChave = 0;
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k),
    key: i => { lidasChave++; return [...mem.keys()][i] ?? null; }, get length() { return mem.size; } };
  for (let i = 0; i < 5; i++) mem.set(`nx-rasc:u1:c1:negocio:${i}:nota`, JSON.stringify({ t: `nota ${i}`, em: agora }));
  const fila = [];
  const r = R.criarRascunhos({ storage, conta: () => "u1", cliente: () => "c1", agora: () => agora, agendar: fn => { fila.push(fn); return fila.length; }, cancelar() {}, doc: null, janela: null, debounceMs: 0 });
  const campo = { tagName: "TEXTAREA", type: "", value: "", isContentEditable: false, ouv: null, addEventListener(t, fn) { this.ouv = fn; }, removeEventListener() {},
    hasAttribute: () => false, closest: () => null, getAttribute: () => null, dispatchEvent() {} };
  r.ligar(campo, "conversa:901");
  lidasChave = 0;
  for (let i = 0; i < 20; i++) { campo.value = `Olá ${i}`; campo.ouv(); fila.shift()(); agora += 400; }
  assert.ok(lidasChave <= 6, `20 gravações em 8 s: no máximo 1 varredura (antes 20) — ${lidasChave} leituras de chave`);
  assert.equal(r.texto("conversa:901"), "Olá 19");
  agora += 61000;
  campo.value = "depois de 1 min"; campo.ouv(); fila.shift()();
  assert.ok(lidasChave > 0, "passado 1 min, a varredura volta");
  const nota = { ...campo, ouv: null, addEventListener(t, fn) { this.ouv = fn; } };
  r.ligar(nota, "negocio:42:nota");
  nota.value = "lembrar do raio-x"; nota.ouv(); fila.shift()();
  agora += 25 * 3600000;
  assert.equal(r.texto("conversa:901"), null, "texto para o paciente: 24 h no aparelho");
  assert.equal(r.texto("negocio:42:nota"), "lembrar do raio-x", "nota do CRM continua (7 dias)");
  agora += 7 * 86400000;
  assert.equal(r.texto("negocio:42:nota"), null);
  assert.equal(R.TTL_CONVERSA_MS, 24 * 3600000);
});

/* ---------------------------------------------------------------- (b) composer */
test("CA-072 (DOM) · 3 fotos escolhidas de uma vez: um modal com as 3 miniaturas e as legendas, e 3 envios na ordem", async () => {
  await comComposer({}, async ({ comp, enviados }, d) => {
    let modal = null;
    d.aoModal(o => { modal = o; o.corpo.querySelectorAll(".cvx-multi-leg")[1].value = "a do meio"; return true; });
    const fotos = ["a.jpg", "b.jpg", "c.jpg"].map(n => new File([new Uint8Array(2000)], n, { type: "image/jpeg" }));
    const input = achar(comp.el, "input[type=file]");
    assert.equal(input.multiple, true, "o seletor aceita mais de um arquivo");
    Object.defineProperty(input, "files", { value: fotos, configurable: true });
    d.ev(input, "change");
    await esperar(40);
    assert.ok(modal, "um modal só");
    assert.match(modal.titulo, /^Enviar 3 fotos para /);
    assert.equal(modal.corpo.querySelectorAll(".cvx-multi-item").length, 3);
    assert.deepEqual(enviados.map(e => e.arquivo.name), ["a.jpg", "b.jpg", "c.jpg"], "na ordem escolhida");
    assert.deepEqual(enviados.map(e => e.legenda), ["", "a do meio", ""]);
    assert.equal(new Set(enviados.map(e => e.client_ref)).size, 3, "cada foto com a sua intenção");
    assert.ok(enviados.every(e => e.tipo === "midia" && e.conversa === 9));
  });
});

test("CA-073/CA-074/CA-077/CA-089 (DOM) · trava diz quem resolveu e quando; janela fechando avisa a hora; «Sai como» com a assinatura; janela fechada sem jargão", async () => {
  await comComposer({ conv: { status: "resolvida", resolvida_por: { id: "u2", nome: "Ana Paula" }, resolvida_em: new Date().toISOString() } }, async ({ comp }) => {
    assert.match(achar(comp.el, ".cvx-trava p").textContent, /^Resolvido por Ana Paula às \d\d:\d\d\. Reabra para responder\.$/);
  });
  await comComposer({ conv: { status: "resolvida", resolvida_por: { id: "u1", nome: "Helena Souza" }, resolvida_em: new Date().toISOString() } }, async ({ comp }) => {
    assert.match(achar(comp.el, ".cvx-trava p").textContent, /^Resolvido por você às/);
  });
  await comComposer({ conv: { janela_ate: new Date(Date.now() + 20 * 60000).toISOString() } }, async ({ comp }) => {
    const av = achar(comp.el, ".cvx-janela-aviso");
    assert.equal(av.hidden, false);
    assert.match(av.textContent, /^A janela fecha às \d\d:\d\d — depois disso, só mensagem aprovada pela Meta/);
  });
  await comComposer({ conv: { janela_ate: new Date(Date.now() + 3 * 3600000).toISOString() } }, async ({ comp }) => {
    assert.equal(achar(comp.el, ".cvx-janela-aviso").hidden, true, "com 3 h de janela não há aviso");
  });
  await comComposer({ base: { cfg: { assinatura: true } } }, async ({ comp }) => {
    const r = achar(comp.el, ".cvx-assin");
    assert.equal(r.hidden, false);
    assert.equal(r.textContent, "Sai como: *Helena:* …");   // plano 1000b: CB-001 — o servidor assina só com a 1ª palavra
    comp.alternarNota(true);
    assert.equal(r.hidden, true, "nota interna não leva assinatura");
  });
  await comComposer({}, async ({ comp }) => { assert.equal(achar(comp.el, ".cvx-assin").hidden, true, "sem assinatura, sem rótulo"); });
  await comComposer({ conv: { janela_ate: new Date(Date.now() - 60000).toISOString(), ultima_entrada_em: new Date(Date.now() - 25 * 3600000).toISOString() } }, async ({ comp, ta }) => {
    assert.equal(achar(comp.el, ".cvx-trava p").textContent, L.JANELA_FECHADA_LONGO);
    assert.doesNotMatch(ta.placeholder, /Janela fechada/);
  });
});

test("CA-088 (DOM) · «Sugerir com IA» que falha diz o motivo (sem chave, demorou, conversa vazia) em vez de «não está disponível»", async () => {
  await comComposer({}, async ({ comp, aoIA }, d) => {
    const bt = botaoTexto(comp.el, /^Sugerir resposta com IA$/);
    for (const [erro, re] of [[{ codigo: "ia_indisponivel", detalhe: "sem_chave" }, /ainda não foi configurada/], [{ codigo: "tempo_rede" }, /demorou demais/],
      [{ codigo: "ia_indisponivel", detalhe: "conversa_vazia" }, /Ainda não há mensagens para a IA ler/]]) {
      aoIA(() => Promise.reject(Object.assign(new Error(erro.codigo), erro)));
      bt.click();
      await esperar(5);
      assert.match(d.toasts.at(-1), re);
    }
  });
});

test("CA-159 (DOM) · Ctrl+/ abre as respostas rápidas no meio do texto e a escolhida entra no cursor", async () => {
  await comComposer({ base: { respostas: [{ id: 1, atalho: "jejum", titulo: "Jejum", corpo: "Venha em jejum." }] } }, async ({ comp, ta, digitar }, d) => {
    digitar("Bom dia, ");
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    d.ev(ta, "keydown", { key: "/", code: "Slash", ctrlKey: true });
    const rr = achar(comp.el, "#cvx-rr");
    assert.equal(rr.hidden, false, "abriu sem precisar do mouse");
    achar(rr, ".cvx-rr-op").click();
    assert.equal(ta.value, "Bom dia, Venha em jejum.");
  });
});

/* ---------------------------------------------------------------- (b) chat */
const sis = (id, min, corpo) => ({ id, conversa_id: 9, direcao: "out", tipo: "sistema", corpo, criado_em: agoraIso(min), atualizado_em: agoraIso(min) });

test("CA-080/CA-082/CA-231/CA-232 (DOM) · ⋮: copia o telefone com +55, não repete «Abrir ficha», recolhe os eventos do sistema e exporta a conversa", async () => {
  const d = comDom();
  try {
    const copiados = [];
    d.ui.copiar = (t, o) => { copiados.push([t, o && o.aviso]); return Promise.resolve(true); };
    let mostrar = true;
    const exportados = [];
    const { chat } = await montarChat(d, { msgs: [txt(1, "in", 9), sis(2, 8, "IA respondeu"), sis(3, 7, "IA pausada"), sis(4, 6, "Transferida para Ana")],
      acoes: { mostrarSistema: () => mostrar, definirMostrarSistema: v => { mostrar = v; }, exportar: () => exportados.push(1) } });
    achar(chat.el, ".cvc-mais").click();
    const itens = d.menus.at(-1).itens.filter(x => x && x !== "-");
    assert.equal(itens.some(x => x.rotulo === "Abrir ficha"), false, "CA-082: o nome do cabeçalho e o botão do cartão já abrem a ficha");
    itens.find(x => x.rotulo === "Copiar telefone").fn();
    assert.deepEqual(copiados.at(-1), ["+5500000000501", "Telefone copiado: +5500000000501"]);
    itens.find(x => x.rotulo === "Exportar conversa (.txt)").fn();
    assert.equal(exportados.length, 1);
    assert.ok(achar(chat.el, "details.cv-sis-grupo"));
    itens.find(x => /^Eventos do sistema: à vista$/.test(x.rotulo)).fn();
    assert.equal(mostrar, false);
    assert.equal(chat.el.querySelector("details.cv-sis-grupo"), null, "o grupo virou um traço fino");
    const fino = achar(chat.el, ".cv-sis-fino");
    // plano 1500c: o traço fino mostra só NESTA conversa (CC-151); a preferência global continua desligada
    assert.equal(fino.textContent, "3 eventos do sistema · mostrar nesta conversa");
    achar(fino, "button").click();
    assert.equal(mostrar, false);
    assert.ok(achar(chat.el, "details.cv-sis-grupo"));
  } finally { d.fim(); }
});

test("CA-086/CA-140/CA-141/CA-142/CA-143/CA-121/CA-153 (DOM) · bolhas: foto com espaço reservado, vídeo com duração, PDF ver/baixar, mapa e contato, não suportada na Meta, link com destino, nota «Só a equipe»", async () => {
  const d = comDom();
  try {
    const copiados = [], novas = [];
    d.ui.copiar = t => { copiados.push(t); return Promise.resolve(true); };
    const base = { conversa_id: 9, direcao: "in", status: "recebida", criado_em: agoraIso(9), atualizado_em: agoraIso(9) };
    const msgs = [
      { ...base, id: 1, tipo: "imagem", corpo: "", midia: { path: "c1/in/a.jpg", largura: 800, altura: 600 } },
      { ...base, id: 2, tipo: "texto", corpo: "entre" },
      { ...base, id: 3, tipo: "imagem", corpo: "", midia: { path: "c1/in/b.jpg" } },
      { ...base, id: 4, tipo: "video", corpo: "", midia: { path: "c1/in/v.mp4", duracao: 42 } },
      { ...base, id: 5, tipo: "documento", corpo: "", midia: { path: "c1/in/orc.pdf", nome: "orc.pdf", mime: "application/pdf" } },
      { ...base, id: 6, tipo: "localizacao", corpo: "Localização: Clínica (-23.02, -45.55)" },
      { ...base, id: 7, tipo: "contato", corpo: "Contato: Ana Lima 5512999990000" },
      { ...base, id: 8, tipo: "desconhecido", corpo: "Mensagem não suportada pela API do WhatsApp — veja no celular" },
      { ...base, id: 9, tipo: "texto", corpo: "entra em https://xn--pple-43d.com/x ou https://bit.ly/abc" },
      { ...base, id: 10, direcao: "out", tipo: "nota", corpo: "ligar amanhã", enviado_por: { id: "u2", nome: "Ana" } },
    ];
    const { chat } = await montarChat(d, { msgs, acoes: { novaConversa: o => novas.push(o) } });
    const img1 = achar(chat.el, '.cv-msg[data-id="1"] img');
    assert.equal(img1.getAttribute("width"), "800");
    assert.equal(img1.style.getPropertyValue("aspect-ratio"), "800 / 600");
    assert.equal(achar(chat.el, '.cv-msg[data-id="3"] img').getAttribute("data-dims"), null, "sem dimensões: o CSS reserva 4:3");
    assert.equal(achar(chat.el, '.cv-msg[data-id="4"] .cv-video-selo').textContent, "▶ 0:42");
    assert.equal(achar(chat.el, '.cv-msg[data-id="4"] video').getAttribute("aria-label"), "Vídeo de 0:42");
    const pdf = achar(chat.el, '.cv-msg[data-id="5"]');
    assert.equal(achar(pdf, "a.cv-doc").getAttribute("download"), null, "o PDF abre para ver");
    assert.equal(achar(pdf, ".cv-doc-ver").getAttribute("target"), "_blank");
    assert.equal(achar(pdf, ".cv-doc-baixar").getAttribute("download"), "orc.pdf");
    assert.equal(achar(chat.el, '.cv-msg[data-id="6"] a.cv-mapa').getAttribute("href"), "https://maps.google.com/?q=-23.02%2C-45.55");
    const ct = achar(chat.el, '.cv-msg[data-id="7"] .cv-contato-rec');
    botaoTexto(ct, /Copiar telefone/).click();
    assert.equal(copiados.at(-1), "+5512999990000");
    botaoTexto(ct, /Nova conversa/).click();
    assert.deepEqual(novas.at(-1), { telefone: "5512999990000", nome: "Ana Lima" });
    assert.match(achar(chat.el, '.cv-msg[data-id="8"] .cv-texto').textContent, /O WhatsApp não entrega este tipo de mensagem/, "na Meta não há celular para ver");
    const [idn, curto] = chat.el.querySelectorAll('.cv-msg[data-id="9"] .cv-texto a');
    assert.match(idn.getAttribute("title"), /xn--pple-43d\.com.*outro alfabeto/);
    assert.match(curto.getAttribute("title"), /Link encurtado \(bit\.ly\)/);
    assert.ok(achar(idn, ".cv-link-ext"));
    const nota = achar(chat.el, '.cv-msg[data-id="10"] .cv-nota-rot');
    assert.equal(achar(nota, ".cv-nota-so").textContent, "Só a equipe");
    assert.equal(achar(nota, "svg").dataset.icone, "cadeado");
  } finally { d.fim(); }
  const d2 = comDom();
  try {
    const { chat } = await montarChat(d2, { provedor: "codewords", conv: { canal: { nome: "Celular", provedor: "codewords" } },
      msgs: [{ id: 8, conversa_id: 9, direcao: "in", tipo: "desconhecido", corpo: "Mensagem não suportada pela API do WhatsApp — veja no celular", criado_em: agoraIso(2), atualizado_em: agoraIso(2) }] });
    assert.match(achar(chat.el, ".cv-texto").textContent, /veja no celular/, "no aparelho do CodeWords dá para ver no celular");
  } finally { d2.fim(); }
});

test("CA-115/CA-116 (DOM) · grupo do sistema com rótulo para o leitor; progresso do envio com a fase em aria-valuetext", async () => {
  const d = comDom();
  try {
    const local = (id, fase, progresso) => ({ id, local: true, conversa_id: 9, direcao: "out", tipo: "documento", status: "pendente", criado_em: agoraIso(1), atualizado_em: agoraIso(1),
      midia: { estado: "enviando", progresso, fase, local_url: "blob:x", nome: "a.pdf" } });
    const { chat } = await montarChat(d, { msgs: [sis(1, 9, "IA respondeu"), sis(2, 8, "IA pausada"), local("tmp-1", "subindo", 62), local("tmp-2", "entregando", 100)] });
    assert.match(achar(chat.el, ".cv-sis-sum").getAttribute("aria-label"), /^2 eventos do sistema, último: IA pausada às \d\d:\d\d$/);
    const [p1, p2] = chat.el.querySelectorAll(".cv-prog");
    assert.equal(p1.getAttribute("aria-valuetext"), "62 %");
    assert.equal(p2.getAttribute("aria-valuetext"), "Entregando ao WhatsApp");
  } finally { d.fim(); }
});

test("CA-245 (DOM) · conversa oculta (contato bloqueado): nenhuma URL de mídia é pedida até tocar em «Mostrar»", async () => {
  const d = comDom();
  try {
    const pedidos = [];
    const base = { conversa_id: 9, direcao: "in", status: "recebida", criado_em: agoraIso(9), atualizado_em: agoraIso(9) };
    const { chat } = await montarChat(d, { conv: { oculta: true }, acoes: { urlMidia: p => { pedidos.push(p); return `https://cdn.test/${p}`; } },
      msgs: [{ ...base, id: 1, tipo: "imagem", corpo: "", midia: { path: "c1/in/spam.jpg" } }, { ...base, id: 2, tipo: "documento", corpo: "", midia: { path: "c1/in/x.zip", nome: "x.zip" } }] });
    assert.deepEqual(pedidos, [], "nada é pedido ao servidor sozinho");
    const bts = chat.el.querySelectorAll(".cv-midia-mostrar");
    assert.equal(bts.length, 2);
    bts[0].click();
    assert.deepEqual(pedidos, ["c1/in/spam.jpg"], "só a que a pessoa escolheu ver");
    assert.ok(achar(chat.el, '.cv-msg[data-id="1"] img'));
  } finally { d.fim(); }
});

test("CA-110/CA-111/CA-112/CA-144 (DOM) · toque: deslizar a bolha responde; ⋮ vira folha em grupos; nome abre Detalhes no celular; CodeWords explica a citação", async () => {
  const d = comDom({ grosso: true });
  const mm = globalThis.matchMedia;
  try {
    globalThis.matchMedia = q => ({ matches: /coarse|max-width: 760px|hover: none/.test(q), addEventListener() {}, removeEventListener() {} });
    const gestos = [], longos = [];
    d.ui.deslizar = (el, o) => { gestos.push({ el, o }); return () => {}; };
    d.ui.toqueLongo = (el, fn) => longos.push({ el, fn });
    const detalhes = [], respostas = [];
    const { chat, A } = await montarChat(d, { msgs: [txt(1, "in", 5)], acoes: { abrirDetalhes: () => detalhes.push(1) } });
    A.composer.responder = m => respostas.push(m.id);
    const g = gestos.find(x => x.el.classList.contains("cv-bolha"));
    assert.ok(g && typeof g.o.direita === "function", "a bolha desliza para a direita");
    g.o.direita();
    assert.deepEqual(respostas, [1]);
    assert.match(ler("conversas.css"), /@media \(hover: none\) \{ \.cv-msg-acoes \{ display: none; \} \}/, "as setas somem no toque");
    achar(chat.el, ".cvc-mais").click();
    const folha = achar(d.doc.body, "dialog.cv-folha");
    assert.equal(folha.open, true);
    assert.deepEqual(folha.querySelectorAll(".cv-folha-grupo h3").map(x => x.textContent).slice(0, 2), ["Atendimento", "Contato"]);
    assert.equal(d.menus.length, 0, "nada de popover no celular");
    botaoTexto(folha, /^Fechar$/).click();
    assert.equal(d.doc.body.querySelector("dialog.cv-folha"), null);
    A.raiz.dataset.lateral = "gaveta";
    chat.renderCabecalho();
    achar(chat.el, ".cvc-quem").click();
    assert.deepEqual(detalhes, [1], "no celular o nome abre a gaveta de Detalhes");
  } finally { globalThis.matchMedia = mm; d.fim(); }
  const d2 = comDom({ grosso: true });
  try {
    const longos = [];
    d2.ui.toqueLongo = (el, fn) => longos.push({ el, fn });
    await montarChat(d2, { provedor: "codewords", conv: { canal: { nome: "Celular", provedor: "codewords" } }, msgs: [txt(1, "in", 5, { wamid: null })] });
    assert.ok(longos.length, "o toque longo existe mesmo sem citação");
    longos[0].fn();
    const it = d2.menus.at(-1).itens.find(x => /citando/.test(x.rotulo));
    assert.equal(it.rotulo, "Responder citando (este número não envia citação)");
    assert.equal(it.desabilitado, true);
  } finally { d2.fim(); }
});

test("CA-138/CA-087 (DOM) · a pílula de novas só some quando a última nova entra na tela; abrir com muitas não lidas para no separador", async () => {
  const d = comDom();
  const IO = globalThis.IntersectionObserver;
  let io = null;
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.alvos = []; io = this; } observe(el) { this.alvos.push(el); } disconnect() { this.alvos = []; } };
  try {
    const { chat, A } = await montarChat(d, { msgs: [txt(1, "in", 9), txt(2, "in", 8)] });
    const caixa = achar(chat.el, ".cvc-msgs");
    caixa.scrollHeight = 1000; caixa.clientHeight = 300; caixa.scrollTop = 0;
    A.msgs = [...A.msgs, txt(3, "in", 0)];
    chat.renderMensagens({ rolar: "novas" });
    const pilula = achar(chat.el, ".cvc-novas");
    assert.equal(pilula.hidden, false);
    assert.equal(io.alvos.at(-1).dataset.id, "3", "vigia a última mensagem nova");
    caixa.scrollTop = 650;                                           // perto do fim (80 px) — antes isso já fechava a pílula
    d.ev(caixa, "scroll");
    assert.equal(pilula.hidden, false, "chegar perto do fim não basta");
    io.cb([{ isIntersecting: true, target: io.alvos.at(-1) }]);
    assert.equal(pilula.hidden, true, "a última nova apareceu: a pílula sai");
  } finally { globalThis.IntersectionObserver = IO; d.fim(); }
  const d2 = comDom();
  try {
    const msgs = Array.from({ length: 8 }, (_, i) => txt(i + 1, "in", 20 - i));
    const { chat, A } = await montarChat(d2, { msgs });
    A.marcaNovas = 4;
    chat.renderTudo({ rolar: "separador" });
    await esperar(5);
    assert.ok(achar(chat.el, ".cv-novas-sep"));
    const p = achar(chat.el, ".cvc-novas");
    assert.equal(p.hidden, false);
    assert.match(p.textContent, /Ir para o fim/);
    assert.match(ler("conversas.js"), /A\.L\.abrirNoSeparador\(A\.marcaNovas, ver\.conversa && ver\.conversa\.nao_lidas\) \? "separador" : "fim"/);
  } finally { d2.fim(); }
});

test("CA-139/CA-105 (DOM) · carregando: esqueleto de bolhas (não de lista) e aviso de conexão lenta com «Tentar de novo»", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d);
    chat.mostrarCarregando();
    const sk = chat.el.querySelectorAll(".cvc-sk-bolhas .cvc-sk-bolha");
    assert.deepEqual(sk.map(x => x.dataset.dir), ["in", "out", "in", "out"]);
    assert.equal(chat.el.querySelector(".cvc-trilho .esqueleto"), null, "nada de linhas com avatar");
    let tentou = 0;
    chat.mostrarLento(() => tentou++);
    chat.mostrarLento(() => tentou++);
    assert.equal(chat.el.querySelectorAll(".cvc-lento").length, 1);
    assert.match(achar(chat.el, ".cvc-lento").textContent, /A conexão está lenta… ainda tentando/);
    botaoTexto(chat.el, /^Tentar de novo$/).click();
    assert.equal(tentou, 1);
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (b) lista */
test("CA-090/CA-125/CA-235/CA-247 (DOM) · lista: titles em português, «3 conversas com mensagens novas», selo Bloqueado e «IA:» no lugar de «Você:»", async () => {
  const d = comDom();
  try {
    const canais = [{ id: "k1", nome: "Recepção", provedor: "meta" }, { id: "k2", nome: "Celular", provedor: "codewords" }];
    const t = await montarLista(d, { aba: "minhas", contagens: { nao_lidas: 3 }, base: { canais },
      itens: [conv(1, { ultima_msg_dir: "out", ultima_msg_origem: "ia", canal: canais[0] }), conv(2, { oculta: true }), conv(4, { aguardando: true })] });
    assert.equal(achar(t.lista.el, ".cvl-titulo small").textContent, "3 conversas com mensagens novas");
    const [l1, l2, l4] = t.lista.el.querySelectorAll(".cvl-item");
    assert.equal(achar(l1, ".cvl-canal").getAttribute("title"), "Chegou pelo número Recepção");
    assert.equal(achar(l1, ".cvl-resumo b").textContent, "IA: ");
    assert.match(l1.getAttribute("aria-label"), /IA: oi/);
    assert.equal(achar(l2, ".cvl-bloq").textContent, "Bloqueado");
    assert.equal(l4.querySelector(".cvl-bloq"), null);
    assert.equal(achar(l4, ".cvl-espera").getAttribute("title"), "Esperando resposta há 4 min", "sem o dois-pontos sobrando");
  } finally { d.fim(); }
});

test("CA-091 (DOM) · busca por um telefone válido sem resultado oferece «Nova conversa com (12) 99999-8888»", async () => {
  const d = comDom();
  try {
    const novas = [];
    const t = await montarLista(d, { acoes: { novaConversa: o => novas.push(o) } });
    t.A.busca = "12999998888";
    t.lista.render();
    const b = achar(t.lista.el, ".cvl-nova-tel button");
    assert.equal(b.textContent, "Nova conversa com (12) 99999-8888");
    b.click();
    assert.deepEqual(novas, [{ telefone: "12999998888" }]);
    t.A.busca = "Mariana";
    t.lista.render();
    assert.equal(t.lista.el.querySelector(".cvl-nova-tel"), null, "nome não vira telefone");
    t.A.busca = "12345678";
    t.lista.render();
    assert.equal(t.lista.el.querySelector(".cvl-nova-tel"), null, "número que não vale também não");
  } finally { d.fim(); }
});

test("CA-046/CA-109 (DOM) · lote também transfere e etiqueta as marcadas; no celular deslizar a linha resolve ou marca como lida", async () => {
  const d = comDom();
  try {
    const t = await montarLista(d, { itens: [conv(1), conv(2), conv(3)], acoes: {
      transferirLote: async ids => { t.chamadas.push(["transferirLote", ids]); return true; }, etiquetarLote: async ids => { t.chamadas.push(["etiquetarLote", ids]); return false; } } });
    achar(t.lista.el, ".cvl-sel-bt").click();
    for (const id of [1, 3]) d.ev(t.lista.el.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    achar(t.lista.el, ".cvl-lote-transf").click();
    await esperar(5);
    assert.deepEqual(t.chamadas.find(c => c[0] === "transferirLote")[1], [1, 3]);
    assert.equal(achar(t.lista.el, ".cvl-lote").hidden, true, "confirmou: sai do modo seleção");
    achar(t.lista.el, ".cvl-sel-bt").click();
    d.ev(t.lista.el.querySelector('.cvl-item[data-id="2"]'), "click");
    achar(t.lista.el, ".cvl-lote-etq").click();
    await esperar(5);
    assert.deepEqual(t.chamadas.find(c => c[0] === "etiquetarLote")[1], [2]);
    assert.equal(achar(t.lista.el, ".cvl-lote").hidden, false, "cancelou o modal: a seleção continua");
  } finally { d.fim(); }
  const d2 = comDom({ grosso: true });
  try {
    const gestos = [];
    d2.ui.deslizar = (el, o) => { gestos.push({ el, o }); return () => {}; };
    const lidas = [];
    const t = await montarLista(d2, { itens: [conv(1, { nao_lidas: 2 }), conv(2)], acoes: { lidaComDesfazer: id => lidas.push(id) } });
    const g1 = gestos.find(g => g.el.dataset.id === "1");
    assert.equal(g1.el.dataset.gestoE, "Resolver");
    assert.equal(g1.el.dataset.gestoD, "Marcar como lida");
    g1.o.esquerda();
    assert.deepEqual(t.chamadas.find(c => c[0] === "resolverLote")[1], [1], "resolver pelo caminho com Desfazer");
    g1.o.direita();
    assert.deepEqual(lidas, [1]);
    const g2 = gestos.find(g => g.el.dataset.id === "2");
    assert.equal(g2.o.direita, null, "sem não lidas, nada para marcar");
  } finally { d2.fim(); }
});

/* ---------------------------------------------------------------- (b) lateral */
test("CA-081 (DOM) · lateral: e-mail editável (Enter grava {id, email}; inválido não vai ao servidor) e «Adicionar cidade»", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d, { ver: { contato: { id: 5, nome: "Mariana Costa", telefone: "5512999990000", email: "m@x.com" } } });
    achar(t.alvo, '[data-foco="editar-email"]').click();
    let inp = achar(t.alvo, ".cvt-campo-caixa input");
    inp.value = "invalido"; d.ev(inp, "input"); d.ev(inp, "keydown", { key: "Enter" });
    await esperar(5);
    assert.equal(t.chamadas.filter(c => c[0] === "nx_contato_salvar").length, 0);
    assert.match(achar(t.alvo, ".cvt-campo-caixa [role=alert]").textContent, /Confira o e-mail/);
    inp = achar(t.alvo, ".cvt-campo-caixa input");
    inp.value = "mariana@novo.com"; d.ev(inp, "input"); d.ev(inp, "keydown", { key: "Enter" });
    await esperar(5);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_contato_salvar")[1], { p_contato: { id: 5, email: "mariana@novo.com" } });
    assert.equal(t.alvo.querySelector(".cvt-campo-caixa"), null, "gravou: o campo fecha");
    assert.ok(d.toasts.includes("E-mail atualizado."));
    botaoTexto(t.alvo, /^Adicionar cidade$/).click();
    inp = achar(t.alvo, ".cvt-campo-caixa input");
    inp.value = "Taubaté"; d.ev(inp, "input"); d.ev(inp, "keydown", { key: "Escape" });
    assert.equal(t.alvo.querySelector(".cvt-campo-caixa"), null, "Esc desiste");
    assert.equal(t.chamadas.filter(c => c[0] === "nx_contato_salvar").length, 1);
  } finally { d.fim(); }
});

test("CA-083/CA-242 (DOM) · lateral: a etapa muda no cartão (nx_negocio_mover só quando o aviso fecha; Desfazer volta) e «Ganhou/Perdeu» pela ponte do CRM", async () => {
  const d = comDom();
  try {
    const funis = [{ id: "f1", estagios: [{ id: "s1", nome: "Nova", tipo: "aberto", ordem: 1 }, { id: "s2", nome: "Agendada", tipo: "aberto", marco: "agendada", ordem: 2 },
      { id: "s3", nome: "Orçamento", tipo: "aberto", ordem: 3 }, { id: "s5", nome: "Fechou", tipo: "ganho", ordem: 4 }] }];
    const rpcs = [];
    const api = { rpcC: async (nome, p) => { rpcs.push([nome, p]); return nome === "nx_crm_base" ? { campos: [], funis } : {}; }, fn: async () => ({}) };
    const t = await montarLateral(d, { api, ver: { negocios: [{ id: 1, titulo: "Aparelho", funil_id: "f1", estagio_id: "s1", estagio_nome: "Nova", estagio_tipo: "aberto", status: "aberto", valor_previsto: 5200 }] } });
    await esperar(10);
    const sel = achar(t.alvo, ".cvt-etapa-sel");
    assert.deepEqual(sel.querySelectorAll("option").map(o => o.textContent), ["Nova", "Orçamento"], "agendada e fechamento ficam na ficha (pedem data/valor/motivo)");
    sel.value = "s3"; d.ev(sel, "change");
    await esperar(5);
    assert.equal(rpcs.filter(c => c[0] === "nx_negocio_mover").length, 0, "nada vai antes do aviso fechar");
    const des = d.desfazeres.at(-1);
    assert.equal(des.texto, "«Aparelho» foi para «Orçamento»");
    assert.equal(t.A.ver.negocios[0].estagio_nome, "Orçamento");
    des.reverter();
    assert.equal(t.A.ver.negocios[0].estagio_nome, "Nova", "Desfazer volta a etapa");
    await des.firmar({});
    assert.deepEqual(rpcs.find(c => c[0] === "nx_negocio_mover")[1], { p_id: 1, p_estagio: "s3", p_ordem: null, p_extra: {} });
    assert.equal(t.alvo.querySelector(".cvt-ganhou"), null, "sem a ponte do CRM, sem botão que não funciona");
    const fechados = [];
    t.A.ctx.moverNegocio = (id, o) => fechados.push([id, o.tipo]);
    t.lat.render();
    achar(t.alvo, ".cvt-ganhou").click();
    achar(t.alvo, ".cvt-perdeu").click();
    assert.deepEqual(fechados, [[1, "ganho"], [1, "perdido"]]);
  } finally { d.fim(); }
});

test("CA-084 (DOM) · lateral: adiar a tarefa para amanhã às 9h em um toque (nx_tarefa_salvar só com o prazo)", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    achar(t.alvo, ".cvt-tar-adiar").click();
    const menu = d.menus.at(-1);
    assert.deepEqual(menu.itens.map(x => x.rotulo), ["Amanhã às 9h", "Mais 1 hora", "Escolher…"]);
    const esperado = L.adiarTarefa("amanha9");
    menu.itens[0].fn();
    await esperar(5);
    assert.deepEqual(t.chamadas.find(c => c[0] === "nx_tarefa_salvar")[1], { p_tarefa: { id: 71, vence_em: esperado } });
    assert.ok(t.chamadas.some(c => c[0] === "recarregarVer"));
  } finally { d.fim(); }
});

test("CA-102 (DOM) · lateral: 10 redesenhos sem mudança calculam a série dos 7 dias uma vez só", async () => {
  const d = comDom();
  try {
    let n = 0;
    const logica = { ...L, interacoesPorDia: (...a) => { n++; return L.interacoesPorDia(...a); } };
    const t = await montarLateral(d, { logica });
    t.A.msgs = [txt(1, "in", 30), txt(2, "out", 20)];
    t.lat.render();
    const depois = n;
    for (let i = 0; i < 10; i++) { t.A.msgs = [...t.A.msgs]; t.lat.render(); }
    assert.equal(n, depois, "o mesmo conteúdo (outro array, como no delta) não recalcula");
    t.A.msgs = [...t.A.msgs, txt(3, "in", 1)];
    t.lat.render();
    assert.equal(n, depois + 1, "chegou mensagem: recalcula");
  } finally { d.fim(); }
});

test("CA-124/CA-236/CA-237/CA-241/CA-088 (DOM) · lateral: 1ª resposta útil x corrida, rótulo das carregadas, resumo sobe, cota soma e erro da IA por motivo", async () => {
  const d = comDom();
  try {
    let falha = null;
    const api = { rpcC: async () => ({ campos: [] }), fn: async () => { if (falha) throw falha; return { texto: "Quer aparelho; orçamento na sexta." }; } };
    const t = await montarLateral(d, { api, ver: { conversa: { id: 9, protocolo: "ORB-9", etiquetas: [], atribuida: { nome: "Ana" }, departamento_id: "d1",
      aberta_em: "2026-10-10T23:00:00Z", primeira_resposta_em: "2026-10-12T12:15:00Z" } } });
    const dl = () => achar(t.alvo, ".cvt-dl");
    const linha = rot => { const dts = dl().querySelectorAll("dt"); const i = dts.findIndex(x => x.textContent === rot); return i >= 0 ? dl().querySelectorAll("dd")[i] : null; };
    // plano 2000d: desde o 1500c (CX-062) mais de um dia vira «1 d 13 h»
    assert.equal(linha("1ª resposta (tempo corrido)").textContent, "1 d 13 h", "sem o horário, o rótulo diz que é corrido");
    const seg = [["08:00", "18:00"]];
    t.A.base.config = { departamentos: [{ id: "d1", padrao: true, horario: { 1: seg, 2: seg, 3: seg, 4: seg, 5: seg } }] };
    t.lat.render();
    assert.equal(linha("1ª resposta").textContent, "1 h 15 min no horário de atendimento · 1 d 13 h corridos (chegou fora do horário)");
    assert.equal(achar(t.alvo, ".cvt-mini-cab .rotulo").textContent, "Mensagens carregadas · 7 dias");
    t.A.base.ia = { ligada: true, cota: { limite: 10, usadas: 2 } };
    t.lat.render();
    const secs = () => t.alvo.querySelector(".cv-lat").children.map(x => x.dataset.sec || x.className);
    assert.equal(secs().at(-1), "resumo-ia", "sem resumo, a seção fica no fim");
    falha = Object.assign(new Error("ia"), { codigo: "ia_indisponivel", detalhe: "sem_chave" });
    botaoTexto(t.alvo, /^Resumir$/).click();
    await esperar(5);
    assert.equal(d.toasts.at(-1), "A IA ainda não foi configurada para esta empresa.");
    falha = null;
    botaoTexto(t.alvo, /^Resumir$/).click();
    await esperar(5);
    assert.equal(t.A.base.ia.cota.usadas, 3, "o resumo também gasta a cota");
    assert.equal(secs()[1], "resumo-ia", "com resumo, logo depois do cartão do contato");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- (c) a central inteira */
test("CA-229 (central) · o filtro da lista volta ao montar de novo (por empresa); tirar o filtro apaga a lembrança", async () => {
  const d = comDom();
  const srv = criarServidor();
  d.mem.set("nx-cv-filtro:c1", JSON.stringify({ nao_lidas: true, atendente: "eu", lixo: "x" }));
  let c = await montarCentral(d, srv);
  try {
    const p = srv.chamadas.filter(x => x[0] === "nx_cv_listar").at(-1)[1].p_filtro;
    assert.equal(p.nao_lidas, true);
    assert.equal(p.atendente, "eu");
    assert.equal(p.lixo, undefined, "só as chaves conhecidas voltam");
    const chip = c.alvo.querySelectorAll(".cvl-filtro-chip").find(b => /Só não lidas/.test(b.textContent));
    chip.click();
    await esperar(10);
    assert.deepEqual(JSON.parse(d.mem.get("nx-cv-filtro:c1:u1")), { atendente: "eu" });   // plano 2000d: DC-020 — por empresa e conta (a chave só da empresa é migrada)
    c.fim();
    c = await montarCentral(d, srv);
    assert.deepEqual(srv.chamadas.filter(x => x[0] === "nx_cv_listar").at(-1)[1].p_filtro, { aba: "minhas", atendente: "eu" });
    achar(c.alvo, ".cvl-filtro-chip").click();
    await esperar(10);
    assert.equal(d.mem.has("nx-cv-filtro:c1:u1"), false, "sem filtro, sem lembrança");
  } finally { c.fim(); d.fim(); }
});

test("CA-230 (central) · reabrir na aba Resolvidas diz para onde a conversa foi e leva até lá", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[0].status = "resolvida";
  srv.handlers.nx_cv_status = p => { const cv = srv.convs.find(x => x.id === p.p_conversa); cv.status = p.p_status; cv.atribuida_a = null; return { ...cv }; };
  const els = [];
  const toast = d.ui.toast;
  d.ui.toast = (t, o) => { const r = toast(t, o); els.push(r.el); return r; };
  const c = await montarCentral(d, srv, { rota: { partes: [], query: { aba: "resolvidas" } } });
  try {
    await c.abrir(901);
    achar(c.alvo, '[data-acao="reabrir"]').click();
    await esperar(20);
    assert.ok(d.toasts.includes("Reaberta: agora está em Sem dono."));
    const ir = els.map(e => e.querySelector(".toast-acao")).find(Boolean);
    assert.equal(ir.textContent, "Ir para Sem dono");
    ir.click();
    await esperar(10);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_listar").at(-1)[1].p_filtro.aba, "sem_dono");
  } finally { c.fim(); d.fim(); }
});

test("CA-244 (central) · voltar para a aba do navegador atualiza a lista na hora (sem esperar o próximo pulso)", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    const antes = srv.conta("nx_cv_listar");
    d.doc.hidden = false;
    d.ev(d.doc, "visibilitychange");
    await esperar(300);
    assert.ok(srv.conta("nx_cv_listar") > antes, "carregarLista em < 300 ms");
  } finally { c.fim(); d.fim(); }
});

test("CA-246/CA-240 (central) · «Mensagem enviada.» para o leitor de tela; o título da aba é «Cliente 1 · Conversas»", async () => {
  const d = comDom();
  const srv = criarServidor();
  const titulos = [];
  const c = await montarCentral(d, srv, { extraCtx: { titulo: t => titulos.push(t) } });
  try {
    await c.abrir(901);
    await esperar(30);
    assert.ok(titulos.includes("Cliente 1 · Conversas"));
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "Bom dia!"; d.ev(ta, "input");
    achar(c.alvo, ".cvx-enviar").click();
    await esperar(60);
    assert.equal(srv.conta("nx-enviar:texto"), 1);
    assert.ok(d.anuncios.includes("Mensagem enviada."), "o ✓ sozinho não é anunciado");
  } finally { c.fim(); d.fim(); }
});

test("CA-123 (central) · aviso na área de trabalho só com o nome; o texto só aparece com a opção ligada", async () => {
  const d = comDom();
  const avisos = [];
  class N { constructor(t, o) { avisos.push({ t, o }); } addEventListener() {} close() {} }
  N.permission = "granted";
  const salvoN = Object.getOwnPropertyDescriptor(globalThis, "Notification");
  globalThis.Notification = N; d.janela.Notification = N;
  const srv = criarServidor();
  d.mem.set("nx-cv-avisos", JSON.stringify({ som: false, tela: true }));
  const c = await montarCentral(d, srv);
  try {
    d.doc.hidden = true;
    srv.convs[1].ultima_msg_resumo = "Meu exame deu alterado";
    srv.chegar(902, "Meu exame deu alterado");
    await c.pulso();
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].t, "Cliente 2");
    assert.equal(avisos[0].o.body, "Mensagem nova", "nada do que o paciente escreveu na tela bloqueada");
    d.mem.set("nx-cv-avisos:u1", JSON.stringify({ som: false, tela: true, texto: true }));   // plano 2000d: DC-020 — avisos por conta
    srv.chegar(902, "de novo");
    await c.pulso();
    assert.equal(avisos.at(-1).o.body, "Meu exame deu alterado");
  } finally { c.fim(); d.fim(); if (salvoN) Object.defineProperty(globalThis, "Notification", salvoN); else delete globalThis.Notification; }
});

test("CA-126/CA-160/CA-144 (central) · folha de atalhos: filtro, imprimir e «Copiar diagnóstico» sem token nem texto de mensagem", async () => {
  const d = comDom();
  const srv = criarServidor({ canais: [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true }, { id: "k2", nome: "Celular", provedor: "codewords", status: "ativo", tem_token: true }] });
  const copiados = [];
  d.ui.copiar = t => { copiados.push(t); return Promise.resolve(true); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.ev(d.doc, "keydown", { key: "?" });
    const m = d.modais.at(-1);
    assert.equal(m.titulo, "Atalhos da central de conversas");
    const filtro = achar(m.corpo, ".cv-teclas-filtro");
    filtro.value = "etiqueta"; d.ev(filtro, "input");
    const vis = m.corpo.querySelectorAll(".cv-teclas-item").filter(x => !x.hidden);
    assert.equal(vis.length, 1);
    assert.match(vis[0].textContent, /Etiquetas da conversa/);
    assert.ok(botaoTexto(m.corpo, /^Imprimir$/));
    assert.match(achar(m.corpo, ".cv-teclas-cw").textContent, /CodeWords.*não dá para responder citando/);
    achar(m.corpo, ".cv-diag").click();
    const txt = copiados.at(-1);
    assert.match(txt, /conversa aberta: 901/);
    assert.match(txt, /conta: u1 · empresa: c1/);
    assert.doesNotMatch(txt, /p_token|oi$/m, "sem token e sem o texto da conversa");
  } finally { c.fim(); d.fim(); }
});

test("CA-228/CA-151 (central) · «Linhas compactas» no menu do sino; ocultar diz onde desfazer", async () => {
  const d = comDom();
  const srv = criarServidor();
  const confirmacoes = [];
  d.ui.confirmar = async o => { confirmacoes.push(o); return false; };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-avisos").click();
    const it = d.menus.at(-1).itens.find(x => x && x.rotulo === "Linhas compactas: desligado");
    assert.ok(it, "a densidade mora com as preferências da lista");
    it.fn();
    assert.equal(achar(c.alvo, ".cv").dataset.densidade, "compacta");
    assert.equal(d.mem.get("nx-cv-densidade:u1"), "compacta");   // plano 2000d: DC-020 — por conta
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    d.menus.at(-1).itens.find(x => x && x.rotulo === "Ocultar e bloquear (spam)").fn();
    await esperar(5);
    assert.match(confirmacoes.at(-1).texto, /Para desfazer: aba Ocultas .*→ abra a conversa → ⋮ → Desfazer bloqueio/);
  } finally { c.fim(); d.fim(); }
});

test("CA-155/CA-238/CA-114 (central) · nova conversa: «Ver mais» com o telefone de cada um, status só com a contagem e aviso de atendimento aberto por outro número", async () => {
  const d = comDom();
  const srv = criarServidor({ canais: [{ id: "k1", nome: "Recepção", provedor: "meta", status: "ativo", tem_token: true }, { id: "k2", nome: "Celular", provedor: "codewords", status: "ativo", tem_token: true }] });
  const todos = Array.from({ length: 20 }, (_, i) => ({ id: 700 + i, nome: "Maria", telefone: `55129999900${String(i).padStart(2, "0")}` }));
  srv.handlers.nx_contatos_listar = p => { const ini = (p.p_pagina - 1) * p.p_por_pagina; return { itens: todos.slice(ini, ini + p.p_por_pagina), total: 20, tem_mais: ini + p.p_por_pagina < 20 }; };
  srv.handlers.nx_contato_ver = () => ({ contato: todos[0], conversas: [{ id: 950, status: "aberta", canal_id: "k2", protocolo: "ORB-950" }] });
  const c = await montarCentral(d, srv);
  try {
    let modal = null, fechar = null;
    d.aoModal(o => { modal = o; return new Promise(r => { fechar = r; }); });
    botaoTexto(c.alvo, /^Nova$/).click();
    await esperar(5);
    const busca = achar(modal.corpo, "#cv-nv-busca"); busca.value = "maria"; d.ev(busca, "input");
    await esperar(10);
    const res = achar(modal.corpo, ".cv-busca-contato");
    assert.equal(res.getAttribute("aria-live"), null, "a lista não é lida inteira a cada busca");
    assert.equal(achar(modal.corpo, "[role=status].sr-only").textContent, "8 de 20 contatos encontrados.");
    botaoTexto(modal.corpo, /^Ver mais$/).click();
    await esperar(10);
    assert.equal(res.querySelectorAll(".cv-contato-op").length, 16);
    assert.equal(achar(res, ".cv-contato-op small").textContent, "5512999990000", "o telefone inteiro diferencia as Marias");
    achar(res, ".cv-contato-op").click();
    const erros = [];
    const api = { erro: m => erros.push(m), fechar: v => fechar(v) };
    assert.equal(await modal.acoes[1].fn(api), false, "não cria a 2ª conversa sem avisar");
    const aviso = achar(modal.corpo, ".cv-nv-outro");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /pelo número Celular \(ORB-950\)\. Abrir aquele\?/);
    assert.equal(srv.conta("nx_cv_nova"), 0);
    botaoTexto(aviso, /Abrir aquele atendimento/).click();
    await esperar(20);
    assert.ok(srv.chamadas.some(x => x[0] === "nx_cv_ver" && x[1].p_id === 950), "abriu a que já existia");
  } finally { c.fim(); d.fim(); }
});

test("CA-157/CA-158 (central) · Alt+Shift+O abre o negócio ligado (ou diz que não há); Alt+Shift+E abre as etiquetas", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[1].negocio = { id: 77 };
  const abertos = [];
  const c = await montarCentral(d, srv, { extraCtx: { abrirNegocio: id => abertos.push(id) } });
  try {
    await c.abrir(901);
    d.ev(d.doc, "keydown", { key: "O", code: "KeyO", altKey: true, shiftKey: true });
    assert.match(d.toasts.at(-1), /não tem negócio ligado/);
    await c.abrir(902);
    d.ev(d.doc, "keydown", { key: "O", code: "KeyO", altKey: true, shiftKey: true });
    assert.deepEqual(abertos, [77]);
    d.ev(d.doc, "keydown", { key: "E", code: "KeyE", altKey: true, shiftKey: true });
    assert.equal(d.modais.at(-1).titulo, "Etiquetas da conversa");
  } finally { c.fim(); d.fim(); }
});

test("CA-046 (central, conv-2) · transferir 2 em lote: um Desfazer e os nx_cv_atribuir só no fim; etiquetar acrescenta às que já tinham", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 3 });
  srv.convs[2].etiquetas = ["e1"];
  const c = await montarCentral(d, srv);
  try {
    d.aoModal(o => { achar(o.corpo, "#cv-trl-pessoa").value = "u2"; return o.acoes[1].fn(); });
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    achar(c.alvo, ".cvl-lote-transf").click();
    await esperar(10);
    const des = d.desfazeres.at(-1);
    assert.equal(des.texto, "2 conversas transferidas para Ana Paula");
    assert.equal(srv.conta("nx_cv_atribuir"), 0);
    await des.firmar({});
    assert.equal(srv.conta("nx_cv_atribuir"), 2);
    assert.ok(srv.chamadas.filter(x => x[0] === "nx_cv_atribuir").every(x => x[1].p_conta === "u2"));
    d.aoModal(o => { achar(o.corpo, "#cv-etl-e2").checked = true; return o.acoes[1].fn({ erro() {} }); });
    achar(c.alvo, ".cvl-sel-bt").click();
    d.ev(c.alvo.querySelector('.cvl-item[data-id="903"]'), "click");
    achar(c.alvo, ".cvl-lote-etq").click();
    await esperar(20);
    // plano 2000d: DC-014 — etiquetar em lote agora tem Desfazer: o servidor só ouve quando o aviso fecha
    { const des = d.desfazeres.at(-1); await des.firmar({}); await esperar(10); }
    assert.deepEqual(srv.chamadas.find(x => x[0] === "nx_cv_etiquetas")[1], { p_conversa: 903, p_etiquetas: ["e1", "e2"] });
  } finally { c.fim(); d.fim(); }
});

test("CA-105 (central) · a conversa que não abre ganha «A conexão está lenta…» e «Tentar de novo» pede de novo", async () => {
  const d = comDom();
  const srv = criarServidor();
  const ver = srv.handlers.nx_cv_ver;
  srv.handlers.nx_cv_ver = p => (p.p_id === 903 ? new Promise(() => {}) : ver(p));
  const c = await montarCentral(d, srv);
  const antes = conversasMod.CONF.verLentoMs;
  conversasMod.CONF.verLentoMs = 30;
  try {
    c.ctx.navegar("#/conversas/903");
    await esperar(80);
    const lento = achar(c.alvo, ".cvc-lento");
    const n = srv.chamadas.filter(x => x[0] === "nx_cv_ver" && x[1].p_id === 903).length;
    botaoTexto(lento, /^Tentar de novo$/).click();
    await esperar(10);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_ver" && x[1].p_id === 903).length, n + 1);
  } finally { conversasMod.CONF.verLentoMs = antes; c.fim(); d.fim(); }
});

test("CA-232 (central) · «Exportar conversa (.txt)» baixa as mensagens em ordem, sem notas internas", async () => {
  const d = comDom();
  const m = (id, dir, tipo, corpo, min) => ({ id, conversa_id: 901, direcao: dir, tipo, corpo, status: "recebida", criado_em: agoraIso(min), atualizado_em: agoraIso(min) });
  const srv = criarServidor({ mensagens: { 901: [m(10, "in", "texto", "Tem horário?", 30), m(11, "out", "nota", "segredo da equipe", 20), m(12, "out", "texto", "Sexta às 9h", 10)] } });
  const blobs = [];
  const salvo = URL.createObjectURL;
  URL.createObjectURL = b => { blobs.push(b); return "blob:teste"; };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, ".cvc-mais").click();
    await d.menus.at(-1).itens.find(x => x && x.rotulo === "Exportar conversa (.txt)").fn();
    await esperar(10);
    const texto = await blobs.at(-1).text();
    const linhas = texto.trim().split(NL).map(x => x.replace(/\r$/, ""));   // plano 2000d: o .txt sai com CRLF (abre certo no Bloco de Notas)
    assert.match(linhas[0], /^Conversa com Cliente 1 · protocolo ORB-901/);
    // plano 1500c: o cabeçalho (responsável, número, período) entra entre o título e as mensagens — as mensagens são as duas últimas linhas
    assert.match(linhas.at(-2), / · Cliente 1: Tem horário\?$/);
    assert.match(linhas.at(-1), / · Equipe: Sexta às 9h$/);
    assert.doesNotMatch(texto, /segredo/);
  } finally { URL.createObjectURL = salvo; c.fim(); d.fim(); }
});

test("CA-113 (central) · teclado virtual aberto: a altura da central acompanha o visualViewport (390×780 → 390×420)", async () => {
  const d = comDom();
  const vv = { height: 780, offsetTop: 0, ouv: [], addEventListener(t, fn) { this.ouv.push(fn); }, removeEventListener() {} };
  d.janela.visualViewport = vv;
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    const raiz = achar(c.alvo, ".cv");
    assert.equal(raiz.style.getPropertyValue("--cv-altura"), "780px");
    vv.height = 420;
    for (const fn of vv.ouv) fn();
    await esperar(5);
    assert.equal(raiz.style.getPropertyValue("--cv-altura"), "420px", "o composer fica acima do teclado");
  } finally { c.fim(); d.fim(); }
});

test("CA-132 (central) · quem só lê, ou abre a conversa de um colega, não zera as não lidas de quem atende", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[0].nao_lidas = 2;
  srv.convs[1].nao_lidas = 2; srv.convs[1].atribuida_a = "u2";
  const c = await montarCentral(d, srv, { extraCtx: { pode: m => m === "leitura" } });
  try {
    await c.abrir(901);
    await esperar(20);
    assert.equal(srv.conta("nx_cv_marcar_lida"), 0, "papel leitura não marca");
  } finally { c.fim(); d.fim(); }
  const d2 = comDom();
  const srv2 = criarServidor();
  srv2.convs[1].nao_lidas = 2; srv2.convs[1].atribuida_a = "u2";
  srv2.convs[0].nao_lidas = 1;
  const c2 = await montarCentral(d2, srv2);
  try {
    await c2.abrir(902);
    await esperar(20);
    assert.equal(srv2.conta("nx_cv_marcar_lida"), 0, "conversa da Ana: quem espia não marca");
    await c2.abrir(901);
    await esperar(20);
    assert.equal(srv2.conta("nx_cv_marcar_lida"), 1, "a sem dono continua marcando");
  } finally { c2.fim(); d2.fim(); }
});

test("CA-117/CA-152/CA-153/CA-086/CA-111 · CSS: pontos com contorno, separador de novas com respiro e cor própria, nota tracejada, 4:3 enquanto carrega, folha de baixo; tokens", () => {
  const css = ler("conversas.css");
  const bloco = css.slice(css.indexOf("Plano 1000 (13/10/2026) — lote conv-2"));
  assert.ok(bloco.length > 500);
  assert.match(bloco, /\.cvl-dot \{ outline: 1px solid var\(--c-borda-2\);/);
  assert.match(bloco, /\.cv-novas-sep \{ margin: var\(--esp-3\) 0; color: var\(--c-prim\); \}/);
  assert.match(bloco, /\.cv-dia\[data-hoje="1"\] span \{ color: var\(--c-texto-2\);/, "o separador do dia fica neutro");
  assert.match(bloco, /\.cv-msg\[data-tipo="nota"\] \.cv-bolha \{ border-style: dashed;/);
  assert.match(bloco, /\.cv-midia img:not\(\[data-ok\]\):not\(\[data-dims\]\) \{ aspect-ratio: 4 \/ 3; \}/);
  assert.match(bloco, /\.cv-folha \{ margin: auto 0 0;/);
  assert.match(bloco, /@media \(prefers-reduced-motion: reduce\) \{ \.cv-folha\[open\] \{ animation: none; \}/);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "sem hex");
  assert.doesNotMatch(bloco, /transition:\s*all/);
});

test("revisão 13/10 · resolver em lote: quem escreveu durante o «Desfazer» NÃO é resolvido por cima (como no Resolver de uma só)", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 4 });
  srv.handlers.nx_cv_status = p => { const cv = srv.convs.find(x => x.id === p.p_conversa); cv.status = p.p_status; return { ...cv }; };
  const c = await montarCentral(d, srv);
  try {
    achar(c.alvo, ".cvl-sel-bt").click();
    for (const id of [901, 902, 903]) d.ev(c.alvo.querySelector(`.cvl-item[data-id="${id}"]`), "click");
    botaoTexto(achar(c.alvo, ".cvl-lote"), /^Resolver$/).click();
    await esperar(10);
    const des = d.desfazeres.at(-1);
    const cv = srv.convs.find(x => x.id === 902);
    cv.ultima_entrada_em = new Date(Date.now() + 1000).toISOString();   // a pessoa escreveu com o aviso na tela
    await des.firmar({});
    const resolvidas = srv.chamadas.filter(x => x[0] === "nx_cv_status").map(x => x[1].p_conversa).sort();
    assert.deepEqual(resolvidas, [901, 903], "antes: a 902 era resolvida por cima da mensagem nova");
    assert.ok(d.toasts.some(t => /escreveu de novo/.test(t)));
  } finally { c.fim(); d.fim(); }
});

test("SV-057 · mídia apagada pelo painel aparece como «Arquivo apagado», não como falha do WhatsApp", () => {
  const src = ler("cv-chat.js");
  assert.match(src, /estado === "apagada"/);
  assert.match(src, /Arquivo apagado\. /);
  assert.ok(src.indexOf('estado === "apagada"') < src.indexOf('estado === "falhou" || estado === "indisponivel"'), "o caso apagada vem antes do genérico «indisponível»");
});
