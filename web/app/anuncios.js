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
// plano 1000 (AD-097): além dos últimos N dias, o mês do calendário («Este mês» até ontem e «Mês passado» inteiro)
const PERIODOS = [7, 30, 60, "mes", "mes_ant"];
const ROT_PERIODO = { 7: "7 dias", 30: "30 dias", 60: "60 dias", mes: "Este mês", mes_ant: "Mês passado" };
const PLATS = [["", "Tudo"], ["meta", "Meta"], ["google", "Google"]];
/** Período guardado ("30", "mes"…) → valor válido de PERIODOS. */
export const periodoValido = v => { const n = Number(v); return PERIODOS.includes(n) ? n : PERIODOS.includes(v) ? v : 30; };
/** Plano 1000 (AD-099): só as plataformas com números na janela carregada (quem só anuncia no Meta não vê «Google»). */
export function platsDisponiveis(M) {
  const tem = new Set(((M && M.LINHAS) || []).map(l => l.plat));
  return PLATS.filter(([v]) => !v || tem.has(v));
}
/** Plano 1000 (AD-098): o filtro de plataforma é guardado POR CLIENTE (antes uma chave global vazava «Google» para quem não tem). */
export const chavePlat = clienteId => `nx-app-ads-plat:${clienteId || "?"}`;
/** Plano 1000b · AB-072: o período do Anúncios também é POR CLIENTE (como em Relatórios, AD-141) — «Mês passado» no cliente A não abre
    no B. Sem período do cliente, vale a chave global antiga (preferência de antes desta versão). */
export const chaveDias = clienteId => `nx-app-ads-dias:${clienteId || "?"}`;
export const periodoGuardado = (ler, clienteId) => periodoValido(ler(chaveDias(clienteId), null) ?? ler("nx-app-ads-dias", 30));
/** Plano 1000b · AB-001/AB-227: a nota do balde «sem campanha identificada» só com as partes não zeradas e plural certo (antes
    «Inclui 0 conversas…» quando só havia agendamento ou fechamento no período). `int` formata o número (N.int). Sem nada → "". */
export function textoBalde(balde, int = String) {
  const b = balde || {};
  const partes = [[b.conversas, "conversa", "conversas"], [b.agendadas, "agendamento", "agendamentos"], [b.fecharam, "fechamento", "fechamentos"]]
    .filter(([n]) => (+n || 0) > 0).map(([n, um, varios]) => `${int(+n)} ${+n === 1 ? um : varios}`);
  if (!partes.length) return "";
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  const utms = Array.isArray(b.utms) && b.utms.length ? ` — campanha no link: ${b.utms.slice(0, 3).map(u => `«${u}»`).join(", ")}${b.utms.length > 3 ? ` e mais ${b.utms.length - 3}` : ""}` : "";
  return `Inclui ${lista} de anúncio sem campanha identificada (a métrica ainda não chegou ou o negócio foi marcado como anúncio à mão)${utms}.`;
}
/** Plano 1000b · AB-246: a fatia «Outras» da rosca Meta × Google (gasto total − Meta − Google), só quando há gasto ≥ 1 centavo. */
export function fatiaOutras(gastoTotal, gastoMetaGoogle, brl0 = String) {
  const v = Math.round(((+gastoTotal || 0) - (+gastoMetaGoogle || 0)) * 100) / 100;
  return v >= 0.01 ? { rotulo: "Outras", valor: v, extra: `${brl0(v)} em outras plataformas` } : null;
}
/** Plano 1000b · AB-075: as colunas e linhas do CSV dos criativos de uma campanha (a gaveta era o único bloco sem exportação).
    Números crus (o Excel formata); conversões do Google podem ser fracionadas. */
export function csvCriativos(lista = []) {
  const n2 = v => (Number.isFinite(+v) && v !== null ? Math.round(+v * 100) / 100 : "");
  return { colunas: ["Criativo", "Plataforma", "Investido", "Impressões", "CTR %", "Frequência", "Conversões", "Custo por conversão"],
    linhas: (lista || []).map(({ k, t }) => [k && k.nome || "", k && k.plat || "", n2(t.gasto), +t.impressoes || 0, n2(t.ctr), n2(t.freq), n2(t.conversoes), n2(t.cpa)]) };
}
/** Plano 1000b · AB-030: o nível do ponto de cor do CPA em texto (leitor de tela e quem não distingue cor). */
export const TEXTO_NIVEL_CPA = Object.freeze({ bom: "custo dentro da meta", aten: "custo perto do limite", ruim: "custo acima da meta", neutro: "sem meta de custo" });
/** Plano 1000b · AB-214: o que o leitor de tela ouve depois de ordenar a tabela de campanhas. */
export function textoOrdemCampanhas(rotulo, chave, dir) {
  const r = String(rotulo || "").replace(/^CPA Ads$/, "CPA");
  return chave === "nome" ? `Ordenado por campanha, ${dir < 0 ? "de Z a A" : "de A a Z"}.` : `Ordenado por ${r}, ${dir < 0 ? "do maior para o menor" : "do menor para o maior"}.`;
}
/** Plano 1000b · AB-195: a contagem do radar coerente com o selo da aba — «1 pede ação · 3 informativos» (antes «4 alertas ativos»
    com selo «1»). */
export function textoAtivosRadar(R) {
  const total = +(R && R.ativos) || 0, acao = Math.min(total, +(R && R.selo && R.selo.n) || 0), info = total - acao;
  if (!total) return "nenhum alerta ativo";
  const partes = [];
  if (acao) partes.push(`${acao} ${acao === 1 ? "pede ação" : "pedem ação"}`);
  if (info) partes.push(`${info} ${info === 1 ? "informativo" : "informativos"}`);
  return partes.join(" · ");
}
/** Plano 1000b · AB-059: «Exportar campanhas (CSV)» da paleta exporta o MESMO recorte da tela (busca + resultado no CRM). */
export function campanhasDaTela(linhas, { busca = "", resultado = "todos" } = {}) {
  const lista = filtrarCampanhas(linhas || [], { busca, resultado });
  const n = lista.length, total = (linhas || []).length;
  return { lista, aviso: n === total ? `${n} ${n === 1 ? "campanha exportada" : "campanhas exportadas"}.` : `${n} de ${total} campanhas exportadas (o filtro da tela vale aqui também).` };
}
/** Plano 1000b · AB-051: o servidor só reenvia o relatório MAIS RECENTE de cada tipo (nx-relatorio {tipo, forcar} não escolhe a data):
    «Enviar de novo» só para gestor, só com erro/parcial e só no diário de ontem (`ultimoDiario`) ou no último mês fechado (`ultimoMes`). */
export function podeReenviarRelatorio(it, { gestor = false, ultimoDiario = "", ultimoMes = "" } = {}) {
  if (!gestor || !it || it.previa || !it.envio || !["erro", "parcial"].includes(it.envio.k)) return false;
  return it.tipo === "mensal" ? !!ultimoMes && it.ref === ultimoMes : !!ultimoDiario && it.ref === ultimoDiario;
}
/** Plano 1000b · AB-188: assinatura barata do nx_dados (hoje + tamanhos das listas + a última leitura de cada plataforma) — a resposta
    da rede igual à que o cache do shell já pintou não redesenha a tela (os gráficos não animam de novo e o foco não cai no body). */
export function assinaturaDados(d) {
  if (!d || typeof d !== "object") return "";
  const n = k => (Array.isArray(d[k]) ? d[k].length : -1);
  const syncs = (Array.isArray(d.integracoes) ? d.integracoes : []).map(i => `${(i && i.canal) || ""}:${(i && i.ultimo_sync) || ""}:${(i && i.status) || ""}`).sort().join(",");
  return JSON.stringify([d.hoje || "", n("metricas"), n("leads"), n("alertas"), n("relatorios"), syncs, JSON.stringify((d.cliente && d.cliente.cfg) || {}).length]);
}
/** Plano 1000b · AB-188: um seletor para achar de novo o controle focado depois do redesenho (id, data-ord, data-chave, aria-label). */
export function seletorFoco(el) {
  if (!el || el.nodeType !== 1 || typeof el.getAttribute !== "function") return null;
  const esc = s => String(s).replace(/["\\]/g, "\\$&");
  const id = el.getAttribute("id"); if (id) return `#${id}`;
  for (const a of ["data-ord", "data-chave", "data-filtro", "data-valor", "aria-label"]) { const v = el.getAttribute(a); if (v) return `${String(el.tagName || "").toLowerCase()}[${a}="${esc(v)}"]`; }
  return null;
}
/** Plano 1000b · AB-032: `el` está dentro de `caixa` (anda pelos pais; funciona sem Node.contains). */
export function dentroDe(caixa, el) { for (let n = el, k = 0; n && k < 200; n = n.parentNode, k++) if (n === caixa) return true; return false; }
/** Plano 1000b · AB-032: o painel da pílula fecha ao tocar fora da caixa (pointerdown no documento) e quando o foco sai dela.
    Devolve a função que solta o ouvinte do documento. */
export function ligarFecharFora({ caixa, aberto, fechar, doc = globalThis.document }) {
  const fora = e => { if (aberto() && !dentroDe(caixa, e && e.target)) fechar(); };
  caixa.addEventListener("focusout", e => { if (aberto() && e && e.relatedTarget && !dentroDe(caixa, e.relatedTarget)) fechar(); });
  if (doc && typeof doc.addEventListener === "function") doc.addEventListener("pointerdown", fora, true);
  return () => { try { doc.removeEventListener("pointerdown", fora, true); } catch { /* ok */ } };
}
/** Plano 1000b · AB-049: «Copiar texto» — ui.copiar quando existe; senão a área de transferência do navegador; sem nenhum dos dois,
    `aoFalhar` (a tela seleciona o texto da bolha). → "ui" | "clipboard" | false. */
export async function copiarTexto(texto, { ui = null, nav = globalThis.navigator, aviso = "Texto copiado.", aoFalhar = () => {} } = {}) {
  if (ui && typeof ui.copiar === "function") { await ui.copiar(texto, { aviso }); return "ui"; }
  try {
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
      await nav.clipboard.writeText(texto);
      if (ui && typeof ui.toast === "function") ui.toast(aviso, { tipo: "ok" });
      return "clipboard";
    }
  } catch { /* sem permissão: cai na seleção */ }
  aoFalhar();
  return false;
}
/** Plano 1000b · AB-052: sem WhatsApp da gestão o diário nunca sai — a aba Relatórios diz isso (antes só «ainda não enviado»). */
export function notaSemDestino(cfg) {
  const dest = [].concat((cfg && cfg.waGestor) || []).filter(Boolean);
  return dest.length ? "" : "Sem WhatsApp de destino: o diário não é enviado. Cadastre o número da gestão em Ajustes de anúncios.";
}
/** Plano 1000b · AB-177: o que o leitor de tela ouve depois de filtrar a lista do Radar. */
export function textoFiltroRadar(n, filtro = "todos") {
  const q = +n || 0, um = q === 1;
  if (filtro === "ativos") return q ? `${q} ${um ? "alerta ativo" : "alertas ativos"}.` : "Nenhum alerta ativo.";
  if (filtro === "resolvidos") return q ? `${q} ${um ? "alerta resolvido" : "alertas resolvidos"}.` : "Nenhum alerta resolvido.";
  return q ? `${q} ${um ? "alerta" : "alertas"} nos últimos 14 dias.` : "Nenhum alerta nos últimos 14 dias.";
}
/** Plano 1000b · AB-262: a faixa da Visão geral quando há crítico ativo no Radar ("" sem crítico). */
export const textoFaixaCritico = n => (+n > 0 ? `${+n} ${+n === 1 ? "alerta crítico" : "alertas críticos"} no Radar` : "");
/** Plano 1000b · AB-076: a última leitura dos anúncios pelo MAIOR instante (antes ordenava o texto: «…Z» × «…-03:00» saía fora de ordem). */
export function ultimaLeitura(integracoes = []) {
  let melhor = null, t0 = -Infinity;
  for (const i of integracoes || []) { const t = Date.parse(i && i.ultimo_sync); if (Number.isFinite(t) && t > t0) { t0 = t; melhor = i.ultimo_sync; } }
  return melhor;
}
/** Plano 1000 (AD-260): a ordenação da tabela de campanhas, por cliente (antes voltava para «investimento» a cada abertura). */
export const chaveOrdem = clienteId => `nx-app-ads-ordem:${clienteId || "?"}`;
const COLS_ORDEM = ["nome", "gasto", "conv", "cpa", "ctr", "ag", "fe", "rec", "roas"];
export function lerOrdem(bruto) {
  try { const o = JSON.parse(bruto || "null"); if (o && COLS_ORDEM.includes(o.chave) && (o.dir === 1 || o.dir === -1)) return { chave: o.chave, dir: o.dir }; } catch { /* guardado estragado */ }
  return { chave: "gasto", dir: -1 };
}
/** Plano 1000 (AD-046): o cfg.silenciados novo depois de silenciar (`periodo` = {desde, ate}) ou reativar (`periodo` = null) `chave` —
    entradas já vencidas (ate < hojeIso) e formatos estranhos saem; o servidor MESCLA o cfg, então o mapa vai inteiro. */
export function mapaSilenciados(atual, chave, periodo, hojeIso) {
  const out = {}, iso = /^\d{4}-\d{2}-\d{2}$/;
  for (const [k, v] of Object.entries(atual && typeof atual === "object" ? atual : {})) {
    const ate = typeof v === "string" ? v : v && v.ate;
    if (k === chave || typeof ate !== "string" || !iso.test(ate) || ate < hojeIso) continue;
    out[k] = typeof v === "object" && iso.test(String(v.desde || "")) ? { desde: v.desde, ate } : { ate };
  }
  if (periodo && chave) out[chave] = { desde: periodo.desde, ate: periodo.ate };
  return out;
}
/** Plano 1000b · AB-038: a taxa da trilha do funil. Acima de 100% (agendaram mais que conversaram, eventos em datas diferentes) diz isso
    em vez de cortar em «100%» (a mesma regra do funil por plataforma, L.taxaFunilTxt). */
export function textoTaxaTrilha(taxa, rotulo, pc = v => `${Math.round(v)}%`, taxaFunilTxt = null) {
  if (taxa == null || !Number.isFinite(+taxa)) return "";
  if (+taxa > 100) return typeof taxaFunilTxt === "function" ? taxaFunilTxt(+taxa, pc).txt : `${pc(+taxa)} · mais que a etapa anterior contou`;
  return `${pc(+taxa)} ${rotulo}`;
}
/** Plano 1000b · AB-039: o resumo do gráfico de tendência com plural certo («1 conversa e 1 agendamento»). */
export function resumoTendencia(periodoTexto, tot, { brl0 = v => `R$ ${v}`, int = v => String(v) } = {}) {
  const q = (n, um, varios) => `${int(n)} ${+n === 1 ? um : varios}`;
  return `${periodoTexto}. Tendência: ${brl0(tot.g)} investidos, ${q(tot.c, "conversa", "conversas")} e ${q(tot.ag, "agendamento", "agendamentos")} registrados no CRM`;
}
/** Plano 1000b · AB-071: a ordem do ranking de criativos é guardada por cliente (como a ordem da tabela e a plataforma). */
export const chaveRank = clienteId => `nx-app-ads-rank:${clienteId || ""}`;
/** Plano 1000b · AB-225: o orçamento diário que fecha o mês no orçamento — (orçamento − gasto) ÷ dias que restam. null sem dias ou sem saldo. */
export function diarioSugerido(orc, gasto, restam) {
  if (!(+restam > 0) || !(+orc > 0)) return null;
  const saldo = +orc - (+gasto || 0);
  return saldo > 0 ? saldo / +restam : 0;
}
/** Plano 1000b · AB-050: o WhatsApp corta mensagens acima de 4.096 caracteres. */
export const LIMITE_WA = 4096;
export function notaLimiteWa(texto, int = v => String(v)) {
  const n = String(texto || "").length;
  return n > LIMITE_WA ? `Este relatório passa do limite do WhatsApp (${int(n)} caracteres; o limite é ${int(LIMITE_WA)}) e será cortado no envio.` : "";
}
/** Plano 1000b · AB-219: os dias que o seletor de prévia do diário oferece — ontem (M.R) e os 13 anteriores. */
export function diasPreviaDiario(R, n = 14) {
  const out = [];
  for (let i = R; i > R - n && i >= 0; i--) out.push(i);
  return out;
}
/** Plano 1000b · AB-248: para quem iria cada relatório — diário: WhatsApp da gestão; mensal: cliente + gestão (sem repetir o número). */
export function destinosRelatorio(tipo, cfg = {}) {
  const d = v => String(v || "").replace(/\D/g, "");
  const chave = v => { const x = d(v); return (x.length === 12 || x.length === 13) && x.startsWith("55") ? x.slice(2) : x; };
  const brutos = tipo === "mensal" ? [...[].concat(cfg.waCliente || []), ...[].concat(cfg.waGestor || [])] : [].concat(cfg.waGestor || []);
  const vistos = new Map();
  for (const n of brutos) { const k = chave(n); if (k.length >= 10 && !vistos.has(k)) vistos.set(k, k); }
  const fmt = x => (x.length === 11 ? `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}` : x.length === 10 ? `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}` : x);
  return [...vistos.values()].map(fmt);
}
/** Plano 1000b · AB-197: a legenda dos tiques com os 5 estados (antes faltavam ✓! e ◷). */
export const LEGENDA_TIQUES = "✓ a API aceitou · ✓✓ chegou no celular · ✓! saiu para parte dos números · ◷ gerado, ainda não enviado · ! não saiu. Quando o relatório de um dia ainda não foi enviado, aparece a prévia calculada agora.";
/** Plano 1000b · AB-222: o id do item de uma regra na lista «Regras do radar». */
export const idRegra = id => `ads-regra-${String(id || "").replace(/[^a-z0-9_-]/gi, "")}`;
/** Plano 1000b · AB-033: os itens do ⋮ do celular — «Imprimir» para todos; Ajustes e Painel só para quem gere. */
export function itensMaisAcoes({ gestor = false, imprimir = () => {}, ajustes = () => {}, painel = () => {} } = {}) {
  return [
    { rotulo: "Imprimir ou salvar PDF", icone: "modelo", fn: imprimir },
    gestor ? { rotulo: "Ajustes de anúncios", icone: "engrenagem", fn: ajustes } : null,
    gestor ? { rotulo: "Painel de apresentação", icone: "externo", fn: painel } : null,
  ].filter(Boolean);
}
/** Plano 1000 (AD-137): «Painel de apresentação» — o endereço configurado do cliente (cfg.painelUrl, só https) ou o painel padrão. */
export const enderecoPainel = (cfg, urlPainel) => (typeof urlPainel === "function" && urlPainel(cfg)) || URL_PAINEL;
/** Plano 1000 (AD-133): o Ajustes de anúncios avisa que salvou (metas, regras) — o Anúncios joga fora o cache daquele cliente. */
export const EVENTO_CFG_ADS = "orbita:ads-cfg-salva";
export function invalidarCacheAds(clienteId) { return cache.delete(clienteId); }
export const cacheAds = () => cache;
try {
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener(EVENTO_CFG_ADS, e => { invalidarCacheAds(e && e.detail && e.detail.clienteId); });
} catch { /* fora do navegador */ }
/** Plano 1000 (AD-232): os comandos que o Anúncios oferece à paleta (Ctrl+K). */
export function comandosAnuncios({ irRadar, exportarCampanhas, irCampanhas } = {}) {
  return [
    irRadar ? { id: "anuncios.radar", rotulo: "Ir para o Radar dos anúncios", palavras: "radar alertas anuncios campanhas avisos", icone: "alerta", fazer: irRadar } : null,
    irCampanhas ? { id: "anuncios.campanhas", rotulo: "Ver campanhas dos anúncios", palavras: "campanhas tabela anuncios investimento", icone: "grafico", fazer: irCampanhas } : null,
    exportarCampanhas ? { id: "anuncios.exportar", rotulo: "Exportar campanhas (CSV)", palavras: "exportar baixar csv excel planilha campanhas", icone: "baixar", fazer: exportarCampanhas } : null,
  ].filter(Boolean);
}
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
let graficos = [], tPilula = 0, montagem = 0, soltarAparelho = null, cancelarComandos = [];
let soltarFora = null;   // plano 1000b · AB-032: o ouvinte de «tocar fora» da pílula (no documento) sai ao desmontar
// plano 1000b · AB-063: um único ouvinte de visibilitychange (registrado uma vez) chama a repintura da pílula da montagem atual
let repintarPilula = null, ouvindoVisibilidade = false;
export function aoVoltarParaAba() { try { if (typeof repintarPilula === "function") repintarPilula(); } catch { /* a pílula é um extra */ } }
function ouvirVisibilidade() {
  if (ouvindoVisibilidade || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  ouvindoVisibilidade = true;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aoVoltarParaAba(); });
}
function soltarComandos() { for (const c of cancelarComandos) { try { c(); } catch { /* ok */ } } cancelarComandos = []; }

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
export function descricaoPeriodoAds(P, dataBR, nomePlat, { fusos = [] } = {}) {
  const canal = P?.plat ? nomePlat(P.plat) : "todas as plataformas";
  const titulo = P?.rotulo?.titulo || `Últimos ${P?.dias || 0} dias`;
  // plano 1000 (AD-080): conta de anúncios em outro fuso — os dias ficam deslocados; o selo fica na descrição do período, sempre
  const fuso = (fusos || []).filter(x => !P?.plat || x.canal === P.plat).map(x => `${nomePlat(x.canal)} no fuso ${x.fuso}: dias deslocados em algumas horas`).join(" · ");
  return `${titulo} (${dataBR(P.de)} a ${dataBR(P.ate)}) · ${canal} · ${P?.periodo === "mes_ant" ? "mês fechado" : "dados fechados até ontem"}${fuso ? ` · ${fuso}` : ""}`;
}

