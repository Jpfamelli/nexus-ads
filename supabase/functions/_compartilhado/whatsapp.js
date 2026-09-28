/* ============================================================
   NEXUS ADS — whatsapp.js
   Envio pela WhatsApp Cloud API com o número da NEXUS
   (nx_config.wa_access_token + wa_phone_number_id).
   ============================================================ */
import { limparErro } from "./comum.js";

export const VERSAO_WA = "v23.0";
const PAINEL_PADRAO = "https://jpfamelli.github.io/nexus-ads/";
const LIMITE = 4096;   // limite de caracteres do texto livre na API

/** 5512977771234 — só dígitos, com país. Sem isso a API recusa o número. */
export function normalizarTelefone(t) {
  let n = String(t ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.length <= 11) n = `55${n}`;
  return n;
}

const cortar = t => { const s = String(t ?? ""); return s.length > LIMITE ? `${s.slice(0, LIMITE - 1)}…` : s; };
// parâmetro de template não aceita quebra de linha, tab nem 4+ espaços seguidos
const paramTemplate = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

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

  const r1 = await postar(f, cfg, {
    messaging_product: "whatsapp", to: para, type: "text",
    text: { body: cortar(texto), preview_url: false },
  });
  if (r1.ok) return { via: "texto", id: wamid(r1) };
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
    try { const r = await enviarWhatsApp(cfg, n, texto, opcoes); saida.push({ destino: n, ok: true, via: r.via, id: r.id }); }
    // o erro vai para erro_envio / nx_relatorios.erro (a clínica vê este): sem o token da Nexus,
    // que a Meta devolve inteiro em "Malformed access token EAA…"
    catch (e) { saida.push({ destino: n, ok: false, erro: limparErro(e?.message || e) }); }
  }
  return saida;
}

/** wamids de um envio, separados como o banco guarda: texto → wa_ids, template → wa_ids_template
    (o webhook nunca reenvia o que já saiu como template: é isso que impede laço). */
export function idsDoEnvio(envio) {
  const de = via => (envio || []).filter(e => e.ok && e.via === via && e.id).map(e => String(e.id));
  return { wa_ids: de("texto"), wa_ids_template: de("template") };
}
