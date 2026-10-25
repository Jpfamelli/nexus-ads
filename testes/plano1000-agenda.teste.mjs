/* Plano «1000+ melhorias» · frente agenda, lote agenda-1 (13/10/2026). Sem rede, sem navegador: as peças puras e a TELA (montar) num DOM
   mínimo (o mesmo contrato do ui.h de testes/plano100-agenda.teste.mjs), com ui/api de mentira; o servidor fictício filtra as consultas
   pelo período pedido (p_data + p_dias), como nx_agenda_dia. Cada teste cita o item do lote (CA-xxx / AS-xxx). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixarRelogio } from "./apoio/relogio.mjs";

// hoje/agora fixos (como o plano100-agenda, SV-159): perto da meia-noite de São Paulo o dia não vira no meio do arquivo
fixarRelogio("2026-10-15T10:00:00-03:00");

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const A = await import("../web/app/agenda.js");
const CFG = await import("../web/app/agenda-config.js");
const L = await import("../web/app/crm-logica.js?v=p1000");
const R = await import("../web/app/rascunho.js");

/* ============================================================ DOM mínimo (cópia do plano100-agenda) */
function criarDom() {
  const estado = { ativo: null };
  class Lista { constructor(el) { this.el = el; } add(...c) { for (const x of c) if (x && !this.el._cls.includes(x)) this.el._cls.push(x); } remove(...c) { this.el._cls = this.el._cls.filter(x => !c.includes(x)); } contains(c) { return this.el._cls.includes(c); } toggle(c, f) { const on = f === undefined ? !this.contains(c) : !!f; if (on) this.add(c); else this.remove(c); return on; } }
  class Estilo { constructor() { this.m = new Map(); } setProperty(k, v) { this.m.set(k, String(v)); } getPropertyValue(k) { return this.m.get(k) || ""; } }
  class Texto { constructor(t) { this.nodeType = 3; this.data = String(t); this.parentNode = null; } get textContent() { return this.data; } }
  const evento = (type, extra = {}) => ({ type, defaultPrevented: false, _parou: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._parou = true; }, ...extra });
  const camelo = k => k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  class El {
    constructor(tag) { this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.attrs = new Map(); this._cls = []; this.classList = new Lista(this); this.style = new Estilo(); this.dataset = {}; this.ouvintes = new Map(); this.parentNode = null; this.hidden = false; this.disabled = false; this.open = false; this._tab = null; }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get className() { return this._cls.join(" "); } set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
    get isConnected() { return true; }
    get tabIndex() { return this._tab === null ? (["BUTTON", "INPUT", "A"].includes(this.tagName) ? 0 : -1) : this._tab; } set tabIndex(v) { this._tab = Number(v); this.attrs.set("tabindex", String(v)); }
    setAttribute(k, v) { v = String(v); if (k === "class") { this.className = v; return; } if (k === "tabindex") this._tab = Number(v); if (k.startsWith("data-")) this.dataset[camelo(k)] = v; this.attrs.set(k, v); }
    getAttribute(k) { if (k === "class") return this.className || null; if (k === "tabindex" && this._tab !== null) return String(this._tab); if (k.startsWith("data-")) { const d = this.dataset[camelo(k)]; return d === undefined ? null : d; } return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return k === "class" ? this._cls.length > 0 : k.startsWith("data-") ? this.dataset[camelo(k)] !== undefined : this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); if (k === "hidden") this.hidden = false; }
    appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
    append(...ns) { for (const n of ns) this.appendChild(n && typeof n === "object" ? n : new Texto(n)); }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    replaceChildren(...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get firstChild() { return this.childNodes[0] || null; }
    get textContent() { return this.childNodes.map(n => n.textContent).join(""); } set textContent(v) { this.childNodes = []; if (v !== "") this.appendChild(new Texto(v)); }
    addEventListener(t, f) { if (!this.ouvintes.has(t)) this.ouvintes.set(t, []); this.ouvintes.get(t).push(f); }
    removeEventListener(t, f) { const l = this.ouvintes.get(t); if (l) this.ouvintes.set(t, l.filter(x => x !== f)); }
    dispatchEvent(ev) { ev.target = ev.target || this; let n = this; while (n && !ev._parou) { for (const f of [...((n.ouvintes && n.ouvintes.get(ev.type)) || [])]) f.call(n, ev); n = n.parentNode; } return !ev.defaultPrevented; }
    click() { if (!this.disabled) this.dispatchEvent(evento("click")); }
    focus() { estado.ativo = this; }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    closest(sel) { let n = this; while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
    matches(sel) { return sel.split(",").some(s => casaComposto(this, s.trim().split(/\s+/))); }
    querySelectorAll(sel) { const out = []; for (const parte of sel.split(",")) out.push(...descendentes(this).filter(el => casaComposto(el, parte.trim().split(/\s+/)))); return [...new Set(out)]; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  }
  function descendentes(el) { const r = []; (function andar(n) { for (const c of n.children) { r.push(c); andar(c); } })(el); return r; }
  function casa(el, s) {
    let resto = s;
    while (resto) {
      let m;
      if ((m = /^([a-zA-Z][\w-]*)/.exec(resto))) { if (el.tagName !== m[1].toUpperCase()) return false; }
      else if ((m = /^\.([\w-]+)/.exec(resto))) { if (!el.classList.contains(m[1])) return false; }
      else if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(resto))) { if (m[2] === undefined ? !el.hasAttribute(m[1]) : el.getAttribute(m[1]) !== m[2]) return false; }
      else if ((m = /^:not\(([^)]*)\)/.exec(resto))) { if (casa(el, m[1])) return false; }
      else throw new Error(`seletor não suportado no DOM mínimo: ${s}`);
      resto = resto.slice(m[0].length);
    }
    return true;
  }
  function casaComposto(el, toks) {
    if (!casa(el, toks[toks.length - 1])) return false;
    let n = el.parentNode;
    for (let i = toks.length - 2; i >= 0; i--) { while (n && !(n.nodeType === 1 && casa(n, toks[i]))) n = n.parentNode; if (!n) return false; n = n.parentNode; }
    return true;
  }
  function anexar(el, filhos) {
    for (const f of filhos) {
      if (f === null || f === undefined || f === false || f === true) continue;
      if (Array.isArray(f)) anexar(el, f);
      else if (typeof f === "object" && f.nodeType) el.appendChild(f);
      else el.appendChild(new Texto(f));
    }
  }
  function h(tag, attrs, ...filhos) {
    const el = new El(tag);
    if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { filhos.unshift(attrs); attrs = null; }
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
      else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv); }
      else if (k === "on") { for (const [t, f] of Object.entries(v)) if (typeof f === "function") el.addEventListener(t, f); }
      else if (k === "style") { if (typeof v === "string") el.attrs.set("style", v); else for (const [p, val] of Object.entries(v)) if (val !== null && val !== undefined) el.style.setProperty(p, String(val)); }
      else if (["hidden", "disabled", "open", "value", "checked"].includes(k)) { el[k] = v; if (v === true) el.attrs.set(k, ""); }
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    anexar(el, filhos);
    return el;
  }
  return { h, evento, estado };
}

/* ============================================================ a tela montada */
const tique = () => new Promise(r => setTimeout(r, 0));
const esperar = async (n = 10) => { for (let i = 0; i < n; i++) await tique(); };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function memoria() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m };
}
const consultaEm = (dia, hh, extra = {}) => ({ negocio_id: 801, contato_id: 501, nome: "Mariana Costa", titulo: "Aparelho", servico: "Avaliação", status: "aberto",
  inicio: `${dia}T${hh}:00-03:00`, fim: `${dia}T${hh.slice(0, 2)}:30:00-03:00`, ...extra });
const naData = (c, de, dias) => { const d = A.partesSP(c.inicio).dia; return d >= de && d < A.diaISO(de, dias); };
const PAPEIS = ["leitura", "atendente", "supervisor", "admin"];
const porTexto = (raizEl, sel, txt) => raizEl.querySelectorAll(sel).find(e => e.textContent.includes(txt)) || null;

async function montarAgenda({ data, modo = "semana", consultas = [], bloqueios = [], rpc = null, modal = null, rascunhoStorage = null, comConversas = true, papel = "admin",
  cfg = { duracao_min: 30, capacidade: 1 }, conta = "conta-ag", prefsExtra = {}, novoNegocio = null, movel = false } = {}) {   // agenda-2: movel = largura de celular
  const D = criarDom();
  const { h } = D;
  const reg = { chamadas: [], modais: [], toasts: [], desfazer: [], pops: [], comandos: [], ativos: new Set(), checks: [], vazios: [], copiados: [], navegou: [], intervalos: [], rolagens: [], impressoes: 0 };
  const ouv = new Map();
  const doc = {
    hidden: false, body: h("body"),
    addEventListener(t, f) { if (!ouv.has(t)) ouv.set(t, []); ouv.get(t).push(f); },
    removeEventListener(t, f) { if (ouv.has(t)) ouv.set(t, ouv.get(t).filter(x => x !== f)); },
    querySelector: () => null, elementFromPoint: () => null, createElement: tag => h(tag), get activeElement() { return D.estado.ativo || doc.body; },
  };
  const storage = new Map();
  const hoje = hojeSP();
  const chave = A.chavePreferenciasAgenda("cli-ag", conta);
  storage.set(chave, JSON.stringify({ data, modo, em: hoje, ...prefsExtra }));
  const intervaloReal = globalThis.setInterval, limparIntervaloReal = globalThis.clearInterval;
  const globais = { document: doc, matchMedia: () => ({ matches: movel, addEventListener() {}, removeEventListener() {} }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    requestAnimationFrame: f => setTimeout(() => f(Date.now()), 0), cancelAnimationFrame: id => clearTimeout(id), innerHeight: 800,
    scrollBy: (x, y) => { reg.rolagens.push([x, y]); }, print: () => { reg.impressoes++; reg.classeAoImprimir = doc.body.classList.contains("ag-imprimindo"); },
    setInterval: (f, ms) => { if (ms === 60_000) { reg.intervalos.push(f); return { falso: true }; } return intervaloReal(f, ms); },
    clearInterval: id => { if (!(id && id.falso)) limparIntervaloReal(id); } };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  const dados = { consultas, bloqueios, cfg };
  const ui = {
    h, limpar: el => { el.replaceChildren(); return el; }, carregarCss: async () => {}, hojeSP: () => hoje, icone: n => h("svg", { class: "ic", dataset: { n } }),
    cabecalho: o => h("header", { class: "cab" }, h("h1", null, o.titulo), h("div", { class: "cab-acoes" }, o.acoes)),
    segmentado: o => h("div", { class: ["seg", o.classe], role: "tablist" }, (o.opcoes || []).map(op => h("button", { type: "button", role: "tab", dataset: { valor: op.valor }, "aria-selected": String(op.valor === o.valor), on: { click: () => o.aoMudar && o.aoMudar(op.valor) } }, op.rotulo))),
    esqueleto: tipo => h("div", { class: ["esqueleto", `esqueleto-${tipo}`] }),
    erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    num: v => String(v), dataBR: iso => String(iso), dataCurtaBR: iso => String(iso).slice(5), horaBR: iso => String(iso || "").slice(11, 16), dataHoraBR: iso => String(iso || ""), periodoBR: () => "", telBR: t => `tel ${t}`,
    toast: (t, o) => { reg.toasts.push(t); return { fechar() {} }; }, acaoComDesfazer: o => { reg.desfazer.push(o); return Promise.resolve(); },
    modal: async o => { reg.modais.push(o); return modal ? modal(o, D) : null; }, flutuante: (ancora, corpo) => { reg.pops.push(corpo); return { fechar() {} }; }, comportamentoRolagem: () => "auto",
    debounce: f => { const g = (...a) => f(...a); g.cancelar = () => {}; return g; },
    campo: o => h("label", { class: "campo" }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : "input", { name: o.nome, value: o.valor ?? "" })),
    carregando: async (b, p) => (typeof p === "function" ? p() : p),
    checkSucesso: (el, o) => { reg.checks.push([el, o]); return Promise.resolve(true); },
    vazio: o => { reg.vazios.push(o); return h("div", { class: "vazio" }, h("h2", null, o.titulo)); },
    avatar: (nome, id) => h("span", { class: "avatar", dataset: { id } }, String(nome).slice(0, 1)),
    copiar: async t => { reg.copiados.push(t); return true; },
  };
  const api = { mensagemErro: e => String(e && (e.codigo || e.message)), rpcC: async (nome, p = {}) => {
    reg.chamadas.push({ nome, p });
    await tique();
    if (rpc) { const r = await rpc(nome, p, dados); if (r !== undefined) return r; }
    if (nome === "nx_agenda_dia") return { config: dados.cfg, consultas: dados.consultas.filter(c => naData(c, p.p_data, p.p_dias)), bloqueios: dados.bloqueios };
    return {};
  } };
  const rascunho = R.criarRascunhos({ storage: rascunhoStorage || memoria(), conta: () => conta, cliente: () => "cli-ag", doc: null, janela: null });
  const alvo = h("main", { id: "vista" });
  const ctx = { ui, api, alvo, versao: "p1000", cliente: { id: "cli-ag" }, sessao: { conta: { id: conta } }, titulo() {}, navegar: rota => reg.navegou.push(rota),
    comandos: { registrar(cmd) { reg.comandos.push(cmd); reg.ativos.add(cmd); return () => reg.ativos.delete(cmd); } },
    rascunho: { ligar: (c, k, o) => rascunho.ligar(c, k, o), apagar: k => rascunho.apagar(k), existe: k => rascunho.existe(k), texto: k => rascunho.texto(k) },
    pode: p => PAPEIS.indexOf(papel) >= PAPEIS.indexOf(p), temModulo: m => (m === "conversas" ? comConversas : true),
    carregar: async () => ({ kit: async () => ({ base: { usuarios: [] } }) }) };
  if (novoNegocio) ctx.novoNegocio = novoNegocio;
  await A.montar(ctx);
  await esperar(8);
  return { D, h, alvo, reg, dados, rascunho, hoje, ctx, storage, chave, ouv,
    sair() { A.desmontar(); for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}
const futuraSeg = () => A.segundaDe(A.diaISO(hojeSP(), 14));     // uma semana inteira no futuro
const passadaSeg = () => A.segundaDe(A.diaISO(hojeSP(), -21));   // tudo «já passou»
const cfgSemana = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1 };
/** Janela de mentira com rodapé: chama aoAbrir com o botão primário (como o ui.modal) e fica aberta até `fechar`. */
function janelaAberta(registro) {
  return (o, D) => new Promise(res => {
    const el = D.h("div", { class: "modal" }, D.h("footer", { class: "modal-rod" }, D.h("button", { type: "button", dataset: { tipo: "primario" } }, "ok")));
    registro.push({ o, el, fechar: v => res(v) });
    if (o.aoAbrir) o.aoAbrir({ el, fechar: v => res(v) });
  });
}
const erroModal = lista => ({ erro: t => lista.push(t) });
const primaria = o => o.acoes.find(a => a.tipo === "primario" || a.tipo === "perigo");
/** Arrasta o bloco da consulta `negocio` até a fração `fracao` da coluna (0 = início do eixo; a coluna tem 1000 px). */
async function arrastar(T, { negocio = 801, fracao = .4, soltar = true, y = null } = {}) {
  const bt = T.alvo.querySelector(`.ag-item[data-negocio="${negocio}"] .ag-bloco`);
  const col = bt.closest(".ag-col");
  col.getBoundingClientRect = () => ({ top: 0, left: 0, width: 140, height: 1000, right: 140, bottom: 1000 });
  globalThis.document.elementFromPoint = () => col;
  bt.dispatchEvent(T.D.evento("pointerdown", { button: 0, pointerType: "mouse", pointerId: 7, clientX: 50, clientY: 100 }));
  bt.dispatchEvent(T.D.evento("pointermove", { pointerId: 7, clientX: 50, clientY: y ?? fracao * 1000 }));
  const fantasma = col.querySelector(".ag-fantasma");
  if (soltar) { bt.dispatchEvent(T.D.evento("pointerup", { pointerId: 7 })); await esperar(10); }
  return { bt, col, fantasma };
}

/* ============================================================ P1 · acessibilidade */
test("CA-161 · a Agenda não é região viva; um status curto anuncia o período («Semana de 12 a 18/10: 4 consultas»)", async () => {
  assert.equal(A.textoAnuncioPeriodo({ modo: "semana", de: "2026-10-12", dias: 7, n: 4 }), "Semana de 12 a 18/10: 4 consultas");
  assert.equal(A.textoAnuncioPeriodo({ modo: "semana", de: "2026-09-28", dias: 7, n: 1 }), "Semana de 28/09 a 04/10: 1 consulta", "semana que vira o mês");
  assert.equal(A.textoAnuncioPeriodo({ modo: "mes", de: "2026-10-01", dias: 31, n: 0 }), "Outubro de 2026: 0 consultas");
  assert.match(A.textoAnuncioPeriodo({ modo: "dia", de: "2026-10-15", dias: 1, n: 2 }), /^Qui.*15.*: 2 consultas$/);
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00"), consultaEm(A.diaISO(seg, 2), "11:00", { negocio_id: 802 })] });
  try {
    const conteudo = T.alvo.querySelector(".agenda-conteudo");
    assert.equal(conteudo.getAttribute("aria-live"), null, "a grade inteira não é lida a cada redesenho");
    await dormir(40);
    const st = T.alvo.querySelector(".agenda-anuncio");
    assert.equal(st.getAttribute("role"), "status");
    assert.equal(st.textContent, A.textoAnuncioPeriodo({ modo: "semana", de: seg, dias: 7, n: 2 }));
    assert.ok(!conteudo.contains(st), "o status fica fora do conteúdo");
  } finally { T.sair(); }
});

test("CA-162 / CA-221 · «Próxima semana» e «Dia» continuam no DOM e com o foco depois do clique (os controles não são recriados)", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg });
  try {
    const prox = T.alvo.querySelector(".agenda-proximo");
    assert.equal(prox.getAttribute("aria-label"), "Próxima semana");
    prox.focus();
    prox.click();
    await esperar(10);
    assert.equal(T.D.estado.ativo, prox, "o foco continua no mesmo botão");
    assert.ok(T.alvo.contains(prox), "o botão não saiu do DOM");
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === A.diaISO(seg, 7)).length, 1, "a semana seguinte foi lida");
    const dia = T.alvo.querySelector('.agenda-abas [data-valor="dia"]');
    dia.focus(); dia.click();
    await esperar(10);
    assert.ok(T.alvo.contains(dia), "a aba «Dia» é a mesma depois de trocar a visão");
    assert.equal(T.D.estado.ativo, dia);
    assert.equal(T.alvo.querySelector(".agenda-proximo"), prox);
    assert.equal(prox.getAttribute("aria-label"), "Próximo dia", "só o rótulo muda");
  } finally { T.sair(); }
});

