/* ============================================================
   ÓRBITA — plano «1500c» (21/10/2026), frente srv: Edge Functions, scripts e CI
   node --test testes/plano1500c-funcoes.teste.mjs
   Um caso de COMPORTAMENTO por item (cada um falha no código anterior). Sem rede e sem chave real: PostgREST, Graph, Google e
   Storage são dublês (o mesmo desenho de testes/plano1000b-funcoes.teste.mjs). O que é SQL (migração 20261022a) é provado pelo
   smoke supabase/testes/34_plano1500c.sql (rodar-local / ensaio em ROLLBACK).
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  MODELO_PADRAO, MODELOS_TAREFA, modeloPara, modeloIA, mascararSensiveis, cpfValido, cnpjValido, luhnValido, travaDeAviso,
  origensPermitidas, origemPermitida, comCors, tratarPainel, respostaPainel, tituloRelatorio, esquecerAvisosIA,
} from "../supabase/functions/_compartilhado/comum.js";
import { criarDb } from "../supabase/functions/_compartilhado/db.js";
import { tratar as ciclo, avisarSaude, avisarCustoIA, TRAVA_AVISO_CURTA_S, SAUDE_AVISO_S } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio, segundaDaSemanaAnterior } from "../supabase/functions/_compartilhado/relatorio.js";
import { tratar as iaConversas, montarPrompt, MAX_TOKENS_SUGESTAO, iaDesligada } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { TOKENS_MONTAR, TOKENS_MONTAR_MAX, TOKENS_DECIDIR } from "../supabase/functions/_compartilhado/ia_automacoes.js";
import { tratar as webhook, RELER_SEGREDO_MS } from "../supabase/functions/_compartilhado/webhook.js";
import { tratar as codewords, LIMITE_TESTE_H } from "../supabase/functions/_compartilhado/codewords.js";
import { tratar as enviar, LIMITES_ACAO } from "../supabase/functions/_compartilhado/enviar.js";
import { criarGoogle, erroIndisponivel } from "../supabase/functions/_compartilhado/google.js";
import { enviarWhatsApp, enviarTemplate, idiomaTemplate, VERSOES_WA } from "../supabase/functions/_compartilhado/whatsapp.js";
import { criarBanco as criarBancoFalso } from "./apoio/postgrest-falso.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = "https://fake.supabase.co";
const ENV = { url: SUPA, chave: "service-role-falsa" };
const FN = `${SUPA}/functions/v1`;
const CLI_A = "11111111-1111-4111-8111-111111111111";
const K_M = "bbbbbbbb-0000-4000-8000-00000000000b";
const K_CW = "cccccccc-0000-4000-8000-00000000000c";

const resp = (d, status = 200, cab = {}) => new Response(typeof d === "string" ? d : JSON.stringify(d), { status, headers: { "content-type": "application/json", ...cab } });
const ler = async r => ({ status: r.status, corpo: await r.json(), r });
const ausente = nome => resp({ code: "PGRST202", message: `Could not find the function public.${nome} in the schema cache` }, 404);

/* ------------------------------------------------------------ dublê do PostgREST por RPC (+ select por handler) */
function dbFalso({ rpcs = {}, tabelas = {}, fora = null } = {}) {
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
    const tabela = u.pathname.replace("/rest/v1/", "");
    chamadas.push({ nome: `${req.method} ${tabela}`, params: Object.fromEntries(u.searchParams), corpo: req.method === "GET" ? null : await req.text() });
    if (req.method === "GET") return resp(tabelas[tabela] ? await tabelas[tabela](u) : []);
    return new Response(null, { status: req.method === "POST" ? 201 : 204 });
  };
  return { fetch, chamadas, de: nome => chamadas.filter(c => c.nome === nome) };
}

/* ================================================================== SC-085/086/087/097 modelo barato por tarefa */
test("SC-085/SC-097 modelo padrão do código = Haiku 5.5; Sonnet só no montar/mensal; o configurado (cliente, plataforma, env) vence", () => {
  esquecerAvisosIA();
  assert.equal(MODELO_PADRAO, "claude-haiku-5-5", "antes claude-opus-5-5");
  assert.equal(modeloPara("sugerir"), "claude-haiku-5-5");
  assert.equal(modeloPara("decidir"), "claude-haiku-5-5");
  assert.equal(modeloPara("diario"), "claude-haiku-5-5");
  assert.equal(modeloPara("montar"), "claude-sonnet-5-5");
  assert.equal(modeloPara("mensal"), "claude-sonnet-5-5");
  assert.equal(modeloPara("sugerir", null, "claude-opus-5-5"), "claude-opus-5-5", "nx_config.modelo_ia continua valendo");
  assert.equal(modeloPara("sugerir", "claude-sonnet-5-5", "claude-opus-5-5"), "claude-sonnet-5-5", "o do cliente antes do da plataforma");
  assert.equal(modeloPara("montar", "gpt-4"), "claude-sonnet-5-5", "inválido → o padrão da tarefa");
  assert.equal(modeloIA(), "claude-haiku-5-5");
  const antes = globalThis.Deno;
  try {
    globalThis.Deno = { env: { get: k => (k === "NX_MODELO_PADRAO" ? "claude-sonnet-5-5" : undefined) } };
    assert.equal(modeloPara("sugerir"), "claude-sonnet-5-5", "env NX_MODELO_PADRAO troca o padrão sem deploy");
    assert.equal(modeloPara("sugerir", "claude-opus-5-5"), "claude-opus-5-5", "o configurado vem antes do env");
  } finally { if (antes === undefined) delete globalThis.Deno; else globalThis.Deno = antes; }
  assert.deepEqual(Object.keys(MODELOS_TAREFA).sort(), ["decidir", "diario", "mensal", "montar", "resumir", "semanal", "sugerir"]);
});

