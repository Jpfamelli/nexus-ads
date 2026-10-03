import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as N from "../web/nucleo.js";
import { gerarDemo } from "../web/demo.js";
import * as Logica from "../web/app/rel-logica.js";
import * as Ads from "../web/app/anuncios.js";
import * as Inicio from "../web/app/inicio.js";
import * as Relatorios from "../web/app/relatorios.js";
import * as Graficos from "../web/app/graficos.js";

let passou = 0, falhou = 0;
async function teste(nome, fn) {
  try { await fn(); passou++; console.log(`  ✓ ${nome}`); }
  catch (erro) { falhou++; console.error(`  ✗ ${nome}\n      ${String(erro?.stack || erro).split("\n").slice(0, 5).join("\n      ")}`); }
}

function hFake(tag, attrs = {}, ...filhos) {
  const eventos = {};
  const el = { tag, attrs, dataset: attrs.dataset || {}, filhos: filhos.flat(Infinity).filter(x => x != null), eventos,
    value: attrs.value ?? "", click() { eventos.click?.({ currentTarget: el }); },
    append(...xs) { this.filhos.push(...xs.flat(Infinity).filter(x => x != null)); },
    replaceChildren(...xs) { this.filhos = xs.flat(Infinity).filter(x => x != null); },
    addEventListener(k, fn) { eventos[k] = fn; },
    remove() {}, focus() {},
    setAttribute(k, v) { attrs[k] = String(v); },
    get textContent() { return this.filhos.map(x => typeof x === "string" ? x : x?.textContent || "").join(""); } };
  for (const [tipo, fn] of Object.entries(attrs.on || {})) eventos[tipo] = fn;
  return el;
}
const buscarNo = (raiz, pred) => {
  if (pred(raiz)) return raiz;
  for (const f of raiz?.filhos || []) { const achou = buscarNo(f, pred); if (achou) return achou; }
  return null;
};
const cssAds = readFileSync(new URL("../web/app/relatorios.css", import.meta.url), "utf8");

// Fixture local e fictícia: reproduz o formato devolvido por nx_dados no dev-falso.
const HOJE = "2026-10-03";
const ds = gerarDemo({ nome: "Clínica Sorriso Vivo", hoje: HOJE });
const md = N.montar(ds);
const iso = i => N.isoDe(md.dataDe(i));
const metricas = ds.LINHAS.map(l => ({
  p: l.plat, d: iso(l.i), n: "anuncio", c: l.camp, cn: ds.CAMP[l.camp].nome,
  a: l.cri, an: ds.CRI[l.cri].nome, imp: l.impressoes, alc: l.alcance,
  freq: l.freq || 0, cli: l.cliques, g: l.gasto, conv: l.conversoes,
}));
const leads = ds.LEADS.filter(l => l.i <= md.R).map(l => ({
  id: l.id, nome: l.nome, telefone: "", origem: "anuncio", plataforma: l.plat,
  campanha_ext: l.camp, anuncio_ext: l.cri, servico: l.servico, etapa: md.etapa(l),
  data_conversa: iso(l.i), data_agenda: l.iAgenda == null ? null : iso(l.iAgenda),
  data_consulta: l.iConsulta == null ? null : iso(l.iConsulta),
  valor: l.fechou ? md.valorLead(l) : null, obs: "",
}));
const M = N.montar(N.datasetDeLinhas({
  metricas, leads, cliente: { nome: "Clínica Sorriso Vivo", cfg: {} }, hoje: HOJE, dias: 130,
}));

console.log("\nQA dev-falso — Anúncios, Início e Relatórios");

await teste("recorte de 7/30/60 dias reconcilia gasto e conversões entre KPIs e série, sem somar canais ou períodos diferentes", () => {
  for (const dias of [7, 30, 60]) for (const plat of ["", "meta", "google"]) {
    const P = Logica.numerosPeriodo(M, { dias, plat });
    const serie = Logica.serieDiaria(M, { dias, plat }).atual;
    const r = Ads.reconciliarSerieAds(P, serie);
    assert.equal(r.gastoAlinha, true, `${dias}d/${plat || "todos"}: série R$${r.gastoSerie} ≠ total R$${r.gastoFiltro}`);
    assert.equal(r.conversoesAlinha, true, `${dias}d/${plat || "todos"}: série ${r.conversoesSerie} ≠ Ads ${r.conversoesFiltro}`);
    assert.deepEqual([r.de, r.ate, r.plat], [P.de, P.ate, plat]);
  }
  assert.equal(Ads.reconciliarSerieAds({ t: { gasto: 0, conversoes: 0.3 } }, [{ gasto: 0, conv: 0.1 }, { gasto: 0, conv: 0.2 }]).conversoesAlinha, true,
    "conversões fracionadas não divergem por ruído binário de ponto flutuante");
});

