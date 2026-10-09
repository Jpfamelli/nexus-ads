/* ============================================================
   ÓRBITA — plano «100+ melhorias» (08/10/2026) · frente D · Conversas
   node --test testes/plano100-conversas.teste.mjs
   (a) cv-logica.js: RPC nova por detecção, páginas da lista, teto com assinatura, telefone, fila entre abas, rastreio, «Enviar agora»
   (b) peças sobre DOM mínimo: lateral por seção (D1, D11, D17, D20), cabeçalho e bolhas (D4, D8, D9, D10, D12, D18), composer
       (D2, D5, D7, D14, D16) e lista (D18)
   (c) a central inteira (conversas.js montar) sobre o DOM mínimo, com RPCs de mentira: D3, D6, D8, D9, D12, D13, D15, D19, D20
   Cada teste de comportamento falha no código de antes desta rodada (ver o relatório da frente D).
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

/* ============================================================ (a) lógica pura */
test("D2 · rpcAusente reconhece a função nova que ainda não está no banco (404 · PGRST202) e só ela", () => {
  assert.equal(L.rpcAusente({ status: 404, codigo: "http_404" }), true);
  assert.equal(L.rpcAusente({ status: 400, codigo: "PGRST202" }), true);
  assert.equal(L.rpcAusente({ codigo: "x", resposta: { code: "PGRST202" } }), true);
  assert.equal(L.rpcAusente({ message: "Could not find the function public.nx_cv_nota(p_cliente, p_conversa, p_req)" }), true);
  assert.equal(L.rpcAusente({ status: 400, codigo: "conversa_nao_encontrada" }), false);
  assert.equal(L.rpcAusente({ codigo: "sem_conexao" }), false);
  assert.equal(L.rpcAusente(null), false);
  const u = L.novoUuid();
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(L.novoUuid(), u);
});

test("D6 · mesclarPaginaLista: o pulso relê a 1ª página e o que veio depois dela fica; sem tem_mais a página é a lista inteira", () => {
  const c = (id, min, extra = {}) => ({ id, ultima_msg_em: agoraIso(min), ultima_entrada_em: agoraIso(min), ...extra });
  const antigos = Array.from({ length: 150 }, (_, i) => c(i + 1, i + 1));          // 1 é a mais recente
  // mensagem nova na 120 (sobe para o topo) e a 3 foi resolvida (sumiu da 1ª página)
  const frescos = [c(120, 0), ...antigos.slice(0, 101).filter(x => x.id !== 3 && x.id !== 120)].slice(0, 100);
  const m = L.mesclarPaginaLista(antigos, frescos, { temMais: true });
  assert.equal(m.itens.length, 150 - 1, "a 3 saiu; as 150 carregadas não voltam a ser 100");
  assert.equal(m.itens[0].id, 120);
  assert.equal(m.itens.filter(x => x.id === 120).length, 1, "a que subiu não aparece duas vezes");
  assert.equal(m.preservadas, 49);
  assert.deepEqual(L.mesclarPaginaLista(antigos, frescos.slice(0, 30), { temMais: false }).itens.length, 30, "sem tem_mais: o resto sumiu de verdade");
  // Aguardando: quem espera há mais tempo primeiro (nulos no fim)
  assert.ok(L.compararLista(c(1, 90), c(2, 10), { aguardando: true }) < 0);
  assert.ok(L.compararLista({ id: 1, ultima_entrada_em: null }, c(2, 10), { aguardando: true }) > 0);
  assert.ok(L.compararLista(c(1, 10), c(2, 90)) < 0, "fora da Aguardando, a mais recente primeiro");
  assert.ok(L.compararLista({ id: 1, ultima_msg_em: null }, c(2, 1)) < 0, "desc do Postgres: nulos na frente");
});

test("D14 · tetoTexto desconta a assinatura «*Nome:*\\n» do nx-enviar; emoji conta 2 e o contador diz isso", () => {
  assert.equal(L.tetoTexto({ assinatura: true, nome: "Helena Souza" }), 4096 - "*Helena:*\n".length);
  assert.equal(L.tetoTexto({ assinatura: false, nome: "Helena" }), 4096);
  assert.equal(L.tetoTexto({ assinatura: true, nome: "" }), 4096, "sem nome o servidor não assina");
  assert.equal(L.contarDuplos("oi 😀 tudo 👍🏽"), 3);
  assert.equal(L.textoContador(86, 0), "86 caracteres restantes");
  assert.equal(L.textoContador(1, 2), "1 caractere restante · emoji conta 2");
});

test("D13 · mascaraTelefone (só número do Brasil, sem mexer no número) e erroTelefone (regra do nx_tel_normalizar de 20261008a)", () => {
  assert.equal(L.mascaraTelefone("12997773031"), "(12) 99777-3031");
  assert.equal(L.mascaraTelefone("1233334444"), "(12) 3333-4444");
  assert.equal(L.mascaraTelefone("12"), "(12");
  assert.equal(L.mascaraTelefone("+1 415 555 1234"), "+1 415 555 1234", "outro país fica como foi digitado");
  assert.equal(L.mascaraTelefone("5512997773031"), "5512997773031", "com o 55 já digitado também");
  assert.equal(L.mascaraTelefone(L.mascaraTelefone("12997773031")), "(12) 99777-3031", "idempotente");
  assert.equal(L.erroTelefone("(12) 99777-3031"), "");
  assert.equal(L.erroTelefone("012 99777-3031"), "", "zero de tronco sai");
  assert.equal(L.erroTelefone("+1 415 555 1234"), "");
  assert.equal(L.erroTelefone("5512997773031"), "");
  assert.match(L.erroTelefone("1299777"), /Faltam números/);
  assert.match(L.erroTelefone("10 99777-3031"), /DDD 10 não existe/);
  assert.match(L.erroTelefone("12 8777-30311"), /começa com 9/);
  assert.match(L.erroTelefone("+12"), /outro país/);
  assert.match(L.erroTelefone(""), /DDD/);
});

test("D19 · filaConferirGuardado: o IndexedDB manda — concluído em outra aba some, pedido de outra aba há < 90 s espera", () => {
  const T = 1_000_000;
  assert.equal(L.filaConferirGuardado(null, { id: "a" }, T), "sumiu");
  assert.equal(L.filaConferirGuardado({ id: "a", estado: "fila", enviada_em: 0 }, { id: "a", enviada_em: 0 }, T), "ok");
  assert.equal(L.filaConferirGuardado({ id: "a", estado: "fila", enviada_em: T - 5000 }, { id: "a", enviada_em: 0 }, T), "outra_aba");
  assert.equal(L.filaConferirGuardado({ id: "a", estado: "fila", enviada_em: T - 5000 }, { id: "a", enviada_em: T - 5000 }, T), "ok", "o pedido é desta aba");
  assert.equal(L.filaConferirGuardado({ id: "a", estado: "fila", enviada_em: T - 95000 }, { id: "a", enviada_em: 0 }, T), "ok", "passou dos 90 s");
  assert.equal(L.filaConferirGuardado({ id: "a", estado: "falhou" }, { id: "a", estado: "fila" }, T), "outra_aba", "a outra aba já viu a falha: espera a pessoa");
});