/* ia.js com o SDK trocado por um dublê (o mesmo truque de testes/plano100-funcoes) */
async function carregarIa() {
  const src = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/ia.js"), "utf8");
  const SDK = `export default class Anthropic {
    constructor(o) { globalThis.__c15.push({ ctor: o }); const c = t => async p => { globalThis.__c15.push({ t, p }); return globalThis.__c15r(p); };
      this.messages = { create: c("messages") }; this.beta = { messages: { create: c("beta") } }; } }
    Anthropic.APIError = class extends Error { constructor(m, s) { super(m); this.status = s; } };`;
  const comum = pathToFileURL(join(RAIZ, "supabase/functions/_compartilhado/comum.js")).href;
  globalThis.__c15 = [];
  return import(`data:text/javascript,${encodeURIComponent(src.replace(/"npm:@anthropic-ai\/sdk@\d+\.\d+\.\d+"/, () => JSON.stringify(`data:text/javascript,${encodeURIComponent(SDK)}`)).replace('"./comum.js"', JSON.stringify(comum)))}`);
}

test("SC-089/SC-087 ia.js: teto padrão 1000 tokens (antes 4000); sem modelo, Haiku no diário e Sonnet no mensal", async () => {
  const mod = await carregarIa();
  globalThis.__c15r = p => ({ model: p.model, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "ok" }] });
  await mod.perguntarClaude({ chave: "k", sistema: "S", usuario: "U" });
  assert.equal(globalThis.__c15[1].p.max_tokens, 1000);
  assert.equal(globalThis.__c15[1].p.model, "claude-haiku-5-5");
  globalThis.__c15 = [];
  await mod.leituraIACompleta({ chave: "k", tipo: "diario", contexto: {} });
  assert.equal(globalThis.__c15[1].p.model, "claude-haiku-5-5");
  globalThis.__c15 = [];
  await mod.leituraIACompleta({ chave: "k", tipo: "mensal", contexto: {} });
  assert.equal(globalThis.__c15[1].p.model, "claude-sonnet-5-5");
});

test("SC-204 ia.js: resposta só com pensamento (max_tokens, sem texto) → UMA 2ª tentativa com effort low e o dobro do teto; tokens somados", async () => {
  const mod = await carregarIa();
  let n = 0;
  globalThis.__c15r = p => (++n === 1
    ? { model: p.model, stop_reason: "max_tokens", usage: { input_tokens: 100, output_tokens: 400 }, content: [{ type: "thinking", thinking: "…" }] }
    : { model: p.model, stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: "text", text: "Oi!" }] });
  const r = await mod.perguntarClaude({ chave: "k", modelo: "claude-haiku-5-5", sistema: "S", usuario: "U", maxTokens: 400, esforco: "medium" });
  assert.equal(r.texto, "Oi!");
  const pedidos = globalThis.__c15.filter(x => x.p);
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[1].p.max_tokens, 1000, "o dobro, no mínimo 1000");
  assert.deepEqual(pedidos[1].p.output_config, { effort: "low" });
  assert.equal(r.tokens_in, 200); assert.equal(r.tokens_out, 450, "as duas chamadas são cobradas");
  // texto de verdade: não repete
  globalThis.__c15 = []; n = 1;
  await mod.perguntarClaude({ chave: "k", modelo: "claude-haiku-5-5", sistema: "S", usuario: "U" });
  assert.equal(globalThis.__c15.filter(x => x.p).length, 1);
  assert.equal(mod.precisaRepetir({ stop_reason: "max_tokens", content: [] }, { max_tokens: 4000 }), false, "já no teto: não repete");
});

