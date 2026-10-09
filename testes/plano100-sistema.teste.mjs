/* ============================================================
   ÓRBITA — plano «100+ melhorias» (08/10/2026) · frente A: sistema e casca
   node --test testes/plano100-sistema.teste.mjs
   Testes de COMPORTAMENTO (DOM de mentira, sem dependências; o mesmo do plano50-sistema) das peças da frente A:
   A1 service worker (fonte/ícone sem ?v= fora do cache «para sempre») · A2 pulso (aba escondida em 15 s, líder aproveita a seguidora, aviso fora de
   Conversas) · A3 nao_lidas do pulso · A4 cliente_pausado + min_migracao · A5 reenviar lenta, antes.js (favicon e hash) · A6 máscara de moeda ·
   A7 seletor de etiquetas (debounce + seq) · A8 pílulas de canal/origem · A9 login (bloqueio e «Esqueci a senha») · A10 número caído (toast fixo,
   notificações, ctx.canais) · A11 diálogo a 360 px · A12 KPI estimado e rótulos do calor · A13 comandos conhecidos da paleta.
   O app.js não é importável (roda iniciar() ao carregar): o que é dele entra por regex no texto-fonte ou pela fábrica de montarNoShell.
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
function criarMundoSW({ versao = "V2", site = "http://site.test", escopo = "/app/", resposta } = {}) {
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
  runInNewContext(SW_TXT, { self: self_, caches: cachesFalso, fetch: fetchFalso, Request, Response, URL, URLSearchParams, Promise, AbortController, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 15)), clearTimeout, console });
  const evento = extra => { const pend = []; return { ...extra, respondWith(p) { this.resposta = p; }, waitUntil(p) { pend.push(p); }, async fim() { await Promise.all(pend); } }; };
  const req = (url, extra = {}) => ({ method: "GET", url: `${site}${url}`, mode: "cors", headers: new Headers(), ...extra });
  return { armazem, cachesFalso, chamadas, ouvintes, evento, req, site };
}

test("A1 · sw.js: fonte e ícone SEM ?v= nunca vêm do cache de uma versão anterior (rede + cache desta versão); arquivo e fonte COM ?v= continuam vindo da versão antiga", async () => {
  const m = criarMundoSW({ versao: "V2" });
  const v1 = await m.cachesFalso.open("orbita-shell-V1");
  for (const u of ["/fonts/satoshi-variable.woff2", "/app/icones/icon-192.png", "/app/ui.js?v=V1", "/fonts/clash.woff2?v=1"]) await v1.put(`${m.site}${u}`, new Response("velho:" + u, { status: 200 }));
  const pega = async url => { const ev = m.evento({ request: m.req(url) }); m.ouvintes.fetch(ev); assert.ok(ev.resposta, `interceptou ${url}`); const r = await ev.resposta; await ev.fim(); return r.text(); };
  assert.equal(await pega("/fonts/satoshi-variable.woff2"), `ok:${m.site}/fonts/satoshi-variable.woff2`, "fonte sem ?v=: vai à rede, não ao cache da V1");
  assert.equal(await pega("/app/icones/icon-192.png"), `ok:${m.site}/app/icones/icon-192.png`, "ícone sem ?v=: rede");
  assert.equal(m.chamadas.length, 2);
  assert.ok(await (await m.cachesFalso.open("orbita-shell-V2")).match(`${m.site}/fonts/satoshi-variable.woff2`), "a fonte fica guardada no cache da V2");
  assert.equal(await pega("/fonts/satoshi-variable.woff2"), `ok:${m.site}/fonts/satoshi-variable.woff2`);
  assert.equal(m.chamadas.length, 2, "a 2ª vez vem do cache da V2");
  assert.equal(await pega("/app/ui.js?v=V1"), "velho:/app/ui.js?v=V1", "módulo versionado da aba antiga continua vindo da V1");
  assert.equal(await pega("/fonts/clash.woff2?v=1"), "velho:/fonts/clash.woff2?v=1", "fonte COM ?v= é «para sempre» pela URL");
  assert.equal(m.chamadas.length, 2, "nada disso foi à rede");
  // o que não é fonte/ícone nem versionado continua passando direto
  const ev = m.evento({ request: m.req("/app/api.js") }); m.ouvintes.fetch(ev); assert.equal(ev.resposta, undefined);
});

test("A1 · fontes e ícone do iPhone versionados: todo @font-face do app.css leva ?v= próprio e o apple-touch-icon leva o ?v= do app", () => {
  const fontes = [...CSS_APP.matchAll(/@font-face[^}]*?url\("([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(fontes.length >= 5, `fontes: ${fontes.length}`);
  for (const f of fontes) assert.match(f, /^\.\.\/fonts\/[a-z0-9-]+\.woff2\?v=\d+$/, f);
  const v = /app\.js\?v=([A-Za-z0-9._-]+)"/.exec(HTML)[1];
  assert.ok(HTML.includes(`href="icones/apple-touch-icon.png?v=${v}"`), "apple-touch-icon com o mesmo ?v= (o bump-versao troca junto)");
  assert.match(SW_TXT, /function estatico\(url\)/); assert.match(SW_TXT, /cachePrimeiro\(ev, \{ anteriores: false \}\)/);
});

/* ============================================================ A2 · pulso: aba escondida e líder que aproveita a seguidora ============================================================ */
function relogio() {
  let t = 0, fila = [];
  return {
    agora() { return t; },
    agendar(fn, ms) { const id = Symbol("t"); fila.push({ id, fn, em: t + ms }); return id; },
    cancelar(id) { fila = fila.filter(x => x.id !== id); },
    async andar(ms) {
      const fim = t + ms;
      for (;;) {
        fila.sort((a, b) => a.em - b.em);
        const prox = fila[0];
        if (!prox || prox.em > fim) break;
        fila.shift(); t = prox.em; await prox.fn(); await new Promise(r => setImmediate(r));
      }
      t = fim;
    },
  };
}
/** Duas abas no mesmo navegador: BroadcastChannel e Web Locks de mentira (como no app.teste.mjs). */
function abasFalsas() {
  const grupos = new Map(), donos = new Map();
  class CanalFalso {
    constructor(nome) { this.nome = nome; this.ouvintes = new Set(); this.fechado = false; if (!grupos.has(nome)) grupos.set(nome, new Set()); grupos.get(nome).add(this); }
    addEventListener(tipo, fn) { if (tipo === "message") this.ouvintes.add(fn); }
    postMessage(data) { for (const outro of grupos.get(this.nome) || []) if (outro !== this && !outro.fechado) queueMicrotask(() => { for (const fn of outro.ouvintes) fn({ data }); }); }
    close() { this.fechado = true; grupos.get(this.nome)?.delete(this); }
  }
  const locks = { request: async (nome, _o, callback) => {
    if (donos.has(nome)) return callback(null);
    let liberar; const dono = new Promise(r => { liberar = r; }); donos.set(nome, liberar);
    try { return await callback({ name: nome }); } finally { if (donos.get(nome) === liberar) donos.delete(nome); liberar(); void dono; }
  } };
  const dBC = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel"), dLoc = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, writable: true, value: CanalFalso });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { host: "orbita.test" } });
  return { locks, CanalFalso, restaurar() {
    if (dBC) Object.defineProperty(globalThis, "BroadcastChannel", dBC); else delete globalThis.BroadcastChannel;
    if (dLoc) Object.defineProperty(globalThis, "location", dLoc); else delete globalThis.location;
  } };
}

