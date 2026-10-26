/* ============================================================
   NEXUS ADS / ÓRBITA — webhook.js (nx-whatsapp)
   - números dos CLIENTES (nx_canais, SaaS): mensagem → contato + conversa +
     mensagem (nx_wa_entrada) → lead no funil do cliente DO CANAL (nx_lead_webhook),
     mídia e "fora do horário" em segundo plano; recibos → nx_wa_status do canal.
     URL por número (?c=<chave>) só aceita eventos DAQUELE número (canal_divergente).
   - número da CLÍNICA sem nx_canais (nx_clientes.wa_phone_number_id): caminho
     antigo — cada conversa nova vira um lead, com o anúncio de origem (referral);
   - número da NEXUS (nx_config.wa_phone_number_id): recibos de entrega dos
     alertas e relatórios (delivered/read/failed) → entregue_em / erro; fora
     da janela de 24h, reenvia UMA vez como template. Só com o segredo global.
   ============================================================ */
import { criarDb } from "./db.js";
import { hojeSP } from "./nucleo.js";
import { enviarTemplate, foraDaJanela } from "./whatsapp.js";
import { processarCanal } from "./conversas.js";
import { enviarFila } from "./enviar.js";
import {
  json, agoraDe, soDigitos, iguaisSeguro, limparErro, lerConfig, comPrazo,
  nomeCurto, tituloRadar, tituloRelatorio, lerCorpoLimitado, soltandoCorpo, CorpoGrande, semNul, variantesTelefone,
  funcaoAusente, anonId, registrarExecucao, log,
} from "./comum.js";

// a regra de variantes do telefone mora no comum.js (a mesma do CodeWords); continua exportada daqui
export { variantesTelefone };

const DIAS_MESMA_CONVERSA = 30;
// o webhook lê a configuração ANTES de conferir a assinatura (1 SELECT por requisição anônima): só as colunas que usa,
// nunca «select *» com todos os segredos da plataforma em memória
const COLUNAS_CONFIG = ["meta_app_secret", "wa_verify_token", "wa_phone_number_id", "wa_access_token", "wa_template", "painel_url"];
const RESULTADOS_LEAD = new Set(["criado", "atribuido", "existente"]);
// O recibo pode chegar antes de o nx-ciclo/nx-relatorio gravar o wamid (a Meta avisa em
// ~1 s; com vários destinos, o primeiro recibo chega enquanto o segundo ainda está saindo).
// Recibo recente sem registro: espera um pouco e confere de novo, uma vez.
const ESPERA_STATUS_MS = 4000;
const RECENTE_S = 600;
// um reenvio por wamid, mesmo que a Meta mande o mesmo recibo duas vezes (ou ao mesmo tempo)
const TRAVA_REENVIO_S = 7 * 86400;
// o webhook precisa responder rápido à Meta: o reenvio por template não espera os 30 s do sync
const PRAZO_ENVIO_MS = 10_000;
const PRAZO_MIDIA_MS = 60_000;
// 2 MiB exatos passam; 1 byte a mais → o resto é drenado e descartado e sai 413 (lerCorpoLimitado)
export const MAX_CORPO_WEBHOOK = 2 * 1024 * 1024;
// wamid é base64 com prefixo: nada de aspas, chaves, vírgulas ou barra invertida
const WAMID_OK = /^[\w.:=+/-]{1,256}$/;
// plano 1000 (SV-003): a configuração do webhook fica 60 s na memória do isolate (por fetch: cada teste tem a sua); assinatura
// que não confere com o valor guardado relê uma vez (o segredo pode ter acabado de mudar)
const CONFIG_CACHE_MS = 60_000;
const CACHE_CONFIG = new WeakMap();
// plano 1000 (SV-216): o mesmo wamid com o lead falhando por banco 3 vezes → responde 200 (a Meta parava de reentregar o lote)
const LEAD_TENTATIVAS = 3;
const LEAD_MEMORIA_S = 7 * 86400;

async function hmacHex(segredo, bytes) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, bytes));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, corpo CRU). */
export async function assinaturaValida(segredo, bytes, cabecalho) {
  if (!segredo || !cabecalho) return false;
  const esperado = `sha256=${await hmacHex(segredo, bytes)}`;
  return iguaisSeguro(String(cabecalho).trim().toLowerCase(), esperado);
}

/** nx_config (só as COLUNAS_CONFIG) com cache de 60 s no isolate; forcar = relê agora. Nunca loga o conteúdo. */
async function configWebhook(db, f, { forcar = false } = {}) {
  const c = typeof f === "function" ? CACHE_CONFIG.get(f) : null;
  if (!forcar && c && Date.now() - c.em < CONFIG_CACHE_MS) return { cfg: c.cfg, doCache: true };
  const cfg = await lerConfig(db, COLUNAS_CONFIG);
  if (cfg && typeof f === "function") CACHE_CONFIG.set(f, { cfg, em: Date.now() });
  return { cfg, doCache: false };
}

/* ------------------------------------------------------------
   Número da clínica → leads
   ------------------------------------------------------------ */

/** Atribuição do referral. Post/página (source_type ≠ 'ad') NÃO vira anuncio_ext: o id do post na coluna de anúncio
    bloqueava para sempre a origem real (ja_tem_anuncio) — fica só no referral da mensagem. */
