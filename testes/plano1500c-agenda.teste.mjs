/* Plano «1500 melhorias, rodada C» · frente agenda (lotes agenda-c1 e agenda-c2, 21/10/2026). Sem rede, sem navegador: o mesmo DOM mínimo
   e a mesma tela montada do plano1000b-agenda (cópia das peças de apoio, com ui/api de mentira). Cada teste cita os itens (CC-xxx) e
   falharia no código de antes (função nova que não existia, texto ou comportamento novo). */
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
const L = await import("../web/app/crm-logica.js?v=p1500");
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


/* ============================================================ plano 1500c · contas puras */
const vocabMod = await import("../web/app/vocab.js");
const cssAgenda = ler("agenda.css");
const cfgValidaC = { duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30 };
const cfgSemanaC = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]] }, intervalos: [], duracao_min: 30, capacidade: 1 };
const k = (dia, de, ate, extra = {}) => ({ negocio_id: Math.floor(Math.random() * 1e6), nome: "X", inicio: `${dia}T${de}:00-03:00`, fim: `${dia}T${ate}:00-03:00`, status: "aberto", ...extra });

test("CC-169 / CC-283 · «lotado» é o pico ao mesmo tempo: 09:00–09:15 + 09:15–09:30 com capacidade 2 não lotam 09:00–09:30", () => {
  assert.equal(A.picoSimultaneo([{ ini: 540, fim: 555 }, { ini: 555, fim: 570 }], 540, 570), 1, "encadeadas não se somam");
  assert.equal(A.picoSimultaneo([{ ini: 540, fim: 570 }, { ini: 550, fim: 560 }], 540, 570), 2);
  assert.equal(A.picoSimultaneo([{ ini: 600, fim: 630 }], 540, 570), 0, "fora do trecho não conta");
  const dia = "2026-10-20";
  const consultas = [k(dia, "09:00", "09:15"), k(dia, "09:15", "09:30")];
  const config = { duracao_min: 30, capacidade: 2 };
  assert.equal(A.conflitoNoDestino({ iso: dia, min: 540, duracao: 30, consultas, config }), null, "sobra uma vaga em cada quarto de hora");
  const tres = [...consultas, k(dia, "09:05", "09:20")];
  assert.equal(A.conflitoNoDestino({ iso: dia, min: 540, duracao: 30, consultas: tres, config }).motivo, "lotado", "09:05–09:15 tem duas ao mesmo tempo");
});

test("CC-170 · o encaixe derivado usa o mesmo pico (vizinhas encadeadas não fazem a consulta virar encaixe)", () => {
  const dia = "2026-10-20";
  const eu = k(dia, "09:00", "09:30");
  const viz = [eu, k(dia, "09:00", "09:15"), k(dia, "09:15", "09:30")];
  assert.equal(A.classificarConsulta(eu, { duracao_min: 30, capacidade: 2 }, { iso: dia, vizinhas: viz }).encaixe, false);
  const viz2 = [eu, k(dia, "09:00", "09:20"), k(dia, "09:10", "09:30")];
  assert.equal(A.classificarConsulta(eu, { duracao_min: 30, capacidade: 2 }, { iso: dia, vizinhas: viz2 }).encaixe, true, "duas ao mesmo tempo + ela = acima de 2");
});

test("CC-171 · ocupação não conta falta nem o encaixe fora do expediente", () => {
  const dia = "2026-10-20";   // terça
  const cfg = { horario: { 2: [["08:00", "12:00"]] }, intervalos: [], duracao_min: 60, capacidade: 1 };
  const base = A.ocupacaoDoDia([k(dia, "08:00", "09:00")], dia, cfg);
  assert.equal(base.pct, .25);
  const comFalta = A.ocupacaoDoDia([k(dia, "08:00", "09:00"), k(dia, "09:00", "10:00", { presenca: "faltou" })], dia, cfg);
  assert.equal(comFalta.pct, .25, "a falta não ocupa a cadeira");
  const foraDoHorario = A.ocupacaoDoDia([k(dia, "08:00", "09:00"), k(dia, "20:00", "21:00")], dia, cfg);
  assert.equal(foraDoHorario.pct, .25, "o encaixe das 20h não enche a manhã");
});

test("CC-190 · com `ocupados` do servidor (clínica inteira, sem nomes) o lotado e a ocupação valem para o atendente restrito", () => {
  const dia = "2026-10-20";
  const cfg = { horario: { 2: [["08:00", "12:00"]] }, intervalos: [], duracao_min: 60, capacidade: 1 };
  const ocupados = [{ inicio: `${dia}T08:00:00-03:00`, fim: `${dia}T10:00:00-03:00` }];
  assert.equal(A.ocupacaoDoDia([], dia, cfg, [], { ocupados }).pct, .5, "o que ele não vê também ocupa");
  assert.equal(A.conflitoNoDestino({ iso: dia, min: 480, duracao: 60, consultas: [], config: cfg, ocupados }).motivo, "lotado");
  assert.equal(A.conflitoNoDestino({ iso: dia, min: 600, duracao: 60, consultas: [], config: cfg, ocupados }), null);
});

test("CC-168 / CC-286 · a Agenda aberta à noite percebe a virada do dia", () => {
  assert.equal(A.diaVirou("2026-10-20", "2026-10-21"), true);
  assert.equal(A.diaVirou("2026-10-20", "2026-10-20"), false);
  assert.equal(A.diaVirou(null, "2026-10-21"), false, "sem a data anterior não inventa virada");
});

test("CC-172 / CC-284 · «Ver mais 14 dias» respeita o limite da configuração (dias_a_frente), contado de hoje", () => {
  assert.equal(A.limiteDiasAgenda({ dias_a_frente: 30 }), 30);
  // plano 2000d: DC-397 — o teto passou a 366 (retorno semestral); sem configuração continua 180
  assert.equal(A.limiteDiasAgenda({ dias_a_frente: 999 }), 366);
  assert.equal(A.limiteDiasAgenda(null), 180);
  const hoje = "2026-10-21";
  assert.equal(A.podeVerMais({ janelaIni: hoje, janelaDias: 14, hoje, config: { dias_a_frente: 30 } }), true);
  assert.equal(A.podeVerMais({ janelaIni: hoje, janelaDias: 28, hoje, config: { dias_a_frente: 30 } }), true);
  assert.equal(A.podeVerMais({ janelaIni: hoje, janelaDias: 42, hoje, config: { dias_a_frente: 30 } }), false, "o próximo pedido já começaria depois do limite");
  assert.equal(A.textoLimiteDias({ dias_a_frente: 30 }), "A agenda abre até 30 dias à frente (Configurações › Agenda).");
});

test("CC-173 · data além do limite diz o limite, não «sem horário»", () => {
  assert.equal(A.avisoAlemDoLimite("2026-12-01", "2026-10-21", { dias_a_frente: 30 }), "A agenda só abre até 20/11.");
  assert.equal(A.avisoAlemDoLimite("2026-11-10", "2026-10-21", { dias_a_frente: 30 }), null);
});

test("CC-177 / CC-288 · o próximo dia de atendimento pula fim de semana e dia todo bloqueado", () => {
  const sex = "2026-10-23";
  assert.equal(A.proximoDiaAberto(cfgSemanaC, sex), "2026-10-26", "sexta → segunda");
  assert.equal(A.proximoDiaAberto(cfgSemanaC, sex, { passo: 7 }), "2026-10-30", "semana seguinte cai numa sexta aberta");
  const bloq = [{ id: 1, inicio: "2026-10-26T00:00:00-03:00", fim: "2026-10-27T00:00:00-03:00", motivo: "Feriado" }];
  assert.equal(A.proximoDiaAberto(cfgSemanaC, sex, { bloqueios: bloq }), "2026-10-27", "segunda bloqueada → terça");
  assert.equal(A.proximoDiaAberto({ duracao_min: 30 }, sex), "2026-10-24", "sem horário configurado: o dia seguinte mesmo");
});

test("CC-200 / CC-201 · horários por período e os atalhos «Hoje à tarde» e «Próxima semana»", () => {
  const s = (dia, hh, livre = true) => ({ dia, min: Number(hh.slice(0, 2)) * 60 + Number(hh.slice(3)), inicio: `${dia}T${hh}:00-03:00`, livre });
  const per = A.periodosDoDia([s("x", "09:00"), s("x", "13:00"), s("x", "19:00"), s("x", "11:30")]);
  assert.deepEqual(per.map(p => [p.rotulo, p.itens.length]), [["Manhã", 2], ["Tarde", 1], ["Noite", 1]]);
  assert.deepEqual(A.periodosDoDia([s("x", "14:00")]).map(p => p.rotulo), ["Tarde"], "só os períodos com horário");
  const hoje = "2026-10-21";   // quarta
  const grupos = [{ dia: hoje, itens: [s(hoje, "10:00"), s(hoje, "14:00")] }, { dia: "2026-10-22", itens: [s("2026-10-22", "09:00")] }, { dia: "2026-10-27", itens: [s("2026-10-27", "08:00")] }];
  assert.equal(A.hojeATarde(grupos, hoje).inicio, `${hoje}T14:00:00-03:00`);
  assert.equal(A.proximaSemana(grupos, hoje).inicio, "2026-10-27T08:00:00-03:00", "a partir da segunda que vem");
  assert.equal(A.hojeATarde([{ dia: hoje, itens: [s(hoje, "10:00")] }], hoje), null);
});

test("CC-203 · serviço digitado com erro sugere o cadastrado parecido", () => {
  assert.equal(A.servicoParecido("Avalição", ["Avaliação", "Limpeza"]), "Avaliação");
  assert.equal(A.servicoParecido("avaliacao", ["Avaliação"]), null, "igual (sem acento) não sugere");
  assert.equal(A.servicoParecido("Clareamento", ["Avaliação", "Limpeza"]), null, "longe demais");
});

test("CC-293 / CC-325 · «Procurar paciente» confere até 30 negócios (abertos e ganhos) antes de cortar em 8", () => {
  const muitos = Array.from({ length: 40 }, (_, i) => ({ id: i, status: i === 3 ? "perdido" : i % 5 === 0 ? "ganho" : "aberto" }));
  const c = A.escolherCandidatos(muitos);
  assert.equal(c.length, 30);
  assert.ok(c.some(n => n.status === "ganho"), "ganhos também (a consulta pode estar num tratamento concluído)");
  assert.ok(!c.some(n => n.status === "perdido"));
  assert.ok(c.some(n => n.id >= 9), "além dos 8 primeiros");
});

test("CC-248 · a releitura compara uma assinatura curta (não o JSON inteiro) e ela muda quando a tela mudaria", () => {
  const r = { consultas: [{ negocio_id: 1, inicio: "a", fim: "b", status: "aberto" }], bloqueios: [], config: { capacidade: 1 } };
  const a1 = A.assinaturaAgenda(r);
  assert.equal(A.assinaturaAgenda(JSON.parse(JSON.stringify(r))), a1, "mesma resposta, mesma assinatura");
  assert.notEqual(A.assinaturaAgenda({ ...r, consultas: [{ ...r.consultas[0], presenca: "faltou" }] }), a1, "presença nova muda");
  assert.notEqual(A.assinaturaAgenda({ ...r, bloqueios: [{ id: 9, inicio: "x", fim: "y" }] }), a1, "bloqueio novo muda");
  assert.ok(a1.length < 20);
});

test("CC-228 / CC-227 · telefone vira link no primeiro toque e o WhatsApp do aparelho abre com o texto", () => {
  assert.equal(A.telLocal("(12) 99999-1234"), "tel:+5512999991234");
  assert.equal(A.telLocal("123"), null);
  assert.equal(A.linkWhatsAppAgenda("12 99999-1234", "Olá, Ana!"), "https://wa.me/5512999991234?text=Ol%C3%A1%2C%20Ana!");
  assert.equal(A.linkWhatsAppAgenda("99"), null);
});

test("CC-256 · taxa de faltas das consultas que já passaram", () => {
  const agora = Date.parse("2026-10-21T12:00:00-03:00");
  const t = A.taxaFaltas([k("2026-10-20", "09:00", "09:30", { presenca: "faltou" }), k("2026-10-20", "10:00", "10:30"), k("2026-10-25", "10:00", "10:30", { presenca: "faltou" })], agora);
  // plano 2000d: DC-269 — a que passou sem marcação não conta como «compareceu»: fica fora da conta e aparece em sem_marca
  assert.deepEqual(t, { faltas: 1, de: 1, pct: 1, sem_marca: 1 }, "a futura não entra");
  assert.equal(A.taxaFaltas([k("2026-10-25", "10:00", "10:30")], agora), null);
});

test("CC-258 · CSV do período com «;», BOM e aspas quando precisa", () => {
  const csv = A.csvDaAgenda([k("2026-10-20", "10:00", "10:30", { nome: "Ana; Souza", servico: "Avaliação", presenca: "compareceu", dono_id: "u1" }), k("2026-10-20", "08:00", "08:30", { nome: "Bia" })], { nomes: { u1: "Dra. Helena" } });
  assert.equal(csv.codePointAt(0), 0xfeff, "o Excel lê os acentos");
  const linhas = csv.slice(1).trim().split("\r\n");
  // plano 1500c: GX-006 acrescentou a coluna «Fim» depois da «Hora»
  // plano 2000d: DC-382 acrescentou «Telefone» e «Observação» no fim
  // plano 2000d · GY-022: a coluna «Confirmada» entrou no fim do cabeçalho
  assert.equal(linhas[0], "Data;Hora;Fim;Paciente;Serviço;Profissional;Presença;Origem;Telefone;Observação;Confirmada");
  assert.ok(linhas[1].startsWith("20/10/2026;08:00;08:30;Bia;"), "em ordem de horário");
  assert.ok(linhas[2].startsWith('20/10/2026;10:00;10:30;"Ana; Souza";Avaliação;Dra. Helena;Compareceu'));
});

test("CC-261 · texto da lista do dia para compartilhar", () => {
  const dia = "2026-10-22";
  const t = A.textoCompartilharDia([k(dia, "10:00", "10:30", { nome: "Bia", servico: "Limpeza" }), k(dia, "08:00", "08:30", { nome: "Ana" })], dia, "2026-10-21");
  assert.match(t, /^Amanhã · /);
  assert.deepEqual(t.split("\n").slice(1), ["08:00 Ana", "10:00 Bia (Limpeza)"]);
  assert.match(A.textoCompartilharDia([], dia, "2026-10-21"), /sem consultas\.$/);
});

test("CC-294 · a última consulta no «Procurar paciente»", () => {
  assert.equal(A.textoUltimaConsulta("2026-09-12T10:00:00-03:00", "compareceu"), "Última: 12/09 (compareceu)");
  assert.equal(A.textoUltimaConsulta("2026-09-12T10:00:00-03:00"), "Última: 12/09");
  assert.equal(A.textoUltimaConsulta(null), "");
});

test("CC-205 / CC-289 / CC-210 · textos ao paciente na palavra da vertical e com o nome em caixa alta arrumado", () => {
  const vocab = vocabMod.vocab("oficina");
  assert.ok(vocab.compromisso, "o vocabulário tem a palavra do compromisso");
  const c = { nome: "MARIA SOUZA", servico: "Revisão", inicio: "2026-10-22T10:00:00-03:00" };
  const hoje = "2026-10-21";
  assert.equal(A.primeiroNomeAgenda("MARIA SOUZA"), "Maria");
  assert.equal(A.primeiroNomeAgenda("Ana"), "Ana");
  const pal = A.palavraCompromisso(vocab);
  assert.notEqual(pal, "consulta", "oficina não diz «consulta»");
  assert.equal(A.textoLembrete(c, hoje, { vocab }), `Olá, Maria! Passando para lembrar da sua ${pal} (Revisão) amanhã às 10:00. Podemos confirmar?`);
  assert.match(A.textoConfirmacao(c, hoje, { vocab }), new RegExp(`^Olá, Maria! Sua ${pal} \\(Revisão\\) está marcada para amanhã às 10:00\\.`));
  assert.match(A.textoDesmarcacao(c, hoje, { vocab }), new RegExp(`Sua ${pal} \\(Revisão\\) de amanhã às 10:00 foi desmarcada`));
  assert.equal(A.palavraCompromisso(null), "consulta");
});

