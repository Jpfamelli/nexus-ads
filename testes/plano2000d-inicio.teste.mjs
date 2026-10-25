/* ============================================================
   ÓRBITA — plano 2000d (25/10/2026), frente inicio (tela Início, gráficos, vocabulário), lotes inicio-d1 e inicio-d2
   + pendências da frente sis (DU-110, DU-236, DU-239, DU-242, DU-449).
   node --test testes/plano2000d-inicio.teste.mjs
   O DOM de mentira e os dados são os do plano1500c-inicio (copiados abaixo; o montarTela aceita também marca, rotas e ctxExtra).
   Cada teste cita o item (DR-NNN / DU-NNN) e falharia no código de antes. Sem rede, sem navegador, sem dependências.
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
async function montarTela(d, { dom, agenda = AGENDA, papel = "admin", conta = ID_CONTA, semCanais = false, inicioLento = null, esperarMontar = true, onb = null, semPulso = false, versao = "T", rota = { query: {} }, marca = null, rotas = null, ctxExtra = {} } = {}) {
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
  if (marca) ctx.marca = marca;
  if (rotas) ctx.rotas = rotas;
  Object.assign(ctx, ctxExtra);
  const extras = { ctx, chamadas, navegou, toasts, resp, canais, raiz: ctx.alvo, pulso: async () => { aoPulso(); await tick(); await tick(); } };
  if (!esperarMontar) { extras.pronto = I.montar(ctx).then(tick); await tick(); return extras; }
  await I.montar(ctx); await tick();
  assert.equal(ctx.alvo.querySelector(".vazio-erro"), null, "a tela não caiu no cartão de erro: " + texto(ctx.alvo.querySelector(".vazio-erro")));
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

/* ============================================================ constantes do plano 1500c */
const AGORA = Date.parse(SP(HOJE, "10", "20"));
const botao = (raiz, k) => raiz.querySelector(`[data-k="${k}"]`);
const ID_CLI_DONO = `${ID_CLI}|${ID_CONTA}`;

/* ============================================================ plano 2000d */
const RT = await import(pathToFileURL(join(APP, "rotas.js")).href);
const brl = v => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const secoes = raiz => raiz.querySelectorAll("section[data-bloco]").map(s => s.dataset.bloco);
const ZERADO = () => ({ hoje: HOJE, conversas: { aguardando: 0, abertas: 0, pendentes: 0 }, tarefas: { hoje: 0, atrasadas: 0, proximas: [] }, negocios: { abertos: 0, ganhos_mes: 0, receita_mes: 0 }, leads: { semana: 0 }, canais: [] });
/** um ctx.api que entrega o cache primeiro (aoCache) e segura a rede até `soltar()`. */
function apiComCache(d, { agenda = AGENDA, em = SP(HOJE, "09", "05") } = {}) {
  let soltar; const rede = new Promise(r => { soltar = r; });
  return { soltar: () => soltar(), api: { async rpcC(nome, params, opts) {
    if (nome === "nx_inicio") { if (opts && typeof opts.aoCache === "function") opts.aoCache(d, em); await rede; return d; }
    if (nome === "nx_agenda_dia") return agenda;
    if (nome === "nx_onboarding_estado") return { total: 11, feitos: 11, obrigatorios: 9, obrigatorios_feitos: 9, pct: 100, completo: true, itens: [] };
    return null;
  }, mensagemErro: e => String(e && e.message || e) } };
}

/* ---------------- (a) retorno dos anúncios: custo por lead, resumo, cartão ---------------- */
test("DR-246 + DR-304: custoPorLead divide só pelos leads de anúncio (funil_mes.leads_anuncio); sem o campo, nada estimado", () => {
  const d = NOVO(); d.gasto_anuncios_mes = 2000;
  assert.equal(I.custoPorLead(d), null, "servidor antigo (sem leads_anuncio): antes dava 2000 ÷ 23 leads de TODAS as origens");
  d.funil_mes.leads_anuncio = 8;
  assert.equal(I.custoPorLead(d), 250, "R$ 2.000 ÷ 8 leads de anúncio (não ÷ 23)");
  d.funil_mes.leads_anuncio = 0; assert.equal(I.custoPorLead(d), null);
  const { d: ex } = I.dadosExemplo(HOJE, AGORA);
  assert.equal(I.custoPorLead(ex), 40, "o exemplo: R$ 2.400 ÷ 60 leads de anúncio");
});

test("DR-247 + DR-305: textoResumoMes — o rodapé leva a marca da sessão; sem marca, sem rodapé (nunca «Órbita» fixo)", () => {
  const l = [{ rotulo: "Receita do mês", valor: "R$ 28.400" }];
  assert.equal(I.textoResumoMes(l, { mes: "outubro", marca: "Nexus" }), "*Resumo de outubro*\n• Receita do mês: R$ 28.400\nNúmeros do Nexus.");
  assert.equal(I.textoResumoMes(l, { mes: "outubro" }), "*Resumo de outubro*\n• Receita do mês: R$ 28.400");
  assert.doesNotMatch(I.textoResumoMes(l, { mes: "outubro", marca: "Agência *Sol*" }), /\*Sol\*/, "o negrito do WhatsApp não quebra o texto");
  assert.equal(I.nomeMarca({ produto: "Órbita" }), "Órbita"); assert.equal(I.nomeMarca({ nome: "Agência Sol" }), "Agência Sol"); assert.equal(I.nomeMarca(null), "");
});

test("DR-247 (DOM): o resumo do mês da revenda sai com a marca dela; sem marca, nenhuma palavra «Órbita»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, marca: { produto: "Agência Sol" } });
    const copiados = []; t.ctx.ui.copiar = async txt => { copiados.push(txt); };
    botao(t.raiz, "resumo-mes").click(); await tick();
    assert.match(texto(dom.doc.body.querySelector('[data-k="rs-periodo"]')), /números do Agência Sol/);
    dom.doc.body.querySelector('[data-k="rs-copiar"]').click(); await tick();
    assert.match(copiados[0], /\nNúmeros do Agência Sol\.$/);
    assert.doesNotMatch(copiados[0], /Órbita/);
    dom.doc.body.querySelector('[data-k="rs-fechar"]').click();
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    const c2 = []; t2.ctx.ui.copiar = async txt => { c2.push(txt); };
    botao(t2.raiz, "resumo-mes").click(); await tick();
    dom.doc.body.querySelector('[data-k="rs-copiar"]').click(); await tick();
    assert.doesNotMatch(c2[0], /Órbita|Números do/);
  } finally { dom.fim(); }
});

test("DR-248: sem a receita de anúncio separada, o cartão e o resumo dizem que é a receita TOTAL por real investido", () => {
  assert.equal(I.rotuloRetorno(null), null);
  const total = I.rotuloRetorno({ deAnuncio: false });
  assert.equal(total.olho, "Receita total ÷ gasto em anúncios · mês"); assert.equal(total.invertido, true);
  assert.equal(I.rotuloRetorno({ deAnuncio: true }).frase, "em vendas que vieram dos anúncios");
  const d = NOVO(); d.gasto_anuncios_mes = 2000;
  assert.equal(I.linhasResumoMes(d, { brl }).find(x => x.id === "roi").rotulo, "Receita total para cada R$ 1 em anúncios");
  d.negocios.receita_anuncio_mes = 18000;
  assert.equal(I.linhasResumoMes(d, { brl }).find(x => x.id === "roi").rotulo, "Cada R$ 1 em anúncios virou");
});

test("DR-249 + DR-269 + DR-270 + DR-328: janela, período, retorno por plataforma e as últimas vendas de anúncio", () => {
  assert.match(I.janelaRetorno({ hoje: "2026-10-03", negocios: {} }).nota, /^Só 3 dias de dados neste mês/);
  assert.equal(I.janelaRetorno({ hoje: "2026-10-12", negocios: {} }).nota, null);
  assert.deepEqual(I.janelaRetorno({ hoje: "2026-10-12", gasto_anuncios_30d: 1000, negocios: { receita_anuncio_30d: 5000 } }).ult30, { multiplo: 5, receita: 5000, gasto: 1000 });
  assert.equal(I.periodoRetorno("2026-10-25"), "outubro, do dia 1 até hoje (25/10)");
  assert.equal(I.periodoRetorno("2026-10-01"), "outubro, só hoje (01/10)");
  assert.equal(I.retornoPorPlataforma({}), null);
  const p = I.retornoPorPlataforma({ anuncios: { meta: { gasto: 1000, receita: 9000, leads: 30 }, google: { gasto: 500, receita: 1500 } } });
  assert.deepEqual(p.map(x => [x.id, x.multiplo, !!x.melhor]), [["meta", 9, true], ["google", 3, false]]);
  assert.equal(I.retornoPorPlataforma({ anuncios: { meta: { gasto: 0 } } }), null, "quem não gastou não entra");
  const v = I.ultimasVendasAnuncio({ ultimas_vendas_anuncio: [{ contato_nome: "Ana", servico: "Implante", valor: 4800, plataforma: "facebook" }, { contato_nome: "" }] });
  assert.deepEqual(v, [{ nome: "Ana", servico: "Implante", valor: 4800, plataforma: "Meta" }]);
  assert.equal(I.ultimasVendasAnuncio({}), null);
});

