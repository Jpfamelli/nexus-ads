/* ============================================================
   NEXUS ADS — ciclo.js (nx-ciclo, de hora em hora)
   1. Sync: Meta/Google → nx_metricas_dia (7 dias de hora em hora; 28 dias na rodada diária das 03:07 UTC —
      o Meta reatribui conversas por semanas e o Google importa conversões com atraso)
   2. Atribuição tardia: nx_atribuicao_completar (lead de anúncio novo ganha a campanha quando a métrica chega)
   3. Radar: regras do núcleo + integração parada/instável + fuso da conta → nx_alertas → WhatsApp do gestor
   4. Registro em nx_execucoes (telefones e wamids anonimizados no resumo)
   Um cliente por vez em todo o sistema (trava 'nx-ciclo:<cliente>' em nx_travas).
   Modo painel (plano 100, F226): POST {token, cliente, dias:1} = «Testar conexão» (admin do cliente, módulo ads):
   sincroniza só a janela pedida, sem radar, e devolve a explicação de cada integração. No cron, {cliente, dias}
   faz o mesmo (teste).
   ============================================================ */
import { criarDb } from "./db.js";
import { sincronizarMeta, contaMeta, VERSOES_META } from "./meta.js";
import { criarGoogle } from "./google.js";
import { enviarParaTodos, idsDoEnvio } from "./whatsapp.js";
import { hojeSP, nomePlat } from "./nucleo.js";
import {
  ErroHttp, ErroApi, json, agoraDe, somaDias, limparErro, lerCorpo, lerConfig, autenticarCron, listarClientes,
  carregarModelo, emLotes, erroDeEnvio, registrarExecucao, listaDestinos, comPrazo, PRAZO_REDE_MS,
  nomeCurto, tituloRadar, modeloVazio, comTravaDoCliente, todosPulados, EM_EXECUCAO, soltandoCorpo,
  funcaoAusente, anonimizarEnvio, tratarPainel, lerCorpoPainel, autenticarPainel, interna, respostaPainel,
} from "./comum.js";

const CONFLITO_METRICAS = "cliente_id,plataforma,nivel,data,campanha_ext,anuncio_ext";
const JANELA_SYNC = 7;             // a atribuição do Meta ainda muda dias passados
export const JANELA_SYNC_DIARIA = 28;   // uma vez por dia: conversões atrasadas (Google) e reatribuição tardia (Meta)
export const HORA_RODADA_DIARIA = 3;    // UTC = 00:07 em São Paulo (o cron roda aos :07)
const JANELA_RADAR = 45;
const CLIENTES_JUNTOS = 3;
// A Edge Function é cortada em 150 s (plano gratuito); a trava de cada cliente dura um pouco
// mais e vence sozinha se o finally não rodar.
export const TRAVA_S = 170;
// Erro que costuma passar sozinho (rede, instabilidade, limite de consultas) só vira aviso se durar isso.
const TOLERANCIA_PASSAGEIRA_H = 3;
// nx_travas guarda desde quando a integração vem falhando (quem nunca sincronizou não tem ultimo_sync para contar)
const MEMORIA_FALHA_S = 24 * 3600;
const HORA_MS = 3600e3;
export const FUSO_ESPERADO = "America/Sao_Paulo";

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

/** Data mais recente que esta plataforma já gravou para o cliente (null se nunca). */
async function ultimaData(db, cliente, plataforma) {
  const [r] = await db.select("nx_metricas_dia", { cliente_id: `eq.${cliente.id}`, plataforma: `eq.${plataforma}`, select: "data", order: "data.desc", limit: 1 });
  return r?.data ? String(r.data).slice(0, 10) : null;
}

/** Sync de uma integração: {status, parcial, linhas, de, prontas}. «parcial» é honesto onde «ok» mentia: a Meta tinha
    mais páginas do que o teto (dias recentes incompletos) ou a conta parou de mandar dados depois de já ter mandado. */
