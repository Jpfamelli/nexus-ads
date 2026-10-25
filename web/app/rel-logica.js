/* ============================================================
   ÓRBITA — rel-logica.js (frente F6)
   Lógica PURA de Anúncios, Início e Relatórios: sem DOM, sem rede,
   sem imports (os testes Node importam direto do disco).
   Recebe o `M` de nucleo.montar() quando precisa dos números do Ads:
   a conta é a MESMA do painel clássico (numerosPeriodo, linhasCamp,
   statusEnvio, estadoIntegracao) — por isso os dois nunca discordam.
   ============================================================ */

export const FUSO = "America/Sao_Paulo";
const fin = v => v != null && Number.isFinite(v);
const p2 = n => String(n).padStart(2, "0");

/* ============================================================
   1. DATAS NO FUSO DE SÃO PAULO
   ============================================================ */
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const FMT_DDMM = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });

const quando = iso => { if (iso == null || iso === "") return null; const d = iso instanceof Date ? iso : new Date(iso); return isNaN(d) ? null : d; };
/** "Hoje" em SP como AAAA-MM-DD. */
export function hojeSP(agora = new Date()) {
  const [d, m, a] = FMT_DIA.format(agora).split("/");
  return `${a}-${m}-${d}`;
}
export const horaSP = iso => { const d = quando(iso); return d ? FMT_HORA.format(d) : "—"; };
export const ddmmSP = iso => { const d = quando(iso); return d ? FMT_DDMM.format(d) : "—"; };
/** AAAA-MM-DD + n dias (aritmética de calendário, sem fuso). */
export function somarDias(iso, n) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
/** Dias entre duas datas AAAA-MM-DD (b − a). */
export function difDias(a, b) {
  const u = s => { const [x, y, z] = String(s).slice(0, 10).split("-").map(Number); return Date.UTC(x, y - 1, z); };
  return Math.round((u(b) - u(a)) / 864e5);
}
/** "hoje às 08:03" · "ontem às 21:10" · "em 12/09 às 09:00" (fuso SP). */
export function quandoSP(iso, agora = new Date()) {
  const d = quando(iso);
  if (!d) return "—";
  const dia = hojeSP(d), hoje = hojeSP(agora);
  const rot = dia === hoje ? "hoje" : dia === somarDias(hoje, -1) ? "ontem" : `em ${FMT_DDMM.format(d)}`;
  return `${rot} às ${FMT_HORA.format(d)}`;
}
export const dataIsoBR = iso => { const [a, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : "—"; };
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "há 12 min" a partir de um instante em ms. */
export function minutosAtras(ms, agora = Date.now()) {
  const m = Math.max(0, Math.round((agora - ms) / 6e4));
  return m < 1 ? "agora há pouco" : m < 60 ? `há ${m} min` : m < 120 ? "há 1 h" : m < 48 * 60 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dias`;
}

/* ============================================================
   2. VARIAÇÃO (mesma regra do nucleo.variacao)
   ============================================================ */
/** Variação percentual de `a` sobre `b`. Sem base → null; 0 → 0 quando os dois são 0. */
export const variacao = (a, b) => (!fin(a) || !fin(b)) ? null : b === 0 ? (a === 0 ? 0 : null) : (a - b) / b * 100;
/** Chip de variação: sentido 'cima' (mais é melhor), 'baixo' (menos é melhor) ou 'neutro'. */
export function chipVar(atual, anterior, sentido = "cima") {
  const v = variacao(atual, anterior);
  // plano 1000b → plano 1500c · AC-179: antes 0 e agora algo é «novo» (antes «sem base», que parecia dado faltando)
  if (v == null && fin(atual) && atual > 0 && anterior === 0) return { v: null, txt: "novo", cls: "neutro", seta: "", novo: true };
  if (v == null) return { v: null, txt: "sem base", cls: "neutro", seta: "" };
  const bom = sentido === "cima" ? v >= 0 : sentido === "baixo" ? v <= 0 : null;
  const cls = bom == null || Math.abs(v) < 1 ? "neutro" : bom ? "bom" : "ruim";
  const txt = `${Math.round(Math.abs(v)).toLocaleString("pt-BR")}%`;   // mesma régua do painel (pc(v, 0))
  return { v, txt, cls, seta: Math.abs(v) < 1 ? "→" : v > 0 ? "▲" : "▼" };
}
export const razao = (a, b) => (b ? a / b * 100 : null);

/* ============================================================
   3. ANÚNCIOS — a MESMA conta do painel clássico (web/painel.js)
   ============================================================ */
/** Janela do período ativo: os `dias` que terminam ONTEM (M.R) e o mesmo tamanho logo antes.
    Plano 1000 (AD-097): `dias` também aceita "mes" (do dia 1 do mês de ontem até ontem; comparação com o mesmo pedaço do mês
    anterior) e "mes_ant" (o mês-calendário anterior inteiro; comparação com o mês antes dele) — sempre dentro dos 130 dias. */
export const PERIODOS_MES = Object.freeze(["mes", "mes_ant"]);
export function janela(M, dias = 30) {
  if (dias === "mes" || dias === "mes_ant") {
    const d = M.dataDe(M.R), dia1 = M.R - (d.getDate() - 1);
    if (dias === "mes") {
      const n = M.R - dia1 + 1, deA = Math.max(0, dia1 - new Date(d.getFullYear(), d.getMonth(), 0).getDate());
      return { de: Math.max(0, dia1), ate: M.R, deA, ateA: Math.min(dia1 - 1, deA + n - 1), n };
    }
    const ate = dia1 - 1, dAnt = M.dataDe(ate), de = Math.max(0, ate - dAnt.getDate() + 1), n = ate - de + 1;
    const ateA = de - 1, deA = Math.max(0, ateA - M.dataDe(Math.max(0, ateA)).getDate() + 1);
    return { de, ate, deA, ateA, n };
  }
  const de = M.R - dias + 1; return { de, ate: M.R, deA: de - dias, ateA: de - 1, n: dias };
}
/** Textos do período escolhido: {titulo, nos, antes, curto}.
    Plano 1000b · AB-082: com `M`, no dia 1º («ontem» foi o último dia do mês anterior) «Este mês» é na verdade o mês de ontem inteiro e
    «Mês passado» é o anterior a ele — os rótulos dizem o NOME do mês («Setembro (até ontem)» / «Agosto») em vez de «Este mês». */
export function rotuloPeriodo(dias, M = null) {
  if ((dias === "mes" || dias === "mes_ant") && M && typeof M.dataDe === "function" && Number.isFinite(M.R)) {
    const ontem = M.dataDe(M.R), amanha = M.dataDe(M.R + 1);
    if (amanha.getDate() === 1) {
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      if (dias === "mes") { const m = MESES[ontem.getMonth()]; return { titulo: `${cap(m)} (até ontem)`, nos: `em ${m}`, antes: "o mês anterior", curto: m }; }
      const m = MESES[(ontem.getMonth() + 11) % 12]; return { titulo: cap(m), nos: `em ${m}`, antes: "o mês anterior", curto: m };
    }
  }
  if (dias === "mes") return { titulo: "Este mês", nos: "neste mês", antes: "o mesmo pedaço do mês anterior", curto: "este mês" };
  if (dias === "mes_ant") return { titulo: "Mês passado", nos: "no mês passado", antes: "o mês anterior", curto: "mês passado" };
  const n = Number(dias) || 30;
  return { titulo: `Últimos ${n} dias`, nos: `nos últimos ${n} dias`, antes: `os ${n} dias antes`, curto: `${n} dias` };
}
export const semAnuncios = M => !M || !M.LINHAS.length;

/** Os números do período — cópia fiel do numerosPeriodo() do painel.
    retorno = receita ÷ (anúncios + gestão); com uma plataforma só, ÷ anúncios. */
export function numerosPeriodo(M, { dias = 30, plat = "" } = {}) {
  const { de, ate, deA, ateA, n } = janela(M, dias), f = { plat };
  const t = M.consolidar(M.linhasDe(de, ate, f)), ta = M.consolidar(M.linhasDe(deA, ateA, f));
  const c = M.crmTot(de, ate, f), ca = M.crmTot(deA, ateA, f);
  const roas = t.gasto ? c.receita / t.gasto : null;
  // revisão 13/10: o fee é MENSAL — mês-calendário fechado («Mês passado») cobra o fee cheio (antes × 31/30 ou × 28/30: R$ 1.033
  // ou R$ 933 para R$ 1.000); «Este mês» cobra a fração do mês corrido (cheio no último dia); só as janelas de N dias usam N/30
  const feeMes = M.CFG.fee || 0;
  const fee = plat ? 0 : dias === "mes_ant" ? feeMes
    : dias === "mes" ? feeMes * n / new Date(M.dataDe(ate).getFullYear(), M.dataDe(ate).getMonth() + 1, 0).getDate()
    : feeMes * n / 30;
  const custoTotal = t.gasto + fee;
  const retorno = plat ? roas : (custoTotal ? c.receita / custoTotal : null);
  // plano 100 (F1, decisão 5): fee padrão 0 — «gestão» só entra na conta e no rótulo quando o cliente tem fee configurado
  const gestao = fee > 0, estimada = (+c.receitaEstimada || 0) > 0;
  // plano 1000 (AD-128): custo por agendamento e por fechamento do CRM (o «quanto paguei por paciente?»)
  const custoAgendamento = c.agendadas > 0 && t.gasto > 0 ? t.gasto / c.agendadas : null;
  const custoFechamento = c.fecharam > 0 && t.gasto > 0 ? t.gasto / c.fecharam : null;
  // plano 1000b · AB-194: os mesmos custos no período anterior (o chip de variação da linha «R$ X por agendamento»)
  const custoAgendamentoAnt = ca.agendadas > 0 && ta.gasto > 0 ? ta.gasto / ca.agendadas : null;
  const custoFechamentoAnt = ca.fecharam > 0 && ta.gasto > 0 ? ta.gasto / ca.fecharam : null;
  // plano 2000d · DA-199/DA-200/DA-255: «Este mês»/«Mês passado» com mês anterior de outro tamanho (31 × 30, 31 × 28) — os somatórios
  // do anterior são comparados pela MÉDIA POR DIA (× n/nA); antes um +10% podia vir só do tamanho do mês
  const nA = Math.max(0, ateA - deA + 1);
  const normalizado = (dias === "mes" || dias === "mes_ant") && nA > 0 && nA !== n;
  const escalaA = normalizado ? n / nA : 1;
  return { de, ate, deA, ateA, f, t, ta, c, ca, roas, fee, custoTotal, retorno, dias: n, periodo: dias, rotulo: rotuloPeriodo(dias, M), plat, gestao, estimada, custoAgendamento, custoFechamento,
    custoAgendamentoAnt, custoFechamentoAnt, nA, normalizado, escalaA };
}
/** Plano 2000d · DA-199/DA-200: um somatório do período anterior na régua do atual (média por dia × dias de agora). */
export const anteriorNaRegua = (P, v) => (v === null || v === undefined || !Number.isFinite(+v) ? v : +v * ((P && P.escalaA) || 1));
/** Plano 2000d · DA-199/DA-200: a nota que explica a comparação normalizada («31 dias agora × 30 antes»). */
export const textoNormalizado = P => (P && P.normalizado ? `Comparação pela média por dia: ${P.dias} ${P.dias === 1 ? "dia" : "dias"} agora × ${P.nA} ${P.nA === 1 ? "dia" : "dias"} antes.` : "");

/** Rótulos do herói (F1): com fee configurado, «Retorno total» = receita ÷ (anúncios + gestão) e a nota «inclui R$ X de gestão»
    (para todos: o cliente vê de onde vem a diferença); sem fee, «Retorno sobre anúncios» = receita ÷ investimento em anúncios. */
export function rotulosRetorno(P, brl0 = v => String(Math.round(v))) {
  if (P && P.plat) return { olho: `Retorno sobre ${nomePlat(P.plat)}`, nota: "receita ÷ investimento em anúncios", gestao: null, frase: "em anúncio" };
  if (P && P.gestao) return { olho: "Retorno total", nota: "receita ÷ (anúncios + gestão)", gestao: `inclui ${brl0(P.fee)} de gestão no período`, frase: "investido" };
  return { olho: "Retorno sobre anúncios", nota: "receita ÷ investimento em anúncios", gestao: null, frase: "em anúncio" };
}

/** Campanhas com investimento no período (cópia do linhasCamp do painel) + totais do rodapé. */
/** Plano 1000 (AD-108): último dia com gasto de cada campanha (até ontem) — «pausada» quando não gasta há DIAS_PAUSADA dias. */
export const DIAS_PAUSADA = 3;
export function ultimoGastoPorCampanha(M) {
  const ult = new Map();
  for (const l of (M && M.LINHAS) || []) if ((+l.gasto || 0) > 0 && l.i <= M.R && (!ult.has(l.camp) || l.i > ult.get(l.camp))) ult.set(l.camp, l.i);
  return ult;
}
/** Plano 2000d · DA-143/DA-204: {pausada, semEntrega} de uma campanha — o status da plataforma (ACTIVE/ENABLED × PAUSED…) vence a
    heurística dos 3 dias sem gasto. */
export function situacaoCampanha(c, ultimo, R) {
  const parada = ultimo != null && R - ultimo >= DIAS_PAUSADA;
  const st = String((c && (c.status || c.st)) || "").trim().toUpperCase();
  if (/^(ACTIVE|ENABLED|ATIVA|ATIVO)$/.test(st)) return { pausada: false, semEntrega: parada };
  if (/PAUS|REMOV|DELET|ARCHIV|DISABLED|INATIV/.test(st)) return { pausada: true, semEntrega: false };
  return { pausada: parada, semEntrega: false };
}
export function linhasCampanhas(M, { dias = 30, plat = "" } = {}) {
  const { de, ate, deA, ateA } = janela(M, dias);
  const ult = ultimoGastoPorCampanha(M);
  const linhas = Object.values(M.CAMP).filter(c => c.plat && !c.semCampanha && (!plat || c.plat === plat)).map(c => {
    const t = M.consolidar(M.linhasDe(de, ate, { camp: c.id }));
    if (!t.gasto) return null;
    const k = M.crmTot(de, ate, { camp: c.id });
    const ultimo = ult.has(c.id) ? ult.get(c.id) : null;
    // plano 1500c · AC-135: o custo por conversão do período anterior (a coluna «Δ CPA»; cair é bom)
    const ta = deA <= ateA && ateA >= 0 ? M.consolidar(M.linhasDe(Math.max(0, deA), ateA, { camp: c.id })) : null;
    return {
      c, t, k, ta, dcpa: ta ? variacao(t.cpa, ta.cpa) : null,
      cpp: k.fecharam ? t.gasto / k.fecharam : null,
      cpag: k.agendadas ? t.gasto / k.agendadas : null,
      roas: t.gasto ? k.receita / t.gasto : null,
      // plano 2000d · DA-143/DA-204: com o status REAL da plataforma (quando a sincronização mandar c.status), campanha ATIVA que não gastou
      // há 3 dias é «sem entrega» (verba baixa, público pequeno), não «pausada»; sem status, a heurística de antes
      ultimoGasto: ultimo, ...situacaoCampanha(c, ultimo, M.R),
    };
  }).filter(Boolean);
  const T = M.consolidar(linhas.flatMap(r => M.linhasDe(de, ate, { camp: r.c.id })));
  const K = linhas.reduce((a, r) => ({ ag: a.ag + r.k.agendadas, fe: a.fe + r.k.fecharam, rec: a.rec + r.k.receita }), { ag: 0, fe: 0, rec: 0 });
  // o que o CRM atribuiu a anúncios mas NÃO está em nenhuma linha acima (campanha pausada/sem investimento na janela, ou sem campanha identificada):
  // entra no herói da Visão geral (crmTot da plataforma inteira) e fica fora do «Total» — esta sobra explica a diferença
  const todos = M.crmTot(de, ate, { plat });
  const outras = { ag: Math.max(0, (todos.agendadas || 0) - K.ag), fe: Math.max(0, (todos.fecharam || 0) - K.fe), rec: Math.max(0, (todos.receita || 0) - K.rec) };
  // F2: a sobra se divide em «Anúncio sem campanha identificada» (o balde do núcleo) e campanhas sem investimento na janela
  const sem = semCampanhaTot(M, de, ate, { plat });
  const pausadas = { ag: Math.max(0, outras.ag - sem.agendadas), fe: Math.max(0, outras.fe - sem.fecharam), rec: Math.max(0, outras.rec - sem.receita) };
  return { linhas, total: { t: T, ag: K.ag, fe: K.fe, rec: K.rec, roas: T.gasto ? K.rec / T.gasto : null }, outras, semCampanha: sem, pausadas };
}

/** F4: conversões por plataforma com o rótulo certo — o Meta conta conversas no WhatsApp; o Google conta conversões (às vezes 1,5). */
export function textoConvPlat(plat, t, { int = v => String(Math.round(v)), dec = (v, c) => v.toFixed(c), brl = v => String(v) } = {}) {
  const n = +(t && t.conversoes) || 0, cpa = t && t.cpa;
  if (plat === "google") {
    const q = Number.isInteger(n) ? int(n) : dec(n, 1);
    return `${q} ${n === 1 ? "conversão" : "conversões"} (Google) · custo por conversão ${fin(cpa) ? brl(cpa) : "—"}`;
  }
  return `${int(n)} ${Math.round(n) === 1 ? "conversa" : "conversas"} no WhatsApp · custo por conversa ${fin(cpa) ? brl(cpa) : "—"}`;
}

/**
 * Os 4 KPIs da Visão geral do Anúncios (desenhados com ui.kpi). F1: «+ R$ X de gestão» para todos quando há fee configurado; a receita
 * estimada pelo ticket configurado sai com `estimativa: true` e a ajuda separa o estimado do informado; fechamento sem valor é dito, não somado.
 * `f` é o formato do ui.kpi ("moeda" | "moeda2" | "conv" = inteiro ou 1 casa); `serie` é o campo de serieTendencia que vira a sparkline.
 */
export function kpisAnuncios(P, { meta = 0, dif = null, temGoogle = false, gestor = false, brl0 = v => String(v), brl = v => String(v), dec = (v, c) => v.toFixed(c), pc = v => `${v}%`, int = v => String(v) } = {}) {
  const { t, c } = P;
  // plano 2000d · DA-199/DA-200: somatórios do anterior na régua do atual (média por dia) quando os meses têm tamanhos diferentes
  const ta = { ...P.ta, gasto: anteriorNaRegua(P, P.ta && P.ta.gasto), conversoes: anteriorNaRegua(P, P.ta && P.ta.conversoes) };
  const ca = { ...P.ca, receita: anteriorNaRegua(P, P.ca && P.ca.receita) };
  const est = (+c.receitaEstimada || 0) > 0;
  const semValor = +c.semValor || 0;
  return [
    { id: "gasto", l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: "moeda", s: "neutro", serie: "gasto",
      extra: P.gestao ? `+ ${brl0(P.fee)} de gestão no período` : "", ajuda: "Soma do que o Meta e o Google cobraram no período (dias fechados até ontem)." },
    // plano 1000 (AD-115): com Google no número, a meta (de conversa no WhatsApp) não é régua — sem medidor nem «acima/abaixo»
    { id: "cpa", l: temGoogle ? "Custo por conversão da plataforma" : "Custo por conversa (Meta)", v: t.cpa, a: ta.cpa, f: "moeda2", s: "baixo", medidor: !temGoogle && +meta > 0,
      // AD-116: meta 0 (salva pelo clássico) não vira «Infinity% abaixo» — sem meta > 0 o extra é só «sem meta definida»
      extra: !(+meta > 0) ? "sem meta definida" : temGoogle ? `a meta de ${brl(meta)} vale para conversas no WhatsApp (Meta)` : !fin(t.cpa) || !fin(dif) ? `meta ${brl(meta)}` : `meta ${brl(meta)} · ${pc(dif, 0)} ${t.cpa <= meta ? "abaixo" : "acima"}`,
      ajuda: "Investimento ÷ conversões contadas pela própria plataforma." },
    { id: "conv", l: "Conversões registradas pela plataforma", v: t.conversoes, a: ta.conversoes, f: "conv", s: "cima", serie: "convAds",
      extra: temGoogle ? "o Google conta conversões (pode ter fração); o Meta, conversas no WhatsApp" : "conversas no WhatsApp contadas pelo Meta",
      ajuda: "Meta/Google; é o denominador do custo por conversão." },
    { id: "receita", l: "Receita fechada", v: c.receita, a: ca.receita, f: "moeda", s: "cima", serie: "receita", estimativa: est,
      ajuda: est ? `${brl0(c.receitaEstimada)} estimados pelo valor de cada serviço configurado em Ajustes de anúncios; ${brl0(c.receitaReal)} informados nos negócios.`
        : "Valor informado nos negócios ganhos do CRM.",
      extra: semValor ? `${semValor === 1 ? "1 fechamento" : `${int(semValor)} fechamentos`} sem valor informado`
        : gestor && fin(P.roas) ? `${dec(P.roas, 1)}x o investido em anúncios`
        : est ? "inclui estimativa pelo valor de cada serviço" : "valor informado nos negócios ganhos do CRM" },
  ];
}

/** F2: o que o CRM atribuiu a anúncio sem campanha/anúncio reconhecido (métrica ainda não sincronizada, importação sem ids,
    utm sem casamento) — soma dos baldes `<plat>:nao_identificada` do núcleo. Entra no funil e no herói; nunca no ranking. */
export function semCampanhaTot(M, de, ate, { plat = "" } = {}) {
  const z = { conversas: 0, agendadas: 0, compareceram: 0, fecharam: 0, receita: 0, ids: [], utms: [] };
  for (const c of Object.values((M && M.CAMP) || {})) {
    if (!c.semCampanha || (plat && c.plat !== plat)) continue;
    const k = M.crmTot(de, ate, { camp: c.id });
    z.conversas += k.conversas; z.agendadas += k.agendadas; z.compareceram += k.compareceram; z.fecharam += k.fecharam; z.receita += k.receita; z.ids.push(c.id);
    for (const u of c.utms || []) if (!z.utms.includes(u)) z.utms.push(u);   // AD-004: o texto do utm sem casamento vai para a nota do balde
  }
  return z;
}
export const VAL_CAMP = {
  nome: r => r.c.nome, plat: r => r.c.plat, gasto: r => r.t.gasto, conv: r => r.t.conversoes, cpa: r => r.t.cpa, ctr: r => r.t.ctr,
  ag: r => r.k.agendadas, fe: r => r.k.fecharam, rec: r => r.k.receita, roas: r => r.roas,
  // plano 1500c · AC-082/AC-083/AC-135: as colunas extras também ordenam
  cpag: r => r.cpag, cpp: r => r.cpp, imp: r => r.t.impressoes, cpm: r => r.t.cpm, dcpa: r => r.dcpa,
};
/** Ordena como o painel: texto por localeCompare; número com vazio sempre no fim. */
export function ordenarCampanhas(linhas, chave = "gasto", dir = -1) {
  const fv = VAL_CAMP[chave] || VAL_CAMP.gasto;
  return linhas.slice().sort((a, b) => {
    const x = fv(a), y = fv(b);
    if (typeof x === "string" || typeof y === "string") return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR") * dir;
    return ((fin(x) ? x : -Infinity) - (fin(y) ? y : -Infinity)) * dir;
  });
}
/** Ponto de cor do custo por conversa contra a meta (mesma régua do painel). */
/** Plano 1000 (AD-110/AD-116): sem base não há cor — gasto abaixo de R$ 20 (campanha de R$ 2 não é «ruim») ou meta não definida (0, salva
    pelo clássico) é «neutro». Sem conversão com gasto de verdade (≥ R$ 20) continua «ruim»; sem saber o gasto, sem conversão é neutro. */
export const GASTO_MIN_COR = 20;
// plano 2000d · DA-205: o piso do gasto acompanha o tamanho da conta (`minimo` = gastoMinCor da média diária); sem ele, R$ 20
export const nivelCpa = (cpa, meta, gasto = null, minimo = GASTO_MIN_COR) => {
  if (!(+meta > 0)) return "neutro";
  if (gasto != null && (+gasto || 0) < (Number.isFinite(+minimo) && +minimo >= 0 ? +minimo : GASTO_MIN_COR)) return "neutro";
  if (!fin(cpa)) return gasto != null ? "ruim" : "neutro";
  return cpa <= meta ? "bom" : cpa <= meta * 1.35 ? "aten" : "ruim";
};

/** Plano 2000d · DA-205: o gasto mínimo para colorir o custo = um dia médio de investimento da conta, entre R$ 5 e R$ 500
    (quem investe R$ 10/dia passa a ver cor; quem investe R$ 5 mil/dia não vê campanha de R$ 30 como «ruim»). */
export function gastoMinCor(gastoMedioDia) {
  const v = +gastoMedioDia;
  if (!Number.isFinite(v) || v <= 0) return GASTO_MIN_COR;
  return Math.min(500, Math.max(5, Math.round(v)));
}
/** Criativos de uma campanha no período, com a situação que o radar vê AGORA (r3/r4). */
export function criativosDaCampanha(M, campId, { dias = 30 } = {}) {
  const { de } = janela(M, dias);
  const agora = M.avaliar(M.R);
  return Object.values(M.CRI).filter(k => k.camp === campId && k.plat).map(k => {
    const t = M.consolidar(M.linhasDe(de, M.R, { cri: k.id }));
    const s = agora.filter(a => a.chave === `r4|${k.id}` || a.chave === `r3|${k.id}`);
    const a4 = s.find(a => a.regra.id === "r4"), a3 = s.find(a => a.regra.id === "r3");
    return { k, t, fadiga: a4 ? { valor: a4.valor, janela: a4.regra.janela } : null, ctrBaixo: a3 ? { valor: a3.valor, janela: a3.regra.janela } : null };
  }).filter(x => x.t.gasto > 0).sort((a, b) => b.t.gasto - a.t.gasto);
}

/** O que o CRM viu por CRIATIVO no período — as MESMAS regras do crmTot do núcleo (pela data de cada
    evento; só leads de anúncio), agrupadas pelo criativo do lead. Somando todos os criativos dá o
    crmTot dos leads que têm criativo identificado. Devolve Map(criativoId → totais). */
export function crmPorCriativo(M, de, ate, { plat = "" } = {}) {
  const out = new Map();
  for (const Ld of M.LEADS) {
    if (!Ld.plat || !Ld.cri) continue;
    if (plat && Ld.plat !== plat) continue;
    let c = out.get(Ld.cri);
    if (!c) out.set(Ld.cri, c = { conversas: 0, agendadas: 0, compareceram: 0, faltaram: 0, fecharam: 0, receita: 0 });
    if (Ld.i >= de && Ld.i <= ate) c.conversas++;
    if (Ld.iAgenda != null && Ld.iAgenda >= de && Ld.iAgenda <= ate) c.agendadas++;
    if (Ld.iConsulta != null && Ld.iConsulta >= de && Ld.iConsulta <= ate && Ld.iConsulta <= M.R) {
      if (!Ld.compareceu) { if (M.etapa(Ld) === "faltou" || !Ld.etapaReal) c.faltaram++; continue; }
      c.compareceram++;
      if (Ld.fechou) { c.fecharam++; c.receita += M.valorLead(Ld); }
    }
  }
  return out;
}
// plano 1500c · AC-114: «Menor custo por agendamento» (investimento do criativo ÷ agendamentos do CRM) — o dono quer quem traz agenda
export const RANK_CRI = [["receita", "Mais receita"], ["fechados", "Mais fechados"], ["cpa", "Menor custo por conversa"], ["cpag", "Menor custo por agendamento"]];
/** Plano 1000b · AB-044: com o filtro Google o ranking fala de «conversão» (o Google conta conversões, não conversas no WhatsApp). */
export const unidadeConv = plat => (plat === "google" ? { um: "conversão", varios: "conversões" } : { um: "conversa", varios: "conversas" });
export const rankCriPorPlat = plat => RANK_CRI.map(([k, rot]) => [k, k === "cpa" ? `Menor custo por ${unidadeConv(plat).um}` : rot]);
export const MIN_CONV_CPA = 3;   // custo por conversa só entra no ranking com pelo menos 3 conversas (senão R$ 4 de teste "ganha")
/** Plano 1500c · AC-113: abaixo disto o custo por conversa ainda oscila muito — o criativo leva o selo «amostra pequena». */
export const AMOSTRA_PEQUENA = 10;
/** Plano 1500c · AC-115: a régua de cada plataforma para comparar custo de conversa (Meta) com custo de conversão (Google) — a meta da
    plataforma quando existe; senão a mediana do custo dos criativos dela. → {meta: n|null, google: n|null}. */
export function reguaCustoPlat(itens = [], cfg = {}) {
  const med = l => { const v = l.filter(fin).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
  const out = {};
  for (const p of ["meta", "google"]) {
    const meta = p === "google" ? +(cfg && cfg.cpaAlvoGoogle) : +(cfg && cfg.cpaAlvo);
    out[p] = meta > 0 ? meta : med((itens || []).filter(x => x && x.k && x.k.plat === p).map(x => x.t && x.t.cpa));
  }
  return out;
}
/** Ranking de criativos do período (P1): investimento do Ads + resultado do CRM por criativo.
    por = 'receita' | 'fechados' | 'cpa'. Criativo sem investimento no período fica de fora. */
/** Plano 2000d · DA-174: quantas conversões um criativo precisa para o custo dele não ser «amostra pequena» — 30% da média por criativo
    da conta, entre AMOSTRA_PEQUENA (10) e 50. */
export function amostraMinima(totalConversoes, nCriativos) {
  const media = +nCriativos > 0 ? (+totalConversoes || 0) / +nCriativos : 0;
  return Math.max(AMOSTRA_PEQUENA, Math.min(50, Math.round(media * 0.3)));
}
export function rankingCriativos(M, { dias = 30, plat = "", por = "receita", n = 8, reserva = false } = {}) {
  // plano 1000 (AD-112): quem não registra valor abria o ranking em «Mais receita» e via «Nenhum criativo trouxe receita». Com `reserva`
  // (a pessoa não escolheu a ordem), sem receita no período o ranking abre em «Menor custo por conversa» — `automatico: true` avisa a tela
  // plano 1000b · AB-083: a base (investimento + CRM por criativo) é calculada UMA vez; a reserva só reordena (antes eram dois rankings)
  const { de, ate } = janela(M, dias);
  const crm = crmPorCriativo(M, de, ate, { plat });
  const ZERO = { conversas: 0, agendadas: 0, compareceram: 0, faltaram: 0, fecharam: 0, receita: 0 };
  const todos = Object.values(M.CRI).filter(k => k.plat && !/:outros$/.test(k.id) && (!plat || k.plat === plat)).map(k => {
    const t = M.consolidar(M.linhasDe(de, ate, { cri: k.id }));
    const c = crm.get(k.id) || ZERO;
    return { k, camp: M.CAMP[k.camp] || null, t, c, roas: t.gasto ? c.receita / t.gasto : null };
  }).filter(x => x.t.gasto > 0);
  // plano 1500c · AC-114: custo por agendamento do CRM; AC-113: selo de amostra pequena
  // plano 2000d · DA-174: o limite da «amostra pequena» acompanha o volume do cliente (mínimo 10; conta com muitas conversões pede mais)
  const amostraMin = amostraMinima(todos.reduce((s, x) => s + (+x.t.conversoes || 0), 0), todos.length);
  for (const x of todos) { x.cpag = x.c.agendadas > 0 ? x.t.gasto / x.c.agendadas : null; x.amostraPequena = x.t.conversoes < amostraMin; x.amostraMin = amostraMin; }
  // plano 1500c · AC-115: sem filtro de plataforma, o custo do Meta (conversa) e o do Google (conversão) não estão na mesma régua — cada
  // um é dividido pela régua da sua plataforma (a meta dela, ou a mediana dos criativos dela) antes de ordenar
  const plats = new Set(todos.map(x => x.k.plat));
  const misto = !plat && plats.has("meta") && plats.has("google");
  const regua = misto ? reguaCustoPlat(todos.filter(x => x.t.conversoes >= MIN_CONV_CPA), M.CFG) : null;
  const cpaRel = x => { const r = regua && regua[x.k.plat]; return fin(x.t.cpa) ? (r > 0 ? x.t.cpa / r : x.t.cpa) : Infinity; };
  const cpa = x => (misto ? cpaRel(x) : fin(x.t.cpa) ? x.t.cpa : Infinity);
  const cpag = x => (fin(x.cpag) ? x.cpag : Infinity);
  const ORD = {
    receita: (a, b) => b.c.receita - a.c.receita || b.c.fecharam - a.c.fecharam || cpa(a) - cpa(b),
    fechados: (a, b) => b.c.fecharam - a.c.fecharam || b.c.receita - a.c.receita || cpa(a) - cpa(b),
    cpa: (a, b) => cpa(a) - cpa(b) || b.t.conversoes - a.t.conversoes,
    cpag: (a, b) => cpag(a) - cpag(b) || b.c.agendadas - a.c.agendadas,
  };
  const ordenar = chave => {
    // receita/fechados: só quem trouxe resultado (zero não é ranking); custo por conversa: com volume mínimo
    const base = chave === "cpa" ? todos.filter(x => x.t.conversoes >= MIN_CONV_CPA)
      : chave === "cpag" ? todos.filter(x => x.c.agendadas > 0)
      : chave === "fechados" ? todos.filter(x => x.c.fecharam > 0) : todos.filter(x => x.c.receita > 0);
    const lista = base.slice().sort(ORD[chave]).slice(0, n);
    const valor = x => (chave === "receita" ? x.c.receita : chave === "fechados" ? x.c.fecharam : chave === "cpag" ? x.cpag : chave === "cpa" && misto ? cpaRel(x) : x.t.cpa);
    const topo = lista.length ? Math.max(...lista.map(valor).filter(fin)) : 0;
    // barra: receita/fechados proporcionais ao 1º; custo (por conversa ou por agendamento): o MENOR enche a barra
    const barra = x => { const v = valor(x); if (!fin(v) || !(topo > 0)) return 0; return chave === "cpa" || chave === "cpag" ? Math.min(1, valor(lista[0]) / v) : v / topo; };
    return { por: chave, de, ate, total: todos.length, normalizado: chave === "cpa" && misto, lista: lista.map((x, i) => ({ ...x, pos: i + 1, barra: barra(x), cpaRel: misto && fin(cpaRel(x)) ? cpaRel(x) : null })) };   // plano 1500c · AC-115
  };
  const chave = ORD[por] ? por : "receita";
  const r = ordenar(chave);
  if (!(reserva && (por === "receita" || !por)) || r.lista.length || !r.total) return r;
  return { ...ordenar("cpa"), automatico: true };
}

/** Série diária do gráfico gasto × conversas (média de 7 dias), igual ao serieDia do painel. */
export function serieDiaria(M, { dias = 30, plat = "" } = {}) {
  const { de, ate, deA, ateA } = janela(M, dias);
  const sd = M.porDia(plat);
  const outras = i => (sd.outras ? sd.outras[i] || 0 : 0);   // AD-002: plataforma desconhecida soma no total
  const um = i => (i < 0 ? null : { i, meta: sd.meta[i], google: sd.google[i], gasto: sd.meta[i] + sd.google[i] + outras(i), conv: sd.conv[i], convMedia: M.media7(sd.conv, i) });
  const atual = [], anterior = [];
  for (let i = de; i <= ate; i++) atual.push(um(i));
  for (let i = deA; i <= ateA; i++) anterior.push(um(i));
  return { atual, anterior };
}

/** Topo do eixo: ~8% acima da maior barra, em 4 degraus de valor inteiro (cópia do painel). */
export function eixoTopo(v, n = 4) {
  if (!(v > 0)) return n;
  const bruto = v * 1.08 / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p;
  const degraus = p >= 10 ? [1, 1.2, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 10];
  return degraus.find(x => x >= r - 1e-9) * p * n;
}

/* ---------- envios de WhatsApp: ✓ enviado · ✓✓ entregue · ! não saiu · ◷ pendente (nunca azul) ---------- */
/** Plano 1000b · AB-080: os erros que a Meta devolve em inglês («Re-engagement message», «código 131026 Message undeliverable») viram
    português claro; o texto original fica em `erroOriginal` (vai no title). Erro sem padrão conhecido passa como veio. */
const ERROS_ENVIO_PT = [
  [/131047|re-?engagement/i, "fora da janela de 24 h: só um modelo aprovado pela Meta pode abrir a conversa"],
  [/131026|undeliverable|not a valid whatsapp user/i, "o número não recebeu a mensagem (pode não ter WhatsApp ou estar com o app desatualizado)"],
  [/131030|not in (the )?allowed list/i, "o número não está na lista de destinos permitidos do número de teste"],
  [/131056|pair rate limit/i, "muitas mensagens seguidas para o mesmo número: tente de novo em alguns minutos"],
  [/130429|131048|rate limit|spam rate/i, "limite de envio da Meta atingido: tente de novo mais tarde"],
  [/132000|132001|template.*(does not exist|not exist|translation)/i, "o modelo de mensagem não existe ou não foi aprovado neste idioma"],
  [/access token|oauth|session has expired/i, "o acesso do número ao WhatsApp expirou: conecte o número de novo"],
  [/131031|account.*(locked|restricted)/i, "a conta do WhatsApp está bloqueada ou restrita pela Meta"],
  [/timed? ?out|ETIMEDOUT/i, "o WhatsApp demorou demais para responder"],
];
/** Plano 2000d · DA-259: corta em `max` caracteres sem partir palavra, terminando em «…» (antes slice(0,160) no meio da palavra). */
export function cortarEmPalavra(s, max = 160) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1), esp = corte.lastIndexOf(" ");
  return `${(esp > max * 0.5 ? corte.slice(0, esp) : corte).replace(/[\s,;:.\-–—]+$/, "")}…`;
}
export function erroEnvioPt(erro) {
  const s = String(erro || "");
  if (!s) return "";
  const achou = ERROS_ENVIO_PT.find(([re]) => re.test(s));
  return achou ? achou[1] : s;
}
/** Plano 1000b · AB-199: com `agora`, o «enviado» sem confirmação há mais de 24 h vira «enviado · sem confirmação de entrega» (antes um
    diário de 10 dias atrás dizia «entrega ainda não confirmada» para sempre). Sem `agora`, o texto de sempre (igual ao do clássico). */
export const SEM_CONFIRMACAO_MS = 24 * 36e5;
export function statusEnvio(x, agora = null) {
  if (!x) return null;
  const erro = String(x.erro || x.erro_envio || "");
  const naoChegou = /não entregou/i.test(erro);
  // plano 1000 (AD-032): saiu para um número e falhou para outro (erroDeEnvio «5511…: motivo») — «parcial», nunca ✓ limpo
  if ((x.enviado_em || x.entregue_em) && erro && !naoChegou) {
    const total = Array.isArray(x.destinos) ? x.destinos.length : 0, falhas = erro.split("; ").filter(s => /^[^:\s]+: /.test(s)).length;
    const ok = total && falhas && falhas < total ? total - falhas : 0;
    const quando = x.entregue_em || x.enviado_em;
    return { k: "parcial", tique: "✓!", rotulo: ok ? `enviado a ${ok} de ${total} às ${horaSP(quando)}` : `enviado em parte às ${horaSP(quando)}`, hora: horaSP(quando), erro: cortarEmPalavra(erroEnvioPt(erro), 160), erroOriginal: erro.slice(0, 300) };   // plano 1000b · AB-080 · plano 2000d · DA-259
  }
  if (x.entregue_em) return { k: "entregue", tique: "✓✓", rotulo: `entregue às ${horaSP(x.entregue_em)}`, hora: horaSP(x.entregue_em) };
  if (x.enviado_em && !naoChegou) {
    const velho = agora != null && Number.isFinite(+agora) && +agora - Date.parse(x.enviado_em) > SEM_CONFIRMACAO_MS;   // AB-199
    // plano 2000d · DA-258: o «sem confirmação» diz QUANDO saiu (o mensal da madrugada virava «sem confirmação» sem data) — em
    // `rotuloData` (o `rotulo` fica igual ao do painel clássico, que tem a mesma régua)
    return { k: "enviado", tique: "✓", ...(velho ? { rotuloData: `enviado em ${ddmmSP(x.enviado_em)} · sem confirmação de entrega` } : {}), rotulo: velho ? "enviado · sem confirmação de entrega" : `enviado às ${horaSP(x.enviado_em)} · entrega ainda não confirmada`, hora: horaSP(x.enviado_em) };
  }
  if (erro) return { k: "erro", tique: "!", rotulo: naoChegou ? "não entregue" : "não enviado", hora: x.enviado_em ? horaSP(x.enviado_em) : null, erro: cortarEmPalavra(erroEnvioPt(erro), 160), erroOriginal: erro.slice(0, 300) };   // plano 1000b · AB-080 · plano 2000d · DA-259
  return { k: "pendente", tique: "◷", rotulo: "gerado, ainda não enviado", hora: null };
}

/* ---------- conexão com Meta/Google (regra "integracao", que só o servidor conhece) ---------- */
/** Plano 1000b · AB-081: a CHAVE decide primeiro («integracao|google»); a mensagem só quando a chave não diz — e nela «Google» vence
    «meta», que também é palavra comum («a meta de custo» numa mensagem do Google era atribuída ao Meta). */
export function canalDe(a) {
  const k = String((a && a.chave) || "").toLowerCase(), m = String((a && a.mensagem) || "").toLowerCase();
  if (/\|meta\b|\bmeta\b/.test(k)) return "meta";
  if (/\|google\b|\bgoogle\b/.test(k)) return "google";
  return /\bgoogle\b/.test(m) ? "google" : /\bmeta\b/.test(m) ? "meta" : null;
}
// plataforma desconhecida mas presente (lead marcado como anúncio sem dizer de onde) ainda é anúncio — igual ao nucleo.nomePlat
export const nomePlat = p => (p === "meta" ? "Meta" : p === "google" ? "Google" : p ? "Anúncio" : "Sem anúncio");
export function nomeRegraSrv(a, regras = []) {
  if (a.regra === "integracao") { const c = canalDe(a); return c ? `Conexão com ${nomePlat(c)}` : "Conexão com os anúncios"; }
  const r = regras.find(x => x.id === a.regra);
  return r ? r.nome : a.regra === "ritmo" ? "Ritmo do orçamento" : "Aviso do radar";
}
/** Estado das leituras (cópia do painel): erro · atrasado (> 2 h) · aguardando (nunca leu) · ok · nenhuma. */
export function estadoIntegracao(integs = [], alertas = [], agora = Date.now()) {
  const H = 36e5, ORD_E = { erro: 4, atrasado: 3, parcial: 2, aguardando: 1, ok: 0 };
  const canais = (integs || []).filter(i => i && i.ativo).map(i => {
    const sync = i.ultimo_sync ? Date.parse(i.ultimo_sync) : NaN;
    const al = (alertas || []).filter(a => a && a.regra === "integracao" && canalDe(a) === i.canal && agora - Date.parse(a.criado_em) <= 24 * H)
      .sort((x, y) => instante(y.criado_em) - instante(x.criado_em))[0] || null;
    const statusErro = /^erro/i.test(i.status || "");
    const alAtivo = !!al && (statusErro || !(Number.isFinite(sync) && sync > Date.parse(al.criado_em)));
    // F5: «parcial» = a leitura rodou mas pode estar incompleta (teto de páginas do Meta, 0 linhas há dias) — não é «Atualizado»
    // plano 1000 (AD-138/SV-195): leitura PARCIAL não avança ultimo_sync — fica em ultimo_sync_parcial (servidor novo, por detecção).
    // Parcial mais nova que a última completa e recente (≤ 2 h) é «parcial», não «atrasado» nem «aguardando»
    const parc = i.ultimo_sync_parcial ? Date.parse(i.ultimo_sync_parcial) : NaN;
    const parcRecente = Number.isFinite(parc) && !(parc <= sync) && agora - parc <= 2 * H;
    const estado = statusErro || alAtivo ? "erro" : parcRecente ? "parcial" : !Number.isFinite(sync) ? "aguardando" : agora - sync > 2 * H ? "atrasado" : /^parcial/i.test(i.status || "") ? "parcial" : "ok";
    return { canal: i.canal, estado, sync: Number.isFinite(sync) ? sync : null, parcial: Number.isFinite(parc) ? parc : null, status: i.status || "", alerta: alAtivo ? al : null };
  });
  const nivel = canais.reduce((n, c) => (ORD_E[c.estado] > ORD_E[n] ? c.estado : n), canais.length ? "ok" : "nenhuma");
  const syncs = canais.map(c => c.sync).filter(Boolean);
  // plano 1000b · AB-200: integração pausada (ativo=false) não muda o nível, mas aparece no detalhe da pílula («Meta · pausada»)
  const pausadas = (integs || []).filter(i => i && !i.ativo && i.canal && !canais.some(c => c.canal === i.canal))
    .map(i => ({ canal: i.canal, estado: "pausada", sync: i.ultimo_sync && Number.isFinite(Date.parse(i.ultimo_sync)) ? Date.parse(i.ultimo_sync) : null, status: i.status || "" }));
  // (não enumerável: o estado continua igual ao do painel clássico para quem compara campo a campo)
  return Object.defineProperty({ nivel, canais, erros: canais.filter(c => c.estado === "erro"), ultimo: syncs.length ? Math.max(...syncs) : null }, "pausadas", { value: pausadas, enumerable: false });
}
/** Texto da pílula de conexão. */
export function textoPilula(e, agora = Date.now()) {
  if (e.nivel === "erro") { const n = e.erros.map(x => nomePlat(x.canal)); return `${n.join(" e ")} ${n.length > 1 ? "desconectados" : "desconectado"}`; }
  if (e.nivel === "atrasado") return "Leitura atrasada";
  if (e.nivel === "parcial") { const n = e.canais.filter(c => c.estado === "parcial").map(c => nomePlat(c.canal)); return `Leitura parcial · ${n.join(" e ")}`; }
  if (e.nivel === "aguardando") return "Aguardando a 1ª leitura (costuma levar até 1 hora)";   // plano 2000d · DA-365: quanto esperar
  if (e.nivel === "ok") return `Atualizado ${minutosAtras(e.ultimo, agora)}`;
  return "";
}
export const textoQueda = erros => erros.map(x => `${nomePlat(x.canal)} desconectado · dados até ${x.sync ? `${ddmmSP(x.sync)} ${horaSP(x.sync)}` : "aguardando primeira leitura"}.`).join(" ");

/* ---------- radar: episódios (núcleo) + registro do servidor ---------- */
export const SEV_NOME = { critico: "crítico", alerta: "alerta", info: "informativo" };
/** Plano 2000d · DA-201/DA-202: o instante (ms) de um carimbo ISO com qualquer fuso; sem data válida → -Infinity (vai para o fim). */
export const instante = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? t : -Infinity; };
/** Último alerta do servidor por chave. */
export function alertasPorChave(alertas = []) {
  const m = new Map();
  // plano 2000d · DA-201: pelo INSTANTE (Date.parse) — «…-03:00» × «…Z» comparados como texto elegiam o alerta antigo
  for (const a of alertas || []) { const e = m.get(a.chave); if (!e || instante(a.criado_em) > instante(e.criado_em)) m.set(a.chave, a); }
  return m;
}
/** Tudo que a aba Radar mostra, já decidido: conexões no topo, episódios dos últimos 14 dias, registro de avisos. */
/** F4: a conta Google gastou na janela inteira e não registrou NENHUMA conversão — o acompanhamento de conversões não está
    ligado; «Campanha sem conversa» (r2) ali é ruído diário, não diagnóstico. */
// plano 2000d · DA-203: quando a integração do Google diz que há ações de conversão ativas (`acoes_conversao` > 0 ou
// `conversoes_ativas`, quando o servidor mandar), zero conversão é campanha ruim, não acompanhamento desligado — o r2 continua
export function googleTemAcaoConversao(integracoes = []) {
  return (Array.isArray(integracoes) ? integracoes : []).some(i => i && i.canal === "google" && (i.conversoes_ativas === true || (+i.acoes_conversao || 0) > 0));
}
export function googleSemConversao(M, { integracoes = null } = {}) {
  if (!M || !M.LINHAS) return false;
  if (integracoes && googleTemAcaoConversao(integracoes)) return false;
  // plano 1000 (AD-005): a MESMA janela fixa do núcleo (últimos 30 dias) — o painel (130 dias) e o WhatsApp (45) concordam
  if (typeof M.GOOGLE_SEM_CONVERSAO === "boolean") return M.GOOGLE_SEM_CONVERSAO;
  let gasto = 0, conv = 0;
  for (const l of M.LINHAS) if (l.plat === "google" && l.i > M.R - 30 && l.i <= M.R) { gasto += +l.gasto || 0; conv += +l.conversoes || 0; }
  return gasto > 0 && conv === 0;
}
const r2Google = (M, a) => !!a && !!a.regra && a.regra.id === "r2" && !!M.CAMP[String(a.chave).slice(3)] && M.CAMP[String(a.chave).slice(3)].plat === "google";
export function montarRadar(M, dados = {}, agora = Date.now()) {
  const vazio = semAnuncios(M);
  const semConvG = !vazio && googleSemConversao(M, { integracoes: dados && dados.integracoes });   // plano 2000d · DA-203
  const atuais = vazio ? [] : M.avaliar(M.R, true).filter(a => !(semConvG && r2Google(M, a)));
  const hist = vazio ? [] : M.historico().filter(e => !(semConvG && r2Google(M, e.a)));
  const srv = alertasPorChave(dados.alertas);
  const est = estadoIntegracao(dados.integracoes || [], dados.alertas || [], agora);
  const conexoes = [...srv.values()].filter(a => a.regra === "integracao")
    .sort((x, y) => instante(y.criado_em) - instante(x.criado_em))   // plano 2000d · DA-202
    .map(a => { const c = canalDe(a); return { a, canal: c, nome: nomeRegraSrv(a), ativo: est.erros.some(x => x.canal === c), envio: a.enviado_em || a.entregue_em ? statusEnvio(a) : null }; });
  const episodios = hist.slice(0, 12).map(e => {
    const ativo = e.ate === M.R, a = e.a, s = srv.get(a.chave);
    // plano 1000 (AD-046): episódio interrompido por «Silenciar 7 dias» não é «resolvido» — diz até quando está calado
    const silenciado = !ativo && typeof M.silenciadoAte === "function" ? M.silenciadoAte(a.chave) : null;
    const desde = ativo ? (e.desde === M.R ? "desde ontem · continua" : `desde ${M.dMes(e.desde)} · continua`)
      : (e.desde === e.ate ? `em ${M.dMes(e.desde)}` : `de ${M.dMes(e.desde)} a ${M.dMes(e.ate)}`) + (silenciado ? ` · silenciado até ${silenciado.slice(8, 10)}/${silenciado.slice(5, 7)}` : "");
    return { chave: a.chave, regra: a.regra.id, nome: a.regra.nome, sev: a.sev, msg: a.msg, acao: a.acao, ativo, desde, silenciado,
             envio: s && (s.enviado_em || s.entregue_em) ? statusEnvio(s) : null };
  });
  // no lugar dos r2 do Google: um aviso informativo, ativo, que diz o que ligar
  if (semConvG) episodios.unshift({ chave: "google_sem_conversao", regra: "google_sem_conversao", nome: "Google sem acompanhamento de conversões", sev: "info",
    msg: "O Google Ads gastou no período e não registrou nenhuma conversão: o acompanhamento de conversões da conta não está ligado. Enquanto isso, «Campanha sem conversa» fica desligada para o Google.",
    acao: "Ligue o acompanhamento de conversões (clique no WhatsApp ou formulário) na conta do Google Ads.", ativo: true, desde: "nos últimos 30 dias", envio: null });   // plano 1000b · AB-208: a janela da regra (antes «desde agora»)
  const SEV_OK = new Set(["critico", "alerta", "info"]);
  const registroTotal = (dados.alertas || []).length;   // plano 1000b · AB-077: a tela diz «os 10 mais recentes de N»
  const registro = (dados.alertas || []).slice().sort((a, b) => instante(b.criado_em) - instante(a.criado_em)).slice(0, 10)   // plano 2000d · DA-202
    .map(a => ({ a, sev: SEV_OK.has(a.severidade) ? a.severidade : "alerta", nome: nomeRegraSrv(a, M ? M.REGRAS : []), quando: quandoSP(a.criado_em, new Date(agora)), envio: statusEnvio(a, agora) }));   // AB-199
  // plano 1000 (AD-057): a lista mostra 12 episódios — os que ficaram de fora são contados («e mais N nos últimos 14 dias»)
  const ocultos = Math.max(0, hist.length - 12);
  // plano 1000b · AB-079: plataforma sem leitura (erro ou atrasada) faz r2/r5/r6 dispararem por FALTA de número — o episódio leva a
  // ressalva e não entra no selo
  const parados = new Set(est.canais.filter(c => c.estado === "erro" || c.estado === "atrasado").map(c => c.canal));
  for (const ep of episodios) {
    const canal = leituraParadaAfeta(M, ep.chave, parados);
    if (canal) { ep.faltaLeitura = true; ep.ressalva = `Pode ser falta de leitura: ${canal === "conta" ? "uma plataforma" : `o ${nomePlat(canal)}`} está sem leitura nova — confira a conexão antes de mexer na campanha.`; }
  }
  const atuaisSelo = atuais.filter(a => !leituraParadaAfeta(M, a.chave, parados));
  return { atuais, ativos: atuais.length + est.erros.length + (semConvG ? 1 : 0), conexoes, episodios, ocultos, registro, registroTotal, estado: est, googleSemConversao: semConvG,
    selo: seloRadar(atuaisSelo, est.erros.length) };
}
/** Plano 1000b · AB-079: as regras que disparam por FALTA de número (sem conversa, investimento parou, CRM parou) e a plataforma que as
    afeta, quando ela está sem leitura (parados = Set de canais com erro/atrasado). → "meta" | "google" | "conta" (r5, conta inteira) | null. */
export const REGRAS_FALTA_LEITURA = Object.freeze(["r2", "r5", "r6"]);
export function leituraParadaAfeta(M, chave, parados) {
  if (!parados || !parados.size) return null;
  const [regra, resto] = String(chave || "").split("|");
  if (!REGRAS_FALTA_LEITURA.includes(regra)) return null;
  if (regra === "r5") return "conta";
  if (regra === "r6") return parados.has(resto || "meta") ? (resto || "meta") : null;
  const c = M && M.CAMP && M.CAMP[resto];
  return c && parados.has(c.plat) ? c.plat : null;
}
/** Plano 1000 (AD-045): o selo da aba Radar conta só o que pede ação (crítico e atenção) e pinta pela maior gravidade —
    antes «Radar 4» em vermelho só com informativos (ritmo, Google sem acompanhamento). {n, sev: "critico"|"alerta"|null}. */
export function seloRadar(atuais = [], conexoesCaidas = 0) {
  const crit = (atuais || []).filter(a => a && a.sev === "critico").length + (+conexoesCaidas || 0);
  const alerta = (atuais || []).filter(a => a && a.sev === "alerta").length;
  return { n: crit + alerta, sev: crit ? "critico" : alerta ? "alerta" : null };
}

/** Plano 1000 (AD-059): a campanha de um alerta do radar (r1/r2 pela chave; r3/r4 pelo criativo) — null para regras da conta, ritmo e conexão. */
export function campanhaDoAlerta(M, chave) {
  const m = /^(r[1-4])\|(.+)$/.exec(String(chave || ""));
  if (!m || !M) return null;
  if (m[1] === "r1" || m[1] === "r2") return M.CAMP && M.CAMP[m[2]] ? m[2] : null;
  const k = M.CRI && M.CRI[m[2]];
  return k && M.CAMP && M.CAMP[k.camp] ? k.camp : null;
}
/** A «linha» de uma campanha no período (o mesmo formato de linhasCampanhas), mesmo sem investimento nele — a gaveta de criativos abre do alerta. */
export function linhaCampanha(M, campId, { dias = 30 } = {}) {
  const c = M && M.CAMP && M.CAMP[campId];
  if (!c) return null;
  const { de, ate } = janela(M, dias);
  const t = M.consolidar(M.linhasDe(de, ate, { camp: campId })), k = M.crmTot(de, ate, { camp: campId });
  return { c, t, k, cpp: k.fecharam ? t.gasto / k.fecharam : null, cpag: k.agendadas ? t.gasto / k.agendadas : null, roas: t.gasto ? k.receita / t.gasto : null };
}

/** Plano 1000b · AB-261: status «ok — 0 linhas» (anúncios parados) aparece no detalhe da pílula; com linhas, nada muda. */
const linhasZeradas = status => { const m = /(\d+)\s+linhas?\b/i.exec(String(status || "")); return !!m && Number(m[1]) === 0; };
/** Plano 1000 (AD-081): o detalhe da pílula de conexão, por plataforma (antes só no title — fora do alcance do toque e do teclado). */
export function detalhePilula(e, agora = Date.now()) {
  return ((e && e.canais) || []).map(c => ({ canal: c.canal, nome: nomePlat(c.canal), estado: c.estado,
    // AD-138/SV-195: com ultimo_sync_parcial mais novo, o detalhe diz quando foi a leitura parcial e quando foi a última completa
    texto: `${c.parcial && !(c.parcial <= c.sync) ? `leitura parcial ${quandoSP(c.parcial, new Date(agora))} · ${c.sync ? `última completa ${quandoSP(c.sync, new Date(agora))}` : "nenhuma completa ainda"}`
      : c.sync ? `lida ${quandoSP(c.sync, new Date(agora))}` : "ainda não leu"}${linhasZeradas(c.status) ? " · 0 linhas lidas" : ""}${c.estado === "parcial" ? ` · ${String(c.status || "").replace(/^parcial\s*—\s*/i, "")}` : ""}${c.estado === "erro" ? " · desconectado" : c.estado === "atrasado" ? " · leitura atrasada" : ""}` }))
    // plano 1000b · AB-200: as pausadas no fim — os números dela pararam porque alguém desligou a integração
    .concat(((e && e.pausadas) || []).map(c => ({ canal: c.canal, nome: nomePlat(c.canal), estado: "pausada",
      texto: `pausada — sem leituras até ligar de novo${c.sync ? ` (última ${quandoSP(c.sync, new Date(agora))})` : ""}` })));
}
/** Plano 1000 (AD-127): o Órbita lê o Meta/Google de hora em hora — quanto falta para a próxima leitura (o botão só recarrega do banco). */
export const CICLO_LEITURA_MIN = 60;
export const ATRASO_LEITURA_MS = 2 * 36e5;   // plano 1000b · AB-155: a mesma régua do «atrasado» do estadoIntegracao
// plano 2000d · DA-226: depois de uma leitura que FALHOU (`erro`) não promete «em ~N min» — diz que tenta de novo na próxima hora
export function proximaLeitura(ultimo, agora = Date.now(), { erro = false } = {}) {
  if (erro) return "a última leitura falhou — o Órbita tenta de novo na próxima hora";
  if (!Number.isFinite(ultimo)) return "";
  // plano 1000b · AB-155: passou de 2 h sem leitura não é «a qualquer momento» — diz desde quando está atrasada
  if (agora - ultimo > ATRASO_LEITURA_MS) {
    const d = new Date(ultimo), mesmoDia = hojeSP(d) === hojeSP(new Date(agora));
    return `leitura atrasada desde ${mesmoDia ? FMT_HORA.format(d) : `${FMT_DDMM.format(d)} ${FMT_HORA.format(d)}`} — o Órbita tenta de novo a cada hora`;
  }
  const falta = Math.round((ultimo + CICLO_LEITURA_MIN * 6e4 - agora) / 6e4);
  return falta > 1 ? `próxima leitura em ~${falta} min` : "próxima leitura a qualquer momento";
}
/** Plano 1000 (AD-093): o centro da rosca Meta × Google mostra a plataforma com MAIS investimento (antes «0% no Meta» para quem só usa Google). */
export function centroRosca(fatias = []) {
  const tot = fatias.reduce((s, f) => s + (+f.valor || 0), 0);
  if (!(tot > 0)) return { valor: "—", rotulo: "sem investimento" };
  const maior = fatias.reduce((a, b) => ((+b.valor || 0) > (+a.valor || 0) ? b : a));
  return { valor: `${Math.round((+maior.valor || 0) / tot * 100)}%`, rotulo: `no ${maior.rotulo}` };
}

/** Plano 1000 (AD-080): fuso da conta de anúncios diferente de São Paulo, lido do sufixo «· fuso X» do status da integração. */
export function fusosDiferentes(integs = []) {
  const out = [];
  for (const i of integs || []) {
    if (!i || !i.ativo) continue;
    const m = /fuso\s+([A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2})/.exec(String(i.status || ""));
    if (m && m[1] !== FUSO) out.push({ canal: i.canal, fuso: m[1] });
  }
  return out;
}

/** Plano 1000 (AD-138): diferença entre o relógio do servidor e o do aparelho (ms), quando o nx_dados manda a hora dele
    (`agora`/`servidor_em`, por detecção — o RPC atual não manda: 0). minutosAtras/quandoSP recebem `Date.now() + desvio`. */
export function desvioRelogio(dados, recebidoEm = Date.now()) {
  const s = dados && (dados.agora || dados.servidor_em);
  const t = s ? Date.parse(s) : NaN;
  if (!Number.isFinite(t)) return 0;
  const d = t - recebidoEm;
  return Math.abs(d) > 60000 ? d : 0;   // abaixo de 1 min é ruído de rede
}

/** Plano 1000 (AD-022/AD-024): orgânicos do período (fora do funil dos anúncios por desenho) — a tela diz quantos houve. */
/** Plano 2000d · DA-356: quanto tempo o funil leva — mediana em dias da conversa ao agendamento (só agendamento com data de verdade) e
    do agendamento/conversa ao fechamento (só fechamento com data, não aproximada). Leads de anúncio com conversa no período. */
export function temposFunil(M, { dias = 30, plat = "" } = {}) {
  const { de, ate } = janela(M, dias);
  const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const ag = [], fe = [];
  for (const Ld of (M && M.LEADS) || []) {
    if (!Ld.plat || (plat && Ld.plat !== plat) || Ld.i < de || Ld.i > ate) continue;
    if (Ld.iAgenda != null && !Ld.agendaEstimada && Ld.iAgenda >= Ld.i) ag.push(Ld.iAgenda - Ld.i);
    if (Ld.fechou && Ld.iConsulta != null && !Ld.dataAproximada && Ld.iConsulta >= Ld.i) fe.push(Ld.iConsulta - Ld.i);
  }
  return { conversaAgenda: med(ag), conversaFechamento: med(fe), nAgenda: ag.length, nFechamento: fe.length };
}
/** Plano 2000d · DA-356: a frase do tempo do funil («da conversa ao agendamento: ~2 dias · até fechar: ~9 dias»); "" com menos de 3 casos. */
export function textoTemposFunil(t, { ag = "agendamento", fe = "fechamento" } = {}) {
  if (!t) return "";
  const d = v => (v < 1 ? "no mesmo dia" : `~${Math.round(v)} ${Math.round(v) === 1 ? "dia" : "dias"}`);
  const partes = [];
  if (t.nAgenda >= 3 && t.conversaAgenda != null) partes.push(`da conversa ao ${ag}: ${d(t.conversaAgenda)}`);
  if (t.nFechamento >= 3 && t.conversaFechamento != null) partes.push(`da conversa ao ${fe}: ${d(t.conversaFechamento)}`);
  return partes.length ? `Tempo típico (mediana) — ${partes.join(" · ")}.` : "";
}
/** Plano 2000d · DA-357: por que se perde — leads de anúncio perdidos no período por motivo (bruto.motivo_perda/motivo, quando o
    servidor manda); [] sem nenhum motivo informado (a tela não mostra nada inventado). */
export function perdasPorMotivo(M, { dias = 30, plat = "" } = {}) {
  const { de, ate } = janela(M, dias);
  const m = new Map(); let comMotivo = 0;
  for (const Ld of (M && M.LEADS) || []) {
    if (!Ld.plat || (plat && Ld.plat !== plat) || Ld.i < de || Ld.i > ate || Ld.etapaReal !== "perdida") continue;
    const b = Ld.bruto || {}, mot = String(b.motivo_perda || b.motivo_perda_nome || b.motivo || "").trim();
    if (mot) comMotivo++;
    const k = mot || "sem motivo informado";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return comMotivo ? [...m.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo, "pt-BR")) : [];
}
export function organicosPeriodo(M, { dias = 30 } = {}) {
  const { de, ate } = janela(M, dias);
  let n = 0;
  for (const Ld of (M && M.LEADS) || []) if (!Ld.plat && Ld.i >= de && Ld.i <= ate) n++;
  return n;
}

/* ---------- relatórios enviados ---------- */
// plano 2000d · DA-198: no mesmo dia de referência, o mensal antes do semanal e este antes do diário
const ORDEM_TIPO_REL = Object.freeze({ mensal: 2, semanal: 1, diario: 0 });
/** Plano 2000d · DA-198: «Semana de 13/10 a 19/10» (a referência é a segunda-feira; a semana fecha no domingo). */
export function tituloSemana(ref) {
  const t = Date.parse(`${String(ref || "").slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return "Resumo da semana";
  const dm = ms => { const d = new Date(ms).toISOString().slice(0, 10); return `${d.slice(8, 10)}/${d.slice(5, 7)}`; };
  return `Semana de ${dm(t)} a ${dm(t + 6 * 864e5)}`;
}
// plano 1000b · AB-199: `agora` envelhece o «enviado» sem confirmação (24 h)
export function listaRelatorios(relatorios = [], n = 12, agora = Date.now()) {
  const validos = Array.isArray(relatorios) ? relatorios.filter(r => {
    // plano 2000d · DA-198: o resumo semanal (segunda a domingo, referência = a segunda) também entra no histórico
    if (!r || typeof r !== "object" || !["diario", "semanal", "mensal"].includes(r.tipo)) return false;
    const ref = typeof r.referencia === "string" ? r.referencia.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || !Number.isFinite(Date.parse(`${ref}T12:00:00Z`)) || new Date(`${ref}T12:00:00Z`).toISOString().slice(0, 10) !== ref) return false;
    const mes = Number(ref.slice(5, 7));
    return mes >= 1 && mes <= 12;
  }) : [];
  // plano 1000b · AB-053: a lista diz quantos válidos havia (`total`, não enumerável) — a tela avisa «os 12 mais recentes de N»
  const lista = validos.slice()
    .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)) || ORDEM_TIPO_REL[b.tipo] - ORDEM_TIPO_REL[a.tipo])   // plano 2000d · DA-198
    .slice(0, n)
    .map(r => {
      const ref = String(r.referencia).slice(0, 10);
      const titulo = r.tipo === "mensal" ? `Resumo de ${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : r.tipo === "semanal" ? tituloSemana(ref) : `Diário de ${dataIsoBR(ref)}`;
      return { chave: `${r.tipo}|${ref}`, tipo: r.tipo, ref, titulo, ia: !!r.leitura_ia, envio: statusEnvio(r, agora), r };
    });
  Object.defineProperty(lista, "total", { value: validos.length, enumerable: false });
  return lista;
}
/** Plano 1000b · AB-053/AB-077: «Mostrando os 12 relatórios mais recentes de 20.» — "" quando nada ficou de fora. */
export function notaCorte(mostrados, total, { um = "relatório", varios = "relatórios" } = {}) {
  const m = +mostrados || 0, t = +total || 0;
  if (!(t > m)) return "";
  return `Mostrando ${m === 1 ? `o ${um} mais recente` : `os ${m} ${varios} mais recentes`} de ${t.toLocaleString("pt-BR")}.`;
}

/** *negrito*, _itálico_ e quebras do WhatsApp → tokens (o front monta com textContent, nunca innerHTML). */
export function tokensWa(txt) {
  const out = [];
  const linhas = String(txt ?? "").split("\n");
  linhas.forEach((ln, n) => {
    if (n) out.push({ t: "br" });
    // plano 1000b · AB-198: também ```mono``` (t "code") e ~tachado~ (t "s", como o _itálico_: só no começo de palavra)
    const re = /```([^`\n]+)```|\*([^*\n]+)\*|(^|[\s(])_([^_\n]+)_|(^|[\s(])~([^~\n]+)~/g;
    let pos = 0, m;
    while ((m = re.exec(ln))) {
      const inteiro = m[1] != null ? ["code", m[1]] : m[2] != null ? ["b", m[2]] : null;
      if (inteiro) {
        if (m.index > pos) out.push({ t: "txt", v: ln.slice(pos, m.index) });
        out.push({ t: inteiro[0], v: inteiro[1] });
      } else {
        const ital = m[4] != null, lado = ital ? m[3] : m[5];
        const ini = m.index + lado.length;
        if (ini > pos) out.push({ t: "txt", v: ln.slice(pos, ini) });
        out.push({ t: ital ? "i" : "s", v: ital ? m[4] : m[6] });
      }
      pos = re.lastIndex;
    }
    if (pos < ln.length) out.push({ t: "txt", v: ln.slice(pos) });
  });
  // plano 2000d · DA-207: endereços https no texto viram token de link (t "a") — como o WhatsApp mostra; só https, sem pontuação final
  const comLinks = [];
  for (const tk of out) {
    if (tk.t !== "txt") { comLinks.push(tk); continue; }
    const re = /https:\/\/[^\s<>"']+/g;
    let p = 0, m;
    while ((m = re.exec(tk.v))) {
      const url = m[0].replace(/[.,;:!?)\]]+$/, "");
      if (m.index > p) comLinks.push({ t: "txt", v: tk.v.slice(p, m.index) });
      comLinks.push({ t: "a", v: url });
      p = m.index + url.length;
      re.lastIndex = p;
    }
    if (p < tk.v.length) comLinks.push({ t: "txt", v: tk.v.slice(p) });
  }
  return comLinks;
}

/* ============================================================
   4. RELATÓRIOS (T13) — períodos, formatos e blocos prontos
   ============================================================ */
export const MAX_DIAS = 366;                         // p_ate − p_de ≤ 366 (periodo_grande no servidor)
export const PRESETS = [7, 30, 90];
/** Período dos últimos `dias` terminando HOJE (SP): 30 dias = hoje e os 29 anteriores. */
/** Plano 1500c · AC-156/AC-117: por padrão os atalhos terminam ONTEM (dias inteiros contra dias inteiros — com hoje pela metade a
    comparação «caía» de manhã); `incluirHoje` volta ao período que termina hoje (dia parcial, com o aviso na legenda). */
export function periodoPreset(dias, hoje = hojeSP(), { incluirHoje = false } = {}) {
  const ate = incluirHoje ? hoje : somarDias(hoje, -1);
  return { de: somarDias(ate, -(dias - 1)), ate };
}
/** Confere um período personalizado antes de chamar o servidor. */
export function validarPeriodo(de, ate, hoje = hojeSP()) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(de || "")) || !re.test(String(ate || ""))) return { ok: false, erro: "dados_invalidos", texto: "Escolha as duas datas." };
  const n = difDias(de, ate);
  if (n < 0) return { ok: false, erro: "dados_invalidos", texto: "A data inicial precisa vir antes da final." };
  // plano 1000 (AD-140): o futuro não tem número — o período termina no máximo hoje (os campos também levam max=hoje)
  if (hoje && re.test(String(hoje)) && difDias(hoje, ate) > 0) return { ok: false, erro: "dados_invalidos", texto: "A data final não pode passar de hoje." };
  if (n > MAX_DIAS) return { ok: false, erro: "periodo_grande", texto: "Escolha um período de até 1 ano." };
  return { ok: true, dias: n + 1 };
}
/** "12 min" · "1 h 05 min" · "26 h" · "3,5 dias" (sem valor → "—"). */
export function duracaoMin(min) {
  if (!fin(min)) return "—";
  const m = Math.max(0, min);
  if (m < 1) return "< 1 min";
  const t = Math.round(m);                                  // arredonda UMA vez: 119,7 min vira "2 h", nunca "1 h 60 min"
  if (t < 60) return `${t} min`;
  if (t < 48 * 60) {
    const hh = Math.floor(t / 60), mm = t % 60;
    return hh < 10 ? (mm ? `${hh} h ${p2(mm)} min` : `${hh} h`) : `${Math.round(t / 60)} h`;
  }
  return `${String(Math.round(t / 144) / 10).replace(".", ",")} dias`;
}
export const duracaoH = h => (fin(h) ? duracaoMin(h * 60) : "—");
/** Rótulo curto de um dia AAAA-MM-DD ("05/09") e longo ("sex · 05/09"). */
export const ddmmIso = iso => { const [, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}`; };
export function diaLongoIso(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} · ${p2(d)}/${p2(m)}`;
}
/** "Anúncio · Meta" / "WhatsApp" / "Indicação"… */
export function nomeOrigem(origem, plataforma) {
  const O = { anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico", manual: "Cadastro manual", sem_origem: "Sem origem", site: "Site", importacao: "Importação", formulario: "Formulário do site" };
  // plano 1000b · AB-175: origem fora da tabela («tiktok_ads») sem o código cru — «Tiktok ads»
  const legivel = o => { const t = String(o).replace(/_+/g, " ").replace(/\s+/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Sem origem"; };
  const base = O[origem] || (origem ? legivel(origem) : "Sem origem");
  return plataforma ? `${base} · ${nomePlat(plataforma)}` : base;
}
/** Os KPIs da aba Vendas: [{id, rotulo, v, a, fmt, sentido}] (fmt = 'int'|'brl0'|'pct'|'dias'). */
export function kpisVendas(r, { negocios = "negócios" } = {}) {   // negocios: a palavra do vocabulário ("oportunidades", "orçamentos"…)
  const k = (r && r.kpis) || {}, a = (r && r.kpis_anterior) || {};
  return [
    { id: "criados", rotulo: "Criados", v: k.criados, a: a.criados, fmt: "int", sentido: "cima", extra: `${negocios} que entraram no período` },
    { id: "ganhos", rotulo: "Ganhos", v: k.ganhos, a: a.ganhos, fmt: "int", sentido: "cima", extra: "pela data em que fecharam" },
    { id: "receita", rotulo: "Receita", v: k.receita, a: a.receita, fmt: "brl0", sentido: "cima", extra: "soma dos ganhos do período" },
    { id: "conversao_pct", rotulo: "Conversão", v: k.conversao_pct, a: a.conversao_pct, fmt: "pct", sentido: "cima", extra: "ganhos ÷ (ganhos + perdidos)" },
    { id: "ticket_medio", rotulo: "Ticket médio", v: k.ticket_medio, a: a.ticket_medio, fmt: "brl0", sentido: "cima", extra: "receita ÷ ganhos" },
    { id: "ciclo_medio_dias", rotulo: "Ciclo médio", v: k.ciclo_medio_dias, a: a.ciclo_medio_dias, fmt: "dias", sentido: "baixo", extra: "da criação ao ganho" },
  ];
}
const milhar = v => Math.round(+v || 0).toLocaleString("pt-BR");
const qtdTxt = (v, um, varios) => { const n = fin(+v) ? +v : 0; return `${milhar(n)} ${n === 1 ? um : varios}`; };
/** Plano 2000d · DA-263: a referência da 1ª resposta (mediana em minutos) — «bom», «dá para melhorar» ou «lento» com a régua. */
export const REF_RESPOSTA_MIN = Object.freeze({ boa: 15, lenta: 60 });
export function referenciaResposta(min) {
  if (!fin(min)) return "";
  return +min <= REF_RESPOSTA_MIN.boa ? "bom: até 15 min" : +min <= REF_RESPOSTA_MIN.lenta ? "dá para melhorar: o ideal é até 15 min" : "lento: acima de 1 h o cliente costuma procurar outro";
}
/** Plano 2000d · DA-262: o resumo do atendimento em texto (para colar no WhatsApp), como o de vendas. */
export function textoResumoAtendimento(r, { de, ate, cliente = "", int = v => String(v), dataBR = v => v } = {}) {
  const k = (r && r.kpis) || {}, n = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : +v);
  const linhas = [`*Atendimento${cliente ? ` · ${cliente}` : ""}* — ${dataBR(de)} a ${dataBR(ate)}`];
  if (n(k.novas) != null) linhas.push(`• ${int(k.novas)} ${+k.novas === 1 ? "conversa nova" : "conversas novas"}`);
  if (n(k.resolvidas) != null) linhas.push(`• ${int(k.resolvidas)} ${+k.resolvidas === 1 ? "resolvida" : "resolvidas"}`);
  if (n(k.tpr_mediana_min) != null) linhas.push(`• 1ª resposta (mediana): ${duracaoMin(k.tpr_mediana_min)} (${referenciaResposta(k.tpr_mediana_min)})`);
  if (n(k.sem_resposta) != null) linhas.push(`• Sem resposta: ${int(k.sem_resposta)}`);
  if (n(k.abertas_agora) != null) linhas.push(`• Abertas agora: ${int(k.abertas_agora)}`);
  return linhas.join("\n");
}
/** Os KPIs da aba Atendimento. */
export function kpisAtendimento(r) {
  const k = (r && r.kpis) || {}, a = (r && r.kpis_anterior) || {};
  return [
    // plano 1000b · AB-015: milhar e plural nos extras («1.234 mensagens recebidas», «1 mensagem recebida»)
    { id: "novas", rotulo: "Conversas novas", v: k.novas, a: a.novas, fmt: "int", sentido: "neutro", extra: qtdTxt(k.msgs_in, "mensagem recebida", "mensagens recebidas") },
    { id: "resolvidas", rotulo: "Resolvidas", v: k.resolvidas, a: a.resolvidas, fmt: "int", sentido: "cima", extra: qtdTxt(k.msgs_out, "mensagem enviada", "mensagens enviadas") },
    { id: "tpr_mediana_min", rotulo: "1ª resposta (mediana)", v: k.tpr_mediana_min, a: a.tpr_mediana_min, fmt: "min", sentido: "baixo",
      // plano 2000d · DA-263: a régua ao lado do número (até 15 min é bom; mais de 1 h, o cliente costuma procurar outro)
      extra: [fin(k.tpr_media_min) ? `média ${duracaoMin(k.tpr_media_min)}` : "", referenciaResposta(k.tpr_mediana_min)].filter(Boolean).join(" · ") },
    { id: "resolucao_mediana_h", rotulo: "Até resolver (mediana)", v: k.resolucao_mediana_h, a: a.resolucao_mediana_h, fmt: "h", sentido: "baixo" },
    { id: "abertas_agora", rotulo: "Abertas agora", v: k.abertas_agora, a: null, agora: true, fmt: "int", sentido: "neutro",
      extra: fin(k.aguardando_agora) ? `${milhar(k.aguardando_agora)} aguardando resposta` : "" },
    { id: "sem_resposta", rotulo: "Sem resposta", v: k.sem_resposta, a: a.sem_resposta, fmt: "int", sentido: "baixo", extra: "abertas no período e nunca respondidas" },
  ];
}
/** Mapa de calor [{dow,hora,qtd}] → matriz 7 × 24 (0 = domingo). */
export function matrizCalor(lista = []) {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const x of lista || []) { const d = +x.dow, hh = +x.hora; if (d >= 0 && d < 7 && hh >= 0 && hh < 24) m[d][hh] += +x.qtd || 0; }
  return m;
}
/** Horário de pico: {dow, hora, qtd} de maior volume (null sem dados). */
// plano 2000d · DA-223: no empate o pico diz quantos outros horários têm o mesmo número (`empates`) — a tela não elege um sozinho
export function picoCalor(m) {
  let melhor = null, empates = 0;
  m.forEach((lin, d) => lin.forEach((q, hh) => {
    if (!(q > 0)) return;
    if (!melhor || q > melhor.qtd) { melhor = { dow: d, hora: hh, qtd: q }; empates = 0; } else if (q === melhor.qtd) empates++;
  }));
  return melhor ? { ...melhor, empates } : null;
}
/** Relatório sem nada no período (mostra "Sem dados no período."). */
export const vendasVazio = r => !r || (!(+(r.kpis || {}).criados) && !(+(r.kpis || {}).ganhos) && !(+(r.kpis || {}).perdidos) && !(+(r.kpis || {}).abertos));
export const atendimentoVazio = r => !r || (!(+(r.kpis || {}).novas) && !(+(r.kpis || {}).resolvidas) && !(+(r.kpis || {}).msgs_in) && !(+(r.kpis || {}).abertas_agora));
/** Texto da conversão para a próxima etapa do funil. */
export function textoConversao(e) {
  if (!e || e.tipo !== "aberto") return null;
  if (!(+e.passaram)) return "ninguém entrou no período";
  // plano 1000b · AB-013: 1 casa no máximo («33,3%», não «33,3333%») e milhar nas entradas («1.500 entraram»)
  const pct = fin(e.conversao_proxima_pct) ? `${Number(e.conversao_proxima_pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
  // plano 2000d · DA-264: acima de 100% (seguiram também os que tinham entrado ANTES do período) — diz isso em vez de «120% seguiram»
  if (fin(e.conversao_proxima_pct) && +e.conversao_proxima_pct > 100) return `${Number(e.passaram).toLocaleString("pt-BR")} ${+e.passaram === 1 ? "entrou" : "entraram"} · seguiram mais do que entraram (inclui quem entrou antes do período)`;
  return `${Number(e.passaram).toLocaleString("pt-BR")} ${+e.passaram === 1 ? "entrou" : "entraram"} · ${pct} seguiram`;
}
/** CSV (separador ;, com BOM para o Excel abrir os acentos) — P1 "CSV por bloco".
    · número sai com vírgula decimal (Excel em português: "12.5" viraria a data 12/mai ou texto);
    · texto que começa com = + - @ tab ou CR ganha um apóstrofo na frente: nome de atendente,
      etapa ou motivo é digitado por usuário e não pode virar FÓRMULA no Excel de quem baixa
      (injeção de CSV — "=HIPERLINK(...)" no nome da conta). */
/** Plano 1500c · AC-163: número no CSV com no máximo 2 casas e nunca em notação científica (0,1 + 0,2 saía «0,30000000000000004»,
    1e-7 saía «1e-7»); a vírgula é o separador decimal. */
export function numeroCsv(v) {
  if (!fin(v)) return "";
  const r = Math.round(v * 100) / 100;
  const t = Number.isInteger(r) ? r.toFixed(0) : r.toFixed(2).replace(/0+$/, "");
  return (t === "-0" ? "0" : t).replace(".", ",");
}
/** Plano 1500c · AC-164: texto que o Excel leria como fórmula — começa com = ou @, tab/CR, ou + / - (também depois de espaços), A NÃO SER
    que o texto inteiro seja só telefone/número («+55 (11) 99999-0000», «-5»): esses não ganham mais o apóstrofo. «-2+3+cmd|…» continua
    protegido (tem letra/símbolo de fórmula). */
const SO_NUMERO_CSV = /^\s*[+-]?[\d\s().,/-]+$/;
export const pareceFormula = s => /^[=@\t\r]/.test(s) || (/^\s*[=+\-@]/.test(s) && !(/^\s*[+-]/.test(s) && SO_NUMERO_CSV.test(s)));
export function csv(colunas, linhas) {
  const q = v => {
    let s;
    if (v == null) s = "";
    else if (typeof v === "number") s = numeroCsv(v);   // plano 1500c · AC-163
    // plano 1000 (AD-261): o teste vale depois dos espaços do começo — « =HIPERLINK(…)» passava e o Excel apara o espaço
    else { s = String(v); if (pareceFormula(s)) s = `'${s}`; }   // plano 1500c · AC-164
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [colunas, ...linhas].map(l => l.map(q).join(";")).join("\r\n");
}

/* ============================================================
   5. INÍCIO (T3)
   ============================================================ */
/** Cliente novo: sem número, sem conversa, sem negócio e sem lead na semana → "Tudo pronto para começar". */
export function inicioVazio(d) {
  if (!d) return false;
  const c = d.conversas || {}, n = d.negocios || {}, l = d.leads || {};
  return !(d.canais || []).length && !(+c.abertas) && !(+c.pendentes) && !(+n.abertos) && !(+n.ganhos_mes) && !(+l.semana);
}
/** Saudação pelo horário de SP. */
export function saudacao(agora = new Date()) {
  const hh = +new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(agora);
  return hh < 5 ? "Boa noite" : hh < 12 ? "Bom dia" : hh < 18 ? "Boa tarde" : "Boa noite";
}
/** Situação de um número de WhatsApp para o bloco "Números". */
export function estadoCanal(k, agora = Date.now()) {
  if (!k) return { nivel: "ruim", texto: "—" };
  // plano 100: o estado ao vivo do aparelho (conectado | desconectado | desconhecido) vem antes do status de cadastro
  if (k.estado === "desconectado") {
    const t = k.desde ? Date.parse(k.desde) : NaN;
    return { nivel: "ruim", texto: Number.isFinite(t) && agora >= t ? `Desconectado ${minutosAtras(t, agora)}` : "Desconectado" };
  }
  if (k.status === "erro") return { nivel: "ruim", texto: "Com erro" };
  if (k.status === "pendente") return { nivel: "aten", texto: k.app_inscrito === false ? "App não inscrito na WABA" : "Aguardando o teste de conexão" };
  const ult = k.ultima_entrada_em ? Date.parse(k.ultima_entrada_em) : NaN;
  if (Number.isFinite(ult) && agora - ult > 72 * 36e5) return { nivel: "aten", texto: "Conectado · sem mensagens há mais de 3 dias" };
  return { nivel: "bom", texto: "Conectado" };
}
/** Receita do mês vs o MESMO pedaço do mês anterior (comparação justa: mesmos dias). */
// plano 2000d · DA-215: `comparavel` = false quando o mês anterior não tem base (zero) ou o cliente começou a usar o sistema depois do
// dia 1º dele (`desde`/`cliente_desde`, quando vier) — a variação não deve aparecer
export function mesVsAnterior(n, { hoje = hojeSP() } = {}) {
  if (!n) return null;
  const anterior = +(n.receita_mes_anterior_parcial ?? n.receita_mes_anterior) || 0;
  const desde = String(n.desde || n.cliente_desde || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(String(hoje || ""));
  const ini = m ? new Date(Date.UTC(+m[1], +m[2] - 2, 1)).toISOString().slice(0, 10) : "";
  const comecouDepois = /^\d{4}-\d{2}-\d{2}$/.test(desde) && !!ini && desde > ini;
  return { atual: +n.receita_mes || 0, anterior,
           anteriorInteiro: +n.receita_mes_anterior || 0, dia: +n.dia_do_mes || null, comparavel: anterior > 0 && !comecouDepois };
}

/* ============================================================
   6. MOEDA EDITORIAL (M38) — "R$" e centavos a 60 %, colados ao valor (classe .num-moeda do app.css)
   O DOM entra por parâmetro (ui.h / ui.limpar): este arquivo continua sem imports e sem DOM global.
   ============================================================ */
/** partesMoeda(28400.5, {centavos:false}) → {neg:"", rs:"R$", inteiro:"28.401", cent:""}; sem número → null. */
export function partesMoeda(valor, { centavos = true } = {}) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const fixo = centavos ? abs.toFixed(2) : String(Math.round(abs));
  const [inteiro, cent] = fixo.split(".");
  const zero = Number(fixo) === 0;
  return { neg: n < 0 && !zero ? "−" : "", rs: "R$", inteiro: Number(inteiro).toLocaleString("pt-BR"), cent: centavos ? `,${cent}` : "" };
}
/** O mesmo valor em texto corrido ("R$ 28.400", "−R$ 1,50"), para tooltips, aria-label e teste. */
export function textoMoeda(valor, opc) {
  const p = partesMoeda(valor, opc);
  return p ? `${p.neg}${p.rs} ${p.inteiro}${p.cent}` : "—";
}
/** preencherMoeda(ui, el, valor, {centavos}) → el com <span class="nm-rs">R$</span>28.400<span class="nm-cent">,00</span> (só nós de texto/elementos: nada de innerHTML). */
export function preencherMoeda(ui, el, valor, opc = {}) {
  const p = partesMoeda(valor, opc);
  ui.limpar(el);
  el.classList.add("num-moeda");
  if (!p) { el.textContent = "—"; return el; }
  el.append(...[p.neg || null, ui.h("span", { class: "nm-rs" }, p.rs), p.inteiro, p.cent ? ui.h("span", { class: "nm-cent" }, p.cent) : null].filter(Boolean));
  return el;
}
/** Igual a G.contar, mas para moeda: o número sobe de 0 até `valor` (--t-dados) já com o formato editorial. Sem movimento (ou animar:false) pinta direto. */
export function contarMoeda(ui, G, el, valor, { centavos = true, animar = true } = {}) {
  const n = Number(valor);
  const pintar = v => preencherMoeda(ui, el, v, { centavos });
  if (animar && G && typeof G.animarValor === "function") {
    G.animarValor(el, n, pintar, textoMoeda(n, { centavos }));
    return el;
  }
  pintar(n);
  const dur = animar && G && typeof G.duracaoToken === "function" ? G.duracaoToken("--t-dados") : 0;
  if (!dur || !Number.isFinite(n) || n === 0 || typeof requestAnimationFrame !== "function") return el;
  const t0 = performance.now();
  const passo = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    preencherMoeda(ui, el, p < 1 ? n * e : n, { centavos });
    if (p < 1 && el.isConnected) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return el;
}

/* ============================================================
   7. INÍCIO EDITORIAL (M31) — a manchete que diz o que importa agora e quais blocos merecem ficar abertos
   Tudo PURO: a tela só desenha o que estas funções devolvem.
   ============================================================ */
const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);

