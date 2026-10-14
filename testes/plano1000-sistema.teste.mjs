/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026) · frente sis (sistema e casca), lote sis-1
   node --test testes/plano1000-sistema.teste.mjs
   Testes de COMPORTAMENTO (o mesmo DOM de mentira do plano100-sistema) dos itens do lote sis-1 e dos pedidos das outras frentes
   (acaoComDesfazer com `acao`, guarda de rota, limpeza por conta no logout, cache de nx_cv_base, dica do funil, i-pino, busca-dica,
   criador global de contato, ctx.moverNegocio, tema automático, ARQUIVOS_DO_APP, sinal de cancelamento em api.fn).
   O app.js não é importável (roda iniciar() ao carregar): o que é dele roda função a função (fnApp) ou entra por regex no texto-fonte.
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

/* ============================================================ ui.js ============================================================ */
test("AS-210 · ui.modal: o X do cabeçalho com texto digitado pergunta «Descartar?» (como o Esc); sem texto fecha", async () => {
  limparCorpo();
  const abrir = () => {
    const p = U.modal({ titulo: "Nova resposta", corpo: U.campo({ rotulo: "Texto", nome: "texto" }), acoes: [{ rotulo: "Salvar", tipo: "primario" }] });
    const dlg = [...doc.body.querySelectorAll("dialog")].pop();
    dlg.showModal = () => {}; dlg.close = () => {};
    return { p, dlg, input: dlg.querySelector("input[name=texto]"), faixa: dlg.querySelector(".protege-faixa"), x: dlg.querySelector(".modal-x") };
  };
  HTMLDialog();
  let m = abrir(); await esperar(5);
  m.input.value = "Bom dia!"; ev(m.input, "input");
  m.x.click();
  assert.equal(m.faixa.hidden, false, "texto digitado: a faixa «Descartar o que você digitou?» aparece");
  let fechou = false; m.p.then(() => { fechou = true; }); await tick(); assert.equal(fechou, false, "o X não fechou");
  m.faixa.querySelectorAll("button")[1].click(); assert.equal(await m.p, null);
  m = abrir(); await esperar(5); m.x.click(); assert.equal(await m.p, null, "sem texto o X fecha direto");
  await esperar(200);
});
/** o DOM de mentira não tem showModal/close: o modal os chama logo ao abrir */
function HTMLDialog() {
  const criar = doc.createElement;
  if (criar.__dlg) return;
  doc.createElement = t => { const el = criar(t); if (t === "dialog") { el.showModal = () => { el.open = true; }; el.close = () => { el.open = false; }; } return el; };
  doc.createElement.__dlg = true;
}

test("pedido da Agenda · ui.acaoComDesfazer({acao}): o aviso ganha o 2º botão; tocar nele mantém (firma) e roda acao.fn", async () => {
  limparCorpo();
  let firmou = 0, avisou = 0;
  const p = U.acaoComDesfazer({ texto: "Consulta remarcada.", aplicar: () => {}, reverter: () => {}, firmar: () => { firmou++; }, ms: 60000,
    acao: { rotulo: "Avisar paciente", fn: () => { avisou++; } } });
  await tick();
  const t = [...doc.querySelectorAll(".toast")].pop();
  const botoes = t.querySelectorAll(".toast-acao").map(b => b.textContent);
  assert.deepEqual(botoes, ["Desfazer", "Avisar paciente"]);
  t.querySelectorAll(".toast-acao")[1].click();
  const r = await p;
  assert.equal(r.estado, "mantida"); assert.equal(firmou, 1, "a ação adiada foi firmada"); assert.equal(avisou, 1, "e o botão extra rodou");
  // sem `acao` (ou com acao inválida) nada muda
  const p2 = U.acaoComDesfazer({ texto: "x", aplicar() {}, reverter() {}, ms: 60000, acao: { rotulo: "", fn() {} } }); await tick();
  const t2 = [...doc.querySelectorAll(".toast")].pop(); assert.equal(t2.querySelectorAll(".toast-acao").length, 1);
  t2.querySelector(".toast-x").click(); await p2;
});

