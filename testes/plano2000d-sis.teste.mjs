/* ============================================================
   ÓRBITA — plano «2000d» (25/10/2026) · frente sis (sistema: shell, login, PWA, design system, onboarding)
   node --test testes/plano2000d-sis.teste.mjs
   Testes de COMPORTAMENTO dos itens DU-* da frente sis (o mesmo DOM de mentira do plano1500c-sis). O app.js não é importável: o que é dele
   roda função a função (fnApp) ou entra por regex no texto-fonte. Nada depende da hora em que a suíte roda.
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


/* ============================================================ lote sis-d1 ============================================================ */
/* ---------- white-label: api.js, rotas.js (DU-155, DU-156, DU-157, DU-153, DU-154, DU-276, DU-205) ---------- */
const PROIBIDAS = /Nexus|Anthropic|CodeWords|Órbita/;
test("DU-155 + DU-156 · nenhuma frase de erro cita Nexus, Anthropic ou CodeWords; o motivo do servidor sai sem o nome do fornecedor", () => {
  for (const [c, t] of Object.entries(A.MENSAGENS)) assert.doesNotMatch(t, /Nexus|Anthropic|CodeWords/, c);
  assert.match(A.mensagemErro({ codigo: "sem_chave" }), /quem fornece o sistema/);
  assert.match(A.mensagemErro({ codigo: "ia_desligada" }), /quem fornece o sistema/);
  assert.equal(A.mensagemErro({ codigo: "codewords_falhou", detalhe_texto: "O CodeWords recusou a chave." }), "A conexão do aparelho recusou a chave.");
  assert.equal(A.semFornecedor("pareado no CodeWords; avise a equipe da Nexus (Anthropic)"), "pareado no aparelho; avise quem fornece o sistema (IA)");
  assert.equal(A.mensagemErro({ codigo: "codewords_sem_aparelho" }).includes("CodeWords"), false, "o código continua o mesmo; só a frase muda");
});

