/* ============================================================
   ÓRBITA — plano 50 · frente B (Início)
   node --test testes/plano50-inicio.teste.mjs
   (a) PURO: histórico local (um ponto por dia), KPIs, agenda por hora/dia,
       próximas consultas com o relógio, metas × ritmo do calendário e a
       ordem dos blocos — tudo exportado por web/app/inicio.js.
   (b) COMPORTAMENTO (DOM de mentira + ui.js/graficos.js/rel-logica.js de
       verdade): monta a tela com uma resposta fictícia e confere o que
       aparece e o que cada clique faz (recolher, mover, restaurar, metas,
       barras hoje/7 dias, linha de tendência só a partir do 3º dia).
   (c) ESTÁTICA (complemento): inicio.css só com tokens, movimento
       reduzido, [hidden] forte; inicio.js carrega o CSS e não usa innerHTML.
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

/* ============================================================ (a) PURO */
const HOJE = "2026-10-04";                       // sábado
const SP = (dia, hh, mm = "00") => `${dia}T${hh}:${mm}:00-03:00`;
const agendaDe = consultas => ({ data: HOJE, dias: 7, consultas });
const AGENDA = agendaDe([
  { negocio_id: 802, contato_id: 502, nome: "Rafael Mendes", servico: "Implante", etapa: "Avaliação agendada", status: "aberto", inicio: SP(HOJE, "14", "30"), fim: SP(HOJE, "15", "15") },
  { negocio_id: 805, contato_id: 505, nome: "Joana Lima", servico: "Limpeza", etapa: "Nova conversa", status: "aberto", inicio: SP(HOJE, "09", "00"), fim: SP(HOJE, "09", "30") },
  { negocio_id: 806, contato_id: 506, nome: "Cancelada Silva", servico: "Clareamento", status: "cancelada", inicio: SP(HOJE, "11", "00"), fim: SP(HOJE, "11", "30") },
  { negocio_id: 801, contato_id: 501, nome: "Mariana Costa", servico: "Alinhador transparente", etapa: "Avaliou / orçamento", status: "aberto", inicio: SP("2026-10-05", "10", "00"), fim: SP("2026-10-05", "10", "45") },
  { negocio_id: 807, contato_id: 507, nome: "Pedro Alves", servico: "Implante", status: "aberto", inicio: SP("2026-10-07", "16", "00"), fim: SP("2026-10-07", "16", "45") },
]);
const DADO = () => ({ hoje: HOJE, agora: SP(HOJE, "10", "00"),
  conversas: { aguardando: 2, sem_dono: 1, minhas: 1, abertas: 3, pendentes: 0, espera_mais_antiga_min: 15 },
  tarefas: { hoje: 1, atrasadas: 0, abertas: 2, proximas: [{ id: 71, tipo: "ligacao", titulo: "Confirmar avaliação", vence_em: SP(HOJE, "17"), atrasada: false, contato_id: 501, negocio_id: 801, contato_nome: "Mariana Costa" }] },
  negocios: { abertos: 18, valor_aberto: 67400, previsao_ponderada: 26200, ganhos_mes: 9, receita_mes: 28400, ganhos_mes_anterior: 7, receita_mes_anterior: 20300, receita_mes_anterior_parcial: 20300, dia_do_mes: 4 },
  leads: { hoje: 4, hoje_anuncio: 2, semana: 23, semana_anuncio: 14 },
  canais: [{ id: "cw1", nome: "Recepção", numero_exibicao: "+55 00 00000-0001", status: "ativo", app_inscrito: true, ultima_entrada_em: new Date().toISOString() }],
  notificacoes_nao_lidas: 0 });

test("datas: dias do mês, primeiro dia e soma de dias (calendário puro)", () => {
  assert.equal(I.diasDoMes("2026-10-04"), 31); assert.equal(I.diasDoMes("2026-02-10"), 28); assert.equal(I.diasDoMes("2028-02-01"), 29);
  assert.equal(I.primeiroDiaMes("2026-10-04"), "2026-10-01");
  assert.equal(I.somarDiasIso("2026-10-31", 1), "2026-11-01"); assert.equal(I.somarDiasIso("2026-10-04", -4), "2026-09-30");
  assert.deepEqual(I.BLOCOS_INICIO.slice(0, 3), ["agora", "atendimento", "tarefas"]);
});

test("histórico local: um registro por dia (o mesmo dia substitui), só os últimos 14; a linha exige 3 pontos e a seta compara com o dia anterior", () => {
  let h = { dias: [] };
  h = I.registrarHistorico(h, "2026-10-01", { aguardando: 1 });
  h = I.registrarHistorico(h, "2026-10-02", { aguardando: 3 });
  h = I.registrarHistorico(h, "2026-10-02", { aguardando: 4 });           // releitura no mesmo dia: substitui
  assert.deepEqual(h.dias.map(d => [d.dia, d.aguardando]), [["2026-10-01", 1], ["2026-10-02", 4]]);
  assert.equal(I.serieHistorico(h, "aguardando"), null, "com 2 dias ainda não há linha");
  assert.deepEqual(I.variacaoHistorico(h, "aguardando"), { atual: 4, anterior: 1, dia: "2026-10-01" });
  h = I.registrarHistorico(h, "2026-10-03", { aguardando: 2, consultas: null });
  assert.deepEqual(I.serieHistorico(h, "aguardando"), [1, 4, 2]);
  assert.equal(I.serieHistorico(h, "consultas"), null, "campo sem número (agenda indisponível) não conta ponto");
  for (let i = 4; i <= 30; i++) h = I.registrarHistorico(h, `2026-10-${String(i).padStart(2, "0")}`, { aguardando: i });
  assert.equal(h.dias.length, 14, "só os últimos 14 dias");
  assert.equal(h.dias[0].dia, "2026-10-17");
  assert.deepEqual(I.registrarHistorico(null, "2026-10-01", { a: 1 }).dias.length, 1, "sem histórico anterior começa do zero");
  assert.deepEqual(I.registrarHistorico({ dias: [{ dia: "x", a: 1 }] }, "", { a: 2 }).dias.length, 1, "sem dia do servidor não grava");
  assert.deepEqual(I.serieHistorico({ dias: [{ dia: "a", v: 1 }, { dia: "b", v: 2 }] }, "v", { min: 2 }), [1, 2]);
});

