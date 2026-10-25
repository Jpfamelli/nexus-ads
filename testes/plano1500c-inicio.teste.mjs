/* ============================================================
   ÓRBITA — plano 1500c (21/10/2026), frente inicio (tela Início, gráficos, vocabulário), lotes inicio-b1 e inicio-b2.
   node --test testes/plano1500c-inicio.teste.mjs
   O DOM de mentira e os dados são os do plano1000b-inicio (copiados abaixo, sem mudança). Cada teste cita o item (RC-NNN / IC-NNN).
   Sem rede, sem navegador, sem dependências.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APP = join(RAIZ, "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const I = await import(pathToFileURL(join(APP, "inicio.js")).href);

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

/* ============================================================ (b) COMPORTAMENTO — o DOM de mentira do plano50-inicio */
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * ctx de mentira com as RPCs desta rodada: nx_cv_atribuir (resp.atribuir: função, Error ou promessa pendente), nx_tarefa_concluir, e o
 * `ctx.canais` do shell (contrato A4) com caidos()/assinar()/verNumero() — `canais.mudar(lista)` faz o papel do pulso do shell.
 */
async function montarTela(d, { dom, agenda = AGENDA, papel = "admin", conta = ID_CONTA, semCanais = false, inicioLento = null, esperarMontar = true, onb = null, semPulso = false, versao = "T", rota = { query: {} } } = {}) {
  const U = await import(pathToFileURL(join(APP, "ui.js")).href);
  const ui = { ...U };
  const chamadas = [], navegou = [], toasts = [];
  const resp = { d, agenda, atribuir: null, tarefa: null, onb, erroInicio: null, inicioPendente: null };
  let aoPulso = null;
  const canais = { lista: [], fns: new Set(), viu: 0,
    mudar(l) { canais.lista = l; for (const fn of [...canais.fns]) fn(l.slice()); } };
  ui.toast = (t, o = {}) => { toasts.push({ texto: t, tipo: o.tipo, desfazer: o.desfazer || null }); return { fechar() {}, el: null }; };
  const ctx = {
    alvo: dom.doc.body.appendChild(dom.doc.createElement("main")), versao, rota,
    sessao: { conta: { id: conta, nome: "Helena Souza" }, org: {} },
    cliente: { id: ID_CLI, slug: "demo", nome: "Clínica Demo", vertical: "odonto", modulos: ["conversas", "crm", "ads", "relatorios"] },
    papel, pode: p => (p === "admin" ? papel === "admin" : true), temModulo: () => true, pronto: () => true, configPronta: () => true,
    vocab: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", g_negocio: "a", vertical: "odonto" },
    api: { async rpcC(nome, params) {
      chamadas.push({ nome, params });
      if (nome === "nx_inicio") { if (inicioLento) await inicioLento; if (resp.inicioPendente) await resp.inicioPendente; if (resp.erroInicio) throw resp.erroInicio; return resp.d; }
      if (nome === "nx_agenda_dia") return resp.agenda;
      if (nome === "nx_onboarding_estado") return resp.onb || { total: 11, feitos: 11, obrigatorios: 9, obrigatorios_feitos: 9, pct: 100, completo: true, itens: [] };
      if (nome === "nx_cv_atribuir") { const r = resp.atribuir; if (r instanceof Error) throw r; if (typeof r === "function") return r(params); return r || { id: params.p_conversa, atribuida_a: params.p_conta }; }
      if (nome === "nx_tarefa_concluir") { if (resp.tarefa instanceof Error) throw resp.tarefa; return { ok: true }; }
      return null;
    }, mensagemErro: e => String(e && e.message || e) },
    ui, navegar: h => navegou.push(h), abrirNegocio() {}, abrirContato() {}, titulo() {}, badge() {},
    pulso: semPulso ? undefined : { assinar: fn => { aoPulso = fn; return () => { aoPulso = null; }; } }, naoAtualizar: () => () => {},
    canais: semCanais ? undefined : { caidos: () => canais.lista.slice(), assinar: fn => { canais.fns.add(fn); return () => canais.fns.delete(fn); }, verNumero: () => { canais.viu++; } },
  };
  const extras = { ctx, chamadas, navegou, toasts, resp, canais, raiz: ctx.alvo, pulso: async () => { aoPulso(); await tick(); await tick(); } };
  if (!esperarMontar) { extras.pronto = I.montar(ctx).then(tick); await tick(); return extras; }
  await I.montar(ctx); await tick();
  assert.equal(ctx.alvo.querySelector(".vazio-erro"), null, "a tela não caiu no cartão de erro");
  return extras;
}
const kpiIds = raiz => raiz.querySelectorAll(".ini-kpi").map(k => k.dataset.kpi);

/* ============================================================ plano 1000b · lote inicio-1 */
const G = await import(pathToFileURL(join(APP, "graficos.js")).href);
const V = await import(pathToFileURL(join(APP, "vocab.js")).href);
const RL = await import(pathToFileURL(join(APP, "rel-logica.js")).href);
const CL = await import(pathToFileURL(join(APP, "crm-logica.js")).href);
const VOC_ODONTO = { contato: "paciente", contatos: "pacientes", negocio: "oportunidade", negocios: "oportunidades", feminino: true, consulta: "consulta", consultas: "consultas" };
const ONB_PENDENTE = () => ({ total: 11, feitos: 2, obrigatorios: 9, obrigatorios_feitos: 2, pct: 22, completo: false,
  itens: RL.ONBOARDING_ITENS.map((it, i) => ({ id: it.id, feito: i < 2 })) });
const CHAVE_HIST = `nx-ini-hist:${ID_CLI}:${ID_CONTA}`;
const comNavegador = (onLine, fn) => {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine }, configurable: true, writable: true });
  const volta = () => { if (antes) Object.defineProperty(globalThis, "navigator", antes); else delete globalThis.navigator; };
  return Promise.resolve().then(fn).finally(volta);
};

/* ============================================================ plano 1500c */
const AGORA = Date.parse(SP(HOJE, "10", "20"));
const botao = (raiz, k) => raiz.querySelector(`[data-k="${k}"]`);
const ID_CLI_DONO = `${ID_CLI}|${ID_CONTA}`;

/* ---------- lote inicio-b1: PURO ---------- */
test("RC-180 + RC-275: validarMetas — «1.000» = 1000 consultas; «2,5», «1.5» e «R$ 10.000,00» nas consultas são erro; vendas com milhar e decimal", () => {
  assert.equal(I.validarMetas({ consultas: "1.000" }).consultas, 1000, "antes virava 1");
  assert.equal(I.validarMetas({ consultas: "1.500" }).consultas, 1500, "antes virava 2");
  assert.equal(I.validarMetas({ consultas: "12" }).consultas, 12);
  for (const ruim of ["2,5", "1.5", "R$ 10.000,00", "abc", "-3", "0"]) assert.ok(I.validarMetas({ consultas: ruim }).erros.meta_consultas, ruim);
  assert.equal(I.validarMetas({ consultas: "2,5" }).erros.meta_consultas, "Use um número inteiro maior que zero.");
  assert.equal(I.validarMetas({ vendas: "R$ 10.000,00" }, CL.lerNumero).vendas, 10000);
  assert.equal(I.validarMetas({ vendas: "1.234,56" }, CL.lerNumero).vendas, 1234.56);
  // plano 2000d: DR-298 — a resposta traz também a meta de leads (null quando vazia)
  assert.deepEqual(I.validarMetas({ vendas: "", consultas: "" }), { vendas: null, consultas: null, leads: null, erros: {} });
});

test("RC-181: «Falta 1» no singular (consultas e moeda); «Faltam» acima de 1", () => {
  const p1 = I.progressoMeta({ meta: 10, realizado: 9, dia: 30, diasNoMes: 31 });
  assert.match(I.textoMeta(p1, { fmt: v => String(Math.round(v)) }), /\. Falta 1 —/);
  const p2 = I.progressoMeta({ meta: 10, realizado: 5, dia: 30, diasNoMes: 31 });
  assert.match(I.textoMeta(p2, { fmt: v => String(Math.round(v)) }), /\. Faltam 5 —/);
  assert.match(I.textoMeta(p1, { fmt: v => `R$ ${Math.round(v)}` }), /Falta R\$ 1 —/);
});

test("RC-183: frases dos leads no singular — «O lead dos últimos 7 dias veio de anúncio» e «1 de 1 lead veio»", () => {
  assert.equal(I.notaLeadsAnuncio(1, 1), "O lead dos últimos 7 dias veio de anúncio.");
  assert.equal(I.notaLeadsAnuncio(1, 0), "O lead dos últimos 7 dias não veio de anúncio.");
  assert.equal(I.notaLeadsAnuncio(5, 1), "1 dos 5 leads criados nos últimos 7 dias veio de anúncio.");
  assert.equal(I.notaLeadsAnuncio(23, 14), "14 dos 23 leads criados nos últimos 7 dias vieram de anúncio.");
  assert.equal(I.rotuloOrigem(1, 1, 100), "1 de 1 lead veio de anúncio (100%)");
  assert.equal(I.rotuloOrigem(23, 14, 61), "14 de 23 leads vieram de anúncio (61%)");
});

test("RC-184 + RC-276: chavesInicioOrfas — checklist (nx-onb) e metas da empresa perdida saem; a meta fica se outra conta do aparelho ainda tem a empresa", () => {
  const chaves = ["nx-onb:9:5", "nx-ini-metas:9", "nx-ini-hist:9:5", "nx-onb:1:5", "nx-ini-metas:1", "nx-ini-metas:7", "nx-ini-hist:7:outra", "nx-onb:9:outra-conta-x"];
  // a conta «5» perdeu as empresas 9 e 7; a 7 ainda tem chave de outra conta → a meta da 7 fica; a 9 também tem («nx-onb:9:outra-conta-x»)
  assert.deepEqual(I.chavesInicioOrfas(chaves, { clientes: [{ id: "1" }], conta: "5" }), ["nx-onb:9:5", "nx-ini-hist:9:5"]);
  assert.deepEqual(I.chavesInicioOrfas(["nx-onb:9:5", "nx-ini-metas:9"], { clientes: [{ id: "1" }], conta: "5" }), ["nx-onb:9:5", "nx-ini-metas:9"], "ninguém mais tem a 9: a meta sai");
  // conta anônima «-» e chaves com formato desconhecido (id com dois-pontos) ficam quietas
  assert.deepEqual(I.chavesInicioOrfas(["nx-ini-kpis:9:-", "nx-onb:9:-", "nx-ini-hist:a:b:c"], { clientes: ["1"], conta: "-" }), ["nx-ini-kpis:9:-", "nx-onb:9:-"]);
  assert.deepEqual(I.chavesInicioOrfas(["nx-onb:9:5"], { clientes: [], conta: "5" }), [], "sem a lista de empresas, nada sai");
});

test("RC-185: primeiroNome com a primeira letra maiúscula («joão silva» → «João»; «dra. ângela» → «Ângela»)", () => {
  assert.equal(I.primeiroNome("joão silva"), "João");
  assert.equal(I.primeiroNome("dra. ângela dias"), "Ângela");
  assert.equal(I.primeiroNome("Helena"), "Helena");
  assert.equal(I.primeiroNome("Prof."), "");
});

test("RC-187 + RC-301: o prazo da empresa (conversas.prazo_min) no «Respondidas no prazo» e no vermelho da espera; sem ele, 15 e 30", () => {
  const d = NOVO(); d.conversas.prazo_min = 30;
  const k = I.kpisInicio(d, AGENDA, { hoje: HOJE }).find(x => x.id === "prazo");
  assert.equal(k.sub, "1ª resposta em até 30 min · 7 dias"); assert.match(k.ajuda, /em até 30 minutos/);
  assert.equal(I.kpisInicio(NOVO(), AGENDA, { hoje: HOJE }).find(x => x.id === "prazo").sub, "1ª resposta em até 15 min · 7 dias");
  const r = NOVO(); r.conversas.prazo_min = 10; r.conversas.espera_mais_antiga_min = 12;
  assert.equal(I.kpisInicio(r, AGENDA, { hoje: HOJE })[0].tom, "ruim", "12 min com prazo de 10: vermelho");
  const s = NOVO(); s.conversas.espera_mais_antiga_min = 12;
  assert.equal(I.kpisInicio(s, AGENDA, { hoje: HOJE })[0].tom, "aten", "sem prazo: vermelho só a partir de 30");
  assert.equal(I.prazoResposta({}), 15); assert.equal(I.limiteEspera({}), 30); assert.equal(I.limiteEspera({ prazo_min: 10 }), 10);
});