test("DR-246 + DR-249 + DR-269 + DR-270 + DR-328 (DOM): o cartão do retorno com período, aviso de começo de mês, plataformas e vendas com nome", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.gasto_anuncios_mes = 2000; d.negocios.receita_anuncio_mes = 18000; d.funil_mes.leads_anuncio = 16;
    d.anuncios = { meta: { gasto: 1400, receita: 14000 }, google: { gasto: 600, receita: 4000 } };
    d.ultimas_vendas_anuncio = [{ contato_nome: "Lia Prado", servico: "Implante", valor: 4800, plataforma: "meta" }];
    const t = await montarTela(d, { dom });
    assert.match(texto(botao(t.raiz, "roi-cpl")), /^Cada lead de anúncio custou R\$\s125,00 este mês\.$/);
    assert.equal(texto(botao(t.raiz, "roi-periodo")), "outubro, do dia 1 até hoje (04/10)");
    assert.match(texto(botao(t.raiz, "roi-cedo")), /Só 4 dias de dados/);
    assert.match(texto(botao(t.raiz, "roi-plats")), /Meta.*rendeu mais.*Google/);
    assert.match(texto(botao(t.raiz, "roi-vendas")), /Lia Prado · Implante · R\$\s4\.800 · Meta/);
    I.desmontar();
    const d2 = NOVO(); d2.gasto_anuncios_mes = 2000;
    const t2 = await montarTela(d2, { dom });
    assert.equal(botao(t2.raiz, "roi-cpl"), null, "sem leads de anúncio: sem custo por lead");
    assert.equal(texto(botao(t2.raiz, "roi-olho")), "Receita total ÷ gasto em anúncios · mês");
    assert.equal(botao(t2.raiz, "roi-vendas"), null, "sem receita de anúncio separada, não lista «vendas de anúncio»");
  } finally { dom.fim(); }
});

test("DR-253 + DR-254: linhasResumoMes — sem «7 dias» num resumo mensal; ticket médio, leads de anúncio, prazo do mês e custo por lead", () => {
  const d = NOVO(); d.gasto_anuncios_mes = 2000; d.funil_mes.leads_anuncio = 10; d.conversas.respondidas_no_prazo_mes_pct = 81;
  const l = I.linhasResumoMes(d, { brl });
  const ids = l.map(x => x.id);
  assert.ok(!ids.includes("leads7"), "nada de «leads dos últimos 7 dias»");
  assert.equal(l.find(x => x.id === "ticket").valor, "R$ 3.156");
  assert.equal(l.find(x => x.id === "leads_anuncio").valor, "10");
  assert.equal(l.find(x => x.id === "prazo").valor, "81%"); assert.match(l.find(x => x.id === "prazo").rotulo, /\(mês\)/);
  assert.equal(l.find(x => x.id === "cpl").valor, "R$ 200");
  const semMes = NOVO();
  assert.equal(I.linhasResumoMes(semMes, { brl }).find(x => x.id === "prazo"), undefined, "o prazo de 7 dias não entra no resumo do mês");
});

test("DR-406: no começo do mês, o resumo do mês que fechou — linhas e o botão nos 3 primeiros dias", async () => {
  assert.equal(I.linhasResumoMesAnterior({ negocios: {} }), null);
  const l = I.linhasResumoMesAnterior({ negocios: { receita_mes_anterior: 30000 }, funil_mes_anterior: { leads: 100, ganhos: 10 } }, { brl });
  assert.deepEqual(l.map(x => [x.id, x.valor]), [["receita", "R$ 30.000"], ["ganhos", "10"], ["ticket", "R$ 3.000"], ["leads", "100"], ["conv", "10%"]]);
  const dom = comDom({ agora: Date.parse(SP("2026-10-02", "10")) });
  try {
    const d = NOVO(); d.hoje = "2026-10-02"; d.negocios.dia_do_mes = 2;
    const t = await montarTela(d, { dom });
    const bt = botao(t.raiz, "resumo-anterior");
    assert.ok(bt, "dia 2: o botão do mês que fechou"); assert.match(texto(bt), /Resumo de setembro/);
    bt.click(); await tick();
    assert.match(texto(dom.doc.body.querySelector('[data-k="rs-periodo"]')), /mês fechado/);
    dom.doc.body.querySelector('[data-k="rs-fechar"]').click();
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    assert.equal(botao(t2.raiz, "resumo-anterior"), null, "do dia 4 em diante, só o do mês");
  } finally { dom.fim(); }
});

/* ---------------- (b) metas ---------------- */
test("DR-250: o esperado de hoje conta só o pedaço do dia que passou (às 08:00 do dia 10, 9,33/31 da meta)", () => {
  const cedo = I.progressoMeta({ meta: 31000, realizado: 9500, dia: 10, diasNoMes: 31, fracaoDia: 1 / 3 });
  assert.equal(Math.round(cedo.esperado), 9333); assert.equal(cedo.estado, "frente", "antes: esperado 10.000 → «perto do ritmo» logo cedo");
  assert.equal(Math.round(I.progressoMeta({ meta: 31000, realizado: 0, dia: 10, diasNoMes: 31 }).esperado), 10000, "sem a fração, o dia inteiro (como antes)");
  assert.ok(Math.abs(I.fracaoDoDiaSP(Date.parse("2026-10-10T08:00:00-03:00")) - 1 / 3) < 1e-9);
  assert.equal(I.fracaoDoDiaSP(Date.parse("2026-10-10T11:00:00Z")), 8 / 24, "o relógio de SP, não o UTC");
});

test("DR-251: lerValorBr — «1.500» é 1500 (antes 1,5), «1.234,56», «1,234.56», «R$ 10.000», «2,5»; validarMetas usa ele por padrão", () => {
  assert.equal(I.lerValorBr("1.500"), 1500); assert.equal(I.lerValorBr("1.234,56"), 1234.56); assert.equal(I.lerValorBr("1,234.56"), 1234.56);
  assert.equal(I.lerValorBr("R$ 10.000"), 10000); assert.equal(I.lerValorBr("2,5"), 2.5); assert.equal(I.lerValorBr("1.500.000"), 1500000);
  assert.ok(Number.isNaN(I.lerValorBr("abc"))); assert.ok(Number.isNaN(I.lerValorBr("")));
  assert.equal(I.validarMetas({ vendas: "1.500" }).vendas, 1500);
});

test("DR-297 + DR-298: a sugestão diz a conta; meta de leads inteira e o realizado dos leads do mês", () => {
  assert.equal(I.textoSugestaoMeta({ mesPassado: 27500, mais10: 30300 }, brl), "Mês passado: R$ 27.500 + 10% = R$ 30.300.");
  assert.equal(I.textoSugestaoMeta(null), "");
  assert.equal(I.validarMetas({ leads: "120" }).leads, 120);
  assert.equal(I.validarMetas({ leads: "1.000" }).leads, 1000);
  assert.equal(I.validarMetas({ leads: "2,5" }).erros.meta_leads, "Use um número inteiro maior que zero.");
  assert.equal(I.validarMetas({ leads: "0" }).erros.meta_leads, "Use um número maior que zero.");
  assert.equal(I.realizadoLeadsMes(NOVO()), 23); assert.equal(I.realizadoLeadsMes(ANTIGO()), null);
});

test("DR-299 + DR-301 + DR-322 + DR-399: meta curta para o celular, projeção do fim do mês e a reta final", () => {
  const p = I.progressoMeta({ meta: 30000, realizado: 10000, dia: 20, diasNoMes: 30 });
  assert.equal(I.textoMetaCurto(p, brl), "Faltam R$ 20.000 · abaixo do ritmo");
  assert.equal(I.textoMetaCurto(I.progressoMeta({ meta: 10, realizado: 12, dia: 5, diasNoMes: 30 }), brl), "Meta batida · 120%");
  const proj = I.projecaoMes({ realizado: 12000, dia: 10, diasNoMes: 30 });
  assert.deepEqual(proj, { valor: 36000, base: 10, fraca: false });
  assert.equal(I.textoProjecao(proj, 30000, brl), "Se continuar assim, fecha o mês em R$ 36.000: bate a meta.");
  assert.equal(I.textoProjecao(proj, 50000, brl), "Se continuar assim, fecha o mês em R$ 36.000: faltariam R$ 14.000 para a meta.");
  assert.match(I.textoProjecao(I.projecaoMes({ realizado: 500, dia: 2, diasNoMes: 31 })), /cedo para projetar/);
  assert.equal(I.projecaoMes({ realizado: 0, dia: 10, diasNoMes: 30 }), null);
  assert.equal(I.retaFinal({ meta: 30000, realizado: 25000, dia: 27, diasNoMes: 30 }, brl), null, "faltam 4 dias: ainda não");
  assert.equal(I.retaFinal({ meta: 30000, realizado: 25000, dia: 30, diasNoMes: 30 }, brl).texto, "Reta final: faltam R$ 5.000 para a meta e hoje é o último dia do mês.");
  assert.match(I.retaFinal({ meta: 30000, realizado: 25000, dia: 28, diasNoMes: 30 }, brl).texto, /restam 3 dias/);
  assert.equal(I.retaFinal({ meta: 30000, realizado: 31000, dia: 30, diasNoMes: 30 }), null, "batida: sem faixa");
});