/**
 * O nome do compromisso da agenda na vertical: oficina marca «visita», loja marca «entrega», os demais «consulta»
 * (a mesma palavra das Automações — auto-catalogo.palavraConsulta; o teste trava as duas iguais). Devolve {um, varios}.
 */
export function palavraAgenda(vertical, voc = null) {
  // plano 2000d · DR-259: o vocabulário da EMPRESA vence («sessão», «revisão») — o fixo da vertical só quando ele não diz
  const v = voc && typeof voc === "object" ? voc : null;
  const proprio = v && typeof v.compromisso === "string" && v.compromisso.trim() ? v.compromisso.trim() : "";
  if (proprio) {
    const min = s => s.charAt(0).toLocaleLowerCase("pt-BR") + s.slice(1);
    const pl = typeof v.compromissos === "string" && v.compromissos.trim() ? v.compromissos.trim()
      : proprio.replace(/ão$/i, "õe").replace(/([aeiou])l$/i, "$1i").replace(/([rzs])$/i, "$1e") + "s";
    return { um: min(proprio), varios: min(pl) };
  }
  const um = vertical === "oficina" ? "visita" : vertical === "loja" ? "entrega" : "consulta";
  return { um, varios: `${um}s` };
}

/** Quantas consultas existem hoje na resposta de nx_agenda_dia (null quando não há dado de agenda). */
export function consultasHoje(agenda, hoje) {
  if (!agenda || !Array.isArray(agenda.consultas)) return null;
  const dia = hoje || hojeSP();
  return agenda.consultas.filter(c => c && c.inicio && !/cancelad|desmarcad/i.test(String(c.status || "")) && hojeSP(new Date(c.inicio)) === dia).length;
}

