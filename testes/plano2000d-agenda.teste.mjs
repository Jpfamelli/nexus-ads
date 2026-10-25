/* Plano «2000 melhorias, rodada D» · frente agenda (lotes agenda-d1, agenda-d2 e agenda-d3, 25/10/2026). Sem rede, sem navegador: o mesmo DOM
   mínimo e a mesma tela montada do plano1500c-agenda (cópia das peças de apoio). Cada teste cita os itens (DC-xxx) e falharia no código de antes. */
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
const L = await import("../web/app/crm-logica.js?v=p2000d");
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
  cfg = { duracao_min: 30, capacidade: 1 }, conta = "conta-ag", prefsExtra = {}, novoNegocio = null, movel = false, kitBase = { usuarios: [] }, vocab = null, rota = null } = {}) {   // plano 1000b: kitBase (funis do CRM), vocab
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
    modal: async o => { reg.modais.push(o); return modal ? modal(o, D) : null; }, flutuante: (ancora, corpo) => { reg.pops.push(corpo); const el = h("div", { class: "flut", role: "dialog" }, corpo); reg.popEls = [...(reg.popEls || []), el]; return { el, fechar() {} }; },   // plano 1000b: devolve o el (CB-163) comportamentoRolagem: () => "auto",
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
    carregar: async () => ({ kit: async () => ({ base: kitBase }) }) };
  if (vocab) ctx.vocab = vocab;
  if (rota) ctx.rota = rota;     // plano 1500c · RC-198: #/agenda?dia=…&hora=…
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