test("KPIs: quatro cartões só com o que nx_inicio/nx_agenda_dia devolvem; sem agenda o valor é null (nunca zero); tons e legendas honestas", () => {
  const ks = I.kpisInicio(DADO(), AGENDA, { hoje: HOJE, links: { conversas: "#/c", agenda: "#/a", crm: "#/k" }, voc: { consulta: "consulta", consultas: "consultas", negocio: "oportunidade", negocios: "oportunidades", feminino: true } });
  assert.deepEqual(ks.map(k => k.id), ["aguardando", "consultas", "aberto", "leads"]);
  assert.equal(ks[0].valor, 2); assert.equal(ks[0].tom, "aten"); assert.equal(ks[0].sentido, "baixo"); assert.equal(ks[0].sub, "a mais antiga há 15 min"); assert.equal(ks[0].href, "#/c");
  assert.equal(ks[1].valor, 2, "duas de hoje válidas (a cancelada fica fora; a de amanhã também)"); assert.equal(ks[1].rotulo, "Consultas hoje");
  assert.equal(ks[2].valor, 67400); assert.equal(ks[2].formato, "brl"); assert.equal(ks[2].sub, "18 oportunidades abertas");
  assert.equal(ks[3].valor, 23); assert.equal(ks[3].sub, "4 hoje · 14 de anúncio");
  const sem = I.kpisInicio(DADO(), null, { hoje: HOJE });
  assert.equal(sem[1].valor, null); assert.equal(sem[1].sub, "agenda indisponível"); assert.equal(sem[0].href, null);
  const calmo = I.kpisInicio({ ...DADO(), conversas: { aguardando: 0 } }, agendaDe([]), { hoje: HOJE });
  assert.equal(calmo[0].tom, "ok"); assert.equal(calmo[0].sub, "ninguém esperando"); assert.equal(calmo[1].sub, "nenhuma marcada");
  const longa = I.kpisInicio({ ...DADO(), conversas: { aguardando: 1, espera_mais_antiga_min: 75 } }, null, {});
  assert.equal(longa[0].tom, "ruim"); assert.equal(longa[0].sub, "a mais antiga há 1 h 15 min");
  assert.equal(I.duracaoCurta(0.4), "< 1 min"); assert.equal(I.duracaoCurta(120), "2 h"); assert.equal(I.duracaoCurta(null), "—");
  assert.equal(I.consultasNoDia(AGENDA, "2026-10-05"), 1); assert.equal(I.consultasNoDia({}, HOJE), null);
});

test("agenda por hora e por dia: faixa 8–18 h que estica quando precisa, cancelada fora, rótulos hoje/amanhã/dia da semana", () => {
  const ph = I.consultasPorHora(AGENDA, HOJE);
  assert.equal(ph.total, 2); assert.equal(ph.max, 1);
  assert.deepEqual(ph.horas.map(x => x.h).slice(0, 3), [8, 9, 10]); assert.equal(ph.horas[ph.horas.length - 1].h, 18);
  assert.equal(ph.horas.find(x => x.h === 14).n, 1); assert.equal(ph.horas.find(x => x.h === 14).itens[0].nome, "Rafael Mendes");
  assert.equal(ph.horas.find(x => x.h === 11).n, 0, "a cancelada não conta");
  const cedo = I.consultasPorHora(agendaDe([{ inicio: SP(HOJE, "06", "30"), status: "aberto" }, { inicio: SP(HOJE, "20", "00"), status: "aberto" }]), HOJE);
  assert.equal(cedo.horas[0].h, 6); assert.equal(cedo.horas[cedo.horas.length - 1].h, 20);
  const pd = I.consultasPorDia(AGENDA, HOJE, 7);
  assert.equal(pd.total, 4); assert.equal(pd.dias.length, 7);
  assert.deepEqual(pd.dias.slice(0, 4).map(x => [x.rotulo, x.n]), [["hoje", 2], ["seg", 1], ["ter", 0], ["qua", 1]], "04/10/2026 é domingo; rótulo curto cabe em 7 colunas");
  assert.deepEqual(pd.dias.slice(0, 3).map(x => x.rotuloLongo), ["hoje 04/10", "amanhã 05/10", "ter 06/10"]);
  assert.equal(pd.dias[0].ddmm, "04/10"); assert.equal(pd.dias[0].hoje, true);
  assert.equal(I.consultasPorHora(null, HOJE).total, 0); assert.equal(I.consultasPorDia(null, HOJE).total, 0);
});

test("próximas consultas: passou · agora · próxima · depois pelo relógio; dia acabado mostra as da semana; sem agenda, listas vazias", () => {
  const as10h20 = Date.parse(SP(HOJE, "10", "20"));
  const p = I.proximasConsultas(AGENDA, { hoje: HOJE, agora: as10h20 });
  assert.deepEqual(p.hoje.map(c => [c.nome, c.estado]), [["Joana Lima", "passou"], ["Rafael Mendes", "proxima"]]);
  assert.equal(p.passadas, 1); assert.equal(p.restantes, 1); assert.equal(p.diaAcabou, false);
  assert.deepEqual(p.visiveis.map(c => c.nome), ["Rafael Mendes"]);
  assert.deepEqual(p.futuras.map(c => c.nome), ["Mariana Costa", "Pedro Alves"]);
  const durante = I.proximasConsultas(AGENDA, { hoje: HOJE, agora: Date.parse(SP(HOJE, "14", "40")) });
  assert.equal(durante.hoje[1].estado, "agora");
  const tarde = I.proximasConsultas(AGENDA, { hoje: HOJE, agora: Date.parse(SP(HOJE, "18", "00")) });
  assert.equal(tarde.diaAcabou, true); assert.equal(tarde.visiveis.length, 0); assert.equal(tarde.futuras[0].nome, "Mariana Costa");
  const semFim = I.proximasConsultas(agendaDe([{ nome: "X", status: "aberto", inicio: SP(HOJE, "10", "00") }]), { hoje: HOJE, agora: Date.parse(SP(HOJE, "10", "20")) });
  assert.equal(semFim.hoje[0].estado, "agora", "sem `fim` vale 30 min");
  assert.deepEqual(I.proximasConsultas(null, { hoje: HOJE }).hoje, []);
  assert.equal(I.proximasConsultas(agendaDe([]), { hoje: HOJE, max: 2 }).diaAcabou, false);
});

test("metas: progresso contra o ritmo do calendário (dia 4 de 31), estados e texto honesto; sem meta não há barra", () => {
  assert.equal(I.progressoMeta({ meta: 0, realizado: 10 }), null); assert.equal(I.progressoMeta({}), null);
  const frente = I.progressoMeta({ meta: 50000, realizado: 28400, dia: 4, diasNoMes: 31 });
  assert.equal(frente.estado, "frente"); assert.equal(Math.round(frente.pct), 57); assert.equal(Math.round(frente.esperado), 6452); assert.equal(frente.falta, 21600);
  assert.equal(Math.round(frente.ritmoPct * 10) / 10, 12.9);
  const atras = I.progressoMeta({ meta: 100, realizado: 10, dia: 20, diasNoMes: 30 });
  assert.equal(atras.estado, "atras");
  const ritmo = I.progressoMeta({ meta: 100, realizado: 60, dia: 20, diasNoMes: 30 });
  assert.equal(ritmo.estado, "ritmo", "entre 85 % e 100 % do esperado é «perto do ritmo»");
  const batida = I.progressoMeta({ meta: 10, realizado: 12, dia: 4, diasNoMes: 31 });
  assert.equal(batida.estado, "batida"); assert.equal(batida.pct, 100, "a barra não passa de 100"); assert.equal(batida.pctReal, 120); assert.equal(batida.falta, 0);
  const fmt = v => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
  assert.equal(I.textoMeta(frente, { fmt, dia: 4, diasNoMes: 31 }), "R$ 28.400 de R$ 50.000 (57 %). Faltam R$ 21.600 — você está à frente do ritmo; no dia 4 de 31 o esperado seria R$ 6.452.");
  assert.equal(I.textoMeta(batida), "Meta batida: 12 de 10 (120 %).");
  assert.match(I.textoMeta(atras, { dia: 20, diasNoMes: 30 }), /está abaixo do ritmo; no dia 20 de 30 o esperado seria 67\./);
  assert.equal(I.textoMeta(null), "");
});

