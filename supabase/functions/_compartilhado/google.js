/* ============================================================
   NEXUS ADS — google.js
   Google Ads — API oficial (GAQL via searchStream). Troca o
   refresh_token por um access_token de curta duração a cada execução.
   Porte do indycar-ads/google.js, devolvendo linhas de nx_metricas_dia.
   ============================================================ */

/* O Google desliga versões antigas da API a cada poucos meses (a URL passa a
   dar 404). Sem versão fixada em nx_config, tenta da mais nova para a mais velha. */
export const VERSOES_GOOGLE = ["v23", "v22", "v21", "v20"];

const so = v => String(v || "").replace(/\D/g, "");   // customer id vai sem hífen
const numero = v => { const n = typeof v === "string" ? parseFloat(v) : v; return Number.isFinite(n) ? n : 0; };
const r2 = v => Math.round(v * 100) / 100;

const CONSULTAS = {
  campanha: `
    SELECT segments.date, campaign.id, campaign.name,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '{de}' AND '{ate}' AND metrics.impressions > 0`,
  anuncio: `
    SELECT segments.date, campaign.id, campaign.name, ad_group.name,
           ad_group_ad.ad.id, ad_group_ad.ad.name,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '{de}' AND '{ate}' AND metrics.impressions > 0`,
};

const lerJson = txt => { try { return JSON.parse(txt); } catch { return null; } };
const primeiroErro = corpo => (Array.isArray(corpo) ? corpo.find(b => b && b.error)?.error : corpo?.error) || null;

/** 404/501/UNIMPLEMENTED = esta versão não existe (mais); qualquer outro erro é da conta. */
function versaoIndisponivel(status, corpo) {
  if (status === 404 || status === 501) return true;
  return primeiroErro(corpo)?.status === "UNIMPLEMENTED";
}

/**
 * Um coletor por execução: guarda o access_token de cada credencial (vários
 * clientes na mesma rodada) e a versão da API que respondeu.
 * @param {object} o
 * @param {string} [o.versao] nx_config.google_api_versao — tentada primeiro
 */
export function criarGoogle({ fetch: f = globalThis.fetch, versao = null } = {}) {
  const tokens = new Map();
  let versaoOk = null;

  async function accessToken(cred) {
    const faltando = ["google_client_id", "google_client_secret", "google_refresh_token"].filter(k => !cred[k]);
    if (faltando.length) throw new Error(`Google Ads: falta ${faltando.join(", ")}`);
    const chave = `${cred.google_client_id}|${cred.google_refresh_token}`;
    const c = tokens.get(chave);
    if (c && Date.now() < c.expira) return c.valor;
    const r = await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cred.google_client_id,
        client_secret: cred.google_client_secret,
        refresh_token: cred.google_refresh_token,
        grant_type: "refresh_token",
      }).toString(),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || !corpo.access_token) throw new Error(`OAuth Google ${r.status}: ${corpo.error_description || corpo.error || "falhou"}`);
    tokens.set(chave, { valor: corpo.access_token, expira: Date.now() + ((corpo.expires_in || 3600) - 60) * 1000 });
    return corpo.access_token;
  }

  async function consultar(cred, gaql) {
    const cliente = so(cred.google_customer_id);
    if (!cliente) throw new Error("google_customer_id não configurado");
    if (!cred.google_developer_token) throw new Error("google_developer_token não configurado");
    const token = await accessToken(cred);
    const headers = {
      Authorization: `Bearer ${token}`,
      "developer-token": cred.google_developer_token,
      "Content-Type": "application/json",
    };
    // Conta gerenciadora (MCC): sem este cabeçalho a API recusa a conta filha.
    const gerente = so(cred.google_login_customer_id);
    if (gerente) headers["login-customer-id"] = gerente;

    const ordem = versaoOk ? [versaoOk] : [...new Set([versao, ...VERSOES_GOOGLE].filter(Boolean))];
    const tentadas = [];
    for (const v of ordem) {
      const r = await f(`https://googleads.googleapis.com/${v}/customers/${cliente}/googleAds:searchStream`, {
        method: "POST", headers, body: JSON.stringify({ query: gaql }),
      });
      const corpo = lerJson(await r.text());
      if (versaoIndisponivel(r.status, corpo)) { tentadas.push(`${v}: ${r.status}`); continue; }
      versaoOk = v;
      const erro = primeiroErro(corpo);
      if (!r.ok || erro) {
        const msg = erro?.details?.[0]?.errors?.[0]?.message || erro?.message || "erro desconhecido";
        throw new Error(`Google Ads ${r.status}: ${msg}`);
      }
      const blocos = Array.isArray(corpo) ? corpo : corpo ? [corpo] : [];
      return blocos.flatMap(b => b.results || []);
    }
    throw new Error(`Google Ads: nenhuma versão da API respondeu (${tentadas.join(", ")})`);
  }

  /** Um nível no período, no formato de nx_metricas_dia (sem cliente_id). */
  async function buscar(cred, nivel, de, ate) {
    const resultados = await consultar(cred || {}, CONSULTAS[nivel].replace("{de}", de).replace("{ate}", ate));
    return resultados.map(x => {
      const m = x.metrics || {};
      const ad = x.adGroupAd?.ad;
      const idAd = ad?.id != null ? String(ad.id) : "";
      return {
        plataforma: "google",
        nivel,
        data: x.segments?.date,
        campanha_ext: x.campaign?.id != null ? String(x.campaign.id) : "",
        campanha_nome: x.campaign?.name || null,
        anuncio_ext: nivel === "anuncio" ? idAd : "",
        // anúncio responsivo de pesquisa quase nunca tem nome: o grupo identifica melhor
        anuncio_nome: nivel === "anuncio" ? (ad?.name || (x.adGroup?.name ? `${x.adGroup.name} · ${idAd}` : `Anúncio ${idAd}`)) : null,
        impressoes: Math.round(numero(m.impressions)),
        // A busca padrão não expõe alcance/frequência: zero é mais honesto que inventar.
        alcance: 0,
        frequencia: 0,
        cliques: Math.round(numero(m.clicks)),
        gasto: r2(numero(m.costMicros) / 1e6),
        conversoes: numero(m.conversions),
        valor_conversao: r2(numero(m.conversionsValue)),
      };
    }).filter(l => l.data && l.campanha_ext && (nivel === "campanha" || l.anuncio_ext));
  }

  return {
    buscar,
    /** Os dois níveis do período. */
    periodo: async (cred, de, ate) => [...await buscar(cred, "campanha", de, ate), ...await buscar(cred, "anuncio", de, ate)],
    /** Versão que respondeu nesta execução (null se nenhuma consulta rodou). */
    get versao() { return versaoOk; },
  };
}
