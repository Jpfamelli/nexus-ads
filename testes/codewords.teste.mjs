/* ÓRBITA — contrato do adaptador CodeWords (sem chamadas externas ou credenciais reais). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codewordsWamid, enviarTextoCodeWords, testarCodeWords,
  tratarCodeWords, variantesCodeWords,
} from "../supabase/functions/_compartilhado/codewords.js";

const ENV = { url: "https://fake.supabase.co", chave: "service-role-falsa" };
const CANAL = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CHAVE_HOOK = "a".repeat(64);
const CRED = { canal_id: CANAL, codewords_api_key: "cwk-" + "x".repeat(32), codewords_service_id: "workflow-demo" };
const resposta = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

function fetchBanco(impl = {}) {
  const chamadas = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(input), nome = url.pathname.split("/").at(-1);
    const corpo = init.body ? JSON.parse(init.body) : null;
    chamadas.push({ url, init, nome, corpo });
    if (url.host !== "fake.supabase.co") throw new Error("host inesperado");
    if (nome === "nx_metricas_dia") return resposta(impl.metricas || []);
    if (!nome.startsWith("nx_")) throw new Error("endpoint inesperado");
    if (nome === "nx_codewords_canal") {
      return resposta(corpo.p_chave === CHAVE_HOOK
        ? { canal_id: CANAL, cliente_id: CLIENTE, status: "ativo" } : null);
    }
    if (impl.rpc?.[nome]) return resposta(await impl.rpc[nome](corpo));
    throw new Error(`RPC inesperada: ${nome}`);
  };
  return { fetch, chamadas };
}

test("telefone e wamid são normalizados e únicos por canal/direção", () => {
  assert.deepEqual(variantesCodeWords("+55 (12) 98765-4321"), ["5512987654321", "12987654321", "1287654321", "551287654321"]);
  assert.equal(codewordsWamid(CANAL, "in", "msg-1"), `cw:${CANAL}:in:msg-1`);
  assert.notEqual(codewordsWamid(CANAL, "in", "msg-1"), codewordsWamid(CANAL, "out", "msg-1"));
  assert.ok(codewordsWamid(CANAL, "out", "x".repeat(220)).length <= 256);
});

test("envio usa Runtime API, API key Bearer somente no servidor e client_ref estável", async () => {
  let chamada;
  const result = await enviarTextoCodeWords(CRED, "+55 12 99999-0000", " Olá ", {
    clientRef: "orbita:teste-1", conversationId: 42, fetch: async (url, init) => {
      chamada = { url, init, body: JSON.parse(init.body) };
      return resposta({ ok: true, message_id: "provider-123", status: "sent" });
    },
  });
  assert.equal(chamada.url, "https://runtime.codewords.ai/run/workflow-demo");
  assert.equal(chamada.init.headers.Authorization, `Bearer ${CRED.codewords_api_key}`);
  assert.deepEqual(chamada.body, {
    event: "orbita.send_message", to: "5512999990000", text: "Olá",
    client_ref: "orbita:teste-1", conversation_id: "42",
  });
  assert.equal(result.ok, true);
  assert.equal(result.wamid, `cw:${CANAL}:out:provider-123`);

  let rede = 0;
  const invalid = await enviarTextoCodeWords(CRED, "1", "", { fetch: async () => { rede++; } });
  assert.equal(invalid.ok, false);
  assert.equal(rede, 0);
});

test("envio não grava sucesso falso sem message_id e redige API key de erros", async () => {
  const semId = await enviarTextoCodeWords(CRED, "5512999990000", "Olá", {
    fetch: async () => resposta({ ok: true }),
  });
  assert.equal(semId.ok, false);
  assert.equal(semId.ambigua, true);
  assert.match(semId.erro.title, /message_id/);

  const comSegredo = await enviarTextoCodeWords(CRED, "5512999990000", "Olá", {
    fetch: async () => { throw new Error(`falha Bearer ${CRED.codewords_api_key}`); },
  });
  assert.equal(comSegredo.ok, false);
  assert.ok(!comSegredo.erro.title.includes(CRED.codewords_api_key));
});

test("falha confirmada é definitiva; timeout e 429 mantêm a mesma referência como ambíguos", async () => {
  const definitiva = await enviarTextoCodeWords(CRED, "5512999990000", "Olá", {
    clientRef: "orbita:falha-1", fetch: async () => resposta({ ok: true, status: "failed", message_id: "cw-failed-1", error: "número inválido" }),
  });
  assert.equal(definitiva.ok, false);
  assert.equal(definitiva.ambigua, false);
  assert.equal(definitiva.wamid, `cw:${CANAL}:out:cw-failed-1`);

  const tentativa = async (response) => enviarTextoCodeWords(CRED, "5512999990000", "Olá", {
    clientRef: "orbita:retentar-1", fetch: async () => response,
  });
  assert.equal((await tentativa(resposta({ error: "limite" }, 429))).ambigua, true);
  assert.equal((await tentativa(resposta({ error: "indisponível" }, 503))).ambigua, true);
  const timeout = await enviarTextoCodeWords(CRED, "5512999990000", "Olá", {
    clientRef: "orbita:retentar-1", fetch: async () => { throw new Error("timeout"); },
  });
  assert.equal(timeout.ambigua, true);
  assert.equal(timeout.clientRef, "orbita:retentar-1");
});

test("teste do workflow exige confirmação explícita e não envia mensagem", async () => {
  let corpo;
  const ok = await testarCodeWords(CRED, { fetch: async (_url, init) => {
    corpo = JSON.parse(init.body); return resposta({ ok: true });
  } });
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(corpo, { event: "orbita.health_check", version: 1 });
  assert.deepEqual(await testarCodeWords(CRED, { fetch: async () => resposta({}) }), {
    ok: false, erro: "workflow não confirmou orbita.health_check",
  });
});

test("webhook exige POST, segredo válido e JSON dentro do limite", async () => {
  const banco = fetchBanco();
  const get = await tratarCodeWords(new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`), ENV, { fetch: banco.fetch });
  assert.equal(get.status, 405);
  const segredoRuim = await tratarCodeWords(new Request("https://edge.test/nx-codewords?ch=curto", { method: "POST", body: "{}" }), ENV, { fetch: banco.fetch });
  assert.equal(segredoRuim.status, 401);
  assert.equal(banco.chamadas.length, 0);
  const grande = await tratarCodeWords(new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(65 * 1024) }),
  }), ENV, { fetch: banco.fetch });
  assert.equal(grande.status, 413);
});

test("webhook cria mensagem recebida, atribui anúncio e registra o lead", async () => {
  const banco = fetchBanco({
    rpc: {
      nx_wa_entrada: async ({ p_msg }) => ({ mensagem_id: 91, bloqueado: false, p_msg }),
      nx_lead_webhook: async () => "criado",
    },
    metricas: [{ campanha_ext: "camp-7" }],
  });
  const req = new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "message", direction: "in", message_id: "in-123", phone: "+55 12 98765-4321",
      name: "Ana", text: "Quero agendar", timestamp: "2026-09-29T12:00:00Z",
      referral: { source_type: "ad", source_id: "ad-8", ctwa_clid: "clid-9" },
    }),
  });
  const r = await tratarCodeWords(req, ENV, { fetch: banco.fetch });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.lead, "criado");
  const entrada = banco.chamadas.find(x => x.nome === "nx_wa_entrada").corpo.p_msg;
  assert.equal(entrada.wamid, `cw:${CANAL}:in:in-123`);
  assert.equal(entrada.referral.source_id, "ad-8");
  const lead = banco.chamadas.find(x => x.nome === "nx_lead_webhook").corpo;
  assert.equal(lead.p_cliente, CLIENTE);
  assert.deepEqual(lead.p_atr, {
    origem: "anuncio", plataforma: "meta", anuncio_ext: "ad-8", campanha_ext: "camp-7", ctwa_clid: "clid-9",
  });
});

test("webhook mapeia saída espelhada e recibo para as RPCs do canal", async () => {
  const banco = fetchBanco({ rpc: {
    nx_codewords_saida: async ({ p_msg }) => ({ ok: true, p_msg }),
    nx_codewords_status: async ({ p_id, p_status, p_erro }) => ({ ok: true, pendente: false, p_id, p_status, p_erro }),
  } });
  const enviar = new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`, {
    method: "POST", body: JSON.stringify({ event: "message", direction: "out", message_id: "out-1", phone: "5512999990000", text: "Olá" }),
  });
  assert.equal((await (await tratarCodeWords(enviar, ENV, { fetch: banco.fetch })).json()).tipo, "message_out");
  const msg = banco.chamadas.find(x => x.nome === "nx_codewords_saida").corpo.p_msg;
  assert.equal(msg.id, "out-1");
  const status = new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`, {
    method: "POST", body: JSON.stringify({ event: "status", message_id: "out-1", status: "delivered" }),
  });
  assert.equal((await (await tratarCodeWords(status, ENV, { fetch: banco.fetch })).json()).tipo, "status");
  const recibo = banco.chamadas.find(x => x.nome === "nx_codewords_status").corpo;
  assert.equal(recibo.p_id, "out-1");
  assert.equal(recibo.p_status, "delivered");
  assert.equal(recibo.p_erro, null);
});

test("recibo que chega antes do eco fica pendente e é aplicado quando a saída aparece", async () => {
  const pendentes = new Map(), saidas = new Set();
  const banco = fetchBanco({ rpc: {
    nx_codewords_status: async ({ p_id, p_status }) => {
      if (!saidas.has(p_id)) {
        pendentes.set(p_id, p_status);
        return { ok: true, pendente: true, status: p_status };
      }
      return { ok: true, pendente: false, status: p_status };
    },
    nx_codewords_saida: async ({ p_msg }) => {
      saidas.add(p_msg.id);
      const recibo = pendentes.get(p_msg.id) || null;
      pendentes.delete(p_msg.id);
      return { ok: true, status_aplicado: recibo };
    },
  } });
  const enviarEvento = (evento) => tratarCodeWords(new Request(`https://edge.test/nx-codewords?ch=${CHAVE_HOOK}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evento),
  }), ENV, { fetch: banco.fetch });
  const recibo = await enviarEvento({ event: "status", message_id: "out-early", status: "delivered" });
  assert.equal((await recibo.json()).pendente, true);
  const eco = await enviarEvento({ event: "message", direction: "out", message_id: "out-early", phone: "5512999990000", text: "Olá" });
  assert.equal((await eco.json()).status_aplicado, "delivered");
  assert.equal(pendentes.size, 0);
  assert.deepEqual(banco.chamadas.filter(x => x.nome === "nx_codewords_status").map(x => x.corpo.p_status), ["delivered"]);
});
