/* ============================================================
   ÓRBITA — plano 1500c, frente crm (RC-001…RC-344).
   node --test testes/plano1500c-crm.teste.mjs
   O DOM de mentira e os montadores (Kanban, gaveta, contatos, importação, funis) são cópia do plano1000b-crm.teste.mjs.
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

/* ============================================================ plano 1500c · lote crm-b1 */
const NBSP = String.fromCharCode(0xa0), BOM = String.fromCharCode(0xfeff);
const vocabDe = async vert => (await import("../web/app/vocab.js")).vocab(vert);

test("RC-001/002/003/035/036 · lerNumero: «0.500», notação científica, contábil, NBSP e formatos de banco", () => {
  assert.equal(L.lerNumero("0.500"), 0.5);
  assert.equal(L.lerNumero("1.500"), 1500);
  assert.equal(L.lerNumero("0,500"), 0.5);
  assert.equal(L.lerNumero("1e5"), null);
  assert.equal(L.lerNumero("0x10"), null);
  assert.equal(L.lerNumero("Infinity"), null);
  assert.equal(L.lerNumero("R$ 1.200,50"), 1200.5);
  assert.equal(L.lerNumero("(1.500,00)"), -1500);
  assert.equal(L.lerNumero("R$ -1.234,56"), -1234.56);
  assert.equal(L.lerNumero(`1${NBSP}234,56`), 1234.56);
  assert.equal(L.lerNumero("1.234.567"), 1234567);
  assert.equal(L.lerNumero("12,5%"), null);
  assert.ok(L.checarLinha({ nome: "Ana", negocio_valor: "(10)" }).some(x => /negativo/.test(x)), "contábil negativo vira o aviso de valor negativo");
});

test("RC-004/012 · lerData: lixo depois da data e série do Excel fora do plausível", () => {
  assert.equal(L.lerData("1990-12-31abc"), null);
  assert.equal(L.lerData("1990-12-31 10:00"), "1990-12-31");
  assert.equal(L.lerData("1990-12-31T10:00:00Z"), "1990-12-31");
  assert.equal(L.lerData("12246", { passado: true }).slice(0, 4), "1933");
  assert.equal(L.lerData("99999"), null);
  assert.equal(L.lerData("99999", { passado: true }), null, "série no futuro não é nascimento");
  assert.equal(L.lerData("1990", { passado: true }), null, "só o ano não vira data");
});

test("RC-005 · nascimento «no futuro» pelo dia de São Paulo", () => {
  const agora = Date.parse("2026-10-22T02:30:00Z");       // 21/10 23:30 em SP; em UTC já é 22/10
  assert.ok(L.checarLinha({ nome: "Ana", nascimento: "2026-10-22" }, { agora }).includes("Nascimento no futuro: confira a data"));
  assert.ok(!L.checarLinha({ nome: "Ana", nascimento: "2026-10-21" }, { agora }).some(x => /futuro/.test(x)));
});

test("RC-006/007/041/042 · sugerirMapeamento: Google/Outlook, sobrenome, RD/Pipedrive e BOM", () => {
  assert.deepEqual(L.sugerirMapeamento(["Name", "Phone 1 - Type", "Phone 1 - Value"]), ["nome", null, "telefone"]);
  assert.deepEqual(L.sugerirMapeamento(["Given Name", "Family Name", "E-mail 1 - Type", "E-mail 1 - Value"]), ["nome", "sobrenome", null, "email"]);
  assert.deepEqual(L.sugerirMapeamento(["Nome do lead", "Celular do lead", "Email do lead", "Deal value"]), ["nome", "telefone", "email", "negocio_valor"]);
  assert.deepEqual(L.sugerirMapeamento(["Person - Name", "Person - Phone", "Person - Email", "Deal title", "Deal stage"]), ["nome", "telefone", "email", "negocio_titulo", "estagio"]);
  assert.deepEqual(L.sugerirMapeamento([BOM + "Nome", "Tele" + String.fromCharCode(0x200b) + "fone"]), ["nome", "telefone"]);
  const [l] = L.montarLinhas([["Ana", "Souza"]], ["nome", "sobrenome"]);
  assert.equal(l.nome, "Ana Souza");
  assert.equal(l.sobrenome, undefined);
  assert.ok(L.DESTINOS_IMPORTACAO.some(d => d.chave === "sobrenome"));
});

test("RC-009 · ufDaPlanilha com pontos e espaços", () => {
  assert.equal(L.ufDaPlanilha("S.P."), "SP");
  assert.equal(L.ufDaPlanilha(" rj "), "RJ");
  assert.equal(L.ufDaPlanilha("sp."), "SP");
  assert.equal(L.ufDaPlanilha("São Paulo"), "SP");
});

test("RC-010/270 · decodificarArquivo: UTF-16 LE/BE com BOM, sem BOM e UTF-8 com BOM", () => {
  const txt = "Nome\tTelefone\nJoão\t12";
  const le = [0xff, 0xfe]; for (const ch of txt) { const c = ch.charCodeAt(0); le.push(c & 0xff, c >> 8); }
  assert.deepEqual(L.decodificarArquivo(new Uint8Array(le)), { texto: txt, codificacao: "utf-16le" });
  const be = [0xfe, 0xff]; for (const ch of txt) { const c = ch.charCodeAt(0); be.push(c >> 8, c & 0xff); }
  assert.equal(L.decodificarArquivo(new Uint8Array(be)).texto, txt);
  assert.equal(L.decodificarArquivo(new Uint8Array(le.slice(2))).texto, txt, "sem BOM: zeros alternados");
  const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(txt)]);
  assert.equal(L.decodificarArquivo(utf8).texto.replace(BOM, ""), txt);
  assert.equal(L.decodificarArquivo(utf8).codificacao, "utf-8");
});

test("RC-011 · etapa de ganho na planilha tem aviso próprio", () => {
  const estagios = [{ id: "s1", nome: "Nova", tipo: "aberto" }, { id: "s9", nome: "Ganho", tipo: "ganho" }];
  const r = L.conferirPlanilha([{ estagio: "Ganho" }, { estagio: "Xyz" }], { estagios });
  assert.deepEqual(r.etapasFechadas, ["Ganho"]);
  assert.deepEqual(r.etapasDesconhecidas, ["Xyz"]);
  assert.equal(r.avisos[0].codigo, "etapa_fechada");
  assert.match(r.avisos[0].texto, /1ª etapa aberta/);
});

test("RC-013 · telefone sem DDD não parece estrangeiro", () => {
  assert.equal(L.formatarTel("998303030"), "9 9830-3030");
  assert.equal(L.formatarTel("38303030"), "3830-3030");
  assert.equal(L.formatarTel("5512998303030"), "(12) 99830-3030");
});

test("RC-014/015/016 · textoTempo pela vertical, etiquetas com nome, tipo desconhecido e aspas", async () => {
  const of = await vocabDe("oficina");
  assert.match(L.textoTempo({ tipo: "presenca", dados: { presenca: "faltou" } }, { vocab: of }), /visita/);
  assert.match(L.textoTempo({ tipo: "presenca", dados: { presenca: "compareceu" } }, { vocab: await vocabDe("loja") }), /entrega/);
  assert.match(L.textoTempo({ tipo: "etiqueta", dados: { adicionadas: ["Retorno"], removidas: ["Urgência"] } }), /\+ Retorno.*− Urgência/);
  assert.equal(L.textoTempo({ tipo: "etiqueta", dados: {} }), "Etiquetas alteradas");
  assert.equal(L.textoTempo({ tipo: "xyz_abc", dados: {} }), "Atualização");
  assert.match(L.textoErro({ codigo: "campo_obrigatorio", hint: "convenio" }, { campos: [{ chave: "convenio", rotulo: "Convênio" }] }), /«Convênio»/);
});

test("RC-017 · aviso de marcos com os termos da oficina", async () => {
  const of = await vocabDe("oficina");
  const lista = L.marcosFaltando({ conta_no_ads: true }, []);
  const t = L.textoMarcosFaltando(lista, { vocab: of });
  assert.match(t, /Aprovado/); assert.match(t, /Recusado/); assert.match(t, /visita/);
  assert.doesNotMatch(t, /consulta/);
  assert.match(L.textoMarcosFaltando(lista), /Ganho/, "sem vocab continua como antes");
});

test("RC-018/019/044 · validarFunil: cor inválida, chance decrescente (aviso) e prazo 0", () => {
  const base = est => ({ nome: "F", estagios: [...est, { nome: "G", tipo: "ganho" }, { nome: "P", tipo: "perdido" }] });
  const e1 = L.validarFunil(base([{ nome: "A", tipo: "aberto", cor: "red" }]));
  assert.ok(e1.some(x => x.campo === "cor" && x.indice === 0));
  const e2 = L.validarFunil(base([{ nome: "A", tipo: "aberto", probabilidade: 60 }, { nome: "B", tipo: "aberto", probabilidade: 20 }]));
  assert.deepEqual(e2.map(x => [x.indice, x.nivel, x.hint]), [[1, "aviso", "chance_decrescente"]]);
  const e3 = L.validarFunil(base([{ nome: "A", tipo: "aberto", sla_horas: L.horasSla("0", "h") }]));
  assert.ok(e3.some(x => x.campo === "sla_horas" && /1 ou mais/.test(x.texto)));
  assert.deepEqual(L.validarFunil(base([{ nome: "A", tipo: "aberto", cor: "#AABBCC" }])), []);
});

test("RC-020/048 · exportação com último contato, total ganho e moeda com 2 casas", () => {
  const campos = [{ entidade: "contato", chave: "gasto", rotulo: "Gasto", tipo: "moeda" }, { entidade: "contato", chave: "n", rotulo: "N", tipo: "numero" }];
  const r = L.linhasExportacao([{ nome: "Ana", ultimo_contato_em: "2026-10-03", total_ganho: 1500.5, campos: { gasto: 1500.5, n: 2.456 } }], campos);
  const col = nome => r.linhas[0][r.cabecalho.indexOf(nome)];
  assert.equal(col("Último contato"), "03/10/2026");
  assert.equal(col("Total ganho"), "1500,50");
  assert.equal(col("Gasto"), "1500,50");
  assert.equal(col("N"), "2,46");
  assert.ok(!L.linhasExportacao([{ nome: "Ana" }]).cabecalho.includes("Último contato"), "servidor antigo: coluna fora");
});