test("RC-193: ordenarTarefas — atrasadas no topo (a mais antiga primeiro), as outras na ordem do servidor", () => {
  const l = [{ id: 1, atrasada: false }, { id: 2, atrasada: true, vence_em: SP(HOJE, "09") }, { id: 3, atrasada: false }, { id: 4, atrasada: true, vence_em: SP("2026-10-01", "09") }];
  assert.deepEqual(I.ordenarTarefas(l).map(x => x.id), [4, 2, 1, 3]);
  assert.deepEqual(I.ordenarTarefas(null), []);
});

test("RC-196: textoDiferenca — «+R$ 8.100 a mais», «−R$ 800 a menos», «igual»; sem os dois números, vazio", () => {
  const brl = v => `R$ ${v.toLocaleString("pt-BR")}`;
  assert.equal(I.textoDiferenca(28400, 20300, brl), "+R$ 8.100 a mais que no mesmo período");
  assert.equal(I.textoDiferenca(1000, 1800, brl), "−R$ 800 a menos que no mesmo período");
  // plano 2000d: DR-296 — «igual» diz o número, não só que empatou
  assert.equal(I.textoDiferenca(5, 5, brl), "igual: R$ 5 nos dois períodos");
  assert.equal(I.textoDiferenca(null, 5, brl), "");
});

test("RC-200 + RC-224: consulta sem fim dura o padrão da agenda (60 min); 23:30 que vira o dia; «CANCELADA» em maiúscula fica fora", () => {
  const ag = { data: HOJE, duracao_padrao_min: 60, consultas: [{ negocio_id: 1, inicio: SP(HOJE, "10", "00"), status: "aberto" }] };
  const agora = Date.parse(SP(HOJE, "10", "40"));
  assert.equal(I.proximasConsultas(ag, { hoje: HOJE, agora }).hoje[0].estado, "agora", "às 10:40 ainda está acontecendo (antes: passou às 10:30)");
  assert.equal(I.proximasConsultas({ ...ag, duracao_padrao_min: null }, { hoje: HOJE, agora }).hoje[0].estado, "passou", "sem o padrão, 30 min");
  assert.equal(I.proximasConsultas(ag, { hoje: HOJE, agora, duracaoPadrao: 20 }).hoje[0].estado, "passou", "a opção vence o campo");
  const noite = { consultas: [{ negocio_id: 2, inicio: SP(HOJE, "23", "30"), fim: SP("2026-10-05", "00", "30"), status: "aberto" },
    { negocio_id: 3, inicio: SP(HOJE, "15"), status: "CANCELADA" }] };
  const r = I.proximasConsultas(noite, { hoje: HOJE, agora: Date.parse(SP("2026-10-05", "00", "10")) });
  assert.equal(r.hoje.length, 1, "a cancelada (maiúscula) não conta"); assert.equal(r.hoje[0].estado, "agora", "passou da meia-noite e ainda não acabou");
  assert.equal(I.proximasConsultas(noite, { hoje: "2026-10-05", agora: Date.parse(SP("2026-10-05", "00", "10")) }).hoje.length, 0, "é do dia em que começou");
});

test("RC-201: semPresenca — as de hoje que passaram com negócio e sem Compareceu/Faltou", () => {
  const ag = { consultas: [{ negocio_id: 1, inicio: SP(HOJE, "08"), fim: SP(HOJE, "08", "30") }, { negocio_id: 2, inicio: SP(HOJE, "09"), fim: SP(HOJE, "09", "30"), presenca: "compareceu" },
    { negocio_id: null, inicio: SP(HOJE, "09"), fim: SP(HOJE, "09", "30") }, { negocio_id: 4, inicio: SP(HOJE, "09"), fim: SP(HOJE, "09", "30"), marco: "faltou" }, { negocio_id: 5, inicio: SP(HOJE, "15") }] };
  assert.deepEqual(I.proximasConsultas(ag, { hoje: HOJE, agora: AGORA }).semPresenca.map(c => c.negocio_id), [1]);
});

test("RC-202: precisaConfirmar — só a de amanhã com o campo confirmacao pendente; sem o campo, nunca", () => {
  const am = "2026-10-05";
  assert.equal(I.precisaConfirmar({ inicio: SP(am, "10"), confirmacao: null }, am), true);
  assert.equal(I.precisaConfirmar({ inicio: SP(am, "10"), confirmacao: "pendente" }, am), true);
  assert.equal(I.precisaConfirmar({ inicio: SP(am, "10"), confirmacao: "confirmada" }, am), false);
  assert.equal(I.precisaConfirmar({ inicio: SP(am, "10"), confirmacao: true }, am), false);
  assert.equal(I.precisaConfirmar({ inicio: SP(am, "10") }, am), false, "sem o campo: nada inventado");
  assert.equal(I.precisaConfirmar({ inicio: SP(HOJE, "10"), confirmacao: null }, am), false, "só amanhã");
});

test("RC-204: faixaEspera — ok < 5 min, atenção até o prazo, «passou do prazo» a partir dele (texto além da cor)", () => {
  assert.deepEqual(I.faixaEspera(2), { faixa: "ok", texto: "" });
  assert.deepEqual(I.faixaEspera(10), { faixa: "aten", texto: "responda logo" });
  assert.deepEqual(I.faixaEspera(30), { faixa: "ruim", texto: "passou do prazo" });
  assert.equal(I.faixaEspera(12, 10).faixa, "ruim", "o prazo da empresa");
  assert.equal(I.faixaEspera(null).faixa, "ok");
});

test("RC-206: rotuloOpcaoKpi — o nome e o valor de agora («Receita do mês — R$ 28.400»); sem dado, só o nome", () => {
  const brl = v => `R$ ${v.toLocaleString("pt-BR")}`;
  assert.equal(I.rotuloOpcaoKpi({ rotulo: "Receita do mês", valor: 28400, formato: "brl" }, { brl }), "Receita do mês — R$ 28.400");
  assert.equal(I.rotuloOpcaoKpi({ rotulo: "Respondidas no prazo", valor: 78, formato: "pct" }), "Respondidas no prazo — 78%");
  assert.equal(I.rotuloOpcaoKpi({ rotulo: "Consultas hoje", valor: null, formato: "int" }), "Consultas hoje");
});

test("RC-210: assinaturaInicio — com nx_inicio.versao não serializa a resposta inteira; sem ela, como antes", () => {
  let grandes = 0; const contar = () => { grandes++; };
  const a = I.assinaturaInicio({ versao: "v7", conversas: { aguardando: 1 } }, { agenda: null }, contar);
  const b = I.assinaturaInicio({ versao: "v7", conversas: { aguardando: 99 } }, { agenda: null }, contar);
  assert.equal(a, b, "mesma versão = sem mudança"); assert.equal(grandes, 0, "nenhum stringify grande");
  assert.notEqual(I.assinaturaInicio({ versao: "v8" }, { agenda: null }, contar), a);
  assert.notEqual(I.assinaturaInicio({ conversas: { aguardando: 1 } }, {}, contar), I.assinaturaInicio({ conversas: { aguardando: 2 } }, {}, contar));
  assert.equal(grandes, 2, "sem versão: a serialização de antes");
});

test("RC-211: teclaLivre — campo, editável, diálogo aberto → não; o resto → sim", () => {
  const el = (tag, attrs = {}) => ({ nodeType: 1, localName: tag, getAttribute: k => attrs[k] ?? null, closest: () => null });
  assert.equal(I.teclaLivre(el("input")), false); assert.equal(I.teclaLivre(el("textarea")), false); assert.equal(I.teclaLivre(el("select")), false);
  assert.equal(I.teclaLivre(el("div", { contenteditable: "true" })), false);
  assert.equal(I.teclaLivre(el("button"), { querySelector: () => null }), true);
  assert.equal(I.teclaLivre(el("button"), { querySelector: s => (s === "dialog[open]" ? {} : null) }), false);
  assert.equal(I.teclaLivre({ ...el("a"), closest: s => (/dialog/.test(s) ? {} : null) }), false);
});

test("RC-215: fraseSemData — termo explícito e a etapa quando todos estão na mesma", () => {
  const voc = { negocio: "oportunidade", negocios: "oportunidades" };
  assert.equal(I.fraseSemData({ total: 2, itens: [{ etapa: "Agendou" }, { etapa: "Agendou" }] }, voc), "2 oportunidades em Agendou sem data");
  assert.equal(I.fraseSemData({ total: 1, itens: [{ etapa: "Agendou" }] }, { negocio: "orçamento" }), "1 orçamento em Agendou sem data");
  assert.equal(I.fraseSemData({ total: 3, itens: [{ etapa: "A" }, { etapa: "B" }] }, voc), "3 oportunidades na etapa de agendamento sem data");
});

test("RC-218: funilComparado — «do lead à venda» deste mês × o anterior; sem o campo, null", () => {
  const d = NOVO(); d.funil_mes_anterior = { leads: 40, ganhos: 4 };
  const c = I.funilComparado(d);
  assert.equal(Math.round(c.atual), 39); assert.equal(c.anterior, 10);
  assert.equal(I.funilComparado(NOVO()), null);
  assert.equal(I.funilComparado({ funil_mes: { leads: 0 }, funil_mes_anterior: { leads: 1, ganhos: 1 } }), null);
});

test("RC-219 + RC-325 + RC-338 + RC-339: equipe, desde que começou, aniversariantes e esfriando — só com o campo do servidor", () => {
  assert.equal(I.equipeMes({}), null); assert.equal(I.equipeMes({ equipe: [] }), null);
  assert.deepEqual(I.equipeMes({ equipe: [{ conta_id: "a", nome: "Ana", ganhos: 2, valor: 3000, tpr_media_min: 9 }, { conta_id: "b", nome: "Bia", ganhos: 5, valor: 9000, tpr_media_min: 4 }, { nome: "" }] }).map(x => x.nome), ["Bia", "Ana"]);
  assert.equal(I.desdeInicio({}), null);
  assert.equal(I.desdeInicio({ desde_inicio: { primeiro: { mes: "2026-10" }, atual: { mes: "2026-10" } } }), null, "o 1º mês é o atual: nada a comparar");
  const ds = I.desdeInicio({ desde_inicio: { primeiro: { mes: "2026-04", leads: 30, tpr_media_min: 95, receita: 12000 }, atual: { mes: "2026-10", leads: 96, tpr_media_min: 8, receita: 31800 } } });
  assert.deepEqual(ds.linhas.map(x => [x.id, x.melhor]), [["leads", true], ["tpr", true], ["receita", true]]);
  assert.equal(I.mesPorExtenso("2026-04"), "abril de 2026");
  assert.equal(I.aniversariantesHoje({}), null);
  assert.deepEqual(I.aniversariantesHoje({ aniversariantes: [{ contato_id: 5, nome: "Lia", conversa_id: 77 }, { nome: " " }] }), [{ contatoId: 5, nome: "Lia", conversaId: 77 }]);
  assert.equal(I.listaEsfriando({}), null); assert.equal(I.listaEsfriando({ esfriando: { total: 0, itens: [] } }), null);
  const ef = I.listaEsfriando({ esfriando: { total: 8, itens: [{ id: 1, contato_nome: "A", parado_dias: 8 }, { id: 2, titulo: "B", parado_dias: 15, valor: 900 }, { id: null }] } });
  assert.equal(ef.total, 8); assert.deepEqual(ef.itens.map(x => [x.id, x.dias]), [[2, 15], [1, 8]]);
});

