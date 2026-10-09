/* Plano «50 melhorias» · frente E (Agenda), 04/10/2026. Sem rede, sem navegador: as peças de tela recebem o `h` e são montadas num DOM
   mínimo (elementos com filhos, classes, dataset, ouvintes e seletores simples), como os testes vizinhos fazem. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const A = await import("../web/app/agenda.js");
const C = await import("../web/app/agenda-config.js");

/* ============================================================ DOM mínimo */
function criarDom() {
  const estado = { ativo: null };
  class Lista { constructor(el) { this.el = el; } add(...c) { for (const x of c) if (x && !this.el._cls.includes(x)) this.el._cls.push(x); } remove(...c) { this.el._cls = this.el._cls.filter(x => !c.includes(x)); } contains(c) { return this.el._cls.includes(c); } toggle(c, f) { const on = f === undefined ? !this.contains(c) : !!f; if (on) this.add(c); else this.remove(c); return on; } }
  class Estilo { constructor() { this.m = new Map(); } setProperty(k, v) { this.m.set(k, String(v)); } getPropertyValue(k) { return this.m.get(k) || ""; } }
  class Texto { constructor(t) { this.nodeType = 3; this.data = String(t); this.parentNode = null; } get textContent() { return this.data; } }
  const evento = (type, extra = {}) => ({ type, defaultPrevented: false, _parou: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._parou = true; }, ...extra });
  class El {
    constructor(tag) { this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.attrs = new Map(); this._cls = []; this.classList = new Lista(this); this.style = new Estilo(); this.dataset = {}; this.ouvintes = new Map(); this.parentNode = null; this.hidden = false; this.disabled = false; this.open = false; this._tab = null; }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get className() { return this._cls.join(" "); } set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
    get isConnected() { return true; }
    get tabIndex() { return this._tab === null ? (["BUTTON", "INPUT", "A"].includes(this.tagName) ? 0 : -1) : this._tab; } set tabIndex(v) { this._tab = Number(v); this.attrs.set("tabindex", String(v)); }
    setAttribute(k, v) { v = String(v); if (k === "class") { this.className = v; return; } if (k === "tabindex") this._tab = Number(v); if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v; this.attrs.set(k, v); }
    // data-*: o h põe no dataset (como o navegador espelha); o atributo e o seletor [data-x] leem de lá
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
    closest(sel) { let n = this; while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }   // aceita lista com vírgula («.ag-item, .ag-bloq»)
    matches(sel) { return sel.split(",").some(s => casaComposto(this, s.trim().split(/\s+/))); }
    querySelectorAll(sel) { const out = []; for (const parte of sel.split(",")) out.push(...descendentes(this).filter(el => casaComposto(el, parte.trim().split(/\s+/)))); return [...new Set(out)]; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  }
  function camelo(k) { return k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
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
  // o mesmo contrato do ui.h: class (texto ou lista), dataset, style (texto ou objeto), on:{evento: fn}, propriedades booleanas, qualquer atributo
  function h(tag, attrs, ...filhos) {
    const el = new El(tag);
    if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { filhos.unshift(attrs); attrs = null; }
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
      else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv); }
      else if (k === "on") { for (const [t, f] of Object.entries(v)) if (typeof f === "function") el.addEventListener(t, f); }
      else if (k === "style") { if (typeof v === "string") el.attrs.set("style", v); else for (const [p, val] of Object.entries(v)) if (val !== null && val !== undefined) el.style.setProperty(p, String(val)); }
      else if (k === "text") el.textContent = String(v);
      else if (["hidden", "disabled", "open", "value", "checked"].includes(k)) { el[k] = v; if (v === true) el.attrs.set(k, ""); }
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    anexar(el, filhos);
    return el;
  }
  return { h, evento, estado };
}

const cfg = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1 };
const c = (inicio, fim, extra = {}) => ({ inicio, fim, ...extra });   // horários no fuso de São Paulo

/* ============================================================ 39 · cor por serviço ou profissional + legenda */
test("39: cor por profissional é estável e se espalha; a chave/legenda muda com o critério", () => {
  const a = A.corDoResponsavel("f1000000-0000-4000-8000-000000000003");
  assert.ok(Number.isInteger(a) && a >= 0 && a <= 11);
  assert.equal(A.corDoResponsavel("f1000000-0000-4000-8000-000000000003"), a, "mesmo id, mesma cor");
  assert.equal(A.corDoResponsavel(""), 6); assert.equal(A.corDoResponsavel(null), 6);
  const cores = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(A.corDoResponsavel));
  assert.ok(cores.size >= 5, "as cores se espalham pela paleta");
  const k = { servico: "Limpeza", dono_id: "u1" };
  assert.deepEqual(A.corDaConsulta(k, "servico"), { chave: "s:limpeza", cor: A.corDoProcedimento("Limpeza"), rotulo: "Limpeza" });
  assert.deepEqual(A.corDaConsulta(k, "profissional", { u1: "Dra. Helena" }), { chave: "p:u1", cor: A.corDoResponsavel("u1"), rotulo: "Dra. Helena" });
  assert.equal(A.corDaConsulta({ servico: "LIMPEZA " }, "servico").chave, "s:limpeza", "a chave ignora caixa e espaços");
  assert.deepEqual(A.corDaConsulta({}, "profissional"), { chave: "p:sem", cor: 6, rotulo: "Sem responsável" });
  assert.deepEqual(A.corDaConsulta({}, "servico"), { chave: "s:", cor: 3, rotulo: "Sem serviço" });
});

test("39: legenda em ordem de frequência, «Outros» acima do máximo e alternância do destaque", () => {
  const itens = [{ servico: "Limpeza" }, { servico: "Implante" }, { servico: "Limpeza" }, { servico: "Avaliação" }, { servico: "Limpeza" }, { servico: "Implante" }];
  const leg = A.legendaDe(itens);
  assert.deepEqual(leg.map(x => [x.rotulo, x.n]), [["Limpeza", 3], ["Implante", 2], ["Avaliação", 1]]);
  assert.deepEqual(A.legendaDe([]), []);
  const muitos = A.legendaDe(Array.from({ length: 10 }, (_, i) => ({ servico: `S${i}` })), { max: 3 });
  assert.equal(muitos.length, 4);
  assert.equal(muitos[3].chave, "outros"); assert.equal(muitos[3].n, 7); assert.equal(muitos[3].cor, null); assert.equal(muitos[3].chaves.length, 7);
  let ativos = new Set();
  ativos = A.alternarLegenda(ativos, leg[0]); assert.deepEqual([...ativos], ["s:limpeza"]);
  ativos = A.alternarLegenda(ativos, leg[1]); assert.deepEqual([...ativos].sort(), ["s:implante", "s:limpeza"]);
  ativos = A.alternarLegenda(ativos, leg[0]); assert.deepEqual([...ativos], ["s:implante"], "tocar de novo desliga");
  ativos = A.alternarLegenda(new Set(), muitos[3]); assert.equal(ativos.size, 7, "«Outros» liga todas as suas chaves");
  assert.equal(A.alternarLegenda(ativos, muitos[3]).size, 0, "e desliga todas de uma vez");
});

