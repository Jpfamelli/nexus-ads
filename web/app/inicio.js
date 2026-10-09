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
let donoDados = "";        // «empresa|conta» a quem pertencem os últimos dados guardados acima (a aba não recarrega ao trocar de empresa)
let modoHoras = "hoje";    // «Hoje» ou «7 dias» no gráfico de barras
let metasEditando = false; // o formulário de metas está aberto ou a 1ª meta está sendo digitada (o pulso e o relógio não redesenham por cima)
let rascunhoMetas = null;  // o que foi digitado nas metas e ainda não guardado: volta nos campos se a tela for redesenhada à força («Atualizar», mover bloco)

export function statusAtualizacaoInicio({ hora = "", falhou = false } = {}) {
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
  const quarto = prazo !== null
    ? { id: "prazo", chave: "respondidas_pct", rotulo: "Respondidas no prazo", valor: prazo, formato: "pct", sentido: "cima",
      tom: prazo >= 80 ? "ok" : prazo < 50 ? "aten" : "neutro", href: links.relatorios || links.conversas || null,
      sub: "1ª resposta em até 15 min · 7 dias",
      ajuda: "Conversas dos últimos 7 dias em que a primeira resposta da equipe saiu em até 15 minutos (contagem do servidor)." }
    : { id: "leads", chave: "leads_semana", rotulo: "Leads · 7 dias", valor: +l.semana || 0, formato: "int", sentido: "cima", tom: "neutro", href: links.crm || null,
      sub: `${+l.hoje || 0} hoje · ${+l.semana_anuncio || 0} de anúncio`,
      ajuda: "Negócios que entraram pelo funil nos últimos 7 dias (contagem do CRM, não conversões do Meta/Google)." };
  return [
    { id: "aguardando", chave: "aguardando", rotulo: "Esperando resposta", valor: ag, formato: "int", sentido: "baixo",
      tom: ag > 0 ? (espera !== null && espera >= 30 ? "ruim" : "aten") : "ok", href: links.conversas || null,
      sub: ag > 0 ? (espera !== null && espera >= 1 ? `a mais antiga há ${duracaoCurta(espera)}` : `${plural(ag, V.contato, V.contatos)} sem resposta`) : "ninguém esperando",
      ajuda: "Conversas abertas em que a última mensagem é do cliente e ainda não foi respondida." },
    { id: "consultas", chave: "consultas", rotulo: `${cap(V.consultas)} hoje`, valor: nCons, formato: "int", sentido: "cima", tom: "neutro", href: links.agenda || null,
      sub: nCons === null ? (lendo ? "lendo a agenda…" : falhou ? "não consegui ler a agenda" : "agenda indisponível") : nCons === 0 ? "nenhuma marcada" : "marcadas na Agenda",
      ajuda: nCons === null ? (lendo ? "Lendo a agenda…" : falhou ? "Não consegui ler a agenda agora. Use «Atualizar» para tentar de novo." : "A agenda não está disponível para a sua conta.")
        : `${cap(V.consultas)} marcadas para hoje na Agenda, sem as canceladas.` },
    { id: "aberto", chave: "valor_aberto", rotulo: "Em aberto", valor: +n.valor_aberto || 0, formato: "brl", sentido: "cima", tom: "neutro", href: links.crm || null,
      sub: `${abertos} ${plural(abertos, V.negocio, V.negocios)} ${adj("aberto", abertos)}`,
      ajuda: `Soma do valor previsto ${V.feminino ? "das" : "dos"} ${V.negocios} abertos no CRM.` },
    quarto,
  ];
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
 * null quando o servidor não manda (RPC antiga). Cada etapa é contagem do mês até hoje, não a mesma turma: a taxa pode passar de 100 %.
 * funilMes(d, {voc}) → {etapas: [{id, nome, qtd, tipo, conversao}], leads, ganhos, geral (ganhos ÷ leads, 0–1) | null, vazio}
 */
export function funilMes(d, { voc = {} } = {}) {
  const f = d && d.funil_mes;
  if (!f || typeof f !== "object") return null;
  const campos = ["leads", "conversas", "agendados", "ganhos"];
  if (!campos.some(k => fin(f[k]))) return null;
  const V = { negocios: "negócios", consultas: "consultas", feminino: false, ...voc };
  const q = k => Math.max(0, Math.round(+f[k] || 0));
  const nomes = { leads: "Leads", conversas: "Conversas", agendados: `${cap(V.consultas)} marcadas`, ganhos: `${cap(V.negocios)} ${V.feminino ? "ganhas" : "ganhos"}` };
  const etapas = campos.map((id, i) => {
    const qtd = q(id), ant = i ? q(campos[i - 1]) : null;
    const taxa = ant > 0 ? Math.round(qtd / ant * 100) : null;
    return { id, nome: nomes[id], qtd, tipo: id === "ganhos" ? "ganho" : "aberto", conversao: taxa === null ? "" : `${taxa} % da anterior` };
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
  return l.filter(x => x && x.id !== null && x.id !== undefined && x.id !== "")
    .map(x => ({ id: x.id, nome: String(x.nome || "").trim() || null, espera: fin(x.espera_min) ? Math.max(0, +x.espera_min) : null,
      canal: x.canal ? String(x.canal) : null, origem: x.origem ? String(x.origem) : null, plataforma: x.plataforma ? String(x.plataforma) : null }))
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
  if (cs.some(k => k.estado === "desconectado")) return "caido";
  return cs.every(k => k.estado === "conectado") ? "ok" : null;
}
/** A frase da faixa: «Número de WhatsApp desconectado há 12 min: Recepção.» (vários: «2 números … : A, B.»); "" sem número caído. */
export function textoNumeroCaido(lista, agora = Date.now()) {
  if (!Array.isArray(lista) || !lista.length) return "";
  if (lista.length > 1) return `${lista.length} números de WhatsApp desconectados: ${lista.map(x => x.nome).join(", ")}.`;
  const x = lista[0], t = Date.parse(x.desde || "");
  const ha = Number.isFinite(t) ? ` há ${duracaoCurta(Math.max(0, (agora - t) / 60000))}` : "";
  return `Número de WhatsApp desconectado${ha}: ${x.nome}.`;
}
/** "12 min" · "1 h 05 min" · "26 h" (sem rel-logica: a lista de KPIs é pura). */
export function duracaoCurta(min) {
  if (!fin(min)) return "—";
  const t = Math.round(Math.max(0, +min));
  if (t < 1) return "< 1 min";
  if (t < 60) return `${t} min`;
  const hh = Math.floor(t / 60), mm = t % 60;
  return hh < 10 ? (mm ? `${hh} h ${p2(mm)} min` : `${hh} h`) : `${Math.round(t / 60)} h`;
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
  const out = [];
  for (let i = 0; i < dias; i++) {
    const dia = somarDiasIso(hoje, i);
    const itens = lista.filter(c => diaSP(c.inicio) === dia);
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
export function proximasConsultas(agenda, { hoje, agora = Date.now(), max = 4 } = {}) {
  const todas = (listaConsultas(agenda) || [])
    .map(c => { const ini = Date.parse(c.inicio), fim = Date.parse(c.fim); return { ...c, ini, fim: Number.isFinite(fim) && fim > ini ? fim : ini + 30 * 60000, dia: diaSP(c.inicio) }; })
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
  return { hoje: deHoje, visiveis, passadas, restantes: deHoje.length - passadas, futuras, diaAcabou: deHoje.length > 0 && visiveis.length === 0 };
}

/**
 * Progresso de uma meta do mês contra o ritmo do calendário: no dia 10 de 31 o esperado é 10/31 da meta.
 * → null sem meta; {meta, realizado, pct (0–100, p/ barra), pctReal, esperado, ritmoPct, falta, estado: batida|frente|ritmo|atras}
 */
export function progressoMeta({ meta, realizado, dia, diasNoMes } = {}) {
  const m = +meta, r = Math.max(0, +realizado || 0);
  if (!(m > 0)) return null;
  const fracao = Math.min(1, Math.max(0, (+dia || 1) / Math.max(1, +diasNoMes || 30)));
  const esperado = m * fracao;
  const estado = r >= m ? "batida" : r >= esperado ? "frente" : r >= esperado * 0.85 ? "ritmo" : "atras";
  return { meta: m, realizado: r, pct: Math.min(100, r / m * 100), pctReal: r / m * 100, esperado, ritmoPct: Math.min(100, fracao * 100), falta: Math.max(0, m - r), estado };
}
/**
 * A meta de consultas conta o que JÁ aconteceu: início até `agora`, sem canceladas nem faltas (marco «faltou»); as que ainda vão
 * acontecer no mês ficam à parte — agenda cheia no fim do mês não é «à frente do ritmo» no dia 4.
 * contagemConsultasMes(agendaMes, {agora}) → null sem agenda do mês; {realizadas, marcadas (futuras), faltas}
 */
export function contagemConsultasMes(agendaMes, { agora = Date.now() } = {}) {
  const lista = listaConsultas(agendaMes);
  if (!lista) return null;
  const r = { realizadas: 0, marcadas: 0, faltas: 0 };
  for (const c of lista) {
    const ini = Date.parse(c.inicio);
    if (!Number.isFinite(ini)) continue;
    if (ini > agora) r.marcadas++;
    else if (c.marco === "faltou") r.faltas++;
    else r.realizadas++;
  }
  return r;
}
/** O texto honesto da meta: quanto falta e se está à frente, perto ou abaixo do ritmo do calendário. `fmt` formata (R$ ou inteiro). */
export function textoMeta(p, { fmt = v => String(Math.round(v)), dia = null, diasNoMes = null } = {}) {
  if (!p) return "";
  const pct = `${Math.round(p.pctReal)} %`;
  if (p.estado === "batida") return `Meta batida: ${fmt(p.realizado)} de ${fmt(p.meta)} (${pct}).`;
  const base = `${fmt(p.realizado)} de ${fmt(p.meta)} (${pct}). Faltam ${fmt(p.falta)}`;
  const ritmo = dia && diasNoMes ? `; no dia ${dia} de ${diasNoMes} o esperado seria ${fmt(p.esperado)}` : "";
  const frase = p.estado === "frente" ? "você está à frente do ritmo" : p.estado === "ritmo" ? "está perto do ritmo" : "está abaixo do ritmo";
  return `${base} — ${frase}${ritmo}.`;
}

/** Todos os blocos do Início (ids) na ordem padrão. */
export const BLOCOS_INICIO = Object.freeze(["agora", "atendimento", "tarefas", "numeros", "vendas", "funil", "horas", "metas", "leads"]);
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
  clearInterval(tRelogio); tRelogio = 0;
  metasEditando = false; rascunhoMetas = null;
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
  if (!L) {
    try {
      [L, G] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`)]);
    } catch (e) { ui.limpar(raiz); raiz.append(ui.erroCartao(e, () => montar(ctx))); return; }
  }
  if (minha !== montagem) return;
  // outra empresa (ou outra conta): o último checklist e os últimos números eram da anterior e não podem aparecer nesta
  const dono = `${ctx.cliente.id}|${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-"}`;
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
  const primeiro = String((ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "").trim().split(/\s+/)[0] || "";
  const int = v => Math.round(v).toLocaleString("pt-BR");
  const brl0 = v => ui.brl(v, { centavos: false });
  const admin = ctx.pode("admin");
  // M32: o que a pessoa fez só neste aparelho ("Já está bom" e "Dispensar por 7 dias"), por empresa e conta; tudo em try/catch (janela anônima)
  const chaveOnb = `nx-onb:${ctx.cliente.id}:${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-"}`;
  const lerOnb = () => { try { const p = JSON.parse(localStorage.getItem(chaveOnb) || "{}"); return { pulados: Array.isArray(p.pulados) ? p.pulados : [], dispensadoAte: Number(p.dispensadoAte) || 0 }; } catch { return { pulados: [], dispensadoAte: 0 }; } };
  const gravarOnb = p => { try { localStorage.setItem(chaveOnb, JSON.stringify(p)); } catch { /* sem storage */ } };
  // plano 50: preferências deste aparelho — histórico das leituras (por empresa e conta), metas (por empresa) e ordem/recolhimento dos blocos (por empresa e conta)
  const contaId = (ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-";
  const chaveHist = `nx-ini-hist:${ctx.cliente.id}:${contaId}`;
  const chaveMetas = `nx-ini-metas:${ctx.cliente.id}`;
  const chaveBlocos = `nx-ini-blocos:${ctx.cliente.id}:${contaId}`;
  const lerJson = (chave, padrao) => { try { const v = JSON.parse(localStorage.getItem(chave) || "null"); return v && typeof v === "object" ? v : padrao; } catch { return padrao; } };
  const gravarJson = (chave, v) => { try { if (v === null || v === undefined) localStorage.removeItem(chave); else localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } };
  const lerHist = () => lerJson(chaveHist, { dias: [] });
  const lerMetas = () => { const m = lerJson(chaveMetas, {}); return { vendas: +m.vendas > 0 ? +m.vendas : null, consultas: +m.consultas > 0 ? Math.round(+m.consultas) : null }; };
  const lerBlocos = () => { const b = lerJson(chaveBlocos, {}); return { ordem: Array.isArray(b.ordem) ? b.ordem.filter(id => BLOCOS_INICIO.includes(id)) : [], recolhidos: Array.isArray(b.recolhidos) ? b.recolhidos.filter(id => BLOCOS_INICIO.includes(id)) : [] }; };
  const gravarBlocos = b => gravarJson(chaveBlocos, b && (b.ordem.length || b.recolhidos.length) ? b : null);
  // o checklist só cobra o que esta pessoa consegue abrir nas Configurações (a mesma régua do config.js: seção pronta, módulo do plano e papel)
  const podeSecao = L.filtroSecoesOnboarding({ temModulo: ctx.temModulo, pode: ctx.pode, configPronta: ctx.configPronta });
  const resumoOnb = onb => { const local = lerOnb(); return L.resumoOnboarding(onb, { pulados: local.pulados, dispensadoAte: local.dispensadoAte, admin, podeSecao }); };
  // a palavra da agenda na vertical (consulta / visita / entrega), a mesma das Automações
  const palavra = L.palavraAgenda(V.vertical || (ctx.cliente && ctx.cliente.vertical));

  // cabeçalho: saudação pequena em cima, manchete no degrau display, data por extenso + hora da leitura + Atualizar
  const quando = h("p", { class: "rel-nota", "aria-live": "polite" });
  const dataEl = h("time", { class: "ini-data", datetime: L.hojeSP() }, dataLonga());
  const btn = h("button", { type: "button", class: "rel-btn rel-btn-sec" }, "Atualizar");
  // B5: ponto verde discreto quando o servidor diz que todos os números estão conectados (some sem a informação ou com número caído)
  const waOk = h("span", { class: "ini-wa-ok", hidden: true }, h("i", { class: "ini-wa-ponto", "aria-hidden": "true" }), "WhatsApp conectado");
  const cab = ui.cabecalho({ rotulo: primeiro ? `${L.saudacao()}, ${primeiro} · ${ctx.cliente.nome}` : `${L.saudacao()} · ${ctx.cliente.nome}`,
    titulo: "", acoes: [h("div", { class: "ini-cab-meta" }, dataEl, quando, waOk), btn], nivel: 1 });
  cab.classList.add("ini-cab");
  const titulo = cab.querySelector("h1");
  titulo.id = "ini-h";
  const corpo = h("div", { class: "rel-corpo" });
  btn.addEventListener("click", () => carregar({ forcar: true }));
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
        : h("span", { class: "rel-nota" }, "Peça ao administrador para reconectar."),
    ].filter(Boolean));
  }

  /** A agenda é um complemento (sem ela a frase só não fala de consulta), mas falha ≠ sem permissão: null = a conta não tem agenda;
      {erro: true} = não deu para ler agora (a tela diz isso, com «Tentar de novo»). No pulso, uma falha passageira mantém a leitura de hoje. */
  async function buscarAgenda(reler = true) {
    if (!podeAgenda) return null;
    // 7 dias: a manchete e o KPI olham só o de hoje; «Agora» e as barras usam a semana
    try { return await ctx.api.rpcC("nx_agenda_dia", { p_data: L.hojeSP(), p_dias: 7 }, { cache: true }); }
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
    gravarJson(chaveHist, registrarHistorico(hist, d.hoje, {
      aguardando: +c.aguardando || 0, consultas, valor_aberto: +n.valor_aberto || 0, abertos: +n.abertos || 0,
      leads_semana: +l.semana || 0, receita_mes: +n.receita_mes || 0 }));
  }

  async function carregar({ forcar = false, primeira = false } = {}) {
    if (minha !== montagem) return;
    btn.disabled = true;
    try {
      // 1ª abertura: pinta o último dado guardado (se o shell tiver cache) e confere na rede em seguida
      // a agenda ainda está a caminho (pode estar repetindo depois de uma falha): «lendo», nunca «não disponível para a sua conta»
      const agendaPrevia = ultimaAgenda && Array.isArray(ultimaAgenda.consultas) ? ultimaAgenda : podeAgenda ? { lendo: true } : null;
      const aoCache = (dados, em) => { if (minha === montagem && !desenhou && dados && typeof dados === "object") { desenhou = true; if (!ultimaCarga && em) ultimaCarga = Number(new Date(em)) || 0; desenhar(dados, agendaPrevia, false); } };
      const [d, agenda, onb, agendaMes] = await Promise.all([ctx.api.rpcC("nx_inicio", {}, { cache: true, aoCache }), buscarAgenda(forcar || primeira),
        buscarOnboarding(forcar || primeira), buscarAgendaMes(forcar || primeira)]);
      if (minha !== montagem) return;          // resposta de uma montagem antiga (outra empresa ou conta): não toca no estado guardado
      ultimoOnb = onb; ultimaAgenda = agenda; ultimaAgendaMes = agendaMes;
      ultimaCarga = Date.now();
      quando.textContent = statusAtualizacaoInicio({ hora: L.horaSP(new Date(ultimaCarga)) });
      guardarHistorico(d, agenda);
      const js = JSON.stringify({ ...d, agora: null, agenda: agenda && agenda.consultas ? agenda.consultas.map(c => `${c.negocio_id}|${c.inicio}|${c.status}`) : null,
        agErro: !!(agenda && agenda.erro), agMes: agendaMes && agendaMes.consultas ? agendaMes.consultas.length : null, onb: onb ? onb.itens.map(i => i.feito) : null });
      if (!forcar && !primeira && (js === ultimoJson || metasEditando)) return;      // nada mudou (ou a pessoa está digitando as metas): não mexe na tela
      ultimoJson = js;
      const antes = ultimoDado;
      desenhar(d, agenda, primeira && !desenhou, antes, onb, agendaMes);
      desenhou = true;
    } catch (e) {
      if (minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      quando.textContent = statusAtualizacaoInicio({ hora: ultimaCarga ? L.horaSP(new Date(ultimaCarga)) : "", falhou: true });
      if (primeira && !desenhou) { ui.trocarEsqueleto(raiz, ui.erroCartao(e, () => { ui.limpar(raiz); const sk = esqueletoInicial(); if (sk) raiz.append(...sk); else raiz.append(ui.esqueleto("inicio")); carregar({ primeira: true }); })); }
      else ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora.", { tipo: "erro" });
    } finally { btn.disabled = false; }
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
  function pintarManchete(m) {
    ui.limpar(titulo);
    let i = 0;
    m.frases.forEach((f, fi) => {
      if (fi) titulo.append(" ");
      for (const no of f) titulo.append(noManchete(no, `m-${i++}`));
    });
    titulo.setAttribute("aria-label", m.texto);       // o leitor de tela lê a frase inteira, sem picotar por link
  }

  /** Linha de tendência de um KPI: G.sparkline (frente A) quando existir; senão um SVG mínimo daqui (linha + área + último ponto). */
  function sparkline(alvo, valores, rotulo) {
    if (typeof G.sparkline === "function") { try { G.sparkline(alvo, { valores, area: true, rotulo }); return; } catch { /* cai no desenho local */ } }
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
    const contarDepois = [];     // animações de "contar até o valor": começam quando o esqueleto sai (o elemento precisa estar na página)
    const num = (v, fmt, cls = "", chave = null) => {
      const b = h("b", { class: `rel-num ${cls}` });
      if (chave) b.dataset.n = chave;
      const valor = +v || 0;
      if (fmt === brl0) L.preencherMoeda(ui, b, valor, { centavos: false });      // "R$" a 60 %, colado ao valor
      else b.textContent = fmt(valor);
      if (animar && valor !== 0) contarDepois.push(() => (fmt === brl0 ? L.contarMoeda(ui, G, b, valor, { centavos: false }) : G.contar(b, valor, fmt)));
      return b;
    };
    const c = d.conversas || {}, t = d.tarefas || {}, n = d.negocios || {}, l = d.leads || {};
    const links = { conversas: podeConversas ? "#/conversas?aba=aguardando" : null, tarefas: podeTarefas ? "#/tarefas?aba=atrasadas" : null,
      agenda: podeAgenda ? "#/agenda" : null, crm: podeCrm ? "#/crm" : null, relatorios: podeRel ? "#/relatorios/atendimento" : null };
    const voc = { contato: vmin("contato", "cliente"), contatos: vmin("contatos", "clientes"),
      negocio: vmin("negocio", "negócio"), negocios: vmin("negocios", "negócios"), feminino: fem, consulta: palavra.um, consultas: palavra.varios };
    const m = L.manchete(d, { agenda, links, voc });
    pintarManchete(m);
    titulo.dataset.tam = m.texto.length > 70 ? "longa" : "curta";     // frase curta ganha o degrau display; a longa cabe em 2-3 linhas no degrau h1
    ui.limpar(corpo);
    corpo.append(faixaCanal);         // número caído vem antes de tudo (sem ele a tela inteira mente: nada chega)
    pintarFaixa();

    const onbRes = resumoOnb(onb);
    if (L.inicioVazio(d)) {
      // cliente zerado: a órbita com os satélites que acendem conforme os passos ficam prontos (M09 + M32)
      const feito = ids => !!(onb && Array.isArray(onb.itens) && ids.every(id => (onb.itens.find(i => i.id === id) || {}).feito));
      corpo.append(h("div", { class: "ini-comecar rel-entra" }, ui.vazio({ tipo: "primeiro_uso", titulo: "Tudo pronto para começar.",
        texto: admin ? "Três passos e o Órbita já recebe e responde pelo WhatsApp." : "Peça ao administrador da sua empresa para concluir a configuração.",
        passos: [{ rotulo: "Conectar o WhatsApp", feito: feito(["chave_codewords", "aparelho_pareado", "recebimento"]) }, { rotulo: "Convidar a equipe", feito: feito(["colega_convidado"]) },
          { rotulo: "Ajustar o funil", feito: feito(["funil_ajustado"]) }],
        acao: admin && podeSecao({ id: "chave_codewords" }) ? { rotulo: "Conectar o WhatsApp", fn: () => ctx.navegar("#/config/numeros?assistente=novo") } : null })));
      if (onbRes) corpo.append(cartaoChecklist(onbRes));
      relogio = null;
      trocar();
      return;
    }

    // ---- KPIs do topo: número grande, seta contra o dia anterior e a linha dos últimos dias (histórico deste aparelho)
    const hist = lerHist();
    const diasHist = (hist.dias || []).length;
    const faixa = h("section", { class: "ini-kpis rel-entra", "aria-label": "Resumo de agora", style: "--i:0" });
    for (const k of kpisInicio(d, agenda, { hoje: d.hoje, links, voc })) faixa.append(cartaoKpi(k, hist, diasHist, num));
    corpo.append(faixa);

    // ---- blocos (cada um é uma função: a ordem e o que fica recolhido vêm de L.blocosInicio + os blocos novos desta rodada + a ordem que a pessoa guardou)
    const numLink = (valor, rot, hash, k, destaque, chave) => {
      const conteudo = [num(valor, int, `ini-n${destaque ? " ini-n-destaque" : ""}`, chave), h("span", { class: "ini-n-l" }, rot)];
      return podeConversas
        ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, conteudo)
        : h("div", { class: "ini-numero" }, conteudo);
    };
    const espera = +c.espera_mais_antiga_min;
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
      agora: () => blocoAgora(c, proximasConsultas(agenda, { hoje: d.hoje, agora: Date.now() }), temAgenda, espera),

      atendimento: () => h("section", { class: "rel-cartao ini-atend rel-entra", "aria-labelledby": "ini-at", style: "--i:1" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-at", class: "rel-h2" }, "Atendimento agora"),
          +c.aguardando > 0 && Number.isFinite(espera)
            ? h("p", { class: `ini-espera${espera >= 30 ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` cliente esperando há ${L.duracaoMin(espera)}`)
            : h("p", { class: "rel-nota" }, "ninguém esperando resposta")),
        h("div", { class: "ini-numeros ini-numeros-4" },
          numLink(c.aguardando, "aguardando resposta", "#/conversas?aba=aguardando", "c-ag", +c.aguardando > 0, "conversas.aguardando"),
          numLink(c.sem_dono, "sem responsável", "#/conversas?aba=sem_dono", "c-sd", false, "conversas.sem_dono"),
          numLink(c.minhas, "com você", "#/conversas?aba=minhas", "c-mi", false, "conversas.minhas"),
          numLink(c.abertas, "abertas no total", "#/conversas?aba=abertas", "c-ab", false, "conversas.abertas"))),

      leads: () => h("section", { class: "rel-cartao ini-leads rel-entra", "aria-labelledby": "ini-ld", style: "--i:2" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ld", class: "rel-h2" }, "Leads")),
        h("div", { class: "ini-numeros ini-numeros-3" },
          h("div", { class: "ini-numero" }, num(l.hoje, int, "ini-n", "leads.hoje"), h("span", { class: "ini-n-l" }, "hoje")),
          h("div", { class: "ini-numero" }, num(l.hoje_anuncio, int, "ini-n", "leads.hoje_anuncio"), h("span", { class: "ini-n-l" }, "de anúncio hoje")),
          h("div", { class: "ini-numero" }, num(l.semana, int, "ini-n", "leads.semana"), h("span", { class: "ini-n-l" }, "nos últimos 7 dias"))),
        +l.semana ? barraOrigem(l) : null,
        +l.semana ? h("p", { class: "rel-nota" }, `${l.semana_anuncio || 0} dos ${l.semana} leads criados nos últimos 7 dias vieram de anúncio. É contagem do CRM, não conversões informadas pelo Meta/Google.`) : null,
        atalhosLeadsInicio({ crm: podeCrm, ads: podeAds }).length ? h("div", { class: "rel-cartao-rodape" },
          atalhosLeadsInicio({ crm: podeCrm, ads: podeAds }).map(a => h("a", { class: "rel-link", href: a.href }, a.rotulo))) : null),

      vendas: () => {
        const mv = L.mesVsAnterior(n);
        const chipMes = L.chipVar(mv.atual, mv.anterior, "cima");
        const ganhos = +n.ganhos_mes || 0, abertos = +n.abertos || 0;
        const txtAbertos = `${abertos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("aberto", abertos)} · ${brl0(n.valor_aberto)}`;
        // este mês × o mesmo pedaço do mês passado, em duas barras na mesma régua
        const topoMes = Math.max(mv.atual, mv.anterior) || 1;
        const barraMes = (rot, v, cls) => h("div", { class: "ini-barra" },
          h("span", { class: "ini-barra-r" }, rot),
          h("span", { class: "ini-barra-t", "aria-hidden": "true" }, h("i", { class: cls, style: { "--w": `${v > 0 ? Math.max(2, v / topoMes * 100) : 0}%` } })),
          L.preencherMoeda(ui, h("b", { class: "ini-barra-v rel-num" }), v, { centavos: false }));
        const ateDia = mv.dia ? ` (até o dia ${mv.dia})` : "";
        return h("section", { class: "rel-cartao ini-vendas rel-entra", "aria-labelledby": "ini-vd", style: "--i:3" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-vd", class: "rel-h2" }, "Vendas"),
            podeRel ? h("a", { class: "rel-link", href: "#/relatorios/vendas" }, "Ver relatório") : null),
          h("div", { class: "ini-mes" },
            h("p", { class: "rel-olho" }, "Receita do mês"),
            num(mv.atual, brl0, "ini-receita", "negocios.receita_mes"),
            h("p", { class: "ini-mes-l" },
              h("span", { class: `rel-var rel-var-${chipMes.cls}` }, chipMes.v == null ? chipMes.txt : `${chipMes.seta} ${chipMes.txt}`),
              h("span", { class: "rel-nota" }, ` vs. ${brl0(mv.anterior)} no mesmo período do mês passado`)),
            h("p", { class: "rel-nota" }, `${ganhos} ${ganhos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("ganho", ganhos)} no mês · mês passado inteiro: ${brl0(mv.anteriorInteiro)}`)),
          h("div", { class: "ini-barras", role: "img", "aria-label": `Receita deste mês${ateDia}: ${brl0(mv.atual)}; mesmo período do mês passado: ${brl0(mv.anterior)}` },
            barraMes("Este mês", mv.atual, "ini-b-atual"), barraMes(`Mês passado${ateDia}`, mv.anterior, "ini-b-antes")),
          h("div", { class: "ini-numeros ini-numeros-2" },
            (podeCrm ? h("a", { class: "ini-numero", href: "#/crm", dataset: { k: "n-ab" } }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))
              : h("div", { class: "ini-numero" }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))),
            h("div", { class: "ini-numero", title: "soma do valor previsto × a probabilidade de cada etapa" }, num(n.previsao_ponderada, brl0, "ini-n", "negocios.previsao_ponderada"), h("span", { class: "ini-n-l" }, "previsão ponderada"))));
      },

      tarefas: () => {
        const lista = h("ul", { class: "ini-tarefas" });
        (t.proximas || []).forEach(tf => lista.append(itemTarefa(tf)));
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
              h("p", { class: "ini-canal-n" }, k.nome, k.numero_exibicao ? h("span", { class: "rel-nota" }, ` · ${k.numero_exibicao}`) : null),
              h("p", { class: "rel-nota" }, e.texto, k.ultima_entrada_em ? ` · última mensagem recebida ${L.quandoSP(k.ultima_entrada_em)}` : " · nenhuma mensagem recebida ainda"),
              k.status === "erro" && k.ultimo_erro ? h("p", { class: "ini-canal-erro" }, String(k.ultimo_erro).slice(0, 200)) : null)));
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
    };
    const NOMES = { agora: "Agora", atendimento: "Atendimento", tarefas: "Tarefas", numeros: "Números de WhatsApp", vendas: "Vendas", funil: "Funil do mês", leads: "Leads", horas: "Agenda em barras", metas: "Metas do mês" };
    const { abertos, recolhidos } = L.blocosInicio(d);
    // B5: número desconectado no aparelho abre o bloco dos números (L.blocosInicio só olha o status de cadastro)
    if ((d.canais || []).some(k => k && k.estado === "desconectado") && recolhidos.includes("numeros")) { recolhidos.splice(recolhidos.indexOf("numeros"), 1); abertos.push("numeros"); }
    // os blocos novos: «Agora» abre quando há alguém esperando ou consulta pela frente; as barras quando há consulta na semana; as metas quando há meta;
    // o funil do mês (B1) só existe quando o servidor manda funil_mes (RPC antiga: nenhum bloco, nada inventado) e abre com algum lead ou venda no mês
    const funil = funilMes(d, { voc });
    const novos = [["agora", (+c.aguardando || 0) > 0 || (temAgenda && (prox.visiveis.length > 0 || prox.futuras.length > 0))],
      ["horas", temAgenda && porDia.total > 0], ["metas", !!(metas.vendas || metas.consultas)], funil ? ["funil", !funil.vazio] : null].filter(Boolean);
    for (const [id, aberto] of novos) (aberto ? abertos : recolhidos).push(id);
    const prefs = lerBlocos();
    const padrao = ids => ids.slice().sort((a, b) => BLOCOS_INICIO.indexOf(a) - BLOCOS_INICIO.indexOf(b));
    const ordemAbertos = ordenarBlocos(padrao(abertos), prefs.ordem), ordemRecolhidos = ordenarBlocos(padrao(recolhidos), prefs.ordem);
    const personalizado = prefs.ordem.length > 0 || prefs.recolhidos.length > 0;
    const bloco = (id, lista, i) => envolverBloco(id, construtores[id](), NOMES[id], { recolhido: prefs.recolhidos.includes(id), podeAntes: i > 0, podeDepois: i < lista.length - 1,
      ordemAtual: [...ordemAbertos, ...ordemRecolhidos] });

    // sem pendência (e com algo a dizer na manchete): o selo "Tudo em dia."
    if (!m.pendencia && m.contexto) {
      corpo.append(h("div", { class: "ini-em-dia rel-entra" }, ui.vazio({ tipo: "em_dia", titulo: "Tudo em dia.", texto: "Ninguém esperando resposta e nenhuma tarefa para hoje." })));
    }
    if (abertos.length) corpo.append(h("div", { class: "ini-grade" }, ordemAbertos.map((id, i) => bloco(id, ordemAbertos, i))));
    if (recolhidos.length) {
      const det = h("details", { class: "ini-mais", open: maisAberto },
        h("summary", {}, h("span", { class: "ini-mais-t" }, "Mais detalhes"), h("span", { class: "rel-nota" }, ordemRecolhidos.map(id => NOMES[id]).join(" · "))),
        h("div", { class: "ini-grade" }, ordemRecolhidos.map((id, i) => bloco(id, ordemRecolhidos, i))));
      det.addEventListener("toggle", () => { maisAberto = det.open; });
      corpo.append(det);
    }
    if (personalizado) {
      corpo.append(h("div", { class: "ini-blocos-rodape" }, h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { k: "bl-restaurar" },
        on: { click: () => { gravarBlocos(null); ui.toast("Ordem e blocos de volta ao padrão.", { tipo: "info" }); redesenhar(); } } }, ui.icone("reabrir"), "Restaurar ordem")));
    }
    // O atendimento e as tarefas abertas têm prioridade sobre o checklist de configuração.
    if (onbRes) corpo.append(cartaoChecklist(onbRes));

    // o número que mudou desde a última leitura acende (resposta ao dado) — no bloco e no KPI do topo
    if (antes) for (const chave of L.numerosMudaram(antes, d)) for (const el of corpo.querySelectorAll(`[data-n="${chave}"]`)) G.destacar(el);
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
      const chaveN = { aguardando: "conversas.aguardando", aberto: "negocios.valor_aberto", leads: "leads.semana", prazo: "conversas.respondidas_no_prazo_pct" }[k.id] || "agenda.consultas";
      const fmtPct = v => `${Math.round(v)}%`;     // no número grande em Plex o espaço antes do % abria um buraco
      let valorEl;
      if (k.valor === null) valorEl = h("b", { class: "ini-kpi-v rel-num", "aria-label": "sem dado" }, "—");
      else {
        valorEl = num(k.valor, k.formato === "brl" ? brl0 : k.formato === "pct" ? fmtPct : int, "ini-kpi-v", chaveN);
        // cartão estreito (2 colunas a 360 px): R$ de 7 dígitos ou mais troca pela forma curta («R$ 1,2 mi») por container query
        if (k.formato === "brl" && Math.abs(+k.valor) >= 1e6 && typeof ui.numCompacto === "function") {
          valorEl.classList.add("ini-kpi-v-longo");
          valorEl = h("span", { class: "ini-kpi-vs" }, valorEl, h("b", { class: "ini-kpi-v ini-kpi-v-curto rel-num", "aria-hidden": "true" }, `R$ ${ui.numCompacto(+k.valor)}`));
        }
      }
      const sp = h("span", { class: "ini-kpi-sp", "aria-hidden": "true" });
      if (serie && k.valor !== null) sparkline(sp, serie, k.rotulo); else sp.classList.add("ini-kpi-sp-vazia");
      return h(k.href ? "a" : "div", { class: ["ini-kpi", `ini-kpi-${k.tom || "neutro"}`, serie && "ini-kpi-com-linha"], href: k.href, dataset: { k: `kpi-${k.id}`, kpi: k.id }, title: ajuda, "aria-describedby": idAj },
        h("span", { class: "ini-kpi-l" }, k.rotulo, h("span", { class: "ini-kpi-i", "aria-hidden": "true" }, ui.icone("info"))),
        h("span", { class: "ini-kpi-linha" }, valorEl,
          chip ? h("span", { class: `rel-var rel-var-${chip.cls}`, title: `contra o dia ${L.ddmmIso(varH.dia)}` }, chip.v == null ? chip.txt : `${chip.seta} ${chip.txt}`) : null),
        h("span", { class: "ini-kpi-sub rel-nota" }, k.sub || ""),
        sp,
        h("span", { class: "sr-only", id: idAj }, ajuda));
    }

    /** «Agora»: quem espera resposta (com ação) e as próximas consultas de hoje com o relógio (passou · agora · próxima), cada uma abrindo o negócio. */
    function blocoAgora(c, prox, temAgenda, espera) {
      const aguard = +c.aguardando || 0, semDono = +c.sem_dono || 0;
      const colCv = h("div", { class: "ini-agora-col ini-agora-cv" }, h("p", { class: "rel-olho" }, "Conversas"));
      const fila = aguard > 0 ? listaEspera(c) : null;      // B4: quem espera, com «Assumir» (RPC nova; sem ela, só o número e os botões)
      if (aguard > 0) {
        colCv.append(...[
          h("p", { class: "ini-agora-n" }, num(aguard, int, "ini-agora-num"), " ", h("span", { class: "ini-agora-l" }, aguard === 1 ? `${voc.contato} esperando resposta` : `${voc.contatos} esperando resposta`)),
          Number.isFinite(espera) && espera >= 1 ? h("p", { class: `rel-nota ini-agora-espera${espera >= 30 ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` a mais antiga espera há ${L.duracaoMin(espera)}`) : null,
          fila && fila.length ? h("ol", { class: "ini-espera-lista", "aria-label": `${cap(voc.contatos)} esperando resposta` }, fila.map(itemEspera)) : null,
          fila && fila.length && aguard > fila.length ? h("p", { class: "rel-nota" }, `+${aguard - fila.length} na fila`) : null,
          h("div", { class: "ini-agora-acoes" },
            podeConversas ? h("a", { class: "bt bt-prim bt-p", href: "#/conversas?aba=aguardando", dataset: { k: "ag-abrir" } }, "Responder agora") : null,
            podeConversas && semDono > 0 ? h("a", { class: "bt bt-sec bt-p", href: "#/conversas?aba=sem_dono", dataset: { k: "ag-semdono" } }, `Sem responsável · ${semDono}`) : null),
        ].filter(Boolean));
      } else {
        colCv.append(h("p", { class: "ini-agora-ok" }, ui.icone("check"), h("span", null, "Ninguém esperando resposta")),
          semDono > 0 && podeConversas
            ? h("div", { class: "ini-agora-acoes" }, h("a", { class: "bt bt-sec bt-p", href: "#/conversas?aba=sem_dono", dataset: { k: "ag-semdono" } }, `Sem responsável · ${semDono}`))
            : h("p", { class: "rel-nota" }, `${+c.abertas || 0} ${plural(+c.abertas || 0, "aberta", "abertas")} no total`));
      }
      const colAg = h("div", { class: "ini-agora-col ini-agora-ag" }, h("p", { class: "rel-olho" }, cap(palavra.varios)));
      if (agendaLendo) colAg.append(h("p", { class: "rel-nota" }, "Lendo a agenda…"));
      else if (agendaFalhou) colAg.append(h("p", { class: "rel-nota rel-txt-aten" }, "Não consegui ler a agenda agora."), botaoTentar("ag-tentar"));
      else if (!temAgenda) colAg.append(h("p", { class: "rel-nota" }, "A agenda não está disponível para a sua conta."));
      else if (!prox.hoje.length && !prox.futuras.length) {
        colAg.append(...[
          h("p", { class: "rel-nota" }, `Nenhuma ${palavra.um} marcada nos próximos 7 dias.`),
          podeAgenda ? h("div", { class: "ini-agora-acoes" }, h("a", { class: "bt bt-sec bt-p", href: "#/agenda" }, "Abrir agenda")) : null,
        ].filter(Boolean));
      } else {
        const semana = !prox.visiveis.length;
        const itens = semana ? prox.futuras : prox.visiveis;
        if (prox.diaAcabou) colAg.append(h("p", { class: "rel-nota" }, `${prox.hoje.length === 1 ? `A ${palavra.um} de hoje já aconteceu` : `As ${prox.hoje.length} ${palavra.varios} de hoje já aconteceram`}. Próximas:`));
        else if (prox.passadas) colAg.append(h("p", { class: "rel-nota" }, `${prox.passadas} já ${plural(prox.passadas, "aconteceu", "aconteceram")} hoje · ${prox.restantes} pela frente`));
        else if (!semana) colAg.append(h("p", { class: "rel-nota" }, `${prox.restantes} pela frente hoje`));
        else colAg.append(h("p", { class: "rel-nota" }, `Nenhuma hoje. Próximas da semana:`));
        colAg.append(h("ol", { class: "ini-prox", "aria-label": semana ? `Próximas ${palavra.varios} da semana` : `${cap(palavra.varios)} de hoje` }, itens.map(it => itemConsulta(it, semana))));
        const sobra = semana ? 0 : prox.restantes - prox.visiveis.length;
        if (sobra > 0 || podeAgenda) colAg.append(h("div", { class: "rel-cartao-rodape ini-agora-rodape" }, sobra > 0 ? h("span", { class: "rel-nota" }, `+${sobra} depois`) : null,
          podeAgenda ? h("a", { class: "rel-link", href: "#/agenda" }, "Ver agenda") : null));
      }
      return h("section", { class: "rel-cartao ini-agora rel-entra", "aria-labelledby": "ini-ag", style: "--i:1" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ag", class: "rel-h2" }, "Agora"), h("p", { class: "rel-nota" }, `às ${L.horaSP(new Date())}`)),
        h("div", { class: "ini-agora-grade" }, colCv, colAg));
    }
    /** B4/B7: uma pessoa esperando resposta — nome, há quanto tempo, pílulas de canal/origem (A8), «Assumir» (atribui a mim e abre) e «Abrir». */
    function itemEspera(it) {
      const nome = it.nome || `${cap(voc.contato)} sem nome`;
      const espTxt = it.espera === null ? "" : it.espera >= 1 ? `espera há ${duracaoCurta(it.espera)}` : "acabou de escrever";
      const pilulas = [pilulaSegura(it.canal, "canal"), pilulaSegura(it.origem, "origem", it.plataforma)].filter(Boolean);
      let assumir = null;
      if (podeConversas && escreve && contaId !== "-") {
        assumir = h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { k: `ag-assumir-${it.id}` }, "aria-label": `Assumir a conversa de ${nome} e abrir`, title: "A conversa passa para você e abre" }, "Assumir");
        assumir.addEventListener("click", () => assumirConversa(it, assumir));
      }
      const abrir = podeConversas ? h("a", { class: "bt bt-sec bt-p", href: `#/conversas/${encodeURIComponent(it.id)}`, dataset: { k: `ag-ver-${it.id}` }, "aria-label": `Abrir a conversa de ${nome}` }, "Abrir") : null;
      return h("li", { class: ["ini-espera-item", it.espera !== null && it.espera >= 30 && "ini-espera-longa"], dataset: { conversa: it.id } },
        typeof ui.avatar === "function" ? ui.avatar(nome, it.id, null, { tamanho: "p" }) : null,
        h("div", { class: "ini-espera-txt" }, h("p", { class: "ini-espera-nome" }, nome),
          espTxt || pilulas.length ? h("p", { class: "ini-espera-meta" }, ...[espTxt ? h("span", { class: "ini-espera-t rel-nota" }, espTxt) : null, ...pilulas].filter(Boolean)) : null),
        assumir || abrir ? h("div", { class: "ini-espera-acoes" }, ...[assumir, abrir].filter(Boolean)) : null);
    }
    function itemConsulta(it, semana) {
      const hora = L.horaSP(it.inicio);
      const rotDia = semana ? (it.dia === somarDiasIso(d.hoje, 1) ? "amanhã" : `${SEMANA[diaSemanaIso(it.dia)]} ${L.ddmmIso(it.dia)}`) : null;
      const selo = it.estado === "agora" ? h("span", { class: "ini-prox-selo" }, h("i", { class: "ini-prox-ponto", "aria-hidden": "true" }), "agora")
        : it.estado === "proxima" ? h("span", { class: "ini-prox-selo" }, ui.relativo(it.inicio)) : rotDia ? h("span", { class: "ini-prox-selo" }, rotDia) : null;
      const abrir = podeCrm && it.negocio_id
        ? h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { k: `px-${it.negocio_id}` }, "aria-label": `Abrir ${it.nome || it.titulo || palavra.um} das ${hora}`,
          on: { click: () => ctx.abrirNegocio(it.negocio_id, { aoMudar: () => carregar({ forcar: true }) }) } }, "Abrir") : null;
      return h("li", { class: ["ini-prox-item", `ini-prox-${it.estado}`] },
        h("span", { class: "ini-prox-hora" }, h("b", { class: "rel-num" }, hora), selo),
        h("div", { class: "ini-prox-txt" }, h("p", { class: "ini-prox-nome" }, it.nome || it.titulo || `${cap(palavra.um)} sem nome`),
          h("p", { class: "rel-nota" }, [it.servico, it.etapa].filter(Boolean).join(" · ") || (it.titulo && it.nome ? it.titulo : ""))),
        abrir ? h("div", { class: "ini-prox-acoes" }, abrir) : null);
    }

    /** Barras da agenda: hoje hora a hora (com a linha do agora) ou os próximos 7 dias; cada barra lê no teclado; «Ver como tabela» embaixo. */
    function blocoHoras(porHora, porDia, temAgenda) {
      const sub = h("p", { class: "rel-nota ini-horas-sub" });
      const area = h("div", { class: "ini-horas-area" });
      const sec = h("section", { class: "rel-cartao ini-horas rel-entra", "aria-labelledby": "ini-hr", style: "--i:6" },
        h("div", { class: "rel-cartao-topo ini-horas-topo" }, h("h2", { id: "ini-hr", class: "rel-h2" }, "Agenda em barras"), sub), area);
      if (agendaLendo) { sub.textContent = "Lendo a agenda…"; area.append(ui.esqueleto("grafico", { n: 10 })); return sec; }
      if (agendaFalhou) { sub.textContent = "Não consegui ler a agenda agora."; sub.classList.add("rel-txt-aten"); area.append(botaoTentar("hr-tentar")); return sec; }
      if (!temAgenda) { sub.textContent = "A agenda não está disponível para a sua conta."; return sec; }
      if (!porDia.total) {
        sub.textContent = `${cap(palavra.varios)} por hora e por dia.`;
        area.append(ui.vazio({ icone: "calendario", tema: "agenda", titulo: `Nenhuma ${palavra.um} nos próximos 7 dias.`, texto: podeAgenda ? "Quando marcar, as barras aparecem aqui." : null,
          acao: podeAgenda ? { rotulo: "Abrir agenda", fn: () => ctx.navegar("#/agenda") } : null }));
        return sec;
      }
      const modo = modoHoras === "hoje" && porHora.total ? "hoje" : modoHoras === "semana" || !porHora.total ? "semana" : "hoje";
      const seg = ui.segmentado({ tipo: "filtro", rotulo: "Período das barras", valor: modo, classe: "ini-horas-seg",
        opcoes: [{ valor: "hoje", rotulo: "Hoje", contador: porHora.total }, { valor: "semana", rotulo: "7 dias", contador: porDia.total }],
        aoMudar: v => { modoHoras = v; pintar(v); } });
      sec.querySelector(".rel-cartao-topo").append(seg);
      const dica = h("p", { class: "rel-nota ini-horas-dica", role: "status" });
      const horaAgora = horaSP(new Date());
      const pintar = v => {
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
        const lista = h("ol", { class: "ini-bv-lista", "aria-label": hojeMode ? `${cap(palavra.varios)} de hoje por hora` : `${cap(palavra.varios)} por dia nos próximos 7 dias` });
        // tabindex itinerante: uma parada de Tab no gráfico (a hora corrente ou hoje); as setas, Home e End andam entre as barras
        const atual = barraAtual(itens, { hojeMode, horaAgora });
        const itinerar = alvo => { for (const o of lista.querySelectorAll(".ini-bv")) o.setAttribute("tabindex", o === alvo ? "0" : "-1"); };
        itens.forEach((x, i) => {
          const agoraCls = hojeMode ? (x.h === horaAgora ? "ini-bv-agora" : x.h < horaAgora ? "ini-bv-passou" : null) : (x.hoje ? "ini-bv-agora" : null);
          // a maior barra para em 85 % do trilho: sobra lugar para o número em cima dela
          const li = h("li", { class: ["ini-bv", !x.n && "ini-bv-0", agoraCls], tabindex: i === atual ? "0" : "-1", "aria-label": texto(x), style: { "--i": i },
            dataset: { k: `bv-${hojeMode ? x.h : x.dia}` } },
            h("span", { class: "ini-bv-trilho", style: { "--h": `${(Math.max(x.n ? 8 : 0, x.n / max * 85)).toFixed(1)}%` } },
              x.n ? h("span", { class: "ini-bv-n" }, String(x.n)) : null,
              h("i", { class: "ini-bv-barra" })),
            h("span", { class: "ini-bv-r" }, hojeMode ? `${p2(x.h)}h` : x.rotulo));
          const mostrar = () => { dica.textContent = texto(x); };
          li.addEventListener("mouseenter", mostrar); li.addEventListener("focus", () => { mostrar(); itinerar(li); });
          lista.append(li);
        });
        lista.addEventListener("mouseleave", () => { dica.textContent = ""; });
        lista.addEventListener("keydown", ev => {
          const bs = [...lista.querySelectorAll(".ini-bv")], i = bs.indexOf(document.activeElement);
          if (i < 0) return;
          const j = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? bs.length - 1 : null;
          if (j === null || !bs[j]) return;
          ev.preventDefault(); itinerar(bs[j]); bs[j].focus();
        });
        try { if (!quieto && !matchMedia("(prefers-reduced-motion: reduce)").matches) lista.classList.add("ini-anim"); } catch { /* ok */ }
        const caixa = h("div", { class: "ini-horas-caixa" }, lista);
        const rodape = h("div", { class: "ini-horas-rodape" });
        area.append(caixa, dica, rodape);
        G.alternarTabela(rodape, caixa, { colunas: [hojeMode ? "Hora" : "Dia", cap(palavra.varios)],
          linhas: itens.map(x => [hojeMode ? `${p2(x.h)}h` : x.rotuloLongo, String(x.n)]), legenda: sub.textContent });
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
          h("p", { class: "rel-nota" }, `${mes} · do dia 1 até hoje`)));
      if (f.vazio) {
        sec.append(ui.vazio({ tipo: "sem_resultado", tema: "crm", titulo: "Nenhum lead neste mês ainda." }));
        return sec;
      }
      const alvo = h("div", { class: "ini-funil-g" });
      G.funil(alvo, { etapas: f.etapas.map(e => ({ nome: e.nome, qtd: e.qtd, tipo: e.tipo, conversao: e.conversao, valorTxt: "" })),
        resumo: `Funil de ${mes}: ${f.etapas.map(e => `${e.nome} ${e.qtd}`).join(", ")}.` });
      // os cartões entram quando o bloco já está na página (como as outras contagens): a contagem de ui.kpi começa do zero e para
      // de vez se o número ainda não estiver no documento — montado antes da troca do esqueleto, ficava «0»
      const kpis = typeof ui.kpi === "function" ? h("div", { class: "ini-funil-kpis" }) : null;
      if (kpis) contarDepois.push(() => kpis.append(
        ui.kpi({ rotulo: "Leads no mês", valor: f.leads, formato: "compacto", ajuda: "Leads que entraram no funil do dia 1 até hoje (contagem do servidor)." }),
        ui.kpi({ rotulo: "Do lead à venda", valor: f.geral, formato: "pct",
          ajuda: `${cap(voc.negocios)} ${fem ? "ganhas" : "ganhos"} no mês ÷ leads do mês. Cada etapa conta o que aconteceu no mês, não a mesma turma.` })));
      sec.append(...[kpis, alvo,
        h("p", { class: "rel-nota ini-funil-nota" }, "Cada etapa conta o que aconteceu no mês (não é a mesma turma de leads): a taxa pode passar de 100 %.")].filter(Boolean));
      return sec;
    }

    /** Leads da semana: quanto veio de anúncio × outras origens, numa barra de proporção (contagem do CRM). */
    function barraOrigem(l) {
      const total = Math.max(1, +l.semana || 0), an = Math.max(0, +l.semana_anuncio || 0), pct = Math.round(an / total * 100);
      return h("div", { class: "ini-origem", role: "img", "aria-label": `${an} de ${total} leads vieram de anúncio (${pct} %)` },
        h("span", { class: "ini-origem-t" }, h("i", { class: "ini-origem-an", style: { "--w": `${pct}%` } })),
        h("span", { class: "ini-origem-leg" }, h("span", null, h("i", { class: "ini-origem-m ini-origem-an" }), `anúncio · ${pct} %`), h("span", null, h("i", { class: "ini-origem-m" }), `outras origens · ${100 - pct} %`)));
    }

    /** Metas do mês (vendas em R$ e consultas), guardadas só neste aparelho: barra com a marca do ritmo do calendário e um texto honesto. */
    function blocoMetas(metas, n, hoje, agendaMes) {
      const dia = +n.dia_do_mes || Number(String(hoje).slice(-2)) || 1, nDias = diasDoMes(hoje);
      const temAlguma = !!(metas.vendas || metas.consultas);
      const editando = metasEditando || !temAlguma;
      const mes = MESES[Number(String(hoje).slice(5, 7)) - 1] || "";
      const fmtBrl = v => L.textoMoeda(v, { centavos: false });
      const fmtInt = v => int(v);
      // realizado = o que já aconteceu até agora (sem canceladas nem faltas); as marcadas para depois aparecem à parte e não contam no ritmo
      const cont = contagemConsultasMes(agendaMes, { agora: Date.now() });
      const linhaMeta = (rotulo, p, fmt, nota, extra = null) => h("div", { class: ["ini-meta", `ini-meta-${p.estado}`] },
        h("div", { class: "ini-meta-topo" }, h("span", { class: "ini-meta-r" }, rotulo),
          h("span", { class: "ini-meta-v rel-num" }, fmt(p.realizado), h("span", { class: "rel-nota" }, ` de ${fmt(p.meta)}`))),
        h("div", { class: "ini-meta-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.pct)), "aria-label": `${rotulo}: ${Math.round(p.pctReal)} % da meta` },
          h("i", { style: { "--w": `${p.pct}%` } }), h("b", { style: { "--m": `${p.ritmoPct}%` }, title: `Ritmo do calendário hoje: ${fmt(p.esperado)}` })),
        h("p", { class: "rel-nota ini-meta-txt" }, nota || textoMeta(p, { fmt, dia, diasNoMes: nDias })),
        extra ? h("p", { class: "rel-nota ini-meta-extra" }, extra) : null);
      const linhas = h("div", { class: "ini-metas-linhas" });
      if (metas.vendas) linhas.append(linhaMeta("Vendas do mês", progressoMeta({ meta: metas.vendas, realizado: +n.receita_mes || 0, dia, diasNoMes: nDias }), fmtBrl));
      if (metas.consultas) {
        const p = progressoMeta({ meta: metas.consultas, realizado: cont ? cont.realizadas : 0, dia, diasNoMes: nDias });
        const extra = cont ? [cont.marcadas ? `+${fmtInt(cont.marcadas)} já ${plural(cont.marcadas, "marcada", "marcadas")} até o fim do mês (${plural(cont.marcadas, "conta quando acontecer", "contam quando acontecerem")})` : null,
          cont.faltas ? `${fmtInt(cont.faltas)} ${plural(cont.faltas, "falta fica", "faltas ficam")} fora da conta` : null].filter(Boolean).join(" · ") : "";
        linhas.append(linhaMeta(`${cap(palavra.varios)} realizadas no mês`, p, fmtInt,
          cont === null ? `Meta de ${fmtInt(metas.consultas)}. Ainda não consegui contar as ${palavra.varios} deste mês na Agenda.` : null, extra ? `${extra}.` : null));
      }
      if (temAlguma) linhas.append(h("p", { class: "rel-nota ini-metas-leg" }, h("i", { class: "ini-meta-marca", "aria-hidden": "true" }), ` marca do ritmo do calendário: dia ${dia} de ${nDias}`));
      let form = null;
      if (editando) {
        // um redesenho forçado no meio da digitação devolve o rascunho aos campos (o pulso nem redesenha: metasEditando)
        const rasc = metasEditando && rascunhoMetas ? rascunhoMetas : null;
        const fV = ui.campo({ nome: "meta_vendas", rotulo: "Meta de vendas no mês (R$)", tipo: "moeda", valor: rasc ? rasc.vendas : metas.vendas || "", ajuda: "Receita dos negócios ganhos no mês." });
        const fC = ui.campo({ nome: "meta_consultas", rotulo: `Meta de ${palavra.varios} no mês`, tipo: "numero", min: 0, passo: 1, inputmode: "numeric", valor: rasc ? rasc.consultas : metas.consultas || "",
          ajuda: `${cap(palavra.varios)} da Agenda que já aconteceram no mês (sem canceladas nem faltas).` });
        const inV = fV.querySelector("input"), inC = fC.querySelector("input");
        inV.dataset.k = "mt-v"; inC.dataset.k = "mt-c";
        const fechar = () => { metasEditando = false; rascunhoMetas = null; };
        const salvar = () => {
          const vendas = ui.lerMoeda(inV.value), consultas = Number(inC.value) || 0;
          gravarJson(chaveMetas, vendas > 0 || consultas > 0 ? { vendas: vendas > 0 ? vendas : null, consultas: consultas > 0 ? Math.round(consultas) : null } : null);
          fechar();
          ui.toast(vendas > 0 || consultas > 0 ? "Metas guardadas neste aparelho." : "Metas retiradas.", { tipo: "ok" });
          if (consultas > 0) carregar({ forcar: true }); else redesenhar();   // a meta de consultas relê a agenda do mês
        };
        // digitar trava o pulso, o relógio e a troca de versão do shell (metasEditando) — também na 1ª meta, em que o formulário já abre
        // sem «Ajustar metas»; apagar tudo de novo destrava
        const digitou = () => {
          rascunhoMetas = { vendas: inV.value, consultas: inC.value };
          if (!temAlguma) metasEditando = [inV, inC].some(i => String(i.value || "").trim() !== "");
        };
        form = h("form", { class: "ini-metas-form", on: { submit: ev => { ev.preventDefault(); salvar(); }, input: digitou } },
          h("div", { class: "ini-metas-campos" }, fV, fC),
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
        on: { click: () => { const p = lerBlocos(); p.recolhidos = recolhido ? p.recolhidos.filter(x => x !== id) : [...new Set([...p.recolhidos, id])]; gravarBlocos(p); redesenhar(); } } }, ui.icone("seta-baixo"));
      const barra = h("div", { class: "ini-bl-barra", role: "group", "aria-label": `Organizar o bloco ${nome}` }, btAntes, btDepois, btRec);
      if (topo) topo.append(barra); else sec.insertBefore(barra, corpoB);
      if (recolhido) { sec.classList.add("ini-rec"); corpoB.hidden = true; }
      return sec;
    }
  }

  /** M32 — "Deixe o Órbita pronto": progresso + o que falta, cada item abre a seção exata (1-5: o assistente do número). Só admin; some a 100 %. */
  function cartaoChecklist(r) {
    const local = lerOnb();
    const refazer = () => carregar({ forcar: true });
    const itemPendente = (i, destaque) => h("li", { class: "ini-onb-item", dataset: { item: i.id } },
      h("span", { class: "ini-onb-ponto", "aria-hidden": "true" }),
      h("div", { class: "ini-onb-txt" }, h("b", null, i.rotulo, i.opcional ? h("span", { class: "rel-nota" }, " · opcional") : null), h("span", { class: "rel-nota" }, i.ajuda)),
      h("div", { class: "ini-onb-acoes" },
        h("a", { class: destaque ? "bt bt-prim bt-p" : "bt bt-sec bt-p", href: i.rota, dataset: { k: `onb-${i.id}` } }, "Fazer agora"),
        h("button", { type: "button", class: "bt bt-fant bt-p", title: "Marcar como feito só neste aparelho", on: { click: () => { const p = lerOnb(); p.pulados = [...new Set([...p.pulados, i.id])]; gravarOnb(p); desenhar(ultimoDado, ultimaAgenda, false, null, ultimoOnb); } } }, "Já está bom")));
    const feitos = r.itens.filter(i => i.feito);
    return h("section", { class: "rel-cartao ini-onb rel-entra", "aria-labelledby": "ini-ob" },
      h("div", { class: "rel-cartao-topo" },
        h("h2", { id: "ini-ob", class: "rel-h2" }, "Deixe o Órbita pronto"),
        h("p", { class: "rel-nota" }, `${r.obrigFeitos} de ${r.obrigatorios} passos · ${r.pct} %`)),
      h("span", { class: "ini-onb-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(r.pct), "aria-label": "Progresso da configuração" },
        h("i", { style: { "--w": `${r.pct}%` } })),
      h("ol", { class: "ini-onb-lista" }, r.pendentes.slice(0, 4).map(i => itemPendente(i, r.proximo && i.id === r.proximo.id))),
      r.pendentes.length > 4 ? h("details", { class: "ini-onb-mais" }, h("summary", null, `Mais ${r.pendentes.length - 4} ${r.pendentes.length - 4 === 1 ? "passo" : "passos"}`),
        h("ol", { class: "ini-onb-lista" }, r.pendentes.slice(4).map(i => itemPendente(i, false)))) : null,
      feitos.length ? h("details", { class: "ini-onb-feitos" }, h("summary", null, `Já feitos (${feitos.length})`),
        h("ul", null, feitos.map(i => h("li", null, ui.icone("check"), i.rotulo, i.pulado ? h("span", { class: "rel-nota" }, " · marcado por você") : null)))) : null,
      h("div", { class: "ini-onb-rodape" },
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { const p = lerOnb(); p.dispensadoAte = L.dispensarOnboardingAte(); gravarOnb(p); ui.toast("Escondemos este cartão por 7 dias.", { tipo: "info" }); refazer(); } } }, "Dispensar por 7 dias")));
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
    try {
      await ctx.api.rpcC("nx_cv_atribuir", { p_conversa: it.id, p_conta: contaId });
      if (minha !== montagem) return;
      ui.toast("Conversa com você.", { tipo: "ok" });
      ctx.navegar(`#/conversas/${encodeURIComponent(it.id)}`);
    } catch (e) {
      if (minha !== montagem) return;
      bt.disabled = false; bt.removeAttribute("aria-busy");
      ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível assumir a conversa.", { tipo: "erro" });
    }
  }

  /** 1ª pintura: o esqueleto sai e o cabeçalho + o corpo entram com um fade curto (a troca não desloca nada). */
  function trocar() { if (colocado) return Promise.resolve(); colocado = true; return ui.trocarEsqueleto(raiz, [cab, corpo]); }

  function itemTarefa(tf) {
    const id = `ini-tf-${tf.id}`;
    const caixa = h("input", { type: "checkbox", id, class: "ini-check", dataset: { k: `tf-${tf.id}` }, disabled: !escreve,
      "aria-label": `Concluir: ${tf.titulo}` });
    const venc = tf.vence_em ? (tf.atrasada ? `atrasada · venceu ${ui.relativo(tf.vence_em)}` : `vence ${L.quandoSP(tf.vence_em)}`) : "sem prazo";
    const alvoNome = tf.contato_nome ? ` · ${tf.contato_nome}` : "";
    const abrir = tf.negocio_id || tf.contato_id
      ? h("button", { type: "button", class: "ini-tf-abrir", dataset: { k: `tfa-${tf.id}` } }, tf.titulo)
      : h("span", { class: "ini-tf-t" }, tf.titulo);
    if (tf.negocio_id) abrir.addEventListener("click", () => ctx.abrirNegocio(tf.negocio_id, { aoMudar: () => carregar({ forcar: true }) }));
    else if (tf.contato_id) abrir.addEventListener("click", () => ctx.abrirContato(tf.contato_id, { aoMudar: () => carregar({ forcar: true }) }));
    const li = h("li", { class: `ini-tf-item${tf.atrasada ? " atrasada" : ""}` },
      h("label", { class: "ini-tf-caixa", for: id }, caixa, h("span", { class: "ini-tf-marca", "aria-hidden": "true" })),
      h("div", { class: "ini-tf-txt" }, abrir, h("p", { class: `rel-nota${tf.atrasada ? " rel-txt-ruim" : ""}` }, venc + alvoNome)));
    caixa.addEventListener("change", async () => {
      if (!caixa.checked) return;
      li.classList.add("feita");
      try {
        await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: true });
        ui.toast("Tarefa concluída.", { tipo: "ok", desfazer: async () => {
          try { await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: false }); carregar({ forcar: true }); }
          catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível desfazer.", { tipo: "erro" }); }
        } });
        // B8: o ✓ da biblioteca cobre a linha e a lista só é relida depois dele (sem a peça, a releitura sai em 500 ms como antes)
        const ok = typeof ui.checkSucesso === "function" ? ui.checkSucesso(li) : new Promise(r => setTimeout(r, 500));
        Promise.resolve(ok).then(() => { if (minha === montagem) carregar({ forcar: true }); });
      } catch (e) {
        li.classList.remove("feita"); caixa.checked = false;
        ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível concluir a tarefa.", { tipo: "erro" });
      }
    });
    return li;
  }

  await carregar({ primeira: true });
  if (minha !== montagem) return;
  // o shell não troca de versão no meio de uma tarefa marcada como concluída (nem com metas sendo ajustadas ou a 1ª meta digitada)
  if (typeof ctx.naoAtualizar === "function") cancelarOcupado = ctx.naoAtualizar(() => metasEditando || !!document.querySelector(".ini-tf-item.feita"));
  // B5: o shell soube que um número caiu ou voltou (nx_pulso / notificação): só a faixa é repintada, sem RPC e sem redesenhar a tela
  if (ctx.canais && typeof ctx.canais.assinar === "function") cancelarCanais = ctx.canais.assinar(() => { if (minha === montagem && ultimoDado) pintarFaixa(); });
  // tempo real: o pulso avisa que algo mudou; recarrega no máximo a cada 30 s
  cancelarPulso = ctx.pulso.assinar(() => {
    if (tPulso) return;
    const falta = Math.max(0, INTERVALO_PULSO - (Date.now() - ultimaCarga));
    tPulso = setTimeout(() => { tPulso = 0; if (!document.hidden) carregar(); }, falta);
  });
  // relógio: a cada minuto «Agora» e as barras andam com a hora (sem RPC; nada é refeito com as metas em edição);
  // na virada do dia a tela relê tudo — a agenda da semana e a do mês começam no dia novo
  let diaVisto = L.hojeSP();
  tRelogio = setInterval(() => {
    if (minha !== montagem || document.hidden) return;
    const hoje = L.hojeSP();
    if (hoje !== diaVisto) { diaVisto = hoje; carregar(); return; }
    if (relogio && !metasEditando) relogio();
    if (ultimoDado) pintarFaixa();          // o «há 12 min» da faixa anda com o relógio
  }, INTERVALO_RELOGIO);
}
