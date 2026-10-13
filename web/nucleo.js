/* ============================================================
   NEXUS ADS — nucleo.js
   Lógica PURA (sem DOM, sem rede), usada igual no painel (navegador)
   e nas Edge Functions (Deno). Se o painel e o relatório do WhatsApp
   fizerem contas separadas, um dia vão discordar — então todo mundo
   calcula daqui.

   Modelo de dados ("dataset"):
     LINHAS  uma linha por criativo por dia
             { i, plat, camp, cri, gasto, impressoes, alcance, cliques, conversoes, freq }
     LEADS   um paciente por conversa
             { id, i, iAgenda, iConsulta, camp, cri, plat, servico, nome, telefone,
               compareceu, fechou, valor?, fator?, etapaReal?, obs? }
     CAMP    { [id]: { id, plat, nome, curto, nomeEm?, semCampanha? } }
             · "<plat>:nao_identificada" = lead de anúncio sem campanha/anúncio reconhecido (fica DENTRO do funil)
     CRI     { [id]: { id, camp, plat, nome, curto, nomeEm? } }
     CFG     { cpaAlvo, orcamento, fee, ticket{}, regrasOff[], assinatura, proximos{} }
             · plano 1000: cpaAlvo/orcamento null = não definidos (sem r1/ritmo); cpaAlvoGoogle (r1 do Google), radar{ctrMin,
               freqMax, r2MinGasto} (limites), silenciados{chave: {desde, ate}} («Silenciar 7 dias»)
             · fee padrão 0 e ticket vazio: receita só com valor real, estimativa SÓ pelo que o cliente configurou
     vertical  'odonto' | 'oficina' | 'loja' | 'generico' — escolhe o vocabulário dos textos (VOCABULARIO)
     REF     Date (meio-dia de ONTEM no fuso do cliente) · DIAS = tamanho da janela
   Índice i: 0 … DIAS-1, onde DIAS-1 = ontem (sempre dia fechado).
   ============================================================ */

/* ============================================================
   1. FORMATAÇÃO
   ============================================================ */