test("CA-163 · redesenhar pela legenda devolve o foco ao mesmo chip (chave estável), não ao body", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { servico: "Avaliação" }), consultaEm(A.diaISO(seg, 1), "10:00", { negocio_id: 802, servico: "Implante" })] });
  try {
    const chip = T.alvo.querySelector(".ag-leg-chip");
    const chaveChip = chip.dataset.chave;
    chip.focus(); chip.click();
    const agora = T.D.estado.ativo;
    assert.notEqual(agora, chip, "o chip foi recriado pelo redesenho");
    assert.ok(T.alvo.contains(agora) && agora.dataset.chave === chaveChip && agora.getAttribute("aria-pressed") === "true", "o foco está no chip novo, já pressionado");
    // presença: o foco fica no botão do painel
    const pas = passadaSeg();
    const T2 = await montarAgenda({ data: pas, modo: "dia", consultas: [consultaEm(pas, "10:00", { presenca: null })], rpc: async (n, p) => (n === "nx_agenda_presenca" ? { ok: true, presenca: p.p_estado } : undefined) });
    try {
      const b = T2.alvo.querySelector(".ag-pres-compareceu");
      b.focus(); b.click();
      await esperar(10);
      const f = T2.D.estado.ativo;
      assert.ok(T2.alvo.contains(f) && f.classList.contains("ag-pres-compareceu"), "o foco volta ao «Compareceu» redesenhado");
    } finally { T2.sair(); }
  } finally { T.sair(); }
});

/* ============================================================ P2 */
test("CA-005 · quem só lê não marca, mas recebe a explicação (antes: nada acontecia)", async () => {
  const toasts = [];
  const r = await A.marcarConsulta({ pode: () => false, ui: { toast: t => toasts.push(t) } }, { negocio: { id: 1 } });
  assert.equal(r, null);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /só permite ver a agenda/);
});

test("CA-164 · arrastar para cima de um bloqueio: fantasma vermelho, aviso com o motivo e nenhuma confirmação", async () => {
  const seg = futuraSeg();
  const bloqueios = [{ id: 1, inicio: `${seg}T12:00:00-03:00`, fim: `${seg}T13:00:00-03:00`, motivo: "Intervalo da equipe" }];
  const k = A.conflitoNoDestino({ iso: seg, min: 12 * 60 + 30, duracao: 30, bloqueios });
  assert.deepEqual(k, { motivo: "bloqueado", rotulo: "Intervalo da equipe" });
  assert.equal(A.conflitoNoDestino({ iso: seg, min: 11 * 60, duracao: 60, bloqueios }), null, "terminar na hora do bloqueio não é conflito");
  assert.equal(A.conflitoNoDestino({ iso: seg, min: 11 * 60, duracao: 90, bloqueios }).motivo, "bloqueado", "a duração entra na conta");
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")], bloqueios });
  try {
    const { fantasma } = await arrastar(T, { fracao: .4 });     // 12:00
    assert.ok(fantasma.classList.contains("ag-fantasma-ruim"));
    assert.equal(T.reg.modais.length, 0, "sem a janela «Remarcar?»");
    assert.equal(T.reg.toasts.at(-1), "Horário bloqueado: Intervalo da equipe.");
  } finally { T.sair(); }
});

test("CA-165 · com capacidade 1, soltar sobre outra consulta avisa (atendente); supervisor remarca como encaixe", async () => {
  const seg = futuraSeg();
  const consultas = () => [consultaEm(seg, "10:00"), consultaEm(seg, "12:00", { negocio_id: 802, nome: "Rafael" })];
  assert.deepEqual(A.conflitoNoDestino({ iso: seg, min: 12 * 60, duracao: 30, consultas: consultas(), config: { capacidade: 1 }, ignorar: consultas()[0] }), { motivo: "lotado", ocupados: 1, capacidade: 1 });
  assert.equal(A.conflitoNoDestino({ iso: seg, min: 12 * 60, duracao: 30, consultas: consultas(), config: { capacidade: 2 } }), null, "capacidade 2: cabe");
  assert.equal(A.conflitoNoDestino({ iso: seg, min: 10 * 60, duracao: 30, consultas: consultas(), config: { capacidade: 1 }, ignorar: consultas()[0] }), null, "a própria consulta não conta");
  const T = await montarAgenda({ data: seg, consultas: consultas(), papel: "atendente" });
  try {
    const { fantasma } = await arrastar(T, { fracao: .4 });
    assert.ok(fantasma.classList.contains("ag-fantasma-ruim"));
    assert.equal(T.reg.modais.length, 0);
    assert.match(T.reg.toasts.at(-1), /já está cheio/);
  } finally { T.sair(); }
  const janelas = [];
  const T2 = await montarAgenda({ data: seg, consultas: consultas(), papel: "supervisor", modal: async o => { janelas.push(o); return primaria(o).fn(erroModal([])); },
    rpc: async n => (n === "nx_agenda_marcar" ? { ok: true, remarcada: true } : n === "nx_negocio_ver" ? { negocio: { estagio_id: "s1" } } : undefined) });
  try {
    const { fantasma } = await arrastar(T2, { fracao: .4 });
    assert.ok(fantasma.classList.contains("ag-fantasma-encaixe") && !fantasma.classList.contains("ag-fantasma-ruim"));
    await esperar(10);
    assert.equal(janelas.length, 1);
    assert.ok(janelas[0].corpo.querySelector(".ag-remarcar-encaixe"), "a confirmação avisa que entra como encaixe");
    assert.equal(T2.reg.chamadas.find(c => c.nome === "nx_agenda_marcar").p.p_encaixe, true);
  } finally { T2.sair(); }
});

test("CA-166 · perto da borda de baixo a página rola sozinha enquanto se arrasta; soltar para", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try {
    const { bt } = await arrastar(T, { y: 790, soltar: false });     // innerHeight 800: dentro dos 48 px da borda
    await esperar(4);
    assert.ok(T.reg.rolagens.length >= 2 && T.reg.rolagens.every(([x, y]) => x === 0 && y === 12), JSON.stringify(T.reg.rolagens));
    bt.dispatchEvent(T.D.evento("pointerup", { pointerId: 7 }));
    await esperar(4);
    const n = T.reg.rolagens.length;
    await esperar(4);
    assert.equal(T.reg.rolagens.length, n, "soltou: a rolagem parou");
    bt.dispatchEvent(T.D.evento("pointerdown", { button: 0, pointerType: "mouse", pointerId: 8, clientX: 50, clientY: 100 }));
    bt.dispatchEvent(T.D.evento("pointermove", { pointerId: 8, clientX: 50, clientY: 400 }));
    await esperar(4);
    assert.equal(T.reg.rolagens.length, n, "no meio da tela não rola");
    bt.dispatchEvent(T.D.evento("pointercancel", { pointerId: 8 }));
  } finally { T.sair(); }
});

test("CA-167 · a agenda se relê sozinha (relógio de 60 s): consulta nova aparece; sem mudança não redesenha", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  const real = Date.now;
  try {
    assert.equal(T.reg.intervalos.length, 1);
    const bloco = T.alvo.querySelector(".ag-bloco");
    Date.now = () => real() + 61_000;
    T.reg.intervalos[0]();
    await esperar(10);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === seg).length, 2, "releu o período");
    assert.equal(T.alvo.querySelector(".ag-bloco"), bloco, "nada mudou: a grade é a mesma (sem piscar nem perder foco)");
    T.dados.consultas = [...T.dados.consultas, consultaEm(A.diaISO(seg, 1), "15:00", { negocio_id: 802, nome: "Bianca" })];
    Date.now = () => real() + 122_000;
    T.reg.intervalos[0]();
    await esperar(10);
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"]'), "o bloco novo (marcado por outra pessoa) aparece");
  } finally { Date.now = real; T.sair(); }
});

test("CA-168 · a consulta que acabou de começar deixa de ser a «Próxima» e ganha «Compareceu / Faltou» no tique do relógio", async () => {
  const hoje = hojeSP();
  const real = Date.now;
  const inicio = new Date(real() + 60_000);
  const p = A.partesSP(inicio);
  if (p.dia !== hoje) return;     // virada do dia em São Paulo durante o teste: nada a conferir
  const c = { ...consultaEm(hoje, A.horaTxt(p.min)), inicio: inicio.toISOString(), fim: new Date(real() + 31 * 60_000).toISOString(), presenca: null };
  const T = await montarAgenda({ data: hoje, modo: "dia", consultas: [c] });
  try {
    assert.ok(T.alvo.querySelector(".ag-item.ag-proxima"), "ainda é a próxima");
    assert.equal(T.alvo.querySelector(".ag-pres"), null);
    Date.now = () => real() + 2 * 60_000;
    T.reg.intervalos[0]();
    await esperar(10);
    assert.equal(T.alvo.querySelector(".ag-item.ag-proxima"), null, "começou: não é mais a próxima");
    assert.ok(T.alvo.querySelector('.ag-painel-li[data-negocio="801"] .ag-pres'), "os botões de presença aparecem");
  } finally { Date.now = real; T.sair(); }
});