/**
 * manchete(d, {agenda, voc, links}) → {frases, texto, pendencia, urgente, contexto}
 *  - `d` é a resposta de nx_inicio; `agenda` a de nx_agenda_dia (opcional: sem ela a frase não fala de consulta);
 *  - `voc` = {contato, contatos, negocio, negocios, feminino, consulta, consultas} em minúsculas (vocabulário da vertical;
 *    consulta/consultas = o nome do compromisso da agenda: consulta, visita ou entrega — ver palavraAgenda);
 *  - `links` = {conversas, tarefas, agenda, crm} (hash ou null — sem permissão o trecho vira texto);
 *  - cada frase é uma lista de nós: {t:"txt", v} ou {t:"link", href, tom?, partes:[{t:"n"|"moeda"|"narr"|"txt", v}]}.
 *  "n" = número (acento), "moeda" = valor em R$ (acento, formato editorial), "narr" = o verbo de ação (Zodiak itálica).
 *  Exemplo: "2 clientes esperam resposta há 15 min. Hoje tem 1 consulta e R$ 5.200 em orçamentos abertos."
 */
export function manchete(d, { agenda = null, voc = {}, links = {} } = {}) {
  const V = { contato: "cliente", contatos: "clientes", negocio: "negócio", negocios: "negócios", feminino: false, consulta: "consulta", consultas: "consultas", ...voc };
  const c = (d && d.conversas) || {}, t = (d && d.tarefas) || {}, n = (d && d.negocios) || {};
  const ag = Math.max(0, Math.floor(+c.aguardando) || 0);
  const atr = Math.max(0, Math.floor(+t.atrasadas) || 0);
  const espera = Number.isFinite(+c.espera_mais_antiga_min) && c.espera_mais_antiga_min !== null ? +c.espera_mais_antiga_min : null;
  const link = (href, partes, tom) => ({ t: "link", href: href || null, tom, partes });   // sem href (sem permissão) vira trecho sem link, com o mesmo destaque

  // 1) o que pede ação agora
  const urgentes = [];
  if (ag > 0) {
    urgentes.push(link(links.conversas, [{ t: "n", v: String(ag) }, { t: "txt", v: " " },
      { t: "narr", v: plural(ag, `${V.contato} espera resposta`, `${V.contatos} esperam resposta`) },
      ...(espera !== null && espera >= 1 ? [{ t: "txt", v: ` há ${duracaoMin(espera)}` }] : [])]));
  }
  if (atr > 0) {
    urgentes.push(link(links.tarefas, [{ t: "n", v: String(atr) }, { t: "txt", v: " " }, { t: "narr", v: plural(atr, "tarefa atrasada", "tarefas atrasadas") }], "ruim"));
  }
  const frases = [];
  if (urgentes.length) {
    const f = [];
    urgentes.forEach((u, i) => { if (i) f.push({ t: "txt", v: " e " }); f.push(u); });
    f.push({ t: "txt", v: "." });
    frases.push(f);
  }

  // 2) o contexto do dia: consultas e dinheiro em aberto
  const nCons = consultasHoje(agenda, d && d.hoje);
  const abertos = Math.max(0, Math.floor(+n.abertos) || 0), valor = +n.valor_aberto || 0;
  const adj = (m, q) => (V.feminino ? m.replace(/o$/, "a") : m) + (Number(q) === 1 ? "" : "s");
  const ctx = [];
  if (nCons !== null && nCons > 0) {
    ctx.push([{ t: "txt", v: "Hoje tem " }, link(links.agenda, [{ t: "n", v: String(nCons) }, { t: "txt", v: ` ${plural(nCons, V.consulta, V.consultas)}` }])]);
  }
  if (abertos > 0 && valor > 0) {
    ctx.push([link(links.crm, [{ t: "moeda", v: valor }]),
      { t: "txt", v: ` em ${plural(abertos, V.negocio, V.negocios)} ${adj("aberto", abertos)}` }]);
  }
  if (ctx.length) {
    const f = [];
    ctx.forEach((parte, i) => { if (i) f.push({ t: "txt", v: " e " }); f.push(...parte); });
    f.push({ t: "txt", v: "." });
    frases.push(f);
  }

  const pendencia = ag > 0 || atr > 0 || (+t.hoje || 0) > 0 || (+c.sem_dono || 0) > 0;
  // sem nada a dizer (cliente zerado): a manchete é só o "Tudo em dia."
  if (!frases.length) frases.push([{ t: "link", href: null, partes: [{ t: "narr", v: "Tudo em dia." }] }]);
  const achatar = no => (no.t === "txt" ? no.v : no.partes.map(p => (p.t === "moeda" ? textoMoeda(p.v, { centavos: false }) : p.v)).join(""));
  const texto = frases.map(f => f.map(achatar).join("")).join(" ");
  return { frases, texto, pendencia, urgente: urgentes.length > 0, contexto: ctx.length > 0 };
}

