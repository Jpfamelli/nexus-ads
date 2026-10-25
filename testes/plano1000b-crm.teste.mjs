/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026), frente crm, lote crm-1.
   node --test testes/plano1000b-crm.teste.mjs
   (a) lógica pura nova/corrigida (crm-logica): opção com maiúscula/acento, semana com «hoje» inválido, UTF-8 com 1 byte ruim, Link sem https,
       prazo fracionado, rpcAusente, chip de etiquetas, opções/colunas repetidas, UF;
   (b) comportamento num DOM de mentira (o mesmo do plano1000-crm, copiado abaixo): Kanban (sem funil, funil excluído, fita, seleção
       pelo teclado, comparação com o cache, contagem, «há N min», desmontar, preferências por conta, filtro de campo), crm.js (base
       guardada estragada, comandos de funil), gaveta (vertical, fita em lista, feminino, outro negócio na mesma gaveta, obrigatório),
       Contatos/ficha/empresa, Tarefas (rede, preferências, vínculo com negócio) e Importação (lendo, colunas repetidas, sem funil),
       Configurações (cópia, cor, opções repetidas, chave interna).
   Sem rede, sem serviços reais. Mantenedores: os outros lotes crm (crm-2…) acrescentam testes NO FIM deste arquivo.
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
async function montarImp(D, { rpc = async () => ({}), naoAtualizar = null, Lx = null, uix = {} } = {}) {
  const { h } = D;
  const reg = { chamadas: [] };
  const ui = uiDeMentira(h, reg);
  const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [{ id: "f1", nome: "Pacientes", ativo: true, padrao: true, conta_no_ads: false, estagios: [{ id: "s1", nome: "Nova", tipo: "aberto" }, { id: "s9", nome: "Fechado", tipo: "ganho" }] }] };
  Object.assign(ui, uix);
  const k = { ui, h, L: Lx || L, base, v: V, ctx: { cliente: { id: "cli-i" }, titulo() {}, navegar() {}, naoAtualizar }, api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); return rpc(nome, p); } },
    pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], estagio: id => base.funis[0].estagios.find(e => e.id === id) || null,
    etiqueta: () => null, usuario: () => null, recarregarBase: async () => base, criarEtiqueta: async () => null };
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


/* ============================================================ lote crm-1 — testes */
const kbVazio = () => quadroDe({ s1: col("s1", cartoes(2, "s1")), s2: col("s2", cartoes(1, "s2", 10)) });
const naoLanca = async fn => { await fn(); for (let i = 0; i < 6; i++) await tique(); };

/* ---------- (a) lógica pura ---------- */
test("RB-068 opção com maiúscula/acento diferente casa com a oficial e grava a oficial (gaveta, ficha e planilha)", () => {
  const c = { tipo: "opcao", opcoes: ["Unimed", "São Lucas"], rotulo: "Convênio" };
  assert.equal(L.validarCampo(c, "unimed"), null, "antes: «Escolha uma das opções.»");
  assert.equal(L.validarCampo(c, " sao lucas "), null);
  assert.equal(L.normalizarCampo(c, "unimed"), "Unimed");
  assert.equal(L.validarCampo(c, "Bradesco"), "Escolha uma das opções.");
  const m = { tipo: "multi", opcoes: ["Manhã", "Tarde"] };
  assert.equal(L.validarCampo(m, "manha; TARDE"), null);
  assert.deepEqual(L.normalizarCampo(m, "manha; TARDE"), ["Manhã", "Tarde"]);
  const linhas = L.montarLinhas([["Ana", "unimed"]], ["nome", "campo:convenio"], [{ chave: "convenio", ...c }]);
  assert.equal(linhas[0].campos.convenio, "Unimed", "a importação também grava a oficial");
});

test("RB-078 colunasDaSemana com «hoje» vazio ou inválido não lança (a visão Semana não cai)", () => {
  for (const hoje of ["", undefined, "2026-13-40", "ontem"]) {
    const r = L.colunasDaSemana([], { hoje });
    assert.deepEqual(r, { colunas: [], depois: 0, antes: 0, semPrazo: 0 });
  }
  assert.equal(L.colunasDaSemana([], { hoje: "2026-10-14" }).colunas.length, 7);
});

test("RB-248 um byte inválido num arquivo UTF-8 cheio de acentos continua UTF-8; arquivo ANSI de verdade ainda vira Windows-1252", () => {
  const texto = "Nome;Cidade\n" + Array.from({ length: 400 }, (_, i) => `João ${i};São José dos Campos`).join("\n");
  const utf = new TextEncoder().encode(texto);
  const comUmRuim = new Uint8Array(utf.length + 1); comUmRuim.set(utf); comUmRuim[utf.length] = 0xff;
  const r = L.decodificarArquivo(comUmRuim);
  assert.equal(r.codificacao, "utf-8", "antes: um «�» relia tudo como 1252 e estragava os acentos");
  assert.ok(r.texto.includes("São José"));
  const ansi = Uint8Array.from([...("Jo")].map(c => c.charCodeAt(0)).concat([0xe3, 0x6f]));      // «João» em Windows-1252
  const r2 = L.decodificarArquivo(ansi);
  assert.equal(r2.codificacao, "windows-1252");
  assert.equal(r2.texto, "João");
});

test("RB-076 campo Link aceita «www.site.com.br» e grava com https://", () => {
  const c = { tipo: "url", rotulo: "Site" };
  assert.equal(L.validarCampo(c, "www.exemplo.com.br"), null, "antes: «Link inválido (comece com https://)»");
  assert.equal(L.normalizarCampo(c, "www.exemplo.com.br"), "https://www.exemplo.com.br");
  assert.equal(L.normalizarCampo(c, "https://x.com/a"), "https://x.com/a");
  assert.notEqual(L.validarCampo(c, "javascript:alert(1)"), null);
  assert.notEqual(L.validarCampo(c, "abc"), null);
});

test("RB-081 prazo de «1,5» hora vira 2 h (o funil salva; antes: erro «de 1 hora a 90 dias»)", () => {
  assert.equal(L.horasSla("1,5", "h"), 2);
  assert.equal(L.horasSla("2", "d"), 48);
  const f = { nome: "F", estagios: [{ nome: "A", tipo: "aberto", sla_horas: L.horasSla("1,5", "h") }, { nome: "G", tipo: "ganho" }, { nome: "P", tipo: "perdido" }] };
  assert.deepEqual(L.validarFunil(f), []);
});

test("RB-085 rpcAusente: erro interno 42883 de uma RPC que existe não esconde o recurso; 404 e PGRST202 sim", () => {
  assert.equal(L.rpcAusente({ status: 500, message: "function unaccent(text) does not exist" }), false);
  assert.equal(L.rpcAusente({ status: 400, codigo: "function public.f(x) does not exist" }), false);
  assert.equal(L.rpcAusente({ status: 404, codigo: "x" }), true);
  assert.equal(L.rpcAusente({ status: 400, codigo: "PGRST202" }), true);
  assert.equal(L.rpcAusente({ codigo: "Could not find the function public.nx_x in the schema cache" }), true);
});

test("RB-019/139/071/055 textos e listas: chip de etiquetas sem a chave; opções sem repetidas; colunas repetidas; UF que existe", () => {
  assert.equal(L.textoChipEtiquetas("alguma", ["VIP", null, "Retorno"]), "Tem alguma de: VIP, Retorno");
  assert.equal(L.textoChipEtiquetas("todas", ["VIP"]), "Tem todas: VIP");
  assert.equal(L.textoChipEtiquetas("nenhuma", ["VIP"]), "Sem nenhuma de: VIP");
  assert.deepEqual(L.opcoesUnicas(["A", "a", " Á ", "B", ""]), { opcoes: ["A", "B"], unidas: 2 });
  assert.deepEqual(L.rotulosColunas(["Nome", "nome", "", "Telefone", "NOME"]), { rotulos: ["Nome", "nome (2ª)", "Coluna 3", "Telefone", "NOME (3ª)"], repetidas: true });
  assert.equal(L.rotulosColunas(["Nome", "Telefone"]).repetidas, false);
  assert.equal(L.ufValida("sp"), true);
  assert.equal(L.ufValida("XY"), false);
  assert.equal(L.ufValida("S"), false);
});

/* ---------- (b) Kanban ---------- */
test("RB-001 Kanban (DOM): sem funil ativo o «Novo»/«+» somem e a tecla N não lança; o «+» avisa «Crie um funil antes»", async () => {
  const D = domDeMentira();
  try {
    let novos = 0;
    const t = await montarKb(D, { dados: kbVazio(), N: { novoNegocio() { novos++; } }, kx: { funil: () => null, funilPadrao: () => null } });
    assert.match(t.tela.textContent, /Nenhum funil ativo/);
    const fab = D.doc.body.querySelector(".crm-fab"), bt = t.tela.querySelector(".crm-novo");
    assert.equal(bt.hidden, true); assert.equal(fab.hidden, true);
    assert.doesNotThrow(() => D.documento("keydown", { key: "n", target: t.tela }), "antes: TypeError em S.funil.id");
    assert.doesNotThrow(() => fab.clique());
    assert.equal(novos, 0);
    assert.equal(t.reg.toasts.at(-1), "Crie um funil antes.");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-003 Kanban (DOM): Alt+2 para um funil que outro admin excluiu avisa em vez de derrubar a tela", async () => {
  const D = domDeMentira();
  try {
    const f1 = { id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB };
    const f2 = { id: "f2", nome: "Pós-venda", ativo: true, estagios: ETAPAS_KB };
    const t = await montarKb(D, { dados: kbVazio(), base: { funis: [f1, f2] }, kx: { funil: id => (id === "f1" ? f1 : null) } });
    assert.doesNotThrow(() => D.documento("keydown", { key: "2", code: "Digit2", altKey: true, target: t.tela }), "antes: TypeError (S.funil null no replaceState)");
    assert.equal(t.reg.toasts.at(-1), "Esse funil não existe mais.");
    assert.equal(t.api.funilAtual(), "f1", "continua no funil que existe");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-007/225 Kanban (DOM): depois de mover um cartão a fita mantém «fechada, ganho/perda» no rótulo", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const fitaB = id => t.tela.querySelector(`.kb-fita-b[data-estagio="${id}"]`);
    assert.match(fitaB("s5").attrs["aria-label"], /^Fechou \(fechada, ganho\), 0 cartões$/);
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight"); tecla(art, "Enter");
    await varias(8);
    assert.match(fitaB("s5").attrs["aria-label"], /\(fechada, ganho\)/, "antes: a recontagem reescrevia só «Fechou, 0 cartões»");
    assert.match(fitaB("s6").attrs["aria-label"], /\(fechada, perda\)/);
    assert.match(fitaB("s2").attrs["aria-label"], /^Agendada, 2 cartões$/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-024 Kanban (DOM): Shift+Espaço e X selecionam pelo teclado (barra «Mover para…» aparece)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const a1 = t.cartao(1), a2 = t.cartao(2);
    a1.dispara("keydown", { key: " ", shiftKey: true, currentTarget: a1, target: a1 });
    a2.dispara("keydown", { key: "x", currentTarget: a2, target: a2 });
    const barra = t.tela.querySelector(".crm-sel");
    assert.equal(barra.hidden, false, "antes: Shift+Espaço PEGAVA o cartão (modo mover) e não selecionava");
    assert.equal(t.tela.querySelector(".crm-sel-n").textContent, "2 selecionados");
    assert.equal(t.reg.avisos.at(-1), "2 cartões selecionados.");
    assert.ok(!a1.classList.contains("pego"), "não entrou no modo «pego»");
    assert.ok(t.tela.querySelectorAll(".sr-only").some(x => /Shift com Espaço \(ou a tecla X\)/.test(x.textContent)), "a instrução do leitor de tela ensina");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-262 Kanban (DOM): a resposta igual ao cache não serializa o quadro inteiro; a diferente redesenha", async () => {
  const D = domDeMentira();
  const json = JSON.stringify;
  try {
    let cacheDe = kbVazio(), redeDe = kbVazio();
    let inteiros = 0;
    const kx = { api: { rpcC: async (nome, p, o = {}) => {
      if (nome !== "nx_negocios_kanban") return {};
      if (o.aoCache) o.aoCache(JSON.parse(json(cacheDe)));
      await tique();
      return JSON.parse(json(redeDe));
    } } };
    JSON.stringify = function (v, ...r) { if (v && typeof v === "object" && Array.isArray(v.colunas)) inteiros++; return json.call(JSON, v, ...r); };
    const t = await montarKb(D, { dados: kbVazio(), kx });
    await varias();
    assert.equal(inteiros, 0, "antes: JSON.stringify(S.dados) e JSON.stringify(d) a cada resposta");
    t.api.desmontar();
    redeDe = quadroDe({ s1: col("s1", cartoes(2, "s1")), s2: col("s2", [...cartoes(1, "s2", 10), ...cartoes(1, "s2", 11)]) });
    const t2 = await montarKb(D, { dados: kbVazio(), kx });
    await varias();
    assert.ok(t2.cartao(11), "a coluna que mudou foi redesenhada com a resposta da rede");
    t2.api.desmontar();
  } finally { JSON.stringify = json; D.desfazer(); }
});

test("RB-011 Kanban (DOM): a contagem da coluna é número + «cartões» para o leitor (sem aria-label num span)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const n = t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-n');
    assert.equal(n.getAttribute("aria-label"), null);
    assert.equal(n.textContent, "2 cartões");
    assert.equal(n.querySelector(".sr-only").textContent, " cartões");
    assert.equal(t.tela.querySelector('.kb-col[data-estagio="s2"] .kb-col-n').textContent, "1 cartão");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-015 Kanban (DOM): «atualizado às» velho diz no texto há quantos minutos (não só no title)", async () => {
  const D = domDeMentira();
  mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const idade = t.tela.querySelector(".crm-kb-idade");
    assert.doesNotMatch(idade.textContent, /há/);
    mock.timers.tick(3 * 60000 + 1000);
    assert.match(idade.textContent, /^atualizado às \d\d:\d\d · há 3 min$/, "antes: o texto ficava igual e a explicação só no title");
    assert.ok(idade.classList.contains("velho"));
    t.api.desmontar();
  } finally { mock.timers.reset(); D.desfazer(); }
});

test("RB-023 Kanban (DOM): sair do quadro tira os ouvintes de rolagem/toque e cancela o rAF e os avisos de «movido»", async () => {
  const D = domDeMentira();
  const cancelados = [];
  const rafAntes = globalThis.requestAnimationFrame, cafAntes = globalThis.cancelAnimationFrame;
  try {
    globalThis.requestAnimationFrame = () => 77; globalThis.cancelAnimationFrame = id => cancelados.push(id);
    const t = await montarKb(D, { dados: kbVazio() });
    const q = t.tela.querySelector(".kb");
    assert.equal((q._l.scroll || []).length, 1); assert.equal((q._l.touchmove || []).length, 1);
    q.dispara("scroll");                       // um quadro pedido (rAF 77) e ainda não rodou
    t.api.desmontar();
    assert.equal((q._l.scroll || []).length, 0, "antes: o ouvinte de rolagem ficava vivo");
    assert.equal((q._l.touchmove || []).length, 0);
    assert.deepEqual(cancelados, [77]);
  } finally { globalThis.requestAnimationFrame = rafAntes; globalThis.cancelAnimationFrame = cafAntes; D.desfazer(); }
});

test("RB-028 Kanban (DOM): «Recolher vazias» e «Resumo do funil» por CONTA — a chave antiga migra uma vez", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-kb-recolher-cli-p1000", "1");
    const t = await montarKb(D, { dados: kbVazio() });
    assert.equal(t.tela.querySelector(".crm-recolher").attrs["aria-pressed"], "true", "a escolha antiga continua para quem abre primeiro");
    assert.equal(D.storage.get("nx-app-crm-kb-recolher-cli-p1000-u1"), "1");
    assert.equal(D.storage.has("nx-app-crm-kb-recolher-cli-p1000"), false);
    t.tela.querySelector(".crm-fr-cab").clique();
    assert.ok(D.storage.has("nx-app-crm-fr-cli-p1000-u1"));
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: kbVazio(), kx: { eu: () => "u2" } });
    assert.equal(t2.tela.querySelector(".crm-recolher").attrs["aria-pressed"], "false", "antes: a outra conta herdava «recolher»");
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-033/037 Kanban (DOM): filtro guardado com campo excluído não vai ao servidor; a busca tem maxlength 120", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-kb-cli-p1000-u1", JSON.stringify({ filtro: { campo: { chave: "convenio", op: "igual", valor: "Unimed" }, dono: "eu" } }));
    const t = await montarKb(D, { dados: kbVazio(), base: { campos: [] } });
    const f = t.chamadas("nx_negocios_kanban")[0].p.p_filtro;
    assert.equal(f.campo, undefined, "antes: dados_invalidos|campo e o quadro em erro");
    assert.equal(f.dono, "eu", "o resto do filtro continua");
    assert.equal(t.tela.querySelector('input[type="search"]').attrs.maxlength, "120");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

/* ---------- (b) crm.js ---------- */
const BASE_OK = () => ({ funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, { id: "f2", nome: "Pós-venda", ativo: true, estagios: ETAPAS_KB }],
  usuarios: [], etiquetas: [], motivos: [], campos: [], ticket: {} });

test("RB-189 crm.js: base guardada no aparelho em formato antigo ({funis: null}) é ignorada — o CRM espera a rede e abre", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    assert.equal(CRM.baseValida({ funis: null, usuarios: [], etiquetas: [], motivos: [] }), false);
    assert.equal(CRM.baseValida({ funis: [{ id: 1 }], usuarios: [], etiquetas: [], motivos: [] }), false, "funil sem etapas");
    assert.equal(CRM.baseValida(BASE_OK()), true);
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: {} }, cli: "c189" });
    ctx.ui.corOk = c => c || null;
    ctx.api = { rpcC: async (n, p, o = {}) => {
      if (n === "nx_crm_base") { if (o.aoCache) o.aoCache({ funis: null, usuarios: null }); await tique(); return BASE_OK(); }
      if (n === "nx_negocios_kanban") return quadroDe();
      return {};
    } };
    await CRM.montar(ctx);
    assert.ok(ctx.alvo.querySelector(".kb"), "antes: TypeError em k.base.funis e o cartão de erro");
    assert.equal(ctx.alvo.querySelector(".erro-cartao"), null);
    CRM.desmontar();
  } finally { D.desfazer(); }
});

test("RB-190/194 crm.js: «Ir para o funil» também para o somente leitura e refeito quando os funis mudam", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const reg = new Map();
    const comandos = { registrar: c => { reg.set(c.id, c); return () => reg.delete(c.id); } };
    let base = BASE_OK();
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: {} }, cli: "c190", comandos,
      rpc: n => (n === "nx_crm_base" ? JSON.parse(JSON.stringify(base)) : n === "nx_negocios_kanban" ? quadroDe() : {}) });
    ctx.pode = min => min === "leitura";
    ctx.ui.corOk = c => c || null;
    await CRM.montar(ctx);
    assert.deepEqual([...reg.keys()].filter(x => x.startsWith("crm.funil-")).sort(), ["crm.funil-f1", "crm.funil-f2"], "antes: o leitura ficava sem nenhum");
    assert.equal(reg.has("crm.novo-negocio"), false, "criar continua só para quem pode");
    base = { ...base, funis: [...base.funis, { id: "f3", nome: "Indicações", ativo: true, estagios: ETAPAS_KB }] };
    const k = await CRM.kit(ctx);
    await k.recarregarBase();
    assert.ok(reg.has("crm.funil-f3"), "antes: só aparecia depois de sair do CRM");
    CRM.desmontar();
    assert.equal(reg.size, 0);
  } finally { D.desfazer(); }
});

/* ---------- (b) gaveta do negócio ---------- */
test("RB-041 perda: a ajuda da retomada usa o termo da vertical («ligada a este orçamento»)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    let corpo = null;
    const k = { ...t.k, v: { ...V, min: x => ({ negocio: "orçamento", negocios: "orçamentos", contato: "cliente", contatos: "clientes" })[x] || x, art: () => "o" },
      ui: { ...t.k.ui, modal: async o => { corpo = o.corpo; return null; } } };
    await t.N.prepararMovimento(k, { id: 801, estagio_id: "s2", titulo: "Ana" }, ETAPAS.find(e => e.id === "s6"));
    assert.match(corpo.textContent, /ligada a este orçamento\./, "antes: «ligada a esta oportunidade» em todas as verticais");
  } finally { D.desfazer(); }
});

test("RB-060 gaveta (DOM): a fita de etapas é <ol> com <li> e o BOTÃO dentro (sem button role=listitem)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    await varias();
    const fita = t.corpo().querySelector(".ng-fita");
    assert.equal(fita.tagName, "OL");
    const itens = fita.els;
    assert.equal(itens.length, ETAPAS.length);
    assert.ok(itens.every(li => li.tagName === "LI" && li.els[0].tagName === "BUTTON" && li.els[0].getAttribute("role") === null));
    assert.equal(t.corpo().querySelector(".ng-etapa[aria-current]").textContent.startsWith("Agendada"), true);
  } finally { D.desfazer(); }
});

test("RB-047 gaveta: «Excluída.» e «Movida para «Funil».» no feminino (oportunidade)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    await varias();
    let itens = null;
    t.k.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    t.corpo().querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    await itens.find(i => i && /^Excluir/.test(i.rotulo || "")).fn(); await varias();
    assert.ok(t.reg.toasts.includes("Excluída."), "antes: «Excluído.»");
    t.k.base.funis.push({ id: "f2", nome: "Indicações", ativo: true, conta_no_ads: true, estagios: [{ id: "x1", nome: "Nova", tipo: "aberto", ordem: 1 }] });
    t.k.ui.modal = async () => ({ id: 801, estagio_id: "s2" });
    await t.N.moverDeFunil(t.k, { id: 801, funil_id: "f1", estagio_id: "s2", status: "aberto" }, {});
    assert.equal(t.reg.toasts.at(-1), "Movida para «Pacientes».", "antes: «Movido.»");
  } finally { D.desfazer(); }
});

