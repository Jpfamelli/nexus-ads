/* ============================================================
   ÓRBITA — relatorios.js (frente F6) · tela T13 Relatórios
   #/relatorios/vendas      → nx_rel_vendas      (funil, origem, responsável, perdas)
   #/relatorios/atendimento → nx_rel_atendimento (1ª resposta, atendentes, mapa de calor)
   Período 7/30/90 dias ou personalizado (até 1 ano); variação contra o
   período anterior do mesmo tamanho. Gráficos de graficos.js (SVG feito
   à mão, cores só de tokens, "Ver como tabela" em cada um) e CSV por bloco.
   ============================================================ */

const ABAS = [
  { id: "vendas", rotulo: "Vendas", hash: "#/relatorios/vendas" },
  { id: "atendimento", rotulo: "Atendimento", hash: "#/relatorios/atendimento" },
];
const CHAVE = "nx-app-rel";
let L = null, G = null, X = null, montagem = 0, graficos = [];   // X = peças de tela compartilhadas (sparkline, PNG) que moram em anuncios.js
const memo = new Map();   // plano 1500c · AC-171: {chave: {t, r}} das respostas recentes (por cliente, aba, período e filtro)

/** Série diária que alimenta a sparkline de cada KPI (só os que têm dado por dia; os outros ficam sem, nunca inventados). */
export const SPARK_KPI = Object.freeze({ vendas: { criados: "criados", ganhos: "ganhos", receita: "receita" }, atendimento: { novas: "novas", resolvidas: "resolvidas" } });

/** Janela inclusiva imediatamente anterior, com o mesmo número de dias (aritmética UTC, sem desvio de fuso). */
export function janelaComparacao(de, ate) {
  const parse = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? Date.parse(`${s}T00:00:00Z`) : NaN;
  const a = parse(de), b = parse(ate), dia = 86400000;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const dias = Math.floor((b - a) / dia) + 1;
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  return { dias, atual: { de, ate }, anterior: { de: iso(a - dias * dia), ate: iso(a - dia) } };
}

/** Plano 1500c · AC-155: a legenda diz a janela que o SERVIDOR comparou de verdade (r.anterior), não a que o app imagina — «Mês passado»
    comparado com os 31 dias antes aparece como é. Sem r.anterior, a janela de mesmo tamanho (como antes). */
export function textoLegenda({ de, ate, anterior = null, parcial = "", dataBR = v => v } = {}) {
  const j = janelaComparacao(de, ate);
  const ant = anterior && /^\d{4}-\d{2}-\d{2}$/.test(String(anterior.de || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(anterior.ate || "")) ? anterior : j && j.anterior;
  if (!j || !ant) return `${dataBR(de)} a ${dataBR(ate)} · comparação anterior indisponível${parcial}`;
  const n = janelaComparacao(ant.de, ant.ate);
  return `${dataBR(de)} a ${dataBR(ate)} · comparado com ${dataBR(ant.de)} a ${dataBR(ant.ate)} (${n ? n.dias : j.dias} dias)${parcial}`;
}
/** Plano 1500c · AC-155: o mês-calendário anterior de um período que é um mês inteiro (01/10–31/10 → 01/09–30/09); null se não for.
    Pronto para quando o servidor aceitar a janela de comparação (p_de_ant/p_ate_ant). */
export function mesAnteriorDe(de, ate) {
  const m = /^(\d{4})-(\d{2})-01$/.exec(String(de || ""));
  if (!m) return null;
  const fim = new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10);
  if (String(ate || "") !== fim) return null;
  const ini = new Date(Date.UTC(+m[1], +m[2] - 2, 1)).toISOString().slice(0, 10), fimAnt = new Date(Date.UTC(+m[1], +m[2] - 1, 0)).toISOString().slice(0, 10);
  return { de: ini, ate: fimAnt };
}
/** Plano 1500c · AC-159: «Por responsável» por fechamentos (ganhos, depois receita) com a conversão (ganhos ÷ criados, 1 casa) —
    antes a ordem do servidor (receita) e sem taxa. */
// plano 2000d · DA-244: quem saiu da equipe (`ativo === false` ou `removido`, quando o servidor mandar) ganha a marca no nome
export function linhasDono(dono = []) {
  return (dono || []).filter(d => d && typeof d === "object").map(d => {
    const c = +d.criados || 0, g = +d.ganhos || 0;
    const ex = d.ativo === false || !!d.removido || !!d.removido_em;
    const nome = d.nome || "Sem responsável";   // plano 2000d · NX-321: os sem dono ganham nome (antes a linha ficava sem cabeçalho)
    return { ...d, nome: ex ? `${nome} (fora da equipe)` : nome, exEquipe: ex, conversao_pct: c > 0 ? Math.round(g / c * 1000) / 10 : null };
  }).sort((a, b) => (+b.ganhos || 0) - (+a.ganhos || 0) || (+b.receita || 0) - (+a.receita || 0) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}
/** Plano 1500c · AC-160: os parados com valor (quando o servidor manda `valor` por etapa) e a soma. */
export function resumoParados(par = []) {
  const lst = (par || []).filter(p => p && typeof p === "object");
  const temValor = lst.some(p => p.valor != null && Number.isFinite(+p.valor));
  // plano 2000d · DA-245: há quanto tempo o mais antigo está parado (`dias_max`/`dias` por etapa, quando o servidor mandar)
  const dias = lst.map(p => +(p.dias_max ?? p.dias)).filter(v => Number.isFinite(v) && v > 0);
  return { temValor, qtd: lst.reduce((s, p) => s + (+p.qtd || 0), 0), valor: temValor ? lst.reduce((s, p) => s + (+p.valor || 0), 0) : null, diasMax: dias.length ? Math.max(...dias) : null };
}
/** Plano 1500c · AC-161/AC-191: 1ª resposta no CSV com 1 casa (antes «4.2333333») e a mesma em horas (3 dias = 72 h, não «4320»). */
export const minCsv = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? "" : Math.round(+v * 10) / 10);
export const horasCsv = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? "" : Math.round(+v / 60 * 10) / 10);
/** Plano 1500c · AC-171: a resposta do mesmo recorte vale 60 s — trocar Vendas ↔ Atendimento não refaz o pedido (o «Atualizar» refaz). */
// plano 2000d · DA-239: 5 min (30 → 7 → 30 dias em 2 min não refaz o pedido) e o recorte usado volta ao fim da fila (LRU: sai o menos usado)
export const MEMO_MS = 5 * 60 * 1000;
export const memoFresco = (memo, chave, agora = Date.now(), ms = MEMO_MS) => {
  const m = memo && memo.get(chave);
  if (!(m && agora - m.t >= 0 && agora - m.t < ms)) return null;
  if (typeof memo.delete === "function") { memo.delete(chave); memo.set(chave, m); }
  return m.r;
};
/** Plano 1500c · AC-167: o período maior a sugerir quando não há dados (7 → 30, 30 → 90); null no 90 e no personalizado. */
export const periodoMaior = preset => (preset === 7 ? 30 : preset === 30 ? 90 : null);
/** Plano 2000d · DA-240: o porquê da sugestão de período maior (antes só «Veja um período maior»). */
export const textoPeriodoMaior = (preset, maior) => (maior ? `Nada nos últimos ${preset} dias. Em ${maior} dias entram também os negócios que levam mais tempo para andar.` : "");
/** Plano 1500c · AC-190: o que o leitor de tela ouve junto do chip (a seta e a cor sozinhas não dizem se melhorou). */
export function textoSrVar(c) {
  if (!c) return "";
  if (c.novo) return "novo: antes era zero";
  if (c.v == null) return "sem base de comparação";
  const dir = c.v > 0 ? "alta" : c.v < 0 ? "queda" : "estável";
  const julg = c.cls === "bom" ? ", melhorou" : c.cls === "ruim" ? ", piorou" : "";
  return dir === "estável" ? "estável em relação ao período anterior" : `${dir} de ${c.txt} em relação ao período anterior${julg}`;
}
/** Plano 1500c · AC-181: o resumo de vendas do período em texto (para colar no WhatsApp do cliente). */
// plano 2000d · DA-208/DA-209: concordância pelo vocabulário («consultas novas», «fechadas»); `fem` = palavra feminina
// plano 2000d · DA-212/DA-213: com `ads` ({investido, receita, vendas}) — custo de anúncio por venda e «cada R$ 1 virou R$ X»
// plano 2000d · DA-214: zero é zero para todas as linhas (antes «0 fechados» aparecia e «0 perdidos» sumia)
export function textoResumoVendas(r, { de, ate, cliente = "", negocios = "negócios", fem = false, ads = null, int = v => String(v), brl0 = v => `R$ ${v}`, brl = null, pct = v => `${v}%`, dataBR = v => v } = {}) {
  const k = (r && r.kpis) || {}, n = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : +v);
  const g = (um, varios, q) => (+q === 1 ? um : varios).replace(/o(s?)$/, fem ? "a$1" : "o$1");
  const linhas = [`*Vendas${cliente ? ` · ${cliente}` : ""}* — ${dataBR(de)} a ${dataBR(ate)}`];
  if (n(k.criados) != null) linhas.push(`• ${int(k.criados)} ${negocios} ${g("novo", "novos", k.criados)}`);
  if (n(k.ganhos) != null) linhas.push(`• ${int(k.ganhos)} ${g("fechado", "fechados", k.ganhos)}${n(k.receita) != null ? ` · ${brl0(k.receita)} de receita` : ""}`);
  if (n(k.conversao_pct) != null) linhas.push(`• Conversão: ${pct(k.conversao_pct)}`);
  if (n(k.ticket_medio) != null) linhas.push(`• Ticket médio: ${brl0(k.ticket_medio)}`);
  if (n(k.abertos) != null) linhas.push(`• Em aberto agora: ${int(k.abertos)}${n(k.valor_aberto) ? ` (${brl0(k.valor_aberto)})` : ""}`);
  if (n(k.perdidos) != null) linhas.push(`• ${fem ? "Perdidas" : "Perdidos"}: ${int(k.perdidos)}${n(k.valor_perdido) ? ` (${brl0(k.valor_perdido)})` : ""}`);
  const inv = ads && n(ads.investido);
  if (inv != null && inv > 0) {
    const vendas = n(ads.vendas), rec = n(ads.receita), fmt2 = brl || brl0;
    linhas.push(`• Investido em anúncios: ${brl0(inv)}${vendas ? ` · ${fmt2(inv / vendas)} de anúncio por venda que veio de anúncio` : ""}`);
    if (rec != null && rec > 0) linhas.push(`• Cada R$ 1 investido em anúncios virou ${fmt2(rec / inv)} em vendas`);
  }
  return linhas.join("\n");
}

/** Plano 2000d · DA-233: a capa do PDF/papel — o resultado que importa antes das tabelas (vendas: fechados e receita; atendimento:
    conversas, resolvidas e 1ª resposta). Só números que vieram; nada inventado. */