test("39: a legenda na tela — chips com aria-pressed, toque chama aoAlternar com o item, «Mostrar todas» só com destaque ligado", () => {
  const { h } = criarDom();
  const itens = A.legendaDe([{ servico: "Limpeza" }, { servico: "Implante" }, { servico: "Limpeza" }]);
  const vistos = [];
  let el = A.montarLegenda({ h, itens, ativos: new Set(), aoAlternar: it => vistos.push(it) });
  const chips = el.querySelectorAll(".ag-leg-chip");
  assert.equal(chips.length, 2, "sem destaque não há «Mostrar todas»");
  assert.deepEqual(chips.map(x => x.getAttribute("aria-pressed")), ["false", "false"]);
  assert.equal(chips[0].dataset.chave, "s:limpeza");
  assert.equal(chips[0].querySelector(".ag-leg-cor").style.getPropertyValue("--cor-bloco"), `var(--pal-${A.corDoProcedimento("Limpeza")})`);
  assert.equal(chips[0].querySelector(".ag-leg-n").textContent, "2");
  chips[1].click();
  assert.equal(vistos[0], itens[1]);
  el = A.montarLegenda({ h, itens, ativos: new Set(["s:implante"]), aoAlternar: it => vistos.push(it) });
  assert.deepEqual(el.querySelectorAll(".ag-leg-chip").map(x => x.getAttribute("aria-pressed")), ["false", "true", null]);
  const limpar = el.querySelector(".ag-leg-limpar");
  assert.equal(limpar.textContent, "Mostrar todas");
  limpar.click();
  assert.equal(vistos[1], null, "limpar chama aoAlternar(null)");
});

/* ============================================================ 40 · ocupação por dia */
test("40: ocupação do dia = minutos marcados sobre o expediente (faixas − pausas × simultâneos); fechado e estimado", () => {
  const seg = "2026-10-05";   // segunda: 08–18 com almoço = 540 min
  const consultas = [c(`${seg}T09:00:00-03:00`, `${seg}T09:45:00-03:00`), c(`${seg}T14:00:00-03:00`, `${seg}T14:45:00-03:00`), c("2026-10-06T09:00:00-03:00", "2026-10-06T10:00:00-03:00")];
  const oc = A.ocupacaoDoDia(consultas, seg, cfg);
  assert.deepEqual({ n: oc.n, marcados: oc.marcados, capacidade: oc.capacidade, estimada: oc.estimada, fechado: oc.fechado }, { n: 2, marcados: 90, capacidade: 540, estimada: false, fechado: false });
  assert.ok(Math.abs(oc.pct - 90 / 540) < 1e-9);
  assert.equal(A.ocupacaoDoDia(consultas, seg, { ...cfg, capacidade: 2 }).capacidade, 1080, "dois atendimentos ao mesmo tempo dobram a capacidade");
  const dom = A.ocupacaoDoDia(consultas, "2026-10-04", cfg);
  assert.equal(dom.fechado, true); assert.equal(dom.pct, null);
  const semCfg = A.ocupacaoDoDia(consultas, seg, null);
  assert.equal(semCfg.estimada, true); assert.equal(semCfg.capacidade, 600); assert.ok(semCfg.pct > 0);
  assert.equal(A.ocupacaoDoDia([c(`${seg}T08:00:00-03:00`, `${seg}T20:00:00-03:00`)], seg, cfg).pct, 1, "nunca passa de 100 %");
  assert.equal(A.ocupacaoDoPeriodo(consultas, ["2026-10-04"], cfg), null, "só dias fechados: sem média");
  assert.ok(Math.abs(A.ocupacaoDoPeriodo(consultas, [seg, "2026-10-06"], cfg) - (90 / 540 + 60 / 540) / 2) < 1e-9);
});