test("RB-061 gaveta (DOM): «Mais do contato» troca o negócio na MESMA gaveta e entra em «Recentes»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { ver: { outros: [{ id: 802, titulo: "Implante", estagio_id: "s1", status: "aberto", valor_previsto: 0 }] } });
    await varias();
    const rec = [];
    t.k.lembrarRecente = x => rec.push(x);
    t.corpo().querySelector(".ng-mini").clique(); await varias();
    assert.notEqual(t.g.fechada, true, "antes: fechava a gaveta e reabria outra sem ‹ › nem Recentes");
    assert.equal(t.cham("nx_negocio_ver").at(-1).p.p_id, 802);
    assert.deepEqual(rec.map(r => r.hash), ["#/crm/negocio/802"]);
  } finally { D.desfazer(); }
});

test("RB-220 gaveta e ficha (DOM): campo obrigatório pode ser limpo nas duas telas, com o mesmo aviso", async () => {
  const D = domDeMentira();
  try {
    const campo = { id: 1, chave: "conv", rotulo: "Convênio", tipo: "texto", obrigatorio: true };
    const t = await montarGaveta(D, { campos: [{ ...campo, entidade: "negocio" }], negocio: { campos: { conv: "Unimed" } } });
    await varias();
    const inp = t.corpo().querySelector('[name="campo__conv"]');
    inp.closest("form").dispara("change", { target: inp });
    await varias();
    assert.match(t.reg.toastsO.at(-1).t, /^Salvo\. «Convênio» é obrigatório/);
    assert.equal(t.reg.toastsO.at(-1).tipo, "aten");
    // a ficha (antes: «Preencha» bloqueava e nada era gravado)
    const c = await montarCt(D, { base: { campos: [{ ...campo, entidade: "contato" }] },
      rpc: n => (n === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana", campos: { conv: "Unimed" } }, negocios: [], conversas: [], tarefas: [], notas: [], tempo: [] } : n === "nx_contato_salvar" ? { id: 501 } : undefined) });
    const ts = []; c.ui.toast = (x, o = {}) => { ts.push({ x, ...o }); return { fechar() {} }; };
    const el = h0(D, "div", { class: "crm" });
    await c.M.montarFicha(c.k, el, 501, {});
    const inF = el.querySelector('[name="campo__conv"]');
    inF.closest("form").dispara("change", { target: inF });
    await varias();
    assert.deepEqual(c.cham("nx_contato_salvar").at(-1).p.p_contato, { id: 501, campos: { conv: null } });
    assert.match(ts.at(-1).x, /^Salvo\. «Convênio» é obrigatório/);
  } finally { D.desfazer(); }
});

/* ---------- (b) Contatos, ficha e empresa ---------- */
const FICHA = (extra = {}) => ({ contato: { id: 501, nome: "Ana Souza", campos: {} }, negocios: [], conversas: [], tarefas: [], notas: [], tempo: [], ...extra });

test("RB-019/033/037/095 Contatos (DOM): chip de etiquetas legível; filtro de campo excluído some; maxlength; a contagem é a MESMA região viva", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-ct-cli-ct-u1", JSON.stringify({ filtro: { etiquetas: { op: "alguma", ids: [3] }, campo: { chave: "sumiu", op: "igual", valor: "x" } } }));
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 120, tem_mais: true } });
    t.k.etiqueta = id => (id === 3 ? { id: 3, nome: "VIP" } : null);
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    assert.equal(tela.querySelector(".crm-chip span").textContent, "Tem alguma de: VIP", "antes: «Etiquetas (alguma): VIP»");
    assert.equal(t.cham("nx_contatos_listar")[0].p.p_filtro.campo, undefined);
    assert.equal(tela.querySelector('input[type="search"]').attrs.maxlength, "120");
    const viva = tela.querySelector(".ct-pag-n-txt");
    assert.ok(viva && viva.getAttribute("aria-live") === "polite");
    botaoTxt(tela, /Próxima/).clique(); await varias();
    assert.equal(tela.querySelector(".ct-pag-n-txt"), viva, "antes: um span aria-live novo a cada página (não era anunciado)");
    assert.match(viva.textContent, /^51–51 de 120$/);
    api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-107 Contatos (DOM): exportar pelo ⋮ mostra «Exportando…» fixo com «Cancelar»", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const paginas = [];
    const t = await montarCt(D, { rpc: n => (n === "nx_contatos_exportar" ? new Promise(r => paginas.push(r)) : undefined) });
    const ts = []; let fechados = 0, itens = null;
    t.ui.toast = (x, o = {}) => { ts.push({ x, ...o }); return { fechar() { fechados++; } }; };
    t.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    tela.querySelector(".crm-cab-mais").clique();
    itens.find(i => i && i.rotulo === "Exportar planilha").fn(); await tique();
    const aviso = ts.find(x => /^Exportando pacientes…$/.test(x.x));
    assert.ok(aviso, "antes: pelo ⋮ nada aparecia e o 2º toque cancelava às cegas");
    assert.equal(aviso.fixo, true); assert.equal(aviso.acao.rotulo, "Cancelar");
    aviso.acao.fn();
    paginas[0]({ itens: [{ id: 1 }], tem_mais: true }); await varias();
    assert.equal(fechados, 1, "o aviso fecha no fim");
    assert.match(ts.at(-1).x, /^Exportação cancelada\. Nenhum arquivo foi baixado\.$/);
    assert.equal(U.criados.length, 0);
    api.desmontar();
  } finally { U.desfazer(); D.desfazer(); }
});

test("RB-208/112/099 ficha (DOM): na gaveta o nome é h2; o pulso mantém o filtro da linha do tempo e a rolagem; plural da mídia na exclusão", async () => {
  const D = domDeMentira();
  try {
    let resp = FICHA({ tempo: [{ fonte: "nota", tipo: "nota", em: iso(0), dados: { texto: "prefere manhã" } }, { tipo: "estagio", em: iso(-1), dados: {} }] });
    const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? JSON.parse(JSON.stringify(resp)) : n === "nx_contato_excluir" ? { midias_na_fila: 1 } : undefined) });
    const T = await import("../web/app/crm-tarefas.js");
    const N = await import("../web/app/crm-negocio.js");
    t.k.nomes = () => ({}); t.k.motivosPorId = () => ({});
    t.k.mod = async nome => (nome === "negocio" ? N : nome === "tarefas" ? { blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div"), blocoTempo: T.blocoTempo, formTarefa: async () => null } : {});
    let pulso = null;
    t.k.ctx.pulso = { assinar: f => { pulso = f; return () => {}; } };
    t.k.pode = () => true;
    let itens = null; t.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    const el = h0(D, "div", { class: "crm" });
    const gaveta = { trocarTitulo() {}, fechar() { gaveta.fechada = true; }, corpo: el };
    await t.M.montarFicha(t.k, el, 501, { gaveta });
    assert.equal(el.querySelector("h1"), null, "antes: h1 dentro da gaveta");
    assert.equal(el.querySelector("h2.fx-nome").textContent, "Ana Souza");
    el.querySelector('.tempo-filtro[data-filtro="nota"]').clique();
    el.scrollTop = 420;
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    try {
      mock.timers.tick(31000);
      resp = { ...resp, contato: { ...resp.contato, nome: "Ana S." } };
      await pulso(); await varias();
    } finally { mock.timers.reset(); }
    assert.equal(el.querySelector("h2.fx-nome").textContent, "Ana S.", "redesenhou");
    assert.equal(el.querySelector('.tempo-filtro[data-filtro="nota"]').attrs["aria-pressed"], "true", "antes: voltava para «Tudo»");
    assert.equal(el.querySelectorAll(".tempo-it").length, 1);
    assert.equal(el.scrollTop, 420);
    // RB-099
    el.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    await itens.find(i => i && /Excluir cadastro/.test(i.rotulo || "")).fn(); await varias();
    assert.equal(t.reg.toasts.at(-1), "Cadastro excluído — 1 arquivo de mídia entra na faxina.", "antes: «1 arquivo(s) de mídia entram»");
  } finally { D.desfazer(); }
});

test("RB-216/055 Empresas (DOM): Esc limpa a busca e recarrega; formulário confere e-mail e UF sem ir ao servidor", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: n => (n === "nx_empresas_listar" ? { itens: [], total: 0 } : undefined) });
    const tela = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresas(t.k, tela);
    const busca = tela.querySelector('input[type="search"]');
    busca.value = "frota"; busca.dispara("input"); await varias();
    assert.equal(t.cham("nx_empresas_listar").at(-1).p.p_filtro.busca, "frota");
    busca.dispara("keydown", { key: "Escape" }); await varias();
    assert.equal(busca.value, "", "antes: Esc não fazia nada aqui");
    assert.equal(t.cham("nx_empresas_listar").at(-1).p.p_filtro.busca || "", "");
    // formulário
    const erros = [];
    t.ui.marcarErro = (f, nome, txt) => { if (nome) erros.push([nome, txt]); };
    for (const [dados, campo] of [[{ nome: "Frota X", uf: "XY" }, "uf"], [{ nome: "Frota X", email: "sem-arroba" }, "email"]]) {
      t.ui.lerForm = () => dados;
      t.ui.modal = async o => o.acoes.find(a => a.tipo === "primario").fn({ erro() {} });
      const r = await t.M.formEmpresa(t.k, null);
      assert.equal(r, false);
      assert.equal(erros.at(-1)[0], campo);
    }
    assert.equal(t.cham("nx_empresa_salvar").length, 0, "antes: só o servidor recusava");
  } finally { D.desfazer(); }
});

test("RB-092/252/103 empresa (DOM): ligar contato de OUTRA empresa pergunta; o que já está nela continua focável; ícone decorativo escondido", async () => {
  const D = domDeMentira();
  try {
    const emp = { empresa: { id: 7, nome: "Frota X" }, contatos: [], negocios: [{ id: 90, titulo: "Revisão", estagio_id: "s1", status: "aberto", valor_previsto: 100 }] };
    const t = await montarCt(D, { rpc: n => {
      if (n === "nx_empresa_ver") return emp;
      if (n === "nx_contatos_listar") return { itens: [{ id: 501, nome: "Rafael", empresa: { id: 9, nome: "Outra" } }, { id: 502, nome: "Bia", empresa: { id: 7, nome: "Frota X" } }] };
      if (n === "nx_contato_salvar") return { id: 501 };
      return undefined;
    } });
    t.k.estagio = id => ETAPAS.find(e => e.id === id) || null;
    let modal = null; const conf = [];
    t.ui.modal = o => new Promise(res => { modal = { ...o, fechar: res }; if (o.aoAbrir) o.aoAbrir({ fechar: res, erro() {} }); });
    t.ui.confirmar = async o => { conf.push(o); return false; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 7, {});
    assert.equal(el.querySelector(".ng-mini i").attrs["aria-hidden"], "true", "RB-103");
    el.querySelector(".emp-ligar").clique(); await tique();
    const busca = modal.corpo.querySelector('input[type="search"]');
    busca.value = "Ra"; busca.dispara("input"); await varias();
    const [b501, b502] = modal.corpo.querySelectorAll(".crm-busca-res button");
    assert.equal(b502.disabled, false, "antes: disabled (sumia do Tab)");
    assert.equal(b502.attrs["aria-disabled"], "true");
    b502.clique(); await varias();
    b501.clique(); await varias();
    assert.equal(conf.length, 1);
    assert.equal(conf[0].titulo, "Mover de «Outra» para «Frota X»?");
    assert.equal(t.cham("nx_contato_salvar").length, 0, "recusou: nada gravado (antes gravava direto)");
    assert.equal(modal.corpo.querySelector(".crm-busca-res").getAttribute("role"), "group", "RB-052: sem listbox");
  } finally { D.desfazer(); }
});

/* ---------- (b) Tarefas ---------- */
test("RB-115 tarefas (DOM): o círculo de concluir na gaveta/ficha religa sozinho quando a internet volta", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const k = { ui, h, L, v: V, base: { usuarios: [] }, pode: () => true, eu: () => "u1", toastErro() {}, nomes: () => ({}), motivosPorId: () => ({}), rascunho: () => ({ apagar() {} }), api: { rpcC: async () => ({}) } };
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    const bloco = h0(D, "div", null, T.blocoTarefas(k, { tarefas: [{ id: 71, titulo: "Ligar", tipo: "ligacao", vence_em: "2099-01-10T15:00:00Z" }], negocio_id: 801 }));
    const ck = bloco.querySelector(".tf-check input");
    assert.equal(ck.disabled, true);
    globalThis.navigator.onLine = true;
    D.janela("online");
    assert.equal(ck.disabled, false, "antes: só a tela #/tarefas ouvia a volta da internet");
    assert.equal(ck.getAttribute("title"), null);
    globalThis.navigator.onLine = false;
    D.janela("offline");
    assert.equal(ck.disabled, true);
    // quem não pode concluir continua desligado quando a internet volta
    const kLeit = { ...k, pode: () => false };
    const b2 = h0(D, "div", null, T.blocoTarefas(kLeit, { tarefas: [{ id: 72, titulo: "Ver", tipo: "tarefa", vence_em: null }] }));
    globalThis.navigator.onLine = true; D.janela("online");
    assert.equal(b2.querySelector(".tf-check input").disabled, true);
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); else delete globalThis.navigator; D.desfazer(); }
});

test("RB-119/123/233 Tarefas (DOM): preferências por empresa e conta; «Nova tarefa»; o aviso das 200 serve para a aba", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const itens = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, titulo: `T${i}`, tipo: "tarefa", vence_em: new Date(Date.now() + (i + 2) * 86400000).toISOString() }));
    const mk = conta => ({ ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => conta, toastErro() {}, ctx: { titulo() {}, navegar() {}, cliente: { id: "cli-t" } },
      api: { rpcC: async () => ({ itens, tem_mais: true, contagens: { hoje: 0, atrasadas: 0, proximas: 250 } }) } });
    D.storage.set("nx-app-tarefas-aba", "proximas");
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(mk("u1"), tela, { query: {} });
    assert.equal(D.storage.get("nx-app-tarefas-aba-cli-t-u1"), "proximas", "a escolha antiga migra para a conta");
    assert.equal(D.storage.has("nx-app-tarefas-aba"), false);
    assert.ok(tela.querySelectorAll("button").some(b => b.textContent === "Nova tarefa"), "antes: «Tarefa»");
    assert.match(tela.textContent, /Mostrando as 3 primeiras\. Use a visão Semana para ver menos de cada vez\./);
    assert.equal(T.textoTarefasDeMais("proximas", 200, true), "Mostrando as 200 primeiras. Use «Minhas» ou a visão Semana para ver menos de cada vez.");
    assert.doesNotMatch(tela.textContent, /Conclua algumas/, "antes: «conclua algumas» até em Próximas");
    api.desmontar();
    const tela2 = h0(D, "div", { class: "crm" });
    const api2 = await T.montarTarefas(mk("u2"), tela2, { query: {} });
    assert.equal(tela2.querySelector(".tfp-pn-hoje").attrs["aria-pressed"], "true", "a outra conta não herda «Próximas»");
    api2.desmontar();
    assert.match(T.textoTarefasDeMais("atrasadas", 200, false), /^Mostrando as 200 primeiras\. Conclua ou adie algumas para ver as outras\.$/);
    assert.equal(T.textoTarefasDeMais("concluidas", 200, false), "Mostrando as 200 primeiras.");
    const bl = h0(D, "div", null, T.blocoTarefas(mk("u1"), { tarefas: [] }));
    assert.ok(bl.querySelectorAll("button").some(b => b.textContent === "Nova tarefa"));
  } finally { D.desfazer(); }
});

test("RB-237 nova tarefa (DOM): escolhido o contato, dá para ligar também a um negócio aberto dele", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const chamadas = [];
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, erro: e => String(e), ctx: { titulo() {}, navegar() {} }, rascunho: () => ({ apagar() {} }), novaReq: () => "r1",
      api: { rpcC: async (n, p) => { chamadas.push({ n, p });
        if (n === "nx_contatos_listar") return { itens: [{ id: 501, nome: "Mariana Costa" }] };
        if (n === "nx_contato_ver") return { contato: { id: 501 }, negocios: [{ id: 801, titulo: "Alinhador", status: "aberto" }, { id: 802, titulo: "Antigo", status: "ganho" }] };
        return {}; } },
      escrever: async (n, p) => { chamadas.push({ n, p }); return { resultado: { id: 99, ...p.p_tarefa } }; } };
    ui.lerForm = () => ({ titulo: "Ligar", tipo: "ligacao" });
    let opcoes = null;
    ui.modal = async o => {
      const busca = o.corpo.querySelector(".tf-ligar-busca");
      busca.value = "mari"; busca.dispara("input"); await varias();
      o.corpo.querySelector('.crm-busca-res button[data-id="501"]').clique(); await varias();
      const sel = o.corpo.querySelector(".tf-ligar-neg-sel");
      opcoes = sel.els.map(x => x.value);
      sel.value = "801";
      return o.acoes.find(a => a.tipo === "primario").fn({ erro() {} });
    };
    const nova = await T.formTarefa(k, null, {});
    assert.deepEqual(opcoes, ["", "801"], "só os abertos (o ganho não entra)");
    assert.equal(nova.contato_id, 501);
    assert.equal(nova.negocio_id, 801, "antes: só dava para ligar ao contato");
  } finally { D.desfazer(); }
});

/* ---------- (b) Importação ---------- */
async function montarImpCom(D, { funis, uix = {} } = {}) {
  const { h } = D;
  const reg = { chamadas: [] };
  const ui = uiDeMentira(h, reg);
  Object.assign(ui, uix);
  const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis };
  const k = { ui, h, L, base, v: V, ctx: { cliente: { id: "cli-i" }, titulo() {}, navegar() {} }, api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); return {}; } },
    pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis.find(f => f.ativo !== false) || null,
    estagio: () => null, etiqueta: () => null, usuario: () => null, recarregarBase: async () => base, criarEtiqueta: async () => null };
  const { montarImportar } = await import("../web/app/crm-importar.js");
  const tela = h0(D, "div", { class: "crm" });
  const api = await montarImportar(k, tela, {});
  const botao = txt => tela.querySelectorAll("button").find(b => b.textContent.trim() === txt || b.textContent.trim().startsWith(txt));
  return { tela, api, reg, botao };
}

test("RB-071/130 Importação (DOM): cabeçalho repetido ganha «(2ª)» e aviso; repetidos com o termo da vertical", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    t.tela.querySelector("textarea").value = "Nome;Nome;Telefone\nAna;Souza;(12) 99830-3030\nBia;Lima;(12) 99830-3030\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique();
    assert.ok(t.tela.querySelector(".imp-aviso-rep"), "antes: duas colunas «Nome» sem dizer qual é qual");
    assert.deepEqual(t.tela.querySelectorAll(".imp-mapa-col b").map(b => b.textContent), ["Nome", "Nome (2ª)", "Telefone"]);
    t.botao("Continuar").clique(); await varias();
    assert.match(t.tela.querySelector(".imp-aviso-dup").textContent, /^1 paciente aparece mais de uma vez/);
  } finally { D.desfazer(); }
});

test("RB-129 Importação (DOM): «Lendo a planilha…» aparece antes de a leitura ocupar a tela", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    const bytes = new TextEncoder().encode("Nome;Telefone\nAna;(12) 99830-3030\n");
    const f = { name: "base.csv", size: bytes.length, type: "text/csv", slice: () => ({ arrayBuffer: async () => bytes.slice(0, 2).buffer }), arrayBuffer: async () => bytes.buffer };
    const entrada = t.tela.querySelector('input[type="file"]');
    entrada.files = [f];
    entrada.dispara("change");
    await varias(4);
    assert.match(t.tela.querySelector(".imp-arq").textContent, /Lendo a planilha «base\.csv»…/, "antes: a tela congelava sem estado");
    await esperar(160);
    assert.match(t.tela.querySelector(".imp-arq small").textContent, /^1 linha · 2 colunas/);
  } finally { D.desfazer(); }
});

test("RB-134 Importação (DOM): sem funil ativo o «Criar negócio» fica desligado e explica", async () => {
  const D = domDeMentira();
  try {
    const ajudas = [];
    const t = await montarImpCom(D, { funis: [{ id: "f1", nome: "Velho", ativo: false, estagios: [{ id: "s1", nome: "Nova", tipo: "aberto" }] }],
      uix: { campo: o => { if (o.nome === "negocio") ajudas.push(o); return uiDeMentira(D.h).campo(o); } } });
    t.tela.querySelector("textarea").value = "Nome;Título\nAna;Avaliação\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique();
    t.botao("Continuar").clique(); await varias();
    const neg = t.tela.querySelector('[name="negocio"]');
    assert.equal(neg.checked, false, "antes: o mapa com título ligava o interruptor e o pedido ia sem negócio, calado");
    assert.equal(neg.disabled, true);
    assert.match(ajudas.at(-1).ajuda, /^Crie um funil antes/);
  } finally { D.desfazer(); }
});

/* ---------- (b) Configurações ---------- */
test("RB-241/144 Funis (DOM): a cópia avisa que nasce fora dos anúncios; o botão de cor diz a cor", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    t.alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pacientes").clique();
    await t.reg.menus["Mais ações para Pacientes"].find(x => x && x.rotulo === "Duplicar").fn(); await varias();
    assert.match(t.alvo.querySelector(".fe-nota-copia").textContent, /fora dos anúncios.*Conta nos anúncios/);
    const cores = t.alvo.querySelectorAll(".fe-cor").map(b => b.attrs["aria-label"]);
    // plano 1500c: RC-149 — o leitor ouve o NOME da cor (código hexadecimal não diz nada); #111111 não é da paleta → «cor personalizada»
    assert.equal(cores[0], "Cor da etapa Novo: cor personalizada", "antes: só «Cor da etapa Novo»");
    assert.equal(cores[1], "Cor da etapa Avaliação: sem cor");
  } finally { D.desfazer(); }
});