test("DU-157 · erros com {negocios}/{compromisso} usam a palavra da vertical (oficina: visita, orçamentos; clínica: consulta, oportunidades)", () => {
  assert.match(A.mensagemErro({ codigo: "consulta_nao_encontrada" }, VOCAB.vocab("oficina")), /essa visita/);
  assert.match(A.mensagemErro({ codigo: "consulta_nao_encontrada" }, VOCAB.vocab("odonto")), /essa consulta/);
  assert.match(A.mensagemErro({ codigo: "estagio_com_negocios" }, VOCAB.vocab("oficina")), /tem orçamentos/);
  assert.match(A.mensagemErro({ codigo: "estagio_com_negocios", hint: "3" }, VOCAB.vocab("odonto")), /tem 3 oportunidades/);
  assert.match(A.mensagemErro({ codigo: "estagio_com_negocios" }), /tem negócios/, "sem vocab: a palavra de sempre");
  for (const t of [A.mensagemErro({ codigo: "consulta_nao_encontrada" }), A.mensagemErro({ codigo: "estagio_com_negocios", hint: "1" })]) assert.doesNotMatch(t, /[{}]/);
  // o shell registra o vocabulário da empresa ativa
  A.definirVocabDasMensagens(() => VOCAB.vocab("loja"));
  try { assert.match(A.mensagemErro({ codigo: "consulta_nao_encontrada" }), /essa entrega/); } finally { A.definirVocabDasMensagens(null); }
  assert.match(APP_JS, /definirVocabDasMensagens\(\(\) => E\.M\.vocab\.vocab\(/);
});

test("DU-276 + DU-153 + DU-445 · nome do app sem marca é neutro; revenda não leva o slogan da plataforma; nome curto da revenda vence", () => {
  assert.equal(ROTAS.nomeDoApp({}).name, "Painel");
  assert.doesNotMatch(JSON.stringify(ROTAS.nomeDoApp({})), /Órbita|órbita/);
  const rev = ROTAS.nomeDoApp({ produto: "Sorriso" });
  assert.doesNotMatch(rev.description, /órbita/i);
  assert.equal(rev.description, "Sorriso — atendimento e vendas");
  assert.equal(ROTAS.nomeDoApp({ produto: "Sorriso", texto: "Agenda e WhatsApp da clínica" }).description, "Agenda e WhatsApp da clínica");
  assert.equal(ROTAS.nomeDoApp({ produto: "Órbita" }).description, "Anúncio, conversa e venda na mesma órbita.", "a marca padrão continua com o slogan");
  assert.equal(ROTAS.nomeDoApp({ produto: "Clínica Sorriso Vivo", workspace: "crm", curto: "Sorriso" }).short_name, "Sorriso");
  assert.ok(ROTAS.nomeDoApp({ produto: "Clínica Sorriso Vivo", workspace: "crm", curto: "Um nome bem comprido" }).short_name.length <= 12);
  assert.match(APP_JS, /nomeDoApp\(\{ produto: E\.produto, workspace: E\.workspace, texto: E\.marca && E\.marca\.login_texto, curto: E\.marca && E\.marca\.nome_curto \}\)/);
  assert.doesNotMatch(APP_JS, /"Órbita · Nexus"/, "o título do boot vem do nome do app");
});

test("DU-154 + DU-436 · seletor de produtos: «Anúncios» numa revenda (nada de «Nexus Ads»), nomes calculados no title do botão", () => {
  assert.deepEqual(ROTAS.nomesProdutos({ padrao: false }), { crm: "CRM", ads: "Anúncios", atendimento: "Atendimento" });
  assert.equal(ROTAS.nomesProdutos({ padrao: true }).ads, "Nexus Ads");
  assert.equal(ROTAS.textoTrocarProdutos({ padrao: false }), "Trocar entre CRM, Anúncios e Atendimento");
  const topo = fnDoApp("function desenharFerramentasTopo(dir) {");
  assert.doesNotMatch(topo, /Nexus Ads/);
  assert.match(topo, /textoTrocarProdutos\(\{ padrao: padraoMarca \}\)/);
  assert.match(fnDoApp("function abrirSeletorProduto(ancora) {"), /nomesProdutos\(\{ padrao: \(E\.produto \|\| ""\) === "Órbita" \}\)/);
});

test("DU-205 · white-label: as telas públicas e os textos do shell com marca de revenda não citam a plataforma", async () => {
  const marca = { produto: "Sorriso Digital", suporte_wa: "5512999998888", teste_aberto: true, dias_teste: 10 };
  for (const [mod, partes] of [["login", []], ["testar", []]]) {
    const alvo = await montarLogin(mod, partes, { marca, api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
    assert.doesNotMatch(alvo.textContent, PROIBIDAS, mod);
    LOGIN.desmontar();
  }
  for (const id of ["crm", "ads", "atendimento"]) assert.doesNotMatch(ROTAS.nomeDoApp({ produto: "Sorriso Digital", workspace: id }).name, PROIBIDAS);
  assert.doesNotMatch(Object.values(ROTAS.nomesProdutos({ padrao: false })).join(" "), PROIBIDAS);
  assert.doesNotMatch(C.textoSuporte({ app: "Sorriso Digital", tela: "Conversas", versao: "x" }), PROIBIDAS);
});

/* ---------- papéis e produtos (DU-110, DU-197, DU-218) ---------- */
const OP = (extra = {}) => ({ pronto: () => true, temModulo: () => true, pode: () => false, gestorConta: false, temCliente: true, ...extra });
test("DU-110 · papel «marketing»: Anúncios, Relatórios e o CRM (só leitura) — Automações e o resto não", () => {
  const op = OP({ papel: "marketing" });
  assert.equal(ROTAS.acessoRota("anuncios", op), "ok");
  assert.equal(ROTAS.acessoRota("relatorios", op), "ok");
  assert.equal(ROTAS.acessoRota("crm", op), "ok");
  assert.equal(ROTAS.acessoRota("automacoes", op), "sem_acesso");
  assert.equal(ROTAS.acessoRota("conversas", op), "sem_acesso");
  assert.notEqual(ROTAS.acessoRota("config/usuarios", op), "ok");
  assert.equal(ROTAS.acessoRota("anuncios", OP({ papel: "atendente", pode: m => ROTAS.podePapel("atendente", m) })), "sem_acesso", "os outros papéis seguem o degrau");
  assert.equal(ROTAS.acessoRota("anuncios", OP({ papel: "marketing", temModulo: m => m !== "ads" })), "fora_do_plano", "o plano continua valendo");
  assert.equal(ROTAS.soLeitura("marketing", "crm"), true); assert.equal(ROTAS.soLeitura("admin", "crm"), false);
  assert.deepEqual(ROTAS.itensDoMenu({ op }).map(i => i.id).filter(id => id !== "config"), ["inicio", "crm", "anuncios", "relatorios"]);
  assert.match(fnDoApp("function opcoesAcesso() {"), /papel,/);
});

test("DU-197 · Atendimento sem o CRM: o menu não mostra a Agenda e o resumo não promete agenda", () => {
  const op = OP({ temModulo: m => m === "conversas", pode: () => true });
  assert.ok(!ROTAS.itensDoMenu({ op, workspace: "atendimento" }).some(i => i.id === "agenda"));
  assert.equal(ROTAS.resumoDoProduto("atendimento", ["conversas"]), "Conversas, equipe e automações.");
  assert.equal(ROTAS.resumoDoProduto("atendimento", ["conversas", "crm"]), ROTAS.PRODUTOS.atendimento.resumo);
  assert.equal(ROTAS.resumoDoProduto("crm", []), ROTAS.PRODUTOS.crm.resumo);
});

test("DU-218 · o papel do convite vem do rotas.js (o config.js não é baixado na tela pública)", async () => {
  assert.equal(ROTAS.rotuloPapel("leitura", { minusculo: true }), "somente leitura");
  assert.equal(ROTAS.rotuloPapel("marketing"), "Marketing");
  let usouRotas = 0;
  const rotas = { ...ROTAS, rotuloPapel: (p, o) => { usouRotas++; return ROTAS.rotuloPapel(p, o); } };
  const alvo = await montarLogin("convite", ["c".repeat(64)], { rotas, api: { publica: async () => ({ ...CONVITE_OK, papel: "supervisor" }), mensagemErro: A.mensagemErro } });
  assert.match(alvo.querySelector(".entrar-convite").textContent, /supervisor/);
  assert.equal(usouRotas, 1);
  assert.match(LOGIN_TXT, /if \(ctx\.rotas && typeof ctx\.rotas\.rotuloPapel === "function"\) return ctx\.rotas\.rotuloPapel\(papel, \{ minusculo: true \}\);/);
  assert.match(APP_JS, /rotas: E\.M\.rotas,   \/\/ plano 2000d · DU-218/);
  LOGIN.desmontar();
});

/* ---------- senha, entrada e teste grátis (login.js) ---------- */
test("DU-219 · senha com o nome da empresa ou do produto é fraca (palavras genéricas como «clínica» não contam)", () => {
  assert.equal(LOGIN.senhaFraca("sorriso2026", { empresa: "Clínica Sorriso" }), true);
  assert.equal(LOGIN.senhaFraca("Conecta#2026", { produto: "Conecta" }), true);
  assert.equal(LOGIN.senhaFraca("clinica-azul-77", { empresa: "Clínica Sorriso" }), false);
  assert.equal(LOGIN.senhaFraca("Cavalo-azul-77", { empresa: "Clínica Sorriso", produto: "Conecta" }), false);
});

test("DU-223 + DU-215 · caminho de quem não usa: sem o nome do produto, nada; o prazo é o da revenda (dias_teste)", () => {
  const wa = (t, n) => `https://wa.me/${n}?text=${encodeURIComponent(t)}`;
  assert.equal(LOGIN.caminhoProspect({ suporte_wa: "55" }, wa), null);
  const p = LOGIN.caminhoProspect({ produto: "Órbita", suporte_wa: "55", dias_teste: 7 }, wa);
  assert.match(p.rotulo, /teste grátis de 7 dias/); assert.match(decodeURIComponent(p.href), /por 7 dias/);
  assert.equal(LOGIN.diasDeTeste({}), 14); assert.equal(LOGIN.diasDeTeste({ dias_teste: 0 }), 14); assert.equal(LOGIN.diasDeTeste({ dias_teste: "30" }), 30);
});

const respTeste = (publica, marca = {}, extra = {}) => montarLogin("testar", [], { marca: { teste_aberto: true, produto: "Conecta", ...marca }, api: { publica, mensagemErro: A.mensagemErro }, ...extra });
const preencherTeste = (alvo, extra = {}) => {
  const v = { empresa: "Oficina Boa", nome: "Ana Lima", email: "ana@oficina.com.br", senha: "Cavalo-azul-77", ...extra };
  for (const [k, x] of Object.entries(v)) { const i = alvo.querySelector(`[name=${k}]`); if (i) i.value = x; }
  return v;
};
test("DU-215 + DU-358 · teste grátis com o prazo da revenda e a regra da senha antes do erro", async () => {
  const alvo = await respTeste(async () => ({}), { dias_teste: 7 });
  assert.match(alvo.querySelector("button[type=submit]").textContent, /Começar o teste de 7 dias/);
  assert.match(alvo.querySelector("#t-testar").textContent, /Teste grátis por 7 dias/);
  assert.match(alvo.querySelector('[data-campo="senha"] .campo-ajuda').textContent, /Pelo menos 8 caracteres\. Evite o nome da empresa/);
  assert.doesNotMatch(alvo.textContent, /14 dias/);
  LOGIN.desmontar();
});

test("DU-214 · teste grátis sem o aceite dos termos não envia; o erro fica na caixa; com os links da marca", async () => {
  const chamadas = [];
  const alvo = await respTeste(async (n, p) => { chamadas.push([n, p]); return {}; }, { termos_url: "https://x.test/termos", privacidade_url: "https://x.test/priv" });
  preencherTeste(alvo);
  ev(alvo.querySelector("form"), "submit"); await tick(4);
  assert.equal(chamadas.length, 0);
  const er = alvo.querySelector(".campo-aceite .campo-erro");
  assert.equal(er.hidden, false); assert.match(er.textContent, /aceite os Termos/);
  assert.equal(alvo.querySelector("#t-aceite").getAttribute("aria-invalid"), "true");
  assert.deepEqual([...alvo.querySelectorAll(".campo-aceite a")].map(a => a.getAttribute("href")), ["https://x.test/termos", "https://x.test/priv"]);
  LOGIN.desmontar();
});

test("DU-213 + DU-217 · WhatsApp opcional validado; tipo «estética» vai ao modelo de clínica; servidor sem os parâmetros novos recebe o pedido de sempre", async () => {
  assert.equal(LOGIN.verticalDoTipo("estetica"), "odonto"); assert.equal(LOGIN.verticalDoTipo("imobiliaria"), "generico"); assert.equal(LOGIN.verticalDoTipo("oficina"), "oficina");
  assert.ok(LOGIN.TIPOS_EMPRESA_TESTE.length >= 7);
  const chamadas = [], entradas = [];
  const alvo = await respTeste(async (n, p) => {
    chamadas.push(p);
    if ("p_telefone" in p) throw Object.assign(new Error("Could not find the function"), { codigo: "Could not find the function", resposta: { code: "PGRST202" } });
    return { token: "t" };
  }, {}, { aoEntrar: async tk => { entradas.push(tk); } });
  preencherTeste(alvo, { whatsapp: "123" });
  alvo.querySelector("#t-aceite").checked = true;
  ev(alvo.querySelector("form"), "submit"); await tick(4);
  assert.equal(chamadas.length, 0, "WhatsApp inválido não envia");
  assert.match(alvo.querySelector('[data-campo="whatsapp"] .campo-erro').textContent, /DDD/);
  preencherTeste(alvo, { whatsapp: "12998303030" });
  const sel = alvo.querySelector("select[name=vertical]"); sel.value = "estetica"; ev(sel, "change");
  assert.match(alvo.querySelector(".nota-tipo").textContent, /modelo de clínica/);
  ev(alvo.querySelector("form"), "submit"); await tick(8);
  assert.equal(chamadas.length, 2, "com extras e, recusado por assinatura, sem eles");
  assert.equal(chamadas[0].p_telefone, "12998303030"); assert.ok(chamadas[0].p_aceite_em); assert.equal(chamadas[0].p_tipo, "estetica");
  assert.equal(chamadas[1].p_vertical, "odonto"); assert.ok(!("p_telefone" in chamadas[1]));
  assert.deepEqual(entradas, ["t"]);
  LOGIN.desmontar();
});

test("DU-216 · «Confira o seu e-mail» com «Mandar de novo» depois de 60 s e «Errei o e-mail» que volta ao formulário preenchido", async t => {
  const chamadas = [];
  const alvo = await respTeste(async n => { chamadas.push(n); return {}; });
  preencherTeste(alvo);
  alvo.querySelector("#t-aceite").checked = true;
  t.mock.timers.enable({ apis: ["setInterval"] });
  try {
    ev(alvo.querySelector("form"), "submit"); await tick(6);
    assert.match(alvo.textContent, /Confira o seu e-mail/);
    const de = alvo.querySelector(".entrar-reenviar");
    assert.equal(de.disabled, true); assert.match(de.textContent, /em 60 s/);
    t.mock.timers.tick(60000);
    assert.equal(de.disabled, false); assert.equal(de.textContent, "Mandar de novo");
    de.click(); await tick(4);
    assert.ok(chamadas.includes("nx_teste_reenviar"));
    const errei = [...alvo.querySelectorAll("button")].find(b => b.textContent === "Errei o e-mail");
    errei.click();
    assert.equal(alvo.querySelector("input[name=email]").value, "ana@oficina.com.br");
    assert.ok(alvo.querySelector("form"));
  } finally { t.mock.timers.reset(); LOGIN.desmontar(); }
});

test("DU-224 · o último e-mail fica lembrado (nunca a senha) e não em aparelho compartilhado", () => {
  const ls = loja();
  LOGIN.gravarEmailLembrado(ls, "Ana@Clinica.com ", true);
  assert.equal(LOGIN.lerEmailLembrado(ls), "ana@clinica.com");
  assert.equal(LOGIN.lerEmailLembrado(ls, true), "", "compartilhado não preenche");
  LOGIN.gravarEmailLembrado(ls, "ana@clinica.com", false);
  assert.equal(ls.getItem(LOGIN.CHAVE_EMAIL_LEMBRADO), null, "«Lembrar» desmarcado apaga");
  assert.match(LOGIN_TXT, /valor: emailLembrado/);
});

test("DU-225 + DU-231 · a ajuda do «Lembrar» fala da saída em 2 h; com teste aberto a frase não supõe senha recebida", async () => {
  const alvo = await montarLogin("login", [], { marca: { produto: "Conecta", teste_aberto: true }, aparelhoCompartilhado: () => false, api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.match(alvo.querySelector('[data-campo="lembrar"] .campo-ajuda').textContent, /sai sozinha depois de 2 h sem uso/);
  assert.match(alvo.textContent, /Entre com seu e-mail e senha\./);
  assert.doesNotMatch(alvo.textContent, /que você recebeu/);
  LOGIN.desmontar();
});

test("DU-221 · durante o bloqueio o leitor de tela ouve quanto falta de minuto em minuto", async t => {
  assert.equal(LOGIN.fraseMinutosRestantes(720), "Faltam 12 minutos para tentar de novo.");
  sessionStorage.removeItem("nx-login-bloq");
  const alvo = await montarLogin("login", [], { api: { publica: async () => { throw erroDe("muitas_tentativas", { hint: "3" }); }, mensagemErro: A.mensagemErro, minutosDoHint: A.minutosDoHint } });
  alvo.querySelector("input[name=email]").value = "ana@x.com.br"; alvo.querySelector("input[name=senha]").value = "qualquer";
  t.mock.timers.enable({ apis: ["setInterval"] });
  try {
    ev(alvo.querySelector("form"), "submit"); await tick(6);
    const sr = alvo.querySelector(".entrar-falta");
    assert.equal(sr.getAttribute("aria-live"), "polite");
    assert.equal(sr.textContent, "Faltam 3 minutos para tentar de novo.");
    t.mock.timers.tick(59000); assert.equal(sr.textContent, "Faltam 3 minutos para tentar de novo.", "não fala a cada segundo");
    t.mock.timers.tick(1000); assert.equal(sr.textContent, "Faltam 2 minutos para tentar de novo.");
  } finally { t.mock.timers.reset(); LOGIN.desmontar(); sessionStorage.removeItem("nx-login-bloq"); }
});

/** Entra até o passo do código (nx_entrar responde `resposta`); `outras[nome]` responde as outras chamadas. */
async function ateOCodigo(resposta, outras = {}, marca = {}) {
  const chamadas = [], entradas = [];
  const alvo = await montarLogin("login", [], { marca, aoEntrar: async (tk, o) => { entradas.push([tk, o]); },
    api: { publica: async (n, p) => { chamadas.push([n, p]); if (outras[n]) return outras[n](p); if (n === "nx_entrar") return resposta; return {}; }, mensagemErro: A.mensagemErro } });
  alvo.querySelector("input[name=email]").value = "ana@x.com.br"; alvo.querySelector("input[name=senha]").value = "Cavalo-azul-77";
  ev(alvo.querySelector("form"), "submit"); await tick(6);
  return { alvo, chamadas, entradas };
}
test("DU-134 + DU-135 · passo do código: «Mandar outro código» depois de 30 s; 6 números enviam sozinhos (uma vez)", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { alvo, chamadas, entradas } = await ateOCodigo({ precisa_codigo: true, desafio: "d1" }, { nx_entrar_codigo: () => ({ token: "tok" }) });
    const inp = alvo.querySelector("input[name=codigo]");
    assert.equal(inp.getAttribute("autocomplete"), "one-time-code"); assert.equal(inp.getAttribute("inputmode"), "numeric");
    const re = alvo.querySelector(".entrar-reenviar");
    assert.equal(re.disabled, true); assert.match(re.textContent, /em 30 s/);
    t.mock.timers.tick(30000);
    assert.equal(re.disabled, false);
    re.click(); await tick(4);
    assert.ok(chamadas.some(([n, p]) => n === "nx_entrar_codigo_reenviar" && p.p_desafio === "d1"));
    assert.equal(re.disabled, true, "a espera recomeça");
    inp.value = "12345"; ev(inp, "input"); await tick(3);
    assert.equal(chamadas.filter(([n]) => n === "nx_entrar_codigo").length, 0);
    inp.value = "123456"; ev(inp, "input"); await tick(6);
    ev(inp, "input"); await tick(6);
    assert.equal(chamadas.filter(([n]) => n === "nx_entrar_codigo").length, 1, "envia uma vez só");
    assert.deepEqual(entradas.map(e => e[0]), ["tok"]);
  } finally { t.mock.timers.reset(); LOGIN.desmontar(); }
});

test("DU-134 · servidor sem o reenvio: o botão some e a frase diz o caminho", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { alvo } = await ateOCodigo({ precisa_codigo: true, desafio: "d1" }, { nx_entrar_codigo_reenviar: () => { throw Object.assign(new Error("x"), { codigo: "x", resposta: { code: "PGRST202" } }); } });
    t.mock.timers.tick(30000);
    const re = alvo.querySelector(".entrar-reenviar");
    re.click(); await tick(4);
    assert.equal(re.hidden, true);
    assert.match(alvo.textContent, /volte e entre de novo/);
  } finally { t.mock.timers.reset(); LOGIN.desmontar(); }
});

test("DU-133 + DU-136 · códigos de recuperação e «não pedir neste aparelho» só quando o servidor oferece; o token do aparelho fica guardado", async () => {
  const lsAntes = globalThis.localStorage;
  globalThis.localStorage = loja();
  try {
    const sem = await ateOCodigo({ precisa_codigo: true, desafio: "d" });
    assert.equal([...sem.alvo.querySelectorAll("button")].some(b => /recuperação/.test(b.textContent)), false);
    assert.equal(sem.alvo.querySelector("input[name=lembrar_aparelho]"), null);
    LOGIN.desmontar();
    const { alvo, chamadas } = await ateOCodigo({ precisa_codigo: true, desafio: "d", recuperacao: true, lembrar_aparelho: true },
      { nx_entrar_codigo: () => ({ token: "tok", aparelho: "ap-1" }), nx_entrar_recuperacao: p => { if (p.p_codigo === "ABCD1234") return { token: "rec" }; throw erroDe("codigo_invalido"); } });
    alvo.querySelector("input[name=lembrar_aparelho]").checked = true;
    const inp = alvo.querySelector("input[name=codigo]");
    inp.value = "654321"; ev(alvo.querySelector("form"), "submit"); await tick(6);
    const ch = chamadas.find(([n]) => n === "nx_entrar_codigo");
    assert.equal(ch[1].p_lembrar, true);
    assert.equal(localStorage.getItem(LOGIN.CHAVE_APARELHO), "ap-1");
    const rec = [...alvo.querySelectorAll("button")].find(b => /recuperação/.test(b.textContent));
    rec.click();
    assert.equal(inp.getAttribute("inputmode"), "text");
    inp.value = "abcd-1234"; ev(alvo.querySelector("form"), "submit"); await tick(6);
    assert.ok(chamadas.some(([n, p]) => n === "nx_entrar_recuperacao" && p.p_codigo === "ABCD1234"));
    LOGIN.desmontar();
    const prox = await ateOCodigo({ token: "t" });
    assert.equal(prox.chamadas[0][1].p_aparelho, "ap-1", "a próxima entrada leva o aparelho confiável");
    LOGIN.desmontar();
  } finally { globalThis.localStorage = lsAntes; }
});

test("DU-212 · «Entrar com código no WhatsApp» só com entrar_codigo; pede o código sem senha e cai no mesmo passo", async () => {
  const sem = await montarLogin("login", [], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.equal([...sem.querySelectorAll("button")].some(b => /código no WhatsApp/.test(b.textContent)), false);
  LOGIN.desmontar();
  const chamadas = [];
  const alvo = await montarLogin("login", [], { marca: { entrar_codigo: true }, api: { publica: async (n, p) => { chamadas.push([n, p]); return { desafio: "zz" }; }, mensagemErro: A.mensagemErro } });
  const bt = [...alvo.querySelectorAll("button")].find(b => /código no WhatsApp/.test(b.textContent));
  bt.click(); await tick(4);
  assert.equal(chamadas.length, 0, "sem e-mail não pede");
  alvo.querySelector("input[name=email]").value = "ana@x.com.br";
  bt.click(); await tick(6);
  assert.deepEqual(chamadas[0], ["nx_entrar_codigo_pedir", { p_email: "ana@x.com.br" }]);
  assert.ok(alvo.querySelector("input[name=codigo]"));
  assert.match(alvo.textContent, /Se o e-mail tiver um WhatsApp verificado/);
  LOGIN.desmontar();
});

test("DU-229 · «A+» aumenta o texto no aparelho inteiro (o antes.js aplica antes de pintar)", async () => {
  const ls = loja();
  const d = { documentElement: { dataset: {} } };
  assert.equal(LOGIN.alternarTextoGrande(d, ls), true); assert.equal(d.documentElement.dataset.texto, "grande"); assert.equal(ls.getItem("nx-texto-grande"), "1");
  assert.equal(LOGIN.alternarTextoGrande(d, ls), false); assert.equal(d.documentElement.dataset.texto, undefined); assert.equal(ls.getItem("nx-texto-grande"), null);
  assert.match(ANTES_TXT, /getItem\("nx-texto-grande"\) === "1"\) raiz\.setAttribute\("data-texto", "grande"\)/);
  assert.match(CSS_APP, /html\[data-texto="grande"\] \{ font-size: 112\.5%; \}/);
  const alvo = await montarLogin("login", [], { api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.ok(alvo.querySelector(".entrar-a-mais[aria-pressed]"));
  LOGIN.desmontar();
});

test("DU-222 · tentativas erradas recentes: aviso depois de entrar com «Ver sessões»", async () => {
  const txt = fnApp("function textoTentativas(t, dataHora = x => String(x)) {");
  assert.equal(txt({ quantas: 5, ultima_em: "ontem" }), "Houve 5 tentativas erradas de entrar na sua conta, a última em ontem. Se não foi você, troque a senha.");
  assert.equal(txt(null), ""); assert.equal(txt({ quantas: 0 }), "");
  const { entradas } = await ateOCodigo({ token: "t", tentativas_recentes: { quantas: 2 } });
  assert.deepEqual(entradas[0][1].tentativas, { quantas: 2 });
  LOGIN.desmontar();
  assert.match(fnDoApp("function mostrarApp() {"), /avisarTentativasRecentes\(\);/);
});

/* ---------- inatividade e bloqueio (DU-140, DU-141) ---------- */
test("DU-140 · a política de inatividade da empresa vale em todos os aparelhos; sem política, só o compartilhado (2 h)", () => {
  const OCIOSO_MS = 2 * 3600e3;
  const lim = fnApp("function limiteOciosidade({ politicaMin = null, compartilhado = false } = {}) {", { OCIOSO_MS });
  assert.equal(lim({ politicaMin: 30 }), 30 * 60e3);
  assert.equal(lim({ politicaMin: 60, compartilhado: false }), 60 * 60e3, "vale também fora do aparelho compartilhado");
  assert.equal(lim({ politicaMin: 0, compartilhado: true }), null, "«nunca»");
  assert.equal(lim({ politicaMin: null, compartilhado: true }), OCIOSO_MS);
  assert.equal(lim({ politicaMin: null, compartilhado: false }), null);
  assert.equal(lim({ politicaMin: 1 }), 5 * 60e3, "piso de 5 min");
  assert.match(fnDoApp("function ligarOciosidade() {"), /limiteOciosidade\(\{ politicaMin: politica, compartilhado: comp \}\)/);
});

test("DU-141 · tela bloqueada com PIN: cobre o app sem sair; o PIN certo libera; 5 erros saem da conta", async () => {
  HTMLDialog(); limparCorpo();
  const app = h("div", { id: "app" }); doc.body.appendChild(app);
  const guardado = new Map();
  const LS = { lerTxt: k => guardado.get(k) || null, gravar: (k, v) => guardado.set(k, v) };
  const E = { ui: U, sessao: { conta: { id: "u1", nome: "Ana" } }, ocioso: { ligar() { this.on = true; }, desligar() { this.on = false; } } };
  const resumo = fnApp("async function resumoPin(pin, sal) {");
  const chavePin = () => "nx-pin-bloqueio:u1";
  let saidas = 0;
  const bloquear = fnApp("function bloquearTela() {", { E, $: id => doc.getElementById(id), LS, sair: async () => { saidas++; return true; }, temPinDeBloqueio: () => !!LS.lerTxt(chavePin()),
    resumoPin: resumo, definirPinDeBloqueio: async () => false, PIN_MAX_ERROS: 5, chavePin });
  assert.equal(bloquear(), null, "sem PIN definido: pede para definir (não bloqueia sem saída)");
  LS.gravar(chavePin(), await resumo("1234", "u1"));
  const tela = bloquear();
  assert.ok(tela && tela.isConnected);
  assert.equal(app.getAttribute("aria-hidden"), "true"); assert.ok(app.hasAttribute("inert"));
  assert.equal(tela.getAttribute("role"), "dialog"); assert.equal(tela.getAttribute("aria-modal"), "true");
  const pin = tela.querySelector("input[name=pin]"), form = tela.querySelector("form");
  pin.value = "9999"; ev(form, "submit"); await tick(4);
  assert.match(tela.querySelector(".entrar-erro").textContent, /4 tentativas/);
  pin.value = "1234"; ev(form, "submit"); await tick(4);
  assert.equal(tela.isConnected, false); assert.equal(app.hasAttribute("inert"), false); assert.equal(saidas, 0);
  const t2 = bloquear();
  for (let i = 0; i < 5; i++) { t2.querySelector("input[name=pin]").value = "0000"; ev(t2.querySelector("form"), "submit"); await esperar(10); }
  assert.equal(saidas, 1, "5 erros: sai da conta"); assert.equal(t2.isConnected, false);
  assert.notEqual(await resumo("1234", "u1"), "1234", "o PIN não fica em texto");
  assert.ok(C.CATALOGO.some(c => c.id === "bloquear-tela"));
  limparCorpo();
});

/* ---------- primeira semana (DU-233, DU-240, DU-244, DU-236, DU-238, DU-242, DU-246, DU-247, DU-249, DU-239, DU-152, DU-227, DU-278) ---------- */
test("DU-233 · avisos do fim do teste em 7, 3, 1 e 0 dias, com o tom subindo e «Ver planos»", () => {
  const cli = { id: "c", status: "teste" };
  for (const d of [7, 3, 1, 0]) assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: d, papel: "admin" }), true, `dia ${d}`);
  for (const d of [6, 2, -1]) assert.equal(ROTAS.deveAvisarFimTeste({ cli, dias: d, papel: "admin" }), false, `dia ${d}`);
  assert.equal(ROTAS.avisoFimTeste(7).tom, "lembrete"); assert.equal(ROTAS.avisoFimTeste(3).tom, "aviso");
  assert.equal(ROTAS.avisoFimTeste(1).tom, "urgente"); assert.equal(ROTAS.avisoFimTeste(0).titulo, "Seu teste acaba hoje");
  assert.match(fnDoApp("function avisarFimDoTeste() {"), /rotulo: "Ver planos"[\s\S]*#\/config\/plano/);
});

test("DU-240 · teste vencido diz o próximo passo e a faixa tem «Ver planos»", () => {
  assert.match(ROTAS.textoTesteVencido({}), /Para voltar a usar, escolha um plano\.$/);
  assert.doesNotMatch(ROTAS.textoTesteVencido({ equipe: true }), /escolha um plano/);
  assert.match(fnDoApp("function faixasDoMomento() {"), /href: "#\/config\/plano" \}, "Ver planos"\)/);
});

