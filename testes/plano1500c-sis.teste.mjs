/* ============================================================
   ÓRBITA — plano «1500c» (21/10/2026) · frente sis (sistema: shell, login, PWA, rede, onboarding, venda)
   node --test testes/plano1500c-sis.teste.mjs
   Testes de COMPORTAMENTO dos itens UCB, UCC e UC da frente sis (o mesmo DOM de mentira do plano1000b-sis). O app.js não é
   importável: o que é dele roda função a função (fnApp) ou entra por regex no texto-fonte. Nada depende da hora em que a suíte roda.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");

/* ---------- DOM de mentira: h(), eventos com captura/bolha, seletores simples, closest, foco, dataset, estilo ---------- */
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.isTrusted = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === "object" && n && n.nodeType ? n : new Texto(n)); }
    prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === "object" && n && n.nodeType ? n : new Texto(n), this.firstChild); }
    after(...ns) { const p = this.parentNode; if (!p) return; let ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture), once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { if (o.once) n._ouv = n._ouv.filter(x => x !== o); o.fn(ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
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
    const partes = []; let nivel = 0, cur = "", comb = null;
    const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } };
    for (const c of s) {
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
        if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; }
        // :focus-visible = o elemento ativo, focado pelo teclado (doc.focoPorTeclado); doc.semFocusVisible imita o navegador que não conhece o seletor
        else if (mm[1] === "focus-visible") { if (doc.semFocusVisible) throw new SyntaxError("':focus-visible' is not a valid selector"); if (!(doc.activeElement === el && doc.focoPorTeclado)) return false; }
        else return false;
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
      this.offsetWidth = 0; this.offsetLeft = 0; this.offsetTop = 0; this.clientWidth = 0; this.selectionStart = null;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      for (const p of ["left", "top", "width", "transform"]) Object.defineProperty(this.style, p, { get: () => estilos.get(p) || "", set: v => { estilos.set(p, String(v)); } });
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
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); }
    set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
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
    click() { this.dispatchEvent(new Evento("click")); }
    scrollIntoView() {} setSelectionRange() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => { const f = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (c.attrs.get("id") === id) return c; const r = f(c); if (r) return r; } return null; }; return f(doc.documentElement); };
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.contains = n => doc.documentElement.contains(n);
  return { doc, Evento };
}

const { doc, Evento } = criarDom();
globalThis.document = doc;
globalThis.matchMedia = () => ({ matches: false });
globalThis.Event = Evento;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = f => setTimeout(f, 0);
globalThis.cancelAnimationFrame = t => clearTimeout(t);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const ev = (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init));
const limparCorpo = () => { for (const c of [...doc.body.childNodes]) c.remove(); };
/* foco pelo teclado (Tab: o navegador marca :focus-visible) × foco por script depois de um clique (gaveta/modal focando o «Fechar») */
const focarTeclado = el => { doc.focoPorTeclado = true; el.focus(); ev(el, "focusin"); };
const focarScript = el => { doc.focoPorTeclado = false; el.focus(); ev(el, "focusin"); };

if (typeof globalThis.CSS === "undefined") globalThis.CSS = { escape: s => String(s) };   // ui.marcarErro usa CSS.escape (o Node não tem)

const U = await import(pathToFileURL(join(APP, "ui.js")).href);
const G = await import(pathToFileURL(join(APP, "graficos.js")).href);
const P = await import(pathToFileURL(join(APP, "pulso.js")).href);
const A = await import(pathToFileURL(join(APP, "api.js")).href);
const C = await import(pathToFileURL(join(APP, "comandos.js")).href);
const PWA = await import(pathToFileURL(join(APP, "pwa.js")).href);
const T = await import(pathToFileURL(join(APP, "tema.js")).href);
const LOGIN = await import(pathToFileURL(join(APP, "login.js")).href);
const h = U.h;
const APP_JS = ler("app.js"), CSS_APP = ler("app.css"), SHELL_CSS = ler("shell.css"), HTML = ler("index.html"), SW_TXT = ler("sw.js"), ANTES_TXT = ler("antes.js");
const sprite = new Set([...HTML.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1]));
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const fnDoApp = assinatura => { const i = APP_JS.indexOf(assinatura); assert.ok(i >= 0, assinatura); return APP_JS.slice(i, APP_JS.indexOf("\n}\n", i) + 2); };

/* ============================================================ A1 · service worker: fonte e ícone sem ?v= ============================================================ */
/** Roda o sw.js num mundo de mentira (caches em memória, fetch programável): o mesmo esquema do shell.teste.mjs. */
// tetoTimeout: os prazos do sw.js (8 s por arquivo) são encurtados para o teste andar; 15 ms por padrão. O AS-208 usa um teto maior:
// com a máquina carregada um «download» de 8 ms passava dos 15 ms e virava falha, e o teste acusava 9–10 de 12 guardados (integração 13/10)
function criarMundoSW({ versao = "V2", site = "http://site.test", escopo = "/app/", resposta, tetoTimeout = 15 } = {}) {
  const armazem = new Map();
  const cachesFalso = {
    async open(n) {
      if (!armazem.has(n)) armazem.set(n, new Map());
      const m = armazem.get(n);
      return { async match(u) { const r = m.get(String(u)); return r ? r.clone() : undefined; }, async put(u, r) { m.set(String(u), r.clone ? r.clone() : r); }, async keys() { return [...m.keys()]; } };
    },
    async keys() { return [...armazem.keys()]; },
    async delete(n) { return armazem.delete(n); },
  };
  const chamadas = [];
  const fetchFalso = async req => {
    const url = typeof req === "string" ? req : req.url;
    chamadas.push(url);
    return resposta ? resposta(url, req) : new Response("ok:" + url, { status: 200, headers: { "content-type": "text/plain" } });
  };
  const ouvintes = {};
  const self_ = { location: { href: `${site}${escopo}sw.js?v=${versao}`, origin: site }, registration: { scope: `${site}${escopo}` }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener: (t, fn) => { ouvintes[t] = fn; } };
  runInNewContext(SW_TXT, { self: self_, caches: cachesFalso, fetch: fetchFalso, Request, Response, URL, URLSearchParams, Promise, AbortController, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, tetoTimeout)), clearTimeout, console });
  const evento = extra => { const pend = []; return { ...extra, respondWith(p) { this.resposta = p; }, waitUntil(p) { pend.push(p); }, async fim() { await Promise.all(pend); } }; };
  const req = (url, extra = {}) => ({ method: "GET", url: `${site}${url}`, mode: "cors", headers: new Headers(), ...extra });
  return { armazem, cachesFalso, chamadas, ouvintes, evento, req, site, self: self_ };   // plano 1500c: o self para os testes de notificationclick (UCC-123)
}

/* ---------- extras deste arquivo ---------- */
const CACHE = await import(pathToFileURL(join(APP, "cache.js")).href);
const ROTAS = await import(pathToFileURL(join(APP, "rotas.js")).href);
const VOCAB = await import(pathToFileURL(join(APP, "vocab.js")).href);
const LOGIN_TXT = ler("login.js"), UI_TXT = ler("ui.js"), API_TXT = ler("api.js");
/** Uma função de primeiro nível do app.js rodando sozinha, com as dependências dadas (o app.js não importa em Node). */
const fnApp = (assinatura, deps = {}, nome) => {
  const fonte = fnDoApp(assinatura);
  const n = nome || /function\s+([A-Za-z0-9_]+)/.exec(fonte)[1];
  return new Function(...Object.keys(deps), `"use strict";\n${fonte}\nreturn ${n};`)(...Object.values(deps));
};
const constDoApp = nome => { const m = new RegExp(`const ${nome} = [\\s\\S]*?;\\n`).exec(APP_JS); assert.ok(m, nome); return m[0]; };
const esperar = ms => new Promise(r => setTimeout(r, ms));
/** relógio manual (pulso/pwa) */
function relogioP1000(t0 = 0) {
  let t = t0; const fila = [];
  return { agora: () => t, agendar: (fn, ms) => { const id = Symbol(); fila.push({ id, fn, em: t + ms }); return id; }, cancelar: id => { const i = fila.findIndex(x => x.id === id); if (i >= 0) fila.splice(i, 1); }, pular(ms) { t += ms; } };
}


globalThis.innerWidth = globalThis.innerWidth || 1280; globalThis.innerHeight = globalThis.innerHeight || 800;   // menu/flutuante posicionam pela janela
/** o DOM de mentira não tem showModal/close */
function HTMLDialog() {
  const criar = doc.createElement;
  if (criar.__dlg) return;
  doc.createElement = t => { const el = criar(t); if (t === "dialog") { el.showModal = () => { el.open = true; }; el.close = () => { el.open = false; }; } return el; };
  doc.createElement.__dlg = true;
}
const loja = (ini = {}) => { const m = new Map(Object.entries(ini)); return { m, get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

/* ---------- extras do plano 1500c ---------- */
const REDE = await import(pathToFileURL(join(APP, "rede.js")).href);
const AJUDA = await import(pathToFileURL(join(APP, "ajuda.js")).href);
const PALETA_TXT = ler("paleta.js");
const montarLogin = async (modulo, partes, extra = {}) => {
  limparCorpo(); const alvo = h("div"); doc.body.appendChild(alvo);
  await LOGIN.montar({ alvo, rota: { modulo, partes, query: {} }, ui: U, titulo() {}, marca: {}, tema: T, pintarMarcaOrg() {}, versao: "dev", ...extra });
  await esperar(90);   // o foco inicial da tela (60 ms) já aconteceu: não rouba o foco que o teste confere depois
  return alvo;
};
const erroDe = (codigo, extra = {}) => Object.assign(new Error(codigo), { codigo, ...extra });
const resp = (corpo, status = 200, cab = {}) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...cab } });
const CONVITE_OK = { email: "", nome: "", papel: "atendente", cliente: { nome: "Clínica Sorriso" }, org: null };
globalThis.sessionStorage = globalThis.sessionStorage || loja();

/* ============================================================ login.js · lote sis-a1 (UCB-*) ============================================================ */
test("UCB-010 · convite com conta existente: senha errada limpa os DOIS campos de senha", async () => {
  const api = { publica: async n => { if (n === "nx_convite_ver") return CONVITE_OK; throw erroDe("credenciais_invalidas"); }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api, aoEntrar: async () => {} });
  const f = alvo.querySelector("form");
  f.querySelector("input[name=nome]").value = "Ana Souza"; f.querySelector("input[name=email]").value = "ana@x.com";
  f.querySelector("input[name=senha]").value = "Cavalo-azul-77"; f.querySelector("input[name=senha2]").value = "Cavalo-azul-77";
  ev(f, "submit"); await tick(6);
  assert.equal(f.querySelector("input[name=senha]").value, "");
  assert.equal(f.querySelector("input[name=senha2]").value, "", "«Repita a senha» não fica com o valor antigo");
  LOGIN.desmontar();
});

test("UCB-011 + UCB-012 · link de senha: «Senha criada» tem id t-senha e recebe o foco; link vencido troca o formulário pelo motivo + pedir link novo", async () => {
  const ok = await montarLogin("senha", ["a".repeat(64)], { api: { publica: async () => ({ ok: true }), mensagemErro: A.mensagemErro } });
  const f = ok.querySelector("form");
  f.querySelector("input[name=senha]").value = "Cavalo-azul-77"; f.querySelector("input[name=senha2]").value = "Cavalo-azul-77";
  ev(f, "submit"); await tick(6);
  const t = ok.querySelector("#t-senha");
  assert.equal(t.textContent, "Senha criada");
  assert.equal(doc.activeElement, t, "o foco vai para o título novo (não cai no body)");
  const morto = await montarLogin("senha", ["b".repeat(64)], { marca: { suporte_wa: "5512999998888" },
    api: { publica: async () => { throw erroDe("link_invalido"); }, mensagemErro: A.mensagemErro } });
  const f2 = morto.querySelector("form");
  f2.querySelector("input[name=senha]").value = "Cavalo-azul-77"; f2.querySelector("input[name=senha2]").value = "Cavalo-azul-77";
  ev(f2, "submit"); await tick(6);
  assert.equal(morto.querySelector("form"), null, "sem formulário morto");
  assert.match(morto.textContent, /Este link não vale mais/);
  assert.ok([...morto.querySelectorAll("a")].some(a => /Pedir um link novo/.test(a.textContent) && /5512999998888/.test(a.getAttribute("href"))));
  LOGIN.desmontar();
});

test("UCB-013 · convite: «Já tenho conta» esconde o «Repita a senha», usa current-password e aceita a senha antiga curta", async () => {
  const chamadas = [];
  const api = { publica: async (n, p) => { chamadas.push([n, p]); return n === "nx_convite_ver" ? CONVITE_OK : { token: "tk" }; }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api, aoEntrar: async () => {} });
  const f = alvo.querySelector("form");
  const caixa = f.querySelector("input[name=ja_tenho]");
  assert.ok(caixa, "a opção existe");
  caixa.checked = true; ev(caixa, "change");
  const s2 = f.querySelector("input[name=senha2]");
  const escondido = el => { for (let n = el; n; n = n.parentNode) if (n.hidden) return true; return false; };
  assert.equal(escondido(s2), true, "repetir some");
  assert.equal(f.querySelector("input[name=senha]").getAttribute("autocomplete"), "current-password");
  assert.match(f.querySelector("button[type=submit]").textContent, /Entrar e aceitar/);
  f.querySelector("input[name=nome]").value = "Ana"; f.querySelector("input[name=email]").value = "ana@x.com"; f.querySelector("input[name=senha]").value = "abc123";
  ev(f, "submit"); await tick(6);
  assert.ok(chamadas.some(([n]) => n === "nx_convite_aceitar"), "senha antiga (sem mínimo de 8) vai ao servidor");
  LOGIN.desmontar();
});

