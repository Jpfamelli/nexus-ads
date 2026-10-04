/* ============================================================
   ÓRBITA — plano «50+ melhorias» (04/10/2026) · frente A: sistema visual e biblioteca
   node --test testes/plano50-sistema.teste.mjs
   Testes de COMPORTAMENTO (DOM de mentira, sem dependências) das peças novas de ui.js e graficos.js:
   A1 sparkline · A2 dica por teclado nas barras e no mapa de calor · A3 rosca com legenda clicável e taxas do funil · A4 ui.kpi ·
   A5 ilustrações do vazio · A6 esqueletos por tipo · A7 check de sucesso · A8 tabela com aria-sort · A9 pílulas semânticas e avatar ·
   A10 ui.dica · A12 transição de rota (app.js + CSS) · A13/A14/A15 tema escuro, login e foco (regex só como complemento).
   O DOM de mentira é instalado ANTES de importar o ui.js, para a delegação das dicas se pendurar nele (como no navegador).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const esperar = ms => new Promise(r => setTimeout(r, ms));

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

const U = await import(pathToFileURL(join(APP, "ui.js")).href);
const G = await import(pathToFileURL(join(APP, "graficos.js")).href);
const h = U.h;
const CSS = ler("app.css");
const BLOCO = CSS.slice(CSS.lastIndexOf("/* ====", CSS.indexOf("PLANO 50 (04/10/2026) — frente A")));   // do abre-comentário do bloco até o fim

/* ============================================================ A1 · sparkline */
test("A1 · G.sparkline: SVG com área, traço e último ponto; tendência e resumo acessível; cor validada", () => {
  const alvo = h("div"); doc.body.appendChild(alvo);
  const r = G.sparkline(alvo, { valores: [2, 4, 3, 8], rotulo: "Conversas", cor: "#123456" });
  const svg = alvo.querySelector("svg.g-spark");
  assert.ok(svg, "svg desenhado"); assert.equal(r.tendencia, "sobe"); assert.equal(svg.getAttribute("data-tendencia"), "sobe");
  assert.ok(alvo.querySelector(".g-spark-area") && alvo.querySelector(".g-spark-linha") && alvo.querySelector("circle.g-spark-fim"), "área, linha e ponto final");
  assert.match(svg.getAttribute("aria-label"), /^Conversas: de 2 a 8 em 4 pontos, subindo$/);
  assert.equal(svg.style.getPropertyValue("--g"), "#123456", "cor válida entra como --g");
  assert.equal(svg.getAttribute("role"), "img");
  const alvo2 = h("div"); G.sparkline(alvo2, { valores: [5, 1], rotulo: "x", cor: "vermelho", area: false });
  assert.equal(alvo2.querySelector("svg").style.getPropertyValue("--g"), "", "cor inválida é ignorada");
  assert.equal(alvo2.querySelector(".g-spark-area"), null, "area:false não desenha a área");
  assert.equal(alvo2.querySelector("svg").getAttribute("data-tendencia"), "desce");
  typeof r.destruir === "function" && r.destruir();
});
test("A1 · sparkline sem histórico (0 ou 1 número) desenha o traço «sem histórico» e diz isso; geometria pura", () => {
  const alvo = h("div");
  const r = G.sparkline(alvo, { valores: [7], rotulo: "Consultas" });
  const vazio = alvo.querySelector(".g-spark-vazio");
  assert.ok(vazio && !alvo.querySelector("svg"), "só o traço vazio");
  assert.equal(vazio.getAttribute("aria-label"), "Consultas: sem histórico suficiente"); assert.equal(r.tendencia, "igual");
  assert.deepEqual(G.pontosSparkline([], 100, 32), []);
  const reta = G.pontosSparkline([3, 3, 3], 100, 32, 4);
  assert.equal(reta.length, 3); assert.ok(reta.every(p => Math.abs(p[1] - 16) < .01), "série reta fica no meio da altura");
  const comNulo = G.pontosSparkline([1, null, 5], 100, 32, 4);
  assert.equal(comNulo.length, 2); assert.equal(comNulo[0][0], 4); assert.equal(comNulo[1][0], 96);
  assert.equal(G.tendenciaDe([1, 2, 1]), "igual"); assert.equal(G.tendenciaDe([null, 2, 5]), "sobe"); assert.equal(G.tendenciaDe([9]), "igual");
});

/* ============================================================ A2 · dica por teclado */
test("A2 · G.barras: caixa focável; ↓ ↑ Home End leem linha a linha na dica (aria-live), Esc fecha; a linha ativa é marcada", () => {
  const alvo = h("div"); doc.body.appendChild(alvo);
  G.barras(alvo, { itens: [{ rotulo: "Google", valores: [10, 4] }, { rotulo: "Meta", valores: [6, 1], extra: "2 campanhas" }], series: [{ nome: "Criados", classe: "g-s0" }, { nome: "Ganhos", classe: "g-s1" }], fmt: v => String(v), resumo: "Por origem" });
  const caixa = alvo.querySelector(".g-caixa.g-hcaixa");
  assert.ok(caixa); assert.equal(caixa.getAttribute("tabindex"), "0"); assert.equal(caixa.getAttribute("role"), "group"); assert.match(caixa.getAttribute("aria-label"), /setas/);
  const dica = caixa.querySelector(".g-dica");
  assert.ok(dica && dica.hidden, "dica existe e começa escondida"); assert.equal(dica.getAttribute("aria-live"), "polite");
  ev(caixa, "keydown", { key: "ArrowDown" });
  assert.equal(dica.hidden, false); assert.equal(dica.textContent, "Google — Criados: 10 · Ganhos: 4");
  assert.ok(caixa.querySelectorAll(".g-hitem")[0].classList.contains("g-ativa"));
  ev(caixa, "keydown", { key: "ArrowDown" });
  assert.equal(dica.textContent, "Meta (2 campanhas) — Criados: 6 · Ganhos: 1");
  ev(caixa, "keydown", { key: "ArrowDown" });
  assert.equal(dica.textContent, "Meta (2 campanhas) — Criados: 6 · Ganhos: 1", "não passa da última");
  ev(caixa, "keydown", { key: "Home" }); assert.match(dica.textContent, /^Google/);
  ev(caixa, "keydown", { key: "End" }); assert.match(dica.textContent, /^Meta/);
  ev(caixa, "keydown", { key: "Escape" });
  assert.equal(dica.hidden, true); assert.equal(caixa.querySelectorAll(".g-ativa").length, 0);
});
test("A2 · G.calor: setas percorrem hora (← →) e dia (↑ ↓), a célula ativa ganha g-ativa e a dica fala «dia hora: valor»", () => {
  const alvo = h("div"); doc.body.appendChild(alvo);
  const matriz = Array.from({ length: 7 }, () => Array(24).fill(0)); matriz[1][8] = 3; matriz[2][8] = 5; matriz[2][9] = 1;
  G.calor(alvo, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => `${v} conversas`, resumo: "Leads por dia e hora" });
  const caixa = alvo.querySelector(".g-caixa.g-calcaixa"), dica = caixa.querySelector(".g-dica");
  assert.equal(caixa.getAttribute("tabindex"), "0");
  ev(caixa, "keydown", { key: "ArrowRight" });
  assert.equal(dica.textContent, "seg 08h: 3 conversas", "começa na segunda às 8h");
  ev(caixa, "keydown", { key: "ArrowDown" }); assert.equal(dica.textContent, "ter 08h: 5 conversas");
  ev(caixa, "keydown", { key: "ArrowRight" }); assert.equal(dica.textContent, "ter 09h: 1 conversas");
  const ativa = caixa.querySelector(".g-cal-c.g-ativa");
  assert.ok(ativa); assert.equal(ativa.getAttribute("data-h"), "9"); assert.equal(ativa.getAttribute("data-l"), "1");
  ev(caixa, "keydown", { key: "End" }); assert.equal(dica.textContent, "ter 23h: 0 conversas");
  ev(caixa, "keydown", { key: "ArrowUp" }); ev(caixa, "keydown", { key: "ArrowUp" }); assert.match(dica.textContent, /^seg 23h/, "não sobe acima da segunda");
  ev(caixa, "blur"); assert.equal(dica.hidden, true); assert.equal(caixa.querySelectorAll(".g-ativa").length, 0);
});

