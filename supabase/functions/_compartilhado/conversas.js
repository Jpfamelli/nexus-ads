/* ============================================================
   ÓRBITA — conversas.js (nx-whatsapp ampliada, ESPEC §6.2)
   - normalizarMensagem: mensagem da Cloud API → p_msg do nx_wa_entrada
   - processarCanal: mensagens e recibos de UM número de cliente (nx_canais)
   - baixarMidia: mídia recebida → Storage (segundo plano)
   O texto que chega do WhatsApp nunca derruba a gravação: tudo é cortado
   aqui E de novo no banco (defesa dupla).
   ============================================================ */
import { soDigitos, limparErro, agoraDe, cortarTexto } from "./comum.js";
import { infoMidia, textoFalhaCanal } from "./whatsapp.js";
import { criarStorage, extensaoDe, caminhoMidia } from "./midia.js";
import { enviarFila } from "./enviar.js";
import { atribuirOrigemDoTexto } from "./codewords.js";

export const LIMITES = { corpo: 4096, nome: 160, arquivo: 200, midia: 16 * 1024 * 1024 };
export const TEXTO_NAO_SUPORTADA = "Mensagem não suportada pela API do WhatsApp — veja no celular";
export const TEXTO_ABRIU_ANUNCIO = "Abriu a conversa pelo anúncio";
export const TEXTO_ABRIU = "Abriu a conversa";
// mídia que ficou «baixando» além disso é um 2º plano que morreu: a reentrega da Meta reagenda o download
const MIDIA_PRESA_MS = 5 * 60_000;

// corte sem partir emoji (cortarTexto): um surrogate solto no corpo era recusado pelo banco e a mensagem se perdia
const corta = (t, n) => cortarTexto(t, n);
const limpo = t => String(t ?? "").replace(/\s+/g, " ").trim();
const TIPOS_MIDIA = { image: "imagem", audio: "audio", video: "video", document: "documento", sticker: "sticker" };

/** Referral do anúncio (CTWA): só os campos úteis, com tamanho contido. */
function referralCurto(r) {
  if (!r || typeof r !== "object") return null;
  const campos = ["source_url", "source_id", "source_type", "headline", "body", "media_type", "ctwa_clid", "image_url", "video_url", "thumbnail_url"];
  const out = {};
  for (const c of campos) if (r[c] != null && r[c] !== "") out[c] = corta(r[c], c === "body" ? 500 : 300);
  return Object.keys(out).length ? out : null;
}

function localizacao(l) {
  if (!l || typeof l !== "object") return "Localização";
  const partes = [limpo(l.name), limpo(l.address)].filter(Boolean).join(" — ");
  const coords = l.latitude != null && l.longitude != null ? ` (${l.latitude}, ${l.longitude})` : "";
  return `Localização: ${partes || "sem nome"}${coords}`;
}

function contatos(lista) {
  const itens = (Array.isArray(lista) ? lista : []).map(c => {
    const nome = limpo(c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(" "));
    const tel = limpo(c?.phones?.[0]?.phone || c?.phones?.[0]?.wa_id);
    return [nome, tel].filter(Boolean).join(" ");
  }).filter(Boolean);
  return `Contato: ${itens.join("; ") || "sem dados"}`;
}

function interativo(m) {
  const i = m.interactive || {};
  return limpo(i.button_reply?.title || i.list_reply?.title || i.nfm_reply?.body || i.nfm_reply?.name || "") || "Resposta interativa";
}

/** Pedido do catálogo (type order): «Pedido do catálogo: 2× SKU-1, 1× SKU-2 — observação». */
function pedido(o) {
  const itens = (Array.isArray(o?.product_items) ? o.product_items : []).map(i => {
    const q = Number(i?.quantity);
    return `${Number.isFinite(q) && q > 0 ? `${q}× ` : ""}${limpo(i?.product_retailer_id || i?.product_id || "item")}`;
  }).filter(Boolean);
  const nota = limpo(o?.text);
  return `Pedido do catálogo: ${itens.join(", ") || "sem itens"}${nota ? ` — ${nota}` : ""}`;
}

/**
 * Mensagem da Cloud API → p_msg (§6.2). `system` → null (ignorada, como antes).
 * @param {object} m    item de value.messages[]
 * @param {Array} contacts value.contacts[]
 */