test("DR-298 + DR-299 + DR-322 + DR-399 (DOM): metas com a de leads, as frases longa/curta, a projeção e a reta final", async () => {
  const dom = comDom({ agora: Date.parse(SP("2026-10-30", "15")) });
  try {
    dom.mem.set(`nx-ini-metas:${ID_CLI}`, JSON.stringify({ vendas: 40000, leads: 50 }));
    const d = NOVO(); d.hoje = "2026-10-30"; d.negocios.dia_do_mes = 30;
    const t = await montarTela(d, { dom });
    const metas = t.raiz.querySelector(".ini-metas");
    assert.match(texto(botao(t.raiz, "mt-reta")), /^Reta final: faltam R\$\s11\.600 para a meta e restam 2 dias do mês\.$/);
    assert.match(texto(metas), /Leads no mês/);
    assert.ok(metas.querySelector(".ini-meta-curto"), "a frase curta do celular");
    assert.equal(metas.querySelector(".ini-meta-curto").getAttribute("aria-hidden"), "true", "o leitor ouve só a longa");
    assert.match(texto(metas.querySelector(".ini-meta-extra")), /^Se continuar assim, fecha o mês em/);
    botao(t.raiz, "mt-editar").click(); await tick();
    assert.equal(String(botao(t.raiz, "mt-l").value), "50", "o campo da meta de leads, com a meta guardada");
  } finally { dom.fim(); }
});

/* ---------------- (c) KPIs, vocabulário das verticais ---------------- */
test("DR-252: «Novos pacientes · 7 dias» na clínica; «Leads · 7 dias» só no genérico", () => {
  assert.equal(I.rotuloLeads7({ vertical: "odonto", contatos: "Pacientes" }), "Novos pacientes · 7 dias");
  assert.equal(I.rotuloLeads7({ vertical: "oficina", contatos: "Clientes" }), "Novos clientes · 7 dias");
  assert.equal(I.rotuloLeads7({ vertical: "generico" }), "Leads · 7 dias"); assert.equal(I.rotuloLeads7(), "Leads · 7 dias");
  const k = I.kpisAlternativos(NOVO(), { voc: { vertical: "odonto", contatos: "pacientes", negocios: "oportunidades" } }).find(x => x.id === "leads");
  assert.equal(k.rotulo, "Novos pacientes · 7 dias");
  assert.equal(k.formato, "int", "o resto do KPI continua lá (o comentário não engoliu o código)");
});

test("DR-348: «Vendas por indicação» entre os KPIs trocáveis só quando o servidor manda ganhos_indicacao_mes", () => {
  assert.equal(I.kpisAlternativos(NOVO()).find(x => x.id === "indicacao"), undefined);
  const d = NOVO(); d.negocios.ganhos_indicacao_mes = 3; d.negocios.receita_indicacao_mes = 6400;
  const k = I.kpisAlternativos(d).find(x => x.id === "indicacao");
  assert.equal(k.valor, 3); assert.equal(k.sub, "no mês · R$ 6.400");
});

test("DR-279 + DR-281: descrição curta para o Tab e o chip em palavras para o leitor de tela", () => {
  assert.equal(I.descricaoCurta("Conversas sem resposta agora. Conta as de todos os números; a linha mostra 14 dias."), "Conversas sem resposta agora.");
  assert.ok(I.descricaoCurta("x".repeat(200)).length <= 90);
  assert.equal(I.textoChipAcessivel({ v: 12, txt: "12%", seta: "▲" }), "mais 12% que ontem");
  assert.equal(I.textoChipAcessivel({ v: -800, txt: "−R$ 800", seta: "▼" }, "vs. semana passada"), "menos R$ 800 que semana passada");
  assert.equal(I.textoChipAcessivel({ v: 0, txt: "0%", seta: "→" }), "igual a ontem");
  assert.equal(I.textoChipAcessivel({ v: null, txt: "sem base" }), "sem base para comparar com ontem");
});

test("DR-274 + DR-279 + DR-281 (DOM): R$ 480 mil ganha a forma curta; o Tab lê a frase curta; a seta do chip não é lida", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.negocios.valor_aberto = 480000;
    const t = await montarTela(d, { dom });
    assert.ok(t.raiz.querySelector(".ini-kpi-v-curto"), "R$ 480.000 também troca pela forma curta (antes só de R$ 1 milhão)");
    for (const k of t.raiz.querySelectorAll(".ini-kpi")) {
      const desc = k.querySelector("[id^=ini-kpi-aj]");
      if (desc) assert.ok(texto(desc).length <= 200, `descrição curta: ${texto(desc)}`);
    }
    const chip = t.raiz.querySelector(".ini-vendas .rel-var");
    assert.equal(chip.firstChild.getAttribute("aria-hidden"), "true");
    assert.match(texto(chip.querySelector(".sr-only")), /^mais \d+% que o mesmo período do mês passado$/);
  } finally { dom.fim(); }
});

test("DR-146 + DR-147 + DR-318: vocab — sigla não vira «cRM», plural pelas formas da vertical, adjetivo que concorda", () => {
  const g = V.vocab("generico"), o = V.vocab("odonto"), loja = V.vocab("loja");
  assert.equal(g.min("CRM"), "CRM"); assert.equal(o.min("contatos"), "pacientes");
  assert.equal(o.plural(1, "contato"), "1 paciente"); assert.equal(o.plural(3, "contatos"), "3 pacientes"); assert.equal(o.plural(0, "contato"), "0 pacientes");
  assert.equal(o.plural(1500, "contato"), "1.500 pacientes");
  assert.match(loja.negocio, /^Venda$/i);
  assert.equal(loja.adj("ganho", "negocio"), "ganha", "«Venda ganha», não «Venda ganho»");
  assert.equal(loja.adj("ganho", "negocios", 2), "ganhas");
  assert.equal(V.vocab("oficina").adj("aberto", "negocio"), V.vocab("oficina").art("negocio") === "a" ? "aberta" : "aberto");
});

test("DR-320: as frases principais nas 4 verticais — nenhuma «no Pacientes», «1 pacientes», «a serviço» ou maiúscula no meio", () => {
  for (const vert of ["odonto", "oficina", "loja", "generico"]) {
    const v = V.vocab(vert);
    const frases = [v.nenhum("negocios"), v.novo("negocio"), v.plural(1, "contato"), v.plural(2, "contato"), v.plural(1, "negocio"), v.plural(3, "negocios"),
      `${v.plural(2, "negocios")} ${v.adj("ganho", "negocios", 2)}`, `${v.plural(1, "negocio")} ${v.adj("aberto", "negocio")}`, `${v.art("negocio")} ${v.min("negocio")}`];
    for (const f of frases) {
      assert.doesNotMatch(f, /\b1 \S+s\b/, `${vert}: «${f}»`);
      assert.doesNotMatch(f, /\b(?:no|do|ao) [A-ZÀ-Ý]/, `${vert}: «${f}»`);
      assert.doesNotMatch(f, /^\d+ [A-ZÀ-Ý][a-zà-ý]/, `${vert}: minúscula depois do número — «${f}»`);
    }
    const art = v.art("negocio"), pal = v.min("negocio");
    assert.ok(!(art === "a" && /o$/.test(v.adj("ganho", "negocio"))), `${vert}: «${pal} ${v.adj("ganho", "negocio")}»`);
  }
});

test("DU-110: o papel «marketing» tem rótulo em português (vocab.ROTULO_PAPEL), igual ao de rotas", () => {
  assert.equal(V.ROTULO_PAPEL.marketing, "Marketing");
  assert.equal(V.ROTULO_PAPEL.marketing, RT.ROTULOS_PAPEL.marketing);
});