/* ============================================================ A3 · rosca com legenda clicável e funil com taxas */
test("A3 · G.donut: legenda de botões (aria-pressed), esconder uma fatia refaz a rosca, o centro e os percentuais; aoMudar; mostrar de novo", () => {
  const alvo = h("div"); doc.body.appendChild(alvo);
  const mudou = [];
  G.donut(alvo, { fatias: [{ rotulo: "Google", valor: 60 }, { rotulo: "Meta", valor: 30, cor: "#ABCDEF" }, { rotulo: "Indicação", valor: 10 }], fmt: v => String(v), centro: { rotulo: "leads" }, resumo: "Origem dos leads", aoMudar: v => mudou.push(v) });
  const ops = alvo.querySelectorAll(".g-donut-op");
  assert.equal(ops.length, 3); assert.ok(ops.every(b => b.getAttribute("aria-pressed") === "true" && b.localName === "button"));
  assert.equal(alvo.querySelectorAll(".g-fatia").length, 3);
  assert.equal(alvo.querySelector(".g-donut-n").textContent, "100", "centro = total visível");
  assert.equal(ops[0].querySelector("b").textContent, "60 · 60%");
  assert.equal(alvo.querySelectorAll(".g-fatia")[1].style.getPropertyValue("--g"), "#ABCDEF", "cor da fatia validada");
  ops[0].click();
  assert.equal(ops[0].getAttribute("aria-pressed"), "false"); assert.ok(ops[0].parentNode.classList.contains("g-oculta"));
  assert.equal(alvo.querySelectorAll(".g-fatia").length, 2, "a fatia escondida sai da rosca");
  assert.equal(alvo.querySelector(".g-donut-n").textContent, "40", "o centro passa a ser o total do que ficou");
  assert.equal(ops[1].querySelector("b").textContent, "30 · 75%", "percentual refeito"); assert.equal(ops[0].querySelector("b").textContent, "60", "escondida: sem percentual");
  assert.deepEqual(mudou, [[1, 2]]);
  assert.match(alvo.querySelector("svg").getAttribute("aria-label"), /1 fatia escondida/);
  ops[0].click();
  assert.equal(alvo.querySelectorAll(".g-fatia").length, 3); assert.equal(alvo.querySelector(".g-donut-n").textContent, "100");
  // foco no item da legenda fala a fatia na dica e a destaca
  const dica = alvo.querySelector(".g-dica");
  ev(ops[2], "focus"); assert.equal(dica.hidden, false); assert.equal(dica.textContent, "Indicação: 10 (10%)");
  assert.ok(ops[2].classList.contains("g-ativa")); assert.ok(alvo.querySelectorAll(".g-fatia")[2].classList.contains("g-ativa"));
  ev(ops[2], "blur"); assert.equal(dica.hidden, true);
});
test("A3 · G.donut com tudo escondido mostra «—» e centro fixo quando a tela manda valor; G.funil calcula a taxa entre etapas vizinhas (sem inventar)", () => {
  const alvo = h("div");
  G.donut(alvo, { fatias: [{ rotulo: "A", valor: 1 }], fmt: v => String(v), centro: { valor: "1", rotulo: "x" }, resumo: "r" });
  assert.equal(alvo.querySelector(".g-donut-n").textContent, "1");
  alvo.querySelector(".g-donut-op").click();
  assert.equal(alvo.querySelector(".g-donut-n").textContent, "—"); assert.equal(alvo.querySelectorAll(".g-fatia").length, 0);
  assert.deepEqual(G.taxaEntreEtapas(5, 10), { pct: 50, texto: "50% da etapa anterior" });
  assert.equal(G.taxaEntreEtapas(1, 0), null); assert.equal(G.taxaEntreEtapas(3, 40).texto, "7,5% da etapa anterior"); assert.equal(G.taxaEntreEtapas(0, 4).texto, "0% da etapa anterior");
  const f = h("div");
  G.funil(f, { etapas: [{ nome: "Lead", qtd: 40 }, { nome: "Conversa", qtd: 20 }, { nome: "Agendado", qtd: 5, conversao: "texto da tela" }, { nome: "Ganho", qtd: 0 }], resumo: "Funil" });
  const conv = f.querySelectorAll(".g-fconv").map(x => x.textContent);
  assert.deepEqual(conv, ["", "50% da etapa anterior", "texto da tela", "0% da etapa anterior"]);
  assert.equal(f.querySelectorAll(".g-fconv")[1].getAttribute("data-taxa"), "50");
  const f2 = h("div"); G.funil(f2, { etapas: [{ nome: "A", qtd: 4 }, { nome: "B", qtd: 2 }], resumo: "x", taxas: false });
  assert.deepEqual(f2.querySelectorAll(".g-fconv").map(x => x.textContent), ["", ""], "taxas: false desliga");
});

