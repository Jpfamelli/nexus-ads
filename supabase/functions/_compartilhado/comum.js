/* ============================================================
   NEXUS ADS — comum.js
   Peças usadas pelos três handlers: resposta JSON, relógio,
   autenticação do cron, leitura do banco no formato do nx_dados.
   ============================================================ */
import { datasetDeLinhas, montar, encurtar, MESES, hojeSP } from "./nucleo.js";

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

/* ------------------------------------------------------------
   Texto e telefone: UMA regra para as 7 funções (plano 100, S-F5/S-F6/B72)
   ------------------------------------------------------------ */

/** Corta em `max` unidades UTF-16 sem partir um par de surrogate: um emoji na posição do corte deixava um code unit
    solto, que o Postgres recusa em jsonb («unsupported Unicode escape sequence») — e a mensagem inteira se perdia.
    O que sai daqui é sempre bem formado (toWellFormed), venha o texto de onde vier. */
export function cortarTexto(v, max) {
  let s = String(v ?? "");
  if (max != null && s.length > max) {
    s = s.slice(0, max);
    const u = s.charCodeAt(s.length - 1);
    if (u >= 0xd800 && u <= 0xdbff) s = s.slice(0, -1);   // high surrogate no fim: a metade do emoji ficou do outro lado do corte
  }
  return typeof s.toWellFormed === "function" && !s.isWellFormed() ? s.toWellFormed() : s;
}

/** Formas do mesmo celular (com/sem 55, com/sem o 9): o WhatsApp às vezes manda números antigos sem o 9
    e o cadastro manual costuma vir sem o 55. Usada pelo webhook da Meta e pelo CodeWords (uma cópia só). */
export function variantesTelefone(tel) {
  const d = soDigitos(tel);
  const v = new Set(d ? [d] : []);
  const nac = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d.length >= 10 && d.length <= 11 ? d : null;
  if (nac) {
    const com9 = nac.length === 10 && /[6-9]/.test(nac[2]) ? `${nac.slice(0, 2)}9${nac.slice(2)}` : null;
    const sem9 = nac.length === 11 && nac[2] === "9" ? `${nac.slice(0, 2)}${nac.slice(3)}` : null;
    for (const n of [nac, com9, sem9]) if (n) { v.add(n); v.add(`55${n}`); }
  }
  return [...v];
}

// DDDs brasileiros em uso: só com um deles um número de 10–11 dígitos ganha o 55 (a mesma lista do banco, S-B5)
const DDDS = new Set(("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 "
  + "51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99").split(" "));
export const dddValido = d => DDDS.has(String(d ?? "").slice(0, 2));

/**
 * Telefone que chega SEM garantia de DDI (API do agente, payload cru do aparelho) → só dígitos, com o 55 quando é
 * brasileiro sem DDI. É a regra de nx_tel_normalizar(p, false) do banco, mais estrita: zero de tronco fora
 * (012 9… → 12 9…); 10–11 dígitos só ganham o 55 com DDD válido E assinante brasileiro (celular 9…, fixo 2–5, celular
 * antigo de 8 dígitos 6–9); o resto (E.164 de outro país, 12–15 dígitos) fica como veio. Sem isso o banco achava o
 * contato pela chave e sobrescrevia o wa_id canônico com o número sem 55 (a resposta saía para um jid inexistente).
 */
export function telefoneBorda(v) {
  let d = soDigitos(v);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12) && d[1] !== "0") d = d.slice(1);
  if ((d.length === 10 || d.length === 11) && dddValido(d)) {
    const a = d[2];
    if ((d.length === 11 && a === "9") || (d.length === 10 && a >= "2" && a <= "9")) return `55${d}`;
  }
  return d;
}

/** Telefone/wamid para o resumo de nx_execucoes e para a resposta do cron (tabela de operação: só o fim do número). */
export const anonTelefone = t => { const d = soDigitos(t); return d.length > 4 ? `${"*".repeat(d.length - 4)}${d.slice(-4)}` : "****"; };
export const anonId = id => (id == null ? null : `${String(id).slice(0, 12)}…`);
/** Lista de enviarParaTodos sem número inteiro nem wamid inteiro (os reais ficam só em wa_ids/wa_ids_template). */
export const anonimizarEnvio = envio => (envio || []).map(e => ({ ...e, destino: anonTelefone(e.destino), ...(e.id != null ? { id: anonId(e.id) } : {}) }));

/** 16 hex aleatórios por chamada: o texto de terceiros (conversa, cadastro, pedido) fica entre essas marcas
    no prompt — é DADO, nunca instrução — e nenhuma marca igual pode aparecer dentro dele. */
