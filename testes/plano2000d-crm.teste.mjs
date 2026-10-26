/* ============================================================
   ÓRBITA — plano 2000d, frente crm (DR-001…DR-433).
   node --test testes/plano2000d-crm.teste.mjs
   O DOM de mentira e os montadores (Kanban, gaveta, contatos, importação, funis) são cópia do plano1500c-crm.teste.mjs.
   Sem rede, sem serviços reais. Datas relativas a Date.now() (o CI fixa ORBITA_AGORA).
   ============================================================ */
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(raiz, "..");
const APP = join(RAIZ, "web", "app");
const ler = nome => readFileSync(join(APP, nome), "utf8");
const L = await import("../web/app/crm-logica.js");
const VisReal = await import("../web/app/crm-visoes.js");
const tique = () => new Promise(r => setTimeout(r, 0));
const imediato = () => new Promise(r => setImmediate(r));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const iso = (dias, hora = 12) => new Date(Date.now() + dias * 86400000 + (hora - 12) * 3600000).toISOString();

/* ============================================================ DOM de mentira (elementos, classes, dataset, ouvintes, seletores simples e descendentes) */
function domDeMentira({ medias = {} } = {}) {
  let ativo = null, sobOPonto = null;
  const rolagens = [];
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
      this._cls = new Set(); this._l = {}; this._t = ""; this.rect = null; this.scrollLeft = 0; this.scrollTop = 0; this.checked = false;
      this.style = new Proxy({}, { get: (o, p) => (p === "setProperty" ? (a, b) => { o[a] = b; } : p === "getPropertyValue" ? a => o[a] : o[p]), set: (o, p, v) => { o[p] = v; return true; } });
      const eu = this;
      this.classList = { add: (...c) => c.forEach(x => eu._cls.add(x)), remove: (...c) => c.forEach(x => eu._cls.delete(x)), contains: c => eu._cls.has(c),
        toggle: (c, f) => { const on = f === undefined ? !eu._cls.has(c) : !!f; if (on) eu._cls.add(c); else eu._cls.delete(c); return on; } };
    }
    get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
    get className() { return [...this._cls].join(" "); }
    get value() { return this._v ?? ""; } set value(v) { this._v = v; }
    setAttribute(a, v) { this.attrs[a] = String(v); } getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; } removeAttribute(a) { delete this.attrs[a]; }
    get els() { return this.children.filter(c => c instanceof El); }
    appendChild(c) { if (c instanceof El) { c.remove(); c.parentElement = this; } this.children.push(c); return c; }
    // como o append NATIVO: null/undefined viram o texto «null»/«undefined» (o h() de mentira filtra antes, como o ui.h)
    append(...cs) { for (const c of cs) this.appendChild(c instanceof El ? c : { texto: String(c) }); }
    appendFiltrado(...cs) { for (const c of cs.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; this.appendChild(c instanceof El ? c : { texto: String(c) }); } }
    prepend(...cs) { const antigos = this.children; this.children = []; this.append(...cs); this.children.push(...antigos); }
    // plano 1000: como o navegador — referência que não é FILHO direto lança NotFoundError (o bug do «Ver mais», CR-001/002)
    insertBefore(n, ref) { if (ref && !this.children.includes(ref)) throw Object.assign(new Error("NotFoundError: a referência não é filha deste nó"), { name: "NotFoundError" }); n.remove(); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentElement = this; return n; }
    after(...ns) { const p = this.parentElement; if (!p) return; let ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    remove() { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentElement = null; }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    contains(x) { for (let n = x; n; n = n.parentElement) if (n === this) return true; return false; }
    get isConnected() { return doc.body.contains(this); } get offsetWidth() { return 0; } get offsetParent() { return this.parentElement; }
    matches(sel) { return sel.split(",").some(s => this._desc(s.trim().split(/\s+/))); }
    _desc(partes) {
      if (!this._m(partes[partes.length - 1])) return false;
      if (partes.length === 1) return true;
      for (let p = this.parentElement; p; p = p.parentElement) if (p._desc(partes.slice(0, -1))) return true;
      return false;
    }
    _m(s) {
      // lote crm-3: «:checked» também (o rádio marcado do motivo da perda)
      s = s.replace(/'([^']*)'/g, "\"$1\"");          // lote crm-2: [aria-invalid='true'] (aspas simples) como no navegador
      const m = /^([a-z0-9]*)((?:\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\)|:checked)*)$/i.exec(s);
      if (!m) throw new Error("seletor não suportado no DOM de mentira: " + s);
      if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
      for (const p of m[2].match(/\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\)|:checked/g) || []) {
        if (p[0] === ".") { if (!this._cls.has(p.slice(1))) return false; continue; }
        if (p === ":not([hidden])") { if (this.hidden) return false; continue; }
        if (p === ":checked") { if (!this.checked) return false; continue; }
        const a = /^\[([\w-]+)(?:=(?:"([^"]*)"|([\w-]+)))?\]$/.exec(p);
        const esperado = a[2] !== undefined ? a[2] : a[3];
        const v = a[1].startsWith("data-") ? this.dataset[a[1].slice(5)] : this.attrs[a[1]];
        if (v === undefined || v === null || (esperado !== undefined && String(v) !== esperado)) return false;
      }
      return true;
    }
    querySelectorAll(sel) { const out = []; (function ir(n) { for (const c of n.els) { if (c.matches(sel)) out.push(c); ir(c); } })(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
    addEventListener(t, f) { (this._l[t] || (this._l[t] = [])).push(f); } removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
    dispara(t, ev = {}) { for (const f of [...(this._l[t] || [])]) f({ type: t, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
    clique() { this.dispara("click"); }
    click() { this.dispara("click"); }
    getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
    focus() { ativo = this; } blur() { if (ativo === this) ativo = null; } select() {} scrollTo(o) { rolagens.push({ el: this, ...o }); } scrollIntoView() { rolagens.push({ el: this, into: true }); }
    cloneNode() { const c = new El(this.tagName); c._cls = new Set(this._cls); c.attrs = { ...this.attrs }; c.dataset = { ...this.dataset }; return c; }
    get textContent() { return this._t + this.children.map(c => (c instanceof El ? c.textContent : c.texto)).join(""); }
    set textContent(v) { for (const c of this.els) c.parentElement = null; this.children = []; this._t = String(v ?? ""); }
    get innerText() { return this.textContent; }
  }
  const h = (tag, attrs, ...filhos) => {
    const el = new El(tag);
    for (const [a, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (a === "class") [].concat(v).flat(Infinity).filter(Boolean).forEach(c => String(c).split(/\s+/).filter(Boolean).forEach(x => el._cls.add(x)));
      else if (a === "dataset") for (const [x, y] of Object.entries(v)) el.dataset[x] = String(y);
      else if (a === "style") for (const [x, y] of Object.entries(v || {})) el.style[x] = y;
      else if (a === "on") for (const [x, y] of Object.entries(v)) el.addEventListener(x, y);
      else if (a === "hidden" || a === "disabled" || a === "checked" || a === "selected") el[a] = !!v;
      else if (a === "value") el.value = v;
      else el.setAttribute(a, v === true ? "" : v);
    }
    el.appendFiltrado(...filhos);
    return el;
  };
  const daJanela = {}, doDoc = {};
  const doc = { body: new El("body"), hidden: false, get activeElement() { return ativo || this.body; },
    addEventListener: (t, f) => (doDoc[t] || (doDoc[t] = [])).push(f), removeEventListener: (t, f) => { doDoc[t] = (doDoc[t] || []).filter(x => x !== f); },
    getElementById: () => null, querySelector: sel => doc.body.querySelector(sel), elementFromPoint: () => sobOPonto, createTextNode: t => ({ texto: String(t) }) };
  const storage = new Map();
  const globais = { document: doc, addEventListener: (t, f) => (daJanela[t] || (daJanela[t] = [])).push(f), removeEventListener: (t, f) => { daJanela[t] = (daJanela[t] || []).filter(x => x !== f); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    matchMedia: q => ({ matches: !!medias[q] }), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, history: { state: null, replaceState() {} },
    location: { pathname: "/app/", search: "", hash: "#/crm" }, innerHeight: 800, scrollBy() {} };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  return { h, doc, daJanela, doDoc, storage, rolagens, ativo: () => ativo, sob: el => { sobOPonto = el || null; },
    documento: (t, ev = {}) => { for (const f of [...(doDoc[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    janela: (t, ev = {}) => { for (const f of [...(daJanela[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    desfazer() { for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}

/** ui de mentira: o suficiente para as telas do CRM montarem (cada stub devolve um elemento com a classe real). */
function uiDeMentira(h, registro = {}) {
  const seg = o => {
    const el = h("div", { class: ["seg", o.classe], role: "tablist", "aria-label": o.rotulo });
    for (const op of o.opcoes || []) el.appendChild(h("button", { type: "button", class: "seg-op", role: "tab", "aria-selected": String(op.valor === o.valor), dataset: { valor: op.valor },
      on: { click: () => { el.ativar(op.valor); if (o.aoMudar) o.aoMudar(op.valor); } } }, op.rotulo, h("span", { class: "seg-n" })));
    el.valor = o.valor;
    el.ativar = v => { el.valor = v; for (const b of el.querySelectorAll(".seg-op")) b.setAttribute("aria-selected", String(b.dataset.valor === v)); };
    el.contar = (id, n) => { const b = el.querySelectorAll(".seg-op").find(x => x.dataset.valor === id); if (b) b.querySelector(".seg-n").textContent = n == null ? "" : String(n); };
    el.__mudar = v => { el.ativar(v); if (o.aoMudar) o.aoMudar(v); };
    return el;
  };
  return {
    h, limpar: el => { el.textContent = ""; return el; }, icone: n => h("svg", { class: "ic", dataset: { n } }), debounce: f => f,
    cabecalho: o => h("header", { class: "cab" }, h("h1", { class: "cab-titulo" }, o.titulo), o.sub || null, ...[].concat(o.acoes || []).filter(Boolean)),
    segmentado: seg, abas: o => { const el = seg({ ...o, classe: "abas" }); return { el, ativar: el.ativar, contar: el.contar, get ativo() { return el.valor; } }; },
    esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: ["vazio", o.tipo && `vazio-${o.tipo}`] }, o.titulo || ""), erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    brl: (v, o) => `R$ ${o && o.centavos === false ? Math.round(Number(v)) : Number(v).toFixed(2)}`, num: v => String(v), pct: v => `${Math.round(v * 100)}%`,
    relativo: isoT => (Date.parse(isoT) < Date.now() ? "há 2 dias" : "amanhã"), hojeSP: d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10),
    dataBR: () => "04/10/2026", dataCurtaBR: () => "04/10", horaBR: isoT => String(isoT || "").slice(11, 16), dataHoraBR: isoT => `04/10/2026 ${String(isoT || "").slice(11, 16)}`, telBR: t => `(${String(t).slice(2, 4)}) …`,
    avatar: (nome, id) => h("span", { class: "avatar", dataset: { id: String(id) }, title: nome }), pilula: (t, cor, x = {}) => h("span", { class: ["pilula", `pilula-${cor}`, x.class], title: x.title || null, dataset: x.variante ? { variante: x.variante, chave: cor } : null }, String(t ?? cor)),
    etiqueta: e => h("span", { class: "etiq" }, e.nome),
    tabela: o => {
      const el = h("div", { class: "tabela-env" }, h("table", { class: "tabela" }, h("tbody")));
      registro.colunas = o.colunas;
      const api = { el, atualizar(l) { registro.linhas = l; const tb = el.querySelector("tbody"); tb.textContent = ""; for (const x of l) tb.appendChild(h("tr", null, o.colunas.map(c => h("td", null, c.render ? c.render(x) : x[c.chave])))); }, selecionados: () => [] };
      api.atualizar(o.linhas || []);
      return api;
    },
    toast: t => { (registro.toasts || (registro.toasts = [])).push(t); return { fechar() {} }; }, anunciar: t => { (registro.avisos || (registro.avisos = [])).push(t); }, comportamentoRolagem: () => "auto",
    acaoComDesfazer: o => new Promise(res => { (registro.desfazer || (registro.desfazer = [])).push({ ...o, res }); if (o.aplicar) o.aplicar(); }),
    modal: async () => null, confirmar: async () => true, menu: () => ({ fechar() {} }), deslizar: () => {}, flutuante: () => ({ fechar() {} }), carregando: async (b, p) => p,
    campo: o => h("label", { class: "campo", dataset: { campo: o.nome } }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : o.tipo === "select" ? "select" : "input", { name: o.nome, type: o.tipo === "interruptor" ? "checkbox" : "text", value: o.valor ?? "", checked: !!o.valor })),
    seletorEtiquetas: () => h("div", { class: "sel-etiq" }), seletorPessoa: () => h("select", { class: "sel" }), lerForm: () => ({}), marcarErro() {}, copiar: async () => {},
  };
}

function h0(D, ...a) { const el = D.h(...a); D.doc.body.appendChild(el); return el; }
const V = { crm: "CRM", negocio: "Oportunidade", negocios: "Oportunidades", contato: "Paciente", contatos: "Pacientes", servico: "Procedimento", vertical: "odonto",
  ganhar: "Fechou", perder: "Não fechou", min: x => ({ negocios: "oportunidades", negocio: "oportunidade", contato: "paciente", contatos: "pacientes" })[x] || x,
  art: () => "a", novo: x => (x === "contato" ? "Novo paciente" : "Nova oportunidade"), nenhum: () => "Nenhuma oportunidade" };
const ETAPAS = [{ id: "s1", nome: "Nova", tipo: "aberto", marco: "nova", probabilidade: 10, ordem: 1 }, { id: "s2", nome: "Agendada", tipo: "aberto", marco: "agendada", probabilidade: 30, ordem: 2 },
  { id: "s4", nome: "Faltou", tipo: "aberto", marco: "faltou", probabilidade: 10, ordem: 3 },
  { id: "s5", nome: "Fechou", tipo: "ganho", marco: "fechou", probabilidade: 100, ordem: 4 }, { id: "s6", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0, ordem: 5 }];

/**
 * Gaveta do negócio de verdade (crm-negocio.js) com o servidor de mentira: `srv.neg` é o negócio guardado (nx_negocio_ver devolve, nx_negocio_mover e
 * nx_agenda_presenca mudam). `falhas[nome]` = erro a lançar uma vez. ui.modal responde com `respModal` (o valor do ganho, o motivo da perda).
 */
async function montarGaveta(D, { negocio, respModal = {}, falhas = {}, presencaAusente = false, campos = [], contatoVer = null, opts = {}, ver = {}, kx = {} } = {}) {
  const { h } = D;
  const reg = { chamadas: [], gavetas: [], aoMudar: [], toastsO: [] };
  const ui = uiDeMentira(h, reg);
  ui.gaveta = o => { const g = { corpo: h("div", { class: "gaveta-corpo" }), titulo: o.titulo, trocarTitulo(t) { g.titulo = t; }, fechar() { g.fechada = true; if (o.aoFechar) o.aoFechar(); } }; reg.gavetas.push(g); D.doc.body.appendChild(g.corpo); return g; };
  ui.modal = async () => respModal;
  ui.toast = (t, o = {}) => { (reg.toasts || (reg.toasts = [])).push(t); reg.toastsO.push({ t, ...o }); return { fechar() {} }; };
  ui.dataCurtaBR = () => "06/10";
  const srv = { neg: { id: 801, titulo: "Ana Souza", status: "aberto", estagio_id: "s2", funil_id: "f1", valor_previsto: 1200, campos: {}, origem: "whatsapp", ...negocio } };
  const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, conta_no_ads: true, estagios: ETAPAS }], etiquetas: [], usuarios: [], campos, motivos: [{ id: "m1", nome: "Preço" }], ticket: {} };
  const estagio = id => ETAPAS.find(e => e.id === id) || null;
  const k = { ui, h, L, base, v: V, ctx: { cliente: { id: "cli-g" }, navegar() {}, temModulo: () => false, pulso: { assinar: fn => { reg.pulso = fn; return () => { reg.pulso = null; }; } } },
    api: { rpcC: async (nome, p, o = {}) => {
      reg.chamadas.push({ nome, p, o });
      if (falhas[nome]) { const e = falhas[nome]; delete falhas[nome]; throw e; }
      if (nome === "nx_contato_ver") return contatoVer || { contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030" } };
      if (nome === "nx_negocio_ver") return { negocio: { ...srv.neg, id: p.p_id, status: estagio(srv.neg.estagio_id).tipo }, contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030" }, tarefas: [], notas: [], tempo: [], conversas: [], ...ver };
      if (nome === "nx_negocio_mover") { srv.neg.estagio_id = p.p_estagio; if (p.p_extra && p.p_extra.valor != null) srv.neg.valor = p.p_extra.valor; return { id: p.p_id, estagio_id: p.p_estagio }; }
      if (nome === "nx_agenda_presenca") {
        if (presencaAusente) throw Object.assign(new Error("x"), { status: 404, codigo: "Could not find the function public.nx_agenda_presenca(p_estado, p_negocio, p_token) in the schema cache" });
        srv.neg.campos = { ...srv.neg.campos }; if (p.p_estado === "limpar") delete srv.neg.campos.presenca; else srv.neg.campos.presenca = p.p_estado;
        if (p.p_estado === "faltou") srv.neg.estagio_id = "s4";
        return { ok: true, presenca: srv.neg.campos.presenca || null, estagio_id: srv.neg.estagio_id };
      }
      return {};
    } },
    pode: () => true, eu: () => "u1", cor: () => null, usuario: () => null, etiqueta: () => null, motivosPorId: () => ({ m1: "Preço" }),
    toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && (e.codigo || e.message))); }, erro: e => String(e && (e.codigo || e.message)),
    funil: id => base.funis.find(f => f.id === id) || null, funilDoEstagio: () => base.funis[0], funilPadrao: () => base.funis[0], estagio,
    mod: async () => ({ blocoTarefas: () => h("div"), blocoNotas: () => h("div"), blocoTempo: () => h("div") }), criarEtiqueta: async () => null,
    novaReq: () => "req-1", escrever: async (nome, p) => { reg.chamadas.push({ nome, p }); return { resultado: { id: 977, ...p.p_negocio } }; }, rascunho: () => ({ apagar() {} }) };
  { const { ctx: ctxExtra, ...resto } = kx; Object.assign(k, resto); if (ctxExtra) Object.assign(k.ctx, ctxExtra); }      // lote crm-4: extras por teste (vocabulário, módulos)
  const N = await import("../web/app/crm-negocio.js");
  const g = await N.abrirNegocio(k, srv.neg.id, { aoMudar: c => reg.aoMudar.push(c), ...opts });
  const cham = nome => reg.chamadas.filter(c => c.nome === nome);
  const corpo = () => g.corpo;
  return { k, N, g, reg, srv, cham, corpo, desfazer: () => reg.desfazer || [] };
}


/* ============================================================ (b) Kanban */
const ETAPAS_KB = ETAPAS.filter(e => e.id !== "s4");      // Nova · Agendada (marco agendada) · Fechou · Não fechou
const cartoes = (n, est, base = 1, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: base + i, titulo: `C${base + i}`, status: "aberto", estagio_id: est, ordem: (i + 1) * 10, ...extra }));
const col = (estagio_id, itens, total = itens.length) => ({ estagio_id, total, soma_previsto: 0, soma_valor: 0, itens });
const quadroDe = (cols = {}) => ({ colunas: ETAPAS_KB.map(e => cols[e.id] || col(e.id, [])) });

/** O Kanban de verdade com o servidor de mentira. `dados` = objeto (copiado a cada leitura) ou função(p). reg.movidos = o que foi ao nx_negocio_mover. */
async function montarKb(D, { dados, coluna = async () => ({ itens: [], tem_mais: false }), rota = { query: {} }, N = {}, base = {}, rpc = null, usuario = () => null, etiqueta = () => null, kx = {}, ctxx = {}, uix = {}, modx = {} } = {}) {
  const { h } = D;
  const reg = { chamadas: [], movidos: [], abertos: [], prep: [], pulso: null };
  const ui = uiDeMentira(h, reg);
  ui.esqueleto = tipo => h("div", { class: ["esqueleto", `esqueleto-${tipo || "lista"}`] });
  ui.vazio = o => h("div", { class: ["vazio", o.tipo && `vazio-${o.tipo}`] }, o.titulo || "", o.acao ? h("button", { type: "button", class: "vazio-acao", on: { click: o.acao.fn } }, o.acao.rotulo) : null);
  ui.flutuante = (anc, conteudo, o = {}) => {
    const api = { fechar() { if (api.fechado) return; api.fechado = true; conteudo.remove(); if (o.aoFechar) o.aoFechar(); } };
    D.doc.body.appendChild(conteudo); reg.flut = { conteudo, o, api }; return api;
  };
  let atual = typeof dados === "function" ? dados : () => JSON.parse(JSON.stringify(dados));
  const bse = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {}, ...base };
  const Nm = { abrirNegocio: (k, id) => { reg.abertos.push(id); }, novoNegocio() {},
    prepararMovimento: async (k, card, dest) => { reg.prep.push(dest.id); return {}; },
    moverNegocio: async (k, card, dest, o) => { reg.movidos.push({ id: card.id, dest: dest.id, ordem: o.ordem }); return { id: card.id, estagio_id: dest.id }; }, ...N };
  const controles = { el: h("div", { class: "crm-visoes" }), atualizar() {} };
  const k = { ui, h, L, base: bse, G: null, v: V, ctx: { cliente: { id: "cli-p1000" }, titulo() {}, navegar() {}, pulso: { assinar: fn => { reg.pulso = fn; return () => { reg.pulso = null; }; } } },
    mod: async nome => (modx[nome] ? modx[nome] : nome === "visoes" ? { ...VisReal, controlesVisoes: () => controles } : Nm),
    api: { rpcC: async (nome, p) => {
      reg.chamadas.push({ nome, p });
      if (nome === "nx_negocios_coluna") return coluna(p);
      if (nome === "nx_negocios_kanban") return atual(p);
      if (rpc) return rpc(nome, p);
      return {};
    } },
    pode: () => true, eu: () => "u1", cor: c => c || null, usuario, etiqueta, toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && (e.codigo || e.message))); }, erro: e => String(e && e.codigo),
    funil: id => bse.funis.find(f => f.id === id) || null, funilPadrao: () => bse.funis[0], funilDoEstagio: () => bse.funis[0], estagio: id => ETAPAS_KB.find(x => x.id === id) || null, aoBaseMudar: () => () => {} };
  Object.assign(k, kx); Object.assign(k.ctx, ctxx); Object.assign(ui, uix);   // lote crm-2: extras por teste
  const { montarKanban } = await import("../web/app/crm-kanban.js");
  const tela = h0(D, "div", { class: "crm", dataset: { tela: "kanban" } });
  const api = await montarKanban(k, tela, rota);
  return { tela, api, reg, k, controles, ui, trocar: f => { atual = typeof f === "function" ? f : () => JSON.parse(JSON.stringify(f)); },
    cartao: id => tela.querySelector(`.kc[data-id="${id}"]`), lista: est => tela.querySelector(`.kb-lista[data-estagio="${est}"]`), chamadas: nome => reg.chamadas.filter(c => c.nome === nome) };
}
const tecla = (el, key) => el.dispara("keydown", { key, currentTarget: el });

const varias = async (n = 6) => { for (let i = 0; i < n; i++) await tique(); };

const botaoTxt = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent));

/* ============================================================ (b) Contatos, ficha e empresa */
async function montarCt(D, { rpc = null, rota = { query: {} }, base = {}, lista = null } = {}) {
  const { h } = D;
  const reg = { chamadas: [], flut: null };
  const ui = uiDeMentira(h, reg);
  ui.tabela = o => {
    reg.colunas = o.colunas; reg.aoClicar = o.aoClicar;
    const tb = h("tbody");
    const el = h("div", { class: "tabela-env" }, h("table", { class: "tabela" }, h("thead", null, h("tr", null, o.colunas.map(c => h("th", { scope: "col" }, c.rotulo)))), tb));
    return { el, atualizar(l) { ui.limpar(tb); for (const x of l) tb.appendChild(h("tr", null, o.colunas.map(c => h("td", null, c.render ? c.render(x) : x[c.chave])))); }, selecionados: () => [] };
  };
  ui.flutuante = (anc, conteudo, o = {}) => { const api = { fechar() { if (api.fechado) return; api.fechado = true; conteudo.remove(); if (o.aoFechar) o.aoFechar(); } }; D.doc.body.appendChild(conteudo); reg.flut = { conteudo, api }; return api; };
  const bse = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [], ...base };
  const k = { ui, h, L, base: bse, v: V, ctx: { cliente: { id: "cli-ct" }, titulo() {}, navegar: x => { reg.navegou = x; }, temModulo: () => false },
    api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); if (rpc) { const r = await rpc(nome, p); if (r !== undefined) return r; }
      return lista || { itens: [{ id: 1, nome: "Ana" }], total: 2, tem_mais: false }; } },
    pode: () => true, eu: () => "u1", erro: e => String(e && (e.codigo || e.message)), toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && e.codigo)); }, cor: () => null, etiqueta: () => null, usuario: () => null,
    criarEtiqueta: async () => null, novaReq: () => "req-1", escrever: async (nome, p) => { reg.chamadas.push({ nome, p }); return { resultado: { id: 777 } }; },
    mod: async nome => (nome === "visoes" ? { ...VisReal, controlesVisoes: () => ({ el: h("div"), atualizar() {} }) }
      : nome === "negocio" ? import("../web/app/crm-negocio.js")
        : nome === "tarefas" ? { blocoTarefas: () => h("div"), blocoNotas: () => h("div"), blocoTempo: () => h("div"), formTarefa: async () => null } : {}) };
  const M = await import("../web/app/crm-listas.js");
  return { k, reg, ui, M, cham: nome => reg.chamadas.filter(c => c.nome === nome) };
}
const urlFalsa = () => {
  const antes = globalThis.URL;
  const criados = [];
  globalThis.URL = class extends antes { static createObjectURL(b) { criados.push(b); return "blob:x"; } static revokeObjectURL() {} };
  return { criados, desfazer() { globalThis.URL = antes; } };
};