test("RB-139/149 Campos (DOM): opções repetidas viram uma (com aviso); a chave interna sai da lista", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const reg = { chamadas: [], toasts: [] };
    ui.toast = x => { reg.toasts.push(x); return { fechar() {} }; };
    ui.lerForm = () => ({ rotulo: "Plano", tipo: "opcao", opcoes: "Unimed\nunimed\nB" });
    ui.modal = async o => o.acoes.find(a => a.tipo === "primario").fn({ erro() {} });
    const base = { funis: [], campos: [{ id: 1, chave: "convenio", rotulo: "Convênio", tipo: "texto", entidade: "contato" }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: async (n, p) => { reg.chamadas.push({ n, p }); return { id: 2 }; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvo);
    const item = alvo.querySelector(".crm-cfg-item");
    assert.equal(item.querySelector(".crm-cfg-chave"), null, "antes: « · convenio» em mono na lista");
    assert.ok(!item.textContent.includes("convenio"));
    assert.equal(item.attrs.title, "Chave interna: convenio");
    alvo.querySelectorAll("button").find(b => b.textContent.trim() === "Campo").clique(); await varias();
    assert.deepEqual(reg.chamadas.find(c => c.n === "nx_campo_salvar").p.p_campo.opcoes, ["Unimed", "B"], "antes: «Unimed» duas vezes");
    assert.ok(reg.toasts.includes("Opções repetidas foram unidas (1)."));
  } finally { D.desfazer(); }
});

test("RB-198/204/052 estáticos: legenda «Campo personalizado»; opções dos Filtros com 44 px no toque; nenhuma busca com listbox", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const g = VisReal.grupoFiltroCampo({ ui, h, L, base: { campos: [{ chave: "conv", rotulo: "Convênio", tipo: "texto", entidade: "negocio" }] } }, { entidade: "negocio" });
    assert.equal(g.el.querySelector("legend").textContent, "Campo personalizado", "antes: «Campo»");
  } finally { D.desfazer(); }
  const css = ler("crm.css");
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\) \{ \.crm-op > span \{ min-height: 44px; \} \}/);
  for (const arq of ["crm-negocio.js", "crm-tarefas.js", "crm-listas.js"]) {
    assert.equal(/role: "listbox"|role: "option"/.test(ler(arq)), false, `${arq}: sem listbox/option sem teclado`);
  }
});


/* ============================================================ lote crm-2 — testes
   (a) lógica pura: visão com período dos fechados e sem a busca, filtro vazio não salva, dias de calendário, Ligar para número de fora, CNPJ
       alfanumérico, nome de funil repetido, chance da etapa nova, nascimento com 2 dígitos/futuro, RG, site com porta, origem por plataforma,
       duplicado com «+», textos (linha do tempo, chips, vazio, ganhos da empresa, exemplos por vertical, dados do titular), código de suporte;
   (b) DOM: quadro (movida, base relida uma vez, vazio sem Conversas, valor «1.500,00», seleção no toque, lote sem data, instrução no quadro,
       resumo sem reanimar, chip de pessoa removida, filtro salvo com 90 dias), crm.js (pontes e cartão de erro), gaveta (Esc, termos, data,
       e-mail, exemplo), Contatos/ficha/empresa, Tarefas, Configurações e Importação. */

/* ---------- (a) lógica pura ---------- */
const VOC = await import("../web/app/vocab.js");
test("RB-004/234 visão do quadro guarda o período dos fechados (90 dias) e NUNCA a busca; a busca digitada apaga o indicador", () => {
  const r = L.salvarVisaoCRM([], "kanban", { nome: "Fechados 90", dados: { funil: "f1", filtro: { busca: "Ana 12 99830", dono: "eu" }, todosFechados: false, fechadosDias: 90 } }, { idNovo: "v1" });
  assert.equal(r.ok, true);
  assert.equal(r.visao.dados.fechadosDias, 90, "antes: só todosFechados — voltava 30");
  assert.equal(r.visao.dados.filtro.busca, undefined, "antes: o nome/telefone digitado ficava gravado no aparelho");
  assert.equal(L.aplicarVisaoCRM(r.visoes, "kanban", "v1").dados.fechadosDias, 90);
  // visão antiga (sem fechadosDias) continua: todos → 0, senão 30
  assert.equal(L.normalizarVisoesCRM([{ id: "v2", nome: "Antiga", dados: { funil: "f1", filtro: {}, todosFechados: true } }], "kanban")[0].dados.fechadosDias, 0);
  assert.equal(L.visaoCorrespondenteCRM(r.visoes, "kanban", { funil: "f1", filtro: { dono: "eu" }, fechadosDias: 90 }), "v1");
  assert.equal(L.visaoCorrespondenteCRM(r.visoes, "kanban", { funil: "f1", filtro: { dono: "eu" }, fechadosDias: 30 }), "", "outro período é outro estado");
  assert.equal(L.visaoCorrespondenteCRM(r.visoes, "kanban", { funil: "f1", filtro: { dono: "eu", busca: "x" }, fechadosDias: 90 }), "");
});

test("RB-199 visaoSemFiltroCRM: nada para salvar (só busca, 30 dias, funil padrão, ordem recentes) × algo escolhido", () => {
  assert.equal(L.visaoSemFiltroCRM({ funil: "f1", filtro: { busca: "ana" }, fechadosDias: 30 }, "kanban", { funilPadrao: "f1" }), true);
  assert.equal(L.visaoSemFiltroCRM({ funil: "f1", filtro: {}, fechadosDias: 90 }, "kanban", { funilPadrao: "f1" }), false, "90 dias é escolha");
  assert.equal(L.visaoSemFiltroCRM({ funil: "f2", filtro: {}, fechadosDias: 30 }, "kanban", { funilPadrao: "f1" }), false, "outro funil é escolha");
  assert.equal(L.visaoSemFiltroCRM({ funil: "f1", filtro: { dono: "eu" } }, "kanban", { funilPadrao: "f1" }), false);
  assert.equal(L.visaoSemFiltroCRM({ filtro: {}, ordem: "recentes" }, "contatos"), true);
  assert.equal(L.visaoSemFiltroCRM({ filtro: {}, ordem: "nome" }, "contatos"), false);
});

test("RB-065 «há N dias na etapa» conta dias do calendário de São Paulo, não blocos de 24 h", () => {
  // ontem 23h de SP (02:00Z de hoje) → hoje 08h de SP (11:00Z): 9 h depois, mas é OUTRO dia
  assert.equal(L.diasEntre("2026-10-14T02:00:00Z", "2026-10-14T11:00:00Z"), 1, "antes: 0 («hoje na etapa»)");
  assert.equal(L.textoDiasEtapa("2026-10-14T02:00:00Z", new Date("2026-10-14T11:00:00Z")), "há 1 dia na etapa");
  assert.equal(L.diasEntre("2026-10-14T11:00:00Z", "2026-10-14T23:00:00Z"), 0, "mesmo dia em SP");
  assert.equal(L.diasEntre("2026-10-01T15:00:00Z", "2026-10-15T15:00:00Z"), 14);
  assert.equal(L.diasEntre("x", "2026-10-15T15:00:00Z"), null);
});

test("RB-069 Ligar: número de fora guardado com DDI não ganha 55; o brasileiro sem 55 ganha", () => {
  assert.equal(L.hrefTel("12125551234"), "tel:+12125551234", "antes: tel:+5512125551234");
  assert.equal(L.hrefTel("12998303030"), "tel:+5512998303030");
  assert.equal(L.hrefTel("5512998303030"), "tel:+5512998303030");
  assert.equal(L.hrefTel("351912345678901"), "tel:+351912345678901", "até 15 dígitos (E.164)");
  assert.equal(L.hrefTel("123"), null);
});

