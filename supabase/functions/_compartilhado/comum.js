/* ============================================================
   NEXUS ADS — comum.js
   Peças usadas pelos três handlers: resposta JSON, relógio,
   autenticação do cron, leitura do banco no formato do nx_dados.
   ============================================================ */
import { datasetDeLinhas, montar, encurtar, MESES } from "./nucleo.js";

export class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

export const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

export function agoraDe(deps) {
  const a = deps && deps.agora;
  const d = typeof a === "function" ? a() : a != null ? new Date(a) : new Date();
  return d instanceof Date ? d : new Date(d);
}

export function somaDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const soDigitos = v => String(v ?? "").replace(/\D/g, "");

/** Comparação em tempo constante (não para no primeiro byte diferente). */
export function iguaisSeguro(a, b) {
  const x = new TextEncoder().encode(String(a ?? "")), y = new TextEncoder().encode(String(b ?? ""));
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0 && x.length > 0;
}

/** Mensagem de erro segura para gravar no banco: sem token e curta.
    O fetch do Deno põe a URL inteira no erro de rede — e a URL do Meta leva access_token.
    O Meta também devolve o token SOLTO no texto ("Malformed access token EAA…"), e esse texto
    vai para nx_integracoes.status e para o aviso de integração — que a conta da clínica enxerga. */