/* ============================================================ (b) Importação */
async function montarImp(D, { rpc = async () => ({}), naoAtualizar = null, Lx = null, uix = {}, kx = {} } = {}) {
  const { h } = D;
  const reg = { chamadas: [] };
  const ui = uiDeMentira(h, reg);
  const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [{ id: "f1", nome: "Pacientes", ativo: true, padrao: true, conta_no_ads: false, estagios: [{ id: "s1", nome: "Nova", tipo: "aberto" }, { id: "s9", nome: "Fechado", tipo: "ganho" }] }] };
  Object.assign(ui, uix);
  const k = { ui, h, L: Lx || L, base, v: V, ctx: { cliente: { id: "cli-i" }, titulo() {}, navegar() {}, naoAtualizar }, api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); return rpc(nome, p); } },
    pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], estagio: id => base.funis[0].estagios.find(e => e.id === id) || null,
    etiqueta: () => null, usuario: () => null, recarregarBase: async () => base, criarEtiqueta: async () => null };
  Object.assign(k, kx);      // plano 1500c: extras por teste (eu, usuarios)
  const { montarImportar } = await import("../web/app/crm-importar.js");
  const tela = h0(D, "div", { class: "crm" });
  const api = await montarImportar(k, tela, {});
  const botao = txt => tela.querySelectorAll("button").find(b => b.textContent.trim() === txt || b.textContent.trim().startsWith(txt));
  return { tela, api, reg, botao };
}


/* ---------- (b) crm.js ---------- */
function ctxCrm(D, { rota, cli, rpc = () => null, chamadas = [], comandos = null }) {
  const U = uiDeMentira(D.h, {});
  U.carregarCss = () => {}; U.esqueleto = () => D.h("div", { class: "esqueleto" });
  return { alvo: h0(D, "main"), versao: `t-${cli}`, rota, ui: U, cliente: { id: cli }, vocab: V, sessao: { conta: { id: "conta-1" } },
    api: { rpcC: async (n, p) => { chamadas.push(n); return rpc(n, p); } }, pode: () => true, titulo() {}, navegar() {}, temModulo: () => false, comandos };
}


/** Seção «Funis e etapas» de verdade (crm-config.js) com o servidor de mentira: guarda as chamadas e o menu ⋮ aberto. */
async function montarFunis(D) {
  const { h } = D;
  const ui = uiDeMentira(h, {});
  const reg = { chamadas: [], menus: {}, toasts: [] };
  ui.toast = t => { reg.toasts.push(t); return { fechar() {} }; };
  ui.menu = (anc, itens) => { reg.menus[anc.attrs["aria-label"]] = itens; return { fechar() {} }; };
  ui.seletorCor = () => h("div");
  const base = { funis: [
    { id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [
      { id: "a1", nome: "Novo", tipo: "aberto", marco: "nova", cor: "#111111", probabilidade: 10, sla_horas: 72 },
      { id: "a2", nome: "Avaliação", tipo: "aberto", marco: "agendada", cor: null, probabilidade: 40, sla_horas: 5 },
      { id: "a3", nome: "Fechou", tipo: "ganho", marco: "fechou", cor: null, probabilidade: 100, sla_horas: null },
      { id: "a4", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", cor: null, probabilidade: 0, sla_horas: null }] },
    { id: "f2", nome: "Pós-venda", ordem: 2, ativo: true, conta_no_ads: false, estagios: [
      { id: "b1", nome: "Novo", tipo: "aberto", marco: null, probabilidade: 10, sla_horas: null },
      { id: "b2", nome: "Feito", tipo: "ganho", marco: null, probabilidade: 100, sla_horas: null },
      { id: "b3", nome: "Desistiu", tipo: "perdido", marco: null, probabilidade: 0, sla_horas: null }] }] };
  const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
    api: { rpcC: async (n, p) => { reg.chamadas.push({ n, p }); if (n === "nx_negocios_kanban") return { colunas: [] }; if (n === "nx_funil_salvar") return { id: p.p_funil.id || "f9", estagios: [] }; return {}; } } };
  const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
  const { secoesConfig } = await import("../web/app/crm-config.js");
  const alvo = h0(D, "div");
  await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo);
  const salvos = () => reg.chamadas.filter(c => c.n === "nx_funil_salvar").map(c => c.p.p_funil);
  return { alvo, reg, base, salvos };
}


const kbVazio = () => quadroDe({ s1: col("s1", cartoes(2, "s1")), s2: col("s2", cartoes(1, "s2", 10)) });
const naoLanca = async fn => { await fn(); for (let i = 0; i < 6; i++) await tique(); };


/* ============================================================ plano 2000d · lote crm-d1 */
const modalFila = respostas => async o => new Promise(res => {
  const api = { fechar: v => res(v), erro() {} };
  if (o.aoAbrir) o.aoAbrir(api);
  const r = respostas.shift();
  if (typeof r === "function") r(o, api); else res(r);
});
const somaTotais = t => t.tela.querySelectorAll(".kc").length;
const decodLink = url => JSON.parse(Buffer.from(/f=([A-Za-z0-9_-]+)$/.exec(url)[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));

test("DR-001/054 · recarga silenciosa que falha sem cache mantém o quadro, deixa o selo âmbar e avisa com «Tentar»", async () => {
  const D = domDeMentira();
  try {
    let falhar = false;
    const t = await montarKb(D, { dados: () => { if (falhar) throw Object.assign(new Error("Failed to fetch"), { codigo: "rede" }); return kbVazio(); } });
    const toasts = []; t.ui.toast = (x, o = {}) => { toasts.push({ x, ...o }); return { fechar() {} }; };
    assert.equal(somaTotais(t), 3);
    falhar = true;
    t.tela.querySelector(".crm-atalho").clique(); await varias();      // «Meus» → carregar silencioso
    assert.equal(somaTotais(t), 3, "o quadro continua com os cartões");
    assert.ok(!t.tela.querySelector(".erro-cartao"), "sem cartão de erro por cima");
    assert.ok(t.tela.querySelector(".crm-kb-idade").classList.contains("velho"));
    assert.ok(toasts.some(x => /^Não consegui atualizar/.test(x.x) && x.acao && x.acao.rotulo === "Tentar"), JSON.stringify(toasts));
    t.tela.querySelector(".crm-atalho").clique(); await varias();
    assert.equal(toasts.filter(x => /^Não consegui atualizar/.test(x.x)).length, 1, "avisa uma vez por sequência de falhas");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-021 · 1ª carga com erro mostra o código para o suporte", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: () => { throw Object.assign(new Error("x"), { status: 500 }); } });
    assert.match(t.tela.querySelector(".kb-erro-cod").textContent, /código http_500/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-002/055 · todo botão do cartão tem nome (texto ou aria-label)", async () => {
  const D = domDeMentira();
  try {
    const dados = quadroDe({ s1: col("s1", [{ id: 1, titulo: "Ana", status: "aberto", estagio_id: "s1", ordem: 10, dono_id: "u2", nao_lidas: 2, contato: { id: 9, nome: "Ana" }, consulta_em: iso(-1) }]) });
    const t = await montarKb(D, { dados, usuario: id => (id === "u2" ? { id: "u2", nome: "Bia" } : null), ctxx: { temModulo: () => true } });
    const bts = t.cartao(1).querySelectorAll("button");
    assert.ok(bts.length >= 3);
    for (const b of bts) assert.ok((b.getAttribute("aria-label") || "").trim() || b.textContent.trim(), `botão sem nome: ${b.className}`);
    assert.equal(t.cartao(1).querySelector(".kc-dono").getAttribute("aria-label"), "Ver só os cartões de Bia");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-003 · «Copiar link com estes filtros» usa o que está no formulário (antes do Aplicar)", async () => {
  const D = domDeMentira();
  try {
    const copiados = [];
    const t = await montarKb(D, { dados: kbVazio(), uix: { copiar: async x => { copiados.push(x); } } });
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    const corpo = t.reg.flut.conteudo;
    const par = corpo.querySelectorAll("select").find(s => s.attrs["aria-label"] === "Parados há"); par.value = "15";
    corpo.querySelector(".crm-filtros-link").clique(); await varias();
    assert.equal(copiados.length, 1);
    assert.equal(decodLink(copiados[0]).parado_dias, 15, "o filtro ainda não aplicado vai no link");
    const de = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados de"), ate = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados até");
    de.value = "2026-10-10"; ate.value = "2026-10-01";
    corpo.querySelector(".crm-filtros-link").clique();
    assert.equal(copiados.length, 1, "com erro não copia");
    assert.equal(de.getAttribute("aria-invalid"), "true");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-004/005/006 · dicas: sem artigo errado, chave por conta e não aparecem sobre o negócio aberto por link", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio(), rota: { partes: ["negocio", "42"], query: {} } });
    assert.ok(!t.tela.querySelector(".kb-tour"), "DR-004: link do negócio → sem dicas por cima da gaveta");
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: kbVazio(), kx: { v: { ...V, crm: "Vendas" } } });
    assert.equal(t2.tela.querySelector(".kb-tour-t").textContent, "Primeira vez neste quadro?", "DR-005");
    t2.tela.querySelector(".kb-tour-ok").clique();
    assert.equal(D.storage.get("nx-app-crm-tour-quadro:cli-p1000:u1"), "1", "DR-006");
    t2.api.desmontar();
    const t3 = await montarKb(D, { dados: kbVazio(), kx: { eu: () => "u7" } });
    assert.ok(t3.tela.querySelector(".kb-tour"), "outra conta no mesmo aparelho vê as dicas");
    t3.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-007/008 · «Sair da apresentação» visível no modo e os grupos com papel", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const sair = t.tela.querySelector(".kb-sair-apres");
    assert.equal(sair.hidden, true);
    t.tela.querySelector(".crm-apresentar").clique();
    assert.ok(t.tela.classList.contains("kb-apresentacao")); assert.equal(sair.hidden, false);
    sair.clique();
    assert.ok(!t.tela.classList.contains("kb-apresentacao")); assert.equal(sair.hidden, true);
    for (const sel of [".crm-chips", ".crm-atalhos"]) assert.equal(t.tela.querySelector(sel).getAttribute("role"), "group", sel);
    t.api.desmontar();
    const { h } = D;
    const vis = VisReal.controlesVisoes({ ui: uiDeMentira(h), h, L, ctx: { cliente: { id: "c" } }, eu: () => "u" }, { tipo: "kanban", obterDados: () => ({ funil: "f1", filtro: {} }), aplicar: async () => {} });
    assert.equal(vis.el.getAttribute("role"), "group");
    vis.desmontar();
  } finally { D.desfazer(); }
});

test("DR-009/061 · contagem da coluna com milhar e «Mostrando N … com os filtros»", async () => {
  const D = domDeMentira();
  try {
    const dados = { ...quadroDe({ s1: col("s1", cartoes(2, "s1"), 1250) }), total_sem_filtro: 2000 };
    const t = await montarKb(D, { dados, uix: { num: v => Number(v).toLocaleString("pt-BR") } });
    assert.match(t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-n').textContent, /^1\.250/);
    assert.equal(t.tela.querySelector(".crm-recorte").hidden, true, "sem filtro não aparece");
    t.tela.querySelector(".crm-atalho").clique(); await varias();
    assert.equal(t.tela.querySelector(".crm-recorte").textContent, "Mostrando 1.250 de 2.000 cartões com os filtros.");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-010 · mais de 2 cartões movidos por outra pessoa viram uma nota com «Ver»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(3, "s1")) }) });
    const toasts = []; t.ui.toast = (x, o = {}) => { toasts.push({ x, ...o }); return { fechar() {} }; };
    t.trocar(quadroDe({ s2: col("s2", cartoes(3, "s2")) }));
    t.tela.querySelector(".crm-atalho").clique(); await varias();
    const nota = toasts.find(x => /3 cartões mudaram de etapa/.test(x.x));
    assert.ok(nota && nota.acao && nota.acao.rotulo === "Ver", JSON.stringify(toasts));
    nota.acao.fn();
    assert.ok(D.rolagens.some(r => r.into), "rola até o primeiro");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-011/012 · «Por pessoa» com ganhos, valor ganho e taxa; o nome filtra o quadro", async () => {
  const D = domDeMentira();
  try {
    const dados = quadroDe({ s1: col("s1", [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, dono_id: "u2", valor_previsto: 100 }]),
      s5: col("s5", [{ id: 2, titulo: "B", status: "ganho", estagio_id: "s5", dono_id: "u2", valor: 900 }, { id: 3, titulo: "C", status: "ganho", estagio_id: "s5", dono_id: "u3", valor: 50 }]),
      s6: col("s6", [{ id: 4, titulo: "D", status: "perdido", estagio_id: "s6", dono_id: "u2" }]) });
    const us = { u2: { id: "u2", nome: "Bia" }, u3: { id: "u3", nome: "Caio" } };
    const t = await montarKb(D, { dados, usuario: id => us[id] || null, uix: { pct: v => `${Math.round(v * 100)}%` } });
    const tab = t.tela.querySelector(".crm-fr-tab-pessoas");
    const linhaBia = tab.querySelectorAll("tbody tr").find(tr => tr.textContent.includes("Bia"));
    const tds = linhaBia.querySelectorAll("td").map(x => x.textContent);
    assert.deepEqual(tds.slice(0, 2), ["1", "R$ 100"]);
    assert.deepEqual(tds.slice(3, 5), ["1", "R$ 900"]);
    assert.match(tds[5], /50/);
    assert.ok(tab.querySelectorAll("tbody tr").some(tr => tr.textContent.includes("Caio")), "quem só tem ganho também aparece");
    tab.querySelector(".crm-fr-pessoa").clique(); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.dono, "u2", "DR-012");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-013/014/016 · etiquetar em lote: só quem não tinha, «(1 já tinha)», «Desfazer» e operação incremental quando o servidor tem", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const itens = [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, etiquetas: [5] }, { id: 2, titulo: "B", status: "aberto", estagio_id: "s1", ordem: 20, etiquetas: [3] }];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { modal: modalFila(respostas) },
      base: { etiquetas: [{ id: 5, nome: "VIP" }] }, etiqueta: id => (id === 5 ? { id: 5, nome: "VIP" } : null) });
    for (const id of [1, 2]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    respostas.push(5);
    t.tela.querySelector(".crm-sel-etq").clique(); await varias(10);
    assert.deepEqual(t.chamadas("nx_negocio_salvar").map(c => c.p.p_negocio), [{ id: 2, etiquetas: [3, 5] }], "DR-016: quem já tinha fica de fora");
    const d = t.reg.desfazer.at(-1);
    assert.equal(d.texto, "Etiqueta «VIP» posta em 1 cartão (1 já tinha).");
    await d.reverter();
    assert.deepEqual(t.chamadas("nx_negocio_salvar").at(-1).p.p_negocio, { id: 2, etiquetas: [3] }, "DR-013: volta à lista de antes");
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { modal: modalFila(respostas) }, rpc: n => (n === "nx_negocios_etiquetar_lote" ? { ok: [2] } : {}),
      base: { etiquetas: [{ id: 5, nome: "VIP" }] }, etiqueta: id => (id === 5 ? { id: 5, nome: "VIP" } : null) });
    for (const id of [1, 2]) t2.cartao(id).dispara("click", { shiftKey: true, target: t2.cartao(id) });
    respostas.push(5);
    t2.tela.querySelector(".crm-sel-etq").clique(); await varias(10);
    assert.deepEqual(t2.chamadas("nx_negocios_etiquetar_lote").map(c => c.p), [{ p_ids: [2], p_adicionar: [5], p_remover: [] }], "DR-014");
    assert.equal(t2.chamadas("nx_negocio_salvar").length, 0);
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-017/018 · ganho em lote com o valor previsto de cada; falha diz quais e oferece «Selecionar só estes»", async () => {
  const D = domDeMentira();
  try {
    const respostas = [], movidos = [];
    const itens = [{ id: 1, titulo: "Ana", status: "aberto", estagio_id: "s1", ordem: 10, valor_previsto: 500 }, { id: 2, titulo: "Bruno", status: "aberto", estagio_id: "s1", ordem: 20, valor_previsto: 300 },
      { id: 3, titulo: "Caio", status: "aberto", estagio_id: "s1", ordem: 30 }];
    let confirmado = null;
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { modal: modalFila(respostas), confirmar: async o => { confirmado = o; return true; } },
      N: { moverNegocio: async (k, c, dest, o) => { if (c.id === 2) throw Object.assign(new Error("x"), { codigo: "bloqueado" }); movidos.push({ id: c.id, dest: dest.id, extra: o.extra }); return {}; } } });
    const toasts = []; t.ui.toast = (x, o = {}) => { toasts.push({ x, ...o }); return { fechar() {} }; };
    for (const id of [1, 2, 3]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    respostas.push("s5");
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(12);
    assert.match(confirmado.texto, /R\$ 800/); assert.match(confirmado.texto, /1 sem valor previsto fica de fora/);
    assert.deepEqual(movidos, [{ id: 1, dest: "s5", extra: { valor: 500 } }]);
    const erro = toasts.find(x => x.tipo === "erro");
    assert.match(erro.x, /1 não foi marcado: «Bruno»/);
    erro.acao.fn();
    assert.equal(t.tela.querySelector(".crm-sel").hidden, false);
    assert.ok(t.tela.querySelector(".crm-sel-n").textContent.startsWith("1 selecionado"));
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-019 · quadro vazio oferece «Importar planilha» a quem pode importar", async () => {
  const D = domDeMentira();
  try {
    const nav = [];
    const vazioComAcoes = o => D.h("div", { class: "vazio" }, o.titulo || "", [...(o.acao ? [o.acao] : []), ...(o.acoes || [])].map(a => D.h("button", { type: "button", on: { click: a.fn } }, a.rotulo)));
    const t = await montarKb(D, { dados: quadroDe(), ctxx: { navegar: x => nav.push(x) }, uix: { vazio: vazioComAcoes } });
    const bt = botaoTxt(t.tela, /^Importar planilha$/);
    assert.ok(bt); bt.clique(); assert.deepEqual(nav, ["#/crm?importar=1"]);
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: quadroDe(), kx: { pode: p => p !== "supervisor" && p !== "admin" }, uix: { vazio: vazioComAcoes } });
    assert.ok(!botaoTxt(t2.tela, /^Importar planilha$/), "atendente não importa");
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-020/052 · pulso com a aba oculta não recarrega; ao voltar recarrega na hora", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const n0 = t.chamadas("nx_negocios_kanban").length;
    D.doc.hidden = true; t.reg.pulso(); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").length, n0);
    D.doc.hidden = false; D.documento("visibilitychange"); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").length, n0 + 1);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-022 · «/» com diálogo aberto não puxa o foco para a busca", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const dlg = h0(D, "dialog", { open: true });
    D.documento("keydown", { key: "/", target: D.doc.body });
    assert.notEqual(D.ativo() && D.ativo().getAttribute("type"), "search");
    dlg.remove();
    D.documento("keydown", { key: "/", target: D.doc.body });
    assert.equal(D.ativo().getAttribute("type"), "search");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-023/024/025/027 · lógica: período do mês, filtros locais e serviços do quadro", () => {
  assert.deepEqual(L.periodoAtalho("mes", "2026-02-14"), { de: "2026-02-01", ate: "2026-02-28" });
  assert.deepEqual(L.periodoAtalho("mes_passado", "2026-01-05"), { de: "2025-12-01", ate: "2025-12-31" });
  assert.equal(L.periodoAtalho("x", "2026-01-05"), null);
  const cs = [{ id: 1, nao_lidas: 2, servico: "Implante", score: 80 }, { id: 2, servico: "implante ", score: 20 }, { id: 3, servico: "Limpeza", score: 50 }];
  assert.deepEqual(L.filtroLocal(cs, { nao_lidas: true }).map(x => x.id), [1]);
  assert.deepEqual(L.filtroLocal(cs, { servico: "Implante" }).map(x => x.id), [1, 2]);
  assert.deepEqual(L.filtroLocal(cs, { temperatura: "morno" }).map(x => x.id), [3]);
  const r = L.aplicarFiltroLocal([{ estagio_id: "s1", total: 5, itens: cs }], { nao_lidas: true });
  assert.equal(r.colunas[0].total, 1); assert.equal(r.parcial, true);
  assert.deepEqual(L.servicosDoQuadro([{ itens: cs }]), ["Implante", "Limpeza"]);
  const link = L.filtroDoLink(L.filtroParaLink({ nao_lidas: true, servico: "Implante", temperatura: "quente" }));
  assert.deepEqual(link, { nao_lidas: true, servico: "Implante", temperatura: "quente" }, "vão no link e na visão salva");
});

