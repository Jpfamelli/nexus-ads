/* ============================================================
   NEXUS ADS — relatorio.js (nx-relatorio: 8h diário / dia 1º mensal)
   Texto do núcleo (+ leitura por IA quando houver chave) →
   nx_relatorios → WhatsApp. A IA nunca impede o relatório.
   ============================================================ */
import { criarDb } from "./db.js";
import { enviarParaTodos, normalizarTelefone, idsDoEnvio } from "./whatsapp.js";
import { hojeSP, MESES } from "./nucleo.js";
import {
  ErroHttp, json, agoraDe, somaDias, limparErro, lerCorpo, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
  tituloRelatorio, comTravaDoCliente, todosPulados, EM_EXECUCAO,
} from "./comum.js";

const JANELA = 130;         // a mesma do painel (nx_dados p_dias padrão): os números batem
const CLIENTES_JUNTOS = 3;
// trava por tipo e cliente ('nx-relatorio:diario:<id>'); vence sozinha se a função for cortada (150 s)
export const TRAVA_S = 170;
// A Edge Function corta a requisição em 150 s. O SDK sozinho pode levar 2 × 60 s por
// cliente: sem um teto para a execução toda, IA lenta impediria o envio dos lotes seguintes.
const PRAZO_IA_MS = 90_000;

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

  let leitura = null, erroIA = null;
  if (ctx.ia) {
    try {
      const resta = ctx.prazoIA - Date.now();
      if (resta <= 0) throw new Error("tempo esgotado");
      const contexto = ctx.tipo === "diario" ? M.contextoIA(M.R) : { ...M.contextoIA(M.R), mes_do_relatorio: mesDoRelatorio(M, mes) };
      leitura = limparLeitura(await noPrazo(ctx.ia({ chave: cfg.anthropic_api_key, modelo: cfg.modelo_ia || "claude-opus-5", tipo: ctx.tipo, contexto }), resta)) || null;
      if (!leitura) throw new Error("a IA não devolveu texto");
    } catch (e) {
      leitura = null;
      erroIA = `IA: ${limparErro(e?.message || e)}`;
    }
  }

  const texto = ctx.tipo === "diario" ? M.relDiario(M.R, leitura) : M.relMensal(mes, leitura);
  const titulo = tituloRelatorio(ctx.tipo, M.NOME, ref);
  const envio = destinos.length ? await enviarParaTodos(cfg, destinos, texto, { fetch: ctx.fetch, titulo }) : [];
  const erro = [erroIA, erroDeEnvio(destinos, envio)].filter(Boolean).join(" · ") || null;
  const enviado = envio.some(e => e.ok);

  const linha = { cliente_id: cliente.id, tipo: ctx.tipo, referencia: ref, texto, leitura_ia: leitura, destinos, erro };
  // envio que falhou não apaga o horário (nem os wamids e a entrega) de um envio anterior que deu certo;
  // envio novo troca os wamids e zera entregue_em até o webhook confirmar a entrega deste
  if (enviado) Object.assign(linha, { enviado_em: ctx.agora.toISOString(), entregue_em: null, ...idsDoEnvio(envio) });
  await db.upsert("nx_relatorios", linha, "cliente_id,tipo,referencia");

  return { ...base, ok: !erro, enviado, ia: leitura ? "ok" : ctx.ia ? "falhou" : "sem chave", envio, ...(erro ? { erro } : {}) };
}

/**
 * POST com header x-nx-cron. Corpo { tipo: "diario"|"mensal", cliente?: uuid, forcar?: bool }.
 * @param {{fetch?: Function, agora?: Date|Function, ia?: Function, prazoIA?: number, prazoRede?: number}} [deps]
 *   ia({chave, modelo, tipo, contexto}) → texto; padrão: ./ia.js (SDK oficial)
 */
export async function tratar(req, env, deps = {}) {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!req.headers.get("x-nx-cron")) return json({ erro: "não autorizado" }, 401);
  const t0 = Date.now();
  const f = deps.fetch || globalThis.fetch;
  const rede = comPrazo(f, deps.prazoRede ?? PRAZO_REDE_MS);
  const agora = agoraDe(deps);
  try {
    const db = criarDb(env, f);
    const cfg = await autenticarCron(req, db);
    const corpo = await lerCorpo(req);
    const tipo = corpo.tipo ?? "diario";
    if (tipo !== "diario" && tipo !== "mensal") throw new ErroHttp(400, "tipo deve ser diario ou mensal");
    const clientes = await listarClientes(db, corpo.cliente);

    const ctx = {
      tipo, forcar: corpo.forcar === true, hoje: hojeSP(agora), agora, fetch: rede,
      ia: cfg.anthropic_api_key ? (deps.ia || iaPadrao) : null,
      prazoIA: t0 + (deps.prazoIA ?? PRAZO_IA_MS),
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