/* ============================================================ A4 · ui.kpi */
test("A4 · ui.kpi: número formatado, seta com cor semântica (invertido), «—» sem valor, ajuda no «i» focável, sparkline montada sob demanda", async () => {
  limparCorpo();
  const k = U.kpi({ rotulo: "Conversas aguardando", valor: 1234, variacao: 0.12, serie: [3, 5, 4, 9], ajuda: "Conversas sem resposta da equipe agora." });
  doc.body.appendChild(k);
  assert.equal(k.localName, "article"); assert.ok(k.classList.contains("kpi") && k.classList.contains("kpi-com-serie"));
  assert.equal(k.querySelector(".kpi-valor").textContent, "1.234"); assert.ok(k.querySelector(".kpi-valor").classList.contains("dado"), "número em Plex (.dado)");
  const v = k.querySelector(".kpi-var");
  assert.ok(v.classList.contains("kpi-var-bom")); assert.equal(v.getAttribute("data-sinal"), "sobe"); assert.equal(v.querySelector(".kpi-seta").textContent, "↑");
  assert.match(v.querySelector(".sr-only").textContent, /^subiu 12% em relação ao período anterior$/);
  assert.equal(k.getAttribute("title"), null, "sem title no cartão: o tooltip nativo repetia por cima a dica do «i»");
  assert.equal(k.getAttribute("aria-describedby"), null);
  const aj = k.querySelector(".kpi-ajuda");
  assert.equal(aj.getAttribute("data-dica"), "Conversas sem resposta da equipe agora.", "o «i» ganha dica");
  assert.equal(aj.getAttribute("tabindex"), "0", "o «i» recebe foco pelo teclado"); assert.equal(aj.getAttribute("role"), "button"); assert.equal(aj.getAttribute("aria-hidden"), null);
  assert.equal(aj.getAttribute("aria-label"), "Ajuda: Conversas sem resposta da equipe agora.");
  assert.ok(!k.textContent.includes("Conversas sem resposta"), "o texto da ajuda não se repete em sr-only: o leitor de tela lê uma vez, no nome do «i»");
  focarTeclado(aj); await esperar(220);
  assert.equal(U.dicaAberta(), aj, "Tab no «i» abre a dica"); assert.equal(doc.getElementById("dica-global").textContent, "Conversas sem resposta da equipe agora.");
  ev(doc.body, "keydown", { key: "Escape" }); assert.equal(U.dicaAberta(), null);
  ev(aj, "keydown", { key: "Enter" }); assert.equal(U.dicaAberta(), aj, "Enter abre na hora");
  ev(doc.body, "keydown", { key: "Escape" });
  aj.click(); assert.equal(U.dicaAberta(), aj, "toque/clique abre (o toque não tem hover)");
  ev(doc.body, "keydown", { key: "Escape" }); aj.blur();
  // cartão-botão: nada focável dentro do botão; a dica é do botão e a ajuda é a descrição dele (escondida do nome, lida uma vez)
  const kb = U.kpi({ rotulo: "Abrir lista", valor: 3, ajuda: "Leva à lista completa.", aoClicar() {} });
  assert.equal(kb.getAttribute("title"), null); assert.equal(kb.getAttribute("data-dica"), "Leva à lista completa.");
  const desc = kb.querySelector(`#${kb.getAttribute("aria-describedby")}`);
  assert.ok(desc && desc.textContent === "Leva à lista completa." && desc.getAttribute("aria-hidden") === "true", "descrição ligada e fora do nome do botão");
  assert.equal(kb.querySelector(".kpi-ajuda").getAttribute("tabindex"), null); assert.equal(kb.querySelector(".kpi-ajuda").getAttribute("aria-hidden"), "true");
  assert.equal(await k.pronto, true);
  assert.ok(k.querySelector(".kpi-spark svg.g-spark"), "sparkline desenhada pelo graficos.js");
  assert.equal(k.querySelector(".kpi-valor").getAttribute("aria-label"), "1.234", "G.contar deixa o valor final acessível");
  // tempo de espera: subir é ruim
  const t = U.kpi({ rotulo: "Tempo de 1ª resposta", valor: 14, formato: "minutos", variacao: 0.25, invertido: true });
  assert.ok(t.querySelector(".kpi-var").classList.contains("kpi-var-ruim")); assert.equal(t.querySelector(".kpi-valor").textContent, "14 min");
  const q = U.kpi({ rotulo: "Vendas", valor: 0, variacao: -0.3, invertido: true });
  assert.ok(q.querySelector(".kpi-var").classList.contains("kpi-var-bom"), "cair quando é invertido é bom"); assert.equal(q.querySelector(".kpi-seta").textContent, "↓");
  assert.ok(U.kpi({ rotulo: "x", valor: 1, variacao: 0 }).querySelector(".kpi-var").classList.contains("kpi-var-neutra"));
  const z = U.kpi({ rotulo: "Sem dado", valor: null, variacao: 0.1 });
  assert.equal(z.querySelector(".kpi-valor").textContent, "—"); assert.ok(z.classList.contains("kpi-vazio")); assert.equal(z.querySelector(".kpi-spark"), null);
  assert.equal(U.kpi({ rotulo: "R$", valor: 1234.56, formato: "moeda" }).querySelector(".kpi-valor").textContent.replace(/ /g, " "), "R$ 1.235");
  assert.equal(U.kpi({ rotulo: "%", valor: 0.456, formato: "pct" }).querySelector(".kpi-valor").textContent, "46%");
  assert.equal(U.kpi({ rotulo: "c", valor: 15300, formato: "compacto" }).querySelector(".kpi-valor").textContent, "15,3 mil");
  assert.equal(U.kpi({ rotulo: "fn", valor: 2, formato: v => `${v} itens` }).querySelector(".kpi-valor").textContent, "2 itens");
  let cliques = 0;
  const b = U.kpi({ rotulo: "Abrir", valor: 3, aoClicar: () => cliques++ });
  assert.equal(b.localName, "button"); assert.equal(b.getAttribute("type"), "button"); b.click(); assert.equal(cliques, 1);
  assert.equal(U.kpi({ rotulo: "x", valor: 2, serie: [1] }).querySelector(".kpi-spark"), null, "série de 1 ponto não vira sparkline");
});
test("A4 · variacaoKpi e numCompacto (puros)", () => {
  assert.equal(U.variacaoKpi(null), null); assert.equal(U.variacaoKpi({ valor: "x" }), null);
  assert.deepEqual(U.variacaoKpi(0.05), { sinal: "sobe", tom: "bom", texto: "+5,0%", sr: "subiu 5,0% em relação ao período anterior", seta: "↑" });
  assert.equal(U.variacaoKpi(-0.2).texto, "−20%"); assert.equal(U.variacaoKpi(-0.2).tom, "ruim"); assert.equal(U.variacaoKpi(-0.2, true).tom, "bom");
  assert.equal(U.variacaoKpi({ valor: 0.1, texto: "+3 vs ontem", sr: "três a mais que ontem" }).texto, "+3 vs ontem");
  assert.equal(U.numCompacto(999), "999"); assert.equal(U.numCompacto(1500), "1,5 mil"); assert.equal(U.numCompacto(2000000), "2 mi"); assert.equal(U.numCompacto(-1200), "−1,2 mil");
  assert.equal(U.numCompacto(null), "—"); assert.equal(U.numCompacto(3.4e9), "3,4 bi");
});

/* ============================================================ A5 · ilustrações do vazio */
test("A5 · ui.vazio({tema}): ilustração SVG inline por tema, sem círculo de ícone; tema desconhecido cai no vazio de sempre; sem_resultado com lupa", () => {
  assert.deepEqual([...U.TEMAS_VAZIO].sort(), ["ads", "agenda", "automacoes", "busca", "conversas", "crm"]);
  for (const tema of U.TEMAS_VAZIO) {
    const v = U.vazio({ tema, titulo: "Nada por aqui", texto: "x", acao: { rotulo: "Criar", fn() {} } });
    const svg = v.querySelector(`svg.vazio-il.vazio-il-${tema}`);
    assert.ok(svg, `ilustração de ${tema}`); assert.equal(svg.getAttribute("aria-hidden"), "true"); assert.ok(svg.children.length >= 4, `${tema}: desenho com formas`);
    assert.ok(v.classList.contains("vazio-tema") && !v.classList.contains("vazio-sem-ic")); assert.equal(v.querySelector(".vazio-ic"), null);
    assert.equal(v.getAttribute("data-tema"), tema); assert.equal(v.querySelector("h2").textContent, "Nada por aqui"); assert.equal(v.querySelectorAll("button").length, 1);
  }
  const semTema = U.vazio({ tema: "inexistente", titulo: "x", icone: "funil" });
  assert.equal(semTema.querySelector(".vazio-il"), null); assert.ok(semTema.querySelector(".vazio-ic"), "tema desconhecido: ícone de sempre");
  const sr = U.vazio({ tipo: "sem_resultado", tema: "busca", titulo: "Nada encontrado.", acao: { fn() {} } });
  assert.ok(sr.classList.contains("vazio-sem-il") && sr.querySelector("svg.vazio-il-busca")); assert.equal(sr.querySelector("button").textContent, "Limpar filtros");
  assert.equal(U.ilustracaoVazio("nada"), null);
  const antigo = U.vazio({ titulo: "Sem ilustração" });
  assert.ok(antigo.classList.contains("vazio-sem-ic"), "chamada antiga continua igual");
});

