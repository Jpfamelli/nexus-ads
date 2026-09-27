/* ============================================================
   NEXUS ADS — testes das Edge Functions (Node 24, sem dependências)
   Uso: node --test testes/funcoes.teste.mjs
   O fetch é falso: PostgREST em memória (com as colunas do contrato)
   + Graph API do Meta + Google Ads + WhatsApp Cloud API.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { tratar as ciclo } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import { tratar as webhook, variantesTelefone } from "../supabase/functions/_compartilhado/webhook.js";
import { enviarParaTodos, normalizarTelefone } from "../supabase/functions/_compartilhado/whatsapp.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = "https://fake.supabase.co";
const ENV = { url: SUPA, chave: "eyJ.service-role.fake" };
const FN = `${SUPA}/functions/v1`;
const AGORA = new Date("2026-09-27T11:00:00Z");     // 08:00 em São Paulo
const HORA = 3600e3;

const CLI_A = "11111111-1111-4111-8111-111111111111";
const CLI_B = "22222222-2222-4222-8222-222222222222";
const CLI_C = "33333333-3333-4333-8333-333333333333";
const GESTOR_B = "5512999998888";

/* ------------------------------------------------------------
   PostgREST em memória
   ------------------------------------------------------------ */
const COLUNAS = {
  nx_config: "id cron_token codigo_gestor funcoes_url painel_url wa_access_token wa_phone_number_id wa_template wa_verify_token meta_app_secret anthropic_api_key modelo_ia google_api_versao",
  nx_clientes: "id slug nome ativo cfg wa_phone_number_id criado_em",
  nx_integracoes: "id cliente_id canal ativo cred ultimo_sync status",
  nx_metricas_dia: "cliente_id plataforma nivel data campanha_ext anuncio_ext campanha_nome anuncio_nome impressoes alcance frequencia cliques gasto conversoes valor_conversao atualizado_em",
  nx_leads: "id cliente_id telefone nome origem plataforma campanha_ext anuncio_ext ctwa_clid servico etapa data_conversa data_agenda data_consulta valor obs criado_em atualizado_em",
  nx_alertas: "id cliente_id chave regra severidade mensagem acao valor referencia criado_em enviado_em erro_envio",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro",
  nx_execucoes: "id tarefa inicio fim ok resumo",
};
for (const k in COLUNAS) COLUNAS[k] = new Set(COLUNAS[k].split(" "));
const UNICAS = {
  nx_metricas_dia: ["cliente_id", "plataforma", "nivel", "data", "campanha_ext", "anuncio_ext"],
  nx_relatorios: ["cliente_id", "tipo", "referencia"],
  nx_integracoes: ["cliente_id", "canal"],
};
const CHECKS = {
  nx_metricas_dia: { plataforma: ["meta", "google"], nivel: ["campanha", "anuncio"] },
  nx_leads: { origem: ["anuncio", "whatsapp", "indicacao", "organico", "manual", "site"], plataforma: ["meta", "google", null],
              etapa: ["nova", "agendada", "orcamento", "fechou", "nao_fechou", "faltou", "perdida"] },
  nx_alertas: { severidade: ["critico", "alerta", "info"] },
  nx_relatorios: { tipo: ["diario", "mensal"] },
};
const NAO_NULOS = { nx_metricas_dia: UNICAS.nx_metricas_dia, nx_leads: ["cliente_id", "telefone"], nx_alertas: ["cliente_id", "chave"] };
const RESERVADOS = new Set(["select", "order", "limit", "offset", "on_conflict", "or"]);

function criarBanco(inicial, relogio) {
  const t = structuredClone(inicial);
  let seq = 1000;
  const tab = n => (t[n] ||= []);
  const erro = (status, message) => new Response(JSON.stringify({ code: "PGRST", message }), { status, headers: { "content-type": "application/json" } });

  function casa(row, col, expr) {
    const i = expr.indexOf(".");
    const op = expr.slice(0, i), val = expr.slice(i + 1), a = row[col];
    const cmp = () => (typeof a === "number" ? a - Number(val) : String(a) < val ? -1 : String(a) > val ? 1 : 0);
    switch (op) {
      case "eq": return a != null && String(a) === val;
      case "neq": return a == null || String(a) !== val;
      case "is": return val === "null" ? a == null : String(a) === val;
      case "in": return a != null && val.replace(/^\(|\)$/g, "").split(",").includes(String(a));
      case "gte": return a != null && cmp() >= 0;
      case "gt": return a != null && cmp() > 0;
      case "lte": return a != null && cmp() <= 0;
      case "lt": return a != null && cmp() < 0;
      default: throw new Error(`operador não suportado no banco falso: ${op}`);
    }
  }
  const partes = expr => expr.replace(/^\(|\)$/g, "").split(",");
  function colunasFiltro(nome, sp) {
    const cols = [...sp.keys()].filter(k => !RESERVADOS.has(k));
    if (sp.get("or")) cols.push(...partes(sp.get("or")).map(p => p.split(".")[0]));
    if (sp.get("order")) cols.push(...sp.get("order").split(",").map(o => o.split(".")[0]));
    if (sp.get("select") && sp.get("select") !== "*") cols.push(...sp.get("select").split(","));
    return cols.filter(c => !COLUNAS[nome].has(c));
  }
  function filtrar(nome, sp) {
    return tab(nome).filter(r => {
      for (const [k, v] of sp) if (!RESERVADOS.has(k) && !casa(r, k, v)) return false;
      const ou = sp.get("or");
      if (ou && !partes(ou).some(p => { const [c, ...resto] = p.split("."); return casa(r, c, resto.join(".")); })) return false;
      return true;
    });
  }
  function validar(nome, obj) {
    for (const k of Object.keys(obj)) if (!COLUNAS[nome].has(k)) return `Could not find the '${k}' column of '${nome}'`;
    for (const [c, ok] of Object.entries(CHECKS[nome] || {})) if (c in obj && !ok.includes(obj[c])) return `violates check constraint ${nome}_${c}: ${obj[c]}`;
    return null;
  }

  async function responder(req) {
    if (!req.headers.get("apikey")) return erro(401, "sem apikey");
    if (req.headers.get("authorization") !== `Bearer ${ENV.chave}`) return erro(401, "sem Authorization");
    const u = new URL(req.url), sp = u.searchParams;
    const nome = u.pathname.replace(/^\/rest\/v1\//, "");
    if (!COLUNAS[nome]) return erro(404, `relation ${nome} does not exist`);
    const ruins = colunasFiltro(nome, sp);
    if (ruins.length) return erro(400, `column ${nome}.${ruins[0]} does not exist`);
    const prefer = req.headers.get("prefer") || "";
    const devolve = linhas => prefer.includes("return=representation")
      ? new Response(JSON.stringify(structuredClone(linhas)), { status: 201, headers: { "content-type": "application/json" } })
      : new Response(null, { status: 201 });

    if (req.method === "GET") {
      let rows = filtrar(nome, sp);
      const ordem = sp.get("order");
      if (ordem) {
        const regras = ordem.split(",").map(o => { const [c, d] = o.split("."); return { c, s: d === "desc" ? -1 : 1 }; });
        rows = [...rows].sort((x, y) => { for (const { c, s } of regras) { if (x[c] < y[c]) return -s; if (x[c] > y[c]) return s; } return 0; });
      }
      const off = +(sp.get("offset") || 0), lim = sp.get("limit") != null ? +sp.get("limit") : Infinity;
      rows = rows.slice(off, off + lim);
      const sel = sp.get("select");
      if (sel && sel !== "*") { const cs = sel.split(","); rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] ?? null]))); }
      return new Response(JSON.stringify(structuredClone(rows)), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (req.method === "POST") {
      const corpo = JSON.parse(await req.text());
      const lista = Array.isArray(corpo) ? corpo : [corpo];
      const conflito = sp.get("on_conflict");
      const merge = conflito && prefer.includes("resolution=merge-duplicates");
      if (conflito && !merge) return erro(400, "on_conflict sem merge-duplicates");
      const chaves = conflito ? conflito.split(",") : UNICAS[nome];
      const vistos = new Set(), out = [];
      for (const obj of lista) {
        const ruim = validar(nome, obj);
        if (ruim) return erro(400, ruim);
        for (const c of NAO_NULOS[nome] || []) if (obj[c] == null) return erro(400, `null value in column "${c}" of ${nome}`);
        if (chaves) {
          const k = chaves.map(c => String(obj[c])).join("|");
          if (merge && vistos.has(k)) return erro(500, "ON CONFLICT DO UPDATE command cannot affect row a second time");
          vistos.add(k);
          const ex = tab(nome).find(r => chaves.every(c => String(r[c]) === String(obj[c])));
          if (ex && merge) { Object.assign(ex, obj); out.push(ex); continue; }
          if (ex) return erro(409, `duplicate key value violates unique constraint on ${nome}`);
        }
        const novo = { ...obj };
        if (COLUNAS[nome].has("id") && novo.id == null) novo.id = ++seq;
        if (COLUNAS[nome].has("criado_em") && novo.criado_em == null) novo.criado_em = relogio().toISOString();
        for (const c of COLUNAS[nome]) if (!(c in novo)) novo[c] = null;
        tab(nome).push(novo);
        out.push(novo);
      }
      return devolve(out);
    }

    if (req.method === "PATCH") {
      const dados = JSON.parse(await req.text());
      const ruim = validar(nome, dados);
      if (ruim) return erro(400, ruim);
      const rows = filtrar(nome, sp);
      for (const r of rows) Object.assign(r, dados);
      return prefer.includes("return=representation")
        ? new Response(JSON.stringify(structuredClone(rows)), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(null, { status: 204 });
    }
    return erro(405, "método");
  }
  return { t, tab, responder };
}

