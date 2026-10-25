/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026) · frente sis (sistema e casca), lotes sis-1 e sis-2
   node --test testes/plano1000b-sis.teste.mjs
   Testes de COMPORTAMENTO (o mesmo DOM de mentira do plano1000-sistema) dos itens UB-* da frente sis e dos pedidos das outras frentes
   (CB-166 ctx.rede.assinar, UB-101 seções das Configurações na paleta, barraUso com limite 0). O app.js não é importável: o que é
   dele roda função a função (fnApp) ou entra por regex no texto-fonte. Nada depende da hora em que a suíte roda.
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
  return { armazem, cachesFalso, chamadas, ouvintes, evento, req, site };
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

/* ============================================================ pulso.js + app.js · sessão ============================================================ */
test("UB-279 · pulso: parado por sessao_invalida chama aoParar('sessao_invalida') (o shell abre a janela de login)", async () => {
  const fila = [], motivos = [];
  const p = P.criarPulso({ ler: async () => { throw Object.assign(new Error("x"), { codigo: "sessao_invalida" }); }, aoParar: m => motivos.push(m),
    agendar: fn => { fila.push(fn); return fila.length; }, cancelar: () => {}, doc: null, nav: { onLine: true }, janela: null, agora: () => 0, aleatorio: () => .5 });
  p.iniciar();
  await fila.shift()(); await tick();
  assert.deepEqual(motivos, ["sessao_invalida"]);
  assert.equal(p.estado.rodando, false);
  // outra falha (rede) não chama
  const m2 = []; const f2 = [];
  const p2 = P.criarPulso({ ler: async () => { throw new Error("rede"); }, aoParar: m => m2.push(m), agendar: fn => { f2.push(fn); return 1; }, cancelar: () => {}, doc: null, nav: { onLine: true }, janela: null, agora: () => 0, aleatorio: () => .5 });
  p2.iniciar(); await f2.shift()(); await tick();
  assert.deepEqual(m2, []); assert.equal(p2.estado.rodando, true); p2.parar();
  // plano 1500c: UCC-016 — os demais códigos de parada (conta pausada, teste vencido…) vão para o aoErroApi
  assert.match(APP_JS, /aoParar: motivo => \{ if \(motivo === "sessao_invalida"\) \{ if \(E\.sessao\) sessaoCaiu\(\); \} else aoErroApi\(\{ codigo: motivo \}\); \}/, "o shell liga o aoParar à janela de login");
});

test("UB-010 · janela «Sua sessão expirou» com «ok»: o pulso reinicia e o sino é redesenhado", async () => {
  let iniciou = 0, sino = 0;
  const E = { sessao: { conta: { id: "c1", email: "a@x.com" } }, cliente: { id: "e1" }, rascunhos: { salvarTudo() {} }, pulso: { iniciar() { iniciou++; } },
    ui: { h: () => ({}), campo: () => ({}), modal: async () => "ok", toast() {} } };
  const pedir = fnApp("async function pedirLoginNaTela() {", { E, atualizarSinoUI: () => { sino++; } });
  assert.equal(await pedir(), true);
  assert.equal(iniciou, 1); assert.equal(sino, 1);
});

test("UB-009 · reconectou com dado velho: com edição em curso ou guarda de rota só avisa; sem trabalho remonta a tela", () => {
  const remontes = [], toasts = [];
  const mk = (ocupado, guardas, falhou = true) => fnApp("function releituraAoReconectar() {", {
    selo: { falhou }, ocupadoParaAtualizar: () => ocupado, guardasDeRota: new Set(guardas), aoMudarRota: x => remontes.push(x),
    E: { ui: { toast: (t, o) => toasts.push([t, o.acao && o.acao.rotulo, o.acao]) } } });
  assert.equal(mk(false, [], false)(), "nada");
  assert.equal(mk(true, [])(), "avisou");
  assert.equal(mk(false, [() => true])(), "avisou");
  assert.equal(remontes.length, 0, "editor aberto: a tela NÃO é remontada");
  assert.equal(toasts[0][0], "Os dados podem estar desatualizados."); assert.equal(toasts[0][1], "Atualizar");
  toasts[0][2].fn(); assert.deepEqual(remontes, [false], "o «Atualizar» remonta quando a pessoa quiser");
  assert.equal(mk(false, [])(), "remontou"); assert.equal(remontes.length, 2);
  assert.match(APP_JS, /E\.rede\.aoVoltar\(\(\) => \{ releituraAoReconectar\(\); \}\);/);
});

