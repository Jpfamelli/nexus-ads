/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente crm, lote crm-1 (CRM e Início).
   node --test testes/plano1000-crm.teste.mjs
   (a) lógica pura nova (crm-logica, inicio, paleta): número no formato americano, datas comuns, textos de funil pela vertical,
       filtro por campo, duplicados/etapas da planilha, data que já passou, atalhos de prazo, dados do titular (LGPD),
       presença na meta, funil do mês acima de 100 %, «Ver tudo» da paleta;
   (b) comportamento num DOM de mentira: Kanban (arrastar/teclado com «Ver mais», reconferência de movimento ambíguo, «Ver mais»
       com recarga no meio, coluna presa, foco, rótulo curto, presença/sem data no cartão, recarga por coluna, movido por outra
       pessoa, sem internet, quadro vazio por filtro, filtros que se aplicam ao fechar, filtro por campo, carga ao rolar, visões
       no celular), gaveta e formulários (2ª edição, Esc, origem nula, menu travado, etapa atual focável, campos faltando,
       foco no título, gaveta que acompanha o pulso, R$ 0, data passada, valor inválido, negócio aberto do contato), Contatos
       (exportação, filtro do link, páginas, ficha: e-mail/UF, empresa, LGPD, consentimento; empresa: ligar contato),
       Importação (separador, duplicados, etapas/etiquetas, só as linhas com problema, sair no meio), Tarefas (linha do tempo,
       pulso, atalhos de prazo) e Início (vocabulário, detalhe técnico só para admin, ações rápidas, volta da aba, agenda no pulso);
   (c) complementos estáticos do crm.css/inicio.css (alvos de 44 px, FAB, rodapé da gaveta, só tokens).
   Sem rede, sem serviços reais.
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
const I = await import(pathToFileURL(join(APP, "inicio.js")).href);
const P = await import("../web/app/paleta.js");
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
async function montarGaveta(D, { negocio, respModal = {}, falhas = {}, presencaAusente = false, campos = [], contatoVer = null, opts = {}, ver = {} } = {}) {
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
  const N = await import("../web/app/crm-negocio.js");
  const g = await N.abrirNegocio(k, srv.neg.id, { aoMudar: c => reg.aoMudar.push(c), ...opts });
  const cham = nome => reg.chamadas.filter(c => c.nome === nome);
  const corpo = () => g.corpo;
  return { k, N, g, reg, srv, cham, corpo, desfazer: () => reg.desfazer || [] };
}


/* ============================================================ Início: o DOM de mentira do plano100-inicio (cópia) */
/* ============================================================ dados */
const HOJE = "2026-10-04";
const SP = (dia, hh, mm = "00") => `${dia}T${hh}:${mm}:00-03:00`;
const agendaDe = consultas => ({ data: HOJE, dias: 7, consultas });
const AGENDA = agendaDe([
  { negocio_id: 802, contato_id: 502, nome: "Rafael Mendes", servico: "Implante", status: "aberto", inicio: SP(HOJE, "14", "30"), fim: SP(HOJE, "15", "15") },
  { negocio_id: 801, contato_id: 501, nome: "Mariana Costa", servico: "Alinhador", status: "aberto", inicio: SP("2026-10-05", "10", "00"), fim: SP("2026-10-05", "10", "45") },
]);
/** A resposta ANTIGA de nx_inicio (antes da 20261008): nenhum campo do contrato 4. */
const ANTIGO = () => ({ hoje: HOJE, agora: SP(HOJE, "10", "00"),
  conversas: { aguardando: 2, sem_dono: 1, minhas: 1, abertas: 3, pendentes: 0, espera_mais_antiga_min: 40 },
  tarefas: { hoje: 1, atrasadas: 0, abertas: 1, proximas: [{ id: 71, tipo: "ligacao", titulo: "Confirmar avaliação", vence_em: SP(HOJE, "17"), atrasada: false, contato_id: 501, negocio_id: 801, contato_nome: "Mariana Costa" }] },
  negocios: { abertos: 18, valor_aberto: 67400, previsao_ponderada: 26200, ganhos_mes: 9, receita_mes: 28400, receita_mes_anterior: 20300, receita_mes_anterior_parcial: 20300, dia_do_mes: 4 },
  leads: { hoje: 4, hoje_anuncio: 2, semana: 23, semana_anuncio: 14 },
  canais: [{ id: "cw1", nome: "Recepção", numero_exibicao: "+55 00 00000-0001", status: "ativo", app_inscrito: true, ultima_entrada_em: new Date().toISOString() }],
  notificacoes_nao_lidas: 0 });
const SERIE = (base, passo = 1) => Array.from({ length: 14 }, (_, i) => base + (i % 4) * passo);
/** A resposta NOVA (contrato 4, como o dev-falso): prazo, quem espera, funil do mês, séries de 14 dias e o estado do aparelho. */
const NOVO = () => {
  const d = ANTIGO();
  d.conversas.respondidas_no_prazo_pct = 78;
  d.conversas.aguardando_lista = [{ id: 901, nome: "Mariana Costa", espera_min: 15, canal: "codewords" }, { id: 902, nome: null, espera_min: 40, canal: "meta" }];
  d.funil_mes = { leads: 23, conversas: 19, agendados: 11, ganhos: 9 };
  d.series_14d = { aguardando: [...SERIE(1).slice(0, 12), 5, 2], consultas: SERIE(2), valor_aberto: SERIE(60000, 1000), leads: SERIE(3) };
  d.canais[0] = { ...d.canais[0], provedor: "codewords", estado: "conectado", desde: null, sync_em: null };
  return d;
};
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get childElementCount() { return this.children.length; }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns.flat(Infinity)) { if (n === null || n === undefined || n === false) continue; this.appendChild(typeof n === "object" && n.nodeType ? n : new Texto(n)); } }
    after(...ns) { const p = this.parentNode; if (!p) return; const ref = this.nextSibling; for (const n of ns) p.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), ref); }
    replaceChildren(...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) o.fn(ev); };
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
  /* seletores: tag, #id, .classe, [attr], [attr=v], [attr^=v], :not(...), :disabled, lista com vírgula, descendente e filho (>) */
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
      this.offsetWidth = 0; this.offsetLeft = 0; this.clientWidth = 0;
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
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    get title() { return this.attrs.get("title") || ""; }
    matches(sel) { return casaLista(this, sel); }
    closest(sel) { for (let p = this; p && p.nodeType === 1; p = p.parentNode) if (p.matches(sel)) return p; return null; }
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
    scrollIntoView() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    getClientRects() { return []; }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.head = doc.documentElement.appendChild(new El("head")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.hidden = false;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.contains = n => doc.documentElement.contains(n);
  return { doc, Evento, El };
}
/**
 * Instala o DOM de mentira, localStorage em memória e os globais que a tela usa; devolve utilidades e fim().
 * `agora` (ms) liga um relógio de mentira: new Date() / Date.now() devolvem esse instante, e dom.andar(ms) o adianta.
 * setInterval é guardado (não roda sozinho): dom.relogio() roda os intervalos de 60 s, como se um minuto tivesse passado.
 */
function comDom({ agora = null } = {}) {
  const { doc, Evento } = criarDom();
  const salvo = {};
  const mem = new Map();
  const intervalos = new Map(); let seqInt = 0;
  const DataReal = Date;
  let falso = agora;
  class DataFalsa extends DataReal {
    constructor(...a) { super(...(a.length ? a : [falso])); }
    static now() { return falso; }
  }
  const globais = {
    document: doc, Event: Evento,
    matchMedia: () => ({ matches: true }),                         // movimento reduzido: a troca do esqueleto é síncrona e nada anima
    requestAnimationFrame: f => setTimeout(() => f(performance.now()), 0), cancelAnimationFrame: t => clearTimeout(t),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    CSS: { escape: s => String(s) },
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); }, clear: () => mem.clear() },
    addEventListener: () => {}, removeEventListener: () => {},
    setInterval: (fn, ms) => { const id = ++seqInt; intervalos.set(id, { fn, ms }); return id; },
    clearInterval: id => { intervalos.delete(id); },
    ...(agora !== null ? { Date: DataFalsa } : {}),
  };
  for (const [k, v] of Object.entries(globais)) { salvo[k] = globalThis[k]; globalThis[k] = v; }
  return { doc, Evento, mem, ev: (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init)),
    intervalos, andar: ms => { falso += ms; }, get agora() { return falso; },
    relogio: () => { for (const { fn, ms } of [...intervalos.values()]) if (ms === 60000) fn(); },
    fim() { try { I.desmontar(); } catch { /* ok */ } for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
const tick = () => new Promise(r => setTimeout(r, 5));
const ID_CLI = "cli-1", ID_CONTA = "conta-1";
const texto = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

/**
 * ctx de mentira com as RPCs desta rodada: nx_cv_atribuir (resp.atribuir: função, Error ou promessa pendente), nx_tarefa_concluir, e o
 * `ctx.canais` do shell (contrato A4) com caidos()/assinar()/verNumero() — `canais.mudar(lista)` faz o papel do pulso do shell.
 */
async function montarTela(d, { dom, agenda = AGENDA, papel = "admin", conta = ID_CONTA, semCanais = false, inicioLento = null, esperarMontar = true } = {}) {
  const U = await import(pathToFileURL(join(APP, "ui.js")).href);
  const ui = { ...U };
  const chamadas = [], navegou = [], toasts = [];
  const resp = { d, agenda, atribuir: null, tarefa: null };
  let aoPulso = null;
  const canais = { lista: [], fns: new Set(), viu: 0,
    mudar(l) { canais.lista = l; for (const fn of [...canais.fns]) fn(l.slice()); } };
  ui.toast = (t, o = {}) => { toasts.push({ texto: t, tipo: o.tipo }); return { fechar() {}, el: null }; };
  const ctx = {
    alvo: dom.doc.body.appendChild(dom.doc.createElement("main")), versao: "T", rota: { query: {} },
    sessao: { conta: { id: conta, nome: "Helena Souza" }, org: {} },
    cliente: { id: ID_CLI, slug: "demo", nome: "Clínica Demo", vertical: "odonto", modulos: ["conversas", "crm", "ads", "relatorios"] },
    papel, pode: p => (p === "admin" ? papel === "admin" : true), temModulo: () => true, pronto: () => true, configPronta: () => true,
    vocab: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", g_negocio: "a", vertical: "odonto" },
    api: { async rpcC(nome, params) {
      chamadas.push({ nome, params });
      if (nome === "nx_inicio") { if (inicioLento) await inicioLento; return resp.d; }
      if (nome === "nx_agenda_dia") return resp.agenda;
      if (nome === "nx_onboarding_estado") return { total: 11, feitos: 11, obrigatorios: 9, obrigatorios_feitos: 9, pct: 100, completo: true, itens: [] };
      if (nome === "nx_cv_atribuir") { const r = resp.atribuir; if (r instanceof Error) throw r; if (typeof r === "function") return r(params); return r || { id: params.p_conversa, atribuida_a: params.p_conta }; }
      if (nome === "nx_tarefa_concluir") { if (resp.tarefa instanceof Error) throw resp.tarefa; return { ok: true }; }
      return null;
    }, mensagemErro: e => String(e && e.message || e) },
    ui, navegar: h => navegou.push(h), abrirNegocio() {}, abrirContato() {}, titulo() {}, badge() {},
    pulso: { assinar: fn => { aoPulso = fn; return () => { aoPulso = null; }; } }, naoAtualizar: () => () => {},
    canais: semCanais ? undefined : { caidos: () => canais.lista.slice(), assinar: fn => { canais.fns.add(fn); return () => canais.fns.delete(fn); }, verNumero: () => { canais.viu++; } },
  };
  const extras = { ctx, chamadas, navegou, toasts, resp, canais, raiz: ctx.alvo, pulso: async () => { aoPulso(); await tick(); await tick(); } };
  if (!esperarMontar) { extras.pronto = I.montar(ctx).then(tick); await tick(); return extras; }
  await I.montar(ctx); await tick();
  assert.equal(ctx.alvo.querySelector(".vazio-erro"), null, "a tela não caiu no cartão de erro");
  return extras;
}
const kpiIds = raiz => raiz.querySelectorAll(".ini-kpi").map(k => k.dataset.kpi);

/* ============================================================ (a) lógica pura */
test("CR-114 lerNumero: o ÚLTIMO separador decide o decimal — «1,234.56» (planilha em inglês) e «1.234,56» dão 1234,56", () => {
  assert.equal(L.lerNumero("1,234.56"), 1234.56);
  assert.equal(L.lerNumero("1.234,56"), 1234.56);
  assert.equal(L.lerNumero("1234.5"), 1234.5);
  assert.equal(L.lerNumero("R$ 3.500"), 3500, "milhar brasileiro sem decimal continua");
  assert.equal(L.lerNumero("1,234,567"), 1234567, "milhar americano sem decimal");
  assert.equal(L.lerNumero("6800"), 6800);
  assert.equal(L.lerNumero("12,5"), 12.5);
  assert.equal(L.lerNumero("mil"), null);
  assert.equal(L.dinheiroInvalido("1,234.56"), false);
});

test("CR-119 lerData: DD-MM-AAAA, DD.MM.AAAA, ano com 2 dígitos e o número de série do Excel", () => {
  assert.equal(L.lerData("02/03/1990"), "1990-03-02");
  assert.equal(L.lerData("02-03-1990"), "1990-03-02");
  assert.equal(L.lerData("02.03.1990"), "1990-03-02");
  assert.equal(L.lerData("02/03/90"), "1990-03-02", "≥ 30 → 19xx");
  assert.equal(L.lerData("02/03/15"), "2015-03-02", "< 30 → 20xx");
  assert.equal(L.lerData("32874"), "1990-01-01", "série do Excel");
  assert.equal(L.lerData("31/02/1990"), null, "dia que não existe");
  assert.equal(L.lerData("123"), null);
  assert.equal(L.lerData("1990-12-31"), "1990-12-31");
  assert.deepEqual(L.checarLinha({ nome: "Ana", nascimento: "02-03-90" }), [], "a importação aceita");
});

test("CR-207 textoErro com o vocabulário: nenhuma frase de funil diz «negócio» na clínica, com a concordância certa", () => {
  const vocab = { min: x => ({ negocio: "oportunidade", negocios: "oportunidades" })[x], art: () => "a" };
  const casos = [["funil_invalido", "fechado_no_ads"], ["funil_invalido", "sai_do_ads"], ["estagio_invalido", "fechado"], ["funil_invalido", "entra_no_ads"],
    ["estagio_invalido", "etapa_com_negocios"], ["funil_invalido", "tem_fechados"], ["estagio_invalido", "destino_tipo"], ["funil_invalido", "mover"], ["estagio_com_negocios", "3"], ["estagio_com_negocios", ""]];
  for (const [codigo, hint] of casos) {
    const t = L.textoErro({ codigo, hint }, { vocab });
    assert.ok(!/neg[oó]cio/i.test(t), `${codigo}/${hint}: «${t}»`);
  }
  assert.equal(L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }, { vocab }), "Oportunidade fechada no funil de anúncios não muda de funil. Use Iniciar pós-venda.");
  assert.equal(L.textoErro({ codigo: "estagio_invalido", hint: "fechado" }, { vocab }), "Uma oportunidade nova começa numa etapa aberta.");
  assert.equal(L.textoErro({ codigo: "estagio_com_negocios", hint: "1" }, { vocab }), "Essa etapa tem 1 oportunidade. Escolha para onde ela vai.");
  assert.equal(L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }), "Negócio fechado no funil de anúncios não muda de funil. Use Iniciar pós-venda.", "sem vocab, o texto de sempre");
  assert.match(ler("crm.js"), /textoErro\(e, \{ campos: k\.base\.campos, vocab: ctx\.vocab,/, "o kit passa o vocabulário");
});

test("CR-013 filtro por campo: operadores pelo tipo, valor normalizado como o servidor espera, chip legível e a visão salva o filtro", () => {
  const campos = [{ chave: "convenio", rotulo: "Convênio", tipo: "opcao", opcoes: ["Unimed", "Amil"], entidade: "contato" },
    { chave: "idade", rotulo: "Idade", tipo: "numero", entidade: "contato" }, { chave: "retorno", rotulo: "Retorno", tipo: "data", entidade: "contato" },
    { chave: "vip", rotulo: "VIP", tipo: "sim_nao", entidade: "contato" }];
  assert.deepEqual(L.opsDoCampo("numero"), ["igual", "maior", "menor", "vazio", "preenchido"]);
  assert.deepEqual(L.opsDoCampo("opcao"), ["igual", "vazio", "preenchido"]);
  assert.deepEqual(L.opsDoCampo("texto"), ["igual", "contem", "vazio", "preenchido"]);
  assert.deepEqual(L.filtroCampoLimpo({ chave: "convenio", op: "igual", valor: "Unimed" }, campos), { chave: "convenio", op: "igual", valor: "Unimed" });
  assert.deepEqual(L.filtroCampoLimpo({ chave: "idade", op: "maior", valor: "1.000" }, campos), { chave: "idade", op: "maior", valor: "1000" });
  assert.deepEqual(L.filtroCampoLimpo({ chave: "retorno", op: "menor", valor: "02/03/2026" }, campos), { chave: "retorno", op: "menor", valor: "2026-03-02" });
  assert.deepEqual(L.filtroCampoLimpo({ chave: "vip", op: "igual", valor: "true" }, campos), { chave: "vip", op: "igual", valor: "true" });
  assert.deepEqual(L.filtroCampoLimpo({ chave: "convenio", op: "vazio", valor: "x" }, campos), { chave: "convenio", op: "vazio" });
  assert.equal(L.filtroCampoLimpo({ chave: "idade", op: "maior", valor: "abc" }, campos), null, "o servidor recusaria");
  assert.equal(L.filtroCampoLimpo({ chave: "convenio", op: "contem", valor: "U" }, campos), null, "operador que não serve para opção");
  assert.equal(L.filtroCampoLimpo({ chave: "naoexiste", op: "igual", valor: "1" }, campos), null);
  assert.equal(L.filtroCampoLimpo({ chave: "convenio", op: "igual", valor: "" }, campos), null);
  assert.equal(L.textoFiltroCampo({ chave: "convenio", op: "igual", valor: "Unimed" }, campos), "Convênio: Unimed");
  assert.equal(L.textoFiltroCampo({ chave: "convenio", op: "vazio" }, campos), "Convênio: vazio");
  assert.equal(L.textoFiltroCampo({ chave: "idade", op: "maior", valor: "40" }, campos), "Idade maior que 40");
  assert.equal(L.textoFiltroCampo({ chave: "vip", op: "igual", valor: "false" }, campos), "VIP: não");
  const v = L.normalizarVisoesCRM([{ id: "v1", nome: "Unimed", dados: { filtro: { campo: { chave: "convenio", op: "igual", valor: "Unimed" } }, ordem: "nome" } }], "contatos");
  assert.deepEqual(v[0].dados.filtro.campo, { chave: "convenio", op: "igual", valor: "Unimed" }, "a visão salva leva o filtro por campo");
});

test("CR-118/123 planilha: a mesma pessoa duas vezes (com/sem 55 e 9, ou e-mail) e etapas/etiquetas que não existem", () => {
  const linhas = [{ nome: "Ana", telefone: "(12) 99830-3030" }, { nome: "Bia", email: "bia@x.com" }, { nome: "Ana 2", telefone: "5512998303030" },
    { nome: "Bia 2", email: "BIA@x.com" }, { nome: "Caio", telefone: "(12) 3456-7890" }];
  const d = L.duplicadosPlanilha(linhas, [2, 3, 4, 19, 6]);
  assert.deepEqual(d.map(g => [g.tipo, g.linhas]), [["telefone", [2, 4]], ["email", [3, 19]]]);
  assert.deepEqual(L.duplicadosPlanilha([{ nome: "x" }]), []);
  const est = [{ nome: "Nova conversa", tipo: "aberto" }, { nome: "Agendou", tipo: "aberto" }, { nome: "Fechado", tipo: "ganho" }];
  const cf = L.conferirPlanilha([{ estagio: "agendou" }, { estagio: "Fechado" }, { estagio: "Negociação" }, { etiquetas: "VIP; Retorno|Implante" }], { estagios: est, etiquetas: [{ nome: "vip" }] });
  // plano 1500c: RC-011 — a etapa fechada continua sem valer, mas sai do aviso «não existe» para o aviso próprio (etapa_fechada)
  assert.deepEqual(cf.etapasDesconhecidas, ["Negociação"], "sem acento/maiúscula casa");
  assert.deepEqual(cf.etapasFechadas, ["Fechado"], "etapa fechada não vale (aviso próprio)");
  assert.deepEqual(cf.etiquetasNovas, ["Retorno", "Implante"]);
});

test("CR-052/144 dataPassou e atalhos de prazo (São Paulo)", () => {
  const agora = new Date(2026, 9, 13, 12, 0).getTime();
  assert.equal(L.dataPassou("2026-10-12", agora), true);
  assert.equal(L.dataPassou("2026-10-13", agora), false, "hoje não passou");
  assert.equal(L.dataPassou("2026-10-13T09:00", agora), true);
  assert.equal(L.dataPassou("2026-10-13T18:00", agora), false);
  assert.equal(L.dataPassou("", agora), false);
  assert.deepEqual(L.atalhosPrazo("2026-10-13").map(a => [a.rotulo, a.valor]), [["Hoje 18h", "2026-10-13T18:00"], ["Amanhã 9h", "2026-10-14T09:00"], ["Em 3 dias", "2026-10-16T09:00"], ["Próx. segunda", "2026-10-19T09:00"]]);
  assert.equal(L.atalhosPrazo("2026-10-12").at(-1).valor, "2026-10-19T09:00", "numa segunda, a próxima segunda é daqui a 7 dias");
  // plano 1500c: RC-026 — 31/10 é sábado; o «amanhã» pula o domingo e vai para segunda 02/11 (a virada do mês continua certa)
  assert.equal(L.atalhosPrazo("2026-10-31")[1].valor, "2026-11-02T09:00", "virada do mês");
  assert.equal(L.atalhosPrazo("2026-10-31", { pularFimDeSemana: false })[1].valor, "2026-11-01T09:00", "virada do mês sem pular o fim de semana");
});

test("CR-103 dadosTitular: cadastro, consentimento, negócios, tarefas, notas, atendimentos e histórico — só do titular", () => {
  const d = { contato: { id: 501, nome: "Ana", telefone: "5512998303030", email: "ana@x.com", optin_marketing: false, optin_em: "2026-10-01", optin_origem: "WhatsApp", senha: "nunca" },
    empresa: { id: 7, nome: "Frota X" }, negocios: [{ id: 1, titulo: "Implante", status: "aberto", valor_previsto: 900 }], tarefas: [{ id: 2, titulo: "Ligar" }],
    notas: [{ id: 3, texto: "prefere manhã" }], conversas: [{ id: 4, protocolo: "2026-1" }], tempo: [{ tipo: "estagio", em: "2026-10-01" }] };
  const t = L.dadosTitular(d, { geradoEm: "2026-10-13T12:00:00Z" });
  assert.equal(t.titular, "Ana");
  assert.equal(t.cadastro.id, 501); assert.equal(t.cadastro.senha, undefined, "só os campos do cadastro");
  assert.deepEqual(t.consentimento, { optin_marketing: false, optin_em: "2026-10-01", optin_origem: "WhatsApp" });
  assert.deepEqual([t.negocios.length, t.tarefas.length, t.notas.length, t.atendimentos.length, t.historico.length], [1, 1, 1, 1, 1]);
  assert.deepEqual(t.empresa, { id: 7, nome: "Frota X" });
  assert.equal(L.dadosTitular({}), null);
});

test("CR-157/168 Início: presença «Faltou» conta como falta (mesmo sem a etapa) e «compareceu» à parte; funil do mês acima de 100 %", () => {
  const agora = Date.parse("2026-10-13T15:00:00Z");
  const ag = { consultas: [{ inicio: "2026-10-10T13:00:00Z", status: "aberto", presenca: "faltou", marco: null },
    { inicio: "2026-10-11T13:00:00Z", status: "aberto", campos: { presenca: "compareceu" } }, { inicio: "2026-10-12T13:00:00Z", status: "aberto" },
    { inicio: "2026-10-20T13:00:00Z", status: "aberto" }] };
  assert.deepEqual(I.contagemConsultasMes(ag, { agora }), { realizadas: 2, marcadas: 1, faltas: 1, compareceu: 1 });
  const f = I.funilMes({ funil_mes: { leads: 10, conversas: 13, agendados: 5, ganhos: 2 } });
  assert.equal(f.etapas[1].conversao, "mais que a etapa anterior");
  assert.match(f.etapas[1].dica, /^130% dos leads/);   // plano 1000b: RB-158/245 «130%» sem espaço e de QUAL etapa
  assert.equal(f.etapas[2].conversao, "38% das conversas");
});

test("CR-185 paleta: «Ver tudo em Pacientes com “mar”» leva à lista com a busca; negócios ao quadro; conversas não", () => {
  assert.deepEqual(P.verTodosDaBusca({ titulo: "Pacientes", itens: [{ tipo: "contato" }] }, "mar"), { tipo: "contato", l1: "Ver tudo em Pacientes com “mar”", hash: "#/contatos?busca=mar" });
  assert.equal(P.verTodosDaBusca({ titulo: "Oportunidades", itens: [{ tipo: "negocio" }] }, "ana souza").hash, "#/crm?busca=ana%20souza");
  assert.equal(P.verTodosDaBusca({ titulo: "Conversas", itens: [{ tipo: "conversa" }] }, "mar"), null);
  assert.equal(P.verTodosDaBusca({ titulo: "Pacientes", itens: [] }, "mar"), null);
  assert.equal(P.verTodosDaBusca({ titulo: "Pacientes", itens: [{ tipo: "contato" }] }, "m"), null);
});

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