test("AS-211 · ui.toast: o foco do teclado dentro do aviso para o relógio (e o mouse também); erro dura 12 s", async () => {
  limparCorpo();
  const t = U.toast("Falhou ao salvar.", { tipo: "erro", ms: 40 });
  const bt = t.el.querySelector(".toast-x");
  ev(t.el, "focusin", { target: bt });
  await esperar(80);
  assert.ok(t.el.isConnected && !t.el.classList.contains("saindo"), "com o foco dentro, o aviso não some sozinho");
  ev(t.el, "focusout", { relatedTarget: null });
  assert.match(UI_TXT, /const dur = ms \?\? \(tipo === "erro" \? 12000 :/, "erro: 12 s por padrão");
  t.fechar();
});

test("AS-212 · ui.confirmar: lixeira só em exclusão; perigo com outro rótulo leva alerta; `icone` explícito vence (pedido «Sair de todos os aparelhos»)", async () => {
  assert.equal(U.iconeDoPerigo(undefined), "lixeira", "o «Excluir» padrão");
  assert.equal(U.iconeDoPerigo("Excluir contato"), "lixeira");
  assert.equal(U.iconeDoPerigo("Remover acesso"), "lixeira");
  assert.equal(U.iconeDoPerigo("Pausar cliente"), "alerta");
  assert.equal(U.iconeDoPerigo("Sair sem salvar"), "alerta");
  assert.equal(U.iconeDoPerigo("Sair de todos os aparelhos", "sair"), "sair");
  limparCorpo(); HTMLDialog();
  const p = U.confirmar({ titulo: "Pausar?", perigo: true, rotulo: "Pausar cliente" });
  const dlg = [...doc.body.querySelectorAll("dialog")].pop();
  const use = dlg.querySelector(".modal-rod button[data-tipo=perigo] use");
  assert.equal(use.getAttribute("href"), "#i-alerta");
  dlg.querySelector(".modal-rod button").click(); assert.equal(await p, false);
  await esperar(200);
});

test("AS-214 · ui.segmentado: opções cortadas pela largura marcam o lado que continua (data-corte) e o CSS esmaece a borda", () => {
  const s = U.segmentado({ opcoes: ["Clientes", "Revendas", "Planos", "Domínios"].map(r => ({ valor: r, rotulo: r })), valor: "Clientes" });
  s.clientWidth = 300; s.scrollWidth = 520; s.scrollLeft = 0;
  assert.equal(s.bordas(), "dir"); assert.equal(s.dataset.corte, "dir");
  s.scrollLeft = 100; assert.equal(s.bordas(), "ambos");
  s.scrollLeft = 220; assert.equal(s.bordas(), "esq");
  s.scrollWidth = 300; s.scrollLeft = 0; assert.equal(s.bordas(), ""); assert.equal(s.dataset.corte, undefined);
  for (const v of ["dir", "esq", "ambos"]) assert.match(CSS_APP, new RegExp(`\\.seg\\[data-corte="${v}"\\] \\{ -webkit-mask-image`));
});

test("AS-194 · ui.campo senha: «Caps Lock ligado» aparece com a tecla travada e some ao sair do campo", () => {
  const c = U.campo({ rotulo: "Senha", nome: "senha", tipo: "senha" });
  const inp = c.querySelector("input"), aviso = c.querySelector(".campo-caps");
  assert.ok(aviso && aviso.hidden, "começa escondido");
  ev(inp, "keydown", { getModifierState: k => k === "CapsLock" }); assert.equal(aviso.hidden, false);
  ev(inp, "keyup", { getModifierState: () => false }); assert.equal(aviso.hidden, true);
  ev(inp, "keydown", { getModifierState: k => k === "CapsLock" }); ev(inp, "blur"); assert.equal(aviso.hidden, true);
  assert.equal(U.campo({ rotulo: "Nome", nome: "nome" }).querySelector(".campo-caps"), null, "só em senha");
});

test("AS-215 · ui.tabela com aoClicar: linha focável (tabindex 0), Enter e Espaço abrem; tecla dentro de um botão da linha não", () => {
  const abertos = [];
  const t = U.tabela({ colunas: [{ chave: "nome", rotulo: "Nome" }, { chave: "x", rotulo: "Ação", render: () => h("button", { type: "button" }, "Editar") }], linhas: [{ id: 1, nome: "Ana" }], aoClicar: l => abertos.push(l.id) });
  const tr = t.el.querySelector("tbody tr");
  assert.equal(tr.getAttribute("tabindex"), "0");
  assert.ok(t.el.querySelector("table").classList.contains("tabela-clicavel"));
  const enter = new Evento("keydown", { key: "Enter" }); tr.dispatchEvent(enter); assert.ok(enter.defaultPrevented);
  ev(tr, "keydown", { key: " " });
  ev(tr.querySelector("button"), "keydown", { key: "Enter" });
  assert.deepEqual(abertos, [1, 1], "Enter e Espaço na própria linha; o botão interno é dele");
  assert.match(CSS_APP, /\.tabela-clicavel/);
});

test("AS-296 · ui.configurar({suprimirToast}): com a faixa de conexão à vista o erro de rede não vira toast; desfazer e fixos nunca são calados", () => {
  limparCorpo();
  U.configurar({ suprimirToast: (texto, { tipo }) => tipo === "erro" && /Sem internet/.test(texto) });
  try {
    const t = U.toast("Sem internet: nada foi salvo.", { tipo: "erro" });
    assert.equal(t.suprimido, true); assert.equal(doc.querySelectorAll(".toast:not([hidden])").length, 0);
    const outro = U.toast("Esse telefone já existe.", { tipo: "erro" }); assert.ok(!outro.suprimido); outro.fechar();
  } finally { U.configurar({ suprimirToast: null }); }
  const f = fnApp("function toastRepetidoDeRede(", { E: { rede: { estado: "offline" }, M: { api: A, ui: U } }, RE_ESTADO_FALHA: /^(offline|servidor_fora)$/, frasesDeRede: null }, "toastRepetidoDeRede");
  assert.equal(f(A.mensagemErro({ codigo: "sem_conexao", contexto: { leitura: true } }), { tipo: "erro" }), true);
  assert.equal(f("Não foi possível concluir. Sem internet: nada foi salvo.", { tipo: "erro" }), true, "frase embutida (acaoComDesfazer) também");
  assert.equal(f("Esse telefone já existe.", { tipo: "erro" }), false);
  const online = fnApp("function toastRepetidoDeRede(", { E: { rede: { estado: "online" }, M: { api: A, ui: U } }, RE_ESTADO_FALHA: /^(offline|servidor_fora)$/, frasesDeRede: null }, "toastRepetidoDeRede");
  assert.equal(online(A.mensagemErro({ codigo: "sem_conexao", contexto: { leitura: true } }), { tipo: "erro" }), false, "sem a faixa, o toast sai");
  assert.match(APP_JS, /ui\.configurar\(\{ mensagemErro: api\.mensagemErro, suprimirToast: toastRepetidoDeRede \}\);/);
});

/* ============================================================ api.js ============================================================ */
test("AS-181 · api.ehLeitura: execuções/dia, uso de IA/dia, onboarding e clientes do Admin são leituras (offline não dizem «nada foi salvo»)", () => {
  for (const n of ["nx_automacao_execucoes_dia", "nx_ia_uso_dia", "nx_onboarding_estado", "nx_clientes_admin"]) assert.equal(A.ehLeitura(n), true, n);
  for (const n of ["nx_negocio_salvar", "nx_cliente_salvar", "nx_onboarding_marcar"]) assert.equal(A.ehLeitura(n), false, n);
  assert.equal(A.mensagemErro({ codigo: "sem_conexao", contexto: { leitura: A.ehLeitura("nx_clientes_admin") } }), "Sem internet. Confira a conexão e tente de novo.");
});

test("AS-182 · api.fn: nx-codewords:estado e nx-enviar:testar_canal são consultas (offline: «Sem internet. Confira…»); o resto continua escrita", async () => {
  assert.equal(A.fnLeitura("nx-codewords", { acao: "estado" }), true);
  assert.equal(A.fnLeitura("nx-enviar", { acao: "testar_canal" }), true);
  assert.equal(A.fnLeitura("nx-enviar", { acao: "texto" }), false);
  assert.equal(A.fnLeitura("nx-ia", { acao: "x" }, { leitura: true }), true, "quem chama pode dizer que é consulta");
  const api = A.criarApi({ url: "http://x", chave: "pub", token: () => "t", cliente: () => "c", contexto: true, online: () => false, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(api.fn("nx-codewords", { acao: "estado", canal: 1 }), e => A.mensagemErro(e) === "Sem internet. Confira a conexão e tente de novo.");
  await assert.rejects(api.fn("nx-enviar", { acao: "texto" }), e => A.mensagemErro(e) === "Sem internet: nada foi salvo.");
});

test("AS-255 · api.mensagemErro: código desconhecido sem o código cru para quem não é da plataforma; a conta super vê o código", () => {
  assert.equal(A.mensagemErro({ codigo: "xyz_novo" }), "Não deu certo agora. Tente de novo em instantes; se continuar, fale com o suporte.");
  A.mostrarCodigoTecnico(true);
  try { assert.equal(A.mensagemErro({ codigo: "xyz_novo" }), "Não deu certo agora (xyz_novo). Tente de novo em instantes."); } finally { A.mostrarCodigoTecnico(false); }
  assert.match(fnDoApp("async function adotarSessao("), /E\.M\.api\.mostrarCodigoTecnico\(!!\(s\.conta && s\.conta\.super\)\)/);
});

test("pedido de Automações (k) · api.fn({sinal}): «Parar de esperar» cancela o pedido na hora — erro «cancelado», sem repetir e sem mexer no estado da conexão", async () => {
  const relatos = [];
  let chamadas = 0;
  const fetch = (url, init) => { chamadas++; return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))); };
  const api = A.criarApi({ url: "http://x", chave: "pub", token: () => "t", cliente: () => "c", fetch, retentar: true, rede: { sucesso: () => relatos.push("ok"), falha: i => relatos.push(i.codigo), lento() {} } });
  const ctl = new AbortController();
  const p = api.fn("nx-ia", { acao: "montar_automacao" }, { sinal: ctl.signal });
  await tick(); ctl.abort();
  await assert.rejects(p, e => e.codigo === "cancelado");
  assert.equal(chamadas, 1); assert.deepEqual(relatos, [], "cancelar não é «sem internet» nem «servidor fora»");
  assert.equal(A.mensagemErro({ codigo: "cancelado" }), "Pedido cancelado.");
  // sinal já cancelado antes de sair
  const ja = new AbortController(); ja.abort();
  await assert.rejects(api.fn("nx-ia", { acao: "x" }, { sinal: ja.signal }), e => e.codigo === "cancelado");
});

/* ============================================================ cache.js ============================================================ */
test("pedido de Conversas (d) · cache: nx_cv_base entra SÓ reduzido (sem config, token, telefone ou campo novo) para Conversas abrir offline", async () => {
  assert.equal(CACHE.cacheavel("nx_cv_base"), true);
  assert.equal(CACHE.cacheavel("nx_cv_ver"), false); assert.equal(CACHE.cacheavel("nx_cv_mensagens"), false);
  const base = { eu: { id: "u1", nome: "Ana", papel: "admin", email: "ana@x.com" },
    canais: [{ id: "k1", nome: "Recepção", provedor: "meta", estado: "conectado", token: "SEGREDO", telefone: "5512999990000", waba_id: "w" }],
    departamentos: [{ id: "d1", nome: "Recepção", cor: "#7FD1A5", padrao: true, msg_fora_horario: "texto interno", horario: {} }],
    respostas: [{ id: 1, atalho: "/oi", titulo: "Oi", texto: "Olá!" }], etiquetas: [{ id: 1, nome: "VIP", cor: "#000000" }],
    usuarios: [{ id: "u2", nome: "Beto", email: "beto@x.com", telefone: "12999" }], templates: [{ id: "t1", nome: "lembrete", corpo: "Oi {{1}}", status: "APPROVED" }],
    cfg: { recibo_leitura: true, assinatura: false, segredo: 1 }, ia: { ligada: true, cota: { usadas: 3, limite: 300 }, prompt: "x" },
    config: { departamentos: [], ia: { prompt: "PROMPT INTERNO", memoria: "MEMÓRIA" } }, campo_novo: "?" };
  const r = CACHE.reduzir("nx_cv_base", base);
  const txt = JSON.stringify(r);
  for (const proibido of ["SEGREDO", "PROMPT INTERNO", "MEMÓRIA", "ana@x.com", "beto@x.com", "5512999990000", "texto interno", "campo_novo", "waba_id", "\"segredo\""]) assert.ok(!txt.includes(proibido), proibido);
  assert.equal(r.config, undefined); assert.equal(r.reduzido, true);
  assert.deepEqual(r.canais[0], { id: "k1", nome: "Recepção", provedor: "meta", estado: "conectado" });
  assert.deepEqual(r.ia, { ligada: true, cota: { usadas: 3, limite: 300 } });
  assert.equal(r.respostas[0].texto, "Olá!");
  const c = CACHE.criarCache({ armazem: null, varrer: false });
  assert.equal(await c.gravar("k", "nx_cv_base", base), true);
  const lido = await c.ler("k"); assert.equal(lido.dados.config, undefined, "o que fica guardado é o recorte");
});

test("pedido de Anúncios (d) · cache: teto por nome (nx_dados até 4 MB, relatórios 2 MB) e nunca mais que 1/4 do total; o padrão segue 1 MB", async () => {
  assert.equal(CACHE.tetoDaEntrada("nx_inicio"), CACHE.TETO_ENTRADA_BYTES);
  assert.equal(CACHE.tetoDaEntrada("nx_dados"), 4 * 1024 * 1024);
  assert.ok(CACHE.tetoDaEntrada("nx_dados") <= CACHE.TETO_TOTAL_BYTES / 4);
  const c = CACHE.criarCache({ armazem: null, varrer: false });
  const grande = { linhas: "x".repeat(900 * 1024) };   // ~1,8 MB em UTF-16
  assert.equal(await c.gravar("a", "nx_dados", grande), true, "Anúncios cabe");
  assert.equal(await c.gravar("b", "nx_inicio", grande), false, "o Início continua no teto de 1 MB");
  assert.equal(await c.gravar("c", "nx_dados", { linhas: "x".repeat(2200 * 1024) }), false, "acima de 4 MB nem Anúncios");
});