/* ============================================================ A6 · esqueletos por tipo */
test("A6 · ui.esqueleto: tipos cartao, grafico e kpi têm a forma do conteúdo (barras com altura fixa, sparkline no KPI) e aria-busy", () => {
  const g = U.esqueleto("grafico");
  assert.equal(g.getAttribute("aria-busy"), "true"); assert.equal(g.getAttribute("data-tipo"), "grafico");
  const barras = g.querySelectorAll(".sk-gr-b");
  assert.equal(barras.length, 10); assert.equal(barras[3].style.getPropertyValue("--h"), "80%", "alturas fixas, nada aleatório");
  assert.ok(g.querySelector(".sk-gr-eixo") && g.querySelectorAll(".sk-gr-rot").length === 3);
  assert.equal(U.esqueleto("grafico", { n: 6 }).querySelectorAll(".sk-gr-b").length, 6);
  const k = U.esqueleto("kpi");
  assert.equal(k.querySelectorAll(".sk-kpi").length, 4); assert.ok(k.querySelector(".sk-kpi .sk-spark")); assert.equal(U.esqueleto("kpis", 6).querySelectorAll(".sk-kpi").length, 6);
  const c = U.esqueleto("cartao");
  assert.ok(c.querySelector(".sk-cartao.sk-um")); assert.equal(c.querySelectorAll(".sk").length, 4);
  for (const t of ["grafico", "kpi", "cartao"]) assert.equal(U.esqueleto(t).querySelector(".sk-cab"), null, `${t}: só o miolo, sem cabeçalho`);
  assert.ok(U.TIPOS_ESQUELETO.includes("grafico") && U.TIPOS_ESQUELETO.includes("kpi") && U.TIPOS_ESQUELETO.includes("lista"));
  assert.ok(U.esqueleto("lista", 3).querySelectorAll(".sk-item").length === 3, "tipo antigo continua igual");
});

/* ============================================================ A7 · check de sucesso */
test("A7 · ui.checkSucesso: desenha o ✓ sobre o elemento, anuncia e some depois do tempo", async () => {
  limparCorpo();
  const bt = h("button", { type: "button" }, "Salvar"); doc.body.appendChild(bt);
  const p = U.checkSucesso(bt, { ms: 30, texto: "Salvo." });
  assert.ok(bt.classList.contains("tem-ok-check")); const marca = bt.querySelector(".ok-check");
  assert.ok(marca && marca.querySelector("svg path"), "✓ em SVG com pathLength para o traço"); assert.equal(marca.querySelector("path").getAttribute("pathLength"), "1");
  await esperar(40);
  assert.equal(await p, true); assert.equal(bt.querySelector(".ok-check"), null); assert.ok(!bt.classList.contains("tem-ok-check"));
  const an = doc.getElementById("anuncio"); assert.ok(an, "região aria-live criada"); assert.equal(an.textContent, "Salvo.");
  assert.equal(await U.checkSucesso(null), false);
});

/* ============================================================ A8 · tabela */
test("A8 · ui.tabela: coluna ordenável nasce com aria-sort=none; clicar alterna ascending/descending e zera as outras; anúncio ao leitor de tela", () => {
  limparCorpo();
  const t = U.tabela({ colunas: [{ chave: "nome", rotulo: "Nome", ordenavel: true }, { chave: "valor", rotulo: "Valor", ordenavel: true, alinhar: "dir" }, { chave: "x", rotulo: "Fixa" }],
    linhas: [{ id: 1, nome: "Bia", valor: 2 }, { id: 2, nome: "Ana", valor: 9 }] });
  doc.body.appendChild(t.el);
  const ths = t.el.querySelectorAll("th");
  assert.equal(ths[0].getAttribute("aria-sort"), "none"); assert.equal(ths[1].getAttribute("aria-sort"), "none"); assert.equal(ths[2].getAttribute("aria-sort"), null);
  assert.equal(ths[0].querySelector(".th-ord").getAttribute("title"), "Ordenar por Nome");
  ths[0].querySelector(".th-ord").click();
  assert.equal(ths[0].getAttribute("aria-sort"), "ascending"); assert.deepEqual(t.el.querySelectorAll("tbody td:not(.dir)").filter(td => td.getAttribute("data-rotulo") === "Nome").map(td => td.textContent), ["Ana", "Bia"]);
  ths[0].querySelector(".th-ord").click();
  assert.equal(ths[0].getAttribute("aria-sort"), "descending");
  ths[1].querySelector(".th-ord").click();
  assert.equal(ths[0].getAttribute("aria-sort"), "none"); assert.equal(ths[1].getAttribute("aria-sort"), "ascending");
  assert.match(CSS, /\.tabela th\[aria-sort="descending"\] \.th-ord::after \{ content: "↓"; \}/, "seta de ordenação por CSS");
  assert.match(CSS, /\.tabela thead th \{ position: sticky; top: 0; z-index: 1; \}/, "cabeçalho preso");
  assert.match(BLOCO, /\.tabela tbody tr:nth-child\(even\) > td \{ background: color-mix/, "zebra sutil (só no desktop: no celular a tabela vira cartões)");
});
test("A8 · rolagem interna da tabela é opcional (ui.tabela({rolagem: true}) → .tabela-rolavel); o padrão rola com a página; na impressão sai inteira", () => {
  const cols = [{ chave: "nome", rotulo: "Nome" }];
  const padrao = U.tabela({ colunas: cols, linhas: Array.from({ length: 60 }, (_, i) => ({ id: i, nome: `L${i}` })) });
  assert.ok(padrao.el.classList.contains("tabela-env")); assert.ok(!padrao.el.classList.contains("tabela-rolavel"), "padrão: sem caixa de rolagem própria (a página já rola)");
  const rolavel = U.tabela({ colunas: cols, linhas: [], rolagem: true });
  assert.ok(rolavel.el.classList.contains("tabela-env") && rolavel.el.classList.contains("tabela-rolavel"));
  const cod = BLOCO.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(cod, /\.tabela-env:not\(/, "nenhuma regra de altura máxima para toda tabela");
  const desktop = /@media \(width >= 761px\) \{([\s\S]*?)\n\}/.exec(cod)[1];
  assert.match(desktop, /\.tabela-env\.tabela-rolavel \{ max-height: min\(72dvh, 60rem\); overflow: auto; \}/, "a altura máxima só vale com a classe");
  const imp = /@media print \{([^}]*\})\s*\}/.exec(cod);
  assert.ok(imp && /\.tabela-env\.tabela-rolavel/.test(imp[1]) && /max-height: none; overflow: visible;/.test(imp[1]), "@media print libera a tabela (sem corte no papel)");
});