test("RC-021 · telefone estrangeiro sem apóstrofo no CSV; fórmula continua protegida", () => {
  assert.ok(L.gerarCSV(["t"], [["+1 415 555 0100"]]).endsWith("\r\n+1 415 555 0100"));
  assert.match(L.gerarCSV(["t"], [["+1+1"]]), /'\+1\+1/);
  assert.match(L.gerarCSV(["t"], [["=HYPERLINK(1)"]]), /'=HYPERLINK/);
});

test("RC-022/023/043/274 · resumoEmpresa e pctInteiro; valorCard com 0", () => {
  const r = L.resumoEmpresa({ negocios: [{ status: "ganho", valor: null, valor_previsto: 500 }, { status: "ganho", valor: 0, valor_previsto: 300 }, { status: "ganho", valor: 200 }] });
  assert.equal(r.valorGanho, 700);
  assert.equal(L.valorCard({ status: "ganho", valor: 0, valor_previsto: 300 }), 0);
  assert.equal(L.pctInteiro(0.004), "< 1%");
  assert.equal(L.pctInteiro(0), "0%");
  assert.equal(L.pctInteiro(0.62), "62%");
});

test("RC-024/271/319/320 · relatório do titular legível com campos de todos os tipos", async () => {
  const campos = [{ chave: "convenio", rotulo: "Convênio", tipo: "sim_nao" }, { chave: "dt", rotulo: "Última visita", tipo: "data" }, { chave: "gasto", rotulo: "Gasto", tipo: "moeda" },
    { chave: "fones", rotulo: "Contato extra", tipo: "telefone" }, { chave: "lista", rotulo: "Interesses", tipo: "multi" }];
  const dados = L.dadosTitular({ contato: { id: 9, nome: "Ana Souza", telefone: "5512998303030", nascimento: "1990-03-02",
    campos: { convenio: true, dt: "2026-01-05", gasto: 10, fones: "5512998303030", lista: ["A", "B"], sem_def: "x" } }, negocios: [{ id: 1, titulo: "Limpeza", status: "ganho" }] }, { geradoEm: "2026-10-21" });
  const t = L.textoTitular(dados, { campos, vocab: await vocabDe("odonto"), empresaConta: "Clínica Sorriso", brl: v => `R$ ${v}` });
  assert.match(t, /Convênio: Sim/);
  assert.match(t, /Última visita: 05\/01\/2026/);
  assert.match(t, /Gasto: R\$ 10/);
  assert.match(t, /Contato extra: \(12\) 99830-3030/);
  assert.match(t, /Interesses: A, B/);
  assert.match(t, /Nascimento: 02\/03\/1990/);
  assert.match(t, /Telefone: \(12\) 99830-3030/);
  assert.match(t, /Limpeza \(Fechou\)/);
  assert.match(t, /Responsável pelos dados: Clínica Sorriso/);
  assert.doesNotMatch(t, /convenio|true|false/);
  assert.equal(L.nomeArquivoTitular({ id: 9, nome: "Ana Souza" }, "2026-10-21"), "dados-titular-ana-souza-2026-10-21.json");
  assert.equal(L.nomeArquivoTitular({ id: 9 }, "2026-10-21"), "dados-titular-9-2026-10-21.json");
});

test("RC-025/026/027/028/272 · atalhos de prazo: noite, fim de semana, fim do mês e por id", () => {
  const noite = Date.parse("2026-10-21T22:00:00Z");       // 19h em SP
  assert.ok(!L.atalhosPrazo("2026-10-21", { agora: noite }).some(a => /Hoje/.test(a.rotulo)));
  const tarde = Date.parse("2026-10-21T20:30:00Z");       // 17h30 em SP
  assert.equal(L.atalhoPrazo("2026-10-21", "hoje", { agora: tarde }).rotulo, "Hoje 20h");
  const sab = L.atalhosPrazo("2026-10-24");
  assert.deepEqual([L.atalhoPrazo("2026-10-24", "amanha").valor, L.atalhoPrazo("2026-10-24", "amanha").rotulo], ["2026-10-26T09:00", "Seg 9h"]);
  assert.equal(sab.find(a => a.id === "segunda").valor, "2026-10-26T09:00");
  assert.equal(L.atalhoPrazo("2026-10-25", "amanha").valor, "2026-10-26T09:00", "domingo → segunda");
  assert.equal(L.atalhoPrazo("2026-10-22", "tres").valor, "2026-10-26T09:00", "quinta + 3 = domingo → segunda");
  assert.equal(L.atalhoPrazo("2026-10-30", "amanha").valor, "2026-11-02T09:00", "sexta no fim do mês → segunda do mês seguinte");
  const sab20h = new Date("2026-10-24T23:00:00Z");
  assert.equal(L.adiarTarefa(null, "semana", sab20h), "2026-10-26T12:00:00.000Z");
  assert.equal(L.instanteSP("2026-12-12", "09:00"), "2026-12-12T12:00:00.000Z");
  assert.equal(L.retomarEm(30, new Date("2026-10-14T01:00:00Z")), "2026-11-12T12:00:00.000Z");
});

test("RC-029 · campos de outro funil formatados pelo tipo", () => {
  const campos = [{ entidade: "negocio", chave: "m", rotulo: "Valor", tipo: "moeda", funil_id: "f2" }, { entidade: "negocio", chave: "d", rotulo: "Dia", tipo: "data", funil_id: "f2" }];
  const r = L.camposDeOutrosFunis(campos, "f1", { m: 1500.5, d: "2026-10-03" });
  assert.equal(r.find(x => x.chave === "m").texto, "R$ 1.500,50");
  assert.equal(r.find(x => x.chave === "d").texto, "03/10/2026");
});

test("RC-030/047 · visão salva casa com etiquetas em outra ordem; nome com espaço duplo é duplicado", () => {
  const s = L.salvarVisaoCRM([], "kanban", { nome: "Urg", dados: { funil: "f1", filtro: { etiquetas: { op: "alguma", ids: [2, 1] } } } }, { idNovo: "v1" });
  assert.equal(L.visaoCorrespondenteCRM(s.visoes, "kanban", { funil: "f1", filtro: { etiquetas: { op: "alguma", ids: [1, 2] } } }), "v1");
  const a = L.salvarVisaoCRM([{ id: "v9", nome: "Retorno  semana", dados: { funil: "f1", filtro: {} } }], "kanban", { nome: "Retorno semana", dados: { funil: "f1", filtro: {} } }, { idNovo: "v2" });
  assert.equal(a.codigo, "nome_duplicado");
});

test("RC-031/032 · validarCampo conta emoji como 1 e recusa «1e5»", () => {
  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(L.validarCampo({ tipo: "texto" }, emoji.repeat(499)), null);
  assert.ok(L.validarCampo({ tipo: "texto" }, emoji.repeat(501)));
  assert.ok(L.validarCampo({ tipo: "numero" }, "1e5"));
  assert.ok(L.validarCampo({ tipo: "numero" }, "0x1F"));
  assert.equal(L.validarCampo({ tipo: "numero" }, "12,5"), null);
});

test("RC-033/034 · origem com plataforma e hora da pontuação em SP", () => {
  assert.match(L.descricaoOrigem({ origem: "anuncio", plataforma: "instagram" }), /Anúncio · Instagram/);
  assert.match(L.descricaoOrigem({ origem: "anuncio", plataforma: "facebook" }), /Facebook/);
  assert.equal(L.quandoPontuacao("2026-10-21T00:30:00Z"), "20/10/2026 às 21:30");
  assert.equal(L.quandoPontuacao("2026-10-01T14:03"), "01/10/2026 às 14:03", "sem fuso: hora de SP como veio");
});

test("RC-037/038/039/040/046 · telefone com ramal, vários telefones/e-mails e observação longa", () => {
  const [a] = L.montarLinhas([["Ana", "(12) 3333-4444 ramal 21"]], ["nome", "telefone"]);
  assert.equal(L.normalizarTelefone(a.telefone), "551233334444");
  assert.ok(L.checarLinha(a).some(x => /Ramal/.test(x)));
  const [b] = L.montarLinhas([["Bia", " Ana@X.com "]], ["nome", "email"]);
  assert.equal(b.email, "ana@x.com");
  assert.deepEqual(L.checarLinha(b), []);
  assert.equal(L.checarLinha({ nome: "x", email: " Ana@X.com " }).length, 0);
  const [c] = L.montarLinhas([["Cris", "a@x.com; b@y.com", "12 99999-0000 / 12 98888-1111"]], ["nome", "email", "telefone"]);
  assert.equal(c.email, "a@x.com"); assert.match(c.obs, /b@y\.com/);
  assert.equal(c.telefone, "12 99999-0000"); assert.match(c.obs, /12 98888-1111/);
  const [d] = L.montarLinhas([["Duda", "x".repeat(3000)]], ["nome", "obs"]);
  assert.equal(d.obs.length, 2000);
  assert.ok(L.checarLinha(d).some(x => /cortada/.test(x)));
  assert.ok(!Object.keys(d).includes("_avisos"), "o aviso não vai ao servidor");
});

test("RC-045 · opções com espaço duplo viram uma", () => {
  assert.equal(L.opcoesUnicas(["A  B", "A B"]).opcoes.length, 1);
});

/* ---------- crm-b1: Kanban (DOM de mentira) ---------- */
const modalFila = respostas => async o => new Promise(res => {
  const api = { fechar: v => res(v), erro() {} };
  if (o.aoAbrir) o.aoAbrir(api);
  const r = respostas.shift();
  if (typeof r === "function") r(o, api); else res(r);
});

test("RC-050/057/335 · selecionar a etapa inteira, faixa com o valor somado e sem região viva duplicada", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(3, "s1", 1, { valor_previsto: 100 }), 5) }) });
    const bt = t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-sel');
    assert.ok(bt, "antes: não havia como selecionar a coluna");
    bt.clique();
    const n = t.tela.querySelector(".crm-sel-n");
    assert.equal(n.textContent, "3 selecionados · R$ 300");
    assert.equal(n.getAttribute("role"), null, "a faixa não é role=status (o anúncio sai uma vez só)");
    assert.equal(t.reg.avisos.filter(a => /selecionad/.test(a)).length, 1);
    assert.match(t.reg.toasts.at(-1), /carregados.*tem 5/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-051/052/053/069/073/074/084/085/086/088/065 · cartão: vertical, plural, dicas, motivo, valor final, sem contato e previsão", async () => {
  const D = domDeMentira();
  try {
    const longo = "Troca de embreagem completa com revisão geral do câmbio e da suspensão";
    const dados = quadroDe({
      s1: col("s1", [{ id: 1, titulo: longo, status: "aberto", estagio_id: "s1", ordem: 10, nao_lidas: 1, dono_id: "u2", tarefa: { atrasada: true, vence_em: iso(-2) },
        consulta_em: iso(-1), contato: { id: 7, nome: "Ana" }, estagio_em: iso(-1), criado_em: iso(-3), score: 80, previsao_fechamento: iso(-5).slice(0, 10) }]),
      s2: col("s2", [{ id: 2, titulo: "Sem contato", status: "aberto", estagio_id: "s2", ordem: 10 }]),
      s5: col("s5", [{ id: 3, titulo: "G", status: "ganho", estagio_id: "s5", ordem: 10, valor: 900, valor_previsto: 500, contato: { id: 8, nome: "Bia" } }]),
      s6: col("s6", [{ id: 4, titulo: "P", status: "perdido", estagio_id: "s6", ordem: 10, motivo_perda_id: "m1", contato: { id: 9, nome: "Caio" } }]) });
    const v = { ...V, vertical: "oficina", compromisso: "Visita", ganhar: "Aprovado", perder: "Recusado" };
    const t = await montarKb(D, { dados, usuario: id => (id === "u2" ? { id: "u2", nome: "Ana" } : null), kx: { v, motivosPorId: () => ({ m1: "Preço" }) } });
    const c1 = t.cartao(1);
    const det = c1.querySelector(".sr-only").textContent;
    assert.match(det, /visita /); assert.doesNotMatch(det, /consulta/);
    assert.match(det, /1 mensagem não lida/);
    assert.equal(c1.querySelector(".kc-consulta").getAttribute("title"), "Visita marcada");
    assert.match(c1.querySelector(".kc-dono").getAttribute("title"), /cartões de Ana$/);
    assert.doesNotMatch(c1.querySelector(".kc-dono").getAttribute("title"), /dele\(a\)/);
    assert.match(c1.querySelector(".kc-tarefa-txt").textContent, /^atrasada há/);
    assert.match(c1.querySelector(".kc-score").getAttribute("title"), /0 a 100/);
    assert.equal(c1.querySelector(".kc-tempo").getAttribute("role"), null);
    assert.equal(c1.querySelector(".kc-tempo").getAttribute("aria-hidden"), "true");
    assert.ok(c1.querySelector(".kc-previsao.vencida"), "previsão vencida em vermelho");
    assert.ok(c1.getAttribute("aria-label").startsWith("Troca de embreagem completa com revisão geral…"), c1.getAttribute("aria-label"));
    assert.ok(t.cartao(2).querySelector(".kc-sem-contato"), "sem contato: ícone neutro, não as iniciais do título");
    assert.ok(t.cartao(3).querySelector(".kc-valor-final"));
    assert.equal(t.cartao(4).querySelector(".kc-motivo").textContent, "Preço");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-066/071 · soma dos perdidos riscada e nome da etapa com dica", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const soma = t.tela.querySelector('.kb-col[data-estagio="s6"] .kb-col-soma');
    assert.ok(soma.classList.contains("kb-col-soma-perdida"));
    assert.match(soma.getAttribute("title"), /deixou de entrar/);
    assert.equal(t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-nome').getAttribute("title"), "Nova");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-058 · Home/End vão ao 1º/último cartão da coluna; Ctrl+End à última coluna com cartões", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(4, "s1")), s2: col("s2", cartoes(2, "s2", 10)) }) });
    t.cartao(2).focus();
    tecla(t.cartao(2), "End"); assert.equal(D.ativo(), t.cartao(4));
    tecla(t.cartao(4), "Home"); assert.equal(D.ativo(), t.cartao(1));
    t.cartao(1).dispara("keydown", { key: "End", ctrlKey: true, currentTarget: t.cartao(1) });
    assert.equal(D.ativo(), t.cartao(11), "Ctrl+End: último cartão da última coluna com cartões");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-055/080/081 · lote: uma RPC quando existe, laço quando não existe; motivo pedido para o lote", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const preps = [];
    let loteExiste = true;
    const rpc = async (nome, p) => {
      if (nome === "nx_negocios_mover_lote") { if (!loteExiste) throw Object.assign(new Error("x"), { status: 404 }); return { ok: p.p_ids, falhas: [] }; }
      return {};
    };
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1")), s2: col("s2", cartoes(1, "s2", 10)) }), rpc, uix: { modal: modalFila(respostas) },
      N: { prepararMovimento: async (k, card) => { preps.push(card.titulo); return { motivo_perda_id: "m1" }; } } });
    t.cartao(1).dispara("click", { shiftKey: true, target: t.cartao(1) });
    t.cartao(10).dispara("click", { shiftKey: true, target: t.cartao(10) });
    respostas.push("s6");
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(12);
    assert.deepEqual(preps, ["2 cartões"], "o motivo é pedido uma vez, falando do lote (cartões de etapas diferentes)");
    assert.equal(t.chamadas("nx_negocios_mover_lote").length, 1);
    assert.deepEqual(t.chamadas("nx_negocios_mover_lote")[0].p.p_ids, [1, 10]);
    assert.equal(t.reg.movidos.length, 0, "nenhuma RPC por cartão");
    loteExiste = false;
    t.cartao(2).dispara("click", { shiftKey: true, target: t.cartao(2) });
    t.cartao(1).dispara("click", { shiftKey: true, target: t.cartao(1) });
    respostas.push("s2");
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(12);
    assert.equal(t.reg.movidos.length, 2, "sem a RPC do lote: uma por cartão, como antes");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-056 · desfazer do lote tenta todos e diz quantos não voltaram", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const voltas = [];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(3, "s1")) }), uix: { modal: modalFila(respostas) },
      rpc: async () => { throw Object.assign(new Error("x"), { status: 404 }); },
      N: { moverNegocio: async (k, card, dest) => { if (dest.id === "s1") { voltas.push(card.id); if (card.id === 2) throw Object.assign(new Error("y"), { codigo: "sem_permissao" }); } return { id: card.id, estagio_id: dest.id }; } } });
    for (const id of [1, 2, 3]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    respostas.push("s2");
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(12);
    await t.reg.desfazer.at(-1).reverter();
    assert.deepEqual(voltas, [1, 2, 3], "antes: parava no 2º e o 3º não voltava");
    assert.match(t.reg.toasts.at(-1), /^1 de 3 não voltou/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-054 · aba escondida durante o «Desfazer» do ganho: ao voltar, avisa que já foi gravado", async () => {
  const D = domDeMentira();
  try {
    const respostas = ["s5"];
    const t = await montarKb(D, { dados: kbVazio(), uix: { modal: modalFila(respostas) }, N: { prepararMovimento: async () => ({ valor: 900 }) } });
    t.cartao(1).querySelector(".kc-mover").clique(); await varias(10);
    assert.equal(t.reg.movidos.length, 0, "ganho espera os 7 s");
    D.doc.hidden = true; D.documento("visibilitychange"); await varias(6);
    assert.equal(t.reg.movidos.length, 1, "escondeu: gravou");
    D.doc.hidden = false; D.documento("visibilitychange");
    assert.match(t.reg.toasts.at(-1), /já foi gravado.*mensagens automáticas podem ter saído/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-059/273/280/088 · lógica: mínimo zero não é filtro, quanto falta para o prazo, corte na palavra", () => {
  assert.equal(L.visaoSemFiltroCRM({ funil: "f1", filtro: { valor_min: 0 } }, "kanban", { funilPadrao: "f1" }), true);
  assert.equal(L.visaoSemFiltroCRM({ funil: "f1", filtro: { valor_min: 10 } }, "kanban", { funilPadrao: "f1" }), false);
  const agora = Date.parse("2026-10-21T12:00:00Z");
  assert.equal(L.textoFaltaPrazo("2026-10-21T07:00:00Z", 10, agora), "faltam 5 h para o prazo");
  assert.equal(L.textoFaltaPrazo("2026-10-20T12:00:00Z", 48, agora), "falta 1 dia para o prazo");
  assert.equal(L.textoFaltaPrazo("2026-10-17T12:00:00Z", 48, agora), "prazo vencido há 2 dias");
  assert.equal(L.textoFaltaPrazo("2026-10-17T12:00:00Z", null, agora), "");
  assert.equal(L.cortarNaPalavra("Implante dentário superior completo", 20), "Implante dentário…");
  assert.equal(L.cortarNaPalavra("Curto", 20), "Curto");
});

/* ============================================================ plano 1500c · lote crm-b2 */
test("RC-068/078/093/097/100/098 · lógica: cor menos usada, taxa de ganho, etiquetas mudaram, atalhos da previsão, última mensagem e telefone de fora", () => {
  assert.equal(L.corMenosUsada(["#a", "#b", "#c"], ["#a", "#b", "#A"]), "#c");
  assert.equal(L.corMenosUsada(["#a", "#b"], ["#a", "#b"]), "#a", "empate: a primeira da paleta");
  assert.equal(L.corMenosUsada([], []), null);
  assert.deepEqual(L.taxaGanho([{ estagio_id: "s5", total: 3 }, { estagio_id: "s6", total: 1 }, { estagio_id: "s1", total: 9 }], ETAPAS_KB), { ganhos: 3, perdidos: 1, taxa: 0.75 });
  assert.equal(L.taxaGanho([{ estagio_id: "s1", total: 9 }], ETAPAS_KB).taxa, null);
  assert.equal(L.textoEtiquetasMudaram(["A"], []), "Etiqueta «A» adicionada");
  assert.equal(L.textoEtiquetasMudaram(["A", "B", "C"], []), "3 etiquetas adicionadas: «A», «B» e «C»");
  assert.equal(L.textoEtiquetasMudaram(["A"], ["B"]), "1 adicionada («A»), 1 removida («B»)");
  assert.deepEqual(L.atalhosPrevisao("2026-10-21").map(a => a.valor), ["2026-11-05", "2026-10-31", "2026-11-30"]);
  assert.deepEqual(L.atalhosPrevisao("2026-12-20").map(a => a.valor), ["2027-01-04", "2026-12-31", "2027-01-31"]);
  assert.equal(L.ultimaMensagemEm([{ ultima_msg_em: "2026-10-01T10:00:00Z" }, { ultima_mensagem_em: "2026-10-05T10:00:00Z" }, {}]), "2026-10-05T10:00:00Z");
  assert.equal(L.ultimaMensagemEm([]), null);
  assert.match(L.textoTelefoneInvalido("2025551234"), /outro país\? Comece com \+/);
  assert.match(L.textoTelefoneInvalido("123"), /^Telefone inválido/);
});

test("RC-079/082/108/109/111/106/117/120/121/124 · lógica: busca por e-mail e empresa, duplicar, responsável desativado, UFs, wa.me, LTV, ordem e páginas", () => {
  const cards = [{ id: 1, titulo: "A", email: "ana@x.com" }, { id: 2, titulo: "B", empresa_nome: "Frota Vale" }, { id: 3, titulo: "C" }];
  assert.deepEqual(L.filtrar(cards, { busca: "ana@x" }).map(c => c.id), [1]);
  assert.deepEqual(L.filtrar(cards, { busca: "frota" }).map(c => c.id), [2]);
  const dup = L.dadosDuplicar({ titulo: "Implante", servico: "Implante", valor_previsto: 3000, etiquetas: [5], funil_id: "f1", campos: { cor: "A2", presenca: "veio", score: 80 } }, { id: 501 });
  assert.equal(dup.titulo, "Implante (cópia)"); assert.equal(dup.contato_id, 501); assert.equal(dup.estagio_id, null);
  assert.deepEqual(dup.campos, { cor: "A2" }, "presença e score não são copiados");
  assert.deepEqual(L.opcoesResponsavel([{ id: "u1", nome: "Ana" }], "u9", "Bruno").at(-1), { valor: "u9", rotulo: "Bruno (desativado)" });
  assert.equal(L.opcoesResponsavel([{ id: "u1", nome: "Ana" }], "u1").length, 1);
  assert.equal(L.UFS.length, 27); assert.ok(L.UFS.includes("SP") && L.UFS.includes("DF"));
  assert.equal(L.telInternacional("12998303030"), "+5512998303030");
  assert.equal(L.hrefWhatsApp("5512998303030"), "https://wa.me/5512998303030");
  assert.equal(L.hrefWhatsApp("123"), null);
  assert.deepEqual(L.totalGanho([{ status: "ganho", valor: 900 }, { status: "ganho", valor_previsto: 100 }, { status: "aberto", valor_previsto: 5000 }]), { n: 2, valor: 1000 });
  const ord = L.ordenarNegociosEmpresa([{ id: 1, status: "perdido", criado_em: "2026-10-09" }, { id: 2, status: "ganho", criado_em: "2026-10-01" }, { id: 3, status: "aberto", criado_em: "2026-09-01" }, { id: 4, status: "aberto", criado_em: "2026-10-10" }]);
  assert.deepEqual(ord.map(n => n.id), [4, 3, 2, 1]);
  assert.equal(L.paginasDe(130, 50), 3); assert.equal(L.paginasDe(0, 50), 0); assert.equal(L.paginasDe(10, 0), 0);
});

test("RC-127/129/130/237 · lógica: exemplo da tarefa pela vertical e tipo, concluídas por data, nota longa", () => {
  assert.equal(L.exemploTarefa("oficina"), "Ligar para confirmar o orçamento");
  assert.equal(L.exemploTarefa("odonto"), "Ligar para confirmar a avaliação");
  assert.equal(L.exemploTarefa("loja", "whatsapp"), "Mandar mensagem sobre o pedido");
  assert.equal(L.exemploTarefa("oficina", "visita"), "Confirmar a visita da semana");
  const c = L.ordenarConcluidas([{ id: 1, concluida_em: "2026-10-01T10:00:00Z" }, { id: 2, concluida_em: "2026-10-03T10:00:00Z" }, { id: 3 }, { id: 4, concluida_em: "2026-10-02T10:00:00Z" }]);
  assert.deepEqual(c.map(x => x.id), [2, 4, 1, 3]);
  assert.equal(L.notaLonga("curta"), false);
  assert.equal(L.notaLonga("a\nb\nc\nd\ne\nf\ng"), true);
  assert.equal(L.notaLonga("x".repeat(500)), true);
});

/** k mínimo para crm-tarefas.js (itemTarefa, blocoTarefas, blocoNotas, formTarefa). */
function kTarefas(D, { rpc = async () => ({}), reg = {}, v = V, uix = {} } = {}) {
  const ui = uiDeMentira(D.h, reg);
  Object.assign(ui, uix);
  return { ui, h: D.h, L, v, base: { usuarios: [] }, pode: () => true, eu: () => "u1", toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && (e.codigo || e.message))); },
    erro: e => String(e && (e.codigo || e.message)), rascunho: () => ({ apagar() {} }), novaReq: () => "r1",
    api: { rpcC: async (nome, p) => { (reg.chamadas || (reg.chamadas = [])).push({ nome, p }); return rpc(nome, p); } } };
}