test("DR-023/024 · filtros: «Este mês» preenche as datas e «só com não lida» filtra o quadro", async () => {
  const D = domDeMentira();
  try {
    const itens = [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, nao_lidas: 1 }, { id: 2, titulo: "B", status: "aberto", estagio_id: "s1", ordem: 20 }];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { hojeSP: () => "2026-10-15" } });
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    const corpo = t.reg.flut.conteudo;
    botaoTxt(corpo, /^Este mês$/).clique();
    assert.equal(corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados de").value, "2026-10-01");
    assert.equal(corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados até").value, "2026-10-31");
    corpo.querySelectorAll("input").find(x => x.attrs.type === "checkbox" && x.parentElement.textContent.includes("não lida")).checked = true;
    botaoTxt(corpo, /^Aplicar/).clique(); await varias();
    assert.ok(t.cartao(1) && !t.cartao(2), "só o que tem não lida");
    assert.ok(t.tela.querySelectorAll(".crm-chip").some(c => /mensagem não lida/.test(c.textContent)));
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-028/068 · «Mover para…» diz a posição e devolve o foco ao cartão", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio(), uix: { modal: async () => "s2" } });
    const bt = t.cartao(1).querySelector(".kc-mover"); bt.focus();
    bt.clique(); await varias(10);
    assert.match(t.reg.desfazer.at(-1).texto, /para Agendada \(posição 1 de 2\)/);
    assert.equal(D.ativo().dataset.id, "1", "DR-068: o foco está no cartão movido");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-029 · só um cartão na ordem do Tab; focar outro passa o tabindex", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const zeros = () => t.tela.querySelectorAll(".kc").filter(x => x.getAttribute("tabindex") === "0").map(x => x.dataset.id);
    assert.deepEqual(zeros(), ["1"]);
    t.cartao(10).dispara("focus");
    assert.deepEqual(zeros(), ["10"]);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-032/033 · a busca marca o trecho achado e, sem resultado aqui, oferece o outro funil", async () => {
  const D = domDeMentira();
  try {
    const itens = [{ id: 1, titulo: "Ana Souza", status: "aberto", estagio_id: "s1", ordem: 10, telefone: "5512998301199" }];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), rota: { query: { busca: "souza" } } });
    assert.equal(t.cartao(1).querySelector(".kc-t mark").textContent, "Souza");
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), rota: { query: { busca: "1199" } } });
    assert.equal(t2.cartao(1).querySelector(".kc-tel-achado mark").textContent, "1199");
    t2.api.desmontar();
    const f2 = { id: "f2", nome: "Pós", ativo: true, estagios: ETAPAS_KB };
    const t3 = await montarKb(D, { dados: quadroDe(), rota: { query: { busca: "zeca" } }, base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, f2] },
      rpc: n => (n === "nx_negocios_buscar_funis" ? [{ funil_id: "f1", n: 0 }, { funil_id: "f2", n: 2 }] : {}) });
    await varias();
    const b = botaoTxt(t3.tela, /2 em Pós/);
    assert.ok(b, "DR-033");
    b.clique(); await varias();
    assert.equal(t3.chamadas("nx_negocios_kanban").at(-1).p.p_funil, "f2");
    t3.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-034/036/040 · lógica: idade curta, rolagem lenta não levanta o cartão e rodízio", () => {
  assert.equal(L.idadeCurta(5), "há 5 min"); assert.equal(L.idadeCurta(125), "há 2 h"); assert.equal(L.idadeCurta(60 * 49), "há 2 dias");
  const g = L.gestoMover(L.novoGesto(100, 100, 0), 103, 109, 200);
  assert.equal(g.acao, "rolar", "9 px na vertical antes dos 350 ms é rolagem");
  assert.equal(L.gestoMover(L.novoGesto(100, 100, 0), 104, 104, 200).acao, null);
  assert.deepEqual(L.rodizio([1, 2, 3, 4, 5], ["a", "b"]), [{ id: 1, dono_id: "a" }, { id: 2, dono_id: "b" }, { id: 3, dono_id: "a" }, { id: 4, dono_id: "b" }, { id: 5, dono_id: "a" }]);
  assert.deepEqual(L.rodizio([1], []), []);
});

test("DR-035 · «Recolher vazias» é por funil", async () => {
  const D = domDeMentira();
  try {
    const f2 = { id: "f2", nome: "Pós", ativo: true, estagios: ETAPAS_KB };
    const t = await montarKb(D, { dados: kbVazio(), base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, f2] } });
    t.tela.querySelector(".crm-recolher").clique();
    assert.equal(D.storage.get("nx-app-crm-kb-recolher-cli-p1000-u1-f1"), "1");
    D.storage.set("nx-app-crm-kb-recolher-cli-p1000-u1-f2", "0");
    D.documento("keydown", { key: "2", code: "Digit2", altKey: true, target: D.doc.body }); await varias();
    assert.equal(t.tela.querySelector(".crm-recolher").getAttribute("aria-pressed"), "false", "o outro funil tem a sua escolha");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-040/042 · responsável em lote com «Desfazer» e «Distribuir» em rodízio", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const itens = cartoes(3, "s1", 1, { dono_id: "u9" });
    const us = [{ id: "u2", nome: "Bia" }, { id: "u3", nome: "Caio" }];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { modal: modalFila(respostas) }, base: { usuarios: us }, usuario: id => us.find(u => u.id === id) || null });
    for (const id of [1, 2, 3]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    let ops = null;
    respostas.push((o, api) => { ops = o.corpo.querySelectorAll(".kb-mover-nome").map(x => x.textContent); api.fechar("__rodizio__"); });
    t.tela.querySelector(".crm-sel-dono").clique(); await varias(12);
    assert.ok(ops.includes("Distribuir entre 2 pessoas (rodízio)"));
    assert.deepEqual(t.chamadas("nx_negocio_salvar").map(c => c.p.p_negocio.dono_id), ["u2", "u3", "u2"]);
    await t.reg.desfazer.at(-1).reverter();
    assert.deepEqual(t.chamadas("nx_negocio_salvar").slice(3).map(c => c.p.p_negocio.dono_id), ["u9", "u9", "u9"], "DR-042: volta ao de antes");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-044/045/046 · filtros salvos: outra aba aparece sem recarregar, «Salvar como novo» e o nome no título da aba", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h);
    let modalO = null; ui.modal = async o => { modalO = o; return null; };
    ui.lerForm = () => ({ nome: "Quentes 2" });
    const chave = L.chaveVisoesCRM("c", "u", "kanban");
    const dados = { funil: "f1", filtro: { dono: "eu" }, todosFechados: false, fechadosDias: 30 };
    const vis = VisReal.controlesVisoes({ ui, h, L, ctx: { cliente: { id: "c" } }, eu: () => "u" }, { tipo: "kanban", obterDados: () => dados, aplicar: async () => {} });
    assert.equal(vis.el.querySelector(".crm-visoes-select").hidden, true);
    const lista = [{ id: "v1", nome: "Quentes", dados, atualizado_em: 1 }];
    D.storage.set(chave, JSON.stringify(lista));
    D.janela("storage", { key: chave, newValue: JSON.stringify(lista) });
    assert.equal(vis.el.querySelector(".crm-visoes-select").hidden, false, "DR-044");
    assert.equal(vis.nomeAtual(), "Quentes", "DR-046");
    vis.el.querySelector(".crm-visoes-salvar").clique(); await varias();
    const novo = modalO.acoes.find(a => a.rotulo === "Salvar como novo");
    assert.ok(novo, "DR-045");
    novo.fn({ erro() {} });
    assert.deepEqual(JSON.parse(D.storage.get(chave)).map(v => v.nome), ["Quentes", "Quentes 2"]);
    vis.desmontar();
    assert.equal((D.daJanela.storage || []).length, 0);
    const titulos = [];
    const t = await montarKb(D, { dados: kbVazio(), ctxx: { titulo: x => titulos.push(x) },
      modx: { visoes: { ...VisReal, controlesVisoes: () => ({ el: h("div"), atualizar() {}, nomeAtual: () => "Quentes" }) } } });
    assert.equal(titulos.at(-1), "Quentes · CRM");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-047/048 · crm.js: link quebrado sai da barra; fechar a gaveta mantém a busca", () => {
  const src = ler("crm.js");
  assert.match(src, /DR-047[\s\S]{0,200}replaceState\(history\.state, "", `\$\{location\.pathname\}\$\{location\.search\}#\/crm`\)/);
  assert.match(src, /busca=\$\{encodeURIComponent\(bq\)\}/);
});

test("DR-050 · /crm sem a marca no título (white-label)", () => {
  const html = readFileSync(join(RAIZ, "web", "crm", "index.html"), "utf8");
  assert.match(html, /<title>CRM<\/title>/);
  assert.doesNotMatch(html, /<title>[^<]*Órbita/);
});

test("DR-056/064 · «Reabrir» no cartão perdido; cancelar a pergunta diz o que faltou", async () => {
  const D = domDeMentira();
  try {
    let modalO = null;
    const dados = quadroDe({ s1: col("s1", cartoes(1, "s1")), s6: col("s6", [{ id: 7, titulo: "P", status: "perdido", estagio_id: "s6" }]) });
    const t = await montarKb(D, { dados, uix: { modal: async o => { modalO = o; return null; } } });
    t.cartao(7).querySelector(".kc-mover").clique(); await varias();
    const reabrir = modalO.corpo.querySelector(".kb-mover-reabrir");
    assert.ok(reabrir && /volta para «Nova»/.test(reabrir.textContent));
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: kbVazio(), uix: { modal: async () => "s2" }, N: { prepararMovimento: async () => null } });
    const toasts = []; t2.ui.toast = (x, o = {}) => { toasts.push(x); return { fechar() {} }; };
    t2.cartao(1).querySelector(".kc-mover").clique(); await varias(10);
    assert.ok(toasts.includes("Movimento cancelado: faltou a data. O cartão ficou onde estava."), JSON.stringify(toasts));
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-058/060 · «Funil» pelo vocabulário; tirar um chip anuncia quantos cartões ficaram", async () => {
  const D = domDeMentira();
  try {
    const f2 = { id: "f2", nome: "Pós", ativo: true, estagios: ETAPAS_KB };
    const t = await montarKb(D, { dados: kbVazio(), base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, f2] }, kx: { v: { ...V, funil: "Atendimento" } } });
    assert.equal(t.tela.querySelector(".crm-funil-sel").getAttribute("aria-label"), "Atendimento");
    t.tela.querySelector(".crm-atalho").clique(); await varias();
    t.tela.querySelector(".crm-chip button").clique(); await varias();
    assert.ok((t.reg.avisos || []).some(a => /^Filtro tirado: .*3 cartões no quadro\.$/.test(a)), JSON.stringify(t.reg.avisos));
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-026 · filtro por campanha (dos cartões que trazem a campanha) vai no link e filtra o quadro", () => {
  const cs = [{ id: 1, campanha_nome: "Implante Out" }, { id: 2, rastreio: { utm_campaign: "implante out" } }, { id: 3 }];
  assert.deepEqual(L.filtroLocal(cs, { campanha: "Implante Out" }).map(x => x.id), [1, 2]);
  assert.deepEqual(L.servicosDoQuadro([{ itens: cs }], L.campanhaDoCard), ["Implante Out"]);
  assert.equal(L.filtroDoLink(L.filtroParaLink({ campanha: "Implante Out" })).campanha, "Implante Out");
});


/* ============================================================ plano 2000d · lote crm-d2 */
const kMover = (D, reg, extra = {}) => ({ ui: { anunciar: t => { (reg.avisos || (reg.avisos = [])).push(t); }, toast: t => { (reg.toasts || (reg.toasts = [])).push(t); } }, L, v: V,
  eu: () => "u1", erro: e => String(e && e.codigo), api: { rpcC: async (nome, p) => { (reg.chamadas || (reg.chamadas = [])).push({ nome, p }); return { id: 1, ...((p && p.p_tarefa) || {}) }; } }, ...extra });

test("DR-077/113 · a tarefa de retomada (perda) fica com o dono do negócio, não com quem marcou a perda", async () => {
  const N = await import("../web/app/crm-negocio.js");
  const reg = {};
  const k = kMover(null, reg);
  await N.moverNegocio(k, { id: 801, titulo: "Ana", dono_id: "u9", telefone: "5512999990000" }, { id: "s6" }, { extra: { motivo_perda_id: "m1", retomar_dias: 30 } });
  await varias();
  const t = reg.chamadas.find(c => c.nome === "nx_tarefa_salvar").p.p_tarefa;
  assert.equal(t.dono_id, "u9", "antes: dono_id = k.eu() (o gerente que limpou o funil)");
  assert.match(t.titulo, /^Retomar contato — Ana/);
  const reg2 = {};
  await N.moverNegocio(kMover(null, reg2), { id: 802, titulo: "Bia" }, { id: "s6" }, { extra: { retomar_dias: 60 } });
  await varias();
  assert.equal(reg2.chamadas.find(c => c.nome === "nx_tarefa_salvar").p.p_tarefa.dono_id, "u1", "sem dono no cartão: quem marcou");
});

test("DR-084/085 · ganho pergunta o serviço vendido e os próximos passos (recompra e indicação), que viram tarefas", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const reg = {};
    const ui = uiDeMentira(D.h, reg);
    let resposta = null;
    ui.modal = async o => {
      const f = o.corpo;
      f.querySelector('[name="valor"]').value = "1500";
      const srv = f.querySelector('[name="servico_vendido"]'); assert.ok(srv, "DR-085: campo do serviço vendido"); srv.value = "Prótese";
      const rec = f.querySelector('[name="recompra_dias"]'); assert.ok(rec, "DR-084: recompra"); rec.value = "180";
      const ind = f.querySelector('[name="pedir_indicacao"]'); ind.checked = true;
      resposta = o.acoes.find(a => a.fn).fn({ erro() {} });
      return resposta;
    };
    const base = { campos: [], ticket: { Implante: 3000, "Prótese": 2000 }, funis: [{ id: "f1", estagios: ETAPAS }] };
    const k = { ui, h: D.h, L, v: V, base, pode: () => true, eu: () => "u1", estagio: id => ETAPAS.find(e => e.id === id), funilDoEstagio: () => base.funis[0], api: { rpcC: async () => ({}) } };
    const extra = await N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s2", servico: "Implante", valor_previsto: 3000 }, ETAPAS.find(e => e.id === "s5"));
    assert.deepEqual(extra, { valor: 1500, servico_vendido: "Prótese", recompra_dias: 180, pedir_indicacao: true });
    // moverNegocio: o servidor só recebe o valor; o serviço é salvo e as 2 tarefas criadas (com o dono do negócio)
    const r2 = {};
    await N.moverNegocio(kMover(D, r2), { id: 801, titulo: "Ana", dono_id: "u7", telefone: "5512999990000" }, { id: "s5" }, { extra });
    await varias(10);
    assert.deepEqual(r2.chamadas.find(c => c.nome === "nx_negocio_mover").p.p_extra, { valor: 1500 });
    assert.deepEqual(r2.chamadas.find(c => c.nome === "nx_negocio_salvar").p.p_negocio, { id: 801, servico: "Prótese" });
    const tarefas = r2.chamadas.filter(c => c.nome === "nx_tarefa_salvar").map(c => c.p.p_tarefa);
    assert.deepEqual(tarefas.map(t => t.titulo.split(" — ")[0]).sort(), ["Oferecer de novo", "Pedir indicação"]);
    assert.ok(tarefas.every(t => t.dono_id === "u7" && t.negocio_id === 801));
  } finally { D.desfazer(); }
});

test("DR-115 · recarga silenciosa da lista de tarefas que falha mantém a lista e avisa", async () => {
  const D = domDeMentira();
  try {
    const reg = {};
    const ui = uiDeMentira(D.h, reg);
    let falhar = false;
    const itens = [{ id: 1, titulo: "Ligar para Ana", tipo: "tarefa", vence_em: iso(1) }, { id: 2, titulo: "Mandar orçamento", tipo: "tarefa", vence_em: iso(2) }];
    const k = { ui, h: D.h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, usuario: () => null, ctx: { titulo() {}, navegar() {}, cliente: { id: "cli-t2" } },
      api: { rpcC: async nome => {
        if (nome === "nx_tarefa_concluir") return { id: 1, concluida_em: new Date().toISOString() };
        if (falhar) throw Object.assign(new Error("x"), { codigo: "http_502" });
        return { itens, tem_mais: false, contagens: { hoje: 0, atrasadas: 0, proximas: 2 } };
      } } };
    const T = await import("../web/app/crm-tarefas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "proximas" } });
    await varias();
    assert.equal(tela.querySelectorAll(".tf-li").length, 2);
    falhar = true;
    const ck = tela.querySelector(".tf-check input");
    ck.checked = true; ck.dispara("change"); await varias(10);
    assert.equal(tela.querySelectorAll(".erro-cartao").length, 0, "antes: o cartão de erro trocava a lista inteira");
    assert.ok(tela.querySelectorAll(".tf-li").length >= 1, "a lista continua na tela");
    assert.ok((reg.toasts || []).some(t => /Não consegui atualizar a lista/.test(t)));
    api.desmontar();
  } finally { D.desfazer(); }
});

test("DR-117 · LGPD: «Baixar CSV» das tarefas só para quem pode exportar (supervisor ou mais)", async () => {
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const monta = async pode => {
      const k = { ui: uiDeMentira(D.h, {}), h: D.h, L, base: { usuarios: [] }, v: V, pode, eu: () => "u1", toastErro() {}, usuario: () => null, ctx: { titulo() {}, navegar() {}, cliente: { id: "cli-t3" } },
        api: { rpcC: async () => ({ itens: [{ id: 1, titulo: "X", tipo: "tarefa", vence_em: iso(1) }], tem_mais: false, contagens: {} }) } };
      const tela = h0(D, "div", { class: "crm" });
      const api = await T.montarTarefas(k, tela, { query: { aba: "proximas" } });
      await varias();
      const tem = !!tela.querySelector(".tfp-csv");
      api.desmontar(); tela.remove();
      return tem;
    };
    assert.equal(await monta(p => p === "atendente"), false, "atendente não baixa a planilha com telefones da equipe");
    assert.equal(await monta(() => true), true, "supervisor/admin baixa");
  } finally { D.desfazer(); }
});

test("DR-066/067/072 · etapa com cartões fora do prazo avisa no cabeçalho; «Etapa 1 de 4» no celular; lead novo destacado", async () => {
  const D = domDeMentira();
  try {
    const est = ETAPAS_KB.map(e => (e.id === "s1" ? { ...e, sla_horas: 24 } : e));
    const velhos = cartoes(2, "s1", 1, { estagio_em: iso(-3), criado_em: iso(-5) });
    const novo = { id: 9, titulo: "Lead novo", status: "aberto", estagio_id: "s1", ordem: 90, criado_em: new Date(Date.now() - 3600000).toISOString(), estagio_em: new Date(Date.now() - 3600000).toISOString() };
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", [...velhos, novo]) }), base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: est }] } });
    await varias();
    const sla = t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-sla');
    assert.ok(sla && !sla.hidden, "DR-066: antes não havia aviso no cabeçalho");
    assert.equal(sla.textContent, "2 fora do prazo");
    assert.ok(t.tela.querySelector('.kb-col[data-estagio="s1"]').classList.contains("kb-col-alerta"));
    assert.equal(t.tela.querySelector(".kb-fita-pos").textContent, "Etapa 1 de 4", "DR-067");
    assert.ok(t.cartao(9).classList.contains("kc-novo") && t.cartao(9).querySelector(".kc-novo-selo"), "DR-072");
    assert.ok(!t.cartao(1).classList.contains("kc-novo"));
    t.api.desmontar();
  } finally { D.desfazer(); }
  assert.equal(L.contarSla([{ estagio_em: iso(-2) }, { estagio_em: iso(0) }], 24), 1);
  assert.equal(L.leadNovo({ criado_em: iso(-2), estagio_em: iso(-2) }), false, "mais de 24 h");
  assert.equal(L.leadNovo({ criado_em: new Date(Date.now() - 600000).toISOString(), estagio_em: new Date().toISOString() }), false, "já andou de etapa");
});

test("DR-075 · link de filtros com responsável/etiqueta de outra empresa: ignora o que não existe aqui e avisa", async () => {
  const D = domDeMentira();
  try {
    const f = L.filtroParaLink({ dono: "u77", etiquetas: { op: "alguma", ids: ["e1", "e9"] }, parado_dias: 7 });
    const t = await montarKb(D, { dados: kbVazio(), rota: { query: { f } }, etiqueta: id => (id === "e1" ? { id: "e1", nome: "Retorno" } : null) });
    await varias();
    assert.ok((t.reg.toasts || []).some(x => /não existem aqui \(responsável, etiquetas\)/.test(x)), "antes: aplicado calado (quadro vazio sem explicação)");
    const enviado = JSON.stringify(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro);
    assert.ok(!enviado.includes("u77") && !enviado.includes("e9") && enviado.includes("e1"));
    t.api.desmontar();
  } finally { D.desfazer(); }
  const r = L.filtroDoLinkNaBase({ dono: "eu", campo: { chave: "sumiu", op: "igual", valor: "x" } }, { campos: [] });
  assert.deepEqual(r, { filtro: { dono: "eu" }, ignorados: ["campo"] });
});

