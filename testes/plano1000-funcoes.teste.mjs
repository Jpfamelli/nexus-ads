/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente srv, lote srv-1: as 7 Edge Functions, scripts e CI
   node --test testes/plano1000-funcoes.teste.mjs
   Um caso de COMPORTAMENTO por item SV-… (cada um falha no código anterior). Sem rede e sem chave real: PostgREST (RPC por
   nome), whatsapp_device_manager, Graph, Storage são dublês; nx-ciclo e nx-relatorio usam o PostgREST em memória de
   testes/apoio. O que é SQL (migrações 20261013a/b) é provado pelos smokes 26 e 27 (e por plano1000-banco).
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { limparErro, listarClientes, tratarPainel, lerCorpo, exigirCorpoValido, statusDoCodigo, ErroApi } from "../supabase/functions/_compartilhado/comum.js";
import { criarDb } from "../supabase/functions/_compartilhado/db.js";
import { tratar as webhook } from "../supabase/functions/_compartilhado/webhook.js";
import { baixarMidia, lerComTeto } from "../supabase/functions/_compartilhado/conversas.js";
import { tratar as enviar, enviarFila, midiasPresas } from "../supabase/functions/_compartilhado/enviar.js";
import { tratar as codewords, vigiarAparelhos, sincronizar, enviarTextoCodeWords, MAX_RESPOSTA_CW } from "../supabase/functions/_compartilhado/codewords.js";
import { tratar as midia, criarStorage, confereAssinatura } from "../supabase/functions/_compartilhado/midia.js";
import { normalizarTelefone, enviarWhatsApp } from "../supabase/functions/_compartilhado/whatsapp.js";
import { tratar as ciclo, JANELA_SYNC_DIARIA } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import { buscarMeta } from "../supabase/functions/_compartilhado/meta.js";
import { criarGoogle } from "../supabase/functions/_compartilhado/google.js";
import { segredoDe, simular } from "../scripts/simular-webhook.mjs";
import { varrerTexto, PADROES } from "../scripts/varrer-segredos.mjs";
import { criarBanco as criarBancoFalso } from "./apoio/postgrest-falso.mjs";
// lote srv-2
import { log, comVersao, nomeCurto, painelRadarUrl, comPainelUrl, CAB_VERSAO } from "../supabase/functions/_compartilhado/comum.js";
import { TETO_SELECT } from "../supabase/functions/_compartilhado/db.js";
import { quandoDo, CHAVE_OK } from "../supabase/functions/_compartilhado/webhook.js";
import { hostDeMidiaMeta } from "../supabase/functions/_compartilhado/conversas.js";
import { dimensoesMidia } from "../supabase/functions/_compartilhado/enviar.js";
import { mesmoTelefone } from "../supabase/functions/_compartilhado/codewords.js";
import { zerarAusentes, renomearAntigos, gravarSync, avisarSaude } from "../supabase/functions/_compartilhado/ciclo.js";
import { reservarIA } from "../supabase/functions/_compartilhado/relatorio.js";
import { montarPrompt, cortarConversa, MAX_CONVERSA_PROMPT, tratar as nxIa } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { montarPromptDecisao, MAX_CONVERSA_DECISAO, MAX_NEGOCIO_DECISAO } from "../supabase/functions/_compartilhado/ia_automacoes.js";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = "https://fake.supabase.co";
const ENV = { url: SUPA, chave: "service-role-falsa" };
const FN = `${SUPA}/functions/v1`;
const CLI_A = "11111111-1111-4111-8111-111111111111";
const CLI_B = "22222222-2222-4222-8222-222222222222";
const K_A = "aaaaaaaa-0000-4000-8000-00000000000a";   // aparelho (CodeWords)
const K_M = "bbbbbbbb-0000-4000-8000-00000000000b";   // número Meta Cloud
const SEG_A = "a".repeat(64);
const NUM_A = "+5512991230001";
const TEL = "5512988887777";
const CHAVE_CW = "cwk-" + "k".repeat(40);
const HORA = 3600e3;
const iso = ms => new Date(ms).toISOString();

const resp = (d, status = 200, cab = {}) => new Response(typeof d === "string" ? d : JSON.stringify(d), { status, headers: { "content-type": "application/json", ...cab } });
const ler = async r => ({ status: r.status, corpo: await r.json(), cab: r.headers });
const ausente = nome => resp({ code: "PGRST202", message: `Could not find the function public.${nome} in the schema cache` }, 404);

/* ------------------------------------------------------------
   Dublê do PostgREST por RPC + tabelas por handler + hosts de fora (CodeWords, Graph, Storage) — o mesmo do plano 100
   ------------------------------------------------------------ */
function dbFalso({ rpcs = {}, tabelas = {}, config = {}, fora = null, atraso = 0 } = {}) {
  const chamadas = [];
  const CONFIG = { id: 1, cron_token: "cron-secreto", wa_access_token: "wa-tok", wa_phone_number_id: "900900", wa_template: "nexus_aviso",
    painel_url: null, anthropic_api_key: null, modelo_ia: null, meta_app_secret: "segredo-do-app", wa_verify_token: "verifica-123", ...config };
  const fetch = async (entrada, init = {}) => {
    if (atraso) await new Promise(r => setTimeout(r, atraso));
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
    const q = Object.fromEntries(u.searchParams);
    const dados = req.method === "GET" ? null : JSON.parse(await req.text() || "null");
    chamadas.push({ nome: `${req.method} ${tabela}`, corpo: req.method === "GET" ? q : { ...q, dados } });
    if (tabela === "nx_config" && req.method === "GET") return resp([typeof config === "function" ? config() : CONFIG]);
    const t = tabelas[tabela];
    if (typeof t === "function") return t({ req, q, dados, chamadas });
    if (req.method === "GET") return resp(Array.isArray(t) ? t : []);
    return new Response(null, { status: req.method === "POST" ? 201 : 204 });
  };
  return { fetch, chamadas, de: nome => chamadas.filter(c => c.nome === nome) };
}