async function atribuicao(db, clienteId, ref) {
  const ad = ref.source_type === "ad";
  const anuncio = ad && ref.source_id != null && ref.source_id !== "" ? String(ref.source_id) : null;
  let campanha = null;
  if (ad && anuncio) {
    const [m] = await db.select("nx_metricas_dia", {
      cliente_id: `eq.${clienteId}`, plataforma: "eq.meta", nivel: "eq.anuncio", anuncio_ext: `eq.${anuncio}`,
      select: "campanha_ext", order: "data.desc", limit: 1,
    });
    campanha = m?.campanha_ext || null;
  }
  return {
    origem: ad ? "anuncio" : "whatsapp",
    plataforma: ad ? "meta" : null,
    anuncio_ext: anuncio,
    campanha_ext: campanha,
    ctwa_clid: ref.ctwa_clid || null,
  };
}

/** Procura → decide → grava numa transação só no banco (nx_lead_webhook), com trava por
    cliente + telefone: dois webhooks da mesma pessoa ao mesmo tempo viram UM lead. */
async function registrarMensagem(db, clienteId, telefone, nome, referral, hoje) {
  const atr = referral ? await atribuicao(db, clienteId, referral) : null;
  const r = await db.rpc("nx_lead_webhook", {
    p_cliente: clienteId, p_telefone: telefone, p_variantes: variantesTelefone(telefone),
    p_nome: nome || null, p_atr: atr, p_hoje: hoje, p_dias: DIAS_MESMA_CONVERSA,
  });
  if (!RESULTADOS_LEAD.has(r)) {
    const e = new Error(`nx_lead_webhook devolveu ${JSON.stringify(r)}`);
    e.banco = true;
    throw e;
  }
  return r;
}

async function processarMensagens(db, v, msgs, clientes, cont, ctx) {
  const pid = v.metadata.phone_number_id;
  if (!clientes.has(pid)) {
    const [c] = await db.select("nx_clientes", { wa_phone_number_id: `eq.${pid}`, select: "id,slug", limit: 1 });
    clientes.set(pid, c || null);
  }
  const cliente = clientes.get(pid);
  if (!cliente) { cont.sem_cliente += msgs.length; return; }

  const contatos = Array.isArray(v.contacts) ? v.contacts : [];
  const nomes = new Map(contatos.map(c => [soDigitos(c.wa_id), c.profile?.name]));
  for (const m of msgs) {
    if (m?.type === "system") continue;
    const tel = soDigitos(m?.from);
    if (!tel) continue;
    const nome = nomes.get(tel) || (contatos.length === 1 ? contatos[0].profile?.name : null);
    // uma mensagem com erro não derruba as outras do lote
    try { cont[await registrarMensagem(db, cliente.id, tel, nome, m.referral || null, ctx.hoje)]++; }
    catch (e) { ctx.falhou(e); }
  }
}

/* ------------------------------------------------------------
   Número da Nexus → recibos de entrega dos avisos
   ------------------------------------------------------------ */

// códigos mais comuns do recibo "failed", explicados para quem não é programador
const DICAS_FALHA = {
  131026: "o número não pôde receber (sem WhatsApp, bloqueou a Nexus ou aplicativo muito antigo)",
  131030: "o número não está na lista de teste (Configuração da API → Para)",
  131031: "a conta do WhatsApp da Nexus está bloqueada ou restrita",
  131042: "problema de pagamento na conta do WhatsApp da Nexus",
  131049: "a Meta segurou a mensagem para não cansar quem recebe",
  131050: "a pessoa pediu para não receber mensagens da Nexus",
  131051: "tipo de mensagem não suportado",
  131052: "a mídia não pôde ser baixada pelo WhatsApp",
  131053: "a mídia não pôde ser enviada (formato ou tamanho)",
  131056: "muitas mensagens para o mesmo número em pouco tempo",
  190: "token vencido ou revogado",
  368: "conta temporariamente bloqueada pela Meta",
};

/** "WhatsApp não entregou (código X): título" (+ dica em português quando conhecida). */
export function textoFalha(e, { temTemplate = false, eraTemplate = false } = {}) {
  const codigo = e?.code != null && e.code !== "" ? e.code : "?";
  const titulo = String(e?.title || e?.message || "falhou").replace(/\s+/g, " ").trim().slice(0, 120);
  let dica = DICAS_FALHA[Number(codigo)] || "";
  if (!dica && foraDaJanela(e)) {
    dica = eraTemplate ? "nem o modelo foi aceito" : temTemplate ? "" : "fora da janela de 24h e sem modelo (wa_template) configurado";
  }
  return `WhatsApp não entregou (código ${codigo}): ${titulo}${dica ? ` — ${dica}` : ""}`;
}

/** Alertas e relatórios que levaram ESTES wamids (texto OU template) → Map wamid → achados. Plano 1000 (SV-002): UM select por
    tabela para o lote inteiro (sobreposição «ov», coberta pelos índices GIN de wa_ids/wa_ids_template) — antes eram 2 por
    recibo, em série, antes de responder à Meta (50 recibos = 100 consultas). */