test("blocos: a ordem guardada vale primeiro e o resto segue o padrão; mover para antes/depois respeita as pontas", () => {
  assert.deepEqual(I.ordenarBlocos(["agora", "atendimento", "vendas"], []), ["agora", "atendimento", "vendas"]);
  assert.deepEqual(I.ordenarBlocos(["agora", "atendimento", "vendas"], ["vendas", "agora"]), ["vendas", "agora", "atendimento"]);
  assert.deepEqual(I.ordenarBlocos(["a", "b"], ["zzz"]), ["a", "b"], "id desconhecido na ordem não atrapalha");
  assert.deepEqual(I.moverBloco(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(I.moverBloco(["a", "b", "c"], "c", 1), ["a", "b", "c"], "na ponta não muda");
  assert.deepEqual(I.moverBloco(["a", "b", "c"], "x", 1), ["a", "b", "c"]);
  assert.deepEqual(I.moverBloco(null, "a", 1), []);
});

test("meta de consultas: realizado = o que já aconteceu até agora (sem canceladas nem faltas); as futuras do mês ficam à parte", () => {
  const as10h20 = Date.parse(SP(HOJE, "10", "20"));
  const mes = agendaDe([...AGENDA.consultas, { nome: "Faltou", status: "aberto", marco: "faltou", inicio: SP("2026-10-02", "09") }, { nome: "Fim do mês", status: "aberto", inicio: SP("2026-10-30", "09") }]);
  assert.deepEqual(I.contagemConsultasMes(mes, { agora: as10h20 }), { realizadas: 1, marcadas: 4, faltas: 1 }, "só a das 09:00 de hoje já aconteceu");
  assert.equal(I.contagemConsultasMes(null), null); assert.equal(I.contagemConsultasMes({}), null);
  // agenda cheia no fim do mês não é «à frente do ritmo» no dia 4
  const cheia = agendaDe(Array.from({ length: 12 }, (_, i) => ({ status: "aberto", inicio: SP(`2026-10-${String(5 + i * 2).padStart(2, "0")}`, "10") })));
  const c = I.contagemConsultasMes(cheia, { agora: as10h20 });
  assert.deepEqual(c, { realizadas: 0, marcadas: 12, faltas: 0 });
  assert.equal(I.progressoMeta({ meta: 30, realizado: c.realizadas, dia: 4, diasNoMes: 31 }).estado, "atras");
});

test("teclado: o foco vai para o vizinho quando o botão some ou volta desligado; a barra do gráfico com Tab é a hora corrente (ou hoje)", () => {
  assert.deepEqual(I.alternativasFoco("bl-ant-vendas"), ["bl-dep-vendas", "bl-rec-vendas"]);
  assert.deepEqual(I.alternativasFoco("bl-dep-agora", { bloco: "agora" }), ["bl-ant-agora", "bl-rec-agora"]);
  assert.deepEqual(I.alternativasFoco("bl-restaurar", { primeiro: "agora" }), ["bl-rec-agora"]);
  assert.deepEqual(I.alternativasFoco("mt-salvar", { bloco: "metas" }), ["mt-editar", "mt-v", "bl-rec-metas"]);
  assert.deepEqual(I.alternativasFoco("ag-tentar", { bloco: "agora" }), ["bl-rec-agora"], "qualquer outro controle de um bloco: a barra do bloco");
  assert.deepEqual(I.alternativasFoco(null), []);
  const horas = [8, 9, 10, 11].map(h => ({ h }));
  assert.equal(I.barraAtual(horas, { hojeMode: true, horaAgora: 10 }), 2);
  assert.equal(I.barraAtual(horas, { hojeMode: true, horaAgora: 6 }), 0, "antes da faixa: a primeira");
  assert.equal(I.barraAtual(horas, { hojeMode: true, horaAgora: 22 }), 3, "depois da faixa: a última");
  assert.equal(I.barraAtual([{ hoje: false }, { hoje: true }], { hojeMode: false }), 1);
  assert.equal(I.barraAtual([], {}), -1);
});

test("KPI de consultas: falha ao ler a agenda ≠ conta sem agenda (o motivo certo, sem dizer que a conta perdeu o acesso)", () => {
  const falhou = I.kpisInicio(DADO(), { erro: true }, { hoje: HOJE })[1];
  assert.equal(falhou.valor, null); assert.equal(falhou.sub, "não consegui ler a agenda"); assert.match(falhou.ajuda, /Não consegui ler a agenda agora/);
  const semConta = I.kpisInicio(DADO(), null, { hoje: HOJE })[1];
  assert.equal(semConta.sub, "agenda indisponível"); assert.match(semConta.ajuda, /não está disponível para a sua conta/);
});

/* ============================================================ (b) COMPORTAMENTO — DOM de mentira */
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

/**
 * ctx de mentira: a API devolve as respostas fictícias; permissões abertas; vocabulário de clínica.
 * `resp` (devolvido) é mutável: trocar resp.d / resp.agenda muda a próxima leitura; um Error em resp.agenda/agendaMes faz a RPC falhar.
 * `pulso()` dispara o aviso do pulso (o relógio de mentira precisa ter andado 30 s para a recarga sair na hora); `ocupado()` é o que o shell pergunta.
 */
async function montarTela(d, { dom, agenda = AGENDA, agendaMes = null, semUi = [], abrirNegocio = () => {}, navegar = () => {}, cacheInicio = null, esperar = true, conta = ID_CONTA } = {}) {
  const U = await import(pathToFileURL(join(APP, "ui.js")).href);
  const ui = { ...U }; for (const k of semUi) delete ui[k];
  const chamadas = [];
  const resp = { d, agenda, agendaMes };
  let aoPulso = null, ocupado = () => false;
  const ctx = {
    alvo: dom.doc.body.appendChild(dom.doc.createElement("main")), versao: "T", rota: { query: {} },
    sessao: { conta: { id: conta, nome: "Helena Souza" }, org: {} },
    cliente: { id: ID_CLI, slug: "demo", nome: "Clínica Demo", vertical: "odonto", modulos: ["conversas", "crm", "ads", "relatorios"] },
    papel: "admin", pode: () => true, temModulo: () => true, pronto: () => true, configPronta: () => true,
    vocab: { contato: "Paciente", contatos: "Pacientes", negocio: "Oportunidade", negocios: "Oportunidades", g_negocio: "a", vertical: "odonto" },
    api: { async rpcC(nome, params, opc) {
      chamadas.push({ nome, params });
      // cacheInicio: o shell tem o último nx_inicio guardado e pinta com ele antes da rede (aoCache), como o stale-while-revalidate do api.js
      if (nome === "nx_inicio") { if (cacheInicio && opc && typeof opc.aoCache === "function") opc.aoCache(cacheInicio, new Date().toISOString()); return resp.d; }
      if (nome === "nx_agenda_dia") { const r = params.p_dias === 7 ? resp.agenda : resp.agendaMes; if (typeof r === "function") return r(params); if (r instanceof Error) throw r; return r; }
      if (nome === "nx_onboarding_estado") return { total: 11, feitos: 11, obrigatorios: 9, obrigatorios_feitos: 9, pct: 100, completo: true, itens: [] };
      return null;
    }, mensagemErro: e => String(e && e.message || e) },
    ui, navegar, abrirNegocio, abrirContato() {}, titulo() {}, badge() {},
    pulso: { assinar: fn => { aoPulso = fn; return () => { aoPulso = null; }; } }, naoAtualizar: fn => { ocupado = fn; return () => {}; },
  };
  const extras = { resp, pulso: async () => { aoPulso(); await tick(); await tick(); }, ocupado: () => ocupado() };
  // esperar: false → devolve com a tela ainda carregando (a 1ª pintura pelo cache); `pronto` termina a montagem
  if (!esperar) { const pronto = I.montar(ctx).then(tick); await tick(); return { ctx, chamadas, raiz: ctx.alvo, pronto, ...extras }; }
  const erros = [];
  const consoleErro = console.error; console.error = (...a) => erros.push(a.map(String).join(" "));
  try { await I.montar(ctx); await tick(); } finally { console.error = consoleErro; }
  const cartaoErro = ctx.alvo.querySelector(".vazio-erro");
  assert.equal(cartaoErro, null, `a tela caiu no cartão de erro: ${cartaoErro ? cartaoErro.textContent : ""} ${erros.join(" | ")}`);
  return { ctx, chamadas, raiz: ctx.alvo, ...extras };
}
const texto = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const chaveHist = `nx-ini-hist:${ID_CLI}:${ID_CONTA}`, chaveMetas = `nx-ini-metas:${ID_CLI}`, chaveBlocos = `nx-ini-blocos:${ID_CLI}:${ID_CONTA}`;

test("tela: KPIs no topo (4), «Agora» com quem espera e as consultas de hoje com ação, barras hoje/7 dias com tabela acessível, e a agenda pedida em 7 dias", async () => {
  const dom = comDom();
  try {
    const { raiz, chamadas, ctx } = await montarTela(DADO(), { dom });
    assert.equal(chamadas.find(c => c.nome === "nx_agenda_dia").params.p_dias, 7, "a agenda vem em 7 dias (manchete e KPI olham só o de hoje)");
    assert.equal(chamadas.filter(c => c.nome === "nx_agenda_dia").length, 1, "sem meta de consultas, o mês não é pedido");
    // KPIs
    const kpis = raiz.querySelectorAll(".ini-kpi");
    assert.equal(kpis.length, 4);
    assert.deepEqual(kpis.map(k => k.dataset.kpi), ["aguardando", "consultas", "aberto", "leads"]);
    assert.equal(kpis[0].localName, "a"); assert.equal(kpis[0].getAttribute("href"), "#/conversas?aba=aguardando");
    assert.equal(texto(kpis[0].querySelector(".ini-kpi-v")), "2"); assert.ok(kpis[0].classList.contains("ini-kpi-aten"));
    assert.equal(texto(kpis[2].querySelector(".ini-kpi-v")), "R$67.400", "moeda editorial (R$ num span próprio)");
    assert.equal(texto(kpis[3].querySelector(".ini-kpi-sub")), "4 hoje · 14 de anúncio");
    assert.ok(kpis[0].querySelector(".ini-kpi-sp-vazia"), "1º dia: ainda sem linha de tendência");
    assert.match(kpis[0].querySelector(".sr-only").textContent, /aparece a partir do 3º dia/);
    assert.equal(kpis[0].getAttribute("aria-describedby"), kpis[0].querySelector(".sr-only").id);
    const hist = JSON.parse(dom.mem.get(chaveHist));
    assert.deepEqual(hist.dias.map(x => [x.dia, x.aguardando, x.valor_aberto, x.leads_semana]), [[HOJE, 2, 67400, 23]], "a leitura de hoje ficou guardada neste aparelho");
    // Agora
    const agora = raiz.querySelector(".ini-agora");
    assert.ok(agora, "bloco «Agora»");
    assert.match(texto(agora.querySelector(".ini-agora-cv")), /2 pacientes esperando resposta/);
    assert.equal(agora.querySelector("[data-k=ag-abrir]").getAttribute("href"), "#/conversas?aba=aguardando");
    assert.match(texto(agora.querySelector("[data-k=ag-semdono]")), /Sem responsável · 1/);
    const itens = agora.querySelectorAll(".ini-prox-item");
    assert.ok(itens.length >= 1 && itens.length <= 4, "lista de consultas de hoje (ou as próximas da semana, se o dia já acabou)");
    assert.ok(itens.some(li => /Rafael Mendes|Joana Lima|Mariana Costa|Pedro Alves/.test(texto(li))));
    const abrir = agora.querySelector("[data-k^=px-]");
    assert.ok(abrir, "cada consulta tem «Abrir»");
    const abertos = [];
    ctx.abrirNegocio = id => abertos.push(id);
    abrir.click();
    assert.equal(abertos.length, 1); assert.ok([801, 802, 805, 807].includes(abertos[0]));
    // barras
    const horas = raiz.querySelector(".ini-horas");
    assert.ok(horas, "bloco das barras");
    const seg = horas.querySelector(".seg");
    assert.ok(seg, "alternador Hoje / 7 dias");
    const opHoje = seg.querySelector("[data-valor=hoje]"), opSem = seg.querySelector("[data-valor=semana]");
    assert.equal(texto(opHoje.querySelector(".seg-n")), "2"); assert.equal(texto(opSem.querySelector(".seg-n")), "4");
    let barras = horas.querySelectorAll(".ini-bv");
    assert.equal(barras.length, 11, "8 h às 18 h");
    assert.equal(barras.filter(b => b.getAttribute("tabindex") === "0").length, 1, "uma só parada de Tab no gráfico (tabindex itinerante)");
    assert.ok(barras.every(b => ["0", "-1"].includes(b.getAttribute("tabindex"))), "as outras barras leem pelas setas");
    assert.match(barras.find(b => /14h/.test(b.getAttribute("aria-label"))).getAttribute("aria-label"), /14h: 1 consulta — Rafael Mendes · Implante/);
    assert.ok(horas.querySelector(".g-ver-tabela"), "«Ver como tabela»");
    const tabela = horas.querySelector(".g-tabela-caixa");
    assert.ok(tabela.hidden); assert.equal(tabela.querySelectorAll("tbody tr").length, 11);
    horas.querySelector(".g-ver-tabela").click();
    assert.equal(tabela.hidden, false); assert.equal(horas.querySelector(".ini-horas-caixa").hidden, true);
    assert.match(barras.find(b => /14h/.test(b.getAttribute("aria-label"))).querySelector(".ini-bv-trilho").style.getPropertyValue("--h"), /^85/, "a maior barra para em 85 % do trilho");
    opSem.click();
    barras = horas.querySelectorAll(".ini-bv");
    assert.equal(barras.length, 7, "7 dias");
    assert.deepEqual(barras.slice(0, 2).map(b => texto(b.querySelector(".ini-bv-r"))), ["hoje", "seg"]);
    assert.ok(barras[0].classList.contains("ini-bv-agora"), "o dia de hoje é a marca do agora");
    assert.deepEqual(barras.map(b => b.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1", "-1", "-1"], "7 dias: o Tab entra em hoje");
    // setas andam entre as barras e levam a parada de Tab junto
    barras[0].focus();
    dom.ev(horas.querySelector(".ini-bv-lista"), "keydown", { key: "ArrowRight" });
    assert.equal(dom.doc.activeElement, barras[1]); assert.equal(barras[1].getAttribute("tabindex"), "0"); assert.equal(barras[0].getAttribute("tabindex"), "-1");
    dom.ev(horas.querySelector(".ini-bv-lista"), "keydown", { key: "End" });
    assert.equal(dom.doc.activeElement, barras[6]); assert.equal(barras.filter(b => b.getAttribute("tabindex") === "0").length, 1);
    barras[6].blur();
    const status = horas.querySelector("[role=status]");
    dom.ev(barras[1], "focus", { bubbles: false });
    assert.match(texto(status), /amanhã 05\/10: 1 consulta — Mariana Costa · Alinhador transparente/);
    assert.equal(horas.querySelectorAll(".g-tabela tbody tr").length, 7, "a tabela acompanha o período");
  } finally { dom.fim(); }
});

test("tela: a linha de tendência aparece a partir do 3º dia de leitura e a seta compara com o dia anterior (sentido invertido para espera)", async () => {
  const dom = comDom();
  try {
    dom.mem.set(chaveHist, JSON.stringify({ dias: [{ dia: "2026-10-01", aguardando: 5, valor_aberto: 60000, leads_semana: 20, consultas: 1 }, { dia: "2026-10-02", aguardando: 4, valor_aberto: 61000, leads_semana: 21, consultas: 0 }, { dia: "2026-10-03", aguardando: 3, valor_aberto: 65000, leads_semana: 22, consultas: 2 }] }));
    const { raiz } = await montarTela(DADO(), { dom });
    const kpis = raiz.querySelectorAll(".ini-kpi");
    assert.ok(kpis[0].querySelector(".ini-kpi-sp svg"), "linha com 4 dias (3 guardados + hoje)");
    assert.ok(kpis[0].classList.contains("ini-kpi-com-linha"));
    assert.match(kpis[0].querySelector(".sr-only").textContent, /últimos 4 dias de leitura neste aparelho/);
    const seta = kpis[0].querySelector(".rel-var");
    assert.ok(seta, "seta contra o dia anterior");
    assert.ok(seta.classList.contains("rel-var-bom"), "espera caiu de 3 para 2: bom (sentido invertido)");
    assert.match(seta.getAttribute("title"), /contra o dia 03\/10/);
    assert.ok(kpis[2].querySelector(".rel-var").classList.contains("rel-var-bom"), "em aberto subiu: bom");
    assert.equal(JSON.parse(dom.mem.get(chaveHist)).dias.length, 4);
  } finally { dom.fim(); }
});

test("tela: sem G.sparkline a linha sai do desenho local (polyline + último ponto); com G.sparkline, do gráfico da frente A", async () => {
  const dom = comDom();
  try {
    dom.mem.set(chaveHist, JSON.stringify({ dias: [{ dia: "2026-10-01", aguardando: 5 }, { dia: "2026-10-02", aguardando: 4 }, { dia: "2026-10-03", aguardando: 3 }] }));
    const { raiz } = await montarTela(DADO(), { dom });
    const svg = raiz.querySelector(".ini-kpi[data-kpi=aguardando] .ini-kpi-sp svg");
    assert.ok(svg);
    const Gm = await import(pathToFileURL(join(APP, "graficos.js")).href);
    if (typeof Gm.sparkline === "function") assert.ok(svg.classList.contains("g-spark"), "G.sparkline existe: a linha é dele");
    else { assert.ok(svg.querySelector("polyline.ini-sp-linha")); assert.ok(svg.querySelector("circle.ini-sp-ponto")); }
  } finally { dom.fim(); }
});

test("tela: recolher um bloco (aria-expanded + corpo oculto), mover para antes/depois, «Restaurar ordem»; tudo guardado por empresa e conta", async () => {
  const dom = comDom();
  try {
    let { raiz } = await montarTela(DADO(), { dom });
    const grade = raiz.querySelector(".ini-grade");
    const ordem0 = grade.querySelectorAll("section[data-bloco]").map(s => s.dataset.bloco);
    assert.equal(ordem0[0], "agora", "«Agora» abre primeiro quando há gente esperando");
    assert.ok(ordem0.includes("atendimento") && ordem0.includes("horas"));
    assert.equal(raiz.querySelector("[data-k=bl-restaurar]"), null, "sem personalização não há «Restaurar»");
    const vendas = grade.querySelector("section[data-bloco=vendas]");
    assert.ok(vendas.querySelector(".ini-bloco-corpo .ini-numeros"), "o corpo do bloco foi envolvido");
    const btRec = vendas.querySelector("[data-k=bl-rec-vendas]");
    assert.equal(btRec.getAttribute("aria-expanded"), "true"); assert.equal(btRec.getAttribute("aria-controls"), "ini-bc-vendas");
    assert.equal(vendas.querySelector("[data-k=bl-ant-vendas]").disabled, false);
    btRec.focus(); btRec.click();                 // ativação pelo teclado: o foco está no botão
    const vendas2 = raiz.querySelector("section[data-bloco=vendas]");
    assert.ok(vendas2.classList.contains("ini-rec")); assert.equal(vendas2.querySelector(".ini-bloco-corpo").hidden, true);
    assert.equal(vendas2.querySelector("[data-k=bl-rec-vendas]").getAttribute("aria-expanded"), "false");
    assert.match(vendas2.querySelector("[data-k=bl-rec-vendas]").getAttribute("aria-label"), /Mostrar «Vendas»/);
    assert.deepEqual(JSON.parse(dom.mem.get(chaveBlocos)).recolhidos, ["vendas"]);
    assert.equal(dom.doc.activeElement.dataset.k, "bl-rec-vendas", "o foco fica no botão depois do redesenho");
    // mover «Atendimento» para antes de «Agora» (pelo teclado: o foco está no botão)
    const btAnt = raiz.querySelector("[data-k=bl-ant-atendimento]");
    btAnt.focus(); btAnt.click();
    const ordem1 = raiz.querySelector(".ini-grade").querySelectorAll("section[data-bloco]").map(s => s.dataset.bloco);
    assert.deepEqual(ordem1.slice(0, 2), ["atendimento", "agora"]);
    assert.equal(raiz.querySelector("[data-k=bl-ant-atendimento]").disabled, true, "na ponta, «antes» desliga");
    assert.equal(dom.doc.activeElement.dataset.k, "bl-dep-atendimento", "o «antes» voltou desligado: o foco vai para o «depois» do mesmo bloco, não para o BODY");
    const prefs = JSON.parse(dom.mem.get(chaveBlocos));
    assert.equal(prefs.ordem[0], "atendimento"); assert.deepEqual(prefs.recolhidos, ["vendas"]);
    // o primeiro bloco do «Mais detalhes» também não tem «antes»
    const det = raiz.querySelector(".ini-mais");
    assert.ok(det, "o que não pede ação continua recolhido em «Mais detalhes»");
    const primeiroRec = det.querySelectorAll("section[data-bloco]")[0];
    assert.equal(primeiroRec.querySelector(".ini-bl-bt").disabled, true);
    // restaurar
    const rest = raiz.querySelector("[data-k=bl-restaurar]");
    assert.ok(rest, "personalizou: aparece «Restaurar ordem»");
    rest.focus(); rest.click();
    assert.equal(dom.mem.has(chaveBlocos), false, "preferência apagada");
    const ordem2 = raiz.querySelector(".ini-grade").querySelectorAll("section[data-bloco]").map(s => s.dataset.bloco);
    assert.deepEqual(ordem2, ordem0); assert.equal(raiz.querySelector("section[data-bloco=vendas]").classList.contains("ini-rec"), false);
    assert.equal(raiz.querySelector("[data-k=bl-restaurar]"), null);
    assert.equal(dom.doc.activeElement.dataset.k, `bl-rec-${ordem0[0]}`, "o «Restaurar» sumiu: o foco vai para a barra do 1º bloco");
    // outra conta não herda
    dom.mem.set(chaveBlocos, JSON.stringify({ ordem: ["vendas"], recolhidos: ["agora"] }));
    ({ raiz } = await montarTela(DADO(), { dom }));
    assert.ok(raiz.querySelector("section[data-bloco=agora]").classList.contains("ini-rec"));
    assert.equal(dom.mem.has(`nx-ini-blocos:${ID_CLI}:outra`), false);
  } finally { dom.fim(); }
});

test("tela: metas do mês — sem meta o bloco fica em «Mais detalhes» com o formulário; guardar abre barra, marca do ritmo e texto honesto; consultas pedem a agenda do mês", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });     // 04/10 às 10:20: a das 09:00 de hoje já aconteceu; a das 14:30, não
  try {
    const AGENDA_MES = agendaDe([...AGENDA.consultas, { nome: "Antiga", status: "aberto", inicio: SP("2026-10-01", "09") }, { nome: "Ganha", status: "ganho", inicio: SP("2026-10-02", "09") },
      { nome: "Faltou", status: "aberto", marco: "faltou", inicio: SP("2026-10-03", "09") }]);
    let r = await montarTela(DADO(), { dom, agendaMes: AGENDA_MES });
    let metas = r.raiz.querySelector("section[data-bloco=metas]");
    assert.ok(metas.closest(".ini-mais"), "sem meta: recolhido em «Mais detalhes»");
    assert.ok(metas.querySelector(".ini-metas-form"), "formulário aberto de cara");
    assert.equal(metas.querySelector(".ini-meta"), null);
    const inpV = metas.querySelector("[name=meta_vendas]"), inpC = metas.querySelector("[name=meta_consultas]");
    assert.ok(inpV && inpC);
    assert.equal(inpC.getAttribute("inputmode"), "numeric");
    inpV.value = "50.000,00"; inpC.value = "12";
    dom.ev(metas.querySelector("form"), "submit");
    await tick(); await tick();
    assert.deepEqual(JSON.parse(dom.mem.get(chaveMetas)), { vendas: 50000, consultas: 12 });
    assert.equal(r.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.params.p_dias === 31).length, 1, "a meta de consultas pediu o mês (1º ao 31)");
    assert.equal(r.chamadas.find(c => c.nome === "nx_agenda_dia" && c.params.p_dias === 31).params.p_data, "2026-10-01");
    metas = r.raiz.querySelector("section[data-bloco=metas]");
    assert.equal(metas.closest(".ini-mais"), null, "com meta o bloco sobe para a grade");
    const linhas = metas.querySelectorAll(".ini-meta");
    assert.equal(linhas.length, 2);
    assert.ok(linhas[0].classList.contains("ini-meta-frente"));
    const barra = linhas[0].querySelector("[role=progressbar]");
    assert.equal(barra.getAttribute("aria-valuenow"), "57"); assert.equal(barra.querySelector("i").style.getPropertyValue("--w"), "56.8%");
    assert.match(barra.querySelector("b").style.getPropertyValue("--m"), /^12\.9/);
    assert.equal(texto(linhas[0].querySelector(".ini-meta-txt")), "R$ 28.400 de R$ 50.000 (57 %). Faltam R$ 21.600 — você está à frente do ritmo; no dia 4 de 31 o esperado seria R$ 6.452.");
    assert.match(texto(linhas[1]), /Consultas realizadas no mês/);
    assert.equal(texto(linhas[1].querySelector(".ini-meta-txt")), "3 de 12 (25 %). Faltam 9 — você está à frente do ritmo; no dia 4 de 31 o esperado seria 2.",
      "só as que já aconteceram (09:00 de hoje, 01/10 e 02/10): a cancelada, a falta e as marcadas para depois ficam fora");
    assert.equal(texto(linhas[1].querySelector(".ini-meta-extra")), "+3 já marcadas até o fim do mês (contam quando acontecerem) · 1 falta fica fora da conta.");
    assert.ok(linhas[1].classList.contains("ini-meta-frente"));
    assert.equal(linhas[1].querySelector("[role=progressbar]").getAttribute("aria-valuenow"), "25");
    assert.match(texto(metas.querySelector(".rel-cartao-topo")), /guardadas só neste aparelho/);
    // ajustar → cancelar; tirar metas
    metas.querySelector("[data-k=mt-editar]").click();
    metas = r.raiz.querySelector("section[data-bloco=metas]");
    assert.ok(metas.querySelector("[data-k=mt-cancelar]"));
    assert.equal(metas.querySelector("[name=meta_vendas]").value, "50.000,00", "o formulário volta com o valor guardado");
    metas.querySelector("[data-k=mt-cancelar]").click();
    metas = r.raiz.querySelector("section[data-bloco=metas]");
    assert.equal(metas.querySelector(".ini-metas-form"), null);
    metas.querySelector("[data-k=mt-editar]").click();
    r.raiz.querySelector("[data-k=mt-tirar]").click();
    assert.equal(dom.mem.has(chaveMetas), false);
    assert.ok(r.raiz.querySelector("section[data-bloco=metas]").closest(".ini-mais"), "sem meta volta para «Mais detalhes»");
    // sem agenda do mês (falhou) o texto diz que não conseguiu contar, em vez de mostrar 0
    dom.mem.set(chaveMetas, JSON.stringify({ consultas: 10 }));
    r = await montarTela(DADO(), { dom, agendaMes: null });
    assert.match(texto(r.raiz.querySelector("section[data-bloco=metas] .ini-meta-txt")), /Ainda não consegui contar as consultas deste mês/);
  } finally { dom.fim(); }
});