/** O orçamento acompanha o mês-calendário até ontem; projeção é linear, não parte dos últimos N dias. */
export function descricaoOrcamentoMensal(m, _dataBR, brl0) {
  const fmt = dia => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(Date.UTC(m.ano, m.mes, dia)));
  if (m.cedo) return `${fmt(1)} a ${fmt(m.pass)} · mês até ontem · todas as plataformas · ${brl0(m.gasto)} acumulados; a projeção começa no 5º dia do mês`;
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
export function csvCampanhas(rows, { periodo, csv, moeda, inteiro, decimal, nomePlat = p => (p === "meta" ? "Meta" : p === "google" ? "Google" : p ? "Anúncio" : "") }) {
  // plano 1000 (AD-102): receita informada e estimada em colunas separadas (a soma continua em «Receita CRM»)
  const colunas = ["Período", "Campanha", "Plataforma", "Investimento Ads", "Conversões da plataforma", "CPA da plataforma",
    "Conversas CRM", "Agendamentos CRM", "Fechamentos CRM", "Receita CRM", "Receita informada", "Receita estimada", "ROAS (receita CRM ÷ investimento Ads)"];
  // números crus (L.csv troca o ponto por vírgula e deixa vazio o que não é finito): no Excel a coluna soma, «R$ 359» em texto não
  const num = (v, casas) => (Number.isFinite(v) ? Math.round(v * 10 ** casas) / 10 ** casas : "");
  // AD-101: o Google manda conversão fracionada (1,5) — 2 casas, nunca arredondada para 2
  // AD-104: a plataforma com o nome legível («Meta», «Google»), não o código cru
  const linhas = rows.map(r => [periodo, r.c.nome, nomePlat(r.c.plat), num(r.t.gasto, 2), num(r.t.conversoes, 2), num(r.t.cpa, 2),
    num(r.k.conversas, 0), num(r.k.agendadas, 0), num(r.k.fecharam, 0), num(r.k.receita, 2),
    num(r.k.receitaReal ?? (r.k.receita - (r.k.receitaEstimada || 0)), 2), num(r.k.receitaEstimada || 0, 2), num(r.roas, 1)]);
  void moeda; void inteiro; void decimal;
  return csv(colunas, linhas);
}

export const ESPERA_BUSCA_MS = 200;
/** Plano 1000 (AD-126): estados de acesso do Anúncios (códigos do Órbita) → {titulo, texto}; outro código → null (erroCartao). */
export function estadoAcessoAds(codigo) {
  const E = {
    modulo_desligado: { titulo: "Os anúncios não fazem parte do seu plano", texto: "Esta empresa não tem o módulo de anúncios ligado. Para ligar, fale com o suporte." },
    teste_expirado: { titulo: "O período de teste terminou", texto: "Para continuar acompanhando os anúncios, fale com o suporte." },
    sem_permissao: { titulo: "Seu acesso não inclui os anúncios", texto: "Peça ao administrador da empresa para liberar a área de anúncios para a sua conta." },
    conta_suspensa: { titulo: "Acesso suspenso", texto: "O acesso desta empresa está suspenso. Fale com o suporte para reativar." },
  };
  return E[codigo] || null;
}
/** Plano 1000 (AD-132): «Nossa equipe já foi avisada» só quando um aviso de conexão desta plataforma SAIU (enviado_em) nas últimas 24 h. */
export function equipeAvisada(alertas = [], erros = [], agora = Date.now()) {
  const canais = new Set((erros || []).map(e => e && e.canal));
  return (alertas || []).some(a => a && a.regra === "integracao" && (a.enviado_em || a.entregue_em) && agora - Date.parse(a.criado_em) <= 24 * 36e5
    && [...canais].some(c => new RegExp(`\\b${c}\\b`, "i").test(`${a.chave || ""} ${a.mensagem || ""}`)));
}
/** Componente puro da área de filtros/comparação: a tela real e o teste dirigem os mesmos eventos. */
export function criarPainelCampanhas({ h, limpar, linhas = [], estado = {}, periodo = "", moeda = String, moedaCent = moeda,
  inteiro = String, decimal = String, conv = null, aoFiltrar = () => {}, aoComparar = () => {}, aoLimpar = () => {},
  aoExportar = () => {}, aoAviso = () => {}, aoFocoComparar = () => {} }) {
  if (typeof h !== "function") throw new TypeError("criarPainelCampanhas exige o criador de elementos h");
  // plano 1000b · AB-004: conversões da plataforma com fração (1,5 do Google não vira 2) — `conv` da tela ou inteiro/1 casa
  const fmtConv = typeof conv === "function" ? conv : v => (Number.isFinite(+v) && v !== null && !Number.isInteger(+v) ? decimal(+v) : inteiro(v));
  // plano 1000b · AB-215: sem resultado, o status sugere o que fazer
  const textoStatus = n => (n ? `${n} de ${linhas.length} campanhas · ${periodo}` : "Nenhuma campanha corresponde aos filtros — limpe a busca ou troque o filtro.");
  const raiz = h("section", { class: "ads-painel-camp", "aria-label": "Filtros e comparação de campanhas" });
  const st = { busca: String(estado.busca || ""), resultado: ["todos", "com_crm", "sem_crm"].includes(estado.resultado) ? estado.resultado : "todos",
    comparacao: Array.isArray(estado.comparacao) ? [...estado.comparacao].slice(0, 3) : [] };
  let visiveis = [], tBusca = 0;
  // plano 1000b · AB-207: o nome de cada campanha marcada (para avisar quem saiu da comparação ao trocar o período)
  const nomesComp = (estado.nomesComparacao && typeof estado.nomesComparacao === "object") ? estado.nomesComparacao : (estado.nomesComparacao = {});
  for (const r of linhas) if (r && r.c && st.comparacao.some(id => String(id) === String(r.c.id))) nomesComp[r.c.id] = r.c.nome;
  // plano 1000b · AB-031: os botões «Comparar» das linhas são de alternar — aria-pressed acompanha a comparação (o rótulo fica o mesmo,
  // como manda o padrão de botão de alternar; a dica do mouse diz o que o próximo toque faz)
  const botoes = new Set();
  const pintarBotoes = () => {
    for (const b of botoes) {
      const id = b.dataset ? b.dataset.camp : null, nome = b.dataset ? b.dataset.nome : "";
      const marcada = st.comparacao.some(x => String(x) === String(id));
      b.setAttribute("aria-pressed", String(marcada));
      b.setAttribute("title", marcada ? `Tirar ${nome || "a campanha"} da comparação` : `Comparar ${nome || "a campanha"}`);
    }
  };

  function render() {
    clearTimeout(tBusca);                         // plano 1000b · AB-057: a busca pendente não roda sobre um desenho antigo
    visiveis = filtrarCampanhas(linhas, st);
    const busca = h("input", { type: "search", class: "ads-camp-busca-input", value: st.busca, autocomplete: "off",
      placeholder: "Ex.: implante…", "aria-label": "Buscar campanha por nome" });
    const filtro = h("select", { class: "ads-camp-resultado", "aria-label": "Filtrar campanhas pela atividade no CRM" },
      h("option", { value: "todos" }, "Todas as campanhas"),
      h("option", { value: "com_crm" }, "Com atividade no CRM"),
      h("option", { value: "sem_crm" }, "Sem atividade no CRM"));
    filtro.value = st.resultado;
    const status = h("p", { class: "rel-nota ads-camp-resumo", role: "status", "aria-live": "polite" }, textoStatus(visiveis.length));
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
    // plano 1000 (AD-105): a busca filtra ao digitar (200 ms depois da última tecla), sem redesenhar o campo — o foco e o cursor ficam
    busca.addEventListener("input", () => {
      clearTimeout(tBusca);
      tBusca = setTimeout(() => {
        st.busca = busca.value; estado.busca = st.busca;
        visiveis = filtrarCampanhas(linhas, st);
        status.textContent = textoStatus(visiveis.length);
        exportar.disabled = !visiveis.length;
        aoFiltrar({ busca: st.busca, resultado: st.resultado });
      }, ESPERA_BUSCA_MS);
    });
    // AB-215: Esc no campo sem resultado leva o foco a «Limpar filtros»
    busca.addEventListener("keydown", e => {
      if (e.key !== "Escape" || filtrarCampanhas(linhas, { busca: busca.value, resultado: st.resultado }).length) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      limparBtn.focus();
    });
    // plano 1000b · AB-058: o filtro «resultado no CRM» aplica ao trocar (antes só com «Aplicar filtros»); o foco volta ao seletor novo
    filtro.addEventListener("change", () => {
      clearTimeout(tBusca);
      st.busca = busca.value; st.resultado = ["todos", "com_crm", "sem_crm"].includes(filtro.value) ? filtro.value : "todos";
      estado.busca = st.busca; estado.resultado = st.resultado;
      aoFiltrar({ busca: st.busca, resultado: st.resultado }); render(); refocar(".ads-camp-resultado");
    });

    const selecionadas = st.comparacao.map(id => linhas.find(r => String(r?.c?.id) === String(id))).filter(Boolean).slice(0, 3);
    // plano 1000b · AB-207: campanha marcada sem investimento no período novo sai da comparação — com aviso (antes em silêncio)
    const sairam = st.comparacao.filter(id => !selecionadas.some(r => String(r.c.id) === String(id)));
    if (sairam.length) {
      const nomes = sairam.map(id => nomesComp[id]).filter(Boolean);
      aoAviso(nomes.length ? `${nomes.map(n => `«${n}»`).join(", ")} ${sairam.length === 1 ? "saiu" : "saíram"} da comparação: sem investimento neste período.`
        : `${sairam.length === 1 ? "Uma campanha saiu" : `${sairam.length} campanhas saíram`} da comparação: sem investimento neste período.`);
      for (const id of sairam) delete nomesComp[id];
    }
    st.comparacao = selecionadas.map(r => r.c.id); estado.comparacao = [...st.comparacao];
    const medidas = [
      ["Investimento Ads", r => moeda(r.t.gasto)], ["Conversões da plataforma", r => fmtConv(r.t.conversoes)],   // AB-004
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
    pintarBotoes();
    return raiz;
  }

  function alternar(linha) {
    const troca = alternarComparacaoCampanhas(st.comparacao, linha?.c?.id);
    if (!troca.alterou) { aoAviso("Compare até três campanhas por vez."); return troca; }
    st.comparacao = troca.ids; estado.comparacao = [...st.comparacao];
    if (linha && linha.c) nomesComp[linha.c.id] = linha.c.nome;
    aoComparar(linha?.c?.id, troca); render(); return troca;
  }
  render();
  return { elemento: raiz, get linhas() { return [...visiveis]; }, alternar,
    botaoComparar: linha => {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { camp: String(linha?.c?.id ?? ""), nome: linha?.c?.nome || "" },
        "aria-label": `Comparar campanha ${linha?.c?.nome || ""}`, "aria-pressed": "false", on: { click: () => alternar(linha) } }, `Comparar ${linha?.c?.nome || "campanha"}`);
      botoes.add(b); pintarBotoes();
      return b;
    },
    destruir() { clearTimeout(tBusca); botoes.clear(); },   // AB-057: a tela chama ao sair
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
    // plano 1000 (AD-120): SVG dentro de <img> não carrega @font-face — a fonte do tema ganha a fonte do sistema como reserva declarada
    const valorEstilo = (p, v) => (p === "font-family" && v ? `${v}, ${FONTE_SISTEMA}` : v || "none");
    const estilo = cs ? props.map(p => { const v = cs.getPropertyValue ? cs.getPropertyValue(p) : cs[p]; return v && v !== "none" || (p === "fill" || p === "stroke") ? `${p}:${valorEstilo(p, v)}` : ""; }).filter(Boolean).join(";") : "";
    const filhos = [...(no.childNodes || [])].map(andar).join("");
    const extra = tag === "svg" && fundo ? `<rect width="100%" height="100%" fill="${escXml(fundo)}"/>` : "";
    return `<${tag}${tag === "svg" ? ` xmlns="${NS_SVG}"` : ""}${attrs}${estilo ? ` style="${escXml(estilo)}"` : ""}>${extra}${filhos}</${tag}>`;
  };
  return andar(el);
}
const FONTE_SISTEMA = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Plano 1000 (AD-121): entrega um arquivo gerado na tela. No app instalado (PWA, sobretudo no iPhone) o <a download> num blob não baixa:
    lá usa a folha de compartilhar do sistema (navigator.share com o arquivo) quando existe; senão, o download de sempre.
    Devolve "compartilhado" | "cancelado" | "baixado" | false. */
export async function baixarArquivo(blob, nome, { nav = globalThis.navigator, doc = globalThis.document, standalone = null } = {}) {
  const instalado = standalone != null ? !!standalone
    : !!(nav && nav.standalone) || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  if (instalado && nav && typeof nav.share === "function" && typeof File === "function") {
    try {
      const arq = new File([blob], nome, { type: blob.type || "application/octet-stream" });
      if (typeof nav.canShare !== "function" || nav.canShare({ files: [arq] })) { await nav.share({ files: [arq], title: nome }); return "compartilhado"; }
    } catch (e) { if (e && e.name === "AbortError") return "cancelado"; /* sem permissão de compartilhar: cai no download */ }
  }
  if (!doc || !doc.body) return false;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a"); a.href = url; a.download = nome;
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "baixado";
}
/** Baixa o SVG de um gráfico como PNG (canvas em 2×). Devolve true se conseguiu; false quando o navegador não deixa (o chamador avisa).
    Plano 1000 (AD-120): `cabecalho` (linhas de L.cabecalhoPng) entra em cima da imagem — título, cliente e período, na fonte do sistema. */