await teste("Meta + Google fecham exatamente o total do mesmo intervalo; conversão Ads não é sinônimo de conversa CRM", () => {
  const tudo = Logica.numerosPeriodo(M, { dias: 30 });
  const meta = Logica.numerosPeriodo(M, { dias: 30, plat: "meta" });
  const google = Logica.numerosPeriodo(M, { dias: 30, plat: "google" });
  assert.equal(Math.round((meta.t.gasto + google.t.gasto) * 100), Math.round(tudo.t.gasto * 100));
  assert.equal(meta.t.conversoes + google.t.conversoes, tudo.t.conversoes);
  const extra = { id: 999001, nome: "Contato fictício sem conversão da plataforma", telefone: "", origem: "anuncio",
    plataforma: "meta", campanha_ext: "m1", anuncio_ext: "id-sem-metrica", etapa: "nova", data_conversa: "2026-10-02", obs: "" };
  const comCRMExtra = N.montar(N.datasetDeLinhas({ metricas, leads: [...leads, extra], cliente: { nome: "Fictício", cfg: {} }, hoje: HOJE, dias: 130 }));
  const crm = Logica.numerosPeriodo(comCRMExtra, { dias: 30, plat: "meta" });
  assert.equal(crm.c.conversas, meta.c.conversas + 1);
  assert.equal(crm.t.conversoes, meta.t.conversoes, "novo registro CRM não inventa conversão Meta");
});

await teste("o orçamento identifica mês até ontem e sua projeção, sem misturar com os últimos 30 dias", () => {
  const p = Logica.numerosPeriodo(M, { dias: 30 });
  const m = M.ritmoMes(M.R);
  assert.equal(M.dataBR(p.ate), "02/10/2026");
  assert.equal(m.pass, 2);
  assert.ok(Math.round(m.gasto * 100) !== Math.round(p.t.gasto * 100), "mês parcial deve ficar distinto da janela de 30 dias");
  const descr = Ads.descricaoOrcamentoMensal(m, M.dataBR, N.brl0);
  assert.match(descr, /01\/10\/2026 a 02\/10\/2026/);
  assert.match(descr, /mês até ontem/);
  assert.match(descr, /projeção/);
});

await teste("descrição acessível anuncia datas inclusivas e canal selecionado do gráfico", () => {
  const P = Logica.numerosPeriodo(M, { dias: 30, plat: "google" });
  const texto = Ads.descricaoPeriodoAds(P, M.dataBR, Logica.nomePlat);
  assert.match(texto, /03\/09\/2026 a 02\/10\/2026/);
  assert.match(texto, /Google/);
  assert.match(texto, /30 dias/);
});

await teste("campanhas: busca ignora acentos e filtros separam resultados do CRM", () => {
  const rows = [
    { c: { nome: "Invisível · ângulo da dor", plat: "meta" }, k: { agendadas: 0, fecharam: 0, receita: 0 } },
    { c: { nome: "Pesquisa · dentista Taubaté", plat: "google" }, k: { agendadas: 3, fecharam: 1, receita: 500 } },
    { c: { nome: "Só iniciou conversa", plat: "meta" }, k: { conversas: 1, agendadas: 0, fecharam: 0, receita: 0 } },
  ];
  assert.deepEqual(Ads.filtrarCampanhas(rows, { busca: "INVISIVEL" }), [rows[0]]);
  assert.deepEqual(Ads.filtrarCampanhas(rows, { resultado: "com_crm" }), [rows[1], rows[2]]);
  assert.deepEqual(Ads.filtrarCampanhas(rows, { resultado: "sem_crm" }), [rows[0]]);
});