export function linhasCapa(aba, r, { int = v => String(v), brl0 = v => `R$ ${v}`, pct = v => `${v}%`, dur = v => `${v} min`, fem = false } = {}) {
  const k = (r && r.kpis) || {}, ok = v => v !== null && v !== undefined && v !== "" && Number.isFinite(+v);
  const out = [];
  if (aba === "vendas") {
    if (ok(k.ganhos)) out.push(`${int(k.ganhos)} ${+k.ganhos === 1 ? (fem ? "fechada" : "fechado") : (fem ? "fechadas" : "fechados")}${ok(k.receita) ? ` · ${brl0(k.receita)} de receita` : ""}`);
    if (ok(k.conversao_pct)) out.push(`Conversão: ${pct(k.conversao_pct)}`);
    if (ok(k.ticket_medio)) out.push(`Ticket médio: ${brl0(k.ticket_medio)}`);
  } else {
    if (ok(k.novas)) out.push(`${int(k.novas)} ${+k.novas === 1 ? "conversa nova" : "conversas novas"}${ok(k.resolvidas) ? ` · ${int(k.resolvidas)} resolvidas` : ""}`);
    if (ok(k.tpr_mediana_min)) out.push(`1ª resposta (mediana): ${dur(k.tpr_mediana_min)}`);
  }
  return out;
}
/* ---------- plano 2000d · NX-301..NX-331: peças puras da tela (vocabulário, resumos para o leitor de tela, exportações) ---------- */
const okNum = v => v !== null && v !== undefined && v !== "" && Number.isFinite(+v);
const milharPt = v => (okNum(v) ? Math.round(+v).toLocaleString("pt-BR") : "—");
/** plano 2000d · NX-303: o adjetivo masculino singular («criado») na forma do vocabulário — feminino («criada») e plural pelo número. */
export const flexao = (masc, n = 1, fem = false) => { const b = fem ? String(masc).replace(/o$/, "a") : String(masc); return +n === 1 ? b : `${b}s`; };
const cap1 = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
/** plano 2000d · NX-301: «1 negócio aberto» / «3 orçamentos abertos» / «1 venda aberta» (antes sempre o plural: «1 negócios abertos»). */
export function rotuloAbertos(n, { negocio = "negócio", negocios = "negócios", fem = false } = {}) {
  return `${+n === 1 ? negocio : negocios} ${flexao("aberto", n, fem)}`;
}
/** plano 2000d · NX-302: quais valores da «Carteira agora» vieram (sem número não aparece «— previstos» solto). */
export const pedacosCarteira = (k = {}) => ["valor_aberto", "previsao_ponderada", "valor_perdido"].filter(c => okNum((k || {})[c]));
/** plano 2000d · NX-303: o subtítulo do funil no gênero do vocabulário («ganhas e perdidas: fechadas no período»). */
export const subFunil = (fem = false) => `Quantos estão em cada etapa agora (${flexao("ganho", 2, fem)} e ${flexao("perdido", 2, fem)}: ${flexao("fechado", 2, fem)} no período) e quantos seguiram adiante.`;
/** plano 2000d · NX-304: os nomes das séries de vendas («Criadas», «Ganhas») e o «com 1 ganha» do melhor dia. */
export const seriesVendas = (fem = false) => ({ criados: cap1(flexao("criado", 2, fem)), ganhos: cap1(flexao("ganho", 2, fem)), ganhosDe: n => flexao("ganho", n, fem) });
/** plano 2000d · NX-306: as colunas de «Por responsável» (tabela e CSV) no gênero do vocabulário. */
export const colunasDono = (fem = false, csv = false) => ["Responsável", cap1(flexao("criado", 2, fem)), cap1(flexao("ganho", 2, fem)), csv ? "Conversão %" : "Conversão", "Receita", "Ticket médio", `${cap1(flexao("aberto", 2, fem))} agora`];
/** plano 2000d · NX-307: os textos do bloco de parados no gênero do vocabulário. */
export function textosParados({ fem = false, negocios = "Negócios", qtd = 0, diasMax = null, int = milharPt } = {}) {
  return { titulo: `${cap1(flexao("parado", 2, fem))} há mais de 7 dias`, sub: `${negocios} ${flexao("aberto", 2, fem)} que não mudam de etapa há uma semana.`,
    total: `${int(qtd)} ${flexao("parado", qtd, fem)}`,
    antigo: okNum(diasMax) ? `${fem ? "A mais antiga" : "O mais antigo"} está ${flexao("parado", 1, fem)} há ${int(diasMax)} ${+diasMax === 1 ? "dia" : "dias"}.` : "" };
}
/** plano 2000d · NX-308: o que o leitor de tela ouve em cada etapa parada («Proposta: 3 parados, R$ 9.000 previstos»). */
export function rotuloParado(p = {}, { fem = false, int = milharPt, brl0 = v => `R$ ${v}`, temValor = false } = {}) {
  const q = okNum(p.qtd) ? +p.qtd : 0;
  return `${p.nome || "Etapa sem nome"}: ${int(q)} ${flexao("parado", q, fem)}${temValor && okNum(p.valor) ? `, ${brl0(p.valor)} previstos` : ""}`;
}
/** plano 2000d · NX-309: as linhas do CSV dos parados (antes o bloco não exportava). */
export const linhasCsvParados = (par = []) => (par || []).filter(p => p && typeof p === "object").map(p => [p.nome || "", okNum(p.qtd) ? +p.qtd : 0, okNum(p.valor) ? +p.valor : "", okNum(p.dias_max ?? p.dias) ? +(p.dias_max ?? p.dias) : ""]);
/** plano 2000d · NX-310: o resumo do funil para o leitor de tela — sem «Funil : …» quando não há funil escolhido e com milhar. */
export function resumoFunil(nome, etapas = [], int = milharPt) {
  return `${nome ? `Funil ${nome}` : "Funil"}: ${(etapas || []).map(e => `${e.nome} ${int(e.qtd_atual)}`).join(", ")}`;
}
/** plano 2000d · NX-311: o resumo da rosca de perdas com milhar («1.500», não «1500»). */
export const resumoMotivos = (mot = [], int = milharPt) => `Motivos de perda: ${(mot || []).map(m => `${m.nome} ${int(m.qtd)}`).join(", ")}`;
/** plano 2000d · NX-312: o CSV dos motivos com a mesma coluna «%» da tabela (1 casa). */
export function linhasCsvMotivos(mot = []) {
  const tot = (mot || []).reduce((s, m) => s + (+m.qtd || 0), 0);
  return (mot || []).map(m => [m.nome, m.qtd, tot ? Math.round((+m.qtd || 0) / tot * 1000) / 10 : "", m.valor]);
}
/** plano 2000d · NX-313: o CSV do funil igual à tabela — ganho/perdido não «seguem adiante» (antes a taxa da etapa fechada ia para o Excel). */
export const linhasCsvFunil = (funil = []) => (funil || []).map(e => { const ab = (e.tipo || "aberto") === "aberto"; return [e.nome, e.qtd_atual, e.valor_atual, e.passaram, ab ? e.avancaram : "", ab ? (e.conversao_proxima_pct ?? "") : ""]; });
/** plano 2000d · NX-314/NX-315/NX-316: quantidade com plural certo e milhar («1 nova», «1.200 novas»). */
export const qtdPalavra = (n, um, varios, int = milharPt) => `${int(n)} ${+n === 1 ? um : varios}`;
/** plano 2000d · NX-315: o resumo das barras por departamento. */
export const resumoDepartamentos = (dep = [], int = milharPt) => `Por departamento: ${(dep || []).map(d => `${d.nome || "Sem departamento"} ${qtdPalavra(d.novas, "nova", "novas", int)}`).join(", ")}`;
/** plano 2000d · NX-316: o resumo das barras por número. */
export const resumoCanais = (can = [], int = milharPt) => `Por número: ${(can || []).map(c => `${nomeCanal(c)} ${qtdPalavra(c.msgs_in, "recebida", "recebidas", int)} e ${qtdPalavra(c.msgs_out, "enviada", "enviadas", int)}`).join("; ")}`;
/** plano 2000d · NX-316: número sem nome cai no número exibido (antes a barra ficava sem rótulo). */
export const nomeCanal = c => (c && (c.nome || c.numero_exibicao)) || "Número sem nome";
/** plano 2000d · NX-317: a hora dita por extenso («à 1 hora», «à meia-noite», «às 14 horas»; antes «às 1 horas»). */
export function horaFalada(h) {
  const n = Math.trunc(+h);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return n === 0 ? "à meia-noite" : n === 12 ? "ao meio-dia" : n === 1 ? "à 1 hora" : `às ${n} horas`;
}
/** plano 2000d · NX-318/NX-319/NX-320: «Por atendente» em ordem de conversas (depois resolvidas e nome), sem nome vira «Sem atendente» e
    quem saiu da equipe ganha a marca (como o DA-244 no «Por responsável»). */