/* ------------------------------------------------------------
   APIs externas falsas
   ------------------------------------------------------------ */
const jsonResp = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });

function diasEntre(de, ate) {
  const out = [];
  for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// Conta 555 (cliente B): C1 converte bem; C2 gasta sem conversa e com CTR baixo.
const ANUNCIOS_META = [
  { ad: "A1", camp: "C1", cn: "Invisível · ângulo dor", an: "Reels · trava o sorriso", spend: 10, imp: 1000, reach: 700, freq: 1.43, clicks: 20, conv: 2 },
  { ad: "A2", camp: "C1", cn: "Invisível · ângulo dor", an: "Carrossel do alinhador", spend: 10, imp: 1000, reach: 700, freq: 1.43, clicks: 18, conv: 1 },
  { ad: "A3", camp: "C2", cn: "Campanha sem conversa", an: "Vídeo antigo", spend: 15, imp: 1000, reach: 830, freq: 1.2, clicks: 5, conv: 0 },
];
// O Meta repete a mesma conversa em dois action_types — somar os dois dobraria.
const acoes = n => (n ? [
  { action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(n) },
  { action_type: "onsite_conversion.total_messaging_connection", value: String(n) },
  { action_type: "link_click", value: "17" },
] : [{ action_type: "link_click", value: "4" }]);

function fakeMeta(u, estado) {
  const m = u.pathname.match(/^\/v23\.0\/act_(\w+)\/insights$/);
  if (!m) return jsonResp({ error: { message: `rota falsa desconhecida ${u.pathname}`, code: 1 } }, 404);
  estado.meta.push(u.toString());
  if (m[1] === "999") return jsonResp({ error: { message: "Invalid OAuth access token - Cannot parse access token", type: "OAuthException", code: 190 } }, 400);
  const { since, until } = JSON.parse(u.searchParams.get("time_range"));
  const dias = diasEntre(since, until);
  if (u.searchParams.get("level") === "campaign") {
    const data = [];
    for (const d of dias) for (const c of ["C1", "C2"]) {
      const ads = ANUNCIOS_META.filter(a => a.camp === c);
      const s = k => ads.reduce((t, a) => t + a[k], 0);
      data.push({ campaign_id: c, campaign_name: ads[0].cn, impressions: String(s("imp")), reach: String(s("reach")), frequency: String(ads[0].freq),
                  clicks: String(s("clicks")), spend: s("spend").toFixed(2), actions: acoes(s("conv")), date_start: d, date_stop: d });
    }
    return jsonResp({ data });
  }
  // nível anúncio em duas páginas (paginação por cursor)
  const pagina2 = u.searchParams.get("after") === "pg2";
  const data = [];
  for (const d of dias) for (const a of ANUNCIOS_META.filter(x => (x.ad === "A3") === pagina2)) {
    data.push({ campaign_id: a.camp, campaign_name: a.cn, ad_id: a.ad, ad_name: a.an, impressions: String(a.imp), reach: String(a.reach),
                frequency: String(a.freq), clicks: String(a.clicks), spend: a.spend.toFixed(2), actions: acoes(a.conv), date_start: d, date_stop: d });
  }
  const prox = new URL(u); prox.searchParams.set("after", "pg2");
  return jsonResp(pagina2 ? { data, paging: {} } : { data, paging: { cursors: { after: "pg2" }, next: prox.toString() } });
}

async function fakeGoogle(req, u, estado) {
  const versao = u.pathname.split("/")[1];
  estado.google.push(versao);
  if (versao === "v23") return new Response("<html><body>Not Found</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  if (req.headers.get("authorization") !== "Bearer ya29.falso" || req.headers.get("developer-token") !== "dev-token") {
    return jsonResp([{ error: { code: 401, message: "Request is missing required authentication credential.", status: "UNAUTHENTICATED" } }], 401);
  }
  const { query } = JSON.parse(await req.text());
  const [, de, ate] = query.match(/BETWEEN '([\d-]+)' AND '([\d-]+)'/);
  const anuncio = /FROM ad_group_ad/.test(query);
  const results = diasEntre(de, ate).map(d => ({
    segments: { date: d },
    campaign: { resourceName: "customers/1234567890/campaigns/111", id: "111", name: "Pesquisa · dentista na cidade" },
    ...(anuncio ? { adGroup: { name: "Grupo dentista" }, adGroupAd: { ad: { id: "9001", resourceName: "x" } } } : {}),
    metrics: { impressions: "300", clicks: "20", costMicros: "12000000", conversions: 1, conversionsValue: 0 },
  }));
  return jsonResp([{ results, fieldMask: "x", requestId: "r1" }]);
}

async function fakeWhatsApp(req, u, estado) {
  const corpo = JSON.parse(await req.text());
  estado.wa.push({ phoneId: u.pathname.split("/")[2], ...corpo });
  if (estado.quebrados.has(corpo.to)) return jsonResp({ error: { message: "(#100) Invalid parameter", code: 100 } }, 400);
  if (corpo.type === "text" && estado.janelaFechada.has(corpo.to)) {
    return jsonResp({ error: { message: "(#131047) Re-engagement message", code: 131047,
      error_data: { details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." } } }, 400);
  }
  return jsonResp({ messaging_product: "whatsapp", contacts: [{ input: corpo.to, wa_id: corpo.to }], messages: [{ id: `wamid.${estado.wa.length}` }] });
}

function cenario({ config = {}, tabelas = {} } = {}) {
  const estado = { agora: new Date(AGORA), log: [], meta: [], google: [], wa: [], janelaFechada: new Set(), quebrados: new Set() };
  const banco = criarBanco({
    nx_config: [{ id: 1, cron_token: "cron-secreto", codigo_gestor: "x", funcoes_url: `${FN}`, painel_url: "https://jpfamelli.github.io/nexus-ads/",
                  wa_access_token: "wa-token", wa_phone_number_id: "900900", wa_template: "nexus_aviso", wa_verify_token: "verifica-123",
                  meta_app_secret: "segredo-do-app", anthropic_api_key: null, modelo_ia: "claude-opus-5", google_api_versao: null, ...config }],
    nx_clientes: [
      { id: CLI_A, slug: "clinica-a", nome: "Clínica Alfa", ativo: true, cfg: { waGestor: ["12911112222"] }, wa_phone_number_id: "111" },
      { id: CLI_B, slug: "kamiguchi", nome: "Kamiguchi Odontologia", ativo: true, wa_phone_number_id: "222",
        cfg: { nomeCurto: "Kamiguchi", cpaAlvo: 15, waGestor: [GESTOR_B], waCliente: ["12997552370"] } },
      { id: CLI_C, slug: "inativa", nome: "Clínica Parada", ativo: false, cfg: {}, wa_phone_number_id: "333" },
    ],
    nx_integracoes: [
      { id: 1, cliente_id: CLI_A, canal: "meta", ativo: true, cred: { meta_access_token: "EAAtokenA", meta_ad_account_id: "act_999" }, ultimo_sync: null, status: null },
      { id: 2, cliente_id: CLI_A, canal: "google", ativo: true, ultimo_sync: null, status: null,
        cred: { google_developer_token: "dev-token", google_customer_id: "123-456-7890", google_client_id: "cid", google_client_secret: "cs", google_refresh_token: "rt" } },
      { id: 3, cliente_id: CLI_B, canal: "meta", ativo: true, cred: { meta_access_token: "EAAtokenB", meta_ad_account_id: "555" }, ultimo_sync: null, status: null },
      { id: 4, cliente_id: CLI_C, canal: "meta", ativo: true, cred: { meta_access_token: "EAAtokenC", meta_ad_account_id: "777" }, ultimo_sync: null, status: null },
    ],
    nx_metricas_dia: [], nx_leads: [], nx_alertas: [], nx_relatorios: [], nx_execucoes: [],
    ...tabelas,
  }, () => estado.agora);

  const fetch = async (entrada, init) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    estado.log.push(`${req.method} ${u.host}${u.pathname}${u.search}`);
    if (u.origin === SUPA && u.pathname.startsWith("/rest/v1/")) return banco.responder(req);
    if (u.host === "graph.facebook.com" && u.pathname.endsWith("/messages")) return fakeWhatsApp(req, u, estado);
    if (u.host === "graph.facebook.com") return fakeMeta(u, estado);
    if (u.host === "oauth2.googleapis.com") return jsonResp({ access_token: "ya29.falso", expires_in: 3599, token_type: "Bearer" });
    if (u.host === "googleads.googleapis.com") return fakeGoogle(req, u, estado);
    throw new TypeError(`fetch falso: host inesperado ${u.host}`);
  };
  return { banco, estado, fetch, deps: extra => ({ fetch, agora: () => estado.agora, ...extra }) };
}

const pedirCron = (fn, corpo, token = "cron-secreto") => new Request(`${FN}/${fn}`, {
  method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-nx-cron": token } : {}) }, body: JSON.stringify(corpo ?? {}),
});
const lerJson = async r => ({ status: r.status, corpo: await r.json() });

/* ------------------------------------------------------------
   nx-ciclo
   ------------------------------------------------------------ */
test("nx-ciclo: 401 sem x-nx-cron e com token errado", async () => {
  const s = cenario();
  const r1 = await ciclo(new Request(`${FN}/nx-ciclo`, { method: "POST" }), ENV, s.deps());
  assert.equal(r1.status, 401);
  assert.equal(s.estado.log.length, 0, "sem header nem chega a ler o banco");
  const r2 = await ciclo(pedirCron("nx-ciclo", {}, "token-errado"), ENV, s.deps());
  assert.equal(r2.status, 401);
  assert.equal(s.estado.meta.length, 0);
  assert.equal(s.banco.tab("nx_execucoes").length, 0);
  const r3 = await ciclo(new Request(`${FN}/nx-ciclo`, { method: "GET" }), ENV, s.deps());
  assert.equal(r3.status, 405);
});

test("nx-ciclo: sync do Meta mapeia insights → linhas (campanha e anúncio) e faz upsert", async () => {
  const s = cenario();
  const { status, corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps()));
  assert.equal(status, 200);
  assert.deepEqual(corpo.clientes.map(c => c.cliente), ["kamiguchi"], "só o cliente pedido");

  const linhas = s.banco.tab("nx_metricas_dia").filter(l => l.cliente_id === CLI_B);
  assert.equal(linhas.length, 8 * 5, "8 dias (hoje-7 … hoje) × (2 campanhas + 3 anúncios)");
  assert.deepEqual([...new Set(linhas.map(l => l.data))].sort()[0], "2026-09-20");

  const camp = linhas.find(l => l.nivel === "campanha" && l.campanha_ext === "C1" && l.data === "2026-09-26");
  assert.equal(camp.anuncio_ext, "", "nível campanha grava anuncio_ext vazio (faz parte da PK)");
  assert.equal(camp.anuncio_nome, null);
  assert.equal(camp.campanha_nome, "Invisível · ângulo dor");
  assert.equal(camp.plataforma, "meta");
  assert.equal(camp.gasto, 20);
  assert.equal(camp.impressoes, 2000);
  assert.equal(camp.alcance, 1400);
  assert.equal(camp.cliques, 38);
  assert.equal(camp.conversoes, 3, "conversa contada uma vez, não somada nos dois action_types");

  const ad = linhas.find(l => l.nivel === "anuncio" && l.anuncio_ext === "A1" && l.data === "2026-09-26");
  assert.equal(ad.campanha_ext, "C1");
  assert.equal(ad.anuncio_nome, "Reels · trava o sorriso");
  assert.equal(ad.gasto, 10);
  assert.equal(ad.frequencia, 1.43);
  assert.equal(ad.conversoes, 2);
  assert.ok(linhas.some(l => l.anuncio_ext === "A3"), "segunda página do cursor também entra");

  const integ = s.banco.tab("nx_integracoes").find(i => i.id === 3);
  assert.equal(integ.status, "ok — 40 linhas");
  assert.equal(integ.ultimo_sync, AGORA.toISOString());
  assert.ok(s.estado.log.some(l => l.includes("nx_metricas_dia?on_conflict=cliente_id%2Cplataforma%2Cnivel%2Cdata%2Ccampanha_ext%2Canuncio_ext")));
  const url = s.estado.meta[0];
  assert.match(url, /time_increment=1/);
  assert.match(url, /level=campaign/);
  assert.ok(decodeURIComponent(url).includes('"since":"2026-09-20","until":"2026-09-27"'));

  // segunda rodada: mesmas chaves → atualiza, não duplica
  s.estado.agora = new Date(AGORA.getTime() + HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  const depois = s.banco.tab("nx_metricas_dia").filter(l => l.cliente_id === CLI_B);
  assert.equal(depois.length, 40);
  assert.ok(depois.every(l => l.atualizado_em === s.estado.agora.toISOString()));
});

test("nx-ciclo: falha do Meta não derruba o Google nem o outro cliente", async () => {
  const s = cenario();
  const { status, corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo"), ENV, s.deps()));
  assert.equal(status, 200);
  assert.equal(corpo.ok, false, "a rodada registra que algo falhou");
  assert.deepEqual(corpo.clientes.map(c => c.cliente).sort(), ["clinica-a", "kamiguchi"], "inativo fica de fora");

  const integ = id => s.banco.tab("nx_integracoes").find(i => i.id === id);
  assert.match(integ(1).status, /^erro — Meta API 400: Invalid OAuth access token.*\(código 190\)$/);
  assert.equal(integ(1).ultimo_sync, null);
  assert.ok(!integ(1).status.includes("EAAtokenA"));
  assert.equal(integ(2).status, "ok — 16 linhas", "Google do mesmo cliente sincronizou");
  assert.equal(integ(3).status, "ok — 40 linhas", "o outro cliente sincronizou");
  assert.equal(integ(4).status, null);

  const g = s.banco.tab("nx_metricas_dia").filter(l => l.plataforma === "google");
  assert.equal(g.length, 16);
  const gad = g.find(l => l.nivel === "anuncio" && l.data === "2026-09-26");
  assert.equal(gad.gasto, 12, "cost_micros / 1e6");
  assert.equal(gad.anuncio_ext, "9001");
  assert.equal(gad.anuncio_nome, "Grupo dentista · 9001");
  assert.equal(gad.alcance, 0);
  assert.equal(g.find(l => l.nivel === "campanha").anuncio_ext, "");

  const exec = s.banco.tab("nx_execucoes");
  assert.equal(exec.length, 1);
  assert.equal(exec[0].tarefa, "nx-ciclo");
  assert.equal(exec[0].ok, false);
  assert.equal(exec[0].resumo.clientes.length, 2);
});

test("nx-ciclo: Google cai para a próxima versão no 404 e lembra a que funcionou", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, s.deps());
  assert.deepEqual(s.estado.google, ["v23", "v22", "v22"], "404 na v23, depois as duas consultas na v22");
  assert.equal(s.banco.tab("nx_config")[0].google_api_versao, "v22");

  s.estado.google.length = 0;
  s.estado.agora = new Date(AGORA.getTime() + HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, s.deps());
  assert.deepEqual(s.estado.google, ["v22", "v22"], "a próxima rodada vai direto na versão lembrada");
});

test("nx-ciclo: radar grava alerta novo, avisa o gestor e não repete dentro de 24h", async () => {
  const s = cenario();
  const { corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps()));
  const al = s.banco.tab("nx_alertas");
  assert.deepEqual(al.map(a => a.chave).sort(), ["r2|meta:C2", "r3|meta:A3"]);
  const r2 = al.find(a => a.regra === "r2");
  assert.equal(r2.severidade, "critico");
  assert.equal(r2.referencia, "2026-09-26", "referência = ontem");
  assert.match(r2.mensagem, /Campanha sem conversa gastou R\$\s?45,00 em 3 dias/);
  assert.equal(r2.enviado_em, AGORA.toISOString());
  assert.equal(r2.erro_envio, null);
  assert.equal(corpo.clientes[0].alertas_novos, 2);

  assert.equal(s.estado.wa.length, 1, "um único texto com os alertas novos");
  const msg = s.estado.wa[0];
  assert.equal(msg.to, GESTOR_B);
  assert.equal(msg.phoneId, "900900", "sai pelo número da Nexus");
  assert.match(msg.text.body, /Kamiguchi · Radar de tráfego\* — 1 item crítico/);

  s.estado.agora = new Date(AGORA.getTime() + HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  assert.equal(s.banco.tab("nx_alertas").length, 2, "mesma chave dentro de 24h não é gravada de novo");
  assert.equal(s.estado.wa.length, 1, "nem reenviada");

  s.estado.agora = new Date(AGORA.getTime() + 25 * HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  assert.equal(s.banco.tab("nx_alertas").length, 4, "passadas 24h, volta a avisar");
  assert.equal(s.estado.wa.length, 2);
});

test("nx-ciclo: alerta sem WhatsApp configurado registra o motivo e não quebra", async () => {
  const s = cenario({ config: { wa_access_token: null } });
  const { status } = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps()));
  assert.equal(status, 200);
  const al = s.banco.tab("nx_alertas");
  assert.equal(al.length, 2);
  assert.ok(al.every(a => a.enviado_em === null && a.erro_envio === "whatsapp não configurado"));
});

test("nx-ciclo: waGestor salvo como texto também funciona", async () => {
  const s = cenario();
  s.banco.tab("nx_clientes").find(c => c.id === CLI_B).cfg.waGestor = `${GESTOR_B}, 12911112222`;
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  assert.deepEqual(s.estado.wa.map(m => m.to).sort(), [GESTOR_B, "5512911112222"].sort());
});

test("nx-ciclo: destino sem nenhum dígito fica registrado como inválido (não some calado)", async () => {
  const s = cenario();
  s.banco.tab("nx_clientes").find(c => c.id === CLI_B).cfg.waGestor = ["gestor"];
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  const al = s.banco.tab("nx_alertas");
  assert.equal(al.length, 2);
  assert.ok(al.every(a => a.enviado_em === null && a.erro_envio === "nenhum número de destino válido"));
  assert.equal(s.estado.wa.length, 0);
});

test("nx-ciclo: API que não responde estoura o prazo sem segurar os outros clientes", async () => {
  const s = cenario();
  let travadas = 0;
  const fetch = (url, init = {}) => {
    const u = new URL(url);
    if (u.host === "graph.facebook.com" && u.pathname.includes("act_555")) {
      travadas++;
      assert.ok(init.signal, "chamada externa sai com prazo");
      return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
    }
    return s.fetch(url, init);
  };
  const t = Date.now();
  const { status, corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo"), ENV, { fetch, agora: () => s.estado.agora, prazoRede: 60 }));
  assert.equal(status, 200);
  assert.ok(Date.now() - t < 3000, "respondeu sem esperar a conexão presa");
  assert.equal(travadas, 1);
  const integ = id => s.banco.tab("nx_integracoes").find(i => i.id === id);
  assert.match(integ(3).status, /^erro — graph\.facebook\.com não respondeu em/);
  assert.equal(integ(3).ultimo_sync, null);
  assert.equal(integ(2).status, "ok — 16 linhas", "o Google do outro cliente sincronizou");
  assert.equal(corpo.clientes.find(c => c.cliente === "kamiguchi").ok, false);
  assert.equal(s.banco.tab("nx_execucoes").length, 1, "a execução fica registrada");
});

test("nx-ciclo: Meta respondendo 200 com corpo cortado é erro, não sync vazio com status ok", async () => {
  const s = cenario();
  const fetch = (url, init) => new URL(url).pathname.includes("act_555")
    ? Promise.resolve(new Response('{"data":[{"campaign_id":"C1"', { status: 200, headers: { "content-type": "application/json" } }))
    : s.fetch(url, init);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, { fetch, agora: () => s.estado.agora });
  const integ = s.banco.tab("nx_integracoes").find(i => i.id === 3);
  assert.match(integ.status, /^erro — Meta API: resposta ilegível/);
  assert.equal(integ.ultimo_sync, null);
});

/* ------------------------------------------------------------
   nx-relatorio
   ------------------------------------------------------------ */
test("nx-relatorio: 401 sem header, 400 com tipo inválido", async () => {
  const s = cenario();
  assert.equal((await relatorio(new Request(`${FN}/nx-relatorio`, { method: "POST", body: "{}" }), ENV, s.deps())).status, 401);
  assert.equal((await relatorio(pedirCron("nx-relatorio", { tipo: "semanal" }), ENV, s.deps())).status, 400);
  assert.equal((await relatorio(pedirCron("nx-relatorio", { cliente: "1; drop" }), ENV, s.deps())).status, 400);
});

test("nx-relatorio diário: IA falha → leitura por regras + erro gravado; não reenvia sem forcar", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());   // popula métricas e alertas
  s.estado.wa.length = 0;

  let chamadas = 0;
  const iaQuebrada = async () => { chamadas++; throw new Error("Anthropic sem resposta: Connection error."); };
  const { status, corpo } = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, s.deps({ ia: iaQuebrada })));
  assert.equal(status, 200);
  assert.equal(chamadas, 1);
  assert.equal(corpo.clientes[0].enviado, true);

  const [rel] = s.banco.tab("nx_relatorios");
  assert.equal(rel.tipo, "diario");
  assert.equal(rel.referencia, "2026-09-26");
  assert.equal(rel.leitura_ia, null);
  assert.equal(rel.erro, "IA: Anthropic sem resposta: Connection error.");
  assert.equal(rel.enviado_em, AGORA.toISOString());
  assert.deepEqual(rel.destinos, [GESTOR_B]);
  assert.match(rel.texto, /^📊 \*Kamiguchi · Tráfego pago\* — 26\/09\/2026/);
  assert.match(rel.texto, /\*Leitura do dia\*\n• Prioridade: Checar “Campanha sem conversa”/, "leitura por regras no lugar da IA");
  assert.equal(s.estado.wa.length, 1);
  assert.equal(s.estado.wa[0].to, GESTOR_B);
  assert.equal(s.estado.wa[0].text.body, rel.texto);

  // de novo, sem forcar: já foi enviado
  const r2 = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, s.deps({ ia: iaQuebrada })));
  assert.equal(r2.corpo.clientes[0].pulado, "já enviado");
  assert.equal(s.estado.wa.length, 1, "não reenvia");
  assert.equal(chamadas, 1, "nem chama a IA");

  // forcar + IA funcionando
  let recebido = null;
  const iaOk = async o => { recebido = o; return "• Custo por conversa em **R$ 8,33**, abaixo da meta: manter a verba.\n• “Campanha sem conversa” gastou R$ 45 sem conversa: pausar hoje."; };
  s.estado.agora = new Date(AGORA.getTime() + HORA);
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B, forcar: true }), ENV, s.deps({ ia: iaOk }));
  assert.equal(recebido.tipo, "diario");
  assert.equal(recebido.modelo, "claude-opus-5");
  assert.equal(recebido.chave, "sk-ant-teste");
  assert.ok(recebido.contexto.ontem && recebido.contexto.metas && recebido.contexto.ultimos_7_dias, "manda os números crus do contextoIA");
  const [rel2] = s.banco.tab("nx_relatorios");
  assert.equal(s.banco.tab("nx_relatorios").length, 1, "upsert na mesma referência");
  assert.equal(rel2.erro, null);
  assert.match(rel2.leitura_ia, /^• Custo por conversa em \*R\$ 8,33\*/, "negrito de markdown vira negrito do WhatsApp");
  assert.ok(rel2.texto.includes(`*Leitura do dia*\n${rel2.leitura_ia}`));
  assert.equal(rel2.enviado_em, s.estado.agora.toISOString());
  assert.equal(s.estado.wa.length, 2);
});

