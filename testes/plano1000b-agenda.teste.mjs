/* Plano «1000+ melhorias, rodada B» · frente agenda (lotes agenda-1 e agenda-2, 15/10/2026). Sem rede, sem navegador: o mesmo DOM mínimo e a
   mesma tela montada do plano1000-agenda (cópia das peças de apoio, com ui/api de mentira; o servidor fictício filtra as consultas pelo
   período pedido). Cada teste cita o item (CB-xxx / AB-xxx) e falharia no código de antes. */
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
  cfg = { duracao_min: 30, capacidade: 1 }, conta = "conta-ag", prefsExtra = {}, novoNegocio = null, movel = false, kitBase = { usuarios: [] }, vocab = null } = {}) {   // plano 1000b: kitBase (funis do CRM), vocab
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

/* ============================================================ plano 1000b · agenda-1 */
const vocabMod = await import("../web/app/vocab.js");
const cssAgenda = ler("agenda.css");
const cfgValidaB = { duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30 };
const enviarForm = async C => { C.alvo.querySelector("form").dispatchEvent(C.D.evento("submit")); await esperar(6); };
const digitar = (T, inp, v) => { inp.value = v; inp.dispatchEvent(T.D.evento("input")); };

test("CB-144 · «Próxima» fora do período respeita «Minha agenda» (só consultas de outro dono → nenhuma próxima)", async () => {
  const hoje = hojeSP(), seg = A.segundaDe(hoje), prox = A.diaISO(seg, 8);
  const consultas = [consultaEm(prox, "10:00", { dono_id: "outra", dono_nome: "Dra. Outra" })];
  const T = await montarAgenda({ data: hoje, consultas, prefsExtra: { prof: "eu" } });
  try {
    await esperar(10);
    const vazia = T.alvo.querySelector(".agenda-proxima-vazia");
    assert.ok(vazia, "sem chip de próxima");
    assert.equal(vazia.textContent, A.textoSemProxima({ umDia: false, desde: A.diaISO(seg, 7), hojeISO: hoje }));
    assert.equal(T.alvo.querySelector(".agenda-proxima-fora"), null, "a paciente da outra profissional não aparece");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: hoje, consultas, conta: "conta-ag2" });
  try {
    await esperar(10);
    assert.match(T2.alvo.querySelector(".agenda-proxima-fora").textContent, /Mariana Costa/, "com «Todos» a próxima aparece");
  } finally { T2.sair(); }
});

test("CB-151 / CB-256 · atalhos de uma tecla desligáveis na paleta: desligados, «d» não troca a visão", async () => {
  assert.equal(A.normalizarExtrasAgenda({ atalhos: "desligados" }).atalhos, "desligados");
  const T = await montarAgenda({ data: futuraSeg(), prefsExtra: { atalhos: "desligados" } });
  try {
    const tecla = key => { for (const f of T.ouv.get("keydown") || []) f({ key, target: T.alvo, preventDefault() {} }); };
    T.reg.chamadas.length = 0;
    tecla("d");
    await esperar(8);
    assert.ok(!T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_dias === 1), "«d» não abriu o Dia");
    assert.equal(T.alvo.querySelector(".agenda-hoje").getAttribute("aria-keyshortcuts"), null, "sem atalho anunciado");
    const cmd = [...T.reg.ativos].find(c => c.id === "agenda.atalhos");
    assert.equal(cmd.rotulo, "Ligar atalhos de uma tecla da Agenda");
    assert.ok(![...T.reg.ativos].some(c => c.id === "agenda.ver-dia"), "a folha «?» não lista D/S/M/L desligados");
    cmd.fazer();
    assert.equal(JSON.parse(T.storage.get(T.chave)).atalhos, "ligados", "lembrado nas preferências");
    assert.equal(T.alvo.querySelector(".agenda-hoje").getAttribute("aria-keyshortcuts"), "T");
    tecla("d");
    await esperar(8);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_dias === 1), "ligados: «d» abre o Dia");
  } finally { T.sair(); }
});

const contatoCom = conversas => async n => (n === "nx_contato_ver" ? { conversas } : undefined);
test("CB-195 / CB-261 · «Lembrar» com o contato só numa conversa resolvida: copia e diz para reabrir (sem rascunho no campo travado)", async () => {
  const fut = A.diaISO(hojeSP(), 3);
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], rpc: contatoCom([{ id: 901, status: "resolvida", aberta_em: "2026-10-01" }]) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-lembrar").click();
    await esperar(12);
    assert.equal(T.rascunho.existe("conversa:901"), false, "o rascunho não vai para a conversa resolvida");
    assert.equal(T.reg.copiados.length, 1);
    assert.match(T.reg.toasts.at(-1), /reabra a conversa ou comece uma nova \(no número da Meta, só com modelo\)/);
    assert.deepEqual(T.reg.navegou, ["#/conversas/901"]);
  } finally { T.sair(); }
});

test("CB-146 · bloqueio de 45 dias confere as consultas em blocos de 31 dias (a do dia 40 avisa)", async () => {
  assert.deepEqual(CFG.blocosDeLeitura("2026-11-01", "2026-12-15"), [{ p_data: "2026-11-01", p_dias: 31 }, { p_data: "2026-12-02", p_dias: 14 }]);
  assert.deepEqual(CFG.blocosDeLeitura("2026-11-01"), [{ p_data: "2026-11-01", p_dias: 1 }]);
  assert.equal(CFG.blocosDeLeitura("2026-01-01", "2026-12-31").length, 6, "no máximo 6 leituras");
  const ini = A.diaISO(hojeSP(), 5), fim = A.diaISO(ini, 44);
  const consultas = [consultaEm(A.diaISO(ini, 39), "10:00")];
  const erros = [];
  const C = await montarConfig({
    rpc: async (n, p) => (n === "nx_agenda_dia" ? { consultas: consultas.filter(c => naData(c, p.p_data, p.p_dias)) } : undefined),
    modal: async o => {
      o.aoAbrir && o.aoAbrir({ fechar() {} });
      o.corpo.querySelector('[name="data"]').value = ini;
      o.corpo.querySelector('[name="data_fim"]').value = fim;
      return primaria(o).fn(erroModal(erros));
    } });
  porTexto(C.alvo, "button", "Bloquear horário").click();
  await esperar(12);
  assert.match(erros[0] || "", /Há 1 consulta marcada/);
  // plano 1500c: a prévia do horário herdado lê hoje (CC-235, p_dias 1); a conta é a das leituras do bloqueio
  assert.equal(C.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data !== hojeSP()).length, 2);
});