export function limparErro(msg) {
  return String(msg ?? "erro desconhecido")
    .replace(/(access_token=)[^&\s)"']+/gi, "$1***")
    .replace(/(Bearer\s+)[\w.~+/=-]+/gi, "$1***")
    .replace(/((?:client_secret|refresh_token|developer[-_]token|appsecret_proof)["']?\s*[=:]\s*["']?)[^&\s)"',]+/gi, "$1***")
    .replace(/\bEAA[A-Za-z0-9]{16,}/g, "EAA***")          // token do Meta
    .replace(/\bya29\.[\w.-]+/g, "ya29.***")              // access token do Google
    .replace(/(^|[^\w/])1\/\/[\w-]{16,}/g, (_, antes) => `${antes}1//***`)   // refresh token do Google
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "eyJ***")     // JWT (chave service_role antiga)
    .replace(/\bsb_secret_[\w-]+/g, "sb_secret_***")
    .replace(/\bcw(?:k|otk)-[A-Za-z0-9_-]{4,}/g, "cwk-***")   // chave do CodeWords
    .replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1***")              // segredo da URL do canal CodeWords
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export const PRAZO_REDE_MS = 30_000;

/** fetch com prazo para Meta/Google/WhatsApp. Sem isso, uma conexão presa segura a
    execução até a Edge Function ser cortada (150 s) e nenhum cliente é processado. */
export function comPrazo(f, ms = PRAZO_REDE_MS) {
  return async (url, init = {}) => {
    try {
      return await f(url, { ...init, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      if (e?.name !== "TimeoutError" && e?.name !== "AbortError") throw e;
      let host = "servidor";
      try { host = new URL(typeof url === "string" ? url : url.url).host; } catch { /* fica o genérico */ }
      throw new Error(`${host} não respondeu em ${Math.round(ms / 1000)} s`);
    }
  };
}

/* ------------------------------------------------------------
   Corpo da requisição com teto (E2E-meta, bug 1)
   No Edge Runtime do Supabase, responder ANTES de consumir o corpo — com ou sem cancelar o
   leitor — pendura a requisição: o nx-whatsapp "devolvia" 413 para 2 MiB + 1, a resposta
   nunca saía e o gateway dava 503 depois de ~160 s (um worker preso por POST, sem
   autenticação). LER o corpo inteiro funcionou (2.097.152 B → 401 em 0,6 s).
   Regra: acima do teto, DRENAR E DESCARTAR — continuar lendo até o fim só contando bytes
   (nada acumulado), com prazo curto e teto absoluto — e só então responder 413. Estourou o
   prazo ou o teto absoluto: aí sim cancela o leitor e responde (melhor esforço).
   Content-Length declarado acima do teto absoluto: 413 já, sem drenar (melhor esforço).
   Quem responde sem ler o corpo (405/401/429) drena do mesmo jeito (soltandoCorpo).
   ------------------------------------------------------------ */
export class CorpoGrande extends Error {
  constructor(limite) { super(`corpo acima de ${limite} bytes`); this.name = "CorpoGrande"; this.status = 413; this.limite = limite; }
}

/** Prazo da drenagem (desde o começo dela, valendo também para um read() parado). */
export const PRAZO_DRENAR_MS = 10_000;
/** Teto absoluto do corpo inteiro que ainda vale drenar (os tetos de leitura vão até 8 MB). */
export const TETO_DRENAR = 16 * 1024 * 1024;

/** Cancela o corpo que não vai ser lido (ou o leitor que parou no meio). Não espera o
    cancelamento terminar: ele nunca pode segurar a resposta. Corpo já lido/travado: nada a fazer.
    É o último recurso (prazo/teto da drenagem estourados): no Edge Runtime, cancelar sozinho
    não basta para a resposta sair. */
export function soltarCorpo(req, leitor = null) {
  try {
    const alvo = leitor || (req?.body && !req.body.locked ? req.body : null);
    const p = alvo?.cancel?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch { /* nada a soltar */ }
}

/** Content-Length declarado (inteiro ≥ 0) ou null (ausente/ilegível: vale a contagem). */
export function tamanhoDeclarado(req) {
  const v = req.headers.get("content-length");
  if (v == null || !/^\s*\d+\s*$/.test(v)) return null;
  return Number(v);
}

const PRAZO = Symbol("prazo");

/**
 * Lê o resto do corpo e JOGA FORA (só conta bytes), até o fim, para o runtime liberar a
 * resposta. Para no prazo (`prazoMs`, contado do começo da drenagem) ou quando o corpo
 * inteiro passa do teto absoluto (`teto`, contando os `ja` bytes que quem chamou já leu):
 * nesses casos cancela o leitor. Content-Length acima do teto absoluto: cancela sem ler.
 * Sem corpo ou corpo já lido/travado por outro leitor: nada a fazer. Nunca lança.
 * @param {Request} req
 * @param {{leitor?: ReadableStreamDefaultReader, ja?: number, prazoMs?: number, teto?: number}} [o]
 * @returns {Promise<{fim: boolean, bytes: number, motivo?: "prazo"|"teto"|"erro"}>}
 *          fim = o corpo foi lido até o fim; bytes = quanto foi descartado aqui
 */
export async function drenarCorpo(req, { leitor = null, ja = 0, prazoMs = PRAZO_DRENAR_MS, teto = TETO_DRENAR } = {}) {
  if (!leitor) {
    const corpo = req?.body;
    if (!corpo || corpo.locked) return { fim: true, bytes: 0 };
    const declarado = tamanhoDeclarado(req);
    if (declarado != null && declarado > teto) { soltarCorpo(req); return { fim: false, bytes: 0, motivo: "teto" }; }
    try { leitor = corpo.getReader(); } catch { soltarCorpo(req); return { fim: false, bytes: 0, motivo: "erro" }; }
  }
  let total = ja;
  let relogio;
  const estourou = new Promise(r => { relogio = setTimeout(() => r(PRAZO), prazoMs); });
  try {
    for (;;) {
      const r = await Promise.race([leitor.read(), estourou]);
      if (r === PRAZO) { soltarCorpo(req, leitor); return { fim: false, bytes: total - ja, motivo: "prazo" }; }
      if (r.done) return { fim: true, bytes: total - ja };
      total += r.value?.byteLength ?? 0;
      if (total > teto) { soltarCorpo(req, leitor); return { fim: false, bytes: total - ja, motivo: "teto" }; }
    }
  } catch {
    soltarCorpo(req, leitor);
    return { fim: false, bytes: total - ja, motivo: "erro" };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Corpo CRU com teto em bytes (exatamente no teto passa). Acima dele — pelo Content-Length
 * ou pela contagem, sem Content-Length ou com um que mente — o que já foi lido é largado, o
 * resto é DRENADO (drenarCorpo: prazo e teto absoluto) e só então lança CorpoGrande.
 * Nada além do teto fica em memória. A leitura dentro do teto não tem prazo próprio
 * (upload legítimo lento, ex.: mídia de 8 MB pelo celular).
 * @param {{prazoMs?: number, teto?: number}} [drenagem] só os testes mudam
 */
export async function lerCorpoLimitado(req, limite, drenagem = {}) {
  const declarado = tamanhoDeclarado(req);
  if (declarado != null && declarado > limite) { await drenarCorpo(req, drenagem); throw new CorpoGrande(limite); }
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  let partes = [];
  let total = 0;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      partes = null;   // nada acima do teto fica em memória
      await drenarCorpo(req, { ...drenagem, leitor, ja: total });
      throw new CorpoGrande(limite);
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
  return bytes;
}

/** Roda o handler e, antes de a resposta sair, DRENA o corpo que ninguém leu (405/401/429 antes
    da leitura) com o mesmo prazo e teto absoluto. Corpo já lido ou drenado: nada a fazer. */
export async function soltandoCorpo(req, fn, drenagem = {}) {
  try { return await fn(); }
  finally { await drenarCorpo(req, drenagem); }
}

export const MAX_CORPO_CRON = 64 * 1024;

/** Corpo JSON do cron (pequeno: {cliente}, {tipo}, {ids:[≤100]}). Acima do teto → 413; ilegível → {}. */
export async function lerCorpo(req, limite = MAX_CORPO_CRON, drenagem = {}) {
  let bytes;
  try { bytes = await lerCorpoLimitado(req, limite, drenagem); }
  catch (e) {
    if (e instanceof CorpoGrande) throw new ErroHttp(413, "corpo grande demais");
    return {};
  }
  try { const c = JSON.parse(new TextDecoder().decode(bytes)); return c && typeof c === "object" ? c : {}; } catch { return {}; }
}

export async function lerConfig(db) {
  return (await db.select("nx_config", { id: "eq.1", select: "*", limit: 1 }))[0] || null;
}

/** Lê nx_config e confere o header x-nx-cron. Devolve a config ou lança 401. */
export async function autenticarCron(req, db) {
  const recebido = req.headers.get("x-nx-cron");
  if (!recebido) throw new ErroHttp(401, "não autorizado");
  const cfg = await lerConfig(db);
  if (!cfg || !cfg.cron_token || !iguaisSeguro(recebido, cfg.cron_token)) throw new ErroHttp(401, "não autorizado");
  return cfg;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clientes ativos; com id explícito (botão do painel), aquele cliente mesmo se inativo. */
export async function listarClientes(db, clienteId) {
  const cols = "id,slug,nome,ativo,cfg";
  if (clienteId != null && clienteId !== "") {
    if (!UUID.test(String(clienteId))) throw new ErroHttp(400, "cliente inválido");
    const r = await db.select("nx_clientes", { id: `eq.${clienteId}`, select: cols, limit: 1 });
    if (!r.length) throw new ErroHttp(404, "cliente_nao_encontrado");
    return r;
  }
  return db.select("nx_clientes", { ativo: "eq.true", select: cols, order: "nome.asc" });
}

const COLS_METRICAS = "plataforma,nivel,data,campanha_ext,campanha_nome,anuncio_ext,anuncio_nome,impressoes,alcance,frequencia,cliques,gasto,conversoes";
const COLS_LEADS = "id,nome,telefone,origem,plataforma,campanha_ext,anuncio_ext,servico,etapa,data_conversa,data_agenda,data_consulta,valor,obs";

/** Linha de nx_metricas_dia → formato curto de nx_dados.metricas (contrato §3). */
export const metricaCurta = r => ({
  p: r.plataforma, d: String(r.data).slice(0, 10), n: r.nivel,
  c: r.campanha_ext, cn: r.campanha_nome, a: r.anuncio_ext, an: r.anuncio_nome,
  imp: +r.impressoes || 0, alc: +r.alcance || 0, freq: +r.frequencia || 0,
  cli: +r.cliques || 0, g: +r.gasto || 0, conv: +r.conversoes || 0,
});

/** Filtro de funis do Ads (ESPEC §4.11) — o MESMO do nx_dados: negócio sem funil ou num funil
    com conta_no_ads. Sem isso, um negócio do pós-venda entraria no radar e nos relatórios de
    WhatsApp e os números deixariam de bater com o painel. */
export function filtroFunisAds(idsFunis) {
  const ids = (idsFunis || []).filter(Boolean);
  return ids.length ? `or(funil_id.is.null,funil_id.in.(${ids.join(",")}))` : "funil_id.is.null";
}

/** Mesmo dataset que o painel monta a partir do nx_dados. */
export async function carregarModelo(db, cliente, hoje, dias) {
  const de = somaDias(hoje, -dias);
  const [metricas, leads] = await Promise.all([
    db.select("nx_metricas_dia", {
      cliente_id: `eq.${cliente.id}`, data: `gte.${de}`, select: COLS_METRICAS,
      order: "data.asc,plataforma.asc,nivel.asc,campanha_ext.asc,anuncio_ext.asc",
    }),
    (async () => {
      const funis = await db.select("nx_funis", {
        cliente_id: `eq.${cliente.id}`, conta_no_ads: "is.true", select: "id", order: "id.asc",
      });
      // lead que conversou antes da janela mas agendou/veio dentro dela ainda conta no funil
      return db.select("nx_leads", {
        cliente_id: `eq.${cliente.id}`, select: COLS_LEADS, order: "id.asc",
        and: `(or(data_conversa.gte.${de},data_agenda.gte.${de},data_consulta.gte.${de}),${filtroFunisAds(funis.map(f => f.id))})`,
      });
    })(),
  ]);
  const ds = datasetDeLinhas({
    metricas: metricas.map(metricaCurta), leads,
    cliente: { id: cliente.id, slug: cliente.slug, nome: cliente.nome, cfg: cliente.cfg || {} },
    hoje, dias,
  });
  return montar(ds);
}

/** Roda fn sobre os itens com no máximo n ao mesmo tempo, mantendo a ordem. */
export async function emLotes(itens, n, fn) {
  const out = new Array(itens.length);
  let prox = 0;
  const trabalhador = async () => { while (prox < itens.length) { const i = prox++; out[i] = await fn(itens[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return out;
}

/** cfg.waGestor / cfg.waCliente como lista — aceita também uma string "5512…, 5512…". */
export const listaDestinos = v => (Array.isArray(v) ? v : v ? String(v).split(/[,;\n]+/) : [])
  .map(x => String(x ?? "").trim()).filter(Boolean);

/** Texto único do que deu errado no envio (null se ao menos um destino recebeu e nenhum falhou). */
export function erroDeEnvio(destinos, envio) {
  if (!destinos || !destinos.length) return "nenhum número de destino cadastrado";
  if (!envio.length) return "nenhum número de destino válido";
  const falhas = envio.filter(e => !e.ok);
  if (!falhas.length) return null;
  const msgs = [...new Set(falhas.map(e => e.erro))];
  if (msgs.length === 1 && falhas.length === envio.length) return msgs[0];
  return falhas.map(e => `${e.destino}: ${e.erro}`).join("; ");
}

/** Nome curto do cliente, igual ao M.NOME do núcleo (cfg.nomeCurto ou o nome encurtado). */
export const nomeCurto = c => (c?.cfg && c.cfg.nomeCurto) || encurtar(c?.nome || "Cliente", 22) || c?.nome || "Cliente";

/** Título curto dos avisos (vai no template quando a janela de 24h está fechada).
    Ficam aqui porque o webhook precisa refazer o MESMO título ao reenviar como template. */
export const tituloRadar = (nome, n) => `Radar ${nome}: ${n} ${n === 1 ? "alerta novo" : "alertas novos"}`;
export function tituloRelatorio(tipo, nome, referencia) {
  const [, m, d] = String(referencia).slice(0, 10).split("-");
  return tipo === "mensal" ? `Resultados de ${MESES[Number(m) - 1]} · ${nome}` : `Relatório diário ${nome} ${d}/${m}`;
}

/** Modelo sem números (só nome e cfg): dá o texto do aviso quando o radar em si falhou. */
export const modeloVazio = (cliente, hoje) => montar(datasetDeLinhas({
  metricas: [], leads: [], hoje, dias: 7,
  cliente: { id: cliente.id, slug: cliente.slug, nome: cliente.nome, cfg: cliente.cfg || {} },
}));

/**
 * Trava no banco (nx_travas). Cron e botão "Atualizar agora" ao mesmo tempo não podem
 * processar o mesmo cliente duas vezes (alerta e relatório sairiam em dobro).
 * A trava tem prazo: se a função for cortada sem chegar no finally, ela vence sozinha.
 * @returns {Promise<{pulado: true} | {pulado: false, valor: any}>}
 */
export async function comTrava(db, nome, segundos, fn) {
  const dono = crypto.randomUUID();
  const pegou = await db.rpc("nx_trava_pegar", { p_nome: nome, p_segundos: segundos, p_dono: dono });
  if (pegou !== true) return { pulado: true };
  try {
    return { pulado: false, valor: await fn() };
  } finally {
    try { await db.rpc("nx_trava_soltar", { p_nome: nome, p_dono: dono }); }
    catch (e) { console.error(`trava ${nome}:`, limparErro(e?.message || e)); }   // vence sozinha no prazo
  }
}

export const EM_EXECUCAO = "já em execução";

/**
 * Trava POR CLIENTE ('nx-ciclo:<id>', 'nx-relatorio:<tipo>:<id>'). O que não pode acontecer
 * em dobro (alerta, relatório) é sempre de UM cliente; com uma trava geral, o botão de uma
 * clínica apertado às 8h fazia o cron pular TODAS as outras — e o relatório do dia só roda uma vez.
 * Assim: cron e botão no mesmo cliente → um processa, o outro pula só aquele cliente.
 * Erro ao pegar a trava vira erro só deste cliente (aparece em nx_execucoes).
 * @param {object} base campos do resumo deste cliente ({cliente: slug, …})
 */
export async function comTravaDoCliente(db, nome, segundos, base, fn) {
  try {
    const r = await comTrava(db, nome, segundos, fn);
    return r.pulado ? { ...base, ok: true, pulado: EM_EXECUCAO } : r.valor;
  } catch (e) {
    return { ...base, ok: false, erro: limparErro(e?.message || e) };
  }
}

/** Nenhum cliente processado (todos já estavam com outra execução): não é execução de verdade. */
export const todosPulados = resumo => resumo.length > 0 && resumo.every(x => x.pulado === EM_EXECUCAO);

/** @param ms duração medida no relógio real (o `inicio` pode vir do relógio injetado nos testes) */
export async function registrarExecucao(db, { tarefa, inicio, ms, ok, resumo }) {
  try {
    const fim = new Date(inicio.getTime() + ms);
    await db.insert("nx_execucoes", { tarefa, inicio: inicio.toISOString(), fim: fim.toISOString(), ok, resumo }, { retornar: false });
  } catch (e) {
    console.error(`nx_execucoes (${tarefa}):`, limparErro(e.message));
  }
}

/* ============================================================
   Painel do SaaS → Edge Functions (nx-enviar, nx-midia, nx-ia) — ESPEC §6.1
   Token vai no CORPO (não há cookie); toda resposta leva CORS aberto.
   Ordem fixa: autenticar → conferir TODOS os ids pelas internas → só então rede.
   ============================================================ */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

export const respostaPainel = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { "content-type": "application/json; charset=utf-8", ...CORS },
});

/** OPTIONS (preflight do navegador). */
export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Erro com código do Apêndice B e o status HTTP que o front trata igual RPC. */
export class ErroApi extends Error {
  constructor(codigo, status = 400, detalhe) { super(codigo); this.codigo = codigo; this.status = status; this.detalhe = detalhe; }
}

/** {ok:false, erro:<código>, detalhe?} */
export function respostaErro(codigo, status = 400, detalhe) {
  return respostaPainel({ ok: false, erro: codigo, ...(detalhe ? { detalhe: limparErro(detalhe).slice(0, 200) } : {}) }, status);
}

const ACESSO = new Set(["sem_acesso", "sem_permissao", "conta_suspensa", "teste_expirado", "modulo_desligado", "so_plataforma"]);
const SESSAO = new Set(["sessao_invalida", "conta_pendente"]);

/** HTTP do código: sessão 401 · acesso 403 · *_nao_encontrad[oa] 404 · resto (dados) 400. */
export function statusDoCodigo(codigo) {
  if (SESSAO.has(codigo)) return 401;
  if (ACESSO.has(codigo)) return 403;
  if (/_nao_encontrad[oa]$/.test(codigo)) return 404;
  return 400;
}

/** Código do Apêndice B dentro do erro do db.js ("banco 400 em rpc/x: conversa_nao_encontrada"). */
export function codigoBanco(e) {
  const m = String(e?.message ?? "").match(/:\s*([a-z][a-z0-9_]{2,60})\s*$/);
  return m && e?.status >= 400 && e?.status < 500 ? m[1] : null;
}

/** Erro do banco → ErroApi (código conhecido) ou o próprio erro (falha técnica = 500). */
export function erroApiDoBanco(e) {
  if (e instanceof ErroApi) return e;
  const c = codigoBanco(e);
  return c ? new ErroApi(c, statusDoCodigo(c)) : e;
}

/** Interna do banco chamada por handler de painel: erro com código vira ErroApi. */
export async function interna(db, nome, params) {
  try { return await db.rpc(nome, params); }
  catch (e) { throw erroApiDoBanco(e); }
}

// só a forma canônica (minúscula, como o banco devolve): "ABC…" também seria o mesmo cliente para o
// nx_fn_ctx (cast uuid), mas viraria OUTRA pasta no Storage (<ABC…>/out/…) — fora do "ver", do
// "apagar" e da faxina de mídia quando o contato/cliente é excluído
const UUID_CLIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * nx_fn_ctx(token, cliente, papel mínimo) → ctx (JSON do nx_ctx_t) que as internas recebem como p_ctx.
 * Nunca recalcula papel aqui: vale o que o nx_ctx decidiu para ESTE cliente.
 */
export async function autenticarPainel(db, corpo, papelMin = "atendente") {
  const token = typeof corpo?.token === "string" ? corpo.token.trim() : "";
  if (!token || token.length > 400) throw new ErroApi("sessao_invalida", 401);
  const cliente = String(corpo?.cliente ?? "");
  if (!UUID_CLIENTE.test(cliente)) throw new ErroApi("cliente_nao_encontrado", 404);
  const ctx = await interna(db, "nx_fn_ctx", { p_token: token, p_cliente: cliente, p_min: papelMin });
  if (!ctx || typeof ctx !== "object" || !ctx.conta_id) throw new ErroApi("sessao_invalida", 401);
  return ctx;
}

/** Corpo do painel: JSON pequeno (o painel nunca manda arquivo por aqui). Teto em BYTES
    (lerCorpoLimitado): acima dele, o resto é drenado e descartado e sai 413, antes do banco. */
export async function lerCorpoPainel(req, max = 64_000, drenagem = {}) {
  let bytes;
  try { bytes = await lerCorpoLimitado(req, max, drenagem); }
  catch (e) { if (e instanceof CorpoGrande) throw new ErroApi("dados_invalidos", 413); throw e; }
  const txt = new TextDecoder().decode(bytes);
  try { const c = JSON.parse(txt || "{}"); if (c && typeof c === "object" && !Array.isArray(c)) return c; } catch { /* abaixo */ }
  throw new ErroApi("dados_invalidos", 400);
}

/** Envolve um handler de painel: OPTIONS, método, erros → {ok:false, erro}. O corpo que
    não foi lido (OPTIONS, 405, falha antes da leitura) é drenado antes da resposta. */
export async function tratarPainel(req, fn, drenagem = {}) {
  return soltandoCorpo(req, async () => {
    if (req.method === "OPTIONS") return preflight();
    if (req.method !== "POST") return respostaErro("metodo_invalido", 405);
    try {
      return await fn();
    } catch (e) {
      const x = erroApiDoBanco(e);
      if (x instanceof ErroApi) return respostaErro(x.codigo, x.status, x.detalhe);
      const msg = limparErro(e?.message || e);
      console.error("painel:", msg);
      return respostaErro("erro_interno", 500, msg);
    }
  }, drenagem);
}