test("RB-093 CNPJ alfanumérico: dígito verificador pela regra nova (ASCII − 48), máscara com as letras; CPF continua só número", () => {
  // exemplo da Receita: 12.ABC.345/01DE-35
  assert.equal(L.docValido("12.ABC.345/01DE-35"), "cnpj", "antes: null (as letras sumiam)");
  assert.equal(L.docValido("12abc34501de35"), "cnpj", "minúsculas valem");
  assert.equal(L.docValido("12.ABC.345/01DE-36"), null, "dígito errado");
  assert.equal(L.formatarDoc("12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(L.avisoDoc("12.ABC.345/01DE-35"), null);
  assert.match(L.avisoDoc("12.ABC.345/01DE-36"), /CNPJ com dígito verificador/);
  assert.equal(L.docValido("11.222.333/0001-81"), "cnpj", "o CNPJ só de números segue igual");
  assert.equal(L.docValido("529.982.247-25"), "cpf");
  const src = ler("crm-listas.js");
  assert.match(src, /rotulo: "CPF \/ CNPJ"[^\n]*inputmode: "text"/, "antes: teclado numérico — sem letras");
});

test("RB-146 nome de outro funil (sem acento/maiúscula) é recusado antes de salvar; o próprio funil não conta", () => {
  const est = [{ nome: "A", tipo: "aberto" }, { nome: "G", tipo: "ganho" }, { nome: "P", tipo: "perdido" }];
  const outros = [{ id: "f1", nome: "Pós-venda" }, { id: "f2", nome: "Pacientes" }];
  const e = L.validarFunil({ nome: "pos-VENDA", estagios: est }, { outros });
  assert.deepEqual(e.map(x => x.hint), ["nome_em_uso"]);
  assert.equal(e[0].texto, "Já existe um funil com esse nome.");
  assert.deepEqual(L.validarFunil({ id: "f1", nome: "Pós-venda", estagios: est }, { outros }), [], "editando ele mesmo");
  assert.deepEqual(L.validarFunil({ nome: "Pós-venda", estagios: est }), [], "sem a lista, como antes");
});

test("RB-242 chance da etapa nova acompanha a posição (antes: 10% fixo)", () => {
  const et = [{ tipo: "aberto", probabilidade: 10 }, { tipo: "aberto", probabilidade: 40 }, { tipo: "ganho", probabilidade: 100 }, { tipo: "perdido", probabilidade: 0 }];
  assert.equal(L.probNovaEtapa(et, 2), 70, "entre 40 e o fechamento");
  assert.equal(L.probNovaEtapa(et, 1), 25, "entre duas abertas");
  assert.equal(L.probNovaEtapa(et, 0), 10, "sem aberta antes");
  assert.equal(L.probNovaEtapa([{ tipo: "aberto", probabilidade: 99 }], 1), 99, "nunca 100 numa aberta");
});

test("RB-249 nascimento: «05/03/28» é 1928 (não 2028) e nascimento no futuro é recusado na prévia", () => {
  const anoQueVem = String((new Date().getUTCFullYear() + 1) % 100).padStart(2, "0");
  assert.equal(L.lerData(`05/03/${anoQueVem}`, { passado: true }).slice(0, 2), "19", "antes: 20xx — nasceu no futuro");
  assert.equal(L.lerData("05/03/15", { passado: true }), "2015-03-05");
  assert.equal(L.lerData("05/03/28"), "2028-03-05", "fora do nascimento a regra antiga continua");
  const [linha] = L.montarLinhas([["Ana", `05/03/${anoQueVem}`]], ["nome", "nascimento"]);
  assert.match(linha.nascimento, /^19\d\d-03-05$/, "a linha vai com a data já no século certo");
  const fut = `${new Date().getUTCFullYear() + 1}-01-10`;
  assert.deepEqual(L.checarLinha({ nome: "Ana", nascimento: fut }), ["Nascimento no futuro: confira a data"]);
  assert.deepEqual(L.checarLinha({ nome: "Ana", nascimento: "02-03-90" }), []);
});

test("RB-072/077/082/086 RG fica «Ignorar»; site com porta vira link; anúncio pela plataforma; duplicado com «+» até 15 dígitos", () => {
  assert.deepEqual(L.sugerirMapeamento(["Nome", "RG", "CPF"]), ["nome", null, "documento"], "antes: RG virava documento");
  assert.equal(L.normalizarSite("site.com.br:8080"), "https://site.com.br:8080", "antes: null");
  assert.equal(L.normalizarSite("javascript:alert(1)"), null);
  assert.equal(L.normalizarSite("mailto:a@b.com"), null);
  const cards = [{ id: 1, origem: "whatsapp", plataforma: "meta" }, { id: 2, origem: "whatsapp" }, { id: 3, origem: "anuncio" }];
  assert.deepEqual(L.filtrar(cards, { origem: ["anuncio"] }).map(c => c.id), [1, 3], "antes: o lead de anúncio com origem whatsapp ficava fora");
  const itens = [{ id: 7, telefone: "35191234567890" }];
  assert.equal(L.acharDuplicado(itens, "+351 9123 4567 890").id, 7, "antes: 14 dígitos nunca conferiam");
  assert.equal(L.acharDuplicado(itens, "35191234567890"), null, "sem «+» o teto continua 13");
  assert.equal(L.digitosDuplicado("+351 9123 4567 890"), "35191234567890");
  assert.equal(L.digitosDuplicado("(12) 99830-3030"), "12998303030");
});

test("RB-044/029/213/227/120 textos: linha do tempo com o nome da etapa; chip de pessoa removida; vazio com a busca; ganhos da empresa por vertical", () => {
  const vocab = { min: () => "oportunidade", art: () => "a", ganhar: "Fechou", perder: "Não fechou" };
  assert.equal(L.textoTempo({ tipo: "perdido", dados: {} }, { vocab }), "Marcou como «Não fechou»", "antes: «Marcou como não fechou»");
  assert.equal(L.textoChipDono("u9", null), "Responsável: pessoa removida", "antes: «Responsável: —»");
  assert.equal(L.textoChipDono("u1", { nome: "Helena" }), "Responsável: Helena");
  assert.equal(L.textoChipDono("eu"), "Responsável: eu");
  assert.equal(L.textoSemResultado({ busca: " ana " }), "Nada encontrado para «ana».");
  assert.equal(L.textoSemResultado({ busca: "ana", dono: "eu" }), "Nada encontrado com esses filtros.");
  assert.equal(L.textoSemResultado({}), "Nada encontrado com esses filtros.");
  const Vc = vert => VOC.vocab(vert);   // o vocabulário de verdade (vocab.js) da vertical
  assert.equal(L.textoGanhosEmpresa(1, Vc("odonto")), "fechada");
  assert.equal(L.textoGanhosEmpresa(2, Vc("odonto")), "fechadas", "antes: «fechous»");
  assert.equal(L.textoGanhosEmpresa(2, Vc("oficina")), "aprovados");
  assert.equal(L.textoGanhosEmpresa(1, Vc("loja")), "vendida");
  assert.equal(L.textoGanhosEmpresa(0, Vc("generico")), "ganhos");
  assert.equal(L.AUTOR_AUTOMATICO, "Automático");
  const T = ler("crm-tarefas.js");
  assert.equal(/"Sistema"|" · sistema"/.test(T), false, "antes: «Sistema» nas notas e «sistema» na linha do tempo");
});

test("RB-042/136 exemplos por vertical: a oficina não vê «Implante superior» nem «dentista responsável»", () => {
  assert.equal(L.exemploTituloNegocio("odonto"), "Implante superior");
  assert.equal(L.exemploTituloNegocio("oficina"), "Troca de embreagem");
  assert.equal(L.exemploTituloNegocio("loja"), "Kit presente");
  assert.equal(L.exemploTituloNegocio("qualquer"), "Proposta mensal");
  for (const v of ["oficina", "loja", "generico"]) {
    const ex = L.exemplosVertical(v);
    assert.equal(/dentist|Implante|dentes/i.test(`${ex.campos} ${ex.campo} ${ex.etiquetas}`), false, v);
  }
  const C = ler("crm-config.js");
  assert.equal(/dentista responsável|Dentista responsável|Implante, Urgência/.test(C), false, "os três textos vêm da tabela");
  assert.equal(/"Implante superior"/.test(ler("crm-negocio.js")), false);
});

test("RB-221/191 semCodigoTecnico e codigoSuporte: a frase sai limpa; «Failed to fetch» não é código", () => {
  assert.equal(L.semCodigoTecnico("Não deu certo agora (http_500). Tente de novo."), "Não deu certo agora. Tente de novo.");
  assert.equal(L.semCodigoTecnico("Não deu certo agora. Tente de novo."), "Não deu certo agora. Tente de novo.", "sem parênteses fica igual");
  assert.equal(L.semCodigoTecnico("Telefone inválido (DDD)."), "Telefone inválido (DDD).", "só tira o código da frase genérica");
  assert.equal(L.semCodigoTecnico(null), "");
  assert.equal(L.codigoSuporte({ status: 503 }), "http_503");
  assert.equal(L.codigoSuporte({ codigo: "sessao_invalida", status: 401 }), "sessao_invalida");
  assert.equal(L.codigoSuporte({ message: "Failed to fetch" }), null, "antes: «Failed to fetch» virava código");
});

test("RB-263 dados do titular legíveis: seções com título, sem chaves técnicas", () => {
  const d = L.dadosTitular({ contato: { id: 5, nome: "Ana", telefone: "5512998303030", origem: "whatsapp", optin_marketing: false, optin_em: "2026-10-01T12:00:00Z", campos: { convenio: "Unimed" } },
    negocios: [{ id: 9, titulo: "Implante", status: "aberto", valor_previsto: 3500, criado_em: "2026-10-02T12:00:00Z" }], notas: [{ id: 1, texto: "prefere manhã", criado_em: "2026-10-03T12:00:00Z" }] }, { geradoEm: "2026-10-15T12:00:00Z" });
  const txt = L.textoTitular(d, { data: v => String(v).slice(0, 10), brl: v => `R$ ${v}`, vocab: { negocios: "Oportunidades" } });
  for (const s of ["Dados de Ana", "CADASTRO", "Nome: Ana", "Origem: WhatsApp", "convenio: Unimed", "CONSENTIMENTO DE MARKETING", "Não quer receber marketing",
    // plano 1500c: RC-024 — o status sai em português («Em andamento»), não a chave técnica «aberto»
    "OPORTUNIDADES", "- Implante (Em andamento) · R$ 3500 · 2026-10-02", "NOTAS", "- 2026-10-03: prefere manhã", "TAREFAS", "(nada registrado)"]) assert.ok(txt.includes(s), s);
  assert.equal(/optin_marketing|"cadastro"|\{/.test(txt), false, "sem JSON nem chaves");
});

/* ---------- (b) Kanban ---------- */
test("RB-008/034/016 Kanban (DOM): «movida» no feminino; a instrução longa no quadro (não no cartão); vazio sem Conversas não promete WhatsApp", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio() });
    const kb = t.tela.querySelector(".kb");
    assert.match(kb.attrs["aria-describedby"] || "", /^kb-instr-/, "o quadro aponta para a instrução");
    assert.equal(/kb-instr-/.test(t.cartao(1).attrs["aria-describedby"] || ""), false, "antes: lida a cada cartão focado pelas setas");
    assert.match(ler("crm-kanban.js"), /movid\$\{k\.v\.art\("negocio"\)\} para \$\{destino\.nome\}/);
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: quadroDe() });
    const vazio = t2.tela.querySelector(".vazio");
    assert.ok(vazio, "quadro vazio");
    t2.api.desmontar();
    assert.match(ler("crm-kanban.js"), /comConversas \? `\$\{fem \? "Elas aparecem sozinhas"/, "o texto do WhatsApp só com o módulo");
  } finally { D.desfazer(); }
});

test("RB-012 Kanban (DOM): etiqueta excluída que ficou no cartão relê a base UMA vez (não a cada minuto para sempre)", async () => {
  const D = domDeMentira();
  try {
    let releituras = 0;
    const dados = quadroDe({ s1: col("s1", cartoes(1, "s1", 1, { etiquetas: ["e-apagada"] })) });
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    try {
      const t = await montarKb(D, { dados, kx: { recarregarBase: async () => { releituras++; return null; } } });
      await varias();
      assert.equal(releituras, 1, "1ª vez: pode ser etiqueta nova de outra pessoa");
      mock.timers.tick(61000);
      // redesenho forçado depois de 1 min: o mesmo id desconhecido não pede de novo
      t.trocar(JSON.parse(JSON.stringify({ ...dados, colunas: dados.colunas.map(c => ({ ...c, itens: c.itens.map(i => ({ ...i, titulo: i.titulo + "!" })) })) })));
      if (t.reg.pulso) await t.reg.pulso(); await varias();
      assert.equal(releituras, 1, "antes: relia a base a cada 60 s para sempre");
      t.api.desmontar();
    } finally { mock.timers.reset(); }
  } finally { D.desfazer(); }
});

test("RB-205/025 Kanban (DOM): «Selecionar vários» na folha «Mover para…» liga a seleção pelo toque; lote para etapa com data avisa «sem data»", async () => {
  const D = domDeMentira();
  try {
    const respostas = [];
    const modal = async o => new Promise(res => {
      const api = { fechar: v => res(v), erro() {} };
      if (o.aoAbrir) o.aoAbrir(api);
      const r = respostas.shift();
      if (typeof r === "function") r(o, api); else res(r);
    });
    const t = await montarKb(D, { dados: kbVazio(), uix: { modal } });
    respostas.push((o, api) => { const b = o.corpo.querySelector(".kb-mover-sel"); assert.ok(b, "antes: não existia — no toque não há Shift"); b.clique(); });
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    assert.equal(t.tela.querySelector(".crm-sel").hidden, false, "a barra «Mover para…» em lote aparece");
    t.cartao(2).dispara("click", { target: t.cartao(2) });       // toque comum, sem Shift
    assert.equal(t.tela.querySelector(".crm-sel-n").textContent, "2 selecionados");
    respostas.push("s2");                                          // Agendada (marco agendada)
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(10);
    assert.deepEqual(t.reg.movidos.map(m => m.dest), ["s2", "s2"]);
    assert.match(t.reg.desfazer.at(-1).texto, /para «Agendada» — sem data marcada: abra cada um para agendar\./, "antes: o aviso não dizia que ficaram sem data");
    t.cartao(1).dispara("click", { target: t.cartao(1) });
    assert.deepEqual(t.reg.abertos, [1], "depois do lote, o toque volta a abrir (modo seleção desligado)");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-020/029 Kanban (DOM): valor «1.500,00» no filtro vira 1500 (texto com teclado decimal); chip de responsável removido", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-kb-cli-p1000-u1", JSON.stringify({ filtro: { dono: "u-saiu" } }));
    const t = await montarKb(D, { dados: kbVazio() });
    assert.ok(t.tela.querySelectorAll(".crm-chip").some(c => c.textContent.includes("Responsável: pessoa removida")), "antes: «Responsável: —»");
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    const corpo = t.reg.flut.conteudo;
    const vMin = corpo.querySelectorAll("input").find(x => x.attrs["aria-label"] === "Valor mínimo");
    assert.equal(vMin.attrs.type, "text", "antes: type=number (não aceita «1.500,00»; 75 ficava :invalid pelo passo 50)");
    assert.equal(vMin.attrs.inputmode, "decimal");
    vMin.value = "1.500,00";
    botaoTxt(corpo, /^Aplicar/).clique(); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.valor_min, 1500);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-004 Kanban (DOM): aplicar um filtro salvo com «90 dias» pede os fechados de 90 dias (antes voltava 30)", async () => {
  const D = domDeMentira();
  try {
    const salvo = L.salvarVisaoCRM([], "kanban", { nome: "Noventa", dados: { funil: "f1", filtro: { dono: "eu" }, fechadosDias: 90 } }, { idNovo: "v90" }).visoes;
    D.storage.set(L.chaveVisoesCRM("cli-p1000", "u1", "kanban"), JSON.stringify(salvo));
    let ctl = null;
    const t = await montarKb(D, { dados: kbVazio(), modx: { visoes: { ...VisReal, controlesVisoes: (k, o) => { ctl = o; return VisReal.controlesVisoes(k, o); } } } });
    await ctl.aplicar(L.aplicarVisaoCRM(salvo, "kanban", "v90").dados); await varias();
    assert.equal(ctl.obterDados().fechadosDias, 90);
    t.api.recarregar ? await t.api.recarregar() : null; await varias();
    assert.ok(t.chamadas("nx_negocios_kanban").some(c => c.p.p_filtro.fechados_dias === 90), "o quadro pede 90 dias");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-030 Kanban: o resumo do funil anima só na 1ª pintura de cada funil (a recarga silenciosa não refaz o «crescer»)", () => {
  const src = ler("crm-kanban.js");
  assert.equal(/if \(!reduzido\(\)\) resLista\.classList\.add\("anim"\);/.test(src), false, "antes: .anim a cada redesenho (pulso de 8 s)");
  assert.match(src, /S\.resumoAnimado !== chaveAnim/);
});

/* ---------- (b) visões ---------- */
test("RB-199 Filtros salvos (DOM): sem filtro nenhum o «Salvar filtro» avisa em vez de abrir o formulário", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    let abriu = 0; ui.modal = async () => { abriu++; return null; };
    let dados = { funil: "f1", filtro: { busca: "ana" }, fechadosDias: 30 };
    const k = { ui, h, L, ctx: { cliente: { id: "c199" } }, eu: () => "u1", funilPadrao: () => ({ id: "f1" }) };
    const c = VisReal.controlesVisoes(k, { tipo: "kanban", obterDados: () => dados, aplicar: async () => {} });
    c.el.querySelector(".crm-visoes-salvar").clique(); await varias();
    assert.equal(abriu, 0, "antes: deixava salvar o estado vazio");
    assert.equal(reg.toasts.at(-1), "Escolha algum filtro antes de salvar.");
    dados = { funil: "f1", filtro: { dono: "eu" }, fechadosDias: 30 };
    c.el.querySelector(".crm-visoes-salvar").clique(); await varias();
    assert.equal(abriu, 1);
  } finally { D.desfazer(); }
});

/* ---------- (b) crm.js ---------- */
test("RB-195/191 crm.js: as pontes não rejeitam (erro vira aviso, retorno null); o cartão de erro não mostra «código Failed to fetch»", async () => {
  const D = domDeMentira();
  const erroAntes = console.error, avisoAntes = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    const CRM = await import("../web/app/crm.js");
    const toasts = [];
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: {} }, cli: "c195", rpc: () => { throw new TypeError("Failed to fetch"); } });
    ctx.ui.toast = (t, o) => { toasts.push({ t, o }); return { fechar() {} }; };
    CRM.invalidarBase("c195");
    const r = await CRM.abrirNegocio(ctx, 77);
    assert.equal(r, null, "antes: Uncaught (in promise) e nada na tela");
    assert.equal(toasts.at(-1).o.tipo, "erro");
    assert.equal(await CRM.abrirContato(ctx, 5), null);
    assert.equal(await CRM.novoNegocio(ctx, {}), null);
    await CRM.montar(ctx); await varias();
    const card = ctx.alvo.querySelector(".erro-cartao");
    assert.ok(card, "a tela mostra o cartão de erro");
    assert.equal(/código Failed to fetch/.test(card.textContent), false, "antes: «código Failed to fetch»");
    CRM.desmontar();
  } finally { console.error = erroAntes; console.warn = avisoAntes; D.desfazer(); }
});

/* ---------- (b) gaveta e novo negócio ---------- */
test("RB-057/049 gaveta (DOM): Esc num campo mudado não fecha a gaveta; termos da vertical («esta oportunidade»)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { obs: "" } });
    await varias();
    const obs = t.corpo().querySelectorAll("textarea").find(x => /Observações sobre/.test(x.attrs.placeholder || ""));
    assert.equal(obs.attrs.placeholder, "Observações sobre esta oportunidade", "antes: «este negócio»");
    const inp = t.corpo().querySelectorAll("input").find(x => x.attrs.type === "text" || !x.attrs.type);
    assert.ok(inp, "um campo de texto da gaveta");
    const antes = inp.value;
    inp.value = `${antes}x`;
    let parou = false, evitou = false;
    inp.dispara("keydown", { key: "Escape", stopPropagation() { parou = true; }, preventDefault() { evitou = true; } });
    assert.equal(parou && evitou, true, "antes: o Esc subia para o diálogo e fechava a gaveta");
    assert.equal(inp.value, antes, "o valor volta");
    parou = false;
    inp.dispara("keydown", { key: "Escape", stopPropagation() { parou = true; } });
    assert.equal(parou, false, "sem mudança o Esc segue (fecha a gaveta como sempre)");
  } finally { D.desfazer(); }
});

test("RB-042/053/062 novo negócio (DOM): exemplo da vertical; e-mail conferido no campo; data no passado avisa", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { erros: [] };
    const ui = uiDeMentira(h, reg);
    ui.gaveta = o => { const g = { corpo: h("div", { class: "gaveta-corpo" }), fechar() {} }; D.doc.body.appendChild(g.corpo); reg.g = g; return g; };
    ui.campo = o => h("label", { class: "campo", dataset: { campo: o.nome } }, o.rotulo || "",
      h(o.tipo === "select" ? "select" : "input", { name: o.nome, type: o.tipo === "datahora" ? "datetime-local" : "text", value: o.valor ?? "", placeholder: o.placeholder || null }));
    ui.marcarErro = (f, nome, txt) => { if (nome) reg.erros.push([nome, txt]); };
    ui.lerForm = form => Object.fromEntries(form.querySelectorAll("input,select,textarea").filter(x => x.attrs.name).map(x => [x.attrs.name, x.value]));
    const chamadas = [];
    const Voficina = { ...V, vertical: "oficina", art: () => "o", min: x => x };
    const k = { ui, h, L, v: Voficina, base: { funis: [{ id: "f1", nome: "Orçamentos", padrao: true, ativo: true, estagios: ETAPAS }], usuarios: [], etiquetas: [], campos: [], ticket: {} },
      ctx: { cliente: { id: "c62" } }, eu: () => "u1", pode: () => true, funilPadrao: function () { return this.base.funis[0]; }, funilDoEstagio: function () { return this.base.funis[0]; }, funil: function (id) { return this.base.funis.find(f => f.id === id) || null; }, estagio: id => ETAPAS.find(e => e.id === id), usuario: () => null, etiqueta: () => null,
      api: { rpcC: async (n, p) => { chamadas.push(n); return { itens: [] }; } }, rascunho: () => ({ apagar() {} }), novaReq: () => "r", escrever: async n => { chamadas.push(n); return { resultado: { id: 1 } }; },
      erro: e => String(e), toastErro() {}, criarEtiqueta: async () => null, cor: () => null };
    const N = await import("../web/app/crm-negocio.js");
    N.novoNegocio(k, {}); await varias();
    const corpo = reg.g.corpo;
    const titulo = corpo.querySelector('input[name="titulo"]');
    assert.equal(titulo.attrs.placeholder, "Ex.: Troca de embreagem", "antes: «Ex.: Implante superior» na oficina");
    const cons = corpo.querySelector('input[name="consulta_em"]');
    cons.value = "2020-01-01T10:00"; cons.dispara("change");
    const aviso = corpo.querySelectorAll(".ed-aviso").find(x => !x.hidden);
    assert.ok(aviso && /Essa data já passou/.test(aviso.textContent), "antes: sem aviso no formulário novo (CR-052)");
    const src = ler("crm-negocio.js");
    assert.match(src, /ui\.marcarErro\(form, "c_email", "E-mail inválido/, "RB-053: o e-mail do contato novo é conferido no campo");
  } finally { D.desfazer(); }
});

/* ---------- (b) Contatos, ficha e empresa ---------- */
test("RB-089/209/096 ficha (DOM): depois de mexer num negócio a ficha recarrega SEM esqueleto e mantém a rolagem; «Registrar consentimento»", async () => {
  const D = domDeMentira();
  try {
    let resp = FICHA({ negocios: [{ id: 31, titulo: "Implante", status: "aberto", estagio_id: "s1", funil_id: "f1" }] });
    let pendente = null;
    const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? (pendente ? pendente : JSON.parse(JSON.stringify(resp))) : undefined) });
    let aoMudar = null;
    t.k.estagio = () => null; t.k.funil = () => null;
    t.k.mod = async nome => (nome === "negocio" ? { abrirNegocio: (k, id, o) => { aoMudar = o.aoMudar; }, novoNegocio() {}, linhaEd: (await import("../web/app/crm-negocio.js")).linhaEd, campoPersonalizado() {}, lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) }
      : nome === "tarefas" ? { blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div"), blocoTempo: () => D.h("div"), formTarefa: async () => null } : {});
    const el = h0(D, "div", { class: "crm" });
    const gaveta = { trocarTitulo() {}, fechar() {}, corpo: el };
    await t.M.montarFicha(t.k, el, 501, { gaveta });
    assert.ok(botaoTxt(el, /^Registrar consentimento$/), "antes: só «Registrar»");
    el.querySelector(".ng-mini").clique();
    el.scrollTop = 300;
    let soltar; pendente = new Promise(r => { soltar = r; });
    const p = aoMudar();
    await tique();
    assert.equal(el.querySelector(".esqueleto"), null, "antes: a ficha sumia e voltava com esqueleto");
    soltar({ ...resp, contato: { ...resp.contato, nome: "Ana S." } }); pendente = null;
    await p; await varias();
    assert.equal(el.querySelector(".fx-nome").textContent, "Ana S.");
    assert.equal(el.scrollTop, 300, "a rolagem fica");
  } finally { D.desfazer(); }
  // RB-096: «Não quer marketing» não troca de lugar com a cidade/origem
  const src = ler("crm-listas.js");
  assert.equal(/\|\| \(c\.optin_marketing === false \? "Não quer marketing"/.test(src), false);
  assert.match(src, /ui\.pilula\("Não quer marketing", "aten", \{ class: "ct-optin"/);
});

test("RB-213/108/253 Contatos (DOM): vazio diz a busca; densidade por conta; exportar mais de 2.000 pergunta antes", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    let confirmou = 0;
    const t = await montarCt(D, { lista: { itens: [], total: 0, tem_mais: false } });
    t.ui.confirmar = async () => { confirmou++; return false; };
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    await varias();
    const busca = tela.querySelector('input[type="search"]');
    busca.value = "zé"; busca.dispara("input"); await varias();
    assert.ok(tela.textContent.includes("Nada encontrado para «zé»."), "antes: «Nada encontrado com esses filtros» só com a busca");
    tela.querySelector(".crm-dens").__mudar("compacta");
    assert.equal(D.storage.get("nx-app-crm-ct-dens-cli-ct-u1"), "compacta", "antes: só por empresa");
    if (api && api.desmontar) api.desmontar();
    // exportar com 20.000: confirma antes de começar
    const t2 = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 20000, tem_mais: true } });
    t2.ui.confirmar = async o => { confirmou++; t2.reg.conf = o; return false; };
    const tela2 = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api2 = await t2.M.montarContatos(t2.k, tela2, { query: {} });
    await varias();
    botaoTxt(tela2, /Exportar/).clique(); await varias();
    assert.equal(confirmou, 1, "antes: começava direto");
    assert.match(t2.reg.conf.titulo, /^Exportar 20000 pacientes\?$/);
    assert.equal(t2.cham("nx_contatos_exportar").length, 0, "não confirmou: nada foi pedido");
    if (api2 && api2.desmontar) api2.desmontar();
  } finally { D.desfazer(); }
});

test("RB-113 Contatos (DOM): no celular os filtros salvos entram na folha de Filtros e voltam ao fechar", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true, "(max-width: 600px)": true } });
  try {
    const t = await montarCt(D);
    const visoesEl = D.h("div", { class: "crm-visoes" });
    t.k.mod = async nome => (nome === "visoes" ? { ...VisReal, controlesVisoes: () => ({ el: visoesEl, atualizar() {} }) } : {});
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    globalThis.innerWidth = 360;
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    await varias();
    const casa = visoesEl.parentElement;
    assert.ok(casa && casa.classList.contains("crm-fixa"));
    tela.querySelector(".crm-filtro-bt").clique(); await varias();
    const folha = t.reg.flut.conteudo;
    assert.ok(folha.querySelector(".crm-filtros-visoes") && folha.contains(visoesEl), "antes: ocupavam uma linha inteira acima da lista");
    t.reg.flut.api.fechar();
    assert.equal(visoesEl.parentElement, casa, "voltam ao lugar");
    assert.match(ler("crm.css"), /\.crm\[data-tela="contatos"\] \.crm-fixa > \.crm-visoes \{ display: none; \}/);
    if (api && api.desmontar) api.desmontar();
  } finally { delete globalThis.innerWidth; D.desfazer(); }
});

test("RB-227/104/217 empresa (DOM): ganhos com concordância; mais de 12 pessoas ganha «Outro…»; «Nova empresa»", async () => {
  const D = domDeMentira();
  try {
    const cts = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, nome: `P${i}` }));
    const t = await montarCt(D, { rpc: n => (n === "nx_empresa_ver" ? { empresa: { id: 3, nome: "Frota X" }, contatos: cts, negocios: [], resumo: null } : undefined) });
    let menu = null; t.ui.menu = (a, itens) => { menu = itens; return { fechar() {} }; };
    t.k.estagio = () => null;
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 3, {}); await varias();
    const res = el.querySelector(".emp-resumo");
    assert.ok(/\b0fechadas\b|0\s*fechadas/.test(res.textContent.replace(/\s+/g, "")) || res.textContent.includes("fechadas"), `antes: «fechous» (${res.textContent})`);
    el.querySelector(".emp-novo-neg").clique();
    assert.equal(menu.length, 13, "12 pessoas + «Outro…»");
    assert.match(menu.at(-1).rotulo, /^Outro… \(2 a mais\)$|^Outra… \(2 a mais\)$/, "antes: cortava em 12 sem avisar");
    assert.match(ler("crm-listas.js"), /ui\.icone\("mais"\), "Nova empresa"\)/);
  } finally { D.desfazer(); }
});

/* ---------- (b) Tarefas ---------- */
test("RB-238/124/257 tarefas: o círculo diz o prazo ao leitor; responsável pela referência do seletor; edição com chave de idempotência", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    const k = { ui, h, L, v: V, pode: () => true, base: { usuarios: [] }, eu: () => "u1" };
    const T = await import("../web/app/crm-tarefas.js");
    const semPrazo = T.itemTarefa(k, { id: 1, titulo: "Ligar", tipo: "ligacao" });
    assert.equal(semPrazo.querySelector('input[type="checkbox"]').attrs["aria-label"], "Concluir a tarefa Ligar, sem prazo", "antes: só «Concluir a tarefa Ligar»");
    const atr = T.itemTarefa(k, { id: 2, titulo: "Retorno", tipo: "tarefa", vence_em: iso(-2), atrasada: true });
    assert.equal(atr.querySelector('input[type="checkbox"]').attrs["aria-label"], "Concluir a tarefa Retorno, atrasada, há 2 dias");
    // formulário: a 1ª «.campo.inteiro select» é OUTRA (o seletor de negócio); o name vai no seletor de pessoa
    let form = null, acoes = null;
    ui.modal = async o => { form = o.corpo; acoes = o.acoes; return null; };
    ui.seletorPessoa = () => h("select", { class: "sel sel-pessoa" });
    ui.lerForm = f => Object.fromEntries(f.querySelectorAll("input,select,textarea").filter(x => x.attrs.name || x.name).map(x => [x.attrs.name || x.name, x.value]));
    const escritas = [];
    Object.assign(k, { rascunho: () => ({ apagar() {} }), novaReq: () => "req-x", escrever: async (n, p, o) => { escritas.push({ n, p, o }); return { resultado: { id: 9 } }; },
      api: { rpcC: async n => { escritas.push({ n, direto: true }); return {}; } }, erro: e => String(e) });
    await T.formTarefa(k, { id: 9, titulo: "Ligar", tipo: "tarefa" });
    assert.equal(form.querySelector(".sel-pessoa").name, "dono_id");
    const salvar = acoes.find(a => a.tipo === "primario");
    form.querySelector('input[name="titulo"]').value = "Ligar de novo";
    const r = await salvar.fn({ erro() {} });
    assert.deepEqual(r, { id: 9 });
    assert.deepEqual(escritas.map(e => e.n), ["nx_tarefa_salvar"]);
    assert.equal(escritas[0].direto, undefined, "antes: a edição ia direto (sem k.escrever)");
    assert.equal(escritas[0].o.req, "req-x");
  } finally { D.desfazer(); }
});

test("RB-118 Tarefas (DOM): a Semana avisa quantas estão atrasadas, com atalho para a aba «Atrasadas» (na lista)", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    D.storage.set("nx-app-crm-tarefas-cli-t-u1-vista", "semana");
    const k = { ui, h, L, v: V, pode: () => true, base: { usuarios: [] }, eu: () => "u1", ctx: { cliente: { id: "cli-t" }, titulo() {}, navegar() {} }, erro: e => String(e), toastErro() {},
      api: { rpcC: async (n, p) => { reg.chamadas.push({ n, p }); return { itens: [], contagens: { hoje: 0, atrasadas: 3, proximas: 0 }, tem_mais: false }; } } };
    const T = await import("../web/app/crm-tarefas.js");
    const tela = h0(D, "div", { class: "crm" });
    await T.montarTarefas(k, tela, { query: {} }); await varias();
    const vista = tela.querySelector(".tfp-vista");
    if (vista && vista.valor !== "semana") { vista.__mudar("semana"); await varias(); }
    const link = tela.querySelector(".tfp-ver-atrasadas");
    assert.ok(link, "antes: a semana escondia as atrasadas sem avisar");
    assert.equal(link.textContent, "3 atrasadas (na lista)");
    link.clique(); await varias();
    assert.equal(reg.chamadas.at(-1).p.p_filtro.situacao, "atrasadas", "a lista abre na aba Atrasadas");
    assert.equal(tela.querySelector(".tfp-ver-atrasadas"), null, "voltou para a lista");
  } finally { D.desfazer(); }
});

/* ---------- (b) Configurações ---------- */
test("RB-135/242/146 Funis (DOM): contagem que falhou trava tipo/marco/anúncios com aviso; etapa nova com chance da posição; nome repetido sem ir ao servidor", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const reg = { chamadas: [], menus: {} };
    ui.menu = (anc, itens) => { reg.menus[anc.attrs["aria-label"]] = itens; return { fechar() {} }; };
    ui.seletorCor = () => h("div");
    const base = { funis: [
      { id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [
        { id: "a1", nome: "Novo", tipo: "aberto", marco: "nova", probabilidade: 10 }, { id: "a2", nome: "Avaliação", tipo: "aberto", marco: "agendada", probabilidade: 40 },
        { id: "a3", nome: "Fechou", tipo: "ganho", marco: "fechou", probabilidade: 100 }, { id: "a4", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0 }] },
      { id: "f2", nome: "Pós-venda", ordem: 2, ativo: true, conta_no_ads: false, estagios: [{ id: "b1", nome: "N", tipo: "aberto", probabilidade: 10 }, { id: "b2", nome: "G", tipo: "ganho", probabilidade: 100 }, { id: "b3", nome: "P", tipo: "perdido", probabilidade: 0 }] }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: async (n, p) => { reg.chamadas.push({ n, p }); if (n === "nx_negocios_kanban") throw new Error("rede"); return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo);
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Editar o funil Pós-venda").clique(); await varias();
    assert.ok(alvo.querySelector(".fe-sem-contagem"), "antes: nenhum aviso e tudo livre");
    assert.ok(alvo.querySelectorAll(".fe-tipo").every(s => s.disabled), "tipo travado sem a contagem");
    assert.equal(alvo.querySelector('input[name="conta_no_ads"]').checked, false);
    botaoTxt(alvo, /^Etapa$/).clique(); await varias();
    const probs = alvo.querySelectorAll(".fe-prob").map(x => x.value);
    assert.ok(probs.includes(55), `chance da nova entre 10 e 100 (${probs})`);
    const nome = alvo.querySelector('input[name="nome"]');
    nome.value = "pacientes"; nome.dispara("input", { target: nome });
    botaoTxt(alvo, /^Salvar funil$/).clique(); await varias();
    assert.equal(reg.chamadas.filter(c => c.n === "nx_funil_salvar").length, 0, "antes: só o servidor recusava");
    assert.ok(alvo.textContent.includes("Já existe um funil com esse nome."));
  } finally { D.desfazer(); }
});

test("RB-140/150 Campos e Etiquetas (DOM): funil desativado marcado no «Vale para»; excluir etiqueta mostra o progresso no item", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    let opcoes = null;
    ui.campo = o => { if (o.nome === "funil_id") opcoes = o.opcoes; return h("label", { class: "campo", dataset: { campo: o.nome } }, h(o.tipo === "select" ? "select" : o.tipo === "textarea" ? "textarea" : "input", { name: o.nome })); };
    ui.modal = async () => null;
    let abasCampos = null; ui.abas = o => { abasCampos = o; return { el: h("div"), ativar() {}, contar() {} }; };
    const passos = [{ restantes: 1200 }, { restantes: 0 }];
    const vistos = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", ativo: true }, { id: "f9", nome: "Antigo", ativo: false }], campos: [], etiquetas: [{ id: "e1", nome: "VIP", cor: null }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base, pode: () => true,
      api: { rpcC: async n => { if (n === "nx_etiqueta_excluir") { const it = D.doc.body.querySelector(".crm-cfg-prog"); vistos.push(it ? it.textContent : null); return passos.shift(); } return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvoC = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvoC);
    abasCampos.aoMudar("negocio");
    botaoTxt(alvoC, /^(Campo|Criar campo)$/).clique(); await varias();
    assert.ok(opcoes && opcoes.some(o => o.rotulo === "Antigo (desativado)"), "antes: «Antigo» parecia um funil em uso");
    const alvoE = h0(D, "div");
    await secoesConfig.find(s => s.id === "etiquetas").montar(ctx, alvoE);
    const bt = alvoE.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Excluir a etiqueta VIP");
    bt.dispara("click", { currentTarget: bt }); await varias();
    assert.equal(bt.disabled, true, "o botão desliga enquanto tira");
    assert.deepEqual(vistos, ["", "Tirando de 1200 registros…"], "antes: só o leitor de tela ouvia");
  } finally { D.desfazer(); }
});

/* ---------- (b) Importação e estáticos ---------- */
test("RB-131/200/100 estáticos: selects do mapeamento com .sel; «×» dos chips com 44 px no toque; vazios sem style inline", () => {
  assert.match(ler("crm-importar.js"), /h\("select", \{ class: "sel imp-map-sel", "aria-label": `Destino da coluna/);
  const css = ler("crm.css");
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\) \{ \.crm-chip button \{ width: 44px; height: 44px;/);
  assert.match(css, /\.crm-vazio-txt \{ font-size: var\(--fs-14\); \}/);
  for (const arq of ["crm-listas.js", "crm-tarefas.js"]) assert.equal(/"font-size": "var\(--fs-14\)"/.test(ler(arq)), false, arq);
});


