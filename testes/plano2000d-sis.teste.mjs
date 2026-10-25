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
  pin.value = "9999"; ev(form, "submit"); await esperar(15);
  assert.match(tela.querySelector(".entrar-erro").textContent, /4 tentativas/);
  pin.value = "1234"; ev(form, "submit"); await esperar(15);
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

/* ==================== lote sis-d2 ==================== */
test("DU-257 + DU-155 · faixa de versão: «Ver novidades» abre e fecha a lista (aria-expanded); sem produto diz «do sistema»", () => {
  const f = PWA.criarFaixaVersao(U, "", () => {}, { notas: ["Agenda mais rápida", "Busca nova"] });
  assert.match(f.textContent, /Nova versão do sistema pronta\./);
  assert.doesNotMatch(f.textContent, /Órbita/);
  const ver = f.querySelector(".faixa-versao-ver"), ul = f.querySelector(".faixa-versao-notas");
  assert.equal(ul.hidden, true, "a lista começa fechada");
  assert.equal(ver.getAttribute("aria-controls"), ul.id);
  ver.click();
  assert.equal(ul.hidden, false); assert.equal(ver.getAttribute("aria-expanded"), "true"); assert.equal(ver.textContent, "Esconder novidades");
  ver.click();
  assert.equal(ul.hidden, true); assert.equal(ver.getAttribute("aria-expanded"), "false");
  assert.equal(PWA.criarFaixaVersao(U, "Sorriso", () => {}).querySelector(".faixa-versao-ver"), null, "sem notas, sem botão");
  assert.match(PWA.criarFaixaVersao(U, "Sorriso", () => {}).textContent, /Nova versão do Sorriso pronta/);
  assert.doesNotMatch(ler("pwa.js"), /o\.produto \? o\.produto\(\) : "Órbita"/);
});

test("DU-258 · instalar no iPhone: cada passo com o desenho do botão do Safari e onde ele fica", () => {
  assert.deepEqual(PWA.PASSOS_IOS_VISUAL.map(p => p.icone), ["compartilhar", "mais", "check"]);
  assert.deepEqual(PWA.PASSOS_IOS_VISUAL.map(p => p.texto), [...PWA.PASSOS_IOS]);
  for (const p of PWA.PASSOS_IOS_VISUAL) { assert.ok(p.onde.length > 10); assert.ok(sprite.has(p.icone), `i-${p.icone} no sprite`); }
  assert.match(fnDoApp("async function instalarApp() {"), /PASSOS_IOS_VISUAL[\s\S]*instalar-passo-ico/);
});

test("DU-261 + UCC-054 + DU-446 · manifesto da marca: atalhos só dos módulos da empresa, categorias e «Compartilhar» com sessão", () => {
  const nome = { name: "Sorriso", short_name: "Sorriso", description: "x" };
  const at = PWA.atalhosDoIcone(["crm", "conversas", "relatorios"], m => (m === "crm" ? "Pacientes" : null));
  assert.deepEqual(at.map(a => [a.rota, a.nome]), [["conversas", "Conversas"], ["crm", "Pacientes"]]);
  const m = PWA.construirManifesto({ nome, base: "https://x.test/app/", fundo: "#000", atalhos: at, compartilhar: true });
  assert.deepEqual(m.shortcuts.map(s => s.url), ["https://x.test/app/#/conversas", "https://x.test/app/#/crm"]);
  assert.deepEqual(m.categories, ["business", "productivity"]);
  assert.equal(m.share_target.action, "https://x.test/app/?compartilhar=1"); assert.equal(m.share_target.method, "GET");
  const w = PWA.construirManifesto({ nome, base: "https://x.test/app/", fundo: "#000", workspace: "crm", atalhos: [{ rota: "agenda", nome: "Agenda" }, { rota: "javascript:x", nome: "x" }] });
  assert.deepEqual(w.shortcuts.map(s => s.url), ["https://x.test/app/?produto=crm#/agenda"], "rota estranha fica de fora");
  assert.equal(w.share_target, undefined, "sem sessão, sem compartilhar");
  assert.equal(PWA.construirManifesto({ nome, base: "https://x.test/app/", fundo: "#000" }).shortcuts, undefined);
  assert.match(fnDoApp("async function atualizarManifestoApp() {"), /atalhosDoIcone[\s\S]*compartilhar: !!E\.sessao/);
});

test("UCC-054…057 (plano 1500c) + DU-446 + DU-155 · manifestos estáticos: PNG 192/512/maskable, atalhos, categorias, theme_color claro e sem «Nexus»", () => {
  for (const f of ["manifest.webmanifest", "manifest-crm.webmanifest", "manifest-ads.webmanifest", "manifest-atendimento.webmanifest"]) {
    const m = JSON.parse(ler(f));
    assert.ok(m.icons.some(i => i.sizes === "192x192" && i.type === "image/png"), `${f}: 192`);
    assert.ok(m.icons.some(i => i.sizes === "512x512" && i.purpose === "maskable"), `${f}: maskable`);
    assert.deepEqual(m.categories, ["business", "productivity"], f);
    assert.equal(m.theme_color, "#FAFAF8", f);
    // plano 2000d: SX-056 — o app de Anúncios leva aos anúncios e relatórios (os outros continuam Conversas/CRM/Agenda)
    assert.deepEqual(m.shortcuts.map(s => s.name), f === "manifest-ads.webmanifest" ? ["Anúncios", "Relatórios", "CRM"] : ["Conversas", "CRM", "Agenda"], f);
    for (const s of m.shortcuts) assert.ok(s.url.startsWith("/app/"), `${f}: atalho no escopo`);
    assert.doesNotMatch(JSON.stringify(m), /Nexus|Anthropic|CodeWords/, f);
  }
  const p = JSON.parse(ler("manifest.webmanifest"));
  assert.deepEqual(p.share_target, { action: "/app/?compartilhar=1", method: "GET", params: { title: "titulo", text: "texto", url: "link" } });
});