test("UCB-044 · senha fácil de adivinhar é recusada no convite, no link e na troca obrigatória (sem chamar o servidor)", async () => {
  for (const s of ["12345678", "senha1234", "aaaaaaaa", "abcdefgh", "Password1", "qwerty123"]) assert.equal(LOGIN.senhaFraca(s), true, s);
  assert.equal(LOGIN.senhaFraca("anasouza99", { email: "anasouza@x.com" }), true, "contém o e-mail");
  assert.equal(LOGIN.senhaFraca("Marcelo#2026", { nome: "Marcelo Lima" }), true, "contém o nome");
  for (const s of ["Cavalo-azul-77", "Outra#Senha9", "Segredo#123"]) assert.equal(LOGIN.senhaFraca(s), false, s);
  const chamadas = [];
  const alvo = await montarLogin("senha", ["a".repeat(64)], { api: { publica: async n => { chamadas.push(n); return {}; }, mensagemErro: A.mensagemErro } });
  const f = alvo.querySelector("form");
  f.querySelector("input[name=senha]").value = "12345678"; f.querySelector("input[name=senha2]").value = "12345678";
  ev(f, "submit"); await tick(4);
  assert.deepEqual(chamadas, []);
  assert.match(f.textContent, /fácil de adivinhar/);
  const tr = await montarLogin("trocar", [], { api: { rpc: async n => { chamadas.push(n); return {}; }, mensagemErro: A.mensagemErro }, sair() {}, aoTrocarSenha: async () => {},
    sessao: { conta: { email: "beto@x.com", nome: "Beto" } } });
  const ft = tr.querySelector("form");
  for (const [n, v] of [["atual", "Antiga#123"], ["nova", "senha12345"], ["nova2", "senha12345"]]) ft.querySelector(`input[name=${n}]`).value = v;
  ev(ft, "submit"); await tick(4);
  assert.deepEqual(chamadas, []);
  LOGIN.desmontar();
});

test("UCB-046 · bloqueio por tentativas sobrevive ao recarregar (fim guardado na aba) e retoma a contagem", async () => {
  assert.equal(LOGIN.restanteBloqueio(Date.now() + 90_000, Date.now()) > 85, true);
  assert.equal(LOGIN.restanteBloqueio(Date.now() - 1, Date.now()), 0);
  assert.equal(LOGIN.restanteBloqueio("lixo"), 0);
  const antes = globalThis.sessionStorage;
  globalThis.sessionStorage = loja({ "nx-login-bloq": String(Date.now() + 120_000) });
  try {
    const alvo = await montarLogin("login", [], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro, minutosDoHint: () => 15 } });
    const bt = alvo.querySelector("button[type=submit]");
    assert.equal(bt.disabled, true, "recarregou no meio do bloqueio: o botão continua esperando");
    assert.match(alvo.querySelector(".entrar-contagem").textContent, /\(\d+:\d\d\)/);
  } finally { LOGIN.desmontar(); globalThis.sessionStorage = antes; }
});

test("UCB-047 · com o hint «restam:N» a frase diz quantas tentativas faltam (sem hint, a de sempre)", async () => {
  assert.equal(LOGIN.tentativasRestantes("restam:2"), 2);
  assert.equal(LOGIN.tentativasRestantes(null), null);
  assert.match(LOGIN.fraseSenhaErrada("E-mail ou senha incorretos.", "restam:2"), /Mais 2 tentativas antes de bloquear/);
  assert.match(LOGIN.fraseSenhaErrada("X.", "restam:1"), /Mais 1 tentativa antes/);
  assert.equal(LOGIN.fraseSenhaErrada("X.", null), "X.");
  const alvo = await montarLogin("login", [], { api: { publica: async () => { throw erroDe("credenciais_invalidas", { hint: "restam:2" }); }, mensagemErro: A.mensagemErro, minutosDoHint: () => 15 } });
  const f = alvo.querySelector("form");
  f.querySelector("input[name=email]").value = "ana@x.com"; f.querySelector("input[name=senha]").value = "errada";
  ev(f, "submit"); await tick(6);
  assert.match(f.textContent, /Mais 2 tentativas/);
  LOGIN.desmontar();
});

test("UCB-048 · «Avisar o administrador» só com a marca pedir_senha; resposta sempre a mesma frase", async () => {
  const sem = await montarLogin("login", [], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.equal(sem.querySelector("form.entrar-pedido"), null, "servidor atual: nada aparece");
  const chamadas = [];
  const com = await montarLogin("login", [], { marca: { pedir_senha: true }, api: { publica: async (n, p) => { chamadas.push([n, p]); throw erroDe("credenciais_invalidas"); }, mensagemErro: A.mensagemErro } });
  const f = com.querySelector("form.entrar-pedido");
  f.querySelector("input[name=email_pedido]").value = " Ana@X.com ";
  ev(f, "submit"); await tick(6);
  assert.deepEqual(chamadas, [["nx_senha_pedir", { p_email: "ana@x.com" }]]);
  assert.match(f.textContent, new RegExp(LOGIN.FRASE_PEDIDO_SENHA.replace(/[.]/g, "\\.")), "não revela se o e-mail existe");
  LOGIN.desmontar();
});

test("UCB-049 · conta com 2 etapas: nx_entrar devolve precisa_codigo → pede o código → nx_entrar_codigo entra", async () => {
  const chamadas = [], entradas = [];
  const api = { publica: async (n, p) => { chamadas.push([n, p]); return n === "nx_entrar" ? { precisa_codigo: true, desafio: "d1" } : { token: "tk2" }; }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("login", [], { api, aoEntrar: async t => { entradas.push(t); } });
  const f = alvo.querySelector("form");
  f.querySelector("input[name=email]").value = "ana@x.com"; f.querySelector("input[name=senha]").value = "Cavalo-azul-77";
  ev(f, "submit"); await tick(6);
  assert.deepEqual(entradas, [], "ainda não entrou");
  const fc = alvo.querySelector("input[name=codigo]").closest("form");
  assert.equal(alvo.querySelector("input[name=codigo]").getAttribute("autocomplete"), "one-time-code");
  fc.querySelector("input[name=codigo]").value = "123 456";
  ev(fc, "submit"); await tick(6);
  assert.deepEqual(chamadas[1], ["nx_entrar_codigo", { p_desafio: "d1", p_codigo: "123456" }]);
  assert.deepEqual(entradas, ["tk2"]);
  LOGIN.desmontar();
});

test("UCB-051 · logo da entrada: claro usa logo_claro, escuro usa logo", () => {
  const m = { logo: "data:image/png;base64,ESCURO", logo_claro: "data:image/png;base64,CLARO" };
  assert.equal(LOGIN.logoDoEsquema(m, true), m.logo);
  assert.equal(LOGIN.logoDoEsquema(m, false), m.logo_claro);
  assert.equal(LOGIN.logoDoEsquema({ logo: "x" }, false), "x", "sem logo_claro, o único");
  assert.match(LOGIN_TXT, /attributeFilter: \["data-esquema"\]/, "acompanha a troca com a tela aberta");
});

test("UCB-052 · convite: conta_existente marca o campo de e-mail (e foca), não um erro solto", async () => {
  const api = { publica: async n => { if (n === "nx_convite_ver") return CONVITE_OK; throw erroDe("convite_invalido", { hint: "conta_existente" }); }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api, aoEntrar: async () => {} });
  const f = alvo.querySelector("form");
  f.querySelector("input[name=nome]").value = "Ana"; f.querySelector("input[name=email]").value = "ana@x.com";
  f.querySelector("input[name=senha]").value = "Cavalo-azul-77"; f.querySelector("input[name=senha2]").value = "Cavalo-azul-77";
  ev(f, "submit"); await tick(6);
  const em = f.querySelector("input[name=email]");
  assert.equal(em.getAttribute("aria-invalid"), "true");
  assert.equal(doc.activeElement, em);
  assert.ok(alvo.querySelector("form"), "o formulário continua (o convite ainda vale)");
  LOGIN.desmontar();
});

test("UCB-053 · caminho de quem ainda não usa: padrão → teste de 14 dias; revenda → fale com ela; teste_aberto → #/testar; sem nada → nada", async () => {
  const wa = (t, n) => `https://wa.me/${n}?text=${encodeURIComponent(t)}`;
  assert.match(LOGIN.caminhoProspect({ suporte_wa: "55" }, wa).rotulo, /teste grátis de 14 dias/);
  assert.match(LOGIN.caminhoProspect({ produto: "Clinix", suporte_wa: "55" }, wa).rotulo, /Fale com Clinix/);
  assert.deepEqual(LOGIN.caminhoProspect({ teste_aberto: true }, wa), { rotulo: "Ainda não usa? Testar grátis", href: "#/testar", externo: false });
  assert.equal(LOGIN.caminhoProspect({}, wa), null);
  const alvo = await montarLogin("login", [], { marca: { suporte_wa: "5512999998888" }, api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.ok(alvo.querySelector(".entrar-prospect a"));
  LOGIN.desmontar();
});

test("UCB-054 · «Ver demonstração» só com demo_publica; entra com demo:true e aparelho compartilhado; o shell mostra a faixa", async () => {
  const sem = await montarLogin("login", [], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.equal([...sem.querySelectorAll("button")].some(b => /demonstração/.test(b.textContent)), false);
  const entradas = [];
  const com = await montarLogin("login", [], { marca: { demo_publica: true }, api: { publica: async n => (n === "nx_demo_entrar" ? { token: "demo" } : {}), mensagemErro: A.mensagemErro },
    aoEntrar: async (t, o) => { entradas.push([t, o]); } });
  const bt = [...com.querySelectorAll("button")].find(b => /Ver demonstração/.test(b.textContent));
  bt.click(); await tick(6);
  assert.deepEqual(entradas, [["demo", { demo: true, compartilhado: true }]]);
  LOGIN.desmontar();
  assert.match(fnDoApp("function faixasDoMomento() {"), /emModoDemo\(\)[\s\S]*Demonstração · dados fictícios/);
  assert.match(fnDoApp("async function sair("), /nx-app-demo/, "sair apaga a marca da demonstração");
});

test("UCB-119 + UCB-120 · convite de gestor explica a conta separada; validade com menos de 2 h ganha o aviso de atenção", async () => {
  const api = { publica: async () => ({ ...CONVITE_OK, papel: "gestor", expira_em: new Date(Date.now() + 30 * 60000).toISOString() }), mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api });
  assert.match(alvo.textContent, /Gestores têm uma conta separada/);
  const v = alvo.querySelector(".entrar-validade");
  assert.ok(v.classList.contains("entrar-validade-aten"));
  assert.match(v.textContent, /Vence em (29|30) min/);
  assert.equal(LOGIN.avisoValidade(new Date(Date.now() + 5 * 3600000).toISOString()), null, "longe: a data de sempre");
  assert.match(CSS_APP, /\.entrar-validade-aten \{/);
  LOGIN.desmontar();
});

test("UCB-121 · troca obrigatória: «Sair» com algo digitado pergunta antes; vazio sai direto", async () => {
  let saiu = 0, perguntas = 0, resposta = false;
  const ui = { ...U, confirmar: async () => { perguntas++; return resposta; } };
  const alvo = await montarLogin("trocar", [], { ui, api: { rpc: async () => ({}), mensagemErro: A.mensagemErro }, sair() { saiu++; }, aoTrocarSenha: async () => {} });
  const sair = [...alvo.querySelectorAll("button")].find(b => b.textContent === "Sair");
  alvo.querySelector("input[name=nova]").value = "algo";
  sair.click(); await tick(4);
  assert.equal(perguntas, 1); assert.equal(saiu, 0, "respondeu «não»: fica");
  resposta = true; sair.click(); await tick(4); assert.equal(saiu, 1);
  alvo.querySelector("input[name=nova]").value = "";
  sair.click(); await tick(4); assert.equal(perguntas, 2, "vazio: sem pergunta"); assert.equal(saiu, 2);
  LOGIN.desmontar();
});

test("UCB-041 · o papel do convite vem do rotuloPapel do config.js (o mesmo do app inteiro)", async () => {
  const CFG = await import(pathToFileURL(join(APP, "config.js")).href);
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api: { publica: async () => ({ ...CONVITE_OK, papel: "leitura" }), mensagemErro: A.mensagemErro } });
  assert.match(alvo.querySelector(".entrar-convite").textContent, new RegExp(CFG.rotuloPapel("leitura", { minusculo: true })));
  assert.match(LOGIN_TXT, /cfg\.rotuloPapel\(papel, \{ minusculo: true \}\)/);
  LOGIN.desmontar();
});

/* ============================================================ api.js · ui.js (UCC-001…010) ============================================================ */
test("UCC-001 · sem internet: a frase de LEITURA some (a faixa já diz), a de ESCRITA («nada foi salvo») continua aparecendo", () => {
  const E = { rede: { estado: "offline" }, M: { api: A, ui: U } };
  const f = fnApp("function toastRepetidoDeRede(texto, { tipo } = {}) {", { E, RE_ESTADO_FALHA: /^(offline|servidor_fora)$/, frasesDeRede: null }, "toastRepetidoDeRede");
  const leitura = A.mensagemErro({ codigo: "sem_conexao", contexto: { leitura: true } });
  const escrita = A.mensagemErro({ codigo: "sem_conexao", contexto: { leitura: false } });
  assert.notEqual(leitura, escrita);
  assert.equal(f(leitura, { tipo: "erro" }), true);
  assert.equal(f(escrita, { tipo: "erro" }), false, "o aviso de que NADA foi salvo não é engolido");
});

test("UCC-002 · 504 sem corpo numa escrita vira http_504 («confira se salvou»); numa leitura, tempo_esgotado", async () => {
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", cliente: () => "c", fetch: async () => new Response("", { status: 504 }) });
  await assert.rejects(api.rpcC("nx_contato_salvar", {}), e => e.codigo === "http_504" && /confira se salvou/.test(A.mensagemErro(e)));
  await assert.rejects(api.rpcC("nx_contatos_listar", {}), e => e.codigo === "tempo_esgotado");
});

test("UCC-003 · PGRST202 (função não instalada) vira frase em português; o código continua o mesmo", async () => {
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", cliente: () => "c",
    fetch: async () => resp({ code: "PGRST202", message: "Could not find the function public.nx_x(p_token) in the schema cache" }, 404) });
  await assert.rejects(api.rpc("nx_coisa_nova", {}), e => {
    assert.equal(e.funcaoAusente, true);
    assert.match(e.codigo, /Could not find the function/, "as telas continuam detectando pelo código");
    assert.equal(A.mensagemErro(e), "Esta função ainda não foi instalada no servidor; avise o suporte.");
    return true;
  });
});

test("UCC-004 · 429 com Retry-After diz quanto esperar", async () => {
  assert.match(A.mensagemErro({ codigo: "http_429", retryAfterMs: 7000 }), /espere 7 s/);
  assert.match(A.mensagemErro({ codigo: "limite_taxa", retryAfterMs: 120000 }), /espere 2 min/);
  assert.doesNotMatch(A.mensagemErro({ codigo: "http_429" }), /espere/);
});