/* ============================================================ A9 · pílulas semânticas e avatar */
test("A9 · ui.pilula com variantes: canal (ícone + rótulo da tabela), prioridade (escadinha), status (cor pela chave); chamada antiga intacta", () => {
  const c = U.pilula(null, "whatsapp", { variante: "canal" });
  assert.equal(c.textContent, "WhatsApp"); assert.ok(c.classList.contains("pilula-ok") && c.classList.contains("pilula-canal")); assert.equal(c.querySelector("use").getAttribute("href"), "#i-whatsapp");
  assert.equal(c.getAttribute("data-variante"), "canal");
  const g = U.pilula("Google Ads", "google", { variante: "canal" }); assert.ok(g.classList.contains("pilula-google")); assert.equal(g.textContent, "Google Ads");
  const i = U.pilula("Indicação", "Indicação", { variante: "canal" }); assert.ok(i.classList.contains("pilula-prim"), "chave por texto, sem acento");
  const p = U.pilula(null, "alta", { variante: "prioridade" });
  assert.equal(p.textContent, "Alta"); assert.ok(p.classList.contains("pilula-ruim")); assert.equal(p.querySelector(".pilula-prio").getAttribute("data-n"), "3"); assert.equal(p.querySelectorAll(".pilula-prio b").length, 3);
  assert.ok(U.pilula(null, "baixa", { variante: "prioridade" }).classList.contains("pilula-neutra"));
  const s = U.pilula("Pausada", "pausado", { variante: "status" }); assert.ok(s.classList.contains("pilula-aten") && s.classList.contains("pilula-status"));
  assert.ok(U.pilula("Erro", "erro", { variante: "status" }).classList.contains("pilula-ruim")); assert.ok(U.pilula("?", "sei-la", { variante: "status" }).classList.contains("pilula-neutra"));
  const pq = U.pilula("x", "ok", { tamanho: "p" }); assert.ok(pq.classList.contains("pilula-p"));
  const antiga = U.pilula("Ativo", "ok"); assert.equal(antiga.className, "pilula pilula-ok"); assert.equal(antiga.getAttribute("data-variante"), null);
  const hex = U.pilula("Etapa", "#AABBCC"); assert.ok(hex.classList.contains("pilula-cor")); assert.equal(hex.style.getPropertyValue("--cor"), "#AABBCC");
  assert.match(BLOCO, /\.pilula-prio\[data-n="3"\] b:nth-child\(-n\+3\) \{ opacity: 1; \}/);
});
test("A9 · ui.avatar: cor estável pelo nome (8 tons da paleta), id só sem nome; estado e tamanho", () => {
  const a = U.avatar("Mariana Costa", 501), b = U.avatar("Mariana Costa", 9999), c = U.avatar("mariana costa", null);
  assert.equal(a.style.getPropertyValue("--cor"), b.style.getPropertyValue("--cor"), "mesmo nome, mesma cor em qualquer lista");
  assert.equal(a.style.getPropertyValue("--cor"), c.style.getPropertyValue("--cor"), "caixa não muda a cor");
  assert.equal(a.textContent, "MC"); assert.equal(U.TONS_AVATAR.length, 8);
  const tons = new Set(["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabi", "Hugo", "Iara", "João", "Karen", "Léo"].map(n => U.tomAvatar(n)));
  assert.ok(tons.size >= 5, `12 nomes espalham por pelo menos 5 tons (deu ${tons.size})`);
  assert.ok([...tons].every(t => U.TONS_AVATAR.includes(t)));
  assert.equal(U.avatar("", 42).style.getPropertyValue("--cor"), U.avatar(null, 42).style.getPropertyValue("--cor"), "sem nome: pelo id");
  const e = U.avatar("Ana", 1, null, { estado: "online", tamanho: "g" });
  assert.ok(e.classList.contains("avatar-g")); assert.ok(e.querySelector(".avatar-estado.avatar-online")); assert.equal(e.getAttribute("data-tom"), String(U.tomAvatar("Ana")));
  assert.equal(U.avatar("Ana", 1, null, { estado: "voando" }).querySelector(".avatar-estado"), null, "estado desconhecido não desenha ponto");
});

/* ============================================================ A10 · dica genérica */
test("A10 · ui.dica: data-dica + descrição acessível; a delegação abre no foco (150 ms) e no mouse (400 ms), toque não abre, Esc fecha; .bt-icone[aria-label] ganha dica sozinho", async () => {
  limparCorpo();
  const bt = h("button", { type: "button" }, "Exportar"); doc.body.appendChild(bt);
  const desligar = U.dica(bt, "Baixa a tabela em CSV");
  assert.equal(bt.getAttribute("data-dica"), "Baixa a tabela em CSV");
  const idDesc = bt.getAttribute("aria-describedby"); assert.ok(idDesc && doc.getElementById(idDesc).textContent === "Baixa a tabela em CSV", "descrição ligada");
  focarTeclado(bt);
  assert.equal(U.dicaAberta(), null, "ainda não: há atraso");
  await esperar(220);
  const caixa = doc.getElementById("dica-global");
  assert.ok(caixa && caixa.hidden === false, "dica à mostra depois do atraso"); assert.equal(caixa.getAttribute("role"), "tooltip"); assert.equal(caixa.textContent, "Baixa a tabela em CSV");
  assert.equal(U.dicaAberta(), bt); assert.ok(bt.classList.contains("com-dica"));
  ev(doc.body, "keydown", { key: "Escape" });
  assert.equal(caixa.hidden, true); assert.equal(U.dicaAberta(), null);
  ev(bt, "pointerover", { pointerType: "touch" }); await esperar(450);
  assert.equal(caixa.hidden, true, "encostar o dedo não abre dica");
  ev(bt, "pointerover", { pointerType: "mouse" }); await esperar(450);
  assert.equal(caixa.hidden, false, "mouse abre depois de 400 ms");
  ev(bt, "pointerout", { pointerType: "mouse" }); assert.equal(caixa.hidden, true);
  desligar();
  assert.equal(bt.getAttribute("data-dica"), null); assert.equal(bt.getAttribute("aria-describedby"), null); assert.equal(doc.getElementById(idDesc), null);
  const ic = h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar" }); doc.body.appendChild(ic);
  focarTeclado(ic); await esperar(220);
  assert.equal(caixa.textContent, "Fechar"); assert.equal(caixa.hidden, false, "botão de ícone com aria-label ganha dica sem código na tela");
  ev(ic, "focusout"); assert.equal(caixa.hidden, true);
  const mesmo = h("button", { type: "button", "aria-label": "Copiar" }); doc.body.appendChild(mesmo);
  U.dica(mesmo, "Copiar");
  assert.equal(mesmo.getAttribute("aria-describedby"), null, "texto igual ao nome acessível não vira descrição (não lê duas vezes)");
  assert.equal(typeof U.dica(null, "x"), "function");
});

test("A10 · a dica não fica órfã: o elemento sumir do DOM (troca de tela) ou o hashchange fecham a dica sem pointerout", async () => {
  limparCorpo();                                 // leva junto a caixa antiga: a dica recria a sua ao abrir de novo
  const bt = h("button", { type: "button", class: "bt-icone", "aria-label": "Assumir a conversa" }); doc.body.appendChild(bt);
  ev(bt, "pointerover", { pointerType: "mouse" }); await esperar(450);
  const caixa = doc.getElementById("dica-global");
  assert.ok(caixa && caixa.hidden === false, "aberta pelo mouse");
  bt.remove();                                   // a tela foi redesenhada com o mouse parado em cima: nenhum pointerout chega
  await esperar(400);
  assert.equal(caixa.hidden, true, "o vigia fecha a dica quando o alvo já não está no documento");
  assert.equal(U.dicaAberta(), null);
  const bt2 = h("button", { type: "button", class: "bt-icone", "aria-label": "Imprimir" }); doc.body.appendChild(bt2);
  focarTeclado(bt2); await esperar(220);
  assert.equal(caixa.hidden, false);
  if (doc.defaultView && typeof doc.defaultView.dispatchEvent === "function") {
    ev(doc.defaultView, "hashchange");
    assert.equal(caixa.hidden, true, "trocar de rota fecha a dica");
  } else {
    ev(doc, "visibilitychange");
    assert.equal(caixa.hidden, true, "trocar de aba fecha a dica");
  }
});

test("A10 · foco por script não abre a dica (gaveta/modal focam o «Fechar» depois de um clique); Tab abre; clique seguido de foco não reabre; sem :focus-visible, comportamento antigo", async () => {
  limparCorpo();
  const x = h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar" }); doc.body.appendChild(x);
  focarScript(x); await esperar(220);
  assert.equal(U.dicaAberta(), null, "a gaveta abriu com o mouse e focou o «Fechar»: nenhuma dica parada na tela");
  ev(x, "focusout"); x.blur();
  focarTeclado(x); await esperar(220);
  assert.equal(U.dicaAberta(), x, "Tab até o botão abre a dica");
  ev(x, "focusout"); x.blur(); assert.equal(U.dicaAberta(), null);
  // passar o mouse abre; clicar fecha e o foco que o clique dá ao botão não reabre
  ev(x, "pointerover", { pointerType: "mouse" }); await esperar(450); assert.equal(U.dicaAberta(), x);
  ev(x, "pointerdown", { pointerType: "mouse" }); focarScript(x); await esperar(220);
  assert.equal(U.dicaAberta(), null, "o clique fecha e não volta");
  ev(x, "pointerout", { pointerType: "mouse" }); ev(x, "focusout"); x.blur();
  doc.semFocusVisible = true;
  try {
    focarScript(x); await esperar(220);
    assert.equal(U.dicaAberta(), x, "navegador que não conhece :focus-visible: abre no foco, como antes");
  } finally { doc.semFocusVisible = false; ev(x, "focusout"); x.blur(); }
});