test("RC-128 · concluir com erro ambíguo tenta de novo e a caixa fica marcada", async () => {
  const D = domDeMentira();
  try {
    const reg = {};
    let n = 0;
    const k = kTarefas(D, { reg, rpc: async (nome, p) => { if (nome === "nx_tarefa_concluir" && ++n === 1) throw Object.assign(new Error("x"), { status: 502 }); return { id: p.p_id, concluida_em: "2026-10-21T12:00:00Z" }; } });
    const { itemTarefa } = await import("../web/app/crm-tarefas.js");
    const mudou = [];
    const li = itemTarefa(k, { id: 41, titulo: "Ligar", tipo: "ligacao", vence_em: iso(1), concluida_em: null }, { aoMudar: ev => mudou.push(ev) });
    const check = li.querySelector(".tf-check input");
    check.checked = true; check.dispara("change"); await varias(8);
    assert.equal(reg.chamadas.filter(c => c.nome === "nx_tarefa_concluir").length, 2, "antes: desmarcava na 1ª falha");
    assert.equal(check.checked, true);
    assert.ok(!reg.erros, "sem erro na tela");
    assert.ok(reg.avisos.some(a => /tentando de novo/.test(a)));
    assert.equal(mudou.length, 1);
    // erro de verdade (não ambíguo) não repete
    n = 0;
    const k2 = kTarefas(D, { reg: {}, rpc: async () => { throw Object.assign(new Error("y"), { codigo: "sem_permissao" }); } });
    const li2 = itemTarefa(k2, { id: 42, titulo: "X", tipo: "tarefa", vence_em: null, concluida_em: null }, {});
    const c2 = li2.querySelector(".tf-check input");
    c2.checked = true; c2.dispara("change"); await varias(8);
    assert.equal(c2.checked, false);
  } finally { D.desfazer(); }
});

test("RC-129/130 · bloco da ficha: concluída por último vem primeiro; nota longa recolhida com «Ver mais»", async () => {
  const D = domDeMentira();
  try {
    const k = kTarefas(D);
    const { blocoTarefas, blocoNotas } = await import("../web/app/crm-tarefas.js");
    const bl = blocoTarefas(k, { tarefas: [
      { id: 1, titulo: "Velha", tipo: "tarefa", vence_em: iso(-1), concluida_em: iso(-5) },
      { id: 2, titulo: "Nova", tipo: "tarefa", vence_em: iso(-9), concluida_em: iso(-1) },
      { id: 3, titulo: "Aberta", tipo: "tarefa", vence_em: iso(1), concluida_em: null }] });
    assert.deepEqual(bl.querySelectorAll(".tf").map(x => x.querySelector(".tf-t").textContent), ["Aberta", "Nova", "Velha"]);
    const longa = Array.from({ length: 9 }, (_, i) => `linha ${i}`).join("\n");
    const bn = blocoNotas(k, { notas: [{ id: 7, texto: longa, criado_em: iso(0), pode_editar: true }, { id: 8, texto: "curta", criado_em: iso(0), pode_editar: true }] });
    const [n1, n2] = bn.querySelectorAll(".nota");
    const p = n1.querySelector("p");
    assert.ok(p.classList.contains("nota-recolhida"));
    const bt = n1.querySelector(".nota-ver-mais");
    assert.equal(bt.getAttribute("aria-expanded"), "false");
    bt.clique();
    assert.equal(bt.getAttribute("aria-expanded"), "true"); assert.equal(bt.textContent, "Ver menos");
    assert.ok(!p.classList.contains("nota-recolhida"));
    assert.ok(!n2.querySelector(".nota-ver-mais"), "nota curta sem botão");
    assert.match(ler("crm.css"), /\.nota p\.nota-recolhida \{[^}]*line-clamp: 6/);
  } finally { D.desfazer(); }
});

test("RC-127/237 · nova tarefa: exemplo da oficina fala de orçamento e acompanha o tipo", async () => {
  const D = domDeMentira();
  try {
    let corpo = null;
    const k = kTarefas(D, { v: { ...V, vertical: "oficina" }, uix: { modal: async o => { corpo = o.corpo; return null; },
      campo: o => D.h("label", { class: "campo" }, o.rotulo || "", D.h(o.tipo === "select" ? "select" : "input", { name: o.nome, value: o.valor ?? "", placeholder: o.placeholder || null })) } });
    const { formTarefa } = await import("../web/app/crm-tarefas.js");
    await formTarefa(k, null, { contato_id: 5 });
    const tit = corpo.querySelector("[name=titulo]");
    assert.equal(tit.getAttribute("placeholder"), "Ex.: Ligar para confirmar o orçamento");
    const tipo = corpo.querySelector("[name=tipo]");
    tipo.value = "whatsapp"; tipo.dispara("change");
    assert.equal(tit.getAttribute("placeholder"), "Ex.: Mandar mensagem sobre o orçamento");
  } finally { D.desfazer(); }
});

test("RC-083 · faixa da seleção: etiquetar e trocar o responsável dos selecionados", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1", 1, { etiquetas: [3] })) }), uix: { modal: modalFila(respostas) },
      base: { etiquetas: [{ id: 5, nome: "VIP" }], usuarios: [{ id: "u2", nome: "Bia" }] }, etiqueta: id => (id === 5 ? { id: 5, nome: "VIP" } : null), usuario: id => (id === "u2" ? { id: "u2", nome: "Bia" } : null) });
    for (const id of [1, 2]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    respostas.push(5);
    t.tela.querySelector(".crm-sel-etq").clique(); await varias(10);
    const sal = t.chamadas("nx_negocio_salvar");
    assert.deepEqual(sal.map(c => c.p.p_negocio), [{ id: 1, etiquetas: [3, 5] }, { id: 2, etiquetas: [3, 5] }]);
    assert.match(t.reg.desfazer.at(-1).texto, /Etiqueta «VIP» posta em 2 cartões/);      // plano 2000d: DR-013 — o aviso agora tem «Desfazer»
    for (const id of [1, 2]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    respostas.push("u2");
    t.tela.querySelector(".crm-sel-dono").clique(); await varias(10);
    assert.deepEqual(t.chamadas("nx_negocio_salvar").slice(2).map(c => c.p.p_negocio), [{ id: 1, dono_id: "u2" }, { id: 2, dono_id: "u2" }]);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-087 · modo apresentação liga e desliga (aria-pressed) e o ouvinte sai no desmontar", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const bt = t.tela.querySelector(".crm-apresentar");
    assert.ok(bt, "antes: não havia modo apresentação");
    bt.clique();
    assert.ok(t.tela.classList.contains("kb-apresentacao")); assert.equal(bt.getAttribute("aria-pressed"), "true");
    bt.clique();
    assert.ok(!t.tela.classList.contains("kb-apresentacao")); assert.equal(bt.getAttribute("aria-pressed"), "false");
    t.api.desmontar();
    assert.match(ler("crm.css"), /\.kb-apresentacao/);
  } finally { D.desfazer(); }
});

test("RC-078 · resumo do funil mostra a taxa de ganho do período", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1")), s5: col("s5", cartoes(3, "s5", 20, { status: "ganho" })), s6: col("s6", cartoes(1, "s6", 30, { status: "perdido" })) }) });
    assert.match(t.tela.querySelector(".crm-fr-nota").textContent, /^Taxa de ganho [^:]*: 75% — 3 de 4\./);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-092/094/100 · gaveta: Esc na observação não fecha; outro negócio sem valor diz «Sem valor»; última mensagem", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { ver: { outros: [{ id: 9, titulo: "Outro", status: "aberto", estagio_id: "s1", valor_previsto: null }], conversas: [{ id: 3, ultima_msg_em: iso(-5) }] } });
    await varias(6);
    const corpo = t.corpo();
    assert.ok(corpo.textContent.includes("Sem valor"), "antes: «R$ 0»");
    assert.ok(corpo.querySelector(".ng-ult-msg"), "última mensagem do cliente");
    const ta = corpo.querySelector("textarea");
    if (ta) {
      let parou = false;
      ta.dispara("keydown", { key: "Escape", stopPropagation() { parou = true; }, preventDefault() {} });
      assert.ok(parou || !t.g.fechada, "Esc na observação não fecha a gaveta");
    }
  } finally { D.desfazer(); }
});

test("RC-082 · «Duplicar» no menu da gaveta abre o novo já preenchido", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { titulo: "Implante", servico: "Implante", valor_previsto: 3000, etiquetas: [5] } });
    await varias(6);
    let itens = null;
    t.k.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    t.corpo().querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais ações").clique();
    const dup = itens.find(i => i && i.rotulo === "Duplicar");
    assert.ok(dup, "antes: sem «Duplicar»");
    dup.fn(); await varias(8);
    const nova = t.reg.gavetas.at(-1).corpo;
    assert.equal(nova.querySelector("[name=titulo]").value, "Implante (cópia)");
    assert.equal(nova.querySelector("[name=servico]").value, "Implante");
    assert.match(nova.querySelector("[name=valor_previsto]").value, /^3\.000,00$/);
    assert.ok(nova.querySelector("[name=previsao_fechamento]"), "RC-097: previsão já no cadastro");
  } finally { D.desfazer(); }
});