test("DR-069 · no quadro a folha «?» lista também «/», M, Espaço e X", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const cmds = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} };
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: {} }, cli: "c-d2-kb",
      rpc: n => (n === "nx_crm_base" ? base : n === "nx_negocios_kanban" ? quadroDe({}) : null), comandos: { registrar: c => { cmds.push(c); return () => {}; } } });
    await CRM.montar(ctx);
    const at = id => (cmds.find(c => c.id === id) || {}).atalho;
    assert.equal(at("crm.kb-buscar"), "/");
    assert.equal(at("crm.kb-mover"), "M");
    assert.equal(at("crm.kb-pegar"), "Espaço");
    assert.equal(at("crm.kb-selecionar"), "X");
    CRM.desmontar();
  } finally { D.desfazer(); }
});

test("DR-083 · negócio excluído abre «não encontrada» com «Fechar» (sem o erro genérico com «Tentar de novo»)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { falhas: { nx_negocio_ver: Object.assign(new Error("negocio_nao_encontrado"), { codigo: "negocio_nao_encontrado" }) } });
    assert.equal(t.corpo().querySelectorAll(".erro-cartao").length, 0);
    assert.match(t.corpo().querySelector(".vazio").textContent, /Oportunidade não encontrada/);
  } finally { D.desfazer(); }
});

test("DR-081/082/110/114 · gaveta: e-mail com mailto, aviso de sem contato só fala do anúncio quando veio de anúncio, chance da etapa", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { ver: { contato: { id: 501, nome: "Ana", telefone: "5512998303030", email: "ana@ex.com.br" } } });
    const a = t.corpo().querySelector("a.ng-email");
    assert.ok(a && a.attrs.href === "mailto:ana@ex.com.br", "DR-081");
    assert.equal(t.corpo().querySelector(".ng-chance").textContent, "30% de chance", "DR-110: a etapa Agendada tem 30%");
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  try {
    const t = await montarGaveta(D2, { negocio: { origem: "manual" }, ver: { contato: null } });
    const av = t.corpo().querySelector(".ng-sem-contato").textContent;
    assert.ok(!/anúncio|removido/.test(av), "DR-082: antes dizia «cadastro foi removido… retorno do anúncio» para qualquer negócio");
  } finally { D2.desfazer(); }
  assert.match(L.textoSemContato({ plataforma: "meta" }, V), /retorno do anúncio/, "DR-114");
  assert.equal(L.textoSemContato({ origem: "manual" }, V), "Sem paciente ligado.");
});

test("DR-089/090/092/096/109/111 · gaveta: conversa recente, mensagem pronta, aviso no valor de ganho antigo, campos vazios recolhidos, exclusão conta as tarefas, chamadas em paralelo", async () => {
  const D = domDeMentira();
  try {
    const ordem = [];
    const campos = ["a", "b", "c"].map((c, i) => ({ chave: `c${c}`, rotulo: `Campo ${c}`, tipo: "texto", entidade: "negocio", ordem: i }));
    const t = await montarGaveta(D, { campos, ver: { mensagens_recentes: [{ texto: "Oi, quero marcar", de: "contato", em: iso(0) }], tarefas: [{ id: 1, titulo: "Ligar" }, { id: 2, titulo: "Feita", concluida_em: iso(-1) }] },
      kx: { mod: function () { const kk = this; const orig = kk.api.rpcC; kk.api.rpcC = async (n, p, o) => { ordem.push(n); return orig(n, p, o); };
        return new Promise(r => setTimeout(() => { ordem.push("mod-fim"); r({ blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div"), blocoTempo: () => D.h("div") }); }, 15)); } } });
    assert.ok(ordem.indexOf("nx_negocio_ver") >= 0 && ordem.indexOf("nx_negocio_ver") < ordem.indexOf("mod-fim"), "DR-111: antes esperava o módulo para só então ler o negócio");
    assert.ok(t.corpo().querySelector(".ng-msg.entrada"), "DR-089");
    const det = t.corpo().querySelector("details.ng-campos-vazios");
    assert.ok(det && /Mais campos \(3 vazios\)/.test(det.textContent), "DR-096");
    // DR-090: mensagens prontas
    let itens = null;
    t.k.ui.menu = (anc, its) => { itens = its; return { fechar() {} }; };
    t.corpo().querySelector(".ng-msg-pronta").clique();
    assert.ok(itens && itens.some(i => i.rotulo === "Retomar a conversa"));
    // DR-109: exclusão diz quantas tarefas abertas vão junto
    let conf = null;
    t.k.ui.confirmar = async o => { conf = o; return false; };
    t.corpo().querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    await itens.find(i => i && /^Excluir/.test(i.rotulo)).fn();
    assert.match(conf.texto, /^1 tarefa aberta será apagada junto/);
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  try {
    const t = await montarGaveta(D2, { negocio: { estagio_id: "s5", valor: 900, fechado_em: "2020-01-15T12:00:00Z" } });
    const bloco = t.corpo().querySelectorAll(".ng-campo").find(b => /Valor final/.test(b.textContent));
    assert.ok(bloco && bloco.querySelector(".ed-aviso"), "DR-092: antes o valor do ganho antigo mudava sem aviso");
  } finally { D2.desfazer(); }
  assert.equal(L.ganhoDeMesPassado("2026-09-30T12:00:00Z", "2026-10-01"), true);
  assert.equal(L.ganhoDeMesPassado("2026-10-02T12:00:00Z", "2026-10-25"), false);
  assert.equal(L.chanceDaEtapa({ tipo: "aberto", probabilidade: null }), 10);
});

test("DR-078/079/080 · novo negócio: campos do funil, «De onde veio» e rascunho de nome/telefone/valor", async () => {
  const D = domDeMentira();
  try {
    const campos = [{ chave: "placa", rotulo: "Placa", tipo: "texto", entidade: "negocio", funil_id: "f1", obrigatorio: true }];
    const t = await montarGaveta(D, { campos });
    const chaves = [];
    t.k.rascunho = (campo, chave) => { chaves.push(chave); return { apagar() {} }; };
    t.k.ui.lerForm = () => ({ funil_id: "f1", estagio_id: "s1", origem: "indicacao", campo__placa: "ABC1D23", c_nome: "Bia" });
    const g = await t.N.novoNegocio(t.k, { nome: "Bia" });
    const form = g.corpo.querySelector("form");
    assert.ok(form.querySelector('[name="campo__placa"]'), "DR-078: antes os campos do funil só apareciam depois de criado");
    assert.ok(form.querySelector('[name="origem"]'), "DR-079");
    assert.ok(chaves.some(c => /:c_nome$/.test(c)) && chaves.some(c => /:c_telefone$/.test(c)) && chaves.some(c => /:valor_previsto$/.test(c)), "DR-080");
    form.dispara("submit", { preventDefault() {} }); await varias(8);
    const p = t.cham("nx_negocio_salvar").at(-1).p.p_negocio;
    assert.equal(p.origem, "indicacao", "antes: sempre «manual»");
    assert.deepEqual(p.campos, { placa: "ABC1D23" });
  } finally { D.desfazer(); }
});

test("DR-116/118/121/124/130 · tarefas: chip «Tarefas», «Como foi?» da ligação, cadência pronta, dia da semana e contato pelo id", async () => {
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    // DR-116
    const kt0 = kTarefas2(D, {});
    kt0.nomes = () => ({}); kt0.motivosPorId = () => ({});
    const bloco = h0(D, "div", null, T.blocoTempo(kt0, [{ fonte: "tarefa", id: 1, em: iso(0), tipo: "tarefa_criada" }, { fonte: "nota", id: 2, em: iso(0) }]));
    const chipT = bloco.querySelectorAll(".tempo-filtro").find(c => c.dataset.filtro === "tarefa");
    assert.ok(chipT && !chipT.disabled, "DR-116");
    // DR-118
    const r = {};
    const kt = kTarefas2(D, { reg: r, rpc: async (nome, p) => (nome === "nx_tarefa_concluir" ? { id: p.p_id, concluida_em: iso(0) } : { id: 77, ...(p.p_nota || p.p_tarefa || {}) }) });
    kt.ui.modal = async () => ({ resultado: "nao_atendeu", detalhe: "" });
    const li = T.itemTarefa(kt, { id: 41, titulo: "Ligar para Ana", tipo: "ligacao", vence_em: iso(1), concluida_em: null, negocio: { id: 801 } }, { aoMudar() {} });
    const ck = li.querySelector(".tf-check input"); ck.checked = true; ck.dispara("change"); await varias(8);
    const av = (r.desfazer || []).at(-1);
    assert.equal(av.acao.rotulo, "Como foi?", "antes: só «+ Próxima tarefa»");
    await av.acao.fn(); await varias();
    assert.equal(r.chamadas.find(c => c.nome === "nx_nota_salvar").p.p_nota.texto, "Ligação: não atendeu.");
    assert.equal(r.chamadas.find(c => c.nome === "nx_nota_salvar").p.p_nota.negocio_id, 801);
    // DR-121
    const r2 = {};
    const kc = kTarefas2(D, { reg: r2, rpc: async (nome, p) => ({ id: Math.random(), ...p.p_tarefa }) });
    const bt = T.blocoTarefas(kc, { tarefas: [], negocio_id: 801, dono_id: "u7", nome: "Ana" });
    h0(D, "div", null, bt);
    bt.querySelector(".tf-cadencia").clique(); await varias(10);
    const cs = r2.chamadas.filter(c => c.nome === "nx_tarefa_salvar").map(c => c.p.p_tarefa);
    assert.equal(cs.length, 3);
    assert.ok(cs.every(c => c.negocio_id === 801 && c.dono_id === "u7"));
    assert.equal(bt.querySelectorAll(".tf-li").length, 3);
    // DR-124
    const em3 = new Date(Date.now() + 3 * 86400000).toISOString();
    const li3 = T.itemTarefa(kc, { id: 5, titulo: "X", tipo: "tarefa", vence_em: em3 }, {});
    assert.match(li3.querySelector(".tf-meta").textContent, /(Dom|Seg|Ter|Qua|Qui|Sex|Sáb), \d\d\/\d\d/, "antes: só «04/10 12:00»");
    // DR-130
    const li4 = T.itemTarefa(kc, { id: 6, titulo: "Y", tipo: "tarefa", vence_em: null, contato_id: 55 }, { mostrarVinculo: true });
    assert.equal(li4.querySelector("a.tf-contato-id").attrs.href, "#/contatos/55");
  } finally { D.desfazer(); }
  assert.equal(L.textoResultadoLigacao("retorno", " depois das 18h "), "Ligação: pediu retorno — depois das 18h");
  assert.deepEqual(L.passosCadencia("Ana").map(p => p.dias), [1, 3, 7]);
});

test("DR-126 · gerente em «Todas · Atrasadas» vê quantas atrasadas cada pessoa tem", async () => {
  const D = domDeMentira();
  try {
    const nomes = { u1: "Ana", u2: "Bruno" };
    const itens = [{ id: 1, titulo: "a", tipo: "tarefa", vence_em: iso(-2), dono_id: "u1" }, { id: 2, titulo: "b", tipo: "tarefa", vence_em: iso(-1), dono_id: "u1" }, { id: 3, titulo: "c", tipo: "tarefa", vence_em: iso(-1), dono_id: "u2" }];
    const k = { ui: uiDeMentira(D.h, {}), h: D.h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, usuario: id => (nomes[id] ? { id, nome: nomes[id] } : null),
      ctx: { titulo() {}, navegar() {}, cliente: { id: "cli-t4" } }, api: { rpcC: async () => ({ itens, tem_mais: false, contagens: { atrasadas: 3 } }) } };
    const T = await import("../web/app/crm-tarefas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "atrasadas" } });
    await varias();
    tela.querySelectorAll(".seg-op").find(b => b.dataset.valor === "todos").clique(); await varias();
    const pp = tela.querySelector(".tfp-por-pessoa");
    assert.ok(pp, "antes: nada mostrava de quem eram as atrasadas");
    assert.match(pp.textContent, /Ana 2 · Bruno 1/);
    api.desmontar();
  } finally { D.desfazer(); }
});

function kTarefas2(D, { rpc = async () => ({}), reg = {} } = {}) {
  const ui = uiDeMentira(D.h, reg);
  return { ui, h: D.h, L, v: V, base: { usuarios: [] }, pode: () => true, eu: () => "u1", toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && (e.codigo || e.message))); },
    erro: e => String(e && (e.codigo || e.message)), rascunho: () => ({ apagar() {} }), novaReq: () => "r1", usuario: () => null,
    api: { rpcC: async (nome, p) => { (reg.chamadas || (reg.chamadas = [])).push({ nome, p }); return rpc(nome, p); } } };
}

test("DR-074 · link de filtros vai e volta com acentos e símbolos (serviço «Prótese», campanha «Promoção ção/2026»)", () => {
  const f = { servico: "Prótese parcial", campanha: "Promoção ção/2026 – outubro", dono: "eu" };
  const volta = L.filtroDoLink(L.filtroParaLink(f));
  assert.equal(volta.servico, "Prótese parcial");
  assert.equal(volta.campanha, "Promoção ção/2026 – outubro");
  assert.match(L.filtroParaLink(f), /^[A-Za-z0-9_-]+$/, "sem + / = no endereço");
});

test("DR-086 · motivo de perda com «retomar_dias» já escolhe o lembrete (sem tirar a escolha da pessoa)", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const ui = uiDeMentira(D.h, {});
    let sel = null;
    ui.modal = async o => {
      const f = o.corpo;
      sel = f.querySelector('[name="retomar_dias"]');
      const r = f.querySelectorAll("input").find(x => x.value === "m2" || (x.attrs && x.attrs.value === "m2"));
      r.checked = true;
      f.querySelector(".crm-motivos").dispara("change", { target: r });
      return null;
    };
    const base = { campos: [], ticket: {}, motivos: [{ id: "m1", nome: "Preço" }, { id: "m2", nome: "Sem dinheiro agora", retomar_dias: 90 }], funis: [{ id: "f1", estagios: ETAPAS }] };
    const k = { ui, h: D.h, L, v: V, base, pode: () => true, eu: () => "u1", estagio: id => ETAPAS.find(e => e.id === id), funilDoEstagio: () => base.funis[0], api: { rpcC: async () => ({}) } };
    await N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s2" }, ETAPAS.find(e => e.id === "s6"));
    assert.equal(sel.value, "90", "antes: o lembrete ficava em «Não criar» para qualquer motivo");
  } finally { D.desfazer(); }
});

test("DR-091 · linha do tempo diz quanto tempo o negócio ficou em cada etapa", async () => {
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const k = kTarefas2(D, {});
    k.nomes = () => ({}); k.motivosPorId = () => ({});
    const itens = [{ id: 1, tipo: "negocio_criado", em: iso(-5), dados: {} }, { id: 2, tipo: "estagio", em: iso(-2), dados: { de_nome: "Nova", para_nome: "Agendada" } }];
    const bloco = h0(D, "div", null, T.blocoTempo(k, itens));
    assert.equal(bloco.querySelector(".tempo-ficou").textContent, " · ficou 3 dias em «Nova»");
  } finally { D.desfazer(); }
});

test("DR-101 · aviso de cadastro duplicado também pelo e-mail", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const ui = uiDeMentira(D.h, {});
    const buscas = [];
    const k = { ui, h: D.h, L, v: V, api: { rpcC: async (n, p) => { buscas.push(p.p_filtro.busca); return { itens: [{ id: 9, nome: "Carla Dias", email: "Carla@Ex.com.br" }] }; } } };
    const tel = D.h("input", { name: "c_telefone", value: "" });
    const mail = D.h("input", { name: "c_email", value: "" });
    const caixa = N.avisoDuplicado(k, tel, { inputEmail: mail });
    mail.value = "carla@ex.com.br"; mail.dispara("input"); await varias(6);
    assert.equal(caixa.hidden, false, "antes: só o telefone era conferido");
    assert.match(caixa.textContent, /Já existe: .*Carla Dias/);
    assert.deepEqual(buscas, ["carla@ex.com.br"]);
  } finally { D.desfazer(); }
  assert.equal(L.acharDuplicadoEmail([{ id: 1, email: "a@b.com" }], "A@B.COM", { ignorarId: 1 }), null, "o próprio cadastro não conta");
});

test("DR-053 · sem internet a faixa do quadro diz de quando são os números («mostrando o de HH:MM»)", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    await varias();
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    D.janela("offline"); await varias();
    const fx = t.tela.querySelector(".kb-sem-rede");
    assert.equal(fx.hidden, false);
    assert.match(fx.textContent, /Sem internet — mostrando o de \d\d:\d\d\./, "antes: não dizia de quando era o quadro");
    t.api.desmontar();
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); else delete globalThis.navigator; D.desfazer(); }
});


/* ============================================================ plano 2000d · lote crm-d3 */
test("DR-135/137/139 · ganho: prazo de retorno do serviço escolhe a recompra; «Pedir avaliação» com o link; perda guarda «Perdeu para»", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const ui = uiDeMentira(D.h, {});
    let rec = null, foco = null;
    ui.modal = async o => { rec = o.corpo.querySelector('[name="recompra_dias"]'); foco = o.corpo.querySelector('[name="valor"]'); return null; };
    const base = { campos: [], ticket: {}, retorno_dias: { Limpeza: 180 }, funis: [{ id: "f1", estagios: ETAPAS }] };
    const k = { ui, h: D.h, L, v: V, base, pode: () => true, eu: () => "u1", estagio: id => ETAPAS.find(e => e.id === id), funilDoEstagio: () => base.funis[0], api: { rpcC: async () => ({}) } };
    await N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s2", servico: "limpeza" }, ETAPAS.find(e => e.id === "s5"));
    assert.equal(rec.value, "180", "DR-135: antes a recompra vinha em «Não agendar» para qualquer serviço");
    assert.ok(foco.attrs.autofocus !== undefined, "DR-141: o foco do modal vai para o valor");
    // DR-139
    ui.modal = async o => { o.corpo.querySelector('[name="perdeu_para"]').value = "Clínica X"; return o.acoes.find(a => a.fn).fn({ erro() {} }); };
    k.base.motivos = [];
    const ex = await N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s2" }, ETAPAS.find(e => e.id === "s6"));
    assert.equal(ex.motivo_perda_txt, "Perdeu para: Clínica X");
  } finally { D.desfazer(); }
  const m = L.mensagensProntas({ status: "ganho" }, { nome: "Ana Souza" }, { linkAvaliacao: "https://g.page/r/abc" });
  assert.match(m.find(x => x.id === "avaliacao").texto, /https:\/\/g\.page\/r\/abc/, "DR-137");
  assert.equal(L.recompraDoServico({ "Revisão": 365 }, "revisao"), 365);
  assert.equal(L.juntarPerdeuPara("Achou caro", "Concorrente"), "Achou caro · Perdeu para: Concorrente");
});

test("DR-140/190 · telefone: celular sem o 9 ganha a sugestão; erro com exemplo do formato", () => {
  assert.equal(L.sugestaoNonoDigito("(12) 9830-3030"), "(12) 99830-3030");
  assert.equal(L.sugestaoNonoDigito("(12) 3456-7890"), null, "fixo não é celular");
  assert.match(L.textoTelefoneInvalido("123"), /por exemplo \(12\) 99830-3030/, "DR-190: antes «Use DDD + número.» sem exemplo");
});

test("DR-145/161 · gaveta: T abre Tarefas e N as Notas; a aba fica lembrada ao abrir outro negócio", async () => {
  const D = domDeMentira();
  const ss = new Map();
  const ssAntes = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { value: { getItem: k => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: k => ss.delete(k) }, configurable: true, writable: true });
  try {
    const marcas = [];
    const t = await montarGaveta(D, { kx: { mod: async () => ({ blocoTarefas: () => { marcas.push("tarefas"); return D.h("div", { class: "bloco-tar" }); }, blocoNotas: () => { marcas.push("notas"); return D.h("div", { class: "bloco-notas" }); }, blocoTempo: () => D.h("div") }) } });
    const alvo = t.corpo().querySelector(".ng");
    t.corpo().dispara("keydown", { key: "t", target: alvo });
    assert.ok(t.corpo().querySelector(".bloco-tar"), "DR-145: antes só G e P");
    t.corpo().dispara("keydown", { key: "n", target: alvo });
    assert.ok(t.corpo().querySelector(".bloco-notas"));
    assert.equal(ss.get("nx-app-crm-ng-aba:cli-g"), "notas", "DR-161");
    const t2 = await montarGaveta(D, { kx: { mod: async () => ({ blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div", { class: "bloco-notas2" }), blocoTempo: () => D.h("div") }) } });
    assert.ok(t2.corpo().querySelector(".bloco-notas2"), "abre na aba lembrada");
  } finally { if (ssAntes) Object.defineProperty(globalThis, "sessionStorage", ssAntes); else delete globalThis.sessionStorage; D.desfazer(); }
});

test("DR-148/164 · exemplo de título da oficina com o veículo; jornada com datas na gaveta", async () => {
  assert.equal(L.exemploTituloNegocio("oficina"), "Gol 2015 — troca de embreagem");
  const j = L.jornadaNegocio({ criado_em: "2026-10-01T12:00:00Z", status: "ganho", fechado_em: "2026-10-10T12:00:00Z" },
    [{ tipo: "estagio", em: "2026-10-03T12:00:00Z", dados: { para_nome: "Agendada" } }], { origem: "Anúncio" });
  assert.deepEqual(j.map(x => x.rotulo), ["Chegou · Anúncio", "Agendou", "Fechou"]);
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { criado_em: iso(-5), estagio_id: "s5", fechado_em: iso(-1) } });
    const jo = t.corpo().querySelector(".ng-jornada");
    assert.ok(jo && jo.querySelectorAll(".ng-jornada-it").length === 2, "antes não havia jornada");
  } finally { D.desfazer(); }
});

test("DR-151/152/159 · linha do tempo: o sistema com ícone; todo tipo de evento tem chip; tarefa de WhatsApp abre a conversa", async () => {
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const k = kTarefas2(D, {});
    k.nomes = () => ({}); k.motivosPorId = () => ({});
    const bloco = h0(D, "div", null, T.blocoTempo(k, [{ tipo: "automacao", em: iso(0), dados: {} }]));
    assert.ok(bloco.querySelector(".tempo-sistema"), "DR-151: antes «· Automático» como se fosse uma pessoa");
    // DR-152: cada família da linha do tempo tem o seu chip
    const fams = [{ fonte: "nota" }, { fonte: "tarefa" }, { tipo: "ganho" }, { tipo: "estagio" }, { tipo: "conversa_aberta" }, { tipo: "automacao" }].map(T.familiaTempo);
    const b2 = h0(D, "div", null, T.blocoTempo(k, fams.map((f, i) => ({ ...[{ fonte: "nota" }, { fonte: "tarefa" }, { tipo: "ganho" }, { tipo: "estagio" }, { tipo: "conversa_aberta" }, { tipo: "automacao" }][i], id: i, em: iso(0), dados: {} }))));
    const chips = b2.querySelectorAll(".tempo-filtro").map(c => c.dataset.filtro);
    for (const f of fams) assert.ok(chips.includes(f === "ganho" || f === "estagio" ? "etapas" : f), `chip para ${f}`);
    // DR-159
    k.ctx = { temModulo: m => m === "conversas" };
    const li = T.itemTarefa(k, { id: 3, titulo: "Mandar foto", tipo: "whatsapp", vence_em: iso(1), contato_id: 501 }, {});
    assert.equal(li.querySelector("a.tf-wa").attrs.href, "#/conversas?contato=501");
    k.ctx = { temModulo: () => false };
    const li2 = T.itemTarefa(k, { id: 4, titulo: "Mandar foto", tipo: "whatsapp", contato: { id: 9, telefone: "5512998303030" } }, {});
    assert.match(li2.querySelector("a.tf-wa").attrs.href, /^https:\/\/wa\.me\/5512998303030/);
  } finally { D.desfazer(); }
});

