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

// plano 1000 (SV-082): erro passageiro (5xx, limite 4/17/32/341/613, 429, «unknown error» 1/2) repete até 2× com 2 s e 8 s
export const ESPERAS_META_MS = [2_000, 8_000];
const CODIGOS_PASSAGEIROS = new Set([1, 2, 4, 17, 32, 341, 613]);
const esperaPadrao = ms => new Promise(r => setTimeout(r, ms));

/** «Please reduce the amount of data you're asking for» (código 1, subcódigo 1487534): a janela é grande demais para a conta. */
export const pedidoGrandeDemais = e => e?.subcodigo === 1487534 || /reduce the amount of data/i.test(String(e?.message ?? ""));
const passageiro = e => !pedidoGrandeDemais(e) && (e?.status >= 500 || e?.status === 429 || CODIGOS_PASSAGEIROS.has(Number(e?.codigo))
  || /resposta ilegível/.test(String(e?.message ?? "")));

/** Plano 1000 (SV-083): appsecret_proof = HMAC-SHA256(access token, app secret) em hex. Com ele (e «Exigir appsecret_proof»
    ligado no app da Meta) um token vazado não funciona de outro servidor. Só quando a integração tem o segredo do app DONO do
    token (cred.meta_app_secret): o segredo de outro app faria a Graph recusar toda chamada. Sem segredo → null. */
export async function provaSegredo(token, segredo) {
  if (!token || !segredo) return null;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(String(segredo)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(String(token))));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}
const comProva = (url, prova) => {
  if (!prova) return url;
  try { const u = new URL(url); u.searchParams.set("appsecret_proof", prova); return u.toString(); } catch { return url; }
};

/** URL sem access_token (o paging.next da Meta devolve o token na URL): o token vai só no cabeçalho. */
export function semToken(url) {
  try { const u = new URL(url); u.searchParams.delete("access_token"); return u.toString(); } catch { return url; }
}

/** plano 1000b · B-042: só segue paging.next que fica na graph.facebook.com — o token vai no Authorization da próxima página, e
    uma resposta adulterada com next para outro host o levaria embora. Outro host → false (para a leitura, que fica parcial). */
export function proximaPagina(next) {
  let u;
  try { u = new URL(String(next)); } catch { u = null; }
  if (!u || u.origin !== GRAPH) {
    try { console.warn(JSON.stringify({ nivel: "aviso", evento: "paging_next_estranho", host: u ? u.host : null })); } catch { /* log nunca derruba */ }
    return false;
  }
  return semToken(u.toString());
}

/** Plano 1000 (SV-085): o token vai no cabeçalho Authorization, nunca na URL (que aparece em erros de rede, logs de proxy e
    mensagens; o limparErro mascarava, mas era defesa tardia). */