/** CodeWords (lista/mensagens/envio), Graph e Storage de mentira. */
function foraFalso({ lista, mensagens, envioCW, graph, storage, link } = {}) {
  return async (req, u, chamadas) => {
    if (u.host === "runtime.codewords.ai") {
      const caminho = u.pathname.replace("/run/whatsapp_device_manager", "");
      chamadas.push({ nome: `CW ${req.method} ${caminho.split("?")[0]}`, corpo: Object.fromEntries(u.searchParams) });
      if (req.method === "GET" && caminho === "/connections") return typeof lista === "function" ? lista(chamadas) : resp(lista ?? [{ phone_id: "dev-a-1", phone_number: NUM_A, status: "logged_in", service_path: "svc_ia/webhook" }]);
      if (req.method === "GET" && caminho.startsWith("/proxy/chat/")) return typeof mensagens === "function" ? mensagens(chamadas) : resp({ results: { data: mensagens ?? [] } });
      if (req.method === "POST" && caminho.startsWith("/proxy/send/")) return typeof envioCW === "function" ? envioCW(req) : resp({ code: "SUCCESS", message: "sent", results: { message_id: "3EB0CW1", status: "sent" } });
      return resp({ erro: "rota falsa" }, 404);
    }
    if (u.host === "graph.facebook.com") {
      const x = { nome: `GRAPH ${req.method} ${u.pathname}`, url: req.url, auth: req.headers.get("authorization"), corpo: req.method === "POST" ? JSON.parse(await req.text() || "{}") : Object.fromEntries(u.searchParams) };
      chamadas.push(x);
      if (typeof graph === "function") { const r = await graph(req, u, x); if (r) return r; }
      if (req.method === "POST" && u.pathname.endsWith("/messages")) return resp({ messaging_product: "whatsapp", messages: [{ id: `wamid.${chamadas.filter(c => c.nome.startsWith("GRAPH POST")).length}` }] });
      return resp({ id: "x" });
    }
    if (u.pathname.startsWith("/storage/v1/")) {
      chamadas.push({ nome: `STORAGE ${req.method} ${u.pathname.split("/").slice(3, 5).join("/")}`, url: req.url });
      if (typeof storage === "function") { const r = await storage(req, u); if (r) return r; }
      if (/\/object\/sign\/nx-midia$/.test(u.pathname)) { const { paths } = JSON.parse(await req.text()); return resp(paths.map(p => ({ path: p, signedURL: `/object/sign/nx-midia/${p}?token=t` }))); }
      if (/\/object\/sign\/nx-midia\//.test(u.pathname)) return typeof link === "function" ? link(req) : new Response(new Uint8Array(1000), { status: 200, headers: { "content-length": "1000" } });
      if (/\/object\/nx-midia\//.test(u.pathname) && req.method === "POST") return resp({ Key: "ok" });
      return resp({ message: "rota falsa" }, 404);
    }
    throw new TypeError(`host inesperado: ${u.host}`);
  };
}

const CRED_CW = {
  canal_id: K_A, cliente_id: CLI_A, nome: "WhatsApp A", provedor: "codewords", codewords_numero: NUM_A, codewords_phone_id: "dev-a-1",
  codewords_service_id: "svc_ia", codewords_rota: "fluxo", codewords_api_key: CHAVE_CW, codewords_url: `${FN}/nx-codewords?ch=${SEG_A}`,
  codewords_numero_conferido: true, codewords_conferido_em: null, ia_ligada: true,
};
const travasFalsas = (travas = new Map()) => ({
  nx_trava_pegar: ({ p_nome, p_segundos, p_dono }) => { const t = travas.get(p_nome); if (t && t.ate > Date.now()) return false; travas.set(p_nome, { ate: Date.now() + p_segundos * 1000, dono: p_dono }); return true; },
  nx_trava_soltar: ({ p_nome, p_dono }) => { const t = travas.get(p_nome); if (!t || t.dono !== p_dono) return false; travas.delete(p_nome); return true; },
});
const rpcsAgente = (extra = {}, travas = new Map()) => ({
  ...travasFalsas(travas),
  nx_codewords_canal: ({ p_chave }) => (p_chave === SEG_A ? { canal_id: K_A, cliente_id: CLI_A, numero: NUM_A, rota: "fluxo", ia_ligada: true, excedido: false } : null),
  nx_codewords_status: () => ({ ok: true, pendente: false }),
  nx_codewords_contar: () => ({ ok: true }),
  nx_codewords_forma: () => null,
  nx_notificar: () => 1,
  nx_canal_credencial: () => ({ ...CRED_CW }),
  nx_codewords_situacao: ({ p_dados }) => ({ id: K_A, status: "ativo", codewords: p_dados }),
  nx_codewords_sync_alvos: () => [],
  nx_alerta_destinos: () => ({ destinos: ["5512999998888"] }),
  ...extra,
});
const cenarioCW = (o = {}) => dbFalso({ rpcs: rpcsAgente(o.rpc, o.travas), tabelas: o.tabelas, config: o.config, fora: foraFalso(o.cw || {}) });
const cronCW = (s, corpo, deps = {}) => codewords(new Request(`${FN}/nx-codewords`, {
  method: "POST", headers: { "content-type": "application/json", "x-nx-cron": "cron-secreto" }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
}), ENV, { fetch: s.fetch, ...deps });
const assinar = (corpo, segredo = "segredo-do-app") => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
const postMeta = (s, payload, deps = {}, segredo) => {
  const corpo = JSON.stringify(payload);
  return webhook(new Request(`${FN}/nx-whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo, segredo) }, body: corpo }), ENV, { fetch: s.fetch, ...deps });
};
const eventoMeta = ({ pid = "111", messages, statuses, field = "messages", value }) => ({ object: "whatsapp_business_account", entry: [{ id: "102938475610", changes: [{ field, value: value || {
  messaging_product: "whatsapp", metadata: { display_phone_number: "551239990000", phone_number_id: pid },
  ...(statuses ? { statuses } : { contacts: [{ profile: { name: "Maria" }, wa_id: TEL }], messages }),
} }] }] });
const textoMeta = (body, extra = {}) => ({ from: TEL, id: `wamid.${Math.random().toString(16).slice(2)}`, timestamp: "1790000000", type: "text", text: { body }, ...extra });
const canalMeta = { canal_id: K_M, cliente_id: CLI_A, phone_number_id: "111", cliente_slug: "a", waba_id: "102938475610", verify_token: "v", app_secret: null, tem_token: true, status: "ativo" };
const rpcsWebhook = (extra = {}) => ({
  nx_wa_canal: () => canalMeta,
  nx_wa_entrada: () => ({ mensagem_id: 7001, conversa_id: 601, contato_id: 501, nova_conversa: true, duplicada: false, bloqueado: false, optout: false, midia_pendente: false, fila_id: null }),
  nx_lead_webhook: () => "criado",
  nx_rastreio_atribuir: () => ({ ok: true }),
  nx_codewords_origem: () => ({ ok: true }),
  ...extra,
});
const painelEnviar = (s, corpo, deps = {}) => enviar(new Request(`${FN}/nx-enviar`, {
  method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" }, body: JSON.stringify({ token: "tok-adm", cliente: CLI_A, ...corpo }),
}), ENV, { fetch: s.fetch, prazoRede: 50, ...deps });
function cenarioEnviar({ cx = {}, cred = null, rpc = {}, fora = {} } = {}) {
  let seq = 100;
  const CX = {
    conversa: { id: 601, status: "aberta", canal_id: K_M, contato_id: 501 }, contato: { id: 501, wa_id: TEL, telefone: TEL, nome: "Paula", optin_marketing: null, bloqueado: false },
    canal_id: K_M, canal: { id: K_M, provedor: "meta" }, janela_aberta: true, ultimo_wamid_in: "wamid.in1", cfg_cv: { recibo_leitura: true, assinatura: false },
    atendente_nome: "Ana Lima", empresa: "Clínica Alfa", ...cx,
  };
  const CRED = cred || { canal_id: K_M, cliente_id: CLI_A, provedor: "meta", token: "EAAtoken", phone_number_id: "111", waba_id: "W1", app_secret: null };
  return dbFalso({
    rpcs: {
      nx_fn_ctx: () => ({ conta_id: "c-adm", papel: "admin" }), nx_exigir_modulo: () => null,
      nx_cv_contexto_envio: () => CX, nx_canal_credencial: () => ({ ...CRED }),
      nx_cv_ref_reservar: () => ({ estado: "novo" }), nx_cv_ref_marcar: () => true, nx_cv_ref_liberar: () => true,
      nx_cv_saida: ({ p_msg }) => ({ id: ++seq, conversa_id: 601, direcao: "out", ...p_msg }),
      nx_cv_ia_pausa_auto: () => null,
      ...rpc,
    },
    fora: foraFalso(fora),
  });
}
const itemFila = (o = {}) => ({ id: 1, cliente_id: CLI_A, canal_id: K_M, conversa_id: 601, conversa: { id: 601 }, contato: { wa_id: TEL, bloqueado: false },
  tipo: "texto", texto: "oi", janela_aberta: true, origem: "automacao", tentativas: 1, ...o });
const credMeta = { canal_id: K_M, cliente_id: CLI_A, provedor: "meta", token: "EAAtoken", phone_number_id: "111" };
/** nx_fila_pegar falso: devolve os lotes na ordem, um por chamada. */
const lotes = (...l) => (p, ch) => l[ch.filter(c => c.nome === "nx_fila_pegar").length - 1] || [];

/* ================================================================== comum.js / db.js */
test("SV-098 limparErro mascara telefone (fica o fim) e e-mail — «Key (telefone)=(5512…)» do Postgres não chega à clínica inteiro", () => {
  assert.equal(limparErro("Key (telefone)=(5512988887777) already exists"), "Key (telefone)=(*********7777) already exists");
  assert.equal(limparErro("falhou para paula.souza@clinica.com.br"), "falhou para p***@clinica.com.br");
  assert.equal(limparErro("HTTP 413 em 2026-10-13, código 131026"), "HTTP 413 em 2026-10-13, código 131026", "números curtos e datas ficam");
  assert.equal(limparErro("wamid.HBgNNTUxMjk4ODg4Nzc3NxUCABEYEjM1"), "wamid.HBgNNTUxMjk4ODg4Nzc3NxUCABEYEjM1", "id com letras não é telefone");
});

test("SV-096 db.js: GET que dá 503 (ou cai a conexão) repete 1× depois de 300 ms; POST/RPC nunca repetem", async () => {
  let n = 0;
  const f503 = async (url, init) => { n++; return n === 1 ? resp({ message: "upstream" }, 503) : resp([{ id: 1 }]); };
  const db = criarDb(ENV, f503, { repetirMs: 1 });
  assert.deepEqual(await db.select("nx_x", { limit: 1 }), [{ id: 1 }]);
  assert.equal(n, 2);
  let m = 0;
  const conexao = async () => { m++; if (m === 1) throw new TypeError("fetch failed"); return resp([{ ok: 1 }]); };
  assert.deepEqual(await criarDb(ENV, conexao, { repetirMs: 1 }).select("nx_x", { limit: 1 }), [{ ok: 1 }], "conexão caída: repete");
  let p = 0;
  const post = async () => { p++; return resp({ message: "upstream" }, 503); };
  await assert.rejects(criarDb(ENV, post, { repetirMs: 1 }).rpc("nx_y", {}), /banco 503/);
  assert.equal(p, 1, "RPC (pode ter sido aplicada) não repete");
  let q = 0;
  await assert.rejects(criarDb(ENV, async () => { q++; return resp({ message: "x" }, 400); }, { repetirMs: 1 }).select("nx_x", { limit: 1 }));
  assert.equal(q, 1, "400 é permanente: não repete");
});

test("SV-097 + SV-050 erro interno do painel: sem detalhe técnico na resposta, com req_id no corpo, no cabeçalho x-orbita-req e no log", async () => {
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(" "));
  try {
    const r = await tratarPainel(new Request(`${FN}/x`, { method: "POST", body: "{}" }), async () => {
      throw Object.assign(new Error("banco 500 em rpc/nx_interna: column nx_contatos.segredo does not exist"), { status: 500, banco: true });
    });
    const { status, corpo, cab } = await ler(r);
    assert.equal(status, 500);
    assert.deepEqual(Object.keys(corpo).sort(), ["erro", "ok", "req_id"]);
    assert.equal(corpo.erro, "erro_interno"); assert.match(corpo.req_id, /^[0-9a-f]{8}$/);
    assert.equal(cab.get("x-orbita-req"), corpo.req_id);
    // SV-106 (srv-2): o log virou uma linha JSON com req_id (antes «painel [id]: …»)
    assert.ok(logs.some(l => l.includes(`"req_id":"${corpo.req_id}"`) && l.includes("nx_contatos")), "o detalhe fica no log com o mesmo id");
    const ok = await tratarPainel(new Request(`${FN}/x`, { method: "POST", body: "{}" }), async () => new Response("{}", { status: 200 }));
    assert.match(ok.headers.get("x-orbita-req"), /^[0-9a-f]{8}$/, "toda resposta leva o id");
  } finally { console.error = orig; }
  assert.equal(statusDoCodigo("cliente_pausado"), 403);
});

test("SV-100 cron: corpo ilegível NÃO vira «todos os clientes» — 400 depois de autenticar (sem token continua 401), sem listar clientes", async () => {
  const s = dbFalso({ tabelas: { nx_clientes: [{ id: CLI_A, slug: "a", nome: "A", ativo: true, cfg: {} }] } });
  const pedir = (corpo, token = "cron-secreto") => ciclo(new Request(`${FN}/nx-ciclo`, { method: "POST", headers: { "content-type": "application/json", "x-nx-cron": token }, body: corpo }), ENV, { fetch: s.fetch });
  const r = await ler(await pedir('{cliente:'));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "dados_invalidos");
  assert.equal(s.de("GET nx_clientes").length, 0, "nenhum cliente processado");
  assert.equal((await pedir('[1,2]')).status, 400, "array não é corpo de cron");
  assert.equal((await pedir('{cliente:', "errado")).status, 401, "sem o token: 401 (nada se revela)");
  assert.deepEqual(exigirCorpoValido(await lerCorpo(new Request(`${FN}/x`, { method: "POST", body: "" }))), {}, "vazio continua {}");
});

test("SV-205 listarClientes: cliente de revenda suspensa ou cancelada fica fora do cron; consulta falhando não esvazia a lista", async () => {
  const CLI_R = "33333333-3333-4333-8333-333333333333";
  const s = dbFalso({ tabelas: {
    nx_clientes: ({ q }) => resp(q.org_id ? [{ id: CLI_R }] : [{ id: CLI_A, slug: "a" }, { id: CLI_R, slug: "r" }]),
    nx_orgs: ({ q }) => { assert.equal(q.status, "in.(suspenso,cancelado)"); return resp([{ id: "org-parada" }]); },
  } });
  assert.deepEqual((await listarClientes(criarDb(ENV, s.fetch), null, "2026-10-13")).map(c => c.slug), ["a"]);
  const quebrado = dbFalso({ tabelas: { nx_clientes: [{ id: CLI_A, slug: "a" }], nx_orgs: () => resp({ message: "x" }, 400) } });
  assert.deepEqual((await listarClientes(criarDb(ENV, quebrado.fetch), null, "2026-10-13")).map(c => c.slug), ["a"]);
});

/* ================================================================== whatsapp.js */
test("SV-052 normalizarTelefone: 55 só em número brasileiro sem DDI — gestor nos EUA não vira 5514155551234", () => {
  assert.equal(normalizarTelefone("14155551234"), "14155551234");
  assert.equal(normalizarTelefone("+1 415 555 1234"), "14155551234");
  assert.equal(normalizarTelefone("12988887777"), "5512988887777");
  assert.equal(normalizarTelefone("(12) 3333-4444"), "551233334444");
  assert.equal(normalizarTelefone("5512988887777"), "5512988887777");
  assert.equal(normalizarTelefone(""), "");
});

test("SV-053 corte do texto da Nexus não parte emoji: 4.095 caracteres + emoji saem bem formados", async () => {
  const corpos = [];
  const f = async (url, init) => { corpos.push(init.body); return resp({ messages: [{ id: "w1" }] }); };
  // plano 1000 (SV-054, srv-3): o texto longo agora vai em partes de até 4.000 — o emoji no corte não é partido em nenhuma
  await enviarWhatsApp({ wa_access_token: "t", wa_phone_number_id: "1" }, "5512988887777", "x".repeat(3999) + "😀" + "fim", { fetch: f });
  const partes = corpos.map(c => JSON.parse(c).text.body);
  assert.ok(partes.every(p => p.isWellFormed()), "sem surrogate solto");
  assert.ok(partes.every(p => p.length <= 4000)); assert.equal(partes.join(""), "x".repeat(3999) + "😀" + "fim");
});

/* ================================================================== midia.js */
test("SV-055 Storage com prazo: Storage que nunca responde vira erro «não respondeu» (sem segurar a função até os 150 s)", async () => {
  const preso = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  const st = criarStorage(ENV, preso, { prazoMs: 30, prazoSubirMs: 40 });
  const t0 = Date.now();
  const r = await st.assinar(["x/y.jpg"]);
  assert.equal(r.ok, false); assert.match(r.erro, /não respondeu/);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal((await st.subir("x/y.jpg", new Uint8Array(3), "image/jpeg")).ok, false);
});

test("SV-058 «ver mídia» só assina o que a conta enxerga (nx_midia_visiveis); banco sem a RPC → como antes", async () => {
  const p1 = `${CLI_A}/in/2026-10/a.jpg`, p2 = `${CLI_A}/in/2026-10/de-outro-departamento.jpg`;
  const rodar = rpc => {
    const s = dbFalso({ rpcs: { nx_fn_ctx: () => ({ conta_id: "c-at", papel: "atendente", departamentos: ["d1"], ver_todas: false }), nx_exigir_modulo: () => null, ...rpc }, fora: foraFalso() });
    return midia(new Request(`${FN}/nx-midia`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, acao: "ver", paths: [p1, p2] }) }), ENV, { fetch: s.fetch }).then(ler).then(r => ({ r, s }));
  };
  const { r, s } = await rodar({ nx_midia_visiveis: ({ p_paths, p_ctx }) => { assert.equal(p_ctx.papel, "atendente"); return p_paths.filter(p => p === p1); } });
  assert.deepEqual(Object.keys(r.corpo.urls), [p1]);
  assert.equal(s.de("nx_midia_visiveis")[0].corpo.p_cliente, CLI_A);
  const antigo = await rodar({});
  assert.deepEqual(Object.keys(antigo.r.corpo.urls).sort(), [p1, p2].sort(), "sem a migração 20261013b: assina tudo do cliente (como antes)");
});

test("SV-219 confereAssinatura: os primeiros bytes têm de bater com o tipo (ZIP com mime image/jpeg é recusado)", () => {
  const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]);
  assert.equal(confereAssinatura(zip, "image/jpeg"), false);
  assert.equal(confereAssinatura(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "image/jpeg"), true);
  assert.equal(confereAssinatura(zip, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true, "docx é ZIP");
  assert.equal(confereAssinatura(new TextEncoder().encode("%PDF-1.7"), "application/pdf"), true);
  assert.equal(confereAssinatura(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "), "audio/wav"), true);
  assert.equal(confereAssinatura(new TextEncoder().encode("MZ\x90\0\x03\0"), "application/pdf"), false, "executável com nome de PDF");
  assert.equal(confereAssinatura(new TextEncoder().encode("qualquer texto"), "text/plain"), true, "tipo sem assinatura passa");
});

/* ================================================================== conversas.js (mídia recebida) */
test("SV-008 download da mídia recebida com teto em streaming: sem Content-Length nem file_size, para ao passar de 16 MB", async () => {
  let lidos = 0;
  const grande = () => new Response(new ReadableStream({ pull(c) { lidos += 1024 * 1024; c.enqueue(new Uint8Array(1024 * 1024)); } }, { highWaterMark: 0 }), { status: 200 });
  assert.equal(await lerComTeto(grande(), 16 * 1024 * 1024), null);
  assert.ok(lidos <= 18 * 1024 * 1024, `leu ${lidos} bytes`);
  const s = dbFalso({ rpcs: { nx_canal_credencial: () => ({ token: "EAA" }), nx_wa_midia_ok: () => null },
    fora: foraFalso({ graph: (req, u) => (u.pathname.endsWith("/M1") ? resp({ url: "https://lookaside.fbsbx.com/m1", mime_type: "image/jpeg" }) : null) }) });
  const f = (url, init) => (String(url).startsWith("https://lookaside") ? grande() : s.fetch(url, init));
  const r = await baixarMidia(criarDb(ENV, f), { canal_id: K_M, cliente_id: CLI_A }, 7001, { media_id: "M1" }, { fetch: f, env: ENV });
  assert.deepEqual(r, { ok: false, erro: "arquivo maior que 16 MB" });
  assert.equal(s.de("nx_wa_midia_ok")[0].corpo.p_erro, "arquivo maior que 16 MB");
});

/* ================================================================== webhook.js */
test("SV-001 recibo «sem registro» recente: a 2ª passada (espera de 4 s) roda em 2º plano — o 200 sai antes do nx_wa_anotar", async () => {
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  const planos = [];
  const s = dbFalso({ rpcs: { nx_wa_anotar: () => 1 }, tabelas: { nx_alertas: ({ chamadas }) => resp(chamadas.filter(c => c.nome === "GET nx_alertas").length > 1 ? [{ id: 5, cliente_id: CLI_A, wa_ids: ["wamid.N1"], wa_ids_template: [] }] : []) } });
  const t = Math.floor(Date.now() / 1000);
  const r = await postMeta(s, eventoMeta({ pid: "900900", statuses: [{ id: "wamid.N1", status: "delivered", timestamp: String(t), recipient_id: TEL }] }),
    { esperar: () => espera, emSegundoPlano: p => planos.push(p) });
  assert.equal(r.status, 200);
  assert.equal(s.de("nx_wa_anotar").length, 0, "a resposta não esperou a 2ª passada");
  assert.equal(planos.length, 1);
  soltar(); await Promise.all(planos);
  assert.equal(s.de("nx_wa_anotar").length, 1, "depois de liberar, o recibo é anotado");
});

test("SV-002 recibos do número da Nexus: UM select por tabela para o lote inteiro (não 2 por recibo) e o mesmo resultado", async () => {
  const al = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, cliente_id: CLI_A, wa_ids: [`wamid.R${i}`], wa_ids_template: [] }));
  const s = dbFalso({ rpcs: { nx_wa_anotar: ({ p_ids }) => p_ids.length },
    tabelas: { nx_alertas: ({ q }) => { assert.match(q.or, /^\(wa_ids\.ov\.\{.*\},wa_ids_template\.ov\.\{.*\}\)$/); return resp(al); }, nx_relatorios: [] } });
  const t = String(Math.floor(Date.now() / 1000));
  const r = await ler(await postMeta(s, eventoMeta({ pid: "900900", statuses: al.map((_, i) => ({ id: `wamid.R${i}`, status: i % 2 ? "read" : "delivered", timestamp: t, recipient_id: TEL })) })));
  assert.equal(r.corpo.recibos.entregue, 50);
  assert.equal(s.de("GET nx_alertas").length, 1); assert.equal(s.de("GET nx_relatorios").length, 1);
  assert.deepEqual(s.de("nx_wa_anotar").map(c => c.corpo.p_ids), al.map(a => [a.id]), "cada recibo anota o SEU alerta");
});

test("SV-003 configuração do webhook em cache por 60 s no isolate; segredo trocado → relê e aceita", async () => {
  let segredo = "segredo-do-app";
  const s = dbFalso({ rpcs: rpcsWebhook(), config: () => ({ id: 1, meta_app_secret: segredo, wa_verify_token: "v", wa_phone_number_id: "900900", wa_access_token: "x", wa_template: null, painel_url: null }) });
  for (let i = 0; i < 3; i++) assert.equal((await postMeta(s, eventoMeta({ messages: [textoMeta("oi")] }))).status, 200);
  assert.equal(s.de("GET nx_config").length, 1, "3 POSTs = 1 leitura de nx_config");
  segredo = "segredo-novo";
  assert.equal((await postMeta(s, eventoMeta({ messages: [textoMeta("oi")] }), {}, "segredo-novo")).status, 200, "o segredo novo é aceito");
  assert.equal(s.de("GET nx_config").length, 2, "uma releitura");
  assert.equal((await postMeta(s, eventoMeta({ messages: [textoMeta("oi")] }), {}, "errado")).status, 401);
});

test("SV-005 webhook: status de modelo da Meta (message_template_status_update) atualiza nx_templates pela WABA", async () => {
  const s = dbFalso({ rpcs: { ...rpcsWebhook(), nx_template_status: () => ({ ok: true, atualizados: 2 }) } });
  const r = await ler(await postMeta(s, eventoMeta({ field: "message_template_status_update",
    value: { event: "REJECTED", message_template_id: 99, message_template_name: "lembrete_consulta", message_template_language: "pt_BR", reason: "INVALID_FORMAT" } })));
  assert.equal(r.status, 200); assert.equal(r.corpo.modelos, 2);
  assert.deepEqual(s.de("nx_template_status")[0].corpo, { p_waba: "102938475610", p_nome: "lembrete_consulta", p_idioma: "pt_BR", p_status: "REJECTED", p_motivo: "INVALID_FORMAT" });
  const antigo = dbFalso({ rpcs: rpcsWebhook() });
  assert.equal((await ler(await postMeta(antigo, eventoMeta({ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "x" } })))).status, 200, "banco sem a RPC: ignora");
});

test("SV-216 lead falhando por banco no MESMO wamid: a 3ª entrega responde 200 (rastro em nx_execucoes) — a Meta para de reentregar", async () => {
  const travas = new Map();
  const s = dbFalso({ rpcs: { ...rpcsWebhook(), ...travasFalsas(travas), nx_lead_webhook: () => { throw Object.assign(new Error("gatilho quebrado"), { status: 503 }); } } });
  const msg = textoMeta("oi", { id: "wamid.HBgNNTUxMjk4ODg4Nzc3NxUCABEYEjM1" });
  const st = [];
  for (let i = 0; i < 3; i++) st.push((await postMeta(s, eventoMeta({ messages: [msg] }))).status);
  assert.deepEqual(st, [503, 503, 200]);
  const exec = s.de("POST nx_execucoes");
  assert.equal(exec.length, 1); assert.equal(exec[0].corpo.dados.resumo.lead_reparo_manual, true);
  assert.ok(!JSON.stringify(exec[0].corpo.dados).includes("wamid.HBgNNTUxMjk4ODg4Nzc3NxUCABEYEjM1"), "wamid anonimizado");
});

test("SV-014 lote grande no webhook: 100 mensagens + 100 recibos com banco de 30 ms por chamada respondem em < 10 s", async () => {
  const planos = [];
  const s = dbFalso({ rpcs: { ...rpcsWebhook(), nx_wa_status: ({ p_statuses }) => ({ atualizados: p_statuses.length }) }, atraso: 30 });
  const payload = { object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "111" }, contacts: [{ profile: { name: "M" }, wa_id: TEL }],
    messages: Array.from({ length: 100 }, (_, i) => textoMeta(`msg ${i}`)),
    statuses: Array.from({ length: 100 }, (_, i) => ({ id: `wamid.S${i}`, status: "delivered", timestamp: "1790000000", recipient_id: TEL })) } }] }] };
  const t0 = performance.now();
  const r = await ler(await postMeta(s, payload, { emSegundoPlano: p => planos.push(p) }));
  const ms = performance.now() - t0;
  assert.equal(r.status, 200); assert.equal(r.corpo.mensagens, 100); assert.equal(r.corpo.recibos_canal, 100);
  assert.ok(ms < 10_000, `${Math.round(ms)} ms`);
  assert.equal(s.de("nx_wa_status").length, 1, "os 100 recibos do canal numa chamada");
});

/* ================================================================== enviar.js — painel */
test("SV-047 limite de envios por conta: nx_envio_vez recusou → 429 limite_taxa ANTES da Graph; banco sem a RPC segue", async () => {
  const s = cenarioEnviar({ rpc: { nx_envio_vez: ({ p_conta, p_cliente }) => { assert.equal(p_conta, "c-adm"); assert.equal(p_cliente, CLI_A); return { ok: false, erro: "limite_taxa" }; } } });
  const r = await ler(await painelEnviar(s, { acao: "texto", conversa: 601, texto: "oi" }));
  assert.deepEqual([r.status, r.corpo.erro], [429, "limite_taxa"]);
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("GRAPH")).length, 0);
  const antigo = cenarioEnviar();
  assert.equal((await ler(await painelEnviar(antigo, { acao: "texto", conversa: 601, texto: "oi" }))).corpo.ok, true);
  const lido = cenarioEnviar({ rpc: { nx_envio_vez: () => { throw new Error("não devia"); } } });
  assert.equal((await painelEnviar(lido, { acao: "lido", conversa: 601 })).status, 200, "«lido» não conta como envio");
});

test("SV-048 mídia pela Meta: o tamanho REAL do arquivo (HEAD na URL assinada) acima do teto do tipo → 400 midia_grande sem Graph", async () => {
  const path = `${CLI_A}/out/2026-10/foto.jpg`;
  const s = cenarioEnviar({ fora: { link: req => (req.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-length": String(6 * 1024 * 1024) } }) : null) } });
  const r = await ler(await painelEnviar(s, { acao: "midia", conversa: 601, path, mime: "image/jpeg", tamanho: 1024 * 1024, client_ref: "orbita:midia-real-01" }));
  assert.deepEqual([r.status, r.corpo.erro], [400, "midia_grande"]);
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("GRAPH POST")).length, 0);
  assert.equal(s.de("nx_cv_ref_liberar").length, 1, "nada saiu: a reserva é solta");
  const ok = cenarioEnviar({ fora: { link: req => (req.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-length": "4000" } }) : null) } });
  assert.equal((await ler(await painelEnviar(ok, { acao: "midia", conversa: 601, path, mime: "image/jpeg", tamanho: 4000, client_ref: "orbita:midia-real-02" }))).corpo.ok, true);
});

test("SV-219 mídia pelo aparelho: bytes de ZIP com mime image/jpeg → 400 midia_tipo, nada vai ao aparelho", async () => {
  const cred = { ...CRED_CW, codewords_conferido_em: new Date().toISOString(), codewords_numero_conferido: true };
  const s = cenarioEnviar({ cx: { canal_id: K_A, canal: { id: K_A, provedor: "codewords" } }, cred,
    fora: { link: () => new Response(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4]), { status: 200 }) } });
  const r = await ler(await painelEnviar(s, { acao: "midia", conversa: 601, path: `${CLI_A}/out/2026-10/foto.jpg`, mime: "image/jpeg", tamanho: 8, client_ref: "orbita:cw-zip-0001" }));
  assert.deepEqual([r.status, r.corpo.erro], [400, "midia_tipo"]);
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("CW POST")).length, 0);
});

/* ================================================================== enviar.js — fila e cron */
test("SV-044 fila: credencial ilegível de UM cliente adia só aquele item — os itens dos outros saem na mesma rodada", async () => {
  const concluir = [];
  const outros = [2, 3, 4].map(id => itemFila({ id, cliente_id: CLI_B, canal_id: K_M }));
  const s = dbFalso({
    rpcs: { nx_fila_pegar: lotes([itemFila({ id: 1, canal_id: "cccccccc-0000-4000-8000-00000000000c" }), ...outros]),
      nx_canal_credencial: ({ p_canal }) => { if (p_canal !== K_M) throw Object.assign(new Error("tempo esgotado"), { status: 503 }); return credMeta; },
      nx_cv_saida: () => ({ id: 9 }), nx_fila_concluir: ({ p_id, p_status }) => { concluir.push([p_id, p_status]); return { ok: true }; } },
    fora: foraFalso(),
  });
  const r = await enviarFila(criarDb(ENV, s.fetch, { repetirMs: 1 }), {}, { fetch: s.fetch });
  assert.equal(r.enviado, 3); assert.equal(r.adiado, 1);
  assert.deepEqual(concluir, [[1, "pendente"], [2, "enviado"], [3, "enviado"], [4, "enviado"]]);
});

test("SV-061 automação que não saiu (janela fechada, contato bloqueado) deixa uma linha de sistema na conversa", async () => {
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes([itemFila({ id: 1, janela_aberta: false }), itemFila({ id: 2, conversa_id: 602, conversa: { id: 602 }, contato: { wa_id: TEL, bloqueado: true } })]),
    nx_canal_credencial: () => credMeta, nx_fila_concluir: () => ({ ok: true }), nx_auto_sistema: () => null }, fora: foraFalso() });
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch });
  assert.equal(r.pulado, 2);
  const avisos = s.de("nx_auto_sistema").map(c => c.corpo);
  assert.equal(avisos.length, 2);
  assert.equal(avisos[0].p_conversa, 601); assert.match(avisos[0].p_texto, /24 h.*modelo aprovado/);
  assert.equal(avisos[1].p_conversa, 602); assert.match(avisos[1].p_texto, /bloqueado/);
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("GRAPH POST")).length, 0);
});

test("SV-039 fila: mensagem que SAIU e não foi gravada (nx_cv_saida falhou 2×) → aviso de sistema na conversa e o item com o erro informativo", async () => {
  const concluir = [];
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes([itemFila()]), nx_canal_credencial: () => credMeta,
    nx_cv_saida: () => { throw Object.assign(new Error("rede"), { status: 503 }); }, nx_auto_sistema: () => null,
    nx_fila_concluir: ({ p_status, p_erro }) => { concluir.push([p_status, p_erro]); return { ok: true }; } }, fora: foraFalso() });
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch });
  assert.equal(r.enviado, 1);
  assert.equal(s.de("nx_cv_saida").length, 2, "repete uma vez");
  assert.match(s.de("nx_auto_sistema")[0].corpo.p_texto, /saiu, mas não foi registrada aqui: «oi»/);
  assert.deepEqual(concluir, [["enviado", "a mensagem saiu, mas não foi registrada na conversa"]]);
  // gravou na 2ª: sem aviso
  let n = 0;
  const s2 = dbFalso({ rpcs: { nx_fila_pegar: lotes([itemFila()]), nx_canal_credencial: () => credMeta,
    nx_cv_saida: () => { if (++n === 1) throw Object.assign(new Error("rede"), { status: 503 }); return { id: 9 }; }, nx_fila_concluir: () => ({ ok: true }) }, fora: foraFalso() });
  await enviarFila(criarDb(ENV, s2.fetch), {}, { fetch: s2.fetch });
  assert.equal(s2.de("nx_auto_sistema").length, 0);
});

test("SV-026 ritmo do aparelho: fora da vez o item volta para a fila na hora certa SEM gastar tentativa; vez em poucos segundos é esperada", async () => {
  const cwItem = id => itemFila({ id, canal_id: K_A });
  const cred = { ...CRED_CW, codewords_conferido_em: new Date().toISOString() };
  const adiados = [], esperas = [];
  let vezes = 0;
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes([cwItem(1), cwItem(2), cwItem(3)]), nx_canal_credencial: () => cred, nx_cv_saida: () => ({ id: 9 }),
    nx_fila_concluir: () => ({ ok: true }), nx_fila_adiar: ({ p_id, p_ate }) => { adiados.push([p_id, p_ate]); return { ok: true }; },
    nx_codewords_envio_vez: () => { vezes++; return vezes === 1 || vezes === 3 ? { ok: true } : vezes === 2 ? { ok: false, vez: iso(Date.now() + 3000) } : { ok: false, vez: iso(Date.now() + 60_000) }; } },
    fora: foraFalso() });
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch, esperarRitmo: async ms => { esperas.push(ms); } });
  assert.equal(r.enviado, 2, "1º na hora; 2º depois de esperar os ~3 s dentro da rodada");
  assert.equal(esperas.length, 1, "só a vez próxima é esperada"); assert.ok(esperas[0] > 2000 && esperas[0] <= 3000);
  assert.equal(r.adiado, 1); assert.equal(adiados.length, 1); assert.equal(adiados[0][0], 3, "o 3º (vez em 1 min) volta para a fila");
  assert.equal(s.chamadas.filter(c => c.nome === "CW POST /proxy/send/message").length, 2);
  const antigo = dbFalso({ rpcs: { nx_fila_pegar: lotes([cwItem(1), cwItem(2)]), nx_canal_credencial: () => cred, nx_cv_saida: () => ({ id: 9 }), nx_fila_concluir: () => ({ ok: true }) }, fora: foraFalso() });
  assert.equal((await enviarFila(criarDb(ENV, antigo.fetch), {}, { fetch: antigo.fetch })).enviado, 2, "banco sem a RPC: envia como antes");
});

test("SV-032 fila CodeWords: a conferência do aparelho vale para os itens seguintes (10 itens com cache vencido = 1 GET /connections)", async () => {
  const cred = { ...CRED_CW, codewords_conferido_em: null };
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes(Array.from({ length: 10 }, (_, i) => itemFila({ id: i + 1, canal_id: K_A }))), nx_canal_credencial: () => ({ ...cred }),
    nx_cv_saida: () => ({ id: 9 }), nx_fila_concluir: () => ({ ok: true }), nx_codewords_situacao: () => ({}) }, fora: foraFalso() });
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch });
  assert.equal(r.enviado, 10);
  assert.equal(s.chamadas.filter(c => c.nome === "CW GET /connections").length, 1);
});

test("SV-007 mídia recebida presa em «baixando»: o cron da fila baixa de novo (trava por mensagem) e grava o path", async () => {
  const travas = new Map();
  const s = dbFalso({
    rpcs: { ...travasFalsas(travas), nx_midia_presas: ({ p_limite }) => { assert.equal(p_limite, 10); return [{ mensagem_id: 7001, canal_id: K_M, cliente_id: CLI_A, midia: { media_id: "M1", mime: "image/jpeg", estado: "baixando" } }]; },
      nx_canal_credencial: () => ({ token: "EAA" }), nx_wa_midia_ok: () => null },
    fora: foraFalso({ graph: (req, u) => (u.pathname.endsWith("/M1") ? resp({ url: "https://lookaside.fbsbx.com/m1", mime_type: "image/jpeg", file_size: 4 }) : null) }),
  });
  const f = (url, init) => (String(url).startsWith("https://lookaside") ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200 }) : s.fetch(url, init));
  const db = criarDb(ENV, f);
  const r = await midiasPresas(db, ENV, f, { agora: new Date("2026-10-13T12:00:00Z") });
  assert.deepEqual(r, { total: 1, ok: 1, falhou: 0 });
  const ok = s.de("nx_wa_midia_ok")[0].corpo;
  assert.equal(ok.p_mensagem, 7001); assert.match(ok.p_path, new RegExp(`^${CLI_A}/in/2026-10/[0-9a-f-]+\\.jpg$`)); assert.equal(ok.p_tamanho, 4);
  assert.deepEqual(await midiasPresas(db, ENV, f), { total: 0, ok: 0, falhou: 0 }, "a trava impede o mesmo download em dobro");
  const antigo = dbFalso({});
  assert.equal(await midiasPresas(criarDb(ENV, antigo.fetch), ENV, antigo.fetch), null, "banco sem a RPC: nada");
});

test("SV-045 + SV-046 aviso de automação: o mesmo texto 3× em 1 min = 1 envio; passou do teto do dia → nada sai e o painel avisa; rastro em nx_execucoes", async () => {
  const travas = new Map();
  let teto = true;
  const s = dbFalso({ rpcs: { ...travasFalsas(travas), nx_alerta_destinos: () => ({ destinos: ["5512999998888"] }), nx_notificar: () => 1,
    nx_taxa_usar: ({ p_chave, p_limite, p_janela_s }) => { assert.equal(p_chave, `alerta:${CLI_A}`); assert.deepEqual([p_limite, p_janela_s], [30, 86400]); return { ok: teto }; } },
    fora: foraFalso() });
  const cron = texto => enviar(new Request(`${FN}/nx-enviar`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify({ alerta: { cliente: CLI_A, texto } }) }), ENV, { fetch: s.fetch }).then(ler);
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push((await cron("Lead parado há 2 dias")).corpo.alerta);
  assert.deepEqual(rs.map(a => a.enviados), [1, 0, 0]); assert.equal(rs[1].pulado, "repetido");
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("GRAPH POST")).length, 1);
  const exec = s.de("POST nx_execucoes");
  assert.equal(exec.length, 1); assert.equal(exec[0].corpo.dados.resumo.alerta.enviados, 1);
  assert.ok(!JSON.stringify(exec[0].corpo.dados).includes("5512999998888"), "destino anonimizado");
  teto = false;
  const r = (await cron("Outro aviso")).corpo.alerta;
  assert.deepEqual([r.enviados, r.pulado], [0, "teto_do_dia"]);
  assert.equal(s.de("nx_notificar").length, 1);
  await cron("Mais um aviso");
  assert.equal(s.de("nx_notificar").length, 1, "um aviso de teto por dia");
});

/* ================================================================== codewords.js */
test("SV-025 resposta do CodeWords lida com teto de 1 MB: página de 5 MB vira envio AMBÍGUO, sem carregar tudo", async () => {
  let entregue = 0;
  const f = async () => new Response(new ReadableStream({ pull(c) { if (entregue >= 5 * 1024 * 1024) return c.close(); entregue += 64 * 1024; c.enqueue(new Uint8Array(64 * 1024)); } }, { highWaterMark: 0 }), { status: 200 });
  const r = await enviarTextoCodeWords({ ...CRED_CW }, TEL, "oi", { fetch: f });
  assert.equal(r.ok, false); assert.equal(r.ambigua, true);
  assert.ok(entregue <= MAX_RESPOSTA_CW + 2 * 64 * 1024, `leu ${entregue} bytes`);
});

test("SV-031 API do agente aceita o segredo no cabeçalho x-nx-canal (fora da URL); inválido → 401; ?ch= continua", async () => {
  const s = cenarioCW();
  const post = (url, cab = {}) => codewords(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...cab }, body: JSON.stringify({ event: "message.ack", ids: ["ID1"], ack: 2 }) }), ENV, { fetch: s.fetch });
  assert.equal((await post(`${FN}/nx-codewords`, { "x-nx-canal": SEG_A })).status, 200);
  assert.equal((await post(`${FN}/nx-codewords`, { "x-nx-canal": "b".repeat(64) })).status, 401);
  assert.equal((await post(`${FN}/nx-codewords`, { "x-nx-canal": "curto" })).status, 401);
  assert.equal((await post(`${FN}/nx-codewords?ch=${SEG_A}`)).status, 200);
});

test("SV-024 recibo do aparelho com vários ids: UMA chamada (nx_codewords_status_lote); banco sem ela → uma por id", async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `ID${i}`);
  const s = cenarioCW({ rpc: { nx_codewords_status_lote: ({ p_ids, p_status }) => ({ ok: true, n: p_ids.length, s: p_status }) } });
  const r = await ler(await codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", body: JSON.stringify({ event: "message.ack", ids, ack: 3 }) }), ENV, { fetch: s.fetch }));
  assert.equal(r.corpo.recibos, 20);
  assert.equal(s.de("nx_codewords_status_lote").length, 1); assert.equal(s.de("nx_codewords_status").length, 0);
  const antigo = cenarioCW();
  await codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", body: JSON.stringify({ event: "message.ack", ids: ["A1", "A2"], ack: 3 }) }), ENV, { fetch: antigo.fetch });
  assert.equal(antigo.de("nx_codewords_status").length, 2);
});

test("SV-021 + SV-030 sincronização do CodeWords: uma rodada por vez (trava) e rastro em nx_execucoes só quando houve trabalho", async () => {
  const travas = new Map();
  let liberar;
  const presa = new Promise(r => { liberar = r; });
  const s = cenarioCW({ travas, rpc: { nx_codewords_sync_alvos: async () => { await presa; return []; }, nx_codewords_vigia_alvos: () => [] } });
  const a = cronCW(s, { sincronizar: true });
  await new Promise(r => setTimeout(r, 20));
  const b = await ler(await cronCW(s, { sincronizar: true }));
  assert.equal(b.corpo.pulado, "já em execução");
  liberar();
  assert.equal((await ler(await a)).corpo.ok, true);
  assert.equal(s.de("nx_codewords_sync_alvos").length, 1, "só uma rodada consultou o aparelho");
  assert.equal(s.de("POST nx_execucoes").length, 0, "rodada vazia: sem rastro");
  assert.equal(travas.size, 0, "a trava é solta no fim");
  const s2 = cenarioCW({ rpc: { nx_codewords_vigia_alvos: () => [], nx_codewords_sync_alvos: () => [{ canal_id: K_A, cliente_id: CLI_A, conversa_id: 601, telefone: TEL }],
    nx_codewords_sync_gravar: () => ({ entradas: 2, saidas: 0, adotadas: 0, recentes: 0, leads: [] }), nx_codewords_decidir: () => ({ responder: false }) },
  cw: { mensagens: [{ id: "M1", content: "oi", is_from_me: false, timestamp: Date.now() / 1000 }] } });
  await cronCW(s2, { sincronizar: true });
  const exec = s2.de("POST nx_execucoes");
  assert.equal(exec.length, 1); assert.equal(exec[0].corpo.dados.tarefa, "nx-codewords"); assert.equal(exec[0].corpo.dados.resumo.sincronizacao.entradas, 2);
  assert.ok(!JSON.stringify(exec[0].corpo.dados).includes(TEL), "sem telefone no rastro");
});

test("SV-033 sincronização com TODAS as conversas falhando por aparelho desconectado grava o estado real do canal (o vigia age)", async () => {
  const s = cenarioCW({ rpc: { nx_codewords_vigia_alvos: () => [], nx_codewords_sync_alvos: () => [{ canal_id: K_A, cliente_id: CLI_A, conversa_id: 601, telefone: TEL }, { canal_id: K_A, cliente_id: CLI_A, conversa_id: 602, telefone: "5512977776666" }] },
    cw: { mensagens: () => resp({ error: "INVALID_WA_CLI" }, 400), lista: [{ phone_id: "dev-a-1", phone_number: NUM_A, status: "logged_out", service_path: "svc_ia/webhook" }] } });
  const r = await sincronizar(criarDb(ENV, s.fetch), { fetch: s.fetch });
  assert.equal(r.falhas, 2); assert.equal(r.reconferidos, 1);
  assert.ok(s.de("nx_codewords_situacao").some(c => c.corpo.p_dados.conectado === false), "nx_codewords_situacao com conectado:false");
});

test("SV-037 «mensagem recuperada sem resposta»: no máximo um aviso a cada 30 min por conversa", async () => {
  const travas = new Map();
  const s = cenarioCW({ travas, rpc: { nx_codewords_sync_alvos: () => [{ canal_id: K_A, cliente_id: CLI_A, conversa_id: 601, telefone: TEL }],
    nx_codewords_sync_gravar: () => ({ entradas: 1, saidas: 0, adotadas: 0, recentes: 0, leads: [] }), nx_codewords_decidir: () => ({ responder: true }) },
  cw: { mensagens: [{ id: "M1", content: "alô?", is_from_me: false, timestamp: Date.now() / 1000 }] } });
  const db = criarDb(ENV, s.fetch);
  for (let i = 0; i < 3; i++) await sincronizar(db, { fetch: s.fetch });
  assert.equal(s.de("nx_notificar").length, 1);
});

test("SV-017/018/019/038 vigia: número trocado avisa; pareamento abandonado não; envio sem prazo não prende; aviso que não saiu volta em ~1 h e o painel avisa", async () => {
  const agora = new Date("2026-10-13T12:00:00Z");
  const alvo = (o = {}) => ({ canal_id: K_A, cliente_id: CLI_A, conectado: false, conferido_em: iso(agora.getTime() - 25 * 60_000), caiu_em: iso(agora.getTime() - 15 * 60_000), codewords_aviso_em: null, ja_conectou: true, ...o });
  const rodar = async ({ alvos, lista, graph, prazoAvisoMs } = {}) => {
    const s = cenarioCW({ rpc: { nx_codewords_vigia_alvos: () => alvos || [alvo()] },
      tabelas: { nx_clientes: [{ nome: "Clínica Alfa", cfg: {} }] },
      cw: { lista: lista || [{ phone_id: "dev-a-1", phone_number: NUM_A, status: "logged_out", service_path: "svc_ia/webhook" }], graph } });
    const cfg = { wa_access_token: "wa-tok", wa_phone_number_id: "900900", wa_template: "nexus_aviso" };
    const r = await vigiarAparelhos(criarDb(ENV, s.fetch), cfg, { fetch: s.fetch, agora, prazoAvisoMs });
    return { s, r, zaps: s.chamadas.filter(c => c.nome.startsWith("GRAPH POST")), patches: s.de("PATCH nx_canais") };
  };
  // SV-038: nunca conectou → nada
  const abandonado = await rodar({ alvos: [alvo({ ja_conectou: false })] });
  assert.equal(abandonado.zaps.length, 0); assert.equal(abandonado.r.nunca_conectou, 1);
  // SV-017: número trocado (a conferência anterior já tinha visto) → aviso próprio
  const trocado = await rodar({ alvos: [alvo({ conectado: true, caiu_em: null, numero_conferido: false })],
    lista: [{ phone_id: "dev-a-1", phone_number: "+5512900000000", status: "logged_in", service_path: "svc_ia/webhook" }] });
  assert.equal(trocado.zaps.length, 1); assert.match(trocado.zaps[0].corpo.text.body, /WhatsApp com outro número/);
  // destino errado visto pela 2ª vez → aviso; visto agora pela 1ª vez → espera
  const listaDestino = [{ phone_id: "dev-a-1", phone_number: NUM_A, status: "logged_in", service_path: "https://outro.exemplo/hook" }];
  const destino = await rodar({ alvos: [alvo({ conectado: true, caiu_em: null, numero_conferido: true, inscricao: "externa: outro.exemplo" })], lista: listaDestino });
  assert.match(destino.zaps[0].corpo.text.body, /Mensagens indo para outro lugar/);
  assert.equal((await rodar({ alvos: [alvo({ conectado: true, caiu_em: null, inscricao: "svc_ia/webhook" })], lista: listaDestino })).zaps.length, 0);
  // SV-019: a Graph nunca responde → o aviso tem prazo próprio
  const t0 = Date.now();
  const preso = await rodar({ prazoAvisoMs: 40, graph: (req, u) => (u.pathname.endsWith("/messages") ? new Promise((_, rej) => req.signal.addEventListener("abort", () => rej(req.signal.reason))) : null) });
  assert.ok(Date.now() - t0 < 3000); assert.equal(preso.r.avisos, 0);
  // SV-018: nada saiu → aviso_em recuado para tentar em ~1 h + notificação no painel
  assert.equal(preso.r.avisos_falhos, 1);
  assert.equal(preso.patches.length, 2);
  assert.equal(preso.patches[1].corpo.dados.codewords_aviso_em, iso(agora.getTime() - 23 * HORA));
  const n = preso.s.de("nx_notificar")[0].corpo;
  assert.equal(n.p_cliente, CLI_A); assert.match(n.p_titulo, /WhatsApp desconectado/); assert.equal(n.p_link, "#/config/numeros");
});

/* ================================================================== ciclo.js / meta.js / google.js */
const COLS = {
  nx_config: "id cron_token codigo_gestor funcoes_url painel_url wa_access_token wa_phone_number_id wa_template wa_verify_token meta_app_secret anthropic_api_key modelo_ia google_api_versao meta_api_versao",
  nx_clientes: "id slug nome ativo status teste_ate cfg vertical wa_phone_number_id criado_em",
  nx_integracoes: "id cliente_id canal ativo cred ultimo_sync status",
  nx_metricas_dia: "cliente_id plataforma nivel data campanha_ext anuncio_ext campanha_nome anuncio_nome impressoes alcance frequencia cliques gasto conversoes valor_conversao atualizado_em",
  nx_leads: "id cliente_id telefone nome origem plataforma campanha_ext anuncio_ext ctwa_clid servico etapa data_conversa data_agenda data_consulta valor obs criado_em atualizado_em funil_id",
  nx_funis: "id cliente_id nome ordem padrao conta_no_ads ativo criado_em",
  nx_alertas: "id cliente_id chave regra severidade mensagem acao valor referencia criado_em enviado_em erro_envio wa_ids wa_ids_template entregue_em tentativas_envio",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro wa_ids wa_ids_template entregue_em enviando_em",
  nx_execucoes: "id tarefa inicio fim ok resumo",
  nx_travas: "nome ate dono",
};
const esquema = () => {
  const colunas = {};
  for (const [k, v] of Object.entries(COLS)) colunas[k] = new Set(v.split(" "));
  return { colunas, unicas: { nx_metricas_dia: ["cliente_id", "plataforma", "nivel", "data", "campanha_ext", "anuncio_ext"], nx_relatorios: ["cliente_id", "tipo", "referencia"], nx_travas: ["nome"] },
    padroes: { nx_alertas: { wa_ids: [], wa_ids_template: [], tentativas_envio: 0 }, nx_relatorios: { wa_ids: [], wa_ids_template: [] } },
    checks: { nx_alertas: { severidade: ["critico", "alerta", "info"] } }, naoNulos: { nx_travas: ["nome", "ate"] } };
};
const diasEntre = (de, ate) => { const out = []; for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
function cenarioCiclo({ agora = "2026-10-13T11:07:00Z", meta, waFalha, tabelas = {}, rpcExtra = {} } = {}) {
  const estado = { agora: new Date(agora), wa: [], meta: [], urls: [] };
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
    nx_trava_soltar: { args: ["p_nome", "p_dono"], fn({ p_nome, p_dono }) { const t = api.t; t.nx_travas = api.tab("nx_travas").filter(r => !(r.nome === p_nome && r.dono === p_dono)); return true; } },
    ...rpcExtra,
  }) });
  const fetch = async (entrada, init) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    if (u.origin === SUPA) return banco.responder(req);
    estado.urls.push(req.url);
    if (u.host === "graph.facebook.com" && u.pathname.endsWith("/messages")) {
      const corpo = JSON.parse(await req.text()); estado.wa.push(corpo);
      if (waFalha?.()) return resp({ error: { message: "falhou", code: 131000 } }, 500);
      return resp({ messages: [{ id: `wamid.${estado.wa.length}` }] });
    }
    if (u.host === "graph.facebook.com") {
      estado.meta.push({ auth: req.headers.get("authorization"), url: req.url, range: u.searchParams.get("time_range") ? JSON.parse(u.searchParams.get("time_range")) : null });
      if (meta) { const r = await meta(u, estado); if (r) return r; }
      if (!/insights$/.test(u.pathname)) return resp({ name: "Conta", timezone_name: "America/Sao_Paulo", currency: "BRL" });
      const { since, until } = JSON.parse(u.searchParams.get("time_range"));
      const nivel = u.searchParams.get("level");
      return resp({ data: diasEntre(since, until).map(d => ({ campaign_id: "C1", campaign_name: "Campanha", ...(nivel === "ad" ? { ad_id: "A1", ad_name: "Anúncio" } : {}), impressions: "100", reach: "70", frequency: "1.4", clicks: "2", spend: "10", date_start: d, date_stop: d })) });
    }
    throw new TypeError(`host inesperado ${u.host}`);
  };
  const cron = (fn, corpo = {}) => fn(new Request(`${FN}/x`, { method: "POST", headers: { "content-type": "application/json", "x-nx-cron": "cron-secreto" }, body: JSON.stringify(corpo) }), ENV, { fetch, agora: () => estado.agora, esperarRede: async () => {} }).then(ler);
  return { banco, estado, fetch, cron, tab: banco.tab };
}

test("SV-079 rodada diária (28 dias) sem depender das 03:07: às 05:07 UTC sem a trava do dia → diária; feita (sucesso) → a trava segura até amanhã", async () => {
  const s = cenarioCiclo({ agora: "2026-10-13T05:07:00Z" });
  let r = await s.cron(ciclo, {});
  assert.equal(r.corpo.diaria, true); assert.equal(r.corpo.janela, JANELA_SYNC_DIARIA);
  assert.equal(s.estado.meta.find(m => m.range).range.since, "2026-09-15");
  assert.ok(s.tab("nx_travas").some(t => t.nome === `nx-ciclo:diaria:${CLI_A}:2026-10-13`), "trava do dia gravada depois do sucesso");
  s.estado.meta.length = 0; s.estado.agora = new Date("2026-10-13T06:07:00Z");
  r = await s.cron(ciclo, {});
  assert.ok(!r.corpo.diaria); assert.equal(r.corpo.janela, 7);
  // falhou → a hora seguinte tenta de novo
  const f = cenarioCiclo({ agora: "2026-10-13T03:07:00Z", meta: () => resp({ error: { message: "Invalid OAuth access token", code: 190 } }, 400) });
  await f.cron(ciclo, {});
  assert.ok(!f.tab("nx_travas").some(t => t.nome.startsWith("nx-ciclo:diaria:")), "sync falhou: sem trava do dia");
  const tarde = cenarioCiclo({ agora: "2026-10-13T15:07:00Z" });
  assert.ok(!(await tarde.cron(ciclo, {})).corpo.diaria, "fora da janela (03–08 UTC): rodada comum");
});

test("SV-082 + SV-085 Meta: página que falha 1× com 500 é repetida (2 s) e o sync fecha; o token vai no cabeçalho, nunca na URL", async () => {
  let falhou = false;
  const s = cenarioCiclo({ meta: u => { if (/insights$/.test(u.pathname) && !falhou) { falhou = true; return resp({ error: { message: "Service temporarily unavailable", code: 2 } }, 500); } return null; } });
  const r = await s.cron(ciclo, {});
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo));
  assert.match(r.corpo.clientes[0].sync.meta, /^ok — /);
  assert.ok(s.estado.meta.every(m => m.auth === "Bearer EAAtokenA"));
  assert.ok(s.estado.urls.every(u => !u.includes("access_token=")), "nenhuma URL com access_token=");
  const esperas = [];
  const linhas = await buscarMeta({ meta_access_token: "EAAt", meta_ad_account_id: "act_1" }, "campanha", "2026-10-01", "2026-10-02", {
    fetch: async url => { if (esperas.length < 2) return resp({ error: { message: "limite", code: 17 } }, 400); return resp({ data: [], paging: { next: `${url}&after=x&access_token=VAZOU` } }); },
    esperar: async ms => { esperas.push(ms); } });
  assert.deepEqual(esperas, [2000, 8000]); assert.deepEqual(linhas, []);
  await assert.rejects(buscarMeta({ meta_access_token: "EAAt", meta_ad_account_id: "act_1" }, "campanha", "2026-10-01", "2026-10-02", {
    fetch: async () => resp({ error: { message: "limite", code: 17 } }, 400), esperar: async () => {} }), /código 17/, "depois de 2 retentativas, sobe");
});

test("SV-087 Meta «reduce the amount of data»: o período é dividido ao meio até caber e as linhas voltam completas", async () => {
  const pedidos = [];
  const fetch = async url => {
    const u = new URL(url);
    const { since, until } = JSON.parse(u.searchParams.get("time_range"));
    pedidos.push([since, until]);
    if (diasEntre(since, until).length > 7) return resp({ error: { message: "Please reduce the amount of data you're asking for, then retry your request", code: 1, error_subcode: 1487534 } }, 500);
    return resp({ data: diasEntre(since, until).map(d => ({ campaign_id: "C1", date_start: d, impressions: "1", spend: "1" })) });
  };
  const linhas = await buscarMeta({ meta_access_token: "EAAt", meta_ad_account_id: "act_1" }, "campanha", "2026-09-16", "2026-10-13", { fetch, esperar: async () => { throw new Error("não repete: divide"); } });
  assert.equal(linhas.length, 28);
  assert.deepEqual([...new Set(linhas.map(l => l.data))].length, 28, "dias completos, sem repetição");
  assert.ok(pedidos.filter(([a, b]) => diasEntre(a, b).length <= 7).length === 4, `4 pedidos de 7 dias (${JSON.stringify(pedidos)})`);
});

test("SV-082 Google: 503 passageiro é repetido; erro da conta (403) sobe na hora", async () => {
  let n = 0;
  const esperas = [];
  const f = async url => {
    if (String(url).includes("oauth2")) return resp({ access_token: "ya29.x", expires_in: 3600 });
    n++; return n === 1 ? resp([{ error: { status: "UNAVAILABLE", message: "tente de novo" } }], 503) : resp([{ results: [] }]);
  };
  const g = criarGoogle({ fetch: f, versao: "v23", esperar: async ms => { esperas.push(ms); } });
  const cred = { google_client_id: "c", google_client_secret: "s", google_refresh_token: "r", google_customer_id: "123", google_developer_token: "d" };
  assert.deepEqual(await g.buscar(cred, "campanha", "2026-10-01", "2026-10-02"), []);
  assert.deepEqual(esperas, [2000]);
  const g2 = criarGoogle({ fetch: async url => (String(url).includes("oauth2") ? resp({ access_token: "ya29.x" }) : resp([{ error: { status: "PERMISSION_DENIED", message: "sem acesso" } }], 403)), versao: "v23", esperar: async () => { throw new Error("não devia esperar"); } });
  await assert.rejects(g2.buscar(cred, "campanha", "2026-10-01", "2026-10-02"), /Google Ads 403/);
});

test("SV-089 chave do alerta de integração com a severidade: «instável» há 2 h não engole o «parou» de agora", async () => {
  const s = cenarioCiclo({ meta: () => resp({ error: { message: "Error validating access token: Session has expired", code: 190 } }, 400),
    tabelas: { nx_alertas: [{ id: 1, cliente_id: CLI_A, chave: "integracao|meta|instavel", regra: "integracao", severidade: "alerta", mensagem: "instável", acao: "x", valor: null,
      referencia: "2026-10-12", criado_em: "2026-10-13T09:07:00Z", enviado_em: "2026-10-13T09:07:00Z", erro_envio: null, wa_ids: [], wa_ids_template: [], entregue_em: null, tentativas_envio: 0 }] } });
  await s.cron(ciclo, {});
  const novos = s.tab("nx_alertas").filter(a => a.id !== 1);
  assert.deepEqual(novos.map(a => [a.chave, a.severidade]), [["integracao|meta|parou", "critico"]]);
  assert.equal(s.estado.wa.length, 1, "o crítico sai");
});

test("SV-084 alerta do radar que não saiu é reenviado na rodada seguinte (até 3 tentativas nas primeiras 6 h)", async () => {
  let falhar = true;
  const s = cenarioCiclo({ meta: () => resp({ error: { message: "Error validating access token", code: 190 } }, 400), waFalha: () => falhar });
  await s.cron(ciclo, {});
  const [al] = s.tab("nx_alertas");
  assert.equal(al.enviado_em, null); assert.ok(al.erro_envio);
  falhar = false;
  s.estado.agora = new Date("2026-10-13T12:07:00Z");
  const r = await s.cron(ciclo, {});
  assert.equal(r.corpo.clientes[0].alertas_reenviados, 1);
  assert.match(s.estado.wa.at(-1).text.body, /parou/);
  assert.equal(s.tab("nx_alertas")[0].tentativas_envio, 1); assert.ok(s.tab("nx_alertas")[0].enviado_em);
  s.estado.agora = new Date("2026-10-13T13:07:00Z");
  const r3 = await s.cron(ciclo, {});
  assert.ok(!r3.corpo.clientes[0].alertas_reenviados, "já saiu: não reenvia");
});

/* ================================================================== relatorio.js */
test("SV-091 relatório reservado antes de mandar: se o registro final falhar, a execução seguinte NÃO manda de novo (só com forcar)", async () => {
  const s = cenarioCiclo({ agora: "2026-10-13T11:00:00Z",
    tabelas: { nx_metricas_dia: diasEntre("2026-10-01", "2026-10-12").map(d => ({ cliente_id: CLI_A, plataforma: "meta", nivel: "campanha", data: d, campanha_ext: "C1", anuncio_ext: "", campanha_nome: "C", anuncio_nome: null,
      impressoes: 100, alcance: 70, frequencia: 1.4, cliques: 2, gasto: 10, conversoes: 1, valor_conversao: 0, atualizado_em: "2026-10-12T00:00:00Z" })) } });
  // o upsert final (com enviado_em) falha uma vez: banco piscou depois do envio
  const responder = s.banco.responder;
  let falhas = 1;
  s.banco.responder = async req => {
    if (req.method === "POST" && new URL(req.url).pathname.endsWith("/nx_relatorios") && falhas > 0) {
      const corpo = await req.clone().text();
      if (corpo.includes("enviado_em")) { falhas--; return resp({ message: "conexão perdida" }, 503); }
    }
    return responder(req);
  };
  const fetch = async (e, i) => { const req = new Request(e, i); return new URL(req.url).origin === SUPA ? s.banco.responder(req) : s.fetch(req); };
  const cron = corpo => relatorio(new Request(`${FN}/nx-relatorio`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify(corpo) }), ENV, { fetch, agora: () => s.estado.agora }).then(ler);
  const a = await cron({ tipo: "diario" });
  assert.equal(s.estado.wa.length, 1, "1º: enviou");
  assert.equal(a.corpo.ok, false, "o registro final falhou");
  assert.ok(s.tab("nx_relatorios")[0].enviando_em, "a reserva ficou");
  const b = await cron({ tipo: "diario" });
  assert.equal(s.estado.wa.length, 1, "2º: NÃO reenviou");
  assert.match(b.corpo.clientes[0].pulado, /sem confirmação/);
  await cron({ tipo: "diario", forcar: true });
  assert.equal(s.estado.wa.length, 2, "com forcar manda");
  assert.equal(s.tab("nx_relatorios")[0].enviando_em, null, "envio confirmado limpa a reserva");
});

/* ================================================================== scripts / CI / SDK */
test("SV-062 SDK da Anthropic com versão exata; montar-funcoes recusa import npm: sem versão", () => {
  const ia = readFileSync(resolve(RAIZ, "supabase/functions/_compartilhado/ia.js"), "utf8");
  assert.match(ia, /from "npm:@anthropic-ai\/sdk@\d+\.\d+\.\d+";/);
  const montar = readFileSync(resolve(RAIZ, "scripts/montar-funcoes.mjs"), "utf8");
  const linha = montar.split("\n").find(l => l.includes("matchAll") && l.includes("npm:"));
  const re = new RegExp(linha.match(/matchAll\((\/.*\/g)\)/)[1].slice(1, -2), "g");
  const versoes = s => [...s.matchAll(re)].map(x => x[2] || "");
  assert.deepEqual(versoes('import A from "npm:@anthropic-ai/sdk";'), [""]);
  assert.deepEqual(versoes('import A from "npm:@anthropic-ai/sdk@0.131.0";'), ["0.131.0"]);
  assert.deepEqual(versoes('import x from "npm:lodash@^4";'), ["^4"]);
  assert.match(montar, /sem versão exata/);
});

test("SV-172 simular-webhook: o segredo vem de NX_SEGREDO (assina igual); --segredo ainda funciona, com aviso", async () => {
  assert.deepEqual(segredoDe({}, { NX_SEGREDO: "s3" }), { segredo: "s3" });
  assert.match(segredoDe({ segredo: "s3" }, {}).aviso, /descontinuado/);
  const corpos = [];
  const f = async (url, init) => { corpos.push(init.headers["x-hub-signature-256"]); return new Response("{}", { status: 200 }); };
  await simular({ url: "https://x/nx-whatsapp", pid: "1", segredo: segredoDe({}, { NX_SEGREDO: "s3" }).segredo, agora: "2026-10-13T00:00:00Z", wamid: "wamid.X", "sem-anuncio": true }, f);
  await simular({ url: "https://x/nx-whatsapp", pid: "1", segredo: "s3", agora: "2026-10-13T00:00:00Z", wamid: "wamid.X", "sem-anuncio": true }, f);
  assert.equal(corpos[0], corpos[1]);
});

test("SV-212 varredura de segredos: acha chave real (só caminho e tipo) e ignora os dublês dos testes", () => {
  const aleatorio = n => Array.from({ length: n }, (_, i) => "AbCdEfGhJkMnPqRsTuVwXyZ23456789"[(i * 7 + 3) % 31]).join("");
  const real = "sk-" + "ant-api03-" + aleatorio(95);
  assert.deepEqual(varrerTexto(`const k = "${real}";`), [{ linha: 1, tipo: "chave da Anthropic" }]);
  assert.deepEqual(varrerTexto("EAA" + aleatorio(150)), [{ linha: 1, tipo: "token do Meta" }]);
  assert.deepEqual(varrerTexto('const CHAVE_IA = "sk-ant-api03-SEGREDO-DA-CHAVE-123456";\nconst c = "cwk-' + "k".repeat(40) + '";'), [], "dublês curtos ou repetidos não casam");
  const jwt = p => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(p)).toString("base64url")}.${aleatorio(43)}`;
  assert.deepEqual(varrerTexto(jwt({ role: "service_role", ref: "x" })).map(a => a.tipo), ["JWT service_role"]);
  assert.deepEqual(varrerTexto(jwt({ role: "anon", ref: "x" })), [], "chave anon é pública");
  assert.ok(PADROES.length >= 8);
  const ci = readFileSync(resolve(RAIZ, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /node scripts\/varrer-segredos\.mjs/);
});

test("SV-152 CI em todo PR e push: suíte, smokes PGlite, montagem, deno check, git diff --check — actions fixadas pelo SHA, só leitura", () => {
  const ci = readFileSync(resolve(RAIZ, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(ci, /^on:\n {2}pull_request:\n {2}push:\n {4}branches: \["main", "codex\/\*\*", "claude\/\*\*"\]/m);
  assert.match(ci, /^permissions:\n {2}contents: read\n/m);
  for (const passo of ["node testes/rodar-tudo.mjs", "node scripts/rodar-local.mjs", "node scripts/montar-funcoes.mjs", "deno@2.6.0 check --node-modules-dir=none supabase/dist/*/index.ts", "git diff --check", "npm ci"]) {
    assert.ok(ci.includes(passo), passo);
  }
  const usos = [...ci.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map(m => m[1].trim());
  for (const u of usos) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, u);
  assert.doesNotMatch(ci, /secrets\.|github\.event/, "nada de segredo nem de dado do evento");
  assert.match(ci, /persist-credentials: false/);
});

test("SV-204 DEPLOY-FUNCOES.md: procedimento do token vencido (renovar, rerun, sondas, registrar) e a tag desta rodada", () => {
  const doc = readFileSync(resolve(RAIZ, "docs/orbita/DEPLOY-FUNCOES.md"), "utf8");
  assert.match(doc, /Invalid access token/);
  assert.match(doc, /gh run rerun/);
  assert.match(doc, /funcoes-20261013/);
  assert.match(doc, /20261013a/); assert.match(doc, /20261013b/);
});

/* ==================================================================
   Lote srv-2 (13/10): relatório com IA na cota, prompts com teto/cache, ciclo, webhook, logs, versão, contratos
   ================================================================== */
const METRICAS_A = diasEntre("2026-10-01", "2026-10-12").map(d => ({ cliente_id: CLI_A, plataforma: "meta", nivel: "campanha", data: d, campanha_ext: "C1", anuncio_ext: "",
  campanha_nome: "C", anuncio_nome: null, impressoes: 100, alcance: 70, frequencia: 1.4, cliques: 2, gasto: 10, conversoes: 1, valor_conversao: 0, atualizado_em: "2026-10-12T00:00:00Z" }));
const CONFIG_IA = { id: 1, cron_token: "cron-secreto", codigo_gestor: "x", funcoes_url: FN, painel_url: null, wa_access_token: "wa-token", wa_phone_number_id: "900900", wa_template: null,
  wa_verify_token: "v", meta_app_secret: "s", anthropic_api_key: "sk-ant-teste", modelo_ia: null, google_api_versao: null, meta_api_versao: null };

test("SV-063 relatório com IA: reserva na cota (acao relatorio, sem conta) e fecha com os tokens; sem cota → relatório sai sem a leitura", async () => {
  const reservas = [], registros = [];
  const rpcExtra = recusa => ({
    nx_ia_reservar: { args: ["p_cliente", "p_conta", "p_acao"], fn(p) { reservas.push(p); return recusa ? { ok: false, erro: recusa } : { ok: true, reserva_id: "r-1" }; } },
    nx_ia_registrar_reserva: { args: ["p_reserva", "p_modelo", "p_in", "p_out", "p_ok", "p_custo_usd", "p_stop_reason", "p_ms"], fn(p) { registros.push(p); return { ok: true }; } },
  });
  const rodar = async (recusa, ia) => {
    const s = cenarioCiclo({ agora: "2026-10-13T11:00:00Z", tabelas: { nx_config: [CONFIG_IA], nx_metricas_dia: METRICAS_A }, rpcExtra: rpcExtra(recusa) });
    const r = await relatorio(new Request(`${FN}/nx-relatorio`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify({ tipo: "diario" }) }), ENV,
      { fetch: s.fetch, agora: () => s.estado.agora, ia }).then(ler);
    return { s, r };
  };
  let chamouIA = 0;
  const ia = async () => { chamouIA++; return { texto: "• Tudo estável.", modelo: "claude-opus-5-5", tokens_in: 900, tokens_out: 40, stop_reason: "end_turn", ms: 1200 }; };
  const a = await rodar(null, ia);
  assert.deepEqual(reservas[0], { p_cliente: CLI_A, p_conta: null, p_acao: "relatorio" });
  assert.equal(registros.length, 1);
  assert.equal(registros[0].p_reserva, "r-1"); assert.equal(registros[0].p_in, 900); assert.equal(registros[0].p_out, 40); assert.equal(registros[0].p_ok, true);
  assert.equal(registros[0].p_stop_reason, "end_turn"); assert.equal(registros[0].p_ms, 1200);
  assert.equal(a.s.tab("nx_relatorios")[0].leitura_ia, "• Tudo estável.");
  assert.equal(a.r.corpo.clientes[0].ia, "ok");
  const b = await rodar("ia_cota", ia);
  assert.equal(chamouIA, 1, "sem cota: a Anthropic nem é chamada");
  assert.equal(b.s.tab("nx_relatorios")[0].leitura_ia, null);
  assert.equal(b.r.corpo.clientes[0].ia_motivo, "ia_cota");
  assert.equal(b.s.estado.wa.length, 1, "o relatório sai mesmo assim");
  // banco antigo (sem a ação 'relatorio' ou sem a RPC): segue sem reserva, como antes
  assert.deepEqual(await reservarIA({ rpc: async () => ({ ok: false, erro: "dados_invalidos" }) }, CLI_A), {});
  assert.deepEqual(await reservarIA({ rpc: async () => { throw Object.assign(new Error("Could not find the function public.nx_ia_reservar"), { status: 404 }); } }, CLI_A), {});
  // a IA injetada que devolve só texto (versão antiga) continua valendo
  const c = await rodar(null, async () => "• Texto simples.");
  assert.equal(c.s.tab("nx_relatorios")[0].leitura_ia, "• Texto simples.");
});

test("SV-066 + SV-070 sugerir/resumir: instruções + conhecimento num bloco com cache (sem a marca); conversa longa cortada (as mais recentes ficam)", () => {
  const delim = "0123456789abcdef";
  const cx = { atendente_nome: "Ana", empresa: "Clínica", ia: { sobre: "Clínica de sorrisos", servicos: "Clareamento" },
    mensagens: Array.from({ length: 30 }, (_, i) => ({ dir: i % 2 ? "out" : "in", quem: "Ana", texto: `${i}:` + "x".repeat(4000), em: "2026-10-13T14:00:00Z" })) };
  const p = montarPrompt("sugerir", cx, delim);
  assert.equal(p.blocos.length, 2);
  assert.equal(p.blocos[0].cache, true); assert.match(p.blocos[0].texto, /CONHECIMENTO: Clínica de sorrisos/); assert.ok(!p.blocos[0].texto.includes(delim), "o bloco com cache não muda a cada chamada");
  assert.ok(!p.blocos[1].cache); assert.ok(p.blocos[1].texto.includes(delim));
  assert.ok(p.sistema.includes(delim) && p.sistema.includes("CONHECIMENTO"), "o system em texto continua completo");
  assert.ok(p.usuario.length < MAX_CONVERSA_PROMPT + 5000, `prompt com teto (${p.usuario.length}; antes ~120 mil)`);
  assert.match(p.usuario, /\[cortado\]/);
  assert.match(p.usuario, /"29:x/, "a mensagem mais recente fica"); assert.ok(!p.usuario.includes('"0:x'), "a mais antiga sai");
  const curto = cortarConversa([{ texto: "oi" }, { texto: "tudo bem?" }]);
  assert.deepEqual(curto, { mensagens: [{ texto: "oi" }, { texto: "tudo bem?" }], cortou: false, omitidas: 0 });
});

test("SV-069 decisão das automações com teto: negócio em 4 KB, mensagem em 1.000 e conversa em 12.000 caracteres (as mais recentes)", () => {
  const delim = "fedcba9876543210";
  const contexto = { contato_nome: "Mara", negocio: { campos: { grande: "y".repeat(20000) } }, etapas: [],
    mensagens: Array.from({ length: 40 }, (_, i) => ({ dir: "in", texto: `${i}:` + "z".repeat(3000), em: "2026-10-13T14:00:00Z" })) };
  const d = montarPromptDecisao({ tarefa: "resumir_nota", instrucao: "", contexto }, delim);
  const neg = d.usuario.split("\n").find(l => l.startsWith("NEGÓCIO: "));
  assert.ok(neg.length < MAX_NEGOCIO_DECISAO + 100, `negócio cortado (${neg.length})`); assert.match(neg, /\[cortado: negócio com dados demais\]/);
  assert.ok(d.usuario.length < MAX_CONVERSA_DECISAO + MAX_NEGOCIO_DECISAO + 2000, `contexto com teto (${d.usuario.length}; antes ~140 mil)`);
  assert.match(d.usuario, /"39:z/); assert.ok(!d.usuario.includes('"0:z'));
  assert.match(d.usuario, /\[cortado\] \(conversa longa/);
});

test("SV-077 + SV-274 decisões do motor: rastro em nx_execucoes quando houve trabalho; modelo_ia_automacao escolhe o modelo das decisões", async () => {
  let modeloUsado = null;
  const s = dbFalso({
    config: { anthropic_api_key: "sk-ant-k", modelo_ia: "claude-opus-5-5", modelo_ia_automacao: "claude-haiku-5-5" },
    rpcs: {
      nx_auto_ia_pegar: () => [{ id: 9, cliente_id: CLI_A, tarefa: "resumir_nota", instrucao: "", contexto: { mensagens: [{ dir: "in", texto: "quero clarear", em: "2026-10-13T14:00:00Z" }] } }],
      nx_ia_reservar: () => ({ ok: true, reserva_id: "r9" }), nx_ia_registrar_reserva: () => ({ ok: true }),
      nx_auto_ia_resolver: () => ({ ok: true }),
    },
  });
  const ia = async () => ({ estruturarClaude: async p => { modeloUsado = p.modelo; return { json: { texto: "Quer clareamento." }, modelo: p.modelo, tokens_in: 10, tokens_out: 5, stop_reason: "end_turn", ms: 3 }; } });
  const pedido = () => new Request(`${FN}/nx-ia`, { method: "POST", headers: { "content-type": "application/json", "x-nx-cron": "cron-secreto" }, body: JSON.stringify({ acao: "automacao_decidir" }) });
  const r = await nxIa(pedido(), ENV, { fetch: s.fetch, ia }).then(ler);
  assert.equal(r.corpo.aplicados, 1, JSON.stringify(r.corpo));
  assert.equal(modeloUsado, "claude-haiku-5-5");
  const ex = s.de("POST nx_execucoes");
  assert.equal(ex.length, 1);
  const linha = Array.isArray(ex[0].corpo.dados) ? ex[0].corpo.dados[0] : ex[0].corpo.dados;
  assert.equal(linha.tarefa, "nx-ia"); assert.equal(linha.resumo.processados, 1); assert.equal(linha.resumo.aplicados, 1);
  // sem pedido na fila: nada é registrado
  const vazio = dbFalso({ config: { anthropic_api_key: "k" }, rpcs: { nx_auto_ia_pegar: () => [] } });
  await nxIa(pedido(), ENV, { fetch: vazio.fetch, ia });
  assert.equal(vazio.de("POST nx_execucoes").length, 0);
});

test("SV-080 sync completo zera no banco o que a plataforma deixou de devolver (nunca com 0 linhas); SV-081 nomes numa chamada só", async () => {
  const zerar = [];
  const rpcExtra = { nx_metricas_zerar_ausentes: { args: ["p_cliente", "p_plataforma", "p_de", "p_ate", "p_chaves"], fn(p) { zerar.push(p); return 0; } } };
  const s = cenarioCiclo({ rpcExtra });
  await s.cron(ciclo, {});
  assert.equal(zerar.length, 1);
  assert.equal(zerar[0].p_plataforma, "meta"); assert.equal(zerar[0].p_ate, "2026-10-13");
  assert.ok(zerar[0].p_chaves.length > 0 && zerar[0].p_chaves.every(k => k.nivel && k.data && "campanha_ext" in k && "anuncio_ext" in k));
  const vazio = cenarioCiclo({ meta: u => (/insights$/.test(u.pathname) ? resp({ data: [] }) : null), rpcExtra });
  await vazio.cron(ciclo, {});
  assert.equal(zerar.length, 1, "0 linhas lidas: nada é zerado");
  assert.equal(await zerarAusentes({ rpc: async () => { throw Object.assign(new Error("Could not find the function public.nx_metricas_zerar_ausentes"), { status: 404 }); } },
    { id: CLI_A }, "meta", "2026-10-01", "2026-10-07", [{ nivel: "campanha", data: "2026-10-01", campanha_ext: "C" }]), null, "banco sem a RPC: nada");
  // SV-081
  const chamadas = [];
  const prontas = [{ plataforma: "meta", nivel: "campanha", campanha_ext: "C1", campanha_nome: "Nova", data: "2026-10-12" },
    { plataforma: "meta", nivel: "anuncio", campanha_ext: "C1", campanha_nome: "Nova", anuncio_ext: "A1", anuncio_nome: "Anúncio", data: "2026-10-12" }];
  const comRpc = { rpc: async (n, p) => { chamadas.push([n, p]); return 3; }, update: async () => { chamadas.push(["PATCH"]); return []; } };
  assert.equal(await renomearAntigos(comRpc, { id: CLI_A }, prontas, "2026-09-15"), 2);
  assert.deepEqual(chamadas.map(c => c[0]), ["nx_metricas_renomear"], "uma chamada (antes: um PATCH por campanha e por anúncio)");
  assert.deepEqual(chamadas[0][1].p_itens, [{ tipo: "campanha", plataforma: "meta", ext: "C1", nome: "Nova" }, { tipo: "anuncio", plataforma: "meta", ext: "A1", nome: "Anúncio" }]);
  chamadas.length = 0;
  const semRpc = { rpc: async () => { throw Object.assign(new Error("Could not find the function public.nx_metricas_renomear"), { status: 404 }); }, update: async () => { chamadas.push(["PATCH"]); return []; } };
  assert.equal(await renomearAntigos(semRpc, { id: CLI_A }, prontas, "2026-09-15"), 2);
  assert.deepEqual(chamadas.map(c => c[0]), ["PATCH", "PATCH"], "banco antigo: como antes");
});

test("SV-195 leitura parcial não avança ultimo_sync (vai para ultimo_sync_parcial); banco sem a coluna → como antes", async () => {
  const feitos = [];
  const db = semColuna => ({ update: async (t, f, d) => { if (semColuna && "ultimo_sync_parcial" in d) throw Object.assign(new Error("banco 400: Could not find the 'ultimo_sync_parcial' column"), { status: 400 }); feitos.push(d); return []; } });
  const ctx = { agora: new Date("2026-10-13T11:07:00Z") };
  await gravarSync(db(false), { id: 1 }, ctx, "parcial — teto", true);
  assert.deepEqual(feitos.pop(), { ultimo_sync_parcial: "2026-10-13T11:07:00.000Z", status: "parcial — teto" });
  await gravarSync(db(false), { id: 1 }, ctx, "ok — 3 linhas", false);
  assert.deepEqual(feitos.pop(), { ultimo_sync: "2026-10-13T11:07:00.000Z", status: "ok — 3 linhas" });
  await gravarSync(db(true), { id: 1 }, ctx, "parcial — teto", true);
  assert.deepEqual(feitos.pop(), { ultimo_sync: "2026-10-13T11:07:00.000Z", status: "parcial — teto" });
});

test("SV-094 db.select sem limit: teto de segurança (erro claro «consulta grande demais»); quem precisa passa {teto}", async () => {
  let paginas = 0;
  const f = async url => { paginas++; const off = Number(new URL(url).searchParams.get("offset")); return resp(Array.from({ length: 1000 }, (_, i) => ({ id: off + i }))); };
  const db = criarDb(ENV, f);
  await assert.rejects(db.select("nx_leads", { order: "id.asc" }, { teto: 3000 }), e => e.codigo === "consulta_grande" && /consulta grande demais em nx_leads/.test(e.message));
  assert.equal(paginas, 4, "para logo depois de passar do teto (antes: paginava para sempre)");
  assert.equal(TETO_SELECT, 50_000);
  const pouco = criarDb(ENV, async url => resp(Number(new URL(url).searchParams.get("offset")) ? [] : [{ id: 1 }]));
  assert.deepEqual(await pouco.select("nx_leads", {}), [{ id: 1 }]);
});

test("SV-106 log estruturado: uma linha JSON por evento, com o erro limpo (sem telefone nem token) e sem campos nulos", () => {
  const linhas = [];
  const orig = [console.error, console.log];
  console.error = (...a) => linhas.push(["erro", a.join(" ")]); console.log = (...a) => linhas.push(["info", a.join(" ")]);
  try {
    log("erro", "webhook_falha", { fn: "nx-whatsapp", cliente: CLI_A, codigo: null, erro: new Error("Key (telefone)=(5512988887777) já existe") });
    log("info", "x", { ms: 12 });
  } finally { [console.error, console.log] = orig; }
  const e = JSON.parse(linhas[0][1]);
  assert.equal(linhas[0][0], "erro");
  assert.deepEqual(Object.keys(e).sort(), ["cliente", "erro", "evento", "fn", "nivel"]);
  assert.ok(!e.erro.includes("5512988887777"), e.erro);
  assert.deepEqual(JSON.parse(linhas[1][1]), { nivel: "info", evento: "x", ms: 12 });
});

test("SV-193 «fora do horário» de várias mensagens da mesma requisição: a fila é chamada UMA vez com todos os itens", async () => {
  let n = 0;
  const s = dbFalso({ rpcs: rpcsWebhook({
    nx_wa_entrada: () => ({ mensagem_id: 7000 + ++n, conversa_id: 600 + n, contato_id: 500 + n, nova_conversa: false, duplicada: false, fila_id: 80 + n }),
    nx_fila_pegar: () => [],
  }) });
  const fundo = [];
  const r = await postMeta(s, eventoMeta({ messages: [textoMeta("oi"), textoMeta("tem horário?"), textoMeta("alô")] }), { emSegundoPlano: p => fundo.push(p) });
  assert.equal(r.status, 200);
  await Promise.all(fundo);
  const pegar = s.de("nx_fila_pegar");
  assert.equal(pegar.length, 1, `uma chamada (antes: ${n})`);
  assert.deepEqual(pegar[0].corpo.p_ids, [81, 82, 83]);
});

test("SV-009 + SV-011 + SV-015 webhook: token do canal só para host da Meta; recibo do futuro/antes de 2015 vale agora; chave ?c= com 24 hex", async () => {
  for (const [url, ok] of [["https://lookaside.fbsbx.com/x", true], ["https://mmg.whatsapp.net/y", true], ["https://scontent.xx.facebook.com/z", true],
    ["https://evil.example/fbsbx.com", false], ["http://lookaside.fbsbx.com/x", false], ["https://fbsbx.com.evil.io/x", false], ["lixo", false]]) {
    assert.equal(hostDeMidiaMeta(url), ok, url);
  }
  const fora = [];
  const s = dbFalso({ rpcs: { nx_canal_credencial: () => ({ token: "EAAsegredo" }), nx_wa_midia_ok: () => null },
    fora: foraFalso({ graph: (req, u) => (u.pathname.endsWith("/M9") ? resp({ url: "https://evil.example/m9", mime_type: "image/jpeg" }) : null) }) });
  const f = (url, init) => { if (String(url).startsWith("https://evil")) { fora.push(new Request(url, init).headers.get("authorization")); return resp({}); } return s.fetch(url, init); };
  const r = await baixarMidia(criarDb(ENV, f), { canal_id: K_M, cliente_id: CLI_A }, 7001, { media_id: "M9" }, { fetch: f, env: ENV });
  assert.deepEqual(r, { ok: false, erro: "url de mídia inesperada" });
  assert.equal(fora.length, 0, "o token nunca saiu para o host desconhecido");
  const agora = new Date("2026-10-13T12:00:00Z");
  assert.equal(quandoDo({ timestamp: String(Date.parse("2026-10-14T12:00:00Z") / 1000) }, agora), agora.toISOString(), "recibo de amanhã → agora");
  assert.equal(quandoDo({ timestamp: "1000" }, agora), agora.toISOString(), "antes de 2015 → agora");
  assert.equal(quandoDo({ timestamp: String(Date.parse("2026-10-13T11:59:00Z") / 1000) }, agora), "2026-10-13T11:59:00.000Z", "recibo normal fica com o horário dele");
  assert.equal(quandoDo({ timestamp: String(Date.parse("2026-10-13T12:00:30Z") / 1000) }, agora), "2026-10-13T12:00:30.000Z", "segundos à frente (relógio da Meta): folga de 2 min");
  assert.ok(CHAVE_OK.test("a".repeat(24))); assert.ok(!CHAVE_OK.test("abcdef12")); assert.ok(!CHAVE_OK.test("a".repeat(48)));
  const sem = dbFalso({ rpcs: { nx_wa_canal: () => { throw new Error("não devia consultar"); } } });
  const g = await webhook(new Request(`${FN}/nx-whatsapp?c=abcdef12&hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`), ENV, { fetch: sem.fetch });
  assert.notEqual(g.status, 200);
  assert.equal(sem.de("nx_wa_canal").length, 0, "chave curta nem consulta o banco");
});

test("SV-023 frase do botão na sincronização: telefone do lead e da conversa comparados por variantes (com/sem 55, com/sem o 9)", () => {
  assert.ok(mesmoTelefone(["5512988887777"], "12988887777"));
  assert.ok(mesmoTelefone(["551288887777"], "5512988887777"), "celular antigo sem o 9");
  assert.ok(!mesmoTelefone(["5512988880000"], "5512988887777"));
  assert.ok(!mesmoTelefone([], "5512988887777"));
});

test("SV-164 toda resposta leva x-orbita-versao; o montar-funcoes grava a versão (ORBITA_VERSAO) em cada função", () => {
  const r = comVersao(new Response("{}"), "funcoes-20261013-2+abc1234");
  assert.equal(r.headers.get(CAB_VERSAO), "funcoes-20261013-2+abc1234");
  const imutavel = comVersao(Response.redirect("https://x.example/", 302), "v1");
  assert.equal(imutavel.headers.get(CAB_VERSAO), "v1"); assert.equal(imutavel.status, 302);
  for (const fn of ["nx-ciclo", "nx-relatorio", "nx-whatsapp", "nx-enviar", "nx-midia", "nx-ia", "nx-codewords"]) {
    assert.match(readFileSync(resolve(RAIZ, `supabase/functions/${fn}/index.ts`), "utf8"), /Deno\.serve\(async \(req\) => comVersao\(await tratar\(/, fn);
  }
  const m = spawnSync(process.execPath, [resolve(RAIZ, "scripts/montar-funcoes.mjs")], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, ORBITA_VERSAO: "funcoes-teste+0000000" } });
  assert.equal(m.status, 0, m.stderr);
  assert.match(readFileSync(resolve(RAIZ, "supabase/dist/nx-ia/versao.js"), "utf8"), /export const VERSAO = "funcoes-teste\+0000000";/);
});

test("SV-232 aviso de operação à equipe: só com wa_equipe, só problema novo (6 h por tipo), uma conferência por rodada", async () => {
  const travas = new Map(); const enviados = [];
  const rpcs = travasFalsas(travas);
  let problemas = ["3 mensagens na fila atrasadas há mais de 30 min", "nx-ciclo sem execução boa há mais de 3 h"];
  const db = { rpc: async (n, p) => (n === "nx_saude_dados" ? { problemas } : rpcs[n](p)) };
  const fetch = async (url, init) => { enviados.push(JSON.parse(init.body)); return resp({ messages: [{ id: "wamid.s1" }] }); };
  const cfg = { wa_equipe: "5512999990000", wa_access_token: "t", wa_phone_number_id: "900900" };
  const r = await avisarSaude(db, cfg, { fetch, teste: false });
  assert.equal(r.avisados, 2); assert.equal(enviados.length, 1);
  assert.match(JSON.stringify(enviados[0]), /fila atrasadas/);
  assert.equal(await avisarSaude(db, cfg, { fetch, teste: false }), null, "a mesma rodada não confere de novo");
  travas.delete("nx-saude:rodada");
  problemas = ["5 mensagens na fila atrasadas há mais de 30 min"];
  const r2 = await avisarSaude(db, cfg, { fetch, teste: false });
  assert.equal(r2.avisados, 0, "o mesmo tipo (número diferente) não repete em 6 h"); assert.equal(enviados.length, 1);
  assert.equal(await avisarSaude(db, { ...cfg, wa_equipe: "" }, { fetch, teste: false }), null, "sem número da equipe: nada");
});

test("contratos srv-2: nomeCurto do núcleo, painelUrl do radar (saas_url) e largura/altura da mídia enviada", () => {
  assert.equal(nomeCurto({ nome: "Clínica Odontológica Sorriso Feliz" }), "Clínica Odontológica", "palavra inteira, sem reticências (nomeCurtoEmpresa)");
  assert.equal(nomeCurto({ nome: "X", cfg: { nomeCurto: "Kami" } }), "Kami");
  assert.equal(painelRadarUrl({ saas_url: "https://orbita.example/app/" }), "https://orbita.example/app/#/anuncios/radar");
  assert.equal(painelRadarUrl({ saas_url: "javascript:alert(1)" }), "");
  assert.equal(comPainelUrl({ id: 1, cfg: {} }, { saas_url: "https://o.example/" }).cfg.painelUrl, "https://o.example/#/anuncios/radar");
  assert.equal(comPainelUrl({ id: 1, cfg: { painelUrl: "https://meu/" } }, { saas_url: "https://o.example/" }).cfg.painelUrl, "https://meu/", "o do cliente vence");
  assert.deepEqual(dimensoesMidia({ largura: 1080, altura: 1350 }), { largura: 1080, altura: 1350 });
  assert.deepEqual(dimensoesMidia({ largura: 1080 }), {}); assert.deepEqual(dimensoesMidia({ largura: -1, altura: 2 }), {}); assert.deepEqual(dimensoesMidia({ largura: "1e9", altura: 2 }), {});
});

test("SV-093 relatório na virada do dia e do mês (relógio de São Paulo): 23:59 × 00:01 do dia 1º e o último dia do ano", async () => {
  const outubro = diasEntre("2026-10-01", "2026-10-31").map(d => ({ ...METRICAS_A[0], data: d }));
  const rodar = async (agora, tipo) => {
    const s = cenarioCiclo({ agora, tabelas: { nx_metricas_dia: outubro } });
    const r = await relatorio(new Request(`${FN}/nx-relatorio`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify({ tipo }) }), ENV,
      { fetch: s.fetch, agora: () => s.estado.agora }).then(ler);
    return r.corpo.clientes[0].referencia;
  };
  assert.equal(await rodar("2026-11-01T02:59:00Z", "diario"), "2026-10-30", "23:59 de 31/10 em SP: «ontem» é 30/10");
  assert.equal(await rodar("2026-11-01T03:01:00Z", "diario"), "2026-10-31", "00:01 de 01/11 em SP: «ontem» é 31/10");
  assert.equal(await rodar("2026-11-01T03:01:00Z", "mensal"), "2026-10-01", "dia 1º: o mensal fecha outubro");
  assert.equal(await rodar("2026-12-31T23:00:00Z", "diario"), "2026-12-30", "31/12 às 20h em SP: ainda 2026");
});

/* ==================================================================================================================
   Lote srv-3 (13/10/2026): um caso de comportamento por item SV-… (cada um falha no código anterior). O SQL novo
   (20261013e/f/g) é provado pelos smokes 30, 31 e 32 (PGlite: node scripts/rodar-local.mjs 30 31 32).
   ================================================================================================================== */
import { json as jsonResp, respostaPainel as respostaPainelSrv3, resumoComTeto, TETO_RESUMO, modeloIA, custoUsd, esquecerAvisosIA, MODELO_PADRAO,
  PRECOS_IA, COM_RESERVA, SEM_EFFORT, autenticarCron, auditar, codigoBanco } from "../supabase/functions/_compartilhado/comum.js";
import { dividirTexto, aplicarParametros, enviarParaTodos as enviarTodosSrv3, idsDoEnvio, infoMidia } from "../supabase/functions/_compartilhado/whatsapp.js";
import { PRAZO_VER_S, UPLOADS_POR_JANELA } from "../supabase/functions/_compartilhado/midia.js";
import { recuoIA } from "../supabase/functions/_compartilhado/ia_automacoes.js";
import { COLUNAS_IA, PRAZO_PAINEL_MS } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { provaSegredo, contaMeta } from "../supabase/functions/_compartilhado/meta.js";
import { LENTO_MS } from "../supabase/functions/_compartilhado/db.js";
import { confereSha256 } from "../supabase/functions/_compartilhado/conversas.js";
import { CANAL_CACHE_MS } from "../supabase/functions/_compartilhado/webhook.js";
import { tipoTaxa, esquecerCanalTipo, MAX_IDS_RECIBO, MAX_HISTORICO_CONTEXTO, montarContexto, TRAVA_TESTE_S, TRAVA_PAREAR_S } from "../supabase/functions/_compartilhado/codewords.js";
import { faxinaOrfaos, FILA_CANAIS_JUNTOS } from "../supabase/functions/_compartilhado/enviar.js";
import { avisarCustoIA, TESTE_INTERVALO_S } from "../supabase/functions/_compartilhado/ciclo.js";

/** console.<nivel> capturado durante fn (linhas como texto). */
async function capturarLog(nivel, fn) {
  const linhas = [], orig = console[nivel];
  console[nivel] = (...a) => linhas.push(a.map(String).join(" "));
  try { await fn(); } finally { console[nivel] = orig; }
  return linhas;
}
const painelCW = (s, corpo) => codewords(new Request(`${FN}/nx-codewords`, { method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" },
  body: JSON.stringify({ token: "tok", cliente: CLI_A, canal: K_A, ...corpo }) }), ENV, { fetch: s.fetch }).then(ler);
const rpcsPainelCW = (extra = {}, travas = new Map()) => rpcsAgente({ nx_fn_ctx: () => ({ conta_id: "c-adm", org_id: "o-1", papel: "admin" }), nx_exigir_modulo: () => null,
  nx_auditar: () => null, nx_canal_credencial: () => ({ ...CRED_CW }), ...extra }, travas);

/* ------------------------------------------------------------------ comum.js */
test("SV-099 limparErro: chave do Google (AIza…), token do Supabase (sbp_…), app secret em texto e «apikey:» saem mascarados", () => {
  const s = limparErro(`Google: key AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv rejeitada; sbp_0123456789abcdef0123456789abcdef; app secret 0123456789abcdef0123456789abcdef; apikey: sb_publishable_zzzzzzzzzz`);
  assert.doesNotMatch(s, /AIzaSyA1b2C3|sbp_0123456789abcdef0|0123456789abcdef0123456789abcdef|sb_publishable_zzz/);
  assert.match(s, /AIza\*\*\*/); assert.match(s, /sbp_\*\*\*/); assert.match(s, /secret \*\*\*/); assert.match(s, /apikey: \*\*\*/);
});

test("SV-104 statusDoCodigo: limites de taxa → 429 (antes 400); cliente_pausado → 403", () => {
  for (const c of ["limite_taxa", "muitas_tentativas", "muitos_pedidos", "aguarde"]) assert.equal(statusDoCodigo(c), 429, c);
  assert.equal(statusDoCodigo("cliente_pausado"), 403);
  assert.equal(statusDoCodigo("dados_invalidos"), 400);
});

test("SV-257 respostas JSON das funções com cache-control: no-store e x-content-type-options: nosniff (painel e cron)", () => {
  for (const r of [jsonResp({ ok: true }), respostaPainelSrv3({ ok: true })]) {
    assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  }
});

test("SV-101 resumo de nx_execucoes com teto de 64 KB: 200 clientes cabem com contagens e o detalhe só dos que falharam", () => {
  const clientes = Array.from({ length: 200 }, (_, i) => ({ cliente: `c${i}`, ok: i % 50 !== 0, sync: { meta: "x".repeat(400) }, envio: Array(5).fill({ destino: "***1234", ok: true }) }));
  const r = resumoComTeto({ hoje: "2026-10-13", clientes });
  assert.ok(new TextEncoder().encode(JSON.stringify(r)).length <= TETO_RESUMO);
  assert.equal(r.cortado, true); assert.equal(r.clientes_total, 200); assert.equal(r.clientes_ok, 196); assert.equal(r.clientes_falhos.length, 4);
  assert.equal(r.hoje, "2026-10-13");
  const pequeno = { hoje: "x", clientes: [{ ok: true }] };
  assert.equal(resumoComTeto(pequeno), pequeno, "o que cabe passa inteiro");
});

test("SV-072/SV-073/SV-076 modelo de IA: desconhecido cai no padrão (1 aviso por isolate); modelo sem preço avisa; tabelas consistentes", async () => {
  esquecerAvisosIA();
  const avisos = await capturarLog("warn", async () => {
    assert.equal(modeloIA("gpt-4"), MODELO_PADRAO);
    assert.equal(modeloIA("gpt-4"), MODELO_PADRAO);
    assert.equal(modeloIA("claude-sonnet-5-5"), "claude-sonnet-5-5");
    assert.equal(modeloIA("", null), MODELO_PADRAO);
    assert.equal(modeloIA("claude-inexistente-9", "claude-haiku-5-5"), "claude-haiku-5-5", "o 2º candidato vale quando o 1º é desconhecido");
    assert.equal(custoUsd("claude-novo-9", 1, 1), null);
    custoUsd("claude-novo-9", 1, 1);
  });
  assert.equal(avisos.filter(l => /ia_modelo_desconhecido/.test(l) && /gpt-4/.test(l)).length, 1, "um aviso só por modelo");
  assert.equal(avisos.filter(l => /ia_modelo_sem_preco/.test(l)).length, 1);
  // SV-076: o padrão tem preço e aceita effort; todo modelo com reserva tem preço
  assert.ok(Object.keys(PRECOS_IA).some(k => MODELO_PADRAO.startsWith(k)));
  assert.ok(!SEM_EFFORT.test(MODELO_PADRAO));
  for (const m of COM_RESERVA) assert.ok(Object.keys(PRECOS_IA).some(k => m.startsWith(k)), m);
});

test("SV-102 autenticarCron: token errado lê SÓ o cron_token (nenhum segredo em memória); certo lê o resto depois", async () => {
  const s = dbFalso();
  const req = tok => new Request(`${FN}/x`, { method: "POST", headers: { "x-nx-cron": tok } });
  await assert.rejects(autenticarCron(req("errado"), criarDb(ENV, s.fetch)), /não autorizado/);
  assert.deepEqual(s.de("GET nx_config").map(c => c.corpo.select), ["cron_token"]);
  const s2 = dbFalso();
  const cfg = await autenticarCron(req("cron-secreto"), criarDb(ENV, s2.fetch), ["wa_access_token"]);
  assert.deepEqual(s2.de("GET nx_config").map(c => c.corpo.select), ["cron_token", "wa_access_token"]);
  assert.equal(cfg.wa_access_token, "wa-tok");
});

test("SV-230 auditar: ação de plataforma vira nx_auditar com a conta e a org do ctx; banco sem a RPC não derruba", async () => {
  const s = dbFalso({ rpcs: { nx_auditar: () => null } });
  assert.equal(await auditar(criarDb(ENV, s.fetch), { conta_id: "c1", org_id: "o1" }, CLI_A, "codewords_parear", { canal: K_A }), true);
  assert.deepEqual(s.de("nx_auditar")[0].corpo, { p_org: "o1", p_cliente: CLI_A, p_conta: "c1", p_acao: "codewords_parear", p_dados: { canal: K_A } });
  assert.equal(await auditar(criarDb(ENV, dbFalso().fetch), { conta_id: "c1" }, CLI_A, "x"), false);
});

/* ------------------------------------------------------------------ nx-ia */
function cenarioIA({ texto = "Resumo pronto", cache = null, falhaSdk = null, modelo = null } = {}) {
  const pedidos = [];
  const s = dbFalso({ config: { anthropic_api_key: "sk-ant-teste", modelo_ia: modelo }, rpcs: {
    nx_fn_ctx: () => ({ conta_id: "c-at", papel: "atendente" }),
    nx_ia_contexto: () => ({ empresa: "Clínica", mensagens: [{ dir: "in", quem: "cliente", texto: "oi", em: "2026-10-13T12:00:00Z" }] }),
    nx_ia_reservar: () => ({ ok: true, reserva_id: "res-1" }), nx_ia_registrar_reserva: () => ({ ok: true }),
    ...(cache ? { nx_ia_cache_ler: () => cache.get("x") ?? null, nx_ia_cache_gravar: ({ p_texto }) => { cache.set("x", p_texto); return null; } } : {}),
  } });
  const ia = async () => ({ perguntarClaude: async o => { pedidos.push(o); if (falhaSdk) throw falhaSdk; return { texto, modelo: o.modelo, tokens_in: 10, tokens_out: 5, ms: 3 }; } });
  const pedir = acao => nxIa(new Request(`${FN}/nx-ia`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, conversa: 601, acao }) }), ENV, { fetch: s.fetch, ia }).then(ler);
  return { s, pedidos, pedir };
}

test("SV-065/SV-203/SV-073 sugerir: nx_config só com anthropic_api_key,modelo_ia; 30 s sem retentativa; modelo desconhecido → padrão", async () => {
  const c = cenarioIA({ modelo: "gpt-4" });
  const r = await c.pedir("sugerir");
  assert.equal(r.corpo.ok, true);
  assert.equal(c.s.de("GET nx_config")[0].corpo.select, COLUNAS_IA.join(","));
  assert.equal(c.pedidos[0].timeoutMs, PRAZO_PAINEL_MS); assert.equal(PRAZO_PAINEL_MS, 30_000); assert.equal(c.pedidos[0].retentativas, 0);
  assert.equal(c.pedidos[0].modelo, MODELO_PADRAO);
});

test("SV-068 texto sugerido cortado sem partir emoji (4.095 caracteres + emoji → bem formado)", async () => {
  const c = cenarioIA({ texto: `${"a".repeat(4095)}😀fim` });
  const r = await c.pedir("sugerir");
  assert.equal(r.corpo.texto.length, 4095); assert.ok(r.corpo.texto.isWellFormed());
});

test("SV-075 linha de log da IA leva o id da reserva (cruza com nx_ia_uso)", async () => {
  const c = cenarioIA();
  const linhas = await capturarLog("log", () => c.pedir("sugerir"));
  const ia = linhas.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(x => x && x.ia);
  assert.equal(ia.reserva, "res-1");
});

test("SV-067 «Resumir» de novo sem mensagem nova: 1 chamada ao SDK (a 2ª volta do cache, sem reservar cota); sugerir nunca usa cache", async () => {
  const cache = new Map();
  const c = cenarioIA({ cache });
  const r1 = await c.pedir("resumir"), r2 = await c.pedir("resumir");
  assert.equal(c.pedidos.length, 1); assert.equal(r2.corpo.cache, true); assert.equal(r2.corpo.texto, r1.corpo.texto);
  assert.equal(c.s.de("nx_ia_reservar").length, 1, "o resumo do cache não reserva cota");
  await c.pedir("sugerir"); await c.pedir("sugerir");
  assert.equal(c.pedidos.length, 3);
  // a chave muda com o histórico: mensagem nova → nova chamada
  const ch = c.s.de("nx_ia_cache_ler").map(x => x.corpo.p_chave);
  assert.match(ch[0], /^resumir:601:[0-9a-f]{16}$/);
});

test("SV-074 recuo crescente das decisões de IA: 120 × 2^(tentativas−1), no máximo 1 h", () => {
  assert.equal(recuoIA(1), 120); assert.equal(recuoIA(2), 240); assert.equal(recuoIA(3), 480); assert.equal(recuoIA(6), 3600); assert.equal(recuoIA(40), 3600);
  assert.equal(recuoIA(undefined), 120, "sem a contagem (banco antigo): como antes");
});

/* ------------------------------------------------------------------ nx-midia */
function cenarioMidia(rpc = {}) {
  return dbFalso({ rpcs: { nx_fn_ctx: () => ({ conta_id: "c-adm", org_id: "o1", papel: "admin" }), nx_exigir_modulo: () => null, nx_auditar: () => null, ...rpc }, fora: foraFalso({
    storage: async (req, u) => (req.method === "DELETE" ? resp([]) : /object\/upload\/sign/.test(u.pathname) ? resp({ url: "/object/upload/sign/nx-midia/x?token=up" }) : null) }) });
}
const pedirMidia = (s, corpo) => midia(new Request(`${FN}/nx-midia`, { method: "POST", body: JSON.stringify({ token: "t", cliente: CLI_A, ...corpo }) }), ENV, { fetch: s.fetch }).then(ler);

test("SV-057 apagar mídia pelo painel: depois do Storage, nx_midia_apagada com os paths (a bolha fica «apagada») e auditoria", async () => {
  const p = `${CLI_A}/out/2026-10/x.jpg`;
  const s = cenarioMidia({ nx_midia_apagada: ({ p_paths }) => p_paths.length });
  const r = await pedirMidia(s, { acao: "apagar", paths: [p, p] });
  assert.equal(r.corpo.ok, true); assert.equal(r.corpo.mensagens, 1);
  assert.deepEqual(s.de("nx_midia_apagada")[0].corpo, { p_cliente: CLI_A, p_paths: [p] });
  assert.equal(s.de("nx_auditar")[0].corpo.p_acao, "midia_apagada");
  const antigo = cenarioMidia();
  assert.equal((await pedirMidia(antigo, { acao: "apagar", paths: [p] })).corpo.ok, true, "banco sem a RPC: como antes");
});

test("SV-060 uploads por conta: o 61º em 10 min → 429 limite_taxa (nx_taxa_usar midia:<conta>); banco sem a RPC segue", async () => {
  let n = 0;
  const s = cenarioMidia({ nx_taxa_usar: ({ p_chave, p_limite, p_janela_s }) => { n++; assert.equal(p_chave, "midia:c-adm"); return { ok: n <= p_limite, n, j: p_janela_s }; } });
  for (let i = 0; i < UPLOADS_POR_JANELA; i++) assert.equal((await pedirMidia(s, { acao: "subir", mime: "image/jpeg", tamanho: 1000 })).status, 200);
  const r = await pedirMidia(s, { acao: "subir", mime: "image/jpeg", tamanho: 1000 });
  assert.equal(r.status, 429); assert.equal(r.corpo.erro, "limite_taxa");
  assert.equal(s.de("nx_taxa_usar")[0].corpo.p_janela_s, 600);
  assert.equal((await pedirMidia(cenarioMidia(), { acao: "subir", mime: "image/jpeg", tamanho: 1000 })).status, 200);
});

test("SV-220 «ver» assina por 10 min (600 s); o envio continua com 1 h para a Graph buscar", async () => {
  const p = `${CLI_A}/in/2026-10/a.jpg`;
  let pedido = null;
  const s = dbFalso({ rpcs: { nx_fn_ctx: () => ({ conta_id: "c", papel: "leitura" }), nx_exigir_modulo: () => null }, fora: foraFalso({
    storage: async (req, u) => { if (/object\/sign\/nx-midia$/.test(u.pathname)) { pedido = JSON.parse(await req.clone().text()); } return null; } }) });
  await pedirMidia(s, { acao: "ver", paths: [p] });
  assert.equal(pedido.expiresIn, PRAZO_VER_S); assert.equal(PRAZO_VER_S, 600);
});

/* ------------------------------------------------------------------ whatsapp.js */
test("SV-054 relatório longo em várias mensagens (cortes em quebra de linha), todas com wamid; texto curto = 1", async () => {
  const linhas = Array.from({ length: 120 }, (_, i) => `Linha ${i} ${"x".repeat(40)}`).join("\n");
  const blocos = dividirTexto(linhas, 4000);
  assert.ok(blocos.length === 2 && blocos.every(b => b.length <= 4000) && blocos[0].endsWith("x"), "corta na quebra de linha");
  assert.equal(blocos.join("\n"), linhas);
  const enviados = [];
  const fetch = async (u, init) => { enviados.push(JSON.parse(init.body)); return resp({ messages: [{ id: `wamid.${enviados.length}` }] }); };
  const cfg = { wa_access_token: "t", wa_phone_number_id: "1" };
  const envio = await enviarTodosSrv3(cfg, ["5512911112222"], "y".repeat(6000), { fetch });
  assert.equal(enviados.length, 2);
  assert.deepEqual(idsDoEnvio(envio).wa_ids, ["wamid.1", "wamid.2"]);
  assert.deepEqual(dividirTexto("curto"), ["curto"]);
});

test("SV-210 corpo gravado do modelo = o que saiu: parâmetros sem quebra de linha nem espaços repetidos (e vazio → «-»)", () => {
  assert.equal(aplicarParametros("Olá {{1}}, até {{2}}!", ["a\n\nb", ""]), "Olá a b, até -!");
});

/* ------------------------------------------------------------------ meta.js / google.js / db.js */
test("SV-083 appsecret_proof = HMAC-SHA256(token, segredo do app) na Graph de anúncios quando a integração tem meta_app_secret", async () => {
  const esperado = createHmac("sha256", "segredo-app").update("EAAtok").digest("hex");
  assert.equal(await provaSegredo("EAAtok", "segredo-app"), esperado);
  assert.equal(await provaSegredo("EAAtok", null), null);
  const urls = [];
  const fetch = async url => { urls.push(String(url)); return resp(/insights/.test(url) ? { data: [] } : { name: "C", timezone_name: "America/Sao_Paulo", currency: "BRL" }); };
  await buscarMeta({ meta_access_token: "EAAtok", meta_ad_account_id: "act_1", meta_app_secret: "segredo-app" }, "campanha", "2026-10-01", "2026-10-01", { fetch, esperar: async () => {} });
  await contaMeta({ meta_access_token: "EAAtok", meta_ad_account_id: "act_1", meta_app_secret: "segredo-app" }, { fetch });
  assert.ok(urls.length === 2 && urls.every(u => new URL(u).searchParams.get("appsecret_proof") === esperado));
  urls.length = 0;
  await buscarMeta({ meta_access_token: "EAAtok", meta_ad_account_id: "act_1" }, "campanha", "2026-10-01", "2026-10-01", { fetch, esperar: async () => {} });
  assert.equal(new URL(urls[0]).searchParams.get("appsecret_proof"), null, "sem segredo da integração: sem prova (o segredo de outro app quebraria tudo)");
});

test("SV-223 token do Google: 503 e depois 200 no OAuth → sync segue (1 retentativa depois de 1 s); invalid_grant não repete", async () => {
  const chamadas = [], esperas = [];
  let oauth = 0;
  const fetch = async (url) => {
    chamadas.push(String(url));
    if (/oauth2/.test(url)) { oauth++; return oauth === 1 ? resp({ error: "x" }, 503) : resp({ access_token: "ya29.ok", expires_in: 3600 }); }
    return resp([{ results: [] }]);
  };
  const g = criarGoogle({ fetch, esperar: async ms => { esperas.push(ms); } });
  const cred = { google_client_id: "id", google_client_secret: "s", google_refresh_token: "r", google_customer_id: "123", google_developer_token: "d" };
  await g.buscar(cred, "campanha", "2026-10-01", "2026-10-01");
  assert.equal(oauth, 2); assert.ok(esperas.includes(1000));
  let ruim = 0;
  const g2 = criarGoogle({ fetch: async () => { ruim++; return resp({ error: "invalid_grant" }, 400); }, esperar: async () => {} });
  await assert.rejects(g2.buscar(cred, "campanha", "2026-10-01", "2026-10-01"), /invalid_grant/);
  assert.equal(ruim, 1);
});

test("SV-105 consulta ao PostgREST acima de 2 s vira UMA linha de log «banco_lento» (só o caminho, sem parâmetros)", async () => {
  const s = dbFalso({ rpcs: { nx_lenta: () => ({ ok: true }) }, atraso: LENTO_MS + 100 });
  const linhas = await capturarLog("warn", () => criarDb(ENV, s.fetch).rpc("nx_lenta", { p_segredo: "nao-aparece" }));
  const l = linhas.map(x => JSON.parse(x)).find(x => x.evento === "banco_lento");
  assert.ok(l && l.lento && l.ms >= LENTO_MS && l.caminho === "rpc/nx_lenta");
  assert.doesNotMatch(linhas.join(" "), /nao-aparece/);
});

/* ------------------------------------------------------------------ nx-whatsapp */
test("SV-004 canal em cache no isolate: 5 POSTs do mesmo número → 1 nx_wa_canal; depois de 5 min (relógio injetado) → nova consulta", async () => {
  const s = dbFalso({ rpcs: rpcsWebhook() });
  let agora = Date.parse("2026-10-13T12:00:00Z");
  for (let i = 0; i < 5; i++) assert.equal((await postMeta(s, eventoMeta({ messages: [textoMeta(`oi ${i}`)] }), { agora: () => new Date(agora) })).status, 200);
  assert.equal(s.de("nx_wa_canal").length, 1);
  agora += CANAL_CACHE_MS + 1000;
  await postMeta(s, eventoMeta({ messages: [textoMeta("depois")] }), { agora: () => new Date(agora) });
  assert.equal(s.de("nx_wa_canal").length, 2);
});

test("SV-006 qualidade do número (phone_number_quality_update) → nx_canal_qualidade com WABA, número e detalhe; banco sem a RPC → ignorado", async () => {
  const s = dbFalso({ rpcs: rpcsWebhook({ nx_canal_qualidade: () => ({ ok: true, canais: 1, avisados: 1 }) }) });
  const r = await ler(await postMeta(s, eventoMeta({ field: "phone_number_quality_update", value: { display_phone_number: "15550001111", event: "FLAGGED", current_limit: "TIER_1K" } })));
  assert.equal(r.status, 200); assert.equal(r.corpo.eventos_numero, 1);
  assert.deepEqual(s.de("nx_canal_qualidade")[0].corpo, { p_waba: "102938475610", p_numero: "15550001111", p_tipo: "qualidade", p_evento: "FLAGGED", p_detalhe: "limite TIER_1K" });
  const antigo = dbFalso({ rpcs: rpcsWebhook() });
  const r2 = await ler(await postMeta(antigo, eventoMeta({ field: "account_update", value: { phone_number: "1", event: "ACCOUNT_VIOLATION" } })));
  assert.equal(r2.status, 200); assert.equal(r2.corpo.eventos_ignorados, 1);
});

test("SV-012 contadores do dia por número: 1 chamada nx_canal_contar por canal com mensagens/duplicadas; falha do contador não muda o status", async () => {
  let n = 0;
  const s = dbFalso({ rpcs: rpcsWebhook({ nx_wa_entrada: () => (++n === 3 ? { duplicada: true } : { mensagem_id: 7000 + n, conversa_id: 601, contato_id: 501, nova_conversa: false }),
    nx_canal_contar: () => { throw new Error("contador quebrado"); } }) });
  const r = await postMeta(s, eventoMeta({ messages: [textoMeta("a"), textoMeta("b"), textoMeta("c")] }));
  assert.equal(r.status, 200);
  const c = s.de("nx_canal_contar");
  assert.equal(c.length, 1); assert.deepEqual(c[0].corpo, { p_canal: K_M, p_cont: { mensagens: 2, duplicadas: 1 } });
});

test("SV-013 caminho antigo (número sem nx_canais): linha de log estruturada {caminho:'antigo', n} e contagem na resposta", async () => {
  const s = dbFalso({ rpcs: { nx_wa_canal: () => null, nx_lead_webhook: () => "criado" }, tabelas: { nx_clientes: [{ id: CLI_A, slug: "a" }] } });
  const linhas = await capturarLog("log", async () => {
    const r = await ler(await postMeta(s, eventoMeta({ pid: "777", messages: [textoMeta("oi")] })));
    assert.equal(r.corpo.caminho_antigo, 1);
  });
  assert.ok(linhas.some(l => /"evento":"webhook_caminho_antigo"/.test(l) && /"caminho":"antigo"/.test(l) && /"n":1/.test(l)));
});

test("SV-010 mídia recebida conferida: SHA-256 certo (hex ou base64) → ok; errado → falha «corrompido»; sem sha256 → ok", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const hex = createHmac ? (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex") : "";
  const b64 = Buffer.from(hex, "hex").toString("base64");
  assert.equal(await confereSha256(bytes, hex), true);
  assert.equal(await confereSha256(bytes, b64), true);
  assert.equal(await confereSha256(bytes, "0".repeat(64)), false);
  assert.equal(await confereSha256(bytes, null), true);
  assert.equal(await confereSha256(bytes, "formato-desconhecido"), true);
  // baixarMidia de verdade: a Graph manda um sha256 que não bate → nx_wa_midia_ok com o erro
  const s = dbFalso({ rpcs: { nx_canal_credencial: () => ({ token: "EAAt", phone_number_id: "111" }), nx_wa_midia_ok: () => null }, fora: foraFalso({
    graph: async (req, u) => (u.pathname.endsWith("/MID1") ? resp({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg", file_size: 4, sha256: "0".repeat(64) }) : null) }) });
  const fetch = async (e, i) => (String(e).startsWith("https://lookaside.fbsbx.com") ? new Response(bytes, { headers: { "content-length": "4" } }) : s.fetch(e, i));
  const r = await baixarMidia(criarDb(ENV, s.fetch), { canal_id: K_M, cliente_id: CLI_A }, 9, { media_id: "MID1" }, { env: ENV, fetch, redeMidia: fetch, agora: new Date() });
  assert.equal(r.ok, false); assert.match(r.erro, /corrompido/);
  assert.match(s.de("nx_wa_midia_ok")[0].corpo.p_erro, /corrompido/);
});

/* ------------------------------------------------------------------ nx-codewords */
test("SV-268/SV-208 agente: o tipo da chamada vai ao banco (mensagem × outro) e cliente suspenso grava sem a IA responder", async () => {
  esquecerCanalTipo();
  assert.equal(tipoTaxa({ event: "message.ack", ids: ["A"], ack: 3 }), "outro");
  assert.equal(tipoTaxa({ acao: "contexto", telefone: TEL }), "outro");
  assert.equal(tipoTaxa({ acao: "mensagem", direcao: "entrada", telefone: TEL, texto: "oi", message_id: "M1", timestamp: "2026-10-13T12:00:00Z" }), "mensagem");
  const s = cenarioCW({ rpc: {
    nx_codewords_canal: ({ p_chave, p_tipo }) => (p_chave === SEG_A ? { canal_id: K_A, cliente_id: CLI_A, numero: NUM_A, rota: "fluxo", ia_ligada: true, excedido: false, tipo: p_tipo, suspenso: true } : null),
    nx_wa_entrada: () => ({ mensagem_id: 9001, conversa_id: 601, contato_id: 501, nova_conversa: false }), nx_lead_webhook: () => "existente",
    nx_codewords_decidir: () => ({ responder: true, dados: {} }),
  } });
  const r = await ler(await codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", body: JSON.stringify({ acao: "mensagem", direcao: "entrada", telefone: TEL, texto: "oi",
    message_id: "M-susp-1", timestamp: "2026-10-13T12:00:00Z" }) }), ENV, { fetch: s.fetch }));
  assert.equal(r.corpo.responder, false); assert.equal(r.corpo.motivo, "suspenso"); assert.equal(r.corpo.registrada, true);
  assert.equal(s.de("nx_codewords_canal")[0].corpo.p_tipo, "mensagem");
});

test("SV-241 recibo com 40 ids (e até 200): todos marcados, em lotes de 50; acima de 200 contados em «ignorados»", async () => {
  const s = cenarioCW({ rpc: { nx_codewords_status_lote: ({ p_ids }) => ({ ok: true, n: p_ids.length }) } });
  const post = ids => codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", body: JSON.stringify({ event: "message.ack", ids, ack: 3 }) }), ENV, { fetch: s.fetch }).then(ler);
  assert.equal((await post(Array.from({ length: 40 }, (_, i) => `ID${i}`))).corpo.recibos, 40);
  const r = await post(Array.from({ length: 230 }, (_, i) => `IX${i}`));
  assert.equal(r.corpo.recibos, MAX_IDS_RECIBO); assert.equal(r.corpo.ignorados, 30);
  assert.deepEqual(s.de("nx_codewords_status_lote").map(c => c.corpo.p_ids.length), [40, 50, 50, 50, 50]);
});

test("SV-036 contexto ao fluxo: telefone só com o fim e histórico ≤ 8.000 caracteres (ficam as mais recentes)", () => {
  const historico = Array.from({ length: 20 }, (_, i) => ({ dir: i % 2 ? "out" : "in", texto: `${i}:${"x".repeat(1400)}`, em: "2026-10-13T12:00:00Z" }));
  const c = montarContexto({ agora: "2026-10-13T12:00:00Z", contato: { nome: "Ana", telefone: TEL }, historico });
  assert.equal(c.contato.telefone, `${"*".repeat(TEL.length - 4)}${TEL.slice(-4)}`);
  const total = c.historico.reduce((n, h) => n + h.texto.length, 0);
  assert.ok(total <= MAX_HISTORICO_CONTEXTO, String(total));
  assert.match(c.historico.at(-1).texto, /^19:/, "a mais recente fica");
});

test("SV-029 uma tradução só do erro do banco: codewords.js não tem cópia de codigoBanco", () => {
  const src = readFileSync(resolve(RAIZ, "supabase/functions/_compartilhado/codewords.js"), "utf8");
  assert.match(src, /const codigoDoBanco = codigoBanco;/);
  assert.doesNotMatch(src, /const codigoDoBanco = e =>/);
  assert.equal(codigoBanco(Object.assign(new Error("banco 400 em rpc/x: dados_invalidos"), { status: 400 })), "dados_invalidos");
});

test("SV-034 lead do agente com o relógio injetado: 23:59 em São Paulo de 30/10 → p_hoje = 2026-10-30", async () => {
  const s = cenarioCW({ rpc: { nx_wa_entrada: () => ({ mensagem_id: 9002, conversa_id: 601, contato_id: 501, nova_conversa: true }), nx_lead_webhook: () => "criado",
    nx_codewords_decidir: () => ({ responder: false, motivo: "pausada" }) } });
  await codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", body: JSON.stringify({ acao: "mensagem", direcao: "entrada", telefone: TEL, texto: "oi",
    message_id: "M-hoje-1", timestamp: "2026-10-31T02:59:00Z" }) }), ENV, { fetch: s.fetch, agoraMs: () => Date.parse("2026-10-31T02:59:00Z") });
  assert.equal(s.de("nx_lead_webhook")[0].corpo.p_hoje, "2026-10-30");
});

test("SV-027/SV-028/SV-230 painel do aparelho: «Enviar teste» 1×/30 s e «Parear» 1×/90 s por canal; ações auditadas", async () => {
  const travas = new Map();
  const s = cenarioCW({ rpc: rpcsPainelCW({}, travas), cw: { envioCW: () => resp({ code: "SUCCESS", results: { message_id: "3EB0T", status: "sent" } }) } });
  s.fetch.__falso = true;
  const t1 = await painelCW(s, { acao: "enviar_teste" }), t2 = await painelCW(s, { acao: "enviar_teste" });
  assert.equal(t1.corpo.ok, true); assert.deepEqual(t2.corpo, { ok: false, erro: "aguarde" });
  assert.equal(s.chamadas.filter(c => c.nome.startsWith("CW POST /proxy/send/")).length, 1, "um envio só");
  assert.equal(travas.get(`nx-codewords:teste:${K_A}`).ate - Date.now() <= TRAVA_TESTE_S * 1000, true);
  assert.equal(s.de("nx_auditar")[0].corpo.p_acao, "codewords_enviar_teste");
  // parear: 2 cliques → 1 POST /connections
  const s2 = cenarioCW({ rpc: rpcsPainelCW({}, new Map()), cw: {} });
  const fetchP = async (e, i) => { const u = new URL(new Request(e, i).url); if (u.host === "runtime.codewords.ai" && i?.method === "POST" && u.pathname.endsWith("/connections")) { s2.chamadas.push({ nome: "CW POST /connections" }); return resp({ pair_code: "ABCD-1234", phone_id: "dev-a-2" }); } return s2.fetch(e, i); };
  const par = c => codewords(new Request(`${FN}/nx-codewords`, { method: "POST", body: JSON.stringify({ token: "tok", cliente: CLI_A, canal: K_A, acao: "parear" }) }), ENV, { fetch: fetchP }).then(ler);
  const [a, b] = await Promise.all([par(), par()]);
  assert.equal([a, b].filter(x => x.corpo.ok).length, 1); assert.equal([a, b].filter(x => x.corpo.erro === "aguarde").length, 1);
  assert.equal(s2.chamadas.filter(c => c.nome === "CW POST /connections").length, 1);
  assert.ok(TRAVA_PAREAR_S === 90);
});

test("SV-035 vigia confere até 3 canais ao mesmo tempo: 6 canais com /connections de 300 ms → < 1,5 s (antes ~1,8 s em série)", async () => {
  const alvos = Array.from({ length: 6 }, (_, i) => ({ canal_id: `${K_A.slice(0, -1)}${i}`, cliente_id: CLI_A, conectado: true, conferido_em: null, codewords_aviso_em: null, ja_conectou: true }));
  const s = cenarioCW({ rpc: { nx_codewords_vigia_alvos: () => alvos }, cw: { lista: async () => { await new Promise(r => setTimeout(r, 300)); return resp([{ phone_id: "dev-a-1", phone_number: NUM_A, status: "logged_in", service_path: "svc_ia/webhook" }]); } } });
  const t0 = Date.now();
  const r = await vigiarAparelhos(criarDb(ENV, s.fetch), {}, { fetch: s.fetch, agora: new Date() });
  assert.equal(r.canais, 6); assert.ok(Date.now() - t0 < 1500, String(Date.now() - t0));
});

test("SV-020 o aparelho voltou depois de um aviso de queda (últimas 48 h): «WhatsApp reconectado» 1× ao gestor, por trava — aviso_em fica (freio de 24 h)", async () => {
  const agora = new Date("2026-10-13T12:00:00Z");
  const avisoEm = iso(agora.getTime() - 20 * HORA);
  const s = cenarioCW({ rpc: { ...travasFalsas(), nx_codewords_vigia_alvos: () => [{ canal_id: K_A, cliente_id: CLI_A, conectado: false, conferido_em: null, codewords_aviso_em: avisoEm, ja_conectou: true }] },
    tabelas: { nx_clientes: [{ nome: "Clínica Alfa", cfg: {} }] } });
  const cfg = { wa_access_token: "wa-tok", wa_phone_number_id: "900900" };
  const r = await vigiarAparelhos(criarDb(ENV, s.fetch), cfg, { fetch: s.fetch, agora });
  const r2 = await vigiarAparelhos(criarDb(ENV, s.fetch), cfg, { fetch: s.fetch, agora: new Date(agora.getTime() + 20 * 60e3) });
  const zaps = s.chamadas.filter(c => c.nome.startsWith("GRAPH POST"));
  assert.equal(r.voltas, 1); assert.equal(r2.voltas || 0, 0, "a 2ª rodada não repete a volta");
  assert.equal(zaps.length, 1); assert.match(zaps[0].corpo.text.body, /WhatsApp reconectado/);
  assert.ok(!s.de("PATCH nx_canais").some(p => p.corpo.dados.codewords_aviso_em === null), "revisão 13/10: limpar aviso_em desligava o freio de 24 h");
});

/* ------------------------------------------------------------------ nx-enviar */
test("SV-043 fila: 3 canais diferentes em paralelo (até 3), ordem mantida dentro do canal", async () => {
  const canais = ["aaaaaaaa-0000-4000-8000-0000000000c1", "aaaaaaaa-0000-4000-8000-0000000000c2", "aaaaaaaa-0000-4000-8000-0000000000c3"];
  const itens = Array.from({ length: 9 }, (_, i) => itemFila({ id: i + 1, canal_id: canais[i % 3], texto: `m${i}` }));
  const ordem = [];
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes(itens), nx_canal_credencial: ({ p_canal }) => ({ ...credMeta, canal_id: p_canal }), nx_cv_saida: ({ p_msg }) => ({ id: 1, ...p_msg }), nx_fila_concluir: () => true },
    fora: foraFalso({ graph: async (req, u, x) => { if (u.pathname.endsWith("/messages")) { ordem.push(x.corpo.text.body); await new Promise(r => setTimeout(r, 150)); } return null; } }) });
  const t0 = Date.now();
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch });
  assert.equal(r.enviado, 9); assert.ok(Date.now() - t0 < 900, `${Date.now() - t0} ms (em série seriam ≥ 1.350)`);
  assert.equal(FILA_CANAIS_JUNTOS, 3);
  for (const c of [0, 1, 2]) { const doCanal = ordem.filter(t => Number(t.slice(1)) % 3 === c); assert.deepEqual(doCanal, [...doCanal].sort()); }
});

