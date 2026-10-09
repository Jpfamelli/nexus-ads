/* Plano «100+ melhorias» · frente E (Agenda), 09/10/2026. Sem rede, sem navegador: as peças puras e a TELA (montar) num DOM mínimo, com
   ui/api de mentira; o servidor fictício filtra as consultas pelo período pedido (p_data + p_dias), como nx_agenda_dia.
   E1 presença · E2 encaixe/dono_nome do servidor · E3 próxima fora do período · E4 mini-calendário a 360 px · E5 check/esqueleto/vazio ·
   E6 «Lembrar» · E7 legenda com avatar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const A = await import("../web/app/agenda.js");
const L = await import("../web/app/crm-logica.js?v=p100");   // as regras de presença da frente C (PRESENCAS, presencaDe, consultaPassou)
const R = await import("../web/app/rascunho.js");

/* ============================================================ DOM mínimo (o mesmo contrato do ui.h) */
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

/* ============================================================ a tela montada (montar de verdade) */
const tique = () => new Promise(r => setTimeout(r, 0));
const esperar = async (n = 10) => { for (let i = 0; i < n; i++) await tique(); };
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
/** Storage de mentira (getItem/setItem/removeItem/key/length) para o rascunho.js real. */
function memoria() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m };
}
const consultaEm = (dia, hh, extra = {}) => ({ negocio_id: 801, contato_id: 501, nome: "Mariana Costa", titulo: "Aparelho", servico: "Avaliação", status: "aberto",
  inicio: `${dia}T${hh}:00-03:00`, fim: `${dia}T${hh.slice(0, 2)}:30:00-03:00`, ...extra });
const naData = (c, de, dias) => { const d = A.partesSP(c.inicio).dia; return d >= de && d < A.diaISO(de, dias); };

async function montarAgenda({ data, modo = "semana", consultas = [], rpc = null, modal = null, rascunhoStorage = null, comConversas = true, cfg = { duracao_min: 30, capacidade: 1 } } = {}) {
  const D = criarDom();
  const { h } = D;
  const reg = { chamadas: [], modais: [], toasts: [], desfazer: [], pops: [], comandos: [], ativos: new Set(), checks: [], vazios: [], esqueletos: [], avatares: [], copiados: [], navegou: [], carregarCrm: 0 };
  const ouv = new Map();
  const doc = {
    hidden: false, body: h("body"),
    addEventListener(t, f) { if (!ouv.has(t)) ouv.set(t, []); ouv.get(t).push(f); },
    removeEventListener(t, f) { if (ouv.has(t)) ouv.set(t, ouv.get(t).filter(x => x !== f)); },
    querySelector: () => null, elementFromPoint: () => null, createElement: tag => h(tag), get activeElement() { return D.estado.ativo || doc.body; },
  };
  const storage = new Map();
  const hoje = hojeSP();
  storage.set(A.chavePreferenciasAgenda("cli-ag", "conta-ag"), JSON.stringify({ data, modo, em: hoje }));
  const globais = { document: doc, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    requestAnimationFrame: f => setTimeout(() => f(Date.now()), 0), cancelAnimationFrame: id => clearTimeout(id), innerHeight: 800 };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  const dados = { consultas };
  const ui = {
    h, limpar: el => { el.replaceChildren(); return el; }, carregarCss: async () => {}, hojeSP: () => hoje, icone: n => h("svg", { class: "ic", dataset: { n } }),
    cabecalho: o => h("header", { class: "cab" }, h("h1", null, o.titulo), h("div", { class: "cab-acoes" }, o.acoes)),
    segmentado: o => h("div", { class: ["seg", o.classe], role: "tablist" }, (o.opcoes || []).map(op => h("button", { type: "button", role: "tab", dataset: { valor: op.valor }, "aria-selected": String(op.valor === o.valor), on: { click: () => o.aoMudar && o.aoMudar(op.valor) } }, op.rotulo))),
    esqueleto: (tipo, o) => { reg.esqueletos.push(tipo); return h("div", { class: ["esqueleto", `esqueleto-${tipo}`] }); },
    erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    num: v => String(v), dataBR: iso => String(iso), dataCurtaBR: iso => String(iso).slice(5), horaBR: iso => String(iso || "").slice(11, 16), dataHoraBR: iso => String(iso || ""), periodoBR: () => "", telBR: t => String(t),
    toast: (t, o) => { reg.toasts.push(t); return { fechar() {} }; }, acaoComDesfazer: o => { reg.desfazer.push(o); return Promise.resolve(); },
    modal: async o => { reg.modais.push(o); return modal ? modal(o) : null; }, flutuante: (ancora, corpo) => { reg.pops.push(corpo); return { fechar() {} }; }, comportamentoRolagem: () => "auto",
    debounce: f => { const g = (...a) => f(...a); g.cancelar = () => {}; return g; },
    campo: o => h("label", { class: "campo" }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : "input", { name: o.nome, value: o.valor ?? "" })),
    carregando: async (b, p) => (typeof p === "function" ? p() : p),
    checkSucesso: (el, o) => { reg.checks.push([el, o]); return Promise.resolve(true); },
    vazio: o => { reg.vazios.push(o); return h("div", { class: "vazio vazio-tema", dataset: { tema: o.tema } }, h("h2", null, o.titulo), o.acao ? h("button", { type: "button", class: "bt bt-prim", on: { click: o.acao.fn } }, o.acao.rotulo) : null); },
    avatar: (nome, id, img, o) => { reg.avatares.push([nome, id, o]); return h("span", { class: "avatar", style: { "--cor": "var(--pal-0)" }, dataset: { id } }, String(nome).slice(0, 1)); },
    copiar: async t => { reg.copiados.push(t); return true; },
  };
  const api = { mensagemErro: e => String(e && (e.codigo || e.message)), rpcC: async (nome, p = {}) => {
    reg.chamadas.push({ nome, p });
    await tique();
    if (rpc) { const r = await rpc(nome, p, dados); if (r !== undefined) return r; }
    if (nome === "nx_agenda_dia") return { config: cfg, consultas: dados.consultas.filter(c => naData(c, p.p_data, p.p_dias)), bloqueios: [] };
    return {};
  } };
  const rascunho = R.criarRascunhos({ storage: rascunhoStorage || memoria(), conta: () => "conta-ag", cliente: () => "cli-ag", doc: null, janela: null });
  const alvo = h("main", { id: "vista" });
  const ctx = { ui, api, alvo, versao: "p100", cliente: { id: "cli-ag" }, sessao: { conta: { id: "conta-ag" } }, titulo() {}, navegar: rota => reg.navegou.push(rota),
    comandos: { registrar(cmd) { reg.comandos.push(cmd); reg.ativos.add(cmd); return () => reg.ativos.delete(cmd); } },
    rascunho: { ligar: (c, k, o) => rascunho.ligar(c, k, o), apagar: k => rascunho.apagar(k), existe: k => rascunho.existe(k), texto: k => rascunho.texto(k) },
    pode: () => true, temModulo: m => (m === "conversas" ? comConversas : true),
    carregar: async () => { reg.carregarCrm++; return { kit: async () => ({ base: { usuarios: [{ id: "u1", nome: "Dra. Helena" }, { id: "u2", nome: "Ana Paula" }] } }) }; } };
  await A.montar(ctx);
  await esperar(8);
  return { D, h, alvo, reg, dados, rascunho, hoje,
    sair() { A.desmontar(); for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}
const passadaSeg = () => A.segundaDe(A.diaISO(hojeSP(), -21));   // uma segunda de 3 semanas atrás: tudo «já passou»
const futuraSeg = () => A.segundaDe(A.diaISO(hojeSP(), 14));     // uma semana inteira no futuro: nada «já passou»
const cfgSemana = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1 };