/**
 * blocosInicio(d, {canais}) → {abertos: [...ids], recolhidos: [...ids]} na ordem de urgência.
 * Abertos = o que pede ação (atendimento, tarefas, número com problema) + vendas; o resto vai para "Mais detalhes".
 */
export function blocosInicio(d) {
  const c = (d && d.conversas) || {}, t = (d && d.tarefas) || {}, n = (d && d.negocios) || {};
  const canais = (d && d.canais) || [];
  const abertos = [], recolhidos = [];
  const poe = (id, aberto) => (aberto ? abertos : recolhidos).push(id);
  poe("atendimento", (+c.aguardando || 0) > 0 || (+c.sem_dono || 0) > 0);
  poe("tarefas", (+t.atrasadas || 0) > 0 || (+t.hoje || 0) > 0);
  poe("numeros", !canais.length || canais.some(k => estadoCanal(k).nivel !== "bom"));
  poe("vendas", (+n.abertos || 0) > 0 || (+n.ganhos_mes || 0) > 0 || (+n.receita_mes || 0) > 0);
  recolhidos.push("leads");
  // a ordem dos abertos segue a urgência: atendimento → tarefas → número com problema → vendas
  const ordem = ["atendimento", "tarefas", "numeros", "vendas"];
  abertos.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  return { abertos, recolhidos };
}