test("RC-221: dataCurta — «ter, 21 out» (sem pontos), no fuso de SP", () => {
  assert.equal(I.dataCurta(new Date("2026-10-20T15:00:00Z")), "ter, 20 out");
  assert.equal(I.dataCurta(new Date("2026-10-21T02:00:00Z")), "ter, 20 out", "23h de SP ainda é o dia 20");
});

/* ---------- lote inicio-b1: TELA ---------- */
test("RC-182 + RC-297: «Leads · 7 dias» e os números do bloco Leads abrem a lista certa (hoje − 6, hoje, de anúncio hoje)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ANTIGO(), { dom });
    const kpi = t.raiz.querySelectorAll(".ini-kpi").find(k => k.dataset.kpi === "leads");
    assert.equal(kpi.getAttribute("href"), "#/contatos?criado_de=2026-09-28", "7 dias com hoje: 28/09 a 04/10");
    assert.equal(botao(t.raiz, "ld-sem").getAttribute("href"), "#/contatos?criado_de=2026-09-28");
    assert.equal(botao(t.raiz, "ld-hoje").getAttribute("href"), `#/contatos?criado_de=${HOJE}`);
    assert.equal(botao(t.raiz, "ld-an").getAttribute("href"), `#/contatos?criado_de=${HOJE}&origem=anuncio`);
  } finally { dom.fim(); }
});

test("RC-183 (DOM): uma semana com 1 lead de anúncio — nota e barra no singular", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = ANTIGO(); d.leads = { hoje: 1, hoje_anuncio: 1, semana: 1, semana_anuncio: 1 };
    const t = await montarTela(d, { dom });
    const bloco = t.raiz.querySelector(".ini-leads");
    assert.match(texto(bloco), /O lead dos últimos 7 dias veio de anúncio\./);
    assert.equal(bloco.querySelector(".ini-origem").getAttribute("aria-label"), "1 de 1 lead veio de anúncio (100%)");
  } finally { dom.fim(); }
});

test("RC-186: nx_onboarding_estado sem «itens» não derruba a atualização", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, onb: {} });
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    assert.ok(!t.toasts.some(x => x.tipo === "erro"), "nenhum «falhou»");
    assert.match(texto(t.raiz.querySelector(".ini-quando")), /^Atualizado às/);
  } finally { dom.fim(); }
});

test("RC-188: «Tudo em dia» traz o próximo passo — oportunidades paradas há 7+ dias no quadro", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = ANTIGO(); d.conversas.aguardando = 0; d.conversas.sem_dono = 0; d.tarefas = { hoje: 0, atrasadas: 0, abertas: 0, proximas: [] };
    const t = await montarTela(d, { dom });
    const selo = t.raiz.querySelector(".ini-em-dia");
    assert.ok(selo, "o selo aparece");
    const bt = selo.querySelectorAll("button").find(b => /paradas há 7\+ dias/.test(b.textContent));
    assert.ok(bt, "o botão do próximo passo"); assert.match(bt.textContent, /oportunidades paradas/);
    bt.click();
    assert.deepEqual(t.navegou, ["#/crm?parados=7"]);
  } finally { dom.fim(); }
});

test("RC-189 + RC-242: a linha do KPI de dinheiro lê «R$ 60.000», não «60000»; sem fmt, a sparkline usa milhar", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const svg = t.raiz.querySelector('[data-kpi-env="aberto"] svg.g-spark');
    assert.ok(svg, "a linha do «Em aberto»");
    assert.match(svg.getAttribute("aria-label"), /^Em aberto: de R\$\s60\.000 a R\$\s61\.000/);
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("span"));
    G.sparkline(alvo, { valores: [15200, 18000], rotulo: "X" });
    assert.match(alvo.querySelector("svg").getAttribute("aria-label"), /^X: de 15\.200 a 18\.000 em 2 pontos/);
  } finally { dom.fim(); }
});

test("RC-190: sem receita_mes na resposta, o dia guardado fica sem ponto de receita (null), não zero", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = ANTIGO(); delete d.negocios.receita_mes;
    await montarTela(d, { dom });
    const hist = JSON.parse(dom.mem.get(CHAVE_HIST));
    assert.equal(hist.dias.find(x => x.dia === HOJE).receita_mes, null);
    assert.equal(I.serieHistorico({ dias: [{ dia: "a", receita_mes: 1 }, { dia: "b", receita_mes: null }, { dia: "c", receita_mes: 3 }, { dia: "d", receita_mes: 4 }] }, "receita_mes").length, 3, "o dia sem número fica fora da linha");
  } finally { dom.fim(); }
});

test("RC-191 + RC-192 + RC-193: tarefa avulsa abre o formulário; «Amanhã» adia com Desfazer; a atrasada vem no topo com o atraso em negrito", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = ANTIGO();
    d.tarefas.proximas = [{ id: 81, titulo: "Ligar fornecedor", vence_em: SP(HOJE, "17"), atrasada: false },
      { id: 82, titulo: "Cobrar retorno", vence_em: SP("2026-10-01", "09"), atrasada: true }];
    d.tarefas.atrasadas = 1;
    const t = await montarTela(d, { dom });
    const formas = [];
    t.ctx.carregar = async () => ({ kit: async () => ({ mod: async () => ({ formTarefa: async (k, tf) => { formas.push(tf && tf.id); return null; } }) }) });
    // a tela foi montada antes do ctx.carregar: redesenha para o botão nascer com ele
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    const itens = t.raiz.querySelectorAll(".ini-tf-item");
    assert.equal(texto(itens[0].querySelector(".ini-tf-abrir, .ini-tf-t")), "Cobrar retorno", "RC-193: a atrasada primeiro");
    assert.ok(itens[0].querySelector("b.ini-tf-atraso"), "o atraso em negrito");
    const avulsa = botao(t.raiz, "tfa-81");
    assert.ok(avulsa && avulsa.localName === "button", "RC-191: a tarefa sem contato é um botão");
    avulsa.click(); await tick(); await tick();
    assert.deepEqual(formas, [81], "abre o formulário com a própria tarefa");
    const adiar = botao(t.raiz, "tfd-81");
    assert.equal(adiar.getAttribute("aria-label"), "Adiar para amanhã: Ligar fornecedor");
    adiar.click(); await tick(); await tick();
    const salvas = t.chamadas.filter(c => c.nome === "nx_tarefa_salvar");
    assert.deepEqual(salvas[0].params, { p_tarefa: { id: 81, vence_em: I.adiarParaAmanha(SP(HOJE, "17")) } });
    assert.equal(I.adiarParaAmanha(SP(HOJE, "17")), new Date(SP("2026-10-05", "17")).toISOString(), "amanhã, mesma hora");
    const aviso = t.toasts.find(x => /Adiada para amanhã/.test(x.texto));
    assert.ok(aviso && aviso.desfazer, "com Desfazer");
    aviso.desfazer(); await tick(); await tick();
    assert.deepEqual(t.chamadas.filter(c => c.nome === "nx_tarefa_salvar")[1].params, { p_tarefa: { id: 81, vence_em: SP(HOJE, "17") } }, "Desfazer devolve o prazo de antes");
  } finally { dom.fim(); }
});

test("RC-194 + RC-195 + RC-196: Vendas — ganhos levam ao relatório, previsão abre o resumo e tem «i», diferença em reais com sinal", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ANTIGO(), { dom });
    assert.equal(botao(t.raiz, "vd-ganhos").getAttribute("href"), "#/relatorios/vendas");
    assert.match(texto(botao(t.raiz, "vd-ganhos")), /^9 oportunidades ganhas no mês$/);
    assert.equal(botao(t.raiz, "n-prev").getAttribute("href"), "#/crm?resumo=1");
    const i = botao(t.raiz, "aj-vd-prev");
    assert.ok(i && !i.closest("a"), "o «i» fica fora do link"); assert.equal(i.getAttribute("aria-label"), "O que é «Previsão»?");
    assert.match(texto(botao(t.raiz, "vd-dif")), /^\+R\$\s8\.100 a mais que no mesmo período$/);
  } finally { dom.fim(); }
});

test("RC-197 + RC-198 + RC-199: barras da agenda — «0» nas vazias; listbox com posição; tocar/Enter abre a agenda do dia (e da hora)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ANTIGO(), { dom });
    const lista = t.raiz.querySelector(".ini-bv-lista");
    assert.equal(lista.getAttribute("role"), "listbox");
    const barras = lista.querySelectorAll(".ini-bv");
    assert.equal(barras[0].getAttribute("role"), "option");
    assert.equal(barras[2].getAttribute("aria-posinset"), "3"); assert.equal(barras[2].getAttribute("aria-setsize"), String(barras.length));
    const vazia = barras.find(b => b.classList.contains("ini-bv-0"));
    assert.equal(texto(vazia.querySelector(".ini-bv-n")), "0", "RC-197");
    const b14 = botao(t.raiz, "bv-14");
    b14.click();
    assert.deepEqual(t.navegou, [`#/agenda?dia=${HOJE}&hora=14:00`]);
    b14.focus(); dom.ev(b14, "focus"); dom.ev(lista, "keydown", { key: "Enter", target: b14 });
    assert.equal(t.navegou[1], `#/agenda?dia=${HOJE}&hora=14:00`, "Enter também");
    assert.equal(b14.getAttribute("aria-selected"), "true");
  } finally { dom.fim(); }
});

test("RC-201 (DOM): consulta que passou sem presença gera a linha e o botão abre o negócio", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const ag = agendaDe([{ negocio_id: 900, nome: "Paula", inicio: SP(HOJE, "08"), fim: SP(HOJE, "08", "40"), status: "aberto" }, ...AGENDA.consultas]);
    const t = await montarTela(ANTIGO(), { dom, agenda: ag });
    const abertos = []; t.ctx.abrirNegocio = (id, o) => abertos.push([id, o && o.aba]);
    const linha = t.raiz.querySelector(".ini-sempres");
    assert.match(texto(linha), /^1 passou sem presença marcada/);
    botao(t.raiz, "pr-900").click(); await tick();
    assert.deepEqual(abertos, [[900, "presenca"]]);
  } finally { dom.fim(); }
});

test("RC-202 (DOM): a consulta de amanhã sem confirmação mostra o selo e «Pedir confirmação» abre a conversa do paciente", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "19", "00")) });
  try {
    const ag = agendaDe([{ negocio_id: 801, contato_id: 501, nome: "Mariana Costa", status: "aberto", inicio: SP("2026-10-05", "10"), fim: SP("2026-10-05", "10", "45"), confirmacao: "pendente" }]);
    const t = await montarTela(ANTIGO(), { dom, agenda: ag });
    const item = t.raiz.querySelector(".ini-prox-naoconf");
    assert.ok(item, "o selo de não confirmada"); assert.match(texto(item), /não confirmada/);
    // plano 2000d: DR-292 — a conversa já abre com o pedido de confirmação escrito
    const href = botao(t.raiz, "px-conf-801").getAttribute("href");
    assert.ok(href.startsWith("#/conversas?contato=501&texto="), href);
    assert.match(decodeURIComponent(href.split("texto=")[1]), /confirmar a sua consulta amanhã às 10:00/);
  } finally { dom.fim(); }
});

test("RC-203: «+N depois» das consultas de hoje é link para a agenda de hoje", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const ag = agendaDe(Array.from({ length: 6 }, (_, i) => ({ negocio_id: 700 + i, nome: `P${i}`, status: "aberto", inicio: SP(HOJE, String(11 + i)), fim: SP(HOJE, String(11 + i), "30") })));
    const t = await montarTela(ANTIGO(), { dom, agenda: ag });
    const l = botao(t.raiz, "px-depois");
    assert.equal(texto(l), "+2 depois"); assert.equal(l.getAttribute("href"), `#/agenda?dia=${HOJE}`);
  } finally { dom.fim(); }
});