test("CB-166 · ctx.rede.assinar: avisa quando a conexão CAI e quando VOLTA (só mudança de estado; cancelar para de avisar)", () => {
  const ass = new Set();
  const rede = { estado: "online", assinar(fn) { ass.add(fn); return () => ass.delete(fn); } };
  const emite = f => { for (const fn of [...ass]) fn(f); };
  const assinar = fnApp("function assinarMudancaDeRede(rede, fn) {", {});
  const vistos = [];
  const cancelar = assinar(rede, x => vistos.push(x));
  emite({ estado: "online" });                    // contagem / «Reconectado» sem troca de estado: nada
  emite({ estado: "offline" }); emite({ estado: "offline" }); emite({ estado: "online" });
  assert.deepEqual(vistos, [{ estado: "offline", antes: "online", online: false }, { estado: "online", antes: "offline", online: true }]);
  cancelar(); emite({ estado: "servidor_fora" });
  assert.equal(vistos.length, 2);
  assert.equal(typeof assinar(null, () => {}), "function", "sem rede: cancelar vazio, nada quebra");
  assert.match(APP_JS, /assinar\(fn\) \{\s*const cancelar = assinarMudancaDeRede\(E\.rede, fn\);\s*E\.assinaturas\.add\(cancelar\);/, "no ctx.rede, desmontado com a tela");
});

test("UB-121 + UB-124 · faixa de conexão e lista do sino sem aria-live; o sino tem um status curto com o resumo", () => {
  assert.doesNotMatch(APP_JS, /class: "rede-msg", "aria-live"/);
  assert.doesNotMatch(APP_JS, /class: "notif-lista", "aria-live"/);
  assert.match(APP_JS, /const resumo = ui\.h\("p", \{ class: "sr-only", role: "status" \}\);/);
  const resumo = fnApp("function resumoDoSino(total, naoLidas) {", {});
  assert.equal(resumo(0, 0), "Nenhuma notificação");
  assert.equal(resumo(1, 1), "1 notificação, 1 não lida");
  assert.equal(resumo(12, 3), "12 notificações, 3 não lidas");
});

test("UB-269 · notificação de automação ganha o nome dela quando o título é genérico", () => {
  const tit = fnApp("function tituloDaNotificacao(it) {", {});
  assert.equal(tit({ tipo: "automacao", titulo: "Automação", dados: { automacao_nome: "Boas-vindas" } }), "Automação «Boas-vindas» com erro");
  assert.equal(tit({ tipo: "automacao", titulo: "", dados: { automacao_nome: "Boas-vindas" } }), "Automação «Boas-vindas» com erro");
  assert.equal(tit({ tipo: "automacao", titulo: "Boas-vindas parou: 3 erros", dados: { automacao_nome: "Boas-vindas" } }), "Boas-vindas parou: 3 erros", "título do servidor com o nome fica");
  assert.equal(tit({ tipo: "automacao", titulo: "Automação" }), "Automação", "sem nome, como antes");
  assert.equal(tit({ tipo: "tarefa", titulo: "Ligar", dados: { automacao_nome: "x" } }), "Ligar");
});

test("UB-123 · interruptor que salva na hora (role=switch ou [data-salva-na-hora]) não segura a atualização", () => {
  const E = { sessao: null };
  const marcar = fnApp("function marcarEdicao(ev) {", { E, pedirArmazenamentoPersistente: () => {} });
  const sw = h("input", { type: "checkbox", role: "switch" }); marcar({ target: sw });
  assert.equal(E.editouEm, undefined);
  const box = h("div", { dataset: { salvaNaHora: "1" } }, h("input", { type: "checkbox" })); marcar({ target: box.firstChild });
  assert.equal(E.editouEm, undefined);
  marcar({ target: h("input", { type: "text" }) });
  assert.equal(typeof E.editouEm, "number", "campo de texto continua contando");
});

test("UB-126 · aviso de área de trabalho com o ícone da marca (ou o do app)", () => {
  const mk = E => fnApp("function iconeDoAviso() {", { E, location: { href: "https://app.test/app/" } });
  assert.equal(mk({ iconeAviso: "data:image/png;base64,AA" })(), "data:image/png;base64,AA");
  assert.equal(mk({ marca: { favicon: "https://cdn.test/f.png" } })(), "https://cdn.test/f.png");
  assert.equal(mk({ marca: { favicon: "javascript:alert(1)" } })(), "https://app.test/app/icones/icon-192.png");
  // plano 1500c: as opções do aviso saem de opcoesDoAvisoNaoLidas (UCC-120: tag por empresa + renotify); o ícone continua o da marca
  assert.match(APP_JS, /opcoesDoAvisoNaoLidas\(\{ novas, total, cliId: E\.cliente && E\.cliente\.id, somProprio, icone: iconeDoAviso\(\) \}\)/);
});

test("UB-128 · «Fora do plano»: admin ganha «Ver Plano e uso»; com WhatsApp de suporte, «Falar com o suporte»", () => {
  const navs = [];
  // plano 1500c: acoesForaDoPlano(modulo) — sem módulo, as mesmas ações de antes (com módulo, o admin ganha «Pedir este módulo», UCC-095)
  const mk = (papel, wa) => fnApp("function acoesForaDoPlano(modulo = null) {", { E: { M: { rotas: ROTAS }, marca: wa ? { suporte_wa: wa } : {}, cliente: { nome: "Clínica" }, ui: U },
    papelAtual: () => papel, navegar: x => navs.push(x), window: { open() {} } });
  const a = mk("admin", "5512999998888")();
  assert.deepEqual(a.map(x => x.rotulo), ["Ver Plano e uso", "Falar com o suporte"]);
  a[0].fn(); assert.deepEqual(navs, ["#/config/plano"]);
  assert.deepEqual(mk("atendente", null)().map(x => x.rotulo), []);
  assert.deepEqual(mk("atendente", "5512999998888")().map(x => x.rotulo), ["Falar com o suporte"]);
  assert.match(APP_JS, /const acoes = tipo === "fora_do_plano" \? acoesForaDoPlano\(modulo\) : \[\];/);   // plano 1500c: passa o módulo
});

test("UB-130 · número caído: quem não é admin lê «Avise o administrador da empresa»", () => {
  const toasts = [];
  const mk = papel => fnApp("function renderNumeroCaido(assinatura) {", {
    E: { canais: { lista: [{ nome: "Recepção", desde: null }], toast: null, dispensado: "", toastAssinatura: "" }, M: { rotas: ROTAS }, ui: { toast: (t, o) => { toasts.push([t, o.acao]); return { fechar() {} }; } } },
    atualizarPontoCanal: () => {}, desdeQuando: () => null, papelAtual: () => papel, navegar: () => {} });
  mk("atendente")("a");
  assert.match(toasts[0][0], /As mensagens não chegam até reconectar\. Avise o administrador da empresa\.$/); assert.equal(toasts[0][1], null);
  mk("admin")("b");
  assert.doesNotMatch(toasts[1][0], /Avise o administrador/); assert.equal(toasts[1][1].rotulo, "Ver número");
});

test("UB-134 · botão de recolher nasce com o rótulo do estado (menu já recolhido → «Expandir menu»)", () => {
  assert.match(APP_JS, /bt\.setAttribute\("aria-label", recolhido \? "Expandir menu" : "Recolher menu"\);/);
});

test("UB-132 · seletor de empresa: grupo de botões com aria-current (sem listbox/option)", () => {
  assert.match(APP_JS, /class: "empresa-lista", role: "group", "aria-label": "Empresas"/);
  assert.doesNotMatch(APP_JS, /class: "empresa-op", role: "option"/);
});

test("UB-206 + UB-271 · contadores do menu com contexto falado; folha «Mais» repete o contador e o botão ganha um ponto", () => {
  const txt = fnApp("function textoDoBadge(modulo, n) {", {});
  assert.equal(txt("conversas", 3), ", 3 não lidas"); assert.equal(txt("conversas", 1), ", 1 não lida");
  assert.equal(txt("automacoes", 2), ", 2 com erro"); assert.equal(txt("tarefas", 1), ", 1 pendente");
  limparCorpo();
  const nav = h("a", null, "Conversas", h("span", { class: "badge", hidden: true, dataset: { badge: "conversas" } }));
  const ponto = h("span", { class: "barra-ponto", hidden: true, dataset: { pontoMais: "automacoes,agenda" } });
  const folha = h("span", { class: "badge", hidden: true, dataset: { badge: "automacoes" } });
  doc.body.append(nav, ponto, folha);
  const E = { badges: { conversas: 3 }, ui: U };
  const atualizar = fnApp("function atualizarBadges(pulsar) {", { E, document: doc, atualizarSeloDoApp: () => {}, textoDoBadge: txt });
  atualizar();
  assert.equal(nav.textContent, "Conversas3, 3 não lidas"); assert.equal(nav.querySelector(".sr-only").textContent, ", 3 não lidas");
  assert.equal(ponto.hidden, true, "nenhum item escondido com contador");
  E.badges.automacoes = 2; atualizar();
  assert.equal(ponto.hidden, false, "item escondido com contador: ponto no «Mais»");
  assert.equal(folha.hidden, false); assert.match(folha.textContent, /^2, 2 com erro$/);
  assert.match(APP_JS, /ui\.icone\(it\.icone\), it\.rotulo, ui\.h\("span", \{ class: "badge", hidden: true, dataset: \{ badge: it\.id \} \}\)\);/);
  assert.match(CSS_APP, /\.barra-ponto \{ position: absolute;/);
});

test("UB-101 · paleta: as seções das Configurações aparecem fora do hub (por papel, módulo e prontos), sem duplicar com o hub aberto", () => {
  const cat = new Function(`${constDoApp("SECOES_CONFIG_PALETA")}\nreturn SECOES_CONFIG_PALETA;`)();
  const dest = fnApp("function destinosDeConfig({ pronta, pode, gestor, cliente, registrados = new Set() }) {", { SECOES_CONFIG_PALETA: cat });
  const ids = r => r.map(x => x.id);
  const admin = dest({ pronta: () => true, pode: m => ROTAS.podePapel("admin", m), gestor: false, cliente: { modulos: ["conversas"] } });
  assert.ok(ids(admin).includes("config.departamentos") && ids(admin).includes("config.perfil") && ids(admin).includes("config.usuarios"));
  assert.ok(!ids(admin).includes("config.funis"), "sem o módulo crm");
  assert.ok(!ids(admin).includes("config.dominio") && !ids(admin).includes("config.anuncios"), "só a conta gestor");
  const dep = admin.find(x => x.id === "config.departamentos");
  assert.deepEqual([dep.rotulo, dep.hash], ["Configurações: Departamentos e horários", "#/config/departamentos"]);
  assert.match(dep.palavras, /horario/);
  const at = dest({ pronta: () => true, pode: m => ROTAS.podePapel("atendente", m), gestor: false, cliente: { modulos: ["conversas", "crm"] } });
  assert.deepEqual(ids(at), ["config.perfil"], "atendente: só o Perfil");
  assert.deepEqual(ids(dest({ pronta: id => id === "perfil", pode: () => true, gestor: true, cliente: { modulos: ["crm"] } })), ["config.perfil"], "prontos.js manda");
  assert.ok(!ids(dest({ pronta: () => true, pode: () => true, gestor: false, cliente: { modulos: [] }, registrados: new Set(["config.perfil"]) })).includes("config.perfil"), "hub aberto: o comando dele basta");
  // o catálogo acompanha os títulos das seções de verdade
  const fontes = ["config.js", "crm-config.js", "cv-config.js", "ads-config.js", "agenda-config.js", "rastreio-config.js"].map(ler).join("\n");
  for (const s of cat) assert.ok(fontes.includes(`id: "${s.id}", titulo: "${s.titulo}"`), `seção ${s.id} «${s.titulo}» existe no hub`);
  assert.match(APP_JS, /return \[\.\.\.base, \.\.\.destinosDeConfig\(\{/);
});

test("UB-277 · sem_permissao do administrador da empresa manda falar com o suporte; demais papéis como antes", () => {
  const e = { codigo: "sem_permissao" };
  A.definirPapelDasMensagens(() => "admin");
  assert.equal(A.mensagemErro(e), "Esta ação é da plataforma; fale com o suporte.");
  A.definirPapelDasMensagens(() => "atendente");
  assert.equal(A.mensagemErro(e), "Seu acesso não permite fazer isso. Fale com o administrador.");
  A.definirPapelDasMensagens(() => { throw new Error("x"); });
  assert.equal(A.mensagemErro(e), "Seu acesso não permite fazer isso. Fale com o administrador.");
  A.definirPapelDasMensagens(null);
  assert.match(APP_JS, /E\.M\.api\.definirPapelDasMensagens\(\(\) => papelAtual\(\)\)/);
});

test("UB-156 · automacao_invalida sem hint diz onde olhar", () => {
  assert.equal(A.mensagemErro({ codigo: "automacao_invalida" }), "A automação tem um problema: confira o que está marcado em vermelho no editor.");
  assert.equal(A.mensagemErro({ codigo: "automacao_invalida", hint: "falta o gatilho" }), "A automação tem um problema: falta o gatilho.");
});

test("UB-154 · api.fn: a empresa é lida uma vez — a repetição não vai para outra empresa", async () => {
  let empresa = "A"; const corpos = [];
  const api = A.criarApi({ url: "https://x.supabase.co", chave: "pub", token: () => "tk", cliente: () => empresa, retentar: true,
    agora: () => 0, aleatorio: () => .5, online: () => true, esperar: async () => { empresa = "B"; },
    fetch: async (u, init) => { corpos.push(JSON.parse(init.body)); return corpos.length === 1 ? new Response("{}", { status: 503 }) : new Response('{"ok":true}', { status: 200 }); } });
  await api.fn("nx-ia", { acao: "sugerir" }, { leitura: true });
  assert.deepEqual(corpos.map(c => c.cliente), ["A", "A"]);
});

/* ============================================================ ui.js ============================================================ */
test("UB-137 + UB-273 · modal: Esc/X esperam a ação que está gravando; o erro rola para a vista", async () => {
  limparCorpo(); HTMLDialog();
  let soltar;
  const p = U.modal({ titulo: "Gerar link", corpo: h("p", null, "x"), acoes: [{ rotulo: "Gerar", tipo: "primario", fn: () => new Promise((_, rej) => { soltar = rej; }) }] });
  const dlg = [...doc.body.querySelectorAll("dialog")].pop();
  let fechou = false; p.then(() => { fechou = true; });
  await esperar(5);
  dlg.querySelector(".modal-rod button").click(); await tick();
  dlg.querySelector(".modal-x").click(); ev(dlg, "cancel"); await tick();
  assert.equal(fechou, false, "gravando: não fecha");
  const erro = dlg.querySelector(".modal-erro");
  let rolou = 0; erro.scrollIntoView = () => { rolou++; };
  soltar(Object.assign(new Error("x"), { codigo: "sem_conexao" })); await tick(5);
  assert.equal(erro.hidden, false); assert.equal(rolou, 1, "a mensagem de erro rola para a vista");
  dlg.querySelector(".modal-x").click(); assert.equal(await p, null, "terminada a ação, o X volta a fechar");
  await esperar(200);
});

test("UB-139 · menu suspenso: a 1ª letra vai ao item (e repete para o próximo com a mesma letra)", async () => {
  assert.equal(U.proximoPorLetra(["Editar", "Duplicar", "Excluir"], -1, "e"), 0);
  assert.equal(U.proximoPorLetra(["Editar", "Duplicar", "Excluir"], 0, "E"), 2);
  assert.equal(U.proximoPorLetra(["Editar", "Duplicar", "Excluir"], 2, "e"), 0, "dá a volta");
  assert.equal(U.proximoPorLetra(["Área", "Busca"], -1, "a"), 0, "sem acento");
  assert.equal(U.proximoPorLetra(["Editar"], 0, "z"), -1);
  limparCorpo();
  const anc = h("button"); doc.body.appendChild(anc);
  const m = U.menu(anc, [{ rotulo: "Editar", fn() {} }, { rotulo: "Duplicar", fn() {} }, { rotulo: "Excluir", perigo: true, fn() {} }]);
  const pop = doc.querySelector(".menu-pop"); const itens = pop.querySelectorAll(".menu-item");
  itens[0].focus();
  ev(pop, "keydown", { key: "e" }); assert.equal(doc.activeElement, itens[2]);
  ev(pop, "keydown", { key: "d" }); assert.equal(doc.activeElement, itens[1]);
  if (m && m.fechar) m.fechar();
});

test("UB-141 + UB-275 · tabela: vazios no fim nos dois sentidos; o botão diz a ordem atual", () => {
  const t = U.tabela({ colunas: [{ chave: "nome", rotulo: "Nome" }, { chave: "acesso", rotulo: "Acesso", ordenavel: true }],
    linhas: [{ id: "a", nome: "A", acesso: null }, { id: "b", nome: "B", acesso: "2026-10-02" }, { id: "c", nome: "C", acesso: "2026-10-05" }, { id: "d", nome: "D", acesso: "" }] });
  const el = t.el || t;
  const bt = el.querySelector(".th-ord");
  const ordem = () => el.querySelectorAll("tbody tr").map(tr => tr.dataset.id);
  bt.click(); assert.deepEqual(ordem(), ["b", "c", "a", "d"]);
  assert.equal(bt.querySelector(".th-ord-sentido").textContent, " (crescente)");
  bt.click(); assert.deepEqual(ordem(), ["c", "b", "a", "d"], "decrescente: vazios continuam embaixo");
  assert.equal(bt.querySelector(".th-ord-sentido").textContent, " (decrescente)");
});

test("UB-143 · seletor de etiquetas: grupo de caixas (sem listbox com checkbox dentro)", () => {
  limparCorpo();
  const s = U.seletorEtiquetas({ todas: [{ id: 1, nome: "VIP", cor: "#B0761F" }], rotulo: "Etiquetas do contato" });
  doc.body.appendChild(s);
  s.querySelector(".sel-etiq-mais").click();
  const lista = doc.querySelector(".flut-lista");
  assert.ok(lista); assert.equal(lista.getAttribute("role"), "group"); assert.equal(lista.getAttribute("aria-multiselectable"), null);
  assert.equal(lista.getAttribute("aria-label"), "Etiquetas do contato");
  limparCorpo();
});

test("UB-145 + UB-147 · seletor de cor: nomes falados e #RGB curto aceito", () => {
  const cores = ["#6FA3CF", "#8FB8DD", "#E5B35C", "#C9BFAF", "#7FD1A5", "#F08A74", "#9D9486", "#B0761F", "#CF9540", "#A98BD6", "#5FB3A8", "#D67FA3"];
  const nomes = cores.map(U.nomeDaCor);
  assert.ok(nomes.every(n => n && !/#|\d/.test(n)), nomes.join(","));
  assert.equal(U.nomeDaCor("#E5B35C"), "Âmbar"); assert.equal(U.nomeDaCor("#8FB8DD"), "Azul claro"); assert.equal(U.nomeDaCor("#B0761F"), "Bronze");
  assert.equal(U.nomeDaCor("xyz"), null);
  const vistos = [];
  const sc = U.seletorCor({ paleta: cores, aoMudar: c => vistos.push(c) });
  const ops = sc.querySelectorAll(".cor-op");
  assert.equal(ops[2].getAttribute("aria-label"), "Âmbar"); assert.equal(ops[2].getAttribute("aria-description"), "#E5B35C");
  assert.equal(U.hexDigitado("fa0"), "#FFAA00"); assert.equal(U.hexDigitado("#Fa0"), "#FFAA00"); assert.equal(U.hexDigitado("#12345"), null);
  const hex = sc.querySelector(".cor-hex");
  hex.value = "#fa0"; ev(hex, "input");
  assert.deepEqual(vistos, ["#FFAA00"]); assert.equal(hex.getAttribute("aria-invalid"), null);
  ev(hex, "blur"); assert.equal(hex.value, "#FFAA00");
});

test("UB-208 · ui.vazio({nivel}): título no nível pedido (padrão h2)", () => {
  assert.equal(U.vazio({ titulo: "Nada" }).querySelector("h2").textContent, "Nada");
  const v3 = U.vazio({ titulo: "Nenhuma automação", nivel: 3 });
  assert.equal(v3.querySelector("h2"), null); assert.equal(v3.querySelector("h3").textContent, "Nenhuma automação");
  assert.ok(v3.querySelector("h3.vazio-tit"));
  assert.match(CSS_APP, /\.vazio h2, \.vazio \.vazio-tit \{/);
});

test("pedido da config · barraUso com limite 0 = «não incluído no plano», sem barra cheia «0 / 0»", () => {
  const b = U.barraUso("Sugestões de IA", 0, 0);
  assert.match(b.textContent, /não incluído no plano/); assert.doesNotMatch(b.textContent, /0 \/ 0/);
  assert.equal(b.querySelector("[role=meter]"), null); assert.ok(b.classList.contains("uso-fora"));
  assert.match(U.barraUso("IA", 4, 0).textContent, /não incluído no plano · 4 em uso/);
  const normal = U.barraUso("Usuários", 5, 5);
  assert.ok(normal.querySelector(".uso-barra.cheia")); assert.match(normal.textContent, /5 \/ 5/);
  assert.match(U.barraUso("x", 3, null).textContent, /sem limite/);
});

test("UB-152 · botões de copiar do DNS com 44 px no toque", () => {
  assert.match(CSS_APP, /\.bt-icone-p \.ic \{[^}]*\}\n@media \(pointer: coarse\) \{ \.bt-icone-p \{ width: 44px; height: 44px; \} \}/);
});

/* ============================================================ login.js ============================================================ */
const montarLogin = async (modulo, partes, extra = {}) => {
  limparCorpo(); const alvo = h("div"); doc.body.appendChild(alvo);
  await LOGIN.montar({ alvo, rota: { modulo, partes, query: {} }, ui: U, titulo() {}, marca: {}, tema: T, pintarMarcaOrg() {}, ...extra });
  return alvo;
};
test("UB-158 · nova senha (link e troca obrigatória) com medidor de força", async () => {
  const api = { publica: async () => ({}), rpc: async () => ({}), mensagemErro: A.mensagemErro };
  const a1 = await montarLogin("senha", ["a".repeat(64)], { api });
  assert.ok(a1.querySelector(".medidor"), "link de senha: medidor");
  const a2 = await montarLogin("trocar", [], { api, sair() {}, aoTrocarSenha: async () => {} });
  assert.ok(a2.querySelector(".medidor"), "troca obrigatória: medidor");
  LOGIN.desmontar();
});
test("UB-160 · troca obrigatória recusa a mesma senha (sem chamada)", async () => {
  const chamadas = [];
  const api = { rpc: async (n, p) => { chamadas.push(n); return {}; }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("trocar", [], { api, sair() {}, aoTrocarSenha: async () => {} });
  const form = alvo.querySelector("form");
  for (const [n, v] of [["atual", "Senha12345"], ["nova", "Senha12345"], ["nova2", "Senha12345"]]) form.querySelector(`input[name=${n}]`).value = v;
  ev(form, "submit"); await tick(4);
  assert.deepEqual(chamadas, []);
  assert.match(form.textContent, /Use uma senha diferente da que o administrador criou/);
  LOGIN.desmontar();
});
test("UB-164 · link de senha: servidor que devolve token entra direto; sem token, o «Entrar» de antes", async () => {
  const entradas = [];
  const mk = r => montarLogin("senha", ["b".repeat(64)], { api: { publica: async () => r, mensagemErro: A.mensagemErro }, aoEntrar: async t => { entradas.push(t); } });
  for (const [r, esperado] of [[{ token: "tok-novo" }, ["tok-novo"]], [{ ok: true }, ["tok-novo"]]]) {
    const alvo = await mk(r);
    const form = alvo.querySelector("form");
    form.querySelector("input[name=senha]").value = "Outra#Senha9"; form.querySelector("input[name=senha2]").value = "Outra#Senha9";
    ev(form, "submit"); await tick(6);
    assert.deepEqual(entradas, esperado);
    if (!r.token) assert.match(alvo.textContent, /Senha criada/);
  }
  LOGIN.desmontar();
});
test("UB-162 + UB-166 · convite: e-mail do convite fica somente leitura; convite indisponível oferece o suporte", async () => {
  const c = LOGIN.campoEmailDoConvite(U, "ana@x.com");
  assert.ok(c.querySelector("input").hasAttribute("readonly")); assert.match(c.textContent, /O convite é para este e-mail/);
  const livre = LOGIN.campoEmailDoConvite(U, "");
  assert.equal(livre.querySelector("input").hasAttribute("readonly"), false);
  const api = { publica: async () => { throw Object.assign(new Error("x"), { codigo: "convite_invalido" }); }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { api, marca: { suporte_wa: "5512999998888" } });
  const wa = [...alvo.querySelectorAll("a")].find(a => /Falar com o suporte/.test(a.textContent));
  assert.ok(wa, "botão do suporte"); assert.match(wa.getAttribute("href"), /5512999998888/);
  const sem = await montarLogin("convite", ["c".repeat(64)], { api, marca: {} });
  assert.equal([...sem.querySelectorAll("a")].some(a => /suporte/.test(a.textContent)), false);
  LOGIN.desmontar();
});

/* ============================================================ pwa.js · sw.js · paleta · index ============================================================ */
test("UB-169 · faixa de versão anunciada uma vez só (role=status, sem ui.anunciar a mais)", () => {
  const PWA_TXT = ler("pwa.js");
  assert.doesNotMatch(PWA_TXT, /anunciar\("Nova versão pronta/);
  const f = PWA.criarFaixaVersao(U, "Órbita", () => {});
  assert.equal(f.getAttribute("role"), "status");
});

test("UB-171 · versao.json: prazo de 5 s e uma consulta por vez", async () => {
  let abortou = false;
  const presa = (u, o) => new Promise(() => { o.signal.addEventListener("abort", () => { abortou = true; }); });
  assert.equal(await PWA.buscarVersaoComPrazo(presa, "https://x/versao.json", 20), null);
  assert.equal(abortou, true, "o fetch preso é abortado");
  assert.deepEqual(await PWA.buscarVersaoComPrazo(async () => ({ ok: true, json: async () => ({ versao: "2" }) }), "u", 50), { versao: "2" });
  assert.equal(PWA.PRAZO_VERSAO_MS, 5000);
  let buscas = 0, soltar;
  const v = PWA.criarVersao({ versao: "1", buscar: () => { buscas++; return new Promise(r => { soltar = r; }); } });
  const p1 = v.verificar(), r2 = await v.verificar();
  assert.equal(buscas, 1); assert.equal(r2.emAndamento, true);
  soltar({ versao: "1" }); await p1;
  const p3 = v.verificar(); assert.equal(buscas, 2, "terminada a anterior, consulta de novo");
  soltar({ versao: "1" }); await p3;
});

test("UB-173 + UB-175 · sw: fontes do espelho (/nexus-ads/fonts/) ficam offline; instalação baixa 4 por vez", async () => {
  const w = criarMundoSW({ escopo: "/nexus-ads/app/" });
  const e = w.evento({ request: w.req("/nexus-ads/fonts/satoshi.woff2") });
  w.ouvintes.fetch(e);
  assert.ok(e.resposta, "o worker responde a fonte do espelho (antes passava direto)");
  await e.resposta; await e.fim();
  const guardadas = [...w.armazem.values()].flatMap(m => [...m.keys()]);
  assert.ok(guardadas.some(k => k.endsWith("/nexus-ads/fonts/satoshi.woff2")), "guardada");
  const arqs = Array.from({ length: 12 }, (_, i) => `m${i}.js?v=V2`);
  let ativos = 0, pico = 0;
  const w2 = criarMundoSW({ tetoTimeout: 2000, resposta: async url => {
    if (url.endsWith("/app/index.html")) return new Response(`<link href="app.css?v=V2"><script src="app.js?v=V2"></script>${arqs.map(a => `<script src="${a}"></script>`).join("")}`, { status: 200 });
    ativos++; pico = Math.max(pico, ativos); await esperar(5); ativos--; return new Response("x", { status: 200 });
  } });
  const ei = w2.evento({}); w2.ouvintes.install(ei); await ei.fim();
  assert.ok(pico <= 4, `pico ${pico}`);
  assert.match(SW_TXT, /await guardarEmLotes\(cache, urls\.filter\(u => !essenciais\.includes\(u\)\)\);/);
});

test("UB-177 · paleta: aria-expanded acompanha os resultados", () => {
  assert.match(ler("paleta.js"), /campo\.setAttribute\("aria-expanded", String\(itens\.length > 0\)\);/);
});

test("UB-180 · index.html avisa quando o JavaScript está desligado", () => {
  assert.match(HTML, /<noscript>[\s\S]*Este sistema precisa do JavaScript ligado no navegador\.[\s\S]*<\/noscript>/);
});

test("UB-233 + UB-230 + UB-241 (pedidos da cobertura) · gaveta, sessionStorage no Sair e telefone sem DDD", async () => {
  assert.equal(U.telBR("998303030"), "99830-3030"); assert.equal(U.telBR("38303030"), "3830-3030");
  assert.doesNotMatch(UI_TXT, /class: "bt-icone gaveta-x", "aria-label": "Fechar", on: \{ click: \(\) => g\.fechar\(\) \}/);
  const sessao = loja({ "nx-au-rasc:e1:c1:nova": "{}", "nx-app-destino": "#/crm" });
  const limpar = fnApp("function limparDadosDoAparelho() {", { E: { cache: null, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, localStorage: loja(), sessionStorage: sessao,
    LS: { lerTxt: () => null, apagar() {} }, PREFIXOS_DA_CONTA: ["nx-au-rasc:"], CHAVE_CONTA: "c", CHAVE_RASCUNHOS_DE: "r" });
  await limpar();
  assert.deepEqual([...sessao.m.keys()], ["nx-app-destino"]);
});

test("RB-167 (pedido do Início) · ui.segmentado: o ResizeObserver se desliga quando o elemento sai do DOM (e por el.destruir())", () => {
  const antes = globalThis.ResizeObserver;
  const vivos = new Set();
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; } observe() { vivos.add(this); } disconnect() { vivos.delete(this); } };
  try {
    limparCorpo();
    const op = [{ valor: "a", rotulo: "A" }, { valor: "b", rotulo: "B" }];
    const s = U.segmentado({ opcoes: op, valor: "a" });
    const [ro] = [...vivos];
    ro.fn();                                     // ainda fora do DOM (antes de entrar): continua observando
    assert.equal(vivos.size, 1);
    doc.body.appendChild(s); ro.fn(); assert.equal(vivos.size, 1, "no DOM: observa");
    s.remove(); ro.fn();
    assert.equal(vivos.size, 0, "saiu do DOM: desligado");
    const s2 = U.segmentado({ opcoes: op, valor: "a" });
    assert.equal(vivos.size, 1); s2.destruir(); assert.equal(vivos.size, 0, "destruir() desliga");
  } finally { globalThis.ResizeObserver = antes; }
});

/* ============================================================ lote sis-2 ============================================================ */
const textoAnuncio = () => { const r = doc.getElementById("anuncio"); return r ? r.textContent : ""; };

test("UB-140 · tabela: a caixa de seleção diz a linha («Selecionar Maria Souza»)", () => {
  const t = U.tabela({ selecao: true, colunas: [{ chave: "papel", rotulo: "Papel" }, { chave: "nome", rotulo: "Nome", principal: true }],
    linhas: [{ id: "a", nome: "Maria Souza", papel: "admin" }, { id: "b", nome: "", papel: "x" }] });
  const el = t.el || t;
  const cbs = el.querySelectorAll("tbody input");
  assert.equal(cbs[0].getAttribute("aria-label"), "Selecionar Maria Souza");
  assert.equal(cbs[1].getAttribute("aria-label"), "Selecionar", "sem valor: o rótulo de antes");
  const t2 = U.tabela({ selecao: true, colunas: [{ chave: "nome", rotulo: "Nome" }], linhas: [{ id: "z", nome: "João" }] });
  assert.equal((t2.el || t2).querySelector("tbody input").getAttribute("aria-label"), "Selecionar João", "sem principal: a 1ª coluna");
});

test("UB-142 · contador de caracteres: ligado ao campo e anuncia o limite uma vez", async () => {
  limparCorpo();
  const c = U.campo({ rotulo: "Nome", nome: "n", max: 5 }); doc.body.appendChild(c);
  const inp = c.querySelector("input"), cont = c.querySelector(".campo-contador");
  assert.ok(cont.id && String(inp.getAttribute("aria-describedby")).split(" ").includes(cont.id));
  inp.value = "12345"; ev(inp, "input"); await esperar(45);
  assert.equal(textoAnuncio(), "Limite de 5 caracteres.");
  doc.getElementById("anuncio").textContent = "";
  ev(inp, "input"); await esperar(45);
  assert.equal(textoAnuncio(), "", "no limite de novo: não repete");
  inp.value = "123"; ev(inp, "input"); inp.value = "12345"; ev(inp, "input"); await esperar(45);
  assert.equal(textoAnuncio(), "Limite de 5 caracteres.", "saiu e voltou ao limite: avisa outra vez");
  limparCorpo();
});

test("UB-144 · busca de etiqueta sem acento: «orcamento» acha «Orçamento»", () => {
  limparCorpo();
  const s = U.seletorEtiquetas({ todas: [{ id: 1, nome: "Orçamento", cor: "#B0761F" }, { id: 2, nome: "VIP", cor: "#6FA3CF" }] });
  doc.body.appendChild(s);
  s.querySelector(".sel-etiq-mais").click();
  const busca = doc.querySelector(".flut-busca");
  busca.value = "orcamento"; ev(busca, "input");
  const ops = doc.querySelectorAll(".flut-lista .flut-op");
  assert.equal(ops.length, 1); assert.match(ops[0].textContent, /Orçamento/);
  limparCorpo();
});

test("UB-146 · cor digitada errada: a frase de como digitar aparece ao sair do campo e some com uma cor válida", () => {
  const sc = U.seletorCor({ paleta: ["#B0761F"] });
  const hex = sc.querySelector(".cor-hex"), msg = sc.querySelector(".cor-erro");
  assert.equal(hex.getAttribute("aria-describedby"), msg.id);
  assert.equal(msg.hidden, true);
  hex.value = "azul"; ev(hex, "input"); ev(hex, "blur");
  assert.equal(msg.hidden, false); assert.match(msg.textContent, /Use #RRGGBB, por exemplo #B0761F/);
  hex.value = "#123456"; ev(hex, "input");
  assert.equal(msg.hidden, true);
  hex.value = ""; ev(hex, "blur"); assert.equal(msg.hidden, true, "campo vazio não é erro");
});

test("UB-209 · esqueleto secundário com anunciar:false não fala «Carregando…»", () => {
  assert.ok(U.esqueleto("lista").querySelector("[role=status]"));
  assert.equal(U.esqueleto("lista", { anunciar: false }).querySelector("[role=status]"), null);
  assert.ok(U.esqueleto("tabela", { n: 3 }).querySelector("[role=status]"), "número continua valendo");
});

test("UB-274 · toque: erro com ação fica até fechar; sem ação (ou com mouse) continua com prazo", () => {
  const antes = globalThis.matchMedia;
  const temRelogio = t => t.el._ouv.some(o => o.tipo === "mouseenter");
  try {
    globalThis.matchMedia = q => ({ matches: /coarse/.test(q) });
    const a = U.toast("Falhou", { tipo: "erro", acao: { rotulo: "Tentar", fn() {} } });
    assert.equal(temRelogio(a), false, "toque + ação: sem relógio");
    const b = U.toast("Falhou", { tipo: "erro" });
    assert.equal(temRelogio(b), true);
    a.fechar(); b.fechar();
    globalThis.matchMedia = () => ({ matches: false });
    const c = U.toast("Falhou", { tipo: "erro", acao: { rotulo: "Tentar", fn() {} } });
    assert.equal(temRelogio(c), true, "mouse: 12 s como antes"); c.fechar();
  } finally { globalThis.matchMedia = antes; }
});

test("UB-276 · link de senha/convite nasce truncado; «Mostrar link» revela e o Copiar usa o completo", () => {
  const tok = "9f3a".padEnd(64, "b");
  const link = `https://app.test/app/#/senha/${tok}`;
  assert.equal(U.linkTruncado(link), "…/senha/9f3a…");
  assert.equal(U.linkTruncado("https://x/convite/abc"), "https://x/convite/abc", "sem trecho longo: inteiro");
  const b = U.blocoLink(link, { rotulo: "Link de nova senha" });
  const inp = b.querySelector("input");
  assert.equal(inp.value, "…/senha/9f3a…");
  const mostrar = b.querySelector(".bloco-link-mostrar");
  assert.equal(mostrar.getAttribute("aria-pressed"), "false");
  mostrar.click();
  assert.equal(inp.value, link); assert.equal(mostrar.getAttribute("aria-pressed"), "true"); assert.match(mostrar.textContent, /Esconder link/);
  mostrar.click(); assert.equal(inp.value, "…/senha/9f3a…");
  assert.equal(U.blocoLink("https://x").querySelector(".bloco-link-mostrar"), null, "link curto: sem botão");
  assert.match(UI_TXT, /on: \{ click: \(\) => copiar\(link, \{ aviso: "Link copiado\." \}\) \}/, "copiar continua com o link inteiro");
});

test("UB-138 · painel flutuante com nome: rotulo → aria-label; sem ele, o 1º .rotulo dá o nome", () => {
  limparCorpo();
  const anc = h("button"); doc.body.appendChild(anc);
  const f1 = U.flutuante(anc, h("div", null, "x"), { rotulo: "Notificações" });
  assert.equal(f1.el.getAttribute("role"), "dialog"); assert.equal(f1.el.getAttribute("aria-label"), "Notificações"); f1.fechar();
  const f2 = U.flutuante(anc, h("div", null, h("p", { class: "rotulo" }, "Departamentos"), "y"));
  const id = f2.el.getAttribute("aria-labelledby");
  assert.ok(id); assert.equal(doc.getElementById(id).textContent, "Departamentos"); f2.fechar();
  assert.match(APP_JS, /classe: "notifs", rotulo: "Notificações"/);
  assert.match(APP_JS, /\{ largura: 320, rotulo: "Trocar de empresa" \}/);
  limparCorpo();
});

test("UB-149 + UB-151 · X do aviso e selects .sel com 44 px no toque", () => {
  assert.match(CSS_APP, /@media \(pointer: coarse\) \{ \.toast-x \{ width: 44px; height: 44px; \} \.sel \{ min-height: 44px; \} \}/);
  const i = CSS_APP.indexOf(".toast-x { width: 44px"), j = CSS_APP.indexOf(".toast-x { display: inline-grid");
  assert.ok(i > j, "a regra de toque vem depois da de 32 px (vence pela ordem)");
});

test("UB-153 + UB-155 · nx_saude e nx_auto_simular são leituras; telefone_invalido diz como digitar", () => {
  assert.equal(A.ehLeitura("nx_saude"), true); assert.equal(A.ehLeitura("nx_auto_simular"), true);
  assert.equal(A.ehLeitura("nx_automacao_salvar"), false);
  assert.equal(A.mensagemErro({ codigo: "telefone_invalido" }), "Confira o telefone: DDD + número, ex.: (12) 99830-3030.");
});

/* ---------- login ---------- */
test("UB-157 · entrar sem internet: a senha continua no campo; senha errada ainda limpa", async () => {
  for (const [codigo, fica] of [["sem_conexao", true], ["tempo_rede", true], ["credenciais_invalidas", false]]) {
    const api = { publica: async () => { throw Object.assign(new Error(codigo), { codigo }); }, mensagemErro: A.mensagemErro };
    const alvo = await montarLogin("login", [], { api, aoEntrar: async () => {} });
    const form = alvo.querySelector("form");
    form.querySelector("input[name=email]").value = "ana@x.com"; form.querySelector("input[name=senha]").value = "Segredo#123";
    ev(form, "submit"); await tick(6);
    assert.equal(form.querySelector("input[name=senha]").value, fica ? "Segredo#123" : "", codigo);
  }
  LOGIN.desmontar();
});

test("UB-159 · #/senha/abc mostra «Este link não vale mais» com «Ir para a entrada», sem formulário", async () => {
  const alvo = await montarLogin("senha", ["abc"], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.equal(alvo.querySelector("form"), null);
  assert.match(alvo.textContent, /Este link não vale mais/);
  const ir = [...alvo.querySelectorAll("a")].find(a => /Ir para a entrada/.test(a.textContent));
  assert.ok(ir); assert.equal(ir.getAttribute("href"), "#/login");
  LOGIN.desmontar();
});

test("UB-161 · troca obrigatória: senha atual errada marca o campo «Senha atual»", async () => {
  const api = { rpc: async () => { throw Object.assign(new Error("x"), { codigo: "credenciais_invalidas" }); }, mensagemErro: A.mensagemErro };
  const alvo = await montarLogin("trocar", [], { api, sair() {}, aoTrocarSenha: async () => {} });
  await esperar(90);   // o focarDepois (60 ms) das telas montadas antes já rodou: o foco que vale é o do erro
  const form = alvo.querySelector("form");
  for (const [n, v] of [["atual", "Errada123"], ["nova", "Nova#Senha9"], ["nova2", "Nova#Senha9"]]) form.querySelector(`input[name=${n}]`).value = v;
  ev(form, "submit"); await tick(6);
  const atual = form.querySelector("input[name=atual]");
  assert.equal(atual.getAttribute("aria-invalid"), "true");
  assert.equal(doc.activeElement, atual);
  assert.match(form.textContent, /A senha atual não confere/);
  LOGIN.desmontar();
});

test("UB-163 + UB-165 · convite: mostra a validade quando o servidor manda; convite que deixou de valer troca o formulário pelo caminho", async () => {
  const expira = new Date(Date.now() + 3 * 864e5).toISOString();
  let aceitar = null;
  const api = { mensagemErro: A.mensagemErro, publica: async n => {
    if (n === "nx_convite_ver") return { nome: "", email: "ana@x.com", papel: "atendente", cliente: { nome: "Clínica" }, expira_em: expira };
    throw aceitar;
  } };
  const alvo = await montarLogin("convite", ["d".repeat(64)], { api, aoEntrar: async () => {} });
  assert.match(alvo.textContent, new RegExp(`Vale até ${U.dataCurtaBR(expira)} ${U.horaBR(expira)}`));
  aceitar = Object.assign(new Error("x"), { codigo: "convite_invalido" });
  const form = alvo.querySelector("form");
  // plano 1500c: UCB-044 — «Senha#1234» passou a ser recusada como fácil de adivinhar (nem chega ao servidor); o teste usa uma senha forte
  for (const [n, v] of [["nome", "Ana"], ["senha", "Cavalo-azul-77"], ["senha2", "Cavalo-azul-77"]]) form.querySelector(`input[name=${n}]`).value = v;
  ev(form, "submit"); await tick(6);
  assert.equal(alvo.querySelector("form"), null, "sem formulário morto");
  assert.match(alvo.textContent, /Este convite não vale mais/);
  assert.ok([...alvo.querySelectorAll("a")].some(a => a.getAttribute("href") === "#/login"));
  const semData = await montarLogin("convite", ["d".repeat(64)], { api: { ...api, publica: async () => ({ papel: "atendente", cliente: { nome: "C" } }) } });
  assert.doesNotMatch(semData.textContent, /Vale até/, "servidor atual (sem expira_em): nada aparece");
  LOGIN.desmontar();
});

test("UB-179 · revenda sem título de login não herda o slogan da Órbita", () => {
  assert.equal(T.marcaEfetiva({ produto: "Conecta CRM" }).login_titulo, "Entre para continuar");
  assert.equal(T.marcaEfetiva({}).login_titulo, "Anúncio, conversa e venda na mesma órbita.");
  assert.equal(T.marcaEfetiva({ produto: "Órbita" }).login_titulo, "Anúncio, conversa e venda na mesma órbita.");
  assert.equal(T.marcaEfetiva({ produto: "Conecta", login_titulo: "Bem-vindo" }).login_titulo, "Bem-vindo");
});

/* ---------- pwa · sw · index ---------- */
test("UB-170 · aba escondida: a verificação periódica do versao.json é pulada", () => {
  let n = 0; const v = { verificar: () => { n++; return Promise.resolve(); } };
  assert.equal(PWA.verificarSeVisivel({ hidden: true }, v), null); assert.equal(n, 0);
  PWA.verificarSeVisivel({ hidden: false }, v); assert.equal(n, 1);
  // plano 1500c: o mesmo relógio também chama o.aoVerificar (UCC-129) — só quando a verificação rodou (aba visível)
  assert.match(ler("pwa.js"), /setInterval\(\(\) => \{ if \(verificarSeVisivel\(doc, v\) === null\) return;/);
});

test("UB-172 · «Atualizar» com falha recarrega, sem promessa rejeitada sem dono", async () => {
  const soltas = []; const ouvir = e => soltas.push(e); process.on("unhandledRejection", ouvir);
  try {
    let rec = 0;
    const r = await PWA.aplicarOuRecarregar({ aplicar: async () => { throw new Error("aoAplicar"); } }, () => { rec++; });
    assert.equal(r, false); assert.equal(rec, 1);
    let rec2 = 0;
    assert.equal(await PWA.aplicarOuRecarregar({ aplicar: async () => true }, () => { rec2++; }), true); assert.equal(rec2, 0);
    await tick(3);
    assert.deepEqual(soltas, []);
  } finally { process.off("unhandledRejection", ouvir); }
  // plano 1500c: antes de aplicar, guarda as notas da versão (UC-037); o «Atualizar» continua indo por aplicarOuRecarregar
  assert.match(ler("pwa.js"), /guardarNovidades\([^\n]*\n\s*aplicarOuRecarregar\(v, recarregar\);/);
});

test("UB-174 · página «Sem conexão» diz que o app volta e que nada se perdeu", async () => {
  const w = criarMundoSW({ resposta: async () => { throw new TypeError("sem rede"); } });
  const e = w.evento({ request: w.req("/app/", { mode: "navigate", destination: "document" }) });
  w.ouvintes.fetch(e);
  assert.ok(e.resposta, "a navegação é atendida pelo worker");
  const r = await e.resposta;
  const txt = await r.text();
  assert.match(txt, /Quando a internet voltar, toque em Tentar de novo\. Nada do que você salvou se perdeu\./);
});

test("UB-181 · theme-color claro e escuro desde o HTML; o app pinta as duas", () => {
  assert.match(HTML, /<meta name="theme-color" content="#FAFAF8" media="\(prefers-color-scheme: light\)">/);
  assert.match(HTML, /<meta name="theme-color" content="#07090C" media="\(prefers-color-scheme: dark\)">/);
  assert.match(APP_JS, /for \(const meta of document\.querySelectorAll\('meta\[name="theme-color"\]'\)\) meta\.setAttribute\("content", t\.vars\["--c-fundo"\]\);/);
});

/* ---------- rotas ---------- */
test("UB-176 · atalhos «Ir para…» em Automações e Configurações", () => {
  assert.deepEqual(ROTAS.regioesDaRota("automacoes").map(r => r.rotulo), ["Ir para Suas automações", "Ir para Receitas"]);
  assert.deepEqual(ROTAS.regioesDaRota("config").map(r => r.rotulo), ["Ir para o menu de seções", "Ir para a seção"]);
  limparCorpo();
  const sec = h("section", { "aria-labelledby": "au-suas" }); const nav = h("nav", { "aria-label": "Seções das configurações" });
  doc.body.append(sec, nav);
  assert.equal(doc.querySelector(ROTAS.regioesDaRota("automacoes")[0].alvo), sec);
  assert.equal(doc.querySelector(ROTAS.regioesDaRota("config")[0].alvo), nav);
  const auto = ler("automacoes.js"), cfg = ler("config.js");
  assert.match(auto, /"aria-labelledby": "au-suas"/); assert.match(auto, /"aria-labelledby": "au-mod"/);
  assert.match(cfg, /"aria-label": "Seções das configurações"/); assert.match(cfg, /h\("section", \{ class: "cfg-sec", "aria-labelledby": "cfg-sec-tit" \}\)/);   // plano 1000b (revisão · UB-176): a seção ganhou nome
  limparCorpo();
});

test("UB-278 · barra do celular: o item aberto 3× pelo «Mais» entra no 4º lugar", () => {
  const itens = ["inicio", "conversas", "crm", "agenda", "automacoes", "relatorios"].map(id => ({ id })).concat([{ id: "config", fixo: true }]);
  const ids = l => l.map(i => i.id);
  assert.deepEqual(ids(ROTAS.itensDaBarra(itens, {})), ["inicio", "conversas", "crm", "agenda"]);
  assert.deepEqual(ids(ROTAS.itensDaBarra(itens, { automacoes: 2 })), ["inicio", "conversas", "crm", "agenda"], "2 vezes ainda não");
  assert.deepEqual(ids(ROTAS.itensDaBarra(itens, { automacoes: 3, relatorios: 1 })), ["inicio", "conversas", "crm", "automacoes"]);
  assert.deepEqual(ids(ROTAS.itensDaBarra(itens, { automacoes: 3, relatorios: 5 })), ["inicio", "conversas", "crm", "relatorios"], "o mais usado");
  assert.deepEqual(ids(ROTAS.itensDaBarra(itens, { config: 9 })), ["inicio", "conversas", "crm", "agenda"], "fixo nunca");
  const st = loja();
  const LS = { ler: k => { const s = st.getItem(k); return s ? JSON.parse(s) : null; }, gravar: (k, v) => st.setItem(k, JSON.stringify(v)) };
  const ler_ = fnApp("function lerUsosDaBarra() {", { LS, CHAVE_USOS_BARRA: "u" });
  const contar = fnApp("function contarUsoDaBarra(id) {", { LS, lerUsosDaBarra: ler_, CHAVE_USOS_BARRA: "u" });
  assert.deepEqual([contar("automacoes"), contar("automacoes"), contar("automacoes")], [1, 2, 3]);
  assert.deepEqual(ler_(), { automacoes: 3 });
  assert.match(APP_JS, /const prefer = E\.M\.rotas\.itensDaBarra\(itens, lerUsosDaBarra\(\)\);/);
});

/* ---------- app.js ---------- */
test("UB-127 · Ctrl+K não abre a paleta por cima de outra janela (a própria paleta não conta)", () => {
  limparCorpo();
  const outro = fnApp("function outroDialogoAberto(doc) {", {});
  assert.equal(outro(doc), false);
  const pal = h("dialog", { class: "busca-g" }); pal.setAttribute("open", ""); doc.body.appendChild(pal);
  assert.equal(outro(doc), false, "só a paleta aberta: o atalho a fecha");
  const conf = h("dialog"); conf.setAttribute("open", ""); doc.body.appendChild(conf);
  assert.equal(outro(doc), true);
  assert.match(APP_JS, /ui\.atalho\("mod\+k", ev => \{\s*if \(!E\.sessao \|\| \$\("app"\)\.hidden\) return;\s*if \(outroDialogoAberto\(document\)\) return;/);
  limparCorpo();
});

test("UB-129 · «Sem acesso» diz o papel exigido e o da pessoa", () => {
  const txt = fnApp("function textoSemAcesso(min, papel, rotulos = {}) {", {});
  const R = VOCAB.ROTULO_PAPEL;
  assert.equal(txt("supervisor", "atendente", R), "Esta área é de Supervisor ou acima; seu papel é Atendente. Fale com o administrador da sua empresa.");
  assert.equal(txt("gestor", "admin", R), "Esta área é da equipe da plataforma; seu papel é Administrador. Fale com o administrador da sua empresa.");
  assert.equal(txt(null, "atendente", R), "Fale com o administrador da sua empresa.");
  assert.equal(txt("admin", null, R), "Esta área é de Administrador ou acima. Fale com o administrador da sua empresa.");
  assert.match(APP_JS, /vista\.appendChild\(cartaoBloqueio\(acesso, r\.modulo\)\);/);
});

test("UB-131 · versao.json da faixa de migração vale 10 min", async () => {
  let buscas = 0;
  const E = {};
  const vr = fnApp("function versaoRemota(agora = Date.now()) {", { E, VALIDADE_VERSAO_MS: 600000, location: { href: "https://x.test/app/" },
    fetch: async () => { buscas++; return { ok: true, json: async () => ({ min_migracao: `m${buscas}` }) }; } });
  assert.deepEqual(await vr(1000), { min_migracao: "m1" });
  assert.deepEqual(await vr(1000 + 599999), { min_migracao: "m1" }); assert.equal(buscas, 1, "dentro dos 10 min: a mesma leitura");
  assert.deepEqual(await vr(1000 + 600000), { min_migracao: "m2" }); assert.equal(buscas, 2, "passou: lê de novo");
  // plano 1500c: a reconferência de 10 min agora vai pelo relógio único do pwa.js (UCC-129: aoVerificar), que já não roda com a aba escondida
  assert.match(APP_JS, /aoVerificar: \(\) => conferirMigracao\(\)/);
});

test("UB-133 + UB-138 · seletor de empresa: Enter na busca troca para o 1º resultado; o painel tem nome", async () => {
  limparCorpo();
  const clientes = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, nome: `Clínica ${["Alfa", "Beta", "Gama", "Delta", "Épsilon", "Zeta", "Eta", "Teta", "Iota"][i]}`, slug: `c${i}`, papel: "admin", status: "ativo" }));
  const escolhidos = [];
  const anc = h("button"); doc.body.appendChild(anc);
  const abrir = fnApp("function abrirSeletorEmpresa(ancora) {", { E: { ui: U, sessao: { clientes }, cliente: clientes[0], M: { vocab: VOCAB } },
    sinaisDaEmpresa: () => [], podeSairDaRota: async () => true, escolherCliente: async id => { escolhidos.push(id); } });
  abrir(anc);
  const pop = doc.querySelector(".flut");
  assert.equal(pop.getAttribute("aria-label"), "Trocar de empresa");
  const busca = pop.querySelector(".flut-busca");
  busca.value = "gama"; ev(busca, "input");
  const e = new Evento("keydown", { key: "Enter" }); busca.dispatchEvent(e); await tick(4);
  assert.equal(e.defaultPrevented, true); assert.deepEqual(escolhidos, ["c2"]);
  limparCorpo();
});

test("UB-135 + UB-280 · Sair espera a limpeza do aparelho; nx-au-ordem: e nx-onb: saem junto", () => {
  const corpo = fnDoApp("async function sair(");
  assert.match(corpo, /await limparComPrazo\(\);/);
  assert.ok(corpo.indexOf("await limparComPrazo()") < corpo.indexOf('navegar("#/login"'), "limpa antes de ir ao login");
  const PREF = new Function(`${constDoApp("PREFIXOS_DA_CONTA")}\nreturn PREFIXOS_DA_CONTA;`)();
  assert.ok(PREF.includes("nx-au-ordem:") && PREF.includes("nx-onb:"));
  const local = loja({ "nx-au-ordem:e1|c1": "nome", "nx-onb:e1:c1": "{}", "nx-app-esquema": "escuro" });
  const limpar = fnApp("function limparDadosDoAparelho() {", { E: { cache: null, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, localStorage: local, sessionStorage: loja(),
    LS: { lerTxt: () => null, apagar() {} }, PREFIXOS_DA_CONTA: PREF, CHAVE_CONTA: "c", CHAVE_RASCUNHOS_DE: "r" });
  limpar();
  assert.deepEqual([...local.m.keys()], ["nx-app-esquema"], "a aparência fica");
});

test("UB-272 · menu de aparência explica o tema da empresa", () => {
  assert.match(APP_JS, /\["marca", "Cores da empresa \(fundo da marca\)", "pincel"\]/);
  assert.doesNotMatch(APP_JS, /\["marca", "Tema da empresa", "pincel"\]/);
});

test("UB-207 · faixas iguais são mantidas (o mesmo nó, nada reanunciado); a que muda é trocada", () => {
  const rec = fnApp("function reconciliarFaixas(alvo, novas) {", {});
  const alvo = h("div");
  const mk = (cls, t) => h("div", { class: `faixa ${cls}`, role: "status" }, h("p", null, t));
  const [a1] = rec(alvo, [mk("faixa-bloqueio", "O teste terminou.")]);
  const [a2] = rec(alvo, [mk("faixa-bloqueio", "O teste terminou.")]);
  assert.equal(a2, a1, "mesmo texto: o nó antigo fica"); assert.equal(alvo.children.length, 1);
  const r3 = rec(alvo, [mk("faixa-suporte", "Suporte"), mk("faixa-bloqueio", "O teste terminou.")]);
  assert.equal(r3[1], a1); assert.deepEqual(alvo.children, r3, "ordem nova, nó antigo reaproveitado");
  const r4 = rec(alvo, [mk("faixa-bloqueio", "Suspenso.")]);
  assert.notEqual(r4[0], a1); assert.equal(alvo.children.length, 1); assert.equal(a1.parentNode, null);
  assert.deepEqual(rec(alvo, []), []); assert.equal(alvo.children.length, 0);
  // plano 1500c: entre o faixasDoMomento e a reconciliação, umaFaixaPorVez escolhe a faixa (UCC-117)
  assert.match(APP_JS, /function desenharFaixas\(\) \{\s*const alvo = \$\("faixas"\);\s*if \(alvo\) reconciliarFaixas\(alvo, umaFaixaPorVez\(faixasDoMomento\(\)/);
});

test("UB-168 · aparelho compartilhado: 2 h sem uso avisa 1 min antes e sai; um toque adia", () => {
  let t = 0; const fila = [];
  const agendar = (fn, ms) => { const x = { fn, em: t + ms }; fila.push(x); return x; };
  const cancelar = x => { const i = fila.indexOf(x); if (i >= 0) fila.splice(i, 1); };
  const andar = ms => { const fim = t + ms; for (;;) { fila.sort((a, b) => a.em - b.em); const p = fila[0]; if (!p || p.em > fim) break; fila.shift(); t = p.em; p.fn(); } t = fim; };
  const ev_ = [];
  const criar = fnApp("function criarVigiaOciosidade({ agora = () => Date.now(), agendar = setTimeout, cancelar = clearTimeout, limite = OCIOSO_MS, aviso = AVISO_OCIOSO_MS, aoAvisar, aoSair, aoVoltar } = {}) {",
    { OCIOSO_MS: 2 * 3600e3, AVISO_OCIOSO_MS: 60e3 });
  const v = criar({ agora: () => t, agendar, cancelar, aoAvisar: () => ev_.push("aviso"), aoSair: () => ev_.push("saiu"), aoVoltar: () => ev_.push("voltou") });
  v.ligar();
  andar(2 * 3600e3 - 61e3); assert.deepEqual(ev_, []);
  andar(2e3); assert.deepEqual(ev_, ["aviso"], "1 min antes: aviso");
  v.tocar(); assert.deepEqual(ev_, ["aviso", "voltou"]);
  andar(2 * 3600e3 - 61e3); assert.deepEqual(ev_, ["aviso", "voltou"], "o toque recomeçou as 2 h");
  andar(61e3); assert.deepEqual(ev_, ["aviso", "voltou", "aviso", "saiu"]);
  assert.equal(v.estado.ligado, false);
  // toques no meio (sem aviso) só empurram o prazo
  const ev2 = []; t = 0; fila.length = 0;
  const v2 = criar({ agora: () => t, agendar, cancelar, aoAvisar: () => ev2.push("aviso"), aoSair: () => ev2.push("saiu") });
  v2.ligar(); andar(3600e3); v2.tocar(); andar(3600e3); assert.deepEqual(ev2, []);
  andar(3600e3); assert.deepEqual(ev2, ["aviso", "saiu"]);
  v2.desligar();
  assert.match(APP_JS, /ligarOciosidade\(\);\s+\/\/ plano 1000b · UB-168/);
  assert.match(APP_JS, /if \(!comp\) return;/);
});

test("UB-270 + UB-125 · sino: erro com «Tentar de novo»; «Marcar todas» com mais de 10 pede um 2º toque", async () => {
  const antesRO = globalThis.ResizeObserver; globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  limparCorpo();
  try {
    let falhar = true; const chamadas = [];
    const itens = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, tipo: "tarefa", titulo: `T${i}`, criado_em: new Date(Date.now() - i * 6e4).toISOString() }));
    const E = { ui: U, cliente: { id: "e1" }, notif: 0,
      api: { mensagemErro: A.mensagemErro, rpcC: async (n, p) => { chamadas.push(n);
        if (n === "nx_notificacoes_listar") { if (falhar) throw Object.assign(new Error("x"), { codigo: "sem_conexao" }); return { itens, nao_lidas: 12 }; }
        return { nao_lidas: 0 }; } } };
    const anc = h("button"); doc.body.appendChild(anc);
    const abrir = fnApp("function abrirSino(ancora) {", { E, NOTIF_PAGINA: 20, NOTIF_MAXIMO: 100, rotuloDoDia: () => "Hoje", linkDaNotificacao: () => null, ICONE_NOTIF: {},
      tituloDaNotificacao: it => it.titulo, atualizarSinoUI() {}, atualizarCanais() {}, resumoDoSino: () => "", navegar() {} });
    abrir(anc); await tick(6);
    const pop = doc.querySelector(".flut.notifs");
    assert.equal(pop.getAttribute("aria-label"), "Notificações");
    const tentar = [...pop.querySelectorAll("button")].find(b => /Tentar de novo/.test(b.textContent));
    assert.ok(tentar, "erro: botão para tentar de novo");
    falhar = false; tentar.click(); await tick(8);
    assert.equal(pop.querySelectorAll(".notif-item").length, 12);
    const todas = [...pop.querySelectorAll("button")].find(b => /Marcar todas como lidas/.test(b.textContent));
    assert.equal(todas.hidden, false);
    todas.click(); await tick(4);
    assert.ok(!chamadas.includes("nx_notificacoes_marcar"), "1º toque só pede confirmação");
    assert.match(todas.textContent, /Confirmar: marcar 12 como lidas/);
    todas.click(); await tick(6);
    assert.ok(chamadas.includes("nx_notificacoes_marcar"));
    assert.match(todas.textContent, /Marcar todas como lidas/);
    if (E.sinoAberto) E.sinoAberto.fechar();
  } finally { globalThis.ResizeObserver = antesRO; limparCorpo(); }
});
