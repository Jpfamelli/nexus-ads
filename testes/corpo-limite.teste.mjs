/* ============================================================
   ÓRBITA — teto do corpo das Edge Functions (E2E-meta, bug 1)
   Uso: node --test testes/corpo-limite.teste.mjs

   No ar, o nx-whatsapp "respondia" 413 para 2 MiB + 1 sem ler nem cancelar o corpo, e a
   resposta nunca saía: o runtime ficava esperando o cliente terminar de enviar e o gateway
   dava 503 depois de ~160 s (2.097.152 bytes → 401 em 0,6 s; 2.097.153 → pendurado).
   Aqui, com Request e ReadableStream REAIS (o que o Deno entrega ao handler):
   - exatamente no limite: aceita e segue para a assinatura / o despacho;
   - limite + 1 com Content-Length: 413 NA HORA, sem nenhuma leitura, corpo CANCELADO,
     nada no banco — o corpo é um cliente "parado" (nunca manda nada): se o handler
     esperasse o corpo, o teste estouraria o prazo em vez de receber o 413;
   - em pedaços sem Content-Length (ou com um que mente): lê contando e, ao passar do
     limite, cancela o leitor e responde 413 (nada muito além do limite é lido);
   - corpo pequeno normal: segue igual;
   - respostas que não leem o corpo (405, 401, 429, cron recusado) também o cancelam.
   Vale para nx-whatsapp (2 MiB), nx-codewords (API do agente, 64 KiB), painel
   (lerCorpoPainel: nx-enviar/nx-ia/nx-codewords 64.000 B, nx-midia 8 MB) e cron (lerCorpo, 64 KiB).
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { tratar as webhook, MAX_CORPO_WEBHOOK } from "../supabase/functions/_compartilhado/webhook.js";
import { tratar as codewords, MAX_CORPO } from "../supabase/functions/_compartilhado/codewords.js";
import { tratar as enviar } from "../supabase/functions/_compartilhado/enviar.js";
import { tratar as midia } from "../supabase/functions/_compartilhado/midia.js";
import { tratar as nxIa } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { tratar as ciclo } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import {
  lerCorpoLimitado, lerCorpo, CorpoGrande, soltarCorpo, tamanhoDeclarado, MAX_CORPO_CRON,
} from "../supabase/functions/_compartilhado/comum.js";

const SUPA = "https://fake.supabase.co";
const FN = `${SUPA}/functions/v1`;
const ENV = { url: SUPA, chave: "service-role-falsa" };
const SEGREDO = "segredo-global-de-teste";
const CRON = "cron-de-teste";
const SEG_CW = "c".repeat(64);
const MIB = 1024 * 1024;

/* ------------------------------------------------------------
   Apoio
   ------------------------------------------------------------ */
const resp = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });

/** PostgREST falso mínimo: nx_config e as RPCs pedidas; registra tudo o que chega ao banco. */
function bancoFalso({ rpcs = {} } = {}) {
  const chamadas = [];
  const fetch = async (entrada, init = {}) => {
    const u = new URL(typeof entrada === "string" ? entrada : entrada.url);
    chamadas.push(`${init.method || "GET"} ${u.pathname}`);
    if (u.pathname === "/rest/v1/nx_config") {
      return resp([{ id: 1, cron_token: CRON, meta_app_secret: SEGREDO, wa_phone_number_id: "900900900", wa_verify_token: "v" }]);
    }
    const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc && rpcs[rpc]) return resp(rpcs[rpc](JSON.parse(init.body || "{}")));
    throw new TypeError(`fetch falso: ${u.pathname}`);
  };
  return { fetch, chamadas };
}

/**
 * Corpo que chega em pedaços (como chunked, sem Content-Length). highWaterMark 0: só puxa
 * quando alguém LÊ (puxados = leituras de verdade). `parado`: cliente que ainda não mandou
 * nada — um read() nele nunca termina. `bytes`: conteúdo exato; senão, `total` bytes de "a".
 */
function corpoEmPedacos({ bytes = null, total = Infinity, pedaco = 64 * 1024, parado = false } = {}) {
  const st = { puxados: 0, entregues: 0, cancelado: false };
  const fim = bytes ? bytes.byteLength : total;
  const stream = new ReadableStream({
    pull(c) {
      st.puxados++;
      if (parado) return new Promise(() => {});
      const n = Math.min(pedaco, fim - st.entregues);
      if (n <= 0) { c.close(); return; }
      c.enqueue(bytes ? bytes.slice(st.entregues, st.entregues + n) : new Uint8Array(n).fill(0x61));
      st.entregues += n;
    },
    cancel() { st.cancelado = true; },
  }, { highWaterMark: 0 });
  return { stream, st };
}