async function sincronizar(db, cliente, integ, ctx) {
  const de = somaDias(ctx.hoje, -ctx.janela), ate = ctx.hoje, cred = integ.cred || {};
  const estado = {};   // meta.js anota aqui a versão da Graph que respondeu e se parou no teto de páginas
  const linhas = integ.canal === "meta" ? await sincronizarMeta(cred, de, ate, { fetch: ctx.fetch, versao: ctx.meta.versao, estado })
    : integ.canal === "google" ? await ctx.google.periodo(cred, de, ate)
    : null;
  if (!linhas) throw new Error(`canal desconhecido: ${integ.canal}`);
  if (estado.versao) ctx.meta.versao = estado.versao;
  const quando = ctx.agora.toISOString();
  const prontas = agregar(linhas).map(l => ({ cliente_id: cliente.id, ...l, atualizado_em: quando }));
  if (prontas.length) await db.upsert("nx_metricas_dia", prontas, CONFLITO_METRICAS);
  const n = `${prontas.length} ${prontas.length === 1 ? "linha" : "linhas"}`;
  const r = { linhas: prontas.length, de, prontas, parcial: false, status: `ok — ${n}` };
  if (estado.parcial) {
    r.parcial = true;
    r.status = `parcial — ${n} (a Meta devolveu mais páginas do que o teto; os últimos dias podem estar incompletos)`;
  } else if (!prontas.length && !ctx.teste) {
    // (no «Testar conexão» a janela é de 1 dia: campanha pausada há 2 dias não é leitura parcial — a conexão respondeu)
    const ultima = await ultimaData(db, cliente, integ.canal);
    if (ultima && ultima < de) { r.parcial = true; r.status = `parcial — 0 linhas (sem dados desde ${ultima})`; }
  }
  return r;
}

/** Fuso e moeda da conta de anúncios (só na rodada diária); falha aqui nunca é falha do sync. */
async function lerConta(integ, ctx) {
  try {
    if (integ.canal === "meta") return await contaMeta(integ.cred || {}, { fetch: ctx.fetch, versao: ctx.meta.versao });
    if (integ.canal === "google") return await ctx.google.conta(integ.cred || {});
  } catch (e) { console.error(`nx-ciclo conta ${integ.canal}:`, limparErro(e?.message || e)); }
  return null;
}

/** Nome mais recente de campanha/anúncio reescrito nos dias ANTERIORES à janela (só na rodada diária): o painel já
    prefere o nome mais novo, mas relatórios SQL e exportações leem a coluna. Um PATCH por campanha/anúncio com nome;
    devolve quantos foram varridos. Nunca lança. */
async function renomearAntigos(db, cliente, prontas, de) {
  const campanhas = new Map(), anuncios = new Map();
  const guardar = (mapa, chave, item) => { const a = mapa.get(chave); if (!a || item.data > a.data) mapa.set(chave, item); };
  for (const l of prontas) {
    if (l.campanha_nome) guardar(campanhas, `${l.plataforma}|${l.campanha_ext}`, { plataforma: l.plataforma, campanha_ext: l.campanha_ext, nome: l.campanha_nome, data: l.data });
    if (l.nivel === "anuncio" && l.anuncio_ext && l.anuncio_nome) guardar(anuncios, `${l.plataforma}|${l.anuncio_ext}`, { plataforma: l.plataforma, anuncio_ext: l.anuncio_ext, nome: l.anuncio_nome, data: l.data });
  }
  let n = 0;
  try {
    for (const c of campanhas.values()) {
      await db.update("nx_metricas_dia", { cliente_id: `eq.${cliente.id}`, plataforma: `eq.${c.plataforma}`, campanha_ext: `eq.${c.campanha_ext}`,
        data: `lt.${de}`, campanha_nome: `neq.${c.nome}` }, { campanha_nome: c.nome });
      n++;
    }
    for (const a of anuncios.values()) {
      await db.update("nx_metricas_dia", { cliente_id: `eq.${cliente.id}`, plataforma: `eq.${a.plataforma}`, nivel: "eq.anuncio", anuncio_ext: `eq.${a.anuncio_ext}`,
        data: `lt.${de}`, anuncio_nome: `neq.${a.nome}` }, { anuncio_nome: a.nome });
      n++;
    }
  } catch (e) { console.error("nx-ciclo renomear:", limparErro(e?.message || e)); }
  return n;
}

/** Leads/contatos de anúncio sem campanha ganham a campanha quando a métrica do anúncio existe (migração 20261008a).
    Sem a RPC → null; erro → {erro}. Nunca lança. */
async function completarAtribuicao(db, cliente) {
  try { return await db.rpc("nx_atribuicao_completar", { p_cliente: cliente.id }); }
  catch (e) {
    if (funcaoAusente(e, "nx_atribuicao_completar")) return null;
    console.error("nx-ciclo atribuição:", limparErro(e?.message || e));
    return { erro: limparErro(e?.message || e) };
  }
}

/* ---------- aviso de integração quebrada (regra 'integracao') ---------- */

