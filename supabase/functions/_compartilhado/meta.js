/* ============================================================
   NEXUS ADS — meta.js
   Meta Ads (Facebook/Instagram) — Marketing API, insights com
   time_increment=1 (uma linha por dia) nos níveis campanha e anúncio.
   Porte do indycar-ads/meta.js, devolvendo linhas de nx_metricas_dia.
   Versão da Graph (plano 100, S-F15): tenta a lembrada em nx_config
   (meta_api_versao) e depois VERSOES_META; quando a Meta desliga uma
   versão (código 2635) a seguinte entra sem ninguém mexer, e quem chamou
   recebe em `estado` a versão que respondeu e se a leitura parou no teto
   de páginas (status «parcial»).
   ============================================================ */

// a primeira é a que está no ar (conferida em produção); as seguintes só entram quando a Meta desligar a anterior
export const VERSOES_META = ["v23.0", "v24.0", "v25.0", "v26.0"];
export const VERSAO_META = VERSOES_META[0];
const GRAPH = "https://graph.facebook.com";
export const TETO_PAGINAS = 60;

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

/** A Meta desligou (2635) ou não conhece (2500 «Unknown path components», «unknown version») esta versão da Graph? */
export function versaoMetaIndisponivel(e) {
  const m = String(e?.message ?? "");
  return /\(código 2635\)/.test(m) || /deprecated version/i.test(m)
    || (/\(código 2500\)/.test(m) && /version|path/i.test(m)) || /unknown version|unsupported version/i.test(m);
}

/** Ordem de tentativa: a versão lembrada primeiro, depois a lista (sem repetir). */
const ordemDeVersoes = versao => [...new Set([versao, ...VERSOES_META].filter(Boolean))];

/**
 * Insights de um nível no período, já no formato de nx_metricas_dia (sem cliente_id).
 * @param {object} cred  nx_integracoes.cred (meta_access_token, meta_ad_account_id)
 * @param {"campanha"|"anuncio"} nivel
 * @param {{fetch?: Function, versao?: string|null, estado?: object}} [o]  estado recebe {versao, parcial}
 */
export async function buscarMeta(cred, nivel, de, ate, { fetch: f = globalThis.fetch, versao = null, estado = null } = {}) {
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

  let ultimo = null;
  for (const v of ordemDeVersoes(versao)) {
    const linhas = [];
    let url = `${GRAPH}/${v}/act_${conta}/insights?${params}`;
    try {
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
    } catch (e) {
      // versão desligada/desconhecida: a próxima da lista; token, permissão e conta são erro da conta (sobe)
      if (versaoMetaIndisponivel(e)) { ultimo = e; continue; }
      throw e;
    }
    if (estado) {
      estado.versao = v;
      if (url) estado.parcial = true;   // sobrou página além do teto: os dias mais recentes podem estar incompletos
    }
    return linhas;
  }
  throw ultimo || new Error("Meta API: nenhuma versão da Graph respondeu");
}

/** Os dois níveis do período (o mesmo `estado` recebe a versão e o aviso de parcial dos dois). */
export async function sincronizarMeta(cred, de, ate, opcoes = {}) {
  return [...await buscarMeta(cred, "campanha", de, ate, opcoes), ...await buscarMeta(cred, "anuncio", de, ate, opcoes)];
}

/** Fuso, moeda e nome da conta de anúncios (uma vez por dia): {timezone, moeda, nome}. Erro sobe para quem chamou. */
export async function contaMeta(cred, { fetch: f = globalThis.fetch, versao = null } = {}) {
  const conta = String(cred?.meta_ad_account_id || "").trim().replace(/^act_/, "");
  if (!conta || !cred?.meta_access_token) throw new Error("meta_ad_account_id ou meta_access_token não configurado");
  const params = new URLSearchParams({ fields: "name,timezone_name,currency", access_token: cred.meta_access_token });
  let ultimo = null;
  for (const v of ordemDeVersoes(versao)) {
    try {
      const d = await pedir(f, `${GRAPH}/${v}/act_${conta}?${params}`);
      return { nome: d.name || null, timezone: d.timezone_name || null, moeda: d.currency || null };
    } catch (e) {
      if (versaoMetaIndisponivel(e)) { ultimo = e; continue; }
      throw e;
    }
  }
  throw ultimo || new Error("Meta API: nenhuma versão da Graph respondeu");
}