test("CB-148 / CB-254 · dia que já passou: «Livre» sem «Marcar» no celular e sem «+» na semana", async () => {
  const ontem = A.diaISO(hojeSP(), -1);
  const T = await montarAgenda({ data: ontem, movel: true });
  try {
    const livre = T.alvo.querySelector(".ag-dia-painel .ag-livre");
    assert.ok(livre);
    assert.notEqual(livre.tagName, "BUTTON", "ontem não é botão");
  } finally { T.sair(); }
  const P = await montarAgenda({ data: passadaSeg() });
  try { assert.equal(P.alvo.querySelectorAll(".ag-dia-mais").length, 0, "semana passada: nenhum «+»"); } finally { P.sair(); }
  const F = await montarAgenda({ data: futuraSeg() });
  try { assert.equal(F.alvo.querySelectorAll(".ag-dia-mais").length, 7); } finally { F.sair(); }
  const D = criarDom();
  const lista = A.montarListaDias({ h: D.h, dias: [ontem, hojeSP()], hoje: hojeSP(), pode: true, aoMarcar() {} });
  assert.equal(lista.querySelectorAll(".ag-lista-livre").length, 1, "na lista, só hoje tem «Livre · Marcar»");
});

test("CB-150 · a busca roda com 2 caracteres e o texto diz isso (nada de «quatro números»)", async () => {
  assert.doesNotMatch(A.TEXTO_BUSCA_CURTA, /quatro/);
  const { T, corpo } = await abrirMarcar();
  try {
    const inp = corpo.querySelector('input[name="busca"]');
    digitar(T, inp, "1");
    await esperar(4);
    assert.match(corpo.querySelector(".agenda-resultados").textContent, /pelo menos 2 letras ou números/);
    T.reg.chamadas.length = 0;
    digitar(T, inp, "12");
    await esperar(6);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_buscar" && c.p.p_q === "12"), "«12» já busca");
  } finally { T.sair(); }
});

test("CB-153 · celular: a trilha do «remover» tem 44 px (o botão de toque não estoura a coluna)", () => {
  const movel = cssAgenda.slice(cssAgenda.indexOf("@media (max-width: 760px) {", cssAgenda.indexOf(".agenda-busca > .agenda-resultados") - 600));
  assert.match(movel, /\.agc-faixa \{ grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) 44px; \}/);
  assert.match(movel, /\.agc-duracao \{ grid-template-columns: minmax\(0, 1fr\) minmax\(90px, \.4fr\) 44px; \}/);
  assert.doesNotMatch(cssAgenda, /agc-(faixa|duracao) \{ grid-template-columns:[^}]*36px/);
});

test("CB-155 · os rótulos da linha de serviço acompanham o nome digitado", async () => {
  const C = await montarConfig({ cfg: cfgValidaB });
  porTexto(C.alvo, "button", "Adicionar serviço").click();
  const linha = C.alvo.querySelectorAll(".agc-duracao").at(-1);
  const nome = linha.querySelector('input[type="text"]');
  nome.value = "Limpeza";
  nome.dispatchEvent(C.D.evento("input"));
  assert.equal(linha.querySelector(".agc-remover").getAttribute("aria-label"), "Remover duração de Limpeza");
  assert.equal(linha.querySelector('input[type="number"]').getAttribute("aria-label"), "Duração em minutos para Limpeza");
});

test("CB-158 · «Copiar para os dias úteis» com Desfazer: as faixas de terça voltam", async () => {
  const desf = [];
  // plano 1500c: «Copiar para…» abre a escolha dos dias (CC-231) com os úteis marcados — confirmar sem mexer = dias úteis
  const C = await montarConfig({ cfg: { ...cfgValidaB, horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"]], 2: [["09:00", "11:00"]] } }, uiExtra: { acaoComDesfazer: o => { desf.push(o); } },
    modal: async o => primaria(o).valor });
  C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-copiar').click();
  await esperar(4);
  const faixas = id => C.alvo.querySelectorAll(`.agc-dia[data-dia="${id}"] .agc-faixa`).map(l => l.querySelectorAll("input").map(i => i.value));
  assert.deepEqual(faixas("2"), [["08:00", "12:00"]]);
  assert.equal(desf.length, 1);
  assert.match(desf[0].texto, /copiado para os dias úteis/);
  desf[0].reverter();
  assert.deepEqual(faixas("2"), [["09:00", "11:00"]], "terça volta");
  assert.equal(C.alvo.querySelector('input[name="dia_3"]').checked, false, "quarta volta a fechada");
});

test("CB-160 / CB-251 · serviço com e sem acento é repetido; linha de serviço em branco é ignorada ao salvar", async () => {
  assert.equal(A.normServico("Avaliação"), A.normServico(" avaliacao "));
  assert.equal(CFG.chaveServico("Avaliação"), "avaliacao");
  const C = await montarConfig({ cfg: { ...cfgValidaB, duracoes: { "Avaliação": 30, "Avaliacao": 45 } } });
  await enviarForm(C);
  assert.match(C.reg.toasts.at(-1), /aparece mais de uma vez/);
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
  const C2 = await montarConfig({ cfg: { ...cfgValidaB, duracoes: { "Avaliação": 30 } } });
  porTexto(C2.alvo, "button", "Adicionar serviço").click();
  assert.equal(C2.alvo.querySelectorAll(".agc-duracao").length, 2);
  await enviarForm(C2);
  const salvo = C2.reg.chamadas.find(c => c.nome === "nx_agenda_config_salvar");
  assert.ok(salvo, "a linha vazia não impede salvar (CB-145)");
  assert.deepEqual(salvo.p.p_cfg.duracoes, { "Avaliação": 30 });
  assert.equal(C2.alvo.querySelectorAll(".agc-duracao").length, 1, "a linha vazia sai");
  // na janela de marcar, «avaliacao» casa com «Avaliação»
  const { T, corpo } = await abrirMarcar({ cfg: { duracao_min: 30, capacidade: 1, duracoes: { "Avaliação": 40 } } });
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    const serv = corpo.querySelector('input[name="servico"]');
    digitar(T, serv, "avaliacao");
    assert.equal(corpo.querySelector(".ag-serv-aviso").textContent, "Duração de «Avaliação»: 40 min.");
  } finally { T.sair(); }
});

test("CB-162 · «Procurar paciente»: a lista não é região viva; um status diz quantas consultas", async () => {
  const seg = futuraSeg(), alvoDia = A.diaISO(seg, 2);
  const janelas = [];
  const rpc = async (n, p) => {
    if (n === "nx_buscar") return { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", status: "aberto" }] };
    if (n === "nx_negocio_ver") return { negocio: { id: p.p_id, consulta_em: `${alvoDia}T10:00:00-03:00` } };
    return undefined;
  };
  const T = await montarAgenda({ data: seg, rpc, modal: janelaAberta(janelas) });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(4);
    const corpo = janelas[0].o.corpo;
    const lista = corpo.querySelector(".ag-procurar-lista");
    assert.equal(lista.getAttribute("aria-live"), null);
    assert.equal(lista.getAttribute("role"), null);
    const inp = corpo.querySelector('input[name="paciente"]');
    inp.value = "Mariana";
    inp.dispatchEvent(T.D.evento("keydown", { key: "Enter" }));
    await esperar(12);
    const st = corpo.querySelector(".ag-procurar-status");
    assert.equal(st.getAttribute("role"), "status");
    assert.equal(st.textContent, "1 consulta encontrada.");
    assert.equal(lista.querySelectorAll(".ag-procurar-item").length, 1);
  } finally { T.sair(); }
});