test("DU-244 · em teste, a faixa «Conecte o WhatsApp» dispensada volta em 2 dias (conta ativa: 7)", () => {
  const agora = Date.now();
  const base = { id: "c", modulos: ["conversas"], canais: [] };
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...base, status: "teste" }, papel: "admin", dispensadoEm: agora - 3 * 86400000, agora }), true);
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...base, status: "teste" }, papel: "admin", dispensadoEm: agora - 86400000, agora }), false);
  assert.equal(ROTAS.faltaWhatsapp({ cli: { ...base, status: "ativo" }, papel: "admin", dispensadoEm: agora - 3 * 86400000, agora }), false);
});

test("DU-236 · próximo passo: o primeiro não feito, com «~N min» e o destino; o selo do menu diz qual é", () => {
  const est = { itens: [{ id: "marca", feito: true }, { id: "whatsapp", feito: false, titulo: "Conectar o WhatsApp" }, { id: "equipe", feito: false }] };
  assert.deepEqual(ROTAS.proximoPasso(est), { id: "whatsapp", titulo: "Conectar o WhatsApp", minutos: 3, tempo: "~3 min", hash: "#/config/numeros?assistente=novo" });
  assert.equal(ROTAS.proximoPasso({ itens: [{ id: "x", feito: true }] }), null);
  assert.equal(ROTAS.proximoPasso({ itens: [{ id: "novo", feito: false }] }).tempo, "", "passo sem estimativa: sem tempo inventado");
  assert.match(fnDoApp("function atualizarSeloPrimeirosPassos() {"), /Próximo: \$\{prox\.titulo\}/);
});

