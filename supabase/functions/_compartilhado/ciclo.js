/* ============================================================
   NEXUS ADS — ciclo.js (nx-ciclo, de hora em hora)
   1. Sync: Meta/Google → nx_metricas_dia (últimos 7 dias)
   2. Radar: regras do núcleo + integração quebrada → nx_alertas → WhatsApp do gestor
   3. Registro em nx_execucoes
   Um cliente por vez em todo o sistema (trava 'nx-ciclo:<cliente>' em nx_travas).
   ============================================================ */
import { criarDb } from "./db.js";
import { sincronizarMeta } from "./meta.js";
import { criarGoogle } from "./google.js";
import { enviarParaTodos, idsDoEnvio } from "./whatsapp.js";
import { hojeSP, nomePlat } from "./nucleo.js";
import {
  ErroHttp, json, agoraDe, somaDias, limparErro, lerCorpo, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
  nomeCurto, tituloRadar, modeloVazio, comTravaDoCliente, todosPulados, EM_EXECUCAO,
} from "./comum.js";

const CONFLITO_METRICAS = "cliente_id,plataforma,nivel,data,campanha_ext,anuncio_ext";
const JANELA_SYNC = 7;     // a atribuição do Meta ainda muda dias passados
const JANELA_RADAR = 45;
const CLIENTES_JUNTOS = 3;
// A Edge Function é cortada em 150 s (plano gratuito); a trava de cada cliente dura um pouco
// mais e vence sozinha se o finally não rodar.
export const TRAVA_S = 170;
// Erro que costuma passar sozinho (rede, instabilidade, limite de consultas) só vira aviso se durar isso.
const TOLERANCIA_PASSAGEIRA_H = 3;
const HORA_MS = 3600e3;

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

/* ---------- aviso de integração quebrada (regra 'integracao') ---------- */

const NADA_A_FAZER = "Nada a fazer agora: o sistema tenta de novo a cada hora e avisa se continuar.";
// [teste, explicação curta para leigo, o que fazer, passageiro?] — a primeira que casar vale
const ERROS = {
  meta: [
    [/meta_ad_account_id não configurado|meta_access_token não configurado/i, "faltam o token ou o ID da conta de anúncios",
      "Preencha o token e o ID da conta de anúncios do Meta em Ajustes → Integrações."],
    [/\(código 190\)|access token|session has expired|Error validating/i, "o token de acesso venceu ou foi desativado",
      "Gere um token novo do usuário do sistema (validade Nunca) e cole em Ajustes → Integrações."],
    [/\(código (10|200|270|294)\)|permiss/i, "o token não tem permissão para ler esta conta de anúncios",
      "No Gerenciador de Negócios, atribua a conta de anúncios ao usuário do sistema e salve de novo em Ajustes → Integrações."],
    [/\(código 100\)|does not exist|Unsupported get request|cannot be loaded/i, "a conta de anúncios não foi encontrada",
      "Confira o ID da conta de anúncios (act_…) em Ajustes → Integrações."],
    [/\(código (4|17|32|341|613|8000\d|8001\d)\)|rate limit|too many calls|request limit/i, "o Meta pediu uma pausa (limite de consultas)", NADA_A_FAZER, true],
    [/não respondeu em/i, "o Meta não está respondendo", NADA_A_FAZER, true],
    [/Meta API 5\d\d|\(código [12]\)|resposta ilegível/i, "o Meta está instável", NADA_A_FAZER, true],
  ],
  google: [
    [/Google Ads: falta|google_customer_id não configurado|google_developer_token não configurado/i, "faltam dados da conexão do Google",
      "Preencha os 6 campos do Google em Ajustes → Integrações."],
    [/invalid_grant|expired or revoked/i, "a autorização do Google venceu ou foi revogada",
      "Gere um refresh token novo (node scripts/google-refresh-token.mjs) e cole em Ajustes → Integrações."],
    [/invalid_client|unauthorized_client/i, "o client ID ou o client secret do Google está errado",
      "Confira o client ID e o client secret em Ajustes → Integrações."],
    [/DEVELOPER_TOKEN_NOT_APPROVED|only approved for use with test accounts|not approved/i, "o developer token do Google ainda não foi aprovado para contas reais",
      "Aguarde o e-mail de aprovação do Google (Acesso básico). O Meta continua funcionando enquanto isso."],
    [/DEVELOPER_TOKEN_INVALID|DEVELOPER_TOKEN_PROHIBITED|developer token is not valid/i, "o developer token do Google é inválido",
      "Copie de novo o developer token da Central de API da conta de gerente e cole em Ajustes → Integrações."],
    [/PERMISSION_DENIED|permission/i, "o usuário do Google não tem acesso a esta conta",
      "Confira o ID da conta e o ID da conta de gerente (MCC) em Ajustes → Integrações."],
    [/CUSTOMER_NOT_ENABLED|not yet enabled|deactivated/i, "a conta do Google Ads está desativada ou ainda não foi ativada",
      "Confira no Google Ads se a conta da clínica está ativa e com forma de pagamento."],
    [/CUSTOMER_NOT_FOUND|INVALID_CUSTOMER_ID|invalid customer id|customer not found/i, "a conta do Google Ads não foi encontrada",
      "Confira o ID da conta (10 dígitos) em Ajustes → Integrações."],
    [/nenhuma versão da API respondeu/i, "o Google desligou a versão da API em uso",
      "Preencha a versão atual em Ajustes → Configuração da Nexus → Versão da API do Google."],
    [/RESOURCE_EXHAUSTED|Google Ads 429|too many requests/i, "o Google pediu uma pausa (limite de consultas)", NADA_A_FAZER, true],
    [/não respondeu em/i, "o Google não está respondendo", NADA_A_FAZER, true],
    [/(Google Ads|OAuth Google) 5\d\d/i, "o Google está instável", NADA_A_FAZER, true],
    [/UNAUTHENTICATED|Google Ads 401|OAuth Google 4\d\d/i, "o Google recusou as credenciais",
      "Confira os campos do Google em Ajustes → Integrações e salve de novo."],
  ],
};
const REDE = /fetch failed|error sending request|connection (reset|closed|refused)|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i;

