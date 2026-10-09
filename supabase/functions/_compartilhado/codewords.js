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
   Mídia (multipart/form-data, 75 s; o mesmo contrato já usado em produção na IndyCar):
   POST /proxy/send/image (phone, caption?, image) · /proxy/send/audio (phone, audio —
   SEM caption; WAV 16 kHz mono chega como mensagem de voz) · /proxy/send/file (phone,
   caption?, file — documento e vídeo; vídeo chega como arquivo). O Content-Type do
   multipart é do fetch (boundary): nunca definido à mão.
   HTTP 200 NÃO é entrega; timeout/5xx é AMBÍGUO (nunca reenviar sozinho).
   ============================================================ */
import { criarDb } from "./db.js";
import {
  json, limparErro, comPrazo, soDigitos, ErroApi, ErroHttp, respostaPainel, tratarPainel,
  lerCorpoPainel, autenticarPainel, interna, autenticarCron, emLotes,
  lerCorpo, lerCorpoLimitado, soltandoCorpo, CorpoGrande, semNul,
  cortarTexto, variantesTelefone, telefoneBorda, funcaoAusente, nomeCurto,
} from "./comum.js";
import { hojeSP } from "./nucleo.js";
import { enviarParaTodos } from "./whatsapp.js";
import { montarInstrucoes, montarReceita } from "./codewords_prompt.js";
import { extensaoDe, mimeBase, tipoAceito } from "./midia.js";

// a regra de variantes do telefone mora no comum.js (uma cópia só para a Meta e o CodeWords); continua exportada daqui
export { variantesTelefone };

export const CW_BASE = "https://runtime.codewords.ai/run/whatsapp_device_manager";
export const MAX_CORPO = 64 * 1024;
export const ID_OK = /^[A-Za-z0-9._:=+/@-]{1,160}$/;
// enviarMidia: a tela espera 100 s; conferência do aparelho (15 s) + download do arquivo + envio têm de caber nisso
export const PRAZOS = { conexoes: 15_000, parear: 90_000, inscrever: 60_000, enviar: 60_000, enviarMidia: 70_000, mensagens: 20_000 };
export const MAX_MIDIA = 16 * 1024 * 1024;   // teto do WhatsApp (e do bucket nx-midia)
const CONFERENCIA_MS = 10 * 60_000;          // número do aparelho conferido vale 10 min
const ESTADO_CONECTADO = /^(logged_in|connected)$/i;   // exato: "disconnected" contém "connected"
const MOTIVOS = new Set(["pausada", "ia_desligada", "grupo", "duplicada", "bloqueado", "optout", "limite", "eco", "saida", "lid_sem_numero"]);
const RESULTADOS_LEAD = new Set(["criado", "atribuido", "existente"]);
const FUSO = "America/Sao_Paulo";

const OBJ = v => v != null && typeof v === "object" && !Array.isArray(v);
// corte sem partir emoji (cortarTexto): um surrogate solto no corpo derrubava a gravação inteira no banco
const texto1 = (v, max) => (v == null || typeof v === "object" ? "" : cortarTexto(v, max));

/** Erro seguro para log/resposta: sem chave cwk-, sem segredo de URL, sem token. */
export const erroSeguro = v => limparErro(v)
  .replace(/\bcw(?:k|otk)-[A-Za-z0-9_-]{4,}/g, "cwk-***")
  .replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1***");

/* ============================================================
   Telefones, datas e rótulos
   ============================================================ */

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
/* @lid = "identificador local" do WhatsApp (15 dígitos que PARECEM um telefone, mas não são): nunca vira telefone.
   Só serve se o payload trouxer o número real num campo alternativo (sender_pn, remoteJidAlt, participant_pn…). */
const LID_TXT = /@(?:hosted\.)?lid$/i;
/** O valor é um jid @lid? (aceita ":dispositivo" e o formato "X@lid in Y@…" do GOWA) */
export function ehJidLid(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return !!s && s.split(/\s+in\s+/i).some(p => LID_TXT.test(p.trim()));
}
/** Campos onde o WhatsApp entrega o NÚMERO REAL quando o chat vem como @lid (comparados sem caixa, "_" e "-"). */
const CHAVES_NUMERO_REAL = new Set(["senderpn", "senderalt", "remotejidalt", "participantpn", "participantalt", "recipientalt",
  "phonenumber", "jidalt", "chatpn", "frompn", "userpn", "pn", "senderphone", "chatphone", "numeroreal", "telefonereal"]);
const normChave = k => String(k).toLowerCase().replace(/[_-]/g, "");
/** Número real (8–15 dígitos, não-@lid, não-grupo, diferente do número do aparelho) em algum campo alternativo. */
function numeroRealDoLid(cs, proprio) {
  for (const o of cs) for (const k of Object.keys(o)) {
    if (!CHAVES_NUMERO_REAL.has(normChave(k))) continue;
    const v = o[k];
    if ((typeof v !== "string" && typeof v !== "number") || ehJidLid(String(v)) || GRUPO_TXT.test(String(v))) continue;
    const d = telefoneBorda(digitosDoJid(v));
    if (d.length >= 8 && d.length <= 15 && d !== proprio) return d;
  }
  return "";
}

// ack numérico do Baileys: -1 falhou · 0 pendente/1 servidor = enviado · 2 entregue · 3 lido · 4/5 tocado = lido
const ACK_NUMERO = { "-1": "failed", 0: "sent", 1: "sent", 2: "delivered", 3: "read", 4: "read", 5: "read" };
/** receipt_type/ack/status do recibo → sent | delivered | read | failed | null (nomes PENDING/SERVER_ACK/DELIVERY_ACK/READ/PLAYED inclusos). */
function statusDoRecibo(rec) {
  if (/^-?\d+$/.test(rec)) return Object.hasOwn(ACK_NUMERO, rec) ? ACK_NUMERO[rec] : null;
  if (/read|played|lida|lido/.test(rec)) return "read";
  if (/deliver|entreg/.test(rec)) return "delivered";
  if (/fail|erro|error/.test(rec)) return "failed";
  if (/sent|server|enviad|pending/.test(rec)) return "sent";
  return null;
}
/** Número do interlocutor num jid ("5512…:12@s.whatsapp.net", "X@s.whatsapp.net in Y@…"). */
function digitosDoJid(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const parte = s.split(/\s+in\s+/i)[0].split("@")[0].split(":")[0];
  return soDigitos(parte);
}