test("UCC-005 · _estado/_resumo/_contar/_historico são leituras; os contadores das Edge Functions continuam escrita", () => {
  for (const n of ["nx_canal_estado", "nx_ads_resumo", "nx_tarefas_contar", "nx_contato_historico"]) assert.equal(A.ehLeitura(n), true, n);
  for (const n of ["nx_canal_contar", "nx_codewords_contar", "nx_contato_salvar"]) assert.equal(A.ehLeitura(n), false, n);
});

test("UCC-006 · o ouvinte de abort sai do sinal quando a chamada termina", async () => {
  const ouvintes = new Set();
  const sinal = { aborted: false, addEventListener: (t, fn) => ouvintes.add(fn), removeEventListener: (t, fn) => ouvintes.delete(fn) };
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", cliente: () => "c", fetch: async () => resp({ ok: true }) });
  for (let i = 0; i < 5; i++) await api.fn("nx-ia", { acao: "x" }, { sinal });
  assert.equal(ouvintes.size, 0, "nada acumula no sinal da tela");
});

test("UCC-007 · teste_expirado e módulo desligado ganham o caminho («Ver planos»); toastDeErro mostra o botão", async () => {
  assert.deepEqual(A.acaoDoErro({ codigo: "teste_expirado" }), { rotulo: "Ver planos", hash: "#/config/plano" });
  assert.equal(A.acaoDoErro({ codigo: "sem_conexao" }), null);
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", cliente: () => "c", fetch: async () => resp({ message: "teste_expirado" }, 400) });
  const e = await api.rpcC("nx_contato_salvar", {}).catch(x => x);
  assert.deepEqual(e.acao, { rotulo: "Ver planos", hash: "#/config/plano" });
  limparCorpo();
  const destinos = [];
  U.toastDeErro(e, { navegar: hs => destinos.push(hs) });
  const b = [...doc.body.querySelectorAll("button")].find(x => x.textContent === "Ver planos");
  assert.ok(b); b.click(); assert.deepEqual(destinos, ["#/config/plano"]);
});

test("UCC-008 · cache de chamada pública: chave «pub» sem empresa — a mesma logado ou não", async () => {
  const chaves = [];
  const cache = { cacheavel: () => true, chaveDe: (n, p, o) => { const k = `${o.conta}:${o.cliente}:${n}`; chaves.push(k); return k; }, ler: async () => null, gravar: async () => true };
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", conta: () => "conta-1", cliente: () => "emp-1", cache, fetch: async () => resp({ ok: 1 }) });
  await api.publica("nx_marca_publica", {}, { cache: true });
  assert.deepEqual(chaves, ["pub:null:nx_marca_publica"]);
});

test("UCC-009 + UCC-010 · erroCartao: consulta pesada não fala de internet; o título segue o nível pedido", () => {
  const c = U.erroCartao({ codigo: "tempo_esgotado" }, () => {});
  assert.doesNotMatch(c.textContent, /internet/);
  assert.ok(c.querySelector("h2"));
  const c3 = U.erroCartao({ codigo: "sem_conexao" }, () => {}, { nivel: 3 });
  assert.ok(c3.querySelector("h3")); assert.equal(c3.querySelector("h2"), null);
  assert.match(c3.textContent, /Quando a internet voltar/);
});

/* ============================================================ rede.js · pulso.js · cache.js (UCC-011…026) ============================================================ */
test("UCC-011 · rede: com a aba escondida a retentativa espera; ao voltar à vista tenta na hora", async () => {
  const rel = relogioP1000(); const fila = [];
  const docF = { hidden: true, visibilityState: "hidden", _f: null, addEventListener(t, fn) { if (t === "visibilitychange") this._f = fn; }, removeEventListener() { this._f = null; } };
  let sondas = 0;
  const r = REDE.criarRede({ nav: { onLine: true }, janela: null, doc: docF, agendar: (fn, ms) => { fila.push(fn); return fila.length; }, cancelar: () => {}, agora: rel.agora,
    ping: async () => true, sondar: async () => { sondas++; } });
  r.falha({ codigo: "servico_indisponivel" }); r.falha({ codigo: "servico_indisponivel" }); r.falha({ codigo: "servico_indisponivel" });
  const antes = sondas;
  while (fila.length) await fila.shift()();
  assert.equal(sondas, antes, "escondida: nenhuma tentativa gasta");
  docF.hidden = false; docF.visibilityState = "visible"; docF._f(); await tick(4);
  assert.ok(sondas > antes, "voltou à vista: tenta");
  r.destruir && r.destruir();
});

test("UCC-013 + UCC-016 · pulso para em conta pausada/suspensa/teste vencido e avisa o código", async () => {
  assert.ok(REDE.CODIGOS_DE_CONTA.has("teste_expirado"));
  for (const cod of ["cliente_pausado", "teste_expirado", "conta_suspensa"]) {
    const fila = [], motivos = [];
    const p = P.criarPulso({ ler: async () => { throw erroDe(cod); }, aoParar: m => motivos.push(m), codigosDeParada: REDE.CODIGOS_DE_CONTA,
      agendar: fn => { fila.push(fn); return fila.length; }, cancelar: () => {}, doc: null, nav: { onLine: true }, janela: null, agora: () => 0, aleatorio: () => .5 });
    p.iniciar(); await fila.shift()(); await tick();
    assert.deepEqual(motivos, [cod]); assert.equal(p.estado.rodando, false, cod);
  }
});

test("UCC-014 · faixa sem internet com a tela vinda do aparelho diz «mostrando o que estava salvo neste aparelho»", () => {
  assert.match(fnDoApp("function montarIndicadoresRede() {"), /mostrando o que estava salvo neste aparelho/);
});

test("UCC-017 · voltar à aba lê na hora só se a última leitura tem mais de 10 s", async () => {
  const rel = relogioP1000(1_000_000); const fila = []; let leituras = 0;
  const docF = { visibilityState: "visible", _ouv: {}, addEventListener(t, fn) { this._ouv[t] = fn; }, removeEventListener() {} };
  const p = P.criarPulso({ ler: async () => { leituras++; return { v: leituras }; }, agendar: (fn, ms) => { const x = { fn, ms }; fila.push(x); return x; }, cancelar: x => { const i = fila.indexOf(x); if (i >= 0) fila.splice(i, 1); },
    doc: docF, nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} }, agora: rel.agora, aleatorio: () => .5 });
  p.iniciar(); await fila.shift().fn(); await tick();
  fila.length = 0;
  docF.visibilityState = "hidden"; docF._ouv.visibilitychange(); fila.length = 0;
  rel.pular(3000); docF.visibilityState = "visible"; docF._ouv.visibilitychange();
  assert.ok(!fila.some(x => x.ms === 0), "3 s depois: não relê na hora");
  fila.length = 0; docF.visibilityState = "hidden"; docF._ouv.visibilitychange(); fila.length = 0;
  rel.pular(20_000); docF.visibilityState = "visible"; docF._ouv.visibilitychange();
  assert.ok(fila.some(x => x.ms === 0), "20 s depois: relê na hora");
  p.parar();
});

test("UCC-018 · mesmo total de não lidas com mensagem mais nova conta como 1 nova (servidor com ultima_msg_em)", () => {
  const a = P.avisoDeNaoLidas({ antes: 3, depois: 3, ultimaAntes: "2026-10-21T10:00:00Z", ultimaDepois: "2026-10-21T10:01:00Z" });
  assert.equal(a.novas, 1); assert.equal(a.som, true);
  assert.equal(P.avisoDeNaoLidas({ antes: 3, depois: 3 }).novas, 0, "servidor atual: como antes");
});

test("UCC-019 · pulso avisa quando a situação da empresa muda (status/teste_ate); a primeira leitura só fixa a referência", async () => {
  const fila = [], sits = []; let r = { v: 1, cliente: { status: "teste", teste_ate: "2026-10-30" } };
  const p = P.criarPulso({ ler: async () => r, aoCliente: s => sits.push(s), agendar: fn => { fila.push(fn); return fila.length; }, cancelar: () => {},
    doc: null, nav: { onLine: true }, janela: null, agora: () => 0, aleatorio: () => .5 });
  p.iniciar(); await fila.shift()(); await tick();
  assert.deepEqual(sits, []);
  r = { v: 2, cliente: { status: "ativo", teste_ate: null } };
  await fila.shift()(); await tick();
  assert.deepEqual(sits, [{ status: "ativo", teste_ate: null }]);
  p.parar();
});

test("UCC-020 · app ocioso (o shell diz) → pulso no teto de 60 s", () => {
  let ocioso = false;
  const p = P.criarPulso({ ler: async () => ({}), ocioso: () => ocioso, agendar: () => 1, cancelar: () => {}, doc: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} }, agora: () => 0, aleatorio: () => .5 });
  assert.equal(p.estado.intervalo, P.INTERVALOS.normal);
  ocioso = true; assert.equal(p.estado.intervalo, P.INTERVALOS.maximo);
  assert.match(APP_JS, /ocioso: \(\) => Date\.now\(\) - \(E\.tocadoEm \|\| Date\.now\(\)\) >= OCIOSO_PULSO_MS/);
});

/** IndexedDB de mentira: uma conexão que pode ser fechada «por baixo» e o aviso de versão nova de outra aba. */
function idbFalso() {
  const dados = new Map(); const conexoes = [];
  const idb = {
    aberturas: 0,
    open() {
      idb.aberturas++;
      const req = {};
      const db = { fechada: false, objectStoreNames: { contains: () => true }, close() { db.fechada = true; },
        transaction() {
          if (db.fechada) { const e = new Error("The database connection is closing."); e.name = "InvalidStateError"; throw e; }
          const tx = {};
          tx.objectStore = () => ({
            get: k => { const r = {}; setTimeout(() => { r.result = dados.get(k); r.onsuccess && r.onsuccess(); tx.oncomplete && tx.oncomplete(); }, 0); return r; },
            put: v => { const r = {}; setTimeout(() => { dados.set(v.k, v); r.result = v.k; r.onsuccess && r.onsuccess(); tx.oncomplete && tx.oncomplete(); }, 0); return r; },
          });
          return tx;
        } };
      conexoes.push(db);
      setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess(); }, 0);
      return req;
    },
  };
  return { idb, conexoes };
}
test("UCC-022 + UCC-023 · IndexedDB: versão nova em outra aba fecha a conexão; conexão fechada por baixo reabre uma vez (o cache não morre)", async () => {
  const { idb, conexoes } = idbFalso();
  const arm = CACHE.criarArmazemIDB(idb, { prazoMs: 200 });
  assert.equal(await arm.gravar("k1", { v: 1, em: 1, dados: 1 }), true);
  assert.equal(typeof conexoes[0].onversionchange, "function", "ouve a versão nova de outra aba");
  conexoes[0].onversionchange(); assert.equal(conexoes[0].fechada, true);
  assert.ok(await arm.ler("k1"), "a próxima operação reabre");
  conexoes[conexoes.length - 1].fechada = true;   // fechada sem aviso (o navegador limpou)
  const n = idb.aberturas;
  assert.ok(await arm.ler("k1"), "InvalidStateError → reabre e lê");
  assert.equal(idb.aberturas, n + 1);
});

test("UCC-024 + UCC-026 · a sessão guardada vale 1 h (o resto 12 h); estatisticas() conta o que há no aparelho", async () => {
  assert.equal(CACHE.ttlDe("nx_app_sessao"), 3600 * 1000);
  assert.equal(CACHE.ttlDe("nx_inicio"), CACHE.TTL_MS);
  let t = 0;
  const c = CACHE.criarCache({ armazem: null, varrer: false, agora: () => t });
  await c.gravar("s", "nx_app_sessao", { conta: { id: 1 } }); await c.gravar("i", "nx_inicio", { x: 1 });
  t = 2 * 3600 * 1000;
  assert.equal(await c.ler("s"), null, "2 h depois a sessão não vale mais");
  assert.ok(await c.ler("i"));
  const st = await c.estatisticas();
  assert.equal(st.emDisco, false); assert.ok(st.entradas >= 1); assert.ok(st.bytesAprox > 0);
});

/* ============================================================ app.js · sessão (UCC-027…031) ============================================================ */
test("UCC-027 · troca de conta: a limpeza do aparelho termina (com prazo) ANTES do reload", () => {
  const f = fnDoApp("async function pedirLoginNaTela() {");
  assert.match(f, /await limparComPrazo\(1500\)[\s\S]*location\.reload\(\)/);
});

test("UCC-028 · Sair: «Saindo…» na hora e no máximo 3 s de espera pelo nx_sair (keepalive)", async () => {
  const f = fnDoApp("async function sair(");
  assert.match(f, /toast\("Saindo…"/);
  assert.match(f, /esperarNoMaximo\(E\.api\.rpc\("nx_sair", \{\}, \{ keepalive: true \}\), SAIR_PRAZO_MS\)/);
  assert.match(APP_JS, /const SAIR_PRAZO_MS = 3000;/);
  const esperar = fnApp("function esperarNoMaximo(", {});
  const t0 = Date.now();
  await esperar(new Promise(() => {}), 30);   // servidor preso não segura a saída
  assert.ok(Date.now() - t0 < 1000);
});

test("UCC-030 · token vencido (validade guardada) não conta como logado no antes.js; aoEntrar guarda expira_em", () => {
  assert.match(ANTES_TXT, /nx-token-expira[\s\S]*exp <= Date\.now\(\)\) logado = false/);
  assert.match(fnDoApp("function montarPublico("), /expira_em/);
  const rodar = (exp) => {
    const head = { appendChild() {} };
    const ls = loja({ "nx-token": "tk", ...(exp ? { "nx-token-expira": String(exp) } : {}) });
    const links = [];
    const docA = { documentElement: { setAttribute() {}, style: {}, classList: { add() {} } }, head: { appendChild: l => links.push(l.href) }, currentScript: { src: "http://x.test/app/antes.js?v=V1" },
      createElement: () => ({}), getElementById: () => null, title: "" };
    runInNewContext(ANTES_TXT, { window: { localStorage: ls, matchMedia: () => ({ matches: false }) }, document: docA, location: { hash: "#/crm", search: "", host: "x.test", href: "http://x.test/app/" }, URL, URLSearchParams, JSON, Date, Number, Object, Math, String });
    return links;
  };
  assert.ok(rodar(Date.now() + 3600e3).some(h => /^crm\.js/.test(h)), "válido: pré-carrega a tela");
  assert.ok(rodar(Date.now() - 1000).some(h => /^login\.js/.test(h)), "vencido: pré-carrega a entrada");
});