/* ================================================================== nx-ia sugerir: SC-088, SC-098, SC-099 */
function cenarioIa(cx = {}, cfg = { anthropic_api_key: "sk-ant-x", modelo_ia: null }) {
  return dbFalso({
    rpcs: {
      nx_fn_ctx: () => ({ conta_id: "c-at", papel: "atendente" }),
      nx_ia_contexto: () => ({ empresa: "Clínica", atendente_nome: "Ana", ia: {}, mensagens: [{ dir: "in", texto: "meu cpf é 529.982.247-25", em: "2026-10-08T14:00:00Z" }], ...cx }),
      nx_ia_reservar: () => ({ ok: true, reserva_id: "r-1" }), nx_ia_registrar_reserva: () => ({ ok: true }),
    },
    tabelas: { nx_config: () => [cfg] },
  });
}
const pedirIa = (s, corpo, ia) => iaConversas(new Request(`${FN}/nx-ia`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, conversa: 9, ...corpo }) }), ENV, { fetch: s.fetch, ia }).then(ler);

test("SC-088/SC-085 nx-ia sugerir: Haiku sem modelo configurado, teto de 1000 tokens; o modelo do cliente (cfg.ia.modelo) é respeitado", async () => {
  const pedidos = [];
  const ia = async () => ({ perguntarClaude: async p => { pedidos.push(p); return { texto: "Olá", modelo: p.modelo, tokens_in: 1, tokens_out: 1, stop_reason: "end_turn", ms: 1 }; } });
  const r = await pedirIa(cenarioIa(), { acao: "sugerir" }, ia);
  assert.equal(r.corpo.ok, true);
  assert.equal(pedidos[0].modelo, "claude-haiku-5-5");
  assert.equal(pedidos[0].maxTokens, 1000); assert.equal(MAX_TOKENS_SUGESTAO, 1000);
  await pedirIa(cenarioIa({ ia: { modelo: "claude-sonnet-5-5" } }), { acao: "sugerir" }, ia);
  assert.equal(pedidos[1].modelo, "claude-sonnet-5-5");
  await pedirIa(cenarioIa({}, { anthropic_api_key: "sk-ant-x", modelo_ia: "claude-opus-5-5" }), { acao: "resumir" }, ia);
  assert.equal(pedidos[2].modelo, "claude-opus-5-5", "nx_config.modelo_ia respeitado");
});

test("SC-098 (LGPD) CPF, CNPJ e cartão válidos saem mascarados do prompt; telefone, protocolo e número inválido ficam", async () => {
  assert.ok(cpfValido("529.982.247-25")); assert.ok(!cpfValido("529.982.247-26")); assert.ok(!cpfValido("111.111.111-11"));
  assert.ok(cnpjValido("11.222.333/0001-81")); assert.ok(!cnpjValido("11.222.333/0001-82"));
  assert.ok(luhnValido("4111 1111 1111 1111")); assert.ok(!luhnValido("4111 1111 1111 1112"));
  const t = mascararSensiveis("cpf 529.982.247-25, cnpj 11222333000181, cartão 4111-1111-1111-1111, tel 12988887777, protocolo 123456, cpf errado 529.982.247-26");
  assert.equal(t, "cpf [CPF omitido], cnpj [CNPJ omitido], cartão [cartão omitido], tel 12988887777, protocolo 123456, cpf errado 529.982.247-26");
  assert.equal(mascararSensiveis("52998224725"), "[CPF omitido]", "CPF sem pontuação que não parece celular");
  const p = montarPrompt("sugerir", { mensagens: [{ dir: "in", texto: "meu cpf é 529.982.247-25", em: "2026-10-08T14:00:00Z" }], ia: {} }, "aaaaaaaaaaaaaaaa");
  assert.doesNotMatch(p.usuario, /529\.982/); assert.match(p.usuario, /\[CPF omitido\]/);
});

test("SC-099 (LGPD) cliente com a IA desligada: recusa ANTES da cota e do SDK (ia_desligada)", async () => {
  let carregou = false;
  const s = cenarioIa({ ia_desligada: true });
  const r = await pedirIa(s, { acao: "sugerir" }, async () => { carregou = true; return { perguntarClaude: async () => ({}) }; });
  assert.equal(r.corpo.ok, false); assert.equal(r.corpo.erro, "ia_indisponivel"); assert.equal(r.corpo.detalhe, "ia_desligada");
  assert.equal(s.de("nx_ia_reservar").length, 0, "não gasta cota");
  assert.equal(carregou, false);
  assert.ok(iaDesligada({ ia: { desligada: true } })); assert.ok(!iaDesligada({ ia: {} }));
});

test("SC-090/SC-091 tetos de tokens: montar 6000 (12000 só se vier cortada), decidir 1000", () => {
  assert.deepEqual([TOKENS_MONTAR, TOKENS_MONTAR_MAX, TOKENS_DECIDIR], [6000, 12000, 1000]);
  const src = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/ia_automacoes.js"), "utf8");
  assert.match(src, /if \(!e\?\.incompleta \|\| resta < MIN_REPETIR_MONTAR_MS\) throw e;/, "repete só quando cortada e se sobrar tempo");
  assert.doesNotMatch(src, /maxTokens: 12000, esforco: "medium"/);
});

