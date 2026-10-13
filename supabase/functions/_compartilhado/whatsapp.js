/* ============================================================
   NEXUS ADS — whatsapp.js
   Envio pela WhatsApp Cloud API com o número da NEXUS
   (nx_config.wa_access_token + wa_phone_number_id).
   ============================================================ */
import { limparErro, cortarTexto, telefoneBorda } from "./comum.js";

export const VERSAO_WA = "v23.0";
const PAINEL_PADRAO = "https://jpfamelli.github.io/nexus-ads/";
const LIMITE = 4096;   // limite de caracteres do texto livre na API

/** 5512977771234 — só dígitos, com país. Sem isso a API recusa o número. Plano 1000 (SV-052): o 55 só entra em número
    BRASILEIRO sem DDI (telefoneBorda: 10–11 dígitos com DDD válido e assinante brasileiro) — gestor nos EUA (+1 415 555 1234,
    11 dígitos) recebia em 5514155551234, número que não existe. */
export function normalizarTelefone(t) {
  return telefoneBorda(t);
}

// plano 1000 (SV-053): cortes sem partir emoji (cortarTexto) — um surrogate solto no corte deixava o JSON malformado, a Graph
// recusava e o relatório/alerta não saía
const cortar = t => { const s = cortarTexto(t); return s.length > LIMITE ? `${cortarTexto(s, LIMITE - 1)}…` : s; };
// parâmetro de template não aceita quebra de linha, tab nem 4+ espaços seguidos
export const paramTemplate = (t, max) => cortarTexto(String(t ?? "").replace(/\s+/g, " ").trim(), max);

/** Plano 1000 (SV-054): partes de no máximo `max` caracteres, cortadas na última quebra de linha (ou espaço) antes do limite;
    sem emoji partido (cortarTexto). Texto curto → [texto]. */
export const BLOCO = 4000;
export function dividirTexto(texto, max = BLOCO) {
  let resto = cortarTexto(texto);
  const out = [];
  while (resto.length > max) {
    let corte = resto.lastIndexOf("\n", max);
    if (corte < max / 2) corte = resto.lastIndexOf(" ", max);
    if (corte < max / 2) corte = cortarTexto(resto, max).length;
    out.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).replace(/^\s+/, "");
  }
  if (resto || !out.length) out.push(resto);
  return out;
}

/** Fora da janela de 24h a API só aceita template (erro 131047 / "re-engagement").
    Vale para o erro síncrono do envio e para o `errors[]` do recibo "failed" do webhook. */
export function foraDaJanela(erro) {
  if (!erro) return false;
  if (Number(erro.code) === 131047) return true;
  return /re-?engagement/i.test(`${erro.title || ""} ${erro.message || ""} ${erro.error_data?.details || ""}`);
}