/** Abre «Remarcar» pelo detalhe do bloco (a janela já com a oportunidade): horários de mentira e a janela que fica aberta. */
const livres = (dias, de) => ({ duracao_min: 30, horarios: dias.map(d => ({ inicio: `${A.diaISO(de, d)}T14:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 })) });

test("CA-169 · Serviço com sugestões das durações da configuração e aviso quando o nome não casa (vale a padrão)", async () => {
  const seg = futuraSeg();
  const janelas = [];
  const cfg = { duracao_min: 30, capacidade: 1, duracoes: { "Avaliação": 30, "Limpeza": 45 } };
  const T = await montarAgenda({ data: seg, cfg, modal: janelaAberta(janelas) });
  try {
    T.alvo.querySelector(".agenda-marcar").click();
    await esperar(8);
    const corpo = janelas[0].o.corpo;
    const lista = corpo.querySelector("datalist");
    assert.deepEqual(lista.querySelectorAll("option").map(o => o.value), ["Avaliação", "Limpeza"]);
    const inp = corpo.querySelector('input[name="servico"]');
    assert.equal(inp.getAttribute("list"), lista.getAttribute("id"));
    inp.value = "limpeza"; inp.dispatchEvent(T.D.evento("input"));
    assert.equal(corpo.querySelector(".ag-serv-aviso").textContent, "Duração de «Limpeza»: 45 min.");
    inp.value = "Clareamento"; inp.dispatchEvent(T.D.evento("input"));
    assert.equal(corpo.querySelector(".ag-serv-aviso").textContent, "Serviço sem duração própria: 30 min (padrão).");
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_dias === 1).length, 0, "a configuração veio da tela: nenhuma leitura extra");
  } finally { T.sair(); }
});

test("CA-181 · lembrete sem nome de verdade (telefone, só o título) sai «Olá!»; o título não vira nome", () => {
  const hoje = "2026-10-09", inicio = "2026-10-10T10:00:00-03:00";
  assert.equal(A.textoLembrete({ nome: "5512999990000", inicio }, hoje), "Olá! Passando para lembrar da sua consulta amanhã às 10:00. Podemos confirmar?");
  assert.match(A.textoLembrete({ nome: "Dra. Helena Souza", inicio }, hoje), /^Olá, Helena! /);
  assert.match(A.textoLembrete({ nome: "Dra.", inicio }, hoje), /^Olá! /);
  assert.match(A.textoLembrete({ nome: "mariana costa", inicio }, hoje), /^Olá, Mariana! /);
  assert.equal(A.primeiroNomeAgenda("(12) 99830-3030"), "");
});

/* ---------- configuração da agenda (agenda-config.js) ---------- */
async function montarConfig({ cfg = {}, consultas = [], hoje = hojeSP(), modal = null, uiExtra = {}, bloqueios = [], rpc = null } = {}) {   // agenda-2: uiExtra, bloqueios, rpc
  const D = criarDom();
  const { h } = D;
  const reg = { chamadas: [], toasts: [], modais: [], navegou: [] };
  const lerForm = raizEl => {
    const out = {};
    for (const el of raizEl.querySelectorAll("input, textarea, select")) {
      const n = el.getAttribute("name");
      if (!n) continue;
      out[n] = el.getAttribute("type") === "checkbox" ? !!el.checked : el.value ?? "";
    }
    return out;
  };
  const campo = o => {
    const tipo = o.tipo === "interruptor" ? "checkbox" : o.tipo === "numero" ? "number" : o.tipo === "data" ? "date" : o.tipo === "hora" ? "time" : "text";
    const inp = h(o.tipo === "textarea" ? "textarea" : "input", { name: o.nome, type: tipo, value: o.tipo === "interruptor" ? null : (o.valor ?? "") });
    if (o.tipo === "interruptor") inp.checked = !!o.valor;
    return h("label", { class: "campo" }, o.rotulo || "", inp);
  };
  const ui = { h, carregarCss() {}, limpar: el => { el.replaceChildren(); return el; }, esqueleto: () => h("div"), erroCartao: () => h("div"), icone: n => h("svg", { dataset: { n } }),
    campo, marcarErro() {}, lerForm, toast: t => { reg.toasts.push(t); }, carregando: async (b, p) => p, confirmar: async () => true, periodoBR: () => "", dataHoraBR: s => String(s), hojeSP: () => hoje,
    modal: async o => { reg.modais.push(o); return modal ? modal(o, D) : null; }, ...uiExtra };
  const api = { mensagemErro: e => String(e && e.message), rpcC: async (nome, p = {}) => {
    reg.chamadas.push({ nome, p });
    await tique();
    if (rpc) { const r = await rpc(nome, p); if (r !== undefined) return r; }
    if (nome === "nx_agenda_config_ver") return { config: cfg, bloqueios };
    if (nome === "nx_agenda_dia") return { consultas };
    if (nome === "nx_agenda_bloqueio_salvar") return { ok: true, bloqueios: [] };
    return {};
  } };
  const alvo = h("section");
  const ret = await CFG.secoesConfig[0].montar({ ui, api, navegar: r => reg.navegou.push(r) }, alvo);
  return { D, alvo, reg, ret };
}

test("CA-210 · bloqueio por cima de consultas marcadas avisa antes de salvar (2º toque salva mesmo assim)", async () => {
  const dia = A.diaISO(hojeSP(), 10);
  const consultas = [consultaEm(dia, "09:00"), consultaEm(dia, "15:00", { negocio_id: 802, nome: "Rafael" }), consultaEm(A.diaISO(dia, 3), "10:00", { negocio_id: 803 })];
  assert.equal(CFG.consultasNoBloqueio(consultas, { data: dia }).length, 2, "dia inteiro: as duas do dia");
  assert.deepEqual(CFG.consultasNoBloqueio(consultas, { data: dia, das: "14:00", ate: "18:00" }).map(c => c.negocio_id), [802], "só a da tarde");
  assert.equal(CFG.consultasNoBloqueio(consultas, { data: dia, data_fim: A.diaISO(dia, 3) }).length, 3, "período de vários dias");
  const erros = [];
  let resultado;
  const C = await montarConfig({ consultas, modal: async o => {
    o.aoAbrir && o.aoAbrir({ fechar() {} });
    o.corpo.querySelector('[name="data"]').value = dia;
    const fn = primaria(o).fn;
    assert.equal(await fn(erroModal(erros)), false, "1º toque: não salva");
    const aviso = o.corpo.querySelector(".agc-aviso-consultas");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /^2 consultas caem neste bloqueio: Mariana Costa .*Rafael/);
    assert.ok(aviso.querySelector('a[href="#/agenda"]'), "com o caminho para a Agenda");
    resultado = await fn(erroModal(erros));
    return resultado;
  } });
  porTexto(C.alvo, "button", "Bloquear horário").click();   // plano 1000 · CA-278: o botão virou «Bloquear horário» (um nome só)
  await esperar(10);
  assert.match(erros[0], /Há 2 consultas marcadas neste período/);
  // plano 1500c: a prévia do horário herdado lê hoje (CC-235); a conta aqui é só a do período do bloqueio
  assert.equal(C.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === dia).length, 1, "o mesmo período não é lido de novo");
  assert.ok(C.reg.chamadas.some(c => c.nome === "nx_agenda_bloqueio_salvar"), "o 2º toque salva");
});

test("CA-211 · bloqueio com data inicial no passado é recusado na janela", async () => {
  assert.equal(CFG.dataBloqueioPassada("2026-10-12", "2026-10-13"), true);
  assert.equal(CFG.dataBloqueioPassada("2026-10-13", "2026-10-13"), false);
  const erros = [];
  const C = await montarConfig({ hoje: "2026-10-13", modal: async o => { o.corpo.querySelector('[name="data"]').value = "2026-10-12"; return primaria(o).fn(erroModal(erros)); } });
  porTexto(C.alvo, "button", "Bloquear horário").click();   // plano 1000 · CA-278: o botão virou «Bloquear horário» (um nome só)
  await esperar(6);
  assert.deepEqual(erros, ["A data inicial já passou. Escolha hoje ou uma data futura."]);
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_bloqueio_salvar"));
});

test("CA-207 · faixas sobrepostas no mesmo dia não vão ao servidor: aviso no próprio dia", async () => {
  assert.deepEqual(CFG.faixasSobrepostas([["11:00", "14:00"], ["08:00", "12:00"]]), [["08:00", "12:00"], ["11:00", "14:00"]]);
  assert.equal(CFG.faixasSobrepostas([["08:00", "12:00"], ["12:00", "18:00"]]), null, "encostar não é sobrepor");
  const C = await montarConfig({ cfg: { horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"], ["11:00", "14:00"]] }, duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30 } });
  const form = C.alvo.querySelector("form");
  form.dispatchEvent(C.D.evento("submit"));
  await esperar(4);
  assert.equal(C.reg.toasts.at(-1), "Os horários de Segunda-feira se sobrepõem.");
  const erroDia = C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-erro-dia');
  assert.equal(erroDia.hidden, false);
  assert.match(erroDia.textContent, /08:00–12:00 e 11:00–14:00 se sobrepõem/);
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
});

test("AS-084 · a Agenda fica no grupo «CRM» das configurações", () => {
  assert.equal(CFG.secoesConfig[0].grupo, "CRM");
  assert.ok(CFG.secoesConfig[0].desc);
});

/* ---------- janela «Marcar» ---------- */
async function abrirMarcar({ papel = "admin", rpc = null, novoNegocio = null, cfg } = {}) {
  const seg = futuraSeg();
  const janelas = [];
  const T = await montarAgenda({ data: seg, papel, novoNegocio, cfg, modal: janelaAberta(janelas), rpc: async (n, p, d) => {
    if (rpc) { const r = await rpc(n, p, d); if (r !== undefined) return r; }
    if (n === "nx_buscar") return { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", estagio_nome: "Nova", status: "aberto" }, { id: 802, titulo: "Implante", contato_nome: "Rafael", estagio_nome: "Nova", status: "aberto" }].filter(x => p.p_q === "todos" || x.contato_nome.toLowerCase().startsWith(p.p_q.toLowerCase())) };
    if (n === "nx_agenda_livres") return livres([0, 1], p.p_a_partir);
    if (n === "nx_negocio_ver") return { negocio: { id: p.p_id, estagio_id: "s1" } };
    return undefined;
  } });
  T.alvo.querySelector(".agenda-marcar").click();
  await esperar(8);
  const j = janelas[0];
  return { T, j, corpo: j.o.corpo, conf: j.el.querySelector('[data-tipo="primario"]'), janelas, seg };
}

test("CA-171 / CA-172 / CA-281 · «Confirmar» indisponível até escolher; «Quando» só depois de «Quem»; Enter na busca leva ao horário (Enter de novo não marca)", async () => {
  const { T, corpo, conf } = await abrirMarcar();
  try {
    assert.equal(conf.getAttribute("aria-disabled"), "true");
    assert.equal(corpo.querySelector(".ag-falta").textContent, "Escolha a oportunidade.");
    assert.equal(corpo.querySelector(".ag-quando").hidden, true, "sem oportunidade: serviço, data e horários esperam");
    const busca = corpo.querySelector('input[name="busca"]');
    busca.value = "Mar";
    busca.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(16);
    assert.equal(corpo.querySelector(".ag-quando").hidden, false);
    assert.equal(conf.getAttribute("aria-disabled"), "false", "oportunidade e horário: vale");
    const foco = T.D.estado.ativo;
    assert.ok(foco.classList.contains("ag-hora-pill") && foco.getAttribute("aria-checked") === "true", "o foco foi para o horário escolhido, não para «Confirmar»");
    foco.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_marcar").length, 0, "Enter repetido não marca nada");
  } finally { T.sair(); }
});

test("CA-282 · setas escolhem na lista de resultados (aria-activedescendant / aria-selected) e Enter usa o escolhido", async () => {
  const { T, corpo } = await abrirMarcar();
  try {
    const busca = corpo.querySelector('input[name="busca"]');
    assert.equal(busca.getAttribute("role"), "combobox");
    busca.value = "todos";
    busca.dispatchEvent(T.D.evento("input"));
    await esperar(6);
    const ops = corpo.querySelectorAll(".agenda-resultado");
    assert.equal(ops.length, 2);
    busca.dispatchEvent(T.D.evento("keydown", { key: "ArrowDown" }));
    assert.equal(busca.getAttribute("aria-activedescendant"), ops[0].getAttribute("id"));
    busca.dispatchEvent(T.D.evento("keydown", { key: "ArrowDown" }));
    assert.equal(busca.getAttribute("aria-activedescendant"), ops[1].getAttribute("id"));
    assert.deepEqual(ops.map(o => o.getAttribute("aria-selected")), ["false", "true"]);
    busca.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(10);
    assert.match(corpo.querySelector(".agenda-escolhido").textContent, /^Implante/);
  } finally { T.sair(); }
});

test("CA-170 · «Novo paciente» cria a oportunidade sem sair da janela e ela já fica escolhida com os horários", async () => {
  const pedidos = [];
  const { T, corpo, janelas } = await abrirMarcar({ novoNegocio: async (dados, o) => { pedidos.push(dados); o.aoCriar({ id: 909, titulo: "Paciente novo" }); } });
  try {
    corpo.querySelector('input[name="busca"]').value = "Joana";
    corpo.querySelector(".ag-novo-paciente").click();
    await esperar(12);
    assert.deepEqual(pedidos, [{ nome: "Joana" }], "o nome digitado vai para o CRM");
    assert.match(corpo.querySelector(".agenda-escolhido").textContent, /^Paciente novo/);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_livres" && c.p.p_negocio === 909));
    assert.equal(janelas.length, 1, "a mesma janela continua aberta");
  } finally { T.sair(); }
});

test("CA-173 · «Ver mais 14 dias» pede a partir do fim da janela e soma os dias ao fim da lista", async () => {
  const { T, corpo, seg } = await abrirMarcar();
  try {
    const busca = corpo.querySelector('input[name="busca"]');
    busca.value = "Mar"; busca.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(14);
    assert.equal(corpo.querySelectorAll(".ag-dia-chip").length, 2);
    const mais = corpo.querySelector(".ag-mais-dias");
    assert.equal(mais.hidden, false);
    mais.click();
    await esperar(8);
    const pedidos = T.reg.chamadas.filter(c => c.nome === "nx_agenda_livres");
    assert.equal(pedidos.length, 2);
    assert.equal(pedidos[1].p.p_a_partir, A.diaISO(pedidos[0].p.p_a_partir, 14));
    assert.equal(corpo.querySelectorAll(".ag-dia-chip").length, 4, "os dias novos entram depois dos que já estavam");
    assert.ok(seg);
  } finally { T.sair(); }
});

test("CA-193 · horário que acabou de lotar: supervisor ganha «Encaixar mesmo assim» (p_encaixe); atendente não", async () => {
  let marcar = 0;
  const rpc = async n => { if (n === "nx_agenda_marcar") return ++marcar === 1 ? { ok: false, erro: "horario_ocupado" } : { ok: true }; return undefined; };
  const { T, corpo, j } = await abrirMarcar({ papel: "supervisor", rpc });
  try {
    const busca = corpo.querySelector('input[name="busca"]');
    busca.value = "Mar"; busca.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(14);
    const erros = [];
    assert.equal(await primaria(j.o).fn(erroModal(erros)), false);
    assert.match(erros[0], /Encaixar mesmo assim/);
    const enc = corpo.querySelector(".ag-encaixe");
    assert.equal(enc.hidden, false);
    enc.querySelector("input").checked = true;
    await primaria(j.o).fn(erroModal(erros));
    const chamadas = T.reg.chamadas.filter(c => c.nome === "nx_agenda_marcar");
    assert.equal(chamadas[0].p.p_encaixe, undefined);
    assert.equal(chamadas[1].p.p_encaixe, true, "o 2º pedido vai como encaixe");
  } finally { T.sair(); }
  marcar = 0;
  const X = await abrirMarcar({ papel: "atendente", rpc });
  try {
    const busca = X.corpo.querySelector('input[name="busca"]');
    busca.value = "Mar"; busca.dispatchEvent(X.T.D.evento("keydown", { key: "Enter" }));
    await esperar(14);
    const erros = [];
    await primaria(X.j.o).fn(erroModal(erros));
    assert.match(erros[0], /acabou de ser ocupado/);
    assert.equal(X.corpo.querySelector(".ag-encaixe").hidden, true);
  } finally { X.T.sair(); }
});

test("pedido do CRM · marcarConsulta(ctx, {soEscolher: true}) devolve {consulta_em, servico} sem gravar nada", async () => {
  const D = criarDom();
  const chamadas = [];
  const fut = A.diaISO(hojeSP(), 5);
  const janelas = [];
  const ctx = { pode: () => true, versao: "p1000",
    ui: { h: D.h, carregarCss: async () => {}, hojeSP, icone: () => D.h("svg"), limpar: el => { el.replaceChildren(); return el; }, num: String, horaBR: s => String(s).slice(11, 16), dataHoraBR: String, dataBR: String,
      campo: o => D.h("label", null, D.h("input", { name: o.nome, value: o.valor ?? "" })), debounce: f => f, toast() {}, acaoComDesfazer() { throw new Error("não grava"); },
      modal: o => janelaAberta(janelas)(o, D) },
    api: { mensagemErro: String, rpcC: async (n, p) => { chamadas.push([n, p]); await tique(); return n === "nx_agenda_livres" ? livres([0], fut) : n === "nx_agenda_dia" ? { config: { duracao_min: 30 } } : {}; } } };
  const pr = A.marcarConsulta(ctx, { soEscolher: true });
  await esperar(12);
  const j = janelas[0];
  assert.equal(j.o.corpo.querySelector(".ag-quem").hidden, true, "sem oportunidade: só o «Quando»");
  assert.equal(primaria(j.o).rotulo, "Usar este horário");
  const r = await primaria(j.o).fn(erroModal([]));
  j.fechar(r);
  assert.deepEqual(await pr, { consulta_em: `${fut}T14:00:00-03:00`, servico: null });
  assert.ok(!chamadas.some(([n]) => n === "nx_agenda_marcar"), "nada gravado");
  assert.deepEqual(chamadas.find(([n]) => n === "nx_agenda_livres")[1].p_negocio, null);
});

test("CA-176 / CA-178 · «Avisar paciente» depois de remarcar e de desmarcar deixa a mensagem pronta na conversa (nada é enviado)", async () => {
  const seg = futuraSeg();
  const st = memoria();
  const rpc = async (n, p) => {
    if (n === "nx_agenda_livres") return livres([1], seg);
    if (n === "nx_agenda_marcar") return { ok: true, remarcada: true, consulta: { inicio: p.p_inicio } };
    if (n === "nx_agenda_desmarcar") return { ok: true };
    if (n === "nx_negocio_ver") return { negocio: { estagio_id: "s1" } };
    if (n === "nx_contato_ver") return { conversas: [{ id: 901, status: "aberta" }] };
    return undefined;
  };
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")], rpc, rascunhoStorage: st,
    modal: async o => {
      if (o.aoAbrir) { o.aoAbrir({ el: null }); await esperar(10); }
      // plano 1500c: desmarcar pede uma escolha de motivo (CC-322) — aqui, «Prefiro não dizer»
      const sem = o.corpo && o.corpo.querySelectorAll(".ag-motivo-chip").find(b => b.textContent === A.MOTIVO_SEM);
      if (sem) sem.click();
      return primaria(o).fn(erroModal([]));
    } });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Remarcar").click();
    await esperar(16);
    const aviso = T.reg.desfazer.at(-1);
    assert.match(aviso.texto, /^Remarcada/);
    assert.equal(aviso.acao.rotulo, "Escrever confirmação");   // plano 1000b: CB-123 — o botão escreve no campo, não envia
    T.reg.chamadas.length = 0;
    aviso.acao.fn();
    await esperar(10);
    assert.deepEqual(T.reg.chamadas.map(c => c.nome), ["nx_contato_ver"], "só lê o contato");
    assert.deepEqual(T.reg.navegou, ["#/conversas/901"]);
    const texto = T.rascunho.texto("conversa:901");
    assert.match(texto, /^Olá, Mariana! Sua consulta \(Avaliação\) está marcada para .* às 14:00\./);
    assert.equal(T.reg.toasts.at(-1), "Mensagem pronta no campo da conversa — confira e envie.");
    // desmarcar: o mesmo atalho com o aviso de desmarcação (a conversa já tem rascunho → copia, nunca sobrescreve)
    T.reg.desfazer.length = 0;
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Desmarcar").click();
    await esperar(10);
    const av2 = T.reg.desfazer.at(-1);
    assert.equal(av2.acao.rotulo, "Escrever aviso ao paciente");   // plano 1000b: CB-123
    av2.acao.fn();
    await esperar(10);
    assert.equal(T.rascunho.texto("conversa:901"), texto, "o rascunho que já estava não é trocado");
    assert.match(T.reg.toasts.at(-1), /já tinha um rascunho: a mensagem foi copiada/);
  } finally { T.sair(); }
  assert.equal(A.textoDesmarcacao({ nome: "Rafael Souza", inicio: "2026-10-10T10:00:00-03:00" }, "2026-10-09"), "Olá, Rafael! Sua consulta de amanhã às 10:00 foi desmarcada. Quer escolher um novo horário?");
});

test("CA-177 · motivo de desmarcação em chips (radiogroup) + detalhe livre viram o p_motivo", async () => {
  assert.equal(A.motivoDesmarcar("Vai remarcar", " viajou "), "Vai remarcar · viajou");
  assert.equal(A.motivoDesmarcar(null, ""), null);
  assert.equal(A.motivoDesmarcar("inventado", "x"), "x", "só os motivos da lista");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")], rpc: async n => (n === "nx_agenda_desmarcar" ? { ok: true } : undefined),
    modal: async o => {
      const chips = o.corpo.querySelectorAll(".ag-motivo-chip");
      // plano 1500c: «Prefiro não dizer» entra no fim da lista (CC-322)
      assert.deepEqual(chips.map(c => c.textContent), [...A.MOTIVOS_DESMARCAR, A.MOTIVO_SEM]);
      assert.equal(o.corpo.querySelector(".ag-motivos").getAttribute("role"), "radiogroup");
      chips[1].click();
      assert.equal(chips[1].getAttribute("aria-checked"), "true");
      o.corpo.querySelector("textarea").value = "viajou";
      return primaria(o).fn(erroModal([]));
    } });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Desmarcar").click();
    await esperar(8);
    assert.deepEqual(T.reg.chamadas.find(c => c.nome === "nx_agenda_desmarcar").p, { p_negocio: 801, p_motivo: "Vai remarcar · viajou" });
  } finally { T.sair(); }
});

test("CA-187 · filtro «Mostrar a agenda de»: «Minha agenda» deixa só as consultas da conta; lembrado nas preferências", async () => {
  const seg = futuraSeg();
  const consultas = [consultaEm(seg, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(seg, "11:00", { negocio_id: 802, dono_id: "u2", dono_nome: "Ana Paula" })];
  assert.deepEqual(A.filtrarPorProfissional(consultas, "eu", "u2").map(c => c.negocio_id), [802]);
  assert.deepEqual(A.filtrarPorProfissional(consultas, "u1").map(c => c.negocio_id), [801]);
  assert.equal(A.filtrarPorProfissional(consultas, "todos").length, 2);
  const T = await montarAgenda({ data: seg, consultas, conta: "u1" });
  try {
    const sel = T.alvo.querySelector(".agenda-filtro-prof");
    assert.deepEqual(sel.querySelectorAll("option").map(o => [o.value, o.textContent]), [["todos", "Todos os profissionais"], ["eu", "Minha agenda"], ["u2", "Ana Paula"]]);
    sel.value = "eu";
    sel.dispatchEvent(T.D.evento("change"));
    assert.deepEqual(T.alvo.querySelectorAll(".ag-item").map(i => i.dataset.negocio), ["801"]);
    assert.equal(JSON.parse(T.storage.get(T.chave)).prof, "eu");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: seg, consultas, conta: "u1", prefsExtra: { prof: "u2" } });
  try { assert.deepEqual(T2.alvo.querySelectorAll(".ag-item").map(i => i.dataset.negocio), ["802"], "o filtro guardado volta"); } finally { T2.sair(); }
});

test("CA-186 · semana sem os dias fechados e vazios (domingo) e o botão que os mostra; dia fechado COM consulta continua", async () => {
  const seg = futuraSeg(), dom = A.diaISO(seg, 6);
  assert.equal(A.diaFechadoVazio(cfgSemana, dom, []), true);
  assert.equal(A.diaFechadoVazio(cfgSemana, dom, [consultaEm(dom, "10:00")]), false);
  assert.equal(A.diaFechadoVazio({}, dom, []), false, "sem horário na configuração: nunca esconde");
  const T = await montarAgenda({ data: seg, cfg: cfgSemana });
  try {
    assert.equal(T.alvo.querySelectorAll(".ag-col").length, 6, "domingo fechado sai");
    const bt = T.alvo.querySelector(".ag-fechados-bt");
    assert.equal(bt.textContent, "Mostrar o dia fechado");
    bt.click();
    assert.equal(T.alvo.querySelectorAll(".ag-col").length, 7);
    assert.equal(T.alvo.querySelector(".ag-fechados-bt").getAttribute("aria-pressed"), "true");
    assert.equal(JSON.parse(T.storage.get(T.chave)).fechados, "mostrar");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: seg, cfg: cfgSemana, consultas: [consultaEm(dom, "10:00")] });
  try { assert.equal(T2.alvo.querySelectorAll(".ag-col").length, 7, "encaixe no domingo: a coluna fica"); } finally { T2.sair(); }
});

test("CA-188 · «Procurar paciente» lista as próximas consultas encontradas e «Ir para» leva a tela até o bloco", async () => {
  const seg = futuraSeg(), alvoDia = A.diaISO(seg, 9);
  const janelas = [];
  const rpc = async (n, p) => {
    if (n === "nx_buscar") return { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", status: "aberto" }, { id: 805, titulo: "Antigo", contato_nome: "Mariana Lima", status: "aberto" }] };
    if (n === "nx_negocio_ver") return { negocio: { id: p.p_id, consulta_em: p.p_id === 801 ? `${alvoDia}T10:00:00-03:00` : null } };
    return undefined;
  };
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(alvoDia, "10:00")], rpc, modal: janelaAberta(janelas) });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(4);
    const corpo = janelas[0].o.corpo;
    const inp = corpo.querySelector('input[name="paciente"]');
    inp.value = "Mariana";
    inp.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(12);
    const itens = corpo.querySelectorAll(".ag-procurar-item");
    assert.equal(itens.length, 1, "só quem tem consulta de hoje em diante");
    assert.match(itens[0].textContent, /^Mariana Costa/);
    porTexto(itens[0], "button", "Ir para").click();
    await esperar(14);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_data === A.segundaDe(alvoDia)), "a semana dela foi lida");
    const bloco = T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco');
    assert.equal(T.D.estado.ativo, bloco, "o foco foi para o bloco");
  } finally { T.sair(); }
});

test("CA-189 · «Imprimir dia» no painel do «Dia»: chama a impressão com a marca da página; o telefone vai só para o papel", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, modo: "dia", consultas: [consultaEm(seg, "10:00", { telefone: "5512999990000" })] });
  try {
    const bt = T.alvo.querySelector(".ag-painel-imprimir");
    assert.ok(bt);
    bt.click();
    assert.equal(T.reg.impressoes, 1);
    assert.equal(T.reg.classeAoImprimir, true, "o @media print vale só durante «Imprimir dia»");
    assert.equal(T.alvo.querySelector(".ag-painel-item .ag-so-impressao").textContent, "tel 5512999990000");
  } finally { T.sair(); }
  const css = ler("agenda.css");
  assert.match(css, /@media print \{[\s\S]*body\.ag-imprimindo \.ag-painel, body\.ag-imprimindo \.ag-painel \* \{ visibility: visible; \}/);
});

test("CA-190 · dia por vir: só «consultas» e «encaixes» (sem os zeros de concluídas e faltas)", () => {
  const { h } = criarDom();
  const fut = "2026-10-20";
  const consultas = [consultaEm(fut, "10:00")];
  const el = A.montarPainelDia({ h, iso: fut, consultas, hoje: "2026-10-13" });
  assert.deepEqual(el.querySelectorAll(".ag-kpi span").map(s => s.textContent), ["consulta", "encaixes"]);
  const hoje = A.montarPainelDia({ h, iso: fut, consultas, hoje: fut });
  assert.equal(hoje.querySelectorAll(".ag-kpi").length, 4, "de hoje para trás, os quatro números");
});

test("CA-191 · «Compareceu» oferece «Abrir negócio» no aviso (sem mover a etapa sozinho); «Faltou» não", async () => {
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, modo: "dia", consultas: [consultaEm(pas, "10:00", { presenca: null })],
    rpc: async (n, p) => (n === "nx_agenda_presenca" ? { ok: true, presenca: p.p_estado } : n === "nx_negocio_ver" ? { negocio: { estagio_id: "s1" } } : undefined) });
  try {
    T.alvo.querySelector(".ag-pres-compareceu").click();
    await esperar(10);
    const aviso = T.reg.desfazer.at(-1);
    assert.equal(aviso.acao.rotulo, "Abrir negócio");
    assert.ok(!T.reg.chamadas.some(c => c.nome === "nx_negocio_mover"), "a etapa não muda sozinha");
    aviso.acao.fn();
    assert.deepEqual(T.reg.navegou, ["#/crm/negocio/801"]);
    T.alvo.querySelector(".ag-pres-faltou").click();
    await esperar(10);
    // plano 1500c: «Faltou» oferece «Remarcar» (CC-222) — continua sem «Abrir negócio»
    assert.equal(T.reg.desfazer.at(-1).acao.rotulo, "Remarcar");
  } finally { T.sair(); }
});

test("CA-192 · «Marcar as 3 que faltam como Compareceu»: confirma, grava as 3 e um Desfazer limpa todas", async () => {
  const pas = passadaSeg();
  const consultas = [consultaEm(pas, "09:00", { presenca: null }), consultaEm(pas, "10:00", { negocio_id: 802, presenca: null }), consultaEm(pas, "11:00", { negocio_id: 803, presenca: null }),
    consultaEm(pas, "14:00", { negocio_id: 804, presenca: "faltou" })];
  const T = await montarAgenda({ data: pas, modo: "dia", consultas, modal: async () => true,
    rpc: async (n, p, d) => { if (n === "nx_agenda_presenca") { for (const c of d.consultas) if (c.negocio_id === p.p_negocio) c.presenca = p.p_estado === "limpar" ? null : p.p_estado; return { ok: true }; } return undefined; } });
  try {
    const bt = T.alvo.querySelector(".ag-pres-lote");
    assert.equal(bt.textContent, "Marcar as 3 que faltam como Compareceu", "a de «faltou» não entra");
    T.reg.chamadas.length = 0;
    bt.click();
    await esperar(16);
    assert.equal(T.reg.modais.at(-1).titulo, "Marcar 3 como «Compareceu»?");
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome === "nx_agenda_presenca").map(c => [c.p.p_negocio, c.p.p_estado]), [[801, "compareceu"], [802, "compareceu"], [803, "compareceu"]]);
    assert.equal(T.reg.desfazer.length, 1, "um Desfazer só");
    T.reg.chamadas.length = 0;
    await T.reg.desfazer[0].reverter();
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome === "nx_agenda_presenca").map(c => c.p.p_estado), ["limpar", "limpar", "limpar"]);
  } finally { T.sair(); }
});

test("CA-196 · a ocupação desconta o horário bloqueado (meio dia fechado não mostra «10%» sobre o dia inteiro)", () => {
  const seg = "2026-10-05";
  const consultas = [{ inicio: `${seg}T09:00:00-03:00`, fim: `${seg}T10:00:00-03:00` }];
  const bloqueio = [{ inicio: `${seg}T12:00:00-03:00`, fim: `${seg}T18:00:00-03:00`, motivo: "Meia folga" }];
  assert.equal(A.ocupacaoDoDia(consultas, seg, cfgSemana).capacidade, 540);
  const oc = A.ocupacaoDoDia(consultas, seg, cfgSemana, bloqueio);
  assert.equal(oc.capacidade, 240, "08–12");
  assert.equal(oc.pct, .25);
  const todo = A.ocupacaoDoDia([], seg, cfgSemana, [{ inicio: `${seg}T00:00:00-03:00`, fim: `${A.diaISO(seg, 1)}T00:00:00-03:00` }]);
  assert.equal(todo.fechado, true, "dia inteiro bloqueado: sem capacidade");
  assert.deepEqual(A.cortesDeBloqueios(bloqueio, seg), [[720, 1080]]);
});

test("CA-197 · teclado na coluna: uma coluna no Tab, ↑↓ mostram o cursor de horário, ←→ trocam de dia e Enter abre «Marcar»", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, modal: async () => null });
  try {
    const cols = T.alvo.querySelectorAll(".ag-col");
    assert.deepEqual(cols.map(c => c.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1", "-1", "-1"]);
    cols[0].focus();
    cols[0].dispatchEvent(T.D.evento("keydown", { key: "ArrowDown" }));
    cols[0].dispatchEvent(T.D.evento("keydown", { key: "ArrowDown" }));
    assert.equal(cols[0].querySelector(".ag-cursor").textContent, "08:30");
    cols[0].dispatchEvent(T.D.evento("keydown", { key: "ArrowRight" }));
    assert.equal(T.D.estado.ativo, cols[1]);
    assert.equal(cols[1].getAttribute("tabindex"), "0");
    assert.equal(cols[1].querySelector(".ag-cursor").textContent, "08:30", "o horário acompanha a troca de dia");
    assert.equal(cols[0].querySelector(".ag-cursor"), null);
    cols[1].dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(4);
    assert.equal(T.reg.modais.at(-1).titulo, "Marcar consulta");
  } finally { T.sair(); }
});

/* ============================================================ P3 · contas puras */
test("CA-182 / CA-183 · «em 1 h 30» (sem arredondar) até 3 h; depois, «hoje às 14:30»", () => {
  const agora = Date.parse("2026-10-13T10:00:00-03:00");
  const c = hh => ({ inicio: `2026-10-13T${hh}:00-03:00` });
  assert.equal(A.rotuloProxima(c("11:30"), agora, "2026-10-13"), "em 1 h 30 · 11:30");
  assert.equal(A.rotuloProxima(c("11:05"), agora, "2026-10-13"), "em 1 h 05 · 11:05");
  assert.equal(A.rotuloProxima(c("13:00"), agora, "2026-10-13"), "em 3 h · 13:00");
  assert.equal(A.rotuloProxima(c("13:20"), agora, "2026-10-13"), "hoje às 13:20", "200 min");
  assert.equal(A.rotuloProxima(c("14:30"), Date.parse("2026-10-13T01:00:00-03:00"), "2026-10-13"), "hoje às 14:30", "de madrugada não vira «em 13 h»");
  assert.equal(A.rotuloProxima(c("10:25"), agora, "2026-10-13"), "em 25 min · 10:25");
});

test("CA-194 · o relógio de parede vira instante pelo fuso (sem «-03:00» fixo): um fuso com horário de verão não desloca a grade", () => {
  assert.equal(A.instanteNoFuso("2026-10-13", "10:00"), Date.parse("2026-10-13T10:00:00-03:00"));
  assert.equal(A.isoNoFuso("2026-10-13", "10:00"), "2026-10-13T13:00:00.000Z");
  // Santiago: -04:00 no inverno, -03:00 no verão (horário de verão de verdade)
  assert.equal(A.instanteNoFuso("2026-07-01", "10:00", "America/Santiago"), Date.parse("2026-07-01T10:00:00-04:00"));
  assert.equal(A.instanteNoFuso("2026-12-01", "10:00", "America/Santiago"), Date.parse("2026-12-01T10:00:00-03:00"));
  const eixo = { ini: 8, fim: 18 };
  const item = { inicio: "2026-12-01T09:00:00-03:00", fim: "2026-12-01T10:00:00-03:00" };
  assert.deepEqual(A.posicaoNoDia(item, "2026-12-01", eixo, 30, "America/Santiago"), { topo: 1, altura: 1 }, "09:00 no relógio de lá = 1 h depois do início do eixo");
  assert.ok(Number.isNaN(A.instanteNoFuso("x", "10:00")));
  assert.doesNotMatch(ler("agenda.js").replace(/new Date\(`\$\{[^`]*\}T12:00:00-03:00`\)/g, ""), /T\$\{[^`]*\}:00-03:00`|T00:00:00-03:00`/, "nenhuma conta de horário com o fuso fixo (só os nomes de dia, ao meio-dia)");
});

/* ============================================================ CSS (CA-184, CA-185, CA-201, CA-202) */
test("CA-184 / CA-185 / CA-201 / CA-202 · régua equidistante, hora de 56 px no desktop, folha inferior no celular e «Próxima» com 44 px no toque", () => {
  const css = ler("agenda.css");
  assert.ok(!/\.ag-hora-rot:first-child/.test(css), "o 1º rótulo não tem deslocamento próprio (o intervalo 08h→09h era menor)");
  assert.match(css, /\.ag-hora-rot \{[^}]*transform: translateY\(\.3rem\);/);
  assert.match(css, /--h-hora: clamp\(56px,/);
  assert.match(css, /@container \(min-height: 60px\) \{[\s\S]*?-webkit-line-clamp: 2/);
  const movel = css.slice(css.indexOf("@media (max-width: 760px) {"));
  assert.match(movel.slice(0, movel.indexOf("\n}")), /\.flut\.flut-ag \{ position: fixed; inset: auto 8px calc\(var\(--barra\) \+ 8px \+ env\(safe-area-inset-bottom\)\) 8px !important;/);
  assert.match(movel.slice(0, movel.indexOf("\n}")), /\.flut-ag \.ag-det-acoes \.bt-contorno-perigo \{ grid-column: 1 \/ -1;/, "Desmarcar separado");
  const toque = css.slice(css.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  assert.match(toque.slice(0, toque.indexOf("\n}")), /button\.agenda-proxima \{ min-height: 44px; \}/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css) && !/font-size:\s*[\d.]+(px|rem|pt)/.test(css) && !/transition:\s*all\b/.test(css), "só tokens");
});

/* ============================================================ lote agenda-2 (13/10/2026) */
/** Clica no vazio da 1ª coluna na fração `fracao` (o eixo sem configuração vai de 08h a 18h: 0,2 → 10:00). */
function clicarNoVazio(T, fracao = .2, i = 0) {
  const col = T.alvo.querySelectorAll(".ag-col")[i];
  col.getBoundingClientRect = () => ({ top: 0, left: 0, width: 140, height: 1000, right: 140, bottom: 1000 });
  col.dispatchEvent(T.D.evento("click", { clientY: fracao * 1000, clientX: 10 }));
  return col;
}
const teclaEm = (T, el, key) => el.dispatchEvent(T.D.evento("keydown", { key }));

test("CA-198 · o bloco anuncia «encaixe» e «faltou» (pela etapa), como os selos do painel", async () => {
  assert.equal(A.rotuloDoBloco({ servico: "Avaliação" }, { inicio: "10:00", fim: "10:30", nome: "Mariana", encaixe: true, falta: true, proxima: true }),
    "10:00 às 10:30, Mariana, Avaliação, encaixe, faltou, próxima consulta");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { encaixe: true }), consultaEm(A.diaISO(seg, 1), "11:00", { negocio_id: 802, nome: "Bianca", marco: "faltou" })] });
  try {
    const rot = id => T.alvo.querySelector(`.ag-item[data-negocio="${id}"] .ag-bloco`).getAttribute("aria-label");
    assert.match(rot(801), /, encaixe(,|$)/);
    assert.match(rot(802), /, faltou(,|$)/);
    assert.doesNotMatch(rot(801), /faltou/);
  } finally { T.sair(); }
});

test("CA-199 · as consultas da grade são um ponto só no Tab: ↑↓ no mesmo dia, ←→ ao dia vizinho com consulta (pula o vazio)", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00"), consultaEm(seg, "14:00", { negocio_id: 802 }), consultaEm(A.diaISO(seg, 2), "13:00", { negocio_id: 803 })] });
  try {
    const bl = id => T.alvo.querySelector(`.ag-item[data-negocio="${id}"] .ag-bloco`);
    assert.deepEqual([801, 802, 803].map(id => bl(id).getAttribute("tabindex")), ["0", "-1", "-1"], "só a 1ª consulta do dia escolhido entra no Tab");
    bl(801).focus();
    teclaEm(T, bl(801), "ArrowDown");
    assert.equal(T.D.estado.ativo, bl(802));
    assert.equal(bl(802).getAttribute("tabindex"), "0");
    teclaEm(T, bl(802), "ArrowRight");
    assert.equal(T.D.estado.ativo, bl(803), "terça vazia: vai para quarta");
    teclaEm(T, bl(803), "ArrowUp");
    assert.equal(T.D.estado.ativo, bl(803), "no topo do dia fica onde está");
    teclaEm(T, bl(803), "ArrowLeft");
    assert.equal(T.D.estado.ativo, bl(802), "volta à consulta mais perto no horário (14:00, não 10:00)");
  } finally { T.sair(); }
});

test("CA-200 · celular: as abas da faixa de dias controlam o painel do dia (aria-controls ↔ role=tabpanel, aria-labelledby)", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: A.diaISO(seg, 1), movel: true, consultas: [consultaEm(A.diaISO(seg, 1), "10:00")] });
  try {
    const aba = T.alvo.querySelector('.ag-faixa [aria-selected="true"]');
    const painel = T.alvo.querySelector(".ag-dia-painel");
    assert.equal(painel.getAttribute("role"), "tabpanel");
    assert.equal(aba.getAttribute("aria-controls"), painel.getAttribute("id"));
    assert.equal(painel.getAttribute("aria-labelledby"), aba.getAttribute("id"));
    assert.ok(T.alvo.querySelectorAll(".ag-faixa [role=\"tab\"]").every(t => t.getAttribute("aria-controls") === painel.getAttribute("id")));
    assert.ok(painel.querySelector(".ag-bloco"), "a grade do dia fica dentro do painel");
  } finally { T.sair(); }
});

test("CA-203 · celular: a lista do dia abre com uma linha («2 consultas · 1 falta · 1 encaixe») e sem os 4 cartões", async () => {
  assert.equal(A.textoResumoDia({ total: 1, feitas: 0, faltas: 0, encaixes: 0 }, { futuro: true }), "1 consulta", "dia por vir: sem as faltas (CA-190); plano 1000b: CB-178 — sem «0 encaixes»");
  assert.equal(A.textoResumoDia({ total: 0 }), "Sem consultas");   // plano 1500c: «vazio» virou «Sem consultas» (CC-303)
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, movel: true, consultas: [consultaEm(pas, "09:00", { encaixe: true }), consultaEm(pas, "10:00", { negocio_id: 802, marco: "faltou", encaixe: false })] });
  try {
    assert.equal(T.alvo.querySelector(".ag-painel-sum-n").textContent, "2 consultas · 1 falta · 1 encaixe");
  } finally { T.sair(); }
  const css = ler("agenda.css");
  const bloco = css.slice(css.indexOf("/* ---------------- plano 1000 (agenda-2)"));
  assert.match(bloco, /@media \(max-width: 760px\) \{[\s\S]*\.ag-painel-det \.ag-painel-kpis \{ display: none; \}/);
});

test("CA-204 · celular: a barra fixa com ‹ dia › e «Hoje» aparece quando o cabeçalho sai da tela e troca o dia", async () => {
  const seg = futuraSeg();
  const antesIO = globalThis.IntersectionObserver, antesCS = globalThis.getComputedStyle;
  const io = {};
  globalThis.IntersectionObserver = class { constructor(cb, o) { io.cb = cb; io.opcoes = o; } observe(el) { io.el = el; } disconnect() { io.desligado = true; } };
  globalThis.getComputedStyle = () => ({ getPropertyValue: k => (k === "--topo" ? "56px" : "") });
  const T = await montarAgenda({ data: seg, movel: true });
  try {
    const barra = T.alvo.querySelector(".ag-barra-dia");
    assert.ok(barra, "a barra existe no celular");
    assert.equal(barra.getAttribute("aria-hidden"), "true", "com o cabeçalho à vista, fica escondida");
    assert.ok(io.el && io.el.classList.contains("agenda-periodo"), "observa as setas do cabeçalho");
    assert.equal(io.opcoes.rootMargin, "-56px 0px 0px 0px", "desconta a barra do topo");
    io.cb([{ isIntersecting: false, boundingClientRect: { top: -30 } }]);
    assert.ok(barra.classList.contains("visivel"));
    assert.equal(barra.getAttribute("aria-hidden"), null);
    assert.equal(barra.querySelector(".ag-barra-rot").textContent.length > 0, true);
    barra.querySelector(".ag-barra-prox").click();
    await esperar(8);
    assert.equal(T.alvo.querySelector('.ag-faixa [aria-selected="true"]').dataset.iso, A.diaISO(seg, 1), "› vai para o dia seguinte");
    assert.ok(T.alvo.querySelector(".ag-barra-dia").classList.contains("visivel"), "redesenhada, continua à vista");
    T.sair();
    assert.equal(io.desligado, true, "ao sair da Agenda o observador é desligado");
  } finally {
    globalThis.IntersectionObserver = antesIO; globalThis.getComputedStyle = antesCS;
    if (antesIO === undefined) delete globalThis.IntersectionObserver;
    if (antesCS === undefined) delete globalThis.getComputedStyle;
  }
});

test("CA-205 · a 360 px os 7 dias da faixa cabem (dia flexível de 40 px no mínimo, vão de 4 px)", () => {
  const css = ler("agenda.css");
  const bloco = css.slice(css.indexOf("/* ---------------- plano 1000 (agenda-2)"));
  assert.match(bloco, /\.ag-faixa \{ gap: \.25rem; \}/);
  assert.match(bloco, /\.ag-faixa-d \{ flex: 1 1 0; min-width: 40px; padding-inline: \.1rem; \}/);
  // 360 − 2 × 16 (respiro) = 328 ≥ 7 × 40 + 6 × 4
  assert.ok(7 * 40 + 6 * 4 <= 328);
});

test("CA-206 · celular: «Dia seguinte» e «Semana seguinte» no detalhe abrem a confirmação «De → Para» no mesmo horário", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, movel: true, consultas: [consultaEm(seg, "10:00")] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const det = T.reg.pops.at(-1);
    det.querySelector(".ag-det-amanha").click();
    await esperar(8);
    let m = T.reg.modais.at(-1);
    assert.equal(m.titulo, "Remarcar consulta?");
    assert.equal(m.corpo.querySelector(".ag-remarcar-para b").textContent, `${A.rotuloDoDia(A.diaISO(seg, 1), T.hoje)} 10:00`);
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-semana").click();
    await esperar(8);
    m = T.reg.modais.at(-1);
    assert.equal(m.corpo.querySelector(".ag-remarcar-para b").textContent, `${A.rotuloDoDia(A.diaISO(seg, 7), T.hoje)} 10:00`);
  } finally { T.sair(); }
  const D = await montarAgenda({ data: futuraSeg(), consultas: [consultaEm(futuraSeg(), "10:00")] });
  try {
    D.alvo.querySelector(".ag-bloco").click();
    // plano 1500c: o desktop também ganha os atalhos (remarcar sem mouse, CC-218) — o arrasto continua valendo
    assert.ok(D.reg.pops.at(-1).querySelector(".ag-det-atalhos"), "no desktop os atalhos também aparecem");
  } finally { D.sair(); }
});

test("CA-208 · «Copiar para os dias úteis» leva as faixas de segunda para terça a sexta (sábado fica)", async () => {
  const esperar = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
  // plano 1500c: «Copiar para…» abre a escolha dos dias (CC-231), com os úteis já marcados — confirmar sem mexer = os dias úteis
  const C = await montarConfig({ cfg: { horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"], ["13:00", "18:00"]], 6: [["08:00", "12:00"]] }, duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30 },
    modal: async o => primaria(o).valor });
  C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-copiar').click();
  await esperar(4);
  const faixas = id => C.alvo.querySelectorAll(`.agc-dia[data-dia="${id}"] .agc-faixa`).map(l => l.querySelectorAll("input").map(i => i.value));
  for (const id of ["2", "3", "4", "5"]) {
    assert.deepEqual(faixas(id), [["08:00", "12:00"], ["13:00", "18:00"]], `dia ${id}`);
    assert.equal(C.alvo.querySelector(`.agc-dia[data-dia="${id}"] input[name="dia_${id}"]`).checked, true);
  }
  assert.deepEqual(faixas("6"), [["08:00", "12:00"]], "sábado não é dia útil");
  assert.equal(C.reg.toasts.at(-1), "Horário de Segunda-feira copiado para os dias úteis.");
  assert.equal(C.ret.pendente(), true, "copiar conta como mudança não salva");
});

const cfgValida = { duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30 };
test("CA-212 · salvar a configuração não redesenha a seção: o foco fica no «Salvar», com o check", async () => {
  const checks = [];
  const C = await montarConfig({ cfg: cfgValida, uiExtra: { checkSucesso: (el, o) => { checks.push([el, o]); } },
    rpc: async n => (n === "nx_agenda_config_salvar" ? { ok: true, config: cfgValida, bloqueios: [] } : undefined) });
  const form = C.alvo.querySelector("form");
  form.dispatchEvent(C.D.evento("submit"));
  await esperar(6);
  assert.ok(C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
  assert.equal(C.reg.chamadas.filter(c => c.nome === "nx_agenda_config_ver").length, 1, "a seção não foi lida de novo");
  assert.equal(C.alvo.querySelector("form"), form, "o mesmo formulário (rolagem e foco não voltam ao topo)");
  const salvar = C.alvo.querySelector(".agc-salvar");
  assert.equal(C.D.estado.ativo, salvar);
  assert.equal(checks[0][0], salvar);
  assert.equal(C.reg.toasts.at(-1), "Agenda salva.");
});

test("CA-213 · mudou e não salvou: sair da seção pergunta (pendente/podeSair); depois de salvar, não", async () => {
  const perguntas = [];
  const C = await montarConfig({ cfg: cfgValida, uiExtra: { confirmar: async o => { perguntas.push(o.titulo); return false; } },
    rpc: async n => (n === "nx_agenda_config_salvar" ? { ok: true, bloqueios: [] } : undefined) });
  assert.equal(typeof C.ret.podeSair, "function");
  assert.equal(C.ret.pendente(), false);
  assert.equal(await C.ret.podeSair(), true, "sem mudança sai direto");
  const form = C.alvo.querySelector("form");
  form.dispatchEvent(C.D.evento("input"));
  assert.equal(C.ret.pendente(), true);
  assert.equal(await C.ret.podeSair(), false, "a pessoa escolheu ficar");
  assert.deepEqual(perguntas, ["Sair sem salvar a agenda?"]);
  form.dispatchEvent(C.D.evento("submit"));
  await esperar(6);
  assert.equal(C.ret.pendente(), false, "salvo: pode sair");
});

test("CA-215 · admin: «Bloquear este horário» na janela aberta pelo clique no vazio grava o bloqueio daquele trecho", async () => {
  const seg = futuraSeg();
  const janelas = [];
  const T = await montarAgenda({ data: seg, modal: janelaAberta(janelas) });
  try {
    clicarNoVazio(T, .2);
    await esperar(8);
    const bt = janelas[0].o.corpo.querySelector(".ag-bloquear-horario");
    assert.ok(bt && /10:00/.test(bt.textContent));
    bt.click();
    await esperar(8);
    const j = janelas[1];
    assert.equal(j.o.titulo, "Bloquear horário");
    await primaria(j.o).fn(erroModal([]));
    const ch = T.reg.chamadas.find(c => c.nome === "nx_agenda_bloqueio_salvar");
    assert.deepEqual(ch.p.p_bloqueio, { data: seg, das: "10:00", ate: "10:30", motivo: null });
    j.fechar({ ok: true });
    await esperar(8);
    assert.match(T.reg.toasts.at(-1), /^Horário bloqueado: .*, 10:00–10:30\.$/);
  } finally { T.sair(); }
  const janelas2 = [];
  const A2 = await montarAgenda({ data: seg, papel: "atendente", modal: janelaAberta(janelas2) });
  try {
    clicarNoVazio(A2, .2);
    await esperar(8);
    assert.equal(janelas2[0].o.corpo.querySelector(".ag-bloquear-horario"), null, "atendente só marca");
  } finally { A2.sair(); }
});

test("CA-216 / CA-217 · «Antecedência mínima» com exemplo (vale para a IA) e o passo com nome que não lembra o almoço", () => {
  const js = ler("agenda-config.js");
  assert.match(js, /rotulo: "Antecedência mínima \(horas\)"[^\n]*\n\s*ajuda: "Ex\.: 2 = ninguém \(nem a IA\) marca consulta para as próximas 2 horas\."/);
  assert.match(js, /rotulo: "De quanto em quanto tempo oferecer horários \(minutos\)"/);
  assert.ok(!js.includes("Intervalo entre horários (minutos)"));
});

test("CA-218 · mês com 600 consultas: agrupadas por dia uma vez (cada célula olha só as suas) e desenhado rápido", () => {
  const { h } = criarDom();
  const cs = Array.from({ length: 600 }, (_, i) => ({ negocio_id: i, inicio: `2026-10-${String(1 + (i % 31)).padStart(2, "0")}T${String(8 + (i % 9)).padStart(2, "0")}:00:00-03:00` }));
  const por = A.consultasPorDia(cs);
  assert.equal(por.get("2026-10-01").length, 20);
  assert.equal([...por.values()].reduce((s, l) => s + l.length, 0), 600);
  A.montarMiniCalendario({ h, mes: "2026-10-01", consultas: cs, config: cfgSemana, hoje: "2026-10-13" });   // aquece o Intl
  const t0 = performance.now();
  const el = A.montarMiniCalendario({ h, mes: "2026-10-01", consultas: cs, config: cfgSemana, hoje: "2026-10-13" });
  const ms = performance.now() - t0;
  assert.ok(ms < 60, `desenhou em ${ms.toFixed(1)} ms`);
  assert.equal(el.querySelector('.ag-mes-dia[data-iso="2026-10-01"] .ag-mes-n').textContent, "20");
  assert.match(el.querySelector(".ag-mes-resumo").textContent, /^600 consultas/);
});

test("CA-219 · presença de servidor antigo: no máximo 4 leituras ao mesmo tempo e a que falhou não é pedida de novo", async () => {
  let ativos = 0, max = 0;
  await A.comLimite(Array.from({ length: 9 }, (_, i) => i), 4, async () => { ativos++; max = Math.max(max, ativos); await dormir(3); ativos--; });
  assert.equal(max, 4);
  const pas = passadaSeg();
  const consultas = Array.from({ length: 10 }, (_, i) => { const c = consultaEm(pas, `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, { negocio_id: 900 + i }); return c; });
  let vivos = 0, pico = 0, falhas = 0;
  const T = await montarAgenda({ data: pas, modo: "dia", consultas, rpc: async (n, p) => {
    if (n !== "nx_negocio_ver") return undefined;
    vivos++; pico = Math.max(pico, vivos);
    await dormir(4);
    vivos--;
    if (p.p_id === 903) { falhas++; throw new Error("rede"); }
    return { negocio: {} };
  } });
  try {
    await dormir(80);
    const lidas = () => T.reg.chamadas.filter(c => c.nome === "nx_negocio_ver").length;
    assert.equal(lidas(), 10);
    assert.ok(pico <= 4, `pico de ${pico} leituras simultâneas`);
    T.alvo.querySelector(".agenda-atualizar").click();
    await dormir(40);
    assert.equal(lidas(), 10, "redesenhar não repete nenhuma (nem a que falhou)");
    assert.equal(falhas, 1);
  } finally { T.sair(); }
});

test("CA-220 · «Atualizada às HH:MM» sempre à vista; sem conseguir reler por mais de 5 min, fica cinza e diz há quanto tempo", async () => {
  const lida = Date.parse("2026-10-15T14:02:00-03:00");
  assert.equal(A.textoCarimbo(lida, lida + 60_000), "Atualizada às 14:02");
  assert.equal(A.textoCarimbo(lida, lida + 12 * 60_000), "Atualizada às 14:02 · há 12 min");
  assert.equal(A.textoCarimbo(0), "");
  const seg = futuraSeg();
  let falhar = false;
  const T = await montarAgenda({ data: seg, rpc: async n => { if (falhar && n === "nx_agenda_dia") throw Object.assign(new Error("rede"), { codigo: "rede" }); return undefined; } });
  const real = Date.now;
  try {
    const car = T.alvo.querySelector(".agenda-atualizada");
    assert.equal(car.hidden, false);
    assert.match(car.textContent, /^Atualizada às \d{2}:\d{2}$/);
    assert.equal(car.getAttribute("role"), null, "fora da região viva: a releitura de 60 s não é lida em voz alta");
    falhar = true;
    Date.now = () => real() + 6 * 60_000;
    T.reg.intervalos[0]();
    await esperar(10);
    assert.ok(car.classList.contains("velha"));
    assert.match(car.textContent, / · há 6 min$/);
  } finally { Date.now = real; T.sair(); }
});

test("CA-256 · «Abrir negócio» do detalhe abre a gaveta por cima da Agenda (a rota não muda) e relê ao mudar", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try {
    const abertos = [];
    T.ctx.abrirNegocio = (id, o) => abertos.push([id, o]);
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-negocio").click();
    assert.equal(abertos[0][0], 801);
    assert.deepEqual(T.reg.navegou, [], "a Agenda continua na tela");
    T.reg.chamadas.length = 0;
    abertos[0][1].aoMudar();
    await esperar(8);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia"), "mudou na gaveta: a agenda relê");
    delete T.ctx.abrirNegocio;
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-negocio").click();
    assert.deepEqual(T.reg.navegou, ["#/crm/negocio/801"], "sem a ponte do shell, a rota do CRM");
  } finally { T.sair(); }
});

test("CA-257 · o detalhe mostra a última nota do negócio («trazer exames») em uma linha, lida uma vez", async () => {
  assert.equal(A.ultimaNota([{ texto: "  " }, { texto: "Trazer   exames\n de sangue" }]), "Última nota: Trazer exames de sangue");
  assert.equal(A.ultimaNota([]), "");
  assert.match(A.ultimaNota([{ texto: "x".repeat(300) }]), /^Última nota: x{159}…$/);
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")],
    rpc: async n => (n === "nx_negocio_ver" ? { negocio: { id: 801 }, notas: [{ texto: "Trazer exames", fixada: false }] } : undefined) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    await esperar(6);
    const nota = T.reg.pops.at(-1).querySelector(".ag-det-nota");
    assert.equal(nota.hidden, false);
    assert.equal(nota.textContent, "Última nota: Trazer exames");
    T.alvo.querySelector(".ag-bloco").click();
    await esperar(6);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_negocio_ver").length, 1, "a 2ª abertura usa a mesma leitura");
  } finally { T.sair(); }
});