async function buscarEnvios(db, wamids) {
  const lista = [...new Set(wamids)].filter(w => WAMID_OK.test(w));
  const mapa = new Map();
  if (!lista.length) return mapa;
  const arr = `{${lista.map(w => `"${w}"`).join(",")}}`;
  const or = `(wa_ids.ov.${arr},wa_ids_template.ov.${arr})`;
  const [alertas, relatorios] = await Promise.all([
    db.select("nx_alertas", { or, select: "id,cliente_id,wa_ids,wa_ids_template", order: "id.asc", limit: 1000 }),
    db.select("nx_relatorios", { or, select: "id,cliente_id,tipo,referencia,wa_ids,wa_ids_template", order: "id.asc", limit: 200 }),
  ]);
  for (const w of lista) {
    const tem = l => (l.wa_ids || []).includes(w) || (l.wa_ids_template || []).includes(w);
    const a = alertas.filter(tem), r = relatorios.filter(tem);
    mapa.set(w, [
      ...(a.length ? [{ tabela: "nx_alertas", linhas: a }] : []),
      ...(r.length ? [{ tabela: "nx_relatorios", linhas: r }] : []),
    ]);
  }
  return mapa;
}

/** Anotação atômica no banco (entregue_em só na 1ª vez, template e erro sem repetir). */
const anotar = (db, achados, extra) => Promise.all(achados.map(a =>
  db.rpc("nx_wa_anotar", { p_tabela: a.tabela, p_ids: a.linhas.map(l => l.id), ...extra })));

/** O MESMO título curto que o nx-ciclo / nx-relatorio usou no envio original. */
async function tituloDoEnvio(db, achados) {
  const rel = achados.find(a => a.tabela === "nx_relatorios")?.linhas[0];
  const alertas = achados.find(a => a.tabela === "nx_alertas")?.linhas || [];
  const clienteId = rel?.cliente_id || alertas[0]?.cliente_id;
  const [c] = clienteId ? await db.select("nx_clientes", { id: `eq.${clienteId}`, select: "nome,cfg", limit: 1 }) : [];
  const nome = nomeCurto(c || {});
  return rel ? tituloRelatorio(rel.tipo, nome, rel.referencia) : tituloRadar(nome, alertas.length);
}

// plano 1000 (SV-011): recibo com horário no futuro (relógio errado, payload pela URL ?c=) gravava entregue_em no futuro; antes de
// 2015 é lixo (a mesma regra do dataIso do CodeWords) — nos dois casos vale a hora de agora. Folga de 2 min para a diferença
// normal entre o relógio da Meta e o nosso (o recibo legítimo de segundos à frente fica com o horário dele).
const ANTES_DE_2015 = Date.UTC(2015, 0, 1) / 1000;
const FOLGA_FUTURO_MS = 120_000;
export const quandoDo = (st, agora) => {
  const t = Number(st?.timestamp);
  if (!Number.isFinite(t) || t < ANTES_DE_2015 || t * 1000 > agora.getTime() + FOLGA_FUTURO_MS) return agora.toISOString();
  return new Date(t * 1000).toISOString();
};
const recente = (st, agora) => {
  const t = Number(st?.timestamp);
  return !Number.isFinite(t) || t <= 0 || Math.abs(agora.getTime() / 1000 - t) <= RECENTE_S;
};

/** @returns {Promise<"entregue"|"falha"|"reenviado"|"repetido"|"sem_registro"|"ignorado">} */
const reciboUtil = st => ["delivered", "read", "failed"].includes(st?.status) && WAMID_OK.test(String(st?.id ?? ""));

async function tratarStatus(db, cfg, st, ctx, envios) {
  const wamid = String(st?.id ?? "");
  const tipo = st?.status;
  if (!reciboUtil(st)) return "ignorado";   // 'sent' não interessa
  const achados = envios.get(wamid) || [];
  if (!achados.length) return "sem_registro";

  if (tipo !== "failed") {
    await anotar(db, achados, { p_entregue_em: quandoDo(st, ctx.agora) });
    return "entregue";
  }

  const e = (Array.isArray(st.errors) && st.errors[0]) || {};
  const eraTemplate = achados.some(a => a.linhas.some(l => (l.wa_ids_template || []).includes(wamid)));
  // Só o TEXTO que falhou por janela fechada é reenviado, e uma vez só: o wamid do template vai
  // para wa_ids_template (nunca é reenviado) e a trava por wamid barra o recibo repetido.
  if (!eraTemplate && foraDaJanela(e) && cfg.wa_template) {
    // Mensagem longa sai em N partes (N wamids, todos em wa_ids) e a Meta manda um 'failed' por parte:
    // a trava é pela LINHA (alerta/relatório) + destinatário, não pelo wamid — senão o gestor recebe N templates
    // (outro gestor do mesmo aviso tem trava própria).
    const linhas = achados.flatMap(a => a.linhas.map(l => `${a.tabela}:${l.id}`)).sort().join(",");
    const chave = `${linhas}:${String(st.recipient_id ?? "").replace(/\D/g, "")}`;
    const pegou = await db.rpc("nx_trava_pegar", { p_nome: `wa-reenvio:${chave}`, p_segundos: TRAVA_REENVIO_S, p_dono: ctx.dono });
    if (pegou !== true) return "repetido";
    let novo = null, nota;
    try {
      const r = await enviarTemplate(cfg, st.recipient_id, await tituloDoEnvio(db, achados), { fetch: ctx.rede });
      novo = r.id;
      nota = "fora da janela de 24h — reenviado como template";
    } catch (err) {
      nota = `fora da janela de 24h e o template falhou — ${limparErro(err?.message || err)}`;
    }
    await anotar(db, achados, { p_wa_id_template: novo, p_erro: nota });
    return novo ? "reenviado" : "falha";
  }

  await anotar(db, achados, { p_erro: textoFalha(e, { temTemplate: !!cfg.wa_template, eraTemplate }) });
  return "falha";
}

