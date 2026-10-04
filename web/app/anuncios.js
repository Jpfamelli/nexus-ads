/* ============================================================
   ÓRBITA — anuncios.js (frente F6) · tela T11 Anúncios
   O Nexus Ads dentro do app: carrega nx_dados(p_dias = 130) e monta
   com o MESMO web/nucleo.js do painel clássico (datasetDeLinhas +
   montar). As contas do período vêm de rel-logica.numerosPeriodo, que
   é cópia fiel da do painel — os números nunca discordam (teste de
   igualdade em testes/relatorios.teste.mjs).
   Rotas: #/anuncios · #/anuncios/campanhas · #/anuncios/radar ·
          #/anuncios/relatorios
   ============================================================ */

const DIAS_JANELA = 130;             // igual ao painel clássico
const VALIDADE_MS = 5 * 60 * 1000;   // números do Ads mudam de hora em hora
const URL_PAINEL = "https://jpfamelli.github.io/nexus-ads/";
const PERIODOS = [7, 30, 60];
const PLATS = [["", "Tudo"], ["meta", "Meta"], ["google", "Google"]];
const ABAS = [
  { id: "", rotulo: "Visão geral", hash: "#/anuncios" },
  { id: "campanhas", rotulo: "Campanhas", hash: "#/anuncios/campanhas" },
  { id: "radar", rotulo: "Radar", hash: "#/anuncios/radar" },
  { id: "relatorios", rotulo: "Relatórios", hash: "#/anuncios/relatorios" },
];

let N = null, L = null, G = null;    // nucleo.js, rel-logica.js, graficos.js
const cache = new Map();             // clienteId → {dados, M, em}
const S = { dias: 30, plat: "", ordem: { chave: "gasto", dir: -1 }, rel: null, rank: null,
  buscaCamp: "", resultadoCamp: "todos", comparacaoCamp: [] };
let graficos = [], tPilula = 0, montagem = 0;

const centavos = n => Math.round((Number(n) || 0) * 100);
const nomeNormalizado = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/** Totais devem reconciliar com a série do MESMO período e plataforma; CRM não entra nos totais Ads. */
export function reconciliarSerieAds(P, serie = []) {
  const gastoSerie = serie.reduce((s, d) => s + (Number(d.gasto) || 0), 0);
  const conversoesSerie = serie.reduce((s, d) => s + (Number(d.conv) || 0), 0);
  const gastoFiltro = Number(P?.t?.gasto) || 0, conversoesFiltro = Number(P?.t?.conversoes) || 0;
  return { de: P?.de, ate: P?.ate, plat: P?.plat || "", gastoSerie, gastoFiltro, conversoesSerie, conversoesFiltro,
    gastoAlinha: centavos(gastoSerie) === centavos(gastoFiltro), conversoesAlinha: Math.abs(conversoesSerie - conversoesFiltro) < 1e-9 };
}

/** Rótulo inclusivo: índice do primeiro e último dia, e canal exato do recorte fechado. */
export function descricaoPeriodoAds(P, dataBR, nomePlat) {
  const canal = P?.plat ? nomePlat(P.plat) : "todas as plataformas";
  return `Últimos ${P?.dias || 0} dias (${dataBR(P.de)} a ${dataBR(P.ate)}) · ${canal} · dados fechados até ontem`;
}

/** O orçamento acompanha o mês-calendário até ontem; projeção é linear, não parte dos últimos N dias. */
export function descricaoOrcamentoMensal(m, _dataBR, brl0) {
  const fmt = dia => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(Date.UTC(m.ano, m.mes, dia)));
  return `${fmt(1)} a ${fmt(m.pass)} · mês até ontem · todas as plataformas · ${brl0(m.gasto)} acumulados; projeção linear: gasto acumulado ÷ ${m.pass} dias decorridos × ${m.diasMes} dias do mês = ${brl0(m.proj)}`;
}

export function filtrarCampanhas(linhas = [], { busca = "", resultado = "todos" } = {}) {
  const q = nomeNormalizado(busca.trim());
  return linhas.filter(r => {
    if (q && !nomeNormalizado(r?.c?.nome).includes(q)) return false;
    const temCRM = (Number(r?.k?.conversas) || 0) > 0 || (Number(r?.k?.agendadas) || 0) > 0 || (Number(r?.k?.fecharam) || 0) > 0 || (Number(r?.k?.receita) || 0) > 0;
    return resultado === "com_crm" ? temCRM : resultado === "sem_crm" ? !temCRM : true;
  });
}

export function alternarComparacaoCampanhas(ids = [], id) {
  const lista = ids.filter(x => x !== id);
  if (lista.length !== ids.length) return { alterou: true, ids: lista, cheia: false };
  if (ids.length >= 3) return { alterou: false, ids: [...ids], cheia: true };
  return { alterou: true, ids: [...ids, id], cheia: false };
}

export function taxasFunilCampanha(r) {
  const taxa = (n, d) => Number(d) > 0 ? Math.round((Number(n) || 0) / Number(d) * 10000) / 100 : null;
  return { agendaSobreConversoesAds: taxa(r?.k?.agendadas, r?.t?.conversoes),
    fechamentoSobreAgendadasCrm: taxa(r?.k?.fecharam, r?.k?.agendadas) };
}

/** Exportação de campanhas separa campos Ads e CRM e reutiliza o CSV formula-safe do módulo de relatórios. */
export function csvCampanhas(rows, { periodo, csv, moeda, inteiro, decimal }) {
  const colunas = ["Período", "Campanha", "Plataforma", "Investimento Ads", "Conversões da plataforma", "CPA da plataforma",
    "Conversas CRM", "Agendamentos CRM", "Fechamentos CRM", "Receita CRM", "ROAS (receita CRM ÷ investimento Ads)"];
  // números crus (L.csv troca o ponto por vírgula e deixa vazio o que não é finito): no Excel a coluna soma, «R$ 359» em texto não
  const num = (v, casas) => (Number.isFinite(v) ? Math.round(v * 10 ** casas) / 10 ** casas : "");
  const linhas = rows.map(r => [periodo, r.c.nome, r.c.plat, num(r.t.gasto, 2), num(r.t.conversoes, 0), num(r.t.cpa, 2),
    num(r.k.conversas, 0), num(r.k.agendadas, 0), num(r.k.fecharam, 0), num(r.k.receita, 2), num(r.roas, 1)]);
  void moeda; void inteiro; void decimal;
  return csv(colunas, linhas);
}