test("DR-165/166/168/169/176 · contatos: colunas Responsável e Cadastrado em; ficha com abertos primeiro, situação, «Marcar consulta» e aviso de dado sensível", async () => {
  const D = domDeMentira();
  try {
    assert.equal(L.ordemAoClicar("criado_em", "nome"), "recentes", "DR-166");
    const neg = L.ordenarNegociosFicha([{ id: 1, status: "ganho", fechado_em: iso(-1) }, { id: 2, status: "aberto", criado_em: iso(-30) }, { id: 3, status: "aberto", criado_em: iso(-2) }]);
    assert.deepEqual(neg.map(n => n.id), [3, 2, 1]);
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana", telefone: "5512998303030" }, rfm: {}, tarefas: [], notas: [], tempo: [], conversas: [],
      negocios: [{ id: 1, titulo: "Implante", status: "ganho", valor: 900 }, { id: 2, titulo: "Limpeza", status: "aberto", valor_previsto: 100 }] } : undefined) });
    let abriu = null;
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    t.k.ctx.carregar = async () => ({ marcarConsulta: async (ctx, o) => { abriu = o; } });
    t.k.ctx.temModulo = m => m === "agenda";
    assert.ok(ler("crm-listas.js").includes("{ chave: \"dono\", rotulo: \"Responsável\"") && ler("crm-listas.js").includes("{ chave: \"criado_em\", rotulo: \"Cadastrado em\""), "DR-165/166");
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    const minis = el.querySelectorAll(".ng-outros .ng-mini");
    assert.match(minis[0].textContent, /Limpeza/, "DR-168: o aberto vem primeiro");
    assert.ok(minis[1].querySelector(".fx-neg-sit"), "DR-168: situação do ganho");
    el.querySelector(".fx-marcar").clique(); await varias();
    assert.equal(abriu.busca, "5512998303030", "DR-169: a agenda abre já buscando o contato");
    assert.match(el.querySelector(".fx-obs-lgpd").textContent, /dados de saúde/, "DR-176 (odonto)");
  } finally { D.desfazer(); }
});

test("DR-174 · LGPD: excluir pergunta o motivo e manda p_motivo; servidor antigo exclui e avisa que o pedido não ficou registrado", async () => {
  const D = domDeMentira();
  try {
    let tentativa = 0;
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_contato_ver") return { contato: { id: 501, nome: "Ana" }, rfm: {}, tarefas: [], notas: [], tempo: [], conversas: [], negocios: [] };
      if (nome === "nx_contato_excluir") { tentativa++; if (p.p_motivo) throw Object.assign(new Error("x"), { status: 404, codigo: "Could not find the function public.nx_contato_excluir(p_confirmacao, p_id, p_motivo, p_token) in the schema cache" }); return { midias_na_fila: 0 }; }
      return undefined;
    } });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    let itens = null; t.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    let modal = null;
    t.ui.modal = async o => { modal = o; return { motivo: "titular" }; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    el.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    await itens.find(i => i && /Excluir cadastro/.test(i.rotulo || "")).fn(); await varias();
    assert.ok(modal.corpo.querySelectorAll('input[type="radio"]').length >= 3, "o motivo é perguntado");
    assert.equal(t.cham("nx_contato_excluir")[0].p.p_motivo, "titular", "antes: nada registrava o pedido do titular");
    assert.equal(tentativa, 2, "servidor antigo: repete sem o motivo");
    assert.ok(t.reg.toasts.some(x => /não guarda o registro do pedido do titular/.test(x)));
  } finally { D.desfazer(); }
});