async function processarStatuses(db, cfg, lista, cont, ctx) {
  const pendentes = [];
  const um = async (st, ultimaVez, envios, conta) => {
    try {
      const r = await tratarStatus(db, cfg, st, ctx, envios);
      if (r === "sem_registro" && !ultimaVez && recente(st, ctx.agora)) { pendentes.push(st); return; }
      conta[r] = (conta[r] || 0) + 1;
    } catch (e) { ctx.falhou(e); }   // um recibo com erro não derruba os outros
  };
  let envios;
  try { envios = await buscarEnvios(db, lista.filter(reciboUtil).map(st => String(st.id))); }
  catch (e) { ctx.falhou(e); return; }   // sem saber a quem os recibos pertencem: a Meta reentrega (503 se foi o banco)
  for (const st of lista) await um(st, false, envios, cont.recibos);
  if (!pendentes.length) return;
  // plano 1000 (SV-001): a 2ª passada (o recibo chegou antes de o nx-ciclo/nx-relatorio gravar o wamid) espera 4 s FORA da
  // resposta à Meta (EdgeRuntime.waitUntil): um lote com recibos «sem_registro» segurava o 200 e um worker inteiro por ≥ 4 s.
  // A contagem da 2ª passada vai para o log JSON (e para o resumo, quando não há 2º plano — testes)
  ctx.emSegundoPlano((async () => {
    await ctx.esperar(ESPERA_STATUS_MS);
    const conta = {};
    let de2;
    try { de2 = await buscarEnvios(db, pendentes.map(st => String(st.id))); }
    catch (e) { ctx.falhou(e); return; }
    for (const st of pendentes) await um(st, true, de2, conta);
    for (const [k, n] of Object.entries(conta)) cont.recibos[k] = (cont.recibos[k] || 0) + n;
    try { console.log(JSON.stringify({ webhook: "recibos_2a_passada", ...conta })); } catch { /* log nunca derruba */ }
  })());
}

/* ------------------------------------------------------------ */

/* ------------------------------------------------------------
   Números dos clientes cadastrados em nx_canais (SaaS, ESPEC §6.2)
   ------------------------------------------------------------ */

/* Plano 1000 (SV-004): canal por ?c= e por phone_number_id fica na memória do isolate — 5 min quando existe, 30 s quando não existe
   (recibos chegam em rajadas de dezenas por minuto por número e cada um era uma chamada a nx_wa_canal). Por fetch (cada teste tem
   o seu), como o cache da configuração. Erro do banco nunca entra no cache. */
export const CANAL_CACHE_MS = 5 * 60_000;
export const CANAL_CACHE_NEG_MS = 30_000;
const CACHE_CANAL = new WeakMap();
async function canalComCache(f, chave, ler, { forcar = false, agoraMs = Date.now() } = {}) {
  let mapa = typeof f === "function" ? CACHE_CANAL.get(f) : null;
  if (!mapa && typeof f === "function") { mapa = new Map(); CACHE_CANAL.set(f, mapa); }
  const c = mapa?.get(chave);
  if (!forcar && c && agoraMs - c.em < (c.canal ? CANAL_CACHE_MS : CANAL_CACHE_NEG_MS)) return { canal: c.canal, doCache: true };
  const canal = await ler();
  if (mapa) {
    if (mapa.size > 500) mapa.clear();   // memória do isolate nunca cresce sem fim
    mapa.set(chave, { canal, em: agoraMs });
  }
  return { canal, doCache: false };
}

/** Canal pelo phone_number_id de um evento JÁ autenticado com o segredo global (cache por requisição + do isolate). */
async function canalDoPid(db, pid, cache, ctx) {
  if (!cache.has(pid)) {
    try {
      const { canal } = await canalComCache(ctx.fetch, `pid:${pid}`, async () => {
        const c = await db.rpc("nx_wa_canal", { p_phone_number_id: String(pid) });
        return c && c.canal_id ? c : null;
      }, { agoraMs: ctx.relogioMs() });
      cache.set(pid, canal);
    } catch (e) {
      // banco falhou: NÃO cai no caminho antigo (criaria lead sem conversa) — o retry da Meta (503) refaz este evento
      ctx.falhou(e);
      cache.set(pid, { erro: true });
    }
  }
  return cache.get(pid);
}

/** Quantas vezes o lead deste wamid já falhou por banco (1, 2, 3…), por travas de 7 dias em nx_travas. Erro → 1 (na dúvida
    a Meta reentrega, como antes). */