/* ---------------- (d) leitura, rede, fuso ---------------- */
test("DR-273 + DR-276 + DR-330: de quando são os números do cache; selo de falha e de sem internet", () => {
  assert.equal(I.statusAtualizacaoInicio({ hora: "09:05", cache: true }), "Mostrando os números de 09:05 · atualizando…");
  assert.equal(I.statusAtualizacaoInicio({ cache: true }), "Atualizando…");
  assert.equal(I.seloLeitura({ hora: "10:20", offline: true }), "Sem internet · dados das 10:20");
  assert.equal(I.seloLeitura({ hora: "10:20", falhou: true }), "Sem atualizar desde 10:20");
  assert.equal(I.seloLeitura({ hora: "10:20" }), "");
});

test("DR-273 (DOM): o cache pinta na hora e o cabeçalho diz de quando são os números até a rede responder", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const c = apiComCache(NOVO());
    const t = await montarTela(NOVO(), { dom, esperarMontar: false, ctxExtra: { api: c.api } });
    await tick();
    assert.equal(texto(t.raiz.querySelector(".ini-quando")), "Mostrando os números de 09:05 · atualizando…");
    c.soltar(); await t.pronto; await tick();
    assert.match(texto(t.raiz.querySelector(".ini-quando")), /^Atualizado às 10:20/);
  } finally { dom.fim(); }
});

test("DR-276 (DOM): a leitura que falha deixa o selo à vista «Sem atualizar desde 10:20»; volta a sumir quando a leitura dá certo", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const selo = botao(t.raiz, "selo-leitura");
    assert.equal(selo.hidden, true);
    t.resp.erroInicio = new Error("http_503");
    dom.andar(31000); await t.pulso(); await tick();
    assert.equal(selo.hidden, false); assert.equal(texto(selo), "Sem atualizar desde 10:20");
    t.resp.erroInicio = null; t.resp.d = { ...NOVO(), versao: "nova" };
    dom.andar(31000); await t.pulso(); await tick();
    assert.equal(selo.hidden, true);
  } finally { dom.fim(); }
});

test("DR-337: o fuso pelas regras do Intl — −180 em SP; «Amanhã» em outro fuso com horário de verão não usa −03:00 fixo", () => {
  assert.equal(I.deslocamentoFuso(Date.parse("2026-10-04T12:00:00Z")), -180);
  assert.equal(I.deslocamentoFuso(Date.parse("2026-07-10T12:00:00Z"), "America/New_York"), -240);
  const r = I.adiarParaAmanha("2026-07-10T13:00:00Z", new Date("2026-07-10T15:00:00Z"), { fuso: "America/New_York" });
  assert.equal(r, "2026-07-11T13:00:00.000Z", "09:00 de Nova York amanhã (com −03:00 fixo daria 10:00 local)");
  assert.equal(I.adiarParaAmanha(null, new Date(AGORA)), "2026-10-05T12:00:00.000Z", "sem prazo: 09:00 de SP amanhã");
});

test("DR-295: consultasPorDia lê a lista uma vez só (antes filtrava a lista inteira a cada um dos 7 dias)", () => {
  let leituras = 0;
  const consultas = Array.from({ length: 20 }, (_, i) => { const ini = SP(I.somarDiasIso ? HOJE : HOJE, String(8 + (i % 8)).padStart(2, "0")); return { get inicio() { leituras++; return ini; }, fim: null, status: "aberto" }; });
  const r = I.consultasPorDia({ consultas }, HOJE, 7);
  assert.equal(r.total, 20); assert.equal(r.dias[0].n, 20);
  assert.ok(leituras <= 20 * 3, `leituras: ${leituras} (antes 7 × 20 = 140 ou mais)`);
});

/* ---------------- (e) equipe ---------------- */
const EQUIPE = () => [{ conta_id: "a", nome: "Ana", ganhos: 2, valor: 3000, tpr_media_min: 9, meta: 6000, leads: 20, tarefas_hoje: 0 },
  { conta_id: "b", nome: "Bia", ganhos: 5, valor: 9000, tpr_media_min: 4, meta: 8000, leads: 25, tarefas_hoje: 3 },
  { conta_id: ID_CONTA, nome: "Helena", ganhos: 1, valor: 1200, tpr_media_min: 12, leads: 10, tarefas_hoje: 2 }];

test("DR-218 + DR-220 + DR-261 + DR-353 + DR-355: equipeMes — posição, meta e %, conversão, tarefas de hoje e a distância de quem está à frente", () => {
  const eq = I.equipeMes({ equipe: EQUIPE() }, ID_CONTA);
  assert.deepEqual(eq.map(x => [x.nome, x.posicao, x.meta, x.metaPct, x.conversao, x.tarefasHoje, x.distancia]),
    [["Bia", 1, 8000, 113, 20, 3, null], ["Ana", 2, 6000, 50, 10, 0, 6000], ["Helena", 3, null, null, 10, 2, 1800]]);
  assert.equal(I.textoDistancia(eq[1], brl), "a R$ 6.000 do 1º lugar");
  assert.equal(I.textoDistancia(eq[2], brl), "a R$ 1.800 do 2º lugar");
  assert.equal(I.textoDistancia(eq[0], brl), "");
  assert.deepEqual(I.semTarefaHoje(eq), ["Ana"]);
  assert.equal(I.semTarefaHoje(I.equipeMes({ equipe: [{ nome: "X", ganhos: 1, valor: 1 }] })), null, "sem tarefas_hoje do servidor: nada");
});

test("DR-260 + DR-356: quem não administra vê só a própria linha e a posição; admin vê todos", () => {
  const eq = I.equipeMes({ equipe: EQUIPE() }, ID_CONTA);
  assert.equal(I.equipeVisivel(eq, { admin: true }).linhas.length, 3);
  const v = I.equipeVisivel(eq, { admin: false });
  assert.deepEqual(v.linhas.map(x => x.nome), ["Helena"]); assert.equal(v.resumo, "Você está em 3º de 3 no mês.");
  assert.equal(I.equipeVisivel(I.equipeMes({ equipe: EQUIPE() }, "outra"), { admin: false }), null, "quem não está na lista não vê nada");
});

test("DR-262: o nome leva ao quadro filtrado pelo responsável — o mesmo «?f=» que o CRM lê", () => {
  const href = I.linkQuadroDono("b");
  assert.match(href, /^#\/crm\?f=[A-Za-z0-9_-]+$/);
  assert.deepEqual(CL.filtroDoLink(href.split("f=")[1]).dono, "b");
  assert.equal(I.linkQuadroDono(null), null); assert.equal(I.linkQuadroDono("a b"), null);
});

test("DR-218 + DR-220 + DR-262 + DR-353 + DR-355 (DOM): equipe do admin com meta, conversão, link do quadro e quem está sem tarefa", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.equipe = EQUIPE();
    const t = await montarTela(d, { dom });
    const eq = t.raiz.querySelector(".ini-equipe");
    assert.match(texto(eq.querySelector("thead")), /Conversão/);
    assert.equal(botao(t.raiz, "eq-meta-b").getAttribute("aria-valuenow"), "100");
    assert.match(botao(t.raiz, "eq-meta-a").getAttribute("aria-label"), /Meta de Ana: 50% de R\$\s6\.000/);
    assert.match(botao(t.raiz, "eq-b").getAttribute("href"), /^#\/crm\?f=/);
    assert.match(texto(botao(t.raiz, "eq-dist-a")), /a R\$\s6\.000 do 1º lugar/);
    assert.equal(texto(botao(t.raiz, "eq-semtarefa")), "Sem tarefa para hoje: Ana.");
  } finally { dom.fim(); }
});

test("DR-260 + DR-356 (DOM): a atendente vê «Você no mês» com a própria linha e a posição — sem os valores dos colegas", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.equipe = EQUIPE();
    const t = await montarTela(d, { dom, papel: "atendente" });
    const eq = t.raiz.querySelector(".ini-equipe");
    assert.ok(eq, "antes a equipe era só do admin");
    assert.match(texto(eq.querySelector("h2")), /^Você no mês$/);
    assert.equal(eq.querySelectorAll("tbody tr").length, 1);
    assert.doesNotMatch(texto(eq), /Bia|Ana/);
    assert.equal(texto(botao(t.raiz, "eq-posicao")), "Você está em 3º de 3 no mês.");
    assert.equal(botao(t.raiz, "eq-semtarefa"), null);
  } finally { dom.fim(); }
});

test("DR-352: placarEquipe — de hoje quando o servidor manda, senão do mês; e «?tv=1» mostra só o placar", async () => {
  assert.equal(I.placarEquipe({}), null);
  const mes = I.placarEquipe({ equipe: EQUIPE() });
  assert.equal(mes.titulo, "Placar do mês"); assert.equal(mes.linhas[0].nome, "Bia");
  const hoje = I.placarEquipe({ equipe: [{ nome: "Ana", ganhos: 9, valor: 9, ganhos_hoje: 2, valor_hoje: 3000 }, { nome: "Bia", ganhos: 1, valor: 99, ganhos_hoje: 0, valor_hoje: 0 }] });
  assert.equal(hoje.titulo, "Placar de hoje"); assert.deepEqual(hoje.linhas.map(x => [x.nome, x.n]), [["Ana", 2], ["Bia", 0]]);
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.equipe = EQUIPE();
    const t = await montarTela(d, { dom, rota: { query: { tv: "1" } } });
    assert.ok(botao(t.raiz, "placar")); assert.ok(t.raiz.querySelector(".ini").classList.contains("ini-tv"));
    assert.equal(t.raiz.querySelectorAll(".ini-kpi").length, 0, "na TV só o placar");
    assert.match(texto(botao(t.raiz, "placar")), /1º\s*Bia/);
  } finally { dom.fim(); }
});