test("A2 · pulso.js: a líder ESCONDIDA aproveita o resultado que a seguidora visível (Conversas, 3 s) publica — avisa não lidas sem ler; publicação atrasada não regride", async () => {
  const abas = abasFalsas();
  const rel = relogio();
  const docA = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} }, docB = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  let vServ = 1; const leu = { A: 0, B: 0 }, naoLidas = { A: [], B: [] }, mudancasA = [];
  const criar = (chave, doc) => P.criarPulso({ escopo: () => "emp-1", ler: async () => { leu[chave]++; return { v: vServ, notif: 0, nao_lidas: vServ }; },
    aoNaoLidas: n => naoLidas[chave].push(n), agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, aleatorio: () => .5,
    nav: { onLine: true, locks: abas.locks }, doc, janela: { addEventListener() {}, removeEventListener() {} } });
  const a = criar("A", docA), b = criar("B", docB);
  try {
    a.iniciar(); await new Promise(r => setImmediate(r)); b.iniciar(); await new Promise(r => setImmediate(r));
    assert.equal(a.estado.papel, "lider"); assert.equal(b.estado.papel, "seguidora");
    a.assinar(v => mudancasA.push(v));
    b.modo("conversas");
    await rel.andar(0);
    assert.deepEqual(leu, { A: 1, B: 0 }, "largada: a líder lê e a seguidora recebe pelo canal");
    vServ = 2;
    await rel.andar(6500);   // a líder escondida só leria aos 15 s; a seguidora precisa de 3 s e lê sozinha aos 6 s (1,5 × o intervalo dela)
    assert.equal(leu.B, 1, "a seguidora visível leu por conta própria");
    assert.equal(leu.A, 1, "a líder escondida não precisou ler");
    assert.equal(a.estado.v, 2, "a líder adotou o resultado publicado pela seguidora");
    assert.deepEqual(mudancasA, [2]); assert.deepEqual(naoLidas.A.slice(-1), [2], "não lidas chegam à líder escondida pela seguidora");
    // publicação atrasada (mais velha que o último resultado visto) é ignorada
    const canal = new abas.CanalFalso("orbita-pulso:orbita.test:emp-1");
    canal.postMessage({ tipo: "resultado", dados: { v: 1, notif: 0, nao_lidas: 1 }, em: 100 });
    await new Promise(r => setImmediate(r));
    assert.equal(a.estado.v, 2, "resultado velho não regride a líder"); assert.deepEqual(mudancasA, [2]);
    canal.close();
    await rel.andar(13000);   // t ≈ 19,5 s: a seguidora segue alimentando a cada 6 s e a líder nunca precisou gastar uma leitura própria
    assert.equal(leu.A, 1, "enquanto outra aba entrega no prazo, a líder escondida não lê");
  } finally { a.parar(); b.parar(); await new Promise(r => setImmediate(r)); abas.restaurar(); }
});

test("A2 · pulso.avisoDeNaoLidas (puro): só quando sobe, fora de Conversas; som por padrão, aviso de tela só escondida e com a preferência ligada; 1ª leitura não avisa", () => {
  const f = P.avisoDeNaoLidas;
  assert.deepEqual(f({ antes: null, depois: 3 }), { som: false, tela: false, novas: 0 }, "primeira leitura só fixa a referência");
  assert.deepEqual(f({ antes: 1, depois: 3 }), { som: true, tela: false, novas: 2 });
  assert.deepEqual(f({ antes: 1, depois: 3, emConversas: true }), { som: false, tela: false, novas: 2 }, "dentro de Conversas a tela avisa");
  assert.deepEqual(f({ antes: 1, depois: 3, escondida: true, pref: { tela: true } }), { som: true, tela: true, novas: 2 });
  assert.deepEqual(f({ antes: 1, depois: 3, escondida: false, pref: { tela: true } }), { som: true, tela: false, novas: 2 }, "aviso de tela só com a aba escondida");
  assert.deepEqual(f({ antes: 1, depois: 3, pref: { som: false } }), { som: false, tela: false, novas: 2 });
  assert.deepEqual(f({ antes: 3, depois: 1 }), { som: false, tela: false, novas: 0 }, "caiu: nada");
  assert.deepEqual(f({ antes: 2, depois: 2 }), { som: false, tela: false, novas: 0 });
});

test("A2/A3 · app.js: o shell assina nao_lidas do pulso (avisa fora de Conversas com as preferências de nx-cv-avisos), marca a detecção e para de consultar nx_cv_listar; referência zera ao trocar de empresa", () => {
  assert.match(APP_JS, /aoNaoLidas: n => \{ E\.naoLidasPulsoEm = Date\.now\(\); E\.pulsoTemNaoLidas = true; definirBadge\("conversas", n\); avisarNaoLidas\(n\); \}/);
  const avisar = fnDoApp("function avisarNaoLidas(n) {");
  assert.match(avisar, /E\.M\.pulso\.avisoDeNaoLidas\(\{ antes, depois: n, emConversas: !!\(E\.atual && E\.atual\.arquivo === "conversas\.js"\), escondida: !!document\.hidden, pref: lerAvisosConversas\(\) \}\)/);
  assert.match(avisar, /if \(a\.som && \(papel === "lider" \|\| papel === "solo"\)\) tocarSomNaoLidas\(\);\s*if \(a\.tela\) notificarNaoLidas\(a\.novas, n\);/);
  assert.match(fnDoApp("function lerAvisosConversas() {"), /LS\.ler\("nx-cv-avisos"\)/, "mesmas preferências do menu «Avisos» de Conversas");
  assert.match(fnDoApp("function tocarSomNaoLidas() {"), /if \(agora - E\.somEm < 10000\) return;/, "no máximo um som a cada 10 s");
  assert.match(fnDoApp("function notificarNaoLidas(novas, total) {"), /Notification\.permission !== "granted"\) return;[\s\S]*navegar\("#\/conversas\?aba=aguardando"\)/);
  assert.match(APP_JS, /document\.addEventListener\("pointerdown", desbloquearAudio, \{ once: true, passive: true \}\);/, "o áudio nasce no 1º gesto");
  // A3: detecção fixa — depois que o pulso trouxe nao_lidas, a lista não é consultada para o badge
  assert.match(fnDoApp("async function atualizarNaoLidas() {"), /if \(E\.pulsoTemNaoLidas\) return;/);
  assert.match(fnDoApp("async function escolherCliente("), /if \(mudou\) \{ E\.naoLidasAnterior = null; reiniciarCanais\(\); \}/);
});

