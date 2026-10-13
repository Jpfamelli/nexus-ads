/* ÓRBITA — testes/apoio/meta-fixtures.mjs (plano «1000+ melhorias», SV-192)
   Payloads do webhook da WhatsApp Cloud API (Graph v23) num lugar só, ANONIMIZADOS (telefones 5512988887777/5512999990000,
   ids TESTE-…, nada de cliente real). Usados pelos testes (plano1000-ci) e pelo scripts/simular-webhook.mjs (--tipo).

   mensagem(tipo, o)   item de value.messages[] (texto, imagem, audio, documento, order, request_welcome, nfm_reply, button,
                       reacao, reacao_removida)
   recibo(status, o)   item de value.statuses[] (sent, delivered, read, failed — este com errors[] como a Meta manda)
   evento(nome, o)     corpo completo do POST ({object, entry:[{id, changes:[{field, value}]}]}) para qualquer nome de
                       TIPOS_FIXTURE; «template_status» é o message_template_status_update (field próprio, sem messages).
   o = {pid, from, wamid, waba, agora (Date|ISO|ms), nome, texto, alvo (wamid da mensagem reagida/respondida)} */

export const MENSAGENS = ["texto", "imagem", "audio", "documento", "order", "request_welcome", "nfm_reply", "button", "reacao", "reacao_removida"];
export const RECIBOS = ["sent", "delivered", "read", "failed"];
export const TIPOS_FIXTURE = [...MENSAGENS, ...RECIBOS.map(s => `status_${s}`), "template_status"];

const PADRAO = { pid: "TESTE-PID-111", from: "5512988887777", waba: "100000000000001", nome: "Paciente Teste" };
const seg = agora => String(Math.floor((agora == null ? Date.now() : new Date(agora).getTime()) / 1000));
let contador = 0;
const wamidNovo = () => `wamid.TESTE-${(++contador).toString(16).toUpperCase().padStart(6, "0")}`;
const JOINHA = String.fromCodePoint(0x1f44d);

/** Item de value.messages[] no formato da v23. */
export function mensagem(tipo, o = {}) {
  const from = String(o.from || PADRAO.from).replace(/\D/g, "");
  const base = { from, id: String(o.wamid || wamidNovo()), timestamp: seg(o.agora) };
  const alvo = String(o.alvo || "wamid.TESTE-SAIDA-1");
  switch (tipo) {
    case "texto": return { ...base, type: "text", text: { body: o.texto ?? "Oi, quero marcar uma avaliação" } };
    case "imagem": return { ...base, type: "image", image: { caption: o.texto ?? "Foto do sorriso", mime_type: "image/jpeg", sha256: "TESTE-SHA-IMG", id: "TESTE-MIDIA-IMG-1" } };
    case "audio": return { ...base, type: "audio", audio: { mime_type: "audio/ogg; codecs=opus", sha256: "TESTE-SHA-AUD", id: "TESTE-MIDIA-AUD-1", voice: true } };
    case "documento": return { ...base, type: "document", document: { caption: o.texto ?? "Meu exame", filename: "exame-teste.pdf", mime_type: "application/pdf", sha256: "TESTE-SHA-DOC", id: "TESTE-MIDIA-DOC-1" } };
    case "order": return { ...base, type: "order", order: { catalog_id: "TESTE-CATALOGO", text: o.texto ?? "Pode entregar à tarde",
      product_items: [{ product_retailer_id: "SKU-CLAREAMENTO", quantity: 1, item_price: 450, currency: "BRL" }, { product_retailer_id: "SKU-LIMPEZA", quantity: 2, item_price: 150, currency: "BRL" }] } };
    // o cliente tocou em «Enviar mensagem» no anúncio sem digitar nada (com o referral do anúncio)
    case "request_welcome": return { ...base, type: "request_welcome", referral: { source_url: "https://fb.me/teste", source_id: "TESTE-ANUNCIO-1", source_type: "ad", headline: "Clareamento", ctwa_clid: "TESTE-CLID" } };
    // resposta de WhatsApp Flow
    case "nfm_reply": return { ...base, type: "interactive", context: { from: "5512999990000", id: alvo },
      interactive: { type: "nfm_reply", nfm_reply: { response_json: JSON.stringify({ flow_token: "TESTE-FLOW", horario: "manha" }), body: "Sent", name: "flow" } } };
    // botão de resposta rápida de um modelo (quick reply)
    case "button": return { ...base, type: "button", context: { from: "5512999990000", id: alvo }, button: { payload: "CONFIRMAR", text: "Confirmar consulta" } };
    case "reacao": return { ...base, type: "reaction", reaction: { message_id: alvo, emoji: JOINHA } };
    // reação removida: a Meta manda a reação sem o emoji
    case "reacao_removida": return { ...base, type: "reaction", reaction: { message_id: alvo } };
    default: throw new Error(`mensagem de fixture desconhecida: ${tipo} (use ${MENSAGENS.join("|")})`);
  }
}

/** Item de value.statuses[] no formato da v23 (failed com errors[] e error_data). */
export function recibo(status, o = {}) {
  if (!RECIBOS.includes(status)) throw new Error(`status de fixture desconhecido: ${status} (use ${RECIBOS.join("|")})`);
  const from = String(o.from || PADRAO.from).replace(/\D/g, "");
  const r = { id: String(o.wamid || "wamid.TESTE-SAIDA-1"), status, timestamp: seg(o.agora), recipient_id: from };
  if (status !== "failed" && status !== "read") {
    r.conversation = { id: "TESTE-CONVERSA-1", origin: { type: "service" } };
    r.pricing = { billable: true, pricing_model: "PMP", category: "service", type: "regular" };
  }
  if (status === "failed") {
    r.errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message",
      error_data: { details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." },
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/" }];
  }
  return r;
}

/** Corpo completo do webhook para um dos TIPOS_FIXTURE. */
export function evento(nome, o = {}) {
  const pid = String(o.pid || PADRAO.pid), waba = String(o.waba || PADRAO.waba);
  const from = String(o.from || PADRAO.from).replace(/\D/g, "");
  const metadata = { display_phone_number: "5512999990000", phone_number_id: pid };
  let field = "messages", value;
  if (nome === "template_status") {
    field = "message_template_status_update";
    value = { event: o.evento || "APPROVED", message_template_id: 123456789, message_template_name: o.modelo || "lembrete_consulta",
      message_template_language: "pt_BR", reason: o.evento === "REJECTED" ? "INVALID_FORMAT" : "NONE" };
  } else if (nome.startsWith("status_")) {
    value = { messaging_product: "whatsapp", metadata, statuses: [recibo(nome.slice(7), o)] };
  } else {
    value = { messaging_product: "whatsapp", metadata, contacts: [{ profile: { name: o.nome || PADRAO.nome }, wa_id: from }], messages: [mensagem(nome, o)] };
  }
  if (!TIPOS_FIXTURE.includes(nome)) throw new Error(`fixture desconhecida: ${nome} (use ${TIPOS_FIXTURE.join("|")})`);
  return { object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field, value }] }] };
}