export async function exportarSvgPng(svg, nome, { L, escala = 2, cabecalho = [] } = {}) {
  if (!svg || typeof document === "undefined") return false;
  try {
    // fundo do cartão (token do tema); sem ele, o fundo da página — nunca uma cor escrita aqui
    const raizCs = getComputedStyle(document.documentElement);
    const fundo = raizCs.getPropertyValue("--c-sup").trim() || getComputedStyle(document.body).backgroundColor || "white";
    const corTexto = raizCs.getPropertyValue("--c-texto").trim() || getComputedStyle(document.body).color || "black";
    const corTexto2 = raizCs.getPropertyValue("--c-texto-2").trim() || corTexto;
    const texto = svgParaTexto(svg, el => getComputedStyle(el), (L && L.ESTILOS_SVG_EXPORT) || ["fill", "stroke", "stroke-width", "font-family", "font-size", "opacity"], { fundo });
    const r = svg.getBoundingClientRect(), W = Math.max(1, Math.round(r.width || +svg.getAttribute("width") || 640)), H = Math.max(1, Math.round(r.height || +svg.getAttribute("height") || 280));
    const img = new Image();
    await new Promise((ok, erro) => { img.onload = ok; img.onerror = () => erro(new Error("svg")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`; });
    const linhas = (cabecalho || []).filter(Boolean).slice(0, 2), topo = linhas.length ? 16 + linhas.length * 22 : 0;
    const canvas = document.createElement("canvas");
    canvas.width = W * escala; canvas.height = (H + topo) * escala;
    const ctx2d = canvas.getContext("2d");
    ctx2d.fillStyle = fundo; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    linhas.forEach((t, k) => {
      ctx2d.fillStyle = k ? corTexto2 : corTexto;
      ctx2d.font = `${k ? 400 : 600} ${(k ? 13 : 16) * escala}px ${FONTE_SISTEMA}`;
      // plano 1000b · AB-067: mede e encurta com «…» até caber em W − 24 px (antes slice(0,120) cortava no meio da letra a 360 px)
      ctx2d.fillText(encurtarParaLargura(String(t).slice(0, 120), (W - 24) * escala, s => ctx2d.measureText(s).width), 12 * escala, (8 + 18 + k * 22) * escala);
    });
    ctx2d.drawImage(img, 0, topo * escala, W * escala, H * escala);
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/png"));
    if (!blob) return false;
    return !!(await baixarArquivo(blob, nome || "grafico.png"));
  } catch { return false; }
}
/** Plano 1000b · AB-067: o texto inteiro se couber em `max` (medido por `medir`); senão o maior começo, em palavra inteira quando
    der, terminado em «…». Puro: o canvas entra como `medir`. */
export function encurtarParaLargura(texto, max, medir) {
  const s = String(texto ?? "");
  if (!(max > 0) || typeof medir !== "function" || medir(s) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (medir(`${s.slice(0, m).trimEnd()}…`) <= max) lo = m; else hi = m - 1; }
  let corte = s.slice(0, lo);
  const esp = corte.lastIndexOf(" ");
  if (esp > lo * 0.6) corte = corte.slice(0, esp);
  return `${corte.trimEnd()}…`;
}
/** Botão «PNG» do rodapé de um gráfico: acha o SVG dentro de `alvo` na hora do clique (o gráfico redesenha ao redimensionar).
    `titulo` entra no rótulo («Baixar “Tendência” em PNG»): com dois gráficos na tela, o leitor de tela sabe qual é qual.
    `cabecalho()` (AD-120) devolve as linhas que vão em cima da imagem. */
export function botaoPng({ h, alvo, nome, L, titulo = "", cabecalho = null, aoFalhar = () => {}, aoPronto = () => {} }) {
  const b = h("button", { type: "button", class: "g-ver-tabela relat-csv rel-png", title: "Baixar este gráfico como imagem (PNG)", "aria-label": titulo ? `Baixar «${titulo}» em PNG` : "Baixar gráfico em PNG" }, "PNG");
  b.addEventListener("click", async () => {
    const svg = alvo && typeof alvo.querySelector === "function" ? alvo.querySelector("svg") : null;
    if (!svg) { aoFalhar("Este bloco não tem gráfico para exportar."); return; }
    // plano 1000b · AB-068: enquanto gera (1–2 s) o botão diz «Gerando…» e fica aria-busy; ao baixar, um aviso curto
    b.disabled = true; b.setAttribute("aria-busy", "true"); b.textContent = "Gerando…";
    let ok = false;
    try { ok = await exportarSvgPng(svg, typeof nome === "function" ? nome() : nome, { L, cabecalho: typeof cabecalho === "function" ? cabecalho() : cabecalho || [] }); }
    finally { b.disabled = false; b.removeAttribute("aria-busy"); b.textContent = "PNG"; }
    if (!ok) aoFalhar("Não foi possível gerar a imagem agora. Use «Ver como tabela» e copie os números.");
    else aoPronto("Imagem pronta.");
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
  // plano 1000b · AB-025: a dica é só visual (sem aria-live: o pointermove despejava dezenas de anúncios); o leitor de tela ouve um
  // status sr-only separado, que só recebe o texto quando a mudança vem do teclado
  const dica = document.createElement("div"); dica.className = "g-dica"; dica.setAttribute("aria-hidden", "true"); dica.hidden = true;
  const vivo = document.createElement("p"); vivo.className = "sr-only g-td-vivo"; vivo.setAttribute("role", "status"); vivo.setAttribute("aria-live", "polite");
  // plano 1000b · AB-179: desligar a última série ligada explica por que nada aconteceu
  const nota = document.createElement("p"); nota.className = "rel-nota g-td-nota"; nota.setAttribute("role", "status"); nota.hidden = true;
  const legenda = document.createElement("ul"); legenda.className = "g-legenda g-legenda-botoes"; legenda.setAttribute("aria-label", "Séries do gráfico");
  const botoes = new Map();
  for (const se of SERIES) {
    const b = document.createElement("button"); b.type = "button"; b.className = `g-leg-b ${se.classe}`; b.setAttribute("aria-pressed", "true"); b.dataset.serie = se.id;
    const i = document.createElement("i"); i.className = `g-marca ${se.classe}`; i.setAttribute("aria-hidden", "true");
    b.append(i, document.createTextNode(se.nome));
    b.addEventListener("click", () => alternar(se.id));
    const li = document.createElement("li"); li.append(b); legenda.append(li); botoes.set(se.id, b);
  }
  alvo.append(caixa, legenda, nota, vivo);
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
    if (ativas.has(id)) {
      // a última série ligada não desliga — AB-179: e diz por quê
      if (ativas.size === 1) { nota.textContent = "Pelo menos uma série fica visível."; nota.hidden = false; return false; }
      ativas.delete(id);
    } else ativas.add(id);
    nota.hidden = true; nota.textContent = "";
    for (const [sid, b] of botoes) {
      const on = ativas.has(sid); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("g-leg-off", !on);
      if (on && ativas.size === 1) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");   // AB-179
    }
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
    // plano 1000b · AB-026: PageUp/PageDown andam 7 dias (com 60 dias, de ponta a ponta só por setas era lento)
    const ult = n() - 1, mapa = { ArrowRight: atual < 0 ? 0 : atual + 1, ArrowLeft: atual < 0 ? ult : atual - 1, Home: 0, End: ult,
      PageDown: atual < 0 ? 0 : atual + 7, PageUp: atual < 0 ? ult : atual - 7 };
    if (e.key === "Escape") { vivo.textContent = ""; return esconder(); }
    if (!(e.key in mapa) || !geo) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    mostrar(Math.max(0, Math.min(ult, mapa[e.key])));
    vivo.textContent = dica.textContent;   // AB-025: só o teclado fala
  });
  return { elemento: caixa, legenda, destruir() { if (ro) ro.disconnect(); ro = null; }, redesenhar() { W = medir(); desenhar(false); }, alternar, mostrar, esconder,
    get ativas() { return [...ativas]; }, get atual() { return atual; } };
}

/** Funil por plataforma (item 46): uma coluna por plataforma, 4 etapas em barra proporcional e a taxa entre cada par. */
export function criarFunilPlataformas({ h, dados = [], fmtInt = String, fmtMoeda = String, pctTxt = v => `${v}%`, fmtConv = null,
  // plano 1000 (AD-094): seta ↓ só quando cai; acima de 100% diz que a etapa contou mais (mesma regra de rel-logica.taxaFunilTxt)
  taxaTxt = pct => (pct == null ? { txt: "sem base" } : pct > 100 ? { txt: `${pctTxt(pct)} · mais que a etapa anterior contou`, acima: true } : pct >= 100 ? { txt: pctTxt(pct) } : { txt: `${pctTxt(pct)} ↓`, cai: true }) }) {
  const raiz = h("div", { class: "ads-fp", role: "list", "aria-label": "Funil por plataforma" });
  for (const p of dados) {
    const col = h("div", { class: `ads-fp-col ads-fp-${p.plat}`, role: "listitem" },
      h("div", { class: "ads-fp-cab" }, h("span", { class: `rel-chip rel-chip-${p.plat}` }, p.nome),
        // plano 1000b · AB-218: a coluna «Anúncio» diz o que é (negócio de anúncio sem a plataforma informada)
        p.plat === "anuncio" ? h("span", { class: "rel-nota ads-fp-sub" }, "anúncio sem plataforma informada") : null,
        h("span", { class: "rel-nota" }, `${fmtMoeda(p.gasto)} investidos → ${fmtMoeda(p.receita)} em receita`)));
    const ol = h("ol", { class: "ads-fp-etapas" });
    p.etapas.forEach((e, k) => {
      const w = p.max > 0 ? Math.max(e.v > 0 ? 4 : 0, e.v / p.max * 100) : 0;
      const taxa = k ? p.taxas[k - 1] : null;
      ol.append(h("li", { class: "ads-fp-etapa", style: `--i:${k}` },
        // plano 1000b · AB-029: o que a taxa divide sai do title — o leitor ouve («Agendaram ÷ Conversas no CRM») e o celular vê «de Conversas no CRM»
        taxa ? (tx => h("span", { class: `ads-fp-taxa${taxa.pct == null ? " ads-fp-taxa-0" : ""}${tx.acima ? " ads-fp-taxa-acima" : ""}`, title: `${e.rotulo} ÷ ${p.etapas[k - 1].rotulo}` }, tx.txt,
          h("span", { class: "sr-only" }, ` — ${e.rotulo} ÷ ${p.etapas[k - 1].rotulo}`),
          h("small", { class: "ads-fp-taxa-de", "aria-hidden": "true" }, `de ${p.etapas[k - 1].rotulo}`)))(taxaTxt(taxa.pct)) : h("span", { class: "ads-fp-taxa ads-fp-taxa-0", "aria-hidden": "true" }),
        h("span", { class: "ads-fp-trilho" }, h("i", { class: `ads-fp-barra g-${p.plat}`, style: `--w:${w.toFixed(1)}%` })),
        h("span", { class: "ads-fp-rot" }, h("b", { class: "rel-num" }, (e.id === "convAds" && typeof fmtConv === "function" ? fmtConv : fmtInt)(e.v)), " ", e.rotulo)));   // plano 1000b · AB-042: 1,5 conversão do Google não vira 2
    });
    col.append(ol);
    raiz.append(col);
  }
  if (!dados.length) raiz.append(h("p", { class: "rel-vazio-txt" }, "Nenhuma plataforma com movimento no período."));
  return raiz;
}

let seqCalor = 0;
/** Calor semanal (item 47): dia da semana × semana; célula com título legível e escala no rodapé. `nivel(v, max)` vem de graficos.nivelCalor. */
export function criarCalorSemanal({ h, calor, dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], fmt = String, nivel = (v, max) => (v > 0 ? Math.max(1, Math.min(5, Math.ceil(v / max * 5))) : 0), resumo = "", tituloCol = r => `semana de ${r}` }) {
  const nSem = calor.semanas.length;
  // plano 1000 (AD-119): o valor de cada célula estava só no title (fora do toque e do teclado). Agora toque/clique numa célula mostra a
  // dica numa linha viva logo abaixo; a grade recebe foco e as setas andam célula a célula (Home/End, Esc limpa)
  // plano 1000b · AB-027: a grade responde a foco e setas — é um grupo interativo («mapa de calor»), não uma figura estática (role=img
  // fazia o leitor ignorar a dica); a dica viva fica ligada por aria-describedby
  const idDica = `ads-cal-dica-${++seqCalor}`;
  const dica = h("p", { id: idDica, class: "rel-nota ads-cal-dica", "aria-live": "polite" }, "Toque numa célula para ver o número.");
  const grade = h("div", { class: `ads-cal${movReduzido() ? "" : " g-anim"}`, role: "group", "aria-roledescription": "mapa de calor", "aria-describedby": idDica,
    "aria-label": `${resumo} Use as setas para ler célula a célula.`, tabindex: "0", style: `--n:${nSem}` });
  grade.append(h("span", { class: "g-cal-canto", "aria-hidden": "true" }));
  calor.semanas.forEach(s => grade.append(h("span", { class: "g-cal-h", "aria-hidden": "true" }, s.rotulo)));
  const ORDEM = [1, 2, 3, 4, 5, 6, 0], celulas = [];
  let atual = -1;
  const marcar = n => {
    if (!celulas.length) return;
    atual = Math.max(0, Math.min(celulas.length - 1, n));
    for (const [j, c] of celulas.entries()) c.el.classList.toggle("ads-cal-sel", j === atual);
    dica.textContent = celulas[atual].txt;
  };
  ORDEM.forEach((d, lin) => {
    grade.append(h("span", { class: "g-cal-d", "aria-hidden": "true" }, dias[d]));
    for (let k = 0; k < nSem; k++) {
      const v = calor.matriz[d][k] || 0, txt = `${dias[d]} · ${tituloCol(calor.semanas[k].rotulo)}: ${fmt(v)}`, n = celulas.length;
      const el = h("span", { class: `g-cal-c g-n${nivel(v, calor.max)}${calor.pico && calor.pico.dow === d && calor.pico.semana === k ? " ads-cal-pico" : ""}`,
        title: txt, dataset: { txt }, style: `--i:${lin * 2 + k}`, on: { click: () => marcar(n) } });
      celulas.push({ el, txt });
      grade.append(el);
    }
  });
  grade.addEventListener("keydown", e => {
    // plano 1000b · AB-028: ↑/↓ andam na MESMA coluna e param na borda (antes a última linha + ↓ ia para a última célula, outra coluna)
    const desce = atual + nSem < celulas.length ? atual + nSem : atual, sobe = atual - nSem >= 0 ? atual - nSem : atual;
    const mapa = { ArrowRight: atual < 0 ? 0 : atual + 1, ArrowLeft: atual < 0 ? 0 : atual - 1, ArrowDown: atual < 0 ? 0 : desce, ArrowUp: atual < 0 ? 0 : sobe, Home: 0, End: celulas.length - 1 };
    if (e.key === "Escape") { atual = -1; for (const c of celulas) c.el.classList.toggle("ads-cal-sel", false); dica.textContent = "Toque numa célula para ver o número."; return; }
    if (!(e.key in mapa)) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    marcar(mapa[e.key]);
  });
  const esc = h("div", { class: "g-cal-escala", "aria-hidden": "true" }, h("span", {}, "menos"), [0, 1, 2, 3, 4, 5].map(k => h("i", { class: `g-cal-c g-n${k}` })), h("span", {}, "mais"));
  return h("div", { class: "ads-cal-caixa" }, h("div", { class: "g-cal-rolagem" }, grade), esc, dica);
}

/** Plano 1000 (AD-118): matriz dia × hora (7 × 24) → o formato de criarCalorSemanal com 4 colunas (madrugada, manhã, tarde, noite). */
export function matrizFaixasCalor(m24) {
  const FX = [["madr.", 0], ["manhã", 6], ["tarde", 12], ["noite", 18]];
  const matriz = Array.from({ length: 7 }, (_, d) => FX.map(([, ini]) => ((m24 && m24[d]) || []).slice(ini, ini + 6).reduce((a, b) => a + (+b || 0), 0)));
  let max = 0, pico = null;
  matriz.forEach((lin, d) => lin.forEach((v, k) => { if (v > max) { max = v; pico = { dow: d, semana: k, v }; } }));
  return { matriz, semanas: FX.map(([rotulo]) => ({ rotulo })), max, pico };
}

/** Semáforo do Radar (item 51): três luzes com contagem, frase para leigo, ação sugerida (com `link` opcional: {rotulo, href}) e filtro da lista (todos/ativos/resolvidos).
    Nível neutro (sem números de anúncio): nenhuma luz acesa e o cartão sem a cor verde. */
export function criarSemaforoRadar({ h, semaforo, icone = null, filtro = "todos", aoFiltrar = () => {}, link = null, contagem = null }) {
  // o leitor de tela ouve «0 críticos», «1 ponto de atenção», «2 informativos» (com plural)
  const luz = (sev, um, varios, q) => { const rotulo = `${q} ${q === 1 ? um : varios}`;
    return h("span", { class: `ads-sem-luz ads-sem-${sev}${q ? " acesa" : ""}`, role: "img", "aria-label": rotulo },
      // plano 1000 (AD-229): o número e o rótulo visíveis ficam fora da árvore de acessibilidade — o leitor ouve só o aria-label, uma vez
      h("i", { "aria-hidden": "true" }), h("b", { class: "rel-num", "aria-hidden": "true" }, String(q)), h("small", { "aria-hidden": "true" }, rotulo)); };
  const luzes = h("div", { class: "ads-sem-luzes" }, luz("critico", "crítico", "críticos", semaforo.contagens.critico),
    luz("alerta", "ponto de atenção", "pontos de atenção", semaforo.contagens.alerta), luz("info", "informativo", "informativos", semaforo.contagens.info));
  const seg = h("div", { class: "rel-seg ads-sem-filtro", role: "group", "aria-label": "Mostrar alertas" });
  const OPC = [["todos", "Todos"], ["ativos", "Ativos"], ["resolvidos", "Resolvidos"]];
  let atual = OPC.some(([v]) => v === filtro) ? filtro : "todos";
  for (const [v, t] of OPC) {
    // plano 1000b · AB-178: «Ativos (2)» / «Resolvidos (5)» quando a tela passa a contagem (de L.ordenarRadar)
    const q = contagem && Number.isFinite(+contagem[v]) && v !== "todos" ? ` (${+contagem[v]})` : "";
    const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(v === atual), dataset: { filtro: v } }, `${t}${q}`);
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
/** Plano 1000 (AD-231): tocar na barra ABRE os criativos da campanha (a comparação é só pela caixa «Comparar» da tabela — marcar comparação
    num toque era um gesto inesperado); a marcada para comparação continua em destaque (classe, não aria-pressed).
    AD-107: acima de `max` campanhas, «Mostrar todas (N)» abre a lista inteira (e «Mostrar só as N maiores» volta). */
export function criarBarrasCampanhas({ h, linhas = [], fmtMoeda = String, fmtInt = String, nomePlat = String, aoEscolher = () => {}, max = 8, convPlat = null }) {
  // plano 1000b · AB-043: a dica usa a palavra e a fração certas por plataforma («12 conversas» no Meta, «1,5 conversão» no Google)
  const convTxt = (plat, n) => (typeof convPlat === "function" ? convPlat(plat, n) : `${fmtInt(n)} conversões`);
  const ordenadas = linhas.slice().sort((a, b) => (b.t.gasto || 0) - (a.t.gasto || 0));
  const maior = Math.max(1, ...ordenadas.map(r => r.t.gasto || 0));
  const itens = new Map();
  let todas = false, destacados = new Set(), realcado = null;
  const ol = h("ol", { class: `ads-cb${movReduzido() ? "" : " g-anim"}`, "aria-label": "Investimento por campanha" });
  const caixa = h("div", { class: "ads-cb-lista" }, ol);
  const pintar = () => {
    itens.clear();
    if (typeof ol.replaceChildren === "function") ol.replaceChildren(); else ol.filhos = [];
    (todas ? ordenadas : ordenadas.slice(0, max)).forEach((r, n) => {
      const b = h("button", { type: "button", class: "ads-cb-item", "aria-haspopup": "dialog", dataset: { campId: String(r.c.id) }, style: `--i:${n}`,
        title: `${r.c.nome}: ${fmtMoeda(r.t.gasto)} · ${convTxt(r.c.plat, r.t.conversoes)} · ${fmtInt(r.k.agendadas)} agendamentos — toque para ver os criativos` },
        h("span", { class: "ads-cb-nome" }, h("i", { class: `g-marca g-${r.c.plat}`, "aria-hidden": "true" }), r.c.nome, h("span", { class: "sr-only" }, ` · ${nomePlat(r.c.plat)} · ver criativos`)),
        h("span", { class: "ads-cb-trilho" }, h("i", { class: `ads-cb-barra g-${r.c.plat}`, style: `--w:${((r.t.gasto || 0) / maior * 100).toFixed(1)}%` })),
        h("span", { class: "ads-cb-val rel-num" }, fmtMoeda(r.t.gasto)));
      b.addEventListener("click", () => aoEscolher(r));
      itens.set(String(r.c.id), b);
      ol.append(h("li", {}, b));
    });
    destacar([...destacados]); realcar(realcado);
  };
  const destacar = ids => { destacados = new Set((ids || []).map(String)); for (const [id, b] of itens) if (b.classList) b.classList.toggle("ads-cb-dest", destacados.has(id)); };
  const realcar = id => { realcado = id; for (const [k, b] of itens) if (b.classList) b.classList.toggle("ads-cb-hover", id != null && String(id) === k); };
  let botaoTodas = null;
  if (ordenadas.length > max) {
    botaoTodas = h("button", { type: "button", class: "g-ver-tabela ads-cb-todas", "aria-expanded": "false" }, `Mostrar todas (${ordenadas.length})`);
    botaoTodas.addEventListener("click", () => {
      todas = !todas; pintar();
      botaoTodas.setAttribute("aria-expanded", String(todas));
      botaoTodas.textContent = todas ? `Mostrar só as ${max} maiores` : `Mostrar todas (${ordenadas.length})`;
    });
    caixa.append(botaoTodas);
  }
  pintar();
  return { elemento: caixa, destacar, realcar, itens, botaoTodas, get todas() { return todas; } };
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

export function desmontar() { soltarGraficos(); soltarComandos(); clearInterval(tPilula); tPilula = 0; repintarPilula = null; montagem++; if (soltarAparelho) { soltarAparelho(); soltarAparelho = null; } if (soltarFora) { soltarFora(); soltarFora = null; } }

export async function montar(ctx) {
  const minha = ++montagem;
  soltarGraficos();
  clearInterval(tPilula);
  const { ui } = ctx;
  const v = ctx.versao;
  ui.carregarCss("relatorios.css");
  // plano 1000b · AB-176: o título da página cita a aba («Anúncios · Radar»): histórico e leitor de tela distinguem
  { const p0 = (ctx.rota && ctx.rota.partes && ctx.rota.partes[0]) || ""; const ab = ABAS.find(a => a.id === p0) || ABAS[0]; ctx.titulo(ab.id ? `Anúncios · ${ab.rotulo}` : "Anúncios"); }
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
  ouvirVisibilidade();   // plano 1000b · AB-063
  S.dias = periodoGuardado(lerLocal, ctx.cliente.id);   // plano 1000b · AB-072: por cliente
  // AD-098: plataforma guardada por cliente (a chave global antiga não vale mais: «Google» de um cliente abria zerado no outro)
  S.plat = ["", "meta", "google"].includes(lerLocal(chavePlat(ctx.cliente.id), "")) ? lerLocal(chavePlat(ctx.cliente.id), "") : "";
  // plano 1000b · AB-071: a ordem do ranking por cliente (a chave global vazava a escolha de um cliente para o outro)
  const rankGuardado = lerLocal(chaveRank(ctx.cliente.id), "");
  S.rank = L.RANK_CRI.some(([k]) => k === rankGuardado) ? rankGuardado : "receita";
  // AD-112: sem escolha guardada, o ranking pode abrir em «Menor custo por conversa» quando ninguém registrou receita
  S.rankEscolhido = L.RANK_CRI.some(([k]) => k === rankGuardado);
  // AD-260: a ordenação da tabela de campanhas é lembrada por cliente
  S.ordem = lerOrdem(lerLocal(chaveOrdem(ctx.cliente.id), ""));
  // filtros e comparação só duram nesta montagem: uma troca de empresa nunca reaproveita estado privado da anterior
  S.buscaCamp = ""; S.resultadoCamp = "todos"; S.comparacaoCamp = []; S.nomesCamp = {};   // plano 1000b · AB-207: nomes das marcadas

  const aba = ABAS.some(a => a.id === (ctx.rota.partes[0] || "")) ? (ctx.rota.partes[0] || "") : "";
  ui.limpar(ctx.alvo);
  const raiz = h("section", { class: "rel ads", "aria-labelledby": "ads-h" });
  ctx.alvo.append(raiz);

  // topo: título, «Atualizado há 27 min» (texto pequeno no celular) + botão-ícone, atalhos do gestor (no celular, num ⋮)
  // plano 1000 (AD-081): a pílula é um BOTÃO que abre o detalhe por plataforma (antes só no title: fora do toque e do teclado);
  // AD-082: ela não é mais role=status (o texto muda a cada 30 s e o leitor repetia) — só a mudança de NÍVEL é anunciada, numa linha à parte
  const pilulaTxt = h("span", { class: "ads-pilula-t" });
  const pilula = h("button", { type: "button", class: "ads-pilula", "aria-expanded": "false", "aria-controls": "ads-pilula-pop", "aria-live": "off" }, pilulaTxt);
  pilula.hidden = true;
  const pilulaPop = h("div", { id: "ads-pilula-pop", class: "ads-pilula-pop", role: "region", "aria-label": "Leitura dos anúncios por plataforma" });
  pilulaPop.hidden = true;
  const avisoNivel = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  const fecharPop = () => { pilulaPop.hidden = true; pilula.setAttribute("aria-expanded", "false"); };
  // plano 1000b · AB-064: o detalhe só é (re)montado aberto — a pintura de 30 s não refaz a lista escondida
  let pintarDetalhe = null;
  pilula.addEventListener("click", () => { const abrir = pilulaPop.hidden; if (abrir && pintarDetalhe) pintarDetalhe(); pilulaPop.hidden = !abrir; pilula.setAttribute("aria-expanded", String(abrir)); });
  pilulaPop.addEventListener("keydown", e => { if (e.key === "Escape") { fecharPop(); pilula.focus(); } });
  pilula.addEventListener("keydown", e => { if (e.key === "Escape" && !pilulaPop.hidden) { e.preventDefault(); fecharPop(); } });
  const caixaPilula = h("div", { class: "ads-pilula-caixa" }, pilula, pilulaPop, avisoNivel);
  // plano 1000b · AB-032: tocar fora (ou o foco sair da caixa) fecha o detalhe — no celular ele cobria os filtros
  if (soltarFora) soltarFora();
  soltarFora = ligarFecharFora({ caixa: caixaPilula, aberto: () => !pilulaPop.hidden, fechar: fecharPop });
  // AD-127: o botão só RECARREGA do banco (quem lê o Meta/Google é o ciclo de hora em hora) — o nome e a dica dizem isso
  const btnAtualizar = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic", title: "Recarregar os números guardados", on: { click: () => recarregar(true) } },
    ui.icone("reabrir"), h("span", { class: "rel-rot" }, "Recarregar"));
  // plano 1000 (AD-122): «Imprimir» como em Relatórios (o @media print de relatorios.css limpa filtros e botões)
  const btnImprimir = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic ads-imprimir rel-so-largo", title: "Imprimir ou salvar em PDF",
    on: { click: () => imprimir() } },
    ui.icone("modelo"), h("span", { class: "rel-rot" }, "Imprimir"));
  const acoes = h("div", { class: "rel-topo-acoes" }, caixaPilula, btnImprimir, btnAtualizar);
  let linkPainel = null;
  const imprimir = () => { try { window.print(); } catch { ui.toast("Não foi possível abrir a impressão aqui.", { tipo: "nota" }); } };
  if (eGestor(ctx)) {
    acoes.append(h("a", { class: "rel-btn rel-btn-sec rel-so-largo", href: "#/config/anuncios" }, "Ajustes de anúncios"));
    // plano 1000 (AD-137): o endereço do painel é o do cliente (cfg.painelUrl, o mesmo dos textos do WhatsApp) quando configurado
    linkPainel = h("a", { class: "rel-link rel-so-largo", href: URL_PAINEL, target: "_blank", rel: "noopener noreferrer" }, "Painel de apresentação ↗");
    acoes.append(linkPainel);
  }
  // plano 1000b · AB-033: no celular o «Imprimir» (rel-so-largo) sumia — o ⋮ aparece para TODOS com «Imprimir ou salvar PDF»; Ajustes e
  // Painel continuam só para quem gere
  const maisAcoes = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic rel-so-movel", "aria-label": "Mais ações", title: "Mais ações" }, ui.icone("opcoes"));
  maisAcoes.addEventListener("click", () => ui.menu(maisAcoes, itensMaisAcoes({ gestor: eGestor(ctx), imprimir,
    ajustes: () => ctx.navegar("#/config/anuncios"),
    painel: () => { try { window.open(linkPainel ? linkPainel.href : URL_PAINEL, "_blank", "noopener,noreferrer"); } catch { /* bloqueado */ } } })));
  acoes.append(maisAcoes);
  const tituloAba = (ABAS.find(a => a.id === aba) || ABAS[0]).rotulo;
  // AD-144 (também aqui): na impressão sai a marca, o período e quando foi gerado (o cabeçalho só aparece no papel)
  const cabImpressao = h("p", { class: "rel-impressao-cab", "aria-hidden": "true" });
  raiz.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Anúncios · ${ctx.cliente.nome}`), h("h1", { id: "ads-h", class: "rel-h1" }, tituloAba)),
    acoes), cabImpressao);

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
  const filtros = h("div", { class: "rel-filtros ads-filtros" });
  // sem aria-live aqui: o corpo inteiro (com números que "contam") seria lido a cada filtro
  const corpo = h("div", { class: "rel-corpo", "aria-busy": "true" });
  raiz.append(faixa, filtros, corpo);
  let desvioAtual = 0, nivelAnunciado = null;

  // plano 1000b · AB-005: {silencioso} não mostra «Números atualizados.» (o silenciar já mostrou o aviso dele)
  async function recarregar(forcar, { silencioso = false } = {}) {
    const id = ctx.cliente.id;
    let item = cache.get(id);
    if (forcar || !item || Date.now() - item.em > VALIDADE_MS) {
      // F13: o esqueleto tem a forma da aba (KPIs + gráfico na Visão geral; tabela nas Campanhas; lista no Radar/Relatórios)
      if (!item) { ui.limpar(corpo); corpo.append(aba === "campanhas" ? ui.esqueleto("tabela", 6) : aba ? ui.esqueleto("lista", 6) : h("div", { class: "ads-sk" }, ui.esqueleto("kpi", { n: 4 }), ui.esqueleto("grafico"))); }
      corpo.setAttribute("aria-busy", "true");
      btnAtualizar.disabled = true;
      // plano 1000b · AB-181: com números na tela o botão diz que está buscando (antes só ficava desabilitado)
      const rotAtualizar = btnAtualizar.querySelector(".rel-rot");
      if (rotAtualizar) rotAtualizar.textContent = "Recarregando…";
      btnAtualizar.setAttribute("aria-busy", "true");
      // a vertical vem do nx_dados (20261008c); sem ela, a da sessão — escolhe o vocabulário das prévias do WhatsApp
      const montarItem = (dados, em) => {
        const cli = dados.cliente || { nome: ctx.cliente.nome, cfg: {} };
        const M = N.montar(N.datasetDeLinhas({ metricas: dados.metricas || [], leads: dados.leads || [],
          cliente: { ...cli, vertical: cli.vertical || ctx.cliente.vertical }, hoje: dados.hoje || N.hojeSP(), dias: DIAS_JANELA }));
        return { dados, M, em, desvio: L.desvioRelogio(dados, Date.now()) };
      };
      let pintouDoCache = false, assinaturaCache = "";
      try {
        // plano 1000 (AD-125): stale-while-revalidate pelo cache.js do shell — ao recarregar a página, a última resposta guardada
        // (≤ 12 h, só neste aparelho) pinta na hora e a da rede substitui logo depois
        const dados = await ctx.api.rpcC("nx_dados", { p_dias: DIAS_JANELA }, { cache: true, aoCache: (dc, em) => {
          if (item || minha !== montagem || !dc || typeof dc !== "object") return;
          try { pintouDoCache = true; assinaturaCache = assinaturaDados(dc); const it = montarItem(dc, Number(em) || Date.now()); desvioAtual = it.desvio || 0; desenhar(it); corpo.setAttribute("aria-busy", "true"); } catch { pintouDoCache = false; }
        } }) || {};
        item = montarItem(dados, Date.now());
        cache.set(id, item);
        if (forcar && !silencioso) ui.toast("Números atualizados.", { tipo: "ok", ms: 2500 });
        // plano 1000b · AB-188: a rede trouxe o MESMO que o cache já pintou — não redesenha (gráficos não animam de novo, foco fica)
        if (pintouDoCache && assinaturaCache && assinaturaCache === assinaturaDados(dados)) {
          if (minha !== montagem) return;
          desvioAtual = item.desvio || 0;
          corpo.setAttribute("aria-busy", "false");
          return;
        }
      } catch (e) {
        if (minha !== montagem) return;
        corpo.setAttribute("aria-busy", "false");
        if (e && e.codigo === "sessao_invalida") return;
        if (pintouDoCache || (e && e.comCache)) { ui.toast("Sem conexão agora: mostrando os últimos números guardados neste aparelho.", { tipo: "nota" }); return; }
        if (item && forcar) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora. Tente de novo em instantes.", { tipo: "erro" }); return; }
        ui.limpar(corpo);
        // plano 1000 (AD-126): fora do plano, teste vencido ou sem permissão não é «erro» com código — é um estado com o que fazer
        const est = estadoAcessoAds(e && e.codigo);
        if (est) { filtros.hidden = true; corpo.append(ui.vazio({ tema: "ads", titulo: est.titulo, texto: est.texto })); return; }
        corpo.append(ui.erroCartao(e, () => recarregar(true)));
        return;
      } finally {
        btnAtualizar.disabled = false; btnAtualizar.removeAttribute("aria-busy");   // AB-181
        const rot = btnAtualizar.querySelector(".rel-rot"); if (rot) rot.textContent = "Recarregar";
      }
    }
    if (minha !== montagem) return;
    desvioAtual = item.desvio || 0;
    // AB-188: mudou de verdade — o controle focado (filtro, aba de ordenação…) é achado de novo depois do redesenho
    const focado = typeof document !== "undefined" ? document.activeElement : null;
    const sel = focado && dentroDe(raiz, focado) ? seletorFoco(focado) : null;
    desenhar(item);
    if (sel) { try { const novo = raiz.querySelector(sel); if (novo && novo !== focado) novo.focus({ preventScroll: true }); } catch { /* seletor inválido: segue */ } }
  }

  function desenhar({ dados, M }) {
    soltarGraficos();
    if (linkPainel) linkPainel.href = enderecoPainel(M.CFG, N.urlPainel);
    corpo.setAttribute("aria-busy", "false");
    // pílula de conexão + faixa de queda (em todas as abas)
    // plano 1000 (AD-138): «há N min» pelo relógio do servidor quando o nx_dados manda a hora dele (o celular adiantado não decide)
    const desvio = desvioAtual;
    const pintarPilula = () => {
      const agora = Date.now() + desvio;
      const e = L.estadoIntegracao(dados.integracoes || [], dados.alertas || [], agora);
      pilula.hidden = e.nivel === "nenhuma";
      if (pilula.hidden) fecharPop();
      pilula.className = `ads-pilula ads-p-${e.nivel}`;
      pilulaTxt.textContent = L.textoPilula(e, agora);
      // AD-081: o detalhe por plataforma num painel que o toque e o teclado abrem; AD-127: quando vem a próxima leitura
      const prox = L.proximaLeitura(e.ultimo, agora);
      pintarDetalhe = () => {
        const ag = Date.now() + desvio, e2 = L.estadoIntegracao(dados.integracoes || [], dados.alertas || [], ag), p2 = L.proximaLeitura(e2.ultimo, ag);
        ui.limpar(pilulaPop);
        pilulaPop.append(h("ul", { class: "ads-pilula-lista" }, L.detalhePilula(e2, ag).map(x => h("li", {}, h("b", {}, x.nome), ` · ${x.texto}`))),
          h("p", { class: "rel-nota" }, `O Órbita lê o Meta e o Google de hora em hora${p2 ? ` · ${p2}` : ""}. «Recarregar» busca de novo o que já foi lido.`));
      };
      if (!pilulaPop.hidden) pintarDetalhe();   // AB-064: fechado, nada é refeito
      btnAtualizar.title = `Recarregar os números guardados${prox ? ` (${prox})` : ""}`;
      // AD-082: só a MUDANÇA de nível é anunciada (o «há N min» que muda a cada 30 s fica calado)
      if (nivelAnunciado !== null && nivelAnunciado !== e.nivel) avisoNivel.textContent = `Leitura dos anúncios: ${L.textoPilula(e, agora)}`;
      nivelAnunciado = e.nivel;
      faixa.hidden = !e.erros.length;
      ui.limpar(faixa);
      if (e.erros.length) {
        // AD-132: «já foi avisada» só quando o aviso de conexão saiu de fato; senão, o que a pessoa pode fazer
        faixa.append(h("p", {}, L.textoQueda(e.erros)),
          eGestor(ctx) ? h("a", { class: "rel-btn rel-btn-prim", href: "#/config/anuncios" }, "Refazer a conexão")
            : h("p", { class: "rel-nota" }, equipeAvisada(dados.alertas || [], e.erros, agora) ? "Nossa equipe já foi avisada." : "Avise a equipe que cuida dos seus anúncios para refazer a conexão."));
      }
    };
    pintarPilula();
    clearInterval(tPilula);
    tPilula = setInterval(() => { if (!document.hidden && pilula.isConnected) pintarPilula(); }, 30000);
    // plano 1000b · AB-063: ao voltar para a aba, a pílula repinta na hora (o intervalo pula com a aba escondida: ficava o texto velho até 30 s)
    repintarPilula = () => { if (!document.hidden && pilula.isConnected) pintarPilula(); };
    const radar = L.montarRadar(M, dados, Date.now() + desvio);
    // AD-045: o selo conta só crítico/atenção e pinta pela maior gravidade (informativo não acende vermelho)
    const selo = radar.selo || { n: radar.ativos, sev: "critico" };
    badge.hidden = !selo.n;
    badge.textContent = String(selo.n);
    badge.className = `rel-badge rel-badge-${selo.sev || "alerta"}`;
    badge.setAttribute("aria-label", `${selo.n} ${selo.n === 1 ? "alerta que pede ação" : "alertas que pedem ação"}${selo.sev === "critico" ? ", com crítico" : ""}`);

    // filtros (período e plataforma) só onde fazem sentido
    ui.limpar(filtros);
    filtros.hidden = !(aba === "" || aba === "campanhas") || L.semAnuncios(M);
    // AD-099: só as plataformas com números; a escolhida que sumiu volta para «Tudo»
    const plats = platsDisponiveis(M);
    if (S.plat && !plats.some(([v]) => v === S.plat)) S.plat = "";
    // plano 1000b · AB-034: numerosPeriodo (dois crmTot sobre todos os leads + consolidar) UMA vez por desenho — a linha dos filtros,
    // a Visão geral e as Campanhas usam o mesmo P (antes era calculado de novo em cada aba)
    const Pdes = (aba === "" || aba === "campanhas") && !L.semAnuncios(M) ? L.numerosPeriodo(M, { dias: S.dias, plat: S.plat }) : null;
    // plano 1000b · AB-180: a descrição do período (com a nota de fuso diferente) calculada uma vez — filtros e cartões da Visão geral
    const fusos = L.fusosDiferentes(dados.integracoes || []);
    const descP = Pdes ? descricaoPeriodoAds(Pdes, M.dataBR, L.nomePlat, { fusos }) : null;
    if (!filtros.hidden) {
      const chipResumo = h("button", { type: "button", class: "rel-resumo", "aria-haspopup": "dialog", title: "Período e plataforma" },
        h("span", { class: "rel-resumo-t" }, L.textoChipAnuncios(S.dias, S.plat)), ui.icone("seta-baixo"));
      chipResumo.addEventListener("click", () => abrirFolha(M, dados));
      filtros.append(chipResumo,
        h("div", { class: "rel-filtros-lg" },
          segmento("Período", PERIODOS.map(d => [d, ROT_PERIODO[d]]), S.dias, d => { S.dias = d; gravarLocal(chaveDias(ctx.cliente.id), d); desenhar({ dados, M }); }),
          plats.length > 2 ? segmento("Plataforma", plats, S.plat, p => { S.plat = p; gravarLocal(chavePlat(ctx.cliente.id), p); desenhar({ dados, M }); }) : null),
        h("p", { class: "rel-nota rel-ate ads-ate" }, descP || descricaoPeriodoAds(L.numerosPeriodo(M, { dias: S.dias, plat: S.plat }), M.dataBR, L.nomePlat, { fusos })));
    }

    // plano 1000b · AB-082: no dia 1º o nome do mês («Setembro (até ontem)»), não «Este mês»
    cabImpressao.textContent = `${ctx.cliente.nome} · Anúncios · ${(ABAS.find(a => a.id === aba) || ABAS[0]).rotulo} · ${L.rotuloPeriodo(S.dias, M).titulo}${S.plat ? ` · ${L.nomePlat(S.plat)}` : ""} · gerado em ${L.dataIsoBR(L.hojeSP())} às ${L.horaSP(new Date().toISOString())}`;
    ui.limpar(corpo);
    if (aba === "radar") return abaRadar(M, dados, radar);
    if (aba === "relatorios") return abaRelatorios(M, dados);
    if (L.semAnuncios(M)) return corpo.append(vazioAds());
    if (aba === "campanhas") return abaCampanhas(M, Pdes);
    // plano 1000b · AB-262: crítico ativo no Radar ganha uma faixa discreta no topo da Visão geral, com o caminho até ele
    const txtCritico = selo.sev === "critico" ? textoFaixaCritico(L.semaforoRadar(radar).contagens.critico) : "";
    if (txtCritico) corpo.append(h("p", { class: "rel-faixa rel-faixa-ruim ads-faixa-critico" }, ui.icone("alerta"), h("span", {}, txtCritico), " ",
      h("a", { class: "rel-link", href: "#/anuncios/radar" }, "Ver no Radar")));
    return abaGeral(M, Pdes, descP);
  }

  /** O chip-resumo «Últimos 30 dias · Tudo ▾» abre esta folha: período e plataforma num lugar só, aplicados de uma vez. */
  async function abrirFolha(M, dados) {
    let dias = S.dias, plat = S.plat;
    const campoSeg = (rotulo, el) => h("div", { class: "campo" }, h("p", { class: "rotulo" }, rotulo), el);
    const segDias = ui.segmentado({ tipo: "filtro", rotulo: "Período", valor: dias, opcoes: PERIODOS.map(d => ({ valor: d, rotulo: ROT_PERIODO[d] })), aoMudar: v => { dias = v; } });
    const plats = platsDisponiveis(M);
    const segPlat = plats.length > 2 ? ui.segmentado({ tipo: "filtro", rotulo: "Plataforma", valor: plat, opcoes: plats.map(([v, t]) => ({ valor: v, rotulo: t })), aoMudar: v => { plat = v; } }) : null;
    const r = await ui.modal({ titulo: "Período e plataforma", largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, campoSeg("Período", segDias), segPlat ? campoSeg("Plataforma", segPlat) : null),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: () => true }] });
    if (r !== true || (dias === S.dias && plat === S.plat)) return;
    S.dias = dias; S.plat = plat; gravarLocal(chaveDias(ctx.cliente.id), dias); gravarLocal(chavePlat(ctx.cliente.id), plat);
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
      ? ui.vazio({ tema: "ads", titulo: "Nenhum número de anúncio ainda", texto: "Conecte o Meta e o Google em Ajustes de anúncios." /* plano 1000b · AB-065: um nome só (texto = botão) */, acao: { rotulo: "Abrir Ajustes de anúncios", fn: () => ctx.navegar("#/config/anuncios") } })
      : ui.vazio({ tema: "ads", titulo: "Nenhum número de anúncio ainda", texto: "Os números aparecem aqui assim que os anúncios começarem a rodar." });
  }

  const num = (valor, fmt, cls = "") => {
    const b = h("b", { class: `rel-num ${cls}` });
    // dinheiro ganha o formato editorial ("R$" e centavos a 60 %); o resto conta como antes
    if (fmt === N.brl || fmt === N.brl0) L.contarMoeda(ui, G, b, valor, { centavos: fmt === N.brl });
    else G.contar(b, valor, fmt);
    return b;
  };
  // AD-100: conversão do Google pode ser 1,5 — tabelas e gavetas mostram a fração (N.int arredondava para 2)
  // AD-111: o Google conta conversões, o Meta conversas — a palavra certa por plataforma
  const convPlat = (plat, n) => `${fmtConvG(n)} ${plat === "google" ? (n === 1 ? "conversão" : "conversões") : (Math.round(n) === 1 ? "conversa" : "conversas")}`;
  const fmtConvG = v => (Number.isFinite(+v) && !Number.isInteger(+v) ? N.dec(+v, 1) : N.int(+v));
  const chip = (atual, anterior, sentido) => {
    const c = L.chipVar(atual, anterior, sentido);
    // plano 1000b · AB-070: com o que compara também em texto (sr-only) — o title não chega ao toque nem a todo leitor de tela
    return h("span", { class: `rel-var rel-var-${c.cls}`, title: `vs. ${L.rotuloPeriodo(S.dias).antes}` }, c.v == null ? c.txt : `${c.seta} ${c.txt}`,
      h("span", { class: "sr-only" }, ` em relação a ${L.rotuloPeriodo(S.dias).antes}`));
  };
  // plano 1000b · AB-209: download que o navegador recusa (sem document.body, bloqueado) avisa em vez de não fazer nada
  const avisarDownload = r => { if (r === false) ui.toast("Não deu para baixar aqui; use «Ver como tabela» e copie os números.", { tipo: "nota" }); return r; };
  /** Baixa um bloco em CSV (números crus: L.csv troca o ponto por vírgula e escapa fórmula). */
  // plano 1000 (AD-103): o nome do cliente no arquivo; AD-121: no app instalado, a folha de compartilhar do sistema
  const baixarCsv = (nome, colunas, linhas) => baixarArquivo(new Blob([L.csv(colunas, linhas)], { type: "text/csv;charset=utf-8" }),
    L.nomeArquivoExport(nome, typeof S.dias === "number" ? `${S.dias}dias` : S.dias, S.plat || "tudo", "csv", ctx.cliente.nome)).then(avisarDownload, () => avisarDownload(false));
  /** AD-103/AD-120: nome do PNG com o cliente e cabeçalho com título, cliente e período. */
  const pngDe = (base, titulo, P, M_atual) => ({ nome: () => L.nomeArquivoExport(base, N.isoDe(M_atual.dataDe(P.de)), N.isoDe(M_atual.dataDe(P.ate)), "png", ctx.cliente.nome),
    cabecalho: () => L.cabecalhoPng({ titulo, cliente: ctx.cliente.nome, periodo: `${L.rotuloPeriodo(S.dias, M_atual).titulo} (${M_atual.dataBR(P.de)} a ${M_atual.dataBR(P.ate)})${S.plat ? ` · ${L.nomePlat(S.plat)}` : ""}` }) });
  const botaoCsv = (nome, colunas, linhas, titulo = "") => {
    const b = h("button", { type: "button", class: "g-ver-tabela relat-csv", title: "Baixar este bloco em CSV (abre no Excel)", "aria-label": titulo ? `Baixar «${titulo}» em CSV` : "Baixar este bloco em CSV" }, "CSV");
    b.addEventListener("click", () => baixarCsv(nome, colunas, linhas()));
    return b;
  };

  /* ---------------- VISÃO GERAL ---------------- */
  function abaGeral(M, P0 = null, desc0 = null) {
    const P = P0 || L.numerosPeriodo(M, { dias: S.dias, plat: S.plat });   // AB-034
    const periodoTexto = desc0 || descricaoPeriodoAds(P, M.dataBR, L.nomePlat);   // AB-180: com a nota de fuso, igual à dos filtros
    // plano 1000 (AD-095): a linha dos filtros já descreve o período inteiro — o olho do herói fica só com «Últimos 30 dias»
    const olhoHeroi = filtros.hidden ? periodoTexto : P.rotulo.titulo;
    const { t, ta, c, ca } = P;
    const contatos = voc(ctx, "contatos", "Clientes").toLowerCase();
    const umContato = voc(ctx, "contato", "Cliente").toLowerCase();

    // herói: a frase que o dono lê em 3 segundos + a conta do retorno
    // plano 1000b · AB-192: sem jargão («No CRM, com origem atribuída a anúncios, registramos…» era difícil para o dono da clínica)
    const frase = h("p", { class: "ads-frase" }, "Dos anúncios chegaram ao CRM ", num(c.conversas, N.int), ` ${c.conversas === 1 ? "conversa" : "conversas"}, `,
      num(c.agendadas, N.int), ` ${c.agendadas === 1 ? "agendamento" : "agendamentos"} e `, num(c.fecharam, N.int),
      ` ${c.fecharam === 1 ? `novo ${umContato}` : `novos ${contatos}`}.`);
    // F1 (decisão 5): «Retorno total … (anúncios + gestão)» só com fee configurado — e então a nota «inclui R$ X de gestão» aparece
    // para todos; sem fee é «Retorno sobre anúncios». Receita estimada pelo ticket configurado leva «estimativa» escrito.
    const rot = L.rotulosRetorno(P, N.brl0);
    const est = P.estimada;
    const conta = h("div", { class: "ads-conta" },
      h("p", { class: "rel-olho" }, rot.olho),
      Number.isFinite(P.retorno)
        ? h("p", { class: "ads-retorno" }, `Cada R$ 1 ${rot.frase} virou `, num(P.retorno, N.brl, "ads-retorno-n"), h("span", { class: "ads-retorno-em" }, " em receita registrada no CRM"), est ? h("span", { class: "ads-est" }, " (estimado)") : null)   // AD-135: virou em QUÊ
        // plano 1000b · AB-247: sem gasto mas com conversas de anúncio no CRM — elas vêm de anúncios de antes (não «sem investimento» seco)
        : h("p", { class: "ads-retorno" }, c.conversas > 0 ? "Sem investimento nestes dias — as conversas vêm de anúncios de antes" : "Sem investimento no período"),
      h("p", { class: "rel-nota" }, rot.nota),
      rot.gestao ? h("p", { class: "rel-nota ads-gestao" }, rot.gestao) : null,
      h("p", { class: "ads-receita" }, num(c.receita, N.brl0), h("span", {}, est ? " em receita fechada (inclui estimativa)" : " em receita fechada")),
      c.semValor > 0 ? h("p", { class: "rel-nota" }, `${c.semValor === 1 ? "1 fechamento" : `${N.int(c.semValor)} fechamentos`} sem valor informado — não entram na receita até alguém registrar o valor`) : null,   // plano 1000b · AB-193
      // plano 1000 (AD-128): quanto custou cada agendamento e cada fechamento do CRM (investimento do período ÷ eventos do período)
      // plano 1000b · AB-194: com o chip de variação contra o período anterior (custo: cair é bom — sentido «baixo»)
      P.custoAgendamento != null || P.custoFechamento != null ? h("p", { class: "rel-nota ads-custos" },
        ...[P.custoAgendamento != null ? [`${N.brl0(P.custoAgendamento)} por agendamento `, P.custoAgendamentoAnt != null ? chip(P.custoAgendamento, P.custoAgendamentoAnt, "baixo") : null] : null,
         P.custoFechamento != null ? [`${N.brl0(P.custoFechamento)} por ${umContato} novo `, P.custoFechamentoAnt != null ? chip(P.custoFechamento, P.custoFechamentoAnt, "baixo") : null] : null]
          .filter(Boolean).flatMap((x, i) => (i ? [" · ", ...x] : x)).filter(Boolean)) : null);
    const balde = L.semCampanhaTot(M, P.de, P.ate, { plat: S.plat });
    // plano 1000b · AB-001: só as partes não zeradas (antes «Inclui 0 conversas…» com só agendamento no período)
    const txtBalde = textoBalde(balde, N.int);
    // plano 1000b · AB-066: o caminho para resolver — os parâmetros de URL com o ID da campanha (para quem configura: admin/gestor)
    const podeRastreio = eGestor(ctx) || (typeof ctx.pode === "function" && ctx.pode("admin"));
    const notaBalde = txtBalde ? h("p", { class: "rel-nota ads-balde" }, txtBalde,
      podeRastreio ? [" ", h("a", { class: "rel-link", href: "#/config/rastreio" }, "Ver os parâmetros de URL dos anúncios")] : null) : null;
    // plano 1000 (AD-024): orgânicos ficam fora do funil por desenho — a tela diz quantos houve
    const nOrg = S.plat ? 0 : L.organicosPeriodo(M, { dias: S.dias });
    const notaOrg = nOrg ? h("p", { class: "rel-nota ads-organicos" }, `+ ${N.int(nOrg)} ${nOrg === 1 ? "conversa orgânica" : "conversas orgânicas"} no período (indicação, link da bio, WhatsApp direto) — fora da conta dos anúncios.`) : null;
    corpo.append(h("div", { class: "ads-heroi rel-cartao rel-entra" },
      h("div", { class: "ads-heroi-t" }, h("p", { class: "rel-olho" }, olhoHeroi), frase, notaBalde, notaOrg), conta));

    // trilha do funil: conversas → agendaram → compareceram → fecharam
    const passos = [
      { v: c.conversas, a: ca.conversas, l: "Conversas registradas no CRM", taxa: null },
      { v: c.agendadas, a: ca.agendadas, l: "Agendaram", taxa: L.razao(c.agendadas, c.conversas), tl: "das conversas" },
      { v: c.compareceram, a: ca.compareceram, l: "Compareceram", taxa: L.razao(c.compareceram, c.agendadas), tl: "dos agendados" },
      { v: c.fecharam, a: ca.fecharam, l: "Fecharam", taxa: L.razao(c.fecharam, c.compareceram), tl: "de quem veio" },
    ];
    const trilha = h("ol", { class: "ads-trilha rel-cartao rel-entra", "aria-label": "Do anúncio ao fechamento" });
    passos.forEach((p, n) => trilha.append(h("li", { class: "ads-passo", style: `--i:${n}` },
      // plano 1000b · AB-038: acima de 100% a trilha diz «mais que a etapa anterior contou» (antes cortava em 100% sem avisar)
      p.taxa == null ? h("span", { class: "ads-taxa ads-taxa-0", "aria-hidden": "true" }) : h("span", { class: `ads-taxa${p.taxa > 100 ? " ads-taxa-acima" : ""}` }, textoTaxaTrilha(p.taxa, p.tl, v => N.pc(v, 0), L.taxaFunilTxt)),
      num(p.v, N.int, "ads-passo-n"), h("span", { class: "ads-passo-l" }, p.l), chip(p.v, p.a, "cima"),
      // plano 1000 (AD-022): consulta que já passou sem presença marcada não entra nem em «compareceram» nem em «faltaram»
      n === 2 && c.semPresenca > 0 ? h("span", { class: "rel-nota ads-sem-presenca" }, `${N.int(c.semPresenca)} sem presença marcada`) : null,
      // AD-023: agendamento sem data cai no dia da conversa — a tela diz quantos são (o gráfico diário fica deslocado para eles)
      n === 1 && c.agendaSemData > 0 ? h("span", { class: "rel-nota ads-agenda-sem-data" }, `${N.int(c.agendaSemData)} sem data (contados no dia da conversa)`) : null)));
    corpo.append(trilha);

    // régua de 4 KPIs
    // AD-116: meta 0 (salva pelo clássico) não divide — sem meta > 0 não há «% acima/abaixo»
    const meta = M.CFG.cpaAlvo, dif = Number.isFinite(t.cpa) && meta > 0 ? Math.abs(t.cpa - meta) / meta * 100 : null;
    // F4: o Google conta conversões (às vezes 1,5); só Meta = conversas no WhatsApp
    // (revisão: por GASTO ou conversão — Google que gastou sem registrar conversão também mistura o custo e não é «(Meta)»)
    const temG = !S.plat ? M.linhasDe(P.de, P.ate, { plat: "google" }).some(l => (+l.gasto || 0) > 0 || (+l.conversoes || 0) > 0) : S.plat === "google";
    const fmtConv = v => (Number.isInteger(v) ? N.int(v) : N.dec(v, 1));
    const kpis = L.kpisAnuncios(P, { meta, dif, temGoogle: temG, gestor: eGestor(ctx), brl0: N.brl0, brl: N.brl, dec: N.dec, pc: N.pc, int: N.int });
    // item 49 (Ads): cada KPI com a sparkline dos dias do período (o CPA não tem série diária honesta: fica sem)
    const tend = L.serieTendencia(M, { dias: S.dias, plat: S.plat });
    const sparkDe = campo => (campo ? tend.map(d => d[campo]) : []);
    // plano 100 (A12/F1): os 4 cartões são ui.kpi — a receita estimada pelo ticket configurado sai com estimativa:true (selo «estimado», «≈»)
    const regua = h("div", { class: "rel-kpis rel-kpis-4 ads-kpis" });
    kpis.forEach((k, n) => {
      const v = L.variacao(k.v, k.a);
      const cel = ui.kpi({ rotulo: k.l, valor: Number.isFinite(k.v) ? k.v : null, formato: k.f === "conv" ? fmtConv : k.f, serie: k.serie ? sparkDe(k.serie) : null,
        variacao: v == null ? null : { valor: v / 100, invertido: k.s === "baixo", sr: `${v >= 0 ? "subiu" : "caiu"} ${N.pc(Math.abs(v), 0)} em relação a ${L.rotuloPeriodo(S.dias).antes}` },
        ajuda: k.ajuda, estimativa: !!k.estimativa });
      cel.classList.add("rel-entra", ...(k.s === "neutro" ? ["ads-kpi-neutro"] : []));
      cel.style.setProperty("--i", String(n + 2));
      cel.dataset.kpi = k.id;
      if (k.medidor) {
        const w = Number.isFinite(t.cpa) ? Math.min(t.cpa / (meta * 2), 1) * 100 : 0;
        const med = h("span", { class: `rel-medidor rel-m-${L.nivelCpa(t.cpa, meta, t.gasto)}`, "aria-hidden": "true" }, h("i"), h("b"));   // plano 1000b · AB-220: sem title morto num elemento escondido (o texto equivalente está no extra)
        med.style.setProperty("--w", `${w.toFixed(1)}%`);
        cel.append(med);
      }
      if (k.extra) cel.append(h("span", { class: "rel-kpi-extra" }, k.extra));
      regua.append(cel);
    });
    corpo.append(regua);
    // plano 1000 (AD-131/AD-153): conversões da plataforma ≠ conversas no CRM ≠ criados de Vendas — o porquê, a um toque
    corpo.append(h("details", { class: "rel-cartao rel-entra ads-por-que" }, h("summary", {}, "Por que os números da plataforma e do CRM diferem?"),
      h("ul", { class: "ads-por-que-lista" }, L.POR_QUE_DIFERE.map(t => h("li", {}, t)))));

    // item 45: tendência investimento × conversas × agendamentos (2 eixos, legenda clicável, teclado) + tabela/CSV/PNG
    const alvoT = h("div", { class: "rel-grafico" });
    const rodapeT = h("div", { class: "rel-cartao-rodape" });
    const totT = tend.reduce((a, d) => ({ g: a.g + d.gasto, c: a.c + d.conversas, ag: a.ag + d.agendadas }), { g: 0, c: 0, ag: 0 });
    const resumoT = resumoTendencia(periodoTexto, totT, { brl0: N.brl0, int: N.int });   // plano 1000b · AB-039: plural
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
        botaoPng({ h, alvo: alvoT, ...pngDe("tendencia", "Tendência: investimento × conversas × agendamentos", P, M), L, titulo: "Tendência", aoFalhar: t => ui.toast(t, { tipo: "nota" }), aoPronto: t => ui.toast(t, { tipo: "ok", ms: 2000 }) }));   // AB-068
    } else alvoT.append(h("p", { class: "rel-vazio-txt" }, "Ainda não há dias suficientes para desenhar a tendência."));
    corpo.append(cartaoT);

    // gráfico diário + coluna lateral (plataformas e orçamento do mês)
    const serie = L.serieDiaria(M, { dias: S.dias, plat: S.plat });
    const alvoG = h("div", { class: "rel-grafico" });
    const rodape = h("div", { class: "rel-cartao-rodape" });
    // plano 1000b · AB-036: a legenda lista só as plataformas com números (quem só anuncia no Google não vê «Meta»)
    const comNumeros = new Set(platsDisponiveis(M).map(([v]) => v));
    const naLegenda = p => (S.plat ? S.plat === p : comNumeros.has(p));
    const legenda = h("ul", { class: "g-legenda", "aria-hidden": "true" },
      (naLegenda("meta") ? h("li", {}, h("i", { class: "g-marca g-meta" }), "Meta") : null),
      (naLegenda("google") ? h("li", {}, h("i", { class: "g-marca g-google" }), "Google") : null),
      h("li", {}, h("i", { class: "g-marca g-linha-m g-linha-texto" }), "Conversões da plataforma (média móvel de 7 dias)"),
      h("li", {}, h("i", { class: "g-marca g-ant-m" }), `período anterior (${L.rotuloPeriodo(S.dias).antes})`));
    const cartaoG = h("div", { class: "rel-cartao ads-cartao-g rel-entra" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, "Investimento diário × conversões da plataforma"),
        // AD-117: o que este gráfico tem que a Tendência não tem
        h("p", { class: "rel-nota ads-diario-dif" }, "O investimento dividido por plataforma e comparado com o período anterior; a linha são as conversões contadas pelo próprio Meta/Google (a Tendência acima mostra o que chegou ao CRM)."), legenda),
      alvoG, rodape);
    const tot = { g: 0, conv: 0 };
    serie.atual.forEach(d => { tot.g += d.gasto; tot.conv += d.conv; });
    graficos.push(G.grafDiario(alvoG, {
      serie: serie.atual, anterior: serie.anterior, rotuloDia: M.ddmm,
      diaLongo: i => `${L.SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`,
      fmtGasto: N.brl, fmtGastoCurto: N.brl0, fmtNum: N.int,
      // plano 1000b · AB-040: 7,5 conversões do Google não viram «8» para o leitor de tela
      resumo: `${periodoTexto}. Investimento diário total ${N.brl0(tot.g)}; ${fmtConv(tot.conv)} conversões da plataforma no período. A linha do gráfico usa a média móvel de 7 dias`,
    }));
    G.alternarTabela(rodape, alvoG, {
      legenda: `${periodoTexto}; valores diários`,
      colunas: ["Dia", "Investimento Meta", "Investimento Google", "Conversões da plataforma", "Custo por conversão Ads"],
      linhas: serie.atual.map(d => [M.dataBR(d.i), N.brl(d.meta), N.brl(d.google), fmtConv(d.conv), d.conv ? N.brl(d.gasto / d.conv) : "—"]),   // AD-100: 1,5 não vira 2
    });
    // plano 1000b · AB-041: o CSV leva o custo por conversão que a tabela mostra (número cru; vazio sem conversão)
    rodape.append(botaoCsv("investimento-diario", ["Dia", "Investimento Meta", "Investimento Google", "Conversões Ads", "Custo por conversão Ads"],
      () => serie.atual.map(d => [M.dataBR(d.i), Math.round(d.meta * 100) / 100, Math.round(d.google * 100) / 100, d.conv, d.conv ? Math.round(d.gasto / d.conv * 100) / 100 : ""]), "Investimento diário"),
      botaoPng({ h, alvo: alvoG, ...pngDe("investimento-diario", "Investimento diário × conversões da plataforma", P, M), L, titulo: "Investimento diário", aoFalhar: t => ui.toast(t, { tipo: "nota" }), aoPronto: t => ui.toast(t, { tipo: "ok", ms: 2000 }) }));   // AB-068

    const lado = h("div", { class: "ads-lado" });
    // Meta × Google
    if (!S.plat) {
      const { de, ate } = L.janela(M, S.dias);
      const pl = ["meta", "google"].map(p => ({ p, t: M.consolidar(M.linhasDe(de, ate, { plat: p })), c: M.crmTot(de, ate, { plat: p }) })).filter(x => x.t.gasto > 0 || x.c.conversas > 0);
      if (pl.length) {
        const maxG = Math.max(1, ...pl.map(x => x.t.gasto));
        // item 48: rosca da divisão do investimento (ordem fixa Meta → Google: as cores das fatias casam com as marcas)
        const alvoD = h("div", { class: "ads-donut-plat" });
        const fatias = ["meta", "google"].map(p => { const x = pl.find(y => y.p === p); return { rotulo: L.nomePlat(p), valor: x ? x.t.gasto : 0, extra: x ? L.textoConvPlat(p, x.t, { int: N.int, dec: N.dec, brl: N.brl }) : "sem investimento" }; });
        // plano 1000b · AB-246: gasto de plataforma desconhecida (somado em «outras», AD-002) entra no total diário — e agora na rosca também
        const fOutras = fatiaOutras(M.consolidar(M.linhasDe(de, ate)).gasto, pl.reduce((s, x) => s + x.t.gasto, 0), N.brl0);
        if (fOutras) fatias.push(fOutras);
        const totalD = fatias.reduce((s, f) => s + f.valor, 0);
        const donut = typeof G.donut === "function" ? G.donut : G.rosca;
        if (totalD > 0) graficos.push(donut(alvoD, { resumo: `Divisão do investimento: ${fatias.map(f => `${f.rotulo} ${N.brl0(f.valor)}`).join(", ")}`, fatias, fmt: N.brl0,
          centro: L.centroRosca(fatias) }));   // AD-093: a plataforma com mais investimento (antes «0% no Meta» para quem só usa Google)
        lado.append(h("div", { class: "rel-cartao ads-plats rel-entra" }, h("h2", { class: "rel-h2" }, "Por plataforma"),
          h("p", { class: "rel-nota" }, `${periodoTexto}. Os eventos do CRM usam suas próprias datas e não são o denominador do CPA da plataforma.`),
          alvoD,
          h("ul", { class: "ads-plat-lista" }, pl.map(x => {
            const barra = h("span", { class: `ads-plat-barra g-${x.p}` });
            barra.style.setProperty("--w", `${(x.t.gasto / maxG * 100).toFixed(1)}%`);
            return h("li", {},
              h("span", { class: "ads-plat-nome" }, h("i", { class: `g-marca g-${x.p}` }), L.nomePlat(x.p)),
              h("span", { class: "ads-plat-trilho" }, barra),
              // plano 1000b · AB-037: plural pelo número em cada termo («1 conversa registrada», não «1 conversas registradas»)
              h("span", { class: "ads-plat-num" }, `${N.brl0(x.t.gasto)} · ${L.textoConvPlat(x.p, x.t, { int: N.int, dec: N.dec, brl: N.brl })} · CRM: ${N.int(x.c.conversas)} ${x.c.conversas === 1 ? "conversa registrada" : "conversas registradas"}, ${N.int(x.c.agendadas)} ${x.c.agendadas === 1 ? "agendamento" : "agendamentos"}, ${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechamento" : "fechamentos"}`));
          }))));
      }
    }
    // orçamento do mês (todas as plataformas)
    // plano 1000 (AD-001/AD-007): sem orçamento definido (null ou 0) o cartão mostra só o gasto do mês — sem barra, sem «acima/abaixo»
    if (!(Number(M.CFG.orcamento) > 0)) {
      const m0 = M.ritmoMes(M.R);
      lado.append(cartaoSemOrcamento(m0));
      corpo.append(h("div", { class: "ads-grade" }, cartaoG, lado));
    } else {
      const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, m.cedo ? m.gasto : m.proj, 1) * 1.08;
      const acima = !m.cedo && m.proj > orc * 1.02, noLimite = !m.cedo && !acima && m.proj >= orc * .98;
      // plano 1000 (AD-006): nos 4 primeiros dias a projeção linear é ruído — o cartão diz «cedo para projetar»
      const msg = m.restam === 0 ? `Mês fechado em ${N.brl0(m.gasto)}.`
        : m.cedo ? `Cedo para projetar: com ${m.pass} ${m.pass === 1 ? "dia" : "dias"} de mês a conta ainda oscila muito. A projeção aparece a partir do dia ${N.DIAS_MIN_PROJECAO || 5}.`
        // plano 1000b · AB-225: diz para quanto ajustar o orçamento diário (antes só «segurar R$ X por dia»)
        : acima ? `No ritmo atual o mês fecha ${N.brl0(m.proj - orc)} acima do orçamento — segurar ${N.brl((m.proj - orc) / m.restam)} por dia resolve. ${diarioSugerido(orc, m.gasto, m.restam) > 0 ? `Orçamento diário sugerido: ${N.brl(diarioSugerido(orc, m.gasto, m.restam))} (somando as plataformas).` : "O orçamento do mês já foi todo usado."}`
        : noLimite ? `No limite: o mês deve fechar em ${N.brl0(m.proj)}, praticamente no orçamento.`
        : `Dentro do orçamento: o mês deve fechar em ${N.brl0(m.proj)} (sobram ${N.brl0(orc - m.proj)}).`;
      const descrOrcamento = descricaoOrcamentoMensal(m, M.dataBR, N.brl0);
      // plano 1000b · AB-250: rótulo curto na barra (os ~200 caracteres da descrição já estão no parágrafo acima, ligado por aria-describedby)
      const barra = h("div", { class: `ads-orc-barra${acima ? " acima" : ""}`, role: "img", "aria-describedby": "ads-orc-descr",
        "aria-label": `${N.brl0(m.gasto)} de ${N.brl0(orc)}${m.cedo ? "" : `; projeção ${N.brl0(m.proj)}`}` }, h("i"), h("u"), h("b"));
      barra.style.setProperty("--w", `${(m.gasto / escala * 100).toFixed(1)}%`);
      barra.style.setProperty("--wp", m.cedo ? "0%" : `${(Math.max(0, m.proj - m.gasto) / escala * 100).toFixed(1)}%`);
      barra.style.setProperty("--m", `${(orc / escala * 100).toFixed(1)}%`);
      lado.append(h("div", { class: "rel-cartao ads-orc rel-entra" },
        h("h2", { class: "rel-h2" }, "Orçamento do mês"),
        h("p", { id: "ads-orc-descr", class: "rel-nota" }, descrOrcamento),
        h("p", { class: "ads-orc-n" }, num(m.gasto, N.brl0), h("span", {}, ` de ${N.brl0(orc)}`)),
        barra,
        h("p", { class: "ads-orc-leg rel-nota" }, h("span", {}, `real ${N.brl0(m.gasto)} até ontem`), h("span", {}, m.cedo ? "projeção a partir do 5º dia" : `projeção linear ${N.brl0(m.proj)}`), h("span", {}, `orçamento mensal ${N.brl0(orc)}`)),
        h("p", { class: `ads-orc-msg${acima ? " rel-txt-aten" : ""}` }, msg)));
      corpo.append(h("div", { class: "ads-grade" }, cartaoG, lado));
    }
    function cartaoSemOrcamento(m0) {
      return h("div", { class: "rel-cartao ads-orc ads-orc-sem rel-entra" },
        h("h2", { class: "rel-h2" }, "Investimento do mês"),
        h("p", { class: "rel-nota" }, descricaoOrcamentoMensal(m0, M.dataBR, N.brl0)),
        h("p", { class: "ads-orc-n" }, num(m0.gasto, N.brl0), h("span", {}, " investidos")),
        h("p", { class: "ads-orc-msg rel-nota" }, "Orçamento do mês não definido: sem ele não há projeção contra a meta nem aviso de ritmo.",
          eGestor(ctx) ? [" ", h("a", { class: "rel-link", href: "#/config/anuncios" }, "Definir em Ajustes de anúncios")] : null));
    }

    // item 46: funil anúncio → conversa → agenda → venda, por plataforma (com a plataforma filtrada, só ela)
    const fp = L.funilPorPlataforma(M, { dias: S.dias }).filter(x => !S.plat || x.plat === S.plat);
    const cartaoF = h("section", { class: "rel-cartao rel-entra ads-cartao-fp", "aria-labelledby": "ads-fp-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-fp-h", class: "rel-h2" }, "Do anúncio à venda, por plataforma"),
        h("p", { class: "rel-nota" }, `${periodoTexto}. A conversão do anúncio é contada pela plataforma; conversas, agendamentos e fechamentos vêm do CRM, cada um na sua data — a taxa entre etapas é uma leitura de ritmo, não uma coorte.`)),
      criarFunilPlataformas({ h, dados: fp, fmtInt: N.int, fmtConv, fmtMoeda: N.brl0, pctTxt: v => N.pc(v, 0), taxaTxt: pct => L.taxaFunilTxt(pct, v => N.pc(v, 0)) }));
    if (fp.length) cartaoF.append(h("div", { class: "rel-cartao-rodape" }, botaoCsv("funil-plataformas", ["Plataforma", "Investimento", "Conversões do anúncio", "Conversas CRM", "Agendaram", "Fecharam", "Receita"],
      () => fp.map(p => [p.nome, Math.round(p.gasto * 100) / 100, ...p.etapas.map(e => e.v), Math.round(p.receita * 100) / 100]), "Do anúncio à venda, por plataforma")));

    // F3: calor dia × HORA quando o nx_dados manda hora_conversa (contrato 5); RPC antiga → calor dia × semana (item 47)
    const ch = L.calorHora(M, { dias: S.dias, plat: S.plat });
    // 7 × 24 pede a largura toda: funil e calor um embaixo do outro
    if (ch.disponivel) { corpo.append(cartaoF, cartaoCalorHora(ch, periodoTexto)); return; }
    const cal = L.calorSemanal(M, { dias: S.dias, plat: S.plat, campo: "conversas" });
    const resumoC = cal.melhorDow == null ? "Nenhuma conversa de anúncio no período." : `Conversas de anúncio por dia da semana e semana; ${L.SEMANA[cal.melhorDow]} é o dia mais forte (${N.int(cal.porDow[cal.melhorDow])} no período).`;
    const alvoC = h("div", { class: "rel-grafico" }), rodapeC = h("div", { class: "rel-cartao-rodape" });
    const cartaoC = h("section", { class: "rel-cartao rel-entra ads-cartao-cal", "aria-labelledby": "ads-cal-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-cal-h", class: "rel-h2" }, "Em que dias as conversas chegam"),
        h("p", { class: "rel-nota" }, cal.melhorDow == null ? "Sem conversas atribuídas a anúncios neste período." : `${resumoC} O servidor ainda não manda a hora da conversa; por isso a leitura é por dia.`)),
      alvoC, rodapeC);
    if (cal.max > 0) {
      alvoC.append(criarCalorSemanal({ h, calor: cal, dias: L.SEMANA, fmt: v => `${N.int(v)} ${v === 1 ? "conversa" : "conversas"}`, nivel: G.nivelCalor, resumo: resumoC }));
      G.alternarTabela(rodapeC, alvoC, { legenda: "Conversas de anúncio por dia da semana e semana", colunas: ["Dia", ...cal.semanas.map(s => `sem. ${s.rotulo}`), "Total"],
        linhas: [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...cal.matriz[d].map(v => N.int(v)), N.int(cal.porDow[d])]) });
    } else alvoC.append(h("p", { class: "rel-vazio-txt" }, "Quando as primeiras conversas chegarem, o mapa mostra os dias mais fortes."));
    corpo.append(h("div", { class: "ads-grade-2" }, cartaoF, cartaoC));
  }

  /** F3: «Quando as conversas de anúncio chegam» — dia da semana × hora (São Paulo), G.calor com rótulo de 1 h no desktop e 3 h no celular. */
  function cartaoCalorHora(ch, periodoTexto) {
    const pico = L.picoCalor(ch.matriz), fx = L.faixasCalor(ch.matriz);
    const resumo = pico ? `Conversas de anúncio por dia e hora; o pico é ${L.SEMANA[pico.dow]} às ${String(pico.hora).padStart(2, "0")}h (${N.int(pico.qtd)} no período).` : "Nenhuma conversa de anúncio com hora no período.";
    const alvo = h("div", { class: "rel-grafico" }), rodape = h("div", { class: "rel-cartao-rodape" });
    const sub = pico ? `${periodoTexto}. Pela hora da 1ª mensagem (São Paulo).${ch.semHora ? ` ${N.int(ch.semHora)} sem mensagem registrada ficam de fora.` : ""}` : "Sem conversas atribuídas a anúncios neste período.";
    const cartao = h("section", { class: "rel-cartao rel-entra ads-cartao-cal", "aria-labelledby": "ads-cal-h" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ads-cal-h", class: "rel-h2" }, "Quando as conversas de anúncio chegam"), h("p", { class: "rel-nota" }, sub)),
      alvo, rodape);
    if (ch.total > 0) {
      // plano 1000 (AD-118): no celular as 24 colunas rolavam na horizontal sem aviso — lá o padrão é dia × faixa do dia (4 colunas),
      // com «Ver por hora» para quem quiser o detalhe; no computador abre por hora, com «Ver por faixa»
      const fmtC = v => `${N.int(v)} ${v === 1 ? "conversa" : "conversas"}`;
      const mf = matrizFaixasCalor(ch.matriz);
      const caixaFx = h("div", { class: "ads-cal-faixas" }, criarCalorSemanal({ h, calor: mf, dias: L.SEMANA, fmt: fmtC, nivel: G.nivelCalor, resumo: `${resumo} Por faixa do dia.`, tituloCol: r => r }));
      const caixaHora = h("div", { class: "ads-cal-hora" });
      const mq = typeof matchMedia === "function" ? matchMedia("(max-width: 760px)") : null;
      const celular = !!(mq && mq.matches);
      let modo = celular ? "faixas" : "hora", escolheuModo = false;
      // plano 1000b · AB-062: o botão diz o estado (aria-pressed = por hora) e o que controla
      if (!alvo.id) alvo.id = "ads-cal-alvo";
      const btModo = h("button", { type: "button", class: "g-ver-tabela ads-cal-modo", "aria-controls": alvo.id });
      // plano 1000b · AB-189: as 168 células por hora só são desenhadas na primeira vez que o modo hora aparece (no celular abre em faixas)
      let desenhouHora = false;
      const garantirHora = () => { if (modo !== "hora" || desenhouHora) return; desenhouHora = true; graficos.push(G.calor(caixaHora, { matriz: ch.matriz, dias: L.SEMANA, fmt: fmtC, resumo })); };
      const pintarModo = () => { garantirHora(); alvo.classList.toggle("ads-cal-modo-faixas", modo === "faixas"); alvo.classList.toggle("ads-cal-modo-hora", modo === "hora"); btModo.textContent = modo === "faixas" ? "Ver por hora" : "Ver por faixa do dia"; btModo.setAttribute("aria-pressed", String(modo === "hora")); };
      btModo.addEventListener("click", () => { escolheuModo = true; modo = modo === "faixas" ? "hora" : "faixas"; pintarModo(); });
      // plano 1000b · AB-061: girar o tablet ou redimensionar troca o modo enquanto a pessoa não escolheu à mão (antes decidido uma vez)
      if (mq && typeof mq.addEventListener === "function") {
        const aoMudarTela = e => { if (escolheuModo || !alvo.isConnected) return; const novo = e.matches ? "faixas" : "hora"; if (novo !== modo) { modo = novo; pintarModo(); } };
        mq.addEventListener("change", aoMudarTela);
        graficos.push({ destruir() { mq.removeEventListener("change", aoMudarTela); } });
      }
      alvo.append(caixaFx, caixaHora);
      pintarModo();
      rodape.append(btModo);
      const forte = fx.forte ? fx.faixas.find(x => x.nome === fx.forte.nome) : null;   // a % mora em fx.faixas (fx.forte é a soma crua)
      if (forte) alvo.append(h("p", { class: "rel-nota ads-cal-forte" }, `Faixa mais forte: ${forte.nome} (${forte.pct}% das conversas).`));
      G.alternarTabela(rodape, alvo, { legenda: "Conversas de anúncio por dia da semana e faixa do dia",
        colunas: ["Dia", "Madrugada (0–5h)", "Manhã (6–11h)", "Tarde (12–17h)", "Noite (18–23h)"],
        linhas: [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...[0, 6, 12, 18].map(i => N.int(ch.matriz[d].slice(i, i + 6).reduce((a, x) => a + x, 0)))]) });
      rodape.append(botaoCsv("conversas-por-hora", ["Dia", ...Array.from({ length: 24 }, (_, i) => `${i}h`)], () => [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...ch.matriz[d]]), "Quando as conversas de anúncio chegam"));
    } else alvo.append(h("p", { class: "rel-vazio-txt" }, "Quando as primeiras conversas chegarem, o mapa mostra os horários mais fortes."));
    return cartao;
  }

  /* ---------------- CAMPANHAS ---------------- */
  function abaCampanhas(M, P0 = null) {
    const P = P0 || L.numerosPeriodo(M, { dias: S.dias, plat: S.plat });   // AB-034
    const { linhas, total, outras, semCampanha, pausadas } = L.linhasCampanhas(M, { dias: S.dias, plat: S.plat });
    // AD-259: CTR por campanha, como no clássico (no celular, onde a linha vira cartão, a coluna some)
    const COLS = [["nome", "Campanha"], ["gasto", "Investimento Ads"], ["conv", "Conversões Ads"], ["cpa", "CPA Ads"], ["ctr", "CTR", "Cliques ÷ impressões da plataforma no período."],
      ["ag", "Agendamentos CRM"], ["fe", "Fechamentos CRM"], ["rec", "Receita CRM"], ["roas", "Retorno", "Receita do CRM ÷ investimento em anúncios desta campanha (sem a gestão)."]];
    const cartao = h("div", { class: "rel-cartao rel-entra ads-camp" });
    // plano 1000b · AB-214: fora do cartão (que é redesenhado ao ordenar) — o leitor de tela ouve a nova ordem
    const statusOrdem = h("p", { class: "sr-only ads-camp-ordem", role: "status", "aria-live": "polite" });
    corpo.append(cartao, statusOrdem);
    if (!linhas.length) {
      cartao.append(ui.vazio({ tema: "ads", titulo: "Nenhuma campanha no período", texto: `Nenhuma campanha com investimento ${L.rotuloPeriodo(S.dias).nos}${S.plat ? ` no ${L.nomePlat(S.plat)}` : ""}.` }));
      return;
    }
    const desenharTabela = () => {
      ui.limpar(cartao);
      const rows = L.ordenarCampanhas(linhas, S.ordem.chave, S.ordem.dir);
      const meta = M.CFG.cpaAlvo;
      const linhasDOM = [];
      const estadoCamp = { busca: S.buscaCamp, resultado: S.resultadoCamp, comparacao: [...S.comparacaoCamp], nomesComparacao: S.nomesCamp };
      let painelCampanhas;
      const thead = h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "c-comparar" }, "Comparar"), COLS.map(([k, l, dica]) => {
        const th = h("th", { scope: "col", class: k === "nome" ? "" : "num" });
        if (S.ordem.chave === k) th.setAttribute("aria-sort", S.ordem.dir < 0 ? "descending" : "ascending");
        const b = h("button", { type: "button", class: "rel-ord", title: dica || `Ordenar por ${l.toLowerCase()}` }, l,
          h("span", { class: "rel-ord-seta", "aria-hidden": "true" }, S.ordem.chave === k ? (S.ordem.dir < 0 ? "↓" : "↑") : ""));
        b.addEventListener("click", () => { S.ordem = { chave: k, dir: S.ordem.chave === k ? -S.ordem.dir : (k === "nome" ? 1 : -1) }; gravarLocal(chaveOrdem(ctx.cliente.id), JSON.stringify(S.ordem)); desenharTabela(); cartao.querySelector(`[data-ord="${k}"]`)?.focus(); statusOrdem.textContent = textoOrdemCampanhas(l, k, S.ordem.dir); });   // AD-260 · AB-214
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
          h("i", { class: `rel-ponto rel-ponto-${L.nivelCpa(r.t.cpa, meta, r.t.gasto)}`, title: "CPA das conversões informadas pela plataforma × meta", "aria-hidden": "true" }),
          h("span", { class: "sr-only" }, `${TEXTO_NIVEL_CPA[L.nivelCpa(r.t.cpa, meta, r.t.gasto)] || TEXTO_NIVEL_CPA.neutro}: `),   // plano 1000b · AB-030: o nível também em texto
          h("span", { class: "ads-camp-t" }, h("span", {}, r.c.nome), h("small", {}, h("span", { class: `rel-chip rel-chip-${r.c.plat}` }, L.nomePlat(r.c.plat)),
            // plano 1000 (AD-108): campanha parada parece ativa — selo «pausada» (sem gasto há 3 dias) e o último dia com gasto
            r.pausada ? h("span", { class: "rel-chip rel-chip-neutro ads-camp-pausada", title: `Sem investimento desde ${M.ddmm(r.ultimoGasto)}` }, `pausada · último gasto ${M.ddmm(r.ultimoGasto)}`) : null,
            " · ver criativos")));
        abrir.addEventListener("click", () => criativos(M, r));
        // rótulo visível no celular (cartões sem cabeçalho) e alvo de 44 px; no desktop o texto fica só para leitor de tela
        const alvoComparar = h("label", { class: "ads-camp-comparar-alvo" }, check, h("span", { class: "ads-camp-comparar-txt" }, "Comparar"));
        const tr = h("tr", { style: `--i:${n}` }, h("td", { class: "c-comparar" }, alvoComparar), h("td", { class: "c-nome" }, abrir),
          td("gasto", N.brl0(r.t.gasto), "Investimento Ads"), td("conv", fmtConvG(r.t.conversoes), "Conversões Ads"), td("cpa", N.brl(r.t.cpa), "CPA Ads"), td("ctr", N.pc(r.t.ctr, 2), "CTR"),
          td("ag", N.int(r.k.agendadas), "Agendamentos CRM"), td("fe", N.int(r.k.fecharam), "Fechamentos CRM"), td("rec", N.brl0(r.k.receita), "Receita CRM"),
          td("roas", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—", "Retorno"));
        // plano 1000b · AB-256: no celular a linha vira cartão — tocar nos números também abre os criativos (delegado ao botão do nome,
        // sem outro alvo de foco); toque na caixa «Comparar», num botão ou link segue com o próprio controle
        tr.addEventListener("click", ev => {
          if (!(typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches)) return;
          const t = ev && ev.target;
          if (t && typeof t.closest === "function" && t.closest("button, input, label, a")) return;
          abrir.click();
        });
        linhasDOM.push({ r, tr });
        return tr;
      }));
      const T = total.t;
      // negócios de anúncio sem investimento na janela (pausada, sem campanha identificada): contam na Visão geral e ficam fora do Total
      const temOutras = !!outras && (outras.ag > 0 || outras.fe > 0 || outras.rec > 0);
      // plano 1000 (AD-109): a linha do balde depende do PRÓPRIO balde (antes só aparecia com agendado/fechado/receita: balde só com
      // conversas sumia do rodapé, embora o herói dissesse «Inclui N conversas de anúncio sem campanha»)
      const temBalde = !!semCampanha && (semCampanha.agendadas > 0 || semCampanha.fecharam > 0 || semCampanha.receita > 0 || semCampanha.conversas > 0);
      const temPausadas = !!pausadas && (pausadas.ag > 0 || pausadas.fe > 0 || pausadas.rec > 0);
      const tfoot = h("tfoot", {}, h("tr", {}, h("td", {}, ""), h("th", { scope: "row" }, "Total"),
        td("gasto", N.brl0(T.gasto), "Investimento Ads"), td("conv", fmtConvG(T.conversoes), "Conversões Ads"), td("cpa", N.brl(T.cpa), "CPA Ads"), td("ctr", N.pc(T.ctr, 2), "CTR"),
        td("ag", N.int(total.ag), "Agendamentos CRM"), td("fe", N.int(total.fe), "Fechamentos CRM"), td("rec", N.brl0(total.rec), "Receita CRM"),
        td("roas", Number.isFinite(total.roas) ? `${N.dec(total.roas, 1)}x` : "—", "Retorno")),
        temBalde ? h("tr", { class: "ads-camp-outras ads-camp-balde" }, h("td", {}, ""), h("th", { scope: "row", title: "Negócios com origem de anúncio cuja campanha/anúncio não foi reconhecido (a métrica ainda não chegou, importação sem ids ou utm sem casamento). Entram na Visão geral." }, "Anúncio sem campanha identificada", semCampanha.conversas ? h("small", { class: "ads-balde-conv" }, ` · ${N.int(semCampanha.conversas)} ${semCampanha.conversas === 1 ? "conversa" : "conversas"} no CRM`) : null),
          td("gasto", "—", "Investimento Ads"), td("conv", "—", "Conversões Ads"), td("cpa", "—", "CPA Ads"), td("ctr", "—", "CTR"),
          td("ag", N.int(semCampanha.agendadas), "Agendamentos CRM"), td("fe", N.int(semCampanha.fecharam), "Fechamentos CRM"), td("rec", N.brl0(semCampanha.receita), "Receita CRM"), td("roas", "—", "Retorno")) : null,
        temOutras && (temPausadas || !temBalde) ? h("tr", { class: "ads-camp-outras" }, h("td", {}, ""), h("th", { scope: "row", title: "Negócios de campanhas sem investimento nestes dias (pausadas). Entram na Visão geral." }, "Sem investimento no período"),
          td("gasto", "—", "Investimento Ads"), td("conv", "—", "Conversões Ads"), td("cpa", "—", "CPA Ads"), td("ctr", "—", "CTR"),
          td("ag", N.int(temBalde ? pausadas.ag : outras.ag), "Agendamentos CRM"), td("fe", N.int(temBalde ? pausadas.fe : outras.fe), "Fechamentos CRM"), td("rec", N.brl0(temBalde ? pausadas.rec : outras.rec), "Receita CRM"), td("roas", "—", "Retorno")) : null);
      const periodo = `${M.dataBR(P.de)} a ${M.dataBR(P.ate)}${S.plat ? ` · ${L.nomePlat(S.plat)}` : " · todas as plataformas"}`;
      // filtro e «Limpar» mexem nas MESMAS linhas; o «Total» é das N campanhas do período, então some quando há recorte
      const aplicarVisibilidade = f => {
        const visiveis = new Set(filtrarCampanhas(linhas, f).map(r => String(r.c.id)));
        for (const { r, tr } of linhasDOM) tr.hidden = !visiveis.has(String(r.c.id));
        tfoot.hidden = visiveis.size !== linhasDOM.length;
      };
      // item 48: barras de investimento por campanha; a marcada para comparar fica em destaque e a linha sob o mouse realça a barra
      const barras = criarBarrasCampanhas({ h, linhas, fmtMoeda: N.brl0, fmtInt: N.int, nomePlat: L.nomePlat, convPlat, aoEscolher: r => {
        criativos(M, r);    // AD-231: tocar na barra abre os criativos (comparar é só pela caixa da tabela)
      } });
      for (const { r, tr } of linhasDOM) {
        tr.addEventListener("pointerenter", () => barras.realcar(r.c.id));
        tr.addEventListener("pointerleave", () => barras.realcar(null));
        tr.addEventListener("focusin", () => barras.realcar(r.c.id));
        tr.addEventListener("focusout", () => barras.realcar(null));
      }
      barras.destacar(S.comparacaoCamp);
      painelCampanhas = criarPainelCampanhas({ h, limpar: ui.limpar, linhas, estado: estadoCamp, periodo,
        moeda: N.brl0, moedaCent: N.brl, inteiro: N.int, decimal: n => N.dec(n, 1), conv: fmtConvG,   // AB-004
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
          // AD-103/AD-104/AD-121: cliente no nome do arquivo, plataforma legível e folha de compartilhar no app instalado
          const csv = csvCampanhas(visiveis, { periodo, csv: L.csv, moeda: N.brl0, inteiro: N.int, decimal: n => N.dec(n, 1), nomePlat: L.nomePlat });
          baixarArquivo(new Blob([csv], { type: "text/csv;charset=utf-8" }), L.nomeArquivoExport("campanhas", N.isoDe(M.dataDe(P.de)), N.isoDe(M.dataDe(P.ate)), "csv", ctx.cliente.nome)).then(avisarDownload, () => avisarDownload(false));   // AB-209
        } });
      // plano 1000b · AB-207: a campanha que saiu (sem investimento no período) sai também do estado — o aviso não se repete
      S.comparacaoCamp = [...estadoCamp.comparacao];
      // plano 1000b · AB-057: o painel solta o relógio da busca quando a tela sai (desmontar → soltarGraficos)
      { const p = painelCampanhas; graficos.push({ destruir: () => p.destruir() }); }
      aplicarVisibilidade({ busca: S.buscaCamp, resultado: S.resultadoCamp });
      cartao.append(h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, `Campanhas · ${L.rotuloPeriodo(S.dias).curto}`),
        h("p", { class: "rel-nota" }, "Conversões e CPA vêm do Meta/Google. Conversas, agendamentos, fechamentos e receita vêm do CRM, pela data de cada evento.")),
        painelCampanhas.elemento,
        h("div", { class: "ads-cb-caixa" }, h("h3", { class: "rel-h2 ads-cb-h" }, "Investimento por campanha"),
          h("p", { class: "rel-nota" }, "Toque numa barra para ver os criativos da campanha. Para comparar, marque «Comparar» na tabela."), barras.elemento),
        h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": `Campanhas ${L.rotuloPeriodo(S.dias).nos}` }, h("table", { class: "rel-tabela ads-tabela" },
          h("caption", { class: "sr-only" }, `Campanhas ${L.rotuloPeriodo(S.dias).nos}`), thead, tbody, tfoot)));
    };
    desenharTabela();
    corpo.append(rankingCriativos(M));
  }

  /* Ranking de criativos (P1): investimento do Ads × resultado do CRM, por criativo */
  function rankingCriativos(M) {
    const cartao = h("section", { class: "rel-cartao rel-entra ads-rank", "aria-labelledby": "ads-rank-h", style: "--i:1" });
    const pintar = () => {
      const R = L.rankingCriativos(M, { dias: S.dias, plat: S.plat, por: S.rank, reserva: !S.rankEscolhido });
      ui.limpar(cartao);
      // plano 1000b · AB-044: com o filtro Google, «menor custo por conversão» (rótulo, nota e vazio)
      const RANK = typeof L.rankCriPorPlat === "function" ? L.rankCriPorPlat(S.plat) : L.RANK_CRI;
      const uc = typeof L.unidadeConv === "function" ? L.unidadeConv(S.plat) : { um: "conversa", varios: "conversas" };
      const nomeRank = (RANK.find(([k]) => k === R.por) || RANK[0])[1].toLowerCase();
      cartao.append(h("div", { class: "rel-cartao-topo" },
        h("h2", { id: "ads-rank-h", class: "rel-h2" }, "Ranking de criativos"),
        segmento("Ordenar o ranking", RANK, R.por, v => { S.rank = v; S.rankEscolhido = true; gravarLocal(chaveRank(ctx.cliente.id), v); pintar(); cartao.querySelector('[aria-pressed="true"]')?.focus(); }),
        h("p", { class: "rel-nota" }, R.por === "cpa"
          ? `${R.lista.length === 1 ? `O criativo com menor custo por ${uc.um}` : `Os ${R.lista.length} criativos com menor custo por ${uc.um}`} ${L.rotuloPeriodo(S.dias).nos} (com pelo menos ${L.MIN_CONV_CPA} ${uc.varios}).`
          : `${R.lista.length === 1 ? "O criativo com" : `Os ${R.lista.length} criativos com`} ${nomeRank} ${L.rotuloPeriodo(S.dias).nos}. Fechados e receita vêm do CRM, pelo anúncio que trouxe cada ${voc(ctx, "contato", "contato").toLowerCase()}.`),
        // AD-112: sem receita registrada no período o ranking abriu sozinho pelo custo por conversa — e diz por quê
        R.automatico ? h("p", { class: "rel-nota ads-rank-auto" }, `Nenhum criativo trouxe receita registrada ${L.rotuloPeriodo(S.dias).nos}: mostrando o menor custo por ${uc.um}.`) : null));
      if (!R.lista.length) {
        cartao.append(h("p", { class: "rel-vazio-txt" }, !R.total ? "Nenhum criativo com investimento no período."
          : R.por === "cpa" ? `Nenhum criativo com ${L.MIN_CONV_CPA} ${uc.varios} ou mais no período.`
          : `Nenhum criativo trouxe ${R.por === "receita" ? "receita" : "fechamento"} ${L.rotuloPeriodo(S.dias).nos} ainda. Veja “Menor custo por ${uc.um}”.`));
        return;
      }
      const ol = h("ol", { class: "ads-rank-lista" });
      R.lista.forEach((x, n) => {
        const destaque = R.por === "receita" ? N.brl0(x.c.receita) : R.por === "fechados" ? `${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechado" : "fechados"}` : `${N.brl(x.t.cpa)} por ${x.k.plat === "google" ? "conversão" : "conversa"}`;
        ol.append(h("li", { class: `ads-rank-item${x.pos === 1 ? " ads-rank-1" : ""}`, style: `--i:${n}` },
          h("span", { class: "ads-rank-pos rel-num", "aria-hidden": "true" }, String(x.pos)),
          h("div", { class: "ads-rank-t" },
            // plano 1000b · AB-245: o nome abre a gaveta da campanha (CTR e frequência do criativo sem procurar na tabela)
            h("p", { class: "ads-rank-nome" }, h("span", { class: "sr-only" }, `${x.pos}º: `), x.k.camp && M.CAMP && M.CAMP[x.k.camp]
              ? h("button", { type: "button", class: "ads-rank-abrir", "aria-haspopup": "dialog", title: "Ver os números dos criativos desta campanha",
                on: { click: () => { const r = L.linhaCampanha(M, x.k.camp, { dias: S.dias }); if (r) criativos(M, r); } } }, x.k.nome)
              : x.k.nome),
            h("p", { class: "rel-nota" }, h("span", { class: `rel-chip rel-chip-${x.k.plat}` }, L.nomePlat(x.k.plat)), ` ${x.camp ? x.camp.curto || x.camp.nome : ""}`),
            h("span", { class: "ads-rank-barra", "aria-hidden": "true" }, h("i", { style: { "--w": `${Math.round(x.barra * 100)}%` } }))),
          h("div", { class: "ads-rank-dest" }, h("b", { class: "rel-num" }, destaque),
            h("span", { class: "rel-nota" }, `${N.brl0(x.t.gasto)} investidos · ${convPlat(x.k.plat, x.t.conversoes)} · ${N.int(x.c.agendadas)} agendados`),
            h("span", { class: "rel-nota" }, R.por === "receita" || R.por === "fechados"
              ? `${N.brl(x.t.cpa)} por ${x.k.plat === "google" ? "conversão" : "conversa"} · retorno ${Number.isFinite(x.roas) ? `${N.dec(x.roas, 1)}x` : "—"}`
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
      // plano 1000b · AB-073: sem conversão não há «— cada»
      h("p", { class: "rel-nota" }, `${L.nomePlat(r.c.plat)} · ${L.rotuloPeriodo(S.dias).curto} · ${N.brl0(r.t.gasto)} investidos · ${convPlat(r.c.plat, r.t.conversoes)}${Number.isFinite(r.t.cpa) ? ` · ${N.brl(r.t.cpa)} cada` : ""}`),
      h("div", { class: "ads-cri-resumo" },
        [["Agendados", N.int(r.k.agendadas)], ["Fechados", N.int(r.k.fecharam)], ["Receita", N.brl0(r.k.receita)], ["Retorno", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—"]]
          .map(([l, v]) => h("div", {}, h("span", { class: "rel-kpi-l" }, l), h("b", { class: "rel-num" }, v)))));
    if (!lista.length) corpoG.append(h("p", { class: "rel-vazio-txt" }, "Nenhum criativo com investimento no período."));
    else {
      corpoG.append(h("ul", { class: "ads-cri-lista" }, lista.map(({ k, t, fadiga, ctrBaixo }) => {
        const chips = h("span", { class: "ads-cri-chips" });
        if (fadiga) chips.append(h("span", { class: "rel-chip rel-chip-ruim", title: `frequência nos últimos ${fadiga.janela} dias` }, `cansado · ${N.dec(fadiga.valor, 1)} vezes em ${fadiga.janela}d`));
        if (ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-aten", title: `CTR nos últimos ${ctrBaixo.janela} dias` }, `CTR ${N.pc(ctrBaixo.valor, 2)} em ${ctrBaixo.janela}d`));
        // plano 1000b · AB-045: o selo diz o que foi conferido (antes «ok» vago)
        if (!fadiga && !ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-bom" }, k.plat === "google" ? "sem alerta" : "sem sinal de cansaço"));
        return h("li", { class: "ads-cri-item" },
          h("p", { class: "ads-cri-nome" }, k.nome), chips,
          h("dl", { class: "ads-cri-num" },
            [["Investido", N.brl0(t.gasto)], ["Impressões", N.int(t.impressoes)], ["CTR", N.pc(t.ctr, 2)],
             // plano 1000b · AB-074: o Google não informa frequência — «não se aplica», não «—» (parecia dado faltando)
             ["Frequência", k.plat === "google" ? h("span", { title: "O Google não informa frequência" }, "não se aplica") : Number.isFinite(t.freq) ? N.dec(t.freq, 1) : "—"], [k.plat === "google" ? "Conversões" : "Conversas", fmtConvG(t.conversoes)], [k.plat === "google" ? "Custo/conversão" : "Custo/conversa", N.brl(t.cpa)]]
              .map(([l, v]) => h("div", {}, h("dt", {}, l), h("dd", {}, v)))));
      })));
      // plano 1000b · AB-075: CSV dos criativos (nome do arquivo com o cliente e a campanha)
      const cc = csvCriativos(lista);
      corpoG.append(h("div", { class: "rel-cartao-rodape ads-cri-rodape" }, botaoCsv(`criativos-${r.c.nome}`, cc.colunas, () => cc.linhas, `Criativos de ${r.c.nome}`)));
    }
    ui.gaveta({ titulo: r.c.nome, corpo: corpoG, largura: "g" });
  }

  /* ---------------- RADAR ---------------- */
  function abaRadar(M, dados, R) {
    const u = ultimaLeitura(dados.integracoes || []);   // plano 1000b · AB-076: pelo maior instante, não pela ordem do texto
    const qtd = textoAtivosRadar(R);   // plano 1000b · AB-195: coerente com o selo da aba («1 pede ação · 3 informativos»)
    // item 51: semáforo (vermelho/amarelo/verde) com frase para leigo, ação sugerida e filtro da lista;
    // sem nenhum número de anúncio não há o que avaliar: nível neutro (sem luz verde) e, para quem gere, o caminho para conectar
    const semDados = L.semAnuncios(M);
    const sem = L.semaforoRadar(R, { semDados });
    const statusTxt = semDados ? (sem.nivel === "neutro" ? null : "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar.")
      : u ? `Última leitura dos anúncios: ${L.quandoSP(u)} · ${qtd}.` : `${qtd}.`;
    const lista = h("ul", { class: "ads-alertas" });
    const ordenados = L.ordenarRadar(R);
    // plano 1000b · AB-177: trocar Todos/Ativos/Resolvidos anuncia quantos ficaram (antes a lista mudava em silêncio)
    const statusFiltro = h("p", { class: "sr-only ads-radar-filtro-st", role: "status", "aria-live": "polite" });
    const pintarLista = (filtro, anunciar = false) => {
      ui.limpar(lista);
      const itens = L.filtrarRadar(ordenados, filtro);
      if (anunciar) statusFiltro.textContent = textoFiltroRadar(itens.length, filtro);
      itens.forEach((it, n) => lista.append(it.tipo === "conexao" ? alertaConexao(it, n) : alertaEpisodio(it, n, M, dados)));
      // AD-057: a lista mostra até 12 episódios — o resto é contado, não escondido em silêncio
      if (R.ocultos > 0 && filtro !== "ativos") lista.append(h("li", { class: "rel-nota ads-al-mais" }, `… e mais ${R.ocultos} ${R.ocultos === 1 ? "episódio" : "episódios"} nos últimos 14 dias (os mais antigos).`));
      if (!itens.length) lista.append(h("li", { class: "rel-vazio-txt" }, filtro === "resolvidos" ? "Nenhum alerta resolvido nos últimos 14 dias."
        : semDados ? "Nenhum alerta ainda: o radar vigia a partir da primeira leitura dos anúncios."
        : filtro === "ativos" ? "Nenhum alerta ativo agora. Tudo dentro dos limites." : "Nenhum alerta nos últimos 14 dias. Todas as campanhas dentro dos limites."));
    };
    const semaforo = criarSemaforoRadar({ h, semaforo: sem, icone: n => ui.icone(n), filtro: S.filtroRadar || "todos", aoFiltrar: f => { S.filtroRadar = f; pintarLista(f, true); },
      contagem: { ativos: L.filtrarRadar(ordenados, "ativos").length, resolvidos: L.filtrarRadar(ordenados, "resolvidos").length },   // AB-178
      link: sem.nivel === "neutro" && eGestor(ctx) ? { rotulo: "Conectar em Ajustes de anúncios", href: "#/config/anuncios" } : null });
    if (statusTxt) semaforo.elemento.append(h("p", { class: "ads-radar-status rel-nota" }, h("span", { class: `ads-radar-luz${R.ativos ? " ativo" : ""}`, "aria-hidden": "true" }), statusTxt));
    corpo.append(semaforo.elemento, statusFiltro);
    // do mais grave para o menos (L.ordenarRadar): o crítico ativo está sempre no topo; cada alerta leva barra lateral, ícone e rótulo da gravidade
    pintarLista(S.filtroRadar || "todos");
    const regras = h("ul", { class: "ads-regras" }, M.REGRAS.map(r => {
      const ex = L.explicarRegra(r.id);
      return h("li", { id: idRegra(r.id), tabindex: "-1" },   // plano 1000b · AB-222: o alerta leva até a regra que o gerou
        h("div", {}, h("p", { class: "ads-regra-n" }, r.nome, " ", h("span", { class: `rel-chip rel-chip-${r.sev === "critico" ? "ruim" : r.sev === "alerta" ? "aten" : "info"}` }, L.SEV_NOME[r.sev])),
          h("p", { class: "ads-regra-simples" }, ex.oQue),
          // AD-230: o limite fica visível numa linha (antes só dentro de «Como a regra funciona»)
          h("p", { class: "rel-nota ads-regra-limite" }, h("b", {}, "Limite: "), descreverRegra(r)),
          h("details", { class: "ads-regra-det" }, h("summary", {}, "Por que importa e o que fazer"), h("p", { class: "rel-nota" }, h("b", {}, "Por que importa: "), ex.porque), h("p", { class: "rel-nota" }, h("b", {}, "O que fazer: "), ex.acao))),
        h("span", { class: `rel-chip ${r.ativa ? "rel-chip-bom" : "rel-chip-neutro"}` }, r.ativa ? "ligada" : r.semMeta ? "parada · sem meta" : "desligada"),   // AD-001
        // plano 1000b · AB-196: a regra parada por falta de meta leva quem gere a definir a meta
        !r.ativa && r.semMeta && eGestor(ctx) ? h("a", { class: "rel-link ads-regra-meta", href: "#/config/anuncios" }, "Definir a meta") : null);
    }));
    const log = h("ul", { class: "ads-log" });
    // plano 1000 (AD-058): a gravidade de cada aviso enviado é ícone + rótulo escrito (antes só uma bolinha colorida)
    R.registro.forEach(x => log.append(h("li", { class: "ads-log-item", dataset: { sev: x.sev } },
      h("div", {}, h("p", { class: "ads-al-topo" }, marcaSev(x.sev)), h("p", { class: "ads-al-nome" }, x.nome), h("p", { class: "ads-al-msg" }, x.a.mensagem || ""),
        h("p", { class: "rel-nota" }, `registrado ${x.quando}`, x.envio ? envio(x.envio, " · ") : null),
        // plano 1000b · AB-048: o motivo da falha visível (antes só no title do span)
        x.envio && (x.envio.k === "erro" || x.envio.k === "parcial") && x.envio.erro ? h("p", { class: "rel-nota ads-env-motivo" }, `Motivo: ${x.envio.erro}`) : null))));
    if (!log.childElementCount) log.append(h("li", { class: "rel-vazio-txt" }, "Nenhum aviso enviado ainda."));
    // plano 1000b · AB-077: a lista corta em 10 — diz quantos havia
    const corteLog = L.notaCorte(R.registro.length, R.registroTotal, { um: "aviso", varios: "avisos" });
    if (corteLog) log.append(h("li", { class: "rel-nota ads-al-mais" }, corteLog));
    corpo.append(h("div", { class: "ads-radar-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Alertas dos últimos 14 dias"), lista),
      h("div", { class: "ads-radar-lado" },
        cartaoAparelho(),
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Avisos enviados no WhatsApp"), log),
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Regras do radar"), regras,
          h("p", { class: "rel-nota" }, eGestor(ctx) ? "Metas e regras são ajustadas em Ajustes de anúncios." : "As metas e as regras são definidas pela equipe de gestão.")))));
  }
  /** F14: «Aparelho de WhatsApp» — o que o shell sabe dos números caídos (ctx.canais, contrato A4); repinta quando o pulso muda. */
  function cartaoAparelho() {
    if (!ctx.canais || typeof ctx.canais.caidos !== "function") return null;
    // plano 1000b · AB-046: o cartão não é mais aria-live (era esvaziado e refeito a cada pulso: o leitor relia título e linhas);
    // só a MUDANÇA de nível é anunciada, num status sr-only fora do cartão
    const caixa = h("section", { class: "rel-cartao rel-entra ads-aparelho", "aria-labelledby": "ads-ap-h" });
    const vivoAp = h("p", { class: "sr-only ads-ap-vivo", role: "status", "aria-live": "polite" });
    let nivelAp;   // undefined = a primeira pintura não fala
    const pintar = () => {
      let lista = null;
      try { lista = ctx.canais.caidos(); } catch { lista = null; }
      const a = L.aparelhoRadar(lista);
      const nivel = a ? a.nivel : null;
      if (nivelAp !== undefined && nivel !== nivelAp) vivoAp.textContent = a ? `Aparelho de WhatsApp: ${a.titulo}` : "Aparelho de WhatsApp: tudo conectado de novo.";
      nivelAp = nivel;
      ui.limpar(caixa);
      caixa.hidden = !a;
      if (!a) return;
      caixa.className = `rel-cartao rel-entra ads-aparelho ads-aparelho-${a.nivel}`;
      caixa.append(...[h("p", { class: "rel-olho" }, "Aparelho de WhatsApp"),
        h("h2", { id: "ads-ap-h", class: "rel-h2" }, h("span", { class: "ads-ap-luz", "aria-hidden": "true" }), a.titulo),
        ...a.linhas.map(t => h("p", { class: "rel-nota" }, t)),
        a.nivel === "ruim" && ctx.pode && ctx.pode("admin") ? h("button", { type: "button", class: "rel-btn rel-btn-sec ads-ap-ver", on: { click: () => (typeof ctx.canais.verNumero === "function" ? ctx.canais.verNumero() : ctx.navegar("#/config/numeros")) } }, "Ver número") : null].filter(Boolean));
    };
    pintar();
    if (soltarAparelho) soltarAparelho();
    soltarAparelho = typeof ctx.canais.assinar === "function" ? ctx.canais.assinar(() => { if (caixa.isConnected) pintar(); }) : null;
    return h("div", { class: "ads-aparelho-caixa" }, caixa, vivoAp);   // AB-046: display: contents (a grade do lado não muda)
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
  /** Plano 1000 (AD-046): «Silenciar 7 dias» (gestor) — grava cfg.silenciados {chave: {desde: ontem, ate: ontem + 7}} pelo nx_cliente_salvar
      (o servidor mescla o cfg); o radar, o histórico e o WhatsApp do ciclo respeitam. `periodo` null = reativar. */
  async function silenciarAlerta(M, dados, chave, periodo, botao, { desfazendo = false } = {}) {
    const cli = (dados && dados.cliente) || {};
    if (!cli.id && !ctx.cliente.id) return;
    try {
      // plano 1000b · AB-047: o mapa sai do cfg RELIDO agora (o do cache pode ter até 5 min — outro gestor pode ter silenciado algo
      // nesse meio tempo e o mapa inteiro enviado apagaria o silêncio dele); sem resposta, o do cache como antes
      const salvar = async () => {
        let atual = cli.cfg && cli.cfg.silenciados;
        try { const fresco = await ctx.api.rpcC("nx_dados", { p_dias: 1 }); if (fresco && fresco.cliente && fresco.cliente.cfg) atual = fresco.cliente.cfg.silenciados; } catch { /* segue com o do cache */ }
        const mapa = mapaSilenciados(atual, chave, periodo, N.isoDe(M.dataDe(M.R)));
        return ctx.api.rpc("nx_cliente_salvar", { p_cliente: { id: cli.id || ctx.cliente.id, slug: cli.slug || ctx.cliente.slug, nome: cli.nome || ctx.cliente.nome, cfg: { silenciados: mapa } } });
      };
      await ui.carregando(botao, salvar);
      invalidarCacheAds(ctx.cliente.id);
      // plano 1000b · AB-187: silenciar tem «Desfazer» (reativa na hora); AB-005: um aviso só — o recarregar abaixo é silencioso
      ui.toast(periodo ? `Alerta silenciado até ${periodo.ate.slice(8, 10)}/${periodo.ate.slice(5, 7)}: some do radar e do WhatsApp até lá.` : desfazendo ? "Pronto: o alerta voltou a valer." : "Avisos deste alerta reativados.",
        { tipo: "ok", desfazer: periodo && !desfazendo ? () => silenciarAlerta(M, dados, chave, null, null, { desfazendo: true }) : null });
      await recarregar(true, { silencioso: true });
    } catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível salvar agora.", { tipo: "erro" }); }
  }
  function alertaEpisodio({ ref: e, sev }, n, M, dados) {
    const ex = L.explicarRegra(e.regra);
    // AD-059: o alerta cita a campanha — «Ver campanha» abre a gaveta de criativos com os números dela no período escolhido
    const campId = M ? L.campanhaDoAlerta(M, e.chave) : null;
    const verCamp = campId ? h("button", { type: "button", class: "rel-btn rel-btn-sec ads-al-ver", "aria-haspopup": "dialog",
      on: { click: () => { const r = L.linhaCampanha(M, campId, { dias: S.dias }); if (r) criativos(M, r); } } }, "Ver campanha") : null;
    // AD-046: só regra do núcleo (r1–r6, ritmo) e só para quem gere; o informativo do Google não se silencia (ele já explica o que ligar)
    const silenciavel = M && dados && eGestor(ctx) && e.chave && /^(r[1-6][|]|ritmo$)/.test(e.chave);
    const silenciar = silenciavel && e.ativo ? h("button", { type: "button", class: "rel-btn rel-btn-sec ads-al-silenciar",
      title: "Some do radar e do WhatsApp por 7 dias (as outras regras continuam)",
      on: { click: ev => silenciarAlerta(M, dados, e.chave, { desde: N.isoDe(M.dataDe(M.R)), ate: N.isoDe(M.dataDe(M.R + 7)) }, ev.currentTarget) } }, "Silenciar 7 dias") : null;
    const reativar = silenciavel && e.silenciado ? h("button", { type: "button", class: "rel-btn rel-btn-sec ads-al-reativar",
      on: { click: ev => silenciarAlerta(M, dados, e.chave, null, ev.currentTarget) } }, "Reativar avisos") : null;
    // plano 1000b · AB-222: «Ver a regra» rola até o item da regra (limite, ligar/desligar) e põe o foco nele
    const verRegra = M && M.REGRAS && M.REGRAS.some(r => r.id === e.regra) ? h("button", { type: "button", class: "rel-btn rel-btn-sec ads-al-regra",
      on: { click: () => irParaRegra(e.regra) } }, "Ver a regra") : null;
    return h("li", { class: `ads-al ads-al-${sev}${e.ativo ? "" : " resolvido"}`, dataset: { sev }, style: `--i:${n}` },
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-topo" }, marcaSev(sev), h("span", { class: `rel-chip ${e.ativo ? (sev === "critico" ? "rel-chip-ruim" : "rel-chip-aten") : e.silenciado ? "rel-chip-neutro" : "rel-chip-bom"}` }, e.ativo ? "ativo" : e.silenciado ? "silenciado" : "resolvido")),
        h("p", { class: "ads-al-nome" }, e.nome),
        h("p", { class: "ads-al-msg" }, e.msg),
        e.ativo ? h("p", { class: "ads-al-acao" }, h("span", { class: "rel-olho" }, "O que fazer "), e.acao || ex.acao) : null,
        e.ativo ? h("p", { class: "ads-al-simples rel-nota" }, h("b", {}, "Em palavras simples: "), ex.oQue, " ", ex.porque) : null,
        // plano 1000b · AB-079: plataforma sem leitura — a regra pode ter disparado por falta de número
        e.ressalva ? h("p", { class: "rel-nota ads-al-ressalva" }, ui.icone("info"), " ", e.ressalva) : null,
        h("p", { class: "rel-nota" }, e.desde, e.envio ? envio(e.envio, " · aviso ") : null),
        verCamp || silenciar || reativar || verRegra ? h("div", { class: "ads-al-botoes" }, verCamp, silenciar, reativar, verRegra) : null));
  }
  function irParaRegra(id) {
    const alvo = typeof document !== "undefined" && document.getElementById ? document.getElementById(idRegra(id)) : null;
    if (!alvo) return;
    try { alvo.scrollIntoView({ block: "center", behavior: movReduzido() ? "auto" : "smooth" }); } catch { /* sem layout */ }
    try { alvo.focus({ preventScroll: true }); } catch { /* ok */ }
  }
  const MET = { cpa: "Custo por conversa", ctr: "CTR", freq: "Frequência", conversoes: "Conversas" };
  const OPS = { ">": "acima de", "<": "abaixo de", ">=": "a partir de", "<=": "até" };
  function descreverRegra(r) {
    if (r.descricao) return r.descricao;   // r5/r6 (plano 1000): regras da conta inteira, sem métrica/limite genéricos
    const f = { cpa: N.brl, ctr: x => N.pc(x, 2), freq: x => N.dec(x, 1), conversoes: N.int }[r.metrica] || String;
    return `${MET[r.metrica] || r.metrica} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${N.brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
  }
  function envio(st, antes = "") {
    // plano 1000b · AB-080: o erro original (em inglês) fica no title; a tela mostra o português
    return h("span", { class: `ads-env ads-env-${st.k}`, title: st.erroOriginal || st.erro || st.rotulo }, antes, st.rotulo, " ", h("i", { class: "ads-tique", "aria-hidden": "true" }, st.tique));
  }

  /* ---------------- RELATÓRIOS ---------------- */
  /** Plano 1000b · AB-051: «Enviar de novo» com a MESMA confirmação de Ajustes de anúncios (ads-config.confirmacaoEnvio): destinos
      cadastrados e aviso de relatório zerado; nx_executar nx-relatorio {tipo, cliente, forcar: true}. */
  async function reenviarRelatorio(it, M, dados, botao) {
    let C;
    try { C = await import(`./ads-config.js?v=${ctx.versao}`); } catch { ui.toast("Não foi possível abrir o envio agora.", { tipo: "erro" }); return; }
    const cfg = (dados && dados.cliente && dados.cliente.cfg) || M.CFG || {};
    let gastoDia = null;
    try { gastoDia = it.tipo === "diario" ? M.consolidar(M.linhasDe(M.R, M.R)).gasto : null; } catch { gastoDia = null; }
    const c = C.confirmacaoEnvio({ tipo: it.tipo, cfg, sujo: false, gastoDia, dataDia: M.dataBR(M.R) });
    if (c.bloqueio) { ui.toast(c.bloqueio, { tipo: "nota" }); return; }
    if (!(await ui.confirmar({ titulo: c.titulo, texto: c.texto, rotulo: "Enviar" }))) return;
    try {
      await ui.carregando(botao, ctx.api.rpc("nx_executar", { p_tarefa: "nx-relatorio", p_corpo: { tipo: it.tipo, cliente: (dados && dados.cliente && dados.cliente.id) || ctx.cliente.id, forcar: true } }));
      ui.toast(`Pedido enviado. O ${it.tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp em instantes.`, { tipo: "ok" });
    } catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível enviar agora.", { tipo: "erro" }); }
  }
  function abaRelatorios(M, dados) {
    const lista = L.listaRelatorios(dados.relatorios || []);
    const previas = [];
    if (!L.semAnuncios(M)) {
      const enviado = chave => lista.some(x => x.chave === chave);
      if (!enviado(`diario|${N.isoDe(M.dataDe(M.R))}`))
        previas.push({ chave: "previa|diario", titulo: `Prévia do diário de ${M.dataBR(M.R)}`, previa: true, tipo: "diario", texto: () => M.relDiario(M.R) });
      // plano 1000b · AB-219: prévia de outro dia (escolhido no seletor de 14 dias) — fica na lista enquanto a aba está aberta
      if (S.relDia != null && S.relDia !== M.R && S.relDia >= 0 && !enviado(`diario|${N.isoDe(M.dataDe(S.relDia))}`)) {
        const i = S.relDia;
        previas.push({ chave: `previa|diario|${N.isoDe(M.dataDe(i))}`, titulo: `Prévia do diário de ${M.dataBR(i)}`, previa: true, tipo: "diario", texto: () => M.relDiario(i) });
      }
      const mes = M.mesesDados().filter(x => x.completo).pop();
      if (mes && !enviado(`mensal|${N.isoDe(M.dataDe(mes.de))}`)) previas.push({ chave: "previa|mensal", titulo: `Prévia do resumo de ${L.MESES[mes.mes]}`, previa: true, tipo: "mensal", texto: () => M.relMensal(mes) });
    }
    const itens = [...lista, ...previas];
    const ultimoDiario = L.semAnuncios(M) ? "" : N.isoDe(M.dataDe(M.R));
    const ultimoMesC = L.semAnuncios(M) ? null : M.mesesDados().filter(x => x.completo).pop();
    const ultimoMes = ultimoMesC ? N.isoDe(M.dataDe(ultimoMesC.de)) : "";
    if (!itens.length) {
      corpo.append(ui.vazio({ titulo: "Nenhum relatório ainda", texto: "O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios." }));
      return;
    }
    if (!S.rel || !itens.some(i => i.chave === S.rel)) S.rel = itens[0].chave;
    const ul = h("ul", { class: "ads-rel-lista", role: "list" });
    const tela = h("div", { class: "ads-fone" });
    const statusLeitor = h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    // plano 1000b · AB-056: o status vivo só fala quando a PESSOA escolhe um relatório (antes era preenchido já na montagem da aba)
    const mostrar = (anunciar = false) => {
      // plano 1000b · AB-054: o item aberto é o «atual» (aria-current), não um botão de alternar (aria-pressed)
      for (const b of ul.querySelectorAll("button")) { if (b.dataset.chave === S.rel) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }
      const it = itens.find(i => i.chave === S.rel);
      const st = it.previa ? null : it.envio;
      if (anunciar) statusLeitor.textContent = it.previa ? `${it.titulo}. Prévia ainda não enviada.`
        : `${it.titulo}. ${st?.rotulo || "Status de envio indisponível"}${st?.hora ? ` às ${st.hora}` : ""}.`;
      ui.limpar(tela);
      const texto = it.previa ? it.texto() : it.r.texto || "";
      const bolha = h("div", { class: "ads-bolha" });
      for (const tk of L.tokensWa(texto)) {
        if (tk.t === "br") bolha.append(h("br"));
        else if (tk.t === "b") bolha.append(h("strong", {}, tk.v));
        else if (tk.t === "i") bolha.append(h("em", {}, tk.v));
        else if (tk.t === "s") bolha.append(h("s", {}, tk.v));          // plano 1000b · AB-198
        else if (tk.t === "code") bolha.append(h("code", {}, tk.v));
        else bolha.append(document.createTextNode(tk.v));
      }
      bolha.append(h("span", { class: "ads-bolha-hora" }, st ? (st.hora || st.rotulo) : "prévia", st ? h("i", { class: `ads-tique ads-env-${st.k}`, "aria-hidden": "true" }, ` ${st.tique}`) : null));
      tela.append(...[
        h("div", { class: "ads-fone-topo" }, h("span", { class: "ads-fone-av", "aria-hidden": "true" }, ui.icone("whatsapp")),
          h("span", {}, h("b", {}, it.tipo === "mensal" ? "Resumo do mês" : "Relatório diário"), h("small", {}, it.previa ? "prévia calculada agora com os números do painel" : st ? st.rotulo : ""))),
        // plano 1000b · AB-055: o corpo rola — recebe foco (Tab) para rolar pelo teclado
        h("div", { class: "ads-fone-corpo", tabindex: "0", role: "region", "aria-label": "Texto do relatório" }, bolha),
        // plano 1000b · AB-050: acima de 4.096 caracteres o WhatsApp corta — avisa
        notaLimiteWa(texto, N.int) ? h("p", { class: "rel-nota rel-txt-aten ads-rel-limite" }, notaLimiteWa(texto, N.int)) : null,
        // plano 1000b · AB-248: para quem iria (só quem gere: os números da gestão não chegam a quem não gere)
        eGestor(ctx) && destinosRelatorio(it.tipo, (dados.cliente && dados.cliente.cfg) || {}).length
          ? h("p", { class: "rel-nota ads-rel-destinos" }, `${it.previa ? "Iria para" : "Vai para"}: ${destinosRelatorio(it.tipo, (dados.cliente && dados.cliente.cfg) || {}).join(", ")}`) : null,
        st && st.erro ? h("p", { class: "ads-rel-erro" }, st.erro) : null,
        // plano 1000b · AB-051: o relatório que não saiu é reenviado daqui (gestor; só o mais recente de cada tipo, que é o que o servidor reenvia)
        podeReenviarRelatorio(it, { gestor: eGestor(ctx), ultimoDiario, ultimoMes }) ? h("div", { class: "ads-rel-acoes" }, h("button", { type: "button", class: "rel-btn rel-btn-prim ads-rel-reenviar",
          on: { click: ev => reenviarRelatorio(it, M, dados, ev.currentTarget) } }, "Enviar de novo")) : null,
        // plano 1000 (AD-041): o envio falhou (ou é prévia)? copia o texto cru — com *negrito* e _itálico_ do WhatsApp — e manda à mão
        // plano 1000b · AB-049: sem ui.copiar, a área de transferência do navegador; sem ela, o texto da bolha fica selecionado (Ctrl+C)
        texto ? h("div", { class: "ads-rel-acoes" }, h("button", { type: "button", class: "rel-btn rel-btn-sec ads-rel-copiar",
          on: { click: () => copiarTexto(texto, { ui, aviso: "Texto copiado. É só colar no WhatsApp.", aoFalhar: () => {
            try { const sel = window.getSelection(), r = document.createRange(); r.selectNodeContents(bolha); sel.removeAllRanges(); sel.addRange(r); } catch { /* sem seleção */ }
            if (typeof ui.toast === "function") ui.toast("Não deu para copiar sozinho: o texto ficou selecionado — use Ctrl+C (ou toque e segure).", { tipo: "nota" });
          } }) } }, "Copiar texto")) : null,
        it.ia ? h("p", { class: "rel-nota" }, "Leitura do dia escrita por IA a partir dos números.") : null].filter(Boolean));
    };
    for (const it of itens) {
      const b = h("button", { type: "button", class: "ads-rel-item" },
        h("span", { class: "ads-rel-t" }, it.titulo, it.ia ? h("span", { class: "rel-chip rel-chip-info" }, "IA") : null),
        it.previa ? h("span", { class: "rel-nota" }, "ainda não enviado · prévia") : envio(it.envio));
      b.dataset.chave = it.chave;
      b.addEventListener("click", () => { S.rel = it.chave; mostrar(true); });
      ul.append(h("li", {}, b));
    }
    // plano 1000b · AB-052: sem WhatsApp de destino o diário nunca sai — a aba diz isso (com o caminho para quem gere)
    // (só para gestor: o nx_dados tira waGestor do cfg de quem não gere — nx_cfg_publico —, e a nota sairia sempre)
    const txtSemDestino = eGestor(ctx) ? notaSemDestino((dados.cliente && dados.cliente.cfg) || {}) : "";
    // plano 1000b · AB-053: a lista mostra os 12 mais recentes — diz quantos havia
    const corteRel = L.notaCorte(lista.length, lista.total);
    // plano 1000b · AB-219: prévia do diário de outro dia (os últimos 14) — o clássico tinha, o Órbita só mostrava ontem
    let seletorDia = null;
    if (!L.semAnuncios(M)) {
      const sel = h("select", { class: "ads-rel-dia", "aria-label": "Ver a prévia do diário de outro dia" },
        h("option", { value: "" }, "Prévia de outro dia…"),
        diasPreviaDiario(M.R).map(i => h("option", { value: String(i), selected: S.relDia === i }, `${M.dataBR(i)}${i === M.R ? " (ontem)" : ""}`)));
      sel.addEventListener("change", () => {
        const i = sel.value === "" ? null : Number(sel.value);
        if (i == null || !Number.isInteger(i)) return;
        const iso = N.isoDe(M.dataDe(i)), env = lista.find(x => x.chave === `diario|${iso}`);
        S.relDia = i;
        S.rel = env ? env.chave : i === M.R ? "previa|diario" : `previa|diario|${iso}`;
        ui.limpar(corpo); abaRelatorios(M, dados);
        const foco = corpo.querySelector ? corpo.querySelector(".ads-rel-dia") : null; if (foco) foco.focus();
      });
      seletorDia = h("label", { class: "ads-rel-dia-caixa rel-nota" }, h("span", {}, "Conferir outro dia "), sel);
    }
    const notaDestino = txtSemDestino ? h("p", { class: "rel-nota rel-txt-aten ads-rel-sem-destino" }, txtSemDestino, " ",
      h("a", { class: "rel-link", href: "#/config/anuncios" }, "Abrir Ajustes de anúncios")) : null;
    corpo.append(h("div", { class: "ads-rel-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Relatórios e prévias"), notaDestino, ul,
        corteRel ? h("p", { class: "rel-nota ads-rel-corte" }, corteRel) : null,   // AB-053
        seletorDia,
        h("p", { class: "rel-nota" }, LEGENDA_TIQUES)),   // AB-197
      h("div", { class: "rel-cartao ads-fone-cartao rel-entra" }, tela, statusLeitor)));
    mostrar();
  }

  // plano 1000 (AD-232): a paleta (Ctrl+K) oferece «Ir para o Radar», «Ver campanhas» e «Exportar campanhas (CSV)» enquanto o Anúncios está aberto
  soltarComandos();
  if (ctx.comandos && typeof ctx.comandos.registrar === "function") {
    const exportarCampanhas = () => {
      const it = cache.get(ctx.cliente.id);
      if (!it || L.semAnuncios(it.M)) { ui.toast("Ainda não há campanhas para exportar.", { tipo: "nota" }); return; }
      const P = L.numerosPeriodo(it.M, { dias: S.dias, plat: S.plat }), { linhas } = L.linhasCampanhas(it.M, { dias: S.dias, plat: S.plat });
      const periodo = `${it.M.dataBR(P.de)} a ${it.M.dataBR(P.ate)}${S.plat ? ` · ${L.nomePlat(S.plat)}` : " · todas as plataformas"}`;
      // plano 1000b · AB-059: o mesmo recorte da tela (busca + resultado no CRM) e o toast diz quantas foram
      const sel = campanhasDaTela(linhas, { busca: S.buscaCamp, resultado: S.resultadoCamp });
      if (!sel.lista.length) { ui.toast("Nenhuma campanha corresponde ao filtro da tela.", { tipo: "nota" }); return; }
      const csv = csvCampanhas(sel.lista, { periodo, csv: L.csv, moeda: N.brl0, inteiro: N.int, decimal: n => N.dec(n, 1), nomePlat: L.nomePlat });
      // AB-209: o aviso de quantas foram só quando o arquivo saiu
      baixarArquivo(new Blob([csv], { type: "text/csv;charset=utf-8" }), L.nomeArquivoExport("campanhas", N.isoDe(it.M.dataDe(P.de)), N.isoDe(it.M.dataDe(P.ate)), "csv", ctx.cliente.nome))
        .then(r => (r === false ? ui.toast("Não deu para baixar aqui; abra Campanhas e use «Exportar CSV filtrado».", { tipo: "nota" }) : ui.toast(sel.aviso, { tipo: "ok", ms: 3000 })), () => ui.toast("Não deu para baixar aqui; abra Campanhas e use «Exportar CSV filtrado».", { tipo: "nota" }));
    };
    for (const c of comandosAnuncios({ irRadar: () => ctx.navegar("#/anuncios/radar"), irCampanhas: () => ctx.navegar("#/anuncios/campanhas"), exportarCampanhas })) {
      try { const cancelar = ctx.comandos.registrar(c); if (typeof cancelar === "function") cancelarComandos.push(cancelar); } catch { /* a paleta é um extra */ }
    }
  }
  await recarregar(false);
}
