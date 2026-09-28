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

import { tratar as ciclo, explicarErroIntegracao } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import { tratar as webhook, variantesTelefone, textoFalha } from "../supabase/functions/_compartilhado/webhook.js";
import { enviarParaTodos, normalizarTelefone, idsDoEnvio } from "../supabase/functions/_compartilhado/whatsapp.js";
import { comTrava, limparErro } from "../supabase/functions/_compartilhado/comum.js";
import { criarDb } from "../supabase/functions/_compartilhado/db.js";
import { criarBanco as criarBancoFalso } from "./apoio/postgrest-falso.mjs";

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
  nx_alertas: "id cliente_id chave regra severidade mensagem acao valor referencia criado_em enviado_em erro_envio wa_ids wa_ids_template entregue_em",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro wa_ids wa_ids_template entregue_em",
  nx_execucoes: "id tarefa inicio fim ok resumo",
  nx_travas: "nome ate dono",
};
for (const k in COLUNAS) COLUNAS[k] = new Set(COLUNAS[k].split(" "));
const UNICAS = {
  nx_metricas_dia: ["cliente_id", "plataforma", "nivel", "data", "campanha_ext", "anuncio_ext"],
  nx_relatorios: ["cliente_id", "tipo", "referencia"],
  nx_integracoes: ["cliente_id", "canal"],
  nx_travas: ["nome"],
};
// `default` do esquema (20260927_melhorias.sql): vale no INSERT de linha nova sem a coluna
const PADROES = {
  nx_alertas: { wa_ids: [], wa_ids_template: [] },
  nx_relatorios: { wa_ids: [], wa_ids_template: [] },
};
const CHECKS = {
  nx_metricas_dia: { plataforma: ["meta", "google"], nivel: ["campanha", "anuncio"] },
  nx_leads: { origem: ["anuncio", "whatsapp", "indicacao", "organico", "manual", "site"], plataforma: ["meta", "google", null],
              etapa: ["nova", "agendada", "orcamento", "fechou", "nao_fechou", "faltou", "perdida"] },
  nx_alertas: { severidade: ["critico", "alerta", "info"] },
  nx_relatorios: { tipo: ["diario", "mensal"] },
};
const NAO_NULOS = {
  nx_metricas_dia: UNICAS.nx_metricas_dia, nx_leads: ["cliente_id", "telefone"],
  nx_alertas: ["cliente_id", "chave", "wa_ids", "wa_ids_template"], nx_relatorios: ["wa_ids", "wa_ids_template"], nx_travas: ["nome", "ate"],
};
// SaaS (20260928a/f): o webhook consulta nx_canais pelo phone_number_id; este banco não tem canais
// (só o caminho antigo, nx_clientes.wa_phone_number_id). carregarModelo lê nx_funis (filtro do Ads).
COLUNAS.nx_funis = new Set("id cliente_id nome ordem padrao conta_no_ads ativo criado_em".split(" "));
COLUNAS.nx_leads.add("funil_id");
const ESQUEMA = { colunas: COLUNAS, unicas: UNICAS, padroes: PADROES, checks: CHECKS, naoNulos: NAO_NULOS };