test("UCC-031 · sessão perto de vencer (10 min) avisa uma vez com «Entrar de novo»; sem validade, nada", () => {
  const agora = Date.now();
  assert.equal(ROTAS.sessaoPertoDeVencer(agora + 5 * 60000, agora), true);
  assert.equal(ROTAS.sessaoPertoDeVencer(agora + 30 * 60000, agora), false);
  assert.equal(ROTAS.sessaoPertoDeVencer(null, agora), false);
  assert.equal(ROTAS.sessaoPertoDeVencer(agora - 1, agora), false);
  const f = fnDoApp("function vigiarValidadeDaSessao() {");
  assert.match(f, /Entrar de novo/); assert.match(f, /_validadeAvisada === exp/);
});

/* ============================================================ rotas.js · navegação (UCC-033…044) ============================================================ */
test("UCC-033 + UCC-034 · query do hash: «+» continua sinal; __proto__ não mexe no protótipo", () => {
  assert.equal(ROTAS.rotear("#/conversas?tel=+5512999990000").query.tel, "+5512999990000");
  assert.equal(ROTAS.rotear("#/crm?q=ana%20souza").query.q, "ana souza");
  const r = ROTAS.rotear("#/crm?__proto__=x&constructor=y&a=1");
  assert.deepEqual(Object.keys(r.query), ["a"]);
  assert.equal(Object.getPrototypeOf(r.query), Object.prototype);
  assert.equal({}.x, undefined);
});

test("UCC-035 · urlProduto relativo à página do app (espelho do GitHub Pages)", () => {
  assert.equal(ROTAS.urlProduto("crm", { base: "/nexus-ads/app/index.html" }), "/nexus-ads/crm/");
  assert.equal(ROTAS.urlProduto("ads", { base: "/app/" }), "/ads/");
  assert.equal(ROTAS.urlProduto("crm"), "/crm/");
  assert.equal(ROTAS.urlProduto("xx", { base: "/app/" }), null);
  assert.match(fnDoApp("function urlWorkspace("), /urlProduto\(id, \{ base: location\.pathname \}\)/);
});

test("UCC-036 · #/inicio dentro do CRM fica no produto aberto", () => {
  assert.equal(ROTAS.produtoDaRota("inicio", "crm"), "crm");
  assert.equal(ROTAS.produtoDaRota("inicio", null), "ads");
  assert.equal(ROTAS.produtoDaRota("contatos", "ads"), "crm");
});

test("UCC-037 · short_name do manifesto não corta palavra no meio", () => {
  assert.equal(ROTAS.nomeCurto("Órbita Conversas", ""), "Órbita");
  assert.equal(ROTAS.nomeCurto("Clinix", "CRM"), "Clinix CRM");
  assert.equal(ROTAS.nomeCurto("Supercomunicacao", "CRM"), "CRM");
  const n = ROTAS.nomeDoApp({ produto: "Oficina Digital Pro", workspace: "crm" });
  assert.ok(n.short_name.length <= 12); assert.ok("Oficina Digital Pro".startsWith(n.short_name));
});

test("UCC-038 · Central de ajuda: rota aberta a todos, artigos com busca sem acento e vocabulário da vertical", async () => {
  assert.equal(ROTAS.acessoRota("ajuda", { pronto: () => false, temModulo: () => false, pode: () => false, gestorConta: false, temCliente: false }), "ok");
  assert.equal(ROTAS.rotaNoProduto("ads", "ajuda"), true);
  assert.ok(AJUDA.ARTIGOS.length >= 10);
  assert.equal(AJUDA.buscarArtigos("conexao whatsapp")[0].id, "conectar-whatsapp");
  assert.equal(AJUDA.buscarArtigos("zzzz").length, 0);
  assert.equal(AJUDA.buscarArtigos("pacientes", { vocab: { contatos: "Pacientes" } })[0].id, "importar-contatos");
  assert.match(APP_JS, /"ajuda\.js",/, "entra no precache do app");
  limparCorpo(); const alvo = h("div"); doc.body.appendChild(alvo);
  let titulo = "";
  await AJUDA.montar({ alvo, ui: U, vocab: { contatos: "Pacientes" }, rota: { modulo: "ajuda", partes: [], query: {} }, titulo: t => { titulo = t; }, shell: { marcaEfetiva: () => ({}) } });
  assert.equal(titulo, "Central de ajuda");
  assert.ok(alvo.querySelector("h1"));
  assert.ok([...alvo.querySelectorAll("a")].some(a => a.getAttribute("href") === "#/ajuda/importar-contatos" && /Pacientes/.test(a.textContent)));
  await AJUDA.montar({ alvo, ui: U, vocab: {}, rota: { modulo: "ajuda", partes: ["senha"], query: {} }, titulo() {}, shell: { marcaEfetiva: () => ({ suporte_wa: "5512999998888" }) } });
  assert.ok(alvo.querySelector("ol.ajuda-passos li"));
  assert.ok([...alvo.querySelectorAll("a")].some(a => /5512999998888/.test(a.getAttribute("href") || "")), "rodapé com o suporte");
  AJUDA.desmontar();
});

test("UCC-039 · plano só com a agenda tem rota padrão (antes caía na tela bloqueada)", () => {
  const op = { temCliente: true, pronto: () => true, temModulo: m => m === "crm", pode: () => true, gestorConta: false };
  assert.equal(ROTAS.rotaPadrao({ ...op, pronto: k => k === "crm" && false }), "config");
  const soAgenda = { temCliente: true, pronto: k => k === "crm", temModulo: () => true, pode: () => true, gestorConta: false };
  // sem «inicio», «conversas» prontos: CRM/contatos/agenda — a agenda está na ordem
  assert.ok(["crm", "contatos", "agenda"].includes(ROTAS.rotaPadrao(soAgenda)));
});

test("UCC-040 · endereço errado por uma letra sugere a tela parecida", () => {
  assert.equal(C.sugerirRota("crn", ["inicio", "crm", "agenda"]), "crm");
  assert.equal(C.sugerirRota("agnda", ["inicio", "crm", "agenda"]), "agenda");
  assert.equal(C.sugerirRota("xyzxyz", ["inicio", "crm"]), null);
  assert.match(APP_JS, /Você quis dizer «/);
});

test("UCC-041 · guarda de rota que manda ficar desfaz a navegação (sem entrada duplicada no histórico)", () => {
  const d = fnApp("function desfazerNavegacao(idxNovo, idxAtual) {", {});
  assert.equal(d(null, 3), "back", "entrada nova: volta (remove a entrada)");
  assert.equal(d(4, 3), "back");
  assert.equal(d(2, 3), "forward", "foi um Voltar: avança de novo");
  assert.equal(d(3, 3), "replace");
});

test("UCC-042 · Voltar devolve a rolagem da tela; entrada nova começa no topo", () => {
  const E = { voltou: true, rolagens: new Map([["#/crm", 640]]) };
  const f = fnApp("function rolagemDeVolta() {", { E, location: { hash: "#/crm" } });
  assert.equal(f(), 640);
  E.voltou = false; assert.equal(f(), 0);
});