const NADA_A_FAZER = "Nada a fazer agora: o sistema tenta de novo a cada hora e avisa se continuar.";
const AVISAR_NEXUS = "Avise a equipe da Nexus: o Órbita precisa de atualização (os dados da conexão estão certos).";
// [teste, explicação curta para leigo, o que fazer, passageiro?] — a primeira que casar vale
const ERROS = {
  meta: [
    [/meta_ad_account_id não configurado|meta_access_token não configurado/i, "faltam o token ou o ID da conta de anúncios",
      "Preencha o token e o ID da conta de anúncios do Meta em Ajustes → Integrações."],
    // versão da Graph desligada: nada da conta está errado — trocar token não resolve
    [/\(código 2635\)|deprecated version|unknown version|unsupported version/i, "a Meta desligou a versão da API que o Órbita usa", AVISAR_NEXUS],
    [/\(código 190\)|access token|session has expired|Error validating/i, "o token de acesso venceu ou foi desativado",
      "Gere um token novo do usuário do sistema (validade Nunca) e cole em Ajustes → Integrações."],
    [/\(código (10|200|270|294)\)|permiss/i, "o token não tem permissão para ler esta conta de anúncios",
      "No Gerenciador de Negócios, atribua a conta de anúncios ao usuário do sistema e salve de novo em Ajustes → Integrações."],
    [/does not exist|Unsupported get request|cannot be loaded/i, "a conta de anúncios não foi encontrada",
      "Confira o ID da conta de anúncios (act_…) em Ajustes → Integrações."],
    // código 100 sem essas frases é campo/parâmetro da consulta (ex.: «nonexisting field»), não a conta
    [/\(código 100\)/i, "a Meta não aceitou um campo da consulta", AVISAR_NEXUS],
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

const nomeMemoria = integ => `nx-ciclo:falha:${integ.id}`;
/** Desde quando a integração falha (ISO): guardado em nx_travas na 1ª falha passageira de quem nunca sincronizou
    (a trava viva mantém o `ate` original; ate − prazo = a 1ª falha). Nunca lança. */
async function primeiraFalha(db, integ, agora) {
  try {
    await db.rpc("nx_trava_pegar", { p_nome: nomeMemoria(integ), p_segundos: MEMORIA_FALHA_S, p_dono: "nx-ciclo" });
    const [t] = await db.select("nx_travas", { nome: `eq.${nomeMemoria(integ)}`, select: "ate", limit: 1 });
    return t?.ate ? new Date(Date.parse(t.ate) - MEMORIA_FALHA_S * 1000).toISOString() : agora.toISOString();
  } catch (e) { console.error("nx-ciclo memória da falha:", limparErro(e?.message || e)); return null; }
}
const esquecerFalha = (db, integ) => db.rpc("nx_trava_soltar", { p_nome: nomeMemoria(integ), p_dono: "nx-ciclo" }).catch(() => null);

/** Falha permanente avisa na hora; passageira só se já está há TOLERANCIA sem sincronizar — contada do último sync
    bom ou, para quem nunca sincronizou, da primeira falha. */
export function deveAvisar(f, agora) {
  if (!f.passageiro) return true;
  const desde = f.ultimo_sync || f.primeira_falha_em;
  if (!desde) return true;
  return agora.getTime() - new Date(desde).getTime() >= TOLERANCIA_PASSAGEIRA_H * HORA_MS;
}

/** No formato de M.avaliar(), para seguir o MESMO caminho do radar (dedup de 24h por chave, texto, envio).
    Passageira: «instável», severidade alerta e sem mandar abrir Ajustes (a ação já diz que não há o que fazer). */
function alertaDeIntegracao(f, nome) {
  const plat = nomePlat(f.canal);
  if (f.passageiro) {
    return {
      regra: { id: "integracao", nome: "Conexão instável" }, chave: `integracao|${f.canal}`, sev: "alerta", valor: null,
      msg: `A conexão com o ${plat} da ${nome} está instável: ${f.curto} (sem atualizar há mais de ${TOLERANCIA_PASSAGEIRA_H} h).`,
      acao: f.acao,
    };
  }
  return {
    regra: { id: "integracao", nome: "Conexão parada" }, chave: `integracao|${f.canal}`, sev: "critico", valor: null,
    msg: `A conexão com o ${plat} da ${nome} parou: ${f.curto}. Abra Ajustes → Integrações.`,
    acao: f.acao,
  };
}

/** Deslocamento UTC do fuso agora («GMT-03:00»); fuso desconhecido → null. */
function deslocamento(fuso, agora) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" }).formatToParts(agora);
    return (p.find(x => x.type === "timeZoneName") || {}).value || null;
  } catch { return null; }
}
/** Fuso da conta com o MESMO deslocamento de São Paulo agora (America/Fortaleza, Recife, Bahia…): os dias batem, não é problema. */
export function fusoEquivalente(fuso, agora = new Date()) {
  const a = deslocamento(fuso, agora), b = deslocamento(FUSO_ESPERADO, agora);
  return !!(a && b && a === b);
}
/** O aviso de fuso sai UMA vez por conta e fuso: trava de 30 dias no banco (o status era reescrito pelo sync de hora em
    hora sem o sufixo e o aviso voltava todo dia). Sem como gravar a trava, não avisa (melhor calar que repetir). */