test("DU-238 · marcos de ativação: só na virada do 1º, 10º e 100º; a primeira leitura só guarda", () => {
  assert.equal(ROTAS.marcoAtingido(0, 1), 1); assert.equal(ROTAS.marcoAtingido(9, 12), 10); assert.equal(ROTAS.marcoAtingido(10, 11), null);
  assert.equal(ROTAS.marcoAtingido(5, 5), null); assert.equal(ROTAS.marcoAtingido(0, 150), 100);
  assert.equal(ROTAS.textoMarco("ia_respostas", 12), "A IA já respondeu 12 conversas por você.");
  const toasts = [];
  const guardado = new Map();
  const ls = { ler: k => guardado.get(k) || null, gravar: (k, v) => guardado.set(k, v) };
  const conferir = fnApp("function conferirMarcos(est, { ls = LS, ui = E.ui, cli = E.cliente } = {}) {", { E: { M: { rotas: ROTAS } }, LS: ls });
  const o = { ls, ui: { toast: t => toasts.push(t) }, cli: { id: "c1" } };
  assert.deepEqual(conferir({ contadores: { ia_respostas: 40 } }, o), [], "primeira leitura: guarda");
  assert.deepEqual(conferir({ contadores: { ia_respostas: 100 } }, o), ["A IA já respondeu 100 conversas por você."]);
  assert.deepEqual(conferir({ contadores: { ia_respostas: 101 } }, o), []);
  assert.deepEqual(conferir({}, o), [], "servidor sem contadores: nada");
  assert.equal(toasts.length, 1);
});