test("CA-258 · «Bloquear feriados nacionais»: os de hoje até dez do ano que vem, dia inteiro, sem duplicar os já bloqueados", async () => {
  assert.equal(CFG.pascoa(2027), "2027-03-28");
  assert.equal(CFG.pascoa(2026), "2026-04-05");
  const f27 = CFG.feriadosNacionais(2027).map(f => f.data);
  assert.equal(f27.length, 10);
  assert.ok(f27.includes("2027-03-26") && f27.includes("2027-11-20") && f27.includes("2027-10-12"));
  assert.ok(!f27.includes("2027-02-09") && !f27.includes("2027-05-27"), "Carnaval e Corpus Christi são ponto facultativo");
  const ja = [{ id: 1, inicio: "2026-11-02T00:00:00-03:00", fim: "2026-11-03T00:00:00-03:00", motivo: "Finados" }];
  const lista = CFG.feriadosParaBloquear("2026-10-15", ja);
  assert.equal(lista[0].data, "2026-11-15", "o 12/10 já passou e Finados já tem bloqueio");
  assert.equal(lista.length, 13);
  const C = await montarConfig({ hoje: "2026-10-15", bloqueios: ja, modal: async () => true });
  C.alvo.querySelector(".agc-feriados").click();
  await esperar(40);
  const salvos = C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_salvar").map(c => c.p.p_bloqueio);
  assert.equal(salvos.length, 13);
  assert.equal(new Set(salvos.map(b => b.data)).size, 13, "nenhum duplicado");
  assert.ok(salvos.every(b => !b.das && !b.ate && b.motivo), "dia inteiro, com o nome do feriado como motivo");
  assert.ok(!salvos.some(b => b.data === "2026-11-02"));
  assert.equal(C.reg.toasts.at(-1), "13 feriados bloqueados.");
});