/* ---------------- (f) esfriando ---------------- */
test("DR-407: listaEsfriando traz contato e responsável; «Meus» filtra pelo dono_id", () => {
  const d = { esfriando: { total: 3, itens: [{ id: 1, contato_nome: "Rui", parado_dias: 9, valor: 100, contato_id: 7, dono_id: "a" }, { id: 2, contato_nome: "Lia", parado_dias: 8, dono_id: ID_CONTA }, { id: 3, contato_nome: "Sem", parado_dias: 7 }] } };
  const es = I.listaEsfriando(d);
  assert.deepEqual(es.itens.map(x => [x.id, x.contatoId, x.donoId]), [[1, 7, "a"], [2, null, ID_CONTA], [3, null, null]]);
  assert.equal(I.temDonoEsfriando(es), true);
  const meus = I.filtrarEsfriando(es, ID_CONTA, true);
  assert.deepEqual(meus.itens.map(x => x.id), [2]); assert.equal(meus.total, 1);
  assert.equal(I.filtrarEsfriando(es, ID_CONTA, false), es);
  assert.equal(I.temDonoEsfriando(I.listaEsfriando({ esfriando: { total: 1, itens: [{ id: 1 }] } })), false);
});

test("DR-286 + DR-329 + DR-407 (DOM): esfriando com «Mensagem», «Tarefa», o nome e os dias no botão, e «Meus / Todos»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.esfriando = { total: 2, itens: [{ id: 41, contato_nome: "Rui", estagio_nome: "Orçamento", parado_dias: 12, valor: 1800, contato_id: 77, dono_id: "outra" },
      { id: 42, contato_nome: "Lia", estagio_nome: "Conversa", parado_dias: 8, contato_id: 78, dono_id: ID_CONTA }] };
    const t = await montarTela(d, { dom, ctxExtra: { carregar: async () => ({}) } });
    assert.equal(botao(t.raiz, "ef-msg-41").getAttribute("href"), "#/conversas?contato=77");
    assert.ok(botao(t.raiz, "ef-tf-41"), "«Tarefa» cria o próximo passo daqui");
    assert.equal(botao(t.raiz, "ef-41").getAttribute("aria-label"), "Abrir Rui, parado há 12 dias, para retomar");
    const seg = t.raiz.querySelector(".ini-esfr-seg");
    assert.ok(seg, "Meus / Todos");
    const meus = seg.querySelectorAll("button, [role=tab], [role=radio]").find(b => texto(b) === "Meus");
    meus.click(); await tick();
    assert.equal(botao(t.raiz, "ef-41"), null); assert.ok(botao(t.raiz, "ef-42"));
  } finally { dom.fim(); }
});

/* ---------------- (g) desde que começou ---------------- */
test("DR-290 + DR-288: desdeInicio contra o último mês FECHADO; sem ele, leads e receita dizem que o mês está em andamento; o texto para mandar", () => {
  const base = { primeiro: { mes: "2026-04", leads: 30, tpr_media_min: 95, receita: 12000 }, atual: { mes: "2026-10", leads: 20, tpr_media_min: 8, receita: 9000 } };
  const parcial = I.desdeInicio({ desde_inicio: base });
  assert.equal(parcial.parcial, true);
  assert.deepEqual(parcial.linhas.map(x => [x.id, x.rotulo, x.melhor, x.parcial]),
    [["leads", "Leads no mês (mês ainda em andamento)", false, true], ["tpr", "1ª resposta (média)", true, false], ["receita", "Receita no mês (mês ainda em andamento)", false, true]]);
  const fechado = I.desdeInicio({ desde_inicio: { ...base, ultimo_fechado: { mes: "2026-09", leads: 80, tpr_media_min: 9, receita: 30000 } } });
  assert.equal(fechado.parcial, false); assert.equal(fechado.atual.mes, "2026-09");
  assert.deepEqual(fechado.linhas.map(x => [x.id, x.agora, x.melhor]), [["leads", 80, true], ["tpr", 9, true], ["receita", 30000, true]]);
  assert.equal(I.textoDesde(fechado, { empresa: "Clínica Demo", fmt: (id, v) => String(v) }),
    "*Desde que começamos — Clínica Demo*\nabril de 2026 × setembro de 2026\n• Leads no mês: 30 → 80 (melhorou)\n• 1ª resposta (média): 95 → 9 (melhorou)\n• Receita no mês: 12000 → 30000 (melhorou)");
  assert.match(I.textoDesde(parcial), /× este mês \(até hoje\)/);
});

test("DR-288 + DR-290 (DOM): «Desde que você começou» com «em andamento» no mês parcial e «Copiar» com o texto", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.desde_inicio = { primeiro: { mes: "2026-04", leads: 30, tpr_media_min: 95, receita: 12000 }, atual: { mes: "2026-10", leads: 20, tpr_media_min: 8, receita: 9000 } };
    const t = await montarTela(d, { dom });
    const ds = t.raiz.querySelector(".ini-desde");
    assert.match(texto(ds), /abril de 2026 × agora/);
    assert.equal(ds.querySelectorAll(".ini-desde-item.andamento").length, 2, "o mês parcial não «piorou»");
    const copiados = []; t.ctx.ui.copiar = async txt => { copiados.push(txt); };
    botao(t.raiz, "ds-copiar").click(); await tick();
    assert.match(copiados[0], /^\*Desde que começamos — Clínica Demo\*/);
  } finally { dom.fim(); }
});

/* ---------------- (h) Agora: aniversários, confirmação, presença, conversas ---------------- */
test("DR-255 + DR-256 + DR-292: textos prontos e o link da conversa com o texto", () => {
  assert.equal(I.textoMaisAniv(1), "+1 aniversariante"); assert.equal(I.textoMaisAniv(3), "+3 aniversariantes"); assert.equal(I.textoMaisAniv(0), "");
  assert.equal(I.textoParabens("lia prado", "Clínica Demo"), "Feliz aniversário, Lia! 🎉 Desejamos um novo ano cheio de saúde e alegria. Um abraço da equipe Clínica Demo.");
  assert.match(I.textoPedirConfirmacao("Mariana Costa", "amanhã às 10:00", "visita"), /^Olá, Mariana! Passando para confirmar a sua visita amanhã às 10:00\./);
  assert.equal(I.hrefComTexto({ conversaId: 77 }, "oi"), "#/conversas/77?texto=oi");
  assert.equal(I.hrefComTexto({ contatoId: 5 }, "a b"), "#/conversas?contato=5&texto=a%20b");
  assert.equal(I.hrefComTexto({}, "x"), null);
  assert.equal(I.hrefComTexto({ conversaId: 1 }, "x".repeat(2000)).length, "#/conversas/1?texto=".length + 1000, "texto cortado em 1000");
});

test("DR-255 + DR-256 (DOM): «+2 aniversariantes» mostra os outros aqui mesmo, cada um com «Dar parabéns» e o texto pronto", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO();
    d.aniversariantes = ["Ana", "Bia", "Caio", "Davi", "Eva", "Fábio"].map((nome, i) => ({ contato_id: i + 1, nome, conversa_id: i === 5 ? 99 : null }));
    const t = await montarTela(d, { dom });
    const mais = botao(t.raiz, "aniv-mais");
    const resto = t.raiz.querySelector(".ini-aniv-resto");
    assert.equal(resto.hidden, true);
    mais.click();
    assert.equal(resto.hidden, false); assert.equal(mais.getAttribute("aria-expanded"), "true");
    assert.match(botao(t.raiz, "aniv-6").getAttribute("href"), /^#\/conversas\/99\?texto=Feliz%20anivers/);
    assert.match(botao(t.raiz, "aniv-5").getAttribute("href"), /^#\/conversas\?contato=5&texto=/);
  } finally { dom.fim(); }
});