test("CB-164 / CB-190 / CB-258 · sem origem a linha some; «formulario» vira «Formulário»", async () => {
  assert.equal(A.origemDo({ origem: "formulario" }), "Formulário");
  const fut = A.diaISO(hojeSP(), 3);
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00"), consultaEm(fut, "15:00", { negocio_id: 802, origem: "formulario" })] });
  try {
    T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco').click();
    assert.equal(T.reg.pops.at(-1).querySelectorAll(".ag-det-origem").length, 0, "sem «Origem: Origem não informada»");
    T.alvo.querySelector('.ag-item[data-negocio="802"] .ag-bloco').click();
    assert.equal(T.reg.pops.at(-1).querySelector(".ag-det-origem").textContent, "Origem: Formulário");
  } finally { T.sair(); }
});

test("CB-166 · «Sem internet» pelo estado da rede do app (Wi-Fi sem internet com o navigator dizendo online)", async () => {
  assert.equal(A.estaOffline({ estado: "offline" }, { onLine: true }), true);
  assert.equal(A.estaOffline({ estado: "lento" }, { onLine: false }), false, "o estado do app vale primeiro");
  assert.equal(A.estaOffline(null, { onLine: false }), true, "sem ctx.rede, o navigator");
  const T = await montarAgenda({ data: futuraSeg() });
  try {
    T.ctx.rede = { estado: "offline" };
    T.alvo.querySelector(".agenda-marcar").click();
    await esperar(4);
    assert.match(T.reg.toasts.at(-1), /^Sem internet: marcar exige conexão/);
    assert.equal(T.reg.modais.length, 0, "a janela não abre");
  } finally { T.sair(); }
});

test("CB-168 · «Ver mais 14 dias» no limite: o aviso diz que a agenda abre até 180 dias", async () => {
  const { T, corpo } = await abrirMarcar();
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    const mais = corpo.querySelector(".ag-mais-dias");
    for (let i = 0; i < 13 && !mais.hidden; i++) { mais.click(); await esperar(6); }
    assert.equal(mais.hidden, true);
    assert.match(corpo.querySelector(".ag-info").textContent, /A agenda abre até 180 dias à frente\./);
  } finally { T.sair(); }
});

test("CB-170 · busca de oportunidade com 12 resultados: 8 à vista e «Ver mais» traz os 12", async () => {
  const doze = Array.from({ length: 12 }, (_, i) => ({ id: 900 + i, titulo: `Mariana ${i + 1}`, contato_nome: `Mariana ${i + 1}`, estagio_nome: "Nova", status: "aberto" }));
  const { T, corpo } = await abrirMarcar({ rpc: async n => (n === "nx_buscar" ? { negocios: doze } : undefined) });
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    assert.equal(corpo.querySelectorAll(".agenda-resultado").length, 8);
    const mais = corpo.querySelector(".agenda-res-mais");
    assert.equal(mais.textContent, "Ver mais 4");
    assert.equal(mais.closest('[role="listbox"]'), null, "o botão fica fora do listbox");
    mais.click();
    assert.equal(corpo.querySelectorAll(".agenda-resultado").length, 12);
    assert.equal(corpo.querySelector('input[name="busca"]').getAttribute("aria-activedescendant"), corpo.querySelectorAll(".agenda-resultado")[8].getAttribute("id"));
  } finally { T.sair(); }
});

test("CB-172 · celular: trocar o dia na faixa anuncia o dia e as consultas", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, movel: true, consultas: [consultaEm(A.diaISO(seg, 2), "10:00"), consultaEm(A.diaISO(seg, 2), "11:00", { negocio_id: 802 })] });
  try {
    await dormir(40);
    T.alvo.querySelectorAll('.ag-faixa [role="tab"]')[2].click();
    await dormir(50);
    const txt = T.alvo.querySelector(".agenda-anuncio").textContent;
    assert.doesNotMatch(txt, /^Semana/, "não é o anúncio da semana que já estava lá");
    assert.match(txt, /, \d{2} de .+: 2 consultas$/, "o dia escolhido e as consultas dele");
  } finally { T.sair(); }
});

test("CB-174 · desmarcar consulta que já passou avisa para usar «Faltou» (com o botão)", async () => {
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, consultas: [consultaEm(pas, "10:00")] });
  try {
    await esperar(6);
    T.alvo.querySelector(".ag-bloco").click();
    porTexto(T.reg.pops.at(-1), "button", "Desmarcar").click();
    await esperar(6);
    const aviso = T.reg.modais.at(-1).corpo.querySelector(".ag-desmarcar-passou");
    assert.ok(aviso);
    assert.match(aviso.textContent, /já passou: para registrar falta use «Faltou»/);
    assert.ok(aviso.querySelector(".ag-desmarcar-faltou"), "com o atalho para «Faltou»");
  } finally { T.sair(); }
  const fut = futuraSeg();
  const F = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")] });
  try {
    F.alvo.querySelector(".ag-bloco").click();
    porTexto(F.reg.pops.at(-1), "button", "Desmarcar").click();
    await esperar(6);
    assert.equal(F.reg.modais.at(-1).corpo.querySelector(".ag-desmarcar-passou"), null, "futura: sem o aviso");
  } finally { F.sair(); }
});

test("CB-176 · o resumo do mês não é um status novo a cada desenho", () => {
  const D = criarDom();
  const el = A.montarMiniCalendario({ h: D.h, mes: "2026-10-01", hoje: "2026-10-15" });
  assert.equal(el.querySelector(".ag-mes-resumo").getAttribute("role"), null);
});

test("CB-178 / CB-177 / CB-253 · linha do dia sem «0 encaixes» e «agora · HH:MM» na hora em que começa", () => {
  assert.equal(A.textoResumoDia({ total: 2, feitas: 0, faltas: 0, encaixes: 0 }), "2 consultas · 0 faltas");
  assert.doesNotMatch(A.textoResumoDia({ total: 2, feitas: 0, faltas: 0, encaixes: 0 }, { futuro: true }), /encaixe/);
  assert.equal(A.textoResumoDia({ total: 2, feitas: 0, faltas: 0, encaixes: 1 }, { futuro: true }), "2 consultas · 1 encaixe");
  const agora = Date.parse("2026-10-15T13:00:00Z");
  assert.equal(A.rotuloProxima({ inicio: "2026-10-15T10:00:00-03:00" }, agora, "2026-10-15"), "agora · 10:00");
  assert.equal(A.rotuloProxima({ inicio: "2026-10-15T10:20:00-03:00" }, agora, "2026-10-15"), "em 20 min · 10:20");
});

