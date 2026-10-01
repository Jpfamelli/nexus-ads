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
/** Janela do período ativo: os `dias` que terminam ONTEM (M.R) e o mesmo tamanho logo antes. */
export function janela(M, dias = 30) { const de = M.R - dias + 1; return { de, ate: M.R, deA: de - dias, ateA: de - 1 }; }
export const semAnuncios = M => !M || !M.LINHAS.length;

/** Os números do período — cópia fiel do numerosPeriodo() do painel.
    retorno = receita ÷ (anúncios + gestão); com uma plataforma só, ÷ anúncios. */
export function numerosPeriodo(M, { dias = 30, plat = "" } = {}) {
  const { de, ate, deA, ateA } = janela(M, dias), f = { plat };
  const t = M.consolidar(M.linhasDe(de, ate, f)), ta = M.consolidar(M.linhasDe(deA, ateA, f));
  const c = M.crmTot(de, ate, f), ca = M.crmTot(deA, ateA, f);
  const roas = t.gasto ? c.receita / t.gasto : null;
  const fee = plat ? 0 : (M.CFG.fee || 0) * dias / 30;
  const custoTotal = t.gasto + fee;
  const retorno = plat ? roas : (custoTotal ? c.receita / custoTotal : null);
  return { de, ate, deA, ateA, f, t, ta, c, ca, roas, fee, custoTotal, retorno, dias, plat };
}