test("UCC-043 · o hash de entrada de uma rota padrão vem de um lugar só", () => {
  assert.equal(ROTAS.hashDaRota("relatorios"), "#/relatorios/vendas");
  assert.equal(ROTAS.hashDaRota("admin"), "#/admin/clientes");
  assert.equal(ROTAS.hashDaRota("crm"), "#/crm");
  assert.equal((APP_JS.match(/rotas\.hashDaRota\(rotas\.rotaPadrao/g) || []).length >= 2, true);
  assert.doesNotMatch(APP_JS, /=== "relatorios" \? "#\/relatorios\/vendas"/);
});

/* ============================================================ sw.js (UCC-045, UCC-046) ============================================================ */
test("UCC-045 · o manifesto (sem ?v=) é servido do cache desta versão", async () => {
  const m = criarMundoSW({});
  const e = m.evento({ request: m.req("/app/manifest-crm.webmanifest") });
  m.ouvintes.fetch(e);
  assert.ok(e.resposta, "o service worker responde pelo manifesto");
  await e.resposta;
  const e2 = m.evento({ request: m.req("/app/manifest-crm.webmanifest") });
  m.ouvintes.fetch(e2); await e2.resposta;
  assert.equal(m.chamadas.filter(u => /manifest-crm/.test(u)).length, 1, "a 2ª vem do cache");
});

test("UCC-046 · navigationPreload ligado no activate; a navegação usa a resposta pré-carregada", async () => {
  let ligou = 0;
  const m = criarMundoSW({});
  assert.match(SW_TXT, /navigationPreload\.enable\(\)/);
  const pre = new Response("<html>pre</html>", { status: 200, headers: { "content-type": "text/html" } });
  const e = m.evento({ request: m.req("/app/", { mode: "navigate" }), preloadResponse: Promise.resolve(pre) });
  m.ouvintes.fetch(e);
  const r = await e.resposta;
  assert.equal(await r.text(), "<html>pre</html>");
  assert.equal(m.chamadas.length, 0, "não buscou de novo");
  void ligou;
});

/* ============================================================ lote sis-a2 · sw.js (UCC-047…051) ============================================================ */
/** o sw.js num mundo próprio, para conferir as funções que ele expõe no self (cachesParaApagar, paginaOffline) */
function swSolto() {
  const ouv = {};
  const self_ = { location: { href: "http://site.test/app/sw.js?v=V5", origin: "http://site.test" }, registration: { scope: "http://site.test/app/" }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener: (t, fn) => { ouv[t] = fn; } };
  runInNewContext(SW_TXT, { self: self_, caches: {}, fetch: async () => null, Request, Response, URL, URLSearchParams, Promise, AbortController, setTimeout, clearTimeout, console });
  return { self: self_, ouv };
}
test("UCC-047 · activate: fica a versão atual + 2 anteriores do shell; caches antigos de qualquer prefixo do app saem; os de fora ficam", () => {
  const { self } = swSolto();
  const fora = self.cachesParaApagar(["orbita-shell-V1", "orbita-shell-V2", "orbita-shell-V3", "orbita-shell-V4", "orbita-shell-V5", "nexus-antigo", "orbita-fila", "outra-lib"]);
  assert.deepEqual(fora.sort(), ["nexus-antigo", "orbita-fila", "orbita-shell-V1", "orbita-shell-V2"].sort());
});

test("UCC-048 · arquivo .js que não veio (offline) recebe JS que lança erro legível; .css recebe CSS vazio", async () => {
  const m = criarMundoSW({ resposta: () => { throw new Error("offline"); } });
  const ej = m.evento({ request: m.req("/app/crm.js?v=V2") }); m.ouvintes.fetch(ej);
  const rj = await ej.resposta;
  assert.equal(rj.status, 503); assert.match(rj.headers.get("content-type"), /javascript/);
  assert.match(await rj.text(), /throw new Error\(".*indisponível agora/);
  const ec = m.evento({ request: m.req("/app/crm.css?v=V2") }); m.ouvintes.fetch(ec);
  const rc = await ec.resposta;
  assert.match(rc.headers.get("content-type"), /text\/css/);
});

test("UCC-049 · página «Sem conexão» com a cor e o nome da marca que a página mandou (e o shell manda)", () => {
  const { self, ouv } = swSolto();
  const antes = self.paginaOffline();
  ouv.message({ data: { tipo: "marca", fundo: "#101820", texto: "#F5F5F0", produto: "Clinix<b>" } });
  const depois = self.paginaOffline();
  assert.notEqual(antes, depois);
  assert.match(depois, /background:#101820/); assert.match(depois, /Sem conexão · Clinixb/);
  ouv.message({ data: { tipo: "marca", fundo: "red;}body{x", texto: "#fff", produto: "" } });
  assert.doesNotMatch(self.paginaOffline(), /red;/, "cor inválida não entra no CSS");
  assert.match(fnDoApp("function pintarMarca("), /postMessage\(\{ tipo: "marca", fundo: t\.vars\["--c-fundo"\], texto: t\.vars\["--c-texto"\]/);
});

test("UCC-050 · versao.json: sempre da rede sem cache HTTP; sem rede, 503 em JSON", async () => {
  const m = criarMundoSW({ resposta: () => { throw new Error("offline"); } });
  const e = m.evento({ request: m.req("/app/versao.json?t=1") }); m.ouvintes.fetch(e);
  const r = await e.resposta;
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { erro: "sem_conexao" });
  assert.match(SW_TXT, /fetch\(req, \{ cache: "no-store" \}\)/);
});

test("UCC-051 · install: ui/api/rotas/rede também são essenciais (sem eles a 1ª tela não abre offline)", async () => {
  const html = `<html><script src="app.js?v=V2"></script><link href="app.css?v=V2"><link href="shell.css?v=V2"><link rel="modulepreload" href="ui.js?v=V2"><link rel="modulepreload" href="api.js?v=V2"><link rel="modulepreload" href="rotas.js?v=V2"><link rel="modulepreload" href="rede.js?v=V2"><link rel="modulepreload" href="crm.js?v=V2"></html>`;
  const m = criarMundoSW({ resposta: u => (/index\.html/.test(u) ? new Response(html, { status: 200, headers: { "content-type": "text/html" } }) : /rede\.js/.test(u) ? new Response("x", { status: 500 }) : new Response("ok", { status: 200 })) });
  const e = m.evento({}); m.ouvintes.install(e);
  await assert.rejects(e.fim(), /shell_incompleto/, "faltou o rede.js: a instalação tenta de novo depois");
});

/* ============================================================ pwa.js (UCC-052…061) ============================================================ */
test("UCC-052 · uma leitura do versao.json vale 60 s e chamadas juntas dividem o mesmo pedido; a faixa e o shell usam a mesma", async () => {
  let n = 0, t = 0;
  const L = PWA.criarLeitorVersao(async () => { n++; return { versao: "V9" }; }, { agora: () => t });
  const [a, b] = await Promise.all([L.ler(), L.ler()]);
  assert.equal(n, 1); assert.deepEqual(a, b);
  t = 30_000; await L.ler(); assert.equal(n, 1, "30 s depois: a mesma");
  t = 61_000; await L.ler(); assert.equal(n, 2);
  const falha = PWA.criarLeitorVersao(async () => { throw new Error("x"); });
  assert.equal(await falha.ler(), null);
  assert.match(fnDoApp("function versaoRemota("), /if \(E\.leitorVersao\) return E\.leitorVersao\.ler\(\);/);
  assert.match(APP_JS, /leitorVersao: E\.leitorVersao \|\| null/);
});

test("UCC-053 · com a aba escondida o tique da ociosidade não aplica a versão", () => {
  assert.match(ler("pwa.js"), /const ocio = setInterval\(\(\) => \{ if \(doc && doc\.hidden\) return; v\.tique\(\); \}/);
});

test("UCC-058 · instalado também em window-controls-overlay/minimal-ui/fullscreen", () => {
  const jan = modo => ({ matchMedia: q => ({ matches: q === `(display-mode: ${modo})` }) });
  for (const m of ["standalone", "window-controls-overlay", "minimal-ui", "fullscreen"]) assert.equal(PWA.emStandalone({ janela: jan(m), nav: {} }), true, m);
  assert.equal(PWA.emStandalone({ janela: jan("browser"), nav: {} }), false);
});

test("UCC-059 · instalado no iPhone o topo desce pela área segura (barra translúcida)", () => {
  assert.match(SHELL_CSS, /@media \(display-mode: standalone\) \{\s*\.topo \{ padding-top: env\(safe-area-inset-top\); height: calc\(var\(--topo\) \+ env\(safe-area-inset-top\)\); \}/);
});

test("UCC-060 · sugestão de instalar também no computador (com instalação nativa); iPhone continua só no toque", () => {
  const f = fnApp("function deveSugerirInstalacao(", {});
  assert.equal(f({ aberturas: 3, jaSugeriu: false, toque: false, modo: "evento" }), true, "desktop com Chrome/Edge");
  assert.equal(f({ aberturas: 2, jaSugeriu: false, toque: false, modo: "evento" }), false);
  assert.equal(f({ aberturas: 5, jaSugeriu: true, toque: true, modo: "evento" }), false);
  assert.equal(f({ aberturas: 5, jaSugeriu: false, toque: true, modo: "ios" }), true);
  assert.equal(f({ aberturas: 5, jaSugeriu: false, toque: false, modo: "firefox" }), false, "Firefox não instala: sem sugestão automática");
});

test("UCC-061 · Firefox no computador: «Instalar o app» mostra o que dá para fazer (antes não fazia nada)", () => {
  const ff = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
  assert.equal(PWA.modoDeInstalacao({ janela: { matchMedia: () => ({ matches: false }) }, nav: { userAgent: ff } }), "firefox");
  assert.equal(PWA.modoDeInstalacao({ janela: { matchMedia: () => ({ matches: false }) }, nav: { userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" } }), null);
  assert.match(fnDoApp("async function instalarApp() {"), /modo === "firefox"[\s\S]*PASSOS_FIREFOX/);
});

test("UCC-064 · o título usa o nome da marca guardada desde o boot (revenda não pisca «Órbita»)", () => {
  const f = fnApp("function produtoGuardado(", { LS: { ler: () => null } });
  const ls = v => ({ ler: () => v });
  assert.equal(f(ls({ produto: "Clinix", host: "app.clinix.com" }), "app.clinix.com"), "Clinix");
  assert.equal(f(ls({ produto: "Clinix", host: "outro.com" }), "app.clinix.com"), null, "de outra origem não vale");
  assert.equal(f(ls(null), "x"), null);
  assert.match(APP_JS, /E\.produto = produtoGuardado\(\) \|\| E\.produto;/);
});

test("UCC-065 · antes.js aquece Agenda, Anúncios e Relatórios", () => {
  assert.match(ANTES_TXT, /agenda: \{ js: \["crm-logica\.js", "graficos\.js"\], css: "agenda\.css" \}/);
  assert.match(ANTES_TXT, /anuncios: \{ js: \[/); assert.match(ANTES_TXT, /relatorios: \{ js: \[/);
});

/* ============================================================ acessibilidade e ui.js (UCC-067…081) ============================================================ */
test("UCC-067 + UCC-068 · regiões de anúncio declaradas no index.html; a caixa de avisos não é aria-live (uma voz)", () => {
  assert.match(HTML, /<div class="sr-only" id="anuncio-urgente" aria-live="assertive" aria-atomic="true"><\/div>/);
  assert.match(HTML, /<div class="toasts" id="toasts" popover="manual"><\/div>/);
});

test("UCC-069 + UCC-079 · painel flutuante: Tab circula dentro; rolar/redimensionar reposiciona (não fecha) e âncora removida fecha", async () => {
  limparCorpo();
  const ancora = h("button", null, "abrir"); doc.body.appendChild(ancora);
  const b1 = h("button", null, "um"), b2 = h("button", null, "dois");
  const f = U.flutuante(ancora, h("div", null, b1, b2), { rotulo: "Teste" });
  await esperar(5);
  b2.focus();
  const tab = new Evento("keydown", { key: "Tab", shiftKey: false });
  f.el.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true); assert.equal(doc.activeElement, b1, "do último volta ao primeiro");
  const stab = new Evento("keydown", { key: "Tab", shiftKey: true });
  f.el.dispatchEvent(stab); assert.equal(doc.activeElement, b2);
  assert.match(UI_TXT, /addEventListener\("resize", seguir\)/);
  const flut = UI_TXT.slice(UI_TXT.indexOf("export function flutuante("), UI_TXT.indexOf("Estados: vazio, esqueleto, erro"));
  assert.doesNotMatch(flut, /addEventListener\("resize", fechar\)/, "resize não fecha mais o painel");
  const seguirTxt = UI_TXT.slice(UI_TXT.indexOf("function seguir()"), UI_TXT.indexOf("function rolou("));
  assert.match(seguirTxt, /if \(!ancora\.isConnected\) \{ fechar\(\); return; \}/);
  f.fechar();
});

test("UCC-071 + UCC-072 · tema: texto do primário legível no hover; texto-3 ≥ 4,5:1 em todas as superfícies", () => {
  const cores = ["#2E7DFF", "#FFC21A", "#7A3CFF", "#00A884", "#FF5A5F", "#14B8A6", "#F59E0B", "#9CA3AF", "#1F2937", "#E11D48"];
  for (const prim of cores) for (const fundo of ["#FAFAF8", "#101418"]) {
    const v = T.derivarTema({ primaria: prim, secundaria: "#5B6CFF", fundo, texto: fundo === "#101418" ? "#F2F2EE" : "#14161A" }).vars;
    const ok = T.contraste(v["--c-prim-txt"], v["--c-prim"]), hi = T.contraste(v["--c-prim-txt"], v["--c-prim-hi"]);
    assert.ok(hi >= Math.min(ok, 4.5) - .01, `${prim}/${fundo}: hover ${hi.toFixed(2)} (botão ${ok.toFixed(2)})`);
    for (const k of ["--c-fundo", "--c-sup", "--c-poco", "--c-sup-2", "--c-sup-3"]) assert.ok(T.contraste(v["--c-texto-3"], v[k]) >= 4.49, `${prim}/${fundo}: texto-3 × ${k} = ${T.contraste(v["--c-texto-3"], v[k]).toFixed(2)}`);
  }
  assert.ok(T.contraste(T.textoSobreDois("#FFC21A", "#E0AA10"), "#E0AA10") >= 4.5);
});

test("UCC-073 · alto contraste: pílulas, chips e etiquetas com borda do sistema", () => {
  assert.match(CSS_APP, /@media \(forced-colors: active\) \{[^@]*?\.pilula, \.chip, \.chip-check span, \.etiq, \.badge, \.pilula-teste \{ border: 1px solid ButtonText; \}/);
});

test("UCC-074 · Ctrl+Z com uma janela aberta não desfaz a ação da tela de trás", () => {
  const f = UI_TXT.slice(UI_TXT.indexOf("function aoTeclaZ(ev) {"), UI_TXT.indexOf("async function desfazerItem"));
  assert.match(f, /document\.querySelector\("dialog\[open\]"\)\) return;/);
  assert.ok(f.indexOf("dialog[open]") < f.indexOf("ev.preventDefault()"), "decide antes de agir");
});

test("UCC-075 · o foco vai ao título só quando a tela muda (abrir item na mesma tela não tira o teclado do lugar)", () => {
  assert.match(fnDoApp("async function montarNoShell("), /if \(doUsuario && trocouDeTela\) focarTitulo\(seq\);/);
});

test("UCC-077 + UCC-078 · iniciais por grafema (emoji inteiro); pct reaproveita o formatador", () => {
  assert.equal(U.iniciais("😀 Ana"), "😀A");
  assert.equal(U.iniciais("ana souza"), "AS");
  assert.ok(!U.iniciais("😀").includes("�"));
  const t0 = performance.now(); for (let i = 0; i < 10000; i++) U.pct(i / 10000, 1); const ms = performance.now() - t0;
  assert.ok(ms < 400, `10 mil pct em ${ms.toFixed(0)} ms`);
  assert.equal(U.pct(0.125, 1), "12,5%");
});

test("UCC-080 · o mesmo aviso repetido não empilha (ganha «2×»); no máximo 3 à vista", () => {
  limparCorpo();
  const vivos = () => doc.querySelectorAll(".toast").filter(t => !t.classList.contains("saindo")).length;
  const a = U.toast("Contato salvo.", { tipo: "ok" });
  const b = U.toast("Contato salvo.", { tipo: "ok" });
  assert.equal(b.agrupado, true);
  assert.equal(vivos(), 1);
  assert.match(a.el.textContent, /\(2×\)/);
  for (const t of ["x1", "x2", "x3", "x4"]) U.toast(t);
  assert.equal(U.MAX_TOASTS, 3);
  assert.equal(vivos(), U.MAX_TOASTS);
});

/* ============================================================ paleta e comandos (UCC-082…090) ============================================================ */
test("UCC-082…085 · paleta: Central de ajuda, Ver plano e assinar (admin), Fazer o tour, Recarregar e Ver notificações", () => {
  const a = { rotaOk: () => true, pode: p => p !== "admin", temCliente: true, vocab: VOCAB.vocab("generico"), empresas: 1 };
  const fazer = Object.fromEntries(["central-ajuda", "ver-plano", "tour", "recarregar", "notificacoes"].map(k => [k, () => {}]));
  const ids = C.acoesPadrao(a, fazer).map(x => x.id);
  assert.deepEqual(ids.sort(), ["central-ajuda", "notificacoes", "recarregar", "tour"], "sem admin: sem «Ver plano»");
  const todas = C.acoesPadrao({ ...a, pode: () => true }, fazer);
  assert.ok(todas.some(x => x.id === "ver-plano"));
  const achar = t => C.filtrar(todas, t, { limite: 3 }).map(x => x.id)[0];
  assert.equal(achar("duvida"), "central-ajuda"); assert.equal(achar("assinar"), "ver-plano"); assert.equal(achar("tour"), "tour");
  for (const k of Object.keys(fazer)) assert.match(fnDoApp("function acoesDoShell() {"), new RegExp(`"${k}": `));
});

test("UCC-086 · «g» e depois a letra navega (g c = Conversas); fora da janela de tempo, nada", () => {
  let t = 0;
  const s = C.criarSequenciaG({ agora: () => t });
  assert.equal(s.tecla("g"), true); t = 300; assert.equal(s.tecla("c"), "#/conversas");
  assert.equal(s.tecla("c"), null, "sem o g antes: nada");
  s.tecla("g"); t = 5000; assert.equal(s.tecla("r"), null, "passou o tempo");
  s.tecla("g"); assert.equal(s.tecla("x"), null);
  assert.ok(C.ATALHOS_GERAIS.some(x => x.teclas.join("") === "GC"));
  assert.match(APP_JS, /const r = seqG\.tecla\(ev\.key\);/);
});

test("UCC-070 + UCC-087 · paleta: termo igual ao nome marca esse item; End/Home/PageDown andam pela lista", async () => {
  limparCorpo();
  const P2 = await import(pathToFileURL(join(APP, "paleta.js")).href);
  let corpo = null;
  const ui = { ...U, modal: o => { corpo = o.corpo; doc.body.appendChild(corpo); o.aoAbrir({ el: h("div", null, h("div", { class: "modal-rod" })), fechar() {} }); return new Promise(() => {}); } };
  const acoes = ["Agenda do dia", "Agenda", "Agendar retorno", "Agenda da equipe"].map((r, i) => ({ id: `a${i}`, rotulo: r, palavras: "agenda", fazer() {} }));
  P2.abrir({ ui, C, placeholder: "Buscar", destinos: [], acoes, daTela: [], recentes: () => [], ultimos: () => [], navegar() {}, buscarDados: null });
  const campo = corpo.querySelector("input");
  campo.value = "agenda"; ev(campo, "input"); await tick(3);
  const marcado = () => corpo.querySelector('[aria-selected="true"]');
  assert.equal(marcado().querySelector("b").textContent, "Agenda");
  const opcoes = corpo.querySelectorAll('[role="option"]');
  const k = key => campo.dispatchEvent(new Evento("keydown", { key, ctrlKey: key === "End" || key === "Home" }));
  k("End"); assert.equal(marcado(), opcoes[opcoes.length - 1]);
  k("Home"); assert.equal(marcado(), opcoes[0]);
  k("PageDown"); assert.equal(marcado(), opcoes[Math.min(5, opcoes.length - 1)]);
});

/* ============================================================ venda e teste (UCC-091…106) ============================================================ */
test("UCC-091 · faixa «o teste termina em N dias» para o administrador, de 0 a 3 dias, com «Assinar agora»", () => {
  const E = { M: { rotas: ROTAS }, cliente: { papel: "admin" } };
  const f = fnApp("function faixaFimDeTeste(", { E, papelAtual: () => E.cliente.papel });
  const hoje = "2026-10-21";
  const cli = d => ({ status: "teste", teste_ate: d });
  assert.equal(f(cli("2026-10-23"), { hoje }).dias, 2);
  assert.match(f(cli("2026-10-21"), { hoje }).texto, /termina hoje/);
  assert.equal(f(cli("2026-10-30"), { hoje }), null, "longe: só a pílula");
  assert.equal(f(cli("2026-10-20"), { hoje }), null, "vencido: a faixa de bloqueio de sempre");
  assert.equal(f(cli("2026-10-22"), { hoje, equipe: true }), null, "equipe da plataforma não vê");
  assert.equal(f(cli("2026-10-22"), { hoje, papel: "atendente" }), null);
  assert.match(fnDoApp("function faixasDoMomento() {"), /Assinar agora/);
});

test("UCC-092 + UCC-093 + UCC-105 · pílula com dias compactos no celular, «Ver planos» no aviso e ocultar não vale nos 2 últimos dias", () => {
  assert.match(fnDoApp("function pilulaDeTeste(cli) {"), /class: "pt-compacto"/);
  assert.match(SHELL_CSS, /\.pilula-teste:has\(\.pt-compacto\) \.pt-txt \{ display: none; \}/);
  assert.match(fnDoApp("function abrirAvisoTeste("), /"Ver planos"/);
  const dias = { v: 5 };
  const ls = loja();
  const LS = { lerTxt: k => ls.getItem(k) };
  const oculto = fnApp("function testeOculto(cli) {", { LS, CHAVE_TESTE_OCULTO: "nx-teste-oculto", DIA_MS: 864e5, diasDeTeste: () => dias.v });
  ls.setItem("nx-teste-oculto:e1", String(Date.now() - 3600e3));
  assert.equal(oculto({ id: "e1" }), true);
  dias.v = 2; assert.equal(oculto({ id: "e1" }), false, "faltando 2 dias volta a aparecer");
  dias.v = 5; ls.setItem("nx-teste-oculto:e1", String(Date.now() - 25 * 3600e3)); assert.equal(oculto({ id: "e1" }), false, "25 h depois volta");
});

test("UCC-094 + UCC-095 · produto fora do plano: «Não incluso» e «Conhecer»; área fora do plano mostra o que resolve + «Pedir este módulo»", () => {
  assert.equal(ROTAS.produtoIncluso("ads", ["crm"]), false);
  assert.equal(ROTAS.produtoIncluso("crm", ["crm"]), true);
  assert.equal(ROTAS.produtoIncluso("atendimento", ["conversas"]), true);
  assert.equal(ROTAS.beneficiosDe("anuncios").length, 3);
  assert.equal(ROTAS.beneficiosDe("agenda").length, 3, "agenda é do plano crm");
  assert.match(fnDoApp("function abrirSeletorProduto("), /"Não incluso"/);
  assert.match(fnDoApp("function cartaoBloqueio("), /beneficiosDe\(modulo\)/);
  assert.match(fnDoApp("function acoesForaDoPlano("), /"Pedir este módulo"/);
  const pedir = fnDoApp("async function pedirModulo(");
  assert.match(pedir, /nx_plano_upgrade_pedido/); assert.match(pedir, /ehFuncaoAusente\(e\)[\s\S]*linkWhatsApp/, "servidor atual: vira mensagem ao suporte");
});

test("UCC-097 + UCC-098 · tour de 4 paradas (só as que existem na tela), uma vez por conta; menu Ajuda e paleta refazem", () => {
  limparCorpo();
  doc.body.appendChild(h("button", { class: "topo-busca" }, "Buscar"));
  doc.body.appendChild(h("button", { id: "bt-sino" }, "sino"));
  assert.deepEqual(C.paradasDoTour(doc).map(p => p.id), ["paleta", "sino"], "sem produtos e conta na tela: pula essas");
  assert.equal(C.PASSOS_TOUR.length, 4);
  assert.equal(C.chaveTour("c1"), "nx-tour-visto:c1");
  const t = fnDoApp("function iniciarTour(");
  assert.match(t, /if \(!forcar && \(LS\.lerTxt\(chave\)/); assert.match(t, /nx_onboarding_marcar/);
  assert.match(fnDoApp("async function abrirMenuAjuda("), /"Fazer o tour"/);
});

test("UCC-103 + UCC-026 + UCC-134 · «Sobre» mostra plano/fim do teste, o que está guardado no aparelho e os últimos erros", () => {
  const E = { M: { rotas: ROTAS, api: { errosRecentes: () => [{ codigo: "http_504", fn: "nx_inicio" }] } }, produto: "Órbita", workspace: null, sessao: { migracao: "x" },
    cliente: { nome: "Clínica", slug: "c", plano: "pro", status: "teste", teste_ate: "2026-10-30" }, titulo: "Início", rede: { estado: "online" }, ui: U };
  const f = fnApp("function textoSobre(", { E, VERSAO: "V1", navigator: {}, innerWidth: 360 });
  const t = f({ cache: { entradas: 12, bytesAprox: 40960, emDisco: true } });
  assert.match(t, /Plano: pro · teste até 30\/10\/2026/);
  assert.match(t, /Guardado no aparelho: 12 itens \(~40 KB\)/);
  assert.match(t, /Erros recentes: http_504 \(nx_inicio\)/);
});

test("UCC-104 · eventos leves de venda (melhor esforço; 404 desliga) e o shell registra ver plano, conhecer/pedir módulo e assinar", async () => {
  const chamadas = [];
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "t", cliente: () => "c",
    fetch: async (u, init) => { chamadas.push(JSON.parse(init.body)); return resp({ code: "PGRST202", message: "Could not find the function" }, 404); } });
  assert.equal(await api.evento("ver_plano", { origem: "x" }), false);
  assert.equal(await api.evento("ver_plano"), false);
  assert.equal(chamadas.length, 1, "depois do 404 não tenta mais");
  for (const tipo of ["ver_plano", "conhecer_produto", "pedir_modulo", "assinar"]) assert.match(APP_JS, new RegExp(`evento\\("${tipo}"`));
});

test("UCC-107…109 · busca do topo, seletor de empresa e de produtos com 44 px no toque", () => {
  assert.match(CSS_APP, /@media \(pointer: coarse\) \{[^@]*?\.topo-busca, \.empresa-bt, \.topo-produtos \{ min-height: var\(--alvo-toque\); \}/);
});

/* ============================================================ lote sis-a3 · toque, telas e avisos (UCC-110…144) ============================================================ */
test("UCC-110…114 · 44 px no toque (busca do painel, cor hex, domínio, papel) e sem a aurora com blur(74px) no celular/movimento reduzido", () => {
  const blocos = [...CSS_APP.matchAll(/@media \(pointer: coarse\) \{([^@]*?)\n\}/g)].map(m => m[1]);
  const ultimo = blocos[blocos.length - 1];
  assert.match(ultimo, /\.flut-busca, \.cor-hex, \.dom-add input, \.papel-sel \{ min-height: var\(--alvo-toque\) !important; \}/);
  assert.match(ultimo, /\.palco::before \{ filter: none; display: none; \}/);
  assert.match(CSS_APP, /@media \(prefers-reduced-motion: reduce\) \{\s*body \.palco i, body \.palco::before, body \.palco::after \{[^}]*\}\s*\.palco::before \{ filter: none; display: none; \}/);
});

test("UCC-115 + UCC-118 · topo respeita a área segura dos lados; a lista do sino deixa 16 px de cada lado", () => {
  assert.match(SHELL_CSS, /\.topo \{ padding-inline: max\(var\(--pad\), env\(safe-area-inset-left\)\) max\(var\(--pad\), env\(safe-area-inset-right\)\); \}/);
  assert.match(CSS_APP, /\.flut\.notifs \{ width: min\(380px, calc\(100vw - 32px\)\); max-width: calc\(100vw - 32px\); \}/);
});

test("UCC-116 · paleta: com o teclado do celular aberto a altura acompanha a visualViewport (e solta o ouvinte ao fechar)", () => {
  const ouv = {};
  const vv = { height: 812, addEventListener: (t, f) => { ouv[t] = f; }, removeEventListener: (t, f) => { if (ouv[t] === f) delete ouv[t]; } };
  const P2 = { setProperty(k, v) { this[k] = v; } };
  const el = { style: P2 };
  return import(pathToFileURL(join(APP, "paleta.js")).href).then(PAL => {
    const soltar = PAL.seguirAlturaUtil(el, vv);
    assert.equal(P2["--altura-util"], "812px");
    vv.height = 431.6; ouv.resize();
    assert.equal(P2["--altura-util"], "432px", "o teclado abriu: a paleta encolhe");
    soltar(); assert.equal(ouv.resize, undefined, "fechou: sem ouvinte pendurado");
    assert.equal(typeof PAL.seguirAlturaUtil(el, null), "function", "sem visualViewport, nada muda");
    assert.match(SHELL_CSS, /\.modal\.busca-g \{ max-height: min\(92dvh, calc\(var\(--altura-util, 100dvh\) - 16px\)\); \}/);
  });
});

test("UCC-117 · faixas: fica UMA (a mais importante) com «+N avisos»; abrir mostra todas", () => {
  const prio = new Function(`${constDoApp("PRIORIDADE_FAIXA")}${fnDoApp("function prioridadeDaFaixa(n) {")}\nreturn prioridadeDaFaixa;`)();
  const umaPorVez = fnApp("function umaFaixaPorVez(", { E: { ui: U }, prioridadeDaFaixa: prio });
  const fx = cls => h("div", { class: `faixa ${cls}` }, h("p", null, cls));
  let aberto = 0;
  const lista = [fx("faixa-demo-local"), fx("faixa-suporte"), fx("faixa-bloqueio")];
  const r = umaPorVez(lista, { ui: U, abrir: () => { aberto++; } });
  assert.equal(r.length, 1); assert.match(r[0].className, /faixa-bloqueio/, "o bloqueio vence");
  const mais = r[0].querySelector(".faixa-mais");
  assert.equal(mais.textContent, "+2 avisos");
  ev(mais, "click"); assert.equal(aberto, 1);
  const todas = umaPorVez([fx("faixa-demo"), fx("faixa-fim-teste")], { ui: U, abertas: true });
  assert.deepEqual(todas.map(n => /faixa-fim-teste/.test(n.className)), [true, false], "abertas: todas, em ordem de prioridade");
  assert.equal(umaPorVez([fx("faixa-demo")], { ui: U }).length, 1);
  assert.match(fnDoApp("async function escolherCliente("), /if \(mudou\) E\.faixasAbertas = false;/);
});

test("UCC-120 · aviso de mensagem nova: um por empresa (tag) que se substitui; renotify só quando o app não tocou o som", () => {
  const op = fnApp("function opcoesDoAvisoNaoLidas(", {});
  const a = op({ novas: 2, total: 3, cliId: "c1", somProprio: true, icone: "i.png" });
  assert.equal(a.titulo, "2 mensagens novas"); assert.equal(a.opcoes.tag, "nx-cv-c1");
  assert.equal(a.opcoes.silent, true); assert.equal(a.opcoes.renotify, undefined, "silent + renotify o navegador recusa");
  const b = op({ novas: 1, total: 1, cliId: "c1", somProprio: false });
  assert.equal(b.opcoes.renotify, true); assert.equal(b.opcoes.silent, undefined);
  assert.equal(b.opcoes.data.hash, "#/conversas?aba=aguardando");
});

test("UCC-121 · avisos: pergunta do próprio app antes do pedido nativo; recusou na nossa, o navegador nem pergunta", async () => {
  const pedidos = [], toasts = [];
  const N = { permission: "default", requestPermission: async () => { pedidos.push(1); return "granted"; } };
  let resposta = false;
  const marcados = [];
  const mk = () => fnApp("async function pedirPermissaoAvisos() {", { E: { ui: { confirmar: async () => resposta, toast: t => toasts.push(t) } }, Notification: N,
    permissaoDeAvisos: () => N.permission, marcarPassoEquipe: id => marcados.push(id) });
  assert.equal(await mk()(), "default"); assert.equal(pedidos.length, 0, "disse não na nossa pergunta: o prompt nativo não gasta");
  resposta = true;
  assert.equal(await mk()(), "granted"); assert.equal(pedidos.length, 1); assert.deepEqual(marcados, ["avisos"]);
  N.permission = "denied";
  assert.equal(await mk()(), "denied"); assert.match(toasts.at(-1), /bloqueados/);
});

test("UCC-122 + UCC-123 · service worker: push mostra o aviso; clique foca a aba aberta e leva à conversa (endereço só #/ do app)", async () => {
  const m = criarMundoSW();
  const mostrados = [], mensagens = [], abertas = [];
  let focou = 0;
  m.self.registration.showNotification = async (t, o) => { mostrados.push({ t, o }); };
  const cliente = { url: `${m.site}/app/index.html#/inicio`, postMessage: x => mensagens.push(x), focus: async () => { focou++; } };
  m.self.clients.matchAll = async () => [cliente];
  m.self.clients.openWindow = async u => { abertas.push(u); };
  const e1 = m.evento({ data: { json: () => ({ titulo: "Mensagem nova", corpo: "Ana: oi", hash: "#/conversas/abc" }) } });
  m.ouvintes.push(e1); await e1.fim();
  assert.equal(mostrados[0].t, "Mensagem nova"); assert.equal(mostrados[0].o.data.hash, "#/conversas/abc"); assert.equal(mostrados[0].o.renotify, true);
  let fechou = 0;
  const e2 = m.evento({ notification: { data: { hash: "#/conversas/abc" }, close() { fechou++; } } });
  m.ouvintes.notificationclick(e2); await e2.fim();
  assert.equal(fechou, 1); assert.deepEqual(JSON.parse(JSON.stringify(mensagens)), [{ tipo: "abrir", hash: "#/conversas/abc" }]); assert.equal(focou, 1);   // o objeto nasce no vm (outro realm)
  m.self.clients.matchAll = async () => [];
  const e3 = m.evento({ notification: { data: { hash: "javascript:alert(1)" }, close() {} } });
  m.ouvintes.notificationclick(e3); await e3.fim();
  assert.deepEqual(abertas, [`${m.site}/app/index.html#/conversas`], "endereço estranho cai em Conversas");
  assert.match(APP_JS, /m\.tipo === "abrir" && \/\^#\\\/\/\.test\(String\(m\.hash \|\| ""\)\)\) navegar\(m\.hash\)/);
});

test("UCC-129 · um relógio só: a conferência de migração vai no tique do pwa.js (aba escondida não confere)", async () => {
  const chamadas = [];
  const docF = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const jan = { addEventListener() {}, removeEventListener() {} };
  const api = PWA.iniciar({ versao: "V1", doc: docF, janela: jan, loc: { href: "http://x.test/app/", hostname: "x.test", protocol: "http:" }, nav: {}, storage: loja(),
    verificarMs: 5, aoVerificar: () => chamadas.push(docF.hidden), leitorVersao: { ler: async () => ({ acao: "igual" }) }, ui: U });
  await esperar(30);
  const visiveis = chamadas.length;
  assert.ok(visiveis >= 1, "o relógio chamou o aoVerificar");
  docF.hidden = true; const antes = chamadas.length; await esperar(30);
  assert.equal(chamadas.length, antes, "escondida: nem versão nem migração");
  api.destruir();
  assert.match(APP_JS, /aoVerificar: \(\) => conferirMigracao\(\)/);
  assert.doesNotMatch(APP_JS, /setInterval\(\(\) => \{ if \(!document\.hidden\) conferirMigracao\(\); \}/, "o segundo setInterval saiu");
});

test("UCC-131 + UCC-132 · diagnóstico: navegador (nome e versão) e o modo sem internet com a versão do cache", () => {
  assert.equal(PWA.nomeDoNavegador("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"), "Chrome 141");
  assert.equal(PWA.nomeDoNavegador("Mozilla/5.0 ... Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"), "Edge 141");
  assert.equal(PWA.nomeDoNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari 18");
  assert.equal(PWA.nomeDoNavegador("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"), "Firefox 140");
  assert.equal(PWA.nomeDoNavegador(""), "—");
  assert.equal(PWA.estadoDoSW({}).estado, "sem_suporte");
  assert.equal(PWA.estadoDoSW({ serviceWorker: { controller: null } }).estado, "preparando");
  const at = PWA.estadoDoSW({ serviceWorker: { controller: { scriptURL: "http://x/app/sw.js?v=20261021a" } } });
  assert.equal(at.versao, "20261021a"); assert.match(at.texto, /sim \(cópia da versão 20261021a\)/);
  const texto = fnApp("function textoSobre({ cache = null } = {}) {", { E: { M: { rotas: ROTAS }, produto: "Órbita", sessao: { migracao: "m" }, pwaMod: PWA, rede: { estado: "online" } }, VERSAO: "V9", innerWidth: 390,
    navigator: { userAgent: "x Firefox/140.0", serviceWorker: { controller: { scriptURL: "sw.js?v=V9" } } } })();
  assert.match(texto, /Navegador: Firefox 140/); assert.match(texto, /Funciona sem internet: sim \(cópia da versão V9\)/);
});

test("UCC-133 · «Limpar dados deste aparelho»: confirma, sai e apaga só as chaves nx-* e os caches orbita-*", async () => {
  const ls = loja({ "nx-app-esquema": "escuro", "nx-x": "1", "outra-coisa": "fica" });
  const chaves = fnApp("function chavesDoAppNoAparelho(ls) {", {});
  assert.deepEqual(chaves(ls).sort(), ["nx-app-esquema", "nx-x"]);
  const apagados = [], saidas = [];
  let confirma = false;
  const cachesF = { keys: async () => ["orbita-V1", "de-outro"], delete: async n => apagados.push(n) };
  const mk = () => fnApp("async function limparAparelhoPeloMenu() {", { E: { ui: { confirmar: async () => confirma, toast() {} } }, sair: async o => saidas.push(o), localStorage: ls, caches: cachesF, chavesDoAppNoAparelho: chaves });
  assert.equal(await mk()(), false); assert.equal(saidas.length, 0, "não confirmou: nada acontece");
  confirma = true;
  assert.equal(await mk()(), true);
  assert.deepEqual(saidas, [{ perguntar: false }]); assert.equal(ls.getItem("nx-x"), null); assert.equal(ls.getItem("outra-coisa"), "fica");
  assert.deepEqual(apagados, ["orbita-V1"]);
  assert.match(fnDoApp("async function abrirMenuAjuda(ancora) {"), /rotulo: "Limpar dados deste aparelho"/);
});

test("UCC-135 · erro de JavaScript que escapou: só o tipo, a tela, a versão e o navegador (nada da mensagem); um por tipo+tela a cada 5 min", () => {
  const resumo = fnApp("function resumoDoErroJs(", {});
  const r = resumo(new TypeError("Cannot read properties of undefined (reading 'Ana Souza 12999998888')"), { tela: "crm", versao: "V1", navegador: "Chrome 141" });
  assert.deepEqual(r, { codigo: "js:TypeError", tela: "crm", versao: "V1", navegador: "Chrome 141" });
  assert.ok(!JSON.stringify(r).includes("Ana"));
  const ouv = {}, enviados = [], guardados = [];
  const vigiar = fnApp("function vigiarErrosDoApp(", { E: { ultimaRota: { modulo: "crm" }, M: { api: { guardarErroRecente: e => guardados.push(e) } }, api: { erroCliente: async x => { enviados.push(x); return true; } } }, VERSAO: "V1", resumoDoErroJs: resumo, navigator: {} });
  vigiar({ addEventListener: (t, f) => { ouv[t] = f; } });
  ouv.error({ error: new TypeError("x") }); ouv.error({ error: new TypeError("y") });
  assert.equal(enviados.length, 1, "o mesmo tipo na mesma tela não repete");
  ouv.unhandledrejection({ reason: { codigo: "sem_conexao" } });
  assert.equal(enviados.length, 1, "erro da API já está no anel");
  ouv.unhandledrejection({ reason: new RangeError("z") });
  assert.equal(enviados.at(-1).codigo, "js:RangeError"); assert.deepEqual(guardados.map(g => g.codigo), ["js:TypeError", "js:RangeError"]);
});

test("UCC-136 · dias de teste pelo relógio do servidor (aparelho com a data errada não muda a conta)", () => {
  const E = { ui: U, M: { api: { agoraServidor: () => Date.parse("2026-10-21T15:00:00Z") }, rotas: ROTAS } };
  const hoje = fnApp("function hojeServidor() {", { E });
  assert.equal(hoje(), "2026-10-21");
  const dias = fnApp("function diasDeTeste(cli) {", { E, hojeServidor: hoje });
  assert.equal(dias({ teste_ate: "2026-10-24" }), 3);
  assert.match(fnDoApp("function pilulaDeTeste(cli) {"), /cli\.teste_ate >= hojeServidor\(\)/);
});

test("UCC-137 · navegador antigo (sem color-mix ou sem módulos): a abertura diz o que fazer", () => {
  const roda = ({ colorMix = true, modulo = true } = {}) => {
    const cls = new Set(); const msg = { textContent: "Abrindo…" };
    const raiz = { style: { setProperty() {} }, setAttribute() {}, classList: { add: c => cls.add(c) } };
    const document = { documentElement: raiz, title: "", readyState: "complete", getElementById: id => (id === "boot-msg" ? msg : null), currentScript: null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
    function HTMLScriptElement() {} if (modulo) HTMLScriptElement.prototype.noModule = false;
    const window = { localStorage: { getItem: () => null }, CSS: { supports: () => colorMix } };
    runInNewContext(ANTES_TXT, { document, window, localStorage: window.localStorage, location: { host: "x", search: "", hash: "", href: "http://x/app/" }, URLSearchParams, URL, HTMLScriptElement });
    return { cls, msg: msg.textContent };
  };
  assert.ok(!roda().cls.has("navegador-antigo")); assert.equal(roda().msg, "Abrindo…");
  const velho = roda({ colorMix: false });
  assert.ok(velho.cls.has("navegador-antigo")); assert.match(velho.msg, /antigo demais[\s\S]*Atualize o navegador/);
  assert.ok(roda({ modulo: false }).cls.has("navegador-antigo"));
});

test("UCC-138 · paleta: «Trocar para <empresa>» pelo nome (2+ empresas, 2+ letras, sem acento, sem a atual)", () => {
  const cl = [{ id: "a", nome: "Clínica Sorriso" }, { id: "b", nome: "Oficina São José" }, { id: "c", nome: "Clinica Bem Estar" }];
  assert.deepEqual(C.empresasDaPaleta(cl, "clinica", { atualId: "a" }).map(e => e.id), ["c"]);
  assert.deepEqual(C.empresasDaPaleta(cl, "sao jose").map(e => e.id), ["b"]);
  assert.deepEqual(C.empresasDaPaleta(cl, "c"), [], "1 letra: nada");
  assert.deepEqual(C.empresasDaPaleta([cl[0]], "clin"), [], "uma empresa só: nada");
  assert.match(PALETA_TXT, /grupos\.push\(\["Empresas", em\.map\(e => \(\{ icone: "empresa", l1: `Trocar para \$\{e\.nome\}`/);
  assert.match(APP_JS, /empresas: typeof C\.empresasDaPaleta === "function"/);
});

test("UCC-141 · aviso comprido fica mais tempo (até 10 s); o erro continua 12 s", () => {
  assert.equal(U.duracaoToast("Salvo."), 4500);
  assert.equal(U.duracaoToast("x".repeat(110)), 4500 + 50 * 60);
  assert.equal(U.duracaoToast("x".repeat(500)), 10000);
  assert.equal(U.duracaoToast("Excluído.", { comBotao: true }), 7000);
  assert.match(UI_TXT, /tipo === "erro" \? \(comAcao && toqueGrosso\(\) \? 0 : 12000\) : duracaoToast\(texto/);
});

test("UCC-143 · modal fechado com o gatilho sumido: o foco cai no título da tela (não no body)", () => {
  limparCorpo();
  const tit = h("h1", null, "Contatos"); const main = h("main", null, tit); doc.body.appendChild(main);
  const sumiu = h("button", null, "Excluir");   // nunca entrou na página (a lista foi redesenhada)
  const r = U.devolverFoco(sumiu, doc);
  assert.equal(r, tit); assert.equal(doc.activeElement, tit); assert.equal(tit.getAttribute("tabindex"), "-1");
  const bt = h("button", null, "Abrir"); doc.body.appendChild(bt);
  assert.equal(U.devolverFoco(bt, doc), bt, "gatilho ainda na tela: volta para ele");
  assert.match(UI_TXT, /dlg\.remove\(\); devolverFoco\(anterior\); \}, 160\);/);
});

test("UCC-144 · Esc num menu dentro de um modal fecha só o menu (não sobe para a janela de baixo)", () => {
  limparCorpo();
  const ancora = h("button", null, "Mais"); doc.body.appendChild(ancora);
  let subiu = 0; const ouvinte = e => { if (e.key === "Escape") subiu++; };
  doc.body.addEventListener("keydown", ouvinte);
  U.menu(ancora, [{ rotulo: "Editar", fn() {} }]);
  const pop = doc.querySelector(".menu-pop");
  assert.ok(pop, "menu aberto");
  ev(pop.querySelector("button"), "keydown", { key: "Escape" });
  doc.body.removeEventListener("keydown", ouvinte);
  assert.equal(subiu, 0, "o Esc parou no menu (a tela/janela de baixo não recebe)");
  assert.match(UI_TXT, /dlg\.addEventListener\("keydown", ev => \{ if \(ev\.key === "Escape"\) ev\.stopPropagation\(\); \}\);/);
});

/* ============================================================ lote sis-a3 · venda e primeira semana (UC-*) ============================================================ */
test("UC-002 + UC-039 · «Ocultar» só com mais de 2 dias; teste sem data mostra «Em teste» ao administrador", () => {
  const corpo = fnDoApp("function abrirAvisoTeste(ancora, cli, dias) {");
  assert.match(corpo, /const ocultar = dias === null \|\| dias > 2 \? ui\.h\("button"/);
  const E = { ui: U, M: { rotas: ROTAS }, cliente: null };
  const pil = fnApp("function pilulaDeTeste(cli) {", { E, papelAtual: () => "admin", testeOculto: () => false, abrirAvisoTeste() {}, hojeServidor: () => "2026-10-21", diasDeTeste: () => null });
  const p = pil({ id: "c", status: "teste", teste_ate: null });
  assert.equal(p.textContent, "Em teste"); assert.equal(p.getAttribute("aria-label"), "Empresa em teste grátis");
  const pilAt = fnApp("function pilulaDeTeste(cli) {", { E, papelAtual: () => "atendente", testeOculto: () => false, abrirAvisoTeste() {}, hojeServidor: () => "2026-10-21", diasDeTeste: () => null });
  assert.equal(pilAt({ id: "c", status: "teste", teste_ate: null }), null, "só o administrador");
});

test("UC-003 · «Quero continuar»: pedido pronto (empresa, plano, revenda) para copiar ou mandar no WhatsApp", () => {
  const t = ROTAS.textoPedidoContratacao({ produto: "Clínica+", empresa: "Sorriso", plano: "pro", revenda: "Nexus" });
  assert.equal(t, "Olá, Nexus! Quero continuar usando Clínica+ na Sorriso. Plano atual: pro. Pode me passar os valores e como assinar?");
  assert.match(ROTAS.textoPedidoContratacao({}), /^Olá! Quero continuar usando o sistema\./);
  assert.match(fnDoApp("function abrirAvisoTeste(ancora, cli, dias) {"), /"Quero continuar"[\s\S]*abrirPedidoDeContratacao\(cli, "pilula_teste"\)/);
  assert.match(fnDoApp("function faixasDoMomento() {"), /abrirPedidoDeContratacao\(cli, "faixa_vencido"\)/);
});

test("UC-005 · janela do fim do teste: administrador, a 3 e a 1 dia, uma vez por dia", () => {
  const cli = { id: "c", status: "teste" };
  assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: 3, papel: "admin" }), true);
  assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: 1, papel: "admin" }), true);
  assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: 2, papel: "admin" }), false);
  assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: 3, papel: "admin", visto: true }), false, "uma vez por dia");
  assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: 3, papel: "atendente" }), false);
  assert.equal(ROTAS.deveAvisarFimTeste({ cli: { ...cli, suporte: true }, dias: 3, papel: "admin" }), false, "suporte da plataforma");
  assert.equal(ROTAS.chaveAvisoTeste("c", "2026-10-21"), "nx-teste-aviso:c:2026-10-21");
  assert.match(fnDoApp("function avisarFimDoTeste() {"), /if \(document\.querySelector\("dialog\[open\]"\) \|\| ocupadoParaAtualizar\(\)\) return false;/);
});

test("UC-006 · teste vencido: o que para e por quanto tempo os dados ficam (só com retencao_dias)", () => {
  assert.equal(ROTAS.textoTesteVencido({ retencaoDias: 30 }), "O período de teste terminou: você pode consultar, mas não alterar nada. As automações, lembretes e envios automáticos ficam parados. Seus contatos, conversas e negócios continuam guardados por 30 dias.");
  assert.doesNotMatch(ROTAS.textoTesteVencido({}), /guardados por/);
  assert.match(ROTAS.textoTesteVencido({ equipe: true }), /Só a equipe/);
});

test("UC-011 + UC-034 · primeiros passos: selo «3/9» no menu e «Tudo pronto» quando está completo", async () => {
  const est = { itens: [{ id: "a", feito: true }, { id: "b", feito: false }, { id: "c", feito: true }] };
  assert.deepEqual(ROTAS.seloPrimeirosPassos(est), { feitos: 2, total: 3, texto: "2/3", rotulo: "Primeiros passos: 2 de 3 feitos" });
  assert.equal(ROTAS.seloPrimeirosPassos({ itens: [{ feito: true }] }), null, "completo: some");
  assert.equal(ROTAS.seloPrimeirosPassos({ ...est, dispensado: true }), null);
  assert.equal(ROTAS.onboardingCompleto({ itens: [{ feito: true }, { ok: true }] }), true);
  const navs = [], toasts = [];
  const mk = estado => fnApp("async function abrirPrimeirosPassos() {", { E: { M: { rotas: ROTAS }, ui: { toast: t => toasts.push(t) } }, estadoOnboarding: async () => estado, navegar: x => navs.push(x) });
  assert.equal(await mk({ itens: [{ feito: true }] })(), false); assert.match(toasts[0], /Tudo pronto/);
  assert.equal(await mk(est)(), true); assert.deepEqual(navs, ["#/inicio?passos=1"]);
  assert.equal(await mk(null)(), true, "sem o estado: abre o Início");
});

test("UC-012 · «Comece aqui» da equipe: 4 passos pessoais; o que o aparelho não permite sai da lista", () => {
  const tudo = C.passosDaEquipe({ feitos: ["perfil"], avisos: "default", podeInstalar: true, temConversas: true });
  assert.deepEqual(tudo.itens.map(i => [i.id, i.feito]), [["perfil", true], ["avisos", false], ["instalar", false], ["responder", false]]);
  assert.equal(tudo.feitos, 1); assert.equal(tudo.total, 4); assert.equal(tudo.completo, false);
  const pouco = C.passosDaEquipe({ feitos: ["perfil"], avisos: "denied", instalado: false, podeInstalar: false, temConversas: false });
  assert.deepEqual(pouco.itens.map(i => i.id), ["perfil"]); assert.equal(pouco.completo, true);
  assert.equal(C.passosDaEquipe({ avisos: "granted", instalado: true, feitos: ["perfil", "responder"], temConversas: true }).completo, true);
  assert.equal(C.chavePassosEquipe("u1"), "nx-passos-equipe:u1");
  assert.match(APP_JS, /document\.addEventListener\("nx:mensagem-enviada", \(\) => marcarPassoEquipe\("responder"\)\);/);
});

test("UC-018 · boas-vindas: administrador, uma vez por conta+empresa, nunca no suporte nem por cima de outra janela", () => {
  const cli = { id: "c" };
  assert.equal(ROTAS.deveMostrarBoasVindas({ cli, papel: "admin" }), true);
  assert.equal(ROTAS.deveMostrarBoasVindas({ cli, papel: "admin", visto: true }), false);
  assert.equal(ROTAS.deveMostrarBoasVindas({ cli: { ...cli, suporte: true }, papel: "admin" }), false);
  assert.equal(ROTAS.deveMostrarBoasVindas({ cli, papel: "admin", dialogoAberto: true }), false);
  assert.equal(ROTAS.deveMostrarBoasVindas({ cli, papel: "atendente" }), false);
  assert.equal(ROTAS.chaveBoasVindas("u", "c"), "nx-boas-vindas:u:c");
  const corpo = fnDoApp("function mostrarBoasVindas() {");
  assert.match(corpo, /Conectar o WhatsApp/); assert.match(corpo, /Convidar a equipe/); assert.match(corpo, /"Explorar sozinho"/);
  assert.match(fnDoApp("function mostrarApp() {"), /const abriu = E\.sessao && \(mostrarBoasVindas\(\) \|\| avisarFimDoTeste\(\)\);/);
});

test("UC-020 · «Conecte o WhatsApp»: admin, Conversas no plano e nenhum número; «Depois» vale 7 dias", () => {
  const cli = { id: "c", modulos: ["conversas"], canais: [] };
  const agora = Date.parse("2026-10-21T12:00:00Z");
  assert.equal(ROTAS.faltaWhatsapp({ cli, papel: "admin", agora }), true);
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...cli, canais: [{ estado: "conectado" }] }, papel: "admin", agora }), false);
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...cli, canais: undefined }, papel: "admin", agora }), false, "servidor sem a lista: não conclui");
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...cli, modulos: ["crm"] }, papel: "admin", agora }), false);
  assert.equal(ROTAS.faltaWhatsapp({ cli, papel: "atendente", agora }), false);
  assert.equal(ROTAS.faltaWhatsapp({ cli, papel: "admin", dispensadoEm: agora - 6 * 86400000, agora }), false);
  assert.equal(ROTAS.faltaWhatsapp({ cli, papel: "admin", dispensadoEm: agora - 8 * 86400000, agora }), true);
});