test("CA-259 · D, S, M e L trocam a visão (fora de campos) e as abas anunciam o atalho", async () => {
  assert.equal(A.acaoTeclaAgenda({ key: "d" }), "dia");
  assert.equal(A.acaoTeclaAgenda({ key: "S" }), "semana");
  assert.equal(A.acaoTeclaAgenda({ key: "m" }), "mes");
  assert.equal(A.acaoTeclaAgenda({ key: "l" }), "lista");
  assert.equal(A.acaoTeclaAgenda({ key: "m", ctrlKey: true }), null);
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg });
  try {
    assert.deepEqual(T.alvo.querySelectorAll(".agenda-abas [data-valor]").map(b => [b.dataset.valor, b.getAttribute("aria-keyshortcuts")]),
      [["dia", "D"], ["semana", "S"], ["mes", "M"], ["lista", "L"]]);
    T.reg.chamadas.length = 0;
    for (const f of T.ouv.get("keydown") || []) f({ key: "m", target: T.alvo, preventDefault() {} });
    await esperar(8);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_data === A.primeiroDoMes(seg) && c.p.p_dias === A.diasNoMes(seg)), "foi para o mês");
    const campo = T.h("input");
    T.reg.chamadas.length = 0;
    for (const f of T.ouv.get("keydown") || []) f({ key: "d", target: campo, preventDefault() {} });
    await esperar(4);
    assert.equal(T.reg.chamadas.length, 0, "digitando num campo, a letra é só uma letra");
    assert.ok(T.reg.comandos.some(c => c.atalho === "L"), "os atalhos aparecem na folha «?»");
  } finally { T.sair(); }
});