test("A10 · a dica esconde o title nativo (vai para data-title) enquanto vale e devolve ao fechar; no foco por teclado o title fica", async () => {
  limparCorpo();
  const b = h("button", { type: "button", class: "bt-icone", "aria-label": "Mover «Agora» para antes", title: "Mover para antes" }); doc.body.appendChild(b);
  ev(b, "pointerover", { pointerType: "mouse" });
  assert.equal(b.getAttribute("title"), null, "o title sai já ao entrar com o mouse: o tooltip nativo não corre junto com a dica");
  assert.equal(b.getAttribute("data-title"), "Mover para antes");
  await esperar(450);
  assert.equal(U.dicaAberta(), b); assert.equal(doc.getElementById("dica-global").textContent, "Mover «Agora» para antes", "um texto só, o da dica");
  ev(b, "pointerout", { pointerType: "mouse" });
  assert.equal(b.getAttribute("title"), "Mover para antes", "fechou: o title volta"); assert.equal(b.getAttribute("data-title"), null);
  // sair antes de a dica abrir também devolve, e nada abre depois
  ev(b, "pointerover", { pointerType: "mouse" }); ev(b, "pointerout", { pointerType: "mouse" });
  assert.equal(b.getAttribute("title"), "Mover para antes"); await esperar(450); assert.equal(U.dicaAberta(), null);
  // a tela trocou o title com a dica aberta: vale o novo
  ev(b, "pointerover", { pointerType: "mouse" }); await esperar(450);
  b.setAttribute("title", "Mover para cima"); ev(doc.body, "keydown", { key: "Escape" });
  assert.equal(b.getAttribute("title"), "Mover para cima"); assert.equal(b.getAttribute("data-title"), null);
  // ir direto para outro alvo devolve o title do primeiro
  const c = h("button", { type: "button", class: "bt-icone", "aria-label": "Anexar arquivo", title: "Anexar (foto, vídeo, áudio, documento até 16 MB)" }); doc.body.appendChild(c);
  ev(b, "pointerover", { pointerType: "mouse" }); ev(c, "pointerover", { pointerType: "mouse" });
  assert.equal(b.getAttribute("title"), "Mover para cima"); assert.equal(c.getAttribute("title"), null);
  ev(c, "pointerout", { pointerType: "mouse" }); assert.equal(c.getAttribute("title"), "Anexar (foto, vídeo, áudio, documento até 16 MB)");
  // teclado: o title é a descrição que o leitor de tela lê; fica no lugar
  focarTeclado(c); await esperar(220);
  assert.equal(U.dicaAberta(), c); assert.equal(c.getAttribute("title"), "Anexar (foto, vídeo, áudio, documento até 16 MB)");
  ev(c, "focusout"); c.blur();
});

test("A10 · andar do fundo do botão para o ícone dentro dele não fecha nem reabre a dica (nem reinicia o atraso); sair do botão fecha", async () => {
  limparCorpo();
  const ic = h("span", { class: "ic" });
  const b = h("button", { type: "button", class: "bt-icone", "aria-label": "Mover para antes" }, ic); doc.body.appendChild(b);
  ev(b, "pointerover", { pointerType: "mouse" }); await esperar(450);
  assert.equal(U.dicaAberta(), b);
  ev(b, "pointerout", { pointerType: "mouse", relatedTarget: ic }); ev(ic, "pointerover", { pointerType: "mouse", relatedTarget: b });
  assert.equal(U.dicaAberta(), b, "do fundo para o ícone: a dica continua");
  ev(ic, "pointerout", { pointerType: "mouse", relatedTarget: b }); ev(b, "pointerover", { pointerType: "mouse", relatedTarget: ic });
  assert.equal(U.dicaAberta(), b, "do ícone de volta para o fundo: continua");
  ev(ic, "pointerout", { pointerType: "mouse", relatedTarget: doc.body }); assert.equal(U.dicaAberta(), null, "saiu do botão: fecha");
  // ainda agendada: mexer dentro do botão não recomeça os 400 ms
  ev(b, "pointerover", { pointerType: "mouse" }); await esperar(250);
  ev(b, "pointerout", { pointerType: "mouse", relatedTarget: ic }); ev(ic, "pointerover", { pointerType: "mouse", relatedTarget: b });
  await esperar(220);
  assert.equal(U.dicaAberta(), b, "abriu nos 400 ms contados da entrada");
  ev(b, "pointerout", { pointerType: "mouse", relatedTarget: doc.body }); assert.equal(U.dicaAberta(), null);
});

test("A10 · a dica mede o tamanho com a caixa no canto, não na posição anterior: depois da dica do «Fechar» na borda direita, a próxima nasce colada ao alvo", async () => {
  limparCorpo();
  globalThis.innerWidth = 1366; globalThis.innerHeight = 768;
  try {
    const fechar = h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar" });
    const mover = h("button", { type: "button", class: "bt-icone", "aria-label": "Mover «Agora» para antes" });
    doc.body.append(fechar, mover);
    fechar.getBoundingClientRect = () => ({ left: 1318, top: 14, right: 1350, bottom: 46, width: 32, height: 32 });
    mover.getBoundingClientRect = () => ({ left: 580, top: 502, right: 612, bottom: 534, width: 32, height: 32 });
    ev(fechar, "pointerover", { pointerType: "mouse" }); await esperar(450);
    const caixa = doc.getElementById("dica-global");
    // como no navegador: perto da borda direita a caixa encolhe e o texto quebra (74 × 85); com espaço ela tem 179 × 32
    caixa.getBoundingClientRect = () => ((parseFloat(caixa.style.left) || 0) > 1100 ? { width: 74, height: 85 } : { width: 179, height: 32 });
    ev(fechar, "pointerout", { pointerType: "mouse" });
    ev(fechar, "pointerover", { pointerType: "mouse" }); await esperar(450);
    assert.equal(caixa.style.left, "1179px", "a do «Fechar» encosta na borda direita (8 px de folga)");
    ev(fechar, "pointerout", { pointerType: "mouse" });
    ev(mover, "pointerover", { pointerType: "mouse" }); await esperar(450);
    assert.equal(caixa.style.top, "462px", "logo acima do botão (502 − 32 − 8), não 61 px acima");
    assert.equal(caixa.style.left, "507px", "centrada no botão");
    assert.equal(caixa.style.getPropertyValue("--seta-x"), "90px", "a seta aponta para o centro do botão");
    assert.equal(caixa.getAttribute("data-lado"), "cima");
    ev(mover, "pointerout", { pointerType: "mouse" });
  } finally { delete globalThis.innerWidth; delete globalThis.innerHeight; }
});

