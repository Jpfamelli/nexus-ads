/* ============================================================
   NEXUS ADS — ciclo.js (nx-ciclo, de hora em hora)
   1. Sync: Meta/Google → nx_metricas_dia (últimos 7 dias)
   2. Radar: regras do núcleo → nx_alertas → WhatsApp do gestor
   3. Registro em nx_execucoes
   ============================================================ */
import { criarDb } from "./db.js";
import { sincronizarMeta } from "./meta.js";
import { criarGoogle } from "./google.js";
import { enviarParaTodos } from "./whatsapp.js";
import { hojeSP } from "./nucleo.js";
import {
  ErroHttp, json, agoraDe, somaDias, limparErro, lerCorpo, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
} from "./comum.js";

const CONFLITO_METRICAS = "cliente_id,plataforma,nivel,data,campanha_ext,anuncio_ext";
const JANELA_SYNC = 7;     // a atribuição do Meta ainda muda dias passados
const JANELA_RADAR = 45;
const CLIENTES_JUNTOS = 3;

/** Junta linhas com a mesma chave primária (o mesmo anúncio em dois grupos do Google,
    por exemplo) — o Postgres recusa um upsert que toca a mesma linha duas vezes. */
function agregar(linhas) {
  const m = new Map();
  for (const l of linhas) {
    const k = [l.plataforma, l.nivel, l.data, l.campanha_ext, l.anuncio_ext].join("|");
    const a = m.get(k);
    if (!a) { m.set(k, { ...l }); continue; }
    const imp = a.impressoes + l.impressoes;
    a.frequencia = imp ? (a.frequencia * a.impressoes + l.frequencia * l.impressoes) / imp : 0;
    a.impressoes = imp;
    for (const c of ["alcance", "cliques", "conversoes"]) a[c] += l[c];
    a.gasto = Math.round((a.gasto + l.gasto) * 100) / 100;
    a.valor_conversao = Math.round((a.valor_conversao + l.valor_conversao) * 100) / 100;
  }
  return [...m.values()];
}

async function sincronizar(db, cliente, integ, ctx) {
  const de = somaDias(ctx.hoje, -JANELA_SYNC), ate = ctx.hoje, cred = integ.cred || {};
  const linhas = integ.canal === "meta" ? await sincronizarMeta(cred, de, ate, { fetch: ctx.fetch })
    : integ.canal === "google" ? await ctx.google.periodo(cred, de, ate)
    : null;
  if (!linhas) throw new Error(`canal desconhecido: ${integ.canal}`);
  const quando = ctx.agora.toISOString();
  const prontas = agregar(linhas).map(l => ({ cliente_id: cliente.id, ...l, atualizado_em: quando }));
  if (prontas.length) await db.upsert("nx_metricas_dia", prontas, CONFLITO_METRICAS);
  return `ok — ${prontas.length} ${prontas.length === 1 ? "linha" : "linhas"}`;
}

async function radar(db, cfg, cliente, ctx) {
  const M = await carregarModelo(db, cliente, ctx.hoje, JANELA_RADAR);
  const avaliados = M.avaliar(M.R, true);
  const desde = new Date(ctx.agora.getTime() - 24 * 3600e3).toISOString();
  const recentes = await db.select("nx_alertas", { cliente_id: `eq.${cliente.id}`, criado_em: `gte.${desde}`, select: "chave" });
  const ja = new Set(recentes.map(r => r.chave));
  const novos = avaliados.filter(a => !ja.has(a.chave));
  const res = { alertas_ativos: avaliados.length, alertas_novos: novos.length };
  if (!novos.length) return res;

  const quando = ctx.agora.toISOString();
  const gravados = await db.insert("nx_alertas", novos.map(a => ({
    cliente_id: cliente.id, chave: a.chave, regra: a.regra.id, severidade: a.sev,
    mensagem: a.msg, acao: a.acao, valor: Number.isFinite(a.valor) ? Math.round(a.valor * 1e4) / 1e4 : null,
    referencia: somaDias(ctx.hoje, -1), criado_em: quando,
  })));

  const destinos = listaDestinos(M.CFG.waGestor);
  const titulo = `Radar ${M.NOME}: ${novos.length} ${novos.length === 1 ? "alerta novo" : "alertas novos"}`;
  const envio = destinos.length ? await enviarParaTodos(cfg, destinos, M.textoAlerta(novos), { fetch: ctx.fetch, titulo }) : [];
  const erro = erroDeEnvio(destinos, envio);
  const ids = gravados.map(g => g.id).filter(id => id != null);
  if (ids.length) {
    await db.update("nx_alertas", { id: `in.(${ids.join(",")})` }, {
      enviado_em: envio.some(e => e.ok) ? quando : null,
      erro_envio: erro,
    });
  }
  return { ...res, envio, ...(erro ? { erro_envio: erro } : {}) };
}

async function processarCliente(db, cfg, cliente, ctx) {
  const res = { cliente: cliente.slug, ok: true, sync: {} };
  const integracoes = await db.select("nx_integracoes", {
    cliente_id: `eq.${cliente.id}`, ativo: "eq.true", select: "id,canal,cred", order: "canal.asc",
  });
  // uma plataforma quebrada não derruba a outra nem o próximo cliente
  for (const integ of integracoes) {
    try {
      const status = await sincronizar(db, cliente, integ, ctx);
      await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { ultimo_sync: ctx.agora.toISOString(), status });
      res.sync[integ.canal] = status;
    } catch (e) {
      const status = `erro — ${limparErro(e?.message || e)}`;
      res.sync[integ.canal] = status;
      res.ok = false;
      try { await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { status }); } catch { /* o resumo já registra */ }
    }
  }
  try { Object.assign(res, await radar(db, cfg, cliente, ctx)); }
  catch (e) { res.ok = false; res.erro_radar = limparErro(e?.message || e); }
  return res;
}

/**
 * POST com header x-nx-cron = nx_config.cron_token. Corpo opcional { cliente: uuid }.
 * @param {Request} req
 * @param {{url: string, chave: string}} env
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number}} [deps]
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
    const clientes = await listarClientes(db, corpo.cliente);
    const ctx = { hoje: hojeSP(agora), agora, fetch: rede, google: criarGoogle({ fetch: rede, versao: cfg.google_api_versao || null }) };

    const resumo = await emLotes(clientes, CLIENTES_JUNTOS, c =>
      processarCliente(db, cfg, c, ctx).catch(e => ({ cliente: c.slug, ok: false, erro: limparErro(e?.message || e) })));

    // lembra a versão do Google que respondeu, para a próxima rodada ir direto nela
    const versao = ctx.google.versao;
    if (versao && versao !== cfg.google_api_versao) {
      try { await db.update("nx_config", { id: "eq.1" }, { google_api_versao: versao }); }
      catch (e) { console.error("google_api_versao:", limparErro(e.message)); }
    }

    const ok = resumo.every(r => r.ok);
    await registrarExecucao(db, { tarefa: "nx-ciclo", inicio: agora, ms: Date.now() - t0, ok, resumo: { hoje: ctx.hoje, google_api_versao: versao, clientes: resumo } });
    return json({ ok, hoje: ctx.hoje, clientes: resumo });
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, e instanceof ErroHttp ? e.status : 500);
  }
}