async function primeiroAvisoFuso(db, integ, fuso) {
  try { return (await db.rpc("nx_trava_pegar", { p_nome: `nx-ciclo:fuso:${integ.id}:${fuso}`, p_segundos: 30 * 24 * 3600, p_dono: "nx-ciclo" })) === true; }
  catch (e) { console.error("nx-ciclo fuso:", limparErro(e?.message || e)); return false; }
}

/** Conta de anúncios em outro fuso: o «ontem» e o custo por conversa do dia ficam deslocados. Uma vez por conta e fuso (trava de 30 dias). */
function alertaDeFuso(x, nome) {
  const plat = nomePlat(x.canal);
  return {
    regra: { id: "fuso", nome: "Fuso da conta" }, chave: `fuso|${x.canal}`, sev: "alerta", valor: null,
    msg: `A conta de anúncios do ${plat} da ${nome} está no fuso ${x.fuso}, não em São Paulo: os números de cada dia podem ficar deslocados em algumas horas.`,
    acao: "No Gerenciador, confira o fuso da conta de anúncios (o ideal é America/Sao_Paulo) ou leia os números por semana.",
  };
}

/* ---------- radar ---------- */

async function radar(db, cfg, cliente, ctx, falhas, fusos = []) {
  // o radar quebrado não pode engolir o aviso de integração (e vice-versa)
  let M = null, avaliados = [], erroRadar = null;
  try {
    M = await carregarModelo(db, cliente, ctx.hoje, JANELA_RADAR);
    avaliados = M.avaliar(M.R, true);
  } catch (e) {
    erroRadar = limparErro(e?.message || e);
  }
  const nome = M ? M.NOME : nomeCurto(cliente);
  const candidatos = [
    ...falhas.filter(f => deveAvisar(f, ctx.agora)).map(f => alertaDeIntegracao(f, nome)),
    ...fusos.map(x => alertaDeFuso(x, nome)),
    ...avaliados,
  ];
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
  // o resumo (nx_execucoes, resposta do cron) não carrega número inteiro nem wamid: os reais ficam em nx_alertas
  return { ...res, envio: anonimizarEnvio(envio), ...(erro ? { erro_envio: erro } : {}) };
}