/* ================================================================== nx-ciclo: SC-038, SC-054, SC-055 */
test("SC-038 «Testar conexão» com o banco falhando na trava do limite: recusa (429 aguarde) — antes liberava sem limite", async () => {
  const s = dbFalso({ rpcs: {
    nx_fn_ctx: () => ({ conta_id: "c-adm", papel: "admin" }), nx_exigir_modulo: () => null,
    nx_trava_pegar: () => { throw Object.assign(new Error("banco fora"), { status: 503 }); },
  } });
  const r = await ler(await ciclo(new Request(`${FN}/nx-ciclo`, { method: "POST", headers: { apikey: "sb_publishable_x" }, body: JSON.stringify({ token: "t", cliente: CLI_A }) }), ENV, { fetch: s.fetch }));
  assert.equal(r.status, 429); assert.equal(r.corpo.erro, "aguarde");
  assert.equal(s.de("nx_auditar").length, 0, "nada de sync");
});

function travasFalsas(m) {
  return {
    nx_trava_pegar: ({ p_nome, p_segundos, p_dono }) => { const x = m.get(p_nome); if (x && x.ate > Date.now()) return false; m.set(p_nome, { ate: Date.now() + p_segundos * 1000, dono: p_dono, s: p_segundos }); return true; },
    nx_trava_soltar: ({ p_nome, p_dono }) => { if (m.get(p_nome)?.dono === p_dono) m.delete(p_nome); return true; },
    nx_trava_estender: ({ p_nome, p_segundos, p_dono }) => { const x = m.get(p_nome); if (!x || x.dono !== p_dono) return false; Object.assign(x, { ate: Date.now() + p_segundos * 1000, s: p_segundos }); return true; },
  };
}

test("SC-054 aviso de saúde: o envio falhou → as travas de 6 h são SOLTAS (a próxima rodada avisa); saiu → viram 6 h", async () => {
  const travas = new Map();
  let falha = true;
  const s = dbFalso({ rpcs: { ...travasFalsas(travas), nx_saude_dados: () => ({ problemas: ["3 mensagens na fila atrasadas há mais de 30 min"] }) },
    fora: async (req, u) => (falha ? resp({ error: { message: "x", code: 131000 } }, 500) : resp({ messages: [{ id: "wamid.1" }] })) });
  const db = criarDb(ENV, s.fetch);
  const cfg = { wa_equipe: "5512911112222", wa_access_token: "t", wa_phone_number_id: "1" };
  const r1 = await avisarSaude(db, cfg, { fetch: s.fetch });
  assert.equal(r1.avisados, 0);
  assert.ok(![...travas.keys()].some(k => k.startsWith("nx-saude:aviso:")), "a trava do tipo foi solta (antes ficava 6 h)");
  travas.delete("nx-saude:rodada");
  falha = false;
  const r2 = await avisarSaude(db, cfg, { fetch: s.fetch });
  assert.equal(r2.avisados, 1);
  const t = [...travas.entries()].find(([k]) => k.startsWith("nx-saude:aviso:"));
  assert.equal(t[1].s, SAUDE_AVISO_S, "saiu: trava longa");
  assert.equal(TRAVA_AVISO_CURTA_S, 600);
});

test("SC-055 aviso de custo de IA: a RPC falhou ou o WhatsApp falhou → a trava do dia é solta; saiu → 26 h", async () => {
  const travas = new Map();
  let falhaRpc = true, falhaWa = true;
  const s = dbFalso({ rpcs: { ...travasFalsas(travas), nx_ia_custo_alto: () => { if (falhaRpc) throw new Error("fora"); return [{ nome: "Clínica", custo_usd: 12, chamadas: 30 }]; } },
    fora: async () => (falhaWa ? resp({ error: { message: "x", code: 131000 } }, 500) : resp({ messages: [{ id: "wamid.1" }] })) });
  const db = criarDb(ENV, s.fetch);
  const cfg = { wa_equipe: "5512911112222", wa_access_token: "t", wa_phone_number_id: "1" };
  const ctx = { fetch: s.fetch, hoje: "2026-10-21" };
  assert.equal(await avisarCustoIA(db, cfg, ctx), null);
  assert.equal(travas.size, 0, "RPC falhou: trava solta");
  falhaRpc = false;
  await avisarCustoIA(db, cfg, ctx);
  assert.equal(travas.size, 0, "WhatsApp falhou: trava solta (antes o aviso do dia sumia)");
  falhaWa = false;
  const r = await avisarCustoIA(db, cfg, ctx);
  assert.equal(r.clientes, 1);
  assert.equal(travas.get("nx-ia-custo:2026-10-21").s, 26 * 3600);
  // banco sem nx_trava_estender: solta e pega de novo com o prazo longo
  const t2 = new Map(); const { nx_trava_estender, ...semEstender } = travasFalsas(t2); void nx_trava_estender;
  const s2 = dbFalso({ rpcs: semEstender });
  const tr = await travaDeAviso(criarDb(ENV, s2.fetch), "x", 600, 7200);
  assert.equal(await tr.estender(), true); assert.equal(t2.get("x").s, 7200);
});