async function vezDoLead(db, wamid, ctx) {
  try {
    for (let n = 1; n <= LEAD_TENTATIVAS; n++) {
      if (await db.rpc("nx_trava_pegar", { p_nome: `nx-wa-lead:${wamid}:${n}`, p_segundos: LEAD_MEMORIA_S, p_dono: ctx.dono }) === true) return n;
    }
    return LEAD_TENTATIVAS + 1;
  } catch { return 1; }
}

/** Plano 1000 (SV-005): a Meta avisa quando um modelo é aprovado, reprovado ou pausado (field message_template_status_update,
    entry.id = WABA). nx_template_status atualiza nx_templates de TODOS os números daquela WABA e avisa os admins — antes o
    modelo seguia APPROVED até alguém clicar «Sincronizar» e a fila falhava com 132001 para cada contato. Pela URL ?c= só a
    WABA do próprio número. Banco sem a RPC → ignorado. */
async function statusDeModelo(db, entry, v, ctx, cont) {
  const waba = String(entry?.id ?? "").trim();
  const nome = String(v?.message_template_name ?? "").trim();
  const status = String(v?.event ?? "").trim().toUpperCase();
  if (!/^\d{5,30}$/.test(waba) || !nome || nome.length > 512 || !/^[A-Z_]{3,40}$/.test(status)) { cont.modelos_ignorados = (cont.modelos_ignorados || 0) + 1; return; }
  if (ctx.canalUrl && String(ctx.canalUrl.waba_id ?? "") !== waba) { cont.canal_divergente++; return; }
  try {
    const r = await db.rpc("nx_template_status", {
      p_waba: waba, p_nome: nome, p_idioma: v?.message_template_language ? String(v.message_template_language).slice(0, 20) : null,
      p_status: status, p_motivo: v?.reason != null && v.reason !== "NONE" ? String(v.reason).slice(0, 300) : null,
    });
    cont.modelos = (cont.modelos || 0) + (Number(r?.atualizados) || 0);
  } catch (e) {
    if (funcaoAusente(e, "nx_template_status")) { cont.modelos_ignorados = (cont.modelos_ignorados || 0) + 1; return; }
    throw e;
  }
}

/* ------------------------------------------------------------
   Plano 1000 (SV-012): contadores diários por canal Meta
   ------------------------------------------------------------ */
const CONTADORES_CANAL = [["mensagens", "mensagens"], ["duplicadas", "duplicadas"], ["recibos_canal", "recibos"], ["bloqueados", "bloqueados"], ["reacoes", "reacoes"]];
/** Soma em ctx.porCanal o que processarCanal acrescentou ao `cont` desta requisição (diferença antes × depois). */
function somarCanal(ctx, canalId, antes, cont, extra = {}) {
  if (!canalId || !ctx.porCanal) return;
  const atual = ctx.porCanal.get(canalId) || {};
  for (const [de, para] of CONTADORES_CANAL) {
    const n = (Number(cont[de]) || 0) - (Number(antes?.[de]) || 0);
    if (n > 0) atual[para] = (atual[para] || 0) + n;
  }
  for (const [k, n] of Object.entries(extra)) atual[k] = (atual[k] || 0) + n;
  ctx.porCanal.set(canalId, atual);
}
/** Uma chamada nx_canal_contar por canal com o resumo da requisição (+ retry_503 quando a resposta pede reentrega), antes da
    resposta. Contador falhando — ou banco sem a RPC — nunca muda a resposta. */
async function contarCanais(db, ctx, status) {
  if (!ctx.porCanal?.size) return;
  const tarefas = [...ctx.porCanal].map(([canal, c]) => {
    const p_cont = { ...c, ...(status === 503 ? { retry_503: 1 } : {}) };
    if (!Object.keys(p_cont).length) return null;
    return db.rpc("nx_canal_contar", { p_canal: canal, p_cont }).catch(e => {
      if (!funcaoAusente(e, "nx_canal_contar")) log("aviso", "canal_contar_falhou", { fn: "nx-whatsapp", erro: e });
    });
  }).filter(Boolean);
  // um UPDATE por canal, em paralelo, antes da resposta (curto; nunca muda o status)
  await Promise.allSettled(tarefas);
}

/** Plano 1000 (SV-006): queda de qualidade do número (phone_number_quality_update) e mudança da conta (account_update) — a Meta
    avisa e ninguém via. nx_canal_qualidade guarda o último evento no canal (WABA do entry; número quando vier) e avisa os admins
    do cliente uma vez por dia por evento. Pela URL ?c= só a WABA do próprio número. Banco sem a RPC → ignorado. */
