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
  buscaCamp: "", resultadoCamp: "todos", comparacaoCamp: [], filtroRadar: "todos" };
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

/* ============================================================
   PLANO 50 (frente F) — peças de tela compartilhadas com relatorios.js: sparkline com fallback, exportação PNG,
   gráfico de tendência (2 eixos, legenda clicável, teclado), funil por plataforma, calor semanal, semáforo do Radar e
   barras por campanha. Recebem `h`/`G`/`document` por parâmetro ou global: o teste roda com um DOM mínimo.
   ============================================================ */
const NS_SVG = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}, ...filhos) => {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") for (const [p, q] of Object.entries(v)) el.style.setProperty(p, q);
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(typeof f === "string" ? document.createTextNode(f) : f);
  return el;
};
const movReduzido = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const r1 = v => String(Math.round(v * 10) / 10);

/** Sparkline: usa graficos.sparkline quando a frente A já entregou; senão um SVG mínimo (polilinha + último ponto) com a geometria pura de L. */
export function desenharSparkline({ G, L, alvo, valores = [], rotulo = "", classe = "" }) {
  const v = (valores || []).filter(x => Number.isFinite(+x));
  if (!alvo || v.length < 2) return null;
  if (G && typeof G.sparkline === "function") { try { return G.sparkline(alvo, { valores: v, rotulo, area: true }); } catch { /* cai no fallback */ } }
  const W = 96, H = 28, pts = L.pontosSparkline(v, W, H);
  if (!pts) return null;
  const ultimo = pts.split(" ").pop().split(",");
  const svg = sv("svg", { class: `spark ${classe}`.trim(), viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": rotulo || "tendência", focusable: "false" },
    sv("polyline", { class: "spark-area", points: `${pts.split(" ")[0].split(",")[0]},${H} ${pts} ${ultimo[0]},${H}` }),
    sv("polyline", { class: "spark-linha", points: pts }),
    sv("circle", { class: "spark-fim", cx: ultimo[0], cy: ultimo[1], r: 2.5 }));
  alvo.append(svg);
  return svg;
}

const escXml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Serializa um SVG levando os estilos calculados para dentro (as cores vêm de classes do tema, que o PNG não enxergaria). Puro além de `lerEstilo`. */
export function svgParaTexto(el, lerEstilo, props = [], { fundo = null } = {}) {
  const andar = no => {
    if (no.nodeType === 3) return escXml(no.textContent || "");
    if (no.nodeType !== 1) return "";
    const tag = String(no.tagName || "").toLowerCase();
    if (tag === "title") return "";                       // dica de hover não vai para a imagem
    const nomes = typeof no.getAttributeNames === "function" ? no.getAttributeNames() : [...(no.attributes || [])].map(a => a.name);
    const attrs = nomes.filter(n => n !== "style" && n !== "class" && !/^on/i.test(n)).map(n => ` ${n}="${escXml(no.getAttribute(n))}"`).join("");
    const cs = lerEstilo ? lerEstilo(no) : null;
    const estilo = cs ? props.map(p => { const v = cs.getPropertyValue ? cs.getPropertyValue(p) : cs[p]; return v && v !== "none" || (p === "fill" || p === "stroke") ? `${p}:${v || "none"}` : ""; }).filter(Boolean).join(";") : "";
    const filhos = [...(no.childNodes || [])].map(andar).join("");
    const extra = tag === "svg" && fundo ? `<rect width="100%" height="100%" fill="${escXml(fundo)}"/>` : "";
    return `<${tag}${tag === "svg" ? ` xmlns="${NS_SVG}"` : ""}${attrs}${estilo ? ` style="${escXml(estilo)}"` : ""}>${extra}${filhos}</${tag}>`;
  };
  return andar(el);
}
/** Baixa o SVG de um gráfico como PNG (canvas em 2×). Devolve true se conseguiu; false quando o navegador não deixa (o chamador avisa). */
export async function exportarSvgPng(svg, nome, { L, escala = 2 } = {}) {
  if (!svg || typeof document === "undefined") return false;
  try {
    // fundo do cartão (token do tema); sem ele, o fundo da página — nunca uma cor escrita aqui
    const fundo = getComputedStyle(document.documentElement).getPropertyValue("--c-sup").trim() || getComputedStyle(document.body).backgroundColor || "white";
    const texto = svgParaTexto(svg, el => getComputedStyle(el), (L && L.ESTILOS_SVG_EXPORT) || ["fill", "stroke", "stroke-width", "font-family", "font-size", "opacity"], { fundo });
    const r = svg.getBoundingClientRect(), W = Math.max(1, Math.round(r.width || +svg.getAttribute("width") || 640)), H = Math.max(1, Math.round(r.height || +svg.getAttribute("height") || 280));
    const img = new Image();
    await new Promise((ok, erro) => { img.onload = ok; img.onerror = () => erro(new Error("svg")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`; });
    const canvas = document.createElement("canvas");
    canvas.width = W * escala; canvas.height = H * escala;
    const ctx2d = canvas.getContext("2d");
    ctx2d.fillStyle = fundo; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/png"));
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nome || "grafico.png";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
}
/** Botão «PNG» do rodapé de um gráfico: acha o SVG dentro de `alvo` na hora do clique (o gráfico redesenha ao redimensionar).
    `titulo` entra no rótulo («Baixar “Tendência” em PNG»): com dois gráficos na tela, o leitor de tela sabe qual é qual. */
export function botaoPng({ h, alvo, nome, L, titulo = "", aoFalhar = () => {} }) {
  const b = h("button", { type: "button", class: "g-ver-tabela relat-csv rel-png", title: "Baixar este gráfico como imagem (PNG)", "aria-label": titulo ? `Baixar «${titulo}» em PNG` : "Baixar gráfico em PNG" }, "PNG");
  b.addEventListener("click", async () => {
    const svg = alvo && typeof alvo.querySelector === "function" ? alvo.querySelector("svg") : null;
    if (!svg) { aoFalhar("Este bloco não tem gráfico para exportar."); return; }
    b.disabled = true;
    const ok = await exportarSvgPng(svg, typeof nome === "function" ? nome() : nome, { L });
    b.disabled = false;
    if (!ok) aoFalhar("Não foi possível gerar a imagem agora. Use «Ver como tabela» e copie os números.");
  });
  return b;
}

/**
 * Gráfico de tendência (item 45): investimento (área, eixo da esquerda em R$) × conversas e agendamentos do CRM (linhas, eixo da direita).
 * A legenda é clicável (esconde a série e reescala os eixos); setas/Home/End leem dia a dia; o texto da dica vai para um aria-live discreto.
 * @param o {serie:[{i,gasto,conversas,agendadas}], rotuloDia(i), diaLongo(i), fmtMoeda, fmtMoedaCurto, fmtNum, resumo, G}
 */
export function criarGraficoTendencia(alvo, o) {
  const G = o.G;
  const SERIES = [
    { id: "gasto", nome: "Investimento", classe: "g-td-gasto", eixo: "esq", area: true },
    { id: "conversas", nome: "Conversas no CRM", classe: "g-td-conv", eixo: "dir" },
    { id: "agendadas", nome: "Agendamentos", classe: "g-td-ag", eixo: "dir" },
  ];
  const ativas = new Set(SERIES.map(x => x.id));
  const caixa = document.createElement("div");
  caixa.className = "g-caixa g-tendencia"; caixa.tabIndex = 0; caixa.setAttribute("role", "group");
  caixa.setAttribute("aria-label", `${o.resumo}. Use as setas para ler dia a dia; a legenda liga e desliga cada série.`);
  const dica = document.createElement("div"); dica.className = "g-dica"; dica.setAttribute("role", "status"); dica.setAttribute("aria-live", "polite"); dica.hidden = true;
  const legenda = document.createElement("ul"); legenda.className = "g-legenda g-legenda-botoes"; legenda.setAttribute("aria-label", "Séries do gráfico");
  const botoes = new Map();
  for (const se of SERIES) {
    const b = document.createElement("button"); b.type = "button"; b.className = `g-leg-b ${se.classe}`; b.setAttribute("aria-pressed", "true"); b.dataset.serie = se.id;
    const i = document.createElement("i"); i.className = `g-marca ${se.classe}`; i.setAttribute("aria-hidden", "true");
    b.append(i, document.createTextNode(se.nome));
    b.addEventListener("click", () => alternar(se.id));
    const li = document.createElement("li"); li.append(b); legenda.append(li); botoes.set(se.id, b);
  }
  alvo.append(caixa, legenda);
  caixa.append(dica);
  let geo = null, atual = -1, W = 0;
  const n = () => o.serie.length;
  const texto = k => { const p = o.serie[k]; const partes = []; if (ativas.has("gasto")) partes.push(`investimento ${o.fmtMoeda(p.gasto)}`); if (ativas.has("conversas")) partes.push(`${o.fmtNum(p.conversas)} ${p.conversas === 1 ? "conversa" : "conversas"}`); if (ativas.has("agendadas")) partes.push(`${o.fmtNum(p.agendadas)} ${p.agendadas === 1 ? "agendamento" : "agendamentos"}`); return `${o.diaLongo(p.i)} — ${partes.join(" · ")}`; };
  const desenhar = (anim) => {
    const velho = caixa.querySelector("svg"); if (velho) velho.remove();
    const serie = o.serie, N = serie.length;
    if (!N) { geo = null; return; }
    const Wt = W || 640, H = Wt < 560 ? 220 : 260;
    const P = { l: Wt < 560 ? 48 : 60, r: Wt < 560 ? 34 : 44, t: 14, b: 28 }, iw = Wt - P.l - P.r, ih = H - P.t - P.b, base = P.t + ih;
    const maxG = G.topoBonito(Math.max(1, ...serie.map(d => (ativas.has("gasto") ? d.gasto : 0))));
    const maxC = Math.max(4, G.topoBonito(Math.max(1, ...serie.map(d => Math.max(ativas.has("conversas") ? d.conversas : 0, ativas.has("agendadas") ? d.agendadas : 0)))));
    const x = k => P.l + (N > 1 ? k / (N - 1) * iw : iw / 2);
    const yG = G.escala([0, maxG], [base, P.t]), yC = G.escala([0, maxC], [base, P.t]);
    const svg = sv("svg", { viewBox: `0 0 ${Wt} ${H}`, width: Wt, height: H, role: "img", "aria-label": o.resumo, class: anim && !movReduzido() ? "g-anim" : "" });
    const grade = sv("g", { class: "g-grade", "aria-hidden": "true" });
    for (let k = 0; k <= 4; k++) {
      const yy = yG(maxG * k / 4);
      grade.append(sv("line", { x1: P.l, x2: Wt - P.r, y1: r1(yy), y2: r1(yy) }));
      if (ativas.has("gasto")) grade.append(sv("text", { x: P.l - 8, y: r1(yy + 4), "text-anchor": "end" }, o.fmtMoedaCurto(maxG * k / 4)));
      if (ativas.has("conversas") || ativas.has("agendadas")) grade.append(sv("text", { x: Wt - P.r + 8, y: r1(yy + 4), class: "g-eixo-dir" }, o.fmtNum(Math.round(maxC * k / 4))));
    }
    svg.append(grade);
    const pontos = [];
    SERIES.forEach((se, j) => {
      if (!ativas.has(se.id)) return;
      const y = se.eixo === "esq" ? yG : yC;
      const pts = serie.map((d, k) => [x(k), y(d[se.id] || 0)]);
      // traço reto: contagens inteiras por dia não podem «mergulhar» abaixo de zero como a curva suave faria
      if (se.area && pts.length > 1) svg.append(sv("path", { class: `g-area ${se.classe}`, d: G.caminhoArea(pts, base, false) }));
      const d = pts.length > 1 ? G.caminhoReto(pts) : `M${r1(pts[0][0] - 3)} ${r1(pts[0][1])} L${r1(pts[0][0] + 3)} ${r1(pts[0][1])}`;
      svg.append(sv("path", { class: `g-linha ${se.classe}`, d, pathLength: 1, style: { "--i": j * 3 } }, sv("title", {}, se.nome)));
      pontos.push({ se, c: sv("circle", { class: `g-ponto ${se.classe}`, r: 4, cx: -20, cy: -20, visibility: "hidden" }) });
    });
    const passo = G.passoRotulo(N, Wt < 560 ? 4 : 7), gX = sv("g", { class: "g-eixo-x", "aria-hidden": "true" });
    for (const k of G.indicesRotulo(N, passo, x, serie.map(d => o.rotuloDia(d.i)))) gX.append(sv("text", { x: r1(x(k)), y: H - 8, "text-anchor": k === 0 ? "start" : k === N - 1 ? "end" : "middle" }, o.rotuloDia(serie[k].i)));
    svg.append(gX);
    const mira = sv("line", { class: "g-mira", x1: 0, x2: 0, y1: P.t, y2: base, visibility: "hidden" });
    svg.append(mira); for (const p of pontos) svg.append(p.c);
    caixa.prepend(svg);
    geo = { x, yG, yC, mira, pontos, P, W: Wt, iw, N };
    if (atual >= 0) mostrar(atual);
  };
  const posDica = k => { const svg = caixa.querySelector("svg"); const sr = svg && svg.getBoundingClientRect ? svg.getBoundingClientRect() : { width: geo.W, left: 0 }; const cr = caixa.getBoundingClientRect ? caixa.getBoundingClientRect() : { left: 0 }; return geo.x(k) * (sr.width || geo.W) / geo.W + ((sr.left || 0) - (cr.left || 0)); };
  function mostrar(k) {
    if (!geo) return;
    k = Math.max(0, Math.min(n() - 1, k)); atual = k;
    dica.textContent = texto(k); dica.hidden = false;
    const larg = caixa.clientWidth || geo.W, dw = dica.offsetWidth || 160, px = posDica(k);
    dica.style.setProperty("--x", `${Math.max(4, Math.min(larg - dw - 4, px - dw / 2))}px`);
    const xx = geo.x(k);
    geo.mira.setAttribute("x1", r1(xx)); geo.mira.setAttribute("x2", r1(xx)); geo.mira.removeAttribute("visibility");
    for (const { se, c } of geo.pontos) { const y = se.eixo === "esq" ? geo.yG : geo.yC; c.setAttribute("cx", r1(xx)); c.setAttribute("cy", r1(y(o.serie[k][se.id] || 0))); c.removeAttribute("visibility"); }
  }
  function esconder() { atual = -1; dica.hidden = true; if (!geo) return; geo.mira.setAttribute("visibility", "hidden"); for (const { c } of geo.pontos) c.setAttribute("visibility", "hidden"); }
  function alternar(id) {
    if (!botoes.has(id)) return false;
    if (ativas.has(id)) { if (ativas.size === 1) return false; ativas.delete(id); } else ativas.add(id);   // a última série ligada não desliga
    for (const [sid, b] of botoes) { const on = ativas.has(sid); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("g-leg-off", !on); }
    desenhar(false);
    if (typeof o.aoMudarSeries === "function") o.aoMudarSeries([...ativas]);
    return true;
  }
  const medir = () => Math.max(260, Math.round(caixa.clientWidth || alvo.clientWidth || 640));
  W = medir(); desenhar(true);
  let ro = null;
  if (typeof ResizeObserver === "function") { ro = new ResizeObserver(() => { const nw = medir(); if (Math.abs(nw - W) > 24) { W = nw; desenhar(false); } }); ro.observe(caixa); }
  const indice = e => { if (!geo) return -1; const svg = caixa.querySelector("svg"); const r = svg.getBoundingClientRect(); const k = r.width / geo.W; const px = (e.clientX - r.left) / k - geo.P.l; return geo.N > 1 ? Math.round(px / geo.iw * (geo.N - 1)) : 0; };
  const ponteiro = e => { const k = indice(e); if (k < 0 || k >= n()) return esconder(); mostrar(k); };
  caixa.addEventListener("pointermove", ponteiro);
  caixa.addEventListener("pointerdown", ponteiro);
  caixa.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") esconder(); });
  caixa.addEventListener("blur", () => esconder());
  caixa.addEventListener("keydown", e => {
    const ult = n() - 1, mapa = { ArrowRight: atual < 0 ? 0 : atual + 1, ArrowLeft: atual < 0 ? ult : atual - 1, Home: 0, End: ult };
    if (e.key === "Escape") return esconder();
    if (!(e.key in mapa) || !geo) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    mostrar(Math.max(0, Math.min(ult, mapa[e.key])));
  });
  return { elemento: caixa, legenda, destruir() { if (ro) ro.disconnect(); ro = null; }, redesenhar() { W = medir(); desenhar(false); }, alternar, mostrar, esconder,
    get ativas() { return [...ativas]; }, get atual() { return atual; } };
}

/** Funil por plataforma (item 46): uma coluna por plataforma, 4 etapas em barra proporcional e a taxa entre cada par. */
export function criarFunilPlataformas({ h, dados = [], fmtInt = String, fmtMoeda = String, pctTxt = v => `${v}%` }) {
  const raiz = h("div", { class: "ads-fp", role: "list", "aria-label": "Funil por plataforma" });
  for (const p of dados) {
    const col = h("div", { class: `ads-fp-col ads-fp-${p.plat}`, role: "listitem" },
      h("div", { class: "ads-fp-cab" }, h("span", { class: `rel-chip rel-chip-${p.plat}` }, p.nome),
        h("span", { class: "rel-nota" }, `${fmtMoeda(p.gasto)} investidos → ${fmtMoeda(p.receita)} em receita`)));
    const ol = h("ol", { class: "ads-fp-etapas" });
    p.etapas.forEach((e, k) => {
      const w = p.max > 0 ? Math.max(e.v > 0 ? 4 : 0, e.v / p.max * 100) : 0;
      const taxa = k ? p.taxas[k - 1] : null;
      ol.append(h("li", { class: "ads-fp-etapa", style: `--i:${k}` },
        taxa ? h("span", { class: `ads-fp-taxa${taxa.pct == null ? " ads-fp-taxa-0" : ""}`, title: `${e.rotulo} ÷ ${p.etapas[k - 1].rotulo}` }, taxa.pct == null ? "sem base" : `${pctTxt(taxa.pct)} ↓`) : h("span", { class: "ads-fp-taxa ads-fp-taxa-0", "aria-hidden": "true" }),
        h("span", { class: "ads-fp-trilho" }, h("i", { class: `ads-fp-barra g-${p.plat}`, style: `--w:${w.toFixed(1)}%` })),
        h("span", { class: "ads-fp-rot" }, h("b", { class: "rel-num" }, fmtInt(e.v)), " ", e.rotulo)));
    });
    col.append(ol);
    raiz.append(col);
  }
  if (!dados.length) raiz.append(h("p", { class: "rel-vazio-txt" }, "Nenhuma plataforma com movimento no período."));
  return raiz;
}

/** Calor semanal (item 47): dia da semana × semana; célula com título legível e escala no rodapé. `nivel(v, max)` vem de graficos.nivelCalor. */
export function criarCalorSemanal({ h, calor, dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt = String, nivel = (v, max) => (v > 0 ? Math.max(1, Math.min(5, Math.ceil(v / max * 5))) : 0), resumo = "" }) {
  const nSem = calor.semanas.length;
  const grade = h("div", { class: `ads-cal${movReduzido() ? "" : " g-anim"}`, role: "img", "aria-label": resumo, style: `--n:${nSem}` });
  grade.append(h("span", { class: "g-cal-canto", "aria-hidden": "true" }));
  calor.semanas.forEach(s => grade.append(h("span", { class: "g-cal-h", "aria-hidden": "true" }, s.rotulo)));
  [1, 2, 3, 4, 5, 6, 0].forEach((d, lin) => {
    grade.append(h("span", { class: "g-cal-d", "aria-hidden": "true" }, dias[d]));
    for (let k = 0; k < nSem; k++) {
      const v = calor.matriz[d][k] || 0;
      grade.append(h("span", { class: `g-cal-c g-n${nivel(v, calor.max)}${calor.pico && calor.pico.dow === d && calor.pico.semana === k ? " ads-cal-pico" : ""}`,
        title: `${dias[d]} · semana de ${calor.semanas[k].rotulo}: ${fmt(v)}`, style: `--i:${lin * 2 + k}` }));
    }
  });
  const esc = h("div", { class: "g-cal-escala", "aria-hidden": "true" }, h("span", {}, "menos"), [0, 1, 2, 3, 4, 5].map(k => h("i", { class: `g-cal-c g-n${k}` })), h("span", {}, "mais"));
  return h("div", { class: "ads-cal-caixa" }, h("div", { class: "g-cal-rolagem" }, grade), esc);
}

/** Semáforo do Radar (item 51): três luzes com contagem, frase para leigo, ação sugerida (com `link` opcional: {rotulo, href}) e filtro da lista (todos/ativos/resolvidos).
    Nível neutro (sem números de anúncio): nenhuma luz acesa e o cartão sem a cor verde. */
export function criarSemaforoRadar({ h, semaforo, icone = null, filtro = "todos", aoFiltrar = () => {}, link = null }) {
  // o leitor de tela ouve «0 críticos», «1 ponto de atenção», «2 informativos» (com plural)
  const luz = (sev, um, varios, q) => { const rotulo = `${q} ${q === 1 ? um : varios}`;
    return h("span", { class: `ads-sem-luz ads-sem-${sev}${q ? " acesa" : ""}`, role: "img", "aria-label": rotulo },
      h("i", { "aria-hidden": "true" }), h("b", { class: "rel-num" }, String(q)), h("small", {}, rotulo)); };
  const luzes = h("div", { class: "ads-sem-luzes" }, luz("critico", "crítico", "críticos", semaforo.contagens.critico),
    luz("alerta", "ponto de atenção", "pontos de atenção", semaforo.contagens.alerta), luz("info", "informativo", "informativos", semaforo.contagens.info));
  const seg = h("div", { class: "rel-seg ads-sem-filtro", role: "group", "aria-label": "Mostrar alertas" });
  const OPC = [["todos", "Todos"], ["ativos", "Ativos"], ["resolvidos", "Resolvidos"]];
  let atual = OPC.some(([v]) => v === filtro) ? filtro : "todos";
  for (const [v, t] of OPC) {
    const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(v === atual), dataset: { filtro: v } }, t);
    b.addEventListener("click", () => { if (v === atual) return; atual = v; for (const x of seg.querySelectorAll ? seg.querySelectorAll("button") : (seg.filhos || [])) x.setAttribute("aria-pressed", String(x.dataset && x.dataset.filtro === v)); aoFiltrar(v); });
    seg.append(b);
  }
  const raiz = h("section", { class: `rel-cartao rel-entra ads-semaforo ads-semaforo-${semaforo.cor}`, "aria-labelledby": "ads-sem-h" },
    h("div", { class: "ads-sem-topo" }, luzes,
      h("div", { class: "ads-sem-txt" }, h("p", { class: "rel-olho" }, "Radar dos anúncios"), h("h2", { id: "ads-sem-h", class: "ads-sem-frase narr" }, semaforo.frase),
        h("p", { class: "ads-sem-acao" }, icone ? icone("raio") : null, h("span", { class: "rel-olho" }, "Sugestão "), semaforo.acao),
        link && link.href ? h("a", { class: "rel-btn rel-btn-sec ads-sem-link", href: link.href }, link.rotulo) : null)),
    seg);
  return { elemento: raiz, get filtro() { return atual; } };
}

/** Barras por campanha (item 48): investimento de cada campanha; a marcada para comparação ou sob o mouse na tabela fica em destaque. */
export function criarBarrasCampanhas({ h, linhas = [], fmtMoeda = String, fmtInt = String, nomePlat = String, aoEscolher = () => {}, max = 8 }) {
  const topo = linhas.slice().sort((a, b) => (b.t.gasto || 0) - (a.t.gasto || 0)).slice(0, max);
  const maior = Math.max(1, ...topo.map(r => r.t.gasto || 0));
  const itens = new Map();
  const ol = h("ol", { class: `ads-cb${movReduzido() ? "" : " g-anim"}`, "aria-label": "Investimento por campanha" });
  topo.forEach((r, n) => {
    const b = h("button", { type: "button", class: "ads-cb-item", "aria-pressed": "false", dataset: { campId: String(r.c.id) }, style: `--i:${n}`,
      title: `${r.c.nome}: ${fmtMoeda(r.t.gasto)} · ${fmtInt(r.t.conversoes)} conversões · ${fmtInt(r.k.agendadas)} agendamentos` },
      h("span", { class: "ads-cb-nome" }, h("i", { class: `g-marca g-${r.c.plat}`, "aria-hidden": "true" }), r.c.nome, h("span", { class: "sr-only" }, ` · ${nomePlat(r.c.plat)}`)),
      h("span", { class: "ads-cb-trilho" }, h("i", { class: `ads-cb-barra g-${r.c.plat}`, style: `--w:${((r.t.gasto || 0) / maior * 100).toFixed(1)}%` })),
      h("span", { class: "ads-cb-val rel-num" }, fmtMoeda(r.t.gasto)));
    b.addEventListener("click", () => aoEscolher(r));
    itens.set(String(r.c.id), b);
    ol.append(h("li", {}, b));
  });
  const destacar = ids => { const set = new Set((ids || []).map(String)); for (const [id, b] of itens) { const on = set.has(id); b.setAttribute("aria-pressed", String(on)); if (b.classList) b.classList.toggle("ads-cb-dest", on); } };
  const realcar = id => { for (const [k, b] of itens) if (b.classList) b.classList.toggle("ads-cb-hover", id != null && String(id) === k); };
  return { elemento: ol, destacar, realcar, itens };
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
  /** Baixa um bloco em CSV (números crus: L.csv troca o ponto por vírgula e escapa fórmula). */
  const baixarCsv = (nome, colunas, linhas) => {
    const url = URL.createObjectURL(new Blob([L.csv(colunas, linhas)], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: L.nomeArquivoExport(nome, `${S.dias}dias`, S.plat || "tudo", "csv") });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const botaoCsv = (nome, colunas, linhas, titulo = "") => {
    const b = h("button", { type: "button", class: "g-ver-tabela relat-csv", title: "Baixar este bloco em CSV (abre no Excel)", "aria-label": titulo ? `Baixar «${titulo}» em CSV` : "Baixar este bloco em CSV" }, "CSV");
    b.addEventListener("click", () => baixarCsv(nome, colunas, linhas()));
    return b;
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
    // item 49 (Ads): cada KPI com a sparkline dos dias do período (o CPA não tem série diária honesta: fica sem)
    const tend = L.serieTendencia(M, { dias: S.dias, plat: S.plat });
    const sparkDe = campo => (campo ? tend.map(d => d[campo]) : []);
    kpis[0].spark = sparkDe("gasto"); kpis[2].spark = sparkDe("convAds"); kpis[3].spark = sparkDe("receita");
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
      if (k.spark && k.spark.length > 1 && k.spark.some(v => v > 0)) {
        const sp = h("span", { class: "rel-kpi-spark", "aria-hidden": "true" });
        if (desenharSparkline({ G, L, alvo: sp, valores: k.spark, rotulo: `${k.l}: dia a dia` })) cel.append(sp);
      }
      if (k.extra) cel.append(h("span", { class: "rel-kpi-extra" }, k.extra));
      regua.append(cel);
    });
    corpo.append(regua);

    // item 45: tendência investimento × conversas × agendamentos (2 eixos, legenda clicável, teclado) + tabela/CSV/PNG
    const alvoT = h("div", { class: "rel-grafico" });
    const rodapeT = h("div", { class: "rel-cartao-rodape" });
    const totT = tend.reduce((a, d) => ({ g: a.g + d.gasto, c: a.c + d.conversas, ag: a.ag + d.agendadas }), { g: 0, c: 0, ag: 0 });
    const resumoT = `${periodoTexto}. Tendência: ${N.brl0(totT.g)} investidos, ${N.int(totT.c)} conversas e ${N.int(totT.ag)} agendamentos registrados no CRM`;
    const cartaoT = h("section", { class: "rel-cartao ads-cartao-g rel-entra", "aria-labelledby": "ads-tend-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-tend-h", class: "rel-h2" }, "Tendência: investimento × conversas × agendamentos"),
        h("p", { class: "rel-nota" }, "R$ no eixo da esquerda; conversas e agendamentos do CRM no da direita, pela data de cada evento. Clique na legenda para esconder uma série.")),
      alvoT, rodapeT);
    if (tend.length > 1) {
      const gT = criarGraficoTendencia(alvoT, { G, serie: tend, rotuloDia: M.ddmm, diaLongo: i => `${L.SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`,
        fmtMoeda: N.brl, fmtMoedaCurto: N.brl0, fmtNum: N.int, resumo: resumoT });
      graficos.push(gT);
      G.alternarTabela(rodapeT, alvoT, { legenda: `${resumoT}; valores diários`, colunas: ["Dia", "Investimento", "Conversas CRM", "Agendamentos CRM", "Fechamentos CRM"],
        linhas: tend.map(d => [M.dataBR(d.i), N.brl(d.gasto), N.int(d.conversas), N.int(d.agendadas), N.int(d.fecharam)]) });
      rodapeT.append(botaoCsv("tendencia", ["Dia", "Investimento", "Conversões Ads", "Conversas CRM", "Agendamentos CRM", "Fechamentos CRM", "Receita CRM"],
        () => tend.map(d => [M.dataBR(d.i), Math.round(d.gasto * 100) / 100, d.convAds, d.conversas, d.agendadas, d.fecharam, Math.round(d.receita * 100) / 100]), "Tendência"),
        botaoPng({ h, alvo: alvoT, nome: () => L.nomeArquivoExport("tendencia", N.isoDe(M.dataDe(P.de)), N.isoDe(M.dataDe(P.ate))), L, titulo: "Tendência", aoFalhar: t => ui.toast(t, { tipo: "nota" }) }));
    } else alvoT.append(h("p", { class: "rel-vazio-txt" }, "Ainda não há dias suficientes para desenhar a tendência."));
    corpo.append(cartaoT);

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
    rodape.append(botaoCsv("investimento-diario", ["Dia", "Investimento Meta", "Investimento Google", "Conversões Ads"], () => serie.atual.map(d => [M.dataBR(d.i), Math.round(d.meta * 100) / 100, Math.round(d.google * 100) / 100, d.conv]), "Investimento diário"),
      botaoPng({ h, alvo: alvoG, nome: () => L.nomeArquivoExport("investimento-diario", N.isoDe(M.dataDe(P.de)), N.isoDe(M.dataDe(P.ate))), L, titulo: "Investimento diário", aoFalhar: t => ui.toast(t, { tipo: "nota" }) }));

    const lado = h("div", { class: "ads-lado" });
    // Meta × Google
    if (!S.plat) {
      const { de, ate } = L.janela(M, S.dias);
      const pl = ["meta", "google"].map(p => ({ p, t: M.consolidar(M.linhasDe(de, ate, { plat: p })), c: M.crmTot(de, ate, { plat: p }) })).filter(x => x.t.gasto > 0 || x.c.conversas > 0);
      if (pl.length) {
        const maxG = Math.max(1, ...pl.map(x => x.t.gasto));
        // item 48: rosca da divisão do investimento (ordem fixa Meta → Google: as cores das fatias casam com as marcas)
        const alvoD = h("div", { class: "ads-donut-plat" });
        const fatias = ["meta", "google"].map(p => { const x = pl.find(y => y.p === p); return { rotulo: L.nomePlat(p), valor: x ? x.t.gasto : 0, extra: x ? `${N.int(x.t.conversoes)} conversões · CPA ${N.brl(x.t.cpa)}` : "sem investimento" }; });
        const totalD = fatias.reduce((s, f) => s + f.valor, 0);
        const donut = typeof G.donut === "function" ? G.donut : G.rosca;
        if (totalD > 0) graficos.push(donut(alvoD, { resumo: `Divisão do investimento: ${fatias.map(f => `${f.rotulo} ${N.brl0(f.valor)}`).join(", ")}`, fatias, fmt: N.brl0,
          centro: { valor: `${Math.round((fatias[0].valor / totalD) * 100)}%`, rotulo: "no Meta" } }));
        lado.append(h("div", { class: "rel-cartao ads-plats rel-entra" }, h("h2", { class: "rel-h2" }, "Por plataforma"),
          h("p", { class: "rel-nota" }, `${periodoTexto}. Os eventos do CRM usam suas próprias datas e não são o denominador do CPA da plataforma.`),
          alvoD,
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

    // item 46: funil anúncio → conversa → agenda → venda, por plataforma (com a plataforma filtrada, só ela)
    const fp = L.funilPorPlataforma(M, { dias: S.dias }).filter(x => !S.plat || x.plat === S.plat);
    const cartaoF = h("section", { class: "rel-cartao rel-entra ads-cartao-fp", "aria-labelledby": "ads-fp-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-fp-h", class: "rel-h2" }, "Do anúncio à venda, por plataforma"),
        h("p", { class: "rel-nota" }, `${periodoTexto}. A conversão do anúncio é contada pela plataforma; conversas, agendamentos e fechamentos vêm do CRM, cada um na sua data — a taxa entre etapas é uma leitura de ritmo, não uma coorte.`)),
      criarFunilPlataformas({ h, dados: fp, fmtInt: N.int, fmtMoeda: N.brl0, pctTxt: v => N.pc(v, 0) }));
    if (fp.length) cartaoF.append(h("div", { class: "rel-cartao-rodape" }, botaoCsv("funil-plataformas", ["Plataforma", "Investimento", "Conversões do anúncio", "Conversas CRM", "Agendaram", "Fecharam", "Receita"],
      () => fp.map(p => [p.nome, Math.round(p.gasto * 100) / 100, ...p.etapas.map(e => e.v), Math.round(p.receita * 100) / 100]), "Do anúncio à venda, por plataforma")));

    // item 47: calor dia da semana × semana das conversas de anúncio (nx_dados não traz a hora: a leitura é por dia)
    const cal = L.calorSemanal(M, { dias: S.dias, plat: S.plat, campo: "conversas" });
    const resumoC = cal.melhorDow == null ? "Nenhuma conversa de anúncio no período." : `Conversas de anúncio por dia da semana e semana; ${L.SEMANA[cal.melhorDow]} é o dia mais forte (${N.int(cal.porDow[cal.melhorDow])} no período).`;
    const alvoC = h("div", { class: "rel-grafico" }), rodapeC = h("div", { class: "rel-cartao-rodape" });
    const cartaoC = h("section", { class: "rel-cartao rel-entra ads-cartao-cal", "aria-labelledby": "ads-cal-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-cal-h", class: "rel-h2" }, "Em que dias as conversas chegam"),
        h("p", { class: "rel-nota" }, cal.melhorDow == null ? "Sem conversas atribuídas a anúncios neste período." : `${resumoC} A hora da conversa não vem com os dados de anúncios; por isso a leitura é por dia.`)),
      alvoC, rodapeC);
    if (cal.max > 0) {
      alvoC.append(criarCalorSemanal({ h, calor: cal, dias: L.SEMANA, fmt: v => `${N.int(v)} ${v === 1 ? "conversa" : "conversas"}`, nivel: G.nivelCalor, resumo: resumoC }));
      G.alternarTabela(rodapeC, alvoC, { legenda: "Conversas de anúncio por dia da semana e semana", colunas: ["Dia", ...cal.semanas.map(s => `sem. ${s.rotulo}`), "Total"],
        linhas: [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...cal.matriz[d].map(v => N.int(v)), N.int(cal.porDow[d])]) });
    } else alvoC.append(h("p", { class: "rel-vazio-txt" }, "Quando as primeiras conversas chegarem, o mapa mostra os dias mais fortes."));
    corpo.append(h("div", { class: "ads-grade-2" }, cartaoF, cartaoC));
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
      // item 48: barras de investimento por campanha; a marcada para comparar fica em destaque e a linha sob o mouse realça a barra
      const barras = criarBarrasCampanhas({ h, linhas, fmtMoeda: N.brl0, fmtInt: N.int, nomePlat: L.nomePlat, aoEscolher: r => {
        const troca = painelCampanhas.alternar(r);
        if (troca.alterou) linhasDOM.find(x => String(x.r.c.id) === String(r.c.id))?.tr.querySelector(".ads-camp-comparar")?.focus({ preventScroll: true });
      } });
      for (const { r, tr } of linhasDOM) {
        tr.addEventListener("pointerenter", () => barras.realcar(r.c.id));
        tr.addEventListener("pointerleave", () => barras.realcar(null));
        tr.addEventListener("focusin", () => barras.realcar(r.c.id));
        tr.addEventListener("focusout", () => barras.realcar(null));
      }
      barras.destacar(S.comparacaoCamp);
      painelCampanhas = criarPainelCampanhas({ h, limpar: ui.limpar, linhas, estado: estadoCamp, periodo,
        moeda: N.brl0, moedaCent: N.brl, inteiro: N.int, decimal: n => N.dec(n, 1),
        aoFiltrar: f => { S.buscaCamp = f.busca; S.resultadoCamp = f.resultado; aplicarVisibilidade(f); },
        aoComparar: (_id, troca) => {
          S.comparacaoCamp = [...troca.ids];
          barras.destacar(S.comparacaoCamp);
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
        h("div", { class: "ads-cb-caixa" }, h("h3", { class: "rel-h2 ads-cb-h" }, `Investimento por campanha${linhas.length > 8 ? " · 8 maiores" : ""}`),
          h("p", { class: "rel-nota" }, "Toque numa barra para marcar a campanha na comparação; passe pela tabela para realçar a barra."), barras.elemento),
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
    // item 51: semáforo (vermelho/amarelo/verde) com frase para leigo, ação sugerida e filtro da lista;
    // sem nenhum número de anúncio não há o que avaliar: nível neutro (sem luz verde) e, para quem gere, o caminho para conectar
    const semDados = L.semAnuncios(M);
    const sem = L.semaforoRadar(R, { semDados });
    const statusTxt = semDados ? (sem.nivel === "neutro" ? null : "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar.")
      : u ? `Última leitura dos anúncios: ${L.quandoSP(u)} · ${qtd}.` : `${qtd}.`;
    const lista = h("ul", { class: "ads-alertas" });
    const ordenados = L.ordenarRadar(R);
    const pintarLista = filtro => {
      ui.limpar(lista);
      const itens = L.filtrarRadar(ordenados, filtro);
      itens.forEach((it, n) => lista.append(it.tipo === "conexao" ? alertaConexao(it, n) : alertaEpisodio(it, n)));
      if (!itens.length) lista.append(h("li", { class: "rel-vazio-txt" }, filtro === "resolvidos" ? "Nenhum alerta resolvido nos últimos 14 dias."
        : semDados ? "Nenhum alerta ainda: o radar vigia a partir da primeira leitura dos anúncios."
        : filtro === "ativos" ? "Nenhum alerta ativo agora. Tudo dentro dos limites." : "Nenhum alerta nos últimos 14 dias. Todas as campanhas dentro dos limites."));
    };
    const semaforo = criarSemaforoRadar({ h, semaforo: sem, icone: n => ui.icone(n), filtro: S.filtroRadar || "todos", aoFiltrar: f => { S.filtroRadar = f; pintarLista(f); },
      link: sem.nivel === "neutro" && eGestor(ctx) ? { rotulo: "Conectar em Ajustes de anúncios", href: "#/config/anuncios" } : null });
    if (statusTxt) semaforo.elemento.append(h("p", { class: "ads-radar-status rel-nota" }, h("span", { class: `ads-radar-luz${R.ativos ? " ativo" : ""}`, "aria-hidden": "true" }), statusTxt));
    corpo.append(semaforo.elemento);
    // do mais grave para o menos (L.ordenarRadar): o crítico ativo está sempre no topo; cada alerta leva barra lateral, ícone e rótulo da gravidade
    pintarLista(S.filtroRadar || "todos");
    const regras = h("ul", { class: "ads-regras" }, M.REGRAS.map(r => {
      const ex = L.explicarRegra(r.id);
      return h("li", {},
        h("div", {}, h("p", { class: "ads-regra-n" }, r.nome, " ", h("span", { class: `rel-chip rel-chip-${r.sev === "critico" ? "ruim" : r.sev === "alerta" ? "aten" : "info"}` }, L.SEV_NOME[r.sev])),
          h("p", { class: "ads-regra-simples" }, ex.oQue),
          h("details", { class: "ads-regra-det" }, h("summary", {}, "Como a regra funciona"), h("p", { class: "rel-nota" }, descreverRegra(r)), h("p", { class: "rel-nota" }, h("b", {}, "Por que importa: "), ex.porque), h("p", { class: "rel-nota" }, h("b", {}, "O que fazer: "), ex.acao))),
        h("span", { class: `rel-chip ${r.ativa ? "rel-chip-bom" : "rel-chip-neutro"}` }, r.ativa ? "ligada" : "desligada"));
    }));
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
        x.ativo ? h("p", { class: "ads-al-acao" }, h("span", { class: "rel-olho" }, "Em palavras simples "), L.explicarRegra("integracao").oQue, " ", L.explicarRegra("integracao").acao) : null,
        h("p", { class: "rel-nota" }, L.quandoSP(x.a.criado_em), x.envio ? envio(x.envio, " · aviso ") : null),
        x.ativo && eGestor(ctx) ? h("a", { class: "rel-link", href: "#/config/anuncios" }, "Resolver em Ajustes de anúncios") : null));
  }
  function alertaEpisodio({ ref: e, sev }, n) {
    const ex = L.explicarRegra(e.regra);
    return h("li", { class: `ads-al ads-al-${sev}${e.ativo ? "" : " resolvido"}`, dataset: { sev }, style: `--i:${n}` },
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-topo" }, marcaSev(sev), h("span", { class: `rel-chip ${e.ativo ? (sev === "critico" ? "rel-chip-ruim" : "rel-chip-aten") : "rel-chip-bom"}` }, e.ativo ? "ativo" : "resolvido")),
        h("p", { class: "ads-al-nome" }, e.nome),
        h("p", { class: "ads-al-msg" }, e.msg),
        e.ativo ? h("p", { class: "ads-al-acao" }, h("span", { class: "rel-olho" }, "O que fazer "), e.acao || ex.acao) : null,
        e.ativo ? h("p", { class: "ads-al-simples rel-nota" }, h("b", {}, "Em palavras simples: "), ex.oQue, " ", ex.porque) : null,
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