const pedido = (url, { metodo = "POST", corpo, cab = {} } = {}) =>
  new Request(url, { method: metodo, headers: cab, body: corpo, ...(corpo instanceof ReadableStream ? { duplex: "half" } : {}) });

/** O handler tem de responder sozinho; pendurar (esperar o corpo) vira falha, não travamento da suíte. */
function aTempo(p, ms = 3000) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`sem resposta em ${ms} ms (pendurou esperando o corpo)`)), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

/** JSON válido com EXATAMENTE n bytes (UTF-8). */
function jsonDeTamanho(n, base) {
  const vazio = Buffer.byteLength(JSON.stringify({ ...base, pad: "" }));
  const txt = JSON.stringify({ ...base, pad: "a".repeat(n - vazio) });
  assert.equal(Buffer.byteLength(txt), n);
  return txt;
}

const assinar = corpo => `sha256=${createHmac("sha256", SEGREDO).update(corpo).digest("hex")}`;
const META_VAZIO = { object: "whatsapp_business_account", entry: [] };

/* ------------------------------------------------------------
   comum.js
   ------------------------------------------------------------ */
test("lerCorpoLimitado: exatamente no teto devolve os bytes; 1 a mais em pedaços → CorpoGrande e leitor cancelado", async () => {
  const bytes = new Uint8Array(1000).map((_, i) => i % 251);
  const { stream, st } = corpoEmPedacos({ bytes, pedaco: 97 });
  const lido = await lerCorpoLimitado(pedido(`${FN}/x`, { corpo: stream }), 1000);
  assert.deepEqual(lido, bytes);
  assert.equal(st.cancelado, false);

  const mais = corpoEmPedacos({ total: 1001, pedaco: 97 });
  const e = await lerCorpoLimitado(pedido(`${FN}/x`, { corpo: mais.stream }), 1000).catch(x => x);
  assert.ok(e instanceof CorpoGrande);
  assert.equal(e.status, 413);
  assert.equal(mais.st.cancelado, true, "o leitor é cancelado ao passar do teto");

  // sem corpo e Content-Length ilegível: vale a contagem
  assert.deepEqual(await lerCorpoLimitado(new Request(`${FN}/x`, { method: "POST" }), 10), new Uint8Array(0));
  assert.equal(tamanhoDeclarado(new Request(`${FN}/x`, { headers: { "content-length": "1e9" } })), null);
  assert.equal(tamanhoDeclarado(new Request(`${FN}/x`, { headers: { "content-length": " 12 " } })), 12);
});

test("lerCorpoLimitado: Content-Length acima do teto → CorpoGrande sem NENHUMA leitura e corpo cancelado", async () => {
  const { stream, st } = corpoEmPedacos({ parado: true });
  const e = await aTempo(lerCorpoLimitado(pedido(`${FN}/x`, { corpo: stream, cab: { "content-length": "1001" } }), 1000).catch(x => x));
  assert.ok(e instanceof CorpoGrande);
  assert.equal(st.puxados, 0, "nada foi lido");
  assert.equal(st.cancelado, true, "o corpo foi cancelado (o runtime não fica esperando o envio)");
});

test("soltarCorpo: não espera o cancelamento, ignora corpo já travado e nunca lança", async () => {
  let resolver;
  const lento = new ReadableStream({ cancel: () => new Promise(r => { resolver = r; }) });
  const req = pedido(`${FN}/x`, { corpo: lento });
  assert.equal(soltarCorpo(req), undefined, "volta na hora, mesmo com o cancelamento ainda pendente");
  resolver?.();
  const travado = pedido(`${FN}/x`, { corpo: corpoEmPedacos({ total: 10 }).stream });
  travado.body.getReader();
  assert.doesNotThrow(() => soltarCorpo(travado));
  assert.doesNotThrow(() => soltarCorpo(new Request(`${FN}/x`)));
  assert.doesNotThrow(() => soltarCorpo(null));
});