export function novoDelimitador() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

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
    .replace(/\bsk-ant-[\w-]{4,}/g, "sk-ant-***")                  // chave da Anthropic (inclusive a copiada num erro)
    .replace(/(x-api-key["']?\s*[=:]\s*["']?)[^&\s)"',]+/gi, "$1***")
    .replace(/\bcw(?:k|otk)-[A-Za-z0-9_-]{4,}/g, "cwk-***")   // chave do CodeWords
    .replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1***")              // segredo da URL do canal CodeWords
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/* ------------------------------------------------------------
   IA (Anthropic): um só padrão para Conversas, automações e relatório (plano 100, S-F14)
   ------------------------------------------------------------ */
export const MODELO_PADRAO = "claude-opus-5-5";
// modelos cujos classificadores podem recusar e que aceitam a reserva do servidor (fallbacks: "default")
export const COM_RESERVA = new Set(["claude-opus-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
// modelos que NÃO aceitam output_config.effort (dariam 400): anteriores ao Opus 4.5, Sonnet 4.5 e Haiku 4.5 —
// inclui os apelidos claude-opus-4-0/4-1 e claude-sonnet-4-0; o Haiku 5.5 aceita effort
export const SEM_EFFORT = /haiku-4-5|haiku-3|sonnet-4-5|sonnet-4-[02]|opus-4-[012]|claude-3/;
/** US$ por milhão de tokens [entrada, saída] (tabela da Anthropic de 06/10/2026). Modelo fora da tabela → custo null:
    número que não se sabe não se inventa. */
export const PRECOS_IA = Object.freeze({
  "claude-fable-5-1": [10, 50], "claude-fable-5": [10, 50], "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25], "claude-opus-4-7": [5, 25], "claude-opus-4-6": [5, 25], "claude-opus-4-5": [5, 25],
  "claude-sonnet-5-5": [2, 10], "claude-sonnet-5": [2, 10], "claude-sonnet-4-6": [3, 15], "claude-sonnet-4-5": [3, 15],
  "claude-haiku-5-5": [0.1, 0.5], "claude-haiku-4-5": [1, 5],
});
/** Custo estimado em US$. Com prompt caching o input tem três preços: o normal, a ESCRITA no cache (1,25×) e a LEITURA
    do cache (0,1×) — usage.input_tokens conta só o primeiro; sem os outros dois o custo e os tokens ficavam abaixo do real. 6 casas; null sem preço conhecido ou sem contagem. */
export function custoUsd(modelo, tokensIn, tokensOut, cacheEscrita = 0, cacheLeitura = 0) {
  const chave = Object.keys(PRECOS_IA).find(k => String(modelo ?? "").startsWith(k));
  // sem contagem (null) não há custo a estimar — Number(null) seria 0 e inventaria um valor
  if (!chave || tokensIn == null || tokensOut == null || !Number.isFinite(Number(tokensIn)) || !Number.isFinite(Number(tokensOut))) return null;
  const [pin, pout] = PRECOS_IA[chave];
  const cw = Number(cacheEscrita) || 0, cr = Number(cacheLeitura) || 0;
  return Math.round((Number(tokensIn) * pin + cw * pin * 1.25 + cr * pin * 0.1 + Number(tokensOut) * pout) / 1e6 * 1e6) / 1e6;
}

/**
 * O erro que o ia.js lança («Anthropic ${status}: mensagem do provedor», que pode citar a chave) vira
 * {codigo, mensagem, tentarDeNovo, detalhe, plataforma}. A mensagem original NUNCA é devolvida a quem usa o painel;
 * `detalhe` é só «Anthropic 401», «recusa», «sem_conexao»… `plataforma` = problema da chave/cota da Nexus (não do pedido):
 * quem chama adia em vez de descartar. Única para sugerir/resumir, automações e relatório.
 */
export function traduzirErroIA(e) {
  const s = Number(e?.status) || null;
  const detalhe = s ? `Anthropic ${s}` : undefined;
  const msg = limparErro(e?.message || e);
  if (e?.recusa || /\ba IA recusou\b/i.test(msg)) return { codigo: "ia_indisponivel", mensagem: "A IA recusou este pedido. Escreva de outro jeito e tente de novo.", tentarDeNovo: false, detalhe: "recusa" };
  if (e?.incompleta || /max_tokens/.test(msg)) return { codigo: "ia_indisponivel", mensagem: "A resposta da IA veio incompleta. Tente de novo com uma descrição mais curta.", tentarDeNovo: true, detalhe: "incompleta" };
  if (e?.invalido) return { codigo: "ia_indisponivel", mensagem: "A IA devolveu uma resposta que não consegui ler. Tente de novo.", tentarDeNovo: true, detalhe: "resposta_invalida" };
  if (s === 401 || s === 403) return { codigo: "ia_indisponivel", mensagem: "A chave da IA não foi aceita. Avise a equipe da Nexus.", tentarDeNovo: false, detalhe, plataforma: true };
  if (s === 429) return { codigo: "ia_indisponivel", mensagem: "A IA está recebendo pedidos demais agora. Tente de novo em instantes.", tentarDeNovo: true, detalhe };
  if (s === 529 || (s && s >= 500)) return { codigo: "ia_indisponivel", mensagem: "A IA está fora do ar neste momento. Tente de novo em instantes.", tentarDeNovo: true, detalhe };
  if (s === 408 || s === 409) return { codigo: "ia_indisponivel", mensagem: "A IA demorou demais. Tente de novo em instantes.", tentarDeNovo: true, detalhe };
  if (s && s >= 400) return { codigo: "ia_indisponivel", mensagem: "A IA não aceitou este pedido. Tente com uma descrição diferente.", tentarDeNovo: false, detalhe };
  // «sem resposta» é o prefixo do ia.js quando a API nem respondeu; «Connection error» é o texto do SDK
  if (e?.conexao || /tempo|timeout|time out|timed out|abort|conex|connect|sem resposta|network|socket|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return { codigo: "ia_indisponivel", mensagem: "Não consegui falar com a IA agora. Tente de novo em instantes.", tentarDeNovo: true, detalhe: "sem_conexao" };
  }
  return { codigo: "ia_indisponivel", mensagem: "Não foi possível consultar a IA agora. Tente de novo em instantes.", tentarDeNovo: true };
}

/** Linha de log por chamada à IA (JSON numa linha, sem chave, sem texto de terceiros): ação, cliente, modelo, tokens, ms, resultado. */
export function logIA(dados) {
  try { console.log(JSON.stringify({ ia: true, ...dados })); } catch { /* log nunca derruba a chamada */ }
}

/** Interna que ainda não existe no banco (migração desta rodada não aplicada): o PostgREST responde 404 citando a função. */
export const funcaoAusente = (e, nome) => e?.status === 404 && /PGRST202|Could not find the function|schema cache/i.test(String(e?.message ?? ""))
  && (!nome || String(e?.message ?? "").includes(nome));

// a RPC antiga (5 argumentos) ainda está no ar? depois de um 404 com os argumentos novos não insiste por 10 min
const REGISTRO_IA = { semArgsNovos: 0 };
/**
 * Fecha a reserva de IA (nx_ia_registrar_reserva) com modelo, tokens, ok e — contrato 7 — custo_usd, stop_reason e ms.
 * Manda SEMPRE as 8 chaves (null no que não sabe): a sobrecarga de 8 da 20261008c não tem default, então 8 chaves só casam
 * com ela e 5 só com a antiga. Banco sem a sobrecarga (404) → cai na assinatura de 5 argumentos.
 * Nunca lança (o uso não registrado expira com a reserva em 5 min).
 */
export async function registrarUsoIA(db, { reserva, modelo, tokensIn, tokensOut, ok, stopReason, ms, cacheEscrita = 0, cacheLeitura = 0 }) {
  // tokens de entrada = todos os processados (normal + escrita e leitura do cache)
  const inTotal = tokensIn == null ? null : Number(tokensIn) + (Number(cacheEscrita) || 0) + (Number(cacheLeitura) || 0);
  const base = { p_reserva: reserva, p_modelo: modelo, p_in: inTotal, p_out: tokensOut ?? null, p_ok: !!ok };
  const extra = { p_custo_usd: custoUsd(modelo, tokensIn, tokensOut, cacheEscrita, cacheLeitura), p_stop_reason: stopReason ?? null, p_ms: Number.isFinite(ms) ? Math.round(ms) : null };
  try {
    if (Date.now() >= REGISTRO_IA.semArgsNovos) {
      try { return await db.rpc("nx_ia_registrar_reserva", { ...base, ...extra }); }
      catch (e) { if (!funcaoAusente(e, "nx_ia_registrar_reserva")) throw e; REGISTRO_IA.semArgsNovos = Date.now() + 10 * 60_000; }
    }
    return await db.rpc("nx_ia_registrar_reserva", base);
  } catch (e) {
    console.error("nx_ia_registrar_reserva:", limparErro(e?.message || e));
    return null;
  }
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
   Content-Length declarado acima do teto absoluto: cancela sem ler e responde 413 (melhor esforço) — MEDIDO em
   produção (rodada de 01/10): acima de 16 MiB a resposta NÃO sai de forma confiável (502 do gateway em ~34 s ou sem
   resposta); até 15 MiB o 413 sai em ~1 s. É limite da plataforma (o runtime não solta a resposta sem consumir o
   corpo), RISCO ACEITO e documentado em docs/orbita/estado/F8.md; o teto de corpo de verdade é do gateway.
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

/** Reviver do JSON.parse que tira o caractere NUL (\u0000) e o surrogate solto de TODO texto que chega de fora: o banco recusa os
    dois ("unsupported Unicode escape sequence"), o que virava 500/erro permanente em vez de gravar o resto. */
export const semNul = (_chave, valor) => {
  if (typeof valor !== "string") return valor;
  let v = valor;
  if (v.includes("\u0000")) v = v.replace(/\u0000/g, "");
  if (typeof v.toWellFormed === "function" && !v.isWellFormed()) v = v.toWellFormed();
  return v;
};

/** Corpo JSON do cron (pequeno: {cliente}, {tipo}, {ids:[≤100]}). Acima do teto → 413; ilegível → {}. */
export async function lerCorpo(req, limite = MAX_CORPO_CRON, drenagem = {}) {
  let bytes;
  try { bytes = await lerCorpoLimitado(req, limite, drenagem); }
  catch (e) {
    if (e instanceof CorpoGrande) throw new ErroHttp(413, "corpo grande demais");
    return {};
  }
  try { const c = JSON.parse(new TextDecoder().decode(bytes), semNul); return c && typeof c === "object" ? c : {}; } catch { return {}; }
}

/** nx_config inteira (cron) ou só as colunas pedidas (`colunas`: lista de nomes) — o webhook da Meta, que lê a
    configuração ANTES de conferir a assinatura, pede só o que usa: menos segredo em memória por requisição anônima. */
export async function lerConfig(db, colunas = null) {
  const select = Array.isArray(colunas) && colunas.length ? colunas.join(",") : "*";
  return (await db.select("nx_config", { id: "eq.1", select, limit: 1 }))[0] || null;
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

/** Clientes que o cron processa: ativos E com status ativo ou em teste dentro do prazo (suspenso, cancelado e teste
    vencido ficam de fora — não gastam Meta/Google, IA nem WhatsApp). Com id explícito (botão do painel), aquele
    cliente mesmo se inativo. */
export async function listarClientes(db, clienteId, hoje = hojeSP()) {
  // vertical: o vocabulário dos textos do WhatsApp (paciente × cliente, tratamento × serviço) é o do painel (nucleo.js)
  const cols = "id,slug,nome,ativo,cfg,vertical";
  if (clienteId != null && clienteId !== "") {
    if (!UUID.test(String(clienteId))) throw new ErroHttp(400, "cliente inválido");
    const r = await db.select("nx_clientes", { id: `eq.${clienteId}`, select: cols, limit: 1 });
    if (!r.length) throw new ErroHttp(404, "cliente_nao_encontrado");
    return r;
  }
  return db.select("nx_clientes", {
    ativo: "eq.true", select: cols, order: "nome.asc",
    and: `(status.in.(ativo,teste),or(status.neq.teste,teste_ate.is.null,teste_ate.gte.${hoje}))`,
  });
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

/** Janela de leads do Ads — a MESMA do nx_dados (20261001b §19): data_conversa >= de OR data_consulta >= de OR
    etapa in (nova, agendada). Painel e WhatsApp têm de carregar os mesmos negócios. */
export const filtroLeadsAds = de => `or(data_conversa.gte.${de},data_consulta.gte.${de},etapa.in.(nova,agendada))`;

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
      // o MESMO filtro do nx_dados (painel): conversou ou veio dentro da janela, ou ainda está em nova/agendada —
      // senão o WhatsApp e a tela contariam leads diferentes
      return db.select("nx_leads", {
        cliente_id: `eq.${cliente.id}`, select: COLS_LEADS, order: "id.asc",
        and: `(${filtroLeadsAds(de)},${filtroFunisAds(funis.map(f => f.id))})`,
      });
    })(),
  ]);
  const ds = datasetDeLinhas({
    metricas: metricas.map(metricaCurta), leads,
    cliente: { id: cliente.id, slug: cliente.slug, nome: cliente.nome, cfg: cliente.cfg || {}, vertical: cliente.vertical },
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
  try { const c = JSON.parse(txt || "{}", semNul); if (c && typeof c === "object" && !Array.isArray(c)) return c; } catch { /* abaixo */ }
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
      // 400 permanente do banco sem código conhecido (texto que ele recusa, uuid mal formado...): dado ruim de quem
      // chamou, não falha nossa; e a resposta nunca carrega o nome da RPC interna
      if (e?.status === 400 && e?.banco === false) return respostaErro("dados_invalidos", 400);
      return respostaErro("erro_interno", 500, msg.replace(/\brpc\/[A-Za-z0-9_]+/g, "banco"));
    }
  }, drenagem);
}
