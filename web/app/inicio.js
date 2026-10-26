/* ============================================================
   ÓRBITA — inicio.js (frente F6 · M31 · plano 50 / frente B) · tela T3 Início
   A manchete diz o que importa agora ("2 pacientes esperam resposta há
   15 min. Hoje tem 1 consulta e R$ 5.200 em oportunidades abertas."),
   cada trecho é um link; abaixo, quatro KPIs com linha de tendência,
   o bloco «Agora» (quem espera + próximas consultas), os blocos que
   pedem ação em ordem de urgência, a agenda em barras, as metas do mês
   e o resto recolhido em "Mais detalhes". Sem pendência: "Tudo em dia.".
   Dados: nx_inicio + nx_agenda_dia (7 dias; o mês inteiro só quando há
   meta de consultas, relido no máximo a cada 10 min) + nx_onboarding_estado.
   Nada é inventado: a linha de tendência vem de nx_inicio.series_14d
   quando o servidor manda (plano 100, contrato 4) e, sem ela, das
   leituras guardadas NESTE aparelho, um ponto por dia, a partir do 3º dia.
   Os campos novos da RPC (funil_mes, series_14d, respondidas_no_prazo_pct,
   aguardando_lista, canais[].estado) entram por DETECÇÃO: sem eles a tela
   segue exatamente como antes. Atualiza no pulso, no máximo a cada 30 s;
   um relógio de 60 s faz o «Agora» e as barras andarem com a hora (sem
   RPC) e relê tudo na virada do dia. A lógica da frase e da ordem dos
   blocos mora em rel-logica.js (pura); o que é desta tela (KPIs, horas,
   metas, blocos, funil, números caídos) é puro aqui e exportado p/ teste.
   ============================================================ */

const INTERVALO_PULSO = 30000;
const INTERVALO_RELOGIO = 60000;          // «Agora · às HH:MM», o «em 20 min» e a hora destacada das barras andam mesmo sem dado novo
const VALIDADE_AGENDA_MES = 10 * 60000;   // a agenda do mês (meta de consultas) não muda a cada mensagem: o pulso reaproveita por até 10 min
const FUSO = "America/Sao_Paulo";
const DIAS_HIST = 14;          // quantos dias de leitura ficam guardados por empresa/conta neste aparelho
const MAX_ESPERA = 5;          // quantos de quem espera resposta aparecem no «Agora» (o servidor já manda no máximo 5)
let L = null, G = null;
let montagem = 0, cancelarPulso = null, cancelarOcupado = null, cancelarCanais = null, tPulso = 0, tRelogio = 0, ultimaCarga = 0, ultimoJson = "";
let ultimoDado = null, maisAberto = false, ultimoOnb = null, ultimaAgenda = null, ultimaAgendaMes = null;
let cancelarVisivel = null;  // plano 1000 (CR-166): ouvinte de «a aba voltou a ficar visível»
let agendaSemanaEm = 0;     // plano 1000 (CR-170): quando a agenda da semana foi lida (o pulso reaproveita por 2 min)
const VALIDADE_AGENDA_SEMANA = 2 * 60000;
let donoDados = "";        // «empresa|conta» a quem pertencem os últimos dados guardados acima (a aba não recarrega ao trocar de empresa)
let limpezaFeita = null;   // plano 1000 (CR-255): a conta cujas chaves órfãs já foram limpas nesta aba
let modoHoras = "hoje";    // «Hoje» ou «7 dias» no gráfico de barras
let metasEditando = false; // o formulário de metas está aberto ou a 1ª meta está sendo digitada (o pulso e o relógio não redesenham por cima)
let rascunhoMetas = null;  // o que foi digitado nas metas e ainda não guardado: volta nos campos se a tela for redesenhada à força («Atualizar», mover bloco)
let versaoLG = null;       // plano 1000b · RB-177: a versão do app de que vieram L (rel-logica) e G (graficos) — outra versão reimporta
let lerNumeroCrm = null;   // plano 1000b · RB-064: crm-logica.lerNumero (o mesmo leitor de dinheiro do negócio), carregado sem travar a tela
let controlesSpark = [];   // plano 1000b · RB-167: os controles das linhas dos KPIs (ResizeObserver); destruídos antes de cada redesenho
let memVolta = null;       // plano 1000b · RB-260: o item do checklist que a pessoa foi «Fazer agora» (e a rolagem) — o Início volta ao mesmo lugar
const VALIDADE_VOLTA = 30 * 60000;
const CHAVE_VOLTA = "nx-ini-volta";     // plano 1500c · RC-216: o mesmo lugar também depois de recarregar a página (sessionStorage, 30 min)
const VALIDADE_ONB = 10 * 60000;        // plano 1500c · RC-209: no pulso o checklist pendente vale por 10 min (como a agenda do mês)
let onbLidoEm = 0;
let verExemplo = false;                 // plano 1500c · RC-229: «Ver um exemplo» na conta zerada (só na tela; nada é gravado)

export function statusAtualizacaoInicio({ hora = "", falhou = false, cache = false } = {}) {
  // plano 2000d · DR-273: a 1ª pintura vem do que ficou guardado — diz de quando são os números enquanto a rede confirma
  if (cache) return hora ? `Mostrando os números de ${hora} · atualizando…` : "Atualizando…";
  if (falhou) return hora ? `A atualização falhou; exibindo os últimos dados confirmados às ${hora}.` : "A atualização falhou; ainda não há dados confirmados nesta sessão.";
  return hora ? `Atualizado às ${hora}` : "Aguardando a primeira atualização confirmada.";
}

export function atalhosLeadsInicio({ crm = false, ads = false } = {}) {
  return [crm ? { rotulo: "Abrir CRM", href: "#/crm" } : null,
    ads ? { rotulo: "Abrir Anúncios", href: "#/anuncios" } : null].filter(Boolean);
}

/* ============================================================
   1. PURO (testado no Node, sem DOM): datas em SP, histórico local, KPIs, agenda por hora/dia, metas e ordem dos blocos
   ============================================================ */
const p2 = n => String(n).padStart(2, "0");
const fin = v => v !== null && v !== undefined && v !== "" && Number.isFinite(+v);
const FMT_H = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" });
const FMT_D = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const FMT_LONGA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" });
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const quando = iso => { const d = iso instanceof Date ? iso : new Date(iso); return isNaN(d) ? null : d; };
const diaSP = iso => { const d = quando(iso); return d ? FMT_D.format(d) : null; };
const horaSP = iso => { const d = quando(iso); return d ? Number(FMT_H.format(d)) % 24 : null; };
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);
/** Cancelada/desmarcada fica fora de toda conta (a mesma régua de L.consultasHoje). */
/** plano 1000b · RB-158: porcentagem num padrão só, sem espaço («62%»), como o número grande dos KPIs e o graficos.js. */
export const pct = v => `${Math.round(+v || 0)}%`;
const consultaValida = c => !!(c && c.inicio && !/cancelad|desmarcad/i.test(String(c.status || "")));
const listaConsultas = agenda => (agenda && Array.isArray(agenda.consultas) ? agenda.consultas.filter(consultaValida) : null);

/** Dias do mês de uma data AAAA-MM-DD. */
export function diasDoMes(iso) { const [a, m] = String(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
/** Primeiro dia do mês de AAAA-MM-DD. */
export function primeiroDiaMes(iso) { return `${String(iso).slice(0, 7)}-01`; }
/** AAAA-MM-DD + n dias (calendário, sem fuso). */
export function somarDiasIso(iso, n) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
const diaSemanaIso = iso => { const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
/** "sábado, 4 de outubro" no fuso de SP. */
export function dataLonga(agora = new Date()) { return FMT_LONGA.format(agora); }
/** plano 1500c · RC-221: «ter, 21 out» para o celular (a longa ocupava 2 linhas a 360 px ao lado da hora e do botão). */
const FMT_CURTA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "numeric", month: "short" });
export function dataCurta(agora = new Date()) {
  const p = Object.fromEntries(FMT_CURTA.formatToParts(agora).map(x => [x.type, x.value]));
  return `${String(p.weekday || "").replace(".", "")}, ${p.day} ${String(p.month || "").replace(".", "")}`;
}

/**
 * Histórico local das leituras do Início (a linha de tendência dos KPIs): UM registro por dia do servidor, só os últimos `max` dias.
 * registrarHistorico(hist, "2026-10-04", {aguardando: 2, …}) → {dias: [{dia, aguardando, …}, …]} (novo objeto; o mesmo dia é substituído).
 */
export function registrarHistorico(hist, dia, valores, max = DIAS_HIST) {
  if (!dia) return hist && Array.isArray(hist.dias) ? hist : { dias: [] };
  const dias = (hist && Array.isArray(hist.dias) ? hist.dias : []).filter(x => x && x.dia && x.dia !== dia);
  dias.push({ dia, ...valores });
  dias.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  return { dias: dias.slice(-max) };
}
/** Série de um campo do histórico (só dias em que havia o número); null com menos de `min` pontos — sem linha de 1 ou 2 pontos, que não diz nada. */
export function serieHistorico(hist, chave, { min = 3 } = {}) {
  const dias = hist && Array.isArray(hist.dias) ? hist.dias : [];
  const pontos = dias.filter(x => x && fin(x[chave])).map(x => +x[chave]);
  return pontos.length >= min ? pontos : null;
}
/** Último valor × o do dia anterior registrado (para a seta ↑↓); null sem dois dias. */
export function variacaoHistorico(hist, chave) {
  const dias = (hist && Array.isArray(hist.dias) ? hist.dias : []).filter(x => x && fin(x[chave]));
  if (dias.length < 2) return null;
  const a = dias[dias.length - 1], b = dias[dias.length - 2];
  return { atual: +a[chave], anterior: +b[chave], dia: b.dia };
}

/** Quantas consultas válidas há em `dia` na resposta de nx_agenda_dia (null sem dado de agenda). */
export function consultasNoDia(agenda, dia) {
  const lista = listaConsultas(agenda);
  return lista ? lista.filter(c => diaSP(c.inicio) === dia).length : null;
}

/**
 * plano 1000 (CR-177): indicadores que podem trocar de lugar com os 4 do topo — só com o que nx_inicio já devolve (nada inventado):
 * leads de 7 dias, receita do mês, previsão ponderada e tarefas atrasadas. → [{mesmo formato de kpisInicio}]
 */
export function kpisAlternativos(d, { links = {}, voc = {} } = {}) {
  const V = { negocio: "negócio", negocios: "negócios", feminino: false, ...voc };
  const n = (d && d.negocios) || {}, l = (d && d.leads) || {}, t = (d && d.tarefas) || {};
  const atr = Math.max(0, Math.floor(+t.atrasadas) || 0);
  return [
    // plano 1000b · RB-157: «oportunidades/orçamentos que entraram…» pela vertical (antes «Negócios» fixo)
    { id: "leads", chave: "leads_semana", rotulo: rotuloLeads7(V), valor: +l.semana || 0, formato: "int", sentido: "cima", tom: "neutro", href: links.leads || links.crm || null,     // plano 2000d · DR-252
      sub: `${+l.hoje || 0} hoje · ${+l.semana_anuncio || 0} de anúncio`, ajuda: ajudaLeads(V) },
    { id: "receita", chave: "receita_mes", rotulo: "Receita do mês", valor: fin(n.receita_mes) ? +n.receita_mes : null, formato: "brl", sentido: "cima", tom: "neutro", href: links.relatorios || links.crm || null,
      // plano 2000d · IY-019: a legenda fala a língua do negócio («9 oportunidades ganhas no mês», como o bloco Vendas), não «fechamentos» fixo
      sub: textoGanhosMes(+n.ganhos_mes || 0, V), ajuda: "Soma do valor final do que foi ganho no CRM do dia 1 até hoje." },
    // plano 1000 (CR-206): sem «ponderada»
    { id: "previsao", chave: "previsao_ponderada", rotulo: "Previsão (pela chance de cada etapa)", valor: fin(n.previsao_ponderada) ? +n.previsao_ponderada : null, formato: "brl", sentido: "cima", tom: "neutro", href: links.crm || null,
      sub: "valor × chance de cada etapa", ajuda: `Soma do valor previsto multiplicado pela probabilidade da etapa de cada ${V.negocio} ${V.feminino ? "aberta" : "aberto"}.` },
    { id: "atrasadas", chave: "tarefas_atrasadas", rotulo: "Tarefas atrasadas", valor: atr, formato: "int", sentido: "baixo", tom: atr > 0 ? "aten" : "ok", href: links.tarefas || null,
      sub: atr > 0 ? "passaram do prazo" : "nada atrasado", ajuda: "Tarefas abertas cujo prazo já passou." },
    // plano 2000d · DR-348: vendas por indicação no mês (o argumento do pós-venda) — só quando o servidor manda negocios.ganhos_indicacao_mes
    ...(fin(n.ganhos_indicacao_mes) ? [{ id: "indicacao", chave: "ganhos_indicacao_mes", rotulo: "Vendas por indicação", valor: Math.max(0, Math.round(+n.ganhos_indicacao_mes)), formato: "int",
      sentido: "cima", tom: "neutro", href: links.relatorios || links.crm || null,
      sub: fin(n.receita_indicacao_mes) ? `no mês · R$ ${Math.round(+n.receita_indicacao_mes).toLocaleString("pt-BR")}` : "no mês",
      ajuda: `${cap(V.negocios)} ${V.feminino ? "ganhas" : "ganhos"} no mês cuja origem é indicação de outro cliente.` }] : []),
  ];
}
/** plano 2000d · IY-019: «1 oportunidade ganha no mês» / «9 orçamentos ganhos no mês» pelo vocabulário (gênero e número). */
export function textoGanhosMes(n, V = {}) {
  const q = Math.max(0, Math.round(+n || 0));
  const um = V.negocio || "negócio", varios = V.negocios || "negócios";
  const adj = `${V.feminino ? "ganha" : "ganho"}${q === 1 ? "" : "s"}`;
  return `${q} ${q === 1 ? um : varios} ${adj} no mês`;
}
const ajudaLeads = V => `${cap(V.negocios)} que entraram pelo funil nos últimos 7 dias (contagem do CRM, não conversões do Meta/Google).`;
/**
 * plano 2000d · DR-252: o rótulo do KPI de leads pela vertical — «Novos pacientes · 7 dias» (clínica), «Novos clientes · 7 dias» (oficina, loja);
 * «Leads · 7 dias» só no genérico (ou sem vertical).
 */
export function rotuloLeads7(V = {}) {
  const vert = V && V.vertical;
  if (!vert || vert === "generico") return "Leads · 7 dias";
  const plural = String((V && V.contatos) || "clientes").toLowerCase();
  return `Novos ${plural} · 7 dias`;
}
/** plano 2000d · DR-258: a conta sem acesso à agenda sabe por quê e com quem falar. */
export const TEXTO_SEM_AGENDA = "Sua conta não tem acesso à agenda. Peça ao administrador.";
/**
 * plano 1000b · RB-154/RB-226: qual número de nx_inicio acende (L.numerosMudaram) o KPI de cada id — antes os trocáveis (receita, previsão,
 * atrasadas) caíam em «agenda.consultas»: acendiam quando a agenda mudava e nunca quando o próprio número mudava. Id desconhecido → null.
 */
export function chaveDestaqueKpi(id) {
  return { aguardando: "conversas.aguardando", consultas: "agenda.consultas", aberto: "negocios.valor_aberto", leads: "leads.semana",
    prazo: "conversas.respondidas_no_prazo_pct", receita: "negocios.receita_mes", previsao: "negocios.previsao_ponderada", atrasadas: "tarefas.atrasadas",
    indicacao: "negocios.ganhos_indicacao_mes" }[id] || null;     // plano 2000d · IY-020: o KPI de indicação (DR-348) também acende
}
/**
 * plano 2000d · IY-021/IY-022: os números que L.numerosMudaram (rel-logica) não olha — o prazo de resposta, as vendas por indicação e as
 * consultas de hoje (que vêm da agenda, não de nx_inicio). Sem isso os KPIs «Respondidas no prazo», «Vendas por indicação» e «Consultas hoje»
 * nunca acendiam quando o próprio número mudava. → ["conversas.respondidas_no_prazo_pct", …]
 */
export function numerosExtrasMudaram(antes, depois, { agAntes = null, agDepois = null, hoje = null } = {}) {
  const out = [];
  if (!antes || !depois) return out;
  const par = (g, k) => { const a = antes[g] && antes[g][k], b = depois[g] && depois[g][k]; if (fin(a) && fin(b) && +a !== +b) out.push(`${g}.${k}`); };
  par("conversas", "respondidas_no_prazo_pct");
  par("negocios", "ganhos_indicacao_mes");
  const dia = hoje || depois.hoje;
  const ca = consultasNoDia(agAntes, dia), cb = consultasNoDia(agDepois, dia);
  if (ca !== null && cb !== null && ca !== cb) out.push("agenda.consultas");
  return out;
}
/** plano 1500c · RC-206: o texto da opção no «Trocar indicadores» — o nome e o valor de agora; sem dado, só o nome. */
export function rotuloOpcaoKpi(k, { brl = v => `R$ ${Math.round(v)}`, int = v => String(Math.round(v)) } = {}) {
  if (!k) return "";
  if (k.valor === null || k.valor === undefined || !fin(k.valor)) return k.rotulo;
  const v = k.formato === "brl" ? brl(+k.valor) : k.formato === "pct" ? pct(k.valor) : int(+k.valor);
  return `${k.rotulo} — ${v}`;
}
/** CR-177: aplica a escolha guardada ({posição: id}) sobre os 4 padrão, sem repetir indicador. Escolha inválida é ignorada. */
export function aplicarEscolhaKpis(padrao, alternativos, escolha) {
  const todos = [...padrao, ...alternativos.filter(a => !padrao.some(p => p.id === a.id))];
  const entradas = Object.entries(escolha && typeof escolha === "object" ? escolha : {});
  // plano 1000b · RB-166: com o flutuante aberto a pessoa TROCA dois de lugar — a escolha inteira vale de uma vez quando não repete nenhum
  // (antes, aplicada posição a posição, «aberto» na 1ª batia com o «aberto» padrão da 3ª e a troca era ignorada)
  const inteira = padrao.slice();
  let valida = true;
  for (const [pos, id] of entradas) {
    const i = Number(pos), k = todos.find(x => x.id === id);
    if (!(i >= 0 && i < inteira.length) || !k) { valida = false; break; }
    inteira[i] = k;
  }
  if (valida && new Set(inteira.map(x => x.id)).size === inteira.length) return inteira;
  const out = padrao.slice();
  for (const [pos, id] of entradas) {
    const i = Number(pos), k = todos.find(x => x.id === id);
    if (!(i >= 0 && i < out.length) || !k || out.some((x, j) => j !== i && x.id === id)) continue;
    out[i] = k;
  }
  return out;
}

/**
 * Os quatro KPIs do topo, só com o que nx_inicio e nx_agenda_dia devolvem.
 * kpisInicio(d, agenda, {hoje, links, voc}) → [{id, chave, rotulo, valor, formato: "int"|"brl"|"pct", sentido, tom, sub, href, ajuda}]
 * `valor` null = sem dado (a agenda não está disponível): o cartão mostra «—» e explica, nunca «0».
 * Plano 100 · B3: quando nx_inicio manda `conversas.respondidas_no_prazo_pct` (contrato 4), o 4º cartão é «Respondidas no prazo»
 * e «Leads · 7 dias» desce para o bloco Leads; com a RPC antiga o 4º continua sendo «Leads · 7 dias».
 */
export function kpisInicio(d, agenda, { hoje = null, links = {}, voc = {} } = {}) {
  const V = { contato: "cliente", contatos: "clientes", negocio: "negócio", negocios: "negócios", consulta: "consulta", consultas: "consultas", feminino: false, ...voc };
  const c = (d && d.conversas) || {}, n = (d && d.negocios) || {}, l = (d && d.leads) || {};
  const ag = Math.max(0, Math.floor(+c.aguardando) || 0);
  const espera = fin(c.espera_mais_antiga_min) ? +c.espera_mais_antiga_min : null;
  const nCons = consultasNoDia(agenda, hoje || (d && d.hoje));
  const falhou = !!(agenda && agenda.erro);      // a leitura da agenda falhou agora (≠ conta sem agenda): «—» e o motivo certo
  const lendo = !!(agenda && agenda.lendo);      // 1ª pintura pelo cache: a agenda ainda está a caminho
  const abertos = Math.max(0, Math.floor(+n.abertos) || 0);
  const adj = (m, q) => (V.feminino ? m.replace(/o$/, "a") : m) + (Number(q) === 1 ? "" : "s");
  const prazo = fin(c.respondidas_no_prazo_pct) ? Math.max(0, Math.min(100, +c.respondidas_no_prazo_pct)) : null;
  const prazoMin = prazoResposta(c);      // plano 1500c · RC-187: o prazo da empresa (conversas.prazo_min); 15 só sem o campo
  const quarto = prazo !== null
    ? { id: "prazo", chave: "respondidas_pct", rotulo: "Respondidas no prazo", valor: prazo, formato: "pct", sentido: "cima",
      tom: prazo >= 80 ? "ok" : prazo < 50 ? "aten" : "neutro", href: links.relatorios || links.conversas || null,
      sub: `1ª resposta em até ${prazoMin} min · 7 dias`,
      ajuda: `Conversas dos últimos 7 dias em que a primeira resposta da equipe saiu em até ${prazoMin} minutos (contagem do servidor).` }
    : { id: "leads", chave: "leads_semana", rotulo: rotuloLeads7(V), valor: +l.semana || 0, formato: "int", sentido: "cima", tom: "neutro", href: links.leads || links.crm || null,     // plano 2000d · DR-252
      sub: `${+l.hoje || 0} hoje · ${+l.semana_anuncio || 0} de anúncio`,
      ajuda: ajudaLeads(V) };     // plano 1000b · RB-157
  return [
    { id: "aguardando", chave: "aguardando", rotulo: "Esperando resposta", valor: ag, formato: "int", sentido: "baixo",
      tom: ag > 0 ? (espera !== null && espera >= limiteEspera(c) ? "ruim" : "aten") : "ok", href: links.conversas || null,     // plano 1500c · RC-301
      sub: ag > 0 ? (espera !== null && espera >= 1 ? `a mais antiga há ${duracaoCurta(espera)}` : `${plural(ag, V.contato, V.contatos)} sem resposta`) : "ninguém esperando",
      ajuda: `Conversas abertas em que a última mensagem é do ${V.contato} e ainda não foi respondida.` },     // plano 1000b · RB-157
    // plano 1000 (CR-251): consultas não têm «sentido bom» — um dia mais calmo não é problema: a variação fica neutra (sem vermelho)
    { id: "consultas", chave: "consultas", rotulo: `${cap(V.consultas)} hoje`, valor: nCons, formato: "int", sentido: "neutro", tom: "neutro", href: links.agenda || null,
      // plano 2000d · IY-040: «nenhum marcado» quando a palavra da agenda da empresa é masculina (V.femAgenda false)
      sub: nCons === null ? (lendo ? "lendo a agenda…" : falhou ? "não consegui ler a agenda" : "agenda indisponível") : nCons === 0 ? (V.femAgenda === false ? "nenhum marcado" : "nenhuma marcada") : `${V.femAgenda === false ? "marcados" : "marcadas"} na Agenda`,
      ajuda: nCons === null ? (lendo ? "Lendo a agenda…" : falhou ? "Não consegui ler a agenda agora. Use «Atualizar» para tentar de novo." : TEXTO_SEM_AGENDA)     // plano 2000d · DR-258
        : `${cap(V.consultas)} ${V.femAgenda === false ? "marcados" : "marcadas"} para hoje na Agenda, sem ${V.femAgenda === false ? "os cancelados" : "as canceladas"}.` },
    { id: "aberto", chave: "valor_aberto", rotulo: "Em aberto", valor: +n.valor_aberto || 0, formato: "brl", sentido: "cima", tom: "neutro", href: links.crmResumo || links.crm || null,     // plano 1000 (CR-299)
      sub: `${abertos} ${plural(abertos, V.negocio, V.negocios)} ${adj("aberto", abertos)}`,
      // plano 1000b · RB-156: o adjetivo concorda como no sub («das oportunidades abertas», não «abertos»)
      ajuda: `Soma do valor previsto ${V.feminino ? "das" : "dos"} ${V.negocios} ${adj("aberto", 2)} no CRM.` },
    quarto,
  ];
}

/** plano 1500c · RC-187: o prazo de 1ª resposta da empresa em minutos (nx_inicio.conversas.prazo_min); 15 sem o campo. */
// plano 1500c · IC-022: prazo vindo torto do servidor (1 min, 3 dias) fica entre 5 min e 24 h — nada de vermelho com 1 min de espera
const prazoValido = c => (c && fin(c.prazo_min) && +c.prazo_min > 0 ? Math.min(1440, Math.max(5, Math.round(+c.prazo_min))) : null);
export function prazoResposta(c) { return prazoValido(c) ?? 15; }
/** plano 1500c · RC-301: a partir de quantos minutos a espera fica vermelha — o prazo da empresa quando o servidor manda; 30 sem ele. */
export function limiteEspera(c) { return prazoValido(c) ?? 30; }
/**
 * plano 1500c · RC-204: a faixa da espera de quem está na fila — "ok" (< 5 min), "aten" (5 min até o limite) e "ruim" (≥ limite) — com o texto
 * que acompanha a cor (nunca só cor). → {faixa, texto}
 */
export function faixaEspera(min, limite = 30) {
  if (!fin(min)) return { faixa: "ok", texto: "" };
  const lim = Math.max(5, +limite || 30);
  if (+min >= lim) return { faixa: "ruim", texto: "passou do prazo" };
  if (+min >= 5) return { faixa: "aten", texto: "responda logo" };
  return { faixa: "ok", texto: "" };
}

/* ---- plano 100 · contrato 4: os campos novos de nx_inicio, sempre por detecção (sem eles, null e a tela segue como antes) ---- */
/** Qual série de nx_inicio.series_14d acompanha cada KPI; `mesma` = a série mede o mesmo que o número grande (dá para comparar com ontem). */
// (revisão: series_14d.aguardando são as conversas ABERTAS em cada dia, não «quem espera agora» — sem seta contra ontem, linha com o nome certo)
const SERIE_DO_KPI = Object.freeze({ aguardando: { k: "aguardando", mesma: false, linha: "conversas novas por dia" }, consultas: { k: "consultas", mesma: true },
  valor_aberto: { k: "valor_aberto", mesma: true }, leads_semana: { k: "leads", mesma: false, linha: "leads por dia" } });
/**
 * A série de 14 dias que o servidor manda para um KPI (mais antigo primeiro). null sem series_14d, sem a chave ou com menos de 2 números.
 * serieServidor(d, "aguardando") → {valores: [..14], mesma: true, ontem: número|null}
 */
export function serieServidor(d, chave) {
  const m = SERIE_DO_KPI[chave];
  const s = m && d && d.series_14d && typeof d.series_14d === "object" ? d.series_14d[m.k] : null;
  if (!Array.isArray(s)) return null;
  const valores = s.filter(fin).map(Number);
  if (valores.length < 2) return null;
  return { valores, mesma: m.mesma, linha: m.linha || null, ontem: m.mesma ? valores[valores.length - 2] : null };
}

/**
 * Funil do mês (nx_inicio.funil_mes): leads → conversas → agendados → ganhos, com a taxa sobre a etapa anterior.
 * null quando o servidor não manda (RPC antiga). Cada etapa é contagem do mês até hoje, não a mesma turma: a taxa pode passar de 100%.
 * funilMes(d, {voc}) → {etapas: [{id, nome, qtd, tipo, conversao}], leads, ganhos, geral (ganhos ÷ leads, 0–1) | null, vazio}
 */
export function funilMes(d, { voc = {} } = {}) {
  const f = d && d.funil_mes;
  if (!f || typeof f !== "object") return null;
  const campos = ["leads", "conversas", "agendados", "ganhos"];
  if (!campos.some(k => fin(f[k]))) return null;
  const V = { negocios: "negócios", consultas: "consultas", feminino: false, ...voc };
  const q = k => Math.max(0, Math.round(+f[k] || 0));
  // plano 2000d · IY-039: a palavra da agenda pode ser masculina no vocabulário da empresa («Atendimentos marcados», «dos atendimentos…»)
  const femAg = V.femAgenda !== false;
  const nomes = { leads: "Leads", conversas: "Conversas", agendados: `${cap(V.consultas)} ${femAg ? "marcadas" : "marcados"}`, ganhos: `${cap(V.negocios)} ${V.feminino ? "ganhas" : "ganhos"}` };
  // plano 1000b · RB-245: «60% das conversas» diz DE QUAL etapa (no celular a anterior pode estar fora da tela); as palavras da agenda
  // (consulta · visita · entrega) e «conversas» são femininas, «leads» masculino
  const deEtapa = { leads: "dos leads", conversas: "das conversas", agendados: `${femAg ? "das" : "dos"} ${String(nomes.agendados).toLowerCase()}` };
  const etapas = campos.map((id, i) => {
    const qtd = q(id), ant = i ? q(campos[i - 1]) : null;
    const taxa = ant > 0 ? Math.round(qtd / ant * 100) : null;
    const daAnterior = i ? deEtapa[campos[i - 1]] : "";
    // plano 1000 (CR-168): acima de 100% não é «130% dos leads» (não é a mesma turma): o texto diz que a etapa passou da anterior no mês
    // plano 1000b · RB-158: «62%» sem espaço, o padrão do app
    const conversao = taxa === null ? "" : taxa > 100 ? "mais que a etapa anterior" : `${pct(taxa)} ${daAnterior}`;
    return { id, nome: nomes[id], qtd, tipo: id === "ganhos" ? "ganho" : "aberto", conversao, ...(taxa > 100 ? { dica: `${pct(taxa)} ${daAnterior}: são contagens do mês, não a mesma turma — entram também os que chegaram em meses anteriores.` } : {}) };
  });
  const leads = q("leads"), ganhos = q("ganhos");
  return { etapas, leads, ganhos, geral: leads > 0 ? ganhos / leads : null, vazio: etapas.every(e => !e.qtd) };
}

/**
 * Quem espera resposta (nx_inicio.conversas.aguardando_lista): só os itens com id, a mais antiga primeiro, até `max`.
 * null sem o campo (RPC antiga): o «Agora» continua só com o número e os botões.
 */
export function listaEspera(c, max = MAX_ESPERA) {
  const l = c && c.aguardando_lista;
  if (!Array.isArray(l)) return null;
  // plano 1000b · RB-163: o responsável que o servidor mandar (atribuida_id/atribuida_nome) fica — «Assumir» pergunta antes de tomar de outra pessoa
  // plano 2000d · IY-068: a mesma conversa duas vezes (junção do servidor) aparece uma vez só — antes duas linhas e dois «Assumir»
  const vistos = new Set();
  return l.filter(x => x && x.id !== null && x.id !== undefined && x.id !== "" && !vistos.has(String(x.id)) && vistos.add(String(x.id)))
    .map(x => ({ id: x.id, nome: String(x.nome || "").trim() || null, espera: fin(x.espera_min) ? Math.max(0, +x.espera_min) : null,
      canal: x.canal ? String(x.canal) : null, origem: x.origem ? String(x.origem) : null, plataforma: x.plataforma ? String(x.plataforma) : null,
      atribuidaId: x.atribuida_id !== null && x.atribuida_id !== undefined && x.atribuida_id !== "" ? String(x.atribuida_id) : null,
      atribuidaNome: String(x.atribuida_nome || "").trim() || null,
      // plano 1500c · RC-228: o contato (quando o servidor manda) — «Marcar» abre a agenda já com a pessoa
      contatoId: x.contato_id !== null && x.contato_id !== undefined && x.contato_id !== "" ? x.contato_id : null }))
    .sort((a, b) => (b.espera ?? -1) - (a.espera ?? -1)).slice(0, max);
}

/**
 * Números de WhatsApp desconectados: nx_inicio.canais[].estado (contrato 4) somado ao que o shell sabe (ctx.canais.caidos(), contrato A4),
 * sem repetir o mesmo número. → [{id, nome, desde}]
 */
export function numerosCaidos(d, doShell = []) {
  const out = new Map();
  // do shell, o que tem id vale (chega em tempo real, mais novo que a última leitura de nx_inicio) e casa pelo id; a notificação SEM
  // `dados.canal_id` não diz qual número caiu nem casa o «voltou» com o «caiu»: com nx_inicio trazendo o estado, ela fica de fora
  const servidorSabe = estadoNumeros(d) !== null;
  const poe = (x, fonte) => {
    if (!x) return;
    const chave = String(x.id ?? x.nome ?? "");
    if (!chave || out.has(chave)) return;
    const nome = String(x.nome || "").replace(/\s*[:·-]\s*n[uú]mero desconectado\.?$/i, "").trim() || "Número de WhatsApp";
    out.set(chave, { id: x.id ?? null, nome, desde: x.desde || x.estado_desde || null, fonte });
  };
  for (const k of (d && Array.isArray(d.canais) ? d.canais : [])) if (k && k.estado === "desconectado") poe(k, "inicio");
  for (const k of (Array.isArray(doShell) ? doShell : [])) {
    if (!k) continue;
    const temId = k.id !== null && k.id !== undefined && k.id !== "";
    if (servidorSabe && !temId) continue;
    poe(k, "shell");
  }
  return [...out.values()];
}
/** "ok" quando o servidor manda o estado e todos os números estão conectados; "caido" com algum desconectado; null sem a informação. */
export function estadoNumeros(d) {
  const cs = d && Array.isArray(d.canais) ? d.canais.filter(k => k && typeof k.estado === "string") : [];
  if (!cs.length) return null;
  // plano 1000 (CR-300): conectado no aparelho mas com erro no cadastro (o bloco Números mostra o erro) não é «tudo certo» — sem o ponto verde
  if (d.canais.some(k => k && k.status === "erro")) return null;
  if (cs.some(k => k.estado === "desconectado")) return "caido";
  return cs.every(k => k.estado === "conectado") ? "ok" : null;
}
/**
 * plano 1000 (CR-159): o primeiro nome para a saudação, sem o título — «Dra. Helena Souza» → «Helena» (antes: «Boa noite, Dra.»).
 * Pula Dr., Dra., Sr., Sra., Srta., Prof., Profa. (com ou sem ponto); só o título → "".
 */
export function primeiroNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const titulo = /^(dr|dra|sr|sra|srta|prof|profa|eng|enga)\.?$/i;
  // plano 1500c · RC-185: «joão silva» → «João» (a conta cadastrada em minúscula não vira «Boa tarde, joão»)
  // plano 2000d · IY-035: pedaço sem letra nenhuma («🦷 Helena», «- Ana») não é nome — pula para o próximo
  const p = partes.find(x => !titulo.test(x) && /\p{L}/u.test(x)) || "";
  // plano 2000d · IY-034: nome composto com hífen ganha maiúscula nas duas partes («maria-clara» → «Maria-Clara»); emoji colado na frente sai
  const limpo = p.replace(/^[^\p{L}]+/u, "");
  return limpo ? limpo.split("-").map(x => (x ? x.charAt(0).toLocaleUpperCase("pt-BR") + x.slice(1) : x)).join("-") : "";
}
/**
 * plano 2000d · IY-026: uma lista em português — «Ana», «Ana e Bruno», «Ana, Bruno e Carla»; IY-027: com `max`, o resto vira «e mais N»
 * («Ana, Bruno, Carla e mais 2»). Vazios ficam de fora.
 */
export function listaPt(nomes, max = Infinity) {
  const l = (Array.isArray(nomes) ? nomes : []).map(x => String(x ?? "").trim()).filter(Boolean);
  if (!l.length) return "";
  if (l.length > max && max >= 1) { const resto = l.length - max; return `${l.slice(0, max).join(", ")} e mais ${resto}`; }
  return l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}
/** A frase da faixa: «Número de WhatsApp desconectado há 12 min: Recepção.» (vários: «2 números … : A, B.»); "" sem número caído. */
export function textoNumeroCaido(lista, agora = Date.now()) {
  if (!Array.isArray(lista) || !lista.length) return "";
  if (lista.length > 1) {
    // plano 1500c · RC-231: com vários, desde quando caiu o mais antigo («o primeiro há 40 min»)
    const ts = lista.map(x => Date.parse(x && x.desde || "")).filter(Number.isFinite);
    const ha = ts.length ? ` (o primeiro há ${duracaoCurta(Math.max(0, (agora - Math.min(...ts)) / 60000))})` : "";
    // plano 2000d · IY-026/IY-027: «A, B e C» (português) e, com muitos, «A, B, C e mais 2» — a faixa cabe a 360 px
    return `${lista.length} números de WhatsApp desconectados${ha}: ${listaPt(lista.map(x => x.nome), 3)}.`;
  }
  const x = lista[0], t = Date.parse(x.desde || "");
  const ha = Number.isFinite(t) ? ` há ${duracaoCurta(Math.max(0, (agora - t) / 60000))}` : "";
  return `Número de WhatsApp desconectado${ha}: ${x.nome}.`;
}
/**
 * plano 1000b · RB-163: a conversa já está com OUTRA pessoa? → o texto da pergunta («Está com Ana. Assumir mesmo assim?»); null quando está
 * sem responsável, com a própria conta ou o servidor não diz (RPC sem atribuida_*).
 */
export function perguntaAssumir(it, contaId) {
  if (!it || !it.atribuidaId || String(it.atribuidaId) === String(contaId)) return null;
  return `Está com ${it.atribuidaNome || "outra pessoa da equipe"}. Assumir mesmo assim?`;
}
/** "12 min" · "1 h 05 min" · "26 h" · "3 dias" (sem rel-logica: a lista de KPIs é pura). */
export function duracaoCurta(min) {
  if (!fin(min)) return "—";
  const t = Math.round(Math.max(0, +min));
  if (t < 1) return "< 1 min";
  if (t < 60) return `${t} min`;
  // plano 1000b · RB-159: de 48 h em diante a espera é em dias («3 dias», não «72 h»)
  if (t >= 48 * 60) return `${Math.floor(t / 1440)} dias`;
  const hh = Math.floor(t / 60), mm = t % 60;
  // plano 2000d · IY-023: de 10 h em diante conta as horas inteiras que passaram (47 h 50 min é «47 h», não «48 h» um minuto antes de «2 dias»)
  return hh < 10 ? (mm ? `${hh} h ${p2(mm)} min` : `${hh} h`) : `${hh} h`;
}

/**
 * plano 1000 (CR-217, contrato 20261013d): nx_inicio.agendados_sem_data {total, itens:[{id, titulo, contato_nome, estagio_nome, desde}]} —
 * negócios na etapa de agendamento SEM data marcada (a agenda e o lembrete não sabem deles). null sem o campo (RPC antiga) ou sem nenhum.
 * → {total, itens:[{id, nome, etapa, ha}]} (no máximo `max`; «ha» = «há 3 dias» / «há 5 h»).
 */
export function listaSemData(d, { agora = Date.now(), max = 5 } = {}) {
  const s = d && d.agendados_sem_data;
  if (!s || typeof s !== "object") return null;
  const itens = (Array.isArray(s.itens) ? s.itens : []).filter(x => x && x.id !== null && x.id !== undefined && x.id !== "").slice(0, max).map(x => {
    const t = Date.parse(x.desde || "");
    const min = Number.isFinite(t) ? Math.max(0, (agora - t) / 60000) : null;
    const dias = min === null ? null : Math.floor(min / 1440);
    return { id: x.id, nome: String(x.contato_nome || x.titulo || "").trim() || null, etapa: String(x.estagio_nome || "").trim() || null,
      ha: min === null ? null : dias >= 1 ? `há ${dias} ${dias === 1 ? "dia" : "dias"}` : `há ${duracaoCurta(min)}` };
  });
  const total = Math.max(fin(s.total) ? +s.total : 0, itens.length);
  return total > 0 ? { total, itens } : null;
}

/** Consultas de hoje por hora (de 8 às 18 h, esticando se houver consulta fora disso): {horas: [{h, n, itens}], total, max}. */
export function consultasPorHora(agenda, hoje, { de = 8, ate = 18 } = {}) {
  const lista = (listaConsultas(agenda) || []).filter(c => diaSP(c.inicio) === hoje);
  const porH = new Map();
  for (const c of lista) { const h = horaSP(c.inicio); if (h === null) continue; if (!porH.has(h)) porH.set(h, []); porH.get(h).push(c); }
  const hs = [...porH.keys()];
  const h0 = Math.min(de, ...hs), h1 = Math.max(ate, ...hs);
  const horas = [];
  for (let h = h0; h <= h1; h++) horas.push({ h, n: (porH.get(h) || []).length, itens: porH.get(h) || [] });
  return { horas, total: lista.length, max: Math.max(0, ...horas.map(x => x.n)) };
}
/** Consultas por dia nos próximos `dias` (hoje incluso): {dias: [{dia, n, itens, rotulo, ddmm, hoje}], total, max}. */
export function consultasPorDia(agenda, hoje, dias = 7) {
  const lista = listaConsultas(agenda) || [];
  // plano 2000d · DR-295: agrupa por dia UMA vez (antes filtrava a lista inteira para cada um dos 7 dias)
  const porDia = new Map();
  for (const c of lista) { const k = diaSP(c.inicio); if (!k) continue; if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(c); }
  const out = [];
  for (let i = 0; i < dias; i++) {
    const dia = somarDiasIso(hoje, i);
    const itens = porDia.get(dia) || [];
    const [, m, d] = dia.split("-");
    // rótulo curto cabe em 7 colunas a 360 px («hoje», «seg»…); o longo («amanhã 05/10») vai para a leitura e a dica
    out.push({ dia, n: itens.length, itens, rotulo: i === 0 ? "hoje" : SEMANA[diaSemanaIso(dia)], rotuloLongo: i === 0 ? `hoje ${d}/${m}` : i === 1 ? `amanhã ${d}/${m}` : `${SEMANA[diaSemanaIso(dia)]} ${d}/${m}`, ddmm: `${d}/${m}`, hoje: i === 0 });
  }
  return { dias: out, total: out.reduce((s, x) => s + x.n, 0), max: Math.max(0, ...out.map(x => x.n)) };
}
/**
 * As consultas de hoje com o estado em relação ao relógio (passou · agora · proxima · depois) e as próximas da semana.
 * → {hoje: [...], visiveis: as de hoje que ainda não acabaram (até max), passadas, restantes, futuras: as dos próximos dias (até max), diaAcabou}
 */
export function proximasConsultas(agenda, { hoje, agora = Date.now(), max = 4, duracaoPadrao = null } = {}) {
  // plano 1500c · RC-200: consulta sem fim dura o padrão da agenda da empresa (agenda.duracao_padrao_min); 30 min só sem ele
  const durP = [duracaoPadrao, agenda && agenda.duracao_padrao_min].find(v => fin(v) && +v > 0);
  const dur = (durP ? +durP : 30) * 60000;
  const todas = (listaConsultas(agenda) || [])
    .map(c => { const ini = Date.parse(c.inicio), fim = Date.parse(c.fim); return { ...c, ini, fim: Number.isFinite(fim) && fim > ini ? fim : ini + dur, dia: diaSP(c.inicio) }; })
    .filter(c => Number.isFinite(c.ini)).sort((a, b) => a.ini - b.ini);
  let proximaMarcada = false;
  const marcar = c => {
    let estado;
    if (c.fim <= agora) estado = "passou";
    else if (c.ini <= agora) estado = "agora";
    else if (!proximaMarcada) { estado = "proxima"; proximaMarcada = true; }
    else estado = "depois";
    return { ...c, estado };
  };
  const deHoje = todas.filter(c => c.dia === hoje).map(marcar);
  const futuras = todas.filter(c => c.dia > hoje).slice(0, max).map(c => ({ ...c, estado: "depois" }));
  const passadas = deHoje.filter(c => c.estado === "passou").length;
  const visiveis = deHoje.filter(c => c.estado !== "passou").slice(0, max);
  // plano 1500c · RC-201: as que já passaram sem Compareceu/Faltou marcado (e têm negócio para marcar) — a recepção marca daqui
  const semPresenca = deHoje.filter(c => c.estado === "passou" && c.negocio_id && !(c.presenca || (c.campos && c.campos.presenca)) && c.marco !== "faltou");
  return { hoje: deHoje, visiveis, passadas, restantes: deHoje.length - passadas, futuras, diaAcabou: deHoje.length > 0 && visiveis.length === 0, semPresenca };
}

/**
 * Progresso de uma meta do mês contra o ritmo do calendário: no dia 10 de 31 o esperado é 10/31 da meta.
 * → null sem meta; {meta, realizado, pct (0–100, p/ barra), pctReal, esperado, ritmoPct, falta, estado: batida|frente|ritmo|atras}
 */
export function progressoMeta({ meta, realizado, dia, diasNoMes, fracaoDia = null } = {}) {
  const m = +meta, r = Math.max(0, +realizado || 0);
  if (!(m > 0)) return null;
  // plano 2000d · DR-250: com `fracaoDia` (0–1, quanto do dia de hoje já passou) o esperado conta só o pedaço de hoje — às 8h do dia 10
  // espera 9,33/31 da meta, não 10/31 («abaixo do ritmo» logo cedo); sem ele, o dia inteiro como antes
  const parte = fin(fracaoDia) ? Math.min(1, Math.max(0, +fracaoDia)) : 1;
  const fracao = Math.min(1, Math.max(0, ((+dia || 1) - 1 + parte) / Math.max(1, +diasNoMes || 30)));
  const esperado = m * fracao;
  const estado = r >= m ? "batida" : r >= esperado ? "frente" : r >= esperado * 0.85 ? "ritmo" : "atras";
  return { meta: m, realizado: r, pct: Math.min(100, r / m * 100), pctReal: r / m * 100, esperado, ritmoPct: Math.min(100, fracao * 100), falta: Math.max(0, m - r), estado };
}
/** plano 2000d · DR-250: quanto do dia de hoje (em São Paulo) já passou, 0–1 — 08:00 → 0,333. */
const FMT_HM = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function fracaoDoDiaSP(agora = Date.now()) {
  const t = new Date(agora);
  if (!Number.isFinite(t.getTime())) return 1;
  const [hh, mm] = FMT_HM.format(t).split(":").map(Number);
  return Math.min(1, Math.max(0, ((hh % 24) * 60 + (mm || 0)) / 1440));
}
/**
 * plano 2000d · DR-301/DR-322: «se continuar assim» — o realizado até agora no ritmo dos dias que já passaram, levado ao mês inteiro.
 * projecaoMes({realizado: 12000, dia: 10, diasNoMes: 30, fracaoDia: 1}) → {valor: 36000, base: 10}. null sem dia ou sem nada realizado.
 * Nos 2 primeiros dias (pouca base) volta com `fraca: true` — a tela diz que é cedo para projetar.
 */
export function projecaoMes({ realizado, dia, diasNoMes, fracaoDia = 1 } = {}) {
  const r = +realizado, d = +dia, n = +diasNoMes;
  if (!(r > 0) || !(d >= 1) || !(n >= 28)) return null;
  const base = Math.max(0.25, d - 1 + (fin(fracaoDia) ? Math.min(1, Math.max(0, +fracaoDia)) : 1));
  return { valor: Math.round(r / base * n), base, fraca: d <= 2 };
}
/** plano 2000d · DR-322: a frase da projeção contra a meta — «Se continuar assim, fecha o mês em R$ 36.000: bate a meta.» */
export function textoProjecao(proj, meta = null, fmt = v => String(Math.round(v))) {
  if (!proj) return "";
  if (proj.fraca) return "Ainda é cedo para projetar o mês (poucos dias de dados).";
  const base = `Se continuar assim, fecha o mês em ${fmt(proj.valor)}`;
  if (!(+meta > 0)) return `${base}.`;
  return proj.valor >= +meta ? `${base}: bate a meta.` : `${base}: faltariam ${fmt(+meta - proj.valor)} para a meta.`;
}
/** plano 2000d · DR-299: a meta em uma linha curta para o celular — «Faltam R$ 5.000 · abaixo do ritmo». */
export function textoMetaCurto(p, fmt = v => String(Math.round(v))) {
  if (!p) return "";
  if (p.estado === "batida") return `Meta batida · ${pct(p.pctReal)}`;
  const ritmo = p.estado === "frente" ? "à frente do ritmo" : p.estado === "ritmo" ? "perto do ritmo" : "abaixo do ritmo";
  return `${p.falta === 1 ? "Falta" : "Faltam"} ${fmt(p.falta)} · ${ritmo}`;
}
/**
 * plano 2000d · DR-399: a reta final — nos últimos 3 dias do mês, com meta de vendas ainda não batida → {falta, dias, texto}; senão null.
 */
export function retaFinal({ meta, realizado, dia, diasNoMes } = {}, fmt = v => String(Math.round(v))) {
  const m = +meta, r = Math.max(0, +realizado || 0), d = +dia, n = +diasNoMes;
  if (!(m > 0) || !(d >= 1) || !(n >= 28) || r >= m) return null;
  const dias = n - d + 1;      // hoje conta
  if (dias > 3) return null;
  return { falta: m - r, dias, texto: `Reta final: faltam ${fmt(m - r)} para a meta e ${dias === 1 ? "hoje é o último dia" : `restam ${dias} dias`} do mês.` };
}
/**
 * A meta de consultas conta o que JÁ aconteceu: início até `agora`, sem canceladas nem faltas (marco «faltou»); as que ainda vão
 * acontecer no mês ficam à parte — agenda cheia no fim do mês não é «à frente do ritmo» no dia 4.
 * contagemConsultasMes(agendaMes, {agora}) → null sem agenda do mês; {realizadas, marcadas (futuras), faltas}
 */
export function contagemConsultasMes(agendaMes, { agora = Date.now() } = {}) {
  const lista = listaConsultas(agendaMes);
  if (!lista) return null;
  // plano 1000 (CR-157): falta é o marco «faltou» OU a presença marcada «Faltou» (plano 100: num funil sem etapa «Faltou» a consulta continuava
  // contando como realizada); «compareceu» vem à parte (das realizadas, quantas tiveram a presença confirmada)
  const r = { realizadas: 0, marcadas: 0, faltas: 0, compareceu: 0 };
  for (const c of lista) {
    const ini = Date.parse(c.inicio);
    if (!Number.isFinite(ini)) continue;
    const presenca = c.presenca || (c.campos && c.campos.presenca) || null;
    if (ini > agora) r.marcadas++;
    else if (c.marco === "faltou" || presenca === "faltou") r.faltas++;
    else { r.realizadas++; if (presenca === "compareceu") r.compareceu++; }
  }
  return r;
}
/** O texto honesto da meta: quanto falta e se está à frente, perto ou abaixo do ritmo do calendário. `fmt` formata (R$ ou inteiro). */
export function textoMeta(p, { fmt = v => String(Math.round(v)), dia = null, diasNoMes = null } = {}) {
  if (!p) return "";
  const pc = pct(p.pctReal);       // plano 1000b · RB-158
  if (p.estado === "batida") return `Meta batida: ${fmt(p.realizado)} de ${fmt(p.meta)} (${pc}).`;
  const base = `${fmt(p.realizado)} de ${fmt(p.meta)} (${pc}). ${p.falta === 1 ? "Falta" : "Faltam"} ${fmt(p.falta)}`;     // plano 1500c · RC-181
  const ritmo = dia && diasNoMes ? `; no dia ${dia} de ${diasNoMes} o esperado seria ${fmt(p.esperado)}` : "";
  const frase = p.estado === "frente" ? "você está à frente do ritmo" : p.estado === "ritmo" ? "está perto do ritmo" : "está abaixo do ritmo";
  return `${base} — ${frase}${ritmo}.`;
}
/**
 * plano 1000b · RB-172: o que foi digitado nas metas → {vendas, consultas, erros: {meta_vendas?, meta_consultas?}}. Campo vazio = sem meta;
 * zero ou negativo é erro no campo («-5» virava «Metas retiradas» sem explicar). `lerMoeda` = ui.lerMoeda.
 */
/**
 * plano 2000d · DR-251: o leitor de dinheiro padrão (sem o crm-logica carregado) — «1.500» = 1500, «1.234,56» = 1234,56, «1,234.56» = 1234,56,
 * «R$ 10.000» = 10000, «2,5» = 2,5. Antes o padrão só trocava a vírgula e «1.500» virava 1,5. Texto sem número → NaN.
 */
export function lerValorBr(txt) {
  let s = String(txt ?? "").replace(/R\$|\s/gi, "").trim();
  if (!s || !/\d/.test(s)) return NaN;
  const neg = /^[-−]/.test(s);
  s = s.replace(/^[-−+]/, "");
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const ultV = s.lastIndexOf(","), ultP = s.lastIndexOf(".");
  let n;
  if (ultV >= 0 && ultP >= 0) n = ultV > ultP ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  else if (ultV >= 0) n = (s.match(/,/g) || []).length > 1 ? Number(s.replace(/,/g, "")) : Number(s.replace(",", "."));
  else if (ultP >= 0) n = (s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s);
  else n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}
const inteiroMeta = txt => {
  // plano 2000d · IY-032: «1 000» (milhar com espaço, como muita gente digita) = 1000 — antes era erro
  const t = String(txt ?? "").trim().replace(/^(\d{1,3})((?:\s\d{3})+)$/, (_, a, b) => a + b.replace(/\s/g, ""));
  const limpo = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  return { limpo, n: t ? (/^\d+$/.test(limpo) ? Number(limpo) : NaN) : null };
};
/** plano 2000d · IY-031: o teto de uma meta do mês (R$ 1 bilhão; 100 mil consultas ou leads). */
export const LIMITE_META = Object.freeze({ vendas: 1e9, contagem: 1e5 });
export function validarMetas({ vendas = "", consultas = "", leads = "" } = {}, lerMoeda = lerValorBr) {
  const erros = {}, ERRO = "Use um número maior que zero.";
  const vTxt = String(vendas ?? "").trim(), cTxt = String(consultas ?? "").trim();
  const v = vTxt ? lerMoeda(vTxt) : null;
  // plano 1500c · RC-180: consultas são inteiras — «1.000» (milhar) = 1000 (antes virava 1) e «2,5»/«1.5» é erro (antes arredondava calado)
  const { limpo: cLimpo, n: c } = inteiroMeta(cTxt);
  if (vTxt && !(Number.isFinite(v) && v > 0)) erros.meta_vendas = ERRO;
  if (cTxt && !(Number.isFinite(c) && c > 0)) erros.meta_consultas = /[.,]/.test(cLimpo) && /\d/.test(cLimpo) ? "Use um número inteiro maior que zero." : ERRO;
  // plano 2000d · DR-298: meta de leads do mês (inteira, como as consultas)
  const lTxt = String(leads ?? "").trim();
  const { limpo: lLimpo, n: ld } = inteiroMeta(lTxt);
  if (lTxt && !(Number.isFinite(ld) && ld > 0)) erros.meta_leads = /[.,]/.test(lLimpo) && /\d/.test(lLimpo) ? "Use um número inteiro maior que zero." : ERRO;
  // plano 2000d · IY-031: um zero a mais (R$ 3.000.000.000, 50.000 consultas) é erro de digitação — o campo avisa em vez de guardar a meta absurda
  const ALTO = "Confira o valor: parece alto demais para uma meta do mês.";
  if (!erros.meta_vendas && v > LIMITE_META.vendas) erros.meta_vendas = ALTO;
  if (!erros.meta_consultas && c > LIMITE_META.contagem) erros.meta_consultas = ALTO;
  if (!erros.meta_leads && ld > LIMITE_META.contagem) erros.meta_leads = ALTO;
  return { vendas: !erros.meta_vendas && v > 0 ? v : null, consultas: !erros.meta_consultas && c > 0 ? c : null, leads: !erros.meta_leads && ld > 0 ? ld : null, erros };
}
/** plano 1000b · RB-160: a linha do «Atendimento agora» — um só: «Paciente esperando há 40 min»; vários: «A mais antiga espera há 40 min» (como no «Agora»). */
export function fraseEspera(aguardando, esperaTxt, { contato = "cliente" } = {}) {
  return Number(aguardando) === 1 ? `${cap(contato)} esperando há ${esperaTxt}` : `A mais antiga espera há ${esperaTxt}`;
}
/** plano 1000b · RB-243: o nome do botão «Sem responsável · N» diz o que ele faz. */
export function rotuloSemDono(n) {
  const q = Math.max(0, Math.floor(+n) || 0);
  return q === 1 ? "Ver a conversa sem responsável para assumir" : `Ver as ${q} conversas sem responsável para assumir`;
}
/**
 * plano 1500c · RC-210: o que identifica uma leitura para saber se a tela precisa mudar — com nx_inicio.versao (hash/versão do servidor), a versão
 * e o resto pequeno (agenda, checklist); sem ela, a resposta inteira serializada como antes. `contar` (teste) conta as serializações grandes.
 */
export function assinaturaInicio(d, resto = {}, contar = null) {
  if (d && (typeof d.versao === "string" || typeof d.versao === "number") && String(d.versao)) return `v:${d.versao}|${JSON.stringify(resto)}`;
  if (typeof contar === "function") contar();
  return JSON.stringify({ ...d, agora: null, ...resto });
}
/**
 * plano 1500c · IC-002: os primeiros passos do cliente novo, só do que o plano libera — WhatsApp (conversas), anúncios (ads) e agenda (crm).
 * `feito(ids)` diz pelo checklist do servidor se o passo está pronto; `rota` só para quem consegue abrir a seção (admin + podeSecao).
 * → [{id, rotulo, botao, ajuda, feito, rota|null}]
 */
export function guiaPrimeiroUso({ admin = false, podeSecao = () => true, temModulo = () => true, feito = () => false, infoPassos = null, objetivo = null, ordenar = null, vertical = null, conhece = () => true } = {}) {
  // plano 2000d · DR-263/264: os passos novos só entram quando o checklist do servidor conhece o item (senão nunca ficariam prontos)
  const sabe = id => { try { return typeof conhece !== "function" || !!conhece(id); } catch { return true; } };
  const tem = m => { try { return typeof temModulo === "function" ? !!temModulo(m) : true; } catch { return false; } };
  const abre = id => { try { return !!admin && (typeof podeSecao !== "function" || !!podeSecao({ id })); } catch { return false; } };
  // plano 2000d · DU-236: «~3 min» ao lado de cada passo (rotas.PASSOS_INFO; o id do guia → o id da tabela)
  const tempo = id => { const i = infoPassos && infoPassos[{ whatsapp: "whatsapp", agenda: "agenda", contatos: "contatos", funil: "funil" }[id]]; return i && i.min ? `~${i.min} min` : ""; };
  const out = [];
  if (tem("conversas")) out.push({ id: "whatsapp", rotulo: "Conectar o WhatsApp", botao: "Conectar o WhatsApp", ajuda: "As mensagens dos clientes chegam aqui e a equipe responde sem trocar de celular.",
    feito: !!feito(["chave_codewords", "aparelho_pareado", "recebimento"]), rota: abre("chave_codewords") ? "#/config/numeros?assistente=novo" : null });
  // plano 2000d · DR-263: «Trazer seus clientes» (importar a planilha) — o passo que faz o Início ter números já no 1º dia
  if (tem("crm") && sabe("contatos_importados")) out.push({ id: "contatos", rotulo: "Trazer seus clientes", botao: "Importar planilha", ajuda: "Importe a lista que você já tem (Excel ou CSV): o funil e os aniversários começam com gente de verdade.",
    feito: !!feito(["contatos_importados"]), rota: admin ? "#/crm?importar=1" : null });
  if (tem("ads")) out.push({ id: "anuncios", rotulo: "Ligar os anúncios", botao: "Ligar Meta e Google", ajuda: "Para o Início mostrar quanto cada R$ 1 investido voltou em vendas.",
    feito: !!feito(["anuncios_ligados"]), rota: abre("anuncios_ligados") ? "#/config/anuncios" : null });
  if (tem("crm")) out.push({ id: "agenda", rotulo: "Configurar a agenda", botao: "Configurar a agenda", ajuda: "Os horários de atendimento: o Início mostra as consultas do dia e quem está chegando.",
    feito: !!feito(["agenda_faixas"]), rota: abre("agenda_faixas") ? "#/config/agenda" : null });
  // plano 2000d · DR-264: o funil do negócio (etapas com o modelo da vertical) — cliente novo não sabe que pode ajustar
  const modelo = { odonto: "avaliação → orçamento → tratamento", oficina: "diagnóstico → orçamento → serviço", loja: "interesse → proposta → venda" }[vertical] || "contato → proposta → venda";
  if (tem("crm") && sabe("funil_ajustado")) out.push({ id: "funil", rotulo: "Ajustar o funil do seu negócio", botao: "Ajustar o funil", ajuda: `As etapas por onde cada cliente passa — já vem um modelo (${modelo}).`,
    feito: !!feito(["funil_ajustado"]), rota: abre("funil_ajustado") ? "#/config/funil" : null });
  for (const p of out) p.tempo = tempo(p.id);
  // plano 2000d · DU-242: o objetivo das boas-vindas põe os passos dele primeiro (rotas.passosPorObjetivo)
  if (objetivo && typeof ordenar === "function") { try { const o = ordenar(out, objetivo); if (Array.isArray(o) && o.length === out.length) return o; } catch { /* ordem padrão */ } }
  return out;
}
/**
 * plano 1500c · IC-010/IC-011: o progresso dos primeiros passos — quantos prontos, a % da barra e a frase.
 * Todos prontos → a frase diz que falta só o primeiro movimento chegar (antes ficava «3 de 3 prontos» e a tela parecia travada).
 */
export function progressoGuia(passos) {
  const l = Array.isArray(passos) ? passos : [];
  const feitos = l.filter(p => p && p.feito).length, total = l.length;
  const todos = total > 0 && feitos === total;
  return { feitos, total, pct: total ? Math.round(feitos / total * 100) : 0, todos,
    texto: todos ? "Tudo ligado. Os números aparecem aqui assim que chegar a primeira conversa ou venda." : `${feitos} de ${total} prontos` };
}
/** plano 1500c · IC-015: «Um passo», «Dois passos», «Três passos» — sem passo nenhum liberado no plano, não promete «Três passos». */
export function textoQuantosPassos(n) {
  const nomes = ["", "Um passo", "Dois passos", "Três passos", "Quatro passos", "Cinco passos"];     // plano 2000d · DR-263/DR-264: o guia tem até 5
  return nomes[n] || (n > 5 ? `${n} passos` : "Alguns ajustes");
}
/**
 * plano 2000d · DR-125: quantas tarefas abertas estão SEM prazo — tarefas.sem_prazo quando o servidor manda; sem ele, as da lista «próximas»
 * sem vence_em (então «pelo menos» N, porque a lista vem cortada). null quando não há nenhuma conhecida. → {n, pelomenos}
 */
export function tarefasSemPrazo(t) {
  if (!t || typeof t !== "object") return null;
  if (fin(t.sem_prazo)) { const n = Math.max(0, Math.round(+t.sem_prazo)); return n ? { n, pelomenos: false } : null; }
  const l = Array.isArray(t.proximas) ? t.proximas.filter(x => x && !x.vence_em) : [];
  return l.length ? { n: l.length, pelomenos: Array.isArray(t.proximas) && fin(t.abertas) && +t.abertas > t.proximas.length } : null;
}
/** plano 1500c · RC-193: as atrasadas primeiro (a mais antiga no topo), depois as outras na ordem do servidor — sem depender de o servidor ordenar. */
export function ordenarTarefas(lista) {
  const l = Array.isArray(lista) ? lista.filter(Boolean) : [];
  const t = x => { const v = Date.parse(x.vence_em || ""); return Number.isFinite(v) ? v : Infinity; };
  const atr = l.filter(x => x.atrasada).sort((a, b) => t(a) - t(b));
  return [...atr, ...l.filter(x => !x.atrasada)];
}
/**
 * plano 1500c · RC-192: o novo vencimento de «Amanhã» — amanhã (SP) na mesma hora (09:00 sem prazo); nunca antes de vence_em + 1 dia.
 * A mesma regra de crm-logica.adiarParaAmanha (o Início não baixa o crm-logica inteiro para isso). → ISO
 */
/**
 * plano 2000d · DR-337: o deslocamento do fuso em minutos naquele instante, pelas regras do Intl (−180 em São Paulo hoje; volta sozinho
 * a −120 se o horário de verão voltar). Antes −3 h fixo.
 */
export function deslocamentoFuso(ms, fuso = FUSO) {
  const t = new Date(ms);
  if (!Number.isFinite(t.getTime())) return -180;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(t).map(x => [x.type, x.value]));
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((comoUtc - Math.floor(t.getTime() / 1000) * 1000) / 60000);
  } catch { return -180; }
}
export function adiarParaAmanha(venceEm, agora = new Date(), { fuso = FUSO } = {}) {
  const DIA = 86400000;
  // plano 2000d · DR-337: o fuso pelas regras do Intl (sem −03:00 fixo)
  const local = ms => new Date(ms + deslocamentoFuso(ms, fuso) * 60000).toISOString();
  const atual = venceEm ? Date.parse(venceEm) : NaN;
  const hhmm = Number.isFinite(atual) ? local(atual).slice(11, 16) : "09:00";
  const dia = local(new Date(agora).getTime() + DIA).slice(0, 10);
  const [hh, mi] = hhmm.split(":").map(Number);
  const [a, m, d] = dia.split("-").map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, hh, mi);
  let alvo = ingenuo - deslocamentoFuso(ingenuo, fuso) * 60000;
  alvo = ingenuo - deslocamentoFuso(alvo, fuso) * 60000;      // a hora local pedida, com o deslocamento do próprio dia (troca de horário)
  if (Number.isFinite(atual) && atual + DIA > alvo) alvo = atual + DIA;
  return new Date(alvo).toISOString();
}
/** plano 1500c · RC-196: a diferença em reais deste mês × o mesmo pedaço do mês passado («+R$ 3.200», «−R$ 800», «igual»); "" sem os dois números. */
export function textoDiferenca(atual, anterior, fmt = v => String(Math.round(v))) {
  if (!fin(atual) || !fin(anterior)) return "";
  const dif = Math.round(+atual - +anterior);
  if (!dif) return `igual: ${fmt(Math.round(+atual))} nos dois períodos`;     // plano 2000d · DR-296: o valor também quando empata
  return `${dif > 0 ? "+" : "−"}${fmt(Math.abs(dif))} ${dif > 0 ? "a mais" : "a menos"} que no mesmo período`;
}
/**
 * plano 1500c · RC-218: o «Do lead à venda» deste mês × o do mês passado (nx_inicio.funil_mes_anterior {leads, ganhos}) em pontos percentuais.
 * → null sem o campo ou sem leads em um dos meses; {atual, anterior} (0–100). (A função vem logo depois de linksFunilMes.)
 */
export function linksFunilMes(hoje, { crm = false, conversas = false, agenda = false, rel = false } = {}) {
  // plano 1500c · RC-341: para onde cada etapa do funil do mês leva (só o que a pessoa pode abrir) — leads desde o dia 1, conversas, agenda, vendas
  const dia1 = primeiroDiaMes(hoje);
  const out = {};
  if (crm) out.leads = `#/contatos?criado_de=${dia1}`;
  if (conversas) out.conversas = "#/conversas?aba=abertas";
  if (agenda) out.agendados = `#/agenda?dia=${String(hoje).slice(0, 10)}`;
  if (rel) out.ganhos = "#/relatorios/vendas"; else if (crm) out.ganhos = "#/crm";
  return out;
}
/** plano 1500c · RC-218: chip de uma taxa contra outra em pontos percentuais — {v, txt: "29 p.p.", cls: bom|ruim|neutro, seta}. */
export function chipPontos(atual, anterior) {
  const v = Math.round(+atual - +anterior);
  if (!Number.isFinite(v)) return { v: null, txt: "sem base", cls: "neutro", seta: "" };
  return { v, txt: `${Math.abs(v)} p.p.`, cls: v > 0 ? "bom" : v < 0 ? "ruim" : "neutro", seta: v > 0 ? "▲" : v < 0 ? "▼" : "→" };
}
export function funilComparado(d) {
  const a = d && d.funil_mes, b = d && d.funil_mes_anterior;
  if (!a || !b || typeof b !== "object") return null;
  const taxa = f => (fin(f.leads) && +f.leads > 0 && fin(f.ganhos) ? Math.max(0, +f.ganhos) / +f.leads * 100 : null);
  const atual = taxa(a), anterior = taxa(b);
  return atual === null || anterior === null ? null : { atual, anterior };
}
/** plano 1500c · RC-232: o ponto de partida da meta de vendas — o mês passado inteiro e +10% (arredondado a R$ 100). null sem o número. */
export function sugestaoMetaVendas(n) {
  const v = n && fin(n.receita_mes_anterior) ? +n.receita_mes_anterior : null;
  return v && v > 0 ? { mesPassado: v, mais10: Math.ceil(v * 1.1 / 100) * 100 } : null;
}
/** plano 2000d · DR-297: de onde vem a sugestão — «Mês passado: R$ 27.500 + 10% = R$ 30.300.» */
export function textoSugestaoMeta(sug, fmt = v => `R$ ${Math.round(v)}`) {
  return sug ? `Mês passado: ${fmt(sug.mesPassado)} + 10% = ${fmt(sug.mais10)}.` : "";
}
/** plano 1500c · RC-299: a mesma escrita de espera nos três lugares da tela (KPI, «Atendimento agora» e a fila do «Agora»). */
export const textoEspera = min => duracaoCurta(min);
/** plano 1500c · RC-183: a nota do bloco Leads sem «1 dos 1 leads … vieram». */
export function notaLeadsAnuncio(semana, anuncio) {
  // plano 2000d · IY-024: o servidor contando anúncio a mais que o total (fusos/atraso) não vira «7 dos 5 leads»: o anúncio para no total
  const s = Math.max(0, Math.round(+semana || 0)), a = Math.min(s, Math.max(0, Math.round(+anuncio || 0)));
  if (s === 1) return a ? "O lead dos últimos 7 dias veio de anúncio." : "O lead dos últimos 7 dias não veio de anúncio.";
  return `${a} dos ${s} leads criados nos últimos 7 dias ${a === 1 ? "veio" : "vieram"} de anúncio.`;
}
/**
 * plano 1500c · RC-215: a frase dos agendados sem data com o termo explícito — «2 oportunidades em Agendou sem data» (a etapa quando todos estão
 * na mesma), senão «… na etapa de agendamento sem data». Sem gênero adivinhado.
 */
export function fraseSemData(sd, voc = {}) {
  const n = Math.max(0, Math.round(+(sd && sd.total) || 0));
  const termo = n === 1 ? (voc.negocio || "negócio") : (voc.negocios || "negócios");
  const etapas = [...new Set(((sd && sd.itens) || []).map(x => x && x.etapa).filter(Boolean))];
  return `${n} ${termo} ${etapas.length === 1 ? `em ${etapas[0]}` : "na etapa de agendamento"} sem data`;
}
/** plano 1500c · RC-233: os leads de anúncio da semana por plataforma (leads.semana_meta / semana_google); null sem os dois campos. */
export function divisaoPlataformas(l) {
  if (!l || !fin(l.semana_meta) || !fin(l.semana_google)) return null;
  return { meta: Math.max(0, Math.round(+l.semana_meta)), google: Math.max(0, Math.round(+l.semana_google)) };
}
/** plano 1500c · RC-183: o rótulo da barra de origem («1 de 1 lead veio de anúncio»). */
export function rotuloOrigem(total, anuncio, pctAn) {
  const t = Math.max(1, Math.round(+total || 0)), a = Math.min(t, Math.max(0, Math.round(+anuncio || 0)));     // plano 2000d · IY-024
  return `${a} de ${t} ${t === 1 ? "lead" : "leads"} ${a === 1 ? "veio" : "vieram"} de anúncio (${Math.min(100, Math.max(0, Math.round(+pctAn || 0)))}%)`;
}
/**
 * plano 2000d · IY-025: as fatias da barra de origem, sempre somando 100% — anúncio (ou Meta e Google) limitado ao total; a sobra é «outras
 * origens» (nunca negativa). → {anuncio, pAn, pMeta, pGoogle, pOutras, total, plataformas: bool}
 */
export function partesOrigem(l) {
  const total = Math.max(1, Math.round(+(l && l.semana) || 0));
  const an = Math.min(total, Math.max(0, Math.round(+(l && l.semana_anuncio) || 0)));
  const pl = divisaoPlataformas(l);
  if (pl) {
    const soma = pl.meta + pl.google, k = soma > total ? total / soma : 1;
    const pMeta = Math.round(pl.meta * k / total * 100), pGoogle = Math.min(100 - pMeta, Math.round(pl.google * k / total * 100));
    return { total, anuncio: an, pAn: pMeta + pGoogle, pMeta, pGoogle, pOutras: Math.max(0, 100 - pMeta - pGoogle), plataformas: true, meta: pl.meta, google: pl.google };
  }
  const pAn = Math.round(an / total * 100);
  return { total, anuncio: an, pAn, pMeta: 0, pGoogle: 0, pOutras: 100 - pAn, plataformas: false };
}
/**
 * plano 1500c · RC-202: a consulta de AMANHÃ ainda não confirmada pelo paciente? Só quando a agenda manda `confirmacao` (null/"pendente"/false =
 * não confirmada; "confirmada"/true = ok). Sem o campo → false (nada inventado).
 */
export function precisaConfirmar(c, amanha) {
  if (!c || !("confirmacao" in c) || (c.dia || diaSP(c.inicio)) !== amanha) return false;
  const v = c.confirmacao;
  return !(v === true || /^(confirmad|sim|ok)/i.test(String(v ?? "")));
}
/** plano 1500c · RC-211: a tecla vale para a tela? Não quando o foco está num campo (input, textarea, select, editável) ou há janela/diálogo aberto. */
export function teclaLivre(alvo, doc = typeof document !== "undefined" ? document : null) {
  const el = alvo && alvo.nodeType === 1 ? alvo : null;
  if (el) {
    const tag = String(el.localName || el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return false;
    // plano 2000d · IY-036: contenteditable="" (vazio) e "plaintext-only" também editam — antes só "true" bloqueava a tecla
    const ce = typeof el.getAttribute === "function" ? el.getAttribute("contenteditable") : null;
    if (el.isContentEditable || (ce !== null && ce !== "false")) return false;
    // plano 2000d · IY-037: campos de digitar feitos à mão (role textbox/combobox/searchbox/spinbutton) também
    const papel = typeof el.getAttribute === "function" ? String(el.getAttribute("role") || "").toLowerCase() : "";
    if (/^(textbox|combobox|searchbox|spinbutton)$/.test(papel)) return false;
    if (typeof el.closest === "function" && el.closest("dialog, [role=dialog], .flut")) return false;
  }
  try { if (doc && typeof doc.querySelector === "function" && doc.querySelector("dialog[open]")) return false; } catch { /* ok */ }
  return true;
}
/** plano 1500c · RC-235: «vs. ontem» quando o dia de comparação é ontem; senão «vs. dd/mm». */
export function rotuloContraDia(dia, hoje) {
  if (!dia) return "";
  if (hoje && String(dia).slice(0, 10) === somarDiasIso(hoje, -1)) return "vs. ontem";
  const [, m, dd] = String(dia).slice(0, 10).split("-");
  return dd ? `vs. ${dd}/${m}` : "";
}
/**
 * plano 2000d · IY-041: as palavras que concordam com a palavra da agenda — feminina (consulta, visita, entrega) ou masculina (atendimento,
 * horário). textosGeneroAgenda(false).nenhuma → «Nenhum».
 */
export function textosGeneroAgenda(fem = true) {
  return fem ? { nenhuma: "Nenhuma", marcada: "marcada", a: "a", as: "as", proximas: "Próximas", realizadas: "realizadas" }
    : { nenhuma: "Nenhum", marcada: "marcado", a: "o", as: "os", proximas: "Próximos", realizadas: "realizados" };
}
/** plano 1500c · RC-300: o nome do botão da consulta — «Abrir a consulta de Maria, às 14:00» (antes «Abrir Maria das 14:00»). */
export function rotuloAbrirConsulta(nome, hora, palavra = "consulta", { agenda = false, fem = true } = {}) {
  const quem = String(nome || "").trim();
  // plano 2000d · IY-038: o artigo concorda com a palavra da agenda da empresa («o atendimento», «a consulta»)
  return `${agenda ? "Ver na agenda" : "Abrir"} ${fem ? "a" : "o"} ${palavra}${quem ? ` de ${quem}` : ""}, às ${hora}`;
}
/**
 * plano 1500c · RC-229: um Início de EXEMPLO para quem ainda não tem dados (só na tela, nada é gravado): números redondos de uma clínica
 * pequena, datas relativas a `hoje`. → {d (formato de nx_inicio, com exemplo: true), agenda (formato de nx_agenda_dia)}
 */
// plano 1500c · IC-020: os serviços e tarefas do exemplo falam a língua do negócio (clínica, oficina, loja, outro)
// plano 2000d · DR-267: os valores também mudam pela vertical — k multiplica o dinheiro (ticket de oficina e loja é menor que o de implante),
// q multiplica as contagens (loja tem mais leads e vendas pequenas); a clínica fica com os números de sempre (k = q = 1)
const EXEMPLO_VERTICAL = Object.freeze({
  odonto: { s: ["Avaliação", "Implante", "Limpeza", "Clareamento"], t1: "Ligar para confirmar avaliação", t2: "Enviar orçamento do implante", k: 1, q: 1, venda: ["Implante", "Clareamento", "Alinhador"] },
  oficina: { s: ["Revisão", "Troca de pastilhas", "Alinhamento", "Diagnóstico"], t1: "Ligar para aprovar o orçamento", t2: "Avisar que o carro está pronto", k: 0.55, q: 1.1, venda: ["Revisão completa", "Embreagem", "Suspensão"] },
  loja: { s: ["Retirada", "Entrega", "Troca", "Montagem"], t1: "Confirmar endereço de entrega", t2: "Mandar foto do produto", k: 0.4, q: 2, venda: ["Sofá retrátil", "Mesa de jantar", "Colchão"] },
  generico: { s: ["Reunião", "Visita", "Atendimento", "Retorno"], t1: "Ligar para o cliente", t2: "Enviar a proposta", k: 0.8, q: 1, venda: ["Plano anual", "Projeto", "Consultoria"] },
});
export function dadosExemplo(hoje, agora = Date.now(), { vertical = "odonto" } = {}) {
  const dia = String(hoje || "").slice(0, 10) || diaSP(new Date(agora));
  const X = EXEMPLO_VERTICAL[vertical] || EXEMPLO_VERTICAL.generico;
  const R = v => Math.round(v * X.k / 100) * 100, Q = v => Math.max(1, Math.round(v * X.q));     // DR-267
  const em = (dd, hh, mm = 0) => `${somarDiasIso(dia, dd)}T${p2(hh)}:${p2(mm)}:00-03:00`;
  const desde = min => new Date(agora - min * 60000).toISOString();
  const d = {
    exemplo: true, hoje: dia, agora: new Date(agora).toISOString(),
    conversas: { aguardando: 3, sem_dono: 1, minhas: 2, abertas: 14, pendentes: 0, espera_mais_antiga_min: 18, respondidas_no_prazo_pct: 86,
      aguardando_lista: [{ id: "ex-1", nome: "Mariana Costa", espera_min: 18, canal: "codewords" }, { id: "ex-2", nome: "Rafael Mendes", espera_min: 7, canal: "meta" },
        { id: "ex-3", nome: "Ana Paula", espera_min: 2, canal: "codewords" }] },
    tarefas: { hoje: 3, atrasadas: 1, abertas: 6, proximas: [
      { id: "ex-t1", titulo: X.t1, vence_em: em(-1, 16), atrasada: true, contato_nome: "Carla Souza" },
      { id: "ex-t2", titulo: X.t2, vence_em: em(0, 17), atrasada: false, contato_nome: "Rafael Mendes" }] },
    negocios: { abertos: Q(21), valor_aberto: R(48600), previsao_ponderada: R(19400), ganhos_mes: Q(12), receita_mes: R(31800), receita_anuncio_mes: R(21600), receita_mes_anterior: R(27500),
      receita_mes_anterior_parcial: R(22900), dia_do_mes: Number(dia.slice(8, 10)) || 1,
      // plano 2000d · DR-348/DR-402: indicação e o tempo do lead à venda também aparecem no exemplo
      ganhos_indicacao_mes: Q(3), receita_indicacao_mes: R(6400), dias_ate_ganho: 9 },
    leads: { hoje: Q(5), hoje_anuncio: Q(3), semana: Q(34), semana_anuncio: Q(21), primeiro_contato_media_min: 6 },
    // plano 2000d · DR-246: os leads DE ANÚNCIO do mês (o custo por lead divide por eles: R$ 2.400 ÷ 60 = R$ 40)
    funil_mes: { leads: Q(96), conversas: Q(81), agendados: Q(38), ganhos: Q(12), leads_anuncio: Q(60) },
    gasto_anuncios_mes: R(2400),
    // plano 2000d · DR-270: o retorno por plataforma (Meta × Google)
    anuncios: { meta: { gasto: R(1500), receita: R(14400), leads: Q(41) }, google: { gasto: R(900), receita: R(7200), leads: Q(19) } },
    // plano 2000d · DR-328: as últimas vendas que vieram de anúncio, com nome — a prova do retorno
    ultimas_vendas_anuncio: [{ contato_nome: "Mariana Costa", servico: X.venda[0], valor: R(4800), plataforma: "meta", ganho_em: desde(60 * 26) },
      { contato_nome: "Rafael Mendes", servico: X.venda[1], valor: R(2200), plataforma: "google", ganho_em: desde(60 * 50) },
      { contato_nome: "Ana Paula", servico: X.venda[2], valor: R(3600), plataforma: "meta", ganho_em: desde(60 * 75) }],
    canais: [{ id: "ex-c1", nome: "Recepção", numero_exibicao: "+55 12 90000-0000", status: "ativo", estado: "conectado", ultima_entrada_em: desde(4) }],
    notificacoes_nao_lidas: 0,
    // plano 1500c · IC-021: o exemplo mostra também os blocos que dependem do servidor novo (esfriando, equipe, desde o começo, aniversários)
    esfriando: { total: 4, itens: [{ id: "ex-e1", contato_nome: "Paulo Reis", estagio_nome: "Orçamento enviado", parado_dias: 12, valor: R(2400), contato_id: "ex-ce1" },
      { id: "ex-e2", contato_nome: "Lúcia Alves", estagio_nome: "Em conversa", parado_dias: 9, valor: R(1800), contato_id: "ex-ce2" }] },
    // plano 2000d · DR-218/DR-220/DR-353: meta, leads e tarefas de hoje por pessoa
    equipe: [{ conta_id: "ex-a", nome: "Ana", ganhos: Q(7), valor: R(18600), tpr_media_min: 6, meta: R(20000), leads: Q(52), tarefas_hoje: 3 },
      { conta_id: "ex-b", nome: "Bruno", ganhos: Q(5), valor: R(13200), tpr_media_min: 11, meta: R(16000), leads: Q(44), tarefas_hoje: 0 }],
    desde_inicio: { primeiro: { mes: somarDiasIso(`${dia.slice(0, 7)}-01`, -150).slice(0, 7), leads: Q(38), tpr_media_min: 94, receita: R(14200) },
      atual: { mes: dia.slice(0, 7), leads: Q(96), tpr_media_min: 8, receita: R(31800) } },
    aniversariantes: [{ contato_id: "ex-n1", nome: "Helena Prado", conversa_id: null }],
  };
  const agenda = { data: dia, dias: 7, exemplo: true, consultas: [
    { negocio_id: null, nome: "Mariana Costa", servico: X.s[0], status: "aberto", inicio: em(0, 9), fim: em(0, 9, 45) },
    { negocio_id: null, nome: "Rafael Mendes", servico: X.s[1], status: "aberto", inicio: em(0, 14, 30), fim: em(0, 15, 15) },
    { negocio_id: null, nome: "Ana Paula", servico: X.s[2], status: "aberto", inicio: em(0, 16), fim: em(0, 16, 40) },
    { negocio_id: null, nome: "Carla Souza", servico: X.s[3], status: "aberto", inicio: em(1, 10), fim: em(1, 11) },
    { negocio_id: null, nome: "Bruno Lima", servico: X.s[0], status: "aberto", inicio: em(2, 15), fim: em(2, 15, 40) }] };
  return { d, agenda };
}
/**
 * O destaque de venda do Início: «cada R$ 1 em anúncio virou R$ X em vendas» — receita do mês ÷ gasto em anúncios do mês
 * (nx_inicio.gasto_anuncios_mes, quando o servidor manda). null sem gasto ou sem receita: nada é estimado. → {multiplo, receita, gasto}
 * (plano 1500c · IC-001)
 */
/**
 * plano 2000d · IY-071/IY-072: a soma das plataformas (nx_inicio.anuncios {meta, google}) — gasto, receita (só quando TODAS as que gastaram
 * mandam a receita) e leads (idem). null sem o campo ou sem gasto.
 */
export function somaPlataformas(d) {
  const a = d && d.anuncios;
  if (!a || typeof a !== "object") return null;
  const ps = ["meta", "google"].map(k => a[k]).filter(p => p && typeof p === "object" && fin(p.gasto) && +p.gasto > 0);
  if (!ps.length) return null;
  const tudo = k => ps.every(p => fin(p[k]));
  return { gasto: ps.reduce((t, p) => t + +p.gasto, 0), receita: tudo("receita") ? ps.reduce((t, p) => t + Math.max(0, +p.receita), 0) : null,
    leads: tudo("leads") ? ps.reduce((t, p) => t + Math.max(0, Math.round(+p.leads)), 0) : null };
}
export function retornoAnuncios(d) {
  const n = (d && d.negocios) || {};
  // plano 2000d · IY-071: servidor que só manda o retorno por plataforma (anuncios.meta/google, DR-270) — o gasto e a receita de anúncio do
  // mês são a soma das duas (antes o cartão sumia mesmo com os números ali)
  const soma = somaPlataformas(d);
  const gasto = d && fin(d.gasto_anuncios_mes) ? +d.gasto_anuncios_mes : d && d.anuncios && fin(d.anuncios.gasto_mes) ? +d.anuncios.gasto_mes : soma ? soma.gasto : null;
  // a receita que veio DE anúncio (negocios.receita_anuncio_mes) quando o servidor separa; sem ela, a do mês inteiro — e o texto diz qual é
  const recPlat = !fin(n.receita_anuncio_mes) && soma && soma.receita !== null ? soma.receita : null;
  const deAnuncio = fin(n.receita_anuncio_mes) || recPlat !== null;
  const receita = fin(n.receita_anuncio_mes) ? +n.receita_anuncio_mes : recPlat !== null ? recPlat : fin(n.receita_mes) ? +n.receita_mes : null;
  if (!(gasto > 0) || receita === null || receita < 0) return null;
  // plano 1500c · IC-008: gastou e nada voltou ainda — o cartão diz isso (antes sumia, e o dono não via que o dinheiro foi sem retorno)
  if (receita === 0) return { multiplo: 0, receita: 0, gasto, deAnuncio, semVenda: true };
  return { multiplo: receita / gasto, receita, gasto, deAnuncio };
}
/**
 * plano 1500c · IC-006: custo por lead do mês — gasto em anúncios ÷ leads do mês.
 * plano 2000d · DR-246: só os leads QUE VIERAM DE ANÚNCIO (funil_mes.leads_anuncio). Antes dividia por todos os leads do mês (indicação,
 * balcão…) e o CPL saía menor do que é; sem o campo (servidor antigo) não mostra CPL nenhum — nada estimado. null sem os dois.
 */
export function custoPorLead(d) {
  const r = retornoAnuncios(d) || null;
  const gasto = r ? r.gasto : d && fin(d.gasto_anuncios_mes) ? +d.gasto_anuncios_mes : null;
  // plano 2000d · IY-072: sem funil_mes.leads_anuncio, os leads que as plataformas mandam (anuncios.meta/google.leads) — ainda só de anúncio
  const soma = somaPlataformas(d);
  const leads = d && d.funil_mes && fin(d.funil_mes.leads_anuncio) ? +d.funil_mes.leads_anuncio : soma && soma.leads !== null ? soma.leads : null;
  return gasto > 0 && leads > 0 ? gasto / leads : null;
}
/**
 * plano 2000d · DR-248: os textos do cartão de retorno pelo que a receita é. Com a receita DE ANÚNCIO (o servidor separa) → «Cada R$ 1 virou…
 * em vendas que vieram dos anúncios»; sem ela o número é a receita TOTAL ÷ gasto e o cartão diz isso no título (não promete retorno de anúncio).
 */
export function rotuloRetorno(r) {
  if (!r) return null;
  return r.deAnuncio
    ? { olho: "Retorno dos anúncios · mês", inicio: "Cada ", meio: " virou ", frase: "em vendas que vieram dos anúncios", resumo: "Cada R$ 1 em anúncios virou" }
    : { olho: "Receita total ÷ gasto em anúncios · mês", inicio: "A receita do mês foi ", meio: " para cada ", frase: "investido em anúncios (todas as origens de venda)",
      resumo: "Receita total para cada R$ 1 em anúncios", invertido: true };
}
/**
 * plano 2000d · DR-249: começo do mês é pouca base (no dia 2 o múltiplo despenca ou explode) — até o dia 5 o cartão avisa. Com o retorno dos
 * últimos 30 dias (negocios.receita_anuncio_30d + gasto_anuncios_30d, quando o servidor manda) vem também a linha de 30 dias.
 * → {nota|null, ult30: {multiplo, receita, gasto}|null}
 */
export function janelaRetorno(d) {
  const n = (d && d.negocios) || {};
  const dia = fin(n.dia_do_mes) ? +n.dia_do_mes : Number(String((d && d.hoje) || "").slice(8, 10)) || null;
  const nota = dia && dia <= 5 ? `Só ${dia} ${dia === 1 ? "dia" : "dias"} de dados neste mês: o número ainda oscila muito.` : null;
  const g30 = d && fin(d.gasto_anuncios_30d) ? +d.gasto_anuncios_30d : null, r30 = fin(n.receita_anuncio_30d) ? +n.receita_anuncio_30d : null;
  const ult30 = g30 > 0 && r30 !== null && r30 >= 0 ? { multiplo: r30 / g30, receita: r30, gasto: g30 } : null;
  return { nota, ult30 };
}
/** plano 2000d · DR-269: o período do cartão de retorno — «outubro, do dia 1 até hoje (25/10)». */
export function periodoRetorno(hoje) {
  const [a, m, dd] = String(hoje || "").slice(0, 10).split("-");
  const mes = MESES[Number(m) - 1];
  if (!a || !mes || !dd) return "";
  return Number(dd) === 1 ? `${mes}, só hoje (01/${m})` : `${mes}, do dia 1 até hoje (${dd}/${m})`;
}
/**
 * plano 2000d · DR-270: o retorno por plataforma (nx_inicio.anuncios {meta: {gasto, receita}, google: {…}}) — qual dos dois pagou mais.
 * → [{id, nome, gasto, receita, multiplo|null}] (só as que gastaram), a melhor marcada; null sem o campo.
 */
export function retornoPorPlataforma(d) {
  const a = d && d.anuncios;
  if (!a || typeof a !== "object") return null;
  const out = [["meta", "Meta"], ["google", "Google"]].map(([id, nome]) => {
    const p = a[id];
    if (!p || typeof p !== "object" || !fin(p.gasto) || !(+p.gasto > 0)) return null;
    const receita = fin(p.receita) ? Math.max(0, +p.receita) : null;
    return { id, nome, gasto: +p.gasto, receita, multiplo: receita === null ? null : receita / +p.gasto, leads: fin(p.leads) ? Math.max(0, Math.round(+p.leads)) : null };
  }).filter(Boolean);
  if (!out.length) return null;
  const comM = out.filter(x => x.multiplo !== null);
  if (comM.length > 1) { const melhor = comM.reduce((a1, b) => (b.multiplo > a1.multiplo ? b : a1)); if (comM.some(x => x !== melhor && x.multiplo < melhor.multiplo)) melhor.melhor = true; }
  return out;
}
/** plano 2000d · IY-066: «hoje», «ontem», «há 3 dias» (dias de calendário em São Paulo); data no futuro → «hoje». */
export function haQuanto(ms, agora = Date.now()) {
  const a = diaSP(new Date(ms)), b = diaSP(new Date(agora));
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  const dias = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
}
/** plano 2000d · DR-328: as últimas vendas que vieram de anúncio (nx_inicio.ultimas_vendas_anuncio) — até `max`, com nome, serviço, valor e plataforma. */
export function ultimasVendasAnuncio(d, max = 3, agora = Date.now()) {
  const l = d && Array.isArray(d.ultimas_vendas_anuncio) ? d.ultimas_vendas_anuncio : null;
  if (!l) return null;
  // plano 2000d · IY-065: «últimas» = as mais novas primeiro (pelo ganho_em), sem depender da ordem do servidor; sem data, ficam no fim
  // plano 2000d · IY-066: «há 2 dias» de cada venda — a prova do retorno fica concreta na demonstração
  const t = x => { const v = Date.parse(x.ganho_em || ""); return Number.isFinite(v) ? v : -Infinity; };
  const out = l.filter(x => x && (String(x.contato_nome || x.titulo || "").trim()))
    .map((x, i) => ({ x, i })).sort((a, b) => t(b.x) - t(a.x) || a.i - b.i).map(({ x }) => x)
    .map(x => ({ nome: String(x.contato_nome || x.titulo).trim(), servico: String(x.servico || "").trim() || null, valor: fin(x.valor) ? +x.valor : null,
      plataforma: /google/i.test(String(x.plataforma || "")) ? "Google" : /meta|face|insta/i.test(String(x.plataforma || "")) ? "Meta" : null,
      quando: Number.isFinite(t(x)) ? haQuanto(t(x), agora) : null }))
    .slice(0, max);
  return out.length ? out : null;
}
/**
 * plano 1500c · IC-007: a nota honesta debaixo do «cada R$ 1 virou…» — abaixo de R$ 1 o cartão não comemora, diz que o anúncio ainda não se pagou.
 * plano 1500c · IC-008: gastou e não vendeu nada → diz isso com o valor investido. Acima de R$ 1 → null (a frase grande já basta).
 */
export function notaRetorno(r, brl = v => `R$ ${Math.round(v)}`) {
  if (!r) return null;
  if (r.semVenda) return `${brl(r.gasto)} investidos em anúncios este mês e nenhuma venda registrada ainda. Confira se as vendas estão sendo marcadas como ganhas no CRM.`;
  if (r.multiplo < 1) return `Os anúncios ainda não se pagaram este mês: faltam ${brl(r.gasto - r.receita)} para empatar.`;
  return null;
}
/** plano 1500c · IC-005: «Gerado em 25/10 às 14:05» (horário de São Paulo) — o sócio sabe de quando são os números da folha. */
export function textoGeradoEm(agora = Date.now()) {
  const t = new Date(agora);
  if (!Number.isFinite(t.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(t).map(x => [x.type, x.value]));
  return `Gerado em ${p.day}/${p.month} às ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}
/** «R$ 13,25» do «cada R$ 1 virou…»: duas casas abaixo de 10, inteiro arredondado acima (R$ 13). (plano 1500c · IC-001) */
export function textoMultiplo(m) {
  if (!fin(m)) return "—";
  const v = +m >= 10 ? Math.round(+m) : Math.round(+m * 100) / 100;
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v >= 10 ? 0 : 2, maximumFractionDigits: v >= 10 ? 0 : 2 })}`;
}

/**
 * plano 1000 (CR-249): a manchete fica em no máximo `max` trechos (a 360 px passava de 3 linhas) — o que pede ação vem primeiro (quem espera,
 * tarefas atrasadas), depois o contexto (consultas, valor em aberto). O que sai continua nos KPIs logo abaixo. Mantém pendencia/contexto/urgente
 * do original (o selo «Tudo em dia» não muda). Trechos = pedaços separados por « e » dentro de cada frase.
 */
export function encurtarManchete(m, { max = 2, fmtMoeda = v => String(v) } = {}) {
  if (!m || !Array.isArray(m.frases)) return m;
  const frases = m.frases.map(f => {
    const unidades = [[]];
    for (const no of f) {
      if (no && no.t === "txt" && no.v === " e ") { unidades.push([]); continue; }
      if (no && no.t === "txt" && no.v === ".") continue;
      unidades[unidades.length - 1].push(no);
    }
    return unidades.filter(u => u.length);
  });
  const total = frases.reduce((s, u) => s + u.length, 0);
  if (total <= max) return m;
  // plano 2000d · DR-285: o que pede ação (a 1ª frase quando m.urgente) nunca é cortado — só o contexto sai por falta de espaço
  let resta = m.urgente && frases[0] ? Math.max(max, frases[0].length) : max;
  const novas = [];
  for (const us of frases) {
    if (resta <= 0) break;
    const pega = us.slice(0, resta);
    resta -= pega.length;
    const f = [];
    pega.forEach((u, i) => { if (i) f.push({ t: "txt", v: " e " }); f.push(...u); });
    f.push({ t: "txt", v: "." });
    novas.push(f);
  }
  const achatar = no => (no.t === "txt" ? no.v : no.partes.map(p => (p.t === "moeda" ? fmtMoeda(p.v) : p.v)).join(""));
  return { ...m, frases: novas, texto: novas.map(f => f.map(achatar).join("")).join(" "), encurtada: true };
}

/**
 * plano 1000 (CR-255): as preferências locais do Início (histórico, indicadores, blocos) de empresas que NÃO estão mais na sessão desta conta
 * → as chaves a apagar. Só as desta conta (outra pessoa no mesmo aparelho limpa as dela ao entrar). Sem a lista de empresas, nada.
 */
export function chavesInicioOrfas(chaves, { clientes = null, conta = "-" } = {}) {
  if (!Array.isArray(clientes) || !clientes.length) return [];
  const validos = new Set(clientes.map(c => String(c && c.id != null ? c.id : c)));
  // plano 1500c · RC-184: o checklist (nx-onb:<cliente>:<conta>) também sai; as metas (nx-ini-metas:<cliente>, por empresa) só quando
  // nenhuma OUTRA conta deste aparelho ainda guarda algo da empresa (a meta é de quem divide o aparelho)
  // plano 2000d · IY-028: a foto da última visita (nx-ini-visita, DR-398) também sai com a empresa que a conta perdeu
  const re = /^(?:nx-ini-(?:hist|kpis|blocos|visita)|nx-onb):([^:]+):([^:]+)$/, reMeta = /^nx-ini-metas:([^:]+)$/;
  const lista = (chaves || []).map(k => String(k || ""));
  const deOutraConta = new Set();
  for (const k of lista) { const m = re.exec(k); if (m && m[2] !== String(conta)) deOutraConta.add(m[1]); }
  return lista.filter(k => {
    const m = re.exec(k);
    if (m) return m[2] === String(conta) && !validos.has(m[1]);
    const mm = reMeta.exec(k);
    return !!mm && !validos.has(mm[1]) && !deOutraConta.has(mm[1]);
  });
}

/* ---------------- plano 2000d · frente inicio (pedaços puros novos) ---------------- */
/**
 * plano 2000d · DR-271 + DU-242: a ordem PADRÃO dos blocos (antes da ordem que a pessoa guardou). Quem administra abre o Início para ver o mês:
 * vendas, metas e funil primeiro; a recepção (sem admin) começa pela operação («Agora», atendimento, tarefas). Com o objetivo das boas-vindas
 * (rotas.ordemDoInicio por área), as áreas do objetivo vêm antes. → [ids de BLOCOS_INICIO]
 */
const AREA_DO_BLOCO = Object.freeze({ agora: "conversas", atendimento: "conversas", tarefas: "tarefas", esfriando: "crm", numeros: "conversas", vendas: "crm",
  funil: "crm", desde: "relatorios", horas: "agenda", metas: "relatorios", leads: "anuncios", equipe: "relatorios" });
export function ordemPadraoBlocos({ admin = false, objetivo = null, ordemDoInicio = null, urgente = false } = {}) {
  // com alguém esperando resposta (`urgente`), o «Agora» continua na frente também para o dono (o que pede ação vem antes do mês)
  const base = admin
    ? (urgente ? ["agora", "vendas", "metas", "funil", "atendimento", "tarefas", "esfriando", "leads", "numeros", "desde", "horas", "equipe"]
      : ["vendas", "metas", "funil", "agora", "atendimento", "tarefas", "esfriando", "leads", "numeros", "desde", "horas", "equipe"])
    : BLOCOS_INICIO.slice();
  if (!objetivo || typeof ordemDoInicio !== "function") return base;
  try {
    const areas = ordemDoInicio(objetivo, [...new Set(base.map(id => AREA_DO_BLOCO[id]))]);
    if (!Array.isArray(areas) || !areas.length) return base;
    const pos = id => { const i = areas.indexOf(AREA_DO_BLOCO[id]); return i < 0 ? areas.length : i; };
    return base.map((id, i) => ({ id, i })).sort((a, b) => pos(a.id) - pos(b.id) || a.i - b.i).map(x => x.id);
  } catch { return base; }
}
/** plano 2000d · DR-333: a chave do checklist deste aparelho — sem conta (id vazio), nada é guardado (antes «-» juntava várias pessoas). */
export function chaveOnboarding(clienteId, contaId) {
  const c = contaId === null || contaId === undefined ? "" : String(contaId).trim();
  return clienteId && c && c !== "-" ? `nx-onb:${clienteId}:${c}` : null;
}
/** plano 2000d · DR-279: a descrição curta do KPI para o Tab (a 1ª frase da ajuda); a ajuda inteira fica no «i». */
export function descricaoCurta(ajuda, max = 90) {
  const t = String(ajuda || "").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  const f = (m ? m[1] : t);
  return f.length > max ? `${f.slice(0, max - 1).trimEnd()}…` : f;
}
/** plano 2000d · DR-281: o chip «▲ 12%» em palavras para o leitor de tela — «mais 12% que ontem», «menos R$ 800…», «igual a ontem». */
export function textoChipAcessivel(chip, contra = "ontem") {
  if (!chip) return "";
  const quando = String(contra || "").replace(/^vs\.\s*/i, "") || "o período anterior";
  // plano 2000d · IY-033: o chip «novo» (antes era zero) dizia «novo para comparar com ontem» — agora «novo: era zero ontem»
  if (chip.novo) return `novo: era zero ${/^(ontem|hoje)$/.test(quando) ? quando : /^o /.test(quando) ? quando.replace(/^o /, "no ") : /^a /.test(quando) ? quando.replace(/^a /, "na ") : `em ${quando}`}`;
  if (chip.v === null || chip.v === undefined) return `${chip.txt || "sem base"} para comparar com ${quando}`;
  if (!chip.v || chip.seta === "→") return `igual a ${quando}`;
  return `${chip.seta === "▲" || chip.v > 0 ? "mais" : "menos"} ${String(chip.txt || "").replace(/^[+−-]/, "")} que ${quando}`;
}
/**
 * plano 2000d · DR-330/DR-276: o texto da hora da leitura com o estado da rede — sem internet diz isso com a hora dos dados; com falha, o selo
 * «sem atualizar desde HH:MM» fica enquanto falhar.
 */
export function seloLeitura({ hora = "", falhou = false, offline = false } = {}) {
  if (offline) return hora ? `Sem internet · dados das ${hora}` : "Sem internet";
  if (falhou) return hora ? `Sem atualizar desde ${hora}` : "Sem atualizar";
  return "";
}
/**
 * plano 2000d · DR-405: no dia 1 e 2 tudo está quase zerado e o dono acha que deu erro — «Setembro fechou com R$ 27.500.» ao lado.
 * null do dia 3 em diante ou sem o número do mês passado.
 */
export function notaInicioMes(n, hoje, fmt = v => `R$ ${Math.round(v)}`) {
  const dia = fin(n && n.dia_do_mes) ? +n.dia_do_mes : Number(String(hoje || "").slice(8, 10)) || null;
  if (!dia || dia > 2 || !n || !fin(n.receita_mes_anterior)) return null;
  const m = Number(String(hoje || "").slice(5, 7));
  const ant = MESES[(m + 10) % 12];
  return ant ? `${cap(ant)} fechou com ${fmt(+n.receita_mes_anterior)}. O mês novo começou agora: os números sobem ao longo dos dias.` : null;
}
/**
 * plano 2000d · DR-398: «desde a sua última visita» sem depender do servidor — a foto guardada neste aparelho na última visita (mesmo mês)
 * contra a de agora: leads do mês, vendas e receita. → {itens:[texto], quando} | null (primeira visita, outro mês ou nada mudou)
 */
export function fotoVisita(d, agora = Date.now()) {
  const n = (d && d.negocios) || {}, f = (d && d.funil_mes) || {};
  return { mes: String((d && d.hoje) || "").slice(0, 7), em: agora, leads: fin(f.leads) ? +f.leads : null, ganhos: fin(n.ganhos_mes) ? +n.ganhos_mes : null, receita: fin(n.receita_mes) ? +n.receita_mes : null };
}
export function novidadesDesde(antes, d, { fmt = v => `R$ ${Math.round(v)}`, agora = Date.now(), minimoMin = 60 } = {}) {
  if (!antes || typeof antes !== "object" || !d) return null;
  const atual = fotoVisita(d, agora);
  if (!atual.mes || antes.mes !== atual.mes || !(agora - +antes.em >= minimoMin * 60000)) return null;
  const dif = k => (fin(antes[k]) && fin(atual[k]) ? atual[k] - antes[k] : 0);
  const itens = [];
  if (dif("leads") > 0) itens.push(`${dif("leads")} ${dif("leads") === 1 ? "lead novo" : "leads novos"}`);
  if (dif("ganhos") > 0) itens.push(`${dif("ganhos")} ${dif("ganhos") === 1 ? "venda" : "vendas"}`);
  if (dif("receita") > 0) itens.push(fmt(dif("receita")));
  return itens.length ? { itens, quando: +antes.em } : null;
}
/** plano 2000d · DR-133: o tempo médio do lead de anúncio até o 1º contato (leads.primeiro_contato_media_min) — «6 min»; null sem o campo. */
export function tempoPrimeiroContato(d) {
  const l = d && d.leads;
  return l && fin(l.primeiro_contato_media_min) ? duracaoCurta(Math.max(0, +l.primeiro_contato_media_min)) : null;
}
/** plano 2000d · DR-302: leads de hoje × ontem ATÉ ESTA HORA (leads.ontem_ate_agora) — «ontem até esta hora: 3»; null sem o campo. */
export function leadsContraOntem(l) {
  if (!l || !fin(l.ontem_ate_agora)) return null;
  const hoje = Math.max(0, Math.round(+l.hoje || 0)), ontem = Math.max(0, Math.round(+l.ontem_ate_agora));
  return { hoje, ontem, texto: `ontem até esta hora: ${ontem}`, dif: hoje - ontem };
}
/** plano 2000d · DR-407: o «Meus / Todos» do esfriando — só quando os itens dizem o responsável (dono_id). */
export function filtrarEsfriando(es, contaId, meus) {
  if (!es || !meus || contaId === null || contaId === undefined) return es;
  const itens = es.itens.filter(x => x.donoId !== null && String(x.donoId) === String(contaId));
  return { ...es, itens, total: itens.length, valor: itens.reduce((a, x) => a + (x.valor || 0), 0) || null, parcial: false };
}
export const temDonoEsfriando = es => !!(es && es.itens.some(x => x.donoId !== null));
/**
 * plano 2000d · DR-352: o placar da TV da loja — ganhos de HOJE por pessoa (equipe[].ganhos_hoje, quando o servidor manda); sem o campo, o mês.
 * → {titulo, linhas:[{nome, n, valor}], deHoje}
 */
export function placarEquipe(d) {
  const l = d && Array.isArray(d.equipe) ? d.equipe.filter(x => x && String(x.nome || "").trim()) : [];
  if (!l.length) return null;
  const deHoje = l.some(x => fin(x.ganhos_hoje));
  const linhas = l.map(x => ({ nome: String(x.nome).trim(), n: Math.max(0, Math.round(+(deHoje ? x.ganhos_hoje : x.ganhos) || 0)),
    valor: fin(deHoje ? x.valor_hoje : x.valor) ? +(deHoje ? x.valor_hoje : x.valor) : 0 }))
    .sort((a, b) => b.valor - a.valor || b.n - a.n);
  // plano 2000d · IY-070: empate (mesmo valor e mesmas vendas) divide a posição — dois «1º», o próximo é «3º» (na TV, 2º para quem empatou
  // em 1º parecia injusto); `top` = está em 1º com algo vendido
  linhas.forEach((x, i) => { const ant = linhas[i - 1]; x.pos = ant && ant.valor === x.valor && ant.n === x.n ? ant.pos : i + 1; x.top = x.pos === 1 && x.valor > 0; });
  return { titulo: deHoje ? "Placar de hoje" : "Placar do mês", linhas, deHoje };
}
/** plano 2000d · DR-357: o bloco pedido pela rota (#/inicio?bloco=metas) — só ids conhecidos. */
export function blocoDaRota(query) {
  const b = query && typeof query.bloco === "string" ? query.bloco.trim() : "";
  return BLOCOS_INICIO.includes(b) ? b : null;
}
/** plano 2000d · DR-274: a partir de quanto o valor em R$ do KPI ganha a forma curta no cartão estreito (100 mil; antes só 1 milhão). */
export const LIMITE_FORMA_CURTA = 1e5;
/** plano 2000d · DR-332: a folha de atalhos do Início («?»). */
export const ATALHOS_INICIO = Object.freeze([{ tecla: "R", txt: "Atualizar os números" }, { tecla: "?", txt: "Mostrar estes atalhos" },
  { tecla: "Esc", txt: "Sair do exemplo ou fechar a folha" }]);
/** plano 2000d · DR-298: a meta de leads do mês contra os leads que entraram (funil_mes.leads). null sem meta ou sem o número. */
export function realizadoLeadsMes(d) { const f = d && d.funil_mes; return f && fin(f.leads) ? Math.max(0, Math.round(+f.leads)) : null; }

/** Todos os blocos do Início (ids) na ordem padrão. */
// plano 1500c · RC-339/RC-325/RC-219: «esfriando», «desde que você começou» e «equipe no mês» (só quando o servidor manda os campos)
export const BLOCOS_INICIO = Object.freeze(["agora", "atendimento", "tarefas", "esfriando", "numeros", "vendas", "funil", "desde", "horas", "metas", "leads", "equipe"]);

/**
 * plano 1500c · RC-339: negócios abertos sem mensagem nem tarefa há 7+ dias (nx_inicio.esfriando {total, itens:[{id, titulo, contato_nome,
 * estagio_nome, parado_dias, valor}]}) — onde a venda se perde. null sem o campo ou sem nenhum. → {total, itens:[{id, nome, etapa, dias, valor}]}
 */
export function listaEsfriando(d, max = 5) {
  const s = d && d.esfriando;
  if (!s || typeof s !== "object") return null;
  const itens = (Array.isArray(s.itens) ? s.itens : []).filter(x => x && x.id !== null && x.id !== undefined && x.id !== "")
    .map(x => ({ id: x.id, nome: String(x.contato_nome || x.titulo || "").trim() || null, etapa: String(x.estagio_nome || "").trim() || null,
      dias: fin(x.parado_dias) ? Math.max(0, Math.floor(+x.parado_dias)) : null, valor: fin(x.valor) ? +x.valor : null,
      // plano 2000d · DR-286/DR-407: o contato (para «Mandar mensagem») e o responsável (para «Meus / Todos»), quando o servidor manda
      contatoId: x.contato_id !== null && x.contato_id !== undefined && x.contato_id !== "" ? x.contato_id : null,
      donoId: x.dono_id !== null && x.dono_id !== undefined && x.dono_id !== "" ? String(x.dono_id) : null }))
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1)).slice(0, max);
  const total = Math.max(fin(s.total) ? +s.total : 0, itens.length);
  // plano 1500c · IC-013: quanto dinheiro está parado — valor_total do servidor; sem ele, a soma dos que vieram (e «parcial» quando há mais)
  const soma = itens.reduce((a, x) => a + (x.valor || 0), 0);
  const valor = fin(s.valor_total) ? +s.valor_total : soma > 0 ? soma : null;
  const parcial = !fin(s.valor_total) && total > itens.length;
  return total > 0 ? { total, itens, valor, parcial } : null;
}
/**
 * plano 1500c · RC-219: a equipe no mês (nx_inicio.equipe [{conta_id, nome, ganhos, valor, tpr_media_min}]) ordenada pelo valor ganho.
 * null sem o campo ou lista vazia.
 */
export function equipeMes(d, contaId = null) {
  const l = d && Array.isArray(d.equipe) ? d.equipe : null;
  if (!l) return null;
  const out = l.filter(x => x && String(x.nome || "").trim()).map(x => ({ id: x.conta_id ?? x.id ?? null, nome: String(x.nome).trim(),
    ganhos: Math.max(0, Math.round(+x.ganhos || 0)), valor: fin(x.valor) ? +x.valor : 0, tpr: fin(x.tpr_media_min) ? Math.max(0, +x.tpr_media_min) : null }))
    .sort((a, b) => b.valor - a.valor || b.ganhos - a.ganhos || (a.tpr ?? Infinity) - (b.tpr ?? Infinity));
  // plano 1500c · IC-012: a linha de quem está olhando ganha «(você)» — cada um se acha na tabela sem procurar
  if (contaId !== null && contaId !== undefined) for (const x of out) x.eu = x.id !== null && String(x.id) === String(contaId);
  // plano 2000d · DR-218/DR-261: a meta do mês de cada um (equipe[].meta, quando o servidor manda nx_metas por conta) → % e quanto falta;
  // DR-220: leads recebidos × ganhos (equipe[].leads) → a conversão de cada um; DR-353: tarefas de hoje (equipe[].tarefas_hoje);
  // DR-355: a posição e a distância até quem está logo à frente («a R$ 1.200 do 1º lugar»)
  const fonte = new Map(l.filter(x => x && String(x.nome || "").trim()).map(x => [String(x.conta_id ?? x.id ?? x.nome), x]));
  out.forEach((x, i) => {
    const o = fonte.get(String(x.id ?? x.nome)) || {};
    x.posicao = i + 1;
    x.meta = fin(o.meta) && +o.meta > 0 ? +o.meta : null;
    x.metaPct = x.meta ? Math.round(x.valor / x.meta * 100) : null;
    x.leads = fin(o.leads) ? Math.max(0, Math.round(+o.leads)) : null;
    x.conversao = x.leads > 0 ? Math.round(x.ganhos / x.leads * 100) : null;
    x.tarefasHoje = fin(o.tarefas_hoje) ? Math.max(0, Math.round(+o.tarefas_hoje)) : null;
    const frente = i > 0 ? out[i - 1] : null;
    x.distancia = frente && frente.valor > x.valor ? frente.valor - x.valor : null;
  });
  return out.length ? out : null;
}
/**
 * plano 2000d · DR-260/DR-356: quem não é administrador vê só a própria linha e a posição («Você está em 2º de 5») — os valores dos colegas
 * ficam com o gestor. Admin vê a tabela inteira. → {linhas, resumo|null}
 */
export function equipeVisivel(eq, { admin = false } = {}) {
  if (!Array.isArray(eq) || !eq.length) return null;
  if (admin) return { linhas: eq, resumo: null };
  const eu = eq.find(x => x.eu);
  if (!eu) return null;
  // plano 2000d · IY-056: sozinho na lista, «Você está em 1º de 1» não diz nada — sem a frase
  return { linhas: [eu], resumo: eq.length > 1 ? `Você está em ${eu.posicao}º de ${eq.length} no mês.` : null };
}
/** plano 2000d · DR-355: o incentivo de quem está atrás — «a R$ 1.200 do 1º lugar». "" para o 1º ou sem distância. */
export function textoDistancia(x, fmt = v => `R$ ${Math.round(v)}`) {
  return x && x.distancia > 0 && x.posicao > 1 ? `a ${fmt(x.distancia)} do ${x.posicao - 1}º lugar` : "";
}
/** plano 2000d · DR-353: quem da equipe está sem nenhuma tarefa para hoje (carteira parada) — só quando o servidor manda tarefas_hoje. */
export function semTarefaHoje(eq) {
  const l = Array.isArray(eq) ? eq.filter(x => x && x.tarefasHoje === 0) : [];
  return l.length ? l.map(x => x.nome) : null;
}
/** plano 2000d · DR-262: o quadro do CRM filtrado pelo responsável (o mesmo «?f=» do link de visão do crm-logica: base64url de {dono}). */
export function linkQuadroDono(id) {
  if (id === null || id === undefined || id === "" || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) return null;
  const json = JSON.stringify({ dono: String(id) });
  const b64 = typeof btoa === "function" ? btoa(json) : Buffer.from(json, "utf8").toString("base64");
  return `#/crm?f=${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
/**
 * plano 1500c · RC-325: «desde que você começou» (nx_inicio.desde_inicio {primeiro: {mes: "AAAA-MM", leads, tpr_media_min, receita}, atual: {…}}).
 * null sem o campo ou quando o primeiro mês é o atual (nada a comparar). → {primeiro, atual, linhas:[{id, rotulo, antes, agora, melhor}]}
 */
export function desdeInicio(d) {
  const s = d && d.desde_inicio;
  if (!s || typeof s !== "object" || !s.primeiro || !s.atual || !s.primeiro.mes || s.primeiro.mes === s.atual.mes) return null;
  // plano 2000d · DR-290: o mês corrente é parcial (leads e receita do dia 25 parecem menores que um mês cheio) — com o último mês FECHADO
  // (desde_inicio.ultimo_fechado, quando o servidor manda) a comparação é mês cheio × mês cheio; sem ele, o tempo de resposta compara igual
  // e leads/receita dizem que o mês de agora ainda não acabou
  const fechado = s.ultimo_fechado && typeof s.ultimo_fechado === "object" && s.ultimo_fechado.mes && s.ultimo_fechado.mes !== s.primeiro.mes ? s.ultimo_fechado : null;
  const ref = fechado || s.atual;
  const parcial = !fechado;
  const linha = (id, rotulo, chave, sentido, soma) => {
    const a = fin(s.primeiro[chave]) ? +s.primeiro[chave] : null, b = fin(ref[chave]) ? +ref[chave] : null;
    if (a === null || b === null) return null;
    return { id, rotulo: soma && parcial ? `${rotulo} (mês ainda em andamento)` : rotulo, antes: a, agora: b, melhor: sentido === "baixo" ? b < a : b > a, parcial: !!(soma && parcial) };
  };
  const linhas = [linha("leads", "Leads no mês", "leads", "cima", true), linha("tpr", "1ª resposta (média)", "tpr_media_min", "baixo", false), linha("receita", "Receita no mês", "receita", "cima", true)].filter(Boolean);
  return linhas.length ? { primeiro: s.primeiro, atual: ref, parcial, linhas } : null;
}
/** plano 2000d · IY-054/IY-055: tira os marcadores de formatação do WhatsApp (* _ ~ `) e corta em `max` letras. */
export function semMarcadores(t, max = 80) { return String(t ?? "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
/** plano 2000d · DR-288: «desde que você começou» em texto para mandar ao dono (WhatsApp/e-mail). `fmt(id, v)` formata cada valor. */
export function textoDesde(ds, { empresa = "", fmt = (id, v) => String(v) } = {}) {
  if (!ds) return "";
  const emp = semMarcadores(empresa, 80);     // plano 2000d · IY-055: o nome sem * _ ~ ` (o negrito do título não quebra)
  const cab = `*Desde que começamos${emp ? ` — ${emp}` : ""}*`;
  const quando = `${mesPorExtenso(ds.primeiro.mes)} × ${ds.parcial ? "este mês (até hoje)" : mesPorExtenso(ds.atual.mes)}`;
  return [cab, quando, ...ds.linhas.map(x => `• ${x.rotulo}: ${fmt(x.id, x.antes)} → ${fmt(x.id, x.agora)}${x.melhor ? " (melhorou)" : ""}`)].join("\n");
}
/** plano 1500c · RC-338: quem faz aniversário hoje (nx_inicio.aniversariantes [{contato_id, nome, conversa_id?}]); null sem o campo ou vazio. */
export function aniversariantesHoje(d) {
  const l = d && Array.isArray(d.aniversariantes) ? d.aniversariantes : null;
  if (!l) return null;
  // plano 2000d · IY-067: o mesmo contato duas vezes (dois números, duas conversas) aparece uma vez — sem dois «Dar parabéns» para a mesma pessoa
  const vistos = new Set();
  const out = l.filter(x => x && String(x.nome || "").trim()).map(x => ({ contatoId: x.contato_id ?? null, nome: String(x.nome).trim(), conversaId: x.conversa_id ?? null }))
    .filter(x => { const k = x.contatoId !== null ? `c:${x.contatoId}` : `n:${x.nome.toLowerCase()}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  return out.length ? out : null;
}
/** plano 2000d · DR-255: «+3 aniversariantes» (antes «+3 outros», sem dizer de quê). */
export function textoMaisAniv(n) {
  const q = Math.max(0, Math.round(+n || 0));
  return q ? `+${q} ${q === 1 ? "aniversariante" : "aniversariantes"}` : "";
}
/** plano 2000d · DR-256/DR-292: os modelos prontos que vão para o campo da conversa (`?texto=` — a pessoa revisa e envia). */
export function textoParabens(nome, empresa = "") {
  const p = primeiroNome(nome) || "";
  return `Feliz aniversário${p ? `, ${p}` : ""}! 🎉 Desejamos um novo ano cheio de saúde e alegria.${empresa ? ` Um abraço da equipe ${empresa}.` : ""}`;
}
export function textoPedirConfirmacao(nome, quando, palavra = "consulta") {
  const p = primeiroNome(nome) || "";
  return `Olá${p ? `, ${p}` : ""}! Passando para confirmar a sua ${palavra} ${quando}. Podemos confirmar? Responda SIM para confirmar ou nos avise se precisar remarcar.`;
}
/**
 * plano 2000d · DR-256/DR-292: o link da conversa com o texto pronto — pela conversa (#/conversas/ID?texto=…) ou pelo contato
 * (#/conversas?contato=ID&texto=…). null sem nenhum dos dois.
 */
export function hrefComTexto({ conversaId = null, contatoId = null } = {}, texto = "") {
  // plano 2000d · IY-069: corta por caractere, não por unidade UTF-16 — cortar no meio de um emoji (🎉) deixava meio par e o
  // encodeURIComponent lançava URIError (o botão «Dar parabéns» sumia com a tela)
  const t = Array.from(String(texto || "")).slice(0, 1000).join("");
  const q = t ? `texto=${encodeURIComponent(t)}` : "";
  if (conversaId !== null && conversaId !== undefined && conversaId !== "") return `#/conversas/${encodeURIComponent(conversaId)}${q ? `?${q}` : ""}`;
  if (contatoId !== null && contatoId !== undefined && contatoId !== "") return `#/conversas?contato=${encodeURIComponent(contatoId)}${q ? `&${q}` : ""}`;
  return null;
}
/**
 * plano 1500c · RC-254: as linhas do «Resumo do mês» para mostrar ao sócio — só o que nx_inicio já manda (nada estimado).
 * → [{id, rotulo, valor (texto)}]
 */
export function linhasResumoMes(d, { voc = {}, brl = v => `R$ ${Math.round(v)}` } = {}) {
  const V = { negocios: "negócios", feminino: false, ...voc };
  const n = (d && d.negocios) || {}, c = (d && d.conversas) || {}, f = (d && d.funil_mes) || null;
  const out = [];
  const poe = (id, rotulo, valor) => { if (valor !== null && valor !== undefined && valor !== "") out.push({ id, rotulo, valor: String(valor) }); };
  poe("receita", "Receita do mês", fin(n.receita_mes) ? brl(+n.receita_mes) : null);
  poe("ganhos", `${cap(V.negocios)} ${V.feminino ? "ganhas" : "ganhos"}`, fin(n.ganhos_mes) ? String(Math.round(+n.ganhos_mes)) : null);
  if (fin(n.receita_mes) && fin(n.receita_mes_anterior_parcial)) poe("vs", "Contra o mesmo período do mês passado", textoDiferenca(+n.receita_mes, +n.receita_mes_anterior_parcial, brl));
  // plano 2000d · DR-254: o ticket médio (receita ÷ ganhos) — o sócio sempre pergunta
  if (fin(n.receita_mes) && +n.ganhos_mes > 0) poe("ticket", "Ticket médio", brl(+n.receita_mes / +n.ganhos_mes));
  poe("leads", "Leads no mês", f && fin(f.leads) ? String(Math.round(+f.leads)) : null);
  // plano 2000d · DR-253: um resumo MENSAL não mistura «últimos 7 dias» — os leads de anúncio do mês (funil_mes.leads_anuncio) e o prazo do
  // mês (conversas.respondidas_no_prazo_mes_pct), quando o servidor manda; sem eles, a linha não entra
  poe("leads_anuncio", "Leads de anúncio no mês", f && fin(f.leads_anuncio) ? String(Math.round(+f.leads_anuncio)) : null);
  poe("prazo", "Conversas respondidas no prazo (mês)", fin(c.respondidas_no_prazo_mes_pct) ? pct(c.respondidas_no_prazo_mes_pct) : null);
  if (f && fin(f.leads) && +f.leads > 0 && fin(f.ganhos)) poe("conv", "Do lead à venda", pct(+f.ganhos / +f.leads * 100));
  const r = retornoAnuncios(d);
  // plano 2000d · DR-248: sem a receita de anúncio separada, o rótulo diz que é a receita TOTAL por real investido
  if (r) poe("roi", rotuloRetorno(r).resumo, textoMultiplo(r.multiplo));
  // plano 2000d · DR-254/DR-246: o custo de cada lead de anúncio
  const cpl = custoPorLead(d);
  poe("cpl", "Custo por lead de anúncio", cpl ? brl(cpl) : null);
  poe("aberto", "Em aberto no funil", fin(n.valor_aberto) ? brl(+n.valor_aberto) : null);
  // plano 2000d · IY-057: as vendas por indicação (DR-348) — o argumento do pós-venda também vai ao sócio
  if (fin(n.ganhos_indicacao_mes)) poe("indicacao", "Vendas por indicação", `${Math.max(0, Math.round(+n.ganhos_indicacao_mes))}${fin(n.receita_indicacao_mes) ? ` · ${brl(+n.receita_indicacao_mes)}` : ""}`);
  // plano 2000d · IY-058: quantos dias, em média, do lead à venda (DR-402)
  if (fin(n.dias_ate_ganho)) { const dd = Math.max(0, Math.round(+n.dias_ate_ganho)); poe("dias", "Do lead à venda (média)", `${dd} ${dd === 1 ? "dia" : "dias"}`); }
  // plano 2000d · IY-059: o tempo até o 1º contato com o lead de anúncio (DR-133)
  const l = (d && d.leads) || {};
  if (fin(l.primeiro_contato_media_min)) poe("contato", "1º contato com o lead de anúncio (média)", duracaoCurta(Math.max(0, +l.primeiro_contato_media_min)));
  return out;
}
/**
 * plano 2000d · DR-406: o resumo do mês que FECHOU (no começo do mês o dono quer mandar o mês passado ao sócio) — só com o que nx_inicio já
 * manda do mês anterior (receita_mes_anterior, funil_mes_anterior). null sem nada.
 */
export function linhasResumoMesAnterior(d, { brl = v => `R$ ${Math.round(v)}` } = {}) {
  const n = (d && d.negocios) || {}, f = (d && d.funil_mes_anterior) || null;
  const out = [];
  if (fin(n.receita_mes_anterior)) out.push({ id: "receita", rotulo: "Receita do mês", valor: brl(+n.receita_mes_anterior) });
  if (f && fin(f.ganhos)) out.push({ id: "ganhos", rotulo: "Vendas fechadas", valor: String(Math.round(+f.ganhos)) });
  if (f && fin(f.ganhos) && +f.ganhos > 0 && fin(n.receita_mes_anterior)) out.push({ id: "ticket", rotulo: "Ticket médio", valor: brl(+n.receita_mes_anterior / +f.ganhos) });
  if (f && fin(f.leads)) out.push({ id: "leads", rotulo: "Leads no mês", valor: String(Math.round(+f.leads)) });
  if (f && fin(f.leads) && +f.leads > 0 && fin(f.ganhos)) out.push({ id: "conv", rotulo: "Do lead à venda", valor: pct(+f.ganhos / +f.leads * 100) });
  return out.length ? out : null;
}
/**
 * plano 1500c · IC-003: o resumo do mês em texto para colar no WhatsApp/e-mail («*Resumo de outubro* — Empresa» + uma linha por número).
 * plano 2000d · DR-247: o rodapé leva a marca da SESSÃO («Números do Nexus.») — no white-label o cliente da agência não manda ao sócio a
 * marca de outro; sem marca, sem rodapé.
 */
export function textoResumoMes(linhas, { empresa = "", mes = "", ate = "", marca = "" } = {}) {
  // plano 2000d · IY-054: o nome da empresa sem os marcadores do WhatsApp (* _ ~ `) — «Clínica *Sorriso*» quebrava o negrito do cabeçalho
  const emp = semMarcadores(empresa, 80);
  const cab = `*Resumo de ${mes}*${emp ? ` — ${emp}` : ""}${ate ? ` (até ${ate})` : ""}`;
  const m = semMarcadores(marca, 40);
  return [cab, ...(Array.isArray(linhas) ? linhas : []).map(x => `• ${x.rotulo}: ${x.valor}`), m ? `Números do ${m}.` : null].filter(Boolean).join("\n");
}
/** plano 2000d · IY-042: o título do checklist sem «Órbita» fixo — «Nexus: deixe tudo pronto» (sem artigo: serve a qualquer marca); sem marca, «Deixe tudo pronto». */
export function tituloChecklist(marca = "") {
  const m = String(marca || "").trim();
  return m ? `${m}: deixe tudo pronto` : "Deixe tudo pronto";
}
/** plano 2000d · DR-247: o nome da marca da sessão (ctx.marca.produto — Órbita, Nexus ou a marca da agência); "" sem marca. */
export function nomeMarca(marca) {
  return marca && typeof marca === "object" ? String(marca.produto || marca.nome || "").replace(/[<>]/g, "").trim().slice(0, 40) : "";
}
/** «abril de 2026» de «2026-04». */
export function mesPorExtenso(am) {
  const [a, m] = String(am || "").split("-").map(Number);
  return a && m >= 1 && m <= 12 ? `${MESES[m - 1]} de ${a}` : "";
}
/** Reordena `ids` pela ordem guardada: o que está na ordem vem primeiro (na posição guardada); o resto segue a ordem padrão. */
export function ordenarBlocos(ids, ordemSalva = []) {
  const pos = new Map((Array.isArray(ordemSalva) ? ordemSalva : []).map((id, i) => [id, i]));
  return ids.map((id, i) => ({ id, i })).sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id) : null, pb = pos.has(b.id) ? pos.get(b.id) : null;
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return a.i - b.i;
  }).map(x => x.id);
}
/** Move `id` dentro de `ordem` por `delta` posições (−1 = antes, +1 = depois); devolve lista nova. */
export function moverBloco(ordem, id, delta) {
  const lista = Array.isArray(ordem) ? ordem.slice() : [];
  const i = lista.indexOf(id);
  if (i < 0) return lista;
  const j = Math.max(0, Math.min(lista.length - 1, i + (+delta || 0)));
  if (j === i) return lista;
  lista.splice(i, 1); lista.splice(j, 0, id);
  return lista;
}
/**
 * Para onde vai o foco quando o botão que o tinha some ou volta desligado depois de um redesenho (teclado e leitor de tela não perdem o lugar):
 * mover para a ponta → o botão oposto do mesmo bloco (ou o de recolher); «Restaurar ordem» → a barra do 1º bloco; metas → o próximo controle;
 * e, por último, a barra do bloco em que o foco estava. alternativasFoco("bl-ant-vendas") → ["bl-dep-vendas", "bl-rec-vendas"]
 */
export function alternativasFoco(k, { bloco = null, primeiro = null } = {}) {
  const out = [];
  const m = /^bl-(ant|dep)-(.+)$/.exec(String(k || ""));
  if (m) out.push(`bl-${m[1] === "ant" ? "dep" : "ant"}-${m[2]}`, `bl-rec-${m[2]}`);
  else if (k === "bl-restaurar" && primeiro) out.push(`bl-rec-${primeiro}`);
  else if (k === "mt-editar" || k === "mt-tirar") out.push("mt-v");
  else if (k === "mt-salvar" || k === "mt-cancelar") out.push("mt-editar", "mt-v");
  if (bloco) out.push(`bl-rec-${bloco}`);
  return [...new Set(out)];
}
/** A barra que recebe o Tab (tabindex itinerante; as setas andam entre as outras): a hora corrente, presa à faixa, no modo Hoje; o dia de hoje no modo 7 dias. */
export function barraAtual(itens, { hojeMode = true, horaAgora = null } = {}) {
  if (!Array.isArray(itens) || !itens.length) return -1;
  if (!hojeMode) return Math.max(0, itens.findIndex(x => x.hoje));
  const i = itens.findIndex(x => x.h === horaAgora);
  if (i >= 0) return i;
  return Number.isFinite(horaAgora) && horaAgora > itens[itens.length - 1].h ? itens.length - 1 : 0;
}

/* ============================================================
   2. TELA
   ============================================================ */
export function desmontar() {
  montagem++;
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } }
  cancelarPulso = null;
  if (cancelarOcupado) { try { cancelarOcupado(); } catch { /* ok */ } }
  cancelarOcupado = null;
  if (cancelarCanais) { try { cancelarCanais(); } catch { /* ok */ } }
  cancelarCanais = null;
  clearTimeout(tPulso); tPulso = 0;
  if (cancelarVisivel) { try { cancelarVisivel(); } catch { /* ok */ } }
  cancelarVisivel = null;
  clearInterval(tRelogio); tRelogio = 0;
  metasEditando = false; rascunhoMetas = null;
  soltarSparks();
  soltarTravaTela();      // plano 2000d · IY-048
  // plano 2000d · IY-044: sair do Início com o «Resumo do mês» aberto não deixa a folha (modal) por cima das outras telas
  try {
    if (typeof document !== "undefined" && document) {
      for (const f of document.querySelectorAll(".ini-resumo-folha")) f.remove();
      if (document.documentElement && document.documentElement.classList) document.documentElement.classList.remove("ini-imprimindo", "ini-folha-aberta");
    }
  } catch { /* sem DOM */ }
}
/**
 * plano 2000d · IY-048: no modo TV (?tv=1) a tela não apaga sozinha — navigator.wakeLock («tela ativa») enquanto o placar está à vista;
 * o navegador solta a trava quando a aba some e o Início pede de novo ao voltar. Sem a API (navegador antigo), nada muda.
 */
let travaTela = null;
export async function pedirTravaTela() {
  try {
    const wl = typeof navigator !== "undefined" && navigator && navigator.wakeLock;
    if (!wl || typeof wl.request !== "function" || (travaTela && !travaTela.released)) return travaTela;
    travaTela = await wl.request("screen");
    return travaTela;
  } catch { travaTela = null; return null; }
}
export function soltarTravaTela() {
  const t = travaTela;
  travaTela = null;
  try { if (t && typeof t.release === "function" && !t.released) { const p = t.release(); if (p && typeof p.catch === "function") p.catch(() => {}); } } catch { /* ok */ }
}
/** plano 1000b · RB-167: desliga os ResizeObserver das linhas dos KPIs do desenho anterior (antes ficavam 4 novos vivos a cada pulso). */
function soltarSparks() {
  for (const c of controlesSpark) { try { if (c && typeof c.destruir === "function") c.destruir(); } catch { /* ok */ } }
  controlesSpark = [];
}

export async function montar(ctx) {
  desmontar();
  const minha = montagem;
  const { ui } = ctx;
  ui.carregarCss("relatorios.css");
  ui.carregarCss("inicio.css");            // o que o Início ganhou no plano 50 (KPIs, Agora, barras, metas, blocos)
  ctx.titulo("Início");
  ui.limpar(ctx.alvo);
  const raiz = ui.h("section", { class: "rel ini", "aria-labelledby": "ini-h" });
  ctx.alvo.append(raiz);
  // a tela nunca fica em branco: o esqueleto só sai quando há dado. Plano 100 · B6: KPIs com a linha + um gráfico (a forma desta tela);
  // biblioteca sem esses tipos → o esqueleto da tela inteira
  const esqueletoInicial = () => (Array.isArray(ui.TIPOS_ESQUELETO) && ui.TIPOS_ESQUELETO.includes("kpi") && ui.TIPOS_ESQUELETO.includes("grafico")
    ? [ui.esqueleto("kpi", { n: 4, cabecalho: true }), ui.esqueleto("grafico", { n: 10 })] : null);
  const sk0 = esqueletoInicial();
  if (sk0) raiz.append(...sk0); else raiz.append(ui.esqueleto("inicio"));
  // plano 1000b · RB-177: o app trocou de versão sem recarregar a página — rel-logica e graficos vêm de novo com o ?v= novo
  if (!L || !G || versaoLG !== ctx.versao) {
    try {
      const [nL, nG] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`)]);
      L = nL; G = nG; versaoLG = ctx.versao;
      // plano 1500c · RC-261: o crm-logica (2.400 linhas) não vem mais em toda abertura — só quando o formulário das metas aparece (único uso)
      lerNumeroCrm = null;
    } catch (e) { if (!L || !G) { ui.limpar(raiz); raiz.append(ui.erroCartao(e, () => montar(ctx))); return; } }   // a versão nova falhou: segue com a anterior
  }
  if (minha !== montagem) return;
  // outra empresa (ou outra conta): o último checklist e os últimos números eram da anterior e não podem aparecer nesta
  const dono = `${ctx.cliente.id}|${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-"}`;
  if (donoDados !== dono) agendaSemanaEm = 0;     // plano 1000 (CR-170): a semana guardada era da empresa/conta anterior
  if (donoDados !== dono) { onbLidoEm = 0; verExemplo = false; }     // plano 1500c · RC-209/RC-229: o checklist lido e o exemplo eram da anterior
  if (donoDados !== dono) { ultimoOnb = null; ultimoDado = null; ultimaAgenda = null; ultimoJson = ""; maisAberto = false; ultimaCarga = 0; donoDados = dono; }
  if (ultimaAgendaMes && ultimaAgendaMes.dono !== dono) ultimaAgendaMes = null;   // a agenda do mês também era da empresa anterior
  if (!ultimoDado) modoHoras = "hoje";
  const h = G.criarH(ui);
  const V = ctx.vocab || {};
  const vmin = (k, p) => (typeof V.min === "function" ? V.min(k) : (V[k] || p).toLowerCase());
  // concordância: "oportunidades abertas/ganhas" × "orçamentos abertos/ganhos"
  const fem = (typeof V.art === "function" ? V.art("negocio") : V.g_negocio) === "a";
  const adj = (m, n = 2) => (fem ? m.replace(/o$/, "a") : m) + (n === 1 ? "" : "s");
  const podeConversas = ctx.temModulo("conversas") && ctx.pronto("conversas");
  const podeCrm = ctx.temModulo("crm") && ctx.pronto("crm");
  const podeAds = ctx.temModulo("ads") && ctx.pronto("ads");
  const podeTarefas = ctx.temModulo("crm") && ctx.pronto("tarefas");
  const podeAgenda = ctx.temModulo("crm") && ctx.pronto("crm");
  const podeRel = ctx.temModulo("relatorios") && ctx.pronto("relatorios");
  const escreve = ctx.pode("atendente");
  const primeiro = primeiroNome(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome);
  const int = v => Math.round(v).toLocaleString("pt-BR");
  const brl0 = v => ui.brl(v, { centavos: false });
  const admin = ctx.pode("admin");
  // plano 1000b · RB-195 (pendência do CRM): as pontes do CRM não rejeitam mais — erro vira aviso delas e o retorno é null. Aqui o null
  // só quer dizer «não abriu» (nada a refazer) e um shell antigo que ainda rejeite não deixa promessa rejeitada solta.
  const ponteCrm = nome => (...args) => {
    const fn = ctx[nome];
    if (typeof fn !== "function") return Promise.resolve(null);
    try { return Promise.resolve(fn(...args)).then(r => r ?? null, e => { console.error(e); return null; }); }
    catch (e) { console.error(e); return Promise.resolve(null); }
  };
  const pontes = { abrirNegocio: ponteCrm("abrirNegocio"), abrirContato: ponteCrm("abrirContato"), novoNegocio: ponteCrm("novoNegocio") };
  // M32: o que a pessoa fez só neste aparelho ("Já está bom" e "Dispensar por 7 dias"), por empresa e conta; tudo em try/catch (janela anônima)
  // plano 2000d · DR-333: sem conta identificada nada fica guardado (a chave «-» era dividida por quem usasse o aparelho)
  const chaveOnb = chaveOnboarding(ctx.cliente.id, ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id);
  // plano 2000d · DR-334: «dispensado até» também do servidor (nx_onboarding_estado.dispensado_ate, quando manda) — outro aparelho respeita
  const dispensadoServidor = () => { const t = ultimoOnb && ultimoOnb.dispensado_ate ? Date.parse(ultimoOnb.dispensado_ate) : NaN; return Number.isFinite(t) ? t : 0; };
  const lerOnb = () => {
    if (!chaveOnb) return { pulados: [], dispensadoAte: dispensadoServidor() };
    try { const p = JSON.parse(localStorage.getItem(chaveOnb) || "{}"); return { pulados: Array.isArray(p.pulados) ? p.pulados : [], dispensadoAte: Math.max(Number(p.dispensadoAte) || 0, dispensadoServidor()) }; }
    catch { return { pulados: [], dispensadoAte: dispensadoServidor() }; }
  };
  const gravarOnb = p => { if (!chaveOnb) return; try { localStorage.setItem(chaveOnb, JSON.stringify(p)); } catch { /* sem storage */ } };
  // plano 50: preferências deste aparelho — histórico das leituras (por empresa e conta), metas (por empresa) e ordem/recolhimento dos blocos (por empresa e conta)
  const contaId = (ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-";
  const chaveHist = `nx-ini-hist:${ctx.cliente.id}:${contaId}`;
  const chaveMetas = `nx-ini-metas:${ctx.cliente.id}`;
  const chaveBlocos = `nx-ini-blocos:${ctx.cliente.id}:${contaId}`;
  const lerJson = (chave, padrao) => { try { const v = JSON.parse(localStorage.getItem(chave) || "null"); return v && typeof v === "object" ? v : padrao; } catch { return padrao; } };
  const chaveKpis = `nx-ini-kpis:${ctx.cliente.id}:${contaId}`;      // plano 1000 (CR-177)
  // plano 1000 (CR-255): uma vez por sessão, o que ficou guardado de empresas que esta conta perdeu sai do aparelho
  if (limpezaFeita !== contaId && ctx.sessao && Array.isArray(ctx.sessao.clientes) && ctx.sessao.clientes.length) {
    limpezaFeita = contaId;
    try {
      const todas = [];
      for (let i = 0; typeof localStorage.key === "function" && i < (Number(localStorage.length) || 0); i++) todas.push(localStorage.key(i));
      for (const k of chavesInicioOrfas(todas, { clientes: ctx.sessao && ctx.sessao.clientes, conta: contaId })) localStorage.removeItem(k);
    } catch { /* sem armazenamento */ }
  }
  const gravarJson = (chave, v) => { try { if (v === null || v === undefined) localStorage.removeItem(chave); else localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } };
  const lerHist = () => lerJson(chaveHist, { dias: [] });
  // plano 2000d · DR-298: a meta de leads do mês também
  const lerMetas = () => { const m = lerJson(chaveMetas, {}); return { vendas: +m.vendas > 0 ? +m.vendas : null, consultas: +m.consultas > 0 ? Math.round(+m.consultas) : null, leads: +m.leads > 0 ? Math.round(+m.leads) : null }; };
  // plano 1500c · RC-207: «Mais detalhes» aberto fica guardado junto (mais: true) — quem sempre abre não precisa abrir a cada visita
  const lerBlocos = () => { const b = lerJson(chaveBlocos, {}); return { ordem: Array.isArray(b.ordem) ? b.ordem.filter(id => BLOCOS_INICIO.includes(id)) : [], recolhidos: Array.isArray(b.recolhidos) ? b.recolhidos.filter(id => BLOCOS_INICIO.includes(id)) : [], mais: b.mais === true }; };
  const gravarBlocos = b => gravarJson(chaveBlocos, b && (b.ordem.length || b.recolhidos.length || b.mais) ? { ordem: b.ordem, recolhidos: b.recolhidos, ...(b.mais ? { mais: true } : {}) } : null);
  if (lerBlocos().mais) maisAberto = true;
  // o checklist só cobra o que esta pessoa consegue abrir nas Configurações (a mesma régua do config.js: seção pronta, módulo do plano e papel)
  const podeSecao = L.filtroSecoesOnboarding({ temModulo: ctx.temModulo, pode: ctx.pode, configPronta: ctx.configPronta });
  const resumoOnb = onb => { const local = lerOnb(); return L.resumoOnboarding(onb, { pulados: local.pulados, dispensadoAte: local.dispensadoAte, admin, podeSecao }); };
  // plano 1500c · UC-011 (pendência da frente sis): #/inicio?passos=1 («Comece aqui» do menu) traz o checklist de volta mesmo dispensado
  const pedirPassos = !!(ctx.rota && ctx.rota.query && String(ctx.rota.query.passos) === "1");
  if (pedirPassos && admin) { const p = lerOnb(); if (p.dispensadoAte) { p.dispensadoAte = 0; gravarOnb(p); } }
  // plano 2000d · DU-242 (pendência da frente sis): o objetivo das boas-vindas (rotas.chaveObjetivo) ordena os blocos e os primeiros passos
  const R = ctx.rotas && typeof ctx.rotas === "object" ? ctx.rotas : null;
  const lerObjetivo = () => { try { return R && typeof R.chaveObjetivo === "function" ? (localStorage.getItem(R.chaveObjetivo(ctx.cliente.id)) || null) : null; } catch { return null; } };
  // plano 2000d · DR-268: «?exemplo=1» (só admin) liga o exemplo mesmo numa conta com dados — demonstração ao vivo sem gravar nada
  const exemploForcado = admin && !!(ctx.rota && ctx.rota.query && String(ctx.rota.query.exemplo) === "1");
  if (exemploForcado) verExemplo = true;
  // plano 2000d · DR-352: «?tv=1» — o placar da equipe em tela cheia (TV da loja), atualizando pelo pulso
  const modoTv = !!(ctx.rota && ctx.rota.query && String(ctx.rota.query.tv) === "1");
  // plano 2000d · DR-357: «?bloco=metas» (notificação «meta batida») rola até o bloco e põe o foco nele
  const blocoPedido = blocoDaRota(ctx.rota && ctx.rota.query);
  // plano 2000d · DR-398: a foto da última visita (mesma empresa e conta, neste aparelho) — «desde a sua última visita»
  const chaveVisita = `nx-ini-visita:${ctx.cliente.id}:${contaId}`;
  const visitaAnterior = lerJson(chaveVisita, null);
  let novidadesVisita = null, fotoLida = false;
  // plano 2000d · DR-407: «Meus / Todos» do esfriando (só na tela)
  let esfriandoMeus = false;
  // plano 2000d · DR-283: o modo «Organizar o Início» (as setas de mover os blocos aparecem)
  let organizando = false;
  // a palavra da agenda na vertical (consulta / visita / entrega), a mesma das Automações
  // plano 2000d · DR-259 (pendência da frente ads): o vocabulário da empresa (ctx.vocab.compromisso) vence a palavra fixa da vertical
  const palavra = L.palavraAgenda(V.vertical || (ctx.cliente && ctx.cliente.vertical), V);
  // plano 2000d · IY-041: o gênero da palavra da agenda (vocab g_compromisso) — «Nenhum atendimento marcado» quando ela é masculina
  const femAg = (typeof V.art === "function" ? V.art("compromisso") : (V.g_compromisso || "a")) !== "o";
  const ga = textosGeneroAgenda(femAg);

  // cabeçalho: saudação pequena em cima, manchete no degrau display, data por extenso + hora da leitura + Atualizar
  // plano 1000b · RB-153: sem aria-live — «Atualizado às HH:MM» muda a cada leitura e o leitor falava a hora sozinho; só a FALHA é anunciada
  const quando = h("p", { class: "rel-nota ini-quando" });
  // plano 1500c · RC-221: a data longa e a curta («ter, 21 out»); o CSS mostra a curta no celular, o leitor de tela ouve a longa
  const dataEl = h("time", { class: "ini-data", datetime: L.hojeSP() });
  const pintarData = () => {
    ui.limpar(dataEl);
    dataEl.append(h("span", { class: "ini-data-longa" }, dataLonga()), h("span", { class: "ini-data-curta", "aria-hidden": "true" }, dataCurta()));
  };
  pintarData();
  // plano 1500c · RC-211: «R» atualiza (fora de campos e sem modificador); o botão diz o atalho
  const btn = h("button", { type: "button", class: "rel-btn rel-btn-sec", "aria-keyshortcuts": "R", title: "Atualizar (tecla R)" }, "Atualizar");
  // plano 1000 (CR-284): a idade da leitura («· há 3 min»), fora do aria-live (não é lida a cada minuto); passou de 10 min fica âmbar
  const idadeEl = h("span", { class: "rel-nota ini-idade", hidden: true });
  const seloEl = h("span", { class: "ini-selo-leitura", hidden: true, dataset: { k: "selo-leitura" } });     // plano 2000d · DR-276/DR-330
  function pintarIdade() {
    if (!ultimaCarga || falhouUltima) { idadeEl.hidden = true; idadeEl.classList.remove("ini-velho"); idadeEl.removeAttribute("title"); return; }
    const min = Math.floor((Date.now() - ultimaCarga) / 60000);
    idadeEl.hidden = min < 1;
    idadeEl.textContent = min >= 1 ? `· há ${duracaoCurta(min)}` : "";
    idadeEl.classList.toggle("ini-velho", min >= 10);
    // plano 1500c · RC-223: o âmbar diz o que fazer (o pulso parou: aba em segundo plano ou rede)
    if (min >= 10) idadeEl.setAttribute("title", `Sem atualização há ${duracaoCurta(min)} — toque em Atualizar`); else idadeEl.removeAttribute("title");
  }
  let falhouUltima = false;
  let agendaAntes = null;     // plano 2000d · IY-022
  let falhasSeguidas = 0;     // plano 1000b · RB-175: só a 1ª falha seguida vira aviso (servidor em 503 não empilha um toast a cada 30 s)
  // plano 1000 (CR-181): sem internet o «Atualizar» desliga («Sem internet»), o pulso não tenta (nada de erro a cada 30 s) e, quando a rede volta, relê
  const semRede = () => typeof navigator !== "undefined" && !!navigator && navigator.onLine === false;
  const DICA_SEM_REDE = "Sem internet: a tela atualiza sozinha quando a conexão voltar";
  let lendoForcado = false;   // plano 1500c · RC-230: só a leitura pedida pela pessoa desliga o botão (o pulso não o pisca)
  function marcarRede() {
    const off = semRede();
    btn.disabled = off;
    btn.textContent = off ? "Sem internet" : "Atualizar";
    btn.removeAttribute("aria-busy");
    lendoForcado = false;
    btn.setAttribute("title", off ? DICA_SEM_REDE : "Atualizar (tecla R)");
    marcarCaixasTarefa(off);
    pintarSelo();
  }
  /** plano 2000d · DR-276/DR-330: o selo à vista enquanto a leitura falha («Sem atualizar desde 10:20») ou sem internet («Sem internet · dados das 10:20»). */
  function pintarSelo() {
    const t = seloLeitura({ hora: ultimaCarga ? L.horaSP(new Date(ultimaCarga)) : "", falhou: falhouUltima, offline: semRede() });
    seloEl.textContent = t; seloEl.hidden = !t;
  }
  /** plano 1000b · RB-169: sem internet a caixa de concluir tarefa desliga com a mesma dica do #/tarefas (CR-156); volta com a rede. */
  function marcarCaixasTarefa(off = semRede()) {
    for (const cx of corpo.querySelectorAll(".ini-check")) {
      const li = typeof cx.closest === "function" ? cx.closest(".ini-tf-item") : null;
      if (li && li.classList.contains("feita")) continue;        // concluída: segue travada (reabrir só pelo «Desfazer»)
      cx.disabled = !escreve || off;
      if (off) cx.setAttribute("title", "Sem internet: dá para concluir quando a conexão voltar"); else cx.removeAttribute("title");
    }
  }
  // B5: ponto verde discreto quando o servidor diz que todos os números estão conectados (some sem a informação ou com número caído)
  const waOk = h("span", { class: "ini-wa-ok", hidden: true }, h("i", { class: "ini-wa-ponto", "aria-hidden": "true" }), "WhatsApp conectado");
  const cab = ui.cabecalho({ rotulo: primeiro ? `${L.saudacao()}, ${primeiro} · ${ctx.cliente.nome}` : `${L.saudacao()} · ${ctx.cliente.nome}`,
    titulo: "", acoes: [h("div", { class: "ini-cab-meta" }, dataEl, quando, idadeEl, seloEl, waOk), btn], nivel: 1 });
  cab.classList.add("ini-cab");
  const titulo = cab.querySelector("h1");
  titulo.id = "ini-h";
  const corpo = h("div", { class: "rel-corpo" });
  // plano 1500c · RC-229: no exemplo nenhum botão ou link faz nada de verdade (só «Voltar e conectar» e o que só muda a tela)
  corpo.addEventListener("click", ev => {
    if (!corpo.classList.contains("ini-exemplo")) return;
    const alvo = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("a, button, input") : null;
    if (!alvo || (alvo.dataset && alvo.dataset.exemploOk) || alvo.closest(".ini-kpis-escolha, .seg, .ini-bl-barra, .g-ver-tabela, .ini-kpi-ajuda")) return;
    if (alvo.classList && (alvo.classList.contains("g-ver-tabela") || alvo.classList.contains("ini-kpi-ajuda"))) return;
    ev.preventDefault(); if (typeof ev.stopPropagation === "function") ev.stopPropagation();
    ui.toast("É só um exemplo: conecte o WhatsApp para ver os seus números aqui.", { tipo: "info" });
  }, true);
  btn.addEventListener("click", () => { if (!lendoForcado) carregar({ forcar: true }); });
  let desenhou = false;      // já houve algum dado na tela (cache ou rede)
  let colocado = false;      // o esqueleto já foi trocado pelo cabeçalho + corpo
  let relogio = null;        // refaz «Agora» e as barras com a hora de agora (montado a cada desenho; o intervalo de 60 s chama)

  // B5: faixa «número desconectado» no topo do corpo — nx_inicio.canais[].estado somado ao que o shell sabe (ctx.canais, contrato A4).
  // Repintada no lugar (o shell avisa; o relógio anda o «há X min»), só quando o texto muda: o foco no «Ver número» não se perde.
  const faixaCanal = h("div", { class: "ini-faixa-canal", role: "status", hidden: true });
  const caidosShell = () => { try { return ctx.canais && typeof ctx.canais.caidos === "function" ? ctx.canais.caidos() : []; } catch { return []; } };
  const verNumero = () => (ctx.canais && typeof ctx.canais.verNumero === "function" ? ctx.canais.verNumero() : ctx.navegar("#/config/numeros"));
  function pintarFaixa() {
    const lista = numerosCaidos(ultimoDado, caidosShell());
    waOk.hidden = !(lista.length === 0 && estadoNumeros(ultimoDado) === "ok");
    const frase = textoNumeroCaido(lista);
    if (faixaCanal.dataset.frase === frase && faixaCanal.childElementCount) { faixaCanal.hidden = !lista.length; return; }
    faixaCanal.dataset.frase = frase;
    ui.limpar(faixaCanal);
    faixaCanal.hidden = !lista.length;
    if (!lista.length) return;
    faixaCanal.append(...[
      h("span", { class: "ini-faixa-ic", "aria-hidden": "true" }, ui.icone("alerta")),
      h("p", { class: "ini-faixa-txt" }, h("b", null, frase), " ", h("span", null, "As mensagens não chegam até reconectar.")),
      admin ? h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: "faixa-ver" }, on: { click: verNumero } }, "Ver número")
        // plano 1500c · RC-212: quem é o administrador, quando o servidor diz (nx_inicio.admin_nome)
        : h("span", { class: "rel-nota" }, ultimoDado && String(ultimoDado.admin_nome || "").trim()
          ? `Peça a ${String(ultimoDado.admin_nome).trim()}, que administra a conta, para reconectar.` : "Peça ao administrador para reconectar."),
    ].filter(Boolean));
  }

  /** A agenda é um complemento (sem ela a frase só não fala de consulta), mas falha ≠ sem permissão: null = a conta não tem agenda;
      {erro: true} = não deu para ler agora (a tela diz isso, com «Tentar de novo»). No pulso, uma falha passageira mantém a leitura de hoje.
      7 dias: a manchete e o KPI olham só o de hoje; «Agora» e as barras usam a semana.
      plano 1000 (CR-170): no pulso a semana lida há menos de 2 min (e do mesmo dia) vale — «Atualizar», a abertura e a virada do dia releem. */
  const semanaFresca = () => !!ultimaAgenda && Array.isArray(ultimaAgenda.consultas) && ultimaAgenda.data === L.hojeSP() && Date.now() - agendaSemanaEm < VALIDADE_AGENDA_SEMANA;
  async function buscarAgenda(reler = true) {
    if (!podeAgenda) return null;
    if (!reler && semanaFresca()) return ultimaAgenda;
    try { const r = await ctx.api.rpcC("nx_agenda_dia", { p_data: L.hojeSP(), p_dias: 7 }, { cache: true }); agendaSemanaEm = Date.now(); return r; }
    catch {
      if (!reler && ultimaAgenda && Array.isArray(ultimaAgenda.consultas) && ultimaAgenda.data === L.hojeSP()) return ultimaAgenda;
      return { erro: true };
    }
  }
  /** O mês inteiro só quando há meta de consultas (é a única conta que precisa dele). Não muda a cada mensagem: é relido ao abrir a tela,
      em «Atualizar», ao guardar a meta, na virada do dia ou passados 10 min — no pulso vale a leitura guardada. Falhou → a última de hoje
      (ou null: a meta diz que não conseguiu contar). */
  async function buscarAgendaMes(reler = false) {
    if (!podeAgenda || !lerMetas().consultas) return null;
    const hoje = L.hojeSP();
    const guardada = ultimaAgendaMes && ultimaAgendaMes.dono === dono && ultimaAgendaMes.dia === hoje ? ultimaAgendaMes : null;
    if (!reler && guardada && Date.now() - guardada.em < VALIDADE_AGENDA_MES) return guardada;
    try { const r = await ctx.api.rpcC("nx_agenda_dia", { p_data: primeiroDiaMes(hoje), p_dias: diasDoMes(hoje) }, { cache: true }); return r ? { ...r, dono, dia: hoje, em: Date.now() } : null; }
    catch { return guardada; }
  }

  async function buscarOnboarding(reler = true) {
    if (!admin) return null;
    // no pulso: checklist completo ou dispensado não tem cartão a mostrar, então a consulta não é refeita (volta ao abrir a tela ou em «Atualizar»)
    if (!reler && ultimoOnb && resumoOnb(ultimoOnb) === null) return ultimoOnb;
    if (!reler && ultimoOnb && Date.now() - onbLidoEm < VALIDADE_ONB) return ultimoOnb;     // plano 1500c · RC-209
    try { return await ctx.api.rpcC("nx_onboarding_estado", {}); }
    catch { return ultimoOnb; }          // sem o checklist a tela segue (a RPC é um complemento: vale o último estado conhecido, desta empresa)
  }

  /** Guarda a leitura de hoje no histórico deste aparelho (um ponto por dia; é daqui que sai a linha de tendência dos KPIs). */
  function guardarHistorico(d, agenda) {
    if (!d || !d.hoje) return;
    const c = d.conversas || {}, n = d.negocios || {}, l = d.leads || {};
    const hist = lerHist();
    // a leitura da agenda falhou agora: o ponto de consultas de hoje fica como estava (uma falha passageira não apaga o ponto da linha)
    const doDia = agenda && agenda.erro ? ((hist.dias || []).find(x => x && x.dia === d.hoje) || {}).consultas : undefined;
    const consultas = agenda && agenda.erro ? (fin(doDia) ? +doDia : null) : consultasNoDia(agenda, d.hoje);
    // plano 1000b · RB-155: os KPIs trocáveis «Previsão» e «Tarefas atrasadas» também ganham a linha (antes nunca tinham ponto guardado)
    const t = d.tarefas || {};
    const registro = { aguardando: +c.aguardando || 0, consultas, valor_aberto: +n.valor_aberto || 0, abertos: +n.abertos || 0,
      // plano 1500c · RC-190: sem o campo na resposta, o dia fica sem ponto de receita (null) — antes caía a zero e a linha despencava
      leads_semana: +l.semana || 0, receita_mes: fin(n.receita_mes) ? +n.receita_mes : null, previsao_ponderada: fin(n.previsao_ponderada) ? +n.previsao_ponderada : null,
      tarefas_atrasadas: Math.max(0, Math.floor(+t.atrasadas) || 0),
      // plano 2000d · IY-029: o KPI «Respondidas no prazo» ganha a linha deste aparelho (antes nunca tinha ponto guardado)
      respondidas_pct: fin(c.respondidas_no_prazo_pct) ? Math.max(0, Math.min(100, +c.respondidas_no_prazo_pct)) : null,
      // plano 2000d · IY-030: e o «Vendas por indicação» (DR-348) também
      ganhos_indicacao_mes: fin(n.ganhos_indicacao_mes) ? Math.max(0, Math.round(+n.ganhos_indicacao_mes)) : null };
    // plano 1000b · RB-170: só grava quando o ponto do dia mudou (antes: ler + gravar o localStorage a cada leitura de 30 s)
    const doHoje = (hist.dias || []).find(x => x && x.dia === d.hoje);
    if (doHoje && Object.keys(registro).every(k => doHoje[k] === registro[k])) return;
    gravarJson(chaveHist, registrarHistorico(hist, d.hoje, registro));
  }

  async function carregar({ forcar = false, primeira = false } = {}) {
    if (minha !== montagem) return;
    if (!primeira && semRede()) { marcarRede(); return; }      // CR-181: o pulso e a volta da aba não tentam sem rede
    // plano 1000b · RB-176: quem pediu («Atualizar», «Tentar de novo») vê que está atualizando; o pulso silencioso não pisca o botão
    // plano 1500c · RC-230: e só nesse caso o botão desliga — no pulso continua clicável (o clique duplo é barrado por lendoForcado)
    if (forcar || primeira) { btn.disabled = true; lendoForcado = true; }
    if (forcar) { btn.textContent = "Atualizando…"; btn.setAttribute("aria-busy", "true"); }
    try {
      // 1ª abertura: pinta o último dado guardado (se o shell tiver cache) e confere na rede em seguida
      // a agenda ainda está a caminho (pode estar repetindo depois de uma falha): «lendo», nunca «não disponível para a sua conta»
      const agendaPrevia = ultimaAgenda && Array.isArray(ultimaAgenda.consultas) ? ultimaAgenda : podeAgenda ? { lendo: true } : null;
      const aoCache = (dados, em) => { if (minha === montagem && !desenhou && dados && typeof dados === "object") { desenhou = true; if (!ultimaCarga && em) ultimaCarga = Number(new Date(em)) || 0; desenhar(dados, agendaPrevia, false);
        // plano 2000d · DR-273: de quando são os números do cache, até a rede responder
        quando.textContent = statusAtualizacaoInicio({ hora: em && Number.isFinite(Number(new Date(em))) ? L.horaSP(new Date(em)) : "", cache: true }); } };
      const [d, agenda, onb, agendaMes] = await Promise.all([ctx.api.rpcC("nx_inicio", {}, { cache: true, aoCache }), buscarAgenda(forcar || primeira),
        buscarOnboarding(forcar || primeira), buscarAgendaMes(forcar || primeira)]);
      if (minha !== montagem) return;          // resposta de uma montagem antiga (outra empresa ou conta): não toca no estado guardado
      // plano 1500c · RC-209: com passos pendentes, o pulso reaproveita o checklist por 10 min (antes relia a cada 30 s); abrir, «Atualizar» e voltar releem
      if (onb && onb !== ultimoOnb) onbLidoEm = Date.now();
      const agAnt = ultimaAgenda;     // plano 2000d · IY-022: a agenda de antes, para acender o KPI de consultas quando muda
      ultimoOnb = onb; ultimaAgenda = agenda; ultimaAgendaMes = agendaMes;
      ultimaCarga = Date.now();
      falhouUltima = false; falhasSeguidas = 0;
      quando.textContent = statusAtualizacaoInicio({ hora: L.horaSP(new Date(ultimaCarga)) });
      pintarIdade();
      guardarHistorico(d, agenda);
      // plano 2000d · DR-398: na 1ª leitura da rede, o que mudou desde a foto da última visita (de 1 h ou mais) — e a foto nova fica no lugar
      if (!fotoLida && d && !d.exemplo) {
        fotoLida = true;
        novidadesVisita = novidadesDesde(visitaAnterior, d, { fmt: v => L.textoMoeda(v, { centavos: false }) });
        const velha = !visitaAnterior || !(Date.now() - +visitaAnterior.em < 60 * 60000) || visitaAnterior.mes !== String(d.hoje || "").slice(0, 7);
        if (velha) gravarJson(chaveVisita, fotoVisita(d));
      }
      // plano 1500c · RC-210: com a versão que o servidor mandar (nx_inicio.versao) a comparação não serializa a resposta inteira
      // plano 1500c · RC-186: nx_onboarding_estado sem «itens» não derruba a atualização
      const resto = { agenda: agenda && agenda.consultas ? agenda.consultas.map(c => `${c.negocio_id}|${c.inicio}|${c.status}`) : null,
        agErro: !!(agenda && agenda.erro), agMes: agendaMes && agendaMes.consultas ? agendaMes.consultas.length : null, onb: onb && Array.isArray(onb.itens) ? onb.itens.map(i => i && i.feito) : null };
      const js = assinaturaInicio(d, resto);
      if (!forcar && !primeira && (js === ultimoJson || metasEditando)) return;      // nada mudou (ou a pessoa está digitando as metas): não mexe na tela
      ultimoJson = js;
      const antes = ultimoDado;
      agendaAntes = agAnt;
      desenhar(d, agenda, primeira && !desenhou, antes, onb, agendaMes);
      desenhou = true;
    } catch (e) {
      if (minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      falhouUltima = true; pintarIdade();
      falhasSeguidas++;
      const statusFalha = statusAtualizacaoInicio({ hora: ultimaCarga ? L.horaSP(new Date(ultimaCarga)) : "", falhou: true });
      quando.textContent = statusFalha;
      // RB-153: a falha é anunciada uma vez (o parágrafo não é mais aria-live); RB-175: o aviso visual só na 1ª falha seguida,
      // as próximas ficam no texto «A atualização falhou…» — exceto quando a pessoa pediu («Atualizar»: ela espera uma resposta)
      const avisar = falhasSeguidas === 1 || forcar;
      if (semRede() && desenhou) { marcarRede(); if (avisar && typeof ui.anunciar === "function") ui.anunciar(statusFalha); return; }      // CR-181: sem internet, sem toast
      if (primeira && !desenhou) { ui.trocarEsqueleto(raiz, ui.erroCartao(e, () => { ui.limpar(raiz); const sk = esqueletoInicial(); if (sk) raiz.append(...sk); else raiz.append(ui.esqueleto("inicio")); carregar({ primeira: true }); })); }
      else if (avisar) ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora.", { tipo: "erro" });
    } finally { marcarRede(); }
  }
  /** Redesenha com o que já está na tela (preferência local mudou: bloco, meta, modo do gráfico). */
  const redesenhar = () => { if (ultimoDado) desenhar(ultimoDado, ultimaAgenda, false, null, ultimoOnb, ultimaAgendaMes); };

  /** Um trecho da manchete: link (ou texto) com o número no acento e o verbo em Zodiak. */
  function noManchete(no, k) {
    if (no.t === "txt") return no.v;
    const partes = no.partes.map(p => {
      if (p.t === "n") return h("span", { class: "ini-m-n" }, p.v);
      if (p.t === "moeda") return L.preencherMoeda(ui, h("span", { class: "ini-m-n" }), p.v, { centavos: false });
      if (p.t === "narr") return h("em", { class: "narr" }, p.v);
      return p.v;
    });
    const cls = ["ini-m-trecho", no.tom ? `ini-m-${no.tom}` : null];
    return no.href ? h("a", { class: cls, href: no.href, dataset: { k } }, partes) : h("span", { class: cls }, partes);
  }
  function pintarManchete(m, completo = null) {
    ui.limpar(titulo);
    let i = 0;
    m.frases.forEach((f, fi) => {
      if (fi) titulo.append(" ");
      for (const no of f) titulo.append(noManchete(no, `m-${i++}`));
    });
    // o leitor de tela lê a frase inteira, sem picotar por link — plano 1500c · RC-222: a frase COMPLETA (antes de encurtar para 360 px):
    // o que saiu do visual por falta de espaço não sai para quem ouve
    titulo.setAttribute("aria-label", (completo && completo.texto) || m.texto);
  }

  /** Linha de tendência de um KPI: G.sparkline (frente A) quando existir; senão um SVG mínimo daqui (linha + área + último ponto). */
  function sparkline(alvo, valores, rotulo, fmt = null) {
    // plano 1000b · RB-167: o controle (ResizeObserver) fica guardado e é destruído no próximo desenho (antes: 4 observadores novos a cada pulso)
    // plano 1500c · RC-189: o resumo acessível no formato do KPI («de R$ 15.200 a R$ 18.000», não «de 15200 a 18000»)
    if (typeof G.sparkline === "function") { try { const ctl = G.sparkline(alvo, { valores, area: true, rotulo, ...(fmt ? { fmt } : {}) }); if (ctl) controlesSpark.push(ctl); return; } catch { /* cai no desenho local */ } }
    const NS = "http://www.w3.org/2000/svg", W = Math.max(80, Math.round(alvo.clientWidth || 160)), H = 34, n = valores.length;
    const max = Math.max(...valores), min = Math.min(...valores), amp = max - min || 1;
    const x = i => (n === 1 ? W / 2 : i / (n - 1) * (W - 6) + 3), y = v => H - 4 - (v - min) / amp * (H - 10);
    const pts = valores.map((v, i) => [x(i), y(v)]);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "ini-sp"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    const area = document.createElementNS(NS, "path");
    area.setAttribute("class", "ini-sp-area");
    area.setAttribute("d", `M${pts[0][0].toFixed(1)} ${H} ${pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")} L${pts[n - 1][0].toFixed(1)} ${H} Z`);
    const linha = document.createElementNS(NS, "polyline");
    linha.setAttribute("class", "ini-sp-linha"); linha.setAttribute("points", pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
    const ponto = document.createElementNS(NS, "circle");
    ponto.setAttribute("class", "ini-sp-ponto"); ponto.setAttribute("cx", pts[n - 1][0].toFixed(1)); ponto.setAttribute("cy", pts[n - 1][1].toFixed(1)); ponto.setAttribute("r", "3");
    svg.append(area, linha, ponto);
    alvo.append(svg);
  }

  function desenhar(d, agenda, animar, antes = null, onb = ultimoOnb, agendaMes = ultimaAgendaMes) {
    // preserva o foco (checkbox de tarefa, links, botões dos blocos) entre redesenhos do pulso; sem o mesmo controle, vai para o vizinho (alternativasFoco)
    const ativo = document.activeElement;
    const dentro = !!ativo && (corpo.contains(ativo) || titulo.contains(ativo));
    const foco = dentro && ativo.dataset ? ativo.dataset.k || null : null;
    const secFoco = dentro && typeof ativo.closest === "function" ? ativo.closest("[data-bloco]") : null;
    const blocoFoco = secFoco ? secFoco.dataset.bloco : null;
    let quieto = false;        // o relógio refaz um bloco: sem animar de novo
    ultimoDado = d;
    // plano 1500c · RC-229: «Ver um exemplo» — a conta zerada vê o Início com dados de mentira (selo EXEMPLO; ações não gravam nada)
    const exemplo = verExemplo && (L.inicioVazio(d) || exemploForcado);     // plano 2000d · DR-268: «?exemplo=1» também com dados
    if (exemplo) ({ d, agenda } = dadosExemplo(d.hoje || L.hojeSP(), Date.now(), { vertical: V.vertical || (ctx.cliente && ctx.cliente.vertical) || "generico" }));     // IC-020
    soltarSparks();            // plano 1000b · RB-167: as linhas do desenho anterior saem da página agora
    const contarDepois = [];     // animações de "contar até o valor": começam quando o esqueleto sai (o elemento precisa estar na página)
    const num = (v, fmt, cls = "", chave = null) => {
      const b = h("b", { class: `rel-num ${cls}` });
      if (chave) b.dataset.n = chave;
      const valor = +v || 0;
      if (fmt === brl0) L.preencherMoeda(ui, b, valor, { centavos: false });      // "R$" a 60%, colado ao valor
      else b.textContent = fmt(valor);
      if (animar && valor !== 0) contarDepois.push(() => (fmt === brl0 ? L.contarMoeda(ui, G, b, valor, { centavos: false }) : G.contar(b, valor, fmt)));
      return b;
    };
    const c = d.conversas || {}, t = d.tarefas || {}, n = d.negocios || {}, l = d.leads || {};
    const links = { conversas: podeConversas ? "#/conversas?aba=aguardando" : null, tarefas: podeTarefas ? "#/tarefas?aba=atrasadas" : null,
      agenda: podeAgenda ? "#/agenda" : null, crm: podeCrm ? "#/crm" : null, relatorios: podeRel ? "#/relatorios/atendimento" : null,
      // plano 1000 (CR-299): cada KPI leva ao recorte certo — «Em aberto» abre o quadro com o resumo; «Leads · 7 dias» a lista de quem chegou na semana
      // plano 1500c · RC-182: «7 dias» com hoje incluso = hoje − 6 (antes − 7: a lista mostrava um dia a mais que o número do cartão)
      crmResumo: podeCrm ? "#/crm?resumo=1" : null, leads: podeCrm ? `#/contatos?criado_de=${somarDiasIso(d.hoje || L.hojeSP(), -6)}` : null };
    const voc = { contato: vmin("contato", "cliente"), contatos: vmin("contatos", "clientes"),
      negocio: vmin("negocio", "negócio"), negocios: vmin("negocios", "negócios"), feminino: fem, consulta: palavra.um, consultas: palavra.varios, femAgenda: femAg };     // plano 2000d · IY-039/IY-040
    const mCompleta = L.manchete(d, { agenda, links, voc });
    const m = encurtarManchete(mCompleta, { max: 2, fmtMoeda: v => L.textoMoeda(v, { centavos: false }) });     // plano 1000 (CR-249)
    pintarManchete(m, mCompleta);     // plano 1500c · RC-222
    titulo.dataset.tam = m.texto.length > 70 ? "longa" : "curta";     // frase curta ganha o degrau display; a longa cabe em 2-3 linhas no degrau h1
    ui.limpar(corpo);
    // plano 2000d · DR-352: «?tv=1» — só o placar da equipe, grande, para a TV da loja (o pulso de 30 s atualiza)
    if (modoTv) {
      raiz.classList.add("ini-tv");
      const pl = placarEquipe(d);
      // plano 2000d · IY-050: «atualizado às» é a hora da ÚLTIMA LEITURA que deu certo (antes a hora do desenho: sem mudança, a TV mostrava
      // uma hora velha sem dizer); o relógio de 60 s anda o carimbo e relê (IY-049)
      const carimbo = h("span", { class: "rel-nota", dataset: { k: "pl-hora" } });
      const pintarCarimbo = () => { carimbo.textContent = ` · ${ctx.cliente.nome || ""} · atualizado às ${L.horaSP(new Date(ultimaCarga || Date.now()))}`; };
      pintarCarimbo();
      // plano 2000d · IY-051: a saída do modo TV (botão e Esc) — antes só apagando o «?tv=1» do endereço
      const sairTv = h("a", { class: "bt bt-sec bt-p ini-tv-sair", href: "#/inicio", dataset: { k: "tv-sair" } }, "Sair do modo TV");
      corpo.append(sairTv, pl ? h("section", { class: "rel-cartao ini-placar", "aria-labelledby": "ini-pl", dataset: { k: "placar" } },
        h("h2", { id: "ini-pl", class: "ini-placar-t" }, pl.titulo, carimbo),
        // plano 2000d · IY-070: a posição com empate (o <li value> mantém a numeração da lista igual à da tela)
        h("ol", { class: "ini-placar-lista" }, pl.linhas.map(x => h("li", { class: ["ini-placar-item", x.top && "ini-placar-top"], value: String(x.pos) },
          h("span", { class: "ini-placar-pos", "aria-hidden": "true" }, `${x.pos}º`), h("span", { class: "ini-placar-nome" }, x.nome),
          h("span", { class: "ini-placar-n rel-num" }, `${x.n} ${x.n === 1 ? "venda" : "vendas"}`), h("b", { class: "ini-placar-v rel-num" }, L.textoMoeda(x.valor, { centavos: false })))))
        ) : ui.vazio({ tipo: "sem_resultado", titulo: "O placar aparece quando o servidor mandar a equipe do mês." }));
      // plano 2000d · IY-049: na TV ninguém mexe — sem evento do pulso a tela parava; o relógio relê a cada minuto (sem piscar: só muda se mudou)
      relogio = () => { Promise.resolve(Date.now() - ultimaCarga >= INTERVALO_RELOGIO - 5000 ? carregar() : null).then(pintarCarimbo, pintarCarimbo); };
      trocar();
      return;
    }
    corpo.append(faixaCanal);         // número caído vem antes de tudo (sem ele a tela inteira mente: nada chega)
    pintarFaixa();
    corpo.classList.toggle("ini-exemplo", exemplo);
    if (exemplo) {
      // RC-229: o selo diz que é exemplo e a saída volta ao começo (os passos para ligar tudo)
      const sair = h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { k: "ex-sair", exemploOk: "1" }, on: { click: () => { verExemplo = false; redesenhar(); } } }, "Voltar e conectar");
      // plano 2000d · DR-265: a faixa fica presa no topo enquanto rola («Estes números são de exemplo…») e cada bloco ganha o selo
      corpo.append(h("div", { class: "ini-exemplo-faixa", role: "status" }, h("span", { class: "ini-exemplo-selo" }, "Exemplo"),
        h("p", { class: "ini-exemplo-txt" }, exemploForcado ? "Modo demonstração: estes números são de exemplo (os seus continuam guardados). Nada aqui é gravado."
          : "Estes números são de exemplo — conecte o WhatsApp para ver os seus. Nada aqui é gravado."), sair));
    }
    const rapidas = exemplo ? null : acoesRapidas();
    if (rapidas) corpo.append(rapidas);
    // plano 2000d · DR-398: «desde a sua última visita» (a foto deste aparelho, mesmo mês, há 1 h ou mais)
    if (!exemplo && novidadesVisita) {
      const nov = novidadesVisita;
      // plano 2000d · IY-064: «Dispensar» tira o aviso (antes ficava em todo redesenho até sair do Início); IY-026: «A, B e C»
      const fecharNov = h("button", { type: "button", class: "bt-icone ini-novidades-x", "aria-label": "Dispensar o aviso das novidades", dataset: { k: "novidades-x" } }, ui.icone("fechar"));
      const pNov = h("div", { class: "ini-novidades rel-entra", role: "status", dataset: { k: "novidades" } }, ui.icone("check"),
        h("span", null, `Desde a sua última visita (${L.quandoSP(new Date(nov.quando).toISOString())}): ${listaPt(nov.itens)}.`), fecharNov);
      fecharNov.addEventListener("click", () => { novidadesVisita = null; pNov.remove(); if (typeof btn.focus === "function") btn.focus(); });     // o foco não cai no vazio
      corpo.append(pNov);
    }
    // plano 1500c · IC-001: o destaque de venda — «cada R$ 1 em anúncio virou R$ X» (receita ÷ gasto do mês, quando o servidor manda o gasto)
    const roi = retornoAnuncios(d);
    if (roi && !L.inicioVazio(d)) corpo.append(cartaoRetorno({ ...roi, cpl: custoPorLead(d) }, d));

    const onbRes = resumoOnb(onb);
    if (L.inicioVazio(d) && !d.exemplo) {
      // cliente zerado: a órbita com os satélites que acendem conforme os passos ficam prontos (M09 + M32)
      const feito = ids => !!(onb && Array.isArray(onb.itens) && ids.every(id => (onb.itens.find(i => i.id === id) || {}).feito));
      // plano 1500c · IC-002: o cliente novo é guiado pelo que faz o Início ganhar vida — WhatsApp, anúncios e agenda (o que o plano libera),
      // cada passo com o seu botão; a equipe e o funil continuam no checklist logo abaixo
      // plano 2000d · DU-236/DU-242: o tempo de cada passo e a ordem pelo objetivo das boas-vindas (rotas.js, quando o shell manda)
      const passosGuia = guiaPrimeiroUso({ admin, podeSecao, temModulo: ctx.temModulo, feito, infoPassos: R && R.PASSOS_INFO, objetivo: lerObjetivo(),
        ordenar: R && typeof R.passosPorObjetivo === "function" ? R.passosPorObjetivo : null, vertical: V.vertical || (ctx.cliente && ctx.cliente.vertical) || null,
        conhece: id => !(onb && Array.isArray(onb.itens) && onb.itens.length) || onb.itens.some(i => i && i.id === id) }); // plano 2000d · DR-263/264
      const proximoGuia = passosGuia.find(p => !p.feito && p.rota) || null;
      corpo.append(h("div", { class: "ini-comecar rel-entra" }, ui.vazio({ tipo: "primeiro_uso", titulo: "Tudo pronto para começar.",
        texto: admin ? `${textoQuantosPassos(passosGuia.length)} e o Início mostra quem espera resposta, a agenda do dia e quanto cada real em anúncio trouxe.` : "Peça ao administrador da sua empresa para concluir a configuração.",
        passos: passosGuia.map(p => ({ rotulo: p.rotulo, feito: p.feito })),
        acao: proximoGuia ? { rotulo: proximoGuia.botao, fn: () => ctx.navegar(proximoGuia.rota) } : null,
        // plano 1500c · RC-229: «Ver um exemplo» desenha o Início com números de mentira (selo EXEMPLO, nada gravado) — a demonstração não fica no vazio
        acoes: [{ rotulo: "Ver um exemplo", fn: () => { verExemplo = true; redesenhar(); } }] })));
      const guia = h("ol", { class: "ini-guia", "aria-label": "Primeiros passos" }, passosGuia.map((p, i) => h("li", { class: ["ini-guia-item", p.feito && "feito"], dataset: { passo: p.id } },
        h("span", { class: "ini-guia-n", "aria-hidden": "true" }, p.feito ? ui.icone("check") : String(i + 1)),
        h("div", { class: "ini-guia-txt" }, h("b", null, p.rotulo, !p.feito && p.tempo ? h("span", { class: "ini-guia-tempo", dataset: { k: `guia-tempo-${p.id}` } }, ` · ${p.tempo}`) : null),     // DU-236
          h("span", { class: "rel-nota" }, p.feito ? "Feito." : p.ajuda),
          // plano 2000d · DU-449: «Ver como (1 min)» quando a marca (ou o passo) tem vídeo
          !p.feito ? linkVideoPasso(p) : null),
        !p.feito && p.rota ? h("a", { class: p === proximoGuia ? "bt bt-prim bt-p" : "bt bt-sec bt-p", href: p.rota, dataset: { k: `guia-${p.id}` } }, p.botao) : null)));
      const prog = progressoGuia(passosGuia);     // plano 1500c · IC-010/IC-011
      if (passosGuia.length) corpo.append(h("section", { class: ["rel-cartao", "ini-guia-cartao", "rel-entra", prog.todos && "ini-guia-pronto"], "aria-labelledby": "ini-gu" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-gu", class: "rel-h2" }, "Comece por aqui"),
          h("p", { class: "rel-nota", dataset: { k: "guia-prog" } }, prog.texto)),
        h("div", { class: "ini-guia-barra", role: "progressbar", "aria-label": "Primeiros passos prontos", "aria-valuetext": `${prog.feitos} de ${prog.total} passos prontos`,     /* plano 2000d · IY-083 */ "aria-valuemin": "0", "aria-valuemax": String(prog.total), "aria-valuenow": String(prog.feitos), style: { "--guia-pct": `${prog.pct}%` } },
          h("span", { class: "ini-guia-barra-f" })), guia));
      if (onbRes) corpo.append(cartaoChecklist(onbRes));
      relogio = null;
      trocar();
      return;
    }

    // ---- KPIs do topo: número grande, seta contra o dia anterior e a linha dos últimos dias (histórico deste aparelho)
    const hist = lerHist();
    const diasHist = (hist.dias || []).length;
    const faixa = h("section", { class: "ini-kpis rel-entra", "aria-label": "Resumo de agora", style: "--i:0" });
    // plano 1000 (CR-177): a pessoa escolhe os indicadores do topo (guardado por empresa e conta neste aparelho)
    const kpisPadrao = kpisInicio(d, agenda, { hoje: d.hoje, links, voc });
    const kpisAlt = kpisAlternativos(d, { links, voc });
    // plano 1000b · RB-166: a faixa é repintada no lugar (sem redesenhar a tela) — o flutuante de «Trocar indicadores» continua aberto
    const pintarKpis = () => {
      soltarSparks();
      ui.limpar(faixa);
      for (const k of aplicarEscolhaKpis(kpisPadrao, kpisAlt, lerJson(chaveKpis, {}))) faixa.append(cartaoKpi(k, hist, diasHist, num));
    };
    pintarKpis();
    corpo.append(faixa);
    const btKpis = h("button", { type: "button", class: "bt bt-fant bt-p ini-kpis-trocar", dataset: { k: "kpis-trocar" }, "aria-haspopup": "dialog" }, ui.icone("editar"), "Trocar indicadores");
    btKpis.addEventListener("click", () => {
      const atuais = aplicarEscolhaKpis(kpisPadrao, kpisAlt, lerJson(chaveKpis, {}));
      const opcoes = [...kpisPadrao, ...kpisAlt.filter(a => !kpisPadrao.some(p => p.id === a.id))];
      // plano 1500c · RC-206: cada opção com o valor de agora («Receita do mês — R$ 12.400») — dá para escolher vendo o número
      const sels = atuais.map((k, i) => h("select", { class: "sel", "aria-label": `Indicador ${i + 1}`, dataset: { pos: String(i) } },
        opcoes.map(o => h("option", { value: o.id, selected: o.id === k.id }, rotuloOpcaoKpi(o, { brl: brl0, int })))));
      const msg = h("small", { class: "rel-nota", role: "status" });
      let fl = null;
      const fechar = () => { if (fl) fl.fechar(); };
      const caixa = h("div", { class: "ini-kpis-escolha" }, h("b", null, "Indicadores do topo"),
        ...sels.map((sl, i) => h("label", { class: "ini-kpis-esc-l" }, h("span", null, `${i + 1}º`), sl)), msg,
        // plano 1000b · RB-180: a escolha fica neste aparelho (como as metas) — e isso é dito aqui
        h("small", { class: "rel-nota ini-kpis-nota" }, "Fica guardado neste aparelho."),
        h("div", { class: "ini-kpis-esc-acoes" },
          h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "kpis-padrao" }, on: { click: () => {
            gravarJson(chaveKpis, null);
            const pad = aplicarEscolhaKpis(kpisPadrao, kpisAlt, {});
            sels.forEach((x, i) => { x.value = pad[i].id; x.dataset.ant = x.value; });
            pintarKpis(); msg.textContent = "Indicadores de volta ao padrão.";
          } } }, "Voltar ao padrão"),
          h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { k: "kpis-pronto" }, on: { click: () => { fechar(); btKpis.focus(); } } }, "Pronto")));
      for (const sl of sels) { sl.dataset.ant = sl.value; sl.addEventListener("change", () => {
        // escolher um indicador que já está em outra posição TROCA os dois de lugar (nunca o mesmo duas vezes)
        const outro = sels.find(x => x !== sl && x.value === sl.value);
        if (outro) { outro.value = sl.dataset.ant; outro.dataset.ant = outro.value; }
        sl.dataset.ant = sl.value;
        const escolha = Object.fromEntries(sels.map(x => [x.dataset.pos, x.value]));
        gravarJson(chaveKpis, escolha);
        pintarKpis();               // RB-166: troca na hora e o flutuante fica aberto para a próxima troca
        msg.textContent = "Indicadores trocados.";
      }); }
      fl = ui.flutuante(btKpis, caixa, { classe: "ini-kpis-flut" });
    });
    // plano 1500c · RC-254: «Resumo do mês» — uma página para imprimir/salvar em PDF com os números do mês (mostrar ao sócio)
    const btResumo = h("button", { type: "button", class: "bt bt-fant bt-p ini-resumo-bt", dataset: { k: "resumo-mes" } }, ui.icone("folha"), "Resumo do mês");
    btResumo.addEventListener("click", () => abrirResumoMes(d, voc));
    // plano 2000d · DR-406: nos 3 primeiros dias, o resumo do mês que FECHOU pronto para mandar (com o que o servidor já manda do mês anterior)
    const diaHoje = Number(String(d.hoje || L.hojeSP()).slice(8, 10)) || 1;
    const linhasAnt = diaHoje <= 3 ? linhasResumoMesAnterior(d, { brl: v => L.textoMoeda(v, { centavos: false }) }) : null;
    const btResumoAnt = linhasAnt ? h("button", { type: "button", class: "bt bt-fant bt-p ini-resumo-bt", dataset: { k: "resumo-anterior" },
      on: { click: () => abrirResumoMes(d, voc, { anterior: true }) } }, ui.icone("folha"), `Resumo de ${mesPorExtenso(somarDiasIso(primeiroDiaMes(d.hoje || L.hojeSP()), -1).slice(0, 7)).split(" ")[0]}`) : null;
    // plano 2000d · DR-283: «Organizar o Início» liga o modo de mover os blocos (as setas aparecem em cada bloco)
    const btOrg = h("button", { type: "button", class: "bt bt-fant bt-p ini-org-bt", dataset: { k: "organizar" }, "aria-pressed": String(organizando) },
      ui.icone("editar"), organizando ? "Pronto" : "Organizar o Início");
    btOrg.addEventListener("click", () => {
      organizando = !organizando;
      raiz.classList.toggle("ini-organizando", organizando);
      btOrg.setAttribute("aria-pressed", String(organizando));
      btOrg.lastChild.textContent = organizando ? "Pronto" : "Organizar o Início";
      if (organizando && typeof ui.anunciar === "function") ui.anunciar("Use as setas de cada bloco para mudar a ordem; recolher esconde o bloco.");
    });
    corpo.append(h("div", { class: "ini-kpis-rod" }, btResumo, btResumoAnt, btKpis, btOrg));

    // ---- blocos (cada um é uma função: a ordem e o que fica recolhido vêm de L.blocosInicio + os blocos novos desta rodada + a ordem que a pessoa guardou)
    const numLink = (valor, rot, hash, k, destaque, chave) => {
      const conteudo = [num(valor, int, `ini-n${destaque ? " ini-n-destaque" : ""}`, chave), h("span", { class: "ini-n-l" }, rot)];
      return podeConversas
        ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, conteudo)
        : h("div", { class: "ini-numero" }, conteudo);
    };
    const numLead = (v, rot, chave, href, k) => {
      const conteudo = [num(v, int, "ini-n", chave), h("span", { class: "ini-n-l" }, rot)];
      return podeCrm ? h("a", { class: "ini-numero", href, dataset: { k } }, conteudo) : h("div", { class: "ini-numero" }, conteudo);
    };
    const espera = +c.espera_mais_antiga_min;
    const limEspera = limiteEspera(c);      // plano 1500c · RC-301
    const temAgenda = !!(agenda && Array.isArray(agenda.consultas));
    const agendaFalhou = !!(agenda && agenda.erro);     // não deu para ler agora (≠ conta sem agenda): «Tentar de novo»
    const agendaLendo = !!(agenda && agenda.lendo);     // 1ª pintura pelo cache, com a agenda a caminho
    const porHora = consultasPorHora(agenda, d.hoje), porDia = consultasPorDia(agenda, d.hoje, 7);
    const prox = proximasConsultas(agenda, { hoje: d.hoje, agora: Date.now() });
    const metas = lerMetas();
    const botaoTentar = k => h("div", { class: "ini-agora-acoes" },
      h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k }, on: { click: () => carregar({ forcar: true }) } }, "Tentar de novo"));
    const construtores = {
      // o estado de cada consulta (passou · agora · próxima) é do relógio de AGORA: o relógio de 60 s refaz este bloco
      agora: () => blocoAgora(c, proximasConsultas(agenda, { hoje: d.hoje, agora: Date.now() }), temAgenda, espera),     // RC-200: duração padrão vem da agenda

      atendimento: () => h("section", { class: "rel-cartao ini-atend rel-entra", "aria-labelledby": "ini-at", style: "--i:1" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-at", class: "rel-h2" }, "Atendimento agora"),
          +c.aguardando > 0 && Number.isFinite(espera)
            // plano 1000 (CR-158): o termo da vertical («paciente esperando há…»), não «cliente» fixo
            // plano 1000b · RB-160: com maiúscula e sem singular errado — «Paciente esperando há…» (um) ou «A mais antiga espera há…» (vários)
            // plano 1500c · RC-299/RC-301: a mesma escrita de espera da fila e o vermelho no prazo da empresa
            ? h("p", { class: `ini-espera${espera >= limEspera ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` ${fraseEspera(+c.aguardando, textoEspera(espera), { contato: voc.contato })}`)
            : h("p", { class: "rel-nota" }, "ninguém esperando resposta")),
        h("div", { class: "ini-numeros ini-numeros-4" },
          numLink(c.aguardando, "aguardando resposta", "#/conversas?aba=aguardando", "c-ag", +c.aguardando > 0, "conversas.aguardando"),
          numLink(c.sem_dono, "sem responsável", "#/conversas?aba=sem_dono", "c-sd", false, "conversas.sem_dono"),
          numLink(c.minhas, "com você", "#/conversas?aba=minhas", "c-mi", false, "conversas.minhas"),
          numLink(c.abertas, "abertas no total", "#/conversas?aba=abertas", "c-ab", false, "conversas.abertas"))),

      leads: () => h("section", { class: "rel-cartao ini-leads rel-entra", "aria-labelledby": "ini-ld", style: "--i:2" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ld", class: "rel-h2" }, "Leads")),
        // plano 1500c · RC-297: cada número abre a lista de quem são (hoje · de anúncio hoje · os 7 dias, hoje incluso)
        h("div", { class: "ini-numeros ini-numeros-3" },
          numLead(l.hoje, "hoje", "leads.hoje", `#/contatos?criado_de=${d.hoje || L.hojeSP()}`, "ld-hoje"),
          numLead(l.hoje_anuncio, "de anúncio hoje", "leads.hoje_anuncio", `#/contatos?criado_de=${d.hoje || L.hojeSP()}&origem=anuncio`, "ld-an"),
          numLead(l.semana, "nos últimos 7 dias", "leads.semana", `#/contatos?criado_de=${somarDiasIso(d.hoje || L.hojeSP(), -6)}`, "ld-sem")),
        // plano 2000d · DR-302: hoje × ontem ATÉ ESTA HORA (quando o servidor manda leads.ontem_ate_agora)
        leadsContraOntem(l) ? h("p", { class: "rel-nota ini-leads-ontem", dataset: { k: "ld-ontem" } }, leadsContraOntem(l).texto) : null,
        // plano 2000d · DR-133: quanto o lead do anúncio espera até o 1º contato (leads.primeiro_contato_media_min)
        tempoPrimeiroContato(d) ? h("p", { class: "ini-leads-contato", dataset: { k: "ld-contato" } }, ui.icone("relogio"),
          h("span", null, ` 1º contato com o lead de anúncio em ${tempoPrimeiroContato(d)}, em média`)) : null,
        +l.semana ? barraOrigem(l) : null,
        // plano 1500c · RC-183: um lead só → frase no singular
        +l.semana ? h("p", { class: "rel-nota" }, `${notaLeadsAnuncio(+l.semana, +l.semana_anuncio || 0)} É contagem do CRM, não conversões informadas pelo Meta/Google.`) : null,
        atalhosLeadsInicio({ crm: podeCrm, ads: podeAds }).length ? h("div", { class: "rel-cartao-rodape" },
          atalhosLeadsInicio({ crm: podeCrm, ads: podeAds }).map(a => h("a", { class: "rel-link", href: a.href }, a.rotulo))) : null),

      vendas: () => {
        const mv = L.mesVsAnterior(n);
        // plano 2000d · DA-215 (pendência da frente ads): sem base comparável (cliente que começou depois do mês passado, ou nada no mesmo
        // período) o chip, a barra do mês passado e a diferença em reais somem — antes «▲ novo · vs. R$ 0» parecia crescimento
        const comparavel = mv.comparavel !== false;
        const chipMes = comparavel ? L.chipVar(mv.atual, mv.anterior, "cima") : null;
        const ganhos = +n.ganhos_mes || 0, abertos = +n.abertos || 0;
        const txtAbertos = `${abertos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("aberto", abertos)} · ${brl0(n.valor_aberto)}`;
        // este mês × o mesmo pedaço do mês passado, em duas barras na mesma régua
        // plano 2000d · DR-300: a barra fantasma do mês passado INTEIRO na mesma régua (quanto falta para igualar o mês fechado)
        const inteiro = fin(mv.anteriorInteiro) && +mv.anteriorInteiro > 0 ? +mv.anteriorInteiro : null;
        const topoMes = Math.max(mv.atual, mv.anterior, inteiro || 0) || 1;
        const barraMes = (rot, v, cls) => h("div", { class: "ini-barra" },
          h("span", { class: "ini-barra-r" }, rot),
          h("span", { class: "ini-barra-t", "aria-hidden": "true" }, h("i", { class: cls, style: { "--w": `${v > 0 ? Math.max(2, v / topoMes * 100) : 0}%` } })),
          L.preencherMoeda(ui, h("b", { class: "ini-barra-v rel-num" }), v, { centavos: false }));
        const ateDia = mv.dia ? ` (até o dia ${mv.dia})` : "";
        // plano 1000 (CR-257): com meta de vendas, uma linha fina de progresso aqui mesmo (a meta mora no bloco Metas, que pode estar recolhido)
        const diaM = +n.dia_do_mes || Number(String(d.hoje || "").slice(-2)) || 1;
        const fracao = fracaoDoDiaSP(Date.now());      // plano 2000d · DR-250
        const pm = metas.vendas ? progressoMeta({ meta: metas.vendas, realizado: +n.receita_mes || 0, dia: diaM, diasNoMes: diasDoMes(d.hoje || L.hojeSP()), fracaoDia: fracao }) : null;
        // plano 2000d · DR-301: «se continuar assim» — a receita do mês no ritmo dos dias que passaram
        const proj = projecaoMes({ realizado: mv.atual, dia: diaM, diasNoMes: diasDoMes(d.hoje || L.hojeSP()), fracaoDia: fracao });
        // plano 2000d · DR-405: no dia 1 e 2, o mês passado fechado ao lado (o mês zerado não parece erro)
        const notaMes = notaInicioMes(n, d.hoje || L.hojeSP(), brl0);
        const linhaMetaVd = pm ? h("div", { class: ["ini-vd-meta", `ini-meta-${pm.estado}`] },
          h("div", { class: "ini-meta-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pm.pct)), // plano 1000b · RB-171: o ritmo esperado também para o leitor de tela (antes só no title do <b>, que só o mouse vê)
            "aria-label": `Meta de vendas do mês: ${pct(pm.pctReal)}; esperado hoje: ${brl0(pm.esperado)}` },
            h("i", { style: { "--w": `${pm.pct}%` } }), h("b", { style: { "--m": `${pm.ritmoPct}%` }, title: `Ritmo do calendário hoje: ${brl0(pm.esperado)}` })),
          h("p", { class: "rel-nota" }, pm.estado === "batida" ? `Meta de ${brl0(pm.meta)} batida.` : `Meta: ${pct(pm.pctReal)} de ${brl0(pm.meta)} · faltam ${brl0(pm.falta)}`)) : null;
        return h("section", { class: "rel-cartao ini-vendas rel-entra", "aria-labelledby": "ini-vd", style: "--i:3" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-vd", class: "rel-h2" }, "Vendas"),
            podeRel ? h("a", { class: "rel-link", href: "#/relatorios/vendas" }, "Ver relatório") : null),
          h("div", { class: "ini-mes" },
            h("p", { class: "rel-olho" }, "Receita do mês"),
            num(mv.atual, brl0, "ini-receita", "negocios.receita_mes"),
            chipMes ? h("p", { class: "ini-mes-l" },
              // plano 2000d · DR-281: a seta não é lida («mais 40% que o mesmo período do mês passado»)
              h("span", { class: `rel-var rel-var-${chipMes.cls}` }, h("span", { "aria-hidden": "true" }, chipMes.v == null ? chipMes.txt : `${chipMes.seta} ${chipMes.txt}`),
                h("span", { class: "sr-only" }, textoChipAcessivel(chipMes, "o mesmo período do mês passado"))),
              h("span", { class: "rel-nota" }, ` vs. ${brl0(mv.anterior)} no mesmo período do mês passado`))
              : h("p", { class: "rel-nota ini-mes-l", dataset: { k: "vd-sem-base" } }, "Ainda sem o mesmo período do mês passado para comparar."),
            notaMes ? h("p", { class: "rel-nota ini-mes-inicio", dataset: { k: "vd-inicio-mes" } }, notaMes) : null,
            proj ? h("p", { class: "ini-mes-proj", dataset: { k: "vd-proj" } }, ui.icone("grafico"), h("span", null, ` ${textoProjecao(proj, metas.vendas, brl0)}`)) : null,
            // plano 2000d · DR-402: quantos dias, em média, do lead à venda (negocios.dias_ate_ganho)
            fin(n.dias_ate_ganho) ? h("p", { class: "rel-nota", dataset: { k: "vd-dias" } }, `Do lead à venda: ${Math.round(+n.dias_ate_ganho)} ${Math.round(+n.dias_ate_ganho) === 1 ? "dia" : "dias"} em média.`) : null,
            // plano 1500c · RC-196: a diferença em reais, com sinal, ao lado do chip em %
            comparavel && textoDiferenca(mv.atual, mv.anterior, brl0) ? h("p", { class: ["ini-mes-dif", mv.atual >= mv.anterior ? "ini-dif-cima" : "ini-dif-baixo"], dataset: { k: "vd-dif" } }, textoDiferenca(mv.atual, mv.anterior, brl0)) : null,
            // plano 1500c · RC-194: «N ganhas no mês» abre o relatório de vendas (quais foram); sem relatório, o quadro
            h("p", { class: "rel-nota" }, (podeRel || podeCrm) && ganhos > 0
              ? h("a", { class: "rel-link", href: podeRel ? "#/relatorios/vendas" : "#/crm", dataset: { k: "vd-ganhos" } }, `${ganhos} ${ganhos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("ganho", ganhos)} no mês`)
              : `${ganhos} ${ganhos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("ganho", ganhos)} no mês`, inteiro ? ` · mês passado inteiro: ${brl0(mv.anteriorInteiro)}` : "")),
          linhaMetaVd,
          h("div", { class: "ini-barras", role: "img", "aria-label": `Receita deste mês${ateDia}: ${brl0(mv.atual)}${comparavel ? `; mesmo período do mês passado: ${brl0(mv.anterior)}` : ""}${inteiro ? `; mês passado inteiro: ${brl0(inteiro)}` : ""}` },
            barraMes("Este mês", mv.atual, "ini-b-atual"), comparavel ? barraMes(`Mês passado${ateDia}`, mv.anterior, "ini-b-antes") : null,
            inteiro ? barraMes("Mês passado inteiro", inteiro, "ini-b-fant") : null),
          h("div", { class: "ini-numeros ini-numeros-2" },
            (podeCrm ? h("a", { class: "ini-numero", href: "#/crm", dataset: { k: "n-ab" } }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))
              : h("div", { class: "ini-numero" }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))),
            // plano 1500c · RC-195: a previsão abre o resumo do quadro e o «i» explica no toque (antes só title, que o celular não mostra)
            h("div", { class: "ini-numero-env" },
              (podeCrm ? h("a", { class: "ini-numero", href: "#/crm?resumo=1", dataset: { k: "n-prev" } }, num(n.previsao_ponderada, brl0, "ini-n", "negocios.previsao_ponderada"), h("span", { class: "ini-n-l" }, "previsão pela chance de cada etapa"))
                : h("div", { class: "ini-numero" }, num(n.previsao_ponderada, brl0, "ini-n", "negocios.previsao_ponderada"), h("span", { class: "ini-n-l" }, "previsão pela chance de cada etapa"))),
              botaoAjuda("vd-prev", "Previsão", `Soma do valor previsto multiplicado pela chance (probabilidade) da etapa de cada ${voc.negocio} ${adj("aberto", 1)}.`))));
      },

      tarefas: () => {
        const lista = h("ul", { class: "ini-tarefas" });
        ordenarTarefas(t.proximas).forEach(tf => lista.append(itemTarefa(tf)));     // plano 1500c · RC-193: atrasadas no topo
        if (!lista.childElementCount) lista.append(h("li", { class: "rel-vazio-txt ini-tf-vazio" }, ui.vazio({ tipo: "sem_resultado", tema: "crm", titulo: "Nenhuma tarefa aberta com você." })));
        const numT = (v, rot, hash, k, cls, chave) => podeTarefas
          ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, num(v, int, cls, chave), h("span", { class: "ini-n-l" }, rot))
          : h("div", { class: "ini-numero" }, num(v, int, cls, chave), h("span", { class: "ini-n-l" }, rot));
        return h("section", { class: "rel-cartao ini-tf rel-entra", "aria-labelledby": "ini-tf", style: "--i:4" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-tf", class: "rel-h2" }, "Tarefas"),
            podeTarefas ? h("a", { class: "rel-link", href: "#/tarefas" }, "Ver todas") : null),
          h("div", { class: "ini-numeros ini-numeros-2" },
            numT(t.hoje, "para hoje", "#/tarefas?aba=hoje", "t-hj", "ini-n", "tarefas.hoje"),
            numT(t.atrasadas, +t.atrasadas === 1 ? "atrasada" : "atrasadas", "#/tarefas?aba=atrasadas", "t-at", `ini-n${+t.atrasadas ? " ini-n-ruim" : ""}`, "tarefas.atrasadas")),
          // plano 2000d · DR-125 (pendência da frente crm): as abertas SEM prazo também contam («Sem prazo (3)»), como o selo da tela de Tarefas
          (() => { const sp = tarefasSemPrazo(t); return sp ? h("p", { class: "rel-nota ini-tf-semprazo", dataset: { k: "t-semprazo" } }, podeTarefas
            ? h("a", { class: "rel-link", href: "#/tarefas" }, `Sem prazo (${sp.n}${sp.pelomenos ? "+" : ""})`) : `Sem prazo (${sp.n}${sp.pelomenos ? "+" : ""})`) : null; })(),
          h("p", { class: "rel-olho ini-sub" }, "Próximas"), lista);
      },

      numeros: () => {
        const canais = d.canais || [];
        const lc = h("ul", { class: "ini-canais" });
        for (const k of canais) {
          // B5: o estado do aparelho (contrato 4) vence o status de cadastro — conectado no cadastro, desconectado no celular é «desconectado»
          const tCaiu = Date.parse(k.desde || "");
          const e = k.estado === "desconectado" ? { nivel: "ruim", texto: Number.isFinite(tCaiu) ? `Desconectado há ${duracaoCurta((Date.now() - tCaiu) / 60000)}` : "Desconectado" } : L.estadoCanal(k);
          lc.append(h("li", { class: `ini-canal ini-c-${e.nivel}` },
            h("span", { class: "ini-canal-luz", "aria-hidden": "true" }),
            h("div", { class: "ini-canal-t" },
              h("p", { class: "ini-canal-n" }, String(k.nome || "").trim() || (k.numero_exibicao ? "Número de WhatsApp" : "Número sem nome"), k.numero_exibicao ?     /* plano 2000d · IY-063 */ h("span", { class: "rel-nota" }, ` · ${k.numero_exibicao}`) : null),
              h("p", { class: "rel-nota" }, e.texto, k.ultima_entrada_em ? ` · última mensagem recebida ${L.quandoSP(k.ultima_entrada_em)}` : " · nenhuma mensagem recebida ainda"),
              // plano 1000 (CR-175): o texto técnico da API (em inglês) só para o admin, recolhido; para todos, a frase do estado já está acima
              // plano 1500c · RC-214: «Copiar» o erro para mandar ao suporte (antes era preciso selecionar o texto)
              k.status === "erro" && k.ultimo_erro && admin ? h("details", { class: "ini-canal-erro" }, h("summary", null, "Detalhe técnico"), h("p", null, String(k.ultimo_erro).slice(0, 200)),
                typeof ui.copiar === "function" ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: `cn-copiar-${k.id}` },
                  on: { click: () => ui.copiar(`${k.nome || "Número"}${k.numero_exibicao ? ` (${k.numero_exibicao})` : ""}: ${String(k.ultimo_erro)}`, { aviso: "Erro copiado." }) } }, "Copiar") : null) : null),
            // plano 1500c · RC-213: «Testar» manda uma mensagem ao próprio número do admin — só quando o servidor diz que sabe (canais[].pode_testar)
            admin && k.pode_testar === true ? botaoTestarCanal(k) : null));
        }
        if (!canais.length) lc.append(h("li", { class: "rel-vazio-txt" }, ctx.pode("admin")
          ? "Nenhum número conectado. Conecte o WhatsApp da empresa em Configurações → Números."
          : "Nenhum número conectado. Peça ao administrador para conectar o WhatsApp."));
        return h("section", { class: "rel-cartao ini-num rel-entra", "aria-labelledby": "ini-nm", style: "--i:5" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-nm", class: "rel-h2" }, "Números de WhatsApp"),
            ctx.pode("admin") ? h("a", { class: "rel-link", href: "#/config/numeros" }, canais.length ? "Gerenciar" : "Conectar") : null),
          lc);
      },

      horas: () => blocoHoras(porHora, porDia, temAgenda),
      metas: () => blocoMetas(metas, n, d.hoje, agendaMes),
      funil: () => blocoFunil(funil),
      esfriando: () => blocoEsfriando(esfriando),
      equipe: () => blocoEquipe(equipe),
      desde: () => blocoDesde(desde),
    };
    const NOMES = { agora: "Agora", atendimento: "Atendimento", tarefas: "Tarefas", numeros: "Números de WhatsApp", vendas: "Vendas", funil: "Funil do mês", leads: "Leads", horas: "Agenda de hoje e da semana", metas: "Metas do mês",
      esfriando: `${cap(voc.negocios)} esfriando`, equipe: "Equipe no mês", desde: "Desde que você começou" };
    // plano 1500c · RC-339/RC-219/RC-325: os blocos novos só existem quando o servidor manda o campo (RPC antiga: nada inventado)
    // plano 2000d · DR-260/DR-356: a equipe também para quem não administra — só a própria linha e a posição (equipeVisivel)
    const esfriando = podeCrm ? listaEsfriando(d) : null, equipeTodos = equipeMes(d, contaId), equipe = equipeTodos ? equipeVisivel(equipeTodos, { admin }) : null, desde = admin ? desdeInicio(d) : null;
    const { abertos, recolhidos } = L.blocosInicio(d);
    // B5: número desconectado no aparelho abre o bloco dos números (L.blocosInicio só olha o status de cadastro)
    if ((d.canais || []).some(k => k && k.estado === "desconectado") && recolhidos.includes("numeros")) { recolhidos.splice(recolhidos.indexOf("numeros"), 1); abertos.push("numeros"); }
    // os blocos novos: «Agora» abre quando há alguém esperando ou consulta pela frente; as barras quando há consulta na semana; as metas quando há meta;
    // o funil do mês (B1) só existe quando o servidor manda funil_mes (RPC antiga: nenhum bloco, nada inventado) e abre com algum lead ou venda no mês
    const funil = funilMes(d, { voc });
    const novos = [["agora", (+c.aguardando || 0) > 0 || (temAgenda && (prox.visiveis.length > 0 || prox.futuras.length > 0)) || !!(podeCrm && listaSemData(d)) || !!aniversariantesHoje(d)],
      ["horas", temAgenda && porDia.total > 0], ["metas", !!(metas.vendas || metas.consultas || metas.leads)], funil ? ["funil", !funil.vazio] : null,
      esfriando ? ["esfriando", true] : null, desde ? ["desde", true] : null, equipe ? ["equipe", false] : null].filter(Boolean);
    for (const [id, aberto] of novos) (aberto ? abertos : recolhidos).push(id);
    const prefs = lerBlocos();
    // plano 2000d · DR-271 + DU-242: a ordem padrão depende do papel (o dono vê o mês primeiro) e do objetivo das boas-vindas
    const ordemBase = ordemPadraoBlocos({ admin, objetivo: lerObjetivo(), ordemDoInicio: R && typeof R.ordemDoInicio === "function" ? R.ordemDoInicio : null, urgente: (+c.aguardando || 0) > 0 });
    const padrao = ids => ids.slice().sort((a, b) => ordemBase.indexOf(a) - ordemBase.indexOf(b));
    const ordemAbertos = ordenarBlocos(padrao(abertos), prefs.ordem), ordemRecolhidos = ordenarBlocos(padrao(recolhidos), prefs.ordem);
    const personalizado = prefs.ordem.length > 0 || prefs.recolhidos.length > 0;
    // RC-208: o recolhido é relido (recolher não redesenha mais; o relógio refaz «Agora»/barras com a preferência de agora)
    const bloco = (id, lista, i) => envolverBloco(id, construtores[id](), NOMES[id], { recolhido: lerBlocos().recolhidos.includes(id), podeAntes: i > 0, podeDepois: i < lista.length - 1,
      ordemAtual: [...ordemAbertos, ...ordemRecolhidos] });

    // sem pendência (e com algo a dizer na manchete): o selo "Tudo em dia."
    if (!m.pendencia && m.contexto) {
      // plano 1500c · RC-188: o tempo livre tem um próximo passo — as oportunidades paradas há 7+ dias no quadro
      corpo.append(h("div", { class: "ini-em-dia rel-entra" }, ui.vazio({ tipo: "em_dia", titulo: "Tudo em dia.", texto: "Ninguém esperando resposta e nenhuma tarefa para hoje.",
        acao: podeCrm ? { rotulo: `Ver ${voc.negocios} ${adj("parado")} há 7+ dias`, fn: () => ctx.navegar("#/crm?parados=7") } : null })));
    }
    if (abertos.length) corpo.append(h("div", { class: "ini-grade" }, ordemAbertos.map((id, i) => bloco(id, ordemAbertos, i))));
    if (recolhidos.length) {
      const det = h("details", { class: "ini-mais", open: maisAberto },
        h("summary", {}, h("span", { class: "ini-mais-t" }, "Mais detalhes"), h("span", { class: "rel-nota" }, ordemRecolhidos.map(id => NOMES[id]).join(" · "))),
        h("div", { class: "ini-grade" }, ordemRecolhidos.map((id, i) => bloco(id, ordemRecolhidos, i))));
      // plano 1500c · RC-207: aberto/fechado fica guardado neste aparelho (junto da ordem dos blocos)
      det.addEventListener("toggle", () => { maisAberto = det.open; const p = lerBlocos(); if (p.mais !== det.open) { p.mais = det.open; gravarBlocos(p); } });
      corpo.append(det);
    }
    if (personalizado) corpo.append(rodapeRestaurar());
    // O atendimento e as tarefas abertas têm prioridade sobre o checklist de configuração.
    if (onbRes) corpo.append(cartaoChecklist(onbRes));

    // o número que mudou desde a última leitura acende (resposta ao dado) — no bloco e no KPI do topo
    // plano 2000d · IY-021/IY-022: + o prazo, a indicação e as consultas de hoje (numerosExtrasMudaram)
    if (antes) for (const chave of [...L.numerosMudaram(antes, d), ...numerosExtrasMudaram(antes, d, { agAntes: agendaAntes, agDepois: agenda })]) for (const el of corpo.querySelectorAll(`[data-n="${chave}"]`)) G.destacar(el);
    trocar().then(() => { for (const f of contarDepois) f(); });
    if (foco || blocoFoco) {
      const achar = k => raiz.querySelector(`[data-k="${CSS.escape(k)}"]`);
      const usavel = el => !!el && !el.disabled;
      let alvo = foco ? achar(foco) : null, rolar = false;
      // o botão sumiu («Restaurar ordem», metas) ou voltou desligado (bloco movido para a ponta): o foco vai para o vizinho, à vista
      if (!usavel(alvo)) { alvo = alternativasFoco(foco, { bloco: blocoFoco, primeiro: ordemAbertos[0] || ordemRecolhidos[0] || null }).map(achar).find(usavel) || null; rolar = true; }
      if (alvo) alvo.focus({ preventScroll: !rolar });
    }

    // relógio (a cada minuto, sem dado novo): «Agora» (às HH:MM, «em 20 min», passou · agora · próxima) e a hora destacada das barras andam.
    // O bloco com o foco dentro fica como está; nada anima de novo; as barras só são refeitas na virada da hora.
    let horaBarras = horaSP(new Date());
    relogio = () => {
      const horaAgora = horaSP(new Date());
      for (const id of ["agora", "horas"]) {
        if (id === "horas" && horaAgora === horaBarras) continue;
        const velho = corpo.querySelector(`section[data-bloco="${id}"]`);
        if (!velho || !velho.parentNode || velho.contains(document.activeElement)) continue;
        const lista = ordemAbertos.includes(id) ? ordemAbertos : ordemRecolhidos;
        quieto = true;
        try {
          const novo = bloco(id, lista, lista.indexOf(id));
          novo.classList.remove("rel-entra");
          velho.parentNode.insertBefore(novo, velho); velho.remove();
        } finally { quieto = false; }
        if (id === "horas") horaBarras = horaAgora;
      }
    };

    /* ---- os pedaços novos desta rodada (fecham sobre d, agenda e num) ---- */

    /** Cartão de KPI (link quando a pessoa pode abrir a tela): rótulo, número grande em Plex, seta contra o dia anterior, legenda e a linha dos últimos dias.
        A linha vem de G.sparkline (frente A) quando existir — senão do desenho mínimo daqui. O cartão em si é desta tela (ui.kpi ainda não tem CSS no app.css;
        quando tiver, a migração é trocar este corpo por ui.kpi dentro do mesmo envelope). */
    function cartaoKpi(k, hist, diasHist, num) {
      // B2: a série de 14 dias do servidor vale primeiro; sem ela, o histórico deste aparelho (a partir do 3º dia)
      const srv = serieServidor(d, k.chave);
      const serie = srv ? srv.valores : serieHistorico(hist, k.chave);
      const ontem = srv && srv.ontem !== null && k.valor !== null ? { atual: +k.valor, anterior: srv.ontem, dia: somarDiasIso(d.hoje || L.hojeSP(), -1) } : null;
      const varH = srv ? ontem : variacaoHistorico(hist, k.chave);
      const chip = varH && k.valor !== null ? L.chipVar(varH.atual, varH.anterior, k.sentido) : null;
      const idAj = `ini-kpi-aj-${k.id}`;
      const notaHist = srv ? (srv.mesma ? ` Linha: últimos ${serie.length} dias (contagem do servidor).` : ` Linha: ${srv.linha || "por dia"} nos últimos ${serie.length} dias (contagem do servidor).`)
        : serie ? ` Linha: últimos ${serie.length} dias de leitura neste aparelho.` : diasHist > 0 && k.id !== "prazo" ? " A linha de tendência aparece a partir do 3º dia de uso neste aparelho." : "";
      const ajuda = `${k.ajuda}${notaHist}`;
      const chaveN = chaveDestaqueKpi(k.id);       // plano 1000b · RB-154: receita/previsão/atrasadas acendem com o próprio número
      const fmtPct = pct;     // no número grande em Plex o espaço antes do % abria um buraco
      let valorEl;
      // plano 1000b · RB-165: aria-label num <b> sem papel é ignorado — o traço some para o leitor e o «sem dado» vai em texto
      if (k.valor === null) valorEl = h("span", { class: "ini-kpi-vs" }, h("b", { class: "ini-kpi-v rel-num", "aria-hidden": "true" }, "—"), h("span", { class: "sr-only" }, "sem dado"));
      else {
        valorEl = num(k.valor, k.formato === "brl" ? brl0 : k.formato === "pct" ? fmtPct : int, "ini-kpi-v", chaveN);
        // cartão estreito (2 colunas a 360 px): R$ de 7 dígitos ou mais troca pela forma curta («R$ 1,2 mi») por container query
        // plano 2000d · DR-274: a partir de R$ 100 mil (R$ 480.000 também estourava as 2 colunas a 360 px)
        if (k.formato === "brl" && Math.abs(+k.valor) >= LIMITE_FORMA_CURTA && typeof ui.numCompacto === "function") {
          valorEl.classList.add("ini-kpi-v-longo");
          valorEl = h("span", { class: "ini-kpi-vs" }, valorEl, h("b", { class: "ini-kpi-v ini-kpi-v-curto rel-num", "aria-hidden": "true" }, `R$ ${ui.numCompacto(+k.valor)}`));
        }
      }
      const sp = h("span", { class: "ini-kpi-sp", "aria-hidden": "true" });
      // plano 1500c · RC-189: o resumo da linha no formato do KPI (R$ com milhar, inteiro, %)
      const fmtK = k.formato === "brl" ? (v => L.textoMoeda(v, { centavos: false })) : k.formato === "pct" ? pct : int;
      if (serie && k.valor !== null) sparkline(sp, serie, k.rotulo, fmtK); else sp.classList.add("ini-kpi-sp-vazia");
      // plano 1500c · RC-234: quando a linha mede OUTRA coisa que o número grande («conversas novas por dia» sob «Esperando resposta»), uma legenda visível
      const legLinha = srv && !srv.mesma && serie && k.valor !== null && srv.linha ? h("span", { class: "ini-kpi-sp-leg", "aria-hidden": "true" }, `linha: ${srv.linha}`) : null;
      // plano 1000 (CR-179): sem «title» (o leitor lia a ajuda duas vezes: title + aria-describedby) — o hover usa a dica da biblioteca (ui.dica, sem descrever de novo)
      // plano 2000d · DR-280: a tendência da linha em palavras (o desenho é aria-hidden) — «subindo nos últimos 14 dias»
      const tendTxt = serie && k.valor !== null && typeof G.resumoTendencia === "function" ? G.resumoTendencia(serie, { linha: srv && !srv.mesma ? srv.linha : null }) : "";
      const contraTxt = chip ? rotuloContraDia(varH.dia, d.hoje || L.hojeSP()) : "";
      const cartao = h(k.href ? "a" : "div", { class: ["ini-kpi", `ini-kpi-${k.tom || "neutro"}`, serie && "ini-kpi-com-linha"], href: k.href, dataset: { k: `kpi-${k.id}`, kpi: k.id }, "aria-describedby": idAj },
        h("span", { class: "ini-kpi-l" }, k.rotulo),
        h("span", { class: "ini-kpi-linha" }, valorEl,
          // plano 2000d · DR-281: a seta é aria-hidden e o leitor ouve «mais 12% que ontem» (antes «triângulo para cima 12%»)
          chip ? h("span", { class: `rel-var rel-var-${chip.cls}`, title: `contra o dia ${L.ddmmIso(varH.dia)}` },
            h("span", { "aria-hidden": "true" }, chip.v == null ? chip.txt : `${chip.seta} ${chip.txt}`), h("span", { class: "sr-only" }, textoChipAcessivel(chip, contraTxt))) : null,
          // plano 1500c · RC-235: contra quando, à vista (antes só no title, que o toque não mostra)
          chip ? h("span", { class: "ini-kpi-vs-dia", "aria-hidden": "true" }, contraTxt) : null),
        h("span", { class: "ini-kpi-sub rel-nota" }, k.sub || ""),
        sp, legLinha,
        tendTxt ? h("span", { class: "sr-only", dataset: { k: `kpi-tend-${k.id}` } }, tendTxt) : null,
        // plano 2000d · DR-279: a descrição lida a cada Tab é curta (a 1ª frase da ajuda, até 90 letras, e de onde vem a linha);
        // a ajuda inteira fica no «i» (e na dica do mouse)
        h("span", { class: "sr-only", id: idAj }, `${descricaoCurta(k.ajuda)}${notaHist}`));
      if (typeof ui.dica === "function") { try { ui.dica(cartao, ajuda, { descrever: false }); } catch { /* sem dica: a ajuda continua para o leitor de tela */ } }
      // plano 1000b · RB-179: o «i» é um botão À PARTE (fora do link: botão dentro de <a> não vale) — no toque mostra a ajuda sem navegar;
      // tocar no número continua abrindo a tela. O leitor de tela segue ouvindo a ajuda pela descrição do cartão.
      const btAj = h("button", { type: "button", class: "bt-icone ini-kpi-i ini-kpi-ajuda", "aria-label": `O que é «${k.rotulo}»?`, "aria-haspopup": "dialog",
        "aria-expanded": "false", dataset: { k: `kpi-aj-${k.id}` } }, ui.icone("info"));
      btAj.addEventListener("click", ev => {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (typeof ui.flutuante !== "function") return;
        ui.flutuante(btAj, h("p", { class: "ini-kpi-ajuda-txt" }, ajuda), { classe: "ini-kpi-ajuda-flut" });
      });
      return h("div", { class: "ini-kpi-env", dataset: { kpiEnv: k.id } }, cartao, btAj);
    }

    /** «Agora»: quem espera resposta (com ação) e as próximas consultas de hoje com o relógio (passou · agora · próxima), cada uma abrindo o negócio. */
    function blocoAgora(c, prox, temAgenda, espera) {
      const aguard = +c.aguardando || 0, semDono = +c.sem_dono || 0;
      const colCv = h("div", { class: "ini-agora-col ini-agora-cv" }, h("p", { class: "rel-olho" }, "Conversas"));
      const fila = aguard > 0 ? listaEspera(c) : null;      // B4: quem espera, com «Assumir» (RPC nova; sem ela, só o número e os botões)
      if (aguard > 0) {
        colCv.append(...[
          h("p", { class: "ini-agora-n" }, num(aguard, int, "ini-agora-num"), " ", h("span", { class: "ini-agora-l" }, aguard === 1 ? `${voc.contato} esperando resposta` : `${voc.contatos} esperando resposta`)),
          // plano 1500c · RC-299: a mesma escrita da fila (duracaoCurta); RC-301: o vermelho no prazo da empresa
          Number.isFinite(espera) && espera >= 1 ? h("p", { class: `rel-nota ini-agora-espera${espera >= limEspera ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` a mais antiga espera há ${textoEspera(espera)}`) : null,
          fila && fila.length ? h("ol", { class: "ini-espera-lista", "aria-label": `${cap(voc.contatos)} esperando resposta` }, fila.map(itemEspera)) : null,
          // plano 1000b · RB-178: «+2 na fila» leva às Conversas aguardando (quando a pessoa pode abrir)
          fila && fila.length && aguard > fila.length ? h("p", { class: "rel-nota" }, podeConversas
            ? h("a", { class: "rel-link", href: "#/conversas?aba=aguardando", dataset: { k: "ag-fila" } }, `+${aguard - fila.length} na fila`)
            : `+${aguard - fila.length} na fila`) : null,
          h("div", { class: "ini-agora-acoes" },
            podeConversas ? h("a", { class: "bt bt-prim bt-p", href: "#/conversas?aba=aguardando", dataset: { k: "ag-abrir" } }, "Responder agora") : null,
            podeConversas && semDono > 0 ? botaoSemDono(semDono) : null),
        ].filter(Boolean));
      } else {
        colCv.append(h("p", { class: "ini-agora-ok" }, ui.icone("check"), h("span", null, "Ninguém esperando resposta")),
          semDono > 0 && podeConversas
            ? h("div", { class: "ini-agora-acoes" }, botaoSemDono(semDono))
            // plano 2000d · DR-335: «14 conversas em andamento» (abertas ≠ esperando: «abertas no total» logo depois de «ninguém esperando» confundia)
            : h("p", { class: "rel-nota", dataset: { k: "ag-andamento" } }, `${+c.abertas || 0} ${plural(+c.abertas || 0, "conversa em andamento", "conversas em andamento")}`));
      }
      // plano 1500c · RC-338: aniversariantes do dia — a recepção manda os parabéns daqui (abre a conversa ou a ficha)
      const aniv = aniversariantesHoje(d);
      if (aniv) colCv.append(h("div", { class: "ini-aniv", dataset: { k: "aniv" } },
        h("p", { class: "ini-aniv-t" }, `${aniv.length === 1 ? "Faz aniversário hoje" : `${aniv.length} fazem aniversário hoje`}`),
        h("ul", { class: "ini-aniv-lista" }, aniv.slice(0, 4).map(itemAniv)),
        // plano 1500c · IC-018: mais de 4 aniversariantes → «+N» com os nomes na dica (antes os outros sumiam sem aviso)
        // plano 2000d · DR-255: «+3 aniversariantes» abre os outros aqui mesmo, cada um com o seu «Dar parabéns»
        aniv.length > 4 ? maisAniv(aniv.slice(4)) : null));
      const colAg = h("div", { class: "ini-agora-col ini-agora-ag" }, h("p", { class: "rel-olho" }, cap(palavra.varios)));
      if (agendaLendo) colAg.append(h("p", { class: "rel-nota" }, "Lendo a agenda…"));
      else if (agendaFalhou) colAg.append(h("p", { class: "rel-nota rel-txt-aten" }, "Não consegui ler a agenda agora."), botaoTentar("ag-tentar"));
      else if (!temAgenda) colAg.append(h("p", { class: "rel-nota" }, TEXTO_SEM_AGENDA));     // plano 2000d · DR-258
      else if (!prox.hoje.length && !prox.futuras.length) {
        colAg.append(...[
          h("p", { class: "rel-nota" }, `${ga.nenhuma} ${palavra.um} ${ga.marcada} nos próximos 7 dias.`     /* plano 2000d · IY-041 */),
          podeAgenda ? h("div", { class: "ini-agora-acoes" }, h("a", { class: "bt bt-sec bt-p", href: "#/agenda" }, "Abrir agenda")) : null,
        ].filter(Boolean));
      } else {
        const semana = !prox.visiveis.length;
        const itens = semana ? prox.futuras : prox.visiveis;
        if (prox.diaAcabou) colAg.append(h("p", { class: "rel-nota" }, `${prox.hoje.length === 1 ? `${cap(ga.a)} ${palavra.um} de hoje já aconteceu` : `${cap(ga.as)} ${prox.hoje.length} ${palavra.varios} de hoje já aconteceram`}. ${ga.proximas}:`     /* plano 2000d · IY-041 */));
        else if (prox.passadas) colAg.append(h("p", { class: "rel-nota" }, `${prox.passadas} já ${plural(prox.passadas, "aconteceu", "aconteceram")} hoje · ${prox.restantes} pela frente`));
        else if (!semana) colAg.append(h("p", { class: "rel-nota" }, `${prox.restantes} pela frente hoje`));
        else colAg.append(h("p", { class: "rel-nota" }, `Nenhuma hoje. Próximas da semana:`));
        colAg.append(h("ol", { class: "ini-prox", "aria-label": semana ? `${ga.proximas} ${palavra.varios} da semana` : `${cap(palavra.varios)} de hoje` }, itens.map(it => itemConsulta(it, semana))));
        const sobra = semana ? 0 : prox.restantes - prox.visiveis.length;
        // plano 1500c · RC-203: «+3 depois» abre a agenda de hoje
        if (sobra > 0 || podeAgenda) colAg.append(h("div", { class: "rel-cartao-rodape ini-agora-rodape" }, sobra > 0
          ? (podeAgenda ? h("a", { class: "rel-link", href: `#/agenda?dia=${d.hoje || L.hojeSP()}`, dataset: { k: "px-depois" } }, `+${sobra} depois`) : h("span", { class: "rel-nota" }, `+${sobra} depois`)) : null,
          podeAgenda ? h("a", { class: "rel-link", href: "#/agenda" }, "Ver agenda") : null));
      }
      // plano 1500c · RC-201: as de hoje que passaram sem presença marcada — cada uma abre o negócio para marcar Compareceu/Faltou
      const semPres = temAgenda && podeCrm ? prox.semPresenca || [] : [];
      if (semPres.length) colAg.append(h("div", { class: "ini-sempres", dataset: { k: "sempres" } },
        h("p", { class: "ini-sempres-t" }, ui.icone("alerta"), h("span", null, `${semPres.length} ${plural(semPres.length, "passou", "passaram")} sem presença marcada`)),
        h("ol", { class: "ini-sempres-lista", "aria-label": `${cap(palavra.varios)} de hoje sem presença marcada` }, semPres.slice(0, 4).map(it => {
          const nome = it.nome || it.titulo || `${cap(palavra.um)} sem nome`, hora = L.horaSP(it.inicio);
          return h("li", { class: "ini-sempres-item" }, h("span", { class: "rel-num ini-sempres-h" }, hora), h("span", { class: "ini-sempres-nome" }, nome),
            h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `pr-${it.negocio_id}` }, "aria-label": `Marcar a presença de ${nome}, às ${hora}`,
              on: { click: () => pontes.abrirNegocio(it.negocio_id, { aba: "presenca", aoMudar: () => carregar({ forcar: true }) }) } }, "Marcar presença"));
        })),
        // plano 1500c · IC-019: mais de 4 sem presença → «+N na agenda de hoje» (antes os outros sumiam)
        semPres.length > 4 ? (podeAgenda ? h("a", { class: "rel-link", href: `#/agenda?dia=${d.hoje || L.hojeSP()}`, dataset: { k: "pr-mais" } }, `+${semPres.length - 4} na agenda de hoje`)
          : h("p", { class: "rel-nota", dataset: { k: "pr-mais" } }, `+${semPres.length - 4} sem presença`)) : null,
        // plano 2000d · DR-293: «Todos compareceram» marca de uma vez (nx_agenda_presenca em cada uma), com «Desfazer»
        semPres.length >= 2 && escreve ? botaoTodosCompareceram(semPres) : null));
      // plano 1000 (CR-217): quem está «agendado» sem data — a agenda e o lembrete não sabem dele; cada um abre o negócio para marcar
      const semData = podeCrm ? listaSemData(d) : null;
      if (semData) colAg.append(blocoSemData(semData));
      return h("section", { class: "rel-cartao ini-agora rel-entra", "aria-labelledby": "ini-ag", style: "--i:1" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ag", class: "rel-h2" }, "Agora"), h("p", { class: "rel-nota" }, `às ${L.horaSP(new Date())}`)),
        h("div", { class: "ini-agora-grade" }, colCv, colAg));
    }
    /** plano 2000d · DR-293: marca «compareceu» em todas as que passaram sem presença; «Desfazer» limpa de novo. Falha em uma → diz quantas foram. */
    function botaoTodosCompareceram(lista) {
      const bt = h("button", { type: "button", class: "bt bt-sec bt-p ini-sempres-todos", dataset: { k: "pr-todos" },
        "aria-label": `Marcar que ${lista.length === 1 ? "compareceu" : `as ${lista.length} compareceram`}` }, "Todos compareceram");
      bt.addEventListener("click", async () => {
        if (bt.disabled) return;
        if (semRede()) { ui.toast("Sem internet: tente de novo quando a conexão voltar.", { tipo: "erro" }); return; }
        bt.disabled = true;
        const feitos = [];
        // plano 2000d · IY-062: as marcações saem juntas (antes uma de cada vez: 8 consultas = 8 idas e voltas esperando em fila)
        const rs = await Promise.allSettled(lista.map(it => Promise.resolve().then(() => ctx.api.rpcC("nx_agenda_presenca", { p_negocio: it.negocio_id, p_estado: "compareceu" }))));
        rs.forEach((r, i) => { if (r.status === "fulfilled") feitos.push(lista[i].negocio_id); else console.error(r.reason); });
        if (minha !== montagem) return;
        const voltar = async () => {
          for (const id of feitos) { try { await ctx.api.rpcC("nx_agenda_presenca", { p_negocio: id, p_estado: "limpar" }); } catch (e) { console.error(e); } }
          if (minha === montagem) carregar({ forcar: true });
        };
        if (!feitos.length) { bt.disabled = false; ui.toast("Não foi possível marcar a presença agora.", { tipo: "erro" }); return; }
        ui.toast(feitos.length === lista.length ? `Presença marcada em ${feitos.length}.` : `Presença marcada em ${feitos.length} de ${lista.length}; as outras ficaram como estavam.`,
          { tipo: feitos.length === lista.length ? "ok" : "erro", desfazer: () => { voltar(); } });
        carregar({ forcar: true });
      });
      return bt;
    }
    /** plano 2000d · DR-256: um aniversariante com «Dar parabéns» — a conversa abre com o texto pronto no campo (a recepção revisa e envia). */
    function itemAniv(x) {
      const href = podeConversas ? hrefComTexto({ conversaId: x.conversaId, contatoId: x.contatoId }, textoParabens(x.nome, ctx.cliente.nome || "")) : null;
      return h("li", null, h("span", { class: "ini-aniv-nome" }, x.nome),
        href ? h("a", { class: "bt bt-fant bt-p", href, dataset: { k: `aniv-${x.contatoId ?? x.conversaId}` }, "aria-label": `Dar parabéns a ${x.nome}` }, "Dar parabéns") : null);
    }
    /** plano 2000d · DR-255: «+3 aniversariantes» — botão que mostra os outros (aria-expanded), sem sair da tela. */
    function maisAniv(resto) {
      const lista = h("ul", { class: "ini-aniv-lista ini-aniv-resto", id: "ini-aniv-resto", hidden: true }, resto.map(itemAniv));
      const bt = h("button", { type: "button", class: "link ini-aniv-mais", dataset: { k: "aniv-mais" }, "aria-expanded": "false", "aria-controls": "ini-aniv-resto",
        title: resto.map(x => x.nome).join(", ") }, textoMaisAniv(resto.length));
      bt.addEventListener("click", () => { const abrir = lista.hidden; lista.hidden = !abrir; bt.setAttribute("aria-expanded", String(abrir)); bt.textContent = abrir ? "Mostrar menos" : textoMaisAniv(resto.length); });
      return h("div", { class: "ini-aniv-mais-env" }, bt, lista);
    }
    /** plano 1000b · RB-243: «Sem responsável · N» diz para que serve (abre a fila para assumir) no nome acessível e na dica. */
    function botaoSemDono(n) {
      return h("a", { class: "bt bt-sec bt-p", href: "#/conversas?aba=sem_dono", dataset: { k: "ag-semdono" }, "aria-label": rotuloSemDono(n), title: rotuloSemDono(n) }, `Sem responsável · ${n}`);
    }
    function blocoSemData(sd) {
      const sobra = sd.total - sd.itens.length;
      return h("div", { class: "ini-semdata", dataset: { k: "semdata" } },
        // plano 1500c · RC-215: frase única com o termo explícito («2 oportunidades em Agendou sem data») — antes o gênero do negócio
        // («agendadas») e «não sabem dela» (do paciente) se misturavam
        h("p", { class: "ini-semdata-t" }, ui.icone("alerta"), h("span", null, fraseSemData(sd, voc))),
        h("p", { class: "rel-nota" }, `Sem ${palavra.um} ${ga.marcada}, não ${sd.total === 1 ? "aparece" : "aparecem"} na agenda e o lembrete não sai.`     /* plano 2000d · IY-041 */),
        sd.itens.length ? h("ol", { class: "ini-semdata-lista", "aria-label": "Agendados sem data" }, sd.itens.map(it => {
          const nome = it.nome || `${cap(voc.negocio)} sem nome`;
          return h("li", { class: "ini-semdata-item" },
            h("div", { class: "ini-semdata-txt" }, h("p", { class: "ini-semdata-nome" }, nome),
              h("p", { class: "rel-nota" }, [it.etapa, it.ha].filter(Boolean).join(" · "))),
            h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `sd-${it.id}` }, "aria-label": `Abrir ${nome} para marcar a data`,
              on: { click: () => pontes.abrirNegocio(it.id, { aoMudar: () => carregar({ forcar: true }) }) } }, "Marcar data"));
        })) : null,
        // plano 1000b · RB-178: «+3 no quadro» abre o quadro do CRM
        sobra > 0 ? h("p", { class: "rel-nota" }, podeCrm ? h("a", { class: "rel-link", href: "#/crm", dataset: { k: "sd-quadro" } }, `+${sobra} no quadro`) : `+${sobra} no quadro`) : null);
    }
    /** B4/B7: uma pessoa esperando resposta — nome, há quanto tempo, pílulas de canal/origem (A8), «Assumir» (atribui a mim e abre) e «Abrir». */
    function itemEspera(it) {
      const nome = it.nome || `${cap(voc.contato)} sem nome`;
      const espTxt0 = it.espera === null ? "" : it.espera >= 1 ? `espera há ${duracaoCurta(it.espera)}` : "acabou de escrever";
      // plano 2000d · IY-047: a conversa que já é minha diz isso («com você») no lugar do «Assumir» que saiu (IY-061)
      const minhaJa = !!it.atribuidaId && String(it.atribuidaId) === String(contaId);
      const espTxt = [espTxt0, minhaJa ? "com você" : ""].filter(Boolean).join(" · ");
      const pilulas = [pilulaSegura(it.canal, "canal"), pilulaSegura(it.origem, "origem", it.plataforma)].filter(Boolean);
      let assumir = null;
      // plano 2000d · IY-061: já está comigo (atribuida_id = minha conta) → sem «Assumir» (atribuiria de novo e mostraria «Desfazer» à toa)
      const jaMinha = !!it.atribuidaId && String(it.atribuidaId) === String(contaId);
      if (podeConversas && escreve && contaId !== "-" && !jaMinha) {
        assumir = h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { k: `ag-assumir-${it.id}` }, "aria-label": `Assumir a conversa de ${nome} e abrir`, title: "A conversa passa para você e abre" }, "Assumir");
        assumir.addEventListener("click", () => assumirConversa(it, assumir));
      }
      const abrir = podeConversas ? h("a", { class: "bt bt-sec bt-p", href: `#/conversas/${encodeURIComponent(it.id)}`, dataset: { k: `ag-ver-${it.id}` }, "aria-label": `Abrir a conversa de ${nome}` }, "Abrir") : null;
      // plano 1500c · RC-228: «Marcar» abre a agenda já procurando a pessoa (marcarConsulta com a busca pelo nome)
      const marcar = podeAgenda && escreve && it.nome && typeof ctx.carregar === "function"
        ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: `ag-marcar-${it.id}` }, "aria-label": `Marcar ${palavra.um} para ${nome}`,
          on: { click: async () => {
            try { const ag = await ctx.carregar("agenda"); await ag.marcarConsulta(ctx, { busca: it.nome, aoMudar: () => carregar({ forcar: true }) }); }
            catch (e) { console.error(e); ui.toast("Não deu para abrir a agenda agora.", { tipo: "erro" }); }
          } } }, "Marcar") : null;
      // plano 1500c · RC-204: três faixas de espera (ok < 5 min · atenção · passou do prazo), com texto além da cor
      const fx = faixaEspera(it.espera, limEspera);
      return h("li", { class: ["ini-espera-item", `ini-espera-${fx.faixa}`, fx.faixa === "ruim" && "ini-espera-longa"], dataset: { conversa: it.id, faixa: fx.faixa } },
        typeof ui.avatar === "function" ? ui.avatar(nome, it.id, null, { tamanho: "p" }) : null,
        h("div", { class: "ini-espera-txt" }, h("p", { class: "ini-espera-nome" }, nome),
          espTxt || pilulas.length ? h("p", { class: "ini-espera-meta" }, ...[espTxt ? h("span", { class: "ini-espera-t rel-nota" }, espTxt, fx.texto ? h("b", { class: "ini-espera-fx" }, ` · ${fx.texto}`) : null) : null, ...pilulas].filter(Boolean)) : null),
        assumir || abrir || marcar ? h("div", { class: "ini-espera-acoes" }, ...[assumir, abrir, marcar].filter(Boolean)) : null);
    }
    function itemConsulta(it, semana) {
      const hora = L.horaSP(it.inicio);
      const rotDia = semana ? (it.dia === somarDiasIso(d.hoje, 1) ? "amanhã" : `${SEMANA[diaSemanaIso(it.dia)]} ${L.ddmmIso(it.dia)}`) : null;
      const selo = it.estado === "agora" ? h("span", { class: "ini-prox-selo" }, h("i", { class: "ini-prox-ponto", "aria-hidden": "true" }), "agora")
        : it.estado === "proxima" ? h("span", { class: "ini-prox-selo" }, ui.relativo(it.inicio)) : rotDia ? h("span", { class: "ini-prox-selo" }, rotDia) : null;
      // plano 1500c · RC-300: «Abrir a consulta de Maria, às 14:00» (antes «Abrir Maria das 14:00», que soava como sobrenome)
      const quem = it.nome || it.titulo || "";
      const abrir = podeCrm && it.negocio_id
        ? h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `px-${it.negocio_id}` }, "aria-label": rotuloAbrirConsulta(quem, hora, palavra.um, { fem: femAg }),     // plano 2000d · IY-038
          on: { click: () => pontes.abrirNegocio(it.negocio_id, { aoMudar: () => carregar({ forcar: true }) }) } }, "Abrir")
        // plano 1000 (CR-253): consulta sem negócio (marcada direto na agenda) não fica sem ação — «Ver na agenda» do dia dela
        : podeAgenda ? h("a", { class: "bt bt-sec bt-p", href: `#/agenda?dia=${encodeURIComponent(it.dia || d.hoje || "")}`, dataset: { k: `px-ag-${it.dia || ""}-${hora}` },
          "aria-label": rotuloAbrirConsulta(quem, hora, palavra.um, { agenda: true, fem: femAg }) }, "Ver na agenda") : null;
      // plano 1500c · RC-202: a de amanhã que o paciente ainda não confirmou ganha o selo e «Pedir confirmação» (abre a conversa com ele);
      // só quando a agenda manda o campo `confirmacao` (sem ele, nada é inventado)
      const naoConf = precisaConfirmar(it, somarDiasIso(d.hoje || L.hojeSP(), 1));
      const pedir = naoConf && podeConversas && escreve && it.contato_id != null
        // plano 2000d · DR-292: a conversa abre com o pedido de confirmação pronto («…confirmar a sua consulta amanhã às 10:00…»)
        ? h("a", { class: "bt bt-fant bt-p", href: hrefComTexto({ contatoId: it.contato_id }, textoPedirConfirmacao(quem, `amanhã às ${hora}`, palavra.um)), dataset: { k: `px-conf-${it.negocio_id || it.contato_id}` },
          "aria-label": `Pedir confirmação a ${quem || palavra.um}` }, "Pedir confirmação") : null;
      return h("li", { class: ["ini-prox-item", `ini-prox-${it.estado}`, naoConf && "ini-prox-naoconf"] },
        h("span", { class: "ini-prox-hora" }, h("b", { class: "rel-num" }, hora), selo),
        h("div", { class: "ini-prox-txt" }, h("p", { class: "ini-prox-nome" }, it.nome || it.titulo || `${cap(palavra.um)} sem nome`),
          h("p", { class: "rel-nota" }, [it.servico, it.etapa].filter(Boolean).join(" · ") || (it.titulo && it.nome ? it.titulo : "")),
          naoConf ? h("p", { class: "ini-prox-conf" }, ui.icone("alerta"), h("span", null, "não confirmada")) : null),
        abrir || pedir ? h("div", { class: "ini-prox-acoes" }, ...[abrir, pedir].filter(Boolean)) : null);
    }

    /** Barras da agenda: hoje hora a hora (com a linha do agora) ou os próximos 7 dias; cada barra lê no teclado; «Ver como tabela» embaixo. */
    function blocoHoras(porHora, porDia, temAgenda) {
      const sub = h("p", { class: "rel-nota ini-horas-sub" });
      const area = h("div", { class: "ini-horas-area" });
      const sec = h("section", { class: "rel-cartao ini-horas rel-entra", "aria-labelledby": "ini-hr", style: "--i:6" },
        h("div", { class: "rel-cartao-topo ini-horas-topo" }, h("h2", { id: "ini-hr", class: "rel-h2" }, "Agenda de hoje e da semana"), sub), area);
      if (agendaLendo) { sub.textContent = "Lendo a agenda…"; area.append(ui.esqueleto("grafico", { n: 10 })); return sec; }
      if (agendaFalhou) { sub.textContent = "Não consegui ler a agenda agora."; sub.classList.add("rel-txt-aten"); area.append(botaoTentar("hr-tentar")); return sec; }
      if (!temAgenda) { sub.textContent = TEXTO_SEM_AGENDA; return sec; }     // plano 2000d · DR-258
      if (!porDia.total) {
        sub.textContent = `${cap(palavra.varios)} por hora e por dia.`;
        area.append(ui.vazio({ icone: "calendario", tema: "agenda", titulo: `${ga.nenhuma} ${palavra.um} nos próximos 7 dias.`, texto: podeAgenda ? "Quando marcar, as barras aparecem aqui." : null,
          acao: podeAgenda ? { rotulo: "Abrir agenda", fn: () => ctx.navegar("#/agenda") } : null }));
        return sec;
      }
      const modo = modoHoras === "hoje" && porHora.total ? "hoje" : modoHoras === "semana" || !porHora.total ? "semana" : "hoje";
      const seg = ui.segmentado({ tipo: "filtro", rotulo: "Período das barras", valor: modo, classe: "ini-horas-seg",
        opcoes: [{ valor: "hoje", rotulo: "Hoje", contador: porHora.total }, { valor: "semana", rotulo: "7 dias", contador: porDia.total }],
        aoMudar: v => { modoHoras = v; pintar(v); } });
      sec.querySelector(".rel-cartao-topo").append(seg);
      const dica = h("p", { class: "rel-nota ini-horas-dica", "aria-hidden": "true" });     // plano 2000d · IY-060
      const pintar = v => {
        const horaAgora = horaSP(new Date());     // plano 1000b · RB-244: a hora de AGORA a cada pintura (trocar «Hoje/7 dias» depois da virada da hora)
        ui.limpar(area);
        const hojeMode = v === "hoje";
        const itens = hojeMode ? porHora.horas : porDia.dias;
        const max = Math.max(1, hojeMode ? porHora.max : porDia.max);
        sub.textContent = hojeMode ? `Hoje, hora a hora · ${porHora.total} ${plural(porHora.total, palavra.um, palavra.varios)}` : `Próximos 7 dias · ${porDia.total} ${plural(porDia.total, palavra.um, palavra.varios)}`;
        const texto = x => {
          const rot = hojeMode ? `${p2(x.h)}h` : x.rotuloLongo;
          const nomes = x.itens.map(i => [i.nome || i.titulo, i.servico].filter(Boolean).join(" · ")).join("; ");
          return `${rot}: ${x.n} ${plural(x.n, palavra.um, palavra.varios)}${nomes ? ` — ${nomes}` : ""}`;
        };
        // plano 1500c · RC-199: as barras são uma lista de opções (listbox/option) com a posição («3 de 11») — o leitor diz que dá para andar
        // e escolher; RC-198: Enter/toque abre a agenda daquele dia (e da hora, no modo Hoje)
        const lista = h("ol", { class: "ini-bv-lista", role: "listbox", "aria-orientation": "horizontal",
          "aria-label": `${hojeMode ? `${cap(palavra.varios)} de hoje por hora` : `${cap(palavra.varios)} por dia nos próximos 7 dias`}. Enter abre a agenda.` });
        // tabindex itinerante: uma parada de Tab no gráfico (a hora corrente ou hoje); as setas, Home e End andam entre as barras
        const atual = barraAtual(itens, { hojeMode, horaAgora });
        const itinerar = alvo => { for (const o of lista.querySelectorAll(".ini-bv")) { o.setAttribute("tabindex", o === alvo ? "0" : "-1"); o.setAttribute("aria-selected", String(o === alvo)); } };
        const hrefBarra = x => (hojeMode ? `#/agenda?dia=${d.hoje || L.hojeSP()}&hora=${p2(x.h)}:00` : `#/agenda?dia=${x.dia}`);
        itens.forEach((x, i) => {
          const agoraCls = hojeMode ? (x.h === horaAgora ? "ini-bv-agora" : x.h < horaAgora ? "ini-bv-passou" : null) : (x.hoje ? "ini-bv-agora" : null);
          // a maior barra para em 85% do trilho: sobra lugar para o número em cima dela
          const li = h("li", { class: ["ini-bv", !x.n && "ini-bv-0", agoraCls, podeAgenda && "ini-bv-link"], tabindex: i === atual ? "0" : "-1", role: "option", "aria-selected": String(i === atual),
            "aria-posinset": String(i + 1), "aria-setsize": String(itens.length), "aria-label": texto(x), style: { "--i": i },
            dataset: { k: `bv-${hojeMode ? x.h : x.dia}`, href: podeAgenda ? hrefBarra(x) : null } },
            h("span", { class: "ini-bv-trilho", style: { "--h": `${(Math.max(x.n ? 8 : 0, x.n / max * 85)).toFixed(1)}%` } },
              // plano 1500c · RC-197: o «0» discreto nas barras vazias (leitura rápida sem passar o mouse)
              h("span", { class: ["ini-bv-n", !x.n && "ini-bv-n0"] }, String(x.n)),
              h("i", { class: "ini-bv-barra" })),
            h("span", { class: "ini-bv-r" }, hojeMode ? `${p2(x.h)}h` : x.rotulo));
          const mostrar = () => { dica.textContent = texto(x); };
          li.addEventListener("mouseenter", mostrar); li.addEventListener("focus", () => { mostrar(); itinerar(li); });
          if (podeAgenda) li.addEventListener("click", () => ctx.navegar(hrefBarra(x)));
          lista.append(li);
        });
        lista.addEventListener("mouseleave", () => { dica.textContent = ""; });
        lista.addEventListener("keydown", ev => {
          const bs = [...lista.querySelectorAll(".ini-bv")], i = bs.indexOf(document.activeElement);
          if (i < 0) return;
          if ((ev.key === "Enter" || ev.key === " ") && podeAgenda && bs[i].dataset.href) { ev.preventDefault(); ctx.navegar(bs[i].dataset.href); return; }     // RC-198
          const j = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? bs.length - 1 : null;
          if (j === null || !bs[j]) return;
          ev.preventDefault(); itinerar(bs[j]); bs[j].focus();
        });
        try { if (!quieto && !matchMedia("(prefers-reduced-motion: reduce)").matches) lista.classList.add("ini-anim"); } catch { /* ok */ }
        const caixa = h("div", { class: "ini-horas-caixa" }, lista);
        const rodape = h("div", { class: "ini-horas-rodape" });
        area.append(caixa, dica, rodape);
        const btTab = G.alternarTabela(rodape, caixa, { colunas: [hojeMode ? "Hora" : "Dia", cap(palavra.varios)],
          linhas: itens.map(x => [hojeMode ? `${p2(x.h)}h` : x.rotuloLongo, String(x.n)]), legenda: sub.textContent });
        // plano 1000 (CR-286): o botão diz DE QUAL gráfico é a tabela (o nome acompanha o texto visível)
        const bt = btTab && btTab.setAttribute ? btTab : rodape.querySelector("button");
        if (bt) {
          const qual = hojeMode ? "a agenda de hoje" : "a agenda da semana";
          const nomear = () => bt.setAttribute("aria-label", /gr[áa]fico/i.test(bt.textContent || "") ? `Ver ${qual} como gráfico` : `Ver ${qual} como tabela`);
          nomear(); bt.addEventListener("click", nomear);
        }
      };
      pintar(modo);
      return sec;
    }

    /** B1 — funil do mês (nx_inicio.funil_mes): G.funil com a taxa sobre a etapa anterior e dois números curtos em ui.kpi
        («compacto» cabe no cartão estreito de 360 px). Contagem do servidor; nada aqui é estimado. */
    function blocoFunil(f) {
      const mes = MESES[Number(String(d.hoje || L.hojeSP()).slice(5, 7)) - 1] || "";
      const sec = h("section", { class: "rel-cartao ini-funil rel-entra", "aria-labelledby": "ini-fn", style: "--i:3" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-fn", class: "rel-h2" }, "Funil do mês"),
          h("p", { class: "rel-nota" }, `${mes} · do dia 1 até hoje`),
          // plano 1000 (CR-285): para entender as perdas, o relatório de vendas a um toque
          podeRel ? h("a", { class: "rel-link ini-funil-rel", href: "#/relatorios/vendas", dataset: { k: "fn-rel" } }, "Ver relatório de vendas") : null));
      if (f.vazio) {
        sec.append(ui.vazio({ tipo: "sem_resultado", tema: "crm", titulo: "Nenhum lead neste mês ainda." }));
        return sec;
      }
      const alvo = h("div", { class: "ini-funil-g" });
      // plano 1500c · RC-217: a etapa dos ganhos diz quanto foi ganho (a receita do mês); RC-341: cada etapa abre quem são, com o recorte do mês
      const receita = fin(n.receita_mes) ? +n.receita_mes : null;
      const hrefs = linksFunilMes(d.hoje || L.hojeSP(), { crm: podeCrm, conversas: podeConversas, agenda: podeAgenda, rel: podeRel });
      G.funil(alvo, { etapas: f.etapas.map(e => ({ nome: e.nome, qtd: e.qtd, tipo: e.tipo, conversao: e.conversao, ...(e.dica ? { dica: e.dica } : {}),
        valorTxt: e.id === "ganhos" && receita !== null ? L.textoMoeda(receita, { centavos: false }) : "", href: hrefs[e.id] || null })),
        resumo: `Funil de ${mes}: ${f.etapas.map(e => `${e.nome} ${e.qtd}`).join(", ")}${receita !== null ? `; ganhos somam ${L.textoMoeda(receita, { centavos: false })}` : ""}.` });
      // plano 1500c · RC-218: «Do lead à venda» melhorou ou piorou contra o mês passado (quando o servidor manda funil_mes_anterior)
      const cmp = funilComparado(d);
      const chipF = cmp ? chipPontos(cmp.atual, cmp.anterior) : null;     // em pontos percentuais (taxa contra taxa), não «291%»
      // os cartões entram quando o bloco já está na página (como as outras contagens): a contagem de ui.kpi começa do zero e para
      // de vez se o número ainda não estiver no documento — montado antes da troca do esqueleto, ficava «0»
      const kpis = typeof ui.kpi === "function" ? h("div", { class: "ini-funil-kpis" }) : null;
      if (kpis) contarDepois.push(() => kpis.append(
        ui.kpi({ rotulo: "Leads no mês", valor: f.leads, formato: "compacto", ajuda: "Leads que entraram no funil do dia 1 até hoje (contagem do servidor)." }),
        ui.kpi({ rotulo: "Do lead à venda", valor: f.geral, formato: "pct",
          ajuda: `${cap(voc.negocios)} ${fem ? "ganhas" : "ganhos"} no mês ÷ leads do mês. Cada etapa conta o que aconteceu no mês, não a mesma turma.` })));
      sec.append(...[kpis,
        chipF ? h("p", { class: "ini-funil-cmp", dataset: { k: "fn-cmp" } }, h("span", { class: `rel-var rel-var-${chipF.cls}` }, chipF.v == null ? chipF.txt : `${chipF.seta} ${chipF.txt}`),
          h("span", { class: "rel-nota" }, ` do lead à venda vs. ${pct(cmp.anterior)} no mês passado`)) : null,
        alvo,
        h("p", { class: "rel-nota ini-funil-nota" }, "Cada etapa conta o que aconteceu no mês (não é a mesma turma de leads): a taxa pode passar de 100%.")].filter(Boolean));
      return sec;
    }

    /** plano 1500c · RC-339: negócios sem nenhuma interação há 7+ dias — até 5, cada um abre o negócio; «Ver todos» no quadro filtrado. */
    function blocoEsfriando(esTodos) {
      // plano 2000d · DR-407: «Meus / Todos» quando os itens dizem o responsável (dono_id) — o vendedor vê só os dele
      const alterna = temDonoEsfriando(esTodos) && contaId !== "-";
      const es = alterna ? filtrarEsfriando(esTodos, contaId, esfriandoMeus) : esTodos;
      const sobra = es.total - es.itens.length;
      const seg = alterna && typeof ui.segmentado === "function" ? ui.segmentado({ tipo: "filtro", rotulo: "De quem", valor: esfriandoMeus ? "meus" : "todos", classe: "ini-esfr-seg",
        opcoes: [{ valor: "todos", rotulo: "Todos" }, { valor: "meus", rotulo: "Meus" }], aoMudar: v => { esfriandoMeus = v === "meus"; redesenhar(); } }) : null;
      return h("section", { class: "rel-cartao ini-esfr rel-entra", "aria-labelledby": "ini-ef", style: "--i:4" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ef", class: "rel-h2" }, `${cap(voc.negocios)} esfriando`),
          h("p", { class: "rel-nota" }, `${es.total} sem mensagem nem tarefa há 7+ dias`,
            // plano 1500c · IC-013
            es.valor ? h("b", { class: "ini-esfr-valor rel-num", dataset: { k: "ef-valor" } }, ` · ${es.parcial ? "pelo menos " : ""}${L.textoMoeda(es.valor, { centavos: false })} parados`) : null), seg),
        es.itens.length ? h("ol", { class: "ini-esfr-lista" }, es.itens.map(it => {
          const nome = it.nome || `${cap(voc.negocio)} sem nome`;
          const diasTxt = it.dias !== null ? `parado há ${it.dias} ${it.dias === 1 ? "dia" : "dias"}` : null;
          // plano 2000d · DR-286: «Mensagem» abre a conversa com o contato e «Tarefa» cria o próximo passo, sem passar pelo quadro
          const msg = podeConversas && it.contatoId !== null ? h("a", { class: "bt bt-fant bt-p", href: `#/conversas?contato=${encodeURIComponent(it.contatoId)}`, dataset: { k: `ef-msg-${it.id}` },
            "aria-label": `Mandar mensagem para ${nome}` }, ui.icone("whatsapp"), "Mensagem") : null;
          const tarefa = podeTarefas && escreve && typeof ctx.carregar === "function" ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: `ef-tf-${it.id}` },
            "aria-label": `Criar tarefa para ${nome}`, on: { click: async () => {
              try { const T = await modTarefas(); const r = await T.mod.formTarefa(T.kit, null, { negocio_id: it.id, ...(it.contatoId !== null ? { contato_id: it.contatoId } : {}) });
                if (r && minha === montagem) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); carregar({ forcar: true }); } }
              catch (e) { console.error(e); ui.toast("Não deu para abrir a tarefa agora.", { tipo: "erro" }); }
            } } }, ui.icone("tarefa"), "Tarefa") : null;
          return h("li", { class: "ini-esfr-item" },
            h("div", { class: "ini-esfr-txt" }, h("p", { class: "ini-esfr-nome" }, nome),
              h("p", { class: "rel-nota" }, [it.etapa, diasTxt, it.valor ? L.textoMoeda(it.valor, { centavos: false }) : null].filter(Boolean).join(" · "))),
            h("div", { class: "ini-esfr-acoes" },
              // plano 2000d · DR-329: o botão abre o negócio direto e diz quem e há quanto tempo está parado
              h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `ef-${it.id}` }, "aria-label": `Abrir ${nome}${diasTxt ? `, ${diasTxt}` : ""}, para retomar`,
                on: { click: () => pontes.abrirNegocio(it.id, { aoMudar: () => carregar({ forcar: true }) }) } }, "Retomar"), msg, tarefa));
        })) : h("p", { class: "rel-nota", dataset: { k: "ef-vazio-meus" } }, `${fem ? "Nenhuma das suas" : "Nenhum dos seus"} ${voc.negocios} está esfriando.`),
        h("div", { class: "rel-cartao-rodape" }, h("a", { class: "rel-link", href: "#/crm?parados=7", dataset: { k: "ef-todos" } }, sobra > 0 ? `Ver todos (+${sobra})` : "Ver no quadro")));
    }
    /** plano 1500c · RC-219: quem fechou mais no mês e quem respondeu mais rápido (admin) — tabela ordenada pelo valor ganho. */
    function blocoEquipe(vis) {
      const eq = vis.linhas;
      const melhorTpr = Math.min(...eq.map(x => (x.tpr === null ? Infinity : x.tpr)));
      // plano 2000d · DR-220: a coluna de conversão só quando o servidor manda os leads de cada um; DR-218/DR-261: a meta de cada um vira barra
      const temConv = eq.some(x => x.conversao !== null), temMeta = eq.some(x => x.meta);
      const sem = admin ? semTarefaHoje(equipeTodos) : null;      // DR-353
      const fmt = v => L.textoMoeda(v, { centavos: false });
      const nomeCel = x => {
        // plano 2000d · DR-262: o nome abre o quadro filtrado pelo responsável (admin; o link do CRM é o mesmo «?f=» das visões)
        const href = admin && podeCrm ? linkQuadroDono(x.id) : null;
        return href ? h("a", { class: "rel-link", href, dataset: { k: `eq-${x.id}` }, "aria-label": `Ver o quadro de ${x.nome}` }, x.nome) : x.nome;
      };
      return h("section", { class: "rel-cartao ini-equipe rel-entra", "aria-labelledby": "ini-eq", style: "--i:8" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-eq", class: "rel-h2" }, admin ? "Equipe no mês" : "Você no mês"), h("p", { class: "rel-nota" }, "do dia 1 até hoje")),
        vis.resumo ? h("p", { class: "ini-equipe-pos", dataset: { k: "eq-posicao" } }, vis.resumo) : null,
        h("div", { class: "ini-equipe-rol" }, h("table", { class: "ini-equipe-tab" },
          h("caption", { class: "sr-only" }, `Equipe no mês: ganhos, valor${temConv ? ", conversão" : ""} e tempo médio da 1ª resposta por pessoa`),
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Pessoa"), h("th", { scope: "col", class: "num" }, "Ganhos"), h("th", { scope: "col", class: "num" }, "Valor"),
            temConv ? h("th", { scope: "col", class: "num" }, "Conversão") : null, h("th", { scope: "col", class: "num" }, "1ª resposta"))),
          h("tbody", null, eq.map(x => h("tr", { class: [x.posicao === 1 && x.valor > 0 && "ini-equipe-top", x.eu && "ini-equipe-eu"] },
            h("th", { scope: "row" }, x.posicao === 1 && x.valor > 0 ? h("span", { class: "ini-equipe-coroa" }, "1º", h("span", { class: "sr-only" }, " lugar:"), " ")     /* plano 2000d · IY-053 */ : null, nomeCel(x),
              x.eu ? h("span", { class: "ini-equipe-voce" }, " (você)") : null,     // plano 1500c · IC-012
              // plano 2000d · DR-355: o incentivo de quem está atrás
              textoDistancia(x, fmt) ? h("span", { class: "rel-nota ini-equipe-dist", dataset: { k: `eq-dist-${x.id}` } }, ` · ${textoDistancia(x, fmt)}`) : null,
              temMeta && x.meta ? h("span", { class: "ini-equipe-meta", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, x.metaPct)),
                "aria-label": `Meta de ${x.nome}: ${pct(x.metaPct)} de ${fmt(x.meta)}`, dataset: { k: `eq-meta-${x.id}` } }, h("i", { style: { "--w": `${Math.min(100, x.metaPct)}%` } }),
                h("span", { class: "rel-nota" }, x.valor >= x.meta ? "meta batida" : `faltam ${fmt(x.meta - x.valor)}`)) : null),
            h("td", { class: "num" }, int(x.ganhos)), h("td", { class: "num" }, fmt(x.valor)),
            temConv ? h("td", { class: "num", title: x.leads !== null ? `${x.ganhos} de ${x.leads} leads` : null }, x.conversao === null ? "—" : pct(x.conversao)) : null,
            h("td", { class: ["num", admin && x.tpr !== null && x.tpr === melhorTpr && "ini-equipe-rapido"] }, x.tpr === null ? "—" : duracaoCurta(x.tpr))))))),
        // plano 2000d · DR-353: quem está sem nenhuma tarefa para hoje (carteira parada)
        sem ? h("p", { class: "rel-nota ini-equipe-semtf rel-txt-aten", dataset: { k: "eq-semtarefa" } }, `Sem tarefa para hoje: ${listaPt(sem)}.`     /* plano 2000d · IY-026 */) : null);
    }
    /** plano 1500c · RC-325: o primeiro mês × o mês atual — o argumento da renovação, com a seta do sentido bom. */
    function blocoDesde(ds) {
      const fmtL = (id, v) => (id === "receita" ? L.textoMoeda(v, { centavos: false }) : id === "tpr" ? duracaoCurta(v) : int(v));
      return h("section", { class: "rel-cartao ini-desde rel-entra", "aria-labelledby": "ini-ds", style: "--i:5" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ds", class: "rel-h2" }, "Desde que você começou"),
          // plano 2000d · DR-290: contra o último mês FECHADO quando o servidor manda; senão «agora (mês em andamento)»
          h("p", { class: "rel-nota" }, `${mesPorExtenso(ds.primeiro.mes)} × ${ds.parcial ? "agora" : mesPorExtenso(ds.atual.mes)}`)),
        h("ul", { class: "ini-desde-lista" }, ds.linhas.map(x => h("li", { class: ["ini-desde-item", x.melhor ? "melhor" : x.parcial ? "andamento" : "pior"] },
          h("span", { class: "ini-desde-r" }, x.rotulo),
          h("span", { class: "ini-desde-v rel-num" }, h("span", { class: "sr-only" }, "antes: "), h("s", { class: "ini-desde-antes" }, fmtL(x.id, x.antes)), h("span", { class: "sr-only" }, ", agora:")     /* plano 2000d · IY-052 */, h("span", { "aria-hidden": "true" }, " → "),
            h("b", null, fmtL(x.id, x.agora))),
          // o mês parcial que ainda não passou o primeiro não «piorou»: está em andamento
          h("span", { class: "ini-desde-sel" }, x.melhor ? "melhorou" : x.parcial ? "em andamento" : "piorou")))),
        // plano 2000d · DR-288: o argumento da renovação vai ao dono — copiar ou compartilhar o texto
        h("div", { class: "rel-cartao-rodape ini-desde-acoes" },
          h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "ds-copiar", exemploOk: "1" }, on: { click: () => copiarResumo(textoDesde(ds, { empresa: ctx.cliente.nome || "", fmt: fmtL }), "Copiado. É só colar no WhatsApp.") } },
            ui.icone("copiar"), "Copiar"),
          typeof navigator !== "undefined" && navigator && typeof navigator.share === "function"
            ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "ds-compartilhar", exemploOk: "1" }, on: { click: () => compartilharTexto("Desde que começamos", textoDesde(ds, { empresa: ctx.cliente.nome || "", fmt: fmtL })) } },
              ui.icone("compartilhar"), "Compartilhar") : null));
    }

    /** Leads da semana: quanto veio de anúncio × outras origens, numa barra de proporção (contagem do CRM). */
    function barraOrigem(l) {
      // plano 2000d · IY-025: as fatias somam sempre 100% (partesOrigem) — anúncio a mais que o total não estoura a barra
      const po = partesOrigem(l);
      const total = po.total, an = po.anuncio, pct = po.pAn;
      // plano 1500c · RC-233: com leads.semana_meta/semana_google o anúncio se divide em Meta e Google (duas cores); sem eles, como antes
      if (po.plataformas) {
        const pl = { meta: po.meta, google: po.google };
        const pM = po.pMeta, pG = po.pGoogle, pO = po.pOutras;
        return h("div", { class: "ini-origem", role: "img", "aria-label": `${rotuloOrigem(total, an, pct)}: Meta ${pl.meta}, Google ${pl.google}` },
          h("span", { class: "ini-origem-t ini-origem-t2" }, h("i", { class: "ini-origem-meta", style: { "--w": `${pM}%` } }), h("i", { class: "ini-origem-google", style: { "--w": `${pG}%`, "--x": `${pM}%` } })),
          h("span", { class: "ini-origem-leg" }, h("span", null, h("i", { class: "ini-origem-m ini-origem-meta" }), `Meta · ${pM}%`),
            h("span", null, h("i", { class: "ini-origem-m ini-origem-google" }), `Google · ${pG}%`), h("span", null, h("i", { class: "ini-origem-m" }), `outras origens · ${pO}%`)));
      }
      return h("div", { class: "ini-origem", role: "img", "aria-label": rotuloOrigem(total, an, pct) },     // plano 1500c · RC-183
        h("span", { class: "ini-origem-t" }, h("i", { class: "ini-origem-an", style: { "--w": `${pct}%` } })),
        h("span", { class: "ini-origem-leg" }, h("span", null, h("i", { class: "ini-origem-m ini-origem-an" }), `anúncio · ${pct}%`), h("span", null, h("i", { class: "ini-origem-m" }), `outras origens · ${100 - pct}%`)));
    }

    /** Metas do mês (vendas em R$ e consultas), guardadas só neste aparelho: barra com a marca do ritmo do calendário e um texto honesto. */
    function blocoMetas(metas, n, hoje, agendaMes) {
      const dia = +n.dia_do_mes || Number(String(hoje).slice(-2)) || 1, nDias = diasDoMes(hoje);
      const temAlguma = !!(metas.vendas || metas.consultas || metas.leads);
      const editando = metasEditando || !temAlguma;
      const mes = MESES[Number(String(hoje).slice(5, 7)) - 1] || "";
      const fmtBrl = v => L.textoMoeda(v, { centavos: false });
      const fmtInt = v => int(v);
      // realizado = o que já aconteceu até agora (sem canceladas nem faltas); as marcadas para depois aparecem à parte e não contam no ritmo
      const cont = contagemConsultasMes(agendaMes, { agora: Date.now() });
      const linhaMeta = (rotulo, p, fmt, nota, extra = null) => h("div", { class: ["ini-meta", `ini-meta-${p.estado}`] },
        h("div", { class: "ini-meta-topo" }, h("span", { class: "ini-meta-r" }, rotulo),
          h("span", { class: "ini-meta-v rel-num" }, fmt(p.realizado), h("span", { class: "rel-nota" }, ` de ${fmt(p.meta)}`))),
        h("div", { class: "ini-meta-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.pct)), "aria-label": `${rotulo}: ${pct(p.pctReal)} da meta; esperado hoje: ${fmt(p.esperado)}`, "aria-valuetext": `${fmt(p.realizado)} de ${fmt(p.meta)} (${pct(p.pctReal)})` },     // plano 2000d · IY-082     // plano 1000b · RB-171
          h("i", { style: { "--w": `${p.pct}%` } }), h("b", { style: { "--m": `${p.ritmoPct}%` }, title: `Ritmo do calendário hoje: ${fmt(p.esperado)}` })),
        // plano 2000d · DR-299: a frase longa no computador e a curta («Faltam R$ 5.000 · abaixo do ritmo») no celular (o CSS escolhe)
        nota ? h("p", { class: "rel-nota ini-meta-txt" }, nota)
          : h("p", { class: "rel-nota ini-meta-txt" }, h("span", { class: "ini-meta-longo" }, textoMeta(p, { fmt, dia, diasNoMes: nDias })),
            h("span", { class: "ini-meta-curto", "aria-hidden": "true" }, textoMetaCurto(p, fmt))),
        extra ? h("p", { class: "rel-nota ini-meta-extra" }, extra) : null);
      const linhas = h("div", { class: "ini-metas-linhas" });
      const fracao = fracaoDoDiaSP(Date.now());      // plano 2000d · DR-250: o esperado de hoje conta só o pedaço do dia que passou
      if (metas.vendas) {
        const pv = progressoMeta({ meta: metas.vendas, realizado: +n.receita_mes || 0, dia, diasNoMes: nDias, fracaoDia: fracao });
        // plano 2000d · DR-322: a projeção do fim do mês contra a meta (padrão Pipedrive Goals)
        const proj = projecaoMes({ realizado: +n.receita_mes || 0, dia, diasNoMes: nDias, fracaoDia: fracao });
        linhas.append(linhaMeta("Vendas do mês", pv, fmtBrl, null, proj && pv.estado !== "batida" ? textoProjecao(proj, metas.vendas, fmtBrl) : null));
        // plano 2000d · DR-399: os 3 últimos dias com a meta aberta ganham a faixa de reta final
        const rf = retaFinal({ meta: metas.vendas, realizado: +n.receita_mes || 0, dia, diasNoMes: nDias }, fmtBrl);
        if (rf) linhas.insertBefore(h("p", { class: "ini-reta-final", role: "status", dataset: { k: "mt-reta" } }, ui.icone("alerta"), h("span", null, ` ${rf.texto}`)), linhas.firstChild);
      }
      // plano 2000d · DR-298: a meta de leads contra os leads do mês (funil_mes.leads); sem o número, diz que não dá para contar
      if (metas.leads) {
        const real = realizadoLeadsMes(ultimoDado);
        linhas.append(linhaMeta("Leads no mês", progressoMeta({ meta: metas.leads, realizado: real || 0, dia, diasNoMes: nDias, fracaoDia: fracao }), fmtInt,
          real === null ? `Meta de ${fmtInt(metas.leads)}. O servidor ainda não manda os leads do mês para contar.` : null));
      }
      if (metas.consultas) {
        const p = progressoMeta({ meta: metas.consultas, realizado: cont ? cont.realizadas : 0, dia, diasNoMes: nDias, fracaoDia: fracao });
        const extra = cont ? [cont.marcadas ? `+${fmtInt(cont.marcadas)} já ${plural(cont.marcadas, ga.marcada, `${ga.marcada}s`)} até o fim do mês (${plural(cont.marcadas, "conta quando acontecer", "contam quando acontecerem")})` : null,
          cont.faltas ? `${fmtInt(cont.faltas)} ${plural(cont.faltas, "falta fica", "faltas ficam")} fora da conta` : null].filter(Boolean).join(" · ") : "";
        linhas.append(linhaMeta(`${cap(palavra.varios)} ${ga.realizadas} no mês`, p, fmtInt,
          cont === null ? `Meta de ${fmtInt(metas.consultas)}. Ainda não consegui contar ${ga.as} ${palavra.varios} deste mês na Agenda.` : null, extra ? `${extra}.` : null));
      }
      if (temAlguma) linhas.append(h("p", { class: "rel-nota ini-metas-leg" }, h("i", { class: "ini-meta-marca", "aria-hidden": "true" }), ` marca do ritmo do calendário: dia ${dia} de ${nDias}`));
      let form = null;
      if (editando) {
        // um redesenho forçado no meio da digitação devolve o rascunho aos campos (o pulso nem redesenha: metasEditando)
        const rasc = metasEditando && rascunhoMetas ? rascunhoMetas : null;
        // plano 1500c · RC-232: um ponto de partida — o mês passado inteiro na ajuda e «Usar +10%» que preenche o campo
        const sug = sugestaoMetaVendas(n);
        const fV = ui.campo({ nome: "meta_vendas", rotulo: "Meta de vendas no mês (R$)", tipo: "moeda", valor: rasc ? rasc.vendas : metas.vendas || "",
          // plano 2000d · DR-297: a ajuda diz de onde vem a sugestão («Mês passado: R$ 27.500 + 10% = R$ 30.300.»)
          ajuda: `Receita ${fem ? "das" : "dos"} ${vmin("negocios", "negócios")} ${adj("ganho")} no mês.${sug ? ` ${textoSugestaoMeta(sug, fmtBrl)}` : ""}` });     // plano 1000b · RB-157
        const fC = ui.campo({ nome: "meta_consultas", rotulo: `Meta de ${palavra.varios} no mês`, tipo: "numero", min: 0, passo: 1, inputmode: "numeric", valor: rasc ? rasc.consultas : metas.consultas || "",
          ajuda: `${cap(palavra.varios)} da Agenda que já aconteceram no mês (sem canceladas nem faltas).` });
        // plano 2000d · DR-298: meta de leads (os que entraram no funil no mês)
        const fL = ui.campo({ nome: "meta_leads", rotulo: "Meta de leads no mês", tipo: "numero", min: 0, passo: 1, inputmode: "numeric", valor: rasc ? (rasc.leads || "") : metas.leads || "",
          ajuda: "Leads que entraram no funil do dia 1 até hoje (todas as origens)." });
        const inV = fV.querySelector("input"), inC = fC.querySelector("input"), inL = fL.querySelector("input");
        inV.dataset.k = "mt-v"; inC.dataset.k = "mt-c"; inL.dataset.k = "mt-l";
        const fechar = () => { metasEditando = false; rascunhoMetas = null; };
        // RC-261: o leitor de dinheiro do CRM (lerNumero) vem agora, com o formulário à vista; se falhar, ui.lerMoeda como antes (RB-064)
        if (!lerNumeroCrm) import(`./crm-logica.js?v=${ctx.versao}`).then(m => { if (typeof m.lerNumero === "function") lerNumeroCrm = m.lerNumero; }).catch(() => {});
        const salvar = () => {
          // plano 1000b · RB-064 (pendência do CRM): o valor é lido como no negócio (crm-logica.lerNumero: «1,234.56» = «1.234,56»); sem ele, ui.lerMoeda
          // plano 1000b · RB-172: zero/negativo é erro no campo — antes «-5» virava «Metas retiradas» sem explicar
          const lido = validarMetas({ vendas: inV.value, consultas: inC.value, leads: inL.value }, lerNumeroCrm || ui.lerMoeda);
          if (typeof ui.marcarErro === "function") ui.marcarErro(form, null);
          const errados = Object.entries(lido.erros);
          if (errados.length) {
            if (typeof ui.marcarErro === "function") for (const [nome, txt] of errados.reverse()) ui.marcarErro(form, nome, txt);     // o foco fica no 1º
            else ui.toast(errados[0][1], { tipo: "erro" });
            return;
          }
          const vendas = lido.vendas || 0, consultas = lido.consultas || 0, leads = lido.leads || 0;
          gravarJson(chaveMetas, vendas > 0 || consultas > 0 || leads > 0 ? { vendas: vendas > 0 ? vendas : null, consultas: consultas > 0 ? consultas : null, ...(leads > 0 ? { leads } : {}) } : null);
          fechar();
          ui.toast(vendas > 0 || consultas > 0 || leads > 0 ? "Metas guardadas neste aparelho." : "Metas retiradas.", { tipo: "ok" });
          if (consultas > 0) carregar({ forcar: true }); else redesenhar();   // a meta de consultas relê a agenda do mês
        };
        // digitar trava o pulso, o relógio e a troca de versão do shell (metasEditando) — também na 1ª meta, em que o formulário já abre
        // sem «Ajustar metas»; apagar tudo de novo destrava
        const digitou = () => {
          rascunhoMetas = { vendas: inV.value, consultas: inC.value, leads: inL.value };
          if (!temAlguma) metasEditando = [inV, inC, inL].some(i => String(i.value || "").trim() !== "");
        };
        // plano 2000d · DR-297: o botão diz a conta («mês passado + 10%»)
        const btSug = sug ? h("button", { type: "button", class: "bt bt-fant bt-p ini-metas-sug", dataset: { k: "mt-sug" }, "aria-label": `Usar a meta de ${fmtBrl(sug.mais10)} (mês passado ${fmtBrl(sug.mesPassado)} mais 10%)`,
          on: { click: () => { inV.value = String(sug.mais10).replace(".", ","); digitou(); if (typeof inV.focus === "function") inV.focus(); } } }, `Usar mês passado + 10% (${fmtBrl(sug.mais10)})`) : null;
        form = h("form", { class: "ini-metas-form", on: { submit: ev => { ev.preventDefault(); salvar(); }, input: digitou } },
          h("div", { class: "ini-metas-campos" }, fV, fC, fL),
          btSug ? h("div", { class: "ini-metas-sug-l" }, btSug) : null,
          h("div", { class: "ini-metas-acoes" },
            h("button", { type: "submit", class: "bt bt-prim bt-p", dataset: { k: "mt-salvar" } }, "Guardar metas"),
            temAlguma ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "mt-cancelar" }, on: { click: () => { fechar(); redesenhar(); } } }, "Cancelar") : null,
            temAlguma ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "mt-tirar" }, on: { click: () => { gravarJson(chaveMetas, null); fechar(); ui.toast("Metas retiradas.", { tipo: "info" }); redesenhar(); } } }, "Tirar metas") : null));
      }
      return h("section", { class: "rel-cartao ini-metas rel-entra", "aria-labelledby": "ini-mt", style: "--i:7" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-mt", class: "rel-h2" }, "Metas do mês"),
          h("p", { class: "rel-nota" }, `${mes} · dia ${dia} de ${nDias} · guardadas só neste aparelho`)),
        temAlguma && !editando ? linhas : null,
        !temAlguma ? h("p", { class: "ini-metas-convite" }, h("em", { class: "narr" }, "Defina uma meta e acompanhe o mês sem planilha."), " ", h("span", { class: "rel-nota" }, "Fica só neste aparelho e navegador.")) : null,
        form,
        temAlguma && !editando ? h("div", { class: "rel-cartao-rodape" }, h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "mt-editar" }, on: { click: () => { metasEditando = true; rascunhoMetas = null; redesenhar(); } } }, ui.icone("editar"), "Ajustar metas")) : null);
    }

    /** «Restaurar ordem»: a ordem e os recolhidos voltam ao padrão («Mais detalhes» aberto continua como a pessoa deixou). */
    function rodapeRestaurar() {
      return h("div", { class: "ini-blocos-rodape" }, h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "bl-restaurar" },
        on: { click: () => {
          // plano 2000d · DR-284: «Desfazer» devolve a ordem e os recolhidos de antes (restaurar por engano não perde a arrumação)
          const antes = lerBlocos();
          gravarBlocos(antes.mais ? { ordem: [], recolhidos: [], mais: antes.mais } : null);
          ui.toast("Ordem e blocos de volta ao padrão.", { tipo: "info", desfazer: () => { gravarBlocos(antes); redesenhar(); } });
          redesenhar();
        } } }, ui.icone("reabrir"), "Restaurar ordem"));
    }
    /** Envelopa um bloco: o corpo vira recolhível (aria-expanded) e o topo ganha «antes / depois / recolher»; tudo guardado por empresa e conta. */
    function envolverBloco(id, sec, nome, { recolhido, podeAntes, podeDepois, ordemAtual }) {
      const topo = sec.firstElementChild && sec.firstElementChild.classList.contains("rel-cartao-topo") ? sec.firstElementChild : null;
      const corpoB = h("div", { class: "ini-bloco-corpo", id: `ini-bc-${id}` });
      for (const el of [...sec.childNodes]) if (el !== topo) corpoB.append(el);
      sec.append(corpoB);
      sec.dataset.bloco = id;
      const mover = delta => { const p = lerBlocos(); p.ordem = moverBloco(ordemAtual, id, delta); gravarBlocos(p); redesenhar(); };
      const btAntes = h("button", { type: "button", class: "bt-icone ini-bl-bt", disabled: !podeAntes, "aria-label": `Mover «${nome}» para antes`, title: "Mover para antes", dataset: { k: `bl-ant-${id}` }, on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
      const btDepois = h("button", { type: "button", class: "bt-icone ini-bl-bt", disabled: !podeDepois, "aria-label": `Mover «${nome}» para depois`, title: "Mover para depois", dataset: { k: `bl-dep-${id}` }, on: { click: () => mover(1) } }, ui.icone("seta-dir"));
      const btRec = h("button", { type: "button", class: "bt-icone ini-bl-bt ini-bl-rec", "aria-expanded": String(!recolhido), "aria-controls": corpoB.id,
        "aria-label": recolhido ? `Mostrar «${nome}»` : `Recolher «${nome}»`, title: recolhido ? "Mostrar" : "Recolher", dataset: { k: `bl-rec-${id}` },
        // plano 1500c · RC-208: recolher/mostrar só alterna este bloco e grava a preferência — sem redesenhar a tela (os KPIs e as linhas ficam)
        on: { click: () => {
          const agora = !corpoB.hidden;          // vai recolher?
          const p = lerBlocos(); p.recolhidos = agora ? [...new Set([...p.recolhidos, id])] : p.recolhidos.filter(x => x !== id); gravarBlocos(p);
          corpoB.hidden = agora; sec.classList.toggle("ini-rec", agora);
          btRec.setAttribute("aria-expanded", String(!agora));
          btRec.setAttribute("aria-label", agora ? `Mostrar «${nome}»` : `Recolher «${nome}»`); btRec.setAttribute("title", agora ? "Mostrar" : "Recolher");
          const rod = raiz.querySelector(".ini-blocos-rodape");
          if (!rod && (p.ordem.length || p.recolhidos.length)) corpo.insertBefore(rodapeRestaurar(), corpo.querySelector(".ini-onb") || null);
        } } }, ui.icone("seta-baixo"));
      const barra = h("div", { class: "ini-bl-barra", role: "group", "aria-label": `Organizar o bloco ${nome}` }, btAntes, btDepois, btRec);
      if (topo) topo.append(barra); else sec.insertBefore(barra, corpoB);
      // plano 2000d · DR-265: no exemplo cada bloco diz que é exemplo (a demonstração não confunde quem olha um bloco só)
      if (corpo.classList.contains("ini-exemplo") && topo) topo.insertBefore(h("span", { class: "ini-exemplo-selo ini-exemplo-selo-p", dataset: { k: `ex-selo-${id}` } }, "Exemplo"), topo.children[1] || null);
      if (recolhido) { sec.classList.add("ini-rec"); corpoB.hidden = true; }
      return sec;
    }
  }

  /**
   * plano 1000 (CR-171): ações rápidas sob a manchete — as mesmas do catálogo da paleta («Nova oportunidade», «Nova tarefa», «Marcar consulta»),
   * sem precisar ir à tela. Só para quem escreve e só o que o plano/papel libera. data-k: o foco volta ao mesmo botão depois do redesenho do pulso.
   */
  function acoesRapidas() {
    if (!escreve) return null;
    const itens = [];
    if (podeCrm && typeof ctx.novoNegocio === "function") itens.push(["negocio", typeof V.novo === "function" ? V.novo("negocio") : "Nova oportunidade", "funil", () => pontes.novoNegocio({}, { aoCriar: () => carregar({ forcar: true }) })]);
    if (podeTarefas && typeof ctx.carregar === "function") itens.push(["tarefa", "Nova tarefa", "tarefa", async () => {
      const T = await modTarefas();
      const t = await T.mod.formTarefa(T.kit, null, {});
      // plano 1500c · RC-227: depois do redesenho o foco volta ao «Nova tarefa» (antes ia para o topo da página)
      if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); await carregar({ forcar: true }); focarK("rap-tarefa"); }
    }]);
    // plano 1500c · RC-296: «Novo paciente/cliente» — o cadastro rápido do CRM (crm-listas.formContato) sem ir à lista
    if (podeCrm && typeof ctx.carregar === "function") itens.push(["contato", typeof V.novo === "function" ? V.novo("contato") : `Novo ${vmin("contato", "cliente")}`, "contato", async () => {
      const crm = await ctx.carregar("crm");
      const kk = await crm.kit(ctx);
      const Ls = await kk.mod("listas");
      const novo = await Ls.formContato(kk, {});
      if (novo && minha === montagem) {
        ui.toast(`${cap(vmin("contato", "cliente"))} cadastrad${typeof V.art === "function" ? V.art("contato") : "o"}.`, { tipo: "ok", ms: 6000, acao: novo.id != null ? { rotulo: "Abrir", fn: () => ctx.navegar(`#/contatos/${encodeURIComponent(novo.id)}`) } : undefined });
        focarK("rap-contato");
      }
    }]);
    if (podeAgenda && typeof ctx.carregar === "function") itens.push(["consulta", `Marcar ${palavra.um}`, "calendario", async () => {
      const ag = await ctx.carregar("agenda");
      await ag.marcarConsulta(ctx, { aoMudar: () => carregar({ forcar: true }) });
    }]);
    if (!itens.length) return null;
    return h("nav", { class: "ini-rapidas", "aria-label": "Ações rápidas" }, itens.map(([id, rotulo, icone, fn]) =>
      h("button", { type: "button", class: "bt bt-sec bt-p ini-rapida", dataset: { k: `rap-${id}` }, on: { click: async ev => {
        const b = ev.currentTarget;
        if (b) b.disabled = true;
        // plano 1000b · RB-168: o motivo do erro (ctx.api.mensagemErro) quando houver, não só «Não deu para abrir agora»
        try { await fn(); } catch (e) { console.error(e); ui.toast(ctx.api && typeof ctx.api.mensagemErro === "function" ? ctx.api.mensagemErro(e) : "Não deu para abrir agora. Tente de novo.", { tipo: "erro" }); }
        finally { if (b) b.disabled = false; }
      } } }, ui.icone(icone), rotulo)));
  }

  /** M32 — "Deixe o Órbita pronto": progresso + o que falta, cada item abre a seção exata (1-5: o assistente do número). Só admin; some a 100%. */
  function cartaoChecklist(r) {
    const local = lerOnb();
    const refazer = () => carregar({ forcar: true });
    const itemPendente = (i, destaque) => h("li", { class: "ini-onb-item", dataset: { item: i.id } },
      h("span", { class: "ini-onb-ponto", "aria-hidden": "true" }),
      h("div", { class: "ini-onb-txt" }, h("b", null, i.rotulo, i.opcional ? h("span", { class: "rel-nota" }, " · opcional") : null,
        tempoItem(i.id) ? h("span", { class: "ini-guia-tempo", dataset: { k: `onb-tempo-${i.id}` } }, ` · ${tempoItem(i.id)}`) : null),     // plano 2000d · DU-236
        h("span", { class: "rel-nota" }, i.ajuda), linkVideoPasso(i)),     // plano 2000d · DU-449
      h("div", { class: "ini-onb-acoes" },
        // plano 1000b · RB-260: lembra o item (e a rolagem) — ao voltar, o Início devolve o foco a este «Fazer agora»
        h("a", { class: destaque ? "bt bt-prim bt-p" : "bt bt-sec bt-p", href: i.rota, dataset: { k: `onb-${i.id}` }, on: { click: () => {
          memVolta = { dono: `${ctx.cliente.id}|${contaId}`, item: i.id, y: typeof scrollY === "number" ? scrollY : 0, mais: maisAberto, em: Date.now() };
          // plano 1500c · RC-216: também na sessão da aba — recarregar a página (ou o app trocar de versão) não perde o lugar
          try { sessionStorage.setItem(CHAVE_VOLTA, JSON.stringify(memVolta)); } catch { /* sem armazenamento: fica só a memória */ }
        } } }, "Fazer agora"),
        h("button", { type: "button", class: "bt bt-fant bt-p", title: "Marcar como feito só neste aparelho", dataset: { k: `onb-ok-${i.id}` }, on: { click: () => marcarPulado(i, true) } }, "Já está bom")));
    // plano 1000 (CR-252): «Já está bom» por engano tem volta — «Desfazer» no aviso e «desmarcar» em «Já feitos»
    function marcarPulado(i, sim) {
      const p = lerOnb();
      p.pulados = sim ? [...new Set([...p.pulados, i.id])] : p.pulados.filter(x => x !== i.id);
      gravarOnb(p);
      desenhar(ultimoDado, ultimaAgenda, false, null, ultimoOnb);
      if (sim) ui.toast(`«${i.rotulo}» marcado como feito neste aparelho.`, { tipo: "info", desfazer: () => marcarPulado(i, false) });
      else ui.anunciar(`«${i.rotulo}» voltou para a lista.`);
    }
    const feitos = r.itens.filter(i => i.feito);
    return h("section", { class: "rel-cartao ini-onb rel-entra", "aria-labelledby": "ini-ob" },
      h("div", { class: "rel-cartao-topo" },
        // plano 2000d · IY-042: sem «Órbita» fixo — a marca da sessão (white-label) ou «Deixe tudo pronto»
        h("h2", { id: "ini-ob", class: "rel-h2" }, tituloChecklist(nomeMarca(ctx.marca))),
        h("p", { class: "rel-nota" }, `${r.obrigFeitos} de ${r.obrigatorios} passos · ${pct(r.pct)}`)),
      h("span", { class: "ini-onb-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(r.pct), "aria-valuetext": `${r.obrigFeitos} de ${r.obrigatorios} passos (${pct(r.pct)})`, "aria-label": "Progresso da configuração" },
        h("i", { style: { "--w": `${r.pct}%` } })),
      h("ol", { class: "ini-onb-lista" }, r.pendentes.slice(0, 4).map(i => itemPendente(i, r.proximo && i.id === r.proximo.id))),
      r.pendentes.length > 4 ? h("details", { class: "ini-onb-mais" }, h("summary", null, `Mais ${r.pendentes.length - 4} ${r.pendentes.length - 4 === 1 ? "passo" : "passos"}`),
        h("ol", { class: "ini-onb-lista" }, r.pendentes.slice(4).map(i => itemPendente(i, false)))) : null,
      feitos.length ? h("details", { class: "ini-onb-feitos" }, h("summary", null, `Já feitos (${feitos.length})`),
        h("ul", null, feitos.map(i => h("li", null, ui.icone("check"), i.rotulo, i.pulado ? h("span", { class: "rel-nota" }, " · marcado por você ",
          h("button", { type: "button", class: "link ini-onb-desmarcar", dataset: { k: `onb-des-${i.id}` }, "aria-label": `Desmarcar «${i.rotulo}»`, on: { click: () => marcarPulado(i, false) } }, "desmarcar")) : null)))) : null,
      h("div", { class: "ini-onb-rodape" },
        // plano 1000b · RB-173: «Dispensar» por engano tem volta, como o «Já está bom» (CR-252)
        h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "onb-dispensar" }, on: { click: () => {
          const p = lerOnb(); p.dispensadoAte = L.dispensarOnboardingAte(); gravarOnb(p);
          // plano 2000d · DR-334: com o servidor novo (o estado traz dispensado_ate) a dispensa vale em todo aparelho; sem ele, só neste
          const noServidor = !!(ultimoOnb && typeof ultimoOnb === "object" && "dispensado_ate" in ultimoOnb);
          const servidor = ate => { if (!noServidor) return; try { Promise.resolve(ctx.api.rpcC("nx_onboarding_dispensar", { p_ate: ate ? new Date(ate).toISOString() : null })).catch(() => {}); } catch { /* fica só neste aparelho */ } };
          servidor(p.dispensadoAte);
          // plano 2000d · DU-239 (pendência da frente sis): o aviso diz onde reabrir (rotas.TEXTO_REABRIR_PASSOS)
          const reabrir = R && typeof R.TEXTO_REABRIR_PASSOS === "string" ? ` ${R.TEXTO_REABRIR_PASSOS}` : "";
          ui.toast(`Escondemos este cartão por 7 dias.${reabrir}`, { tipo: "info", desfazer: () => { const q = lerOnb(); q.dispensadoAte = 0; gravarOnb(q); servidor(null);
            if (ultimoOnb && noServidor) ultimoOnb = { ...ultimoOnb, dispensado_ate: null }; refazer(); } });
          refazer();
        } } }, "Dispensar por 7 dias")));
  }

  /** plano 2000d · DU-449: «Ver como (1 min)» — rotas.videoDoPasso com a marca da sessão; sem vídeo, nada. */
  function linkVideoPasso(p) {
    let v = null;
    try { v = R && typeof R.videoDoPasso === "function" ? R.videoDoPasso({ id: p.id, video: p.video }, ctx.marca || null) : null; } catch { v = null; }
    return v ? h("a", { class: "rel-link ini-guia-video", href: v.url, target: "_blank", rel: "noopener noreferrer", dataset: { k: `video-${p.id}`, exemploOk: "1" } }, v.rotulo) : null;
  }
  /** plano 2000d · DU-236: «~3 min» de um item do checklist (os ids do servidor → os de rotas.PASSOS_INFO). */
  function tempoItem(id) {
    const chave = { chave_codewords: "whatsapp", aparelho_pareado: "whatsapp", recebimento: "whatsapp", colega_convidado: "equipe", funil_ajustado: "funil",
      agenda_faixas: "agenda", ia_ou_direto: "automacao", contatos_importados: "contatos" }[id] || id;
    const i = R && R.PASSOS_INFO && R.PASSOS_INFO[chave];
    return i && i.min ? `~${i.min} min` : "";
  }
  /** plano 1500c · RC-195/RC-243: o «i» que explica no toque (ui.flutuante), igual ao dos KPIs (RB-179) — fora de links. */
  function botaoAjuda(k, nome, texto) {
    // plano 2000d · IY-046: nasce «recolhido» (aria-expanded=false), como o «i» dos KPIs — o ui.flutuante troca para true/false ao abrir e fechar
    const bt = h("button", { type: "button", class: "bt-icone ini-i-bt", "aria-label": `O que é «${nome}»?`, "aria-haspopup": "dialog", "aria-expanded": "false", dataset: { k: `aj-${k}` } }, ui.icone("info"));
    bt.addEventListener("click", ev => {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      if (typeof ui.flutuante === "function") ui.flutuante(bt, h("p", { class: "ini-kpi-ajuda-txt" }, texto), { classe: "ini-kpi-ajuda-flut" });
    });
    return bt;
  }

  /**
   * plano 1500c · RC-254: o resumo do mês numa folha só (A4) — montado à parte, na página, impresso pelo navegador (Salvar como PDF) e retirado
   * depois. Fechar sem imprimir também tira. Só nós do DOM; os números são os de nx_inicio.
   */
  function abrirResumoMes(d, voc, { anterior = false } = {}) {
    const velho = document.querySelector(".ini-resumo-folha");
    if (velho) velho.remove();
    const hoje = d.hoje || L.hojeSP();
    // plano 2000d · DR-406: o mês que fechou (do dia 1 ao último dia dele), com o que o servidor manda do mês anterior
    const ultimoAnt = somarDiasIso(primeiroDiaMes(hoje), -1);
    const mes = mesPorExtenso(String(anterior ? ultimoAnt : hoje).slice(0, 7));
    const brl = v => L.textoMoeda(v, { centavos: false });
    const linhas = anterior ? (linhasResumoMesAnterior(d, { brl }) || []) : linhasResumoMes(d, { voc, brl });
    // plano 2000d · DR-247: a marca da sessão no rodapé (Órbita, Nexus, a marca da agência) — nunca «Órbita» fixo
    const marca = nomeMarca(ctx.marca);
    const ate = L.ddmmIso(anterior ? ultimoAnt : hoje);
    const texto = textoResumoMes(linhas, { empresa: ctx.cliente.nome || "", mes, ate: anterior ? "" : ate, marca });     // plano 1500c · IC-003
    // plano 2000d · IY-045: com a folha aberta a página de trás não rola junto (html.ini-folha-aberta); fechar devolve a rolagem
    const fechar =() => { folha.remove(); document.documentElement.classList.remove("ini-imprimindo", "ini-folha-aberta"); if (typeof removeEventListener === "function") removeEventListener("afterprint", fechar); focarK(anterior ? "resumo-anterior" : "resumo-mes"); };
    const folha = h("section", { class: "ini-resumo-folha", role: "dialog", "aria-modal": "true", "aria-labelledby": "ini-rs-t", tabindex: "-1" },
      h("header", { class: "ini-resumo-cab" }, h("p", { class: "rel-olho" }, ctx.cliente.nome || ""), h("h2", { id: "ini-rs-t", class: "ini-resumo-titulo" }, `Resumo de ${mes}`),
        h("p", { class: "rel-nota", dataset: { k: "rs-periodo" } }, `${anterior ? `mês fechado, do dia 1 a ${ate}` : `do dia 1 até ${ate}`}${marca ? ` · números do ${marca}` : ""}`)),
      h("dl", { class: "ini-resumo-lista" }, linhas.map(x => h("div", { class: ["ini-resumo-l", x.id === "roi" && "ini-resumo-destaque"] }, h("dt", null, x.rotulo), h("dd", { class: "rel-num" }, x.valor)))),
      linhas.length ? null : h("p", { class: "rel-nota" }, "Ainda não há números deste mês."),
      h("p", { class: "rel-nota ini-resumo-rod" }, "Contagens do CRM e das conversas; retorno dos anúncios só quando o gasto do mês está ligado."),
      h("p", { class: "rel-nota ini-resumo-gerado", dataset: { k: "rs-gerado" } }, textoGeradoEm(Date.now())),     // plano 1500c · IC-005
      h("div", { class: "ini-resumo-acoes" },
        // plano 1500c · IC-003: o mesmo resumo em texto, pronto para colar no WhatsApp do sócio
        linhas.length ? h("button", { type: "button", class: "bt bt-sec", dataset: { k: "rs-copiar" }, on: { click: () => copiarResumo(texto) } }, "Copiar texto") : null,
        // plano 1500c · IC-004: no celular, «Compartilhar» abre a folha de compartilhar do sistema (só aparece onde existe)
        linhas.length && typeof navigator !== "undefined" && navigator && typeof navigator.share === "function"
          ? h("button", { type: "button", class: "bt bt-sec", dataset: { k: "rs-compartilhar" }, on: { click: () => { try { const p = navigator.share({ title: `Resumo de ${mes}`, text: texto }); if (p && typeof p.catch === "function") p.catch(() => {}); } catch { /* cancelado */ } } } }, "Compartilhar")
          : null,
        h("button", { type: "button", class: "bt bt-prim", dataset: { k: "rs-imprimir" }, on: { click: () => { try { if (typeof print === "function") print(); } catch { /* sem impressão */ } } } }, "Imprimir ou salvar PDF"),
        h("button", { type: "button", class: "bt bt-sec", dataset: { k: "rs-fechar" }, on: { click: fechar } }, "Fechar")));
    folha.addEventListener("keydown", ev => {
      if (ev.key === "Escape") { ev.preventDefault(); fechar(); return; }
      // plano 2000d · IY-043: é um diálogo modal — o Tab circula dentro da folha (antes saía para a tela de trás, escondida pelo modal)
      if (ev.key === "Tab") {
        const foc = folha.querySelectorAll("button:not([disabled]), a[href], [tabindex='0']");
        if (!foc.length) return;
        const prim = foc[0], ult = foc[foc.length - 1], at = document.activeElement;
        if (ev.shiftKey && (at === prim || at === folha)) { ev.preventDefault(); ult.focus(); }
        else if (!ev.shiftKey && (at === ult || !folha.contains(at))) { ev.preventDefault(); prim.focus(); }
      }
    });
    document.body.append(folha);
    document.documentElement.classList.add("ini-imprimindo", "ini-folha-aberta");
    if (typeof addEventListener === "function") addEventListener("afterprint", fechar);
    if (typeof folha.focus === "function") folha.focus();
    return folha;
  }

  /** plano 1500c · IC-003: copia o texto do resumo (ui.copiar quando existe; senão a área de transferência) e avisa. */
  async function copiarResumo(texto, aviso = "Resumo copiado. É só colar no WhatsApp.") {
    let ok = false;
    try {
      if (typeof ui.copiar === "function") { await ui.copiar(texto, { aviso }); return true; }
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") { await navigator.clipboard.writeText(texto); ok = true; }
    } catch { ok = false; }
    if (typeof ui.toast === "function") ui.toast(ok ? aviso : "Não deu para copiar aqui. Selecione o texto.", { tipo: ok ? "ok" : "erro" });
    return ok;
  }
  /** plano 2000d · DR-288: a folha de compartilhar do sistema (celular); cancelar não é erro. */
  function compartilharTexto(titulo, texto) {
    try { const p = navigator.share({ title: titulo, text: texto }); if (p && typeof p.catch === "function") p.catch(() => {}); } catch { /* cancelado */ }
  }

  /** plano 1500c · UC-011: rola até o checklist (ou os primeiros passos do cliente novo) e põe o foco no título dele. */
  function irParaPassos() {
    setTimeout(() => {
      if (minha !== montagem) return;
      const c = raiz.querySelector(".ini-onb") || raiz.querySelector(".ini-guia-cartao");
      if (!c) return;
      c.hidden = false;
      try { if (typeof c.scrollIntoView === "function") c.scrollIntoView({ block: "start" }); } catch { /* ok */ }
      const t = c.querySelector("h2");
      if (t) { t.setAttribute("tabindex", "-1"); if (typeof t.focus === "function") t.focus(); }
    }, 70);
  }

  /**
   * plano 2000d · DR-357: «#/inicio?bloco=metas» — abre «Mais detalhes» e o bloco (se recolhido), rola até ele e põe o foco no título.
   * Só na tela: a preferência guardada (recolhido) não muda.
   */
  function irParaBloco(id) {
    setTimeout(() => {
      if (minha !== montagem) return;
      const sec = raiz.querySelector(`section[data-bloco="${id}"]`);
      if (!sec) return;
      const det = typeof sec.closest === "function" ? sec.closest("details.ini-mais") : null;
      if (det && !det.open) det.open = true;
      const cb = sec.querySelector(".ini-bloco-corpo");
      if (cb && cb.hidden) { cb.hidden = false; sec.classList.remove("ini-rec"); const br = sec.querySelector(".ini-bl-rec"); if (br) br.setAttribute("aria-expanded", "true"); }
      try { if (typeof sec.scrollIntoView === "function") sec.scrollIntoView({ block: "start" }); } catch { /* ok */ }
      const t = sec.querySelector("h2");
      if (t) { t.setAttribute("tabindex", "-1"); if (typeof t.focus === "function") t.focus(); }
    }, 70);
  }
  /** plano 2000d · DR-332: a folha de atalhos («?») — flutuante ancorado no «Atualizar»; Esc fecha (ui.flutuante). */
  function abrirAtalhos() {
    if (typeof ui.flutuante !== "function") { ui.toast(ATALHOS_INICIO.map(a => `${a.tecla}: ${a.txt}`).join(" · "), { tipo: "info" }); return null; }
    const caixa = h("div", { class: "ini-atalhos", role: "document", dataset: { k: "atalhos" } }, h("b", null, "Atalhos do Início"),
      h("dl", { class: "ini-atalhos-lista" }, ATALHOS_INICIO.map(a => h("div", { class: "ini-atalho" }, h("dt", null, h("kbd", null, a.tecla)), h("dd", null, a.txt)))));
    return ui.flutuante(btn, caixa, { classe: "ini-atalhos-flut" });
  }
  /** plano 1500c · RC-213: «Testar» o número (nx_canal_testar) → «Enviado às 10:32» ao lado; erro volta o botão e explica. */
  function botaoTestarCanal(k) {
    const st = h("span", { class: "rel-nota ini-canal-teste", role: "status" });
    const bt = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `cn-testar-${k.id}` }, "aria-label": `Testar o envio pelo número ${k.nome || ""}`.trim() }, "Testar");
    bt.addEventListener("click", async () => {
      if (bt.disabled) return;
      bt.disabled = true; st.textContent = "Enviando…";
      try {
        await ctx.api.rpcC("nx_canal_testar", { p_canal: k.id });
        if (minha !== montagem) return;
        st.textContent = `Enviado às ${L.horaSP(new Date())}. Confira no seu WhatsApp.`;
      } catch (e) { st.textContent = ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível testar agora."; }
      finally { bt.disabled = false; }
    });
    return h("div", { class: "ini-canal-acoes" }, bt, st);
  }

  /** plano 1500c · IC-001: o cartão «cada R$ 1 virou R$ X» — a frase que vende o Órbita, com a conta à vista (receita ÷ gasto do mês). */
  function cartaoRetorno(r, d = ultimoDado) {
    const mult = textoMultiplo(r.multiplo);
    const rot = rotuloRetorno(r);      // plano 2000d · DR-248: sem a receita de anúncio, o cartão diz que é a receita TOTAL
    const conta = `${brl0(r.receita)} ${r.deAnuncio ? "de vendas de anúncio" : "de receita (todas as origens)"} ÷ ${brl0(r.gasto)} investidos em anúncios no mês`;
    const jan = janelaRetorno(d);      // plano 2000d · DR-249
    const plats = retornoPorPlataforma(d);      // plano 2000d · DR-270
    const vendas = r.deAnuncio ? ultimasVendasAnuncio(d) : null;     // plano 2000d · DR-328
    const frase = rot.invertido
      ? [rot.inicio, h("b", { class: "ini-roi-n rel-num", dataset: { n: "negocios.receita_mes" } }, mult), rot.meio, h("span", { class: "ini-roi-um" }, "R$ 1"), " ", h("em", { class: "narr" }, rot.frase)]
      : [rot.inicio, h("span", { class: "ini-roi-um" }, "R$ 1"), rot.meio, h("b", { class: "ini-roi-n rel-num", dataset: { n: "negocios.receita_mes" } }, mult), " ", h("em", { class: "narr" }, rot.frase)];
    return h("section", { class: ["ini-roi", "rel-entra", r.multiplo >= 1 ? "ini-roi-bom" : "ini-roi-baixo", !r.deAnuncio && "ini-roi-total"], "aria-labelledby": "ini-roi-t", dataset: { k: "roi" } },
      h("p", { class: "rel-olho ini-roi-olho", dataset: { k: "roi-olho" } }, rot.olho,
        corpo.classList.contains("ini-exemplo") ? h("span", { class: "ini-exemplo-selo ini-exemplo-selo-p", dataset: { k: "ex-selo-roi" } }, "Exemplo") : null),     // DR-265
      h("h2", { id: "ini-roi-t", class: "ini-roi-frase" }, ...frase),
      // plano 2000d · DR-269: de quando é a conta («outubro, do dia 1 até hoje (25/10)»)
      h("p", { class: "rel-nota ini-roi-periodo", dataset: { k: "roi-periodo" } }, periodoRetorno(d && d.hoje || L.hojeSP())),
      h("p", { class: "rel-nota ini-roi-conta" }, conta),
      // plano 1500c · IC-007/IC-008: abaixo de R$ 1 (ou sem venda nenhuma) o cartão diz a verdade em vez de comemorar
      notaRetorno(r, brl0) ? h("p", { class: "rel-nota ini-roi-alerta", dataset: { k: "roi-nota" } }, notaRetorno(r, brl0)) : null,
      jan.nota ? h("p", { class: "rel-nota ini-roi-cedo", dataset: { k: "roi-cedo" } }, jan.nota) : null,
      jan.ult30 ? h("p", { class: "rel-nota ini-roi-30", dataset: { k: "roi-30" } }, `Nos últimos 30 dias: cada R$ 1 virou ${textoMultiplo(jan.ult30.multiplo)} (${brl0(jan.ult30.receita)} ÷ ${brl0(jan.ult30.gasto)}).`) : null,
      // plano 1500c · IC-006 / plano 2000d · DR-246: o custo de cada lead DE ANÚNCIO no mês
      r.cpl ? h("p", { class: "rel-nota ini-roi-cpl", dataset: { k: "roi-cpl" } }, `Cada lead de anúncio custou ${L.textoMoeda(r.cpl, { centavos: r.cpl < 100 })} este mês.`     /* plano 2000d · IY-073 */) : null,
      plats ? h("ul", { class: "ini-roi-plats", "aria-label": "Retorno por plataforma", dataset: { k: "roi-plats" } }, plats.map(p => h("li", { class: ["ini-roi-plat", p.melhor && "ini-roi-melhor"] },
        typeof ui.icone === "function" ? ui.icone(p.id) : null, h("b", null, p.nome),
        h("span", { class: "rel-nota" }, ` · ${brl0(p.gasto)} investidos`, p.multiplo !== null ? ` → ${brl0(p.receita)} (cada R$ 1 virou ${textoMultiplo(p.multiplo)})` : "", p.leads !== null ? ` · ${p.leads} ${p.leads === 1 ? "lead" : "leads"}` : ""),
        p.melhor ? h("span", { class: "ini-roi-selo" }, "rendeu mais") : null))) : null,
      vendas ? h("div", { class: "ini-roi-vendas", dataset: { k: "roi-vendas" } }, h("p", { class: "rel-olho" }, "Últimas vendas que vieram de anúncio"),
        h("ul", null, vendas.map(v => h("li", null, h("b", null, v.nome), [v.servico, v.valor !== null ? brl0(v.valor) : null, v.plataforma, v.quando].filter(Boolean).map(t => ` · ${t}`).join(""))))) : null,     // IY-066
      podeAds ? h("a", { class: "rel-link", href: "#/anuncios", dataset: { k: "roi-ads" } }, "Ver campanhas") : null);
  }

  /** A8: pílula de canal/origem só quando a biblioteca conhece a chave (chave desconhecida daria uma pílula vazia). */
  function pilulaSegura(chave, variante, plataforma = null) {
    if (!chave || typeof ui.pilula !== "function") return null;
    const p = ui.pilula(null, chave, { variante, plataforma, tamanho: "p" });
    return String(p.textContent || "").trim() ? p : null;
  }
  /** B4: «Assumir» — a conversa passa para a própria conta (nx_cv_atribuir) e abre; trava em voo (dois cliques não chamam duas vezes). */
  async function assumirConversa(it, bt) {
    if (!bt || bt.disabled) return;
    bt.disabled = true; bt.setAttribute("aria-busy", "true");
    // plano 1000b · RB-163: já está com outra pessoa → pergunta antes de tomar («Está com Ana. Assumir mesmo assim?»)
    const pergunta = perguntaAssumir(it, contaId);
    if (pergunta && typeof ui.confirmar === "function") {
      let ok = false;
      try { ok = await ui.confirmar({ titulo: "Assumir a conversa?", texto: pergunta, rotulo: "Assumir" }); } catch { ok = false; }
      if (minha !== montagem) return;
      if (!ok) { bt.disabled = false; bt.removeAttribute("aria-busy"); return; }
    }
    try {
      await ctx.api.rpcC("nx_cv_atribuir", { p_conversa: it.id, p_conta: contaId });
      if (minha !== montagem) return;
      // plano 1500c · RC-205: «Desfazer» devolve a quem estava (ou à fila, sem responsável) — tocar sem querer tem volta, já na tela da conversa
      const anterior = it.atribuidaId && String(it.atribuidaId) !== String(contaId) ? it.atribuidaId : null;
      ui.toast("Conversa com você.", { tipo: "ok", desfazer: () => {
        Promise.resolve(ctx.api.rpcC("nx_cv_atribuir", { p_conversa: it.id, p_conta: anterior }))
          .then(() => ui.toast(anterior ? `Conversa devolvida a ${it.atribuidaNome || "quem estava"}.` : "Conversa de volta à fila.", { tipo: "info" }),
            e => ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível desfazer.", { tipo: "erro" }));
      } });
      ctx.navegar(`#/conversas/${encodeURIComponent(it.id)}`);
    } catch (e) {
      if (minha !== montagem) return;
      bt.disabled = false; bt.removeAttribute("aria-busy");
      ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível assumir a conversa.", { tipo: "erro" });
    }
  }

  /** plano 1000b · RB-260: voltando do «Fazer agora» (mesma empresa e conta, até 30 min): «Mais detalhes» como estava e o foco no mesmo item
      (que rola até ele); o item já saiu da lista (feito) → a mesma rolagem. Depois do foco que o shell põe no título. */
  function voltarAoLugar() {
    let m = memVolta;
    memVolta = null;
    // plano 1500c · RC-216: sem a memória (página recarregada), o que ficou na sessão da aba — lido uma vez e apagado
    try {
      if (!m) { const s = JSON.parse(sessionStorage.getItem(CHAVE_VOLTA) || "null"); if (s && typeof s === "object") m = s; }
      sessionStorage.removeItem(CHAVE_VOLTA);
    } catch { /* sem armazenamento */ }
    if (!m || m.dono !== `${ctx.cliente.id}|${contaId}` || Date.now() - m.em > VALIDADE_VOLTA) return;
    setTimeout(() => {
      if (minha !== montagem) return;
      const el = raiz.querySelector(`[data-k="onb-${m.item}"]`);
      if (el && typeof el.focus === "function") el.focus();
      else if (typeof scrollTo === "function" && m.y > 0) { try { scrollTo({ top: m.y }); } catch { /* ok */ } }
    }, 60);
  }
  /** 1ª pintura: o esqueleto sai e o cabeçalho + o corpo entram com um fade curto (a troca não desloca nada). */
  function trocar() { if (colocado) return Promise.resolve(); colocado = true; return ui.trocarEsqueleto(raiz, [cab, corpo]); }

  /** O módulo de tarefas do CRM (formTarefa) com o kit dele — carregado só quando a pessoa pede. */
  async function modTarefas() {
    const crm = await ctx.carregar("crm");
    const kit = await crm.kit(ctx);
    return { kit, mod: await kit.mod("tarefas") };
  }
  /** plano 1500c · RC-227: devolve o foco a um controle pelo data-k depois do redesenho (o teclado não volta ao topo). */
  function focarK(k) {
    if (minha !== montagem) return;
    const el = raiz.querySelector(`[data-k="${CSS.escape(k)}"]`);
    if (el && typeof el.focus === "function") el.focus();
  }
  /** plano 1500c · RC-192: «Amanhã» — grava o novo vencimento já (nx_tarefa_salvar), tira a linha da lista de hoje e «Desfazer» devolve o de antes. */
  async function adiarTarefa(tf, bt, li) {
    if (!bt || bt.disabled) return;
    // plano 1500c · IC-014: sem internet não tenta (o erro vinha depois de esperar); avisa na hora e o botão continua lá
    if (semRede()) { ui.toast("Sem internet: a tarefa não foi adiada. Tente de novo quando voltar.", { tipo: "erro" }); return; }
    bt.disabled = true;
    const antes = tf.vence_em || null, novo = adiarParaAmanha(antes);
    try {
      await ctx.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: tf.id, vence_em: novo } });
      if (minha !== montagem) return;
      if (li) li.hidden = true;
      const voltar = async () => {
        try { await ctx.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: tf.id, vence_em: antes } }); }
        catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível desfazer.", { tipo: "erro" }); }
        if (minha === montagem) carregar({ forcar: true });
      };
      ui.toast(`Adiada para amanhã, ${L.horaSP(novo)}.`, { tipo: "ok", desfazer: () => { voltar(); } });
      carregar({ forcar: true });
    } catch (e) {
      bt.disabled = false;
      ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível adiar a tarefa.", { tipo: "erro" });
    }
  }

  function itemTarefa(tf) {
    const id = `ini-tf-${tf.id}`;
    // plano 1000b · RB-169: sem internet nasce desligada, com a dica (marcarRede religa quando a rede volta)
    const off = semRede();
    const caixa = h("input", { type: "checkbox", id, class: "ini-check", dataset: { k: `tf-${tf.id}` }, disabled: !escreve || off,
      title: off ? "Sem internet: dá para concluir quando a conexão voltar" : null, "aria-label": `Concluir: ${tf.titulo}` });
    // plano 1500c · RC-193: quanto atrasou em negrito («venceu há 3 dias»), não no mesmo texto miúdo das outras
    const venc = tf.vence_em ? (tf.atrasada ? ["atrasada · ", h("b", { class: "ini-tf-atraso" }, `venceu ${ui.relativo(tf.vence_em)}`)] : [`vence ${L.quandoSP(tf.vence_em)}`]) : ["sem prazo"];
    const alvoNome = tf.contato_nome ? ` · ${tf.contato_nome}` : "";
    // plano 1500c · RC-191: a tarefa avulsa (sem negócio nem contato) também abre — o formulário da tarefa, para editar ou mudar o prazo
    const podeForm = podeTarefas && escreve && typeof ctx.carregar === "function";
    const abrir = tf.negocio_id || tf.contato_id || podeForm
      ? h("button", { type: "button", class: "ini-tf-abrir", dataset: { k: `tfa-${tf.id}` } }, tf.titulo)
      : h("span", { class: "ini-tf-t" }, tf.titulo);
    if (tf.negocio_id) abrir.addEventListener("click", () => pontes.abrirNegocio(tf.negocio_id, { aoMudar: () => carregar({ forcar: true }) }));
    else if (tf.contato_id) abrir.addEventListener("click", () => pontes.abrirContato(tf.contato_id, { aoMudar: () => carregar({ forcar: true }) }));
    else if (podeForm) abrir.addEventListener("click", async () => {
      try {
        const T = await modTarefas();
        const r = await T.mod.formTarefa(T.kit, tf, {});
        if (r && minha === montagem) carregar({ forcar: true });
      } catch (e) { console.error(e); ui.toast("Não deu para abrir a tarefa agora.", { tipo: "erro" }); }
    });
    // plano 1500c · RC-192: «Amanhã» adia direto daqui (mesma hora, nx_tarefa_salvar) com Desfazer — antes só pelo #/tarefas
    const adiar = escreve && podeTarefas ? h("button", { type: "button", class: "bt bt-fant bt-p ini-tf-adiar", dataset: { k: `tfd-${tf.id}` }, "aria-label": `Adiar para amanhã: ${tf.titulo}` }, "Amanhã") : null;
    if (adiar) adiar.addEventListener("click", () => adiarTarefa(tf, adiar, li));
    const li = h("li", { class: `ini-tf-item${tf.atrasada ? " atrasada" : ""}` },
      h("label", { class: "ini-tf-caixa", for: id }, caixa, h("span", { class: "ini-tf-marca", "aria-hidden": "true" })),
      h("div", { class: "ini-tf-txt" }, abrir, h("p", { class: `rel-nota${tf.atrasada ? " rel-txt-ruim" : ""}` }, ...venc, alvoNome)),
      adiar);
    caixa.addEventListener("change", async () => {
      if (!caixa.checked) return;
      li.classList.add("feita");
      // plano 1000 (CR-173): concluída, a caixa trava (desmarcar não fazia nada) — reabrir só pelo «Desfazer»
      caixa.disabled = true;
      try {
        await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: true });
        // plano 1000 (CR-174): o mesmo «Desfazer» do CRM (ui.acaoComDesfazer: também atende Ctrl+Z); sem ele, o toast de antes
        const reabrir = async () => {
          try { await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: false }); carregar({ forcar: true }); }
          catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível desfazer.", { tipo: "erro" }); throw e; }
        };
        if (typeof ui.acaoComDesfazer === "function") ui.acaoComDesfazer({ texto: "Tarefa concluída", reverter: reabrir }).catch(() => {});
        else ui.toast("Tarefa concluída.", { tipo: "ok", desfazer: () => reabrir().catch(() => {}) });
        // B8: o ✓ da biblioteca cobre a linha e a lista só é relida depois dele (sem a peça, a releitura sai em 500 ms como antes)
        const ok = typeof ui.checkSucesso === "function" ? ui.checkSucesso(li) : new Promise(r => setTimeout(r, 500));
        Promise.resolve(ok).then(() => { if (minha === montagem) carregar({ forcar: true }); });
      } catch (e) {
        li.classList.remove("feita"); caixa.checked = false; caixa.disabled = !escreve || semRede();     // RB-169
        ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível concluir a tarefa.", { tipo: "erro" });
      }
    });
    return li;
  }

  await carregar({ primeira: true });
  if (minha !== montagem) return;
  voltarAoLugar();
  if (pedirPassos) irParaPassos();     // plano 1500c · UC-011
  if (blocoPedido) irParaBloco(blocoPedido);     // plano 2000d · DR-357
  // plano 2000d · DU-242: mudou o objetivo nas boas-vindas → os blocos se reordenam na hora
  const aoObjetivo = ev => { if (minha !== montagem) return; const det = ev && ev.detail; if (det && det.cliente != null && String(det.cliente) !== String(ctx.cliente.id)) return; redesenhar(); };
  document.addEventListener("nx:objetivo", aoObjetivo);
  // o shell não troca de versão no meio de uma tarefa marcada como concluída (nem com metas sendo ajustadas ou a 1ª meta digitada)
  if (typeof ctx.naoAtualizar === "function") cancelarOcupado = ctx.naoAtualizar(() => metasEditando || !!document.querySelector(".ini-tf-item.feita"));
  // B5: o shell soube que um número caiu ou voltou (nx_pulso / notificação): só a faixa é repintada, sem RPC e sem redesenhar a tela
  if (ctx.canais && typeof ctx.canais.assinar === "function") cancelarCanais = ctx.canais.assinar(() => { if (minha === montagem && ultimoDado) pintarFaixa(); });
  // tempo real: o pulso avisa que algo mudou; recarrega no máximo a cada 30 s
  // plano 1000b · RB-164: shell sem pulso (ou sem assinar) não derruba a tela — a mesma guarda do CRM (crm-kanban)
  if (ctx.pulso && typeof ctx.pulso.assinar === "function") cancelarPulso = ctx.pulso.assinar(() => {
    if (tPulso) return;
    const falta = Math.max(0, INTERVALO_PULSO - (Date.now() - ultimaCarga));
    tPulso = setTimeout(() => { tPulso = 0; if (!document.hidden) carregar(); }, falta);
  });
  // plano 1000 (CR-166): com a aba oculta o pulso não recarrega — ao VOLTAR (passados 30 s da última leitura) o Início relê na hora
  if (modoTv) pedirTravaTela();     // plano 2000d · IY-048
  const aoVoltarVisivel = () => {
    if (!document.hidden && minha === montagem && modoTv) pedirTravaTela();     // IY-048: a trava cai quando a aba some
    if (document.hidden || minha !== montagem || metasEditando) return;
    if (Date.now() - ultimaCarga > INTERVALO_PULSO) { clearTimeout(tPulso); tPulso = 0; carregar(); }
  };
  document.addEventListener("visibilitychange", aoVoltarVisivel);
  // plano 1500c · RC-211: «R» atualiza o Início (sem modificador, fora de campos e de janelas abertas) e anuncia quando terminou
  const aoTecla = ev => {
    if (minha !== montagem || !ev || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
    // plano 2000d · IY-051: Esc sai do modo TV
    if (ev.key === "Escape" && modoTv && teclaLivre(ev.target, document)) { ev.preventDefault(); ctx.navegar("#/inicio"); return; }
    // plano 1500c · IC-009: Esc sai do exemplo (como o botão «Voltar e conectar»), fora de campos e sem folha aberta por cima
    if (ev.key === "Escape" && verExemplo && teclaLivre(ev.target, document)) { ev.preventDefault(); verExemplo = false; redesenhar(); return; }
    // plano 2000d · DR-332: «?» mostra os atalhos do Início
    if (ev.key === "?" && teclaLivre(ev.target, document)) { ev.preventDefault(); abrirAtalhos(); return; }
    if (ev.key !== "r" && ev.key !== "R") return;
    if (!teclaLivre(ev.target, document)) return;
    if (btn.disabled || lendoForcado || metasEditando) return;
    ev.preventDefault();
    Promise.resolve(carregar({ forcar: true })).then(() => { if (minha === montagem && !falhouUltima && typeof ui.anunciar === "function") ui.anunciar("Atualizado"); });
  };
  document.addEventListener("keydown", aoTecla);
  // plano 1500c · RC-298: no celular, puxar a página para baixo no topo atualiza (com indicador; sem animação em movimento reduzido)
  const puxar = h("div", { class: "ini-puxar", "aria-hidden": "true", hidden: true }, h("span", { class: "ini-puxar-ic" }, ui.icone("reabrir")), h("span", { class: "ini-puxar-t" }, "Puxe para atualizar"));
  cab.insertBefore(puxar, cab.firstChild);     // no cabeçalho (fica entre os redesenhos do corpo)
  let y0 = null, x0 = 0, dist = 0;
  const LIMIAR_PUXAR = 70;
  // plano 1500c · IC-016: com uma janela aberta por cima (diálogo, resumo) ou com dois dedos, puxar não atualiza
  const aoToqueIni = ev => { const t = ev.touches && ev.touches[0]; const livre = (ev.touches && ev.touches.length === 1) && !document.querySelector("[aria-modal='true']");
    y0 = t && livre && (typeof scrollY !== "number" || scrollY <= 0) && !lendoForcado ? t.clientY : null; x0 = t ? t.clientX : 0; dist = 0; };
  const aoToqueMove = ev => {
    if (y0 === null) return;
    const t = ev.touches && ev.touches[0];
    dist = t ? Math.max(0, t.clientY - y0) : 0;
    // plano 1500c · IC-016: arrastar para o lado (rolar o gráfico, os cartões) não vira «puxar para atualizar»
    if (t && Math.abs(t.clientX - x0) > Math.max(24, dist)) { y0 = null; dist = 0; puxar.hidden = true; puxar.classList.remove("pronto"); return; }
    puxar.hidden = dist < 12;
    puxar.classList.toggle("pronto", dist >= LIMIAR_PUXAR);
    puxar.lastChild.textContent = dist >= LIMIAR_PUXAR ? "Solte para atualizar" : "Puxe para atualizar";
    puxar.style.setProperty("--puxe", `${Math.min(LIMIAR_PUXAR, dist)}px`);
  };
  const aoToqueFim = () => {
    if (y0 === null) return;
    const vai = dist >= LIMIAR_PUXAR;
    y0 = null; dist = 0; puxar.hidden = true; puxar.classList.remove("pronto");
    if (vai && !btn.disabled && !lendoForcado) carregar({ forcar: true });
  };
  raiz.addEventListener("touchstart", aoToqueIni, { passive: true });
  raiz.addEventListener("touchmove", aoToqueMove, { passive: true });
  raiz.addEventListener("touchend", aoToqueFim);
  raiz.addEventListener("touchcancel", aoToqueFim);
  // CR-181: caiu → o botão diz «Sem internet»; voltou → relê na hora
  const aoOffline = () => { if (minha === montagem) marcarRede(); };
  const aoOnline = () => { if (minha !== montagem) return; marcarRede(); clearTimeout(tPulso); tPulso = 0; carregar({ forcar: true }); };
  if (typeof addEventListener === "function") { addEventListener("offline", aoOffline); addEventListener("online", aoOnline); }
  marcarRede();
  cancelarVisivel = () => {
    document.removeEventListener("visibilitychange", aoVoltarVisivel);
    document.removeEventListener("keydown", aoTecla);     // RC-211
    document.removeEventListener("nx:objetivo", aoObjetivo);     // plano 2000d · DU-242
    if (typeof removeEventListener === "function") { removeEventListener("offline", aoOffline); removeEventListener("online", aoOnline); }
  };
  // relógio: a cada minuto «Agora» e as barras andam com a hora (sem RPC; nada é refeito com as metas em edição);
  // na virada do dia a tela relê tudo — a agenda da semana e a do mês começam no dia novo
  let diaVisto = L.hojeSP();
  tRelogio = setInterval(() => {
    if (minha !== montagem || document.hidden) return;
    const hoje = L.hojeSP();
    if (hoje !== diaVisto) {
      diaVisto = hoje;
      // plano 1000b · RB-152: a data do cabeçalho também vira (antes ficava a de ontem até sair da tela)
      pintarData(); dataEl.setAttribute("datetime", hoje);     // plano 1500c · RC-221: a longa e a curta
      carregar(); return;
    }
    if (relogio && !metasEditando) relogio();
    if (ultimoDado) pintarFaixa();          // o «há 12 min» da faixa anda com o relógio
    pintarIdade();                          // CR-284: «· há 11 min» anda com o relógio
  }, INTERVALO_RELOGIO);
}