async function processarCliente(db, cfg, cliente, ctx) {
  const res = { cliente: cliente.slug, ok: true, sync: {}, janela: ctx.janela, ...(ctx.teste ? { integracoes: [] } : {}) };
  const integracoes = await db.select("nx_integracoes", {
    cliente_id: `eq.${cliente.id}`, ativo: "eq.true", select: "id,canal,cred,ultimo_sync,status", order: "canal.asc",
  });
  const falhas = [], fusos = [];
  // uma plataforma quebrada não derruba a outra nem o próximo cliente
  for (const integ of integracoes) {
    try {
      const r = await sincronizar(db, cliente, integ, ctx);
      let status = r.status;
      if (r.parcial) res.parcial = true;
      if (ctx.diaria) {
        // uma vez por dia: fuso/moeda da conta (aviso de fuso uma vez por conta e fuso) e nomes antigos reescritos
        const conta = await lerConta(integ, ctx);
        if (conta?.timezone && conta.timezone !== FUSO_ESPERADO && !fusoEquivalente(conta.timezone, ctx.agora)) {
          status += ` · fuso ${conta.timezone} (≠ São Paulo)`;
          if (await primeiroAvisoFuso(db, integ, conta.timezone)) fusos.push({ canal: integ.canal, fuso: conta.timezone });
        }
        if (conta?.moeda && conta.moeda !== "BRL") status += ` · moeda ${conta.moeda}`;
        if (r.prontas.length) res.renomeados = (res.renomeados || 0) + await renomearAntigos(db, cliente, r.prontas, r.de);
      }
      await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { ultimo_sync: ctx.agora.toISOString(), status });
      res.sync[integ.canal] = status;
      if (/^erro — /.test(String(integ.status ?? ""))) await esquecerFalha(db, integ);   // a memória da falha some no sucesso
      if (ctx.teste) res.integracoes.push({ canal: integ.canal, ok: true, status, linhas: r.linhas });
    } catch (e) {
      const erro = limparErro(e?.message || e);
      const status = `erro — ${erro}`;
      res.sync[integ.canal] = status;
      res.ok = false;
      const explicacao = explicarErroIntegracao(integ.canal, erro);
      // 1ª leitura (sem ultimo_sync) com erro passageiro: a tolerância conta da 1ª falha, não dispara na hora
      const primeira = explicacao.passageiro && !integ.ultimo_sync && !ctx.teste ? await primeiraFalha(db, integ, ctx.agora) : null;
      falhas.push({ canal: integ.canal, ultimo_sync: integ.ultimo_sync || null, primeira_falha_em: primeira, ...explicacao });
      try { await db.update("nx_integracoes", { id: `eq.${integ.id}` }, { status }); } catch { /* o resumo já registra */ }
      if (ctx.teste) res.integracoes.push({ canal: integ.canal, ok: false, status, explicacao });
    }
  }
  if (ctx.teste) return res;   // «Testar conexão»: sem radar, sem atribuição tardia
  const atribuicao = await completarAtribuicao(db, cliente);
  if (atribuicao) res.atribuicao = atribuicao;
  try {
    const r = await radar(db, cfg, cliente, ctx, falhas, fusos);
    Object.assign(res, r);
    if (r.erro_radar) res.ok = false;
  } catch (e) { res.ok = false; res.erro_radar = limparErro(e?.message || e); }
  return res;
}

/** `dias` do corpo: inteiro de 1 a 28 (teste de conexão) ou null (rotina). */
export const janelaPedida = v => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= JANELA_SYNC_DIARIA ? n : NaN;
};

function montarCtx({ cfg, agora, rede, dias }) {
  const diaria = dias == null && agora.getUTCHours() === HORA_RODADA_DIARIA;
  return {
    hoje: hojeSP(agora), agora, fetch: rede, teste: dias != null, diaria,
    janela: dias ?? (diaria ? JANELA_SYNC_DIARIA : JANELA_SYNC),
    google: criarGoogle({ fetch: rede, versao: cfg.google_api_versao || null }),
    meta: { versao: cfg.meta_api_versao || null },
  };
}

/** Versões que responderam: a próxima rodada vai direto nelas. A da Meta só é gravada quando saiu da versão padrão
    (sem a coluna meta_api_versao, migração desta rodada, o PATCH falha e fica só o log). */
async function lembrarVersoes(db, cfg, ctx) {
  const g = ctx.google.versao;
  if (g && g !== cfg.google_api_versao) {
    try { await db.update("nx_config", { id: "eq.1" }, { google_api_versao: g }); }
    catch (e) { console.error("google_api_versao:", limparErro(e.message)); }
  }
  const m = ctx.meta.versao;
  if (m && m !== (cfg.meta_api_versao || VERSOES_META[0])) {
    try { await db.update("nx_config", { id: "eq.1" }, { meta_api_versao: m }); }
    catch (e) { console.error("meta_api_versao (coluna da migração 20261008):", limparErro(e.message)); }
  }
}

/**
 * POST com header x-nx-cron = nx_config.cron_token. Corpo opcional { cliente: uuid, dias?: 1..28 (teste: sem radar) }.
 * Sem o header: modo painel {token, cliente, dias?} — «Testar conexão» (admin do cliente, módulo ads).
 * Cliente que outra execução já está processando (cron + botão) fica como { pulado: "já em execução" }
 * no resumo; se TODOS os pedidos estavam assim, responde { ok: true, pulado } sem registrar nada.
 * @param {Request} req
 * @param {{url: string, chave: string}} env
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number}} [deps]
 */
export function tratar(req, env, deps = {}) {
  // 405/401 respondem sem ler: o corpo é drenado antes da resposta (senão o runtime espera o envio)
  return soltandoCorpo(req, () => {
    if (req.method === "OPTIONS") return tratarPainelCiclo(req, env, deps);   // preflight do navegador (CORS)
    if (req.method !== "POST") return json({ erro: "use POST" }, 405);
    if (req.headers.get("x-nx-cron") != null) return tratarCiclo(req, env, deps);
    // painel («Testar conexão»): o front manda sempre o apikey; sem ele é um POST anônimo → 401 sem ler o corpo
    if (req.headers.get("apikey")) return tratarPainelCiclo(req, env, deps);
    return json({ erro: "não autorizado" }, 401);
  }, deps.drenagem);
}