test("D10/D17/D11/D16 · motivoEnviarAgora, linhaRastreio, negocioParaAgenda e a dica do modelo de marketing (decisão 3)", () => {
  assert.match(L.motivoEnviarAgora({ offline: true }), /Sem internet/);
  assert.match(L.motivoEnviarAgora({ espera: 30000, agora: Date.parse("2026-10-08T17:00:00Z") }), /pode sair às 14:00/);
  assert.equal(L.motivoEnviarAgora({}), "");
  const r = L.linhaRastreio({ origem: "site", campanha_nome: "Implante", rastreio: { pagina: "https://clinica.com/implante?utm_source=ig", clique_em: "2026-10-08T17:02:00Z" } });
  assert.deepEqual(r, { titulo: "Veio do site", detalhe: "campanha «Implante» · página /implante · clique em 08/10 14:02" });
  assert.equal(L.linhaRastreio({ origem: "whatsapp" }), null, "sem rastreio, nada inventado");
  assert.equal(L.linhaRastreio({ origem: "anuncio", rastreio: { utm_campaign: "Out" } }).titulo, "Veio do anúncio");
  const ver = { conversa: { negocio: { id: 2 } }, negocios: [{ id: 1, status: "aberto" }, { id: 2, status: "aberto" }] };
  assert.equal(L.negocioParaAgenda(ver).id, 2, "o negócio ligado à conversa");
  assert.equal(L.negocioParaAgenda({ conversa: {}, negocios: [{ id: 7 }] }).id, 7, "sem ligado: o único aberto");
  assert.equal(L.negocioParaAgenda({ conversa: {}, negocios: [{ id: 7 }, { id: 8 }] }), null, "dois abertos: a pessoa escolhe na agenda");
  assert.equal(L.modeloDisponivel({ status: "APPROVED", categoria: "MARKETING" }, { optin: null }).ok, true, "opt-in desconhecido passa");
  assert.equal(L.modeloDisponivel({ status: "APPROVED", categoria: "MARKETING" }, { optin: false }).ok, false);
  assert.match(L.dicaModeloMarketing(null), /menos para quem pediu para sair/);
  assert.match(L.dicaModeloMarketing(false), /não vai para ele/);
});

test("D12 · estadoCabecalho: com a IA atendendo o Resolver continua à vista como ícone (e um primário só)", () => {
  const e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: "u1" }, eu: "u1", pode: true, codeWords: true, ia: { disponivel: true, ia_ligada: true, pausada: false } });
  assert.deepEqual([e.primaria, e.estilo, e.resolverIcone], ["assumir_ia", "prim", true]);
});

/* ============================================================ DOM mínimo (o mesmo do plano 50, com o que a central inteira precisa) */
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
async function montarLateral(d, { ver: verExtra = {}, temCrm = true, api = null } = {}) {
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
    ui: d.ui, L, G: null, podeEscrever: true, selId: 9, msgs: [], eu: { id: "u1" }, base: { etiquetas: [{ id: "e1", nome: "VIP" }, { id: "e2", nome: "Retorno" }] }, etiquetasEmVoo: 0, ver,
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

test("D1 (DOM) · o pulso não destrói o nome em edição; sair do campo não grava; só Enter grava (uma vez)", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    const salvar = [];
    t.A.api.rpcC = async (nome, p) => { if (nome === "nx_contato_salvar") salvar.push(p); return { campos: [] }; };
    achar(t.alvo, '[data-foco="editar-nome"]').click();
    const inp = achar(t.alvo, ".cvt-nome-ed input");
    assert.equal(d.doc.activeElement, inp, "o campo abre com o foco");
    inp.value = "Mariana Costa Silva"; d.ev(inp, "input");
    // mensagem nova em qualquer conversa → recarregarVer → lateral.render (com dados novos do servidor)
    t.A.ver = { ...t.A.ver, contato: { ...t.A.ver.contato, telefone: "5512999990001" }, tarefas: [...t.A.ver.tarefas, { id: 72, titulo: "Confirmar", vence_em: null }] };
    t.lat.render();
    assert.ok(inp.isConnected, "o campo continua na tela no meio da digitação");
    assert.equal(inp.value, "Mariana Costa Silva");
    assert.equal(t.alvo.querySelectorAll(".cvt-tar").length, 2, "a seção que mudou (tarefas) foi refeita mesmo assim");
    d.ev(inp, "blur");
    await esperar(5);
    assert.deepEqual(salvar, [], "blur não grava o nome parcial");
    d.ev(inp, "keydown", { key: "Enter" }); d.ev(inp, "keydown", { key: "Enter" });
    await esperar(5);
    assert.deepEqual(salvar, [{ p_contato: { id: 5, nome: "Mariana Costa Silva" } }], "Enter grava uma vez");
    assert.equal(t.alvo.querySelector(".cvt-nome-ed"), null, "e a edição fecha");
    assert.equal(achar(t.alvo, ".cvt-nome h2").textContent, "Mariana Costa Silva");
    // Esc desiste sem gravar
    achar(t.alvo, '[data-foco="editar-nome"]').click();
    const inp2 = achar(t.alvo, ".cvt-nome-ed input");
    inp2.value = "Outro"; d.ev(inp2, "input"); d.ev(inp2, "keydown", { key: "Escape" });
    assert.equal(salvar.length, 1);
    assert.equal(d.doc.activeElement.dataset.foco, "editar-nome", "o foco volta ao lápis");
  } finally { d.fim(); }
});

test("D1 (DOM) · só a seção que mudou é refeita; o foco num botão da seção refeita volta ao mesmo botão; trocar de conversa abandona a edição sem gravar", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    const sec = k => t.alvo.querySelector(`details.cvt-sec[data-sec="${k}"]`);
    const antes = { dados: sec("dados"), tarefas: sec("tarefas"), negocios: sec("negocios"), at: sec("atendimentos") };
    t.lat.render();
    assert.equal(sec("dados"), antes.dados, "nada mudou: nenhum nó novo");
    const novaTarefa = achar(sec("tarefas"), '[data-foco="nova-tarefa"]');
    novaTarefa.focus();
    t.A.ver = { ...t.A.ver, tarefas: [{ id: 80, titulo: "Outra", vence_em: null }] };
    t.lat.render();
    assert.notEqual(sec("tarefas"), antes.tarefas, "tarefas mudou e foi refeita");
    assert.equal(sec("negocios"), antes.negocios, "negócios não mudou e ficou");
    assert.equal(sec("atendimentos"), antes.at);
    assert.equal(d.doc.activeElement.dataset.foco, "nova-tarefa", "o foco volta ao «+ Tarefa» da seção nova");
    assert.ok(d.doc.activeElement.isConnected);
    // edição aberta + troca de conversa: nada é gravado
    const salvar = [];
    t.A.api.rpcC = async (nome, p) => { if (nome === "nx_contato_salvar") salvar.push(p); return {}; };
    achar(t.alvo, '[data-foco="editar-nome"]').click();
    const inp = achar(t.alvo, ".cvt-nome-ed input"); inp.value = "Silva"; d.ev(inp, "input");
    t.A.selId = 10; t.A.ver = { ...t.A.ver, conversa: { ...t.A.ver.conversa, id: 10 }, contato: { id: 6, nome: "Bruna" } };
    t.lat.render();
    await esperar(5);
    assert.deepEqual(salvar, []);
    assert.equal(achar(t.alvo, ".cvt-nome h2").textContent, "Bruna");
    assert.equal(t.lat.editandoNome, false);
  } finally { d.fim(); }
});