/* ============================================================ E1 · presença */
test("E1 · presença pelas regras do CRM (crm-logica): só consulta que já passou, aberta ou já marcada; falta conta no painel", () => {
  const agora = Date.parse("2026-10-09T12:00:00-03:00");
  const passada = { negocio_id: 1, inicio: "2026-10-08T10:00:00-03:00", status: "aberto", presenca: null };
  assert.deepEqual(A.presencaDaConsulta(passada, L, agora), { estado: null, possivel: true, conhecida: true });
  assert.deepEqual(A.presencaDaConsulta({ ...passada, inicio: "2026-10-10T10:00:00-03:00" }, L, agora), { estado: null, possivel: false, conhecida: true }, "ainda não aconteceu");
  assert.equal(A.presencaDaConsulta({ ...passada, status: "ganho" }, L, agora).possivel, false, "concluída sem marca: não pergunta");
  assert.deepEqual(A.presencaDaConsulta({ ...passada, status: "ganho", presenca: "compareceu" }, L, agora), { estado: "compareceu", possivel: true, conhecida: true }, "com marca, continua à mostra (dá para limpar)");
  const { presenca, ...antiga } = passada;
  assert.deepEqual(A.presencaDaConsulta(antiga, L, agora), { estado: null, possivel: true, conhecida: false }, "linha de servidor antigo: a tela lê a ficha");
  assert.equal(A.presencaDaConsulta({ ...antiga, campos: { presenca: "faltou" } }, L, agora).estado, "faltou", "presencaDe também lê campos.presenca");
  assert.deepEqual(A.presencaDaConsulta(passada, null, agora), { estado: null, possivel: false, conhecida: false }, "sem a crm-logica: nada");
  // falta = etapa de faltas OU presença «faltou»
  assert.equal(A.classificarConsulta({ ...passada, presenca: "faltou" }, null).falta, true);
  assert.equal(A.classificarConsulta({ ...passada, presenca: "compareceu" }, null).falta, false);
  const r = A.resumoDoDia([{ ...passada, presenca: "faltou" }, { ...passada, negocio_id: 2, inicio: "2026-10-08T11:00:00-03:00", marco: "faltou" }, { ...passada, negocio_id: 3, inicio: "2026-10-08T14:00:00-03:00" }], "2026-10-08", null);
  assert.equal(r.faltas, 2);
});

test("E1 · «Compareceu / Faltou» na tela: grupo com aria-pressed, toque chama aoMarcar; no painel só nas consultas que já passaram", () => {
  const { h } = criarDom();
  const vistos = [];
  const c = { negocio_id: 7, nome: "Bianca", inicio: "2026-10-08T10:00:00-03:00", status: "aberto", presenca: "faltou" };
  const g = A.montarPresenca({ h, c, estado: "faltou", rotulos: L.PRESENCAS, aoMarcar: (cc, est, b) => vistos.push([cc, est, b]) });
  assert.equal(g.getAttribute("role"), "group"); assert.equal(g.getAttribute("aria-label"), "Presença de Bianca"); assert.equal(g.dataset.negocio, "7");
  const bts = g.querySelectorAll(".ag-pres-bt");
  assert.deepEqual(bts.map(b => [b.dataset.estado, b.textContent, b.getAttribute("aria-pressed")]), [["compareceu", "Compareceu", "false"], ["faltou", "Faltou", "true"]]);
  assert.equal(bts[1].getAttribute("title"), "Tocar de novo limpa a marcação");
  bts[0].click();
  assert.deepEqual(vistos, [[c, "compareceu", bts[0]]]);
  assert.equal(A.montarPresenca({ h, c, desabilitado: true }).querySelector("button").disabled, true, "quem só lê vê, mas não marca");
  // painel: a de ontem (passada) ganha os botões; a de amanhã não; o selo «Faltou» some quando o botão já diz
  const ontem = A.diaISO(hojeSP(), -1);
  const consultas = [{ ...c, inicio: `${ontem}T09:00:00-03:00` }, { ...c, negocio_id: 8, nome: "Rafael", inicio: `${ontem}T23:59:00-03:00`, presenca: null }];
  const agora = Date.parse(`${ontem}T12:00:00-03:00`);
  const el = A.montarPainelDia({ h, iso: ontem, consultas, hoje: hojeSP(), pode: true, horaBR: x => x.slice(11, 16), presenca: { L, agora, aoMarcar: () => {} } });
  const lis = el.querySelectorAll(".ag-painel-li");
  assert.equal(lis.length, 2);
  assert.ok(lis[0].classList.contains("com-presenca") && lis[0].querySelector(".ag-pres"), "consulta das 9h (passada) com presença");
  assert.equal(lis[1].querySelector(".ag-pres"), null, "a das 23:59 ainda não aconteceu");
  assert.equal(lis[0].dataset.negocio, "7");
  assert.equal(lis[0].querySelectorAll(".pilula").filter(p => p.textContent === "Faltou").length, 0, "o botão pressionado já diz «Faltou»");
  assert.equal(el.querySelectorAll(".ag-kpi b")[2].textContent, "1", "a presença «faltou» conta nas faltas");
});