await teste("painel de campanhas expõe busca/filtro/CSV e a UI fake executa aplicar, comparar e exportar", () => {
  const linhas = [
    { c: { id: "a", nome: "Invisível · ângulo da dor", plat: "meta" }, t: { gasto: 100, conversoes: 10, cpa: 10 }, k: { conversas: 8, agendadas: 4, fecharam: 2, receita: 500 }, roas: 5 },
    { c: { id: "b", nome: "Pesquisa · dentista Taubaté", plat: "google" }, t: { gasto: 80, conversoes: 8, cpa: 10 }, k: { conversas: 0, agendadas: 0, fecharam: 0, receita: 0 }, roas: 0 },
  ];
  let estado = { busca: "", resultado: "todos", comparacao: [] }, painel, exportadas = null;
  const criar = () => Ads.criarPainelCampanhas({ h: hFake, linhas, estado, periodo: "01/10/2026 a 02/10/2026",
    moeda: String, inteiro: String, decimal: String,
    aoFiltrar: f => { estado = { ...estado, ...f }; painel = criar(); },
    aoComparar: (id, r) => { assert.equal(r.alterou, true); estado = { ...estado, comparacao: r.ids }; painel = criar(); },
    aoLimpar: () => { estado = { busca: "", resultado: "todos", comparacao: [] }; painel = criar(); },
    aoExportar: rows => { exportadas = rows; } });
  painel = criar();
  assert.match(painel.elemento.textContent, /Buscar campanha/i);
  assert.match(painel.elemento.textContent, /resultado no CRM/i);
  const busca = buscarNo(painel.elemento, n => n.tag === "input");
  const filtro = buscarNo(painel.elemento, n => n.tag === "select");
  busca.value = "INVISIVEL"; filtro.value = "com_crm";
  buscarNo(painel.elemento, n => n.tag === "button" && /Aplicar filtros/.test(n.textContent)).click();
  assert.deepEqual(painel.linhas.map(x => x.c.id), ["a"]);
  painel.botaoComparar(painel.linhas[0]).click();
  assert.match(painel.elemento.textContent, /Invisível/);
  assert.match(painel.elemento.textContent, /Agendamentos CRM ÷ conversões Ads/);
  assert.match(painel.elemento.textContent, /evento.*coorte/i);
  buscarNo(painel.elemento, n => n.tag === "button" && /Exportar CSV filtrado/.test(n.textContent)).click();
  assert.deepEqual(exportadas.map(x => x.c.id), ["a"]);
  buscarNo(painel.elemento, n => n.tag === "button" && /Limpar filtros/.test(n.textContent)).click();
  assert.deepEqual(painel.linhas.map(x => x.c.id), ["a", "b"], "limpar devolve a lista sem perder a comparação selecionada");
});

await teste("filtros de campanha reorganizam em tablet/celular e preservam alvos táteis", () => {
  assert.match(cssAds, /\.ads-camp-filtros\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s+minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/s);
  assert.match(cssAds, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.ads-camp-filtros\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(cssAds, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.ads-camp-filtros\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\);/);
  assert.match(cssAds, /\.ads-camp-filtros\s*>\s*\.bt\s*\{[^}]*min-height:\s*44px/);
});

await teste("comparação de campanhas é limitada a três e permite desmarcar", () => {
  let ids = [];
  for (const id of ["a", "b", "c"]) ids = Ads.alternarComparacaoCampanhas(ids, id).ids;
  const bloqueada = Ads.alternarComparacaoCampanhas(ids, "d");
  assert.equal(bloqueada.alterou, false);
  assert.deepEqual(bloqueada.ids, ["a", "b", "c"]);
  assert.deepEqual(Ads.alternarComparacaoCampanhas(ids, "b").ids, ["a", "c"]);
});

await teste("comparação não reaproveita campanha selecionada de outra empresa", () => {
  const estadoAnterior = { busca: "", resultado: "todos", comparacao: ["cliente-anterior"] };
  const painel = Ads.criarPainelCampanhas({ h: hFake, linhas: [{ c: { id: "cliente-atual", nome: "Atual", plat: "meta" },
    t: { gasto: 0, conversoes: 0, cpa: null }, k: { conversas: 0, agendadas: 0, fecharam: 0, receita: 0 }, roas: null }], estado: estadoAnterior });
  assert.deepEqual(estadoAnterior.comparacao, [], "ids inexistentes no novo conjunto são removidos na inicialização");
  assert.doesNotMatch(painel.elemento.textContent, /cliente-anterior/);
});

await teste("taxas do funil declaram denominadores diferentes e retornam vazio em base zero", () => {
  const t = Ads.taxasFunilCampanha({ t: { conversoes: 20 }, k: { agendadas: 5, fecharam: 2 } });
  assert.deepEqual(t, { agendaSobreConversoesAds: 25, fechamentoSobreAgendadasCrm: 40 });
  assert.deepEqual(Ads.taxasFunilCampanha({ t: { conversoes: 0 }, k: { agendadas: 0, fecharam: 0 } }),
    { agendaSobreConversoesAds: null, fechamentoSobreAgendadasCrm: null });
});