/** Quais números mudaram entre duas respostas de nx_inicio (para G.destacar no pulso): lista de chaves "grupo.campo". */
export function numerosMudaram(antes, depois) {
  if (!antes || !depois) return [];
  const campos = { conversas: ["aguardando", "sem_dono", "minhas", "abertas"], tarefas: ["hoje", "atrasadas"], leads: ["hoje", "hoje_anuncio", "semana"],
    negocios: ["abertos", "valor_aberto", "previsao_ponderada", "receita_mes", "ganhos_mes"] };
  const mudou = [];
  for (const [g, ks] of Object.entries(campos)) for (const k of ks) {
    const a = antes[g] && antes[g][k], b = depois[g] && depois[g][k];
    if (a !== undefined && a !== null && b !== undefined && b !== null && +a !== +b) mudou.push(`${g}.${k}`);
  }
  return mudou;
}

/* ============================================================
   8. CHECKLIST "DEIXE O ÓRBITA PRONTO" (M32) — nx_onboarding_estado vira progresso, próximos passos e selos do menu
   ============================================================ */
/**
 * Os 11 itens, na ordem recomendada (o servidor devolve a mesma ordem; aqui ficam o texto, a ajuda e a seção que o item abre).
 * `modulo` e `papel` são os filtros da seção nas Configurações (os mesmos dos *-config.js; o teste trava os dois lados):
 * item cuja seção a pessoa não abre não é cobrado. `opcional` aqui é o padrão; quando o servidor manda `opcional`, vale o dele.
 */
