/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (15/10/2026), frente srv: Edge Functions
   node --test testes/plano1000b-funcoes.teste.mjs
   Um caso de COMPORTAMENTO por item (cada um falha no código anterior). Sem rede e sem chave real: PostgREST, Graph e Storage
   são dublês (o mesmo desenho de testes/plano1000-funcoes.teste.mjs); o radar e o relatório usam o PostgREST em memória de
   testes/apoio. O que é SQL (migração 20261015a) é provado pelo smoke supabase/testes/33_plano1000b.sql.
   Datas de fixture fixas e injetadas (relógio do ciclo/relatório): nada depende da hora em que a suíte roda.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";

import { primeiroNomeSemTratamento, erroDeEnvio, anonimizarEnvio, carregarModelo, TETO_METRICAS } from "../supabase/functions/_compartilhado/comum.js";
import { criarDb } from "../supabase/functions/_compartilhado/db.js";
import { tratar as enviar } from "../supabase/functions/_compartilhado/enviar.js";
import { tratar as midia } from "../supabase/functions/_compartilhado/midia.js";
import { tratar as ciclo } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import { buscarMeta, proximaPagina } from "../supabase/functions/_compartilhado/meta.js";
import { montarPrompt } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { criarBanco as criarBancoFalso } from "./apoio/postgrest-falso.mjs";

const SUPA = "https://fake.supabase.co";
const ENV = { url: SUPA, chave: "service-role-falsa" };
const FN = `${SUPA}/functions/v1`;
const CLI_A = "11111111-1111-4111-8111-111111111111";
const K_M = "bbbbbbbb-0000-4000-8000-00000000000b";
const TEL = "5512988887777";

const resp = (d, status = 200, cab = {}) => new Response(typeof d === "string" ? d : JSON.stringify(d), { status, headers: { "content-type": "application/json", ...cab } });
const ler = async r => ({ status: r.status, corpo: await r.json() });
const ausente = nome => resp({ code: "PGRST202", message: `Could not find the function public.${nome} in the schema cache` }, 404);

/* ------------------------------------------------------------ dublê do PostgREST por RPC + Graph/Storage */
function dbFalso({ rpcs = {}, fora = null } = {}) {
  const chamadas = [];
  const fetch = async (entrada, init = {}) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    if (u.origin !== SUPA || u.pathname.startsWith("/storage/v1/")) {
      if (!fora) throw new TypeError(`host inesperado: ${u.host}`);
      return fora(req, u, chamadas);
    }
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const nome = u.pathname.split("/").at(-1);
      const corpo = JSON.parse(await req.text() || "{}");
      chamadas.push({ nome, corpo });
      const fn = rpcs[nome];
      if (!fn) return ausente(nome);
      try { return resp(await fn(corpo, chamadas) ?? null); }
      catch (e) { return resp({ code: e.code || "P0001", message: e.message }, e.status || 400); }
    }
    if (req.method === "GET") return resp([]);
    return new Response(null, { status: req.method === "POST" ? 201 : 204 });
  };
  return { fetch, chamadas, de: nome => chamadas.filter(c => c.nome === nome) };
}
const foraFalso = () => async (req, u, chamadas) => {
  if (u.host === "graph.facebook.com") {
    const x = { nome: `GRAPH ${req.method} ${u.pathname}`, corpo: req.method === "POST" ? JSON.parse(await req.text() || "{}") : null };
    chamadas.push(x);
    if (req.method === "POST" && u.pathname.endsWith("/messages")) return resp({ messaging_product: "whatsapp", messages: [{ id: `wamid.${chamadas.length}` }] });
    return resp({ id: "x" });
  }
  if (u.pathname.startsWith("/storage/v1/")) {
    chamadas.push({ nome: `STORAGE ${req.method}`, url: req.url });
    if (/\/object\/sign\/nx-midia$/.test(u.pathname)) { const { paths } = JSON.parse(await req.text()); return resp(paths.map(p => ({ path: p, signedURL: `/object/sign/nx-midia/${p}?token=t` }))); }
    return resp({ message: "rota falsa" }, 404);
  }
  throw new TypeError(`host inesperado: ${u.host}`);
};