/* ============================================================ lote crm-3 — testes */
/* ---------- (a) lógica pura ---------- */
test("RB-070/087/074/250 planilha: aspas sem fechar dizem a linha; linha vazia por constante; UF «XX» recusada; etiquetas com vírgula avisadas", () => {
  const ok = L.lerCSV("Nome;Obs\nAna;\"tudo certo\"\nBia;x\n");
  assert.equal(ok.aspasAbertas, false);
  const r = L.lerCSV("Nome;Obs\nAna;\"começou aqui\nBia;x\nCaio;y\n");
  assert.equal(r.aspasAbertas, true, "antes: engolia o resto sem sinal");
  assert.equal(r.linhaAspas, 2, "a linha da planilha onde a aspa abriu");
  assert.equal(r.linhas.length, 1, "o resto virou uma célula só (por isso o aviso)");
  // RB-087
  assert.deepEqual(L.checarLinha({}), [L.LINHA_VAZIA]);
  assert.equal(L.linhaVazia(L.checarLinha({})), true);
  assert.equal(L.linhaVazia(["Telefone inválido"]), false);
  assert.equal(L.linhaVazia(["UF não existe: será ignorada"]), false, "antes: /ignorada/ no texto contava como linha vazia");
  // RB-074
  assert.match(L.checarLinha({ nome: "Ana", uf: "XX" })[0] || "", /UF não existe/, "antes: «XX» passava (2 letras)");
  assert.deepEqual(L.checarLinha({ nome: "Ana", uf: "sp" }), []);
  assert.match(L.checarLinha({ nome: "Ana", uf: "São" })[0] || "", /UF deve ter 2 letras/);
  // RB-250
  const cf = L.conferirPlanilha([{ etiquetas: "VIP, Retorno" }, { etiquetas: "A; B, C" }, { etiquetas: "Única" }], { etiquetas: [] });
  assert.deepEqual(cf.etiquetasComVirgula, ["VIP, Retorno"], "só a célula com vírgula e SEM ;");
});

test("RB-066/083 origem: instagram/facebook contam como Meta na frase; utm «ig»/«fb»/«yt» viram o nome da rede", () => {
  assert.equal(L.resumoRastreio({ plataforma: "instagram" }).frase, "Veio do anúncio (Meta)", "antes: «Origem do contato» ou nada");
  assert.equal(L.resumoRastreio({ plataforma: "facebook", origem: "whatsapp" }).chave, "anuncio", "a pílula já dizia anúncio");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "ig" } }).frase, "Veio do Instagram (orgânico)", "antes: «Veio do Ig»");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "fb" } }).frase, "Veio do Facebook (orgânico)");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "yt" } }).frase, "Veio do YouTube (orgânico)");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "tiktok" } }).frase, "Veio do TikTok (orgânico)");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "jornal" } }).frase, "Veio do Jornal (orgânico)", "o resto continua capitalizado");
});

test("RB-214/079/210/121/125 ordem ativa não troca; dataPassou no calendário de SP; rótulos de ganhos por vertical; atalho no Mac; dia da semana", () => {
  assert.equal(L.ordemAoClicar("ultimo_contato_em", "ultimo_contato"), "ultimo_contato", "antes: trocava para «recentes»");
  assert.equal(L.ordemAoClicar("nome", "nome"), "nome");
  assert.equal(L.ordemAoClicar("nome", "ultimo_contato"), "nome");
  // RB-079: 02/10 01:00 UTC = 01/10 22:00 em SP — «01/10» ainda é hoje em SP (num aparelho em UTC o código antigo dizia «já passou»)
  assert.equal(L.dataPassou("2026-10-01", Date.parse("2026-10-02T01:00:00Z")), false);
  assert.equal(L.dataPassou("2026-09-30", Date.parse("2026-10-02T01:00:00Z")), true);
  // 01/10 02:00 UTC = 30/09 23:00 em SP — «30/09» ainda é hoje
  assert.equal(L.dataPassou("2026-09-30", Date.parse("2026-10-01T02:00:00Z")), false);
  assert.equal(L.dataPassou("2026-09-30", NaN), false);
  // RB-210
  assert.equal(L.rotulosCompras({ vertical: "odonto" }).n, "Tratamentos fechados");
  assert.equal(L.rotulosCompras({ vertical: "oficina" }).vazio, "Ainda sem serviços aprovados.");
  assert.equal(L.rotulosCompras({ vertical: "loja" }).ultima, "Última compra");
  assert.equal(L.rotulosCompras(null).total, "Total ganho");
  // RB-121 / RB-125
  assert.equal(L.atalhoSalvar("MacIntel"), "⌘+Enter");
  assert.equal(L.atalhoSalvar("iPhone"), "⌘+Enter");
  assert.equal(L.atalhoSalvar("Win32"), "Ctrl+Enter");
  assert.equal(L.atalhoSalvar(""), "Ctrl+Enter");
  assert.equal(L.diaSemanaCurto("2026-10-17"), "sáb");
  assert.equal(L.diaSemanaCurto("2026-10-14"), "qua");
  assert.equal(L.diaSemanaCurto("x"), "");
});

test("RB-231/067 planilha: opção com maiúscula/acento casa com a oficial; Sim/Não passam também como «Sim», «NÃO» e «s»", () => {
  const campos = [{ chave: "conv", rotulo: "Convênio", tipo: "opcao", opcoes: ["Unimed", "Amil"] }, { chave: "wa", rotulo: "Aceita WhatsApp", tipo: "sim_nao" }];
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { conv: "unimed" } }, { campos }), []);
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { conv: "UNIMED" } }, { campos }), []);
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { conv: "xpto" } }, { campos }), ["Convênio: Escolha uma das opções"]);
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { wa: "sim" } }, { campos }), []);
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { wa: "nao" } }, { campos }), []);
  assert.deepEqual(L.checarLinha({ nome: "A", campos: { wa: "talvez" } }, { campos }), ["Aceita WhatsApp: Escolha sim ou não"]);
  // lote crm-4 · RB-067: como a planilha vem de verdade — «Sim», «NÃO» e «s» também passam (antes: «Escolha sim ou não» na prévia)
  for (const v of ["Sim", "NÃO", "s"]) assert.deepEqual(L.checarLinha({ nome: "A", campos: { wa: v } }, { campos }), [], v);
  // a linha montada leva a opção oficial (RB-068) e a checagem passa
  const [l] = L.montarLinhas([["Ana", "unimed"]], ["nome", "campo:conv"], campos);
  assert.equal(l.campos.conv, "Unimed");
  assert.deepEqual(L.checarLinha(l, { campos }), []);
});

test("RB-222 esperarOuOnline: resolve no «online» antes do prazo e tira o ouvinte; sem evento, resolve no prazo", async () => {
  const antesAdd = globalThis.addEventListener, antesRem = globalThis.removeEventListener;
  const ouvintes = [];
  globalThis.addEventListener = (t, f) => ouvintes.push({ t, f });
  globalThis.removeEventListener = (t, f) => { const i = ouvintes.findIndex(o => o.t === t && o.f === f); if (i >= 0) ouvintes.splice(i, 1); };
  try {
    const t0 = Date.now();
    const p = L.esperarOuOnline(5000);
    assert.equal(ouvintes.filter(o => o.t === "online").length, 1);
    ouvintes.find(o => o.t === "online").f();
    await p;
    assert.ok(Date.now() - t0 < 1000, "não esperou os 5 s");
    assert.equal(ouvintes.length, 0, "o ouvinte saiu");
    const t1 = Date.now();
    await L.esperarOuOnline(30);
    assert.ok(Date.now() - t1 >= 20, "sem «online» espera o prazo");
    assert.equal(ouvintes.length, 0);
  } finally { globalThis.addEventListener = antesAdd; globalThis.removeEventListener = antesRem; }
});

/* ---------- (b) filtros ---------- */
test("RB-151/021 grupoFiltroCampo e busca de etiquetas (DOM)", () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const kk = campos => ({ ui, h, L, base: { campos } });
    assert.equal(VisReal.grupoFiltroCampo(kk([]), { entidade: "negocio" }), null, "sem campos → null");
    const campos = [{ chave: "conv", rotulo: "Convênio", tipo: "opcao", opcoes: ["Unimed", "Amil"], entidade: "negocio" }, { chave: "qtd", rotulo: "Dentes", tipo: "numero", entidade: "negocio" }];
    const g = VisReal.grupoFiltroCampo(kk(campos), { entidade: "negocio" });
    const [selCampo, selOp] = g.el.querySelectorAll("select");
    const caixa = g.el.querySelector(".crm-fc-valor");
    assert.equal(selOp.hidden, true, "nenhum campo escolhido: condição escondida");
    assert.deepEqual(g.ler(), { campo: null, erro: null });
    selCampo.value = "conv"; selCampo.dispara("change");
    assert.equal(caixa.querySelector("select").tagName, "SELECT", "opção → select com as opções");
    assert.deepEqual(caixa.querySelector("select").querySelectorAll("option").map(o => o.value), ["Unimed", "Amil"]);
    for (const op of ["vazio", "preenchido"]) {
      if (!selOp.querySelectorAll("option").some(o => o.value === op)) continue;
      selOp.value = op; selOp.dispara("change");
      assert.equal(caixa.hidden, true, `«${op}» esconde o valor`);
    }
    selCampo.value = "qtd"; selCampo.dispara("change");
    const ops = selOp.querySelectorAll("option").map(o => o.value);
    selOp.value = ops.find(o => !["vazio", "preenchido"].includes(o)); selOp.dispara("change");
    assert.equal(caixa.hidden, false);
    caixa.querySelector("input").value = "abc";
    assert.equal(g.ler().campo, null);
    assert.match(g.ler().erro, /^Informe um valor válido para «Dentes»/, "valor inválido devolve erro");
    caixa.querySelector("input").value = "3";
    assert.equal(g.ler().erro, null);
    assert.equal(g.mudou(), true);
    // RB-021
    const pouco = h("div", { class: "crm-opcoes" }, Array.from({ length: 12 }, (_, i) => h("label", { class: "crm-op" }, h("input", { type: "checkbox" }), h("span", null, `E${i}`))));
    assert.equal(VisReal.buscaEtiquetas({ h, L }, pouco), null, "até 12: sem busca");
    const nomes = ["VIP", "Retorno", "Implante", "Ortodontia", ...Array.from({ length: 10 }, (_, i) => `Outra ${i}`)];
    const ops2 = h("div", { class: "crm-opcoes" }, nomes.map(n => h("label", { class: "crm-op" }, h("input", { type: "checkbox", checked: n === "VIP" }), h("span", null, n))));
    const busca = VisReal.buscaEtiquetas({ h, L }, ops2);
    assert.ok(busca, "antes: 14 caixas sem busca");
    const campo = busca.querySelector("input");
    campo.value = "orto"; campo.dispara("input");
    const vis = ops2.querySelectorAll(".crm-op").filter(x => !x.hidden).map(x => x.textContent);
    assert.deepEqual(vis, ["VIP", "Ortodontia"], "filtra sem acento/maiúscula e mantém a marcada");
    campo.value = ""; campo.dispara("input");
    assert.equal(ops2.querySelectorAll(".crm-op").filter(x => x.hidden).length, 0);
  } finally { D.desfazer(); }
});

/* ---------- (b) Kanban ---------- */
test("RB-005/009/031/035/017 Kanban (DOM): chance nula vira a padrão; perdido «não fechou há…»; rodapé sem «mude em Filtros»; «Entrou em» no rodapé; não-admin pede ao admin", async () => {
  const D = domDeMentira();
  try {
    const etapas = ETAPAS_KB.map(e => (e.id === "s1" ? { ...e, probabilidade: null } : e));
    const dados = quadroDe({ s1: col("s1", cartoes(1, "s1", 1, { criado_em: "2026-10-03T12:00:00Z" })), s6: col("s6", cartoes(1, "s6", 50, { status: "perdido", fechado_em: iso(-2) })) });
    const t = await montarKb(D, { dados, base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: etapas }] } });
    assert.equal(/null%/.test(t.tela.textContent), false, "antes: «null% de chance»");
    assert.ok(t.tela.textContent.includes("10% de chance"));
    assert.match(t.cartao(50).querySelector(".kc-dias").textContent, /^não fechou há 2 dias$/, "antes: «fechado há 2 dias» na coluna «Não fechou»");
    assert.equal(t.tela.textContent.includes("mude em Filtros"), false);
    assert.ok(t.tela.querySelector(".kb-antigos button"), "o botão do lado continua");
    const c1 = t.cartao(1);
    assert.equal(c1.attrs.title, undefined, "antes: title no cartão inteiro");
    assert.match(c1.querySelector(".kc-dias").attrs.title, /Entrou em 04\/10/);
    assert.match(c1.querySelector(".sr-only").textContent, /entrou em 04\/10/);
    t.api.desmontar();
    let vazioTxt = null;
    const t2 = await montarKb(D, { dados: kbVazio(), kx: { funil: () => null, funilPadrao: () => null, pode: p => p !== "admin" }, uix: { vazio: o => { vazioTxt = o.texto; return D.h("div", { class: "vazio" }, o.titulo); } } });
    assert.match(vazioTxt, /Peça ao administrador para criar ou ativar um funil\./, "antes: «Crie um funil em Configurações» para quem não pode");
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-206 Kanban (DOM): soltar pelo teclado diz «Gravando…» só quando não vem pergunta", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio(), N: { prepararMovimento: () => new Promise(() => {}) } });
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight");          // s1 → s2 (Agendada: pede a data)
    tecla(art, "Enter");
    assert.match(t.reg.avisos.at(-1), /^Soltou em «Agendada», posição \d+\.$/, "antes: «… Gravando…» e abria a pergunta da data");
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: kbVazio() });
    const a2 = t2.cartao(2);
    tecla(a2, " "); tecla(a2, "ArrowUp");                // sobe dentro de «Nova» (sem pergunta)
    tecla(a2, "Enter");
    assert.match(t2.reg.avisos.at(-1), /^Soltou em «Nova», posição \d+\. Gravando…$/);
    for (let i = 0; i < 4; i++) await tique();
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-013/026 Kanban (DOM): toast não é repetido no leitor; lote com cartão ainda gravando diz quantos ficam de fora", async () => {
  const D = domDeMentira();
  try {
    const respostas = [], titulos = [];
    const modal = async o => new Promise(res => {
      titulos.push(o.titulo);
      const api = { fechar: v => res(v), erro() {} };
      if (o.aoAbrir) o.aoAbrir(api);
      const r = respostas.shift();
      if (typeof r === "function") r(o, api); else res(r);
    });
    const t = await montarKb(D, { dados: kbVazio(), uix: { modal } });
    respostas.push("s6");                                    // cartão 10 → «Não fechou»: a gravação espera os 7 s do «Desfazer» (fica pendente)
    t.cartao(10).querySelector(".kc-mover").clique(); await varias();
    // RB-013: o mesmo cartão de novo → recusa com toast; o leitor não ouve a mesma frase duas vezes
    const avisosAntes = (t.reg.avisos || []).length;
    t.cartao(10).querySelector(".kc-mover").clique(); await varias();
    const msg = t.reg.toasts.at(-1);
    assert.match(msg, /ainda pode ser desfeita|Ainda estamos gravando/);
    assert.equal((t.reg.avisos || []).slice(avisosAntes).includes(msg), false, "antes: ui.toast + ui.anunciar com o mesmo texto");
    // RB-026
    respostas.push((o, api) => { o.corpo.querySelector(".kb-mover-sel").clique(); });
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    t.cartao(10).dispara("click", { target: t.cartao(10) });
    respostas.push(null);
    t.tela.querySelector(".crm-sel-mover").clique(); await varias();
    const tit = titulos.at(-1);
    assert.match(tit, /^Mover 1 cartão para…\s?\(1 ainda gravando, fica de fora\)$/, `antes: «Mover 1 cartão para…» sem dizer do outro (${tit})`);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-021/246 Kanban (DOM): Filtros com 13 etiquetas ganham busca; a tarefa rápida já vem com título", async () => {
  const D = domDeMentira();
  try {
    const etiquetas = Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, nome: `Etq ${i}`, cor: null }));
    let sug = null;
    const t = await montarKb(D, { dados: kbVazio(), base: { etiquetas }, modx: { tarefas: { formTarefa: async (k, x, o) => { sug = o; return null; } } } });
    botaoTxt(t.tela, /Filtros/).clique(); await varias();
    assert.ok(D.doc.body.querySelector(".crm-fe-busca"), "antes: 13 caixas sem busca");
    t.cartao(1).querySelector('.kc-rapida[data-acao="tarefa"]').clique(); await varias();
    assert.equal(sug.titulo, "Retomar contato — C1");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

/* ---------- (b) gaveta do negócio ---------- */
test("RB-038/043/058 perguntas ao mover (DOM): «Agendar a consulta» fora de odonto; «Confirmar» só; sem ler o negócio os obrigatórios não são cobrados como vazios", async () => {
  const D = domDeMentira();
  try {
    const campos = [{ chave: "conv", rotulo: "Convênio", tipo: "texto", entidade: "negocio", obrigatorio: true }];
    const falhas = {};
    const g = await montarGaveta(D, { campos });
    const k = g.k;
    const modais = [];
    k.ui.modal = async o => { modais.push(o); return null; };
    // RB-038: vertical genérica
    k.v = { ...V, vertical: "generico" };
    await g.N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s1" }, ETAPAS.find(e => e.id === "s2"));
    assert.equal(modais.at(-1).titulo, "Agendar a consulta", "antes: «Agendar a compromisso»");
    assert.ok(!/compromisso/.test(modais.at(-1).corpo.textContent));
    // RB-043
    k.v = V;
    await g.N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s1" }, ETAPAS.find(e => e.id === "s6"));
    assert.equal(modais.at(-1).acoes.find(a => a.tipo === "perigo").rotulo, "Confirmar", "antes: «Confirmar não fechou»");
    // RB-058: nx_negocio_ver falha → aviso e o campo obrigatório fica opcional (só vai o que for digitado)
    const rpcAntes = k.api.rpcC;
    k.api.rpcC = async (n, p, o) => { if (n === "nx_negocio_ver") throw new Error("rede"); return rpcAntes(n, p, o); };
    await g.N.prepararMovimento(k, { id: 801, titulo: "Ana", estagio_id: "s2" }, ETAPAS.find(e => e.id === "s5"));
    const o = modais.at(-1);
    assert.equal(o.acoes.find(a => a.tipo === "primario").rotulo, "Confirmar", "antes: «Confirmar fechou»");
    assert.ok(o.corpo.querySelector(".ng-sem-conferir"), "antes: pedia todos como vazios, sem explicar");
    o.corpo.querySelector('[name="valor"]').value = "1.500";
    const erros = [];
    const r = await o.acoes.find(a => a.tipo === "primario").fn({ erro: x => erros.push(x) });
    assert.deepEqual(r, { valor: 1500 }, "antes: «Preencha «Convênio»» bloqueava o ganho");
    void falhas;
  } finally { D.desfazer(); }
});

