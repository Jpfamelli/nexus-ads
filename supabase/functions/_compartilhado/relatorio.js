/* ============================================================
   NEXUS ADS — relatorio.js (nx-relatorio: 8h diário / dia 1º mensal)
   Texto do núcleo (+ leitura por IA quando houver chave) →
   nx_relatorios → WhatsApp. A IA nunca impede o relatório: a falha dela
   vai só para o resumo da execução (ia_erro), nunca para nx_relatorios.erro
   de um relatório entregue. Prazo da IA por cliente (a IA lenta de um não
   come o tempo dos outros). Sem destino cadastrado o relatório é pulado
   (não é erro de todo dia) e o admin do cliente recebe UM aviso por semana.
   ============================================================ */
import { criarDb } from "./db.js";
import { enviarParaTodos, normalizarTelefone, idsDoEnvio } from "./whatsapp.js";
import { hojeSP, MESES } from "./nucleo.js";
import {
  ErroHttp, json, agoraDe, somaDias, limparErro, lerCorpo, exigirCorpoValido, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
  tituloRelatorio, comTravaDoCliente, todosPulados, EM_EXECUCAO, soltandoCorpo, anonimizarEnvio,
  traduzirErroIA, registrarUsoIA, funcaoAusente, comPainelUrl, modeloPara,
} from "./comum.js";

const JANELA = 130;         // a mesma do painel (nx_dados p_dias padrão): os números batem
const CLIENTES_JUNTOS = 3;
// trava por tipo e cliente ('nx-relatorio:diario:<id>'); vence sozinha se a função for cortada (150 s)
export const TRAVA_S = 170;
// A Edge Function corta a requisição em 150 s: teto da execução inteira para a IA…
const PRAZO_IA_MS = 90_000;
// …e teto POR cliente: com vários clientes, o último não pode ficar sem leitura porque os primeiros demoraram
export const PRAZO_IA_CLIENTE_MS = 25_000;
// aviso «sem destino» ao admin do cliente: no máximo um por semana (trava em nx_travas)
const AVISO_SEM_DESTINO_S = 7 * 86400;

function noPrazo(p, ms) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("tempo esgotado")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
const p2 = n => String(n).padStart(2, "0");
/** plano 1500c · AC-055: a segunda-feira da semana ANTERIOR à de `hoje` (AAAA-MM-DD) — a referência do resumo semanal. */
export function segundaDaSemanaAnterior(hoje) {
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();   // 0 = domingo
  return somaDias(hoje, -((dow + 6) % 7) - 7);
}
const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** IA padrão: o SDK só é carregado aqui, e só quando há chave. Plano 1000 (SV-063): a versão que devolve o uso (tokens). */
const iaPadrao = async opcoes => (await import("./ia.js")).leituraIACompleta(opcoes);

/** Reserva de IA do relatório (nx_ia_reservar, acao 'relatorio', sem conta): {id} | {recusada: código} | {} (banco antigo).
    Nunca lança: falha do banco não tira a leitura do relatório (como antes do plano 1000). */
export async function reservarIA(db, cliente) {
  try {
    const r = await db.rpc("nx_ia_reservar", { p_cliente: cliente, p_conta: null, p_acao: "relatorio" });
    if (r?.ok && r.reserva_id) return { id: r.reserva_id };
    // 'dados_invalidos' = banco sem a ação 'relatorio' (20261013c não aplicada): segue sem reserva, como antes
    if (!r || r.erro === "dados_invalidos") return {};
    return { recusada: String(r.erro || "ia_indisponivel") };
  } catch (e) {
    if (!funcaoAusente(e)) console.error("nx-relatorio reserva de IA:", limparErro(e?.message || e));
    return {};
  }
}

const limparLeitura = t => String(t ?? "").replace(/\*\*/g, "*").replace(/\n{3,}/g, "\n\n").trim();

function mesDoRelatorio(M, m) {
  const t = M.consolidar(M.linhasDe(m.de, m.ate)), c = M.crmTot(m.de, m.ate);
  return {
    mes: `${MESES[m.mes]} de ${m.ano}`, gasto: r2(t.gasto), conversas: Math.round(t.conversoes), custo_conversa: r2(t.cpa),
    agendadas: c.agendadas, compareceram: c.compareceram, fecharam: c.fecharam, receita: r2(c.receita),
  };
}