async function postar(f, cfg, corpo) {
  const r = await f(`https://graph.facebook.com/${VERSAO_WA}/${cfg.wa_phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.wa_access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json().catch(() => ({}));
  return { ok: r.ok && !dados.error, status: r.status, dados };
}

const descrever = res => {
  const e = res.dados?.error || {};
  return `WhatsApp ${res.status}: ${e.message || "falhou"}${e.code ? ` (código ${e.code})` : ""}`;
};

const wamid = res => res.dados?.messages?.[0]?.id ?? null;

/**
 * Manda o template aprovado (nx_config.wa_template) com [título curto, link do painel].
 * Usado quando a janela de 24h está fechada — no envio (erro síncrono) ou depois,
 * pelo webhook, quando o recibo "failed" 131047 chega.
 * @returns {Promise<{via: "template", id: string|null}>}
 */
export async function enviarTemplate(cfg, destino, titulo, { fetch: f = globalThis.fetch } = {}) {
  if (!cfg?.wa_access_token || !cfg?.wa_phone_number_id) throw new Error("whatsapp não configurado");
  if (!cfg.wa_template) throw new Error("modelo (wa_template) não configurado");
  const para = normalizarTelefone(destino);
  if (!para) throw new Error("número de destino vazio");
  const r = await postar(f, cfg, {
    messaging_product: "whatsapp", to: para, type: "template",
    template: {
      name: cfg.wa_template,
      language: { code: "pt_BR" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: paramTemplate(titulo, 60) || "Nexus Ads" },
          { type: "text", text: paramTemplate(cfg.painel_url, 200) || PAINEL_PADRAO },
        ],
      }],
    },
  });
  if (r.ok) return { via: "template", id: wamid(r) };
  throw new Error(descrever(r));
}

/**
 * Manda um texto; se a janela de 24h estiver fechada e houver template
 * configurado, reenvia como template com [título curto, link do painel].
 * @param {object} cfg linha de nx_config
 * @returns {Promise<{via: "texto"|"template", id: string|null}>} id = wamid (o webhook confirma a entrega por ele)
 */
export async function enviarWhatsApp(cfg, destino, texto, { fetch: f = globalThis.fetch, titulo = "Nexus Ads" } = {}) {
  if (!cfg?.wa_access_token || !cfg?.wa_phone_number_id) throw new Error("whatsapp não configurado");
  const para = normalizarTelefone(destino);
  if (!para) throw new Error("número de destino vazio");

  // plano 1000 (SV-054): texto acima do limite vai em várias mensagens (cortadas em quebra de linha), em ordem — antes o fim
  // (link do painel, leitura da IA) sumia num «…»
  const blocos = dividirTexto(texto, BLOCO);
  const r1 = await postar(f, cfg, {
    messaging_product: "whatsapp", to: para, type: "text",
    text: { body: cortar(blocos[0]), preview_url: false },
  });
  if (r1.ok) {
    const ids = [wamid(r1)];
    for (let i = 1; i < blocos.length; i++) {
      const r = await postar(f, cfg, { messaging_product: "whatsapp", to: para, type: "text", text: { body: cortar(blocos[i]), preview_url: false } });
      if (!r.ok) return { via: "texto", id: ids[0], ids: ids.filter(Boolean), parcial: `parte ${i + 1} de ${blocos.length} não saiu: ${limparErro(descrever(r))}` };
      ids.push(wamid(r));
    }
    return blocos.length > 1 ? { via: "texto", id: ids[0], ids: ids.filter(Boolean) } : { via: "texto", id: ids[0] };
  }
  if (!foraDaJanela(r1.dados?.error) || !cfg.wa_template) throw new Error(descrever(r1));

  try { return await enviarTemplate(cfg, para, titulo, { fetch: f }); }
  catch (e) { throw new Error(`fora da janela de 24h e o template falhou — ${e?.message || e}`); }
}

/** Envia para vários destinos; um número quebrado não impede os outros.
    @returns {Promise<Array<{destino, ok: true, via, id} | {destino, ok: false, erro}>>} */
export async function enviarParaTodos(cfg, destinos, texto, opcoes = {}) {
  const vistos = new Set(), saida = [];
  for (const d of destinos || []) {
    const n = normalizarTelefone(d);
    if (!n || vistos.has(n)) continue;
    vistos.add(n);
    try {
      const r = await enviarWhatsApp(cfg, n, texto, opcoes);
      saida.push({ destino: n, ok: true, via: r.via, id: r.id, ...(r.ids ? { ids: r.ids } : {}), ...(r.parcial ? { parcial: r.parcial } : {}) });
    }
    // o erro vai para erro_envio / nx_relatorios.erro (a clínica vê este): sem o token da Nexus,
    // que a Meta devolve inteiro em "Malformed access token EAA…"
    catch (e) { saida.push({ destino: n, ok: false, erro: limparErro(e?.message || e) }); }
  }
  return saida;
}

/** wamids de um envio, separados como o banco guarda: texto → wa_ids, template → wa_ids_template
    (o webhook nunca reenvia o que já saiu como template: é isso que impede laço). */
export function idsDoEnvio(envio) {
  // plano 1000 (SV-054): texto em várias partes guarda TODOS os wamids (o recibo de qualquer parte é achado)
  const de = via => (envio || []).filter(e => e.ok && e.via === via && e.id).flatMap(e => (Array.isArray(e.ids) && e.ids.length ? e.ids : [e.id]).map(String));
  return { wa_ids: de("texto"), wa_ids_template: de("template") };
}

/* ============================================================
   Números dos CLIENTES (nx_canais) — ESPEC §6.3
   Credencial = nx_canal_credencial(canal, cliente): {phone_number_id, waba_id, token}.
   Nada aqui lança por erro da API: devolve {ok:false, erro:{code, title, message}}
   para quem chamou gravar a mensagem como 'falhou' com o motivo.
   ============================================================ */
const GRAPH = `https://graph.facebook.com/${VERSAO_WA}`;

// motivos mais comuns de recusa, explicados para quem atende (não para programador)
export const DICAS_ENVIO = {
  131047: "mais de 24 h desde a última mensagem do cliente — use um modelo aprovado",
  131026: "o número não pode receber (sem WhatsApp, bloqueou o número da empresa ou aplicativo muito antigo)",
  131051: "tipo de mensagem não suportado",
  131052: "a mídia não pôde ser baixada pelo WhatsApp",
  131053: "a mídia não pôde ser enviada (formato ou tamanho)",
  131056: "muitas mensagens para o mesmo número em pouco tempo — espere um pouco",
  131031: "a conta do WhatsApp deste número está bloqueada",
  131042: "problema de pagamento na conta do WhatsApp (WABA)",
  131049: "a Meta segurou a mensagem para não cansar quem recebe",
  131050: "a pessoa pediu para não receber mensagens desta empresa",
  132000: "o número de parâmetros não bate com o modelo",
  132001: "o modelo não existe ou não está aprovado neste idioma",
  190: "token vencido ou revogado — refaça em Números de WhatsApp",
  100: "parâmetro inválido",
  10: "o token não tem permissão para este número",
  200: "o token não tem permissão para este número",
  368: "conta temporariamente bloqueada pela Meta",
};

/** Erro da Graph API → {code, title, message} curto e sem token. */
export function erroGraph(dados, status) {
  const e = dados?.error || {};
  const code = e.code != null && e.code !== "" ? e.code : status || "?";
  const title = String(e.error_user_title || e.title || e.message || "falhou").replace(/\s+/g, " ").trim().slice(0, 160);
  const detalhe = String(e.error_data?.details || e.error_user_msg || "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { code, title: limparErro(title), message: limparErro(detalhe || title) };
}

/** "WhatsApp não aceitou (código 190): Invalid OAuth… — token vencido ou revogado — refaça em Números de WhatsApp" */
export function textoFalhaCanal(e) {
  const codigo = e?.code != null && e.code !== "" ? e.code : "?";
  const titulo = limparErro(String(e?.title || e?.message || "falhou").replace(/\s+/g, " ").trim()).slice(0, 120);
  const dica = DICAS_ENVIO[Number(codigo)] || (foraDaJanela(e) ? DICAS_ENVIO[131047] : "");
  return `WhatsApp não aceitou (código ${codigo}): ${titulo}${dica ? ` — ${dica}` : ""}`.slice(0, 500);
}

async function pedirGraph(f, cred, metodo, caminho, corpo) {
  const envio = metodo === "POST" && corpo?.to != null;
  let r;
  try {
    r = await f(`${GRAPH}/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${cred?.token ?? ""}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    const m = limparErro(e?.message || e);
    return { ok: false, status: 0, dados: null, ambigua: envio, erro: { code: "rede", title: m, message: m } };
  }
  let dados;
  try { dados = await r.json(); }
  catch (e) {
    const m = limparErro(e?.message || "resposta inválida da Meta");
    return { ok: false, status: r.status, dados: null,
      ambigua: envio && (r.ok || r.status === 408 || r.status === 425 || r.status >= 500),
      erro: { code: "resposta_invalida", title: m, message: m } };
  }
  const ok = r.ok && !dados?.error;
  const ambigua = envio && (r.status === 408 || r.status === 425 || r.status >= 500);
  return { ok, status: r.status, dados, ambigua, erro: ok ? null : erroGraph(dados, r.status) };
}

/** POST /{phone_number_id}/messages. @returns {ok, wamid, erro, dados} */
export async function enviarGraph(cred, corpo, { fetch: f = globalThis.fetch } = {}) {
  if (!cred?.token || !cred?.phone_number_id) {
    return { ok: false, wamid: null, erro: { code: "sem_token", title: "número sem token", message: "número sem token" } };
  }
  const r = await pedirGraph(f, cred, "POST", `${encodeURIComponent(cred.phone_number_id)}/messages`,
    { messaging_product: "whatsapp", recipient_type: "individual", ...corpo });
  return { ok: r.ok, wamid: r.ok ? (r.dados?.messages?.[0]?.id ?? null) : null, ambigua: r.ambigua === true,
    erro: r.erro, dados: r.dados };
}

const contexto = respondeA => (respondeA ? { context: { message_id: String(respondeA) } } : {});

export function enviarTextoCanal(cred, para, texto, { respondeA, fetch } = {}) {
  return enviarGraph(cred, { to: String(para), type: "text", text: { body: cortar(texto), preview_url: true }, ...contexto(respondeA) }, { fetch });
}

/** tipo = image|video|audio|document; áudio não aceita legenda. */
export function enviarMidiaCanal(cred, para, { tipo, link, legenda, nome }, { respondeA, fetch } = {}) {
  const m = { link };
  if (legenda && tipo !== "audio") m.caption = cortarTexto(legenda, 1024);
  if (tipo === "document" && nome) m.filename = cortarTexto(nome, 240);
  return enviarGraph(cred, { to: String(para), type: tipo, [tipo]: m, ...contexto(respondeA) }, { fetch });
}

/** Placeholders do corpo na ordem ({{1}}, {{2}} … ou {{nome}} na ordem em que aparecem), sem repetir. */
export function parametrosDoCorpo(corpo) {
  const vistos = [];
  for (const m of String(corpo ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!vistos.includes(m[1])) vistos.push(m[1]);
  const pos = vistos.filter(x => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  return pos.length ? pos.map(String) : vistos;
}

/** Corpo do modelo com os parâmetros aplicados (é o texto gravado na conversa). Plano 1000 (SV-210): cada parâmetro com a MESMA
    normalização do envio (paramTemplate: sem quebra de linha nem espaços repetidos; vazio → «-») — a conversa mostra o que o
    cliente recebeu. */
export function aplicarParametros(corpo, parametros) {
  const nomes = parametrosDoCorpo(corpo);
  const valor = new Map(nomes.map((n, i) => [n, paramTemplate(parametros?.[i], 1000) || "-"]));
  return String(corpo ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, n) => (valor.has(n) ? valor.get(n) : m));
}

/** Modelo aprovado: {nome, idioma, corpo, parametros:[texto]} — parâmetros nomeados levam parameter_name. */
export function enviarTemplateCanal(cred, para, { nome, idioma, corpo, parametros = [] }, { fetch } = {}) {
  const nomes = parametrosDoCorpo(corpo);
  const nomeados = nomes.length > 0 && nomes.some(n => !/^\d+$/.test(n));
  const params = (parametros || []).map((p, i) => ({
    type: "text", text: paramTemplate(p, 1000) || "-", ...(nomeados && nomes[i] ? { parameter_name: nomes[i] } : {}),
  }));
  return enviarGraph(cred, {
    to: String(para), type: "template",
    template: { name: nome, language: { code: idioma || "pt_BR" }, ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}) },
  }, { fetch });
}

/** Confirmação de leitura para o cliente. */
export async function marcarLido(cred, wamid, { fetch: f = globalThis.fetch } = {}) {
  if (!cred?.token || !cred?.phone_number_id || !wamid) return { ok: false };
  const r = await pedirGraph(f, cred, "POST", `${encodeURIComponent(cred.phone_number_id)}/messages`,
    { messaging_product: "whatsapp", status: "read", message_id: String(wamid) });
  return { ok: r.ok, erro: r.erro };
}

/** GET /{phone_number_id}?fields=display_phone_number,verified_name,quality_rating */
export async function infoNumero(cred, { fetch: f = globalThis.fetch } = {}) {
  const r = await pedirGraph(f, cred, "GET", `${encodeURIComponent(cred.phone_number_id)}?fields=display_phone_number,verified_name,quality_rating`);
  return r.ok
    ? { ok: true, numero: r.dados?.display_phone_number ?? null, nome_verificado: r.dados?.verified_name ?? null, qualidade: r.dados?.quality_rating ?? null }
    : { ok: false, erro: r.erro };
}

/** GET /{waba_id}/subscribed_apps → inscrito = data.length > 0 */
export async function appsInscritos(cred, { fetch: f = globalThis.fetch } = {}) {
  const r = await pedirGraph(f, cred, "GET", `${encodeURIComponent(cred.waba_id)}/subscribed_apps`);
  return r.ok ? { ok: true, inscrito: Array.isArray(r.dados?.data) && r.dados.data.length > 0 } : { ok: false, erro: r.erro };
}

/** POST /{waba_id}/subscribed_apps — inscreve o app dono do token na WABA (sem isso nenhum evento chega). */
export async function inscreverApp(cred, { fetch: f = globalThis.fetch } = {}) {
  const r = await pedirGraph(f, cred, "POST", `${encodeURIComponent(cred.waba_id)}/subscribed_apps`);
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/** GET /{waba_id}/message_templates (até 5 páginas de 100). */
export async function listarTemplates(cred, { fetch: f = globalThis.fetch, paginas = 5 } = {}) {
  const lista = [];
  const base = `${encodeURIComponent(cred.waba_id)}/message_templates?fields=name,language,category,status,components&limit=100`;
  let caminho = base;
  for (let i = 0; i < paginas && caminho; i++) {
    const r = await pedirGraph(f, cred, "GET", caminho);
    if (!r.ok) return { ok: false, erro: r.erro, lista };
    lista.push(...(Array.isArray(r.dados?.data) ? r.dados.data : []));
    const depois = r.dados?.paging?.cursors?.after;
    caminho = r.dados?.paging?.next && depois ? `${base}&after=${encodeURIComponent(depois)}` : null;
  }
  return { ok: true, lista, completo: !caminho };
}

/** GET /{media_id} → {url, mime, tamanho} (mídia recebida). */
export async function infoMidia(cred, mediaId, { fetch: f = globalThis.fetch } = {}) {
  const r = await pedirGraph(f, cred, "GET", encodeURIComponent(mediaId));
  return r.ok ? { ok: true, url: r.dados?.url, mime: r.dados?.mime_type, tamanho: Number(r.dados?.file_size) || null, sha256: r.dados?.sha256 || null } : { ok: false, erro: r.erro };
}