test("40: níveis e textos de ocupação; o anel preenche a fração", () => {
  assert.deepEqual([null, 0, .1, .34, .35, .69, .7, .94, .95, 1].map(A.nivelOcupacao), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(A.textoOcupacao({ pct: .5, fechado: false, estimada: false }), "50% ocupado");
  assert.equal(A.textoOcupacao({ pct: .5, fechado: false, estimada: true }), "50% ocupado (estimado)");
  assert.equal(A.textoOcupacao({ pct: null, fechado: true }), "fechado");
  assert.equal(A.textoOcupacao({ pct: null, fechado: false }), "");
  const { h } = criarDom();
  const anel = A.anelOcupacao(h, { pct: .5 }, { tamanho: 36 });
  assert.equal(anel.tagName, "SVG"); assert.ok(anel.classList.contains("ag-ocup-2"));
  const traco = anel.querySelector(".ag-anel-valor").getAttribute("stroke-dasharray").split(" ").map(Number);
  assert.ok(Math.abs(traco[0] / traco[1] - .5) < 1e-3, "metade do perímetro");
  assert.ok(A.anelOcupacao(h, { pct: null }).classList.contains("ag-ocup-0"));
  assert.equal(A.anelOcupacao(h, { pct: 1 }).getAttribute("aria-hidden"), "true");
});

/* ============================================================ 41 · arrastar para remarcar */
test("41: só mouse, só desktop, só quem pode e só consulta futura não concluída", () => {
  const agora = Date.parse("2026-10-04T12:00:00-03:00");
  const futura = { inicio: "2026-10-05T10:00:00-03:00", status: "aberto" };
  const base = { pointerType: "mouse", movel: false, pode: true, consulta: futura, agora };
  assert.equal(A.podeArrastar(base), true);
  assert.equal(A.podeArrastar({ ...base, pointerType: "touch" }), false, "no toque não há arrasto");
  assert.equal(A.podeArrastar({ ...base, pointerType: "pen" }), false);
  assert.equal(A.podeArrastar({ ...base, movel: true }), false, "no celular não há arrasto");
  assert.equal(A.podeArrastar({ ...base, pode: false }), false);
  assert.equal(A.podeArrastar({ ...base, consulta: { ...futura, status: "ganho" } }), false, "concluída não se move");
  assert.equal(A.podeArrastar({ ...base, consulta: { inicio: "2026-10-04T09:00:00-03:00", status: "aberto" } }), false, "já passou");
  assert.equal(A.podeArrastar({ ...base, consulta: null }), false);
});

test("41: o destino do arrasto cai no passo, desconta onde o bloco foi pego e fica dentro do eixo", () => {
  const eixo = { ini: 8, fim: 18 };
  assert.deepEqual(A.alvoDoArrasto({ fracao: .5, eixo, passo: 30, duracao: 45 }), { min: 780, hora: "13:00" });
  assert.deepEqual(A.alvoDoArrasto({ fracao: .5, eixo, passo: 15, duracao: 45, pegouEm: 20 }), { min: 765, hora: "12:45" }, "pegou o bloco 20 min abaixo do topo");
  assert.deepEqual(A.alvoDoArrasto({ fracao: .33, eixo, passo: 30, duracao: 30 }), { min: 690, hora: "11:30" }, "11:18 arredonda para 11:30");
  assert.deepEqual(A.alvoDoArrasto({ fracao: 0, eixo, passo: 30, duracao: 30, pegouEm: 60 }), { min: 480, hora: "08:00" }, "nunca antes do eixo");
  assert.deepEqual(A.alvoDoArrasto({ fracao: 1, eixo, passo: 30, duracao: 60 }), { min: 1020, hora: "17:00" }, "o bloco inteiro cabe até o fim do eixo");
  assert.deepEqual(A.alvoDoArrasto({ fracao: 2, eixo, passo: 30, duracao: 30 }), { min: 1050, hora: "17:30" });
  const k = { inicio: "2026-10-05T10:00:00-03:00" };
  assert.equal(A.destinoMudou(k, "2026-10-05", "10:00"), false, "soltar no mesmo lugar não remarca");
  assert.equal(A.destinoMudou(k, "2026-10-05", "10:30"), true);
  assert.equal(A.destinoMudou(k, "2026-10-06", "10:00"), true);
});

test("41: o arrasto grava pelo mesmo caminho da janela (escreverComReq + p_req) e o Desfazer volta como encaixe", () => {
  const js = ler("agenda.js");
  assert.equal((js.match(/Lg\.escreverComReq\(api, "nx_agenda_marcar"/g) || []).length, 2, "janela + arrasto");
  assert.ok(/const req = Lg\.novaReq\(\);/.test(js) && /\{ req, aoStatus:/.test(js), "o p_req é fixo durante a confirmação do arrasto (repetir não marca duas vezes)");
  assert.equal((js.match(/api\.rpcC\("nx_agenda_marcar", \{[^}]*p_encaixe: true \}\)/g) || []).length, 1, "só voltarAoHorario marca de volta como encaixe");
  assert.equal((js.match(/await voltarAoHorario\(api,/g) || []).length, 3, "o Desfazer da janela, o do arrasto e o de desmarcar usam a mesma volta");
  assert.ok(/ev\.pointerType/.test(js) && /setPointerCapture/.test(js) && /elementFromPoint/.test(js), "arrasto por pointer events com captura");
  assert.ok(/ev\.key === "Escape" && arrasto/.test(js), "Esc cancela o arrasto");
  assert.ok(/ignorarClique = true/.test(js), "o clique que fecha o arrasto não abre o detalhe");
  assert.ok(/limparArrasto\(\);\s*document\.removeEventListener\("keydown", aoTeclaAgenda\)/.test(js), "sair da tela encerra um arrasto pendente");
  const css = ler("agenda.css");
  assert.ok(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.ag-bloco\.ag-arrastavel \{ cursor: grab; \}/.test(css), "cursor de arrasto só com mouse");
  assert.ok(/\.ag-item\.ag-fantasma \{[^}]*pointer-events: none/.test(css), "o fantasma não rouba o alvo do ponteiro");
  assert.ok(/\.ag-fantasma-ruim \.ag-bloco \{ --cor-bloco: var\(--c-ruim\); \}/.test(css), "destino inválido fica vermelho");
});

/* ============================================================ 42 · próxima consulta e linha do agora */
test("42: a próxima consulta é a primeira que ainda não começou (nunca a concluída); rótulo relativo", () => {
  const agora = Date.parse("2026-10-04T10:00:00-03:00");
  const itens = [c("2026-10-04T09:00:00-03:00", null, { n: 1 }), c("2026-10-04T10:25:00-03:00", null, { n: 2 }), c("2026-10-04T10:10:00-03:00", null, { n: 3, status: "ganho" }), c("2026-10-05T09:00:00-03:00", null, { n: 4 })];
  assert.equal(A.proximaConsulta(itens, agora).n, 2);
  assert.equal(A.proximaConsulta([itens[0]], agora), null);
  assert.equal(A.proximaConsulta([], agora), null); assert.equal(A.proximaConsulta(null, agora), null);
  assert.equal(A.rotuloProxima(itens[1], agora, "2026-10-04"), "em 25 min · 10:25");
  assert.equal(A.rotuloProxima(c("2026-10-04T13:00:00-03:00"), agora, "2026-10-04"), "em 3 h · 13:00");
  assert.equal(A.rotuloProxima(itens[3], agora, "2026-10-04"), "amanhã às 09:00");
  assert.equal(A.rotuloProxima(c("2026-10-07T14:30:00-03:00"), agora, "2026-10-04"), "qua 07/10 às 14:30");
  const js = ler("agenda.js"), css = ler("agenda.css");
  assert.ok(/class: \["ag-item", ehProxima && "ag-proxima"/.test(js) && /class: "ag-proxima-selo"/.test(js), "o bloco da próxima ganha anel e selo");
  assert.ok(/class: "ag-agora-rot dado"/.test(js) && /el\.textContent = horaTxt\(n\.min\);/.test(js), "a linha de agora tem o rótulo da hora, atualizado com ela");
  assert.ok(/\.ag-agora-rot \{[^}]*top: calc\(var\(--t, 0\) \* var\(--h-hora\)\)/.test(css));
});

/* ============================================================ 43 · visão mês */
test("43: a grade do mês tem 6 semanas de segunda a domingo; limites do mês e teclado", () => {
  const g = A.gradeDoMes("2026-10-15");
  assert.equal(g.length, 42);
  assert.equal(g[0].iso, "2026-09-28"); assert.equal(A.diaDaSemana(g[0].iso), 1, "começa numa segunda");
  assert.equal(g.filter(x => !x.foraDoMes).length, 31);
  assert.equal(g[3].iso, "2026-10-01"); assert.equal(g[3].foraDoMes, false); assert.equal(g[2].foraDoMes, true);
  assert.equal(A.primeiroDoMes("2026-10-15"), "2026-10-01");
  assert.equal(A.diasNoMes("2028-02-10"), 29); assert.equal(A.diasNoMes("2026-02-01"), 28); assert.equal(A.diasNoMes("2026-10-31"), 31);
  assert.equal(A.mesISO("2026-12-15", 1), "2027-01-01"); assert.equal(A.mesISO("2026-01-31", -1), "2025-12-01"); assert.equal(A.mesISO("2026-10-04", 0), "2026-10-01");
  assert.equal(A.nomeDoMes("2026-10-04"), "Outubro de 2026");
  assert.equal(A.indiceCelulaMesTecla("ArrowRight", 5), 6); assert.equal(A.indiceCelulaMesTecla("ArrowRight", 41), 41);
  assert.equal(A.indiceCelulaMesTecla("ArrowLeft", 0), 0); assert.equal(A.indiceCelulaMesTecla("ArrowDown", 3), 10);
  assert.equal(A.indiceCelulaMesTecla("ArrowDown", 40), null, "não desce para fora da grade");
  assert.equal(A.indiceCelulaMesTecla("ArrowUp", 3), null); assert.equal(A.indiceCelulaMesTecla("ArrowUp", 10), 3);
  assert.equal(A.indiceCelulaMesTecla("Home", 10), 7); assert.equal(A.indiceCelulaMesTecla("End", 10), 13); assert.equal(A.indiceCelulaMesTecla("Tab", 10), null);
});

test("43: o mini-calendário na tela — 42 botões, hoje, selecionado, densidade, bloqueio, clique abre o dia e as setas movem o foco", () => {
  const { h, evento, estado } = criarDom();
  const consultas = [c("2026-10-05T09:00:00-03:00", "2026-10-05T09:45:00-03:00"), c("2026-10-05T14:00:00-03:00", "2026-10-05T14:45:00-03:00"), c("2026-10-07T09:00:00-03:00", "2026-10-07T17:00:00-03:00")];
  const bloqueios = [{ inicio: "2026-10-12T00:00:00-03:00", fim: "2026-10-13T00:00:00-03:00", motivo: "Feriado" }];
  const escolhidos = [], meses = [];
  const el = A.montarMiniCalendario({ h, mes: "2026-10-01", consultas, bloqueios, config: cfg, hoje: "2026-10-04", selecionado: "2026-10-07", aoEscolher: iso => escolhidos.push(iso), aoMudarMes: d => meses.push(d) });
  const dias = el.querySelectorAll(".ag-mes-dia");
  assert.equal(dias.length, 42);
  assert.equal(el.querySelector(".ag-mes-nome").textContent, "Outubro de 2026");
  assert.match(el.querySelector(".ag-mes-resumo").textContent, /^3 consultas · ocupação média \d+%$/);
  const quase = A.montarMiniCalendario({ h, mes: "2026-10-01", consultas: [c("2026-10-05T09:00:00-03:00", "2026-10-05T09:15:00-03:00")], config: cfg, hoje: "2026-10-04" });
  assert.equal(quase.querySelector(".ag-mes-resumo").textContent, "1 consulta · ocupação média abaixo de 1%", "média minúscula não vira «0%»");
  const porIso = iso => dias.find(d => d.dataset.iso === iso);
  assert.equal(porIso("2026-10-04").getAttribute("aria-current"), "date");
  assert.ok(porIso("2026-10-04").classList.contains("hoje"));
  assert.ok(porIso("2026-10-07").classList.contains("sel"));
  assert.deepEqual(dias.filter(d => d.getAttribute("tabindex") === "0").map(d => d.dataset.iso), ["2026-10-07"], "só o selecionado entra na ordem do Tab");
  assert.ok(porIso("2026-09-30").classList.contains("ag-mes-fora"));
  assert.ok(porIso("2026-10-12").classList.contains("ag-mes-bloq"));
  assert.ok(porIso("2026-10-11").classList.contains("ag-mes-fechado"), "domingo fechado");
  assert.ok(porIso("2026-10-03").classList.contains("ag-mes-passado"));
  assert.ok(porIso("2026-10-07").classList.contains("ag-ocup-3"), "8 h em 9 h de expediente (89 %) = cheio");
  assert.ok(porIso("2026-10-05").classList.contains("ag-ocup-1"));
  assert.equal(porIso("2026-10-05").querySelector(".ag-mes-n").textContent, "2");
  assert.equal(porIso("2026-10-06").querySelector(".ag-mes-n").textContent, "");
  assert.match(porIso("2026-10-05").getAttribute("aria-label"), /2 consultas, 17% ocupado/);
  assert.match(porIso("2026-10-12").getAttribute("aria-label"), /bloqueado/);
  assert.equal(porIso("2026-10-05").style.getPropertyValue("--p"), (90 / 540).toFixed(3));
  porIso("2026-10-05").click();
  assert.deepEqual(escolhidos, ["2026-10-05"]);
  const navs = el.querySelectorAll(".ag-mes-nav");
  assert.deepEqual(navs.map(b => b.getAttribute("aria-label")), ["Mês anterior", "Próximo mês"]);
  navs[1].click(); navs[0].click();
  assert.deepEqual(meses, [1, -1]);
  // teclado: a seta move o foco e o tabindex; PageDown troca o mês
  const sel = porIso("2026-10-07");
  const ev = evento("keydown", { key: "ArrowRight" });
  sel.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(estado.ativo, porIso("2026-10-08"));
  assert.equal(porIso("2026-10-08").tabIndex, 0); assert.equal(sel.tabIndex, -1);
  porIso("2026-10-08").dispatchEvent(evento("keydown", { key: "ArrowDown" }));
  assert.equal(estado.ativo, porIso("2026-10-15"));
  porIso("2026-10-15").dispatchEvent(evento("keydown", { key: "PageDown" }));
  assert.deepEqual(meses, [1, -1, 1]);
  const carregando = A.montarMiniCalendario({ h, mes: "2026-10-01", hoje: "2026-10-04", carregando: true });
  assert.equal(carregando.getAttribute("aria-busy"), "true");
  assert.equal(carregando.querySelector(".ag-mes-resumo").textContent, "Carregando…");
  assert.equal(carregando.querySelectorAll(".ag-mes-dia").length, 42, "a grade já existe enquanto carrega (o foco tem onde cair)");
  assert.deepEqual(carregando.querySelectorAll(".ag-mes-dia").filter(d => d.getAttribute("tabindex") === "0").map(d => d.dataset.iso), ["2026-10-04"], "sem seleção, o foco começa em hoje");
});

test("43: «Mês» na tela — 3ª aba no desktop, botão no celular; o mês inteiro vem num pedido só (até 31 dias)", () => {
  const js = ler("agenda.js"), css = ler("agenda.css");
  assert.ok(/\{ valor: "mes", rotulo: "Mês" \}/.test(js), "aba Mês");
  assert.ok(/if \(modo === "mes" && !movel\) return \{ de: primeiroDoMes\(data\), dias: diasNoMes\(data\) \};/.test(js), "intervalo do mês");
  assert.ok(/class: "bt bt-sec bt-p agenda-mes-bt"/.test(js) && /async function abrirMesMovel\(\)/.test(js), "botão «Mês» do celular abre a janela");
  assert.ok(/p_dias: diasNoMes\(meu\)/.test(js), "a janela do celular pede o mês ao servidor");
  assert.ok(/\.agenda-mes-bt \{ display: none; \}/.test(css) && /\.agenda-acoes \.agenda-mes-bt \{ display: inline-flex;/.test(css), "escondido no desktop, visível no celular");
  assert.ok(/\.agenda-abas \{ display: none; \}/.test(css), "o segmentado continua fora do celular");
  assert.ok(/nomeDoPasso\(\) === "mes" \? mesISO\(data, delta\)/.test(js), "« [ » e « ] » andam um mês na visão mês");
});

/* ============================================================ 44 · painel do dia */
test("44: classificação — concluída, falta, encaixe fora do horário e encaixe acima dos simultâneos", () => {
  const seg = "2026-10-05";
  const normal = c(`${seg}T09:00:00-03:00`, `${seg}T09:30:00-03:00`);
  const cedo = c(`${seg}T07:00:00-03:00`, `${seg}T07:30:00-03:00`);
  const almoco = c(`${seg}T12:15:00-03:00`, `${seg}T12:45:00-03:00`);
  const feita = c(`${seg}T10:00:00-03:00`, `${seg}T10:30:00-03:00`, { status: "ganho" });
  const falta = c(`${seg}T11:00:00-03:00`, `${seg}T11:30:00-03:00`, { marco: "faltou" });
  assert.deepEqual(A.classificarConsulta(normal, cfg), { feita: false, falta: false, encaixe: false });
  assert.deepEqual(A.classificarConsulta(cedo, cfg), { feita: false, falta: false, encaixe: true });
  assert.deepEqual(A.classificarConsulta(almoco, cfg), { feita: false, falta: false, encaixe: true });
  assert.deepEqual(A.classificarConsulta(feita, cfg), { feita: true, falta: false, encaixe: false });
  assert.deepEqual(A.classificarConsulta(falta, cfg), { feita: false, falta: true, encaixe: false });
  const dupla = c(`${seg}T09:15:00-03:00`, `${seg}T09:45:00-03:00`);
  assert.equal(A.classificarConsulta(dupla, cfg, { vizinhas: [normal, dupla] }).encaixe, true, "duas ao mesmo tempo com 1 atendimento simultâneo");
  assert.equal(A.classificarConsulta(dupla, { ...cfg, capacidade: 2 }, { vizinhas: [normal, dupla] }).encaixe, false);
  assert.equal(A.classificarConsulta(cedo, null).encaixe, false, "sem horário configurado não se afirma encaixe");
  const r = A.resumoDoDia([falta, normal, feita, cedo, dupla, c("2026-10-06T09:00:00-03:00")], seg, cfg);
  // encaixes: a das 7h (fora do horário) e as DUAS das 9h (juntas passam de 1 atendimento simultâneo); a de outro dia fica de fora
  assert.deepEqual({ total: r.total, feitas: r.feitas, faltas: r.faltas, encaixes: r.encaixes }, { total: 5, feitas: 1, faltas: 1, encaixes: 3 });
  assert.deepEqual(r.itens.filter(x => x.encaixe).map(x => x.c), [cedo, normal, dupla]);
  assert.deepEqual(r.itens.map(x => x.c), [cedo, normal, dupla, feita, falta], "em ordem de horário");
});

test("44: o painel na tela — quatro números, lista em ordem com selos, toque abre o detalhe; vazio oferece marcar", () => {
  const { h } = criarDom();
  const seg = "2026-10-05";
  const consultas = [c(`${seg}T11:00:00-03:00`, `${seg}T11:30:00-03:00`, { nome: "Bianca", servico: "Clareamento", marco: "faltou" }),
    c(`${seg}T09:00:00-03:00`, `${seg}T09:30:00-03:00`, { nome: "Mariana", servico: "Avaliação" }),
    c(`${seg}T07:00:00-03:00`, `${seg}T07:30:00-03:00`, { nome: "Rafael", status: "ganho" })];
  const abertos = [], marcados = [];
  const el = A.montarPainelDia({ h, iso: seg, consultas, config: cfg, hoje: "2026-10-04", pode: true, horaBR: iso => iso.slice(11, 16), num: String, aoAbrir: (k, bt) => abertos.push([k, bt]), aoMarcar: iso => marcados.push(iso) });
  assert.equal(el.tagName, "ASIDE"); assert.equal(el.getAttribute("aria-label"), "Resumo do dia");
  assert.equal(el.querySelector(".ag-painel-sub").textContent, "Dia por vir");
  const kpis = el.querySelectorAll(".ag-kpi");
  assert.deepEqual(kpis.map(k => k.textContent), ["3consultas", "1concluída", "1falta", "1encaixe"]);
  assert.deepEqual(kpis.map(k => k.querySelector("b").dataset.valor), ["3", "1", "1", "1"]);
  assert.ok(kpis[1].classList.contains("ok") && kpis[2].classList.contains("ruim") && kpis[3].classList.contains("aten"));
  const itens = el.querySelectorAll(".ag-painel-item");
  assert.deepEqual(itens.map(i => i.querySelector(".ag-painel-hora").textContent), ["07:00", "09:00", "11:00"]);
  assert.deepEqual(itens.map(i => i.querySelectorAll(".pilula").map(p => p.textContent)), [["Concluída", "Encaixe"], [], ["Faltou"]]);
  assert.ok(itens[0].classList.contains("feita"));
  assert.equal(itens[1].querySelector("small").textContent, "Avaliação");
  itens[1].click();
  assert.equal(abertos.length, 1); assert.equal(abertos[0][0].nome, "Mariana"); assert.equal(abertos[0][1], itens[1]);
  assert.equal(el.querySelector(".ag-painel-vazio"), null);
  const vazio = A.montarPainelDia({ h, iso: "2026-10-06", consultas, config: cfg, hoje: "2026-10-06", pode: true, aoMarcar: iso => marcados.push(iso) });
  assert.equal(vazio.querySelector(".ag-painel-titulo").textContent, "Hoje");
  assert.deepEqual(vazio.querySelectorAll(".ag-kpi b").map(b => b.textContent), ["0", "0", "0", "0"]);
  assert.equal(vazio.querySelector(".ag-painel-vazio .narr").textContent, "Nenhuma consulta neste dia.");
  vazio.querySelector(".ag-painel-vazio button").click();
  assert.deepEqual(marcados, ["2026-10-06"]);
  assert.equal(A.montarPainelDia({ h, iso: "2026-10-06", consultas: [], pode: false }).querySelector(".ag-painel-vazio button"), null, "quem só lê não vê «Marcar consulta»");
  assert.doesNotMatch(ler("agenda.js"), /Confirmar presença/, "sem o parâmetro `presenca` o painel é só leitura (plano 100 · E1 liga «Compareceu / Faltou»)");
  assert.equal(el.querySelector(".ag-pres"), null, "sem `presenca`, nenhum botão de presença");
});

/* ============================================================ extras: prévia da semana na configuração; CSS; mobile */
test("extra: prévia da semana na configuração — horas úteis por dia e por semana, pausas descontadas só dentro das faixas", () => {
  const p = C.previaSemana({ 1: [["08:00", "18:00"]], 2: [["08:00", "12:00"], ["14:00", "18:00"]], 6: [["08:00", "12:00"]] }, [["12:00", "13:00"]]);
  assert.equal(p.dias.length, 7);
  assert.deepEqual(p.dias.map(d => d.id), ["1", "2", "3", "4", "5", "6", "0"], "de segunda a domingo");
  assert.deepEqual(p.dias.map(d => d.horas), [9, 8, 0, 0, 0, 4, 0]);
  assert.equal(p.total, 21);
  assert.deepEqual(p.dias[0].faixas, [{ a: 8, d: 10 }]); assert.deepEqual(p.dias[0].pausas, [{ a: 12, d: 1 }]);
  assert.deepEqual(p.dias[2].pausas, [], "dia fechado não desenha pausa");
  assert.equal(p.dias[2].fechado, true); assert.equal(p.dias[0].nome, "seg"); assert.equal(p.dias[6].nome, "dom");
  assert.deepEqual(C.previaSemana(null, null).dias.map(d => d.horas), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(C.previaSemana({ 1: [["18:00", "08:00"], ["x", "y"]] }).dias[0].fechado, true, "faixa invertida ou inválida não conta");
  assert.equal(C.horasTxt(8.5), "8h30"); assert.equal(C.horasTxt(42), "42h"); assert.equal(C.horasTxt(0), "0h"); assert.equal(C.horasTxt(1.25), "1h15");
  const { h } = criarDom();
  const el = C.montarPreviaSemana(h, p);
  assert.equal(el.getAttribute("aria-label"), "Prévia da semana: 21h de atendimento");
  assert.equal(el.querySelectorAll(".agc-previa-dia").length, 7);
  assert.equal(el.querySelectorAll(".agc-previa-dia.fechado").length, 4);
  assert.equal(el.querySelectorAll(".agc-previa-faixa").length, 4);
  assert.equal(el.querySelector(".agc-previa-faixa").style.getPropertyValue("--a"), "8.000");
  assert.deepEqual(el.querySelectorAll(".agc-previa-dia small").map(s => s.textContent), ["9h", "8h", "—", "—", "—", "4h", "—"]);
  const cfgJs = ler("agenda-config.js");
  assert.ok(/form\.addEventListener\("input", pintarPrevia\)/.test(cfgJs) && /form\.addEventListener\("change", pintarPrevia\)/.test(cfgJs), "a prévia acompanha a digitação");
  assert.ok(/usarAgenda, gradeDias, previaCaixa,/.test(cfgJs), "a prévia fica logo abaixo dos dias");
});

test("extra: CSS — só tokens, sem transition: all, movimento reduzido cobre as peças novas, alvos de 44 px no toque, tamanhos por token", () => {
  const css = ler("agenda.css");
  assert.ok(!/transition:\s*all\b/.test(css), "nada de transition: all");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/:root\s*\{[^}]*\}/g, "")), "hex fora de :root");
  assert.ok(!/font-size:\s*[\d.]+(px|rem|pt)/.test(css) && !/font:\s*[^;]*\d+(px|rem)/.test(css), "tamanho de letra só por token");
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ag-item:not\(\.ag-fantasma\) \{ animation: none; \}/.test(css), "a entrada em escada desliga com movimento reduzido");
  assert.ok(/\.ag-item:not\(\.ag-fantasma\) \{ animation: agEntra var\(--t-ui\) var\(--e-out\) backwards;/.test(css), "a animação de entrada não prende a opacidade (backwards)");
  assert.ok(/\.ag-item\.apagado \{ opacity: \.22; \}/.test(css), "legenda apaga as outras consultas");
  assert.ok(/\.ag-leg-chip \{ min-height: 44px; \}/.test(css) && /\.ag-mes-nav \{ width: 44px; height: 44px; \}/.test(css) && /\.ag-painel-item \{[^}]*min-height: 44px/.test(css), "alvos de 44 px");
  assert.ok(/\.ag-dia-layout \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 300px;/.test(css) && /\.ag-dia-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css), "painel ao lado no desktop, abaixo no celular");
  assert.ok(/\.ag-painel \{ position: sticky; top: calc\(var\(--topo\) \+ \.6rem\)/.test(css), "o painel acompanha a rolagem");
  assert.ok(/\.ag-ocup-0 \{ --c-ocup: var\(--c-borda-2\); \}/.test(css) && /\.ag-ocup-4 \{ --c-ocup: var\(--c-ruim\); \}/.test(css), "escala de ocupação por tokens");
  for (const cls of [".ag-leg-chip:focus-visible", ".ag-mes-dia:focus-visible", ".ag-painel-item:focus-visible", "button.agenda-proxima:focus-visible", ".ag-dia-abrir:focus-visible", ".ag-painel-sum:focus-visible"]) assert.ok(css.includes(cls), `foco visível em ${cls}`);
  // o celular: «Marcar consulta» segue na linha do título; «Mês» e «Atualizar» dividem a 3ª linha; o estado desce para a 4ª
  assert.ok(/\.agenda-acoes \.agenda-marcar \{ grid-column: 2; grid-row: 1; \}/.test(css));
  assert.ok(/\.agenda-acoes \.agenda-mes-bt \{ display: inline-flex; grid-column: 1; grid-row: 3;/.test(css) && /\.agenda-acoes \.agenda-atualizar \{ grid-column: 2; grid-row: 3;/.test(css) && /\.agenda-acoes \.agenda-atualizacao \{ grid-column: 1 \/ -1; grid-row: 4;/.test(css));
});

/* ============================================================ revisão (04/10): a TELA da Agenda montada no DOM mínimo
   montar(ctx) de verdade, com um documento que tem fase de captura (o Esc do arrasto e o clique engolido moram nela), ui/api de mentira e
   relógio real: as consultas ficam numa semana FUTURA (ou passada, no teste da «Próxima»), guardada nas preferências do aparelho. */
const tique = () => new Promise(r => setTimeout(r, 0));
const hojeSPReal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
async function montarAgenda({ data, modo = "semana", consultas = [], rpc = null, modal = null } = {}) {
  const D = criarDom();
  const { h, evento } = D;
  const reg = { chamadas: [], modais: [], toasts: [], desfazer: [] };
  const ouv = { cap: new Map(), bol: new Map() };
  let sob = null;
  const doc = {
    hidden: false, body: h("body"),
    addEventListener(t, f, cap) { const m = cap ? ouv.cap : ouv.bol; if (!m.has(t)) m.set(t, []); m.get(t).push(f); },
    removeEventListener(t, f, cap) { const m = cap ? ouv.cap : ouv.bol; if (m.has(t)) m.set(t, m.get(t).filter(x => x !== f)); },
    querySelector: () => null, elementFromPoint: () => sob, get activeElement() { return D.estado.ativo || doc.body; },
  };
  /** Um evento como o navegador manda: captura no documento, depois o alvo e os ancestrais (bolha), depois a bolha do documento. */
  const disparar = (alvo, tipo, extra = {}) => {
    const ev = evento(tipo, { target: alvo || doc.body, ...extra });
    for (const f of [...(ouv.cap.get(tipo) || [])]) { if (ev._parou) break; f(ev); }
    if (!ev._parou && alvo && alvo.dispatchEvent) alvo.dispatchEvent(ev);
    if (!ev._parou) for (const f of [...(ouv.bol.get(tipo) || [])]) f(ev);
    return ev;
  };
  const storage = new Map();
  const hoje = hojeSPReal();
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
    segmentado: o => h("div", { class: ["seg", o.classe], role: "tablist" }, (o.opcoes || []).map(op => h("button", { type: "button", role: "tab", "aria-selected": String(op.valor === o.valor), on: { click: () => o.aoMudar && o.aoMudar(op.valor) } }, op.rotulo))),
    esqueleto: () => h("div", { class: "esqueleto" }), erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    num: v => String(v), dataBR: iso => String(iso), dataCurtaBR: iso => String(iso).slice(5), horaBR: iso => String(iso || "").slice(11, 16), dataHoraBR: iso => String(iso || ""), periodoBR: () => "", telBR: t => String(t),
    toast: t => { reg.toasts.push(t); return { fechar() {} }; }, acaoComDesfazer: o => { reg.desfazer.push(o); return Promise.resolve(); },
    modal: async o => { reg.modais.push(o); return modal ? modal(o) : null; }, flutuante: () => ({ fechar() {} }), comportamentoRolagem: () => "auto",
    debounce: f => { const g = (...a) => f(...a); g.cancelar = () => {}; return g; },
    campo: o => h("label", { class: "campo" }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : "input", { name: o.nome, value: o.valor ?? "" })),
  };
  const api = { mensagemErro: e => String(e && (e.codigo || e.message)), rpcC: async (nome, p = {}) => {
    reg.chamadas.push({ nome, p });
    await tique();
    if (rpc) { const r = await rpc(nome, p, dados); if (r !== undefined) return r; }
    if (nome === "nx_agenda_dia") return { config: { duracao_min: 30, capacidade: 1 }, consultas: dados.consultas, bloqueios: [] };
    return {};
  } };
  const alvo = h("main", { id: "vista" });
  const ctx = { ui, api, alvo, versao: "rev50", cliente: { id: "cli-ag" }, sessao: { conta: { id: "conta-ag" } }, titulo() {}, navegar() {}, comandos: null,
    pode: () => true, temModulo: () => false, carregar: async () => ({ kit: async () => ({ base: { usuarios: [{ id: "u1", nome: "Dra. Helena" }, { id: "u2", nome: "Ana Paula" }] } }) }) };
  await A.montar(ctx);
  for (let i = 0; i < 4; i++) await tique();
  return { D, h, alvo, reg, dados, disparar, sobre: el => { sob = el; }, ouv,
    sair() { A.desmontar(); for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}
/** Uma semana inteira no futuro (a segunda de daqui a 14 dias): nada «já passou». */
const semanaFutura = () => A.segundaDe(A.diaISO(hojeSPReal(), 14));
const consultaEm = (dia, hh, extra = {}) => ({ negocio_id: 801, nome: "Mariana Costa", titulo: "Aparelho", servico: "Avaliação", status: "aberto", inicio: `${dia}T${hh}:00-03:00`, fim: `${dia}T${hh.slice(0, 2)}:30:00-03:00`, ...extra });
/** Começa um arrasto de verdade: aperta o bloco e anda 200 px para baixo sobre a coluna (1000 px = 8h às 18h) → o fantasma vai para 12:00. */
function comecarArrasto(T) {
  const bt = T.alvo.querySelector(".ag-bloco.ag-arrastavel");
  assert.ok(bt, "o bloco da consulta futura é arrastável (desktop, mouse, quem pode)");
  const col = bt.closest(".ag-col");
  col.getBoundingClientRect = () => ({ top: 0, left: 0, width: 140, height: 1000, right: 140, bottom: 1000 });
  T.sobre(col);
  bt.dispatchEvent(T.D.evento("pointerdown", { button: 0, pointerType: "mouse", pointerId: 7, clientX: 50, clientY: 200 }));
  bt.dispatchEvent(T.D.evento("pointermove", { pointerId: 7, clientX: 50, clientY: 400 }));
  assert.ok(col.querySelector(".ag-fantasma"), "o fantasma aparece no destino");
  return { bt, col };
}

test("revisão · Esc no meio do arrasto e soltar o mouse: o clique que o navegador manda à coluna NÃO abre «Marcar consulta»; o próximo clique abre", async () => {
  const seg = semanaFutura();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try {
    const { col } = comecarArrasto(T);
    T.disparar(null, "keydown", { key: "Escape" });   // o Esc vai ao documento (o arrasto escuta na captura)
    assert.equal(col.querySelector(".ag-fantasma"), null, "Esc tira o fantasma");
    assert.deepEqual(T.reg.toasts, ["Remarcação cancelada."]);
    // soltar o botão: pointerup e, na mesma tarefa, o clique no ancestral comum (a coluna)
    T.disparar(col, "pointerup", { pointerId: 7 });
    const clique = T.disparar(col, "click", { clientY: 600 });
    assert.equal(clique._parou, true, "o clique foi engolido na captura do documento");
    for (let i = 0; i < 4; i++) await tique();
    assert.equal(T.reg.modais.length, 0, "nenhuma janela abriu");
    assert.equal((T.ouv.cap.get("click") || []).length, 0, "desarmou depois do pointerup: nenhum ouvinte de clique ficou preso no documento");
    // um clique normal no vazio da coluna volta a abrir «Marcar consulta»
    T.disparar(col, "pointerdown", { button: 0 }); T.disparar(col, "pointerup", {});
    T.disparar(col, "click", { clientY: 600 });
    for (let i = 0; i < 8; i++) await tique();
    assert.deepEqual(T.reg.modais.map(m => m.titulo), ["Marcar consulta"]);
    // soltou fora da janela (sem pointerup): o próximo aperto desarma e o clique dele vale
    comecarArrasto(T);
    T.disparar(null, "keydown", { key: "Escape" });
    T.disparar(col, "pointerdown", { button: 0 });
    assert.equal(T.disparar(col, "click", { clientY: 600 })._parou, false, "um gesto novo não é engolido");
  } finally { T.sair(); }
});

test("revisão · Desfazer da remarcação por arrasto devolve o horário (encaixe) E a etapa lida antes de remarcar; já em «Agendada» não lê nem move", async () => {
  const seg = semanaFutura();
  const confirmar = async o => { const ac = o.acoes.find(a => a.tipo === "primario"); return ac.fn({ erro: t => { throw new Error(t); } }); };
  const rpc = async nome => {
    if (nome === "nx_negocio_ver") return { negocio: { id: 801, estagio_id: "s3", ordem: 4.5 } };
    if (nome === "nx_agenda_marcar") return { ok: true, remarcada: true, etapa: "Avaliação agendada", consulta: { inicio: "x" } };
    if (nome === "nx_negocio_mover") return { id: 801 };
    return undefined;
  };
  const remarcarPorArrasto = async T => {
    const { bt } = comecarArrasto(T);
    bt.dispatchEvent(T.D.evento("pointerup", { pointerId: 7 }));
    for (let i = 0; i < 12; i++) await tique();
  };
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { marco: "orcamento", etapa: "Avaliou / orçamento" })], rpc, modal: confirmar });
  try {
    await remarcarPorArrasto(T);
    assert.deepEqual(T.reg.modais.map(m => m.titulo), ["Remarcar consulta?"]);
    const nomes = T.reg.chamadas.map(c => c.nome);
    assert.ok(nomes.indexOf("nx_negocio_ver") >= 0 && nomes.indexOf("nx_negocio_ver") < nomes.indexOf("nx_agenda_marcar"), "a etapa é lida ANTES de remarcar");
    const marcar = T.reg.chamadas.find(c => c.nome === "nx_agenda_marcar");
    assert.equal(marcar.p.p_inicio, new Date(`${seg}T12:00:00-03:00`).toISOString(), "remarca para o destino do arrasto");
    assert.ok(marcar.p.p_req, "com p_req (repetir não marca duas vezes)");
    assert.equal(T.reg.desfazer.length, 1);
    T.reg.chamadas.length = 0;
    await T.reg.desfazer[0].reverter();
    assert.deepEqual(T.reg.chamadas.filter(c => c.nome !== "nx_agenda_dia").map(c => [c.nome, c.p]), [
      ["nx_agenda_marcar", { p_negocio: 801, p_inicio: `${seg}T10:00:00-03:00`, p_servico: "Avaliação", p_encaixe: true }],
      ["nx_negocio_mover", { p_id: 801, p_estagio: "s3", p_ordem: 4.5, p_extra: {} }]], "volta ao horário como encaixe e devolve a etapa e a posição de antes");
  } finally { T.sair(); }
  // já estava em «Agendada»: remarcar não troca a etapa — nada de ficha nem de nx_negocio_mover
  const T2 = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { marco: "agendada" })], rpc, modal: confirmar });
  try {
    await remarcarPorArrasto(T2);
    await T2.reg.desfazer[0].reverter();
    const nomes = T2.reg.chamadas.map(c => c.nome);
    assert.ok(!nomes.includes("nx_negocio_ver") && !nomes.includes("nx_negocio_mover"), nomes.join(","));
  } finally { T2.sair(); }
  // a etapa não voltou: avisa (a consulta já voltou ao horário)
  const erroCalado = console.error; console.error = () => {};
  const T3 = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00", { marco: "orcamento" })], modal: confirmar,
    rpc: async (nome, p, d) => (nome === "nx_negocio_mover" ? Promise.reject(Object.assign(new Error("estagio_invalido"), { codigo: "estagio_invalido" })) : rpc(nome, p, d)) });
  try {
    await remarcarPorArrasto(T3);
    await T3.reg.desfazer[0].reverter();
    assert.match(T3.reg.toasts.at(-1), /voltou ao horário, mas o cartão não voltou para a etapa/);
  } finally { T3.sair(); console.error = erroCalado; }
});

