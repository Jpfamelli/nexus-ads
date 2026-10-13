/* ============================================================
   ÓRBITA — scripts/simular-webhook.mjs (ESPEC Apêndice C)
   Manda para a nx-whatsapp uma mensagem ASSINADA igual à da Meta, para
   testar um número de cliente sem celular: texto de anúncio (referral),
   imagem, "SAIR" (descadastro) ou recibo de entrega.

   Uso:
     NX_SEGREDO=<app secret> node scripts/simular-webhook.mjs --url "<funções>/nx-whatsapp?c=<chave>" \
          --pid <phone_number_id> [--tipo texto|imagem|recibo|sair] [--from 5512988887777] \
          [--wamid wamid.X] [--status delivered|read|failed] [--nome "Paciente Teste"] \
          [--texto "..."] [--anuncio <source_id>] [--sem-anuncio] [--mostrar]

   --pid     phone_number_id que vai em metadata (o do número de teste; o de OUTRO
             cliente prova o canal_divergente do aceite 5). Sem --pid, usa NX_PID.
   --tipo recibo: precisa de --wamid (o da mensagem de saída gravada) e --status.
   --tipo <fixture> (SV-192): audio, documento, order, request_welcome, nfm_reply, button, reacao, reacao_removida,
             status_sent|status_delivered|status_read|status_failed e template_status — payloads anonimizados da Cloud API v23
             (testes/apoio/meta-fixtures.mjs); --alvo <wamid> = a mensagem reagida/respondida (reacao, button, nfm_reply).
   --mostrar: só imprime o corpo e a assinatura, sem enviar.
   O segredo NUNCA fica no arquivo: vem da variável NX_SEGREDO (plano 1000, SV-172 — fora do histórico do shell e da lista de
   processos). --segredo ainda funciona, com aviso de descontinuado.
   ============================================================ */
import { createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { evento as eventoFixture, TIPOS_FIXTURE } from "../testes/apoio/meta-fixtures.mjs";

export const TIPOS = ["texto", "imagem", "recibo", "sair"];
/** SV-192: os outros tipos vêm das fixtures da Cloud API v23 (testes/apoio/meta-fixtures.mjs): audio, documento, order,
    request_welcome, nfm_reply, button, reacao, reacao_removida, status_sent|delivered|read|failed e template_status. */
export const TIPOS_EXTRAS = TIPOS_FIXTURE.filter(t => !TIPOS.includes(t));

/** --chave valor / --flag → objeto. */
export function lerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const prox = argv[i + 1];
    if (prox == null || prox.startsWith("--")) out[k] = true;
    else { out[k] = prox; i++; }
  }
  return out;
}

const aleatorio = () => randomBytes(8).toString("hex").toUpperCase();