test("nx-relatorio: IA que não responde é cortada no prazo e o relatório sai assim mesmo", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  s.estado.wa.length = 0;
  const t = Date.now();
  const { corpo } = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV,
    s.deps({ ia: () => new Promise(() => {}), prazoIA: 80 })));
  assert.ok(Date.now() - t < 3000);
  assert.equal(corpo.clientes[0].enviado, true);
  assert.equal(corpo.clientes[0].ia, "falhou");
  const [rel] = s.banco.tab("nx_relatorios");
  assert.equal(rel.erro, "IA: tempo esgotado");
  assert.equal(rel.leitura_ia, null);
  assert.match(rel.texto, /\*Leitura do dia\*\n• Prioridade:/, "leitura por regras");
  assert.equal(s.estado.wa.length, 1);
});

test("nx-relatorio: sem chave da IA não chama a IA; cliente sem investimento é pulado", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo"), ENV, s.deps());
  s.estado.wa.length = 0;
  const { corpo } = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario" }), ENV,
    s.deps({ ia: async () => { throw new Error("não devia ser chamada"); } })));
  const porCli = Object.fromEntries(corpo.clientes.map(c => [c.cliente, c]));
  assert.equal(porCli.kamiguchi.ia, "sem chave");
  assert.equal(porCli.kamiguchi.enviado, true);
  assert.equal(porCli["clinica-a"].enviado, true, "cliente A tem Google com gasto");
  const relB = s.banco.tab("nx_relatorios").find(r => r.cliente_id === CLI_B);
  assert.equal(relB.erro, null);
  assert.equal(s.banco.tab("nx_execucoes").at(-1).tarefa, "nx-relatorio");

  const vazio = cenario({ tabelas: { nx_integracoes: [] } });
  const r = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, vazio.deps()));
  assert.equal(r.corpo.clientes[0].pulado, "sem investimento no período");
  assert.equal(vazio.estado.wa.length, 0);
});