test("DR-170/173/175 · empresa excluída diz isso; excluir empresa sem «tem certeza?»; dados do titular com as mensagens quando a RPC existir", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: n => { if (n === "nx_empresa_ver") throw Object.assign(new Error("x"), { codigo: "empresa_nao_encontrada" }); return undefined; } });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 7, {});
    assert.equal(el.querySelectorAll(".erro-cartao").length, 0, "antes: erro genérico com «Tentar»");
    assert.match(el.querySelector(".vazio").textContent, /Empresa não encontrada/);
  } finally { D.desfazer(); }
  const src = ler("crm-listas.js");
  assert.ok(!/ui\.confirmar\(\{ titulo: `Excluir a empresa/.test(src), "DR-173");
  // DR-175
  const D2 = domDeMentira();
  const U = urlFalsa();
  try {
    const t = await montarCt(D2, { rpc: n => (n === "nx_contato_exportar_titular" ? { mensagens: [{ em: iso(0), de: "contato", texto: "Oi" }] } : undefined) });
    await t.M.baixarTitularCompleto(t.k, { contato: { id: 501, nome: "Ana" }, negocios: [], tarefas: [], notas: [], conversas: [], tempo: [] });
    const json = JSON.parse(await U.criados[0].text());
    assert.deepEqual(json.mensagens, [{ em: json.mensagens[0].em, de: "contato", texto: "Oi" }], "antes: o arquivo não tinha as mensagens");
  } finally { U.desfazer(); D2.desfazer(); }
});

test("DR-195/196/197/198 · importação: aceita marketing e data de cadastro; CSV de erros com as colunas originais; lote volta a crescer", () => {
  const linhas = L.montarLinhas([["Ana", "sim", "05/03/2020"]], ["nome", "optin_marketing", "criado_em"]);
  assert.equal(linhas[0].optin_marketing, true);
  assert.equal(linhas[0].criado_em, "2020-03-05");
  const m = L.csvErrosImportacao([{ linha: 3, tipo: "Erro", motivo: "Telefone inválido" }, { linha: 3, tipo: "Aviso", motivo: "UF trocada" }],
    { cabecalho: ["Nome", "Telefone"], linhas: [["Ana", "1299"], ["Bia", "12"]], numeros: [2, 3] });
  assert.deepEqual(m.cabecalho, ["linha", "Nome", "Telefone", "situação", "o que corrigir"]);
  assert.deepEqual(m.linhas, [[3, "Bia", "12", "Erro e Aviso", "Telefone inválido · UF trocada"]], "DR-197: antes só linha e motivo");
  let s = { lote: 25, okSeguidos: 0 };
  for (let i = 0; i < 3; i++) { const r = L.loteDepoisDeOk(s.lote, s.okSeguidos + 1); s = r; }
  assert.equal(s.lote, 50, "DR-198: depois de 3 lotes certos, dobra");
  assert.equal(L.loteDepoisDeOk(100, 9).lote, 100);
});

test("DR-149 · valor digitado sem máscara aparece formatado depois de salvo", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const ui = uiDeMentira(D.h, {});
    const k = { ui, h: D.h, L };
    const inp = D.h("input", { type: "text", value: "" });
    const [bloco] = N.linhaEd(k, { rotulo: "Valor previsto", controle: inp, ler: c => L.lerNumero(c.value), salvar: async () => ({}) });
    h0(D, "div", null, bloco);
    inp.value = "1500"; inp.dispara("blur"); await varias();
    assert.equal(inp.value, "1.500,00", "antes: ficava «1500»");
  } finally { D.desfazer(); }
});


/* ============================================================
   plano 2000d · lote crm-d4 — importação, exportação, configurações, ficha, quadro
   ============================================================ */
/** sessionStorage de mentira (some no fim). */
function sessaoFalsa() {
  const ss = new Map();
  const antes = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { value: { getItem: k => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: k => ss.delete(k) }, configurable: true, writable: true });
  return { ss, desfazer() { if (antes) Object.defineProperty(globalThis, "sessionStorage", antes); else delete globalThis.sessionStorage; } };
}

test("DR-200 · importação: datas americanas (12/31/1990) viram a data certa e a prévia avisa; coluna brasileira continua dia/mês", () => {
  assert.equal(L.formatoDatasColuna(["12/31/1990", "05/06/1991"]), "mdy");
  assert.equal(L.formatoDatasColuna(["31/12/1990", "05/06/1991"]), "dmy");
  assert.equal(L.formatoDatasColuna(["12/31/1990", "31/12/1990"]), "dmy", "coluna misturada: fica o padrão brasileiro");
  const ls = L.montarLinhas([["Ana", "12/31/1990"], ["Bia", "05/06/1991"]], ["nome", "nascimento"]);
  assert.deepEqual(ls.map(o => o.nascimento), ["1990-12-31", "1991-05-06"], "antes: «12/31/1990» ficava ilegível e a linha perdia a data");
  assert.deepEqual(L.checarLinha(ls[0]), ["Data no formato americano (mês/dia): lida como mês/dia"]);
  const br = L.montarLinhas([["Ana", "31/12/1990"], ["Bia", "05/06/1991"]], ["nome", "nascimento"]);
  assert.deepEqual(br.map(o => o.nascimento), ["1990-12-31", "1991-06-05"]);
  assert.deepEqual(L.checarLinha(br[1]), []);
  assert.equal(L.lerData("12/31/1990", { mdy: true }), "1990-12-31");
});

test("DR-234 · importação: valor «a combinar» não vai ao servidor (lá virava 0) — a linha entra sem valor e a prévia avisa", () => {
  const [o] = L.montarLinhas([["Ana", "a combinar"]], ["nome", "negocio_valor"]);
  assert.equal(o.negocio_valor, undefined, "antes: «a combinar» ia na linha");
  assert.deepEqual(L.checarLinha(o), ["Valor «a combinar» não é número: entra sem valor"]);
  const [ok] = L.montarLinhas([["Bia", "R$ 1.500,00"]], ["nome", "negocio_valor"]);
  assert.equal(ok.negocio_valor, "R$ 1.500,00");
});

test("DR-205 · importação: planilha suja completa (BOM, ; com aspas, R$, datas misturadas, +55, linhas vazias) passa por lerCSV → montarLinhas → checarLinha", () => {
  const csv = "﻿Nome;Celular;Nascimento;Valor;Observação\r\n" +
    "\"Souza, Ana\";+55 (12) 99830-3030;02/03/1990;R$ 1.500,00;\"disse \"\"oi\"\"\"\r\n" +
    ";;;;\r\n" +
    "Bia;12 98888-1111 / 12 3632-0000;1991-07-08;a combinar;\r\n" +
    "Carlos;(12) 3456-7890;31.12.85;1,234.56;ok\r\n";
  const d = L.lerCSV(csv.replace(/^﻿/, ""));
  const mapa = L.sugerirMapeamento(d.cabecalho);
  assert.deepEqual(mapa, ["nome", "telefone", "nascimento", "negocio_valor", "obs"]);
  const ls = L.montarLinhas(d.linhas, mapa);
  const probs = ls.map(o => L.checarLinha(o, { agora: Date.now() }));
  const cheias = ls.filter((o, i) => !L.linhaVazia(probs[i]));
  assert.equal(cheias.length, 3, "a linha só com ; é pulada");
  assert.equal(cheias[0].nome, "Souza, Ana");
  assert.equal(cheias[0].obs, 'disse "oi"');
  assert.equal(cheias[0].nascimento, "1990-03-02");
  assert.ok(L.normalizarTelefone(cheias[0].telefone), "+55 vale");
  assert.match(cheias[1].obs, /Outros telefones/);
  assert.equal(cheias[1].negocio_valor, undefined, "«a combinar» sai");
  assert.equal(cheias[2].nascimento, "1985-12-31");
  assert.equal(L.lerNumero(cheias[2].negocio_valor), 1234.56);
});

test("DR-238 · tipos de campo com nomes de quem usa («Texto grande», «Sim ou não»)", () => {
  assert.equal(L.TIPOS_CAMPO.texto_longo, "Texto grande (vários parágrafos)", "antes: «Texto longo»");
  assert.equal(L.TIPOS_CAMPO.sim_nao, "Sim ou não", "antes: «Sim/Não»");
  assert.equal(L.TIPOS_CAMPO.multi, "Lista: várias opções");
});

test("DR-339 · download: o link vive 60 s (ou até sair da página) e todas as telas do CRM usam o mesmo helper", () => {
  const ag = [], rev = [], ouv = {};
  const doc = { body: { appendChild() {} }, createElement: () => ({ click() { this.clicou = true; }, remove() {} }) };
  const URLx = { createObjectURL: () => "blob:1", revokeObjectURL: u => rev.push(u) };
  const janela = { addEventListener: (e, f) => { ouv[e] = f; }, removeEventListener: e => { delete ouv[e]; } };
  L.baixarArquivo("a;b", "x.csv", { doc, URLx, agendar: (f, ms) => ag.push({ f, ms }), janela });
  assert.equal(ag[0].ms, 60000, "antes: 2 s (o iPhone baixava vazio)");
  assert.equal(rev.length, 0, "não revoga na hora");
  ouv.pagehide();
  assert.deepEqual(rev, ["blob:1"], "sair da página revoga");
  ag[0].f();
  assert.equal(rev.length, 1, "não revoga duas vezes");
  for (const arq of ["crm-listas.js", "crm-importar.js", "crm-tarefas.js"]) {
    assert.ok(!/revokeObjectURL\(url\), \d+\)/.test(ler(arq)), `${arq}: sem revogar em 2–4 s`);
    assert.ok(/L\.baixarArquivo\(/.test(ler(arq)), `${arq}: usa o helper`);
  }
});

test("DR-340 · «hoje» sem ui.hojeSP é o dia de São Paulo (23h30 em SP não vira amanhã) e o CRM não cai mais no UTC", () => {
  const meiaNoiteUTC = new Date("2026-10-25T02:30:00Z");      // 23h30 de 24/10 em São Paulo
  assert.equal(L.hojeSP(meiaNoiteUTC), "2026-10-24", "antes: toISOString().slice(0,10) = 2026-10-25");
  assert.match(L.hojeSP(), /^\d{4}-\d{2}-\d{2}$/);
  for (const arq of ["crm-tarefas.js", "crm-listas.js", "crm-negocio.js"]) assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(ler(arq)), `${arq}: sem o fallback UTC`);
});

test("DR-341 · copiar funil com nome longo mantém «(cópia)» e numera cópias repetidas", () => {
  const longo = "Funil de pacientes que vieram do anúncio de implante do Google";
  const c = L.nomeCopiaFunil(longo);
  assert.ok(c.length <= 60);
  assert.match(c, / \(cópia\)$/, "antes: o slice(0, 60) cortava o sufixo");
  assert.equal(L.nomeCopiaFunil("Pacientes", ["Pacientes", "Pacientes (copia)"]), "Pacientes (cópia 2)");
  assert.equal(L.nomeCopiaFunil("Pacientes (cópia)", ["Pacientes (cópia)"]), "Pacientes (cópia 2)");
});

test("DR-341/208 · configurações (DOM): «Novo funil» com verbo e o «Duplicar» do funil de nome longo sai com «(cópia)»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    assert.ok(botaoTxt(t.alvo, /^Novo funil$/), "antes: o botão dizia só «Funil»");
    const longo = "Funil de pacientes que vieram do anúncio de implante do Google";
    t.base.funis[0].nome = longo;
    t.alvo.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais ações para Pacientes").clique();
    const itens = t.reg.menus[`Mais ações para Pacientes`];
    const dup = itens && itens.find(x => x && /Duplicar/.test(x.rotulo));
    assert.ok(dup, "menu com Duplicar");
    await dup.fn(); await varias();
    const nome = t.alvo.querySelector('[name="nome"]');
    assert.ok(nome, "editor aberto");
    assert.match(nome.value, / \(cópia\)$/);
    assert.ok(nome.value.length <= 60);
  } finally { D.desfazer(); }
});

test("DR-343 · seletores do crm-config com o id escapado", () => {
  assert.equal(L.escaparCss('a"b'), typeof CSS !== "undefined" && CSS.escape ? CSS.escape('a"b') : 'a\\"b');
  const src = ler("crm-config.js");
  assert.ok(!/data-funil="\$\{f\.id\}"/.test(src), "antes: [data-funil=\"${f.id}\"] sem escape");
  assert.ok(!/data-id="\$\{r\.id\}"/.test(src));
  assert.ok(/data-funil="\$\{L\.escaparCss\(f\.id\)\}"/.test(src));
});

test("DR-209 · descrições das seções sem «venda» fixa", async () => {
  const { secoesConfig } = await import("../web/app/crm-config.js");
  for (const s of secoesConfig) assert.ok(!/venda/i.test(s.desc), `${s.id}: «${s.desc}»`);
});

test("DR-213 · nova etiqueta já vem com a cor menos usada da paleta", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    let cor = null;
    ui.campo = o => { if (o.nome === "cor") cor = o.valor; return h("div", { class: "campo" }, h("input", { name: o.nome, value: o.valor ?? "" })); };
    ui.modal = async () => null;
    const etiquetas = [{ id: "e1", nome: "A", cor: "c0" }, { id: "e2", nome: "B", cor: "c0" }, { id: "e3", nome: "C", cor: "c1" }];
    const base = { funis: [], campos: [], etiquetas };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base, pode: () => true, api: { rpcC: async () => ({}) } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: ["c0", "c1", "c2"] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "etiquetas").montar(ctx, alvo);
    botaoTxt(alvo, /^Nova etiqueta$/).clique(); await varias();
    assert.equal(cor, "c2", "antes: paleta[3 % 3] = c0, a mais usada");
  } finally { D.desfazer(); }
});

test("DR-232 · modelo da planilha com os exemplos da vertical (e ainda reconhecido sozinho)", () => {
  const m = L.modeloImportacao([], { vertical: "odonto" });
  const i = m.cabecalho.indexOf("Título");
  assert.equal(m.linhas[0][i], "Implante superior", "antes: título vazio e exemplos genéricos");
  assert.equal(m.linhas[0][m.cabecalho.indexOf("Etiquetas")], "Implante; Urgência");
  const lido = L.lerCSV(L.gerarCSV(m.cabecalho, m.linhas).slice(1));
  assert.deepEqual(L.checarLinha(L.montarLinhas(lido.linhas, L.sugerirMapeamento(lido.cabecalho))[0]), []);
  assert.equal(L.modeloImportacao([]).linhas[0][i], "", "sem vertical: como antes");
});

test("DR-342 · importação: a coluna Vendedor vira o responsável de cada linha; quem não está na equipe avisa", () => {
  assert.deepEqual(L.sugerirMapeamento(["Nome", "Vendedor"]), ["nome", "responsavel"], "antes: a coluna era ignorada");
  const us = [{ id: "u1", nome: "Bruno Lima", email: "bruno@x.com" }, { id: "u2", nome: "Ana Souza" }, { id: "u3", nome: "Ana Paula" }, { id: "u4", nome: "Zeca", ativo: false }];
  const ls = L.aplicarResponsaveis(L.montarLinhas([["A", "bruno"], ["B", "BRUNO@X.COM"], ["C", "ana"], ["D", "Zeca"], ["E", "ana souza"]], ["nome", "responsavel"]), us);
  assert.deepEqual(ls.map(o => o.dono_id ?? null), ["u1", "u1", null, null, "u2"]);
  assert.ok(ls.every(o => o.responsavel === undefined), "a coluna não vai ao servidor");
  assert.match(L.checarLinha(ls[2]).join(), /Responsável «ana» não está na equipe/);
  assert.equal(L.checarLinha(ls[3]).length, 1, "desativado não recebe");
});

test("DR-199 · importação (DOM): passos já feitos viram botões e voltam ao passo", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    const ta = t.tela.querySelector("textarea");
    ta.value = "Nome;Telefone\nAna;12998303030\n"; ta.dispara("input"); await esperar(300);
    t.botao("Usar o texto colado").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    const passos = t.tela.querySelector(".imp-passos");
    const bts = passos.querySelectorAll("button.imp-passo-bt");
    assert.ok(bts.length >= 1, "antes: os passos eram só texto");
    const atual = passos.querySelectorAll("li").find(li => li.getAttribute("aria-current") === "step");
    assert.ok(atual && !atual.querySelector("button"), "o passo atual não é botão");
    bts[0].clique(); await varias();
    const agora = passos.querySelectorAll("li").findIndex(li => li.getAttribute("aria-current") === "step");
    assert.equal(agora, 0, "voltou ao 1º passo");
  } finally { D.desfazer(); }
});

test("DR-243 · formatarTel: número de fora (+351, +1) não leva a máscara brasileira", () => {
  assert.equal(L.formatarTel("351912345678"), "+351912345678");
  assert.equal(L.formatarTel("15551234567"), "+1 5551234567");
  assert.equal(L.formatarTel("12998303030"), "(12) 99830-3030");
});

test("DR-244 · importação: depois do tempo_esgotado o lote cai pela metade e volta a crescer a cada 3 lotes bons", () => {
  let lote = 100;
  lote = L.metadeLote(lote); assert.equal(lote, 50);
  lote = L.metadeLote(lote); assert.equal(lote, 25);
  let st = { lote, okSeguidos: 0 };
  const seq = [];
  for (let i = 0; i < 9; i++) { st = L.loteDepoisDeOk(st.lote, st.okSeguidos + 1); seq.push(st.lote); }
  assert.deepEqual(seq, [25, 25, 50, 50, 50, 100, 100, 100, 100]);
  assert.equal(L.metadeLote(12), 10, "mínimo 10");
});

test("DR-235/245 · contatos (DOM): só admin vê «Exportar»; a 1ª exportação da sessão lembra a LGPD, a 2ª não pergunta de novo", async () => {
  const D = domDeMentira();
  const S = sessaoFalsa();
  const u = urlFalsa();
  try {
    // supervisor: sem exportar
    const ts = await montarCt(D);
    ts.k.pode = p => p !== "admin";
    const elS = h0(D, "div");
    await ts.M.montarContatos(ts.k, elS, { query: {} }); await varias();
    assert.ok(!elS.querySelectorAll("button").some(b => /Exportar/.test(b.textContent)), "supervisor não exporta (LGPD)");
    // admin
    const t = await montarCt(D, { rpc: n => (n === "nx_contatos_exportar" ? { itens: [{ id: 1, nome: "Ana" }], tem_mais: false } : undefined) });
    const conf = [];
    t.ui.confirmar = async o => { conf.push(o); return true; };
    const el = h0(D, "div");
    await t.M.montarContatos(t.k, el, { query: {} }); await varias();
    const bt = el.querySelectorAll("button").find(b => /^Exportar$/.test(b.textContent.trim()));
    assert.ok(bt, "admin exporta");
    bt.clique(); await varias(12);
    assert.equal(conf.length, 1, "antes: baixava sem lembrar que o arquivo tem dados pessoais");
    assert.match(conf[0].texto, /dados pessoais/);
    assert.equal(u.criados.length, 1, "baixou");
    bt.clique(); await varias(12);
    assert.equal(conf.length, 1, "na mesma sessão não pergunta de novo");
    assert.equal(u.criados.length, 2);
  } finally { u.desfazer(); S.desfazer(); D.desfazer(); }
});

test("DR-245 · LGPD por papel: «Baixar dados do titular» e «Excluir cadastro» só para admin; CSV de tarefas só supervisor+", async () => {
  const D = domDeMentira();
  try {
    for (const [papel, espera] of [["admin", true], ["supervisor", false], ["atendente", false]]) {
      const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? { contato: { id: 9, nome: "Ana", telefone: "12998303030" }, negocios: [], conversas: [] } : undefined) });
      const ordem = ["atendente", "supervisor", "admin"];
      t.k.pode = p => ordem.indexOf(papel) >= ordem.indexOf(p);
      let itens = null;
      t.ui.menu = (anc, xs) => { itens = xs; return { fechar() {} }; };
      t.ui.vazio = o => D.h("div", { class: "vazio" }, o.titulo || "");
      const el = h0(D, "div");
      await t.M.montarFicha(t.k, el, 9); await varias();
      el.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais ações").clique();
      const rot = (itens || []).filter(x => x && x.rotulo).map(x => x.rotulo);
      assert.equal(rot.includes("Baixar dados do titular (LGPD)"), espera, `${papel}: baixar titular`);
      assert.equal(rot.includes("Excluir cadastro (LGPD)"), espera, `${papel}: excluir`);
    }
    assert.ok(/const podeCsv = k\.pode\("supervisor"\)/.test(ler("crm-tarefas.js")), "CSV de tarefas: supervisor+");
  } finally { D.desfazer(); }
});

test("DR-224 · ficha (DOM): botão de copiar ao lado do telefone", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? { contato: { id: 9, nome: "Ana", telefone: "12998303030" }, negocios: [], conversas: [] } : undefined) });
    const copiados = [];
    t.ui.copiar = x => copiados.push(x);
    const el = h0(D, "div");
    await t.M.montarFicha(t.k, el, 9); await varias();
    const b = el.querySelector(".fx-copiar-tel");
    assert.ok(b, "antes: copiar só pelo ⋮");
    assert.match(b.getAttribute("aria-label"), /^Copiar telefone/);
    b.clique();
    assert.equal(copiados.length, 1);
  } finally { D.desfazer(); }
});

test("DR-230 · lista de contatos: a legenda da tabela diz quantos são", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 1240, tem_mais: true } });
    const orig = t.ui.tabela;
    t.ui.tabela = o => { const r = orig(o); r.el.querySelector("table").appendChild(D.h("caption", { class: "sr-only" }, o.rotulo)); return r; };
    const el = h0(D, "div");
    await t.M.montarContatos(t.k, el, { query: {} }); await varias();
    const cap = el.querySelector("caption");
    assert.ok(cap, "tabela com legenda");
    assert.match(cap.textContent, /^Pacientes, 1/, `antes: só «Pacientes» — ${cap.textContent}`);
  } finally { D.desfazer(); }
});

test("DR-240 · novo contato: «Criar também uma oportunidade» abre o formulário do negócio com o cadastro", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { base: { funis: [{ id: "f1", nome: "Pacientes", ativo: true, estagios: [] }] } });
    const real = await import("../web/app/crm-negocio.js");
    const pedidos = [];
    t.k.mod = async nome => (nome === "negocio" ? { ...real, novoNegocio: async (k, o) => { pedidos.push(o); return null; } } : {});
    t.ui.seletorEtiquetas = () => D.h("div");
    t.ui.seletorPessoa = () => D.h("select");
    t.ui.modal = async o => {
      const chk = o.corpo.querySelector('input[name="criar_negocio"]');
      assert.ok(chk, "antes: sem a opção");
      chk.checked = true;
      o.corpo.querySelector('[name="nome"]').value = "Ana";
      const api = { erro() {}, fechar() {} };
      return o.acoes[1].fn(api);
    };
    t.ui.lerForm = f => ({ nome: "Ana", telefone: "", email: "", origem: "manual", cidade: "" });
    const r = await t.M.formContato(t.k, {});
    await varias();
    assert.equal(r.id, 777);
    assert.deepEqual(pedidos, [{ contato_id: 777 }]);
  } finally { D.desfazer(); }
});

test("DR-345 · quadro (DOM): cartões abertos sem responsável aparecem na faixa e «Distribuir» reparte em rodízio", async () => {
  const D = domDeMentira();
  try {
    const dados = quadroDe({ s1: col("s1", cartoes(3, "s1", 1, { dono_id: null })), s2: col("s2", cartoes(1, "s2", 10, { dono_id: "u1" })) });
    const usuarios = [{ id: "u1", nome: "Bruno" }, { id: "u2", nome: "Carla" }];
    const t = await montarKb(D, { dados, base: { usuarios }, rpc: (n, p) => (n === "nx_negocio_salvar" ? { id: p.p_negocio.id, ...p.p_negocio } : {}) });
    await varias();
    const faixa = t.tela.querySelector(".kb-sem-dono");
    assert.ok(faixa && !faixa.hidden, "antes: o lead sem dono ficava parado sem aviso");
    assert.match(faixa.textContent, /3 cartões abertos estão sem responsável/);
    assert.deepEqual(L.cartoesSemDono(dados.colunas, ETAPAS_KB), [1, 2, 3]);
    faixa.querySelector(".kb-sem-dono-bt").clique(); await varias(12);
    const donos = t.chamadas("nx_negocio_salvar").map(c => c.p.p_negocio.dono_id);
    assert.deepEqual(donos, ["u1", "u2", "u1"]);
  } finally { D.desfazer(); }
});

test("DR-346 · quadro (DOM): da conversa de volta ao mesmo lugar — ?de=crm e a rolagem do quadro restaurada", async () => {
  const D = domDeMentira();
  const S = sessaoFalsa();
  try {
    const nav = [];
    const dados = quadroDe({ s1: col("s1", [{ id: 5, titulo: "Ana", status: "aberto", estagio_id: "s1", nao_lidas: 2, contato: { id: 501, nome: "Ana" } }]) });
    const t = await montarKb(D, { dados, ctxx: { temModulo: () => true, navegar: x => nav.push(x) } });
    await varias();
    t.tela.querySelector(".kb").scrollLeft = 340;
    t.cartao(5).querySelector(".kc-naolidas").clique();
    assert.deepEqual(nav, ["#/conversas?contato=501&de=crm"]);
    const guardado = JSON.parse(S.ss.get("nx-app-crm-kb-volta-cli-p1000"));
    assert.equal(guardado.x, 340);
    const t2 = await montarKb(D, { dados });
    await varias();
    assert.equal(t2.tela.querySelector(".kb").scrollLeft, 340, "antes: voltava ao começo do quadro");
    assert.equal(S.ss.has("nx-app-crm-kb-volta-cli-p1000"), false, "usa uma vez só");
  } finally { S.desfazer(); D.desfazer(); }
});

test("DR-314/316 · CSS: anel de foco comum nos controles do CRM e nada pulsa com movimento reduzido", () => {
  const css = ler("crm.css");
  assert.ok(/:is\(\.crm, [^)]*\) :is\(button, a\[href\][^)]*\):focus-visible \{ outline: 2px solid var\(--c-foco\)/.test(css));
  const red = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(/\.kc\.salvando::after/.test(red) && /animation-name: none !important/.test(red), "o «salvando» do cartão para");
  assert.ok(/\.imp-passo-bt \{[^}]*min-height: 44px/.test(css) && /\.fx-copiar-tel \{[^}]*min-width: 44px/.test(css), "alvos de 44 px");
});

test("DR-229 · contatos (DOM): voltar da ficha reabre a lista na mesma rolagem", async () => {
  const D = domDeMentira();
  const histAntes = globalThis.history;
  try {
    const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? { contato: { id: 1, nome: "Ana" }, negocios: [], conversas: [] } : undefined) });
    D.doc.scrollingElement = { scrollTop: 480 };
    globalThis.history = { back() {} };
    const el = h0(D, "div");
    await t.M.montarContatos(t.k, el, { query: {} }); await varias();
    el.querySelector(".ct-nome-link").clique();
    const fx = h0(D, "div");
    await t.M.montarFicha(t.k, fx, 1); await varias();
    fx.querySelector(".fx-voltar").clique();
    D.doc.scrollingElement.scrollTop = 0;
    const el2 = h0(D, "div");
    await t.M.montarContatos(t.k, el2, { query: {} }); await varias();
    assert.equal(D.doc.scrollingElement.scrollTop, 480, "antes: voltava ao topo da lista");
  } finally { globalThis.history = histAntes; D.desfazer(); }
});


/* ============================================================
   plano 2000d · lote crm-d5 — gaveta, rede, teclado, LGPD, importação, textos, papéis
   ============================================================ */
const VocabReal = await import("../web/app/vocab.js");

test("DR-411 · telefone do Google Contatos («::: ») e o filtro de pedaços curtos voltou a valer", () => {
  const r = L.telefoneDaCelula("+55 12 99123-4567 ::: +55 12 3632-0000");
  assert.equal(r.telefone, "+55 12 99123-4567", "antes: «:::» não separava");
  assert.deepEqual(r.extras, ["+55 12 3632-0000"]);
  // o .map(semRamal).filter(...) estava dentro do comentário da linha: «ok» virava um «telefone» a mais
  assert.deepEqual(L.telefoneDaCelula("12 99830-3030 / ok").extras, [], "pedaço sem número não vira telefone extra");
  assert.equal(L.telefoneDaCelula("12 99830-3030 ramal 22 / 12 98888-1111").telefone, "12 99830-3030", "o ramal sai de cada pedaço");
});

test("DR-409/410 · CSV: cabeçalho repetido no meio sai com a conta; quebra de linha e ; dentro de aspas ficam na célula", () => {
  const d = L.lerCSV("Nome;Telefone;Obs\nAna;12998303030;\"linha 1\nlinha 2; com ponto e vírgula\"\nnome ; TELEFONE;obs\nBia;12988881111;");
  assert.equal(d.linhas.length, 3);
  assert.equal(d.linhas[0][2], "linha 1\nlinha 2; com ponto e vírgula", "DR-410: a célula com Enter e ; entre aspas continua uma só");
  const r = L.semCabecalhoRepetido(d.cabecalho, d.linhas);
  assert.equal(r.repetidos, 1, "antes: virava um contato chamado «nome»");
  assert.deepEqual(r.linhas.map(l => l[0]), ["Ana", "Bia"]);
});

test("DR-412 · etapa de fechamento na planilha: diz quantas linhas e o que acontece", () => {
  const est = [{ id: "a", nome: "Nova", tipo: "aberto" }, { id: "g", nome: "Ganho", tipo: "ganho" }];
  const r = L.conferirPlanilha([{ estagio: "Ganho" }, { estagio: "ganho" }, { estagio: "Nova" }], { estagios: est });
  assert.equal(r.avisos[0].codigo, "etapa_fechada");
  assert.equal(r.avisos[0].linhas, 2);
  assert.match(r.avisos[0].texto, /^2 linhas com etapa de fechamento/, "antes: sem a conta");
  assert.match(r.avisos[0].texto, /entram na 1ª etapa aberta/);
});

test("DR-382 · relativo curto: abaixo de 1 min é «agora», nunca «há 0 min»", () => {
  assert.equal(L.idadeCurta(0), "agora");
  assert.equal(L.idadeCurta(0.4), "agora");
  assert.equal(L.idadeCurta(5), "há 5 min");
});

test("DR-381 · datas de outro ano levam o ano («05/03/2024»); do ano corrente, não", async () => {
  const anoPassado = new Date(Date.now() - 400 * 86400000).toISOString();
  const hoje = L.hojeSP();
  assert.match(L.dataCurtaComAno(anoPassado, hoje), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.match(L.dataCurtaComAno(new Date().toISOString(), hoje), /^\d{2}\/\d{2}$/);
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const kt = kTarefas2(D, {});
    kt.ui.horaBR = () => "14:10"; kt.ui.hojeSP = d => L.hojeSP(d); kt.ui.dataCurtaBR = iso => String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7); kt.ui.relativo = () => "há 1 ano";
    const li = h0(D, "div", null, T.itemTarefa(kt, { id: 1, titulo: "Ligar", tipo: "ligar", concluida_em: anoPassado, vence_em: anoPassado }));
    assert.match(li.textContent, /feita \d{2}\/\d{2}\/\d{4} às 14:10/, `antes: «feita 05/03» sem o ano — ${li.textContent}`);
  } finally { D.desfazer(); }
});

test("DR-421/422/423/424 · lógica: previsto × fechado, serviço com a grafia existente e o limite único", () => {
  assert.deepEqual(L.comparaPrevistoFechado(1000, 920), { tipo: "desconto", pct: 8, diferenca: -80 });
  assert.equal(L.comparaPrevistoFechado(1000, 1100).tipo, "acima");
  assert.equal(L.comparaPrevistoFechado(null, 900), null);
  assert.equal(L.servicoExistente(["Implante", "Limpeza"], " implante "), "Implante");
  assert.equal(L.servicoExistente(["Implante"], "Coroa"), null);
  assert.equal(L.LIMITE_SERVICO, 120);
  assert.ok(!/maxlength: 120|max: 120, placeholder: servicos/.test(ler("crm-negocio.js").split("\n").filter(l => /servico/i.test(l)).join("\n")), "DR-424: os campos de serviço usam L.LIMITE_SERVICO");
});

test("DR-392/421/422 · gaveta (DOM): «Não quer marketing» no negócio e o desconto no ganho", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { estagio_id: "s5", valor: 920, valor_previsto: 1000 },
      ver: { contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030", optin_marketing: false } } });
    await varias();
    assert.ok(t.corpo().querySelector(".ng-sem-mkt"), "DR-392: antes o opt-out só aparecia na ficha");
    const cmp = t.corpo().querySelector(".ng-valor-cmp");
    assert.ok(cmp, "DR-421: o previsto ao lado do fechado");
    assert.match(cmp.textContent, /desconto de 8%/);
  } finally { D.desfazer(); }
});

test("DR-423 · gaveta (DOM): «implante » vira «Implante» antes de gravar", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    t.k.base.ticket = { Implante: 3000 };
    t.reg.chamadas.length = 0;
    // redesenha com o ticket (a lista de serviços vem da base)
    const g2 = await t.N.abrirNegocio(t.k, 801, {});
    await varias();
    const inp = g2.corpo.querySelectorAll("input").find(i => /Ex\.: Implante/.test(i.getAttribute("placeholder") || ""));
    assert.ok(inp, "campo de serviço");
    inp.value = "implante "; inp.dispara("change"); inp.dispara("blur"); await varias();
    const s = t.cham("nx_negocio_salvar").map(c => c.p.p_negocio.servico).filter(Boolean);
    assert.deepEqual(s, ["Implante"], "antes: gravava «implante» como outro serviço");
    assert.equal(inp.value, "Implante");
  } finally { D.desfazer(); }
});

test("DR-359 · gaveta: com o cartão do quadro, título e valor aparecem antes da leitura chegar", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    t.k.api.rpcC = () => new Promise(() => {});      // rede parada (3G)
    t.N.abrirNegocio(t.k, 802, { previa: { titulo: "Bruno Lima", valor_previsto: 1500, status: "aberto" } });
    await varias();
    const g = t.reg.gavetas.at(-1);
    const pv = g.corpo.querySelector(".ng-previa");
    assert.ok(pv, "antes: só o esqueleto");
    assert.equal(pv.querySelector(".ng-previa-t").textContent, "Bruno Lima");
    assert.ok(g.corpo.querySelector(".esqueleto"), "o resto continua carregando");
  } finally { D.desfazer(); }
});

test("DR-360/362 · gaveta (DOM): no celular o campo focado vai ao meio da tela; rede lenta mostra «Salvando…»", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const t = await montarGaveta(D, {});
    await varias();
    const inp = t.corpo().querySelectorAll("input").find(i => i.getAttribute("inputmode") === "decimal");
    assert.ok(inp, "campo de valor");
    await esperar(120);      // o foco inicial da gaveta (no título, 60 ms) já passou
    inp.focus(); inp.dispara("focus");
    await esperar(350);
    assert.ok(D.rolagens.some(r => r.el === inp && r.into), "DR-360: antes o teclado cobria o campo");
    const orig = t.k.api.rpcC;
    let soltar = null;
    t.k.api.rpcC = async (n, p, o) => { if (n === "nx_negocio_salvar") await new Promise(r => { soltar = r; }); return orig(n, p, o); };
    inp.value = "1.700,00"; inp.blur(); inp.dispara("blur");
    await esperar(500);
    const st = inp.parentElement.querySelector(".ed-ok");
    assert.ok(st && !st.hidden && st.textContent === "Salvando…", "DR-362: antes nada dizia que estava salvando");
    soltar(); await varias();
    assert.equal(st.textContent, "Salvo");
  } finally { D.desfazer(); }
});

test("DR-371 · novo negócio: Ctrl/⌘+Enter cria", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    const g = await t.N.novoNegocio(t.k, {});
    await varias();
    const form = g.corpo.querySelector("form");
    let enviou = 0;
    form.requestSubmit = () => { enviou++; };
    form.dispara("keydown", { key: "Enter", ctrlKey: true });
    form.dispara("keydown", { key: "Enter", metaKey: true });
    form.dispara("keydown", { key: "Enter" });
    assert.equal(enviou, 2, "antes: só com o mouse");
  } finally { D.desfazer(); }
});

test("DR-393 · etiquetar em lote com quem não quer marketing pede confirmação (e respeita o «não»)", async () => {
  const D = domDeMentira();
  try {
    const respostas = [5];
    const itens = [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, contato: { id: 9, optin_marketing: false } }, { id: 2, titulo: "B", status: "aberto", estagio_id: "s1", ordem: 20 }];
    const conf = [];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", itens) }), uix: { modal: modalFila(respostas), confirmar: async o => { conf.push(o); return false; } },
      base: { etiquetas: [{ id: 5, nome: "Promo" }] }, etiqueta: id => (id === 5 ? { id: 5, nome: "Promo" } : null) });
    for (const id of [1, 2]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    t.tela.querySelector(".crm-sel-etq").clique(); await varias(10);
    assert.equal(conf.length, 1, "antes: etiquetava sem avisar");
    assert.match(conf[0].texto, /1 dos selecionados não quer receber marketing/);
    assert.equal(t.chamadas("nx_negocio_salvar").length, 0, "não confirmou: nada gravado");
    assert.equal(L.contarSemMarketing([{ optin_marketing: false }, { contato: { optin_marketing: false } }, {}]), 2);
  } finally { D.desfazer(); }
});

test("DR-413 · importação terminada: «Ver o Início» junto de «Ver os novos»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D, { rpc: async n => (n === "nx_contatos_importar" ? { criados: 1, atualizados: 0, ignorados: 0, erros: [], importacao_id: "i1" } : {}) });
    t.api && t.api;
    const ta = t.tela.querySelector("textarea");
    ta.value = "Nome;Telefone\nAna;12998303030\n"; ta.dispara("input"); await esperar(300);
    t.botao("Usar o texto colado").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.tela.querySelectorAll("button").find(b => /^Importar 1 linha$/.test(b.textContent.trim())).clique();
    await esperar(400); await varias(20);
    const ini = t.tela.querySelector(".imp-ver-inicio");
    assert.ok(ini, "antes: terminava só na lista de contatos");
    assert.equal(ini.attrs.href, "#/inicio");
  } finally { D.desfazer(); }
});

test("DR-417/420 · configurações: contador perto das 40 letras da etapa e «Conta nos anúncios» explicado", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    botaoTxt(t.alvo, /^Novo funil$/).clique(); await varias();
    const nome = t.alvo.querySelector(".fe-nome");
    const cont = nome.parentElement.querySelector(".fe-nome-cont");
    assert.ok(cont && cont.hidden, "curto: sem contador");
    nome.value = "Avaliação marcada com o dentista resp"; nome.dispara("input");
    assert.equal(cont.hidden, false);
    assert.equal(cont.textContent, `${[...nome.value].length}/40`, "antes: o maxlength cortava calado");
    assert.match(ler("crm-config.js"), /As vendas deste funil contam no retorno dos anúncios/);
  } finally { D.desfazer(); }
});

test("DR-425/430/432 · textos com o vocabulário de cada vertical concordam (placeholder da observação, coluna de abertos, novo)", () => {
  const esperado = { odonto: ["Observações sobre esta oportunidade", "Oportunidades abertas", "Nova oportunidade"], oficina: ["Observações sobre este orçamento", "Orçamentos abertos", "Novo orçamento"],
    loja: ["Observações sobre esta venda", "Vendas abertas", "Nova venda"], generico: ["Observações sobre este negócio", "Negócios abertos", "Novo negócio"] };
  const neg = ler("crm-negocio.js"), lis = ler("crm-listas.js");
  assert.ok(neg.includes("placeholder: `Observações sobre ${k.v.art(\"negocio\") === \"a\" ? \"esta\" : \"este\"} ${k.v.min(\"negocio\")}`"), "a frase da observação é esta");
  assert.ok(lis.includes("rotulo: `${k.v.negocios} abert${k.v.art(\"negocio\")}s`"), "a coluna é esta");
  for (const vert of VocabReal.VERTICAIS) {
    const v = VocabReal.vocab(vert);
    const obs = `Observações sobre ${v.art("negocio") === "a" ? "esta" : "este"} ${v.min("negocio")}`;
    const col = `${v.negocios} abert${v.art("negocio")}s`;
    assert.deepEqual([obs, col, v.novo("negocio")], esperado[vert], vert);
  }
});

test("DR-433 · papel × botão: quem só lê não vê botões de escrita no quadro, nos contatos e na ficha", async () => {
  const D = domDeMentira();
  try {
    const leitura = () => false;
    const kb = await montarKb(D, { dados: kbVazio(), kx: { pode: leitura } });
    await varias();
    assert.ok(!kb.tela.querySelector(".kc-mover"), "quadro: sem «Mover para…»");
    assert.ok(!kb.tela.querySelector(".kb-sem-dono"), "quadro: sem distribuir");
    assert.ok(!kb.tela.querySelectorAll("button").some(b => /^Nova oportunidade$/.test(b.textContent.trim())), "quadro: sem «Nova»");
    const ct = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? { contato: { id: 9, nome: "Ana", telefone: "12998303030" }, negocios: [], conversas: [] } : undefined) });
    ct.k.pode = leitura;
    const el = h0(D, "div");
    await ct.M.montarContatos(ct.k, el, { query: {} }); await varias();
    const rot = el.querySelectorAll("button, a").map(b => b.textContent.trim());
    assert.ok(!rot.some(x => /Exportar|Importar|Novo paciente/.test(x)), `contatos: ${rot.join(" | ")}`);
    let itens = null;
    ct.ui.menu = (anc, xs) => { itens = xs; return { fechar() {} }; };
    const fx = h0(D, "div");
    await ct.M.montarFicha(ct.k, fx, 9); await varias();
    fx.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais ações").clique();
    const r = (itens || []).filter(x => x && x.rotulo).map(x => x.rotulo);
    assert.ok(!r.some(x => /Excluir|Baixar dados|Nova tarefa/.test(x)), `ficha: ${r.join(" | ")}`);
  } finally { D.desfazer(); }
});

