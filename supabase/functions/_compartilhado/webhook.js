/* ============================================================
   NEXUS ADS — webhook.js (nx-whatsapp)
   Um webhook, dois números:
   - número da CLÍNICA (nx_clientes.wa_phone_number_id): cada conversa nova
     vira um lead em nx_leads, com o anúncio de origem (referral);
   - número da NEXUS (nx_config.wa_phone_number_id): recibos de entrega dos
     alertas e relatórios (delivered/read/failed) → entregue_em / erro; fora
     da janela de 24h, reenvia UMA vez como template.
   ============================================================ */
import { criarDb } from "./db.js";
import { hojeSP } from "./nucleo.js";
import { enviarTemplate, foraDaJanela } from "./whatsapp.js";
import {
  json, agoraDe, soDigitos, iguaisSeguro, limparErro, lerConfig, comPrazo,
  nomeCurto, tituloRadar, tituloRelatorio,
} from "./comum.js";

const DIAS_MESMA_CONVERSA = 30;
const RESULTADOS_LEAD = new Set(["criado", "atribuido", "existente"]);
// O recibo pode chegar antes de o nx-ciclo/nx-relatorio gravar o wamid (a Meta avisa em
// ~1 s; com vários destinos, o primeiro recibo chega enquanto o segundo ainda está saindo).
// Recibo recente sem registro: espera um pouco e confere de novo, uma vez.
const ESPERA_STATUS_MS = 4000;
const RECENTE_S = 600;
// um reenvio por wamid, mesmo que a Meta mande o mesmo recibo duas vezes (ou ao mesmo tempo)
const TRAVA_REENVIO_S = 7 * 86400;
// o webhook precisa responder rápido à Meta: o reenvio por template não espera os 30 s do sync
const PRAZO_ENVIO_MS = 10_000;
// wamid é base64 com prefixo: nada de aspas, chaves, vírgulas ou barra invertida
const WAMID_OK = /^[\w.:=+/-]{1,256}$/;

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

/* ------------------------------------------------------------
   Número da clínica → leads
   ------------------------------------------------------------ */

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

/** Procura → decide → grava numa transação só no banco (nx_lead_webhook), com trava por
    cliente + telefone: dois webhooks da mesma pessoa ao mesmo tempo viram UM lead. */
async function registrarMensagem(db, clienteId, telefone, nome, referral, hoje) {
  const atr = referral ? await atribuicao(db, clienteId, referral) : null;
  const r = await db.rpc("nx_lead_webhook", {
    p_cliente: clienteId, p_telefone: telefone, p_variantes: variantesTelefone(telefone),
    p_nome: nome || null, p_atr: atr, p_hoje: hoje, p_dias: DIAS_MESMA_CONVERSA,
  });
  if (!RESULTADOS_LEAD.has(r)) throw new Error(`nx_lead_webhook devolveu ${JSON.stringify(r)}`);
  return r;
}

async function processarMensagens(db, v, msgs, clientes, cont, ctx) {
  const pid = v.metadata.phone_number_id;
  if (!clientes.has(pid)) {
    const [c] = await db.select("nx_clientes", { wa_phone_number_id: `eq.${pid}`, select: "id,slug", limit: 1 });
    clientes.set(pid, c || null);
  }
  const cliente = clientes.get(pid);
  if (!cliente) { cont.sem_cliente += msgs.length; return; }

  const contatos = Array.isArray(v.contacts) ? v.contacts : [];
  const nomes = new Map(contatos.map(c => [soDigitos(c.wa_id), c.profile?.name]));
  for (const m of msgs) {
    if (m?.type === "system") continue;
    const tel = soDigitos(m?.from);
    if (!tel) continue;
    const nome = nomes.get(tel) || (contatos.length === 1 ? contatos[0].profile?.name : null);
    // uma mensagem com erro não derruba as outras do lote
    try { cont[await registrarMensagem(db, cliente.id, tel, nome, m.referral || null, ctx.hoje)]++; }
    catch (e) { ctx.falhou(e); }
  }
}

/* ------------------------------------------------------------
   Número da Nexus → recibos de entrega dos avisos
   ------------------------------------------------------------ */