test("D11/D17 (DOM) · atalho Agenda marca a consulta com o negócio da conversa; «Veio do site» com campanha, página e clique", async () => {
  const d = comDom();
  try {
    const t = await montarLateral(d);
    const agenda = achar(t.alvo, '.cvt-atalho[data-foco="agenda"]');
    assert.equal(agenda.tagName, "BUTTON", "não é mais um link solto para #/agenda");
    agenda.click();
    assert.deepEqual(t.chamadas.filter(c => c[0] === "agendar"), [["agendar", 1]]);
    await esperar(10);       // nx_negocio_ver (uma vez por negócio) → redesenha «Dados»
    const bloco = achar(t.alvo, ".cvt-rastreio");
    assert.match(bloco.textContent, /Veio do site/);
    assert.match(bloco.textContent, /campanha «Implante» · página \/implante · clique em 08\/10 14:02/);
    t.lat.render(); t.lat.render();
    assert.equal(t.chamadas.filter(c => c[0] === "nx_negocio_ver").length, 1, "o rastreio é lido uma vez por negócio");
  } finally { d.fim(); }
});

test("D20 (DOM) · etiquetas na lateral: a resposta de um pedido antigo não desfaz a marcação nova (seq); o seletor é o mesmo nó entre pulsos", async () => {
  const d = comDom();
  try {
    const soltar = [];
    const t = await montarLateral(d);
    t.A.acoes.etiquetas = (ids, o) => new Promise(ok => soltar.push(() => ok({ etiquetas: ids, _atual: o.atual() })));
    const sel = achar(t.alvo, ".sel-etiq");
    sel.mudar(["e1", "e2"]);           // seq 1
    sel.mudar(["e2"]);                 // seq 2
    soltar[1]();                       // a nova responde primeiro
    await esperar(1);
    soltar[0]();                       // a antiga chega depois
    await esperar(1);
    assert.equal(sel.dataset.definido, "e2", "a resposta antiga ([e1, e2]) não sobrescreve");
    t.A.ver = { ...t.A.ver, conversa: { ...t.A.ver.conversa, etiquetas: ["e2"] } };
    t.lat.render();
    assert.equal(t.alvo.querySelector(".sel-etiq"), sel, "o seletor não é trocado pelo pulso");
    // mudança vinda do servidor (outra pessoa) com nada a caminho: o seletor acompanha sem ser recriado
    t.A.ver = { ...t.A.ver, conversa: { ...t.A.ver.conversa, etiquetas: ["e1"] } };
    t.lat.render();
    assert.equal(t.alvo.querySelector(".sel-etiq"), sel);
    assert.equal(sel.dataset.definido, "e1");
  } finally { d.fim(); }
});

/* ============================================================ (b) chat — D4, D8, D9, D10, D12, D18 */
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

test("D4 (DOM) · o pulso não refaz o cabeçalho que não mudou (o foco fica no botão); quando muda, o foco volta ao botão da mesma ação", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d);
    const transferir = achar(chat.el, ".cvc-transferir");
    transferir.focus();
    for (let i = 0; i < 3; i++) chat.renderCabecalho();          // pulsos de outras conversas
    assert.equal(d.doc.activeElement, transferir, "o mesmo botão, ainda com o foco");
    assert.ok(transferir.isConnected);
    // mudou de verdade (alguém assumiu): o cabeçalho é refeito e o foco vai para o Transferir NOVO
    A.ver.conversa = { ...A.ver.conversa, atribuida_a: "u2", atribuida_nome: "Ana" };
    chat.renderCabecalho();
    assert.notEqual(d.doc.activeElement, transferir);
    assert.ok(d.doc.activeElement.isConnected, "o foco não cai num botão que saiu da tela");
    assert.equal(d.doc.activeElement.dataset.acao, "transferir");
    // a ação sumiu (virou minha: Assumir → Resolver): o foco vai para «Mais ações»
    achar(chat.el, '.cvc-acoes [data-acao="assumir"]').focus();
    A.ver.conversa = { ...A.ver.conversa, atribuida_a: "u1", atribuida_nome: "Helena" };
    chat.renderCabecalho();
    assert.equal(d.doc.activeElement.dataset.acao, "mais");
  } finally { d.fim(); }
});

test("D9 (DOM) · ◷ → ✓ → ✓✓ muda o selo NO LUGAR (a bolha é a mesma: o leitor de tela não relê); falha ainda refaz a bolha com o aviso", async () => {
  const d = comDom();
  try {
    const m = txt(1, "out", 1, { status: "pendente" });
    const { A, chat } = await montarChat(d, { msgs: [m] });
    const bolha = achar(chat.el, '.cv-msg[data-id="1"]');
    assert.equal(achar(bolha, ".cv-st").getAttribute("aria-label"), "Enviando");
    A.msgs = [{ ...m, status: "entregue", atualizado_em: new Date().toISOString() }];
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector('.cv-msg[data-id="1"]'), bolha, "a mesma bolha");
    assert.equal(achar(bolha, ".cv-st").getAttribute("aria-label"), "Entregue");
    assert.equal(achar(bolha, ".cv-st").textContent, "✓✓");
    A.msgs = [{ ...m, status: "lida", atualizado_em: new Date(Date.now() + 1000).toISOString() }];
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector('.cv-msg[data-id="1"]'), bolha);
    assert.equal(achar(bolha, ".cv-st-txt").textContent, "lida");
    A.msgs = [{ ...m, status: "falhou", erro: "Número inválido", atualizado_em: new Date(Date.now() + 2000).toISOString() }];
    chat.renderMensagens({ rolar: "manter" });
    const nova = achar(chat.el, '.cv-msg[data-id="1"]');
    assert.notEqual(nova, bolha, "falha traz o bloco «Não enviada»: aí sim a bolha é refeita");
    assert.ok(nova.querySelector(".cv-falha"));
  } finally { d.fim(); }
});