test("CC-206 · lembrete com o nome e o endereço da empresa", () => {
  const c = { nome: "Ana Lima", servico: "Avaliação", inicio: "2026-10-22T10:00:00-03:00" };
  assert.equal(A.textoLembrete(c, "2026-10-21", { empresa: "Clínica Sorriso", endereco: "Rua A, 10 — Centro" }),
    // plano 2000d: DC-298/DC-299 — «Aqui é de» (sem artigo) e o endereço em frase própria
    "Olá, Ana! Aqui é de Clínica Sorriso. Lembrando da sua consulta (Avaliação) amanhã às 10:00. Endereço: Rua A, 10 — Centro. Podemos confirmar?");
});

test("CC-207 · aviso de desmarcação diz o serviço", () => {
  assert.equal(A.textoDesmarcacao({ nome: "Rafael Souza", servico: "Limpeza", inicio: "2026-10-22T10:00:00-03:00" }, "2026-10-21"),
    "Olá, Rafael! Sua consulta (Limpeza) de amanhã às 10:00 foi desmarcada. Quer escolher um novo horário?");
});

test("CC-178 / CC-223 · textos de remarcação e de falta", () => {
  assert.equal(A.textoRemarcacao({ nome: "Ana", inicio: "2026-10-22T15:00:00-03:00" }, "2026-10-21"), "Olá, Ana! Sua consulta foi remarcada para amanhã às 15:00. Se não puder, é só avisar por aqui.");
  assert.equal(A.textoFalta({ nome: "Ana", servico: "Avaliação", inicio: "2026-10-21T09:00:00-03:00" }, "2026-10-21"), "Olá, Ana! Sentimos sua falta na consulta (Avaliação) de hoje. Vamos remarcar? Me diga o melhor dia e horário.");
  assert.match(A.textoFalta({ nome: "Ana", inicio: "2026-10-20T09:00:00-03:00" }, "2026-10-21"), /de ontem\./);
});

test("CC-208 / CC-322 · motivos pela vertical e «Prefiro não dizer» (escolha que não vira motivo)", () => {
  assert.deepEqual(A.motivosDesmarcar(null), [...A.MOTIVOS_DESMARCAR]);
  const oficina = { vertical: "oficina", contato: "Cliente", min: x => x };
  assert.deepEqual(A.motivosDesmarcar(oficina), ["Cliente cancelou", "Vai remarcar", "Erro de marcação", "A empresa cancelou"]);
  assert.equal(A.motivoDesmarcar("Cliente cancelou", "", A.motivosDesmarcar(oficina)), "Cliente cancelou");
  assert.equal(A.motivoDesmarcar(A.MOTIVO_SEM, ""), null);
  assert.equal(A.motivoDesmarcar(A.MOTIVO_SEM, "viajou"), "viajou");
});

test("CC-300 · N abre «Marcar consulta» pelo teclado", () => {
  assert.equal(A.acaoTeclaAgenda({ key: "n" }), "marcar");
  assert.equal(A.acaoTeclaAgenda({ key: "N", ctrlKey: true }), null, "Ctrl+N é do navegador");
});

test("CC-302 / CC-303 · painel diz «Amanhã»/«Ontem» e o dia sem consulta é «Sem consultas» (não «vazio»)", () => {
  const { h } = criarDom();
  const sub = iso => A.montarPainelDia({ h, iso, consultas: [], config: null, hoje: "2026-10-21", pode: true, horaBR: x => x.slice(11, 16), num: String }).querySelector(".ag-painel-sub").textContent;
  assert.equal(sub("2026-10-22"), "Amanhã");
  assert.equal(sub("2026-10-20"), "Ontem");
  assert.equal(A.textoResumoDia({ total: 0 }), "Sem consultas");
  assert.equal(A.textoResumoDia({ total: 0 }, { futuro: true, livre: true }), "Livre");
});

test("CC-174 / CC-175 / CC-287 / CC-304 · visão Lista: dia bloqueado e dia fechado sem «Marcar»; passado sem consulta não é «livre»", () => {
  const { h } = criarDom();
  const hoje = "2026-10-21";
  const qui = "2026-10-22", sab = "2026-10-24", ontem = "2026-10-20";
  const bloq = [{ id: 1, inicio: `${qui}T00:00:00-03:00`, fim: "2026-10-23T00:00:00-03:00", motivo: "Congresso" }];
  const el = A.montarListaDias({ h, dias: [ontem, qui, sab, "2026-10-23"], hoje, config: cfgSemanaC, bloqueios: bloq, pode: true, aoMarcar() {} });
  const sec = iso => el.querySelector(`.ag-lista-dia[data-iso="${iso}"]`);
  assert.equal(sec(qui).querySelector(".ag-lista-livre"), null, "bloqueado: sem «Livre · Marcar»");
  assert.match(sec(qui).querySelector(".ag-lista-bloq").textContent, /Congresso/);
  assert.equal(sec(qui).querySelector(".ag-lista-tit small").textContent, "bloqueado");
  assert.equal(sec(sab).querySelector(".ag-lista-livre"), null, "sábado fechado: sem «Marcar»");
  assert.equal(sec(sab).querySelector(".ag-lista-fechado-txt").textContent, "Fechado neste dia");
  assert.equal(sec(ontem).querySelector(".ag-lista-tit small").textContent, "sem consultas", "ontem não é «livre»");
  assert.ok(sec("2026-10-23").querySelector(".ag-lista-livre"), "sexta aberta continua com «Livre · Marcar»");
});

test("CC-264 / CC-265 · mês: os nomes ao passar o mouse e o bloqueio de meio dia", () => {
  const { h } = criarDom();
  const dia = "2026-10-22";
  const consultas = Array.from({ length: 6 }, (_, i) => k(dia, `${String(8 + i).padStart(2, "0")}:00`, `${String(8 + i).padStart(2, "0")}:30`, { nome: `P${i}` }));
  const bloq = [{ id: 1, inicio: "2026-10-23T13:00:00-03:00", fim: "2026-10-23T18:00:00-03:00", motivo: "Tarde livre" }];
  const el = A.montarMiniCalendario({ h, mes: "2026-10", consultas, bloqueios: bloq, config: cfgSemanaC, hoje: "2026-10-21", aoEscolher() {} });
  const b = el.querySelector(`[data-iso="${dia}"]`);
  assert.equal(b.getAttribute("title"), "08:00 P0 · 09:00 P1 · 10:00 P2 · 11:00 P3 · 12:00 P4 e mais 1");
  assert.equal(b.getAttribute("aria-description"), b.getAttribute("title"));
  const sex = el.querySelector('[data-iso="2026-10-23"]');
  assert.ok(sex.classList.contains("ag-mes-parcial"));
  assert.match(sex.getAttribute("aria-label"), /bloqueio parcial/);
  assert.equal(A.bloqueioParcial(bloq, "2026-10-23"), true);
  assert.equal(A.diaTodoBloqueado(bloq, "2026-10-23"), false);
});

/* ============================================================ configuração: bloqueios, feriados, horário */
test("CC-166 / CC-167 / CC-285 · bloqueio de vários dias COM horário vira um por dia, e o aviso conta os mesmos dias", () => {
  const p = CFG.bloqueiosDoPeriodo({ data: "2026-11-02", data_fim: "2026-11-04", das: "14:00", ate: "18:00", motivo: "Curso" });
  assert.deepEqual(p, ["2026-11-02", "2026-11-03", "2026-11-04"].map(d => ({ data: d, das: "14:00", ate: "18:00", motivo: "Curso" })));
  assert.deepEqual(CFG.bloqueiosDoPeriodo({ data: "2026-11-02", data_fim: "2026-11-04" }), [{ data: "2026-11-02", data_fim: "2026-11-04", motivo: null }], "dia inteiro: um só, com data_fim");
  assert.equal(CFG.bloqueiosDoPeriodo({ data: "2026-01-01", data_fim: "2026-12-31", das: "08:00", ate: "09:00" }).length, 62, "no máximo 62");
  const consultas = [k("2026-11-02", "15:00", "15:30"), k("2026-11-03", "15:00", "15:30"), k("2026-11-04", "09:00", "09:30")];
  const avisadas = CFG.consultasNoBloqueio(consultas, { data: "2026-11-02", data_fim: "2026-11-04", das: "14:00", ate: "18:00" });
  const bloqueadas = consultas.filter(c => p.some(b => CFG.consultasNoBloqueio([c], b).length));
  assert.deepEqual(avisadas, bloqueadas, "o aviso bate com o que é gravado");
});

test("CC-185 · feriados gravados com no máximo 4 pedidos ao mesmo tempo (não um por um)", async () => {
  let ativos = 0, pico = 0;
  const feitos = [];
  const r = await CFG.emParalelo([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async x => { ativos++; pico = Math.max(pico, ativos); await new Promise(res => setTimeout(res, 2)); feitos.push(x); ativos--; if (x === 5) throw new Error("falhou"); });
  assert.equal(pico, 4);
  assert.equal(r, 4);
  assert.equal(feitos.length, 9, "um erro não para os outros");
});

test("CC-296 / CC-297 · bloqueio de mais de 1 ano e o limite de 500 em português claro", () => {
  assert.equal(CFG.bloqueioLongoDemais("2026-11-01", "2027-11-03"), true);
  assert.equal(CFG.bloqueioLongoDemais("2026-11-01", "2027-10-31"), false);
  assert.match(CFG.mensagemBloqueio({ codigo: "limite_atingido" }), /500 bloqueios/);
  assert.equal(CFG.mensagemBloqueio({ codigo: "dados_invalidos", hint: "data_fim" }), "O bloqueio pode ter no máximo 1 ano.");
  assert.equal(CFG.mensagemBloqueio({ codigo: "outro" }), null);
});

test("CC-230 · mudar o horário avisa das consultas que ficam fora", () => {
  const consultas = [k("2026-10-26", "09:00", "09:30", { nome: "Ana" }), k("2026-10-26", "17:30", "18:30", { nome: "Bia" }), k("2026-10-31", "10:00", "10:30", { nome: "Caio" })];
  const fora = CFG.consultasForaDoHorario(consultas, { 1: [["08:00", "18:00"]] });
  assert.deepEqual(fora.map(c => c.nome), ["Bia", "Caio"], "passa das 18h e sábado fechado");
});

test("CC-233 · feriados de SP e da cidade entram na lista, sem repetir", () => {
  const sem = CFG.feriadosParaBloquear("2026-06-01");
  assert.ok(!sem.some(f => f.data === "2026-07-09"));
  const sp = CFG.feriadosParaBloquear("2026-06-01", [], { estado: "SP", cidade: { md: "12-05", nome: "Aniversário de Taubaté" } });
  assert.ok(sp.some(f => f.data === "2026-07-09" && /SP/.test(f.nome)));
  assert.ok(sp.some(f => f.data === "2026-12-05" && f.nome === "Aniversário de Taubaté"));
  const datas = sp.map(f => f.data);
  assert.equal(new Set(datas).size, datas.length, "sem datas repetidas");
});

/* ============================================================ CSS: alvos de toque e a janela sem rolagem própria */
test("CC-211 / CC-212 / CC-213 / CC-214 / CC-215 / CC-216 · alvos de 44 px no toque e campos de hora com 16 px", () => {
  const bloco = cssAgenda.slice(cssAgenda.indexOf("/* ---------------- plano 1500c (frente agenda)"));
  assert.ok(bloco.length > 100, "o bloco do plano 1500c existe");
  const toque = bloco.slice(bloco.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  for (const re of [/\.ag-movel \.ag-item \{ min-height: 44px; \}/, /\.ag-mais-bt \{ min-height: 44px; \}/, /\.ag-livre \{ min-height: 44px; \}/, /\.ag-dia-abrir \{ min-height: 44px; \}/,
    /\.agenda-atualizar \{ min-height: 44px; \}/, /\.ag-mes-nav \{ width: 44px; height: 44px; \}/, /\.agc-faixa input, \.agc-duracao input \{ min-height: 44px; font-size: var\(--fs-16\); \}/]) assert.match(toque, re);
});

test("CC-200 / CC-217 · os horários e os resultados não ficam numa caixinha com rolagem própria no celular", () => {
  assert.doesNotMatch(cssAgenda, /\.ag-horas \{[^}]*max-height/);
  assert.match(cssAgenda, /@media \(max-width: 760px\) \{\s*\.agenda-resultados \{ max-height: none; overflow: visible; \}/);
  assert.match(cssAgenda, /\.ag-serv-chips \{ display: none;[^}]*\}\s*@media \(pointer: coarse\) \{ \.ag-serv-chips \{ display: flex; \} \}/, "CC-204: chips só no toque");
  assert.match(cssAgenda, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ag-tv, \.ag-bloq-bt/, "as peças novas param com movimento reduzido");
});

/* ============================================================ plano 1500c · a tela montada */
const proxDia = (iso, n) => A.diaISO(iso, n);

test("CC-165 / CC-282 / CC-209 · o «+» de cada dia tem nome acessível (na palavra da vertical) e title", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg });
  try {
    const mais = T.alvo.querySelectorAll(".ag-dia-mais");
    assert.equal(mais.length, 7);
    for (const b of mais) {
      assert.match(b.getAttribute("aria-label") || "", /^Marcar consulta em /, "cada «+» diz o que faz e o dia");
      assert.equal(b.getAttribute("title"), "Marcar consulta neste dia");
    }
  } finally { T.sair(); }
  const vocab = vocabMod.vocab("oficina");
  const V = await montarAgenda({ data: seg, vocab });
  try {
    const pal = A.palavraCompromisso(vocab);
    assert.match(V.alvo.querySelector(".ag-dia-mais").getAttribute("aria-label"), new RegExp(`^Marcar ${pal} em `));
  } finally { V.sair(); }
});

test("CC-220 · a instrução das colunas é dita uma vez (aria-describedby), não no nome de cada dia", async () => {
  const T = await montarAgenda({ data: futuraSeg() });
  try {
    const cols = T.alvo.querySelectorAll(".ag-col");
    const id = cols[0].getAttribute("aria-describedby");
    assert.ok(id, "aponta para a instrução");
    assert.ok(cols.every(c => c.getAttribute("aria-describedby") === id), "a mesma para todas");
    assert.ok(cols.every(c => !/Enter/.test(c.getAttribute("aria-label"))), "o nome é só o dia");
    const instr = T.alvo.querySelector(`[id="${id}"]`);
    assert.ok(instr && /Page Up/.test(instr.textContent));
  } finally { T.sair(); }
});

test("CC-219 · PageDown anda 1 h e End vai ao fim do expediente na coluna", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: cfgSemana });
  try {
    const col = T.alvo.querySelectorAll(".ag-col")[0];
    const rot = () => (T.alvo.querySelector(".ag-cursor-rot") || {}).textContent;
    col.dispatchEvent(T.D.evento("keydown", { key: "ArrowDown", target: col }));
    assert.equal(rot(), "08:00", "começa na 1ª faixa");
    col.dispatchEvent(T.D.evento("keydown", { key: "PageDown", target: col }));
    assert.equal(rot(), "09:00");
    col.dispatchEvent(T.D.evento("keydown", { key: "End", target: col }));
    assert.equal(rot(), "17:30", "o último horário que cabe antes das 18:00");
    col.dispatchEvent(T.D.evento("keydown", { key: "Home", target: col }));
    assert.equal(rot(), "08:00");
  } finally { T.sair(); }
});

test("CC-176 / CC-332 · celular: dia fechado diz «Fechado» e leva ao próximo de atendimento; a faixa marca o dia todo bloqueado", async () => {
  const seg = futuraSeg(), dom = proxDia(seg, 6), qua = proxDia(seg, 2);
  const bloqueios = [{ id: 5, inicio: `${qua}T00:00:00-03:00`, fim: `${proxDia(qua, 1)}T00:00:00-03:00`, motivo: "Feriado" }];
  const T = await montarAgenda({ data: dom, movel: true, cfg: cfgSemana, bloqueios });
  try {
    assert.equal(T.alvo.querySelector(".ag-dia-painel button.ag-livre"), null, "domingo fechado não vira «Livre · Marcar»");
    const fech = T.alvo.querySelector(".ag-dia-fechado");
    assert.match(fech.textContent, /Fechado neste dia/);
    assert.ok(fech.querySelector(".ag-prox-aberto"), "oferece o próximo dia de atendimento");
    const dQua = T.alvo.querySelector(`.ag-faixa-d[data-iso="${qua}"]`);
    assert.ok(dQua.classList.contains("bloqueado"));
    assert.match(dQua.getAttribute("aria-label"), /bloqueado/);
  } finally { T.sair(); }
});