test("nx-relatorio mensal: último mês completo, vai para a clínica e para o gestor", async () => {
  const agosto = [];
  for (const d of diasEntre("2026-08-01", "2026-08-31")) {
    const base = { cliente_id: CLI_B, plataforma: "meta", data: d, campanha_ext: "C1", campanha_nome: "Invisível · ângulo dor",
                   alcance: 700, frequencia: 1.4, valor_conversao: 0, atualizado_em: AGORA.toISOString() };
    agosto.push({ ...base, nivel: "campanha", anuncio_ext: "", anuncio_nome: null, impressoes: 1000, cliques: 20, gasto: 20, conversoes: 2 });
    agosto.push({ ...base, nivel: "anuncio", anuncio_ext: "A1", anuncio_nome: "Reels · trava o sorriso", impressoes: 1000, cliques: 20, gasto: 20, conversoes: 2 });
  }
  const leads = [
    { id: 1, cliente_id: CLI_B, telefone: "5512900000001", nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
      servico: "Implante", etapa: "fechou", data_conversa: "2026-08-05", data_agenda: "2026-08-07", data_consulta: "2026-08-12", valor: 3500 },
  ];
  const s = cenario({ tabelas: { nx_metricas_dia: agosto, nx_leads: leads } });
  const { corpo } = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "mensal" }), ENV, s.deps()));
  const porCli = Object.fromEntries(corpo.clientes.map(c => [c.cliente, c]));
  assert.equal(porCli["clinica-a"].pulado, "sem investimento no período");

  const [rel] = s.banco.tab("nx_relatorios");
  assert.equal(rel.tipo, "mensal");
  assert.equal(rel.referencia, "2026-08-01", "1º dia do último mês completo");
  assert.deepEqual(rel.destinos, ["12997552370", GESTOR_B], "cliente + gestor");
  assert.match(rel.texto, /Kamiguchi · Resultados de agosto/);
  assert.match(rel.texto, /Investido em anúncios: R\$\s?620/);
  assert.match(rel.texto, /1 paciente fechou tratamento/);
  assert.deepEqual(s.estado.wa.map(m => m.to).sort(), ["5512997552370", GESTOR_B].sort());
});