export const ONBOARDING_ITENS = Object.freeze([
  { id: "chave_codewords", rotulo: "Chave do WhatsApp salva", secao: "numeros", modulo: "conversas", papel: "admin", assistente: true, ajuda: "A chave do CodeWords (ou o token da Meta) guardada com segurança." },
  { id: "aparelho_pareado", rotulo: "Aparelho pareado", secao: "numeros", modulo: "conversas", papel: "admin", assistente: true, ajuda: "O WhatsApp do celular ligado ao Órbita." },
  { id: "recebimento", rotulo: "Recebimento conferido", secao: "numeros", modulo: "conversas", papel: "admin", assistente: true, ajuda: "Confirmamos que as mensagens chegam por este número." },
  { id: "ia_ou_direto", rotulo: "IA validada ou receber direto", secao: "numeros", modulo: "conversas", papel: "admin", assistente: true, ajuda: "Escolha quem responde primeiro: a IA ou a equipe." },
  { id: "mensagem_teste", rotulo: "Mensagem de teste enviada", secao: "numeros", modulo: "conversas", papel: "admin", assistente: true, ajuda: "Uma mensagem real saindo pelo número." },
  { id: "departamento_horario", rotulo: "Departamento com horário", secao: "departamentos", modulo: "conversas", papel: "admin", ajuda: "Fora do horário o cliente recebe a mensagem automática." },
  { id: "agenda_faixas", rotulo: "Faixas da agenda", secao: "agenda", modulo: "crm", papel: "admin", ajuda: "Os horários em que a agenda aceita consultas." },
  { id: "script_site", rotulo: "Script do site com contato recebido", secao: "rastreio", modulo: "crm", papel: "admin", opcional: true, ajuda: "Opcional: só para quem tem site. Mostra de onde vem cada contato." },
  { id: "colega_convidado", rotulo: "Colega convidado", secao: "usuarios", modulo: null, papel: "admin", ajuda: "Quem atende junto com você." },
  { id: "funil_ajustado", rotulo: "Funil ajustado", secao: "funis", modulo: "crm", papel: "admin", ajuda: "As etapas que a sua equipe realmente usa." },
  { id: "anuncios_ligados", rotulo: "Anúncios ligados", secao: "anuncios", modulo: "ads", papel: "gestor", opcional: true, ajuda: "Opcional: ligue o Meta e o Google para ver o retorno." },
]);

/**
 * filtroSecoesOnboarding({temModulo, pode, configPronta}) → item => a pessoa consegue abrir a seção deste item?
 * É a régua do config.js (seção pronta, módulo do plano e papel mínimo); cada função é opcional (sem ela, aquele filtro não barra).
 */
export function filtroSecoesOnboarding({ temModulo = null, pode = null, configPronta = null } = {}) {
  return item => {
    const b = ONBOARDING_ITENS.find(x => x.id === (item && item.id)) || item || {};
    try {
      if (typeof configPronta === "function" && b.secao && !configPronta(b.secao)) return false;
      if (b.modulo && typeof temModulo === "function" && !temModulo(b.modulo)) return false;
      if (b.papel && typeof pode === "function" && !pode(b.papel)) return false;
    } catch { return false; }
    return true;
  };
}

/**
 * Para onde o "Fazer agora" leva. Passos 1-5 abrem o assistente do número (o do canal que pede ação, quando o servidor diz qual);
 * os demais abrem a seção exata das Configurações.
 */
export function rotaOnboarding(item) {
  const base = ONBOARDING_ITENS.find(x => x.id === (item && item.id));
  if (!base) return "#/config";
  if (base.assistente) return `#/config/numeros?assistente=${encodeURIComponent(item && item.canal_id ? item.canal_id : "novo")}`;
  return `#/config/${base.secao}`;
}