test("SV-264 item sem conversa com contato e número: a conversa do contato é achada/aberta e o envio segue", async () => {
  const s = dbFalso({ rpcs: { nx_fila_pegar: lotes([itemFila({ conversa_id: null, conversa: null, contato_id: 501 })]), nx_canal_credencial: () => ({ ...credMeta }),
    nx_auto_abrir_conversa: () => 777, nx_cv_saida: ({ p_conversa, p_msg }) => ({ id: 1, conversa_id: p_conversa, ...p_msg }), nx_fila_concluir: () => true }, fora: foraFalso() });
  const r = await enviarFila(criarDb(ENV, s.fetch), {}, { fetch: s.fetch });
  assert.equal(r.enviado, 1);
  assert.deepEqual(s.de("nx_auto_abrir_conversa")[0].corpo, { p_cliente: CLI_A, p_contato: 501, p_canal: K_M, p_negocio: null, p_auto_nome: "Fila de envio" });
  assert.equal(s.de("nx_cv_saida")[0].corpo.p_conversa, 777);
});

test("SV-049 «Reenviar» foto e modelo: a v2 devolve tipo/mídia/modelo e o envio usa o MESMO path / parâmetros; banco sem a v2 → só texto", async () => {
  const path = `${CLI_A}/out/2026-10/f.jpg`;
  const s = cenarioEnviar({ rpc: { nx_cv_msg_reenvio_v2: () => ({ conversa_id: 601, tipo: "imagem", corpo: "legenda", midia: { path, mime: "image/jpeg", tamanho: 1000 } }) } });
  const r = await ler(await painelEnviar(s, { acao: "reenviar", mensagem: 55, client_ref: "ref-novo-1" }));
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo));
  const g = s.chamadas.find(c => c.nome.startsWith("GRAPH POST") && c.corpo.type === "image");
  assert.ok(g && g.corpo.image.link.includes(path)); assert.equal(g.corpo.image.caption, "legenda");
  const t = cenarioEnviar({ rpc: { nx_cv_msg_reenvio_v2: () => ({ conversa_id: 601, tipo: "template", template: { id: "11111111-2222-4333-8444-555555555555", parametros: ["Ana"] } }),
    nx_template_ver: () => ({ id: "11111111-2222-4333-8444-555555555555", nome: "boas", idioma: "pt_BR", corpo: "Oi {{1}}", num_parametros: 1, categoria: "UTILITY" }) } });
  const rt = await ler(await painelEnviar(t, { acao: "reenviar", mensagem: 56, client_ref: "ref-novo-2" }));
  assert.equal(rt.corpo.ok, true, JSON.stringify(rt.corpo));
  assert.equal(t.chamadas.find(c => c.nome.startsWith("GRAPH POST")).corpo.template.components[0].parameters[0].text, "Ana");
  const antigo = cenarioEnviar({ rpc: { nx_cv_msg_reenvio: () => ({ conversa_id: 601, corpo: "texto antigo" }) } });
  assert.equal((await ler(await painelEnviar(antigo, { acao: "reenviar", mensagem: 57 }))).corpo.ok, true);
  assert.equal(antigo.chamadas.find(c => c.nome.startsWith("GRAPH POST")).corpo.text.body, "texto antigo");
});