test("UC-024 · notificação «plano» com ícone de cartão e destino no Plano e uso", () => {
  const icones = new Function(`${constDoApp("ICONE_NOTIF")}return ICONE_NOTIF;`)();
  assert.equal(icones.plano, "cartao");
  assert.match(APP_JS, /LINK_NOTIF\.plano = "#\/config\/plano";/);
});

test("UC-028 · paleta: convidar pessoa, conectar WhatsApp e importar contatos", () => {
  const ids = C.CATALOGO.map(c => c.id);
  for (const id of ["convidar-pessoa", "conectar-whatsapp", "importar-contatos"]) assert.ok(ids.includes(id), id);
  const conv = C.CATALOGO.find(c => c.id === "convidar-pessoa");
  assert.equal(conv.quando({ temCliente: true, pode: p => p !== "admin" }), false, "só admin convida");
  const acoes = fnDoApp("function acoesDoShell() {");
  assert.match(acoes, /"convidar-pessoa": \(\) => navegar\("#\/config\/equipe\?convidar=1"\)/);
  assert.match(acoes, /"conectar-whatsapp": \(\) => navegar\("#\/config\/numeros\?assistente=novo"\)/);
  assert.match(acoes, /"importar-contatos": \(\) => navegar\("#\/crm\?importar=1"\)/);
});