test("CA-260 · a paleta ganha «Ir para a data…», que leva ao seletor de data do cabeçalho", async () => {
  const T = await montarAgenda({ data: futuraSeg() });
  try {
    const cmd = T.reg.comandos.find(c => c.id === "agenda.data");
    assert.equal(cmd.rotulo, "Ir para a data…");
    cmd.fazer();
    assert.equal(T.D.estado.ativo, T.alvo.querySelector(".agenda-data"));
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: futuraSeg() });
  T2.sair();
  assert.ok(![...T2.reg.ativos].some(c => c.id === "agenda.data"), "sai junto com a Agenda");
});

test("CA-261 · «Hoje» fica neutro (aria-current) quando o período já contém hoje", async () => {
  assert.equal(A.periodoTemHoje("2026-10-12", 7, "2026-10-15"), true);
  assert.equal(A.periodoTemHoje("2026-10-19", 7, "2026-10-15"), false);
  const T = await montarAgenda({ data: hojeSP() });
  try {
    const hj = T.alvo.querySelector(".agenda-hoje");
    assert.equal(hj.getAttribute("aria-current"), "date");
    assert.ok(hj.classList.contains("agenda-hoje-atual"));
    T.alvo.querySelector(".agenda-proximo").click();
    await esperar(8);
    assert.equal(hj.getAttribute("aria-current"), null);
    assert.ok(!hj.classList.contains("agenda-hoje-atual"));
  } finally { T.sair(); }
});