/* ============================================================ A4 · cliente_pausado e min_migracao ============================================================ */
test("A4 · api.js: cliente_pausado e muitas_tentativas têm frase em português (minutos do hint); aoErro recebe o erro FINAL de cada chamada e o erro continua subindo", async () => {
  assert.equal(A.MENSAGENS.cliente_pausado, "O acesso desta empresa está pausado pela plataforma. Fale com o suporte para reativar.");
  assert.match(A.mensagemErro({ codigo: "texto_longo", resposta: { ok: false, erro: "texto_longo", teto: 980 } }), /no máximo 980 caracteres, contando a assinatura/);
  assert.match(A.mensagemErro({ codigo: "texto_longo" }), /assinatura conta/); assert.match(A.mensagemErro({ codigo: "contato_bloqueado" }), /bloqueado/);
  assert.equal(A.mensagemErro({ codigo: "muitas_tentativas", hint: "15" }), "Muitas tentativas de entrar. Tente de novo em 15 minutos.");
  assert.equal(A.mensagemErro({ codigo: "muitas_tentativas", hint: "em 1 minuto" }), "Muitas tentativas de entrar. Tente de novo em 1 minuto.");
  assert.equal(A.mensagemErro({ codigo: "muitas_tentativas" }), A.MENSAGENS.muitas_tentativas);
  assert.equal(A.minutosDoHint("2,5"), 3); assert.equal(A.minutosDoHint(null), null); assert.equal(A.minutosDoHint("abc"), null);
  assert.equal(typeof A.criarApi({ url: "http://x", chave: "pub" }).minutosDoHint, "function", "o login recebe ctx.api do shell: os minutos têm de estar nele (QA: sem isto a contagem caía nos 15 min padrão)");
  const erros = [];
  let status = 403, corpo = { message: "cliente_pausado", hint: null };
  const fetch = async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  const api = A.criarApi({ url: "http://x", chave: "pub", token: () => "t", cliente: () => "c", fetch, retentar: true, esperar: async () => {}, aoErro: (e, meta) => erros.push([e.codigo, !!meta.leitura]) });
  await assert.rejects(api.rpcC("nx_pulso"), e => e.codigo === "cliente_pausado");
  assert.deepEqual(erros, [["cliente_pausado", true]], "o shell soube do erro e o erro subiu do mesmo jeito");
  status = 503; corpo = { message: "servico_indisponivel" };
  await assert.rejects(api.rpcC("nx_pulso"));
  assert.deepEqual(erros.slice(1), [["servico_indisponivel", true]], "com repetições, aoErro vê só o resultado final (uma vez)");
  status = 200; corpo = { v: 1 };
  assert.deepEqual(await api.rpcC("nx_pulso"), { v: 1 }); assert.equal(erros.length, 2, "sucesso não chama aoErro");
});

test("A4 · pwa.chaveMigracao/migracaoPendente (puros) e versao.json com min_migracao (nunca igual à versão do front, que o bump reescreve)", () => {
  assert.equal(PWA.chaveMigracao("20261008c_canais_historico"), "20261008c"); assert.equal(PWA.chaveMigracao(" 20261004a "), "20261004a");
  assert.equal(PWA.chaveMigracao("20261008"), "20261008"); assert.equal(PWA.chaveMigracao("lixo"), null); assert.equal(PWA.chaveMigracao(null), null);
  assert.equal(PWA.migracaoPendente("20261004a_x", "20261008c"), true);
  assert.equal(PWA.migracaoPendente("20261008a", "20261008c"), true);
  assert.equal(PWA.migracaoPendente("20261008c", "20261008c"), false);
  assert.equal(PWA.migracaoPendente("20261009a", "20261008c"), false);
  assert.equal(PWA.migracaoPendente(null, "20261008c"), false, "RPC antiga sem o campo: nada é dito");
  assert.equal(PWA.migracaoPendente("20261004a", null), false, "versao.json sem min_migracao: nada é dito");
  const j = JSON.parse(ler("versao.json"));
  assert.match(j.min_migracao, /^\d{8}[a-z]?$/); assert.notEqual(j.min_migracao, j.versao);
});

test("A4 · app.js: sessão normaliza ativo/canais/migracao; faixa de migração só com os dois lados; cliente_pausado vindo da API vira bloqueio; faixa para a plataforma", () => {
  const ler2 = fnDoApp("async function lerSessao() {");
  assert.match(ler2, /c\.ativo = c\.ativo !== false;/); assert.match(ler2, /s\.migracao = typeof s\.migracao === "string" \? s\.migracao : null;/);
  const conf = fnDoApp("async function conferirMigracao() {");
  assert.match(conf, /typeof s\.migracao !== "string" \|\| !E\.pwaMod/); assert.match(conf, /E\.pwaMod\.migracaoPendente\(s\.migracao, minima\)/);
  assert.match(fnDoApp("function desenharFaixaMigracao(info) {"), /class: "faixa faixa-migracao", role: "status"/);
  assert.match(SHELL_CSS, /\.faixa-migracao \{ background: var\(--c-aten-suave\); \}/);
  const erro = fnDoApp("function aoErroApi(e) {");
  assert.match(erro, /e\.codigo !== "cliente_pausado"\) return;/); assert.match(erro, /cli\.ativo = false;\s*desenharFaixas\(\);/); assert.match(erro, /if \(!equipe && E\.ultimaRota\) \{ desmontarAtual\(\); aoMudarRota\(false\); \}/);
  assert.match(APP_JS, /aoErro: e => aoErroApi\(e\),/, "o shell liga o gancho no api.js");
  assert.match(fnDoApp("function cartaoBloqueio(tipo) {"), /pausado: \{ titulo: "Esta empresa está pausada\."[\s\S]*icone: "pausa"/);
  assert.match(fnDoApp("function desenharFaixas() {"), /else if \(cli\.ativo === false && \(equipe \|\| plataforma\)\) \{/, "a faixa aparece para quem a tela pausada deixa entrar (conta gestora/super, mesmo com papel admin no cliente)");
  assert.match(APP_JS, /pausado: "Empresa pausada" \}\[acesso\]/);
  assert.match(APP_JS, /ativo: cli\.ativo !== false,\s*\} : null,/, "ctx.cliente.ativo para as telas");
});