test("CR-001 Kanban (DOM): arrastar com o mouse para o FIM de uma coluna com «Ver mais» — sem NotFoundError, marcador antes do .kb-mais-item e a ordem pelo vizinho do servidor", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(30, "s1"), 45), s2: col("s2", cartoes(1, "s2", 100)) }),
      coluna: async () => ({ itens: [{ id: 31, titulo: "C31", status: "aberto", estagio_id: "s1", ordem: 310 }], tem_mais: true }) });
    const art = t.cartao(100);
    art.dispara("pointerdown", { button: 0, clientX: 10, clientY: 10, pointerType: "mouse", pointerId: 1 });
    D.sob(t.tela.querySelector('.kb-col[data-estagio="s1"]'));
    assert.doesNotThrow(() => D.janela("pointermove", { pointerId: 1, clientX: 200, clientY: 900 }), "cada pointermove lançava NotFoundError");
    const filhos = t.lista("s1").els;
    assert.ok(filhos.at(-2).classList.contains("kb-lugar") && filhos.at(-1).classList.contains("kb-mais-item"), "o lugar fica antes do «Ver mais»");
    D.janela("pointerup", { pointerId: 1 });
    for (let i = 0; i < 6; i++) await tique();
    assert.equal(t.chamadas("nx_negocios_coluna").at(-1).p.p_offset, 30, "pergunta ao servidor quem vem depois do 30º");
    const mv = t.reg.movidos.at(-1);
    assert.deepEqual([mv.id, mv.dest], [100, "s1"]);
    assert.ok(mv.ordem > 300 && mv.ordem < 310, `ordem entre o último carregado e o próximo do servidor (${mv.ordem})`);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-002/202 Kanban (DOM): teclado leva o cartão da posição 36 para a coluna com «Ver mais» (antes do .kb-mais-item, «posição 31 de 31») e o Enter anuncia na hora", async () => {
  const D = domDeMentira();
  try {
    let soltarPrep;
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(36, "s1")), s2: col("s2", cartoes(30, "s2", 200), 45) }),
      N: { prepararMovimento: () => new Promise(r => { soltarPrep = r; }) }, coluna: async () => ({ itens: [], tem_mais: false }) });
    const art = t.cartao(36);
    tecla(art, " ");
    assert.doesNotThrow(() => tecla(art, "ArrowRight"), "o cartão ficava preso no modo «pego»");
    assert.equal(art.parentElement, t.lista("s2"));
    assert.ok(art.nextSibling && art.nextSibling.classList.contains("kb-mais-item"));
    assert.equal(t.reg.avisos.at(-1), "Etapa «Agendada», posição 31 de 31.");
    tecla(art, "Enter");
    assert.equal(t.reg.avisos.at(-1), "Soltou em «Agendada», posição 31.", "CR-202: o leitor ouve onde soltou antes da gravação (plano 1000b: RB-206 — sem «Gravando…» quando vem a pergunta da data)");
    assert.equal(t.reg.movidos.length, 0);
    for (let i = 0; i < 4; i++) await tique();
    soltarPrep({}); for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.reg.movidos.at(-1).dest, "s2");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-003/042 Kanban (DOM): resposta ambígua + conferência que falha — o pulso volta a recarregar e em 15 s a reconferência solta o pendente", async () => {
  const D = domDeMentira();
  let vezes = 0;
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1")), s2: col("s2", cartoes(1, "s2", 2)) }),
      N: { moverNegocio: async () => { throw Object.assign(new Error("tempo"), { codigo: "tempo_esgotado" }); } },
      rpc: async nome => { if (nome === "nx_negocio_ver") { vezes++; if (vezes === 1) throw Object.assign(new Error("rede"), { codigo: "sem_conexao" }); return { negocio: { id: 1, estagio_id: "s2" } }; } return {}; } });
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight"); tecla(art, "Enter");
    for (let i = 0; i < 10; i++) await imediato();
    assert.equal(vezes, 1, "conferiu uma vez e não soube");
    assert.ok(t.cartao(1).classList.contains("confirmando"), "fica «confirmando» enquanto não sabe");
    const antes = t.chamadas("nx_negocios_kanban").length;
    mock.timers.tick(9000);
    t.reg.pulso(); for (let i = 0; i < 6; i++) await imediato();
    assert.equal(t.chamadas("nx_negocios_kanban").length, antes + 1, "movimento JÁ ENVIADO não trava mais o pulso");
    mock.timers.tick(6000);                         // 15 s depois do erro: a reconferência
    for (let i = 0; i < 10; i++) await imediato();
    assert.equal(vezes, 2, "reconferiu no servidor");
    assert.equal(t.chamadas("nx_negocios_kanban").length, antes + 2, "e recarregou o quadro");
    assert.ok(!t.cartao(1).classList.contains("confirmando"), "o cartão saiu do «confirmando»");
    t.api.desmontar();
  } finally { mock.timers.reset(); D.desfazer(); }
});

test("CR-272/022 Kanban (DOM): «Ver mais» sem tem_mais fixa o total no que veio (o botão some); o foco vai ao 1º cartão novo e o leitor ouve quantos chegaram", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(30, "s1"), 45) }), coluna: async () => ({ itens: cartoes(5, "s1", 501), tem_mais: false }) });
    const bt = t.lista("s1").querySelector(".kb-mais");
    bt.focus(); bt.clique();
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.lista("s1").querySelector(".kb-mais"), null, "10 saíram da etapa depois da carga: «Ver mais (10)» ficava preso");
    // plano 1000b: RB-011 — o número vem com «cartões» só para o leitor de tela (span sr-only)
    assert.equal(t.tela.querySelector('.kb-col[data-estagio="s1"] .kb-col-n').textContent, "35 cartões");
    assert.equal(D.ativo(), t.cartao(501), "o foco não volta ao topo da página");
    assert.equal(t.reg.avisos.at(-1), "5 cartões carregados em Nova.");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-004 Kanban (DOM): «Ver mais» que chega DEPOIS de trocar a busca não mistura cartões do filtro antigo", async () => {
  const D = domDeMentira();
  try {
    let liberar;
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(30, "s1"), 45) }), coluna: () => new Promise(r => { liberar = r; }) });
    t.lista("s1").querySelector(".kb-mais").clique(); await tique();
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "Zé"; busca.dispara("input");
    for (let i = 0; i < 4; i++) await tique();
    liberar({ itens: cartoes(5, "s1", 901), tem_mais: true });
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.cartao(901), null, "a página do filtro antigo não entra");
    assert.equal(t.chamadas("nx_negocios_coluna")[0].p.p_filtro.busca, undefined, "o pedido foi com o filtro de antes");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-028 Kanban (DOM): rolar até o «Ver mais» carrega a próxima página sozinho; acima de 300 cartões para e avisa para usar a busca", async () => {
  const obs = [];
  const antes = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.alvos = []; obs.push(this); } observe(el) { this.alvos.push(el); } unobserve(el) { this.alvos = this.alvos.filter(x => x !== el); } disconnect() { this.alvos = []; } };
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(30, "s1"), 45), s2: col("s2", cartoes(300, "s2", 1000), 500) }), coluna: async () => ({ itens: cartoes(15, "s1", 601), tem_mais: false }) });
    const item = t.lista("s1").querySelector(".kb-mais-item");
    assert.ok(obs.length === 1 && obs[0].alvos.includes(item), "o «Ver mais» da coluna é observado");
    const item2 = t.lista("s2").querySelector(".kb-mais-item");
    assert.ok(!obs[0].alvos.includes(item2), "coluna com 300 na tela não carrega mais sozinha");
    assert.match(item2.querySelector(".kb-mais-aviso").textContent, /^Mostrando 300 de 500\. Use a busca ou os filtros/);
    obs[0].cb([{ isIntersecting: true, target: item }]);
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.chamadas("nx_negocios_coluna").length, 1);
    assert.ok(t.cartao(601), "a página chegou sem clique");
    t.api.desmontar();
    assert.equal(obs[0].alvos.length, 0, "desmontar desliga o observador");
  } finally { D.desfazer(); if (antes) Object.defineProperty(globalThis, "IntersectionObserver", antes); else delete globalThis.IntersectionObserver; }
});

test("CR-021/027/217/006 Kanban (DOM): rótulo curto com detalhes por aria-describedby; «presença» na consulta que passou; «sem data» em Agendada; «Minhas oportunidades»", async () => {
  const D = domDeMentira();
  try {
    const longo = { id: 1, titulo: "Implante protocolo superior com enxerto ósseo e prótese provisória imediata", status: "aberto", estagio_id: "s1", valor_previsto: 12000,
      contato: { id: 9, nome: "Mariana Costa" }, servico: "Implante", consulta_em: iso(-1, 10), dono_id: "u1", etiquetas: ["e1", "e2"], nao_lidas: 3, origem: "site", campos: { score: 80 } };
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", [longo, { id: 2, titulo: "Bia", status: "aberto", estagio_id: "s1", consulta_em: iso(-2), campos: { presenca: "compareceu" } }]),
      s2: col("s2", [{ id: 3, titulo: "Caio", status: "aberto", estagio_id: "s2" }, { id: 4, titulo: "Duda", status: "aberto", estagio_id: "s2", consulta_em: iso(2) }]) }),
      usuario: id => (id === "u1" ? { id, nome: "Helena" } : null), etiqueta: id => ({ id, nome: id === "e1" ? "VIP" : "Retorno" }) });
    const c1 = t.cartao(1);
    assert.ok(c1.attrs["aria-label"].length <= 80, `rótulo curto (${c1.attrs["aria-label"].length})`);
    // plano 1000b: RB-034 — a instrução longa saiu do cartão (fica no quadro); o cartão aponta só para os detalhes
    const [idDet, idInstr] = [c1.attrs["aria-describedby"], t.tela.querySelector(".kb").attrs["aria-describedby"]];
    const det = c1.querySelectorAll(".sr-only").find(x => x.attrs.id === idDet);
    assert.ok(det && /consulta/.test(det.textContent) && /responsável Helena/.test(det.textContent) && /etiquetas VIP, Retorno/.test(det.textContent), "os detalhes ficam no texto ligado");
    assert.match(idInstr, /^kb-instr-/);
    const pres = c1.querySelector(".kc-presenca");
    assert.ok(pres, "consulta de ontem sem presença marcada: o ponto âmbar");
    pres.clique();
    assert.deepEqual(t.reg.abertos, [1], "abre a gaveta (o bloco da presença está no topo)");
    assert.equal(t.cartao(2).querySelector(".kc-presenca"), null, "presença já marcada");
    assert.ok(t.cartao(3).querySelector(".kc-semdata"), "Agendada sem data");
    assert.equal(t.cartao(4).querySelector(".kc-semdata"), null);
    assert.equal(t.cartao(1).querySelector(".kc-semdata"), null, "fora da etapa de agendamento não");
    assert.ok(t.tela.querySelectorAll("button.crm-atalho").some(b => b.textContent === "Minhas oportunidades"), "o termo da vertical");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-024 Kanban (DOM): preferência por conta, sem a busca gravada; a chave antiga (só da empresa) é lida uma vez e apagada", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-kb-cli-p1000", JSON.stringify({ filtro: { busca: "Mariana", dono: "eu" } }));
    const t = await montarKb(D, { dados: quadroDe() });
    assert.equal(t.tela.querySelector('input[type="search"]').value, "", "a busca de outra pessoa não volta");
    assert.equal(t.chamadas("nx_negocios_kanban")[0].p.p_filtro.dono, "eu", "o resto da preferência continua");
    assert.equal(D.storage.has("nx-app-crm-kb-cli-p1000"), false, "a chave antiga saiu");
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "Ana 12998"; busca.dispara("input"); await tique();
    const salvo = JSON.parse(D.storage.get("nx-app-crm-kb-cli-p1000-u1"));
    assert.equal(salvo.filtro.busca, undefined, "nome/telefone digitado não fica no aparelho");
    assert.equal(salvo.filtro.dono, "eu");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-023/204 Kanban (DOM): recarga silenciosa refaz só as colunas que mudaram; o cartão que outra pessoa moveu acende", async () => {
  const D = domDeMentira();
  try {
    const v1 = quadroDe({ s1: col("s1", cartoes(2, "s1")), s2: col("s2", cartoes(1, "s2", 3)), s5: col("s5", [{ id: 7, titulo: "C7", status: "ganho", estagio_id: "s5", valor: 10 }]) });
    const t = await montarKb(D, { dados: v1 });
    const c7 = t.cartao(7), c1 = t.cartao(1);
    t.trocar(quadroDe({ s1: col("s1", [cartoes(1, "s1")[0]]), s2: col("s2", [...cartoes(1, "s2", 3), { ...cartoes(2, "s1")[1], estagio_id: "s2" }]), s5: v1.colunas[2] }));
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "C"; busca.dispara("input");
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.cartao(7), c7, "a coluna que não mudou manteve os nós");
    assert.notEqual(t.cartao(1), c1, "a que mudou foi refeita");
    assert.equal(t.cartao(2).parentElement, t.lista("s2"));
    assert.ok(t.cartao(2).classList.contains("kc-movido"), "chegou de outra etapa sem ter sido esta tela");
    // lote crm-2 (CR-031): depois da busca o leitor também ouve quantos cartões sobraram — o aviso do movido continua
    assert.ok(t.reg.avisos.includes("«C2» foi para Agendada."), t.reg.avisos.join(" | "));
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-025 Kanban (DOM): sem internet o movimento é recusado ANTES das perguntas e o cartão volta", async () => {
  const D = domDeMentira();
  const antes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1")), s2: col("s2", []) }) });
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight"); tecla(art, "Enter");
    for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(t.reg.prep, [], "nenhuma pergunta (valor, motivo, data)");
    assert.equal(t.reg.movidos.length, 0);
    assert.match(t.reg.toasts.at(-1), /^Sem internet: o cartão não foi movido/);
    assert.equal(t.cartao(1).parentElement, t.lista("s1"), "o cartão está de volta na origem");
    assert.equal(t.lista("s2").querySelectorAll(".kc").length, 0);
    t.api.desmontar();
  } finally { D.desfazer(); if (antes) Object.defineProperty(globalThis, "navigator", antes); else delete globalThis.navigator; }
});

test("CR-200/185 Kanban (DOM): ?busca do link (paleta) entra no filtro; funil vazio com busca diz «Nada com estes filtros» e o Limpar tira a busca", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe(), rota: { query: { busca: "Mariana" } } });
    assert.equal(t.chamadas("nx_negocios_kanban")[0].p.p_filtro.busca, "Mariana");
    const vazio = t.tela.querySelector(".vazio-sem_resultado");
    assert.ok(vazio && /^Nada com estes filtros neste funil\./.test(vazio.textContent), "não parece «funil vazio»");
    vazio.querySelector(".vazio-acao").clique(); await tique();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.busca, undefined);
    assert.equal(t.tela.querySelector('input[type="search"]').value, "");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-012/013 Kanban (DOM): fechar o popover aplica o que foi marcado; filtro por campo personalizado vai em p_filtro.campo com o chip", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe(), base: { campos: [{ chave: "convenio", rotulo: "Convênio", tipo: "opcao", opcoes: ["Unimed", "Amil"], entidade: "negocio" }] } });
    const btF = t.tela.querySelector(".crm-filtro-bt");
    btF.clique();
    const site = t.reg.flut.conteudo.querySelectorAll('input[type="checkbox"]').find(i => i.value === "site");
    site.checked = true; site.dispara("change");
    t.reg.flut.api.fechar(); await tique();                     // tocou fora / Esc
    assert.deepEqual(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.origem, ["site"], "antes: descartado sem aviso");
    assert.ok(t.tela.querySelector(".crm-chips").textContent.includes("Origem: Site"));
    btF.clique();
    const c = t.reg.flut.conteudo;
    const selCampo = c.querySelector(".crm-fc-campo");
    selCampo.value = "convenio"; selCampo.dispara("change");
    const valor = c.querySelector(".crm-fc-valor select");
    valor.value = "Unimed";
    c.querySelectorAll("button").find(b => b.textContent === "Aplicar").clique(); await tique();
    assert.deepEqual(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.campo, { chave: "convenio", op: "igual", valor: "Unimed" });
    assert.ok(t.tela.querySelector(".crm-chips").textContent.includes("Convênio: Unimed"));
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-008 Kanban (DOM): no celular as visões salvas abrem dentro de Filtros e voltam para a linha ao fechar", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const t = await montarKb(D, { dados: quadroDe() });
    const casa = t.controles.el.parentElement;
    assert.ok(casa.classList.contains("crm-kb-ferramentas"));
    t.tela.querySelector(".crm-filtro-bt").clique();
    assert.ok(t.reg.flut.conteudo.querySelector(".crm-filtros-visoes").contains(t.controles.el), "dentro do popover");
    t.reg.flut.api.fechar();
    assert.equal(t.controles.el.parentElement, casa, "de volta");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (b) gaveta do negócio e formulários */
const campoDe = (raiz, rotulo) => raiz.querySelectorAll(".ng-campo").find(c => c.querySelector("dt") && c.querySelector("dt").textContent === rotulo);

test("CR-047/057 linhaEd (DOM): a 2ª edição durante a gravação é gravada depois; Esc devolve o dinheiro formatado («6.800,00»)", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const N = await import("../web/app/crm-negocio.js");
    const ui = uiDeMentira(h, {});
    const k = { ui, h, L, erro: e => String(e) };
    const salvos = [], pendentes = [];
    const inp = h("input", { type: "text", value: "1" });
    const [bloco] = N.linhaEd(k, { rotulo: "Obs", controle: inp, ler: c => c.value, salvar: v => new Promise(r => { salvos.push(v); pendentes.push(r); }) });
    h0(D, "div", null, bloco);
    inp.value = "2"; inp.dispara("blur");
    inp.value = "3"; inp.dispara("blur");                   // mudou de novo antes da resposta
    assert.deepEqual(salvos, ["2"]);
    pendentes[0](); for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(salvos, ["2", "3"], "antes: o 3 nunca era gravado e nada avisava");
    pendentes[1](); await tique();
    inp.dispara("blur"); await tique();
    assert.equal(salvos.length, 2, "o mesmo valor não grava de novo");
    // Esc no campo de dinheiro
    const din = h("input", { type: "text", value: "6.800,00" });
    N.linhaEd(k, { rotulo: "Valor", controle: din, ler: c => L.lerNumero(c.value), salvar: async () => {} });
    din.value = "7000"; din.dispara("keydown", { key: "Escape" });
    assert.equal(din.value, "6.800,00", "antes: «6800»");
  } finally { D.desfazer(); }
});

test("CR-046/069/050 gaveta (DOM): origem nula aparece «não informada» (nada gravado); a etapa atual fica focável; o foco abre no título", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { origem: null } });
    const sel = campoDe(t.corpo(), "Origem").querySelector("select");
    const op0 = sel.els[0];
    assert.deepEqual([op0.value, op0.textContent, op0.selected], ["", "— não informada —", true], "antes: mostrava «Anúncio» (a 1ª opção)");
    assert.equal(t.cham("nx_negocio_salvar").length, 0);
    const atual = t.corpo().querySelectorAll(".ng-etapa").find(b => b.attrs["aria-current"] === "step");
    assert.equal(atual.disabled, false, "não é <button disabled> (o leitor pulava)");
    assert.equal(atual.attrs["aria-disabled"], "true");
    assert.match(atual.textContent, /etapa atual/);
    await esperar(90);
    assert.ok(D.ativo() && D.ativo().classList.contains("ng-titulo-txt"), "o foco não cai num select (seta trocava o responsável)");
    const t2 = await montarGaveta(D, { negocio: { origem: "site" } });
    // lote crm-2 (CR-094): «Anúncio» só aparece quando já é a origem gravada — a 1ª opção agora é WhatsApp
    assert.equal(campoDe(t2.corpo(), "Origem").querySelector("select").els[0].value, "whatsapp", "com origem gravada não há a opção vazia");
  } finally { D.desfazer(); }
});

test("CR-048 gaveta (DOM): com «Fechou» nos 7 s do Desfazer, «Mover para outro funil» e «Excluir» ficam travados; depois voltam", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { respModal: { valor: 900 } });
    let itens = null;
    t.k.ui.menu = (anc, lista) => { itens = lista; return { fechar() {} }; };
    const menu = () => t.corpo().querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações");
    t.corpo().querySelector(".ng-ganhou").clique(); await tique(); await tique();
    menu().clique();
    const mover = itens.find(i => i && /^Mover para outro funil/.test(i.rotulo)), excluir = itens.find(i => i && /^Excluir/.test(i.rotulo));
    assert.equal(mover.desabilitado, true); assert.equal(excluir.desabilitado, true);
    assert.match(mover.rotulo, /espere o «Desfazer» terminar/);
    const av = t.desfazer()[0];
    await av.reverter(); av.res({ estado: "desfeita" }); await tique();
    menu().clique();
    assert.equal(itens.find(i => i && /^Mover para outro funil/.test(i.rotulo)).desabilitado, false);
  } finally { D.desfazer(); }
});

test("CR-070 gaveta (DOM): «Falta 1 campo» no topo quando há obrigatório vazio — e leva ao bloco Campos; preenchido, some", async () => {
  const D = domDeMentira();
  try {
    const campos = [{ chave: "convenio", rotulo: "Convênio", tipo: "texto", obrigatorio: true, entidade: "negocio", ativo: true }];
    const t = await montarGaveta(D, { campos });
    const pil = t.corpo().querySelector(".ng-faltam");
    assert.ok(pil && pil.textContent.includes("Falta 1 campo"));
    assert.equal(pil.attrs.title, "Convênio");
    pil.clique();
    assert.ok(t.corpo().querySelector('section[aria-label="Campos"]'), "o Resumo com o bloco Campos está na tela");
    const t2 = await montarGaveta(D, { campos, negocio: { campos: { convenio: "Unimed" } } });
    assert.equal(t2.corpo().querySelector(".ng-faltam"), null);
  } finally { D.desfazer(); }
});

test("CR-067 gaveta (DOM): aberta, acompanha o que outra pessoa mudou (pulso, no máximo a cada 15 s); sem mudança não redesenha", async () => {
  const D = domDeMentira();
  const agora = Date.now;
  try {
    const t = await montarGaveta(D);
    assert.equal(typeof t.reg.pulso, "function", "a gaveta assina o pulso");
    const n0 = t.cham("nx_negocio_ver").length;
    t.reg.pulso(); await tique();
    assert.equal(t.cham("nx_negocio_ver").length, n0, "acabou de ler: espera 15 s");
    Date.now = () => agora() + 20000;
    const titulo = t.corpo().querySelector(".ng-titulo-txt");
    t.reg.pulso(); for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.cham("nx_negocio_ver").length, n0 + 1);
    assert.equal(t.corpo().querySelector(".ng-titulo-txt"), titulo, "nada mudou: a gaveta não foi redesenhada");
    t.srv.neg.estagio_id = "s4";                            // um colega moveu para «Faltou»
    Date.now = () => agora() + 40000;
    t.reg.pulso(); for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.corpo().querySelectorAll(".ng-etapa").find(b => b.attrs["aria-current"] === "step").textContent.startsWith("Faltou"), true);
    t.g.fechar();
    assert.equal(t.reg.pulso, null, "fechar solta o pulso");
  } finally { Date.now = agora; D.desfazer(); }
});

test("CR-053/052 perguntas ao mover (DOM): R$ 0 pede a 2ª confirmação no próprio modal; data de consulta no passado também", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    const modalDuasVezes = async ({ acoes }) => {
      const prim = acoes.find(a => a.tipo === "primario"), erros = [];
      const api = { erro: x => erros.push(x) };
      return { r1: await prim.fn(api), r2: await prim.fn(api), erros };
    };
    t.k.ui.modal = modalDuasVezes;
    const g = await t.N.prepararMovimento(t.k, { id: 801, estagio_id: "s2", valor_previsto: 0, titulo: "Ana" }, ETAPAS.find(e => e.id === "s5"));
    assert.equal(g.r1, false, "1º Confirmar com R$ 0: pergunta");
    assert.match(g.erros[0], /^Valor zero não entra na receita do anúncio\. Confirmar mesmo assim\?/);
    assert.deepEqual(g.r2, { valor: 0 }, "2º Confirmar: aceita");
    t.k.ui.lerForm = () => ({ consulta_em: "2020-01-02T10:00" });
    const a = await t.N.prepararMovimento(t.k, { id: 801, estagio_id: "s1", titulo: "Ana" }, ETAPAS.find(e => e.id === "s2"));
    assert.equal(a.r1, false);
    assert.match(a.erros[0], /^Essa data já passou\. O lembrete automático não vai rodar/);
    assert.deepEqual(a.r2, { consulta_em: "2020-01-02T10:00" });
    // na gaveta: previsão de fechamento no passado avisa (sem bloquear a gravação)
    const prev = campoDe(t.corpo(), "Previsão de fechamento").querySelector("input");
    prev.value = "2020-01-01"; prev.dispara("change"); prev.dispara("blur"); await tique();
    const aviso = campoDe(t.corpo(), "Previsão de fechamento").querySelector(".ed-aviso");
    assert.ok(aviso && !aviso.hidden && aviso.textContent === "Essa data já passou.");
    assert.ok(t.cham("nx_negocio_salvar").some(c => c.p.p_negocio.previsao_fechamento === "2020-01-01"), "ainda é possível salvar");
  } finally { D.desfazer(); }
});

test("CR-060/061 novo negócio (DOM): «mil» no valor dá erro no campo sem ir ao servidor; contato com negócio aberto ganha o aviso com «Abrir»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { contatoVer: { contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030" }, negocios: [{ id: 5, titulo: "Implante", status: "aberto" }, { id: 6, titulo: "Clareamento", status: "ganho" }] } });
    const erros = [];
    t.k.ui.marcarErro = (form, nome, txt) => { if (nome) erros.push([nome, txt]); };
    await t.N.novoNegocio(t.k, { contato_id: 501 }, {});
    const g = t.reg.gavetas.at(-1);
    const aviso = g.corpo.querySelector(".crm-ja-aberto");
    assert.ok(aviso, "decisão 1: quem volta continua no mesmo negócio — avisa antes de duplicar");
    assert.match(aviso.textContent, /Já tem 1 oportunidade aberta: «Implante»/);
    assert.ok(aviso.querySelectorAll("button").some(b => b.textContent === "Abrir"));
    g.corpo.querySelector('[name="valor_previsto"]').value = "mil";
    g.corpo.querySelector("form").dispara("submit"); for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(erros.at(-1), ["valor_previsto", "Valor inválido. Use só números, por exemplo 1.500,00."]);
    assert.equal(t.reg.chamadas.filter(c => c.nome === "nx_negocio_salvar").length, 0, "antes: criava sem valor, em silêncio");
  } finally { D.desfazer(); }
});

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

