/* ============================================================
   ÓRBITA — codewords.js (nx-codewords · docs/orbita/CODEWORDS.md)
   WhatsApp via CodeWords no modelo "aparelho" (o mesmo da IndyCar): o número
   do cliente é um aparelho pareado no whatsapp_device_manager; o aparelho
   entrega as mensagens a UM destino — o fluxo de IA do cliente (rota 'fluxo')
   ou esta função (rota 'direta'). O fluxo chama a "API do agente" do Órbita,
   que grava tudo no CRM/Conversas, decide se a IA responde e entrega o contexto.

   Três portas:
   1. API do agente — POST ?ch=<segredo do canal> (o canal/cliente vêm SÓ do segredo)
   2. Painel — POST {token, cliente, acao, canal}: estado, parear, ligar_fluxo,
      receber_aqui, enviar_teste, receita (todas admin)
   3. Cron — header x-nx-cron {sincronizar:true}: puxa do aparelho o que faltar
      nas conversas com atividade nas últimas 2 h (sem botão na tela)

   Device manager (base CW_BASE, header "Authorization: <cwk crua>", sem Bearer):
   GET /connections · POST /connections {phone_number, service_path?} (90 s) ·
   PUT /connections/{phone_id}/subscribe {service_path} · POST /proxy/send/message?
   phone_id= (form-urlencoded phone+message, 60 s) · GET /proxy/chat/{jid}/messages.
   HTTP 200 NÃO é entrega; timeout/5xx é AMBÍGUO (nunca reenviar sozinho).
   ============================================================ */
import { criarDb } from "./db.js";
import {
  json, limparErro, comPrazo, soDigitos, ErroApi, ErroHttp, respostaPainel, tratarPainel,
  lerCorpoPainel, autenticarPainel, interna, autenticarCron, emLotes,
} from "./comum.js";
import { hojeSP } from "./nucleo.js";
import { montarInstrucoes, montarReceita } from "./codewords_prompt.js";

export const CW_BASE = "https://runtime.codewords.ai/run/whatsapp_device_manager";
export const MAX_CORPO = 64 * 1024;
export const ID_OK = /^[A-Za-z0-9._:=+/@-]{1,160}$/;
export const PRAZOS = { conexoes: 15_000, parear: 90_000, inscrever: 60_000, enviar: 60_000, mensagens: 20_000 };
const CONFERENCIA_MS = 10 * 60_000;          // número do aparelho conferido vale 10 min
const ESTADO_CONECTADO = /^(logged_in|connected)$/i;   // exato: "disconnected" contém "connected"
const MOTIVOS = new Set(["pausada", "ia_desligada", "grupo", "duplicada", "bloqueado", "optout", "limite", "eco", "saida"]);
const RESULTADOS_LEAD = new Set(["criado", "atribuido", "existente"]);
const FUSO = "America/Sao_Paulo";

const OBJ = v => v != null && typeof v === "object" && !Array.isArray(v);
const texto1 = (v, max) => (v == null || typeof v === "object" ? "" : String(v).slice(0, max));

/** Erro seguro para log/resposta: sem chave cwk-, sem segredo de URL, sem token. */
export const erroSeguro = v => limparErro(v)
  .replace(/\bcw(?:k|otk)-[A-Za-z0-9_-]{4,}/g, "cwk-***")
  .replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1***");

/* ============================================================
   Telefones, datas e rótulos
   ============================================================ */

/** Formas do mesmo celular (com/sem 55, com/sem o 9) — igual ao webhook da Meta. */
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