export function linhasAtendente(at = []) {
  return (at || []).filter(a => a && typeof a === "object").map(a => {
    const ex = a.ativo === false || !!a.removido || !!a.removido_em;
    const nome = a.nome || "Sem atendente";
    return { ...a, nome: ex ? `${nome} (fora da equipe)` : nome, exEquipe: ex };
  }).sort((a, b) => (+b.conversas || 0) - (+a.conversas || 0) || (+b.resolvidas || 0) - (+a.resolvidas || 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}
/** plano 2000d · NX-322/NX-323: a linha de total das tabelas por pessoa (soma de cada campo; conversão = ganhos ÷ criados). */
export function totalLinhas(lista = [], campos = []) {
  const t = {};
  for (const c of campos) t[c] = (lista || []).reduce((s, x) => s + (okNum(x && x[c]) ? +x[c] : 0), 0);
  if ("criados" in t && "ganhos" in t) t.conversao_pct = t.criados > 0 ? Math.round(t.ganhos / t.criados * 1000) / 10 : null;
  if ("receita" in t && "ganhos" in t) t.ticket_medio = t.ganhos > 0 ? t.receita / t.ganhos : null;
  return t;
}
/** plano 2000d · NX-324: quando a resposta guardada do recorte chegou (o «Atualizado às» do memo é o dela, não o da última carga). */
export const horaMemo = (memo, chave) => { const m = memo && memo.get(chave); return m && Number.isFinite(m.t) ? m.t : null; };
/** plano 2000d · NX-327: o nome do chip-resumo para o leitor de tela (antes só «Últimos 30 dias · Todos os funis», sem dizer o que é). */
export const rotuloChip = texto => `Período e filtros: ${texto || "Últimos 30 dias"}. Toque para mudar.`;
/** plano 2000d · NX-330: o funil/departamento escolhido entra no nome do arquivo exportado (dois CSVs de funis diferentes não se confundem). */
export function sufixoFiltro(fe) {
  if (!fe || !fe.atual) return "";
  const x = (fe.lista || []).find(i => i && i.id === fe.atual);
  return x && x.nome ? String(x.nome) : "";
}
/** plano 2000d · NX-331: o título da página durante a impressão — vira o nome sugerido do PDF («Relatório de vendas · Clínica X · 01-10-2026 a 31-10-2026»). */
export function tituloImpressao({ aba = "vendas", cliente = "", de = "", ate = "", filtro = "" } = {}) {
  const br = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
  const per = br(de) && br(ate) ? (de === ate ? br(de) : `${br(de)} a ${br(ate)}`) : "";
  return [`Relatório de ${aba === "atendimento" ? "atendimento" : "vendas"}`, cliente, filtro, per].filter(Boolean).join(" · ").replace(/[\\/:*?"<>|]+/g, "-");
}

/** Plano 1000 (AD-139): sufixo da legenda quando o período termina hoje (dia ainda aberto). */
export function notaHojeParcial(ate, hoje) {
  return ate && hoje && String(ate).slice(0, 10) === String(hoje).slice(0, 10) ? " · hoje conta até agora (dia parcial)" : "";
}

/** Remove filtros do cliente atual sem apagar preferências de outros clientes do mesmo navegador. */
export function limparFiltrosRelatorios(pref = {}, clienteId) {
  return { ...pref, preset: 30, de: null, ate: null,
    ...(pref.periodo ? { periodo: { ...pref.periodo, [clienteId]: { preset: 30, de: null, ate: null } } } : {}),
    funil: { ...(pref.funil || {}), [clienteId]: "" }, dep: { ...(pref.dep || {}), [clienteId]: "" } };
}
/** Plano 1000 (AD-141): o período é guardado POR CLIENTE (antes um só para todos: o 01/09–30/09 de um cliente abria no outro).
    Sem período do cliente, vale o global antigo (preferência de antes desta versão). */
export function periodoDoCliente(pref = {}, clienteId) {
  const p = pref && pref.periodo && pref.periodo[clienteId];
  const base = p && typeof p === "object" ? p : { preset: pref && pref.preset, de: pref && pref.de, ate: pref && pref.ate };
  const preset = [7, 30, 90, "per"].includes(base.preset) ? base.preset : 30;
  // plano 1500c · AC-156: «incluir hoje» (o dia ainda pela metade) é escolha por cliente; padrão: os atalhos terminam ontem
  return { preset, de: preset === "per" ? base.de || null : null, ate: preset === "per" ? base.ate || null : null, ...(p && typeof p === "object" && p.hoje ? { hoje: true } : {}) };
}
/** Plano 1000 (AD-146): «Limpe os filtros» só quando há filtro de verdade — funil/departamento escolhido ou período personalizado
    (7 e 90 dias são atalhos de período, não filtro). */
/** Plano 1000b · AB-014: «12,3%» / «12,3 dias» (no máximo 1 casa, vírgula); vazio/ilegível → «—». */
const FMT_1C = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const numOk = v => v !== null && v !== undefined && v !== "" && Number.isFinite(+v);
export const fmtPct = v => (numOk(v) ? `${FMT_1C.format(+v)}%` : "—");
export const fmtDias = v => (numOk(v) ? `${FMT_1C.format(+v)} ${+v === 1 ? "dia" : "dias"}` : "—");
/** Plano 1000b · AB-088: o texto pequeno do KPI com o valor do período anterior. */
export const notaAnterior = (a, fmt = v => String(v)) => (a === null || a === undefined || a === "" || !Number.isFinite(+a) ? "vs. período anterior" : `antes: ${fmt(+a)}`);
/** Plano 1000b · AB-093: o resumo (aria-label) da rosca «Por origem» com plural certo. */
// plano 2000d · NX-305: `fem` — «1 criada e 1 ganha» no vocabulário feminino (antes sempre «criado/ganho»)
export function resumoOrigens(orig = [], int = v => String(v), { fem = false } = {}) {
  const q = (n, masc) => `${int(n)} ${flexao(masc, n, fem)}`;
  // plano 2000d · DA-246: no fim, anúncio × orgânico somados (antes tudo junto, canal a canal)
  const soma = f => (orig || []).filter(f).reduce((t, o) => ({ c: t.c + (+o.criados || 0), g: t.g + (+o.ganhos || 0) }), { c: 0, g: 0 });
  const an = soma(o => !!o.anuncio), og = soma(o => !o.anuncio);
  const fim = an.c || an.g ? `. De anúncio: ${q(an.c, "criado")} e ${q(an.g, "ganho")}; sem anúncio: ${q(og.c, "criado")} e ${q(og.g, "ganho")}` : "";
  return `Por origem: ${(orig || []).map(o => `${o.rotulo} ${q(o.criados, "criado")} e ${q(o.ganhos, "ganho")}`).join("; ")}${fim}`;
}
export const recorteFiltrado = P => !!P && (P.preset === "per" || !!P.funil || !!P.dep);
/** Plano 1000 (AD-150): o título do mapa de calor com a palavra da vertical («Quando os pacientes chamam»). */
export function tituloQuandoChamam(V = {}) {
  const v = typeof V.min === "function" ? V.min("contatos") : String(V.contatos || "clientes").toLowerCase();
  return `Quando os ${v || "clientes"} chamam`;
}

/** Plano 1000b · AB-201: «Este mês» (desloc 0: dia 1º até hoje) e «Mês passado» (desloc −1: o mês inteiro) — como os atalhos do
    Anúncios (AD-097). `hoje` = AAAA-MM-DD (SP). Preenchem de/ate do período personalizado. */
// plano 2000d · DA-210/DA-211: como os presets (AC-156), «Este mês» termina ONTEM (o dia aberto só com «incluir hoje»); no dia 1º, sem
// dia fechado no mês, «Este mês» é o mês de ontem inteiro (antes: um período de um dia só, hoje pela metade)
export function periodoMes(hoje, desloc = 0, { incluirHoje = false } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hoje || ""));
  if (!m) return null;
  const iso = d => d.toISOString().slice(0, 10);
  const ref = incluirHoje ? hoje : iso(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - 1)));
  const r = /^(\d{4})-(\d{2})-\d{2}$/.exec(ref);
  const base = new Date(Date.UTC(+r[1], +r[2] - 1 + desloc, 1));
  const de = iso(base), fim = iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  return { de, ate: fim < ref ? fim : ref };
}
export const ATALHOS_MES = Object.freeze([["mes", "Este mês", 0], ["mesant", "Mês passado", -1]]);
/** Qual atalho de mês corresponde ao período personalizado atual (para o aria-pressed) — "" se nenhum. */
// plano 2000d · DA-247: reconhece o atalho terminando ontem e também o antigo (até hoje) — preferência salva antes desta versão
export function atalhoMesAtivo(P, hoje) {
  if (!P || P.preset !== "per" || !P.de || !P.ate) return "";
  const a = ATALHOS_MES.find(([, , d]) => [false, true].some(incluirHoje => { const p = periodoMes(hoje, d, { incluirHoje }); return p && p.de === P.de && p.ate === P.ate; }));
  return a ? a[0] : "";
}
/** Plano 2000d · DA-212/DA-213: o investimento em anúncios do período (de/ate AAAA-MM-DD) a partir do conjunto do Anúncios já carregado
    (M do núcleo); null quando o período não cabe nos dias que o Anúncios tem (nunca um número pela metade). */
export function investimentoAdsPeriodo(M, de, ate) {
  if (!M || !Array.isArray(M.DATAS) || typeof M.linhasDe !== "function" || typeof M.consolidar !== "function") return null;
  const p2 = n => String(n).padStart(2, "0");
  const iso = d => (d instanceof Date ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : "");
  const lista = M.DATAS.map(iso);
  const i = lista.indexOf(String(de || "")), j = lista.indexOf(String(ate || ""));
  if (i < 0 || j < 0 || j < i) return null;
  const g = +M.consolidar(M.linhasDe(i, j)).gasto;
  return Number.isFinite(g) ? g : null;
}
/** Plano 1000b · AB-087: «Até» não oferece data antes de «De» (min) e «De» não passa de «Até» nem de hoje (max). */
export function limitesDatas(de, ate, hoje) {
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  return { deMax: ok(ate) && ate < hoje ? ate : hoje, ateMin: ok(de) ? de : "", ateMax: hoje };
}
/** Plano 1000b · AB-085/AB-098: «Atualizar» com números do MESMO recorte na tela não apaga nada (nem a rolagem): fica com aria-busy e
    opacidade até a resposta chegar; se ela falhar, os números ficam e sai um aviso. */
/** Plano 1000b · AB-086: qual campo de data leva a culpa do erro do período — «De» quando falta ou o período passa de 1 ano; senão «Até». */
export const campoDataInvalida = (erro, de) => (erro === "periodo_grande" || !/^\d{4}-\d{2}-\d{2}$/.test(String(de || "")) ? "de" : "ate");
/** Plano 1000b · AB-099: depois disto o «Atualizado às» fica cinza e em itálico (os números podem estar velhos). */
export const HORA_VELHA_MS = 10 * 60 * 1000;
export const manterNaTela = (cargaNaTela, cargaNova, temConteudo) => !!temConteudo && !!cargaNaTela && cargaNaTela === cargaNova;

const lerPref = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch { return {}; } };
const gravarPref = p => { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* modo privado */ } };
function soltar() { for (const g of graficos) try { g.destruir(); } catch { /* ok */ } graficos = []; }
let tirarImpressao = null;   // plano 2000d · NX-331: remove os ouvintes beforeprint/afterprint da montagem anterior

export function desmontar() { montagem++; soltar(); if (tirarImpressao) { try { tirarImpressao(); } catch { /* ok */ } tirarImpressao = null; } }