const livres = (dias, de) => ({ duracao_min: 30, horarios: dias.map(d => ({ inicio: `${A.diaISO(de, d)}T14:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 })) });

/* ---------- configuração da agenda (agenda-config.js) ---------- */
async function montarConfig({ cfg = {}, consultas = [], hoje = hojeSP(), modal = null, uiExtra = {}, bloqueios = [], rpc = null } = {}) {   // agenda-2: uiExtra, bloqueios, rpc
  const D = criarDom();
  const { h } = D;
  const reg = { chamadas: [], toasts: [], modais: [], navegou: [], campos: [], erros: [] };   // plano 1000b: campos (opções do ui.campo) e erros (ui.marcarErro)
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
    reg.campos.push(o);
    const tipo = o.tipo === "interruptor" ? "checkbox" : o.tipo === "numero" ? "number" : o.tipo === "data" ? "date" : o.tipo === "hora" ? "time" : "text";
    const inp = h(o.tipo === "textarea" ? "textarea" : "input", { name: o.nome, type: tipo, value: o.tipo === "interruptor" ? null : (o.valor ?? "") });
    if (o.tipo === "interruptor") inp.checked = !!o.valor;
    return h("label", { class: "campo" }, o.rotulo || "", inp);
  };
  const ui = { h, carregarCss() {}, limpar: el => { el.replaceChildren(); return el; }, esqueleto: () => h("div"), erroCartao: () => h("div"), icone: n => h("svg", { dataset: { n } }),
    campo, marcarErro: (f, nome, texto) => { if (nome) reg.erros.push([nome, texto]); }, lerForm, toast: t => { reg.toasts.push(t); }, carregando: async (b, p) => p, confirmar: async () => true, periodoBR: () => "", dataHoraBR: s => String(s), hojeSP: () => hoje,
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

/* ---------- janela «Marcar» ---------- */
async function abrirMarcar({ papel = "admin", rpc = null, novoNegocio = null, cfg, extra = {} } = {}) {   // plano 1000b: extra (vocab, kitBase)
  const seg = futuraSeg();
  const janelas = [];
  const T = await montarAgenda({ data: seg, papel, novoNegocio, cfg, ...extra, modal: janelaAberta(janelas), rpc: async (n, p, d) => {
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

function clicarNoVazio(T, fracao = .2, i = 0) {
  const col = T.alvo.querySelectorAll(".ag-col")[i];
  col.getBoundingClientRect = () => ({ top: 0, left: 0, width: 140, height: 1000, right: 140, bottom: 1000 });
  col.dispatchEvent(T.D.evento("click", { clientY: fracao * 1000, clientX: 10 }));
  return col;
}
const teclaEm = (T, el, key) => el.dispatchEvent(T.D.evento("keydown", { key }));

const vocabMod = await import("../web/app/vocab.js");

/* ============================================================ plano 2000d · contas puras */
const cfgSemanaD = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]] }, intervalos: [], duracao_min: 30, capacidade: 1 };
const k = (dia, de, ate, extra = {}) => ({ negocio_id: Math.floor(Math.random() * 1e6), nome: "X", inicio: `${dia}T${de}:00-03:00`, fim: `${dia}T${ate}:00-03:00`, status: "aberto", ...extra });
const bloqDia = (dia, motivo = "") => ({ id: 9, inicio: `${dia}T00:00:00-03:00`, fim: `${A.diaISO(dia, 1)}T00:00:00-03:00`, motivo });

test("DC-268 / DC-419 · CSV: célula que começa com = + - @ vira texto (apóstrofo) — sem fórmula ao abrir no Excel", () => {
  const csv = A.csvDaAgenda([k("2026-10-20", "10:00", "10:30", { nome: "=HIPERLINK(\"x\")", servico: "+55 12", obs: "@ana" }), k("2026-10-20", "11:00", "11:30", { nome: "-1" })]);
  const linhas = csv.slice(1).trim().split("\r\n");
  assert.ok(linhas[1].includes(`"'=HIPERLINK(""x"")"`), linhas[1]);
  assert.ok(linhas[1].includes(";'+55 12;"));
  assert.ok(linhas[1].endsWith(";'@ana"));
  assert.ok(linhas[2].includes(";'-1;"));
});

test("DC-269 / DC-420 · taxa de faltas: só as que têm presença conhecida entram na conta; sem marca vai à parte", () => {
  const agora = Date.parse("2026-10-21T12:00:00-03:00");
  const passadas = [k("2026-10-20", "09:00", "09:30", { presenca: "faltou" }), k("2026-10-20", "10:00", "10:30", { presenca: "compareceu" }), k("2026-10-20", "11:00", "11:30"), k("2026-10-20", "12:00", "12:30")];
  assert.deepEqual(A.taxaFaltas(passadas, agora), { faltas: 1, de: 2, pct: .5, sem_marca: 2 });
  assert.deepEqual(A.taxaFaltas([k("2026-10-20", "11:00", "11:30")], agora), { faltas: 0, de: 0, pct: null, sem_marca: 1 }, "ninguém marcado: sem taxa (antes 0% de faltas)");
});

test("DC-271 / DC-422 · janela de 24 h: conversa sem provedor também confere a última mensagem; o aparelho (codewords) não tem janela", () => {
  const agora = Date.parse("2026-10-21T12:00:00Z");
  const velha = new Date(agora - 30 * 3600e3).toISOString(), nova = new Date(agora - 2 * 3600e3).toISOString();
  assert.equal(A.janelaFechadaConversa({ id: 1, ultima_entrada_em: velha }, agora), true, "sem provedor e 30 h sem resposta: fechada");
  assert.equal(A.janelaFechadaConversa({ id: 1, ultima_entrada_em: nova }, agora), false);
  assert.equal(A.janelaFechadaConversa({ id: 1, provedor: "codewords", ultima_entrada_em: velha }, agora), false);
  assert.equal(A.janelaFechadaConversa({ id: 1, provedor: "meta" }, agora), true, "Meta sem dado: tratada como fechada");
  assert.equal(A.janelaFechadaConversa({ id: 1 }, agora), false, "sem dado nenhum e sem provedor: não bloqueia");
  assert.equal(A.janelaFechadaConversa({ id: 1, janela_ate: new Date(agora + 3600e3).toISOString(), provedor: "cloud" }, agora), false);
});

test("DC-272 / DC-322 · «Lembrado» só quando o servidor diz que saiu; o que ficou pronto aqui é «Lembrete pronto» (com quem e quando)", () => {
  assert.equal(A.estadoLembrete({}, null), null);
  const pronto = A.estadoLembrete({}, { em: Date.parse("2026-10-15T09:12:00-03:00"), por: "Ana" });
  assert.equal(pronto.tipo, "pronto"); assert.equal(pronto.rotulo, "Lembrete pronto");
  assert.match(pronto.detalhe, /09:12 por Ana: confira se foi enviado/);
  const env = A.estadoLembrete({ lembrete_enviado_em: "2026-10-15T09:30:00-03:00", lembrete_por_nome: "Bia" }, { em: 1 });
  assert.equal(env.tipo, "enviado"); assert.equal(env.rotulo, "Lembrado"); assert.equal(env.detalhe, "Lembrado às 09:30 por Bia");
});

test("DC-273 / DC-423 / DC-351 · bloqueio de 24 h do meio-dia ao meio-dia não fecha nenhum dos dois dias; o do dia todo diz o motivo", () => {
  const b = { id: 1, inicio: "2026-10-20T12:00:00-03:00", fim: "2026-10-21T12:00:00-03:00", motivo: "Viagem" };
  assert.equal(A.diaTodoBloqueado([b], "2026-10-20"), false);
  assert.equal(A.diaTodoBloqueado([b], "2026-10-21"), false);
  assert.equal(A.motivoDoDiaBloqueado([bloqDia("2026-12-25", "Natal")], "2026-12-25"), "Natal");
  assert.equal(A.motivoDoDiaBloqueado([b], "2026-10-20"), "");
});

test("DC-274 / DC-436 / DC-379 · tela da recepção: sem quem faltou nem as concluídas; a que está acontecendo vem marcada «agora»", () => {
  const hoje = "2026-10-15", agora = Date.parse("2026-10-15T10:10:00-03:00");
  const l = A.proximasDaTV([k(hoje, "10:00", "10:30", { nome: "Ana" }), k(hoje, "11:00", "11:30", { nome: "Bia", presenca: "faltou" }), k(hoje, "12:00", "12:30", { nome: "Caio", status: "ganho" }),
    k(hoje, "13:00", "13:30", { nome: "Dani", marco: "faltou" }), k(hoje, "14:00", "14:30", { nome: "Edu" })], hoje, agora, 30);
  assert.deepEqual(l.map(x => [x.c.nome, x.agora]), [["Ana", true], ["Edu", false]]);
});

test("DC-275 · Desfazer da presença em lote guarda a etapa de quem ficou «Faltou» (lerEtapa antes, devolverEtapa no Desfazer)", () => {
  const js = ler("agenda.js");
  const lote = js.slice(js.indexOf("async function marcarPresencaLote"), js.indexOf("function imprimirDia"));
  assert.match(lote, /etapasAntes\.set\(c, await lerEtapa\(api, c\.negocio_id\)\)/);
  assert.match(lote, /devolverEtapa\(api, c\.negocio_id, etapasAntes\.get\(c\)\)/);
});

test("DC-277 / DC-427 · assinatura da agenda muda com observação, quem marcou e desmarcadas", () => {
  const base = { consultas: [{ negocio_id: 1, inicio: "2026-10-20T10:00:00-03:00" }] };
  const a0 = A.assinaturaAgenda(base);
  assert.notEqual(A.assinaturaAgenda({ consultas: [{ ...base.consultas[0], obs: "trazer exames" }] }), a0);
  assert.notEqual(A.assinaturaAgenda({ consultas: [{ ...base.consultas[0], marcado_por: "ia" }] }), a0);
  assert.notEqual(A.assinaturaAgenda({ ...base, desmarcadas: [{ negocio_id: 2, inicio: "2026-10-20T11:00:00-03:00" }] }), a0);
});

test("DC-278 / DC-279 / DC-421 · saudação: emoji e símbolos saem; sigla de 2 letras fica", () => {
  assert.equal(A.primeiroNomeAgenda("🌸 Maria Souza"), "Maria");
  assert.equal(A.primeiroNomeAgenda("~Ana~"), "Ana");
  assert.equal(A.primeiroNomeAgenda("JP Lima"), "JP");
  assert.equal(A.primeiroNomeAgenda("JP"), "JP");
  assert.equal(A.primeiroNomeAgenda("MARIA SOUZA"), "Maria", "maiúsculas longas continuam virando nome");
  assert.equal(A.primeiroNomeAgenda("🌸🌸"), "");
  assert.match(A.textoLembrete({ nome: "🌸 Maria", inicio: "2026-10-16T10:00:00-03:00" }, "2026-10-15"), /^Olá, Maria! /);
});

test("DC-280 / DC-429 · próximo dia aberto sem configuração pula o feriado bloqueado", () => {
  assert.equal(A.proximoDiaAberto(null, "2026-12-24", { bloqueios: [bloqDia("2026-12-25", "Natal")] }), "2026-12-26");
  assert.equal(A.proximoDiaAberto(null, "2026-12-23"), "2026-12-24");
});

test("DC-281 / DC-424 · prévia da semana: a faixa da madrugada vai até as 24 h e continua no dia seguinte", () => {
  const p = CFG.previaSemana({ 1: [["22:00", "02:00"]] });
  assert.equal(p.dias[0].horas, 2); assert.deepEqual(p.dias[0].faixas, [{ a: 22, d: 2 }]);
  assert.equal(p.dias[1].horas, 2); assert.deepEqual(p.dias[1].faixas, [{ a: 0, d: 2 }]);
  assert.equal(p.total, 4);
});

test("DC-282 / DC-425 · consultas fora do horário contam a que cai na pausa", () => {
  const hor = { 2: [["08:00", "18:00"]] };    // 20/10/2026 é terça
  const almoco = k("2026-10-20", "12:00", "12:30"), manha = k("2026-10-20", "10:00", "10:30");
  assert.deepEqual(CFG.consultasForaDoHorario([almoco, manha], hor, 30), []);
  assert.deepEqual(CFG.consultasForaDoHorario([almoco, manha], hor, 30, [["12:00", "13:00"]]), [almoco]);
});

test("DC-283 / DC-426 · mais de 2 faixas no dia: o problema aparece antes de salvar", () => {
  const p = CFG.problemaDasFaixas([["08:00", "10:00"], ["11:00", "12:00"], ["13:00", "14:00"]]);
  assert.equal(p.indice, 2); assert.match(p.msg, /no máximo 2 faixas/);
  assert.equal(CFG.problemaDasFaixas([["08:00", "12:00"], ["13:00", "18:00"]]), null);
  assert.equal(CFG.MAX_FAIXAS_DIA, 2);
});

test("DC-284 / DC-285 / DC-286 / DC-428 · textos com plural certo", () => {
  assert.equal(A.textoLivresDoDia(1), "1 horário livre");
  assert.equal(A.textoLivresDoDia(3), "3 horários livres");
  assert.equal(A.textoLivresDoDia(0), "lotado");
  assert.equal(A.textoQtd(1), "1 consulta"); assert.equal(A.textoQtd(2, "visita"), "2 visitas");
  const caem1 = [{ c: { nome: "Ana" }, p: { ini: 600 } }];
  assert.match(A.avisoConsultasNoBloqueio(caem1, "Salvar"), /^Há 1 consulta nesse trecho \(10:00 Ana\)\. Ela continua marcada — toque em «Salvar» de novo/);
  assert.match(A.avisoConsultasNoBloqueio([...caem1, ...caem1, ...caem1]), /^Há 3 consultas .*…\)\. Elas continuam marcadas/);
});

test("DC-290 · bloqueio até o fim do dia diz «até o fim do dia» (não «às 23:59»)", () => {
  assert.equal(A.textoBloqueioNoDia({ inicio: "2026-10-20T18:00:00-03:00", fim: "2026-10-21T00:00:00-03:00", motivo: "Evento" }, "2026-10-20"), "Bloqueado das 18:00 até o fim do dia: Evento");
});

test("DC-292 · distância do dia: Amanhã, Ontem, Em N dias, Há N dias", () => {
  assert.equal(A.textoDistanciaDia("2026-10-16", "2026-10-15"), "Amanhã");
  assert.equal(A.textoDistanciaDia("2026-10-14", "2026-10-15"), "Ontem");
  assert.equal(A.textoDistanciaDia("2026-10-20", "2026-10-15"), "Em 5 dias");
  assert.equal(A.textoDistanciaDia("2026-10-10", "2026-10-15"), "Há 5 dias");
});

test("DC-294 · exemplos da vertical (oficina não vê «trazer exames»)", () => {
  assert.match(A.exemplosAgenda({ vertical: "oficina" }).servicos, /Troca de óleo/);
  assert.equal(A.exemplosAgenda(null).obs, "trazer exames");
  assert.notEqual(A.exemplosAgenda({ vertical: "loja" }).obs, "trazer exames");
});

test("DC-297 · o chip sem motivo fala na voz da recepção", () => {
  assert.equal(A.MOTIVO_SEM, "Sem motivo informado");
  assert.equal(A.motivoDesmarcar(A.MOTIVO_SEM, ""), null);
});

test("DC-298 / DC-299 / DC-300 · lembrete e confirmação: «Aqui é de», endereço em frase própria, chegada antes", () => {
  const c = { nome: "Ana", inicio: "2026-10-16T10:00:00-03:00" };
  const l = A.textoLembrete(c, "2026-10-15", { empresa: "Auto Center João", endereco: "Edifício Square Offices, sala 3" });
  assert.match(l, /Aqui é de Auto Center João\./);
  assert.match(l, /às 10:00\. Endereço: Edifício Square Offices, sala 3\. Podemos confirmar\?$/);
  assert.doesNotMatch(l, /na Edifício/);
  const conf = A.textoConfirmacao(c, "2026-10-15", { empresa: "Clínica X", endereco: "Rua A, 1", chegada: 10 });
  assert.equal(conf, "Olá, Ana! Aqui é de Clínica X. Sua consulta está marcada para amanhã às 10:00. Endereço: Rua A, 1. Chegue 10 min antes. Qualquer imprevisto, é só avisar por aqui.");
});

test("DC-301 · o wa.me (sem Conversas) leva o nome da empresa no texto", () => {
  const js = ler("agenda.js");
  assert.match(js, /textoLembrete\(c, ui\.hojeSP\(\), \{ vocab: ctx\.vocab \|\| null, empresa: nomeEmpresa\(\) \}\)/);
  assert.match(js, /fn\(c, ui\.hojeSP\(\), \{ vocab: ctx\.vocab \|\| null, empresa: nomeEmpresa\(\) \}\)/);
});

test("DC-302 · aviso sem canal nas palavras da vertical", () => {
  assert.equal(A.textoSemCanal("whatsapp", null), "Esta consulta não tem telefone com WhatsApp. Abra o negócio para falar com o paciente.");
  const oficina = vocabMod.vocab("oficina");
  if (oficina) assert.doesNotMatch(A.textoSemCanal("conversa", oficina), /paciente/);
});

test("DC-306 / DC-435 · rótulo do bloco com o profissional", () => {
  assert.equal(A.rotuloDoBloco({ servico: "Avaliação" }, { inicio: "10:00", fim: "10:30", nome: "Ana", dono: "Dra. Helena" }), "10:00 às 10:30, Ana, Avaliação, com Dra. Helena");
});

test("DC-323 / DC-411 · consultas novas entre duas leituras e o anúncio", () => {
  const a = { negocio_id: 1, inicio: "2026-10-15T10:00:00-03:00", nome: "Ana" };
  const b = { negocio_id: 2, inicio: "2026-10-15T11:00:00-03:00", nome: "Bia Souza", marcado_por: "ia" };
  assert.deepEqual(A.novasConsultas([a], [a, b]), [b]);
  assert.equal(A.textoNovasConsultas([b]), "1 consulta nova: 11:00 Bia (pela IA)");
  assert.equal(A.textoNovasConsultas([a, b, a], "visita"), "3 visitas novas: 10:00 Ana, 11:00 Bia (pela IA) e mais 1");
});

test("DC-324 · consultaMudou: desmarcada, remarcada, alterada", () => {
  const c = { negocio_id: 1, inicio: "2026-10-15T10:00:00-03:00", atualizado_em: "a" };
  assert.equal(A.consultaMudou(c, null), "desmarcada");
  assert.equal(A.consultaMudou(c, { ...c, inicio: "2026-10-16T10:00:00-03:00" }), "remarcada");
  assert.equal(A.consultaMudou(c, { ...c, atualizado_em: "b" }), "alterada");
  assert.equal(A.consultaMudou(c, { ...c }), null);
  assert.equal(A.DETALHE_VELHO_MS, 30_000);
});

test("DC-325 · recusa de horário ocupado diz quem pegou", () => {
  const agora = Date.parse("2026-10-15T10:00:00Z");
  assert.equal(A.sufixoOcupadoPor({ ocupado_por: { nome: "Ana", em: "2026-10-15T09:58:00Z" } }, agora), " por Ana há 2 min");
  assert.equal(A.sufixoOcupadoPor({ detalhe: { ocupado_por: { marcado_por: "ia" } } }, agora), " pela IA");
  assert.equal(A.sufixoOcupadoPor({ codigo: "horario_ocupado" }, agora), "");
});

test("DC-326 · outra consulta por vir do mesmo contato em outro negócio", () => {
  const agora = Date.parse("2026-10-15T10:00:00-03:00");
  const negs = [{ id: 1, consulta_em: "2026-10-16T10:00:00-03:00", status: "aberto" }, { id: 2, consulta_em: "2026-10-17T09:00:00-03:00", status: "aberto", servico: "Limpeza" },
    { id: 3, consulta_em: "2026-10-14T09:00:00-03:00", status: "aberto" }, { id: 4, consulta_em: "2026-10-18T09:00:00-03:00", status: "perdido" }];
  assert.deepEqual(A.outrasConsultasDoContato(negs, 1, agora), [{ id: 2, consulta_em: "2026-10-17T09:00:00-03:00", titulo: "Limpeza" }]);
});

test("DC-330 · linha do tempo do lead a partir da linha", () => {
  const p = A.passosDoLead({ plataforma: "meta", marcado_por: "ia", confirmada_em: "2026-10-01T10:00:00Z", presenca: "compareceu" });
  assert.deepEqual(p.map(x => [x.rotulo, x.feito]), [["Anúncio", true], ["IA marcou", true], ["Confirmou", true], ["Compareceu", true], ["Fechou", false]]);
  const f = A.passosDoLead({ presenca: "faltou" });
  assert.equal(f[3].rotulo, "Faltou"); assert.equal(f[3].ruim, true); assert.equal(f[0].rotulo, "Contato");
});

test("DC-331 · retorno: o do serviço configurado ou o da vertical", () => {
  assert.equal(A.retornoEmDias({ servico: "Limpeza" }, { retornos: { limpeza: 120 } }, null), 120);
  assert.equal(A.retornoEmDias({ servico: "X" }, null, null), 180);
  assert.equal(A.retornoEmDias({}, null, { vertical: "generico" }), 30);
  assert.equal(A.textoRetornoDias(180), "6 meses"); assert.equal(A.textoRetornoDias(30), "30 dias"); assert.equal(A.textoRetornoDias(365), "1 ano");
});

test("DC-334 / DC-335 · veio de anúncio pela plataforma ou origem", () => {
  assert.equal(A.veioDeAnuncio({ plataforma: "meta" }), true);
  assert.equal(A.veioDeAnuncio({ origem: "anuncio" }), true);
  assert.equal(A.veioDeAnuncio({ origem: "whatsapp" }), false);
});

test("DC-337 · «Lembrar» também a de hoje que está a mais de 2 h", () => {
  const hoje = "2026-10-15", agora = Date.parse("2026-10-15T10:00:00-03:00");
  assert.equal(A.podeLembrarConsulta({ contato_id: 1, inicio: "2026-10-15T17:00:00-03:00" }, hoje, agora), true);
  assert.equal(A.podeLembrarConsulta({ contato_id: 1, inicio: "2026-10-15T11:00:00-03:00" }, hoje, agora), false);
  assert.equal(A.podeLembrarConsulta({ contato_id: 1, inicio: "2026-10-16T09:00:00-03:00" }, hoje, agora), true);
  assert.equal(A.podeLembrarConsulta({ contato_id: null, inicio: "2026-10-16T09:00:00-03:00" }, hoje, agora), false);
});

test("DC-343 · quem da equipe está livre agora", () => {
  const agora = Date.parse("2026-10-15T10:10:00-03:00");
  const eq = [{ id: "u1", nome: "Ana" }, { id: "u2", nome: "Bia" }];
  assert.deepEqual(A.profissionaisLivresAgora(eq, [k("2026-10-15", "10:00", "10:30", { dono_id: "u1" })], agora).map(u => u.id), ["u2"]);
});

test("DC-348 / DC-432 · DDD de outro fuso ganha «(horário de Brasília)»", () => {
  assert.equal(A.dddDeOutroFuso("5592991234567"), true);
  assert.equal(A.dddDeOutroFuso("(65) 99999-0000"), true);
  assert.equal(A.dddDeOutroFuso("12 99999-0000"), false);
  assert.match(A.textoLembrete({ nome: "Ana", telefone: "5592991234567", inicio: "2026-10-16T10:00:00-03:00" }, "2026-10-15"), /às 10:00 \(horário de Brasília\)\./);
  assert.doesNotMatch(A.textoLembrete({ nome: "Ana", telefone: "5512991234567", inicio: "2026-10-16T10:00:00-03:00" }, "2026-10-15"), /Brasília/);
});

test("DC-352 · a data pedida caiu no feriado bloqueado: o aviso diz o motivo e o dia mostrado", () => {
  const b = [bloqDia("2026-11-15", "Proclamação da República")];
  assert.equal(A.avisoDiaBloqueado("2026-11-15", { dia: "2026-11-16" }, b, "2026-10-15"), "15/11 está fechado (Proclamação da República): mostrando seg 16/11.");
  assert.equal(A.avisoDiaBloqueado("2026-11-14", { dia: "2026-11-16" }, b, "2026-10-15"), null);
});

test("DC-353 · aviso da cópia guardada com a hora", () => {
  assert.equal(A.textoCopiaGuardada(Date.parse("2026-10-15T08:12:00-03:00")), "Mostrando a cópia de 08:12 · atualizando…");
  assert.equal(A.textoCopiaGuardada(null), "Mostrando a cópia guardada · atualizando…");
});

test("DC-386 · bloqueio da grade volta como a janela grava (Desfazer da edição)", () => {
  assert.deepEqual(A.camposBloqueioDaGrade({ inicio: "2026-10-20T12:00:00-03:00", fim: "2026-10-20T13:00:00-03:00", motivo: "Almoço" }, "2026-10-20"), { data: "2026-10-20", das: "12:00", ate: "13:00", motivo: "Almoço" });
  assert.deepEqual(A.camposBloqueioDaGrade(bloqDia("2026-10-20", "Folga"), "2026-10-20"), { data: "2026-10-20", motivo: "Folga" });
});

test("DC-390 / DC-430 · consulta que passa da meia-noite ocupa até o fim do dia (não vira a duração padrão)", () => {
  const c = { nome: "Ana", inicio: "2026-10-20T23:00:00-03:00", fim: "2026-10-21T00:30:00-03:00" };
  assert.match(A.quandoDoDetalhe(c, "2026-10-20", 30), /· 60 min$/);
});

test("DC-391 / DC-431 · telefone sem DDD não vira tel:+55 inválido", () => {
  assert.equal(A.telLocal("3622-1234"), null);
  assert.equal(A.telLocal("12 3622-1234"), "tel:+551236221234");
});

test("DC-394 · confirmação de antes da remarcação não vale", () => {
  assert.equal(A.confirmadaValida({ confirmada_em: "2026-10-10T10:00:00Z", marcada_em: "2026-10-12T10:00:00Z" }), false);
  assert.equal(A.confirmadaValida({ confirmada_em: "2026-10-13T10:00:00Z", marcada_em: "2026-10-12T10:00:00Z" }), true);
  assert.equal(A.confirmadaValida({ confirmada_em: "2026-10-13T10:00:00Z" }), true);
});

test("DC-437 / DC-451 · lembrete vai para a conversa aberta mais recente (não a primeira da lista)", () => {
  const c = A.conversaDoContato([{ id: 1, status: "aberta", ultima_entrada_em: "2026-10-10T10:00:00Z" }, { id: 2, status: "aberta", ultima_entrada_em: "2026-10-14T10:00:00Z" }, { id: 3, status: "resolvida", aberta_em: "2026-10-15T10:00:00Z" }]);
  assert.equal(c.id, 2);
});

test("DC-439 · encaixe agora diz até quando a cadeira está ocupada", () => {
  const agora = Date.parse("2026-10-15T14:10:00-03:00");
  assert.deepEqual(A.ocupadaAgora([k("2026-10-15", "14:00", "14:45", { nome: "Maria Souza" })], agora, 30), { fim: 14 * 60 + 45, nome: "Maria" });
  assert.equal(A.ocupadaAgora([k("2026-10-15", "15:00", "15:30")], agora, 30), null);
});

test("DC-445 · o que fazer quando o dia pedido não tem horário livre", () => {
  assert.equal(A.acaoOutroDia({ encaixa: true, temLotado: true }), "Para encaixar nesse dia, escolha um horário lotado.");
  assert.match(A.acaoOutroDia({ encaixa: false, temLotado: true }), /fale com quem pode encaixar/);
});

test("DC-270 / DC-452 · o supervisor vê também os dias inteiros lotados para encaixar", () => {
  const hs = [{ inicio: "2026-10-16T10:00:00-03:00", livre: false }, { inicio: "2026-10-16T11:00:00-03:00", livre: false }, { inicio: "2026-10-17T10:00:00-03:00", livre: true }];
  assert.deepEqual(A.gruposParaEscolha(hs).map(g => g.dia), ["2026-10-17"]);
  const sup = A.gruposParaEscolha(hs, { encaixa: true });
  assert.deepEqual(sup.map(g => [g.dia, g.itens.length, g.lotados || 0]), [["2026-10-16", 0, 2], ["2026-10-17", 1, 0]]);
  assert.equal(A.primeiroLivre(sup).inicio, "2026-10-17T10:00:00-03:00", "o primeiro livre pula o dia só de lotados");
});

test("DC-395 · horários lidos há mais de 2 min são relidos ao voltar a eles", () => {
  assert.equal(A.HORARIOS_VELHOS_MS, 120_000);
  const js = ler("agenda.js");
  assert.match(js, /horasEl\.addEventListener\("focusin", releituraVelha\)/);
});

/* ============================================================ plano 2000d · CSS e marcação */
test("DC-305 / DC-311 / DC-315 / DC-372 / DC-373 / DC-380 · o CSS novo: falta e encaixe visíveis, alto contraste, 44 px, impressão", () => {
  const css = ler("agenda.css");
  assert.match(css, /\.ag-bloco\.falta \{/);
  assert.match(css, /\.ag-bloco\.encaixe \{ border-style: dashed/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.ag-retorno, \.ag-retorno-bt, \.ag-atalhos \.bt, \.ag-hora-pill/);
  assert.match(css, /body\.ag-imprimindo \.ag-li-rapidas, body\.ag-imprimindo \.ag-pres, body\.ag-imprimindo \.ag-desmarcadas/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.ag-item\.ag-novo \.ag-bloco \{ animation: none; \}/);
});

/* ============================================================ plano 2000d · na tela */
test("DC-303 · painel do dia sem «0 encaixes»", () => {
  const { h } = criarDom();
  const el = A.montarPainelDia({ h, iso: "2026-10-20", consultas: [k("2026-10-20", "10:00", "10:30")], hoje: "2026-10-13" });
  assert.deepEqual(el.querySelectorAll(".ag-kpi span").map(s => s.textContent), ["consulta"]);
});

test("DC-370 · «Confirmada» no painel na cor de informação (o verde é de «Concluída»)", () => {
  const { h } = criarDom();
  const el = A.montarPainelDia({ h, iso: "2026-10-20", consultas: [k("2026-10-20", "10:00", "10:30", { confirmada_em: "2026-10-19T10:00:00Z" })], hoje: "2026-10-13" });
  const p = el.querySelectorAll(".pilula").find(x => x.textContent === "Confirmada");
  assert.ok(p && p.classList.contains("pilula-info") && !p.classList.contains("pilula-ok"));
});

test("CC-323 (pendência da frente sis) · #/agenda/tv abre a tela da recepção direto", async () => {
  const hoje = hojeSP();
  const T = await montarAgenda({ data: hoje, consultas: [consultaEm(hoje, "23:00")], rota: { partes: ["tv"], query: {} } });
  try {
    const tv = globalThis.document.body.querySelector(".ag-tv");
    assert.ok(tv, "a tela abriu sem tocar no botão");
    assert.ok(tv.querySelector(".ag-tv-agora, .ag-tv-lista li"));
  } finally { T.sair(); }
});

test("DC-378 / DC-417 · tela da recepção com o nome da empresa; o resto fica inert e o Tab não sai", async () => {
  const hoje = hojeSP();
  const T = await montarAgenda({ data: hoje, consultas: [consultaEm(hoje, "23:00")], rota: { partes: ["tv"], query: {} } });
  try {
    T.ctx.cliente.nome = "Clínica Sorriso";
    globalThis.document.body.querySelector(".ag-tv-fechar").click();
    const outro = T.h("div", { class: "fundo" });
    globalThis.document.body.appendChild(outro);
    T.alvo.querySelector(".agenda-tv") && T.alvo.querySelector(".agenda-tv").click();
    const tv = globalThis.document.body.querySelector(".ag-tv");
    assert.ok(tv, "a tela abriu de novo pelo botão"); {
      assert.equal(tv.querySelector(".ag-tv-empresa").textContent, "Clínica Sorriso");
      assert.equal(outro.inert, true, "o fundo fica inert");
      const ev = T.D.evento("keydown", { key: "Tab" });
      for (const f of T.ouv.get("keydown") || []) f(ev);
      assert.equal(ev.defaultPrevented, true, "o Tab fica na tela");
      tv.querySelector(".ag-tv-fechar").click();
      assert.equal(outro.inert, false, "ao sair, o fundo volta");
    }
  } finally { T.sair(); }
});

test("DC-288 / DC-289 / DC-307 / DC-330 · detalhe: «Paciente confirmou» (ação), «Com: …», a linha do tempo", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { dono_id: "u1", dono_nome: "Dra. Helena" })] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const det = T.reg.pops.at(-1);
    assert.equal(det.querySelector(".ag-det-confirmar").textContent.trim(), "Paciente confirmou");
    assert.match(det.querySelector(".ag-det-com").textContent, /Com: Dra\. Helena/);
    assert.equal(det.querySelectorAll(".ag-det-passo").length, 5);
  } finally { T.sair(); }
});

// ——— segunda leva (funções puras e CSS) ———
const T0 = Date.parse("2026-10-15T10:00:00-03:00");

test("DC-410 · consultasParaAvisar: só as minhas, nos próximos 10 min, não concluídas", () => {
  const c = (min, extra = {}) => ({ id: min, dono_id: "u1", inicio: new Date(T0 + min * 60000).toISOString(), ...extra });
  const r = A.consultasParaAvisar([c(5), c(15), c(-1), c(8, { dono_id: "u2" }), c(9, { status: "ganho" })], "u1", T0);
  assert.deepEqual(r.map(x => x.id), [5]);
  assert.deepEqual(A.consultasParaAvisar([c(5)], null, T0), []);
});

test("DC-414 · textoEspera: desde o «Chegou», até a presença", () => {
  const ch = new Date(T0 - 12 * 60000).toISOString();
  assert.equal(A.textoEspera({ chegou_em: ch }, T0), "esperando há 12 min");
  assert.equal(A.textoEspera({ chegou_em: new Date(T0 - 20000).toISOString() }, T0), "chegou agora");
  assert.equal(A.textoEspera({ chegou_em: ch, presenca: "compareceu" }, T0), "");
  assert.equal(A.textoEspera({}, T0), "");
  assert.match(ler("agenda.css"), /\.ag-tv-espera\s*\{/);
});

test("DC-413 · textoParabens: rascunho com a empresa", () => {
  const t = A.textoParabens({ nome: "Maria Souza" }, "2026-10-15", { empresa: "Clínica Sorriso" });
  assert.match(t, /Maria/);
  assert.match(t, /Feliz aniversário/);
  assert.match(t, /Clínica Sorriso/);
});

test("DC-415 · presencaRecenteDeOutro: avisa só quando outra pessoa marcou outra coisa há pouco", () => {
  const em = new Date(T0 - 2 * 60000).toISOString();
  const c = { presenca: "faltou", presenca_em: em, presenca_por_nome: "Ana Lima" };
  assert.match(A.presencaRecenteDeOutro(c, "compareceu", "Bia", T0), /^Ana Lima marcou «Faltou» às 09:58$/);
  assert.equal(A.presencaRecenteDeOutro(c, "faltou", "Bia", T0), "", "mesmo estado");
  assert.equal(A.presencaRecenteDeOutro(c, "compareceu", "Ana", T0), "", "fui eu");
  assert.equal(A.presencaRecenteDeOutro(c, "compareceu", "Bia", T0 + 10 * 60000), "", "velho");
});

test("DC-383 · nomeCurto: «Maria S.» para o texto compartilhado", () => {
  assert.equal(A.nomeCurto("Maria Souza"), "Maria S.");
  assert.equal(A.nomeCurto("Maria"), "Maria");
  assert.equal(A.nomeCurto(""), "");
});

test("DC-440 · passaDoHorario: a consulta que termina depois da faixa", () => {
  assert.equal(A.passaDoHorario(cfgSemanaD, "2026-10-16", 17 * 60 + 45, 30), true);
  assert.equal(A.passaDoHorario(cfgSemanaD, "2026-10-16", 17 * 60, 30), false);
  assert.equal(A.passaDoHorario({}, "2026-10-16", 17 * 60 + 45, 30), false);
});

test("DC-361 · atalhoDoDetalhe: C/F/R/L", () => {
  assert.equal(A.atalhoDoDetalhe("C"), '.ag-pres-bt[data-estado="compareceu"]');
  assert.equal(A.atalhoDoDetalhe("f"), '.ag-pres-bt[data-estado="faltou"]');
  assert.equal(A.atalhoDoDetalhe("r"), ".ag-det-remarcar");
  assert.equal(A.atalhoDoDetalhe("l"), ".ag-det-lembrar");
  assert.equal(A.atalhoDoDetalhe("x"), null);
});

test("DC-400 · textoForaDoHorario: diz o dia e as faixas", () => {
  const cfg = { horario: { 5: [["08:00", "12:00"], ["14:00", "18:00"]] } };
  assert.equal(A.textoForaDoHorario(cfg, "2026-10-16"), "Fora do horário: na sexta a agenda atende das 08:00 às 12:00 e das 14:00 às 18:00.");
  assert.equal(A.textoForaDoHorario(cfg, "2026-10-17"), "Fora do horário: no sábado a agenda não atende.");
});

test("DC-398 · avisoCapacidade: equipe maior que a capacidade", () => {
  assert.match(A.avisoCapacidade(3, 1), /^3 profissionais atendem e a agenda aceita 1 atendimento por horário/);
  assert.equal(A.avisoCapacidade(1, 1), null);
  assert.equal(A.avisoCapacidade(2, 3), null);
});

test("DC-313 · textoAgoraDoDia: agora e a próxima", () => {
  const prox = { inicio: "2026-10-15T15:00:00-03:00" };
  assert.equal(A.textoAgoraDoDia([prox], Date.parse("2026-10-15T14:32:00-03:00")), "agora 14:32, próxima às 15:00");
  assert.equal(A.textoAgoraDoDia([], Date.parse("2026-10-15T14:32:00-03:00")), "agora 14:32, sem mais consultas hoje");
});

test("DC-309 · estadoDoMinuto: bloqueado, lotado, ocupado ou livre", () => {
  const col = { iso: "2026-10-16", bloqueios: [{ inicio: "2026-10-16T12:00:00-03:00", fim: "2026-10-16T13:00:00-03:00", motivo: "almoço" }],
    consultas: [{ inicio: "2026-10-16T10:00:00-03:00", fim: "2026-10-16T10:30:00-03:00" }] };
  assert.equal(A.estadoDoMinuto(col, 12 * 60 + 10, cfgSemanaD), ", bloqueado: almoço");
  assert.equal(A.estadoDoMinuto(col, 10 * 60, cfgSemanaD), ", lotado (1 consulta)");
  assert.equal(A.estadoDoMinuto(col, 10 * 60, { ...cfgSemanaD, capacidade: 2 }), ", 1 consulta");
  assert.equal(A.estadoDoMinuto(col, 15 * 60, cfgSemanaD), "");
});

test("DC-326 · outrasConsultasDoContato: as próximas em outros negócios", () => {
  const r = A.outrasConsultasDoContato([
    { id: "n1", consulta_em: "2026-10-20T10:00:00-03:00", servico: "Limpeza" },
    { id: "n2", consulta_em: "2026-10-18T10:00:00-03:00", titulo: "Canal" },
    { id: "n3", consulta_em: "2026-10-10T10:00:00-03:00" },
    { id: "n4", consulta_em: "2026-10-19T10:00:00-03:00", status: "perdido" },
  ], "n1", T0);
  assert.deepEqual(r.map(x => [x.id, x.titulo]), [["n2", "Canal"]]);
});

test("DC-325 · sufixoOcupadoPor: quem pegou o horário", () => {
  assert.equal(A.sufixoOcupadoPor({ ocupado_por: { nome: "Ana", em: new Date(T0 - 60000).toISOString() } }, T0), " por Ana há 1 min");
  assert.equal(A.sufixoOcupadoPor({ detalhe: { ocupado_por: { marcado_por: "ia" } } }, T0), " pela IA");
  assert.equal(A.sufixoOcupadoPor({}, T0), "");
});

test("DC-324 · consultaMudou", () => {
  const a = { inicio: "2026-10-16T10:00:00-03:00", status: "aberto" };
  assert.equal(A.consultaMudou(a, null), "desmarcada");
  assert.equal(A.consultaMudou(a, { ...a, inicio: "2026-10-16T11:00:00-03:00" }), "remarcada");
  assert.equal(A.consultaMudou(a, { ...a, status: "ganho" }), "alterada");
  assert.equal(A.consultaMudou(a, { ...a }), null);
});

test("DC-331 · retornoEmDias / textoRetornoDias", () => {
  assert.equal(A.retornoEmDias({ servico: "Limpeza" }, { retornos: { limpeza: 120 } }), 120);
  assert.equal(A.retornoEmDias({ servico: "Limpeza" }, null, { vertical: "odonto" }), 180);
  assert.equal(A.textoRetornoDias(180), "6 meses");
  assert.equal(A.textoRetornoDias(365), "1 ano");
  assert.equal(A.textoRetornoDias(30), "30 dias");
});

test("DC-332 · textoAvaliacao: sem link não há texto", () => {
  assert.equal(A.textoAvaliacao({ nome: "Maria" }, "2026-10-15", { empresa: "X" }), "");
  assert.match(A.textoAvaliacao({ nome: "Maria" }, "2026-10-15", { empresa: "Clínica Sorriso", link: "https://g.page/r/abc" }), /Clínica Sorriso.*https:\/\/g\.page\/r\/abc/);
});

test("DC-433 · pontosFacultativos: Carnaval e Corpus Christi pela Páscoa", () => {
  const p26 = CFG.pontosFacultativos(2026).map(x => x.data);
  assert.deepEqual(p26, ["2026-02-16", "2026-02-17", "2026-06-04"]);
  const p27 = CFG.pontosFacultativos(2027).map(x => x.data);
  assert.deepEqual(p27, ["2027-02-08", "2027-02-09", "2027-05-27"]);
});

test("DC-387 · bloqueios agrupados por mês", () => {
  const m = CFG.contarPorMes([{ inicio: "2026-11-02T00:00:00-03:00" }, { inicio: "2026-11-15T00:00:00-03:00" }, { inicio: "2026-12-25T00:00:00-03:00" }]);
  assert.equal(m.get("2026-11"), 2);
  assert.equal(m.get("2026-12"), 1);
  assert.equal(CFG.nomeMes("2026-11"), "Novembro de 2026");
});

test("DC-350 · avisoRenovarFeriados: só em nov/dez e para quem já bloqueia feriado", () => {
  const usou = [{ inicio: "2026-12-25T00:00:00-03:00", motivo: "Natal" }];
  assert.equal(CFG.avisoRenovarFeriados("2026-11-10", usou), "Os feriados de 2027 ainda não estão bloqueados.");
  assert.equal(CFG.avisoRenovarFeriados("2026-10-10", usou), null);
  assert.equal(CFG.avisoRenovarFeriados("2026-11-10", []), null);
});

test("DC-410 / DC-399 · preferências: aviso10 só quando ligado", () => {
  assert.equal(A.normalizarExtrasAgenda({ aviso10: "ligado" }).aviso10, "ligado");
  assert.equal("aviso10" in A.normalizarExtrasAgenda({ aviso10: "x" }), false);
  assert.equal(A.normalizarExtrasAgenda({ roteiro: "dispensado" }).roteiro, "dispensado");
});

test("DC-366 / DC-375 / DC-403 / DC-410 · CSS: FAB no celular, :30, linha do hover, aviso10 com 44 px", () => {
  const css = ler("agenda.css");
  assert.match(css, /\.agenda-marcar\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.ag-hora-meia\s*\{/);
  assert.match(css, /\.ag-col-hover\s*\{/);
  assert.match(css, /\.agenda-aviso10\s*\{\s*min-height:\s*44px/);
});

test("DC-434 · CSS de impressão: os botões rápidos, a presença e as desmarcadas saem", () => {
  const css = ler("agenda.css");
  const print = css.match(/@media print\s*\{[\s\S]*?\n\}/g) || [];
  assert.ok(print.some(b => /\.ag-li-rapidas/.test(b) && /\.ag-pres\b/.test(b) && /display:\s*none/.test(b)));
});

test("DC-318 · detalhe: a alça da folha fecha (botão) e o deslizar para baixo fecha", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const el = T.reg.popEls.at(-1);
    const alca = el.querySelector(".ag-det-alca");
    assert.ok(alca, "a alça existe");
    assert.equal(alca.getAttribute("aria-label"), "Fechar o detalhe");
    assert.match(ler("agenda.css"), /\.flut-ag \.ag-det-alca\s*\{[^}]*min-height:\s*44px/);
    assert.match(ler("agenda.js"), /if \(dy > 80\) pop\.fechar\(\)/);
  } finally { T.sair(); }
});

test("DC-368 · deslizar: o painel acompanha o dedo e volta", () => {
  const src = ler("agenda.js");
  assert.match(src, /addEventListener\("touchmove"[\s\S]{0,300}translateX/);
  assert.match(src, /addEventListener\("touchcancel"/);
});