/** Sem número cadastrado: um aviso por semana aos admins do cliente (nx_notificar). Devolve true quando avisou. Nunca lança. */
async function avisarSemDestino(db, cliente, tipo) {
  try {
    const pegou = await db.rpc("nx_trava_pegar", { p_nome: `nx-relatorio:sem-destino:${cliente.id}`, p_segundos: AVISO_SEM_DESTINO_S, p_dono: "nx-relatorio" });
    if (pegou !== true) return false;
    const n = await db.rpc("nx_notificar", {
      p_cliente: cliente.id, p_conta: null, p_tipo: "sistema",
      p_titulo: tipo === "mensal" ? "Resumo mensal sem destino" : "Relatório diário sem destino",
      p_corpo: "Nenhum número de WhatsApp cadastrado para receber o relatório. Cadastre o número do gestor em Anúncios → Ajustes → Integrações.",
      p_link: "#/anuncios",
    });
    return Number(n) > 0;
  } catch (e) { console.error("nx-relatorio aviso sem destino:", limparErro(e?.message || e)); return false; }
}

/** plano 2000d · REV-04: cliente de REVENDA sem assinatura salva não assina «Equipe Nexus · gestão de tráfego» (o padrão do núcleo,
    que é da Nexus): assina com o nome da agência (nx_orgs.nome; vazio = sem linha). Assinatura salva (até «» = sem assinatura) vale
    sempre; cliente da Nexus (org plataforma ou sem org) segue com o padrão. Falha de leitura: segue como antes (nunca derruba o relatório). */
export async function comAssinaturaDaOrg(db, cliente) {
  const cfgC = cliente && cliente.cfg;
  if (!cliente || (cfgC && cfgC.assinatura != null)) return cliente;
  try {
    let org = cliente.org_id;
    if (org === undefined) {
      const [c] = await db.select("nx_clientes", { id: `eq.${cliente.id}`, select: "org_id", limit: 1 });
      org = c ? c.org_id : null;
    }
    if (!org) return cliente;
    const [o] = await db.select("nx_orgs", { id: `eq.${org}`, select: "tipo,nome", limit: 1 });
    if (!o || o.tipo !== "revenda") return cliente;
    return { ...cliente, cfg: { ...(cfgC || {}), assinatura: String(o.nome ?? "").trim() } };
  } catch (e) {
    console.error("nx-relatorio assinatura da revenda:", limparErro(e?.message || e));
    return cliente;
  }
}

/** plano 2000d · DA-187: cfg.relDias = dias da semana (0 = domingo … 6 = sábado) em que o diário sai; ausente/vazio = todo dia.
    O dia é o de HOJE em São Paulo (o envio da manhã). «Forçar» (enviar agora pelo painel) ignora. */
export function diaDoRelatorio(relDias, hoje) {
  if (!Array.isArray(relDias) || !relDias.length) return true;
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return relDias.some(d => Number(d) === dia);
}