/* ================================================================== CB-002 / CB-270 assinatura */
test("CB-002 primeiroNomeSemTratamento: pula Dr/Dra/Sr/Sra/Srta/Prof/Profa/Pe (com ou sem ponto, qualquer caixa); uma palavra só fica", () => {
  assert.equal(primeiroNomeSemTratamento("Dra. Helena Souza"), "Helena");
  assert.equal(primeiroNomeSemTratamento("dr joão"), "joão");
  assert.equal(primeiroNomeSemTratamento("Prof. Dr. Carlos Lima"), "Carlos");
  assert.equal(primeiroNomeSemTratamento("SRA. Ana"), "Ana");
  assert.equal(primeiroNomeSemTratamento("Pe. Marcelo"), "Marcelo");
  assert.equal(primeiroNomeSemTratamento("Ana Lima"), "Ana");
  assert.equal(primeiroNomeSemTratamento("Dra."), "Dra.", "só o título: fica como está (a mesma regra da tela)");
  assert.equal(primeiroNomeSemTratamento("Drauzio Varella"), "Drauzio", "«Dra» só como palavra inteira");
  assert.equal(primeiroNomeSemTratamento(""), ""); assert.equal(primeiroNomeSemTratamento(null), "");
});

function cenarioEnviar(cx = {}) {
  let seq = 100;
  const CX = {
    conversa: { id: 601, status: "aberta", canal_id: K_M, contato_id: 501 }, contato: { id: 501, wa_id: TEL, telefone: TEL, nome: "Paula", optin_marketing: null, bloqueado: false },
    canal_id: K_M, canal: { id: K_M, provedor: "meta" }, janela_aberta: true, ultimo_wamid_in: "wamid.in1", cfg_cv: { recibo_leitura: true, assinatura: true },
    atendente_nome: "Ana Lima", empresa: "Clínica Alfa", ...cx,
  };
  return dbFalso({
    rpcs: {
      nx_fn_ctx: () => ({ conta_id: "c-adm", papel: "admin" }), nx_exigir_modulo: () => null,
      nx_cv_contexto_envio: () => CX, nx_canal_credencial: () => ({ canal_id: K_M, cliente_id: CLI_A, provedor: "meta", token: "EAAtoken", phone_number_id: "111", waba_id: "W1", app_secret: null }),
      nx_cv_ref_reservar: () => ({ estado: "novo" }), nx_cv_ref_marcar: () => true, nx_cv_ref_liberar: () => true,
      nx_cv_saida: ({ p_msg }) => ({ id: ++seq, conversa_id: 601, direcao: "out", ...p_msg }),
      nx_cv_ia_pausa_auto: () => null,
    },
    fora: foraFalso(),
  });
}
const painelEnviar = (s, corpo) => enviar(new Request(`${FN}/nx-enviar`, {
  method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" }, body: JSON.stringify({ token: "tok-adm", cliente: CLI_A, ...corpo }),
}), ENV, { fetch: s.fetch, prazoRede: 50 });

test("CB-270 nx-enviar com assinatura ligada: atendente «Dra. Helena Souza» assina «*Helena:*» (antes «*Dra.:*»); o teto desconta o nome certo", async () => {
  const s = cenarioEnviar({ atendente_nome: "Dra. Helena Souza" });
  const r = await ler(await painelEnviar(s, { acao: "texto", conversa: 601, texto: "Sua consulta está confirmada." }));
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo));
  const g = s.chamadas.find(c => c.nome === "GRAPH POST /v23.0/111/messages" || /\/111\/messages$/.test(c.nome));
  assert.ok(g, "mandou para a Graph");
  assert.equal(g.corpo.text.body, "*Helena:*\nSua consulta está confirmada.");
  // o teto devolvido quando estoura é o da assinatura «*Helena:*\n» (10), não «*Dra.:*\n» (8)
  const longo = await ler(await painelEnviar(s, { acao: "texto", conversa: 601, texto: "x".repeat(4090) }));
  assert.equal(longo.corpo.erro, "texto_longo"); assert.equal(longo.corpo.teto, 4096 - "*Helena:*\n".length);
});

test("CB-002 nx-ia: o nome de quem atende no prompt também sem o pronome de tratamento", () => {
  const p = montarPrompt("sugerir", { atendente_nome: "Dr. Paulo Mendes", empresa: "Clínica", mensagens: [], ia: {} }, "<<<X>>>");
  const txt = JSON.stringify(p);
  assert.match(txt, /Paulo/);
  assert.doesNotMatch(txt, /Dr\.\s*(?!Paulo)/, "nenhum «Dr.» sozinho como nome");
});