test("E1 · tela: «Faltou» lê a etapa, grava (nx_agenda_presenca) e o Desfazer limpa e devolve a etapa; tocar de novo no marcado limpa", async () => {
  const dia = passadaSeg();
  const rpc = async (nome, p, d) => {
    if (nome === "nx_negocio_ver") return { negocio: { id: 801, estagio_id: "s3", ordem: 2, campos: {} } };
    if (nome === "nx_agenda_presenca") { for (const c of d.consultas) if (c.negocio_id === p.p_negocio) c.presenca = p.p_estado === "limpar" ? null : p.p_estado; return { ok: true, presenca: p.p_estado === "limpar" ? null : p.p_estado, estagio_id: p.p_estado === "faltou" ? "s9" : "s3" }; }
    if (nome === "nx_negocio_mover") return { id: 801 };
    return undefined;
  };
  const T = await montarAgenda({ data: dia, modo: "dia", consultas: [consultaEm(dia, "10:00", { presenca: null })], rpc });
  try {
    const faltou = () => T.alvo.querySelector('.ag-painel-li[data-negocio="801"] .ag-pres-faltou');
    assert.ok(faltou(), "o painel do dia mostra «Faltou» na consulta passada");
    assert.equal(faltou().getAttribute("aria-pressed"), "false");
    T.reg.chamadas.length = 0;
    faltou().click();
    await esperar(12);
    const nomes = T.reg.chamadas.map(c => c.nome);
    assert.ok(nomes.indexOf("nx_negocio_ver") >= 0 && nomes.indexOf("nx_negocio_ver") < nomes.indexOf("nx_agenda_presenca"), "a etapa é lida ANTES de gravar");
    assert.deepEqual(T.reg.chamadas.find(c => c.nome === "nx_agenda_presenca").p, { p_negocio: 801, p_estado: "faltou" });
    assert.equal(faltou().getAttribute("aria-pressed"), "true", "a tela mostra a marca na hora");
    assert.equal(T.reg.desfazer.length, 1);
    assert.equal(T.reg.desfazer[0].texto, "Mariana Costa · faltou · foi para a etapa de faltas");
    T.reg.chamadas.length = 0;
    await T.reg.desfazer[0].reverter();
    await esperar(6);
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome !== "nx_agenda_dia").map(c => [c.nome, c.p]), [
      ["nx_agenda_presenca", { p_negocio: 801, p_estado: "limpar" }],
      ["nx_negocio_mover", { p_id: 801, p_estagio: "s3", p_ordem: 2, p_extra: {} }]], "Desfazer = «limpar» + a etapa de antes");
    assert.equal(faltou().getAttribute("aria-pressed"), "false");
    // marcada «compareceu»: tocar de novo limpa (sem ler etapa) e o Desfazer devolve «compareceu»
    T.dados.consultas[0].presenca = "compareceu";
    T.alvo.querySelector(".agenda-atualizar").click();
    await esperar(10);
    const comp = T.alvo.querySelector('.ag-painel-li[data-negocio="801"] .ag-pres-compareceu');
    assert.equal(comp.getAttribute("aria-pressed"), "true");
    T.reg.chamadas.length = 0; T.reg.desfazer.length = 0;
    comp.click();
    await esperar(10);
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome !== "nx_agenda_dia").map(c => [c.nome, c.p.p_estado]), [["nx_agenda_presenca", "limpar"]]);
    assert.equal(T.reg.desfazer[0].texto, "Presença de Mariana Costa limpa");
    T.reg.chamadas.length = 0;
    await T.reg.desfazer[0].reverter();
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome === "nx_agenda_presenca").map(c => c.p.p_estado), ["compareceu"]);
  } finally { T.sair(); }
});

test("E1 · servidor antigo: linha sem `presenca` → a ficha diz (nx_negocio_ver.campos.presenca); sem a RPC de presença, os botões somem", async () => {
  const dia = passadaSeg();
  const semCampo = consultaEm(dia, "10:00");     // sem a chave `presenca` (migração antiga)
  const rpc = async nome => (nome === "nx_negocio_ver" ? { negocio: { id: 801, estagio_id: "s3", campos: { presenca: "compareceu" } } } : undefined);
  const T = await montarAgenda({ data: dia, modo: "dia", consultas: [semCampo], rpc });
  try {
    await esperar(6);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_negocio_ver").length, 1, "uma leitura da ficha por consulta");
    assert.equal(T.alvo.querySelector(".ag-pres-compareceu").getAttribute("aria-pressed"), "true", "o estado vem de campos.presenca");
    T.alvo.querySelector('.seg [data-valor="dia"]').click();   // redesenhar não lê de novo
    await esperar(6);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_negocio_ver").length, 1);
  } finally { T.sair(); }
  // a função ainda não existe no servidor (404 / PGRST202): avisa uma vez e os botões somem
  const T2 = await montarAgenda({ data: dia, modo: "dia", consultas: [consultaEm(dia, "10:00", { presenca: null })],
    rpc: async nome => (nome === "nx_agenda_presenca" ? Promise.reject(Object.assign(new Error("PGRST202"), { codigo: "PGRST202", status: 404 })) : undefined) });
  try {
    T2.alvo.querySelector(".ag-pres-compareceu").click();
    await esperar(8);
    assert.match(T2.reg.toasts.at(-1), /ainda não registra a presença/);
    assert.equal(T2.alvo.querySelector(".ag-pres"), null);
    assert.equal(T2.reg.desfazer.length, 0);
  } finally { T2.sair(); }
});