/* ------------------------------------------------------------
   nx-whatsapp (webhook)
   ------------------------------------------------------------ */
const assinar = (corpo, segredo = "segredo-do-app") => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
const postWebhook = (payload, assinatura) => {
  const corpo = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Request(`${FN}/nx-whatsapp`, { method: "POST", headers: { "content-type": "application/json", ...(assinatura !== null ? { "x-hub-signature-256": assinatura ?? assinar(corpo) } : {}) }, body: corpo });
};
const mensagem = ({ pid = "222", from, nome = "Maria Souza", referral, statuses } = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "551239990000", phone_number_id: pid },
    ...(statuses ? { statuses } : {
      contacts: [{ profile: { name: nome }, wa_id: from }],
      messages: [{ from, id: `wamid.${Math.random()}`, timestamp: "1790506800", type: "text", text: { body: "Oi, vi o anúncio" }, ...(referral ? { referral } : {}) }],
    }),
  } }] }],
});
const REFERRAL = { source_url: "https://fb.me/abc", source_id: "A1", source_type: "ad", headline: "Aparelho invisível", ctwa_clid: "ARAkLkA8rmlFeiCktEJQ" };

test("nx-whatsapp GET: verificação ok devolve o challenge; token errado 403", async () => {
  const s = cenario();
  const ok = await webhook(new Request(`${FN}/nx-whatsapp?hub.mode=subscribe&hub.verify_token=verifica-123&hub.challenge=1158201444`), ENV, s.deps());
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "1158201444");
  const ruim = await webhook(new Request(`${FN}/nx-whatsapp?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=1`), ENV, s.deps());
  assert.equal(ruim.status, 403);
  const semModo = await webhook(new Request(`${FN}/nx-whatsapp?hub.verify_token=verifica-123&hub.challenge=1`), ENV, s.deps());
  assert.equal(semModo.status, 403);
});