test("CA-262 · semana sem consulta oferece «Marcar consulta» no próprio resumo", async () => {
  const T = await montarAgenda({ data: futuraSeg(), modal: async () => null });
  try {
    const bt = T.alvo.querySelector(".agenda-marcar-vazio");
    assert.ok(bt);
    bt.click();
    await esperar(6);
    assert.equal(T.reg.modais.at(-1).titulo, "Marcar consulta");
  } finally { T.sair(); }
  const L = await montarAgenda({ data: futuraSeg(), papel: "leitura" });
  try { assert.equal(L.alvo.querySelector(".agenda-marcar-vazio"), null, "quem só lê não ganha o botão"); } finally { L.sair(); }
  const C = await montarAgenda({ data: futuraSeg(), consultas: [consultaEm(futuraSeg(), "10:00")] });
  try { assert.equal(C.alvo.querySelector(".agenda-marcar-vazio"), null); } finally { C.sair(); }
});

test("CA-263 · sem internet, «Marcar consulta» fica indisponível e explica (a janela nem abre)", async () => {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  try {
    const T = await montarAgenda({ data: futuraSeg(), modal: async () => null });
    try {
      const bt = T.alvo.querySelector(".agenda-marcar");
      assert.equal(bt.getAttribute("aria-disabled"), "true");
      assert.equal(bt.getAttribute("title"), "Sem internet: marcar exige conexão");
      bt.click();
      await esperar(4);
      assert.equal(T.reg.modais.length, 0);
      assert.match(T.reg.toasts.at(-1), /^Sem internet: marcar exige conexão\./);
    } finally { T.sair(); }
  } finally { if (antes) Object.defineProperty(globalThis, "navigator", antes); else delete globalThis.navigator; }
});

test("CA-266 · os serviços da configuração têm cores distintas (pela ordem da lista); nome desconhecido mantém o hash", async () => {
  const lista = ["Avaliação", "Limpeza", "Implante", "Ortodontia", "Clareamento", "Canal", "Faceta", "Lente", "Extração", "Revisão", "Prótese"];
  const cores = lista.map(s => A.corDoProcedimento(s, lista));
  assert.equal(new Set(cores).size, 11, "11 serviços, 11 cores");
  assert.ok(!cores.includes(3), "a areia fica para «sem serviço»");
  assert.equal(A.corDoProcedimento("LIMPEZA ", lista), cores[1], "sem caixa nem espaço");
  assert.equal(A.corDoProcedimento("Botox", lista), A.corDoProcedimento("Botox"), "fora da lista: o hash de sempre");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: { duracao_min: 30, capacidade: 1, duracoes: { "Avaliação": 30, "Limpeza": 45 } },
    consultas: [consultaEm(seg, "10:00", { servico: "Limpeza" }), consultaEm(seg, "14:00", { negocio_id: 802, servico: "Avaliação" })] });
  try {
    const cor = id => T.alvo.querySelector(`.ag-item[data-negocio="${id}"]`).style.getPropertyValue("--cor-bloco");
    assert.equal(cor(801), "var(--pal-1)");
    assert.equal(cor(802), "var(--pal-0)");
    const chip = T.alvo.querySelector('.ag-leg-chip[data-chave="s:limpeza"] .ag-leg-cor');
    assert.equal(chip.style.getPropertyValue("--cor-bloco"), "var(--pal-1)", "a legenda usa a mesma cor");
  } finally { T.sair(); }
});

test("CA-267 · 4+ consultas no mesmo horário: 2 blocos e «+2», que lista as outras", async () => {
  const quatro = [0, 1, 2, 3].map(i => ({ topo: 2, altura: .5, consulta: { negocio_id: 800 + i } }));
  const r = A.limitarSobrepostos(A.colocarEmFaixas(quatro), 3);
  assert.equal(r.blocos.length, 2);
  assert.ok(r.blocos.every(b => b.cols === 3 && b.col < 2));
  assert.equal(r.mais.length, 1);
  assert.deepEqual(r.mais[0].consultas.map(c => c.negocio_id), [802, 803]);
  assert.equal(r.mais[0].col, 2);
  const tres = A.limitarSobrepostos(A.colocarEmFaixas(quatro.slice(0, 3)), 3);
  assert.equal(tres.blocos.length, 3, "até 3 lado a lado nada muda");
  assert.equal(tres.mais.length, 0);
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: { duracao_min: 30, capacidade: 4 }, consultas: [0, 1, 2, 3].map(i => consultaEm(seg, "10:00", { negocio_id: 801 + i, nome: `P${i}` })) });
  try {
    const col = T.alvo.querySelector(`.ag-col[data-iso="${seg}"]`);
    assert.equal(col.querySelectorAll(".ag-bloco").length, 2);
    const mais = col.querySelector(".ag-mais-bt");
    assert.equal(mais.textContent, "+2");
    assert.equal(mais.getAttribute("aria-label"), "Mais 2 consultas neste horário");
    mais.click();
    const itens = T.reg.pops.at(-1).querySelectorAll(".ag-mais-item");
    assert.equal(itens.length, 2);
    itens[0].click();
    assert.ok(T.reg.pops.at(-1).querySelector(".ag-det-nome"), "cada uma abre o detalhe");
  } finally { T.sair(); }
});