test("DR-293 (DOM): «Todos compareceram» marca a presença das que passaram e «Desfazer» limpa", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const ag = agendaDe([{ negocio_id: 900, nome: "Paula", inicio: SP(HOJE, "08"), fim: SP(HOJE, "08", "40"), status: "aberto" },
      { negocio_id: 901, nome: "Rui", inicio: SP(HOJE, "09"), fim: SP(HOJE, "09", "30"), status: "aberto" }, ...AGENDA.consultas]);
    const t = await montarTela(ANTIGO(), { dom, agenda: ag });
    const bt = botao(t.raiz, "pr-todos");
    assert.ok(bt); assert.equal(bt.getAttribute("aria-label"), "Marcar que as 2 compareceram");
    bt.click(); await tick(); await tick();
    const pres = () => t.chamadas.filter(c => c.nome === "nx_agenda_presenca").map(c => [c.params.p_negocio, c.params.p_estado]);
    assert.deepEqual(pres(), [[900, "compareceu"], [901, "compareceu"]]);
    const toast = t.toasts.find(x => /Presença marcada em 2/.test(x.texto));
    assert.ok(toast && typeof toast.desfazer === "function");
    toast.desfazer(); await tick(); await tick();
    assert.deepEqual(pres().slice(2), [[900, "limpar"], [901, "limpar"]]);
  } finally { dom.fim(); }
});

test("DR-258 + DR-335: sem acesso à agenda diz com quem falar; «ninguém esperando» vem com as conversas em andamento", async () => {
  assert.match(I.TEXTO_SEM_AGENDA, /Peça ao administrador/);
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.conversas.aguardando = 0; d.conversas.sem_dono = 0; d.conversas.abertas = 14; d.conversas.aguardando_lista = [];
    const t = await montarTela(d, { dom });
    assert.equal(texto(botao(t.raiz, "ag-andamento")), "14 conversas em andamento");
  } finally { dom.fim(); }
});

/* ---------------- (i) leads, vendas ---------------- */
test("DR-133 + DR-302: o tempo até o 1º contato e os leads de hoje × ontem até esta hora", () => {
  assert.equal(I.tempoPrimeiroContato({ leads: { primeiro_contato_media_min: 6 } }), "6 min");
  assert.equal(I.tempoPrimeiroContato({ leads: {} }), null);
  assert.deepEqual(I.leadsContraOntem({ hoje: 4, ontem_ate_agora: 3 }), { hoje: 4, ontem: 3, texto: "ontem até esta hora: 3", dif: 1 });
  assert.equal(I.leadsContraOntem({ hoje: 4 }), null);
});

test("DR-133 + DR-300 + DR-301 + DR-302 + DR-402 (DOM): leads e vendas com o que o servidor manda", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.leads.ontem_ate_agora = 2; d.leads.primeiro_contato_media_min = 6; d.negocios.dias_ate_ganho = 9;
    const t = await montarTela(d, { dom });
    assert.equal(texto(botao(t.raiz, "ld-ontem")), "ontem até esta hora: 2");
    assert.match(texto(botao(t.raiz, "ld-contato")), /1º contato com o lead de anúncio em 6 min, em média/);
    assert.equal(texto(botao(t.raiz, "vd-dias")), "Do lead à venda: 9 dias em média.");
    assert.match(texto(botao(t.raiz, "vd-proj")), /^Se continuar assim, fecha o mês em R\$\s/);
    assert.ok(t.raiz.querySelector(".ini-vendas .ini-b-fant"), "a barra do mês passado inteiro");
    assert.match(t.raiz.querySelector(".ini-vendas .ini-barras").getAttribute("aria-label"), /mês passado inteiro: R\$\s20\.300/);
  } finally { dom.fim(); }
});

test("DR-405: nos dias 1 e 2, o mês passado fechado ao lado do mês zerado", async () => {
  assert.equal(I.notaInicioMes({ dia_do_mes: 1, receita_mes_anterior: 27500 }, "2026-10-01", brl), "Setembro fechou com R$ 27.500. O mês novo começou agora: os números sobem ao longo dos dias.");
  assert.equal(I.notaInicioMes({ dia_do_mes: 3, receita_mes_anterior: 27500 }, "2026-10-03", brl), null);
  assert.match(I.notaInicioMes({ dia_do_mes: 1, receita_mes_anterior: 1 }, "2026-01-01", brl), /^Dezembro fechou/);
  const dom = comDom({ agora: Date.parse(SP("2026-10-01", "10")) });
  try {
    const d = NOVO(); d.hoje = "2026-10-01"; d.negocios.dia_do_mes = 1; d.negocios.receita_mes = 0;
    const t = await montarTela(d, { dom });
    assert.match(texto(botao(t.raiz, "vd-inicio-mes")), /^Setembro fechou com R\$\s20\.300\./);
  } finally { dom.fim(); }
});

test("DR-285: a manchete encurtada nunca corta o que pede ação (a 1ª frase quando urgente)", () => {
  const tx = v => ({ t: "txt", v }), lk = v => ({ t: "link", partes: [{ t: "txt", v }] });
  const m = { urgente: true, frases: [[lk("2 esperando"), tx(" e "), lk("1 sem dono"), tx(" e "), lk("3 atrasadas"), tx(".")], [lk("R$ 10 em aberto"), tx(".")]], texto: "" };
  const r = I.encurtarManchete(m, { max: 2 });
  assert.equal(r.texto, "2 esperando e 1 sem dono e 3 atrasadas.", "antes: «2 esperando e 1 sem dono.» (a 3ª pendência sumia)");
  const calmo = I.encurtarManchete({ ...m, urgente: false }, { max: 2 });
  assert.equal(calmo.texto, "2 esperando e 1 sem dono.");
});

/* ---------------- (j) primeiros passos, exemplo, ordem, visita ---------------- */
test("DR-263 + DR-264 + DU-236: guiaPrimeiroUso com «Trazer seus clientes», «Ajustar o funil» (modelo da vertical) e o tempo de cada passo", () => {
  const g = I.guiaPrimeiroUso({ admin: true, infoPassos: RT.PASSOS_INFO, vertical: "oficina" });
  assert.deepEqual(g.map(p => [p.id, p.tempo]), [["whatsapp", "~3 min"], ["contatos", "~3 min"], ["anuncios", ""], ["agenda", "~4 min"], ["funil", "~3 min"]]);
  assert.match(g.find(p => p.id === "funil").ajuda, /diagnóstico → orçamento → serviço/);
  assert.equal(g.find(p => p.id === "contatos").feito, false);
  assert.equal(I.guiaPrimeiroUso({ admin: true, feito: ids => ids.includes("contatos_importados") }).find(p => p.id === "contatos").feito, true);
  assert.deepEqual(I.guiaPrimeiroUso({ admin: true, conhece: id => id !== "funil_ajustado" }).map(p => p.id), ["whatsapp", "contatos", "anuncios", "agenda"],
    "o checklist que não conhece o item não ganha um passo que nunca ficaria pronto");
  assert.equal(I.textoQuantosPassos(5), "Cinco passos");
});

test("DU-242: o objetivo das boas-vindas ordena os passos e os blocos (rotas.passosPorObjetivo / ordemDoInicio)", () => {
  const g = I.guiaPrimeiroUso({ admin: true, objetivo: "organizar", ordenar: RT.passosPorObjetivo });
  assert.deepEqual(g.map(p => p.id), ["contatos", "funil", "agenda", "whatsapp", "anuncios"]);
  const blocos = I.ordemPadraoBlocos({ admin: true, objetivo: "anunciar", ordemDoInicio: RT.ordemDoInicio });
  assert.equal(blocos[0], "leads", "anunciar: o bloco de leads (anúncios) primeiro");
  assert.deepEqual([...blocos].sort(), [...I.BLOCOS_INICIO].sort());
});

test("DR-271: a ordem padrão — o dono vê o mês primeiro (vendas, metas, funil); com alguém esperando, «Agora» na frente; a recepção começa pela operação", () => {
  assert.deepEqual(I.ordemPadraoBlocos({ admin: true }).slice(0, 4), ["vendas", "metas", "funil", "agora"]);
  assert.equal(I.ordemPadraoBlocos({ admin: true, urgente: true })[0], "agora");
  assert.deepEqual(I.ordemPadraoBlocos({ admin: false }), [...I.BLOCOS_INICIO]);
  assert.deepEqual([...I.ordemPadraoBlocos({ admin: true })].sort(), [...I.BLOCOS_INICIO].sort(), "os mesmos blocos, só a ordem muda");
});

test("DR-271 + DU-242 (DOM): o admin sem ninguém esperando abre em «Vendas»; com o objetivo «anunciar», os leads vêm antes; o evento nx:objetivo reordena", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const d = NOVO(); d.conversas.aguardando = 0; d.conversas.aguardando_lista = [];
    const t = await montarTela(d, { dom });
    assert.equal(secoes(t.raiz)[0], "vendas");
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom });
    assert.equal(secoes(t2.raiz)[0], "agora", "duas pessoas esperando: o «Agora» continua na frente");
    I.desmontar();
    const d3 = NOVO(); d3.conversas.aguardando = 0; d3.conversas.aguardando_lista = [];
    const t3 = await montarTela(d3, { dom, rotas: RT });
    assert.equal(secoes(t3.raiz)[0], "vendas");
    const posLeads = secoes(t3.raiz).indexOf("leads"), posVendas = secoes(t3.raiz).indexOf("vendas");
    dom.mem.set(RT.chaveObjetivo(ID_CLI), "anunciar");
    dom.ev(dom.doc, "nx:objetivo", { detail: { objetivo: "anunciar", cliente: ID_CLI } }); await tick();
    const depois = secoes(t3.raiz);
    assert.ok(depois.indexOf("leads") < posLeads, `mudou o objetivo: os leads sobem na hora (${posLeads} → ${depois.indexOf("leads")})`);
    assert.ok(depois.indexOf("vendas") >= posVendas);
  } finally { dom.fim(); }
});