/* ================================================================== CB-035 nx-midia download */
function cenarioMidia() {
  return dbFalso({ rpcs: { nx_fn_ctx: () => ({ conta_id: "c-adm", org_id: "o1", papel: "admin" }), nx_exigir_modulo: () => null, nx_auditar: () => null }, fora: foraFalso() });
}
const pedirMidia = (s, corpo) => midia(new Request(`${FN}/nx-midia`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, ...corpo }) }), ENV, { fetch: s.fetch }).then(ler);

test("CB-035 nx-midia «ver» com {download:true, nome}: a URL assinada leva download=<nome> (o Storage manda como anexo); sem download, como antes", async () => {
  const p = `${CLI_A}/in/2026-10/x.bin`;
  const s = cenarioMidia();
  const a = await pedirMidia(s, { acao: "ver", paths: [p] });
  assert.equal(a.corpo.ok, true);
  assert.doesNotMatch(a.corpo.urls[p], /download=/, "sem download: inline como antes");
  const b = await pedirMidia(s, { acao: "ver", paths: [p], download: true, nome: "laudo março.pdf" });
  assert.match(b.corpo.urls[p], /\?token=t&download=laudo%20mar%C3%A7o\.pdf$/);
  const c = await pedirMidia(s, { acao: "ver", paths: [p], download: true });
  assert.match(c.corpo.urls[p], /&download=$/, "sem nome: o nome do arquivo no Storage");
  const ruim = await pedirMidia(s, { acao: "ver", paths: [p], download: true, nome: "a\nb" });
  assert.equal(ruim.status, 400); assert.equal(ruim.corpo.erro, "dados_invalidos");
});

/* ================================================================== comum/db: B-003, B-005, B-011, B-012 */
test("B-003 carregarModelo lê as métricas com teto próprio (200 mil linhas), não o padrão de 50 mil", async () => {
  const opcoes = {};
  const db = { select: async (tabela, _p, o) => { opcoes[tabela] = o; return []; } };
  await carregarModelo(db, { id: CLI_A, slug: "a", nome: "Clínica", cfg: {} }, "2026-10-13", 130);
  assert.equal(TETO_METRICAS, 200_000);
  assert.deepEqual(opcoes.nx_metricas_dia, { teto: 200_000 });
});

test("B-005 select: 200 que não é JSON (HTML de um proxy) vira erro resposta_ilegivel — não «linhas» letra por letra", async () => {
  const db = criarDb(ENV, async () => new Response("<html>gateway</html>", { status: 200 }));
  await assert.rejects(db.select("nx_alertas", { order: "id.asc" }), e => e.codigo === "resposta_ilegivel" && /resposta ilegível em nx_alertas/.test(e.message));
  await assert.rejects(db.select("nx_alertas", { limit: 5 }), e => e.codigo === "resposta_ilegivel");
  const ok = criarDb(ENV, async () => resp([{ id: 1 }]));
  assert.deepEqual(await ok.select("nx_alertas", { limit: 5 }), [{ id: 1 }]);
});

test("B-011 erroDeEnvio com falhas diferentes em vários destinos: só os 4 últimos dígitos (o número inteiro não vai para nx_alertas/nx_execucoes)", () => {
  const e = erroDeEnvio(["5512911112222", "5512933334444"], [{ destino: "5512911112222", ok: false, erro: "131026" }, { destino: "5512933334444", ok: false, erro: "131047" }]);
  assert.doesNotMatch(e, /5512911112222|5512933334444/);
  assert.match(e, /\*+2222: 131026; \*+4444: 131047/);
});

test("B-012 anonimizarEnvio: ids (wamids de cada parte) vira só a contagem no resumo", () => {
  const [x] = anonimizarEnvio([{ destino: "5512911112222", ok: true, id: "wamid.HBgMNTUxMjk5OTk5OTk5FQIAERgSQUE", ids: ["wamid.A1", "wamid.A2"] }]);
  assert.equal(x.ids, 2);
  assert.doesNotMatch(JSON.stringify(x), /wamid\.A1|5512911112222/);
});

