/* ============================================================
   NEXUS ADS — ia.js
   Único módulo que importa o SDK da Anthropic. Só é carregado por
   import dinâmico no relatorio.js e no index.ts da nx-ia, quando há
   chave configurada — por isso os outros módulos rodam no Node
   (testes) sem o SDK.
   ============================================================ */
import Anthropic from "npm:@anthropic-ai/sdk";

// modelos cujos classificadores podem recusar: o servidor refaz no modelo reserva
const COM_RESERVA = new Set(["claude-opus-5", "claude-opus-5-5", "claude-fable-5-1"]);
// modelos que não aceitam output_config.effort (dariam 400): anteriores ao Opus 4.5,
// Sonnet 4.5 e Haiku — inclui os apelidos claude-opus-4-0/4-1 e claude-sonnet-4-0
const SEM_EFFORT = /haiku|sonnet-4-5|sonnet-4-[02]|opus-4-[012]|claude-3/;

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

/**
 * @param {object} o
 * @param {string} o.chave     nx_config.anthropic_api_key
 * @param {string} [o.modelo]  nx_config.modelo_ia
 * @param {"diario"|"mensal"} o.tipo
 * @param {object} o.contexto  números crus (M.contextoIA)
 * @returns {Promise<string>} texto da leitura — lança erro em falha ou recusa
 */
export async function leituraIA({ chave, modelo, tipo = "diario", contexto }) {
  const model = modelo || "claude-opus-5";
  // A Edge Function tem teto de tempo de parede: 1 retentativa de 60 s no máximo.
  const client = new Anthropic({ apiKey: chave, timeout: 60_000, maxRetries: 1 });
  const pedido = {
    model,
    max_tokens: 16000,
    system: SISTEMA[tipo] || SISTEMA.diario,
    messages: [{ role: "user", content: JSON.stringify(contexto) }],
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config = { effort: "medium" };

  let resp;
  try {
    resp = COM_RESERVA.has(model)
      ? await client.beta.messages.create({ ...pedido, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(pedido);
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic ${e.status ?? "sem resposta"}: ${e.message}`);
    throw e;
  }

  if (resp.stop_reason === "refusal") {
    const cat = resp.stop_details?.category;
    throw new Error(`a IA recusou o pedido${cat ? ` (${cat})` : ""}`);
  }
  const texto = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!texto) throw new Error(`a IA não devolveu texto (stop_reason: ${resp.stop_reason})`);
  return texto;
}

/**
 * Pergunta curta para o assistente das Conversas (nx-ia): sugerir resposta / resumir.
 * Humano sempre revisa: quem chama nunca envia o texto sozinho.
 * @param {object} o
 * @param {string} o.chave     nx_config.anthropic_api_key
 * @param {string} [o.modelo]  nx_config.modelo_ia (padrão claude-opus-5)
 * @param {string} o.sistema   instruções (a conversa real vai no user, entre delimitadores)
 * @param {string} o.usuario   a conversa
 * @param {number} [o.maxTokens]
 * @param {"low"|"medium"|"high"} [o.esforco]
 * @returns {Promise<{texto: string, modelo: string, tokens_in: number|null, tokens_out: number|null}>}
 *          lança erro em falha da API ou recusa (quem chama traduz para ia_indisponivel)
 */
export async function perguntarClaude({ chave, modelo, sistema, usuario, maxTokens = 4000, esforco = "low" }) {
  const model = modelo || "claude-opus-5";
  // o atendente está esperando: uma retentativa curta no máximo
  const client = new Anthropic({ apiKey: chave, timeout: 45_000, maxRetries: 1 });
  const pedido = {
    model,
    max_tokens: maxTokens,
    system: sistema,
    messages: [{ role: "user", content: usuario }],
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config = { effort: esforco };

  let resp;
  try {
    resp = COM_RESERVA.has(model)
      ? await client.beta.messages.create({ ...pedido, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(pedido);
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic ${e.status ?? "sem resposta"}: ${e.message}`);
    throw e;
  }
  if (resp.stop_reason === "refusal") {
    const cat = resp.stop_details?.category;
    throw new Error(`a IA recusou o pedido${cat ? ` (${cat})` : ""}`);
  }
  const texto = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!texto) throw new Error(`a IA não devolveu texto (stop_reason: ${resp.stop_reason})`);
  return {
    texto,
    modelo: resp.model || model,
    tokens_in: Number.isFinite(resp.usage?.input_tokens) ? resp.usage.input_tokens : null,
    tokens_out: Number.isFinite(resp.usage?.output_tokens) ? resp.usage.output_tokens : null,
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
 * @param {string} [o.modelo] nx_config.modelo_ia (padrão claude-opus-5-5)
 * @param {string} o.sistema  instruções
 * @param {string} o.usuario  o pedido (dados de terceiros entre marcas aleatórias)
 * @param {object} o.schema   JSON Schema do objeto de saída (additionalProperties:false em todo objeto)
 * @param {number} [o.maxTokens]
 * @param {"low"|"medium"|"high"} [o.esforco]
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{json: object, texto: string, modelo: string, tokens_in: number|null, tokens_out: number|null}>}
 */
export async function estruturarClaude({ chave, modelo, sistema, usuario, schema, maxTokens = 4000, esforco = "low", timeoutMs = 45_000 }) {
  const model = modelo || "claude-opus-5-5";
  const client = new Anthropic({ apiKey: chave, timeout: timeoutMs, maxRetries: 1 });
  const pedido = {
    model,
    max_tokens: maxTokens,
    system: sistema,
    messages: [{ role: "user", content: usuario }],
    output_config: { format: { type: "json_schema", schema } },
  };
  if (!SEM_EFFORT.test(model)) pedido.output_config.effort = esforco;

  let resp;
  try {
    resp = COM_RESERVA.has(model)
      ? await client.beta.messages.create({ ...pedido, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(pedido);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const erro = new Error(`Anthropic ${e.status ?? "sem resposta"}: ${e.message}`);
      erro.status = e.status ?? null;
      erro.conexao = e.status == null;
      throw erro;
    }
    throw e;
  }
  if (resp.stop_reason === "refusal") {
    const cat = resp.stop_details?.category;
    const erro = new Error(`a IA recusou o pedido${cat ? ` (${cat})` : ""}`);
    erro.recusa = true;
    throw erro;
  }
  if (resp.stop_reason === "max_tokens") {
    const erro = new Error("a resposta da IA veio incompleta (max_tokens)");
    erro.incompleta = true;
    throw erro;
  }
  const texto = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
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
    tokens_in: Number.isFinite(resp.usage?.input_tokens) ? resp.usage.input_tokens : null,
    tokens_out: Number.isFinite(resp.usage?.output_tokens) ? resp.usage.output_tokens : null,
  };
}