async function eventoDoNumero(db, entry, ch, ctx, cont) {
  const v = ch?.value || {};
  const waba = String(entry?.id ?? "").trim();
  const evento = String(v.event ?? "").trim().toUpperCase();
  if (!/^\d{5,30}$/.test(waba) || !/^[A-Z_]{3,60}$/.test(evento)) { cont.eventos_ignorados = (cont.eventos_ignorados || 0) + 1; return; }
  if (ctx.canalUrl && String(ctx.canalUrl.waba_id ?? "") !== waba) { cont.canal_divergente++; return; }
  const numero = soDigitos(v.display_phone_number ?? v.phone_number ?? "").slice(0, 20) || null;
  const partes = [];
  if (v.current_limit) partes.push(`limite ${String(v.current_limit).slice(0, 40)}`);
  if (v.max_daily_conversation_per_phone) partes.push(`até ${Number(v.max_daily_conversation_per_phone) || 0} conversas/dia`);
  if (v.ban_info?.waba_ban_state) partes.push(`conta ${String(v.ban_info.waba_ban_state).slice(0, 40)}`);
  if (v.violation_info?.violation_type) partes.push(`violação ${String(v.violation_info.violation_type).slice(0, 60)}`);
  try {
    const r = await db.rpc("nx_canal_qualidade", { p_waba: waba, p_numero: numero, p_tipo: ch.field === "account_update" ? "conta" : "qualidade",
      p_evento: evento, p_detalhe: partes.join(" · ") || null });
    cont.eventos_numero = (cont.eventos_numero || 0) + (Number(r?.canais) || 0);
  } catch (e) {
    if (funcaoAusente(e, "nx_canal_qualidade")) { cont.eventos_ignorados = (cont.eventos_ignorados || 0) + 1; return; }
    throw e;
  }
}

async function processar(db, cfg, corpo, ctx) {
  const cont = {
    criado: 0, atribuido: 0, existente: 0, sem_cliente: 0,
    mensagens: 0, duplicadas: 0, recibos_canal: 0, canal_divergente: 0,
  };
  // lead do número de cliente: cliente = o do CANAL (2º, 3º… número também cria negócio e atribui o anúncio)
  ctx.registrarLead = async (clienteId, msg) => {
    try { cont[await registrarMensagem(db, clienteId, msg.wa_id, msg.nome, msg.referral || null, ctx.hoje)]++; }
    catch (e) {
      // plano 1000 (SV-216): erro de banco DETERMINÍSTICO (gatilho quebrado daquele cliente) fazia a Meta reentregar o lote por
      // dias — e as mensagens boas junto. Na 3ª entrega do mesmo wamid com o lead falhando: 200, rastro em nx_execucoes
      // (reparo manual) e as outras seguem.
      if (!e?.banco || !msg?.wamid || (await vezDoLead(db, msg.wamid, ctx)) < LEAD_TENTATIVAS) throw e;
      cont.lead_desistido = (cont.lead_desistido || 0) + 1;
      log("erro", "lead_desistido", { fn: "nx-whatsapp", cliente: clienteId, wamid: anonId(msg.wamid), erro: e });
      await registrarExecucao(db, { tarefa: "nx-whatsapp", inicio: ctx.agora, ms: 0, ok: false,
        resumo: { lead_reparo_manual: true, cliente: clienteId, wamid: anonId(msg.wamid), erro: limparErro(e?.message || e) } });
    }
  };
  const clientes = new Map();   // phone_number_id → cliente | null (caminho antigo, sem nx_canais)
  const canais = new Map();     // phone_number_id → canal | null
  const recibos = [];
  ctx.filaIds = [];   // plano 1000 (SV-193): «fora do horário» de todas as mensagens desta requisição, disparado uma vez no fim
  const nexus = cfg.wa_phone_number_id ? String(cfg.wa_phone_number_id) : null;
  for (const entry of corpo?.entry || []) {
    for (const ch of entry?.changes || []) {
      if (ch?.field === "message_template_status_update") {
        try { await statusDeModelo(db, entry, ch.value, ctx, cont); } catch (e) { ctx.falhou(e); }
        continue;
      }
      if (ch?.field === "phone_number_quality_update" || ch?.field === "account_update") {
        try { await eventoDoNumero(db, entry, ch, ctx, cont); } catch (e) { ctx.falhou(e); }
        continue;
      }
      if (ch?.field && ch.field !== "messages") continue;
      const v = ch?.value || {};
      const pid = v.metadata?.phone_number_id;
      if (!pid) continue;

      // URL ?c=<chave>: o admin do cliente conhece esse segredo → a requisição só grava
      // eventos DO número da URL. Outro número (ou o número da Nexus, nem que o pid bata) → descartado.
      if (ctx.canalUrl) {
        if (String(pid) !== String(ctx.canalUrl.phone_number_id) || (nexus && String(pid) === nexus)) {
          cont.canal_divergente++;
          somarCanal(ctx, ctx.canalUrl.canal_id, null, {}, { divergentes: 1 });
          continue;
        }
        const antes = { ...cont };
        try { await processarCanal(db, ctx.canalUrl, v, ctx, cont); }
        catch (e) { ctx.falhou(e); }
        somarCanal(ctx, ctx.canalUrl.canal_id, antes, cont);
        continue;
      }

      // sem ?c= (segredo global, que só a Meta e a Nexus conhecem)
      if (nexus && String(pid) === nexus) {
        // recibos dos avisos da Nexus, como antes
        if (Array.isArray(v.statuses)) recibos.push(...v.statuses);
        const msgs = Array.isArray(v.messages) ? v.messages : [];
        if (msgs.length) {
          try { await processarMensagens(db, v, msgs, clientes, cont, ctx); }
          catch (e) { ctx.falhou(e); }
        }
        continue;
      }
      const canal = await canalDoPid(db, pid, canais, ctx);
      if (canal?.erro) continue;   // sem saber se há canal, nada é gravado por este evento
      if (canal) {
        const antes = { ...cont };
        try { await processarCanal(db, canal, v, ctx, cont); }
        catch (e) { ctx.falhou(e); }
        somarCanal(ctx, canal.canal_id, antes, cont);
        continue;
      }
      // reserva: número sem nx_canais → caminho antigo por nx_clientes.wa_phone_number_id (só leads)
      const msgs = Array.isArray(v.messages) ? v.messages : [];
      if (!msgs.length) continue;
      // plano 1000 (SV-013): medida do caminho antigo antes de desligá-lo (critério em docs/orbita/DEPLOY-FUNCOES.md)
      cont.caminho_antigo = (cont.caminho_antigo || 0) + msgs.length;
      log("info", "webhook_caminho_antigo", { fn: "nx-whatsapp", caminho: "antigo", pid: anonId(pid), n: msgs.length });
      try { await processarMensagens(db, v, msgs, clientes, cont, ctx); }
      catch (e) { ctx.falhou(e); }
    }
  }
  if (recibos.length) {
    cont.recibos = {};
    await processarStatuses(db, cfg, recibos, cont, ctx);
  }
  const fila = ctx.filaIds;
  ctx.filaIds = null;
  if (fila.length) ctx.emSegundoPlano(enviarFila(db, { ids: fila }, ctx).catch(e => ctx.falhou(e)));
  return cont;
}