test("D9 (DOM) · trocar de conversa solta os players de áudio da anterior", async () => {
  const d = comDom();
  try {
    const audio = id => ({ id, conversa_id: 9, direcao: "in", tipo: "audio", midia: { path: `a/${id}.ogg`, duracao: 5 }, status: "recebida", criado_em: agoraIso(5), atualizado_em: agoraIso(5) });
    const { A, chat } = await montarChat(d, { msgs: [audio(1), audio(2), audio(3)] });
    assert.equal(chat.contarPlayers(), 3);
    chat.mostrarCarregando();
    A.msgs = [audio(4)];
    chat.renderTudo({ rolar: "fim" });
    assert.equal(chat.contarPlayers(), 1, "antes os 3 da conversa anterior ficavam presos no conjunto");
  } finally { d.fim(); }
});

test("D10 (DOM) · «Enviar agora» desligado com o motivo (sem internet / 90 s) e ligado quando pode", async () => {
  const d = comDom();
  try {
    let estado = { motivo: "Sem internet agora: sai sozinha quando a conexão voltar.", espera: 0 };
    const local = { id: "tmp-1", local: true, ref: "orbita:x", conversa_id: 9, direcao: "out", tipo: "texto", corpo: "oi", status: "pendente", filaEstado: "fila", criado_em: agoraIso(0) };
    const { A, chat, chamadas } = await montarChat(d, { msgs: [local], acoes: { estadoEnviarAgora: () => estado } });
    let bt = achar(chat.el, ".cv-fila-agora");
    assert.equal(bt.disabled, true);
    assert.match(achar(chat.el, ".cv-fila-motivo").textContent, /Sem internet/);
    assert.equal(bt.getAttribute("aria-describedby"), achar(chat.el, ".cv-fila-motivo").id);
    bt.click();
    assert.deepEqual(chamadas.filter(c => c[0] === "enviarAgora"), [], "desligado não manda");
    estado = { motivo: "", espera: 0 };
    chat.renderMensagens({ rolar: "manter" });
    bt = achar(chat.el, ".cv-fila-agora");
    assert.equal(bt.disabled, false);
    bt.click();
    assert.deepEqual(chamadas.filter(c => c[0] === "enviarAgora"), [["enviarAgora", "tmp-1"]]);
    void A;
  } finally { d.fim(); }
});

test("D8 (DOM) · modelo/arquivo «pode ter saído» com client_ref oferece «Enviar de novo» (o mesmo ref) e «Descartar»", async () => {
  const d = comDom();
  try {
    const amb = { id: "tmp-9", local: true, conversa_id: 9, direcao: "out", tipo: "template", corpo: "Olá", status: "pendente", ambigua: true,
      erro: "Pode ter saído — confira no WhatsApp antes de reenviar.", pedido: { tipo: "template", client_ref: "orbita:abc12345" }, criado_em: agoraIso(0) };
    const { chat, chamadas } = await montarChat(d, { msgs: [amb] });
    const falha = achar(chat.el, ".cv-falha-ambigua");
    assert.match(falha.textContent, /Status incerto/);
    botaoTexto(falha, /Enviar de novo/).click();
    assert.deepEqual(chamadas.filter(c => c[0] === "reenviarLocal"), [["reenviarLocal", "tmp-9"]]);
    assert.ok(botaoTexto(falha, /Descartar/));
  } finally { d.fim(); }
});

test("D12/D18 (DOM) · com a IA atendendo o Resolver aparece como ícone; número desconectado vira pílula no cabeçalho", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { provedor: "codewords", ia: { disponivel: true, ia_ligada: true, pausada: false },
      acoes: { canalCaido: id => (id === "k1" ? { id: "k1", nome: "Recepção", desde: agoraIso(30) } : null) } });
    assert.ok(achar(chat.el, ".cvc-ia-acao"), "Assumir (pausa a IA) continua o primário");
    const ic = achar(chat.el, ".cvc-resolver-ic");
    assert.equal(ic.getAttribute("aria-keyshortcuts"), "Alt+Shift+R");
    ic.click();
    assert.match(achar(chat.el, ".cv-pil-caido").title, /Recepção está desconectado/);
    void A;
  } finally { d.fim(); }
});

/* ============================================================ (b) composer — D2, D5, D7, D14, D16 */
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

test("D2 (DOM) · nota interna: Enter repetido com a nota a caminho grava UMA; a mesma nota depois de falhar repete o MESMO p_req", async () => {
  const d = comDom();
  try {
    let soltar = null, falhar = true;
    const t = await montarComposer(d, { acoes: { nota: (texto, o) => { t.notas.push([texto, o.req]); return new Promise((ok, no) => { soltar = () => (falhar ? no(Object.assign(new Error("x"), { codigo: "sem_conexao" })) : ok({})); }); } } });
    t.comp.alternarNota(true);
    t.digitar("cobrar antes de marcar");
    d.ev(t.ta, "keydown", { key: "Enter" });
    d.ev(t.ta, "keydown", { key: "Enter" });
    d.ev(t.ta, "keydown", { key: "Enter" });
    assert.equal(t.notas.filter(n => n[0] === "cobrar antes de marcar").length, 1, "três Enter, uma nota a caminho");
    soltar(); await esperar(2);                                   // a rede caiu: o texto continua no campo
    assert.equal(t.ta.value, "cobrar antes de marcar");
    falhar = false;
    d.ev(t.ta, "keydown", { key: "Enter" });
    const reqs = t.notas.filter(n => n[0] === "cobrar antes de marcar").map(n => n[1]);
    assert.equal(reqs.length, 2);
    assert.match(reqs[0], /^[0-9a-f-]{36}$/);
    assert.equal(reqs[1], reqs[0], "a repetição da mesma nota usa o mesmo p_req: o servidor não grava duas");
    soltar(); await esperar(2);
    assert.equal(t.ta.value, "", "gravou: o campo limpa");
    assert.equal(t.comp.emNota, false);
  } finally { d.fim(); }
});

test("D5 (DOM) · texto que ficou como nota interna volta no modo nota depois de recarregar (antes: campo vazio em mensagem)", async () => {
  const d = comDom();
  try {
    const rasc = rascunhosDe(d);
    const t1 = await montarComposer(d, { rascunho: rasc });
    t1.digitar("lembrar de pedir o raio-x");
    t1.comp.alternarNota(true);                     // a pessoa leva o texto para a nota
    await esperar(5);
    t1.comp.desmontar();
    // recarregou a página: composer novo, mesma conversa
    const t2 = await montarComposer(d, { rascunho: rasc });
    assert.equal(t2.comp.emNota, true, "abre já em nota interna");
    assert.equal(t2.ta.value, "lembrar de pedir o raio-x");
    assert.equal(t2.comp.el.dataset.modo, "nota");
    assert.match(d.anuncios.join("\n"), /Rascunho de nota interna restaurado/);
    // com rascunho de MENSAGEM guardado, vale a mensagem (a nota não passa na frente)
    t2.comp.alternarNota(false);
    await esperar(5);
    const t3 = await montarComposer(d, { rascunho: rasc });
    assert.equal(t3.comp.emNota, false);
  } finally { d.fim(); }
});