/**
 * resumoOnboarding(estado, {pulados, dispensadoAte, agora, admin, podeSecao}) → null (não mostrar) ou
 *   {itens, total, feitos, obrigatorios, obrigFeitos, pct, completo, proximo, pendentes}
 * - só admin vê; some a 100 % (dos obrigatórios); "Dispensar por 7 dias" esconde até a data; "Já está bom" (pulados) conta como feito neste aparelho;
 * - `itens` mantém a ordem recomendada e traz o rótulo/ajuda/rota local mesmo se o servidor mandar só ids;
 * - `podeSecao` (filtroSecoesOnboarding): item cuja seção a pessoa não abre sai ANTES da conta — não vira link morto nem trava o progresso;
 * - obrigatórios, total e porcentagem saem dos itens recebidos (nenhum número fixo): o que o servidor marca como opcional não conta.
 */
export function resumoOnboarding(estado, { pulados = [], dispensadoAte = 0, agora = Date.now(), admin = true, podeSecao = null } = {}) {
  if (!admin || !estado || !Array.isArray(estado.itens) || !estado.itens.length) return null;
  const jaPulado = new Set(pulados || []);
  const porId = new Map(estado.itens.map(i => [i.id, i]));
  const itens = ONBOARDING_ITENS.filter(b => porId.has(b.id) && (typeof podeSecao !== "function" || podeSecao(b))).map(b => {
    const s = porId.get(b.id);
    const feitoServidor = !!s.feito, pulado = !feitoServidor && jaPulado.has(b.id);
    return { id: b.id, rotulo: b.rotulo, ajuda: b.ajuda, opcional: typeof s.opcional === "boolean" ? s.opcional : !!b.opcional, feito: feitoServidor || pulado, pulado,
      secao: b.secao, rota: rotaOnboarding({ id: b.id, canal_id: s.canal_id }), ultimo_em: s.ultimo_em || null };
  });
  const obrig = itens.filter(i => !i.opcional);
  if (!obrig.length) return null;                 // nada que esta pessoa possa (e precise) fazer: sem cartão
  const obrigFeitos = obrig.filter(i => i.feito).length;
  const completo = obrigFeitos === obrig.length;
  const pendentes = itens.filter(i => !i.feito);
  const resumo = { itens, total: itens.length, feitos: itens.filter(i => i.feito).length, obrigatorios: obrig.length, obrigFeitos,
    pct: obrig.length ? Math.round(obrigFeitos * 100 / obrig.length) : 0, completo, pendentes, proximo: pendentes.find(i => !i.opcional) || pendentes[0] || null };
  if (completo) return null;
  if (Number(dispensadoAte) > agora) return null;
  return resumo;
}

/** Passos pendentes (obrigatórios, não pulados) por seção das Configurações — o ponto "nav-selo" do menu: {numeros: 3, departamentos: 1, …}. */
export function pendenciasConfig(estado, { pulados = [], podeSecao = null } = {}) {
  const r = resumoOnboarding(estado, { pulados, dispensadoAte: 0, admin: true, podeSecao });
  const out = {};
  if (!r) return out;
  for (const i of r.pendentes) if (!i.opcional) out[i.secao] = (out[i.secao] || 0) + 1;
  return out;
}

/** "Dispensar por 7 dias": o instante até quando o cartão fica escondido neste aparelho. */
export function dispensarOnboardingAte(agora = Date.now(), dias = 7) { return agora + dias * 86400000; }

/* ============================================================ 9. M39 — painéis no celular: chip-resumo dos filtros e Radar com gravidade */
/** Gravidade do Radar: a ordem (0 = mais grave), o rótulo escrito (nunca só cor) e o ícone da sprite. A gravidade já vem do alerta; sem RPC nova. */
export const SEV_ORDEM = Object.freeze({ critico: 0, alerta: 1, info: 2 });
export const SEV_ROTULO = Object.freeze({ critico: "Crítico", alerta: "Atenção", info: "Informativo" });
export const SEV_ICONE = Object.freeze({ critico: "alerta", alerta: "sino", info: "info" });
/** Gravidade desconhecida vira "alerta" (o meio-termo): nunca esconde nem exagera. */
export const nivelSev = sev => (Object.prototype.hasOwnProperty.call(SEV_ORDEM, sev) ? sev : "alerta");

/**
 * ordenarRadar(R) → lista única do Radar, da mais grave para a menos: ativos primeiro (por gravidade; conexão caída é sempre crítica),
 * depois os já resolvidos; em empate vale a ordem em que o `montarRadar` entregou (conexões antes, depois o histórico mais recente).
 * Cada item: {tipo: "conexao"|"episodio", sev, ativo, ref} — `ref` é o objeto original de R.conexoes / R.episodios.
 */
export function ordenarRadar(R) {
  const itens = [
    ...((R && R.conexoes) || []).map(ref => ({ tipo: "conexao", sev: "critico", ativo: !!ref.ativo, ref })),
    ...((R && R.episodios) || []).map(ref => ({ tipo: "episodio", sev: nivelSev(ref.sev), ativo: !!ref.ativo, ref })),
  ];
  return itens.map((x, i) => ({ x, i }))
    .sort((a, b) => (Number(b.x.ativo) - Number(a.x.ativo)) || (SEV_ORDEM[a.x.sev] - SEV_ORDEM[b.x.sev]) || (a.i - b.i))
    .map(o => o.x);
}

/** O chip-resumo de Anúncios: "Últimos 30 dias · Tudo" (ou Meta / Google). */
export function textoChipAnuncios(dias, plat) {
  return `${rotuloPeriodo(dias).titulo} · ${plat ? nomePlat(plat) : "Tudo"}`;   // plano 1000 (AD-097): «Este mês» / «Mês passado»
}

/**
 * O chip-resumo de Relatórios: "Últimos 30 dias · Todos os funis" · "01/09 a 30/09 · Funil Consultas" · "Últimos 7 dias · Todos os departamentos".
 * preset: 7 | 30 | 90 | "per" (com de/ate ISO); aba: "vendas" (funil) | "atendimento" (departamento); `nome` é o do funil/departamento escolhido ('' = todos).
 */