test("lerCorpo (cron): pequeno → objeto; ilegível → {}; acima de 64 KiB → 413", async () => {
  assert.deepEqual(await lerCorpo(pedido(`${FN}/x`, { corpo: '{"cliente":"x"}' })), { cliente: "x" });
  assert.deepEqual(await lerCorpo(pedido(`${FN}/x`, { corpo: "nao-json" })), {});
  const { stream, st } = corpoEmPedacos({ total: MAX_CORPO_CRON + 1, pedaco: 4096 });
  const e = await lerCorpo(pedido(`${FN}/x`, { corpo: stream })).catch(x => x);
  assert.equal(e.status, 413);
  assert.equal(st.cancelado, true);
});

/* ------------------------------------------------------------
   nx-whatsapp (2 MiB)
   ------------------------------------------------------------ */
test("nx-whatsapp: EXATAMENTE 2 MiB com Content-Length passa do limite e segue para a assinatura", async () => {
  const txt = jsonDeTamanho(MAX_CORPO_WEBHOOK, META_VAZIO);
  const certo = bancoFalso();
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, {
    corpo: txt, cab: { "content-type": "application/json", "content-length": String(MAX_CORPO_WEBHOOK), "x-hub-signature-256": assinar(txt) },
  }), ENV, { fetch: certo.fetch }));
  assert.equal(r.status, 200, "assinado certo: processado");
  assert.equal((await r.json()).ok, true);

  const errado = bancoFalso();
  const r2 = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, {
    corpo: txt, cab: { "content-length": String(MAX_CORPO_WEBHOOK), "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
  }), ENV, { fetch: errado.fetch }));
  assert.equal(r2.status, 401, "a assinatura foi conferida sobre o corpo inteiro");
  assert.equal(await r2.text(), "assinatura inválida");
  assert.deepEqual(errado.chamadas, ["GET /rest/v1/nx_config"]);
});

test("nx-whatsapp: EXATAMENTE 2 MiB em pedaços, sem Content-Length, também passa e confere a assinatura", async () => {
  const txt = jsonDeTamanho(MAX_CORPO_WEBHOOK, META_VAZIO);
  const { stream, st } = corpoEmPedacos({ bytes: new TextEncoder().encode(txt), pedaco: 60_000 });
  const b = bancoFalso();
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: stream, cab: { "x-hub-signature-256": assinar(txt) } }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 200);
  assert.equal(st.entregues, MAX_CORPO_WEBHOOK);
  assert.equal(st.cancelado, false);
});

