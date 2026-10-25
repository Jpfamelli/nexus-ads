/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (15/10/2026), frente inicio, lote inicio-1.
   node --test testes/plano1000b-inicio.teste.mjs
   (a) PURO: mapa de destaque dos KPIs, ajudas pela vertical, «62%» sem espaço e de qual etapa, «3 dias», frase de quem espera,
       responsável na lista de espera, metas inválidas, vocab (compromisso nas 4 verticais, chave inexistente).
   (b) graficos.js num DOM de mentira: calor com matriz incompleta, funil/barras vazios, «Ver como tabela», dica viva com atraso,
       duração do tema em cache, largura mínima, ResizeObserver que se desliga.
   (c) COMPORTAMENTO do Início (o mesmo DOM de mentira do plano100-inicio, copiado abaixo com opções a mais: onb, semPulso, versao,
       erro/pendência do nx_inicio): virada do dia, falha sem empilhar avisos, «Atualizando…», histórico, KPIs trocáveis, «i» no toque,
       metas, checklist, «Assumir» de outra pessoa, offline, links das sobras, pontes do CRM.
   (d) ESTÁTICA (complemento): sem aria-live no «Atualizado às», CSS dos botões de organizar, das barras e do «i».
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
async function montarTela(d, { dom, agenda = AGENDA, papel = "admin", conta = ID_CONTA, semCanais = false, inicioLento = null, esperarMontar = true, onb = null, semPulso = false, versao = "T" } = {}) {
  const U = await import(pathToFileURL(join(APP, "ui.js")).href);
  const ui = { ...U };
  const chamadas = [], navegou = [], toasts = [];
  const resp = { d, agenda, atribuir: null, tarefa: null, onb, erroInicio: null, inicioPendente: null };
  let aoPulso = null;
  const canais = { lista: [], fns: new Set(), viu: 0,
    mudar(l) { canais.lista = l; for (const fn of [...canais.fns]) fn(l.slice()); } };
  ui.toast = (t, o = {}) => { toasts.push({ texto: t, tipo: o.tipo, desfazer: o.desfazer || null }); return { fechar() {}, el: null }; };
  const ctx = {
    alvo: dom.doc.body.appendChild(dom.doc.createElement("main")), versao, rota: { query: {} },
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

/* ---------- (a) PURO ---------- */
test("RB-226 + RB-154: chaveDestaqueKpi — cada KPI acende com o PRÓPRIO número (receita, previsão e atrasadas não caem mais em agenda.consultas)", () => {
  assert.deepEqual(["aguardando", "consultas", "aberto", "leads", "prazo", "receita", "previsao", "atrasadas"].map(I.chaveDestaqueKpi),
    ["conversas.aguardando", "agenda.consultas", "negocios.valor_aberto", "leads.semana", "conversas.respondidas_no_prazo_pct", "negocios.receita_mes", "negocios.previsao_ponderada", "tarefas.atrasadas"]);
  assert.equal(I.chaveDestaqueKpi("xyz"), null);
  // as chaves dos trocáveis são as que L.numerosMudaram devolve
  const antes = NOVO(), depois = NOVO(); depois.negocios.receita_mes = 99999; depois.negocios.previsao_ponderada = 1; depois.tarefas.atrasadas = 3;
  const mudou = RL.numerosMudaram(antes, depois);
  for (const id of ["receita", "previsao", "atrasadas"]) assert.ok(mudou.includes(I.chaveDestaqueKpi(id)), id);
});

test("RB-156 + RB-157: ajudas dos KPIs pela vertical — «oportunidades abertas», «do paciente», «Oportunidades que entraram», «cada oportunidade aberta»", () => {
  const ks = I.kpisInicio(ANTIGO(), AGENDA, { hoje: HOJE, voc: VOC_ODONTO });
  assert.match(ks[2].ajuda, /das oportunidades abertas no CRM/, "RB-156: antes «das oportunidades abertos»");
  assert.match(ks[0].ajuda, /a última mensagem é do paciente/, "RB-157: antes «do cliente» fixo");
  assert.match(ks[3].ajuda, /^Oportunidades que entraram pelo funil/);
  const alt = I.kpisAlternativos(ANTIGO(), { voc: VOC_ODONTO });
  assert.match(alt.find(k => k.id === "leads").ajuda, /^Oportunidades que entraram/);
  assert.match(alt.find(k => k.id === "previsao").ajuda, /de cada oportunidade aberta\.$/);
  const gen = I.kpisAlternativos(ANTIGO(), {});
  assert.match(gen.find(k => k.id === "previsao").ajuda, /de cada negócio aberto\.$/, "sem vocabulário: o genérico de antes");
  assert.match(I.kpisInicio(ANTIGO(), AGENDA, { hoje: HOJE })[2].ajuda, /dos negócios abertos/);
});

test("RB-158 + RB-245: «62%» sem espaço e o funil diz DE QUAL etapa («60% das conversas»); metas e helper pct", () => {
  assert.equal(I.pct(61.6), "62%"); assert.equal(I.pct(null), "0%");
  const f = I.funilMes(NOVO(), { voc: VOC_ODONTO });
  assert.deepEqual(f.etapas.map(e => e.conversao), ["", "83% dos leads", "58% das conversas", "82% das consultas marcadas"]);
  const oficina = I.funilMes(NOVO(), { voc: { consultas: "visitas" } });
  assert.equal(oficina.etapas[3].conversao, "82% das visitas marcadas");
  assert.match(I.funilMes({ funil_mes: { leads: 2, conversas: 5 } }).etapas[1].dica, /^250% dos leads:/);
  const p = I.progressoMeta({ meta: 50000, realizado: 28400, dia: 4, diasNoMes: 31 });
  assert.match(I.textoMeta(p, { fmt: v => String(Math.round(v)) }), /\(57%\)/);
  const src = ler("inicio.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\d \%|\} %/, "nenhum «N %» com espaço no inicio.js");
  assert.doesNotMatch(ler("graficos.js").replace(/\/\/.*$/gm, ""), /\} %[`"]/);
});

test("RB-159: espera longa em dias — 72 h vira «3 dias»; abaixo de 48 h continua em horas", () => {
  assert.equal(I.duracaoCurta(4320), "3 dias");
  assert.equal(I.duracaoCurta(2880), "2 dias");
  assert.equal(I.duracaoCurta(47 * 60), "47 h");
  assert.equal(I.duracaoCurta(26 * 60), "26 h");
  assert.equal(I.textoNumeroCaido([{ nome: "Recepção", desde: new Date(Date.now() - 3 * 86400000).toISOString() }]), "Número de WhatsApp desconectado há 3 dias: Recepção.");
});

test("RB-160 + RB-243: frase de quem espera (um × vários) e o nome do «Sem responsável · N»", () => {
  assert.equal(I.fraseEspera(1, "40 min", { contato: "paciente" }), "Paciente esperando há 40 min");
  assert.equal(I.fraseEspera(3, "40 min", { contato: "paciente" }), "A mais antiga espera há 40 min");
  assert.equal(I.rotuloSemDono(3), "Ver as 3 conversas sem responsável para assumir");
  assert.equal(I.rotuloSemDono(1), "Ver a conversa sem responsável para assumir");
});

test("RB-163: listaEspera mantém o responsável que o servidor manda; perguntaAssumir só quando é OUTRA pessoa", () => {
  const l = I.listaEspera({ aguardando_lista: [{ id: 1, espera_min: 5, atribuida_id: "c9", atribuida_nome: "Ana" }, { id: 2, espera_min: 3 }] });
  assert.deepEqual(l.map(x => [x.id, x.atribuidaId, x.atribuidaNome]), [[1, "c9", "Ana"], [2, null, null]]);
  assert.equal(I.perguntaAssumir(l[0], ID_CONTA), "Está com Ana. Assumir mesmo assim?");
  assert.equal(I.perguntaAssumir(l[0], "c9"), null, "já é minha");
  assert.equal(I.perguntaAssumir(l[1], ID_CONTA), null, "sem responsável");
  assert.equal(I.perguntaAssumir({ atribuidaId: "c2" }, ID_CONTA), "Está com outra pessoa da equipe. Assumir mesmo assim?");
});

test("RB-172 + RB-064: validarMetas — negativo/zero é erro no campo; vazio é «sem meta»; com o leitor do CRM «1,234.56» = «1.234,56»", () => {
  assert.deepEqual(I.validarMetas({ vendas: "-5", consultas: "" }).erros, { meta_vendas: "Use um número maior que zero." });
  assert.deepEqual(I.validarMetas({ vendas: "", consultas: "0" }).erros, { meta_consultas: "Use um número maior que zero." });
  assert.deepEqual(I.validarMetas({ vendas: "", consultas: "" }), { vendas: null, consultas: null, erros: {} });
  const ok = I.validarMetas({ vendas: "1,234.56", consultas: "12" }, CL.lerNumero);
  assert.equal(ok.vendas, 1234.56); assert.equal(ok.consultas, 12);
  assert.equal(I.validarMetas({ vendas: "1.234,56" }, CL.lerNumero).vendas, 1234.56, "a mesma leitura do negócio");
  assert.match(ler("inicio.js"), /lerNumeroCrm \|\| ui\.lerMoeda/);
});

test("RB-188 + RB-228 + RB-039: vocab — chave inexistente não lança; compromisso nas 4 verticais é a palavra da Agenda (rel-logica) e feminina", () => {
  const v = V.vocab("odonto");
  assert.doesNotThrow(() => v.novo("xyz")); assert.equal(v.novo("xyz"), "Novo xyz");
  assert.doesNotThrow(() => v.nenhum("xyz")); assert.equal(v.nenhum("xyz"), "Nenhum xyz");
  for (const vert of V.VERTICAIS) {
    const w = V.vocab(vert), p = RL.palavraAgenda(vert);
    assert.equal(w.min("compromisso"), p.um, `${vert}: a mesma palavra do Início`);
    assert.equal(w.min("compromissos"), p.varios, vert);
    assert.equal(w.art("compromisso"), "a", vert);
    assert.equal(w.novo("compromisso"), `Nova ${p.um}`, vert);
  }
  assert.equal(V.vocab("oficina").nenhum("compromissos"), "Nenhuma visita");
  for (const k of V.CHAVES) assert.equal(typeof V.vocab("loja")[k], "string", "as chaves de antes continuam");
});

/* ---------- (b) graficos.js ---------- */
test("RB-184 + RB-186 + RB-183: calor com matriz de 6 linhas não lança; funil/barras vazios dizem «Sem dados no período»; legenda sem «toque»", () => {
  const dom = comDom();
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const m6 = Array.from({ length: 6 }, () => Array(24).fill(1));
    assert.doesNotThrow(() => G.calor(alvo, { matriz: m6, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: String, resumo: "x" }));
    assert.equal(alvo.querySelectorAll(".g-cal-c[data-l]").length, 7 * 24);
    assert.doesNotThrow(() => G.calor(alvo, { matriz: [[1, 2]], dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: String, resumo: "x" }));
    G.funil(alvo, { etapas: [], resumo: "vazio" });
    const p = alvo.querySelector(".g-vazio");
    assert.equal(texto(p), "Sem dados no período."); assert.equal(p.getAttribute("role"), "status"); assert.equal(alvo.querySelector("ol"), null);
    const ctl = G.barras(alvo, { itens: [], series: [], fmt: String, resumo: "vazio" });
    assert.equal(texto(alvo.querySelector(".g-vazio")), "Sem dados no período."); assert.equal(typeof ctl.destruir, "function");
    G.donut(alvo, { fatias: [{ rotulo: "A", valor: 1 }], fmt: String, resumo: "r" });
    assert.equal(alvo.querySelector(".g-donut-leg").getAttribute("aria-label"), "Legenda: escolha uma fatia para esconder ou mostrar");
  } finally { dom.fim(); }
});

test("RB-187 + RB-181: alternarTabela — tabela escondida com caption, alterna gráfico × tabela; o texto troca e NÃO há aria-pressed", () => {
  const dom = comDom();
  try {
    const card = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const graf = card.appendChild(dom.doc.createElement("div")), rodape = card.appendChild(dom.doc.createElement("div"));
    const bt = G.alternarTabela(rodape, graf, { colunas: ["Dia", "Qtd"], linhas: [["seg", "1"], ["ter", "2"]], legenda: "Por dia" });
    const tab = card.querySelector(".g-tabela-caixa");
    assert.ok(tab.hidden); assert.equal(texto(tab.querySelector("caption")), "Por dia"); assert.equal(tab.querySelectorAll("tbody tr").length, 2);
    assert.equal(tab.querySelector("tbody th").getAttribute("scope"), "row");
    assert.equal(bt.getAttribute("aria-pressed"), null, "texto que troca + aria-pressed davam «Ver como gráfico, pressionado»");
    bt.click();
    assert.equal(tab.hidden, false); assert.equal(graf.hidden, true); assert.equal(bt.textContent, "Ver como gráfico"); assert.equal(bt.getAttribute("data-modo"), "tabela");
    bt.click();
    assert.equal(tab.hidden, true); assert.equal(graf.hidden, false); assert.equal(bt.textContent, "Ver como tabela");
  } finally { dom.fim(); }
});

test("RB-261: a dica visível não é região viva; a leitura sai 250 ms depois do último passo (segurar a seta não empilha anúncios)", async () => {
  const dom = comDom();
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const m = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => d + h));
    G.calor(alvo, { matriz: m, dias: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt: v => `${v} msgs`, resumo: "Mapa" });
    const caixa = alvo.querySelector(".g-calcaixa"), dica = caixa.querySelector(".g-dica"), viva = caixa.querySelector(".g-dica-viva");
    assert.equal(dica.getAttribute("aria-live"), null); assert.equal(dica.getAttribute("role"), null);
    assert.equal(viva.getAttribute("aria-live"), "polite"); assert.ok(viva.classList.contains("sr-only"));
    // plano 1500c: RC-244 — a 1ª seta começa na célula de MAIOR valor (sáb 23h nesta matriz), não mais em seg 8h; daí ← anda para trás
    for (let i = 0; i < 5; i++) dom.ev(caixa, "keydown", { key: i ? "ArrowLeft" : "ArrowDown" });
    assert.equal(dica.textContent, "sáb 19h: 25 msgs", "a dica visível anda na hora");
    assert.equal(viva.textContent, "", "nada lido ainda");
    await esperar(G.ATRASO_DICA_VIVA + 60);
    assert.equal(viva.textContent, "sáb 19h: 25 msgs", "só o ponto onde parou");
  } finally { dom.fim(); }
});

test("RB-185: duracaoToken lê o estilo uma vez por tema (cache) e relê quando o <html> muda", () => {
  const dom = comDom();
  let leituras = 0;
  const antes = globalThis.getComputedStyle, mm = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.getComputedStyle = () => { leituras++; return { getPropertyValue: n => (n === "--t-dados" ? "600ms" : "") }; };
  try {
    for (let i = 0; i < 20; i++) assert.equal(G.duracaoToken("--t-dados"), 600);
    assert.equal(leituras, 1, "20 contagens, 1 leitura de estilo");
    dom.doc.documentElement.setAttribute("data-esquema", "escuro");
    G.duracaoToken("--t-dados");
    assert.equal(leituras, 2, "tema trocou: relê");
  } finally { globalThis.getComputedStyle = antes; globalThis.matchMedia = mm; dom.fim(); }
});

test("RB-182 + RB-167: gráfico grande segue a largura real (mínimo 200, não 260); observadores de quem saiu da página se desligam", () => {
  assert.equal(G.larguraGrafico(150), 200); assert.equal(G.larguraGrafico(220), 220); assert.equal(G.larguraGrafico(0), 640);
  const dom = comDom();
  const obs = [];
  const RO = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; this.ligado = false; obs.push(this); } observe() { this.ligado = true; } disconnect() { this.ligado = false; } };
  try {
    const alvo = dom.doc.body.appendChild(dom.doc.createElement("div"));
    const proto = Object.getPrototypeOf(alvo);
    if (!proto.prepend) proto.prepend = function (...ns) { const ref = this.firstChild; for (const n of ns) this.insertBefore(n, ref); };
    const criar = dom.doc.createElement; dom.doc.createElement = t => { const e = criar(t); e.clientWidth = 220; return e; };     // o cartão estreito (2 colunas a 360 px)
    G.linha(alvo, { pontos: [{ rotulo: "a", valores: [1] }, { rotulo: "b", valores: [3] }], series: [{ nome: "S", classe: "g-s0" }], fmt: String, resumo: "r" });
    assert.equal(alvo.querySelector("svg").getAttribute("width"), "220", "antes: 260 e o SVG passava da borda");
    dom.doc.createElement = criar;
    const sp = dom.doc.body.appendChild(dom.doc.createElement("span"));
    const ctl = G.sparkline(sp, { valores: [1, 2, 3], rotulo: "x" });
    const o = obs.at(-1);
    assert.ok(o.ligado && typeof ctl.destruir === "function");
    sp.remove(); o.fn();
    assert.equal(o.ligado, false, "fora da página: desliga sozinho");
  } finally { globalThis.ResizeObserver = RO; dom.fim(); }
});

/* ---------- (c) COMPORTAMENTO do Início ---------- */
test("RB-152 + RB-229: virada do dia — o relógio relê e a data do cabeçalho (texto e datetime) muda", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "23", "59")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    const data = r.raiz.querySelector("time.ini-data");
    assert.equal(data.getAttribute("datetime"), HOJE);
    const antesTxt = texto(data), n0 = r.chamadas.filter(c => c.nome === "nx_inicio").length;
    dom.andar(2 * 60000); dom.relogio(); await tick(); await tick();
    assert.equal(data.getAttribute("datetime"), "2026-10-05");
    assert.notEqual(texto(data), antesTxt); assert.match(texto(data), /5 de outubro/);
    assert.equal(r.chamadas.filter(c => c.nome === "nx_inicio").length, n0 + 1, "carregar() na virada");
  } finally { dom.fim(); }
});

test("RB-153 + RB-175 + RB-176: «Atualizado às» sem aria-live; servidor fora do ar = 1 aviso (não 1 a cada 30 s) e a falha anunciada; «Atualizando…»", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    const quando = r.raiz.querySelector(".ini-quando");
    assert.match(texto(quando), /^Atualizado às/); assert.equal(quando.getAttribute("aria-live"), null);
    const anuncios = []; r.ctx.ui.anunciar = t => anuncios.push(t);
    r.resp.erroInicio = new Error("http_503");
    for (let i = 0; i < 6; i++) { dom.andar(31000); await r.pulso(); }
    assert.equal(r.toasts.filter(t => t.tipo === "erro").length, 1, "6 falhas seguidas, 1 aviso");
    assert.match(texto(quando), /A atualização falhou/);
    r.resp.erroInicio = null; dom.andar(31000); await r.pulso();
    r.resp.erroInicio = new Error("http_503"); dom.andar(31000); await r.pulso();
    assert.equal(r.toasts.filter(t => t.tipo === "erro").length, 2, "depois de um sucesso, a próxima falha avisa de novo");
    r.resp.erroInicio = null;
    // «Atualizar»: texto e aria-busy enquanto carrega
    let soltar; r.resp.inicioPendente = new Promise(ok => { soltar = ok; });
    const bt = r.raiz.querySelectorAll("button").find(b => b.classList.contains("rel-btn"));
    bt.click(); await tick();
    assert.equal(bt.textContent, "Atualizando…"); assert.equal(bt.getAttribute("aria-busy"), "true"); assert.equal(bt.disabled, true);
    r.resp.inicioPendente = null; soltar(); await tick(); await tick();
    assert.equal(bt.textContent, "Atualizar"); assert.equal(bt.getAttribute("aria-busy"), null); assert.equal(bt.disabled, false);
  } finally { dom.fim(); }
});

test("RB-155 + RB-170: o histórico guarda previsão e atrasadas; leitura igual não regrava o localStorage", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    let gravacoes = 0;
    const set = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (k, v) => { if (k === CHAVE_HIST) gravacoes++; return set(k, v); };
    const d = NOVO(); d.tarefas.atrasadas = 2;
    const r = await montarTela(d, { dom });
    const dia = JSON.parse(dom.mem.get(CHAVE_HIST)).dias.find(x => x.dia === HOJE);
    assert.equal(dia.previsao_ponderada, 26200); assert.equal(dia.tarefas_atrasadas, 2);
    assert.equal(gravacoes, 1);
    for (let i = 0; i < 5; i++) { dom.andar(31000); await r.pulso(); }
    assert.equal(gravacoes, 1, "5 leituras iguais, nenhuma gravação a mais");
    const d2 = NOVO(); d2.tarefas.atrasadas = 3; r.resp.d = d2; dom.andar(31000); await r.pulso();
    assert.equal(gravacoes, 2, "mudou: grava");
  } finally { dom.fim(); }
});

test("RB-164 + RB-177: Início monta sem ctx.pulso (não lança) e com outra versão do app", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom, semPulso: true });
    assert.ok(r.raiz.querySelector(".ini-kpi"));
    const r2 = await montarTela(NOVO(), { dom, versao: "T2" });
    assert.ok(r2.raiz.querySelector(".ini-kpi"), "a versão nova reimporta e desenha");
  } finally { dom.fim(); }
  assert.match(ler("inicio.js"), /versaoLG !== ctx\.versao/);
});

test("RB-165 + RB-179: KPI sem dado tem o traço escondido e «sem dado» em texto; o «i» é um botão FORA do link que mostra a ajuda sem navegar", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom, agenda: { erro: true } });
    const env = r.raiz.querySelector(".ini-kpi-env[data-kpi-env=consultas]");
    const card = env.querySelector(".ini-kpi");
    const b = card.querySelector(".ini-kpi-v");
    assert.equal(texto(b), "—"); assert.equal(b.getAttribute("aria-hidden"), "true"); assert.equal(b.getAttribute("aria-label"), null);
    assert.match(texto(card.querySelector(".ini-kpi-vs .sr-only")), /sem dado/);
    const ag = r.raiz.querySelector(".ini-kpi-env[data-kpi-env=aguardando]");
    const link = ag.querySelector("a.ini-kpi"), bt = ag.querySelector("button.ini-kpi-ajuda");
    assert.ok(link && bt); assert.equal(link.contains(bt), false, "botão não fica dentro do <a>");
    assert.equal(bt.getAttribute("aria-label"), "O que é «Esperando resposta»?");
    let mostrado = null; r.ctx.ui.flutuante = (a, c) => { mostrado = { a, c }; return { fechar() {} }; };
    bt.click();
    assert.equal(mostrado.a, bt); assert.match(texto(mostrado.c), /Conversas abertas em que a última mensagem é do paciente/);
    assert.deepEqual(r.navegou, [], "não navega");
  } finally { dom.fim(); }
});

test("RB-154 (DOM): KPI trocado por «Receita do mês» acende quando a receita muda (e não quando a agenda muda)", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    dom.mem.set(`nx-ini-kpis:${ID_CLI}:${ID_CONTA}`, JSON.stringify({ 3: "receita" }));
    const r = await montarTela(NOVO(), { dom });
    const v = r.raiz.querySelector(".ini-kpi[data-kpi=receita] .ini-kpi-v");
    assert.equal(v.dataset.n, "negocios.receita_mes");
    const d2 = NOVO(); d2.negocios.receita_mes = 31000; r.resp.d = d2;
    dom.andar(31000); await r.pulso();
    const v2 = r.raiz.querySelector(".ini-kpi[data-kpi=receita] .ini-kpi-v");
    assert.equal(v2.dataset.n, "negocios.receita_mes", "o seletor [data-n=negocios.receita_mes] (L.numerosMudaram) alcança o KPI");
  } finally { dom.fim(); }
});

test("RB-166 + RB-180: «Trocar indicadores» fica aberto — troca 1 e 2 na mesma abertura; a nota diz que fica no aparelho", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    let flut = null, fechou = 0;
    r.ctx.ui.flutuante = (a, c) => { flut = c; return { fechar() { fechou++; } }; };
    r.raiz.querySelector(".ini-kpis-trocar").click();
    assert.match(texto(flut), /Fica guardado neste aparelho\./);
    const sels = flut.querySelectorAll("select");
    ["aguardando", "consultas", "aberto", "prazo"].forEach((v, i) => { sels[i].value = v; sels[i].dataset.ant = v; });
    sels[0].value = "receita"; dom.ev(sels[0], "change"); await tick();
    sels[1].value = "atrasadas"; dom.ev(sels[1], "change"); await tick();
    assert.equal(fechou, 0, "nenhuma escolha fecha o flutuante");
    assert.deepEqual(kpiIds(r.raiz), ["receita", "atrasadas", "aberto", "prazo"]);
    assert.deepEqual(JSON.parse(dom.mem.get(`nx-ini-kpis:${ID_CLI}:${ID_CONTA}`)), { 0: "receita", 1: "atrasadas", 2: "aberto", 3: "prazo" });
    // trocar por um que já está em outra posição troca os dois — com o «anterior» atualizado na 2ª troca
    sels[2].value = "receita"; dom.ev(sels[2], "change"); await tick();
    assert.deepEqual(kpiIds(r.raiz), ["aberto", "atrasadas", "receita", "prazo"]);
    flut.querySelectorAll("button").find(b => b.textContent === "Pronto").click();
    assert.equal(fechou, 1);
  } finally { dom.fim(); }
});

test("RB-167 (DOM): redesenhos do Início não acumulam ResizeObserver das linhas dos KPIs", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  const RO = globalThis.ResizeObserver;
  let vivos = 0;
  // só os das linhas dos KPIs (o ui.segmentado das barras tem o dele — pendência da frente sis)
  globalThis.ResizeObserver = class { observe(el) { if (el && el.classList && el.classList.contains("ini-kpi-sp")) { vivos++; this.l = true; } } disconnect() { if (this.l) vivos--; this.l = false; } };
  try {
    const r = await montarTela(NOVO(), { dom });
    const base = vivos;
    assert.ok(base > 0, "as linhas usam o observador");
    for (let i = 0; i < 5; i++) { const d = NOVO(); d.negocios.valor_aberto = 60000 + i; r.resp.d = d; dom.andar(31000); await r.pulso(); }
    assert.equal(vivos, base, "5 redesenhos, o mesmo número de observadores vivos");
    I.desmontar();
    assert.equal(vivos, 0, "desmontar solta todos");
  } finally { globalThis.ResizeObserver = RO; dom.fim(); }
});

test("RB-195: ponte do CRM que rejeita (shell antigo) não deixa promessa solta; a que devolve null não quebra nada", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  const soltas = []; const ouvir = e => soltas.push(e);
  process.on("unhandledRejection", ouvir);
  try {
    const r = await montarTela(NOVO(), { dom });
    r.ctx.abrirNegocio = () => Promise.reject(new Error("rede"));
    r.raiz.querySelector("[data-k^=px-]").click(); await tick(); await tick();
    r.ctx.abrirNegocio = async () => null;
    r.raiz.querySelector("[data-k^=px-]").click(); await tick();
    assert.deepEqual(soltas, [], "sem unhandledRejection");
  } finally { process.off("unhandledRejection", ouvir); dom.fim(); }
});

test("RB-168 (ações rápidas): o erro traz ctx.api.mensagemErro, não só «Não deu para abrir agora»", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    r.ctx.carregar = async () => { throw new Error("modulo_agenda_falhou"); };
    r.raiz.querySelectorAll("button").find(b => b.classList.contains("rel-btn")).click(); await tick(); await tick();
    const bt = r.raiz.querySelector("[data-k=rap-consulta]");
    assert.ok(bt, "o «Marcar consulta» aparece com ctx.carregar");
    bt.click(); await tick(); await tick();
    assert.ok(r.toasts.some(t => t.tipo === "erro" && t.texto === "modulo_agenda_falhou"));
    assert.equal(bt.disabled, false);
  } finally { dom.fim(); }
});

test("RB-169: sem internet a caixa de concluir tarefa nasce desligada com «Sem internet»; com a rede, ligada", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    await comNavegador(false, async () => {
      const r = await montarTela(NOVO(), { dom });
      const cx = r.raiz.querySelector(".ini-check");
      assert.equal(cx.disabled, true); assert.match(cx.getAttribute("title"), /Sem internet/);
    });
    await comNavegador(true, async () => {
      const r = await montarTela(NOVO(), { dom });
      const cx = r.raiz.querySelector(".ini-check");
      assert.equal(cx.disabled, false); assert.equal(cx.getAttribute("title"), null);
    });
  } finally { dom.fim(); }
});

test("RB-171 + RB-172 (DOM): barra da meta diz o esperado para o leitor; «-5» mostra erro no campo e não retira as metas", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    dom.mem.set(`nx-ini-metas:${ID_CLI}`, JSON.stringify({ vendas: 50000 }));
    const r = await montarTela(NOVO(), { dom });
    const barra = r.raiz.querySelector(".ini-metas .ini-meta-barra");
    assert.match(barra.getAttribute("aria-label"), /^Vendas do mês: 57% da meta; esperado hoje: R\$\s?6\.452$/);
    assert.match(r.raiz.querySelector(".ini-vendas .ini-meta-barra").getAttribute("aria-label"), /esperado hoje: R\$\s?6\.452/);
    r.raiz.querySelector("[data-k=mt-editar]").click();
    const form = r.raiz.querySelector(".ini-metas-form");
    const inV = form.querySelector("[data-k=mt-v]"); inV.value = "-5";
    dom.ev(form, "submit");
    const err = form.querySelector("[data-campo=meta_vendas] .campo-erro");
    assert.equal(texto(err), "Use um número maior que zero."); assert.equal(err.hidden, false);
    assert.deepEqual(JSON.parse(dom.mem.get(`nx-ini-metas:${ID_CLI}`)), { vendas: 50000 }, "metas continuam");
    assert.ok(!r.toasts.some(t => t.texto === "Metas retiradas."));
    await esperar(80);     // o anúncio do erro (ui.anunciar, 30 ms) sai antes de desmontar o DOM de mentira
  } finally { dom.fim(); }
});

test("RB-173 + RB-260: «Dispensar por 7 dias» tem Desfazer; voltar do «Fazer agora» devolve o foco ao mesmo item", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    assert.ok(r.raiz.querySelector(".ini-onb"), "checklist à vista");
    // RB-260
    const item = r.raiz.querySelectorAll("[data-k^=onb-]").find(a => a.localName === "a" && a.dataset.k === `onb-${RL.ONBOARDING_ITENS[3].id}`);
    item.click();
    I.desmontar();
    const r2 = await montarTela(NOVO(), { dom, onb: ONB_PENDENTE() });
    await esperar(90);
    assert.equal(dom.doc.activeElement && dom.doc.activeElement.dataset.k, `onb-${RL.ONBOARDING_ITENS[3].id}`, "foco no mesmo «Fazer agora»");
    // RB-173
    r2.raiz.querySelector("[data-k=onb-dispensar]").click(); await tick(); await tick();
    const chaveOnb = `nx-onb:${ID_CLI}:${ID_CONTA}`;
    assert.ok(JSON.parse(dom.mem.get(chaveOnb)).dispensadoAte > Date.now());
    const t = r2.toasts.find(x => /7 dias/.test(x.texto));
    assert.equal(typeof t.desfazer, "function", "antes: só informativo");
    t.desfazer(); await tick(); await tick();
    assert.equal(JSON.parse(dom.mem.get(chaveOnb)).dispensadoAte, 0);
    assert.ok(r2.raiz.querySelector(".ini-onb"), "o cartão volta");
  } finally { dom.fim(); }
});

test("RB-163 (DOM): «Assumir» conversa que está com outra pessoa pergunta; cancelar não chama nx_cv_atribuir", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.conversas.aguardando_lista[0] = { ...d.conversas.aguardando_lista[0], atribuida_id: "c9", atribuida_nome: "Ana" };
    const r = await montarTela(d, { dom });
    const perguntas = []; let resposta = false;
    r.ctx.ui.confirmar = async o => { perguntas.push(o.texto); return resposta; };
    const bt = r.raiz.querySelector("[data-k=ag-assumir-901]");
    bt.click(); await tick();
    assert.deepEqual(perguntas, ["Está com Ana. Assumir mesmo assim?"]);
    assert.ok(!r.chamadas.some(c => c.nome === "nx_cv_atribuir")); assert.equal(bt.disabled, false);
    resposta = true; bt.click(); await tick(); await tick();
    assert.ok(r.chamadas.some(c => c.nome === "nx_cv_atribuir")); assert.deepEqual(r.navegou, ["#/conversas/901"]);
    // sem responsável: não pergunta
    const bt2 = r.raiz.querySelector("[data-k=ag-assumir-902]");
    if (bt2) { perguntas.length = 0; bt2.click(); await tick(); assert.deepEqual(perguntas, []); }
  } finally { dom.fim(); }
});

test("RB-178 + RB-243 + RB-160 (DOM): «+N na fila» e «+N no quadro» são links; «Sem responsável · N» explica; frase de quem espera", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.conversas.aguardando = 5; d.conversas.sem_dono = 3;
    d.agendados_sem_data = { total: 7, itens: [{ id: 11, contato_nome: "Rafael", estagio_nome: "Agendado", desde: new Date(Date.now() - 3600000).toISOString() }] };
    const r = await montarTela(d, { dom });
    const fila = r.raiz.querySelector("[data-k=ag-fila]");
    assert.equal(fila.getAttribute("href"), "#/conversas?aba=aguardando"); assert.equal(texto(fila), "+3 na fila");
    const quadro = r.raiz.querySelector("[data-k=sd-quadro]");
    assert.equal(quadro.getAttribute("href"), "#/crm"); assert.equal(texto(quadro), "+6 no quadro");
    assert.equal(r.raiz.querySelector("[data-k=ag-semdono]").getAttribute("aria-label"), "Ver as 3 conversas sem responsável para assumir");
    assert.match(texto(r.raiz.querySelector(".ini-atend .ini-espera")), /^A mais antiga espera há 40 min$/);
  } finally { dom.fim(); }
});

test("RB-244 (DOM): trocar «Hoje/7 dias» depois da virada da hora destaca a hora NOVA (sem esperar o relógio)", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "14", "59")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    const horas = r.raiz.querySelector(".ini-horas");
    assert.ok(horas.querySelector(".ini-bv-agora[data-k=bv-14]"));
    dom.andar(2 * 60000);
    const ops = horas.querySelectorAll(".seg-op");
    ops.find(b => b.dataset.valor === "semana").click();
    ops.find(b => b.dataset.valor === "hoje").click();
    assert.ok(horas.querySelector(".ini-bv-agora[data-k=bv-15]"), "15h destacada");
    assert.equal(horas.querySelector(".ini-bv-agora[data-k=bv-14]"), null);
  } finally { dom.fim(); }
});

/* ---------- (d) ESTÁTICA (complemento) ---------- */
test("RB-230 + RB-161 + RB-162 + RB-179: «Atualizado às» sem aria-live no código; botões de organizar sem opacidade baixa; barras com 12 px; «i» com 44 px no toque", () => {
  const js = ler("inicio.js");
  const linhaQuando = js.split("\n").find(l => /const quando = h\("p"/.test(l));
  assert.ok(linhaQuando && !/aria-live/.test(linhaQuando), "RB-230: o parágrafo da hora não é região viva");
  const css = ler("inicio.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.ini-bl-bt \{[^}]*color: var\(--c-texto-2\); opacity: 1;/);
  assert.doesNotMatch(css, /\.ini-bl-bt \{[^}]*opacity: \.(55|8)\b/);
  assert.doesNotMatch(css, /\.ini-bv-r \{[^}]*--fs-11/);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 760px\) \{\s*\.ini-kpi-ajuda \{ width: 44px; height: 44px;/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "hex de cor no CSS");
  for (const f of ["inicio.js", "graficos.js", "vocab.js"]) assert.ok(!/["'`]#[0-9a-fA-F]{3,8}["'`]/.test(ler(f)), `hex solto em ${f}`);
});

/* ---------- revisão 1000b ---------- */
test("RB-185 (revisão 1000b): a assinatura do cache de duração inclui o «reduzir movimento» do sistema (e aguenta ambiente sem matchMedia)", () => {
  const dom = comDom();
  const mm = globalThis.matchMedia;
  try {
    const raiz = dom.doc.documentElement;
    let reduz = false;
    globalThis.matchMedia = q => ({ matches: /prefers-reduced-motion: reduce/.test(q) && reduz });
    const sem = G.assinaturaTema(raiz);
    reduz = true;
    const com = G.assinaturaTema(raiz);
    assert.notEqual(sem, com, "antes: a assinatura só olhava o <html> e o cache sobrevivia à troca da preferência");
    delete globalThis.matchMedia;
    assert.equal(typeof G.assinaturaTema(raiz), "string", "sem matchMedia: não quebra");
    globalThis.matchMedia = () => { throw new Error("sem suporte"); };
    assert.equal(typeof G.assinaturaTema(raiz), "string", "matchMedia que lança: não quebra");
  } finally { if (mm) globalThis.matchMedia = mm; else delete globalThis.matchMedia; dom.fim(); }
});