/**
 * Payload do fluxo/aparelho → mensagem normalizada.
 * @returns {{tipo:'mensagem'|'status'|'vazio', grupo:boolean, lid:boolean, telefone:string, nome:string|null, texto:string,
 *   midia:{tipo:string, nome:string|null, cru:string}|null, messageId:string|null, direcao:'entrada'|'saida',
 *   autor:'ia'|'celular'|null, em:string|null, referral:object|null, status:object|null}}
 */
export function lerPayload(c, { numeroCanal = "", agora = Date.now() } = {}) {
  const cs = camadas(c);
  const proprio = telefoneBorda(numeroCanal);
  // recibo cru do aparelho (ack/receipt): nomes ou o ack numérico do Baileys — só quando o evento se anuncia como recibo
  // (uma mensagem também carrega `status`/`ack`, e não é recibo)
  const evento = String(achar(cs, ["event", "type", "tipo_evento"]) ?? "").toLowerCase();
  const ids = [];
  for (const o of cs) if (Array.isArray(o.ids)) ids.push(...o.ids.filter(x => typeof x === "string"));
  const rec = String(achar(cs, ["receipt_type", "receiptType", "ack", "status"]) ?? "").toLowerCase();
  if (/ack|receipt|status/.test(evento) && (ids.length || achar(cs, ["message_id", "messageId"]))) {
    const st = statusDoRecibo(rec);
    return { tipo: st ? "status" : "vazio", status: st ? { ids: ids.length ? ids : [String(achar(cs, ["message_id", "messageId"]))], status: st } : null };
  }

  // grupo / lista / status — só por sinal confiável: jid @g.us/@broadcast, bandeira explícita, hífen em id longo (mais de
  // 15 dígitos nunca é um E.164) e `participant` SÓ na raiz/key e sem chat 1:1 declarado (numa resposta citada o
  // contextInfo.participant é o autor da mensagem citada, não um grupo: a citação em chat 1:1 era descartada)
  const jids = [];
  for (const k of ["telefone", "phone", "numero", "tel", "wa_id", "chat_id", "chatId", "remote_jid", "remoteJid", "jid", "to", "recipient",
    "recipient_id", "recipientId", "para", "destinatario", "chat", "from", "sender", "sender_id", "senderId"]) {
    for (const o of cs) if (typeof o[k] === "string") jids.push(o[k]);
  }
  const chat1a1 = jids.some(j => /@(s\.whatsapp\.net|c\.us)\b/i.test(j));
  const raizKey = [c, c?.key, c?.payload, c?.payload?.key, c?.data, c?.data?.key, c?.message?.key].filter(OBJ);
  const participante = !chat1a1 && raizKey.some(o => typeof o.participant === "string" && o.participant.trim() !== "");
  let grupo = jids.some(j => GRUPO_TXT.test(j)) || jids.some(j => j.includes("-") && soDigitos(j).length > 15)
    || cs.some(o => verdade(o.is_group) || verdade(o.isGroup) || verdade(o.group) || String(o.chat_type ?? o.chatType ?? "").toLowerCase() === "group"
      || (o.group_id != null && o.group_id !== ""))
    || participante;

  // direção (antes do interlocutor: o destinatário só é o cliente na SAÍDA)
  const dirTxt = String(achar(cs, ["direcao", "direction"]) ?? "").toLowerCase();
  const deMim = cs.some(o => verdade(o.from_me) || verdade(o.fromMe) || verdade(o.is_from_me) || verdade(o.isFromMe)
    || verdade(o.outgoing) || verdade(o.echo) || verdade(o.self));
  const direcao = /^(sa[ií]da|out|outgoing|sent|enviada)$/.test(dirTxt) ? "saida"
    : /^(entrada|in|incoming|received|recebida)$/.test(dirTxt) ? "entrada" : deMim ? "saida" : "entrada";

  // interlocutor: primeiro o campo explícito do contrato; depois o chat; na SAÍDA do aparelho ({from: próprio, to: cliente,
  // from_me}) o destinatário; por último o remetente. Na ENTRADA o `to` é o próprio número da clínica e nunca entra (um
  // jid do aparelho sem o 9 escapava da comparação e a mensagem do cliente nascia no contato da própria clínica).
  // Telefone normalizado na borda (55 em número brasileiro sem DDI, zero de tronco fora): o banco achava o contato pela
  // chave e sobrescrevia o wa_id canônico com o número cru.
  const meus = new Set(proprio ? variantesTelefone(proprio) : []);
  const ehMeu = d => d === proprio || meus.has(d);
  const candidatos = [];
  let viuLid = false;
  const destino = ["to", "recipient", "recipient_id", "recipientId", "para", "destinatario"];
  for (const grupoChaves of [["telefone", "phone", "numero", "tel", "wa_id"],
    ["chat_id", "chatId", "remote_jid", "remoteJid", "jid", "chat", ...(direcao === "saida" ? destino : [])],
    ["from", "sender", "sender_id", "senderId", "author"]]) {
    for (const k of grupoChaves) for (const o of cs) {
      const v = o[k];
      if (ehJidLid(v)) { viuLid = true; continue; }   // @lid nunca entra como telefone
      if (typeof v === "string" || typeof v === "number") { const d = telefoneBorda(digitosDoJid(v)); if (d) candidatos.push(d); }
    }
  }
  const validos = candidatos.filter(d => d.length >= 8 && d.length <= 15);
  let telefone = validos.find(d => !ehMeu(d)) || "";
  let lid = false;
  if (!telefone && viuLid) {
    // o chat é um @lid e nenhum campo traz outro número: só serve o número real de um campo alternativo
    telefone = numeroRealDoLid(cs, proprio);
    if (telefone && ehMeu(telefone)) telefone = "";
    lid = !telefone;
  }
  if (!telefone && !lid) telefone = validos[0] || "";   // só o próprio número: segue para o filtro de eco
  if (!telefone && !lid && candidatos.some(d => d.length > 15)) grupo = true;

  // autor
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
  return { tipo: vazio ? "vazio" : "mensagem", grupo, lid, telefone, nome, texto, midia, messageId, direcao, autor, em, referral, status: null };
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
async function chamarCW(cred, caminho, { metodo = "GET", corpo, form, multipart, ms = PRAZOS.conexoes, fetch } = {}) {
  const f = comPrazo(fetch || globalThis.fetch, ms);
  const headers = { Authorization: String(cred?.codewords_api_key ?? "") };   // chave crua, sem "Bearer"
  let body;
  if (multipart) body = multipart;   // FormData: o fetch escreve o Content-Type com o boundary (definido à mão, o proxy não acha o arquivo)
  else if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
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
  if (r?.status === 400 && /not (on|registered (on|in)) whatsapp|is not a valid whatsapp|no whatsapp account|not found on whatsapp|invalid (phone|jid)|phone.{0,20}invalid/i.test(corpo)) {
    return { tipo: "sem_whatsapp", ambigua: false, texto: "Esse número não tem WhatsApp ou está errado. Confira o telefone do contato (com DDD) e tente de novo." };
  }
  const motivo = texto1(OBJ(r?.dados) ? (r.dados.message ?? r.dados.error ?? r.dados.detail ?? "") : String(r?.texto ?? ""), 120);
  return { tipo: "recusado", ambigua: false, texto: `O CodeWords recusou o pedido (HTTP ${r?.status ?? "?"})${motivo ? `: ${erroSeguro(motivo)}` : "."}` };
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
  const agora = typeof o.agora === "function" ? o.agora().getTime() : o.agora instanceof Date ? o.agora.getTime() : Date.now();
  // forcar: o aparelho pode ter sido repareado fora do painel (phone_id morto) — ignora o cache e pergunta ao CodeWords
  const fresco = !o.forcar && cred.codewords_conferido_em && agora - Date.parse(cred.codewords_conferido_em) < CONFERENCIA_MS;
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

/* Envio pelo aparelho (texto e mídia): as mesmas barreiras antes e a mesma leitura da resposta depois. */
const falhaEnvio = (tipo, t, ambigua = false) => ({ ok: false, provedor: "codewords", tipo, ambigua, erro: { title: t } });

/** Canal sem chave/aparelho ou destino @lid → falha (nada sai); senão null. */
function barreiraDoCanal(cred, destino) {
  if (!cred?.codewords_api_key) return falhaEnvio("sem_chave", "Este número está sem a chave do CodeWords. Configure em Configurações › Números.");
  if (!cred?.codewords_phone_id) return falhaEnvio("sem_aparelho", "Este número ainda não foi pareado no CodeWords. Use «Parear» em Configurações › Números.");
  if (ehJidLid(destino)) return falhaEnvio("dados", "Este contato veio do WhatsApp sem número de telefone (id interno @lid): não dá para responder por aqui.");
  return null;
}

/** Aparelho pareado é outro número (conferido pelo banco, cache de 10 min) → falha (nada sai); senão null. */
async function barreiraDoNumero(cred, o) {
  if (!o.db || o.conferir === false) return null;
  const c = await conferirNumero(o.db, cred, o);
  return c === false
    ? falhaEnvio("numero_diferente", `O aparelho pareado não é o número deste canal (${cred.codewords_numero}). Nada foi enviado: refaça o pareamento em Configurações › Números.`)
    : null;
}

/** Resposta do proxy → resultado do envio. Sucesso só com code SUCCESS/message_id; timeout/5xx/corpo ilegível = ambígua. */
function lerEnvio(cred, r) {
  if (!r.ok) { const t = traduzirErroCW(r); return falhaEnvio(t.tipo, t.texto, t.ambigua); }
  const d = r.dados;
  if (!OBJ(d)) return falhaEnvio("formato", "O CodeWords respondeu sem confirmação legível. A mensagem pode ter saído: confira no celular antes de mandar de novo.", true);
  const recusa = falhaNoCorpo(d);
  if (recusa) return falhaEnvio("recusado", recusa);
  const id = String(d.message_id ?? d.results?.message_id ?? d.data?.message_id ?? d.results?.id ?? "").trim();
  const sucesso = /^success$/i.test(String(d.code ?? d.status ?? "")) || !!id;
  if (!sucesso) return falhaEnvio("sem_confirmacao", "O CodeWords não confirmou o envio (sem SUCCESS nem message_id). A mensagem pode ter saído: confira no celular antes de mandar de novo.", true);
  const providerId = ID_OK.test(id) ? id : `orbita-p-${crypto.randomUUID().replace(/-/g, "")}`;
  return { ok: true, provedor: "codewords", providerId, wamid: `cw:${cred.canal_id}:${providerId}`, provisorio: !ID_OK.test(id) };
}

/**
 * Envia TEXTO pelo aparelho (proxy do device manager, form-urlencoded, 60 s).
 * Nunca lança. Sucesso só com code SUCCESS/message_id; timeout/5xx = ambígua (NUNCA reenviar sozinho).
 * @returns {{ok:true, provedor:'codewords', providerId, wamid, provisorio?}|{ok:false, provedor, tipo, ambigua, erro:{title}}}
 */
export async function enviarTextoCodeWords(cred, destino, texto, o = {}) {
  const barrado = barreiraDoCanal(cred, destino);
  if (barrado) return barrado;
  const tel = soDigitos(destino);
  const msg = String(texto ?? "").trim();
  if (tel.length < 8 || tel.length > 15 || !msg || msg.length > 4096) return falhaEnvio("dados", "Telefone ou texto inválido para o CodeWords.");
  const outroNumero = await barreiraDoNumero(cred, o);
  if (outroNumero) return outroNumero;
  const r = await chamarCW(cred, `/proxy/send/message?phone_id=${encodeURIComponent(cred.codewords_phone_id)}`, {
    metodo: "POST", form: { phone: tel, message: msg }, ms: o.timeoutMs ?? PRAZOS.enviar, fetch: o.fetch,
  });
  return lerEnvio(cred, r);
}

// rota e campo do arquivo no proxy por tipo: foto → send/image; áudio → send/audio; documento e vídeo → send/file
// (vídeo não foi testado no proxy como vídeo: vai como arquivo)
const ROTA_MIDIA = { image: "image", audio: "audio", video: "file", document: "file" };

/** Nome do arquivo para o multipart: sem barras, caracteres de controle ou reservados; vazio → "arquivo.<ext do mime>". */
export function nomeDoArquivo(nome, mime) {
  const limpo = String(nome ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]/g, "_").trim().replace(/^\.+/, "").slice(0, 150);
  return limpo || `arquivo.${extensaoDe(mime)}`;
}

/**
 * Envia MÍDIA pelo aparelho (proxy do device manager, multipart/form-data, 75 s): foto, áudio, vídeo ou documento.
 * Nunca lança; mesmas barreiras e mesma leitura da resposta do texto (timeout/5xx = ambígua, NUNCA reenviar sozinho).
 * @param {{grupo:'image'|'audio'|'video'|'document', bytes:Uint8Array|ArrayBuffer|Blob, mime?:string, nome?:string, legenda?:string}} midia
 * @returns {{ok:true, provedor:'codewords', providerId, wamid, provisorio?}|{ok:false, provedor, tipo, ambigua, erro:{title}}}
 */
export async function enviarMidiaCodeWords(cred, destino, midia, o = {}) {
  const barrado = barreiraDoCanal(cred, destino);
  if (barrado) return barrado;
  const tel = soDigitos(destino);
  const campo = Object.hasOwn(ROTA_MIDIA, String(midia?.grupo)) ? ROTA_MIDIA[midia.grupo] : null;
  if (tel.length < 8 || tel.length > 15 || !campo) return falhaEnvio("dados", "Telefone ou tipo de arquivo inválido para o CodeWords.");
  const bytes = midia.bytes;
  const tamanho = bytes instanceof Blob ? bytes.size : bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes) ? bytes.byteLength : 0;
  if (!tamanho) return falhaEnvio("dados", "O arquivo está vazio ou não pôde ser lido. Nada foi enviado: anexe de novo.");
  const mime = mimeBase(midia.mime);
  const tipo = tipoAceito(mime);
  if (!tipo || tipo.grupo !== midia.grupo) return falhaEnvio("dados", "O MIME do arquivo não corresponde à rota de mídia do CodeWords.");
  if (tamanho > Math.min(MAX_MIDIA, tipo.max)) {
    const limite = Math.min(MAX_MIDIA, tipo.max) / (1024 * 1024);
    return falhaEnvio("dados", `O arquivo passa de ${limite} MB, o limite deste tipo no WhatsApp. Nada foi enviado.`);
  }
  const outroNumero = await barreiraDoNumero(cred, o);
  if (outroNumero) return outroNumero;
  const legenda = String(midia.legenda ?? "").trim().slice(0, 1024);
  const fd = new FormData();
  fd.append("phone", tel);
  if (legenda && campo !== "audio") fd.append("caption", legenda);   // o proxy de áudio não aceita legenda
  fd.append(campo, new Blob([bytes], { type: mime }), nomeDoArquivo(midia.nome, mime));
  const r = await chamarCW(cred, `/proxy/send/${campo}?phone_id=${encodeURIComponent(cred.codewords_phone_id)}`, {
    metodo: "POST", multipart: fd, ms: o.timeoutMs ?? PRAZOS.enviarMidia, fetch: o.fetch,
  });
  return lerEnvio(cred, r);
}