test("SV-056 faxina dos uploads nunca usados: 3 órfãos (> 7 dias) e 1 referenciado → 3 apagados; recentes ficam; 1×/dia", async () => {
  const agora = new Date("2026-10-13T12:00:00Z");
  const velho = iso(agora.getTime() - 10 * 86400e3), novo = iso(agora.getTime() - 86400e3);
  const apagados = [], travas = new Map();
  const s = dbFalso({ rpcs: { ...travasFalsas(travas), nx_midia_referenciadas: ({ p_paths }) => p_paths.filter(p => p.endsWith("usado.jpg")) }, fora: foraFalso({
    storage: async (req, u) => {
      if (req.method === "DELETE") { apagados.push(...JSON.parse(await req.text()).prefixes); return resp([]); }
      if (/object\/list\/nx-midia/.test(u.pathname)) {
        const { prefix } = JSON.parse(await req.text());
        if (prefix === "") return resp([{ name: CLI_A, id: null }, { name: "lixo", id: null }]);
        if (prefix === `${CLI_A}/out/2026-10`) return resp([
          { name: "a.jpg", id: "1", created_at: velho }, { name: "b.jpg", id: "2", created_at: velho }, { name: "c.pdf", id: "3", created_at: velho },
          { name: "usado.jpg", id: "4", created_at: velho }, { name: "recente.jpg", id: "5", created_at: novo }]);
        return resp([]);
      }
      return null;
    } }) });
  const r = await faxinaOrfaos(criarDb(ENV, s.fetch), ENV, s.fetch, agora);
  assert.equal(r.apagados, 3);
  assert.deepEqual(apagados.sort(), [`${CLI_A}/out/2026-10/a.jpg`, `${CLI_A}/out/2026-10/b.jpg`, `${CLI_A}/out/2026-10/c.pdf`]);
  assert.equal(await faxinaOrfaos(criarDb(ENV, s.fetch), ENV, s.fetch, agora), null, "uma vez por dia");
});