/** RPCs com a mesma semântica de supabase/migrations/20260927_melhorias.sql. */
function rpcsAds({ t, tab, relogio, agoraMs, travaXact, pausa, novoId }) {
  return {
    nx_trava_pegar: { args: ["p_nome", "p_segundos", "p_dono"], fn({ p_nome, p_segundos, p_dono }) {
      if (!String(p_nome ?? "").trim()) throw new Error("trava_sem_nome");
      const agora = agoraMs();
      t.nx_travas = tab("nx_travas").filter(r => Date.parse(r.ate) >= agora - 86400e3);   // faxina
      const ate = new Date(agora + Math.max(1, Math.min(p_segundos ?? 60, 2592000)) * 1000).toISOString();
      const ex = tab("nx_travas").find(r => r.nome === p_nome);
      if (!ex) { tab("nx_travas").push({ nome: p_nome, ate, dono: p_dono ?? null }); return true; }
      if (Date.parse(ex.ate) < agora) { Object.assign(ex, { ate, dono: p_dono ?? null }); return true; }
      return false;
    } },
    nx_trava_soltar: { args: ["p_nome", "p_dono"], fn({ p_nome, p_dono }) {
      const antes = tab("nx_travas").length;
      t.nx_travas = tab("nx_travas").filter(r => !(r.nome === p_nome && (r.dono ?? null) === (p_dono ?? null)));
      return t.nx_travas.length < antes;
    } },
    nx_lead_webhook: { args: ["p_cliente", "p_telefone", "p_variantes", "p_nome", "p_atr", "p_hoje"], opcionais: ["p_dias"],
      async fn({ p_cliente, p_telefone, p_variantes, p_nome, p_atr, p_hoje, p_dias = 30 }) {
        const tel = String(p_telefone ?? "").replace(/\D/g, "");
        if (!p_cliente || !p_hoje) throw new Error("parametros_invalidos");
        if (!tel) throw new Error("telefone_invalido");
        const vars = [...new Set([...(p_variantes || []), tel].filter(Boolean))];
        const atr = p_atr || {}, anuncio = atr.anuncio_ext || null, plat = atr.plataforma || null;
        const d = new Date(`${p_hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (p_dias ?? 30));
        const desde = d.toISOString().slice(0, 10);
        return travaXact(`${p_cliente}:${[...vars].sort()[0]}`, async () => {
          const lead = tab("nx_leads")
            .filter(l => l.cliente_id === p_cliente && vars.includes(l.telefone) && String(l.data_conversa) >= desde)
            .sort((a, b) => (String(b.data_conversa).localeCompare(String(a.data_conversa))) || (b.id - a.id))[0];
          await pausa();
          if (lead) {
            if (!anuncio || lead.anuncio_ext) return "existente";
            Object.assign(lead, {
              anuncio_ext: anuncio, ctwa_clid: atr.ctwa_clid || null,
              campanha_ext: atr.campanha_ext || lead.campanha_ext,
              plataforma: plat || lead.plataforma,
              origem: plat ? (atr.origem || lead.origem) : lead.origem,
              atualizado_em: relogio().toISOString(),
            });
            return "atribuido";
          }
          tab("nx_leads").push({
            id: novoId(), cliente_id: p_cliente, telefone: tel, nome: String(p_nome ?? "").trim() || null,
            origem: atr.origem || "whatsapp", plataforma: plat, campanha_ext: atr.campanha_ext || null, anuncio_ext: anuncio,
            ctwa_clid: atr.ctwa_clid || null, servico: null, etapa: "nova", data_conversa: p_hoje, data_agenda: null, data_consulta: null,
            valor: null, obs: null, criado_em: relogio().toISOString(), atualizado_em: relogio().toISOString(),
          });
          return "criado";
        });
      } },
    nx_wa_anotar: { args: ["p_tabela", "p_ids"], opcionais: ["p_entregue_em", "p_wa_id_template", "p_erro"],
      fn({ p_tabela, p_ids, p_entregue_em = null, p_wa_id_template = null, p_erro = null }) {
        const col = { nx_alertas: "erro_envio", nx_relatorios: "erro" }[p_tabela];
        if (!col) throw new Error("tabela_invalida");
        const tpl = String(p_wa_id_template ?? "").trim() || null, nota = String(p_erro ?? "").trim() || null;
        const linhas = tab(p_tabela).filter(r => (p_ids || []).map(Number).includes(Number(r.id)));
        for (const r of linhas) {
          r.entregue_em = r.entregue_em ?? p_entregue_em;
          if (tpl && !r.wa_ids_template.includes(tpl)) r.wa_ids_template = [...r.wa_ids_template, tpl];
          if (nota && !String(r[col] ?? "").includes(nota)) r[col] = [r[col], nota].filter(Boolean).join(" · ").slice(0, 1000);
        }
        return linhas.length;
      } },
  };
}
const rpcsBanco = api => ({ ...rpcsAds(api), nx_wa_canal: { args: [], opcionais: ["p_phone_number_id", "p_chave"], fn: () => null } });
const criarBanco = (inicial, relogio) => criarBancoFalso(inicial, relogio, { esquema: ESQUEMA, rpcs: rpcsBanco, chave: ENV.chave });


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
  const n = ++estado.nWa;   // contador próprio: wamid não se repete mesmo que o teste zere estado.wa
  const msg = { phoneId: u.pathname.split("/")[2], ...corpo };
  estado.wa.push(msg);
  if (estado.quebrados.has(corpo.to)) return jsonResp({ error: { message: "(#100) Invalid parameter", code: 100 } }, 400);
  if (corpo.type === "text" && estado.janelaFechada.has(corpo.to)) {
    return jsonResp({ error: { message: "(#131047) Re-engagement message", code: 131047,
      error_data: { details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." } } }, 400);
  }
  msg.id = `wamid.${n}`;
  return jsonResp({ messaging_product: "whatsapp", contacts: [{ input: corpo.to, wa_id: corpo.to }], messages: [{ id: msg.id }] });
}

function cenario({ config = {}, tabelas = {} } = {}) {
  const estado = { agora: new Date(AGORA), log: [], meta: [], google: [], wa: [], nWa: 0, janelaFechada: new Set(), quebrados: new Set() };
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
    nx_metricas_dia: [], nx_leads: [], nx_alertas: [], nx_relatorios: [], nx_execucoes: [], nx_travas: [],
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
  // id = wamid devolvido pela API (o webhook confirma a entrega por ele)
  assert.deepEqual(r[0], { destino: "5512911112222", ok: true, via: "template", id: "wamid.2" });
  assert.equal(r[1].ok, false);
  assert.match(r[1].erro, /código 100/);
  assert.deepEqual(r[2], { destino: GESTOR_B, ok: true, via: "texto", id: "wamid.4" });
  assert.deepEqual(idsDoEnvio(r), { wa_ids: ["wamid.4"], wa_ids_template: ["wamid.2"] });

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
   Melhorias de 27/09 (supabase/migrations/20260927_melhorias.sql)
   A) entrega do WhatsApp · B) lead duplicado · C) execução sobreposta · D) integração quebrada
   ------------------------------------------------------------ */
const NEXUS = "900900";   // nx_config.wa_phone_number_id do cenário
const seg = d => String(Math.floor(d.getTime() / 1000));
const recibo = (id, status, quando = AGORA, extra = {}) => ({ id, status, timestamp: seg(quando), recipient_id: GESTOR_B, ...extra });
const recibos = (statuses, pid = NEXUS) => postWebhook(mensagem({ pid, statuses }));
const ERRO_JANELA = {
  code: 131047, title: "Re-engagement message", message: "Re-engagement message",
  error_data: { details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." },
};
const NAO_RECEBE = { code: 131026, title: "Message undeliverable", message: "Message undeliverable" };
const TPL_JANELA = "fora da janela de 24h — reenviado como template";

test("A entrega: nx-ciclo e nx-relatorio gravam o wamid de cada envio (texto → wa_ids, template → wa_ids_template)", async () => {
  const s = cenario();
  s.banco.tab("nx_clientes").find(c => c.id === CLI_B).cfg.waGestor = [GESTOR_B, "12911112222"];
  s.estado.janelaFechada.add("5512911112222");   // este cai no template já no envio (erro síncrono)
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  const texto = s.estado.wa.find(m => m.type === "text" && m.id);
  const tpl = s.estado.wa.find(m => m.type === "template");
  assert.equal(texto.to, GESTOR_B);
  assert.equal(tpl.to, "5512911112222");
  const al = s.banco.tab("nx_alertas");
  assert.equal(al.length, 2);
  for (const a of al) {
    assert.deepEqual(a.wa_ids, [texto.id]);
    assert.deepEqual(a.wa_ids_template, [tpl.id]);
    assert.equal(a.entregue_em, null, "entregue só quando o webhook confirmar");
    assert.equal(a.enviado_em, AGORA.toISOString());
  }

  s.estado.wa.length = 0;
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, s.deps());
  const rel = () => s.banco.tab("nx_relatorios")[0];
  const t1 = s.estado.wa.find(m => m.type === "text" && m.id), p1 = s.estado.wa.find(m => m.type === "template");
  assert.deepEqual(rel().wa_ids, [t1.id]);
  assert.deepEqual(rel().wa_ids_template, [p1.id]);
  assert.equal(rel().entregue_em, null);

  // reenvio forçado: troca os wamids e zera a entrega até o webhook confirmar a nova
  rel().entregue_em = "2026-09-27T11:00:03.000Z";
  s.estado.wa.length = 0;
  s.estado.agora = new Date(AGORA.getTime() + HORA);
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B, forcar: true }), ENV, s.deps());
  const t2 = s.estado.wa.find(m => m.type === "text" && m.id);
  assert.notEqual(t2.id, t1.id);
  assert.deepEqual(rel().wa_ids, [t2.id]);
  assert.equal(rel().entregue_em, null);

  // envio que falha em todos os destinos não apaga os wamids nem o horário do envio anterior
  s.estado.quebrados.add(GESTOR_B);
  s.estado.quebrados.add("5512911112222");
  s.estado.agora = new Date(AGORA.getTime() + 2 * HORA);
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B, forcar: true }), ENV, s.deps());
  assert.deepEqual(rel().wa_ids, [t2.id]);
  assert.equal(rel().enviado_em, new Date(AGORA.getTime() + HORA).toISOString());
  assert.match(rel().erro, /código 100/);
});

test("A entrega: delivered/read do número da Nexus grava entregue_em uma vez; recibo de clínica não mexe nos avisos e 'sent' é ignorado", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, s.deps());
  assert.equal(s.estado.wa.length, 2);
  const [idAlerta, idRel] = s.estado.wa.map(m => m.id);
  const t = new Date(AGORA.getTime() + 5e3);
  const al = () => s.banco.tab("nx_alertas"), rel = () => s.banco.tab("nx_relatorios")[0];

  // o mesmo wamid num recibo do número da CLÍNICA nunca mexe nos avisos da Nexus. Desde o SaaS
  // (ESPEC §6.2) recibo de número de cliente vai para nx_wa_status do CANAL (só mensagens das
  // conversas daquele canal — testes/conversas-funcoes.teste.mjs); este banco não tem canais.
  let r = await lerJson(await webhook(recibos([recibo(idAlerta, "delivered", t)], "222"), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.recibos, undefined);
  assert.equal(r.corpo.recibos_canal, 0);
  assert.ok(al().every(a => a.entregue_em === null), "recibo de clínica não marca aviso da Nexus como entregue");
  r = await lerJson(await webhook(recibos([recibo(idAlerta, "sent", t)]), ENV, s.deps()));
  assert.deepEqual(r.corpo.recibos, { ignorado: 1 }, "'sent' não é entrega");
  assert.ok(al().every(a => a.entregue_em === null));

  r = await lerJson(await webhook(recibos([recibo(idAlerta, "delivered", t), recibo(idRel, "read", t)]), ENV, s.deps()));
  assert.deepEqual(r.corpo.recibos, { entregue: 2 });
  assert.ok(al().every(a => a.entregue_em === t.toISOString()), "todos os alertas daquele texto");
  assert.equal(rel().entregue_em, t.toISOString(), "read sem delivered antes também vale");

  // o 'read' que chega depois não muda a hora da entrega
  await webhook(recibos([recibo(idAlerta, "read", new Date(t.getTime() + 60e3))]), ENV, s.deps());
  assert.ok(al().every(a => a.entregue_em === t.toISOString()));
  assert.equal(s.estado.wa.length, 2, "recibo de entrega nunca manda mensagem");
});

test("A entrega: failed 131047 → reenvia como template UMA vez; recibo repetido (até ao mesmo tempo) e falha do template não reenviam", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  const idTexto = s.estado.wa[0].id;
  s.estado.wa.length = 0;
  const falha = () => recibos([recibo(idTexto, "failed", AGORA, { errors: [ERRO_JANELA] })]);

  // a Meta às vezes entrega o mesmo recibo duas vezes — aqui, ao mesmo tempo
  const [r1, r2] = await Promise.all([webhook(falha(), ENV, s.deps()), webhook(falha(), ENV, s.deps())]);
  assert.deepEqual([r1.status, r2.status], [200, 200]);
  const res = [await r1.json(), await r2.json()].map(c => Object.keys(c.recibos).join()).sort();
  assert.deepEqual(res, ["reenviado", "repetido"]);
  assert.equal(s.estado.wa.length, 1, "um template só");
  const tpl = s.estado.wa[0];
  assert.equal(tpl.type, "template");
  assert.equal(tpl.to, GESTOR_B);
  assert.equal(tpl.phoneId, NEXUS, "sai pelo número da Nexus");
  assert.deepEqual(tpl.template.components[0].parameters.map(p => p.text),
    ["Radar Kamiguchi: 2 alertas novos", "https://jpfamelli.github.io/nexus-ads/"], "o mesmo título do envio original");
  for (const a of s.banco.tab("nx_alertas")) {
    assert.deepEqual(a.wa_ids_template, [tpl.id]);
    assert.equal(a.erro_envio, TPL_JANELA);
    assert.equal(a.entregue_em, null);
  }

  // o mesmo recibo de novo, bem depois: nada
  const r3 = await lerJson(await webhook(falha(), ENV, s.deps()));
  assert.deepEqual(r3.corpo.recibos, { repetido: 1 });
  assert.equal(s.estado.wa.length, 1);

  // o TEMPLATE também falha (até por janela): nunca é reenviado — é isso que impede laço
  const r4 = await lerJson(await webhook(recibos([recibo(tpl.id, "failed", AGORA, { errors: [ERRO_JANELA] })]), ENV, s.deps()));
  assert.deepEqual(r4.corpo.recibos, { falha: 1 });
  assert.equal(s.estado.wa.length, 1);
  assert.ok(s.banco.tab("nx_alertas").every(a => a.erro_envio ===
    `${TPL_JANELA} · WhatsApp não entregou (código 131047): Re-engagement message — nem o modelo foi aceito`));
  assert.ok(s.banco.tab("nx_alertas").every(a => a.wa_ids_template.length === 1));
});

test("A entrega: relatório reenviado com o mesmo título; template entregue grava entregue_em; outros códigos e falta de template só viram erro legível", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  s.estado.wa.length = 0;
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, s.deps());
  const idTexto = s.estado.wa[0].id;
  const rel = () => s.banco.tab("nx_relatorios")[0];

  await webhook(recibos([recibo(idTexto, "failed", AGORA, { errors: [ERRO_JANELA] })]), ENV, s.deps());
  assert.equal(s.estado.wa.length, 2);
  const tpl = s.estado.wa[1];
  assert.equal(tpl.template.components[0].parameters[0].text, "Relatório diário Kamiguchi 26/09");
  assert.deepEqual(rel().wa_ids_template, [tpl.id]);
  assert.equal(rel().erro, TPL_JANELA);
  assert.equal(rel().enviado_em, AGORA.toISOString(), "o envio original continua registrado");

  const t = new Date(AGORA.getTime() + 9e3);
  await webhook(recibos([recibo(tpl.id, "delivered", t)]), ENV, s.deps());
  assert.equal(rel().entregue_em, t.toISOString(), "a entrega do template também conta");

  // outro código no texto (número sem WhatsApp): não reenvia, só explica
  const s2 = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s2.deps());
  await webhook(recibos([recibo(s2.estado.wa[0].id, "failed", AGORA, { errors: [NAO_RECEBE] })]), ENV, s2.deps());
  assert.equal(s2.estado.wa.length, 1);
  assert.ok(s2.banco.tab("nx_alertas").every(a => a.erro_envio ===
    "WhatsApp não entregou (código 131026): Message undeliverable — o número não pôde receber (sem WhatsApp, bloqueou a Nexus ou aplicativo muito antigo)"));

  // janela fechada sem template configurado: registra o motivo e não tenta nada
  const s3 = cenario({ config: { wa_template: null } });
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s3.deps());
  const r = await lerJson(await webhook(recibos([recibo(s3.estado.wa[0].id, "failed", AGORA, { errors: [ERRO_JANELA] })]), ENV, s3.deps()));
  assert.deepEqual(r.corpo.recibos, { falha: 1 });
  assert.equal(s3.estado.wa.length, 1);
  assert.ok(s3.banco.tab("nx_alertas").every(a => a.erro_envio ===
    "WhatsApp não entregou (código 131047): Re-engagement message — fora da janela de 24h e sem modelo (wa_template) configurado"));

  assert.equal(textoFalha({}), "WhatsApp não entregou (código ?): falhou");
  assert.equal(textoFalha({ code: 131049, title: "This message was not delivered to maintain healthy ecosystem engagement." }),
    "WhatsApp não entregou (código 131049): This message was not delivered to maintain healthy ecosystem engagement. — a Meta segurou a mensagem para não cansar quem recebe");
});

test("A entrega: recibo que chega antes do wamid ser gravado espera e confere de novo; item com erro não derruba o lote; sem assinatura 401", async () => {
  const s = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  const id = s.estado.wa[0].id;
  const al = s.banco.tab("nx_alertas");
  const guardados = al.map(a => a.wa_ids);
  for (const a of al) a.wa_ids = [];   // o nx-ciclo ainda não chegou a gravar
  const esperas = [];
  const esperar = async ms => { esperas.push(ms); al.forEach((a, i) => { a.wa_ids = guardados[i]; }); };
  const t = new Date(AGORA.getTime() + 2e3);
  let r = await lerJson(await webhook(recibos([recibo(id, "delivered", t)]), ENV, s.deps({ esperar })));
  assert.deepEqual(esperas, [4000]);
  assert.deepEqual(r.corpo.recibos, { entregue: 1 });
  assert.ok(al.every(a => a.entregue_em === t.toISOString()));

  // recibo antigo de um envio que o sistema não conhece: não espera à toa
  esperas.length = 0;
  r = await lerJson(await webhook(recibos([recibo("wamid.desconhecido", "delivered", new Date(AGORA.getTime() - 2 * HORA))]), ENV, s.deps({ esperar })));
  assert.deepEqual(esperas, []);
  assert.deepEqual(r.corpo.recibos, { sem_registro: 1 });

  // um recibo que quebra (banco falhando só para ele) não impede os outros do lote
  const s2 = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s2.deps());
  const fetch = (url, init) => (String(url).includes("quebra") ? Promise.reject(new TypeError("fetch failed")) : s2.fetch(url, init));
  r = await lerJson(await webhook(recibos([recibo("wamid.quebra", "delivered", t), recibo(s2.estado.wa[0].id, "delivered", t)]), ENV,
    { fetch, agora: () => s2.estado.agora, esperar: async () => {} }));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.erros, 1);
  assert.match(r.corpo.erro, /fetch failed/);
  assert.deepEqual(r.corpo.recibos, { entregue: 1 });
  assert.ok(s2.banco.tab("nx_alertas").every(a => a.entregue_em === t.toISOString()));

  // assinatura continua obrigatória para recibos
  const s3 = cenario();
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s3.deps());
  const semAss = await webhook(postWebhook(mensagem({ pid: NEXUS, statuses: [recibo(s3.estado.wa[0].id, "failed", AGORA, { errors: [ERRO_JANELA] })] }), null), ENV, s3.deps());
  assert.equal(semAss.status, 401);
  assert.equal(s3.estado.wa.length, 1);
  assert.ok(s3.banco.tab("nx_alertas").every(a => a.erro_envio === null && a.wa_ids_template.length === 0));
});

test("B lead: webhooks paralelos para o mesmo número novo viram UM lead (também com e sem o nono dígito)", async () => {
  const s = cenario();
  const par = await Promise.all([1, 2].map(() => webhook(postWebhook(mensagem({ from: "5512988887777", referral: REFERRAL })), ENV, s.deps())));
  const cont = await Promise.all(par.map(r => r.json()));
  assert.deepEqual(cont.map(c => c.criado).sort(), [0, 1]);
  assert.deepEqual(cont.map(c => c.existente).sort(), [0, 1]);
  const leads = s.banco.tab("nx_leads").filter(l => l.telefone === "5512988887777");
  assert.equal(leads.length, 1);
  assert.equal(leads[0].anuncio_ext, "A1");
  assert.equal(leads[0].origem, "anuncio");

  // o mesmo celular chegando com e sem o 9, ao mesmo tempo (a trava é pela forma canônica do número)
  await Promise.all([
    webhook(postWebhook(mensagem({ from: "5512966665555", nome: "Rita" })), ENV, s.deps()),
    webhook(postWebhook(mensagem({ from: "551266665555", nome: "Rita" })), ENV, s.deps()),
  ]);
  assert.equal(s.banco.tab("nx_leads").filter(l => variantesTelefone("5512966665555").includes(l.telefone)).length, 1);

  // cinco webhooks paralelos de um terceiro número: continua um lead só
  await Promise.all([1, 2, 3, 4, 5].map(() => webhook(postWebhook(mensagem({ from: "5512944443333" })), ENV, s.deps())));
  assert.equal(s.banco.tab("nx_leads").filter(l => l.telefone === "5512944443333").length, 1);
});

test("B lead: uma mensagem com erro não derruba as outras do lote (200, erro contado)", async () => {
  const s = cenario();
  const fetch = (url, init) => (String(url).includes("/rpc/nx_lead_webhook") && String(init?.body).includes("5512900000099")
    ? Promise.resolve(jsonResp({ code: "40P01", message: "deadlock detected" }, 500))
    : s.fetch(url, init));
  const payload = mensagem({ from: "5512900000099", nome: "Quebra" });
  const v = payload.entry[0].changes[0].value;
  v.contacts.push({ profile: { name: "Outra" }, wa_id: "5512988887777" });
  v.messages.push({ from: "5512988887777", id: "wamid.m2", timestamp: "1790506800", type: "text", text: { body: "oi" } });
  const r = await lerJson(await webhook(postWebhook(payload), ENV, { fetch, agora: () => s.estado.agora }));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.criado, 1);
  assert.equal(r.corpo.erros, 1);
  assert.match(r.corpo.erro, /deadlock detected/);
  assert.deepEqual(s.banco.tab("nx_leads").map(l => [l.telefone, l.nome]), [["5512988887777", "Outra"]]);
});

test("C trava: nx-ciclo com o cliente travado responde pulado sem processar nem registrar; trava vencida é retomada e solta no fim", async () => {
  const ocupada = { nome: `nx-ciclo:${CLI_B}`, ate: new Date(AGORA.getTime() + 60e3).toISOString(), dono: "outra-execucao" };
  const s = cenario({ tabelas: { nx_travas: [ocupada] } });
  const r = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { ok: true, pulado: "já em execução" });
  assert.equal(s.estado.meta.length + s.estado.google.length + s.estado.wa.length, 0, "nada processado");
  assert.equal(s.banco.tab("nx_execucoes").length, 0, "nem registrado");
  assert.equal(s.banco.tab("nx_alertas").length, 0);
  assert.deepEqual(s.banco.tab("nx_travas"), [ocupada], "a trava da outra execução continua lá");

  // a outra execução foi cortada sem soltar: a trava vence sozinha
  s.estado.agora = new Date(AGORA.getTime() + 61e3);
  const r2 = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps()));
  assert.equal(r2.corpo.pulado, undefined);
  assert.equal(r2.corpo.clientes[0].pulado, undefined);
  assert.equal(s.banco.tab("nx_execucoes").length, 1);
  assert.deepEqual(s.banco.tab("nx_travas"), [], "solta no fim");
});

test("C trava: botão de UMA clínica rodando não faz o cron pular as outras (ciclo e relatório do dia)", async () => {
  // o gestor clicou "Atualizar agora" da Kamiguchi e a execução dele ainda está no ar quando o cron das :07 dispara
  const botao = { nome: `nx-ciclo:${CLI_B}`, ate: new Date(AGORA.getTime() + 60e3).toISOString(), dono: "botao" };
  const s = cenario({ tabelas: { nx_travas: [botao] } });
  const { corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo"), ENV, s.deps()));
  assert.equal(corpo.pulado, undefined, "o cron roda");
  const porCliente = Object.fromEntries(corpo.clientes.map(c => [c.cliente, c]));
  assert.equal(porCliente.kamiguchi.pulado, "já em execução", "só a clínica que o botão está processando fica de fora");
  assert.equal(porCliente.kamiguchi.ok, true);
  assert.ok(porCliente["clinica-a"].sync, "a outra clínica é sincronizada");
  assert.ok(s.estado.google.length > 0);
  assert.ok(!s.estado.meta.some(u => u.includes("act_555")), "a Kamiguchi não é buscada em dobro");
  const [ex] = s.banco.tab("nx_execucoes");
  assert.deepEqual(ex.resumo.clientes.map(c => [c.cliente, c.pulado ?? null]).sort(), [["clinica-a", null], ["kamiguchi", "já em execução"]]);
  assert.deepEqual(s.banco.tab("nx_travas"), [botao], "a trava do botão não é mexida");

  // relatório do dia: o cron roda UMA vez por dia; o botão de uma clínica às 8h não pode tirar o relatório das outras
  const s2 = cenario();
  await ciclo(pedirCron("nx-ciclo"), ENV, s2.deps());   // métricas das duas clínicas
  s2.estado.wa.length = 0;
  s2.banco.tab("nx_travas").push({ nome: `nx-relatorio:diario:${CLI_B}`, ate: new Date(AGORA.getTime() + 60e3).toISOString(), dono: "botao" });
  const r = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario" }), ENV, s2.deps()));
  assert.equal(r.corpo.pulado, undefined);
  assert.deepEqual(s2.banco.tab("nx_relatorios").map(x => x.cliente_id), [CLI_A], "a Clínica Alfa recebe o relatório do dia");
  assert.deepEqual(s2.estado.wa.map(m => m.to), ["5512911112222"]);
  assert.equal(r.corpo.clientes.find(c => c.cliente === "kamiguchi").pulado, "já em execução");
});

test("C trava: cron e botão ao mesmo tempo → cada clínica é processada uma vez só (alerta sai uma vez só)", async () => {
  const s = cenario();
  const par = await Promise.all([ciclo(pedirCron("nx-ciclo"), ENV, s.deps()), ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps())]);
  const corpos = await Promise.all(par.map(r => r.json()));
  // quem processou alguém registra; quem só pulou não registra nada
  assert.equal(s.banco.tab("nx_execucoes").length, corpos.filter(c => !c.pulado).length);
  assert.ok(s.banco.tab("nx_execucoes").every(e => e.resumo.clientes.some(c => !c.pulado)), "nenhuma execução só de pulados");
  const kami = corpos.flatMap(c => c.clientes || []).filter(c => c.cliente === "kamiguchi");
  assert.equal(kami.filter(c => !c.pulado).length, 1, "a Kamiguchi foi processada uma vez");
  assert.equal(s.estado.meta.filter(u => u.includes("act_555") && u.includes("level=campaign")).length, 1);
  assert.equal(s.banco.tab("nx_alertas").filter(a => a.cliente_id === CLI_B).length, 2, "2 alertas, não 4");
  assert.equal(s.estado.wa.filter(m => m.to === GESTOR_B).length, 1, "um WhatsApp, não dois");
  assert.deepEqual(s.banco.tab("nx_travas"), []);
});

test("C trava: nx-relatorio trava por tipo e cliente; erro no meio solta a trava do mesmo jeito", async () => {
  const s = cenario({ tabelas: { nx_travas: [{ nome: `nx-relatorio:diario:${CLI_B}`, ate: new Date(AGORA.getTime() + 60e3).toISOString(), dono: "x" }] } });
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s.deps());
  s.estado.wa.length = 0;
  const execAntes = s.banco.tab("nx_execucoes").length;
  const r = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B, forcar: true }), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, tipo: "diario", pulado: "já em execução" });
  assert.equal(s.estado.wa.length, 0);
  assert.equal(s.banco.tab("nx_relatorios").length, 0);
  assert.equal(s.banco.tab("nx_execucoes").length, execAntes);

  // o mensal tem trava própria
  const m = await lerJson(await relatorio(pedirCron("nx-relatorio", { tipo: "mensal", cliente: CLI_B }), ENV, s.deps()));
  assert.equal(m.corpo.pulado, undefined);
  assert.equal(s.banco.tab("nx_execucoes").length, execAntes + 1);
  assert.deepEqual(s.banco.tab("nx_travas").map(t => t.nome), [`nx-relatorio:diario:${CLI_B}`]);

  // banco sem a função da trava (deploy antes da migração): erro do cliente registrado, sem processar
  const s3 = cenario();
  const semTrava = (url, init) => (String(url).includes("/rpc/nx_trava_pegar")
    ? Promise.resolve(jsonResp({ code: "PGRST202", message: "Could not find the function public.nx_trava_pegar" }, 404))
    : s3.fetch(url, init));
  const q = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, { fetch: semTrava, agora: () => s3.estado.agora }));
  assert.equal(q.corpo.ok, false);
  assert.match(q.corpo.clientes[0].erro, /nx_trava_pegar/);
  assert.equal(s3.estado.meta.length, 0, "sem trava não processa (evita alerta em dobro)");
  assert.equal(s3.banco.tab("nx_execucoes")[0].ok, false, "e o erro aparece nas execuções do painel");

  // exceção dentro da execução: a trava é solta (finally)
  const db = criarDb(ENV, s.fetch);
  await assert.rejects(comTrava(db, "teste", 170, async () => { throw new Error("quebrou no meio"); }), /quebrou no meio/);
  assert.ok(!s.banco.tab("nx_travas").some(t => t.nome === "teste"));
  assert.deepEqual(await comTrava(db, "teste", 170, async () => 42), { pulado: false, valor: 42 }, "e pode ser pega de novo");
});

test("D integração: token vencido → 1 alerta 'integracao' e 1 WhatsApp em 24 rodadas (não 24); volta a avisar só depois de 24h", async () => {
  const s = cenario();   // cliente A: Meta com token inválido (código 190); Google ok
  const integ = () => s.banco.tab("nx_alertas").filter(a => a.regra === "integracao");
  const avisos = () => s.estado.wa.filter(m => m.text?.body.includes("A conexão com o Meta"));
  for (let h = 0; h < 24; h++) {
    s.estado.agora = new Date(AGORA.getTime() + h * HORA);
    await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, s.deps());
  }
  assert.equal(integ().length, 1);
  const [al] = integ();
  assert.equal(al.chave, "integracao|meta");
  assert.equal(al.severidade, "critico");
  assert.equal(al.mensagem, "A conexão com o Meta da Clínica Alfa parou: o token de acesso venceu ou foi desativado. Abra Ajustes → Integrações.");
  assert.match(al.acao, /token novo/);
  assert.equal(al.valor, null);
  assert.equal(al.enviado_em, AGORA.toISOString());
  assert.equal(avisos().length, 1);
  assert.equal(avisos()[0].to, "5512911112222");
  assert.match(avisos()[0].text.body, /Clínica Alfa · Radar de tráfego\* — 1 item crítico/);
  assert.deepEqual(al.wa_ids, [avisos()[0].id], "o aviso de integração também é acompanhado pelo webhook");
  assert.match(s.banco.tab("nx_integracoes").find(i => i.id === 2).status, /^ok/, "o Google do mesmo cliente segue");

  s.estado.agora = new Date(AGORA.getTime() + 25 * HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, s.deps());
  assert.equal(integ().length, 2, "passadas 24h, lembra de novo");
  assert.equal(avisos().length, 2);

  // voltou a funcionar: nada é enviado sobre a integração
  s.banco.tab("nx_integracoes").find(i => i.id === 1).cred.meta_ad_account_id = "555";
  s.estado.agora = new Date(AGORA.getTime() + 50 * HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, s.deps());
  assert.equal(integ().length, 2);
  assert.equal(avisos().length, 2);
});

test("D integração: instabilidade só avisa depois de 3 h sem atualizar; radar quebrado não engole o aviso", async () => {
  const s = cenario();
  s.banco.tab("nx_integracoes").find(i => i.id === 3).ultimo_sync = new Date(AGORA.getTime() - HORA).toISOString();
  const fetch = (url, init = {}) => (new URL(url).pathname.includes("act_555")
    ? new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)))
    : s.fetch(url, init));
  const deps = { fetch, agora: () => s.estado.agora, prazoRede: 30 };
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, deps);
  assert.equal(s.banco.tab("nx_alertas").length, 0, "1 h sem atualizar pode ser só instabilidade");
  assert.equal(s.estado.wa.length, 0);

  s.estado.agora = new Date(AGORA.getTime() + 2 * HORA);   // 3 h desde o último sync bom
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, deps);
  const al = s.banco.tab("nx_alertas").filter(a => a.regra === "integracao");
  assert.equal(al.length, 1);
  assert.equal(al[0].mensagem, "A conexão com o Meta da Kamiguchi parou: o Meta não está respondendo (sem atualizar há mais de 3 h). Abra Ajustes → Integrações.");
  assert.match(al[0].acao, /^Nada a fazer agora/);
  assert.equal(s.estado.wa.length, 1);
  assert.equal(s.estado.wa[0].to, GESTOR_B);

  // radar quebrado (leitura de leads falhando) ainda manda o aviso de integração
  const s2 = cenario();
  const fetch2 = (url, init) => (new URL(url).pathname === "/rest/v1/nx_leads" ? Promise.resolve(jsonResp({ message: "canceling statement due to statement timeout" }, 500)) : s2.fetch(url, init));
  const { corpo } = await lerJson(await ciclo(pedirCron("nx-ciclo", { cliente: CLI_A }), ENV, { fetch: fetch2, agora: () => s2.estado.agora }));
  assert.equal(corpo.clientes[0].ok, false);
  assert.match(corpo.clientes[0].erro_radar, /statement timeout/);
  assert.deepEqual(s2.banco.tab("nx_alertas").map(a => a.chave), ["integracao|meta"]);
  assert.equal(s2.estado.wa.length, 1);
  assert.match(s2.estado.wa[0].text.body, /Clínica Alfa · Radar de tráfego\* — 1 item crítico/);
  assert.match(s2.estado.wa[0].text.body, /A conexão com o Meta da Clínica Alfa parou/);
});

test("D integração: erro técnico vira explicação curta para leigo (sem token no texto)", () => {
  const e = (canal, msg) => explicarErroIntegracao(canal, msg);
  assert.equal(e("meta", "Meta API 400: Error validating access token: Session has expired on Friday, 25-Sep-26 (código 190)").curto,
    "o token de acesso venceu ou foi desativado");
  assert.equal(e("meta", "Meta API 403: (#200) Ad account owner has NOT grant ads_management or ads_read permission (código 200)").curto,
    "o token não tem permissão para ler esta conta de anúncios");
  assert.deepEqual(e("meta", "Meta API 400: (#17) User request limit reached (código 17)").passageiro, true);
  assert.deepEqual(e("meta", "error sending request for url (https://graph.facebook.com/v23.0/act_1/insights)"),
    { curto: "o Meta não está respondendo", acao: "Nada a fazer agora: o sistema tenta de novo a cada hora e avisa se continuar.", passageiro: true });
  assert.equal(e("google", "Google Ads 403: The developer token is only approved for use with test accounts. To access non-test accounts, apply for Basic or Standard access.").curto,
    "o developer token do Google ainda não foi aprovado para contas reais");
  assert.equal(e("google", "OAuth Google 400: Token has been expired or revoked.").curto, "a autorização do Google venceu ou foi revogada");
  assert.equal(e("google", "Google Ads 403: User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the 'login-customer-id' header.").curto,
    "o usuário do Google não tem acesso a esta conta");
  assert.equal(e("google", "Google Ads 400: Invalid customer ID '1234567890'.").curto, "a conta do Google Ads não foi encontrada");
  assert.equal(e("google", "Google Ads: nenhuma versão da API respondeu (v23: 404, v22: 404)").curto, "o Google desligou a versão da API em uso");
  const cru = e("meta", "Meta API 400: algo inesperado em https://graph.facebook.com/x?access_token=EAAsegredo123 (código 999)");
  assert.equal(cru.passageiro, false);
  assert.ok(!cru.curto.includes("EAAsegredo123"), "token nunca vai para o alerta");
  assert.match(cru.acao, /Ajustes → Integrações/);
});

test("D integração: token SOLTO no erro do Meta ('Malformed access token EAA…') não vai para status, alerta nem execuções", async () => {
  const TOKEN = "EAAGm0PX4ZCpsBAKZCZBZAqR7tLw9xY2zVb8nM3kJ5hG6fD1sA";
  const s = cenario();
  s.banco.tab("nx_integracoes").find(i => i.id === 3).cred.meta_access_token = TOKEN;
  const fetch = (url, init) => (new URL(url).pathname.includes("act_555")
    ? Promise.resolve(jsonResp({ error: { message: `Malformed access token ${TOKEN}`, type: "OAuthException", code: 190 } }, 400))
    : s.fetch(url, init));
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, { fetch, agora: () => s.estado.agora });
  const tudo = JSON.stringify({ integ: s.banco.tab("nx_integracoes"), alertas: s.banco.tab("nx_alertas"), exec: s.banco.tab("nx_execucoes"), wa: s.estado.wa });
  const semCred = tudo.replace(JSON.stringify(s.banco.tab("nx_integracoes").find(i => i.id === 3).cred), "");
  assert.ok(!semCred.includes(TOKEN.slice(3, 20)), "o token só existe dentro de cred");
  assert.match(s.banco.tab("nx_integracoes").find(i => i.id === 3).status, /^erro — Meta API 400: Malformed access token EAA\*\*\* \(código 190\)$/);
  assert.equal(s.banco.tab("nx_alertas").find(a => a.regra === "integracao").mensagem,
    "A conexão com o Meta da Kamiguchi parou: o token de acesso venceu ou foi desativado. Abra Ajustes → Integrações.");

  // o mesmo para os outros formatos de credencial que um erro pode ecoar
  const vazados = [
    "OAuth Google 400: refresh_token=1//0gAbCdEfGhIjKlMnOpQrStUvWxYz invalid",
    "token 1//0gAbCdEfGhIjKlMnOpQrStUvWxYz revogado",
    "token ya29.a0AfB_byC1d2E3f4G5h6 expirou",
    "Google Ads 400: client_secret: GOCSPX-abc123def456 errado",
    "Authorization eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2VncmVkbw falhou",
    "chave sb_secret_AbCdEf123456 recusada",
  ];
  for (const v of vazados) {
    const limpo = limparErro(v);
    for (const seg of ["0gAbCdEfGhIjKl", "a0AfB_byC1d2", "GOCSPX-abc123", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "AbCdEf123456"]) {
      assert.ok(!limpo.includes(seg), `${v} → ${limpo}`);
    }
  }
  assert.equal(limparErro("Meta API 400: (#100) Invalid parameter (código 100)"), "Meta API 400: (#100) Invalid parameter (código 100)", "texto comum fica igual");

  // o token do WhatsApp da NEXUS colado errado: a Meta devolve ele inteiro, e nx_relatorios.erro a clínica enxerga
  const TOKEN_WA = "EAAQx7NexusSystemUserToken0123456789abcdefXYZ";
  const s2 = cenario({ config: { wa_access_token: TOKEN_WA } });
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, s2.deps());
  s2.banco.tab("nx_alertas").length = 0;
  const waQuebrado = (url, init) => (new URL(url).pathname.endsWith("/messages")
    ? Promise.resolve(jsonResp({ error: { message: `Malformed access token ${TOKEN_WA}`, type: "OAuthException", code: 190 } }, 401))
    : s2.fetch(url, init));
  s2.estado.agora = new Date(AGORA.getTime() + 25 * HORA);
  await ciclo(pedirCron("nx-ciclo", { cliente: CLI_B }), ENV, { fetch: waQuebrado, agora: () => s2.estado.agora });
  await relatorio(pedirCron("nx-relatorio", { tipo: "diario", cliente: CLI_B }), ENV, { fetch: waQuebrado, agora: () => s2.estado.agora });
  assert.match(s2.banco.tab("nx_relatorios")[0].erro, /^WhatsApp 401: Malformed access token EAA\*\*\* \(código 190\)$/, "o motivo continua legível");
  assert.ok(s2.banco.tab("nx_alertas").length > 0 && s2.banco.tab("nx_alertas").every(a => /EAA\*\*\*/.test(a.erro_envio)));
  const gravado = JSON.stringify({ a: s2.banco.tab("nx_alertas"), r: s2.banco.tab("nx_relatorios"), e: s2.banco.tab("nx_execucoes") });
  assert.ok(!gravado.includes(TOKEN_WA.slice(3, 25)), "sem o token da Nexus");
});

test("migração 20260927: idempotente, RLS e funções novas só para a service_role; banco falso com as mesmas colunas", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260927_melhorias.sql"), "utf8");
  const s = sql.replace(/--.*$/gm, "");
  // pode rodar duas vezes sem erro e sem apagar nada
  assert.ok(!/create\s+table\s+(?!if not exists)/i.test(s), "create table sem if not exists");
  assert.ok(!/create\s+(unique\s+)?index\s+(?!if not exists)/i.test(s), "create index sem if not exists");
  assert.ok(!/add\s+column\s+(?!if not exists)/i.test(s), "add column sem if not exists");
  assert.ok(!/create\s+function/i.test(s), "função sem or replace");
  assert.ok(!/\b(drop|truncate)\b/i.test(s), "nada é apagado");

  const funcoes = [...s.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?\$(\w*)\$([\s\S]*?)\$\3\$/gi)]
    .map(m => ({ nome: m[1], args: m[2], cab: m[0].slice(0, m[0].indexOf("$")) }));
  assert.deepEqual(funcoes.map(f => f.nome).sort(), ["nx_dados", "nx_lead_webhook", "nx_trava_pegar", "nx_trava_soltar", "nx_wa_anotar"]);
  for (const f of funcoes.filter(x => x.nome !== "nx_dados")) {
    const tipos = f.args.split(",").map(a => a.trim().split(/\s+/)[1]).join(", ");
    assert.ok(s.includes(`revoke all on function public.${f.nome}(${tipos}) from public, anon, authenticated;`), `${f.nome}: falta o revoke`);
    assert.ok(s.includes(`grant execute on function public.${f.nome}(${tipos}) to service_role;`), `${f.nome}: falta o grant à service_role`);
    assert.match(f.cab, /security definer/, `${f.nome}: security definer`);
    assert.match(f.cab, /set search_path = ''/, `${f.nome}: search_path fixo`);
  }
  assert.match(s, /alter table public\.nx_travas enable row level security;/);
  assert.match(s, /revoke all on table public\.nx_travas from public, anon, authenticated;/);
  assert.match(s, /pg_advisory_xact_lock\(hashtextextended\(p_cliente::text \|\| ':' \|\|/);
  assert.match(s, /on conflict \(nome\) do update[\s\S]*?where t\.ate < now\(\)/);
  for (const t of ["nx_alertas", "nx_relatorios"]) for (const c of ["wa_ids", "wa_ids_template"]) {
    assert.match(s, new RegExp(`create index if not exists \\w+ on public\\.${t} using gin \\(${c}\\)`), `${t}.${c} sem índice GIN`);
  }

  // o PostgREST falso não pode ficar atrás da migração
  for (const m of s.matchAll(/alter table public\.(\w+)([^;]*);/g)) {
    for (const c of m[2].matchAll(/add column if not exists (\w+)/g)) assert.ok(COLUNAS[m[1]].has(c[1]), `banco falso sem ${m[1]}.${c[1]}`);
  }
  const travas = s.match(/create table if not exists public\.nx_travas \(([\s\S]*?)\);/)[1];
  assert.deepEqual(travas.split(",").map(l => l.trim().split(/\s+/)[0]), [...COLUNAS.nx_travas]);

  // nx_dados: só ganhou entregue_em (o resto é a definição que está no banco)
  assert.match(s, /select regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em\s+from public\.nx_alertas/);
  assert.match(s, /select tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em\s+from public\.nx_relatorios/);
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