/** Mensagens de uma conversa no aparelho. Envelope diferente de {results:{data:[]}} é ERRO. */
export async function mensagensDoAparelho(cred, telefone, o = {}) {
  if (!cred?.codewords_phone_id) return { erro: "aparelho não pareado" };
  const digitos = soDigitos(telefone);
  if (ehJidLid(telefone) || digitos.length < 8 || digitos.length > 15) return { erro: "telefone inválido para consultar o aparelho", invalido: true };
  const jid = `${digitos}@s.whatsapp.net`;
  const r = await chamarCW(cred, `/proxy/chat/${encodeURIComponent(jid)}/messages?phone_id=${encodeURIComponent(cred.codewords_phone_id)}&limit=30`,
    { ms: PRAZOS.mensagens, fetch: o.fetch });
  if (!r.ok) return { erro: traduzirErroCW(r).texto, status: r.status };   // status: 404 = aparelho/phone_id não existe mais
  if (!Array.isArray(r.dados?.results?.data)) return { erro: "O CodeWords mudou o formato das mensagens (esperava results.data).", status: r.status };
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
// «ref» como palavra (início, espaço, « [ » ou « ( » antes) + separador obrigatório (espaço, dois-pontos ou #) + 5 caracteres
// do alfabeto do código: «refresca» e «ref. 23456» não casam (cada falso positivo era uma RPC à toa)
const RE_RASTREIO = /(?:^|[\s[(])ref(?:\s*[:#]\s*|\s+)([A-HJKMNP-Z2-9]{5})(?![A-Za-z0-9])/i;
/** Código de rastreio do texto da mensagem ("[ref K7Q2P]") → "K7Q2P" (maiúsculo) ou null. */
export function extrairCodigoRastreio(texto) {
  const m = RE_RASTREIO.exec(String(texto ?? "").slice(0, 4096));
  return m ? m[1].toUpperCase() : null;
}

// a frase que o botão do site põe na mensagem («Vim pelo site», «[site · agenda]», «Vim pelo anúncio (instagram)»)
const RE_SITE = /\bvim pelo site\b|\[\s*site\b[^\]]*\]/i;
const RE_ANUNCIO = /\bvim pelo anuncio\b(?:\s*\(([^)]{1,40})\))?/i;
const FONTES = [[/instagram|insta\b|\big\b/i, "instagram", "meta"], [/facebook|\bfb\b|\bmeta\b/i, "facebook", "meta"], [/google|adwords|youtube/i, "google", "google"]];
/**
 * Origem pela frase do botão do site, para quando o [ref] não veio (a pessoa apagou o código ou o Órbita demorou):
 * {origem:'site'} · {origem:'anuncio', fonte:'instagram'|'facebook'|'google'|null, plataforma:'meta'|'google'|null} · null.
 */
export function lerOrigemTexto(texto) {
  const t = String(texto ?? "").slice(0, 4096).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const an = RE_ANUNCIO.exec(t);
  if (an) {
    const f = FONTES.find(([re]) => re.test(String(an[1] ?? "")));
    return { origem: "anuncio", fonte: f ? f[1] : null, plataforma: f ? f[2] : null };
  }
  return RE_SITE.test(t) ? { origem: "site", fonte: "site", plataforma: null } : null;
}

/**
 * Origem do site na mensagem: o código [ref K7Q2P] (nx_rastreio_atribuir, idempotente: «repetido») ou, sem código e só na
 * conversa nova (fraseDoBotao), a frase do botão pela ação de origem contada (nx_codewords_origem só mexe em quem ainda é
 * «whatsapp»). Serve à API do agente, à reentrega, à sincronização e ao webhook da Meta. Nunca derruba o atendimento.
 */
export async function atribuirOrigemDoTexto(db, canal, telefone, texto, { fraseDoBotao = true } = {}) {
  const codigo = extrairCodigoRastreio(texto);
  if (codigo) {
    try { return await db.rpc("nx_rastreio_atribuir", { p_canal: canal.canal_id, p_telefone: telefone, p_codigo: codigo }); }
    catch (e) { console.error("nx-codewords rastreio:", erroSeguro(e?.message || e)); return null; }
  }
  if (!fraseDoBotao) return null;
  const o = lerOrigemTexto(texto);
  if (!o || (o.origem === "anuncio" && !o.fonte)) return null;   // «Vim pelo anúncio» sem a fonte: não há plataforma para gravar
  const detalhe = `frase do botão do site: ${cortarTexto(String(texto ?? "").replace(/\s+/g, " ").trim(), 120)}`;
  try {
    // 20261009a: vale em canal da Meta e do aparelho, e «anúncio» fica ANÚNCIO (com a plataforma) — não «orgânico contado»
    return await db.rpc("nx_origem_frase", { p_canal: canal.canal_id, p_telefone: telefone, p_origem: o.origem, p_plataforma: o.plataforma, p_detalhe: detalhe });
  } catch (e) {
    if (!funcaoAusente(e)) { console.error("nx-codewords origem do texto:", erroSeguro(e?.message || e)); return null; }
  }
  try {   // banco sem a 20261009a: o caminho antigo (só aparelho; a fonte vira origem contada)
    return await db.rpc("nx_codewords_origem", {
      p_canal: canal.canal_id, p_telefone: telefone, p_origem: o.origem === "site" ? "site" : o.fonte, p_detalhe: detalhe,
    });
  } catch (e) { console.error("nx-codewords origem do texto:", erroSeguro(e?.message || e)); return null; }
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
  if (ehJidLid(v)) throw new ErroAgente("dados_invalidos", 400, { campo: "telefone" });   // @lid não é telefone
  const t = telefoneBorda(v);   // 55 em número brasileiro sem DDI, zero de tronco fora
  if (t.length < 8 || t.length > 15) throw new ErroAgente("dados_invalidos", 400, { campo: "telefone" });
  return t;
};

/** Lead no CRM do cliente DO CANAL, com atribuição de anúncio (CTWA) — igual ao webhook da Meta.
    Referral de post/página (source_type ≠ 'ad') NÃO vira anuncio_ext: o id do post na coluna de anúncio bloqueava para
    sempre a origem real (ja_tem_anuncio no rastreio e na origem contada); fica só no referral da mensagem. */
async function registrarLead(db, clienteId, telefone, nome, referral) {
  let atr = null;
  if (referral) {
    const ad = referral.source_type === "ad";
    const anuncio = ad && referral.source_id != null && referral.source_id !== "" ? String(referral.source_id).slice(0, 100) : null;
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

/** Contador por canal (eco, grupo, lid, payload_desconhecido, http_422, http_413) — nx_codewords_contar (S-B11). Sem a RPC
    (migração não aplicada) ou com falha segue em silêncio: contador nunca derruba mensagem. */
const contar = (db, canal, chave) => db.rpc("nx_codewords_contar", { p_canal: canal.canal_id, p_chave: chave }).catch(() => null);

// forma de payload desconhecido: no máximo 1 escrita por hora por canal e por forma (cada recibo estranho virava um UPDATE
// em nx_canais e escondia a forma realmente nova)
const FORMAS_GRAVADAS = new Map();
export function esquecerFormas() { FORMAS_GRAVADAS.clear(); }
async function gravarForma(db, canal, corpo, deps) {
  const forma = formaDoPayload(corpo);
  const chave = `${canal.canal_id}|${forma.join(",")}`;
  const agora = deps?.agoraMs?.() ?? Date.now();
  const antes = FORMAS_GRAVADAS.get(chave);
  if (antes != null && agora - antes < 3600e3) return;
  if (FORMAS_GRAVADAS.size > 500) FORMAS_GRAVADAS.clear();   // memória do isolate nunca cresce sem fim
  FORMAS_GRAVADAS.set(chave, agora);
  await db.rpc("nx_codewords_forma", { p_canal: canal.canal_id, p_forma: forma }).catch(() => null);
}

/** Mensagem repetida (reentrega) já tem resposta da equipe/IA depois dela? Sem como saber (ids de outro cliente, banco
    indisponível) vale «respondida»: a reentrega não pode virar resposta em dobro. */
async function entradaSemResposta(db, canal, r) {
  if (!r?.mensagem_id || !r?.conversa_id) return false;
  try {
    const [saida] = await db.select("nx_mensagens", {
      cliente_id: `eq.${canal.cliente_id}`, conversa_id: `eq.${r.conversa_id}`, direcao: "eq.out", id: `gt.${r.mensagem_id}`,
      tipo: "not.in.(nota,sistema)", select: "id", limit: 1,
    });
    return !saida;
  } catch (e) { console.error("nx-codewords reentrega:", erroSeguro(e?.message || e)); return false; }
}

/** Vez de decidir a resposta desta mensagem (trava de 2 min no banco). O aparelho reentrega o mesmo evento quase junto
    (reconexão do Baileys): sem a vez, a 1ª entrega ainda gerando a resposta (5–20 s) e a reentrega sem saída gravada
    respondiam as duas. Devolve o dono da trava (ou null sem ela). A 1ª entrega segue mesmo sem a trava; a reentrega só
    com ela. Se a decisão FALHA a trava é solta na hora: a repetição rápida do fluxo depois de uma falha nossa decide. */
async function vezDeDecidir(db, mensagemId) {
  if (!mensagemId) return null;
  const dono = `nx-codewords:${crypto.randomUUID()}`;
  try { return (await db.rpc("nx_trava_pegar", { p_nome: `nx-cw-decidir:${mensagemId}`, p_segundos: 120, p_dono: dono })) === true ? dono : null; }
  catch (e) { console.error("nx-codewords vez:", erroSeguro(e?.message || e)); return null; }
}
async function soltarVez(db, mensagemId, dono) {
  if (!dono) return;
  try { await db.rpc("nx_trava_soltar", { p_nome: `nx-cw-decidir:${mensagemId}`, p_dono: dono }); }
  catch (e) { console.error("nx-codewords vez:", erroSeguro(e?.message || e)); }   // vence sozinha em 2 min
}

async function acaoMensagem(db, canal, corpo, deps) {
  const p = lerPayload(corpo, { numeroCanal: canal.numero });
  if (p.tipo === "status") {
    const res = [];
    for (const id of p.status.ids.slice(0, 20)) {
      if (ID_OK.test(id)) res.push(await db.rpc("nx_codewords_status", { p_canal: canal.canal_id, p_id: id, p_status: p.status.status, p_erro: null }));
    }
    return { ok: true, registrada: false, responder: false, motivo: "saida", recibos: res.length };
  }
  if (p.grupo) { await contar(db, canal, "grupo"); return saidaResp(null, false, "grupo"); }
  if (p.lid) {
    // remetente @lid sem número real: não vira contato/conversa/negócio e a IA não responde; guarda só a FORMA do payload
    await gravarForma(db, canal, corpo, deps);
    await contar(db, canal, "lid");
    return saidaResp(null, false, "lid_sem_numero", { ignorado: "jid_lid_sem_numero" });
  }
  if (p.tipo === "vazio") {
    await gravarForma(db, canal, corpo, deps);
    await contar(db, canal, "payload_desconhecido");
    throw new ErroAgente("payload_desconhecido", 422, {
      detalhe: "faltou telefone ou texto/mídia; mande {acao:'mensagem', telefone, texto|midia, direcao, message_id}",
    });
  }
  const proprio = telefoneBorda(canal.numero);
  if (proprio && variantesTelefone(proprio).includes(p.telefone)) { await contar(db, canal, "eco"); return saidaResp(null, false, "eco", { ignorado: "proprio_numero" }); }
  // sem message_id nem timestamp o id estável colide por minuto (dois «sim» iguais viram «duplicada»; o retry que cruza o
  // minuto grava 2×): a receita exige o message_id — orienta o fluxo em vez de adivinhar
  if (!p.messageId && !p.em) {
    await contar(db, canal, "http_422");
    throw new ErroAgente("payload_desconhecido", 422, {
      campo: "message_id", detalhe: "mande message_id (o id da mensagem no WhatsApp) ou, na falta dele, timestamp",
    });
  }
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
  if (r?.bloqueado) return { ok: true, conversa_id: conversa, registrada: !!r?.mensagem_id, responder: false, motivo: "bloqueado" };
  // a conversa pode existir enquanto a gravação do lead falhou em tentativa anterior: o evento repetido refaz o upsert
  try { await registrarLead(db, canal.cliente_id, p.telefone, p.nome, p.referral); }
  catch (e) { console.error("nx-codewords lead:", erroSeguro(e?.message || e)); }   // a conversa já está gravada
  // código do site ([ref K7Q2P]) ou frase do botão: também na reentrega — o negócio pode ter nascido só agora e a RPC é idempotente
  await atribuirOrigemDoTexto(db, canal, p.telefone, p.texto, { fraseDoBotao: r?.nova_conversa === true });
  let vez = null;
  if (r?.duplicada) {
    // reentrega (o fluxo repete a mesma message_id depois de uma falha nossa): se a IA ainda não respondeu esta mensagem,
    // decide agora em vez de calar para sempre; se já respondeu (ou não dá para saber), para aqui
    // (e só com a vez: a 1ª entrega pode estar gerando a resposta agora mesmo)
    vez = (await entradaSemResposta(db, canal, r)) ? await vezDeDecidir(db, r.mensagem_id) : null;
    if (!vez) return { ok: true, conversa_id: conversa, registrada: false, responder: false, motivo: "duplicada" };
  } else if (r?.optout) return { ok: true, conversa_id: conversa, registrada: true, responder: false, motivo: "optout" };
  else vez = await vezDeDecidir(db, r?.mensagem_id);
  const registrada = !r?.duplicada;
  let d;
  try { d = await db.rpc("nx_codewords_decidir", { p_canal: canal.canal_id, p_conversa: conversa, p_fila: r?.fila_id ?? null }); }
  catch (e) { await soltarVez(db, r?.mensagem_id, vez); throw e; }
  if (!d?.responder) return { ok: true, conversa_id: conversa, registrada, responder: false, motivo: MOTIVOS.has(d?.motivo) ? d.motivo : "pausada" };
  return { ok: true, conversa_id: conversa, registrada, responder: true, contexto: montarContexto(d.dados) };
}

/* Agenda (20260929b_agenda_rastreio.sql): nx_agenda_livres_ia / nx_agenda_marcar_ia / nx_agenda_desmarcar_ia.
   Banco sem a migração: o PostgREST devolve 404 → {ok:false, erro:"agenda_indisponivel"}. */
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

export function tratarAgente(req, env, deps = {}) {
  // 405/401 respondem sem ler: o corpo é drenado antes da resposta (senão o runtime espera o envio)
  return soltandoCorpo(req, () => tratarAgenteCorpo(req, env, deps), deps.drenagem);
}

/** Corpo acima de 64 KiB: conta http_413 para o canal do segredo (em segundo plano; nunca lança). */
async function contar413(db, chave) {
  try {
    const canal = await db.rpc("nx_codewords_canal", { p_chave: chave });
    if (canal?.canal_id) await contar(db, canal, "http_413");
  } catch { /* contador nunca derruba nada */ }
}

async function tratarAgenteCorpo(req, env, deps) {
  if (req.method !== "POST") return respostaAgente({ ok: false, erro: "metodo_invalido" }, 405);
  const chave = new URL(req.url).searchParams.get("ch") || "";
  if (!/^[0-9a-f]{64}$/.test(chave)) return respostaAgente({ ok: false, erro: "canal_invalido" }, 401);
  const db = criarDb(env, deps.fetch || globalThis.fetch);
  try {
    // corpo com teto ANTES do banco: acima de 64 KiB (Content-Length ou contagem) o resto é
    // drenado e descartado e sai 413 sem tocar no banco; a interpretação só vem depois do canal
    let bytes;
    try { bytes = await lerCorpoLimitado(req, MAX_CORPO, deps.drenagem); }
    catch (e) {
      if (e instanceof CorpoGrande) {
        // contador http_413 do canal DEPOIS da resposta (o 413 nunca espera o banco) e só com o segredo válido
        if (deps.emSegundoPlano) deps.emSegundoPlano(contar413(db, chave));
        return respostaAgente({ ok: false, erro: "corpo_grande" }, 413);
      }
      throw e;   // leitura interrompida: falha técnica (o fluxo pode tentar de novo)
    }
    const canal = await db.rpc("nx_codewords_canal", { p_chave: chave });
    if (!canal?.canal_id) return respostaAgente({ ok: false, erro: "canal_invalido" }, 401);
    if (canal.excedido) return respostaAgente({ ok: false, erro: "limite_taxa" }, 429, { "retry-after": "60" });
    let corpo;
    try { corpo = JSON.parse(new TextDecoder().decode(bytes), semNul); }
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
  if (ehJidLid(corpo.para)) throw new ErroApi("dados_invalidos", 400, "para");
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
  const res = { canais: 0, conversas: 0, falhas: 0, entradas: 0, saidas: 0, adotadas: 0, recentes: 0, sem_resposta: 0 };
  for (const [canalId, g] of porCanal) {
    const cred = await db.rpc("nx_canal_credencial", { p_canal: canalId, p_cliente: g.cliente_id }).catch(() => null);
    if (cred?.provedor !== "codewords" || !cred.codewords_api_key || !cred.codewords_phone_id) continue;
    res.canais++;
    const canal = { canal_id: canalId, cliente_id: g.cliente_id };
    let tentadas = 0, falhas = 0, ultimoErro = null, reconferido = false;
    await emLotes(g.conversas, 4, async cv => {
      if (Date.now() - inicio > orcamento) return;
      const tel = soDigitos(cv.telefone);
      if (ehJidLid(cv.telefone) || tel.length < 8 || tel.length > 15) return;   // @lid/telefone impossível: não há chat para consultar
      tentadas++;
      let m = await mensagensDoAparelho(cred, cv.telefone, o);
      if (m.erro && m.status === 404 && !reconferido) {
        // aparelho repareado fora do painel: o phone_id gravado morreu; confere no CodeWords e tenta de novo uma vez
        reconferido = true;
        if (await conferirNumero(db, cred, { ...o, forcar: true }) === true) m = await mensagensDoAparelho(cred, cv.telefone, o);
      }
      if (m.erro) { falhas++; ultimoErro = m.erro; return; }
      const agora = Date.now();
      const itens = m.lista.map(x => itemDoAparelho(x, agora)).filter(Boolean).slice(0, 50);
      if (!itens.length) return;
      try {
        const r = await db.rpc("nx_codewords_sync_gravar", { p_canal: canalId, p_conversa: cv.conversa_id, p_itens: itens });
        res.entradas += Number(r?.entradas) || 0; res.saidas += Number(r?.saidas) || 0;
        res.adotadas += Number(r?.adotadas) || 0; res.recentes += Number(r?.recentes) || 0;
        const leads = (Array.isArray(r?.leads) ? r.leads : []).map(String);
        for (const t of leads) {
          await registrarLead(db, g.cliente_id, t, null, null).catch(e => console.error("nx-codewords lead:", erroSeguro(e?.message || e)));
        }
        if (Number(r?.entradas) > 0) {
          // o fluxo de IA não viu estas entradas: código do site / frase do botão (só na conversa nova) e, se a IA deveria
          // ter respondido, aviso à equipe
          for (const it of itens) if (!it.de_mim && it.texto) await atribuirOrigemDoTexto(db, canal, tel, it.texto, { fraseDoBotao: leads.includes(tel) });
          if (await avisarRecuperadaSemResposta(db, canal, cv.conversa_id, r.entradas)) res.sem_resposta++;
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

/** Entrada recuperada pela sincronização: a IA do fluxo não a viu. Se ela deveria responder (nx_codewords_decidir), a
    equipe é avisada — a função não consegue acionar o fluxo. Devolve true quando avisou. */
async function avisarRecuperadaSemResposta(db, canal, conversaId, n) {
  let d = null;
  try { d = await db.rpc("nx_codewords_decidir", { p_canal: canal.canal_id, p_conversa: conversaId, p_fila: null }); }
  catch (e) { console.error("nx-codewords sync decidir:", erroSeguro(e?.message || e)); return false; }
  if (!d?.responder) return false;
  const quantas = Number(n) === 1 ? "1 mensagem do cliente chegou" : `${Number(n)} mensagens do cliente chegaram`;
  await db.rpc("nx_notificar", {
    p_cliente: canal.cliente_id, p_conta: null, p_tipo: "sistema", p_titulo: "Mensagem recuperada sem resposta",
    p_corpo: `${quantas} pelo aparelho enquanto o fluxo de IA não respondeu. Responda pela conversa.`,
    p_link: `#/conversas/${conversaId}`,
  }).catch(e => console.error("nx-codewords sync aviso:", erroSeguro(e?.message || e)));
  return true;
}

/* ============================================================
   Vigia do aparelho (cron de 2 em 2 min, depois da sincronização)
   ============================================================ */
const VIGIA_LIMITE = 10, VIGIA_ORCAMENTO_MS = 30_000, CAIDO_HA_MS = 10 * 60_000, AVISO_CADA_MS = 24 * 3600e3;

const textoAparelhoCaido = (nome, numero, desde, agora) => {
  const min = Math.max(1, Math.round((agora - Date.parse(desde)) / 60_000));
  const ha = min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`;
  return `⚠️ *${nome} · WhatsApp desconectado*\n\nO número ${numero || "do atendimento"} está desconectado do CodeWords há ${ha}: nenhuma mensagem entra nem sai.\n\n`
    + "No celular: WhatsApp › Aparelhos conectados › reconecte o aparelho (leva 30 segundos). Depois confira em Órbita › Configurações › Números.";
};

/** Último aviso ao gestor (coluna codewords_aviso_em, S-B11); sem a coluna → null. */
const ultimoAviso = async (db, canalId) =>
  (await db.select("nx_canais", { id: `eq.${canalId}`, select: "codewords_aviso_em", limit: 1 }).catch(() => []))[0]?.codewords_aviso_em ?? null;

/**
 * Canais CodeWords sem conversa recente e sem conferência há 20 min (nx_codewords_vigia_alvos) passam por
 * estadoCanalCodeWords: a situação gravada (nx_codewords_situacao) é quem registra histórico e notificação quando o
 * estado muda. Caído há mais de 10 min e sem aviso nas últimas 24 h → WhatsApp do gestor pelo mesmo caminho dos alertas do
 * nx-ciclo (nx_alerta_destinos + número da Nexus), com codewords_aviso_em marcado ANTES de enviar. Sem a RPC ou a coluna
 * novas (migração não aplicada) pula com log; nunca derruba o cron.
 */
export async function vigiarAparelhos(db, cfg, o = {}) {
  const inicio = Date.now();
  const agora = typeof o.agora === "function" ? o.agora().getTime() : o.agora instanceof Date ? o.agora.getTime() : Date.now();
  const res = { canais: 0, caidos: 0, avisos: 0 };
  let alvos;
  try { alvos = await db.rpc("nx_codewords_vigia_alvos", { p_limite: VIGIA_LIMITE }); }
  catch (e) {
    if (funcaoAusente(e, "nx_codewords_vigia_alvos")) {
      console.error("nx-codewords vigia: nx_codewords_vigia_alvos ausente (aplicar a migração 20261008); pulado");
      return { ...res, pulado: "rpc ausente" };
    }
    throw e;
  }
  for (const a of Array.isArray(alvos) ? alvos : []) {
    if (Date.now() - inicio > VIGIA_ORCAMENTO_MS) { res.pulado = "orçamento"; break; }
    try {
      const cred = await db.rpc("nx_canal_credencial", { p_canal: a.canal_id, p_cliente: a.cliente_id });
      if (cred?.provedor !== "codewords" || !cred.codewords_api_key) continue;
      res.canais++;
      // a RPC (migração 20261008b) já traz conectado/conferido_em/caiu_em/codewords_aviso_em; linha sem isso → lê o canal
      const antes = "conectado" in a ? { codewords_conectado: a.conectado, codewords_conferido_em: a.conferido_em }
        : (await db.select("nx_canais", { id: `eq.${a.canal_id}`, select: "codewords_conectado,codewords_conferido_em", limit: 1 }).catch(() => []))[0];
      const r = await estadoCanalCodeWords(db, cred, o);
      if (!r.ok || r.conectado !== false) continue;
      res.caidos++;
      // caído há mais de 10 min: desde a última mudança no histórico (caiu_em) ou desde a conferência anterior que já o viu caído
      const desde = a.caiu_em ?? a.desde ?? (antes?.codewords_conectado === false ? antes.codewords_conferido_em : null);
      if (!desde || agora - Date.parse(desde) < CAIDO_HA_MS) continue;
      const avisoEm = a.codewords_aviso_em ?? a.aviso_em ?? await ultimoAviso(db, a.canal_id);
      if (avisoEm && agora - Date.parse(avisoEm) < AVISO_CADA_MS) continue;
      // marca ANTES de enviar: sem a coluna nova nada sai (nunca um aviso a cada rodada de 2 min)
      try { await db.update("nx_canais", { id: `eq.${a.canal_id}` }, { codewords_aviso_em: new Date(agora).toISOString() }); }
      catch { console.error("nx-codewords vigia: sem codewords_aviso_em (aplicar a migração 20261008); aviso não enviado"); continue; }
      const destinos = (await db.rpc("nx_alerta_destinos", { p_cliente: a.cliente_id }).catch(() => null))?.destinos || [];
      if (!destinos.length) continue;
      const [c] = await db.select("nx_clientes", { id: `eq.${a.cliente_id}`, select: "nome,cfg", limit: 1 }).catch(() => []);
      const nome = nomeCurto(c || {});
      const envio = await enviarParaTodos(cfg, destinos, textoAparelhoCaido(nome, cred.codewords_numero, desde, agora),
        { fetch: o.fetch, titulo: `${nome}: WhatsApp desconectado` });
      res.avisos += envio.filter(e => e.ok).length;
    } catch (e) { console.error("nx-codewords vigia:", erroSeguro(e?.message || e)); }
  }
  return res;
}

/* ============================================================
   Handler
   ============================================================ */
async function modoCron(req, env, deps, f) {
  const db = criarDb(env, f);
  // corpo antes do banco: teto de 64 KiB (resto drenado, 413 sem tocar no banco); ilegível → {}
  const corpo = await lerCorpo(req, undefined, deps.drenagem);
  const cfg = await autenticarCron(req, db);   // 401 sem o cron_token
  const chaves = OBJ(corpo) ? Object.keys(corpo) : [];
  if (chaves.length !== 1 || corpo.sincronizar !== true) return json({ ok: false, erro: "dados_invalidos" }, 400);
  const o = { fetch: f, orcamentoMs: deps.orcamentoMs, agora: deps.agora };
  const sincronizacao = await sincronizar(db, o);
  // o vigia nunca derruba a sincronização
  const vigia = await vigiarAparelhos(db, cfg, o).catch(e => ({ erro: erroSeguro(e?.message || e) }));
  return json({ ok: true, sincronizacao, vigia });
}

/**
 * @param {Request} req
 * @param {{url: string, chave: string}} env
 * @param {{fetch?: Function, emSegundoPlano?: Function, orcamentoMs?: number, drenagem?: {prazoMs?: number, teto?: number}}} [deps]
 */
export function tratar(req, env, deps = {}) {
  // corpo não lido (URL ruim, método errado) é drenado antes da resposta
  return soltandoCorpo(req, () => tratarCodeWords(req, env, deps), deps.drenagem);
}

async function tratarCodeWords(req, env, deps) {
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
    const corpo = await lerCorpoPainel(req, undefined, deps.drenagem);
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
  }, deps.drenagem);
}