async function gerar(db, cfg, cliente, ctx) {
  if (ctx.tipo === "diario" && !ctx.forcar && !diaDoRelatorio(cliente?.cfg?.relDias, ctx.hoje)) {
    return { cliente: cliente.slug, tipo: ctx.tipo, ok: true, pulado: "fora dos dias do relatório" };
  }
  // plano 1000 (AD-020): o texto termina com o link do painel (nx_config.saas_url) quando o cliente não tem um próprio
  // plano 2000d · REV-04: a assinatura da revenda (só mensal e semanal assinam)
  const clienteM = ctx.tipo === "diario" ? cliente : await comAssinaturaDaOrg(db, cliente);
  const M = await carregarModelo(db, comPainelUrl(clienteM, cfg), ctx.hoje, JANELA);
  const base = { cliente: cliente.slug, tipo: ctx.tipo };
  let ref, destinos, mes = null, periodo;

  if (ctx.tipo === "diario") {
    ref = somaDias(ctx.hoje, -1);
    destinos = listaDestinos(M.CFG.waGestor);
    periodo = M.consolidar(M.linhasDe(M.R - 6, M.R));
  } else if (ctx.tipo === "semanal") {
    // plano 1500c · AC-055: resumo da semana (M.relSemanal do núcleo) — só para quem ligou cfg.relSemanal; referência = a
    // segunda-feira da semana que acabou (uma linha por semana em nx_relatorios)
    if (typeof M.relSemanal !== "function") return { ...base, ok: true, pulado: "núcleo sem o resumo semanal" };
    if (!(cliente.cfg && cliente.cfg.relSemanal === true)) return { ...base, ok: true, pulado: "resumo semanal desligado" };
    ref = segundaDaSemanaAnterior(ctx.hoje);
    destinos = listaDestinos(M.CFG.waGestor);
    // plano 2000d · REV-03: o período é a semana FECHADA (segunda a domingo) da referência — o mesmo do texto (relSemanal fechada)
    const domingo = Math.round((Date.parse(`${somaDias(ctx.hoje, -1)}T12:00:00Z`) - Date.parse(`${somaDias(ref, 6)}T12:00:00Z`)) / 864e5);
    periodo = M.consolidar(M.linhasDe(M.R - domingo - 6, M.R - domingo));
  } else {
    mes = M.mesesDados().filter(m => m.completo).pop();
    if (!mes) return { ...base, ok: true, pulado: "nenhum mês completo na janela" };
    ref = `${mes.ano}-${p2(mes.mes + 1)}-01`;
    const vistos = new Set();
    destinos = [...listaDestinos(M.CFG.waCliente), ...listaDestinos(M.CFG.waGestor)]
      .filter(d => { const n = normalizarTelefone(d); if (!n || vistos.has(n)) return false; vistos.add(n); return true; });
    periodo = M.consolidar(M.linhasDe(mes.de, mes.ate));
  }
  base.referencia = ref;

  const filtro = { cliente_id: `eq.${cliente.id}`, tipo: `eq.${ctx.tipo}`, referencia: `eq.${ref}`, limit: 1 };
  let existente;
  // enviando_em é da migração 20261013a: sem ela o PostgREST recusa a coluna (400) e vale a leitura de antes
  try { [existente] = await db.select("nx_relatorios", { ...filtro, select: "id,enviado_em,enviando_em" }); }
  catch (e) {
    if (e?.status !== 400 || !/enviando_em/.test(String(e?.message ?? ""))) throw e;
    [existente] = await db.select("nx_relatorios", { ...filtro, select: "id,enviado_em" });
  }
  if (existente?.enviado_em && !ctx.forcar) return { ...base, ok: true, pulado: "já enviado" };
  // plano 1000 (SV-091): reservado (enviando_em) e sem envio confirmado = a execução anterior pode ter mandado e não conseguiu
  // registrar; nunca reenvia sozinho (só o botão com forcar)
  // plano 1500c · SC-056: nunca reenvia sozinho (pode ter saído), mas deixa de ser «ok»: a execução fica vermelha em nx_execucoes
  // (e na saúde) até alguém conferir e usar «forçar» — antes o relatório sumia em silêncio para sempre
  if (existente?.enviando_em && !ctx.forcar) return { ...base, ok: false, pulado: "envio sem confirmação (use forçar para mandar de novo)", erro: "relatorio_sem_confirmacao" };
  // cliente sem anúncio rodando no período: relatório zerado no WhatsApp é só ruído
  if (!ctx.forcar && !(periodo.gasto > 0)) return { ...base, ok: true, pulado: "sem investimento no período" };
  // sem número cadastrado não é erro de todo dia (decisão 4): pula, e o admin do cliente é avisado uma vez por semana
  if (!destinos.length) return { ...base, ok: true, pulado: "sem destino cadastrado", aviso_admin: await avisarSemDestino(db, cliente, ctx.tipo) };
  // plano 1500c · AC-306: o diário de um dia sem gasto, sem conversa e sem agendamento (o núcleo decide: M.diaSemNada) não sai
  if (ctx.tipo === "diario" && !ctx.forcar && typeof M.diaSemNada === "function" && M.diaSemNada(M.R)) return { ...base, ok: true, pulado: "dia sem movimento" };

  let leitura = null, iaErro = null, iaMotivo = null;
  // plano 2000d · REV-02: o resumo semanal não leva leitura de IA (relSemanal não usa; antes mesDoRelatorio(M, undefined) lançava e
  // gravava «IA falhou» toda semana, gastando a reserva da cota)
  if (ctx.ia && ctx.tipo !== "semanal") {
    // plano 1000 (SV-063): a leitura passa pela cota do cliente e fica em nx_ia_uso (acao 'relatorio', sem conta). Sem reserva
    // (cota do mês acabou) o relatório sai sem a leitura; banco sem a ação nova (20261013c não aplicada) segue como antes.
    const reserva = await reservarIA(db, cliente.id);
    // plano 1000 (SV-073): modelo desconhecido → o padrão · plano 1500c · SC-087: sem config, diário no Haiku e mensal no Sonnet
    const modelo = modeloPara(ctx.tipo, cfg.modelo_ia);
    const t0 = Date.now();
    let uso = null;
    try {
      if (reserva.recusada) throw Object.assign(new Error(`IA sem cota (${reserva.recusada})`), { semCota: true });
      const resta = Math.min(ctx.prazoIACliente, ctx.prazoIA - Date.now());
      if (resta <= 0) throw new Error("tempo esgotado");
      const contexto = ctx.tipo === "diario" ? M.contextoIA(M.R) : { ...M.contextoIA(M.R), mes_do_relatorio: mesDoRelatorio(M, mes) };
      const r = await noPrazo(ctx.ia({ chave: cfg.anthropic_api_key, modelo, tipo: ctx.tipo, contexto, prazoMs: resta }), resta);
      // a IA injetada pode devolver só o texto (testes, versões antigas) ou o objeto com o uso (leituraIACompleta)
      uso = r && typeof r === "object" ? r : null;
      leitura = limparLeitura(uso ? uso.texto : r) || null;
      if (!leitura) throw new Error("a IA não devolveu texto");
    } catch (e) {
      leitura = null;
      iaErro = limparErro(e?.message || e);
      iaMotivo = e?.semCota ? reserva.recusada : traduzirErroIA(e).detalhe || null;
    }
    if (reserva.id) {
      await registrarUsoIA(db, { reserva: reserva.id, modelo: uso?.modelo || modelo, tokensIn: uso?.tokens_in, tokensOut: uso?.tokens_out, ok: !!leitura,
        stopReason: uso?.stop_reason, ms: uso?.ms ?? Date.now() - t0, cacheEscrita: uso?.tokens_cache_escrita, cacheLeitura: uso?.tokens_cache_leitura });
    }
  }

  // plano 2000d · REV-03: semana fechada (segunda a domingo) — casa com ref = segundaDaSemanaAnterior
  const texto = ctx.tipo === "diario" ? M.relDiario(M.R, leitura) : ctx.tipo === "semanal" ? M.relSemanal(M.R, { fechada: true }) : M.relMensal(mes, leitura);
  const titulo = tituloRelatorio(ctx.tipo, M.NOME, ref);
  // plano 1000 (SV-091): RESERVA a linha antes de mandar (enviando_em, coluna da 20261013a). Se o registro final falhar (banco
  // piscou), a próxima execução acha a reserva e não manda de novo. Sem a coluna (migração não aplicada) segue como antes.
  let reservou = false;
  try {
    await db.upsert("nx_relatorios", { cliente_id: cliente.id, tipo: ctx.tipo, referencia: ref, texto, destinos, enviando_em: ctx.agora.toISOString() }, "cliente_id,tipo,referencia");
    reservou = true;
  } catch (e) {
    // plano 1000b · B-037: só segue SEM reserva quando o banco não tem a coluna (400 citando enviando_em). Outra falha (503,
    // tempo esgotado) sobe: mandar sem reserva podia repetir o relatório se o registro final também falhasse.
    if (!(e?.status === 400 && /enviando_em/.test(String(e?.message)))) throw e;
    console.error("nx-relatorio reserva:", limparErro(e?.message || e));
  }
  let envio;
  try { envio = await enviarParaTodos(cfg, destinos, texto, { fetch: ctx.fetch, titulo }); }
  catch (e) {
    // plano 1500c · SC-056: o envio nem começou/quebrou no meio sem resultado — solta a reserva (senão o dia ficava preso)
    if (reservou) {
      try { await db.update("nx_relatorios", { cliente_id: `eq.${cliente.id}`, tipo: `eq.${ctx.tipo}`, referencia: `eq.${ref}` }, { enviando_em: null }); }
      catch (e2) { console.error("nx-relatorio soltar reserva:", limparErro(e2?.message || e2)); }
    }
    throw e;
  }
  // só o envio decide `erro` e `ok`: a leitura da IA é opcional, e a falha dela não é falha de um relatório entregue
  const erro = erroDeEnvio(destinos, envio);
  const enviado = envio.some(e => e.ok);

  const linha = { cliente_id: cliente.id, tipo: ctx.tipo, referencia: ref, texto, leitura_ia: leitura, destinos, erro, ...(reservou ? { enviando_em: null } : {}) };
  // envio que falhou não apaga o horário (nem os wamids e a entrega) de um envio anterior que deu certo;
  // envio novo troca os wamids e zera entregue_em até o webhook confirmar a entrega deste
  if (enviado) Object.assign(linha, { enviado_em: ctx.agora.toISOString(), entregue_em: null, ...idsDoEnvio(envio) });
  await db.upsert("nx_relatorios", linha, "cliente_id,tipo,referencia");

  return {
    ...base, ok: !erro, enviado, ia: leitura ? "ok" : ctx.tipo === "semanal" ? "não usa" : ctx.ia ? "falhou" : "sem chave",   // plano 2000d · REV-02
    ...(iaErro ? { ia_erro: iaErro, ...(iaMotivo ? { ia_motivo: iaMotivo } : {}) } : {}),
    envio: anonimizarEnvio(envio), ...(erro ? { erro } : {}),
  };
}