test("CB-180 / CB-201 · a ajuda do interruptor acompanha o estado; pausas avisam que valem com o horário do departamento", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaB, horario_fonte: "departamento" } });
  const ajuda = C.alvo.querySelector(".agc-fonte-ajuda");
  assert.match(ajuda.textContent, /horário do departamento/);
  const aviso = C.alvo.querySelector(".agc-aviso-pausas");
  assert.equal(aviso.hidden, false);
  assert.equal(aviso.textContent, "As pausas valem também com o horário do departamento.");
  const sw = C.alvo.querySelector('input[name="usar_horario"]');
  sw.checked = true;
  sw.dispatchEvent(C.D.evento("change"));
  assert.match(ajuda.textContent, /^Os horários abaixo valem para a agenda/);
  assert.equal(aviso.hidden, true);
});

test("CB-182 · o período do bloqueio na grade vem em texto (não só no title)", async () => {
  const seg = futuraSeg(), d = A.diaISO(seg, 1);
  const b = { inicio: `${d}T12:00:00-03:00`, fim: `${d}T13:00:00-03:00`, motivo: "almoço" };
  assert.equal(A.textoBloqueioNoDia(b, d), "Bloqueado das 12:00 às 13:00: almoço");
  assert.equal(A.textoBloqueioNoDia({ inicio: `${A.diaISO(d, -1)}T00:00:00-03:00`, fim: `${A.diaISO(d, 2)}T00:00:00-03:00` }, d), "Bloqueado o dia todo");
  const T = await montarAgenda({ data: seg, bloqueios: [b] });
  try {
    assert.match(T.alvo.querySelector(".ag-bloq").textContent, /Bloqueado das 12:00 às 13:00: almoço/);
  } finally { T.sair(); }
});

test("CB-184 · horário com 3 lugares e 1 ocupado mostra «2 vagas» na pílula", async () => {
  const { T, corpo } = await abrirMarcar({ rpc: async (n, p) => (n === "nx_agenda_livres"
    ? { duracao_min: 30, horarios: [{ inicio: `${A.diaISO(p.p_a_partir, 1)}T14:00:00-03:00`, livre: true, capacidade: 3, ocupados: 1 }] } : undefined) });
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    const pill = corpo.querySelector(".ag-hora-pill");
    assert.equal(pill.querySelector(".ag-hora-vagas").textContent, "2 vagas");
  } finally { T.sair(); }
});

test("CB-186 · presença em lote: o aviso cita quem não gravou", async () => {
  const pas = passadaSeg();
  const consultas = [consultaEm(pas, "09:00", { presenca: null }), consultaEm(pas, "10:00", { negocio_id: 802, nome: "Rafael Lima", presenca: null }), consultaEm(pas, "11:00", { negocio_id: 803, presenca: null })];
  const T = await montarAgenda({ data: pas, modo: "dia", consultas, modal: async () => true,
    rpc: async (n, p) => { if (n === "nx_agenda_presenca") { if (p.p_negocio === 802) throw Object.assign(new Error("falhou"), { codigo: "falhou" }); return { ok: true }; } return undefined; } });
  const erroReal = console.error; console.error = () => {};
  try {
    T.alvo.querySelector(".ag-pres-lote").click();
    await esperar(16);
    assert.match(T.reg.desfazer.at(-1).texto, /^2 consultas marcadas como «Compareceu» · não gravaram: Rafael Lima \(/);
  } finally { console.error = erroReal; T.sair(); }
});

test("CB-188 · «Atendimentos no mesmo horário» com exemplo", async () => {
  const C = await montarConfig({ cfg: cfgValidaB });
  const cap = C.reg.campos.find(o => o.nome === "capacidade");
  assert.equal(cap.ajuda, "Ex.: 2 = duas cadeiras ou salas atendendo ao mesmo tempo.");
});

test("CB-192 / CB-260 · com «Minha agenda» a ocupação diz que é só da sua agenda", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: cfgSemana, prefsExtra: { prof: "eu" }, consultas: [consultaEm(seg, "10:00", { dono_id: "conta-ag", dono_nome: "Eu" })] });
  try {
    const oc = T.alvo.querySelector(".agenda-resumo-ocup");
    assert.match(oc.getAttribute("title"), /da sua agenda/);
    assert.match(oc.textContent, /da sua agenda$/);
  } finally { T.sair(); }
});

test("CB-194 / CB-266 · a visão Lista é anunciada «De 15 a 21/10», não «Semana de…»", () => {
  assert.equal(A.textoAnuncioPeriodo({ modo: "lista", de: "2026-10-15", dias: 7, n: 2 }), "De 15 a 21/10: 2 consultas");
  assert.equal(A.textoAnuncioPeriodo({ modo: "lista", de: "2026-10-29", dias: 7, n: 1 }), "De 29/10 a 04/11: 1 consulta");
  assert.match(A.textoAnuncioPeriodo({ modo: "semana", de: "2026-10-12", dias: 7, n: 0 }), /^Semana de/);
});

test("CB-197 / CB-267 · «Mostrar todas» da legenda: o foco vai para um chip; «Ver mais» dos bloqueios foca o 1º novo", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00"), consultaEm(seg, "11:00", { negocio_id: 802, servico: "Limpeza" })] });
  try {
    T.alvo.querySelector(".ag-leg-chip").click();
    await esperar(2);
    const limpar = T.alvo.querySelector(".ag-leg-limpar");
    limpar.focus();
    limpar.click();
    await esperar(2);
    assert.equal(T.alvo.querySelector(".ag-leg-limpar"), null);
    assert.ok(T.D.estado.ativo && T.D.estado.ativo.classList.contains("ag-leg-chip"), "o foco ficou num chip");
  } finally { T.sair(); }
  const fut = A.diaISO(hojeSP(), 2);
  const bloqueios = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, inicio: `${A.diaISO(fut, i)}T08:00:00-03:00`, fim: `${A.diaISO(fut, i)}T09:00:00-03:00`, motivo: `B${i + 1}` }));
  const C = await montarConfig({ cfg: cfgValidaB, bloqueios });
  C.alvo.querySelector(".agc-ver-mais").click();
  const itens = C.alvo.querySelectorAll(".agc-bloqueio");
  assert.equal(itens.length, 35);
  assert.equal(C.D.estado.ativo, itens[30].querySelector("button"), "o foco foi para o 31º (o 1º novo)");
});

test("CB-199 · bloquear pela grade tem «Desfazer», que exclui o bloqueio criado", async () => {
  const seg = futuraSeg();
  const janelas = [];
  const T = await montarAgenda({ data: seg, modal: janelaAberta(janelas) });
  try {
    clicarNoVazio(T, .2);
    await esperar(8);
    janelas[0].o.corpo.querySelector(".ag-bloquear-horario").click();
    await esperar(8);
    janelas[1].fechar({ ok: true, id: 77 });
    await esperar(8);
    const d = T.reg.desfazer.at(-1);
    assert.match(d.texto, /^Horário bloqueado: .*, 10:00–10:30$/);
    await d.reverter();
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_bloqueio_excluir" && c.p.p_id === 77));
  } finally { T.sair(); }
});