/** Campanhas com investimento no período (cópia do linhasCamp do painel) + totais do rodapé. */
export function linhasCampanhas(M, { dias = 30, plat = "" } = {}) {
  const { de, ate } = janela(M, dias);
  const linhas = Object.values(M.CAMP).filter(c => c.plat && (!plat || c.plat === plat)).map(c => {
    const t = M.consolidar(M.linhasDe(de, ate, { camp: c.id }));
    if (!t.gasto) return null;
    const k = M.crmTot(de, ate, { camp: c.id });
    return {
      c, t, k,
      cpp: k.fecharam ? t.gasto / k.fecharam : null,
      cpag: k.agendadas ? t.gasto / k.agendadas : null,
      roas: t.gasto ? k.receita / t.gasto : null,
    };
  }).filter(Boolean);
  const T = M.consolidar(linhas.flatMap(r => M.linhasDe(de, ate, { camp: r.c.id })));
  const K = linhas.reduce((a, r) => ({ ag: a.ag + r.k.agendadas, fe: a.fe + r.k.fecharam, rec: a.rec + r.k.receita }), { ag: 0, fe: 0, rec: 0 });
  // o que o CRM atribuiu a anúncios mas NÃO está em nenhuma linha acima (campanha pausada/sem investimento na janela, ou sem campanha identificada):
  // entra no herói da Visão geral (crmTot da plataforma inteira) e fica fora do «Total» — esta sobra explica a diferença
  const todos = M.crmTot(de, ate, { plat });
  const outras = { ag: Math.max(0, (todos.agendadas || 0) - K.ag), fe: Math.max(0, (todos.fecharam || 0) - K.fe), rec: Math.max(0, (todos.receita || 0) - K.rec) };
  return { linhas, total: { t: T, ag: K.ag, fe: K.fe, rec: K.rec, roas: T.gasto ? K.rec / T.gasto : null }, outras };
}
export const VAL_CAMP = {
  nome: r => r.c.nome, plat: r => r.c.plat, gasto: r => r.t.gasto, conv: r => r.t.conversoes, cpa: r => r.t.cpa, ctr: r => r.t.ctr,
  ag: r => r.k.agendadas, fe: r => r.k.fecharam, rec: r => r.k.receita, roas: r => r.roas,
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
export const nivelCpa = (cpa, meta) => !fin(cpa) ? "ruim" : cpa <= meta ? "bom" : cpa <= meta * 1.35 ? "aten" : "ruim";

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
export const RANK_CRI = [["receita", "Mais receita"], ["fechados", "Mais fechados"], ["cpa", "Menor custo por conversa"]];
export const MIN_CONV_CPA = 3;   // custo por conversa só entra no ranking com pelo menos 3 conversas (senão R$ 4 de teste "ganha")
/** Ranking de criativos do período (P1): investimento do Ads + resultado do CRM por criativo.
    por = 'receita' | 'fechados' | 'cpa'. Criativo sem investimento no período fica de fora. */
export function rankingCriativos(M, { dias = 30, plat = "", por = "receita", n = 8 } = {}) {
  const { de, ate } = janela(M, dias);
  const crm = crmPorCriativo(M, de, ate, { plat });
  const ZERO = { conversas: 0, agendadas: 0, compareceram: 0, faltaram: 0, fecharam: 0, receita: 0 };
  const todos = Object.values(M.CRI).filter(k => k.plat && !/:outros$/.test(k.id) && (!plat || k.plat === plat)).map(k => {
    const t = M.consolidar(M.linhasDe(de, ate, { cri: k.id }));
    const c = crm.get(k.id) || ZERO;
    return { k, camp: M.CAMP[k.camp] || null, t, c, roas: t.gasto ? c.receita / t.gasto : null };
  }).filter(x => x.t.gasto > 0);
  const cpa = x => (fin(x.t.cpa) ? x.t.cpa : Infinity);
  const ORD = {
    receita: (a, b) => b.c.receita - a.c.receita || b.c.fecharam - a.c.fecharam || cpa(a) - cpa(b),
    fechados: (a, b) => b.c.fecharam - a.c.fecharam || b.c.receita - a.c.receita || cpa(a) - cpa(b),
    cpa: (a, b) => cpa(a) - cpa(b) || b.t.conversoes - a.t.conversoes,
  };
  const chave = ORD[por] ? por : "receita";
  // receita/fechados: só quem trouxe resultado (zero não é ranking); custo por conversa: com volume mínimo
  const base = chave === "cpa" ? todos.filter(x => x.t.conversoes >= MIN_CONV_CPA)
    : chave === "fechados" ? todos.filter(x => x.c.fecharam > 0) : todos.filter(x => x.c.receita > 0);
  const lista = base.slice().sort(ORD[chave]).slice(0, n);
  const valor = x => (chave === "receita" ? x.c.receita : chave === "fechados" ? x.c.fecharam : x.t.cpa);
  const topo = lista.length ? Math.max(...lista.map(valor).filter(fin)) : 0;
  // barra: receita/fechados proporcionais ao 1º; custo por conversa: o MENOR enche a barra
  const barra = x => { const v = valor(x); if (!fin(v) || !(topo > 0)) return 0; return chave === "cpa" ? Math.min(1, lista[0].t.cpa / v) : v / topo; };
  return { por: chave, de, ate, total: todos.length, lista: lista.map((x, i) => ({ ...x, pos: i + 1, barra: barra(x) })) };
}

/** Série diária do gráfico gasto × conversas (média de 7 dias), igual ao serieDia do painel. */
export function serieDiaria(M, { dias = 30, plat = "" } = {}) {
  const { de, ate, deA, ateA } = janela(M, dias);
  const sd = M.porDia(plat);
  const um = i => (i < 0 ? null : { i, meta: sd.meta[i], google: sd.google[i], gasto: sd.meta[i] + sd.google[i], conv: sd.conv[i], convMedia: M.media7(sd.conv, i) });
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
export function statusEnvio(x) {
  if (!x) return null;
  const erro = String(x.erro || x.erro_envio || "");
  const naoChegou = /não entregou/i.test(erro);
  if (x.entregue_em) return { k: "entregue", tique: "✓✓", rotulo: `entregue às ${horaSP(x.entregue_em)}`, hora: horaSP(x.entregue_em) };
  if (x.enviado_em && !naoChegou) return { k: "enviado", tique: "✓", rotulo: `enviado às ${horaSP(x.enviado_em)} · entrega ainda não confirmada`, hora: horaSP(x.enviado_em) };
  if (erro) return { k: "erro", tique: "!", rotulo: naoChegou ? "não entregue" : "não enviado", hora: x.enviado_em ? horaSP(x.enviado_em) : null, erro: erro.slice(0, 160) };
  return { k: "pendente", tique: "◷", rotulo: "gerado, ainda não enviado", hora: null };
}

/* ---------- conexão com Meta/Google (regra "integracao", que só o servidor conhece) ---------- */
export function canalDe(a) {
  const s = `${(a && a.chave) || ""} ${(a && a.mensagem) || ""}`.toLowerCase();
  return /\|meta\b|\bmeta\b/.test(s) ? "meta" : /\|google\b|\bgoogle\b/.test(s) ? "google" : null;
}
export const nomePlat = p => (p === "meta" ? "Meta" : p === "google" ? "Google" : "Sem anúncio");
export function nomeRegraSrv(a, regras = []) {
  if (a.regra === "integracao") { const c = canalDe(a); return c ? `Conexão com ${nomePlat(c)}` : "Conexão com os anúncios"; }
  const r = regras.find(x => x.id === a.regra);
  return r ? r.nome : a.regra === "ritmo" ? "Ritmo do orçamento" : "Aviso do radar";
}
/** Estado das leituras (cópia do painel): erro · atrasado (> 2 h) · aguardando (nunca leu) · ok · nenhuma. */
export function estadoIntegracao(integs = [], alertas = [], agora = Date.now()) {
  const H = 36e5, ORD_E = { erro: 3, atrasado: 2, aguardando: 1, ok: 0 };
  const canais = (integs || []).filter(i => i && i.ativo).map(i => {
    const sync = i.ultimo_sync ? Date.parse(i.ultimo_sync) : NaN;
    const al = (alertas || []).filter(a => a && a.regra === "integracao" && canalDe(a) === i.canal && agora - Date.parse(a.criado_em) <= 24 * H)
      .sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0] || null;
    const statusErro = /^erro/i.test(i.status || "");
    const alAtivo = !!al && (statusErro || !(Number.isFinite(sync) && sync > Date.parse(al.criado_em)));
    const estado = statusErro || alAtivo ? "erro" : !Number.isFinite(sync) ? "aguardando" : agora - sync > 2 * H ? "atrasado" : "ok";
    return { canal: i.canal, estado, sync: Number.isFinite(sync) ? sync : null, status: i.status || "", alerta: alAtivo ? al : null };
  });
  const nivel = canais.reduce((n, c) => (ORD_E[c.estado] > ORD_E[n] ? c.estado : n), canais.length ? "ok" : "nenhuma");
  const syncs = canais.map(c => c.sync).filter(Boolean);
  return { nivel, canais, erros: canais.filter(c => c.estado === "erro"), ultimo: syncs.length ? Math.max(...syncs) : null };
}
/** Texto da pílula de conexão. */
export function textoPilula(e, agora = Date.now()) {
  if (e.nivel === "erro") { const n = e.erros.map(x => nomePlat(x.canal)); return `${n.join(" e ")} ${n.length > 1 ? "desconectados" : "desconectado"}`; }
  if (e.nivel === "atrasado") return "Leitura atrasada";
  if (e.nivel === "aguardando") return "Aguardando a 1ª leitura";
  if (e.nivel === "ok") return `Atualizado ${minutosAtras(e.ultimo, agora)}`;
  return "";
}
export const textoQueda = erros => erros.map(x => `${nomePlat(x.canal)} desconectado · dados até ${x.sync ? `${ddmmSP(x.sync)} ${horaSP(x.sync)}` : "aguardando primeira leitura"}.`).join(" ");

/* ---------- radar: episódios (núcleo) + registro do servidor ---------- */
export const SEV_NOME = { critico: "crítico", alerta: "alerta", info: "informativo" };
/** Último alerta do servidor por chave. */
export function alertasPorChave(alertas = []) {
  const m = new Map();
  for (const a of alertas || []) { const e = m.get(a.chave); if (!e || String(a.criado_em) > String(e.criado_em)) m.set(a.chave, a); }
  return m;
}
/** Tudo que a aba Radar mostra, já decidido: conexões no topo, episódios dos últimos 14 dias, registro de avisos. */
export function montarRadar(M, dados = {}, agora = Date.now()) {
  const vazio = semAnuncios(M);
  const atuais = vazio ? [] : M.avaliar(M.R, true);
  const hist = vazio ? [] : M.historico();
  const srv = alertasPorChave(dados.alertas);
  const est = estadoIntegracao(dados.integracoes || [], dados.alertas || [], agora);
  const conexoes = [...srv.values()].filter(a => a.regra === "integracao")
    .sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))
    .map(a => { const c = canalDe(a); return { a, canal: c, nome: nomeRegraSrv(a), ativo: est.erros.some(x => x.canal === c), envio: a.enviado_em || a.entregue_em ? statusEnvio(a) : null }; });
  const episodios = hist.slice(0, 12).map(e => {
    const ativo = e.ate === M.R, a = e.a, s = srv.get(a.chave);
    const desde = ativo ? (e.desde === M.R ? "desde ontem · continua" : `desde ${M.dMes(e.desde)} · continua`)
      : e.desde === e.ate ? `em ${M.dMes(e.desde)}` : `de ${M.dMes(e.desde)} a ${M.dMes(e.ate)}`;
    return { chave: a.chave, regra: a.regra.id, nome: a.regra.nome, sev: a.sev, msg: a.msg, acao: a.acao, ativo, desde,
             envio: s && (s.enviado_em || s.entregue_em) ? statusEnvio(s) : null };
  });
  const SEV_OK = new Set(["critico", "alerta", "info"]);
  const registro = (dados.alertas || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 10)
    .map(a => ({ a, sev: SEV_OK.has(a.severidade) ? a.severidade : "alerta", nome: nomeRegraSrv(a, M ? M.REGRAS : []), quando: quandoSP(a.criado_em, new Date(agora)), envio: statusEnvio(a) }));
  return { atuais, ativos: atuais.length + est.erros.length, conexoes, episodios, registro, estado: est };
}