/** plano 1500c · SC-023: intervalo mínimo entre duas releituras do segredo do mesmo canal por assinatura que não conferiu. */
export const RELER_SEGREDO_MS = 60_000;
const RELIDO = new WeakMap();   // fetch → Map(canal → ms da última releitura) (o fetch separa os testes, como os caches)
function podeReler(f, chave, agoraMs) {
  let m = RELIDO.get(f);
  if (!m) { m = new Map(); RELIDO.set(f, m); }
  const ultima = m.get(chave);
  if (ultima != null && agoraMs - ultima < RELER_SEGREDO_MS && agoraMs >= ultima) return false;
  if (m.size > 1000) m.clear();
  m.set(chave, agoraMs);
  return true;
}

const texto = (t, status) => new Response(t, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
// chave pública do canal (?c=): hex gerado pelo banco — nx_canais.chave_publica = encode(gen_random_bytes(12), 'hex'), 24 caracteres.
// Plano 1000 (SV-015): só esse comprimento (antes 8 a 64): chave curta virava consulta ao banco e encurtava a adivinhação
export const CHAVE_OK = /^[0-9a-f]{24}$/i;

/** ?c=<chave> → canal (nx_wa_canal) ou null. Chave com formato errado nem consulta o banco. Cache do isolate (SV-004): `forcar`
    relê (segredo/verify token do canal podem ter acabado de mudar). */
async function canalDaUrl(db, u, f, { forcar = false, agoraMs = Date.now() } = {}) {
  const c = u.searchParams.get("c");
  if (c == null) return { tem: false, canal: null };
  if (!CHAVE_OK.test(c)) return { tem: true, canal: null };
  const { canal, doCache } = await canalComCache(f, `c:${c.toLowerCase()}`, async () => {
    const k = await db.rpc("nx_wa_canal", { p_chave: c });
    return k && k.canal_id ? k : null;
  }, { forcar, agoraMs });
  return { tem: true, canal, doCache };
}

/**
 * GET: verificação do webhook (hub.challenge). POST: mensagens e recibos, com assinatura da Meta.
 * Sem ?c=: app da Nexus (segredo e verify token globais), como antes. Com ?c=<chave>: URL de UM
 * número de cliente (verify token do canal; segredo = app secret do canal ?? o global).
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number, esperar?: (ms: number) => Promise<void>,
 *          emSegundoPlano?: (p: Promise<any>) => void, drenagem?: {prazoMs?: number, teto?: number}}} [deps]
 *        emSegundoPlano: EdgeRuntime.waitUntil no index.ts; sem ele, a mídia e a fila rodam antes da resposta.
 *        drenagem: prazo/teto absoluto do descarte do corpo (comum.js; só os testes mudam).
 */
export function tratar(req, env, deps = {}) {
  // o corpo que não foi lido (GET/PUT, falha antes da leitura) é drenado antes da resposta
  return soltandoCorpo(req, () => tratarWebhook(req, env, deps), deps.drenagem);
}

async function tratarWebhook(req, env, deps) {
  const f = deps.fetch || globalThis.fetch;
  try {
    const db = criarDb(env, f);
    const u = new URL(req.url);

    const agoraMs = agoraDe(deps).getTime();
    if (req.method === "GET") {
      let url = await canalDaUrl(db, u, f, { agoraMs });
      let esperado;
      const pedido = u.searchParams.get("hub.verify_token");
      if (url.tem) {
        esperado = url.canal?.verify_token;
        // canal do cache e token que não confere: o verify token pode ter acabado de mudar — relê uma vez
        if (url.doCache && !(esperado && iguaisSeguro(pedido, esperado))) { url = await canalDaUrl(db, u, f, { forcar: true, agoraMs }); esperado = url.canal?.verify_token; }
      } else {
        const c1 = await configWebhook(db, f);
        esperado = c1.cfg?.wa_verify_token;
        // token trocado agora há pouco: o cache pode estar velho — relê uma vez
        if (c1.doCache && !(esperado && iguaisSeguro(pedido, esperado))) esperado = (await configWebhook(db, f, { forcar: true })).cfg?.wa_verify_token;
      }
      const ok = u.searchParams.get("hub.mode") === "subscribe" && esperado && iguaisSeguro(pedido, esperado);
      return ok ? texto(u.searchParams.get("hub.challenge") ?? "", 200) : texto("proibido", 403);
    }
    if (req.method !== "POST") return texto("método não permitido", 405);

    // corpo com teto ANTES de tudo (banco, assinatura): acima de 2 MiB o resto é drenado e
    // descartado e sai 413; a assinatura só é conferida sobre o corpo cru inteiro dentro do limite
    let cru;
    try { cru = await lerCorpoLimitado(req, MAX_CORPO_WEBHOOK, deps.drenagem); }
    catch (e) { return e instanceof CorpoGrande ? texto("corpo grande demais", 413) : texto("corpo inválido", 400); }
    let url = await canalDaUrl(db, u, f, { agoraMs });
    // canal desconhecido vindo do cache negativo (30 s): o canal pode ter acabado de ser criado — relê uma vez
    if (url.tem && !url.canal && url.doCache) url = await canalDaUrl(db, u, f, { forcar: true, agoraMs });
    if (url.tem && !url.canal) return texto("canal desconhecido", 401);
    const assinatura = req.headers.get("x-hub-signature-256");
    const conferir = async c => {
      const segredo = (url.canal && url.canal.app_secret) || c?.meta_app_secret;
      return !!(c && segredo && await assinaturaValida(segredo, cru, assinatura));
    };
    let { cfg, doCache } = await configWebhook(db, f);
    let valida = await conferir(cfg);
    // com o valor do cache a assinatura não confere: o segredo pode ter acabado de mudar — relê UMA vez (config e canal)
    // plano 1500c · SC-023: no máximo uma releitura por canal a cada RELER_SEGREDO_MS — POSTs forjados em massa não viram
    // leituras do banco (antes cada assinatura errada descartava o cache e relia config + canal)
    if (!valida && (doCache || url.doCache) && assinatura && podeReler(f, url.canal?.canal_id ?? (url.tem ? "url" : "global"), agoraMs)) {
      if (url.doCache) url = await canalDaUrl(db, u, f, { forcar: true, agoraMs });
      if (url.tem && !url.canal) return texto("canal desconhecido", 401);
      if (doCache) cfg = (await configWebhook(db, f, { forcar: true })).cfg;
      valida = await conferir(cfg);
    }
    if (!valida) return texto("assinatura inválida", 401);

    // Assinatura válida: falha de persistência pede retry da Meta; as RPCs envolvidas são idempotentes.
    let corpo;
    try { corpo = JSON.parse(new TextDecoder().decode(cru), semNul); } catch { return json({ ok: true, ignorado: "corpo não é JSON" }); }
    const agora = agoraDe(deps);
    const erros = [];
    const pendentes = [];
    const ctx = {
      agora, hoje: hojeSP(agora), dono: crypto.randomUUID(), env, fetch: f, relogioMs: () => agoraMs,
      porCanal: new Map(),   // plano 1000 (SV-012): contagem desta requisição por canal (nx_canal_contar no fim)
      rede: comPrazo(f, deps.prazoRede ?? PRAZO_ENVIO_MS),
      // mídia recebida (até 16 MB) baixa em segundo plano: prazo maior que o do envio
      redeMidia: comPrazo(f, deps.prazoMidia ?? PRAZO_MIDIA_MS),
      esperar: deps.esperar || (ms => new Promise(r => setTimeout(r, ms))),
      persistenciaFalhou: false,
      falhou: e => {
        const m = limparErro(e?.message || e); erros.push(m);
        if (e?.banco) ctx.persistenciaFalhou = true;
        log("erro", "webhook_falha", { fn: "nx-whatsapp", codigo: e?.codigo || null, banco: !!e?.banco, erro: m });
      },
      canalUrl: url.canal,
      assinadoGlobal: !url.tem,
    };
    ctx.emSegundoPlano = p => {
      const seguro = Promise.resolve(p).catch(e => ctx.falhou(e));
      if (deps.emSegundoPlano) deps.emSegundoPlano(seguro); else pendentes.push(seguro);
    };
    try {
      const cont = await processar(db, cfg, corpo, ctx);
      if (pendentes.length) await Promise.allSettled(pendentes);
      const status = ctx.persistenciaFalhou ? 503 : 200;
      await contarCanais(db, ctx, status);
      return json({ ok: status === 200, retry: status !== 200, ...cont, ...(erros.length ? { erros: erros.length, erro: erros[0] } : {}) }, status);
    } catch (e) {
      ctx.falhou(e);
      if (pendentes.length) await Promise.allSettled(pendentes);
      const retry = ctx.persistenciaFalhou;
      return json({ ok: !retry, retry, erros: erros.length, erro: erros[0] }, retry ? 503 : 200);
    }
  } catch (e) {
    const permanente = Number(e?.status) >= 400 && Number(e?.status) < 500 && e?.banco === false;
    const status = e?.banco === true ? 503 : permanente ? 200 : 500;
    return json({ ok: permanente, retry: status === 503, erro: limparErro(e?.message || e) }, status);
  }
}