test("D7 (DOM) · «Sugerir com IA»: botão e menu «+» não pedem de novo com um pedido a caminho; o item do menu fica desligado", async () => {
  const d = comDom();
  try {
    let pedidos = 0, soltar;
    const t = await montarComposer(d);
    t.aoIA(() => { pedidos++; return new Promise(ok => { soltar = ok; }); });
    achar(t.comp.el, '[aria-label="Sugerir resposta com IA"]').click();
    achar(t.comp.el, '[aria-label="Mais opções"]').click();
    const item = d.menus.at(-1).itens.find(x => /Sugerindo com IA|Sugerir com IA/.test(x.rotulo));
    assert.equal(item.desabilitado, true, "o item do menu fica desligado enquanto a IA escreve");
    item.fn();                                       // toque no item mesmo assim (menu antigo aberto)
    assert.equal(pedidos, 1, "uma chamada nx-ia (antes: duas, cota em dobro)");
    soltar({ texto: "Pode ser amanhã?" }); await esperar(2);
    assert.equal(t.ta.value, "Pode ser amanhã?");
  } finally { d.fim(); }
});

test("D14 (DOM) · contador com o teto da assinatura e o aviso do emoji; contato bloqueado explica e oferece «Desbloquear»", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d, { base: { cfg: { assinatura: true } } });
    assert.equal(t.ta.getAttribute("maxlength"), String(4096 - "*Helena:*\n".length));
    t.digitar("x".repeat(4000));
    const cont = achar(t.comp.el, ".cvx-contador");
    assert.equal(cont.textContent, "86 caracteres restantes", "4086 − 4000 (antes: 96, e o fim era cortado no servidor)");
    t.digitar("x".repeat(3990) + "😀");
    assert.match(cont.textContent, /emoji conta 2/);
    // texto acima do teto não sai
    t.digitar("y".repeat(4090));
    achar(t.comp.el, ".cvx-enviar").click();
    assert.deepEqual(t.enviados, []);
    assert.match(d.toasts.at(-1), /4\.086 caracteres \(a assinatura conta\)/);
    // nota interna não leva assinatura: teto cheio
    t.comp.alternarNota(true);
    assert.equal(t.ta.getAttribute("maxlength"), "4096");
    d.fim();
    const d2 = comDom();
    try {
      const b = await montarComposer(d2, { contato: { bloqueado: true } });
      assert.equal(b.ta.disabled, true);
      const trava = achar(b.comp.el, ".cvx-trava");
      assert.match(trava.textContent, /bloqueado: nada é enviado/);
      achar(trava, ".cvx-desbloquear").click();
      assert.deepEqual(b.notas.filter(n => n[0] === "ocultar"), [["ocultar", false]]);
    } finally { d2.fim(); }
  } finally { try { d.fim(); } catch { /* já restaurado */ } }
});

test("D16 (DOM) · a pílula «Marketing» do modelo diz a regra (só não vai para quem pediu para sair)", async () => {
  const d = comDom();
  try {
    const tpl = { id: "t1", canal_id: "k1", nome: "promo", status: "APPROVED", categoria: "MARKETING", corpo: "Oi {{1}}", num_parametros: 1, idioma: "pt_BR" };
    const t = await montarComposer(d, { base: { templates: [tpl] } });
    await t.comp.abrirModelos();
    const corpo = d.modais.at(-1).corpo;
    const pil = corpo.querySelectorAll(".pilula").find(p => p.textContent === "Marketing");
    assert.match(pil.title, /menos para quem pediu para sair/);
    assert.match(corpo.textContent, /Marketing só não vai para quem pediu para sair/);
  } finally { d.fim(); }
});

/* ============================================================ (b) lista — D18 */
test("D18 (DOM) · número desconectado: faixa na central com «Ver número» (admin) e nada quando todos estão conectados", async () => {
  const d = comDom();
  try {
    const { criarLista } = await import("../web/app/cv-lista.js");
    let caidos = [{ id: "k1", nome: "Recepção", desde: agoraIso(12) }];
    const chamadas = [];
    const A = { ui: d.ui, L, podeEscrever: true, ctx: { papel: "admin" }, aba: "minhas", busca: "", filtro: {}, itens: [], contagens: {}, base: { canais: [{ id: "k1" }] },
      acoes: { novaConversa() {}, atenderProximo() {}, mudarLista() {}, carregarLista() {}, repetirBuscaMensagens() {}, lerAvisos: () => ({ som: false, tela: false }), pode: () => true,
        menuAvisos() {}, rascunhoDe: () => "", filaResumo: () => null, nomeContato: c => (c && c.nome) || "", canaisCaidos: () => caidos, verNumero: () => chamadas.push("verNumero") } };
    const lista = criarLista(A);
    d.doc.body.appendChild(lista.el);
    lista.render();
    const faixa = achar(lista.el, ".cvl-caido");
    assert.equal(faixa.hidden, false);
    assert.match(faixa.textContent, /Número «Recepção» desconectado desde .*: as mensagens não chegam nem saem/);
    botaoTexto(faixa, /Ver número/).click();
    assert.deepEqual(chamadas, ["verNumero"]);
    const no = faixa.firstChild;
    lista.render();
    assert.equal(faixa.firstChild, no, "sem mudança não redesenha (o leitor de tela não repete)");
    caidos = [];
    lista.render();
    assert.equal(faixa.hidden, true);
  } finally { d.fim(); }
});

/* ============================================================ (c) a central inteira (conversas.js) sobre o DOM mínimo */
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

test("D3 (central) · mensagem que chega na conversa aberta e visível é marcada como lida (uma RPC); D9: abrir sem nada novo não chama recibo", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    assert.equal(srv.conta("nx_cv_marcar_lida"), 0, "nada não lido ao abrir: nenhuma RPC");
    assert.equal(srv.conta("nx-enviar:lido"), 0, "nem o recibo ao cliente (antes: uma Edge Function por clique)");
    srv.chegar(901, "tudo bem?");
    await c.pulso();
    assert.equal(srv.conta("nx_cv_marcar_lida"), 1, "a mensagem que chegou à vista é marcada como lida");
    assert.equal(srv.convs[0].nao_lidas, 0);
    assert.equal(srv.conta("nx-enviar:lido"), 1, "e o recibo sai porque havia mensagem nova");
    // mensagem em OUTRA conversa não marca a aberta
    srv.chegar(902, "oi");
    await c.pulso();
    assert.equal(srv.conta("nx_cv_marcar_lida"), 1);
    // aba escondida: não marca; ao voltar a ficar visível, marca
    d.doc.hidden = true;
    srv.chegar(901, "alô?");
    await c.pulso();
    assert.equal(srv.conta("nx_cv_marcar_lida"), 1, "escondida: continua não lida");
    d.doc.hidden = false;
    d.doc.dispatchEvent(new d.Evento("visibilitychange"));
    await esperar(20);
    assert.equal(srv.conta("nx_cv_marcar_lida"), 2, "voltou a ficar visível com mensagem não lida: marca");
  } finally { c.fim(); d.fim(); }
});