test("RB-063/045/264/254/050 gaveta (DOM): «Salvo» ao lado do campo (sem toast); link do negócio; botão «Tarefa»; «Hoje em» ao mover de funil; pós-venda fora dos anúncios", async () => {
  const D = domDeMentira();
  try {
    const g = await montarGaveta(D, {});
    const { k, reg } = g;
    // RB-063
    const inp = D.h("input", { type: "text", value: "x" });
    const [bloco] = g.N.linhaEd(k, { rotulo: "Campo", controle: inp, ler: x => x.value, salvar: async () => {} });
    h0(D, "div").appendChild(bloco);
    const toastsAntes = (reg.toasts || []).length;
    inp.value = "y"; inp.dispara("blur"); await varias();
    assert.equal((reg.toasts || []).slice(toastsAntes).includes("Salvo."), false, "antes: toast «Salvo.» a cada campo");
    const ok = bloco.querySelector(".ed-ok");
    assert.ok(ok && ok.textContent === "Salvo" && ok.attrs.role === "status");
    // RB-045
    let itens = null, copiado = null;
    k.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    k.ui.copiar = async x => { copiado = x; };
    g.corpo().querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    itens.find(i => i && i.rotulo === "Copiar link").fn();
    assert.match(copiado, /#\/crm\/negocio\/801$/, `antes: location.href (#/crm) — ${copiado}`);
    // RB-264
    let pedido = null;
    k.mod = async () => ({ blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div"), blocoTempo: () => D.h("div"), formTarefa: async (kk, t, o) => { pedido = o; return null; } });
    const btTar = g.corpo().querySelector(".ng-nova-tarefa");
    assert.ok(btTar, "antes: sem atalho no topo");
    btTar.clique(); await varias();
    assert.deepEqual(pedido, { negocio_id: 801, contato_id: 501 });
    // RB-254
    k.base.funis.push({ id: "f2", nome: "Implantes", ativo: true, conta_no_ads: true, estagios: [{ id: "t1", nome: "Nova", tipo: "aberto" }] });
    let corpoMod = null;
    k.ui.modal = async o => { corpoMod = o.corpo; return null; };
    await g.N.moverDeFunil(k, { id: 801, funil_id: "f1", estagio_id: "s2", status: "aberto" });
    assert.equal(corpoMod.querySelector(".ng-hoje-em").textContent, "Hoje em: Pacientes → Agendada");
    // RB-050
    k.base.funis.push({ id: "f3", nome: "Pós", ativo: true, conta_no_ads: false, estagios: [{ id: "p1", nome: "Novo", tipo: "aberto" }] });
    await g.N.iniciarPosVenda(k, { id: 802, funil_id: "f3", titulo: "X" }, { id: 501, nome: "Ana" });
    assert.equal(/funil de anúncios/.test(corpoMod.textContent), false, "antes: «continua fechou no funil de anúncios» num funil fora dos anúncios");
    await g.N.iniciarPosVenda(k, { id: 801, funil_id: "f1", titulo: "X" }, { id: 501, nome: "Ana" });
    assert.match(corpoMod.textContent, /no funil de anúncios/);
    k.base.funis = k.base.funis.filter(f => f.conta_no_ads);
    const toasts = [];
    k.ui.toast = t => { toasts.push(t); return { fechar() {} }; };
    await g.N.iniciarPosVenda(k, { id: 801, funil_id: "f1" }, { id: 501, nome: "Ana" });
    assert.match(toasts.at(-1), /que não conta nos anúncios/, "antes: «fora do Ads»");
  } finally { D.desfazer(); }
});

/* ---------- (b) Contatos, ficha e empresa ---------- */
test("RB-054/109 cadastro rápido (DOM): e-mail conferido antes do servidor; responsável sugerido «eu»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, {});
    let donoSug, o = null;
    t.ui.seletorPessoa = x => { donoSug = x.valor; return D.h("select", { class: "sel" }); };
    t.ui.modal = async x => { o = x; return null; };
    t.ui.lerForm = () => ({ nome: "Ana", email: "ana@", origem: "manual" });
    const erros = [];
    t.ui.marcarErro = (f, campo, txt) => { if (campo) erros.push([campo, txt]); };
    t.k.mod = async () => ({ campoPersonalizado: () => D.h("div"), avisoDuplicado: () => D.h("div"), lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) });
    await t.M.formContato(t.k, {});
    assert.equal(donoSug, "u1", "antes: responsável vazio (o novo negócio já sugeria «eu»)");
    const r = await o.acoes.find(a => a.tipo === "primario").fn({ erro() {} });
    assert.equal(r, false);
    assert.deepEqual(erros[0], ["email", "E-mail inválido. Confira, por exemplo: ana@exemplo.com.br."]);
    assert.equal(t.cham("nx_contato_salvar").length, 0, "antes: ia ao servidor");
  } finally { D.desfazer(); }
});

test("RB-110/045/210 ficha (DOM): consentimento sem registro nasce sem rádio marcado e exige escolha; link da ficha; ganhos com o termo da vertical", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rpc: n => (n === "nx_contato_ver" ? FICHA() : undefined) });
    t.k.estagio = () => null; t.k.funil = () => null;
    t.k.mod = async nome => (nome === "negocio" ? { abrirNegocio() {}, novoNegocio() {}, linhaEd: (await import("../web/app/crm-negocio.js")).linhaEd, marcarSalvo() {}, campoPersonalizado() {}, lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) }
      : nome === "tarefas" ? { blocoTarefas: () => D.h("div"), blocoNotas: () => D.h("div"), blocoTempo: () => D.h("div"), formTarefa: async () => null } : {});
    let o = null, itens = null, copiado = null;
    t.ui.modal = async x => { o = x; return null; };
    t.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    t.ui.copiar = async x => { copiado = x; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    assert.equal(el.querySelector(".fx-rfm-vazio").textContent, "Ainda sem tratamentos fechados.", "antes: «Ainda sem compras.» na clínica");
    botaoTxt(el, /^Registrar consentimento$/).clique(); await varias();
    const radios = o.corpo.querySelectorAll('input[type="radio"]');
    assert.equal(radios.length, 2);
    assert.equal(radios.some(r => r.checked), false, "antes: «Aceita» nascia marcado (LGPD)");
    o.corpo.querySelector("[name=optin_origem]").value = "ficha assinada";
    const erros = [];
    const r = await o.acoes.find(a => a.tipo === "primario").fn({ erro: x => erros.push(x) });
    assert.equal(r, false);
    assert.deepEqual(erros, ["Escolha se aceita ou não receber marketing."]);
    assert.equal(t.cham("nx_contato_salvar").length, 0);
    const menuBt = el.querySelectorAll("button").find(b => /Mais ações/.test(b.attrs["aria-label"] || ""));
    menuBt.clique();
    itens.find(i => i && i.rotulo === "Copiar link da ficha").fn();
    assert.match(copiado, /#\/contatos\/501$/);
  } finally { D.desfazer(); }
});

test("RB-097/101/105/090 Contatos e empresa (DOM): rótulo do filtro pela vertical; CNPJ com máscara; site inválido sem link; editar a empresa sem esqueleto", async () => {
  const D = domDeMentira();
  try {
    const src = ler("crm-listas.js");
    assert.equal(src.includes(`"Com negócio aberto"`), false, "RB-097: antes aria-label fixo «Com negócio aberto»");
    let resp = { empresa: { id: 3, nome: "Frota X", documento: "11222333000181", site: "não tenho" }, contatos: [], negocios: [] };
    let pendente = null;
    const t = await montarCt(D, { rpc: n => (n === "nx_empresa_ver" ? (pendente || JSON.parse(JSON.stringify(resp))) : undefined) });
    t.k.estagio = () => null;
    t.ui.modal = async () => ({ id: 3 });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 3, {}); await varias();
    const id = el.querySelector(".fx-id p");
    assert.ok(id.textContent.includes("11.222.333/0001-81"), `antes: CNPJ cru (${id.textContent})`);
    assert.equal(id.querySelector("a"), null, "antes: <a> sem href");
    assert.ok(id.querySelector(".emp-site-txt"));
    const cart = t.M.cartaoEmpresa(t.k, { id: 3, nome: "Frota X", documento: "11222333000181" });
    assert.ok(cart.textContent.includes("11.222.333/0001-81"));
    // RB-090: «Editar» → recarga quieta
    let soltar; pendente = new Promise(r => { soltar = r; });
    botaoTxt(el, /Editar/).clique(); await varias();
    assert.equal(el.querySelector(".esqueleto"), null, "antes: a página piscava com esqueleto");
    soltar({ ...resp, empresa: { ...resp.empresa, nome: "Frota Y" } }); pendente = null; await varias();
    assert.equal(el.querySelector(".fx-id h1").textContent, "Frota Y");
  } finally { D.desfazer(); }
});

/* ---------- (b) Tarefas ---------- */
test("RB-116/218/258/121 tarefas (DOM): «Amanhã 12:00»; adiar diz «amanhã»; edição da nota com rascunho; atalho da nota pela plataforma", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    const chaves = [];
    let menu = null;
    ui.menu = (a, l) => { menu = l; return { fechar() {} }; };
    const k = { ui, h, L, v: V, pode: () => true, base: { usuarios: [] }, eu: () => "u1", toastErro() {}, erro: e => String(e),
      rascunho: (campo, chave) => { chaves.push(chave); return { apagar() { chaves.push(`apagou:${chave}`); } }; },
      api: { rpcC: async (n, p) => (n === "nx_tarefa_salvar" ? { id: 5, ...p.p_tarefa } : {}) } };
    const T = await import("../web/app/crm-tarefas.js");
    const amanha = T.itemTarefa(k, { id: 5, titulo: "Ligar", tipo: "tarefa", vence_em: iso(1) });
    assert.match(amanha.querySelector('input[type="checkbox"]').attrs["aria-label"], /vence amanhã às \d{2}:\d{2}$/, "antes: «vence em 04/10 às …»");
    assert.ok(/Amanhã \d{2}:\d{2}/.test(amanha.textContent));
    // RB-218
    const hoje = T.itemTarefa(k, { id: 6, titulo: "Retorno", tipo: "tarefa", vence_em: iso(0) });
    hoje.querySelector(".tf-mais").clique();
    await menu.find(i => i.rotulo === "Adiar para amanhã").fn(); await varias();
    assert.match(reg.desfazer.at(-1).texto, /^Tarefa adiada para (hoje|amanhã|[a-zá]{3}, \d{2}\/\d{2}), \d{2}:\d{2}$/, `antes: «para 04/10, …» (${reg.desfazer.at(-1).texto})`);
    // RB-258
    let campoNota = null;
    ui.modal = async o => { campoNota = o.corpo; return null; };
    const bloco = T.blocoNotas(k, { notas: [{ id: 77, texto: "Antiga", pode_editar: true, criado_em: iso(-1) }], negocio_id: 801 });
    bloco.querySelectorAll("button").find(b => /^Editar a nota/.test(b.attrs["aria-label"] || "")).clique(); await varias();      // plano 1000b: RB-122 — o rótulo diz qual nota
    assert.ok(campoNota);
    assert.ok(chaves.includes("nota:77:editar"), "antes: a edição não guardava rascunho");
    // RB-121
    const ta = bloco.querySelectorAll("textarea").find(x => x.attrs["aria-label"] === "Nova nota");
    assert.match(ta.attrs.placeholder, /\((Ctrl|⌘)\+Enter salva\)$/);
  } finally { D.desfazer(); }
});

test("RB-235/125 Tarefas (DOM): rota sem query não derruba; semana com dias livres numa linha só", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    const k = { ui, h, L, v: V, pode: () => true, base: { usuarios: [] }, eu: () => "u1", toastErro() {}, erro: e => String(e), rascunho: () => ({ apagar() {} }),
      ctx: { cliente: { id: "cli-t" }, titulo() {}, navegar() {} }, mod: async () => ({}),
      api: { rpcC: async () => ({ itens: [], contagens: { hoje: 0, atrasadas: 0, proximas: 0 }, tem_mais: false }) } };
    D.storage.set("nx-app-tarefas-vista-cli-t-u1", "semana");
    const T = await import("../web/app/crm-tarefas.js");
    const el = h0(D, "div", { class: "crm" });
    await assert.doesNotReject(async () => { await T.montarTarefas(k, el, {}); }, "antes: rota.query.aba lançava TypeError");
    await varias();
    assert.ok(el.querySelector(".tfp-semana"), "a vista Semana lembrada abriu");
    const livres = el.querySelector(".tfp-livres");
    assert.ok(livres, "antes: 7 caixas «Livre» empilhadas no celular");
    assert.match(livres.textContent, /^Livres: (dom|seg|ter|qua|qui|sex|sáb)(, (dom|seg|ter|qua|qui|sex|sáb)){5}$/, "os 6 dias livres além de hoje");
    assert.equal(el.querySelectorAll(".tfp-dia-livre").length, 6);
    assert.match(ler("crm.css"), /@media \(max-width: 760px\) \{ \.tfp-dia\.tfp-dia-livre \{ display: none; \} \.tfp-livres \{ display: block; \} \}/);
  } finally { D.desfazer(); }
});

/* ---------- (b) Importação ---------- */
test("RB-070/126/239/250/132 Importação (DOM): aspas sem fechar avisam; soltar fora segura o navegador; linhas que ficariam de fora; vírgula nas etiquetas; «Ver os N novos»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D, { rpc: async n => (n === "nx_contatos_importar" ? { criados: 2, atualizados: 1, ignorados: 0, erros: [], avisos: [] } : {}) });
    // RB-126
    assert.equal((D.daJanela.drop || []).length, 1, "antes: soltar fora da área abria o CSV no navegador");
    let segurou = false;
    D.janela("dragover", { preventDefault() { segurou = true; } });
    assert.equal(segurou, true);
    // RB-070
    t.tela.querySelector("textarea").value = "Nome;Obs\nAna;\"aberta\nBia;x\n";
    t.botao("Usar o texto colado").clique();
    const aspas = t.tela.querySelector(".imp-aviso-aspas");
    assert.equal(aspas.hidden, false);
    assert.match(aspas.textContent, /aspas \("\) sem fechar na linha 2/);
    // dados bons para seguir
    t.tela.querySelector("textarea").value = "Nome;Telefone;Etiquetas\nAna;(12) 99830-3030;VIP, Retorno\n;;x\nBia;(12) 99830-3131;A\n";
    t.botao("Usar o texto colado").clique();
    assert.equal(t.tela.querySelector(".imp-aviso-aspas").hidden, true);
    t.botao("Continuar").clique();
    assert.equal((D.daJanela.drop || []).length, 0, "saiu do passo 1: a janela solta o ouvinte");
    // RB-239
    const fora = t.tela.querySelector(".imp-aviso-fora");
    assert.equal(fora.hidden, false, "antes: nada dizia quantas linhas iam sumir");
    assert.match(fora.textContent, /^1 linha ficaria de fora/);
    // RB-250
    t.botao("Continuar").clique(); await varias();
    assert.match(t.tela.querySelector(".imp-aviso-virgula").textContent, /«VIP, Retorno»/);
    // RB-132
    t.botao("Continuar").clique(); await varias();
    t.botao("Importar").clique(); await varias(12);
    const link = t.tela.querySelector(".imp-ver-quem");
    // (o vocabulário de mentira V usa o artigo «a» para tudo)
    assert.equal(link.textContent, "Ver as 2 novas", `antes: «Ver pacientes importados», que mostrava só os novos (${link.textContent})`);
    assert.match(t.tela.querySelector(".imp-nota-atual").textContent, /^A atualizada mantém a origem de antes/);
    t.api.desmontar();
    assert.equal((D.daJanela.drop || []).length, 0);
  } finally { D.desfazer(); }
});

test("RB-087 Importação: a prévia conta as vazias pela constante da lógica (não por /ignorada/)", () => {
  const src = ler("crm-importar.js");
  assert.equal(/\/ignorada\/\.test/.test(src), false);
  assert.match(src, /L\.linhaVazia\(p\)/);
});

/* ---------- (b) Configurações ---------- */
test("RB-142 Campos e motivos (DOM): Subir/Descer desligam enquanto grava e cliques em voo são ignorados", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const chamadas = [];
    let soltar = null;
    const base = { funis: [], campos: [{ id: 1, chave: "a", rotulo: "A", tipo: "texto", entidade: "contato", ordem: 1 }, { id: 2, chave: "b", rotulo: "B", tipo: "texto", entidade: "contato", ordem: 2 },
      { id: 3, chave: "c", rotulo: "C", tipo: "texto", entidade: "contato", ordem: 3 }], motivos: [{ id: 9, nome: "Preço", ordem: 1 }, { id: 8, nome: "Prazo", ordem: 2 }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: (n, p) => { chamadas.push({ n, p }); return new Promise(r => { soltar = r; }); } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvo);
    const desce = alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Descer A");
    desce.clique(); await tique();
    assert.equal(chamadas.length, 1);
    assert.ok(alvo.querySelectorAll("button.crm-cfg-ordem").every(b => b.disabled), "antes: os botões continuavam ligados");
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Descer B").clique(); await tique();
    assert.equal(chamadas.length, 1, "antes: o 2º clique gravava uma ordem intercalada");
    while (soltar) { const s = soltar; soltar = null; s({}); await varias(); }
    assert.ok(chamadas.every(c => c.n === "nx_campo_salvar"));
    // motivos
    chamadas.length = 0;
    const alvoM = h0(D, "div");
    await secoesConfig.find(s => s.id === "motivos").montar(ctx, alvoM);
    alvoM.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Descer Preço").clique(); await tique();
    alvoM.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Subir Prazo").clique(); await tique();
    assert.equal(chamadas.length, 1);
    while (soltar) { const s = soltar; soltar = null; s({}); await varias(); }
  } finally { D.desfazer(); }
});

test("RB-137/141/147 Etiquetas, campos e funis (DOM): cor sugerida pela paleta real; erro null não lança; «Tornar padrão» desligado com motivo", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    let cor = "nao-chamado";
    ui.campo = o => { if (o.nome === "cor") cor = o.valor; return h("label", { class: "campo", dataset: { campo: o.nome } }, h("input", { name: o.nome })); };
    ui.modal = async () => null;
    const etiquetas = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, nome: `E${i}`, cor: null }));
    const base = { funis: [], campos: [], etiquetas };
    let erroRpc = null;
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e && e.message), recarregarBase: async () => base, pode: () => true,
      api: { rpcC: async () => { if (erroRpc !== undefined) throw erroRpc; return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: ["c0", "c1", "c2", "c3", "c4"] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvoE = h0(D, "div");
    await secoesConfig.find(s => s.id === "etiquetas").montar(ctx, alvoE);
    alvoE.querySelectorAll("button").find(b => b.textContent.trim() === "Etiqueta").clique(); await varias();
    assert.equal(cor, "c2", "antes: paleta[7 % 12] = undefined com paleta de 5");
    // RB-141: erro null no salvar do campo
    ui.campo = uiDeMentira(h).campo;
    ui.lerForm = () => ({ rotulo: "Plano", tipo: "texto" });
    let resultado = "nao", erros = [];
    ui.modal = async o => { resultado = await o.acoes.find(a => a.tipo === "primario").fn({ erro: x => erros.push(x) }); return null; };
    const alvoC = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvoC);
    alvoC.querySelectorAll("button").find(b => b.textContent.trim() === "Campo").clique(); await varias();
    assert.equal(resultado, false, "antes: TypeError dentro do catch (e.hint de null)");
    assert.equal(erros.length, 1);
    // RB-147
    const t = await montarFunis(D);
    t.alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pós-venda").clique();
    const tornar = t.reg.menus["Mais ações para Pós-venda"].find(x => x && x.rotulo === "Tornar padrão");
    assert.ok(tornar, "antes: o item sumia sem pista");
    assert.equal(tornar.desabilitado, true);
    assert.equal(tornar.motivo, "(só funis que contam nos anúncios)");
  } finally { D.desfazer(); }
});

test("RB-192/196/201/202 crm.js, visões e toque: etiqueta sem nome não quebra a ordem; «Exclua um… outro»; selo e avatar com 44 px no toque", async () => {
  const D = domDeMentira();
  try {
    assert.match(ler("crm-visoes.js"), /Exclua um antes de criar outro\./);
    assert.equal(ler("crm-visoes.js").includes("Exclua uma antes de criar outra"), false);
    const css = ler("crm.css");
    assert.match(css, /@media \(pointer: coarse\) \{ button\.kc-naolidas::after \{ content: ""; position: absolute; inset: -12px; \} \}/);
    assert.match(css, /\.kc-dono::after \{ content: ""; position: absolute; inset: -6px; \}/);
    // RB-192: o catálogo tem uma etiqueta sem nome (dado antigo) e uma nova é criada
    const chamadas = [];
    const ctx = ctxCrm(D, { rota: { tela: "kanban", query: {} }, cli: "cli-rb192", chamadas,
      rpc: n => (n === "nx_crm_base" ? { funis: [], etiquetas: [{ id: "e1", nome: null }, { id: "e2", nome: "Beta" }], usuarios: [], campos: [], motivos: [] }
        : n === "nx_etiqueta_salvar" ? { id: "e3", nome: "Alfa" } : n === "nx_negocios_kanban" ? { colunas: [] } : null) });
    ctx.ui.corOk = c => c || null;
    const C = await import("../web/app/crm.js");
    const k = await C.kit(ctx);
    assert.equal(k.base.etiquetas.length, 2);
    await assert.doesNotReject(() => k.criarEtiqueta("Alfa"), "antes: TypeError em a.nome.localeCompare");
    assert.deepEqual(k.base.etiquetas.map(e => e.id).sort(), ["e1", "e2", "e3"]);
  } finally { D.desfazer(); }
});