export function normalizarMensagem(m, contacts) {
  if (!m || typeof m !== "object" || m.type === "system") return null;
  const wa = soDigitos(m.from);
  if (!wa) return null;
  const lista = Array.isArray(contacts) ? contacts : [];
  const achado = lista.find(c => soDigitos(c?.wa_id) === wa);
  const nome = limpo(achado?.profile?.name || (lista.length === 1 ? lista[0]?.profile?.name : "")) || null;
  const t = Number(m.timestamp);
  // timestamp absurdo («99999999999999999999») dá Invalid Date: vira null em vez de derrubar o lote inteiro
  const quando = Number.isFinite(t) && t > 0 ? new Date(t * 1000) : null;
  const base = {
    wamid: m.id ? corta(m.id, 256) : null,
    wa_id: wa,
    nome: nome ? corta(nome, LIMITES.nome) : null,
    em: quando && Number.isFinite(quando.getTime()) ? quando.toISOString().replace(/\.\d{3}Z$/, "Z") : null,
  };
  if (m.type === "reaction") {
    return { ...base, reacao: { wamid: corta(m.reaction?.message_id, 256), emoji: corta(m.reaction?.emoji ?? "", 16) } };
  }
  let tipo = "desconhecido", corpo = null, midia = null;
  if (m.type === "text") { tipo = "texto"; corpo = m.text?.body ?? ""; }
  else if (TIPOS_MIDIA[m.type]) {
    tipo = TIPOS_MIDIA[m.type];
    const x = m[m.type] || {};
    corpo = x.caption ?? null;
    midia = {
      media_id: x.id ? corta(x.id, 128) : null,
      mime: x.mime_type ? corta(x.mime_type, 100) : null,
      sha256: x.sha256 ? corta(x.sha256, 128) : null,
      nome: x.filename ? corta(x.filename, LIMITES.arquivo) : null,
      legenda: x.caption ? corta(x.caption, 1024) : null,
    };
  }
  else if (m.type === "location") { tipo = "localizacao"; corpo = localizacao(m.location); }
  else if (m.type === "contacts") { tipo = "contato"; corpo = contatos(m.contacts); }
  else if (m.type === "interactive") { tipo = "interativo"; corpo = interativo(m); }
  else if (m.type === "button") { tipo = "interativo"; corpo = limpo(m.button?.text || m.button?.payload) || "Botão"; }
  // o cliente tocou no anúncio («Enviar mensagem») sem digitar: não há nada no celular — a bolha diz o que houve e o
  // referral segue para a atribuição; «veja no celular» aqui era mentira e virava texto para a IA responder
  else if (m.type === "request_welcome") { tipo = "interativo"; corpo = m.referral ? TEXTO_ABRIU_ANUNCIO : TEXTO_ABRIU; }
  else if (m.type === "order") { tipo = "interativo"; corpo = pedido(m.order); }
  else { tipo = "desconhecido"; corpo = TEXTO_NAO_SUPORTADA; }
  return {
    ...base, tipo,
    corpo: corpo == null ? null : corta(corpo, LIMITES.corpo),
    ...(midia ? { midia } : {}),
    ...(m.context?.id ? { responde_a_wamid: corta(m.context.id, 256) } : {}),
    ...(referralCurto(m.referral) ? { referral: referralCurto(m.referral) } : {}),
  };
}

/**
 * Mídia recebida: GET /{media_id} com o token do CANAL → baixa → Storage privado →
 * nx_wa_midia_ok. Canal e cliente vêm do canal resolvido pelo webhook, nunca do corpo.
 * Nunca lança: o resultado vai para a mensagem (estado ok/falhou).
 */