/* ------------------------------------------------------------------ nx-ciclo */
test("SV-086/SV-090 Meta e Google do mesmo cliente em paralelo (cliente em ~1 espera, não 2) e ms por integração no resumo", async () => {
  const s = cenarioCiclo({ tabelas: { nx_integracoes: [
    { id: 1, cliente_id: CLI_A, canal: "meta", ativo: true, cred: { meta_access_token: "EAAtokenA", meta_ad_account_id: "act_999" }, ultimo_sync: null, status: null },
    { id: 2, cliente_id: CLI_A, canal: "google", ativo: true, cred: { google_client_id: "i", google_client_secret: "s", google_refresh_token: "r", google_customer_id: "1", google_developer_token: "d" }, ultimo_sync: null, status: null }] },
    meta: async () => { await new Promise(r => setTimeout(r, 400)); return null; } });
  const fetchOrig = s.fetch;
  const fetch = async (e, i) => {
    const u = new URL(new Request(e, i).url);
    if (u.host === "oauth2.googleapis.com") return resp({ access_token: "ya29.x", expires_in: 3600 });
    if (u.host === "googleads.googleapis.com") { await new Promise(r => setTimeout(r, 400)); return resp([{ results: [] }]); }
    return fetchOrig(e, i);
  };
  const t0 = Date.now();
  const r = await ciclo(new Request(`${FN}/x`, { method: "POST", headers: { "x-nx-cron": "cron-secreto" }, body: JSON.stringify({ dias: 1 }) }), ENV, { fetch, agora: () => s.estado.agora, esperarRede: async () => {} }).then(ler);
  const c = r.corpo.clientes[0];
  assert.ok(Date.now() - t0 < 1400, `${Date.now() - t0} ms`);
  assert.ok(Number.isFinite(c.ms.meta) && Number.isFinite(c.ms.google) && Number.isFinite(c.ms.total), JSON.stringify(c.ms));
});