test("A4 · montarNoShell de verdade: empresa pausada vira o bloqueio «pausado» para quem não é da plataforma; a plataforma entra; Configurações (sem empresa) continua", async () => {
  const fonteDe = assinatura => { const i = APP_JS.indexOf(assinatura); assert.ok(i >= 0, assinatura); return APP_JS.slice(i, APP_JS.indexOf("\n}\n", i) + 2); };
  const fabrica = new Function("E", "$", "opcoesAcesso", "reiniciarSelo", "marcarMenu", "desmontarAtual", "cartaoBloqueio", "definirTitulo", "desenharRegioes", "focarTitulo",
    "arq", "construirCtx", "ehFalhaDeImport", "aoMudarRota", `"use strict";\n${fonteDe("function transicaoRota(vista) {")}\n${fonteDe("async function montarNoShell(")}\nreturn montarNoShell;`);
  limparCorpo();
  const vista = h("main", { id: "vista", class: "vista" }); doc.body.appendChild(vista);
  const bloqueios = [], titulos = [], montados = [];
  const E = {
    M: { rotas: { acessoRota: () => "ok", rotaDe: m => ({ arquivo: `${m}.js`, semCliente: m === "config" }), esqueletoDaRota: () => "lista" },
      ui: { limpar: U.limpar, h, esqueleto: () => h("div", { class: "esqueleto" }), erroCartao: () => h("div") } },
    atual: null, telaVista: null, cliente: { id: 7, ativo: false }, sessao: { conta: { papel: "atendente", super: false } }, montando: 1, pulso: null, pwa: null,
  };
  const montar = fabrica(E, id => doc.getElementById(id), () => ({}), () => {}, () => {}, () => { E.atual = null; },
    tipo => { bloqueios.push(tipo); return h("div", { class: "area-bloqueada" }); }, t => titulos.push(t), () => {}, () => {},
    async () => ({ montar: async ctx => { montados.push(ctx.r.modulo); } }), r => ({ r }), () => false, () => {});
  const ir = modulo => montar({ modulo, partes: [] }, 1, true);
  await ir("conversas");
  assert.deepEqual(bloqueios, ["pausado"]); assert.deepEqual(titulos, ["Empresa pausada"]); assert.deepEqual(montados, [], "a tela não monta: cada RPC falharia com cliente_pausado");
  await ir("config"); assert.deepEqual(montados, ["config"], "Configurações não depende da empresa");
  E.sessao = { conta: { papel: "gestor", super: false } }; E.atual = null;
  await ir("conversas"); assert.deepEqual(montados, ["config", "conversas"], "a plataforma/agência continua entrando (vê só a faixa)");
  E.cliente = { id: 7, ativo: true }; E.sessao = { conta: { papel: "atendente", super: false } }; E.atual = null;
  await ir("crm"); assert.deepEqual(montados.slice(-1), ["crm"]); assert.deepEqual(bloqueios, ["pausado"], "empresa ativa: nenhum bloqueio novo");
});

/* ============================================================ A5 · reenviar lenta · antes.js (favicon e hash) ============================================================ */
test("A5 · api.js: nx-enviar «reenviar» espera 100 s como texto/mídia/modelo; «lido» continua em 75 s", async () => {
  const vistos = [], original = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...r) => { vistos.push(ms); return original(cb, ms, ...r); };
  try {
    const api = A.criarApi({ url: "http://x", chave: "pub", token: () => "t", cliente: () => "c", fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) });
    await api.fn("nx-enviar", { acao: "reenviar" }); await api.fn("nx-enviar", { acao: "lido" });
    assert.deepEqual(vistos, [100_000, 75_000]);
  } finally { globalThis.setTimeout = original; }
});

/** Roda o antes.js num DOM de mentira com o localStorage dado. */
function rodarAntes({ itens = {}, host = "local", hash = "#/crm" } = {}) {
  const estilos = {}; let favicon = null;
  const raiz = { style: { colorScheme: "", setProperty: (k, v) => { estilos[k] = v; } }, setAttribute() {}, classList: { add() {} } };
  const storage = { getItem: k => (Object.hasOwn(itens, k) ? itens[k] : null) };
  const document = { documentElement: raiz, title: "Órbita", getElementById: id => (id === "favicon" ? { setAttribute: (k, v) => { favicon = v; } } : null), currentScript: null, createElement: () => ({}), head: { appendChild() {} } };
  runInNewContext(ANTES_TXT, { document, window: { localStorage: storage }, localStorage: storage, location: { host, search: "", hash, href: `https://${host}/app/` }, URLSearchParams, URL });
  return { estilos, favicon };
}
test("A5 · antes.js: favicon guardado só data: ou https do PRÓPRIO host; tema da empresa só com o hash batendo (e do mesmo host); marca antiga sem hash ainda vale, com hash errado não", () => {
  const vars = { "--esquema": "claro", "--c-fundo": "#F3F0E9" };
  const marca = extra => JSON.stringify({ host: "local", vars, ...extra });
  const base = { "nx-app-esquema": "claro" };
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ favicon: "https://outro.test/f.png" }) } }).favicon, null, "https de outro host não entra");
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ favicon: "https://local/marca/f.png" }) } }).favicon, "https://local/marca/f.png", "https do próprio host entra");
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ favicon: "data:image/png;base64,AAAA" }) } }).favicon, "data:image/png;base64,AAAA");
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ favicon: "javascript:alert(1)" }) } }).favicon, null);
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({}) } }).estilos["--c-fundo"], "#F3F0E9", "entrada antiga (sem hash) ainda pinta, até o app.js regravar");
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ hash: T.hashCurto(vars) }) } }).estilos["--c-fundo"], "#F3F0E9", "hash certo pinta");
  assert.equal(rodarAntes({ itens: { ...base, "nx-app-marca": marca({ hash: "errado" }) } }).estilos["--c-fundo"], undefined, "hash errado não pinta");
  const cli = "11111111-2222-4333-8444-555555555555";
  const temaVars = { "--esquema": "claro", "--c-prim": "#112233" };
  const tema = extra => JSON.stringify({ vars: temaVars, ...extra });
  const comTema = t => rodarAntes({ itens: { ...base, "nx-app-cliente": cli, [`nx-app-tema-${cli}`]: t } }).estilos["--c-prim"];
  assert.equal(comTema(tema({})), undefined, "tema sem hash não pinta");
  assert.equal(comTema(tema({ hash: T.hashCurto(temaVars) })), "#112233", "tema com o hash batendo pinta");
  assert.equal(comTema(tema({ hash: "x" })), undefined, "hash errado não pinta");
  assert.equal(comTema(tema({ hash: T.hashCurto(temaVars), host: "outro.test" })), undefined, "tema gravado em outro endereço não pinta aqui");
  assert.equal(comTema(tema({ hash: T.hashCurto(temaVars), host: "local" })), "#112233");
  // o app.js grava o hash (e o host) que o antes.js confere
  assert.match(APP_JS, /LS\.gravar\("nx-app-marca", \{ host: location\.host, org: [^}]*hash: tema\.hashCurto\(t\.vars\) \}\)/);
  assert.match(APP_JS, /LS\.gravar\(`nx-app-tema-\$\{cacheCliente\.id\}`, \{ \.\.\.cacheCliente\.dados, vars: t\.vars, hash: tema\.hashCurto\(t\.vars\), host: location\.host \}\)/);
});