test("CB-255 / CB-149 · remarcar pelo «Dia seguinte» do celular: horário ocupado não fala em «Arraste»", async () => {
  const seg = futuraSeg();
  const erros = [];
  const T = await montarAgenda({ data: seg, movel: true, consultas: [consultaEm(seg, "10:00")],
    rpc: async n => (n === "nx_agenda_marcar" ? { ok: false, erro: "horario_ocupado" } : n === "nx_negocio_ver" ? { negocio: { estagio_id: "s1" } } : undefined),
    modal: async o => (o.titulo === "Remarcar consulta?" ? primaria(o).fn(erroModal(erros)) : null) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-amanha").click();
    await esperar(20);
    // plano 2000d: DC-276 — a recusa relê a agenda e diz que outro atendimento entrou
    assert.equal(erros[0], "Outro atendimento entrou neste horário (a agenda foi atualizada). Escolha outro horário.");
  } finally { T.sair(); }
});

test("CB-257 / CB-156 · erros dos números do formulário marcam o campo (aria-invalid) e levam o foco", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaB, duracao_min: 3 } });
  C.alvo.querySelector('input[name="capacidade"]').value = "0";
  await enviarForm(C);
  const dur = C.alvo.querySelector('input[name="duracao_min"]'), cap = C.alvo.querySelector('input[name="capacidade"]');
  assert.equal(dur.getAttribute("aria-invalid"), "true");
  assert.equal(cap.getAttribute("aria-invalid"), "true");
  assert.equal(C.D.estado.ativo, dur, "o foco vai para o 1º campo errado");
  assert.deepEqual(C.reg.erros.map(e => e[0]), ["duracao_min", "capacidade"]);
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
});

test("CB-259 / CB-191 · faixa que passa da meia-noite vale até 24:00 e continua no dia seguinte", () => {
  const cfg = { horario: { 1: [["22:00", "02:00"]], 3: [["18:00", "00:00"]] } };
  assert.deepEqual(A.faixasDoDia(cfg, "2026-10-12"), [[22 * 60, 24 * 60]], "segunda");
  assert.deepEqual(A.faixasDoDia(cfg, "2026-10-13"), [[0, 120]], "terça");
  assert.deepEqual(A.faixasDoDia(cfg, "2026-10-14"), [[18 * 60, 24 * 60]], "18:00–00:00 não transborda");
  assert.deepEqual(A.faixasDoDia(cfg, "2026-10-15"), [], "quinta fechada");
  assert.equal(A.horarioAberto(cfg, "2026-10-13", 60), true);
});

test("CB-263 · deslocamentoFuso: São Paulo −180; Nova York muda 60 min entre julho e janeiro", () => {
  assert.equal(A.deslocamentoFuso(Date.parse("2026-10-15T12:00:00Z")), -180);
  const jul = A.deslocamentoFuso(Date.parse("2026-07-15T12:00:00Z"), "America/New_York"), jan = A.deslocamentoFuso(Date.parse("2026-01-15T12:00:00Z"), "America/New_York");
  assert.equal(jul, -240);
  assert.equal(jan - jul, -60);
});

test("CB-265 · normalizarExtrasAgenda: inválidos voltam ao padrão; id longo é recusado", () => {
  // plano 2000d: DC-399/DC-405 — dois campos novos: «roteiro» (Já configurei) e «lista» (a Lista do dia do celular aberta ou fechada)
  const novos = { roteiro: "mostrar", lista: null };
  assert.deepEqual(A.normalizarExtrasAgenda(null), { prof: "todos", fechados: "ocultar", atalhos: "ligados", ...novos });
  assert.deepEqual(A.normalizarExtrasAgenda({ prof: "x".repeat(81), fechados: "talvez", atalhos: 1 }), { prof: "todos", fechados: "ocultar", atalhos: "ligados", ...novos });
  assert.deepEqual(A.normalizarExtrasAgenda({ prof: "eu", fechados: "mostrar", atalhos: "desligados" }), { prof: "eu", fechados: "mostrar", atalhos: "desligados", ...novos });
  assert.equal(A.normalizarExtrasAgenda({ prof: "" }).prof, "todos");
});

test("CB-123 · «Escrever confirmação» / «Escrever aviso ao …» pelo vocabulário da vertical", () => {
  assert.equal(A.rotuloAvisar("confirmacao"), "Escrever confirmação");
  assert.equal(A.rotuloAvisar("desmarcacao"), "Escrever aviso ao paciente");
  assert.equal(A.rotuloAvisar("desmarcacao", vocabMod.vocab("oficina")), "Escrever aviso ao cliente");
  assert.equal(A.rotuloAvisar("desmarcacao", vocabMod.vocab("odonto")), "Escrever aviso ao paciente");
});