test("RC-103/104/106/111/117/118 · ficha: tel:, mailto:, wa.me sem Conversas, copiar +55 e total ganho", async () => {
  const D = domDeMentira();
  try {
    const contato = { id: 501, nome: "Ana", telefone: "5512998303030", email: "ana@x.com" };
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contato_ver" ? { contato, empresa: null, negocios: [{ id: 1, status: "ganho", valor: 900, estagio_id: "s5" }, { id: 2, status: "ganho", valor: 100, estagio_id: "s5" }], conversas: [], tarefas: [], notas: [], tempo: [] } : undefined) });
    t.k.nomes = () => ({}); t.k.motivosPorId = () => ({}); t.k.estagio = () => null; t.k.funil = () => null;
    let itensMenu = null;
    t.ui.menu = (a, l) => { itensMenu = l; return { fechar() {} }; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    assert.equal(el.querySelector(".fx-tel").getAttribute("href"), "tel:+5512998303030");
    assert.equal(el.querySelector(".fx-email").getAttribute("href"), "mailto:ana@x.com");
    assert.ok(el.querySelectorAll(".sr-only").some(s => s.textContent === "E-mail: "));
    assert.match(el.querySelector(".fx-ltv").textContent, /Total ganho R\$ 1000 em 2/);
    el.querySelectorAll("button").find(b => b.getAttribute("aria-label") === "Mais ações").clique();
    assert.ok(itensMenu.some(i => i && i.rotulo === "Copiar no formato internacional"));
    assert.ok(itensMenu.some(i => i && i.rotulo === "Abrir no WhatsApp"));
  } finally { D.desfazer(); }
});

test("RC-067/070/090/091/096/102/105/107/113/116/119/122/125 · as mudanças estão no código (comportamento coberto pelos testes de tela antigos)", () => {
  const crm = ler("crm.js"), kb = ler("crm-kanban.js"), ng = ler("crm-negocio.js"), ls = ler("crm-listas.js");
  assert.match(crm, /partes\[0\] === "negocio".*telaAtual\.chave/, "RC-067: o link do negócio reaproveita o quadro aberto");
  assert.match(kb, /RC-070[^\n]*\n\s*if \(S\.vivo\) abrir\(mov\.id\)/);
  assert.doesNotMatch(ng, /name: `mot-\$\{Date\.now\(\)\}`/); assert.match(ng, /L\.idUnico\("mot"\)/);
  assert.match(ng, /RC-091/); assert.match(ng, /pointer: coarse/);
  assert.match(ls, /temConv \?/); assert.match(ls, /c\.telefone \? ui\.telBR\(c\.telefone\) : c\.email/);
  assert.match(ls, /ct-em-uso/); assert.match(ls, /com o filtro/); assert.match(ls, /nx-app-ct-dica-deslizar/);
  assert.match(ls, /carregar\(\{ quieto: true \}\)/); assert.match(ls, /emp-cadastrar-novo/);
  assert.match(ls, /RC-125[\s\S]{0,400}acaoComDesfazer|acaoComDesfazer[\s\S]{0,400}nx_empresa_excluir/);
});
/* ============================================================ plano 1500c · lote crm-b3 */
test("RC-131/136/240 · lógica: links e telefones da nota, trocar só a hora, responsável sugerido", () => {
  const p = L.partesNota("Ver https://site.com/a?b=1. Ligar (12) 99830-3030 amanhã; ano 2026");
  assert.deepEqual(p.map(x => x.tipo), ["texto", "url", "texto", "tel", "texto"]);
  assert.equal(p[1].href, "https://site.com/a?b=1", "o ponto final fica fora do link");
  assert.equal(p[3].href, "tel:+5512998303030");
  assert.equal(p.map(x => x.texto).join(""), "Ver https://site.com/a?b=1. Ligar (12) 99830-3030 amanhã; ano 2026", "nada do texto se perde");
  assert.deepEqual(L.partesNota("sem nada"), [{ tipo: "texto", texto: "sem nada" }]);
  assert.equal(L.trocarHora("2026-10-21T09:00", "14:00"), "2026-10-21T14:00");
  assert.equal(L.trocarHora("", "16:00", "2026-10-22"), "2026-10-22T16:00");
  assert.equal(L.donoSugeridoTarefa("u2", [{ id: "u1" }, { id: "u2" }], "u1"), "u2");
  assert.equal(L.donoSugeridoTarefa("u9", [{ id: "u1" }], "u1"), "u1", "quem saiu da equipe não vira responsável");
  assert.equal(L.donoSugeridoTarefa(null, [], "u1"), "u1");
});

test("RC-138/139/142/143/145 · lógica dos filtros salvos: renomear, repor na posição, data antiga, exemplo do valor e limite", () => {
  const T = "kanban";
  const a = L.salvarVisaoCRM([], T, { nome: "Um", dados: { funil: "f1", filtro: { dono: "eu" } } }, { idNovo: "va" }).visoes;
  const b = L.salvarVisaoCRM(a, T, { nome: "Dois", dados: { funil: "f1", filtro: { dono: "sem" } } }, { idNovo: "vb" }).visoes;
  const r = L.renomearVisaoCRM(b, T, "va", "Primeiro");
  assert.ok(r.ok); assert.equal(r.visoes.find(v => v.id === "va").nome, "Primeiro");
  assert.deepEqual(r.visoes.find(v => v.id === "va").dados, b.find(v => v.id === "va").dados, "os dados não mudam");
  assert.equal(L.renomearVisaoCRM(b, T, "va", "Dois").codigo, "nome_duplicado");
  const sem = L.excluirVisaoCRM(b, T, "va");
  assert.deepEqual(L.reporVisaoCRM(sem, T, b[0], 0).map(v => v.id), ["va", "vb"], "volta à mesma posição");
  assert.equal(L.dataParaFiltro("31/12/2026"), "2026-12-31");
  assert.equal(L.dataParaFiltro("2026-12-31"), "2026-12-31");
  assert.equal(L.dataParaFiltro("lixo"), "");
  assert.equal(L.exemploValorFiltro("moeda"), "Ex.: 1.500,00");
  assert.equal(L.exemploValorFiltro("texto"), "Valor");
  assert.equal(L.LIMITE_VISOES_CRM, 12);
});

test("RC-149/148/154/162/165/160 · lógica da configuração: nome da cor, rolagem, modelos válidos, motivos sugeridos, ordem e exemplos", () => {
  const pal = ["#111111", "#222222"];
  assert.equal(L.nomeCorPaleta("#222222", pal), "azul-claro");
  assert.equal(L.nomeCorPaleta("#abcdef", pal), "cor personalizada");
  assert.equal(L.nomeCorPaleta(null, pal), "sem cor");
  assert.ok(L.velocidadeRolagem(5, 800) < 0); assert.ok(L.velocidadeRolagem(795, 800) > 0); assert.equal(L.velocidadeRolagem(400, 800), 0);
  for (const vert of ["odonto", "oficina", "loja", "generico"]) {
    for (const m of L.modelosFunil(vert)) {
      const erros = L.validarFunil({ nome: m.nome, conta_no_ads: false, estagios: m.etapas }).filter(x => x.nivel !== "aviso");
      assert.deepEqual(erros, [], `${vert}/${m.id} é um funil válido`);
    }
  }
  assert.deepEqual(L.modelosFunil("oficina")[0].etapas.map(e => e.nome).slice(0, 4), ["Orçamento", "Aprovação", "Execução", "Entrega"]);
  const mot = L.motivosSugeridos("oficina");
  assert.equal(mot[0].nome, "Achou caro"); assert.equal(mot.at(-1).exige_texto, true);
  assert.deepEqual(L.ordenarFunisConfig([{ id: 1, nome: "B", ordem: 1, ativo: false }, { id: 2, nome: "A", ordem: 2 }, { id: 3, nome: "C", ordem: 1 }]).map(f => f.id), [3, 2, 1]);
  assert.equal(L.exemplosVertical("oficina").campoContato, "Modelo do carro");
});

test("RC-167/168/169/175/257 · lógica: colunas da prévia, marcos de 10%, estimativa, texto colado e resumo por pessoa", () => {
  const cols = L.colunasPrevia(["nome", "sobrenome", "nascimento", "campo:convenio", null, "nome"], [{ valor: "nascimento", rotulo: "Nascimento" }, { valor: "campo:convenio", rotulo: "Campo: Convênio" }, { valor: "nome", rotulo: "Nome" }]);
  assert.deepEqual(cols.map(c => c.rotulo), ["Nome", "Nascimento", "Convênio"]);
  assert.equal(cols[2].campo, "convenio");
  assert.equal(L.marcoProgresso(0, 100, 1000), 10); assert.equal(L.marcoProgresso(100, 150, 1000), null); assert.equal(L.marcoProgresso(900, 1000, 1000), null, "o fim tem anúncio próprio");
  assert.equal(L.estimativaRestante(60000, 1000, 3000), "cerca de 3 min");
  assert.equal(L.estimativaRestante(1000, 1000, 10), "menos de 1 min");
  assert.equal(L.estimativaRestante(0, 0, 10), "");
  assert.equal(L.contagemColado("Nome\tTel\nAna\t1\nBia\t2\n"), "2 linhas · 2 colunas");
  assert.equal(L.contagemColado(""), "");
  const r = L.resumoPorPessoa([{ estagio_id: "s1", total: 3, itens: [{ dono_id: "u1", valor_previsto: 1000 }, { dono_id: null, valor_previsto: 50 }] }, { estagio_id: "s5", total: 1, itens: [{ dono_id: "u1", valor: 999 }] }], ETAPAS_KB);
  assert.deepEqual(r.linhas, [{ dono_id: "u1", n: 1, valor: 1000, ponderado: 100 }, { dono_id: null, n: 1, valor: 50, ponderado: 5 }]);
  assert.equal(r.parcial, true, "a coluna tem 3 e só 2 vieram");
});

test("RC-131/137/238/239 · tarefa e nota: selo «sem prazo», automação com nome, títulos nos botões e links na nota", async () => {
  const D = domDeMentira();
  try {
    const k = kTarefas(D);
    const { itemTarefa, blocoNotas } = await import("../web/app/crm-tarefas.js");
    const li = itemTarefa(k, { id: 1, titulo: "X", tipo: "tarefa", vence_em: null, concluida_em: null, automacao: { nome: "Boas-vindas" } }, {});
    assert.ok(li.querySelector(".tf-sem-prazo"), "antes: «Sem prazo» sem selo");
    assert.match(li.querySelector(".tf-auto").textContent, /Automação: Boas-vindas/);
    assert.equal(li.querySelectorAll(".tf-acoes .bt-icone").map(b => b.getAttribute("title")).slice(0, 2).join(","), "Editar,Excluir");
    const bn = blocoNotas(k, { notas: [{ id: 7, texto: "Site https://x.com e tel (12) 99830-3030", criado_em: iso(0), pode_editar: true }] });
    const links = bn.querySelectorAll(".nota p a");
    assert.deepEqual(links.map(a => a.getAttribute("href")), ["https://x.com", "tel:+5512998303030"]);
    assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
  } finally { D.desfazer(); }
});

test("RC-136/240 · nova tarefa: horas comuns trocam só a hora; responsável sugerido é o dono do negócio", async () => {
  const D = domDeMentira();
  try {
    let corpo = null, donoValor = "nao-chamado";
    const k = kTarefas(D, { uix: { modal: async o => { corpo = o.corpo; return null; }, seletorPessoa: o => { donoValor = o.valor; return D.h("select", { class: "sel" }); },
      campo: o => D.h("label", { class: "campo" }, o.rotulo || "", D.h(o.tipo === "select" ? "select" : "input", { name: o.nome, value: o.valor ?? "" })) } });
    k.base.usuarios = [{ id: "u1", nome: "Eu" }, { id: "u2", nome: "Bia" }];
    const { formTarefa } = await import("../web/app/crm-tarefas.js");
    await formTarefa(k, null, { negocio_id: 5, dono_id: "u2" });
    assert.equal(donoValor, "u2", "antes: sempre «eu»");
    const prazo = corpo.querySelector("[name=vence_em]");
    prazo.value = "2026-10-22T09:00";
    corpo.querySelectorAll(".tf-hora").find(b => b.dataset.hora === "16:00").clique();
    assert.equal(prazo.value, "2026-10-22T16:00");
  } finally { D.desfazer(); }
});

/** controlesVisoes de verdade (crm-visoes.js) com storage de mentira. */
async function montarVisoes(D, { tipo = "kanban", dados = { funil: "f1", filtro: { dono: "eu" } }, uix = {} } = {}) {
  const reg = {};
  const ui = uiDeMentira(D.h, reg);
  Object.assign(ui, uix);
  let atual = dados;
  const k = { ui, h: D.h, L, ctx: { cliente: { id: "c1" } }, eu: () => "u1", funilPadrao: () => ({ id: "f1" }) };
  const Vis = await import("../web/app/crm-visoes.js");
  const c = Vis.controlesVisoes(k, { tipo, obterDados: () => atual, aplicar: async d => { atual = d; } });
  h0(D, "div").appendChild(c.el);
  return { c, reg, k, Vis, mudar: d => { atual = d; c.atualizar(); } };
}

test("RC-138/139/145 · filtros salvos: «N de 12 usados», renomear sem aplicar e excluir com «Desfazer» na mesma posição", async () => {
  const D = domDeMentira();
  try {
    const chave = L.chaveVisoesCRM("c1", "u1", "kanban");
    D.storage.set(chave, JSON.stringify([{ id: "va", nome: "Meus", dados: { funil: "f1", filtro: { dono: "eu" } } }, { id: "vb", nome: "Sem dono", dados: { funil: "f1", filtro: { dono: "sem" } } }]));
    let corpoModal = null;
    const t = await montarVisoes(D, { dados: { funil: "f1", filtro: { dono: "eu" } }, uix: { modal: async o => { corpoModal = o.corpo; return null; }, lerForm: () => ({ nome: "Meus cartões" }) } });
    const ren = t.c.el.querySelector(".crm-visoes-renomear");
    assert.equal(ren.hidden, false, "antes: não havia «Renomear»");
    t.k.ui.modal = async o => { o.acoes[1].fn({ erro() {} }); return null; };
    ren.clique(); await varias();
    assert.equal(JSON.parse(D.storage.get(chave)).find(v => v.id === "va").nome, "Meus cartões");
    t.c.el.querySelector(".crm-visoes-excluir").clique(); await varias();
    assert.deepEqual(JSON.parse(D.storage.get(chave)).map(v => v.id), ["vb"], "excluiu na hora, sem diálogo");
    await t.reg.desfazer.at(-1).reverter();
    assert.deepEqual(JSON.parse(D.storage.get(chave)).map(v => v.id), ["va", "vb"], "o Desfazer devolve na mesma posição");
    t.mudar({ funil: "f1", filtro: { dono: "u2" } });
    t.k.ui.modal = async o => { corpoModal = o.corpo; return null; };
    t.c.el.querySelector(".crm-visoes-salvar").clique(); await varias();
    assert.match(corpoModal.textContent, /2 de 12 usados/);
  } finally { D.desfazer(); }
});

test("RC-142/143/144 · filtro de campo: data antiga convertida, exemplo pelo tipo e contagem de etiquetas anunciada", async () => {
  const D = domDeMentira();
  try {
    const ui = uiDeMentira(D.h, {});
    const k = { ui, h: D.h, L, base: { campos: [{ chave: "retorno", rotulo: "Retorno", tipo: "data", entidade: "negocio" }, { chave: "sinal", rotulo: "Sinal", tipo: "moeda", entidade: "negocio" }] } };
    const Vis = await import("../web/app/crm-visoes.js");
    // o select de mentira não lê a <option selected>: aqui ele lê, como o navegador
    const proto = Object.getPrototypeOf(D.h("div"));
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    Object.defineProperty(proto, "value", { configurable: true, get() { if (this._v === undefined && this.tagName === "SELECT") { const o = this.els.find(x => x.selected) || this.els[0]; return o ? o.value : ""; } return this._v ?? ""; }, set(v) { this._v = v; } });
    try {
    const g = Vis.grupoFiltroCampo(k, { entidade: "negocio", atual: { chave: "retorno", op: "igual", valor: "31/12/2026" } });
    const inp = g.el.querySelector(".crm-fc-valor input");
    assert.equal(inp.value, "2026-12-31", "antes: o date ficava vazio");
    const g2 = Vis.grupoFiltroCampo(k, { entidade: "negocio", atual: { chave: "sinal", op: "maior", valor: "" } });
    assert.equal(g2.el.querySelector(".crm-fc-valor input").getAttribute("placeholder"), "Ex.: 1.500,00");
    const g3 = Vis.grupoFiltroCampo(k, { entidade: "negocio", atual: { chave: "retorno", op: "igual", valor: "lixo" } });
    assert.ok(g3.el.querySelector(".crm-fc-aviso"), "valor salvo inválido avisa já no campo");
    } finally { Object.defineProperty(proto, "value", desc); }
    const ops = D.h("div", null, Array.from({ length: 14 }, (_, i) => D.h("label", { class: "crm-op" }, D.h("input", { type: "checkbox" }), i < 3 ? `Retorno ${i}` : `Outra ${i}`)));
    const busca = Vis.buscaEtiquetas(k, ops);
    const campo = busca.querySelector("input");
    campo.value = "retorno"; campo.dispara("input");
    await esperar(450);
    assert.equal(busca.querySelector(".crm-fe-cont").textContent, "3 etiquetas");
  } finally { D.desfazer(); }
});

test("RC-146/147/149/152/154/163/165 · funis: cor com nome, mini-rótulos, abertos por funil, modelos da vertical, desativados no fim", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    const css = ler("crm.css");
    assert.match(css, /\.fe-cor::after \{ content: ""; position: absolute; inset: -9px; \}/, "RC-146: alvo de 44 px");
    t.base.funis.push({ id: "f3", nome: "Antigo", ordem: 0, ativo: false, conta_no_ads: false, estagios: [{ id: "c1", nome: "N", tipo: "aberto" }, { id: "c2", nome: "G", tipo: "ganho" }, { id: "c3", nome: "P", tipo: "perdido" }] });
    t.reg.chamadas.length = 0;
    t.alvo.querySelectorAll("button").find(b => b.textContent === "Novo funil").clique(); await varias();      // plano 2000d: DR-208 — o botão de criar tem verbo
    // editor de funil novo: modelos da vertical
    const sel = t.alvo.querySelector(".fe-modelo");
    assert.ok(sel, "RC-154: «Começar com» no funil novo");
    sel.value = sel.querySelectorAll("option")[1].value; sel.dispara("change");
    assert.deepEqual(t.alvo.querySelectorAll(".fe-etapa").map(l => l.querySelector(".fe-nome").value).slice(0, 3), ["Avaliação", "Plano apresentado", "Em tratamento"]);
    assert.ok(t.alvo.querySelectorAll(".fe-mini").length >= 2, "RC-147");
    assert.match(t.alvo.querySelector(".fe-cor").getAttribute("aria-label"), /: (sem cor|cor personalizada|[a-zá-ú-]+)$/);
    assert.doesNotMatch(t.alvo.querySelector(".fe-cor").getAttribute("aria-label"), /#/, "RC-149: sem código hexadecimal");
  } finally { D.desfazer(); }
});

test("RC-152/165 · lista de funis: desativados no fim e abertos contados", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    ui.menu = () => ({ fechar() {} });
    const base = { funis: [
      { id: "f9", nome: "Velho", ordem: 0, ativo: false, conta_no_ads: false, estagios: [{ id: "x1", nome: "N", tipo: "aberto" }] },
      { id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [{ id: "a1", nome: "Novo", tipo: "aberto" }, { id: "a3", nome: "Fechou", tipo: "ganho" }] }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: async (n, p) => (n === "nx_negocios_kanban" ? { colunas: p.p_funil === "f1" ? [{ estagio_id: "a1", total: 32 }, { estagio_id: "a3", total: 5 }] : [] } : {}) } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo); await varias();
    const itens = alvo.querySelectorAll(".crm-cfg-funil");
    assert.deepEqual(itens.map(i => i.querySelector("b").textContent), ["Pacientes", "Velho"], "antes: o desativado (ordem 0) vinha no topo");
    assert.ok(itens[1].textContent.includes("Desativados"));
    assert.match(itens[0].querySelector(".crm-cfg-abertos").textContent, /32 abertas/);
  } finally { D.desfazer(); }
});

test("RC-159/160/162/163/164 · campos, etiquetas e motivos: exemplos da vertical, motivos sugeridos, fim da lista focável", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const placeholders = [];
    ui.campo = o => { if (o.placeholder) placeholders.push(o.placeholder); return h("label", { class: "campo", dataset: { campo: o.nome } }, h(o.tipo === "select" ? "select" : o.tipo === "textarea" ? "textarea" : "input", { name: o.nome })); };
    ui.modal = async () => null;
    const salvos = [];
    const base = { funis: [], etiquetas: [], motivos: [], campos: [{ id: 1, chave: "a", rotulo: "A", tipo: "texto", entidade: "contato", ordem: 1 }, { id: 2, chave: "b", rotulo: "B", tipo: "texto", entidade: "contato", ordem: 2 }] };
    const k = { ui, h, L, base, v: { ...V, vertical: "oficina" }, cor: () => null, erro: e => String(e), pode: () => true, recarregarBase: async () => base,
      api: { rpcC: async (n, p) => { if (n === "nx_motivo_salvar") { salvos.push(p.p_motivo); base.motivos.push({ id: salvos.length, ...p.p_motivo }); } return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const aC = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, aC);
    const subir = aC.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Subir A");
    assert.equal(subir.disabled, false, "RC-163: continua focável");
    assert.equal(subir.getAttribute("aria-disabled"), "true"); assert.equal(subir.getAttribute("title"), "Já é o primeiro");
    aC.querySelectorAll("button").find(b => b.textContent === "Novo campo").clique(); await varias();      // plano 2000d: DR-208 — o botão de criar tem verbo
    assert.ok(placeholders.includes("Ex.: Modelo do carro"), "RC-160: antes «Ex.: Convênio» para toda vertical");
    const aE = h0(D, "div");
    await secoesConfig.find(s => s.id === "etiquetas").montar(ctx, aE);
    aE.querySelectorAll("button").find(b => b.textContent === "Nova etiqueta").clique(); await varias();      // plano 2000d: DR-208 — o botão de criar tem verbo
    assert.ok(placeholders.includes("Ex.: Revisão"), "RC-159");
    const aM = h0(D, "div");
    await secoesConfig.find(s => s.id === "motivos").montar(ctx, aM);
    aM.querySelectorAll("button").find(b => b.textContent === "Usar motivos sugeridos").clique(); await varias(10);
    assert.deepEqual(salvos.map(m => m.nome), ["Achou caro", "Fechou com outro", "Sem retorno", "Vai fazer depois", "Outro"]);
    assert.ok(/destaque/.test(ler("crm-config.js")) && /crm-cfg-destaque/.test(ler("crm.css")), "RC-164: a etiqueta que já existia é destacada");
  } finally { D.desfazer(); }
});

const CSV_B3 = "Nome\tTelefone\tNascimento\tObs\nAna\t12998303030\t05/03/1990\tCliente antiga\n\t\t\tsó observação\nBia\t12998303031\t\t\n";
test("RC-167/171/173/175/177 · importação: prévia com todos os destinos, linhas vazias fora do botão, «Eu», contador do colado e «Detalhes»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    t.reg.k = null;
    const ta = t.tela.querySelector("textarea");
    ta.value = CSV_B3; ta.dispara("input"); await esperar(300);
    assert.equal(t.tela.querySelector(".imp-colar-cont").textContent, "3 linhas · 4 colunas", "RC-175");
    t.botao("Usar o texto colado").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    const ths = t.reg.colunas.map(c => c.rotulo);
    assert.ok(ths.includes("Nascimento") && ths.includes("Observação"), `RC-167: ${ths.join(",")}`);
    assert.ok(t.tela.querySelector(".imp-det-regra"), "RC-177");
    t.botao("Continuar").clique(); await varias();
    assert.ok(t.tela.querySelectorAll("button").some(b => /^Importar 2 linhas$/.test(b.textContent.trim())), "RC-171: a vazia não conta");
    assert.match(t.tela.querySelector(".imp-lista").textContent, /1 vazia será pulada/);
    assert.equal(t.tela.querySelector(".imp-prog-txt").getAttribute("aria-live"), null, "RC-168: o texto não é região viva");
  } finally { D.desfazer(); }
});