test("DR-358/367/368/376/377/390 · CSS: colunas em rem no tablet, faixas soltas em tela baixa, 44 px no toque, números tabulares, etiqueta escura visível e contato borrado na apresentação", () => {
  const css = ler("crm.css");
  const b = css.slice(css.indexOf("plano 2000d · lote crm-d5"));
  assert.ok(/@media \(min-width: 761px\) and \(max-width: 1180px\) \{\s*\.kb \{ grid-auto-columns: minmax\(15rem, 17\.5rem\)/.test(b), "DR-358");
  assert.ok(/@media \(max-height: 520px\) \{[^}]*\.kb-fita[^}]*position: static/.test(b), "DR-367");
  assert.ok(/@media \(pointer: coarse\) \{\s*\.kc-mover \{ width: 44px; height: 44px; \}/.test(b), "DR-368");
  assert.ok(/\.kc-valor[^{]*\{ font-variant-numeric: tabular-nums; \}/.test(b), "DR-376");
  assert.ok(/\.kc-etq1 \{ border-color: color-mix\(in srgb, var\(--cor, var\(--c-borda-2\)\) 70%, var\(--c-texto-3\)\); \}/.test(b), "DR-377");
  assert.ok(/\.crm\.kb-apresentacao \.kc-s\.dado-pessoal[^{]*\{ filter: blur\(6px\); \}/.test(b), "DR-390");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(b) && !/\brgba?\(/.test(b), "só tokens");
});

/* ============================================================ plano 2000d · complemento crm (PX-001…) */
test("PX-001/002/003 · lerNumero: «+1.500», moeda por extenso («1.500,00 reais», «BRL 300») e «,50» sem o zero", () => {
  assert.equal(L.lerNumero("+1.500"), 1500);
  assert.equal(L.lerNumero("+R$ 2.000"), 2000);
  assert.equal(L.lerNumero("1.500,00 reais"), 1500);
  assert.equal(L.lerNumero("BRL 300"), 300);
  assert.equal(L.lerNumero("1 real"), 1);
  assert.equal(L.lerNumero(",50"), 0.5);
  assert.equal(L.lerNumero("-,5"), -0.5);
  assert.equal(L.lerNumero("abc"), null, "texto continua não sendo número");
  assert.equal(L.lerNumero("12,5%"), null);
});

test("PX-004/005/006/007 · lerData: hora «às 14:30»/«14h30», AAAA.MM.DD, AAAAMMDD e o mês por extenso", () => {
  assert.equal(L.lerData("31/12/1990 às 14:30"), "1990-12-31");
  assert.equal(L.lerData("31/12/1990 14h30"), "1990-12-31");
  assert.equal(L.lerData("31/12/1990 14h"), "1990-12-31");
  assert.equal(L.lerData("2020.02.01"), "2020-02-01");
  assert.equal(L.lerData("20200201"), "2020-02-01");
  assert.equal(L.lerData("12345678"), null, "8 dígitos fora de 1900–2100 não é data");
  assert.equal(L.lerData("20201301"), null, "mês 13 não existe");
  assert.equal(L.lerData("31 de dezembro de 1990"), "1990-12-31");
  assert.equal(L.lerData("1 de março de 2020"), "2020-03-01");
  assert.equal(L.lerData("31 dez 1990"), "1990-12-31");
  assert.equal(L.lerData("31/dez/90", { passado: true }), "1990-12-31");
  assert.equal(L.lerData("31 de fevereiro de 2020"), null, "dia que não existe");
  assert.equal(L.lerData("31 de abobrinha de 2020"), null);
});

test("PX-008/019 · telefone da planilha: «0055…» vira +55 e o código da operadora («015 12 …») sai", () => {
  const a = L.telefoneDaCelula("0055 12 99830 3030");
  assert.equal(a.telefone, "+55 12 99830 3030");
  assert.equal(L.normalizarTelefone(a.telefone), "5512998303030");
  assert.equal(L.telefoneDaCelula("001 415 555 0100").telefone, "+1 415 555 0100");
  const b = L.telefoneDaCelula("015 12 99830-3030");
  assert.equal(L.normalizarTelefone(b.telefone), "5512998303030");
  assert.equal(L.telefoneDaCelula("(12) 99830-3030").telefone, "(12) 99830-3030", "número comum fica como veio");
});

test("PX-009/053 · e-mail com espaço em volta do @ vale (planilha, campo personalizado)", () => {
  assert.deepEqual(L.emailDaCelula("Ana @ X.com"), { email: "ana@x.com", extras: [] });
  assert.equal(L.validarCampo({ tipo: "email", rotulo: "E" }, " Ana @ x.com "), null);
  assert.equal(L.normalizarCampo({ tipo: "email" }, " Ana @ X.COM "), "ana@x.com");
  assert.equal(L.validarCampo({ tipo: "email", rotulo: "E" }, "ana x.com"), "E-mail inválido.");
});

test("PX-010 · sugestaoEmail: letra dobrada e trocada («gmail.comm», «gmali.com», «hotamil.com»)", () => {
  assert.equal(L.sugestaoEmail("ana@gmail.comm"), "ana@gmail.com");
  assert.equal(L.sugestaoEmail("ana@gmali.com"), "ana@gmail.com");
  assert.equal(L.sugestaoEmail("ana@gmaill.com"), "ana@gmail.com");
  assert.equal(L.sugestaoEmail("ana@hotamil.com"), "ana@hotmail.com");
  assert.equal(L.sugestaoEmail("ana@outlook.comm"), "ana@outlook.com");
  assert.equal(L.sugestaoEmail("ana@gmail.com"), null);
});

test("PX-011 · csvCampo: «-» e «---» (sem valor) não ganham o apóstrofo; fórmula continua protegida", () => {
  assert.equal(L.csvCampo("-"), "-");
  assert.equal(L.csvCampo("---"), "---");
  assert.equal(L.csvCampo("-x"), "'-x");
  assert.equal(L.csvCampo("=1+1"), "'=1+1");
});

test("PX-012 · exportação: CPF com máscara (o Excel não come o zero da frente)", () => {
  const { linhas, cabecalho } = L.linhasExportacao([{ nome: "Ana", documento: "01234567890" }]);
  assert.equal(linhas[0][cabecalho.indexOf("CPF/CNPJ")], "012.345.678-90");
  assert.equal(L.linhasExportacao([{ nome: "B", documento: "RG 12.345" }]).linhas[0][7], "RG 12.345", "outro documento fica como veio");
});

test("PX-013/014 · partesNota: «www.» vira link https e e-mail vira mailto", () => {
  const p = L.partesNota("veja www.site.com.br, mande p/ ana@x.com. ou ligue (12) 99830-3030");
  assert.deepEqual(p.find(x => x.tipo === "url"), { tipo: "url", texto: "www.site.com.br", href: "https://www.site.com.br" });
  assert.deepEqual(p.find(x => x.tipo === "email"), { tipo: "email", texto: "ana@x.com", href: "mailto:ana@x.com" });
  assert.equal(p.find(x => x.tipo === "tel").href, "tel:+5512998303030");
  assert.equal(p.map(x => x.texto).join(""), "veja www.site.com.br, mande p/ ana@x.com. ou ligue (12) 99830-3030", "nada do texto se perde");
  assert.equal(L.partesNota("https://www.x.com/a").length, 1, "o www dentro do http não vira segundo link");
  assert.equal((ler("crm-tarefas.js").match(/p\.tipo === "email" \? h\("a", \{ href: p\.href/g) || []).length, 2, "nota e detalhes da tarefa desenham o mailto");
});

test("PX-015/016 · mensagens prontas: «Dr. João» inteiro e sigla do serviço preservada", () => {
  const m = L.mensagensProntas({ servico: "Freio ABS", status: "ganho" }, { nome: "Dr. João Silva" });
  assert.match(m[0].texto, /^Oi, Dr\. João! /);
  assert.match(m[0].texto, /sobre freio ABS\./);
  assert.match(m.find(x => x.id === "indicacao").texto, /de freio ABS,/);
  assert.match(L.mensagensProntas({}, { nome: "Ana Souza" })[0].texto, /^Oi, Ana! /);
  assert.match(L.mensagensProntas({ servico: "Limpeza" }, { nome: "Sra." })[0].texto, /^Oi, Sra\.! .*sobre limpeza\./, "título sozinho fica como nome");
});

test("PX-017 · linha do tempo: nota vazia diz «Nota sem texto»", () => {
  assert.equal(L.textoTempo({ fonte: "nota", dados: { texto: "  " } }), "Nota sem texto");
  assert.equal(L.textoTempo({ fonte: "nota", dados: { texto: "oi" } }), "Nota: oi");
});

test("PX-018 · origem da planilha: «Google (orgânico)», «Orgânica», «Busca orgânica» = orgânico", () => {
  for (const t of ["Google (orgânico)", "Orgânica", "Busca orgânica", "Instagram orgânico"]) assert.equal(L.origemDaPlanilha(t), "organico", t);
  assert.equal(L.origemDaPlanilha("Google"), "Google", "sem o tipo continua como veio");
});

test("PX-020/021 · formatarTel: 0800 e número dos EUA em grupos", () => {
  assert.equal(L.formatarTel("08001234567"), "0800 123 4567");
  assert.equal(L.formatarTel("14155550100"), "+1 415 555 0100");
  assert.equal(L.formatarTel("5512998303030"), "(12) 99830-3030");
});

test("PX-022 · normalizarSite: «@loja» e e-mail não viram site", () => {
  assert.equal(L.normalizarSite("@loja"), null);
  assert.equal(L.normalizarSite("ana@x.com"), null);
  assert.equal(L.normalizarSite("www.x.com/@perfil"), "https://www.x.com/@perfil", "@ no caminho é link");
  assert.equal(L.normalizarSite("x.com.br"), "https://x.com.br");
});

test("PX-052 · lerSimNao: ✓ ✔ ☑ = sim; ✗ ✘ ☐ = não", () => {
  for (const s of ["✓", "✔", "☑"]) assert.equal(L.lerSimNao(s), true, s);
  for (const s of ["✗", "✘", "☐"]) assert.equal(L.lerSimNao(s), false, s);
});

test("PX-023 · abrirNegocio({aba}) abre direto na seção pedida", async () => {
  const D = domDeMentira();
  try {
    const h = D.h;
    const G = await montarGaveta(D, { opts: { aba: "tarefas" }, kx: { mod: async () => ({ blocoTarefas: () => h("div", { class: "teste-tarefas" }), blocoNotas: () => h("div", { class: "teste-notas" }), blocoTempo: () => h("div") }) } });
    await varias(8);
    assert.ok(G.corpo().querySelector(".teste-tarefas"), "abriu na aba Tarefas");
    assert.equal(G.corpo().querySelector(".teste-notas"), null);
    const src = ler("crm-negocio.js");
    assert.match(src, /let abaAtual = ABAS_NG\.includes\(aba\) \? aba : aba === "presenca" \? "resumo" : abaLembrada\(\);/);
    assert.match(src, /const pres = focoPresenca \? corpo\.querySelector\("\.ng-presenca \.ng-pres:not\(\[disabled\]\)"\) : null;/, "presença: foco no Compareceu/Faltou");
  } finally { D.desfazer(); }
});

test("PX-024 · deep link #/crm/negocio/<id>?aba= passa a aba à gaveta", () => {
  assert.match(ler("crm.js"), /aba: r\.query && typeof r\.query\.aba === "string" \? r\.query\.aba : null,/);
});

test("PX-025/026 · funil em edição e importação em andamento usam a guarda de rota do shell (ctx.guardaSaida)", async () => {
  assert.match(ler("crm-config.js"), /ctx\.guardaSaida\(sujo, \{ texto: "As mudanças neste funil vão ser perdidas\." \}\)/);
  const D = domDeMentira();
  try {
    const guardas = [];
    let soltou = 0;
    const imp = await import("../web/app/crm-importar.js");
    const U = uiDeMentira(D.h, {});
    const k = { ui: U, h: D.h, L, base: { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [] }, v: V,
      ctx: { cliente: { id: "c" }, titulo() {}, navegar() {}, guardaSaida: (fn, o) => { guardas.push({ fn, o }); return () => { soltou++; }; } },
      api: { rpcC: async () => ({}) }, pode: () => true, erro: () => "", toastErro() {}, cor: () => null, funil: () => null, funilPadrao: () => null, estagio: () => null, etiqueta: () => null, usuario: () => null };
    const t = await imp.montarImportar(k, h0(D, "div"), {});
    assert.equal(guardas.length, 1);
    assert.equal(guardas[0].fn(), false, "parada: não pergunta");
    assert.match(guardas[0].o.titulo, /Parar a importação/);
    t.desmontar();
    assert.equal(soltou, 1, "sair da tela solta a guarda");
  } finally { D.desfazer(); }
});

test("PX-027/028 · DA-358: ?etapa=agendou e ?criado_ate entram no filtro da lista, com o chip honesto", async () => {
  const D = domDeMentira();
  try {
    const ct = await montarCt(D);
    const el = h0(D, "div");
    await ct.M.montarContatos(ct.k, el, { query: { origem: "anuncio", etapa: "agendou", criado_de: "2026-10-01", criado_ate: "2026-10-31" } });
    await varias(8);
    const f = ct.cham("nx_contatos_listar")[0].p.p_filtro;
    assert.equal(f.marco, "agendou");
    assert.equal(f.criado_ate, "2026-10-31");
    const chips = el.querySelectorAll(".crm-chip").map(c => c.textContent);
    assert.ok(chips.some(t => /Agendaram a consulta \(ainda não separado na lista\)/.test(t)), chips.join(" | "));
    assert.equal(L.marcoDoLink("Fechou"), "fechou");
    assert.equal(L.marcoDoLink("veio"), "compareceu");
    assert.equal(L.marcoDoLink("xyz"), null);
    assert.equal(L.rotuloMarcoLink("compareceu"), "Compareceram à consulta");
  } finally { D.desfazer(); }
});

test("PX-031/032 · fim da importação: rodapé sem «null»; teste A11Y aceita o tabindex roving do quadro", () => {
  assert.match(ler("crm-importar.js"), /rodape\.append\(\.\.\.\[\n[\s\S]*?"Ver o Início"\) : null\]\.filter\(Boolean\)\);/);
  assert.match(readFileSync(join(RAIZ, "testes", "app.teste.mjs"), "utf8"), /plano 2000d: PX-032/);
});

test("PX-033 · ficha na gaveta: falha ao carregar mostra o cartão de erro (não fica vazia)", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const U = uiDeMentira(D.h, {});
    let g = null;
    U.gaveta = () => (g = { corpo: h0(D, "div"), fechar() {} });
    let n = 0;
    const k = { ui: U, h: D.h, L, v: V, mod: async () => { n++; throw Object.assign(new Error("rede"), { codigo: "sem_rede" }); } };
    await N.abrirContato(k, 9);
    const e = g.corpo.querySelector(".erro-cartao");
    assert.ok(e, "cartão de erro");
    assert.equal(e.textContent, "sem_rede");
    assert.equal(n, 1);
  } finally { D.desfazer(); }
});

test("PX-034/035/054 · ticket do serviço sem olhar maiúscula e responsável do pós-venda com id texto", () => {
  const src = ler("crm-negocio.js");
  assert.match(src, /L\.ticketDoServico\(k\.base\.ticket, ev\.target\.value\) \?\? NaN/);
  assert.match(src, /const ticket = card\.servico && k\.base\.ticket \? \(L\.ticketDoServico \? L\.ticketDoServico\(k\.base\.ticket, card\.servico\)/);
  assert.match(src, /some\(u => String\(u\.id\) === String\(n\.dono_id\)\) \? String\(n\.dono_id\) : ""/);
  assert.equal(L.ticketDoServico({ Implante: 3000 }, " implante "), 3000);
});

test("PX-036/037 · dicaEmail: «Quis dizer …?» ao sair do campo e «Usar este» troca", async () => {
  const D = domDeMentira();
  try {
    const N = await import("../web/app/crm-negocio.js");
    const U = uiDeMentira(D.h, {});
    const campo = h0(D, "label", { class: "campo" }, D.h("input", { name: "email" }));
    N.dicaEmail({ ui: U, h: D.h, L }, campo);
    const inp = campo.querySelector("input");
    const dica = campo.querySelector(".crm-dica-email");
    assert.equal(dica.hidden, true);
    inp.value = "ana@gmial.com"; inp.dispara("blur");
    assert.equal(dica.hidden, false);
    assert.match(dica.textContent, /Quis dizer ana@gmail\.com\?/);
    dica.querySelector("button").clique();
    assert.equal(inp.value, "ana@gmail.com");
    assert.equal(dica.hidden, true);
    assert.match(ler("crm-listas.js"), /N\.dicaEmail \? N\.dicaEmail\(k, ui\.campo\(\{ rotulo: "E-mail", nome: "email"/);
    assert.match(ler("crm-negocio.js"), /dicaEmail\(k, ui\.campo\(\{ rotulo: "E-mail \(opcional\)", nome: "c_email"/);
  } finally { D.desfazer(); }
});

test("PX-038/039/040/041 · tarefas: Ctrl+Enter salva, ligação com tel:, e-mail com mailto: e N abre «Nova tarefa»", async () => {
  const src = ler("crm-tarefas.js");
  assert.match(src, /form\.addEventListener\("keydown", ev => \{\n\s+if \(ev\.key !== "Enter" \|\| !\(ev\.ctrlKey \|\| ev\.metaKey\)/);
  assert.match(src, /document\.addEventListener\("keydown", aoTeclaN\);/);
  assert.match(src, /document\.removeEventListener\("keydown", aoTeclaN\);/);
  assert.match(ler("crm.js"), /id: "crm\.nova-tarefa"[^\n]*\.\.\.\(tipoTela === "tarefas" \? \{ atalho: "N" \} : \{\}\)/);
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const k = kTarefas2(D);
    const lig = T.itemTarefa(k, { id: 1, titulo: "Ligar", tipo: "ligacao", contato: { id: 3, nome: "Ana", telefone: "5512998303030" } });
    const a = lig.querySelector(".tf-ligar");
    assert.ok(a, "botão Ligar");
    assert.equal(a.getAttribute("href"), "tel:+5512998303030");
    const em = T.itemTarefa(k, { id: 2, titulo: "Mandar orçamento", tipo: "email", contato: { id: 3, nome: "Ana", email: "Ana@X.com" } });
    assert.equal(em.querySelector(".tf-email").getAttribute("href"), "mailto:ana@x.com?subject=Mandar%20or%C3%A7amento");
    const semEm = T.itemTarefa(k, { id: 3, titulo: "x", tipo: "email", contato: { id: 3, nome: "Ana" } });
    assert.equal(semEm.querySelector(".tf-email"), null);
    const feita = T.itemTarefa(k, { id: 4, titulo: "x", tipo: "ligacao", concluida_em: iso(-1), contato: { telefone: "5512998303030" } });
    assert.equal(feita.querySelector(".tf-ligar"), null, "concluída não mostra");
  } finally { D.desfazer(); }
});

test("PX-042/043/044/046/055 · importação: .tsv aceito, aba «parada», «puladas» no gênero, singular e modelo sem acento", () => {
  const src = ler("crm-importar.js");
  assert.match(src, /accept: "\.csv,\.tsv,\.txt,text\/csv,text\/tab-separated-values,text\/plain"/);
  assert.ok(src.includes("if (!/\\.(csv|tsv|txt)$/i.test(f.name)"), ".tsv passa na conferência do nome");
  assert.match(src, /"‖ Importação parada"/);
  assert.ok(src.includes('`pulad${k.v.art("contato")}${s.ignorados === 1 ? "" : "s"}`'), "pulados no gênero");
  assert.ok(src.includes('`criad${k.v.art("contato")}${s.criados === 1 ? "" : "s"}`'), "singular");
  assert.match(src, /L\.nomeArquivoImportacao\("modelo", v\.min\("contatos"\), ""\)/);
  assert.equal(L.nomeArquivoImportacao("modelo", "hóspedes", ""), "modelo-hospedes.csv");
  assert.equal(L.detectarSeparador("nome\ttelefone\nAna\t1"), "\t");
});

test("PX-045 · exportação de contatos: nome do arquivo sem acento", () => {
  assert.match(ler("crm-listas.js"), /L\.nomeArquivoImportacao\("", k\.v\.min\("contatos"\), ui\.hojeSP\(\)\)/);
  assert.equal(L.nomeArquivoImportacao("", "Hóspedes", "2026-10-25"), "hospedes-2026-10-25.csv");
});

test("PX-047/048/049 · configurações: campo e etiqueta com nome repetido avisam no formulário; Esc limpa a busca de etiquetas", () => {
  const src = ler("crm-config.js");
  assert.ok(src.includes("if (igualC) { ui.marcarErro(f, \"rotulo\", `Já existe o campo «${igualC.rotulo}».`); return false; }"));
  assert.ok(src.includes('String(x.funil_id || "") === String(funilD || "")'), "no negócio, por funil");
  assert.ok(src.includes("if (igualE) { ui.marcarErro(f, \"nome\", `Já existe a etiqueta «${igualE.nome}».`); return false; }"));
  assert.ok(src.includes("(!e || String(x.id) !== String(e.id))"), "renomear a própria etiqueta não conta");
  assert.ok(src.includes('busca.addEventListener("keydown", ev => { if (ev.key === "Escape" && busca.value)'));
});

test("PX-050/051 · CSS: alto contraste no quadro e avatar pelo .avatar-g (DU-309)", () => {
  const css = ler("crm.css");
  const b = css.slice(css.indexOf("plano 2000d · PX-050"));
  assert.match(b, /@media \(forced-colors: active\) \{[\s\S]*\.kc\.kc-sel, \.kc\.pego \{ outline: 3px solid Highlight;/);
  assert.match(b, /\.kb-col\.alvo \{ outline: 2px dashed Highlight;/);
  assert.doesNotMatch(css, /\.ct-abrir \.avatar \{ width: 40px/);
  assert.doesNotMatch(css, /\.emp-cab \.avatar \{ width: 40px/);
  assert.equal((ler("crm-listas.js").match(/\{ tamanho: "g" \}\) \/\* plano 2000d · PX-051 \*\//g) || []).length, 2);
});

test("PX-056/057/058/059/060 · mapeamento: o começo do cabeçalho decide; «Notes»/«Anotações», «Cel» e «Atendente»", () => {
  const um = c => L.sugerirMapeamento([c])[0];
  assert.equal(um("E-mail do cliente"), "email", "antes: nome (o fim «cliente»)");
  assert.equal(um("Valor do orçamento"), "negocio_valor", "antes: título");
  assert.equal(um("Nome do cliente"), "nome");
  assert.equal(um("Telefone do paciente"), "telefone");
  assert.equal(um("Notes"), "obs");
  assert.equal(um("Anotações"), "obs");
  assert.equal(um("Cel"), "telefone");
  assert.equal(um("Atendente"), "responsavel");
  assert.deepEqual(L.sugerirMapeamento(["Nome", "E-mail do cliente", "Valor do orçamento", "Serviço"]), ["nome", "email", "negocio_valor", "negocio_titulo"]);
});

test("PX-061 · nomeFonte: «google_ads» → «Google Ads»; fonte desconhecida sem sublinhado", () => {
  assert.equal(L.nomeFonte("google_ads"), "Google Ads");
  assert.equal(L.nomeFonte("Google-Ads"), "Google Ads");
  assert.equal(L.nomeFonte("meta_ads"), "Meta Ads");
  assert.equal(L.nomeFonte("minha_loja"), "Minha loja");
  assert.equal(L.nomeFonte("ig"), "Instagram");
});

test("PX-062/063 · empresas: busca com até 120 letras e «/» foca a busca (solta ao sair)", async () => {
  const src = ler("crm-listas.js");
  assert.match(src, /maxlength: "120", placeholder: "Buscar empresa", "aria-label": "Buscar empresa" \}\);/);
  const D = domDeMentira();
  try {
    const ct = await montarCt(D, { rpc: n => (n === "nx_empresas_listar" ? { itens: [], total: 0, tem_mais: false } : undefined) });
    const el = h0(D, "div");
    const tela = await ct.M.montarEmpresas(ct.k, el);
    await varias(6);
    const busca = el.querySelector('input[type="search"]');
    D.documento("keydown", { key: "/", target: D.doc.body });
    assert.equal(D.doc.activeElement, busca, "«/» levou o foco à busca");
    tela.desmontar();
    busca.blur();
    D.documento("keydown", { key: "/", target: D.doc.body });
    assert.notEqual(D.doc.activeElement, busca, "depois de sair, a tecla não mexe mais");
  } finally { D.desfazer(); }
});

test("PX-064 · busca de etiquetas do filtro: Esc com texto limpa e mostra todas, sem fechar o painel", async () => {
  const D = domDeMentira();
  try {
    const h = D.h;
    const ops = h0(D, "div", null, Array.from({ length: 14 }, (_, i) => h("label", { class: "crm-op" }, h("input", { type: "checkbox" }), `Etiqueta ${i}`)));
    const caixa = VisReal.buscaEtiquetas({ h, L }, ops);
    const campo = caixa.querySelector("input");
    campo.value = "Etiqueta 1"; campo.dispara("input");
    assert.ok(ops.querySelectorAll(".crm-op").some(x => x.hidden), "a busca escondeu algumas");
    let parou = false;
    campo.dispara("keydown", { key: "Escape", stopPropagation() { parou = true; } });
    assert.equal(campo.value, "");
    assert.ok(ops.querySelectorAll(".crm-op").every(x => !x.hidden), "todas de volta");
    assert.ok(parou, "o Esc não chega ao painel");
  } finally { D.desfazer(); }
});

test("PX-065 · cartão: «Confirmar a presença» abre a gaveta já na presença", async () => {
  const D = domDeMentira();
  try {
    const abertos = [];
    const passou = iso(-1, 9);
    const t = await montarKb(D, { dados: quadroDe({ s2: col("s2", [{ id: 5, titulo: "C5", status: "aberto", estagio_id: "s2", ordem: 10, consulta_em: passou, campos: {} }]) }),
      N: { abrirNegocio: (k, id, o) => { abertos.push({ id, o }); } } });
    await varias(8);
    const bt = t.cartao(5).querySelector(".kc-presenca");
    assert.ok(bt, "botão de presença no cartão");
    bt.dispara("click", { stopPropagation() {} });
    assert.equal(abertos.length, 1);
    assert.equal(abertos[0].o.aba, "presenca");
  } finally { D.desfazer(); }
});

test("PX-066 · prévia da importação: dados do cliente com «dado-pessoal» (o modo apresentação borra)", () => {
  const src = ler("crm-importar.js");
  assert.match(src, /h\("td", \{ class: \["dado-pessoal", c\.destino \? null : "ignorada"\]/);
  assert.match(src, /const pessoal = \["nome", "sobrenome", "telefone", "email", "documento", "nascimento"\]\.includes\(dest\);/);
  assert.match(src, /pessoal && v != null && v !== "" \? h\("span", \{ class: "dado-pessoal" \}, v\) : v/);
});

test("PX-067/068 · telefone inválido: número de fora curto e número sem DDD têm frase própria", () => {
  assert.match(L.textoTelefoneInvalido("+1 415"), /outro país incompleto/);
  assert.match(L.textoTelefoneInvalido("99830-3030"), /^Falta o DDD\./);
  assert.match(L.textoTelefoneInvalido("9830-3030"), /^Falta o DDD\./);
  assert.match(L.textoTelefoneInvalido("12 9830-3030"), /Faltou o 9\?/, "a sugestão do 9 continua");
  assert.match(L.textoTelefoneInvalido("123"), /^Telefone inválido/);
});

test("PX-069/070 · tempo longo em meses e anos («há 3 meses na etapa», «há 2 anos»)", () => {
  const ag = new Date();
  const antes = d => new Date(ag.getTime() - d * 86400000).toISOString();
  assert.equal(L.textoDiasEtapa(antes(97), ag), "há 3 meses na etapa");
  assert.equal(L.textoDiasEtapa(antes(400), ag), "há 1 ano na etapa");
  assert.equal(L.textoDiasEtapa(antes(10), ag), "há 10 dias na etapa");
  assert.equal(L.idadeCurta(60 * 24 * 64), "há 2 meses");
  assert.equal(L.idadeCurta(60 * 24 * 800), "há 2 anos");
  assert.equal(L.idadeCurta(60 * 24 * 40), "há 40 dias");
});

test("PX-071/072 · importação: nome em CAIXA ALTA/minúsculas ganha maiúsculas certas; «Minas» e «Brasília» viram UF", () => {
  assert.equal(L.nomeBonito("MARIA DA SILVA"), "Maria da Silva");
  assert.equal(L.nomeBonito("joão de souza"), "João de Souza");
  assert.equal(L.nomeBonito("ana-luiza d'avila"), "Ana-Luiza D'Avila");
  assert.equal(L.nomeBonito("McDonald"), "McDonald", "misturado fica como veio");
  assert.equal(L.nomeBonito("DE SOUZA"), "De Souza", "a 1ª palavra sempre maiúscula");
  assert.equal(L.nomeBonito("=HYPERLINK(1)"), "=HYPERLINK(1)", "fórmula/texto que não é nome fica como veio");
  assert.equal(L.nomeBonito("ACME 2000"), "ACME 2000");
  assert.deepEqual(L.montarLinhas([["MARIA DA SILVA", "12998303030"]], ["nome", "telefone"]).map(x => x.nome), ["Maria da Silva"]);
  assert.equal(L.ufDaPlanilha("Minas"), "MG");
  assert.equal(L.ufDaPlanilha("Brasília"), "DF");
});

test("PX-073 · nota: contagem aparece perto do limite de 5.000", async () => {
  const D = domDeMentira();
  try {
    const T = await import("../web/app/crm-tarefas.js");
    const k = kTarefas2(D);
    k.rascunho = () => ({ apagar() {} });
    k.L = L;
    const bl = T.blocoNotas(k, { notas: [], negocio_id: 1, aoMudar() {} });
    const ta = bl.querySelector("textarea");
    const conta = bl.querySelector(".nota-conta");
    assert.equal(conta.hidden, true);
    ta.value = "x".repeat(4600); ta.dispara("input");
    assert.equal(conta.hidden, false);
    assert.match(conta.textContent, /4\.600 de 5\.000 caracteres/);
    ta.value = "curta"; ta.dispara("input");
    assert.equal(conta.hidden, true);
  } finally { D.desfazer(); }
});

test("PX-074 · tarefa nova: o título escolhe o tipo enquanto a pessoa não mexeu nele", () => {
  assert.equal(L.tipoDoTitulo("Ligar para a Ana"), "ligacao");
  assert.equal(L.tipoDoTitulo("Mandar WhatsApp com o orçamento"), "whatsapp");
  assert.equal(L.tipoDoTitulo("Enviar e-mail da proposta"), "email");
  assert.equal(L.tipoDoTitulo("Reunião com a Bia"), "reuniao");
  assert.equal(L.tipoDoTitulo("Visitar a obra"), "visita");
  assert.equal(L.tipoDoTitulo("Revisar contrato"), null);
  const src = ler("crm-tarefas.js");
  assert.match(src, /if \(!tarefa && selTipo && inTit && L\.tipoDoTitulo\) \{/);
  assert.match(src, /if \(tipoTocado\) return;/);
});

test("PX-075 · rotuloMes: mês que não existe volta como veio", () => {
  assert.equal(L.rotuloMes("2026-13"), "2026-13");
  assert.equal(L.rotuloMes("2026-01"), "jan/2026");
});

test("PX-076/077 · exportação honesta com a etapa do anúncio e planilha só com cabeçalho", () => {
  assert.match(ler("crm-listas.js"), /filtro && filtro\.marco && !S\.marcoAplicado \? " A etapa do anúncio ainda não separa a lista/);
  assert.match(ler("crm-importar.js"), /A planilha só tem o cabeçalho \(/);
  const d = L.lerCSV("Nome;Telefone\n");
  assert.equal(d.linhas.length, 0);
  assert.equal(d.cabecalho.length, 2, "o caso do aviso novo: cabeçalho sem linhas");
});

test("PX-029/030 · cidade da planilha com maiúsculas certas; mensagem pronta com o nome capitalizado", () => {
  assert.equal(L.montarLinhas([["SÃO JOSÉ DOS CAMPOS"]], ["cidade"])[0].cidade, "São José dos Campos");
  assert.equal(L.montarLinhas([["Taubaté"]], ["cidade"])[0].cidade, "Taubaté", "misturada fica como veio");
  assert.match(L.mensagensProntas({}, { nome: "ana souza" })[0].texto, /^Oi, Ana! /);
  assert.match(L.mensagensProntas({}, { nome: "dr. joão" })[0].texto, /^Oi, Dr\. João! /);
});

test("PX-078/079 · buscas e campos de dinheiro com limite de tamanho", () => {
  const cfg = ler("crm-config.js"), kb = ler("crm-kanban.js"), ls = ler("crm-listas.js"), ng = ler("crm-negocio.js"), tf = ler("crm-tarefas.js"), vs = ler("crm-visoes.js");
  assert.match(cfg, /maxlength: "60", autocomplete: "off", placeholder: "Buscar etiqueta"/);
  assert.equal((kb.match(/class: "kb-mover-busca", maxlength: "60"/g) || []).length, 2);
  assert.match(ls, /const empBusca = h\("input", \{ type: "search", enterkeyhint: "search", maxlength: "120"/);
  assert.match(ls, /class: "ed fx-emp-busca", maxlength: "120"/);
  assert.match(ng, /placeholder: "Buscar por nome ou telefone"/);
  assert.match(ng, /enterkeyhint: "search", maxlength: "120" \/\* plano 2000d · PX-078/);
  assert.match(tf, /class: "tf-ligar-busca", maxlength: "120"/);
  assert.match(vs, /class: "crm-fe-busca", maxlength: "60"/);
  assert.match(kb, /const vMin = h\("input", \{ type: "text", inputmode: "decimal", maxlength: "18"/);
  assert.match(kb, /const vMax = h\("input", \{ type: "text", inputmode: "decimal", maxlength: "18"/);
  assert.equal((ng.match(/inputmode: "decimal", maxlength: "18" \/\* plano 2000d · PX-079/g) || []).length, 2, "valor previsto e valor final da gaveta");
});

test("PX-080/081/082 · planilha: «Sim, aceito»/«Não aceita», «ana@@x.com» e «ana@gmail» sem o .com", () => {
  assert.equal(L.lerSimNao("Sim, aceito"), true);
  assert.equal(L.lerSimNao("Aceito"), true);
  assert.equal(L.lerSimNao("Não aceita"), false);
  assert.equal(L.lerSimNao("Recusou"), false);
  assert.equal(L.lerSimNao("talvez"), null);
  assert.deepEqual(L.emailDaCelula("ana@@x.com"), { email: "ana@x.com", extras: [] });
  assert.equal(L.sugestaoEmail("ana@gmail"), "ana@gmail.com");
  assert.equal(L.sugestaoEmail("ana@yahoo"), "ana@yahoo.com.br");
  assert.equal(L.sugestaoEmail("ana@empresa"), null);
});

test("PX-083/084/085 · empresa: «@loja» no Site avisa, dica do e-mail e UF por extenso", () => {
  const src = ler("crm-listas.js");
  assert.match(src, /if \(!site\) \{ ui\.marcarErro\(form, "site", \/\^@\/\.test/);
  assert.match(src, /Perfil de rede social\? Use o link inteiro/);
  assert.match(src, /N\.dicaEmail \? N\.dicaEmail\(k, ui\.campo\(\{ rotulo: "E-mail", nome: "email", tipo: "email", valor: e\.email \|\| "" \}\)\)/);
  assert.match(src, /if \(dados\.uf && L\.ufDaPlanilha\) dados\.uf = L\.ufDaPlanilha\(dados\.uf\);/);
  assert.equal(L.ufDaPlanilha("São Paulo"), "SP");
  assert.equal(L.ufValida(L.ufDaPlanilha("sp")), true);
});

test("PX-086 · novo negócio: previsão no passado avisa (sem bloquear)", () => {
  const src = ler("crm-negocio.js");
  assert.match(src, /function pintarPrevNovo\(\) \{ const passou = !!inPrev\.value && L\.dataPassou\(inPrev\.value\);/);
  assert.match(src, /inPrev\.addEventListener\("change", pintarPrevNovo\);/);
  assert.equal(L.dataPassou(new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)), true);
});

test("PX-087/088 · «Mover para…»: Esc limpa a busca sem fechar e a seta desce para a 1ª etapa", async () => {
  const D = domDeMentira();
  try {
    let corpoModal = null;
    const muitos = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, nome: `Etapa ${i}`, tipo: "aberto", ordem: i }));
    const t = await montarKb(D, { dados: { colunas: muitos.map(e => col(e.id, e.id === "e0" ? cartoes(1, "e0") : [])) },
      base: { funis: [{ id: "f1", nome: "P", padrao: true, ativo: true, estagios: muitos }] },
      uix: { modal: async o => { corpoModal = o.corpo; return null; } }, kx: { estagio: id => muitos.find(x => x.id === id) || null } });
    await varias(8);
    const c = t.tela.querySelector(".kc");
    tecla(c, "m");
    await varias(4);
    assert.ok(corpoModal, "abriu a folha");
    const busca = corpoModal.querySelector(".kb-mover-busca");
    busca.value = "Etapa 3"; busca.dispara("input");
    assert.ok(corpoModal.querySelectorAll("li").some(li => li.hidden));
    let parou = false;
    busca.dispara("keydown", { key: "Escape", stopPropagation() { parou = true; } });
    assert.equal(busca.value, "");
    assert.ok(parou);
    assert.ok(corpoModal.querySelectorAll("li").every(li => !li.hidden), "todas de volta");
    busca.dispara("keydown", { key: "ArrowDown" });
    const foco = D.doc.activeElement;
    assert.equal(foco.tagName, "BUTTON");
    assert.ok(!foco.disabled, "a 1ª etapa que dá para escolher (a atual fica desligada)");
  } finally { D.desfazer(); }
});

test("PX-089 · empresas: vazio com o termo buscado e página vazia volta à primeira", async () => {
  const D = domDeMentira();
  try {
    const ct = await montarCt(D, { rpc: (n, p) => (n === "nx_empresas_listar" ? (p.p_filtro && p.p_filtro.busca ? { itens: [], total: 0, tem_mais: false } : { itens: [], total: 0, tem_mais: false }) : undefined) });
    const vazios = [];
    ct.ui.vazio = o => { vazios.push(o); return D.h("div", { class: "vazio" }, o.titulo); };
    const el = h0(D, "div");
    await ct.M.montarEmpresas(ct.k, el);
    await varias(4);
    const busca = el.querySelector('input[type="search"]');
    busca.value = "Unimed"; busca.dispara("input");
    await varias(6);
    assert.ok(vazios.some(v => v.titulo === "Nenhuma empresa para «Unimed»."), vazios.map(v => v.titulo).join(" | "));
    assert.match(ler("crm-listas.js"), /titulo: "Esta página ficou vazia\.", acao: \{ rotulo: "Voltar à primeira página"/);
  } finally { D.desfazer(); }
});

test("PX-090/091 · frases com o termo da vertical (etiqueta excluída e subtítulo de Empresas)", () => {
  assert.ok(ler("crm-config.js").includes("retirada de tod${k.v.art(\"contato\") === \"a\" ? \"as\" : \"os\"} ${k.v.min(\"contatos\")}, ${k.v.min(\"negocios\")} e conversas."));
  assert.doesNotMatch(ler("crm-config.js"), /retirada de todos os contatos, negócios e conversas/);
  assert.ok(ler("crm-listas.js").includes("as organizações por trás d${k.v.art(\"contato\") === \"a\" ? \"as suas\" : \"os seus\"} ${k.v.min(\"contatos\")}."));
});

test("PX-092/093/094 · telefone com ramal: tel: com pausa, WhatsApp só com o número", async () => {
  assert.equal(L.hrefTel("(12) 3632-1234 ramal 22"), "tel:+551236321234,22");
  assert.equal(L.hrefTel("(12) 3632-1234 r. 7"), "tel:+551236321234,7");
  assert.equal(L.hrefWhatsApp("(12) 99830-3030 ramal 2"), "https://wa.me/5512998303030");
  assert.equal(L.telInternacional("(12) 3632-1234 ext 22"), "+551236321234");
  assert.equal(L.hrefTel("5512998303030"), "tel:+5512998303030", "sem ramal como antes");
  const p = L.partesNota("ligar 12 3632-1234 ramal 22 amanhã");
  assert.deepEqual(p[1], { tipo: "tel", texto: "12 3632-1234 ramal 22", href: "tel:+551236321234,22" });
  const N = await import("../web/app/crm-negocio.js");
  const links = N.linksDoCampo(L, "telefone", "(12) 3632-1234 ramal 22");
  assert.equal(links[0].href, "tel:+551236321234,22");
  assert.equal(links[1].href, "https://wa.me/551236321234");
});

test("PX-095/096 · filtro por campo com limite e a etapa do anúncio sobrevive ao «Aplicar» dos filtros", () => {
  assert.match(ler("crm-visoes.js"), /maxlength: c\.tipo === "data" \? null : "120"/);
  assert.match(ler("crm-listas.js"), /if \(S\.filtro\.marco\) nf\.marco = S\.filtro\.marco;/);
});

test("PX-097/098/099/100 · e-mail com espaço em volta do @ vale nos cadastros (contato, ficha, empresa, negócio novo)", () => {
  assert.equal(L.emailLimpo(" Ana @@ X.com "), "ana@x.com");
  assert.equal(L.emailLimpo(""), "");
  const ls = ler("crm-listas.js"), ng = ler("crm-negocio.js");
  assert.match(ls, /if \(d\.email && L\.emailLimpo\) d\.email = L\.emailLimpo\(d\.email\);/);
  assert.match(ls, /ler: x => \(L\.emailLimpo \? L\.emailLimpo\(x\.value\)/);
  assert.match(ls, /test\(L\.emailLimpo \? L\.emailLimpo\(x\.value\) : x\.value\.trim\(\)\)/);
  assert.match(ls, /if \(dados\.email && L\.emailLimpo\) dados\.email = L\.emailLimpo\(dados\.email\);/);
  assert.match(ng, /if \(d\.c_email && L\.emailLimpo\) d\.c_email = L\.emailLimpo\(d\.c_email\);/);
});

test("PX-101/102/103 · linha do tempo: responsável anterior, mudança sem etapa de origem e o arquivo da importação", () => {
  const n = { nomes: { u1: "Ana", u2: "Bruno" } };
  assert.equal(L.textoTempo({ tipo: "dono", dados: { para: "u1", de: "u2" } }, n), "Responsável: Ana (antes: Bruno)");
  assert.equal(L.textoTempo({ tipo: "dono", dados: { de: "u2" } }, n), "Ficou sem responsável (antes: Bruno)");
  assert.equal(L.textoTempo({ tipo: "dono", dados: { para: "u1" } }, n), "Responsável: Ana", "sem «de» como antes");
  assert.equal(L.textoTempo({ tipo: "estagio", dados: { para_nome: "Agendou" } }), "Moveu para «Agendou»");
  assert.equal(L.textoTempo({ tipo: "estagio", dados: { de_nome: "Nova", para_nome: "Agendou" } }), "Moveu de «Nova» para «Agendou»");
  assert.equal(L.textoTempo({ tipo: "importado", dados: { arquivo: "clientes.csv" } }), "Veio da importação da planilha «clientes.csv»");
  assert.equal(L.textoTempo({ tipo: "importado", dados: {} }), "Veio da importação de planilha");
});

test("PX-073/086 · CSS da contagem da nota e do aviso da previsão (só tokens)", () => {
  const css = ler("crm.css");
  const b = css.slice(css.indexOf("plano 2000d · PX-073: a contagem da nota"));
  assert.match(b, /\.nota-conta\.aten \{ color: var\(--c-aten\);/);
  assert.match(b, /\.ng-prev-aviso \{ display: block;/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(b) && !/\brgba?\(/.test(b), "só tokens");
});