test("RC-204 + RC-299 (DOM): faixas da fila com texto; a mesma escrita da espera no «Atendimento agora» e no «Agora»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.conversas.espera_mais_antiga_min = 65;
    d.conversas.aguardando_lista = [{ id: 1, nome: "A", espera_min: 65 }, { id: 2, nome: "B", espera_min: 10 }, { id: 3, nome: "C", espera_min: 2 }];
    const t = await montarTela(d, { dom });
    const fx = t.raiz.querySelectorAll(".ini-espera-item").map(li => li.dataset.faixa);
    assert.deepEqual(fx, ["ruim", "aten", "ok"]);
    assert.match(texto(t.raiz.querySelector('.ini-espera-item[data-faixa="ruim"]')), /passou do prazo/);
    assert.match(texto(t.raiz.querySelector(".ini-agora-espera")), /há 1 h 05 min/);
    assert.match(texto(t.raiz.querySelector(".ini-atend .ini-espera")), /há 1 h 05 min/);
  } finally { dom.fim(); }
});

test("RC-205: «Assumir» tem Desfazer — devolve a quem estava (ou à fila)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.conversas.aguardando_lista = [{ id: 901, nome: "Mariana", espera_min: 5 }];
    const t = await montarTela(d, { dom });
    botao(t.raiz, "ag-assumir-901").click(); await tick(); await tick();
    const aviso = t.toasts.find(x => x.texto === "Conversa com você.");
    assert.ok(aviso && aviso.desfazer, "o aviso traz Desfazer");
    aviso.desfazer(); await tick(); await tick();
    const ch = t.chamadas.filter(c => c.nome === "nx_cv_atribuir");
    assert.deepEqual(ch[1].params, { p_conversa: 901, p_conta: null }, "estava sem responsável: volta à fila");
    assert.ok(t.toasts.some(x => x.texto === "Conversa de volta à fila."));
  } finally { dom.fim(); }
});

test("RC-206 (DOM): «Trocar indicadores» mostra o valor de cada opção", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    let flut = null; t.ctx.ui.flutuante = (a, c) => { flut = c; return { fechar() {} }; };
    botao(t.raiz, "kpis-trocar").click(); await tick();
    const ops = flut.querySelectorAll("option").map(o => texto(o));
    assert.ok(ops.includes("Receita do mês — R$ 28.400") || ops.some(o => /^Receita do mês — R\$\s28\.400$/.test(o)), ops.join(" | "));
    assert.ok(ops.some(o => /^Respondidas no prazo — 78%$/.test(o)));
  } finally { dom.fim(); }
});

test("RC-207 + RC-208: «Mais detalhes» aberto fica guardado; recolher um bloco não recria a tela (as linhas dos KPIs são os mesmos nós)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const det = t.raiz.querySelector("details.ini-mais");
    det.open = true; dom.ev(det, "toggle");
    assert.equal(JSON.parse(dom.mem.get(`nx-ini-blocos:${ID_CLI}:${ID_CONTA}`)).mais, true);
    const sp = t.raiz.querySelector(".ini-kpi-sp");
    const rec = botao(t.raiz, "bl-rec-vendas");
    rec.click(); await tick();
    assert.equal(t.raiz.querySelector(".ini-kpi-sp"), sp, "RC-208: nada redesenhado");
    assert.equal(rec.getAttribute("aria-expanded"), "false"); assert.equal(t.raiz.querySelector("#ini-bc-vendas").hidden, true);
    assert.deepEqual(JSON.parse(dom.mem.get(`nx-ini-blocos:${ID_CLI}:${ID_CONTA}`)).recolhidos, ["vendas"]);
    assert.ok(botao(t.raiz, "bl-restaurar"), "«Restaurar ordem» aparece sem redesenhar");
    rec.click(); await tick();
    assert.equal(rec.getAttribute("aria-expanded"), "true"); assert.equal(t.raiz.querySelector("#ini-bc-vendas").hidden, false);
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    assert.equal(t2.raiz.querySelector("details.ini-mais").open, true, "RC-207: volta aberto");
  } finally { dom.fim(); }
});

test("RC-209: com o checklist pendente, o pulso não relê nx_onboarding_estado por 10 min; «Atualizar» relê", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    const n = () => t.chamadas.filter(c => c.nome === "nx_onboarding_estado").length;
    const n0 = n();
    dom.andar(31000); await t.pulso(); dom.andar(31000); await t.pulso();
    assert.equal(n(), n0, "2 pulsos: nenhuma chamada");
    dom.andar(10 * 60000); await t.pulso();
    assert.equal(n(), n0 + 1, "passados 10 min, relê");
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    assert.equal(n(), n0 + 2, "Atualizar sempre relê");
  } finally { dom.fim(); }
});

test("RC-211 + RC-230: «R» atualiza (fora de campos) e anuncia; o pulso não desliga o botão", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const bt = t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar");
    assert.equal(bt.getAttribute("aria-keyshortcuts"), "R");
    const anuncios = []; t.ctx.ui.anunciar = x => anuncios.push(x);
    const n = () => t.chamadas.filter(c => c.nome === "nx_inicio").length, n0 = n();
    dom.ev(dom.doc, "keydown", { key: "r", target: dom.doc.body }); await tick(); await tick();
    assert.equal(n(), n0 + 1); assert.deepEqual(anuncios, ["Atualizado"]);
    const campo = dom.doc.body.appendChild(dom.doc.createElement("input"));
    dom.ev(dom.doc, "keydown", { key: "r", target: campo }); await tick();
    assert.equal(n(), n0 + 1, "digitando num campo: nada");
    dom.ev(dom.doc, "keydown", { key: "r", ctrlKey: true, target: dom.doc.body }); await tick();
    assert.equal(n(), n0 + 1, "Ctrl+R é do navegador");
    // RC-230: durante a leitura do pulso o botão segue ligado
    let soltar; t.resp.inicioPendente = new Promise(ok => { soltar = ok; });
    dom.andar(31000); t.pulso();
    await tick();
    assert.equal(bt.disabled, false, "o pulso não pisca o botão");
    soltar(); t.resp.inicioPendente = null; await tick(); await tick();
  } finally { dom.fim(); }
});

test("RC-212: atendente vê quem administra a conta na faixa do número caído (quando o servidor diz)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.admin_nome = "Helena Souza"; d.canais[0] = { ...d.canais[0], estado: "desconectado", desde: SP(HOJE, "10") };
    const t = await montarTela(d, { dom, papel: "atendente" });
    assert.match(texto(t.raiz.querySelector(".ini-faixa-canal")), /Peça a Helena Souza, que administra a conta, para reconectar\./);
    const d2 = NOVO(); d2.canais[0] = { ...d2.canais[0], estado: "desconectado" };
    I.desmontar();
    const t2 = await montarTela(d2, { dom, papel: "atendente" });
    assert.match(texto(t2.raiz.querySelector(".ini-faixa-canal")), /Peça ao administrador para reconectar\./, "sem o campo, como antes");
  } finally { dom.fim(); }
});

test("RC-213 + RC-214: «Testar» o número (só com pode_testar) mostra «Enviado às»; «Copiar» o erro técnico", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.canais = [{ ...d.canais[0], pode_testar: true }, { id: "cw2", nome: "Filial", status: "erro", ultimo_erro: "token expired", estado: "conectado" }];
    const copiados = [];
    const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true, clipboard: { writeText: async x => { copiados.push(x); } } }, configurable: true, writable: true });
    try {
      const t = await montarTela(d, { dom });
      assert.equal(botao(t.raiz, "cn-testar-cw2"), null, "sem pode_testar, sem botão");
      botao(t.raiz, "cn-testar-cw1").click(); await tick(); await tick();
      assert.deepEqual(t.chamadas.find(c => c.nome === "nx_canal_testar").params, { p_canal: "cw1" });
      assert.match(texto(t.raiz.querySelector(".ini-canal-teste")), /^Enviado às 10:20/);
      botao(t.raiz, "cn-copiar-cw2").click(); await tick();
      assert.deepEqual(copiados, ["Filial: token expired"]);
    } finally { if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator; }
  } finally { dom.fim(); }
});

test("RC-216: o lugar do «Fazer agora» também fica na sessão da aba — depois de recarregar, o foco volta ao item", async () => {
  const dom = comDom({ agora: AGORA });
  const sess = new Map();
  globalThis.sessionStorage = { getItem: k => (sess.has(k) ? sess.get(k) : null), setItem: (k, v) => sess.set(k, String(v)), removeItem: k => sess.delete(k) };
  try {
    const t = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    const fazer = t.raiz.querySelector('[data-k^="onb-"]:not([data-k^="onb-ok"]):not([data-k^="onb-des"]):not([data-k="onb-dispensar"])');
    fazer.click();
    const guardado = JSON.parse(sess.get("nx-ini-volta"));
    assert.equal(guardado.dono, ID_CLI_DONO); assert.equal(`onb-${guardado.item}`, fazer.dataset.k);
    // «recarregar»: a memória do módulo some (outra montagem consome), a sessão fica
    I.desmontar();
    sess.set("nx-ini-volta", JSON.stringify(guardado));
    const t2 = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    await esperar(90);
    assert.equal(dom.doc.activeElement && dom.doc.activeElement.dataset.k, fazer.dataset.k, "o foco no mesmo item");
    assert.equal(sess.has("nx-ini-volta"), false, "lido uma vez e apagado");
    assert.ok(t2);
  } finally { delete globalThis.sessionStorage; dom.fim(); }
});

test("RC-217 + RC-218 + RC-341: funil do mês — R$ na etapa dos ganhos, chip contra o mês passado e etapas que abrem a lista", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.funil_mes_anterior = { leads: 40, ganhos: 4 };
    const t = await montarTela(d, { dom });
    const fn = t.raiz.querySelector(".ini-funil");
    const ganhos = fn.querySelectorAll(".g-fetapa")[3];
    assert.match(texto(ganhos.querySelector(".g-fvalor")), /^R\$\s28\.400$/);
    assert.equal(ganhos.querySelector("a.g-flink").getAttribute("href"), "#/relatorios/vendas");
    assert.equal(fn.querySelectorAll(".g-fetapa")[0].querySelector("a.g-flink").getAttribute("href"), "#/contatos?criado_de=2026-10-01");
    assert.match(texto(botao(t.raiz, "fn-cmp")), /^▲ 29 p.p. do lead à venda vs\. 10% no mês passado$/);
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    assert.equal(botao(t2.raiz, "fn-cmp"), null, "sem funil_mes_anterior: sem chip");
  } finally { dom.fim(); }
});

test("RC-219 + RC-325 + RC-338 + RC-339 (DOM): equipe (admin), desde que começou, aniversariantes no «Agora» e esfriando — só com os campos", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.equipe = [{ conta_id: "a", nome: "Ana", ganhos: 2, valor: 3000, tpr_media_min: 9 }, { conta_id: "b", nome: "Bia", ganhos: 5, valor: 9000, tpr_media_min: 4 }];
    d.desde_inicio = { primeiro: { mes: "2026-04", leads: 30, tpr_media_min: 95, receita: 12000 }, atual: { mes: "2026-10", leads: 96, tpr_media_min: 8, receita: 31800 } };
    d.aniversariantes = [{ contato_id: 5, nome: "Lia Prado", conversa_id: 77 }];
    d.esfriando = { total: 7, itens: [{ id: 41, contato_nome: "Rui", estagio_nome: "Orçamento", parado_dias: 12, valor: 1800 }] };
    const t = await montarTela(d, { dom });
    const eq = t.raiz.querySelector("details.ini-mais .ini-equipe");
    assert.ok(eq, "equipe recolhida em «Mais detalhes»");
    // plano 2000d: DR-355 — quem não é o 1º vê quanto falta para chegar lá
    assert.deepEqual(eq.querySelectorAll("tbody th").map(x => texto(x)), ["1º lugar: Bia", "Ana · a R$ 6.000 do 1º lugar"]);     // plano 2000d: IY-053 — «lugar:» só para o leitor de tela
    assert.match(texto(t.raiz.querySelector(".ini-desde")), /abril de 2026 × agora/);
    assert.match(texto(t.raiz.querySelector(".ini-aniv")), /Faz aniversário hoje.*Lia Prado/);
    // plano 2000d: DR-256 — a conversa abre com os parabéns escritos
    assert.ok(botao(t.raiz, "aniv-5").getAttribute("href").startsWith("#/conversas/77?texto="));
    const ef = t.raiz.querySelector(".ini-esfr");
    assert.match(texto(ef), /7 sem mensagem nem tarefa há 7\+ dias/); assert.match(texto(ef), /parado há 12 dias/);
    assert.equal(botao(t.raiz, "ef-todos").getAttribute("href"), "#/crm?parados=7");
    I.desmontar();
    const t2 = await montarTela(d, { dom, papel: "atendente" });
    assert.equal(t2.raiz.querySelector(".ini-equipe"), null, "a equipe é só do admin");
    assert.equal(t2.raiz.querySelector(".ini-desde"), null);
    I.desmontar();
    const t3 = await montarTela(NOVO(), { dom });
    for (const s of [".ini-equipe", ".ini-desde", ".ini-aniv", ".ini-esfr"]) assert.equal(t3.raiz.querySelector(s), null, `servidor antigo: sem ${s}`);
  } finally { dom.fim(); }
});