test("CB-124 · vinda da Conversa com `busca`: a janela já começa buscando o nome do contato", async () => {
  const janelas = [];
  const T = await montarAgenda({ data: futuraSeg(), modal: janelaAberta(janelas),
    rpc: async (n, p) => (n === "nx_buscar" ? { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", estagio_nome: "Nova", status: "aberto" }].filter(x => x.contato_nome.startsWith(p.p_q)) } : undefined) });
  try {
    A.marcarConsulta(T.ctx, { busca: "Mariana Costa" });
    await esperar(12);
    const corpo = janelas[0].o.corpo;
    assert.equal(corpo.querySelector('input[name="busca"]').value, "Mariana Costa");
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_buscar" && c.p.p_q === "Mariana Costa"));
    assert.equal(corpo.querySelectorAll(".agenda-resultado").length, 1);
    assert.equal(corpo.querySelector(".agenda-resultado").getAttribute("aria-selected"), "true", "o resultado já fica escolhido (Enter marca)");
  } finally { T.sair(); }
});

test("AB-206 · as regras rastc-* saíram de agenda.css (moram em relatorios.css, que a seção carrega)", () => {
  assert.doesNotMatch(cssAgenda, /rastc-/);
  assert.match(ler("relatorios.css"), /\.rastc-plataformas \{/);
  assert.match(ler("rastreio-config.js"), /carregarCss\("relatorios\.css"\)/);
});

/* ============================================================ plano 1000b · agenda-2 */
test("CB-145 · linha de serviço sem nome mas com a duração mexida avisa (e marca o nome)", async () => {
  const C = await montarConfig({ cfg: cfgValidaB });
  porTexto(C.alvo, "button", "Adicionar serviço").click();
  const linha = C.alvo.querySelectorAll(".agc-duracao").at(-1);
  linha.querySelector('input[type="number"]').value = "45";
  await enviarForm(C);
  assert.equal(C.reg.toasts.at(-1), "Informe o nome de cada serviço com duração própria.");
  assert.equal(linha.querySelector('input[type="text"]').getAttribute("aria-invalid"), "true");
  assert.ok(!C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
});

test("CB-147 / CB-252 · consulta sem fim conta a duração padrão no aviso do bloqueio", () => {
  const d = "2026-11-10";
  const c = [{ negocio_id: 1, nome: "Ana", inicio: `${d}T07:30:00-03:00` }];
  assert.equal(CFG.consultasNoBloqueio(c, { data: d, das: "08:00", ate: "10:00", duracao: 60 }).length, 1, "07:30 + 60 min cruza 08:00");
  assert.equal(CFG.consultasNoBloqueio(c, { data: d, das: "08:00", ate: "10:00", duracao: 30 }).length, 0, "07:30 + 30 min termina às 08:00");
  assert.equal(CFG.consultasNoBloqueio([{ inicio: `${d}T23:30:00-03:00` }], { data: d, das: "23:45", ate: "23:59", duracao: 60 }).length, 1, "passa da meia-noite: vale até 24:00");
});

test("CB-152 / CB-183 · toque: telefone do detalhe, chips da legenda e filtro com 44 px", () => {
  const toque = cssAgenda.slice(cssAgenda.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  assert.match(toque, /\.ag-det-tel \{ min-height: 44px; \}/);
  assert.match(toque, /\.ag-leg-chip, \.agenda-filtro-prof \{ min-height: 44px; \}/);
});

test("CB-154 · remover faixa, pausa ou serviço leva o foco à linha vizinha (ou ao «Adicionar…»)", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaB, horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"], ["13:00", "18:00"]] }, intervalos: [["12:00", "13:00"]], duracoes: { "Avaliação": 30 } } });
  const faixas = () => C.alvo.querySelectorAll('.agc-dia[data-dia="1"] .agc-faixa');
  faixas()[1].querySelector(".agc-remover").click();
  assert.equal(C.D.estado.ativo, faixas()[0].querySelector(".agc-remover"), "foco na faixa que ficou");
  C.alvo.querySelector(".agc-intervalos .agc-remover").click();
  assert.equal(C.D.estado.ativo, C.alvo.querySelector(".agc-add-intervalo"), "sem pausas: «Adicionar intervalo»");
  C.alvo.querySelector(".agc-duracao .agc-remover").click();
  assert.equal(C.D.estado.ativo.textContent, "Adicionar serviço");
  assert.equal(CFG.removerComFoco(null), null);
});

test("CB-157 · pausa inválida diz qual é e marca o campo", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaB, intervalos: [["12:00", "13:00"], ["15:00", "14:00"]] } });
  await enviarForm(C);
  assert.equal(C.reg.toasts.at(-1), "Pausa 2: o fim precisa ser depois do início.");
  const fim2 = C.alvo.querySelectorAll(".agc-intervalos .agc-faixa")[1].querySelectorAll("input")[1];
  assert.equal(fim2.getAttribute("aria-invalid"), "true");
  assert.equal(C.D.estado.ativo, fim2);
});

test("CB-159 · feriados bloqueados com Desfazer, que exclui só os criados", async () => {
  const desf = [];
  let id = 500;
  const C = await montarConfig({ cfg: cfgValidaB, modal: async () => true, uiExtra: { acaoComDesfazer: o => { desf.push(o); } },
    rpc: async n => (n === "nx_agenda_bloqueio_salvar" ? { ok: true, id: ++id, bloqueios: [] } : n === "nx_agenda_bloqueio_excluir" ? { ok: true, bloqueios: [] } : undefined) });
  C.alvo.querySelector(".agc-feriados").click();
  await esperar(40);
  const n = C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_salvar").length;
  assert.ok(n > 0);
  assert.equal(desf.length, 1);
  await desf[0].reverter();
  assert.deepEqual(C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_excluir").map(c => c.p.p_id), Array.from({ length: n }, (_, i) => 501 + i));
});

test("CB-161 · «Editar» abre o bloqueio preenchido e salva pelo id (sem criar outro)", async () => {
  assert.deepEqual(CFG.camposDoBloqueio({ inicio: "2026-11-10T12:00:00-03:00", fim: "2026-11-10T13:00:00-03:00", motivo: "Almoço" }),
    { data: "2026-11-10", data_fim: "", das: "12:00", ate: "13:00", motivo: "Almoço" });
  assert.deepEqual(CFG.camposDoBloqueio({ inicio: "2026-11-10T00:00:00-03:00", fim: "2026-11-13T00:00:00-03:00" }),
    { data: "2026-11-10", data_fim: "2026-11-12", das: "", ate: "", motivo: "" });
  const d = A.diaISO(hojeSP(), 10);
  let vistos = null;
  const C = await montarConfig({ cfg: cfgValidaB, bloqueios: [{ id: 42, inicio: `${d}T12:00:00-03:00`, fim: `${d}T13:00:00-03:00`, motivo: "Almoço" }],
    modal: async o => {
      vistos = { titulo: o.titulo, das: o.corpo.querySelector('[name="das"]').value, motivo: o.corpo.querySelector('[name="motivo"]').value };
      o.corpo.querySelector('[name="ate"]').value = "14:00";
      return primaria(o).fn(erroModal([]));
    } });
  C.alvo.querySelector(".agc-editar-bloqueio").click();
  await esperar(12);
  assert.deepEqual(vistos, { titulo: "Editar bloqueio", das: "12:00", motivo: "Almoço" });
  const salvo = C.reg.chamadas.find(c => c.nome === "nx_agenda_bloqueio_salvar");
  assert.deepEqual(salvo.p.p_bloqueio, { id: 42, data: d, das: "12:00", ate: "14:00", motivo: "Almoço" });
});

test("CB-163 · o detalhe da consulta é um diálogo com nome", async () => {
  const fut = A.diaISO(hojeSP(), 3);
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    assert.match(T.reg.popEls.at(-1).getAttribute("aria-label"), /^Consulta de Mariana Costa, .+ 10:00$/);
  } finally { T.sair(); }
});

test("CB-165 · os formatadores de data são do módulo (nenhum Intl.DateTimeFormat novo por rótulo)", () => {
  const Real = Intl.DateTimeFormat;
  let criados = 0;
  Intl.DateTimeFormat = function (...a) { criados++; return new Real(...a); };
  try {
    for (let d = 2; d <= 6; d++) A.rotuloProximaFora({ inicio: `${A.diaISO("2026-10-15", d)}T10:00:00-03:00` }, Date.parse("2026-10-15T13:00:00Z"), "2026-10-15");
    A.textoAnuncioPeriodo({ modo: "dia", de: "2026-10-20", dias: 1, n: 1 });
    A.nomeDoMes("2026-10-01");
  } finally { Intl.DateTimeFormat = Real; }
  assert.equal(criados, 0);
});

test("CB-167 · erro ao buscar horários tem «Tentar de novo»", async () => {
  let falhar = true;
  const { T, corpo } = await abrirMarcar({ rpc: async n => { if (n === "nx_agenda_livres" && falhar) throw Object.assign(new Error("fora"), { codigo: "fora" }); return undefined; } });
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    const bt = corpo.querySelector(".ag-tentar-horarios");
    assert.ok(bt, "o botão aparece com o erro");
    falhar = false;
    bt.click();
    await esperar(8);
    assert.ok(corpo.querySelector(".ag-hora-pill"), "os horários vieram");
  } finally { T.sair(); }
});

test("CB-169 · «Ver a partir de» não aceita data passada: vira hoje, com aviso", async () => {
  const { T, corpo } = await abrirMarcar();
  try {
    const data = corpo.querySelector('input[name="data"]');
    assert.equal(data.getAttribute("min"), hojeSP());
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    await esperar(6);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    T.reg.chamadas.length = 0;
    data.value = A.diaISO(hojeSP(), -3);
    data.dispatchEvent(T.D.evento("change"));
    await esperar(8);
    assert.equal(data.value, hojeSP());
    assert.equal(T.reg.chamadas.find(c => c.nome === "nx_agenda_livres").p.p_a_partir, hojeSP());
    assert.match(corpo.querySelector(".ag-info").textContent, /^Essa data já passou: mostrando a partir de hoje\./);
  } finally { T.sair(); }
});

test("CB-171 · busca sem nx_buscar lê os funis em paralelo (no máximo 4 ao mesmo tempo)", async () => {
  const funis = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, nome: `Funil ${i}` }));
  let agora = 0, pico = 0;
  const { T, corpo } = await abrirMarcar({ extra: { kitBase: { usuarios: [], funis } }, rpc: async (n, p) => {
    if (n === "nx_buscar") return { ok: true };
    if (n === "nx_negocios_kanban") {
      agora++; pico = Math.max(pico, agora); await dormir(5); agora--;
      return { colunas: [{ itens: [{ id: `${p.p_funil}-1`, titulo: `Mariana ${p.p_funil}`, status: "aberto" }] }] };
    }
    return undefined;
  } });
  try {
    digitar(T, corpo.querySelector('input[name="busca"]'), "Mar");
    // (integrador: espera até os 6 funis responderem, teto 2 s — os 80 ms fixos falhavam às vezes com a suíte em paralelo)
    for (let t = 0; t < 100 && corpo.querySelectorAll(".agenda-resultado b").length < 6; t++) await dormir(20);
    assert.equal(pico, 4);
    assert.deepEqual(corpo.querySelectorAll(".agenda-resultado b").map(b => b.textContent).slice(0, 3), ["Mariana f0", "Mariana f1", "Mariana f2"], "a ordem dos funis fica");
  } finally { T.sair(); }
});

