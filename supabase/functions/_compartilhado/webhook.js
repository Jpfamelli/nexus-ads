/* ============================================================
   NEXUS ADS — webhook.js (nx-whatsapp)
   Webhook da WhatsApp Cloud API no número da CLÍNICA: cada conversa
   nova vira um lead em nx_leads, com o anúncio de origem (referral).
   ============================================================ */
import { criarDb } from "./db.js";
import { hojeSP } from "./nucleo.js";
import { json, agoraDe, somaDias, soDigitos, iguaisSeguro, limparErro, lerConfig } from "./comum.js";

const DIAS_MESMA_CONVERSA = 30;

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

/** Formas do mesmo celular: com/sem 55 e com/sem o 9 (o WhatsApp às vezes
    manda números antigos sem o 9, e o cadastro manual costuma vir sem o 55). */
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

async function atribuicao(db, clienteId, ref) {
  const ad = ref.source_type === "ad";
  const anuncio = ref.source_id != null && ref.source_id !== "" ? String(ref.source_id) : null;
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

async function registrarMensagem(db, clienteId, telefone, nome, referral, hoje) {
  const [lead] = await db.select("nx_leads", {
    cliente_id: `eq.${clienteId}`,
    telefone: `in.(${variantesTelefone(telefone).join(",")})`,
    data_conversa: `gte.${somaDias(hoje, -DIAS_MESMA_CONVERSA)}`,
    select: "id,anuncio_ext", order: "data_conversa.desc,id.desc", limit: 1,
  });
  const atr = referral ? await atribuicao(db, clienteId, referral) : null;

  if (lead) {
    if (!atr || !atr.anuncio_ext || lead.anuncio_ext) return "existente";
    const mudanca = { anuncio_ext: atr.anuncio_ext, ctwa_clid: atr.ctwa_clid };
    if (atr.campanha_ext) mudanca.campanha_ext = atr.campanha_ext;
    if (atr.plataforma) { mudanca.plataforma = atr.plataforma; mudanca.origem = atr.origem; }
    await db.update("nx_leads", { id: `eq.${lead.id}` }, mudanca);
    return "atribuido";
  }

  await db.insert("nx_leads", {
    cliente_id: clienteId, telefone, nome: nome || null,
    origem: atr?.origem || "whatsapp", plataforma: atr?.plataforma ?? null,
    campanha_ext: atr?.campanha_ext ?? null, anuncio_ext: atr?.anuncio_ext ?? null, ctwa_clid: atr?.ctwa_clid ?? null,
    data_conversa: hoje, etapa: "nova",
  }, { retornar: false });
  return "criado";
}

async function processar(db, corpo, hoje) {
  const cont = { criado: 0, atribuido: 0, existente: 0, sem_cliente: 0 };
  const clientes = new Map();   // phone_number_id → cliente | null
  for (const entry of corpo?.entry || []) {
    for (const ch of entry?.changes || []) {
      if (ch?.field && ch.field !== "messages") continue;
      const v = ch?.value || {};
      const msgs = Array.isArray(v.messages) ? v.messages : [];   // `statuses` (recibos) ficam de fora
      if (!msgs.length) continue;
      const pid = v.metadata?.phone_number_id;
      if (!pid) continue;
      if (!clientes.has(pid)) {
        const [c] = await db.select("nx_clientes", { wa_phone_number_id: `eq.${pid}`, select: "id,slug", limit: 1 });
        clientes.set(pid, c || null);
      }
      const cliente = clientes.get(pid);
      if (!cliente) { cont.sem_cliente += msgs.length; continue; }

      const contatos = Array.isArray(v.contacts) ? v.contacts : [];
      const nomes = new Map(contatos.map(c => [soDigitos(c.wa_id), c.profile?.name]));
      for (const m of msgs) {
        if (m?.type === "system") continue;
        const tel = soDigitos(m?.from);
        if (!tel) continue;
        const nome = nomes.get(tel) || (contatos.length === 1 ? contatos[0].profile?.name : null);
        cont[await registrarMensagem(db, cliente.id, tel, nome, m.referral || null, hoje)]++;
      }
    }
  }
  return cont;
}

/**
 * GET: verificação do webhook (hub.challenge). POST: mensagens, com assinatura da Meta.
 * @param {{fetch?: Function, agora?: Date|Function}} [deps]
 */
export async function tratar(req, env, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  try {
    const db = criarDb(env, f);

    if (req.method === "GET") {
      const u = new URL(req.url);
      const cfg = await lerConfig(db);
      const ok = u.searchParams.get("hub.mode") === "subscribe"
        && cfg?.wa_verify_token && iguaisSeguro(u.searchParams.get("hub.verify_token"), cfg.wa_verify_token);
      return ok
        ? new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } })
        : new Response("proibido", { status: 403 });
    }
    if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

    const cru = new Uint8Array(await req.arrayBuffer());
    const cfg = await lerConfig(db);
    if (!cfg?.meta_app_secret || !(await assinaturaValida(cfg.meta_app_secret, cru, req.headers.get("x-hub-signature-256")))) {
      return new Response("assinatura inválida", { status: 401 });
    }

    // Assinatura válida → sempre 200: erro aqui não pode virar uma fila de reenvios da Meta.
    let corpo;
    try { corpo = JSON.parse(new TextDecoder().decode(cru)); } catch { return json({ ok: true, ignorado: "corpo não é JSON" }); }
    try {
      return json({ ok: true, ...await processar(db, corpo, hojeSP(agoraDe(deps))) });
    } catch (e) {
      const erro = limparErro(e?.message || e);
      console.error("nx-whatsapp:", erro);
      return json({ ok: true, erro });
    }
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, 500);
  }
}