test("RC-222: a manchete encurtada para a tela continua inteira para o leitor de tela", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.tarefas.atrasadas = 3;
    const t = await montarTela(d, { dom });
    const h1 = t.raiz.querySelector("h1");
    const completa = RL.manchete(d, { agenda: AGENDA, links: {}, voc: {} });
    assert.ok(texto(h1).length < h1.getAttribute("aria-label").length, "o visual é mais curto");
    assert.match(h1.getAttribute("aria-label"), /atrasad/i, "a pendência cortada do visual está no nome acessível");
    assert.ok(completa.frases.length >= 1);
  } finally { dom.fim(); }
});

test("RC-221 + RC-223 (DOM): data longa e curta no cabeçalho; a idade âmbar diz para tocar em Atualizar", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const data = t.raiz.querySelector("time.ini-data");
    assert.ok(data.querySelector(".ini-data-longa")); assert.equal(data.querySelector(".ini-data-curta").getAttribute("aria-hidden"), "true");
    dom.andar(11 * 60000); dom.relogio();
    const idade = t.raiz.querySelector(".ini-idade");
    assert.ok(idade.classList.contains("ini-velho"));
    assert.equal(idade.getAttribute("title"), "Sem atualização há 11 min — toque em Atualizar");
  } finally { dom.fim(); }
});

/* ---------- lote inicio-b2: PURO ---------- */
test("RC-225: encurtarManchete com 3 frases — corta no meio da 2ª com ponto final e texto achatado", () => {
  const no = v => ({ t: "link", partes: [{ t: "t", v }] });
  const m = { frases: [[no("A"), { t: "txt", v: "." }], [no("B"), { t: "txt", v: " e " }, no("C"), { t: "txt", v: "." }], [no("D"), { t: "txt", v: "." }]], texto: "A. B e C. D.", pendencia: true };
  const r = I.encurtarManchete(m, { max: 2 });
  assert.equal(r.texto, "A. B."); assert.equal(r.encurtada, true); assert.equal(r.pendencia, true);
  assert.deepEqual(r.frases.map(f => f[f.length - 1]), [{ t: "txt", v: "." }, { t: "txt", v: "." }], "cada frase termina em ponto");
  const r1 = I.encurtarManchete({ frases: [[no("A"), { t: "txt", v: " e " }, no("B"), { t: "txt", v: " e " }, no("C"), { t: "txt", v: "." }]] }, { max: 2 });
  assert.equal(r1.texto, "A e B.");
});

test("RC-226: aplicarEscolhaKpis com escolha corrompida de versão antiga — posição/id inválidos ignorados, sem repetir indicador", () => {
  const padrao = I.kpisInicio(ANTIGO(), AGENDA, { hoje: HOJE }), alt = I.kpisAlternativos(ANTIGO());
  const ids = e => I.aplicarEscolhaKpis(padrao, alt, e).map(k => k.id);
  assert.deepEqual(ids({ 0: "x", 9: "leads" }), ["aguardando", "consultas", "aberto", "leads"]);
  assert.deepEqual(ids({ 0: "aberto" }), ["aguardando", "consultas", "aberto", "leads"], "repetiria «aberto»: ignorado");
  assert.deepEqual(ids({ 1: "receita", 5: "x" }), ["aguardando", "receita", "aberto", "leads"], "o que é válido fica");
  assert.deepEqual(ids("lixo"), ["aguardando", "consultas", "aberto", "leads"]);
  assert.deepEqual(ids({ "-1": "receita" }), ["aguardando", "consultas", "aberto", "leads"]);
});

test("RC-277: consultasPorHora — consulta às 23h estica até 23; às 6h começa às 6", () => {
  const ag = agendaDe([{ negocio_id: 1, inicio: SP(HOJE, "23", "10"), status: "aberto" }, { negocio_id: 2, inicio: SP(HOJE, "06", "30"), status: "aberto" }]);
  const r = I.consultasPorHora(ag, HOJE);
  assert.equal(r.horas[0].h, 6); assert.equal(r.horas[r.horas.length - 1].h, 23);
  assert.equal(r.horas.find(x => x.h === 23).n, 1); assert.equal(r.total, 2); assert.equal(r.max, 1);
  const so = I.consultasPorHora(agendaDe([{ negocio_id: 3, inicio: SP(HOJE, "23"), status: "aberto" }]), HOJE);
  assert.deepEqual([so.horas[0].h, so.horas.at(-1).h], [8, 23]);
});

test("RC-278: funilMes com etapa do meio zerada — [10, 0, 3, 1]: marcadas sem taxa; ganhos sobre as marcadas", () => {
  const f = I.funilMes({ funil_mes: { leads: 10, conversas: 0, agendados: 3, ganhos: 1 } });
  assert.deepEqual(f.etapas.map(e => e.conversao), ["", "0% dos leads", "", "33% das consultas marcadas"]);
  assert.equal(f.geral, 0.1);
});

test("RC-231: vários números caídos dizem desde quando caiu o primeiro", () => {
  const agora = Date.parse(SP(HOJE, "10", "40"));
  const l = [{ nome: "A", desde: SP(HOJE, "10", "30") }, { nome: "B", desde: SP(HOJE, "10", "00") }];
  assert.equal(I.textoNumeroCaido(l, agora), "2 números de WhatsApp desconectados (o primeiro há 40 min): A e B.");     // plano 2000d: IY-026
  assert.equal(I.textoNumeroCaido([{ nome: "A" }, { nome: "B" }], agora), "2 números de WhatsApp desconectados: A e B.", "sem data, como antes");     // plano 2000d: IY-026
});

test("RC-232: sugestaoMetaVendas — o mês passado inteiro e +10% arredondado a R$ 100", () => {
  assert.deepEqual(I.sugestaoMetaVendas({ receita_mes_anterior: 20300 }), { mesPassado: 20300, mais10: 22400 });
  assert.equal(I.sugestaoMetaVendas({ receita_mes_anterior: 0 }), null); assert.equal(I.sugestaoMetaVendas({}), null);
});

test("RC-233: divisaoPlataformas — só com os dois campos", () => {
  assert.deepEqual(I.divisaoPlataformas({ semana_meta: 9, semana_google: 5 }), { meta: 9, google: 5 });
  assert.equal(I.divisaoPlataformas({ semana_meta: 9 }), null); assert.equal(I.divisaoPlataformas(null), null);
});

test("RC-235: rotuloContraDia — «vs. ontem» ou «vs. dd/mm»", () => {
  assert.equal(I.rotuloContraDia("2026-10-03", HOJE), "vs. ontem");
  assert.equal(I.rotuloContraDia("2026-09-30", HOJE), "vs. 30/09");
  assert.equal(I.rotuloContraDia(null, HOJE), "");
});

test("RC-241 + RC-243: funil com «1.500» e o «i» da taxa acima de 100% que abre no toque", () => {
  const dom = comDom();
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    G.funil(alvo, { etapas: [{ nome: "Leads", qtd: 1500 }, { nome: "Conversas", qtd: 1800, conversao: "mais que a etapa anterior", dica: "120% dos leads: contagens do mês." }], resumo: "F" });
    assert.equal(texto(alvo.querySelector(".g-fqtd")), "1.500");
    const bt = alvo.querySelector(".g-fdica-bt"), txt = alvo.querySelector(".g-fdica-txt");
    assert.ok(bt && txt.hidden); assert.equal(bt.getAttribute("aria-expanded"), "false");
    bt.click();
    assert.equal(txt.hidden, false); assert.equal(texto(txt), "120% dos leads: contagens do mês."); assert.equal(bt.getAttribute("aria-expanded"), "true");
    G.funil(alvo, { etapas: [{ nome: "X", qtd: 7, href: "#/crm" }, { nome: "Y", qtd: 2, href: "https://fora.com" }], resumo: "F", fmtQtd: v => `${v} un.` });
    assert.equal(alvo.querySelectorAll("a.g-flink").length, 1, "só link interno"); assert.equal(texto(alvo.querySelector(".g-fqtd")), "7 un.");
  } finally { dom.fim(); }
});

test("RC-244: a 1ª seta no mapa de calor foca a célula de maior valor", () => {
  const dom = comDom();
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const m = Array.from({ length: 7 }, () => Array(24).fill(0)); m[6][7] = 9; m[2][15] = 4;     // sábado 7h é o maior
    G.calor(alvo, { matriz: m, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => `${v} msgs`, resumo: "Mapa" });
    const caixa = alvo.querySelector(".g-calcaixa");
    dom.ev(caixa, "keydown", { key: "ArrowRight" });
    assert.equal(texto(caixa.querySelector(".g-dica")), "sáb 07h: 9 msgs");
    assert.ok(alvo.querySelector('.g-cal-c[data-l="5"][data-h="7"]').classList.contains("g-ativa"));
  } finally { dom.fim(); }
});

test("RC-245 + RC-246: «Ver como tabela» leva o foco à tabela; «Copiar tabela» (TSV) só com a tabela à vista", async () => {
  const dom = comDom();
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copiados = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async x => { copiados.push(x); } } }, configurable: true, writable: true });
  try {
    const card = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const graf = card.appendChild(dom.doc.createElement("div")), rodape = card.appendChild(dom.doc.createElement("div"));
    const bt = G.alternarTabela(rodape, graf, { colunas: ["Dia", "Qtd"], linhas: [["seg", "1"], ["ter\tx", "2"]], legenda: "Por dia" });
    const cp = rodape.querySelector(".g-copiar-tabela");
    assert.ok(cp.hidden, "com o gráfico à vista, sem copiar");
    bt.click();
    assert.equal(dom.doc.activeElement, card.querySelector("table"), "o foco na tabela");
    assert.equal(card.querySelector("table").getAttribute("tabindex"), "-1");
    assert.equal(cp.hidden, false);
    cp.click(); await tick();
    assert.deepEqual(copiados, ["Dia\tQtd\nseg\t1\nter x\t2"]);
    assert.equal(cp.textContent, "Copiada");
    assert.equal(G.tabelaTsv(["a"], [[null], ["b\nc"]]), "a\n\nb c");
  } finally { if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator; dom.fim(); }
});

test("RC-247: eixo de taxas em fração sem dízima — 0,9 vira 0 · 0,25 · 0,5 · 0,75 · 1; contagens continuam inteiras", () => {
  assert.deepEqual(G.ticks(0.9), [0, 0.25, 0.5, 0.75, 1]);
  for (const v of G.ticks(0.62)) assert.equal(Math.round(v * 100) / 100, v, `sem dízima: ${v}`);
  assert.deepEqual(G.ticks(9), [0, 3, 6, 9, 12], "contagem: sem 2,5");
  assert.deepEqual(G.ticks(2.2), [0, 0.6, 1.2, 1.8, 2.4], "acima de 1 nada muda");
});