test("RC-173 · importação: atalho «Eu» no responsável", async () => {
  const D = domDeMentira();
  try {
    const usuarios = [{ id: "u1", nome: "Eu" }];
    const t = await montarImp(D, { kx: { eu: () => "u1", usuario: id => usuarios.find(u => u.id === id) || null } });
    t.tela.querySelector("textarea").value = CSV_B3; t.botao("Usar o texto colado").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    const eu = t.tela.querySelector(".imp-dono-eu");
    assert.ok(eu, "antes: só o seletor vazio");
    eu.clique();
    t.botao("Continuar").clique(); await varias();
    assert.match(t.tela.querySelector(".imp-lista").textContent, /responsável: Eu/);
  } finally { D.desfazer(); }
});
test("RC-176/170/178/263 · importação: pausa sem laço de 200 ms, título da aba, abas de problemas e conferência guardada", () => {
  const src = ler("crm-importar.js");
  assert.doesNotMatch(src, /await esperar\(200\)/, "RC-176: antes sondava a cada 200 ms");
  assert.match(src, /await esperarRetomar\(\)/);
  assert.match(src, /document\.title = S\.erroFatal \? "! Importação interrompida" : "✓ Importação concluída"/, "RC-170");
  assert.match(src, /Não entraram \(\$\{ui\.num\(s\.erros\.length\)\}\)/, "RC-178");
  assert.match(src, /const cf = conferirMemo\(/, "RC-263");
});

test("RC-253/257/264 · quadro: dicas da 1ª visita, «Por pessoa» no resumo e faixa sem internet", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const dados = quadroDe({ s1: col("s1", [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, dono_id: "u2", valor_previsto: 1000 }, { id: 2, titulo: "B", status: "aberto", estagio_id: "s1", ordem: 20, valor_previsto: 100 }]) });
    const t = await montarKb(D, { dados, usuario: id => (id === "u2" ? { id: "u2", nome: "Bia" } : null) });
    const tour = t.tela.querySelector(".kb-tour");
    assert.ok(tour, "RC-253: dicas na 1ª visita");
    tour.querySelector(".kb-tour-ok").clique();
    assert.equal(D.storage.get("nx-app-crm-tour-quadro:cli-p1000:u1"), "1");      // plano 2000d: DR-006 — a chave é por empresa e conta
    assert.ok(!t.tela.querySelector(".kb-tour"));
    const pessoas = t.tela.querySelector(".crm-fr-tab-pessoas");
    assert.ok(pessoas, "RC-257");
    assert.deepEqual(pessoas.querySelectorAll("tbody th").map(x => x.textContent), ["Bia", "Sem responsável"]);
    t.api.desmontar();
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    const t2 = await montarKb(D, { dados });
    assert.equal(t2.tela.querySelector(".kb-sem-rede").hidden, false, "RC-264");
    assert.ok(!t2.tela.querySelector(".kb-tour"), "a dica não volta");
    globalThis.navigator.onLine = true; D.janela("online");
    assert.equal(t2.tela.querySelector(".kb-sem-rede").hidden, true);
    t2.api.desmontar();
    assert.equal((D.daJanela.online || []).length, 0, "o ouvinte sai no desmontar");
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); D.desfazer(); }
});
test("RC-150/151 · funis: progresso visível ao excluir/salvar e guarda de saída do editor com mudanças", () => {
  const src = ler("crm-config.js");
  assert.match(src, /if \(prog\) prog\.textContent = `Movendo \$\{k\.v\.min\("negocios"\)\}… faltam \$\{x\.restantes\}\.`/, "RC-150: antes só o leitor ouvia");     // plano 1500c: RC-334 trocou o laço por L.repetirAteTerminar (aoProgresso(x))
  assert.match(src, /for \(const b of itemF\.querySelectorAll\("button"\)\) b\.disabled = true/);
  assert.match(src, /addEventListener\("beforeunload", aoSairDaAba\)/, "RC-151");
  assert.match(src, /ctx\.naoAtualizar\(sujo\)/);
  assert.match(src, /return \(\) => \{ vivo = false; soltarGuardas\(\); \};/, "a guarda sai quando a seção desmonta");
});

/* ============================================================ plano 1500c · lote crm-b4 */
test("RC-289/303 · CSS: impressão só com o conteúdo e contador dos filtros com 12 px", () => {
  const css = ler("crm.css");
  assert.match(css, /@media print \{[^]*?body:has\(\.crm\) \* \{ visibility: hidden; \}/, "RC-289: antes saía com menu e botões");
  const regra = /\.crm-filtro-n \{([^}]*)\}/.exec(css)[1];
  assert.match(regra, /font-size: var\(--fs-12\)/, "RC-303: era 11 px"); assert.match(regra, /min-width: 20px/);
});
const campoDe = (raiz, rotulo) => raiz.querySelectorAll(".ng-campo").find(c => c.querySelector("dt") && c.querySelector("dt").textContent === rotulo);
test("RC-286/287/283/318/315/334 · lógica: etapa para reabrir, centavos, previsão vencida, posição do desfazer, bloqueio e laço até terminar", async () => {
  const est = [{ id: "s1", nome: "Nova", tipo: "aberto" }, { id: "s2", nome: "Agendada", tipo: "aberto" }, { id: "s5", nome: "Fechou", tipo: "ganho" }];
  const tempo = [{ tipo: "estagio", em: "2026-10-01T10:00:00Z", dados: { de: "s1", para: "s2" } }, { tipo: "estagio", em: "2026-10-05T10:00:00Z", dados: { de: "s2", para: "s5" } }];
  assert.equal(L.etapaParaReabrir(tempo, est).id, "s2", "RC-286: volta para onde estava antes de fechar");
  assert.equal(L.etapaParaReabrir([{ tipo: "estagio", dados: { de_nome: "Agendada", para_nome: "Fechou" } }], est).id, "s2", "pelo nome também");
  assert.equal(L.etapaParaReabrir([], est), null, "sem histórico: quem chama usa a 1ª etapa");
  assert.equal(L.temCentavos(1500), false); assert.equal(L.temCentavos(1500.5), true); assert.equal(L.temCentavos("x"), false);
  assert.equal(L.previsaoVencida("2026-10-20", "2026-10-21"), true); assert.equal(L.previsaoVencida("2026-10-21", "2026-10-21"), false); assert.equal(L.previsaoVencida(null, "2026-10-21"), false);
  const etapas = [{ _k: 1 }, { _k: 3 }, { _k: 4 }];
  assert.equal(L.posicaoDesfazer(etapas, 3, 0), 2, "RC-318: logo depois da vizinha de cima, mesmo que o índice antigo mude");
  assert.equal(L.posicaoDesfazer(etapas, null, 2), 0, "era a primeira");
  assert.equal(L.posicaoDesfazer(etapas, 99, 9), 3, "vizinha também removida: índice antigo, no máximo o fim");
  assert.equal(L.textoBloqueio({ bloqueado_por: "u2", bloqueado_em: "2026-10-10T12:00:00Z" }, { usuario: () => ({ nome: "Ana" }), data: () => "10/10" }), " por Ana em 10/10", "RC-315");
  assert.equal(L.textoBloqueio({ bloqueado: true }), "", "sem os dados do servidor nada muda");
  const prog = []; let n = 3;
  const r = await L.repetirAteTerminar(async () => ({ restantes: --n }), { terminou: x => x.restantes <= 0, aoProgresso: x => prog.push(x.restantes) });
  assert.equal(r.restantes, 0); assert.deepEqual(prog, [2, 1], "RC-334: progresso a cada volta");
  let voltas = 0;
  await L.repetirAteTerminar(async () => { voltas++; return { restantes: 5 }; }, { terminou: () => false, continuar: () => voltas < 2 });
  assert.equal(voltas, 2, "para quando a tela sai");
});

test("RC-294/307/324/327/333 · lógica: previsão por mês, CSV de tarefas, 60/90 dias, link com filtros e pendente sumido", () => {
  const est = [{ id: "s1", tipo: "aberto", probabilidade: 10 }, { id: "s2", tipo: "aberto", probabilidade: 50 }, { id: "s5", tipo: "ganho", probabilidade: 100 }];
  const cols = [
    { estagio_id: "s1", total: 3, itens: [{ id: 1, valor_previsto: 1000, previsao_fechamento: "2026-12-05" }, { id: 2, valor_previsto: 500 }] },
    { estagio_id: "s2", total: 2, itens: [{ id: 3, valor_previsto: 2000, previsao_fechamento: "2026-11-10" }, { id: 4, valor_previsto: 1000, previsao_fechamento: "2026-11-20" }] },
    { estagio_id: "s5", total: 1, itens: [{ id: 5, valor: 900, previsao_fechamento: "2026-11-01" }] }];
  const pm = L.previsaoPorMes(cols, est);
  assert.deepEqual(pm.meses.map(m => [m.mes, m.n, m.valor, m.ponderado]), [["2026-11", 2, 3000, 1500], ["2026-12", 1, 1000, 100]], "RC-294: fechados não entram");
  assert.equal(pm.semData, 1); assert.equal(pm.parcial, true);
  assert.equal(L.rotuloMes("2026-11"), "nov/2026");
  assert.deepEqual(L.previsaoPorMes([{ estagio_id: "s1", total: 1, itens: [{ id: 1 }] }], est).meses, [], "sem o campo: nada (a tabela some)");
  const agora = Date.parse("2026-10-21T15:00:00Z");
  const { cabecalho, linhas } = L.csvTarefas([{ titulo: "Ligar", tipo: "ligacao", vence_em: "2026-10-20T12:00:00Z", dono_id: "u2", contato: { nome: "Ana" } },
    { titulo: "Orçamento", tipo: "tarefa", vence_em: null, concluida_em: "2026-10-21T10:00:00Z", negocio: { titulo: "Revisão" } }], { nomeDono: () => "Bia", agora, prazo: () => "20/10/2026 09:00" });
  assert.deepEqual(cabecalho, ["Título", "Tipo", "Prazo", "Responsável", "Contato", "Negócio", "Situação"]);
  assert.deepEqual(linhas[0], ["Ligar", "Ligação", "20/10/2026 09:00", "Bia", "Ana", "", "Atrasada"], "RC-307");
  assert.deepEqual(linhas[1].slice(2), ["Sem prazo", "", "", "Revisão", "Concluída"]);
  assert.ok(L.gerarCSV(cabecalho, linhas).startsWith(BOM), "acentos certos no Excel");
  // RC-324: 60/90 dias sobrevivem à visão (antes só 3/7/15/30)
  const cod60 = L.filtroParaLink({ parado_dias: 60 });
  assert.deepEqual(L.filtroDoLink(cod60), { parado_dias: 60 });
  assert.deepEqual(L.filtroDoLink(L.filtroParaLink({ parado_dias: 45 })), null, "valor fora da lista continua fora");
  // RC-327: ida e volta, sem a busca digitada; texto estranho → null
  const cod = L.filtroParaLink({ dono: "eu", origem: ["whatsapp"], busca: "Ana Souza", valor_min: 1500 });
  assert.match(cod, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(L.filtroDoLink(cod), { dono: "eu", origem: ["whatsapp"], valor_min: 1500 });
  assert.equal(L.filtroParaLink({ busca: "Ana" }), "");
  assert.equal(L.filtroDoLink("%%%"), null); assert.equal(L.filtroDoLink("e30"), null);
  // RC-333: o pendente cujo cartão sumiu da recarga (outra pessoa excluiu) fica de fora — não recria o cartão
  const c2 = [{ estagio_id: "s1", total: 1, soma_previsto: 0, soma_valor: 0, itens: [{ id: 1, estagio_id: "s1", ordem: 10 }] }, { estagio_id: "s2", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }];
  const r = L.reaplicarPendentes(c2, [{ id: 1, estagioId: "s2", pos: 0, ordem: 5, patch: {} }, { id: 77, estagioId: "s2", pos: 0, ordem: 5, patch: {} }]);
  assert.deepEqual(r.sumidos, [77]);
  assert.deepEqual(r.colunas.find(c => c.estagio_id === "s2").itens.map(x => x.id), [1], "o que existe volta ao destino");
  assert.ok(!r.colunas.some(c => c.itens.some(x => x.id === 77)));
});

test("RC-323/324/327 · filtros do quadro: período invertido com erro no campo, 60/90 dias e link com os filtros", async () => {
  const D = domDeMentira();
  try {
    const copiados = [];
    const t = await montarKb(D, { dados: kbVazio(), uix: { copiar: async x => { copiados.push(x); } } });
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    let corpo = t.reg.flut.conteudo;
    const opP = corpo.querySelectorAll("select").find(s => s.attrs["aria-label"] === "Parados há").querySelectorAll("option").map(o => o.value);
    assert.ok(opP.includes("60") && opP.includes("90"), "RC-324");
    // plano 2000d: DR-003 — o botão fica sempre (o link sai do formulário no clique); sem filtro nenhum ele avisa em vez de copiar
    corpo.querySelector(".crm-filtros-link").clique(); assert.equal(copiados.length, 0, "sem filtro não copia");
    const de = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados de"), ate = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Criados até");
    de.value = "2026-10-10"; ate.value = "2026-10-01";
    const nAntes = t.chamadas("nx_negocios_kanban").length;
    botaoTxt(corpo, /^Aplicar/).clique(); await varias();
    const erro = corpo.querySelectorAll("small").find(x => /^crm-fd-/.test(x.attrs.id || ""));
    assert.ok(erro && erro.hidden === false && /data inicial/.test(erro.textContent), "RC-323: antes só um aviso passageiro");
    assert.equal(de.getAttribute("aria-invalid"), "true"); assert.equal(de.getAttribute("aria-describedby"), erro.attrs.id);
    assert.equal(t.chamadas("nx_negocios_kanban").length, nAntes, "nada aplicado");
    ate.value = "2026-10-31";
    const par = corpo.querySelectorAll("select").find(s => s.attrs["aria-label"] === "Parados há"); par.value = "90";
    botaoTxt(corpo, /^Aplicar/).clique(); await varias();
    assert.equal(de.getAttribute("aria-invalid"), null);
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.parado_dias, 90);
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    corpo = t.reg.flut.conteudo;
    corpo.querySelector(".crm-filtros-link").clique(); await varias();
    const url = copiados.at(-1);
    assert.match(url, /#\/crm\?funil=f1&f=[A-Za-z0-9_-]+$/, "RC-327");
    t.api.desmontar();
    // o link aberto em outra aba aplica os mesmos filtros
    D.storage.clear();
    const f = /f=([A-Za-z0-9_-]+)$/.exec(url)[1];
    const t2 = await montarKb(D, { dados: kbVazio(), rota: { query: { funil: "f1", f } } });
    const p2 = t2.chamadas("nx_negocios_kanban")[0].p.p_filtro;
    assert.equal(p2.parado_dias, 90); assert.equal(p2.criado_de, "2026-10-10"); assert.equal(p2.criado_ate, "2026-10-31");
    t2.api.desmontar();
    const t3 = await montarKb(D, { dados: kbVazio(), rota: { query: { parados: "60" } } });
    assert.equal(t3.chamadas("nx_negocios_kanban")[0].p.p_filtro.parado_dias, 60, "RC-324: ?parados=60 do link vale");
    t3.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-293/309/310/287 · quadro: o movimento fala uma vez, «(/)» na busca, período dos fechados no cabeçalho e centavos só quando há", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", [...cartoes(1, "s1", 1, { valor_previsto: 1500.5 }), ...cartoes(1, "s1", 2, { valor_previsto: 900 })]) }) });
    const busca = t.tela.querySelectorAll("input").find(x => x.attrs.type === "search");
    assert.match(busca.attrs.placeholder, /\(\/\)$/, "RC-309"); assert.equal(busca.attrs["aria-keyshortcuts"], "/");
    assert.equal(t.tela.querySelector('.kb-col[data-estagio="s5"] .kb-col-periodo').textContent, "últimos 30 dias", "RC-310");
    assert.ok(!t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-periodo'), "só nas colunas fechadas");
    assert.equal(t.cartao(1).querySelector(".kc-valor").textContent, "R$ 1500.50", "RC-287: antes «R$ 1501»");
    assert.equal(t.cartao(2).querySelector(".kc-valor").textContent, "R$ 900");
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight"); tecla(art, "Enter"); await varias();
    const falas = (t.reg.avisos || []).filter(a => /movida para Agendada/.test(a)).length + (t.reg.desfazer || []).filter(d => /movida para Agendada/.test(d.texto)).length;
    assert.equal(falas, 1, "RC-293: antes o leitor ouvia o movimento duas vezes");
    t.api.desmontar();
    const D2 = domDeMentira({ medias: { "(max-width: 760px)": true } });
    try {
      const t2 = await montarKb(D2, { dados: kbVazio() });
      assert.doesNotMatch(t2.tela.querySelectorAll("input").find(x => x.attrs.type === "search").attrs.placeholder, /\(\/\)/, "no celular não há tecla «/»");
      t2.api.desmontar();
    } finally { D2.desfazer(); }
  } finally { D.desfazer(); }
});