/** Componente puro da área de filtros/comparação: a tela real e o teste dirigem os mesmos eventos. */
export function criarPainelCampanhas({ h, limpar, linhas = [], estado = {}, periodo = "", moeda = String, moedaCent = moeda,
  inteiro = String, decimal = String, aoFiltrar = () => {}, aoComparar = () => {}, aoLimpar = () => {},
  aoExportar = () => {}, aoAviso = () => {}, aoFocoComparar = () => {} }) {
  if (typeof h !== "function") throw new TypeError("criarPainelCampanhas exige o criador de elementos h");
  const raiz = h("section", { class: "ads-painel-camp", "aria-label": "Filtros e comparação de campanhas" });
  const st = { busca: String(estado.busca || ""), resultado: ["todos", "com_crm", "sem_crm"].includes(estado.resultado) ? estado.resultado : "todos",
    comparacao: Array.isArray(estado.comparacao) ? [...estado.comparacao].slice(0, 3) : [] };
  let visiveis = [];

  function render() {
    visiveis = filtrarCampanhas(linhas, st);
    const busca = h("input", { type: "search", class: "ads-camp-busca-input", value: st.busca, autocomplete: "off",
      placeholder: "Ex.: implante…", "aria-label": "Buscar campanha por nome" });
    const filtro = h("select", { class: "ads-camp-resultado", "aria-label": "Filtrar campanhas pela atividade no CRM" },
      h("option", { value: "todos" }, "Todas as campanhas"),
      h("option", { value: "com_crm" }, "Com atividade no CRM"),
      h("option", { value: "sem_crm" }, "Sem atividade no CRM"));
    filtro.value = st.resultado;
    const status = h("p", { class: "rel-nota ads-camp-resumo", role: "status", "aria-live": "polite" },
      visiveis.length ? `${visiveis.length} de ${linhas.length} campanhas · ${periodo}` : "Nenhuma campanha corresponde aos filtros.");
    // depois do render() o botão clicado deixa de existir: o foco volta para o botão novo de mesma função (nunca cai no body)
    const refocar = cls => { try { const b = raiz.querySelector(cls); if (b && typeof b.focus === "function") b.focus({ preventScroll: true }); } catch { /* ok */ } };
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p ads-camp-aplicar", on: { click: () => {
      st.busca = busca.value; st.resultado = ["todos", "com_crm", "sem_crm"].includes(filtro.value) ? filtro.value : "todos";
      estado.busca = st.busca; estado.resultado = st.resultado;
      aoFiltrar({ busca: st.busca, resultado: st.resultado }); render(); refocar(".ads-camp-aplicar");
    } } }, "Aplicar filtros");
    const limparBtn = h("button", { type: "button", class: "bt bt-sec bt-p ads-camp-limpar", on: { click: () => {
      st.busca = ""; st.resultado = "todos"; estado.busca = ""; estado.resultado = "todos";
      aoLimpar(); render(); refocar(".ads-camp-limpar");
    } } }, "Limpar filtros");
    const exportar = h("button", { type: "button", class: "bt bt-sec bt-p ads-camp-baixar", disabled: !visiveis.length,
      "aria-label": "Exportar campanhas filtradas em CSV", on: { click: () => aoExportar(visiveis) } }, "Exportar CSV filtrado");

    const selecionadas = st.comparacao.map(id => linhas.find(r => String(r?.c?.id) === String(id))).filter(Boolean).slice(0, 3);
    st.comparacao = selecionadas.map(r => r.c.id); estado.comparacao = [...st.comparacao];
    const medidas = [
      ["Investimento Ads", r => moeda(r.t.gasto)], ["Conversões da plataforma", r => inteiro(r.t.conversoes)],
      ["CPA da plataforma", r => moedaCent(r.t.cpa)], ["Conversas CRM", r => inteiro(r.k.conversas)],
      ["Agendamentos CRM", r => inteiro(r.k.agendadas)], ["Fechamentos CRM", r => inteiro(r.k.fecharam)],
      ["Receita CRM", r => moeda(r.k.receita)], ["ROAS CRM ÷ Ads", r => Number.isFinite(r.roas) ? `${decimal(r.roas)}x` : "—"],
      ["Agendamentos CRM ÷ conversões Ads", r => { const n = taxasFunilCampanha(r).agendaSobreConversoesAds; return n == null ? "—" : `${decimal(n)}%`; }],
      ["Fechamentos CRM ÷ agendamentos CRM", r => { const n = taxasFunilCampanha(r).fechamentoSobreAgendadasCrm; return n == null ? "—" : `${decimal(n)}%`; }],
    ];
    const comparacao = h("section", { class: "ads-camp-comparacao", hidden: !selecionadas.length, "aria-labelledby": "ads-comp-titulo" });
    if (selecionadas.length) {
      const tabela = h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": "Comparação de campanhas" },
        h("table", { class: "rel-tabela ads-comparacao-tabela" },
          h("caption", { class: "sr-only" }, `Comparação de ${selecionadas.length} campanhas no recorte ${periodo}`),
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Métrica"), selecionadas.map(r => h("th", { scope: "col" }, r.c.nome)))),
          h("tbody", {}, medidas.map(([rot, valor]) => h("tr", {}, h("th", { scope: "row" }, rot), selecionadas.map(r => h("td", { class: "num" }, valor(r))))))));
      comparacao.append(h("div", { class: "rel-cartao-topo" }, h("h3", { id: "ads-comp-titulo", class: "rel-h2" }, `Comparação · ${selecionadas.length} de 3`),
        h("p", { class: "rel-nota" }, `Mesmo recorte: ${periodo}. Cada etapa usa a data do evento correspondente; os totais não formam uma coorte de contatos.`)), tabela,
        h("div", { class: "ads-comp-acoes" }, selecionadas.map(r => h("button", { type: "button", class: "bt bt-fant bt-p",
          "aria-label": `Remover ${r.c.nome} da comparação`, on: { click: () => {
            st.comparacao = st.comparacao.filter(id => String(id) !== String(r.c.id)); estado.comparacao = [...st.comparacao];
            aoComparar(r.c.id, { alterou: true, ids: [...st.comparacao], cheia: false }); aoFocoComparar(r.c.id); render();
          } } }, `Remover ${r.c.nome}`))));
    }
    if (limpar) limpar(raiz); else if (typeof raiz.replaceChildren === "function") raiz.replaceChildren(); else if (Array.isArray(raiz.filhos)) raiz.filhos = [];
    raiz.append(h("div", { class: "ads-camp-filtros" },
      h("label", { class: "ads-camp-busca" }, h("span", {}, "Buscar campanha"), busca),
      h("label", { class: "ads-camp-filtro" }, h("span", {}, "Filtrar pelo resultado no CRM"), filtro),
      aplicar, limparBtn, exportar), status, comparacao);
    return raiz;
  }

  function alternar(linha) {
    const troca = alternarComparacaoCampanhas(st.comparacao, linha?.c?.id);
    if (!troca.alterou) { aoAviso("Compare até três campanhas por vez."); return troca; }
    st.comparacao = troca.ids; estado.comparacao = [...st.comparacao];
    aoComparar(linha?.c?.id, troca); render(); return troca;
  }
  render();
  return { elemento: raiz, get linhas() { return [...visiveis]; }, alternar,
    botaoComparar: linha => h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Comparar campanha ${linha?.c?.nome || ""}`,
      on: { click: () => alternar(linha) } }, `Comparar ${linha?.c?.nome || "campanha"}`),
    aplicar(busca, resultado) { st.busca = String(busca || ""); st.resultado = resultado; estado.busca = st.busca; estado.resultado = st.resultado; aoFiltrar({ busca: st.busca, resultado: st.resultado }); return render(); },
    exportar: () => aoExportar(visiveis), render };
}

const lerLocal = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* modo privado */ } };
const voc = (ctx, chave, padrao) => {
  const v = ctx.vocab;
  const r = typeof v === "function" ? v(chave) : v && v[chave];
  return typeof r === "string" && r ? r : padrao;
};
const eGestor = ctx => ctx.papel === "gestor" || ctx.papel === "super";

function soltarGraficos() { for (const g of graficos) { try { g.destruir(); } catch { /* já foi */ } } graficos = []; }

export function desmontar() { soltarGraficos(); clearInterval(tPilula); tPilula = 0; montagem++; }

export async function montar(ctx) {
  const minha = ++montagem;
  soltarGraficos();
  clearInterval(tPilula);
  const { ui } = ctx;
  const v = ctx.versao;
  ui.carregarCss("relatorios.css");
  ctx.titulo("Anúncios");
  if (!N) {
    try {
      [N, L, G] = await Promise.all([import(`../nucleo.js?v=${v}`), import(`./rel-logica.js?v=${v}`), import(`./graficos.js?v=${v}`)]);
    } catch (e) {
      ui.limpar(ctx.alvo);
      ctx.alvo.append(ui.erroCartao(e, () => montar(ctx)));
      return;
    }
    if (minha !== montagem) return;
  }
  const h = G.criarH(ui);
  S.dias = PERIODOS.includes(+lerLocal("nx-app-ads-dias", 30)) ? +lerLocal("nx-app-ads-dias", 30) : 30;
  S.plat = ["", "meta", "google"].includes(lerLocal("nx-app-ads-plat", "")) ? lerLocal("nx-app-ads-plat", "") : "";
  S.rank = L.RANK_CRI.some(([k]) => k === lerLocal("nx-app-ads-rank", "")) ? lerLocal("nx-app-ads-rank", "") : "receita";
  // filtros e comparação só duram nesta montagem: uma troca de empresa nunca reaproveita estado privado da anterior
  S.buscaCamp = ""; S.resultadoCamp = "todos"; S.comparacaoCamp = [];

  const aba = ABAS.some(a => a.id === (ctx.rota.partes[0] || "")) ? (ctx.rota.partes[0] || "") : "";
  ui.limpar(ctx.alvo);
  const raiz = h("section", { class: "rel ads", "aria-labelledby": "ads-h" });
  ctx.alvo.append(raiz);

  // topo: título, «Atualizado há 27 min» (texto pequeno no celular) + botão-ícone, atalhos do gestor (no celular, num ⋮)
  const pilula = h("span", { class: "ads-pilula", role: "status" });
  pilula.hidden = true;
  const btnAtualizar = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic", title: "Atualizar os números", on: { click: () => recarregar(true) } },
    ui.icone("reabrir"), h("span", { class: "rel-rot" }, "Atualizar"));
  const acoes = h("div", { class: "rel-topo-acoes" }, pilula, btnAtualizar);
  if (eGestor(ctx)) {
    acoes.append(h("a", { class: "rel-btn rel-btn-sec rel-so-largo", href: "#/config/anuncios" }, "Ajustes de anúncios"));
    acoes.append(h("a", { class: "rel-link rel-so-largo", href: URL_PAINEL, target: "_blank", rel: "noopener noreferrer" }, "Painel de apresentação ↗"));
    const maisAcoes = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic rel-so-movel", "aria-label": "Mais ações", title: "Mais ações" }, ui.icone("opcoes"));
    maisAcoes.addEventListener("click", () => ui.menu(maisAcoes, [
      { rotulo: "Ajustes de anúncios", icone: "engrenagem", fn: () => ctx.navegar("#/config/anuncios") },
      { rotulo: "Painel de apresentação", icone: "externo", fn: () => { try { window.open(URL_PAINEL, "_blank", "noopener,noreferrer"); } catch { /* bloqueado */ } } },
    ]));
    acoes.append(maisAcoes);
  }
  const tituloAba = (ABAS.find(a => a.id === aba) || ABAS[0]).rotulo;
  raiz.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Anúncios · ${ctx.cliente.nome}`), h("h1", { id: "ads-h", class: "rel-h1" }, tituloAba)),
    acoes));

  // abas (navegação por rota) numa linha só: ui.segmentado({tipo: "abas"}); o selo de alertas mora na aba Radar
  const badge = h("span", { class: "rel-badge", "aria-label": "" });
  badge.hidden = true;
  const idAba = id => id || "geral";
  const nav = ui.segmentado({ tipo: "abas", rotulo: "Seções de Anúncios", valor: idAba(aba), classe: "rel-abas-seg",
    opcoes: ABAS.map(a => ({ valor: idAba(a.id), rotulo: a.rotulo })),
    aoMudar: v => { const a = ABAS.find(x => idAba(x.id) === v); if (a) ctx.navegar(a.hash); } });
  const tabRadar = nav.querySelector('[data-valor="radar"]');
  if (tabRadar) tabRadar.append(badge);
  raiz.append(nav);

  const faixa = h("div", { class: "rel-faixa rel-faixa-ruim", role: "alert" });
  faixa.hidden = true;
  const filtros = h("div", { class: "rel-filtros" });
  // sem aria-live aqui: o corpo inteiro (com números que "contam") seria lido a cada filtro
  const corpo = h("div", { class: "rel-corpo", "aria-busy": "true" });
  raiz.append(faixa, filtros, corpo);

  async function recarregar(forcar) {
    const id = ctx.cliente.id;
    let item = cache.get(id);
    if (forcar || !item || Date.now() - item.em > VALIDADE_MS) {
      if (!item) { ui.limpar(corpo); corpo.append(ui.esqueleto(aba === "campanhas" ? "tabela" : aba ? "lista" : "cartoes", aba ? 6 : 4)); }
      corpo.setAttribute("aria-busy", "true");
      btnAtualizar.disabled = true;
      try {
        const dados = await ctx.api.rpcC("nx_dados", { p_dias: DIAS_JANELA }) || {};
        const M = N.montar(N.datasetDeLinhas({ metricas: dados.metricas || [], leads: dados.leads || [],
          cliente: dados.cliente || { nome: ctx.cliente.nome, cfg: {} }, hoje: dados.hoje || N.hojeSP(), dias: DIAS_JANELA }));
        item = { dados, M, em: Date.now() };
        cache.set(id, item);
        if (forcar) ui.toast("Números atualizados.", { tipo: "ok", ms: 2500 });
      } catch (e) {
        if (minha !== montagem) return;
        corpo.setAttribute("aria-busy", "false");
        if (e && e.codigo === "sessao_invalida") return;
        if (item && forcar) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora. Tente de novo em instantes.", { tipo: "erro" }); return; }
        ui.limpar(corpo);
        corpo.append(ui.erroCartao(e, () => recarregar(true)));
        return;
      } finally { btnAtualizar.disabled = false; }
    }
    if (minha !== montagem) return;
    desenhar(item);
  }

  function desenhar({ dados, M }) {
    soltarGraficos();
    corpo.setAttribute("aria-busy", "false");
    // pílula de conexão + faixa de queda (em todas as abas)
    const pintarPilula = () => {
      const e = L.estadoIntegracao(dados.integracoes || [], dados.alertas || []);
      pilula.hidden = e.nivel === "nenhuma";
      pilula.className = `ads-pilula ads-p-${e.nivel}`;
      pilula.textContent = L.textoPilula(e);
      pilula.title = e.canais.map(c => `${L.nomePlat(c.canal)}: ${c.sync ? `lida ${L.quandoSP(c.sync)}` : "ainda não leu"}`).join(" · ");
      faixa.hidden = !e.erros.length;
      ui.limpar(faixa);
      if (e.erros.length) {
        faixa.append(h("p", {}, L.textoQueda(e.erros)),
          eGestor(ctx) ? h("a", { class: "rel-btn rel-btn-prim", href: "#/config/anuncios" }, "Refazer a conexão")
            : h("p", { class: "rel-nota" }, "Nossa equipe já foi avisada."));
      }
    };
    pintarPilula();
    clearInterval(tPilula);
    tPilula = setInterval(() => { if (!document.hidden && pilula.isConnected) pintarPilula(); }, 30000);
    const radar = L.montarRadar(M, dados);
    badge.hidden = !radar.ativos;
    badge.textContent = String(radar.ativos);
    badge.setAttribute("aria-label", `${radar.ativos} ${radar.ativos === 1 ? "alerta ativo" : "alertas ativos"}`);

    // filtros (período e plataforma) só onde fazem sentido
    ui.limpar(filtros);
    filtros.hidden = !(aba === "" || aba === "campanhas") || L.semAnuncios(M);
    if (!filtros.hidden) {
      const chipResumo = h("button", { type: "button", class: "rel-resumo", "aria-haspopup": "dialog", title: "Período e plataforma" },
        h("span", { class: "rel-resumo-t" }, L.textoChipAnuncios(S.dias, S.plat)), ui.icone("seta-baixo"));
      chipResumo.addEventListener("click", () => abrirFolha(M, dados));
      filtros.append(chipResumo,
        h("div", { class: "rel-filtros-lg" },
          segmento("Período", PERIODOS.map(d => [d, `${d} dias`]), S.dias, d => { S.dias = d; gravarLocal("nx-app-ads-dias", d); desenhar({ dados, M }); }),
          segmento("Plataforma", PLATS, S.plat, p => { S.plat = p; gravarLocal("nx-app-ads-plat", p); desenhar({ dados, M }); })),
        h("p", { class: "rel-nota rel-ate" }, descricaoPeriodoAds(L.numerosPeriodo(M, { dias: S.dias, plat: S.plat }), M.dataBR, L.nomePlat)));
    }

    ui.limpar(corpo);
    if (aba === "radar") return abaRadar(M, dados, radar);
    if (aba === "relatorios") return abaRelatorios(M, dados);
    if (L.semAnuncios(M)) return corpo.append(vazioAds());
    if (aba === "campanhas") return abaCampanhas(M);
    return abaGeral(M);
  }

  /** O chip-resumo «Últimos 30 dias · Tudo ▾» abre esta folha: período e plataforma num lugar só, aplicados de uma vez. */
  async function abrirFolha(M, dados) {
    let dias = S.dias, plat = S.plat;
    const campoSeg = (rotulo, el) => h("div", { class: "campo" }, h("p", { class: "rotulo" }, rotulo), el);
    const segDias = ui.segmentado({ tipo: "filtro", rotulo: "Período", valor: dias, opcoes: PERIODOS.map(d => ({ valor: d, rotulo: `${d} dias` })), aoMudar: v => { dias = v; } });
    const segPlat = ui.segmentado({ tipo: "filtro", rotulo: "Plataforma", valor: plat, opcoes: PLATS.map(([v, t]) => ({ valor: v, rotulo: t })), aoMudar: v => { plat = v; } });
    const r = await ui.modal({ titulo: "Período e plataforma", largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, campoSeg("Período", segDias), campoSeg("Plataforma", segPlat)),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: () => true }] });
    if (r !== true || (dias === S.dias && plat === S.plat)) return;
    S.dias = dias; S.plat = plat; gravarLocal("nx-app-ads-dias", dias); gravarLocal("nx-app-ads-plat", plat);
    desenhar({ dados, M });
    // o chip foi recriado e a folha ainda devolve o foco ao chip antigo ao fechar: o foco do teclado vai para o novo logo depois (nunca cai no <body>)
    setTimeout(() => { const novo = raiz.querySelector(".rel-resumo"); if (novo) novo.focus(); }, 220);
  }

  function segmento(rotulo, opcoes, atual, aoMudar) {
    const g = h("div", { class: "rel-seg", role: "group", "aria-label": rotulo });
    for (const [valor, texto] of opcoes) {
      const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(valor === atual) }, texto);
      b.addEventListener("click", () => {
        if (valor === atual) return;
        aoMudar(valor);
        // o redesenho troca os botões: o foco do teclado volta para o botão escolhido (nunca cai no <body>)
        const novo = [...raiz.querySelectorAll(".rel-seg")].find(x => x.getAttribute("aria-label") === rotulo);
        const alvo = novo && novo.querySelector('[aria-pressed="true"]');
        if (alvo) alvo.focus();
      });
      g.append(b);
    }
    return g;
  }

  function vazioAds() {
    return eGestor(ctx)
      ? ui.vazio({ titulo: "Nenhum número de anúncio ainda", texto: "Conecte o Meta/Google em Configurações → Anúncios.", acao: { rotulo: "Abrir Ajustes de anúncios", fn: () => ctx.navegar("#/config/anuncios") } })
      : ui.vazio({ titulo: "Nenhum número de anúncio ainda", texto: "Os números aparecem aqui assim que os anúncios começarem a rodar." });
  }

  const num = (valor, fmt, cls = "") => {
    const b = h("b", { class: `rel-num ${cls}` });
    // dinheiro ganha o formato editorial ("R$" e centavos a 60 %); o resto conta como antes
    if (fmt === N.brl || fmt === N.brl0) L.contarMoeda(ui, G, b, valor, { centavos: fmt === N.brl });
    else G.contar(b, valor, fmt);
    return b;
  };
  const chip = (atual, anterior, sentido) => {
    const c = L.chipVar(atual, anterior, sentido);
    return h("span", { class: `rel-var rel-var-${c.cls}`, title: `vs. ${S.dias} dias antes` }, c.v == null ? c.txt : `${c.seta} ${c.txt}`);
  };

  /* ---------------- VISÃO GERAL ---------------- */
  function abaGeral(M) {
    const P = L.numerosPeriodo(M, { dias: S.dias, plat: S.plat });
    const periodoTexto = descricaoPeriodoAds(P, M.dataBR, L.nomePlat);
    const { t, ta, c, ca } = P;
    const contatos = voc(ctx, "contatos", "Clientes").toLowerCase();
    const umContato = voc(ctx, "contato", "Cliente").toLowerCase();

    // herói: a frase que o dono lê em 3 segundos + a conta do retorno
    const frase = h("p", { class: "ads-frase" }, "No CRM, com origem atribuída a anúncios, registramos ", num(c.conversas, N.int), ` ${c.conversas === 1 ? "conversa" : "conversas"}, `,
      num(c.agendadas, N.int), ` ${c.agendadas === 1 ? "agendamento" : "agendamentos"} e `, num(c.fecharam, N.int),
      ` ${c.fecharam === 1 ? `novo ${umContato}` : `novos ${contatos}`}.`);
    const conta = h("div", { class: "ads-conta" },
      h("p", { class: "rel-olho" }, S.plat ? `Retorno sobre ${L.nomePlat(S.plat)}` : "Retorno total"),
      Number.isFinite(P.retorno)
        ? h("p", { class: "ads-retorno" }, `Cada R$ 1 ${S.plat ? "em anúncio" : "investido"} virou `, num(P.retorno, N.brl, "ads-retorno-n"))
        : h("p", { class: "ads-retorno" }, "Sem investimento no período"),
      h("p", { class: "rel-nota" }, S.plat ? "receita ÷ investimento em anúncios" : "receita ÷ (anúncios + gestão)"),
      h("p", { class: "ads-receita" }, num(c.receita, N.brl0), h("span", {}, " em receita fechada")));
    corpo.append(h("div", { class: "ads-heroi rel-cartao rel-entra" },
      h("div", { class: "ads-heroi-t" }, h("p", { class: "rel-olho" }, periodoTexto), frase), conta));

    // trilha do funil: conversas → agendaram → compareceram → fecharam
    const passos = [
      { v: c.conversas, a: ca.conversas, l: "Conversas registradas no CRM", taxa: null },
      { v: c.agendadas, a: ca.agendadas, l: "Agendaram", taxa: L.razao(c.agendadas, c.conversas), tl: "das conversas" },
      { v: c.compareceram, a: ca.compareceram, l: "Compareceram", taxa: L.razao(c.compareceram, c.agendadas), tl: "dos agendados" },
      { v: c.fecharam, a: ca.fecharam, l: "Fecharam", taxa: L.razao(c.fecharam, c.compareceram), tl: "de quem veio" },
    ];
    const trilha = h("ol", { class: "ads-trilha rel-cartao rel-entra", "aria-label": "Do anúncio ao fechamento" });
    passos.forEach((p, n) => trilha.append(h("li", { class: "ads-passo", style: `--i:${n}` },
      p.taxa == null ? h("span", { class: "ads-taxa ads-taxa-0", "aria-hidden": "true" }) : h("span", { class: "ads-taxa" }, `${N.pc(Math.min(p.taxa, 100), 0)} ${p.tl}`),
      num(p.v, N.int, "ads-passo-n"), h("span", { class: "ads-passo-l" }, p.l), chip(p.v, p.a, "cima"))));
    corpo.append(trilha);

    // régua de 4 KPIs
    const meta = M.CFG.cpaAlvo, dif = Number.isFinite(t.cpa) ? Math.abs(t.cpa - meta) / meta * 100 : null;
    const kpis = [
      { l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: N.brl0, s: "neutro", extra: Number.isFinite(P.fee) && P.fee > 0 && eGestor(ctx) ? `+ ${N.brl0(P.fee)} de gestão no período` : "" },
      { l: "Custo por conversão da plataforma", v: t.cpa, a: ta.cpa, f: N.brl, s: "baixo", medidor: true,
        extra: !Number.isFinite(t.cpa) ? `meta ${N.brl(meta)}` : `meta ${N.brl(meta)} · ${N.pc(dif, 0)} ${t.cpa <= meta ? "abaixo" : "acima"}` },
      { l: "Conversões registradas pela plataforma", v: t.conversoes, a: ta.conversoes, f: N.int, s: "cima", extra: "Meta/Google; denominador do custo por conversão" },
      { l: "Receita fechada", v: c.receita, a: ca.receita, f: N.brl0, s: "cima",
        extra: eGestor(ctx) && Number.isFinite(P.roas) ? `${N.dec(P.roas, 1)}x o investido em anúncios` : "valor informado nos negócios ganhos do CRM" },
    ];
    const regua = h("div", { class: "rel-kpis rel-kpis-4" });
    kpis.forEach((k, n) => {
      const cel = h("div", { class: "rel-kpi rel-cartao rel-entra", style: `--i:${n + 2}` },
        h("span", { class: "rel-kpi-l" }, k.l),
        Number.isFinite(k.v) ? num(k.v, k.f, "rel-kpi-v") : h("b", { class: "rel-num rel-kpi-v" }, "—"),
        h("span", { class: "rel-kpi-linha" }, chip(k.v, k.a, k.s), h("span", { class: "rel-nota" }, `vs. ${S.dias} dias antes`)));
      if (k.medidor) {
        const w = Number.isFinite(t.cpa) ? Math.min(t.cpa / (meta * 2), 1) * 100 : 0;
        const med = h("span", { class: `rel-medidor rel-m-${L.nivelCpa(t.cpa, meta)}`, "aria-hidden": "true" }, h("i"), h("b", { title: "meta" }));
        med.style.setProperty("--w", `${w.toFixed(1)}%`);
        cel.append(med);
      }
      if (k.extra) cel.append(h("span", { class: "rel-kpi-extra" }, k.extra));
      regua.append(cel);
    });
    corpo.append(regua);

    // gráfico diário + coluna lateral (plataformas e orçamento do mês)
    const serie = L.serieDiaria(M, { dias: S.dias, plat: S.plat });
    const alvoG = h("div", { class: "rel-grafico" });
    const rodape = h("div", { class: "rel-cartao-rodape" });
    const legenda = h("ul", { class: "g-legenda", "aria-hidden": "true" },
      (S.plat !== "google" ? h("li", {}, h("i", { class: "g-marca g-meta" }), "Meta") : null),
      (S.plat !== "meta" ? h("li", {}, h("i", { class: "g-marca g-google" }), "Google") : null),
      h("li", {}, h("i", { class: "g-marca g-linha-m g-linha-texto" }), "Conversões da plataforma (média móvel de 7 dias)"),
      h("li", {}, h("i", { class: "g-marca g-ant-m" }), `${S.dias} dias antes`));
    const cartaoG = h("div", { class: "rel-cartao ads-cartao-g rel-entra" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, "Investimento diário × conversões da plataforma"), legenda),
      alvoG, rodape);
    const tot = { g: 0, conv: 0 };
    serie.atual.forEach(d => { tot.g += d.gasto; tot.conv += d.conv; });
    graficos.push(G.grafDiario(alvoG, {
      serie: serie.atual, anterior: serie.anterior, rotuloDia: M.ddmm,
      diaLongo: i => `${L.SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`,
      fmtGasto: N.brl, fmtGastoCurto: N.brl0, fmtNum: N.int,
      resumo: `${periodoTexto}. Investimento diário total ${N.brl0(tot.g)}; ${N.int(tot.conv)} conversões da plataforma no período. A linha do gráfico usa a média móvel de 7 dias`,
    }));
    G.alternarTabela(rodape, alvoG, {
      legenda: `${periodoTexto}; valores diários`,
      colunas: ["Dia", "Investimento Meta", "Investimento Google", "Conversões da plataforma", "Custo por conversão Ads"],
      linhas: serie.atual.map(d => [M.dataBR(d.i), N.brl(d.meta), N.brl(d.google), N.int(d.conv), d.conv ? N.brl(d.gasto / d.conv) : "—"]),
    });

    const lado = h("div", { class: "ads-lado" });
    // Meta × Google
    if (!S.plat) {
      const { de, ate } = L.janela(M, S.dias);
      const pl = ["meta", "google"].map(p => ({ p, t: M.consolidar(M.linhasDe(de, ate, { plat: p })), c: M.crmTot(de, ate, { plat: p }) })).filter(x => x.t.gasto > 0 || x.c.conversas > 0);
      if (pl.length) {
        const maxG = Math.max(1, ...pl.map(x => x.t.gasto));
        lado.append(h("div", { class: "rel-cartao ads-plats rel-entra" }, h("h2", { class: "rel-h2" }, "Por plataforma"),
          h("p", { class: "rel-nota" }, `${periodoTexto}. Os eventos do CRM usam suas próprias datas e não são o denominador do CPA da plataforma.`),
          h("ul", { class: "ads-plat-lista" }, pl.map(x => {
            const barra = h("span", { class: `ads-plat-barra g-${x.p}` });
            barra.style.setProperty("--w", `${(x.t.gasto / maxG * 100).toFixed(1)}%`);
            return h("li", {},
              h("span", { class: "ads-plat-nome" }, h("i", { class: `g-marca g-${x.p}` }), L.nomePlat(x.p)),
              h("span", { class: "ads-plat-trilho" }, barra),
              h("span", { class: "ads-plat-num" }, `${N.brl0(x.t.gasto)} · ${N.int(x.t.conversoes)} conversões da plataforma · CPA ${N.brl(x.t.cpa)} · CRM: ${N.int(x.c.conversas)} conversas registradas, ${N.int(x.c.agendadas)} agendamentos, ${N.int(x.c.fecharam)} fechamentos`));
          }))));
      }
    }
    // orçamento do mês (todas as plataformas)
    const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, m.proj, 1) * 1.08;
    const acima = m.proj > orc * 1.02, noLimite = !acima && m.proj >= orc * .98;
    const msg = m.restam === 0 ? `Mês fechado em ${N.brl0(m.gasto)}.`
      : acima ? `No ritmo atual o mês fecha ${N.brl0(m.proj - orc)} acima do orçamento — segurar ${N.brl((m.proj - orc) / m.restam)} por dia resolve.`
      : noLimite ? `No limite: o mês deve fechar em ${N.brl0(m.proj)}, praticamente no orçamento.`
      : `Dentro do orçamento: o mês deve fechar em ${N.brl0(m.proj)} (sobram ${N.brl0(orc - m.proj)}).`;
    const descrOrcamento = descricaoOrcamentoMensal(m, M.dataBR, N.brl0);
    const barra = h("div", { class: `ads-orc-barra${acima ? " acima" : ""}`, role: "img", "aria-label": `${descrOrcamento}; orçamento mensal ${N.brl0(orc)}` }, h("i"), h("u"), h("b"));
    barra.style.setProperty("--w", `${(m.gasto / escala * 100).toFixed(1)}%`);
    barra.style.setProperty("--wp", `${(Math.max(0, m.proj - m.gasto) / escala * 100).toFixed(1)}%`);
    barra.style.setProperty("--m", `${(orc / escala * 100).toFixed(1)}%`);
    lado.append(h("div", { class: "rel-cartao ads-orc rel-entra" },
      h("h2", { class: "rel-h2" }, "Orçamento do mês"),
      h("p", { class: "rel-nota" }, descrOrcamento),
      h("p", { class: "ads-orc-n" }, num(m.gasto, N.brl0), h("span", {}, ` de ${N.brl0(orc)}`)),
      barra,
      h("p", { class: "ads-orc-leg rel-nota" }, h("span", {}, `real ${N.brl0(m.gasto)} até ontem`), h("span", {}, `projeção linear ${N.brl0(m.proj)}`), h("span", {}, `orçamento mensal ${N.brl0(orc)}`)),
      h("p", { class: `ads-orc-msg${acima ? " rel-txt-aten" : ""}` }, msg)));
    corpo.append(h("div", { class: "ads-grade" }, cartaoG, lado));
  }

  /* ---------------- CAMPANHAS ---------------- */
  function abaCampanhas(M) {
    const P = L.numerosPeriodo(M, { dias: S.dias, plat: S.plat });
    const { linhas, total, outras } = L.linhasCampanhas(M, { dias: S.dias, plat: S.plat });
    const COLS = [["nome", "Campanha"], ["gasto", "Investimento Ads"], ["conv", "Conversões Ads"], ["cpa", "CPA Ads"],
      ["ag", "Agendamentos CRM"], ["fe", "Fechamentos CRM"], ["rec", "Receita CRM"], ["roas", "Retorno", "Receita do CRM ÷ investimento em anúncios desta campanha (sem a gestão)."]];
    const cartao = h("div", { class: "rel-cartao rel-entra ads-camp" });
    corpo.append(cartao);
    if (!linhas.length) {
      cartao.append(ui.vazio({ titulo: "Nenhuma campanha no período", texto: `Nenhuma campanha com investimento nos últimos ${S.dias} dias${S.plat ? ` no ${L.nomePlat(S.plat)}` : ""}.` }));
      return;
    }
    const desenharTabela = () => {
      ui.limpar(cartao);
      const rows = L.ordenarCampanhas(linhas, S.ordem.chave, S.ordem.dir);
      const meta = M.CFG.cpaAlvo;
      const linhasDOM = [];
      const estadoCamp = { busca: S.buscaCamp, resultado: S.resultadoCamp, comparacao: [...S.comparacaoCamp] };
      let painelCampanhas;
      const thead = h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "c-comparar" }, "Comparar"), COLS.map(([k, l, dica]) => {
        const th = h("th", { scope: "col", class: k === "nome" ? "" : "num" });
        if (S.ordem.chave === k) th.setAttribute("aria-sort", S.ordem.dir < 0 ? "descending" : "ascending");
        const b = h("button", { type: "button", class: "rel-ord", title: dica || `Ordenar por ${l.toLowerCase()}` }, l,
          h("span", { class: "rel-ord-seta", "aria-hidden": "true" }, S.ordem.chave === k ? (S.ordem.dir < 0 ? "↓" : "↑") : ""));
        b.addEventListener("click", () => { S.ordem = { chave: k, dir: S.ordem.chave === k ? -S.ordem.dir : (k === "nome" ? 1 : -1) }; desenharTabela(); cartao.querySelector(`[data-ord="${k}"]`)?.focus(); });
        b.dataset.ord = k;
        th.append(b);
        return th;
      })));
      const td = (k, texto, rot) => h("td", { class: `num c-${k}`, dataset: { l: rot || "" } }, texto);
      const tbody = h("tbody", {}, rows.map((r, n) => {
        const check = h("input", { type: "checkbox", class: "ads-camp-comparar", checked: S.comparacaoCamp.some(id => String(id) === String(r.c.id)),
          "aria-label": `Comparar campanha ${r.c.nome}`, dataset: { campId: r.c.id } });
        check.addEventListener("change", () => {
          const nova = painelCampanhas.alternar(r);
          if (!nova.alterou) check.checked = false;
        });
        const abrir = h("button", { type: "button", class: "ads-camp-nome", "aria-haspopup": "dialog" },
          h("i", { class: `rel-ponto rel-ponto-${L.nivelCpa(r.t.cpa, meta)}`, title: "CPA das conversões informadas pela plataforma × meta" }),
          h("span", { class: "ads-camp-t" }, h("span", {}, r.c.nome), h("small", {}, h("span", { class: `rel-chip rel-chip-${r.c.plat}` }, L.nomePlat(r.c.plat)), " · ver criativos")));
        abrir.addEventListener("click", () => criativos(M, r));
        // rótulo visível no celular (cartões sem cabeçalho) e alvo de 44 px; no desktop o texto fica só para leitor de tela
        const alvoComparar = h("label", { class: "ads-camp-comparar-alvo" }, check, h("span", { class: "ads-camp-comparar-txt" }, "Comparar"));
        const tr = h("tr", { style: `--i:${n}` }, h("td", { class: "c-comparar" }, alvoComparar), h("td", { class: "c-nome" }, abrir),
          td("gasto", N.brl0(r.t.gasto), "Investimento Ads"), td("conv", N.int(r.t.conversoes), "Conversões Ads"), td("cpa", N.brl(r.t.cpa), "CPA Ads"),
          td("ag", N.int(r.k.agendadas), "Agendamentos CRM"), td("fe", N.int(r.k.fecharam), "Fechamentos CRM"), td("rec", N.brl0(r.k.receita), "Receita CRM"),
          td("roas", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—", "Retorno"));
        linhasDOM.push({ r, tr });
        return tr;
      }));
      const T = total.t;
      // negócios de anúncio sem investimento na janela (pausada, sem campanha identificada): contam na Visão geral e ficam fora do Total
      const temOutras = !!outras && (outras.ag > 0 || outras.fe > 0 || outras.rec > 0);
      const tfoot = h("tfoot", {}, h("tr", {}, h("td", {}, ""), h("th", { scope: "row" }, "Total"),
        td("gasto", N.brl0(T.gasto), "Investimento Ads"), td("conv", N.int(T.conversoes), "Conversões Ads"), td("cpa", N.brl(T.cpa), "CPA Ads"),
        td("ag", N.int(total.ag), "Agendamentos CRM"), td("fe", N.int(total.fe), "Fechamentos CRM"), td("rec", N.brl0(total.rec), "Receita CRM"),
        td("roas", Number.isFinite(total.roas) ? `${N.dec(total.roas, 1)}x` : "—", "Retorno")),
        temOutras ? h("tr", { class: "ads-camp-outras" }, h("td", {}, ""), h("th", { scope: "row", title: "Negócios de anúncio sem investimento nestes dias (campanha pausada ou sem campanha identificada). Entram na Visão geral." }, "Sem investimento no período"),
          td("gasto", "—", "Investimento Ads"), td("conv", "—", "Conversões Ads"), td("cpa", "—", "CPA Ads"),
          td("ag", N.int(outras.ag), "Agendamentos CRM"), td("fe", N.int(outras.fe), "Fechamentos CRM"), td("rec", N.brl0(outras.rec), "Receita CRM"), td("roas", "—", "Retorno")) : null);
      const periodo = `${M.dataBR(P.de)} a ${M.dataBR(P.ate)}${S.plat ? ` · ${L.nomePlat(S.plat)}` : " · todas as plataformas"}`;
      // filtro e «Limpar» mexem nas MESMAS linhas; o «Total» é das N campanhas do período, então some quando há recorte
      const aplicarVisibilidade = f => {
        const visiveis = new Set(filtrarCampanhas(linhas, f).map(r => String(r.c.id)));
        for (const { r, tr } of linhasDOM) tr.hidden = !visiveis.has(String(r.c.id));
        tfoot.hidden = visiveis.size !== linhasDOM.length;
      };
      painelCampanhas = criarPainelCampanhas({ h, limpar: ui.limpar, linhas, estado: estadoCamp, periodo,
        moeda: N.brl0, moedaCent: N.brl, inteiro: N.int, decimal: n => N.dec(n, 1),
        aoFiltrar: f => { S.buscaCamp = f.busca; S.resultadoCamp = f.resultado; aplicarVisibilidade(f); },
        aoComparar: (_id, troca) => {
          S.comparacaoCamp = [...troca.ids];
          for (const { r, tr } of linhasDOM) {
            const input = tr.querySelector(".ads-camp-comparar");
            if (input) input.checked = S.comparacaoCamp.some(id => String(id) === String(r.c.id));
          }
        },
        aoLimpar: () => { S.buscaCamp = ""; S.resultadoCamp = "todos"; aplicarVisibilidade({ busca: "", resultado: "todos" }); },
        aoAviso: texto => ui.toast(texto, { tipo: "nota" }),
        aoFocoComparar: id => linhasDOM.find(x => String(x.r.c.id) === String(id))?.tr.querySelector(".ads-camp-comparar")?.focus(),
        aoExportar: visiveis => {
          const csv = csvCampanhas(visiveis, { periodo, csv: L.csv, moeda: N.brl0, inteiro: N.int, decimal: n => N.dec(n, 1) });
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
          const a = h("a", { href: url, download: `orbita-campanhas-${periodo.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.csv` });
          document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        } });
      aplicarVisibilidade({ busca: S.buscaCamp, resultado: S.resultadoCamp });
      cartao.append(h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, `Campanhas · ${S.dias} dias`),
        h("p", { class: "rel-nota" }, "Conversões e CPA vêm do Meta/Google. Conversas, agendamentos, fechamentos e receita vêm do CRM, pela data de cada evento.")),
        painelCampanhas.elemento,
        h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": `Campanhas nos últimos ${S.dias} dias` }, h("table", { class: "rel-tabela ads-tabela" },
          h("caption", { class: "sr-only" }, `Campanhas nos últimos ${S.dias} dias`), thead, tbody, tfoot)));
    };
    desenharTabela();
    corpo.append(rankingCriativos(M));
  }

  /* Ranking de criativos (P1): investimento do Ads × resultado do CRM, por criativo */
  function rankingCriativos(M) {
    const cartao = h("section", { class: "rel-cartao rel-entra ads-rank", "aria-labelledby": "ads-rank-h", style: "--i:1" });
    const pintar = () => {
      const R = L.rankingCriativos(M, { dias: S.dias, plat: S.plat, por: S.rank });
      ui.limpar(cartao);
      const nomeRank = (L.RANK_CRI.find(([k]) => k === R.por) || L.RANK_CRI[0])[1].toLowerCase();
      cartao.append(h("div", { class: "rel-cartao-topo" },
        h("h2", { id: "ads-rank-h", class: "rel-h2" }, "Ranking de criativos"),
        segmento("Ordenar o ranking", L.RANK_CRI, R.por, v => { S.rank = v; gravarLocal("nx-app-ads-rank", v); pintar(); cartao.querySelector('[aria-pressed="true"]')?.focus(); }),
        h("p", { class: "rel-nota" }, R.por === "cpa"
          ? `${R.lista.length === 1 ? "O criativo com menor custo por conversa" : `Os ${R.lista.length} criativos com menor custo por conversa`} nos últimos ${S.dias} dias (com pelo menos ${L.MIN_CONV_CPA} conversas).`
          : `${R.lista.length === 1 ? "O criativo com" : `Os ${R.lista.length} criativos com`} ${nomeRank} nos últimos ${S.dias} dias. Fechados e receita vêm do CRM, pelo anúncio que trouxe cada ${voc(ctx, "contato", "contato").toLowerCase()}.`)));
      if (!R.lista.length) {
        cartao.append(h("p", { class: "rel-vazio-txt" }, !R.total ? "Nenhum criativo com investimento no período."
          : R.por === "cpa" ? `Nenhum criativo com ${L.MIN_CONV_CPA} conversas ou mais no período.`
          : `Nenhum criativo trouxe ${R.por === "receita" ? "receita" : "fechamento"} nos últimos ${S.dias} dias ainda. Veja “Menor custo por conversa”.`));
        return;
      }
      const ol = h("ol", { class: "ads-rank-lista" });
      R.lista.forEach((x, n) => {
        const destaque = R.por === "receita" ? N.brl0(x.c.receita) : R.por === "fechados" ? `${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechado" : "fechados"}` : `${N.brl(x.t.cpa)} por conversa`;
        ol.append(h("li", { class: `ads-rank-item${x.pos === 1 ? " ads-rank-1" : ""}`, style: `--i:${n}` },
          h("span", { class: "ads-rank-pos rel-num", "aria-hidden": "true" }, String(x.pos)),
          h("div", { class: "ads-rank-t" },
            h("p", { class: "ads-rank-nome" }, h("span", { class: "sr-only" }, `${x.pos}º: `), x.k.nome),
            h("p", { class: "rel-nota" }, h("span", { class: `rel-chip rel-chip-${x.k.plat}` }, L.nomePlat(x.k.plat)), ` ${x.camp ? x.camp.curto || x.camp.nome : ""}`),
            h("span", { class: "ads-rank-barra", "aria-hidden": "true" }, h("i", { style: { "--w": `${Math.round(x.barra * 100)}%` } }))),
          h("div", { class: "ads-rank-dest" }, h("b", { class: "rel-num" }, destaque),
            h("span", { class: "rel-nota" }, `${N.brl0(x.t.gasto)} investidos · ${N.int(x.t.conversoes)} conversas · ${N.int(x.c.agendadas)} agendados`),
            h("span", { class: "rel-nota" }, R.por === "receita" || R.por === "fechados"
              ? `${N.brl(x.t.cpa)} por conversa · retorno ${Number.isFinite(x.roas) ? `${N.dec(x.roas, 1)}x` : "—"}`
              : `${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechado" : "fechados"} · ${N.brl0(x.c.receita)}`))));
      });
      cartao.append(ol);
    };
    pintar();
    return cartao;
  }

  function criativos(M, r) {
    const lista = L.criativosDaCampanha(M, r.c.id, { dias: S.dias });
    const corpoG = h("div", { class: "ads-cri" },
      h("p", { class: "rel-nota" }, `${L.nomePlat(r.c.plat)} · últimos ${S.dias} dias · ${N.brl0(r.t.gasto)} investidos · ${N.int(r.t.conversoes)} conversas · ${N.brl(r.t.cpa)} cada`),
      h("div", { class: "ads-cri-resumo" },
        [["Agendados", N.int(r.k.agendadas)], ["Fechados", N.int(r.k.fecharam)], ["Receita", N.brl0(r.k.receita)], ["Retorno", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—"]]
          .map(([l, v]) => h("div", {}, h("span", { class: "rel-kpi-l" }, l), h("b", { class: "rel-num" }, v)))));
    if (!lista.length) corpoG.append(h("p", { class: "rel-vazio-txt" }, "Nenhum criativo com investimento no período."));
    else {
      corpoG.append(h("ul", { class: "ads-cri-lista" }, lista.map(({ k, t, fadiga, ctrBaixo }) => {
        const chips = h("span", { class: "ads-cri-chips" });
        if (fadiga) chips.append(h("span", { class: "rel-chip rel-chip-ruim", title: `frequência nos últimos ${fadiga.janela} dias` }, `cansado · ${N.dec(fadiga.valor, 1)} vezes em ${fadiga.janela}d`));
        if (ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-aten", title: `CTR nos últimos ${ctrBaixo.janela} dias` }, `CTR ${N.pc(ctrBaixo.valor, 2)} em ${ctrBaixo.janela}d`));
        if (!fadiga && !ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-bom" }, "ok"));
        return h("li", { class: "ads-cri-item" },
          h("p", { class: "ads-cri-nome" }, k.nome), chips,
          h("dl", { class: "ads-cri-num" },
            [["Investido", N.brl0(t.gasto)], ["Impressões", N.int(t.impressoes)], ["CTR", N.pc(t.ctr, 2)],
             ["Frequência", Number.isFinite(t.freq) ? N.dec(t.freq, 1) : "—"], ["Conversas", N.int(t.conversoes)], ["Custo/conversa", N.brl(t.cpa)]]
              .map(([l, v]) => h("div", {}, h("dt", {}, l), h("dd", {}, v)))));
      })));
    }
    ui.gaveta({ titulo: r.c.nome, corpo: corpoG, largura: "g" });
  }

  /* ---------------- RADAR ---------------- */
  function abaRadar(M, dados, R) {
    const u = (dados.integracoes || []).map(i => i.ultimo_sync).filter(Boolean).sort().pop();
    const qtd = `${R.ativos} ${R.ativos === 1 ? "alerta ativo" : "alertas ativos"}`;
    corpo.append(h("p", { class: "ads-radar-status rel-cartao rel-entra" },
      h("span", { class: `ads-radar-luz${R.ativos ? " ativo" : ""}`, "aria-hidden": "true" }),
      L.semAnuncios(M) ? "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar."
        : u ? `Última leitura dos anúncios: ${L.quandoSP(u)} · ${qtd}.` : `${qtd}.`));
    // do mais grave para o menos (L.ordenarRadar): o crítico ativo está sempre no topo; cada alerta leva barra lateral, ícone e rótulo da gravidade
    const lista = h("ul", { class: "ads-alertas" });
    L.ordenarRadar(R).forEach((it, n) => lista.append(it.tipo === "conexao" ? alertaConexao(it, n) : alertaEpisodio(it, n)));
    if (!lista.childElementCount) lista.append(h("li", { class: "rel-vazio-txt" }, "Nenhum alerta nos últimos 14 dias. Todas as campanhas dentro dos limites."));
    const regras = h("ul", { class: "ads-regras" }, M.REGRAS.map(r => h("li", {},
      h("div", {}, h("p", { class: "ads-regra-n" }, r.nome, " ", h("span", { class: `rel-chip rel-chip-${r.sev === "critico" ? "ruim" : r.sev === "alerta" ? "aten" : "info"}` }, L.SEV_NOME[r.sev])),
        h("p", { class: "rel-nota" }, descreverRegra(r))),
      h("span", { class: `rel-chip ${r.ativa ? "rel-chip-bom" : "rel-chip-neutro"}` }, r.ativa ? "ligada" : "desligada"))));
    const log = h("ul", { class: "ads-log" });
    R.registro.forEach(x => log.append(h("li", {},
      h("span", { class: `ads-sev ads-sev-${x.sev}`, "aria-hidden": "true" }),
      h("div", {}, h("p", { class: "ads-al-nome" }, x.nome), h("p", { class: "ads-al-msg" }, x.a.mensagem || ""),
        h("p", { class: "rel-nota" }, `registrado ${x.quando}`, x.envio ? envio(x.envio, " · ") : null)))));
    if (!log.childElementCount) log.append(h("li", { class: "rel-vazio-txt" }, "Nenhum aviso enviado ainda."));
    corpo.append(h("div", { class: "ads-radar-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Alertas dos últimos 14 dias"), lista),
      h("div", { class: "ads-radar-lado" },
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Avisos enviados no WhatsApp"), log),
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Regras do radar"), regras,
          h("p", { class: "rel-nota" }, eGestor(ctx) ? "Metas e regras são ajustadas em Ajustes de anúncios." : "As metas e as regras são definidas pela equipe de gestão.")))));
  }
  /** Marca de gravidade: ícone + rótulo escrito (nunca só cor), na cor --c-sev-*; a barra de 3 px fica no <li> (data-sev). */
  function marcaSev(sev) {
    return h("span", { class: "ads-sev-marca" }, ui.icone(L.SEV_ICONE[sev]), h("span", { class: "ads-sev-rot" }, L.SEV_ROTULO[sev]));
  }
  function alertaConexao({ ref: x, sev }, n) {
    return h("li", { class: `ads-al ads-al-critico${x.ativo ? "" : " resolvido"}`, dataset: { sev }, style: `--i:${n}` },
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-topo" }, marcaSev(sev), h("span", { class: `rel-chip ${x.ativo ? "rel-chip-ruim" : "rel-chip-bom"}` }, x.ativo ? "ativo" : "resolvido")),
        h("p", { class: "ads-al-nome" }, x.nome),
        h("p", { class: "ads-al-msg" }, x.a.mensagem || ""),
        h("p", { class: "rel-nota" }, L.quandoSP(x.a.criado_em), x.envio ? envio(x.envio, " · aviso ") : null),
        x.ativo && eGestor(ctx) ? h("a", { class: "rel-link", href: "#/config/anuncios" }, "Resolver em Ajustes de anúncios") : null));
  }
  function alertaEpisodio({ ref: e, sev }, n) {
    return h("li", { class: `ads-al ads-al-${sev}${e.ativo ? "" : " resolvido"}`, dataset: { sev }, style: `--i:${n}` },
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-topo" }, marcaSev(sev), h("span", { class: `rel-chip ${e.ativo ? (sev === "critico" ? "rel-chip-ruim" : "rel-chip-aten") : "rel-chip-bom"}` }, e.ativo ? "ativo" : "resolvido")),
        h("p", { class: "ads-al-nome" }, e.nome),
        h("p", { class: "ads-al-msg" }, e.msg),
        e.ativo ? h("p", { class: "ads-al-acao" }, h("span", { class: "rel-olho" }, "O que fazer "), e.acao) : null,
        h("p", { class: "rel-nota" }, e.desde, e.envio ? envio(e.envio, " · aviso ") : null)));
  }
  const MET = { cpa: "Custo por conversa", ctr: "CTR", freq: "Frequência", conversoes: "Conversas" };
  const OPS = { ">": "acima de", "<": "abaixo de", ">=": "a partir de", "<=": "até" };
  function descreverRegra(r) {
    const f = { cpa: N.brl, ctr: x => N.pc(x, 2), freq: x => N.dec(x, 1), conversoes: N.int }[r.metrica] || String;
    return `${MET[r.metrica] || r.metrica} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${N.brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
  }
  function envio(st, antes = "") {
    return h("span", { class: `ads-env ads-env-${st.k}`, title: st.erro || st.rotulo }, antes, st.rotulo, " ", h("i", { class: "ads-tique", "aria-hidden": "true" }, st.tique));
  }

  /* ---------------- RELATÓRIOS ---------------- */
  function abaRelatorios(M, dados) {
    const lista = L.listaRelatorios(dados.relatorios || []);
    const previas = [];
    if (!L.semAnuncios(M)) {
      const enviado = chave => lista.some(x => x.chave === chave);
      if (!enviado(`diario|${N.isoDe(M.dataDe(M.R))}`))
        previas.push({ chave: "previa|diario", titulo: `Prévia do diário de ${M.dataBR(M.R)}`, previa: true, tipo: "diario", texto: () => M.relDiario(M.R) });
      const mes = M.mesesDados().filter(x => x.completo).pop();
      if (mes && !enviado(`mensal|${N.isoDe(M.dataDe(mes.de))}`)) previas.push({ chave: "previa|mensal", titulo: `Prévia do resumo de ${L.MESES[mes.mes]}`, previa: true, tipo: "mensal", texto: () => M.relMensal(mes) });
    }
    const itens = [...lista, ...previas];
    if (!itens.length) {
      corpo.append(ui.vazio({ titulo: "Nenhum relatório ainda", texto: "O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios." }));
      return;
    }
    if (!S.rel || !itens.some(i => i.chave === S.rel)) S.rel = itens[0].chave;
    const ul = h("ul", { class: "ads-rel-lista", role: "list" });
    const tela = h("div", { class: "ads-fone" });
    const statusLeitor = h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    const mostrar = () => {
      for (const b of ul.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.chave === S.rel));
      const it = itens.find(i => i.chave === S.rel);
      const st = it.previa ? null : it.envio;
      statusLeitor.textContent = it.previa ? `${it.titulo}. Prévia ainda não enviada.`
        : `${it.titulo}. ${st?.rotulo || "Status de envio indisponível"}${st?.hora ? ` às ${st.hora}` : ""}.`;
      ui.limpar(tela);
      const texto = it.previa ? it.texto() : it.r.texto || "";
      const bolha = h("div", { class: "ads-bolha" });
      for (const tk of L.tokensWa(texto)) {
        if (tk.t === "br") bolha.append(h("br"));
        else if (tk.t === "b") bolha.append(h("strong", {}, tk.v));
        else if (tk.t === "i") bolha.append(h("em", {}, tk.v));
        else bolha.append(document.createTextNode(tk.v));
      }
      bolha.append(h("span", { class: "ads-bolha-hora" }, st ? (st.hora || st.rotulo) : "prévia", st ? h("i", { class: `ads-tique ads-env-${st.k}`, "aria-hidden": "true" }, ` ${st.tique}`) : null));
      tela.append(...[
        h("div", { class: "ads-fone-topo" }, h("span", { class: "ads-fone-av", "aria-hidden": "true" }, ui.icone("whatsapp")),
          h("span", {}, h("b", {}, it.tipo === "mensal" ? "Resumo do mês" : "Relatório diário"), h("small", {}, it.previa ? "prévia calculada agora com os números do painel" : st ? st.rotulo : ""))),
        h("div", { class: "ads-fone-corpo" }, bolha),
        st && st.erro ? h("p", { class: "ads-rel-erro" }, st.erro) : null,
        it.ia ? h("p", { class: "rel-nota" }, "Leitura do dia escrita por IA a partir dos números.") : null].filter(Boolean));
    };
    for (const it of itens) {
      const b = h("button", { type: "button", class: "ads-rel-item", "aria-pressed": "false" },
        h("span", { class: "ads-rel-t" }, it.titulo, it.ia ? h("span", { class: "rel-chip rel-chip-info" }, "IA") : null),
        it.previa ? h("span", { class: "rel-nota" }, "ainda não enviado · prévia") : envio(it.envio));
      b.dataset.chave = it.chave;
      b.addEventListener("click", () => { S.rel = it.chave; mostrar(); });
      ul.append(h("li", {}, b));
    }
    corpo.append(h("div", { class: "ads-rel-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Relatórios e prévias"), ul,
        h("p", { class: "rel-nota" }, "✓ a API aceitou · ✓✓ chegou no celular · ! não saiu. Quando o relatório de um dia ainda não foi enviado, aparece a prévia calculada agora.")),
      h("div", { class: "rel-cartao ads-fone-cartao rel-entra" }, tela, statusLeitor)));
    mostrar();
  }

  await recarregar(false);
}