test("RC-248 + RC-251: vocab — gênero de palavras comuns («Nova tarefa», «Nenhuma etiqueta») e CHAVES com a palavra da agenda", () => {
  const v = V.vocab("odonto");
  assert.equal(v.novo("tarefa"), "Nova tarefa"); assert.equal(v.novo("etiqueta"), "Nova etiqueta"); assert.equal(v.novo("empresa"), "Nova empresa parceira");     // plano 2000d: DR-172 — a empresa na clínica é «empresa parceira»
  assert.equal(v.nenhum("tarefas"), "Nenhuma tarefa"); assert.equal(v.nenhum("etiqueta"), "Nenhuma etiqueta");
  assert.equal(v.novo("funil"), "Novo funil"); assert.equal(v.art("nota"), "a");
  assert.equal(V.vocab("oficina").novo("negocio"), "Novo orçamento", "a vertical vence a tabela");
  assert.equal(v.novo("xyz"), "Novo xyz");
  assert.ok(V.CHAVES.includes("compromisso") && V.CHAVES.includes("compromissos"));
  for (const vert of V.VERTICAIS) for (const k of V.CHAVES) assert.equal(typeof V.vocab(vert)[k], "string", `${vert}.${k}`);
});

test("RC-254: linhasResumoMes — só o que o servidor manda; retorno dos anúncios só com o gasto", () => {
  const brl = v => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
  const l = I.linhasResumoMes(NOVO(), { brl, voc: VOC_ODONTO });
  const ids = l.map(x => x.id);
  // plano 2000d: DR-253/254 — sai «leads 7 dias» e o prazo de 7 dias (o resumo é do mês); entra o ticket médio; o prazo do mês só quando o servidor manda
  assert.deepEqual(ids, ["receita", "ganhos", "vs", "ticket", "leads", "conv", "aberto"]);
  assert.equal(l.find(x => x.id === "ganhos").rotulo, "Oportunidades ganhas");
  const dp = NOVO(); dp.conversas.respondidas_no_prazo_mes_pct = 78;
  assert.equal(I.linhasResumoMes(dp, { brl }).find(x => x.id === "prazo").valor, "78%");
  const d = NOVO(); d.gasto_anuncios_mes = 2000;
  assert.equal(I.linhasResumoMes(d, { brl }).find(x => x.id === "roi").valor, "R$ 14");
  assert.deepEqual(I.linhasResumoMes({}, { brl }), []);
});

test("IC-001: retornoAnuncios — «cada R$ 1 virou R$ X» só com gasto e receita; prefere a receita que veio de anúncio", () => {
  assert.equal(I.retornoAnuncios(NOVO()), null, "sem gasto no servidor: nada estimado");
  const d = NOVO(); d.gasto_anuncios_mes = 2000;
  assert.deepEqual(I.retornoAnuncios(d), { multiplo: 14.2, receita: 28400, gasto: 2000, deAnuncio: false });
  d.negocios.receita_anuncio_mes = 18000;
  assert.equal(I.retornoAnuncios(d).multiplo, 9); assert.equal(I.retornoAnuncios(d).deAnuncio, true);
  d.gasto_anuncios_mes = 0; assert.equal(I.retornoAnuncios(d), null);
  assert.equal(I.textoMultiplo(9), "R$ 9,00"); assert.equal(I.textoMultiplo(13.4), "R$ 13"); assert.equal(I.textoMultiplo(0.5), "R$ 0,50");
});

test("IC-002: guiaPrimeiroUso — WhatsApp, anúncios e agenda (o que o plano libera); rota só para o admin que abre a seção", () => {
  const todos = I.guiaPrimeiroUso({ admin: true });
  // plano 2000d: DR-263/264 — entram «Trazer seus clientes» e «Ajustar o funil»
  assert.deepEqual(todos.map(p => [p.id, p.rota]), [["whatsapp", "#/config/numeros?assistente=novo"], ["contatos", "#/crm?importar=1"], ["anuncios", "#/config/anuncios"], ["agenda", "#/config/agenda"], ["funil", "#/config/funil"]]);
  assert.deepEqual(I.guiaPrimeiroUso({ admin: true, temModulo: m => m !== "ads" }).map(p => p.id), ["whatsapp", "contatos", "agenda", "funil"]);
  assert.ok(I.guiaPrimeiroUso({ admin: false }).every(p => p.rota === null), "quem não é admin vê os passos sem botão");
  const f = I.guiaPrimeiroUso({ admin: true, feito: ids => ids.includes("anuncios_ligados") });
  assert.deepEqual(f.map(p => p.feito), [false, false, true, false, false]); // plano 2000d: DR-263/264 — cinco passos
});

test("IC-002 + RC-229: dadosExemplo — números redondos de exemplo, datas relativas a hoje, marcados como exemplo", () => {
  const { d, agenda } = I.dadosExemplo(HOJE, AGORA);
  assert.equal(d.exemplo, true); assert.equal(d.hoje, HOJE); assert.equal(agenda.exemplo, true);
  assert.equal(RL.inicioVazio(d), false, "o exemplo tem o que mostrar");
  assert.ok(agenda.consultas.every(c => c.negocio_id === null), "nenhum id real");
  assert.ok(I.retornoAnuncios(d), "o exemplo mostra o «cada R$ 1»");
});

/* ---------- lote inicio-b2: TELA ---------- */
const ZERADO = () => ({ hoje: HOJE, conversas: { aguardando: 0, abertas: 0, pendentes: 0 }, tarefas: { hoje: 0, atrasadas: 0, proximas: [] }, negocios: { abertos: 0, ganhos_mes: 0, receita_mes: 0 }, leads: { semana: 0 }, canais: [] });

test("IC-002 + RC-229 (DOM): conta zerada — «Comece por aqui» com WhatsApp/anúncios/agenda e «Ver um exemplo» que mostra o Início com o selo EXEMPLO; nada grava", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ZERADO(), { dom, agenda: agendaDe([]) });
    assert.ok(t.raiz.querySelector(".vazio-primeiro"), "o vazio continua (M09)");
    const guia = t.raiz.querySelector(".ini-guia");
    // plano 2000d: DR-263/264 — cinco passos
    assert.deepEqual(guia.querySelectorAll(".ini-guia-item").map(li => li.dataset.passo), ["whatsapp", "contatos", "anuncios", "agenda", "funil"]);
    assert.equal(botao(t.raiz, "guia-whatsapp").getAttribute("href"), "#/config/numeros?assistente=novo");
    assert.ok(botao(t.raiz, "guia-whatsapp").classList.contains("bt-prim"), "o 1º pendente em destaque");
    const ex = t.raiz.querySelectorAll("button").find(b => b.textContent === "Ver um exemplo");
    ex.click(); await tick();
    assert.equal(t.raiz.querySelectorAll(".ini-kpi").length, 4, "o Início com dados");
    assert.ok(t.raiz.querySelector(".ini-exemplo-faixa")); assert.match(texto(t.raiz.querySelector(".ini-exemplo-selo")), /Exemplo/);
    assert.ok(t.raiz.querySelector(".ini-roi"), "o «cada R$ 1 virou» aparece no exemplo");
    assert.match(texto(t.raiz.querySelector(".ini-roi")), /Cada R\$ 1 virou R\$ 9,00/);
    // ações não fazem nada de verdade
    const n0 = t.chamadas.length;
    const assumir = t.raiz.querySelector('[data-k^="ag-assumir-"]');
    assumir.click(); await tick();
    assert.equal(t.chamadas.length, n0, "nenhuma RPC"); assert.ok(t.toasts.some(x => /É só um exemplo/.test(x.texto)));
    assert.equal(dom.mem.has(CHAVE_HIST) && JSON.parse(dom.mem.get(CHAVE_HIST)).dias.some(x => x.leads_semana > 0), false, "o histórico não guarda o exemplo");
    botao(t.raiz, "ex-sair").click(); await tick();
    assert.ok(t.raiz.querySelector(".vazio-primeiro")); assert.equal(t.raiz.querySelector(".ini-exemplo-faixa"), null);
  } finally { dom.fim(); }
});

test("IC-001 (DOM): com o gasto do mês, o cartão «Cada R$ 1 virou R$ X» sob a manchete; sem ele, nada", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.gasto_anuncios_mes = 2000; d.negocios.receita_anuncio_mes = 18000;
    const t = await montarTela(d, { dom });
    const roi = t.raiz.querySelector(".ini-roi");
    assert.match(texto(roi), /Cada R\$ 1 virou R\$ 9,00 em vendas que vieram dos anúncios/);
    assert.match(texto(roi.querySelector(".ini-roi-conta")), /R\$\s18\.000 de vendas de anúncio ÷ R\$\s2\.000 investidos/);
    assert.equal(botao(t.raiz, "roi-ads").getAttribute("href"), "#/anuncios");
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    assert.equal(t2.raiz.querySelector(".ini-roi"), null);
  } finally { dom.fim(); }
});

test("RC-227 + RC-296: «Nova tarefa» devolve o foco ao botão; «Novo paciente» abre o cadastro rápido do CRM", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const novos = [];
    t.ctx.carregar = async nome => (nome === "crm" ? { kit: async () => ({ mod: async m => (m === "tarefas"
      ? { formTarefa: async () => ({ id: 5 }) } : { formContato: async (k, pre) => { novos.push(pre); return { id: 9 }; } }) }) } : {});
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    botao(t.raiz, "rap-tarefa").click(); await tick(); await tick(); await tick();
    assert.equal(dom.doc.activeElement.dataset.k, "rap-tarefa", "RC-227");
    const bc = botao(t.raiz, "rap-contato");
    assert.equal(texto(bc), "Novo paciente");
    bc.click(); await tick(); await tick();
    assert.deepEqual(novos, [{}]);
    const av = t.toasts.find(x => x.texto === "Paciente cadastrado.");
    assert.ok(av, "o aviso com a palavra da vertical");
  } finally { dom.fim(); }
});

test("RC-228: «Marcar» na fila abre a agenda procurando a pessoa", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const pedidos = [];
    t.ctx.carregar = async () => ({ marcarConsulta: async (ctx, o) => { pedidos.push(o.busca); } });
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Atualizar").click(); await tick(); await tick();
    const bt = botao(t.raiz, "ag-marcar-901");
    assert.equal(bt.getAttribute("aria-label"), "Marcar consulta para Mariana Costa");
    assert.equal(botao(t.raiz, "ag-marcar-902"), null, "sem nome, sem o que procurar");
    bt.click(); await tick(); await tick();
    assert.deepEqual(pedidos, ["Mariana Costa"]);
  } finally { dom.fim(); }
});

test("RC-232 (DOM): a meta de vendas mostra o mês passado e «Usar +10%» preenche o campo", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const metas = t.raiz.querySelector(".ini-metas");
    // plano 2000d: DR-297 — a conta aparece inteira e o botão diz de onde vem o número
    assert.match(texto(metas), /Mês passado: R\$\s20\.300 \+ 10% = R\$\s22\.400\./);
    const bt = botao(t.raiz, "mt-sug");
    assert.match(texto(bt), /^Usar mês passado \+ 10% \(R\$\s22\.400\)$/);
    bt.click();
    assert.equal(botao(t.raiz, "mt-v").value, "22400");
  } finally { dom.fim(); }
});

test("RC-233 (DOM): com leads.semana_meta/semana_google, a barra de origem separa Meta e Google", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.leads.semana_meta = 9; d.leads.semana_google = 5;
    const t = await montarTela(d, { dom });
    const o = t.raiz.querySelector(".ini-leads .ini-origem");
    assert.match(texto(o), /Meta · 39%/); assert.match(texto(o), /Google · 22%/); assert.match(texto(o), /outras origens · 39%/);
    assert.match(o.getAttribute("aria-label"), /Meta 9, Google 5$/);
  } finally { dom.fim(); }
});

test("RC-234 + RC-235 (DOM): a linha que mede outra coisa tem legenda visível; o chip diz «vs. ontem»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const ag = t.raiz.querySelector('[data-kpi-env="aguardando"]');
    assert.equal(texto(ag.querySelector(".ini-kpi-sp-leg")), "linha: conversas novas por dia");
    const cons = t.raiz.querySelector('[data-kpi-env="consultas"]');
    assert.equal(cons.querySelector(".ini-kpi-sp-leg"), null, "a série mede o mesmo: sem legenda");
    assert.equal(texto(cons.querySelector(".ini-kpi-vs-dia")), "vs. ontem");
  } finally { dom.fim(); }
});