test("RC-330/294 · quadro: busca na folha «Mover para…» com mais de 8 etapas; «Previsão por mês» no resumo", async () => {
  const D = domDeMentira();
  try {
    const extras = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, nome: i === 3 ? "Orçamento enviado" : `Passo ${i}`, tipo: "aberto", probabilidade: 20, ordem: 10 + i }));
    const estagios = [ETAPAS_KB[0], ETAPAS_KB[1], ...extras, ETAPAS_KB[2], ETAPAS_KB[3]];
    const itens = [{ id: 1, titulo: "A", status: "aberto", estagio_id: "s1", ordem: 10, valor_previsto: 1000, previsao_fechamento: "2026-11-10" },
      { id: 2, titulo: "B", status: "aberto", estagio_id: "s1", ordem: 20, valor_previsto: 500, previsao_fechamento: "2026-12-01" }];
    const dados = { colunas: estagios.map(e => col(e.id, e.id === "s1" ? itens : [])) };
    let modalO = null;
    const t = await montarKb(D, { dados, base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios }] }, uix: { modal: async o => { modalO = o; return null; } } });
    const meses = t.tela.querySelector(".crm-fr-tab-meses");
    assert.ok(meses, "RC-294");
    assert.deepEqual(meses.querySelectorAll("tbody th").map(x => x.textContent), ["nov/2026", "dez/2026"]);
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    const busca = modalO.corpo.querySelector(".kb-mover-busca");
    assert.ok(busca, "RC-330: antes a lista rolava sem busca");
    busca.value = "orcamento"; busca.dispara("input");
    const vis = modalO.corpo.querySelectorAll("li").filter(li => li.dataset.etapa && !li.hidden).map(li => li.dataset.etapa);
    assert.deepEqual(vis, ["x3"], "sem acento também acha");
    assert.ok(modalO.corpo.querySelectorAll("li").some(li => !li.dataset.etapa && !li.hidden), "«Selecionar vários» continua");
    busca.value = "zzz"; busca.dispara("input");
    assert.equal(modalO.corpo.querySelector(".kb-mover-nada").hidden, false);
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: kbVazio(), uix: { modal: async o => { modalO = o; return null; } } });
    t2.cartao(1).querySelector(".kc-mover").clique(); await varias();
    assert.ok(!modalO.corpo.querySelector(".kb-mover-busca"), "funil curto: sem busca");
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("RC-265/268/281/282/283/286/287 · gaveta: offline guarda e repete, «R$» no campo, atalhos G/P, atalhos da previsão, previsão vencida, reabrir na etapa de antes", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const t = await montarGaveta(D, { negocio: { valor_previsto: 1200, previsao_fechamento: "2020-01-15" }, falhas: { nx_negocio_salvar: Object.assign(new Error("x"), { codigo: "sem_conexao" }) } });
    assert.equal(t.corpo().querySelector(".ng-valor b").textContent, "R$ 1200", "RC-287: antes «R$ 1200.00»");
    assert.ok(t.corpo().querySelector(".ng-prev-vencida"), "RC-283");
    const ddV = campoDe(t.corpo(), "Valor previsto").querySelector("dd");
    assert.ok(ddV.querySelector(".ng-moeda"), "RC-268"); assert.equal(ddV.querySelector("input").attrs.placeholder, "0,00");
    const ganhou = t.corpo().querySelector(".ng-ganhou");
    assert.equal(ganhou.attrs["aria-keyshortcuts"], "G"); assert.match(ganhou.attrs.title, /\(G\)$/);
    // RC-282: atalho da previsão grava pelo mesmo caminho (change)
    const atalho = t.corpo().querySelector(".ng-prev-atalhos button");
    const inPrev = campoDe(t.corpo(), "Previsão de fechamento").querySelector("input");
    const eventos = []; inPrev.dispatchEvent = ev => { eventos.push(ev.type); inPrev.dispara(ev.type); };
    atalho.clique();
    assert.equal(inPrev.value, atalho.dataset.valor); assert.deepEqual(eventos, ["change"]);
    // RC-265: sem rede o valor fica e a gravação volta sozinha no «online»
    const inp = ddV.querySelector("input");
    inp.value = "2.000,00"; inp.dispara("blur"); await varias();
    assert.match(campoDe(t.corpo(), "Valor previsto").textContent, /Não salvo — tentaremos quando a conexão voltar\./, "antes: só a mensagem de erro, sem repetir");
    assert.equal(inp.value, "2.000,00");
    const nSal = t.cham("nx_negocio_salvar").length;
    D.janela("online"); await varias();
    assert.equal(t.cham("nx_negocio_salvar").length, nSal + 1, "regravou sozinho");
    // RC-281: G com a gaveta em foco = ganhar
    t.corpo().dispara("keydown", { key: "g", target: t.corpo() }); await varias();
    assert.equal(t.desfazer().length, 1, "G moveu para «Fechou»");
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); D.desfazer(); }
  const D2 = domDeMentira();
  try {
    const t = await montarGaveta(D2, { negocio: { status: "ganho", estagio_id: "s5", valor: 900 },
      ver: { tempo: [{ tipo: "estagio", em: iso(-3), dados: { de: "s1", para: "s2" } }, { tipo: "estagio", em: iso(-1), dados: { de: "s2", para: "s5" } }] } });
    const re = t.corpo().querySelector(".ng-reabrir");
    assert.equal(re.attrs.title, "Volta para «Agendada»", "RC-286");
    re.clique(); await varias();
    assert.equal(t.desfazer().at(-1).texto, "«Ana Souza» reaberta em «Agendada»", "antes: sempre na 1ª etapa (Nova)");
  } finally { D2.desfazer(); }
});

test("RC-305/332 · importação: «Mostrar só as reconhecidas» com planilha larga; sem internet pausa e continua sozinha", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const cab = ["Nome", "Telefone", "Coluna A", "Coluna B", "Coluna C", "Coluna D", "Coluna E", "Coluna F", "Coluna G", "Coluna H"];
    const csv = `${cab.join("\t")}\nAna\t12998303030\t1\t2\t3\t4\t5\t6\t7\t8\nBia\t12998303031\t1\t2\t3\t4\t5\t6\t7\t8\n`;
    const t = await montarImp(D, { rpc: async nome => (nome === "nx_contatos_importar" ? { criados: 2, atualizados: 0, ignorados: 0, erros: [], importacao_id: "imp-1" } : {}) });
    t.tela.querySelector("textarea").value = csv; t.botao("Usar o texto colado").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    const bt = t.tela.querySelector(".imp-so-mapeadas");
    assert.ok(bt, "RC-305: antes era revisar coluna por coluna");
    assert.equal(bt.getAttribute("aria-pressed"), "false");
    bt.clique();
    const linhas = t.tela.querySelectorAll(".imp-mapa-l");
    assert.equal(linhas.filter(l => l.hidden).length, 8, "as 8 não reconhecidas ficam escondidas");
    assert.equal(bt.getAttribute("aria-pressed"), "true");
    bt.clique();
    assert.equal(linhas.filter(l => l.hidden).length, 0);
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    // RC-332: sem internet a importação pausa (não termina com erro)
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    t.tela.querySelectorAll("button").find(b => /^Importar/.test(b.textContent.trim())).clique(); await varias();
    assert.equal(t.reg.chamadas.filter(c => c.nome === "nx_contatos_importar").length, 0);
    assert.match(t.tela.querySelector(".imp-prog-txt").textContent, /Sem internet/);
    globalThis.navigator.onLine = true; D.janela("online"); await varias(10);
    assert.equal(t.reg.chamadas.filter(c => c.nome === "nx_contatos_importar").length, 1, "continuou sozinha");
    assert.equal(t.tela.querySelector("h2").textContent, "Importação concluída");
    assert.equal((D.daJanela.online || []).length, 0, "o ouvinte sai no fim");
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); D.desfazer(); }
});

test("RC-307/344 · tarefas: «Baixar CSV» da lista atual e «+ Próxima tarefa» já ligada ao contato", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    const itens = [{ id: 1, titulo: "Ligar para Ana", tipo: "tarefa", vence_em: new Date(Date.now() + 86400000).toISOString(), contato: { id: 501, nome: "Ana" } }];
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, usuario: () => null, ctx: { titulo() {}, navegar() {}, cliente: { id: "cli-t" } },
      api: { rpcC: async () => ({ itens, tem_mais: false, contagens: { hoje: 0, atrasadas: 0, proximas: 1 } }) } };
    const T = await import("../web/app/crm-tarefas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "proximas" } });
    await varias();
    const bt = tela.querySelector(".tfp-csv");
    assert.ok(bt && !bt.disabled, "RC-307");
    bt.clique(); await varias();
    assert.equal(U.criados.length, 1);
    const txt = await U.criados[0].text();
    assert.deepEqual([...new Uint8Array(await U.criados[0].arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM: acentos certos no Excel"); assert.match(txt, /Título;Tipo;Prazo;Responsável;Contato;Oportunidade;Situação/); assert.match(txt, /Ligar para Ana;.*;Ana;;Aberta/);
    api.desmontar();
    // RC-344
    const r2 = {};
    const kt = kTarefas(D, { reg: r2, rpc: async (nome, p) => ({ id: p.p_id, concluida_em: "2026-10-21T12:00:00Z" }) });
    let salvo = null;
    kt.escrever = async (nome, p) => { salvo = p.p_tarefa; return { resultado: { id: 99, ...p.p_tarefa } }; };
    kt.ui.lerForm = () => ({ titulo: "Mandar orçamento", tipo: "tarefa" });
    kt.ui.modal = async o => { const ac = o.acoes.find(a => a.fn); return ac.fn({ erro() {} }); };
    const li = T.itemTarefa(kt, { id: 41, titulo: "Ligar", tipo: "tarefa", vence_em: iso(1), concluida_em: null, contato: { id: 501, nome: "Ana" }, negocio: { id: 801, titulo: "Revisão" } }, { aoMudar() {} });
    const check = li.querySelector(".tf-check input");
    check.checked = true; check.dispara("change"); await varias(8);
    const av = (r2.desfazer || []).at(-1);
    assert.ok(av && av.acao && av.acao.rotulo === "+ Próxima tarefa", "antes: o aviso só tinha «Desfazer»");
    await av.acao.fn();
    assert.equal(salvo.contato_id, 501); assert.equal(salvo.negocio_id, 801);
    const li2 = T.itemTarefa(kt, { id: 42, titulo: "Avulsa", tipo: "tarefa", vence_em: null, concluida_em: null }, {});
    const c2 = li2.querySelector(".tf-check input"); c2.checked = true; c2.dispara("change"); await varias(8);
    assert.equal(r2.desfazer.at(-1).acao, null, "sem vínculo não oferece (seria uma tarefa solta)");
  } finally { U.desfazer(); D.desfazer(); }
});

test("RC-292/316/317/318/329/334 · configuração: confirma o padrão, nome vazio marcado ao sair, limite de 25, desfazer na posição, busca sem redesenhar", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    const confirmacoes = [];
    // RC-292: «Tornar padrão» pergunta antes — recusar não grava
    const { h } = D;
    const ui = uiDeMentira(h, {});
    let menu = null; ui.menu = (anc, itens) => { menu = itens; return { fechar() {} }; };
    ui.confirmar = async o => { confirmacoes.push(o.titulo); return false; };
    const base = { funis: [{ id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [{ id: "a1", nome: "Novo", tipo: "aberto" }] },
      { id: "f2", nome: "Implantes", ordem: 2, ativo: true, conta_no_ads: true, estagios: [{ id: "b1", nome: "Novo", tipo: "aberto" }] }] };
    const cham = [];
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base, api: { rpcC: async (n, p) => { cham.push(n); return n === "nx_negocios_kanban" ? { colunas: [] } : {}; } } };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar({ ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] }, alvo); await varias();
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Implantes").clique();
    await menu.find(i => i && i.rotulo === "Tornar padrão").fn(); await varias();
    assert.deepEqual(confirmacoes, ["Tornar «Implantes» o funil padrão?"], "RC-292");
    assert.ok(!cham.includes("nx_funil_salvar"), "recusou: nada gravado");
    // editor de funil novo
    t.alvo.querySelectorAll("button").find(b => b.textContent === "Novo funil").clique(); await varias();      // plano 2000d: DR-208 — o botão de criar tem verbo
    const cont = t.alvo.querySelector(".fe-cont");
    const nIni = t.alvo.querySelectorAll(".fe-etapa").length;
    assert.equal(cont.textContent, `${nIni} de 25`, "RC-317");
    const btEtapa = t.alvo.querySelectorAll("button").find(b => b.textContent === "Nova etapa");      // plano 2000d: DR-208 — o botão de criar tem verbo
    // RC-316: nova etapa sem nome, sair do campo → marcado
    btEtapa.clique(); await varias();
    const vazio = t.alvo.querySelectorAll(".fe-nome").find(x => !x.value);
    vazio.dispara("blur");
    assert.equal(vazio.getAttribute("aria-invalid"), "true", "RC-316: antes só no «Salvar»");
    for (let i = 0; i < 30 && !btEtapa.disabled; i++) { btEtapa.clique(); await tique(); }
    assert.equal(t.alvo.querySelectorAll(".fe-etapa").length, 25);
    assert.equal(btEtapa.disabled, true); assert.equal(t.alvo.querySelector(".fe-limite").hidden, false);
    // RC-318: remove a 3ª, sobe a 1ª para baixo (índices mudam) e o «Desfazer» devolve logo depois da vizinha de cima
    const nomes = () => t.alvo.querySelectorAll(".fe-etapa").map(l => l.dataset.k);
    const antes = nomes();
    const alvoK = antes[2], vizinhaK = antes[1];
    t.alvo.querySelector(`.fe-etapa[data-k="${alvoK}"] .fe-rem`).clique(); await varias();
    tecla(t.alvo.querySelector(`.fe-etapa[data-k="${antes[0]}"] .fe-alca`), "ArrowDown"); await varias();
    t.alvo.querySelectorAll("button").find(b => b.textContent === "Desfazer").clique(); await varias();
    const depois = nomes();
    assert.equal(depois[depois.indexOf(vizinhaK) + 1], alvoK, "antes: voltava no índice antigo (depois da etapa errada)");
    // RC-329: a busca de etiquetas não recria os itens
    const ui2 = uiDeMentira(h, {});
    const base2 = { funis: [], etiquetas: [{ id: 1, nome: "Urgente" }, { id: 2, nome: "Retorno" }], motivos: [], campos: [] };
    const k2 = { ui: ui2, h, L, base: base2, v: V, cor: () => null, erro: e => String(e), pode: () => true, recarregarBase: async () => base2, api: { rpcC: async () => ({}) } };
    const aE = h0(D, "div");
    await secoesConfig.find(s => s.id === "etiquetas").montar({ ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k2 }), paleta: [] }, aE);
    const itensAntes = aE.querySelectorAll(".crm-cfg-item");
    const busca = aE.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Buscar etiqueta");
    busca.value = "ret"; busca.dispara("input");
    const itensDepois = aE.querySelectorAll(".crm-cfg-item");
    assert.ok(itensAntes.every((x, i) => x === itensDepois[i]), "RC-329: os mesmos elementos");
    assert.deepEqual(itensDepois.map(x => x.hidden), [true, false]);
    // RC-334: o laço da exclusão usa a função testada acima
    assert.match(ler("crm-config.js"), /L\.repetirAteTerminar\(/);
  } finally { D.desfazer(); }
});

test("RC-311/312/315/331 · empresa e ficha: valor em aberto, observação neutra, quem bloqueou e ação principal sem Conversas", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana", telefone: "5512998303030", bloqueado: true, bloqueado_por_nome: "Bia", bloqueado_em: "2026-10-10T12:00:00Z" }, rfm: {}, tarefas: [], notas: [], tempo: [], negocios: [], conversas: [] }
      : nome === "nx_empresa_ver" ? { empresa: { id: 7, nome: "Frota X", obs: "Paga só por boleto." }, contatos: [], negocios: [] } : undefined) });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    const el = h0(D, "div", { class: "crm", dataset: { tela: "ficha" } });
    await t.M.montarFicha(t.k, el, 501, {});
    assert.match(el.querySelector(".fx-bloqueado").textContent, /^Bloqueada por Bia em 04\/10:/, "RC-315: quem e quando");
    assert.ok(el.querySelector(".fx-acoes .fx-ac-principal"), "RC-331: sem Conversas, «Nova oportunidade» é a principal");
    const emp = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, emp, 7, {});
    const obs = emp.querySelector(".emp-obs");
    assert.ok(obs && /Paga só por boleto/.test(obs.textContent), "RC-312");
    assert.ok(!emp.querySelectorAll(".aviso").some(a => /boleto/.test(a.textContent)), "antes: aviso amarelo");
    const c1 = t.M.cartaoEmpresa(t.k, { id: 7, nome: "Frota X", contatos: 2, negocios_abertos: 1, valor_aberto: 4500 });
    assert.equal(c1.querySelector(".emp-valor b").textContent, "R$ 4500", "RC-311");
    assert.ok(!t.M.cartaoEmpresa(t.k, { id: 8, nome: "Y" }).querySelector(".emp-valor"), "sem o dado, nada muda");
  } finally { D.desfazer(); }
});
/* ============================================================ plano 1500c · complemento (RX-*) */
test("UC-028 · #/crm?importar=1 abre a importação, não o quadro", () => {
  const src = ler("crm.js");
  assert.match(src, /modulo === "crm" && r\.query && String\(r\.query\.importar\) === "1"[^\n]*tipo = "importar"/);
});

test("RX-003/004 · previsão vencida sem o dia de hoje e «(1 ano)»", () => {
  assert.equal(L.previsaoVencida("2000-01-01"), true, "RX-003: antes lançava «fmtDiaSP is not a function»");
  assert.equal(L.previsaoVencida("2999-01-01"), false);
  const hoje = new Date(Date.now()).toISOString().slice(0, 10);
  const [a, m, d] = hoje.split("-").map(Number);
  const amanha = new Date(Date.UTC(a - 1, m - 1, d + 1)).toISOString().slice(0, 10);
  assert.match(L.aniversario(amanha, hoje).texto, /\(1 ano\)$/);
  const em3 = new Date(Date.UTC(a - 1, m - 1, d + 3)).toISOString().slice(0, 10);
  assert.match(L.aniversario(em3, hoje).texto, /em 3 dias \(1 ano\)$/);
});