test("SV-095 dedupe do radar com ordem estável: a consulta das chaves das últimas 24 h vai com order=id.asc", () => {
  const src = readFileSync(resolve(RAIZ, "supabase/functions/_compartilhado/ciclo.js"), "utf8");
  assert.match(src, /criado_em: `gte\.\$\{desde\}`, select: "chave", order: "id\.asc" \}\)/);
});

test("SV-071 custo de IA alto: uso de US$ 30 ontem com teto 10 → 1 aviso à equipe (1×/dia); sem wa_equipe → nada", async () => {
  const travas = new Map(), enviados = [];
  const rpcs = travasFalsas(travas);
  const db = { rpc: async (n, p) => (n === "nx_ia_custo_alto" ? [{ cliente_id: CLI_A, nome: "Clínica Alfa", custo_usd: 30, chamadas: 120, p }] : rpcs[n](p)) };
  const fetch = async (url, init) => { enviados.push(JSON.parse(init.body)); return resp({ messages: [{ id: "wamid.c1" }] }); };
  const cfg = { wa_equipe: "5512999990000", wa_access_token: "t", wa_phone_number_id: "900900", ia_aviso_custo_usd: null };
  const r = await avisarCustoIA(db, cfg, { fetch, teste: false, hoje: "2026-10-13" });
  assert.equal(r.clientes, 1); assert.equal(enviados.length, 1); assert.match(enviados[0].text.body, /Clínica Alfa: US\$ 30\.00/);
  assert.equal(await avisarCustoIA(db, cfg, { fetch, teste: false, hoje: "2026-10-13" }), null, "uma vez por dia");
  assert.equal(await avisarCustoIA(db, { ...cfg, wa_equipe: "" }, { fetch, teste: false, hoje: "2026-10-14" }), null);
});