/* ================================================================== B-042 Meta paging.next */
test("B-042 Meta: paging.next para fora da graph.facebook.com não é seguido (o token não sai) e a leitura fica parcial", async () => {
  assert.equal(proximaPagina("https://evil.example/v23.0/act_1/insights?after=x"), false);
  assert.equal(proximaPagina("nada"), false);
  assert.equal(proximaPagina("https://graph.facebook.com/v23.0/act_1/insights?after=x&access_token=VAZOU"), "https://graph.facebook.com/v23.0/act_1/insights?after=x");
  const hosts = [];
  const linhas = await buscarMeta({ meta_access_token: "EAAt", meta_ad_account_id: "act_1" }, "campanha", "2026-10-01", "2026-10-01", {
    fetch: async url => {
      const u = new URL(url); hosts.push(u.host);
      if (u.host !== "graph.facebook.com") throw new Error("seguiu para fora");
      return resp({ data: [{ campaign_id: "C1", date_start: "2026-10-01", impressions: "1", spend: "1" }], paging: { next: "https://evil.example/next?after=x" } });
    }, esperar: async () => {} });
  assert.deepEqual(hosts, ["graph.facebook.com"]);
  assert.equal(linhas.length, 1);
});

/* ================================================================== radar: B-001, B-002, B-010 */
const COLS = {
  nx_config: "id cron_token codigo_gestor funcoes_url painel_url wa_access_token wa_phone_number_id wa_template wa_verify_token meta_app_secret anthropic_api_key modelo_ia google_api_versao meta_api_versao",
  nx_clientes: "id slug nome ativo status teste_ate cfg vertical wa_phone_number_id criado_em",
  nx_integracoes: "id cliente_id canal ativo cred ultimo_sync status",
  nx_metricas_dia: "cliente_id plataforma nivel data campanha_ext anuncio_ext campanha_nome anuncio_nome impressoes alcance frequencia cliques gasto conversoes valor_conversao atualizado_em",
  nx_leads: "id cliente_id telefone nome origem plataforma campanha_ext anuncio_ext ctwa_clid servico etapa data_conversa data_agenda data_consulta valor obs criado_em atualizado_em funil_id",
  nx_funis: "id cliente_id nome ordem padrao conta_no_ads ativo criado_em",
  // com a coluna da 20261015a (enviando_em)
  nx_alertas: "id cliente_id chave regra severidade mensagem acao valor referencia criado_em enviado_em erro_envio wa_ids wa_ids_template entregue_em tentativas_envio enviando_em",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro wa_ids wa_ids_template entregue_em enviando_em",
  nx_execucoes: "id tarefa inicio fim ok resumo",
  nx_travas: "nome ate dono",
};
const esquema = () => {
  const colunas = {};
  for (const [k, v] of Object.entries(COLS)) colunas[k] = new Set(v.split(" "));
  return { colunas, unicas: { nx_metricas_dia: ["cliente_id", "plataforma", "nivel", "data", "campanha_ext", "anuncio_ext"], nx_relatorios: ["cliente_id", "tipo", "referencia"], nx_travas: ["nome"] },
    padroes: { nx_alertas: { wa_ids: [], wa_ids_template: [], tentativas_envio: 0, enviando_em: null }, nx_relatorios: { wa_ids: [], wa_ids_template: [] } },
    checks: { nx_alertas: { severidade: ["critico", "alerta", "info"] } }, naoNulos: { nx_travas: ["nome", "ate"] } };
};
const diasEntre = (de, ate) => { const out = []; for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
function cenarioCiclo({ agora = "2026-10-13T11:07:00Z", meta, waFalha, tabelas = {} } = {}) {
  const estado = { agora: new Date(agora), wa: [] };
  const banco = criarBancoFalso({
    nx_config: [{ id: 1, cron_token: "cron-secreto", codigo_gestor: "x", funcoes_url: FN, painel_url: null, wa_access_token: "wa-token", wa_phone_number_id: "900900", wa_template: null,
      wa_verify_token: "v", meta_app_secret: "s", anthropic_api_key: null, modelo_ia: null, google_api_versao: null, meta_api_versao: null }],
    nx_clientes: [{ id: CLI_A, slug: "clinica-a", nome: "Clínica Alfa", ativo: true, status: "ativo", teste_ate: null, cfg: { waGestor: ["5512911112222"] }, wa_phone_number_id: "111" }],
    nx_integracoes: [{ id: 1, cliente_id: CLI_A, canal: "meta", ativo: true, cred: { meta_access_token: "EAAtokenA", meta_ad_account_id: "act_999" }, ultimo_sync: null, status: null }],
    nx_metricas_dia: [], nx_leads: [], nx_funis: [], nx_alertas: [], nx_relatorios: [], nx_execucoes: [], nx_travas: [], ...tabelas,
  }, () => estado.agora, { esquema: esquema(), chave: ENV.chave, rpcs: api => ({
    nx_trava_pegar: { args: ["p_nome", "p_segundos", "p_dono"], fn({ p_nome, p_segundos, p_dono }) {
      const agoraMs = api.agoraMs(); const ex = api.tab("nx_travas").find(r => r.nome === p_nome);
      const ate = new Date(agoraMs + p_segundos * 1000).toISOString();
      if (!ex) { api.tab("nx_travas").push({ nome: p_nome, ate, dono: p_dono }); return true; }
      if (Date.parse(ex.ate) < agoraMs) { Object.assign(ex, { ate, dono: p_dono }); return true; }
      return false;
    } },
    nx_trava_soltar: { args: ["p_nome", "p_dono"], fn({ p_nome, p_dono }) { api.t.nx_travas = api.tab("nx_travas").filter(r => !(r.nome === p_nome && r.dono === p_dono)); return true; } },
  }) });
  let responder = req => banco.responder(req);
  const fetch = async (entrada, init) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    if (u.origin === SUPA) return responder(req);
    if (u.host === "graph.facebook.com" && u.pathname.endsWith("/messages")) {
      const corpo = JSON.parse(await req.text()); estado.wa.push(corpo);
      if (waFalha?.()) return resp({ error: { message: "falhou", code: 131000 } }, 500);
      return resp({ messages: [{ id: `wamid.${estado.wa.length}` }] });
    }
    if (u.host === "graph.facebook.com") {
      if (meta) { const r = await meta(u); if (r) return r; }
      if (!/insights$/.test(u.pathname)) return resp({ name: "Conta", timezone_name: "America/Sao_Paulo", currency: "BRL" });
      const { since, until } = JSON.parse(u.searchParams.get("time_range"));
      return resp({ data: diasEntre(since, until).map(d => ({ campaign_id: "C1", campaign_name: "Campanha", impressions: "100", reach: "70", frequency: "1.4", clicks: "2", spend: "10", date_start: d, date_stop: d })) });
    }
    throw new TypeError(`host inesperado ${u.host}`);
  };
  const deps = () => ({ fetch, agora: () => estado.agora, esperarRede: async () => {} });
  const cron = (fn, corpo = {}) => fn(new Request(`${FN}/x`, { method: "POST", headers: { "content-type": "application/json", "x-nx-cron": "cron-secreto" }, body: JSON.stringify(corpo) }), ENV, deps()).then(ler);
  return { banco, estado, cron, tab: banco.tab, trocarResponder: f => { const antes = responder; responder = req => f(req, antes); } };
}
const tokenRuim = () => resp({ error: { message: "Error validating access token", code: 190 } }, 400);