test("CA-269 · visão «Lista»: os 7 dias a partir da data, com as consultas em ordem e «Livre · Marcar» nos vazios", async () => {
  assert.equal(A.normalizarPreferenciasAgenda({ modo: "lista" }).modo, "lista");
  const hoje = hojeSP();
  const amanha = A.diaISO(hoje, 1);
  const T = await montarAgenda({ data: hoje, modo: "lista", modal: async () => null,
    consultas: [consultaEm(amanha, "15:00"), consultaEm(amanha, "09:00", { negocio_id: 802, nome: "Bianca" })] });
  try {
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_data === hoje && c.p.p_dias === 7));
    const dias = T.alvo.querySelectorAll(".ag-lista-dia");
    assert.equal(dias.length, 7);
    const dia2 = T.alvo.querySelector(`.ag-lista-dia[data-iso="${amanha}"]`);
    assert.deepEqual(dia2.querySelectorAll(".ag-painel-item b").map(b => b.textContent), ["Bianca", "Mariana Costa"], "em ordem de horário");
    assert.match(dia2.querySelector(".ag-lista-tit").textContent, /^Amanhã · /);
    const livre = T.alvo.querySelector(`.ag-lista-dia[data-iso="${A.diaISO(hoje, 2)}"] .ag-lista-livre`);
    livre.click();
    await esperar(4);
    assert.equal(T.reg.modais.at(-1).titulo, "Marcar consulta");
    dia2.querySelector(".ag-painel-item").click();
    assert.ok(T.reg.pops.at(-1).querySelector(".ag-det-nome"));
    assert.equal(T.alvo.querySelector(".agenda-lista-bt").getAttribute("aria-pressed"), "true");
    assert.equal(T.alvo.querySelector(".agenda-proximo").getAttribute("aria-label"), "Próximos 7 dias");
  } finally { T.sair(); }
});

test("CA-270 · no «Mês», o número da semana abre a semana inteira", async () => {
  assert.equal(A.semanaISO("2026-10-13"), 42);
  assert.equal(A.semanaISO("2027-01-01"), 53, "a quinta-feira decide o ano");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, modo: "mes" });
  try {
    const sems = T.alvo.querySelectorAll(".ag-mes-semana");
    assert.equal(sems.length, 6);
    assert.ok(T.alvo.querySelector(".ag-mes").classList.contains("ag-mes-com-semanas"));
    const alvo = sems[2];
    assert.match(alvo.getAttribute("aria-label"), /^Abrir a semana de \d{2}\/\d{2} a \d{2}\/\d{2}$/);
    T.reg.chamadas.length = 0;
    alvo.click();
    await esperar(8);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_data === alvo.dataset.iso && c.p.p_dias === 7));
    assert.equal(JSON.parse(T.storage.get(T.chave)).modo, "semana", "a visão virou «Semana» (e fica lembrada)");
    assert.ok(T.alvo.querySelector(".ag-grade"), "a grade da semana no lugar do mês");
  } finally { T.sair(); }
});

const blq = (dia, motivo = null, id = 1) => ({ id, inicio: `${dia}T00:00:00-03:00`, fim: `${A.diaISO(dia, 1)}T00:00:00-03:00`, motivo });
test("CA-272 · remover bloqueio tem «Desfazer»: some na hora, a exclusão só vale quando o aviso fecha", async () => {
  const avisos = [];
  const dia = A.diaISO(hojeSP(), 5);
  const C = await montarConfig({ bloqueios: [blq(dia, "Folga")], uiExtra: { acaoComDesfazer: async o => { avisos.push(o); if (o.aplicar) await o.aplicar(); } } });
  porTexto(C.alvo, "button", "Remover").click();
  await esperar(4);
  assert.equal(avisos[0].texto, "Bloqueio removido (Folga)");
  assert.equal(C.alvo.querySelector(".agc-bloqueio"), null, "sumiu da lista");
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_bloqueio_excluir"), "ainda não foi apagado");
  avisos[0].reverter();
  assert.ok(C.alvo.querySelector(".agc-bloqueio"), "Desfazer: volta");
  await avisos[0].aplicar();
  await avisos[0].firmar();
  assert.deepEqual(C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_excluir").map(c => c.p), [{ p_id: 1 }]);
});

test("CA-273 · mais de 30 bloqueios: «Ver mais» mostra o resto (a lista já veio inteira)", async () => {
  const base = hojeSP();
  const C = await montarConfig({ bloqueios: Array.from({ length: 40 }, (_, i) => blq(A.diaISO(base, i + 1), `B${i}`, i + 1)) });
  assert.equal(C.alvo.querySelectorAll(".agc-bloqueio").length, 30);
  const mais = C.alvo.querySelector(".agc-ver-mais");
  assert.equal(mais.textContent, "Ver mais 10 de 10");
  mais.click();
  assert.equal(C.alvo.querySelectorAll(".agc-bloqueio").length, 40);
  assert.equal(C.alvo.querySelector(".agc-ver-mais"), null);
});

test("CA-275 · passo maior que a duração avisa na hora (os buracos na oferta de horários)", async () => {
  assert.match(CFG.avisoPassoDuracao(60, 30), /a cada 60 min.*dura 30 min: sobram 30 min/);
  assert.equal(CFG.avisoPassoDuracao(30, 30), null);
  assert.equal(CFG.avisoPassoDuracao("", 30), null, "vazio = igual à duração");
  const C = await montarConfig({ cfg: { ...cfgValida, passo_min: 60 } });
  const aviso = C.alvo.querySelector(".agc-aviso-passo");
  assert.equal(aviso.hidden, false);
  C.alvo.querySelector('input[name="passo_min"]').value = "30";
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("input"));
  assert.equal(aviso.hidden, true);
});

test("CA-277 · a prévia da semana chega ao leitor de tela como tabela (dia → horas); o desenho fica escondido", () => {
  const { h } = criarDom();
  const el = CFG.montarPreviaSemana(h, CFG.previaSemana({ 1: [["08:00", "17:00"]], 2: [["08:00", "12:00"]] }));
  assert.equal(el.getAttribute("role"), "group", "não é mais role=img (que escondia o conteúdo)");
  const tab = el.querySelector("table");
  assert.ok(tab.classList.contains("sr-only"));
  const linhas = tab.querySelectorAll("tbody tr").map(tr => tr.textContent);
  assert.equal(linhas.length, 7);
  assert.equal(linhas[0], "Segunda-feira9h");
  assert.equal(linhas[2], "Quarta-feirafechado");
  assert.equal(el.querySelector(".agc-previa-dias").getAttribute("aria-hidden"), "true");
});

test("CA-278 · um nome só no cartão: «Bloqueios futuros», «Bloquear horário» e «Bloqueio»", async () => {
  const C = await montarConfig({ bloqueios: [blq(A.diaISO(hojeSP(), 3))] });
  assert.ok(porTexto(C.alvo, "h3", "Bloqueios futuros"));
  assert.ok(porTexto(C.alvo, "button", "Bloquear horário"));
  assert.equal(C.alvo.querySelector(".agc-bloqueio b").textContent, "Bloqueio", "sem motivo");
  const js = ler("agenda-config.js");
  assert.ok(!/Datas indisponíveis|Bloquear período|"Indisponível"/.test(js));
});

test("CA-279 · o erro do horário diz o quê (faixa vazia, sem início/fim, fim antes do início) e marca o campo", async () => {
  assert.match(CFG.problemaDasFaixas([]).msg, /^adicione pelo menos uma faixa/);
  assert.deepEqual(CFG.problemaDasFaixas([["08:00", "12:00"], ["", "18:00"]]), { indice: 1, campo: "inicio", msg: "preencha o início de cada faixa." });
  assert.equal(CFG.problemaDasFaixas([["08:00", "12:00"]]), null);
  const C = await montarConfig({ cfg: { ...cfgValida, horario_fonte: "agenda", horario: { 1: [["14:00", "12:00"]] } } });
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("submit"));
  await esperar(4);
  assert.equal(C.reg.toasts.at(-1), "Segunda-feira: o fim (12:00) precisa ser depois do início (14:00).");
  const dia = C.alvo.querySelector('.agc-dia[data-dia="1"]');
  assert.equal(dia.querySelector(".agc-erro-dia").hidden, false);
  const [ini, fim] = dia.querySelectorAll(".agc-faixa input");
  assert.equal(fim.getAttribute("aria-invalid"), "true");
  assert.equal(ini.getAttribute("aria-invalid"), null);
  assert.equal(C.D.estado.ativo, fim);
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
});

test("CA-280 · origem e etapa em linhas próprias; id cru de campanha/anúncio nunca aparece", async () => {
  assert.equal(A.origemDo({ plataforma: "meta", campanha_ext: "120211234567", anuncio_ext: "998877665544" }), "Meta Ads");
  assert.equal(A.origemDo({ plataforma: "meta", campanha_nome: "Aparelho", anuncio_nome: "Vídeo 1", campanha_ext: "1202" }), "Meta Ads · Aparelho · Vídeo 1");
  assert.equal(A.origemDo({ origem: "whatsapp", rastreio: { utm_campaign: "120211234567" } }), "WhatsApp", "utm numérica também é id");
  assert.equal(A.etapaDo({ marco: "agendada" }), "Agendada");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { origem: "whatsapp", etapa: "Avaliação agendada" })] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const linhas = T.reg.pops.at(-1).querySelectorAll(".ag-det-origem").map(e => e.textContent);
    assert.deepEqual(linhas, ["Origem: WhatsApp", "Etapa: Avaliação agendada"]);
  } finally { T.sair(); }
});

test("CA-283 · Desfazer que só conseguiu devolver como encaixe avisa («voltou como encaixe: o horário já estava cheio»)", async () => {
  const api = resp => ({ rpcC: async (n, a) => resp(a) });
  const r = await A.voltarAoHorario(api(a => (a.p_encaixe ? { ok: true } : { ok: false, erro: "horario_ocupado" })), 7, "2026-10-10T13:00:00Z", null, false);
  assert.equal(r.voltou_como_encaixe, true);
  assert.equal(A.avisoVoltaEncaixe(r), "A consulta voltou como encaixe: o horário já estava cheio.");
  assert.equal(A.avisoVoltaEncaixe(await A.voltarAoHorario(api(() => ({ ok: true })), 7, "2026-10-10T13:00:00Z", null, false)), "", "voltou normal: nada a dizer");
  assert.equal(A.avisoVoltaEncaixe(await A.voltarAoHorario(api(() => ({ ok: true })), 7, "2026-10-10T13:00:00Z", null, true)), "", "já era encaixe");
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { encaixe: false, marco: "agendada" })],
    // plano 1500c: desmarcar pede um motivo (CC-322) — «Prefiro não dizer»
    modal: async o => { if (o.titulo !== "Desmarcar consulta") return null; o.corpo.querySelectorAll(".ag-motivo-chip").find(b => b.textContent === A.MOTIVO_SEM).click(); return primaria(o).fn(erroModal([])); },
    rpc: async (n, p) => (n === "nx_agenda_desmarcar" ? { ok: true } : n === "nx_agenda_marcar" ? (p.p_encaixe ? { ok: true } : { ok: false, erro: "horario_ocupado" }) : undefined) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Desmarcar").click();
    await esperar(10);
    await T.reg.desfazer.at(-1).reverter();
    assert.equal(T.reg.toasts.at(-1), "A consulta voltou como encaixe: o horário já estava cheio.");
  } finally { T.sair(); }
});

test("CA-287 · janela «Marcar»: só o dia e o horário marcados entram no Tab; setas trocam e o foco segue o novo; Enter no horário não marca", async () => {
  const seg = futuraSeg();
  const janelas = [];
  const horarios = de => ({ duracao_min: 30, horarios: [0, 1].flatMap(d => ["14:00", "15:00"].map(hh => ({ inicio: `${A.diaISO(de, d)}T${hh}:00-03:00`, livre: true, capacidade: 1, ocupados: 0 }))) });
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")], modal: janelaAberta(janelas),
    rpc: async (n, p) => (n === "nx_agenda_livres" ? horarios(p.p_a_partir) : n === "nx_negocio_ver" ? { negocio: { estagio_id: "s1" } } : undefined) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Remarcar").click();
    await esperar(10);
    const corpo = janelas[0].o.corpo;
    const dias = () => corpo.querySelectorAll(".ag-dia-chip");
    const horas = () => corpo.querySelectorAll(".ag-hora-pill");
    assert.deepEqual(dias().map(b => b.getAttribute("tabindex")), ["0", "-1"]);
    assert.deepEqual(horas().map(b => b.getAttribute("tabindex")), ["0", "-1"]);
    dias()[0].focus();
    corpo.querySelector(".ag-dias").dispatchEvent(T.D.evento("keydown", { key: "ArrowRight" }));
    assert.equal(dias()[1].getAttribute("aria-checked"), "true");
    assert.equal(T.D.estado.ativo, dias()[1], "o foco está no chip NOVO (o antigo saiu da tela)");
    horas()[0].focus();
    corpo.querySelector(".ag-horas").dispatchEvent(T.D.evento("keydown", { key: "ArrowRight" }));
    assert.equal(horas()[1].getAttribute("aria-checked"), "true");
    assert.equal(T.D.estado.ativo, horas()[1]);
    horas()[1].dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(4);
    assert.ok(!T.reg.chamadas.some(c => c.nome === "nx_agenda_marcar"), "Enter no horário não confirma");
    assert.equal(janelas[0].el.querySelector('[data-tipo="primario"]').getAttribute("aria-disabled"), "false", "«Confirmar» pronto para o 2º toque");
  } finally { T.sair(); }
});