/* ============================================================ A6 · máscara de moeda: tudo selecionado + Backspace ============================================================ */
test("A6 · moeda: selecionar tudo e apagar (Backspace, Delete ou recortar) esvazia o campo de verdade — na função pura e no campo ligado; lerForm devolve null", () => {
  for (const [bruto, cursor, extra] of [["", 0, { apagando: true, anterior: "1.234,56" }], ["", 0, { apagando: false, anterior: "1.234,56" }], ["", null, { apagando: true, anterior: "0,00" }], ["", 0, { apagando: true, anterior: "7" }]])
    assert.deepEqual(U.mascarar("moeda", bruto, cursor, extra), { texto: "", cursor: 0 }, JSON.stringify([bruto, cursor, extra]));
  limparCorpo();
  const form = h("form"); doc.body.appendChild(form);
  const campo = U.campo({ rotulo: "Valor", nome: "valor", tipo: "moeda", valor: 1234.56 }); form.appendChild(campo);
  const inp = campo.querySelector("input");
  assert.equal(inp.value, "1.234,56");
  for (const inputType of ["deleteContentBackward", "deleteContentForward", "deleteByCut"]) {
    inp.value = "1.234,56"; inp.selectionStart = 8; ev(inp, "input", { inputType: "insertText" });
    inp.value = ""; inp.selectionStart = 0; ev(inp, "input", { inputType });
    assert.equal(inp.value, "", `${inputType}: o campo fica vazio`); assert.equal(U.lerForm(form).valor, null, "lerForm devolve null (nenhum zero inventado)");
  }
  // apagar só o último dígito depois de ter tudo apagado e redigitado
  inp.value = "5"; inp.selectionStart = 1; ev(inp, "input", { inputType: "insertText" }); assert.equal(inp.value, "5");
  inp.value = ""; inp.selectionStart = 0; ev(inp, "input", { inputType: "deleteContentBackward" }); assert.equal(inp.value, "");
});

/* ============================================================ A7 · seletor de etiquetas com pausa e sequência ============================================================ */
test("A7 · ui.seletorEtiquetas: a tela muda na hora, aoMudar sai UMA vez 300 ms depois com seq crescente; definir() sincroniza sem emitir; emitirAgora(); debounceMs 0 = na hora", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  limparCorpo();
  const todas = [{ id: 1, nome: "VIP", cor: "#112233" }, { id: 2, nome: "Retorno", cor: "#223344" }, { id: 3, nome: "Orçamento", cor: "#334455" }];
  const emitidos = [];
  const sel = U.seletorEtiquetas({ todas, marcadas: [1, 2, 3], aoMudar: (ids, info) => emitidos.push([ids, info]) });
  doc.body.appendChild(sel);
  const tirar = nome => sel.querySelector(`.etiq-x[aria-label="Tirar a etiqueta ${nome}"]`).click();
  tirar("VIP"); tirar("Retorno");
  assert.equal(sel.querySelectorAll(".etiq").length, 1, "a tela responde na hora");
  assert.deepEqual(emitidos, [], "nada vai ao servidor antes da pausa"); assert.equal(sel.pendente(), true); assert.equal(sel.seqAtual(), 0);
  t.mock.timers.tick(299); assert.deepEqual(emitidos, []);
  t.mock.timers.tick(1);
  assert.deepEqual(emitidos, [[[3], { seq: 1 }]], "UMA chamada com o estado final e seq 1"); assert.equal(sel.seqAtual(), 1); assert.equal(sel.dataset.seq, "1"); assert.equal(sel.pendente(), false);
  tirar("Orçamento"); t.mock.timers.tick(300);
  assert.equal(emitidos.length, 2); assert.deepEqual(emitidos[1], [[], { seq: 2 }]);
  sel.definir([2]);
  assert.equal(sel.querySelectorAll(".etiq").length, 1); assert.deepEqual(sel.marcadas(), [2]);
  t.mock.timers.tick(400); assert.equal(emitidos.length, 2, "definir() (resposta do servidor) não emite de volta");
  tirar("Retorno"); sel.emitirAgora(); assert.equal(emitidos.length, 3); assert.equal(emitidos[2][1].seq, 3); assert.equal(sel.pendente(), false);
  const imediato = [];
  const s0 = U.seletorEtiquetas({ todas, marcadas: [1], aoMudar: ids => imediato.push(ids), debounceMs: 0 }); doc.body.appendChild(s0);
  s0.querySelector(".etiq-x").click(); assert.deepEqual(imediato, [[]], "debounceMs: 0 = comportamento antigo (na hora)");
});

/* ============================================================ A8 · pílulas de canal e origem ============================================================ */
test("A8 · ui.pilula: canal conhece codewords e orgânico; variante «origem» (anúncio, site, orgânico, whatsapp, manual, importação, formulário) com ícone; plataforma completa o anúncio; ícones no sprite", () => {
  const cw = U.pilula(null, "codewords", { variante: "canal" });
  assert.equal(cw.textContent, "WhatsApp · CodeWords"); assert.ok(cw.classList.contains("pilula-ok")); assert.equal(cw.querySelector("use").getAttribute("href"), "#i-whatsapp");
  const org = U.pilula(null, "organico", { variante: "canal" }); assert.equal(org.textContent, "Orgânico"); assert.equal(org.querySelector("use").getAttribute("href"), "#i-folha");
  const esperado = { anuncio: ["Anúncio", "pilula-sec", "anuncio"], site: ["Site", "pilula-info", "globo"], organico: ["Orgânico", "pilula-ok", "folha"], whatsapp: ["WhatsApp", "pilula-ok", "whatsapp"],
    manual: ["Manual", "pilula-neutra", "editar"], importacao: ["Importação", "pilula-neutra", "baixar"], formulario: ["Formulário", "pilula-prim", "modelo"] };
  for (const [chave, [rotulo, tok, ic]] of Object.entries(esperado)) {
    const p = U.pilula(null, chave, { variante: "origem" });
    assert.equal(p.textContent, rotulo, chave); assert.ok(p.classList.contains(tok) && p.classList.contains("pilula-origem"), `${chave}: ${p.className}`);
    assert.equal(p.querySelector("use").getAttribute("href"), `#i-${ic}`); assert.equal(p.getAttribute("data-variante"), "origem");
  }
  const meta = U.pilula(null, "anuncio", { variante: "origem", plataforma: "meta" });
  assert.equal(meta.textContent, "Anúncio · Meta"); assert.ok(meta.classList.contains("pilula-meta")); assert.equal(meta.querySelector("use").getAttribute("href"), "#i-meta");
  const goog = U.pilula("Google Ads", "ads", { variante: "origem", plataforma: "google" });
  assert.equal(goog.textContent, "Google Ads", "texto próprio é respeitado"); assert.ok(goog.classList.contains("pilula-google"), "alias «ads» = anúncio");
  const siteIg = U.pilula(null, "site", { variante: "origem", plataforma: "instagram" });
  assert.equal(siteIg.textContent, "Site · Instagram"); assert.ok(siteIg.classList.contains("pilula-info"), "só o anúncio herda a cor da plataforma"); assert.equal(siteIg.querySelector("use").getAttribute("href"), "#i-globo");
  assert.ok(U.pilula("?", "xpto", { variante: "origem" }).classList.contains("pilula-neutra"), "origem desconhecida: neutra, sem erro");
  assert.ok(U.pilula("Importado", "Importação", { variante: "origem" }).classList.contains("pilula-neutra"), "chave pelo texto, sem acento");
  for (const tab of [U.PILULA_CANAIS, U.PILULA_ORIGENS]) for (const [k, v] of Object.entries(tab)) assert.ok(sprite.has(v.icone), `i-${v.icone} (${k}) no sprite`);
  assert.match(CSS_APP, /\.pilula-canal \.ic, \.pilula-origem \.ic \{ width: 12px; height: 12px; \}/);
  const antiga = U.pilula("Ativo", "ok"); assert.equal(antiga.className, "pilula pilula-ok", "chamada antiga intacta");
});