const presencaAtiva = X => [...X.reg.ativos].filter(c => c.id === "agenda.presenca");
test("E1 · paleta: abrir uma consulta passada registra «agenda.presenca»; o comando abre a janela e grava; consulta futura e sair da tela tiram o comando", async () => {
  const dia = passadaSeg(), fut = futuraSeg();
  const T = await montarAgenda({ data: dia, modo: "dia", consultas: [consultaEm(dia, "10:00", { presenca: null }), consultaEm(fut, "10:00", { negocio_id: 802, presenca: null })],
    modal: o => (o.titulo === "Presença da consulta" ? "faltou" : null), rpc: async (nome, p) => (nome === "nx_agenda_presenca" ? { ok: true, presenca: p.p_estado, estagio_id: null } : nome === "nx_negocio_ver" ? { negocio: { estagio_id: "s3" } } : undefined) });
  try {
    assert.equal(presencaAtiva(T).length, 0, "sem consulta selecionada, sem comando");
    T.alvo.querySelector(".ag-painel-item").click();
    const pop = T.reg.pops.at(-1);
    assert.ok(pop.querySelector(".ag-pres"), "o detalhe também traz «Compareceu / Faltou»");
    const cmd = presencaAtiva(T)[0];
    assert.equal(cmd.id, "agenda.presenca");
    assert.equal(cmd.rotulo, undefined, "rótulo, grupo e ícone vêm de comandos.COMANDOS_CONHECIDOS");
    T.reg.chamadas.length = 0;
    await cmd.fazer();
    await esperar(6);
    const janela = T.reg.modais.at(-1);
    assert.equal(janela.titulo, "Presença da consulta");
    assert.deepEqual(janela.acoes.map(a => a.valor), [null, "faltou", "compareceu"], "sem marca: sem «Limpar marcação»");
    assert.deepEqual(T.reg.chamadas.find(c => c.nome === "nx_agenda_presenca").p, { p_negocio: 801, p_estado: "faltou" });
    A.desmontar();
    assert.equal(T.reg.ativos.size, 0, "sair da tela tira os comandos (o da presença também)");
  } finally { T.sair(); }
  // abrir uma consulta em que não cabe presença (concluída, sem marca) tira o comando
  const T2 = await montarAgenda({ data: dia, modo: "dia", consultas: [consultaEm(dia, "10:00", { presenca: null }), consultaEm(dia, "11:00", { negocio_id: 802, status: "ganho", presenca: null })] });
  try {
    T2.alvo.querySelector('.ag-painel-li[data-negocio="801"] .ag-painel-item').click();
    assert.equal(presencaAtiva(T2).length, 1);
    T2.alvo.querySelector('.ag-painel-li[data-negocio="802"] .ag-painel-item').click();
    assert.equal(presencaAtiva(T2).length, 0);
    assert.equal(T2.reg.pops.at(-1).querySelector(".ag-pres"), null);
  } finally { T2.sair(); }
});

/* ============================================================ E2 · servidor no lugar da inferência */
test("E2 · `encaixe` do servidor substitui a inferência; sem o campo, a inferência continua", () => {
  const seg = "2026-10-05";
  const cedo = { inicio: `${seg}T07:00:00-03:00`, fim: `${seg}T07:30:00-03:00` };
  const normal = { inicio: `${seg}T09:00:00-03:00`, fim: `${seg}T09:30:00-03:00` };
  assert.equal(A.classificarConsulta(cedo, cfgSemana).encaixe, true, "sem o campo: fora do horário = encaixe (inferido)");
  assert.equal(A.classificarConsulta({ ...cedo, encaixe: false }, cfgSemana).encaixe, false, "o servidor diz que não é encaixe");
  assert.equal(A.classificarConsulta({ ...normal, encaixe: true }, cfgSemana).encaixe, true, "marcada como encaixe dentro do horário");
  const dupla = { inicio: `${seg}T09:15:00-03:00`, fim: `${seg}T09:45:00-03:00`, encaixe: false };
  assert.equal(A.classificarConsulta(dupla, cfgSemana, { vizinhas: [normal, dupla] }).encaixe, false, "a capacidade não sobrepõe o que o servidor disse");
  const r = A.resumoDoDia([{ ...cedo, encaixe: false }, { ...normal, encaixe: true }], seg, cfgSemana);
  assert.equal(r.encaixes, 1);
});