test("nx-whatsapp POST: assinatura inválida ou ausente → 401; sem app secret → 401", async () => {
  const s = cenario();
  const payload = mensagem({ from: "5512988887777", referral: REFERRAL });
  assert.equal((await webhook(postWebhook(payload, "sha256=deadbeef"), ENV, s.deps())).status, 401);
  assert.equal((await webhook(postWebhook(payload, assinar(JSON.stringify(payload), "outro-segredo")), ENV, s.deps())).status, 401);
  assert.equal((await webhook(postWebhook(payload, null), ENV, s.deps())).status, 401);
  // corpo alterado depois de assinado
  const corpo = JSON.stringify(payload);
  assert.equal((await webhook(postWebhook(corpo.replace("5512988887777", "5512900000000"), assinar(corpo)), ENV, s.deps())).status, 401);
  assert.equal(s.banco.tab("nx_leads").length, 0);

  const semSegredo = cenario({ config: { meta_app_secret: null } });
  assert.equal((await webhook(postWebhook(payload), ENV, semSegredo.deps())).status, 401);
});

test("nx-whatsapp POST válido: cria lead com o anúncio de origem e não duplica em 30 dias", async () => {
  const s = cenario({ tabelas: {
    nx_metricas_dia: [{ cliente_id: CLI_B, plataforma: "meta", nivel: "anuncio", data: "2026-09-25", campanha_ext: "C1", anuncio_ext: "A1",
                        campanha_nome: "Invisível", anuncio_nome: "Reels", impressoes: 1, alcance: 1, frequencia: 1, cliques: 0, gasto: 1, conversoes: 0, valor_conversao: 0, atualizado_em: null }],
    nx_leads: [
      { id: 50, cliente_id: CLI_B, telefone: "12977776666", nome: "Pedro (manual)", origem: "manual", plataforma: null, campanha_ext: null, anuncio_ext: null,
        ctwa_clid: null, etapa: "nova", data_conversa: "2026-09-20" },
      { id: 51, cliente_id: CLI_B, telefone: "5512955554444", nome: "Antiga", origem: "whatsapp", plataforma: null, anuncio_ext: null, etapa: "perdida", data_conversa: "2026-08-01" },
    ],
  } });

  const r1 = await webhook(postWebhook(mensagem({ from: "5512988887777", referral: REFERRAL })), ENV, s.deps());
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).criado, 1);
  const novo = s.banco.tab("nx_leads").find(l => l.telefone === "5512988887777");
  assert.equal(novo.cliente_id, CLI_B);
  assert.equal(novo.nome, "Maria Souza");
  assert.equal(novo.origem, "anuncio");
  assert.equal(novo.plataforma, "meta");
  assert.equal(novo.anuncio_ext, "A1");
  assert.equal(novo.campanha_ext, "C1", "campanha achada em nx_metricas_dia pelo anúncio");
  assert.equal(novo.ctwa_clid, "ARAkLkA8rmlFeiCktEJQ");
  assert.equal(novo.data_conversa, "2026-09-27", "hoje em São Paulo");
  assert.equal(novo.etapa, "nova");

  // mesma pessoa manda outra mensagem: nada muda
  await webhook(postWebhook(mensagem({ from: "5512988887777" })), ENV, s.deps());
  await webhook(postWebhook(mensagem({ from: "5512988887777", referral: { ...REFERRAL, source_id: "A2" } })), ENV, s.deps());
  const daMaria = s.banco.tab("nx_leads").filter(l => l.telefone === "5512988887777");
  assert.equal(daMaria.length, 1, "não duplica em 30 dias");
  assert.equal(daMaria[0].anuncio_ext, "A1", "atribuição existente não é trocada");

  // lead manual sem anúncio (cadastrado sem 55): a mensagem com referral completa a atribuição
  const r3 = await (await webhook(postWebhook(mensagem({ from: "5512977776666", nome: "Pedro", referral: REFERRAL })), ENV, s.deps())).json();
  assert.equal(r3.atribuido, 1);
  const pedro = s.banco.tab("nx_leads").filter(l => l.cliente_id === CLI_B && l.nome?.startsWith("Pedro"));
  assert.equal(pedro.length, 1);
  assert.equal(pedro[0].anuncio_ext, "A1");
  assert.equal(pedro[0].campanha_ext, "C1");
  assert.equal(pedro[0].origem, "anuncio");
  assert.equal(pedro[0].plataforma, "meta");

  // conversa de mais de 30 dias atrás: é um lead novo, sem anúncio → origem whatsapp
  await webhook(postWebhook(mensagem({ from: "5512955554444", nome: "Voltou" })), ENV, s.deps());
  const voltou = s.banco.tab("nx_leads").filter(l => l.telefone === "5512955554444");
  assert.equal(voltou.length, 2);
  const n = voltou.find(l => l.id !== 51);
  assert.equal(n.origem, "whatsapp");
  assert.equal(n.plataforma, null);
  assert.equal(n.anuncio_ext, null);

  // recibos (statuses) e número que não é de nenhum cliente: 200 e nada gravado
  const total = s.banco.tab("nx_leads").length;
  const st = await webhook(postWebhook(mensagem({ statuses: [{ id: "wamid.x", status: "delivered", recipient_id: "5512988887777" }] })), ENV, s.deps());
  assert.equal(st.status, 200);
  const outro = await webhook(postWebhook(mensagem({ pid: "000", from: "5512911110000", referral: REFERRAL })), ENV, s.deps());
  assert.equal(outro.status, 200);
  assert.equal((await outro.json()).sem_cliente, 1);
  const lixo = await webhook(postWebhook("isto não é json"), ENV, s.deps());
  assert.equal(lixo.status, 200);
  assert.equal(s.banco.tab("nx_leads").length, total);
});