test("AS-185 · cache em aparelho compartilhado: disco desligado (só memória) e desligarDisco() apaga o que já estava no IndexedDB", async () => {
  const gravados = []; let limpou = 0;
  const arm = { ler: async () => null, gravar: async (k) => { gravados.push(k); }, apagar: async () => {}, limpar: async () => { limpou++; }, listar: async () => [] };
  const semDisco = CACHE.criarCache({ armazem: arm, disco: false, varrer: false });
  await semDisco.gravar("k", "nx_contatos_listar", { itens: [] });
  assert.deepEqual(gravados, [], "nada vai para o disco"); assert.equal(semDisco.emDisco, false); assert.ok(await semDisco.ler("k"), "a memória da aba serve a tela");
  const c = CACHE.criarCache({ armazem: arm, varrer: false });
  await c.gravar("k1", "nx_contatos_listar", { itens: [] }); assert.deepEqual(gravados, ["k1"]);
  await c.desligarDisco(); assert.equal(limpou, 1); assert.equal(c.emDisco, false);
  await c.gravar("k2", "nx_contatos_listar", { itens: [] }); assert.deepEqual(gravados, ["k1"], "depois de desligar, nada mais vai ao disco");
  // o login oferece «Lembrar neste aparelho»; o shell guarda a escolha e cria o cache sem disco
  assert.match(APP_JS, /E\.cache = E\.M\.cache\.criarCache\(aparelhoCompartilhado\(\) \? \{ disco: false \} : \{\}\);/);
  assert.match(fnDoApp("function definirAparelhoCompartilhado(sim) {"), /E\.cache\.desligarDisco\(\)/);
  assert.match(LOGIN_TXT, /ui\.campo\(\{ rotulo: "Lembrar neste aparelho", nome: "lembrar", tipo: "checkbox"/);
  assert.match(LOGIN_TXT, /await ctx\.aoEntrar\(r\.token, lembrar \? \{ compartilhado: d\.lembrar === false \} : \{\}\);/);
});

/* ============================================================ pulso.js ============================================================ */
test("AS-188 · pulso: escondida 15 s nas primeiras 2 h; depois 60 s se o aviso de área de trabalho estiver desligado; com ele, 15 s sempre", () => {
  const criar = avisoTela => {
    const rel = relogioP1000();
    const docX = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
    const p = P.criarPulso({ ler: async () => ({}), agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, aleatorio: () => .5, avisoTela,
      doc: docX, nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} } });
    return { p, rel };
  };
  const a = criar(() => false);
  assert.equal(a.p.estado.intervalo, P.INTERVALOS.escondida, "acabou de esconder: 15 s");
  a.rel.pular(P.ESCONDIDA_LONGA_MS - 1000); assert.equal(a.p.estado.intervalo, 15000);
  a.rel.pular(2000); assert.equal(a.p.estado.intervalo, 60000, "esquecida há mais de 2 h: 60 s");
  const b = criar(() => true); b.rel.pular(P.ESCONDIDA_LONGA_MS + 1); b.p.estado; b.rel.pular(P.ESCONDIDA_LONGA_MS + 1);
  assert.equal(b.p.estado.intervalo, 15000, "quem quer o aviso de área de trabalho continua a 15 s (decisão A2)");
  assert.match(APP_JS, /avisoTela: \(\) => lerAvisosConversas\(\)\.tela,/);
});

/* ============================================================ sw.js ============================================================ */
test("AS-204 · sw.js: página offline com lang, claro/escuro do aparelho (cores do sistema, sem hex) e «Tentar de novo» de 44 px", () => {
  const m = /const PAGINA_OFFLINE = ([\s\S]*?);\n/.exec(SW_TXT);
  const pagina = runInNewContext(m[1]);
  assert.match(pagina, /<html lang="pt-BR">/);
  assert.match(pagina, /<meta name="color-scheme" content="light dark">/);
  assert.match(pagina, /background:Canvas;color:CanvasText/);
  assert.match(pagina, /min-height:44px;min-width:44px/);
  assert.doesNotMatch(pagina, /#[0-9a-fA-F]{3,8}\b/);
});

test("AS-208 · sw.js: o precache baixa 4 arquivos por vez (nunca 1 a 1, nunca todos juntos)", async () => {
  let emVoo = 0, pico = 0;
  const m = criarMundoSW({ versao: "V9", tetoTimeout: 2000, resposta: async url => { emVoo++; pico = Math.max(pico, emVoo); await esperar(8); emVoo--; return new Response("ok:" + url, { status: 200 }); } });
  const urls = Array.from({ length: 12 }, (_, i) => `${m.site}/app/m${i}.js?v=V9`);
  const e = m.evento({ data: { tipo: "precache", urls } }); m.ouvintes.message(e); await e.fim();
  assert.equal(pico, 4);
  assert.equal((await (await m.cachesFalso.open("orbita-shell-V9")).keys()).length, 12, "todos guardados");
});

/* ============================================================ pwa.js ============================================================ */
test("AS-205 · pwa: versao.json com `notas` (até 3 linhas) mostra «o que mudou»; «Depois» tira a faixa até a próxima verificação", async () => {
  assert.deepEqual(PWA.notasDaVersao({ notas: [" Agenda mais rápida ", "", 3, "Sino com filtro", "Busca nova", "quarta"] }), ["Agenda mais rápida", "Sino com filtro", "Busca nova"]);
  assert.deepEqual(PWA.notasDaVersao({ notas: "uma só" }), ["uma só"]); assert.deepEqual(PWA.notasDaVersao({}), []);
  assert.deepEqual(PWA.decidirVersao("A", { versao: "B", notas: ["x"] }), { acao: "nova", versao: "B", notas: ["x"] });
  const prontas = [];
  const v = PWA.criarVersao({ versao: "A", buscar: async () => ({ versao: "B", notas: ["Agenda mais rápida"] }), aoPronta: p => prontas.push(p) });
  await v.verificar(); assert.deepEqual(prontas, [{ motivo: "versao", versao: "B", notas: ["Agenda mais rápida"] }]);
  await v.verificar(); assert.equal(prontas.length, 1, "não repete enquanto a faixa está à vista");
  v.dispensar(); assert.equal(v.dispensada, true);
  await v.verificar(); assert.equal(prontas.length, 2, "dispensada: volta na próxima verificação"); assert.equal(v.dispensada, false);
  // a faixa: notas em lista e «Depois» depois do «Atualizar»
  let depois = 0;
  const f = PWA.criarFaixaVersao(U, "Órbita", () => {}, { notas: ["Agenda mais rápida"], aoDepois: () => { depois++; } });
  assert.deepEqual(f.querySelectorAll("button").map(b => b.textContent), ["Atualizar", "Depois"]);
  assert.equal(f.querySelector(".faixa-versao-notas li").textContent, "Agenda mais rápida");
  f.querySelectorAll("button")[1].click(); assert.equal(depois, 1);
  assert.equal(PWA.criarFaixaVersao(U, "Órbita", () => {}).querySelectorAll("button").length, 1, "sem aoDepois: só «Atualizar» (como antes)");
});

test("AS-206 · pwa.ocupadoNaTela: menu, sino/flutuante, diálogo ou foco num campo de texto seguram a atualização automática", () => {
  limparCorpo();
  assert.equal(PWA.ocupadoNaTela(doc), false);
  const flut = h("div", { class: "flut" }); doc.body.appendChild(flut); assert.equal(PWA.ocupadoNaTela(doc), true, "sino aberto"); flut.remove();
  const menu = h("div", { class: "menu-pop" }); doc.body.appendChild(menu); assert.equal(PWA.ocupadoNaTela(doc), true, "menu aberto"); menu.remove();
  const campo = h("textarea"); doc.body.appendChild(campo); campo.focus(); assert.equal(PWA.ocupadoNaTela(doc), true, "foco num campo");
  const caixa = h("input", { type: "checkbox" }); doc.body.appendChild(caixa); caixa.focus(); assert.equal(PWA.ocupadoNaTela(doc), false, "caixa de marcar não conta");
  doc.body.focus();
  assert.equal(PWA.ocupadoNaTela(null), false);
});

test("AS-207 · pwa: voltar à aba ou reconectar confere o versao.json no máximo 1 vez por minuto (o relógio de 10 min continua)", async () => {
  let t = 0, buscas = 0;
  const v = PWA.criarVersao({ versao: "A", agora: () => t, buscar: async () => { buscas++; return { versao: "A" }; } });
  await v.verificar({ seNaoRecente: true }); await v.verificar({ seNaoRecente: true });
  assert.equal(buscas, 1, "duas trocas de aba seguidas: uma consulta");
  t += 59_000; await v.verificar({ seNaoRecente: true }); assert.equal(buscas, 1);
  t += 2_000; await v.verificar({ seNaoRecente: true }); assert.equal(buscas, 2, "passou de 1 min: consulta");
  await v.verificar(); assert.equal(buscas, 3, "o relógio de 10 min não é limitado");
  assert.equal(PWA.VERIFICAR_NO_MINIMO_MS, 60_000);
});

test("AS-295 · pwa: depois do desligamento de emergência (sw:false) a página que volta explica a recarga, uma vez", () => {
  const guardado = new Map([["nx-sw-aviso", "1"]]);
  const toasts = [];
  const ui = { h, icone: U.icone, anunciar() {}, toast: (t, o) => toasts.push([t, o && o.tipo]) };
  const p = PWA.iniciar({ versao: "V", ui, alvo: h("div"), nav: {}, doc: { addEventListener() {}, removeEventListener() {}, querySelector: () => null }, janela: { addEventListener() {}, removeEventListener() {} },
    loc: { href: "http://x/app/", search: "", hostname: "x", protocol: "https:" }, storage: { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: k => guardado.delete(k) },
    fetchFn: async () => ({ ok: false }) });
  try {
    assert.deepEqual(toasts, [["Atualizamos o app para corrigir um problema. Pode continuar de onde parou.", "info"]]);
    assert.equal(guardado.has("nx-sw-aviso"), false, "uma vez só");
  } finally { p.destruir(); }
  assert.match(ler("pwa.js"), /gravar\(CHAVE_SW_DESLIGADO, 1\);\s*gravar\(CHAVE_SW_AVISO, 1\);/);
});

test("AS-177 · precache por aparelho: só as telas que a pessoa pode abrir; economia de dados manda só o que a página já usou; espera o ocioso", () => {
  const ARQ = runInNewContext(`${constDoApp("ARQUIVOS_DO_APP")}\nARQUIVOS_DO_APP`);
  const deps = { navigator: {}, E: { sessao: { conta: {} }, M: { rotas: { acessoRota: m => (["conversas", "crm", "agenda"].includes(m) ? "ok" : "sem_acesso") } } },
    opcoesAcesso: () => ({}), ARQUIVOS_DO_APP: ARQ, ARQUIVOS_DA_RAIZ: ["dados.js", "nucleo.js"], urlArq: n => n, urlArqRaiz: n => "../" + n, urlsPrecache: () => ["tudo"],
    ARQUIVOS_POR_TELA: runInNewContext(`${constDoApp("ARQUIVOS_POR_TELA")}\nARQUIVOS_POR_TELA`, { Object }), RAIZ_POR_TELA: { anuncios: ["nucleo.js"] } };
  const urls = fnApp("function urlsPrecacheDoAparelho() {", deps)();
  for (const f of ["admin.js", "auto-editor.js", "automacoes.css", "anuncios.js", "../nucleo.js"]) assert.ok(!urls.includes(f), `atendente não baixa ${f}`);
  for (const f of ["conversas.js", "cv-chat.js", "crm-kanban.js", "agenda.js", "ui.js", "config.js", "cv-config.js", "../dados.js"]) assert.ok(urls.includes(f), `${f} vai`);
  for (const lista of Object.values(deps.ARQUIVOS_POR_TELA)) for (const f of lista) assert.ok(ARQ.includes(f), `${f} existe em ARQUIVOS_DO_APP`);
  assert.deepEqual(fnApp("function urlsPrecacheDoAparelho() {", { ...deps, navigator: { connection: { saveData: true } } })(), [], "economia de dados");
  assert.match(APP_JS, /urlsPrecache: urlsPrecacheDoAparelho \}\);/);
  assert.match(ler("pwa.js"), /nav\.serviceWorker\.ready\.then\(\(\) => quandoOcioso\(jan, \(\) => api\.precache\(\)\)\)/);
  let chamado = null; PWA.quandoOcioso({ requestIdleCallback: (fn, o) => { chamado = o; fn(); } }, () => {}); assert.deepEqual(chamado, { timeout: 5000 });
});