test("CR-075/076 Contatos (DOM): o botão mostra o progresso da exportação; sair da tela no meio NÃO baixa planilha parcial", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const paginas = [];
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 5000, tem_mais: true },
      rpc: (nome, p) => (nome === "nx_contatos_exportar" ? new Promise(r => paginas.push(r)) : undefined) });
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    const bt = tela.querySelectorAll("button").find(b => b.textContent.includes("Exportar"));
    bt.clique(); await tique();
    assert.match(bt.textContent, /^Exportando… 0 de ~5000 · Cancelar$/);
    paginas[0]({ itens: Array.from({ length: 2000 }, (_, i) => ({ id: i })), tem_mais: true }); for (let i = 0; i < 3; i++) await tique();
    assert.match(bt.textContent, /^Exportando… 2000 de ~5000/, "antes: só o botão girando");
    api.desmontar();                                           // a pessoa saiu da tela
    paginas[1]({ itens: [{ id: 9 }], tem_mais: true }); for (let i = 0; i < 3; i++) await tique();
    assert.equal(U.criados.length, 0, "nenhum arquivo parcial");
    assert.match(t.reg.toasts.at(-1), /^Exportação interrompida ao sair da tela \(2000 pacientes lidos\): nenhum arquivo foi baixado/);
  } finally { U.desfazer(); D.desfazer(); }
});