test("UC-030 · modo apresentação: avatares marcados como dado pessoal ficam borrados (a própria conta, não)", () => {
  assert.match(U.avatar("Ana Souza", "1").className, /\bdado-pessoal\b/);
  assert.match(SHELL_CSS, /html\.apresentacao \.dado-pessoal \{ filter: blur\(6px\); \}/);
  assert.match(SHELL_CSS, /html\.apresentacao \.lat-conta \.dado-pessoal, html\.apresentacao #bt-conta-topo \.dado-pessoal/);
  const ss = loja(); globalThis.sessionStorage = ss;
  const cls = new Set();
  const E = { ui: { toast: () => ({ fechar() {} }) }, avisoApresentacao: null };
  const documentF = { documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } } };
  const aplicar = fnApp("function aplicarApresentacao(on = emApresentacao()) {", { E, document: documentF, emApresentacao: () => ss.getItem("nx-apresentacao") === "1", alternarApresentacao() {} });
  const alternar = fnApp("function alternarApresentacao(on = !emApresentacao()) {", { CHAVE_APRESENTACAO: "nx-apresentacao", aplicarApresentacao: aplicar, emApresentacao: () => ss.getItem("nx-apresentacao") === "1", sessionStorage: ss });
  assert.equal(alternar(), true); assert.ok(cls.has("apresentacao")); assert.equal(ss.getItem("nx-apresentacao"), "1", "só nesta aba");
  assert.equal(alternar(), false); assert.ok(!cls.has("apresentacao"));
});