test("CC-263 / CC-262 · a faixa de dias do celular tem setas de semana", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, movel: true });
  try {
    const prox = T.alvo.querySelector(".ag-faixa-caixa .ag-faixa-sem-prox");
    assert.ok(prox && T.alvo.querySelector(".ag-faixa-caixa .ag-faixa-sem-ant"));
    prox.click();
    await esperar(10);
    assert.equal(T.alvo.querySelector('.ag-faixa [aria-selected="true"]').dataset.iso, proxDia(seg, 7), "› leva à semana seguinte");
    // deslizar para a esquerda no dia troca para o dia seguinte
    const painel = T.alvo.querySelector(".ag-dia-painel");
    painel.dispatchEvent(T.D.evento("touchstart", { touches: [{ clientX: 300, clientY: 200 }] }));
    painel.dispatchEvent(T.D.evento("touchend", { changedTouches: [{ clientX: 100, clientY: 205 }] }));
    await esperar(10);
    assert.equal(T.alvo.querySelector('.ag-faixa [aria-selected="true"]').dataset.iso, proxDia(seg, 8));
  } finally { T.sair(); }
});

test("CC-180 / CC-301 · consulta concluída não remarca nem desmarca; «Desmarcar» fica separado das outras ações", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00"), consultaEm(seg, "14:00", { negocio_id: 802, status: "ganho" })] });
  try {
    T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco').click();
    const det = T.reg.pops.at(-1);
    assert.ok(det.querySelector(".ag-det-perigo .ag-det-desmarcar"), "Desmarcar numa linha própria");
    assert.equal(det.querySelector(".ag-det-acoes .ag-det-desmarcar"), null, "não colado em Remarcar");
    T.alvo.querySelector('.ag-item[data-negocio="802"] .ag-bloco').click();
    const det2 = T.reg.pops.at(-1);
    assert.equal(det2.querySelector(".ag-det-remarcar"), null);
    assert.equal(det2.querySelector(".ag-det-desmarcar"), null);
  } finally { T.sair(); }
});

test("CC-218 / CC-177 · os atalhos de remarcar também no desktop, com o dia real (pula o fim de semana)", async () => {
  const seg = futuraSeg(), sex = proxDia(seg, 4);
  const T = await montarAgenda({ data: seg, cfg: cfgSemanaC, consultas: [consultaEm(sex, "10:00")] });   // sábado e domingo fechados
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const det = T.reg.pops.at(-1);
    const am = det.querySelector(".ag-det-amanha");
    assert.ok(am, "desktop também tem «Dia seguinte»");
    assert.match(am.textContent, /^Próximo dia/, "sábado e domingo fechados: diz o dia real");
    assert.match(am.getAttribute("aria-label"), /às 10:00$/);
    am.click();
    await esperar(8);
    assert.equal(T.reg.modais.at(-1).titulo, "Remarcar consulta?");
    assert.equal(T.reg.modais.at(-1).corpo.querySelector(".ag-remarcar-para b").textContent, `${A.rotuloDoDia(proxDia(sex, 3), T.hoje)} 10:00`, "segunda, no mesmo horário");
  } finally { T.sair(); }
});

test("CC-178 · remarcar pela confirmação oferece escrever o aviso ao paciente", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: cfgSemana, consultas: [consultaEm(seg, "10:00", { marco: "agendada" })],
    modal: async o => (o.titulo === "Remarcar consulta?" ? primaria(o).fn(erroModal([])) : null),
    rpc: async n => (n === "nx_agenda_marcar" ? { ok: true, remarcada: true } : undefined) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-amanha").click();
    await esperar(16);
    const av = T.reg.desfazer.at(-1);
    assert.match(av.texto, /^Remarcada para /);
    assert.ok(av.acao && /aviso|Escrever/i.test(av.acao.rotulo), "o aviso tem a ação de escrever ao paciente");
  } finally { T.sair(); }
});

test("CC-179 · «Lembrar» no número da Meta com a janela de 24 h fechada copia e manda usar o modelo", async () => {
  const fut = futuraSeg();
  const velho = new Date(Date.now() - 48 * 3600e3).toISOString();
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")],
    rpc: async n => (n === "nx_contato_ver" ? { conversas: [{ id: 901, status: "aberta", provedor: "meta", ultima_entrada_em: velho }] } : undefined) });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-lembrar").click();
    await esperar(12);
    assert.match(T.reg.toasts.at(-1), /^Fora das 24 h do número da Meta/);
    assert.equal(T.rascunho.texto("conversa:901"), null, "não deixa texto livre no campo travado");
    assert.equal(T.reg.copiados.length, 1);
  } finally { T.sair(); }
});

test("CC-227 / CC-228 · sem Conversas, o detalhe tem o WhatsApp do aparelho; o telefone é link desde o 1º toque", async () => {
  const fut = futuraSeg();
  const T = await montarAgenda({ data: fut, comConversas: false, consultas: [consultaEm(fut, "10:00", { telefone: "12999991234" })] });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    const det = T.reg.pops.at(-1);
    const wa = det.querySelector(".ag-det-wa");
    assert.ok(wa, "link do WhatsApp");
    assert.match(wa.getAttribute("href"), /^https:\/\/wa\.me\/5512999991234\?text=/);
    assert.match(det.querySelector(".ag-det-tel").getAttribute("href"), /^tel:\+?55?12999991234|^tel:/);
  } finally { T.sair(); }
});

test("CC-221 · tocar de novo em «Compareceu» pergunta antes de limpar", async () => {
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, modo: "dia", consultas: [consultaEm(pas, "10:00", { presenca: "compareceu" })],
    rpc: async (n, p) => (n === "nx_agenda_presenca" ? { ok: true, presenca: p.p_estado === "limpar" ? null : p.p_estado } : undefined) });
  try {
    const perguntas = [];
    T.ctx.ui.confirmar = async o => { perguntas.push(o.titulo); return false; };
    T.reg.chamadas.length = 0;
    T.alvo.querySelector(".ag-pres-compareceu").click();
    await esperar(8);
    assert.deepEqual(perguntas, ["Limpar a presença?"]);
    assert.ok(!T.reg.chamadas.some(c => c.nome === "nx_agenda_presenca"), "disse não: nada é gravado");
  } finally { T.sair(); }
});

test("CC-222 / CC-223 · «Faltou» oferece «Remarcar»; quem faltou ganha «Escrever: remarcar» no detalhe", async () => {
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, modo: "dia", consultas: [consultaEm(pas, "10:00", { presenca: null })],
    rpc: async (n, p) => (n === "nx_agenda_presenca" ? { ok: true, presenca: p.p_estado } : n === "nx_negocio_ver" ? { negocio: { estagio_id: "s1" } } : undefined) });
  try {
    T.alvo.querySelector(".ag-pres-faltou").click();
    await esperar(10);
    assert.equal(T.reg.desfazer.at(-1).acao.rotulo, "Remarcar");
    T.dados.consultas[0].presenca = "faltou";
    T.alvo.querySelector(".agenda-atualizar").click();
    await esperar(10);
    T.alvo.querySelector(".ag-bloco").click();
    assert.ok(T.reg.pops.at(-1).querySelector(".ag-det-falta"), "«Escrever: remarcar»");
  } finally { T.sair(); }
});

test("CC-224 / CC-182 · presença em lote: caixa desmarcada grava «Faltou»; até 4 ao mesmo tempo", async () => {
  const pas = passadaSeg();
  const consultas = [0, 1, 2, 3, 4, 5].map(i => consultaEm(pas, `${String(9 + i).padStart(2, "0")}:00`, { negocio_id: 900 + i, nome: `P${i}`, presenca: null }));
  let ativos = 0, pico = 0;
  const T = await montarAgenda({ data: pas, modo: "dia", consultas,
    modal: async o => { if (/Compareceu/.test(o.titulo)) { o.corpo.querySelectorAll(".ag-lote-chk")[1].checked = false; return true; } return null; },
    rpc: async (n, p) => { if (n === "nx_agenda_presenca") { ativos++; pico = Math.max(pico, ativos); await new Promise(r => setTimeout(r, 3)); ativos--; return { ok: true }; } return undefined; } });
  try {
    T.reg.chamadas.length = 0;
    T.alvo.querySelector(".ag-pres-lote").click();
    await esperar(40);
    const pres = T.reg.chamadas.filter(c => c.nome === "nx_agenda_presenca").map(c => [c.p.p_negocio, c.p.p_estado]);
    assert.equal(pres.length, 6);
    assert.deepEqual(pres.find(x => x[0] === 901), [901, "faltou"]);
    assert.ok(pico > 1 && pico <= 4, `em paralelo, no máximo 4 (pico ${pico})`);
    assert.match(T.reg.desfazer.at(-1).texto, /5 «Compareceu» e 1 «Faltou»/);
  } finally { T.sair(); }
});

test("CC-181 · Desfazer do lote não para no primeiro erro e diz quem não voltou", async () => {
  const pas = passadaSeg();
  const consultas = [0, 1, 2].map(i => consultaEm(pas, `${String(9 + i).padStart(2, "0")}:00`, { negocio_id: 950 + i, nome: `Q${i}`, presenca: null }));
  const T = await montarAgenda({ data: pas, modo: "dia", consultas, modal: async () => true,
    rpc: async (n, p) => { if (n === "nx_agenda_presenca") { if (p.p_estado === "limpar" && p.p_negocio === 950) throw new Error("falhou"); return { ok: true }; } return undefined; } });
  try {
    T.alvo.querySelector(".ag-pres-lote").click();
    await esperar(20);
    T.reg.chamadas.length = 0;
    await T.reg.desfazer.at(-1).reverter();
    await esperar(6);
    const limpos = T.reg.chamadas.filter(c => c.nome === "nx_agenda_presenca" && c.p.p_estado === "limpar").map(c => c.p.p_negocio).sort();
    assert.deepEqual(limpos, [950, 951, 952], "tenta todas");
    assert.ok(T.reg.toasts.some(t => /^Não voltaram: Q0/.test(t)));
  } finally { T.sair(); }
});

test("CC-225 / CC-226 · a linha do dia tem ligar, conversa e «Lembrar» (amanhã), que vira «Lembrado»", async () => {
  const amanha = A.diaISO(hojeSP(), 1);
  const T = await montarAgenda({ data: amanha, modo: "dia", consultas: [consultaEm(amanha, "15:00", { telefone: "12999991234" })],
    rpc: async n => (n === "nx_contato_ver" ? { conversas: [{ id: 901, status: "aberta" }] } : undefined) });
  try {
    const li = T.alvo.querySelector('.ag-painel-li[data-negocio="801"]');
    const rap = li.querySelector(".ag-li-rapidas");
    assert.ok(rap, "atalhos na linha");
    assert.ok(rap.querySelector(".ag-li-tel"), "ligar");
    assert.ok(rap.querySelector(".ag-li-conversa"), "conversa");
    const lemb = rap.querySelector(".ag-li-lembrar");
    assert.ok(lemb, "lembrar (consulta de amanhã)");
    lemb.click();
    await esperar(14);
    assert.ok(T.alvo.querySelector('.ag-painel-li[data-negocio="801"] .ag-li-lembrado'), "a linha mostra «Lembrado»");
  } finally { T.sair(); }
});

test("CC-187 / CC-189 · «Ir para» foca o «+N» que esconde a consulta; filtro de profissional escondendo diz de quem é", async () => {
  const seg = futuraSeg();
  // 4 concluídas às 10:00 e a próxima (aberta) às 10:10, que cai no «+N»
  const consultas = [0, 1, 2, 3].map(i => consultaEm(seg, "10:00", { negocio_id: 700 + i, nome: `N${i}`, status: "ganho" })).concat([consultaEm(seg, "10:10", { negocio_id: 799, nome: "Próxima", fim: `${seg}T10:40:00-03:00` })]);
  const T = await montarAgenda({ data: seg, consultas, cfg: { duracao_min: 30, capacidade: 5 } });
  try {
    const mais = T.alvo.querySelector(".ag-item.ag-mais");
    assert.ok(mais, "4+ juntas viram «+N»");
    assert.ok(String(mais.dataset.mais).split(",").includes("799"), "a próxima está escondida no «+N»");
    T.alvo.querySelector("button.agenda-proxima").click();
    assert.ok(T.D.estado.ativo && T.D.estado.ativo.classList.contains("ag-mais-bt"), "o foco vai para o «+N» que a esconde");
  } finally { T.sair(); }
  // filtro «Minha agenda» e a consulta é da Ana: «Ver todos»
  const fut = futuraSeg(), dia2 = A.diaISO(fut, 9);
  const T2 = await montarAgenda({ data: fut, conta: "u1", prefsExtra: { prof: "eu" },
    consultas: [consultaEm(fut, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(dia2, "11:00", { negocio_id: 802, dono_id: "u2", dono_nome: "Ana Paula" })],
    rpc: async n => (n === "nx_buscar" ? { negocios: [{ id: 802, titulo: "X", contato_nome: "Rafael", status: "aberto", consulta_em: `${dia2}T11:00:00-03:00` }] } : undefined),
    modal: async (o, D) => { if (o.titulo && /^Procurar/.test(o.titulo)) { const inp = o.corpo.querySelector("input"); inp.value = "Rafael"; let fechar; const p = new Promise(r => { fechar = r; }); o.aoAbrir({ fechar }); inp.dispatchEvent(D.evento("keydown", { key: "Enter" })); await esperar(10); porTexto(o.corpo, "button", "Ir para").click(); return p; } return null; } });
  try {
    T2.alvo.querySelector(".agenda-procurar").click();
    await esperar(30);
    const t = T2.reg.toasts.at(-1);
    assert.match(String(t), /Está na agenda de Ana Paula/);
  } finally { T2.sair(); }
});

test("CC-188 · «Ir para» na visão Mês abre o dia (não fica no mês sem bloco)", async () => {
  const fut = futuraSeg(), dia2 = A.diaISO(fut, 9);
  const T = await montarAgenda({ data: fut, modo: "mes", consultas: [consultaEm(dia2, "11:00", { negocio_id: 802 })],
    rpc: async n => (n === "nx_buscar" ? { negocios: [{ id: 802, titulo: "X", contato_nome: "Rafael", status: "aberto", consulta_em: `${dia2}T11:00:00-03:00` }] } : undefined),
    modal: async (o, D) => { if (o.titulo && /^Procurar/.test(o.titulo)) { const inp = o.corpo.querySelector("input"); inp.value = "Rafael"; let fechar; const p = new Promise(r => { fechar = r; }); o.aoAbrir({ fechar }); inp.dispatchEvent(D.evento("keydown", { key: "Enter" })); await esperar(10); porTexto(o.corpo, "button", "Ir para").click(); return p; } return null; } });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(30);
    assert.equal(JSON.parse(T.storage.get(T.chave)).modo, "dia");
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"]'), "o dia com o bloco");
  } finally { T.sair(); }
});

test("CC-293 / CC-294 / CC-325 · «Procurar paciente» acha a consulta além dos 8 primeiros e mostra a última de quem não tem futura", async () => {
  const fut = futuraSeg();
  const negocios = Array.from({ length: 12 }, (_, i) => ({ id: 600 + i, titulo: `T${i}`, contato_nome: `Pessoa ${i}`, status: "aberto", consulta_em: null }));
  negocios[11].consulta_em = `${A.diaISO(fut, 2)}T10:00:00-03:00`;
  negocios[3].consulta_em = "2026-09-12T10:00:00-03:00";
  let corpo = null;
  const T = await montarAgenda({ data: fut, rpc: async n => (n === "nx_buscar" ? { negocios } : undefined),
    modal: async (o, D) => { if (o.titulo && /^Procurar/.test(o.titulo)) { corpo = o.corpo; const inp = o.corpo.querySelector("input"); inp.value = "Pessoa"; o.aoAbrir({ fechar() {} }); inp.dispatchEvent(D.evento("keydown", { key: "Enter" })); await esperar(16); } return null; } });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(24);
    assert.ok(porTexto(corpo, ".ag-procurar-item", "Pessoa 11"), "a do 12º resultado aparece");
    const ult = corpo.querySelector(".ag-procurar-ultima");
    assert.ok(ult && /Última: 12\/09/.test(ult.textContent));
  } finally { T.sair(); }
});