test("DU-446 · o texto compartilhado chega às Conversas (guardado na aba) e o endereço perde o ?compartilhar", () => {
  assert.equal(PWA.textoCompartilhado("?compartilhar=1&titulo=Oi&texto=Veja%20isto&link=https%3A%2F%2Fa.test"), "Oi\nVeja isto\nhttps://a.test");
  assert.equal(PWA.textoCompartilhado("?compartilhar=1&texto=a&link=a"), "a", "sem repetir");
  assert.equal(PWA.textoCompartilhado("?texto=a"), null); assert.equal(PWA.textoCompartilhado("?compartilhar=1"), null);
  assert.equal(PWA.textoCompartilhado(`?compartilhar=1&texto=${"x".repeat(3000)}`).length, 2000);
  const corpo = fnDoApp("function receberCompartilhado() {");
  assert.match(corpo, /sessionStorage\.setItem\("nx-compartilhado", texto\)/); assert.match(corpo, /history\.replaceState/); assert.match(corpo, /navegar\("#\/conversas"/);
});

test("DU-408 · o app instalado reabre na última tela principal (uma vez, só sem endereço próprio)", () => {
  const f = PWA.rotaAoAbrirInstalado;
  assert.equal(f({ instalado: true, hash: "", ultima: "#/agenda" }), "#/agenda");
  assert.equal(f({ instalado: true, hash: "#/inicio", ultima: "#/crm" }), "#/crm");
  assert.equal(f({ instalado: false, hash: "", ultima: "#/agenda" }), null, "no navegador, não");
  assert.equal(f({ instalado: true, hash: "#/conversas/9", ultima: "#/agenda" }), null, "aberto num endereço: respeita");
  assert.equal(f({ instalado: true, hash: "", ultima: "#/login" }), null);
  assert.equal(f({ instalado: true, hash: "", ultima: "javascript:alert(1)" }), null);
  assert.equal(f({ instalado: true, hash: "", ultima: "#/agenda", ligado: false }), null, "desligado no Perfil");
  const navs = [];
  const guardado = new Map([["nx-ultima-rota", "#/agenda"]]);
  const E = { sessao: { conta: { id: "u" } }, pwaMod: PWA };
  const abrir = fnApp("function abrirNaUltimaRota() {", { E, LS: { lerTxt: k => guardado.get(k) || null }, rodandoInstalado: () => true, location: { hash: "" }, navegar: (h, o) => navs.push([h, o]) });
  assert.equal(abrir(), "#/agenda"); assert.deepEqual(navs, [["#/agenda", { substituir: true }]]);
  assert.equal(abrir(), null, "uma vez por abertura");
  assert.match(fnDoApp("async function montarNoShell(r, seq, doUsuario) {"), /LS\.gravar\(E\.pwaMod && E\.pwaMod\.CHAVE_ULTIMA_ROTA \|\| "nx-ultima-rota", `#\/\$\{r\.modulo\}`\)/);
});

const PP = P;
test("DU-268 · horário silencioso: o número sobe, mas sem som nem aviso de tela (inclusive atravessando a meia-noite)", () => {
  
  const em = (h, m) => new Date(2026, 2, 3, h, m);
  const s = { de: "20:00", ate: "08:00" };
  assert.equal(PP.emHorarioSilencioso(s, em(22, 0)), true); assert.equal(PP.emHorarioSilencioso(s, em(7, 59)), true);
  assert.equal(PP.emHorarioSilencioso(s, em(8, 0)), false); assert.equal(PP.emHorarioSilencioso(s, em(12, 0)), false);
  assert.equal(PP.emHorarioSilencioso({ de: "12:00", ate: "13:30" }, em(13, 0)), true);
  assert.equal(PP.emHorarioSilencioso({ de: "25:00", ate: "08:00" }, em(22, 0)), false); assert.equal(PP.emHorarioSilencioso(null, em(22, 0)), false);
  const base = { antes: 1, depois: 3, escondida: true, pref: { som: true, tela: true, silencio: s } };
  assert.deepEqual(PP.avisoDeNaoLidas({ ...base, agora: em(23, 0) }), { som: false, tela: false, novas: 2, silencio: true });
  assert.deepEqual(PP.avisoDeNaoLidas({ ...base, agora: em(10, 0) }), { som: true, tela: true, novas: 2 });
  assert.deepEqual(PP.avisoDeNaoLidas({ ...base }), { som: true, tela: true, novas: 2 }, "sem relógio: como antes");
  assert.match(fnDoApp("function avisarNaoLidas(n, ultima = null) {"), /agora: new Date\(\)/);
  assert.match(fnDoApp("function lerAvisosConversas() {"), /silencio:/);
});

test("DU-277 · barra de baixo escolhida pela pessoa (até 4 + Mais); item fora do plano some; vazio volta ao automático", () => {
  const itens = ["inicio", "conversas", "crm", "agenda", "tarefas", "relatorios"].map(id => ({ id })).concat([{ id: "config", fixo: true }]);
  assert.deepEqual(ROTAS.itensDaBarra(itens, {}, undefined, ["agenda", "relatorios"]).map(i => i.id), ["agenda", "relatorios"]);
  assert.deepEqual(ROTAS.itensDaBarra(itens, {}, undefined, ["a", "b", "c", "d", "agenda", "crm", "tarefas", "inicio", "conversas"]).map(i => i.id), ["agenda", "crm", "tarefas", "inicio"], "no máximo 4");
  assert.deepEqual(ROTAS.itensDaBarra(itens, {}, undefined, ["config", "sumiu"]).map(i => i.id), ROTAS.itensDaBarra(itens, {}).map(i => i.id), "nada válido: automático");
  assert.equal(ROTAS.MAX_ITENS_BARRA, 4);
  assert.match(fnDoApp("function abrirFolhaMais(itens) {"), /"Editar barra"/);
  assert.match(fnDoApp("function editarBarra() {"), /x\.c\.disabled = !x\.c\.checked && n >= MAX/);
});

test("DU-286 · novidade da versão: ponto na conta e «(nova)» até abrir; o toast de «Atualizado» não apaga o ponto", () => {
  const ls = loja();
  PWA.guardarNovidades(ls, "V9", ["Agenda nova"]);
  assert.deepEqual(PWA.novidadesDaVersao(ls, "V9"), { notas: ["Agenda nova"], vistas: false, abertas: false });
  PWA.marcarNovidadesVistas(ls);
  assert.equal(PWA.novidadesDaVersao(ls, "V9").abertas, false, "o toast só marca vistas");
  PWA.marcarNovidadesAbertas(ls);
  assert.deepEqual(PWA.novidadesDaVersao(ls, "V9"), { notas: ["Agenda nova"], vistas: true, abertas: true });
  assert.match(fnDoApp("function desenharConta() {"), /dataset: \{ novidade: temNovidade \? "1" : null \}/);
  assert.match(fnDoApp("function abrirNovidades() {"), /marcarNovidadesAbertas/);
  assert.match(CSS_APP, /\.lat-conta\[data-novidade="1"\]::after/);
});

test("DU-269 + DU-410 + DU-447 · atalhos «G + letra» com Relatórios e Equipe; a paleta mostra o atalho; a tecla é a da plataforma", () => {
  assert.equal(C.SEQUENCIAS_G.p, "#/relatorios/vendas"); assert.equal(C.SEQUENCIAS_G.e, "#/config/equipe");
  assert.equal(C.atalhoDoDestino("relatorios"), "G P"); assert.equal(C.atalhoDoDestino("conversas"), "G C"); assert.equal(C.atalhoDoDestino("nada"), "");
  assert.equal(C.teclaDaPlataforma("MacIntel"), "⌘"); assert.equal(C.teclaDaPlataforma("Win32"), "Ctrl");
  assert.equal(C.textoAtalho("{mod} + K", "macOS"), "⌘ + K"); assert.equal(C.textoAtalho("Ctrl/⌘ + K", "Linux"), "Ctrl + K");
  assert.ok(C.ATALHOS_GERAIS.some(a => /P Relatórios, E Equipe/.test(a.rotulo)));
});

test("DU-270 · a paleta acha automações pelo nome e liga/desliga (desligar pergunta antes)", () => {
  const lista = [{ id: 1, nome: "Lembrete de consulta", ativo: true }, { id: 2, nome: "Pós-venda", ativo: false }, { id: 3, nome: "Aniversário", ativo: true }];
  assert.deepEqual(C.automacoesDaPaleta(lista, "lembr").map(a => a.id), [1]);
  assert.deepEqual(C.automacoesDaPaleta(lista, "l"), [], "1 letra: nada");
  assert.match(PALETA_TXT, /Automações/);
  assert.match(fnDoApp("async function alternarAutomacaoPelaPaleta(a) {"), /confirmar[\s\S]*nx_automacao_ativar/);
});

test("DU-275 · «Limpar recentes» na paleta e ao sair da conta", () => {
  assert.match(PALETA_TXT, /Limpar recentes/);
  assert.match(fnDoApp("function ambientePaleta(inicial) {"), /limparRecentes: rec \? \(\) => \{ rec\.limpar\(\)/);
  assert.match(APP_JS, /const prefixos = \[E\.M\.comandos \? E\.M\.comandos\.PREFIXO_RECENTES : "nx-rec:"/);
});

test("DU-281 · modo foco: a paleta liga e desliga; o CSS esconde o menu lateral e as faixas que não bloqueiam", () => {
  const c = C.CATALOGO.find(x => x.id === "modo-foco");
  assert.equal(c.rotulo({ modoFoco: true }), "Sair do modo foco"); assert.equal(c.rotulo({}), "Modo foco");
  const cl = new Set(), ss = new Map();
  const alternar = fnApp("function alternarModoFoco(on = !document.documentElement.classList.contains(\"modo-foco\")) {", {
    document: { documentElement: { classList: { contains: x => cl.has(x), toggle: (x, v) => (v ? cl.add(x) : cl.delete(x)) } } },
    sessionStorage: { setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }, E: { ui: { anunciar() {} } } });
  assert.equal(alternar(), true); assert.ok(cl.has("modo-foco")); assert.equal(ss.get("nx-modo-foco"), "1");
  assert.equal(alternar(), false); assert.equal(ss.has("nx-modo-foco"), false);
  assert.match(CSS_APP, /html\.modo-foco \.lateral \{ display: none; \}/);
  assert.match(CSS_APP, /html\.modo-foco \.faixas > \.faixa:not\(\.faixa-bloqueio\) \{ display: none; \}/);
});

test("DU-282 · «Ir para o menu» além do «Pular para o conteúdo»; o menu recebe o foco", () => {
  assert.match(HTML, /<a class="pular pular-menu" href="#lateral">Ir para o menu<\/a>/);
  assert.match(HTML, /<aside class="lateral" id="lateral" aria-label="Menu principal" tabindex="-1">/);
});

test("DU-283 · «Trocar de produto» só com 2+ produtos liberados; com um outro só, diz qual", () => {
  const c = C.CATALOGO.find(x => x.id === "abrir-produto");
  assert.equal(c.quando({ temCliente: true, produtosLiberados: 1 }), false);
  assert.equal(c.quando({ temCliente: true, produtosLiberados: 2 }), true);
  assert.equal(c.rotulo({ outrosProdutos: ["Anúncios"] }), "Trocar para Anúncios");
  assert.equal(c.rotulo({ outrosProdutos: ["CRM", "Anúncios"] }), "Trocar de produto");
});

test("DU-284 · «Recarregar o app» com texto não salvo pergunta antes", async () => {
  let recarregou = 0, perguntou = 0, resposta = false, ocupado = true;
  const f = fnApp("async function recarregarComCuidado(recarregar = () => location.reload()) {", { ocupadoParaAtualizar: () => ocupado, E: { ui: { confirmar: async () => { perguntou++; return resposta; } } } });
  assert.equal(await f(() => recarregou++), false); assert.equal(recarregou, 0); assert.equal(perguntou, 1);
  resposta = true; assert.equal(await f(() => recarregou++), true); assert.equal(recarregou, 1);
  ocupado = false; perguntou = 0; assert.equal(await f(() => recarregou++), true); assert.equal(perguntou, 0);
  assert.match(fnDoApp("function acoesDoShell() {"), /"recarregar": \(\) => recarregarComCuidado\(\)/);
});

test("DU-285 · suporte pelo app: a mensagem leva empresa, tela, versão e aparelho (nada de cliente)", () => {
  assert.equal(C.textoSuporte({ app: "Sorriso", tela: "Agenda", empresa: "Clínica X", versao: "V9", aparelho: "Win32 · 1280 px" }),
    "Olá! Preciso de ajuda no Sorriso. Empresa: Clínica X. Tela: Agenda. Versão: V9. Aparelho: Win32 · 1280 px.");
  assert.equal(C.textoSuporte({}), "Olá! Preciso de ajuda no sistema.");
  assert.match(fnDoApp("function falarComSuporte() {"), /textoSuporte\(\{ app, tela: E\.titulo, empresa: E\.cliente \? E\.cliente\.nome : "", versao: VERSAO, aparelho \}\)/);
});

test("DU-295 + DU-296 + DU-297 + DU-302 + DU-303 + DU-304 + DU-310 + DU-315 · design system: desabilitado próprio, opacidade única, chip, botões cheios, selos e elevação", () => {
  assert.match(CSS_APP, /\.bt:disabled, \.bt\[aria-disabled="true"\] \{ opacity: 1; background: var\(--c-sup-2\); color: var\(--c-texto-2\);[^}]*border-style: dashed;[^}]*cursor: not-allowed/);
  assert.match(CSS_APP, /--opac-desab: \.55/);
  assert.doesNotMatch(CSS_APP.replace(/\/\*[\s\S]*?\*\//g, ""), /:disabled[^{]*\{[^}]*opacity: \.(45|5|6)\b/, "nenhuma opacidade de desabilitado solta");
  assert.match(CSS_APP, /\.chip-check input:not\(:disabled\):not\(:checked\) \+ span:hover/); assert.match(CSS_APP, /-webkit-mask: url\("data:image\/svg\+xml/);
  assert.match(CSS_APP, /\.bt-perigo-cheio \{ background: var\(--c-ruim\);[^}]*color: var\(--c-ruim-txt\)/);
  assert.match(CSS_APP, /\.bt-ok \{ background: var\(--c-ok\);/);
  assert.match(CSS_APP, /--sombra-1:[^;]+;[\s\S]*--sombra-2:[^;]+;[\s\S]*--sombra-3:/);
  assert.match(CSS_APP, /\.arrastando, \[aria-grabbed="true"\] \{ box-shadow: var\(--sombra-3\); \}/);
  assert.match(CSS_APP, /\.etiq \{[^}]*min-height: 24px/);
});

test("DU-306 · tema escuro: avisos, faixas, painéis, etiquetas e toasts com a borda alfa", () => {
  const m = /html\[data-esquema="escuro"\] \.aviso,[\s\S]*?\{ border-color: var\(--c-borda-alfa\); \}/.exec(CSS_APP);
  assert.ok(m);
  for (const s of [".faixa", ".flut", ".menu-pop", ".etiq", ".toast"]) assert.ok(m[0].includes(`html[data-esquema="escuro"] ${s}`), s);
});

test("DU-308 + DU-316 + DU-321 + DU-324 + DU-325 · acessibilidade global no CSS: mais contraste, links sublinhados, 44 px na tabela, foco visível no título e no diálogo", () => {
  assert.match(CSS_APP, /@media \(prefers-contrast: more\) \{\s*:root \{ --c-texto-2: var\(--c-texto\); --c-texto-3: var\(--c-texto\);/);
  assert.match(CSS_APP, /\.vista p a:not\(\.bt\)[^{]*\{ text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; \}/);
  assert.match(CSS_APP, /@media \(any-pointer: coarse\) \{ \.tabela \.campo-check label[^{]*\{ min-height: 44px; min-width: 44px;/);
  assert.match(CSS_APP, /\.cab-titulo:focus-visible/);
  assert.match(CSS_APP, /\.modal:focus-visible|\.gaveta:focus-visible/);
});

test("DU-312 · contraste dos tokens: textos ≥ 4,5:1 nas superfícies, nos esquemas claro e escuro (padrão e uma marca média)", () => {
  for (const cores of [{}, { esquema: "escuro" }, { primaria: "#E8A33D", fundo: "#FFFFFF" }, { primaria: "#2B5A80", fundo: "#0E1A24" }]) {
    const t = T.derivarTema(cores);
    const v = t.vars || t;
    const sup = ["--c-fundo", "--c-sup", "--c-poco", "--c-sup-2"].map(k => v[k]).filter(Boolean);
    for (const tx of ["--c-texto", "--c-texto-2", "--c-texto-3", "--c-ok", "--c-ruim", "--c-aten", "--c-info"]) {
      for (const s of sup) assert.ok(T.contraste(v[tx], s) >= 4.5, `${JSON.stringify(cores)} ${tx} ${v[tx]} sobre ${s}: ${T.contraste(v[tx], s).toFixed(2)}`);
    }
    // o tom de link/foco da marca: 4,5:1 sobre a página (o tema.js garante); sobre cartão/poço ≥ 3:1 (contorno de foco e ícone)
    assert.ok(T.contraste(v["--c-prim-luz"], v["--c-fundo"]) >= 4.5, `${JSON.stringify(cores)} prim-luz sobre a página`);
    for (const s of [v["--c-sup"], v["--c-poco"]]) assert.ok(T.contraste(v["--c-prim-luz"], s) >= 3, `${JSON.stringify(cores)} prim-luz sobre ${s}`);
    assert.ok(Math.min(T.contraste(v["--c-prim-txt"], v["--c-prim"]), T.contraste(v["--c-prim-txt"], v["--c-prim-hi"])) >= 4.5, `${JSON.stringify(cores)}: texto do botão primário`);
    for (const s of sup) assert.ok(T.contraste(v["--c-texto-3"], s) >= 3, "ícone/controle ≥ 3:1");
  }
});

/* ==================== lote sis-d3 ==================== */
test("DU-319 · o aviso fica o tempo de ler: mínimo 6 s (8 s com botão) + 1 s a cada 20 letras, até 15 s", () => {
  assert.equal(U.duracaoToast("Salvo."), 7000);
  assert.equal(U.duracaoToast("Excluído.", { comBotao: true }), 9000);
  assert.equal(U.duracaoToast("x".repeat(100)), 11000);
  assert.equal(U.duracaoToast("x".repeat(900)), 15000);
});

test("DU-330 · botão ocupado: o nome acessível diz «aguarde» e volta ao normal no fim", async () => {
  limparCorpo();
  const b = h("button", { type: "button" }, "Salvar");
  doc.body.appendChild(b);
  let soltar = null;
  const p = U.carregando(b, () => new Promise(r => { soltar = r; }));
  assert.equal(b.getAttribute("aria-busy"), "true"); assert.equal(b.getAttribute("aria-label"), "Salvar, aguarde…");
  soltar(1); await p;
  assert.equal(b.getAttribute("aria-busy"), null); assert.equal(b.getAttribute("aria-label"), null);
  const b2 = h("button", { type: "button", "aria-label": "Excluir contato" }, "x");
  const desfaz = U.marcarOcupado(b2);
  assert.equal(b2.getAttribute("aria-label"), "Excluir contato, aguarde…"); desfaz();
  assert.equal(b2.getAttribute("aria-label"), "Excluir contato");
  limparCorpo();
});

test("DU-434 · sucesso não é só cor: o leitor de tela ouve «Pronto:»", async () => {
  limparCorpo();
  U.toast("Contato salvo.", { tipo: "ok" });
  await esperar(50);
  assert.equal(doc.getElementById("anuncio").textContent, "Pronto: Contato salvo.");
  U.toast("Pronto: tudo certo.", { tipo: "ok" });
  await esperar(50);
  assert.equal(doc.getElementById("anuncio").textContent, "Pronto: tudo certo.", "sem repetir");
  limparCorpo();
});

test("DU-326 · o campo do link (convite, nova senha) tem nome acessível", () => {
  assert.match(UI_TXT, /readonly: true, value: visivel \? link : curto, "aria-label": "Link"/);
});

test("DU-345 · trocar de empresa apaga do aparelho o que era da anterior (a atual fica)", async () => {
  const apagados = [];
  const E = { cliente: { id: "c1" }, sessao: { conta: { id: "u1" }, clientes: [{ id: "c1" }, { id: "c2", modulos: [] }] }, cache: { apagarEmpresa: async o => { apagados.push(o); } }, M: { rotas: ROTAS } };
  const f = fnApp("async function escolherCliente(id, { remontar = true } = {}) {", { E, reiniciarCanais() {}, atualizarCanais() {}, conferirMigracao() {}, LS: { gravar() {} }, CHAVE_CLIENTE: "x",
    aplicarMarcaCliente: async () => {}, desenharShell() {}, aplicarSomenteConsulta() {}, atualizarBadges() {}, atualizarSinoUI() {}, desmontarAtual() {}, navegar() {}, aoMudarRota: async () => {}, location: { hash: "#/inicio" } });
  await f("c2", { remontar: false });
  assert.deepEqual(apagados, [{ conta: "u1", cliente: "c1" }]);
  await f("c2", { remontar: false });
  assert.equal(apagados.length, 1, "mesma empresa: nada");
});

test("DU-400 · sessão encerrada por um administrador / outro aparelho / senha trocada: a janela diz o motivo", () => {
  const f = fnApp("function textoSessaoCaiu(e) {", { MOTIVOS_QUEDA: new Function(`${constDoApp("MOTIVOS_QUEDA").replace(/^const MOTIVOS_QUEDA = /, "return ")}`)() });
  assert.equal(f({ codigo: "sessao_invalida", hint: "encerrada_admin" }).titulo, "Sua sessão foi encerrada");
  assert.match(f({ codigo: "sessao_invalida", hint: "encerrada_admin" }).texto, /Um administrador/);
  assert.match(f({ codigo: "sessao_invalida", detalhe: { motivo: "outro_aparelho" } }).texto, /outro aparelho/);
  assert.equal(f({ hint: "senha_trocada" }).titulo, "Sua senha foi trocada");
  assert.equal(f({ hint: "revogada" }).motivo, "encerrada_admin");
  assert.equal(f({ codigo: "sessao_invalida" }).titulo, "Sua sessão expirou");
  assert.equal(f(null).motivo, "expirou");
  assert.match(fnDoApp("async function pedirLoginNaTela() {"), /titulo: queda\.titulo/);
  assert.match(APP_JS, /aoSessaoInvalida: e => sessaoCaiu\(e\)/);
});

test("DU-360 · «Carregando…» que demora diz o quê depois de 5 s (e só enquanto o esqueleto estiver na tela)", async () => {
  limparCorpo();
  assert.equal(ROTAS.textoCarregandoDemorou("automacoes"), "Ainda carregando as automações… Pode ser a conexão; a tela aparece assim que chegar.");
  assert.match(ROTAS.textoCarregandoDemorou("xyz"), /esta tela/);
  const sk = U.esqueleto("lista", { demorou: "Ainda carregando as conversas…", demorouMs: 20 });
  doc.body.appendChild(sk);
  const p = sk.querySelector(".sk-demora");
  assert.equal(p.hidden, true);
  await esperar(40);
  assert.equal(p.hidden, false); assert.equal(sk.querySelector("[role=status]").textContent, "Ainda carregando as conversas…");
  const sk2 = U.esqueleto("lista", { demorou: "x", demorouMs: 10 });
  await esperar(30);
  assert.equal(sk2.querySelector(".sk-demora").hidden, true, "fora da tela não muda");
  assert.equal(U.esqueleto("lista").querySelector(".sk-demora"), null);
  limparCorpo();
});

test("DU-452 · conta com mais de uma empresa: o nome curto aparece no topo do celular", () => {
  assert.equal(ROTAS.nomeCurtoEmpresa("Clínica Sorriso Feliz"), "Sorriso");
  assert.equal(ROTAS.nomeCurtoEmpresa("Oficina do Zé"), "Zé");
  assert.equal(ROTAS.nomeCurtoEmpresa("Paralelepípedos Reunidos"), "Paralelepíp…");
  assert.equal(ROTAS.nomeCurtoEmpresa(""), "");
  assert.match(fnDoApp("function desenharEmpresa() {"), /class: "emp-curto", "aria-hidden": "true"/);
  assert.match(CSS_APP, /@media \(max-width: 480px\) \{ \.empresa-bt \.emp-curto \{ display: inline;/);
});

test("DU-451 + DU-353 · trocar de empresa volta à lista da tela; datas e dinheiro no padrão brasileiro", () => {
  assert.equal(ROTAS.rotaAoTrocarEmpresa({ modulo: "conversas", partes: ["c9"] }), "#/conversas");
  assert.equal(ROTAS.rotaAoTrocarEmpresa({ modulo: "crm", partes: ["negocio", "n1"] }), "#/crm");
  assert.equal(ROTAS.rotaAoTrocarEmpresa({ modulo: "crm", partes: ["lista"] }), null);
  assert.equal(ROTAS.rotaAoTrocarEmpresa({ modulo: "config", partes: ["equipe"] }), null);
  const agora = Date.parse("2026-03-10T15:00:00Z");
  assert.equal(ROTAS.dataBR("2026-03-10T14:58:00Z", { agora, relativa: true }), "há 2 min");
  assert.equal(ROTAS.dataBR("2026-03-10T12:00:00Z", { agora, relativa: true }), "hoje, 09:00");
  assert.equal(ROTAS.dataBR("2026-03-09T12:00:00Z", { agora, relativa: true }), "ontem, 09:00");
  assert.equal(ROTAS.dataBR("2026-02-01T12:00:00Z", { agora }), "01/02");
  assert.equal(ROTAS.dinheiroBR(1234.5).replace(/\s/g, " "), "R$ 1.234,50");
  assert.equal(ROTAS.numeroBR(12345), "12.345");
});

test("DU-449 · vídeo do passo: o da revenda vence; só https", () => {
  assert.deepEqual(ROTAS.videoDoPasso({ id: "whatsapp", video: "https://a.test/v" }), { url: "https://a.test/v", rotulo: "Ver como (1 min)" });
  assert.equal(ROTAS.videoDoPasso({ id: "whatsapp", video: "https://a.test/v" }, { videos_passos: { whatsapp: "https://revenda.test/w" } }).url, "https://revenda.test/w");
  assert.equal(ROTAS.videoDoPasso({ id: "x", video: "javascript:alert(1)" }), null);
});

/* ==================== pendências do plano 1500c nos meus arquivos ==================== */
test("CC-139 (plano 1500c) · menu com títulos de grupo: o título não é item (as setas pulam)", async () => {
  limparCorpo();
  const ancora = h("button", null, "…"); doc.body.appendChild(ancora);
  U.menu(ancora, [{ titulo: "Atendimento" }, { rotulo: "Transferir", fn() {} }, "-", { titulo: "Conversa" }, { rotulo: "Arquivar", fn() {} }]);
  await esperar(5);
  const pop = doc.querySelector(".menu-pop");
  assert.deepEqual(pop.querySelectorAll(".menu-titulo").map(p => [p.textContent, p.getAttribute("role")]), [["Atendimento", "presentation"], ["Conversa", "presentation"]]);
  assert.equal(pop.querySelectorAll("[role=menuitem]").length, 2);
  limparCorpo();
});

test("RC-054 (plano 1500c) · o aviso «Desfazer» pode trocar o texto sem abrir outro", async () => {
  limparCorpo();
  const t = U.toast("Movido para Ganho.", { tipo: "info" });
  assert.equal(t.atualizarTexto("Movido para Ganho (já foi gravado)."), true);
  assert.match(t.el.querySelector("p").textContent, /^Movido para Ganho \(já foi gravado\)\./);
  let api = null;
  const p = U.acaoComDesfazer({ texto: "Excluído.", aoCriar: a => { api = a; }, ms: 50 });
  assert.equal(typeof api.atualizarTexto, "function");
  assert.equal(api.atualizarTexto("Excluído (gravado)."), true);
  assert.ok([...doc.querySelectorAll(".toast p")].some(x => /Excluído \(gravado\)\./.test(x.textContent)));
  api.firmarAgora(); await p;
  assert.equal(api.atualizarTexto("depois"), false, "fechado: não mexe");
  t.fechar();
  limparCorpo();
});

test("RC-266 (plano 1500c) · gaveta no celular: arrastar para a direita (ou para baixo na folha) fecha; o Voltar fecha a gaveta", () => {
  assert.equal(U.gestoFechaGaveta(120, 10), true);
  assert.equal(U.gestoFechaGaveta(60, 0), false, "curto");
  assert.equal(U.gestoFechaGaveta(100, 90), false, "na diagonal: é rolagem");
  assert.equal(U.gestoFechaGaveta(-120, 0), false, "para a esquerda não");
  assert.equal(U.gestoFechaGaveta(5, 140, { folha: true }), true);
  assert.equal(U.gestoFechaGaveta(140, 5, { folha: true }), false);
  const corpo = UI_TXT.slice(UI_TXT.indexOf("export function gaveta("), UI_TXT.indexOf("export function gaveta(") + 6000);
  assert.match(corpo, /camada = abrirCamada\(\);/); assert.match(corpo, /if \(camada\) \{ camada\.liberar\(\); camada = null; \}/);
  assert.match(corpo, /touchend[\s\S]*gestoFechaGaveta/);
});

test("RC-262 (plano 1500c) · rpc e rpcC aceitam o AbortSignal de quem chama (sinal ou signal)", async () => {
  const ctl = new AbortController();
  let viu = null;
  const api = A.criarApi({ url: "https://x.test", chave: "k", token: () => "t", cliente: () => "c1",
    fetch: async (u, init) => { viu = init.signal; return new Promise((res, rej) => { init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))); }); } });
  const p = api.rpcC("nx_teste_ler", {}, { signal: ctl.signal });
  await tick(2);
  ctl.abort();
  await assert.rejects(p, e => e.codigo === "cancelado");
  assert.ok(viu);
  const ctl2 = new AbortController(); ctl2.abort();
  await assert.rejects(api.rpc("nx_outro", {}, { sinal: ctl2.signal }), e => e.codigo === "cancelado");
});

test("RC-151 (plano 1500c) · ctx.guardaSaida(fn): com alteração não salva, o shell pergunta «Sair sem salvar?»", () => {
  const corpo = APP_JS.slice(APP_JS.indexOf("    guardaSaida(fn, {"), APP_JS.indexOf("    guardaSaida(fn, {") + 900);
  assert.match(corpo, /sujo = !!fn\(\)/); assert.match(corpo, /if \(!sujo\) return true;/);
  assert.match(corpo, /E\.ui\.confirmar\(\{ titulo, texto, rotulo: "Sair sem salvar", perigo: true \}\)/);
  assert.match(corpo, /guardasDeRota\.add\(guarda\)/);
});

test("CC-323 (plano 1500c) · #/agenda/tv chega à Agenda com partes ['tv'] (a Agenda abre o modo TV — pendência da frente agenda)", () => {
  const r = ROTAS.rotear("#/agenda/tv");
  assert.equal(r.modulo, "agenda"); assert.deepEqual([...r.partes], ["tv"]);
});

/* ==================== pendências da frente config (2000d) nos meus arquivos ==================== */
test("DU-394 (config) · prontos.js libera a seção «Dados da empresa»", async () => {
  const PR = await import(pathToFileURL(join(APP, "prontos.js")).href);
  assert.ok(PR.CONFIG_PRONTAS.includes("empresa"));
});

test("DU-120 + DU-145 (config) · convite sem gênero; rodapé da entrada com os links da revenda", () => {
  assert.match(LOGIN_TXT, /"Você recebeu um convite"/); assert.doesNotMatch(LOGIN_TXT, /"Você foi convidado"/);
  assert.deepEqual(LOGIN.linksDoRodape({ termos_url: "https://r.test/termos", privacidade_url: "http://inseguro.test", suporte_email: "ajuda@r.test" }),
    [{ rotulo: "Termos de uso", href: "https://r.test/termos" }, { rotulo: "Suporte por e-mail", href: "mailto:ajuda@r.test" }]);
  assert.deepEqual(LOGIN.linksDoRodape({ suporte_email: "x@" }), []);
});

test("DU-145 (config) · a tela de entrada mostra os links da revenda", async () => {
  const alvo = await montarLogin("login", [], { marca: { produto: "Sorriso", termos_url: "https://r.test/t", suporte_email: "a@r.test" }, api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  const nav = alvo.querySelector(".entrar-links");
  assert.ok(nav);
  assert.deepEqual(nav.querySelectorAll("a").map(a => a.getAttribute("href")), ["https://r.test/t", "mailto:a@r.test"]);
  const alvo2 = await montarLogin("login", [], { marca: { suporte_wa: "" }, api: { publica: async () => ({}), mensagemErro: A.mensagemErro } });
  assert.equal(alvo2.querySelector(".entrar-links"), null);
});

test("DU-119 (config) · a empresa exige 2 etapas: depois de entrar, o Perfil abre no passo de ligar", () => {
  assert.match(LOGIN_TXT, /r\.precisa_ativar_2fa === true \? \{ ativar2fa: true \} : \{\}/);
  assert.match(APP_JS, /if \(ativar2fa\) \{ destino = "#\/config\/perfil\?ativar2fa=1";/);
});

test("DU-142 + DU-147 + DU-128 + DU-150 (config) · avisos por conta, ícone próprio do app, «Ficar ausente» e marca repintada pela outra aba", () => {
  const guardado = new Map([["nx-cv-avisos", { som: false }], ["nx-cv-avisos:u1", { som: true, tela: true }]]);
  const f = fnApp("function lerAvisosConversas() {", { LS: { ler: k => guardado.get(k) || null }, E: { sessao: { conta: { id: "u1" } } } });
  assert.deepEqual(f(), { som: true, tela: true, silencio: null });
  const g = fnApp("function lerAvisosConversas() {", { LS: { ler: k => guardado.get(k) || null }, E: { sessao: { conta: { id: "u2" } } } });
  assert.equal(g().som, false, "sem a chave da conta: a antiga");
  assert.match(fnDoApp("async function atualizarManifestoApp() {"), /origem: m\.icone_app \|\| m\.logo_cliente/);
  assert.match(fnDoApp("function desenharConta() {"), /rotulo: "Ficar ausente"[\s\S]*#\/config\/perfil\?secao=avisos#cfg-pf-avisos/);
  assert.match(fnDoApp("function ouvirOutrasAbas() {"), /ev\.key !== "nx-marca-hash"[\s\S]*aplicarMarcaCliente\(\)/);
});

test("DU-145 + DU-147 (config) · validarMarca aceita as chaves novas; o ícone do app passa pela mesma regra de imagem", () => {
  assert.deepEqual(T.validarMarca({ suporte_email: "a@b.test", termos_url: "https://x", icone_app: "data:image/png;base64,AAAA", teste_aberto: true }), []);
  assert.deepEqual(T.validarMarca({ icone_app: "data:image/svg+xml;base64,AAAA" }).map(e => e.campo), ["icone_app"]);
  assert.deepEqual(T.validarMarca({ qualquer: 1 }).map(e => e.campo), ["qualquer"]);
});


/* ============================================================ lote sis-x (complemento) · plano 2000d · SX-001.. ============================================================ */
/* ---------- ui.js: formatos, máscaras e leitura de formulário ---------- */
test("SX-001 + SX-019 + SX-020 · pct('') é vazio; data inválida não derruba o Intl; «AAAA-MM-DD HH:MM» (Postgres) vale também no Safari", () => {
  assert.equal(U.pct(""), "—");
  assert.equal(U.pct(0.25), "25%");
  assert.equal(U.dataBR(new Date("x")), "—");
  assert.equal(U.hojeSP(new Date("x")), U.hojeSP());
  const Real = globalThis.Date;
  class DateSafari extends Real { constructor(...a) { if (a.length === 1 && typeof a[0] === "string" && /^\d{4}-\d{2}-\d{2} \d/.test(a[0])) super(NaN); else super(...a); } }
  globalThis.Date = DateSafari;
  try { assert.equal(U.dataHoraBR("2026-10-05 14:00"), U.dataHoraBR("2026-10-05T14:00")); assert.notEqual(U.dataHoraBR("2026-10-05 14:00"), "—"); }
  finally { globalThis.Date = Real; }
});

test("SX-002 + SX-003 · 0800/0300 sem parênteses de DDD (exibição e digitação)", () => {
  assert.equal(U.telBR("08001234567"), "0800 123 4567");
  assert.equal(U.telBR("03001234567"), "0300 123 4567");
  assert.equal(U.telBR("5512998303030"), "(12) 99830-3030", "celular continua igual");
  assert.equal(U.formatarTelefone("0800123"), "0800 123");
  assert.equal(U.formatarTelefone("08001234567"), "0800 123 4567");
  assert.equal(U.formatarTelefone("12998303030"), "(12) 99830-3030");
});

test("SX-004 + SX-005 + SX-021 · moeda colada no formato americano e o «−» tipográfico", () => {
  assert.equal(U.lerMoeda("1,234.56"), 1234.56);
  assert.equal(U.lerMoeda("12,345,678.9"), 12345678.9);
  assert.equal(U.lerMoeda("1.234,56"), 1234.56, "o brasileiro continua");
  assert.equal(U.lerMoeda("2.000"), 2000);
  assert.equal(U.lerMoeda("−1.234,56"), -1234.56);
  assert.equal(U.formatarMoeda("1,234.56"), "1.234,56");
  assert.equal(U.formatarMoeda("1234,5"), "1.234,5");
});

test("SX-006 · lerForm: número ilegível vira null (nunca NaN) e «1,5» vira 1.5", () => {
  const f = h("form", null, h("input", { type: "number", name: "a", value: "abc" }), h("input", { type: "number", name: "b", value: "1,5" }), h("input", { type: "number", name: "c", value: "" }));
  const r = U.lerForm(f);
  assert.equal(r.a, null); assert.equal(r.b, 1.5); assert.equal(r.c, null);
});

test("SX-007 · h(): estilo em camelCase vira a propriedade com hífen; variável CSS fica como veio", () => {
  const el = h("div", { style: { minHeight: "44px", "--cor": "#fff", backgroundColor: "red" } });
  assert.equal(el.style.getPropertyValue("min-height"), "44px");
  assert.equal(el.style.getPropertyValue("background-color"), "red");
  assert.equal(el.style.getPropertyValue("--cor"), "#fff");
});

test("SX-008 · carregarCss: a falha não fica guardada (a próxima tela tenta de novo)", async () => {
  if (!doc.head) doc.head = doc.documentElement.appendChild(h("head"));
  const p1 = U.carregarCss("sx008-teste");
  const l1 = doc.head.querySelector("link[data-css='sx008-teste.css']");
  ev(l1, "error");
  assert.equal(await p1, false);
  assert.equal(l1.isConnected, false, "o <link> quebrado sai");
  const p2 = U.carregarCss("sx008-teste");
  assert.notEqual(p2, p1, "nova tentativa");
  const l2 = doc.head.querySelector("link[data-css='sx008-teste.css']");
  ev(l2, "load"); assert.equal(await p2, true);
  assert.equal(U.carregarCss("sx008-teste"), p2, "o que carregou continua guardado");
});

test("SX-009 · atalho: tecla no meio da composição (IME/acento) não dispara", () => {
  let n = 0;
  const parar = U.atalho("esc", () => { n++; });
  try {
    ev(doc, "keydown", { key: "Escape", isComposing: true, altKey: false, target: doc.body });
    ev(doc, "keydown", { key: "Escape", keyCode: 229, altKey: false, target: doc.body });
    assert.equal(n, 0);
    ev(doc, "keydown", { key: "Escape", altKey: false, target: doc.body });
    assert.equal(n, 1);
  } finally { parar(); }
});

test("SX-010 + SX-025 · toast: Esc com o foco dentro fecha só o aviso; Error vira frase e nulo não vira «undefined»", () => {
  const t = U.toast("Salvo", { tipo: "ok" });
  const e = new Evento("keydown", { key: "Escape" });
  t.el.dispatchEvent(e);
  assert.ok(t.el.classList.contains("saindo"));
  assert.ok(e._parado, "não chega ao modal de baixo");
  const t2 = U.toast(Object.assign(new Error("sem_conexao"), { codigo: "sem_conexao" }), { tipo: "erro" });
  assert.doesNotMatch(t2.el.querySelector("p").textContent, /Error|object|sem_conexao/);
  const t3 = U.toast(null);
  assert.doesNotMatch(t3.el.querySelector("p").textContent, /undefined|null/);
  for (const x of [t, t2, t3]) x.fechar();
});

test("SX-011 + SX-012 · numCompacto sobe de faixa no arredondamento; numMoeda sem centavos arredonda", () => {
  assert.equal(U.numCompacto(999950), "1 mi");
  assert.equal(U.numCompacto(999_960_000), "1 bi");
  assert.equal(U.numCompacto(1500), "1,5 mil");
  assert.equal(U.numMoeda(1234.6, { centavos: false }).textContent, "R$1.235");
  assert.equal(U.numMoeda(1234.56).textContent, "R$1.234,56");
});

test("SX-013 · linkWhatsApp: número brasileiro sem DDI ganha o 55", () => {
  assert.match(U.linkWhatsApp("oi", "(12) 99999-8888"), /wa\.me\/5512999998888\?/);
  assert.match(U.linkWhatsApp("oi", "5512999998888"), /wa\.me\/5512999998888\?/);
  assert.match(U.linkWhatsApp("oi", "+1 2025550123"), /wa\.me\/12025550123\?/, "com + é de outro país");
});

test("SX-014 · barraUso: uso acima do limite mantém o medidor válido", () => {
  const b = U.barraUso("Usuários", 12, 10);
  assert.equal(b.querySelector("[role=meter]").getAttribute("aria-valuemax"), "12");
  assert.equal(U.barraUso("Usuários", 3, 10).querySelector("[role=meter]").getAttribute("aria-valuemax"), "10");
});

test("SX-015 + SX-016 · iniciais sem pontuação, parênteses nem tratamento", () => {
  assert.equal(U.iniciais("Ana (cliente)"), "AN");
  assert.equal(U.iniciais("Dra. Ana Lima"), "AL");
  assert.equal(U.iniciais("Dr Paulo"), "PA");
  assert.equal(U.iniciais("«João» Souza"), "JS");
  assert.equal(U.iniciais("Ana Souza"), "AS");
  assert.equal(U.iniciais("Dr."), "DR", "um nome só não some");
});

test("SX-017 + SX-018 · avatar: foto com carregamento preguiçoso; foto quebrada volta às iniciais", () => {
  const a = U.avatar("Ana Souza", "1", "https://foto.test/a.jpg");
  const img = a.querySelector("img");
  assert.equal(img.getAttribute("loading"), "lazy");
  assert.equal(img.getAttribute("decoding"), "async");
  ev(img, "error");
  assert.equal(a.querySelector("img"), null);
  assert.equal(a.textContent, "AS");
});

test("SX-022 · forcaSenha: repetir 1–2 caracteres é «Curta» mesmo comprida", () => {
  assert.equal(U.forcaSenha("aaaaaaaaaaaa"), 1);
  assert.equal(U.forcaSenha("abababababab"), 1);
  assert.equal(U.forcaSenha("Cavalo-azul-77"), 4);
});

test("SX-023 · copiar: nada para copiar não diz «Copiado.»", async () => {
  assert.equal(await U.copiar(""), false);
  assert.equal(await U.copiar(null), false);
});

test("SX-024 · confirmar com digitar: acento, caixa e espaço duplo não reprovam", async () => {
  HTMLDialog();
  const p = U.confirmar({ titulo: "Excluir?", perigo: true, digitar: "Clínica Sorriso" });
  const dlg = [...doc.body.querySelectorAll("dialog")].pop();
  dlg.querySelector("input").value = "clinica  sorriso";
  dlg.querySelector(".modal-rod button[data-tipo=perigo]").click();
  assert.equal(await p, true);
  await esperar(200);
});

test("SX-026 · menu: escolhido o item, o foco volta ao botão que abriu (se a ação não levou o foco)", async () => {
  limparCorpo();
  const ancora = h("button", { type: "button" }, "Mais"); doc.body.appendChild(ancora);
  U.menu(ancora, [{ rotulo: "Arquivar", fn() {} }]);
  await esperar(5);
  doc.querySelector(".menu-pop button").click();
  assert.equal(doc.activeElement, ancora);
  const outro = h("input"); doc.body.appendChild(outro);
  U.menu(ancora, [{ rotulo: "Editar", fn() { outro.focus(); } }]);
  await esperar(5);
  doc.querySelector(".menu-pop button").click();
  assert.equal(doc.activeElement, outro, "a ação levou o foco: fica lá");
});

test("SX-027 · hexDigitado aceita rgb() colado", () => {
  assert.equal(U.hexDigitado("rgb(176, 118, 31)"), "#B0761F");
  assert.equal(U.hexDigitado("rgba(255,255,255,0.5)"), "#FFFFFF");
  assert.equal(U.hexDigitado("rgb(300,0,0)"), null);
  assert.equal(U.hexDigitado("fa0"), "#FFAA00");
});

/* ---------- api.js · cache.js · rede.js · pulso.js (SX-028…SX-039) ---------- */
test("SX-028 + SX-029 · fn() aceita {signal}; publica() aceita {sinal} — quem chama desiste e a chamada sai «cancelado»", async () => {
  const api = A.criarApi({ url: "https://x.test", chave: "k", token: () => "t", cliente: () => "c1",
    fetch: async (u, init) => new Promise((res, rej) => { init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))); }) });
  const c1 = new AbortController();
  const p1 = api.fn("nx-ia", { acao: "sugerir" }, { signal: c1.signal });
  await tick(2); c1.abort();
  await assert.rejects(p1, e => e.codigo === "cancelado");
  const c2 = new AbortController();
  const p2 = api.publica("nx_convite_ver", { p_token: "x" }, { sinal: c2.signal });
  await tick(2); c2.abort();
  await assert.rejects(p2, e => e.codigo === "cancelado");
});

test("SX-030 · Retry-After com fração de segundo; número solto não vira data", () => {
  assert.equal(A.lerRetryAfter("1.5"), 1500);
  assert.equal(A.lerRetryAfter("7"), 7000);
  assert.equal(A.lerRetryAfter("-5"), null);
  const agora = Date.parse("2026-10-25T12:00:00Z");
  assert.equal(A.lerRetryAfter("Sun, 25 Oct 2026 12:00:30 GMT", agora), 30000);
});

test("SX-031 + SX-032 + SX-033 · frases do servidor sem «..» e o nome do campo sem «p_»", () => {
  assert.equal(A.mensagemErro({ codigo: "envio_falhou", detalhe_texto: "Número bloqueado." }), "O canal não aceitou a mensagem: Número bloqueado.");
  assert.equal(A.mensagemErro({ codigo: "envio_falhou", detalhe_texto: "número inválido" }), "O canal não aceitou a mensagem: número inválido.");
  assert.equal(A.mensagemErro({ codigo: "automacao_invalida", hint: "sem gatilho." }), "A automação tem um problema: sem gatilho.");
  assert.equal(A.mensagemErro({ codigo: "campo_obrigatorio", hint: "p_nome_cliente" }), "Preencha o campo \"nome cliente\" antes de continuar.");
  assert.equal(A.mensagemErro({ codigo: "campo_obrigatorio", hint: "Telefone" }), "Preencha o campo \"Telefone\" antes de continuar.");
});

function armazemFalso() {
  const m = new Map();
  return { m, async ler(k) { return m.get(k) || null; }, async gravar(k, v) { m.set(k, { k, ...v }); return true; }, async apagar(k) { m.delete(k); return true; },
    async limpar() { m.clear(); return true; }, async listar() { return [...m.values()].map(x => ({ k: x.k, v: x.v, em: x.em, bytes: x.b, nome: x.nome })); } };
}
test("SX-034 · cache: no máximo 30 respostas por RPC (as mais novas ficam; as outras RPCs não perdem a vaga)", async () => {
  let t = Date.now();
  const arm = armazemFalso();
  const c = CACHE.criarCache({ armazem: arm, varrer: false, agora: () => t });
  for (let i = 0; i < 40; i++) { t += 1000; await c.gravar(`k${i}`, "nx_negocios_kanban", { i }); }
  await c.gravar("ini", "nx_inicio", { ok: 1 });
  const saiu = await c.varrer();
  assert.equal(saiu, 10);
  const nomes = [...arm.m.values()].map(x => x.nome);
  assert.equal(nomes.filter(n => n === "nx_negocios_kanban").length, CACHE.TETO_POR_RPC);
  assert.ok(arm.m.has("k39") && !arm.m.has("k0"), "as mais antigas saem");
  assert.ok(arm.m.has("ini"));
});

test("SX-035 · cache: a memória da aba também tem teto", async () => {
  let t = Date.now();
  const c = CACHE.criarCache({ armazem: null, varrer: false, agora: () => t });
  for (let i = 0; i < CACHE.TETO_ENTRADAS + 20; i++) { t += 1; await c.gravar(`m${i}`, "nx_negocios_kanban", { i }); }
  const e = await c.estatisticas();
  assert.equal(e.entradas, CACHE.TETO_ENTRADAS);
  assert.equal(await c.ler("m0"), null, "a mais antiga saiu");
  assert.ok(await c.ler(`m${CACHE.TETO_ENTRADAS + 19}`));
});

test("SX-036 · rede: a espera de reconexão tem sorteio (±20 %) — os aparelhos não voltam todos no mesmo segundo", () => {
  const esperas = [];
  for (const sorte of [0, 1]) {
    const r = REDE.criarRede({ nav: { onLine: false }, janela: null, doc: null, agendar: (fn, ms) => { esperas.push(ms); return 1; }, cancelar: () => {}, agora: () => 0, aleatorio: () => sorte });
    r.destruir();
  }
  assert.deepEqual(esperas, [1600, 2400]);
});

test("SX-037 + SX-038 · repetirAbertura: aoFalha que lança não derruba; sem esperar usa o relógio comum", async () => {
  let n = 0;
  const r = await REDE.repetirAbertura(async () => { n++; if (n < 2) throw new Error("rede"); return "ok"; },
    { esperas: [1], aoFalha: () => { throw new Error("tela saiu"); } });
  assert.equal(r, "ok"); assert.equal(n, 2);
});

test("SX-039 · pulso: a roda do mouse conta como atividade (quem lê rolando não fica «inativo»)", () => {
  const ouv = {};
  const docF = { visibilityState: "visible", addEventListener(t, fn) { ouv[t] = fn; }, removeEventListener(t) { delete ouv[t]; } };
  let t = 0;
  const p = P.criarPulso({ ler: async () => ({}), doc: docF, nav: {}, janela: null, agora: () => t, agendar: () => 1, cancelar: () => {}, aleatorio: () => .5 });
  assert.equal(typeof ouv.wheel, "function");
  t = 20 * 60_000;
  assert.equal(p.estado.intervalo, P.INTERVALOS.muitoInativo);
  ouv.wheel();
  assert.equal(p.estado.intervalo, P.INTERVALOS.normal);
  p.destruir();
  assert.equal(ouv.wheel, undefined);
});

/* ---------- tema.js · login.js (SX-040…SX-047) ---------- */
test("SX-040 + SX-041 · marca: título/texto só com espaços valem como vazios; WhatsApp com máscara ou número continua valendo", () => {
  const m = T.marcaEfetiva({ produto: "Sorriso", login_titulo: "   ", login_texto: " ", suporte_wa: "+55 (12) 99999-8888" });
  assert.equal(m.login_titulo, "Entre para continuar");
  assert.match(m.login_texto, /e-mail e a senha/);
  assert.equal(m.suporte_wa, "5512999998888");
  assert.equal(T.marcaEfetiva({ suporte_wa: 5512999998888 }).suporte_wa, "5512999998888");
  assert.equal(T.marcaEfetiva({ suporte_wa: "123" }).suporte_wa, null);
});

test("SX-042 · validarMarca: «teste aberto» só sim ou não", () => {
  assert.deepEqual(T.validarMarca({ teste_aberto: "false" }).map(e => e.campo), ["teste_aberto"]);
  assert.deepEqual(T.validarMarca({ teste_aberto: false }), []);
});

test("SX-043 + SX-044 + SX-045 · contagem em horas; senha de linha do teclado ou de data é fraca", () => {
  assert.equal(LOGIN.formatarContagem(4500), "1:15:00");
  assert.equal(LOGIN.formatarContagem(899), "14:59");
  for (const s of ["qwertyuiop", "asdfghjkl1", "zxcvbnm123", "15031990", "15/03/1990", "1990-03-15"]) assert.equal(LOGIN.senhaFraca(s), true, s);
  for (const s of ["Cavalo-azul-77", "35139901", "qwe-Rty-88!"]) assert.equal(LOGIN.senhaFraca(s), false, s);
});

test("SX-046 + SX-047 · e-mail: invisíveis e ponto final saem; domínio digitado errado ganha «Você quis dizer…»", async () => {
  assert.equal(LOGIN.normalizarEmail("​Ana@X.com. "), "ana@x.com");
  assert.equal(LOGIN.sugestaoEmail("ana@gmial.com"), "ana@gmail.com");
  assert.equal(LOGIN.sugestaoEmail("ana@hotmail.con"), "ana@hotmail.com");
  assert.equal(LOGIN.sugestaoEmail("ana@gmail.com"), null);
  assert.equal(LOGIN.sugestaoEmail("ana@clinicasorriso.com.br"), null);
  const alvo = await montarLogin("login", [], { marca: {}, api: { publica: async () => ({}), mensagemErro: A.mensagemErro, minutosDoHint: A.minutosDoHint } });
  const inp = alvo.querySelector("input[name=email]");
  inp.value = "ana@gmial.com"; ev(inp, "blur");
  const sug = alvo.querySelector(".entrar-sugestao");
  assert.equal(sug.hidden, false);
  sug.querySelector("button").click();
  assert.equal(inp.value, "ana@gmail.com");
  assert.equal(sug.hidden, true);
  LOGIN.desmontar();
});

/* ---------- rotas.js · pwa.js · app.js (SX-048…SX-055) ---------- */
test("SX-048 + SX-049 · aviso e pílula do teste sem número ou sem data não escrevem «NaN» nem «Teste até»", () => {
  assert.doesNotMatch(JSON.stringify(ROTAS.avisoFimTeste(undefined)), /NaN/);
  assert.equal(ROTAS.avisoFimTeste(3).tom, "aviso");
  assert.deepEqual(ROTAS.textoPilulaTeste(20, ""), { curto: "Em teste", longo: "Empresa em período de teste." });
  assert.equal(ROTAS.textoPilulaTeste(20, "30/10").curto, "Teste até 30/10");
});

test("SX-050 · sessaoPertoDeVencer entende o prazo em segundos (época Unix)", () => {
  const agora = Date.parse("2026-10-25T12:00:00Z");
  assert.equal(ROTAS.sessaoPertoDeVencer(Math.floor(agora / 1000) + 300, agora), true);
  assert.equal(ROTAS.sessaoPertoDeVencer(String(Math.floor(agora / 1000) + 300), agora), true);
  assert.equal(ROTAS.sessaoPertoDeVencer(agora + 300_000, agora), true, "em ms continua");
  assert.equal(ROTAS.sessaoPertoDeVencer(Math.floor(agora / 1000) + 3600, agora), false);
});

test("SX-051 · rotear: módulo em maiúsculas ou com espaço acha a rota", () => {
  assert.equal(ROTAS.rotear("#/CRM").modulo, "crm");
  assert.equal(ROTAS.rotear("#/Agenda /2026-10-25").modulo, "agenda");
  assert.deepEqual(ROTAS.rotear("#/crm/Negocio/AbC").partes, ["Negocio", "AbC"], "o resto continua como veio (ids)");
});

test("SX-052 + SX-053 · Edge do iPhone; link compartilhado não repete", () => {
  assert.equal(PWA.nomeDoNavegador("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/141.0 Mobile/15E148 Safari/605.1.15"), "Edge 141");
  const q = new URLSearchParams({ compartilhar: "1", titulo: "Promo", texto: "Promo de outubro https://loja.test/p", link: "https://loja.test/p" });
  assert.equal(PWA.textoCompartilhado("?" + q), "Promo de outubro https://loja.test/p");
  const q2 = new URLSearchParams({ compartilhar: "1", texto: "Olha isso", link: "https://loja.test/p" });
  assert.equal(PWA.textoCompartilhado("?" + q2), "Olha isso\nhttps://loja.test/p");
});

test("SX-054 + SX-055 · shell: ctx.shell.pedirContratacao (DU-078/079) e o tempo poupado no aviso de fim do teste (DU-096)", () => {
  assert.match(APP_JS, /pedirContratacao: origem => abrirPedidoDeContratacao\(E\.cliente,/);
  assert.equal(ROTAS.fraseTempoPoupado({ minutos: 360, texto: "6 h" }), "Nos últimos 30 dias, as automações pouparam ≈ 6 h de trabalho da equipe.");
  assert.equal(ROTAS.fraseTempoPoupado({ minutos: 10, texto: "10 min" }), "", "pouco não vale destaque");
  assert.equal(ROTAS.fraseTempoPoupado(null), "");
  const f = fnDoApp("async function tempoPoupadoDoTeste(cli = E.cliente) {");
  assert.match(f, /includes\("automacoes"\) \|\| !pronto\("automacoes"\)/);
  assert.match(f, /L\.tempoEconomizado\(itens/);
  assert.match(fnDoApp("function avisarFimDoTeste() {"), /tempoPoupadoDoTeste\(cli\)\.then/);
});

/* ---------- PWA, manifestos, antes.js, sw.js (SX-056…SX-062, SX-081, SX-087, SX-094) ---------- */
test("SX-056 + SX-057 + SX-058 + SX-059 · atalhos do app de Anúncios, ícone nos atalhos, «Compartilhar» no mesmo produto e janela reaproveitada", () => {
  const at = PWA.atalhosDoIcone(["ads", "relatorios", "crm", "conversas"], null, "ads");
  assert.deepEqual(at.map(a => a.rota), ["anuncios", "relatorios", "crm"]);
  assert.deepEqual(PWA.atalhosDoIcone(["ads", "conversas"], null, "atendimento").map(a => a.rota), ["conversas"], "fora do Ads: os de sempre");
  const base = "https://x.test/app/";
  const m = PWA.construirManifesto({ nome: { name: "S", short_name: "S", description: "d" }, base, workspace: "atendimento", fundo: "#000", icones: PWA.iconesPadrao(base), atalhos: [{ rota: "conversas", nome: "Conversas" }], compartilhar: true });
  assert.deepEqual(m.shortcuts[0].icons, [{ src: "https://x.test/app/icones/icon-192.png", sizes: "192x192", type: "image/png" }]);
  assert.equal(m.share_target.action, "https://x.test/app/?produto=atendimento&compartilhar=1");
  assert.deepEqual(m.launch_handler, { client_mode: ["navigate-existing", "auto"] });
  for (const arq of ["manifest.webmanifest", "manifest-crm.webmanifest", "manifest-ads.webmanifest", "manifest-atendimento.webmanifest"]) {
    const j = JSON.parse(ler(arq));
    assert.ok(j.launch_handler && j.share_target, arq);
    for (const s of j.shortcuts) { assert.ok(s.icons && s.icons.length, `${arq}: ${s.name}`); assert.ok(s.short_name); }
  }
  const ads = JSON.parse(ler("manifest-ads.webmanifest"));
  assert.deepEqual(ads.shortcuts.map(s => s.url), ["/app/?produto=ads#/anuncios", "/app/?produto=ads#/relatorios", "/app/?produto=ads#/crm"]);
  assert.equal(JSON.parse(ler("manifest-crm.webmanifest")).share_target.action, "/app/?produto=crm&compartilhar=1");
  assert.match(fnDoApp("async function atualizarManifestoApp() {"), /atalhosDoIcone\([\s\S]*?, E\.workspace\)/);
});

function rodarAntes({ hash = "", conexao = null, token = "t" } = {}) {
  const links = [];
  const raiz = { setAttribute() {}, style: { setProperty() {} }, classList: { add() {} } };
  const documento = { documentElement: raiz, currentScript: { src: "https://x.test/app/antes.js?v=V9" }, head: { appendChild: l => links.push(l) },
    createElement: () => ({}), getElementById: () => null, readyState: "complete", addEventListener() {} };
  const janela = { localStorage: { getItem: k => (k === "nx-token" ? token : null) }, matchMedia: () => ({ matches: false }) };
  runInNewContext(ANTES_TXT, { document: documento, window: janela, location: { hash, search: "", host: "x.test", href: "https://x.test/app/" },
    navigator: conexao ? { connection: conexao } : {}, URL, URLSearchParams, Object, JSON, Math, Date, Number, String, Array, RegExp });
  return links.map(l => l.href);
}
test("SX-060 + SX-061 · antes.js: «#/CRM» pré-carrega o CRM; economia de dados ou 2G baixa só o módulo da tela", () => {
  const cheio = rodarAntes({ hash: "#/CRM" });
  assert.equal(cheio[0], "crm.js?v=V9");
  assert.ok(cheio.length > 1, "com rede boa vêm os extras");
  assert.deepEqual(rodarAntes({ hash: "#/crm", conexao: { saveData: true } }), ["crm.js?v=V9"]);
  assert.deepEqual(rodarAntes({ hash: "#/automacoes/nova", conexao: { effectiveType: "slow-2g" } }), ["automacoes.js?v=V9"]);
  assert.ok(rodarAntes({ hash: "#/crm", conexao: { effectiveType: "4g" } }).length > 1);
});

test("SX-062 · página «Sem conexão» se recarrega quando a internet volta", () => {
  const m = criarMundoSW();
  const p = m.self.paginaOffline();
  assert.match(p, /addEventListener\("online",function\(\)\{location\.reload\(\)\}\)/);
  assert.match(p, /<\/script><\/body><\/html>$/);
});

test("SX-081 · index.html: o iPhone não vira telefone/data em link", () => {
  assert.match(HTML, /<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">/);
});

test("SX-087 · versão: versao.json mais velho que o app em uso não oferece «atualizar» para trás", () => {
  assert.deepEqual(PWA.decidirVersao("20261025a", { versao: "20261016a" }), { acao: "nada" });
  assert.equal(PWA.decidirVersao("20261016a", { versao: "20261025a" }).acao, "nova");
  assert.equal(PWA.decidirVersao("20261025a", { versao: "20261025b" }).acao, "nova");
  assert.equal(PWA.decidirVersao("dev", { versao: "20261025a" }).acao, "nova", "fora do formato: compara como antes");
});

test("SX-094 · o app instalado reabre também numa subtela fixa (nunca id nem rota pública)", () => {
  assert.equal(PWA.rotaAoAbrirInstalado({ instalado: true, hash: "", ultima: "#/relatorios/vendas" }), "#/relatorios/vendas");
  assert.equal(PWA.rotaAoAbrirInstalado({ instalado: true, hash: "", ultima: "#/crm/negocio" }), "#/crm/negocio");
  assert.equal(PWA.rotaAoAbrirInstalado({ instalado: true, hash: "", ultima: "#/conversas/3f9a8b7c" }), null, "id não");
  assert.equal(PWA.rotaAoAbrirInstalado({ instalado: true, hash: "", ultima: "#/login/x" }), null);
});

/* ---------- comandos.js (SX-063…SX-065, SX-100, SX-102) ---------- */
test("SX-063 · paleta: a empresa cujo nome começa com o digitado vem primeiro", () => {
  const cs = [{ id: "a", nome: "Clínica Sorriso" }, { id: "b", nome: "Sorriso Centro" }, { id: "c", nome: "Atual" }];
  assert.deepEqual(C.empresasDaPaleta(cs, "sor", { atualId: "c" }).map(x => x.id), ["b", "a"]);
});
test("SX-064 · «Recentes» não guardam o título provisório da tela", () => {
  assert.equal(C.recenteDaRota({ modulo: "contatos", partes: ["abc"] }, "Carregando…"), null);
  assert.equal(C.recenteDaRota({ modulo: "contatos", partes: ["abc"] }, "…"), null);
  assert.equal(C.recenteDaRota({ modulo: "contatos", partes: ["abc"] }, "Ana Souza").titulo, "Ana Souza");
});
test("SX-065 · destaque marca todas as ocorrências", () => {
  assert.deepEqual(C.partesDeRealce("Ana Mariana", "ana").filter(p => p.marca).map(p => p.texto), ["Ana", "ana"]);
});
test("SX-100 · modo apresentação pela paleta", () => {
  const amb = { temCliente: true, apresentacao: false, rotaOk: () => true, pode: () => true, vocab: { novo: () => "Novo", vertical: "generico" } };
  const a = C.acoesPadrao(amb, { "modo-apresentacao": () => {} });
  assert.deepEqual(a.map(x => [x.id, x.rotulo]), [["modo-apresentacao", "Modo apresentação"]]);
  assert.equal(C.acoesPadrao({ ...amb, apresentacao: true }, { "modo-apresentacao": () => {} })[0].rotulo, "Sair do modo apresentação");
  assert.equal(C.acoesPadrao({ ...amb, temCliente: false }, { "modo-apresentacao": () => {} }).length, 0);
  assert.match(fnDoApp("function acoesDoShell() {"), /"modo-apresentacao": \(\) => alternarApresentacao\(\)/);
  assert.match(fnDoApp("function ambienteComandos() {"), /apresentacao: emApresentacao\(\)/);
});
test("SX-102 · busca ignora caracteres invisíveis de nome colado", () => {
  assert.equal(C.normalizar("A​na"), "ana");
  assert.ok(C.pontuar("ana", "A​na Souza") > 0);
});

/* ---------- app.js (SX-066…SX-069, SX-080, SX-097, SX-101) ---------- */
test("SX-066 + SX-067 + SX-080 · título da aba: neutro sem marca, «Anúncios» na revenda, sem o nome do cliente no modo apresentação", () => {
  const docF = { title: "", documentElement: { classList: { contains: c => c === "apresentacao" && docF.apres } }, apres: false };
  const roda = E => fnApp("function atualizarTitulo() {", { E, document: docF })();
  roda({ badges: {}, produto: "", workspace: null, titulo: "Ana", M: { rotas: ROTAS } });
  assert.equal(docF.title, "Ana · Painel");
  roda({ badges: { conversas: 3 }, produto: "Sorriso", workspace: "ads", titulo: "", M: { rotas: ROTAS } });
  assert.equal(docF.title, "(3) Anúncios · Sorriso");
  roda({ badges: {}, produto: "Órbita", workspace: "ads", titulo: "", M: { rotas: ROTAS } });
  assert.equal(docF.title, "Nexus Ads · Órbita", "a marca padrão continua");
  docF.apres = true;
  roda({ badges: {}, produto: "Sorriso", workspace: null, titulo: "Ana Souza", M: { rotas: ROTAS } });
  assert.equal(docF.title, "Sorriso");
  assert.match(fnDoApp("function alternarApresentacao(on = !emApresentacao()) {"), /atualizarTitulo\(\);/);
});

test("SX-068 + SX-069 + SX-101 · datas do sino: formato do Postgres, fuso curto e o dia da semana na última semana", () => {
  const isoSeguro = fnApp("function isoSeguro(iso) {");
  assert.equal(isoSeguro("2026-10-05 14:00:00+00"), "2026-10-05T14:00:00+00:00");
  assert.equal(isoSeguro("2026-10-05T14:00:00-03"), "2026-10-05T14:00:00-03:00");
  assert.equal(isoSeguro("2026-10-05"), "2026-10-05");
  const DIA_MS = 86400000;
  const rotuloDoDia = fnApp("function rotuloDoDia(iso, agora = new Date()) {", { E: { ui: U }, DIA_MS, isoSeguro });
  const agora = new Date("2026-10-25T15:00:00Z");   // domingo
  assert.equal(rotuloDoDia("2026-10-25 12:00:00+00", agora), "Hoje");
  assert.equal(rotuloDoDia("2026-10-24T15:00:00Z", agora), "Ontem");
  assert.equal(rotuloDoDia("2026-10-20T15:00:00Z", agora), "Terça-feira · 20/10");
  assert.equal(rotuloDoDia("2026-10-10T15:00:00Z", agora), "10/10/2026");
  const desdeQuando = fnApp("function desdeQuando(iso, agora = new Date()) {", { E: { ui: U }, isoSeguro });
  assert.equal(desdeQuando("2026-10-25 14:30:00+00", agora), "há 30 min");
});

test("SX-089 + SX-097 · e-mail de suporte chega à marca do app; sem WhatsApp o «Falar com o suporte» abre o e-mail", () => {
  assert.equal(T.marcaEfetiva({ suporte_email: " ajuda@revenda.test " }).suporte_email, "ajuda@revenda.test");
  assert.equal(T.marcaEfetiva({ suporte_email: "x" }).suporte_email, null);
  const loc = { href: "" };
  const E = { marca: { suporte_email: "ajuda@revenda.test" }, produto: "Sorriso", workspace: null, titulo: "Agenda", cliente: { nome: "Clínica" }, M: { rotas: ROTAS, comandos: C }, ui: U };
  fnApp("function falarComSuporte() {", { E, VERSAO: "v1", window: { open() { throw new Error("não deveria abrir"); } }, location: loc, navigator: {}, innerWidth: 390 })();
  assert.match(loc.href, /^mailto:ajuda@revenda\.test\?subject=Ajuda%20no%20Sorriso&body=Ol%C3%A1/);
  assert.match(fnDoApp("function ambienteComandos() {"), /suporte: !!\(E\.marca && \(E\.marca\.suporte_wa \|\| E\.marca\.suporte_email\)\)/);
});

test("SX-098 · a marca efetiva leva o que as telas leem da marca pública (teste aberto, prazo, links, boas-vindas), cada um no seu tipo", () => {
  const m = T.marcaEfetiva({ produto: "Sorriso", teste_aberto: true, dias_teste: 10, pedir_senha: true, termos_url: "https://r.test/t", privacidade_url: "javascript:x",
    retencao_dias: "30", boas_vindas: "  Oi!  ", demo_cliente_id: "11111111-2222-3333-4444-555555555555", entrar_codigo: "sim", inatividade_min: 0 });
  assert.equal(m.teste_aberto, true); assert.equal(m.dias_teste, 10); assert.equal(m.pedir_senha, true); assert.equal(m.termos_url, "https://r.test/t");
  assert.equal(m.privacidade_url, undefined, "link perigoso fica de fora");
  assert.equal(m.retencao_dias, 30); assert.equal(m.boas_vindas, "Oi!"); assert.equal(m.inatividade_min, 0);
  assert.equal(m.entrar_codigo, undefined, "sim/não só booleano");
  assert.equal(m.demo_cliente_id, "11111111-2222-3333-4444-555555555555");
  assert.equal(LOGIN.caminhoProspect(m, U.linkWhatsApp).href, "#/testar", "o «Testar grátis» aparece com a marca do app");
});

/* ---------- CSS (SX-070…SX-079) ---------- */
test("SX-070…SX-078 · acabamento do sistema no app.css", () => {
  const css = CSS_APP;
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.topo, \.barra, \.lateral[\s\S]*?backdrop-filter: none/);
  assert.match(css, /@media print \{\s*\.lateral, \.topo, \.barra, \.faixas, \.pular-regioes, \.toasts, \.palco, \.boot \{ display: none !important; \}/);
  assert.match(css, /input\[type=checkbox\], input\[type=radio\], input\[type=range\], progress \{ accent-color: var\(--c-prim\); \}/);
  assert.match(css, /input, textarea, \[contenteditable\] \{ caret-color: var\(--c-prim-luz\); \}/);
  assert.match(css, /\.menu-pop, \.flut, \.busca-res, \.toasts \{ overscroll-behavior: contain; \}/);
  assert.match(css, /\.bt, \.bt-icone, \.menu-item[^{]*\{ touch-action: manipulation; \}/);
  assert.match(css, /html \{ scrollbar-gutter: stable; \}/);
  assert.match(css, /\.toast p \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{\s*\/\* plano 2000d · SX-078[^*]*\*\/\s*\.campo input:not\(\[type=checkbox\]\)[^{]*\{ font-size: var\(--fs-16\); \}/);
  assert.match(css, /\.entrar-sugestao \{/); assert.match(css, /\.aviso-teste-poupado \{/);
});
test("SX-079 · contraste forçado: ponto da situação e passos com contorno", () => {
  assert.match(SHELL_CSS, /@media \(forced-colors: active\) \{\s*\.situacao-ponto \{ forced-color-adjust: none; border: 2px solid CanvasText; \}/);
});

/* ---------- api.js (SX-090…SX-092, SX-096) ---------- */
test("SX-090 · diagnóstico: o mesmo erro em rajada vira uma linha com a contagem", () => {
  A.limparErrosRecentes();
  const t0 = Date.parse("2026-10-25T12:00:00Z");
  for (let i = 0; i < 25; i++) A.guardarErroRecente({ codigo: "sem_conexao" }, "nx_pulso", t0 + i * 1000);
  A.guardarErroRecente({ codigo: "http_500", status: 500 }, "nx_inicio", t0 + 30_000);
  const l = A.errosRecentes();
  assert.equal(l.length, 2);
  assert.equal(l[0].vezes, 25);
  assert.equal(l[1].codigo, "http_500");
  A.guardarErroRecente({ codigo: "sem_conexao" }, "nx_pulso", t0 + 5 * 60_000);
  assert.equal(A.errosRecentes().length, 3, "depois de um outro erro, conta de novo");
  A.limparErrosRecentes();
});
test("SX-091 + SX-092 · relatório de erro uma vez por código e tela; evento só com valores simples", async () => {
  const corpos = [];
  const api = A.criarApi({ url: "https://x.test", chave: "k", token: () => "t", cliente: () => "c", fetch: async (u, init) => { corpos.push(JSON.parse(init.body)); return resp({}); } });
  assert.equal(await api.erroCliente({ codigo: "x", tela: "crm" }), true);
  assert.equal(await api.erroCliente({ codigo: "x", tela: "crm" }), false);
  assert.equal(await api.erroCliente({ codigo: "x", tela: "agenda" }), true);
  await api.evento("ver_plano", { origem: "paleta", dias: 3, ok: true, nome: "x".repeat(200), lista: [1], obj: { a: 1 } });
  assert.deepEqual(corpos[corpos.length - 1].p_dados, { origem: "paleta", dias: 3, ok: true });
  assert.deepEqual(A.dadosDoEvento(null), {});
});
test("SX-096 · 403, 408 e 413 com frase própria", () => {
  assert.match(A.mensagemErro({ codigo: "http_413" }), /grande demais/);
  assert.match(A.mensagemErro({ codigo: "http_403" }), /não é permitida/);
  assert.match(A.mensagemErro({ codigo: "http_408" }), /demorou demais/);
});

/* ---------- ui.js, tema.js, rotas.js, pulso.js, login.js (SX-082…SX-086, SX-088, SX-093, SX-095, SX-099, SX-103, SX-104) ---------- */
test("SX-082 + SX-088 · cor «fa0» sem #; imagem base64 com quebras de linha", () => {
  assert.equal(T.normalizarHex("fa0"), "#FFAA00");
  assert.equal(T.imagemSegura("data:image/png;base64,AAAA\nBBBB "), "data:image/png;base64,AAAABBBB");
  assert.equal(T.imagemSegura("data:image/svg+xml;base64,AA AA"), null);
});
test("SX-083 · nome curto da empresa pula «do/da/de»", () => {
  assert.equal(ROTAS.nomeCurtoEmpresa("Oficina do João"), "João");
  assert.equal(ROTAS.nomeCurtoEmpresa("Clínica da Ana"), "Ana");
  assert.equal(ROTAS.nomeCurtoEmpresa("Sorriso Vivo"), "Sorriso");
});
test("SX-084 · período no mesmo dia mostra a data uma vez", () => {
  assert.equal(U.periodoBR("2026-10-06T17:00:00Z", "2026-10-06T18:30:00Z"), "06/10/2026 14:00 — 15:30");
  assert.equal(U.periodoBR("2026-10-06T17:00:00Z", "2026-10-07T18:30:00Z"), "06/10/2026 14:00 — 07/10/2026 15:30");
});
test("SX-085 + SX-086 · o «0» de interurbano antes do DDD sai (na exibição e ao digitar)", () => {
  assert.equal(U.telBR("012998303030"), "(12) 99830-3030");
  assert.equal(U.formatarTelefone("012998303030"), "(12) 99830-3030");
  assert.equal(U.formatarTelefone("01"), "(01", "ainda digitando: espera o 3º dígito");
  assert.equal(U.formatarTelefone("0800"), "0800", "0800 continua");
});
test("SX-093 · horário silencioso aceita «8:00» e «20h»", () => {
  const s = { de: "20h", ate: "8:00" };
  assert.equal(P.emHorarioSilencioso(s, new Date(2026, 9, 25, 22, 0)), true);
  assert.equal(P.emHorarioSilencioso(s, new Date(2026, 9, 25, 7, 59)), true);
  assert.equal(P.emHorarioSilencioso(s, new Date(2026, 9, 25, 12, 0)), false);
});
test("SX-095 · menu: letras em sequência procuram o começo do nome", async () => {
  limparCorpo();
  const ancora = h("button", { type: "button" }, "Mais"); doc.body.appendChild(ancora);
  U.menu(ancora, [{ rotulo: "Arquivar", fn() {} }, { rotulo: "Cancelar", fn() {} }, { rotulo: "Copiar link", fn() {} }]);
  await esperar(5);
  const pop = doc.querySelector(".menu-pop");
  const bts = pop.querySelectorAll("button");
  ev(pop, "keydown", { key: "c" });
  assert.equal(doc.activeElement, bts[1]);
  ev(pop, "keydown", { key: "o" });
  assert.equal(doc.activeElement, bts[2], "«co» → Copiar link");
  doc.querySelector(".menu-pop button").click();
});
test("SX-099 + SX-103 + SX-104 · «Você quis dizer» também no teste e no convite; «mailto:» sai do e-mail; link do WhatsApp não estoura", async () => {
  limparCorpo();
  const c = LOGIN.campoEmailDoConvite(U, "");
  doc.body.appendChild(c);
  const inp = c.querySelector("input");
  inp.value = "ana@hotmial.com"; ev(inp, "blur");
  assert.equal(c.querySelector(".entrar-sugestao").hidden, false);
  const fixo = LOGIN.campoEmailDoConvite(U, "ana@x.test");
  assert.equal(fixo.querySelector(".entrar-sugestao"), null, "e-mail fixo do convite: sem sugestão");
  assert.match(LOGIN_TXT, /ligarSugestaoEmail\(ui, form\.querySelector\("input\[name=email\]"\)\);   \/\/ plano 2000d · SX-099/);
  assert.equal(LOGIN.normalizarEmail("mailto:Ana@X.com"), "ana@x.com");
  const link = U.linkWhatsApp("x".repeat(5000), "5512999998888");
  assert.ok(decodeURIComponent(link.split("text=")[1]).length <= 1500);
});

test("SX-105 · dono_mudou (conversa assumida por outra pessoa) tem frase em português", () => {
  const msg = A.mensagemErro({ codigo: "dono_mudou", status: 409, detalhe: "Ana" });
  assert.match(msg, /outra pessoa|assumiu/i);
  assert.doesNotMatch(msg, /dono_mudou/);
});
test("SX-105 · dono_mudou com o nome de quem assumiu no hint", () => {
  assert.match(A.mensagemErro({ codigo: "dono_mudou", hint: "Ana" }), /^Ana assumiu esta conversa/);
  assert.match(A.mensagemErro({ codigo: "dono_mudou", hint: "  " }), /^Outra pessoa assumiu/);
});
test("SX-106 · o precache leva ../demo.js (semana de exemplo da Agenda abre offline)", () => {
  assert.match(APP_JS, /const ARQUIVOS_DA_RAIZ = \[[^\]]*"demo\.js"[^\]]*\]; \/\/ plano 2000d · SX-106/);
});