test("CB-173 · o filtro de profissional tem rótulo visível «Profissional»", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { dono_id: "u1", dono_nome: "Dra. Ana" })] });
  try {
    const sel = T.alvo.querySelector(".agenda-filtro-prof");
    const rot = sel.closest(".agenda-filtro-prof-rot");
    assert.equal(rot.tagName, "LABEL");
    assert.match(rot.textContent, /^Profissional/);
    assert.equal(sel.getAttribute("aria-label"), null, "o nome é o texto visível");
  } finally { T.sair(); }
});

test("CB-175 / CB-268 · cores por profissional pela ordem: dois ids que colidem no hash ficam com cores diferentes", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `u${i}`);
  const a = ids[0], b = ids.find(x => x !== a && A.corDoResponsavel(x) === A.corDoResponsavel(a));
  assert.ok(b, "achou uma colisão no hash");
  const ordem = A.ordemProfissionais([{ dono_id: b }, { dono_id: a }, { dono_id: a }]);
  assert.deepEqual(ordem, [a, b].sort());
  assert.notEqual(A.corDoProfissional(a, ordem), A.corDoProfissional(b, ordem));
  assert.notEqual(A.corDoProfissional(a, ordem), 6, "6 é «sem responsável»");
  assert.equal(A.corDoProfissional("", ordem), 6);
  const k = A.corDaConsulta({ dono_id: b }, "profissional", {}, null, ordem);
  assert.equal(k.cor, A.corDoProfissional(b, ordem));
});

test("CB-179 · «Procurar paciente» lê cada ficha uma vez por janela e usa consulta_em da busca", async () => {
  const seg = futuraSeg(), dia = A.diaISO(seg, 2);
  const janelas = [];
  const rpc = async (n, p) => {
    if (n === "nx_buscar") return { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", status: "aberto" }, { id: 802, titulo: "Implante", contato_nome: "Mariana Lima", status: "aberto", consulta_em: `${dia}T11:00:00-03:00` }] };
    if (n === "nx_negocio_ver") return { negocio: { id: p.p_id, consulta_em: `${dia}T10:00:00-03:00` } };
    return undefined;
  };
  const T = await montarAgenda({ data: seg, rpc, modal: janelaAberta(janelas) });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(4);
    const inp = janelas[0].o.corpo.querySelector('input[name="paciente"]');
    for (const q of ["Mariana", "Mariana C"]) { inp.value = q; inp.dispatchEvent(T.D.evento("keydown", { key: "Enter" })); await esperar(12); }
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome === "nx_negocio_ver").map(c => c.p.p_id), [801], "uma leitura só, e só de quem não trouxe consulta_em");
    assert.equal(janelas[0].o.corpo.querySelectorAll(".ag-procurar-item").length, 2);
  } finally { T.sair(); }
});

test("CB-181 · «Data final» do bloqueio não oferece dia antes da inicial", async () => {
  const d = A.diaISO(hojeSP(), 5);
  let corpo = null;
  const C = await montarConfig({ cfg: cfgValidaB, modal: async o => { corpo = o.corpo; return null; } });
  porTexto(C.alvo, "button", "Bloquear horário").click();
  await esperar(4);
  const ini = corpo.querySelector('[name="data"]'), fim = corpo.querySelector('[name="data_fim"]');
  assert.equal(fim.getAttribute("min"), hojeSP());
  fim.value = A.diaISO(d, -1);
  ini.value = d;
  ini.dispatchEvent(C.D.evento("change"));
  assert.equal(fim.getAttribute("min"), d);
  assert.equal(fim.value, d, "a final antes da inicial vira a inicial");
});

test("CB-185 · sugestões de serviço mostram a duração («Avaliação · 30 min»)", async () => {
  const { T, corpo } = await abrirMarcar({ cfg: { duracao_min: 30, capacidade: 1, duracoes: { "Avaliação": 30, "Limpeza": 45 } } });
  try {
    const ops = corpo.querySelectorAll("datalist option");
    assert.deepEqual(ops.map(o => [o.value, o.getAttribute("label")]), [["Avaliação", "Avaliação · 30 min"], ["Limpeza", "Limpeza · 45 min"]]);
  } finally { T.sair(); }
});

test("CB-187 · «Agendamento até (dias à frente)» com exemplo", async () => {
  const C = await montarConfig({ cfg: cfgValidaB });
  assert.equal(C.reg.campos.find(o => o.nome === "dias_a_frente").ajuda, "Ex.: 30 = ninguém (nem a IA) marca para depois de 30 dias.");
});