const kpiV = (raiz, id) => texto(raiz.querySelector(`.ini-kpi[data-kpi=${id}] .ini-kpi-v`));
const comAguardando = n => { const d = DADO(); d.conversas.aguardando = n; return d; };

test("tela: a 1ª meta sendo digitada — o pulso não apaga o campo nem tira o foco, o shell espera; «Atualizar» devolve o rascunho; apagar tudo destrava", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(DADO(), { dom });
    let inp = r.raiz.querySelector("[name=meta_vendas]");
    assert.ok(inp.closest(".ini-mais"), "sem meta: o formulário abre de cara (sem «Ajustar metas»)");
    assert.equal(r.ocupado(), false, "só abrir o formulário não trava nada");
    inp.focus(); inp.value = "12.345"; dom.ev(inp, "input");
    assert.equal(r.ocupado(), true, "digitando: o shell não troca de versão");
    // dado novo pelo pulso: a tela não é redesenhada por cima do que está sendo digitado
    r.resp.d = comAguardando(3);
    dom.andar(31000); await r.pulso();
    assert.equal(r.chamadas.filter(c => c.nome === "nx_inicio").length, 2, "o pulso leu de novo");
    assert.equal(r.raiz.querySelector("[name=meta_vendas]"), inp, "o campo é o mesmo nó");
    assert.equal(inp.value, "12.345"); assert.equal(dom.doc.activeElement, inp, "o foco continua no campo");
    assert.equal(kpiV(r.raiz, "aguardando"), "2");
    // «Atualizar» redesenha à força: o rascunho volta no campo novo, com o foco
    r.raiz.querySelector(".ini-cab .rel-btn").click(); await tick(); await tick();
    assert.equal(kpiV(r.raiz, "aguardando"), "3");
    inp = r.raiz.querySelector("[name=meta_vendas]");
    assert.equal(inp.value, "12.345", "o que foi digitado não se perde"); assert.equal(dom.doc.activeElement, inp);
    // apagar tudo destrava: o próximo pulso redesenha normalmente
    inp.value = ""; dom.ev(inp, "input");
    assert.equal(r.ocupado(), false);
    r.resp.d = comAguardando(5);
    dom.andar(31000); await r.pulso();
    assert.equal(kpiV(r.raiz, "aguardando"), "5");
  } finally { dom.fim(); }
});