test("RC-254 (DOM): «Resumo do mês» abre a folha para imprimir e «Fechar» tira (e devolve o foco)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    botao(t.raiz, "resumo-mes").click();
    const folha = dom.doc.body.querySelector(".ini-resumo-folha");
    assert.ok(folha); assert.equal(folha.getAttribute("role"), "dialog");
    assert.match(texto(folha), /Resumo de outubro de 2026/); assert.match(texto(folha), /Receita do mês\s*R\$\s28\.400/);
    assert.ok(dom.doc.documentElement.classList.contains("ini-imprimindo"));
    folha.querySelector('[data-k="rs-fechar"]').click();
    assert.equal(dom.doc.body.querySelector(".ini-resumo-folha"), null);
    assert.equal(dom.doc.documentElement.classList.contains("ini-imprimindo"), false);
    assert.equal(dom.doc.activeElement.dataset.k, "resumo-mes");
  } finally { dom.fim(); }
});

test("RC-261: abrir o Início não baixa o crm-logica — o import só acontece quando o formulário das metas aparece", () => {
  const src = ler("inicio.js");
  const iImport = src.indexOf("import(`./crm-logica.js");
  assert.ok(iImport > src.indexOf("function blocoMetas("), "dentro do bloco das metas");
  assert.equal(src.split("import(`./crm-logica.js").length - 1, 1, "um lugar só");
  assert.ok(src.indexOf("import(`./crm-logica.js") > src.indexOf("if (editando) {"), "só com o formulário aberto");
});

test("RC-298: puxar a tela para baixo no topo atualiza (toque)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const n = () => t.chamadas.filter(c => c.nome === "nx_inicio").length, n0 = n();
    const puxar = t.raiz.querySelector(".ini-puxar"), sec = t.raiz.querySelector("section.ini");
    dom.ev(sec, "touchstart", { touches: [{ clientY: 10 }] });
    dom.ev(sec, "touchmove", { touches: [{ clientY: 40 }] });
    assert.equal(puxar.hidden, false); assert.match(texto(puxar), /Puxe para atualizar/);
    dom.ev(sec, "touchmove", { touches: [{ clientY: 100 }] });
    assert.match(texto(puxar), /Solte para atualizar/);
    dom.ev(sec, "touchend", {}); await tick(); await tick();
    assert.equal(n(), n0 + 1); assert.equal(puxar.hidden, true);
    dom.ev(sec, "touchstart", { touches: [{ clientY: 10 }] }); dom.ev(sec, "touchmove", { touches: [{ clientY: 30 }] }); dom.ev(sec, "touchend", {}); await tick();
    assert.equal(n(), n0 + 1, "puxão curto não atualiza");
  } finally { dom.fim(); }
});

test("RC-300: «Abrir a consulta de Rafael Mendes, às 14:30» (antes «Abrir Rafael Mendes das 14:30»)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ANTIGO(), { dom });
    assert.equal(botao(t.raiz, "px-802").getAttribute("aria-label"), "Abrir a consulta de Rafael Mendes, às 14:30");
    assert.equal(I.rotuloAbrirConsulta("Ana", "09:00", "visita", { agenda: true }), "Ver na agenda a visita de Ana, às 09:00");
  } finally { dom.fim(); }
});

test("RC-304: o mapa de calor troca o passo das horas ao redimensionar (1 h no largo, 3 h no estreito)", () => {
  const dom = comDom();
  const RO = globalThis.ResizeObserver; let cb = null;
  globalThis.ResizeObserver = class { constructor(f) { cb = f; } observe() {} disconnect() { cb = null; } };
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const ctl = G.calor(alvo, { matriz: Array.from({ length: 7 }, () => Array(24).fill(1)), dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: String, resumo: "M" });
    const grade = alvo.querySelector(".g-calor");
    assert.equal(grade.getAttribute("data-passo-horas"), "3", "começa no celular (matchMedia do teste)");
    alvo.clientWidth = 1200; cb();
    assert.equal(grade.getAttribute("data-passo-horas"), "1");
    assert.equal(texto(grade.querySelectorAll(".g-cal-h")[1]), "01");
    alvo.clientWidth = 360; cb();
    assert.equal(grade.getAttribute("data-passo-horas"), "3"); assert.equal(texto(grade.querySelectorAll(".g-cal-h")[1]), "");
    ctl.destruir(); assert.equal(cb, null, "destruir desliga o observador");
  } finally { if (RO) globalThis.ResizeObserver = RO; else delete globalThis.ResizeObserver; dom.fim(); }
});

/* ---------- estática (complemento) ---------- */
test("plano 1500c (CSS): só tokens nas peças novas, alvos de 44 px no toque, impressão do resumo e data curta no celular", () => {
  const css = ler("inicio.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const novo = css.slice(css.indexOf(".ini-data-curta"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(novo), "sem hex");
  assert.match(novo, /@media \(max-width: 400px\) \{\s*\.ini-data-longa \{ display: none; \}/);
  assert.match(novo, /@media print \{[\s\S]*html\.ini-imprimindo body > \*:not\(\.ini-resumo-folha\) \{ display: none !important; \}/);
  assert.match(novo, /\.ini-tf-adiar, \.ini-guia-item \.bt[\s\S]*?\{ min-height: 44px; \}/);
  assert.match(novo, /\.ini-bv-n0 \{/); assert.match(novo, /\.ini-roi-n \{[^}]*var\(--fs-num-xl\)/);
});

test("UC-011 (pendência da frente sis): #/inicio?passos=1 traz o checklist de volta mesmo dispensado, rola até ele e foca o título", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    dom.mem.set(`nx-onb:${ID_CLI}:${ID_CONTA}`, JSON.stringify({ pulados: [], dispensadoAte: AGORA + 5 * 86400000 }));
    const t0 = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    assert.equal(t0.raiz.querySelector(".ini-onb"), null, "dispensado: sem o cartão");
    I.desmontar();
    const t = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE(), rota: { query: { passos: "1" } } });
    assert.ok(t.raiz.querySelector(".ini-onb"), "o cartão voltou");
    assert.equal(JSON.parse(dom.mem.get(`nx-onb:${ID_CLI}:${ID_CONTA}`)).dispensadoAte, 0);
    await esperar(100);
    assert.equal(dom.doc.activeElement && dom.doc.activeElement.id, "ini-ob", "o foco no título do checklist");
  } finally { dom.fim(); }
});

/* ---------- melhorias novas IC-003.. ---------- */
const comNavegadorX = (extra, fn) => {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true, ...extra }, configurable: true, writable: true });
  const volta = () => { if (antes) Object.defineProperty(globalThis, "navigator", antes); else delete globalThis.navigator; };
  return Promise.resolve().then(fn).finally(volta);
};

test("IC-003 + IC-005: textoResumoMes — cabeçalho com empresa e data, uma linha por número; «Gerado em dd/mm às HH:MM» no fuso de SP", () => {
  const txt = I.textoResumoMes([{ rotulo: "Receita do mês", valor: "R$ 28.400" }, { rotulo: "Leads no mês", valor: "23" }], { empresa: "Clínica Demo", mes: "outubro de 2026", ate: "04/10" });
  // plano 2000d: DR-247 — sem marca, sem rodapé (revenda não leva «Órbita» fixo); com marca, o nome dela
  assert.equal(txt, "*Resumo de outubro de 2026* — Clínica Demo (até 04/10)\n• Receita do mês: R$ 28.400\n• Leads no mês: 23");
  assert.equal(I.textoResumoMes([], { mes: "maio", marca: "Órbita" }), "*Resumo de maio*\nNúmeros do Órbita.");
  assert.equal(I.textoGeradoEm(Date.parse("2026-10-25T14:05:00-03:00")), "Gerado em 25/10 às 14:05");
  assert.equal(I.textoGeradoEm(Date.parse("2026-10-25T02:30:00Z")), "Gerado em 24/10 às 23:30", "a hora de SP, não a UTC");
  assert.equal(I.textoGeradoEm(NaN), "");
});

test("IC-003 + IC-004 + IC-005 (DOM): o resumo do mês copia o texto, compartilha onde o sistema deixa e diz quando foi gerado", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const copiados = []; t.ctx.ui.copiar = async (x, o) => { copiados.push([x, o && o.aviso]); };
    botao(t.raiz, "resumo-mes").click();
    let folha = dom.doc.body.querySelector(".ini-resumo-folha");
    assert.match(texto(folha.querySelector('[data-k="rs-gerado"]')), /^Gerado em 04\/10 às 10:20$/);
    assert.equal(folha.querySelector('[data-k="rs-compartilhar"]'), null, "sem navigator.share: sem o botão");
    folha.querySelector('[data-k="rs-copiar"]').click(); await tick();
    assert.equal(copiados.length, 1);
    assert.match(copiados[0][0], /^\*Resumo de outubro de 2026\* — Clínica Demo \(até 04\/10\)\n• Receita do mês: R\$\s28\.400/);
    assert.match(copiados[0][1], /Resumo copiado/);
    folha.querySelector('[data-k="rs-fechar"]').click();
    const partilhas = [];
    await comNavegadorX({ share: async o => { partilhas.push(o); } }, async () => {
      botao(t.raiz, "resumo-mes").click();
      folha = dom.doc.body.querySelector(".ini-resumo-folha");
      folha.querySelector('[data-k="rs-compartilhar"]').click(); await tick();
    });
    assert.equal(partilhas.length, 1); assert.equal(partilhas[0].title, "Resumo de outubro de 2026"); assert.match(partilhas[0].text, /Receita do mês/);
    folha.querySelector('[data-k="rs-fechar"]').click();
  } finally { dom.fim(); }
});

test("IC-006 + IC-007 + IC-008: custo por lead; abaixo de R$ 1 a nota diz quanto falta para empatar; gasto sem venda aparece (antes sumia)", () => {
  // plano 2000d: DR-246 — o custo divide só pelos leads que vieram de anúncio
  const d = NOVO(); d.gasto_anuncios_mes = 2000; d.funil_mes.leads_anuncio = 23;
  assert.ok(Math.abs(I.custoPorLead(d) - 2000 / 23) < 1e-9);
  assert.equal(I.custoPorLead(NOVO()), null, "sem gasto: nada estimado");
  const brl = v => `R$ ${Math.round(v)}`;
  assert.equal(I.notaRetorno(I.retornoAnuncios(d), brl), null, "acima de R$ 1 a frase grande basta");
  d.negocios.receita_anuncio_mes = 1200;
  assert.equal(I.notaRetorno(I.retornoAnuncios(d), brl), "Os anúncios ainda não se pagaram este mês: faltam R$ 800 para empatar.");
  d.negocios.receita_anuncio_mes = 0;
  const r = I.retornoAnuncios(d);
  assert.deepEqual(r, { multiplo: 0, receita: 0, gasto: 2000, deAnuncio: true, semVenda: true });
  assert.match(I.notaRetorno(r, brl), /^R\$ 2000 investidos em anúncios este mês e nenhuma venda registrada ainda/);
});

test("IC-006 + IC-007 + IC-008 (DOM): o cartão do retorno mostra o custo por lead e, abaixo de R$ 1, a nota em vez de comemorar", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    // plano 2000d: DR-246 — só com os leads de anúncio, e o texto diz isso
    const d = NOVO(); d.gasto_anuncios_mes = 2000; d.funil_mes.leads_anuncio = 23;
    const t = await montarTela(d, { dom });
    assert.match(texto(botao(t.raiz, "roi-cpl")), /^Cada lead de anúncio custou R\$\s86,96 este mês\.$/);
    assert.equal(botao(t.raiz, "roi-nota"), null);
    I.desmontar();
    const d2 = NOVO(); d2.gasto_anuncios_mes = 2000; d2.negocios.receita_anuncio_mes = 0;
    const t2 = await montarTela(d2, { dom });
    const roi = t2.raiz.querySelector(".ini-roi");
    assert.ok(roi, "gastou sem vender: o cartão aparece");
    assert.ok(roi.classList.contains("ini-roi-baixo"));
    assert.match(texto(botao(t2.raiz, "roi-nota")), /nenhuma venda registrada ainda/);
  } finally { dom.fim(); }
});