test("revisão · «Próxima consulta» sem próxima no período diz o período olhado («nesta semana», «neste dia»), sem prometer além dele", async () => {
  const passada = A.segundaDe(A.diaISO(hojeSPReal(), -21));
  // plano 100 · E3: a leitura dos 7 dias seguintes completa o texto (testes/plano100-agenda); aqui ela falha e fica o texto do período
  const semFora = async (nome, p) => (nome === "nx_agenda_dia" && p.p_data !== passada ? Promise.reject(Object.assign(new Error("rede"), { codigo: "sem_conexao" })) : undefined);
  const quando = async (modo, consultas) => { const T = await montarAgenda({ data: passada, modo, consultas, rpc: semFora }); try { for (let i = 0; i < 6; i++) await tique(); return T.alvo.querySelector(".agenda-proxima").textContent; } finally { T.sair(); } };
  assert.equal(await quando("semana", [consultaEm(passada, "10:00")]), "Nenhuma consulta por vir nesta semana.");
  assert.equal(await quando("semana", []), "Semana livre — nenhuma consulta marcada.");
  assert.equal(await quando("dia", [consultaEm(passada, "10:00")]), "Nenhuma consulta por vir neste dia.");
  assert.equal(await quando("dia", []), "Dia livre — nenhuma consulta marcada.");
  assert.doesNotMatch(ler("agenda.js"), /neste período|Período livre/, "o texto antigo prometia um «período» que não foi olhado");
  // com próxima no período: o chip leva até ela
  const seg = semanaFutura();
  const T = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try { assert.match(T.alvo.querySelector("button.agenda-proxima").textContent, /^PróximaMariana Costa/); } finally { T.sair(); }
});