test("RX-005/006 · nota: CPF e data com hora não viram telefone; o «(» do DDD entra no link", () => {
  const p = L.partesNota("CPF 123.456.789-09, retorno 2026-10-21 14:30, ligar (12) 99830-3030");
  const tels = p.filter(x => x.tipo === "tel");
  assert.equal(tels.length, 1);
  assert.equal(tels[0].texto, "(12) 99830-3030");
  assert.equal(tels[0].href, "tel:+5512998303030");
  assert.equal(p.map(x => x.texto).join(""), "CPF 123.456.789-09, retorno 2026-10-21 14:30, ligar (12) 99830-3030");
  assert.equal(L.partesNota("+1 212 555 1234").filter(x => x.tipo === "tel").length, 1, "com «+» vale número de fora");
});

test("RX-007 · e-mail da planilha: «Nome <email>», mailto: e ponto final", () => {
  assert.deepEqual(L.emailDaCelula("Ana Souza <Ana@X.com>; bia@y.com"), { email: "ana@x.com", extras: ["bia@y.com"] });
  assert.equal(L.emailDaCelula("mailto:ana@x.com").email, "ana@x.com");
  assert.equal(L.emailDaCelula("ana@x.com.").email, "ana@x.com");
});

test("RX-008 · data da planilha com hora e AAAA/MM/DD", () => {
  assert.equal(L.lerData("21/10/2026 14:30"), "2026-10-21");
  assert.equal(L.lerData("21/10/2026 14:30:05"), "2026-10-21");
  assert.equal(L.lerData("2026/10/21"), "2026-10-21");
  assert.equal(L.lerData("1990-12-31abc"), null, "RC-004 continua");
  assert.equal(L.lerData("2026/13/01"), null);
});

test("RX-009/010 · arredondamento antes da unidade", () => {
  assert.equal(L.estimativaRestante(59.6 * 60000, 1, 1), "cerca de 1 h");
  assert.equal(L.estimativaRestante(119.7 * 60000, 1, 1), "cerca de 2 h");
  const agora = Date.now();
  assert.equal(L.textoFaltaPrazo(new Date(agora - 0.4 * 3600000).toISOString(), 24, agora), "falta 1 dia para o prazo");
  assert.equal(L.textoFaltaPrazo(new Date(agora).toISOString(), 5, agora), "faltam 5 h para o prazo");
});

test("RX-011/012 · cortes não partem o emoji ao meio", () => {
  const e = "😀".repeat(40);
  for (const t of [L.resumoTexto(e, 10), L.cortarNaPalavra(e, 10)]) {
    assert.ok(!/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), "sem metade de par");
    assert.equal(Array.from(t).length, 10);
  }
});

test("RX-013/014/015 · planilha: «e» entre telefones, separador «|», menos tipográfico", () => {
  const t = L.telefoneDaCelula("12 99830-3030 e 12 98888-1111");
  assert.equal(t.telefone, "12 99830-3030");
  assert.deepEqual(t.extras, ["12 98888-1111"]);
  assert.equal(L.detectarSeparador("nome|telefone\nAna|12998303030\n"), "|");
  assert.deepEqual(L.lerCSV("nome|telefone\nAna|12998303030\n").cabecalho, ["nome", "telefone"]);
  assert.equal(L.detectarSeparador("a;b\n1;2"), ";");
  assert.match(ler("crm-importar.js"), /\["\|", "Barra vertical \(\|\)"\]/);
  assert.equal(L.lerNumero("−150"), -150);
  assert.equal(L.lerNumero("–1.500,00"), -1500);
});

test("RX-016/017/018/019 · porcentagem, sim/não, UF e origem da planilha", () => {
  assert.equal(L.pctInteiro(0.996), "99%");
  assert.equal(L.pctInteiro(1), "100%");
  assert.equal(L.lerSimNao("Yes"), true);
  assert.equal(L.lerSimNao("X"), true);
  assert.equal(L.lerSimNao("No"), false);
  assert.equal(L.ufDaPlanilha("Estado de SP"), "SP");
  assert.equal(L.ufDaPlanilha("São Paulo (SP)"), "SP");
  assert.equal(L.ufDaPlanilha("RJ - Rio de Janeiro"), "RJ");
  assert.equal(L.ufDaPlanilha("Rua X"), "Rua X");
  assert.equal(L.origemDaPlanilha("Indicação da Maria"), "indicacao");
  assert.equal(L.origemDaPlanilha("WhatsApp (loja)"), "whatsapp");
  assert.equal(L.origemDaPlanilha("Instagram"), "Instagram", "CR-129 continua");
});

test("RX-020/021 · atalhos sem repetir o dia", () => {
  assert.ok(!L.atalhosPrevisao("2026-10-31").some(x => x.id === "fim_mes"), "RX-020: último dia do mês");
  assert.ok(L.atalhosPrevisao("2026-10-20").some(x => x.id === "fim_mes"));
  for (const dia of ["2026-10-24", "2026-10-25", "2026-10-21", "2026-10-22"]) {      // sábado, domingo, quarta, quinta
    const v = L.atalhosPrazoUnicos(dia).map(x => x.valor);
    assert.equal(new Set(v).size, v.length, `RX-021: sem dois botões iguais (${dia})`);
    assert.ok(new Set(L.atalhosPrazo(dia).map(x => x.valor)).size < L.atalhosPrazo(dia).length, "a lista completa repete (e o «Adiar» por id segue igual)");
  }
  assert.match(ler("crm-tarefas.js"), /L.atalhosPrazoUnicos/);
});

test("RX-022/023 · chips: muitas etiquetas e valores no formato brasileiro", () => {
  assert.equal(L.textoChipEtiquetas("alguma", ["A", "B", "C", "D", "E"]), "Tem alguma de: A, B, C e mais 2");
  assert.equal(L.textoChipEtiquetas("todas", ["A", "B"]), "Tem todas: A, B");
  const campos = [{ chave: "retorno", rotulo: "Retorno", tipo: "data" }, { chave: "orc", rotulo: "Orçamento", tipo: "moeda" }];
  assert.equal(L.textoFiltroCampo({ chave: "retorno", op: "maior", valor: "2026-11-05" }, campos), "Retorno maior que 05/11/2026");
  assert.equal(L.textoFiltroCampo({ chave: "orc", op: "menor", valor: "1500" }, campos), "Orçamento menor que R$ 1.500,00");
});

test("RX-024/025 · filtro local: ids como texto e a régua do valor do cartão", () => {
  const cards = [{ id: 1, dono_id: 7, etiquetas: [3], valor_previsto: 100, status: "aberto" },
    { id: 2, dono_id: 8, etiquetas: [], valor_previsto: 100, valor: 5000, status: "aberto" },
    { id: 3, dono_id: 8, etiquetas: [], valor_previsto: 100, valor: 5000, status: "ganho" }];
  const ids = f => L.filtrar(cards, f).map(c => c.id);
  assert.deepEqual(ids({ dono: "7" }), [1]);
  assert.deepEqual(ids({ etiquetas: { op: "alguma", ids: ["3"] } }), [1]);
  assert.deepEqual(ids({ valor_min: 1000 }), [3], "aberto vale o previsto (o cartão mostra R$ 100)");
});

test("RX-026 · nome da planilha numa linha só e no limite da ficha", () => {
  const campos = [];
  const [o] = L.montarLinhas([["  Ana \n  Souza  "]], ["nome"], campos);
  assert.equal(o.nome, "Ana Souza");
  const [g] = L.montarLinhas([["x".repeat(300)]], ["nome"], campos);
  assert.equal(g.nome.length, 160);
  assert.ok(L.checarLinha(g).some(e => /Nome cortado/.test(e)));
});

test("RX-027/028 · UC-030 · cartão: rótulo do responsável, «1 não lida» e dados pessoais marcados", async () => {
  const D = domDeMentira();
  try {
    const dados = quadroDe({ s1: col("s1", [{ id: 1, titulo: "Implante", status: "aberto", estagio_id: "s1", ordem: 10, nao_lidas: 1, dono_id: "u2", contato: { id: 7, nome: "Ana Souza", telefone: "5512998303030" } }]) });
    const t = await montarKb(D, { dados, usuario: id => (id === "u2" ? { id: "u2", nome: "Bia" } : null) });
    const c1 = t.cartao(1);
    assert.equal(c1.querySelector(".kc-dono").getAttribute("aria-label"), "Ver só os cartões de Bia", "RX-027");
    assert.equal(c1.querySelector(".kc-naolidas").getAttribute("title"), "1 não lida", "RX-028");
    assert.ok(c1.querySelector(".kc-t").classList.contains("dado-pessoal"), "UC-030");
    const s = c1.querySelector(".kc-s");
    if (s) assert.ok(s.classList.contains("dado-pessoal"));
  } finally { D.desfazer(); }
});

test("RX-029 · UC-030 · gaveta: o telefone do contato liga e nome/telefone são dado pessoal", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    await imediato(); await imediato();
    const bloco = t.corpo().querySelector(".ng-contato");
    assert.ok(bloco.querySelector("b").classList.contains("dado-pessoal"));
    const a = bloco.querySelector(".ng-tel");
    assert.equal(a.getAttribute("href"), "tel:+5512998303030");
    assert.ok(a.parentElement.classList.contains("dado-pessoal"));
  } finally { D.desfazer(); }
});

test("UC-030 · listas e tarefas marcam nome, telefone e e-mail como dado pessoal", () => {
  const listas = ler("crm-listas.js"), tarefas = ler("crm-tarefas.js");
  assert.match(listas, /h\("b", \{ class: "dado-pessoal" \}, L\.nomeContato\(c\)\)/);
  assert.match(listas, /class: "mono dado-pessoal" \}, ui\.telBR\(c\.telefone\)/);
  assert.match(listas, /chave: "email", rotulo: "E-mail", render: c => c\.email \? h\("span", \{ class: "dado-pessoal" \}/);
  assert.match(listas, /class: "fx-nome dado-pessoal"/);
  assert.match(listas, /class: "ct-nome dado-pessoal"/);
  assert.match(tarefas, /h\("span", \{ class: "dado-pessoal" \}, t\.contato\.nome/);
});

test("RX-031/032 · editar tarefa sem prazo não inventa amanhã; o responsável vem do dono_id", async () => {
  const D = domDeMentira();
  try {
    let corpo = null, donoValor;
    const k = kTarefas(D, { uix: { modal: async o => { corpo = o.corpo; return null; },
      seletorPessoa: o => { donoValor = o.valor; return D.h("select"); },
      campo: o => D.h("label", { class: "campo" }, o.rotulo || "", D.h(o.tipo === "select" ? "select" : "input", { name: o.nome, value: o.valor ?? "" })) } });
    const { formTarefa } = await import("../web/app/crm-tarefas.js");
    await formTarefa(k, { id: 9, titulo: "Ligar", tipo: "ligacao", vence_em: null, dono_id: "u7" }, {});
    assert.equal(corpo.querySelector("[name=vence_em]").value, "", "RX-031: antes vinha «amanhã 9h»");
    assert.equal(donoValor, "u7", "RX-032");
    await formTarefa(k, null, {});
    assert.match(corpo.querySelector("[name=vence_em]").value, /T09:00$/, "tarefa nova continua com amanhã 9h");
  } finally { D.desfazer(); }
});

test("RX-030 · todas as buscas do CRM com enterkeyhint=search", () => {
  for (const f of ["crm-kanban.js", "crm-listas.js", "crm-negocio.js", "crm-tarefas.js", "crm-config.js", "crm-visoes.js"]) {
    const src = ler(f);
    const buscas = src.match(/h\("input", \{ type: "search",[^\n]*/g) || [];
    assert.ok(buscas.length, f);
    for (const b of buscas) assert.match(b, /enterkeyhint: "search"/, `${f}: ${b.slice(0, 60)}`);
  }
});

test("RX-033/034 · gaveta: responsável desativado aparece e os outros negócios com centavos só quando há", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { dono_id: "u9", dono_nome: "Caio" },
      ver: { outros: [{ id: 2, titulo: "Clareamento", status: "aberto", estagio_id: "s1", valor_previsto: 1500 }, { id: 3, titulo: "Limpeza", status: "aberto", estagio_id: "s1", valor_previsto: 99.5 }] } });
    await imediato(); await imediato();
    const sel = t.corpo().querySelectorAll(".ng-kv select").find(s => s.querySelectorAll("option").some(o => /Sem responsável/.test(o.textContent)));
    assert.ok(sel.querySelectorAll("option").some(o => o.textContent === "Caio (desativado)"), "RX-033");
    const minis = t.corpo().querySelectorAll(".ng-mini b").map(b => b.textContent);
    if (minis.length) {
      assert.ok(minis.every(x => !/,00$/.test(x)), `RX-034: ${minis.join(" | ")}`);
    }
    assert.match(ler("crm-negocio.js"), /ui\.brl\(L\.valorCard\(o\), \{ centavos: L\.temCentavos\(L\.valorCard\(o\)\) \}\)/);
  } finally { D.desfazer(); }
});

test("RX-035/036/038 · ficha: telefone recusado na hora, negócios na régua do cartão e o «+N» das etiquetas diz quais", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana", telefone: "5512998303030" }, rfm: {}, tarefas: [], notas: [], tempo: [], conversas: [],
      negocios: [{ id: 1, titulo: "Implante", status: "ganho", valor: null, valor_previsto: 1200 }, { id: 2, titulo: "Limpeza", status: "aberto", valor_previsto: null }] } : undefined) });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    const minis = el.querySelectorAll(".ng-outros .ng-mini");
    // plano 2000d: DR-168 — abertos primeiro na ficha (a «Limpeza» aberta vem antes do ganho)
    assert.equal(minis[1].querySelector("b").textContent, "R$ 1200", "RX-036: ganho sem valor final usa o previsto (antes «—»)");
    assert.equal(minis[0].querySelector(".sem").textContent, "Sem valor");
    const src = ler("crm-listas.js");
    assert.ok(src.includes("!L.normalizarTelefone(x.value) ? L.textoTelefoneInvalido(x.value) : null"), "RX-035");
    assert.ok(src.includes("class: \"kc-mais-etq\", title: e.slice(3)"), "RX-038");
  } finally { D.desfazer(); }
});

test("RX-037/039 · empresas: sem total não escreve «NaN»; telefone ruim da empresa barrado antes do servidor", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Frota X" }, { id: 2, nome: "Frota Y" }], tem_mais: true } });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresas(t.k, el, { query: {} });
    await imediato();
    const txt = el.textContent;
    assert.doesNotMatch(txt, /NaN/);
    assert.match(txt, /2\+ empresas/);
    assert.ok(ler("crm-listas.js").includes("!L.normalizarTelefone(dados.telefone)) { ui.marcarErro(form, \"telefone\", L.textoTelefoneInvalido(dados.telefone))"), "RX-039");
  } finally { D.desfazer(); }
});

test("RX-042/043/044 · seleção: tirar etiqueta, busca na lista longa e quem ficou de fora", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const etqs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nome: i === 2 ? "Urgência" : `E${i + 1}` }));
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1", 1, { etiquetas: [3, 4] })) }), uix: { modal: modalFila(respostas) },
      base: { etiquetas: etqs, usuarios: [] }, etiqueta: id => etqs.find(e => e.id === id) || null });
    for (const id of [1, 2]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    let corpoEtq = null;
    respostas.push((o, api) => { corpoEtq = o.corpo; api.fechar(null); });
    t.tela.querySelector(".crm-sel-etq").clique(); await varias(6);
    const campo = corpoEtq.querySelector(".kb-mover-busca");
    assert.ok(campo, "RX-044: mais de 8 etiquetas → busca");
    campo.value = "urgencia"; campo.dispara("input");
    assert.deepEqual(corpoEtq.querySelectorAll("li").filter(li => !li.hidden).map(li => li.textContent), ["Urgência"]);
    let opcoesTirar = null;
    respostas.push((o, api) => { opcoesTirar = o.corpo.querySelectorAll(".kb-mover-nome").map(x => x.textContent); api.fechar(3); });
    t.tela.querySelector(".crm-sel-tirar-etq").clique(); await varias(10);
    assert.deepEqual(opcoesTirar, ["Urgência", "E4"], "RX-043: só as etiquetas que os selecionados têm");
    assert.deepEqual(t.chamadas("nx_negocio_salvar").map(c => c.p.p_negocio), [{ id: 1, etiquetas: [4] }, { id: 2, etiquetas: [4] }]);
    assert.match(t.reg.desfazer.at(-1).texto, /Etiqueta «Urgência» tirada de 2 cartões/);      // plano 2000d: DR-013 — com «Desfazer»
    assert.match(ler("crm-kanban.js"), /ficaram"\} de fora \(ainda salvando\)/, "RX-042");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RX-040/041 · tela cheia: Esc sai sem a API do navegador e sair do quadro solta a tela cheia", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const bt = t.tela.querySelector(".crm-apresentar");
    bt.clique();
    assert.ok(t.tela.classList.contains("kb-apresentacao"));
    D.documento("keydown", { key: "Escape", target: D.doc.body });
    assert.ok(!t.tela.classList.contains("kb-apresentacao"), "RX-041: antes ficava preso (sem fullscreenchange)");
    assert.equal(bt.getAttribute("aria-pressed"), "false");
    let saiu = 0;
    bt.clique();
    D.doc.fullscreenElement = t.tela; D.doc.exitFullscreen = () => { saiu++; return Promise.resolve(); };
    t.api.desmontar();
    assert.equal(saiu, 1, "RX-040");
  } finally { D.desfazer(); }
});