test("CB-189 · a Agenda fala o vocabulário da empresa (oficina: orçamento, cliente)", async () => {
  const P = A.palavrasAgenda(vocabMod.vocab("oficina"));
  assert.equal(P.abrirNeg, "Abrir orçamento");
  assert.equal(A.palavrasAgenda().abrirNeg, "Abrir negócio", "sem vocabulário, o de sempre");
  const { T, corpo, conf } = await abrirMarcar({ extra: { vocab: vocabMod.vocab("oficina") }, novoNegocio: async () => {} });
  try {
    assert.match(corpo.textContent, /Buscar orçamento aberto/);
    assert.equal(corpo.querySelector(".agenda-resultados").getAttribute("aria-label"), "Orçamentos encontrados");
    assert.match(corpo.querySelector(".ag-novo-paciente").textContent, /Novo cliente/);
    assert.equal(corpo.querySelector(".ag-falta").textContent, "Escolha o orçamento.");
    assert.ok(conf);
  } finally { T.sair(); }
  const fut = A.diaISO(hojeSP(), 3);
  const D = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], vocab: vocabMod.vocab("loja") });
  try {
    D.alvo.querySelector(".ag-bloco").click();
    assert.equal(D.reg.pops.at(-1).querySelector(".ag-det-negocio").textContent, "Abrir venda");
  } finally { D.sair(); }
});

test("CB-193 · números da semana fora do Tab; W no dia focado abre a semana", () => {
  const D = criarDom();
  const abertas = [];
  const el = A.montarMiniCalendario({ h: D.h, mes: "2026-10-01", hoje: "2026-10-15", aoAbrirSemana: iso => abertas.push(iso) });
  assert.ok(el.querySelectorAll(".ag-mes-semana").every(b => b.getAttribute("tabindex") === "-1"));
  const dia = el.querySelector('.ag-mes-dia[data-iso="2026-10-15"]');
  dia.dispatchEvent(D.evento("keydown", { key: "w" }));
  assert.deepEqual(abertas, ["2026-10-12"]);
});

test("CB-198 · «Remover» bloqueio leva o foco ao bloqueio seguinte", async () => {
  const fut = A.diaISO(hojeSP(), 2);
  const bloqueios = [1, 2, 3].map(i => ({ id: i, inicio: `${A.diaISO(fut, i)}T08:00:00-03:00`, fim: `${A.diaISO(fut, i)}T09:00:00-03:00`, motivo: `B${i}` }));
  const C = await montarConfig({ cfg: cfgValidaB, bloqueios, uiExtra: { acaoComDesfazer: async o => { o.aplicar(); } } });
  porTexto(C.alvo.querySelectorAll(".agc-bloqueio")[1], "button", "Remover").click();
  await esperar(4);
  const itens = C.alvo.querySelectorAll(".agc-bloqueio");
  assert.equal(itens.length, 2);
  assert.equal(itens[1].dataset.id, "3");
  assert.ok(itens[1].contains(C.D.estado.ativo), "o foco está no bloqueio que veio para o lugar");
});

test("CB-200 · «Lembrar» sem conversa nenhuma: diz para começar pela Nova conversa (número da Meta: modelo)", async () => {
  const fut = A.diaISO(hojeSP(), 3);
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], rpc: contatoCom([]) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-lembrar").click();
    await esperar(12);
    assert.equal(T.reg.toasts.at(-1), A.avisoSemConversaAberta(false, true));
    assert.match(T.reg.toasts.at(-1), /^Sem conversa aberta: comece pela Nova conversa/);
  } finally { T.sair(); }
});

test("CB-202 · mudança não salva mostra a barra fixa com «Salvar»; salvar esconde", async () => {
  const C = await montarConfig({ cfg: cfgValidaB });
  const barra = C.alvo.querySelector(".agc-barra-sujo");
  assert.equal(barra.hidden, true);
  const cap = C.alvo.querySelector('input[name="capacidade"]');
  cap.value = "2";
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("input"));
  assert.equal(barra.hidden, false);
  assert.equal(barra.querySelector("button").getAttribute("type"), "submit");
  await enviarForm(C);
  assert.ok(C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
  assert.equal(barra.hidden, true);
});

test("CB-262 · pendentesDePresenca: passada sem marca entra; marcada, futura e concluída ficam de fora", () => {
  const d = "2026-10-14", agora = Date.parse("2026-10-15T13:00:00Z");
  const cs = [
    { negocio_id: 1, status: "aberto", presenca: null, inicio: `${d}T09:00:00-03:00` },
    { negocio_id: 2, status: "aberto", presenca: "faltou", inicio: `${d}T10:00:00-03:00` },
    { negocio_id: 3, status: "ganho", presenca: null, inicio: `${d}T11:00:00-03:00` },
    { negocio_id: 4, status: "aberto", presenca: null, inicio: "2026-10-16T09:00:00-03:00" },
  ];
  assert.deepEqual(A.pendentesDePresenca(cs, d, L, agora).map(c => c.negocio_id), [1]);
  assert.deepEqual(A.pendentesDePresenca(cs, "2026-10-16", L, agora), [], "futura não entra");
});

test("CB-264 · textoConfirmacao: saudação pelo nome (sem título nem telefone), amanhã e outro dia", () => {
  assert.equal(A.textoConfirmacao({ nome: "Dra. Helena Souza", servico: "Avaliação", inicio: "2026-10-16T10:00:00-03:00" }, "2026-10-15"),
    "Olá, Helena! Sua consulta (Avaliação) está marcada para amanhã às 10:00. Qualquer imprevisto, é só avisar por aqui.");
  assert.match(A.textoConfirmacao({ nome: "5512999990000", inicio: "2026-10-20T14:30:00-03:00" }, "2026-10-15"), /^Olá! Sua consulta está marcada para dia 20\/10 \(terça\) às 14:30\./);
});

/* ================================================================ revisão 1000b */
test("CB-175 (revisão 1000b) · a cor do profissional vem da equipe: trocar de semana (quem tem consulta muda) não troca a cor", () => {
  const equipe = ["u3", "u1", "u2"];
  const sem1 = A.ordemProfissionais([{ dono_id: "u2" }], equipe);
  const sem2 = A.ordemProfissionais([{ dono_id: "u1" }, { dono_id: "u2" }], equipe);
  assert.equal(A.corDoProfissional("u2", sem1), A.corDoProfissional("u2", sem2), "antes: u2 era o 1º numa semana e o 2º na outra");
  assert.deepEqual(sem1, ["u1", "u2", "u3"]);
  const cores = ["u1", "u2", "u3"].map(id => A.corDoProfissional(id, sem1));
  assert.equal(new Set(cores).size, 3, "dois da equipe nunca dividem a cor");
  // quem tem consulta e não está (mais) na equipe vai no fim, sem tirar a cor de ninguém
  const comEx = A.ordemProfissionais([{ dono_id: "u9" }, { dono_id: "u2" }], equipe);
  assert.deepEqual(comEx, ["u1", "u2", "u3", "u9"]);
  assert.equal(A.corDoProfissional("u2", comEx), A.corDoProfissional("u2", sem1));
  // sem a equipe (base ainda não lida), vale o período, como antes
  assert.deepEqual(A.ordemProfissionais([{ dono_id: "b" }, { dono_id: "a" }]), ["a", "b"]);
});