/* ============================================================ login.js ============================================================ */
test("AS-202/291/195/203 · login: régua e pílulas só na marca padrão; e-mail aparado e minúsculo; «ana@» não vai ao servidor; sem foco automático no toque", async () => {
  assert.equal(LOGIN.marcaPadrao({ produto: "Órbita" }), true); assert.equal(LOGIN.marcaPadrao({}), true); assert.equal(LOGIN.marcaPadrao({ produto: "Clínica Max" }), false);
  assert.equal(LOGIN.normalizarEmail("  Ana@X.com "), "ana@x.com");
  assert.equal(LOGIN.emailValido("ana@"), false); assert.equal(LOGIN.emailValido("ana@x.com"), true);
  limparCorpo();
  const alvo = h("div"); doc.body.appendChild(alvo);
  const chamadas = [];
  const api = { publica: async (nome, p) => { chamadas.push(p); return { token: "t" }; }, mensagemErro: A.mensagemErro, minutosDoHint: A.minutosDoHint };
  const entradas = [];
  await LOGIN.montar({ alvo, rota: { modulo: "login", partes: [], query: {} }, ui: U, api, marca: { produto: "Clínica Max" }, produtoAberto: null, titulo() {}, aparelhoCompartilhado: () => false, aoEntrar: async (t, o) => { entradas.push(o); } });
  assert.equal(alvo.querySelector(".entrar-regua"), null, "revenda: sem «Anúncio · Conversa · Venda»"); assert.equal(alvo.querySelector(".entrar-pontos"), null);
  const form = alvo.querySelector("form.entrar-form"), email = form.querySelector("input[name=email]"), senha = form.querySelector("input[name=senha]");
  email.value = "ana@"; senha.value = "12345678"; ev(form, "submit"); await tick(4);
  assert.equal(chamadas.length, 0, "e-mail incompleto: nenhuma tentativa gasta");
  assert.match(form.querySelector("[data-campo=email] .campo-erro").textContent, /Confira o e-mail/);
  email.value = "  Ana@X.com "; ev(form, "submit"); await tick(6);
  assert.deepEqual(chamadas, [{ p_email: "ana@x.com", p_senha: "12345678" }]);
  assert.deepEqual(entradas, [{ compartilhado: false }], "«Lembrar neste aparelho» marcado por padrão");
  LOGIN.desmontar();
  limparCorpo(); const alvo2 = h("div"); doc.body.appendChild(alvo2);
  await LOGIN.montar({ alvo: alvo2, rota: { modulo: "login", partes: [], query: {} }, ui: U, api, marca: { produto: "Órbita" }, produtoAberto: null, titulo() {}, aoEntrar: async () => {} });
  assert.ok(alvo2.querySelector(".entrar-regua") && alvo2.querySelector(".entrar-pontos"), "marca padrão continua com a régua");
  assert.equal(alvo2.querySelector("input[name=lembrar]"), null, "sem o recurso do shell, sem a caixa");
  LOGIN.desmontar();
  assert.match(LOGIN_TXT, /function focarDepois\(ctx, seletor\) \{\s*if \(toque\(\)\) return;/, "AS-203: no toque o teclado não abre sozinho");
  assert.doesNotMatch(LOGIN_TXT, /setTimeout\(\(\) => \{ const i = ctx\.alvo\.querySelector/, "nenhuma tela foca por conta própria");
});

test("AS-201 · «Esqueci a senha» sem WhatsApp de suporte aponta quem fornece o sistema (o único administrador não fica sem saída)", () => {
  assert.deepEqual(LOGIN.textosEsqueci({}, { suporte_wa: "55" }), ["Peça ao administrador da sua empresa um link para criar uma senha nova."]);
  const sem = LOGIN.textosEsqueci({ marcaPublica: { org: { nome: "Nexus" } } }, { produto: "Órbita" });
  assert.equal(sem.length, 2); assert.match(sem[1], /^Se você é o administrador, fale com a equipe da Nexus/);
  assert.match(LOGIN.textosEsqueci({}, { produto: "Clínica Max" })[1], /quem fornece o Clínica Max/);
});

test("AS-197/263 · convite com «Repita a senha» e medidor de força; troca obrigatória explica o motivo", async () => {
  limparCorpo();
  const alvo = h("div"); doc.body.appendChild(alvo);
  const chamadas = [];
  const tok = "a".repeat(64);
  const api = { publica: async (nome, p) => { chamadas.push(nome); if (nome === "nx_convite_ver") return { papel: "atendente", cliente: { nome: "Clínica" }, org: null, nome: "Ana", email: "ana@x.com" }; return { token: "t" }; }, mensagemErro: A.mensagemErro };
  await LOGIN.montar({ alvo, rota: { modulo: "convite", partes: [tok], query: {} }, ui: U, api, marca: {}, tema: T, titulo() {}, pintarMarcaOrg() {}, aoEntrar: async () => {} });
  const form = alvo.querySelector("form.entrar-form");
  assert.ok(form.querySelector("[data-campo=senha] .medidor"), "medidor de força");
  form.querySelector("input[name=senha]").value = "senhaboa123"; form.querySelector("input[name=senha2]").value = "senhaboa124";
  ev(form, "submit"); await tick(4);
  assert.deepEqual(chamadas, ["nx_convite_ver"], "senhas diferentes: não cria a conta");
  assert.match(form.querySelector("[data-campo=senha2] .campo-erro").textContent, /não são iguais/);
  LOGIN.desmontar();
  assert.match(LOGIN_TXT, /"Sua senha foi criada por um administrador\. Crie uma que só você saiba\."/);
});

test("AS-200 · fim do bloqueio por tentativas: o foco volta à senha e o leitor de tela ouve «Pode tentar de novo»", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  limparCorpo();
  const alvo = h("div"); doc.body.appendChild(alvo);
  const api = { publica: async () => { throw A.erroApi("muitas_tentativas", { status: 429, hint: "1" }); }, mensagemErro: A.mensagemErro, minutosDoHint: A.minutosDoHint };
  await LOGIN.montar({ alvo, rota: { modulo: "login", partes: [], query: {} }, ui: U, api, marca: {}, produtoAberto: null, titulo() {}, aoEntrar: async () => {} });
  const form = alvo.querySelector("form.entrar-form"), senha = form.querySelector("input[name=senha]");
  form.querySelector("input[name=email]").value = "a@b.co"; senha.value = "x"; ev(form, "submit"); await tick(4);
  doc.body.focus();
  t.mock.timers.tick(60000);
  assert.equal(doc.activeElement, senha, "foco na senha");
  t.mock.timers.tick(40);
  assert.equal(doc.getElementById("anuncio").textContent, "Pode tentar de novo.");
  LOGIN.desmontar();
});

/* ============================================================ antes.js / tema ============================================================ */
function rodarAntesP1000({ itens = {}, escuro = false, hash = "#/crm", token = "t" } = {}) {
  const attrs = {}; const filhos = [];
  const raiz = { style: { colorScheme: "", setProperty() {} }, setAttribute: (k, v) => { attrs[k] = v; }, classList: { add() {} } };
  const storage = { getItem: k => (k === "nx-token" ? token : Object.hasOwn(itens, k) ? itens[k] : null) };
  const document = { documentElement: raiz, title: "", getElementById: () => null, currentScript: { src: "http://x/app/antes.js?v=VT" }, createElement: () => ({}), head: { appendChild: f => filhos.push(`${f.rel}:${f.href}`) } };
  runInNewContext(ANTES_TXT, { document, window: { localStorage: storage, matchMedia: q => ({ matches: escuro && /dark/.test(q) }) }, localStorage: storage, location: { host: "x", search: "", hash, href: "http://x/app/" }, URLSearchParams, URL });
  return { esquema: attrs["data-esquema"], cor: raiz.style.colorScheme, preloads: filhos };
}
test("AS-189 + pedido (i) · tema «Automático»: sem escolha guardada o app abre como o aparelho (escuro à noite); escolha explícita vence", () => {
  assert.equal(rodarAntesP1000({ escuro: true }).esquema, "escuro", "sistema escuro, nada guardado → escuro");
  assert.equal(rodarAntesP1000({ escuro: true }).cor, "dark");
  assert.equal(rodarAntesP1000({ escuro: false }).esquema, "claro");
  assert.equal(rodarAntesP1000({ escuro: true, itens: { "nx-app-esquema": "auto" } }).esquema, "escuro");
  assert.equal(rodarAntesP1000({ escuro: true, itens: { "nx-app-esquema": "claro" } }).esquema, "claro", "quem escolheu claro continua claro");
  // app.js: o mesmo cálculo, o menu tem «Automático» e acompanha a troca do aparelho
  const mm = escuro => () => ({ matches: escuro });
  const LS = v => ({ lerTxt: () => v });
  const escolhido = (v) => fnApp("function esquemaEscolhido() {", { E: { M: { tema: T } }, LS: LS(v), CHAVE_ESQUEMA: "nx-app-esquema" })();
  assert.equal(escolhido(null), "auto"); assert.equal(escolhido("auto"), "auto"); assert.equal(escolhido("escuro"), "escuro");
  const pref = (v, escuro) => fnApp("function esquemaPreferido() {", { esquemaEscolhido: () => escolhido(v), sistemaEscuro: () => mm(escuro)().matches })();
  assert.equal(pref(null, true), "escuro"); assert.equal(pref(null, false), "claro"); assert.equal(pref("marca", true), "marca");
  assert.match(fnDoApp("function abrirMenuTema(ancora) {"), /\["auto", "Automático \(do aparelho\)", "reabrir"\]/);
  assert.match(fnDoApp("function seguirEsquemaDoSistema() {"), /mq\.addEventListener\("change"/);
});

test("AS-178 · antes.js: Automações, Configurações e Admin aquecem em paralelo o que a tela pede (o editor só no endereço dele)", () => {
  assert.deepEqual(rodarAntesP1000({ hash: "#/automacoes" }).preloads, ["modulepreload:automacoes.js?v=VT", "modulepreload:auto-logica.js?v=VT", "modulepreload:auto-pecas.js?v=VT", "preload:automacoes.css?v=VT"]);
  assert.ok(rodarAntesP1000({ hash: "#/automacoes/nova" }).preloads.includes("modulepreload:auto-editor.js?v=VT"));
  assert.ok(rodarAntesP1000({ hash: "#/config/marca" }).preloads.includes("modulepreload:cv-config.js?v=VT"));
  assert.deepEqual(rodarAntesP1000({ hash: "#/admin/clientes" }).preloads, ["modulepreload:admin.js?v=VT", "preload:config.css?v=VT"]);
});

/** contraste WCAG de duas cores #RRGGBB */
const contraste = (a, b) => T.contraste(a, b);
test("AS-216 · contraste: texto secundário (--c-texto-2/--c-texto-3) ≥ 4,5:1 sobre o cartão nos dois temas, também com a marca do dev-falso", () => {
  const marcas = [T.PADRAO.cores, { ...T.PADRAO.cores, primaria: "#2F6FDB", secundaria: "#E5B35C" }];
  for (const cores of marcas) for (const esq of ["claro", "escuro"]) {
    const v = T.derivarTema(T.coresNoEsquema(cores, esq)).vars;
    for (const tok of ["--c-texto-2", "--c-texto-3"]) for (const fundo of ["--c-sup", "--c-fundo"]) {
      const c = contraste(v[tok], v[fundo]);
      assert.ok(c >= 4.5, `${esq} ${tok} sobre ${fundo}: ${c.toFixed(2)}`);
    }
  }
});
test("AS-193 · anel de foco (--c-foco) ≥ 3:1 sobre fundo e cartão nos dois temas (chips, menu de Configurações, paleta no escuro)", () => {
  for (const esq of ["claro", "escuro"]) {
    const v = T.derivarTema(T.coresNoEsquema(T.PADRAO.cores, esq)).vars;
    for (const fundo of ["--c-fundo", "--c-sup", "--c-sup-2"]) if (v[fundo]) {
      const c = contraste(v["--c-foco"], v[fundo]);
      assert.ok(c >= 3, `${esq} foco sobre ${fundo}: ${c.toFixed(2)}`);
    }
  }
  assert.match(CSS_APP, /:focus-visible \{ outline: 2px solid var\(--c-foco\)/);
});

/* ============================================================ graficos.js ============================================================ */
test("pedido de Relatórios (e) · G.funil: `etapa.dica` vira a dica da conversão (title + data-dica) e uma descrição para o leitor de tela", () => {
  const alvo = h("div");
  G.funil(alvo, { resumo: "Funil", etapas: [{ nome: "Novo", qtd: 2 }, { nome: "Orçamento", qtd: 5, conversao: "250%", dica: "Entraram 3 negócios direto nesta etapa." }, { nome: "Fechou", qtd: 1 }] });
  const conv = alvo.querySelectorAll(".g-fconv")[1];
  assert.equal(conv.getAttribute("title"), "Entraram 3 negócios direto nesta etapa.");
  assert.equal(conv.getAttribute("data-dica"), "Entraram 3 negócios direto nesta etapa.");
  assert.ok(conv.classList.contains("g-fconv-dica"));
  assert.match(alvo.querySelectorAll(".g-fetapa")[1].textContent, /\(Entraram 3 negócios direto nesta etapa\.\)/);
  assert.equal(alvo.querySelectorAll(".g-fconv")[0].getAttribute("title"), null, "sem dica, nada muda");
});

/* ============================================================ index.html / CSS ============================================================ */
test("pedido (f) · sprite com i-pino (alfinete); AS-172 · Admin com escudo (não o mesmo ícone de Usuários)", () => {
  assert.ok(sprite.has("pino"));
  const admin = ROTAS.MENU.find(m => m.id === "admin");
  assert.equal(admin.icone, "escudo"); assert.ok(sprite.has("escudo"));
  assert.ok(!ROTAS.MENU.some(m => m.id !== "admin" && m.icone === "escudo"));
});
test("AS-257 · as fontes do 1º desenho saem junto com o CSS (preload com crossorigin e o MESMO endereço do @font-face)", () => {
  for (const f of ["clash-display-variable", "satoshi-variable"]) {
    const m = new RegExp(`<link rel="preload" href="\\.\\./fonts/${f}\\.woff2\\?v=(\\d+)" as="font" type="font/woff2" crossorigin>`).exec(HTML);
    assert.ok(m, f);
    assert.ok(CSS_APP.includes(`url("../fonts/${f}.woff2?v=${m[1]}")`), `${f}: o mesmo ?v= do app.css`);
  }
  assert.ok(HTML.indexOf("clash-display-variable") < HTML.indexOf('href="app.css'), "antes do CSS");
});
test("pedido (g) · busca-dica: no celular some só a dica de teclado; AS-106/AS-213 · amostra de cor 44 px no toque e «i» do KPI com 24 px", () => {
  assert.match(CSS_APP, /@media \(max-width: 760px\) \{ \.busca-dica:not\(\.busca-dica-toque\) \{ display: none; \}/);
  assert.doesNotMatch(CSS_APP, /@media \(max-width: 760px\) \{ \.busca-dica \{ display: none; \}/);
  assert.match(CSS_APP, /@media \(any-pointer: coarse\) \{\s*\.cor-paleta \{ gap: var\(--esp-2\); \}\s*\.cor-op \{ width: var\(--alvo-toque\); height: var\(--alvo-toque\); \}/);
  assert.match(CSS_APP, /\.kpi-ajuda\[tabindex\]::before \{ content: ""; position: absolute; inset: -3px; \}/, "18 + 2 × 3 = 24 px");
});
test("AS-274 · faixa DEMO LOCAL: no celular uma linha («Demo local · dados fictícios»), o texto inteiro fica para o leitor de tela", () => {
  const f = fnDoApp("function desenharFaixas() {");
  assert.match(f, /h\("span", \{ class: "demo-longo" \}, "DEMO LOCAL · dados fictícios; mensagens e integrações não são reais\."\)/);
  assert.match(f, /h\("span", \{ class: "demo-curto", "aria-hidden": "true" \}, "Demo local · dados fictícios"\)/);
  assert.match(CSS_APP, /@media \(width <= 760px\) \{[^}]*\}\s*\.faixa-demo-local \.demo-longo \{ position: absolute !important;/);
});
test("AS-209 · sem internet: classe no <html> e os botões de salvar avisam antes do clique (aria-disabled + dica); volta ao normal com a rede", () => {
  limparCorpo();
  const form = h("form", null, h("button", { type: "submit" }, "Salvar")); doc.body.appendChild(form);
  const ouvintes = []; const rede = { assinar: f => ouvintes.push(f), foto: () => ({ estado: "offline" }) };
  const marcar = fnApp("function marcarSemInternet() {", { E: { rede }, SEL_ESCRITA: "form button[type=submit], .modal-rod .bt-prim, [data-escrita]", RE_ESTADO_FALHA: /^(offline|servidor_fora)$/,
    document: doc, MutationObserver: undefined, requestAnimationFrame: f => f() });
  marcar();
  const bt = form.querySelector("button");
  assert.ok(doc.documentElement.classList.contains("sem-internet"));
  assert.equal(bt.getAttribute("aria-disabled"), "true"); assert.match(bt.getAttribute("title"), /Sem internet/);
  ouvintes[0]({ estado: "online" });
  assert.equal(bt.getAttribute("aria-disabled"), null); assert.equal(bt.getAttribute("title"), null); assert.ok(!doc.documentElement.classList.contains("sem-internet"));
  assert.match(CSS_APP, /html\.sem-internet \[data-sem-rede\] \{/);
});

/* ============================================================ app.js: guarda de rota, sair, empresa ============================================================ */
test("pedido (b) · guarda de rota: ctx.aoSairDaRota(fn) é consultada antes de trocar de tela, de empresa e de sair; «ficar» devolve o endereço", async () => {
  const guardasDeRota = new Set();
  const podeSair = fnApp("async function podeSairDaRota(", { guardasDeRota, console: { error() {} } });
  assert.equal(await podeSair(), true, "sem guarda: pode");
  const vistos = [];
  guardasDeRota.add(async o => { vistos.push(o); return false; });
  assert.equal(await podeSair({ destino: { modulo: "crm" }, motivo: "rota" }), false);
  assert.deepEqual(vistos, [{ destino: { modulo: "crm" }, motivo: "rota" }]);
  guardasDeRota.clear(); guardasDeRota.add(() => { throw new Error("x"); }); assert.equal(await podeSair(), true, "guarda que quebra não prende ninguém");
  const rota = fnDoApp("async function aoMudarRota(doUsuario) {");
  assert.match(rota, /if \(guardasDeRota\.size && E\.hashAtual != null && location\.hash !== E\.hashAtual\) \{/);
  assert.match(rota, /if \(!ok\) \{\s*try \{ history\.replaceState\(history\.state, "", location\.pathname \+ location\.search \+ E\.hashAtual\); \} catch \{ \/\* ok \*\/ \}\s*return;/);
  assert.ok(rota.indexOf("podeSairDaRota(") < rota.indexOf("const seq = ++E.montando;"), "a pergunta vem antes de começar a montar");
  assert.match(APP_JS, /aoSairDaRota\(fn\) \{\s*if \(typeof fn !== "function"\) return \(\) => \{\};\s*guardasDeRota\.add\(fn\);[\s\S]*?E\.assinaturas\.add\(cancelar\);/, "some ao desmontar a tela");
  assert.match(fnDoApp("function abrirSeletorEmpresa(ancora) {"), /if \(!\(await podeSairDaRota\(\{ motivo: "empresa" \}\)\)\) return;/, "AS-175: trocar de empresa pergunta");
  assert.match(fnDoApp("async function sair("), /if \(!\(await podeSairDaRota\(\{ motivo: "sair" \}\)\)\) return false;/);
});

test("AS-173 · Sair conta as mensagens da fila que não saíram e pede confirmação; a contagem nunca cria o banco nem trava", async () => {
  const conta = fnApp("async function contarFilaDeSaida() {", {});
  assert.equal(await runInNewContext(`${fnDoApp("async function contarFilaDeSaida() {")}\ncontarFilaDeSaida()`, { setTimeout, clearTimeout, Promise, Array, Number }), 0, "sem IndexedDB: 0");
  const idb = n => ({ databases: async () => [{ name: "orbita-fila" }], open: () => { const req = {}; setTimeout(() => { req.result = { objectStoreNames: { contains: s => s === "saida" }, close() {}, transaction: () => ({ objectStore: () => ({ count: () => { const c = {}; setTimeout(() => { c.result = n; c.onsuccess(); }, 1); return c; } }) }) }; req.onsuccess(); }, 1); return req; } });
  assert.equal(await runInNewContext(`${fnDoApp("async function contarFilaDeSaida() {")}\ncontarFilaDeSaida()`, { indexedDB: idb(2), setTimeout, clearTimeout, Promise, Array, Number }), 2);
  assert.equal(await runInNewContext(`${fnDoApp("async function contarFilaDeSaida() {")}\ncontarFilaDeSaida()`, { indexedDB: { databases: async () => [], open() { throw new Error("não deveria abrir"); } }, setTimeout, clearTimeout, Promise, Array, Number }), 0, "banco inexistente: nem abre");
  void conta;
  const sair = fnDoApp("async function sair(");
  assert.match(sair, /const n = await contarFilaDeSaida\(\);\s*if \(n > 0 && !\(await E\.ui\.confirmar\(\{ titulo: "Mensagens não enviadas", perigo: true, rotulo: "Sair e descartar", icone: "alerta",/);
});

test("AS-192 · «Sair» da janela de sessão expirada guarda os rascunhos para a mesma conta; outra conta que entrar os apaga", () => {
  assert.match(fnDoApp("async function pedirLoginNaTela() {"), /if \(r === "sair"\) \{ if \(await sair\(\{ manterRascunhos: true \}\)\) return false; continue; \}/);
  const sair = fnDoApp("async function sair(");
  assert.match(sair, /if \(manterRascunhos && E\.sessao\) \{ if \(E\.rascunhos\) E\.rascunhos\.salvarTudo\(\); LS\.gravar\(CHAVE_RASCUNHOS_DE, E\.sessao\.conta\.id\); \}/);
  const adotar = fnDoApp("async function adotarSessao(");
  assert.match(adotar, /if \(donoRascunhos && s\.conta && donoRascunhos !== s\.conta\.id\) \{\s*if \(E\.rascunhos\) E\.rascunhos\.apagarTudo\(\);/);
});

test("pedido (c) · logout apaga também filtros/buscas por conta (kanban, contatos, visões, Início, Conversas, comandos, rascunhos e IA das Automações)", async () => {
  const mapa = new Map(Object.entries({ "nx-app-crm-kb-e1-c1": "1", "nx-app-crm-ct-e1-c1": "1", "nx-ini-hist:e1:c1": "1", "nx-cv-filtro:e1": "1", "nx-app-visoes-v1:e1:c1:crm": "1",
    "nx-cmd:c1": "1", "nx-au-rasc:e1:c1:nova": "1", "nx-rec:c1:e1": "1", "nx-app-esquema": "escuro", "nx-app-menu": "1", "nx-token": "t" }));
  const storage = { get length() { return mapa.size; }, key: i => [...mapa.keys()][i] ?? null, removeItem: k => mapa.delete(k), getItem: k => mapa.get(k) ?? null };
  const PREF = runInNewContext(`${constDoApp("PREFIXOS_DA_CONTA")}\nPREFIXOS_DA_CONTA`, { Object });
  const LS = { lerTxt: k => mapa.get(k) ?? null, apagar: k => mapa.delete(k) };
  const limpar = fnApp("function limparDadosDoAparelho() {", { E: { cache: null, M: { comandos: { PREFIXO_RECENTES: "nx-rec:" } } }, localStorage: storage, LS, PREFIXOS_DA_CONTA: PREF, CHAVE_CONTA: "nx-app-conta", CHAVE_RASCUNHOS_DE: "nx-app-rascunhos-de" });
  await limpar();
  assert.deepEqual([...mapa.keys()].sort(), ["nx-app-esquema", "nx-app-menu", "nx-token"], "fica só preferência de aparência (e o token, que o sair apaga à parte)");
});

test("CR-186 · busca da paleta: 404 desliga os dados por 10 min (não pela sessão inteira)", () => {
  const E = { buscaFora: 0 };
  const f = fnApp("function buscaForaAgora(", { E, BUSCA_FORA_MS: 600000 });
  assert.equal(f(1000), false);
  E.buscaFora = 1000; assert.equal(f(1000 + 599999), true);
  assert.equal(f(1000 + 600000), false, "passou 10 min: tenta de novo"); assert.equal(E.buscaFora, 0);
  E.buscaFora = true; assert.equal(f(5), true, "valor antigo (true) vale como «agora»");
  assert.match(fnDoApp("async function buscarNaPaleta(q, modo) {"), /E\.buscaFora = Date\.now\(\);/);
});

test("CR-193 · buscarNaPaleta: contato sem nome mostra o telefone, grupo vazio vem vazio, «#» busca só conversas", async () => {
  const chamadas = [];
  const resp = { contatos: [{ id: 7, nome: null, telefone: "5512999990000" }], negocios: [], conversas: [{ id: 9, contato_nome: null, protocolo: "A1B2", status: "aberta" }] };
  const E = { cliente: { vertical: "odonto", modulos: ["crm", "conversas"] }, ui: U, api: { rpcC: async (n, p) => { chamadas.push(p); return resp; } }, M: { vocab: VOCAB } };
  const buscar = fnApp("async function buscarNaPaleta(q, modo) {", { E, gruposDeDados: () => ["contatos", "negocios", "conversas"] });
  const r = await buscar("5512", "texto");
  const [ct, ng, cv] = r.grupos;
  assert.equal(ct.itens[0].l1, "(12) 99999-0000", "sem nome: o telefone formatado");
  assert.deepEqual(ng.itens, [], "grupo vazio");
  assert.equal(cv.itens[0].l1, "Conversa"); assert.equal(cv.itens[0].l2, "Protocolo A1B2 · aberta"); assert.equal(cv.itens[0].hash, "#/conversas/9");
  const p = await buscar("A1B2", "protocolo");
  assert.deepEqual(p.grupos.map(g => g.titulo), ["Conversas"], "«#protocolo»: só conversas");
});

test("pedido (h) · paleta: «Novo paciente» e «Cadastrar «x» como paciente» de qualquer tela; ctx.moverNegocio usa o fluxo do CRM", () => {
  const v = VOCAB.vocab("odonto");
  const criar = fnApp("function acaoNovoContato(a) {", { carregar: () => {}, ctxDaAcao: () => ({}), E: {}, navegar: () => {}, console });
  const a = { rotaOk: m => m === "crm", pode: () => true, vocab: v };
  const acao = criar(a);
  assert.equal(acao.rotulo, "Novo paciente"); assert.equal(acao.grupo, "Criar");
  assert.equal(acao.rotuloTermo("Mariana"), "Cadastrar «Mariana» como paciente");
  assert.equal(typeof acao.comTermo, "function");
  assert.equal(criar({ ...a, rotaOk: () => false }), null, "sem CRM no produto/plano: não aparece");
  assert.equal(criar({ ...a, pode: () => false }), null, "somente leitura: não aparece");
  // no CRM aberto o comando da tela (mesmo rótulo) vence: juntarAcoes tira o do shell
  const { geral } = C.juntarAcoes([acao], [{ id: "crm.novo-contato", rotulo: "Novo paciente", comTermo() {} }]);
  assert.deepEqual(geral, []);
  assert.match(fnDoApp("function ambientePaleta(inicial) {"), /const novoContato = acaoNovoContato\(a\);/);
  const ctx = APP_JS.slice(APP_JS.indexOf("ctx.moverNegocio = async"), APP_JS.indexOf("return ctx;\n}", APP_JS.indexOf("ctx.moverNegocio = async")));
  assert.match(ctx, /const N = await k\.mod\("negocio"\);/); assert.match(ctx, /funil\.estagios\.find\(e => e\.tipo === \(alvo && alvo\.tipo\)\)/);
  assert.match(ctx, /const novo = await N\.moverComPerguntas\(k, card, estagio\);/, "o mesmo fluxo do quadro (valor do ganho, motivo da perda)");
  assert.match(ctx, /if \(typeof aoMudar === "function"\)/);
});

test("AS-254 · seletor de empresa: pílulas de número caído, teste acabando/vencido e empresa pausada", () => {
  const E = { ui: U };
  const f = fnApp("function sinaisDaEmpresa(c, hoje = E.ui.hojeSP()) {", { E, DIA_MS: 86400000 }, "sinaisDaEmpresa");
  assert.deepEqual(f({ canais: [{ estado: "conectado" }] }, "2026-10-13"), []);
  assert.deepEqual(f({ canais: [{ estado: "desconectado" }, { estado: "desconectado" }] }, "2026-10-13").map(s => s.texto), ["2 números caídos"]);
  assert.deepEqual(f({ status: "teste", teste_ate: "2026-10-15" }, "2026-10-13").map(s => s.texto), ["teste: 2 dias"]);
  assert.deepEqual(f({ status: "teste", teste_ate: "2026-10-13" }, "2026-10-13").map(s => s.texto), ["teste acaba hoje"]);
  assert.deepEqual(f({ status: "teste", teste_ate: "2026-10-01" }, "2026-10-13").map(s => s.texto), ["teste vencido"]);
  assert.deepEqual(f({ status: "teste", teste_ate: "2026-11-30" }, "2026-10-13"), [], "teste longe: nada");
  assert.deepEqual(f({ ativo: false }, "2026-10-13").map(s => s.texto), ["pausada"]);
});

test("AS-190 · link copiado leva a empresa (?c=<slug>); rotas públicas e hash que já tem ?c= ficam como estão", () => {
  const f = fnApp("function comEmpresa(hash, slug = E.cliente && E.cliente.slug) {", { E: { cliente: { slug: "clinica-x" } } }, "comEmpresa");
  assert.equal(f("#/contatos/5"), "#/contatos/5?c=clinica-x");
  assert.equal(f("#/crm?funil=2"), "#/crm?funil=2&c=clinica-x");
  assert.equal(f("#/convite/abc"), "#/convite/abc"); assert.equal(f("#/senha/abc"), "#/senha/abc");
  assert.equal(f("#/crm?c=outra"), "#/crm?c=outra");
  assert.equal(f("#/crm", null), "#/crm");
  assert.match(fnDoApp("function linkPublico(caminhoHash) {"), /comEmpresa\(/);
  assert.equal(ROTAS.rotear("#/contatos/5?c=clinica-x").query.c, "clinica-x", "o roteador já lê");
});

test("AS-186/187 · sino: Hoje/Ontem/data, «Não lidas», «Carregar mais» até 100; notificação de automação abre as execuções, sem destino expande", () => {
  const link = fnApp("function linkDaNotificacao(it) {", { LINK_NOTIF: { canal_caiu: "#/config/numeros", canal_voltou: "#/config/numeros" } });
  assert.equal(link({ link: "#/crm/negocio/3" }), "#/crm/negocio/3");
  assert.equal(link({ link: "https://fora" , tipo: "canal_caiu" }), "#/config/numeros");
  assert.equal(link({ tipo: "automacao", dados: { automacao_id: "a1" } }), "#/automacoes/a1?aba=execucoes");
  assert.equal(link({ tipo: "automacao" }), "#/automacoes");
  assert.equal(link({ tipo: "sistema" }), null);
  const dia = fnApp("function rotuloDoDia(iso, agora = new Date()) {", { E: { ui: U }, DIA_MS: 86400000 }, "rotuloDoDia");
  const agora = new Date("2026-10-13T15:00:00Z");
  assert.equal(dia("2026-10-13T12:00:00Z", agora), "Hoje"); assert.equal(dia("2026-10-12T12:00:00Z", agora), "Ontem"); assert.equal(dia("2026-10-01T12:00:00Z", agora), "01/10/2026");
  const sino = fnDoApp("function abrirSino(ancora) {");
  assert.match(sino, /\{ valor: "nao_lidas", rotulo: "Não lidas" \}/); assert.match(sino, /limite = Math\.min\(NOTIF_MAXIMO, limite \+ NOTIF_PAGINA\)/);
  assert.match(sino, /p_limite: limite/); assert.match(sino, /b\.classList\.toggle\("notif-aberta"\)/);
  assert.match(APP_JS, /const NOTIF_PAGINA = 30, NOTIF_MAXIMO = 100;/);
});

test("AS-243/244 · número caído: ponto vermelho em Conversas no menu e na barra; o aviso diz desde quando", () => {
  const desde = fnApp("function desdeQuando(iso, agora = new Date()) {", { E: { ui: U } }, "desdeQuando");
  const agora = new Date("2026-10-13T15:00:00Z");
  assert.equal(desde("2026-10-13T14:35:00Z", agora), "há 25 min");
  assert.equal(desde("2026-10-13T12:00:00Z", agora), "há 3 h");
  assert.equal(desde(null, agora), "");
  assert.match(desde("2026-10-10T12:00:00Z", agora), /^desde 10\/10 \d\d:\d\d$/);
  assert.match(fnDoApp("function renderNumeroCaido(assinatura) {"), /const nomes = c\.lista\.map\(x => \{ const q = desdeQuando\(x\.desde\); return q \? `\$\{x\.nome\} \(\$\{q\}\)` : x\.nome; \}\)/);
  limparCorpo();
  doc.body.append(h("span", { class: "canal-ponto", hidden: true, dataset: { canal: "1" } }));
  const atualizar = fnApp("function atualizarPontoCanal() {", { E: { canais: { lista: [{ id: 1 }] } }, document: doc });
  atualizar(); assert.equal(doc.querySelector("[data-canal]").hidden, false);
  assert.match(fnDoApp("function desenharMenu() {"), /it\.id === "conversas" \? pontoCanal\(\) : null/);
});

test("AS-176 · faixa de migração: frase simples para todos; o nome das migrações só para a conta da plataforma", () => {
  limparCorpo(); const faixas = h("div", { id: "faixas-sistema" }); doc.body.appendChild(faixas);
  const rodar = superConta => {
    faixas.textContent = "";
    const fonte = `let faixaMigracao = null;\n${fnDoApp("function desenharFaixaMigracao(info) {")}\nreturn desenharFaixaMigracao;`;
    const f = new Function("E", "$", fonte)({ ui: U, sessao: { conta: { super: superConta } }, pwaMod: PWA }, id => doc.getElementById(id));
    f({ banco: "20261008c_x", minima: "20261013d" });
    return faixas.querySelector("p").textContent;
  };
  assert.equal(rodar(false), "Algumas telas podem falhar até a atualização do servidor, que a equipe já está fazendo.");
  assert.match(rodar(true), /banco em «20261008c», esta versão precisa de «20261013d»/);
});

test("AS-174 · Sair numa aba fecha as outras; outra conta numa aba recarrega esta; a mesma conta renovando não atrapalha", async () => {
  let ouvinte = null; const recargas = []; const lidos = [];
  const deps = (sessao, contaRede) => ({
    addEventListener: (t, f) => { if (t === "storage") ouvinte = f; },
    E: { sessao, pulso: { parar() {} }, ui: U, M: { dados: { lerToken: () => null } } }, $: () => h("div"),
    history: { replaceState: (a, b, u) => lidos.push(u) }, location: { pathname: "/app/", search: "", reload: () => recargas.push(1) },
    lerSessao: async () => ({ conta: { id: contaRede } }), limparERecarregar: async () => recargas.push("limpa"),
  });
  fnApp("function ouvirOutrasAbas() {", deps({ conta: { id: "c1" } }, "c1"))();
  ouvinte({ key: "nx-token", oldValue: "a", newValue: null });
  assert.deepEqual(recargas, [1], "a outra aba saiu: esta recarrega"); assert.deepEqual(lidos, ["/app/#/login"]);
  recargas.length = 0;
  fnApp("function ouvirOutrasAbas() {", deps({ conta: { id: "c1" } }, "c1"))();
  ouvinte({ key: "nx-token", oldValue: "a", newValue: "b" }); await tick();
  assert.deepEqual(recargas, [], "mesma conta renovou a sessão: nada muda");
  fnApp("function ouvirOutrasAbas() {", deps({ conta: { id: "c1" } }, "c2"))();
  ouvinte({ key: "nx-token", oldValue: "a", newValue: "b" }); await tick();
  assert.deepEqual(recargas, ["limpa"], "outra conta: limpa e recarrega");
  recargas.length = 0;
  fnApp("function ouvirOutrasAbas() {", deps({ conta: { id: "c1" } }, "c1"))();
  ouvinte({ key: "nx-app-menu", oldValue: "0", newValue: "1" }); assert.deepEqual(recargas, [], "outras chaves: nada");
  assert.match(fnDoApp("async function iniciar() {"), /ouvirOutrasAbas\(\);/);
});

test("AS-262 · instalar: sugestão única no celular a partir da 3ª abertura, só onde dá para instalar", () => {
  const deve = fnApp("function deveSugerirInstalacao(", {});
  assert.equal(deve({ aberturas: 3, jaSugeriu: false, toque: true, modo: "evento" }), true);
  assert.equal(deve({ aberturas: 2, jaSugeriu: false, toque: true, modo: "evento" }), false);
  assert.equal(deve({ aberturas: 5, jaSugeriu: true, toque: true, modo: "evento" }), false, "uma vez só");
  assert.equal(deve({ aberturas: 5, jaSugeriu: false, toque: false, modo: "evento" }), false, "no computador o menu basta");
  assert.equal(deve({ aberturas: 5, jaSugeriu: false, toque: true, modo: null }), false, "já instalado/sem suporte");
  assert.match(fnDoApp("function sugerirInstalacao() {"), /acao: \{ rotulo: "Instalar", fn: \(\) => instalarApp\(\) \}/);
});

test("AS-292 · Ajuda › «Sobre este app»: versão do app, migração do banco e «Copiar para o suporte» (sem e-mail nem token)", () => {
  const texto = fnApp("function textoSobre() {", { E: { M: { rotas: ROTAS }, produto: "Órbita", workspace: null, sessao: { migracao: "20261013d_contratos", conta: { email: "ana@x.com" } }, cliente: { nome: "Clínica", slug: "clinica" }, titulo: "Conversas", rede: { estado: "online" } },
    VERSAO: "20261013z", innerWidth: 390 })();
  assert.match(texto, /versão do app 20261013z/); assert.match(texto, /Banco: 20261013d_contratos/); assert.match(texto, /Empresa: Clínica \(clinica\)/);
  assert.ok(!texto.includes("ana@x.com"));
  assert.match(fnDoApp("function abrirMenuAjuda(ancora) {"), /\{ rotulo: "Sobre este app", icone: "ajuda", fn: \(\) => abrirSobre\(\) \}/);
  assert.match(fnDoApp("function abrirSobre() {"), /rotulo: "Copiar para o suporte"/);
});

test("AS-191 · armazenamento persistente: pedido na 1ª vez que um texto longo é escrito (ou a fila é usada), nunca no login nem em aparelho compartilhado", () => {
  const pedidos = [];
  const marcar = fnApp("function marcarEdicao(ev) {", { E: { sessao: {} }, pedirArmazenamentoPersistente: () => pedidos.push(1) });
  marcar({ target: { tagName: "INPUT", type: "text" } }); assert.equal(pedidos.length, 0);
  marcar({ target: { tagName: "TEXTAREA" } }); assert.equal(pedidos.length, 1);
  assert.match(fnDoApp("function pedirArmazenamentoPersistente() {"), /if \(aparelhoCompartilhado\(\) \|\| LS\.lerTxt\("nx-app-persistir"\)/);
  assert.match(APP_JS, /armazenamentoPersistente: \(\) => pedirArmazenamentoPersistente\(\),/);
});

test("AS-261 · selo de não lidas: o título da aba mostra (n) em todo navegador; o ícone do app só onde existe setAppBadge (Chrome Android sem suporte fica no título)", () => {
  const E = { badges: { conversas: 3 }, workspace: null, produto: "Órbita", titulo: "Início", M: {} };
  const doc2 = { title: "" };
  fnApp("function atualizarTitulo() {", { E, document: doc2 })();
  assert.equal(doc2.title, "(3) Início · Órbita");
  E.badges.conversas = 150; fnApp("function atualizarTitulo() {", { E, document: doc2 })(); assert.match(doc2.title, /^\(99\+\) /);
  assert.match(fnDoApp("function atualizarSeloDoApp() {"), /typeof navigator\.setAppBadge === "function"/);
});

test("pedido (j) · ARQUIVOS_DO_APP confere com a pasta web/app (nenhum módulo novo fora do precache)", async () => {
  const { readdirSync } = await import("node:fs");
  const lista = runInNewContext(`${constDoApp("ARQUIVOS_DO_APP")}\nARQUIVOS_DO_APP`);
  const pasta = readdirSync(APP).filter(f => /\.(js|css)$/.test(f) && f !== "sw.js");
  assert.deepEqual([...lista].sort(), pasta.sort());
});

test("revisão adversarial · ui.gaveta.zerar(): conteúdo trocado pelo código vira a base — sem texto digitado o Esc fecha e estaSujo() é false", async () => {
  limparCorpo(); HTMLDialog();
  let fechou = 0;
  const corpo = h("div", null, U.campo({ rotulo: "Título", nome: "titulo", valor: "Ana" }));
  const g = U.gaveta({ titulo: "Negócio", corpo, aoFechar: () => { fechou++; } });
  await esperar(5);
  assert.equal(typeof g.zerar, "function", "a gaveta expõe zerar()");
  ev(g.corpo, "pointerdown"); ev(g.corpo, "click");          // 1º clique: a base congela (tocou)
  // o código troca o conteúdo (‹ › foi a outro negócio, com campos personalizados diferentes)
  for (const c of [...g.corpo.childNodes]) c.remove();
  g.corpo.appendChild(h("div", null, U.campo({ rotulo: "Título", nome: "titulo", valor: "Bruno" }), U.campo({ rotulo: "Convênio", nome: "campo__convenio", valor: "Unimed" })));
  assert.equal(g.estaSujo(), true, "sem zerar: parece texto não salvo (o defeito)");
  g.zerar();
  assert.equal(g.estaSujo(), false, "depois de zerar: nada digitado");
  ev(g.el, "cancel");
  assert.equal(g.el.querySelector(".protege-faixa").hidden, true, "o Esc não pede descarte");
  await esperar(260); assert.equal(fechou, 1, "e fecha");
});

test("integração · AS-288/AS-248: item de menu desligado mostra o motivo; o «Sair» da faixa de suporte volta ao Admin de onde veio (só #/admin/)", () => {
  const ui = readFileSync(new URL("../web/app/ui.js", import.meta.url), "utf8"), app = readFileSync(new URL("../web/app/app.js", import.meta.url), "utf8");
  assert.match(ui, /const motivo = it\.desabilitado && it\.motivo \? String\(it\.motivo\) : "";/);
  assert.match(ui, /motivo \? h\("small", \{ class: "menu-motivo" \}, motivo\) : null/);
  assert.ok(app.includes('navegar(volta && /^#\\/admin\\//.test(volta) ? volta : "#/admin/clientes");'), "Sair volta ao Admin guardado");
});