test("RX-045/046/047/048 · filtros do quadro: Enter aplica, valor volta formatado, tirar chip devolve o foco", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1")) }) });
    const btF = t.tela.querySelector(".crm-filtro-bt");
    btF.clique();
    let corpo = t.reg.flut.conteudo;
    const vMin = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Valor mínimo");
    vMin.value = "1.500";
    vMin.dispara("keydown", { key: "Enter" });
    await varias(6);
    assert.equal(t.reg.flut.api.fechado, true, "RX-047: Enter aplicou e fechou");
    const chip = t.tela.querySelector(".crm-chip");
    assert.ok(chip && /1500|1\.500/.test(chip.textContent));
    btF.clique();
    corpo = t.reg.flut.conteudo;
    const vMin2 = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Valor mínimo");
    assert.equal(vMin2.value, "1.500", "RX-048");
    t.reg.flut.api.fechar();
    await varias(4);
    const avisos0 = (t.reg.avisos || []).length;
    t.tela.querySelector(".crm-chip button").clique();
    await varias(8);
    assert.equal(D.ativo(), btF, "RX-045: sem chips, o foco vai para «Filtros»");
    assert.ok((t.reg.avisos || []).slice(avisos0).some(a => /Filtro tirado/.test(a)));
    assert.match(ler("crm-kanban.js"), /ui\.anunciar\("Filtros limpos\."\)/, "RX-046");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("UC-028 · crm.js monta a importação em #/crm?importar=1 (o link do Início e da ajuda)", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: { importar: "1" } }, cli: "c-uc028",
      rpc: n => (n === "nx_crm_base" ? { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }], usuarios: [], etiquetas: [], motivos: [], campos: [], ticket: {} } : {}) });
    ctx.ui.corOk = c => c || null;
    await CRM.montar(ctx);
    const tela = ctx.alvo.querySelector(".crm");
    assert.equal(tela && tela.dataset.tela, "importar", "antes: abria o quadro");
    CRM.desmontar();
  } finally { D.desfazer(); }
});

test("RX-049/050/051 · importação: colado com «|», arquivo vazio e «1 linha encontrada»", async () => {
  assert.equal(L.contagemColado("nome|tel\nAna|12998303030\n"), "1 linha · 2 colunas");
  assert.equal(L.contagemColado("nome,\"obs; x\",tel\nAna,a,1\n"), "1 linha · 3 colunas", "o «;» dentro das aspas não conta");
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    const entrada = t.tela.querySelector('input[type="file"]');
    entrada.files = [{ name: "vazio.csv", size: 0, type: "text/csv", arrayBuffer: async () => new ArrayBuffer(0) }];
    entrada.dispara("change"); await varias(4);
    assert.match(t.reg.toasts.at(-1), /«vazio\.csv» está vazio/, "RX-050");
    const bytes = new TextEncoder().encode("Nome;Telefone\nAna;(12) 99830-3030\n");
    entrada.files = [{ name: "base.csv", size: bytes.length, type: "text/csv", slice: () => ({ arrayBuffer: async () => bytes.slice(0, 2).buffer }), arrayBuffer: async () => bytes.buffer }];
    entrada.dispara("change"); await varias(4); await esperar(160);
    assert.ok((t.reg.avisos || []).includes("1 linha encontrada."), "RX-051");
  } finally { D.desfazer(); }
});

test("RX-052/053/054 · filtros salvos: seletor some sem filtros, limite pela constante e opção removida não muda o filtro", async () => {
  const D = domDeMentira();
  try {
    const ui = uiDeMentira(D.h, {});
    const k = { ui, h: D.h, L, ctx: { cliente: { id: "cli-v" } }, eu: () => "u1", base: { campos: [{ chave: "conv", rotulo: "Convênio", tipo: "opcao", entidade: "contato", opcoes: ["Unimed", "Amil"] }] } };
    const c = VisReal.controlesVisoes(k, { tipo: "contatos", obterDados: () => ({ filtro: {}, ordem: "nome" }), aplicar: async () => {} });
    assert.equal(c.el.querySelector(".crm-visoes-select").hidden, true, "RX-053");
    D.storage.set(L.chaveVisoesCRM("cli-v", "u1", "contatos"), JSON.stringify([{ id: "v1", nome: "Só Amil", dados: { filtro: { origem: ["manual"] }, ordem: "nome" } }]));
    const c2 = VisReal.controlesVisoes(k, { tipo: "contatos", obterDados: () => ({ filtro: {}, ordem: "nome" }), aplicar: async () => {} });
    assert.equal(c2.el.querySelector(".crm-visoes-select").hidden, false);
    // RX-054 (o select do DOM de mentira não deriva o value da opção marcada): confere a montagem da opção extra no código
    assert.ok(ler("crm-visoes.js").includes("v0 && !(c.opcoes || []).includes(v0) ? [h(\"option\", { value: v0, selected: true }, `${v0} (não existe mais)`)] : []"), "RX-054");
    assert.ok(ler("crm-visoes.js").includes("${L.LIMITE_VISOES_CRM || 12} filtros salvos"), "RX-052");
  } finally { D.desfazer(); }
});

test("RX-055/057 · motivos de perda: sugeridos que já existiam avisam; nome repetido barrado sem ir ao servidor", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const toasts = [], erros = [];
    let acoesModal = null;
    ui.toast = (t, o = {}) => { toasts.push({ t, ...o }); return { fechar() {} }; };
    ui.campo = o => h("label", { class: "campo" }, h("input", { name: o.nome }));
    ui.modal = async o => { acoesModal = o.acoes; return null; };
    ui.lerForm = () => ({ nome: "  achou CARO " });
    ui.marcarErro = (f, campo, txt) => { if (campo) erros.push(txt); };
    const chamadas = [];
    const base = { funis: [], etiquetas: [], motivos: [], campos: [] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e && e.codigo), pode: () => true, recarregarBase: async () => base,
      api: { rpcC: async (n, p) => { chamadas.push(n); if (n === "nx_motivo_salvar") throw Object.assign(new Error("x"), { hint: "nome_em_uso" }); return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const aM = h0(D, "div");
    await secoesConfig.find(s => s.id === "motivos").montar(ctx, aM);
    aM.querySelectorAll("button").find(b => b.textContent === "Usar motivos sugeridos").clique(); await varias(10);
    assert.ok(toasts.some(x => /^Nada novo: os motivos sugeridos já existiam/.test(x.t)), "RX-055: antes nenhum aviso");
    base.motivos.push({ id: 9, nome: "Achou caro" });
    aM.querySelectorAll("button").find(b => b.textContent === "Novo motivo").clique(); await varias();      // plano 2000d: DR-208 — o botão de criar tem verbo
    const n0 = chamadas.length;
    const r = await acoesModal.find(a => a.tipo === "primario").fn({ erro() {} });
    assert.equal(r, false);
    assert.deepEqual(erros, ["Já existe o motivo «Achou caro»."], "RX-057");
    assert.equal(chamadas.length, n0, "sem ida ao servidor");
  } finally { D.desfazer(); }
});

test("RX-056 · iniciais sem pronome de tratamento e sem partir emoji", () => {
  assert.equal(L.iniciais("Dr. João Silva"), "JS");
  assert.equal(L.iniciais("Dra Ana"), "AN");
  assert.equal(L.iniciais("Dr."), "DR", "só o título: usa ele mesmo");
  assert.equal(L.iniciais("😀 Feliz"), "😀F");
  assert.equal(L.iniciais(""), "?");
});

test("RX-058/059/060/061/062 · CSS: foco do «×», link de ligar, «Sem valor», dica do «+N» e faixa da seleção no celular", () => {
  const css = ler("crm.css");
  assert.match(css, /\.crm-chip button:focus-visible \{ outline: 2px solid var\(--c-foco\)/);
  assert.match(css, /\.ng-contato \.ng-tel \{ color: inherit;/);
  assert.match(css, /@media \(pointer: coarse\) \{ \.ng-contato \.ng-tel \{ min-height: 44px; \} \}/);
  assert.match(css, /\.ng-mini \.sem \{[^}]*color: var\(--c-texto-2\)/);
  assert.match(css, /\.kc-mais-etq\[title\] \{ cursor: help; \}/);
  assert.match(css, /@media \(max-width: 760px\) \{ \.crm-sel > \.bt \{ flex: 1 1 calc\(50% - \.5rem\); min-height: 44px; \}/);
});

test("RX-063/065/066 · linha da tarefa: rótulos curtos, responsável pelo dono_id e «Você»", async () => {
  const D = domDeMentira();
  try {
    const k = kTarefas(D);
    k.usuario = id => (id === "u2" ? { id: "u2", nome: "Bia" } : id === "u1" ? { id: "u1", nome: "Eu Mesmo" } : null);
    const { itemTarefa } = await import("../web/app/crm-tarefas.js");
    const longo = "Ligar para confirmar ".repeat(8).trim();
    const li = itemTarefa(k, { id: 1, titulo: longo, tipo: "ligacao", vence_em: null, concluida_em: null, dono_id: "u2" }, {});
    const rot = li.querySelector('input[type="checkbox"]').attrs["aria-label"];
    assert.ok(rot.length < 100 && /…, sem prazo$/.test(rot), `RX-063: ${rot}`);
    const ed = li.querySelectorAll("button").find(b => /^Editar a tarefa/.test(b.attrs["aria-label"] || ""));
    assert.ok(/…$/.test(ed.attrs["aria-label"]));
    assert.equal(li.querySelector(".tf-dono").textContent, "Bia", "RX-065: antes sumia sem o objeto dono");
    const meu = itemTarefa(k, { id: 2, titulo: "X", tipo: "tarefa", vence_em: null, concluida_em: null, dono: { id: "u1", nome: "Eu Mesmo" } }, {});
    assert.equal(meu.querySelector(".tf-dono").textContent, "Você", "RX-066");
    assert.equal(meu.querySelector(".tf-dono").getAttribute("title"), "Responsável: Eu Mesmo");
  } finally { D.desfazer(); }
});

test("RX-067/068 · textos: busca com filtros e números com milhar", () => {
  assert.equal(L.textoSemResultado({ busca: "ana", origem: ["manual"] }), "Nada encontrado para «ana» com esses filtros.");
  assert.equal(L.textoSemResultado({ busca: "ana" }), "Nada encontrado para «ana».");
  assert.equal(L.textoResumoImportacao({ criados: 12345, atualizados: 1, ignorados: 0, erros: [] }), "12.345 criados · 1 atualizado · 0 ignorados · 0 erros");
});

test("RX-064 · #/crm/negocio/abc avisa que o link não vale", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const toasts = [];
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: ["negocio", "abc"], query: {} }, cli: "c-rx064",
      rpc: n => (n === "nx_crm_base" ? { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }], usuarios: [], etiquetas: [], motivos: [], campos: [], ticket: {} }
        : n === "nx_negocios_kanban" ? quadroDe() : {}) });
    ctx.ui.corOk = c => c || null;
    ctx.ui.toast = (t, o = {}) => { toasts.push({ t, ...o }); return { fechar() {} }; };
    await CRM.montar(ctx);
    assert.ok(toasts.some(x => x.t === "Esse link não aponta para uma oportunidade válida." && x.tipo === "erro"), JSON.stringify(toasts));
    CRM.desmontar();
  } finally { D.desfazer(); }
});

test("RX-069/070 · nome do CSV de erros com a planilha e o dia; nascimento antes de 1900 avisa", () => {
  assert.equal(L.nomeArquivoImportacao("erros", "Clientes Maio.csv", "2026-10-25"), "erros-clientes-maio-2026-10-25.csv");
  assert.equal(L.nomeArquivoImportacao("problemas", "Colado do Excel", "2026-10-25"), "problemas-colado-do-excel-2026-10-25.csv");
  assert.equal(L.nomeArquivoImportacao("erros", null, ""), "erros.csv");
  const imp = ler("crm-importar.js");
  assert.ok(imp.includes("L.nomeArquivoImportacao(\"erros\", S.arquivo && S.arquivo.nome") && imp.includes("L.nomeArquivoImportacao(\"problemas\""));
  assert.ok(ler("crm-listas.js").includes("x.value < \"1900-01-01\" ? \"Confira o ano do nascimento (antes de 1900).\""), "RX-070");
});

test("RX-071/073 · gaveta: valor negativo não grava; serviço acha o ticket sem olhar maiúscula", async () => {
  assert.equal(L.erroDinheiro("-150"), "O valor não pode ser negativo.");
  assert.equal(L.erroDinheiro("abc"), "Valor inválido. Use só números, por exemplo 1.500,00.");
  assert.equal(L.erroDinheiro(""), null);
  assert.equal(L.ticketDoServico({ Implante: "3500" }, "  implante "), 3500);
  assert.equal(L.ticketDoServico({ Implante: "3500" }, "Clareamento"), null);
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    await imediato(); await imediato();
    const inp = t.corpo().querySelectorAll(".ng-kv input").find(x => x.attrs.placeholder === "0,00");
    const n0 = t.reg.chamadas.length;
    inp.value = "-100"; inp.dispara("change"); inp.dispara("blur"); await varias(6);
    assert.ok(!t.reg.chamadas.slice(n0).some(c => /negocio_salvar/.test(c.nome)), "não foi ao servidor");
    const erro = t.corpo().querySelectorAll(".ed-erro").find(e => !e.hidden);
    assert.equal(erro && erro.textContent, "O valor não pode ser negativo.");
  } finally { D.desfazer(); }
});

test("RX-074 · lista longa do lote: Enter com uma opção só escolhe", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const etqs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nome: i === 6 ? "Retorno" : `E${i + 1}` }));
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1", 1, { etiquetas: [] })) }), uix: { modal: modalFila(respostas) },
      base: { etiquetas: etqs, usuarios: [] }, etiqueta: id => etqs.find(e => e.id === id) || null });
    t.cartao(1).dispara("click", { shiftKey: true, target: t.cartao(1) });
    respostas.push((o, api) => {
      const campo = o.corpo.querySelector(".kb-mover-busca");
      campo.value = "retor"; campo.dispara("input");
      campo.dispara("keydown", { key: "Enter" });
    });
    t.tela.querySelector(".crm-sel-etq").clique(); await varias(10);
    assert.deepEqual(t.chamadas("nx_negocio_salvar").map(c => c.p.p_negocio), [{ id: 1, etiquetas: [7] }]);
    assert.match(ler("crm-kanban.js"), /RX-074: Enter com UMA etapa sobrando escolhe ela/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RX-072/075 · tarefas: detalhes com link e telefone clicáveis; painel com milhar", async () => {
  const D = domDeMentira();
  try {
    const k = kTarefas(D);
    const { itemTarefa } = await import("../web/app/crm-tarefas.js");
    const li = itemTarefa(k, { id: 3, titulo: "Retorno", tipo: "tarefa", vence_em: null, concluida_em: null, descricao: "Ver https://exemplo.com.br/orc e ligar (12) 99830-3030" }, {});
    const links = li.querySelectorAll(".tf-desc a");
    assert.deepEqual(links.map(a => a.getAttribute("href")), ["https://exemplo.com.br/orc", "tel:+5512998303030"]);
    assert.equal(li.querySelector(".tf-desc").textContent, "Ver https://exemplo.com.br/orc e ligar (12) 99830-3030");
    assert.ok(ler("crm-tarefas.js").includes("painelNums[id].textContent = ui.num ? ui.num(n) : String(n);"), "RX-072");
  } finally { D.desfazer(); }
});

test("RX-076/077/078/079 · e-mail em minúsculas, WhatsApp direto sem Conversas, site com domínio minúsculo e CSS dos detalhes", async () => {
  assert.equal(L.normalizarSite("HTTPS://WWW.Exemplo.com.br/Promo"), "https://www.exemplo.com.br/Promo", "RX-079");
  assert.equal(L.normalizarSite("WWW.Empresa.COM"), "https://www.empresa.com");
  const listas = ler("crm-listas.js");
  assert.ok(listas.includes("ler: x => x.value.trim().toLowerCase() || null, salvar: v => salvar({ email: v })") && listas.includes("if (dados.email) dados.email = String(dados.email).trim().toLowerCase();"), "RX-077");
  const css = ler("crm.css");
  assert.match(css, /\.tf-desc \{ overflow-wrap: anywhere; \}/, "RX-076");
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    await imediato(); await imediato();
    const wa = t.corpo().querySelector(".ng-wa");
    assert.equal(wa && wa.getAttribute("href"), "https://wa.me/5512998303030", "RX-078: sem Conversas, o WhatsApp direto");
    const t2 = await montarGaveta(D, { kx: { ctx: { temModulo: () => true } } });
    await imediato(); await imediato();
    assert.equal(t2.corpo().querySelector(".ng-wa"), null, "com Conversas, fica o «Abrir conversa»");
  } finally { D.desfazer(); }
});

test("RX-080/081/082 · título longo pela régua dos caracteres, menos no fim e sugestão de e-mail", () => {
  assert.equal(L.lerNumero("1.500,00-"), -1500);
  assert.equal(L.lerNumero("150-"), -150);
  assert.equal(L.lerNumero("15-0"), null);
  assert.equal(L.sugestaoEmail("Ana@Gmail.con"), "ana@gmail.com");
  assert.equal(L.sugestaoEmail("bia@hotmal.com"), "bia@hotmail.com");
  assert.equal(L.sugestaoEmail("caio@empresa.com.br"), null);
  assert.equal(L.sugestaoEmail("sem-arroba"), null);
  assert.ok(ler("crm-listas.js").includes("return s ? `Quis dizer ${s}?` : null;"), "RX-082 na ficha");
  assert.ok(ler("crm-kanban.js").includes("title: Array.from(titulo).length > 48 ? titulo : null"), "RX-080");
});