/** Erro técnico do sync → { curto, acao, passageiro } em linguagem de quem não é programador. */
export function explicarErroIntegracao(canal, erro) {
  const msg = String(erro ?? "");
  for (const [teste, curto, acao, passageiro = false] of ERROS[canal] || []) {
    if (teste.test(msg)) return { curto, acao, passageiro };
  }
  if (REDE.test(msg)) return { curto: `o ${nomePlat(canal)} não está respondendo`, acao: NADA_A_FAZER, passageiro: true };
  const cru = limparErro(msg).replace(/^erro — /, "");
  return {
    curto: cru.length > 140 ? `${cru.slice(0, 139)}…` : cru,
    acao: "Abra Ajustes → Integrações, confira os dados da conexão e salve de novo.",
    passageiro: false,
  };
}

/** Falha permanente avisa na hora; passageira só se já está há TOLERANCIA sem sincronizar. */
function deveAvisar(f, agora) {
  if (!f.passageiro || !f.ultimo_sync) return true;
  return agora.getTime() - new Date(f.ultimo_sync).getTime() >= TOLERANCIA_PASSAGEIRA_H * HORA_MS;
}

/** No formato de M.avaliar(), para seguir o MESMO caminho do radar (dedup de 24h por chave, texto, envio). */
function alertaDeIntegracao(f, nome) {
  const plat = nomePlat(f.canal);
  const curto = f.passageiro && f.ultimo_sync ? `${f.curto} (sem atualizar há mais de ${TOLERANCIA_PASSAGEIRA_H} h)` : f.curto;
  return {
    regra: { id: "integracao", nome: "Conexão parada" },
    chave: `integracao|${f.canal}`,
    sev: "critico",
    valor: null,
    msg: `A conexão com o ${plat} da ${nome} parou: ${curto}. Abra Ajustes → Integrações.`,
    acao: f.acao,
  };
}

/* ---------- radar ---------- */