// códigos mais comuns do recibo "failed", explicados para quem não é programador
const DICAS_FALHA = {
  131026: "o número não pôde receber (sem WhatsApp, bloqueou a Nexus ou aplicativo muito antigo)",
  131030: "o número não está na lista de teste (Configuração da API → Para)",
  131031: "a conta do WhatsApp da Nexus está bloqueada ou restrita",
  131042: "problema de pagamento na conta do WhatsApp da Nexus",
  131049: "a Meta segurou a mensagem para não cansar quem recebe",
  131050: "a pessoa pediu para não receber mensagens da Nexus",
};

/** "WhatsApp não entregou (código X): título" (+ dica em português quando conhecida). */
export function textoFalha(e, { temTemplate = false, eraTemplate = false } = {}) {
  const codigo = e?.code != null && e.code !== "" ? e.code : "?";
  const titulo = String(e?.title || e?.message || "falhou").replace(/\s+/g, " ").trim().slice(0, 120);
  let dica = DICAS_FALHA[Number(codigo)] || "";
  if (!dica && foraDaJanela(e)) {
    dica = eraTemplate ? "nem o modelo foi aceito" : temTemplate ? "" : "fora da janela de 24h e sem modelo (wa_template) configurado";
  }
  return `WhatsApp não entregou (código ${codigo}): ${titulo}${dica ? ` — ${dica}` : ""}`;
}

/** Alertas e relatórios que levaram este wamid (texto OU template). */
async function buscarEnvio(db, wamid) {
  const arr = `{"${wamid}"}`;
  const or = `(wa_ids.cs.${arr},wa_ids_template.cs.${arr})`;
  const [alertas, relatorios] = await Promise.all([
    db.select("nx_alertas", { or, select: "id,cliente_id,wa_ids_template", order: "id.asc", limit: 100 }),
    db.select("nx_relatorios", { or, select: "id,cliente_id,tipo,referencia,wa_ids_template", order: "id.asc", limit: 10 }),
  ]);
  return [
    ...(alertas.length ? [{ tabela: "nx_alertas", linhas: alertas }] : []),
    ...(relatorios.length ? [{ tabela: "nx_relatorios", linhas: relatorios }] : []),
  ];
}

/** Anotação atômica no banco (entregue_em só na 1ª vez, template e erro sem repetir). */
const anotar = (db, achados, extra) => Promise.all(achados.map(a =>
  db.rpc("nx_wa_anotar", { p_tabela: a.tabela, p_ids: a.linhas.map(l => l.id), ...extra })));

/** O MESMO título curto que o nx-ciclo / nx-relatorio usou no envio original. */
async function tituloDoEnvio(db, achados) {
  const rel = achados.find(a => a.tabela === "nx_relatorios")?.linhas[0];
  const alertas = achados.find(a => a.tabela === "nx_alertas")?.linhas || [];
  const clienteId = rel?.cliente_id || alertas[0]?.cliente_id;
  const [c] = clienteId ? await db.select("nx_clientes", { id: `eq.${clienteId}`, select: "nome,cfg", limit: 1 }) : [];
  const nome = nomeCurto(c || {});
  return rel ? tituloRelatorio(rel.tipo, nome, rel.referencia) : tituloRadar(nome, alertas.length);
}

const quandoDo = (st, agora) => {
  const t = Number(st?.timestamp);
  return Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : agora.toISOString();
};
const recente = (st, agora) => {
  const t = Number(st?.timestamp);
  return !Number.isFinite(t) || t <= 0 || Math.abs(agora.getTime() / 1000 - t) <= RECENTE_S;
};