/* ============================================================ A9 · login: bloqueio por tentativas e «Esqueci a senha» ============================================================ */
test("A9 · login: 3ª senha errada destaca «Esqueci a senha» e abre a ajuda; muitas_tentativas desabilita «Entrar» com contagem regressiva, segura o submit e libera no fim", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  limparCorpo();
  const alvo = h("div"); doc.body.appendChild(alvo);
  let modo = "erro"; const chamadas = [];
  const api = { publica: async nome => { chamadas.push(nome); if (modo === "erro") throw A.erroApi("credenciais_invalidas", { status: 400 }); if (modo === "bloqueio") throw A.erroApi("muitas_tentativas", { status: 429, hint: "1" }); return { token: "t" }; },
    mensagemErro: A.mensagemErro, minutosDoHint: A.minutosDoHint };
  const ctx = { alvo, rota: { modulo: "login", partes: [], query: {} }, ui: U, api, marca: { produto: "Órbita", suporte_wa: "5500000000000" }, produtoAberto: null, titulo() {}, aoEntrar: async () => {} };
  await LOGIN.montar(ctx);
  const form = alvo.querySelector("form.entrar-form"), email = form.querySelector("input[name=email]"), senha = form.querySelector("input[name=senha]");
  const esqueci = alvo.querySelector(".entrar-rodape .link"), ajuda = alvo.querySelector(".aviso"), botao = form.querySelector("button[type=submit]"), erro = alvo.querySelector(".entrar-erro");
  const tentar = async () => { email.value = "a@b.co"; senha.value = "x"; ev(form, "submit"); await tick(4); };
  await tentar(); await tentar();
  assert.equal(chamadas.length, 2); assert.equal(esqueci.classList.contains("entrar-destaque"), false); assert.equal(ajuda.hidden, true, "duas falhas: nada muda");
  await tentar();
  assert.ok(esqueci.classList.contains("entrar-destaque"), "3ª falha: «Esqueci a senha» em destaque"); assert.equal(ajuda.hidden, false); assert.equal(esqueci.getAttribute("aria-expanded"), "true");
  modo = "bloqueio"; await tentar();
  assert.equal(botao.disabled, true, "bloqueado: o botão espera");
  assert.match(erro.textContent, /^Muitas tentativas de entrar\. Tente de novo em 1 minuto\. \(1:00\)$/); assert.equal(erro.hidden, false);
  const contagem = erro.querySelector(".entrar-contagem"); assert.equal(contagem.getAttribute("aria-hidden"), "true", "o leitor de tela ouve a frase uma vez; a contagem é visual");
  t.mock.timers.tick(30000); assert.equal(contagem.textContent, "(0:30)");
  const n = chamadas.length; ev(form, "submit"); await tick(2); assert.equal(chamadas.length, n, "enquanto bloqueado o submit não vai ao servidor");
  t.mock.timers.tick(30000);
  assert.equal(botao.disabled, false, "prazo vencido: libera"); assert.equal(erro.textContent, "Pode tentar de novo.");
  assert.equal(LOGIN.formatarContagem(899), "14:59"); assert.equal(LOGIN.segundosDeBloqueio({ hint: null }, A.minutosDoHint), 900, "sem hint: 15 min");
  LOGIN.desmontar();
});

/* ============================================================ A10 · número caído: toast fixo, notificação e estado para as telas ============================================================ */
test("A10 · ui.toast: {acao} vira botão próprio (motivo «acao»), tipo «aten», {ms: 0, fixo: true} não fecha sozinho nem sai da fila de 4; fechar(motivo) repassa o motivo", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  limparCorpo();
  const motivos = []; let clicou = 0;
  const fixo = U.toast("Número caído", { tipo: "aten", ms: 0, fixo: true, acao: { rotulo: "Ver número", fn: () => clicou++ }, aoFechar: m => motivos.push(m) });
  assert.ok(fixo.el.classList.contains("toast-aten") && fixo.el.classList.contains("toast-fixo")); assert.equal(fixo.el.getAttribute("role"), "status");
  assert.equal(fixo.el.querySelector("use").getAttribute("href"), "#i-alerta");
  const bt = fixo.el.querySelector(".toast-acao"); assert.equal(bt.textContent, "Ver número");
  t.mock.timers.tick(60000); assert.ok(fixo.el.isConnected && !fixo.el.classList.contains("saindo"), "sem relógio: continua");
  for (let i = 0; i < 5; i++) U.toast(`aviso ${i}`);
  assert.ok(fixo.el.isConnected && !fixo.el.classList.contains("saindo"), "a fila de 4 não derruba o fixo"); assert.deepEqual(motivos, []);
  bt.click(); assert.equal(clicou, 1); assert.deepEqual(motivos, ["acao"]);
  const outro = U.toast("x", { aoFechar: m => motivos.push(m) }); outro.fechar("sistema"); assert.equal(motivos.at(-1), "sistema");
  const padrao = U.toast("y", { aoFechar: m => motivos.push(m) }); padrao.fechar(); assert.equal(motivos.at(-1), "fechado");
  assert.match(CSS_APP, /\.toast-aten \{ border-color: var\(--c-aten\); \}/); assert.match(CSS_APP, /\.toast-fixo \{/);
});

test("A10 · pulso.canaisCaidosDe (puro): `canais` do servidor vencem; sem eles, canal_caiu/canal_voltou por canal (o evento mais recente decide)", () => {
  const f = P.canaisCaidosDe;
  assert.deepEqual(f({ canais: [{ id: "a", nome: "Recepção", estado: "conectado" }, { id: "b", nome: "Vendas", estado: "desconectado", desde: "2026-10-08T10:00:00Z" }] }),
    [{ id: "b", nome: "Vendas", desde: "2026-10-08T10:00:00Z", fonte: "canais" }]);
  assert.deepEqual(f({ canais: [] }), []); assert.deepEqual(f({}), []); assert.deepEqual(f({ notificacoes: [{ tipo: "tarefa" }] }), []);
  const n = (tipo, canal, em, nome) => ({ tipo, criado_em: em, titulo: `Número ${nome}`, dados: { canal_id: canal, canal_nome: nome } });
  const caiuDepois = f({ notificacoes: [n("canal_voltou", "a", "2026-10-08T09:00:00Z", "Recepção"), n("canal_caiu", "a", "2026-10-08T10:00:00Z", "Recepção")] });
  assert.deepEqual(caiuDepois, [{ id: "a", nome: "Recepção", desde: "2026-10-08T10:00:00.000Z", fonte: "notificacao" }]);
  assert.deepEqual(f({ notificacoes: [n("canal_caiu", "a", "2026-10-08T09:00:00Z", "Recepção"), n("canal_voltou", "a", "2026-10-08T10:00:00Z", "Recepção")] }), [], "voltou depois: nada caído (independe da ordem da lista)");
  assert.deepEqual(f({ notificacoes: [n("canal_caiu", "b", "2026-10-08T09:00:00Z", "Vendas"), n("canal_voltou", "a", "2026-10-08T10:00:00Z", "Recepção")] }).map(x => x.id), ["b"], "por canal");
  assert.deepEqual(f({ notificacoes: [{ tipo: "canal_caiu", criado_em: "2026-10-08T09:00:00Z", titulo: "Número Recepção" }] }), [{ id: null, nome: "Número Recepção", desde: "2026-10-08T09:00:00.000Z", fonte: "notificacao" }], "sem dados: o título vira a chave e o nome");
  assert.deepEqual(f({ canais: [{ id: "x", estado: "desconectado" }], notificacoes: [n("canal_voltou", "x", "2026-10-08T10:00:00Z", "X")] }).map(x => x.id), ["x"], "canais do servidor mandam");
});