test("E2 · `dono_nome` do servidor: nomes, legenda e colunas sem ler a base do CRM; linha sem o campo ainda lê a base", async () => {
  assert.deepEqual(A.nomesDasConsultas([{ dono_id: "u1", dono_nome: " Dra. Helena " }, { dono_id: "u2", dono_nome: null }, { dono_id: null, dono_nome: "x" }]), { u1: "Dra. Helena" });
  assert.equal(A.faltamNomes([{ dono_id: "u1", dono_nome: null }]), false, "o campo veio (mesmo nulo): servidor novo");
  assert.equal(A.faltamNomes([{ dono_id: "u1" }]), true);
  assert.equal(A.faltamNomes([{ servico: "x" }]), false);
  assert.equal(A.corDaConsulta({ dono_id: "u9", dono_nome: "Dr. Caio" }, "profissional").rotulo, "Dr. Caio", "sem o mapa, vale o dono_nome da linha");
  const fut = futuraSeg();
  const consultas = [consultaEm(fut, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(fut, "10:00", { negocio_id: 802, dono_id: "u2", dono_nome: "Ana Paula" })];
  const T = await montarAgenda({ data: fut, modo: "dia", consultas });
  try {
    assert.equal(T.reg.carregarCrm, 0, "nenhuma leitura da base do CRM");
    assert.deepEqual(T.alvo.querySelectorAll(".ag-dono-nome").map(e => e.textContent), ["Dra. Helena", "Ana Paula"], "colunas por responsável já com o nome");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: fut, modo: "dia", consultas: consultas.map(({ dono_nome, ...c }) => c) });
  try { assert.ok(T2.reg.carregarCrm >= 1, "servidor antigo: a base do CRM dá os nomes"); } finally { T2.sair(); }
});

/* ============================================================ E3 · próxima consulta fora do período */
test("E3 · funções: início da busca (dia seguinte ao período, hoje se o período passou, nada se é futuro) e rótulos", () => {
  assert.equal(A.inicioBuscaProxima("2026-10-05", 7, "2026-10-09"), "2026-10-12", "semana atual: a segunda seguinte");
  assert.equal(A.inicioBuscaProxima("2026-10-09", 1, "2026-10-09"), "2026-10-10", "dia de hoje: amanhã");
  assert.equal(A.inicioBuscaProxima("2026-09-14", 7, "2026-10-09"), "2026-10-09", "semana passada: a partir de hoje");
  assert.equal(A.inicioBuscaProxima("2026-10-12", 7, "2026-10-09"), null, "período futuro: não busca");
  assert.equal(A.inicioBuscaProxima("x", 7, "2026-10-09"), null);
  const agora = Date.parse("2026-10-09T09:00:00-03:00");   // sexta
  const k = (dia, hh) => ({ inicio: `${dia}T${hh}:00-03:00` });
  assert.equal(A.rotuloProximaFora(k("2026-10-10", "10:00"), agora, "2026-10-09"), "amanhã às 10:00");
  assert.equal(A.rotuloProximaFora(k("2026-10-15", "14:00"), agora, "2026-10-09"), "quinta às 14:00", "até 6 dias: o nome do dia");
  assert.equal(A.rotuloProximaFora(k("2026-10-16", "14:00"), Date.parse("2026-10-12T09:00:00-03:00"), "2026-10-12"), "sexta às 14:00");
  assert.equal(A.rotuloProximaFora(k("2026-10-12", "08:30"), agora, "2026-10-09"), "segunda às 08:30");
  assert.equal(A.rotuloProximaFora(k("2026-10-11", "08:30"), agora, "2026-10-09"), "domingo às 08:30");
  assert.equal(A.rotuloProximaFora(k("2026-10-16", "14:00"), agora, "2026-10-09"), "sex 16/10 às 14:00", "7 dias ou mais: com a data");
  assert.equal(A.rotuloProximaFora(k("2026-10-09", "09:25"), agora, "2026-10-09"), "em 25 min · 09:25");
  assert.equal(A.rotuloProximaFora({ inicio: "x" }, agora, "2026-10-09"), "");
  assert.equal(A.textoSemProxima({ umDia: false, desde: "2026-10-12", hojeISO: "2026-10-09" }), "Nenhuma consulta por vir nesta semana nem nos 7 dias seguintes.");
  assert.equal(A.textoSemProxima({ umDia: true, desde: "2026-10-10", hojeISO: "2026-10-09" }), "Nenhuma consulta por vir neste dia nem nos 7 dias seguintes.");
  assert.equal(A.textoSemProxima({ desde: "2026-10-09", hojeISO: "2026-10-09" }), "Nenhuma consulta nos próximos 7 dias.");
});

test("E3 · tela: sem próxima no período, UMA leitura de 7 dias a partir do dia seguinte (guardada); o chip leva até lá; «Atualizar» relê", async () => {
  const hoje = hojeSP(), seg = A.segundaDe(hoje), proxSeg = A.diaISO(seg, 7);
  const alvoDia = A.diaISO(proxSeg, 2);     // quarta da semana seguinte
  const T = await montarAgenda({ data: hoje, modo: "semana", consultas: [consultaEm(alvoDia, "14:00", { nome: "Rafael Souza" })] });
  try {
    await esperar(6);
    const fora = T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === proxSeg && c.p.p_dias === 7);
    assert.equal(fora.length, 1, "uma leitura dos 7 dias seguintes ao fim da semana");
    const chip = T.alvo.querySelector("button.agenda-proxima-fora");
    assert.ok(chip, "o chip da próxima aparece");
    assert.match(chip.textContent, /^PróximaRafael Souza/);
    assert.equal(chip.querySelector(".agenda-proxima-quando").textContent, A.rotuloProximaFora(T.dados.consultas[0], Date.now(), hoje));
    // redesenhar (legenda, outro dia da mesma semana) não lê de novo
    T.alvo.querySelector('.seg [data-valor="semana"]').click();
    await esperar(6);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === proxSeg).length, 1, "guardada por período");
    // «Atualizar» relê (pode ter mudado)
    T.alvo.querySelector(".agenda-atualizar").click();
    await esperar(10);
    assert.equal(T.reg.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.p.p_data === proxSeg).length, 2);
    // tocar o chip leva à semana dela e foca o bloco
    T.alvo.querySelector("button.agenda-proxima-fora").click();
    await esperar(10);
    const bloco = T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco');
    assert.ok(bloco, "a semana da próxima está na tela");
    assert.equal(T.D.estado.ativo, bloco, "o foco vai para o bloco dela");
  } finally { T.sair(); }
  // nada nos 7 dias seguintes: o texto diz o que foi olhado
  const T2 = await montarAgenda({ data: hoje, modo: "semana", consultas: [] });
  try {
    await esperar(6);
    assert.equal(T2.alvo.querySelector(".agenda-proxima").textContent, "Nenhuma consulta por vir nesta semana nem nos 7 dias seguintes.");
  } finally { T2.sair(); }
  // período futuro: não busca (a próxima de verdade pode vir antes dele)
  const T3 = await montarAgenda({ data: futuraSeg(), modo: "semana", consultas: [] });
  try {
    await esperar(6);
    assert.equal(T3.reg.chamadas.filter(c => c.nome === "nx_agenda_dia").length, 1, "só a leitura do período");
    assert.equal(T3.alvo.querySelector(".agenda-proxima").textContent, "Semana livre — nenhuma consulta marcada.");
  } finally { T3.sair(); }
  // período passado: a busca começa hoje
  const T4 = await montarAgenda({ data: passadaSeg(), modo: "semana", consultas: [] });
  try {
    await esperar(6);
    assert.ok(T4.reg.chamadas.some(c => c.nome === "nx_agenda_dia" && c.p.p_data === hoje && c.p.p_dias === 7));
    assert.equal(T4.alvo.querySelector(".agenda-proxima").textContent, "Nenhuma consulta nos próximos 7 dias.");
  } finally { T4.sair(); }
});