test("DU-236 + DU-449 (DOM): o guia mostra o tempo do passo e «Ver como (1 min)» quando a marca tem vídeo", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const marca = { produto: "Nexus", videos_passos: { whatsapp: "https://exemplo.com/v/whatsapp" } };
    const t = await montarTela(ZERADO(), { dom, agenda: agendaDe([]), rotas: RT, marca });
    const item = t.raiz.querySelector('.ini-guia-item[data-passo="whatsapp"]');
    assert.match(texto(item), /~3 min/);
    const v = botao(t.raiz, "video-whatsapp");
    assert.equal(v.getAttribute("href"), "https://exemplo.com/v/whatsapp"); assert.equal(texto(v), "Ver como (1 min)");
    assert.equal(v.getAttribute("rel"), "noopener noreferrer");
    assert.equal(botao(t.raiz, "video-agenda"), null, "sem vídeo, sem link");
  } finally { dom.fim(); }
});

test("DR-333: a chave do checklist precisa da conta — sem ela nada fica guardado (antes «-» juntava várias pessoas)", () => {
  assert.equal(I.chaveOnboarding("cli-1", "conta-1"), "nx-onb:cli-1:conta-1");
  assert.equal(I.chaveOnboarding("cli-1", ""), null); assert.equal(I.chaveOnboarding("cli-1", null), null); assert.equal(I.chaveOnboarding("cli-1", "-"), null);
});

test("DR-333 + DR-334 + DU-239 (DOM): dispensar — sem conta não grava; com o servidor novo chama nx_onboarding_dispensar; o aviso diz onde reabrir", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, onb: { ...ONB_PENDENTE(), dispensado_ate: null }, rotas: RT });
    assert.equal(texto(botao(t.raiz, "onb-tempo-agenda_faixas")), "· ~4 min", "DU-236: o tempo no item do checklist");
    botao(t.raiz, "onb-dispensar").click(); await tick();
    const ch = t.chamadas.find(c => c.nome === "nx_onboarding_dispensar");
    assert.ok(ch && typeof ch.params.p_ate === "string", "a dispensa vale em todo aparelho");
    const toast = t.toasts.find(x => /Escondemos este cartão/.test(x.texto));
    assert.match(toast.texto, /Você pode reabrir em Ajuda › Primeiros passos\.$/);
    I.desmontar(); dom.mem.clear();
    const t2 = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    botao(t2.raiz, "onb-dispensar").click(); await tick();
    assert.equal(t2.chamadas.filter(c => c.nome === "nx_onboarding_dispensar").length, 0, "servidor antigo (sem a chave): só neste aparelho");
    I.desmontar();
    dom.mem.clear();
    const t3 = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE(), conta: "" });
    botao(t3.raiz, "onb-dispensar").click(); await tick();
    assert.deepEqual([...dom.mem.keys()].filter(k => k.startsWith("nx-onb")), [], "sem conta, nada guardado");
  } finally { dom.fim(); }
});

test("DR-334 (DOM): «dispensado_ate» do servidor no futuro esconde o checklist também neste aparelho", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, onb: { ...ONB_PENDENTE(), dispensado_ate: new Date(AGORA + 3 * 86400000).toISOString() } });
    assert.equal(botao(t.raiz, "onb-dispensar"), null);
  } finally { dom.fim(); }
});

test("DR-265 + DR-266 + DR-267 + DR-268 (DOM): «?exemplo=1» liga a demonstração com dados reais guardados; selo em cada bloco e no cartão de retorno; números da vertical", async () => {
  const od = I.dadosExemplo(HOJE, AGORA, { vertical: "odonto" }).d, lj = I.dadosExemplo(HOJE, AGORA, { vertical: "loja" }).d;
  assert.notEqual(od.negocios.receita_mes, lj.negocios.receita_mes, "cada vertical com os seus números");
  assert.ok(lj.negocios.ganhos_mes > od.negocios.ganhos_mes, "loja: mais vendas de ticket menor");
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, rota: { query: { exemplo: "1" } } });
    assert.match(texto(t.raiz.querySelector(".ini-exemplo-txt")), /^Modo demonstração/);
    assert.ok(botao(t.raiz, "ex-selo-roi"), "o cartão «cada R$ 1 virou» aparece no exemplo, com o selo");
    for (const id of secoes(t.raiz)) assert.ok(botao(t.raiz, `ex-selo-${id}`), `selo no bloco ${id}`);
    assert.ok(botao(t.raiz, "roi-cpl"), "o custo por lead do exemplo");
    I.desmontar();
    const t2 = await montarTela(NOVO(), { dom, papel: "atendente", rota: { query: { exemplo: "1" } } });
    assert.equal(t2.raiz.querySelector(".ini-exemplo-txt"), null, "só o admin liga a demonstração");
  } finally { dom.fim(); }
});

test("DR-398: «desde a sua última visita» — a foto deste aparelho contra a leitura de agora", async () => {
  const antes = { mes: "2026-10", em: AGORA - 3 * 3600000, leads: 20, ganhos: 8, receita: 26000 };
  const n = I.novidadesDesde(antes, NOVO(), { fmt: brl, agora: AGORA });
  assert.deepEqual(n.itens, ["3 leads novos", "1 venda", "R$ 2.400"]);
  assert.equal(I.novidadesDesde({ ...antes, em: AGORA - 10 * 60000 }, NOVO(), { agora: AGORA }), null, "visita de 10 min atrás: nada");
  assert.equal(I.novidadesDesde({ ...antes, mes: "2026-09" }, NOVO(), { agora: AGORA }), null, "outro mês: nada");
  const dom = comDom({ agora: AGORA });
  try {
    dom.mem.set(`nx-ini-visita:${ID_CLI}:${ID_CONTA}`, JSON.stringify(antes));
    const t = await montarTela(NOVO(), { dom });
    assert.match(texto(botao(t.raiz, "novidades")), /^Desde a sua última visita \(.+\): 3 leads novos, 1 venda, R\$\s2\.400\.$/);
    assert.equal(JSON.parse(dom.mem.get(`nx-ini-visita:${ID_CLI}:${ID_CONTA}`)).leads, 23, "a foto nova fica no lugar");
  } finally { dom.fim(); }
});

test("DR-283 + DR-284 (DOM): «Organizar o Início» liga as setas; «Restaurar ordem» tem «Desfazer»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const org = botao(t.raiz, "organizar");
    assert.equal(org.getAttribute("aria-pressed"), "false");
    org.click();
    assert.ok(t.raiz.querySelector(".ini").classList.contains("ini-organizando")); assert.equal(org.getAttribute("aria-pressed"), "true");
    const chave = `nx-ini-blocos:${ID_CLI}:${ID_CONTA}`;
    const seg = secoes(t.raiz)[1];
    botao(t.raiz, `bl-ant-${seg}`).click(); await tick();
    const guardado = dom.mem.get(chave);
    assert.ok(guardado);
    botao(t.raiz, "bl-restaurar").click(); await tick();
    assert.equal(dom.mem.get(chave), undefined);
    const toast = t.toasts.find(x => /de volta ao padrão/.test(x.texto));
    assert.ok(toast && typeof toast.desfazer === "function");
    toast.desfazer(); await tick();
    assert.equal(dom.mem.get(chave), guardado, "a arrumação de antes volta");
  } finally { dom.fim(); }
});

test("DR-357 + DR-332: «?bloco=metas» vai até o bloco; «?» abre a folha de atalhos", async () => {
  assert.equal(I.blocoDaRota({ bloco: "metas" }), "metas"); assert.equal(I.blocoDaRota({ bloco: "x" }), null); assert.equal(I.blocoDaRota(null), null);
  assert.deepEqual(I.ATALHOS_INICIO.map(a => a.tecla), ["R", "?", "Esc"]);
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom, rota: { query: { bloco: "metas" } } });
    await esperar(120);
    const h2 = t.raiz.querySelector('section[data-bloco="metas"] h2');
    assert.equal(h2.getAttribute("tabindex"), "-1");
    assert.equal(dom.doc.activeElement, h2);
    let aberto = null; t.ctx.ui.flutuante = (ancora, conteudo) => { aberto = conteudo; return { fechar() {} }; };
    dom.ev(dom.doc, "keydown", { key: "?", target: dom.doc.body }); await tick();
    assert.ok(aberto); assert.match(texto(aberto), /Atalhos do Início.*Atualizar os números/);
  } finally { dom.fim(); }
});