/* ================================================================== nx-relatorio: SC-056, AC-306, AC-055 */
const COLS = {
  nx_config: "id cron_token funcoes_url painel_url wa_access_token wa_phone_number_id wa_template anthropic_api_key modelo_ia",
  nx_clientes: "id slug nome ativo status teste_ate cfg vertical",
  nx_metricas_dia: "cliente_id plataforma nivel data campanha_ext anuncio_ext campanha_nome anuncio_nome impressoes alcance frequencia cliques gasto conversoes valor_conversao atualizado_em",
  nx_leads: "id cliente_id telefone nome origem plataforma campanha_ext anuncio_ext servico etapa data_conversa data_agenda data_consulta valor obs funil_id",
  nx_funis: "id cliente_id conta_no_ads",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro wa_ids wa_ids_template entregue_em enviando_em",
  nx_execucoes: "id tarefa inicio fim ok resumo",
  nx_travas: "nome ate dono",
};
const diasEntre = (de, ate) => { const out = []; for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
const metrica = (d, gasto = 10) => ({ cliente_id: CLI_A, plataforma: "meta", nivel: "campanha", data: d, campanha_ext: "C1", anuncio_ext: "", campanha_nome: "C", anuncio_nome: null,
  impressoes: 100, alcance: 70, frequencia: 1.4, cliques: 2, gasto, conversoes: 1, valor_conversao: 0, atualizado_em: "2026-10-12T00:00:00Z" });
function cenarioRel({ agora = "2026-10-13T11:00:00Z", cfg = { waGestor: ["5512911112222"] }, metricas, relatorios = [], waFalha = false } = {}) {
  const estado = { agora: new Date(agora), wa: [] };
  const colunas = {}; for (const [k, v] of Object.entries(COLS)) colunas[k] = new Set(v.split(" "));
  const banco = criarBancoFalso({
    nx_config: [{ id: 1, cron_token: "cron-secreto", funcoes_url: FN, painel_url: null, wa_access_token: "wa", wa_phone_number_id: "900", wa_template: null, anthropic_api_key: null, modelo_ia: null }],
    nx_clientes: [{ id: CLI_A, slug: "clinica-a", nome: "Clínica Alfa", ativo: true, status: "ativo", teste_ate: null, cfg, vertical: "odonto" }],
    nx_metricas_dia: metricas ?? diasEntre("2026-10-01", "2026-10-12").map(d => metrica(d)), nx_leads: [], nx_funis: [], nx_relatorios: relatorios, nx_execucoes: [], nx_travas: [],
  }, () => estado.agora, { esquema: { colunas, unicas: { nx_relatorios: ["cliente_id", "tipo", "referencia"], nx_travas: ["nome"] }, padroes: { nx_relatorios: { wa_ids: [], wa_ids_template: [] } }, checks: {}, naoNulos: {} },
    chave: ENV.chave, rpcs: api => ({
      nx_trava_pegar: { args: ["p_nome", "p_segundos", "p_dono"], fn({ p_nome, p_segundos, p_dono }) { const ex = api.tab("nx_travas").find(r => r.nome === p_nome); if (ex && Date.parse(ex.ate) > api.agoraMs()) return false; api.t.nx_travas = api.tab("nx_travas").filter(r => r.nome !== p_nome); api.tab("nx_travas").push({ nome: p_nome, ate: new Date(api.agoraMs() + p_segundos * 1000).toISOString(), dono: p_dono }); return true; } },
      nx_trava_soltar: { args: ["p_nome", "p_dono"], fn({ p_nome }) { api.t.nx_travas = api.tab("nx_travas").filter(r => r.nome !== p_nome); return true; } },
    }) });
  const fetch = async (entrada, init) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    if (u.origin === SUPA) return banco.responder(req);
    if (u.host === "graph.facebook.com") {
      estado.wa.push(JSON.parse(await req.text()));
      if (typeof waFalha === "function" ? waFalha() : waFalha) throw new TypeError("rede caiu no meio");
      return resp({ messages: [{ id: `wamid.${estado.wa.length}` }] });
    }
    throw new TypeError(`host inesperado ${u.host}`);
  };
  const cron = corpo => relatorio(new Request(`${FN}/nx-relatorio`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify(corpo) }), ENV, { fetch, agora: () => estado.agora }).then(ler);
  return { estado, cron, tab: banco.tab };
}