test("variantes de telefone cobrem 55 e o nono dígito", () => {
  assert.deepEqual(variantesTelefone("5512977776666").sort(), ["1277776666", "12977776666", "551277776666", "5512977776666"].sort());
  assert.ok(variantesTelefone("551277776666").includes("5512977776666"), "número antigo sem o 9 acha o cadastro com 9");
  assert.equal(normalizarTelefone("(12) 99755-2370"), "5512997552370");
  assert.equal(normalizarTelefone("5512997552370"), "5512997552370");
});

/* ------------------------------------------------------------
   Envio de WhatsApp
   ------------------------------------------------------------ */
test("WhatsApp: erro de janela de 24h cai no template; destino quebrado não impede os outros", async () => {
  const s = cenario();
  const cfg = s.banco.tab("nx_config")[0];
  s.estado.janelaFechada.add("5512911112222");
  s.estado.quebrados.add("5512933334444");
  const r = await enviarParaTodos(cfg, ["12911112222", "12933334444", GESTOR_B, "5512911112222"], "texto longo\ncom quebra", { fetch: s.fetch, titulo: "Radar Kamiguchi:\n2 alertas" });
  assert.equal(r.length, 3, "destino repetido (com e sem 55) sai uma vez só");
  assert.deepEqual(r[0], { destino: "5512911112222", ok: true, via: "template" });
  assert.equal(r[1].ok, false);
  assert.match(r[1].erro, /código 100/);
  assert.deepEqual(r[2], { destino: GESTOR_B, ok: true, via: "texto" });

  const tpl = s.estado.wa.find(m => m.type === "template");
  assert.equal(tpl.to, "5512911112222");
  assert.equal(tpl.template.name, "nexus_aviso");
  assert.deepEqual(tpl.template.language, { code: "pt_BR" });
  assert.deepEqual(tpl.template.components[0].parameters.map(p => p.text), ["Radar Kamiguchi: 2 alertas", "https://jpfamelli.github.io/nexus-ads/"]);

  // sem template configurado, o erro original volta
  const semTpl = await enviarParaTodos({ ...cfg, wa_template: null }, ["12911112222"], "oi", { fetch: s.fetch });
  assert.equal(semTpl[0].ok, false);
  assert.match(semTpl[0].erro, /131047/);

  // sem WhatsApp configurado: não lança, registra o motivo
  const nada = await enviarParaTodos({ ...cfg, wa_access_token: "" }, [GESTOR_B], "oi", { fetch: s.fetch });
  assert.deepEqual(nada, [{ destino: GESTOR_B, ok: false, erro: "whatsapp não configurado" }]);

  // texto acima do limite da API é cortado
  s.estado.wa.length = 0;
  await enviarParaTodos(cfg, [GESTOR_B], "x".repeat(5000), { fetch: s.fetch });
  assert.equal(s.estado.wa[0].text.body.length, 4096);
});

/* ------------------------------------------------------------
   ia.js — carregado com o SDK trocado por um dublê (o "npm:" não resolve no Node)
   ------------------------------------------------------------ */