/* ============================================================ E4 · mini-calendário a 360 px */
test("E4 · a 360 px (miolo de 326 px do diálogo) o mini-calendário fica no miolo com vão de 2 px: 7 dias de 44 px ou mais", () => {
  const css = ler("agenda.css");
  const i = css.indexOf("@media (width <= 360px) {");
  assert.ok(i > css.indexOf("@media (max-width: 760px) {"), "a regra de 360 px vem depois da de 760 px (vence na cascata)");
  const bloco = css.slice(i, css.indexOf("}\n}", i) + 3);
  assert.match(bloco, /\.ag-mes-compacto \{ margin-inline: 0; \}/, "sem avançar sobre o respiro (senão passa da janela)");
  const vao = Number((/\.ag-mes-compacto \.ag-mes-sem, \.ag-mes-compacto \.ag-mes-grade \{ gap: (\d+)px; \}/.exec(bloco) || [])[1]);
  assert.ok(vao <= 2, "vão ≤ 2 px");
  assert.ok((326 - 6 * vao) / 7 >= 44, `cada dia com ${((326 - 6 * vao) / 7).toFixed(1)} px`);
});

/* ============================================================ E5 · check, esqueleto e vazio */
test("E5 · carregando: grade + cartão do painel no «Dia»; dia vazio no painel usa ui.vazio({tema: \"agenda\"}) com «Marcar consulta»", async () => {
  const fut = futuraSeg();
  const T = await montarAgenda({ data: fut, modo: "dia", consultas: [] });
  try {
    assert.deepEqual(T.reg.esqueletos.slice(0, 2), ["agenda", "cartao"], "a forma da grade e a do painel");
    const v = T.reg.vazios.at(-1);
    assert.equal(v.tema, "agenda"); assert.equal(v.titulo, "Nenhuma consulta neste dia.");
    assert.ok(T.alvo.querySelector('.ag-painel-vazio-tema .vazio[data-tema="agenda"]'));
    T.alvo.querySelector(".ag-painel-vazio-tema .bt-prim").click();
    await esperar(4);
    assert.equal(T.reg.modais.at(-1).titulo, "Marcar consulta", "a ação do vazio marca no dia");
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: fut, modo: "semana", consultas: [] });
  try { assert.deepEqual(T2.reg.esqueletos, ["agenda"], "na semana, só a grade"); } finally { T2.sair(); }
});

test("E5 · remarcar pelo arrasto: depois de reler, o bloco no horário novo confirma com ui.checkSucesso; a janela de marcar faz o mesmo", async () => {
  const seg = futuraSeg();
  const confirmar = async o => { const ac = o.acoes.find(a => a.tipo === "primario"); return ac.fn({ erro: t => { throw new Error(t); } }); };
  const rpc = async (nome, p, d) => {
    if (nome === "nx_agenda_marcar") { d.consultas = d.consultas.map(c => (c.negocio_id === p.p_negocio ? { ...c, inicio: p.p_inicio } : c)); return { ok: true, remarcada: true, consulta: { inicio: p.p_inicio } }; }
    return undefined;
  };
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { marco: "agendada" })], rpc, modal: confirmar });
  try {
    const bt = T.alvo.querySelector(".ag-bloco.ag-arrastavel");
    const col = bt.closest(".ag-col");
    col.getBoundingClientRect = () => ({ top: 0, left: 0, width: 140, height: 1000, right: 140, bottom: 1000 });
    globalThis.document.elementFromPoint = () => col;
    bt.dispatchEvent(T.D.evento("pointerdown", { button: 0, pointerType: "mouse", pointerId: 7, clientX: 50, clientY: 200 }));
    bt.dispatchEvent(T.D.evento("pointermove", { pointerId: 7, clientX: 50, clientY: 400 }));
    bt.dispatchEvent(T.D.evento("pointerup", { pointerId: 7 }));
    await esperar(16);
    assert.equal(T.reg.checks.length, 1, "um check");
    const [el, o] = T.reg.checks[0];
    assert.ok(el.classList.contains("ag-bloco") && el.closest(".ag-item").dataset.negocio === "801", "no bloco da consulta remarcada");
    assert.equal(o.texto, "Consulta remarcada");
    assert.ok(A.partesSP(T.dados.consultas[0].inicio).min === 12 * 60, "o bloco é o do horário novo (12:00)");
  } finally { T.sair(); }
  const js = ler("agenda.js");
  assert.ok(/aoMudar: aoMarcado \}\)/.test(js) && /if \(vivo && r && r\.ok\) confirmarNoBloco\(/.test(js), "a janela (marcar/remarcar) confirma no bloco depois de reler; o Desfazer (null) só relê");
});