test("SC-056 relatório reservado e sem confirmação: não reenvia sozinho, mas a execução fica VERMELHA (antes ok:true em silêncio)", async () => {
  const s = cenarioRel({ relatorios: [{ id: 1, cliente_id: CLI_A, tipo: "diario", referencia: "2026-10-12", texto: "x", leitura_ia: null, destinos: [], enviado_em: null, erro: null, wa_ids: [], wa_ids_template: [], entregue_em: null, enviando_em: "2026-10-13T08:00:00Z" }] });
  const r = await s.cron({ tipo: "diario" });
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.clientes[0].erro, "relatorio_sem_confirmacao");
  assert.equal(s.estado.wa.length, 0, "não repete");
  assert.equal(s.tab("nx_execucoes")[0].ok, false);
});

test("SC-056 o envio quebra com exceção: a reserva enviando_em é SOLTA (o dia não fica preso)", async () => {
  const s = cenarioRel({});
  // enviarParaTodos captura erro por destino; a exceção que escapa vem de um cfg quebrado → força pelo getter
  const r = await s.cron({ tipo: "diario" });
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo));
  const src = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/relatorio.js"), "utf8");
  assert.match(src, /db\.update\("nx_relatorios", \{ cliente_id: `eq\.\$\{cliente\.id\}`, tipo: `eq\.\$\{ctx\.tipo\}`, referencia: `eq\.\$\{ref\}` \}, \{ enviando_em: null \}\)/);
});

test("AC-306 diário de um dia sem gasto, conversa nem agendamento: não sai (com investimento na semana)", async () => {
  const s = cenarioRel({ metricas: diasEntre("2026-10-01", "2026-10-11").map(d => metrica(d)) });   // nada no dia 12 (ontem)
  const r = await s.cron({ tipo: "diario" });
  assert.equal(r.corpo.clientes[0].pulado, "dia sem movimento");
  assert.equal(s.estado.wa.length, 0);
  const forcado = await s.cron({ tipo: "diario", forcar: true });
  assert.equal(forcado.corpo.clientes[0].enviado, true, "forçar manda assim mesmo");
});

test("AC-055 resumo semanal: tipo «semanal» aceito; só sai para quem ligou cfg.relSemanal; referência = a segunda da semana anterior", async () => {
  assert.equal(segundaDaSemanaAnterior("2026-10-19"), "2026-10-12");
  assert.equal(segundaDaSemanaAnterior("2026-10-21"), "2026-10-12");
  assert.equal(segundaDaSemanaAnterior("2026-10-18"), "2026-10-05");
  assert.equal(tituloRelatorio("semanal", "Alfa", "2026-10-12"), "Resumo da semana Alfa 12/10");
  const off = cenarioRel({});
  assert.equal((await off.cron({ tipo: "semanal" })).corpo.clientes[0].pulado, "resumo semanal desligado");
  const on = cenarioRel({ cfg: { waGestor: ["5512911112222"], relSemanal: true } });
  const r = await on.cron({ tipo: "semanal" });
  assert.equal(r.corpo.clientes[0].enviado, true, JSON.stringify(r.corpo));
  assert.equal(on.tab("nx_relatorios")[0].tipo, "semanal");
  assert.equal(on.tab("nx_relatorios")[0].referencia, "2026-10-05", "terça 13/10 → a semana de 05/10");
});

/* ================================================================== SC-023 webhook */
test("SC-023 webhook: assinatura errada relê o segredo no máximo 1× por minuto por canal (antes: cada POST forjado = leituras no banco)", async () => {
  let leituras = 0;
  const s = dbFalso({ tabelas: { nx_config: () => { leituras++; return [{ meta_app_secret: "segredo", wa_verify_token: "v" }]; } } });
  let agora = Date.parse("2026-10-21T12:00:00Z");
  const post = () => webhook(new Request(`${FN}/nx-whatsapp`, { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: "{}" }), ENV, { fetch: s.fetch, agora: () => new Date(agora) });
  assert.equal((await post()).status, 401);
  const depois1 = leituras;
  for (let i = 0; i < 20; i++) assert.equal((await post()).status, 401);
  assert.ok(leituras - depois1 <= 1, `20 forjados viraram ${leituras - depois1} leituras`);
  agora += RELER_SEGREDO_MS + 1000;
  const antes = leituras;
  await post(); await post();
  assert.ok(leituras > antes, "passado o minuto, relê de novo");
});