test("B-001 alerta que não sai: o envio original conta como tentativa — no máximo 3 mensagens ao gestor (antes 4)", async () => {
  const s = cenarioCiclo({ meta: tokenRuim, waFalha: () => true });
  for (const h of ["11:07", "12:07", "13:07", "14:07", "15:07"]) { s.estado.agora = new Date(`2026-10-13T${h}:00Z`); await s.cron(ciclo, {}); }
  const [al] = s.tab("nx_alertas");
  assert.equal(al.tentativas_envio, 3);
  assert.equal(s.estado.wa.length, 3, "1 envio original + 2 reenvios");
  assert.equal(al.enviado_em, null);
  assert.equal(al.enviando_em, null, "não saiu: a reserva foi desfeita a cada rodada");
});

test("B-002 alerta reservado (enviando_em) e sem registro do envio não é reenviado; sem reserva, é", async () => {
  // a integração segue parada (a mesma chave: a dedupe de 24 h não cria outro) — só o reenvio decide se sai mensagem
  const base = { id: 7, cliente_id: CLI_A, chave: "integracao|meta|parou", regra: "integracao", severidade: "critico", mensagem: "parou", acao: "x", valor: null,
    referencia: "2026-10-12", criado_em: "2026-10-13T10:07:00Z", enviado_em: null, erro_envio: null, wa_ids: [], wa_ids_template: [], entregue_em: null, tentativas_envio: 1 };
  const preso = cenarioCiclo({ meta: tokenRuim, tabelas: { nx_alertas: [{ ...base, enviando_em: "2026-10-13T10:07:00Z" }] } });
  const r = await preso.cron(ciclo, {});
  assert.ok(!r.corpo.clientes[0].alertas_reenviados, "reservado: pode ter saído — não repete");
  assert.equal(preso.estado.wa.length, 0);
  const livre = cenarioCiclo({ meta: tokenRuim, tabelas: { nx_alertas: [{ ...base, enviando_em: null }] } });
  const r2 = await livre.cron(ciclo, {});
  assert.equal(r2.corpo.clientes[0].alertas_reenviados, 1);
  assert.equal(livre.estado.wa.length, 1);
  assert.ok(livre.tab("nx_alertas")[0].enviado_em); assert.equal(livre.tab("nx_alertas")[0].tentativas_envio, 2);
});