test("CR-077/126/079 Contatos (DOM): filtro do link vale só na visita (não é gravado); ?origem/?criado_de da importação; «Página 200 de 400»", async () => {
  const D = domDeMentira();
  try {
    D.storage.set("nx-app-crm-ct-cli-ct", JSON.stringify({ filtro: { busca: "velha", dono: "eu" }, ordem: "nome" }));
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 20000, tem_mais: true } });
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: { empresa: "5", empresa_nome: "Frota X" } });
    assert.deepEqual(t.cham("nx_contatos_listar")[0].p.p_filtro, { empresa_id: "5", empresa_nome: "Frota X" }, "o link manda (a busca guardada não volta)");
    assert.equal(D.storage.has("nx-app-crm-ct-cli-ct"), false, "a chave antiga saiu");
    const sel = tela.querySelector("select.sel"); sel.value = "recentes"; sel.dispara("change"); await tique();
    const salvo = JSON.parse(D.storage.get("nx-app-crm-ct-cli-ct-u1"));
    assert.equal(salvo.filtro.empresa_id, undefined, "abrir «Pacientes» pelo menu depois não fica preso na empresa");
    assert.equal(salvo.filtro.dono, "eu", "a preferência de antes continua guardada");
    // página: digitar 200 e Enter
    const campo = tela.querySelector(".ct-pag-n");
    assert.ok(campo, "com o total conhecido há «Página __ de N»");
    assert.equal(campo.attrs.max, "400");
    campo.value = "200"; campo.dispara("keydown", { key: "Enter" }); await tique();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_pagina, 200, "antes: 199 cliques em «Próxima»");
    api.desmontar();
    const t2 = await montarCt(D);
    const tela2 = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api2 = await t2.M.montarContatos(t2.k, tela2, { query: { origem: "importacao", criado_de: "2026-10-13" } });
    assert.deepEqual(t2.cham("nx_contatos_listar")[0].p.p_filtro, { origem: ["importacao"], criado_de: "2026-10-13" });
    assert.ok(tela2.querySelector(".crm-chips").textContent.includes("Origem: Importação"), "com os chips");
    api2.desmontar();
    assert.match(ler("crm-importar.js"), /href: `#\/contatos\?origem=importacao&criado_de=\$\{encodeURIComponent\(ui\.hojeSP\(\)\)\}/, "o fim da importação leva a esta lista");
  } finally { D.desfazer(); }
});

test("CR-013/012 Contatos (DOM): filtro por campo do contato e o fechar que aplica", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { base: { campos: [{ chave: "convenio", rotulo: "Convênio", tipo: "texto", entidade: "contato" }] } });
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    tela.querySelector(".crm-filtro-bt").clique();
    const c = t.reg.flut.conteudo;
    const selCampo = c.querySelector(".crm-fc-campo"); selCampo.value = "convenio"; selCampo.dispara("change");
    const op = c.querySelector(".crm-fc-op"); op.value = "contem";
    c.querySelector(".crm-fc-valor input").value = "Uni";
    t.reg.flut.api.fechar(); await tique();
    assert.deepEqual(t.cham("nx_contatos_listar").at(-1).p.p_filtro.campo, { chave: "convenio", op: "contem", valor: "Uni" });
    assert.ok(tela.querySelector(".crm-chips").textContent.includes("Convênio contém Uni"));
    api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-098/095/106/103/046 ficha (DOM): e-mail e UF conferidos sem ir ao servidor; ligar e tirar da empresa; consentimento claro; dados do titular (LGPD)", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const contato = { id: 501, nome: "Ana", telefone: "5512998303030", email: null, origem: null, optin_marketing: null };
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_contato_ver") return { contato: { ...contato }, empresa: null, negocios: [], conversas: [], tarefas: [], notas: [], tempo: [] };
      if (nome === "nx_empresas_listar") return { itens: [{ id: 7, nome: "Frota X", cidade: "Taubaté" }] };
      if (nome === "nx_contato_salvar") return { ...contato, ...p.p_contato };
      return undefined;
    } });
    t.k.nomes = () => ({}); t.k.motivosPorId = () => ({});
    let itensMenu = null;
    t.ui.menu = (a, l) => { itensMenu = l; return { fechar() {} }; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, el, 501, {});
    const email = campoDe(el, "E-mail").querySelector("input");
    email.value = "ana@"; email.dispara("blur"); await tique();
    assert.equal(t.cham("nx_contato_salvar").length, 0, "antes: ia ao servidor e voltava com erro genérico");
    assert.match(campoDe(el, "E-mail").querySelector(".ed-erro").textContent, /^E-mail inválido/);
    // plano 1500c: RC-109 — a UF virou lista das 27 (não dá mais para digitar «São»); continua sem ir ao servidor à toa
    const uf = campoDe(el, "UF").querySelector("select");
    assert.ok(uf, "UF é um select");
    assert.ok(uf.querySelectorAll("option").some(o => o.textContent === "SP"), "a lista tem SP");
    assert.ok(!campoDe(el, "UF").querySelector("input"), "sem caixa de texto");
    assert.equal(t.cham("nx_contato_salvar").length, 0);
    // empresa
    const busca = el.querySelector(".fx-emp-busca");
    busca.value = "Fro"; busca.dispara("input"); for (let i = 0; i < 3; i++) await tique();
    el.querySelector(".fx-empresa .crm-busca-res button").clique(); for (let i = 0; i < 3; i++) await tique();
    assert.deepEqual(t.cham("nx_contato_salvar").at(-1).p.p_contato, { id: 501, empresa_id: 7 });
    assert.equal(el.querySelector(".fx-empresa a").attrs.href, "#/empresas/7");
    el.querySelector(".fx-emp-tirar").clique(); for (let i = 0; i < 3; i++) await tique();
    assert.deepEqual(t.cham("nx_contato_salvar").at(-1).p.p_contato, { id: 501, empresa_id: null });
    // consentimento e origem
    assert.ok(el.textContent.includes("Sem registro — pode receber marketing até pedir para sair"));
    assert.equal(campoDe(el, "Origem").querySelector("select").els[0].textContent, "— não informada —");
    // LGPD
    el.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    const lgpd = itensMenu.find(i => i && i.rotulo === "Baixar dados do titular (LGPD)");
    assert.ok(lgpd, "direito de acesso ao lado do «Excluir»");
    lgpd.fn();
    // plano 1000b: RB-263 — junto do JSON vai um .txt legível (2 arquivos)
    assert.equal(U.criados.length, 2);
    const json = JSON.parse(await U.criados[0].text());
    assert.equal(json.cadastro.id, 501); assert.ok("consentimento" in json && Array.isArray(json.negocios));
  } finally { U.desfazer(); D.desfazer(); }
});

test("CR-222 novo contato (DOM): etiquetas e responsável já no cadastro", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D, { base: { usuarios: [{ id: "u2", nome: "Bruno" }], etiquetas: [{ id: "e1", nome: "VIP" }] } });
    let aoMudarEtq = null;
    t.ui.seletorEtiquetas = o => { aoMudarEtq = o.aoMudar; return D.h("div", { class: "sel-etiq" }); };
    t.ui.lerForm = () => ({ nome: "Ana", origem: "manual" });
    t.ui.modal = async ({ acoes, corpo }) => {
      aoMudarEtq(["e1"]);
      const sel = corpo.querySelectorAll("select").find(s => s.name === "dono_id");
      if (sel) sel.value = "u2";
      return acoes.find(a => a.tipo === "primario").fn({ erro() {} });
    };
    const r = await t.M.formContato(t.k);
    assert.equal(r.id, 777);
    const p = t.cham("nx_contato_salvar").at(-1).p.p_contato;
    assert.deepEqual(p.etiquetas, ["e1"]);
    assert.equal(p.dono_id, "u2");
  } finally { D.desfazer(); }
});

test("CR-096 empresa (DOM): «Ligar paciente» busca e liga um contato à empresa", async () => {
  const D = domDeMentira();
  try {
    let emp = { empresa: { id: 7, nome: "Frota X" }, contatos: [], negocios: [] };
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_empresa_ver") return emp;
      if (nome === "nx_contatos_listar") return { itens: [{ id: 501, nome: "Rafael", telefone: "5512998303030" }] };
      if (nome === "nx_contato_salvar") { emp = { ...emp, contatos: [{ id: 501, nome: "Rafael" }] }; return { id: 501 }; }
      return undefined;
    } });
    let modal = null;
    t.ui.modal = o => new Promise(res => { modal = { ...o, fechar: res }; if (o.aoAbrir) o.aoAbrir({ fechar: res, erro() {} }); });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 7, {});
    el.querySelector(".emp-ligar").clique(); await tique();
    const busca = modal.corpo.querySelector('input[type="search"]');
    busca.value = "Raf"; busca.dispara("input"); for (let i = 0; i < 3; i++) await tique();
    modal.corpo.querySelector('.crm-busca-res button').clique(); for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(t.cham("nx_contato_salvar").at(-1).p.p_contato, { id: 501, empresa_id: 7 });
    assert.ok(el.textContent.includes("Rafael"), "a página da empresa já lista o contato");
  } finally { D.desfazer(); }
});

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

test("CR-115 Importação (DOM): o separador escolhido sozinho pode ser trocado e a planilha é relida na hora", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    t.tela.querySelector("textarea").value = "Nome;Valor\nAna;1,5\nBia;2,5\n";
    t.botao("Usar o texto colado").clique();
    assert.match(t.tela.querySelector(".imp-arq small").textContent, /2 colunas · separador ponto e vírgula/);
    const sep = t.tela.querySelector(".imp-sep");
    sep.value = ","; sep.dispara("change");
    assert.match(t.tela.querySelector(".imp-arq small").textContent, /separador vírgula/, "relido com a vírgula");
    assert.equal(t.tela.querySelector(".imp-sep").els.find(o => o.selected).value, ",", "o seletor mostra a escolha");
  } finally { D.desfazer(); }
});

test("CR-118/123/121 Importação (DOM): na prévia, a mesma pessoa repetida, etapa que não existe, etiqueta nova e «só as linhas com problema»", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    t.tela.querySelector("textarea").value = "Nome;Telefone;Etapa;Etiquetas\nAna;(12) 99830-3030;Fechado;VIP\nAna 2;5512998303030;Nova;\nZé;123;;\nBia;(12) 99777-3031;;\nCaio;(12) 99777-3032;;\nDuda;(12) 99777-3033;;\nEli;(12) 99777-3034;;\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique();
    t.botao("Continuar").clique();
    // plano 1000b: RB-130 — o termo da vertical (odonto: «paciente»)
    assert.match(t.tela.querySelector(".imp-aviso-dup").textContent, /1 paciente aparece mais de uma vez.*telefone \(12\) 99830-3030 nas linhas 2, 3/);
    // plano 1500c: RC-011 — «Fechado» (etapa de ganho) tem o aviso próprio: fechadas não entram pela planilha
    assert.match(t.tela.querySelector(".imp-aviso-fechada").textContent, /«Fechado».*1ª etapa aberta/);
    assert.match(t.tela.querySelector(".imp-aviso-etq").textContent, /Etiqueta nova que será criada: «VIP»/);
    assert.equal(t.reg.linhas.length, 5, "a prévia mostra as 5 primeiras");
    t.botao("Ver só as linhas com problema (1)").clique();
    assert.deepEqual(t.reg.linhas.map(l => l._linha), [4], "a linha do telefone «123», com o número da linha na planilha");
  } finally { D.desfazer(); }
});

test("CR-117 Importação (DOM): enquanto importa a atualização automática espera; sair no meio avisa até onde foi", async () => {
  const D = domDeMentira();
  try {
    let guarda = null, soltou = false;
    const t = await montarImp(D, { rpc: () => new Promise(() => {}), naoAtualizar: fn => { guarda = fn; return () => { soltou = true; }; } });
    t.tela.querySelector("textarea").value = "Nome;Telefone\nAna;(12) 99830-3030\n";
    t.botao("Usar o texto colado").clique();
    t.botao("Continuar").clique(); t.botao("Continuar").clique(); t.botao("Continuar").clique();
    assert.equal(guarda(), false);
    t.botao("Importar 1 linha").clique(); await tique();
    assert.equal(guarda(), true, "importando: o shell não troca de versão no meio");
    t.api.desmontar();
    assert.match(t.reg.toasts.at(-1), /^Importação parada em 0 de 1 linhas porque você saiu da tela/);
    assert.equal(soltou, true);
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Tarefas */
test("CR-063 linha do tempo (DOM): chips «Tudo · Notas · Etapas · Conversas · Automações» filtram os eventos", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const k = { ui, h, L, v: V, nomes: () => ({}), motivosPorId: () => ({}) };
    const itens = [{ fonte: "nota", tipo: "nota", em: iso(0), dados: { texto: "prefere manhã" } }, { tipo: "estagio", em: iso(0), dados: {} }, { tipo: "ganho", em: iso(-1), dados: {} },
      { tipo: "automacao", em: iso(-1), dados: { nome: "Boas-vindas" } }, { tipo: "conversa_aberta", em: iso(-2), dados: {} }];
    const bloco = h0(D, "div", null, T.blocoTempo(k, itens));
    const chips = bloco.querySelectorAll(".tempo-filtro");
    assert.deepEqual(chips.map(c => c.dataset.filtro), ["tudo", "nota", "etapas", "conversa", "automacao"]);
    assert.equal(bloco.querySelectorAll(".tempo-it").length, 5);
    chips[1].clique();
    assert.equal(bloco.querySelectorAll(".tempo-it").length, 1, "só a nota");
    assert.equal(chips[1].attrs["aria-pressed"], "true");
    chips[2].clique();
    assert.equal(bloco.querySelectorAll(".tempo-it").length, 2, "etapa + ganho");
    chips[0].clique();
    assert.equal(bloco.querySelectorAll(".tempo-it").length, 5);
  } finally { D.desfazer(); }
});

test("CR-144/052 tarefa (DOM): atalhos de prazo preenchem o campo; prazo no passado avisa", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    let corpo = null;
    ui.modal = async o => { corpo = o.corpo; return null; };
    const k = { ui, h, L, base: { usuarios: [] }, eu: () => "u1", rascunho: () => ({ apagar() {} }), novaReq: () => "r", escrever: async () => ({}) };
    await T.formTarefa(k, null, {});
    const vence = corpo.querySelector('[name="vence_em"]');
    const atalhos = corpo.querySelectorAll(".tf-atalho");
    // plano 1500c: RC-025/026 — os rótulos dependem da hora (sem «Hoje» à noite) e do dia da semana; confere contra a própria lógica, pelo id
    // plano 1500c: RX-021 — a tela mostra os atalhos SEM repetir o mesmo instante (fim de semana: «Seg 9h» = «Próx. segunda»)
    const esperados = L.atalhosPrazoUnicos(ui.hojeSP(), { agora: Date.now() });
    assert.deepEqual(atalhos.map(b => b.textContent), esperados.map(a => a.rotulo));
    const alvo = esperados.find(a => a.id === "tres") || esperados.find(a => a.id === "amanha");
    atalhos.find(b => b.dataset.valor === alvo.valor).clique();
    assert.equal(vence.value, alvo.valor);
    vence.value = "2020-01-01T09:00"; vence.dispara("change");
    const av = corpo.querySelector(".tf-prazo .ed-aviso");
    assert.ok(!av.hidden && /^Essa data já passou/.test(av.textContent));
  } finally { D.desfazer(); }
});

test("CR-140 Tarefas (DOM): o pulso (no máximo a cada 30 s) e a volta para a aba recarregam a lista", async () => {
  const D = domDeMentira();
  const agora = Date.now;
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const reg = {};
    const ui = uiDeMentira(h, reg);
    const chamadas = [];
    let pulso = null;
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {},
      ctx: { titulo() {}, navegar() {}, pulso: { assinar: fn => { pulso = fn; return () => { pulso = null; }; } } },
      api: { rpcC: async (nome, p) => { chamadas.push(nome); return { itens: [], contagens: {} }; } } };
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: {} });
    const n = () => chamadas.filter(c => c === "nx_tarefas_listar").length;
    assert.equal(n(), 1);
    pulso(); await tique();
    assert.equal(n(), 1, "logo depois de carregar, espera");
    Date.now = () => agora() + 31000;
    pulso(); await tique();
    assert.equal(n(), 2, "antes: o pulso era assinado com uma função vazia");
    Date.now = () => agora() + 70000;
    D.documento("visibilitychange"); await tique();
    assert.equal(n(), 3, "ao voltar para a aba");
    api.desmontar();
    assert.equal(pulso, null);
  } finally { Date.now = agora; D.desfazer(); }
});

/* ============================================================ (b) Início */
test("CR-158/175 Início (DOM): «paciente esperando há…» pelo vocabulário; o erro técnico do número só para o admin, recolhido", async () => {
  const d = () => { const x = NOVO(); x.canais[0] = { ...x.canais[0], status: "erro", ultimo_erro: "Invalid OAuth access token - Cannot parse access token" }; return x; };
  let dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const { raiz } = await montarTela(d(), { dom, papel: "atendente" });
    const txt = texto(raiz);
    // plano 1000b: RB-160 — com 2 esperando, «A mais antiga espera há…» (antes «paciente esperando há…», minúsculo e no singular)
    assert.ok(txt.includes("A mais antiga espera há") && txt.includes("pacientes esperando resposta"), "antes: «cliente esperando» fixo");
    assert.ok(!txt.includes("cliente esperando"));
    assert.ok(!txt.includes("Invalid OAuth"), "atendente não vê o texto técnico em inglês");
  } finally { dom.fim(); }
  dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const { raiz } = await montarTela(d(), { dom, papel: "admin" });
    const det = raiz.querySelector("details.ini-canal-erro");
    assert.ok(det && det.textContent.includes("Invalid OAuth"), "o admin vê, recolhido em «Detalhe técnico»");
    assert.equal(det.open, false);
  } finally { dom.fim(); }
});

test("CR-171 Início (DOM): ações rápidas sob a manchete — «Nova oportunidade», «Nova tarefa», «Marcar consulta» (as mesmas da paleta)", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const t = await montarTela(NOVO(), { dom });
    const feitos = [];
    t.ctx.novoNegocio = (dados, o) => { feitos.push(["negocio", dados]); return null; };
    t.ctx.carregar = async nome => (nome === "crm"
      ? { kit: async () => ({ mod: async () => ({ formTarefa: async () => { feitos.push(["tarefa"]); return { id: 1 }; } }) }) }
      : { marcarConsulta: async () => { feitos.push(["consulta"]); } });
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    const rap = t.raiz.querySelector(".ini-rapidas");
    assert.ok(rap, "a linha de ações rápidas existe para quem escreve");
    const bts = rap.querySelectorAll("button");
    // plano 1500c: RC-296 — «Novo paciente» entrou entre «Nova tarefa» e «Marcar consulta» (testado no plano1500c-inicio)
    assert.deepEqual(bts.map(b => b.dataset.k), ["rap-negocio", "rap-tarefa", "rap-contato", "rap-consulta"]);
    assert.ok(bts[3].textContent.includes("Marcar consulta"), "a palavra da agenda na vertical");
    for (const b of bts.filter(b => b.dataset.k !== "rap-contato")) { b.click(); await tick(); }
    assert.deepEqual(feitos.map(f => f[0]), ["negocio", "tarefa", "consulta"]);
    assert.ok(t.toasts.some(x => x.texto === "Tarefa criada."));
  } finally { dom.fim(); }
  assert.match(ler("inicio.js"), /function acoesRapidas\(\) \{\s*if \(!escreve\) return null;/, "só para quem escreve");
});

test("CR-166/170 Início (DOM): voltar para a aba relê na hora (passados 30 s); no pulso a agenda da semana é reaproveitada por 2 min", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const t = await montarTela(NOVO(), { dom });
    const n = nome => t.chamadas.filter(c => c.nome === nome).length;
    const inicio0 = n("nx_inicio"), agenda0 = n("nx_agenda_dia");
    dom.andar(31000);
    dom.ev(dom.doc, "visibilitychange"); await tick(); await tick();
    assert.equal(n("nx_inicio"), inicio0 + 1, "antes: nada até o próximo pulso");
    assert.equal(n("nx_agenda_dia"), agenda0, "a semana lida há 31 s vale");
    dom.andar(31000);
    await t.pulso(); await tick();
    assert.equal(n("nx_inicio"), inicio0 + 2);
    assert.equal(n("nx_agenda_dia"), agenda0, "pulso dentro de 2 min: sem reler a semana");
    dom.andar(125000);
    await t.pulso(); await tick();
    assert.equal(n("nx_agenda_dia"), agenda0 + 1, "passados 2 min, relê");
  } finally { dom.fim(); }
});

/* ============================================================ (c) estáticos */
test("crm.css/inicio.css (plano 1000): só tokens; 44 px no toque; FAB não cobre cartões/paginação; rodapé da gaveta quebra em 2 linhas; KPI em 2 linhas", () => {
  const css = ler("crm.css");
  const bloco = css.slice(css.indexOf("Plano 1000 (13/10/2026) — frente crm"));
  assert.ok(bloco.length > 1000);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bloco) && !/\brgba?\(/.test(bloco), "sem cor fixa");
  assert.match(bloco, /\.tf-check \{ width: 44px; height: 44px;/, "CR-148");
  assert.match(bloco, /\.crm\[data-tela="kanban"\] \.kb-env \{ padding-bottom: calc\(56px \+ 16px\); \}/, "CR-009");
  assert.match(bloco, /\.crm\[data-tela="contatos"\] \.ct-pag \{ padding-bottom/, "CR-078");
  assert.match(bloco, /\.ng-acoes-rodape \.ng-acoes \{ flex-wrap: wrap; overflow-x: visible; \}/, "CR-049");
  assert.match(bloco, /\.crm\[data-tela="kanban"\] \.crm-kb-ferramentas > \.crm-visoes \{ display: none; \}/, "CR-008");
  assert.match(bloco, /@media \(min-width: 1024px\) \{\s*\.crm\[data-tela="kanban"\] \.crm-kb-ferramentas \{ display: flex;/, "CR-007");
  const semMov = bloco.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
  assert.ok(!/animation:|@keyframes/.test(semMov), "movimento só fora de reduced-motion");
  const ini = ler("inicio.css");
  const bi = ini.slice(ini.indexOf("Plano 1000 (13/10/2026)"));
  assert.match(bi, /\.ini-kpi-sub \{ white-space: normal;[^}]*-webkit-line-clamp: 2;/, "CR-163");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bi));
});


/* ============================================================
   Lote crm-2 (13/10/2026) — CRM e Início. Mesmo DOM de mentira e mesmos montadores acima.
   ============================================================ */
const B2 = (D, tag, attrs, ...f) => D.h(tag, attrs, ...f);
const varias = async (n = 6) => { for (let i = 0; i < n; i++) await tique(); };
const botaoTxt = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent));

/* ---------- (a) lógica pura ---------- */
test("CR-129 montarLinhas: «São Paulo» vira SP, «Indicação»/«Whats» viram a origem; Instagram fica como veio (não vira anúncio)", () => {
  const l = L.montarLinhas([["Ana", "São Paulo", "Indicação"], ["Bia", "Estado do Rio de Janeiro", "whats"], ["Caio", "sp", "Instagram"]], ["nome", "uf", "origem"]);
  assert.deepEqual(l.map(x => [x.uf, x.origem]), [["SP", "indicacao"], ["RJ", "whatsapp"], ["SP", "Instagram"]]);
  assert.deepEqual(L.checarLinha(l[0]), [], "antes: «UF deve ter 2 letras»");
  assert.equal(L.ufDaPlanilha("Narnia"), "Narnia");
});

test("CR-111/112 documento e site: dígito verificador de CPF/CNPJ, máscara e https:// no site", () => {
  assert.equal(L.docValido("529.982.247-25"), "cpf");
  assert.equal(L.docValido("11.222.333/0001-81"), "cnpj");
  assert.equal(L.docValido("11.111.111/1111-11"), null);
  assert.match(L.avisoDoc("11.111.111/1111-11"), /^CNPJ com dígito verificador que não confere/);
  assert.equal(L.avisoDoc("RG 12.345"), null, "outro documento não avisa");
  assert.equal(L.formatarDoc("11222333000181"), "11.222.333/0001-81");
  assert.equal(L.formatarDoc("52998224725"), "529.982.247-25");
  assert.equal(L.normalizarSite("www.empresa.com"), "https://www.empresa.com");
  assert.equal(L.normalizarSite("http://a.com"), "http://a.com");
  assert.equal(L.normalizarSite("javascript:alert(1)"), null);
  assert.equal(L.normalizarSite(""), null);
});

test("CR-150 adiarTarefa: +1 h (do agora ou do vencimento futuro), amanhã e próxima segunda 9h (SP)", () => {
  const agora = new Date("2026-10-13T15:00:00Z");     // terça
  assert.equal(L.adiarTarefa(null, "hora", agora), "2026-10-13T16:00:00.000Z");
  assert.equal(L.adiarTarefa("2026-10-13T20:00:00Z", "hora", agora), "2026-10-13T21:00:00.000Z");
  assert.equal(L.adiarTarefa(null, "semana", agora), "2026-10-19T12:00:00.000Z");
  assert.equal(L.adiarTarefa("2026-10-13T12:00:00Z", "amanha", agora), L.adiarParaAmanha("2026-10-13T12:00:00Z", agora));
});

test("CR-019/032/138 distribuição com vazias à parte, ganhos do quadro e «Sem prazo»", () => {
  const cols = [{ estagio_id: "s1", total: 3 }, { estagio_id: "s2", total: 0 }, { estagio_id: "s5", total: 2, soma_valor: 900 }];
  const d = L.partesDistribuicao(cols, ETAPAS);
  assert.deepEqual(d.cheias.map(x => x.e.id), ["s1", "s5"]);
  assert.deepEqual(d.vazias.map(x => x.e.id), ["s2", "s4", "s6"]);
  assert.deepEqual(L.ganhosDoQuadro(cols, ETAPAS), { valor: 900, n: 2 });
  const g = L.agruparPorDia([{ v: null }], { instanteDe: x => x.v, hoje: "2026-10-13", semData: "Sem prazo" });
  assert.equal(g[0].rotulo, "Sem prazo");
});

test("CR-062/094/074 atendimento sem «—», origens manuais e campos de outro funil", () => {
  assert.equal(L.linhaAtendimento({ status: "aberta", ultima_msg_em: "2026-10-05T10:00:00Z" }, () => "05/10/2026"), "Aberto · 05/10/2026");
  assert.equal(L.linhaAtendimento({ status: "resolvida" }), "Resolvido");
  assert.ok(!L.origensManuais().some(([v]) => v === "anuncio" || v === "importacao"));
  assert.ok(L.origensManuais("anuncio").some(([v]) => v === "anuncio"), "a origem gravada não some da lista");
  const campos = [{ chave: "convenio", rotulo: "Convênio", entidade: "negocio", funil_id: "f2" }, { chave: "dente", rotulo: "Dente", entidade: "negocio", funil_id: "f1" }];
  assert.deepEqual(L.camposDeOutrosFunis(campos, "f1", { convenio: "Unimed", dente: "12", presenca: "faltou" }), [{ chave: "convenio", rotulo: "Convênio", texto: "Unimed" }]);
});

test("CR-122 importação: assinatura do cabeçalho e o mapa guardado só vale se ainda servir", () => {
  assert.equal(L.assinaturaCabecalho(["Nome", "Celular"]), L.assinaturaCabecalho(["nome", "Celular "]));
  const dest = L.destinosImportacao([]);
  assert.deepEqual(L.mapaGuardado(["nome", "telefone"], ["a", "b"], dest), ["nome", "telefone"]);
  assert.equal(L.mapaGuardado(["nome"], ["a", "b"], dest), null, "outro número de colunas");
  assert.deepEqual(L.mapaGuardado(["nome", "campo:sumiu"], ["a", "b"], dest), ["nome", null]);
});

test("CR-159/300/177 Início puro: nome sem o título, ponto verde só sem erro de cadastro, troca de indicadores sem repetir", () => {
  assert.equal(I.primeiroNome("Dra. Helena Souza"), "Helena");
  assert.equal(I.primeiroNome("Dr Paulo"), "Paulo");
  assert.equal(I.primeiroNome("Prof."), "");
  assert.equal(I.estadoNumeros({ canais: [{ estado: "conectado", status: "ativo" }] }), "ok");
  assert.equal(I.estadoNumeros({ canais: [{ estado: "conectado", status: "erro" }] }), null, "antes: «WhatsApp conectado» com erro no cadastro");
  const d = NOVO();
  const pad = I.kpisInicio(d, AGENDA, { hoje: HOJE }), alt = I.kpisAlternativos(d);
  assert.deepEqual(alt.map(k => k.id), ["leads", "receita", "previsao", "atrasadas"]);
  assert.equal(alt[1].valor, 28400, "receita do mês do nx_inicio");
  assert.deepEqual(I.aplicarEscolhaKpis(pad, alt, { 3: "receita" }).map(k => k.id), ["aguardando", "consultas", "aberto", "receita"]);
  assert.deepEqual(I.aplicarEscolhaKpis(pad, alt, { 3: "aguardando" }).map(k => k.id), pad.map(k => k.id), "repetido é ignorado");
});

/* ---------- (b) Kanban ---------- */
const colG = () => quadroDe({ s1: col("s1", cartoes(2, "s1", 1, { valor_previsto: 100, contato: { id: 501, nome: "Ana" } })), s5: { ...col("s5", [{ id: 9, titulo: "C9", status: "ganho", estagio_id: "s5", valor: 900 }]), soma_valor: 900 } });

test("CR-005/018/019/032/031 Kanban (DOM): «Ver mais antigos» grava; totais dizem «com os filtros»; 4º número de ganhos; vazias em «+N»; a busca anuncia", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: colG() });
    t.tela.querySelector(".kb-antigos .link").clique(); await varias();
    assert.equal(JSON.parse(D.storage.get("nx-app-crm-kb-cli-p1000-u1")).todosFechados, true, "CR-005: antes não gravava");
    assert.equal(t.tela.querySelector(".crm-tot-ganho b").textContent, "R$ 900", "CR-032");
    assert.equal(t.tela.querySelector(".crm-tot small").textContent, "no funil agora");
    t.tela.querySelector(".crm-atalho").clique(); await varias();
    assert.equal(t.tela.querySelector(".crm-tot small").textContent, "com os filtros", "CR-018");
    assert.ok(t.tela.querySelector(".crm-totais").classList.contains("crm-totais-filtrado"));
    const leg = () => t.tela.querySelectorAll(".crm-dist-leg-b");
    assert.deepEqual(leg().map(b => b.textContent.trim().split(" ")[0]), ["Nova", "Fechou", "+2"], "CR-019: só as cheias e «+2 vazias»");
    t.tela.querySelector(".crm-dist-mais").clique();
    assert.equal(t.tela.querySelectorAll(".crm-dist-leg-vazia").length, 2);
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "C1"; busca.dispara("input"); await varias();
    assert.ok(t.reg.avisos.some(a => /cartões encontrados para «C1»/.test(a)), "CR-031");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-010/011 filtros (DOM): mínimo negativo dá erro no campo e não fecha; pessoa escolhida desmarca «Todos»", async () => {
  const D = domDeMentira();
  try {
    let pessoa = null;
    const t = await montarKb(D, { dados: colG(), uix: { seletorPessoa: o => { pessoa = o; return D.h("select", { class: "sel" }); } } });
    t.tela.querySelector(".crm-filtro-bt").clique();
    const corpo = t.reg.flut.conteudo;
    const min = corpo.querySelectorAll("input").find(i => i.attrs["aria-label"] === "Valor mínimo");
    min.value = "-100";
    const n0 = t.chamadas("nx_negocios_kanban").length;
    botaoTxt(corpo, /^Aplicar$/).clique(); await varias();
    const er = corpo.querySelector(".crm-filtros-erro");
    assert.ok(!er.hidden && /use 0 ou mais/.test(er.textContent), "antes: o filtro sumia em silêncio");
    assert.equal(min.attrs["aria-invalid"], "true");
    assert.ok(!t.reg.flut.api.fechado, "o popover continua aberto");
    assert.equal(t.chamadas("nx_negocios_kanban").length, n0);
    const seg = corpo.querySelectorAll(".crm-seg").find(g => g.attrs["aria-label"] === "Responsável");
    assert.equal(seg.els[0].attrs["aria-pressed"], "true");
    pessoa.aoMudar("u2");
    assert.ok(seg.els.every(b => b.attrs["aria-pressed"] === "false"), "CR-011: nenhum botão marcado com uma pessoa escolhida");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-026 Desfazer (DOM): clicar duas vezes reverte UMA vez", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: colG() });
    const c1 = t.cartao(1);
    tecla(c1, " "); tecla(c1, "ArrowRight"); tecla(t.cartao(1), "Enter"); await varias();
    assert.deepEqual(t.reg.movidos.map(m => m.dest), ["s2"]);
    const d = t.reg.desfazer.at(-1);
    await Promise.all([d.reverter(), d.reverter()]);
    assert.deepEqual(t.reg.movidos.map(m => m.dest), ["s2", "s1"], "antes: duas reversões em sequência");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-038/188/072 Kanban (DOM): etiqueta desconhecida relê a base 1×/min; abrir lembra o recente e passa os vizinhos da coluna", async () => {
  const D = domDeMentira();
  try {
    let bases = 0; const recentes = [], abertos = [];
    const dados = quadroDe({ s1: col("s1", cartoes(3, "s1", 1, { etiquetas: ["nova"] })) });
    const t = await montarKb(D, { dados, kx: { recarregarBase: async () => { bases++; }, lembrarRecente: r => recentes.push(r) },
      N: { abrirNegocio: (k, id, o) => abertos.push({ id, o }) } });
    await varias();
    assert.equal(bases, 1, "CR-038: 3 cartões com etiqueta nova → uma releitura");
    t.cartao(2).clique();
    assert.deepEqual(recentes[0], { hash: "#/crm/negocio/2", titulo: "C2", tipo: "negocio" }, "CR-188");
    assert.deepEqual(abertos[0].o.vizinhos(2), { anterior: 1, proximo: 3 }, "CR-072");
    assert.deepEqual(abertos[0].o.vizinhos(1), { anterior: null, proximo: 2 });
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-029/030 cartão (DOM): o selo de não lidas abre a conversa; ações rápidas Conversa e Tarefa (ligada ao negócio)", async () => {
  const D = domDeMentira();
  try {
    const nav = [], tarefas = [];
    const dados = quadroDe({ s1: col("s1", [{ id: 5, titulo: "Ana", status: "aberto", estagio_id: "s1", nao_lidas: 3, contato: { id: 501, nome: "Ana" } }]) });
    const t = await montarKb(D, { dados, ctxx: { temModulo: () => true, navegar: h => nav.push(h) },
      modx: { tarefas: { formTarefa: async (k, x, o) => { tarefas.push(o); return null; } } } });
    const selo = t.cartao(5).querySelector(".kc-naolidas");
    assert.equal(selo.tagName, "BUTTON");
    selo.clique();
    assert.deepEqual(nav, ["#/conversas?contato=501"]);
    t.cartao(5).querySelector('.kc-rapida[data-acao="tarefa"]').clique(); await varias();
    assert.deepEqual(tarefas, [{ negocio_id: 5, contato_id: 501, titulo: "Retomar contato — Ana" }], "plano 1000b: RB-246 — o título vem sugerido");
    t.cartao(5).querySelector('.kc-rapida[data-acao="conversa"]').clique();
    assert.equal(nav.length, 2);
    assert.match(ler("crm.css"), /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.kc:hover \.kc-rapidas, \.kc:focus-within \.kc-rapidas/);
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-035 seleção (DOM): Shift+clique em 3 cartões, mover para «Não fechou» pergunta o motivo UMA vez e dá um Desfazer", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: colG(), uix: { modal: async () => "s6" } });
    const dados3 = quadroDe({ s1: col("s1", cartoes(3, "s1")) });
    t.trocar(dados3); t.k.ctx.pulso; await t.api.aoMudarNegocio({}); await varias();
    for (const id of [1, 2, 3]) t.cartao(id).dispara("click", { shiftKey: true, target: t.cartao(id) });
    assert.equal(t.tela.querySelector(".crm-sel-n").textContent, "3 selecionados");
    assert.ok(t.cartao(2).classList.contains("kc-sel"));
    assert.equal(t.reg.abertos.length, 0, "Shift+clique não abre a gaveta");
    t.tela.querySelector(".crm-sel-mover").clique(); await varias(10);
    assert.deepEqual(t.reg.prep, ["s6"], "o motivo é perguntado uma vez");
    assert.deepEqual(t.reg.movidos.map(m => [m.id, m.dest]), [[1, "s6"], [2, "s6"], [3, "s6"]]);
    assert.match(t.reg.desfazer.at(-1).texto, /^3 cartões movidos para «Não fechou»/);
    assert.ok(t.tela.querySelector(".crm-sel").hidden, "a seleção limpa");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-036/037/039 Kanban (DOM): recolher vazias; Alt+2 troca de funil; mostrarFunil do link direto", async () => {
  const D = domDeMentira();
  try {
    const f2 = { id: "f2", nome: "Pós", ativo: true, estagios: ETAPAS_KB };
    const t = await montarKb(D, { dados: colG(), base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, f2] } });
    t.tela.querySelector(".crm-recolher").clique();
    const sec = id => t.tela.querySelector(`.kb-col[data-estagio="${id}"]`);
    assert.ok(sec("s2").classList.contains("kb-col-recolhida") && !sec("s1").classList.contains("kb-col-recolhida"), "CR-036");
    // plano 1000b: RB-028 — «Recolher vazias» lembrado por empresa E conta
    assert.equal(D.storage.get("nx-app-crm-kb-recolher-cli-p1000-u1"), "1");
    D.documento("keydown", { key: "2", code: "Digit2", altKey: true, target: D.doc.body }); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_funil, "f2", "CR-037");
    assert.equal(t.api.mostrarFunil("f1"), true, "CR-039");
    assert.equal(t.api.funilAtual(), "f1");
    assert.equal(t.api.mostrarFunil("f1"), false, "já está nele");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-044/297 «Mover para…» (DOM): «Outro funil…» chama a troca de funil; ganho confirmado oferece «Iniciar pós-venda»", async () => {
  const D = domDeMentira();
  try {
    const f2 = { id: "f2", nome: "Pós", ativo: true, estagios: ETAPAS_KB };
    const funilMov = [], pos = [], toasts = [];
    let escolha = null;
    const t = await montarKb(D, { dados: colG(), base: { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }, f2] },
      N: { moverDeFunil: async (k, n) => { funilMov.push(n); }, iniciarPosVenda: async (k, n, c) => { pos.push(c); } },
      uix: { modal: async o => { let r = null; if (o.aoAbrir) o.aoAbrir({ fechar: v => { r = v; } }); escolha(o.corpo); return r; }, toast: (txt, o = {}) => { toasts.push({ txt, ...o }); return { fechar() {} }; } } });
    escolha = corpo => corpo.querySelector(".kb-mover-funil").clique();
    t.cartao(1).querySelector(".kc-mover").clique(); await varias();
    assert.equal(funilMov.length, 1); assert.equal(funilMov[0].funil_id, "f1"); assert.equal(funilMov[0].status, "aberto");
    escolha = corpo => corpo.querySelectorAll(".kb-mover-op").find(b => /Fechou/.test(b.textContent)).clique();
    t.cartao(2).querySelector(".kc-mover").clique(); await varias();
    t.reg.desfazer.at(-1).res({ estado: "mantida" }); await varias(10);
    const oferta = toasts.find(x => x.acao && x.acao.rotulo === "Iniciar pós-venda");
    assert.ok(oferta, "CR-297: antes o fluxo acabava no «Fechou»");
    oferta.acao.fn();
    assert.deepEqual(pos[0], { id: 501, nome: "Ana" });
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-270 dica do toque longo (DOM): só no toque, some no «Entendi» e não volta", async () => {
  const D = domDeMentira({ medias: { "(pointer: coarse)": true } });
  try {
    const t = await montarKb(D, { dados: colG() });
    const dica = t.tela.querySelector(".crm-dica-segurar");
    assert.ok(dica && /Segure o cartão/.test(dica.textContent));
    botaoTxt(dica, /Entendi/).clique();
    assert.equal(t.tela.querySelector(".crm-dica-segurar"), null);
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: colG() });
    assert.equal(t2.tela.querySelector(".crm-dica-segurar"), null, "não volta neste aparelho");
    t2.api.desmontar();
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  try { const t = await montarKb(D2, { dados: colG() }); assert.equal(t.tela.querySelector(".crm-dica-segurar"), null, "mouse não vê"); t.api.desmontar(); } finally { D2.desfazer(); }
});

test("CR-277 filtros no celular (DOM+CSS): folha inferior com título e «Aplicar» fixos", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const t = await montarKb(D, { dados: colG() });
    t.tela.querySelector(".crm-filtro-bt").clique();
    assert.ok(t.reg.flut.conteudo.querySelector(".crm-filtros-cab"));
    assert.match(t.reg.flut.o.classe, /flut-crm-folha/);
    t.api.desmontar();
  } finally { D.desfazer(); }
  const css = ler("crm.css");
  assert.match(css, /\.flut\.flut-crm-folha \{ position: fixed;[^}]*bottom: 0;/);
  assert.match(css, /\.flut-crm-folha \.crm-filtros-rod \{ position: sticky; bottom: 0;/);
});

/* ---------- (b) gaveta e novo negócio ---------- */
test("CR-072/039/051/107/062/074 gaveta (DOM): J vai ao próximo da coluna; aoCarregar; «dela»; «Ver ficha»; atendimento sem «—»; campos de outro funil", async () => {
  const D = domDeMentira();
  try {
    const nav = [], carregados = [];
    const t = await montarGaveta(D, { negocio: { campos: { convenio: "Unimed" } },
      campos: [{ chave: "convenio", rotulo: "Convênio", tipo: "texto", entidade: "negocio", funil_id: "f2" }],
      ver: { conversas: [{ id: 5, protocolo: "P-1", status: "aberta", aberta_em: null, ultima_msg_em: "2026-10-05T10:00:00Z" }] },
      opts: { vizinhos: id => (id === 801 ? { anterior: null, proximo: 802 } : { anterior: 801, proximo: null }), aoNavegar: id => nav.push(id), aoCarregar: d => carregados.push(d.negocio.id) } });
    assert.equal(t.corpo().querySelector(".ng-nav-ant").disabled, true);
    assert.deepEqual(carregados, [801], "CR-039");
    assert.ok(botaoTxt(t.corpo(), /^Ver ficha$/), "CR-107");
    assert.equal(t.corpo().querySelector(".fx-proto span").textContent, "Aberto · 04/10/2026", "CR-062");
    const outros = t.corpo().querySelector(".ng-outros-campos");
    assert.ok(outros && /Convênio/.test(outros.textContent) && /Unimed/.test(outros.textContent), "CR-074");
    let itens = null, txt = null;
    t.k.ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    t.k.ui.confirmar = async o => { txt = o.texto; return false; };
    t.corpo().querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações").clique();
    await itens.find(i => i && /^Excluir/.test(i.rotulo)).fn();
    assert.match(txt, /notas dela/, "CR-051");
    t.corpo().dispara("keydown", { key: "j", target: t.corpo() }); await varias();
    assert.deepEqual(nav, [802]);
    assert.equal(t.cham("nx_negocio_ver").at(-1).p.p_id, 802, "CR-072");
    assert.equal(t.corpo().querySelector(".ng-nav-prox").disabled, true);
  } finally { D.desfazer(); }
});

test("CR-058/059 novo negócio (DOM): datalist com id único; ir e voltar de «buscar existente» guarda o digitado", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, {});
    t.k.base.ticket = { Implante: 3000 };
    await t.N.novoNegocio(t.k, {}); await t.N.novoNegocio(t.k, {});
    const ids = t.reg.gavetas.slice(-2).map(g => g.corpo.querySelector("datalist").id);
    assert.notEqual(ids[0], ids[1], "CR-058");
    const z = t.reg.gavetas.at(-1).corpo;
    botaoTxt(z, /Cadastrar paciente novo/).clique();
    z.querySelector('[name="c_nome"]').value = "Ana Nova";
    botaoTxt(z, /Buscar um cadastro existente/).clique();
    botaoTxt(z, /Cadastrar paciente novo/).clique();
    assert.equal(z.querySelector('[name="c_nome"]').value, "Ana Nova", "CR-059: antes voltava vazio");
  } finally { D.desfazer(); }
});

/* ---------- (b) Contatos, ficha e empresa ---------- */
test("CR-084/085/086/092/093 Contatos (DOM): menu Colunas guarda; empresa com dica; ícone baixar; só a tabela no desktop; cache na 1ª página", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D);
    const ops = [];
    const orig = t.k.api.rpcC; t.k.api.rpcC = (n, p, o) => { ops.push({ n, o }); return orig(n, p); };
    const tela = h0(D, "div", { class: "crm" });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    assert.ok(tela.querySelector(".tabela-env") && !tela.querySelector(".ct-lista-env"), "CR-092: desktop só a tabela");
    assert.equal(ops.at(-1).o && ops.at(-1).o.cache, true, "CR-093");
    assert.equal(botaoTxt(tela, /^Exportar/).querySelector("svg").dataset.n, "baixar", "CR-086");
    const emp = t.reg.colunas.find(c => c.chave === "empresa").render({ empresa: { nome: "Frota Grande" } });
    assert.ok(emp.classList.contains("ct-emp") && emp.attrs.title === "Frota Grande", "CR-085");
    tela.querySelector(".ct-cols-bt").clique();
    const cx = t.reg.flut.conteudo.querySelector('input[data-coluna="email"]');
    cx.checked = false; cx.dispara("change");
    assert.ok(!t.reg.colunas.some(c => c.chave === "email"), "CR-084");
    api.desmontar();
    await t.M.montarContatos(t.k, h0(D, "div", { class: "crm" }), { query: {} });
    assert.ok(!t.reg.colunas.some(c => c.chave === "email"), "continua escondida ao voltar");
    const api3 = await t.M.montarContatos(t.k, h0(D, "div", { class: "crm" }), { query: { busca: "ana" } });
    assert.equal(ops.at(-1).o, undefined, "com filtro não usa o guardado");
    api3.desmontar();
  } finally { D.desfazer(); }
  const D2 = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const t = await montarCt(D2);
    const tela = h0(D2, "div", { class: "crm" });
    await t.M.montarContatos(t.k, tela, { query: {} });
    assert.ok(tela.querySelector(".ct-lista-env") && !tela.querySelector(".tabela-env"), "celular só a lista");
  } finally { D2.desfazer(); }
});

test("CR-087/105/011 Contatos (DOM): pulso relê a 1ª página (30 s); a ficha volta para a página 3; pessoa desmarca «Todos»", async () => {
  const D = domDeMentira();
  const agoraR = Date.now;
  try {
    let pul = null, pessoa = null, backs = 0;
    const t = await montarCt(D, { lista: { itens: [{ id: 1, nome: "Ana" }], total: 200, tem_mais: true },
      rpc: n => (n === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana" }, negocios: [], conversas: [], tarefas: [], notas: [], tempo: [] } : undefined) });
    t.k.ctx.pulso = { assinar: fn => { pul = fn; return () => { pul = null; }; } };
    t.ui.seletorPessoa = o => { pessoa = o; return D.h("select", { class: "sel" }); };
    const tela = h0(D, "div", { class: "crm" });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    const n = () => t.cham("nx_contatos_listar").length;
    const n0 = n(); pul(); await varias(); assert.equal(n(), n0, "logo depois, espera");
    Date.now = () => agoraR() + 31000; pul(); await varias(); assert.equal(n(), n0 + 1, "CR-087");
    botaoTxt(tela, /Próxima/).clique(); await varias(); botaoTxt(tela, /Próxima/).clique(); await varias();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_pagina, 3);
    Date.now = () => agoraR() + 70000; pul(); await varias();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_pagina, 3, "fora da 1ª página o pulso não relê");
    t.reg.aoClicar({ id: 1 });
    tela.querySelector(".crm-filtro-bt").clique();
    const seg = t.reg.flut.conteudo.querySelectorAll(".crm-seg").find(g => g.attrs["aria-label"] === "Responsável");
    pessoa.aoMudar("u2");
    assert.ok(seg.els.every(b => b.attrs["aria-pressed"] === "false"), "CR-011");
    api.desmontar();
    t.k.nomes = () => ({}); t.k.motivosPorId = () => ({});
    globalThis.history.back = () => { backs++; };
    const ficha = h0(D, "div", { class: "crm" });
    await t.M.montarFicha(t.k, ficha, 501, {});
    ficha.querySelector(".fx-voltar").dispara("click", { preventDefault() {} });
    assert.equal(backs, 1, "CR-105: volta pela história");
    await t.M.montarContatos(t.k, h0(D, "div", { class: "crm" }), { query: {} });
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_pagina, 3, "a lista reabre na página 3");
  } finally { Date.now = agoraR; D.desfazer(); }
});

test("CR-094 novo contato (DOM): sem «Anúncio» nem «Importação» na origem", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D);
    let ops = null;
    const campo = t.ui.campo; t.ui.campo = o => { if (o.nome === "origem") ops = o.opcoes; return campo(o); };
    await t.M.formContato(t.k);
    assert.ok(ops.length && !ops.some(o => o.valor === "anuncio" || o.valor === "importacao"));
  } finally { D.desfazer(); }
});

test("CR-097/099/101/102/107/111/227/233/261/104 ficha (DOM)", async () => {
  const D = domDeMentira();
  const agoraR = Date.now;
  try {
    let rev = 0, confirmou = null, pul = null;
    const contato = { id: 501, nome: "Ana", telefone: "5512998303030", bloqueado: true, origem: "whatsapp", documento: "11111111111111" };
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_contato_ver") return { contato: { ...contato, nome: rev ? "Ana Maria" : "Ana" }, empresa: null, rfm: {}, tarefas: [], notas: [], tempo: [],
        negocios: [{ id: 801, titulo: "Implante", estagio_id: "s1", funil_id: "f1", status: "aberto", plataforma: "google", campanha_nome: "Implantes Out" }],
        conversas: [{ id: 5, protocolo: "P-1", status: "aberta", ultima_msg_em: "2026-10-05T10:00:00Z" }] };
      if (nome === "nx_contato_salvar") return { ...contato, ...p.p_contato };
      return undefined;
    } });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    t.k.ctx.pulso = { assinar: fn => { pul = fn; return () => { pul = null; }; } };
    t.ui.confirmar = async o => { confirmou = o.texto; return false; };
    const el = h0(D, "div", { class: "crm", dataset: { tela: "ficha" } });
    const api = await t.M.montarFicha(t.k, el, 501, {});
    const pil = el.querySelector(".fx-cab .pilula[data-variante=origem]");
    assert.equal(pil && pil.dataset.chave, "whatsapp", "CR-101: a mesma pílula da lista");
    assert.ok(el.querySelector(".fx-bloqueado"), "CR-261");
    assert.equal(el.querySelector(".fx-rfm-vazio").textContent, "Ainda sem tratamentos fechados.", "CR-102 (plano 1000b: RB-210 — o termo da vertical odonto)");
    assert.ok(el.querySelectorAll("button").filter(b => /Nova oportunidade/.test(b.textContent)).length >= 1, "CR-107");
    assert.match(el.querySelector(".fx-b-origem .ng-rastreio-frase").textContent, /campanha «Implantes Out»/, "CR-233");
    assert.ok(el.querySelector(".fx-b-neg") && el.querySelector(".fx-b-dados"), "CR-227 (a ordem é do CSS)");
    assert.match(ler("crm.css"), /\.crm\[data-tela="ficha"\] \.fx-b-neg \{ order: 1; \}/);
    // CR-111
    const doc = campoDe(el, "CPF / CNPJ").querySelector("input");
    assert.equal(doc.value, "11.111.111/1111-11");
    doc.dispara("blur"); await varias();
    assert.match(campoDe(el, "CPF / CNPJ").querySelector(".ed-aviso").textContent, /dígito verificador/);
    // CR-099
    const nasc = campoDe(el, "Nascimento").querySelector("input");
    assert.ok(nasc.attrs.max);
    nasc.value = "2999-01-01"; nasc.dispara("blur"); nasc.dispara("change"); await varias();
    assert.match(campoDe(el, "Nascimento").querySelector(".ed-erro").textContent, /futuro/);
    assert.ok(!t.cham("nx_contato_salvar").some(c => "nascimento" in c.p.p_contato));
    // CR-097
    const tel = campoDe(el, "Telefone").querySelector("input");
    tel.value = ""; tel.dispara("blur"); await varias();
    assert.match(confirmou, /não recebe mais mensagens/);
    assert.ok(!t.cham("nx_contato_salvar").some(c => "telefone" in c.p.p_contato), "não confirmou: não grava");
    assert.notEqual(tel.value, "");
    // CR-104
    const nVer = () => t.cham("nx_contato_ver").length, v0 = nVer();
    pul(); await varias(); assert.equal(nVer(), v0, "nos 30 s, espera");
    Date.now = () => agoraR() + 31000; rev = 1; pul(); await varias();
    assert.equal(nVer(), v0 + 1);
    assert.equal(el.querySelector(".fx-cab h1").textContent, "Ana Maria", "redesenhou com a novidade");
    api.desmontar(); assert.equal(pul, null);
  } finally { Date.now = agoraR; D.desfazer(); }
});

test("CR-109/112/111 empresa (DOM): excluir diz quantos contatos; site sem https vira link; documento com máscara", async () => {
  const D = domDeMentira();
  try {
    let txt = null, salvo = null, modal = null;
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_empresa_ver") return { empresa: { id: 7, nome: "Frota X", site: "www.frota.com" }, contatos: [{ id: 1, nome: "A" }, { id: 2, nome: "B" }], negocios: [] };
      if (nome === "nx_empresa_salvar") { salvo = p.p_empresa; return { id: 7 }; }
      return undefined;
    } });
    t.ui.confirmar = async o => { txt = o.texto; return false; };
    t.ui.lerForm = f => Object.fromEntries(f.querySelectorAll("input,textarea").map(i => [i.attrs.name, i.value]));
    t.ui.modal = async o => { modal = o; return null; };
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, 7, {});
    assert.equal(el.querySelector(".fx-id a.link").attrs.href, "https://www.frota.com", "CR-112");
    botaoTxt(el, /Excluir/).clique(); await varias();
    assert.match(txt, /^2 pacientes deixam de estar ligad/, "CR-109");
    botaoTxt(el, /Editar/).clique(); await varias();
    const doc = modal.corpo.querySelector('[name="documento"]');
    doc.value = "11222333000181"; doc.dispara("blur");
    assert.equal(doc.value, "11.222.333/0001-81");
    modal.corpo.querySelector('[name="site"]').value = "www.x.com";
    await modal.acoes[1].fn({ erro() {} });
    assert.equal(salvo.site, "https://www.x.com");
    assert.equal(salvo.documento, "11.222.333/0001-81");
  } finally { D.desfazer(); }
});

/* ---------- (b) Importação ---------- */
const CSV_IMP = "Nome;Celular;Estado\nAna;12999990000;SP\nBia;12999990001;MG\n";
async function irParaColunas(t) { t.tela.querySelector("textarea").value = CSV_IMP; t.botao("Usar o texto colado").clique(); t.botao("Continuar").clique(); }

test("CR-124/120 Importação (DOM): o corpo não é aria-live; .xlsx ganha o passo a passo", async () => {
  const D = domDeMentira();
  try {
    const t = await montarImp(D);
    assert.equal(t.tela.querySelector(".imp-corpo").attrs["aria-live"], undefined, "CR-124");
    const ent = t.tela.querySelector('input[type="file"]');
    ent.files = [{ name: "base.xlsx", size: 10, type: "", arrayBuffer: async () => new Uint8Array([0x50, 0x4b]).buffer, slice() { return this; } }];
    ent.dispara("change"); await varias();
    assert.ok(t.reg.toasts.some(x => /planilha do Excel/.test(x) && /CSV UTF-8/.test(x)), "CR-120");
    ent.files = [{ name: "base.bin", size: 10, type: "", arrayBuffer: async () => new Uint8Array([0x50, 0x4b, 3]).buffer, slice() { return this; } }];
    ent.dispara("change"); await varias();
    assert.equal(t.reg.toasts.filter(x => /planilha do Excel/.test(x)).length, 2, "pela assinatura PK também");
    assert.match(ler("crm.css"), /\.imp-corpo input\[type="file"\]:focus-visible \+ \.imp-solta/, "CR-276");
  } finally { D.desfazer(); }
});

test("CR-122/125 Importação (DOM): o mapa da mesma planilha volta; voltar e avançar não remonta as linhas", async () => {
  const D = domDeMentira();
  try {
    let nMont = 0;
    const Lx = { ...L, montarLinhas: (...a) => { nMont++; return L.montarLinhas(...a); } };
    const t = await montarImp(D, { Lx });
    await irParaColunas(t);
    const sels = () => t.tela.querySelectorAll(".imp-mapa select");
    sels()[2].value = ""; sels()[2].dispara("change");
    t.botao("Continuar").clique();
    assert.equal(nMont, 1);
    for (let i = 0; i < 3; i++) { t.botao("Voltar").clique(); t.botao("Continuar").clique(); }
    assert.equal(nMont, 1, "CR-125: antes 4×");
    t.api.desmontar();
    const t2 = await montarImp(D);
    await irParaColunas(t2);
    assert.equal(t2.tela.querySelectorAll(".imp-mapa select")[2].value, "", "CR-122: a coluna ignorada continua ignorada");
    assert.match(t2.tela.querySelector(".imp-col-sub").textContent, /mesmo mapa da última vez/);
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-127 Importação (DOM): «Importar outra planilha» começa sem as etiquetas da anterior", async () => {
  const D = domDeMentira();
  try {
    const marcadas = [];
    let etq = null;
    const t = await montarImp(D, { rpc: async n => (n === "nx_contatos_importar" ? { criados: 2, atualizados: 0, ignorados: 0, erros: [], avisos: [], importacao_id: 1 } : {}),
      uix: { seletorEtiquetas: o => { etq = o; marcadas.push(o.marcadas); return D.h("div"); } } });
    await irParaColunas(t);
    t.botao("Continuar").clique();
    etq.aoMudar(["e1"]);
    t.botao("Continuar").clique();
    botaoTxt(t.tela, /^Importar/) && botaoTxt(t.tela, /^Importar/).clique();
    await varias(10);
    const outra = t.botao("Importar outra planilha");
    assert.ok(outra, "a importação terminou");
    outra.clique();
    await irParaColunas(t); t.botao("Continuar").clique();
    assert.deepEqual(marcadas.at(-1), [], "antes: vinha com «e1» sem aviso");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

/* ---------- (b) Tarefas ---------- */
test("CR-065/149/150/151/156 tarefa e nota (DOM): «Fixar» em texto; descrição com quebras; 4 jeitos de adiar; aviso da automação; sem internet", async () => {
  const D = domDeMentira();
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const reg = {}; const ui = uiDeMentira(h, reg);
    const chamadas = []; let itens = null;
    ui.menu = (a, l) => { itens = l; return { fechar() {} }; };
    ui.dataCurtaBR = () => "14/10";
    const k = { ui, h, L, v: V, base: { usuarios: [] }, pode: () => true, eu: () => "u1", toastErro() {}, nomes: () => ({}), motivosPorId: () => ({}), rascunho: () => ({ apagar() {} }),
      api: { rpcC: async (n, p) => { chamadas.push([n, p]); return { id: 71, ...(p.p_tarefa || {}) }; } } };
    const nota = h0(D, "div", null, T.blocoNotas(k, { notas: [{ id: 3, texto: "x", pode_editar: true, criado_em: iso(0) }] }));
    assert.equal(nota.querySelector(".nota-fixar").textContent, "Fixar", "CR-065");
    const t = { id: 71, titulo: "Ligar", tipo: "ligacao", vence_em: "2099-01-10T15:00:00Z", descricao: "linha 1\nlinha 2", automacao: true };
    const li = h0(D, "div", null, T.itemTarefa(k, t, { aoMudar() {} }));
    assert.ok(li.querySelector(".tf-desc"), "CR-149");
    li.querySelector(".tf-mais").clique();
    assert.deepEqual(itens.map(i => i.rotulo), ["Editar", "Adiar 1 hora", "Adiar para amanhã", "Adiar para a próxima semana", "Adiar para… (escolher)", "Excluir"]);
    await itens[1].fn();
    assert.equal(chamadas.at(-1)[1].p_tarefa.vence_em, "2099-01-10T16:00:00.000Z", "CR-150: +1 h");
    li.querySelector(".tf-mais").clique(); itens.at(-1).fn();
    assert.match(reg.desfazer.at(-1).texto, /Criada pela automação/, "CR-151");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    const off = h0(D, "div", null, T.itemTarefa(k, { ...t, id: 72 }, { aoMudar() {} }));
    const ck = off.querySelector(".tf-check input");
    assert.ok(ck.disabled && /Sem internet/.test(ck.attrs.title), "CR-156");
    const n0 = chamadas.length; ck.checked = true; ck.dispara("change"); await varias();
    assert.equal(chamadas.length, n0, "sem internet não vai ao servidor");
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); else delete globalThis.navigator; D.desfazer(); }
});

test("CR-138/146 Tarefas (DOM): grupo «Sem prazo» e o painel É a navegação (com «Concluídas»), sem o segmentado repetido", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const chamadas = [];
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, ctx: { titulo() {}, navegar() {} },
      api: { rpcC: async (n, p) => { chamadas.push(p); return { itens: [{ id: 1, titulo: "Sem data", tipo: "tarefa", vence_em: null }], contagens: { hoje: 0, atrasadas: 0, proximas: 1 } }; } } };
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "proximas" } });
    assert.equal(tela.querySelector(".tfp-grupo-t span").textContent, "Sem prazo", "CR-138");
    assert.equal(tela.querySelectorAll(".seg").filter(s => s.attrs["aria-label"] === "Situação das tarefas").length, 0, "CR-146: sem as abas repetidas");
    const concl = tela.querySelector(".tfp-concl");
    concl.clique(); await varias();
    assert.equal(chamadas.at(-1).p_filtro.situacao, "concluidas");
    assert.equal(concl.attrs["aria-pressed"], "true");
    assert.equal(tela.querySelector(".tfp-pn-proximas").attrs["aria-pressed"], "false");
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ---------- (b) crm.js ---------- */
function ctxCrm(D, { rota, cli, rpc = () => null, chamadas = [], comandos = null }) {
  const U = uiDeMentira(D.h, {});
  U.carregarCss = () => {}; U.esqueleto = () => D.h("div", { class: "esqueleto" });
  return { alvo: h0(D, "main"), versao: `t-${cli}`, rota, ui: U, cliente: { id: cli }, vocab: V, sessao: { conta: { id: "conta-1" } },
    api: { rpcC: async (n, p) => { chamadas.push(n); return rpc(n, p); } }, pode: () => true, titulo() {}, navegar() {}, temModulo: () => false, comandos };
}

test("CR-040/037/188 crm.js (DOM): id inválido na rota vira «não encontrado» sem RPC; a paleta lista os funis; o recente do quadro é gravado", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const ch = [];
    const ctx = ctxCrm(D, { rota: { modulo: "contatos", partes: ["abc"], query: {} }, cli: "c40", chamadas: ch });
    await CRM.montar(ctx);
    assert.match(ctx.alvo.textContent, /Cadastro não encontrado/);
    assert.equal(ch.length, 0, "nenhuma RPC (antes: nx_contato_ver com id nulo)");
    const ctxE = ctxCrm(D, { rota: { modulo: "empresas", partes: ["xyz"], query: {} }, cli: "c41", chamadas: ch });
    await CRM.montar(ctxE);
    assert.match(ctxE.alvo.textContent, /Empresa não encontrada/);
    CRM.desmontar();
    const chN = [];
    const ctxN = ctxCrm(D, { rota: { modulo: "contatos", partes: ["501"], query: {} }, cli: "c42", chamadas: chN, rpc: () => { throw new Error("x"); } });
    await CRM.montar(ctxN);
    assert.ok(!/Cadastro não encontrado/.test(ctxN.alvo.textContent) && chN.length > 0, "id numérico segue para a ficha");
    CRM.desmontar();
    const cmds = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", ativo: true, estagios: [] }, { id: "f2", nome: "Pós", ativo: true, estagios: [] }], etiquetas: [], usuarios: [], campos: [], motivos: [] };
    const ctx2 = ctxCrm(D, { rota: { modulo: "tarefas", partes: [], query: {} }, cli: "c37",
      rpc: n => (n === "nx_crm_base" ? base : n === "nx_tarefas_listar" ? { itens: [], contagens: {} } : null), comandos: { registrar: c => { cmds.push(c); return () => {}; } } });
    await CRM.montar(ctx2);
    assert.deepEqual(cmds.filter(c => /^crm\.funil-/.test(c.id)).map(c => c.rotulo), ["Ir para o funil «Pacientes»", "Ir para o funil «Pós»"], "CR-037");
    const kk = await CRM.kit(ctx2);
    await kk.lembrarRecente({ hash: "#/crm/negocio/9", titulo: "Ana Souza", tipo: "negocio" });
    const rec = JSON.parse(D.storage.get("nx-rec:conta-1:c37"));
    assert.equal(rec[0].hash, "#/crm/negocio/9", "CR-188");
    CRM.desmontar();
  } finally { D.desfazer(); }
});

/* ---------- (b) Início ---------- */
test("CR-173/174/179/167/177 Início (DOM): tarefa concluída trava e o Desfazer é o do CRM; KPI sem title; «Agenda de hoje e da semana»; trocar indicador", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const t = await montarTela(NOVO(), { dom });
    const desf = [];
    t.ctx.ui.acaoComDesfazer = async o => { desf.push(o); return { estado: "mantida" }; };
    const caixa = t.raiz.querySelector(".ini-check");
    caixa.checked = true; dom.ev(caixa, "change"); await tick();
    assert.equal(caixa.disabled, true, "CR-173");
    assert.equal(desf.length, 1, "CR-174: ui.acaoComDesfazer (Ctrl+Z)");
    await desf[0].reverter();
    assert.ok(t.chamadas.some(c => c.nome === "nx_tarefa_concluir" && c.params.p_concluida === false));
    for (const k of t.raiz.querySelectorAll(".ini-kpi")) assert.equal(k.getAttribute("title"), null, "CR-179");
    assert.ok(texto(t.raiz).includes("Agenda de hoje e da semana") || !texto(t.raiz).includes("Agenda em barras"), "CR-167");
    let flut = null;
    t.ctx.ui.flutuante = (a, c) => { flut = c; return { fechar() {} }; };
    t.raiz.querySelector(".ini-kpis-trocar").click();
    const sels = flut.querySelectorAll("select");
    ["aguardando", "consultas", "aberto"].forEach((v, i) => { sels[i].value = v; sels[i].dataset.ant = v; });   // o select de mentira não lê o <option selected>
    sels[3].value = "receita"; dom.ev(sels[3], "change"); await tick();
    assert.deepEqual(JSON.parse(dom.mem.get(`nx-ini-kpis:${ID_CLI}:${ID_CONTA}`)), { 0: "aguardando", 1: "consultas", 2: "aberto", 3: "receita" });
    assert.deepEqual(kpiIds(t.raiz), ["aguardando", "consultas", "aberto", "receita"], "CR-177");
  } finally { dom.fim(); }
  assert.match(ler("inicio.js"), /"Agenda de hoje e da semana"/);
  assert.ok(!/Agenda em barras/.test(ler("inicio.js")));
});

/* ---------- (c) estáticos ---------- */
test("crm.css/inicio.css (lote crm-2): só tokens; «+» da coluna com 36/44 px; ordenar 32 px; empresa em 2 linhas; KPI sem traço; selo sem caixa alta", () => {
  const css = ler("crm.css");
  const b = css.slice(css.indexOf("lote crm-2"));
  assert.ok(b.length > 1000);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(b) && !/\brgba?\(/.test(b), "sem cor fixa");
  assert.match(b, /\.kb-col-mais \{ min-width: 36px; min-height: 36px;/, "CR-045");
  assert.match(b, /\.bt-icone\.kb-col-mais \{ width: 44px; height: 44px; \}/);
  assert.match(b, /\.ct-ord \{ min-height: 32px;/, "CR-088");
  assert.match(b, /\.ct-emp \{[^}]*-webkit-line-clamp: 2;/, "CR-085");
  assert.match(b, /\.ct-rel \{ white-space: nowrap; \}/);
  assert.match(b, /\.tf-desc \{[^}]*white-space: pre-wrap;/, "CR-149");
  assert.ok(!/animation:|@keyframes/.test(b), "nada animado novo");
  const ini = ler("inicio.css");
  const bi = ini.slice(ini.indexOf("lote crm-2"));
  assert.match(bi, /\.ini-kpi-sp\.ini-kpi-sp-vazia \{ background: none; \}/, "CR-160");
  assert.match(bi, /\.ini-prox-selo \{[^}]*text-transform: none;/, "CR-161");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bi));
});

/* ============================================================
   lote crm-3 (13/10/2026): CRM e Início — mais 60 itens. Lógica pura, DOM de mentira e complementos estáticos do CSS.
   ============================================================ */
const RL = await import("../web/app/rel-logica.js");
const C3 = await import("../web/app/comandos.js");

test("CR-208/264/232/225/226/298/244 lógica pura (crm-3): erro sem código técnico, telefone do exterior, campo da planilha, idade/aniversário, retomada e semana", () => {
  // CR-208: a frase não leva «(http_500)»; o código fica para o suporte
  assert.equal(L.textoErro({ codigo: "xyz" }), "Não deu certo agora. Tente de novo em instantes.");
  assert.equal(L.textoErro({ codigo: "http_500" }, { padrao: () => "Não deu certo agora (http_500). Tente de novo." }), "Não deu certo agora. Tente de novo.");
  assert.equal(L.textoErro({ codigo: "x" }, { padrao: () => "padrão" }), "padrão", "frase sem código passa igual");
  assert.equal(L.codigoSuporte({ status: 500 }), "http_500");
  assert.equal(L.codigoSuporte({ codigo: "sessao_invalida" }), "sessao_invalida");
  assert.equal(L.codigoSuporte(null), null);
  // CR-264: o DDI separado, como na importação (antes «(12) 12555-1234»)
  assert.equal(L.formatarTel("12125551234"), "+1 2125551234");
  assert.equal(L.formatarTel("447911123456"), "+44 7911123456");
  assert.equal(L.formatarTel("5512998303030"), "(12) 99830-3030");
  assert.equal(L.formatarTel("12998303030"), "(12) 99830-3030", "brasileiro sem o 55 continua");
  assert.equal(L.formatarTel("1234333344"), "(12) 3433-3344");
  // CR-232: campo personalizado da planilha com valor que o tipo não aceita avisa na prévia
  const campos = [{ chave: "convenio", rotulo: "Convênio", tipo: "multi", opcoes: ["Unimed", "Amil"], entidade: "contato" }, { chave: "retorno", rotulo: "Retorno", tipo: "data", entidade: "contato" }];
  assert.deepEqual(L.checarLinha({ nome: "Ana", campos: { convenio: "Unimed; Xpto" } }, { campos }), ["Convênio: Escolha entre as opções"]);
  assert.deepEqual(L.checarLinha({ nome: "Ana", campos: { convenio: "Unimed;Amil", retorno: "02/03/2026" } }, { campos }), []);
  assert.deepEqual(L.checarLinha({ nome: "Ana", campos: { retorno: "ontem" } }, { campos }), ["Retorno: Data inválida (DD/MM/AAAA)"]);
  assert.deepEqual(L.checarLinha({ nome: "Ana", campos: { retorno: "ontem" } }), [], "sem o catálogo, como antes");
  // CR-225/226
  assert.equal(L.idadeEm("1990-03-02", "2026-10-13"), 36);
  assert.equal(L.idadeEm("1990-10-14", "2026-10-13"), 35);
  assert.equal(L.idadeEm("2030-01-01", "2026-10-13"), null);
  assert.deepEqual(L.aniversario("1990-10-14", "2026-10-13"), { dias: 1, idade: 36, texto: "Aniversário amanhã (36 anos)" });
  assert.equal(L.aniversario("1986-10-13", "2026-10-13").texto, "Faz 40 anos hoje");
  assert.equal(L.aniversario("1990-10-16", "2026-10-13").texto, "Aniversário em 3 dias (36 anos)");
  assert.equal(L.aniversario("1990-11-30", "2026-10-13"), null, "fora da semana");
  assert.equal(L.aniversario("1992-01-02", "2026-12-30").dias, 3, "virada do ano");
  assert.equal(L.aniversario("2000-02-29", "2027-02-27").dias, 1, "29/02 em ano comum vale 28/02");
  // CR-298
  assert.equal(L.retomarEm(60, new Date("2026-10-13T15:00:00Z")), "2026-12-12T12:00:00.000Z");
  assert.equal(L.retomarEm(30, new Date("2026-10-14T01:00:00Z")), "2026-11-12T12:00:00.000Z", "22h de SP ainda é dia 13");
  assert.equal(L.retomarEm(0), null);
  // CR-244
  const sem = L.colunasDaSemana([{ id: 1, vence_em: "2026-10-13T15:00:00Z" }, { id: 2, vence_em: "2026-10-19T12:00:00Z" }, { id: 3, vence_em: "2026-10-25T12:00:00Z" }, { id: 4, vence_em: null }],
    { instanteDe: t => t.vence_em, hoje: "2026-10-13" });
  assert.deepEqual(sem.colunas.map(c => c.dia), ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
  assert.deepEqual(sem.colunas.map(c => c.itens.length), [1, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual([sem.colunas[0].rotulo, sem.colunas[1].rotulo], ["Hoje", "Amanhã"]);
  assert.deepEqual([sem.depois, sem.semPrazo], [1, 1]);
});

test("CR-239 modelo da importação: os cabeçalhos são reconhecidos sozinhos (reimportar não pede mapa), com os campos do contato", () => {
  const campos = [{ chave: "plano", rotulo: "Plano odontológico", tipo: "texto", entidade: "contato" }, { chave: "x", rotulo: "Só do negócio", tipo: "texto", entidade: "negocio" }];
  const m = L.modeloImportacao(campos);
  assert.equal(m.linhas.length, 2);
  assert.ok(m.linhas.every(l => l.length === m.cabecalho.length));
  // plano 1000b: o modelo ganhou Empresa, CPF/CNPJ, Título, Valor e Etapa (RB-073)
  assert.deepEqual(L.sugerirMapeamento(m.cabecalho, campos), ["nome", "telefone", "email", "empresa", "documento", "cidade", "uf", "nascimento", "origem", "etiquetas", "obs", "negocio_titulo", "negocio_valor", "estagio", "campo:plano"]);
  const csv = L.gerarCSV(m.cabecalho, m.linhas);
  assert.equal(csv.codePointAt(0), 0xfeff, "com BOM (acentos no Excel)");
  const lido = L.lerCSV(csv.slice(1));
  assert.deepEqual(lido.cabecalho, m.cabecalho, "o CSV gerado volta igual pela leitura da importação");
  assert.deepEqual(L.checarLinha(L.montarLinhas(lido.linhas, L.sugerirMapeamento(lido.cabecalho, campos))[0], { campos }), [], "as linhas de exemplo passam na conferência");
});

test("CR-249/251/255 Início puro: manchete em 2 trechos (ação primeiro); consultas com variação neutra; chaves de empresas que saíram", () => {
  const d = { hoje: HOJE, conversas: { aguardando: 2, espera_mais_antiga_min: 20 }, tarefas: { atrasadas: 0 }, negocios: { abertos: 3, valor_aberto: 5200 } };
  const ag = { consultas: [{ inicio: SP(HOJE, "15"), status: "aberto" }] };
  const cheia = RL.manchete(d, { agenda: ag, links: { conversas: "#c", agenda: "#a", crm: "#n" } });
  const contar = m => m.frases.flat().filter(n => n.t === "link").length;
  assert.equal(contar(cheia), 3, "antes: 3 trechos (espera, consulta, valor)");
  const curta = I.encurtarManchete(cheia, { max: 2, fmtMoeda: v => `R$ ${v}` });
  assert.equal(contar(curta), 2);
  assert.match(curta.texto, /^2 clientes esperam resposta há 20 min\. Hoje tem 1 consulta\.$/);
  assert.deepEqual([curta.pendencia, curta.contexto, curta.urgente], [cheia.pendencia, cheia.contexto, cheia.urgente], "o selo «Tudo em dia» segue o original");
  const d2 = { ...d, tarefas: { atrasadas: 2 } };
  const so = I.encurtarManchete(RL.manchete(d2, { agenda: ag }), { max: 2 });
  assert.equal(so.frases.length, 1, "duas urgências: o contexto vai para os KPIs");
  assert.equal(I.encurtarManchete(RL.manchete({ ...d, conversas: {} }, { agenda: ag }), { max: 2 }).encurtada, undefined, "com 2 trechos nada muda");
  // CR-251
  const k = I.kpisInicio(d, ag, { hoje: HOJE }).find(x => x.id === "consultas");
  assert.equal(k.sentido, "neutro");
  assert.equal(RL.chipVar(1, 2, k.sentido).cls, "neutro", "um dia mais calmo não fica vermelho");
  // CR-255
  const chaves = ["nx-ini-hist:A:c1", "nx-ini-hist:B:c1", "nx-ini-kpis:B:c1", "nx-ini-blocos:B:c1", "nx-ini-hist:B:c2", "nx-ini-blocos:A:c1", "outra", "nx-ini-metas:B"];
  assert.deepEqual(I.chavesInicioOrfas(chaves, { clientes: [{ id: "A" }], conta: "c1" }), ["nx-ini-hist:B:c1", "nx-ini-kpis:B:c1", "nx-ini-blocos:B:c1"]);
  assert.deepEqual(I.chavesInicioOrfas(chaves, { clientes: null, conta: "c1" }), [], "sem a lista de empresas, nada sai");
});

test("CR-187/190/192/259 paleta (DOM): sem resultado oferece «Cadastrar «mar» como paciente»; dica sem setas no toque; status 1× por busca; «Continuar: mar»", async () => {
  const reg = C3.criarComandos();
  const criados = [];
  reg.registrar({ id: "crm.novo-contato", rotulo: "Novo paciente", fazer() {}, comTermo: t => criados.push(t), rotuloTermo: t => `Cadastrar «${t}» como paciente` });
  assert.equal(typeof reg.listar()[0].comTermo, "function", "o registro guarda o criador");
  const D = domDeMentira({ medias: { "(pointer: coarse)": true } });
  try {
    const ui = uiDeMentira(D.h);
    ui.debounce = (f, ms) => { let t = 0; const g = (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; g.cancelar = () => clearTimeout(t); return g; };
    let fechar = null;
    ui.modal = o => { D.doc.body.appendChild(o.corpo); return new Promise(r => { fechar = () => { o.corpo.remove(); r(null); }; }); };
    const amb = { ui, C: C3, placeholder: "Buscar", destinos: [], acoes: [], daTela: reg.listar(), recentes: () => [], navegar() {},
      buscarDados: async () => ({ grupos: [{ titulo: "Pacientes", icone: "contato", itens: [] }] }) };
    P.abrir(amb);
    const campo = D.doc.body.querySelector("input.busca-campo");
    const dica = D.doc.body.querySelector(".busca-dica");
    assert.ok(!/navegar/.test(dica.textContent) && /ações/.test(dica.textContent), "CR-190: no toque só «> ações · # protocolo»");
    await esperar(650);
    const status = D.doc.body.querySelector("p[role=status]");
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(status), "textContent");
    let escritas = 0;
    Object.defineProperty(status, "textContent", { configurable: true, get() { return desc.get.call(this); }, set(v) { escritas++; desc.set.call(this, v); } });
    for (const v of ["m", "ma", "mar"]) { campo.value = v; campo.dispara("input"); }
    await esperar(700);
    assert.equal(escritas, 1, "CR-192: uma atualização do status (antes: a local e a dos dados)");
    assert.equal(status.textContent, "1 resultado.");
    const criar = botaoTxt(D.doc.body, /^Cadastrar «mar» como paciente$/);
    assert.ok(criar, "CR-187: nada encontrado → cadastrar com o texto");
    criar.clique();
    assert.deepEqual(criados, ["mar"]);
    fechar(); await tique();
    assert.equal(P.ultimaBusca(), "mar", "CR-259: guardada só na memória da aba");
    assert.equal(P.ultimaBusca(Date.now() + 121000), null, "vale por 2 min");
    P.abrir(amb);
    const cont = botaoTxt(D.doc.body, /^Continuar: mar$/);
    assert.ok(cont, "reabrir mostra «Continuar: mar»");
    cont.clique();
    assert.equal(D.doc.body.querySelector("input.busca-campo").value, "mar", "o texto volta ao campo (a paleta continua aberta)");
    fechar(); await tique();
  } finally { D.desfazer(); }
});

test("CR-189/223/187/266/009 crm.js (DOM): importar/exportar/nova empresa na paleta; cadastro fora da lista não tira da tela; cadastrar com o texto; erro com código e hora; «+» sai ao rolar", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const cmds = [], nav = [], toasts = [], corpos = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", ativo: true, estagios: [] }], etiquetas: [], usuarios: [], campos: [], motivos: [] };
    const ctx = ctxCrm(D, { rota: { modulo: "tarefas", partes: [], query: {} }, cli: "c-crm3",
      rpc: n => (n === "nx_crm_base" ? base : n === "nx_tarefas_listar" ? { itens: [], contagens: {} } : null), comandos: { registrar: c => { cmds.push(c); return () => {}; } } });
    ctx.navegar = x => nav.push(x);
    ctx.ui.toast = (t, o = {}) => { toasts.push({ t, ...o }); return { fechar() {} }; };
    let resposta = { id: 77 };
    ctx.ui.modal = async o => { corpos.push(o.corpo); return resposta; };
    await CRM.montar(ctx);
    const cmd = id => cmds.find(c => c.id === id);
    assert.ok(cmd("crm.importar") && cmd("crm.exportar") && cmd("crm.nova-empresa"), "CR-189");
    cmd("crm.importar").fazer(); cmd("crm.exportar").fazer();
    assert.deepEqual(nav, ["#/contatos/importar", "#/contatos?exportar=1"]);
    assert.equal(cmd("crm.novo-negocio").atalho, undefined, "fora do quadro, sem a tecla N");
    // CR-223: pela paleta em Tarefas, o cadastro não leva para a ficha — aviso com «Abrir»
    await cmd("crm.novo-contato").fazer(); await varias();
    assert.equal(nav.length, 2, "continua em Tarefas");
    const av = toasts.find(x => /cadastrad/.test(x.t));
    assert.equal(av.acao.rotulo, "Abrir");
    av.acao.fn(); assert.equal(nav.at(-1), "#/contatos/77");
    // CR-187: o texto da busca vira o nome (ou o telefone) do cadastro
    assert.equal(cmd("crm.novo-contato").rotuloTermo("Mariana"), "Cadastrar «Mariana» como paciente");
    await cmd("crm.novo-contato").comTermo("Mariana"); await varias();
    assert.equal(corpos.at(-1).querySelector('[name="nome"]').value, "Mariana");
    await cmd("crm.novo-contato").comTermo("(12) 99830-3030"); await varias();
    assert.equal(corpos.at(-1).querySelector('[name="telefone"]').value, "(12) 99830-3030");
    resposta = { id: 9, nome: "Frota X" };
    await cmd("crm.nova-empresa").fazer(); await varias();
    assert.match(toasts.at(-1).t, /Empresa «Frota X» cadastrada/);
    // CR-009: rolar para baixo esconde o «+»; para cima volta
    const fab = ctx.alvo.querySelector(".crm-fab");
    assert.ok(fab);
    const rolo = D.h("div"); ctx.alvo.querySelector(".crm").appendChild(rolo);
    for (const y of [10, 220]) { rolo.scrollTop = y; D.documento("scroll", { target: rolo }); }
    assert.ok(fab.classList.contains("crm-fab-some"), "descendo: some");
    rolo.scrollTop = 120; D.documento("scroll", { target: rolo });
    assert.ok(!fab.classList.contains("crm-fab-some"), "subindo: volta");
    CRM.desmontar();
    assert.equal((D.doDoc.scroll || []).length, 0, "o ouvinte sai com a tela");
    // CR-266: o cartão de erro com o código e a hora
    const ctxE = ctxCrm(D, { rota: { modulo: "contatos", partes: [], query: {} }, cli: "c-crm3-erro", rpc: () => { throw Object.assign(new Error("x"), { codigo: "http_500" }); } });
    await CRM.montar(ctxE);
    assert.match(ctxE.alvo.querySelector(".crm-erro-cod").textContent, /^código http_500 · \d\d:\d\d$/);
    CRM.desmontar();
  } finally { D.desfazer(); }
});

test("CR-267 crm.js + Kanban (DOM): no quadro a paleta mostra «N» e a tecla N (fora de campos) abre um cartão novo", async () => {
  const D = domDeMentira();
  try {
    const CRM = await import("../web/app/crm.js");
    const cmds = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: ETAPAS_KB }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} };
    const ctx = ctxCrm(D, { rota: { modulo: "crm", partes: [], query: {} }, cli: "c-crm3-kb",
      rpc: n => (n === "nx_crm_base" ? base : n === "nx_negocios_kanban" ? quadroDe({}) : null), comandos: { registrar: c => { cmds.push(c); return () => {}; } } });
    await CRM.montar(ctx);
    assert.equal(cmds.find(c => c.id === "crm.novo-negocio").atalho, "N", "a folha «?» lista a tecla");
    CRM.desmontar();
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  const si = globalThis.setInterval;
  try {
    const intervalos = [];
    globalThis.setInterval = (fn, ms) => { intervalos.push({ fn, ms }); return { unref() {} }; };
    const novos = [];
    const t = await montarKb(D2, { dados: quadroDe({}), N: { novoNegocio: (k, d) => novos.push(d) } });
    globalThis.setInterval = si;
    D2.documento("keydown", { key: "n", target: D2.doc.body });
    assert.equal(novos.length, 1); assert.equal(novos[0].funil_id, "f1");
    D2.documento("keydown", { key: "n", target: h0(D2, "input") });
    assert.equal(novos.length, 1, "digitando num campo, a letra é só letra");
    D2.documento("keydown", { key: "n", ctrlKey: true, target: D2.doc.body });
    assert.equal(novos.length, 1, "com Ctrl, não");
    // CR-296: «atualizado às» e o âmbar depois de 2 min sem recarga
    const idade = t.tela.querySelector(".crm-kb-idade");
    assert.equal(idade.hidden, false);
    assert.match(idade.textContent, /^atualizado às \d\d:\d\d$/);
    assert.ok(!idade.classList.contains("velho"));
    const agoraR = Date.now;
    Date.now = () => agoraR() + 3 * 60000;
    try { intervalos.find(x => x.ms === 30000).fn(); } finally { Date.now = agoraR; }
    assert.ok(idade.classList.contains("velho"), "parou de atualizar: âmbar");
    assert.match(idade.attrs.title, /Sem atualizar há 3 min/);
    t.api.desmontar();
  } finally { globalThis.setInterval = si; D2.desfazer(); }
});

test("CR-205/206/212/213/269/271/299/246 Kanban (DOM): rótulos claros, 1ª etiqueta com nome, avatar filtra, ✓/✕ na fita, «entrou em», ?resumo e ?parados", async () => {
  const D = domDeMentira();
  try {
    const usuarios = [{ id: "u7", nome: "Ana Lima" }];
    const etq = { id: "e1", nome: "VIP", cor: null };
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(1, "s1", 1, { dono_id: "u7", etiquetas: ["e1"], criado_em: "2026-10-03T12:00:00Z" })) }),
      rota: { query: { resumo: "1", parados: "7" } }, base: { usuarios }, usuario: id => usuarios.find(u => u.id === id) || null, etiqueta: id => (id === "e1" ? etq : null) });
    assert.ok(t.tela.textContent.includes("Parados há 7+ dias") && !t.tela.textContent.includes("Parados · 7 dias+"), "CR-205");
    assert.ok(t.tela.textContent.includes("Previsão (pela chance de cada etapa)") && !t.tela.textContent.includes("Previsão ponderada"), "CR-206");
    assert.equal(t.chamadas("nx_negocios_kanban")[0].p.p_filtro.parado_dias, 7, "CR-246: ?parados=7 liga o atalho");
    assert.ok(t.tela.querySelector(".crm-totais").classList.contains("aberto"), "CR-299: ?resumo=1 abre os totais");
    const c = t.cartao(1);
    assert.equal(c.querySelector(".kc-etq1").textContent, "VIP", "CR-212: o nome, não só a cor");
    assert.equal(c.querySelector(".kc-dias").attrs.title, "Entrou em 04/10", "CR-271 (plano 1000b: RB-035 — a dica sai do cartão inteiro e vai para o rodapé)");
    const fita = t.tela.querySelectorAll(".kb-fita-b");
    assert.ok(fita.find(b => b.dataset.estagio === "s5").querySelector(".kb-fita-ganho"), "CR-269: ✓ no ganho");
    assert.ok(fita.find(b => b.dataset.estagio === "s6").querySelector(".kb-fita-perdido"), "✕ na perda");
    assert.equal(fita.find(b => b.dataset.estagio === "s1").querySelector(".kb-fita-ic"), null, "aberta sem ícone");
    assert.match(fita.find(b => b.dataset.estagio === "s5").attrs["aria-label"], /fechada, ganho/);
    c.querySelector(".kc-dono").clique(); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.dono, "u7", "CR-213");
    assert.ok(t.tela.querySelector(".crm-chips").textContent.includes("Responsável: Ana Lima"));
    assert.equal(t.reg.abertos.length, 0, "o toque no avatar não abre a gaveta");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-203/268/211 Kanban (DOM): soltar em outra etapa acende as duas contagens e o leitor ouve os totais novos; com movimento reduzido nada conta", async () => {
  const D = domDeMentira({ medias: { "(prefers-reduced-motion: reduce)": true } });
  try {
    const contados = [], destacados = [];
    const G = { contar: el => contados.push(el), destacar: el => destacados.push(el) };
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1")) }), kx: { G } });
    assert.equal(contados.length, 0, "CR-211: antes os 4 totais contavam até o valor mesmo com movimento reduzido");
    assert.equal(t.tela.querySelector(".crm-tot b").textContent, "2");
    const art = t.cartao(1);
    tecla(art, " "); tecla(art, "ArrowRight"); tecla(art, "Enter"); await varias();
    const nDe = id => t.tela.querySelector(`.kb-col[data-estagio="${id}"] .kb-col-n`);
    assert.ok(destacados.includes(nDe("s1")) && destacados.includes(nDe("s2")), "CR-203: as duas colunas acendem");
    // plano 1000b: RB-008 — «movida» (oportunidade é feminino na vertical odonto do teste)
    // plano 1500c: RC-293 — o movimento fala uma vez só, pelo aviso com «Desfazer» (os totais novos vão nele)
    assert.match(t.reg.desfazer.at(-1).texto, /movida para Agendada\. Agora «Agendada» com 1 cartão e «Nova» com 1 cartão\.$/, "CR-268");
    assert.ok(!t.reg.avisos.some(a => /movida para Agendada/.test(a)), "RC-293: sem o 2º anúncio");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-281/035 Kanban (DOM): Ctrl+clique e o botão do meio abrem o negócio em nova aba; Shift+clique continua selecionando", async () => {
  const D = domDeMentira();
  const abertos = [];
  const antes = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: { open: (...a) => abertos.push(a) }, configurable: true, writable: true });
  try {
    const t = await montarKb(D, { dados: quadroDe({ s1: col("s1", cartoes(2, "s1")) }) });
    t.cartao(1).dispara("click", { ctrlKey: true });
    assert.deepEqual(abertos[0], ["#/crm/negocio/1", "_blank", "noopener"]);
    t.cartao(2).dispara("auxclick", { button: 1 });
    assert.equal(abertos[1][0], "#/crm/negocio/2");
    assert.equal(t.reg.abertos.length, 0, "a gaveta não abre nesta aba");
    assert.equal(t.tela.querySelector(".crm-sel").hidden, true, "Ctrl não seleciona mais");
    t.cartao(1).dispara("click", { shiftKey: true });
    assert.equal(t.tela.querySelector(".crm-sel").hidden, false, "Shift seleciona");
    t.api.desmontar();
  } finally { if (antes) Object.defineProperty(globalThis, "window", antes); else delete globalThis.window; D.desfazer(); }
});

test("CR-215/210 Kanban (DOM): grupos dos filtros em fieldset + legend; «Fechados no quadro: 90 dias» vai ao servidor e fica gravado", async () => {
  const D = domDeMentira();
  try {
    const t = await montarKb(D, { dados: quadroDe({}) });
    t.tela.querySelector(".crm-filtro-bt").clique();
    const pop = t.reg.flut.conteudo;
    const grupos = pop.querySelectorAll(".crm-filtros-grupo");
    assert.ok(grupos.length >= 5);
    for (const g of grupos) { assert.equal(g.tagName, "FIELDSET", "CR-210"); assert.equal(g.els[0].tagName, "LEGEND"); }
    pop.querySelector(".crm-filtros-fech").querySelectorAll("button").find(b => b.textContent === "90 dias").clique();
    botaoTxt(pop, /^Aplicar$/).clique(); await varias();
    assert.equal(t.chamadas("nx_negocios_kanban").at(-1).p.p_filtro.fechados_dias, 90, "CR-215");
    assert.equal(JSON.parse(D.storage.get("nx-app-crm-kb-cli-p1000-u1")).fechadosDias, 90);
    assert.ok(t.tela.textContent.includes("Fechados nos últimos 90 dias"));
    t.api.desmontar();
    const t2 = await montarKb(D, { dados: quadroDe({}) });
    assert.equal(t2.chamadas("nx_negocios_kanban")[0].p.p_filtro.fechados_dias, 90, "ao voltar continua 90 dias");
    t2.api.desmontar();
  } finally { D.desfazer(); }
});

test("CR-280/292/293/294/189 Contatos (DOM): nome é link; «Meus pacientes»/«Sem responsável»; abre por «Último contato»; ?exportar=1 da paleta exporta", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contatos_exportar" ? { itens: [{ id: 1, nome: "Ana" }], tem_mais: false } : undefined) });
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    assert.equal(t.cham("nx_contatos_listar")[0].p.p_ordem, "ultimo_contato", "CR-294: o padrão é «Último contato»");
    const sel = tela.querySelector("select.sel");
    assert.deepEqual(sel.els.map(o => o.textContent), ["Último contato", "Cadastrados por último", "Nome (A–Z)"], "«Recentes» dizia pouco");
    const nome = t.reg.colunas.find(c => c.chave === "nome").render({ id: 7, nome: "Ana" });
    const a = nome.querySelector("a.ct-nome-link");
    assert.equal(a.attrs.href, "#/contatos/7", "CR-280: Ctrl+clique abre em nova aba");
    const meus = tela.querySelectorAll(".ct-atalho").find(b => b.dataset.dono === "eu");
    assert.match(meus.textContent, /^(Meus|Minhas) pacientes$/, "o termo da vertical");
    assert.equal(meus.attrs["aria-pressed"], "false");
    meus.clique(); await varias();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_filtro.dono, "eu", "CR-293");
    assert.equal(meus.attrs["aria-pressed"], "true");
    tela.querySelectorAll(".ct-atalho").find(b => b.dataset.dono === "sem").clique(); await varias();
    assert.equal(t.cham("nx_contatos_listar").at(-1).p.p_filtro.dono, "sem", "CR-292");
    assert.ok(tela.querySelector(".crm-chips").textContent.includes("Responsável: sem responsável"));
    assert.equal(meus.attrs["aria-pressed"], "false");
    api.desmontar();
    // CR-189: «Exportar planilha» da paleta chega com ?exportar=1
    const t2 = await montarCt(D, { rpc: nome => (nome === "nx_contatos_exportar" ? { itens: [{ id: 1, nome: "Ana" }], tem_mais: false } : undefined) });
    const tela2 = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api2 = await t2.M.montarContatos(t2.k, tela2, { query: { exportar: "1" } });
    await varias();
    assert.equal(t2.cham("nx_contatos_exportar").length, 1);
    assert.equal(U.criados.length, 1, "a planilha saiu");
    api2.desmontar();
  } finally { U.desfazer(); D.desfazer(); }
});

test("CR-225/226/228/263 ficha (DOM): aniversário no cabeçalho, idade ao lado do nascimento, no celular «+ Oportunidade/Tarefa» no ⋮ e «Copiar e-mail»", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const nasc = `1990-${amanha.slice(5)}`;
    const idade = L.idadeEm(nasc, hoje);
    const t = await montarCt(D, { rpc: nome => (nome === "nx_contato_ver" ? { contato: { id: 501, nome: "Ana", email: "ana@x.com", telefone: "5512998303030", nascimento: nasc }, rfm: {}, tarefas: [], notas: [], tempo: [], negocios: [], conversas: [] } : undefined) });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    let menu = null;
    t.ui.menu = (anc, itens) => { menu = itens; return { fechar() {} }; };
    const el = h0(D, "div", { class: "crm", dataset: { tela: "ficha" } });
    await t.M.montarFicha(t.k, el, 501, {});
    const aniv = el.querySelector(".fx-aniv");
    assert.ok(aniv, "CR-225");
    assert.equal(aniv.textContent, L.aniversario(nasc, hoje).texto);
    assert.ok(campoDe(el, `Nascimento (${idade} anos)`), "CR-226: a idade ao lado");
    // plano 1500c: RC-331 — sem o módulo de conversas, «Novo negócio» vira o botão principal (.fx-ac-principal); continuam os dois
    assert.ok(el.querySelectorAll(".fx-ac-sec").length + el.querySelectorAll(".fx-ac-principal").length === 2, "os botões continuam (o CSS esconde no celular)");
    el.querySelector(".fx-acoes .bt-icone").clique();
    const rotulos = menu.filter(x => x && x.rotulo).map(x => x.rotulo);
    assert.ok(rotulos.includes("Nova oportunidade") && rotulos.includes("Nova tarefa"), "CR-228: no celular moram no ⋮");
    assert.ok(rotulos.includes("Copiar e-mail"), "CR-263");
    assert.match(ler("crm.css"), /\.fx-acoes \.fx-ac-sec \{ display: none; \}/);
  } finally { D.desfazer(); }
});

test("CR-235 empresa (DOM): sem oportunidades, o botão cria uma para um contato da empresa (um: direto; vários: escolhe)", async () => {
  const D = domDeMentira();
  try {
    let resp = { empresa: { id: 7, nome: "Frota X" }, contatos: [{ id: 51, nome: "Ana" }], negocios: [] };
    const t = await montarCt(D, { rpc: nome => (nome === "nx_empresa_ver" ? resp : undefined) });
    const criados = [];
    t.k.mod = async () => ({ novoNegocio: (k, d) => criados.push(d), abrirNegocio() {}, campoPersonalizado: () => D.h("div"), lerCamposPersonalizados: () => ({ valores: {}, erros: [] }) });
    Object.assign(t.k, { estagio: () => null });
    const el = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el, "7", {});
    const bt = el.querySelector(".emp-novo-neg");
    assert.match(bt.textContent, /para uma? paciente desta empresa$/);
    bt.clique();
    assert.deepEqual(criados, [{ contato_id: 51 }], "um contato: direto");
    resp = { ...resp, contatos: [{ id: 51, nome: "Ana" }, { id: 52, nome: "Bia" }] };
    let menu = null;
    t.ui.menu = (anc, itens) => { menu = itens; return { fechar() {} }; };
    const el2 = h0(D, "div", { class: "crm" });
    await t.M.montarEmpresa(t.k, el2, "7", {});
    el2.querySelector(".emp-novo-neg").clique();
    assert.deepEqual(menu.map(x => x.rotulo), ["Ana", "Bia"]);
    menu[1].fn();
    assert.deepEqual(criados.at(-1), { contato_id: 52 });
  } finally { D.desfazer(); }
});

test("CR-220/221/298/230/231 negócio (DOM): pós-venda com etapa, serviço e responsável; perda com tarefa de retomada; links dos campos Link e Telefone", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { servico: "Implante", dono_id: "u9" } });
    t.k.base.usuarios = [{ id: "u9", nome: "Dra. Lia" }];
    t.k.base.funis.push({ id: "f2", nome: "Pós-venda", ativo: true, conta_no_ads: false, estagios: [{ id: "p1", nome: "Revisão", tipo: "aberto" }, { id: "p2", nome: "Manutenção", tipo: "aberto" }, { id: "p9", nome: "Feito", tipo: "ganho" }] });
    t.k.funil = id => t.k.base.funis.find(f => f.id === id) || null;
    let corpo = null;
    t.k.ui.modal = async o => { corpo = o.corpo; const ac = o.acoes.find(a => a.tipo === "primario"); return ac.fn({ erro: e => { throw new Error(e); } }); };
    const sel = () => corpo.querySelector('select[name="estagio_id"]');
    const prom = t.N.iniciarPosVenda(t.k, { ...t.srv.neg }, { id: 501, nome: "Ana Souza" });
    await prom;
    const salvo = t.reg.chamadas.filter(c => c.nome === "nx_negocio_salvar").at(-1).p.p_negocio;
    assert.equal(salvo.estagio_id, "p1", "CR-220: a 1ª aberta por padrão (o seletor existe)");
    assert.deepEqual(sel().els.map(o => o.textContent), ["Revisão", "Manutenção"], "só as abertas do funil escolhido");
    assert.equal(salvo.servico, "Implante", "CR-221");
    assert.equal(salvo.dono_id, "u9");
    // escolher a etapa 2
    t.k.ui.modal = async o => { corpo = o.corpo; corpo.querySelector('select[name="estagio_id"]').value = "p2"; return o.acoes.find(a => a.tipo === "primario").fn({ erro() {} }); };
    await t.N.iniciarPosVenda(t.k, { ...t.srv.neg }, { id: 501, nome: "Ana Souza" });
    assert.equal(t.reg.chamadas.filter(c => c.nome === "nx_negocio_salvar").at(-1).p.p_negocio.estagio_id, "p2");
    // CR-298: perda com «Retomar em 60 dias»
    let corpoP = null;
    t.k.ui.modal = async o => { corpoP = o.corpo; corpoP.querySelector('select[name="retomar_dias"]').value = "60"; corpoP.querySelector("textarea").value = "sem dinheiro agora";
      corpoP.querySelector('input[type="radio"]').checked = true; return o.acoes.find(a => a.tipo === "perigo").fn({ erro() {} }); };
    corpoP = null;
    const pedidos = [];
    const kk = { ...t.k, api: { rpcC: async (n, p) => { pedidos.push({ n, p }); return n === "nx_negocio_mover" ? { id: 801, estagio_id: "s6" } : { id: 3 }; } } };
    const extra = await t.N.prepararMovimento(kk, { id: 801, titulo: "Ana Souza", estagio_id: "s2", contato: { id: 501 } }, ETAPAS[4]);
    assert.equal(extra.retomar_dias, 60);
    const vence0 = L.retomarEm(60);
    await t.N.moverNegocio(kk, { id: 801, titulo: "Ana Souza", contato: { id: 501 } }, ETAPAS[4], { extra }); await varias();
    const mov = pedidos.find(x => x.n === "nx_negocio_mover");
    assert.equal("retomar_dias" in mov.p.p_extra, false, "a chave da tela não vai ao servidor");
    const tf = pedidos.find(x => x.n === "nx_tarefa_salvar").p.p_tarefa;
    assert.deepEqual([tf.negocio_id, tf.contato_id, tf.vence_em], [801, 501, vence0]);
    assert.match(tf.titulo, /^Retomar contato — Ana Souza$/);
    // CR-230/231
    assert.deepEqual(t.N.linksDoCampo(L, "url", "https://x.com/a").map(l => [l.tipo, l.href, !!l.nova]), [["abrir", "https://x.com/a", true]]);
    // plano 1000b: RB-076 — «x.com» sem https:// agora abre (com https://); inválido é o que não tem domínio
    assert.deepEqual(t.N.linksDoCampo(L, "url", "x.com").map(l => l.href), ["https://x.com"]);
    assert.deepEqual(t.N.linksDoCampo(L, "url", "abc"), [], "link inválido não abre");
    assert.deepEqual(t.N.linksDoCampo(L, "telefone", "(12) 99830-3030").map(l => l.href), ["tel:+5512998303030", "https://wa.me/5512998303030"]);
    const cUrl = t.N.campoPersonalizado(t.k, { chave: "site", rotulo: "Site", tipo: "url" }, "https://clinica.com.br");
    const link = cUrl.querySelector("a.cp-link-abrir");
    assert.equal(link.attrs.target, "_blank"); assert.equal(link.attrs.rel, "noopener noreferrer");
    const cTel = t.N.campoPersonalizado(t.k, { chave: "resp", rotulo: "Telefone do responsável", tipo: "telefone" }, "");
    assert.equal(cTel.querySelectorAll("a.cp-link").length, 0);
    const inp = cTel.querySelector("input"); inp.value = "(12) 99830-3030"; inp.dispara("input");
    assert.deepEqual(cTel.querySelectorAll("a.cp-link").map(a => a.attrs.href), ["tel:+5512998303030", "https://wa.me/5512998303030"]);
  } finally { D.desfazer(); }
});

test("CR-244/245/246/247/248 Tarefas (DOM): visão Semana em 7 colunas; «Ligada a» na tarefa avulsa; vazio de Hoje leva às paradas; concluídas pela hora feita; o deslizar se anuncia", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    ui.vazio = o => h("div", { class: "vazio" }, o.titulo || "", o.acao ? h("button", { type: "button", on: { click: o.acao.fn } }, o.acao.rotulo) : null);
    const chamadas = [], nav = [];
    const agora = new Date();
    const hojeIso = agora.toISOString().slice(0, 10);
    let resp = () => ({ itens: [], contagens: { hoje: 0, atrasadas: 0, proximas: 0 } });
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, erro: e => String(e), ctx: { titulo() {}, navegar: x => nav.push(x) },
      api: { rpcC: async (n, p) => { chamadas.push({ n, p }); return resp(n, p); } }, rascunho: () => ({ apagar() {} }), novaReq: () => "r1",
      escrever: async (n, p) => { chamadas.push({ n, p }); return { resultado: { id: 99, ...p.p_tarefa } }; } };
    // CR-246
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "hoje" } });
    assert.match(tela.textContent, /Nada para hoje\. Que tal revisar as oportunidades paradas\?/);
    botaoTxt(tela, /^Ver oportunidades paradas$/).clique();
    assert.deepEqual(nav, ["#/crm?parados=7"]);
    api.desmontar();
    // CR-244
    resp = (n, p) => (p.p_filtro.situacao === "hoje" ? { itens: [{ id: 1, titulo: "Ligar", tipo: "ligacao", vence_em: agora.toISOString() }], contagens: { hoje: 1, atrasadas: 0, proximas: 1 } }
      : { itens: [{ id: 2, titulo: "Revisão", tipo: "tarefa", vence_em: new Date(Date.now() + 2 * 86400000).toISOString() }], contagens: {} });
    D.storage.set("nx-app-tarefas-vista", "semana");
    const tela2 = h0(D, "div", { class: "crm" });
    const api2 = await T.montarTarefas(k, tela2, { query: { aba: "hoje" } });
    const dias = tela2.querySelectorAll(".tfp-dia");
    assert.equal(dias.length, 7);
    assert.deepEqual(dias.map(d => d.querySelectorAll(".tf-li").length), [1, 0, 1, 0, 0, 0, 0]);
    assert.ok(dias[0].classList.contains("hoje"));
    assert.deepEqual(chamadas.filter(c => c.n === "nx_tarefas_listar").slice(-2).map(c => c.p.p_filtro.situacao).sort(), ["hoje", "proximas"]);
    // CR-248
    assert.match(tela2.querySelector(".tf-li").attrs["aria-description"], /^Deslize para concluir ou adiar; ou use o menu/);
    api2.desmontar();
    // CR-247
    D.storage.set("nx-app-tarefas-vista", "lista");
    const feita = agora.toISOString();
    resp = () => ({ itens: [{ id: 5, titulo: "Antiga", tipo: "tarefa", vence_em: "2026-01-02T12:00:00Z", concluida_em: feita }], contagens: {} });
    const tela3 = h0(D, "div", { class: "crm" });
    const api3 = await T.montarTarefas(k, tela3, { query: { aba: "concluidas" } });
    assert.equal(tela3.querySelector(".tfp-grupo-t span").textContent, "Hoje", "agrupada pelo dia em que foi feita");
    assert.ok(tela3.textContent.includes(`feita hoje às ${feita.slice(11, 16)}`));
    api3.desmontar();
    // CR-245
    resp = (n, p) => (n === "nx_contatos_listar" ? { itens: [{ id: 501, nome: "Mariana Costa", telefone: "5512998303030" }] } : {});
    let corpo = null;
    ui.lerForm = () => ({ titulo: "Ligar para confirmar", tipo: "ligacao" });
    ui.modal = async o => {
      corpo = o.corpo;
      const busca = corpo.querySelector(".tf-ligar-busca");
      busca.value = "mari"; busca.dispara("input"); await varias();
      corpo.querySelector('.crm-busca-res button[data-id="501"]').clique();
      return o.acoes.find(a => a.tipo === "primario").fn({ erro() {} });
    };
    const nova = await T.formTarefa(k, null, {});
    assert.equal(nova.contato_id, 501, "ligada a Mariana");
    assert.match(corpo.querySelector(".crm-escolhido").textContent, /Mariana Costa/);
    const comVinculo = await T.formTarefa({ ...k, ui: { ...ui, modal: async o => { corpo = o.corpo; return null; } } }, null, { contato_id: 9 });
    assert.equal(comVinculo, null);
    assert.equal(corpo.querySelector(".tf-ligar"), null, "já ligada (ficha, negócio): sem o campo");
  } finally { D.desfazer(); }
});

test("CR-239/240/279/232 Importação (DOM): link do modelo; texto do telefone sem jargão; a ajuda de «Atualizar quem já existe» diz o que é somado e o que é trocado; aviso de campo", async () => {
  const D = domDeMentira();
  const U = urlFalsa();
  try {
    const t = await montarImp(D);
    assert.match(t.tela.textContent, /com ou sem o código do Brasil e o 9 do celular/, "CR-279");
    assert.ok(!/com ou sem 55 e 9/.test(t.tela.textContent));
    t.botao("Baixar modelo (CSV)").clique();
    assert.equal(U.criados.length, 1, "CR-239");
    const ajudas = [];
    const t2 = await montarImp(D, { uix: { campo: o => { if (o.nome === "atualizar") ajudas.push(o.ajuda); return uiDeMentira(D.h).campo(o); } } });
    await irParaColunas(t2);
    t2.botao("Continuar").clique();
    // plano 1500c: RC-177 — a ajuda do interruptor é uma frase curta; a regra completa (CR-240) continua na tela, no «Detalhes» recolhível
    assert.match(ajudas.at(-1), /^Ligado: telefone ou e-mail já cadastrado atualiza o cadastro\. Desligado: a linha é pulada\.$/);
    const det = t2.tela.querySelector(".imp-det-regra").textContent;
    assert.match(det, /etiquetas são somadas/, "CR-240");
    assert.match(det, /célula vazia não apaga nada/);
    assert.match(det, /o telefone fica o mesmo/);
  } finally { U.desfazer(); D.desfazer(); }
});

test("CR-209 filtros salvos (DOM): sem filtro escolhido o «Excluir filtro» some; escolhido, aparece", async () => {
  const D = domDeMentira();
  try {
    const ui = uiDeMentira(D.h);
    const k = { ui, h: D.h, L, ctx: { cliente: { id: "cli-v" } }, eu: () => "u1" };
    let dados = { filtro: {}, ordem: "nome" };
    D.storage.set(L.chaveVisoesCRM("cli-v", "u1", "contatos"), JSON.stringify([{ id: "v1", nome: "Por nome", dados: { filtro: {}, ordem: "nome" } }]));
    const c = VisReal.controlesVisoes(k, { tipo: "contatos", obterDados: () => dados, aplicar: async () => {} });
    const ex = c.el.querySelector(".crm-visoes-excluir");
    assert.equal(ex.hidden, false, "o estado atual é o do filtro salvo");
    dados = { filtro: { dono: "eu" }, ordem: "nome" }; c.atualizar();
    assert.equal(ex.hidden, true, "sem filtro escolhido: escondido (antes ficava cinza, parecendo texto)");
  } finally { D.desfazer(); }
});

test("CR-291 Funis (DOM): sem conseguir contar os negócios do funil, nada de «excluir» às cegas", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ui = uiDeMentira(h, {});
    const toasts = [];
    ui.toast = (txt, o) => { toasts.push(txt); return { fechar() {} }; };
    let menu = null;
    ui.menu = (anc, itens) => { menu = itens; return { fechar() {} }; };
    let confirmou = false;
    ui.confirmar = async () => { confirmou = true; return true; };
    const chamadas = [];
    const base = { funis: [{ id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: [] },
      { id: "f2", nome: "Pós-venda", ordem: 2, ativo: true, conta_no_ads: false, estagios: [{ id: "b1", nome: "Novo", tipo: "aberto" }] }] };
    const k = { ui, h, L, base, v: V, cor: () => null, erro: e => String(e), recarregarBase: async () => base,
      api: { rpcC: async n => { chamadas.push(n); if (n === "nx_negocios_kanban") throw Object.assign(new Error("rede"), { codigo: "sem_conexao" }); return {}; } } };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo);
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pós-venda").clique();
    await menu.find(x => x && x.rotulo === "Excluir").fn(); await varias();
    assert.equal(chamadas.includes("nx_funil_excluir"), false, "antes: a contagem falhava e o funil ia para «excluir» como se estivesse vazio");
    assert.equal(confirmou, false);
    assert.match(toasts.at(-1), /Não consegui contar/);
  } finally { D.desfazer(); }
});

test("CR-299/206/285/286/253/257 Início (DOM): KPIs levam ao recorte; «previsão pela chance»; relatório no funil; tabela com nome; consulta sem negócio vai à agenda; meta dentro de Vendas", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    dom.mem.set(`nx-ini-metas:${ID_CLI}`, JSON.stringify({ vendas: 50000 }));
    const ag = agendaDe([...AGENDA.consultas, { negocio_id: null, contato_id: null, nome: "Avulso", status: "aberto", inicio: SP(HOJE, "16"), fim: SP(HOJE, "16", "30") }]);
    const t = await montarTela(ANTIGO(), { dom, agenda: ag });
    const kpi = id => t.raiz.querySelectorAll(".ini-kpi").find(k => k.dataset.kpi === id);
    assert.equal(kpi("aberto").getAttribute("href"), "#/crm?resumo=1", "CR-299: «Em aberto» abre o quadro com o resumo");
    // plano 1500c: RC-182 — 7 dias com hoje incluso = hoje − 6 (o −7 abria um dia a mais que o número do cartão)
    assert.equal(kpi("leads").getAttribute("href"), "#/contatos?criado_de=2026-09-28", "CR-299: leads da semana na lista");
    assert.ok(texto(t.raiz).includes("previsão pela chance de cada etapa") && !texto(t.raiz).includes("previsão ponderada"), "CR-206");
    const ver = t.raiz.querySelectorAll("a").find(a => a.getAttribute("href") === "#/agenda?dia=2026-10-04");
    assert.ok(ver && /Ver na agenda/.test(ver.textContent), "CR-253");
    const vd = t.raiz.querySelector(".ini-vendas .ini-vd-meta");
    assert.ok(vd, "CR-257");
    assert.match(texto(vd), /^Meta: 57% de R\$\s?50\.000 · faltam R\$\s?21\.600$/);   // plano 1000b: RB-158 «57%» sem espaço
    const bt = t.raiz.querySelector(".ini-horas .g-ver-tabela");
    assert.equal(bt.getAttribute("aria-label"), "Ver a agenda de hoje como tabela", "CR-286");
    bt.click();
    assert.equal(bt.getAttribute("aria-label"), "Ver a agenda de hoje como gráfico");
  } finally { dom.fim(); }
  const dom2 = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const t2 = await montarTela(NOVO(), { dom: dom2 });
    const rel = t2.raiz.querySelector(".ini-funil .ini-funil-rel");
    assert.equal(rel && rel.getAttribute("href"), "#/relatorios/vendas", "CR-285");
  } finally { dom2.fim(); }
});

test("CR-181/284 Início (DOM): sem internet nada de erro a cada pulso («Sem internet» no botão) e volta sozinho; «· há 11 min» em âmbar", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  const ouv = {};
  globalThis.addEventListener = (tp, f) => { ouv[tp] = f; };
  const navAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const t = await montarTela(NOVO(), { dom });
    const btn = t.raiz.querySelector(".ini-cab .rel-btn");
    const idade = t.raiz.querySelector(".ini-idade");
    assert.equal(idade.hidden, true, "acabou de ler");
    dom.andar(11 * 60000); dom.relogio();
    assert.equal(idade.hidden, false);
    assert.equal(texto(idade), "· há 11 min", "CR-284");
    assert.ok(idade.classList.contains("ini-velho"), "passou de 10 min: âmbar");
    const n = () => t.chamadas.filter(c => c.nome === "nx_inicio").length, n0 = n();
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    ouv.offline();
    assert.equal(btn.textContent, "Sem internet"); assert.equal(btn.disabled, true);
    dom.andar(31000); await t.pulso();
    assert.equal(n(), n0, "CR-181: o pulso não tenta sem rede");
    assert.equal(t.toasts.length, 0, "nenhum aviso de erro");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
    ouv.online(); await tick(); await tick();
    assert.equal(n(), n0 + 1, "a rede voltou: relê");
    assert.equal(btn.textContent, "Atualizar"); assert.equal(btn.disabled, false);
    assert.equal(idade.hidden, true, "leitura nova: sem a idade");
  } finally { if (navAntes) Object.defineProperty(globalThis, "navigator", navAntes); else delete globalThis.navigator; dom.fim(); }
});

test("CR-252/255 Início (DOM): «Já está bom» por engano tem Desfazer e «desmarcar»; chaves de empresa que saiu da sessão são apagadas", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const t = await montarTela(NOVO(), { dom });
    const orig = t.ctx.api.rpcC;
    t.ctx.api.rpcC = async (n, p, o) => (n === "nx_onboarding_estado" ? { itens: RL.ONBOARDING_ITENS.map(i => ({ id: i.id, feito: false })) } : orig(n, p, o));
    const toasts = [];
    t.ctx.ui.toast = (txt, o = {}) => { toasts.push({ txt, ...o }); return { fechar() {} }; };
    t.raiz.querySelector(".ini-cab .rel-btn").click(); await tick(); await tick(); await tick();
    const ok = t.raiz.querySelectorAll("button").find(b => b.dataset.k === "onb-ok-chave_codewords");
    assert.ok(ok, "o checklist apareceu");
    ok.click(); await tick();
    const chave = `nx-onb:${ID_CLI}:${ID_CONTA}`;
    assert.ok(JSON.parse(dom.mem.get(chave)).pulados.includes("chave_codewords"));
    const av = toasts.find(x => /marcado como feito/.test(x.txt));
    assert.equal(typeof av.desfazer, "function", "CR-252: o aviso tem Desfazer");
    const des = t.raiz.querySelectorAll("button").find(b => b.dataset.k === "onb-des-chave_codewords");
    assert.ok(des, "«desmarcar» em «Já feitos»");
    av.desfazer(); await tick();
    assert.ok(!JSON.parse(dom.mem.get(chave)).pulados.includes("chave_codewords"), "desfeito: o passo volta");
    assert.ok(t.raiz.querySelectorAll("button").find(b => b.dataset.k === "onb-ok-chave_codewords"));
  } finally { dom.fim(); }
  // CR-255
  const dom2 = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const ls = globalThis.localStorage;
    ls.key = i => [...dom2.mem.keys()][i] ?? null;
    Object.defineProperty(ls, "length", { get: () => dom2.mem.size, configurable: true });
    for (const k of ["nx-ini-hist:velha:conta-9", "nx-ini-kpis:velha:conta-9", "nx-ini-hist:velha:outra", `nx-ini-hist:${ID_CLI}:conta-9`]) dom2.mem.set(k, "{}");
    const t = await montarTela(NOVO(), { dom: dom2, conta: "conta-9" });
    assert.ok(dom2.mem.has("nx-ini-hist:velha:conta-9"), "sem a lista de empresas da sessão, nada sai");
    t.ctx.sessao.clientes = [{ id: ID_CLI }];
    await I.montar(t.ctx); await tick();
    assert.deepEqual(["nx-ini-hist:velha:conta-9", "nx-ini-kpis:velha:conta-9"].map(k => dom2.mem.has(k)), [false, false], "a empresa que saiu some do aparelho");
    assert.ok(dom2.mem.has("nx-ini-hist:velha:outra"), "o que é de outra conta fica");
    assert.ok(dom2.mem.has(`nx-ini-hist:${ID_CLI}:conta-9`), "a empresa atual fica");
  } finally { dom2.fim(); }
});

test("crm.css/inicio.css (lote crm-3): só tokens; fieldset sem moldura; etiqueta com nome no desktop; «+» some ao rolar; Semana em 7 colunas; ficha enxuta no celular; links do Início com 32/44 px; Agora 2fr/1fr", () => {
  const css = ler("crm.css");
  const b = css.slice(css.indexOf("frente crm, lote crm-3"));
  assert.ok(b.length > 1000);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(b) && !/\brgba?\(/.test(b), "sem cor fixa");
  assert.ok(!/animation:|@keyframes/.test(b), "nada animado novo");
  assert.match(b, /fieldset\.crm-filtros-grupo \{ border: 0; margin: 0; padding: 0; min-width: 0; \}/, "CR-210");
  // plano 1500c: RC-076 — no celular a 1ª etiqueta mantém o nome (mais curta), em vez de virar um ponto sem nome
  assert.match(b, /@media \(max-width: 760px\) \{ \.kc-etq1 \{ max-width: 5rem; \} \}/, "CR-212 / RC-076");
  assert.match(b, /\.crm-fab\.crm-fab-some \{ transform: translateY\(calc\(100% \+ 32px\)\); opacity: 0; pointer-events: none; \}/, "CR-009");
  assert.match(b, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.crm-fab \{ transition:/, "a transição só sem movimento reduzido");
  assert.match(b, /\.tfp-semana \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/, "CR-244");
  assert.match(b, /@media \(max-width: 760px\) \{ \.tfp-semana \{ grid-template-columns: minmax\(0, 1fr\); \} \}/, "no celular uma coluna (sem rolagem lateral)");
  assert.match(b, /\.crm-kb-idade\.velho \{ color: var\(--c-aten\);/, "CR-296");
  assert.match(b, /@media \(pointer: coarse\) \{ \.cp-link \{ width: 44px; height: 44px; \} \}/, "CR-230/231");
  const ini = ler("inicio.css");
  const bi = ini.slice(ini.indexOf("lote crm-3"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bi) && !/\brgba?\(/.test(bi));
  assert.match(bi, /\.ini \.rel-link \{ display: inline-flex; align-items: center; min-height: 32px; \}/, "CR-180");
  assert.match(bi, /@media \(pointer: coarse\) \{ \.ini \.rel-link, \.ini-tf-abrir \{ min-height: 44px; \} \}/);
  assert.match(bi, /\.ini-agora-grade:has\(\.ini-espera-lista\) \{ grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\);/, "CR-254");
  assert.match(bi, /\.ini-agora-ag \.ini-prox \{ max-height: 20rem; overflow-y: auto;/);
});

test("CR-290/287 testes que faltavam: Empresa na ficha (ligar grava empresa_id; «Tirar da empresa» manda null); tarefa vencida hoje aparece uma vez, em «Hoje»", async () => {
  const D = domDeMentira();
  try {
    let contato = { id: 501, nome: "Ana", telefone: "5512998303030" };
    const t = await montarCt(D, { rpc: (nome, p) => {
      if (nome === "nx_contato_ver") return { contato, empresa: null, rfm: {}, tarefas: [], notas: [], tempo: [], negocios: [], conversas: [] };
      if (nome === "nx_empresas_listar") return { itens: [{ id: 7, nome: "Frota X", cidade: "Taubaté" }] };
      if (nome === "nx_contato_salvar") { contato = { ...contato, ...p.p_contato }; return contato; }
      return undefined;
    } });
    Object.assign(t.k, { nomes: () => ({}), motivosPorId: () => ({}), estagio: () => null, funil: () => null });
    const el = h0(D, "div", { class: "crm", dataset: { tela: "ficha" } });
    await t.M.montarFicha(t.k, el, 501, {});
    const busca = el.querySelector(".fx-emp-busca");
    busca.value = "fro"; busca.dispara("input"); await varias();
    botaoTxt(el.querySelector(".fx-empresa"), /Frota X/).clique(); await varias();
    assert.equal(t.cham("nx_contato_salvar").at(-1).p.p_contato.empresa_id, 7);
    assert.ok(el.querySelector('.fx-empresa a[href="#/empresas/7"]'), "o link para a empresa");
    el.querySelector(".fx-emp-tirar").clique(); await varias();
    assert.equal(t.cham("nx_contato_salvar").at(-1).p.p_contato.empresa_id, null, "«Tirar da empresa» manda null");
    assert.ok(el.querySelector(".fx-emp-busca"), "volta a busca");
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  try {
    const { h } = D2;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const venc = new Date(Date.now() - 60000).toISOString();
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, ctx: { titulo() {}, navegar() {} },
      api: { rpcC: async () => ({ itens: [{ id: 1, titulo: "Ligar", tipo: "ligacao", vence_em: venc, atrasada: true }, { id: 2, titulo: "Sem data", tipo: "tarefa", vence_em: null }], contagens: { hoje: 1, atrasadas: 1, proximas: 0 } }) } };
    const tela = h0(D2, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "hoje" } });
    const grupos = tela.querySelectorAll(".tfp-grupo");
    assert.deepEqual(grupos.map(g => g.querySelector(".tfp-grupo-t span").textContent), ["Hoje", "Sem prazo"]);
    assert.equal(tela.querySelectorAll('.tf[data-id="1"]').length, 1, "a vencida hoje aparece uma vez");
    assert.deepEqual(["hoje", "atrasadas"].map(id => tela.querySelector(`.tfp-pn-${id} b`).textContent), ["1", "1"], "o painel conta pelo servidor");
    api.desmontar();
  } finally { D2.desfazer(); }
});

test("CR-078 Contatos (DOM+CSS): abaixo de 480 px o «Ordenar» é um ícone com o select nativo por cima (nada de «Últ…» cortado espremendo a busca)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarCt(D);
    const tela = h0(D, "div", { class: "crm", dataset: { tela: "contatos" } });
    const api = await t.M.montarContatos(t.k, tela, { query: {} });
    const env = tela.querySelector(".crm-fita .ct-ord-env");
    assert.ok(env && env.querySelector("select.sel") && env.querySelector(".ct-ord-ic"), "o select continua (leitor de tela e seletor nativo) com o ícone ao lado");
    assert.equal(env.querySelector("select.sel").attrs["aria-label"], "Ordenar");
    api.desmontar();
  } finally { D.desfazer(); }
  const css = ler("crm.css");
  assert.match(css, /@media \(max-width: 480px\) \{\s*\.crm\[data-tela="contatos"\] \.crm-fita \.ct-ord-env \{ flex: none; \}\s*\.crm\[data-tela="contatos"\] \.crm-fita \.ct-ord-env \.sel \{ width: 44px;[^}]*color: transparent;/);
  assert.match(css, /\.fx-consent \.pilula \{ white-space: normal; max-width: 100%;/, "a pílula longa do consentimento não alarga a ficha a 360 px");
});

/* ============================================================ lote crm-4 (CR-071, CR-132, CR-133, CR-204 quem moveu, CR-217 agendados sem data,
   SV-135 linha do tempo paginada, nome/telefone da Agenda no novo negócio) */
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

test("CR-071 selo do funil dos anúncios: «Conta nos anúncios» com a mesma dica na gaveta e nas Configurações", async () => {
  for (const arq of ["crm-negocio.js", "crm-config.js"]) assert.equal(ler(arq).includes("Conta no retorno do anúncio"), false, `${arq}: o nome antigo sumiu`);
  assert.match(ler("crm-negocio.js"), /ui\.pilula\("Conta nos anúncios", "neutra", \{ title: "Este funil entra nos números de Anúncios" \}\)/);
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    const selo = t.alvo.querySelectorAll(".pilula").find(p => p.textContent === "Conta nos anúncios");
    assert.ok(selo, "a lista dos funis mostra o selo");
    assert.equal(selo.attrs.title, "Este funil entra nos números de Anúncios", "antes: sem dica nas Configurações");
  } finally { D.desfazer(); }
});

test("CR-132 prazo da etapa em horas ou dias: 72 h abre como «3 dias»; escolher 3 dias grava sla_horas 72; 5 h continua em horas", async () => {
  assert.equal(L.unidadeSla(72), "d"); assert.equal(L.unidadeSla(5), "h"); assert.equal(L.unidadeSla(null), "h"); assert.equal(L.unidadeSla(0), "h");
  assert.equal(L.valorSla(72, "d"), 3); assert.equal(L.valorSla(5, "h"), 5); assert.equal(L.valorSla(null, "d"), "");
  assert.equal(L.horasSla("3", "d"), 72); assert.equal(L.horasSla("1,5", "d"), 36); assert.equal(L.horasSla("", "d"), null); assert.equal(L.horasSla("10", "h"), 10);
  assert.ok(Number.isNaN(L.horasSla("x", "d")));
  assert.deepEqual(L.validarFunil({ nome: "X", estagios: [{ nome: "A", tipo: "aberto", sla_horas: L.horasSla("91", "d") }, { nome: "B", tipo: "ganho" }, { nome: "C", tipo: "perdido" }] }).map(e => e.texto),
    ["O prazo vai de 1 hora a 90 dias (2.160 horas)."], "91 dias passa do limite e a mensagem fala em dias");
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    botaoTxt(t.alvo, /^Editar$/).clique(); await varias();
    const linhas = t.alvo.querySelectorAll(".fe-etapa");
    assert.equal(linhas.length, 4);
    const [n1, n2] = linhas.map(l => l.querySelector(".fe-sla-n"));
    const [u1, u2] = linhas.map(l => l.querySelector("select.fe-sla-un"));
    assert.equal(n1.value, 3, "72 h aparece como 3 dias");
    assert.equal(u1.querySelectorAll("option").find(o => o.selected).value, "d");
    assert.equal(n2.value, 5);
    assert.equal(u2.querySelectorAll("option").find(o => o.selected).value, "h", "5 h não vira fração de dia");
    // a 2ª etapa: digita 3 e troca para dias → 72 h
    n2.value = "3"; n2.dispara("input");
    u2.value = "d"; u2.dispara("change");
    assert.equal(n2.getAttribute("max"), "90");
    assert.match(n2.attrs["aria-label"], /em dias/);
    botaoTxt(t.alvo, /Salvar funil/).clique(); await varias();
    const p = t.salvos().at(-1);
    assert.deepEqual(p.estagios.map(e => e.sla_horas), [72, 72, null, null], "antes: o campo só aceitava horas");
    assert.equal(Object.keys(p.estagios[0]).includes("_slaUn"), false, "a unidade fica só na tela");
  } finally { D.desfazer(); }
});

test("CR-133 «Duplicar» no ⋮ do funil: editor com as mesmas etapas, nome «(cópia)», sem padrão e fora dos anúncios", async () => {
  const D = domDeMentira();
  try {
    const t = await montarFunis(D);
    const menuBt = t.alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pacientes");
    assert.equal(menuBt.hidden, false, "antes: o funil padrão nem tinha o ⋮");
    menuBt.clique();
    const itens = t.reg.menus["Mais ações para Pacientes"];
    assert.deepEqual(itens.filter(x => x && x.rotulo).map(x => x.rotulo), ["Duplicar"], "no padrão só «Duplicar» (sem excluir/desativar)");
    const nAntes = t.reg.chamadas.length;      // plano 1500c: RC-152 — a LISTA de funis conta os abertos de cada um; o editor da cópia continua sem contar
    await itens.find(x => x.rotulo === "Duplicar").fn(); await varias();
    assert.equal(t.alvo.querySelector("h2").textContent, "Cópia de «Pacientes»");
    assert.equal(t.alvo.querySelector('[name="nome"]').value, "Pacientes (cópia)");
    assert.deepEqual(t.alvo.querySelectorAll(".fe-etapa").map(l => l.querySelector(".fe-nome").value), ["Novo", "Avaliação", "Fechou", "Não fechou"]);
    assert.equal(t.alvo.querySelector('[name="conta_no_ads"]').checked, false, "a cópia nasce fora dos anúncios");
    assert.equal(t.reg.chamadas.slice(nAntes).some(c => c.n === "nx_negocios_kanban"), false, "funil novo: nada a contar");
    botaoTxt(t.alvo, /Salvar funil/).clique(); await varias();
    const p = t.salvos().at(-1);
    assert.equal(p.nome, "Pacientes (cópia)");
    assert.equal(p.id, undefined, "cria outro funil");
    assert.equal(p.padrao, undefined, "sem «padrão»");
    assert.equal(p.conta_no_ads, false);
    assert.deepEqual(p.estagios.map(e => [e.nome, e.tipo, e.id, e.marco, e.probabilidade, e.sla_horas]),
      [["Novo", "aberto", undefined, null, 10, 72], ["Avaliação", "aberto", undefined, null, 40, 5], ["Fechou", "ganho", undefined, null, 100, null], ["Não fechou", "perdido", undefined, null, 0, null]]);
    // o outro funil: Duplicar + as ações de antes
    t.alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Mais ações para Pós-venda").clique();
    assert.deepEqual(t.reg.menus["Mais ações para Pós-venda"].filter(x => x && x.rotulo).map(x => x.rotulo), ["Duplicar", "Tornar padrão", "Desativar", "Excluir"]);     // plano 1000b: RB-147 — «Tornar padrão» aparece desligado com o motivo
  } finally { D.desfazer(); }
});

test("CR-204 Kanban (DOM, contrato 20261013d): o cartão movido diz QUEM moveu — nome, automação ou «você, em outra tela»; servidor antigo como antes", async () => {
  const D = domDeMentira();
  try {
    const v1 = quadroDe({ s1: col("s1", cartoes(4, "s1")) });
    const t = await montarKb(D, { dados: v1 });
    const agora = new Date().toISOString();
    const [c1, c2, c3, c4] = cartoes(4, "s1").map(c => ({ ...c, estagio_id: "s2" }));
    t.trocar(quadroDe({ s2: col("s2", [{ ...c1, movido_por: "Bruna Lima", movido_por_id: "u7", movido_em: agora }, { ...c2, movido_por: null, movido_por_id: null, movido_em: agora },
      { ...c3, movido_por: "Eu", movido_por_id: "u1", movido_em: agora }, c4]) }));
    const busca = t.tela.querySelector('input[type="search"]');
    busca.value = "C"; busca.dispara("input");
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.cartao(1).attrs.title, "Mudou de etapa agora (por Bruna Lima)");
    assert.equal(t.cartao(1).querySelector(".kc-movido-por").textContent, "Movido por Bruna Lima", "o nome à vista no cartão");
    assert.equal(t.cartao(2).attrs.title, "Mudou de etapa agora (por uma automação)");
    assert.equal(t.cartao(3).attrs.title, "Mudou de etapa agora (por você, em outra tela)");
    assert.equal(t.cartao(4).attrs.title, "Mudou de etapa agora (outra pessoa da equipe)", "sem o campo: o texto de antes");
    assert.equal(t.cartao(4).querySelector(".kc-movido-por"), null);
    t.api.desmontar();
  } finally { D.desfazer(); }
  assert.match(ler("crm.css"), /\.kc-movido-por \{ position: absolute;[^}]*var\(--c-info-suave\)/);
});

test("SV-135 linha do tempo (DOM): 1ª página cheia ganha «Ver registros mais antigos» (nx_crm_tempo_pagina com p_antes); sem a RPC o botão some", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const ui = uiDeMentira(h, {});
    const chamadas = [];
    let resposta = null;
    const k = { ui, h, L, v: V, nomes: () => ({}), motivosPorId: () => ({}), toastErro() {},
      api: { rpcC: async (n, p) => { chamadas.push({ n, p }); if (resposta instanceof Error) throw resposta; return resposta; } } };
    const base = Date.parse("2026-10-10T12:00:00Z");
    const pag1 = [{ fonte: "nota", id: 1, tipo: "nota", em: "2026-01-01T10:00:00Z", dados: { texto: "fixada antiga", fixada: true } },
      ...Array.from({ length: 79 }, (_, i) => ({ fonte: "historico", id: 100 + i, tipo: "estagio", em: new Date(base - i * 3600000).toISOString(), dados: {} }))];
    // menos de 80: nada de botão (é tudo)
    assert.equal(h0(D, "div", null, T.blocoTempo(k, pag1.slice(0, 10), { pagina: { p_negocio: 9 } })).querySelector(".tempo-mais"), null);
    // sem `pagina` (chamador antigo): nada de botão
    assert.equal(h0(D, "div", null, T.blocoTempo(k, pag1)).querySelector(".tempo-mais"), null);
    const bloco = h0(D, "div", null, T.blocoTempo(k, pag1, { pagina: { p_negocio: 9 } }));
    const mais = bloco.querySelector(".tempo-mais");
    assert.ok(mais, "80 registros: pode haver mais");
    resposta = { itens: [{ fonte: "historico", id: 178, tipo: "estagio", em: pag1[79].em, dados: {} }, { fonte: "nota", id: 50, tipo: "nota", em: "2026-09-01T10:00:00Z", dados: { texto: "velha" } }], tem_mais: true };
    mais.clique(); await varias();
    assert.deepEqual(chamadas.at(-1), { n: "nx_crm_tempo_pagina", p: { p_negocio: 9, p_contato: null, p_antes: pag1[79].em } }, "começa antes do mais antigo que não é nota fixada");
    assert.equal(bloco.querySelectorAll(".tempo-it").length, 81, "o repetido não entra de novo");
    assert.equal(bloco.querySelector('.tempo-filtro[data-filtro="nota"] .tempo-filtro-n').textContent, "2", "os chips contam o que chegou");
    assert.ok(bloco.querySelector(".tempo-mais"), "tem_mais: o botão fica");
    resposta = { itens: [], tem_mais: false };
    bloco.querySelector(".tempo-mais").clique(); await varias();
    assert.equal(bloco.querySelector(".tempo-mais"), null, "acabou: o botão sai");
    // servidor sem a migração: o botão some e a linha do tempo fica como antes
    const b2 = h0(D, "div", null, T.blocoTempo(k, pag1, { pagina: { p_contato: 4 } }));
    resposta = Object.assign(new Error("x"), { status: 404, codigo: "PGRST202" });
    b2.querySelector(".tempo-mais").clique(); await varias();
    assert.equal(b2.querySelector(".tempo-mais"), null);
    assert.equal(b2.querySelectorAll(".tempo-it").length, 80);
    assert.equal(h0(D, "div", null, T.blocoTempo(k, pag1, { pagina: { p_contato: 4 } })).querySelector(".tempo-mais"), null, "e não volta a oferecer");
  } finally { D.desfazer(); }
  assert.match(ler("crm-negocio.js"), /T\.blocoTempo\(k, d\.tempo \|\| \[\], \{ pagina: \{ p_negocio: n\.id \} \}\)/);
  // plano 1000b: RB-112 — a ficha passa também o filtro da linha do tempo (sobrevive ao pulso)
  assert.match(ler("crm-listas.js"), /T\.blocoTempo\(k, d\.tempo \|\| \[\], \{ pagina: \{ p_contato: c\.id \}, filtro: filtroTempo,/);
});

test("Agenda → novo negócio (DOM): dados.nome / dados.telefone abrem o cadastro novo já preenchido e o telefone é conferido", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    await t.N.novoNegocio(t.k, { telefone: "(12) 99830-3030" }, {});
    let g = t.reg.gavetas.at(-1);
    assert.equal(g.corpo.querySelector('[name="c_telefone"]').value, "(12) 99830-3030", "antes: abria a busca vazia");
    assert.equal(g.corpo.querySelector('[name="c_nome"]').value, "");
    assert.ok(t.cham("nx_contatos_listar").some(c => c.p.p_filtro.busca === "12998303030"), "o aviso de cadastro repetido roda já na abertura");
    await t.N.novoNegocio(t.k, { nome: "Mariana Costa" }, {});
    g = t.reg.gavetas.at(-1);
    assert.equal(g.corpo.querySelector('[name="c_nome"]').value, "Mariana Costa");
    // ir para «buscar existente» e voltar mantém o nome
    botaoTxt(g.corpo, /Buscar um cadastro existente/).clique();
    assert.equal(g.corpo.querySelector('[name="c_nome"]'), null);
    botaoTxt(g.corpo, /Cadastrar paciente novo/).clique();
    assert.equal(g.corpo.querySelector('[name="c_nome"]').value, "Mariana Costa");
    // com contato escolhido, nome/telefone não atrapalham
    await t.N.novoNegocio(t.k, { contato_id: 501, nome: "Outro" }, {});
    assert.equal(t.reg.gavetas.at(-1).corpo.querySelector('[name="c_nome"]'), null);
  } finally { D.desfazer(); }
});

test("CR-217 Início (DOM, contrato 20261013d): «Agendados sem data» no Agora, cada um com «Marcar data»; sem o campo, nada", async () => {
  const agora = Date.parse(SP(HOJE, "10", "20"));
  assert.equal(I.listaSemData({}), null, "RPC antiga");
  assert.equal(I.listaSemData({ agendados_sem_data: { total: 0, itens: [] } }), null);
  assert.deepEqual(I.listaSemData({ agendados_sem_data: { total: 7, itens: [
    { id: 11, titulo: "Implante", contato_nome: "Rafael Mendes", estagio_nome: "Avaliação agendada", desde: SP("2026-10-01", "10", "00") },
    { id: 12, titulo: "Clareamento", contato_nome: null, estagio_nome: "Avaliação agendada", desde: SP(HOJE, "07", "20") }, { id: null }] } }, { agora }),
  { total: 7, itens: [{ id: 11, nome: "Rafael Mendes", etapa: "Avaliação agendada", ha: "há 3 dias" }, { id: 12, nome: "Clareamento", etapa: "Avaliação agendada", ha: "há 3 h" }] });
  const dom = comDom({ agora });
  try {
    const d = ANTIGO(); d.conversas.aguardando = 0;
    d.agendados_sem_data = { total: 3, itens: [{ id: 11, titulo: "Implante", contato_nome: "Rafael Mendes", estagio_nome: "Avaliação agendada", desde: SP("2026-10-01", "10", "00") },
      { id: 12, titulo: "Clareamento", contato_nome: "Ana", estagio_nome: "Avaliação agendada", desde: SP(HOJE, "07", "20") }] };
    const t = await montarTela(d, { dom, agenda: agendaDe([]) });
    const abertos = [];
    t.ctx.abrirNegocio = id => abertos.push(id);
    const sd = t.raiz.querySelector(".ini-agora .ini-semdata");
    assert.ok(sd, "o «Agora» abre por causa dos agendados sem data");
    // plano 1500c: RC-215 — o termo explícito e a etapa («3 oportunidades em Avaliação agendada sem data»), sem «delas» ambíguo
    assert.match(texto(sd), /^3 oportunidades em Avaliação agendada sem data/);
    assert.match(texto(sd), /não aparecem na agenda e o lembrete não sai/);
    assert.match(texto(sd), /\+1 no quadro/);
    const bt = sd.querySelector('[data-k="sd-11"]');
    assert.equal(bt.getAttribute("aria-label"), "Abrir Rafael Mendes para marcar a data");
    bt.click();
    assert.deepEqual(abertos, [11]);
  } finally { dom.fim(); }
  const dom2 = comDom({ agora });
  try {
    const t2 = await montarTela(ANTIGO(), { dom: dom2 });
    assert.equal(t2.raiz.querySelector(".ini-semdata"), null, "servidor antigo: nada inventado");
  } finally { dom2.fim(); }
  assert.match(ler("inicio.css"), /\.ini-semdata \{[^}]*var\(--c-aten-suave\)/);
});

/* ============================================================ revisão adversarial (13/10): correções confirmadas */
test("revisão · Início: o KPI «Previsão» tem valor em R$ e link (o comentário de linha engolia valor/formato/href); nenhum comentário de linha engole código", () => {
  const alt = I.kpisAlternativos({ negocios: { previsao_ponderada: 5400 } }, { links: { crm: "#/crm" } });
  const prev = alt.find(x => x.id === "previsao");
  assert.equal(prev.valor, 5400, "antes: sem valor (o cartão saía «0»)");
  assert.equal(prev.formato, "brl", "antes: sem R$");
  assert.equal(prev.href, "#/crm", "antes: sem link");
  assert.equal(prev.sentido, "cima"); assert.equal(prev.tom, "neutro");
  // varredura: «chave: valor,» depois de um comentário de linha que tem código antes (o padrão que engoliu o KPI)
  for (const f of ["inicio.js", "crm-negocio.js", "crm-kanban.js", "crm-tarefas.js", "paleta.js", "ui.js"]) {
    for (const [i, linha] of ler(f).split("\n").entries()) {
      const p = linha.indexOf(" // ");
      if (p < 0 || !linha.slice(0, p).trim() || linha.trim().startsWith("//")) continue;
      const resto = linha.slice(p + 4);
      assert.ok(!/\b[a-z_]+: [^,]+, [a-z_]+: [^,]+,/.test(resto),
        `${f}:${i + 1} — comentário de linha engolindo código: ${linha.trim().slice(0, 140)}`);
    }
  }
});

test("revisão · paleta (DOM): sem rede ou com aviso a busca não oferece «Cadastrar «x»…» (duplicaria o contato); terminada sem erro, oferece", async () => {
  const reg = C3.criarComandos();
  reg.registrar({ id: "crm.novo-contato", rotulo: "Novo paciente", fazer() {}, comTermo() {}, rotuloTermo: t => `Cadastrar «${t}» como paciente` });
  const D = domDeMentira();
  try {
    const ui = uiDeMentira(D.h);
    ui.debounce = (f, ms) => { let t = 0; const g = (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; g.cancelar = () => clearTimeout(t); return g; };
    let fechar = null;
    ui.modal = o => { D.doc.body.appendChild(o.corpo); return new Promise(r => { fechar = () => { o.corpo.remove(); r(null); }; }); };
    const casos = [
      ["sem rede", async () => { throw Object.assign(new Error("offline"), { codigo: "sem_rede" }); }, false],
      ["com aviso", async () => ({ grupos: [], aviso: "A busca de pacientes está indisponível agora." }), false],
      ["sem erro", async () => ({ grupos: [{ titulo: "Pacientes", icone: "contato", itens: [] }] }), true],
    ];
    for (const [nome, buscarDados, oferece] of casos) {
      P.abrir({ ui, C: C3, placeholder: "Buscar", destinos: [], acoes: [], daTela: reg.listar(), recentes: () => [], navegar() {}, buscarDados });
      const campo = D.doc.body.querySelector("input.busca-campo");
      campo.value = "mar"; campo.dispara("input");
      await esperar(260);
      assert.equal(!!botaoTxt(D.doc.body, /^Cadastrar «mar» como paciente$/), oferece, `${nome}: ${oferece ? "oferece" : "não oferece"} o cadastro`);
      fechar(); await tique();
    }
  } finally { D.desfazer(); }
});

test("revisão · Kanban (DOM, celular): filtro salvo escolhido dentro da folha de Filtros fecha a folha — o X depois não desfaz a escolha", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    let opts = null;
    const controles = { el: D.h("div", { class: "crm-visoes" }), atualizar() {} };
    const t = await montarKb(D, { dados: quadroDe(), modx: { visoes: { ...VisReal, controlesVisoes: (k, o) => { opts = o; return controles; } } } });
    t.tela.querySelector(".crm-filtro-bt").clique();
    const flut = t.reg.flut;
    assert.ok(flut.conteudo.querySelector(".crm-filtros-visoes").contains(controles.el), "as visões moram na folha");
    await opts.aplicar({ funil: "f1", filtro: { dono: "eu" }, todosFechados: false });
    assert.equal(flut.api.fechado, true, "a escolha fecha a folha (antes ficava aberta com o formulário antigo)");
    flut.api.fechar();                                  // o X da folha (já fechada: nada a fazer)
    await varias();
    assert.deepEqual(opts.obterDados().filtro, { dono: "eu" }, "antes: o aoFechar relia o formulário antigo e gravava {} por cima");
    assert.ok(controles.el.parentElement && controles.el.parentElement.classList.contains("crm-kb-ferramentas"), "as visões voltam para a linha");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("revisão · Kanban (DOM, celular): sem escolher filtro salvo, fechar a folha pelo X continua aplicando o formulário", async () => {
  const D = domDeMentira({ medias: { "(max-width: 760px)": true } });
  try {
    let opts = null;
    const controles = { el: D.h("div", { class: "crm-visoes" }), atualizar() {} };
    const t = await montarKb(D, { dados: quadroDe(), modx: { visoes: { ...VisReal, controlesVisoes: (k, o) => { opts = o; return controles; } } } });
    t.tela.querySelector(".crm-filtro-bt").clique();
    const sel = t.reg.flut.conteudo.querySelectorAll("select").find(x => x.attrs["aria-label"] === "Parados há");
    sel.value = "7";
    t.reg.flut.api.fechar(); await varias();
    assert.equal(opts.obterDados().filtro.parado_dias, 7, "CR-012 continua: fechar aplica");
    t.api.desmontar();
  } finally { D.desfazer(); }
});

test("revisão · gaveta (DOM): depois de ‹ › trocar de negócio a proteção é zerada — o «›» seguinte anda; o pulso e salvar um campo também zeram", async () => {
  const D = domDeMentira();
  try {
    const nav = [];
    const viz = { 801: { anterior: null, proximo: 802 }, 802: { anterior: 801, proximo: 803 }, 803: { anterior: 802, proximo: null } };
    const t = await montarGaveta(D, { opts: { vizinhos: id => viz[id] || {}, aoNavegar: id => nav.push(id) } });
    // gaveta de mentira com a regra da real: conteúdo trocado pelo código parece «texto não salvo» até zerar()
    let sujo = false, zeradas = 0;
    t.g.estaSujo = () => sujo;
    t.g.zerar = () => { sujo = false; zeradas++; };
    const orig = t.k.api.rpcC;
    t.k.api.rpcC = async (nome, p, x) => { const r = await orig(nome, p, x); if (nome === "nx_negocio_ver" || nome === "nx_negocio_salvar") sujo = true; return r; };
    t.corpo().querySelector(".ng-nav-prox").clique(); await varias();
    assert.deepEqual(nav, [802]);
    assert.equal(sujo, false, "depois de desenhar o outro negócio a base é a tela nova");
    t.corpo().querySelector(".ng-nav-prox").clique(); await varias();
    assert.deepEqual(nav, [802, 803], "antes: «Há texto não salvo nesta gaveta.» sem nada digitado");
    assert.ok(!(t.reg.toasts || []).some(x => /texto não salvo/.test(x)));
    // pulso: relê, redesenha e zera
    const z0 = zeradas; t.srv.neg.valor_previsto = 999;
    const agora = Date.now; Date.now = () => agora() + 60000;
    try { t.reg.pulso(); await varias(); } finally { Date.now = agora; }
    assert.ok(zeradas > z0, "o pulso redesenhou e zerou");
    assert.equal(sujo, false);
    // salvar um campo zera
    const z1 = zeradas;
    const inp = campoDe(t.corpo(), "Valor previsto").querySelector("input");
    inp.value = "1.500,00"; inp.dispara("blur"); await varias();
    assert.ok(t.cham("nx_negocio_salvar").length >= 1);
    assert.ok(zeradas > z1 && sujo === false, "o valor gravado vira a base");
  } finally { D.desfazer(); }
});

test("revisão · Tarefas (DOM): na visão Semana a tarefa excluída sai da grade durante o «Desfazer» (como na Lista) e o «Desfazer» devolve", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const T = await import("../web/app/crm-tarefas.js");
    const reg = {}; const ui = uiDeMentira(h, reg);
    let itensMenu = null;
    ui.menu = (a, l) => { itensMenu = l; return { fechar() {} }; };
    const agora = new Date();
    const resp = (n, p) => (p.p_filtro.situacao === "hoje"
      ? { itens: [{ id: 4101, titulo: "Ligar", tipo: "ligacao", vence_em: agora.toISOString() }, { id: 4102, titulo: "Mandar foto", tipo: "tarefa", vence_em: agora.toISOString() }], contagens: { hoje: 2, atrasadas: 0, proximas: 0 } }
      : { itens: [], contagens: {} });
    const k = { ui, h, L, base: { usuarios: [] }, v: V, pode: () => true, eu: () => "u1", toastErro() {}, erro: e => String(e), ctx: { titulo() {}, navegar() {} },
      api: { rpcC: async (n, p) => resp(n, p) }, rascunho: () => ({ apagar() {} }), novaReq: () => "r1", escrever: async () => ({ resultado: {} }) };
    D.storage.set("nx-app-tarefas-vista", "semana");
    const tela = h0(D, "div", { class: "crm" });
    const api = await T.montarTarefas(k, tela, { query: { aba: "hoje" } });
    const naGrade = () => tela.querySelectorAll(".tfp-dia .tf-li");
    assert.equal(naGrade().length, 2);
    naGrade().find(x => /Ligar/.test(x.textContent)).querySelector(".tf-mais").clique();
    itensMenu.at(-1).fn();
    await varias();
    assert.equal(naGrade().length, 1, "antes: continuava na grade durante o «Desfazer» (concluir/adiar nela dava erro)");
    assert.ok(!naGrade().some(x => /Ligar/.test(x.textContent)), "a excluída sumiu");
    reg.desfazer.at(-1).reverter(); await varias();
    assert.equal(naGrade().length, 2, "o «Desfazer» devolve");
    api.desmontar();
  } finally { D.desfazer(); }
});

test("revisão · crm.css: a 360 px os atalhos do quadro não encolhem (o texto saía cortado: «as oportunid») — o contêiner rola na horizontal", () => {
  const css = ler("crm.css");
  const bloco = css.slice(css.indexOf(".crm-atalhos { flex-wrap: nowrap; overflow-x: auto;"));
  assert.ok(bloco.length > 50, "a regra do celular continua");
  const fimMedia = bloco.indexOf(String.fromCharCode(10) + "}");
  assert.ok(bloco.slice(0, fimMedia).includes(".crm-atalhos > * { flex-shrink: 0; }"), "dentro do mesmo @media do celular");
});