test("IC-009: Esc sai do exemplo (fora de campos)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(ZERADO(), { dom, agenda: agendaDe([]) });
    t.raiz.querySelectorAll("button").find(b => b.textContent === "Ver um exemplo").click(); await tick();
    assert.ok(t.raiz.querySelector(".ini-exemplo-faixa"));
    const campo = dom.doc.body.appendChild(dom.doc.createElement("input"));
    dom.ev(dom.doc, "keydown", { key: "Escape", target: campo }); await tick();
    assert.ok(t.raiz.querySelector(".ini-exemplo-faixa"), "Esc num campo é do campo");
    dom.ev(dom.doc, "keydown", { key: "Escape", target: dom.doc.body }); await tick();
    assert.equal(t.raiz.querySelector(".ini-exemplo-faixa"), null);
    assert.ok(t.raiz.querySelector(".vazio-primeiro"), "volta aos primeiros passos");
  } finally { dom.fim(); }
});

test("IC-010 + IC-011 + IC-015: progresso dos primeiros passos (barra e frase); todos prontos diz o que falta; nunca «Três passos» sem passo", () => {
  assert.deepEqual(I.progressoGuia([{ feito: true }, { feito: false }, { feito: false }]), { feitos: 1, total: 3, pct: 33, todos: false, texto: "1 de 3 prontos" });
  const tudo = I.progressoGuia([{ feito: true }, { feito: true }]);
  assert.equal(tudo.todos, true); assert.equal(tudo.pct, 100); assert.match(tudo.texto, /^Tudo ligado\. Os números aparecem aqui assim que chegar a primeira conversa ou venda\.$/);
  assert.equal(I.progressoGuia([]).todos, false);
  assert.equal(I.textoQuantosPassos(1), "Um passo"); assert.equal(I.textoQuantosPassos(3), "Três passos"); assert.equal(I.textoQuantosPassos(0), "Alguns ajustes");
});

test("IC-010 + IC-011 (DOM): a barra de progresso dos primeiros passos com o valor para o leitor de tela; tudo ligado muda a frase", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const onb = { total: 3, feitos: 1, obrigatorios: 3, obrigatorios_feitos: 1, pct: 33, completo: false, itens: [{ id: "chave_codewords", feito: true }, { id: "aparelho_pareado", feito: true }, { id: "recebimento", feito: true }, { id: "anuncios_ligados", feito: false }, { id: "agenda_faixas", feito: false }] };
    const t = await montarTela(ZERADO(), { dom, agenda: agendaDe([]), onb });
    const barra = t.raiz.querySelector(".ini-guia-barra");
    // plano 2000d: DR-263/264 — este checklist não tem «contatos_importados» nem «funil_ajustado»: os passos novos ficam de fora (3, como antes)
    assert.equal(barra.getAttribute("role"), "progressbar"); assert.equal(barra.getAttribute("aria-valuenow"), "1"); assert.equal(barra.getAttribute("aria-valuemax"), "3");
    assert.equal(barra.style.getPropertyValue("--guia-pct"), "33%");
    assert.equal(texto(botao(t.raiz, "guia-prog")), "1 de 3 prontos");
    I.desmontar();
    const tudo = { ...onb, itens: onb.itens.map(i => ({ ...i, feito: true })) };
    const t2 = await montarTela(ZERADO(), { dom, agenda: agendaDe([]), onb: tudo });
    assert.match(texto(botao(t2.raiz, "guia-prog")), /^Tudo ligado/);
    assert.ok(t2.raiz.querySelector(".ini-guia-cartao").classList.contains("ini-guia-pronto"));
  } finally { dom.fim(); }
});

test("IC-012 + IC-013: equipe marca «você»; esfriando soma o dinheiro parado (valor_total do servidor ou «pelo menos» a soma dos que vieram)", () => {
  const d = { equipe: [{ conta_id: "a", nome: "Ana", ganhos: 1, valor: 10 }, { conta_id: 7, nome: "Bia", ganhos: 2, valor: 20 }] };
  assert.deepEqual(I.equipeMes(d, "7").map(x => [x.nome, x.eu]), [["Bia", true], ["Ana", false]]);
  assert.equal(I.equipeMes(d)[0].eu, undefined, "sem conta: ninguém marcado");
  const es = { esfriando: { total: 5, itens: [{ id: 1, valor: 1000, parado_dias: 9 }, { id: 2, valor: 500, parado_dias: 8 }] } };
  assert.deepEqual([I.listaEsfriando(es).valor, I.listaEsfriando(es).parcial], [1500, true]);
  es.esfriando.valor_total = 9000;
  assert.deepEqual([I.listaEsfriando(es).valor, I.listaEsfriando(es).parcial], [9000, false]);
  assert.equal(I.listaEsfriando({ esfriando: { total: 1, itens: [{ id: 1 }] } }).valor, null, "sem valor: nada");
});

test("IC-012 + IC-013 + IC-018 + IC-019 (DOM): «(você)» na equipe, R$ parado no esfriando, «+N» nos aniversariantes e nos sem presença", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.equipe = [{ conta_id: ID_CONTA, nome: "Helena", ganhos: 2, valor: 3000 }, { conta_id: "b", nome: "Bia", ganhos: 5, valor: 9000 }];
    d.esfriando = { total: 7, itens: [{ id: 41, contato_nome: "Rui", parado_dias: 12, valor: 1800 }] };
    d.aniversariantes = ["Ana", "Bia", "Caio", "Davi", "Eva", "Fábio"].map((nome, i) => ({ contato_id: i + 1, nome }));
    const passou = h => ({ negocio_id: 900 + h, nome: `P${h}`, inicio: SP(HOJE, `0${h}`), fim: SP(HOJE, `0${h}`, "30"), status: "aberto" });
    const ag = agendaDe([1, 2, 3, 4, 5, 6].map(passou));
    const t = await montarTela(d, { dom, agenda: ag });
    const eu = t.raiz.querySelector(".ini-equipe-eu");
    assert.ok(eu); assert.match(texto(eu.querySelector("th")), /Helena \(você\)/);
    assert.match(texto(botao(t.raiz, "ef-valor")), /pelo menos R\$\s1\.800 parados/);
    const mais = botao(t.raiz, "aniv-mais");
    // plano 2000d: DR-255 — «+2 aniversariantes» é botão que mostra os outros
    assert.equal(texto(mais), "+2 aniversariantes"); assert.equal(mais.getAttribute("aria-expanded"), "false");
    const pr = botao(t.raiz, "pr-mais");
    assert.equal(texto(pr), "+2 na agenda de hoje"); assert.equal(pr.getAttribute("href"), `#/agenda?dia=${HOJE}`);
  } finally { dom.fim(); }
});

test("IC-014: sem internet, «Amanhã» não chama o servidor e avisa na hora", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = ANTIGO();
    d.tarefas.proximas = [{ id: 81, titulo: "Ligar fornecedor", vence_em: SP(HOJE, "17"), atrasada: false }];
    const t = await montarTela(d, { dom });
    await comNavegadorX({ onLine: false }, async () => { botao(t.raiz, "tfd-81").click(); await tick(); });
    assert.equal(t.chamadas.filter(c => c.nome === "nx_tarefa_salvar").length, 0);
    assert.ok(t.toasts.some(x => /Sem internet: a tarefa não foi adiada/.test(x.texto)));
    assert.equal(botao(t.raiz, "tfd-81").disabled, false, "o botão continua para tentar de novo");
  } finally { dom.fim(); }
});

test("IC-016: arrastar para o lado ou puxar com uma janela aberta por cima não atualiza", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const n = () => t.chamadas.filter(c => c.nome === "nx_inicio").length, n0 = n();
    const sec = t.raiz.querySelector("section.ini"), puxar = t.raiz.querySelector(".ini-puxar");
    dom.ev(sec, "touchstart", { touches: [{ clientY: 10, clientX: 10 }] });
    dom.ev(sec, "touchmove", { touches: [{ clientY: 90, clientX: 200 }] });
    assert.equal(puxar.hidden, true);
    dom.ev(sec, "touchend", {}); await tick();
    assert.equal(n(), n0, "arrasto de lado");
    const dlg = dom.doc.body.appendChild(dom.doc.createElement("div")); dlg.setAttribute("aria-modal", "true");
    dom.ev(sec, "touchstart", { touches: [{ clientY: 10, clientX: 10 }] });
    dom.ev(sec, "touchmove", { touches: [{ clientY: 100, clientX: 12 }] });
    dom.ev(sec, "touchend", {}); await tick();
    assert.equal(n(), n0, "com diálogo aberto");
    dlg.remove();
    dom.ev(sec, "touchstart", { touches: [{ clientY: 10, clientX: 10 }] });
    dom.ev(sec, "touchmove", { touches: [{ clientY: 100, clientX: 14 }] });
    dom.ev(sec, "touchend", {}); await tick(); await tick();
    assert.equal(n(), n0 + 1, "o puxão normal continua valendo");
  } finally { dom.fim(); }
});

test("IC-017: o nome da etapa do funil que é link diz quantos abre («Abrir Ganhas: 9»)", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const links = t.raiz.querySelectorAll(".ini-funil a.g-flink");
    assert.ok(links.length >= 2);
    assert.match(links[0].getAttribute("aria-label"), /^Abrir .+: 23$/);
    assert.match(links[links.length - 1].getAttribute("aria-label"), /: 9$/);
  } finally { dom.fim(); }
});

test("IC-020 + IC-021: o exemplo fala a língua do negócio e mostra também esfriando, equipe, desde o começo e aniversários", () => {
  const of = I.dadosExemplo(HOJE, AGORA, { vertical: "oficina" });
  assert.deepEqual(of.agenda.consultas.map(c => c.servico).slice(0, 2), ["Revisão", "Troca de pastilhas"]);
  assert.equal(of.d.tarefas.proximas[0].titulo, "Ligar para aprovar o orçamento");
  assert.equal(I.dadosExemplo(HOJE, AGORA).agenda.consultas[0].servico, "Avaliação", "padrão: clínica, como antes");
  assert.equal(I.dadosExemplo(HOJE, AGORA, { vertical: "xyz" }).agenda.consultas[0].servico, "Reunião", "vertical desconhecida: genérico");
  const { d } = I.dadosExemplo(HOJE, AGORA);
  assert.ok(I.listaEsfriando(d)); assert.ok(I.equipeMes(d)); assert.ok(I.aniversariantesHoje(d));
  const ds = I.desdeInicio(d);
  assert.ok(ds); assert.equal(ds.atual.mes, "2026-10"); assert.equal(ds.primeiro.mes, "2026-05");
});

test("IC-022: o prazo de resposta vindo torto do servidor fica entre 5 min e 24 h", () => {
  assert.equal(I.prazoResposta({ prazo_min: 1 }), 5); assert.equal(I.limiteEspera({ prazo_min: 2 }), 5);
  assert.equal(I.prazoResposta({ prazo_min: 5000 }), 1440); assert.equal(I.prazoResposta({ prazo_min: 20 }), 20);
  assert.equal(I.prazoResposta({}), 15); assert.equal(I.limiteEspera(null), 30);
});

test("plano 1500c (CSS IC): barra dos passos com token de duração e sem animação em movimento reduzido", () => {
  const css = ler("inicio.css");
  const bloco = css.slice(css.indexOf("plano 1500c · IC-007/IC-008/IC-006"));
  assert.ok(bloco.length > 100);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/); assert.doesNotMatch(bloco, /\b\d+m?s\b/); assert.doesNotMatch(bloco, /cubic-bezier/);
  assert.match(bloco, /prefers-reduced-motion: reduce\) \{ \.ini-guia-barra-f \{ transition: none; \} \}/);
});