test("tela: com meta de consultas o pulso não relê a agenda do mês — só ao abrir, passados 10 min, em «Atualizar», ao guardar a meta e na virada do dia", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    dom.mem.set(chaveMetas, JSON.stringify({ consultas: 10 }));
    const r = await montarTela(DADO(), { dom, agendaMes: AGENDA });
    const mes = () => r.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.params.p_dias === 31).length;
    assert.equal(mes(), 1, "ao abrir");
    for (let i = 0; i < 3; i++) { r.resp.d = comAguardando(3 + i); dom.andar(31000); await r.pulso(); }
    assert.equal(r.chamadas.filter(c => c.nome === "nx_inicio").length, 4, "três recargas pelo pulso");
    assert.equal(kpiV(r.raiz, "aguardando"), "5", "e a tela acompanhou");
    assert.equal(mes(), 1, "nenhuma delas pediu o mês de novo");
    dom.andar(10 * 60000); await r.pulso();
    assert.equal(mes(), 2, "passados 10 min a leitura do mês vence");
    r.raiz.querySelector(".ini-cab .rel-btn").click(); await tick(); await tick();
    assert.equal(mes(), 3, "«Atualizar» relê");
    const metas = r.raiz.querySelector("section[data-bloco=metas]");
    metas.querySelector("[data-k=mt-editar]").click();
    r.raiz.querySelector("[name=meta_consultas]").value = "14";
    dom.ev(r.raiz.querySelector(".ini-metas-form"), "submit"); await tick(); await tick();
    assert.deepEqual(JSON.parse(dom.mem.get(chaveMetas)), { vendas: null, consultas: 14 });
    assert.equal(mes(), 4, "guardar a meta relê");
    dom.andar(14 * 3600000); dom.relogio(); await tick(); await tick();       // 04/10 → 05/10
    assert.equal(mes(), 5, "na virada do dia o relógio relê tudo");
    assert.equal(r.chamadas.filter(c => c.nome === "nx_agenda_dia" && c.params.p_dias === 7).at(-1).params.p_data, "2026-10-05", "a semana começa no dia novo");
  } finally { dom.fim(); }
});