test("UC-037 · novidades: as notas vão junto na atualização, aparecem uma vez e ficam no menu Ajuda", () => {
  const ls = loja();
  assert.equal(PWA.guardarNovidades(ls, "V2", ["Agenda mais rápida", "", 3]), true);
  assert.deepEqual(PWA.novidadesDaVersao(ls, "V2"), { notas: ["Agenda mais rápida"], vistas: false });
  PWA.marcarNovidadesVistas(ls);
  assert.deepEqual(PWA.novidadesDaVersao(ls, "V2"), { notas: ["Agenda mais rápida"], vistas: true });
  assert.deepEqual(PWA.novidadesDaVersao(ls, "V3").notas, [], "outra versão: nada");
  assert.equal(PWA.guardarNovidades(ls, "V4", []), false);
  assert.match(fnDoApp("async function abrirMenuAjuda(ancora) {"), /a\.novidades \? \{ rotulo: "Novidades desta versão"/);
});

test("UC-038 · situação dos serviços: aparelho, cada número (caído desde quando), IA e versão", () => {
  const linhas = fnApp("function linhasSituacao(", { VERSAO: "V1" });
  const l = linhas({ rede: "online", canais: [{ nome: "Recepção", estado: "conectado" }, { numero: "5512", estado: "desconectado", desde: "ontem" }], ia: { ligada: true, cota_esgotada: true } });
  assert.deepEqual(l.map(x => [x.rotulo, x.texto, x.tom]), [
    ["Este aparelho", "conectado", "bom"], ["WhatsApp Recepção", "conectado", "bom"], ["WhatsApp 5512", "desconectado desde ontem", "ruim"],
    ["Assistente de IA", "cota do mês esgotada", "aten"], ["Versão do app", "V1", "neutro"]]);
  assert.equal(linhas({ rede: "offline", canais: [] })[1].texto, "nenhum número conectado");
  assert.equal(linhas({ rede: "offline" })[0].tom, "ruim");
});

test("UC-001 + UC-031 · «Testar grátis»: #/testar é rota pública do login (o formulário só com a marca ligando teste_aberto)", () => {
  assert.equal(ROTAS.rotear("#/testar").modulo, "testar");
  assert.match(APP_JS, /const ROTAS_PUBLICAS = new Set\(\["login", "convite", "senha", "testar"\]\);/);
  assert.match(LOGIN_TXT, /if \(rota\.modulo === "testar"\) return telaTestar\(ctx\);/);
});

test("UC-004 + UC-027 · dias até o fim do teste numa função só (data ou timestamp) e a pílula conta os últimos 7 dias", () => {
  assert.equal(ROTAS.diasAteFimTeste("2026-10-24", "2026-10-21"), 3);
  assert.equal(ROTAS.diasAteFimTeste("2026-10-24T02:50:00Z", "2026-10-21"), 2, "02:50Z ainda é dia 23 em São Paulo");
  assert.equal(ROTAS.diasAteFimTeste("2026-10-21", "2026-10-21"), 0);
  assert.equal(ROTAS.diasAteFimTeste("lixo", "2026-10-21"), null);
  assert.equal(ROTAS.textoPilulaTeste(3, "24/10").curto, "Teste: 3 dias");
  assert.equal(ROTAS.textoPilulaTeste(0, "21/10").curto, "Teste: termina hoje");
  assert.equal(ROTAS.textoPilulaTeste(12, "02/11").curto, "Teste até 02/11");
  assert.match(fnDoApp("function diasDeTeste(cli) {"), /E\.M\.rotas\.diasAteFimTeste\(cli\.teste_ate, hojeServidor\(\)\)/);
});

test("UC-014 + UC-015 · artigos da ajuda na paleta (3+ letras) e «Ajuda desta tela» pela rota aberta", () => {
  assert.deepEqual(AJUDA.artigosDaPaleta("ag"), [], "2 letras: nada");
  const r = AJUDA.artigosDaPaleta("whatsapp");
  assert.ok(r.length >= 1 && r.every(x => /^#\/ajuda\//.test(x.hash) && x.grupo === "Ajuda"));
  assert.ok(AJUDA.artigoDaRota("crm"), "o CRM tem artigo"); assert.equal(AJUDA.artigoDaRota("nao-existe"), null);
  assert.match(fnDoApp("async function abrirMenuAjuda(ancora) {"), /artigoDaTela \? \{ rotulo: "Ajuda desta tela"/);
});

test("UC-017 · «Ver com dados de exemplo» só quando a marca traz a empresa de exemplo e ela está na sessão", () => {
  assert.match(fnDoApp("function mostrarBoasVindas() {"), /E\.marca && E\.marca\.demo_cliente_id && E\.sessao\.clientes\.some\(c => c\.id === E\.marca\.demo_cliente_id\)/);
});

test("UC-019 · depois do convite: «Bem-vindo à <empresa>. Você entrou como <papel>.»", () => {
  const t = fnApp("function textoBoasVindas(", {});
  assert.equal(t({ empresa: "Clínica Sorriso", papel: "atendente" }, { atendente: "Atendente" }), "Bem-vindo à Clínica Sorriso. Você entrou como atendente.");
  assert.equal(t(null), "");
});

test("UC-025 · teste vencido ou suspenso: só consulta (a equipe da plataforma não é afetada)", () => {
  const sc = fnApp("function somenteConsulta(cli, sessao, hoje) {", { E: { M: { rotas: ROTAS } } });
  const sessao = { conta: {} };
  assert.match(sc({ status: "teste", teste_ate: "2026-10-20", papel: "admin" }, sessao, "2026-10-21"), /O teste terminou: só consulta/);
  assert.equal(sc({ status: "teste", teste_ate: "2026-10-21", papel: "admin" }, sessao, "2026-10-21"), null, "último dia ainda escreve");
  assert.match(sc({ status: "suspenso", papel: "admin" }, sessao, "2026-10-21"), /suspenso/);
  assert.equal(sc({ status: "suspenso", papel: "gestor" }, sessao, "2026-10-21"), null);
});

test("UCC-140 · Sair: a marca guardada no aparelho volta a ser a do endereço", () => {
  assert.match(fnDoApp("async function sair("), /const m = E\.M\.tema\.marcaEfetiva\(E\.marcaPublica \? E\.marcaPublica\.marca : \{\}, \{\}\);[\s\S]*pintarMarca\(m, \{ guardar: true \}\);/);
});