/* ============================================================ lote crm-4 — testes
   (a) lógica pura: Sim/Não, modelo da planilha, valor negativo, prazo em dias, tarefa sem título, histórico do titular sem ids, «inclui» no multi,
       visões com período dos fechados, telefone estrangeiro, rastreio Instagram/Facebook, ⌘ no Mac, chip de etiqueta removida, motivo da perda,
       tarefa vencida com a tela aberta, colunas de negócio ignoradas;
   (b) DOM: Kanban, gaveta, Contatos/empresa, Tarefas/notas, Importação, Configurações e crm.js. */

/* ---------- (a) lógica pura ---------- */
test("RB-067 Sim/Não: «Sim», «Não», «S», «N», 1/0 e true/false são aceitos e gravam o booleano", () => {
  const c = { tipo: "sim_nao", rotulo: "Aceita WhatsApp" };
  assert.equal(L.validarCampo(c, "Não"), null, "antes: «Escolha sim ou não.»");
  assert.equal(L.normalizarCampo(c, "Não"), false);
  for (const v of ["Sim", "SIM", " s ", "S", "1", "true", true]) { assert.equal(L.validarCampo(c, v), null, String(v)); assert.equal(L.normalizarCampo(c, v), true, String(v)); }
  for (const v of ["NÃO", "nao", "n", "N", "0", "false", false]) { assert.equal(L.validarCampo(c, v), null, String(v)); assert.equal(L.normalizarCampo(c, v), false, String(v)); }
  assert.equal(L.validarCampo(c, "talvez"), "Escolha sim ou não.");
  assert.equal(L.lerSimNao("talvez"), null);
  // o filtro salvo por campo sim/não também entende «Sim»
  assert.deepEqual(L.filtroCampoLimpo({ chave: "wa", op: "igual", valor: "Sim" }, [{ chave: "wa", tipo: "sim_nao" }]), { chave: "wa", op: "igual", valor: "true" });
});

test("RB-073/075 planilha-modelo com Empresa, CPF/CNPJ, Título, Valor e Etapa (mapeiam sozinhas); valor negativo é recusado na prévia", () => {
  const m = L.modeloImportacao([]);
  for (const col of ["Empresa", "CPF/CNPJ", "Título", "Valor", "Etapa"]) assert.ok(m.cabecalho.includes(col), `antes: sem «${col}»`);
  const mapa = L.sugerirMapeamento(m.cabecalho);
  assert.ok(["empresa", "documento", "negocio_titulo", "negocio_valor", "estagio"].every(d => mapa.includes(d)), "todas mapeiam sem pedir mapa");
  assert.ok(m.linhas.every(l => l.length === m.cabecalho.length));
  assert.deepEqual(L.checarLinha({ nome: "a", negocio_valor: "-500" }), ["Valor não pode ser negativo"], "antes: passava e virava valor previsto negativo");
  assert.deepEqual(L.checarLinha({ nome: "a", negocio_valor: "1.500,00" }), []);
  assert.deepEqual(L.checarLinha({ nome: "a", negocio_valor: "mil" }), ["Valor inválido"]);
});

test("RB-080/084/046/059 textos: prazo da etapa em dias; tarefa sem título; motivo da perda só com texto; aviso da data que não voltou", () => {
  const agora = new Date("2026-10-10T12:00:00Z");
  const em = h => new Date(agora.getTime() - h * 3600000).toISOString();
  assert.match(L.faixaTempoEtapa(em(80), 72, agora).texto, /\(3 dias\)$/, "antes: «(72 h)»");
  assert.match(L.faixaTempoEtapa(em(40), 72, agora).texto, /3 dias/);
  assert.match(L.faixaTempoEtapa(em(6), 5, agora).texto, /\(5 h\)$/, "prazo em horas continua em horas");
  assert.deepEqual([L.textoPrazoSla(24), L.textoPrazoSla(48), L.textoPrazoSla(36), L.textoPrazoSla(null)], ["1 dia", "2 dias", "36 h", ""]);
  assert.equal(L.textoTempo({ fonte: "tarefa", dados: {} }), "Criou uma tarefa", "antes: «Criou a tarefa «»»");
  assert.equal(L.textoTempo({ fonte: "tarefa", tipo: "tarefa_concluida", dados: { titulo: "  " } }), "Concluiu uma tarefa");
  assert.equal(L.textoTempo({ fonte: "tarefa", dados: { titulo: "Ligar" } }), "Criou a tarefa «Ligar»");
  assert.equal(L.textoMotivoPerda(undefined, "achou caro"), "Motivo: achou caro", "antes: «Motivo: — — achou caro»");
  assert.equal(L.textoMotivoPerda("Preço", "achou caro"), "Motivo: Preço — achou caro");
  assert.equal(L.textoMotivoPerda("Preço", ""), "Motivo: Preço");
  assert.match(L.avisoDataNaoVoltou("oficina"), /^Voltou de etapa, mas a data da visita continua a nova/);
  assert.match(L.avisoDataNaoVoltou("odonto"), /data da consulta/);
});

test("RB-111 dados do titular: o histórico vai em frases, sem os ids das contas da equipe", () => {
  const conta = "6f1c2a3b-1111-4222-8333-944455556666";
  const d = L.dadosTitular({ contato: { id: 5, nome: "Ana" }, tempo: [
    { tipo: "dono", em: "2026-10-01T12:00:00Z", dados: { para: conta, de: conta } },
    { tipo: "estagio", em: "2026-10-02T12:00:00Z", dados: { de_nome: "Nova", para_nome: "Agendada", estagio_id: "s2" } }] }, { vocab: V });
  const json = JSON.stringify(d);
  assert.equal(json.includes(conta), false, "antes: «para»/«de» com o uuid da conta");
  assert.equal(/"(para|de|dados)"/.test(json), false);
  assert.deepEqual(d.historico.map(x => x.texto), ["Responsável: outra pessoa", "Moveu de «Nova» para «Agendada»"]);
  assert.equal(d.historico[0].quando, "2026-10-01T12:00:00Z");
  assert.match(L.textoTitular(d, { data: v => String(v).slice(0, 10) }), /HISTÓRICO[\s\S]*- 2026-10-02: Moveu de «Nova» para «Agendada»/);
});

test("RB-197 filtro de campo de múltipla escolha diz «inclui» (no seletor e no chip)", async () => {
  const campos = [{ chave: "per", rotulo: "Período", tipo: "multi", opcoes: ["Manhã", "Tarde"], entidade: "contato" }, { chave: "conv", rotulo: "Convênio", tipo: "opcao", opcoes: ["Unimed"], entidade: "contato" }];
  assert.equal(L.rotuloOpCampo("igual", "multi"), "inclui", "antes: «é igual a»");
  assert.equal(L.rotuloOpCampo("igual", "opcao"), "é igual a");
  assert.equal(L.textoFiltroCampo({ chave: "per", op: "igual", valor: "Manhã" }, campos), "Período inclui Manhã");
  assert.equal(L.textoFiltroCampo({ chave: "conv", op: "igual", valor: "Unimed" }, campos), "Convênio: Unimed");
  const D = domDeMentira();
  try {
    const k = { h: D.h, L, ui: uiDeMentira(D.h), base: { campos } };
    const g = VisReal.grupoFiltroCampo(k, { entidade: "contato", atual: null });
    const selCampo = g.el.querySelectorAll("select")[0];
    selCampo.value = "per"; selCampo.dispara("change");
    const op = g.el.querySelector(".crm-fc-op");
    assert.equal(op.els[0].textContent, "inclui", "o seletor do operador também");
  } finally { D.desfazer(); }
});

test("RB-224 filtro salvo do quadro com período dos fechados: 30, 90, todos (0) e valor inválido", () => {
  const n = d => L.normalizarVisoesCRM([{ id: "v1", nome: "X", dados: { funil: "f1", filtro: {}, ...d } }], "kanban")[0].dados;
  assert.equal(n({ fechadosDias: 30 }).fechadosDias, 30);
  assert.equal(n({ fechadosDias: 90 }).fechadosDias, 90);
  assert.deepEqual([n({ fechadosDias: 0 }).fechadosDias, n({ fechadosDias: 0 }).todosFechados], [0, true]);
  assert.equal(n({ fechadosDias: 45 }).fechadosDias, 30, "inválido cai no padrão");
  assert.equal(n({ fechadosDias: "90" }).fechadosDias, 30, "texto não é número");
  assert.equal(n({ fechadosDias: 45, todosFechados: true }).fechadosDias, 0, "visão antiga «todos» continua todos");
  const vis = [{ id: "v9", nome: "Noventa", dados: { funil: "f1", filtro: {}, fechadosDias: 90 } }];
  assert.equal(L.visaoCorrespondenteCRM(vis, "kanban", { funil: "f1", filtro: {}, fechadosDias: 90 }), "v9");
  assert.equal(L.visaoCorrespondenteCRM(vis, "kanban", { funil: "f1", filtro: {}, fechadosDias: 0 }), "");
});

test("RB-232 Ligar com telefone estrangeiro (+1, +44, +351) e brasileiro com/sem 55; a lista oferece «ligar» quando há telefone", () => {
  assert.equal(L.hrefTel("+1 (212) 555-1234"), "tel:+12125551234");
  assert.equal(L.hrefTel("+44 20 7946 0958"), "tel:+442079460958");
  assert.equal(L.hrefTel("+351 912 345 678"), "tel:+351912345678");
  assert.equal(L.hrefTel("(12) 99830-3030"), "tel:+5512998303030");
  assert.equal(L.hrefTel("55 12 99830-3030"), "tel:+5512998303030");
  assert.deepEqual(L.acoesDoContato({ telefone: true, conversas: false }).botoes, ["ligar"]);
  assert.deepEqual(L.acoesDoContato({ telefone: false, conversas: true }).botoes, ["conversa"]);
});

test("RB-265 resumoRastreio: Instagram com campanha, Facebook sem campanha, orgânico com utm «ig»", () => {
  const ig = L.resumoRastreio({ plataforma: "instagram", campanha_nome: "Clareamento" });
  assert.equal(ig.frase, "Veio do anúncio (Meta) · campanha «Clareamento»");
  assert.equal(ig.plataforma, "meta");
  const fb = L.resumoRastreio({ plataforma: "facebook" });
  assert.deepEqual([fb.chave, fb.frase], ["anuncio", "Veio do anúncio (Meta)"]);
  const org = L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "ig", utm_medium: "social" } });
  assert.equal(org.frase, "Veio do Instagram (orgânico)");
  assert.deepEqual(org.detalhes, ["Parâmetros do site: ig / social"]);
});

test("RB-014/018/117/122/133/207 apoio: ⌘ no Mac; etiqueta removida no chip; tarefa vencida agora; começo da nota; colunas ignoradas; ids únicos", () => {
  assert.deepEqual([L.teclaModificadora("MacIntel"), L.teclaModificadora("iPhone"), L.teclaModificadora("Win32"), L.teclaModificadora("")], ["⌘", "⌘", "Ctrl", "Ctrl"]);
  assert.equal(L.atalhoSalvar("macOS"), "⌘+Enter");
  const etq = id => (id === "e1" ? { nome: "VIP" } : null);
  assert.deepEqual(L.nomesEtiquetasChip(["e1", "x", "y"], etq), ["VIP", "etiqueta removida"]);
  assert.equal(L.textoChipEtiquetas("todas", L.nomesEtiquetasChip(["x"], etq)), "Tem todas: etiqueta removida", "antes: «Etiquetas: » vazio");
  const agora = Date.now();
  assert.equal(L.tarefaAtrasada({ vence_em: new Date(agora - 60000).toISOString(), atrasada: false }, agora), true, "antes: só o t.atrasada da última leitura");
  assert.equal(L.tarefaAtrasada({ vence_em: new Date(agora + 60000).toISOString() }, agora), false);
  assert.equal(L.tarefaAtrasada({ vence_em: new Date(agora - 60000).toISOString(), concluida_em: new Date(agora).toISOString() }, agora), false);
  assert.equal(L.resumoTexto("Paciente   prefere\nhorário de manhã, depois das 9h"), "Paciente prefere horário de m…");
  assert.equal(L.resumoTexto("curta"), "curta");
  assert.deepEqual(L.colunasNegocioMapeadas(["nome", "estagio", null, "negocio_valor"]), ["Valor", "Etapa"]);
  assert.deepEqual([L.juntarE(["A"]), L.juntarE(["A", "B"]), L.juntarE(["A", "B", "C"])], ["A", "A e B", "A, B e C"]);
  assert.notEqual(L.idUnico("x"), L.idUnico("x"));
});

/* ---------- (b) Kanban ---------- */
const FUNIL_KB = { id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB };
const erroFunil = () => Object.assign(new Error("funil_invalido"), { codigo: "funil_invalido" });

test("RB-002 Kanban (DOM): funil_invalido sem funil padrão mostra «Nenhum funil ativo»; recarga da base que falha não vira rejeição solta", async () => {
  const D = domDeMentira();
  try {
    let semFunil = false;
    const t = await montarKb(D, { dados: () => { throw erroFunil(); },
      kx: { recarregarBase: async () => { semFunil = true; }, funilPadrao: () => (semFunil ? null : FUNIL_KB) } });
    await varias();
    assert.ok(t.tela.textContent.includes("Nenhum funil ativo."), "antes: cartão de erro");
    assert.equal(t.tela.querySelector(".erro-cartao"), null);
    t.api.desmontar();
    // a recarga da base falha: sem «Uncaught in promise» (o teste falharia com a rejeição solta) e a tela mostra o erro
    const t2 = await montarKb(D, { dados: () => { throw erroFunil(); }, kx: { recarregarBase: async () => { throw new Error("rede"); }, funilPadrao: () => FUNIL_KB } });
    await varias();
    assert.ok(t2.tela.querySelector(".erro-cartao"));
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-006/036 Kanban (DOM): «Ver mais» com id fora do padrão não quebra o seletor; resposta vazia (null) não lança", async () => {
  const D = domDeMentira();
  try {
    const respostas = [{ itens: [{ id: "q\"9", titulo: "Aspas", status: "aberto", estagio_id: "s1", ordem: 99 }], tem_mais: true }, null];
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1"), 5) }), coluna: async () => respostas.shift() });
    await varias();
    t.tela.querySelector(".kb-mais").clique(); await varias();
    assert.deepEqual(t.reg.erros || [], [], "antes: SyntaxError no seletor com o id do servidor");
    assert.ok(t.tela.querySelectorAll(".kc").some(x => x.dataset.id === "q\"9"), "o cartão novo entrou");
    t.tela.querySelector(".kb-mais").clique(); await varias();
    assert.deepEqual(t.reg.erros || [], [], "antes: TypeError em r.tem_mais com resposta null");
    assert.equal(t.tela.querySelector(".kb-mais"), null, "sem «tem_mais»: o total é o que está carregado");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-010/247 Kanban (DOM): «Mover para…» é <ul><li><button>; no toque a folha traz «Nova tarefa» e «Abrir conversa»", async () => {
  const D = domDeMentira({ medias: { "(pointer: coarse)": true } });
  try {
    let folha = null; const tarefas = [];
    const modal = async o => new Promise(res => { folha = o.corpo; if (o.aoAbrir) o.aoAbrir({ fechar: res, erro() {} }); folha.querySelector(".kb-mover-rapida[data-acao=\"tarefa\"]").clique(); });
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1", 1, { contato: { id: 55, nome: "Ana" } })) }), uix: { modal }, ctxx: { temModulo: () => true },
      modx: { tarefas: { formTarefa: async (k, x, o) => { tarefas.push(o); return null; } } } });
    await varias();
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    assert.equal(folha.tagName, "UL", "antes: <div role=list>");
    assert.ok(folha.els.every(li => li.tagName === "LI" && li.els[0].tagName === "BUTTON" && li.els[0].getAttribute("role") === null), "antes: <button role=listitem>");
    assert.ok(folha.querySelector(".kb-mover-rapida[data-acao=\"conversa\"]"), "Abrir conversa no toque");
    assert.deepEqual(tarefas.map(o => o.negocio_id), [1], "«Nova tarefa» da folha abre o formulário ligado ao cartão");
    t.api.desmontar();
  } finally { D.desfazer(); }
  // com mouse a folha não repete os botões rápidos (eles aparecem no hover)
  const D2 = domDeMentira();
  try {
    let folha = null;
    const modal = async o => { folha = o.corpo; return null; };
    const t = await montarKb(D2, { dados: kbVazio(), uix: { modal } });
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    assert.equal(folha.querySelector(".kb-mover-rapida"), null);
    t.api.desmontar();
  } finally { D2.desfazer(); }
});

test("RB-022 Kanban (DOM): sem matchMedia (Node) a coluna vazia desenha sem lançar", async () => {
  const D = domDeMentira();
  try {
    globalThis.matchMedia = undefined;
    const t = await montarKb(D, { dados: kbVazio() });
    await varias();
    assert.deepEqual(t.reg.erros || [], []);
    assert.ok(t.lista("s5").textContent.includes("Arraste um cartão para cá"), "antes: TypeError em matchMedia(...) a cada coluna vazia");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-027 Kanban (DOM): mover 12 cartões de uma vez anuncia no máximo 4 vezes o progresso", async () => {
  const D = domDeMentira();
  try {
    const modal = async () => "s2";
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(12, "s1")) }), uix: { modal } });
    await varias();
    for (let i = 1; i <= 12; i++) { const a = t.cartao(i); a.dispara("keydown", { key: "x", currentTarget: a, target: a }); }
    t.reg.avisos = [];
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(20);
    assert.equal(t.reg.movidos.length, 12);
    const prog = t.reg.avisos.filter(a => /^Movendo /.test(a));
    assert.deepEqual(prog, ["Movendo 1 de 12…", "Movendo 5 de 12…", "Movendo 10 de 12…", "Movendo 12 de 12…"], "antes: 12 anúncios seguidos");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-032 Kanban (DOM): «?parados=7» do link filtra a visita mas não gruda na preferência do aparelho", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: kbVazio(), rota: { query: { parados: "7" } } });
    await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.parado_dias, 7, "o link filtra");
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "ana"; busca.dispara("input"); await varias();
    const salvo = JSON.parse(D.storage.get("nx-app-crm-kb-cli-p1000-u1") || "{}");
    assert.equal(salvo.filtro && salvo.filtro.parado_dias, undefined, "antes: ficava gravado e voltava em #/crm");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-259/236/018/014 Kanban (DOM): Esc com a busca vazia vai ao 1º cartão; «Sem valor»; chip de etiqueta removida; ⌘ no Mac", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { value: { platform: "MacIntel", onLine: true }, configurable: true, writable: true });
    D.storage.set("nx-app-crm-kb-cli-p1000-u1", JSON.stringify({ filtro: { etiquetas: { op: "todas", ids: ["e1", "e-apagada"] } } }));
    const t = await montarKb(D, { dados: kbVazio(), etiqueta: id => (id === "e1" ? { id: "e1", nome: "VIP" } : null) });
    await varias();
    // RB-259
    const busca = t.tela.querySelector('input[type="search"]');
    busca.focus();
    busca.dispara("keydown", { key: "Escape" });
    assert.equal(D.ativo(), t.tela.querySelector(".kc"), "antes: o foco ficava no campo de busca");
    // RB-236
    assert.equal(t.cartao(1).querySelector(".kc-valor").textContent, "Sem valor", "antes: «sem valor» (a gaveta diz «Sem valor»)");
    // RB-018
    const chip = t.tela.querySelectorAll(".crm-chip").map(c => c.textContent).find(x => /^Tem todas/.test(x));
    assert.equal(chip, "Tem todas: VIP, etiqueta removida", "antes: «Etiquetas: VIP (todas)»");
    // RB-014
    const instr = t.tela.querySelectorAll(".sr-only").find(x => /com clique abre numa nova aba/.test(x.textContent));
    assert.match(instr.textContent, /⌘ com clique abre numa nova aba/, "antes: «Ctrl com clique» também no Mac");
    t.api.desmontar();
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); else delete globalThis.navigator; D.desfazer(); }
});

/* ---------- (b) gaveta do negócio ---------- */
test("RB-048/059 gaveta (DOM): «Movida para…» no feminino; Desfazer com a data que não volta avisa exatamente isso", async () => {
  const D = domDeMentira();
  try {
    const falhas = {};
    const t = await montarGaveta(D, { negocio: { estagio_id: "s1", consulta_em: null }, respModal: { consulta_em: "2099-01-10T09:00" }, falhas });
    await varias();
    t.corpo().querySelectorAll(".ng-etapa").find(b => b.textContent.startsWith("Agendada")).clique(); await varias();
    const d = t.desfazer().at(-1);
    assert.equal(d.texto, "Movida para «Agendada».", "antes: «Movido para…»");
    assert.ok(t.reg.avisos.includes("Movida para Agendada."));
    falhas.nx_negocio_salvar = Object.assign(new Error("x"), { codigo: "http_500" });
    await d.reverter(); await varias();
    assert.ok(t.reg.toasts.includes(L.avisoDataNaoVoltou("odonto")), `antes: erro genérico (${JSON.stringify(t.reg.erros)})`);
    assert.equal(t.srv.neg.estagio_id, "s1", "a etapa voltou");
  } finally { D.desfazer(); }
});

test("RB-040/046/051 gaveta (DOM): «Marcar visita» na oficina; motivo da perda só com texto; protocolo sem link sem o módulo Conversas", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { kx: { v: { ...V, vertical: "oficina" }, ctx: { carregar: async () => ({}) } } });
    await varias();
    assert.equal(t.corpo().querySelector(".ng-marcar").textContent, "Marcar visita", "antes: «Marcar consulta» também na oficina");
    const t2 = await montarGaveta(D, { negocio: { estagio_id: "s6", motivo_perda_id: null, motivo_perda_txt: "achou caro" }, ver: { conversas: [{ id: 5, protocolo: "2026-1" }] } });
    await varias();
    assert.ok(t2.corpo().textContent.includes("Motivo: achou caro"), "antes: «Motivo: — — achou caro»");
    assert.equal(t2.corpo().querySelector(".fx-proto").tagName, "SPAN", "antes: link para #/conversas numa conta sem o módulo");
    const t3 = await montarGaveta(D, { ver: { conversas: [{ id: 5, protocolo: "2026-1" }] }, kx: { ctx: { temModulo: m => m === "conversas" } } });
    await varias();
    assert.equal(t3.corpo().querySelector(".fx-proto").attrs.href, "#/conversas/5");
  } finally { D.desfazer(); }
});