/**
 * POST com header x-nx-cron. Corpo { tipo: "diario"|"mensal", cliente?: uuid, forcar?: bool }.
 * @param {{fetch?: Function, agora?: Date|Function, ia?: Function, prazoIA?: number, prazoIACliente?: number, prazoRede?: number}} [deps]
 *   ia({chave, modelo, tipo, contexto}) → texto; padrão: ./ia.js (SDK oficial)
 */
export function tratar(req, env, deps = {}) {
  // 405/401 respondem sem ler: o corpo é drenado antes da resposta (senão o runtime espera o envio)
  return soltandoCorpo(req, () => tratarRelatorio(req, env, deps), deps.drenagem);
}

async function tratarRelatorio(req, env, deps) {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!req.headers.get("x-nx-cron")) return json({ erro: "não autorizado" }, 401);
  const t0 = Date.now();
  const f = deps.fetch || globalThis.fetch;
  const rede = comPrazo(f, deps.prazoRede ?? PRAZO_REDE_MS);
  const agora = agoraDe(deps);
  try {
    const db = criarDb(env, f);
    // corpo antes do banco: teto de 64 KiB (resto drenado, 413 sem tocar no banco)
    const corpo = await lerCorpo(req, undefined, deps.drenagem);
    const cfg = await autenticarCron(req, db);
    exigirCorpoValido(corpo);   // plano 1000 (SV-100): corpo ilegível nunca vira «todos os clientes»
    const tipo = corpo.tipo ?? "diario";
    if (tipo !== "diario" && tipo !== "mensal" && tipo !== "semanal") throw new ErroHttp(400, "tipo deve ser diario, semanal ou mensal");   // plano 1500c · AC-055
    const clientes = await listarClientes(db, corpo.cliente, hojeSP(agora));   // o mesmo «hoje» do relógio injetado (teste vencido)

    const ctx = {
      tipo, forcar: corpo.forcar === true, hoje: hojeSP(agora), agora, fetch: rede,
      ia: cfg.anthropic_api_key ? (deps.ia || iaPadrao) : null,
      prazoIA: t0 + (deps.prazoIA ?? PRAZO_IA_MS),
      prazoIACliente: deps.prazoIACliente ?? PRAZO_IA_CLIENTE_MS,
    };
    // trava por tipo E cliente: o botão de uma clínica às 8h não faz o cron do dia pular as outras
    const resumo = await emLotes(clientes, CLIENTES_JUNTOS, c =>
      comTravaDoCliente(db, `nx-relatorio:${tipo}:${c.id}`, TRAVA_S, { cliente: c.slug, tipo }, () =>
        gerar(db, cfg, c, ctx).catch(e => ({ cliente: c.slug, tipo, ok: false, erro: limparErro(e?.message || e) }))));
    if (todosPulados(resumo)) return json({ ok: true, tipo, pulado: EM_EXECUCAO });

    const ok = resumo.every(x => x.ok);
    await registrarExecucao(db, { tarefa: "nx-relatorio", inicio: agora, ms: Date.now() - t0, ok, resumo: { tipo, forcar: ctx.forcar, clientes: resumo } });
    return json({ ok, tipo, clientes: resumo });
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, e instanceof ErroHttp ? e.status : 500);
  }
}