async function radar(db, cfg, cliente, ctx, falhas) {
  // o radar quebrado não pode engolir o aviso de integração (e vice-versa)
  let M = null, avaliados = [], erroRadar = null;
  try {
    M = await carregarModelo(db, cliente, ctx.hoje, JANELA_RADAR);
    avaliados = M.avaliar(M.R, true);
  } catch (e) {
    erroRadar = limparErro(e?.message || e);
  }
  const nome = M ? M.NOME : nomeCurto(cliente);
  const candidatos = [...falhas.filter(f => deveAvisar(f, ctx.agora)).map(f => alertaDeIntegracao(f, nome)), ...avaliados];
  const res = { alertas_ativos: avaliados.length, alertas_novos: 0, ...(erroRadar ? { erro_radar: erroRadar } : {}) };
  if (!candidatos.length) return res;

  const desde = new Date(ctx.agora.getTime() - 24 * HORA_MS).toISOString();
  const recentes = await db.select("nx_alertas", { cliente_id: `eq.${cliente.id}`, criado_em: `gte.${desde}`, select: "chave" });
  const ja = new Set(recentes.map(r => r.chave));
  const novos = candidatos.filter(a => !ja.has(a.chave));
  res.alertas_novos = novos.length;
  if (!novos.length) return res;

  const quando = ctx.agora.toISOString();
  const gravados = await db.insert("nx_alertas", novos.map(a => ({
    cliente_id: cliente.id, chave: a.chave, regra: a.regra.id, severidade: a.sev,
    mensagem: a.msg, acao: a.acao, valor: Number.isFinite(a.valor) ? Math.round(a.valor * 1e4) / 1e4 : null,
    referencia: somaDias(ctx.hoje, -1), criado_em: quando,
  })));

  const base = M || modeloVazio(cliente, ctx.hoje);
  const destinos = listaDestinos(base.CFG.waGestor);
  const texto = base.textoAlerta(novos);
  const envio = destinos.length ? await enviarParaTodos(cfg, destinos, texto, { fetch: ctx.fetch, titulo: tituloRadar(nome, novos.length) }) : [];
  const erro = erroDeEnvio(destinos, envio);
  const ids = gravados.map(g => g.id).filter(id => id != null);
  if (ids.length) {
    // uma escrita só, depois de todos os envios: antes dela o webhook não acha o wamid
    // (e espera um pouco para conferir de novo), então nunca apaga o que o webhook anotou
    await db.update("nx_alertas", { id: `in.(${ids.join(",")})` }, {
      enviado_em: envio.some(e => e.ok) ? quando : null,
      erro_envio: erro,
      ...idsDoEnvio(envio),
    });
  }
  return { ...res, envio, ...(erro ? { erro_envio: erro } : {}) };
}

async function processarCliente(db, cfg, cliente, ctx) {
  const res = { cliente: cliente.slug, ok: true, sync: {} };
  const integracoes = await db.select("nx_integracoes", {
    cliente_id: `eq.${cliente.id}`, ativo: "eq.true", select: "id,canal,cred,ultimo_sync", order: "canal.asc",
  });
  const falhas = [];
  // uma plataforma quebrada não derruba a outra nem o próximo cliente
  for (const integ of integracoes) {
    try {
      const status = await sincronizar(db, cliente, integ, ctx);
      await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { ultimo_sync: ctx.agora.toISOString(), status });
      res.sync[integ.canal] = status;
    } catch (e) {
      const erro = limparErro(e?.message || e);
      const status = `erro — ${erro}`;
      res.sync[integ.canal] = status;
      res.ok = false;
      falhas.push({ canal: integ.canal, ultimo_sync: integ.ultimo_sync || null, ...explicarErroIntegracao(integ.canal, erro) });
      try { await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { status }); } catch { /* o resumo já registra */ }
    }
  }
  try {
    const r = await radar(db, cfg, cliente, ctx, falhas);
    Object.assign(res, r);
    if (r.erro_radar) res.ok = false;
  } catch (e) { res.ok = false; res.erro_radar = limparErro(e?.message || e); }
  return res;
}

/**
 * POST com header x-nx-cron = nx_config.cron_token. Corpo opcional { cliente: uuid }.
 * Cliente que outra execução já está processando (cron + botão) fica como { pulado: "já em execução" }
 * no resumo; se TODOS os pedidos estavam assim, responde { ok: true, pulado } sem registrar nada.
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
    // trava por cliente: o botão de uma clínica não faz o cron pular as outras
    const resumo = await emLotes(clientes, CLIENTES_JUNTOS, c =>
      comTravaDoCliente(db, `nx-ciclo:${c.id}`, TRAVA_S, { cliente: c.slug }, () =>
        processarCliente(db, cfg, c, ctx).catch(e => ({ cliente: c.slug, ok: false, erro: limparErro(e?.message || e) }))));
    // outra execução já estava com todos os clientes pedidos: nada foi feito, nada é registrado
    if (todosPulados(resumo)) return json({ ok: true, pulado: EM_EXECUCAO });

    // lembra a versão do Google que respondeu, para a próxima rodada ir direto nela
    const versao = ctx.google.versao;
    if (versao && versao !== cfg.google_api_versao) {
      try { await db.update("nx_config", { id: "eq.1" }, { google_api_versao: versao }); }
      catch (e) { console.error("google_api_versao:", limparErro(e.message)); }
    }

    const ok = resumo.every(x => x.ok);
    await registrarExecucao(db, { tarefa: "nx-ciclo", inicio: agora, ms: Date.now() - t0, ok, resumo: { hoje: ctx.hoje, google_api_versao: versao, clientes: resumo } });
    return json({ ok, hoje: ctx.hoje, clientes: resumo });
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, e instanceof ErroHttp ? e.status : 500);
  }
}