test("revisão · números do resumo contam ao entrar e NÃO recontam ao redesenhar sem mudança (legenda, nomes); acendem quando mudam", async () => {
  await import("../web/app/graficos.js?v=rev50");   // o mesmo módulo que a Agenda importa: já pronto na 1ª pintura
  const seg = semanaFutura();
  // só a 1ª pintura: conta (o graficos.contar deixa o valor final no aria-label); o zero não conta
  const T0 = await montarAgenda({ data: seg, consultas: [consultaEm(seg, "10:00")] });
  try { assert.deepEqual(T0.alvo.querySelectorAll(".agenda-resumo-num b[data-valor]").map(b => b.getAttribute("aria-label")), ["1", null]); }
  finally { T0.sair(); }
  const consultas = [consultaEm(seg, "10:00", { servico: "Avaliação", dono_id: "u1" }), consultaEm(A.diaISO(seg, 1), "14:00", { negocio_id: 802, servico: "Implante", dono_id: "u2" })];
  const T = await montarAgenda({ data: seg, consultas });
  try {
    const nums = () => T.alvo.querySelectorAll(".agenda-resumo-num b[data-valor]").map(b => [b.textContent, b.getAttribute("aria-label"), b.classList.contains("destaque")]);
    // os nomes dos responsáveis chegaram e redesenharam a tela: elementos novos com o número pronto, sem contar de novo
    assert.ok(T.alvo.querySelector(".ag-legenda-por"), "houve o redesenho dos nomes (a troca «Por profissional» só aparece com responsáveis)");
    assert.deepEqual(nums(), [["2", null, false], ["0", null, false]], "redesenho dos nomes: sem recontagem");
    T.alvo.querySelector(".ag-leg-chip").click();
    assert.ok(T.alvo.querySelector(".ag-item.apagado"), "a legenda redesenhou a grade");
    assert.deepEqual(nums(), [["2", null, false], ["0", null, false]], "tocar a legenda não reconta nem acende");
    // o dado mudou (mais uma consulta): o número acende em vez de contar do zero
    T.dados.consultas = [...consultas, consultaEm(A.diaISO(seg, 2), "09:00", { negocio_id: 803, servico: "Avaliação" })];
    T.alvo.querySelector(".agenda-atualizar").click();
    for (let i = 0; i < 8; i++) await tique();
    assert.deepEqual(nums(), [["3", null, true], ["0", null, false]], "só o número que mudou acende");
  } finally { T.sair(); }
});