export async function baixarMidia(db, canal, mensagemId, midia, ctx) {
  const f = ctx.redeMidia || ctx.rede || ctx.fetch;
  const falhou = async motivo => {
    try { await db.rpc("nx_wa_midia_ok", { p_mensagem: mensagemId, p_cliente: canal.cliente_id, p_path: null, p_tamanho: null, p_erro: limparErro(motivo).slice(0, 300) }); }
    catch (e) { ctx.falhou?.(e); }
    return { ok: false, erro: motivo };
  };
  try {
    const cred = await db.rpc("nx_canal_credencial", { p_canal: canal.canal_id, p_cliente: canal.cliente_id });
    if (!cred?.token) return falhou("número sem token");
    const info = await infoMidia(cred, midia.media_id, { fetch: f });
    if (!info.ok) return falhou(textoFalhaCanal(info.erro));
    if (info.tamanho && info.tamanho > LIMITES.midia) return falhou("arquivo maior que 16 MB");
    let r;
    try { r = await f(info.url, { headers: { Authorization: `Bearer ${cred.token}` } }); }
    catch (e) { return falhou(`download da mídia: ${limparErro(e?.message || e)}`); }
    if (!r.ok) return falhou(`download da mídia: HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > LIMITES.midia) return falhou("arquivo maior que 16 MB");
    const mime = String(info.mime || midia.mime || "application/octet-stream").split(";")[0].trim();
    const path = caminhoMidia(canal.cliente_id, "in", agoraDe(ctx), extensaoDe(mime, midia.nome));
    const st = criarStorage(ctx.env, f);
    const up = await st.subir(path, bytes, mime);
    if (!up.ok) return falhou(`Storage: ${up.erro}`);
    await db.rpc("nx_wa_midia_ok", { p_mensagem: mensagemId, p_cliente: canal.cliente_id, p_path: path, p_tamanho: bytes.length, p_erro: null });
    return { ok: true, path, tamanho: bytes.length };
  } catch (e) {
    return falhou(limparErro(e?.message || e));
  }
}

/** Recibo "failed" do canal: texto com a dica, calculado aqui (o banco só grava). */
const comTextoDeErro = st => (st?.status === "failed"
  ? { ...st, erro_texto: textoFalhaCanal((Array.isArray(st.errors) && st.errors[0]) || {}) }
  : st);

/**
 * Um change.value de um número de CLIENTE já autenticado e já conferido (canal certo).
 * Para cada mensagem, NESTA ordem: nx_wa_entrada → (reação ou bloqueado param aqui) → lead
 * (cliente = o do CANAL) → mídia e fila em segundo plano. Depois os recibos do canal.
 * @param canal {canal_id, cliente_id, phone_number_id}
 * @param ctx   {registrarLead(clienteId, msg), emSegundoPlano(p), falhou(e), env, rede, agora}
 */
export async function processarCanal(db, canal, v, ctx, cont) {
  const msgs = Array.isArray(v?.messages) ? v.messages : [];
  for (const m of msgs) {
    try {
      // a normalização também fica dentro do try: uma mensagem malformada vira erro SÓ dela
      const msg = normalizarMensagem(m, v.contacts);
      if (!msg) continue;
      const r = await db.rpc("nx_wa_entrada", { p_canal: canal.canal_id, p_msg: msg });
      if (r?.duplicada) {
        cont.duplicadas++;
        // A mensagem pode ter sido gravada antes de a RPC do lead falhar. No retry da Meta,
        // usa os dados canônicos já persistidos e a RPC do lead (idempotente) para reparar isso.
        if (r.mensagem_id && r.contato_id) {
          const [contato] = await db.select("nx_contatos", {
            id: `eq.${r.contato_id}`, cliente_id: `eq.${canal.cliente_id}`, select: "id,wa_id,nome,bloqueado", limit: 1,
          });
          if (!contato) throw Object.assign(new Error("mensagem repetida sem contato persistido"), { banco: true });
          if (!contato.bloqueado) {
            const [original] = await db.select("nx_mensagens", {
              id: `eq.${r.mensagem_id}`, cliente_id: `eq.${canal.cliente_id}`, select: "referral,midia,criado_em", limit: 1,
            });
            if (!original) throw Object.assign(new Error("mensagem repetida sem registro persistido"), { banco: true });
            await ctx.registrarLead(canal.cliente_id, { ...msg, wa_id: contato.wa_id || msg.wa_id,
              nome: contato.nome || msg.nome, referral: original.referral || null });
            // o [ref] do site também na reentrega: o negócio pode ter nascido só agora (o lead falhou na 1ª entrega)
            await atribuirOrigemDoTexto(db, canal, contato.wa_id || msg.wa_id, msg.corpo, { fraseDoBotao: false });
            // mídia que ficou «baixando» (o 2º plano da 1ª entrega foi cortado): reagenda o download
            const mi = original.midia;
            if (mi?.estado === "baixando" && mi.media_id && agoraDe(ctx).getTime() - Date.parse(original.criado_em) >= MIDIA_PRESA_MS) {
              ctx.emSegundoPlano(baixarMidia(db, canal, r.mensagem_id, mi, ctx));
            }
          }
        }
        continue;
      }
      // reação (👍 numa mensagem) não é conversa: só marca o emoji — não cria/toca negócio
      // (uma reação 30 dias depois viraria "conversa nova" no funil do Ads), nem mídia, nem fila
      if (msg.reacao || r?.reacao) { cont.reacoes = (cont.reacoes || 0) + 1; continue; }
      cont.mensagens++;
      if (r?.bloqueado) { cont.bloqueados = (cont.bloqueados || 0) + 1; continue; }
      if (r?.optout) cont.optout = (cont.optout || 0) + 1;
      try { await ctx.registrarLead(canal.cliente_id, msg); }
      catch (e) { ctx.falhou(e); }   // a conversa já está gravada; o lead não derruba o resto
      // código do site ([ref K7Q2P]) ou frase do botão na conversa nova: a Cloud API também atribui (nx_rastreio_atribuir
      // aceita canal Meta a partir da migração 20261008a; antes disso a RPC recusa e fica só o log)
      await atribuirOrigemDoTexto(db, canal, msg.wa_id, msg.corpo, { fraseDoBotao: r?.nova_conversa === true });
      if (r?.midia_pendente && r.mensagem_id && msg.midia?.media_id) {
        ctx.emSegundoPlano(baixarMidia(db, canal, r.mensagem_id, msg.midia, ctx));
      }
      if (r?.fila_id) {
        ctx.emSegundoPlano(enviarFila(db, { ids: [r.fila_id] }, ctx).catch(e => ctx.falhou(e)));
      }
    } catch (e) { ctx.falhou(e); }   // uma mensagem com erro não derruba as outras do lote
  }
  const statuses = Array.isArray(v?.statuses) ? v.statuses : [];
  if (statuses.length) {
    try {
      const r = await db.rpc("nx_wa_status", { p_canal: canal.canal_id, p_statuses: statuses.map(comTextoDeErro) });
      cont.recibos_canal += (Number(r?.atualizados) || 0) + (Number(r?.falhas) || 0);
      cont.recibos_ignorados = (cont.recibos_ignorados || 0) + (Number(r?.ignorados) || 0);
    } catch (e) { ctx.falhou(e); }
  }
}