test("tela: a agenda falhou agora (≠ conta sem agenda) — «Não consegui ler a agenda agora» com «Tentar de novo», KPI com o motivo certo e o ponto de hoje intacto", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    dom.mem.set(chaveHist, JSON.stringify({ dias: [{ dia: HOJE, aguardando: 2, consultas: 2 }] }));
    const r = await montarTela(DADO(), { dom, agenda: new Error("503") });
    const kCons = r.raiz.querySelector(".ini-kpi[data-kpi=consultas]");
    assert.equal(texto(kCons.querySelector(".ini-kpi-v")), "—"); assert.equal(texto(kCons.querySelector(".ini-kpi-sub")), "não consegui ler a agenda");
    assert.doesNotMatch(texto(r.raiz), /não está disponível para a sua conta/, "falha passageira não vira «sem permissão»");
    const agora = r.raiz.querySelector("section[data-bloco=agora]");
    assert.match(texto(agora.querySelector(".ini-agora-ag")), /Não consegui ler a agenda agora\.\s*Tentar de novo/);
    assert.match(texto(r.raiz.querySelector("section[data-bloco=horas]")), /Não consegui ler a agenda agora\..*Tentar de novo/);
    assert.equal(JSON.parse(dom.mem.get(chaveHist)).dias.find(x => x.dia === HOJE).consultas, 2, "a falha não apaga o ponto de consultas de hoje");
    // «Tentar de novo»: relê e a agenda volta
    r.resp.agenda = AGENDA;
    const antes = r.chamadas.length;
    agora.querySelector("[data-k=ag-tentar]").click(); await tick(); await tick();
    assert.ok(r.chamadas.slice(antes).some(c => c.nome === "nx_agenda_dia" && c.params.p_dias === 7));
    assert.equal(kpiV(r.raiz, "consultas"), "2"); assert.equal(r.raiz.querySelector("[data-k=ag-tentar]"), null);
    // no pulso, uma falha passageira mantém a leitura de hoje (as barras não viram erro por 30 s)
    r.resp.agenda = new Error("503"); r.resp.d = comAguardando(4);
    dom.andar(31000); await r.pulso();
    assert.equal(kpiV(r.raiz, "aguardando"), "4", "o pulso redesenhou");
    assert.equal(kpiV(r.raiz, "consultas"), "2"); assert.equal(r.raiz.querySelector("[data-k=ag-tentar]"), null);
  } finally { dom.fim(); }
});