test("B-010 gravação do resultado falha depois do envio: o radar não cai (cliente ok, erro_registro) e a rodada seguinte NÃO reenvia", async () => {
  const s = cenarioCiclo({ meta: tokenRuim });
  let falhar = true;
  s.trocarResponder(async (req, antes) => {
    if (falhar && req.method === "PATCH" && new URL(req.url).pathname.endsWith("/nx_alertas")) {
      const corpo = await req.clone().text();
      if (corpo.includes("enviado_em")) return resp({ message: "conexão perdida" }, 503);
    }
    return antes(req);
  });
  const r = await s.cron(ciclo, {});
  assert.equal(s.estado.wa.length, 1, "o gestor recebeu");
  // o cliente fica ok:false pela integração (token ruim), não pelo radar: sem erro_radar (antes o radar lançava)
  assert.ok(!r.corpo.clientes[0].erro_radar, JSON.stringify(r.corpo.clientes[0]));
  assert.match(r.corpo.clientes[0].erro_registro, /sem confirmação/);
  const [al] = s.tab("nx_alertas");
  assert.ok(al.enviando_em, "a reserva ficou"); assert.equal(al.enviado_em, null);
  falhar = false;
  s.estado.agora = new Date("2026-10-13T12:07:00Z");
  const r2 = await s.cron(ciclo, {});
  assert.ok(!r2.corpo.clientes[0].alertas_reenviados);
  assert.equal(s.estado.wa.length, 1, "não repetiu");
});

/* ================================================================== B-037 relatório */
test("B-037 reserva do relatório falha por 503 (não é coluna ausente): NÃO manda sem reserva — o cliente sai com erro e a 2ª chance tenta", async () => {
  const s = cenarioCiclo({ agora: "2026-10-13T11:00:00Z",
    tabelas: { nx_metricas_dia: diasEntre("2026-10-01", "2026-10-12").map(d => ({ cliente_id: CLI_A, plataforma: "meta", nivel: "campanha", data: d, campanha_ext: "C1", anuncio_ext: "", campanha_nome: "C", anuncio_nome: null,
      impressoes: 100, alcance: 70, frequencia: 1.4, cliques: 2, gasto: 10, conversoes: 1, valor_conversao: 0, atualizado_em: "2026-10-12T00:00:00Z" })) } });
  let falhas = 1;
  s.trocarResponder(async (req, antes) => {
    if (falhas > 0 && req.method === "POST" && new URL(req.url).pathname.endsWith("/nx_relatorios")) {
      const corpo = await req.clone().text();
      if (corpo.includes("enviando_em") && !corpo.includes("enviado_em")) { falhas--; return resp({ message: "serviço indisponível" }, 503); }
    }
    return antes(req);
  });
  const a = await s.cron(relatorio, { tipo: "diario" });
  assert.equal(s.estado.wa.length, 0, "sem reserva não manda");
  assert.equal(a.corpo.ok, false);
  await s.cron(relatorio, { tipo: "diario" });
  assert.equal(s.estado.wa.length, 1, "a nova tentativa reserva e manda");
});