test("D6 (central) · depois de «Carregar mais», o pulso não encolhe a lista para 100", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 160 });
  const c = await montarCentral(d, srv);
  try {
    const itens = () => c.alvo.querySelectorAll(".cvl-item").length;
    assert.equal(itens(), 50);
    for (let i = 0; i < 2; i++) { botaoTexto(c.alvo, /Carregar mais/).click(); await esperar(20); }
    assert.equal(itens(), 150);
    srv.chegar(1050, "subi");                       // uma conversa lá de baixo recebe mensagem e sobe para o topo
    await c.pulso();
    assert.equal(itens(), 150, "as 150 carregadas continuam (antes: 100)");
    assert.equal(c.alvo.querySelector(".cvl-item").dataset.id, "1050");
    assert.ok(botaoTexto(c.alvo, /Carregar mais/), "ainda há mais para carregar");
  } finally { c.fim(); d.fim(); }
});

test("D8 (central) · modelo vai com client_ref; prazo estourado vira «pode ter saído» e «Enviar de novo» repete o MESMO ref; 409 confere de novo sem falhar", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    let falhas = [Object.assign(new Error("tempo_rede"), { codigo: "tempo_rede" })];
    const enviar = srv.fns["nx-enviar"];
    srv.fns["nx-enviar"] = corpo => { if (corpo.acao === "template" && falhas.length) throw falhas.shift(); return enviar(corpo); };
    d.aoModal(async o => { if (o.titulo && /Enviar modelo/.test(o.titulo)) { o.corpo.querySelector(".cv-modelo").click(); o.corpo.querySelector("input").value = "Mariana"; return o.acoes[1].fn({ erro() {} }); } return true; });
    achar(c.alvo, '[aria-label="Enviar modelo aprovado"]').click();
    await esperar(30);
    const pedidos = () => srv.chamadas.filter(x => x[0] === "nx-enviar:template").map(x => x[1].client_ref);
    assert.equal(pedidos().length, 1);
    assert.match(pedidos()[0], /^orbita:/, "o modelo leva client_ref (antes: sem)");
    const falha = achar(c.alvo, ".cv-falha-ambigua");
    assert.match(falha.textContent, /Pode ter saído/);
    botaoTexto(falha, /Enviar de novo/).click();
    await esperar(30);
    assert.equal(pedidos().length, 2);
    assert.equal(pedidos()[1], pedidos()[0], "a repetição usa o MESMO client_ref: se o primeiro saiu, o servidor devolve o gravado");
    assert.equal(c.alvo.querySelector(".cv-falha"), null, "e a bolha virou a mensagem gravada");
    // 409 envio_em_andamento (outro pedido com o mesmo ref está saindo): a bolha fica «enviando», sem «Não enviada» nem «Tentar de novo»
    falhas = [Object.assign(new Error("envio_em_andamento"), { codigo: "envio_em_andamento", status: 409 })];
    achar(c.alvo, '[aria-label="Enviar modelo aprovado"]').click();
    await esperar(30);
    assert.equal(pedidos().length, 3);
    assert.equal(c.alvo.querySelector(".cv-falha"), null, "409 não é falha (antes: «Não enviada» com «Tentar de novo»)");
    const pendente = c.alvo.querySelectorAll(".cv-msg").at(-1);
    assert.equal(pendente.querySelector(".cv-st").getAttribute("aria-label"), "Enviando");
  } finally { c.fim(); d.fim(); }
});

test("D2 (central) · nota com p_req; banco sem a função nova (404 PGRST202) cai na de sempre uma vez", async () => {
  const d = comDom();
  const srv = criarServidor();
  const nota = srv.handlers.nx_cv_nota;
  srv.handlers.nx_cv_nota = p => { if (p.p_req) throw Object.assign(new Error("Could not find the function"), { codigo: "PGRST202", status: 404 }); return nota(p); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    achar(c.alvo, '[aria-label="Nota interna"]').click();
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "cliente pediu boleto"; d.ev(ta, "input");
    achar(c.alvo, ".cvx-enviar").click();
    await esperar(30);
    const chamadas = srv.chamadas.filter(x => x[0] === "nx_cv_nota");
    assert.equal(chamadas.length, 2);
    assert.match(chamadas[0][1].p_req, /^[0-9a-f-]{36}$/, "tenta com p_req (S-B13)");
    assert.equal(chamadas[1][1].p_req, undefined, "e cai na sem p_req");
    assert.equal(srv.msgs.get(901).filter(m => m.tipo === "nota").length, 1, "uma nota");
    // a próxima nota já vai direto sem p_req (detecção lembrada)
    achar(c.alvo, '[aria-label="Nota interna"]').click();
    ta.value = "segunda"; d.ev(ta, "input");
    achar(c.alvo, ".cvx-enviar").click();
    await esperar(30);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx_cv_nota").length, 3);
  } finally { c.fim(); d.fim(); }
});

test("D9 (central) · desmontar limpa os timers do módulo: o pulso pendente não roda contra a tela montada em seguida", async () => {
  const d = comDom();
  const srv = criarServidor();
  let c = await montarCentral(d, srv);
  try {
    for (const fn of c.pulsos) fn();                 // pulso agendado (250 ms)
    c.fim();
    c = await montarCentral(d, srv);
    const antes = srv.conta("nx_cv_listar");
    await esperar(400);
    assert.equal(srv.conta("nx_cv_listar"), antes, "nenhuma leitura extra da lista vinda do pulso da tela anterior");
  } finally { c.fim(); d.fim(); }
});

test("D12 (central) · Transferir tem Desfazer: nada vai ao servidor antes de o aviso fechar; Desfazer devolve; sair de Minhas avisa no modal", async () => {
  const d = comDom();
  const srv = criarServidor();
  srv.convs[0].atribuida_a = "u1"; srv.convs[0].atribuida_nome = "Helena Souza";
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    let avisoVisivel = null;
    d.aoModal(async o => { if (/Transferir/.test(o.titulo)) { const s = o.corpo.querySelector("#cv-tr-pessoa"); s.value = "u2"; d.ev(s, "change"); avisoVisivel = !o.corpo.querySelector(".cv-tr-aviso").hidden; return o.acoes[1].fn(); } return true; });
    achar(c.alvo, ".cvc-transferir").click();
    await esperar(20);
    assert.equal(avisoVisivel, true, "tirar das Minhas avisa no próprio modal");
    assert.equal(srv.conta("nx_cv_atribuir"), 0, "nada foi ao servidor ainda");
    const des = d.desfazeres.at(-1);
    assert.match(des.texto, /Transferida para Ana Paula · Cliente 1/);
    assert.match(achar(c.alvo, ".cv-pil-status").textContent, /Com Ana Paula/, "a tela já mostra a transferência");
    await c.pulso();
    assert.match(achar(c.alvo, ".cv-pil-status").textContent, /Com Ana Paula/, "o pulso não desfaz a tela enquanto o aviso está aberto");
    des.reverter();
    await esperar(20);
    assert.match(achar(c.alvo, ".cv-pil-status").textContent, /Com Helena Souza/, "Desfazer devolve");
    assert.equal(srv.conta("nx_cv_atribuir"), 0, "e nada foi escrito");
    // de novo, agora deixando o aviso fechar
    achar(c.alvo, ".cvc-transferir").click();
    await esperar(20);
    await d.desfazeres.at(-1).firmar({});
    assert.equal(srv.conta("nx_cv_atribuir"), 1);
    assert.equal(srv.convs[0].atribuida_a, "u2");
  } finally { c.fim(); d.fim(); }
});