/* ============================================================ senha com ícone (A14) e campos */
test("A14 · ui.campo senha: o olho troca de ícone e de rótulo, mantém o foco no campo", () => {
  const c = U.campo({ rotulo: "Senha", nome: "senha", tipo: "senha" });
  const inp = c.querySelector("input"), olho = c.querySelector(".campo-olho");
  assert.equal(inp.type, "password"); assert.equal(olho.getAttribute("aria-pressed"), "false"); assert.ok(olho.querySelector("use"), "olho aberto do sprite");
  olho.click();
  assert.equal(inp.type, "text"); assert.equal(olho.getAttribute("aria-pressed"), "true"); assert.equal(olho.getAttribute("aria-label"), "Esconder senha");
  assert.equal(olho.querySelector("use"), null); assert.ok(olho.querySelector("svg path"), "olho cortado desenhado inline");
  assert.equal(doc.activeElement, inp, "o foco volta para o campo");
  olho.click(); assert.equal(inp.type, "password"); assert.ok(olho.querySelector("use"));
});

/* ============================================================ complementos por texto-fonte (CSS / app.js / login.js) */
test("A12 · transição de rota: app.js marca .rota-entra nas duas saídas de montarNoShell; CSS com --t-rota (180 ms) zerado sob movimento reduzido", () => {
  const app = ler("app.js");
  assert.match(app, /function transicaoRota\(vista\)/);
  const montar = /async function montarNoShell\([\s\S]*?\nfunction focarVista/.exec(app)[0];
  assert.equal([...montar.matchAll(/transicaoRota\(vista\);/g)].length, 2, "bloqueio e tela normal entram com a transição");
  assert.match(montar, /if \(trocouDeTela\) transicaoRota\(vista\);/, "a tela normal só anima quando o módulo muda");
  assert.match(montar, /if \(bloqueioNovo\) transicaoRota\(vista\);/, "o mesmo bloqueio repetido não anima de novo");
  assert.match(app, /vista\.addEventListener\("animationend", \(\) => vista\.classList\.remove\("rota-entra"\), \{ once: true \}\)/);
  assert.match(BLOCO, /--t-rota: 180ms;/); assert.match(BLOCO, /@media \(prefers-reduced-motion: reduce\) \{ :root \{ --t-rota: 0s; \} \}/);
  assert.match(BLOCO, /\.vista\.rota-entra \{ animation: rotaEntra var\(--t-rota\) var\(--e-out\) backwards; \}/);
  assert.match(BLOCO, /@keyframes rotaEntra \{ from \{ opacity: 0; transform: translateY\(6px\); \}/);
});
test("A12 · montarNoShell de verdade (código do app.js com o resto do shell de mentira): a vista anima ao trocar de tela, não ao abrir conversa, trocar aba ou seção", async () => {
  const app = ler("app.js");
  const fonteDe = assinatura => { const i = app.indexOf(assinatura); assert.ok(i >= 0, assinatura); return app.slice(i, app.indexOf("\n}\n", i) + 2); };
  const fabrica = new Function("E", "$", "opcoesAcesso", "reiniciarSelo", "marcarMenu", "desmontarAtual", "cartaoBloqueio", "definirTitulo", "desenharRegioes", "focarTitulo",
    "arq", "construirCtx", "ehFalhaDeImport", "aoMudarRota",
    `"use strict";\n${fonteDe("function transicaoRota(vista) {")}\n${fonteDe("async function montarNoShell(")}\nreturn montarNoShell;`);
  limparCorpo();
  const vista = h("main", { id: "vista", class: "vista" }); doc.body.appendChild(vista);
  let animou = 0;
  const add = vista.classList.add;
  vista.classList.add = (...c) => { if (c.includes("rota-entra")) animou++; return add(...c); };
  const montados = [];
  const mods = {};
  const E = {
    M: { rotas: { acessoRota: m => (m === "ads" ? "fora_do_plano" : "ok"), rotaDe: m => ({ arquivo: `${m}.js` }), esqueletoDaRota: () => "lista" },
      ui: { limpar: U.limpar, h, esqueleto: () => h("div", { class: "esqueleto" }), erroCartao: () => h("div") } },
    atual: null, telaVista: null, cliente: { id: 7 }, montando: 1, pulso: null, pwa: null,
  };
  const montarNoShell = fabrica(E, id => doc.getElementById(id), () => ({}), () => {}, () => {}, () => { E.atual = null; },
    () => h("div", { class: "area-bloqueada" }), () => {}, () => {}, () => {},
    async arquivo => (mods[arquivo] ||= { montar: async ctx => { montados.push(ctx.r.partes.join("/") || ctx.r.modulo); } }),
    r => ({ r }), () => false, () => {});
  const ir = (modulo, ...partes) => montarNoShell({ modulo, partes }, 1, true);
  await ir("conversas"); assert.equal(animou, 1, "entrar em Conversas anima");
  await ir("conversas", "901"); assert.equal(animou, 1, "abrir uma conversa (mesmo módulo) não pisca a vista");
  assert.deepEqual(montados.slice(-2), ["conversas", "901"], "o módulo foi reaproveitado e recebeu a rota nova");
  await ir("relatorios", "vendas"); assert.equal(animou, 2, "outra tela anima");
  await ir("relatorios", "atendimento"); assert.equal(animou, 2, "trocar de aba em Relatórios não anima");
  await ir("config"); await ir("config", "usuarios"); assert.equal(animou, 3, "trocar de seção em Configurações não anima");
  await ir("ads"); assert.equal(animou, 4, "tela bloqueada anima ao entrar");
  await ir("ads", "campanhas"); assert.equal(animou, 4, "o mesmo bloqueio em outro endereço não pisca de novo");
  await ir("conversas"); assert.equal(animou, 5, "voltar do bloqueio para uma tela anima");
  E.cliente = { id: 8 }; await ir("conversas"); assert.equal(animou, 6, "trocar de empresa remonta a tela e anima");
  ev(vista, "animationend"); assert.ok(!vista.classList.contains("rota-entra"), "a classe sai no fim da animação");
});
test("paleta Ctrl+K: com a busca vazia, a ação usada por último não se repete em «Nesta tela» (cada opção aparece uma vez no listbox)", async () => {
  limparCorpo();
  const P = await import(pathToFileURL(join(APP, "paleta.js")).href);
  const C = await import(pathToFileURL(join(APP, "comandos.js")).href);
  const rot = { atender: "Atender o próximo", nova: "Nova conversa", assumir: "Assumir a conversa aberta", resolver: "Resolver a conversa aberta" };
  const daTela = Object.keys(rot).map(k => ({ id: `conversas.${k}`, rotulo: rot[k], icone: "chat", fazer() {}, origem: "tela" }));
  let corpo = null;
  const ui = { ...U, modal: o => { corpo = o.corpo; doc.body.appendChild(corpo); o.aoAbrir({ el: h("div", null, h("div", { class: "modal-rod" })), fechar() {} }); return new Promise(() => {}); } };
  const amb = { ui, C, placeholder: "Buscar", destinos: [{ id: "inicio", rotulo: "Início", hash: "#/", icone: "casa" }], acoes: [{ id: "tema", rotulo: "Mudar o tema", fazer() {} }],
    daTela, recentes: () => [], ultimos: () => [{ id: "conversas.resolver" }], navegar() {}, buscarDados: null };
  P.abrir(amb);
  const secoes = corpo.querySelectorAll(".pal-secao").map(s => [s.querySelector(".busca-grupo").textContent, s.querySelectorAll(".pal-item b").map(b => b.textContent)]);
  const mapa = Object.fromEntries(secoes);
  assert.deepEqual(mapa["Usados por último"], ["Resolver a conversa aberta"]);
  assert.deepEqual(mapa["Nesta tela"], ["Atender o próximo", "Nova conversa", "Assumir a conversa aberta"], "a usada por último sai de «Nesta tela»");
  const opcoes = corpo.querySelectorAll('[role="option"]').map(o => o.querySelector("b").textContent);
  assert.equal(new Set(opcoes).size, opcoes.length, "as setas passam por cada opção uma vez só");
  // sem histórico, «Nesta tela» mostra as 4 da tela, como antes
  limparCorpo();
  P.abrir({ ...amb, ultimos: () => [] });
  assert.deepEqual(corpo.querySelectorAll(".pal-secao").map(s => s.querySelector(".busca-grupo").textContent), ["Nesta tela", "Ir para"]);
  assert.equal(corpo.querySelectorAll(".pal-secao")[0].querySelectorAll(".pal-item").length, 4);
});
test("Configurações: .cfg-nav-item tem UMA definição (app.css); o config.css não redefine o item com outros valores (a lista não pula quando a folha chega)", () => {
  // regras por (contexto @media, seletor) → propriedades; um seletor nas duas folhas com valor diferente é o pulo que o revisor viu
  const regras = css => {
    const out = new Map(); const s = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /(@media[^{]+)\{((?:[^{}]*\{[^}]*\})*)\s*\}|([^{}@]+)\{([^}]*)\}/g;
    const juntar = (ctx, sel, corpo) => { for (const um of sel.split(",").map(x => x.trim()).filter(Boolean)) {
      const k = `${ctx}|${um}`; const m = out.get(k) || {};
      for (const d of corpo.split(";")) { const i = d.indexOf(":"); if (i > 0) m[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
      out.set(k, m);
    } };
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) { const ctx = m[1].trim(); for (const r of m[2].matchAll(/([^{}]+)\{([^}]*)\}/g)) juntar(ctx, r[1].trim(), r[2]); }
      else juntar("", m[3].trim(), m[4]);
    }
    return out;
  };
  const app = regras(CSS), cfg = regras(ler("config.css"));
  const conflitos = [];
  for (const [k, decl] of cfg) {
    if (!/\.cfg-nav|\.cfg(?![\w-])|\.cfg-pend/.test(k)) continue;
    const base = app.get(k.replace(/^@media \(min-width: 761px\)\s*/, "")) || app.get(k);
    if (base) for (const [p, v] of Object.entries(decl)) if (p in base && base[p] !== v) conflitos.push(`${k} ${p}: ${base[p]} × ${v}`);
  }
  assert.deepEqual(conflitos, [], "nenhum valor divergente entre app.css e config.css");
  assert.ok(![...cfg.keys()].some(k => /\.cfg-nav-item/.test(k)), "o item da navegação não é redefinido no config.css");
  const item = app.get("|.cfg-nav-item");
  assert.equal(item["min-height"], "44px"); assert.equal(item["border-radius"], "var(--r-p)"); assert.equal(item["align-items"], "flex-start");
  assert.equal(app.get("@media (max-width: 760px)|.cfg-nav-item")["min-height"], "56px", "no celular: 56 px, já no primeiro desenho");
  assert.ok(app.get("|.cfg-nav-ic") && app.get("|.cfg-nav-desc"), "ícone em caixa e descrição também no app.css");
  assert.equal(app.get("|.cfg")["grid-template-columns"], "minmax(0, 252px) minmax(0, 1fr)");
});
test("A13 · tema escuro afinado: bordas com alfa (--c-borda-alfa), sombras do cartão/KPI viram bordas, 3 camadas; A11 utilitários de ritmo só com tokens", () => {
  assert.match(BLOCO, /html\[data-esquema="escuro"\] \{ --c-borda-alfa: color-mix\(in srgb, var\(--c-texto\) 12%, transparent\); --c-borda-alfa-2: color-mix\(in srgb, var\(--c-texto\) 20%, transparent\); \}/);
  assert.match(BLOCO, /html\[data-esquema="escuro"\] \.cartao, html\[data-esquema="escuro"\] \.kpi[^{]*\{ box-shadow: none; border-color: var\(--c-borda-alfa\); \}/);
  assert.match(BLOCO, /--c-camada-1: var\(--c-sup\); --c-camada-2: var\(--c-sup-2\); --c-camada-3: var\(--c-sup-3\);/);
  assert.match(BLOCO, /html\[data-esquema="escuro"\] \.cartao \.cartao \.cartao, [^{]*\{ background: var\(--c-camada-3\); \}/);
  for (const n of [1, 2, 3, 4, 5, 6, 8]) { assert.match(BLOCO, new RegExp(`\\.m-cima-${n} \\{ margin-block-start: var\\(--esp-${n}\\) !important; \\}`)); assert.match(BLOCO, new RegExp(`\\.vao-${n} \\{ gap: var\\(--esp-${n}\\) !important; \\}`)); }
  assert.match(BLOCO, /\.cab \{ margin: var\(--esp-2\) 0 var\(--esp-6\); gap: var\(--esp-3\) var\(--esp-6\); \}/);
});
test("A14 · login: erro de credencial fica inline no campo de senha, botão diz «Entrando…», kicker e régua editorial; A15 foco/skip-link; A7 pressão .98", () => {
  const login = ler("login.js");
  assert.match(login, /if \(e && e\.codigo === "credenciais_invalidas"\) ui\.marcarErro\(form, "senha", msg\);/);
  assert.match(login, /rotuloBt\.textContent = "Entrando…";/); assert.match(login, /class: "bt bt-prim bt-g bt-bloco bt-carrega"/);
  assert.match(login, /class: "entrar-kicker selo-caps"/); assert.match(login, /class: "entrar-regua"/);
  assert.doesNotMatch(login, /\bnarr\b/, "o login continua sem Zodiak");
  assert.match(BLOCO, /\.bt-carrega\[aria-busy="true"\] \{ color: var\(--c-prim-txt\) !important; padding-left: 2\.6rem; \}/);
  assert.match(BLOCO, /\.entrar::before \{[^}]*radial-gradient/);
  assert.match(BLOCO, /\.pular:focus-visible \{ outline: var\(--foco-largura\) solid var\(--c-foco\)/);
  assert.match(BLOCO, /:is\(\.cartao-clicavel, \.cartao\[tabindex="0"\], a\.cartao, button\.cartao\):focus-visible \{ outline: var\(--foco-largura\) solid var\(--c-foco\); outline-offset: 2px; \}/);
  assert.match(BLOCO, /\.bt-prim:active:not\(:disabled\) \{ transform: scale\(\.98\); \}/);
  assert.match(ler("shell.css"), /\.pular-regiao:focus-visible, \.pular:focus-visible \{ outline: var\(--foco-largura\) solid var\(--c-foco\)/);
});
test("regras do bloco (plano 50 · A): só tokens — nenhum hex, nenhum font-size literal, nenhum transition: all, sem hover-lift, só sintaxe de intervalo nos @media de largura", () => {
  const cod = BLOCO.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(cod, /#[0-9a-fA-F]{3,8}\b/, "hex");
  for (const m of cod.matchAll(/font-size:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^(var\(--fs-[a-z0-9-]+\)|[\d.]+(em|%))$/, `font-size literal: ${m[0]}`);
  assert.doesNotMatch(cod, /\bfont:\s*[^;]*\d(px|rem)/, "atalho font com px/rem");
  assert.doesNotMatch(cod, /transition:\s*all\b/i);
  assert.doesNotMatch(cod, /:hover[^{]*\{[^}]*transform:\s*translate/, "hover-lift");
  assert.doesNotMatch(cod, /@media \((max|min)-width/, "largura só com (width <= …) / (width >= …): os blocos antigos são lidos por último pelos testes vizinhos");
  assert.doesNotMatch(cod, /text-transform:\s*uppercase/, "caixa-alta só em .selo-caps (fora deste bloco)");
  const grades = [...cod.matchAll(/grid-template-columns\s*:\s*([^;]+)/g)].map(m => m[1]);
  assert.ok(grades.every(g => !/\b1fr\b/.test(g) || /minmax\(0,\s*1fr\)/.test(g)), "1fr solto");
});