export async function montar(ctx) {
  desmontar();
  const minha = montagem;
  const { ui } = ctx;
  ui.carregarCss("relatorios.css");
  const aba = ABAS.some(a => a.id === ctx.rota.partes[0]) ? ctx.rota.partes[0] : "vendas";
  ctx.titulo(aba === "vendas" ? "Relatório de vendas" : "Relatório de atendimento");
  ui.limpar(ctx.alvo);
  const raiz = ui.h("section", { class: "rel relat", "aria-labelledby": "relat-h" });
  ctx.alvo.append(raiz);
  if (!L) {
    try { [L, G, X] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`), import(`./anuncios.js?v=${ctx.versao}`)]); }
    catch (e) { raiz.append(ui.erroCartao(e, () => montar(ctx))); return; }
  }
  if (minha !== montagem) return;
  const h = G.criarH(ui);
  const V = ctx.vocab || {};
  const vcap = (k, p) => (V[k] || p);
  const fem = (typeof V.art === "function" ? V.art("negocio") : V.g_negocio) === "a";
  const int = v => (Number.isFinite(+v) && v !== null ? Math.round(+v).toLocaleString("pt-BR") : "—");
  const brl0 = v => ui.brl(v, { centavos: false });
  // plano 1000b · AB-014: porcentagem e dias com no máximo 1 casa (antes «12,345678 dias»)
  const pctTxt = v => fmtPct(v), FMT = { int, brl0, pct: pctTxt, dias: v => fmtDias(v), min: L.duracaoMin, h: L.duracaoH };

  // preferências (período e filtros) por pessoa, neste navegador
  const pref = lerPref();
  const P = {
    ...periodoDoCliente(pref, ctx.cliente.id),     // AD-141: período por cliente
    funil: (pref.funil && pref.funil[ctx.cliente.id]) || "",
    dep: (pref.dep && pref.dep[ctx.cliente.id]) || "",
  };
  const salvar = () => {
    const p = lerPref();
    gravarPref({ ...p, periodo: { ...(p.periodo || {}), [ctx.cliente.id]: { preset: P.preset, de: P.de, ate: P.ate, hoje: !!P.hoje } },
      funil: { ...(p.funil || {}), [ctx.cliente.id]: P.funil }, dep: { ...(p.dep || {}), [ctx.cliente.id]: P.dep } });
  };
  // plano 1500c · AC-156: os atalhos terminam ONTEM (dia fechado contra dias fechados); «Incluir hoje» volta a contar o dia corrente
  const periodo = () => (P.preset === "per" && P.de && P.ate ? { de: P.de, ate: P.ate } : L.periodoPreset(P.preset === "per" ? 30 : P.preset, L.hojeSP(), { incluirHoje: !!P.hoje }));

  // ---------- topo: título, abas, filtros
  const nav = ui.segmentado({ tipo: "abas", rotulo: "Relatórios", valor: aba, classe: "rel-abas-seg",
    opcoes: ABAS.map(a => ({ valor: a.id, rotulo: a.rotulo })),
    aoMudar: v => { const a = ABAS.find(x => x.id === v); if (a) ctx.navegar(a.hash); } });
  const btnAtualizar = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic", title: "Atualizar os números" }, ui.icone("reabrir"), h("span", { class: "rel-rot" }, "Atualizar"));
  // item 50: impressão limpa (@media print em relatorios.css esconde filtros e botões e abre as tabelas)
  const btnImprimir = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic relat-imprimir", title: "Imprimir ou salvar em PDF" }, ui.icone("modelo"), h("span", { class: "rel-rot" }, "Imprimir"));
  btnImprimir.addEventListener("click", () => { try { window.print(); } catch { ui.toast("Não foi possível abrir a impressão aqui.", { tipo: "nota" }); } });
  // plano 2000d · NX-331: durante a impressão (botão ou Ctrl+P) o título da página vira o nome do PDF com cliente, aba e período
  if (typeof window !== "undefined" && typeof window.addEventListener === "function" && typeof document !== "undefined") {
    let tituloAntes = null;
    const antes = () => { const { de, ate } = periodo(); tituloAntes = document.title; document.title = tituloImpressao({ aba, cliente: ctx.cliente.nome, de, ate, filtro: sufixoFiltro(filtroExtra) }); };
    const depois = () => { if (tituloAntes !== null) { document.title = tituloAntes; tituloAntes = null; } };
    window.addEventListener("beforeprint", antes); window.addEventListener("afterprint", depois);
    tirarImpressao = () => { depois(); window.removeEventListener("beforeprint", antes); window.removeEventListener("afterprint", depois); };
  }
  // plano 1000 (AD-254): quando os números foram buscados («Atualizado às 14:02»), ao lado do botão
  const horaCarga = h("span", { class: "rel-nota relat-hora" });
  horaCarga.hidden = true;
  // plano 1500c · AC-181: «Copiar resumo» (só Vendas) — o texto do período pronto para o WhatsApp do cliente
  const btnCopiar = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic relat-copiar", title: "Copiar o resumo do período (para o WhatsApp)" }, ui.icone("copiar"), h("span", { class: "rel-rot" }, "Copiar resumo"));
  btnCopiar.hidden = true;
  let ultimoVendas = null;
  btnCopiar.addEventListener("click", async () => {
    if (!ultimoVendas) return;
    const { de, ate } = periodo();
    // plano 2000d · DA-212/DA-213: com o Anúncios já carregado (cache do cliente), o investimento do período e o retorno das vendas de anúncio
    let ads = null;
    try {
      const ca = X.cacheAds && X.cacheAds().get(ctx.cliente.id);
      const investido = ca && ca.M ? investimentoAdsPeriodo(ca.M, de, ate) : null;
      if (investido != null) { const tA = L.totalAnuncioVendas(L.origensVendas(ultimoVendas.por_origem || [])); ads = { investido, vendas: tA.ganhos, receita: tA.receita }; }
    } catch { ads = null; }
    if (aba !== "vendas") {   // plano 2000d · DA-262
      const tA = L.textoResumoAtendimento(ultimoVendas, { de, ate, cliente: ctx.cliente.nome, int, dataBR: L.dataIsoBR });
      try { await X.copiarTexto(tA, { ui, aviso: "Resumo copiado. Cole no WhatsApp." }); } catch { ui.toast("Não foi possível copiar aqui.", { tipo: "nota" }); }
      return;
    }
    const texto = textoResumoVendas(ultimoVendas, { de, ate, cliente: ctx.cliente.nome, negocios: typeof V.min === "function" ? V.min("negocios") : "negócios", fem, ads, int, brl0, brl: v => ui.brl(v), pct: pctTxt, dataBR: L.dataIsoBR });
    try { await X.copiarTexto(texto, { ui, aviso: "Resumo copiado. Cole no WhatsApp." }); } catch { ui.toast("Não foi possível copiar aqui.", { tipo: "nota" }); }
  });
  raiz.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Relatórios · ${ctx.cliente.nome}`),
      h("h1", { id: "relat-h", class: "rel-h1" }, aba === "vendas" ? "Vendas" : "Atendimento")),
    h("div", { class: "rel-topo-acoes" }, horaCarga, btnCopiar, btnImprimir, btnAtualizar)), nav);
  // plano 1000 (AD-144): no papel/PDF sai a marca, o período e quando foi gerado (o cabeçalho só existe na impressão)
  const cabImpressao = h("p", { class: "rel-impressao-cab", "aria-hidden": "true" });
  raiz.append(cabImpressao);

  const filtros = h("div", { class: "rel-filtros relat-filtros" });
  const seg = h("div", { class: "rel-seg", role: "group", "aria-label": "Período" });
  // AD-140: o futuro não tem número — os campos param em hoje (e validarPeriodo recusa data final depois de hoje)
  const hojeIso = L.hojeSP();
  const deIn = h("input", { type: "date", class: "relat-data", "aria-label": "De", value: P.de || "", max: hojeIso });
  const ateIn = h("input", { type: "date", class: "relat-data", "aria-label": "Até", value: P.ate || "", max: hojeIso });
  // AD-253: Enter num campo de data aplica (o período personalizado é um <form>; o botão é o submit)
  const aplicar = h("button", { type: "submit", class: "rel-btn rel-btn-prim" }, "Aplicar");
  const erroPer = h("p", { id: "relat-erro-per", class: "relat-erro", role: "alert" });
  erroPer.hidden = true;
  const personal = h("form", { class: "relat-per", "aria-label": "Período personalizado", novalidate: true }, h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, "De"), deIn),
    h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, "Até"), ateIn), aplicar, erroPer);
  const selWrap = h("label", { class: "relat-sel" });
  const legenda = h("p", { class: "rel-nota rel-ate", "aria-live": "polite" });
  let filtroExtra = null;       // {lista, atual, rotulo, todos, aoMudar} do funil (Vendas) ou do departamento (Atendimento): alimenta o chip e a folha
  const chipTxt = h("span", { class: "rel-resumo-t" }, "");
  const chipResumo = h("button", { type: "button", class: "rel-resumo", "aria-haspopup": "dialog", title: "Período e filtros" }, chipTxt, ui.icone("seta-baixo"));
  chipResumo.addEventListener("click", () => abrirFolha());
  // plano 1500c · AC-156: «Incluir hoje» nos atalhos 7/30/90 (o personalizado escolhe as próprias datas)
  const cxHoje = h("input", { type: "checkbox", class: "relat-hoje-cx", checked: !!P.hoje });
  const rotHoje = h("label", { class: "relat-hoje" }, cxHoje, h("span", {}, "Incluir hoje (dia ainda aberto)"));
  cxHoje.addEventListener("change", () => { P.hoje = cxHoje.checked; salvar(); pintarChip(); carregar(); });
  filtros.append(chipResumo, h("div", { class: "rel-filtros-lg" }, seg, selWrap, personal, rotHoje), legenda);
  raiz.append(filtros);
  const corpo = h("div", { class: "rel-corpo", "aria-busy": "true" });
  raiz.append(corpo);

  function pintarSeg() {
    ui.limpar(seg);
    for (const [valor, rot] of [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], ["per", "Personalizado"]]) {
      const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(P.preset === valor) }, rot);
      b.addEventListener("click", () => {
        if (valor === "per") {
          P.preset = "per"; pintarSeg(); personal.hidden = false;
          if (!P.de || !P.ate) { const pp = L.periodoPreset(30); deIn.value = pp.de; ateIn.value = pp.ate; }
          deIn.focus();
          return;
        }
        if (P.preset === valor) return;            // plano 1000b · AB-084: o período já escolhido não recarrega tudo
        P.preset = valor; personal.hidden = true; salvar(); pintarSeg(); carregar();
        const alvo = seg.querySelector('[aria-pressed="true"]');   // o botão foi recriado: o foco não cai no <body>
        if (alvo) alvo.focus();
      });
      seg.append(b);
    }
    // plano 1000b · AB-201: «Este mês» e «Mês passado», como no Anúncios — preenchem o período personalizado e aplicam
    const ativoMes = atalhoMesAtivo(P, L.hojeSP());
    for (const [id, rot, desloc] of ATALHOS_MES) {
      const b = h("button", { type: "button", class: "rel-seg-b relat-mes", "aria-pressed": String(ativoMes === id), dataset: { mes: id } }, rot);
      b.addEventListener("click", () => {
        const pm = periodoMes(L.hojeSP(), desloc, { incluirHoje: !!P.hoje });   // plano 2000d · DA-210: termina ontem, como os presets
        if (!pm) return;
        P.preset = "per"; P.de = pm.de; P.ate = pm.ate; deIn.value = pm.de; ateIn.value = pm.ate; ajustarLimites();
        salvar(); pintarSeg(); pintarChip(); carregar();
        const alvo = seg.querySelector(`[data-mes="${id}"]`); if (alvo) alvo.focus();
      });
      seg.append(b);
    }
    personal.hidden = P.preset !== "per";
    rotHoje.hidden = P.preset === "per";   // AC-156
  }
  // plano 1000b · AB-087: «Até» ganha min = «De» e «De» ganha max = «Até» (barra e folha)
  function ajustarLimites() {
    const lim = limitesDatas(deIn.value, ateIn.value, hojeIso);
    deIn.max = lim.deMax; ateIn.max = lim.ateMax;
    if (lim.ateMin) ateIn.min = lim.ateMin; else ateIn.removeAttribute("min");
  }
  deIn.addEventListener("change", ajustarLimites);
  ateIn.addEventListener("change", ajustarLimites);
  function marcarDataInvalida(campo) {
    for (const i of [deIn, ateIn]) {
      if (i === campo) { i.setAttribute("aria-invalid", "true"); i.setAttribute("aria-describedby", "relat-erro-per"); }
      else { i.removeAttribute("aria-invalid"); i.removeAttribute("aria-describedby"); }
    }
  }
  for (const i of [deIn, ateIn]) i.addEventListener("input", () => { if (i.getAttribute("aria-invalid")) { marcarDataInvalida(null); erroPer.hidden = true; erroPer.textContent = ""; } });
  ajustarLimites();
  personal.addEventListener("submit", ev => {
    ev.preventDefault();
    const v = L.validarPeriodo(deIn.value, ateIn.value, L.hojeSP());
    erroPer.hidden = v.ok;
    erroPer.textContent = v.ok ? "" : v.texto;
    // plano 1000b · AB-086: o campo culpado ganha aria-invalid e aponta para o erro (aria-describedby); corrigido, os dois saem
    marcarDataInvalida(v.ok ? null : campoDataInvalida(v.erro, deIn.value) === "de" ? deIn : ateIn);
    if (!v.ok) { (v.erro === "periodo_grande" ? deIn : ateIn).focus(); return; }
    P.de = deIn.value; P.ate = ateIn.value; salvar(); carregar();
  });
  // plano 2000d · NX-325: ocupado = aria-disabled (com disabled o botão perdia o foco do teclado, que caía no <body>)
  const ocupado = sim => { if (sim) btnAtualizar.setAttribute("aria-disabled", "true"); else btnAtualizar.removeAttribute("aria-disabled"); };
  btnAtualizar.addEventListener("click", () => { if (btnAtualizar.getAttribute("aria-disabled") === "true") return; carregar({ doBotao: true }); });   // AB-202
  pintarSeg();
  pintarChip();

  function pintarChip() {
    const nome = filtroExtra && filtroExtra.atual ? ((filtroExtra.lista || []).find(x => x.id === filtroExtra.atual) || {}).nome || "" : "";
    chipTxt.textContent = L.textoChipRelatorios({ preset: P.preset, de: P.de, ate: P.ate, aba, nome });
    chipResumo.setAttribute("aria-label", rotuloChip(chipTxt.textContent));   // plano 2000d · NX-327
  }

  function limparFiltrosAtuais() {
    const p = limparFiltrosRelatorios(lerPref(), ctx.cliente.id);
    gravarPref(p);
    P.preset = 30; P.de = null; P.ate = null; P.funil = ""; P.dep = ""; P.hoje = false; cxHoje.checked = false;   // AC-156
    deIn.value = ""; ateIn.value = "";
    pintarSeg(); pintarChip(); carregar();
    setTimeout(() => { const alvo = chipResumo.offsetParent ? chipResumo : (seg.querySelector('[aria-pressed="true"]') || deIn); try { alvo.focus(); } catch { /* ok */ } }, 0);
  }
  /** O chip-resumo «Últimos 30 dias · Todos os funis ▾» abre esta folha: período (com datas) e funil/departamento, aplicados de uma vez. */
  async function abrirFolha() {
    let preset = P.preset, de = P.de || deIn.value || "", ate = P.ate || ateIn.value || "", extra = filtroExtra ? filtroExtra.atual : "";
    const campoSeg = (rotulo, el) => h("div", { class: "campo" }, h("p", { class: "rotulo" }, rotulo), el);
    const dataIn = (rotulo, valor, aoMudar) => { const i = h("input", { type: "date", class: "relat-data", "aria-label": rotulo, value: valor, max: hojeIso }); i.addEventListener("change", () => { aoMudar(i.value); limites2(); }); return h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, rotulo), i); };
    const personal2 = h("div", { class: "relat-per" }, dataIn("De", de, v => { de = v; }), dataIn("Até", ate, v => { ate = v; }));
    // AB-087 também na folha
    function limites2() { const [a, b] = personal2.querySelectorAll("input"); if (!a || !b) return; const lim = limitesDatas(de, ate, hojeIso); a.max = lim.deMax; if (lim.ateMin) b.min = lim.ateMin; else b.removeAttribute("min"); }
    limites2();
    personal2.hidden = preset !== "per";
    const segPer = ui.segmentado({ tipo: "filtro", rotulo: "Período", valor: preset, opcoes: [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], ["per", "Personalizado"]]   /* AD-258: o mesmo nome da barra */.map(([v, t]) => ({ valor: v, rotulo: t })),
      aoMudar: v => {
        preset = v; personal2.hidden = v !== "per";
        if (v === "per" && (!de || !ate)) { const pp = L.periodoPreset(30); de = pp.de; ate = pp.ate; for (const [i, val] of [...personal2.querySelectorAll("input")].map((x, k) => [x, k ? ate : de])) i.value = val; }
      } });
    let sel = null;
    if (filtroExtra && filtroExtra.lista && filtroExtra.lista.length) {
      sel = h("select", { class: "sel relat-select", "aria-label": filtroExtra.rotulo },
        h("option", { value: "" }, filtroExtra.todos), filtroExtra.lista.map(x => h("option", { value: x.id, selected: x.id === extra }, x.nome)));
      sel.addEventListener("change", () => { extra = sel.value; });
    }
    const r = await ui.modal({ titulo: "Período e filtros", largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, campoSeg("Período", segPer), personal2, sel ? campoSeg(filtroExtra.rotulo, sel) : null),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: api => {
        if (preset === "per") {
          const v = L.validarPeriodo(de, ate, L.hojeSP());
          if (!v.ok) { api.erro(v.texto); return false; }
        }
        return true;
      } }] });
    if (r !== true) return;
    const mudouExtra = filtroExtra && extra !== filtroExtra.atual;
    P.preset = preset;
    if (preset === "per") { P.de = de; P.ate = ate; deIn.value = de; ateIn.value = ate; }
    if (mudouExtra) { if (aba === "vendas") P.funil = extra; else P.dep = extra; }
    salvar(); pintarSeg(); pintarChip(); carregar();
    setTimeout(() => chipResumo.focus(), 220);      // depois de a folha devolver o foco (o botão que a abriu é o mesmo)
  }

  function montarSelect(lista, atual, rotulo, todos, aoMudar) {
    filtroExtra = lista && lista.length ? { lista, atual, rotulo, todos, aoMudar } : null;
    pintarChip();
    const tinhaFoco = selWrap.contains(document.activeElement);   // trocou o funil pelo teclado: o foco fica no seletor novo
    ui.limpar(selWrap);
    if (!lista || !lista.length) { selWrap.hidden = true; return; }
    selWrap.hidden = false;
    const s = h("select", { class: "sel relat-select", "aria-label": rotulo },
      h("option", { value: "" }, todos),
      lista.map(x => h("option", { value: x.id, selected: x.id === atual }, x.nome)));
    s.addEventListener("change", () => aoMudar(s.value));
    selWrap.append(s);
    if (tinhaFoco) s.focus();
  }

  // ---------- carga
  let pedido = 0, tVelha = 0;
  async function carregar({ doBotao = false } = {}) {
    const n = ++pedido;
    const { de, ate } = periodo();
    // plano 1000b · AB-085/AB-098: o recorte desenhado na tela; «Atualizar» do MESMO recorte mantém os números (e a rolagem)
    const carga = JSON.stringify([aba, de, ate, P.funil || "", P.dep || ""]);
    const chaveMemo = JSON.stringify([ctx.cliente.id, carga]);   // plano 1500c · AC-171
    const manter = manterNaTela(corpo.dataset.carga, carga, corpo.childElementCount > 0 && !corpo.querySelector(".relat-sk"));
    corpo.setAttribute("aria-busy", "true");
    if (manter) corpo.classList.add("relat-atualizando");
    else {
      soltar();
      corpo.dataset.carga = "";
      ui.limpar(corpo);
      corpo.append(h("div", { class: "relat-sk" }, ui.esqueleto("kpi", { n: 6 }), ui.esqueleto("grafico")));
    }
    const j = janelaComparacao(de, ate);
    // plano 1000 (AD-139): o período que termina HOJE conta o dia só até agora — a legenda avisa (de manhã os números «caem»)
    const parcial = notaHojeParcial(ate, L.hojeSP());
    const textoLeg = anterior => textoLegenda({ de, ate, anterior, parcial, dataBR: L.dataIsoBR });   // plano 1500c · AC-155
    const textoLegenda0 = textoLeg(j && j.anterior);
    // plano 1000b · AB-223: a legenda é aria-live — só é reescrita quando o texto muda (o «Atualizar» do mesmo período fica calado)
    if (legenda.textContent !== textoLegenda0) legenda.textContent = textoLegenda0;
    cabImpressao.textContent = `${ctx.cliente.nome} · Relatório de ${aba === "vendas" ? "vendas" : "atendimento"} · ${L.dataIsoBR(de)} a ${L.dataIsoBR(ate)}${parcial} · gerado em ${L.dataIsoBR(L.hojeSP())} às ${L.horaSP(new Date().toISOString())}`;
    ocupado(true);
    const pintar = r => {
      soltar();
      ui.limpar(corpo);
      corpo.classList.remove("relat-atualizando");
      corpo.setAttribute("aria-busy", "false");
      // plano 2000d · DA-233: no papel, a 1ª página é a capa com o resultado principal
      { const { de, ate } = periodo(); const lc = linhasCapa(aba, r, { int, brl0, pct: pctTxt, dur: L.duracaoMin, fem });
        if (lc.length) corpo.append(h("section", { class: "relat-capa-impressao", "aria-hidden": "true" },
          h("h2", {}, `${aba === "vendas" ? "Vendas" : "Atendimento"} · ${ctx.cliente.nome}`), h("p", {}, `${L.dataIsoBR(de)} a ${L.dataIsoBR(ate)}`), lc.map(t => h("p", {}, h("b", {}, t))))); }
      if (aba === "vendas") desenharVendas(r); else desenharAtendimento(r);
      corpo.dataset.carga = carga;
      // plano 1500c · AC-155: a janela que o servidor comparou de verdade
      if (r && r.anterior) { const t = textoLeg(r.anterior); if (legenda.textContent !== t) legenda.textContent = t; }
      // plano 1500c · AC-181: o resumo copiável é o de Vendas
      // plano 2000d · DA-262: o atendimento também tem resumo copiável
      ultimoVendas = r; btnCopiar.hidden = !r || (aba === "vendas" ? L.vendasVazio(r) : L.atendimentoVazio(r));
    };
    // plano 1500c · AC-171: o mesmo recorte há menos de 60 s — desenha o que já veio, sem outro pedido (o «Atualizar» sempre pede)
    const fresco = doBotao ? null : memoFresco(memo, chaveMemo);
    if (fresco) {
      try {
        pintar(fresco); ocupado(false);
        // plano 2000d · NX-324: a hora é a da resposta guardada deste recorte (antes ficava a da última carga, de outro recorte)
        const tm = horaMemo(memo, chaveMemo);
        if (tm) { horaCarga.hidden = false; horaCarga.textContent = `Atualizado às ${L.horaSP(new Date(tm).toISOString())}`; horaCarga.classList.toggle("relat-hora-velha", Date.now() - tm >= HORA_VELHA_MS); }
        return;
      } catch { memo.delete(chaveMemo); }
    }
    // plano 1000b · AB-097: cache do shell (como o Anúncios, anuncios.js:rpcC {cache, aoCache}) — Vendas → Atendimento → Vendas abre na hora
    // com o guardado e a resposta da rede substitui logo depois
    const opcCache = { cache: true, aoCache: rc => {
      if (n !== pedido || minha !== montagem || !rc || typeof rc !== "object" || corpo.dataset.carga === carga) return;
      try { pintar(rc); corpo.setAttribute("aria-busy", "true"); } catch { /* o da rede chega em seguida */ }
    } };
    try {
      const r = aba === "vendas"
        ? await ctx.api.rpcC("nx_rel_vendas", { p_de: de, p_ate: ate, p_funil: P.funil || null }, opcCache)
        : await ctx.api.rpcC("nx_rel_atendimento", { p_de: de, p_ate: ate, p_departamento: P.dep || null }, opcCache);
      if (n !== pedido || minha !== montagem) return;
      pintar(r);
      if (r && typeof r === "object") { memo.set(chaveMemo, { t: Date.now(), r }); if (memo.size > 12) memo.delete(memo.keys().next().value); }   // AC-171
      horaCarga.hidden = false;
      horaCarga.textContent = `Atualizado às ${L.horaSP(new Date().toISOString())}`;
      // plano 1000b · AB-099: depois de 10 min a hora «envelhece» (cinza, itálico, com o porquê no title), como na Agenda
      horaCarga.classList.remove("relat-hora-velha"); horaCarga.removeAttribute("title");
      clearTimeout(tVelha);
      tVelha = setTimeout(() => { if (minha === montagem && horaCarga.isConnected) { horaCarga.classList.add("relat-hora-velha"); horaCarga.title = "Faz mais de 10 minutos: toque em «Atualizar» para buscar os números de agora."; } }, HORA_VELHA_MS);
      if (tVelha && typeof tVelha.unref === "function") tVelha.unref();
      // plano 1000b · AB-202: o pedido veio do botão — confirma, como o Anúncios («Números atualizados»)
      if (doBotao) ui.toast("Números atualizados.", { tipo: "ok", ms: 2500 });
    } catch (e) {
      if (n !== pedido || minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      // filtro que não existe mais (funil/departamento apagado): volta para "todos" e tenta de novo, uma vez
      if (e && e.codigo === "dados_invalidos" && (P.funil || P.dep) && /p_funil|p_departamento/.test(String(e.hint || ""))) {
        P.funil = ""; P.dep = ""; salvar(); return carregar();
      }
      // AB-098: os números do mesmo recorte continuam na tela; a falha vira aviso (antes o cartão de erro apagava tudo)
      if (corpo.dataset.carga === carga && corpo.childElementCount > 0) {
        corpo.classList.remove("relat-atualizando");
        corpo.setAttribute("aria-busy", "false");
        ui.toast(`Não foi possível atualizar agora: ${ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "tente de novo em instantes"}`, { tipo: "erro" });
        return;
      }
      ui.limpar(corpo);
      corpo.classList.remove("relat-atualizando");
      corpo.setAttribute("aria-busy", "false");
      corpo.append(ui.erroCartao(e, () => carregar()));
    } finally { if (n === pedido) ocupado(false); }
  }

  // ---------- peças comuns
  /** KPIs (item 49): número grande, seta ↑↓ contra o período anterior e, quando há série diária, a sparkline do período. */
  function kpis(lista, serie = []) {
    const g = h("div", { class: "rel-kpis rel-kpis-6" });
    const mapa = SPARK_KPI[aba] || {};
    lista.forEach((k, i) => {
      // valor ou base ausentes ficam null (+null seria 0: «—» ganhava um falso ▼ 100%); sem base o chip diz «sem base», neutro
      const vv = k.v === null || k.v === undefined ? null : +k.v;
      const c = L.chipVar(vv, k.a == null ? null : +k.a, k.sentido);
      const b = h("b", { class: "rel-num rel-kpi-v" });
      if (vv === null || !Number.isFinite(vv)) b.textContent = "—";
      else if (k.fmt === "min" || k.fmt === "h" || k.fmt === "pct" || k.fmt === "dias") b.textContent = FMT[k.fmt](vv);
      else if (k.fmt === "brl0") L.contarMoeda(ui, G, b, vv, { centavos: false });     // "R$" a 60 %, colado ao valor
      else G.contar(b, vv, FMT[k.fmt]);
      const cel = h("div", { class: "rel-kpi rel-cartao rel-entra", style: `--i:${i}`, dataset: { kpi: k.id } },
        h("span", { class: "rel-kpi-l" }, k.rotulo), b,
        k.agora ? h("span", { class: "rel-kpi-linha" }, h("span", { class: "rel-nota" }, "agora"))   // só o estado de agora (abertas agora) não tem período anterior
          : h("span", { class: "rel-kpi-linha" },
            h("span", { class: `rel-var rel-var-${c.cls}`, "aria-hidden": "true" }, c.v == null ? c.txt : `${c.seta} ${c.txt}`),
            h("span", { class: "sr-only" }, textoSrVar(c)),   // plano 1500c · AC-190
            // plano 1000b · AB-088: o valor do período anterior visível (antes só no title, fora do toque)
            h("span", { class: "rel-nota" }, notaAnterior(k.a, FMT[k.fmt]))));
      const valores = mapa[k.id] ? L.valoresSerie(serie, mapa[k.id]) : [];
      if (valores.length > 1 && valores.some(v => v > 0)) {
        const sp = h("span", { class: "rel-kpi-spark", "aria-hidden": "true" });
        if (X.desenharSparkline({ G, L, alvo: sp, valores, rotulo: `${k.rotulo}: dia a dia` })) cel.append(sp);
      }
      if (k.extra) cel.append(h("span", { class: "rel-kpi-extra" }, k.extra));
      // plano 1000 (AD-255): «Abertas agora» leva às Conversas já na aba das abertas
      if (k.id === "abertas_agora" && +vv > 0 && (typeof ctx.temModulo !== "function" || ctx.temModulo("conversas")))
        cel.append(h("a", { class: "rel-link relat-kpi-link", href: "#/conversas?aba=abertas" }, "Ver conversas abertas"));
      g.append(cel);
    });
    return g;
  }
  let seqBloco = 0;
  function cartao(titulo, { sub, largo, csv, png } = {}) {
    const alvo = h("div", { class: "rel-grafico" });
    const rodape = h("div", { class: "rel-cartao-rodape" });
    // plano 2000d · NX-328: cada bloco é uma região com o nome do seu título (o leitor de tela lista «Funil», «Por origem»… e pula entre eles)
    const idT = `relat-b-${++seqBloco}`;
    const c = h("section", { class: `rel-cartao rel-entra relat-bloco${largo ? " relat-largo" : ""}`, "aria-labelledby": idT },
      h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2", id: idT }, titulo), sub ? h("p", { class: "rel-nota" }, sub) : null), alvo, rodape);
    if (csv) {
      const b = h("button", { type: "button", class: "g-ver-tabela relat-csv", title: "Baixar este bloco em CSV (abre no Excel)", "aria-label": `Baixar «${titulo}» em CSV` }, "CSV");
      b.addEventListener("click", () => baixarCsv(csv.nome, csv.colunas, csv.linhas()));
      rodape.append(b);
    }
    // item 50: PNG só nos blocos desenhados em SVG (linha, rosca); funil, barras e calor são HTML e ficam com CSV + tabela
    // AD-103/AD-120: o cliente no nome do arquivo e o cabeçalho (título, cliente, período) em cima da imagem
    if (png) rodape.append(X.botaoPng({ h, alvo, L, titulo, nome: () => { const { de, ate } = periodo(); return L.nomeArquivoExport(png, de, ate, "png", ctx.cliente.nome, sufixoFiltro(filtroExtra)); },   /* plano 2000d · NX-330 */
      cabecalho: () => { const { de, ate } = periodo(); return L.cabecalhoPng({ titulo, cliente: ctx.cliente.nome, periodo: `${L.dataIsoBR(de)} a ${L.dataIsoBR(ate)}` }); },
      aoFalhar: t => ui.toast(t, { tipo: "nota" }), aoPronto: t => ui.toast(t, { tipo: "ok", ms: 2000 }) }));   // AB-068
    return { c, alvo, rodape };
  }
  // plano 1000 (AD-143): «orbita-<cliente>-funil-<de>-a-<ate>.csv» (antes sem o cliente); AD-121: folha de compartilhar no app instalado
  function baixarCsv(nome, colunas, linhas) {
    const { de, ate } = periodo();
    // plano 1000b · AB-209: download recusado (sem document.body, bloqueado) avisa em vez de não fazer nada
    const avisar = r => { if (r === false) ui.toast("Não deu para baixar aqui; use «Ver como tabela» e copie os números.", { tipo: "nota" }); };
    X.baixarArquivo(new Blob([L.csv(colunas, linhas)], { type: "text/csv;charset=utf-8" }), L.nomeArquivoExport(nome, de, ate, "csv", ctx.cliente.nome, sufixoFiltro(filtroExtra))).then(avisar, () => avisar(false));   // plano 2000d · NX-330
  }
  // plano 2000d · NX-322/NX-323: `total` = a linha de soma no <tfoot> (só com 2 ou mais pessoas)
  function tabelaSimples({ colunas, linhas, legenda: leg, total = null }) {
    return h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": leg }, h("table", { class: "rel-tabela relat-tabela" },
      h("caption", { class: "sr-only" }, leg),
      h("thead", {}, h("tr", {}, colunas.map((c, j) => h("th", { scope: "col", class: j ? "num" : "" }, c)))),
      h("tbody", {}, linhas.map((l, i) => h("tr", { style: `--i:${i}` }, l.map((v, j) => j ? h("td", { class: "num", dataset: { l: colunas[j] } }, v) : h("th", { scope: "row" }, v))))),
      total && linhas.length > 1 ? h("tfoot", {}, h("tr", { class: "relat-total" }, total.map((v, j) => j ? h("td", { class: "num", dataset: { l: colunas[j] } }, v) : h("th", { scope: "row" }, v)))) : null));
  }
  // plano 2000d · NX-326: o botão do vazio some na recarga — o foco vai para o período escolhido (chip no celular), não para o <body>
  function focarPeriodo() {
    setTimeout(() => { const alvo = chipResumo.offsetParent ? chipResumo : seg.querySelector('[aria-pressed="true"]'); try { if (alvo) alvo.focus(); } catch { /* ok */ } }, 0);
  }
  function semDados(msg = "Sem dados no período.") {
    const filtrado = recorteFiltrado(P);   // AD-146: 7/90 dias não são «filtro»
    // plano 1500c · AC-167: sem dados nos 7 ou 30 dias, o botão já amplia o período (antes só o texto «escolha outro período»)
    const maior = !filtrado ? periodoMaior(P.preset) : null;
    return h("div", { class: "rel-cartao relat-vazio rel-entra" }, ui.vazio({ titulo: msg, tema: aba === "vendas" ? "crm" : "conversas",
      texto: filtrado ? "Não há dados com este recorte. Limpe os filtros para voltar ao período padrão." : maior ? textoPeriodoMaior(P.preset, maior) /* plano 2000d · DA-240 */ : "Escolha outro período ou outro filtro.",
      acao: filtrado ? { rotulo: "Limpar período e filtros", fn: limparFiltrosAtuais }
        : maior ? { rotulo: `Ver ${maior} dias`, fn: () => { P.preset = maior; salvar(); pintarSeg(); pintarChip(); carregar(); focarPeriodo(); } } : null }));   // plano 2000d · NX-326
  }

  // ---------- VENDAS
  function desenharVendas(r) {
    montarSelect(r.funis, P.funil, "Funil", "Todos os funis", v => { P.funil = v; salvar(); carregar(); });
    corpo.append(kpis(L.kpisVendas(r, { negocios: typeof V.min === "function" ? V.min("negocios") : "negócios" }), r.serie || []));
    const k = r.kpis || {};
    // plano 2000d · NX-301: «1 negócio aberto» no singular; NX-302: valor ausente não vira «— previstos» solto
    const temC = pedacosCarteira(k);
    const negSing = typeof V.min === "function" ? V.min("negocio") : "negócio", negPl = typeof V.min === "function" ? V.min("negocios") : "negócios";
    corpo.append(h("div", { class: "relat-carteira rel-cartao rel-entra" },
      h("p", { class: "rel-olho" }, "Carteira agora"),
      h("p", {}, h("b", { class: "rel-num" }, int(k.abertos)), ` ${rotuloAbertos(k.abertos, { negocio: negSing, negocios: negPl, fem })}`,
        temC.includes("valor_aberto") ? [" · ", h("b", { class: "rel-num" }, brl0(k.valor_aberto)), " previstos"] : null,
        temC.includes("previsao_ponderada") ? [" · ", h("b", { class: "rel-num" }, brl0(k.previsao_ponderada)), " na previsão ponderada"] : null),
      // plano 1000b · AB-258: o que é «ponderada», visível (sem depender de passar o mouse)
      temC.includes("previsao_ponderada") ? h("p", { class: "rel-nota relat-ponderada" }, `Previsão ponderada = valor de cada ${negSing} × chance de fechar da etapa em que ${fem ? "ela" : "ele"} está.`) : null,
      +k.perdidos ? h("p", { class: "rel-nota" }, `${int(k.perdidos)} ${flexao("perdido", k.perdidos, fem)} no período${temC.includes("valor_perdido") ? ` (${brl0(k.valor_perdido)} previstos)` : ""}`) : null));   // plano 1000b · AB-089: com milhar (int)
    if (L.vendasVazio(r)) { corpo.append(semDados()); return; }

    const grade = h("div", { class: "relat-grade" });
    corpo.append(grade);

    // funil por etapa
    const fr = r.funil_ref;
    const bf = cartao(fr ? `Funil «${fr.nome}»` : "Funil", { sub: subFunil(fem) /* plano 2000d · NX-303 */, largo: true,
      csv: { nome: "funil", colunas: ["Etapa", "Agora", "Valor", "Entraram no período", "Seguiram", "Conversão %"],
        linhas: () => linhasCsvFunil(r.funil) } });   // plano 2000d · NX-313
    grade.append(bf.c);
    if ((r.funil || []).length) {
      graficos.push(G.funil(bf.alvo, {
        resumo: resumoFunil(fr && fr.nome, r.funil, int),   // plano 2000d · NX-310
        etapas: (r.funil || []).map(e => ({ nome: e.nome, cor: ui.corOk(e.cor), tipo: e.tipo, qtd: +e.qtd_atual || 0, valorTxt: brl0(e.valor_atual), conversao: L.textoConversao(e) })),
      }));
      // plano 1000b · AB-002: «Seguiram» é o NÚMERO de quem seguiu (avancaram) e o % ganha a própria coluna «Conversão» — iguais ao CSV
      G.alternarTabela(bf.rodape, bf.alvo, { legenda: "Funil por etapa", colunas: ["Etapa", "Agora", "Valor", "Entraram", "Seguiram", "Conversão"],
        linhas: (r.funil || []).map(e => [e.nome, int(e.qtd_atual), brl0(e.valor_atual), int(e.passaram), e.tipo === "aberto" ? int(e.avancaram) : "—", e.tipo === "aberto" ? pctTxt(e.conversao_proxima_pct) : "—"]) });
    } else bf.alvo.append(...[h("p", { class: "rel-vazio-txt" }, "Nenhum funil ativo."),
      // plano 1000 (AD-256): funil vazio com o caminho para criar (só quem administra vê)
      ctx.pode && ctx.pode("admin") ? h("a", { class: "rel-link", href: "#/config/funis" }, "Criar ou ativar um funil") : null].filter(Boolean));

    // série diária (com o melhor dia de ganhos destacado no subtítulo)
    const serie = r.serie || [];
    const melhor = L.melhorDia(serie, "ganhos");
    // plano 1000 (AD-147): acima de 60 dias, um ponto por SEMANA (90 rótulos diários ficavam ilegíveis)
    const semanal = serie.length > L.DIAS_AGRUPAR_SEMANA;
    const serieG = semanal ? L.agruparSemana(serie, ["criados", "ganhos", "receita"]) : serie;
    const rotG = d => (semanal ? `sem. ${L.ddmmIso(d.d)}` : L.ddmmIso(d.d));
    const longoG = d => (semanal ? `semana de ${L.dataIsoBR(d.d)} a ${L.dataIsoBR(d.ate)}` : L.diaLongoIso(d.d));
    // plano 2000d · NX-304: «Criadas × ganhas» e «com 1 ganha» no vocabulário feminino (séries, tabela, CSV e resumo)
    const SV = seriesVendas(fem);
    const somaC = serie.reduce((s, d) => s + (+d.criados || 0), 0), somaG = serie.reduce((s, d) => s + (+d.ganhos || 0), 0);
    const bs = cartao(semanal ? "Semana a semana" : "Dia a dia", { sub: `${SV.criados} × ${SV.ganhos.toLowerCase()} por ${semanal ? "semana (segunda a domingo)" : "dia"} (fuso de São Paulo).${melhor ? ` Melhor dia: ${L.diaLongoIso(melhor.d)}, com ${int(melhor.v)} ${SV.ganhosDe(melhor.v)}.` : ""}`, largo: true, png: "vendas-dia-a-dia",
      csv: { nome: "vendas-dia-a-dia", colunas: ["Dia", SV.criados, SV.ganhos, "Receita"], linhas: () => serie.map(d => [L.dataIsoBR(d.d), d.criados, d.ganhos, d.receita]) } });
    grade.append(bs.c);
    graficos.push(G.linha(bs.alvo, {
      // plano 1000b · AB-095: o gráfico agrupa por semana acima de 60 dias — o resumo diz «por semana» (a tabela segue diária)
      resumo: `${SV.criados} e ${SV.ganhos.toLowerCase()} por ${semanal ? "semana" : "dia"}: ${int(somaC)} ${flexao("criado", somaC, fem)} e ${int(somaG)} ${flexao("ganho", somaG, fem)}`,   // plano 1500c · AC-158
      pontos: serieG.map(d => ({ rotulo: rotG(d), longo: `${longoG(d)} · receita ${brl0(d.receita)}`, valores: [+d.criados || 0, +d.ganhos || 0] })),
      series: [{ nome: SV.criados, classe: "g-s1" }, { nome: SV.ganhos, classe: "g-s0" }],
      fmt: v => int(v), fmtEixo: v => int(v),
    }));
    G.alternarTabela(bs.rodape, bs.alvo, { legenda: `${SV.criados} e ${SV.ganhos.toLowerCase()} por dia`, colunas: ["Dia", SV.criados, SV.ganhos, "Receita"],
      linhas: serie.map(d => [L.dataIsoBR(d.d), int(d.criados), int(d.ganhos), brl0(d.receita)]) });

    // por origem (F2/F12): a MESMA régua de «veio de anúncio» do Anúncios (L.origensVendas) — site e orgânico do rastreio com nome
    // próprio, a campanha quando o servidor mandar; rosca com legenda (toque esconde a fatia) + tabela/CSV com criados × ganhos
    const orig = L.origensVendas(r.por_origem || []);
    const tA = L.totalAnuncioVendas(orig);
    // plano 2000d · NX-305: subtítulo, legenda, centro e colunas no gênero do vocabulário («1 criada e 1 ganha»)
    const bo = cartao("Por origem", { sub: `Quem chegou, por canal de entrada (${flexao("criado", 2, fem)} no período).${tA.criados ? ` De anúncio: ${int(tA.criados)} ${flexao("criado", tA.criados, fem)} e ${int(tA.ganhos)} ${flexao("ganho", tA.ganhos, fem)} — a mesma régua do Anúncios, mas contada pela data de criação ${fem ? "da" : "do"} ${negSing} (Anúncios conta pela data da conversa).` : ""}`, png: orig.length ? "vendas-por-origem" : null,
      csv: { nome: "vendas-por-origem", colunas: ["Origem", SV.criados, SV.ganhos, cap1(flexao("perdido", 2, fem)), "Receita", "Conversão %", "Campanhas"],
        linhas: () => orig.map(o => [o.rotulo, o.criados, o.ganhos, o.perdidos, o.receita, o.conversao_pct ?? "", o.campanhas.join(" | ")]) } });
    grade.append(bo.c);
    if (orig.some(o => o.criados > 0)) {
      const donut = typeof G.donut === "function" ? G.donut : G.rosca;
      const tot = orig.reduce((a, o) => a + o.criados, 0);
      graficos.push(donut(bo.alvo, {
        resumo: resumoOrigens(orig, int, { fem }),   // plano 1000b · AB-093: plural pelo número («1 criado e 1 ganho»)
        fatias: orig.map(o => ({ rotulo: o.rotulo, valor: o.criados, extra: `${int(o.ganhos)} ${flexao("ganho", o.ganhos, fem)} · ${brl0(o.receita)}${o.conversao_pct != null ? ` · ${pctTxt(o.conversao_pct)} conversão` : ""}${o.campanhas.length ? ` · ${o.campanhas.slice(0, 2).join(", ")}` : ""}` })),
        fmt: int, centro: { valor: int(tot), rotulo: flexao("criado", tot, fem) } }));
      const comCamp = orig.filter(o => o.campanhas.length);
      if (comCamp.length) bo.alvo.append(h("ul", { class: "relat-orig-camp" }, comCamp.map(o => h("li", {}, h("b", {}, o.rotulo), ` · ${o.campanhas.slice(0, 3).join(", ")}${o.campanhas.length > 3 ? ` e mais ${o.campanhas.length - 3}` : ""}`))));
      G.alternarTabela(bo.rodape, bo.alvo, { legenda: "Por origem", colunas: ["Origem", SV.criados, SV.ganhos, "Receita", "Conversão"],
        linhas: orig.map(o => [o.rotulo, int(o.criados), int(o.ganhos), brl0(o.receita), pctTxt(o.conversao_pct)]) });
    } else bo.alvo.append(h("p", { class: "rel-vazio-txt" }, orig.length ? "Nenhum negócio criado no período (só fechamentos de antes)." : "Sem negócios no período."));
    // plano 1000 (AD-153): por que os «criados de anúncio» daqui não batem com as conversas do Anúncios
    if (tA.criados) bo.alvo.append(h("details", { class: "ads-por-que relat-por-que" }, h("summary", {}, "Por que difere do Anúncios?"),
      h("ul", { class: "ads-por-que-lista" }, L.porQueDifere("datas", "aparelho").map(t => h("li", {}, t))   /* plano 1000b · AB-096: por id, não pela posição */)));

    // motivos de perda
    const mot = r.motivos_perda || [];
    const bm = cartao("Motivos de perda", { sub: `${vcap("negocios", "Negócios")} ${fem ? "perdidas" : "perdidos"} no período, por motivo.`, png: mot.length ? "motivos-de-perda" : null,
      csv: { nome: "motivos-de-perda", colunas: ["Motivo", "Quantidade", "%", "Valor previsto"], linhas: () => linhasCsvMotivos(mot) } });   // plano 2000d · NX-312
    grade.append(bm.c);
    if (mot.length) {
      const tot = mot.reduce((s, m) => s + (+m.qtd || 0), 0);
      graficos.push(G.rosca(bm.alvo, {
        resumo: resumoMotivos(mot, int),   // plano 2000d · NX-311
        // plano 1000 (AD-257): com muitos motivos, os 5 maiores + «Outros (N)» na rosca (a tabela e o CSV seguem com todos)
        fatias: L.agruparOutros(mot, { max: 6, juntar: resto => ({ nome: `Outros (${resto.length})`, qtd: resto.reduce((s, m) => s + (+m.qtd || 0), 0), valor: resto.reduce((s, m) => s + (+m.valor || 0), 0) }) })
          .map(m => ({ rotulo: m.nome, valor: +m.qtd || 0, extra: `${brl0(m.valor)} previstos` })),
        // plano 1000b · AB-090: o centro da rosca de perdas com milhar («1.500»)
        fmt: int, centro: { valor: int(tot), rotulo: fem ? (tot === 1 ? "perdida" : "perdidas") : (tot === 1 ? "perdido" : "perdidos") },
      }));
      G.alternarTabela(bm.rodape, bm.alvo, { legenda: "Motivos de perda", colunas: ["Motivo", "Quantidade", "%", "Valor previsto"],
        linhas: mot.map(m => [m.nome, int(m.qtd), tot ? pctTxt(Math.round((+m.qtd || 0) / tot * 1000) / 10) : "—", brl0(m.valor)]) });
    } else bm.alvo.append(h("p", { class: "rel-vazio-txt" }, "Nenhuma perda no período."));

    // por responsável
    // plano 1500c · AC-159: por fechamentos (ganhos) e com a conversão de cada um (ganhos ÷ criados)
    const dono = linhasDono(r.por_dono || []);
    // plano 2000d · NX-306: colunas no gênero do vocabulário (tabela e CSV); NX-322: a linha «Total» embaixo
    const tD = totalLinhas(dono, ["criados", "ganhos", "receita", "abertos"]);
    const bd = cartao("Por responsável", { largo: true, sub: `Em ordem de fechamentos. Conversão = ${flexao("ganho", 2, fem)} ÷ ${flexao("criado", 2, fem)} no período.`,
      csv: { nome: "vendas-por-responsavel", colunas: colunasDono(fem, true),   // plano 1000b · AB-094: o mesmo rótulo da tabela
        linhas: () => dono.map(d => [d.nome, d.criados, d.ganhos, d.conversao_pct ?? "", d.receita, d.ticket_medio ?? "", d.abertos]) } });
    grade.append(bd.c);
    bd.alvo.append(dono.length ? tabelaSimples({ legenda: "Vendas por responsável", colunas: colunasDono(fem),
      linhas: dono.map(d => [d.nome, int(d.criados), int(d.ganhos), pctTxt(d.conversao_pct), brl0(d.receita), d.ticket_medio == null ? "—" : brl0(d.ticket_medio), int(d.abertos)]),
      total: ["Total", int(tD.criados), int(tD.ganhos), pctTxt(tD.conversao_pct), brl0(tD.receita), tD.ticket_medio == null ? "—" : brl0(tD.ticket_medio), int(tD.abertos)] })
      : h("p", { class: "rel-vazio-txt" }, "Sem negócios no período."));

    // parados
    const par = r.parados || [];
    // plano 2000d · NX-307: título, total e «a mais antiga» no gênero do vocabulário; NX-309: CSV dos parados
    const rp = resumoParados(par);
    const TP = textosParados({ fem, negocios: vcap("negocios", "Negócios"), qtd: rp.qtd, diasMax: rp.diasMax, int });
    const bp = cartao(TP.titulo, { largo: true, sub: TP.sub,
      csv: par.length ? { nome: "parados", colunas: ["Etapa", "Quantidade", "Valor previsto", "Dias parado (o mais antigo)"], linhas: () => linhasCsvParados(par) } : null });
    grade.append(bp.c);
    if (par.length) {
      const ul = h("ul", { class: "relat-parados" });
      par.forEach(p => {
        const cor = ui.corOk(p.cor);
        // plano 2000d · NX-308: o item inteiro tem nome («Proposta: 3 parados, R$ 9.000 previstos»); as peças soltas ficam só para a vista
        ul.append(h("li", { "aria-label": rotuloParado(p, { fem, int, brl0, temValor: rp.temValor }) }, h("i", { class: "g-fcor", style: cor ? { "--cor": cor } : null, "aria-hidden": "true" }),
          h("span", { class: "relat-parado-nome", "aria-hidden": "true" }, p.nome || "Etapa sem nome"), h("b", { class: "rel-num", "aria-hidden": "true" }, int(p.qtd)),
          rp.temValor ? h("small", { class: "rel-nota relat-parado-valor", "aria-hidden": "true" }, p.valor == null ? "—" : brl0(p.valor)) : null));   // plano 1500c · AC-160
      });
      bp.alvo.append(ul);
      if (rp.temValor) bp.alvo.append(h("p", { class: "rel-nota relat-parados-total" }, `${TP.total} · ${brl0(rp.valor)} previstos`));
      if (TP.antigo) bp.alvo.append(h("p", { class: "rel-nota relat-parados-dias" }, TP.antigo));   // plano 2000d · DA-245
      // plano 1000b · AB-259: com «Todos os funis» (sem funil_ref) o caminho é o quadro geral do CRM
      if (ctx.temModulo("crm") && ctx.pronto("crm")) bp.rodape.append(fr ? h("a", { class: "rel-link", href: `#/crm?funil=${encodeURIComponent(fr.id)}` }, "Abrir o funil")
        : h("a", { class: "rel-link", href: "#/crm" }, "Abrir o CRM"));
    } else bp.alvo.append(h("p", { class: "rel-vazio-txt" }, "Nada parado. Tudo andando."));
  }

  // ---------- ATENDIMENTO
  function desenharAtendimento(r) {
    montarSelect(r.departamentos, P.dep, "Departamento", "Todos os departamentos", v => { P.dep = v; salvar(); carregar(); });
    corpo.append(kpis(L.kpisAtendimento(r), r.serie || []));
    if (L.atendimentoVazio(r)) { corpo.append(semDados()); return; }
    const grade = h("div", { class: "relat-grade" });
    corpo.append(grade);

    // série novas × resolvidas (com o dia mais movimentado no subtítulo)
    const serie = r.serie || [];
    const melhor = L.melhorDia(serie, "novas");
    const semanal = serie.length > L.DIAS_AGRUPAR_SEMANA;     // AD-147
    const serieG = semanal ? L.agruparSemana(serie, ["novas", "resolvidas"]) : serie;
    const bs = cartao(semanal ? "Semana a semana" : "Dia a dia", { sub: `Conversas novas × resolvidas por ${semanal ? "semana (segunda a domingo)" : "dia"} (fuso de São Paulo).${melhor ? ` Dia mais movimentado: ${L.diaLongoIso(melhor.d)}, com ${qtdPalavra(melhor.v, "nova", "novas", int)}.` /* plano 2000d · NX-314 */ : ""}`, largo: true, png: "atendimento-dia-a-dia",
      csv: { nome: "atendimento-dia-a-dia", colunas: ["Dia", "Novas", "Resolvidas"], linhas: () => serie.map(d => [L.dataIsoBR(d.d), d.novas, d.resolvidas]) } });
    grade.append(bs.c);
    graficos.push(G.linha(bs.alvo, {
      resumo: `Novas e resolvidas por ${semanal ? "semana" : "dia"}: ${int(serie.reduce((s, d) => s + (+d.novas || 0), 0))} novas e ${int(serie.reduce((s, d) => s + (+d.resolvidas || 0), 0))} resolvidas`,   // plano 1500c · AC-158
      pontos: serieG.map(d => ({ rotulo: semanal ? `sem. ${L.ddmmIso(d.d)}` : L.ddmmIso(d.d), longo: semanal ? `semana de ${L.dataIsoBR(d.d)} a ${L.dataIsoBR(d.ate)}` : L.diaLongoIso(d.d), valores: [+d.novas || 0, +d.resolvidas || 0] })),
      series: [{ nome: "Novas", classe: "g-s1" }, { nome: "Resolvidas", classe: "g-s2" }], fmt: int, fmtEixo: int,
    }));
    G.alternarTabela(bs.rodape, bs.alvo, { legenda: "Novas e resolvidas por dia", colunas: ["Dia", "Novas", "Resolvidas"],
      linhas: serie.map(d => [L.dataIsoBR(d.d), int(d.novas), int(d.resolvidas)]) });

    // mapa de calor
    const m = L.matrizCalor(r.mapa_calor);
    const pico = L.picoCalor(m);
    // AD-150: a palavra da vertical (o comentário ficava no meio da linha e engolia sub/largo — revisão 13/10)
    const bc = cartao(tituloQuandoChamam(V), { sub: pico ? `Mensagens recebidas por dia e hora (São Paulo). Pico: ${L.SEMANA[pico.dow]} às ${String(pico.hora).padStart(2, "0")}h${pico.empates ? ` (empatado com ${pico.empates === 1 ? "outro horário" : `outros ${pico.empates} horários`})` : ""}.` : "Mensagens recebidas por dia e hora (São Paulo)."   /* plano 2000d · DA-223 */, largo: true,
      csv: { nome: "mapa-de-calor", colunas: ["Dia", ...Array.from({ length: 24 }, (_, i) => `${i}h`)], linhas: () => [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...m[d]]) } });
    grade.append(bc.c);
    graficos.push(G.calor(bc.alvo, { matriz: m, dias: L.SEMANA, fmt: v => `${int(v)} ${+v === 1 ? "mensagem" : "mensagens"}`,
      resumo: pico ? `Mapa de calor das mensagens recebidas; o horário de pico é ${L.SEMANA[pico.dow]} ${horaFalada(pico.hora)}` /* plano 2000d · NX-317 */ : "Mapa de calor sem mensagens no período" }));
    // faixas do dia (madrugada/manhã/tarde/noite) em chips: a leitura rápida que o dono quer antes de olhar as 168 células
    const fx = L.faixasCalor(m);
    // plano 1000b · AB-091: «120 mensagens» / «1 mensagem» nos chips (antes «msgs»)
    if (fx.total > 0) bc.alvo.append(h("ul", { class: "relat-faixas", "aria-label": "Mensagens por faixa do dia" }, fx.faixas.map(f => h("li", { class: `relat-faixa${fx.forte && fx.forte.nome === f.nome ? " relat-faixa-forte" : ""}` },
      h("span", { class: "relat-faixa-n" }, f.nome), fx.forte && fx.forte.nome === f.nome ? h("span", { class: "sr-only" }, " (a faixa mais movimentada)") : null,   // plano 2000d · NX-329: não só pela cor
      h("b", { class: "rel-num" }, `${f.pct}%`), h("small", { class: "rel-nota" }, `${int(f.total)} ${+f.total === 1 ? "mensagem" : "mensagens"} · ${String(f.ini).padStart(2, "0")}–${String(f.fim).padStart(2, "0")}h`)))));
    G.alternarTabela(bc.rodape, bc.alvo.querySelector(".g-cal-rolagem") || bc.alvo, { legenda: "Mensagens recebidas por dia da semana e hora",
      colunas: ["Dia", "Madrugada (0–5h)", "Manhã (6–11h)", "Tarde (12–17h)", "Noite (18–23h)"],
      linhas: [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...[0, 6, 12, 18].map(i => int(m[d].slice(i, i + 6).reduce((s, x) => s + x, 0)))]) });

    // por atendente
    // plano 2000d · NX-318/NX-319/NX-320: em ordem de conversas, sem nome = «Sem atendente», quem saiu marcado; NX-323: linha «Total»
    const at = linhasAtendente(r.por_atendente || []);
    const tAt = totalLinhas(at, ["conversas", "resolvidas", "msgs_out"]);
    const ba = cartao("Por atendente", { largo: true, sub: at.length > 1 ? "Em ordem de conversas atendidas." : null,
      // plano 1500c · AC-161/AC-191: minutos com 1 casa e a mesma medida em horas (3 dias liam «4320»)
      csv: { nome: "atendimento-por-atendente", colunas: ["Atendente", "Conversas", "Resolvidas", "1ª resposta (min)", "1ª resposta (h)", "Mensagens enviadas"],
        linhas: () => at.map(a => [a.nome, a.conversas, a.resolvidas, minCsv(a.tpr_mediana_min), horasCsv(a.tpr_mediana_min), a.msgs_out]) } });
    grade.append(ba.c);
    ba.alvo.append(at.length ? tabelaSimples({ legenda: "Atendimento por atendente", colunas: ["Atendente", "Conversas", "Resolvidas", "1ª resposta (mediana)", "Mensagens enviadas"],
      linhas: at.map(a => [a.nome, int(a.conversas), int(a.resolvidas), L.duracaoMin(a.tpr_mediana_min), int(a.msgs_out)]),
      total: ["Total", int(tAt.conversas), int(tAt.resolvidas), "—", int(tAt.msgs_out)] })
      : h("p", { class: "rel-vazio-txt" }, "Nenhum atendimento atribuído no período."));

    // por departamento
    const dep = r.por_departamento || [];
    const bdp = cartao("Por departamento", { csv: { nome: "atendimento-por-departamento", colunas: ["Departamento", "Novas", "Resolvidas", "Abertas agora", "1ª resposta (min)", "1ª resposta (h)"],
      linhas: () => dep.map(d => [d.nome, d.novas, d.resolvidas, d.abertas_agora, minCsv(d.tpr_mediana_min), horasCsv(d.tpr_mediana_min)]) } });   // plano 1500c · AC-161/AC-191
    grade.append(bdp.c);
    if (dep.length) {
      graficos.push(G.barras(bdp.alvo, { resumo: resumoDepartamentos(dep, int),   // plano 2000d · NX-315
        itens: dep.map(d => ({ rotulo: d.nome, extra: `1ª resposta ${L.duracaoMin(d.tpr_mediana_min)} · ${int(d.abertas_agora)} ${+d.abertas_agora === 1 ? "aberta" : "abertas"} agora`,   /* plano 1000b · AB-092 */ valores: [+d.novas || 0, +d.resolvidas || 0] })),
        series: [{ nome: "Novas", classe: "g-s1" }, { nome: "Resolvidas", classe: "g-s2" }], fmt: int }));
      G.alternarTabela(bdp.rodape, bdp.alvo, { legenda: "Atendimento por departamento", colunas: ["Departamento", "Novas", "Resolvidas", "Abertas agora", "1ª resposta"],
        linhas: dep.map(d => [d.nome, int(d.novas), int(d.resolvidas), int(d.abertas_agora), L.duracaoMin(d.tpr_mediana_min)]) });
    } else bdp.alvo.append(h("p", { class: "rel-vazio-txt" }, "Sem conversas no período."));

    // por número
    const can = r.por_canal || [];
    const bn = cartao("Por número", { csv: { nome: "atendimento-por-numero", colunas: ["Número", "Novas", "Recebidas", "Enviadas"],
      linhas: () => can.map(c => [c.numero_exibicao && c.nome ? `${c.nome} (${c.numero_exibicao})` : nomeCanal(c), c.novas, c.msgs_in, c.msgs_out]) } });
    grade.append(bn.c);
    if (can.length) {
      graficos.push(G.barras(bn.alvo, { resumo: resumoCanais(can, int),   // plano 2000d · NX-316
        itens: can.map(c => ({ rotulo: nomeCanal(c), extra: `${c.numero_exibicao ? `${c.numero_exibicao} · ` : ""}${int(c.novas)} ${+c.novas === 1 ? "conversa nova" : "conversas novas"}`, valores: [+c.msgs_in || 0, +c.msgs_out || 0] })),
        series: [{ nome: "Recebidas", classe: "g-s1" }, { nome: "Enviadas", classe: "g-s0" }], fmt: int }));
      G.alternarTabela(bn.rodape, bn.alvo, { legenda: "Mensagens por número", colunas: ["Número", "Conversas novas", "Recebidas", "Enviadas"],
        linhas: can.map(c => [c.numero_exibicao && c.nome ? `${c.nome} · ${c.numero_exibicao}` : nomeCanal(c), int(c.novas), int(c.msgs_in), int(c.msgs_out)]) });
    } else bn.alvo.append(h("p", { class: "rel-vazio-txt" }, "Sem mensagens no período."));
  }

  await carregar();
}
