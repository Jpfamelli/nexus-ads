/* ============================================================
   NEXUS ADS — ia.js
   Único módulo que importa o SDK da Anthropic. Só é carregado por
   import dinâmico no relatorio.js e no index.ts da nx-ia, quando há
   chave configurada — por isso os outros módulos rodam no Node
   (testes) sem o SDK.
   Modelo padrão, reserva de modelo e lista «sem effort» vêm do comum.js
   (um padrão só para Conversas, automações e relatório). Toda resposta
   devolve também stop_reason e a latência (ms) — contrato 7 (nx_ia_uso).
   `blocos` no lugar de `sistema` liga o prompt caching: o bloco fixo
   (catálogo, regras) ganha cache_control e a parte variável vem depois.
   ============================================================ */
import Anthropic from "npm:@anthropic-ai/sdk";
import { MODELO_PADRAO, COM_RESERVA, SEM_EFFORT } from "./comum.js";

const BETA_RESERVA = "server-side-fallback-2026-07-01";

const SISTEMA = {
  diario: [
    "Você é o gestor de tráfego pago da Nexus, agência de marketing de Taubaté (SP).",
    "Escreve a \"Leitura do dia\" que fecha o relatório diário de uma clínica e que o dono lê no WhatsApp.",
    "Você recebe os números crus em JSON: ontem, últimos 7 dias, semana anterior, mês, campanhas, consultório e alertas do radar.",
    "Escreva em português do Brasil, no máximo 4 linhas curtas, cada uma começando com \"• \" no formato: fato + causa provável + o que fazer.",
    "Cite os números (R$, %, quantidades). Priorize o que custa dinheiro agora. Interprete; não repita a tabela que o dono já leu acima.",
    "Sem saudação, despedida ou título. Formatação: no máximo *negrito* do WhatsApp (um asterisco de cada lado).",
    "Se estiver tudo estável, escreva uma única linha dizendo isso e não invente problema.",
  ].join(" "),
  mensal: [
    "Você é o gestor de tráfego pago da Nexus, agência de marketing de Taubaté (SP).",
    "Escreve a seção \"Para o próximo mês\" do resumo mensal que o dono de uma clínica lê no WhatsApp.",
    "Você recebe os números crus em JSON; `mes_do_relatorio` é o mês que o resumo fecha.",
    "Escreva em português do Brasil 2 a 3 linhas, cada uma começando com \"• \" e trazendo uma ação concreta para o próximo mês.",
    "Use linguagem de quem não é do marketing: nada de siglas como CPA, CTR, CPM ou ROAS.",
    "Sem saudação, despedida ou título. Formatação: no máximo *negrito* do WhatsApp (um asterisco de cada lado).",
  ].join(" "),
};

/** `system` do pedido: texto, ou blocos [{texto, cache}] — o bloco marcado ganha cache_control (prompt caching). */
function montarSystem(sistema, blocos) {
  const lista = Array.isArray(blocos) ? blocos.filter(b => b && String(b.texto ?? "").trim()) : [];
  if (!lista.length) return sistema;
  return lista.map(b => ({ type: "text", text: String(b.texto), ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}) }));
}

/** Erro da API → Error com .status (HTTP) e .conexao (sem resposta); o resto segue como veio. */
function erroDaApi(e) {
  if (!(e instanceof Anthropic.APIError)) return e;
  const erro = new Error(`Anthropic ${e.status ?? "sem resposta"}: ${e.message}`);
  erro.status = e.status ?? null;
  erro.conexao = e.status == null;
  return erro;
}

/** Uma chamada (com a reserva de modelo quando o modelo aceita); devolve {resp, ms}. */
async function chamar(client, model, pedido) {
  const t0 = Date.now();
  try {
    const resp = COM_RESERVA.has(model)
      ? await client.beta.messages.create({ ...pedido, betas: [BETA_RESERVA], fallbacks: "default" })
      : await client.messages.create(pedido);
    return { resp, ms: Date.now() - t0 };
  } catch (e) { throw erroDaApi(e); }
}

