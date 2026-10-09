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
  ErroHttp, json, agoraDe, somaDias, limparErro, lerCorpo, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
  tituloRelatorio, comTravaDoCliente, todosPulados, EM_EXECUCAO, soltandoCorpo, anonimizarEnvio,
  traduzirErroIA, MODELO_PADRAO,
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
const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** IA padrão: o SDK só é carregado aqui, e só quando há chave. */
const iaPadrao = async opcoes => (await import("./ia.js")).leituraIA(opcoes);

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

async function gerar(db, cfg, cliente, ctx) {
  const M = await carregarModelo(db, cliente, ctx.hoje, JANELA);
  const base = { cliente: cliente.slug, tipo: ctx.tipo };
  let ref, destinos, mes = null, periodo;

  if (ctx.tipo === "diario") {
    ref = somaDias(ctx.hoje, -1);
    destinos = listaDestinos(M.CFG.waGestor);
    periodo = M.consolidar(M.linhasDe(M.R - 6, M.R));
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

  const [existente] = await db.select("nx_relatorios", {
    cliente_id: `eq.${cliente.id}`, tipo: `eq.${ctx.tipo}`, referencia: `eq.${ref}`, select: "id,enviado_em", limit: 1,
  });
  if (existente?.enviado_em && !ctx.forcar) return { ...base, ok: true, pulado: "já enviado" };
  // cliente sem anúncio rodando no período: relatório zerado no WhatsApp é só ruído
  if (!ctx.forcar && !(periodo.gasto > 0)) return { ...base, ok: true, pulado: "sem investimento no período" };
  // sem número cadastrado não é erro de todo dia (decisão 4): pula, e o admin do cliente é avisado uma vez por semana
  if (!destinos.length) return { ...base, ok: true, pulado: "sem destino cadastrado", aviso_admin: await avisarSemDestino(db, cliente, ctx.tipo) };

  let leitura = null, iaErro = null, iaMotivo = null;
  if (ctx.ia) {
    try {
      const resta = Math.min(ctx.prazoIACliente, ctx.prazoIA - Date.now());
      if (resta <= 0) throw new Error("tempo esgotado");
      const contexto = ctx.tipo === "diario" ? M.contextoIA(M.R) : { ...M.contextoIA(M.R), mes_do_relatorio: mesDoRelatorio(M, mes) };
      leitura = limparLeitura(await noPrazo(ctx.ia({ chave: cfg.anthropic_api_key, modelo: cfg.modelo_ia || MODELO_PADRAO, tipo: ctx.tipo, contexto, prazoMs: resta }), resta)) || null;
      if (!leitura) throw new Error("a IA não devolveu texto");
    } catch (e) {
      leitura = null;
      iaErro = limparErro(e?.message || e);
      iaMotivo = traduzirErroIA(e).detalhe || null;
    }
  }

  const texto = ctx.tipo === "diario" ? M.relDiario(M.R, leitura) : M.relMensal(mes, leitura);
  const titulo = tituloRelatorio(ctx.tipo, M.NOME, ref);
  const envio = await enviarParaTodos(cfg, destinos, texto, { fetch: ctx.fetch, titulo });
  // só o envio decide `erro` e `ok`: a leitura da IA é opcional, e a falha dela não é falha de um relatório entregue
  const erro = erroDeEnvio(destinos, envio);
  const enviado = envio.some(e => e.ok);

  const linha = { cliente_id: cliente.id, tipo: ctx.tipo, referencia: ref, texto, leitura_ia: leitura, destinos, erro };
  // envio que falhou não apaga o horário (nem os wamids e a entrega) de um envio anterior que deu certo;
  // envio novo troca os wamids e zera entregue_em até o webhook confirmar a entrega deste
  if (enviado) Object.assign(linha, { enviado_em: ctx.agora.toISOString(), entregue_em: null, ...idsDoEnvio(envio) });
  await db.upsert("nx_relatorios", linha, "cliente_id,tipo,referencia");

  return {
    ...base, ok: !erro, enviado, ia: leitura ? "ok" : ctx.ia ? "falhou" : "sem chave",
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
    const tipo = corpo.tipo ?? "diario";
    if (tipo !== "diario" && tipo !== "mensal") throw new ErroHttp(400, "tipo deve ser diario ou mensal");
    const clientes = await listarClientes(db, corpo.cliente);

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