test("tela: a 1ª pintura pelo cache, com a agenda ainda a caminho (repetindo depois de um 503), diz «lendo a agenda» — nunca «não disponível para a sua conta»", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    let soltar = null;
    const agendaLenta = () => new Promise((_, falhar) => { soltar = () => falhar(new Error("503")); });
    const r = await montarTela(DADO(), { dom, conta: "conta-cache", agenda: agendaLenta, cacheInicio: DADO(), esperar: false });
    assert.ok(r.raiz.querySelector(".ini-kpi"), "a tela já foi pintada pelo cache");
    assert.equal(texto(r.raiz.querySelector(".ini-kpi[data-kpi=consultas] .ini-kpi-sub")), "lendo a agenda…");
    assert.match(texto(r.raiz.querySelector("section[data-bloco=agora] .ini-agora-ag")), /Lendo a agenda…/);
    assert.match(texto(r.raiz.querySelector("section[data-bloco=horas]")), /Lendo a agenda…/);
    assert.doesNotMatch(texto(r.raiz), /não está disponível para a sua conta/);
    soltar(); await r.pronto; await tick();
    assert.match(texto(r.raiz.querySelector("section[data-bloco=agora] .ini-agora-ag")), /Não consegui ler a agenda agora/);
    assert.ok(r.raiz.querySelector("[data-k=ag-tentar]"));
  } finally { dom.fim(); }
});