/* ---------- relatórios enviados ---------- */
export function listaRelatorios(relatorios = [], n = 12) {
  const validos = Array.isArray(relatorios) ? relatorios.filter(r => {
    if (!r || typeof r !== "object" || !["diario", "mensal"].includes(r.tipo)) return false;
    const ref = typeof r.referencia === "string" ? r.referencia.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || !Number.isFinite(Date.parse(`${ref}T12:00:00Z`)) || new Date(`${ref}T12:00:00Z`).toISOString().slice(0, 10) !== ref) return false;
    const mes = Number(ref.slice(5, 7));
    return mes >= 1 && mes <= 12;
  }) : [];
  return validos.slice()
    .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)) || Number(b.tipo === "mensal") - Number(a.tipo === "mensal"))
    .slice(0, n)
    .map(r => {
      const ref = String(r.referencia).slice(0, 10);
      const titulo = r.tipo === "mensal" ? `Resumo de ${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : `Diário de ${dataIsoBR(ref)}`;
      return { chave: `${r.tipo}|${ref}`, tipo: r.tipo, ref, titulo, ia: !!r.leitura_ia, envio: statusEnvio(r), r };
    });
}

/** *negrito*, _itálico_ e quebras do WhatsApp → tokens (o front monta com textContent, nunca innerHTML). */
export function tokensWa(txt) {
  const out = [];
  const linhas = String(txt ?? "").split("\n");
  linhas.forEach((ln, n) => {
    if (n) out.push({ t: "br" });
    const re = /\*([^*\n]+)\*|(^|[\s(])_([^_\n]+)_/g;
    let pos = 0, m;
    while ((m = re.exec(ln))) {
      if (m[1] != null) {
        if (m.index > pos) out.push({ t: "txt", v: ln.slice(pos, m.index) });
        out.push({ t: "b", v: m[1] });
      } else {
        const ini = m.index + m[2].length;
        if (ini > pos) out.push({ t: "txt", v: ln.slice(pos, ini) });
        out.push({ t: "i", v: m[3] });
      }
      pos = re.lastIndex;
    }
    if (pos < ln.length) out.push({ t: "txt", v: ln.slice(pos) });
  });
  return out;
}

/* ============================================================
   4. RELATÓRIOS (T13) — períodos, formatos e blocos prontos
   ============================================================ */
export const MAX_DIAS = 366;                         // p_ate − p_de ≤ 366 (periodo_grande no servidor)
export const PRESETS = [7, 30, 90];
/** Período dos últimos `dias` terminando HOJE (SP): 30 dias = hoje e os 29 anteriores. */
export function periodoPreset(dias, hoje = hojeSP()) { return { de: somarDias(hoje, -(dias - 1)), ate: hoje }; }
/** Confere um período personalizado antes de chamar o servidor. */
export function validarPeriodo(de, ate) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(de || "")) || !re.test(String(ate || ""))) return { ok: false, erro: "dados_invalidos", texto: "Escolha as duas datas." };
  const n = difDias(de, ate);
  if (n < 0) return { ok: false, erro: "dados_invalidos", texto: "A data inicial precisa vir antes da final." };
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
  const O = { anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico", manual: "Cadastro manual", site: "Site", importacao: "Importação" };
  const base = O[origem] || (origem ? String(origem) : "Sem origem");
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
/** Os KPIs da aba Atendimento. */
export function kpisAtendimento(r) {
  const k = (r && r.kpis) || {}, a = (r && r.kpis_anterior) || {};
  return [
    { id: "novas", rotulo: "Conversas novas", v: k.novas, a: a.novas, fmt: "int", sentido: "neutro", extra: `${fin(+k.msgs_in) ? k.msgs_in : 0} mensagens recebidas` },
    { id: "resolvidas", rotulo: "Resolvidas", v: k.resolvidas, a: a.resolvidas, fmt: "int", sentido: "cima", extra: `${fin(+k.msgs_out) ? k.msgs_out : 0} mensagens enviadas` },
    { id: "tpr_mediana_min", rotulo: "1ª resposta (mediana)", v: k.tpr_mediana_min, a: a.tpr_mediana_min, fmt: "min", sentido: "baixo",
      extra: fin(k.tpr_media_min) ? `média ${duracaoMin(k.tpr_media_min)}` : "" },
    { id: "resolucao_mediana_h", rotulo: "Até resolver (mediana)", v: k.resolucao_mediana_h, a: a.resolucao_mediana_h, fmt: "h", sentido: "baixo" },
    { id: "abertas_agora", rotulo: "Abertas agora", v: k.abertas_agora, a: null, agora: true, fmt: "int", sentido: "neutro",
      extra: fin(k.aguardando_agora) ? `${k.aguardando_agora} aguardando resposta` : "" },
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
export function picoCalor(m) {
  let melhor = null;
  m.forEach((lin, d) => lin.forEach((q, hh) => { if (q > 0 && (!melhor || q > melhor.qtd)) melhor = { dow: d, hora: hh, qtd: q }; }));
  return melhor;
}
/** Relatório sem nada no período (mostra "Sem dados no período."). */
export const vendasVazio = r => !r || (!(+(r.kpis || {}).criados) && !(+(r.kpis || {}).ganhos) && !(+(r.kpis || {}).perdidos) && !(+(r.kpis || {}).abertos));
export const atendimentoVazio = r => !r || (!(+(r.kpis || {}).novas) && !(+(r.kpis || {}).resolvidas) && !(+(r.kpis || {}).msgs_in) && !(+(r.kpis || {}).abertas_agora));
/** Texto da conversão para a próxima etapa do funil. */
export function textoConversao(e) {
  if (!e || e.tipo !== "aberto") return null;
  if (!(+e.passaram)) return "ninguém entrou no período";
  return `${e.passaram} ${+e.passaram === 1 ? "entrou" : "entraram"} · ${fin(e.conversao_proxima_pct) ? `${String(e.conversao_proxima_pct).replace(".", ",")}%` : "—"} seguiram`;
}
/** CSV (separador ;, com BOM para o Excel abrir os acentos) — P1 "CSV por bloco".
    · número sai com vírgula decimal (Excel em português: "12.5" viraria a data 12/mai ou texto);
    · texto que começa com = + - @ tab ou CR ganha um apóstrofo na frente: nome de atendente,
      etapa ou motivo é digitado por usuário e não pode virar FÓRMULA no Excel de quem baixa
      (injeção de CSV — "=HIPERLINK(...)" no nome da conta). */
export function csv(colunas, linhas) {
  const q = v => {
    let s;
    if (v == null) s = "";
    else if (typeof v === "number") s = Number.isFinite(v) ? String(v).replace(".", ",") : "";
    else { s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; }
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
  if (k.status === "erro") return { nivel: "ruim", texto: "Com erro" };
  if (k.status === "pendente") return { nivel: "aten", texto: k.app_inscrito === false ? "App não inscrito na WABA" : "Aguardando o teste de conexão" };
  const ult = k.ultima_entrada_em ? Date.parse(k.ultima_entrada_em) : NaN;
  if (Number.isFinite(ult) && agora - ult > 72 * 36e5) return { nivel: "aten", texto: "Conectado · sem mensagens há mais de 3 dias" };
  return { nivel: "bom", texto: "Conectado" };
}
/** Receita do mês vs o MESMO pedaço do mês anterior (comparação justa: mesmos dias). */
export function mesVsAnterior(n) {
  if (!n) return null;
  return { atual: +n.receita_mes || 0, anterior: +(n.receita_mes_anterior_parcial ?? n.receita_mes_anterior) || 0,
           anteriorInteiro: +n.receita_mes_anterior || 0, dia: +n.dia_do_mes || null };
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
  preencherMoeda(ui, el, valor, { centavos });
  const dur = animar && G && typeof G.duracaoToken === "function" ? G.duracaoToken("--t-dados") : 0;
  const n = Number(valor);
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
export function palavraAgenda(vertical) {
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
  return `Últimos ${Number(dias) || 30} dias · ${plat ? nomePlat(plat) : "Tudo"}`;
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