test("SV-088/SV-230 «Testar conexão» 1×/60 s por cliente: a repetição não sincroniza de novo; o teste é auditado", async () => {
  const travas = new Map(); let syncs = 0;
  const s = dbFalso({ rpcs: { ...travasFalsas(travas), nx_fn_ctx: () => ({ conta_id: "c-adm", org_id: "o1", papel: "admin" }), nx_exigir_modulo: () => null, nx_auditar: () => null },
    tabelas: { nx_clientes: [{ id: CLI_A, slug: "a", nome: "A", ativo: true, cfg: {} }], nx_integracoes: () => { syncs++; return resp([]); }, nx_execucoes: [] } });
  const testar = () => ciclo(new Request(`${FN}/nx-ciclo`, { method: "POST", headers: { apikey: "sb_publishable_x", "content-type": "application/json" }, body: JSON.stringify({ token: "t", cliente: CLI_A, dias: 1 }) }), ENV, { fetch: s.fetch }).then(ler);
  const r1 = await testar(), r2 = await testar();
  assert.equal(r1.corpo.ok, true); assert.equal(syncs, 1, "a 2ª chamada em 60 s não sincroniza");
  assert.ok(r2.status === 429 || r2.corpo.repetido === true, JSON.stringify(r2.corpo));
  assert.equal(TESTE_INTERVALO_S, 60);
  assert.equal(s.de("nx_auditar")[0].corpo.p_acao, "integracao_testar");
});
