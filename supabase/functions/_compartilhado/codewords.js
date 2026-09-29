/* ============================================================
   ÓRBITA — CodeWords WhatsApp bridge
   - POST /nx-codewords?ch=<one-time-shared-channel-secret>
   - normalized callbacks: message (in/out) and status
   - API calls to a per-channel CodeWords workflow stay server-side
   ============================================================ */
import { criarDb } from "./db.js";
import { json, limparErro, comPrazo, soDigitos } from "./comum.js";
import { hojeSP } from "./nucleo.js";

const MAX_BODY = 64 * 1024;
const MAX_PROVIDER_ID = 160;
const STATUS = new Set(["sent", "delivered", "read", "failed"]);
const EVENT_ID = /^[A-Za-z0-9._:-]{1,160}$/;

export const codewordsWamid = (channel, direction, providerId) =>
  `cw:${String(channel)}:${direction}:${String(providerId).slice(0, MAX_PROVIDER_ID)}`.slice(0, 256);

const erroSeguro = value => limparErro(value).replace(/\bcw(?:k|otk)-[A-Za-z0-9_-]{8,}/g, "cw***");

function dataIso(v) {
  if (!v) return null;
  const n = typeof v === "number" ? (v < 10_000_000_000 ? v * 1000 : v) : Date.parse(String(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Math.min(n, Date.now())).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function variantesCodeWords(tel) {
  const d = soDigitos(tel), v = new Set(d ? [d] : []);
  const nac = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d.length >= 10 && d.length <= 11 ? d : null;
  if (nac) {
    const com9 = nac.length === 10 && /[6-9]/.test(nac[2]) ? `${nac.slice(0, 2)}9${nac.slice(2)}` : null;
    const sem9 = nac.length === 11 && nac[2] === "9" ? `${nac.slice(0, 2)}${nac.slice(3)}` : null;
    for (const n of [nac, com9, sem9]) if (n) { v.add(n); v.add(`55${n}`); }
  }
  return [...v];
}

/** Call one published CodeWords workflow; never intended for browser use. */
export async function enviarTextoCodeWords(cred, destino, texto, options = {}) {
  const f = comPrazo(options.fetch || globalThis.fetch, options.timeoutMs || 60_000);
  if (!cred?.codewords_api_key || !cred?.codewords_service_id) {
    return { ok: false, erro: { title: "Integração CodeWords incompleta" } };
  }
  const telefone = soDigitos(destino);
  const mensagem = String(texto || "").trim();
  if (telefone.length < 8 || telefone.length > 15 || !mensagem || mensagem.length > 4096) {
    return { ok: false, erro: { title: "Telefone ou texto inválido para o canal CodeWords" } };
  }
  const clientRef = String(options.clientRef || `orbita:${crypto.randomUUID()}`).slice(0, 180);
  let response;
  try {
    response = await f(`https://runtime.codewords.ai/run/${encodeURIComponent(cred.codewords_service_id)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.codewords_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "orbita.send_message",
        to: telefone,
        text: mensagem,
        client_ref: clientRef,
        conversation_id: options.conversationId ? String(options.conversationId) : null,
      }),
    });
  } catch (e) {
    const detalhe = `${erroSeguro(e?.message || e).slice(0, 150)}; o envio pode ter sido aceito, confirme antes de reenviar`;
    return { ok: false, provedor: "codewords", ambigua: true, clientRef, erro: { title: `CodeWords indisponível: ${detalhe}` } };
  }
  const raw = await response.text().catch(() => "");
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  const result = body?.result && typeof body.result === "object" ? body.result
    : body?.output && typeof body.output === "object" ? body.output : body;
  const providerId = String(result?.message_id || result?.id || "").trim();
  const temId = !!providerId && providerId.length <= MAX_PROVIDER_ID && EVENT_ID.test(providerId);
  const status = STATUS.has(String(result?.status)) ? String(result.status) : "sent";
  const ok = response.ok && result?.ok !== false && temId && status !== "failed";
  if (!ok) {
    const ambiguo = response.status >= 500 || [408, 425, 429].includes(response.status) || (response.ok && !temId);
    const detail = result?.error || result?.message || body?.error || (response.ok
      ? status === "failed" ? "workflow confirmou falha no envio" : "workflow não retornou message_id; a mensagem pode ter sido enviada, confirme antes de tentar de novo"
      : `Runtime HTTP ${response.status}; confira a API key e o Service ID${ambiguo ? "; confirme o histórico antes de reenviar para evitar duplicidade" : ""}`);
    return {
      ok: false, provedor: "codewords", ambigua: ambiguo, clientRef,
      ...(temId ? { wamid: codewordsWamid(cred.canal_id, "out", providerId), providerId } : {}),
      erro: { title: `CodeWords: ${erroSeguro(detail).slice(0, 220)}` },
    };
  }
  return {
    ok: true,
    provedor: "codewords",
    wamid: codewordsWamid(cred.canal_id, "out", providerId),
    providerId,
    clientRef,
    status,
  };
}

function statusText(s) {
  const t = String(s?.error || s?.erro || "").replace(/\s+/g, " ").trim();
  return t ? `CodeWords: ${erroSeguro(t).slice(0, 400)}` : "CodeWords não confirmou o envio";
}

async function tratarEvento(db, canal, event) {
  const tipo = String(event?.event || event?.type || "");
  if (tipo === "status") {
    const id = String(event?.message_id || event?.id || "").trim();
    const status = String(event?.status || "").toLowerCase();
    if (!EVENT_ID.test(id) || !STATUS.has(status)) return { ok: true, ignorado: "status inválido" };
    const r = await db.rpc("nx_codewords_status", {
      p_canal: canal.canal_id, p_id: id, p_status: status,
      p_erro: status === "failed" ? statusText(event) : null,
    });
    return { ok: true, tipo: "status", ...r };
  }
  if (tipo !== "message") return { ok: true, ignorado: "evento desconhecido" };

  const direcao = String(event?.direction || "in").toLowerCase();
  const m = event?.message && typeof event.message === "object" ? event.message : event;
  const externalId = String(m?.message_id || m?.id || "").trim();
  const telefone = soDigitos(m?.phone || m?.from || m?.wa_id);
  const texto = String(m?.text ?? m?.body ?? "").slice(0, 4096);
  if (!EVENT_ID.test(externalId) || telefone.length < 8 || telefone.length > 15 || !texto.trim()) {
    return { ok: false, erro: "mensagem precisa de message_id, phone e text" };
  }
  if (direcao === "out") {
    const r = await db.rpc("nx_codewords_saida", { p_canal: canal.canal_id, p_msg: {
      id: externalId, wa_id: telefone, text: texto,
    } });
    return { ok: true, tipo: "message_out", ...r };
  }
  if (direcao !== "in") return { ok: false, erro: "direction deve ser in ou out" };

  const msg = {
    wamid: codewordsWamid(canal.canal_id, "in", externalId),
    wa_id: telefone,
    nome: String(m?.name || m?.contact_name || "").slice(0, 160) || null,
    tipo: "texto",
    corpo: texto,
    em: dataIso(m?.timestamp || m?.sent_at),
    ...(m?.referral && typeof m.referral === "object" ? { referral: m.referral } : {}),
  };
  const gravado = await db.rpc("nx_wa_entrada", { p_canal: canal.canal_id, p_msg: msg });
  if (gravado?.bloqueado) return { ok: true, tipo: "message_in", ...gravado };

  let lead = "existente";
  try {
    const ref = msg.referral;
    let atribuicao = null;
    if (ref) {
      const ad = ref.source_type === "ad";
      const anuncio = ref.source_id == null || ref.source_id === "" ? null : String(ref.source_id).slice(0, 120);
      let campanha = null;
      if (ad && anuncio) {
        const [row] = await db.select("nx_metricas_dia", {
          cliente_id: `eq.${canal.cliente_id}`, plataforma: "eq.meta", nivel: "eq.anuncio",
          anuncio_ext: `eq.${anuncio}`, select: "campanha_ext", order: "data.desc", limit: 1,
        });
        campanha = row?.campanha_ext || null;
      }
      atribuicao = { origem: ad ? "anuncio" : "whatsapp", plataforma: ad ? "meta" : null,
        anuncio_ext: anuncio, campanha_ext: campanha, ctwa_clid: ref.ctwa_clid || null };
    }
    lead = await db.rpc("nx_lead_webhook", {
      p_cliente: canal.cliente_id, p_telefone: telefone, p_variantes: variantesCodeWords(telefone),
      p_nome: msg.nome, p_atr: atribuicao, p_hoje: hojeSP(), p_dias: 30,
    });
  } catch {
    // O provedor pode repetir o evento; nx_wa_entrada é idempotente e a rotina
    // do lead também, permitindo reparar falha parcial sem duplicar a conversa.
    throw new Error("falha ao registrar o lead do contato");
  }
  return { ok: true, tipo: "message_in", mensagem: gravado?.mensagem_id || null, lead };
}

/** Entry point for external CodeWords HTTP POST callbacks. */
export async function tratarCodeWords(req, env, deps = {}) {
  if (req.method !== "POST") return json({ ok: false, erro: "método não permitido" }, 405);
  const u = new URL(req.url);
  const chave = u.searchParams.get("ch") || "";
  if (!/^[0-9a-f]{64}$/.test(chave)) return json({ ok: false, erro: "canal inválido" }, 401);
  const f = deps.fetch || globalThis.fetch;
  try {
    const db = criarDb(env, f);
    const canal = await db.rpc("nx_codewords_canal", { p_chave: chave });
    if (!canal?.canal_id) return json({ ok: false, erro: "canal inválido" }, 401);
    const tamanho = Number(req.headers.get("content-length") || 0);
    if (tamanho > MAX_BODY) return json({ ok: false, erro: "corpo excede o limite" }, 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_BODY) return json({ ok: false, erro: "corpo excede o limite" }, 413);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return json({ ok: false, erro: "JSON inválido" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, erro: "evento inválido" }, 400);
    return json(await tratarEvento(db, canal, body));
  } catch (e) {
    // Não devolve o URL/chave, cabeçalhos ou payload no erro público.
    const detalhe = erroSeguro(e?.message || e).replace(/[?&]ch=[0-9a-f]+/gi, "?ch=[redigido]").slice(0, 240);
    console.error("nx-codewords:", detalhe);
    return json({ ok: false, erro: "falha ao processar evento" }, 500);
  }
}

export async function testarCodeWords(cred, options = {}) {
  const f = comPrazo(options.fetch || globalThis.fetch, options.timeoutMs || 60_000);
  if (!cred?.codewords_api_key || !cred?.codewords_service_id) return { ok: false, erro: "integração incompleta" };
  try {
    const r = await f(`https://runtime.codewords.ai/run/${encodeURIComponent(cred.codewords_service_id)}`, {
      method: "POST", headers: { Authorization: `Bearer ${cred.codewords_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ event: "orbita.health_check", version: 1 }),
    });
    let b = {}; try { b = await r.json(); } catch { /* resposta sem JSON */ }
    if (!r.ok) {
      const dica = r.status === 401 ? "API key recusada; confira se é reutilizável e está ativa"
        : r.status === 404 ? "Service ID não encontrado ou workflow não publicado"
          : r.status === 429 ? "limite temporário do CodeWords atingido" : `Runtime HTTP ${r.status}`;
      return { ok: false, erro: dica };
    }
    const out = b?.result && typeof b.result === "object" ? b.result : b?.output && typeof b.output === "object" ? b.output : b;
    return out?.ok === true ? { ok: true } : { ok: false, erro: "workflow não confirmou orbita.health_check" };
  } catch (e) { return { ok: false, erro: erroSeguro(e?.message || e).slice(0, 200) }; }
}

export async function tratar(req, env, deps = {}) {
  return tratarCodeWords(req, env, { ...deps, fetch: deps.fetch || globalThis.fetch });
}