test("CC-191 / CC-192 / CC-330 · o filtro e as colunas usam a equipe; filtro preso em quem saiu volta para «todos»", async () => {
  const seg = futuraSeg();
  const kitBase = { usuarios: [{ id: "u1", nome: "Dra. Helena", papel: "admin" }, { id: "u2", nome: "Ana Paula", papel: "atendente" }, { id: "u3", nome: "Dr. Caio", papel: "atendente" }, { id: "u4", nome: "Só Lê", papel: "leitura" }] };
  const consultas = [consultaEm(seg, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(seg, "10:00", { negocio_id: 802, dono_id: "u2", dono_nome: "Ana Paula" })];
  const T = await montarAgenda({ data: seg, modo: "dia", consultas, kitBase, prefsExtra: { agrupar: "responsavel" } });
  try {
    await esperar(8);
    const ops = T.alvo.querySelector(".agenda-filtro-prof").querySelectorAll("option").map(o => o.textContent);
    assert.ok(ops.includes("Dr. Caio"), "quem está sem consulta também aparece");
    assert.ok(!ops.includes("Só Lê"), "somente leitura não atende");
    const nomes = T.alvo.querySelectorAll(".ag-dono-nome").map(e => e.textContent);
    assert.ok(nomes.includes("Dr. Caio"), "coluna de quem está livre no dia");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: seg, consultas, kitBase, prefsExtra: { prof: "u9" } });
  try {
    await esperar(10);
    assert.ok(T2.reg.toasts.some(t => /não está mais na equipe/.test(t)));
    assert.equal(JSON.parse(T2.storage.get(T2.chave)).prof, "todos");
  } finally { T2.sair(); }
});

test("CC-268 · quem atende (não admin) e tem consultas abre na «Minha agenda» na 1ª vez", async () => {
  const seg = futuraSeg();
  const consultas = [consultaEm(seg, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(seg, "11:00", { negocio_id: 802, dono_id: "u2", dono_nome: "Ana Paula" })];
  const T = await montarAgenda({ data: seg, consultas, conta: "u2", papel: "atendente" });
  try {
    assert.deepEqual(T.alvo.querySelectorAll(".ag-item").map(i => i.dataset.negocio), ["802"]);
    assert.equal(JSON.parse(T.storage.get(T.chave)).prof, "eu");
  } finally { T.sair(); }
  const A2 = await montarAgenda({ data: seg, consultas, conta: "u2", papel: "admin" });
  try { assert.equal(A2.alvo.querySelectorAll(".ag-item").length, 2, "o admin continua vendo todos"); } finally { A2.sair(); }
});

test("CC-252 / CC-253 · «Próximo livre» à vista e «Encaixar agora» na semana de hoje", async () => {
  const hoje = hojeSP();
  const T = await montarAgenda({ data: A.segundaDe(hoje), rpc: async (n, p) => (n === "nx_agenda_livres" ? livres([1], hoje) : undefined) });
  try {
    await esperar(8);
    const pl = T.alvo.querySelector(".agenda-prox-livre");
    assert.ok(pl, "o próximo horário livre aparece no resumo");
    assert.match(pl.getAttribute("aria-label"), /^Próximo horário livre: /);
    assert.ok(T.alvo.querySelector(".agenda-encaixar-agora"), "supervisor+ encaixa quem chegou");
  } finally { T.sair(); }
  const L2 = await montarAgenda({ data: A.segundaDe(hoje), papel: "atendente" });
  try { assert.equal(L2.alvo.querySelector(".agenda-encaixar-agora"), null, "atendente não encaixa"); } finally { L2.sair(); }
});

test("CC-256 / CC-324 · resumo com a taxa de faltas e as marcadas pela IA", async () => {
  const pas = passadaSeg();
  const T = await montarAgenda({ data: pas, consultas: [consultaEm(pas, "09:00", { presenca: "faltou" }), consultaEm(pas, "10:00", { negocio_id: 802, marcado_por: "ia" })] });
  try {
    // plano 2000d: DC-269 — a das 10:00 sem marcação fica fora da taxa e é contada à parte
    assert.match(T.alvo.querySelector(".agenda-resumo-faltas").textContent, /^Faltas: 100% \(1 de 1\) \(1 sem marcação\)/);
    assert.match(T.alvo.querySelector(".agenda-resumo-ia").textContent, /1 marcada pela IA/);
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"] .ag-bloco-ia'), "o bloco da IA tem o ícone");
  } finally { T.sair(); }
});

test("CC-258 / CC-260 / CC-266 / CC-323 · exportar, imprimir a semana, filtrar por nome e a tela da recepção", async () => {
  const hoje = hojeSP(), seg = A.segundaDe(hoje);
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(hoje, "23:00", { nome: "Bianca" }), consultaEm(hoje, "23:30", { negocio_id: 802, nome: "Rafael", servico: "Limpeza" })] });
  try {
    assert.ok(T.alvo.querySelector(".agenda-exportar"));
    const filtro = T.alvo.querySelector(".agenda-filtro-nome");
    filtro.value = "rafa";
    filtro.dispatchEvent(T.D.evento("input", { target: filtro }));
    await dormir(150);     // plano 2000d: DC-359 — o filtro espera 120 ms sem digitar
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="801"]').classList.contains("ag-filtrado"));
    assert.ok(!T.alvo.querySelector('.ag-item[data-negocio="802"]').classList.contains("ag-filtrado"));
    T.alvo.querySelector(".agenda-imprimir-semana").click();
    assert.equal(T.reg.impressoes, 1);
    T.alvo.querySelector(".agenda-tv").click();
    const tv = globalThis.document.body.querySelector(".ag-tv");
    assert.ok(tv, "a tela da recepção abre");
    assert.equal(tv.querySelectorAll(".ag-tv-lista li").length, 2);
    assert.match(tv.querySelector(".ag-tv-lista li").textContent, /Bianca$/);
    tv.querySelector(".ag-tv-fechar").click();
    assert.equal(globalThis.document.body.querySelector(".ag-tv"), null);
  } finally { T.sair(); }
});

test("CC-237 · primeira carga sem internet diz que é a conexão", async () => {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  try {
    const T = await montarAgenda({ data: futuraSeg(), rpc: async n => { if (n === "nx_agenda_dia") throw new Error("Failed to fetch"); return undefined; } });
    try {
      const card = T.alvo.querySelector(".ag-sem-rede");
      assert.ok(card, "cartão de sem internet");
      assert.match(card.textContent, /Sem internet/);
      assert.ok(card.querySelector(".ag-sem-rede-tentar"));
    } finally { T.sair(); }
  } finally { if (antes) Object.defineProperty(globalThis, "navigator", antes); else delete globalThis.navigator; }
});

test("CC-249 · com a aba escondida o tique não redesenha; a volta da aba redesenha o que ficou pendente", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00"), consultaEm(seg, "10:00", { negocio_id: 802, nome: "Rafael" })] });
  try {
    globalThis.document.hidden = true;
    T.dados.consultas[0].status = "ganho";            // a «Próxima» muda: o tique redesenharia
    const antes = T.alvo.querySelector(".agenda-resumo");
    for (const f of T.reg.intervalos) f();
    await esperar(4);
    assert.equal(T.alvo.querySelector(".agenda-resumo"), antes, "nada redesenhado com a aba escondida");
    globalThis.document.hidden = false;
    for (const f of T.ouv.get("visibilitychange") || []) f();
    await esperar(4);
    assert.notEqual(T.alvo.querySelector(".agenda-resumo"), antes, "a volta da aba redesenha");
    assert.match(T.alvo.querySelector("button.agenda-proxima").textContent, /Rafael/);
  } finally { globalThis.document.hidden = false; T.sair(); }
});

test("CC-280 / CC-281 · bloqueio na grade: o período escrito no bloco e, para o admin, um botão que edita", async () => {
  const seg = futuraSeg();
  const bloqueios = [{ id: 7, inicio: `${seg}T12:00:00-03:00`, fim: `${seg}T13:00:00-03:00`, motivo: "Reunião" }];
  const T = await montarAgenda({ data: seg, cfg: cfgSemana, bloqueios, modal: async o => { T.ultimoModal = o; return null; } });
  try {
    const bl = T.alvo.querySelector(".ag-bloq");
    assert.equal(bl.querySelector(".ag-bloq-periodo").textContent, "12:00–13:00");
    const bt = bl.querySelector(".ag-bloq-bt");
    assert.ok(bt);
    bt.click();
    await esperar(6);
    assert.equal(T.reg.modais.at(-1).titulo, "Editar bloqueio");
    assert.ok(T.reg.modais.at(-1).acoes.some(a => a && a.rotulo === "Remover bloqueio"));
  } finally { T.sair(); }
  const L2 = await montarAgenda({ data: seg, cfg: cfgSemana, bloqueios, papel: "atendente" });
  try { assert.equal(L2.alvo.querySelector(".ag-bloq-bt"), null, "atendente só vê"); } finally { L2.sair(); }
});

test("CC-229 · «Bloquear horário» pela grade fecha o dia inteiro", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, cfg: cfgSemana, papel: "admin",
    modal: async o => { if (o.titulo === "Bloquear horário") { o.corpo.querySelector(".ag-bloq-dia-todo").checked = true; return primaria(o).fn(erroModal([])); } if (o.aoAbrir) { const reg = []; const el = { querySelector: () => null }; } return null; },
    rpc: async n => (n === "nx_agenda_bloqueio_salvar" ? { ok: true, id: 3 } : undefined) });
  try {
    // o «Bloquear este horário» vem da janela de marcar com dia e hora (aoBloquear); aqui chamamos pelo clique no vazio → janela → botão
    const col = clicarNoVazio(T, .3);
    await esperar(8);
    const janela = T.reg.modais.find(m => m.titulo && /^Marcar/.test(m.titulo));
    if (janela) {
      const bt = janela.corpo.querySelector(".ag-bloquear-horario");
      assert.ok(bt, "admin tem «Bloquear este horário»");
      bt.click();
      await esperar(10);
      const salvo = T.reg.chamadas.find(c => c.nome === "nx_agenda_bloqueio_salvar");
      assert.ok(salvo, "gravou");
      assert.equal(salvo.p.p_bloqueio.das, undefined, "dia inteiro: sem das/até");
      assert.equal(salvo.p.p_bloqueio.data, A.partesSP(`${seg}T12:00:00-03:00`).dia);
    } else assert.fail("a janela de marcar não abriu");
  } finally { T.sair(); }
});

test("CC-270 / CC-239 / CC-240 / CC-245 / CC-246 · desmarcadas do dia, «Confirmada», observação e última nota da linha", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, modo: "dia", consultas: [consultaEm(seg, "10:00", { obs: "Trazer exames" }), consultaEm(seg, "11:00", { negocio_id: 802, confirmada_em: "2026-10-20T10:00:00Z", ultima_nota: "Prefere manhã" })],
    rpc: async (n, p, d) => {
      if (n === "nx_agenda_dia") return { config: d.cfg, consultas: d.consultas.filter(c => naData(c, p.p_data, p.p_dias)), bloqueios: [], desmarcadas: [{ nome: "Lia", inicio: `${seg}T15:00:00-03:00`, motivo: "Viajou" }] };
      if (n === "nx_agenda_confirmar") return { ok: true, confirmada_em: new Date().toISOString() };
      return undefined;
    } });
  try {
    const desm = T.alvo.querySelector(".ag-desmarcadas");
    assert.ok(desm && /1 desmarcada/.test(desm.textContent));
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"] .ag-bloco-conf'), "o bloco confirmado tem o selo");
    T.reg.chamadas.length = 0;
    T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco').click();
    await esperar(4);
    const det = T.reg.pops.at(-1);
    assert.equal(det.querySelector(".ag-det-nota").textContent, "Observação: Trazer exames");
    assert.ok(!T.reg.chamadas.some(c => c.nome === "nx_negocio_ver"), "a obs veio na linha: não lê a ficha");
    det.querySelector(".ag-det-confirmar").click();
    await esperar(8);
    assert.deepEqual(T.reg.chamadas.find(c => c.nome === "nx_agenda_confirmar").p, { p_negocio: 801, p_inicio: `${seg}T10:00:00-03:00` });
    T.alvo.querySelector('.ag-item[data-negocio="802"] .ag-bloco').click();
    await esperar(4);
    const det2 = T.reg.pops.at(-1);
    assert.ok(det2.querySelector(".ag-det-confirmada"));
    assert.equal(det2.querySelector(".ag-det-confirmar"), null, "já confirmada");
  } finally { T.sair(); }
});

test("CC-305 / CC-306 · horário padrão: o admin vai direto configurar e a empresa nova ganha o roteiro", async () => {
  const T = await montarAgenda({ data: futuraSeg(), cfg: { duracao_min: 30, capacidade: 1, horario_fonte: "padrao" } });
  try {
    const link = T.alvo.querySelector(".agenda-fonte-link");
    assert.ok(link && link.getAttribute("href") === "#/config/agenda");
    const rot = T.alvo.querySelector(".ag-roteiro");
    assert.ok(rot && /3 passos/.test(rot.textContent));
    rot.querySelector(".ag-roteiro-ir").click();
    assert.deepEqual(T.reg.navegou, ["#/config/agenda"]);
  } finally { T.sair(); }
});

test("CC-327 / CC-251 · mês do celular: erro tem «Tentar de novo» e o mês seguinte é pedido antes", async () => {
  const seg = futuraSeg();
  let falhar = true;
  const T = await montarAgenda({ data: seg, movel: true, rpc: async (n, p) => { if (n === "nx_agenda_dia" && p.p_dias >= 28 && falhar) throw new Error("rede"); return undefined; },
    modal: async o => { T.mesModal = o; if (o.aoAbrir) o.aoAbrir({ fechar() {} }); return null; } });
  try {
    T.alvo.querySelector(".agenda-mes-bt").click();
    await esperar(12);
    const corpo = T.reg.modais.at(-1).corpo;
    const tentar = corpo.querySelector(".ag-mes-tentar");
    assert.ok(tentar, "erro com «Tentar de novo»");
    falhar = false;
    T.reg.chamadas.length = 0;
    tentar.click();
    await esperar(12);
    const meses = T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_dias >= 28).map(c => c.p.p_data);
    assert.ok(meses.length >= 2, "relê o mês e já pede o seguinte");
  } finally { T.sair(); }
});

test("CC-328 / CC-329 · «Atualizar» relê a última nota e a equipe", async () => {
  const seg = futuraSeg();
  let invalidou = 0;
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { dono_id: "u1" })], rpc: async n => (n === "nx_negocio_ver" ? { notas: [{ texto: "nota" }] } : undefined) });
  try {
    T.ctx.carregar = async () => ({ invalidarBase() { invalidou++; }, kit: async () => ({ base: { usuarios: [{ id: "u1", nome: "Dra. Helena" }] } }) });
    await esperar(6);
    T.alvo.querySelector(".ag-bloco").click();
    await esperar(4);
    T.alvo.querySelector(".agenda-atualizar").click();
    await esperar(12);
    T.reg.chamadas.length = 0;
    T.alvo.querySelector(".ag-bloco").click();
    await esperar(6);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_negocio_ver"), "a nota é relida depois do «Atualizar»");
    assert.ok(invalidou >= 1, "a base do CRM é esquecida e relida");
  } finally { T.sair(); }
});

test("CC-331 · desmarcar para quem só vê a agenda explica (antes nada acontecia)", async () => {
  const toasts = [];
  await A.desmarcarConsulta({ pode: () => false, ui: { toast: t => toasts.push(t) } }, consultaEm(futuraSeg(), "10:00"));
  assert.match(toasts[0], /só permite ver a agenda/);
});

test("CC-322 / CC-208 · desmarcar exige um motivo (ou «Prefiro não dizer»)", async () => {
  const seg = futuraSeg();
  const erros = [];
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")], rpc: async n => (n === "nx_agenda_desmarcar" ? { ok: true } : undefined),
    modal: async o => { if (o.titulo !== "Desmarcar consulta") return null; const r1 = await primaria(o).fn(erroModal(erros)); assert.equal(r1, false); o.corpo.querySelectorAll(".ag-motivo-chip").find(b => b.textContent === A.MOTIVO_SEM).click(); return primaria(o).fn(erroModal(erros)); } });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-desmarcar").click();
    await esperar(10);
    assert.match(erros[0], /Escolha um motivo/);
    assert.deepEqual(T.reg.chamadas.find(c => c.nome === "nx_agenda_desmarcar").p, { p_negocio: 801, p_motivo: null });
  } finally { T.sair(); }
});