test("RB-056/207/255 gaveta (DOM): Novo sem funil ativo explica; «Responsável» ligado ao seletor; funil sem etapa aberta não é destino", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    await varias();
    // RB-207
    const g = await t.N.novoNegocio(t.k, {});
    const rot = g.corpo.querySelectorAll("label").find(l => l.textContent === "Responsável");
    assert.ok(rot && rot.attrs.for, "antes: <label> sem for");
    assert.ok(g.corpo.querySelectorAll("select").some(s => s.id === rot.attrs.for), "o for aponta para o select");
    // RB-056
    t.k.base.funis[0].ativo = false;
    const g2 = await t.N.novoNegocio(t.k, {});
    assert.ok(g2.corpo.textContent.includes("Crie um funil antes."), "antes: formulário com o funil vazio (erro técnico do servidor)");
    assert.equal(g2.corpo.querySelector("form"), null);
    t.k.base.funis[0].ativo = true;
    // RB-255
    let abriu = false;
    t.k.ui.modal = async () => { abriu = true; return null; };
    t.k.base.funis.push({ id: "f3", nome: "Só fechamento", ativo: true, conta_no_ads: true, estagios: [{ id: "z1", nome: "Fechou", tipo: "ganho" }, { id: "z2", nome: "Perdeu", tipo: "perdido" }] });
    await t.N.moverDeFunil(t.k, { id: 801, funil_id: "f1", estagio_id: "s2", status: "aberto" }, {});
    assert.equal(abriu, false, "antes: abria com o select de etapa vazio e «Mover» dava «Escolha a etapa»");
  } finally { D.desfazer(); }
});

/* ---------- (b) Tarefas e notas ---------- */
function kitTf4(D, { rpc = async () => ({}), ctx = {} } = {}) {
  const reg = {};
  const ui = uiDeMentira(D.h, reg);
  const k = { ui, h: D.h, L, v: V, pode: () => true, base: { usuarios: [{ id: "u1", nome: "Eu" }] }, eu: () => "u1", toastErro: e => { reg.erros = (reg.erros || []).concat(String(e)); }, erro: e => String(e),
    rascunho: () => ({ apagar() {} }), nomes: () => ({}), motivosPorId: () => ({}), ctx: { temModulo: () => false, ...ctx }, api: { rpcC: (n, p) => rpc(n, p) } };
  return { k, ui, reg };
}

test("RB-114/122 notas (DOM): Ctrl+Enter repetido durante a gravação grava UMA nota; «Editar/Excluir a nota «…»» dizem qual", async () => {
  const D = domDeMentira();
  try {
    const pend = [];
    const { k } = kitTf4(D, { rpc: (n, p) => (n === "nx_nota_salvar" ? new Promise(r => pend.push(() => r({ id: 90 + pend.length, texto: p.p_nota.texto, criado_em: new Date().toISOString(), pode_editar: true }))) : Promise.resolve({})) });
    const T = await import("../web/app/crm-tarefas.js");
    const bloco = T.blocoNotas(k, { notas: [{ id: 7, texto: "Paciente prefere horário de manhã, depois das 9h", pode_editar: true, criado_em: iso(-1) }], negocio_id: 801 });
    const ta = bloco.querySelectorAll("textarea").find(x => x.attrs["aria-label"] === "Nova nota");
    ta.value = "Ligar amanhã";
    for (let i = 0; i < 3; i++) ta.dispara("keydown", { key: "Enter", ctrlKey: true });
    await varias();
    assert.equal(pend.length, 1, "antes: 3 gravações da mesma nota");
    pend[0](); await varias();
    const rot = bloco.querySelectorAll("button").map(b => b.attrs["aria-label"]).filter(x => /nota «/.test(x || ""));
    assert.ok(rot.includes("Editar a nota «Paciente prefere horário de m…»"), `antes: «Editar nota» igual para todas (${rot.join(" | ")})`);
    assert.ok(rot.includes("Excluir a nota «Ligar amanhã»"));
  } finally { D.desfazer(); }
});

test("RB-117/051/207 tarefas (DOM): venceu com a tela aberta = «Atrasada»; linha do tempo sem link sem Conversas; «Responsável» ligado ao seletor", async () => {
  const D = domDeMentira();
  try {
    const { k, ui } = kitTf4(D);
    const T = await import("../web/app/crm-tarefas.js");
    const venceu = T.itemTarefa(k, { id: 5, titulo: "Ligar", tipo: "tarefa", vence_em: new Date(Date.now() - 60000).toISOString(), atrasada: false });
    assert.ok(venceu.textContent.includes("Atrasada"), "antes: continuava «Hoje 10:00» até recarregar");
    const futura = T.itemTarefa(k, { id: 6, titulo: "Ligar", tipo: "tarefa", vence_em: iso(2) });
    assert.equal(futura.textContent.includes("Atrasada"), false);
    // RB-051
    const itens = [{ tipo: "conversa_aberta", em: iso(0), dados: { protocolo: "ORB-1" }, conversa_id: 9 }];
    assert.equal(T.blocoTempo(k, itens).querySelector("a"), null, "antes: «Abrir conversa» numa conta sem o módulo");
    k.ctx.temModulo = m => m === "conversas";
    assert.equal(T.blocoTempo(k, itens).querySelector("a").attrs.href, "#/conversas/9");
    // RB-207
    let corpo = null;
    ui.modal = async o => { corpo = o.corpo; return null; };
    await T.formTarefa(k, null, {});
    const rot = corpo.querySelectorAll("label").find(l => l.textContent === "Responsável");
    assert.ok(rot && rot.attrs.for, "antes: <label> sem for");
    assert.ok(corpo.querySelectorAll("select").some(s => s.id === rot.attrs.for));
  } finally { D.desfazer(); }
});

/* ---------- (b) Contatos, empresa ---------- */
test("RB-094/098/215 Contatos (DOM): vazio com filtro oferece «Limpar filtros»; «Marketing: Não querem» nos Filtros; «último contato há…»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { rota: { query: {} }, lista: { itens: [], total: 0, tem_mais: false } });
    let vazio = null;
    t.ui.vazio = o => { if (o.tipo === "sem_resultado") vazio = o; return D.h("div", { class: "vazio" }, o.titulo || ""); };
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: { origem: "anuncio" } });
    await varias();
    assert.ok(vazio && vazio.acao, "antes: só «Nada encontrado com esses filtros.», sem ação");
    assert.equal(vazio.acao.rotulo, "Limpar filtros");
    vazio.acao.fn(); await varias();
    assert.deepEqual(t.cham("nx_contatos_listar").at(-1).p.p_filtro.origem, undefined, "a lista volta sem o filtro");
    // RB-098
    botaoTxt(tela, /Filtros/).clique(); await varias();
    const folha = t.reg.flut.conteudo;
    const grupo = folha.querySelectorAll("fieldset").find(f => f.textContent.startsWith("Marketing"));
    assert.ok(grupo, "antes: o chip existia, mas nada no popover o ligava");
    botaoTxt(grupo, /^Não querem$/).clique();
    botaoTxt(folha, /^Aplicar$/).clique(); await varias();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_filtro.optin_marketing, false);
    if (api && api.desmontar) api.desmontar();
    // RB-215
    const lc = t.M.listaCompacta(t.k, { aoMudar() {}, aoAbrir() {} });
    lc.atualizar([{ id: 1, nome: "Ana", telefone: "5512998303030", cidade: "Taubaté", ultimo_contato_em: iso(-3) }]);
    assert.ok(lc.el.textContent.includes("último contato há 2 dias"), "antes: só «há 2 dias», sem dizer do quê");
  } finally { D.desfazer(); }
});

test("RB-102/106/207 Contatos (DOM): contato da empresa só com e-mail mostra o e-mail; exportação que cai diz até onde foi; «Responsável» ligado", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const t = await montarCt(D, { rpc: n => (n === "nx_empresa_ver" ? { empresa: { id: 7, nome: "Frota X" }, contatos: [{ id: 9, nome: null, telefone: null, email: "so@email.com" }], negocios: [] } : undefined) });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 7, {});
    assert.ok(el.textContent.includes("so@email.com"), "antes: «—»");
    // RB-106
    const paginas = [];
    const t2 = await montarCt(D, { rpc: n => (n === "nx_contatos_exportar" ? new Promise((res, rej) => paginas.push({ res, rej })) : undefined) });
    const ts = [];
    t2.ui.toast = (x, o = {}) => { ts.push({ x, ...o }); return { fechar() {} }; };
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t2.M.montarContatos(t2.k, tela, { query: {} });
    await varias();
    botaoTxt(tela, /Exportar/).clique(); await varias();
    paginas[0].res({ itens: [{ id: 1 }, { id: 2 }], tem_mais: true }); await varias();
    paginas[1].rej(Object.assign(new Error("x"), { codigo: "sem_conexao" })); await varias();
    assert.ok(ts.some(x => x.x === "A exportação parou em 2 pacientes; nenhum arquivo foi baixado. Tente de novo."), `antes: só o erro genérico (${ts.map(x => x.x).join(" | ")})`);
    assert.equal(U.criados.length, 0);
    if (api && api.desmontar) api.desmontar();
    // RB-207
    let corpo = null;
    t2.ui.modal = async o => { corpo = o.corpo; return null; };
    await t2.M.formContato(t2.k, {});
    const rot = corpo.querySelectorAll("label").find(l => l.textContent === "Responsável");
    assert.ok(rot && rot.attrs.for, "antes: <label> sem for");
    assert.ok(corpo.querySelectorAll("select").some(s => s.id === rot.attrs.for));
  } finally { U.desfazer(); D.desfazer(); }
});

/* ---------- (b) Importação ---------- */
test("RB-219/211/133 Importação (DOM): no toque «Toque para escolher»; progresso sem «lotes»; colunas de negócio ignoradas avisam", async () => {
  const D = domDeMentira({ medias: { "(pointer: coarse)": true } });
  try {
    let soltar = null;
    const t = await montarImp(D, { rpc: async n => (n === "nx_contatos_importar" ? new Promise(r => { soltar = () => r({ criados: 2, atualizados: 0, ignorados: 0, erros: [], avisos: [] }); }) : {}) });
    assert.ok(t.tela.textContent.includes("Toque para escolher o arquivo"), "antes: «Arraste o arquivo aqui» também no celular");
    t.tela.querySelector("textarea").value = "Nome;Telefone;Valor\nAna;(12) 99830-3030;1500\nBia;(12) 99830-3131;800\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    const aviso = t.tela.querySelector(".imp-aviso-ignora");
    assert.equal(aviso.hidden, true, "com «Criar…» ligado, nada a avisar");
    t.tela.querySelector('input[name="negocio"]').dispara("change", { target: { checked: false } });
    assert.equal(aviso.hidden, false, "antes: Valor mapeado era descartado em silêncio");
    assert.match(aviso.textContent, /^A coluna Valor vai ser ignorada/);
    t.botao("Continuar").clique(); await varias();
    t.botao("Importar").clique(); await varias();
    const prog = t.tela.querySelector(".imp-prog-txt").textContent;
    assert.match(prog, /^Importando… 0 de 2 linhas\.$/, `antes: «(lotes de 100)» (${prog})`);
    soltar(); await varias(8);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("RB-127/128 Importação (DOM): queda no meio cita as linhas que podem ter entrado; «Parar aqui» encerra com o resumo e «Tentar o restante»", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const t = await montarImp(D, { rpc: async n => { if (n === "nx_contatos_importar") throw Object.assign(new Error("x"), { codigo: "sem_conexao" }); return {}; } });
    t.tela.querySelector("textarea").value = "Nome;Telefone\nAna;(12) 99830-3030\nBia;(12) 99830-3131\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Continuar").clique(); await varias();
    t.botao("Importar").clique(); await varias(10);
    assert.match(t.tela.textContent, /As linhas 2–3 podem ter entrado; confira antes de tentar o restante\./, "antes: «O que já entrou ficou salvo», e o restante reenviava o lote");
    t.botao("Baixar as linhas 2–3").clique();
    assert.equal(U.criados.length, 1, "dá para baixar as linhas do lote incerto");
    t.api.desmontar();
    // RB-128: 150 linhas = 2 lotes; «Parar aqui» durante o 1º
    let soltar = null, chamadas = 0;
    const t2 = await montarImp(D, { rpc: async n => (n === "nx_contatos_importar" ? (chamadas++, new Promise(r => { soltar = () => r({ criados: 100, atualizados: 0, ignorados: 0, erros: [], avisos: [] }); })) : {}) });
    t2.tela.querySelector("textarea").value = "Nome;Telefone\n" + Array.from({ length: 150 }, (_, i) => `P${i};(12) 9${String(80000000 + i)}`).join("\n");
    t2.botao("Usar o texto colado").clique();
    t2.botao("Continuar").clique(); await varias();
    t2.botao("Continuar").clique(); await varias();
    t2.botao("Continuar").clique(); await varias();
    t2.botao("Importar").clique(); await varias();
    const parar = t2.botao("Parar aqui");
    assert.ok(parar, "antes: só Pausar/Continuar");
    parar.clique();
    soltar(); await varias(10);
    assert.equal(chamadas, 1, "o 2º lote não foi enviado");
    assert.equal(t2.tela.querySelector("h2").textContent, "Importação parada");
    assert.match(t2.tela.textContent, /Importação parada em 100 de 150 linhas/);
    assert.ok(t2.botao("Tentar o restante"), "o restante continua de onde parou");
    t2.api.desmontar();
  } finally { U.desfazer(); D.desfazer(); }
});

/* ---------- (b) Configurações ---------- */
test("RB-145/148/138 Funis (DOM): Voltar/Cancelar com mudança perguntam; Desativar confirma; textos com o termo da vertical", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const confs = []; let resposta = false; const toasts = []; let menu = null;
    ui.confirmar = async o => { confs.push(o); return resposta; };
    ui.toast = x => { toasts.push(x); return { fechar() {} }; };
    ui.menu = (a, l) => { menu = l; return { fechar() {} }; };
    ui.seletorCor = () => h("div");
    const base = { funis: [
      { id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [{ id: "a1", nome: "Novo", tipo: "aberto", marco: "nova", probabilidade: 10 }, { id: "a3", nome: "Fechou", tipo: "ganho", marco: "fechou", probabilidade: 100 }, { id: "a4", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0 }] },
      { id: "f2", nome: "Pós-venda", ordem: 2, ativo: true, conta_no_ads: false, estagios: [{ id: "b1", nome: "Novo", tipo: "aberto", probabilidade: 10 }, { id: "b2", nome: "Feito", tipo: "ganho", probabilidade: 100 }, { id: "b3", nome: "Desistiu", tipo: "perdido", probabilidade: 0 }] }] };
    const chamadas = [];
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: async (n, p) => { chamadas.push({ n, p }); if (n === "nx_negocios_kanban") return { colunas: [] }; return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo);
    // RB-148
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pós-venda").clique();
    await menu.find(i => i && i.rotulo === "Desativar").fn(); await varias();
    assert.equal(confs.at(-1).titulo, "Desativar «Pós-venda»?", "antes: desativava direto");
    assert.equal(confs.at(-1).texto, "Ele some do quadro de toda a equipe; as oportunidades continuam guardadas.", "RB-138: o termo da vertical, no feminino");
    assert.equal(chamadas.filter(c => c.n === "nx_funil_salvar").length, 0, "recusou: nada gravado");
    // RB-145: sem mudança, Voltar sai direto
    const editar = () => alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Editar o funil Pós-venda");
    editar().clique(); await varias();
    assert.match(alvo.textContent, /recebem as oportunidades fechadas/, "RB-138: antes «os negócios fechados»");
    const n0 = confs.length;
    botaoTxt(alvo, /^Voltar$/).clique(); await varias();
    assert.equal(confs.length, n0, "nada mudou: não pergunta");
    assert.ok(editar(), "voltou à lista");
    // com uma etapa renomeada, Voltar e Cancelar perguntam (e «não» fica no editor)
    editar().clique(); await varias();
    const nome = alvo.querySelector(".fe-nome");
    nome.value = "Primeiro contato"; nome.dispara("input");
    botaoTxt(alvo, /^Voltar$/).clique(); await varias();
    assert.equal(confs.at(-1).titulo, "Sair sem salvar?", "antes: descartava a mudança calado");
    assert.ok(alvo.querySelector(".fe-nome"), "respondeu «não»: continua no editor");
    botaoTxt(alvo, /^Cancelar$/).clique(); await varias();
    assert.equal(confs.at(-1).titulo, "Sair sem salvar?");
    resposta = true;
    botaoTxt(alvo, /^Cancelar$/).clique(); await varias();
    assert.ok(editar(), "confirmou: volta à lista");
  } finally { D.desfazer(); }
});

test("RB-143 Campos (DOM): editar um campo e trocar o tipo avisa sobre os valores já preenchidos", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    let corpo = null;
    ui.modal = async o => { corpo = o.corpo; return null; };
    const base = { funis: [], campos: [{ id: 1, chave: "nasc", rotulo: "Plano", tipo: "texto", entidade: "contato", ordem: 1 }], etiquetas: [], motivos: [] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base, pode: () => true, api: { rpcC: async () => ({}) } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvo);
    alvo.querySelectorAll("button").find(b => /Editar/.test(b.attrs["aria-label"] || b.textContent)).clique(); await varias();
    const aviso = corpo.querySelector(".crm-aviso-tipo");
    assert.ok(aviso, "antes: nenhum aviso");
    assert.equal(aviso.hidden, true);
    const sel = corpo.querySelector('select[name="tipo"]');
    sel.value = "data"; sel.dispara("change");
    assert.equal(aviso.hidden, false);
    assert.match(aviso.textContent, /Valores já preenchidos que não forem do tipo novo vão aparecer como inválidos/);
    sel.value = "texto"; sel.dispara("change");
    assert.equal(aviso.hidden, true, "voltou ao tipo de antes: some");
  } finally { D.desfazer(); }
});

/* ---------- (b) crm.js e CSS ---------- */
test("RB-193/162 crm.js e CSS: importação abre com esqueleto de cartão (não tabela); nada de 11 px no quadro, na gaveta e no editor de funil", async () => {
  const C = await import("../web/app/crm.js");
  const pedidos = [];
  const ctx = { ui: { esqueleto: (tipo, o) => { pedidos.push({ tipo, o }); return {}; } } };
  C.esqueletoDe(ctx, "importar");
  assert.equal(pedidos[0].tipo, "cartao", "antes: «tabela» genérica");
  assert.ok(pedidos[0].o && pedidos[0].o.cabecalho, "com o cabeçalho da tela");
  const css = ler("crm.css");
  for (const sel of [".kb-col-n", ".ng-mini small", ".fe-n"]) {
    const regra = css.split("\n").find(l => l.startsWith(`${sel} {`));
    assert.ok(regra, sel);
    assert.equal(regra.includes("--fs-11"), false, `${sel}: antes 11 px`);
  }
  assert.match(css, /\.kb-mover \{[^}]*list-style: none/, "RB-010: a folha virou <ul> sem marcador");
});

test("CB-005 (integrador) · DDD 29 não existe: CRM e Conversas usam a mesma lista", async () => {
  const CL = await import("../web/app/crm-logica.js");
  const CV = await import("../web/app/cv-logica.js");
  assert.equal(CL.dddValido("29"), false);
  assert.equal(CL.dddValido("12"), true);
  for (let d = 10; d <= 99; d++) assert.equal(CL.RE_DDD.test(String(d)), CV.DDD_VALIDO.test(String(d)), `DDD ${d}`);
});

/* ================================================================ revisão 1000b */
test("RB-142 (revisão 1000b) · com NodeList de verdade (sem .map), a gravação que falha devolve cada botão ao disabled de antes", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const base = { funis: [], campos: [{ id: 1, chave: "a", rotulo: "A", tipo: "texto", entidade: "contato", ordem: 1 }, { id: 2, chave: "b", rotulo: "B", tipo: "texto", entidade: "contato", ordem: 2 }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e && e.message), recarregarBase: async () => base,
      api: { rpcC: async () => { throw new Error("falhou"); } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "campos").montar(ctx, alvo);
    // o navegador devolve NodeList (iterável, sem .map) — o DOM de mentira devolvia Array e escondia o defeito
    const proto = Object.getPrototypeOf(alvo);
    const qsa = proto.querySelectorAll;
    proto.querySelectorAll = function (sel) {
      const arr = qsa.call(this, sel);
      if (sel !== "button.crm-cfg-ordem") return arr;
      const nl = { length: arr.length, item: i => arr[i], [Symbol.iterator]: () => arr[Symbol.iterator](), forEach: (fn) => arr.forEach(fn) };
      arr.forEach((b, i) => { nl[i] = b; });
      return nl;
    };
    try {
      const bt = r => alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === r);
      // plano 1500c: RC-163 — o fim da lista usa aria-disabled (continua focável, com o motivo no title), não disabled
      assert.equal(bt("Subir A").getAttribute("aria-disabled"), "true", "o 1º não sobe");
      bt("Descer A").clique(); await varias();
      assert.equal(bt("Subir A").getAttribute("aria-disabled"), "true", "antes: o finally religava o Subir do 1º (NodeList.map não existe)");
      assert.equal(bt("Subir A").disabled, false, "o finally devolve o disabled de antes (falso)");
      assert.equal(bt("Descer B").getAttribute("aria-disabled"), "true", "o último continua sem Descer");
      assert.equal(bt("Descer A").disabled, false);
    } finally { proto.querySelectorAll = qsa; }
  } finally { D.desfazer(); }
});