await teste("CSV de campanhas separa métricas Ads/CRM e escapa fórmula em nome", () => {
  const row = { c: { nome: "=HYPERLINK(\"https://x\")", plat: "meta" }, t: { gasto: 100, conversoes: 10, cpa: 10 },
    k: { conversas: 8, agendadas: 4, fecharam: 2, receita: 500 }, roas: 5 };
  const out = Ads.csvCampanhas([row], { periodo: "03/09/2026 a 02/10/2026", csv: Logica.csv,
    moeda: x => String(x), inteiro: x => String(x), decimal: x => String(x) });
  assert.match(out, /Conversões da plataforma/);
  assert.match(out, /Agendamentos CRM/);
  assert.match(out, /'=/);
  assert.match(out, /03\/09\/2026 a 02\/10\/2026/);
});

await teste("Início exibe falha de atualização com último horário confirmado e só oferece rotas autorizadas", () => {
  assert.match(Inicio.statusAtualizacaoInicio({ hora: "09:12", falhou: true }), /falhou.*09:12/i);
  assert.deepEqual(Inicio.atalhosLeadsInicio({ crm: true, ads: false }), [{ rotulo: "Abrir CRM", href: "#/crm" }]);
  assert.deepEqual(Inicio.atalhosLeadsInicio({ crm: false, ads: false }), []);
});

await teste("Relatórios mostra a janela anterior exata e limpa só filtros ativos do cliente", () => {
  const j = Relatorios.janelaComparacao("2026-01-01", "2026-01-07");
  assert.deepEqual(j, { dias: 7, atual: { de: "2026-01-01", ate: "2026-01-07" }, anterior: { de: "2025-12-25", ate: "2025-12-31" } });
  const p = { preset: "per", de: "2026-01-01", ate: "2026-01-07", funil: { c1: "f1", c2: "f2" }, dep: { c1: "d1" }, outro: true };
  assert.deepEqual(Relatorios.limparFiltrosRelatorios(p, "c1"), { ...p, preset: 30, de: null, ate: null,
    funil: { c1: "", c2: "f2" }, dep: { c1: "" } });
});

await teste("odômetro anima com a aba visível, mas conclui valor exato se a aba fica oculta ou já estava oculta", () => {
  const antes = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle,
    matchMedia: globalThis.matchMedia, requestAnimationFrame: globalThis.requestAnimationFrame };
  const frames = [];
  const listeners = new Map();
  const doc = { hidden: false, documentElement: {}, addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k) };
  try {
    globalThis.document = doc;
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "0.9s" });
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
    const attrs = {};
    const el = { textContent: "", isConnected: true, setAttribute: (k, v) => { attrs[k] = String(v); } };
    Graficos.contar(el, 107, n => String(Math.round(n)));
    assert.equal(el.textContent, "0");
    assert.equal(frames.length, 1, "com a aba visível, mantém o odômetro");
    assert.equal(attrs["aria-label"], "107", "árvore acessível recebe o valor final, nunca o parcial");
    assert.equal(Graficos.duracaoToken("--t-dados"), 900);
    doc.hidden = true;
    listeners.get("visibilitychange")?.();
    assert.equal(el.textContent, "107", "ocultar a aba conclui imediatamente o valor");
    assert.equal(listeners.has("visibilitychange"), false, "remove o listener ao concluir");
    frames[0](performance.now() + 100);
    assert.equal(el.textContent, "107", "callback pendente não volta a escrever um valor parcial");

    globalThis.matchMedia = () => ({ matches: true });
    frames.length = 0;
    const movimentoReduzido = { textContent: "", isConnected: true, setAttribute: (k, v) => { attrs[k] = String(v); } };
    Graficos.contar(movimentoReduzido, 8, n => String(Math.round(n)));
    assert.equal(frames.length, 0, "prefers-reduced-motion desliga o odômetro");
    assert.equal(movimentoReduzido.textContent, "8");

    frames.length = 0;
    globalThis.matchMedia = () => ({ matches: false });
    const oculto = { textContent: "", isConnected: true, setAttribute: (k, v) => { attrs[k] = String(v); } };
    Graficos.contar(oculto, 44, n => String(Math.round(n)));
    assert.equal(oculto.textContent, "44");
    assert.equal(frames.length, 0, "não inicia rAF se a aba já está oculta");

    doc.hidden = false;
    frames.length = 0;
    const moeda = hFake("b"); moeda.isConnected = true; moeda.classList = { add() {} };
    const uiMoeda = { limpar: el => el.replaceChildren(), h: hFake };
    Logica.contarMoeda(uiMoeda, Graficos, moeda, 1400, { centavos: false });
    assert.equal(frames.length, 1, "moeda também anima quando visível");
    assert.equal(moeda.attrs["aria-label"], Logica.textoMoeda(1400, { centavos: false }));
    doc.hidden = true;
    listeners.get("visibilitychange")?.();
    assert.equal(moeda.textContent, "R$1.400", "moeda também finaliza ao ocultar a aba");
  } finally {
    for (const [k, v] of Object.entries(antes)) v === undefined ? delete globalThis[k] : globalThis[k] = v;
  }
});

console.log(`\n${passou} passaram; ${falhou} falharam.`);
if (falhou) process.exitCode = 1;