test("tela: relógio de 60 s — «Agora» e a hora das barras andam sem dado novo e sem RPC; o bloco com o foco dentro e as metas em edição ficam; desmontar limpa", async () => {
  const dom = comDom({ agora: Date.parse(SP(HOJE, "10", "20")) });
  try {
    const r = await montarTela(DADO(), { dom });
    const relogios = () => [...dom.intervalos.values()].filter(x => x.ms === 60000).length;
    assert.equal(relogios(), 1, "um relógio de 60 s");
    let agora = r.raiz.querySelector("section[data-bloco=agora]");
    assert.match(texto(agora.querySelector(".rel-cartao-topo")), /às 10:20/);
    assert.match(texto(agora.querySelector(".ini-prox-proxima")), /Rafael Mendes/);
    const horas0 = r.raiz.querySelector("section[data-bloco=horas]");
    horas0.querySelector(".seg [data-valor=hoje]").click();          // o modo do gráfico fica guardado entre montagens: volta para «Hoje»
    assert.match(horas0.querySelector(".ini-bv-agora").getAttribute("aria-label"), /^10h/);
    assert.equal(horas0.querySelector(".ini-bv-agora").getAttribute("tabindex"), "0", "o Tab entra na hora corrente");
    const n0 = r.chamadas.length;
    dom.andar((4 * 60 + 20) * 60000); dom.relogio();            // 14:40: a consulta das 14:30 está acontecendo
    assert.equal(r.chamadas.length, n0, "o relógio não chama RPC");
    agora = r.raiz.querySelector("section[data-bloco=agora]");
    assert.match(texto(agora.querySelector(".rel-cartao-topo")), /às 14:40/);
    assert.match(texto(agora.querySelector(".ini-prox-agora")), /Rafael Mendes/, "passou de «próxima» para «agora»");
    assert.equal(agora.classList.contains("rel-entra"), false, "refeito sem animar de novo");
    const horas1 = r.raiz.querySelector("section[data-bloco=horas]");
    assert.notEqual(horas1, horas0); assert.match(horas1.querySelector(".ini-bv-agora").getAttribute("aria-label"), /^14h/);
    assert.equal(horas1.querySelector(".ini-bv-lista").classList.contains("ini-anim"), false);
    assert.equal(horas1.querySelectorAll(".ini-bv").filter(b => b.getAttribute("tabindex") === "0")[0].getAttribute("aria-label").slice(0, 3), "14h");
    // na mesma hora, as barras não são refeitas (perderiam «Ver como tabela»)
    dom.andar(60000); dom.relogio();
    assert.equal(r.raiz.querySelector("section[data-bloco=horas]"), horas1);
    // foco dentro do bloco: ele fica como está
    agora = r.raiz.querySelector("section[data-bloco=agora]");
    const abrir = agora.querySelector("[data-k^=px-]"); abrir.focus();
    dom.andar(60000); dom.relogio();
    assert.equal(r.raiz.querySelector("section[data-bloco=agora]"), agora, "com o foco dentro, o bloco não é refeito");
    assert.equal(dom.doc.activeElement, abrir);
    abrir.blur();
    // metas em edição: o relógio espera
    const inp = r.raiz.querySelector("[name=meta_vendas]");
    inp.value = "1.000"; dom.ev(inp, "input");
    dom.andar(60000); dom.relogio();
    assert.equal(r.raiz.querySelector("section[data-bloco=agora]"), agora, "digitando as metas, nada é refeito");
    inp.value = ""; dom.ev(inp, "input");
    dom.relogio();
    assert.notEqual(r.raiz.querySelector("section[data-bloco=agora]"), agora);
    I.desmontar();
    assert.equal(relogios(), 0, "desmontar limpa o relógio");
  } finally { dom.fim(); }
});

test("tela: sem agenda (conta sem CRM) nada quebra — KPI «—», «Agora» explica, barras explicam; sem ninguém esperando o «Agora» mostra o selo de ok", async () => {
  const dom = comDom();
  try {
    const d = DADO(); d.conversas = { aguardando: 0, sem_dono: 0, minhas: 1, abertas: 1, pendentes: 0, espera_mais_antiga_min: null };
    const { raiz } = await montarTela(d, { dom, agenda: null });
    const kCons = raiz.querySelector(".ini-kpi[data-kpi=consultas]");
    assert.equal(texto(kCons.querySelector(".ini-kpi-v")), "—"); assert.equal(texto(kCons.querySelector(".ini-kpi-sub")), "agenda indisponível");
    assert.ok(raiz.querySelector(".ini-kpi[data-kpi=aguardando]").classList.contains("ini-kpi-ok"));
    const agora = raiz.querySelector("section[data-bloco=agora]");
    assert.ok(agora.closest(".ini-mais"), "sem urgência nem agenda, «Agora» fica recolhido");
    assert.match(texto(agora.querySelector(".ini-agora-ok")), /Ninguém esperando resposta/);
    assert.match(texto(agora.querySelector(".ini-agora-ag")), /A agenda não está disponível/);
    assert.match(texto(raiz.querySelector("section[data-bloco=horas]")), /A agenda não está disponível/);
    assert.equal(JSON.parse(dom.mem.get(chaveHist)).dias[0].consultas, null, "sem agenda o histórico guarda null, não 0");
  } finally { dom.fim(); }
});

test("tela: cliente zerado continua com «Tudo pronto para começar» (sem KPIs nem blocos)", async () => {
  const dom = comDom();
  try {
    const d = { hoje: HOJE, conversas: { aguardando: 0, abertas: 0, pendentes: 0 }, tarefas: { hoje: 0, atrasadas: 0, proximas: [] }, negocios: { abertos: 0, ganhos_mes: 0, receita_mes: 0 }, leads: { semana: 0 }, canais: [] };
    const { raiz } = await montarTela(d, { dom, agenda: agendaDe([]) });
    assert.ok(raiz.querySelector(".vazio-primeiro")); assert.equal(raiz.querySelectorAll(".ini-kpi").length, 0); assert.equal(raiz.querySelector(".ini-grade"), null);
  } finally { dom.fim(); }
});

/* ============================================================ (c) ESTÁTICA (complemento) */
test("inicio.css: só tokens (sem hex, sem duração/curva solta, sem 1fr solto), [hidden] forte, movimento reduzido, sem transition all; inicio.js carrega o CSS e não usa innerHTML", () => {
  const css = ler("inicio.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "hex de cor");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  assert.ok(!/(?<![\d.])1fr\b/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), "1fr solto");
  assert.ok(!/cubic-bezier|\b\d+m?s\b(?![\w-])/.test(css.replace(/var\(--[\w-]+\)/g, "")), "curva/duração fora dos tokens");
  assert.ok(!/ease-in(?!-out)/.test(css));
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ini \*, \.ini \*::before, \.ini \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(css, /\.ini-metas-form \.campo input \{ font-size: var\(--fs-16\); min-height: 44px; \}/, "campos com --fs-16 e 44 px");
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 760px\) \{[^}]*\.ini-bl-bt \{ width: 44px; height: 44px;/, "alvos de 44 px no toque");
  assert.match(css, /\.ini-kpi:focus-visible \{ outline: var\(--foco-largura, 2px\) solid var\(--c-foco\)/, "foco visível no KPI");
  const js = ler("inicio.js");
  assert.match(js, /ui\.carregarCss\("inicio\.css"\)/);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/);
  assert.match(js, /typeof G\.sparkline === "function"/, "sparkline da frente A por detecção, com fallback local");
  assert.match(js, /"nx_agenda_dia", \{ p_data: L\.hojeSP\(\), p_dias: 7 \}, \{ cache: true \}/);
  assert.match(js, /if \(!podeAgenda \|\| !lerMetas\(\)\.consultas\) return null;/, "a agenda do mês só com meta de consultas");
});