test("nx-whatsapp: 2 MiB + 1 com Content-Length → 413 NA HORA, sem ler, sem banco e com o corpo cancelado", async () => {
  const b = bancoFalso();
  const { stream, st } = corpoEmPedacos({ parado: true });
  const t0 = Date.now();
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp?c=aaaa1111aaaa1111`, {
    corpo: stream, cab: { "content-length": String(MAX_CORPO_WEBHOOK + 1), "x-hub-signature-256": "sha256=qualquer" },
  }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 413);
  assert.equal(await r.text(), "corpo grande demais");
  assert.ok(Date.now() - t0 < 1000, "resposta imediata");
  assert.equal(st.puxados, 0, "nenhuma leitura do corpo");
  assert.equal(st.cancelado, true, "corpo cancelado: o runtime não espera o cliente terminar de enviar");
  assert.deepEqual(b.chamadas, [], "nem configuração, nem canal, nem assinatura");
});

test("nx-whatsapp: em pedaços sem Content-Length passando de 2 MiB → 413 e leitor cancelado; Content-Length que mente também", async () => {
  for (const cab of [{}, { "content-length": "100" }]) {
    const b = bancoFalso();
    const { stream, st } = corpoEmPedacos({ total: 3 * MIB, pedaco: 64 * 1024 });
    const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: stream, cab: { ...cab, "x-hub-signature-256": "sha256=x" } }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, 413);
    assert.equal(st.cancelado, true, "o leitor é cancelado ao passar do limite");
    assert.ok(st.entregues <= MAX_CORPO_WEBHOOK + 64 * 1024, `leu só até o 1º pedaço além do limite (${st.entregues})`);
    assert.deepEqual(b.chamadas, []);
  }
  // um fluxo sem fim também para no limite
  const { stream, st } = corpoEmPedacos({ pedaco: 256 * 1024 });
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: stream }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 413);
  assert.equal(st.cancelado, true);
});

test("nx-whatsapp: corpo pequeno normal (inteiro ou em pedaços) segue para a assinatura como antes", async () => {
  const txt = JSON.stringify(META_VAZIO);
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: txt, cab: { "x-hub-signature-256": assinar(txt) } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 200);
  const { stream } = corpoEmPedacos({ bytes: new TextEncoder().encode(txt), pedaco: 7 });
  const r2 = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: stream, cab: { "x-hub-signature-256": assinar(txt) } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r2.status, 200);
  const r3 = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: txt, cab: { "x-hub-signature-256": assinar(`${txt} `) } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r3.status, 401);
});

test("nx-whatsapp: método errado com corpo → 405 e o corpo é cancelado (não fica pendurado)", async () => {
  const { stream, st } = corpoEmPedacos({ parado: true });
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { metodo: "PUT", corpo: stream }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 405);
  assert.equal(st.puxados, 0);
  assert.equal(st.cancelado, true);
});

/* ------------------------------------------------------------
   nx-codewords — API do agente (64 KiB) e cron
   ------------------------------------------------------------ */
const canalOk = () => bancoFalso({ rpcs: { nx_codewords_canal: () => ({ canal_id: "k-1", cliente_id: "cli-1", excedido: false }) } });
const urlAgente = `${FN}/nx-codewords?ch=${SEG_CW}`;

test("nx-codewords agente: EXATAMENTE 64 KiB passa do limite e chega ao despacho", async () => {
  const txt = jsonDeTamanho(MAX_CORPO, { acao: "acao-que-nao-existe" });
  for (const corpo of [txt, corpoEmPedacos({ bytes: new TextEncoder().encode(txt), pedaco: 5000 }).stream]) {
    const b = canalOk();
    const r = await aTempo(codewords(pedido(urlAgente, { corpo, cab: typeof corpo === "string" ? { "content-length": String(MAX_CORPO) } : {} }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, 400);
    assert.equal((await r.json()).erro, "acao_desconhecida", "corpo lido e interpretado: não é 413");
    assert.deepEqual(b.chamadas, ["POST /rest/v1/rpc/nx_codewords_canal"]);
  }
});

test("nx-codewords agente: 64 KiB + 1 com Content-Length → 413 na hora, sem banco, sem ler e corpo cancelado", async () => {
  const b = canalOk();
  const { stream, st } = corpoEmPedacos({ parado: true });
  const r = await aTempo(codewords(pedido(urlAgente, { corpo: stream, cab: { "content-length": String(MAX_CORPO + 1) } }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { ok: false, erro: "corpo_grande" });
  assert.equal(st.puxados, 0);
  assert.equal(st.cancelado, true);
  assert.deepEqual(b.chamadas, []);
});

test("nx-codewords agente: em pedaços sem Content-Length passando de 64 KiB → 413 e leitor cancelado", async () => {
  const b = canalOk();
  const { stream, st } = corpoEmPedacos({ pedaco: 8 * 1024 });
  const r = await aTempo(codewords(pedido(urlAgente, { corpo: stream }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 413);
  assert.equal((await r.json()).erro, "corpo_grande");
  assert.equal(st.cancelado, true);
  assert.ok(st.entregues <= MAX_CORPO + 8 * 1024);
  assert.deepEqual(b.chamadas, ["POST /rest/v1/rpc/nx_codewords_canal"], "nada gravado");
});

test("nx-codewords: respostas que não leem o corpo (405, 401, 429, cron recusado) cancelam o corpo", async () => {
  const casos = [
    ["método que não é POST", "PUT", 405, canalOk()],
    ["segredo malformado", "POST", 401, canalOk(), `${FN}/nx-codewords?ch=abc`],
    ["segredo desconhecido", "POST", 401, bancoFalso({ rpcs: { nx_codewords_canal: () => null } })],
    ["limite de taxa", "POST", 429, bancoFalso({ rpcs: { nx_codewords_canal: () => ({ canal_id: "k", excedido: true }) } })],
  ];
  for (const [nome, metodo, status, b, url = urlAgente] of casos) {
    const { stream, st } = corpoEmPedacos({ parado: true });
    const r = await aTempo(codewords(pedido(url, { metodo, corpo: stream }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, status, nome);
    assert.equal(st.puxados, 0, nome);
    assert.equal(st.cancelado, true, `${nome}: corpo cancelado`);
  }
  // cron com token errado
  const { stream, st } = corpoEmPedacos({ parado: true });
  const r = await aTempo(codewords(pedido(`${FN}/nx-codewords`, { corpo: stream, cab: { "x-nx-cron": "errado" } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 401);
  assert.equal(st.cancelado, true);
  // cron certo com corpo gigante → 413 (lerCorpo com teto)
  const g = corpoEmPedacos({ pedaco: 16 * 1024 });
  const r2 = await aTempo(codewords(pedido(`${FN}/nx-codewords`, { corpo: g.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r2.status, 413);
  assert.equal(g.st.cancelado, true);
});

/* ------------------------------------------------------------
   Painel (lerCorpoPainel / tratarPainel): nx-enviar, nx-ia, nx-midia
   ------------------------------------------------------------ */
test("painel (nx-enviar): exatamente 64.000 B passa; 64.001 com Content-Length → 413 sem ler; em pedaços → 413 e leitor cancelado", async () => {
  const txt = jsonDeTamanho(64_000, { acao: "acao-que-nao-existe" });
  const r = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: txt }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, "dados_invalidos", "lido e validado (ação), não 413");

  const b = bancoFalso();
  const p = corpoEmPedacos({ parado: true });
  const r2 = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: p.stream, cab: { "content-length": "64001" } }), ENV, { fetch: b.fetch }));
  assert.equal(r2.status, 413);
  assert.equal(p.st.puxados, 0);
  assert.equal(p.st.cancelado, true);
  assert.deepEqual(b.chamadas, []);

  const q = corpoEmPedacos({ pedaco: 10_000 });
  const r3 = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: q.stream }), ENV, { fetch: b.fetch }));
  assert.equal(r3.status, 413);
  assert.equal(q.st.cancelado, true);
  assert.ok(q.st.entregues <= 64_000 + 10_000);
});

test("painel: OPTIONS/GET com corpo e cron recusado do nx-enviar cancelam o corpo; nx-ia e nx-midia respeitam o teto", async () => {
  for (const metodo of ["OPTIONS", "PUT"]) {
    const { stream, st } = corpoEmPedacos({ parado: true });
    const r = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { metodo, corpo: stream }), ENV, { fetch: bancoFalso().fetch }));
    assert.equal(r.status, metodo === "OPTIONS" ? 204 : 405);
    assert.equal(st.cancelado, true, metodo);
  }
  const c = corpoEmPedacos({ parado: true });
  const rc = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: c.stream, cab: { "x-nx-cron": "errado" } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(rc.status, 401);
  assert.equal(c.st.cancelado, true);

  const ia = corpoEmPedacos({ parado: true });
  const ri = await aTempo(nxIa(pedido(`${FN}/nx-ia`, { corpo: ia.stream, cab: { "content-length": "64001" } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(ri.status, 413);
  assert.equal(ia.st.cancelado, true);

  const m = corpoEmPedacos({ parado: true });
  const rm = await aTempo(midia(pedido(`${FN}/nx-midia`, { corpo: m.stream, cab: { "content-length": String(8 * MIB + 1) } }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(rm.status, 413);
  assert.equal(m.st.puxados, 0);
  assert.equal(m.st.cancelado, true);
  // 8 MB exatos (em pedaços) passam do teto e chegam à validação
  const txt = jsonDeTamanho(8 * MIB, { acao: "acao-que-nao-existe" });
  const rm2 = await aTempo(midia(pedido(`${FN}/nx-midia`, { corpo: corpoEmPedacos({ bytes: new TextEncoder().encode(txt), pedaco: MIB }).stream }), ENV, { fetch: bancoFalso().fetch }), 10_000);
  assert.equal(rm2.status, 400);
});

/* ------------------------------------------------------------
   Cron (nx-ciclo, nx-relatorio)
   ------------------------------------------------------------ */
test("nx-ciclo e nx-relatorio: 405/401 com corpo cancelam o corpo; cron certo com corpo acima de 64 KiB → 413", async () => {
  for (const [nome, fn] of [["nx-ciclo", ciclo], ["nx-relatorio", relatorio]]) {
    for (const [metodo, cab, status] of [["PUT", {}, 405], ["POST", {}, 401], ["POST", { "x-nx-cron": "errado" }, 401]]) {
      const { stream, st } = corpoEmPedacos({ parado: true });
      const r = await aTempo(fn(pedido(`${FN}/${nome}`, { metodo, corpo: stream, cab }), ENV, { fetch: bancoFalso().fetch }));
      assert.equal(r.status, status, `${nome} ${metodo} ${JSON.stringify(cab)}`);
      assert.equal(st.cancelado, true, `${nome}: corpo cancelado`);
    }
    const g = corpoEmPedacos({ pedaco: 16 * 1024 });
    const r = await aTempo(fn(pedido(`${FN}/${nome}`, { corpo: g.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: bancoFalso().fetch }));
    assert.equal(r.status, 413, nome);
    assert.equal(g.st.cancelado, true);
  }
});