const textoDe = resp => (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
const tokens = (resp, k) => (Number.isFinite(resp.usage?.[k]) ? resp.usage[k] : null);
function erroRecusa(resp) {
  const cat = resp.stop_details?.category;
  const erro = new Error(`a IA recusou o pedido${cat ? ` (${cat})` : ""}`);
  erro.recusa = true;
  return erro;
}

/**
 * @param {object} o
 * @param {string} o.chave     nx_config.anthropic_api_key
 * @param {string} [o.modelo]  nx_config.modelo_ia
 * @param {"diario"|"mensal"} o.tipo
 * @param {object} o.contexto  números crus (M.contextoIA)
 * @returns {Promise<string>} texto da leitura — lança erro em falha ou recusa
 */
export async function leituraIA({ chave, modelo, tipo = "diario", contexto, prazoMs = 60_000 }) {
  const model = modelo || MODELO_PADRAO;
  // A Edge Function tem teto de tempo de parede: 1 retentativa de 60 s no máximo. Com prazo menor (o relatório dá ~25 s por
  // cliente) a chamada é CORTADA no prazo e sem retentativa: antes o relatório desistia da leitura e o SDK seguia pagando.
  const curto = Number.isFinite(prazoMs) && prazoMs > 0 && prazoMs < 60_000;
  const client = new Anthropic({ apiKey: chave, timeout: curto ? Math.max(1_000, Math.floor(prazoMs)) : 60_000, maxRetries: curto ? 0 : 1 });
  const pedido = {
    model,
    max_tokens: 16000,
    system: SISTEMA[tipo] || SISTEMA.diario,
    messages: [{ role: "user", content: JSON.stringify(contexto) }],
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config = { effort: "medium" };
  const { resp } = await chamar(client, model, pedido);
  if (resp.stop_reason === "refusal") throw erroRecusa(resp);
  const texto = textoDe(resp);
  if (!texto) throw new Error(`a IA não devolveu texto (stop_reason: ${resp.stop_reason})`);
  return texto;
}

/**
 * Pergunta curta para o assistente das Conversas (nx-ia): sugerir resposta / resumir.
 * Humano sempre revisa: quem chama nunca envia o texto sozinho.
 * @param {object} o
 * @param {string} o.chave     nx_config.anthropic_api_key
 * @param {string} [o.modelo]  nx_config.modelo_ia (padrão MODELO_PADRAO do comum.js)
 * @param {string} o.sistema   instruções (a conversa real vai no user, entre delimitadores)
 * @param {Array<{texto: string, cache?: boolean}>} [o.blocos] system em blocos (prompt caching) no lugar de `sistema`
 * @param {string} o.usuario   a conversa
 * @param {number} [o.maxTokens]
 * @param {"low"|"medium"|"high"} [o.esforco]
 * @returns {Promise<{texto: string, modelo: string, tokens_in: number|null, tokens_out: number|null, stop_reason: string|null, ms: number}>}
 *          lança erro (com .status/.conexao/.recusa/.incompleta) em falha da API ou recusa — quem chama traduz (traduzirErroIA)
 */
export async function perguntarClaude({ chave, modelo, sistema, blocos, usuario, maxTokens = 4000, esforco = "low", timeoutMs = 45_000, retentativas = 1 }) {
  const model = modelo || MODELO_PADRAO;
  // o atendente está esperando: uma retentativa curta no máximo
  const client = new Anthropic({ apiKey: chave, timeout: timeoutMs, maxRetries: retentativas });
  const pedido = {
    model,
    max_tokens: maxTokens,
    system: montarSystem(sistema, blocos),
    messages: [{ role: "user", content: usuario }],
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config = { effort: esforco };
  const { resp, ms } = await chamar(client, model, pedido);
  if (resp.stop_reason === "refusal") throw erroRecusa(resp);
  const texto = textoDe(resp);
  if (!texto) {
    const erro = new Error(`a IA não devolveu texto (stop_reason: ${resp.stop_reason})`);
    erro.incompleta = resp.stop_reason === "max_tokens";
    throw erro;
  }
  return {
    texto,
    modelo: resp.model || model,
    tokens_in: tokens(resp, "input_tokens"),
    tokens_cache_escrita: tokens(resp, "cache_creation_input_tokens"),
    tokens_cache_leitura: tokens(resp, "cache_read_input_tokens"),
    tokens_out: tokens(resp, "output_tokens"),
    stop_reason: resp.stop_reason ?? null,
    ms,
  };
}

/**
 * Pergunta com SAÍDA ESTRUTURADA (automações: montar a partir da descrição e decidir etapa/resumo/nota).
 * `output_config.format` com JSON Schema (nunca tool_choice forçado nem prefill: dão 400 no Opus 5.5) e o
 * mesmo reserva de modelo do perguntarClaude. Quem chama valida o JSON de novo: o schema garante a forma,
 * não os limites (tamanho, faixa) nem que os ids sejam do cliente.
 * Erros viram `Error` com `.status` (HTTP da API), `.conexao`, `.recusa`, `.incompleta` ou `.invalido` — quem
 * chama traduz para o usuário (a mensagem original pode citar a chave: nunca é mostrada).
 * @param {object} o
 * @param {string} o.chave    nx_config.anthropic_api_key
 * @param {string} [o.modelo] nx_config.modelo_ia (padrão MODELO_PADRAO do comum.js)
 * @param {string} o.sistema  instruções
 * @param {Array<{texto: string, cache?: boolean}>} [o.blocos] system em blocos (prompt caching) no lugar de `sistema`
 * @param {string} o.usuario  o pedido (dados de terceiros entre marcas aleatórias)
 * @param {object} o.schema   JSON Schema do objeto de saída (additionalProperties:false em todo objeto)
 * @param {number} [o.maxTokens]
 * @param {"low"|"medium"|"high"} [o.esforco]
 * @param {number} [o.timeoutMs]
 * @param {number} [o.retentativas] retentativas do SDK em 408/429/5xx/rede (padrão 1)
 * @returns {Promise<{json: object, texto: string, modelo: string, tokens_in: number|null, tokens_out: number|null, stop_reason: string|null, ms: number}>}
 */
export async function estruturarClaude({ chave, modelo, sistema, blocos, usuario, schema, maxTokens = 4000, esforco = "low", timeoutMs = 45_000, retentativas = 1 }) {
  const model = modelo || MODELO_PADRAO;
  // timeout × (retentativas + 1) tem de caber no teto de tempo da Edge Function (~150 s)
  const client = new Anthropic({ apiKey: chave, timeout: timeoutMs, maxRetries: retentativas });
  const pedido = {
    model,
    max_tokens: maxTokens,
    system: montarSystem(sistema, blocos),
    messages: [{ role: "user", content: usuario }],
    output_config: { format: { type: "json_schema", schema } },
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config.effort = esforco;
  const { resp, ms } = await chamar(client, model, pedido);
  if (resp.stop_reason === "refusal") throw erroRecusa(resp);
  if (resp.stop_reason === "max_tokens") {
    const erro = new Error("a resposta da IA veio incompleta (max_tokens)");
    erro.incompleta = true;
    throw erro;
  }
  const texto = textoDe(resp);
  let json;
  try { json = JSON.parse(texto); } catch { json = undefined; }
  if (json === undefined || json === null || typeof json !== "object" || Array.isArray(json)) {
    const erro = new Error(`a IA não devolveu um objeto JSON (stop_reason: ${resp.stop_reason})`);
    erro.invalido = true;
    throw erro;
  }
  return {
    json, texto,
    modelo: resp.model || model,
    tokens_in: tokens(resp, "input_tokens"),
    tokens_cache_escrita: tokens(resp, "cache_creation_input_tokens"),
    tokens_cache_leitura: tokens(resp, "cache_read_input_tokens"),
    tokens_out: tokens(resp, "output_tokens"),
    stop_reason: resp.stop_reason ?? null,
    ms,
  };
}