/** Corpo do webhook no formato da Cloud API (Apêndice C). */
export function montarPayload(o = {}) {
  const tipo = o.tipo || "texto";
  if (!TIPOS.includes(tipo) && !TIPOS_EXTRAS.includes(tipo)) throw new Error(`--tipo deve ser ${[...TIPOS, ...TIPOS_EXTRAS].join("|")}`);
  const pid = String(o.pid || "");
  if (!pid) throw new Error("informe --pid (phone_number_id do número de teste) ou NX_PID");
  if (TIPOS_EXTRAS.includes(tipo)) {
    const wamid = o.wamid && o.wamid !== true ? String(o.wamid) : `wamid.TESTE-${aleatorio()}`;
    return eventoFixture(tipo, { pid, from: o.from, waba: o.waba, nome: o.nome, agora: o.agora, texto: typeof o.texto === "string" ? o.texto : undefined,
      wamid, alvo: o.alvo, evento: o.evento, modelo: o.modelo });
  }
  const from = String(o.from || "5512988887777").replace(/\D/g, "");
  const agora = String(Math.floor((o.agora ? new Date(o.agora) : new Date()).getTime() / 1000));
  const metadata = { display_phone_number: "5512999990000", phone_number_id: pid };
  let value;
  if (tipo === "recibo") {
    if (!o.wamid) throw new Error("--tipo recibo precisa de --wamid");
    const status = o.status || "delivered";
    if (!["sent", "delivered", "read", "failed"].includes(status)) throw new Error("--status deve ser sent|delivered|read|failed");
    value = {
      messaging_product: "whatsapp", metadata,
      statuses: [{
        id: String(o.wamid), status, timestamp: agora, recipient_id: from,
        ...(status === "failed" ? { errors: [{ code: 190, title: "Invalid OAuth access token" }] } : {}),
      }],
    };
  } else {
    const msg = { from, id: String(o.wamid || `wamid.TESTE-${aleatorio()}`), timestamp: agora };
    if (tipo === "sair") Object.assign(msg, { type: "text", text: { body: "SAIR" } });
    else if (tipo === "imagem") {
      Object.assign(msg, { type: "image", image: { id: `TESTE-MIDIA-${aleatorio()}`, mime_type: "image/jpeg", sha256: aleatorio(), caption: o.texto || "Foto de teste" } });
    } else {
      Object.assign(msg, { type: "text", text: { body: o.texto || "Oi, vi o anúncio do clareamento. Quanto custa?" } });
    }
    if (tipo === "texto" && !o["sem-anuncio"]) {
      msg.referral = {
        source_url: "https://fb.me/x", source_id: String(o.anuncio || "TESTE-ANUNCIO"), source_type: "ad",
        headline: "Clareamento", ctwa_clid: "TESTE-CLID",
      };
    }
    value = {
      messaging_product: "whatsapp", metadata,
      contacts: [{ profile: { name: o.nome || "Paciente Teste" }, wa_id: from }],
      messages: [msg],
    };
  }
  return { object: "whatsapp_business_account", entry: [{ id: String(o.waba || "TESTE-WABA"), changes: [{ field: "messages", value }] }] };
}

/** Segredo do app: NX_SEGREDO (preferido) ou --segredo (descontinuado: fica no histórico do shell e visível na lista de
    processos). → {segredo, aviso?} */
export function segredoDe(o = {}, env = process.env) {
  if (o.segredo && o.segredo !== true) {
    return { segredo: String(o.segredo), aviso: "--segredo está descontinuado (fica no histórico do shell e na lista de processos): use a variável NX_SEGREDO." };
  }
  return { segredo: env.NX_SEGREDO ? String(env.NX_SEGREDO) : null };
}

/** X-Hub-Signature-256: sha256=<HMAC-SHA256(segredo, corpo cru)>. */
export const assinar = (corpo, segredo) => `sha256=${createHmac("sha256", String(segredo)).update(corpo).digest("hex")}`;

export async function simular(o, f = globalThis.fetch) {
  if (!o.url || o.url === true) throw new Error("informe --url (…/functions/v1/nx-whatsapp?c=<chave>)");
  if (!o.segredo || o.segredo === true) throw new Error("informe o app secret do número de teste na variável NX_SEGREDO");
  const payload = montarPayload(o);
  const corpo = JSON.stringify(payload);
  const assinatura = assinar(corpo, o.segredo);
  if (o.mostrar) return { mostrado: true, corpo: payload, assinatura };
  const r = await f(String(o.url), {
    method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: corpo,
  });
  const txt = await r.text();
  let dados = txt;
  try { dados = JSON.parse(txt); } catch { /* texto puro */ }
  return { status: r.status, resposta: dados, wamid: payload.entry[0].changes[0].value.messages?.[0]?.id ?? null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = lerArgs(process.argv.slice(2));
  if (!o.pid && process.env.NX_PID) o.pid = process.env.NX_PID;
  const sg = segredoDe(o);
  if (sg.aviso) console.error(`AVISO: ${sg.aviso}`);
  o.segredo = sg.segredo;
  simular(o).then(r => {
    console.log(JSON.stringify(r, null, 2));
    if (r.status && r.status >= 300) process.exitCode = 1;
  }).catch(e => { console.error(`ERRO: ${e.message}`); process.exitCode = 1; });
}