test("D20 (central) · etiquetas: pedidos em ordem, um por vez — marcar A e B rápido termina com [A, B] no servidor e na tela", async () => {
  const d = comDom();
  const srv = criarServidor();
  const ordem = [];
  const etq = srv.handlers.nx_cv_etiquetas;
  srv.handlers.nx_cv_etiquetas = p => { ordem.push(p.p_etiquetas.join(",")); return etq(p); };
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const sel = achar(c.alvo, ".sel-etiq");
    const a = sel.mudar(["e1"]);
    const b = sel.mudar(["e1", "e2"]);
    await Promise.all([a, b]); await esperar(10);
    assert.deepEqual(ordem, ["e1", "e1,e2"], "na ordem, sem atropelar");
    assert.deepEqual(srv.convs[0].etiquetas, ["e1", "e2"]);
    assert.equal(sel.dataset.definido, "e1,e2");
  } finally { c.fim(); d.fim(); }
});

test("D13 (central) · «Nova conversa»: máscara no telefone, erro no próprio campo (DDD inválido) e «+» de outro país aceito", async () => {
  const d = comDom();
  const srv = criarServidor();
  const c = await montarCentral(d, srv);
  try {
    let modal = null;
    d.aoModal(async o => { modal = o; return null; });
    botaoTexto(c.alvo, /^Nova$/).click();
    await esperar(5);
    const tel = achar(modal.corpo, "#cv-nv-tel");
    tel.value = "12997773031"; tel.selectionStart = 11; d.ev(tel, "input");
    assert.equal(tel.value, "(12) 99777-3031", "máscara enquanto digita");
    tel.value = "10 99777-3031"; d.ev(tel, "input"); d.ev(tel, "blur");
    const erro = achar(modal.corpo, ".cv-nv-tel-erro");
    assert.equal(erro.hidden, false);
    assert.match(erro.textContent, /DDD 10 não existe/);
    assert.equal(tel.getAttribute("aria-invalid"), "true");
    assert.match(tel.getAttribute("aria-describedby"), /cv-nv-tel-erro/);
    tel.value = "+1 415 555 1234"; d.ev(tel, "input");
    assert.equal(erro.hidden, true, "número de outro país com + vale");
    assert.equal(tel.value, "+1 415 555 1234");
  } finally { c.fim(); d.fim(); }
});

test("D15 (central) · o PUT do arquivo que cai na rede tenta mais uma vez sozinho (sem pedir «Tentar de novo»)", async () => {
  const d = comDom();
  const srv = criarServidor();
  let xhrs = 0;
  class XHRFalso {
    constructor() { this.upload = { addEventListener() {} }; this.ouv = {}; this.status = 0; xhrs++; this.n = xhrs; }
    open() {} setRequestHeader() {}
    addEventListener(t, fn) { this.ouv[t] = fn; }
    send() { setTimeout(() => { if (this.n === 1) this.ouv.error(); else { this.status = 200; this.ouv.load(); } }, 1); }
    abort() { this.ouv.abort && this.ouv.abort(); }
  }
  Object.defineProperty(globalThis, "XMLHttpRequest", { value: XHRFalso, configurable: true, writable: true });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.aoModal(async () => true);
    const arquivo = new File(["%PDF-1.4"], "orcamento.pdf", { type: "application/pdf" });
    const comp = c.alvo.querySelector(".cvx");
    assert.ok(comp);
    // anexar pelo clipe: o input file recebe o arquivo
    const input = c.alvo.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [arquivo], configurable: true });
    d.ev(input, "change");
    await esperar(1800);
    assert.equal(xhrs, 2, "uma nova tentativa do PUT");
    assert.equal(srv.chamadas.filter(x => x[0] === "nx-enviar:midia").length, 1, "e o arquivo foi enviado");
    assert.equal(c.alvo.querySelector(".cv-falha"), null, "sem «Não enviada»");
  } finally { c.fim(); d.fim(); }
});

test("D19 (central) · fila entre abas: com a trava do item (Web Locks) nas mãos de outra aba, esta não transmite", async () => {
  const d = comDom();
  const srv = criarServidor();
  const original = crypto.randomUUID;
  crypto.randomUUID = () => "11111111-2222-4333-8444-555555555555";
  let soltarTrava;
  const segurando = new Promise(ok => { soltarTrava = ok; });
  // «outra aba» segura a trava do item que esta aba vai criar
  const pego = new Promise(ok => navigator.locks.request("orbita-fila:orbita:11111111-2222-4333-8444-555555555555", async () => { ok(); await segurando; }));
  await pego;
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    const ta = achar(c.alvo, "textarea[aria-label=Mensagem]");
    ta.value = "confirmado para amanhã"; d.ev(ta, "input");
    achar(c.alvo, ".cvx-enviar").click();
    await esperar(40);
    assert.equal(srv.chamadas.filter(x => x[0] === "nx-enviar:texto").length, 0, "a outra aba está transmitindo este item: nada sai daqui");
    soltarTrava();
    await esperar(20);
  } finally { crypto.randomUUID = original; c.fim(); d.fim(); }
});