/* ============================================================ E6 · «Lembrar» */
test("E6 · texto do lembrete, a conversa do contato e o rascunho (rascunho.js de verdade): guarda sem enviar e nunca sobrescreve", () => {
  const hoje = "2026-10-09";
  assert.equal(A.textoLembrete({ nome: "Mariana Costa", servico: "Avaliação", inicio: "2026-10-10T10:00:00-03:00" }, hoje), "Olá, Mariana! Passando para lembrar da sua consulta (Avaliação) amanhã às 10:00. Podemos confirmar?");
  assert.equal(A.textoLembrete({ nome: "", inicio: "2026-10-09T16:30:00-03:00" }, hoje), "Olá! Passando para lembrar da sua consulta hoje às 16:30. Podemos confirmar?");
  assert.equal(A.textoLembrete({ nome: "Rafael", inicio: "2026-10-16T14:00:00-03:00" }, hoje), "Olá, Rafael! Passando para lembrar da sua consulta dia 16/10 (sexta) às 14:00. Podemos confirmar?");
  assert.equal(A.textoLembrete({ inicio: "x" }, hoje), "");
  assert.deepEqual(A.conversaDoContato([{ id: 1, status: "resolvida", aberta_em: "2026-10-01" }, { id: 2, status: "aberta", aberta_em: "2026-09-01" }]), { id: 2, status: "aberta", aberta_em: "2026-09-01" }, "a aberta");
  assert.equal(A.conversaDoContato([{ id: 1, status: "resolvida", aberta_em: "2026-09-01" }, { id: 3, status: "resolvida", aberta_em: "2026-10-01" }]).id, 3, "sem aberta, a mais recente");
  assert.equal(A.conversaDoContato([]), null); assert.equal(A.conversaDoContato(null), null);
  const st = memoria();
  const rasc = R.criarRascunhos({ storage: st, conta: () => "c1", cliente: () => "k1", doc: null, janela: null });
  const campo = () => { const { h } = criarDom(); return h("textarea"); };
  assert.equal(A.prepararRascunho(rasc, "conversa:901", "Olá!", campo), true);
  assert.equal(rasc.texto("conversa:901"), "Olá!", "o composer da conversa 901 abre com o texto");
  assert.equal(A.prepararRascunho(rasc, "conversa:901", "Outro texto", campo), false, "já havia rascunho: não sobrescreve");
  assert.equal(rasc.texto("conversa:901"), "Olá!");
  assert.equal(A.prepararRascunho(null, "conversa:1", "x", campo), false);
  assert.equal(A.prepararRascunho(rasc, "conversa:2", "", campo), false);
});

test("E6 · tela: «Lembrar» na consulta futura abre a conversa com o lembrete no campo — nada é enviado; com rascunho da pessoa, copia; sem conversa, a rota do contato", async () => {
  const fut = futuraSeg();
  const contato = conversas => async nome => (nome === "nx_contato_ver" ? { contato: { id: 501 }, conversas } : undefined);
  const abrirLembrar = async T => {
    T.alvo.querySelector('.ag-item[data-negocio="801"] .ag-bloco').click();
    const pop = T.reg.pops.at(-1);
    const bt = pop.querySelector(".ag-det-lembrar");
    assert.ok(bt, "o detalhe da consulta futura tem «Lembrar»");
    assert.equal(bt.textContent, "Lembrar");
    T.reg.chamadas.length = 0;
    bt.click();
    await esperar(8);
  };
  const st = memoria();
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], rpc: contato([{ id: 901, status: "aberta" }]), rascunhoStorage: st });
  try {
    await abrirLembrar(T);
    assert.deepEqual(T.reg.chamadas.map(c => c.nome), ["nx_contato_ver"], "só lê a ficha do contato: nenhuma chamada de envio");
    assert.deepEqual(T.reg.navegou, ["#/conversas/901"]);
    assert.equal(T.rascunho.texto("conversa:901"), A.textoLembrete(T.dados.consultas[0], T.hoje), "o composer abre com o lembrete");
    assert.equal(T.reg.toasts.at(-1), "Lembrete pronto no campo da conversa — confira e envie.");
    assert.equal(T.reg.copiados.length, 0);
    // a pessoa já tinha um rascunho lá: não sobrescreve, copia
    await abrirLembrar(T);
    assert.equal(T.reg.copiados.length, 1);
    assert.match(T.reg.toasts.at(-1), /já tinha um rascunho: o lembrete foi copiado/);
  } finally { T.sair(); }
  const T2 = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], rpc: contato([]) });
  try {
    await abrirLembrar(T2);
    assert.deepEqual(T2.reg.navegou, ["#/conversas?contato=501"], "sem conversa: a rota do contato (Conversas abre «Nova conversa»)");
    assert.equal(T2.reg.toasts.at(-1), "Lembrete copiado — cole na conversa e envie.");
  } finally { T2.sair(); }
  // consulta passada, concluída ou sem o módulo Conversas: sem «Lembrar»
  const pas = passadaSeg();
  const T3 = await montarAgenda({ data: pas, consultas: [consultaEm(pas, "10:00", { presenca: null })] });
  try { T3.alvo.querySelector(".ag-bloco").click(); assert.equal(T3.reg.pops.at(-1).querySelector(".ag-det-lembrar"), null); } finally { T3.sair(); }
  const T4 = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "10:00")], comConversas: false });
  try { T4.alvo.querySelector(".ag-bloco").click(); assert.equal(T4.reg.pops.at(-1).querySelector(".ag-det-lembrar"), null); } finally { T4.sair(); }
});