/** @returns {Promise<"entregue"|"falha"|"reenviado"|"repetido"|"sem_registro"|"ignorado">} */
async function tratarStatus(db, cfg, st, ctx) {
  const wamid = String(st?.id ?? "");
  const tipo = st?.status;
  if (!["delivered", "read", "failed"].includes(tipo) || !WAMID_OK.test(wamid)) return "ignorado";   // 'sent' não interessa
  const achados = await buscarEnvio(db, wamid);
  if (!achados.length) return "sem_registro";

  if (tipo !== "failed") {
    await anotar(db, achados, { p_entregue_em: quandoDo(st, ctx.agora) });
    return "entregue";
  }

  const e = (Array.isArray(st.errors) && st.errors[0]) || {};
  const eraTemplate = achados.some(a => a.linhas.some(l => (l.wa_ids_template || []).includes(wamid)));
  // Só o TEXTO que falhou por janela fechada é reenviado, e uma vez só: o wamid do template vai
  // para wa_ids_template (nunca é reenviado) e a trava por wamid barra o recibo repetido.
  if (!eraTemplate && foraDaJanela(e) && cfg.wa_template) {
    const pegou = await db.rpc("nx_trava_pegar", { p_nome: `wa-reenvio:${wamid}`, p_segundos: TRAVA_REENVIO_S, p_dono: ctx.dono });
    if (pegou !== true) return "repetido";
    let novo = null, nota;
    try {
      const r = await enviarTemplate(cfg, st.recipient_id, await tituloDoEnvio(db, achados), { fetch: ctx.rede });
      novo = r.id;
      nota = "fora da janela de 24h — reenviado como template";
    } catch (err) {
      nota = `fora da janela de 24h e o template falhou — ${limparErro(err?.message || err)}`;
    }
    await anotar(db, achados, { p_wa_id_template: novo, p_erro: nota });
    return novo ? "reenviado" : "falha";
  }

  await anotar(db, achados, { p_erro: textoFalha(e, { temTemplate: !!cfg.wa_template, eraTemplate }) });
  return "falha";
}

async function processarStatuses(db, cfg, lista, cont, ctx) {
  const pendentes = [];
  const um = async (st, ultimaVez) => {
    try {
      const r = await tratarStatus(db, cfg, st, ctx);
      if (r === "sem_registro" && !ultimaVez && recente(st, ctx.agora)) { pendentes.push(st); return; }
      cont.recibos[r] = (cont.recibos[r] || 0) + 1;
    } catch (e) { ctx.falhou(e); }   // um recibo com erro não derruba os outros
  };
  for (const st of lista) await um(st, false);
  if (!pendentes.length) return;
  await ctx.esperar(ESPERA_STATUS_MS);
  for (const st of pendentes) await um(st, true);
}

/* ------------------------------------------------------------ */

async function processar(db, cfg, corpo, ctx) {
  const cont = { criado: 0, atribuido: 0, existente: 0, sem_cliente: 0 };
  const clientes = new Map();   // phone_number_id → cliente | null
  const recibos = [];
  const nexus = cfg.wa_phone_number_id ? String(cfg.wa_phone_number_id) : null;
  for (const entry of corpo?.entry || []) {
    for (const ch of entry?.changes || []) {
      if (ch?.field && ch.field !== "messages") continue;
      const v = ch?.value || {};
      const pid = v.metadata?.phone_number_id;
      if (!pid) continue;
      // recibos só do número da Nexus; os dos números das clínicas continuam ignorados
      if (nexus && String(pid) === nexus && Array.isArray(v.statuses)) recibos.push(...v.statuses);
      const msgs = Array.isArray(v.messages) ? v.messages : [];
      if (!msgs.length) continue;
      try { await processarMensagens(db, v, msgs, clientes, cont, ctx); }
      catch (e) { ctx.falhou(e); }
    }
  }
  if (recibos.length) {
    cont.recibos = {};
    await processarStatuses(db, cfg, recibos, cont, ctx);
  }
  return cont;
}

/**
 * GET: verificação do webhook (hub.challenge). POST: mensagens e recibos, com assinatura da Meta.
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number, esperar?: (ms: number) => Promise<void>}} [deps]
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
    const agora = agoraDe(deps);
    const erros = [];
    const ctx = {
      agora, hoje: hojeSP(agora), dono: crypto.randomUUID(),
      rede: comPrazo(f, deps.prazoRede ?? PRAZO_ENVIO_MS),
      esperar: deps.esperar || (ms => new Promise(r => setTimeout(r, ms))),
      falhou: e => { const m = limparErro(e?.message || e); erros.push(m); console.error("nx-whatsapp:", m); },
    };
    try {
      const cont = await processar(db, cfg, corpo, ctx);
      return json({ ok: true, ...cont, ...(erros.length ? { erros: erros.length, erro: erros[0] } : {}) });
    } catch (e) {
      ctx.falhou(e);
      return json({ ok: true, erros: erros.length, erro: erros[0] });
    }
  } catch (e) {
    return json({ ok: false, erro: limparErro(e?.message || e) }, 500);
  }
}