async function tratarCiclo(req, env, deps) {
  const t0 = Date.now();
  const f = deps.fetch || globalThis.fetch;
  const rede = comPrazo(f, deps.prazoRede ?? PRAZO_REDE_MS);
  const agora = agoraDe(deps);
  try {
    const db = criarDb(env, f);
    // corpo antes do banco: teto de 64 KiB (resto drenado, 413 sem tocar no banco)
    const corpo = await lerCorpo(req, undefined, deps.drenagem);
    const cfg = await autenticarCron(req, db);
    const dias = janelaPedida(corpo.dias);
    if (Number.isNaN(dias)) throw new ErroHttp(400, "dias inválido (1 a 28)");
    const clientes = await listarClientes(db, corpo.cliente);

    const ctx = montarCtx({ cfg, agora, rede, dias });
    // trava por cliente: o botão de uma clínica não faz o cron pular as outras
    const resumo = await emLotes(clientes, CLIENTES_JUNTOS, c =>
      comTravaDoCliente(db, `nx-ciclo:${c.id}`, TRAVA_S, { cliente: c.slug }, () =>
        processarCliente(db, cfg, c, ctx).catch(e => ({ cliente: c.slug, ok: false, erro: limparErro(e?.message || e) }))));
    // outra execução já estava com todos os clientes pedidos: nada foi feito, nada é registrado
    if (todosPulados(resumo)) return json({ ok: true, pulado: EM_EXECUCAO });

    await lembrarVersoes(db, cfg, ctx);
    const ok = resumo.every(x => x.ok);
    const extra = { janela: ctx.janela, ...(ctx.teste ? { teste: true } : {}), ...(ctx.diaria ? { diaria: true } : {}) };
    await registrarExecucao(db, { tarefa: "nx-ciclo", inicio: agora, ms: Date.now() - t0, ok,
      resumo: { hoje: ctx.hoje, ...extra, google_api_versao: ctx.google.versao, meta_api_versao: ctx.meta.versao, clientes: resumo } });
    return json({ ok, hoje: ctx.hoje, ...extra, clientes: resumo });
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, e instanceof ErroHttp ? e.status : 500);
  }
}

/** Painel («Testar conexão»): admin do cliente + módulo ads → sync da janela pedida (padrão 1 dia), sem radar. */
async function tratarPainelCiclo(req, env, deps) {
  const t0 = Date.now();
  const f = deps.fetch || globalThis.fetch;
  return tratarPainel(req, async () => {
    const corpo = await lerCorpoPainel(req, undefined, deps.drenagem);
    const db = criarDb(env, f);
    await autenticarPainel(db, corpo, "admin");
    const cliente = String(corpo.cliente);
    await interna(db, "nx_exigir_modulo", { p_cliente: cliente, p_modulo: "ads" });
    const dias = janelaPedida(corpo.dias ?? 1);
    if (Number.isNaN(dias)) throw new ErroApi("dados_invalidos", 400, "dias");
    let lista;
    try { lista = await listarClientes(db, cliente); }
    catch (e) { if (e instanceof ErroHttp) throw new ErroApi(e.status === 404 ? "cliente_nao_encontrado" : "dados_invalidos", e.status); throw e; }
    const cfg = await lerConfig(db, ["google_api_versao", "meta_api_versao"]).catch(() => lerConfig(db, ["google_api_versao"]));
    const agora = agoraDe(deps);
    const ctx = montarCtx({ cfg: cfg || {}, agora, rede: comPrazo(f, deps.prazoRede ?? PRAZO_REDE_MS), dias });
    const [c] = lista;
    const r = await comTravaDoCliente(db, `nx-ciclo:${c.id}`, TRAVA_S, { cliente: c.slug }, () => processarCliente(db, cfg || {}, c, ctx));
    if (r.pulado !== EM_EXECUCAO) {
      await registrarExecucao(db, { tarefa: "nx-ciclo", inicio: agora, ms: Date.now() - t0, ok: !!r.ok,
        resumo: { hoje: ctx.hoje, janela: dias, teste: true, painel: true, clientes: [r] } });
    }
    return respostaPainel({ ok: true, teste: true, hoje: ctx.hoje, janela: dias, cliente: r });
  }, deps.drenagem);
}