const SDK_FALSO = `
export default class Anthropic {
  constructor(o) {
    globalThis.__ia.push({ ctor: o });
    const criar = tipo => async p => { globalThis.__ia.push({ tipo, p }); return globalThis.__iaResp(p); };
    this.messages = { create: criar("messages") };
    this.beta = { messages: { create: criar("beta") } };
  }
}
Anthropic.APIError = class APIError extends Error { constructor(status, msg) { super(msg); this.status = status; } };`;

async function carregarIA() {
  const src = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/ia.js"), "utf8");
  const sdk = `data:text/javascript,${encodeURIComponent(SDK_FALSO)}`;
  assert.ok(src.includes('"npm:@anthropic-ai/sdk"'));
  return import(`data:text/javascript,${encodeURIComponent(src.replace('"npm:@anthropic-ai/sdk"', JSON.stringify(sdk)))}`);
}

test("ia.js: pedido do contrato (opus-5 com fallback), recusa e erro da API", async () => {
  const { leituraIA } = await carregarIA();
  const ctx = { data: "26/09/2026", ontem: { gasto: 35 } };
  globalThis.__ia = [];
  globalThis.__iaResp = () => ({ stop_reason: "end_turn", content: [
    { type: "thinking", thinking: "" },
    { type: "text", text: "• Custo por conversa estável." },
    { type: "text", text: "\n• Pausar a campanha sem conversa." },
  ] });
  const t = await leituraIA({ chave: "sk-ant-x", modelo: "claude-opus-5", tipo: "diario", contexto: ctx });
  assert.equal(t, "• Custo por conversa estável.\n• Pausar a campanha sem conversa.");
  const { ctor } = globalThis.__ia[0], { tipo, p } = globalThis.__ia[1];
  assert.equal(ctor.apiKey, "sk-ant-x");
  assert.equal(tipo, "beta");
  assert.equal(p.model, "claude-opus-5");
  assert.equal(p.max_tokens, 16000);
  assert.deepEqual(p.output_config, { effort: "medium" });
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.equal(p.messages[0].content, JSON.stringify(ctx));
  assert.match(p.system, /Nexus/);
  assert.match(p.system, /no máximo 4 linhas/);

  globalThis.__ia = [];
  await leituraIA({ chave: "k", modelo: "claude-sonnet-5", tipo: "mensal", contexto: ctx });
  const outro = globalThis.__ia[1];
  assert.equal(outro.tipo, "messages", "outros modelos: messages.create sem betas");
  assert.ok(!("betas" in outro.p) && !("fallbacks" in outro.p));
  assert.deepEqual(outro.p.output_config, { effort: "medium" });
  assert.match(outro.p.system, /Para o próximo mês/);

  // modelos sem suporte a effort: mandar output_config daria 400 em toda execução
  for (const modelo of ["claude-opus-4-1", "claude-opus-4-0", "claude-sonnet-4-0", "claude-sonnet-4-5", "claude-haiku-4-5"]) {
    globalThis.__ia = [];
    await leituraIA({ chave: "k", modelo, tipo: "diario", contexto: ctx });
    assert.ok(!("output_config" in globalThis.__ia[1].p), `${modelo} sem effort`);
  }
  globalThis.__ia = [];
  await leituraIA({ chave: "k", modelo: "claude-opus-4-5", tipo: "diario", contexto: ctx });
  assert.deepEqual(globalThis.__ia[1].p.output_config, { effort: "medium" }, "opus 4.5 aceita effort");

  globalThis.__iaResp = () => ({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [{ type: "text", text: "parcial" }] });
  await assert.rejects(leituraIA({ chave: "k", tipo: "diario", contexto: ctx }), /recusou o pedido \(cyber\)/);

  // mesma URL do dublê que o ia.js importou → mesma classe APIError
  const { default: Anthropic } = await import(`data:text/javascript,${encodeURIComponent(SDK_FALSO)}`);
  globalThis.__iaResp = () => { throw new Anthropic.APIError(529, "Overloaded"); };
  await assert.rejects(leituraIA({ chave: "k", tipo: "diario", contexto: ctx }), { message: "Anthropic 529: Overloaded" });

  globalThis.__iaResp = () => ({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "" }] });
  await assert.rejects(leituraIA({ chave: "k", tipo: "diario", contexto: ctx }), /não devolveu texto/);
});

/* ------------------------------------------------------------
   Montagem para o deploy
   ------------------------------------------------------------ */
test("montar-funcoes: dist plano por função, nucleo.js idêntico e módulos importáveis", async () => {
  const saida = execFileSync(process.execPath, [join(RAIZ, "scripts", "montar-funcoes.mjs")], { encoding: "utf8" });
  const nucleo = readFileSync(join(RAIZ, "web", "nucleo.js"));
  const compart = readdirSync(join(RAIZ, "supabase/functions/_compartilhado")).filter(n => n.endsWith(".js"));
  for (const fn of ["nx-ciclo", "nx-relatorio", "nx-whatsapp"]) {
    const pasta = join(RAIZ, "supabase", "dist", fn);
    const arqs = readdirSync(pasta);
    assert.ok(arqs.includes("index.ts"));
    for (const m of compart) assert.ok(arqs.includes(m), `${fn} sem ${m}`);
    assert.ok(readFileSync(join(pasta, "nucleo.js")).equals(nucleo), `${fn}/nucleo.js é cópia byte a byte`);
    assert.ok(arqs.every(a => statSync(join(pasta, a)).isFile()), `${fn} é plano (sem subpastas)`);
    assert.match(saida, new RegExp(fn));
  }
  const handler = { "nx-ciclo": "ciclo.js", "nx-relatorio": "relatorio.js", "nx-whatsapp": "webhook.js" };
  for (const [fn, arq] of Object.entries(handler)) {
    const idx = readFileSync(join(RAIZ, "supabase", "dist", fn, "index.ts"), "utf8");
    assert.ok(idx.includes(`from "./${arq}"`));
    const mod = await import(pathToFileURL(join(RAIZ, "supabase", "dist", fn, arq)).href);
    assert.equal(typeof mod.tratar, "function", `${fn}/${arq} importa no layout plano`);
  }
});

test("só o ia.js importa o SDK e ninguém fora dos index.ts usa Deno.*", () => {
  const dir = join(RAIZ, "supabase/functions/_compartilhado");
  for (const n of readdirSync(dir).filter(x => x.endsWith(".js"))) {
    const txt = readFileSync(join(dir, n), "utf8");
    assert.ok(!/\bDeno\./.test(txt), `${n} usa Deno.*`);
    if (n === "ia.js") assert.match(txt, /from "npm:@anthropic-ai\/sdk"/);
    else assert.ok(!/["']npm:/.test(txt), `${n} importa npm:`);
    if (n !== "relatorio.js") assert.ok(!/["']\.\/ia\.js["']/.test(txt), `${n} carrega ia.js`);
  }
  assert.match(readFileSync(join(dir, "relatorio.js"), "utf8"), /await import\("\.\/ia\.js"\)/, "ia.js só por import dinâmico");
});