test("A10 · pulso.js: aoCanais só quando o servidor manda `canais` e a lista muda; app.js liga o toast fixo «Ver número», os tipos de notificação, o destino padrão e ctx.canais", async () => {
  const rel = relogio();
  let canais = [{ id: "a", estado: "conectado" }]; const vistos = [];
  const p = P.criarPulso({ ler: async () => ({ v: 1, canais }), aoCanais: l => vistos.push(l), agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, aleatorio: () => .5,
    doc: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }, nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} } });
  p.iniciar(); await rel.andar(0); await rel.andar(10000);
  assert.deepEqual(vistos, [[{ id: "a", estado: "conectado" }]], "lista igual não repete o aviso");
  canais = [{ id: "a", estado: "desconectado" }]; await rel.andar(10000);
  assert.equal(vistos.length, 2); assert.equal(vistos[1][0].estado, "desconectado");
  const semCanais = P.criarPulso({ ler: async () => ({ v: 1 }), aoCanais: l => vistos.push(l), agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, aleatorio: () => .5,
    doc: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }, nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} } });
  semCanais.iniciar(); await rel.andar(0); assert.equal(vistos.length, 2, "RPC antiga (sem canais): nada é chamado"); semCanais.parar(); p.parar();
  // app.js
  assert.match(APP_JS, /aoCanais: lista => atualizarCanais\(\{ canais: lista \}, "pulso"\)/);
  assert.match(APP_JS, /canal_caiu: "alerta", canal_voltou: "check" \}/); assert.match(APP_JS, /const LINK_NOTIF = \{ canal_caiu: "#\/config\/numeros", canal_voltou: "#\/config\/numeros" \}/);
  assert.match(APP_JS, /const link = typeof it\.link === "string" && \/\^#\\\/\/\.test\(it\.link\) \? it\.link : \(LINK_NOTIF\[it\.tipo\] \|\| null\);/);
  const render = fnDoApp("function renderNumeroCaido(assinatura) {");
  assert.match(render, /ui\.toast\(texto, \{ tipo: "aten", ms: 0, fixo: true, acao: admin \? \{ rotulo: "Ver número", fn: \(\) => navegar\("#\/config\/numeros"\) \} : null,/);
  assert.match(render, /if \(c\.avisouQueda\) ui\.toast\("Número de WhatsApp reconectado\.", \{ tipo: "ok" \}\);/, "quando volta, avisa uma vez");
  assert.match(render, /if \(motivo === "fechado"\) c\.dispensado = assinatura;/, "fechar no X dispensa até o conjunto de números mudar");
  const atualizar = fnDoApp("function atualizarCanais(");
  assert.match(atualizar, /if \(c\.fonte && PESO_FONTE_CANAIS\[c\.fonte\] > PESO_FONTE_CANAIS\[fonte\]\) return;/, "notificação nunca sobrescreve pulso/sessão");
  assert.match(APP_JS, /canais: \{\s*caidos: \(\) => E\.canais\.lista\.slice\(\),/); assert.match(APP_JS, /verNumero: \(\) => navegar\("#\/config\/numeros"\),/);
  assert.match(fnDoApp("function atualizarSino(n) {"), /if \(E\.notif > antes\) conferirNotificacoesDeCanal\(\);/);
  assert.match(fnDoApp("async function conferirNotificacoesDeCanal() {"), /if \(agora - c\.conferiuEm < 30000\) return;/);
});

/* ============================================================ A11 · diálogo em 360 px ============================================================ */
test("A11 · app.css: a 360 px o corpo, o cabeçalho e o rodapé do diálogo perdem respiro lateral (320 px úteis para 7 colunas de 44 px); sintaxe de intervalo", () => {
  assert.match(CSS_APP, /@media \(width <= 360px\) \{\s*\.modal\.modal-m, \.modal\.modal-p, \.modal\.modal-g \{ width: calc\(100vw - var\(--esp-2\)\); max-width: calc\(100vw - var\(--esp-2\)\); \}[^\n]*\n\s*\.modal-corpo, \.modal-cab, \.modal-rod \{ padding-inline: var\(--esp-3\); \}\s*\}/, "largura E max-width (o <dialog> do navegador limita a 100% − 6px − 2em = 324 px a 360)");
  // conta de 360 px: 352 de janela − 2 de borda − 24 de respiro = 326 px de miolo → 7 colunas com 2 px de vão = 44,9 px (QA real: 40,8 px antes)
  assert.ok((360 - 8 - 2 - 24 - 6 * 2) / 7 >= 44);
  assert.match(CSS_APP, /\.kpi-estimado \.kpi-rot \{ flex-wrap: wrap; row-gap: var\(--esp-1\); \}/, "o selo quebra de linha em cartão estreito (390 px quebrava o rótulo letra a letra)");
});

/* ============================================================ A12 · KPI estimado e rótulos do mapa de calor ============================================================ */
test("A12 · ui.kpi({estimativa: true}): selo «estimado» no rótulo, classe/data no cartão, ajuda completa (mesmo sem texto próprio) e «≈» por CSS; sem a opção nada muda", () => {
  limparCorpo();
  const k = U.kpi({ rotulo: "Receita", valor: 12000, formato: "moeda", estimativa: true, ajuda: "Ticket × ganhos." });
  assert.ok(k.classList.contains("kpi-estimado")); assert.equal(k.getAttribute("data-estimativa"), "1");
  const selo = k.querySelector(".kpi-est"); assert.equal(selo.textContent, "estimado"); assert.ok(selo.classList.contains("selo-caps"), "caixa-alta só pelo .selo-caps");
  assert.equal(k.querySelector(".kpi-ajuda").getAttribute("data-dica"), "Ticket × ganhos. Valor estimado, não medido.");
  const so = U.kpi({ rotulo: "Receita", valor: 1, estimativa: true });
  assert.equal(so.querySelector(".kpi-ajuda").getAttribute("data-dica"), "Valor estimado, não medido.", "a ajuda nasce para explicar a estimativa");
  const bt = U.kpi({ rotulo: "Receita", valor: 1, estimativa: true, aoClicar() {} });
  assert.equal(bt.querySelector(`#${bt.getAttribute("aria-describedby")}`).textContent, "Valor estimado, não medido.");
  const normal = U.kpi({ rotulo: "Leads", valor: 3 });
  assert.equal(normal.querySelector(".kpi-est"), null); assert.equal(normal.getAttribute("data-estimativa"), null); assert.equal(normal.querySelector(".kpi-ajuda"), null);
  assert.match(CSS_APP, /\.kpi-estimado \.kpi-valor::before \{ content: "≈";/); assert.match(CSS_APP, /\.kpi-est \{[^}]*border: 1px dashed currentColor;/);
});

test("A12 · G.calor: rótulos de hora de 1 em 1 h no desktop e de 3 em 3 no celular (passoHorasCalor pela largura; `passoHoras` força)", () => {
  assert.equal(G.passoHorasCalor(600), 1); assert.equal(G.passoHorasCalor(520), 3); assert.equal(G.passoHorasCalor(0, true), 3); assert.equal(G.passoHorasCalor(0, false), 1);
  limparCorpo();
  const matriz = Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, hr) => hr));
  const rotulos = alvo => alvo.querySelectorAll(".g-cal-h").map(e => e.textContent).filter(Boolean);
  const a = h("div"); doc.body.appendChild(a);
  G.calor(a, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => String(v), resumo: "x", passoHoras: 3 });
  assert.deepEqual(rotulos(a), ["00", "03", "06", "09", "12", "15", "18", "21"]); assert.equal(a.querySelector(".g-calor").getAttribute("data-passo-horas"), "3");
  const b = h("div"); doc.body.appendChild(b);
  G.calor(b, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => String(v), resumo: "x", passoHoras: 1 });
  assert.equal(rotulos(b).length, 24); assert.equal(rotulos(b)[23], "23");
  const c = h("div"); c.clientWidth = 900; doc.body.appendChild(c);
  G.calor(c, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => String(v), resumo: "x" });
  assert.equal(rotulos(c).length, 24, "alvo largo: 1 em 1");
  const d = h("div"); d.clientWidth = 360; doc.body.appendChild(d);
  G.calor(d, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => String(v), resumo: "x" });
  assert.equal(rotulos(d).length, 8, "alvo estreito: 3 em 3");
  assert.equal(d.querySelectorAll(".g-cal-c").length - d.querySelectorAll(".g-cal-escala .g-cal-c").length, 7 * 24, "as células não mudam");
});