/* ============================================================ E7 · legenda por profissional com avatar */
test("E7 · legenda por profissional: ui.avatar pelo nome, na cor dos blocos (estável pelo id); «Sem responsável» e serviço sem avatar", async () => {
  const { h } = criarDom();
  const vistos = [];
  const avatar = (nome, id, img, o) => { vistos.push([nome, id, img, o]); return h("span", { class: "avatar", style: { "--cor": "var(--pal-0)" } }, nome[0]); };
  const itens = A.legendaDe([{ dono_id: "u1", dono_nome: "Dra. Helena" }, { dono_id: "u1" }, {}], { por: "profissional", nomes: { u1: "Dra. Helena" } });
  const el = A.montarLegenda({ h, itens, avatar });
  const chips = el.querySelectorAll(".ag-leg-chip");
  assert.deepEqual(vistos, [["Dra. Helena", "u1", null, { tamanho: "p" }]], "um avatar por profissional (não para «Sem responsável»)");
  const av = chips[0].querySelector(".avatar");
  assert.ok(av && av.classList.contains("ag-leg-av") && chips[0].classList.contains("ag-leg-pessoa"));
  assert.equal(av.style.getPropertyValue("--cor"), `var(--pal-${A.corDoResponsavel("u1")})`, "a mesma cor dos blocos dele");
  assert.equal(chips[0].querySelector(".ag-leg-cor"), null);
  assert.ok(chips[1].querySelector(".ag-leg-cor"), "«Sem responsável» fica com a amostra");
  const porServico = A.montarLegenda({ h, itens: A.legendaDe([{ servico: "Limpeza" }, { servico: "Implante" }]), avatar });
  assert.equal(porServico.querySelector(".avatar"), null, "por serviço: amostra de cor");
  // na tela: «Por profissional» liga os avatares
  const fut = futuraSeg();
  const T = await montarAgenda({ data: fut, consultas: [consultaEm(fut, "09:00", { dono_id: "u1", dono_nome: "Dra. Helena" }), consultaEm(A.diaISO(fut, 1), "10:00", { negocio_id: 802, servico: "Implante", dono_id: "u2", dono_nome: "Ana Paula" })] });
  try {
    assert.equal(T.alvo.querySelector(".ag-leg-av"), null, "por serviço (padrão): sem avatar");
    T.alvo.querySelector('.ag-legenda-por [data-valor="profissional"]').click();
    assert.deepEqual(T.alvo.querySelectorAll(".ag-leg-av").length, 2);
    assert.deepEqual(T.reg.avatares.map(a => a[0]).sort(), ["Ana Paula", "Dra. Helena"]);
  } finally { T.sair(); }
});

/* ============================================================ E8 · estilo das peças novas */
test("E8 · CSS das peças novas: tokens, sem transition: all, 44 px no toque, movimento reduzido e foco visível", () => {
  const css = ler("agenda.css");
  assert.ok(!/transition:\s*all\b/.test(css));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "nada de hex");
  assert.ok(!/font-size:\s*[\d.]+(px|rem|pt)/.test(css), "tamanho de letra só por token");
  const toque = css.slice(css.indexOf("@media (max-width: 760px), (pointer: coarse) {"));
  assert.match(toque.slice(0, toque.indexOf("\n}")), /\.ag-pres-bt \{ min-height: 44px; \}/, "44 px no toque");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.ag-pres-bt \{ transition: none; \}/, "movimento reduzido cobre os botões de presença");
  assert.ok(css.includes(".ag-pres-bt:focus-visible"), "foco visível");
  assert.match(css, /\.ag-pres-compareceu\[aria-pressed="true"\] \{[^}]*var\(--c-ok\)/);
  assert.match(css, /\.ag-pres-faltou\[aria-pressed="true"\] \{[^}]*var\(--c-ruim\)/);
  assert.match(css, /\.agenda-proxima-caixa \{ display: contents; \}/, "trocar o chip não mexe no layout do resumo");
  const js = ler("agenda.js");
  assert.ok(!/import\s.*from/.test(js), "sem import estático (o app carrega com ?v=)");
  assert.equal((js.match(/Lg\.escreverComReq\(api, "nx_agenda_marcar"/g) || []).length, 2, "marcar/remarcar continuam pelos mesmos dois caminhos");
});

test("integração · Desfazer devolve a consulta no MESMO estado: normal volta normal; qualquer recusa → encaixe; sem saber → encaixe", async () => {
  const chamadas = [];
  const api = resp => ({ rpcC: async (nome, args) => { chamadas.push({ nome, ...args }); return resp(args); } });
  let r = await A.voltarAoHorario(api(() => ({ ok: true })), 7, "2026-10-10T13:00:00Z", "Avaliação", false);
  assert.deepEqual(chamadas.map(c => c.p_encaixe), [false], "não era encaixe: volta normal, uma chamada só");
  assert.equal(r.ok, true);
  chamadas.length = 0;
  r = await A.voltarAoHorario(api(a => a.p_encaixe ? { ok: true, encaixe: true } : { ok: false, erro: "antecedencia_minima" }), 7, "2026-10-10T13:00:00Z", null, false);
  assert.deepEqual(chamadas.map(c => c.p_encaixe), [false, true], "recusada pela regra (desfazer em cima da hora): repete como encaixe");
  assert.equal(r.ok, true);
  chamadas.length = 0;
  r = await A.voltarAoHorario(api(a => a.p_encaixe ? { ok: true } : { ok: false, erro: "horario_ocupado" }), 7, "2026-10-10T13:00:00Z", null, false);
  assert.deepEqual(chamadas.map(c => c.p_encaixe), [false, true], "horário cheio por um encaixe marcado depois: a consulta que já estava lá volta como encaixe (revisão)");
  assert.equal(r.ok, true);
  chamadas.length = 0;
  await A.voltarAoHorario(api(() => ({ ok: true })), 7, "2026-10-10T13:00:00Z", null, true);
  await A.voltarAoHorario(api(() => ({ ok: true })), 7, "2026-10-10T13:00:00Z", null, undefined);
  assert.deepEqual(chamadas.map(c => c.p_encaixe), [true, true], "era encaixe (ou servidor antigo sem o campo): volta como encaixe");
});