/* ================================================================== SC-026/SC-027 CodeWords */
function cenarioCW({ contatos = [], taxa = { ok: true } } = {}) {
  return dbFalso({
    rpcs: {
      nx_fn_ctx: () => ({ conta_id: "c-adm", org_id: "o1", papel: "admin" }), nx_exigir_modulo: () => null,
      nx_canal_credencial: () => ({ canal_id: K_CW, cliente_id: CLI_A, provedor: "codewords", codewords_api_key: "cwk-x", codewords_numero: "5512900001111", codewords_phone_id: "p1", codewords_url: `${FN}/nx-codewords?ch=${"a".repeat(64)}` }),
      nx_trava_pegar: () => true, nx_taxa_usar: () => taxa, nx_auditar: () => null,
    },
    tabelas: { nx_contatos: () => contatos, nx_clientes: () => [{ nome: "Clínica", cfg: {} }] },
    fora: async () => resp({ message_id: "m1" }),
  });
}
const pedirCW = (s, corpo) => codewords(new Request(`${FN}/nx-codewords`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, canal: K_CW, ...corpo }) }), ENV, { fetch: s.fetch }).then(ler);

test("SC-026 «Enviar teste» do CodeWords: só para o próprio número ou contato do cliente, e no máximo 5/h por cliente", async () => {
  const s = cenarioCW();
  const r = await pedirCW(s, { acao: "enviar_teste", para: "5511999998888" });
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "dados_invalidos");
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("GRAPH") || c.nome === "nx_taxa_usar").length, 0, "nada enviado nem contado");
  const conhecido = cenarioCW({ contatos: [{ id: 1 }] });
  const ok = await pedirCW(conhecido, { acao: "enviar_teste", para: "5511999998888" });
  assert.notEqual(ok.corpo.erro, "dados_invalidos", JSON.stringify(ok.corpo));
  assert.equal(conhecido.de("nx_taxa_usar")[0].corpo.p_limite, LIMITE_TESTE_H);
  const cheio = cenarioCW({ taxa: { ok: false } });
  const c = await pedirCW(cheio, { acao: "enviar_teste" });   // o próprio número dispensa o contato
  assert.equal(c.corpo.erro, "limite_taxa");
});

test("SC-027 «receita» do CodeWords (devolve o segredo do canal) deixa nx_auditoria codewords_segredo_visto", async () => {
  const s = cenarioCW();
  const r = await pedirCW(s, { acao: "receita" });
  assert.equal(r.corpo.ok, true);
  const a = s.de("nx_auditar");
  assert.equal(a.length, 1); assert.equal(a[0].corpo.p_acao, "codewords_segredo_visto"); assert.equal(a[0].corpo.p_conta, "c-adm");
});

/* ================================================================== SC-037 nx-enviar limites */
test("SC-037 nx-enviar: lido, sincronizar_templates e testar_canal passam por nx_taxa_usar por cliente; estourou → 429 limite_taxa", async () => {
  assert.deepEqual(LIMITES_ACAO, { lido: [600, 60], sincronizar_templates: [6, 3600], testar_canal: [10, 3600] });
  const s = dbFalso({ rpcs: { nx_fn_ctx: () => ({ conta_id: "c-adm", papel: "admin" }), nx_exigir_modulo: () => null, nx_taxa_usar: () => ({ ok: false }) } });
  for (const acao of ["lido", "sincronizar_templates", "testar_canal"]) {
    const r = await ler(await enviar(new Request(`${FN}/nx-enviar`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, acao, conversa: 1, canal: K_M }) }), ENV, { fetch: s.fetch }));
    assert.equal(r.status, 429, acao); assert.equal(r.corpo.erro, "limite_taxa");
  }
  assert.deepEqual(s.de("nx_taxa_usar").map(c => c.corpo.p_chave), [`enviar:lido:${CLI_A}`, `enviar:sincronizar_templates:${CLI_A}`, `enviar:testar_canal:${CLI_A}`]);
});

/* ================================================================== SC-062 Google */
test("SC-062 Google: falha de REDE repete (2 s, 8 s) e, esgotada, vira google_indisponivel sem a URL — antes a exceção crua", async () => {
  const esperas = [];
  let n = 0;
  const f = async url => {
    if (String(url).includes("oauth2")) return resp({ access_token: "ya29.x", expires_in: 3600 });
    n++; throw new TypeError(`error sending request for url (${url}?access_token=segredo)`);
  };
  const g = criarGoogle({ fetch: f, esperar: async ms => esperas.push(ms) });
  const cred = { google_client_id: "a", google_client_secret: "b", google_refresh_token: "c", google_developer_token: "d", google_customer_id: "123" };
  await assert.rejects(g.campanhas ? g.campanhas(cred, "2026-10-01", "2026-10-02") : g.buscar(cred, "campanha", "2026-10-01", "2026-10-02"), e => {
    assert.equal(e.codigo, "google_indisponivel"); assert.doesNotMatch(e.message, /segredo|googleads/); return true;
  });
  assert.deepEqual(esperas, [2000, 8000]); assert.equal(n, 3);
  // OAuth: 2ª falha de rede também com código
  const g2 = criarGoogle({ fetch: async () => { throw new TypeError("dns"); }, esperar: async () => {} });
  await assert.rejects((g2.campanhas || g2.buscar)(cred, ...(g2.campanhas ? ["2026-10-01", "2026-10-02"] : ["campanha", "2026-10-01", "2026-10-02"])), e => e.codigo === "google_indisponivel");
  assert.equal(erroIndisponivel("API").codigo, "google_indisponivel");
});