/* ============================================================ A13 · comandos conhecidos da paleta ============================================================ */
test("A13 · comandos.COMANDOS_CONHECIDOS: a tela registra só {id, fazer} e a paleta completa rótulo, grupo, ícone e palavras; a tela pode trocar o rótulo; id desconhecido sem rótulo é ignorado", () => {
  const reg = C.criarComandos();
  reg.registrar({ id: "config.reconferir-numero", fazer() {} });
  reg.registrar({ id: "rastreio.painel", fazer() {} });
  reg.registrar({ id: "agenda.presenca", rotulo: "Marcar presença", palavras: "chegou", fazer() {} });
  const por = Object.fromEntries(reg.listar().map(c => [c.id, c]));
  assert.equal(por["config.reconferir-numero"].rotulo, "Reconferir o número"); assert.equal(por["config.reconferir-numero"].grupo, "Nesta tela"); assert.equal(por["config.reconferir-numero"].icone, "whatsapp");
  assert.match(por["config.reconferir-numero"].palavras, /codewords/);
  assert.equal(por["rastreio.painel"].rotulo, "Rastreio do site"); assert.equal(por["rastreio.painel"].grupo, "Ir e ver"); assert.equal(por["rastreio.painel"].icone, "globo");
  assert.equal(por["agenda.presenca"].rotulo, "Marcar presença", "a tela manda no rótulo"); assert.equal(por["agenda.presenca"].grupo, "Nesta tela"); assert.match(por["agenda.presenca"].palavras, /compareceu.*chegou/);
  assert.equal(typeof reg.registrar({ id: "outra.coisa", fazer() {} }), "function"); assert.equal(reg.obter("outra.coisa"), null, "sem rótulo e fora do contrato: não entra");
  const velho = reg.registrar({ id: "conversas.nova", rotulo: "Nova conversa", fazer() {} }); assert.equal(reg.obter("conversas.nova").grupo, "Nesta tela"); velho();
  for (const [id, c] of Object.entries(C.COMANDOS_CONHECIDOS)) { assert.ok(sprite.has(c.icone), `${id}: i-${c.icone} no sprite`); assert.ok(C.GRUPOS_ACAO.includes(c.grupo), `${id}: grupo válido`); }
  const grupos = C.agruparAcoes(reg.listar()).map(g => g.grupo);
  assert.deepEqual(grupos, ["Nesta tela", "Ir e ver"], "a paleta mostra cada um no grupo certo");
});

/* ============================================================ integração · graficos.animarValor (pedido da frente B) */
test("animarValor: elemento montado FORA da página termina no valor final (nunca fica «0») e inteiro conta em inteiros", async () => {
  const antes = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: n => (n === "--t-dados" ? "40ms" : "") });
  try {
    const solto = doc.createElement("span");                    // ainda não entrou no DOM (o ui.kpi monta antes de pôr na tela)
    const vistos = [];
    G.animarValor(solto, 1530, n => { vistos.push(n); solto.textContent = String(n); });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(solto.textContent, "1530", "termina no valor final mesmo fora da página");
    const dentro = doc.createElement("span"); doc.body.appendChild(dentro);
    const passos = [];
    G.animarValor(dentro, 15305, n => passos.push(n));
    await new Promise(r => setTimeout(r, 120));
    assert.ok(passos.length > 2 && passos.every(Number.isInteger), "valores intermediários inteiros: " + passos.join(","));
    assert.equal(passos.at(-1), 15305);
    dentro.remove();
  } finally { globalThis.getComputedStyle = antes; }
});

test("revisão · sistema: empresa pausada é erro de CONTA (sem 12 tentativas, com «Sair»); revalidação com cliente_pausado bloqueia; sair limpa o aviso de número; som só na aba líder", async () => {
  const R = await import("../web/app/rede.js");
  assert.equal(R.erroDeConta({ codigo: "cliente_pausado" }), true, "antes: tentava de novo por ~2,5 min e não oferecia «Sair»");
  assert.equal(R.erroDeConta({ codigo: "falha_rede" }), false);
  const app = readFileSync(new URL("../web/app/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(e && e\.codigo === "cliente_pausado"\) \{\s*LS\.apagar\(CHAVE_CONTA\);\s*if \(E\.cliente\) aoErroApi\(e\);/, "a revalidação não engole mais o cliente_pausado");
  assert.match(app, /cli\.vertical \|\| null, cli\.ativo !== false\] : null\]\);/, "fotoDoAcesso inclui o ativo (a tela aberta troca para o bloqueio)");
  assert.equal((app.match(/if \(E\.pulso\) E\.pulso\.parar\(\);\s*reiniciarCanais\(\);/g) || []).length, 2, "sair e sessão caída limpam o aviso fixo de número caído");
  assert.match(app, /if \(a\.som && \(papel === "lider" \|\| papel === "solo"\)\) tocarSomNaoLidas\(\);/, "um som por mensagem, mesmo com várias abas");
});