/* ---------------- (k) textos de comparação ---------------- */
test("DR-296: textoDiferenca no empate diz o número («igual: R$ 5.000 nos dois períodos»)", () => {
  assert.equal(I.textoDiferenca(5000, 5000, brl), "igual: R$ 5.000 nos dois períodos");
  assert.equal(I.textoDiferenca(5000.4, 5000, brl), "igual: R$ 5.000 nos dois períodos", "diferença abaixo de R$ 1 é empate");
  assert.equal(I.textoDiferenca(6000, 5000, brl), "+R$ 1.000 a mais que no mesmo período");
});

/* ---------------- (l) gráficos ---------------- */
test("DR-308: textoEixoCurto — «R$ 120 mil», «1,2 mi», abaixo de 10 mil o formato cheio", () => {
  assert.equal(G.textoEixoCurto(120000, v => `R$ ${v}`), "R$ 120 mil");
  assert.equal(G.textoEixoCurto(1250000), "1,3 mi");
  assert.equal(G.textoEixoCurto(-45000, v => `R$ ${v}`), "R$ −45 mil");
  assert.equal(G.textoEixoCurto(9500, v => `R$ ${v}`), "R$ 9500");
  assert.equal(G.textoEixoCurto(2.5e9), "2,5 bi");
});

test("DR-280: resumoTendencia — a linha do KPI em palavras («subindo nos últimos 14 dias»)", () => {
  assert.equal(G.resumoTendencia([1, 2, 3]), "Tendência: subindo nos últimos 3 dias.");
  assert.equal(G.resumoTendencia([5, null, 2], { linha: "conversas novas por dia" }), "Tendência de conversas novas por dia: caindo nos últimos 2 dias.");
  assert.equal(G.resumoTendencia([4, 4]), "Tendência: estável nos últimos 2 dias.");
  assert.equal(G.resumoTendencia([4]), "");
});

test("DR-280 (DOM): cada KPI com linha tem a tendência em texto para o leitor de tela", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const t = await montarTela(NOVO(), { dom });
    const tend = t.raiz.querySelectorAll("[id^=kpi-tend-], [id^=ini-kpi-tend]");
    const textos = (tend.length ? tend : t.raiz.querySelectorAll(".ini-kpi .sr-only")).map(texto).filter(x => /^Tendência/.test(x));
    assert.ok(textos.length >= 1, "pelo menos um KPI com a tendência em palavras");
    assert.match(textos[0], /nos últimos 14 dias\.$/);
  } finally { dom.fim(); }
});

test("DR-310: um ResizeObserver só para todos os gráficos; quem sai da página é solto; o último solto desliga", () => {
  const criados = [];
  const antes = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; this.alvos = new Set(); this.desligado = false; criados.push(this); }
    observe(el) { this.alvos.add(el); } unobserve(el) { this.alvos.delete(el); } disconnect() { this.desligado = true; this.alvos.clear(); } };
  try {
    const a = { isConnected: true }, b = { isConnected: true };
    let na = 0, nb = 0;
    const solta = G.observarTamanho(a, () => na++);
    G.observarTamanho(b, () => nb++);
    assert.equal(criados.length, 1, "um observador para os dois (antes um por gráfico)");
    criados[0].fn([{ target: a }, { target: b }]);
    assert.deepEqual([na, nb], [1, 1]);
    b.isConnected = false;
    criados[0].fn([{ target: b }]);
    assert.equal(nb, 1); assert.ok(!criados[0].alvos.has(b), "fora da página: solto sozinho");
    solta();
    assert.equal(criados[0].desligado, true, "nenhum alvo: o observador desliga");
  } finally { if (antes === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = antes; }
});

test("DR-275 (DOM): tocar numa barra fixa a dica (pointerdown), e o pointerleave do toque não a esconde", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    G.barras(alvo, { itens: [{ rotulo: "Meta", valores: [10] }, { rotulo: "Google", valores: [4] }], series: [{ nome: "Leads", classe: "g-c0" }], fmt: v => String(v), resumo: "Leads por origem" });
    const linhas = alvo.querySelectorAll(".g-hitem");
    const caixa = alvo.querySelector(".g-hcaixa");
    caixa.dispatchEvent(new dom.Evento("pointerdown", { target: linhas[1].querySelector(".g-hbarra"), pointerType: "touch" }));
    assert.ok(linhas[1].classList.contains("g-ativa"), "o toque mostra o valor (antes só o mouse, no pointermove)");
    caixa.dispatchEvent(new dom.Evento("pointerleave", { pointerType: "touch" }));
    assert.ok(linhas[1].classList.contains("g-ativa"), "o dedo saiu: a dica fica");
  } finally { dom.fim(); }
});

test("DR-306 + DR-307 (DOM): rosca e mapa de calor com «Ver como tabela» quando pedem (tabela: true); sem a opção, como antes", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const r1 = dom.doc.body.appendChild(dom.doc.createElement("div"));
    G.rosca(r1, { fatias: [{ rotulo: "Preço", valor: 3 }, { rotulo: "Prazo", valor: 1 }], fmt: v => String(v), resumo: "Motivos de perda", tabela: true });
    const bt = r1.querySelector(".g-ver-tabela");
    assert.ok(bt, "a rosca ganhou a tabela");
    const linhas = r1.querySelectorAll(".g-tabela tbody tr").map(tr => tr.children.map(c => texto(c)).join("|"));
    assert.deepEqual(linhas, ["Preço|3|75%", "Prazo|1|25%"]);
    bt.click();
    assert.equal(r1.querySelector(".g-tabela-caixa").hidden, false);
    const r2 = dom.doc.body.appendChild(dom.doc.createElement("div"));
    G.rosca(r2, { fatias: [{ rotulo: "Preço", valor: 3 }], fmt: v => String(v), resumo: "x" });
    assert.equal(r2.querySelector(".g-ver-tabela"), null, "quem monta a tabela por fora não ganha outra");
    const c1 = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const matriz = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, hr) => (d === 1 && hr === 9 ? 5 : 0)));
    G.calor(c1, { matriz, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => String(v), resumo: "Leads por hora", passoHoras: 3, tabela: true });
    const tab = c1.querySelector(".g-tabela");
    assert.ok(tab, "o mapa de calor em tabela (a grade é role=img)");
    assert.equal(tab.querySelectorAll("tbody tr").length, 7);
    assert.equal(texto(tab.querySelectorAll("tbody tr")[0].querySelector("th")), "seg", "a semana começa na segunda, como a grade");
    assert.equal(texto(tab.querySelectorAll("tbody tr")[0].querySelectorAll("td")[9]), "5");
  } finally { dom.fim(); }
});

test("DR-403 (DOM): a etapa zerada do funil continua à vista, marcada, e o leitor de tela ouve «nenhum nesta etapa»", async () => {
  const dom = comDom({ agora: AGORA });
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    G.funil(alvo, { resumo: "Funil", etapas: [{ nome: "Leads", qtd: 10 }, { nome: "Agendou", qtd: 0 }, { nome: "Ganhou", qtd: 2, tipo: "ganho" }] });
    const etapas = alvo.querySelectorAll(".g-fetapa");
    assert.equal(etapas.length, 3);
    assert.ok(etapas[1].classList.contains("g-fzero")); assert.equal(etapas[1].getAttribute("data-zero"), "1");
    assert.match(texto(etapas[1]), /\(nenhum nesta etapa\)/);
    assert.ok(!etapas[0].classList.contains("g-fzero"));
  } finally { dom.fim(); }
});

test("DR-404 (DOM): durante a contagem o número é aria-hidden e um texto escondido diz o valor final; no fim volta ao normal", async () => {
  const dom = comDom({ agora: AGORA });
  const salvos = { matchMedia: globalThis.matchMedia, getComputedStyle: globalThis.getComputedStyle };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.getComputedStyle = () => ({ getPropertyValue: n => (n === "--t-dados" ? "60ms" : "") });
  try {
    const el = dom.doc.body.appendChild(dom.doc.createElement("b"));
    G.contar(el, 1200, v => String(v));
    assert.equal(el.getAttribute("aria-hidden"), "true", "antes o leitor lia «0… 300… 1200»");
    const sombra = el.nextSibling;
    assert.ok(sombra && sombra.classList.contains("g-contando")); assert.equal(sombra.textContent, "1200");
    await esperar(150);
    assert.equal(el.textContent, "1200");
    assert.equal(el.getAttribute("aria-hidden"), null, "terminou: o número volta a ser lido");
    assert.equal(dom.doc.body.querySelector(".g-contando"), null);
  } finally { Object.assign(globalThis, salvos); dom.fim(); }
});