test("CC-300 · N na tela abre «Marcar consulta»", async () => {
  const T = await montarAgenda({ data: futuraSeg(), modal: async o => { T.aberto = o.titulo; return null; } });
  try {
    for (const f of T.ouv.get("keydown") || []) f({ key: "n", target: globalThis.document.body, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false });
    await esperar(6);
    assert.ok(T.reg.modais.some(m => /^Marcar/.test(m.titulo)));
    assert.equal(T.alvo.querySelector(".agenda-marcar").getAttribute("aria-keyshortcuts"), "N");
  } finally { T.sair(); }
});

/* ============================================================ plano 1500c · janela «Marcar» */
const livresCom = (de, extra = []) => ({ duracao_min: 30, horarios: [
  { inicio: `${de}T09:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 },
  { inicio: `${de}T10:00:00-03:00`, livre: false, capacidade: 1, ocupados: 1 },
  { inicio: `${de}T14:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 },
  { inicio: `${de}T19:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 }, ...extra] });

async function escolherNaBusca(T, corpo, texto = "Mar") {
  const inp = corpo.querySelector('input[name="busca"]');
  inp.value = texto;
  inp.dispatchEvent(T.D.evento("input", { target: inp }));
  await esperar(8);
  return inp;
}

test("CC-197 / CC-198 · a busca mostra o final do telefone e «Já atendidos» com «Marcar retorno»", async () => {
  const criados = [];
  const { T, corpo } = await abrirMarcar({ novoNegocio: async (dados, o) => { criados.push(dados); o.aoCriar({ id: 990, titulo: "Retorno", contato_id: dados.contato_id }); },
    rpc: async (n, p) => {
      if (n === "nx_buscar") return { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", telefone: "12 99999-4321", status: "aberto" }, { id: 805, titulo: "Limpeza", contato_nome: "Mariana Lima", contato_id: 77, status: "ganho" }] };
      return undefined;
    } });
  try {
    await escolherNaBusca(T, corpo, "Mari");
    assert.match(corpo.querySelector(".agenda-resultado small").textContent, /final 4321/);
    const ja = corpo.querySelector(".ag-ja-atendidos");
    assert.ok(ja && /Mariana Lima/.test(ja.textContent));
    ja.querySelector(".ag-retorno-bt").click();
    await esperar(10);
    assert.deepEqual(criados, [{ contato_id: 77, nome: "Mariana Lima" }]);
    assert.match(corpo.querySelector(".agenda-escolhido").textContent, /Retorno/, "o negócio novo já fica escolhido");
  } finally { T.sair(); }
});

test("CC-199 · vindo da busca, «Confirmar» espera a ficha (o aviso de remarcação aparece antes)", async () => {
  let soltar;
  const ficha = new Promise(r => { soltar = r; });
  const { T, corpo, conf } = await abrirMarcar({ rpc: async n => (n === "nx_negocio_ver" ? (await ficha, { negocio: { id: 801, consulta_em: `${A.diaISO(hojeSP(), 5)}T10:00:00-03:00` } }) : undefined) });
  try {
    await escolherNaBusca(T, corpo);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    assert.equal(conf.getAttribute("aria-disabled"), "true", "ainda conferindo a ficha");
    assert.match(corpo.querySelector(".ag-falta").textContent, /Conferindo/);
    soltar();
    await esperar(8);
    assert.equal(conf.getAttribute("aria-disabled"), "false");
    assert.match(corpo.textContent, /Ao confirmar, ela será remarcada/);
  } finally { T.sair(); }
});

test("CC-200 / CC-299 / CC-318 / CC-320 · horários por período, lotado à vista (o supervisor encaixa num toque) e pílula com o dia no nome", async () => {
  const { T, corpo } = await abrirMarcar({ rpc: async (n, p) => (n === "nx_agenda_livres" ? livresCom(p.p_a_partir) : undefined) });
  try {
    await escolherNaBusca(T, corpo);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(10);
    const pers = corpo.querySelectorAll(".ag-horas-per").map(g => g.getAttribute("aria-label"));
    assert.deepEqual(pers, ["Manhã", "Tarde", "Noite"]);
    const pill = corpo.querySelector(".ag-hora-pill:not(.ag-hora-lotada)");
    assert.match(pill.getAttribute("aria-label"), /^.+, 09:00, 1 vaga$/, "o dia vem no nome");
    const lot = corpo.querySelector(".ag-hora-lotada");
    assert.ok(lot && /lotado/.test(lot.textContent), "o lotado aparece");
    lot.click();
    assert.equal(corpo.querySelector('input[name="encaixe"]').checked, true, "escolher o lotado liga o encaixe");
    assert.match(corpo.querySelector(".ag-info").textContent, /encaixe/);
  } finally { T.sair(); }
  const L2 = await abrirMarcar({ papel: "atendente", rpc: async (n, p) => (n === "nx_agenda_livres" ? livresCom(p.p_a_partir) : undefined) });
  try {
    await escolherNaBusca(L2.T, L2.corpo);
    L2.corpo.querySelector(".agenda-resultado").click();
    await esperar(10);
    assert.equal(L2.corpo.querySelector(".ag-hora-lotada").tagName, "SPAN", "atendente só vê o lotado");
  } finally { L2.T.sair(); }
});

test("CC-202 · retorno em 7/15/30 dias troca a data e relê os horários", async () => {
  const { T, corpo } = await abrirMarcar();
  try {
    await escolherNaBusca(T, corpo);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    T.reg.chamadas.length = 0;
    corpo.querySelector('.ag-retorno[data-dias="15"]').click();
    await esperar(8);
    assert.equal(corpo.querySelector('input[name="data"]').value, A.diaISO(hojeSP(), 15));
    assert.equal(T.reg.chamadas.find(c => c.nome === "nx_agenda_livres").p.p_a_partir, A.diaISO(hojeSP(), 15));
  } finally { T.sair(); }
});

test("CC-204 / CC-203 / CC-321 · serviços em chips, «Quis dizer…?» e digitar o serviço relê os horários", async () => {
  const cfg = { duracao_min: 30, capacidade: 1, duracoes: { "Avaliação": 30, Limpeza: 45 } };
  const { T, corpo } = await abrirMarcar({ cfg });
  try {
    const chips = corpo.querySelectorAll(".ag-serv-chip").map(b => b.textContent);
    assert.deepEqual(chips, ["Avaliação", "Limpeza"]);
    await escolherNaBusca(T, corpo);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(8);
    const serv = corpo.querySelector('input[name="servico"]');
    serv.value = "Avalição";
    T.reg.chamadas.length = 0;
    serv.dispatchEvent(T.D.evento("input", { target: serv }));
    await esperar(8);
    assert.ok(T.reg.chamadas.some(c => c.nome === "nx_agenda_livres" && c.p.p_servico === "Avalição"), "relê sem esperar sair do campo");
    const q = corpo.querySelector(".ag-serv-parecido");
    assert.equal(q.textContent, "Quis dizer Avaliação?");
    q.click();
    assert.equal(serv.value, "Avaliação");
    corpo.querySelectorAll(".ag-serv-chip")[1].click();
    assert.equal(serv.value, "Limpeza");
  } finally { T.sair(); }
});

/* ============================================================ plano 1500c · configuração */
test("CC-231 · «Copiar para…» escolhe os dias (terça a sábado também num toque)", async () => {
  const desf = [];
  const C = await montarConfig({ cfg: { ...cfgValidaC, horario_fonte: "agenda", horario: { 2: [["09:00", "17:00"]] } }, uiExtra: { acaoComDesfazer: o => { desf.push(o); } },
    modal: async o => { const cx = o.corpo.querySelectorAll('input[type="checkbox"]'); for (const c of cx) c.checked = ["3", "4", "5", "6"].includes(c.dataset.dia); return primaria(o).valor; } });
  C.alvo.querySelector('.agc-dia[data-dia="2"] .agc-copiar').click();
  await esperar(4);
  const faixas = id => C.alvo.querySelectorAll(`.agc-dia[data-dia="${id}"] .agc-faixa`).map(l => l.querySelectorAll("input").map(i => i.value));
  assert.equal(C.reg.modais.at(-1).titulo, "Copiar o horário de Terça-feira");
  for (const id of ["3", "4", "5", "6"]) assert.deepEqual(faixas(id), [["09:00", "17:00"]], `dia ${id}`);
  assert.deepEqual(faixas("1"), [], "segunda não foi marcada");
  assert.match(desf[0].texto, /copiado para qua, qui, sex, sáb\.$/);
});

test("CC-234 / CC-184 · feriados: escolher quais bloquear; o Desfazer não para no primeiro erro", async () => {
  const desf = [];
  const C = await montarConfig({ hoje: "2026-10-21", uiExtra: { acaoComDesfazer: o => { desf.push(o); }, carregando: async (b, p) => (typeof p === "function" ? p() : p) },
    modal: async o => { if (o.titulo === "Bloquear feriados") { o.corpo.querySelectorAll(".agc-feriado-chk")[0].checked = false; return primaria(o).valor; } return null; },
    rpc: async (n, p) => { if (n === "nx_agenda_bloqueio_salvar") return { ok: true, id: `id-${p.p_bloqueio.data}` }; if (n === "nx_agenda_bloqueio_excluir") { if (p.p_id === "id-2026-12-25") throw new Error("falhou"); return { ok: true }; } return undefined; } });
  porTexto(C.alvo, "button", "Bloquear feriados").click();
  await esperar(20);
  const salvos = C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_salvar").map(c => c.p.p_bloqueio.data);
  assert.ok(!salvos.includes("2026-11-02"), "o desmarcado (Finados) não é bloqueado");
  assert.ok(salvos.includes("2026-11-15"));
  C.reg.chamadas.length = 0;
  await desf[0].reverter();
  const excl = C.reg.chamadas.filter(c => c.nome === "nx_agenda_bloqueio_excluir").length;
  assert.equal(excl, salvos.length, "tenta desfazer todos");
  assert.match(C.reg.toasts.at(-1), /1 feriado não foi desfeito/);
});

test("CC-235 · horário herdado: a prévia mostra o que vale (só leitura)", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaC, horario_fonte: "departamento" },
    rpc: async n => (n === "nx_agenda_dia" ? { config: { horario: { 1: [["09:00", "17:00"]] } }, consultas: [] } : undefined) });
  await esperar(6);
  const p = C.alvo.querySelector(".agc-previa-herdada");
  assert.ok(p, "a prévia herdada aparece");
  assert.match(p.textContent, /do departamento/);
});

test("CC-236 · salvar um horário novo oferece atualizar o texto da IA", async () => {
  const avisos = [];
  const C = await montarConfig({ cfg: { ...cfgValidaC, horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"]] } }, uiExtra: { toast: (t, o) => { avisos.push([t, o]); }, checkSucesso() {} },
    rpc: async n => (n === "nx_agenda_config_salvar" ? { ok: true, bloqueios: [] } : n === "nx_agenda_dia" ? { consultas: [] } : undefined) });
  const ini = C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-faixa input');
  ini.value = "09:00";
  ini.dispatchEvent(C.D.evento("input", { target: ini }));
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("submit"));
  await esperar(12);
  const [t, o] = avisos.at(-1);
  assert.match(t, /^Agenda salva\. A IA tem um texto próprio de horários/);
  assert.equal(o.acao.rotulo, "Atualizar o texto da IA");
  o.acao.fn();
  assert.deepEqual(C.reg.navegou, ["#/config/ia"]);
});

test("CC-279 · a lista de bloqueios diz quem criou", async () => {
  const fut = A.diaISO(hojeSP(), 10);
  const C = await montarConfig({ bloqueios: [{ id: 1, inicio: `${fut}T12:00:00-03:00`, fim: `${fut}T13:00:00-03:00`, motivo: "Reunião", criado_por_nome: "Dra. Helena" }] });
  assert.match(C.alvo.querySelector(".agc-bloqueio small").textContent, / · por Dra\. Helena$/);
});

test("CC-295 / CC-298 · serviço novo nasce com a duração do campo e o contador fica à vista", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaC, duracoes: { "Avaliação": 30 } } });
  const dur = C.alvo.querySelector('input[name="duracao_min"]');
  dur.value = "45";
  porTexto(C.alvo, "button", "Adicionar serviço").click();
  const linhas = C.alvo.querySelectorAll(".agc-duracao");
  assert.equal(linhas.at(-1).querySelector('input[type="number"]').value, "45", "a duração do campo, não a salva");
  assert.equal(C.alvo.querySelector(".agc-serv-contador").textContent, "2 de 30 serviços");
  for (let i = 0; i < 28; i++) porTexto(C.alvo, "button", "Adicionar serviço").click();
  assert.equal(C.alvo.querySelector(".agc-serv-contador").textContent, "30 de 30 serviços");
  // plano 2000d · GY-088: no 30 o botão fica aria-disabled (o foco não se perde) e não cria a 31ª
  assert.equal(C.alvo.querySelector(".agc-add-duracao").getAttribute("aria-disabled"), "true", "no 30 o botão desliga");
  porTexto(C.alvo, "button", "Adicionar serviço").click();
  assert.equal(C.alvo.querySelectorAll(".agc-duracao").length, 30);
});

/* ============================================================ plano 1500c · complemento (GX) — contas puras */
const AGORA_GX = Date.parse("2026-10-15T10:00:00-03:00");   // quinta, 10:00 em São Paulo (fixo: o teste não depende da hora do dia)

test("GX-001 · o carimbo diz «há 1 h 30 min» e, passado um dia, «há mais de um dia»", () => {
  assert.match(A.textoCarimbo(AGORA_GX - 90 * 60000, AGORA_GX), / · há 1 h 30 min$/);
  assert.match(A.textoCarimbo(AGORA_GX - 120 * 60000, AGORA_GX), / · há 2 h$/, "hora cheia sem «0 min»");
  assert.match(A.textoCarimbo(AGORA_GX - 26 * 3600e3, AGORA_GX), / · há mais de um dia$/);
  assert.match(A.textoCarimbo(AGORA_GX - 12 * 60000, AGORA_GX), / · há 12 min$/);
});

test("GX-002 · a porcentagem honesta: «abaixo de 1%» e 99,6% não vira «100%»", () => {
  assert.equal(A.pctTexto(0), "0%");
  assert.equal(A.pctTexto(.004), "abaixo de 1%");
  assert.equal(A.pctTexto(.996), "99%");
  assert.equal(A.pctTexto(1), "100%");
  assert.equal(A.pctTexto(.5), "50%");
  assert.equal(A.textoOcupacao({ pct: .996, fechado: false }), "99% ocupado");
});

test("GX-003 / GX-004 · a ocupação do período pesa cada dia pela capacidade (o sábado curto não vale um dia inteiro)", () => {
  const dias = [{ marcados: 300, capacidade: 600, pct: .5 }, { marcados: 240, capacidade: 240, pct: 1 }];
  assert.equal(A.ocupacaoPonderada(dias), 540 / 840, "e não a média simples 75%");
  assert.equal(A.ocupacaoPonderada([{ marcados: 0, capacidade: 0, pct: null }]), null);
  const cfg = { horario: { 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, intervalos: [], duracao_min: 60, capacidade: 1 };
  assert.equal(A.ocupacaoDoPeriodo([k("2026-10-17", "08:00", "12:00")], ["2026-10-16", "2026-10-17"], cfg), 240 / 840);
});

test("GX-005 · o telefone com zero e operadora na frente vira o número do Brasil (wa.me e tel: abrem)", () => {
  assert.equal(A.digitosTelefone("(012) 99999-0000"), "12999990000");
  assert.equal(A.digitosTelefone("0 15 12 99999-0000"), "12999990000");
  assert.equal(A.digitosTelefone("00 1 555 123 4567"), "15551234567", "00 + DDI é internacional");
  assert.equal(A.linkWhatsAppAgenda("(012) 99999-0000"), "https://wa.me/5512999990000");
  assert.equal(A.telLocal("012 99999-0000"), "tel:+5512999990000");
});

test("GX-006 · o CSV traz a coluna «Fim»", () => {
  const csv = A.csvDaAgenda([{ inicio: "2026-10-15T10:00:00-03:00", fim: "2026-10-15T10:45:00-03:00", nome: "Ana" }]);
  const [cab, l1] = csv.slice(1).split("\r\n");
  assert.equal(cab.split(";").slice(0, 3).join(";"), "Data;Hora;Fim");
  assert.equal(l1.split(";").slice(0, 4).join(";"), "15/10/2026;10:00;10:45;Ana");
});

test("GX-007 · ontem se chama «Ontem»", () => {
  assert.equal(A.rotuloDoDia("2026-10-14", "2026-10-15"), "Ontem");
  assert.equal(A.rotuloDoDia("2026-10-13", "2026-10-15"), "Ter 13/10");
});

test("GX-008 / GX-009 · o texto do dia leva os bloqueios e a presença já marcada", () => {
  const dia = "2026-10-15";
  const cs = [consultaEm(dia, "09:00", { nome: "Ana", presenca: "faltou" }), consultaEm(dia, "10:00", { nome: "Bia", presenca: "compareceu" }), consultaEm(dia, "11:00", { nome: "Caio", status: "ganho" })];
  const bl = [{ inicio: `${dia}T12:00:00-03:00`, fim: `${dia}T13:00:00-03:00`, motivo: "almoço" }];
  const t = A.textoCompartilharDia(cs, dia, dia, bl);
  assert.match(t, /09:00 Ana \(Avaliação\) — faltou/);
  assert.match(t, /10:00 Bia \(Avaliação\) — compareceu/);
  assert.match(t, /11:00 Caio \(Avaliação\) — concluída/);
  assert.match(t.split("\n").at(-1), /12:00.*13:00/, "o bloqueio vai no fim");
  assert.match(A.textoCompartilharDia([], dia, dia, bl), /sem consultas\.\n.*12:00/);
  assert.match(A.textoCompartilharDia(cs, "2026-10-14", dia), /^Ontem · /);
});

test("GX-010 · consulta em andamento (já começou, não terminou, não é falta)", () => {
  const c = { inicio: "2026-10-15T09:45:00-03:00", fim: "2026-10-15T10:15:00-03:00" };
  assert.equal(A.consultaEmAndamento(c, AGORA_GX), true);
  assert.equal(A.consultaEmAndamento({ ...c, presenca: "faltou" }, AGORA_GX), false);
  assert.equal(A.consultaEmAndamento({ ...c, status: "ganho" }, AGORA_GX), false);
  assert.equal(A.consultaEmAndamento({ inicio: "2026-10-15T09:00:00-03:00" }, AGORA_GX, 30), false, "sem fim usa a duração padrão");
  assert.equal(A.consultaEmAndamento({ inicio: "2026-10-15T10:30:00-03:00" }, AGORA_GX), false, "a que ainda vai começar");
});

test("GX-011 / GX-012 · o «quando» do detalhe: dia pelo nome, faixa e duração", () => {
  assert.equal(A.quandoDoDetalhe({ inicio: "2026-10-15T10:00:00-03:00", fim: "2026-10-15T10:45:00-03:00" }, "2026-10-15"), "Hoje · 10:00–10:45 · 45 min");
  assert.equal(A.quandoDoDetalhe({ inicio: "2026-10-16T08:00:00-03:00", fim: "2026-10-16T09:00:00-03:00" }, "2026-10-15"), "Amanhã · 08:00–09:00 · 60 min");
  assert.equal(A.quandoDoDetalhe({ inicio: "2026-10-17T10:00:00-03:00" }, "2026-10-15"), "Sáb 17/10 · 10:00 · 30 min");
});

test("GX-014 · «Sem responsável» filtra quem não tem dono", () => {
  const cs = [{ id: 1, dono_id: 5 }, { id: 2, dono_id: null }, { id: 3 }];
  assert.deepEqual(A.filtrarPorProfissional(cs, "sem").map(c => c.id), [2, 3]);
});

test("GX-016 / GX-017 · o filtro acha pelo telefone e conta o que sobrou", () => {
  const ch = A.chaveFiltroConsulta({ nome: "Mariana Costa", servico: "Avaliação", telefone: "(12) 99999-4321" });
  assert.equal(A.casaFiltroNome(ch, "4321"), true, "pelo final do número");
  assert.equal(A.casaFiltroNome(ch, "9999-4321"), true, "com o traço");
  assert.equal(A.casaFiltroNome(ch, "avaliacao"), true, "pelo serviço sem acento");
  assert.equal(A.casaFiltroNome(ch, "5555"), false);
  assert.equal(A.textoContaFiltro(2, 14, "mar"), "2 de 14 consultas");
  assert.equal(A.textoContaFiltro(0, 14, "zé"), "Nenhuma consulta com «zé» nesta tela.");
  assert.equal(A.textoContaFiltro(3, 14, ""), "");
});

test("GX-018 · «/» vai ao filtro (mesmo com Shift); com Ctrl, não", () => {
  assert.equal(A.acaoTeclaAgenda({ key: "/" }), "filtrar");
  assert.equal(A.acaoTeclaAgenda({ key: "/", shiftKey: true }), "filtrar");
  assert.equal(A.acaoTeclaAgenda({ key: "/", ctrlKey: true }), null);
});

test("GX-023 · antecedência mínima: quando cai dentro e o texto do primeiro horário possível", () => {
  const cfg = { antecedencia_horas: 2 };
  assert.equal(A.dentroDaAntecedencia(cfg, AGORA_GX + 3600e3, AGORA_GX), true);
  assert.equal(A.dentroDaAntecedencia(cfg, AGORA_GX + 3 * 3600e3, AGORA_GX), false);
  assert.equal(A.dentroDaAntecedencia({}, AGORA_GX + 60000, AGORA_GX), false, "sem a configuração, nunca");
  assert.equal(A.textoAntecedencia(cfg, AGORA_GX), "Antecedência mínima de 2 h: só dá para marcar a partir das 12:00.");
  assert.equal(A.textoAntecedencia({ antecedencia_horas: 20 }, AGORA_GX), "Antecedência mínima de 20 h: só dá para marcar a partir de amanhã às 06:00.");
});

test("GX-031 / GX-032 · a busca manda o telefone só com dígitos (o nome fica como está)", () => {
  assert.equal(A.termoBusca("(12) 99999-0000"), "12999990000");
  assert.equal(A.termoBusca(" 4321 "), "4321");
  assert.equal(A.termoBusca("Mariana"), "Mariana");
  assert.equal(A.termoBusca("12"), "12", "poucos dígitos ficam");
});

test("GX-045 · tocar no almoço acha a pausa (e fora do expediente, não)", () => {
  const cfg = { horario: { 4: [["08:00", "18:00"]] }, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1 };
  assert.deepEqual(A.pausaNoHorario(cfg, "2026-10-15", 750), [720, 780]);
  assert.equal(A.pausaNoHorario(cfg, "2026-10-15", 600), null);
  assert.equal(A.pausaNoHorario(cfg, "2026-10-16", 750), null, "sexta fechada: não é pausa");
});

test("GX-056 · motivos de bloqueio prontos (grade e configuração)", () => {
  assert.ok(A.MOTIVOS_BLOQUEIO.includes("Almoço") && A.MOTIVOS_BLOQUEIO.includes("Reunião"));
  assert.ok(CFG.MOTIVOS_BLOQUEIO_CFG.includes("Feriado") && CFG.MOTIVOS_BLOQUEIO_CFG.includes("Férias"));
});

test("GX-060 / GX-066 / GX-067 / GX-071 · contas da configuração", () => {
  assert.deepEqual(CFG.pausasSemEfeito({ 1: [["08:00", "18:00"]] }, [["12:00", "13:00"], ["19:00", "20:00"]]), [["19:00", "20:00"]]);
  assert.deepEqual(CFG.pausasSemEfeito({}, [["19:00", "20:00"]]), [], "sem horário, nada a avisar");
  assert.deepEqual(CFG.meiosDoDia({ 1: [["09:00", "17:00"]] }, "2026-10-19", [["12:30", "13:30"]]), { manha: ["09:00", "12:30"], tarde: ["13:30", "17:00"] });
  assert.deepEqual(CFG.meiosDoDia({}, "2026-10-19"), { manha: ["08:00", "12:00"], tarde: ["12:00", "18:00"] });
  assert.equal(CFG.diaSP("2026-10-16T01:30:00Z"), "2026-10-15", "o dia de São Paulo, não o UTC");
  assert.equal(CFG.primeiraDe([{ inicio: "2026-10-20T10:00:00-03:00" }, { inicio: "2026-10-18T09:00:00-03:00" }, {}]), "2026-10-18T09:00:00-03:00");
  assert.equal(CFG.erroNumeroInteiro("2,5", "Capacidade", 1, 50), "Capacidade: use um número inteiro (sem vírgula), de 1 a 50.");
  assert.equal(CFG.erroNumeroInteiro("", "Capacidade", 1, 50), "Capacidade: preencha um número de 1 a 50.");
  assert.equal(CFG.erroNumeroInteiro("3", "Capacidade", 1, 50), null);
});

/* ============================================================ plano 1500c · complemento (GX) — peças da tela */
test("GX-027 / GX-028 / GX-055 · Lista: «+ Marcar neste dia», a linha «Agora» e a ocupação do dia", () => {
  const { h } = criarDom();
  const hoje = "2026-10-15", amanha = "2026-10-16";
  const cs = [k(hoje, "09:00", "09:30", { nome: "Ana" }), k(hoje, "11:00", "11:30", { nome: "Bia" }), k(amanha, "09:00", "10:00", { nome: "Caio" })];
  const marcou = [];
  const el = A.montarListaDias({ h, dias: [hoje, amanha], consultas: cs, hoje, config: { ...cfgSemanaC, duracao_min: 60 }, pode: true, aoMarcar: iso => marcou.push(iso), agora: AGORA_GX });
  const sec = iso => el.querySelector(`.ag-lista-dia[data-iso="${iso}"]`);
  const linhas = sec(hoje).querySelector(".ag-painel-lista").children;
  assert.equal(linhas.length, 3, "duas consultas e a linha «Agora»");
  assert.ok(linhas[1].classList.contains("ag-lista-agora"), "entre a das 09:00 (passou) e a das 11:00");
  assert.equal(linhas[1].getAttribute("role"), "separator");
  assert.equal(sec(amanha).querySelector(".ag-lista-agora"), null, "só no dia de hoje");
  sec(amanha).querySelector(".ag-lista-marcar").click();
  assert.deepEqual(marcou, [amanha]);
  assert.match(sec(amanha).querySelector(".ag-lista-ocup").textContent, /^10% ocupado$/);
  const sem = A.montarListaDias({ h, dias: [amanha], consultas: cs, hoje, config: cfgSemanaC, pode: false, aoMarcar() {} });
  assert.equal(sem.querySelector(".ag-lista-marcar"), null, "quem só vê não marca");
});

test("GX-038 / GX-041 / UC-030 · painel do dia: o fim da consulta, sem «Marcar» no passado e nomes como dado pessoal", () => {
  const { h } = criarDom();
  const hora = x => String(x).slice(11, 16);
  const p = A.montarPainelDia({ h, iso: "2026-10-16", consultas: [k("2026-10-16", "10:00", "10:45", { nome: "Ana", telefone: "12999990000" })], hoje: "2026-10-15", pode: true, horaBR: hora, aoMarcar() {} });
  assert.equal(p.querySelector(".ag-painel-fim").textContent, "até 10:45");
  assert.ok(p.querySelector(".ag-painel-txt b").classList.contains("dado-pessoal"));
  const vazioPassado = A.montarPainelDia({ h, iso: "2026-10-14", consultas: [], hoje: "2026-10-15", pode: true, horaBR: hora, aoMarcar() {} });
  assert.equal(porTexto(vazioPassado, "button", "Marcar consulta"), null, "ontem não marca");
  const vazioFuturo = A.montarPainelDia({ h, iso: "2026-10-16", consultas: [], hoje: "2026-10-15", pode: true, horaBR: hora, aoMarcar() {} });
  assert.ok(porTexto(vazioFuturo, "button", "Marcar consulta"));
});

test("GX-029 · o painel aceita o rótulo do compartilhar («Copiar lista» no computador)", () => {
  const { h } = criarDom();
  const p = A.montarPainelDia({ h, iso: "2026-10-16", consultas: [k("2026-10-16", "10:00", "10:30")], hoje: "2026-10-15", compartilhar() {}, rotuloCompartilhar: "Copiar lista" });
  assert.equal(p.querySelector(".ag-painel-compartilhar").textContent, "Copiar lista");
});

/* ---------- a tela montada (o relógio do arquivo está em 2026-10-15 10:00 de São Paulo) ---------- */
const HOJE_GX = "2026-10-15", SEG_GX = "2026-10-12";
const anuncioDe = T => (T.alvo.querySelector(".agenda-anuncio") || globalThis.document.body.querySelector(".agenda-anuncio")).textContent;

test("GX-010 / GX-011 / GX-013 / UC-030 · a consulta em andamento se destaca; o detalhe diz «Hoje · …» e copia o telefone", async () => {
  const T = await montarAgenda({ data: SEG_GX, consultas: [consultaEm(HOJE_GX, "09:45", { fim: `${HOJE_GX}T10:15:00-03:00`, telefone: "12999990000" })] });
  try {
    const bt = T.alvo.querySelector(".ag-bloco");
    assert.ok(bt.classList.contains("ag-em-curso"));
    assert.match(bt.getAttribute("aria-label"), /em andamento/);
    assert.ok(bt.querySelector(".ag-bloco-nome").classList.contains("dado-pessoal"));
    bt.click();
    const det = T.reg.pops.at(-1);
    assert.match(det.querySelector(".ag-det-quando").textContent, /^Hoje · 09:45–10:15 · 30 min/);
    assert.ok(det.querySelector(".ag-det-agora"), "pílula «em andamento»");
    assert.ok(det.querySelector(".ag-det-nome").classList.contains("dado-pessoal"));
    det.querySelector(".ag-det-copiar-tel").click();
    await esperar(2);
    assert.deepEqual(T.reg.copiados, ["tel 12999990000"]);
  } finally { T.sair(); }
});

test("GX-014 · o seletor de profissional oferece «Sem responsável» quando há consulta sem dono", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(seg, "10:00", { negocio_id: 802 })] });
  try {
    const sel = T.alvo.querySelector(".agenda-filtro-prof");
    assert.ok(sel.querySelectorAll("option").some(o => o.value === "sem" && o.textContent === "Sem responsável"));
    sel.value = "sem";
    sel.dispatchEvent(T.D.evento("change"));
    await esperar(4);
    assert.deepEqual(T.alvo.querySelectorAll(".ag-item").map(i => i.dataset.negocio), ["802"]);
  } finally { T.sair(); }
});

test("GX-015 / GX-016 / GX-018 / GX-054 · filtro: conta o que sobrou, Esc limpa, «/» foca e o CSV leva só o filtrado", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00", { nome: "Ana", telefone: "12999994321" }), consultaEm(seg, "10:00", { negocio_id: 802, nome: "Bia" })] });
  const urlAntes = URL.createObjectURL;
  let blob = null;
  try {
    for (const f of T.ouv.get("keydown") || []) f({ key: "/", target: globalThis.document.body, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false, shiftKey: true });
    const filtro = T.alvo.querySelector(".agenda-filtro-nome");
    assert.equal(T.D.estado.ativo, filtro, "«/» leva ao filtro");
    filtro.value = "4321";
    filtro.dispatchEvent(T.D.evento("input", { target: filtro }));
    await dormir(150);     // plano 2000d: DC-359 — o filtro espera 120 ms sem digitar
    assert.equal(T.alvo.querySelector(".agenda-filtro-conta").textContent, "1 de 2 consultas");
    assert.equal(filtro.getAttribute("aria-describedby"), T.alvo.querySelector(".agenda-filtro-conta").getAttribute("id"));
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"]').classList.contains("ag-filtrado"), "achou pelo telefone");
    URL.createObjectURL = b => { blob = b; return "blob:x"; };
    T.alvo.querySelector(".agenda-exportar").click();
    const csv = await blob.text();
    assert.match(csv, /;Ana;/);
    assert.doesNotMatch(csv, /;Bia;/, "o CSV respeita o filtro");
    const esc = T.D.evento("keydown", { key: "Escape" });
    filtro.dispatchEvent(esc);
    assert.equal(esc.defaultPrevented, true);
    assert.equal(filtro.value, "");
    assert.equal(T.alvo.querySelectorAll(".ag-filtrado").length, 0, "Esc limpa o filtro");
    assert.equal(T.alvo.querySelector(".agenda-filtro-conta").textContent, "");
  } finally { URL.createObjectURL = urlAntes; T.sair(); }
});

test("GX-019 · dois toques em «Marcar» abrem uma janela só", async () => {
  const janelas = [];
  const T = await montarAgenda({ data: futuraSeg(), modal: janelaAberta(janelas) });
  try {
    T.alvo.querySelector(".agenda-marcar").click();
    T.alvo.querySelector(".agenda-marcar").click();
    await esperar(8);
    assert.equal(janelas.length, 1);
    janelas[0].fechar(null);
    await esperar(8);
    T.alvo.querySelector(".agenda-marcar").click();
    await esperar(8);
    assert.equal(janelas.length, 2, "fechada a primeira, abre de novo");
  } finally { T.sair(); }
});

test("GX-030 / GX-053 · desmarcar: a janela diz o serviço e o aviso diz de quem era", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { nome: "Ana Lima", servico: "Limpeza" })], rpc: async n => (n === "nx_agenda_desmarcar" ? { ok: true } : undefined),
    modal: async o => { if (o.titulo !== "Desmarcar consulta") return null; T.quem = o.corpo.querySelector(".ag-desmarcar-quem").textContent; o.corpo.querySelectorAll(".ag-motivo-chip")[0].click(); return primaria(o).fn(erroModal([])); } });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-desmarcar").click();
    await esperar(12);
    assert.match(T.quem, /^Ana Lima · Limpeza · /);
    assert.match(T.reg.desfazer.at(-1).texto, /^Ana Lima · consulta de .+ desmarcada$/);
  } finally { T.sair(); }
});

test("GX-034 · sem Conversas, «Avisar» abre o WhatsApp do aparelho com o texto pronto", async () => {
  const seg = futuraSeg();
  const abertos = [];
  const openAntes = Object.getOwnPropertyDescriptor(globalThis, "open");
  Object.defineProperty(globalThis, "open", { value: (u, alvo) => { abertos.push([u, alvo]); return null; }, configurable: true, writable: true });
  const T = await montarAgenda({ data: seg, comConversas: false, consultas: [consultaEm(seg, "10:00", { telefone: "12999991234" })], rpc: async n => (n === "nx_agenda_desmarcar" ? { ok: true } : undefined),
    modal: async o => { if (o.titulo !== "Desmarcar consulta") return null; o.corpo.querySelectorAll(".ag-motivo-chip")[0].click(); return primaria(o).fn(erroModal([])); } });
  try {
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-desmarcar").click();
    await esperar(12);
    const av = T.reg.desfazer.at(-1);
    assert.ok(av.acao, "o aviso tem «Avisar» mesmo sem Conversas");
    av.acao.fn();
    assert.equal(abertos.length, 1);
    assert.match(abertos[0][0], /^https:\/\/wa\.me\/5512999991234\?text=/);
  } finally { T.sair(); if (openAntes) Object.defineProperty(globalThis, "open", openAntes); else delete globalThis.open; }
});

test("GX-036 · «Minha agenda / todos» também pela paleta", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, conta: "u1", consultas: [consultaEm(seg, "09:00", { dono_id: "u1" }), consultaEm(seg, "10:00", { negocio_id: 802, dono_id: "u2" })] });
  try {
    const cmd = T.reg.comandos.find(c => c.id === "agenda.minha");
    assert.ok(cmd, "o comando existe");
    cmd.fazer();
    await esperar(6);
    assert.equal(JSON.parse(T.storage.get(T.chave)).prof, "eu");
    T.sair();
    assert.equal(T.reg.ativos.has(cmd), false, "sair tira o comando da paleta");
  } catch (e) { T.sair(); throw e; }
});

test("GX-020 / GX-021 · o tique atualiza o «em X min» da Próxima e pede de novo o «Próximo livre» que já passou", async () => {
  const T = await montarAgenda({ data: SEG_GX, consultas: [consultaEm(HOJE_GX, "11:00", { nome: "Bia" })],
    rpc: async n => (n === "nx_agenda_livres" ? { duracao_min: 30, horarios: [{ inicio: `${HOJE_GX}T10:30:00-03:00`, livre: true, capacidade: 1, ocupados: 0 }] } : undefined) });
  try {
    await esperar(8);
    const antes = T.alvo.querySelector("button.agenda-proxima .agenda-proxima-quando").textContent;
    const livresAntes = T.reg.chamadas.filter(c => c.nome === "nx_agenda_livres").length;
    assert.ok(livresAntes >= 1);
    fixarRelogio("2026-10-15T10:45:00-03:00");
    for (const f of T.reg.intervalos) f();
    await esperar(10);
    assert.notEqual(T.alvo.querySelector("button.agenda-proxima .agenda-proxima-quando").textContent, antes, "o relativo andou");
    assert.ok(T.reg.chamadas.filter(c => c.nome === "nx_agenda_livres").length > livresAntes, "o livre que passou é pedido de novo");
  } finally { fixarRelogio("2026-10-15T10:00:00-03:00"); T.sair(); }
});

test("GX-022 · desmarcar esquece o «Próximo livre» guardado (pode ter acabado de abrir)", async () => {
  const T = await montarAgenda({ data: SEG_GX, consultas: [consultaEm(HOJE_GX, "15:00")],
    rpc: async n => (n === "nx_agenda_livres" ? { duracao_min: 30, horarios: [{ inicio: `${HOJE_GX}T16:00:00-03:00`, livre: true, capacidade: 1, ocupados: 0 }] } : n === "nx_agenda_desmarcar" ? { ok: true } : undefined),
    modal: async o => { if (o.titulo !== "Desmarcar consulta") return null; o.corpo.querySelectorAll(".ag-motivo-chip")[0].click(); return primaria(o).fn(erroModal([])); } });
  try {
    await esperar(8);
    const antes = T.reg.chamadas.filter(c => c.nome === "nx_agenda_livres").length;
    T.alvo.querySelector(".ag-bloco").click();
    T.reg.pops.at(-1).querySelector(".ag-det-desmarcar").click();
    await esperar(16);
    assert.ok(T.reg.chamadas.filter(c => c.nome === "nx_agenda_livres").length > antes);
  } finally { T.sair(); }
});

test("GX-023 / GX-024 / GX-025 · arrastar para dentro da antecedência: o fantasma diz por quê; o atendente ouve a regra, o supervisor encaixa", async () => {
  const cfg = { duracao_min: 30, capacidade: 1, antecedencia_horas: 4 };
  const T = await montarAgenda({ data: SEG_GX, cfg, papel: "atendente", consultas: [consultaEm(HOJE_GX, "15:00")] });
  try {
    const { fantasma } = await arrastar(T, { fracao: .45 });     // 12:30 de hoje (agora 10:00; antecedência até 14:00)
    assert.equal(fantasma.querySelector(".ag-bloco-hora").textContent, "12:30–13:00 · antecedência");
    assert.ok(fantasma.classList.contains("ag-fantasma-ruim"));
    assert.match(T.reg.toasts.at(-1), /^Antecedência mínima de 4 h: só dá para marcar a partir das 14:00\./);
    assert.equal(T.reg.modais.length, 0);
    const { fantasma: f2 } = await arrastar(T, { fracao: .15 });   // 09:30 de hoje (já passou)
    assert.match(f2.querySelector(".ag-bloco-hora").textContent, /^09:\d\d–\d\d:\d\d · já passou$/);
  } finally { T.sair(); }
  const S = await montarAgenda({ data: SEG_GX, cfg, papel: "supervisor", consultas: [consultaEm(HOJE_GX, "15:00", { fim: `${HOJE_GX}T15:45:00-03:00` })] });
  try {
    await arrastar(S, { fracao: .45 });
    await esperar(10);
    const corpo = S.reg.modais.find(m => m.titulo === "Remarcar consulta?").corpo;
    assert.match(corpo.querySelector(".ag-remarcar-encaixe").textContent, /Antecedência mínima de 4 h.*encaixe/);
    assert.equal(corpo.querySelector(".ag-remarcar-ate").textContent, "até 13:15", "45 min a partir das 12:30");
  } finally { S.sair(); }
});

test("GX-026 / GX-033 · a janela só diz «Remarcar» quando a consulta ainda vai acontecer; a data não passa do limite", async () => {
  const janelas = [];
  const T = await montarAgenda({ data: futuraSeg(), cfg: { duracao_min: 30, capacidade: 1, dias_a_frente: 30 }, modal: janelaAberta(janelas) });
  try {
    A.marcarConsulta(T.ctx, { negocio: consultaEm("2026-10-01", "10:00"), config: { duracao_min: 30, capacidade: 1, dias_a_frente: 30 } });
    await esperar(8);
    assert.equal(janelas.at(-1).o.titulo, "Marcar consulta", "a consulta de 01/10 já passou: é um retorno");
    janelas.at(-1).fechar(null);
    A.marcarConsulta(T.ctx, { negocio: consultaEm(A.diaISO(HOJE_GX, 3), "10:00"), config: { duracao_min: 30, capacidade: 1, dias_a_frente: 30 } });
    await esperar(8);
    assert.equal(janelas.at(-1).o.titulo, "Remarcar consulta");
    assert.equal(janelas.at(-1).o.corpo.querySelector('input[name="data"]').getAttribute("max"), A.diaISO(HOJE_GX, 30));
    janelas.at(-1).fechar(null);
  } finally { T.sair(); }
});

test("GX-051 · a janela «Marcar» diz o fim do horário escolhido", async () => {
  const { T, corpo } = await abrirMarcar();
  try {
    await escolherNaBusca(T, corpo);
    corpo.querySelector(".agenda-resultado").click();
    await esperar(10);
    corpo.querySelector(".ag-hora-pill:not(.ag-hora-lotada)").click();
    assert.match(corpo.querySelector(".ag-info").textContent, /, das 14:00 às 14:30 · duração prevista 30 min · horário de Brasília$/);
  } finally { T.sair(); }
});

test("GX-052 · na busca, quem já tem consulta marcada aparece com ela", async () => {
  const { T, corpo } = await abrirMarcar({ rpc: async n => (n === "nx_buscar" ? { negocios: [{ id: 801, titulo: "Aparelho", contato_nome: "Mariana Costa", status: "aberto", consulta_em: `${A.diaISO(HOJE_GX, 1)}T10:00:00-03:00` }] } : undefined) });
  try {
    await escolherNaBusca(T, corpo, "Mari");
    assert.match(corpo.querySelector(".agenda-resultado small").textContent, /consulta /);
  } finally { T.sair(); }
});

test("GX-048 · «Procurar paciente»: com um resultado só, o segundo Enter vai direto para a consulta", async () => {
  const fut = futuraSeg(), dia2 = A.diaISO(fut, 9);
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(dia2, "11:00", { negocio_id: 802 })],
    rpc: async n => (n === "nx_buscar" ? { negocios: [{ id: 802, titulo: "X", contato_nome: "Rafael", status: "aberto", consulta_em: `${dia2}T11:00:00-03:00` }] } : undefined),
    modal: async (o, D) => { if (!(o.titulo && /^Procurar/.test(o.titulo))) return null; const inp = o.corpo.querySelector("input"); inp.value = "Rafael"; let fechar; const p = new Promise(r => { fechar = r; }); o.aoAbrir({ fechar });
      inp.dispatchEvent(D.evento("keydown", { key: "Enter" })); await esperar(10); inp.dispatchEvent(D.evento("keydown", { key: "Enter" })); setTimeout(() => fechar(null), 50); return p; } });
  try {
    T.alvo.querySelector(".agenda-procurar").click();
    await esperar(30);
    assert.ok(T.alvo.querySelector('.ag-item[data-negocio="802"]'), "foi para a semana da consulta sem clicar em «Ir para»");
  } finally { T.sair(); }
});

test("GX-039 / GX-040 · o passado não se oferece para marcar (resumo vazio e colunas de dias que passaram)", async () => {
  const P = await montarAgenda({ data: passadaSeg() });
  try { assert.equal(P.alvo.querySelector(".agenda-marcar-vazio"), null); } finally { P.sair(); }
  const F = await montarAgenda({ data: futuraSeg() });
  try { assert.ok(F.alvo.querySelector(".agenda-marcar-vazio")); } finally { F.sair(); }
  const T = await montarAgenda({ data: SEG_GX });
  try {
    const col = iso => T.alvo.querySelector(`.ag-col[data-iso="${iso}"]`);
    assert.ok(!col("2026-10-13").classList.contains("ag-edita"), "terça que passou não é marcável");
    assert.ok(col("2026-10-16").classList.contains("ag-edita"));
  } finally { T.sair(); }
});

test("GX-042 / GX-043 · o tique espera a janela fechar; o redesenho devolve o foco ao filtro", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00"), consultaEm(seg, "10:00", { negocio_id: 802, nome: "Rafael" })] });
  const qsAntes = globalThis.document.querySelector;
  try {
    const filtro = T.alvo.querySelector(".agenda-filtro-nome");
    filtro.focus();
    filtro.value = "Ra";
    filtro.dispatchEvent(T.D.evento("input", { target: filtro }));
    T.dados.consultas[0].status = "ganho";            // a «Próxima» muda: o tique redesenharia
    globalThis.document.querySelector = s => (/flut-ag/.test(s) ? {} : null);
    const resumo = T.alvo.querySelector(".agenda-resumo");
    for (const f of T.reg.intervalos) f();
    await esperar(4);
    assert.equal(T.alvo.querySelector(".agenda-resumo"), resumo, "com o detalhe aberto, nada se redesenha");
    globalThis.document.querySelector = () => null;
    for (const f of T.reg.intervalos) f();
    await esperar(4);
    assert.notEqual(T.alvo.querySelector(".agenda-resumo"), resumo, "fechado, o redesenho pendente acontece");
    const novo = T.alvo.querySelector(".agenda-filtro-nome");
    assert.notEqual(novo, filtro);
    assert.equal(T.D.estado.ativo, novo, "o foco volta ao filtro");
    assert.equal(novo.value, "Ra");
  } finally { globalThis.document.querySelector = qsAntes; T.sair(); }
});

test("GX-044 · o foco num botão das ferramentas («Exportar CSV») sobrevive ao redesenho", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00"), consultaEm(seg, "10:00", { negocio_id: 802, nome: "Rafael" })] });
  try {
    const exp = T.alvo.querySelector(".agenda-exportar");
    exp.focus();
    T.dados.consultas[0].status = "ganho";
    for (const f of T.reg.intervalos) f();
    await esperar(4);
    const novo = T.alvo.querySelector(".agenda-exportar");
    assert.notEqual(novo, exp, "redesenhou");
    assert.equal(T.D.estado.ativo, novo);
  } finally { T.sair(); }
});

test("GX-045 · tocar no almoço diz que é a pausa", async () => {
  const T = await montarAgenda({ data: futuraSeg(), cfg: cfgSemana });
  try {
    clicarNoVazio(T, .45);
    await esperar(6);
    assert.equal(T.reg.toasts.at(-1), "Pausa das 12:00 às 13:00: escolha outro horário.");
    assert.equal(T.reg.modais.length, 0);
  } finally { T.sair(); }
});

test("GX-046 · o «+» do dia some em dia fechado e em dia todo bloqueado", async () => {
  const seg = futuraSeg(), qua = A.diaISO(seg, 2);
  const T = await montarAgenda({ data: seg, cfg: cfgSemanaC, prefsExtra: { fechados: "mostrar" },
    bloqueios: [{ id: 5, inicio: `${qua}T00:00:00-03:00`, fim: `${A.diaISO(qua, 1)}T00:00:00-03:00`, motivo: "Feriado" }] });
  try {
    assert.equal(T.alvo.querySelectorAll(".ag-col").length, 7, "a semana inteira à mostra");
    assert.equal(T.alvo.querySelectorAll(".ag-dia-mais").length, 4, "seg, ter, qui e sex");
  } finally { T.sair(); }
});

test("GX-047 / GX-035 · «Hoje» já em hoje avisa e rola até a linha de agora", async () => {
  const T = await montarAgenda({ data: SEG_GX, consultas: [consultaEm(HOJE_GX, "15:00")] });
  try {
    const agora = T.alvo.querySelector(".ag-agora");
    assert.ok(agora, "a linha de agora existe");
    // o redesenho do «Hoje» troca os elementos: a medida vale para qualquer linha de agora deste DOM
    const proto = Object.getPrototypeOf(agora), medirAntes = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function () { return this.classList.contains("ag-agora") ? { top: 1200, left: 0, width: 100, height: 2, right: 100, bottom: 1202 } : medirAntes.call(this); };
    // como no navegador, [hidden] acompanha a propriedade .hidden (a linha de agora nasce escondida e o relógio a mostra)
    const temAntes = proto.hasAttribute;
    proto.hasAttribute = function (k) { return k === "hidden" ? !!this.hidden : temAntes.call(this, k); };
    T.reg.rolagens.length = 0;
    for (const f of T.ouv.get("keydown") || []) f({ key: "t", target: globalThis.document.body, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false });
    await dormir(45);
    assert.equal(anuncioDe(T), "Você já está vendo hoje.");
    assert.ok(T.reg.rolagens.some(([o]) => o && typeof o.top === "number" && o.top > 0), "rolou até a linha de agora");
  } finally { T.sair(); }
});

test("GX-049 · destacar na legenda anuncia quantas ficaram em destaque", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "09:00"), consultaEm(seg, "10:00", { negocio_id: 802, servico: "Limpeza" })] });
  try {
    T.alvo.querySelector(".ag-leg-chip").click();
    await dormir(45);
    assert.equal(anuncioDe(T), "1 consulta em destaque.");
  } finally { T.sair(); }
});

test("GX-050 · mês do celular longe de hoje tem «Voltar a este mês»", async () => {
  const T = await montarAgenda({ data: "2026-12-07", movel: true, modal: async o => { if (o.aoAbrir) o.aoAbrir({ fechar() {} }); return null; } });
  try {
    T.alvo.querySelector(".agenda-mes-bt").click();
    await esperar(12);
    const corpo = T.reg.modais.at(-1).corpo;
    const volta = corpo.querySelector(".ag-mes-este");
    assert.ok(volta, "dezembro aberto: o botão aparece");
    volta.click();
    await esperar(12);
    assert.equal(corpo.querySelector(".ag-mes-este"), null, "no mês de hoje ele some");
  } finally { T.sair(); }
});

test("GX-056 · bloquear pela grade: motivos num toque", async () => {
  const T = await montarAgenda({ data: futuraSeg(), cfg: cfgSemana, papel: "admin",
    modal: async o => { if (o.titulo === "Bloquear horário") { T.bloq = o; return null; } return null; } });
  try {
    clicarNoVazio(T, .3);
    await esperar(8);
    const janela = T.reg.modais.find(m => m.titulo && /^Marcar/.test(m.titulo));
    janela.corpo.querySelector(".ag-bloquear-horario").click();
    await esperar(8);
    const chip = T.bloq.corpo.querySelectorAll(".ag-bloq-motivo").find(b => b.textContent === "Reunião");
    chip.click();
    assert.equal(T.bloq.corpo.querySelector('input[name="motivo"]').value, "Reunião");
  } finally { T.sair(); }
});

test("RC-198 / RC-203 / RC-341 · #/agenda?dia=…&hora=… abre nesse dia (o Mês vira Dia) e põe o cursor na hora", async () => {
  const fut = futuraSeg(), qui = A.diaISO(fut, 3);
  const T = await montarAgenda({ data: fut, modo: "mes", rota: { query: { dia: qui, hora: "14:00" } } });
  try {
    const cols = T.alvo.querySelectorAll(".ag-col");
    assert.deepEqual(cols.map(c => c.dataset.iso), [qui], "abriu o Dia pedido");
    assert.ok(cols[0].querySelector(".ag-cursor"), "o cursor de horário está na hora pedida");
  } finally { T.sair(); }
});

/* ---------- configuração da agenda (GX-057 em diante) ---------- */
const cfgSegManha = { ...cfgValidaC, horario_fonte: "agenda", horario: { 1: [["08:00", "12:00"]] } };
const salvarOk = async n => (n === "nx_agenda_config_salvar" ? { ok: true, bloqueios: [] } : n === "nx_agenda_dia" ? { consultas: [] } : undefined);

test("GX-057 / GX-058 / GX-072 · fechar a aba com mudança pergunta; Ctrl+S salva; «Descartar» volta ao salvo", async () => {
  const ouvintes = [];
  const antesAdd = Object.getOwnPropertyDescriptor(globalThis, "addEventListener"), antesRem = Object.getOwnPropertyDescriptor(globalThis, "removeEventListener");
  Object.defineProperty(globalThis, "addEventListener", { value: (t, f) => ouvintes.push([t, f]), configurable: true, writable: true });
  Object.defineProperty(globalThis, "removeEventListener", { value: (t, f) => { const i = ouvintes.findIndex(x => x[0] === t && x[1] === f); if (i >= 0) ouvintes.splice(i, 1); }, configurable: true, writable: true });
  try {
    const C = await montarConfig({ cfg: cfgSegManha, uiExtra: { checkSucesso() {} }, rpc: salvarOk });
    const saida = () => ouvintes.filter(([t]) => t === "beforeunload").map(([, f]) => f);
    assert.equal(saida().length, 1, "um ouvinte só");
    const limpo = { preventDefault() { this.parou = true; } };
    saida()[0](limpo);
    assert.ok(!limpo.parou, "sem mudança, fecha sem perguntar");
    const ini = C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-faixa input');
    ini.value = "09:00";
    ini.dispatchEvent(C.D.evento("input", { target: ini }));
    const sujo = { preventDefault() { this.parou = true; } };
    saida()[0](sujo);
    assert.ok(sujo.parou, "com mudança não salva, pergunta");
    const barra = C.alvo.querySelector(".agc-barra-sujo");
    assert.equal(barra.hidden, false);
    const desc = barra.querySelector(".agc-barra-descartar");
    assert.ok(desc, "a barra tem «Descartar»");
    desc.click();
    await esperar(10);
    assert.equal(C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-faixa input').value, "08:00", "voltou ao salvo");
    assert.equal(saida().length, 1, "remontar troca o ouvinte (não soma)");
    const ini2 = C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-faixa input');
    ini2.value = "09:30";
    ini2.dispatchEvent(C.D.evento("input", { target: ini2 }));
    assert.equal(C.ret.pendente(), true, "a guarda de rota vê a mudança feita depois do «Descartar»");
    const ctrlS = C.D.evento("keydown", { key: "s", ctrlKey: true });
    C.alvo.querySelector("form").dispatchEvent(ctrlS);
    await esperar(12);
    assert.equal(ctrlS.defaultPrevented, true, "o navegador não abre «Salvar página»");
    assert.ok(C.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"), "Ctrl+S salvou");
    C.ret && typeof C.ret.limpar === "function" && C.ret.limpar();
    assert.equal(saida().length, 0, "sair da seção tira o ouvinte");
  } finally {
    if (antesAdd) Object.defineProperty(globalThis, "addEventListener", antesAdd); else delete globalThis.addEventListener;
    if (antesRem) Object.defineProperty(globalThis, "removeEventListener", antesRem); else delete globalThis.removeEventListener;
  }
});

test("GX-069 / GX-070 · dia desligado diz «Fechado»; tirar a última faixa fecha o dia", async () => {
  const avisos = [];
  const C = await montarConfig({ cfg: cfgSegManha, uiExtra: { toast: t => avisos.push(t) } });
  const dia = id => C.alvo.querySelector(`.agc-dia[data-dia="${id}"]`);
  assert.equal(dia("2").querySelector(".agc-dia-fechado").hidden, false, "terça sem horário: «Fechado»");
  assert.equal(dia("1").querySelector(".agc-dia-fechado").hidden, true);
  dia("1").querySelector(".agc-faixa .agc-remover").click();
  assert.equal(dia("1").querySelector('input[name="dia_1"]').checked, false, "segunda desligada");
  assert.equal(dia("1").querySelector(".agc-dia-fechado").hidden, false);
  assert.match(avisos.at(-1), /ficou fechado/);
});

test("GX-059 / GX-062 · Enter no nome do serviço abre outra linha; nome repetido avisa ao sair do campo", async () => {
  const C = await montarConfig({ cfg: { ...cfgValidaC, duracoes: { "Avaliação": 30 } } });
  const nome1 = C.alvo.querySelector(".agc-duracao input");
  const ent = C.D.evento("keydown", { key: "Enter" });
  nome1.dispatchEvent(ent);
  assert.equal(ent.defaultPrevented, true, "o Enter não salva a agenda");
  const linhas = C.alvo.querySelectorAll(".agc-duracao");
  assert.equal(linhas.length, 2);
  const nome2 = linhas[1].querySelector("input");
  assert.equal(C.D.estado.ativo, nome2, "o foco vai para a linha nova");
  nome2.value = "avaliação";
  nome2.dispatchEvent(C.D.evento("blur"));
  const dup = C.alvo.querySelector(".agc-serv-dup");
  assert.equal(dup.hidden, false);
  assert.match(dup.textContent, /valia|Avalia|repet/i);
});

test("GX-060 / GX-061 · pausa fora do horário avisa; pausas sobrepostas não salvam", async () => {
  const C = await montarConfig({ cfg: { ...cfgSegManha, intervalos: [["19:00", "20:00"]] } });
  await esperar(4);
  const av = C.alvo.querySelector(".agc-pausa-fora");
  assert.equal(av.hidden, false);
  assert.match(av.textContent, /19:00–20:00/);
  const S = await montarConfig({ cfg: { ...cfgSegManha, intervalos: [["09:00", "10:00"], ["09:30", "11:00"]] }, rpc: salvarOk });
  S.alvo.querySelector("form").dispatchEvent(S.D.evento("submit"));
  await esperar(10);
  assert.equal(S.reg.toasts.at(-1), "As pausas 09:00–10:00 e 09:30–11:00 se sobrepõem. Junte-as numa só.");
  assert.ok(!S.reg.chamadas.some(c => c.nome === "nx_agenda_config_salvar"));
});

test("GX-071 · número com vírgula pede inteiro", async () => {
  const C = await montarConfig({ cfg: cfgSegManha, rpc: salvarOk });
  C.alvo.querySelector('input[name="capacidade"]').value = "2,5";
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("submit"));
  await esperar(6);
  assert.deepEqual(C.reg.erros.find(([n]) => n === "capacidade"), ["capacidade", "Atendimentos no mesmo horário: use um número inteiro (sem vírgula), de 1 a 50."]);
});

test("GX-063 / GX-064 · «Bloqueios futuros (N)» e o bloqueio em curso diz «em andamento»", async () => {
  const ontem = A.diaISO(hojeSP(), -1), fut = A.diaISO(hojeSP(), 10);
  const C = await montarConfig({ bloqueios: [
    { id: 1, inicio: `${ontem}T00:00:00-03:00`, fim: `${A.diaISO(hojeSP(), 3)}T00:00:00-03:00`, motivo: "Férias" },
    { id: 2, inicio: `${fut}T12:00:00-03:00`, fim: `${fut}T13:00:00-03:00`, motivo: "Reunião" }] });
  assert.equal(C.alvo.querySelector(".agc-cont-bloq").textContent, " (2)");
  const agora = C.alvo.querySelectorAll(".agc-bloq-agora");
  assert.equal(agora.length, 1);
  assert.equal(agora[0].closest(".agc-bloqueio").dataset.id, "1");
});

test("GX-065 · feriados: «Desmarcar todos» de uma vez", async () => {
  const C = await montarConfig({ hoje: "2026-10-21", modal: async o => { if (o.titulo !== "Bloquear feriados") return null; o.corpo.querySelector(".agc-feriados-desmarcar").click(); assert.ok(o.corpo.querySelectorAll(".agc-feriado-chk").every(c => !c.checked)); return primaria(o).valor; } });
  porTexto(C.alvo, "button", "Bloquear feriados").click();
  await esperar(12);
  assert.equal(C.reg.toasts.at(-1), "Nenhum feriado marcado.");
});

test("GX-066 / GX-056 / GX-067 · bloqueio: Manhã/Tarde pelo expediente, motivo num toque e o link ao dia da consulta", async () => {
  const dia = A.diaISO(hojeSP(), 10);
  const segunda = A.segundaDe(A.diaISO(hojeSP(), 14));
  let visto = null;
  const C = await montarConfig({ cfg: { ...cfgValidaC, horario_fonte: "agenda", horario: { 1: [["09:00", "17:00"]] }, intervalos: [["12:30", "13:30"]] }, consultas: [consultaEm(dia, "15:00")],
    modal: async o => {
      if (o.titulo !== "Bloquear horário") return null;
      o.aoAbrir && o.aoAbrir({ fechar() {} });
      const q = s => o.corpo.querySelector(s);
      q('[name="data"]').value = segunda;
      q(".agc-tarde").click();
      visto = { tarde: [q('[name="das"]').value, q('[name="ate"]').value] };
      q(".agc-manha").click();
      visto.manha = [q('[name="das"]').value, q('[name="ate"]').value];
      o.corpo.querySelectorAll(".agc-motivo").find(b => b.textContent === "Férias").click();
      visto.motivo = q('[name="motivo"]').value;
      q(".agc-dia-inteiro").click();
      q('[name="data"]').value = dia;
      await primaria(o).fn(erroModal([]));
      visto.href = q(".agc-ver-agenda").getAttribute("href");
      return null;
    } });
  porTexto(C.alvo, "button", "Bloquear horário").click();
  await esperar(12);
  assert.deepEqual(visto.tarde, ["13:30", "17:00"]);
  assert.deepEqual(visto.manha, ["09:00", "12:30"]);
  assert.equal(visto.motivo, "Férias");
  assert.equal(visto.href, `#/agenda?dia=${dia}`);
});

test("GX-068 · consulta fora do horário novo: «Ver na Agenda» leva ao dia dela", async () => {
  const dia = A.diaISO(hojeSP(), 4);
  const C = await montarConfig({ cfg: cfgSegManha, rpc: async n => (n === "nx_agenda_dia" ? { consultas: [consultaEm(dia, "17:00")] } : n === "nx_agenda_config_salvar" ? { ok: true, bloqueios: [] } : undefined) });
  const ini = C.alvo.querySelector('.agc-dia[data-dia="1"] .agc-faixa input');
  ini.value = "09:00";
  ini.dispatchEvent(C.D.evento("input", { target: ini }));
  C.alvo.querySelector("form").dispatchEvent(C.D.evento("submit"));
  await esperar(14);
  const ver = C.alvo.querySelector(".agc-aviso-fora .agc-fora-ver");
  assert.ok(ver, "o aviso tem o link");
  assert.equal(ver.getAttribute("href"), `#/agenda?dia=${dia}`);
  ver.dispatchEvent(C.D.evento("click"));
  assert.deepEqual(C.reg.navegou, [`#/agenda?dia=${dia}`]);
});

test("GX-029 / CC-049 · no computador «Copiar lista» copia o texto do dia; a nota do fuso diz «Horários de Brasília.»", async () => {
  const seg = futuraSeg();
  const T = await montarAgenda({ data: seg, modo: "dia", consultas: [consultaEm(seg, "09:00", { nome: "Ana" })] });
  try {
    const bt = T.alvo.querySelector(".ag-painel-compartilhar");
    assert.equal(bt.textContent, "Copiar lista");
    bt.click();
    await esperar(4);
    assert.match(T.reg.copiados.at(-1), /09:00 Ana \(Avaliação\)/);
    const nota = T.alvo.querySelector(".agenda-fuso");
    assert.ok(!nota || nota.textContent === "Horários de Brasília.", "sem «horário» duas vezes");
  } finally { T.sair(); }
});

test("APP-1FR / GX-037 · CSS: nenhum 1fr solto e a data da Agenda com 44 px", () => {
  assert.doesNotMatch(cssAgenda.replace(/minmax\(0,\s*1fr\)/g, ""), /\b1fr\b/);
  assert.match(cssAgenda, /\.agenda-data[^{]*\{[^}]*min-height:\s*44px/);
});