/* ============================================================ (d) fonte e CSS */
test("fonte · contratos da onda 1 usados: seletorEtiquetas com {seq}/seqAtual/definir, ctx.canais, ui.checkSucesso, ui.vazio({tema}), sem hex nem transition: all", () => {
  const lat = ler("cv-lateral.js"), chat = ler("cv-chat.js"), conv = ler("conversas.js"), css = ler("conversas.css");
  assert.match(lat, /aoMudar: async \(ids, info\) => \{[\s\S]{0,200}seq === el\.seqAtual\(\)/);
  assert.match(lat, /el\.definir\(r\.etiquetas \|\| ids\)/);
  assert.match(chat, /typeof sel\.seqAtual !== "function" \|\| seq === sel\.seqAtual\(\)/);
  assert.match(conv, /ctx\.canais\.assinar\(lista =>/);
  assert.match(chat, /ui\.checkSucesso\(alvoOk/);
  assert.match(chat, /tema: "conversas"/);
  assert.match(conv, /navigator\.locks/);
  // .append() com filho que pode ser null escreveria «null» na tela: lista condicional vai por .append(...[a, b].filter(Boolean)) (app.teste.mjs também varre)
  const filaAgora = chat.slice(chat.indexOf("fila.append(...[h(\"button\", { type: \"button\", class: \"bt bt-fant bt-p cv-fila-agora\""));
  assert.ok(filaAgora.length > 0 && /^fila\.append\(\.\.\.\[[\s\S]{0,700}?\]\.filter\(Boolean\)\);/.test(filaAgora), "o «Enviar agora» com motivo usa .filter(Boolean)");
  const bloco = css.slice(css.indexOf("Plano 100 (08/10/2026) — frente D"));
  assert.ok(bloco.length > 200);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "sem hex");
  assert.doesNotMatch(bloco, /transition:\s*all/);
  assert.match(bloco, /\.cvt-nome-bts \.bt \{ min-height: 44px; \}/);
  assert.match(bloco, /\[hidden\][^{]*\{ display: none !important; \}/);
});

test("revisão · D6: pulso durante a troca de aba NÃO mistura conversas da aba anterior", async () => {
  const d = comDom();
  const srv = criarServidor({ conversas: 0 });
  // 60 abertas antigas (ids 1001..) e 120 resolvidas recentes (ids 2001..)
  for (let i = 0; i < 60; i++) { srv.convs.push({ id: 1001 + i, contato: { id: 5000 + i, nome: `Aberta ${i}` }, canal_id: "k1", status: "aberta", aguardando: true, nao_lidas: 0, ultima_msg_em: agoraIso(500 + i), ultima_entrada_em: agoraIso(500 + i), etiquetas: [] }); srv.msgs.set(1001 + i, []); }
  for (let i = 0; i < 120; i++) { srv.convs.push({ id: 2001 + i, contato: { id: 6000 + i, nome: `Resolvida ${i}` }, canal_id: "k1", status: "resolvida", aguardando: false, nao_lidas: 0, ultima_msg_em: agoraIso(1 + i), ultima_entrada_em: agoraIso(1 + i), etiquetas: [] }); srv.msgs.set(2001 + i, []); }
  const listar = srv.handlers.nx_cv_listar;
  srv.handlers.nx_cv_listar = p => {
    const aba = p.p_filtro && p.p_filtro.aba;
    const lim = Math.min(100, Number(p.p_limite) || 50);
    let lista = srv.convs.filter(c => aba === "resolvidas" ? c.status === "resolvida" : c.status !== "resolvida")
      .sort((a, b) => Date.parse(b.ultima_msg_em) - Date.parse(a.ultima_msg_em) || b.id - a.id);
    if (p.p_antes) lista = lista.filter(c => Date.parse(c.ultima_msg_em) < Date.parse(p.p_antes));
    return { itens: lista.slice(0, lim).map(c => ({ ...c })), tem_mais: lista.length > lim, contagens: {} };
  };
  const rpcOrig = srv.api.rpcC;
  srv.api.rpcC = async (nome, p = {}, o = {}) => {
    if (nome === "nx_cv_listar" && p.p_filtro && p.p_filtro.aba === "resolvidas" && p.p_limite === 50) await esperar(400); // a troca de aba demora
    return rpcOrig(nome, p, o);
  };
  const c = await montarCentral(d, srv, { rota: { partes: [], query: { aba: "abertas" } } });
  try {
    const ids = () => [...c.alvo.querySelectorAll(".cvl-item")].map(x => Number(x.dataset.id));
    const troca = c.ctx.navegar("#/conversas?aba=resolvidas");
    await esperar(50);
    for (const fn of c.pulsos) fn();
    await esperar(1500);
    await troca;
    const agora = ids();
    const intrusas = agora.filter(id => id < 2000);
    assert.equal(intrusas.length, 0, "conversas abertas apareceram na aba Resolvidas");
  } finally { c.fim(); d.fim(); }
});

test("revisão · D2+D5: nota gravada com troca de conversa no meio NÃO volta como rascunho", async () => {
  const d = comDom();
  try {
    const rasc = rascunhosDe(d);
    let soltar = null;
    const t = await montarComposer(d, { rascunho: rasc, acoes: { nota: (texto, o) => new Promise(ok => { soltar = () => ok({ id: 1 }); }) } });
    t.comp.alternarNota(true);
    t.digitar("cliente prefere de manhã");
    await esperar(5);
    d.ev(t.ta, "keydown", { key: "Enter" });          // a nota sai...
    t.A.selId = 10; t.A.ver = { ...t.A.ver, conversa: { ...t.A.ver.conversa, id: 10 } };
    t.comp.definirConversa();                          // ...e a pessoa abre outra conversa antes da resposta
    soltar(); await esperar(5);                        // o servidor gravou a nota
    t.A.selId = 9; t.A.ver = { ...t.A.ver, conversa: { ...t.A.ver.conversa, id: 9 } };
    t.comp.definirConversa();                          // volta para a conversa da nota
    assert.equal(t.ta.value, "", "a nota já gravada voltou como rascunho");
  } finally { d.fim(); }
});

test("revisão · D15: «Cancelar» durante a espera da 2ª tentativa vale (o arquivo não sai)", async () => {
  const d = comDom();
  const srv = criarServidor();
  let xhrs = 0;
  class XHRSpec {      // como o navegador: depois do «error» o pedido está DONE e abort() não dispara nada
    constructor() { this.upload = { addEventListener() {} }; this.ouv = {}; this.status = 0; this.feito = false; xhrs++; this.n = xhrs; }
    open() {} setRequestHeader() {}
    addEventListener(t, fn) { this.ouv[t] = fn; }
    send() { setTimeout(() => { if (this.feito) return; this.feito = true; if (this.n === 1) this.ouv.error(); else { this.status = 200; this.ouv.load(); } }, 1); }
    abort() { if (this.feito) return; this.feito = true; this.ouv.abort && this.ouv.abort(); }
  }
  Object.defineProperty(globalThis, "XMLHttpRequest", { value: XHRSpec, configurable: true, writable: true });
  const c = await montarCentral(d, srv);
  try {
    await c.abrir(901);
    d.aoModal(async () => true);
    const arquivo = new File(["%PDF-1.4"], "orcamento.pdf", { type: "application/pdf" });
    const input = c.alvo.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [arquivo], configurable: true });
    d.ev(input, "change");
    await esperar(200);                                  // 1º PUT caiu; espera de 1,5 s antes da nova tentativa
    const bt = c.alvo.querySelector(".cv-prog-cancel");
    if (bt) bt.click();
    await esperar(1800);
    const enviados = srv.chamadas.filter(x => x[0] === "nx-enviar:midia").length;
    assert.equal(enviados, 0, "a pessoa cancelou e o arquivo foi enviado mesmo assim");
  } finally { c.fim(); d.fim(); }
});
