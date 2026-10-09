/* ============================================================
   ÓRBITA — plano 100 · frente B (Início)
   node --test testes/plano100-inicio.teste.mjs
   (a) PURO: os campos novos de nx_inicio (contrato 4) por detecção —
       «Respondidas no prazo», séries de 14 dias, funil do mês, quem espera
       e os números caídos (nx_inicio.canais[].estado + ctx.canais do shell).
   (b) COMPORTAMENTO (o mesmo DOM de mentira do plano50-inicio + ui.js,
       graficos.js e rel-logica.js de verdade): a tela com a RPC NOVA e com
       a ANTIGA, «Assumir» (nx_cv_atribuir com a própria conta e abre a
       conversa, trava em voo, erro devolve o botão), faixa do número caído
       (servidor e shell, sem RPC), esqueleto de KPI + gráfico, ✓ ao concluir
       tarefa, relógio e pulso sem redesenhar por cima.
   (c) ESTÁTICA (complemento): CSS do «Agora» na linha inteira, container
       queries, alvos de 44 px.
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

test("B3: com respondidas_no_prazo_pct o 4º KPI é «Respondidas no prazo» (0–100, tom pelo valor); sem o campo continua «Leads · 7 dias»", () => {
  const ks = I.kpisInicio(NOVO(), AGENDA, { hoje: HOJE, links: { relatorios: "#/relatorios/atendimento", crm: "#/crm" } });
  assert.deepEqual(ks.map(k => k.id), ["aguardando", "consultas", "aberto", "prazo"]);
  assert.equal(ks[3].valor, 78); assert.equal(ks[3].formato, "pct"); assert.equal(ks[3].tom, "neutro"); assert.equal(ks[3].href, "#/relatorios/atendimento");
  assert.match(ks[3].ajuda, /15 minutos/);
  const alto = NOVO(); alto.conversas.respondidas_no_prazo_pct = 140;
  assert.equal(I.kpisInicio(alto, AGENDA, {})[3].valor, 100, "nunca passa de 100");
  assert.equal(I.kpisInicio(alto, AGENDA, {})[3].tom, "ok");
  const baixo = NOVO(); baixo.conversas.respondidas_no_prazo_pct = 30;
  assert.equal(I.kpisInicio(baixo, AGENDA, {})[3].tom, "aten");
  const zero = NOVO(); zero.conversas.respondidas_no_prazo_pct = 0;
  assert.equal(I.kpisInicio(zero, AGENDA, {})[3].id, "prazo", "0 % é dado, não ausência");
  const nulo = NOVO(); nulo.conversas.respondidas_no_prazo_pct = null;
  assert.equal(I.kpisInicio(nulo, AGENDA, {})[3].id, "leads", "null = o servidor não sabe: volta para Leads");
  const antigo = I.kpisInicio(ANTIGO(), AGENDA, { links: { crm: "#/crm" } });
  assert.deepEqual(antigo.map(k => k.id), ["aguardando", "consultas", "aberto", "leads"]);
  assert.equal(antigo[3].href, "#/crm");
});

test("B2: série de 14 dias do servidor por KPI — mesma medida compara com ontem; leads é por dia (sem seta); sem o campo, null", () => {
  const d = NOVO();
  const ag = I.serieServidor(d, "aguardando");
  // revisão 09/10: a série «aguardando» do servidor são as conversas ABERTAS por dia (não «quem espera agora»): sem comparar com ontem
  assert.equal(ag.valores.length, 14); assert.equal(ag.mesma, false); assert.equal(ag.ontem, null); assert.equal(ag.linha, "conversas novas por dia");
  assert.equal(I.serieServidor(d, "consultas").mesma, true, "consultas de hoje × de ontem: a mesma medida");
  assert.equal(I.serieServidor(d, "valor_aberto").valores[0], 60000);
  const ld = I.serieServidor(d, "leads_semana");
  assert.equal(ld.mesma, false); assert.equal(ld.ontem, null, "leads por dia ≠ leads em 7 dias: não compara");
  assert.equal(I.serieServidor(d, "respondidas_pct"), null, "o prazo não tem série");
  assert.equal(I.serieServidor(ANTIGO(), "aguardando"), null);
  assert.equal(I.serieServidor({ series_14d: { aguardando: [3] } }, "aguardando"), null, "um ponto só não é linha");
  assert.deepEqual(I.serieServidor({ series_14d: { aguardando: [1, null, "x", 3] } }, "aguardando").valores, [1, 3], "lixo fica fora");
  assert.equal(I.serieServidor(null, "aguardando"), null);
});

test("B1: funil do mês — etapas na ordem, nomes pela vertical, taxa sobre a anterior (pode passar de 100 %), conversão geral; sem funil_mes, null", () => {
  const f = I.funilMes(NOVO(), { voc: { negocios: "oportunidades", consultas: "consultas", feminino: true } });
  assert.deepEqual(f.etapas.map(e => [e.nome, e.qtd, e.tipo]), [["Leads", 23, "aberto"], ["Conversas", 19, "aberto"], ["Consultas marcadas", 11, "aberto"], ["Oportunidades ganhas", 9, "ganho"]]);
  assert.deepEqual(f.etapas.map(e => e.conversao), ["", "83 % da anterior", "58 % da anterior", "82 % da anterior"]);
  assert.equal(Math.round(f.geral * 100), 39); assert.equal(f.vazio, false);
  assert.equal(I.funilMes({ funil_mes: { leads: 2, conversas: 5, agendados: 0, ganhos: 0 } }).etapas[1].conversao, "250 % da anterior");
  assert.equal(I.funilMes({ funil_mes: { leads: 0, conversas: 0, agendados: 0, ganhos: 0 } }).vazio, true);
  assert.equal(I.funilMes({ funil_mes: { leads: 0, conversas: 0, agendados: 0, ganhos: 0 } }).geral, null, "sem lead não há conversão (nada de 0 %)");
  assert.equal(I.funilMes({ funil_mes: { leads: 0, conversas: 3 } }).etapas[1].conversao, "", "anterior zero: sem taxa");
  assert.equal(I.funilMes({ negocios: { ganhos_mes: 2 } }), null, "não monta funil a partir de outros números");
  assert.equal(I.funilMes(ANTIGO()), null); assert.equal(I.funilMes({ funil_mes: {} }), null); assert.equal(I.funilMes(null), null);
  assert.equal(I.funilMes({ funil_mes: { leads: 1 } }, {}).etapas[3].nome, "Negócios ganhos");
});

test("B4: quem espera — a mais antiga primeiro, sem item sem id, no máximo 5; sem o campo, null", () => {
  const l = I.listaEspera(NOVO().conversas);
  assert.deepEqual(l.map(x => [x.id, x.nome, x.espera, x.canal]), [[902, null, 40, "meta"], [901, "Mariana Costa", 15, "codewords"]]);
  const muitos = { aguardando_lista: [{ nome: "sem id" }, ...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, espera_min: i }))] };
  assert.deepEqual(I.listaEspera(muitos).map(x => x.id), [8, 7, 6, 5, 4]);
  assert.equal(I.listaEspera({ aguardando_lista: [{ id: 1, espera_min: null }] })[0].espera, null);
  assert.equal(I.listaEspera(ANTIGO().conversas), null); assert.equal(I.listaEspera(null), null);
  assert.deepEqual(I.listaEspera({ aguardando_lista: [] }), []);
});

test("B5: números caídos — servidor e shell somados sem repetir; estado ok só quando todos conectados; a frase com «há X»", () => {
  const agora = Date.parse(SP(HOJE, "10", "20"));
  const d = NOVO();
  d.canais = [{ id: "cw1", nome: "Recepção", estado: "desconectado", desde: SP(HOJE, "10", "08") }, { id: "m1", nome: "Comercial", estado: "conectado" }];
  const l = I.numerosCaidos(d, [{ id: "cw1", nome: "Recepção", desde: null }, { id: "x9", nome: "Filial" }]);
  assert.deepEqual(l.map(x => [x.id, x.fonte]), [["cw1", "inicio"], ["x9", "shell"]]);
  assert.equal(I.textoNumeroCaido(l.slice(0, 1), agora), "Número de WhatsApp desconectado há 12 min: Recepção.");
  assert.equal(I.textoNumeroCaido(l, agora), "2 números de WhatsApp desconectados: Recepção, Filial.");
  assert.equal(I.textoNumeroCaido([{ nome: "Sem data" }], agora), "Número de WhatsApp desconectado: Sem data.");
  assert.equal(I.textoNumeroCaido([], agora), "");
  assert.equal(I.estadoNumeros(d), "caido");
  assert.equal(I.estadoNumeros(NOVO()), "ok");
  assert.equal(I.estadoNumeros(ANTIGO()), null, "RPC antiga: sem estado, sem ponto verde");
  assert.equal(I.estadoNumeros({ canais: [{ estado: "conectado" }, { estado: "desconhecido" }] }), null, "desconhecido não é «ok»");
  assert.deepEqual(I.numerosCaidos(ANTIGO(), null), []);
  assert.deepEqual(I.numerosCaidos(null, [{ nome: "Só shell" }]).map(x => x.nome), ["Só shell"]);
  // a notificação do shell sem canal_id (o título vira o nome): com nx_inicio sabendo o estado, fica de fora — não duplica nem ressuscita
  const notif = [{ id: null, nome: "Recepção · CodeWords: número desconectado", fonte: "notificacao" }];
  assert.deepEqual(I.numerosCaidos(d, notif).map(x => x.id), ["cw1"], "não duplica o número que o servidor já mostra");
  assert.deepEqual(I.numerosCaidos(NOVO(), notif), [], "servidor diz conectado: a notificação velha não acende a faixa");
  assert.deepEqual(I.numerosCaidos(ANTIGO(), notif).map(x => x.nome), ["Recepção · CodeWords"], "RPC antiga: vale a notificação, sem o «: número desconectado» no nome");
  assert.deepEqual(I.numerosCaidos(NOVO(), [{ id: "cw1", nome: "Recepção" }]).map(x => x.fonte), ["shell"], "com id o shell vale (chega antes da próxima leitura)");
});

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

test("tela (RPC NOVA): «Respondidas no prazo» no topo e «Leads» no bloco; linha de 14 dias do servidor já no 1º dia com a seta contra ontem", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const { raiz } = await montarTela(NOVO(), { dom });
    assert.deepEqual(kpiIds(raiz), ["aguardando", "consultas", "aberto", "prazo"]);
    const prazo = raiz.querySelector(".ini-kpi[data-kpi=prazo]");
    assert.equal(texto(prazo.querySelector(".ini-kpi-v")), "78%"); assert.equal(prazo.getAttribute("href"), "#/relatorios/atendimento");
    assert.ok(prazo.querySelector(".ini-kpi-sp-vazia"), "o prazo não tem série: fio pontilhado, sem inventar linha");
    assert.ok(raiz.querySelector("section[data-bloco=leads]"), "«Leads · 7 dias» desce para o bloco Leads");
    assert.match(texto(raiz.querySelector("section[data-bloco=leads]")), /23\s*nos últimos 7 dias/);
    const ag = raiz.querySelector(".ini-kpi[data-kpi=aguardando]");
    assert.ok(ag.querySelector(".ini-kpi-sp svg"), "linha do servidor sem esperar o 3º dia neste aparelho");
    assert.match(ag.querySelector(".sr-only").textContent, /conversas novas por dia nos últimos 14 dias \(contagem do servidor\)/);
    assert.equal(ag.querySelector(".rel-var"), null, "revisão: «esperando agora» × «conversas abertas ontem» não são comparáveis — sem seta");
  } finally { dom.fim(); }
});

test("tela (RPC ANTIGA): nada do contrato 4 aparece — sem funil, sem lista de quem espera, sem faixa nem ponto verde; KPI de Leads e linha local", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const { raiz, chamadas } = await montarTela(ANTIGO(), { dom });
    assert.deepEqual(kpiIds(raiz), ["aguardando", "consultas", "aberto", "leads"]);
    assert.equal(raiz.querySelector("section[data-bloco=funil]"), null, "sem funil_mes não há bloco (nada inventado)");
    assert.equal(raiz.querySelector(".ini-espera-lista"), null);
    assert.ok(raiz.querySelector("[data-k=ag-abrir]"), "«Responder agora» continua");
    assert.equal(raiz.querySelector(".ini-faixa-canal").hidden, true);
    assert.equal(raiz.querySelector(".ini-wa-ok").hidden, true, "sem estado do servidor, sem ponto verde");
    assert.match(raiz.querySelector(".ini-kpi[data-kpi=aguardando] .sr-only").textContent, /a partir do 3º dia/);
    assert.equal(chamadas.filter(c => c.nome === "nx_cv_atribuir").length, 0);
  } finally { dom.fim(); }
});

test("B1: bloco «Funil do mês» com graficos.funil (4 etapas, taxa sobre a anterior) e ui.kpi (Leads «compacto», conversão em %); funil zerado vai para «Mais detalhes» com ui.vazio", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    let { raiz } = await montarTela(NOVO(), { dom });
    const f = raiz.querySelector("section[data-bloco=funil]");
    assert.ok(f, "bloco do funil"); assert.equal(f.closest(".ini-mais"), null, "com lead no mês, aberto na grade");
    const etapas = f.querySelectorAll(".g-funil .g-fetapa");
    assert.equal(etapas.length, 4);
    assert.deepEqual(etapas.map(e => texto(e.querySelector(".g-fnome"))), ["Leads", "Conversas", "Consultas marcadas", "Oportunidades ganhas"]);
    assert.equal(texto(etapas[1].querySelector(".g-fconv")), "83 % da anterior");
    assert.ok(etapas[3].classList.contains("g-f-ganho"));
    const kpis = f.querySelectorAll(".ini-funil-kpis .kpi");
    assert.equal(kpis.length, 2); assert.equal(kpis[0].dataset.formato, "compacto"); assert.equal(kpis[1].dataset.formato, "pct");
    assert.match(texto(kpis[1].querySelector(".kpi-valor")), /39\s*%/);
    assert.equal(texto(kpis[0].querySelector(".kpi-valor")), "23", "o valor final, não o «0» de uma contagem interrompida");
    assert.ok(/contarDepois\.push\(\(\) => kpis\.append\(/.test(ler("inicio.js")), "os cartões do funil só entram com o bloco já na página");
    assert.match(texto(f), /não é a mesma turma/);
    const vazio = NOVO(); vazio.funil_mes = { leads: 0, conversas: 0, agendados: 0, ganhos: 0 };
    ({ raiz } = await montarTela(vazio, { dom }));
    const f2 = raiz.querySelector("section[data-bloco=funil]");
    assert.ok(f2.closest(".ini-mais"), "mês sem lead: recolhido");
    assert.ok(f2.querySelector(".vazio[data-tema=crm]"), "vazio com o tema da biblioteca");
    assert.equal(f2.querySelector(".g-funil"), null);
  } finally { dom.fim(); }
});

test("B4/B7: «Agora» lista quem espera (a mais antiga primeiro) com pílula do canal; «Assumir» chama nx_cv_atribuir com a própria conta e abre a conversa — uma vez só", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    const lista = r.raiz.querySelector("section[data-bloco=agora] .ini-espera-lista");
    assert.ok(lista, "lista de quem espera");
    const itens = lista.querySelectorAll(".ini-espera-item");
    assert.deepEqual(itens.map(li => li.dataset.conversa), ["902", "901"]);
    assert.match(texto(itens[0]), /Paciente sem nome/); assert.match(texto(itens[0]), /espera há 40 min/);
    assert.ok(itens[0].classList.contains("ini-espera-longa"), "30 min ou mais: destaque");
    const pil = itens[1].querySelector(".pilula[data-variante=canal]");
    assert.ok(pil, "pílula do canal (A8)"); assert.equal(texto(pil), "WhatsApp · CodeWords");
    assert.equal(texto(itens[0].querySelector(".pilula")), "Meta");
    assert.ok(itens[1].querySelector(".avatar"));
    assert.equal(itens[1].querySelector("[data-k=ag-ver-901]").getAttribute("href"), "#/conversas/901");
    // Assumir: em voo, o segundo clique não chama de novo
    let soltar; r.resp.atribuir = () => new Promise(ok => { soltar = () => ok({ id: 901 }); });
    const bt = itens[1].querySelector("[data-k=ag-assumir-901]");
    bt.click(); bt.click();
    assert.equal(r.chamadas.filter(c => c.nome === "nx_cv_atribuir").length, 1, "trava em voo");
    assert.equal(bt.disabled, true);
    soltar(); await tick();
    assert.deepEqual(r.chamadas.find(c => c.nome === "nx_cv_atribuir").params, { p_conversa: 901, p_conta: ID_CONTA });
    assert.deepEqual(r.navegou, ["#/conversas/901"]);
    assert.ok(r.toasts.some(t => t.tipo === "ok"));
  } finally { dom.fim(); }
});

test("B4: «Assumir» que falha devolve o botão, mostra o erro e não abre nada; sem permissão de escrever, só «Abrir»", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    r.resp.atribuir = new Error("sem_permissao");
    const bt = r.raiz.querySelector("[data-k=ag-assumir-902]");
    bt.click(); await tick();
    assert.equal(bt.disabled, false); assert.equal(bt.hasAttribute("aria-busy"), false);
    assert.deepEqual(r.navegou, []);
    assert.ok(r.toasts.some(t => t.tipo === "erro" && /sem_permissao/.test(t.texto)));
    // conta sem id na sessão: nada de «Assumir» (não dá para atribuir a ninguém)
    const sem = await montarTela(NOVO(), { dom, conta: null });
    assert.equal(sem.raiz.querySelector("[data-k^=ag-assumir-]"), null);
    assert.ok(sem.raiz.querySelector("[data-k=ag-ver-902]"));
  } finally { dom.fim(); }
});

test("B5: número desconectado pelo servidor — faixa no topo com «há X» que anda no relógio, «Ver número» pelo shell, bloco dos números aberto com o estado", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.canais[0] = { ...d.canais[0], estado: "desconectado", desde: SP(HOJE, "10", "08") };
    const r = await montarTela(d, { dom });
    const faixa = r.raiz.querySelector(".ini-faixa-canal");
    assert.equal(faixa.hidden, false);
    assert.equal(r.raiz.querySelector(".rel-corpo").firstElementChild, faixa, "antes de tudo");
    assert.match(texto(faixa), /Número de WhatsApp desconectado há 12 min: Recepção\. As mensagens não chegam até reconectar\./);
    assert.equal(r.raiz.querySelector(".ini-wa-ok").hidden, true);
    faixa.querySelector("[data-k=faixa-ver]").click();
    assert.equal(r.canais.viu, 1, "«Ver número» usa o verNumero do shell");
    const num = r.raiz.querySelector("section[data-bloco=numeros]");
    assert.equal(num.closest(".ini-mais"), null, "o bloco dos números abre");
    assert.ok(num.querySelector(".ini-c-ruim")); assert.match(texto(num), /Desconectado há 12 min/);
    // o relógio anda o «há X» sem RPC
    const n0 = r.chamadas.length;
    dom.andar(60000); dom.relogio();
    assert.match(texto(r.raiz.querySelector(".ini-faixa-canal")), /há 13 min/); assert.equal(r.chamadas.length, n0);
  } finally { dom.fim(); }
});

test("B5: o shell avisa número caído/voltou (ctx.canais) — a faixa aparece e some sem RPC e sem redesenhar a tela; ponto verde só com tudo conectado; não-admin vê o recado", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom, papel: "atendente" });
    assert.equal(r.raiz.querySelector(".ini-wa-ok").hidden, false, "todos conectados: ponto verde discreto");
    assert.equal(r.raiz.querySelector(".ini-faixa-canal").hidden, true);
    const kpi0 = r.raiz.querySelector(".ini-kpi"), n0 = r.chamadas.length;
    r.canais.mudar([{ id: "cw1", nome: "Recepção", desde: SP(HOJE, "10", "15"), fonte: "notificacao" }]);
    const faixa = r.raiz.querySelector(".ini-faixa-canal");
    assert.equal(faixa.hidden, false); assert.match(texto(faixa), /desconectado há 5 min: Recepção/);
    assert.equal(faixa.querySelector("[data-k=faixa-ver]"), null, "atendente não abre Configurações");
    assert.match(texto(faixa), /Peça ao administrador/);
    assert.equal(r.raiz.querySelector(".ini-wa-ok").hidden, true);
    assert.equal(r.raiz.querySelector(".ini-kpi"), kpi0, "a tela não foi redesenhada"); assert.equal(r.chamadas.length, n0, "nem RPC");
    r.canais.mudar([]);
    assert.equal(r.raiz.querySelector(".ini-faixa-canal").hidden, true);
    assert.equal(r.raiz.querySelector(".ini-wa-ok").hidden, false);
    I.desmontar();
    assert.equal(r.canais.fns.size, 0, "desmontar cancela a assinatura");
  } finally { dom.fim(); }
});

test("B5: sem ctx.canais (shell antigo) a faixa vem só do servidor e nada quebra", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.canais[0] = { ...d.canais[0], estado: "desconectado", desde: null };
    const r = await montarTela(d, { dom, semCanais: true });
    assert.match(texto(r.raiz.querySelector(".ini-faixa-canal")), /^Número de WhatsApp desconectado: Recepção\./);
    r.raiz.querySelector("[data-k=faixa-ver]").click();
    assert.deepEqual(r.navegou, ["#/config/numeros"]);
  } finally { dom.fim(); }
});

test("B6: 1º carregamento com ui.esqueleto('kpi') + ui.esqueleto('grafico'); somem quando o dado chega; agenda a caminho mostra o esqueleto do gráfico nas barras", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    let soltar; const lento = new Promise(ok => { soltar = ok; });
    const r = await montarTela(NOVO(), { dom, inicioLento: lento, esperarMontar: false });
    const raizI = r.raiz.querySelector(".ini");
    assert.deepEqual(raizI.children.filter(c => c.classList.contains("esqueleto")).map(c => c.dataset.tipo), ["kpi", "grafico"]);
    assert.ok(raizI.querySelector(".esqueleto-kpi .sk-cab"), "com o cabeçalho");
    assert.equal(raizI.querySelectorAll(".esqueleto-kpi .sk-kpi").length, 4);
    soltar(); await r.pronto; await tick();
    assert.equal(raizI.children.filter(c => c.classList.contains("esqueleto")).length, 0);
    assert.ok(raizI.querySelector(".ini-kpi"));
    // horas com a agenda «lendo» (1ª pintura pelo cache): o esqueleto do gráfico no lugar das barras
    const fonte = ler("inicio.js");
    assert.match(fonte, /if \(agendaLendo\) \{ sub\.textContent = "Lendo a agenda…"; area\.append\(ui\.esqueleto\("grafico", \{ n: 10 \}\)\); return sec; \}/);
  } finally { dom.fim(); }
});

test("B6: vazios com o tema da biblioteca — sem tarefa («crm») e sem consulta na semana («agenda»)", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.tarefas = { hoje: 0, atrasadas: 0, abertas: 0, proximas: [] };
    const r = await montarTela(d, { dom, agenda: agendaDe([]) });
    assert.ok(r.raiz.querySelector("section[data-bloco=tarefas] .vazio[data-tema=crm]"));
    assert.match(texto(r.raiz.querySelector("section[data-bloco=tarefas] .vazio")), /Nenhuma tarefa aberta com você/);
    assert.ok(r.raiz.querySelector("section[data-bloco=horas] .vazio[data-tema=agenda]"));
  } finally { dom.fim(); }
});

test("B8: concluir a tarefa pelo Início mostra o ✓ da biblioteca (ui.checkSucesso) e só relê depois dele", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    const caixa = r.raiz.querySelector("[data-k=tf-71]");
    const li = caixa.closest(".ini-tf-item");
    const lidas = () => r.chamadas.filter(c => c.nome === "nx_inicio").length;
    const antes = lidas();
    caixa.checked = true; dom.ev(caixa, "change"); await tick();
    assert.deepEqual(r.chamadas.find(c => c.nome === "nx_tarefa_concluir").params, { p_id: 71, p_concluida: true });
    assert.ok(li.classList.contains("tem-ok-check"), "o ✓ cobre a linha"); assert.ok(li.querySelector(".ok-check"));
    assert.equal(lidas(), antes, "ainda não releu (o ✓ está à mostra)");
    await esperar(450); await tick();
    assert.equal(lidas(), antes + 1, "releu depois do ✓");
    // falhou: a caixa volta e nada de ✓
    r.resp.tarefa = new Error("falhou");
    const c2 = r.raiz.querySelector("[data-k=tf-71]");
    c2.checked = true; dom.ev(c2, "change"); await tick();
    assert.equal(c2.checked, false); assert.equal(c2.closest(".ini-tf-item").querySelector(".ok-check"), null);
  } finally { dom.fim(); }
});

test("B9: relógio e pulso — a lista de quem espera é refeita no minuto, mas não com o foco no «Assumir»; pulso sem mudança não redesenha", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(NOVO(), { dom });
    let agora = r.raiz.querySelector("section[data-bloco=agora]");
    const bt = agora.querySelector("[data-k=ag-assumir-901]");
    bt.focus();
    dom.andar(60000); dom.relogio();
    assert.equal(r.raiz.querySelector("section[data-bloco=agora]"), agora, "foco dentro: o bloco fica");
    bt.blur(); dom.andar(60000); dom.relogio();
    agora = r.raiz.querySelector("section[data-bloco=agora]");
    assert.ok(agora.querySelector(".ini-espera-lista"), "refeito com a lista");
    const kpi0 = r.raiz.querySelector(".ini-kpi");
    dom.andar(31000); await r.pulso();
    assert.equal(r.raiz.querySelector(".ini-kpi"), kpi0, "mesmo dado: nada redesenhado");
    const d2 = NOVO(); d2.conversas.respondidas_no_prazo_pct = 90; r.resp.d = d2;
    dom.andar(31000); await r.pulso();
    assert.equal(texto(r.raiz.querySelector(".ini-kpi[data-kpi=prazo] .ini-kpi-v")), "90%");
  } finally { dom.fim(); }
});

test("KPI estreito: «Em aberto» com 7 dígitos ou mais leva a forma curta (container query); o valor inteiro continua para o leitor de tela", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const d = NOVO(); d.negocios.valor_aberto = 1234567;
    const r = await montarTela(d, { dom });
    const k = r.raiz.querySelector(".ini-kpi[data-kpi=aberto]");
    assert.ok(k.querySelector(".ini-kpi-v-longo")); assert.match(texto(k.querySelector(".ini-kpi-v-longo")), /1\.234\.567/);
    const curto = k.querySelector(".ini-kpi-v-curto");
    assert.equal(texto(curto), "R$ 1,2 mi"); assert.equal(curto.getAttribute("aria-hidden"), "true");
    const r2 = await montarTela(NOVO(), { dom });
    assert.equal(r2.raiz.querySelector(".ini-kpi[data-kpi=aberto] .ini-kpi-v-curto"), null, "R$ 67.400 cabe: sem forma curta");
  } finally { dom.fim(); }
});

/* ============================================================ (c) ESTÁTICA (complemento) */
test("inicio.css: «Agora» na linha inteira no topo da grade (paridade corrigida), colunas que empilham por container query, alvos de 44 px no toque, só tokens", () => {
  const css = ler("inicio.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.ini-grade > \.ini-agora:first-child:not\(\.ini-rec\) \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /:last-child:nth-child\(even\) \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.ini-agora \{ container-type: inline-size; \}/);
  assert.match(css, /@container \(max-width: 40rem\) \{\s*\.ini-agora-grade \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 760px\) \{[\s\S]*?\.ini-espera-acoes \.bt, \.ini-faixa-canal \.bt \{ min-height: 44px; \}/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "hex de cor");
  assert.doesNotMatch(css, /transition:\s*all\b/);
  const js = ler("inicio.js");
  assert.match(js, /\.append\(\.\.\.\[/, "o padrão .append(...[a, b].filter(Boolean))");
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/);
});