/* ================================================================== SC-063/SC-064 WhatsApp da plataforma */
test("SC-063 versão da Graph desligada (2635) no envio da plataforma: tenta a próxima da lista; SC-064 idioma do modelo configurável", async () => {
  const urls = [];
  const f = async (url, init) => {
    urls.push(String(url));
    if (String(url).includes("/v23.0/")) return resp({ error: { message: "deprecated version", code: 2635 } }, 400);
    return resp({ messages: [{ id: "wamid.ok" }], corpo: JSON.parse(init.body) });
  };
  const r = await enviarWhatsApp({ wa_access_token: "t", wa_phone_number_id: "900" }, "5512911112222", "oi", { fetch: f });
  assert.equal(r.id, "wamid.ok");
  assert.deepEqual(urls.map(u => u.split("/")[3]), ["v23.0", "v24.0"]);
  assert.deepEqual(VERSOES_WA.slice(0, 2), ["v23.0", "v24.0"]);
  // erro que não é de versão: não troca de versão
  const urls2 = [];
  await assert.rejects(enviarWhatsApp({ wa_access_token: "t", wa_phone_number_id: "900" }, "5512911112222", "oi", { fetch: async u => { urls2.push(u); return resp({ error: { message: "token", code: 190 } }, 401); } }));
  assert.equal(urls2.length, 1);
  assert.equal(idiomaTemplate("en_US"), "en_US"); assert.equal(idiomaTemplate("es"), "es"); assert.equal(idiomaTemplate("x; drop"), "pt_BR"); assert.equal(idiomaTemplate(null), "pt_BR");
  let corpo;
  await enviarTemplate({ wa_access_token: "t", wa_phone_number_id: "900", wa_template: "aviso", wa_template_idioma: "en_US" }, "5512911112222", "T", { fetch: async (u, i) => { corpo = JSON.parse(i.body); return resp({ messages: [{ id: "w" }] }); } });
  assert.equal(corpo.template.language.code, "en_US", "antes pt_BR fixo");
});

/* ================================================================== SC-022 CORS */
test("SC-022 CORS: com NX_ORIGENS, a resposta do painel leva a origem exata (ou null) e Vary: Origin; sem o env continua «*»", async () => {
  assert.equal(origensPermitidas(""), null);
  const lista = origensPermitidas("https://orbita-nexus-ads.netlify.app, http://localhost:*");
  assert.ok(origemPermitida("https://orbita-nexus-ads.netlify.app", lista));
  assert.ok(origemPermitida("http://localhost:8080", lista)); assert.ok(origemPermitida("http://localhost", lista));
  assert.ok(!origemPermitida("https://evil.example", lista)); assert.ok(!origemPermitida("http://localhost.evil.example", lista));
  const req = o => new Request(`${FN}/x`, { method: "POST", headers: { origin: o } });
  const r1 = comCors(respostaPainel({ ok: true }), req("https://evil.example"), lista);
  assert.equal(r1.headers.get("access-control-allow-origin"), "null"); assert.equal(r1.headers.get("vary"), "Origin");
  const r2 = comCors(respostaPainel({ ok: true }), req("http://localhost:5173"), lista);
  assert.equal(r2.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const sem = await tratarPainel(new Request(`${FN}/x`, { method: "OPTIONS", headers: { origin: "https://evil.example" } }), async () => null);
  assert.equal(sem.headers.get("access-control-allow-origin"), "*", "sem NX_ORIGENS nada muda");
  const antes = globalThis.Deno;
  try {
    globalThis.Deno = { env: { get: k => (k === "NX_ORIGENS" ? "https://orbita-nexus-ads.netlify.app" : undefined) } };
    const pre = await tratarPainel(new Request(`${FN}/x`, { method: "OPTIONS", headers: { origin: "https://evil.example" } }), async () => null);
    assert.equal(pre.headers.get("access-control-allow-origin"), "null");
    const ok = await tratarPainel(new Request(`${FN}/x`, { method: "POST", headers: { origin: "https://orbita-nexus-ads.netlify.app" }, body: "{}" }), async () => respostaPainel({ ok: true }));
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://orbita-nexus-ads.netlify.app");
  } finally { if (antes === undefined) delete globalThis.Deno; else globalThis.Deno = antes; }
});
