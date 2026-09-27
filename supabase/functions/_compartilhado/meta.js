/* ============================================================
   NEXUS ADS — meta.js
   Meta Ads (Facebook/Instagram) — Marketing API, insights com
   time_increment=1 (uma linha por dia) nos níveis campanha e anúncio.
   Porte do indycar-ads/meta.js, devolvendo linhas de nx_metricas_dia.
   ============================================================ */

export const VERSAO_META = "v23.0";
const BASE = `https://graph.facebook.com/${VERSAO_META}`;
const TETO_PAGINAS = 60;

const NIVEL_META = { campanha: "campaign", anuncio: "ad" };
const CAMPOS = {
  campanha: ["campaign_id", "campaign_name"],
  anuncio: ["campaign_id", "campaign_name", "ad_id", "ad_name"],
};

const numero = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = v => Math.round(v * 100) / 100;

function porTipo(lista) {
  const m = new Map();
  for (const a of lista || []) m.set(a.action_type, (m.get(a.action_type) || 0) + numero(a.value));
  return t => m.get(t) || 0;
}

/* O Meta devolve a mesma conversa/lead/compra em mais de um action_type
   (ex.: messaging_conversation_started_7d e total_messaging_connection).
   Somar tudo dobrava as conversas e derrubava o custo por conversa pela metade;
   dentro de cada grupo vale o maior, e os grupos se somam. */
function conversoesDe(acoes) {
  const v = porTipo(acoes);
  const conversas = Math.max(v("onsite_conversion.messaging_conversation_started_7d"), v("onsite_conversion.total_messaging_connection"));
  const leads = Math.max(v("lead"), v("onsite_conversion.lead_grouped") + v("offsite_conversion.fb_pixel_lead"));
  return conversas + leads + comprasDe(v);
}
const comprasDe = v => Math.max(v("omni_purchase"), v("purchase"), v("offsite_conversion.fb_pixel_purchase") + v("onsite_conversion.purchase"));

async function pedir(f, url) {
  const r = await f(url, { headers: { Accept: "application/json" } });
  // 200 com corpo ilegível (cortado, prazo estourado) é erro, não "página vazia" com status ok
  const corpo = await r.json().catch(e => { if (r.ok) throw new Error(`Meta API: resposta ilegível (${e?.message || e})`); return {}; });
  if (!r.ok || corpo?.error) {
    const e = corpo?.error || {};
    throw new Error(`Meta API ${r.status}: ${e.message || "erro desconhecido"}${e.code ? ` (código ${e.code})` : ""}`);
  }
  return corpo;
}

/**
 * Insights de um nível no período, já no formato de nx_metricas_dia (sem cliente_id).
 * @param {object} cred  nx_integracoes.cred (meta_access_token, meta_ad_account_id)
 * @param {"campanha"|"anuncio"} nivel
 */
export async function buscarMeta(cred, nivel, de, ate, { fetch: f = globalThis.fetch } = {}) {
  const conta = String(cred?.meta_ad_account_id || "").trim().replace(/^act_/, "");
  if (!conta) throw new Error("meta_ad_account_id não configurado");
  if (!cred.meta_access_token) throw new Error("meta_access_token não configurado");

  const params = new URLSearchParams({
    level: NIVEL_META[nivel],
    fields: [...CAMPOS[nivel], "impressions", "reach", "frequency", "clicks", "spend", "actions", "action_values", "date_start"].join(","),
    time_range: JSON.stringify({ since: de, until: ate }),
    time_increment: "1",
    limit: "500",
    access_token: cred.meta_access_token,
  });

  const linhas = [];
  let url = `${BASE}/act_${conta}/insights?${params}`;
  for (let paginas = 0; url && paginas < TETO_PAGINAS; paginas++) {
    const resp = await pedir(f, url);
    for (const d of resp.data || []) {
      if (!d.date_start || !d.campaign_id) continue;
      linhas.push({
        plataforma: "meta",
        nivel,
        data: d.date_start,
        campanha_ext: String(d.campaign_id),
        campanha_nome: d.campaign_name || null,
        anuncio_ext: nivel === "anuncio" ? String(d.ad_id || "") : "",
        anuncio_nome: nivel === "anuncio" ? d.ad_name || null : null,
        impressoes: Math.round(numero(d.impressions)),
        alcance: Math.round(numero(d.reach)),
        frequencia: Math.round(numero(d.frequency) * 10000) / 10000,
        cliques: Math.round(numero(d.clicks)),
        gasto: r2(numero(d.spend)),
        conversoes: conversoesDe(d.actions),
        valor_conversao: r2(comprasDe(porTipo(d.action_values))),
      });
    }
    url = resp.paging?.next || null;
  }
  return linhas;
}

/** Os dois níveis do período. */
export async function sincronizarMeta(cred, de, ate, opcoes = {}) {
  return [...await buscarMeta(cred, "campanha", de, ate, opcoes), ...await buscarMeta(cred, "anuncio", de, ate, opcoes)];
}