test("revisão · lerEtapa lê a ficha (null sem ela) e o mini-calendário do celular dá 44 px por dia", async () => {
  assert.deepEqual(await A.lerEtapa({ rpcC: async (n, p) => (n === "nx_negocio_ver" && p.p_id === 9 ? { negocio: { estagio_id: "s3", ordem: 2 } } : null) }, 9), { estagio_id: "s3", ordem: 2 });
  assert.deepEqual(await A.lerEtapa({ rpcC: async () => ({ negocio: { estagio_id: "s1" } }) }, 9), { estagio_id: "s1", ordem: null });
  assert.equal(await A.lerEtapa({ rpcC: async () => ({}) }, 9), null);
  assert.equal(await A.lerEtapa({ rpcC: async () => { throw new Error("rede"); } }, 9), null, "sem a ficha o Desfazer devolve só o horário");
  const css = ler("agenda.css");
  const movel = css.slice(css.indexOf("@media (max-width: 760px) {"));
  assert.ok(/\.ag-mes-compacto \{ margin-inline: -\.9rem; \}/.test(movel) && /\.ag-mes-compacto \.ag-mes-sem, \.ag-mes-compacto \.ag-mes-grade \{ gap: 2px; \}/.test(movel),
    "no celular a grade avança sobre o respiro da janela: 7 dias de 44 px ou mais em 375–390 px");
});