export function textoChipRelatorios({ preset = 30, de = null, ate = null, aba = "vendas", nome = "" } = {}) {
  const curto = iso => { const [, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}` : "—"; };
  const per = preset === "per" && de && ate ? `${curto(de)} a ${curto(ate)}` : `Últimos ${[7, 30, 90].includes(Number(preset)) ? Number(preset) : 30} dias`;
  return `${per} · ${nome || (aba === "atendimento" ? "Todos os departamentos" : "Todos os funis")}`;
}

/* ============================================================ 10. PLANO 50 (frente F) — Anúncios e Relatórios: tendência, funil por plataforma,
   calor semanal, sparklines, semáforo do Radar e exportação. Tudo PURO (as telas só desenham). */

/** Série do gráfico de tendência: por dia da janela, investimento (Ads), conversões da plataforma e o que o CRM registrou
    (conversas, agendamentos, fechamentos, receita) — conversas pela data da conversa, as outras pela data do próprio evento. */
export function serieTendencia(M, { dias = 30, plat = "", anterior = false } = {}) {
  // plano 1500c · AC-088: `anterior` = a mesma série na janela de comparação (a curva tracejada do período anterior)
  const j = janela(M, dias), de = anterior ? j.deA : j.de, ate = anterior ? j.ateA : j.ate;
  const sd = M.porDia(plat);
  const conv = new Array(M.DIAS).fill(0);
  for (const Ld of M.LEADS) { if (!Ld.plat || (plat && Ld.plat !== plat)) continue; if (Ld.i >= 0 && Ld.i < conv.length) conv[Ld.i]++; }
  const out = [];
  for (let i = de; i <= ate; i++) {
    if (i < 0) continue;
    out.push({ i, gasto: (sd.meta[i] || 0) + (sd.google[i] || 0) + ((sd.outras && sd.outras[i]) || 0), convAds: sd.conv[i] || 0, conversas: conv[i] || 0, agendadas: sd.ag[i] || 0, fecharam: sd.fe[i] || 0, receita: sd.rec[i] || 0 });
  }
  return out;
}

/** Funil anúncio → conversa → agenda → venda por plataforma: 4 etapas com a taxa entre cada par (null sem base). Só plataformas com movimento. */
export function funilPorPlataforma(M, { dias = 30 } = {}) {
  const { de, ate } = janela(M, dias);
  const taxa = (n, d) => (d > 0 ? Math.round(n / d * 1000) / 10 : null);
  return ["meta", "google", "anuncio"].map(p => {
    const t = M.consolidar(M.linhasDe(de, ate, { plat: p })), c = M.crmTot(de, ate, { plat: p });
    const etapas = [
      { id: "convAds", rotulo: "Conversões do anúncio", v: Number(t.conversoes) || 0 },
      { id: "conversas", rotulo: "Conversas no CRM", v: Number(c.conversas) || 0 },
      { id: "agendadas", rotulo: "Agendaram", v: Number(c.agendadas) || 0 },
      // plano 1500c · AC-097: a etapa «compareceram» (antes pulava de agendou para fechou, sem ver quem faltou)
      { id: "compareceram", rotulo: "Compareceram", v: Number(c.compareceram) || 0 },
      { id: "fecharam", rotulo: "Fecharam", v: Number(c.fecharam) || 0 },
    ];
    const taxas = etapas.slice(1).map((e, k) => ({ de: etapas[k].id, para: e.id, pct: taxa(e.v, etapas[k].v) }));
    return { plat: p, nome: nomePlat(p), gasto: Number(t.gasto) || 0, receita: Number(c.receita) || 0, etapas, taxas, max: Math.max(...etapas.map(e => e.v), 0) };
  }).filter(x => x.gasto > 0 || x.etapas.some(e => e.v > 0));
}

/** Plano 1000 (AD-094): taxa entre etapas do funil por plataforma — seta ↓ só quando cai; acima de 100% (o CRM registrou mais
    conversas do que a plataforma contou) diz isso em vez de «130% ↓». */
export function taxaFunilTxt(pct, pctTxt = v => `${v}%`) {
  if (pct == null || !fin(+pct)) return { txt: "sem base", cai: false, acima: false };
  if (pct > 100) return { txt: `${pctTxt(pct)} · mais que a etapa anterior contou`, cai: false, acima: true };
  if (pct >= 100) return { txt: pctTxt(pct), cai: false, acima: false };
  return { txt: `${pctTxt(pct)} ↓`, cai: true, acima: false };
}

/** Plano 1000 (AD-131/AD-153): por que «conversões da plataforma», «conversas no CRM» e os «criados» de Relatórios › Vendas diferem. */
// plano 1000b · AB-096: cada frase tem um id — Relatórios › Vendas escolhe por id (antes slice(-2), que mudava se a lista mudasse)
export const POR_QUE_DIFERE_ID = Object.freeze({
  plataforma: "A plataforma (Meta/Google) conta a conversão quando a pessoa toca no anúncio e abre a conversa; o CRM só registra quando a primeira mensagem chega ao Órbita.",
  desistiu: "Quem toca no botão e desiste antes de mandar mensagem conta na plataforma e não no CRM.",
  google: "O Google conta conversões pelo que estiver configurado na conta (às vezes frações, como 1,5) — não são conversas no WhatsApp.",
  aparelho: "Aparelho desconectado ou número diferente no anúncio fazem conversas sumirem do CRM.",
  datas: "Anúncios conta cada conversa pela data da primeira mensagem; Relatórios › Vendas conta os negócios pela data em que foram criados — um mesmo contato pode cair em dias diferentes.",
});
export const POR_QUE_DIFERE = Object.freeze(Object.values(POR_QUE_DIFERE_ID));
export const porQueDifere = (...ids) => ids.map(id => POR_QUE_DIFERE_ID[id]).filter(Boolean);

/** Mapa de calor dia da semana × semana (nx_dados não traz a hora da conversa): matriz[dow 0..6][semana], semanas da mais antiga à atual. */
export function calorSemanal(M, { dias = 30, plat = "", campo = "conversas" } = {}) {
  const serie = serieTendencia(M, { dias, plat });
  if (!serie.length) return { matriz: Array.from({ length: 7 }, () => []), semanas: [], max: 0, pico: null, campo };
  const dow = i => M.dataDe(i).getDay();
  // a 1ª coluna começa na segunda-feira da semana do 1º dia; cada coluna é uma semana corrida
  const primeiro = serie[0].i, deslocPrimeiro = (dow(primeiro) + 6) % 7;
  const nSem = Math.ceil((serie.length + deslocPrimeiro) / 7);
  const matriz = Array.from({ length: 7 }, () => new Array(nSem).fill(0));
  const semanas = Array.from({ length: nSem }, (_, k) => { const ini = primeiro - deslocPrimeiro + k * 7; const fim = Math.min(ini + 6, serie[serie.length - 1].i); return { ini, fim, rotulo: ddmmDe(M, Math.max(ini, primeiro)), rotuloFim: ddmmDe(M, fim) }; });
  let max = 0, pico = null;
  for (const d of serie) {
    const k = Math.floor((d.i - primeiro + deslocPrimeiro) / 7), w = dow(d.i), v = Number(d[campo]) || 0;
    matriz[w][k] += v;
    if (matriz[w][k] > max) { max = matriz[w][k]; pico = { dow: w, semana: k, v: matriz[w][k] }; }
  }
  // dia da semana mais forte somando todas as semanas (a frase do cartão)
  const porDow = matriz.map(l => l.reduce((s, x) => s + x, 0)), topo = Math.max(...porDow);
  // plano 1500c · AC-143: empate no topo não elege o domingo (o 1º índice) — melhorDow null e `empate` com os dias empatados
  const empatados = topo > 0 ? porDow.map((v, d) => (v === topo ? d : -1)).filter(d => d >= 0) : [];
  const melhorDow = empatados.length === 1 ? empatados[0] : null;
  return { matriz, semanas, max, pico, campo, porDow, melhorDow, empate: empatados.length > 1 ? empatados : null };
}
const ddmmDe = (M, i) => (typeof M.ddmm === "function" ? M.ddmm(i) : String(i));

/** Pontos de uma sparkline (polilinha) numa caixa w×h: y invertido, 1 ponto vira traço reto; sem números finitos → "". */
export function pontosSparkline(valores = [], w = 96, h = 28, folga = 2) {
  const v = (valores || []).map(x => (x == null || x === "" || !Number.isFinite(+x) ? null : +x));   // null/vazio é buraco, não zero
  const uteis = v.filter(x => x !== null);
  if (!uteis.length) return "";
  const min = Math.min(...uteis), max = Math.max(...uteis), amp = max - min || 1, n = v.length;
  const x = k => (n > 1 ? folga + k / (n - 1) * (w - folga * 2) : w / 2);
  const y = val => h - folga - (val - min) / amp * (h - folga * 2);
  return v.map((val, k) => (val === null ? null : `${Math.round(x(k) * 10) / 10},${Math.round(y(val) * 10) / 10}`)).filter(Boolean).join(" ");
}
/** Valores de uma chave numa lista de dias ({d, criados…}) — a entrada da sparkline dos KPIs; vazio quando a chave não existe. */
export function valoresSerie(lista = [], chave) {
  if (!Array.isArray(lista) || !lista.length || !lista.some(x => x && x[chave] != null)) return [];
  return lista.map(x => Number(x && x[chave]) || 0);
}
/** Melhor dia de uma série ({d, <campo>}): {d, v} ou null quando tudo é zero. */
export function melhorDia(serie = [], campo) {
  let melhor = null;
  for (const x of serie || []) { const v = Number(x && x[campo]) || 0; if (v > 0 && (!melhor || v > melhor.v)) melhor = { d: x.d, v }; }
  return melhor;
}
/** Faixas do dia do mapa de calor (madrugada/manhã/tarde/noite): soma e a faixa mais forte. */
export function faixasCalor(m) {
  const FAIXAS = [["madrugada", 0], ["manhã", 6], ["tarde", 12], ["noite", 18]];
  const soma = FAIXAS.map(([nome, ini]) => ({ nome, ini, fim: ini + 5, total: (m || []).reduce((s, lin) => s + (lin || []).slice(ini, ini + 6).reduce((a, b) => a + (+b || 0), 0), 0) }));
  const total = soma.reduce((s, f) => s + f.total, 0);
  const forte = total ? soma.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  return { faixas: soma.map(f => ({ ...f, pct: total ? Math.round(f.total / total * 100) : 0 })), total, forte };
}

/** Nome do arquivo exportado: orbita-[<cliente>-]<base>-<de>-a-<ate>.<ext>, só letras/números/traço.
    Plano 1000 (AD-103/AD-143): com o nome do cliente (a agência baixa de vários clientes e misturava os arquivos). */
const slugArquivo = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Plano 1500c · AC-077: `sufixo` (a plataforma filtrada: «meta», «google») vai DEPOIS das datas — antes o Anúncios passava «30dias» e
    «tudo» no lugar das datas («…-30dias-a-tudo.csv»). */
export function nomeArquivoExport(base, de, ate, ext = "png", cliente = "", sufixo = "", marca = "") {
  const limpo = slugArquivo, cli = limpo(cliente).slice(0, 40).replace(/-$/, ""), suf = limpo(sufixo);
  // plano 2000d · DA-336: com a agência configurada, o arquivo começa pelo nome dela (o cliente da agência não recebe «orbita-…»)
  const pre = limpo(marca).slice(0, 30).replace(/-$/, "") || "orbita";
  // plano 2000d · DA-218: período de um dia só tem UMA data (antes «…-2026-10-24-a-2026-10-24»)
  const umDia = de && ate && limpo(de) === limpo(ate);
  return `${pre}-${cli ? `${cli}-` : ""}${limpo(base) || "grafico"}${de ? `-${limpo(de)}` : ""}${ate && !umDia ? `-a-${limpo(ate)}` : ""}${suf ? `-${suf}` : ""}.${limpo(ext) || "png"}`;
}
/** Plano 1000 (AD-120): as linhas do cabeçalho do PNG exportado (o SVG sozinho saía sem título, período nem cliente).
    Plano 2000d · DA-139: com `agencia`, a agência assina a imagem («… · por Agência Alfa»). */
export function cabecalhoPng({ titulo = "", periodo = "", cliente = "", agencia = "" } = {}) {
  const ag = String(agencia || "").trim().slice(0, 60);
  return [String(titulo || "").trim(), [cliente, periodo, ag ? `por ${ag}` : ""].map(x => String(x || "").trim()).filter(Boolean).join(" · ")].filter(Boolean);
}
/** Plano 1000 (AD-147): série diária agrupada por semana (segunda a domingo) — acima de 60 dias os rótulos diários ficavam ilegíveis.
    Soma os `campos`; `d` = o 1º dia da semana na janela, `ate` = o último. */
export const DIAS_AGRUPAR_SEMANA = 60;
export function agruparSemana(serie = [], campos = []) {
  const out = [];
  for (const x of Array.isArray(serie) ? serie : []) {
    if (!x || !/^\d{4}-\d{2}-\d{2}/.test(String(x.d || ""))) continue;
    const [a, m, d] = String(x.d).slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay(), seg = somarDias(String(x.d).slice(0, 10), -((dow + 6) % 7));
    let g = out[out.length - 1];
    if (!g || g.semana !== seg) { g = { semana: seg, d: String(x.d).slice(0, 10), ate: String(x.d).slice(0, 10), dias: 0 }; for (const c of campos) g[c] = 0; out.push(g); }
    g.ate = String(x.d).slice(0, 10); g.dias++;
    for (const c of campos) g[c] += +x[c] || 0;
  }
  return out;
}
/** Plano 1000 (AD-257): lista para rosca — além dos `max - 1` maiores, o resto vira uma fatia «Outros» (com 10+ motivos as fatias sumiam). */
export function agruparOutros(lista = [], { max = 6, valor = x => +x.qtd || 0, nome = "Outros", juntar = null } = {}) {
  const ord = (Array.isArray(lista) ? lista : []).slice().sort((a, b) => valor(b) - valor(a));
  if (ord.length <= max) return ord;
  const fica = ord.slice(0, max - 1), resto = ord.slice(max - 1);
  const outros = juntar ? juntar(resto) : { nome: `${nome} (${resto.length})`, qtd: resto.reduce((s, x) => s + valor(x), 0), outros: resto.length };
  return [...fica, outros];
}
/** Propriedades de estilo que o PNG precisa carregar dentro do SVG (cores vêm de classes do tema). */
export const ESTILOS_SVG_EXPORT = Object.freeze(["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight", "text-anchor", "visibility"]);

/** Explicação em linguagem simples de cada regra do radar: o que é, por que importa e o que fazer. */
/** Plano 1500c · AC-145: com `ativa: false` a explicação diz que a regra está desligada (o radar não avisa) — antes o texto genérico
    falava como se ela estivesse valendo. */
export function explicarRegra(id, { ativa = true } = {}) {
  const ex = explicarRegraBase(id);
  return ativa === false ? { ...ex, oQue: `${ex.oQue} (desligada: o radar não avisa disso agora)`, desligada: true } : ex;
}
function explicarRegraBase(id) {
  const E = {
    r1: { oQue: "Cada conversa vinda desta campanha está custando mais do que a meta.", porque: "O dinheiro rende menos: mais investimento para o mesmo número de pessoas.", acao: "Revise o público e o anúncio; se não melhorar em alguns dias, pause e redistribua a verba." },
    r2: { oQue: "A campanha gastou e ninguém chamou.", porque: "Pode ser anúncio sem botão de WhatsApp, público errado ou link quebrado.", acao: "Abra o anúncio como cliente e teste o caminho até a conversa." },
    r3: { oQue: "Poucas pessoas clicam neste criativo em relação a quantas o veem.", porque: "A imagem ou o texto não chamam a atenção — e anúncio pouco tocado costuma sair mais caro.",   /* plano 1000b · AB-221: sem afirmar como fato o preço do Meta */ acao: "Troque a imagem ou a primeira frase e compare com o criativo que vai melhor." },
    r4: { oQue: "As mesmas pessoas já viram este criativo muitas vezes.", porque: "Anúncio repetido cansa e passa a ser ignorado — e o custo sobe.", acao: "Publique uma variação nova e deixe esta descansar." },
    r5: { oQue: "Os anúncios pararam de gastar de um dia para o outro.", porque: "Quase sempre é cartão recusado, saldo zerado ou anúncio reprovado — e cada dia parado é cliente que não chega.", acao: "Abra o Gerenciador de anúncios e confira pagamento, saldo e anúncios reprovados." },
    r6: { oQue: "O Meta conta conversas que não estão chegando ao CRM.", porque: "Aparelho desconectado ou número trocado no anúncio fazem a conversa sumir do Órbita.", acao: "Confira se o número do anúncio é o conectado ao Órbita e se o aparelho está online." },
    ritmo: { oQue: "No ritmo atual o mês fecha fora do orçamento combinado.", porque: "Gastar além do planejado no começo deixa o fim do mês sem verba.", acao: "Ajuste o orçamento diário das campanhas para voltar ao ritmo." },
    google_sem_conversao: { oQue: "O Google gasta, mas a conta não conta conversões.", porque: "Sem conversão registrada não dá para saber o custo por contato nem avisar campanha ruim.", acao: "Peça a quem cuida do Google Ads para ligar o acompanhamento de conversões (clique no WhatsApp)." },
    integracao: { oQue: "O Órbita parou de conseguir ler os números desta plataforma.", porque: "Sem leitura, os relatórios e o radar ficam cegos a partir daquela hora.", acao: "Refaça a conexão em Ajustes de anúncios." },
  };
  return E[id] || { oQue: "O radar encontrou algo fora do combinado.", porque: "Vale olhar antes que vire custo.", acao: "Abra a campanha e confira os números." };
}

/**
 * Semáforo do Radar: vermelho (crítico ativo), amarelo (atenção ativa), verde (nada ativo, COM números para vigiar) e neutro
 * (nada ativo e ainda sem número de anúncio: não há o que avaliar, então não acende verde); com contagens por gravidade e a frase para leigo.
 * semaforoRadar(R, {semDados}) — `semDados` = L.semAnuncios(M).
 */
// plano 2000d · DA-225: `atrasado` (leitura atrasada ou caída) não acende verde — «tudo certo» só vale com números de agora
export function semaforoRadar(R, { semDados = false, atrasado = false } = {}) {
  const ativos = ordenarRadar(R).filter(x => x.ativo);
  const cont = { critico: 0, alerta: 0, info: 0 };
  for (const x of ativos) cont[nivelSev(x.sev)]++;
  const nivel = cont.critico ? "vermelho" : cont.alerta ? "amarelo" : semDados ? "neutro" : atrasado ? "cinza" : "verde";
  const n = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;
  const partes = [];
  if (cont.critico) partes.push(n(cont.critico, "problema crítico", "problemas críticos"));
  if (cont.alerta) partes.push(n(cont.alerta, "ponto de atenção", "pontos de atenção"));
  if (cont.info) partes.push(n(cont.info, "aviso informativo", "avisos informativos"));
  const frase = nivel === "neutro" ? "Ainda sem números de anúncio para avaliar."
    : nivel === "cinza" ? "Sem leitura recente dos anúncios: nada fora do combinado nos últimos números, mas eles não são de agora."   // DA-225
    // plano 1000b · AB-173: o verde cita os informativos ativos listados logo abaixo
    : nivel === "verde" ? `Tudo dentro do combinado: nenhuma campanha precisa de ajuste agora${cont.info ? ` (${n(cont.info, "aviso informativo abaixo", "avisos informativos abaixo")})` : ""}.`
    : nivel === "vermelho" ? `Precisa de ação hoje: ${partes.join(" e ")}.` : `Vale olhar esta semana: ${partes.join(" e ")}.`;
  const primeiro = ativos[0] || null;
  const acao = nivel === "neutro" ? "O radar começa a vigiar assim que as contas de anúncio estiverem conectadas e a primeira leitura chegar."
    : nivel === "cinza" ? explicarRegra("integracao").acao   // plano 2000d · DA-225
    : !primeiro ? "Continue acompanhando; o radar avisa no WhatsApp quando algo mudar."
    : primeiro.tipo === "conexao" ? explicarRegra("integracao").acao : explicarRegra(primeiro.ref.regra).acao;
  return { nivel, cor: nivel === "vermelho" ? "ruim" : nivel === "amarelo" ? "aten" : nivel === "neutro" || nivel === "cinza" ? "neutro" : "ok", contagens: cont, ativos: ativos.length, frase, acao,
    primeiro: primeiro ? { tipo: primeiro.tipo, nome: primeiro.ref.nome, regra: primeiro.tipo === "conexao" ? "integracao" : primeiro.ref.regra } : null };
}

/** Filtro da lista do Radar: "todos" | "ativos" | "resolvidos". */
export function filtrarRadar(itens = [], filtro = "todos") {
  return filtro === "ativos" ? itens.filter(x => x.ativo) : filtro === "resolvidos" ? itens.filter(x => !x.ativo) : itens.slice();
}

/* ============================================================ 11. PLANO 100 (frente F) — origem igual nas duas telas, calor por hora,
   teste de conexão. Tudo PURO. */

/** F2/F12: a MESMA régua de «veio de anúncio» do núcleo (datasetDeLinhas): origem «anuncio» OU plataforma conhecida — exceto o
    orgânico, que o rastreio classifica com plataforma (link da bio do Instagram) e não é anúncio. */
export const ehOrigemAnuncio = (origem, plataforma) => origem === "anuncio" || (!!plataforma && origem !== "organico");

/** Relatórios → Vendas «por origem» (nx_rel_vendas.por_origem) com o critério do Ads: linhas de anúncio da mesma plataforma
    juntam (WhatsApp + Meta vira «Anúncio · Meta»), as outras ficam como vieram; conversão = ganhos ÷ (ganhos + perdidos).
    Guarda campanha_nome/campanhas quando o servidor mandar (detecção: o RPC atual não manda). */
export function origensVendas(lista = []) {
  const grupos = new Map();
  for (const o of Array.isArray(lista) ? lista : []) {
    if (!o || typeof o !== "object") continue;
    const anuncio = ehOrigemAnuncio(o.origem, o.plataforma);
    // plano 1000b · AB-174: linha sem origem é «Sem origem» (antes virava «Cadastro manual», que é outra coisa)
    const origem = anuncio ? "anuncio" : (String(o.origem ?? "").trim() || "sem_origem"), plataforma = anuncio || o.origem === "organico" ? (o.plataforma || null) : null;
    const chave = `${origem}|${plataforma || ""}`;
    const g = grupos.get(chave) || { origem, plataforma, rotulo: nomeOrigem(origem, plataforma), anuncio, criados: 0, ganhos: 0, perdidos: 0, receita: 0, campanhas: [] };
    g.criados += +o.criados || 0; g.ganhos += +o.ganhos || 0; g.perdidos += +o.perdidos || 0; g.receita += +o.receita || 0;
    const camps = [o.campanha_nome, ...(Array.isArray(o.campanhas) ? o.campanhas.map(c => (c && typeof c === "object" ? c.nome || c.campanha_nome : c)) : [])];
    for (const c of camps) if (c && typeof c === "string" && !g.campanhas.includes(c)) g.campanhas.push(c);
    grupos.set(chave, g);
  }
  return [...grupos.values()].map(g => ({ ...g, conversao_pct: g.ganhos + g.perdidos > 0 ? Math.round(g.ganhos / (g.ganhos + g.perdidos) * 1000) / 10 : null }))
    .sort((a, b) => b.criados - a.criados || b.ganhos - a.ganhos);
}
/** Totais de anúncio × resto da lista de origensVendas (a frase «de anúncio: X criados, Y ganhos»). */
export function totalAnuncioVendas(origens = []) {
  return origens.reduce((t, o) => (o.anuncio ? { criados: t.criados + o.criados, ganhos: t.ganhos + o.ganhos, receita: t.receita + o.receita } : t), { criados: 0, ganhos: 0, receita: 0 });
}

/**
 * F3: calor dia da semana × HORA das conversas de anúncio (nx_dados.leads[].hora_conversa, contrato 5) na janela do período.
 * → {matriz[7][24], total, semHora, disponivel}. `disponivel` = o servidor manda o campo (RPC nova); sem ele a tela volta ao calor por semana.
 */
/** Plano 2000d · DA-222: o lead traz só a data, ou a hora exata 00:00:00 (importação/planilha) — a hora dele é desconhecida. */
export function semHoraReal(b = {}) {
  const s = String((b && (b.criado_em_conversa || b.data_conversa || b.criado_em)) || "");
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  return /[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?|-03(?::?00)?)?$/.test(s);
}
export function calorHora(M, { dias = 30, plat = "" } = {}) {
  const matriz = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const { de, ate } = janela(M, dias);
  let total = 0, semHora = 0, disponivel = false;
  for (const Ld of (M && M.LEADS) || []) {
    const b = Ld.bruto || {};
    if (Object.prototype.hasOwnProperty.call(b, "hora_conversa")) disponivel = true;
    if (!Ld.plat || (plat && Ld.plat !== plat) || Ld.i < de || Ld.i > ate) continue;
    const hh = b.hora_conversa;
    if (hh === null || hh === undefined || hh === "" || !Number.isInteger(+hh) || +hh < 0 || +hh > 23) { semHora++; continue; }
    // plano 2000d · DA-222: meia-noite EXATA (00:00:00) é lead importado sem hora — conta como «sem hora», não vira pico falso às 0h
    if (+hh === 0 && semHoraReal(b)) { semHora++; continue; }
    matriz[M.dataDe(Ld.i).getDay()][+hh]++;
    total++;
  }
  return { matriz, total, semHora, disponivel };
}

/**
 * F14: o cartão «Aparelho de WhatsApp» do Radar — só informativo (conversa de anúncio não chega com o aparelho caído).
 * `caidos` = ctx.canais.caidos() ([{id, nome, desde}]); null quando o shell não sabe (cartão some).
 * → {nivel: "ok"|"ruim", titulo, linhas:[texto]} ou null.
 */
export function aparelhoRadar(caidos, agora = Date.now()) {
  if (!Array.isArray(caidos)) return null;
  if (!caidos.length) return { nivel: "ok", titulo: "Números de WhatsApp conectados", linhas: ["Nenhum número desconectado agora: as conversas dos anúncios estão chegando."] };
  const linhas = caidos.map(k => {
    const t = k && k.desde ? Date.parse(k.desde) : NaN;
    return `${(k && k.nome) || "Número"} — desconectado ${Number.isFinite(t) ? minutosAtras(t, agora) : "agora"}`;
  });
  return { nivel: "ruim", titulo: caidos.length === 1 ? "Um número de WhatsApp está desconectado" : `${caidos.length} números de WhatsApp desconectados`,
    linhas: [...linhas, "Enquanto o aparelho estiver fora, quem clica no anúncio não aparece nas Conversas nem no CRM."] };
}

/**
 * F6: resposta do «Testar conexão» (nx-ciclo {cliente, dias:1} pelo painel) → [{canal, ok, parcial, status, curto, acao, passageiro, linhas}].
 * Aceita o formato real (`cliente.integracoes[]` com `explicacao`) e o do servidor falso (`clientes[0].sync` + `falhas[]`).
 */
export function resultadoTesteConexao(resp) {
  const r = resp && typeof resp === "object" ? resp : {};
  const cli = r.cliente && typeof r.cliente === "object" ? r.cliente : Array.isArray(r.clientes) ? r.clientes[0] || {} : {};
  const linhasDe = st => { const m = /(\d+)\s+linhas?/.exec(String(st || "")); return m ? +m[1] : null; };
  const um = (canal, ok, status, ex = {}) => ({ canal, ok: !!ok, parcial: /^parcial/i.test(String(status || "")), status: String(status || ""),
    curto: ex.curto || null, acao: ex.acao || null, passageiro: !!ex.passageiro, linhas: linhasDe(status) });
  if (Array.isArray(cli.integracoes)) return cli.integracoes.filter(Boolean).map(i => um(i.canal, i.ok, i.status, i.explicacao || {}));
  // revisão: o teste lê a EMPRESA inteira — com outra leitura em andamento (o ciclo da hora ou o «Testar» da outra plataforma) o
  // servidor responde {cliente:{pulado:"já em execução"}}; falha geral vem {ok:false, erro}. Sem isso a tela mandava «salvar as credenciais».
  if (cli.pulado) return Object.assign([], { motivo: "ocupado" });
  if ((r.ok === false && r.erro) || cli.erro) return Object.assign([], { motivo: "erro" });
  const falhas = Array.isArray(cli.falhas) ? cli.falhas : [];
  return Object.entries(cli.sync || {}).map(([canal, status]) => {
    const fx = falhas.find(x => x && x.canal === canal);
    return um(canal, !fx && !/^erro/i.test(String(status)), status, fx || {});
  });
}