test("DU-242 · objetivo principal nas boas-vindas ordena o Início e os primeiros passos", () => {
  assert.deepEqual(ROTAS.OBJETIVOS.map(o => o.id), ["responder", "organizar", "anunciar"]);
  assert.deepEqual(ROTAS.ordemDoInicio("anunciar", ["conversas", "crm", "anuncios", "relatorios"]), ["anuncios", "relatorios", "crm", "conversas"]);
  assert.deepEqual(ROTAS.ordemDoInicio("xyz", ["a", "b"]), ["a", "b"]);
  assert.deepEqual(ROTAS.passosPorObjetivo([{ id: "marca" }, { id: "contatos" }, { id: "whatsapp" }], "responder").map(p => p.id), ["whatsapp", "marca", "contatos"]);
  assert.equal(ROTAS.chaveObjetivo("c1"), "nx-objetivo:c1");
  const bv = fnDoApp("function mostrarBoasVindas() {");
  assert.match(bv, /O que você quer resolver primeiro\?/); assert.match(bv, /new CustomEvent\("nx:objetivo"/);
});

test("DU-152 · boas-vindas com o texto e o contato da revenda (texto puro, cortado)", () => {
  const f = fnApp("function textosBoasVindasDaOrg(marca) {");
  assert.deepEqual(f({ boas_vindas: "Oi! Sou a Carla <b>da agência</b>.", contato_agencia: "Carla · (12) 9 9999-0000" }),
    { titulo: "", texto: "Oi! Sou a Carla bda agência/b.", contato: "Carla · (12) 9 9999-0000" });
  assert.deepEqual(f(null), { titulo: "", texto: "", contato: "" });
  assert.ok(f({ boas_vindas: "x".repeat(900) }).texto.length <= 400);
  assert.match(fnDoApp("function mostrarBoasVindas() {"), /titulo: textosOrg\.titulo \|\| `Bem-vindo ao \$\{E\.produto \|\| "sistema"\}`/);
});

test("DU-227 · depois do convite, o aviso de boas-vindas traz «Comece aqui» com o passo de instalar destacado", () => {
  const toasts = [], abertos = [];
  const f = fnApp("function mostrarBoasVindasConvite() {", { E: { boasVindasConvite: { empresa: "Clínica X", papel: "atendente" }, ui: { toast: (t, o) => toasts.push([t, o]) }, M: { vocab: VOCAB } },
    textoBoasVindas: () => "Bem-vindo à Clínica X.", abrirComeceAqui: o => abertos.push(o) });
  f();
  assert.equal(toasts[0][1].acao.rotulo, "Comece aqui");
  toasts[0][1].acao.fn();
  assert.deepEqual(abertos, [{ destaque: "instalar" }]);
  assert.match(fnDoApp("function abrirComeceAqui({ destaque = null } = {}) {"), /destaque: destaque === it\.id && !it\.feito \? "1" : null/);
});

test("DU-278 · a pílula do teste diz que leva aos planos", () => {
  assert.match(fnDoApp("function pilulaDeTeste(cli) {"), /"aria-label": `\$\{txTeste\.longo\} Ver planos e como continuar\.`/);
});

test("DU-246 + DU-247 · tour por tela na primeira visita; o balão foca o «Próximo» e devolve o foco no fim", () => {
  assert.deepEqual(ROTAS.paradasDoTour("conversas").map(p => p.titulo), ["Suas conversas", "Responder"]);
  assert.equal(ROTAS.paradasDoTour("crm")[0].alvo, "[role='region'][aria-label^='Quadro de']");
  assert.deepEqual(ROTAS.paradasDoTour("nada"), []);
  assert.equal(ROTAS.chaveTourRota("u", "crm"), "nx-tour-rota:u:crm");
  const corpo = fnDoApp("function iniciarTourDaRota(modulo, { forcar = false } = {}) {");
  assert.match(corpo, /!LS\.lerTxt\(C\.chaveTour\(conta\)\)/, "só depois do tour geral");
  assert.match(fnDoApp("async function montarNoShell(r, seq, doUsuario) {"), /iniciarTourDaRota\(r\.modulo\)/);
  const mostrar = fnDoApp("function mostrarParadasDoTour(paradas) {");
  assert.match(mostrar, /prox\.focus/); assert.match(mostrar, /devolverFoco\(\)/);
});

test("DU-246 · o tour da tela roda de verdade: balões nos alvos, «Concluir» fecha e o foco volta", async () => {
  limparCorpo();
  const lista = h("div", { "aria-label": "Lista de conversas" }), campo = h("textarea", { "aria-label": "Mensagem" }), antes = h("button", null, "x");
  doc.body.append(antes, lista, campo);
  focarTeclado(antes);
  const guardado = new Map([["nx-tour-visto:u", "1"]]);
  const LS = { lerTxt: k => guardado.get(k) || null, gravar: (k, v) => guardado.set(k, v) };
  let tourAberto = null;
  const E = { sessao: { conta: { id: "u" } }, M: { rotas: ROTAS, comandos: C }, ui: U };
  const mostrarParadasDoTour = new Function("E", "U", "tourHolder", `"use strict"; let tourAberto = null; ${fnDoApp("function mostrarParadasDoTour(paradas) {")} return mostrarParadasDoTour;`)(E, U, null);
  const iniciar = fnApp("function iniciarTourDaRota(modulo, { forcar = false } = {}) {", { E, LS, emModoDemo: () => false, tourAberto, mostrarParadasDoTour });
  assert.equal(iniciar("conversas"), true);
  assert.equal(guardado.get("nx-tour-rota:u:conversas"), "1");
  assert.equal(iniciar("conversas"), false, "uma vez só");
  await esperar(40);
  const balao = doc.querySelector(".tour-balao");
  assert.ok(balao); assert.match(balao.textContent, /Suas conversas · 1 de 2/);
  assert.equal(doc.activeElement.textContent, "Próximo");
  doc.activeElement.click(); await esperar(40);
  assert.match(doc.querySelector(".tour-balao").textContent, /Responder · 2 de 2/);
  doc.activeElement.click(); await esperar(40);
  assert.equal(doc.querySelector(".tour-balao"), null);
  assert.equal(doc.activeElement, antes, "o foco volta para onde estava");
  limparCorpo();
});

test("DU-249 · convite pela função (Recepção, Gerente…) com o papel certo por trás", () => {
  assert.equal(ROTAS.papelDaFuncao("recepcao"), "atendente");
  assert.equal(ROTAS.papelDaFuncao("gerente"), "supervisor");
  assert.equal(ROTAS.papelDaFuncao("socio"), "admin");
  assert.equal(ROTAS.papelDaFuncao("nada"), null);
  for (const f of ROTAS.FUNCOES_EQUIPE) assert.ok(ROTAS.PAPEIS.includes(f.papel));
});

test("DU-239 · dispensou os primeiros passos: a paleta oferece «Reabrir os primeiros passos»", () => {
  const amb = { temCliente: true, pode: () => true, passosDispensados: true };
  const c = C.CATALOGO.find(x => x.id === "reabrir-passos");
  assert.ok(c.quando(amb)); assert.equal(c.quando({ ...amb, passosDispensados: false }), false);
  assert.match(ROTAS.TEXTO_REABRIR_PASSOS, /Ajuda › Primeiros passos/);
});

/* ---------- service worker (DU-251, DU-252, DU-253, DU-254, DU-256, DU-267) ---------- */
test("DU-251 + DU-252 + DU-253 · aviso de push: ícone da marca, badge monocromático, ações na conversa e tag por conversa", async () => {
  const m = criarMundoSW();
  const op = m.self.opcoesDoAviso({ titulo: "Ana", corpo: "Oi", hash: "#/conversas/c9" }, { iconePadrao: "P", badge: "B" });
  assert.equal(op.icon, "P"); assert.equal(op.badge, "B"); assert.equal(op.tag, "nx-conv-c9");
  assert.deepEqual([...op.actions.map(a => a.action)], ["ler", "abrir"]);
  assert.equal(op.data.conversa, "c9");
  assert.equal(m.self.opcoesDoAviso({ icone: "https://cdn.marca.test/i.png" }, { iconePadrao: "P" }).icon, "https://cdn.marca.test/i.png", "o do servidor vence");
  assert.equal(m.self.opcoesDoAviso({ icone: "javascript:alert(1)" }, { iconePadrao: "P" }).icon, "P");
  const evMarca = m.evento({ data: { tipo: "marca", produto: "Sorriso", icone: "https://sorriso.test/logo.png" } });
  m.ouvintes.message(evMarca);
  assert.equal(m.self.opcoesDoAviso({}, { iconePadrao: "P" }).icon, "https://sorriso.test/logo.png", "o guardado pela página vence o empacotado");
  assert.equal(m.self.opcoesDoAviso({ hash: "#/inicio" }).actions, undefined, "aviso que não é conversa não tem «Marcar como lida»");
  assert.ok(readFileSync(join(APP, "icones", "badge-96.png")).length > 100, "o badge existe");
});

test("DU-256 · com mais de 3 conversas avisadas, um aviso-resumo substitui os soltos", async () => {
  const m = criarMundoSW();
  const mostrados = [], fechados = [];
  const abertos = ["a", "b", "c"].map(c => ({ data: { conversa: c }, close: () => fechados.push(c) }));
  m.self.registration.showNotification = async (t, o) => { mostrados.push([t, o]); };
  m.self.registration.getNotifications = async () => abertos;
  const e = m.evento({ data: { json: () => ({ titulo: "Nova", hash: "#/conversas/d" }) } });
  m.ouvintes.push(e); await e.fim();
  assert.deepEqual(fechados, ["a", "b", "c"]);
  assert.equal(mostrados[0][0], "4 conversas novas"); assert.equal(mostrados[0][1].tag, "nx-push-resumo");
  const m2 = criarMundoSW(); const mostr2 = [];
  m2.self.registration.showNotification = async (t, o) => { mostr2.push([t, o]); };
  m2.self.registration.getNotifications = async () => [{ data: { conversa: "a" } }];
  const e2 = m2.evento({ data: { json: () => ({ titulo: "Nova", hash: "#/conversas/d" }) } });
  m2.ouvintes.push(e2); await e2.fim();
  assert.equal(mostr2[0][0], "Nova"); assert.equal(mostr2[0][1].tag, "nx-conv-d");
});

test("DU-253 + DU-267 · «Marcar como lida» no aviso: a aba aberta recebe {tipo:'ler'} e não é aberta; a aba marca pelo servidor", async () => {
  const m = criarMundoSW();
  const recebidos = []; let focou = 0;
  m.self.clients.matchAll = async () => [{ url: `${m.site}/app/#/inicio`, postMessage: x => recebidos.push(x), focus: async () => { focou++; } }];
  const e = m.evento({ action: "ler", notification: { data: { hash: "#/conversas/c7", conversa: "c7" }, close() {} } });
  m.ouvintes.notificationclick(e); await e.fim();
  assert.deepEqual(JSON.parse(JSON.stringify(recebidos)), [{ tipo: "ler", conversa: "c7" }]); assert.equal(focou, 0);
  const e2 = m.evento({ action: "", notification: { data: { hash: "#/conversas/c7" }, close() {} } });
  m.ouvintes.notificationclick(e2); await e2.fim();
  assert.deepEqual(JSON.parse(JSON.stringify(recebidos[1])), { tipo: "abrir", hash: "#/conversas/c7" }); assert.equal(focou, 1);
  assert.equal(m.self.hashDoAviso({ hash: "javascript:x" }), "#/conversas");
  // a página
  const rpcs = [];
  const msg = fnApp("function mensagemDoSW(m) {", { E: { api: { rpcC: async (n, p) => { rpcs.push([n, p]); } }, cliente: { id: "c" }, sessao: {} }, navegar: () => {} });
  assert.equal(msg({ tipo: "ler", conversa: "c7" }), "ler"); await tick(3);
  assert.deepEqual(rpcs, [["nx_cv_marcar_lida", { p_conversa: "c7" }]]);
  assert.equal(msg({ tipo: "ler", conversa: "../x" }), null, "id estranho não chama nada");
});

test("DU-254 · pushsubscriptionchange reinscreve com a mesma chave e avisa a aba para gravar no servidor", async () => {
  const m = criarMundoSW();
  const recebidos = [];
  m.self.clients.matchAll = async () => [{ url: `${m.site}/app/`, postMessage: x => recebidos.push(x) }];
  let pedida = null;
  m.self.registration.pushManager = { subscribe: async o => { pedida = o; return { toJSON: () => ({ endpoint: "https://push.test/nova" }) }; } };
  const e = m.evento({ oldSubscription: { options: { applicationServerKey: "CHAVE" } } });
  m.ouvintes.pushsubscriptionchange(e); await e.fim();
  assert.deepEqual(JSON.parse(JSON.stringify(pedida)), { userVisibleOnly: true, applicationServerKey: "CHAVE" });
  assert.deepEqual(JSON.parse(JSON.stringify(recebidos)), [{ tipo: "push-renovar", inscricao: { endpoint: "https://push.test/nova" } }]);
  const rpcs = [];
  const msg = fnApp("function mensagemDoSW(m) {", { E: { api: { rpc: async (n, p) => { rpcs.push([n, p]); } }, sessao: {} }, navegar: () => {} });
  assert.equal(msg(recebidos[0]), "push-renovar");
  assert.deepEqual(rpcs, [["nx_push_inscrever", { p_inscricao: { endpoint: "https://push.test/nova" } }]]);
});

test("DU-243 · a primeira semana dia a dia (relógio falso): boas-vindas no D0, WhatsApp lembrado a cada 2 dias, avisos no D7/D11/D13/D14 e vencido no D15", () => {
  const inicio = Date.parse("2026-03-02T12:00:00Z"), DIA = 86400000;
  const cli = { id: "c1", status: "teste", modulos: ["conversas"], canais: [] };
  const testeAte = "2026-03-16";
  const linha = [];
  let visto = false, dispensa = 0;
  const avisosVistos = new Set();
  for (let d = 0; d <= 15; d++) {
    const agora = inicio + d * DIA;
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const dias = ROTAS.diasAteFimTeste(testeAte, hoje);
    const st = dias < 0 ? { ...cli, status: "vencido" } : cli;
    const dia = [];
    if (ROTAS.deveMostrarBoasVindas({ cli: st, papel: "admin", visto })) { dia.push("boas-vindas"); visto = true; }
    if (ROTAS.faltaWhatsapp({ cli: st, papel: "admin", dispensadoEm: dispensa, agora })) { dia.push("whatsapp"); dispensa = agora; }
    if (ROTAS.deveAvisarFimTeste({ cli: st, dias, papel: "admin", visto: avisosVistos.has(dias) })) { dia.push(`aviso:${ROTAS.avisoFimTeste(dias).tom}`); avisosVistos.add(dias); }
    if (dias < 0) dia.push("vencido");
    linha.push(`D${d}=${dia.join("+")}`);
  }
  assert.deepEqual(linha, [
    "D0=boas-vindas+whatsapp", "D1=", "D2=whatsapp", "D3=", "D4=whatsapp", "D5=", "D6=whatsapp", "D7=aviso:lembrete",
    "D8=whatsapp", "D9=", "D10=whatsapp", "D11=aviso:aviso", "D12=whatsapp", "D13=aviso:urgente", "D14=whatsapp+aviso:urgente", "D15=vencido",
  ]);
});