export const fin = v => v != null && Number.isFinite(v);
export const brl = v => fin(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
export const brl0 = v => fin(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";
export const int = v => fin(v) ? Math.round(v).toLocaleString("pt-BR") : "—";
export const pc = (v, d = 1) => fin(v) ? v.toFixed(d).replace(".", ",") + "%" : "—";
export const dec = (v, d = 1) => fin(v) ? v.toFixed(d).replace(".", ",") : "—";
// plano 1000 (AD-021): a aspa simples também — texto em atributo com aspas simples ('…') não quebra o HTML do clássico
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtN = (v, f) => f === "brl" ? brl(v) : f === "brl0" ? brl0(v) : f === "x" ? dec(v, 1) + "x" : int(v);
export const razao = (a, b) => (b ? a / b * 100 : null);
/** Variação percentual. null quando não há base (mesma regra do metricas.js). */
export const variacao = (a, b) => (!fin(a) || !fin(b)) ? null : b === 0 ? (a === 0 ? 0 : null) : (a - b) / b * 100;
export const seta = v => (v == null ? "" : v > .5 ? " ↑" : v < -.5 ? " ↓" : " →");
export const varTxt = (a, b) => { const v = variacao(a, b); return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%${seta(v)}`; };
/** Plano 1000 (AD-012): o parêntese da variação no texto do WhatsApp — sem base não vira «(— vs. dia anterior)»:
    anterior 0 e atual > 0 → «(dia anterior zerado)»; os dois 0 → nada. */
export const varParen = (a, b, depois = "") => {
  const v = variacao(a, b);
  if (v == null) return fin(a) && a > 0 && b === 0 ? " (dia anterior zerado)" : "";
  if (fin(a) && a === 0 && b === 0) return "";
  return ` (${varTxt(a, b)}${depois})`;
};
export const plural = (n, um, varios) => `${int(n)} ${Math.round(n) === 1 ? um : varios}`;
/** Como plural(), mas sem arredondar: o Google manda 1,5 conversão e o texto não pode esconder isso. */
export const pluralDec = (n, um, varios) => `${Number.isInteger(n) ? int(n) : dec(n, 1)} ${n === 1 ? um : varios}`;
// plataforma desconhecida mas presente (lead marcado como anúncio sem dizer de onde) ainda é anúncio
export const nomePlat = p => (p === "meta" ? "Meta" : p === "google" ? "Google" : p ? "Anúncio" : "Sem anúncio");

/** *negrito* e _itálico_ do WhatsApp → HTML (texto escapado antes). */
export const waHtml = txt => esc(txt)
  .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
  .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>")
  .replace(/\n/g, "<br>");

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const SEMANA_LONGA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** Plano 1000 (AD-020): endereço do painel para o fim dos textos do WhatsApp (cfg.painelUrl ou cfg.painel_url) — só https completo. */
export const urlPainel = cfg => {
  const u = String((cfg && (cfg.painelUrl || cfg.painel_url)) || "").trim();
  return /^https:\/\/[^\s<>"']+$/i.test(u) && u.length <= 300 ? u : "";
};
let _avisouPlat = false;
const p2 = n => String(n).padStart(2, "0");

/** "Hoje" no fuso de São Paulo, como YYYY-MM-DD — independente do fuso do servidor. */
export function hojeSP(agora = new Date()) {
  const [d, m, a] = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora).split("/");
  return `${a}-${m}-${d}`;
}
/** Date ao meio-dia (evita pulo de horário de verão) a partir de YYYY-MM-DD. */
export const meioDia = iso => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d, 12, 0, 0, 0); };
export const isoDe = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const DIA_MS = 86400000;
/** Projeção do mês só a partir do 5º dia (plano 1000, AD-006). */
export const DIAS_MIN_PROJECAO = 5;
/** «Google sem acompanhamento de conversões»: janela fixa (plano 1000, AD-005) — igual no painel, no Órbita e no WhatsApp. */
export const JANELA_GOOGLE_SEM_CONV = 30;
const difDias = (a, b) => Math.round((meioDia(isoDe(a)) - meioDia(isoDe(b))) / DIA_MS);

/** Nome curto e legível para campanha/anúncio vindo da plataforma. */
export function encurtar(nome, max = 30) {
  const s = String(nome || "").replace(/^\s*\[[^\]]*\]\s*/, "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s || "—";
}
/** Plano 1000 (AD-220): nome da EMPRESA para o cabeçalho do WhatsApp sem nome curto configurado — corta em palavra inteira e sem
    reticências («Clínica Odontológica Sorriso Feliz» → «Clínica Odontológica»), larga conectivo solto no fim («… de»). */
export function nomeCurtoEmpresa(nome, max = 22) {
  const s = String(nome || "").replace(/\s+/g, " ").trim();
  if (!s) return "Cliente";
  if (s.length <= max) return s;
  const palavras = s.split(" "), out = [];
  for (const p of palavras) { if ((out.join(" ") + (out.length ? " " : "") + p).length > max) break; out.push(p); }
  while (out.length > 1 && /^(de|da|do|das|dos|e|&|-|–|·|em|para)$/i.test(out[out.length - 1])) out.pop();
  return out.length ? out.join(" ") : encurtar(s, max);
}

/* ============================================================
   2. CONFIGURAÇÃO PADRÃO (neutra — plano 100, decisão 5)
   Nada de inventar dinheiro: sem fee de gestão e sem tabela de valores por
   padrão. Receita entra só com o valor real do negócio; a estimativa por
   ticket existe só para o serviço que o cliente configurou em cfg.ticket.
   (A demo odontológica carrega a própria tabela em demo.js.)
   ============================================================ */
// plano 1000 (AD-001): sem meta configurada NÃO há meta — cpaAlvo e orcamento null (antes R$ 15 e R$ 1.500 inventados: o WhatsApp dizia
// «R$ 300 de R$ 1.500 · abaixo do orçamento» e o r1 disparava contra um alvo que ninguém definiu). Com null (ou 0): sem r1, sem ritmo,
// sem medidor; o diário fala só do gasto do mês. A demo traz as próprias metas (demo.js).
export const CFG_PADRAO = {
  cpaAlvo: null,
  orcamento: null,
  fee: 0,
  ticket: {},
  regrasOff: [],
  assinatura: "Equipe Nexus · gestão de tráfego",
  proximos: {},
};
export const cfgCom = cfg => ({
  ...CFG_PADRAO, ...(cfg || {}),
  ticket: { ...((cfg && cfg.ticket) || {}) },
  proximos: { ...((cfg && cfg.proximos) || {}) },
  regrasOff: (cfg && cfg.regrasOff) || [],
});
/** Plano 1000 (AD-001/AD-007): meta e orçamento só valem com valor > 0 (null, 0 ou texto = «não definido»). */
export const temMetaCpa = cfg => Number(cfg && cfg.cpaAlvo) > 0;
export const temOrcamento = cfg => Number(cfg && cfg.orcamento) > 0;
/** Plano 1000 (AD-073): chave de serviço sem acento, caixa nem espaço sobrando («Implante » = «implante»). */
export const chaveServico = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Plano 1000 (AD-054): limites do radar ajustáveis por cliente (cfg.radar) — fora da faixa sensata vale o padrão. */
export const RADAR_PADRAO = Object.freeze({ ctrMin: 0.9, freqMax: 3, r2MinGasto: 22 });
export function limitesRadar(cfg) {
  const r = (cfg && cfg.radar) || {};
  const ok = (v, min, max) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= min && n <= max ? n : null; };
  return { ctrMin: ok(r.ctrMin, 0.05, 10) ?? RADAR_PADRAO.ctrMin, freqMax: ok(r.freqMax, 1.5, 20) ?? RADAR_PADRAO.freqMax, r2MinGasto: ok(r.r2MinGasto, 1, 10000) ?? RADAR_PADRAO.r2MinGasto };
}
/** Plano 1000 (AD-046): «Silenciar 7 dias». cfg.silenciados = {chave: {desde, ate}} (YYYY-MM-DD; também aceita só "ate") →
    {desde, ate} ou null. O silêncio vale de `desde` a `ate`: episódios ANTERIORES continuam no histórico. */
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
export function silencioDe(cfg, chave) {
  const v = cfg && cfg.silenciados && typeof cfg.silenciados === "object" ? cfg.silenciados[chave] : null;
  const ate = typeof v === "string" ? v : v && v.ate, desde = v && typeof v === "object" ? v.desde : null;
  if (typeof ate !== "string" || !RE_ISO.test(ate)) return null;
  return { desde: typeof desde === "string" && RE_ISO.test(desde) ? desde : null, ate };
}
export const silenciado = (cfg, chave, iso) => { const s = silencioDe(cfg, chave); return !!s && (!s.desde || iso >= s.desde) && iso <= s.ate; };

/* ============================================================
   2½. VOCABULÁRIO POR VERTICAL — textos do WhatsApp e do painel
   nx_clientes.vertical nasce 'odonto' (default da coluna); quem monta o
   dataset passa cliente.vertical. Sem o campo fica o vocabulário de sempre.
   ============================================================ */
export const VERTICAL_PADRAO = "odonto";
export const VOCABULARIO = {
  odonto: { emoji: "🦷", pessoa: ["paciente", "pacientes"], novo: ["paciente novo", "pacientes novos"],
    agendada: ["avaliação agendada", "avaliações agendadas"], compareceu: ["compareceu", "compareceram"],
    fechou: ["paciente fechou tratamento", "pacientes fecharam tratamento"], receita: "Tratamentos fechados", receitaEm: "em tratamentos",
    local: "No consultório", servico: "tratamento", servicoPadrao: "Clínica geral",
    // plano 1000 (AD-015): conselhos do mensal por vertical (o vídeo e a prova social que funcionam em cada negócio)
    video: "Gravar 1 vídeo novo — anúncio com rosto de quem atende é o que mais traz conversa.",
    prova: "Pedir aos pacientes satisfeitos um depoimento curto: prova social no anúncio traz conversa mais barata." },
  oficina: { emoji: "🔧", pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"],
    agendada: ["visita agendada", "visitas agendadas"], compareceu: ["veio", "vieram"],
    fechou: ["cliente aprovou o orçamento", "clientes aprovaram o orçamento"], receita: "Serviços aprovados", receitaEm: "em serviços",
    local: "Na oficina", servico: "serviço", servicoPadrao: "Não informado",
    video: "Gravar 1 vídeo novo mostrando um serviço sendo feito na oficina — ver o trabalho de perto é o que mais traz conversa.",
    prova: "Pedir aos clientes satisfeitos uma foto do carro pronto ou um depoimento curto para usar nos anúncios." },
  loja: { emoji: "🛍️", pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"],
    agendada: ["visita agendada", "visitas agendadas"], compareceu: ["veio", "vieram"],
    fechou: ["cliente comprou", "clientes compraram"], receita: "Vendas fechadas", receitaEm: "em vendas",
    local: "Na loja", servico: "produto", servicoPadrao: "Não informado",
    video: "Gravar 1 vídeo novo mostrando os produtos em uso — ver o produto de perto é o que mais traz conversa.",
    prova: "Pedir aos clientes que compraram uma foto ou um depoimento curto para usar nos anúncios." },
  generico: { emoji: "📈", pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"],
    agendada: ["agendamento", "agendamentos"], compareceu: ["compareceu", "compareceram"],
    fechou: ["cliente fechou", "clientes fecharam"], receita: "Vendas fechadas", receitaEm: "em vendas",
    local: "No atendimento", servico: "serviço", servicoPadrao: "Não informado",
    video: "Gravar 1 vídeo novo mostrando quem atende e o que faz — gente de verdade no anúncio traz mais conversa.",
    prova: "Pedir aos clientes satisfeitos um depoimento curto: prova social no anúncio traz conversa mais barata." },
};
export const verticalDe = cliente => (cliente && VOCABULARIO[cliente.vertical] ? cliente.vertical : VERTICAL_PADRAO);
export const vocabulario = vertical => VOCABULARIO[vertical] || VOCABULARIO[VERTICAL_PADRAO];

/* ============================================================
   3. DO BANCO PARA O DATASET
   Recebe o formato de nx_dados (chaves curtas) — o painel e as
   Edge Functions montam o mesmo dataset a partir do mesmo formato.
   ============================================================ */
export const ETAPAS_COM_AVALIACAO = new Set(["orcamento", "fechou", "nao_fechou"]);

export function datasetDeLinhas({ metricas = [], leads = [], cliente = {}, hoje = hojeSP(), dias = 130 }) {
  const DIAS = dias, R = DIAS - 1;
  const REF = meioDia(hoje); REF.setDate(REF.getDate() - 1);
  const idx = iso => (iso ? R - difDias(REF, meioDia(String(iso).slice(0, 10))) : null);

  const CAMP = {}, CRI = {}, LINHAS = [];
  const somaAd = new Map();   // "camp|i" → soma dos anúncios, p/ achar o resíduo da campanha
  const adsDe = new Map();    // "camp|i" → linhas de anúncio (AD-234: ajuste quando a soma passa do total da campanha)
  const DIVERGENCIAS = [];
  const vertical = verticalDe(cliente), VOC = vocabulario(vertical);

  // O nome que vale é o da linha mais RECENTE: o sync só reescreve 7 dias, então o banco guarda a
  // campanha renomeada com dois nomes, e o antigo não pode ganhar só porque veio primeiro.
  const nomear = (alvo, nome, d, max) => {
    if (!nome || (alvo.nomeEm && String(d) < alvo.nomeEm)) return;
    alvo.nome = nome; alvo.curto = encurtar(nome, max); alvo.nomeEm = String(d || "");
  };
  const campDe = (plat, c, nome, d) => {
    const id = `${plat}:${c}`;
    if (!CAMP[id]) CAMP[id] = { id, plat, nome: `Campanha ${c}`, curto: encurtar(`Campanha ${c}`, 26), nomeEm: "" };
    nomear(CAMP[id], nome, d, 26);
    return id;
  };

  for (const m of metricas) {
    if (m.n !== "anuncio") continue;
    const i = idx(m.d);
    if (i == null || i < 0 || i > R) continue;
    const camp = campDe(m.p, m.c, m.cn, m.d);
    // plano 1000 (AD-003): anúncio sem id é um por CAMPANHA (antes «meta:?» juntava todas e ficava com a campanha da 1ª linha)
    const cri = m.a ? `${m.p}:${m.a}` : `${camp}:?`;
    if (!CRI[cri]) CRI[cri] = m.a ? { id: cri, camp, plat: m.p, nome: `Anúncio ${m.a}`, curto: encurtar(`Anúncio ${m.a}`, 28), nomeEm: "" }
      : { id: cri, camp, plat: m.p, nome: "Anúncio sem identificação", curto: "Sem identificação", nomeEm: "" };
    nomear(CRI[cri], m.an, m.d, 28);
    const l = { i, plat: m.p, camp, cri, gasto: +m.g || 0, impressoes: +m.imp || 0, alcance: +m.alc || 0,
                cliques: +m.cli || 0, conversoes: +m.conv || 0, freq: +m.freq > 0 ? +m.freq : null };
    LINHAS.push(l);
    const k = `${camp}|${i}`, s = somaAd.get(k) || { g: 0, imp: 0, cli: 0, conv: 0 };
    s.g += l.gasto; s.imp += l.impressoes; s.cli += l.cliques; s.conv += l.conversoes;
    somaAd.set(k, s);
    if (!adsDe.has(k)) adsDe.set(k, []);
    adsDe.get(k).push(l);
  }
  // Campanha sem detalhe por anúncio (Performance Max, por exemplo) ou com
  // diferença entre o total da campanha e a soma dos anúncios: o resíduo vira
  // um "criativo" próprio — senão o gasto some do painel.
  for (const m of metricas) {
    if (m.n !== "campanha") continue;
    const i = idx(m.d);
    if (i == null || i < 0 || i > R) continue;
    const camp = campDe(m.p, m.c, m.cn, m.d);
    const s = somaAd.get(`${camp}|${i}`) || { g: 0, imp: 0, cli: 0, conv: 0 };
    const g = (+m.g || 0) - s.g, conv = Math.max(0, (+m.conv || 0) - s.conv);
    // plano 1000 (AD-234): a soma dos anúncios PASSOU do total da campanha (sync dos anúncios mais novo que o da campanha, reatribuição):
    // antes o resíduo virava 0 sem aviso e o painel mostrava mais gasto que a plataforma cobrou. Agora vale o total da CAMPANHA (os
    // anúncios do dia são reescalados na mesma proporção) e a divergência fica registrada em DIVERGENCIAS
    if (g < -0.01) {
      const total = +m.g || 0;
      DIVERGENCIAS.push({ camp, i, campanha: total, anuncios: s.g });
      if (total > 0 && s.g > 0) { const f = total / s.g; for (const l of adsDe.get(`${camp}|${i}`) || []) l.gasto *= f; }
    }
    if (g <= 0.01 && conv < 1) continue;
    const cri = `${camp}:outros`;
    if (!CRI[cri]) CRI[cri] = { id: cri, camp, plat: m.p, nome: "Outros anúncios da campanha", curto: "Outros anúncios" };
    LINHAS.push({ i, plat: m.p, camp, cri, gasto: Math.max(0, g), impressoes: Math.max(0, (+m.imp || 0) - s.imp),
                  alcance: 0, cliques: Math.max(0, (+m.cli || 0) - s.cli), conversoes: conv, freq: null });
  }

  const ORIGEM = { indicacao: "Indicação", organico: "Orgânico", whatsapp: "WhatsApp direto", manual: "Cadastro manual", site: "Site" };
  const LEADS = [];
  for (const L of leads) {
    const i = idx(L.data_conversa);
    if (i == null) continue;
    let camp = null, cri = null, plat = L.plataforma || null;
    // orgânico (link da bio com utm_campaign=bio, «vi no Instagram») guarda plataforma e às vezes o texto da campanha, mas
    // NÃO é anúncio: nada de campanha/criativo — senão a venda orgânica virava receita de anúncio (mesma régua de Vendas)
    const organico = L.origem === "organico";
    if (L.anuncio_ext && plat && !organico) {
      cri = `${plat}:${L.anuncio_ext}`;
      if (CRI[cri]) camp = CRI[cri].camp;
    }
    // plano 1000 (AD-004): campanha_ext que NÃO veio das métricas (utm escrita à mão, «black-friday») não cria campanha fantasma
    // sem gasto (ela entrava no «Anúncio que mais trouxe resultado» do mensal): vai para o balde, guardando o texto do utm
    let utmSolto = null;
    if (!camp && L.campanha_ext && plat && !organico) {
      if (CAMP[`${plat}:${L.campanha_ext}`]) camp = `${plat}:${L.campanha_ext}`;
      else utmSolto = String(L.campanha_ext).slice(0, 80);
    }
    if (!camp && (L.origem === "anuncio" || utmSolto)) {
      // veio de anúncio, mas nem campanha nem anúncio foram reconhecidos (métrica ainda não sincronizada,
      // importação sem ids, utm sem casamento): balde próprio DENTRO do funil — a coluna origem manda.
      // Só a origem «anuncio» entra aqui: plataforma sozinha NÃO é anúncio (link da bio do Instagram e «vi no Instagram»
      // gravam origem «organico» com plataforma «meta» — esses ficam fora do funil, em org:organico)
      plat = plat || "anuncio";
      camp = `${plat}:nao_identificada`;
      if (!CAMP[camp]) CAMP[camp] = { id: camp, plat, nome: "Anúncio sem campanha identificada", curto: "Sem campanha identificada", semCampanha: true, utms: [] };
      if (utmSolto && CAMP[camp].utms && !CAMP[camp].utms.includes(utmSolto)) CAMP[camp].utms.push(utmSolto);
    }
    if (!camp) {
      // sem anúncio: vira uma "campanha" de origem, fora do funil de anúncios
      const o = L.origem || "whatsapp";
      camp = `org:${o}`;
      if (!CAMP[camp]) CAMP[camp] = { id: camp, plat: null, nome: ORIGEM[o] || o, curto: ORIGEM[o] || o };
      plat = null;
    }
    const etapa = L.etapa || "nova";
    const iConsulta = idx(L.data_consulta);
    const temAvaliacao = ETAPAS_COM_AVALIACAO.has(etapa) || etapa === "faltou";
    LEADS.push({
      id: L.id, i, camp, cri, plat, servico: L.servico || VOC.servicoPadrao, nome: L.nome || "Sem nome", telefone: L.telefone || "",
      obs: L.obs || "", origem: L.origem, etapaReal: etapa,
      iAgenda: L.data_agenda ? idx(L.data_agenda) : (etapa !== "nova" && etapa !== "perdida" ? i : null),
      // plano 1000 (AD-023): sem data_agenda o agendamento cai no dia da CONVERSA — marcado para a tela dizer quantos são estimados
      agendaEstimada: !L.data_agenda && etapa !== "nova" && etapa !== "perdida",
      // marcou "veio/fechou" sem dizer quando: conta no dia do agendamento (ou da conversa)
      iConsulta: iConsulta != null ? iConsulta : (temAvaliacao ? (L.data_agenda ? idx(L.data_agenda) : i) : null),
      compareceu: ETAPAS_COM_AVALIACAO.has(etapa),
      fechou: etapa === "fechou",
      valor: L.valor != null ? +L.valor : null,
      bruto: L,
    });
  }
  // AD-220: sem nome curto configurado, corta em palavra inteira (antes «Clínica Odontológica S…» no cabeçalho do WhatsApp)
  return { LINHAS, LEADS, CAMP, CRI, CFG: cfgCom(cliente.cfg), REF, DIAS, vertical, DIVERGENCIAS, nome: cliente.nome || "", curto: (cliente.cfg && cliente.cfg.nomeCurto) || nomeCurtoEmpresa(cliente.nome || "Cliente", 22) };
}

/* ============================================================
   4. O MOTOR — tudo que depende do dataset
   ============================================================ */
export function montar(ds) {
  const { LINHAS, LEADS, CAMP, CRI, REF, DIAS } = ds;
  const CFG = cfgCom(ds.CFG);
  const R = DIAS - 1;
  const NOME = ds.curto || ds.nome || "Cliente";
  const vertical = VOCABULARIO[ds.vertical] ? ds.vertical : VERTICAL_PADRAO, VOC = vocabulario(vertical);

  const dataDe = i => { const d = new Date(REF); d.setDate(d.getDate() + (i - R)); return d; };
  const ddmm = i => { const d = dataDe(i); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
  const dataBR = i => { const d = dataDe(i); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const dMes = i => { const d = dataDe(i); return `${d.getDate()} de ${MES3[d.getMonth()]}`; };
  const DATAS = Array.from({ length: DIAS }, (_, i) => dataDe(i));

  /* ---------- matemática (porte do metricas.js) ---------- */
  function consolidar(ls) {
    const t = { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, conversoes: 0 };
    let fp = 0, fs = 0;
    for (const l of ls) {
      t.gasto += l.gasto; t.impressoes += l.impressoes; t.alcance += l.alcance;
      t.cliques += l.cliques; t.conversoes += l.conversoes;
      // frequência não soma: média ponderada por impressões
      if (l.freq) { fs += l.freq * l.impressoes; fp += l.impressoes; }
    }
    t.freq = fp > 0 ? fs / fp : null;
    t.ctr = t.impressoes > 0 ? t.cliques / t.impressoes * 100 : null;
    t.cpc = t.cliques > 0 ? t.gasto / t.cliques : null;
    t.cpm = t.impressoes > 0 ? t.gasto / t.impressoes * 1000 : null;
    t.cpa = t.conversoes > 0 ? t.gasto / t.conversoes : null;   // custo por conversa
    return t;
  }
  // plano 1000 (AD-025/AD-026): índices montados UMA vez — por dia, por campanha e por criativo, guardando a posição em LINHAS (a ordem
  // do resultado é a mesma do filtro antigo: somas em ponto flutuante não mudam). Antes cada linhasDe varria o array inteiro: o radar
  // (14 avaliações × regras) e as tabelas (campanhas × criativos) ficavam O(campanhas × linhas) no celular
  const PORDIA = Array.from({ length: DIAS }, () => []), PORCAMP = new Map(), PORCRI = new Map();
  let foraDaJanela = false;
  LINHAS.forEach((l, n) => {
    if (Number.isInteger(l.i) && l.i >= 0 && l.i <= R) PORDIA[l.i].push(n); else foraDaJanela = true;
    if (!PORCAMP.has(l.camp)) PORCAMP.set(l.camp, []);
    PORCAMP.get(l.camp).push(n);
    if (!PORCRI.has(l.cri)) PORCRI.set(l.cri, []);
    PORCRI.get(l.cri).push(n);
  });
  const linhasDe = (de, ate, f = {}) => {
    const ok = l => l.i >= de && l.i <= ate && (!f.plat || l.plat === f.plat) && (!f.camp || l.camp === f.camp) && (!f.cri || l.cri === f.cri);
    let base;
    if (f.cri) base = PORCRI.get(f.cri) || [];
    else if (f.camp) base = PORCAMP.get(f.camp) || [];
    else {
      const a = Math.max(0, Math.ceil(de)), b = Math.min(R, Math.floor(ate));
      if (foraDaJanela || b - a + 1 > DIAS / 2) return LINHAS.filter(ok);    // janela larga: o filtro direto é mais barato
      base = [];
      for (let i = a; i <= b; i++) for (const n of PORDIA[i]) base.push(n);
      if (b > a) base.sort((x, y) => x - y);
    }
    const out = [];
    for (const n of base) { const l = LINHAS[n]; if (ok(l)) out.push(l); }
    return out;
  };

  /** Quanto vale o negócio: o valor informado; senão a estimativa pelo ticket que o CLIENTE configurou para o
      serviço; senão nada (semValor) — nunca um número inventado por tabela padrão. */
  // plano 1000 (AD-073): o ticket «implante» casa com o serviço «Implante» do CRM (sem acento/caixa); a grafia exata vence
  const TICKET_N = new Map(Object.entries(CFG.ticket).map(([k, v]) => [chaveServico(k), v]));
  const valorDe = L => {
    if (L.valor != null) return { valor: L.valor, estimado: false, semValor: false };
    const t = CFG.ticket[L.servico] ?? TICKET_N.get(chaveServico(L.servico));
    if (!(t > 0)) return { valor: 0, estimado: false, semValor: true };
    return { valor: Math.round(t * (L.fator || 1) / 10) * 10, estimado: true, semValor: false };
  };
  const valorLead = L => valorDe(L).valor;

  /** Em que pé cada paciente está HOJE. */
  function etapa(L) {
    if (L.etapaReal) return L.etapaReal;
    if (L.iAgenda == null) return L.i >= R - 2 ? "nova" : "perdida";
    if (L.iAgenda > R) return "nova";
    if (L.iConsulta > R) return "agendada";
    if (!L.compareceu) return "faltou";
    if (L.fechou) return "fechou";
    return L.iConsulta >= R - 6 ? "orcamento" : "nao_fechou";
  }

  /** O que o consultório viu no período, pela data de cada evento. Orgânicos ficam de fora
      por padrão: o funil é dos ANÚNCIOS (f.organicos = true inclui). */
  function crmTot(de, ate, f = {}) {
    // receita = receitaReal + receitaEstimada; semValor = fechamentos que não entram em nenhuma das duas
    // semPresenca (plano 1000, AD-022): consulta que JÁ passou e segue «agendada» — nem veio nem faltou; contada à parte para a taxa
    // de comparecimento não subir em silêncio
    // agendaSemData (AD-023): agendamentos sem data_agenda, contados no dia da conversa — a tela diz quantos são
    const c = { conversas: 0, agendadas: 0, agendaSemData: 0, compareceram: 0, faltaram: 0, semPresenca: 0, fecharam: 0, receita: 0, receitaReal: 0, receitaEstimada: 0, semValor: 0, serv: {} };
    for (const L of LEADS) {
      if (!L.plat && !f.organicos) continue;
      if (f.plat && L.plat !== f.plat) continue;
      if (f.camp && L.camp !== f.camp) continue;
      if (L.i >= de && L.i <= ate) c.conversas++;
      if (L.iAgenda != null && L.iAgenda >= de && L.iAgenda <= ate) { c.agendadas++; if (L.agendaEstimada) c.agendaSemData++; }
      if (L.iConsulta != null && L.iConsulta >= de && L.iConsulta <= ate && L.iConsulta <= R) {
        if (!L.compareceu) {
          if (etapa(L) === "faltou" || !L.etapaReal) c.faltaram++;
          else if (L.etapaReal === "agendada") c.semPresenca++;
          continue;
        }
        c.compareceram++;
        if (L.fechou) {
          const { valor: v, estimado, semValor } = valorDe(L);
          c.fecharam++; c.receita += v;
          if (estimado) c.receitaEstimada += v; else c.receitaReal += v;
          if (semValor) c.semValor++;
          const s = c.serv[L.servico] || (c.serv[L.servico] = { n: 0, v: 0 });
          s.n++; s.v += v;
        }
      }
    }
    return c;
  }
  /** Trecho de texto honesto sobre a receita de um crmTot: valor, "(estimativa)" ou "sem valor informado". */
  const receitaTxt = c => c.receita > 0
    ? `${brl0(c.receita)} ${VOC.receitaEm}${c.receitaEstimada > 0 ? " (estimativa)" : ""}`
    : c.semValor > 0 ? `${c.semValor === 1 ? "1 fechamento" : `${c.semValor} fechamentos`} sem valor informado` : "";

  const _serie = {};
  function porDia(plat) {
    const k = plat || "";
    if (_serie[k]) return _serie[k];
    const z = () => new Array(DIAS).fill(0);
    // plano 1000 (AD-002): plataforma fora de meta/google (tiktok, uma futura) cai em «outras» — antes s[l.plat] era undefined e a tela inteira caía
    const s = { meta: z(), google: z(), outras: z(), conv: z(), ag: z(), fe: z(), rec: z() };
    for (const l of LINHAS) {
      if (plat && l.plat !== plat) continue;
      const balde = l.plat === "meta" || l.plat === "google" ? l.plat : "outras";
      if (balde === "outras" && !_avisouPlat) { _avisouPlat = true; try { globalThis.console?.warn?.(`[nucleo] plataforma desconhecida nas métricas: ${String(l.plat).slice(0, 20)} (somada em «outras»)`); } catch { /* sem console */ } }
      s[balde][l.i] += l.gasto; s.conv[l.i] += l.conversoes;
    }
    for (const L of LEADS) {
      if (!L.plat || (plat && L.plat !== plat)) continue;
      if (L.iAgenda != null && L.iAgenda >= 0 && L.iAgenda <= R) s.ag[L.iAgenda]++;
      if (L.iConsulta != null && L.iConsulta >= 0 && L.iConsulta <= R && L.fechou) { s.fe[L.iConsulta]++; s.rec[L.iConsulta] += valorLead(L); }
    }
    return (_serie[k] = s);
  }
  const soma7 = (arr, i) => { let s = 0; for (let j = Math.max(0, i - 6); j <= i; j++) s += arr[j]; return s; };
  const media7 = (arr, i) => soma7(arr, i) / (Math.min(i, 6) + 1);

  /** Mesma régua (tolerância de 2%) no radar, no cartão de ritmo e no relatório. */
  // AD-001/AD-007: sem orçamento (null/0) não há régua — situacaoOrc devolve "" e quem chama não pinta comparação
  const ORC = temOrcamento(CFG) ? +CFG.orcamento : null, META_CPA = temMetaCpa(CFG) ? +CFG.cpaAlvo : null;
  const META_CPA_G = Number(CFG.cpaAlvoGoogle) > 0 ? +CFG.cpaAlvoGoogle : null;          // AD-010: meta própria do Google (opcional)
  const LIM = limitesRadar(CFG);                                                            // AD-054
  const situacaoOrc = proj => !ORC ? "" : proj > CFG.orcamento * 1.02 ? "🔺 acima do orçamento"
    : proj >= CFG.orcamento * .98 ? "≈ no limite do orçamento" : "🔻 abaixo do orçamento";

  function ritmoMes(ref) {
    const d = dataDe(ref), mes = d.getMonth(), ano = d.getFullYear();
    const ini = Math.max(0, ref - (d.getDate() - 1));
    const gasto = linhasDe(ini, ref).reduce((s, l) => s + l.gasto, 0);
    const diasMes = new Date(ano, mes + 1, 0).getDate(), pass = d.getDate();
    // plano 1000 (AD-006): com 1–4 dias a projeção linear é ruído (R$ 200 no dia 1 «fecha em R$ 6.200») — `cedo` cala o radar e os textos
    return { mes, ano, gasto, pass, diasMes, restam: diasMes - pass, proj: gasto / pass * diasMes, cedo: pass < DIAS_MIN_PROJECAO };
  }

  function mesesDados() {
    const m = new Map();
    for (let i = 0; i < DIAS; i++) {
      const d = DATAS[i], k = d.getFullYear() * 12 + d.getMonth();
      if (!m.has(k)) m.set(k, { mes: d.getMonth(), ano: d.getFullYear(), de: i, ate: i });
      else m.get(k).ate = i;
    }
    return [...m.values()].map(x => ({
      ...x,
      completo: DATAS[x.de].getDate() === 1 && DATAS[x.ate].getDate() === new Date(x.ano, x.mes + 1, 0).getDate(),
    }));
  }

  /* ---------- radar (porte do radar.js) ---------- */
  const CMP = { ">": (a, b) => a > b, "<": (a, b) => a < b, ">=": (a, b) => a >= b, "<=": (a, b) => a <= b };
  const FMT_MET = { cpa: brl, ctr: v => pc(v, 2), freq: v => dec(v, 1), conversoes: int };
  const REGRAS = [
    // janela de 14 dias: com 2–3 conversas por semana, 7 dias oscila só pelo arredondamento
    // plano 1000 (AD-001): sem meta configurada a r1 não roda (semMeta); AD-010: a meta (cpaAlvo) é de CONVERSA no WhatsApp — o Google
    // (conversão de pesquisa custa 2–3×) só entra com cfg.cpaAlvoGoogle. limiteDe(plat) = meta da plataforma × 1,35 ou null (não avalia)
    { id: "r1", nome: "Custo por conversa alto", nivel: "campanha", metrica: "cpa", op: ">",
      limiteDe: plat => (plat === "google" ? (META_CPA_G ? META_CPA_G * 1.35 : null) : (META_CPA ? META_CPA * 1.35 : null)),
      limite: () => (META_CPA ? META_CPA * 1.35 : META_CPA_G ? META_CPA_G * 1.35 : null),
      metaDe: plat => (plat === "google" ? META_CPA_G : META_CPA), semMeta: !META_CPA && !META_CPA_G,
      janela: 14, minGasto: 60, minImpr: 0, sev: "alerta",
      msg: "{entidade} está pagando {valor} por {conv1} nos últimos {janela} dias (limite {limite}).",
      acao: (n, plat) => `Reduzir a verba de “${n}” até o custo por ${plat === "google" ? "conversão" : "conversa"} voltar para perto de ${brl(plat === "google" ? META_CPA_G : META_CPA)}.` },
    // {conv}: o Meta conta conversas no WhatsApp; o Google conta conversões (acompanhamento configurado na conta)
    { id: "r2", nome: "Campanha sem conversa", nivel: "campanha", metrica: "conversoes", op: "<=", limite: () => 0,
      janela: 3, minGasto: LIM.r2MinGasto, minImpr: 0, sev: "critico",
      msg: "{entidade} gastou {gasto} em {janela} dias sem nenhuma {conv}.",
      acao: (n, plat) => (plat === "google"
        ? `Checar “${n}”: gastou sem registrar conversão (acompanhamento de conversões ligado? link do WhatsApp?).`
        : `Checar “${n}”: gastou sem trazer conversa (anúncio reprovado? link do WhatsApp?).`) },
    { id: "r3", nome: "Criativo com CTR baixo", nivel: "anuncio", plat: "meta", metrica: "ctr", op: "<", limite: () => LIM.ctrMin,
      janela: 3, minGasto: 0, minImpr: 300, sev: "alerta",
      msg: "O criativo {entidade} está com CTR de {valor} — pouca gente clicando (limite {limite}).",
      acao: n => `Trocar o criativo “${n}” — quase ninguém está clicando.` },
    { id: "r4", nome: "Fadiga de criativo", nivel: "anuncio", plat: "meta", metrica: "freq", op: ">", limite: () => LIM.freqMax,
      janela: 7, minGasto: 0, minImpr: 300, sev: "info",
      msg: "{entidade} já apareceu {valor} vezes para as mesmas pessoas — hora de trocar o criativo.",
      acao: n => `Subir uma versão nova do criativo “${n}”: o público já cansou dele.` },
    // plano 1000 (AD-235/AD-237): regras da CONTA inteira (especial: não passam pelo laço genérico; `descricao` substitui a condição montada)
    { id: "r5", nome: "Investimento parou de repente", nivel: "conta", especial: true, sev: "critico", janela: 8, metrica: null,
      descricao: "Gasto de ontem abaixo de 30% da média dos 7 dias anteriores (média de pelo menos R$ 20/dia, em 5 dos 7 dias) · conta inteira",
      descricaoLeiga: "Os anúncios pararam de gastar de um dia para o outro" },
    { id: "r6", nome: "CRM parou de receber as conversas do Meta", nivel: "conta", especial: true, sev: "alerta", janela: 3, metrica: null,
      descricao: "Em 3 dias o CRM recebeu menos de 40% das conversas que o Meta contou (mín. 6), quando nas 2 semanas antes recebia · conta inteira",
      descricaoLeiga: "O Meta conta conversas que não chegam ao CRM" },
  ].map(r => ({ ...r, ativa: !CFG.regrasOff.includes(r.id) && !r.semMeta }));
  // AD-010/AD-001: a r1 descreve a régua de CADA plataforma (ou que está parada por falta de meta) — tela e clássico leem `descricao`
  {
    const r1 = REGRAS.find(r => r.id === "r1");
    const pedaco = (p, meta) => `${p === "google" ? "Google: custo por conversão" : "Meta: custo por conversa"} acima de ${brl(meta * 1.35)} (meta ${brl(meta)} + 35%)`;
    r1.descricao = r1.semMeta ? "Sem meta de custo por conversa definida: a regra fica parada até a meta ser preenchida em Ajustes de anúncios."
      : [META_CPA ? pedaco("meta", META_CPA) : "Meta: sem meta definida", META_CPA_G ? pedaco("google", META_CPA_G) : "Google: fora (sem meta própria de custo por conversão)"].join(" · ") +
        ` · ${r1.janela} dias · por campanha · gasto mínimo ${brl0(r1.minGasto)}`;
    r1.descricaoLeiga = r1.semMeta ? "Parada: ainda não há meta de custo por conversa"
      : `Avisa quando cada conversa passa de ${brl((META_CPA || META_CPA_G) * 1.35)} (olhando ${r1.janela} dias, por campanha)`;
  }
  const REGRA = id => REGRAS.find(r => r.id === id);
  // AD-008: o informativo de ritmo também se desliga (regrasOff «ritmo»); AD-001/AD-007: sem orçamento > 0 não existe
  const RITMO = { id: "ritmo", nome: "Ritmo do orçamento", ativa: !CFG.regrasOff.includes("ritmo") && !!ORC, semMeta: !ORC };
  const ORD = { critico: 0, alerta: 1, info: 2 };
  const ICONE = { critico: "🔴", alerta: "🟠", info: "🔵" };

  // conta Google que gastou e não registrou NENHUMA conversão no período carregado: o acompanhamento de conversões não está
  // ligado — «Campanha sem conversa» de cada campanha Google seria um alarme falso por dia (a tela mostra um aviso único;
  // a mesma régua de rel-logica.googleSemConversao, e agora o WhatsApp do nx-ciclo também para de mandar)
  // plano 1000 (AD-005): janela FIXA dos últimos 30 dias (R−29..R) — o ciclo carrega 45 dias e o painel 130; somando tudo o que veio,
  // a conta que parou de converter há 60 dias era «sem acompanhamento» no WhatsApp e «r2 crítico» no painel
  let gG = 0, cG = 0;
  for (const l of LINHAS) if (l.plat === "google" && l.i >= R - JANELA_GOOGLE_SEM_CONV + 1 && l.i <= R) { gG += +l.gasto || 0; cG += +l.conversoes || 0; }
  const GOOGLE_SEM_CONVERSAO = gG > 0 && cG === 0;

  /** r5 / r6: regras da conta inteira, avaliadas no dia `ref`. */
  function avaliarConta(ref) {
    const out = [];
    const r5 = REGRA("r5");
    if (r5 && r5.ativa && ref >= 7) {
      const gDia = new Array(8).fill(0);
      for (const l of linhasDe(ref - 7, ref)) gDia[l.i - (ref - 7)] += +l.gasto || 0;
      const antes = gDia.slice(0, 7), media = antes.reduce((a, b) => a + b, 0) / 7, comGasto = antes.filter(g => g > 0.009).length, hoje = gDia[7];
      if (media >= 20 && comGasto >= 5 && hoje < media * 0.3) {
        out.push({ regra: r5, chave: "r5|conta", sev: r5.sev, valor: hoje,
          msg: `O investimento caiu de ${brl0(media)} por dia (média dos 7 dias anteriores) para ${brl(hoje)} em ${ddmm(ref)}: cartão recusado, anúncio reprovado ou saldo zerado?`,
          acao: "Abrir o Gerenciador de anúncios e conferir a forma de pagamento, o saldo e se algum anúncio foi reprovado." });
      }
    }
    const r6 = REGRA("r6");
    if (r6 && r6.ativa && ref >= 16) {
      const conta = (de, ate) => {
        let meta = 0, crm = 0;
        for (const l of linhasDe(de, ate, { plat: "meta" })) meta += +l.conversoes || 0;
        for (const Ld of LEADS) if (Ld.plat === "meta" && Ld.i >= de && Ld.i <= ate) crm++;
        return { meta, crm };
      };
      const agora = conta(ref - 2, ref), antes = conta(ref - 16, ref - 3);
      // só alarma QUEDA: quem nunca usou o CRM (antes também < 40%) não recebe aviso diário
      if (agora.meta >= 6 && agora.crm < agora.meta * 0.4 && antes.meta >= 10 && antes.crm >= antes.meta * 0.4) {
        out.push({ regra: r6, chave: "r6|meta", sev: r6.sev, valor: agora.crm,
          msg: `Nos últimos 3 dias o Meta contou ${plural(agora.meta, "conversa", "conversas")}, mas só ${int(agora.crm)} ${agora.crm === 1 ? "chegou" : "chegaram"} ao CRM (antes chegavam ${pc(antes.crm / antes.meta * 100, 0)}).`,
          acao: "Conferir se o número de WhatsApp do anúncio é o conectado ao Órbita e se o aparelho está online." });
      }
    }
    return out;
  }

  /** Plano 1000 (AD-134): avaliar/historico guardados por M (o dataset não muda depois de montado) — trocar período ou plataforma na tela
      redesenha sem refazer o radar. Cada chamada devolve uma CÓPIA da lista (quem filtra/ordena não estraga o guardado). */
  const CONTAGEM = { avaliar: 0, historico: 0 };
  const normNome = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  /** AD-053: «Criativo curto (em Campanha curta)», sem a campanha quando um nome já contém o outro. */
  const nomeCriativoAlerta = (k, camp) => {
    const nk = (k && (k.curto || k.nome)) || "Criativo", nc = camp ? camp.curto || camp.nome : "";
    const a = normNome(String(nk).replace(/…$/, "")), b = normNome(String(nc).replace(/…$/, ""));
    return !b || (a && (a.includes(b) || b.includes(a))) ? nk : `${nk} (em ${nc})`;
  };
  const _aval = new Map();
  let _hist = null;
  function avaliar(ref, comRitmo = false) {
    const k = `${ref}|${comRitmo ? 1 : 0}`;
    if (!_aval.has(k)) _aval.set(k, avaliarAgora(ref, comRitmo));
    return _aval.get(k).slice();
  }
  /** Plano 1000 (AD-238): remarketing tem frequência alta POR DESENHO — a fadiga (r4) não acusa campanha marcada como remarketing
      (nome com remarketing/retargeting/rmkt ou id em cfg.remarketing). */
  const RE_REMARKETING = /remarketing|retargeting|\brmkt\b|\brmk\b|p[uú]blico quente/i;
  const ehRemarketing = camp => !!camp && (RE_REMARKETING.test(String(camp.nome || "")) || (Array.isArray(CFG.remarketing) && CFG.remarketing.includes(camp.id)));
  function avaliarAgora(ref, comRitmo) {
    CONTAGEM.avaliar++;
    const out = [...avaliarConta(ref)];
    for (const r of REGRAS) {
      if (!r.ativa || r.especial) continue;
      const de = ref - r.janela + 1, grupos = new Map();
      for (const l of linhasDe(de, ref, { plat: r.plat })) {
        const k = r.nivel === "campanha" ? l.camp : l.cri;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(l);
      }
      for (const [k, ls] of grupos) {
        const t = consolidar(ls);
        // o gasto é soma de centavos em ponto flutuante (1,16 + 14,87 + 5,97 = 21,999999999999996): compara em centavos, senão gasto
        // exatamente igual ao mínimo da regra deixava de alertar
        if (Math.round(t.gasto * 100) < Math.round(r.minGasto * 100) || t.impressoes < r.minImpr) continue;
        const v = t[r.metrica];
        if (!fin(v)) continue;          // sem base (CPA sem conversa) — coberto pela r2
        const camp = r.nivel === "campanha" ? CAMP[k] : CAMP[CRI[k].camp];
        const lim = r.limiteDe ? r.limiteDe(camp && camp.plat) : r.limite();
        if (lim == null || !CMP[r.op](v, lim)) continue;     // AD-010: Google sem meta própria não entra na r1
        if (r.id === "r2" && GOOGLE_SEM_CONVERSAO && camp.plat === "google") continue;
        if (r.id === "r4" && ehRemarketing(camp)) continue;
        // plano 1000 (AD-009): «sem conversa» só com gasto em 2 dias ou mais da janela — campanha que estreou ontem ainda não teve tempo
        if (r.id === "r2" && new Set(ls.filter(l => (+l.gasto || 0) > 0).map(l => l.i)).size < 2) continue;
        // um criativo pode rodar em várias campanhas: a campanha vai junto no aviso
        // plano 1000 (AD-053): no criativo, o nome CURTO; a campanha só quando o nome do criativo não a contém (antes «Print das avaliações
        // 5,0 (em Prova social · nota 5,0)» passava de 100 caracteres no WhatsApp)
        const nome = r.nivel === "campanha" ? camp.nome : nomeCriativoAlerta(CRI[k], camp);
        const f = FMT_MET[r.metrica];
        out.push({
          regra: r, chave: `${r.id}|${k}`, sev: r.sev, valor: v,
          msg: r.msg.replace("{entidade}", nome).replace("{valor}", f(v)).replace("{limite}", f(lim))
            .replace("{janela}", r.janela).replace("{gasto}", brl(t.gasto))
            .replace("{conv}", camp.plat === "google" ? "conversão registrada" : "conversa no WhatsApp")
            .replace("{conv1}", camp.plat === "google" ? "conversão" : "conversa"),
          acao: r.acao(r.nivel === "campanha" ? camp.curto : CRI[k].curto, camp.plat),
        });
      }
    }
    if (comRitmo && RITMO.ativa) {
      const m = ritmoMes(ref);
      if (m.restam > 0 && !m.cedo && m.proj > CFG.orcamento * 1.02) {
        const excesso = m.proj - CFG.orcamento;
        out.push({
          regra: RITMO, chave: "ritmo", sev: "info", valor: m.proj,
          msg: `No ritmo atual, ${MESES[m.mes]} fecha em ${brl0(m.proj)} — ${brl0(excesso)} acima do orçamento de ${brl0(CFG.orcamento)}.`,
          acao: `Segurar ${brl(excesso / m.restam)} por dia até o fim do mês para fechar dentro do orçamento.`,
        });
      }
    }
    // AD-046: «Silenciar 7 dias» — a chave silenciada some do radar, do histórico e do WhatsApp (o ciclo usa este avaliar) até a data
    const isoRef = isoDe(dataDe(ref));
    return out.filter(a => !silenciado(CFG, a.chave, isoRef)).sort((a, b) => ORD[a.sev] - ORD[b.sev]);
  }

  /** Últimos 14 dias agrupados em episódios ("desde quando", "ainda ativo?"). AD-134: calculado uma vez por M. */
  function historico() {
    if (!_hist) _hist = historicoAgora();
    return _hist.map(e => ({ ...e }));
  }
  function historicoAgora() {
    CONTAGEM.historico++;
    const eps = [], ult = new Map();
    for (let ref = R - 13; ref <= R; ref++) {
      for (const a of avaliar(ref)) {
        const e = ult.get(a.chave);
        // 1 dia de folga ainda é o mesmo episódio: alerta que "pisca" não vira dois itens
        if (e && e.ate >= ref - 2) { e.ate = ref; e.a = a; }
        else { const n = { desde: ref, ate: ref, a }; eps.push(n); ult.set(a.chave, n); }
      }
    }
    const rit = avaliar(R, true).find(a => a.chave === "ritmo");
    if (rit) eps.push({ desde: R, ate: R, a: rit });
    return eps.sort((x, y) => (y.ate - x.ate) || (ORD[x.a.sev] - ORD[y.a.sev]) || (x.desde - y.desde));
  }

  const PAINEL = urlPainel(CFG);
  /** Plano 1000 (AD-019/AD-020): cada item leva a ação sugerida («👉 …»); no máximo 3 itens + «e mais N no painel»; com o endereço
      do painel configurado (cfg.painelUrl), a última linha é o link. */
  function textoAlerta(as) {
    if (!as.length) return `📡 *${NOME} · Radar de tráfego*\n\nNenhuma regra disparou: todas as campanhas dentro dos limites. ✅`;
    const crit = as.filter(a => a.sev === "critico").length;
    const cab = crit
      ? `⚠️ *${NOME} · Radar de tráfego* — ${crit} ${crit === 1 ? "item crítico" : "itens críticos"}`
      : `📡 *${NOME} · Radar de tráfego*`;
    const MAX = 3, itens = as.slice(0, MAX).map(a => `${ICONE[a.sev] || "•"} ${a.msg}${a.acao ? `\n👉 ${a.acao}` : ""}`);
    const resto = as.length - MAX;
    if (resto > 0) itens.push(`… e mais ${resto} ${resto === 1 ? "item" : "itens"} no painel.`);
    const fim = PAINEL ? `_Avaliado sobre dias fechados. Histórico no painel:_ ${PAINEL}` : "_Avaliado sobre dias fechados. Abra o painel para ver o histórico._";
    return `${cab}\n\n${itens.join("\n\n")}\n\n${fim}`;
  }

  /* ---------- relatórios (formato do relatorio.js) ---------- */
  function leituraDia(ref, sem, al) {
    const ant = consolidar(linhasDe(ref - 13, ref - 7)), out = [];
    const crit = al.find(a => a.sev === "critico");
    if (crit) out.push(`• Prioridade: ${crit.acao}`);
    if (fin(sem.cpa) && fin(ant.cpa)) {
      const v = variacao(sem.cpa, ant.cpa);
      if (v <= -5) out.push(`• Custo por conversa da semana caiu ${Math.abs(v).toFixed(0)}% (${brl(ant.cpa)} → ${brl(sem.cpa)}). Manter o que está rodando.`);
      else if (v >= 8) out.push(`• Custo por conversa subiu ${v.toFixed(0)}% na semana (${brl(ant.cpa)} → ${brl(sem.cpa)}).`);
      else out.push(`• Custo por conversa estável na semana (${brl(sem.cpa)}).`);
    }
    al.filter(a => a.sev !== "critico").slice(0, 2).forEach(a => out.push(`• ${a.acao}`));
    if (!al.length) out.push(META_CPA ? "• Nenhuma campanha fora da meta. Seguir como está." : "• Nenhum alerta do radar. Seguir como está.");   // AD-001: sem meta não há «fora da meta»
    return out;
  }

  /* ---------- rótulo honesto das conversões: o Meta conta conversas no WhatsApp; o Google conta conversões (às vezes 1,5) ---------- */
  const temGoogle = ls => ls.some(l => l.plat === "google"), temMeta = ls => ls.some(l => l.plat === "meta");
  const tituloConv = ls => (temGoogle(ls) ? (temMeta(ls) ? "Conversas e conversões" : "Conversões (Google)") : "Conversas no WhatsApp");
  const numConv = n => (Number.isInteger(n) ? int(n) : dec(n, 1));
  /* ---------- plano 1000: textos do WhatsApp para o cliente ---------- */
  const brlW = v => (fin(v) && Math.abs(v) >= 100 ? brl0(v) : brl(v));                      // AD-218
  const metaTxt = CFG.cpaAlvo > 0 ? ` · meta ${brl(CFG.cpaAlvo)}` : "";                      // AD-116: meta 0 = sem meta
  const toquesTxt = t => (t.cliques > 0 && t.impressoes >= t.cliques ? ` · 1 toque a cada ${int(t.impressoes / t.cliques)} ${Math.round(t.impressoes / t.cliques) === 1 ? "vez" : "vezes"} que o anúncio apareceu` : "");   // AD-219
  const pisoMelhorPior = gastoSemana => Math.max(20, (+gastoSemana || 0) * 0.05);         // AD-018
  const MARCA_IA = "_(leitura automática)_";                                                  // AD-213
  const convTxt = (ls, n) => (temGoogle(ls) ? pluralDec(n, temMeta(ls) ? "conversa ou conversão" : "conversão", temMeta(ls) ? "conversas e conversões" : "conversões") : plural(n, "conversa", "conversas"));

  /** @param leituraIA texto opcional escrito pela IA — substitui a leitura por regras */
  function relDiario(ref, leituraIA = null) {
    const lDia = linhasDe(ref, ref), lSem = linhasDe(ref - 6, ref);
    const dia = consolidar(lDia), ant = consolidar(linhasDe(ref - 1, ref - 1)), sem = consolidar(lSem);
    // plano 1000 (AD-217): o dia da semana no cabeçalho («— domingo, 12/10/2026»)
    const L = [`📊 *${NOME} · Tráfego pago* — ${SEMANA_LONGA[dataDe(ref).getDay()]}, ${dataBR(ref)}`, "", "*No dia*"];
    // AD-012: sem base no dia anterior não sai «(— vs. dia anterior)»
    // plano 1000 (AD-218): acima de R$ 100 o WhatsApp mostra reais inteiros (centavos poluem); custo por conversa segue com centavos
    L.push(`• Investido: ${brlW(dia.gasto)}${varParen(dia.gasto, ant.gasto, " vs. dia anterior")}`);
    L.push(`• ${tituloConv(lDia)}: ${numConv(dia.conversoes)}${varParen(dia.conversoes, ant.conversoes)}`);
    // AD-013: dia sem conversa não vira «Custo por conversa: — · meta R$ 15» (parecia erro)
    const custoConversa = t => (fin(t.cpa) ? `${brl(t.cpa)}${metaTxt}` : t.gasto > 0 ? `nenhuma conversa no dia (${brlW(t.gasto)} investidos)` : "sem investimento no dia");
    // AD-011: a meta é de conversa no WhatsApp (Meta) — com Google no dia, cada plataforma com o próprio custo e a meta só no Meta
    if (temGoogle(lDia)) {
      const dm = consolidar(linhasDe(ref, ref, { plat: "meta" })), dg = consolidar(linhasDe(ref, ref, { plat: "google" }));
      if (temMeta(lDia)) L.push(`• Custo por conversa (Meta): ${custoConversa(dm)}`);
      L.push(`• Custo por conversão (Google): ${fin(dg.cpa) ? brl(dg.cpa) : dg.gasto > 0 ? `sem conversão registrada (${brlW(dg.gasto)} investidos)` : "—"}`);
    } else L.push(`• Custo por conversa: ${custoConversa(dia)}`);
    // AD-216: o que o CRM recebeu NO DIA (antes só o bloco de 7 dias falava do CRM)
    const cDia = crmTot(ref, ref);
    if (cDia.conversas || cDia.agendadas) L.push(`• No CRM: ${plural(cDia.conversas, "conversa nova", "conversas novas")} de anúncio · ${plural(cDia.agendadas, VOC.agendada[0], VOC.agendada[1])}`);

    const plats = ["meta", "google"].map(p => ({ p, t: consolidar(linhasDe(ref, ref, { plat: p })) })).filter(x => x.t.gasto > 0);
    if (plats.length) {
      L.push("", "*Por plataforma*");
      // AD-219: «CTR 1,23%» é jargão para o cliente — vira «1 toque a cada 81 vezes que o anúncio apareceu»
      for (const { p, t } of plats) L.push(`• ${nomePlat(p)}: ${brlW(t.gasto)} → ${p === "google" ? pluralDec(t.conversoes, "conversão", "conversões") : plural(t.conversoes, "conversa", "conversas")}${toquesTxt(t)}`);
    }

    L.push("", "*Últimos 7 dias*");
    L.push(`• ${brlW(sem.gasto)} investidos · ${convTxt(lSem, sem.conversoes)} · ${brl(sem.cpa)} por ${temGoogle(lSem) ? (temMeta(lSem) ? "conversa ou conversão" : "conversão") : "conversa"}`);
    // melhor e pior da semana, com piso para não eleger campanha de R$ 5; com uma só, o custo dela em destaque
    // plano 1000 (AD-018): o piso acompanha o tamanho da conta — max(R$ 20, 5% do gasto da semana)
    const piso = pisoMelhorPior(sem.gasto);
    const el = Object.values(CAMP).filter(c => c.plat).map(c => ({ c, t: consolidar(linhasDe(ref - 6, ref, { camp: c.id })) }))
      .filter(x => x.t.gasto >= piso && x.t.conversoes > 0).sort((a, b) => a.t.cpa - b.t.cpa);
    if (el.length >= 2) {
      L.push(`• 🟢 Melhor: ${el[0].c.nome} — ${brl(el[0].t.cpa)}`);
      L.push(`• 🔴 Pior: ${el[el.length - 1].c.nome} — ${brl(el[el.length - 1].t.cpa)}`);
    } else if (el.length === 1) {
      L.push(`• ${el[0].c.nome} — ${brl(el[0].t.cpa)} por conversa (única campanha com conversa na semana)`);
    }

    const m = ritmoMes(ref);
    // AD-001/AD-007: sem orçamento definido, só o gasto (e a projeção) — nada de «de R$ 1.500» inventado
    L.push("", "*Mês*", !ORC ? `• ${brl0(m.gasto)} investidos${m.cedo ? ` · cedo para projetar (dia ${m.pass} do mês)` : ` · projeção ${brl0(m.proj)}`} · orçamento não definido`
      : m.cedo ? `• ${brl0(m.gasto)} de ${brl0(CFG.orcamento)} · cedo para projetar (dia ${m.pass} do mês)`
      : `• ${brl0(m.gasto)} de ${brl0(CFG.orcamento)} · projeção ${brl0(m.proj)} (${situacaoOrc(m.proj)})`);

    const c7 = crmTot(ref - 6, ref), r7 = receitaTxt(c7);
    L.push("", `*${VOC.local} (7 dias)*`,
      `• ${plural(c7.agendadas, VOC.agendada[0], VOC.agendada[1])} · ${int(c7.compareceram)} ${c7.compareceram === 1 ? VOC.compareceu[0] : VOC.compareceu[1]} · ${int(c7.fecharam)} ${c7.fecharam === 1 ? "fechou" : "fecharam"}${r7 ? ` · ${r7}` : ""}`);

    const al = avaliar(ref);
    if (al.length) { L.push("", "*Alertas*"); al.slice(0, 4).forEach(a => L.push(`${ICONE[a.sev]} ${a.msg}`)); }
    // AD-213: a leitura escrita pela IA vem marcada como automática (o cliente não confunde com a análise da equipe)
    L.push("", "*Leitura do dia*", ...(leituraIA ? [leituraIA.trim(), MARCA_IA] : leituraDia(ref, sem, al)));
    if (PAINEL) L.push("", `🔗 Painel: ${PAINEL}`);
    return L.join("\n");
  }

  function relMensal(m, leituraIA = null) {
    const lMes = linhasDe(m.de, m.ate), t = consolidar(lMes), c = crmTot(m.de, m.ate);
    const lista = mesesDados(), idx = lista.findIndex(x => x.de === m.de), prev = idx > 0 ? lista[idx - 1] : null;
    const roas = t.gasto ? c.receita / t.gasto : null;
    const est = c.receitaEstimada > 0;
    // plano 1000 (AD-244): o investimento também comparado com o mês anterior (antes só os fechamentos)
    const prevCheio = prev && prev.ate - prev.de >= 19 ? prev : null;
    const gPrev = prevCheio ? consolidar(linhasDe(prevCheio.de, prevCheio.ate)).gasto : 0, vG = prevCheio && gPrev > 0 ? variacao(t.gasto, gPrev) : null;
    const L = [
      `${VOC.emoji} *${NOME} · Resultados de ${MESES[m.mes]}*`, "",
      `👁 Anúncios vistos ${int(t.impressoes)} vezes`,
      temGoogle(lMes) ? `💬 ${convTxt(lMes, t.conversoes)} (custo médio ${brl(t.cpa)})` : `💬 ${plural(t.conversoes, "conversa", "conversas")} no WhatsApp (custo médio ${brl(t.cpa)})`,
      `📅 ${plural(c.agendadas, VOC.agendada[0], VOC.agendada[1])}`,
      `✅ ${int(c.compareceram)} ${c.compareceram === 1 ? VOC.compareceu[0] : VOC.compareceu[1]}`,
      `${VOC.emoji} *${int(c.fecharam)} ${c.fecharam === 1 ? VOC.fechou[0] : VOC.fechou[1]}*`, "",
      `💰 Investido em anúncios: ${brl0(t.gasto)}${vG != null ? ` (${vG >= 0 ? "+" : ""}${vG.toFixed(0)}% vs. ${MESES[prevCheio.mes]})` : ""}`,
    ];
    // dinheiro só quando existe de verdade: valor informado ou estimativa pelo ticket que o cliente configurou
    if (c.receita > 0) L.push(`📈 ${VOC.receita}: ${brl0(c.receita)}${est ? ` _(estimativa pelo valor de cada ${VOC.servico})_` : ""}`);
    if (c.semValor > 0) L.push(`📝 ${c.semValor === 1 ? "1 fechamento" : `${c.semValor} fechamentos`} sem valor informado — registre o valor no painel para entrar na conta.`);
    if (fin(roas) && c.receita > 0) L.push(`Cada R$ 1 em anúncio virou *R$ ${dec(roas, 1)}* ${VOC.receitaEm}${est ? " _(estimativa)_" : ""}.`);
    // plano 1000 (AD-243): «quanto paguei por paciente?» — investimento do mês ÷ fechamentos do mês
    if (c.fecharam > 0 && t.gasto > 0) L.push(`🧾 Cada ${VOC.novo[0]} custou ${brl0(t.gasto / c.fecharam)} em anúncio.`);
    if (prev && prev.ate - prev.de >= 19) {
      const cp = crmTot(prev.de, prev.ate), v = variacao(c.fecharam, cp.fecharam);
      // sem fechamento nos dois meses a comparação seria ruído («+0% (0 → 0)») no WhatsApp do cliente
      // AD-014: o número é de FECHAMENTOS — o rótulo é o de fechamento da vertical (antes «pacientes novos»)
      if (v != null && (c.fecharam > 0 || cp.fecharam > 0)) L.push("", `Em relação a ${MESES[prev.mes]}: ${v >= 0 ? "+" : ""}${v.toFixed(0)}% — ${cp.fecharam} → ${c.fecharam} ${c.fecharam === 1 ? VOC.fechou[0] : VOC.fechou[1]}.`);
    }
    // destaque por serviço só com receita de verdade (0 ÷ 0 virava «— do resultado do mês»)
    const top = c.receita > 0 ? Object.entries(c.serv).filter(([, s]) => s.v > 0).sort((a, b) => b[1].v - a[1].v)[0] : null;
    const campTop = Object.values(CAMP).filter(cc => cc.plat && !cc.semCampanha).map(cc => ({ cc, k: crmTot(m.de, m.ate, { camp: cc.id }) }))
      .sort((a, b) => b.k.receita - a.k.receita)[0];
    if (top || (campTop && campTop.k.receita)) {
      L.push("", "*Destaques*");
      if (top) L.push(`• ${plural(top[1].n, VOC.pessoa[0], VOC.pessoa[1])} de ${top[0].toLowerCase()} — ${pc(top[1].v / c.receita * 100, 0)} do resultado do mês`);
      if (campTop && campTop.k.receita) L.push(`• Anúncio que mais trouxe resultado: _${campTop.cc.nome}_`);
    }

    L.push("", "*Para o próximo mês*");
    if (leituraIA) L.push(leituraIA.trim(), MARCA_IA);
    else {
      if (top && CFG.proximos[top[0]]) L.push(CFG.proximos[top[0]]);
      const cansados = Object.values(CRI).filter(k => k.plat === "meta")
        .map(k => consolidar(linhasDe(m.ate - 6, m.ate, { cri: k.id }))).filter(x => fin(x.freq) && x.freq > 2.6);
      // AD-015: o conselho do vídeo é o da vertical; «avaliação no Google» só quando a conta anunciou no Google no mês
      L.push(cansados.length
        ? "• Gravar 2 vídeos novos — alguns anúncios já foram vistos muitas vezes pelas mesmas pessoas."
        : `• ${VOC.video}`);
      L.push(temGoogle(lMes) ? `• Pedir avaliação no Google aos ${VOC.pessoa[1]} satisfeitos: mais avaliações deixam os anúncios mais baratos.` : `• ${VOC.prova}`);
    }
    // AD-215: logo depois do fim do mês o Meta e o Google ainda reatribuem conversões — o cliente é avisado de que o número pode mudar
    if (R - m.ate < 7) L.push("", `_Os números de ${MESES[m.mes]} ainda podem se ajustar um pouco até o dia 7: Meta e Google reatribuem conversões nos dias seguintes._`);
    L.push("", "_Qualquer dúvida, é só responder aqui._", CFG.assinatura);
    if (PAINEL) L.push(`🔗 Painel: ${PAINEL}`);
    return L.join("\n");
  }

  /** Números crus do dia/semana/mês para a IA interpretar (nunca o texto já formatado). */
  function contextoIA(ref) {
    const r2 = v => (fin(v) ? +v.toFixed(2) : null);
    // plano 1000 (AD-017): conversões com 2 casas (o Google manda 1,5; antes Math.round virava 2 na leitura da IA)
    const enx = t => ({ gasto: r2(t.gasto), conversas: r2(t.conversoes), custo_conversa: r2(t.cpa), ctr: r2(t.ctr), cpm: r2(t.cpm), frequencia: r2(t.freq) });
    const sem = consolidar(linhasDe(ref - 6, ref)), ant = consolidar(linhasDe(ref - 13, ref - 7));
    return {
      data: dataBR(ref), cliente: ds.nome,
      metas: { custo_conversa: META_CPA, orcamento_mes: ORC },   // AD-001: null = não definido (a IA não compara com meta inventada)
      ontem: enx(consolidar(linhasDe(ref, ref))), ultimos_7_dias: enx(sem), semana_anterior: enx(ant),
      mes: (m => ({ gasto: r2(m.gasto), projecao: r2(m.proj), dias_restantes: m.restam }))(ritmoMes(ref)),
      campanhas_7d: Object.values(CAMP).filter(c => c.plat).map(c => ({ nome: c.nome, plataforma: c.plat, ...enx(consolidar(linhasDe(ref - 6, ref, { camp: c.id }))) }))
        .filter(c => c.gasto > 0),
      consultorio_7d: (c => ({ agendadas: c.agendadas, compareceram: c.compareceram, fecharam: c.fecharam, receita: r2(c.receita),
        receita_estimada: c.receitaEstimada > 0, fechamentos_sem_valor: c.semValor }))(crmTot(ref - 6, ref)),
      alertas: avaliar(ref, true).map(a => a.msg),
    };
  }

  return {
    CFG, R, DIAS, DATAS, REF, NOME, LINHAS, ORC, META_CPA, META_CPA_G, LIM, RITMO,
    // AD-046: até quando (YYYY-MM-DD) o alerta `chave` segue silenciado a partir de ontem — null se não está
    silenciadoAte: chave => { const s = silencioDe(CFG, chave); return s && s.ate >= isoDe(dataDe(R)) ? s.ate : null; }, DIVERGENCIAS: ds.DIVERGENCIAS || [], CONTAGEM, ehRemarketing, LEADS, CAMP, CRI, REGRAS, ICONE, ORD, FMT_MET, VOC, vertical, GOOGLE_SEM_CONVERSAO, PAINEL,
    dataDe, ddmm, dataBR, dMes,
    consolidar, linhasDe, crmTot, porDia, soma7, media7, valorLead, valorDe, receitaTxt, etapa,
    situacaoOrc, ritmoMes, mesesDados, avaliar, historico, textoAlerta, leituraDia, relDiario, relMensal, contextoIA,
  };
}