/** Data de fora (número em s ou ms, ou ISO) → ISO UTC, nunca no futuro; inválida → null. */
export function dataIso(v, agora = Date.now()) {
  if (v == null || v === "") return null;
  let n;
  if (typeof v === "number" || /^\d{9,13}$/.test(String(v))) {
    n = Number(v);
    n = n < 1e11 ? n * 1000 : n;
  } else n = Date.parse(String(v));
  if (!Number.isFinite(n) || n < Date.UTC(2015, 0, 1)) return null;
  return new Date(Math.min(n, agora)).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const SEMANA_CURTA = { Sun: "dom", Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui", Fri: "sex", Sat: "sáb" };
const SEMANA_LONGA = { Sun: "domingo", Mon: "segunda-feira", Tue: "terça-feira", Wed: "quarta-feira", Thu: "quinta-feira", Fri: "sexta-feira", Sat: "sábado" };
function partesSP(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map(x => [x.type, x.value]));
  return p;
}
/** "qua 01/10 às 09:00" (America/Sao_Paulo). */
export function rotuloHorario(iso) {
  const p = partesSP(iso);
  return p ? `${SEMANA_CURTA[p.weekday] || p.weekday} ${p.day}/${p.month} às ${p.hour}:${p.minute}` : null;
}
/** "segunda-feira, 29/09/2026 14:05" (America/Sao_Paulo). */
export function rotuloAgora(iso) {
  const p = partesSP(iso);
  return p ? `${SEMANA_LONGA[p.weekday] || p.weekday}, ${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : null;
}

/** Horário do departamento (jsonb {"1":[["08:00","18:00"]],…}) → "seg a sex 08:00–18:00; sáb 08:00–12:00; dom fechado". */
export function textoHorario(h) {
  if (!OBJ(h)) return "";
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const faixa = d => {
    const f = Array.isArray(h[String(d)]) ? h[String(d)].filter(x => Array.isArray(x) && x.length === 2) : [];
    return f.length ? f.map(([a, b]) => `${a}–${b}`).join(", ") : "fechado";
  };
  const grupos = [];
  for (const d of ordem) {
    const f = faixa(d);
    const g = grupos[grupos.length - 1];
    if (g && g.f === f) g.fim = d; else grupos.push({ ini: d, fim: d, f });
  }
  return grupos.map(g => `${nomes[g.ini]}${g.fim !== g.ini ? ` a ${nomes[g.fim]}` : ""} ${g.f}`).join("; ");
}

export const ROTULO_MIDIA = Object.freeze({
  imagem: "🖼 Foto", video: "🎬 Vídeo", audio: "🎤 Áudio", documento: "📎 Documento", sticker: "💬 Figurinha",
  localizacao: "📍 Localização", contato: "👤 Contato",
});
const TIPO_MIDIA = {
  image: "imagem", imagem: "imagem", photo: "imagem", foto: "imagem", imagemessage: "imagem",
  video: "video", videomessage: "video",
  audio: "audio", ptt: "audio", voice: "audio", audiomessage: "audio",
  document: "documento", documento: "documento", file: "documento", documentmessage: "documento",
  sticker: "sticker", figurinha: "sticker", stickermessage: "sticker",
  location: "localizacao", localizacao: "localizacao", locationmessage: "localizacao",
  contact: "contato", contato: "contato", vcard: "contato", contactmessage: "contato",
};
const NAO_MIDIA = new Set(["", "text", "texto", "chat", "conversation", "extendedtextmessage", "message", "mensagem"]);
/** media_type do aparelho → tipo do Órbita (null = texto). */
export function tipoDaMidia(t) {
  const k = String(t ?? "").trim().toLowerCase();
  if (NAO_MIDIA.has(k)) return null;
  return Object.hasOwn(TIPO_MIDIA, k) ? TIPO_MIDIA[k] : "desconhecido";   // "constructor" e "__proto__" não são tipos
}
/** Rótulo legível da mídia ("🖼 Foto: nota.pdf"); nome gerado pelo WhatsApp não diz nada. */
export function rotuloMidia(tipo, nome, cru) {
  const base = ROTULO_MIDIA[tipo] || `📦 ${String(cru || "mídia").slice(0, 30)}`;
  const arq = String(nome ?? "").trim();
  return arq && !/^(audio|image|video|document)_\d{8}/i.test(arq) ? `${base}: ${arq.slice(0, 120)}` : base;
}

/* ============================================================
   Parser tolerante (formato IndyCar, GOWA-like, Baileys, aninhados)
   ============================================================ */

/** Camadas onde procurar campos: raiz, payload/data/message… e um nível abaixo. */
function camadas(c) {
  const out = [];
  const add = o => { const x = Array.isArray(o) ? o[0] : o; if (OBJ(x) && !out.includes(x) && out.length < 16) out.push(x); };
  add(c);
  for (const k of ["payload", "data", "body", "message", "msg", "messages", "event_data", "result", "info"]) add(c?.[k]);
  for (const o of [...out]) for (const k of ["message", "payload", "data", "key", "msg", "info", "extendedTextMessage", "contextInfo"]) add(o[k]);
  for (const o of [...out]) for (const k of ["extendedTextMessage", "contextInfo", "imageMessage", "videoMessage", "documentMessage", "audioMessage"]) add(o[k]);
  return out;
}
function achar(cs, chaves, aceitar = v => typeof v === "string" || typeof v === "number") {
  for (const k of chaves) for (const o of cs) if (Object.hasOwn(o, k) && aceitar(o[k]) && String(o[k]).trim() !== "") return o[k];
  return null;
}
const verdade = v => v === true || v === 1 || /^(true|1|sim|yes)$/i.test(String(v ?? ""));

/** Só os NOMES dos campos (nunca valores), até 3 níveis e 60 nomes. */
export function formaDoPayload(c, prefixo = "", out = [], nivel = 0) {
  if (!OBJ(c) || nivel > 2) return out;
  for (const k of Object.keys(c)) {
    if (out.length >= 60) break;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) continue;
    // chave de mapa que é um telefone, jid ou id (dado pessoal na FORMA do payload): fica de fora
    if (/\d{6,}/.test(k) || /^[A-Za-z0-9]{24,}$/.test(k)) continue;
    const nome = prefixo ? `${prefixo}.${k}` : k;
    out.push(nome);
    const v = Array.isArray(c[k]) ? c[k][0] : c[k];
    if (OBJ(v)) formaDoPayload(v, nome, out, nivel + 1);
  }
  return out;
}

const GRUPO_TXT = /@g\.us|@broadcast|@newsletter|status@/i;
/** Número do interlocutor num jid ("5512…:12@s.whatsapp.net", "X@s.whatsapp.net in Y@…"). */
function digitosDoJid(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const parte = s.split(/\s+in\s+/i)[0].split("@")[0].split(":")[0];
  return soDigitos(parte);
}

/**
 * Payload do fluxo/aparelho → mensagem normalizada.
 * @returns {{tipo:'mensagem'|'status'|'vazio', grupo:boolean, telefone:string, nome:string|null, texto:string,
 *   midia:{tipo:string, nome:string|null, cru:string}|null, messageId:string|null, direcao:'entrada'|'saida',
 *   autor:'ia'|'celular'|null, em:string|null, referral:object|null, status:object|null}}
 */
export function lerPayload(c, { numeroCanal = "", agora = Date.now() } = {}) {
  const cs = camadas(c);
  const proprio = soDigitos(numeroCanal);
  // recibo cru do aparelho (ack/receipt)
  const evento = String(achar(cs, ["event", "type", "tipo_evento"]) ?? "").toLowerCase();
  const ids = [];
  for (const o of cs) if (Array.isArray(o.ids)) ids.push(...o.ids.filter(x => typeof x === "string"));
  const rec = String(achar(cs, ["receipt_type", "receiptType", "ack", "status"]) ?? "").toLowerCase();
  if (/ack|receipt|status/.test(evento) && (ids.length || achar(cs, ["message_id", "messageId"]))) {
    const st = /read|played|lida|lido/.test(rec) ? "read" : /deliver|entreg/.test(rec) ? "delivered"
      : /fail|erro|error/.test(rec) ? "failed" : /sent|server|enviad/.test(rec) ? "sent" : null;
    return { tipo: st ? "status" : "vazio", status: st ? { ids: ids.length ? ids : [String(achar(cs, ["message_id", "messageId"]))], status: st } : null };
  }

  // grupo / lista / status
  const jids = [];
  for (const k of ["telefone", "phone", "numero", "tel", "wa_id", "chat_id", "chatId", "remote_jid", "remoteJid", "jid", "from", "sender", "sender_id", "senderId"]) {
    for (const o of cs) if (typeof o[k] === "string") jids.push(o[k]);
  }
  let grupo = jids.some(j => GRUPO_TXT.test(j)) || jids.some(j => j.includes("-") && soDigitos(j).length > 13)
    || cs.some(o => verdade(o.is_group) || verdade(o.isGroup) || verdade(o.group) || String(o.chat_type ?? o.chatType ?? "").toLowerCase() === "group"
      || (typeof o.participant === "string" && o.participant.trim() !== "") || (o.group_id != null && o.group_id !== ""));

  // interlocutor: primeiro o campo explícito do contrato; depois o chat; por último o remetente
  const candidatos = [];
  for (const grupoChaves of [["telefone", "phone", "numero", "tel", "wa_id"], ["chat_id", "chatId", "remote_jid", "remoteJid", "jid"],
    ["from", "sender", "sender_id", "senderId", "author"]]) {
    for (const k of grupoChaves) for (const o of cs) {
      const v = o[k];
      if (typeof v === "string" || typeof v === "number") { const d = digitosDoJid(v); if (d) candidatos.push(d); }
    }
  }
  let telefone = candidatos.find(d => d.length >= 8 && d.length <= 15 && d !== proprio)
    || candidatos.find(d => d.length >= 8 && d.length <= 15) || "";
  if (!telefone && candidatos.some(d => d.length > 15)) grupo = true;

  // direção e autor
  const dirTxt = String(achar(cs, ["direcao", "direction"]) ?? "").toLowerCase();
  const deMim = cs.some(o => verdade(o.from_me) || verdade(o.fromMe) || verdade(o.is_from_me) || verdade(o.isFromMe)
    || verdade(o.outgoing) || verdade(o.echo) || verdade(o.self));
  const direcao = /^(sa[ií]da|out|outgoing|sent|enviada)$/.test(dirTxt) ? "saida"
    : /^(entrada|in|incoming|received|recebida)$/.test(dirTxt) ? "entrada" : deMim ? "saida" : "entrada";
  const autorTxt = String(achar(cs, ["autor", "author_type", "sender_type", "origem_mensagem"]) ?? "").toLowerCase();
  const autor = /^(ia|ai|bot|agent|agente|assistant|assistente)$/.test(autorTxt) ? "ia"
    : /^(celular|humano|human|phone|pessoa|equipe)$/.test(autorTxt) ? "celular" : null;

  // texto (string direta ou {body}/{text})
  let textoBruto = achar(cs, ["texto", "mensagem", "text", "body", "content", "conversation", "caption", "corpo", "message"],
    v => typeof v === "string");
  if (textoBruto == null) {
    const obj = achar(cs, ["text", "body"], OBJ);
    textoBruto = obj ? (typeof obj.body === "string" ? obj.body : typeof obj.text === "string" ? obj.text : null) : null;
  }
  const textoLimpo = texto1(textoBruto, 4096).trim();

  // mídia: contrato {midia:{tipo,nome}} ou campos crus (media_type, image, imageMessage…)
  let midia = null;
  const midiaContrato = cs.find(o => OBJ(o.midia))?.midia;
  const tipoCru = midiaContrato?.tipo ?? achar(cs, ["media_type", "mediaType", "tipo_midia", "message_type", "messageType"]);
  let tipoM = tipoCru != null ? tipoDaMidia(tipoCru) : null;
  let objM = null;
  if (!tipoM) {
    const t = String(achar(cs, ["type"]) ?? "").toLowerCase();
    if (Object.hasOwn(TIPO_MIDIA, t)) tipoM = TIPO_MIDIA[t];            // "type" só vale quando é um tipo de mídia conhecido
  }
  if (!tipoM) {
    for (const k of ["image", "imageMessage", "video", "videoMessage", "audio", "audioMessage", "ptt", "voice", "document",
      "documentMessage", "sticker", "stickerMessage", "location", "locationMessage", "contact", "contactMessage", "vcard"]) {
      const o = cs.find(x => x[k] != null && x[k] !== false);
      if (o) { tipoM = tipoDaMidia(k); objM = OBJ(o[k]) ? o[k] : null; break; }
    }
  }
  if (tipoM) {
    const nome = texto1(midiaContrato?.nome ?? objM?.filename ?? objM?.fileName ?? achar(cs, ["filename", "file_name", "fileName", "nome_arquivo"]), 200).trim() || null;
    midia = { tipo: tipoM, nome, cru: texto1(tipoCru ?? tipoM, 30) };
  }
  const legenda = texto1(objM?.caption, 1024).trim();
  const texto = textoLimpo || legenda;

  const idBruto = achar(cs, ["message_id", "messageId", "wamid", "msg_id", "id_mensagem", "id"]);
  const messageId = idBruto != null && ID_OK.test(String(idBruto).trim()) ? String(idBruto).trim() : null;
  const nome = texto1(achar(cs, ["nome", "name", "pushname", "pushName", "push_name", "contact_name", "from_name", "notifyName",
    "sender_name", "senderName"], v => typeof v === "string"), 160).replace(/\s+/g, " ").trim() || null;
  const em = dataIso(achar(cs, ["timestamp", "em", "messageTimestamp", "sent_at", "created_at", "time", "date"]), agora);

  // anúncio (CTWA): referral da Meta ou externalAdReply do Baileys
  let referral = null;
  const ref = cs.find(o => OBJ(o.referral))?.referral;
  const ext = cs.find(o => OBJ(o.externalAdReply))?.externalAdReply;
  if (ref) {
    referral = {};
    for (const k of ["source_type", "source_id", "source_url", "ctwa_clid", "headline", "body"]) {
      if (ref[k] != null && ref[k] !== "") referral[k] = texto1(ref[k], k === "body" ? 500 : 300);
    }
  } else if (ext && (ext.sourceId || ext.ctwaClid)) {
    referral = { source_type: String(ext.sourceType || "ad").toLowerCase() === "ad" ? "ad" : texto1(ext.sourceType, 30),
      ...(ext.sourceId ? { source_id: texto1(ext.sourceId, 300) } : {}), ...(ext.ctwaClid ? { ctwa_clid: texto1(ext.ctwaClid, 300) } : {}),
      ...(ext.sourceUrl ? { source_url: texto1(ext.sourceUrl, 300) } : {}) };
  }
  if (referral && !Object.keys(referral).length) referral = null;

  const vazio = !telefone || (!texto && !midia);
  return { tipo: vazio ? "vazio" : "mensagem", grupo, telefone, nome, texto, midia, messageId, direcao, autor, em, referral, status: null };
}

/** Id estável quando o fluxo não manda message_id (a repetição do mesmo evento não duplica). */
export async function idEstavel(canalId, p, agora = Date.now()) {
  const quando = p.em || `min:${Math.floor(agora / 60_000)}`;
  const base = [canalId, p.direcao, p.telefone, quando, p.texto || "", p.midia?.tipo || ""].join("|");
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base)));
  return `orbita-h-${Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("")}`;
}

/* ============================================================
   Device manager do CodeWords
   ============================================================ */

/** Chamada ao device manager. Nunca lança: {ok, status, dados, texto, rede}. */
async function chamarCW(cred, caminho, { metodo = "GET", corpo, form, ms = PRAZOS.conexoes, fetch } = {}) {
  const f = comPrazo(fetch || globalThis.fetch, ms);
  const headers = { Authorization: String(cred?.codewords_api_key ?? "") };   // chave crua, sem "Bearer"
  let body;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
  else if (corpo !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(corpo); }
  let r;
  try { r = await f(`${CW_BASE}${caminho}`, { method: metodo, headers, body }); }
  catch (e) { return { ok: false, rede: true, status: 0, texto: erroSeguro(e?.message || e), dados: null }; }
  const texto = await r.text().catch(() => "");
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
  return { ok: r.ok, status: r.status, texto: texto.slice(0, 2000), dados };
}

/** Falha de chamada ao CodeWords → texto em português + se é ambígua (pode ter saído). */
export function traduzirErroCW(r) {
  const corpo = `${r?.texto || ""} ${OBJ(r?.dados) ? JSON.stringify(r.dados).slice(0, 500) : ""}`;
  if (r?.rede) {
    return { tipo: "rede", ambigua: true,
      texto: "O CodeWords não respondeu a tempo. A mensagem pode ter saído: confira no celular antes de mandar de novo." };
  }
  if (/INVALID_WA_CLI|whatsapp cli is invalid|not[_ ]connected|logged[_ ]out|disconnected/i.test(corpo)) {
    return { tipo: "desconectado", ambigua: false,
      texto: "O WhatsApp deste número está desconectado do CodeWords: nada entra nem sai. Reconecte em Configurações › Números (leva 30 segundos no celular)." };
  }
  if (r?.status === 401 || r?.status === 403) {
    return { tipo: "chave", ambigua: false, texto: "O CodeWords recusou a chave (cwk-) deste número. Confira a chave em Configurações › Números." };
  }
  if (r?.status === 429) {
    return { tipo: "limite", ambigua: false, texto: "O CodeWords recusou por limite de uso agora. Nada saiu; tente de novo em alguns minutos." };
  }
  if (r?.status === 404) {
    return { tipo: "nao_encontrado", ambigua: false,
      texto: "O CodeWords não achou o aparelho deste número. Refaça o pareamento em Configurações › Números." };
  }
  if (r?.status === 408 || r?.status === 425 || r?.status >= 500) {   // 408/425: o gateway desistiu de esperar, o envio pode ter seguido
    return { tipo: "instavel", ambigua: true,
      texto: `O CodeWords falhou (HTTP ${r.status}). A mensagem pode ter saído: confira no celular antes de mandar de novo.` };
  }
  return { tipo: "recusado", ambigua: false, texto: `O CodeWords recusou o pedido (HTTP ${r?.status ?? "?"}).` };
}

/** Corpo de 200 que diz falha (status/code skip|error|failed, ou campo error). */
function falhaNoCorpo(d) {
  if (!OBJ(d)) return null;
  const estado = String(d.status ?? d.code ?? "").toLowerCase();
  if (/^(skip|skipped|error|erro|failed|fail|failure)$/.test(estado) || (d.error != null && d.error !== false && d.error !== "")) {
    const detalhe = texto1(typeof d.error === "string" ? d.error : d.message ?? d.error?.message ?? estado, 160);
    return /own message or empty/i.test(detalhe)
      ? "O CodeWords ignorou a mensagem (\"own message or empty\"): o envio precisa sair pelo aparelho, não pelo fluxo."
      : `O CodeWords não entregou: ${erroSeguro(detalhe) || estado}.`;
  }
  return null;
}

/** GET /connections → lista de aparelhos ou erro legível (formato estranho é ERRO, não lista vazia). */
export async function listarConexoes(cred, o = {}) {
  const r = await chamarCW(cred, "/connections", { ms: PRAZOS.conexoes, fetch: o.fetch });
  if (!r.ok) return { ok: false, ...traduzirErroCW(r) };
  const d = r.dados;
  const lista = Array.isArray(d) ? d : Array.isArray(d?.connections) ? d.connections : Array.isArray(d?.results?.data) ? d.results.data : null;
  if (!lista) return { ok: false, tipo: "formato", ambigua: false, texto: "O CodeWords respondeu a lista de aparelhos num formato inesperado." };
  return { ok: true, lista: lista.filter(OBJ) };
}

/**
 * Qual aparelho é o deste canal e se ele é mesmo o número do canal.
 * Não confia só no phone_id gravado: ele já apontou para o celular errado na IndyCar.
 */
export function avaliarAparelho(lista, cred) {
  const numero = soDigitos(cred?.codewords_numero);
  const doNumero = lista.filter(c => soDigitos(c.phone_number) === numero && numero);
  const porId = cred?.codewords_phone_id ? lista.find(c => String(c.phone_id) === String(cred.codewords_phone_id)) : null;
  const vivo = doNumero.find(c => ESTADO_CONECTADO.test(String(c.status ?? "")));
  const ap = (porId && soDigitos(porId.phone_number) === numero ? porId : null) || vivo || doNumero[0] || porId || null;
  if (!ap) return { achado: false, conectado: false, numero_confere: null, phone_id: null, estado: null, service_path: null };
  const confere = soDigitos(ap.phone_number) === numero;
  return {
    achado: true, phone_id: texto1(ap.phone_id, 120) || null, numero_aparelho: soDigitos(ap.phone_number),
    numero_confere: confere, conectado: ESTADO_CONECTADO.test(String(ap.status ?? "")), estado: texto1(ap.status, 60) || null,
    service_path: texto1(ap.service_path, 500) || null,
  };
}

/** Destino atual do aparelho → rota, SEM guardar segredo de URL. */
export function classificarDestino(servicePath, cred) {
  const sp = String(servicePath ?? "").trim();
  if (!sp) return { rota: "nenhuma", inscricao: null };
  if (/^https?:\/\//i.test(sp)) {
    if (cred?.codewords_url && sp === cred.codewords_url) return { rota: "direta", inscricao: "direta (URL deste canal)" };
    if (/\/nx-codewords\?ch=/i.test(sp)) return { rota: "direta_antiga", inscricao: "URL antiga ou de outro canal do Órbita" };
    let host = "?";
    try { host = new URL(sp).host; } catch { /* fica "?" */ }
    return { rota: "externa", inscricao: `externa: ${host}`.slice(0, 120) };
  }
  const limpo = sp.replace(/^\/+/, "");
  const sid = cred?.codewords_service_id;
  if (sid && (limpo === sid || limpo.startsWith(`${sid}/`))) return { rota: "fluxo", inscricao: limpo.slice(0, 200) };
  return { rota: "outro_fluxo", inscricao: limpo.slice(0, 200) };
}

async function situacao(db, cred, dados) {
  return db.rpc("nx_codewords_situacao", { p_canal: cred.canal_id, p_cliente: cred.cliente_id, p_dados: dados });
}

/**
 * Número do aparelho = número do canal? true · false (afirmado: outro número) · null (não deu
 * para conferir — deixa passar: derrubar o atendimento por uma piscada do CodeWords é pior).
 * Cache de 10 min pelo banco (codewords_conferido_em).
 */
export async function conferirNumero(db, cred, o = {}) {
  const agora = typeof o.agora === "function" ? o.agora().getTime() : Date.now();
  const fresco = cred.codewords_conferido_em && agora - Date.parse(cred.codewords_conferido_em) < CONFERENCIA_MS;
  if (fresco && cred.codewords_numero_conferido === true) return true;
  if (fresco && cred.codewords_numero_conferido === false) return false;
  const l = await listarConexoes(cred, o);
  if (!l.ok) return null;
  const a = avaliarAparelho(l.lista, cred);
  if (!a.achado) return null;
  if (a.numero_confere === false) {
    await situacao(db, cred, { numero_conferido: false, erro: textoNumeroDiferente(cred, a) }).catch(() => null);
    return false;
  }
  await situacao(db, cred, { conectado: a.conectado, numero_conferido: true, phone_id: a.phone_id, estado: a.estado }).catch(() => null);
  if (a.phone_id) cred.codewords_phone_id = a.phone_id;   // repareado: o id muda a cada pareamento
  return true;
}
const textoNumeroDiferente = (cred, a) =>
  `O aparelho pareado é o +${a.numero_aparelho}, não o número deste canal (${cred.codewords_numero}). Nada sai até refazer o pareamento em Configurações › Números.`;

/**
 * Envia TEXTO pelo aparelho (proxy do device manager, form-urlencoded, 60 s).
 * Nunca lança. Sucesso só com code SUCCESS/message_id; timeout/5xx = ambígua (NUNCA reenviar sozinho).
 * @returns {{ok:true, provedor:'codewords', providerId, wamid, provisorio?}|{ok:false, provedor, tipo, ambigua, erro:{title}}}
 */
export async function enviarTextoCodeWords(cred, destino, texto, o = {}) {
  const falha = (tipo, t, ambigua = false) => ({ ok: false, provedor: "codewords", tipo, ambigua, erro: { title: t } });
  if (!cred?.codewords_api_key) return falha("sem_chave", "Este número está sem a chave do CodeWords. Configure em Configurações › Números.");
  if (!cred?.codewords_phone_id) return falha("sem_aparelho", "Este número ainda não foi pareado no CodeWords. Use «Parear» em Configurações › Números.");
  const tel = soDigitos(destino);
  const msg = String(texto ?? "").trim();
  if (tel.length < 8 || tel.length > 15 || !msg || msg.length > 4096) return falha("dados", "Telefone ou texto inválido para o CodeWords.");
  if (o.db && o.conferir !== false) {
    const c = await conferirNumero(o.db, cred, o);
    if (c === false) {
      return falha("numero_diferente", `O aparelho pareado não é o número deste canal (${cred.codewords_numero}). Nada foi enviado: refaça o pareamento em Configurações › Números.`);
    }
  }
  const r = await chamarCW(cred, `/proxy/send/message?phone_id=${encodeURIComponent(cred.codewords_phone_id)}`, {
    metodo: "POST", form: { phone: tel, message: msg }, ms: o.timeoutMs ?? PRAZOS.enviar, fetch: o.fetch,
  });
  if (!r.ok) { const t = traduzirErroCW(r); return falha(t.tipo, t.texto, t.ambigua); }
  const d = r.dados;
  if (!OBJ(d)) return falha("formato", "O CodeWords respondeu sem confirmação legível. A mensagem pode ter saído: confira no celular antes de mandar de novo.", true);
  const recusa = falhaNoCorpo(d);
  if (recusa) return falha("recusado", recusa);
  const id = String(d.message_id ?? d.results?.message_id ?? d.data?.message_id ?? d.results?.id ?? "").trim();
  const sucesso = /^success$/i.test(String(d.code ?? d.status ?? "")) || !!id;
  if (!sucesso) return falha("sem_confirmacao", "O CodeWords não confirmou o envio (sem SUCCESS nem message_id). A mensagem pode ter saído: confira no celular antes de mandar de novo.", true);
  const providerId = ID_OK.test(id) ? id : `orbita-p-${crypto.randomUUID().replace(/-/g, "")}`;
  return { ok: true, provedor: "codewords", providerId, wamid: `cw:${cred.canal_id}:${providerId}`, provisorio: !ID_OK.test(id) };
}

/** Mensagens de uma conversa no aparelho. Envelope diferente de {results:{data:[]}} é ERRO. */
export async function mensagensDoAparelho(cred, telefone, o = {}) {
  if (!cred?.codewords_phone_id) return { erro: "aparelho não pareado" };
  const jid = `${soDigitos(telefone)}@s.whatsapp.net`;
  const r = await chamarCW(cred, `/proxy/chat/${encodeURIComponent(jid)}/messages?phone_id=${encodeURIComponent(cred.codewords_phone_id)}&limit=30`,
    { ms: PRAZOS.mensagens, fetch: o.fetch });
  if (!r.ok) return { erro: traduzirErroCW(r).texto };
  if (!Array.isArray(r.dados?.results?.data)) return { erro: "O CodeWords mudou o formato das mensagens (esperava results.data)." };
  return { lista: r.dados.results.data.filter(OBJ) };
}

/** Item do aparelho → item do nx_codewords_sync_gravar. */
export function itemDoAparelho(m, agora = Date.now()) {
  const id = String(m?.id ?? "").trim();
  if (!ID_OK.test(id)) return null;
  const conteudo = texto1(m.content, 4096).trim();
  const tipo = tipoDaMidia(m.media_type);
  const em = dataIso(m.timestamp ?? m.created_at, agora);
  if (!em) return null;                              // data inválida gravaria 1970
  if (!tipo) return conteudo ? { id, texto: conteudo, tipo: "texto", de_mim: !!m.is_from_me, em } : null;
  if (tipo === "desconhecido") return { id, texto: conteudo || rotuloMidia(tipo, m.filename, m.media_type), tipo: "texto", de_mim: !!m.is_from_me, em };
  return { id, texto: conteudo || null, tipo, midia_nome: texto1(m.filename, 200) || null, de_mim: !!m.is_from_me, em };
}

/* ============================================================
   Rastreio do site → WhatsApp: o site (web/rastreio.js) põe "[ref K7Q2P]" no texto da mensagem
   ============================================================ */
const RE_RASTREIO = /(?:^|[^A-Za-z0-9])ref[\s:#.-]{0,3}([A-HJKMNP-Z2-9]{5})(?![A-Za-z0-9])/i;
/** Código de rastreio do texto da mensagem ("[ref K7Q2P]") → "K7Q2P" (maiúsculo) ou null. */
export function extrairCodigoRastreio(texto) {
  const m = RE_RASTREIO.exec(String(texto ?? "").slice(0, 4096));
  return m ? m[1].toUpperCase() : null;
}

/* ============================================================
   Contexto da IA (dados do banco → formato da API do agente)
   ============================================================ */
const txt = v => String(v ?? "").trim();
function textoHistorico(h) {
  const corpo = txt(h.texto);
  if (!h.tipo || h.tipo === "texto" || h.tipo === "interativo") return corpo;
  const rot = rotuloMidia(h.tipo, h.midia_nome, h.tipo);
  return corpo ? `${rot} — ${corpo}` : rot;
}

/** nx_codewords_dados → contexto {agora, empresa, contato, negocio, historico, instrucoes}. */
export function montarContexto(d = {}) {
  const agoraIso = dataIso(d.agora) || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const ia = OBJ(d.empresa?.ia) ? d.empresa.ia : {};
  const empresa = {
    nome: txt(d.empresa?.nome),
    vertical: /^(odonto|oficina|loja|generico)$/.test(txt(d.empresa?.vertical)) ? txt(d.empresa.vertical) : "generico",
    assistente: { nome: txt(ia.assistente_nome) || "Assistente", tom: ia.tom === "formal" ? "formal" : "proximo" },
    sobre: txt(ia.sobre), servicos: txt(ia.servicos),
    horarios: txt(ia.horarios) || textoHorario(d.empresa?.horario_departamento),
    endereco: txt(ia.endereco), regras: txt(ia.regras), proibido: txt(ia.proibido), boas_vindas: txt(ia.boas_vindas),
    memoria_aprovada: txt(ia.memoria_aprovada).slice(0, 3000),
  };
  const contato = { nome: txt(d.contato?.nome) || null, telefone: soDigitos(d.contato?.telefone), primeira_vez: !!d.contato?.primeira_vez };
  const n = OBJ(d.negocio) ? d.negocio : null;
  const negocio = n ? {
    etapa: txt(n.etapa) || null,
    consulta: n.consulta_em ? { inicio: dataIso(n.consulta_em, Infinity), rotulo: rotuloHorario(n.consulta_em) } : null,
    servico: txt(n.servico) || null,
    origem: {
      tipo: txt(n.origem) || null, plataforma: n.plataforma || null,
      campanha: txt(n.campanha_nome || n.campanha_ext) || null, anuncio: txt(n.anuncio_nome || n.anuncio_ext) || null,
      // rastreio do site (utm/página): sem gclid, fbclid nem qualquer identificador de clique
      rastreio: OBJ(n.rastreio) ? Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "pagina"]
        .map(k => [k, txt(n.rastreio[k]).slice(0, 200)]).filter(([, v]) => v)) : null,
    },
  } : null;
  const historico = (Array.isArray(d.historico) ? d.historico : []).slice(-20).map(h => ({
    de: h.dir === "in" ? "cliente" : h.origem === "ia" ? "ia" : "equipe", texto: textoHistorico(h).slice(0, 1500), em: dataIso(h.em, Infinity),
  })).filter(h => h.texto);
  const ctx = { agora: { iso: agoraIso, rotulo: rotuloAgora(agoraIso) }, empresa, contato, negocio, historico };
  ctx.instrucoes = montarInstrucoes(ctx);
  return ctx;
}

/* ============================================================
   API do agente (POST ?ch=)
   ============================================================ */
const respostaAgente = (dados, status = 200, cab = {}) => new Response(JSON.stringify(dados), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cab },
});
class ErroAgente extends Error {
  constructor(codigo, status = 400, extra = {}) { super(codigo); this.codigo = codigo; this.status = status; this.extra = extra; }
}
const exigirTel = v => {
  const t = soDigitos(v);
  if (t.length < 8 || t.length > 15) throw new ErroAgente("dados_invalidos", 400, { campo: "telefone" });
  return t;
};

/** Lead no CRM do cliente DO CANAL, com atribuição de anúncio (CTWA) — igual ao webhook da Meta. */
async function registrarLead(db, clienteId, telefone, nome, referral) {
  let atr = null;
  if (referral) {
    const ad = referral.source_type === "ad";
    const anuncio = referral.source_id != null && referral.source_id !== "" ? String(referral.source_id).slice(0, 100) : null;
    let campanha = null;
    if (ad && anuncio) {
      const [m] = await db.select("nx_metricas_dia", {
        cliente_id: `eq.${clienteId}`, plataforma: "eq.meta", nivel: "eq.anuncio", anuncio_ext: `eq.${anuncio}`,
        select: "campanha_ext", order: "data.desc", limit: 1,
      });
      campanha = m?.campanha_ext || null;
    }
    atr = { origem: ad ? "anuncio" : "whatsapp", plataforma: ad ? "meta" : null, anuncio_ext: anuncio, campanha_ext: campanha,
      ctwa_clid: referral.ctwa_clid || null };
  }
  const r = await db.rpc("nx_lead_webhook", {
    p_cliente: clienteId, p_telefone: telefone, p_variantes: variantesTelefone(telefone),
    p_nome: nome || null, p_atr: atr, p_hoje: hojeSP(), p_dias: 30,
  });
  if (!RESULTADOS_LEAD.has(r)) throw new Error(`nx_lead_webhook devolveu ${JSON.stringify(r)}`);
  return r;
}

const saidaResp = (conversa, registrada, motivo, extra = {}) =>
  ({ ok: true, conversa_id: conversa ?? null, registrada, responder: false, motivo: MOTIVOS.has(motivo) ? motivo : "saida", ...extra });

async function acaoMensagem(db, canal, corpo, deps) {
  const p = lerPayload(corpo, { numeroCanal: canal.numero });
  if (p.tipo === "status") {
    const res = [];
    for (const id of p.status.ids.slice(0, 20)) {
      if (ID_OK.test(id)) res.push(await db.rpc("nx_codewords_status", { p_canal: canal.canal_id, p_id: id, p_status: p.status.status, p_erro: null }));
    }
    return { ok: true, registrada: false, responder: false, motivo: "saida", recibos: res.length };
  }
  if (p.grupo) return saidaResp(null, false, "grupo");
  if (p.tipo === "vazio") {
    await db.rpc("nx_codewords_forma", { p_canal: canal.canal_id, p_forma: formaDoPayload(corpo) }).catch(() => null);
    throw new ErroAgente("payload_desconhecido", 422, {
      detalhe: "faltou telefone ou texto/mídia; mande {acao:'mensagem', telefone, texto|midia, direcao, message_id}",
    });
  }
  if (soDigitos(canal.numero) && p.telefone === soDigitos(canal.numero)) return saidaResp(null, false, "eco", { ignorado: "proprio_numero" });
  const id = p.messageId || await idEstavel(canal.canal_id, p, deps.agoraMs?.() ?? Date.now());
  // mídia conhecida vira mensagem daquele tipo (arquivo indisponível); desconhecida vira texto com rótulo
  const tipo = !p.midia || p.midia.tipo === "desconhecido" ? "texto" : p.midia.tipo;
  const corpoMsg = tipo === "texto" ? (p.texto || rotuloMidia("desconhecido", p.midia?.nome, p.midia?.cru)) : (p.texto || null);

  if (p.direcao === "saida") {
    const r = await db.rpc("nx_codewords_saida", { p_canal: canal.canal_id, p_msg: {
      telefone: p.telefone, id, texto: corpoMsg, tipo, midia_nome: p.midia?.nome ?? null, autor: p.autor, em: p.em,
    } });
    return saidaResp(r?.conversa_id, !!r?.registrada, r?.motivo || "saida", r?.ignorado ? { ignorado: r.ignorado } : {});
  }

  // ENTRADA: contato + conversa + mensagem (nx_wa_entrada), lead, decisão da IA
  const msg = {
    wamid: `cw:${canal.canal_id}:${id}`, wa_id: p.telefone, nome: p.nome, tipo, corpo: corpoMsg, em: p.em,
    ...(tipo !== "texto" ? { midia: { nome: p.midia?.nome ?? null } } : {}),
    ...(p.referral ? { referral: p.referral } : {}),
  };
  const r = await db.rpc("nx_wa_entrada", { p_canal: canal.canal_id, p_msg: msg });
  const conversa = r?.conversa_id ?? null;
  if (r?.duplicada) return { ok: true, conversa_id: conversa, registrada: false, responder: false, motivo: "duplicada" };
  if (r?.bloqueado) return { ok: true, conversa_id: conversa, registrada: !!r?.mensagem_id, responder: false, motivo: "bloqueado" };
  try { await registrarLead(db, canal.cliente_id, p.telefone, p.nome, p.referral); }
  catch (e) { console.error("nx-codewords lead:", erroSeguro(e?.message || e)); }   // a conversa já está gravada
  // código do site na mensagem → origem/campanha/gclid do negócio (não derruba o atendimento se falhar)
  const codigo = extrairCodigoRastreio(p.texto);
  if (codigo) {
    try { await db.rpc("nx_rastreio_atribuir", { p_canal: canal.canal_id, p_telefone: p.telefone, p_codigo: codigo }); }
    catch (e) { console.error("nx-codewords rastreio:", erroSeguro(e?.message || e)); }
  }
  if (r?.optout) return { ok: true, conversa_id: conversa, registrada: true, responder: false, motivo: "optout" };
  const d = await db.rpc("nx_codewords_decidir", { p_canal: canal.canal_id, p_conversa: conversa, p_fila: r?.fila_id ?? null });
  if (!d?.responder) return { ok: true, conversa_id: conversa, registrada: true, responder: false, motivo: MOTIVOS.has(d?.motivo) ? d.motivo : "pausada" };
  return { ok: true, conversa_id: conversa, registrada: true, responder: true, contexto: montarContexto(d.dados) };
}

/* Agenda (20260929b_agenda_rastreio.sql): nx_agenda_livres_ia / nx_agenda_marcar_ia / nx_agenda_desmarcar_ia.
   Banco sem a migração: o PostgREST devolve 404 → {ok:false, erro:"agenda_indisponivel"}. */
const funcaoAusente = e => e?.status === 404 && /Could not find the function|PGRST202|schema cache/i.test(String(e?.message ?? ""));
async function agenda(db, nome, params) {
  try { return await db.rpc(nome, params); }
  catch (e) {
    if (funcaoAusente(e)) return { ok: false, erro: "agenda_indisponivel" };
    throw e;
  }
}
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;
/** AAAA-MM-DD que existe no calendário (2026-02-31 ou 2026-13-01 derrubariam o banco com erro 500 e o fluxo tentaria de novo). */
const dataValida = s => {
  if (!DATA_OK.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
function inicioIso(v) {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new ErroAgente("dados_invalidos", 400, { campo: "inicio" });
  }
  return new Date(s).toISOString();
}
const comRotulos = r => {
  if (!OBJ(r)) return { ok: false, erro: "agenda_indisponivel" };
  const out = { ...r };
  if (Array.isArray(r.horarios)) out.horarios = r.horarios.slice(0, 12).map(h => ({ inicio: h.inicio, rotulo: h.rotulo || rotuloHorario(h.inicio) }));
  if (Array.isArray(r.sugestoes)) out.sugestoes = r.sugestoes.slice(0, 12).map(h => ({ inicio: h.inicio, rotulo: h.rotulo || rotuloHorario(h.inicio) }));
  if (OBJ(r.consulta)) out.consulta = { ...r.consulta, rotulo: r.consulta.rotulo || rotuloHorario(r.consulta.inicio) };
  if (OBJ(r.cancelada)) out.cancelada = { ...r.cancelada, rotulo: r.cancelada.rotulo || rotuloHorario(r.cancelada.inicio) };
  if (OBJ(r.anterior)) out.anterior = { ...r.anterior, rotulo: r.anterior.rotulo || rotuloHorario(r.anterior.inicio) };
  if (Array.isArray(out.horarios)) out.fuso = FUSO;
  return out;
};

async function despacharAgente(db, canal, corpo, deps) {
  const acao = typeof corpo.acao === "string" ? corpo.acao.trim().toLowerCase() : "";
  const c = canal.canal_id;
  switch (acao) {
    case "":
    case "mensagem":
      return acaoMensagem(db, canal, corpo, deps);
    case "contexto": {
      const d = await db.rpc("nx_codewords_dados", { p_canal: c, p_telefone: exigirTel(corpo.telefone) });
      return { ok: true, contexto: montarContexto(d) };
    }
    case "horarios": {
      const aPartir = corpo.a_partir == null || corpo.a_partir === "" ? null : String(corpo.a_partir);
      if (aPartir && !dataValida(aPartir)) throw new ErroAgente("dados_invalidos", 400, { campo: "a_partir" });
      const dias = corpo.dias == null ? 7 : Number(corpo.dias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 14) throw new ErroAgente("dados_invalidos", 400, { campo: "dias" });
      return comRotulos(await agenda(db, "nx_agenda_livres_ia", {
        p_canal: c, p_telefone: corpo.telefone ? exigirTel(corpo.telefone) : null,
        p_servico: texto1(corpo.servico, 120) || null, p_a_partir: aPartir, p_dias: dias,
      }));
    }
    case "agendar":
    case "remarcar":
      return comRotulos(await agenda(db, "nx_agenda_marcar_ia", {
        p_canal: c, p_telefone: exigirTel(corpo.telefone), p_inicio: inicioIso(corpo.inicio),
        p_servico: texto1(corpo.servico, 120) || null, p_nome: texto1(corpo.nome, 160) || null,
        p_observacao: texto1(corpo.observacao, 1000) || null, p_remarcar: acao === "remarcar",
      }));
    case "cancelar":
      return comRotulos(await agenda(db, "nx_agenda_desmarcar_ia", {
        p_canal: c, p_telefone: exigirTel(corpo.telefone), p_motivo: texto1(corpo.motivo, 500) || null,
      }));
    case "etapa":
      return db.rpc("nx_codewords_etapa", { p_canal: c, p_telefone: exigirTel(corpo.telefone),
        p_etapa: texto1(corpo.etapa, 20), p_motivo: texto1(corpo.motivo, 500) || null });
    case "origem":
      return db.rpc("nx_codewords_origem", { p_canal: c, p_telefone: exigirTel(corpo.telefone),
        p_origem: texto1(corpo.origem, 20).toLowerCase(), p_detalhe: texto1(corpo.detalhe, 200) || null });
    case "humano":
      return db.rpc("nx_codewords_humano", { p_canal: c, p_telefone: exigirTel(corpo.telefone), p_motivo: texto1(corpo.motivo, 300) || null });
    case "nota": {
      const t = texto1(corpo.texto, 2000).trim();
      if (!t) throw new ErroAgente("dados_invalidos", 400, { campo: "texto" });
      return db.rpc("nx_codewords_nota", { p_canal: c, p_telefone: exigirTel(corpo.telefone), p_texto: t });
    }
    case "status": {
      const id = String(corpo.message_id ?? "").trim();
      const st = String(corpo.status ?? "").trim().toLowerCase();
      if (!ID_OK.test(id)) throw new ErroAgente("dados_invalidos", 400, { campo: "message_id" });
      if (!["sent", "delivered", "read", "failed"].includes(st)) throw new ErroAgente("dados_invalidos", 400, { campo: "status" });
      const r = await db.rpc("nx_codewords_status", { p_canal: c, p_id: id, p_status: st,
        p_erro: st === "failed" ? erroSeguro(texto1(corpo.erro, 400)) || "o WhatsApp não entregou" : null });
      return { ok: true, pendente: !!r?.pendente };
    }
    default:
      throw new ErroAgente("acao_desconhecida", 400);
  }
}

/** Código do Apêndice B dentro do erro do banco ("banco 400 em rpc/x: dados_invalidos"). */
const codigoDoBanco = e => {
  const m = String(e?.message ?? "").match(/:\s*([a-z][a-z0-9_]{2,60})\s*$/);
  return m && e?.status >= 400 && e?.status < 500 ? m[1] : null;
};

export async function tratarAgente(req, env, deps = {}) {
  if (req.method !== "POST") return respostaAgente({ ok: false, erro: "metodo_invalido" }, 405);
  const chave = new URL(req.url).searchParams.get("ch") || "";
  if (!/^[0-9a-f]{64}$/.test(chave)) return respostaAgente({ ok: false, erro: "canal_invalido" }, 401);
  if (Number(req.headers.get("content-length") || 0) > MAX_CORPO) return respostaAgente({ ok: false, erro: "corpo_grande" }, 413);
  const db = criarDb(env, deps.fetch || globalThis.fetch);
  try {
    const canal = await db.rpc("nx_codewords_canal", { p_chave: chave });
    if (!canal?.canal_id) return respostaAgente({ ok: false, erro: "canal_invalido" }, 401);
    if (canal.excedido) return respostaAgente({ ok: false, erro: "limite_taxa" }, 429, { "retry-after": "60" });
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_CORPO) return respostaAgente({ ok: false, erro: "corpo_grande" }, 413);
    let corpo;
    try { corpo = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return respostaAgente({ ok: false, erro: "json_invalido" }, 400); }
    if (!OBJ(corpo)) return respostaAgente({ ok: false, erro: "dados_invalidos" }, 400);
    const r = await despacharAgente(db, canal, corpo, deps);
    return respostaAgente(r);
  } catch (e) {
    if (e instanceof ErroAgente) return respostaAgente({ ok: false, erro: e.codigo, ...e.extra }, e.status);
    const cod = codigoDoBanco(e);
    if (cod === "dados_invalidos") return respostaAgente({ ok: false, erro: "dados_invalidos" }, 400);
    if (cod && /_nao_encontrad[oa]$/.test(cod)) return respostaAgente({ ok: false, erro: cod }, 404);
    // falha técnica: sem URL, chave, cabeçalho ou corpo na resposta; o fluxo pode tentar de novo (idempotente)
    console.error("nx-codewords agente:", erroSeguro(e?.message || e));
    return respostaAgente({ ok: false, erro: "falha_temporaria" }, 500);
  }
}

/* ============================================================
   Painel (admin): estado, parear, ligar_fluxo, receber_aqui, enviar_teste, receita
   ============================================================ */
const ACOES_PAINEL = new Set(["estado", "parear", "ligar_fluxo", "receber_aqui", "enviar_teste", "receita"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function credencialCW(db, cliente, canal) {
  if (!UUID.test(String(canal ?? ""))) throw new ErroApi("canal_nao_encontrado", 404);
  const cred = await interna(db, "nx_canal_credencial", { p_canal: String(canal), p_cliente: cliente });
  if (cred?.provedor !== "codewords") throw new ErroApi("canal_nao_encontrado", 404);
  if (!cred.codewords_api_key) throw new ErroApi("codewords_sem_credencial", 400);
  return cred;
}

/** Situação real do aparelho, direto no CodeWords; grava no canal (sem segredo). */
export async function estadoCanalCodeWords(db, cred, o = {}) {
  const l = await listarConexoes(cred, o);
  if (!l.ok) {
    await situacao(db, cred, { erro: l.texto }).catch(() => null);
    return { ok: false, conectado: null, motivo: l.texto };
  }
  const a = avaliarAparelho(l.lista, cred);
  const destino = classificarDestino(a.service_path, cred);
  const esperado = cred.codewords_rota === "direta" ? "direta" : "fluxo";
  let motivo = null;
  if (!a.achado) motivo = "Este número ainda não foi pareado no CodeWords. Use «Parear» e digite o código no celular.";
  else if (a.numero_confere === false) motivo = textoNumeroDiferente(cred, a);
  else if (!a.conectado) motivo = "O WhatsApp deste número está desconectado do CodeWords: nada entra nem sai. Reconecte (leva 30 segundos no celular).";
  else if (destino.rota === "nenhuma") motivo = "Conectado, mas sem destino: as mensagens ficam no celular e não chegam ao Órbita. Use «Ligar ao fluxo de IA» ou «Receber aqui».";
  else if (destino.rota !== esperado) {
    motivo = esperado === "fluxo"
      ? "O aparelho manda as mensagens para outro lugar, não para o fluxo de IA deste canal. Use «Ligar ao fluxo de IA»."
      : "O aparelho manda as mensagens para outro lugar, não para o Órbita. Use «Receber aqui».";
  }
  const canal = await situacao(db, cred, {
    conectado: a.achado ? a.conectado : null, numero_conferido: a.achado ? a.numero_confere : null,
    ...(a.achado && a.numero_confere ? { phone_id: a.phone_id } : {}),
    estado: a.estado, inscricao: destino.inscricao, erro: motivo,
  });
  return {
    ok: true, conectado: a.achado ? a.conectado : false, pareado: a.achado, numero: cred.codewords_numero,
    numero_confere: a.numero_confere, estado: a.estado, rota_atual: destino.rota, rota_esperada: esperado,
    inscrito_certo: a.achado && a.numero_confere === true && a.conectado && destino.rota === esperado, motivo, canal,
  };
}

async function painelParear(db, cred, o) {
  if (!cred.codewords_numero) throw new ErroApi("dados_invalidos", 400, "numero");
  // sem service_path: o destino só é ligado depois de conferir o número do aparelho (ligar_fluxo/receber_aqui)
  const r = await chamarCW(cred, "/connections", { metodo: "POST", corpo: { phone_number: cred.codewords_numero }, ms: PRAZOS.parear, fetch: o.fetch });
  if (!r.ok) return { ok: false, erro: "codewords_falhou", detalhe: traduzirErroCW(r).texto };
  const recusa = falhaNoCorpo(r.dados);
  if (recusa) return { ok: false, erro: "codewords_falhou", detalhe: recusa };
  const codigo = texto1(r.dados?.pair_code ?? r.dados?.code_pair ?? r.dados?.results?.pair_code, 20).trim();
  const phoneId = texto1(r.dados?.phone_id ?? r.dados?.results?.phone_id, 120).trim();
  if (!codigo) return { ok: false, erro: "codewords_falhou", detalhe: "O CodeWords não devolveu o código de pareamento. Tente de novo em instantes." };
  if (phoneId && ID_OK.test(phoneId)) {
    await situacao(db, cred, { phone_id: phoneId, conectado: false, numero_conferido: null, estado: "pareando", erro: null }).catch(() => null);
  }
  return {
    ok: true, codigo, phone_id: phoneId || null,
    instrucoes: `No celular do número ${cred.codewords_numero}: WhatsApp › Aparelhos conectados › Conectar aparelho › «Conectar com número de telefone» › digite o código ${codigo}. Depois volte aqui e confira o estado.`,
  };
}

async function painelInscrever(db, cred, rota, o) {
  if (rota === "fluxo" && !cred.codewords_service_id) throw new ErroApi("dados_invalidos", 400, "codewords_service_id");
  const destino = rota === "fluxo" ? `${cred.codewords_service_id}/webhook` : cred.codewords_url;
  if (!destino) throw new ErroApi("dados_invalidos", 400, "url");
  // só no aparelho do PRÓPRIO canal e só depois de conferir o número (subscribe desvia TODAS as mensagens)
  const l = await listarConexoes(cred, o);
  if (!l.ok) return { ok: false, erro: "codewords_falhou", detalhe: `Não deu para conferir o aparelho: ${l.texto}` };
  const a = avaliarAparelho(l.lista, cred);
  if (!a.achado) return { ok: false, erro: "aparelho_nao_encontrado", detalhe: "Este número ainda não foi pareado no CodeWords. Use «Parear» primeiro." };
  if (a.numero_confere !== true) {
    const t = textoNumeroDiferente(cred, a);
    await situacao(db, cred, { numero_conferido: false, erro: t }).catch(() => null);
    return { ok: false, erro: "numero_diferente", detalhe: t };
  }
  if (!a.conectado) {
    return { ok: false, erro: "aparelho_desconectado", detalhe: "O aparelho está desconectado. Termine o pareamento no celular e tente de novo." };
  }
  const r = await chamarCW(cred, `/connections/${encodeURIComponent(a.phone_id)}/subscribe`, {
    metodo: "PUT", corpo: { service_path: destino }, ms: PRAZOS.inscrever, fetch: o.fetch,
  });
  const recusa = r.ok ? falhaNoCorpo(r.dados) : traduzirErroCW(r).texto;
  if (recusa) {
    await situacao(db, cred, { erro: recusa }).catch(() => null);
    return { ok: false, erro: "codewords_falhou", detalhe: recusa };
  }
  const canal = await situacao(db, cred, {
    conectado: true, numero_conferido: true, phone_id: a.phone_id, estado: a.estado,
    inscricao: classificarDestino(destino, cred).inscricao, rota, erro: null,
  });
  return { ok: true, rota, canal };
}

async function painelEnviarTeste(db, cred, corpo, o) {
  const para = corpo.para == null || corpo.para === "" ? soDigitos(cred.codewords_numero) : soDigitos(corpo.para);
  if (para.length < 8 || para.length > 15) throw new ErroApi("dados_invalidos", 400, "para");
  const hora = rotuloAgora(new Date().toISOString());
  const r = await enviarTextoCodeWords(cred, para, `Teste do Órbita: o envio pelo CodeWords está funcionando (${hora}).`, { ...o, db });
  if (!r.ok) return { ok: false, erro: "envio_falhou", ambigua: !!r.ambigua, detalhe: r.erro.title };
  return { ok: true, para, message_id: r.providerId, provisorio: !!r.provisorio };
}

async function painelReceita(db, cred, cliente, req) {
  if (!cred.codewords_url) throw new ErroApi("dados_invalidos", 400, "url");
  const [c] = await db.select("nx_clientes", { id: `eq.${cliente}`, select: "nome,cfg", limit: 1 });
  const ia = OBJ(c?.cfg?.ia) ? c.cfg.ia : {};
  // a chave publicável é pública por natureza (a mesma do painel); só entra se vier no formato novo
  const apikey = /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(String(req.headers.get("apikey") ?? "")) ? req.headers.get("apikey") : null;
  return {
    ok: true, url: cred.codewords_url,
    cabecalhos: { "Content-Type": "application/json", ...(apikey ? { apikey } : {}) },
    prompt: montarReceita({ url: cred.codewords_url, apikey, empresa: c?.nome, assistente: ia.assistente_nome, numero: cred.codewords_numero }),
  };
}

/* ============================================================
   Sincronização em segundo plano (cron de 2 em 2 min)
   ============================================================ */
export async function sincronizar(db, o = {}) {
  const inicio = Date.now();
  const orcamento = o.orcamentoMs ?? 100_000;
  const alvos = await db.rpc("nx_codewords_sync_alvos", { p_limite: 30 });
  const porCanal = new Map();
  for (const a of Array.isArray(alvos) ? alvos : []) {
    if (!porCanal.has(a.canal_id)) porCanal.set(a.canal_id, { cliente_id: a.cliente_id, conversas: [] });
    porCanal.get(a.canal_id).conversas.push(a);
  }
  const res = { canais: 0, conversas: 0, falhas: 0, entradas: 0, saidas: 0, adotadas: 0, recentes: 0 };
  for (const [canalId, g] of porCanal) {
    const cred = await db.rpc("nx_canal_credencial", { p_canal: canalId, p_cliente: g.cliente_id }).catch(() => null);
    if (cred?.provedor !== "codewords" || !cred.codewords_api_key || !cred.codewords_phone_id) continue;
    res.canais++;
    let tentadas = 0, falhas = 0, ultimoErro = null;
    await emLotes(g.conversas, 4, async cv => {
      if (Date.now() - inicio > orcamento) return;
      tentadas++;
      const m = await mensagensDoAparelho(cred, cv.telefone, o);
      if (m.erro) { falhas++; ultimoErro = m.erro; return; }
      const agora = Date.now();
      const itens = m.lista.map(x => itemDoAparelho(x, agora)).filter(Boolean).slice(0, 50);
      if (!itens.length) return;
      try {
        const r = await db.rpc("nx_codewords_sync_gravar", { p_canal: canalId, p_conversa: cv.conversa_id, p_itens: itens });
        res.entradas += Number(r?.entradas) || 0; res.saidas += Number(r?.saidas) || 0;
        res.adotadas += Number(r?.adotadas) || 0; res.recentes += Number(r?.recentes) || 0;
        for (const tel of Array.isArray(r?.leads) ? r.leads : []) {
          await registrarLead(db, g.cliente_id, String(tel), null, null).catch(e => console.error("nx-codewords lead:", erroSeguro(e?.message || e)));
        }
      } catch (e) { falhas++; ultimoErro = erroSeguro(e?.message || e); }
    });
    res.conversas += tentadas; res.falhas += falhas;
    // erro só quando NENHUMA conversa deu certo (um chat ruim não é o canal inteiro)
    const tudoFalhou = tentadas > 0 && falhas === tentadas;
    await situacao(db, cred, tudoFalhou ? { sync_erro: ultimoErro } : { sync_ok: true }).catch(() => null);
  }
  return res;
}

/* ============================================================
   Handler
   ============================================================ */
async function modoCron(req, env, deps, f) {
  const db = criarDb(env, f);
  await autenticarCron(req, db);   // 401 sem o cron_token
  let corpo = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const chaves = OBJ(corpo) ? Object.keys(corpo) : [];
  if (chaves.length !== 1 || corpo.sincronizar !== true) return json({ ok: false, erro: "dados_invalidos" }, 400);
  return json({ ok: true, sincronizacao: await sincronizar(db, { fetch: f, orcamentoMs: deps.orcamentoMs }) });
}

/**
 * @param {Request} req
 * @param {{url: string, chave: string}} env
 * @param {{fetch?: Function, emSegundoPlano?: Function, orcamentoMs?: number}} [deps]
 */
export async function tratar(req, env, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  let u;
  try { u = new URL(req.url); } catch { return json({ ok: false, erro: "dados_invalidos" }, 400); }
  if (u.searchParams.has("ch")) return tratarAgente(req, env, { ...deps, fetch: f });
  if (req.method === "POST" && req.headers.get("x-nx-cron") != null) {
    try { return await modoCron(req, env, deps, f); }
    catch (e) {
      if (e instanceof ErroHttp) return json({ ok: false, erro: e.message }, e.status);
      console.error("nx-codewords cron:", erroSeguro(e?.message || e));
      return json({ ok: false, erro: "falha_temporaria" }, 500);
    }
  }
  return tratarPainel(req, async () => {
    const corpo = await lerCorpoPainel(req);
    const acao = String(corpo.acao ?? "");
    if (!ACOES_PAINEL.has(acao)) throw new ErroApi("dados_invalidos", 400, "acao");
    const db = criarDb(env, f);
    await autenticarPainel(db, corpo, "admin");
    const cliente = String(corpo.cliente);
    await interna(db, "nx_exigir_modulo", { p_cliente: cliente, p_modulo: "conversas" });
    const cred = await credencialCW(db, cliente, corpo.canal);   // canal de outro cliente → 404 antes de qualquer rede
    const o = { fetch: f };
    switch (acao) {
      case "estado": return respostaPainel(await estadoCanalCodeWords(db, cred, o));
      case "parear": return respostaPainel(await painelParear(db, cred, o));
      case "ligar_fluxo": return respostaPainel(await painelInscrever(db, cred, "fluxo", o));
      case "receber_aqui": return respostaPainel(await painelInscrever(db, cred, "direta", o));
      case "enviar_teste": return respostaPainel(await painelEnviarTeste(db, cred, corpo, o));
      case "receita": return respostaPainel(await painelReceita(db, cred, cliente, req));
    }
    throw new ErroApi("dados_invalidos", 400, "acao");
  });
}