async function pedirUmaVez(f, url, token, prova = null) {
  const r = await f(comProva(semToken(url), prova), { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  // 200 com corpo ilegível (cortado, prazo estourado) é erro, não "página vazia" com status ok
  const corpo = await r.json().catch(e => { if (r.ok) throw Object.assign(new Error(`Meta API: resposta ilegível (${e?.message || e})`), { status: r.status }); return {}; });
  if (!r.ok || corpo?.error) {
    const e = corpo?.error || {};
    throw Object.assign(new Error(`Meta API ${r.status}: ${e.message || "erro desconhecido"}${e.code ? ` (código ${e.code})` : ""}`),
      { status: r.status, codigo: e.code ?? null, subcodigo: e.error_subcode ?? null });
  }
  return corpo;
}

async function pedir(f, url, token, esperar = esperaPadrao, prova = null) {
  for (let i = 0; ; i++) {
    try { return await pedirUmaVez(f, url, token, prova); }
    catch (e) {
      if (i >= ESPERAS_META_MS.length || !passageiro(e)) throw e;
      await esperar(ESPERAS_META_MS[i]);
    }
  }
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
export async function buscarMeta(cred, nivel, de, ate, { fetch: f = globalThis.fetch, versao = null, estado = null, esperar = esperaPadrao } = {}) {
  const conta = String(cred?.meta_ad_account_id || "").trim().replace(/^act_/, "");
  if (!conta) throw new Error("meta_ad_account_id não configurado");
  if (!cred.meta_access_token) throw new Error("meta_access_token não configurado");

  const params = new URLSearchParams({
    level: NIVEL_META[nivel],
    fields: [...CAMPOS[nivel], "impressions", "reach", "frequency", "clicks", "spend", "actions", "action_values", "date_start"].join(","),
    time_range: JSON.stringify({ since: de, until: ate }),
    time_increment: "1",
    limit: "500",
  });
  const token = cred.meta_access_token;
  const prova = await provaSegredo(token, cred.meta_app_secret);

  /** Um período numa versão: {linhas, sobrou} (sobrou = parou no teto de páginas). Plano 1000 (SV-087): «reduce the amount of
      data» divide o período ao meio (até 1 dia) e junta as linhas — antes a rodada de 28 dias de uma conta grande falhava todo dia. */
  async function periodo(v, de1, ate1) {
    const linhas = [];
    params.set("time_range", JSON.stringify({ since: de1, until: ate1 }));
    let url = `${GRAPH}/${v}/act_${conta}/insights?${params}`, estranho = false;
    try {
      for (let paginas = 0; url && paginas < TETO_PAGINAS; paginas++) {
        const resp = await pedir(f, url, token, esperar, prova);
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
        url = resp.paging?.next ? proximaPagina(resp.paging.next) : null;
        if (url === false) { url = null; estranho = true; }
      }
    } catch (e) {
      if (pedidoGrandeDemais(e) && de1 < ate1) {
        const dias = Math.round((Date.parse(`${ate1}T12:00:00Z`) - Date.parse(`${de1}T12:00:00Z`)) / 86400e3);
        const meio = new Date(Date.parse(`${de1}T12:00:00Z`) + Math.floor(dias / 2) * 86400e3).toISOString().slice(0, 10);
        const proximo = new Date(Date.parse(`${meio}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10);
        const a = await periodo(v, de1, meio), b = await periodo(v, proximo, ate1);
        return { linhas: [...a.linhas, ...b.linhas], sobrou: a.sobrou || b.sobrou };
      }
      throw e;
    }
    return { linhas, sobrou: !!url || estranho };
  }

  let ultimo = null;
  for (const v of ordemDeVersoes(versao)) {
    let r;
    try { r = await periodo(v, de, ate); }
    catch (e) {
      // versão desligada/desconhecida: a próxima da lista; token, permissão e conta são erro da conta (sobe)
      if (versaoMetaIndisponivel(e)) { ultimo = e; continue; }
      throw e;
    }
    if (estado) {
      estado.versao = v;
      if (r.sobrou) estado.parcial = true;   // sobrou página além do teto: os dias mais recentes podem estar incompletos
    }
    return r.linhas;
  }
  throw ultimo || new Error("Meta API: nenhuma versão da Graph respondeu");
}

/** Os dois níveis do período (o mesmo `estado` recebe a versão e o aviso de parcial dos dois). */
export async function sincronizarMeta(cred, de, ate, opcoes = {}) {
  return [...await buscarMeta(cred, "campanha", de, ate, opcoes), ...await buscarMeta(cred, "anuncio", de, ate, opcoes)];
}

/** Fuso, moeda e nome da conta de anúncios (uma vez por dia): {timezone, moeda, nome}. Erro sobe para quem chamou. */
export async function contaMeta(cred, { fetch: f = globalThis.fetch, versao = null, esperar = esperaPadrao } = {}) {
  const conta = String(cred?.meta_ad_account_id || "").trim().replace(/^act_/, "");
  if (!conta || !cred?.meta_access_token) throw new Error("meta_ad_account_id ou meta_access_token não configurado");
  const params = new URLSearchParams({ fields: "name,timezone_name,currency" });
  const prova = await provaSegredo(cred.meta_access_token, cred.meta_app_secret);
  let ultimo = null;
  for (const v of ordemDeVersoes(versao)) {
    try {
      const d = await pedir(f, `${GRAPH}/${v}/act_${conta}?${params}`, cred.meta_access_token, esperar, prova);
      return { nome: d.name || null, timezone: d.timezone_name || null, moeda: d.currency || null };
    } catch (e) {
      if (versaoMetaIndisponivel(e)) { ultimo = e; continue; }
      throw e;
    }
  }
  throw ultimo || new Error("Meta API: nenhuma versão da Graph respondeu");
}
