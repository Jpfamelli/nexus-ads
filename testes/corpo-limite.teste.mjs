/* ============================================================
   ÓRBITA — teto do corpo das Edge Functions (E2E-meta, bug 1)
   Uso: node --test testes/corpo-limite.teste.mjs

   No ar, o nx-whatsapp "respondia" 413 para 2 MiB + 1 sem consumir o corpo e a resposta
   nunca saía: o gateway dava 503 depois de ~160 s (2.097.152 bytes → 401 em 0,6 s, porque
   o corpo foi LIDO inteiro; 2.097.153 → pendurado). No Edge Runtime, responder antes de
   consumir o corpo pendura com ou sem cancelar o leitor. Estratégia: DRENAR E DESCARTAR.
   Aqui, com Request e ReadableStream REAIS (o que o Deno entrega ao handler):
   - exatamente no limite: aceita e segue para a assinatura (corpo cru inteiro) / o despacho;
   - acima do limite (Content-Length ou contagem): o resto do corpo é lido até o FIM só
     contando bytes (nada acumulado) e só então sai o 413 — sem cancelar e sem banco;
   - corpo parado/lento: a drenagem corta no prazo (cancela) e responde 413;
   - corpo sem fim: corta no teto absoluto (16 MiB) e responde 413;
   - Content-Length acima do teto absoluto: 413 NA HORA, sem ler nada (melhor esforço);
   - respostas que não leem o corpo (405, 401, 429, OPTIONS) também drenam antes de sair.
   Vale para nx-whatsapp (2 MiB), nx-codewords (API do agente e cron, 64 KiB), painel
   (lerCorpoPainel: nx-enviar/nx-ia/nx-codewords 64.000 B, nx-midia 8 MB) e cron (lerCorpo, 64 KiB).
   O prazo real é 10 s; os testes que exercitam o corte passam deps.drenagem = {prazoMs: 250}.
   ============================================================ */
import { test, mock } from "node:test";
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
  lerCorpoLimitado, lerCorpo, CorpoGrande, soltarCorpo, soltandoCorpo, drenarCorpo, tamanhoDeclarado,
  MAX_CORPO_CRON, PRAZO_DRENAR_MS, TETO_DRENAR,
} from "../supabase/functions/_compartilhado/comum.js";

const SUPA = "https://fake.supabase.co";
const FN = `${SUPA}/functions/v1`;
const ENV = { url: SUPA, chave: "service-role-falsa" };
const SEGREDO = "segredo-global-de-teste";
const CRON = "cron-de-teste";
const SEG_CW = "c".repeat(64);
const MIB = 1024 * 1024;
// prazo curto só para os testes que exercitam o corte (o real é PRAZO_DRENAR_MS = 10 s)
const PRAZO_TESTE = 250;
const DRENO = { prazoMs: PRAZO_TESTE };

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
 * Corpo que chega em pedaços (como chunked). highWaterMark 0: só puxa quando alguém LÊ
 * (puxados = leituras de verdade). `parado`: cliente que não manda mais nada — um read()
 * nele nunca termina. `atraso`: cada pedaço demora tantos ms (cliente lento). `erro`: a
 * conexão cai no 1º pedaço. `bytes`: conteúdo exato; senão, `total` bytes de "a" (Infinity = sem fim).
 * st.fim = o cliente terminou de mandar e o leitor viu o fim (drenado até o último byte).
 */
function corpoEmPedacos({ bytes = null, total = Infinity, pedaco = 64 * 1024, parado = false, atraso = 0, erro = false } = {}) {
  const st = { puxados: 0, entregues: 0, cancelado: false, fim: false };
  const fim = bytes ? bytes.byteLength : total;
  const stream = new ReadableStream({
    async pull(c) {
      st.puxados++;
      if (parado) return new Promise(() => {});
      if (erro) throw new Error("conexão caiu");
      if (atraso) await new Promise(r => setTimeout(r, atraso));
      if (st.cancelado) return;
      const n = Math.min(pedaco, fim - st.entregues);
      if (n <= 0) { st.fim = true; c.close(); return; }
      c.enqueue(bytes ? bytes.slice(st.entregues, st.entregues + n) : new Uint8Array(n).fill(0x61));
      st.entregues += n;
    },
    cancel() { st.cancelado = true; },
  }, { highWaterMark: 0 });
  return { stream, st };
}

const pedido = (url, { metodo = "POST", corpo, cab = {} } = {}) =>
  new Request(url, { method: metodo, headers: cab, body: corpo, ...(corpo instanceof ReadableStream ? { duplex: "half" } : {}) });

/** O handler tem de responder sozinho; pendurar (esperar o corpo para sempre) vira falha, não travamento da suíte. */
function aTempo(p, ms = 3000) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`sem resposta em ${ms} ms (pendurou esperando o corpo)`)), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

/** Mede quanto a promessa levou. */
async function cronometro(p) {
  const t0 = Date.now();
  const valor = await p;
  return { valor, ms: Date.now() - t0 };
}

/** JSON válido com EXATAMENTE n bytes (UTF-8). */
function jsonDeTamanho(n, base) {
  const vazio = Buffer.byteLength(JSON.stringify({ ...base, pad: "" }));
  const txt = JSON.stringify({ ...base, pad: "a".repeat(n - vazio) });
  assert.equal(Buffer.byteLength(txt), n);
  return txt;
}

/** Drenado até o último byte, sem cancelar: o runtime pode soltar a resposta. */
function drenadoInteiro(st, total, nome = "") {
  assert.equal(st.entregues, total, `${nome} corpo lido até o fim (${st.entregues} de ${total})`);
  assert.equal(st.fim, true, `${nome} o leitor chegou ao fim do corpo`);
  assert.equal(st.cancelado, false, `${nome} nada cancelado`);
}

/** Cortado no prazo: o corpo parado foi cancelado e a resposta saiu perto do prazo de teste. */
function cortadoNoPrazo(st, ms, nome = "") {
  assert.equal(st.cancelado, true, `${nome} leitor cancelado ao estourar o prazo`);
  assert.ok(ms >= PRAZO_TESTE - 30, `${nome} esperou o prazo (${ms} ms)`);
  assert.ok(ms < PRAZO_TESTE + 1500, `${nome} não passou muito do prazo (${ms} ms)`);
}

const assinar = corpo => `sha256=${createHmac("sha256", SEGREDO).update(corpo).digest("hex")}`;
const META_VAZIO = { object: "whatsapp_business_account", entry: [] };

/* ------------------------------------------------------------
   comum.js
   ------------------------------------------------------------ */
test("drenagem: prazo de 10 s e teto absoluto de 16 MiB (acima de todos os tetos de leitura)", () => {
  assert.equal(PRAZO_DRENAR_MS, 10_000);
  assert.equal(TETO_DRENAR, 16 * MIB);
  for (const teto of [MAX_CORPO_WEBHOOK, MAX_CORPO, MAX_CORPO_CRON, 64_000, 8 * MIB]) assert.ok(teto < TETO_DRENAR);
});

test("lerCorpoLimitado: exatamente no teto devolve os bytes; acima, em pedaços → drena o corpo INTEIRO (sem cancelar) e só então CorpoGrande", async () => {
  const bytes = new Uint8Array(1000).map((_, i) => i % 251);
  const { stream, st } = corpoEmPedacos({ bytes, pedaco: 97 });
  const lido = await lerCorpoLimitado(pedido(`${FN}/x`, { corpo: stream }), 1000);
  assert.deepEqual(lido, bytes);
  assert.equal(st.cancelado, false);

  const mais = corpoEmPedacos({ total: 5000, pedaco: 97 });
  const e = await aTempo(lerCorpoLimitado(pedido(`${FN}/x`, { corpo: mais.stream }), 1000).catch(x => x));
  assert.ok(e instanceof CorpoGrande);
  assert.equal(e.status, 413);
  drenadoInteiro(mais.st, 5000);

  // sem corpo e Content-Length ilegível: vale a contagem
  assert.deepEqual(await lerCorpoLimitado(new Request(`${FN}/x`, { method: "POST" }), 10), new Uint8Array(0));
  assert.equal(tamanhoDeclarado(new Request(`${FN}/x`, { headers: { "content-length": "1e9" } })), null);
  assert.equal(tamanhoDeclarado(new Request(`${FN}/x`, { headers: { "content-length": " 12 " } })), 12);
});

test("lerCorpoLimitado: Content-Length acima do teto → drena tudo e CorpoGrande; acima do teto ABSOLUTO → CorpoGrande na hora, sem ler", async () => {
  const { stream, st } = corpoEmPedacos({ total: 3000, pedaco: 500 });
  const e = await aTempo(lerCorpoLimitado(pedido(`${FN}/x`, { corpo: stream, cab: { "content-length": "3000" } }), 1000).catch(x => x));
  assert.ok(e instanceof CorpoGrande);
  drenadoInteiro(st, 3000);

  const parado = corpoEmPedacos({ parado: true });
  const { valor: e2, ms } = await cronometro(aTempo(lerCorpoLimitado(pedido(`${FN}/x`, {
    corpo: parado.stream, cab: { "content-length": String(TETO_DRENAR + 1) },
  }), 1000).catch(x => x)));
  assert.ok(e2 instanceof CorpoGrande);
  assert.ok(ms < 500, `imediato (${ms} ms)`);
  assert.equal(parado.st.puxados, 0, "nada foi lido: não vale drenar mais de 16 MiB");
  assert.equal(parado.st.cancelado, true, "cancelado (melhor esforço)");
});

test("lerCorpoLimitado: cliente que para no meio depois de passar do teto → corte no prazo (cancela) e CorpoGrande", async () => {
  let n = 0;
  const st = { cancelado: false };
  const stream = new ReadableStream({
    pull(c) { if (n++ < 3) { c.enqueue(new Uint8Array(600)); return; } return new Promise(() => {}); },   // 1800 B e para
    cancel() { st.cancelado = true; },
  }, { highWaterMark: 0 });
  const { valor: e, ms } = await cronometro(aTempo(lerCorpoLimitado(pedido(`${FN}/x`, { corpo: stream }), 1000, DRENO).catch(x => x)));
  assert.ok(e instanceof CorpoGrande);
  cortadoNoPrazo(st, ms);
});

test("drenarCorpo: corpo sem fim para no teto absoluto; parado ou lento para no prazo — sempre cancelando o leitor", async () => {
  const semFim = corpoEmPedacos({ pedaco: MIB });
  const r1 = await aTempo(drenarCorpo(pedido(`${FN}/x`, { corpo: semFim.stream })), 5000);
  assert.deepEqual({ fim: r1.fim, motivo: r1.motivo }, { fim: false, motivo: "teto" });
  assert.equal(semFim.st.cancelado, true);
  assert.ok(semFim.st.entregues > TETO_DRENAR && semFim.st.entregues <= TETO_DRENAR + MIB, `parou logo depois de 16 MiB (${semFim.st.entregues})`);

  const parado = corpoEmPedacos({ parado: true });
  const { valor: r2, ms: ms2 } = await cronometro(drenarCorpo(pedido(`${FN}/x`, { corpo: parado.stream }), DRENO));
  assert.deepEqual(r2, { fim: false, bytes: 0, motivo: "prazo" });
  cortadoNoPrazo(parado.st, ms2, "parado:");

  const lento = corpoEmPedacos({ pedaco: 1024, atraso: 40 });
  const { valor: r3, ms: ms3 } = await cronometro(drenarCorpo(pedido(`${FN}/x`, { corpo: lento.stream }), DRENO));
  assert.equal(r3.motivo, "prazo");
  assert.ok(r3.bytes > 0 && r3.bytes === lento.st.entregues, "leu (e descartou) o que chegou dentro do prazo");
  cortadoNoPrazo(lento.st, ms3, "lento:");

  // o teto absoluto conta o corpo inteiro, inclusive o que quem chamou já leu (ja)
  const quase = corpoEmPedacos({ total: 5000, pedaco: 1000 });
  const leitor = pedido(`${FN}/x`, { corpo: quase.stream });
  const l = leitor.body.getReader();
  await l.read();   // 1000 já lidos por quem chamou
  const r4 = await drenarCorpo(leitor, { leitor: l, ja: 1000, teto: 3000 });
  assert.equal(r4.motivo, "teto");
  assert.equal(quase.st.cancelado, true);
});

test("drenarCorpo: prazo PADRÃO de 10 s vale também para um read() parado (relógio simulado)", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { stream, st } = corpoEmPedacos({ parado: true });
    let r = null;
    drenarCorpo(pedido(`${FN}/x`, { corpo: stream })).then(x => { r = x; });
    const vez = () => new Promise(res => setImmediate(res));
    await vez();
    mock.timers.tick(PRAZO_DRENAR_MS - 1);
    await vez(); await vez();
    assert.equal(r, null, "ainda dentro do prazo");
    assert.equal(st.cancelado, false);
    mock.timers.tick(1);
    await vez(); await vez();
    assert.deepEqual(r, { fim: false, bytes: 0, motivo: "prazo" });
    assert.equal(st.cancelado, true);
  } finally {
    mock.timers.reset();
  }
});

test("drenarCorpo: sem corpo, já lido ou travado → nada a fazer; Content-Length acima do teto absoluto → cancela sem ler; conexão que cai não lança", async () => {
  assert.deepEqual(await drenarCorpo(new Request(`${FN}/x`)), { fim: true, bytes: 0 });
  assert.deepEqual(await drenarCorpo(null), { fim: true, bytes: 0 });
  const travado = pedido(`${FN}/x`, { corpo: corpoEmPedacos({ total: 10 }).stream });
  travado.body.getReader();
  assert.deepEqual(await drenarCorpo(travado), { fim: true, bytes: 0 });

  const gigante = corpoEmPedacos({ parado: true });
  const r = await aTempo(drenarCorpo(pedido(`${FN}/x`, { corpo: gigante.stream, cab: { "content-length": String(TETO_DRENAR + 1) } })), 500);
  assert.deepEqual(r, { fim: false, bytes: 0, motivo: "teto" });
  assert.equal(gigante.st.puxados, 0);
  assert.equal(gigante.st.cancelado, true);

  const caiu = corpoEmPedacos({ erro: true });
  const r2 = await aTempo(drenarCorpo(pedido(`${FN}/x`, { corpo: caiu.stream })));
  assert.equal(r2.fim, false);
  assert.equal(r2.motivo, "erro");

  const pequeno = corpoEmPedacos({ total: 4321, pedaco: 1000 });
  assert.deepEqual(await drenarCorpo(pedido(`${FN}/x`, { corpo: pequeno.stream })), { fim: true, bytes: 4321 });
  drenadoInteiro(pequeno.st, 4321);
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

test("soltandoCorpo: o corpo que ninguém leu é drenado ANTES de a resposta sair (também quando o handler lança)", async () => {
  const { stream, st } = corpoEmPedacos({ total: 300_000, pedaco: 20_000, atraso: 2 });
  const r = await aTempo(soltandoCorpo(pedido(`${FN}/x`, { corpo: stream }), async () => new Response("x", { status: 401 })));
  assert.equal(r.status, 401);
  drenadoInteiro(st, 300_000, "quando a resposta sai:");

  const b = corpoEmPedacos({ total: 50_000 });
  const e = await soltandoCorpo(pedido(`${FN}/x`, { corpo: b.stream }), async () => { throw new Error("falhou"); }).catch(x => x);
  assert.equal(e.message, "falhou");
  drenadoInteiro(b.st, 50_000);

  const parado = corpoEmPedacos({ parado: true });
  const { valor: r2, ms } = await cronometro(soltandoCorpo(pedido(`${FN}/x`, { corpo: parado.stream }), async () => new Response(null, { status: 405 }), DRENO));
  assert.equal(r2.status, 405);
  cortadoNoPrazo(parado.st, ms);
});

test("lerCorpo (cron): pequeno → objeto; ilegível → {}; acima de 64 KiB → drena tudo e 413", async () => {
  assert.deepEqual(await lerCorpo(pedido(`${FN}/x`, { corpo: '{"cliente":"x"}' })), { cliente: "x" });
  assert.deepEqual(await lerCorpo(pedido(`${FN}/x`, { corpo: "nao-json" })), {});
  const { stream, st } = corpoEmPedacos({ total: MAX_CORPO_CRON + 1, pedaco: 4096 });
  const e = await lerCorpo(pedido(`${FN}/x`, { corpo: stream })).catch(x => x);
  assert.equal(e.status, 413);
  drenadoInteiro(st, MAX_CORPO_CRON + 1);
});

/* ------------------------------------------------------------
   nx-whatsapp (2 MiB)
   ------------------------------------------------------------ */
test("nx-whatsapp: EXATAMENTE 2 MiB com Content-Length passa do limite e a assinatura é conferida sobre o corpo cru inteiro", async () => {
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

test("nx-whatsapp: 2 MiB + 1 com Content-Length → corpo DRENADO até o fim e só então 413, rápido e sem banco", async () => {
  const b = bancoFalso();
  const { stream, st } = corpoEmPedacos({ total: MAX_CORPO_WEBHOOK + 1, pedaco: 64 * 1024 });
  const { valor: r, ms } = await cronometro(aTempo(webhook(pedido(`${FN}/nx-whatsapp?c=aaaa1111aaaa1111`, {
    corpo: stream, cab: { "content-length": String(MAX_CORPO_WEBHOOK + 1), "x-hub-signature-256": "sha256=qualquer" },
  }), ENV, { fetch: b.fetch })));
  assert.equal(r.status, 413);
  assert.equal(await r.text(), "corpo grande demais");
  assert.ok(ms < 2000, `sem esperar prazo nenhum (${ms} ms)`);
  drenadoInteiro(st, MAX_CORPO_WEBHOOK + 1);
  assert.deepEqual(b.chamadas, [], "nem configuração, nem canal, nem assinatura");
});

test("nx-whatsapp: 2 MiB + 1 com Content-Length e cliente que para de mandar → 413 no prazo (leitor cancelado), sem banco", async () => {
  const b = bancoFalso();
  const { stream, st } = corpoEmPedacos({ parado: true });
  const { valor: r, ms } = await cronometro(aTempo(webhook(pedido(`${FN}/nx-whatsapp`, {
    corpo: stream, cab: { "content-length": String(MAX_CORPO_WEBHOOK + 1), "x-hub-signature-256": "sha256=x" },
  }), ENV, { fetch: b.fetch, drenagem: DRENO })));
  assert.equal(r.status, 413);
  cortadoNoPrazo(st, ms);
  assert.deepEqual(b.chamadas, []);
});

test("nx-whatsapp: Content-Length acima do teto absoluto (16 MiB) → 413 imediato, sem ler nada e sem banco", async () => {
  const b = bancoFalso();
  const { stream, st } = corpoEmPedacos({ parado: true });
  const { valor: r, ms } = await cronometro(aTempo(webhook(pedido(`${FN}/nx-whatsapp`, {
    corpo: stream, cab: { "content-length": String(TETO_DRENAR + 1), "x-hub-signature-256": "sha256=x" },
  }), ENV, { fetch: b.fetch }), 1000));
  assert.equal(r.status, 413);
  assert.ok(ms < 500, `imediato (${ms} ms)`);
  assert.equal(st.puxados, 0, "nenhuma leitura do corpo");
  assert.equal(st.cancelado, true, "cancelado (melhor esforço)");
  assert.deepEqual(b.chamadas, []);
});

test("nx-whatsapp: em pedaços sem Content-Length (ou com um que mente) passando de 2 MiB → drena o corpo inteiro e 413, sem banco", async () => {
  for (const cab of [{}, { "content-length": "100" }]) {
    const b = bancoFalso();
    const { stream, st } = corpoEmPedacos({ total: 3 * MIB, pedaco: 64 * 1024 });
    const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: stream, cab: { ...cab, "x-hub-signature-256": "sha256=x" } }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, 413);
    drenadoInteiro(st, 3 * MIB, JSON.stringify(cab));
    assert.deepEqual(b.chamadas, []);
  }
});

test("nx-whatsapp: corpo sem fim → corta no teto absoluto e 413; corpo lento sem fim → corta no prazo e 413; nada no banco", async () => {
  const b = bancoFalso();
  const semFim = corpoEmPedacos({ pedaco: MIB });
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: semFim.stream }), ENV, { fetch: b.fetch }), 5000);
  assert.equal(r.status, 413);
  assert.equal(semFim.st.cancelado, true);
  assert.ok(semFim.st.entregues <= TETO_DRENAR + MIB, `parou no teto absoluto (${semFim.st.entregues})`);

  const lento = corpoEmPedacos({ pedaco: 256 * 1024, atraso: 15 });
  const { valor: r2, ms } = await cronometro(aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { corpo: lento.stream }), ENV, { fetch: b.fetch, drenagem: DRENO }), 5000));
  assert.equal(r2.status, 413);
  assert.equal(lento.st.cancelado, true);
  assert.ok(lento.st.entregues > MAX_CORPO_WEBHOOK, "passou do teto e foi drenado até o prazo");
  assert.ok(ms < 3000, `${ms} ms`);
  assert.deepEqual(b.chamadas, []);
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

test("nx-whatsapp: método errado com corpo → 405 depois de drenar o corpo; cliente parado → 405 no prazo", async () => {
  const { stream, st } = corpoEmPedacos({ total: 700_000, pedaco: 64 * 1024 });
  const r = await aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { metodo: "PUT", corpo: stream }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 405);
  drenadoInteiro(st, 700_000);

  const p = corpoEmPedacos({ parado: true });
  const { valor: r2, ms } = await cronometro(aTempo(webhook(pedido(`${FN}/nx-whatsapp`, { metodo: "PUT", corpo: p.stream }), ENV, { fetch: bancoFalso().fetch, drenagem: DRENO })));
  assert.equal(r2.status, 405);
  cortadoNoPrazo(p.st, ms);
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

test("nx-codewords agente: 64 KiB + 1 com Content-Length → drena e 413 sem banco; acima do teto absoluto → 413 imediato", async () => {
  const b = canalOk();
  const { stream, st } = corpoEmPedacos({ total: MAX_CORPO + 1, pedaco: 8 * 1024 });
  const r = await aTempo(codewords(pedido(urlAgente, { corpo: stream, cab: { "content-length": String(MAX_CORPO + 1) } }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { ok: false, erro: "corpo_grande" });
  drenadoInteiro(st, MAX_CORPO + 1);
  assert.deepEqual(b.chamadas, []);

  const g = corpoEmPedacos({ parado: true });
  const r2 = await aTempo(codewords(pedido(urlAgente, { corpo: g.stream, cab: { "content-length": String(TETO_DRENAR + 1) } }), ENV, { fetch: b.fetch }), 1000);
  assert.equal(r2.status, 413);
  assert.equal(g.st.puxados, 0);
  assert.equal(g.st.cancelado, true);
  assert.deepEqual(b.chamadas, []);
});

test("nx-codewords agente: em pedaços sem Content-Length passando de 64 KiB → drena tudo e 413 ANTES do banco", async () => {
  const b = canalOk();
  const { stream, st } = corpoEmPedacos({ total: 200 * 1024, pedaco: 8 * 1024 });
  const r = await aTempo(codewords(pedido(urlAgente, { corpo: stream }), ENV, { fetch: b.fetch }));
  assert.equal(r.status, 413);
  assert.equal((await r.json()).erro, "corpo_grande");
  drenadoInteiro(st, 200 * 1024);
  assert.deepEqual(b.chamadas, [], "nem a consulta do canal");
});

test("nx-codewords: 405/401/429/cron recusado respondem só depois de consumir o corpo; parado → corte no prazo", async () => {
  const casos = [
    ["método que não é POST", "PUT", 405, canalOk(), urlAgente, []],
    ["segredo malformado", "POST", 401, canalOk(), `${FN}/nx-codewords?ch=abc`, []],
    ["segredo desconhecido", "POST", 401, bancoFalso({ rpcs: { nx_codewords_canal: () => null } }), urlAgente, ["POST /rest/v1/rpc/nx_codewords_canal"]],
    ["limite de taxa", "POST", 429, bancoFalso({ rpcs: { nx_codewords_canal: () => ({ canal_id: "k", excedido: true }) } }), urlAgente, ["POST /rest/v1/rpc/nx_codewords_canal"]],
  ];
  for (const [nome, metodo, status, b, url, chamadas] of casos) {
    const { stream, st } = corpoEmPedacos({ total: 30_000, pedaco: 4096 });
    const r = await aTempo(codewords(pedido(url, { metodo, corpo: stream }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, status, nome);
    drenadoInteiro(st, 30_000, `${nome}:`);
    assert.deepEqual(b.chamadas, chamadas, nome);
  }
  // parado em resposta que não lê (405, 401 por URL ruim) → corte no prazo
  for (const [metodo, url, status] of [["PUT", urlAgente, 405], ["POST", `${FN}/nx-codewords?ch=abc`, 401]]) {
    const p = corpoEmPedacos({ parado: true });
    const { valor: r, ms } = await cronometro(aTempo(codewords(pedido(url, { metodo, corpo: p.stream }), ENV, { fetch: canalOk().fetch, drenagem: DRENO })));
    assert.equal(r.status, status);
    cortadoNoPrazo(p.st, ms, `${status}:`);
  }
  // cron com token errado: corpo (pequeno) lido antes do banco, depois 401
  const c = corpoEmPedacos({ total: 2000, pedaco: 500 });
  const bc = bancoFalso();
  const rc = await aTempo(codewords(pedido(`${FN}/nx-codewords`, { corpo: c.stream, cab: { "x-nx-cron": "errado" } }), ENV, { fetch: bc.fetch }));
  assert.equal(rc.status, 401);
  drenadoInteiro(c.st, 2000);
  assert.deepEqual(bc.chamadas, ["GET /rest/v1/nx_config"]);
  // cron com corpo sem fim → 413 no teto absoluto, sem banco
  const g = corpoEmPedacos({ pedaco: MIB });
  const bg = bancoFalso();
  const r2 = await aTempo(codewords(pedido(`${FN}/nx-codewords`, { corpo: g.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: bg.fetch }), 5000);
  assert.equal(r2.status, 413);
  assert.equal(g.st.cancelado, true);
  assert.deepEqual(bg.chamadas, []);
});

/* ------------------------------------------------------------
   Painel (lerCorpoPainel / tratarPainel): nx-enviar, nx-ia, nx-midia
   ------------------------------------------------------------ */
test("painel (nx-enviar): exatamente 64.000 B passa; 64.001 com Content-Length ou em pedaços → drena e 413 sem banco", async () => {
  const txt = jsonDeTamanho(64_000, { acao: "acao-que-nao-existe" });
  const r = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: txt }), ENV, { fetch: bancoFalso().fetch }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, "dados_invalidos", "lido e validado (ação), não 413");

  const b = bancoFalso();
  const p = corpoEmPedacos({ total: 64_001, pedaco: 10_000 });
  const r2 = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: p.stream, cab: { "content-length": "64001" } }), ENV, { fetch: b.fetch }));
  assert.equal(r2.status, 413);
  drenadoInteiro(p.st, 64_001);

  const q = corpoEmPedacos({ total: 500_000, pedaco: 10_000 });
  const r3 = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: q.stream }), ENV, { fetch: b.fetch }));
  assert.equal(r3.status, 413);
  drenadoInteiro(q.st, 500_000);
  assert.deepEqual(b.chamadas, []);
});

test("painel: OPTIONS/PUT drenam o corpo (parado → prazo); cron do nx-enviar lê antes do banco; nx-ia e nx-midia respeitam o teto", async () => {
  for (const metodo of ["OPTIONS", "PUT"]) {
    const { stream, st } = corpoEmPedacos({ total: 100_000, pedaco: 8192 });
    const r = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { metodo, corpo: stream }), ENV, { fetch: bancoFalso().fetch }));
    assert.equal(r.status, metodo === "OPTIONS" ? 204 : 405);
    drenadoInteiro(st, 100_000, `${metodo}:`);

    const p = corpoEmPedacos({ parado: true });
    const { valor: r2, ms } = await cronometro(aTempo(enviar(pedido(`${FN}/nx-enviar`, { metodo, corpo: p.stream }), ENV, { fetch: bancoFalso().fetch, drenagem: DRENO })));
    assert.equal(r2.status, metodo === "OPTIONS" ? 204 : 405);
    cortadoNoPrazo(p.st, ms, `${metodo} parado:`);
  }
  const c = corpoEmPedacos({ total: 1000, pedaco: 100 });
  const bc = bancoFalso();
  const rc = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: c.stream, cab: { "x-nx-cron": "errado" } }), ENV, { fetch: bc.fetch }));
  assert.equal(rc.status, 401);
  drenadoInteiro(c.st, 1000);
  assert.deepEqual(bc.chamadas, ["GET /rest/v1/nx_config"]);
  const g = corpoEmPedacos({ total: MAX_CORPO_CRON + 1, pedaco: 8192 });
  const bg = bancoFalso();
  const rg = await aTempo(enviar(pedido(`${FN}/nx-enviar`, { corpo: g.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: bg.fetch }));
  assert.equal(rg.status, 413);
  drenadoInteiro(g.st, MAX_CORPO_CRON + 1);
  assert.deepEqual(bg.chamadas, [], "413 do cron antes de ler o nx_config");

  const ia = corpoEmPedacos({ total: 64_001, pedaco: 16_000 });
  const bi = bancoFalso();
  const ri = await aTempo(nxIa(pedido(`${FN}/nx-ia`, { corpo: ia.stream, cab: { "content-length": "64001" } }), ENV, { fetch: bi.fetch }));
  assert.equal(ri.status, 413);
  drenadoInteiro(ia.st, 64_001);
  assert.deepEqual(bi.chamadas, []);

  const m = corpoEmPedacos({ total: 8 * MIB + 1, pedaco: MIB });
  const bm = bancoFalso();
  const rm = await aTempo(midia(pedido(`${FN}/nx-midia`, { corpo: m.stream, cab: { "content-length": String(8 * MIB + 1) } }), ENV, { fetch: bm.fetch }), 10_000);
  assert.equal(rm.status, 413);
  drenadoInteiro(m.st, 8 * MIB + 1);
  assert.deepEqual(bm.chamadas, []);
  const mg = corpoEmPedacos({ parado: true });
  const rmg = await aTempo(midia(pedido(`${FN}/nx-midia`, { corpo: mg.stream, cab: { "content-length": String(TETO_DRENAR + 1) } }), ENV, { fetch: bm.fetch }), 1000);
  assert.equal(rmg.status, 413);
  assert.equal(mg.st.puxados, 0);
  assert.equal(mg.st.cancelado, true);
  // 8 MB exatos (em pedaços) passam do teto e chegam à validação
  const txt = jsonDeTamanho(8 * MIB, { acao: "acao-que-nao-existe" });
  const rm2 = await aTempo(midia(pedido(`${FN}/nx-midia`, { corpo: corpoEmPedacos({ bytes: new TextEncoder().encode(txt), pedaco: MIB }).stream }), ENV, { fetch: bancoFalso().fetch }), 10_000);
  assert.equal(rm2.status, 400);
});

/* ------------------------------------------------------------
   Cron (nx-ciclo, nx-relatorio)
   ------------------------------------------------------------ */
test("nx-ciclo e nx-relatorio: 405/401 consomem o corpo antes de responder; cron certo acima de 64 KiB → 413 sem banco", async () => {
  for (const [nome, fn] of [["nx-ciclo", ciclo], ["nx-relatorio", relatorio]]) {
    for (const [metodo, cab, status, chamadas] of [["PUT", {}, 405, []], ["POST", {}, 401, []], ["POST", { "x-nx-cron": "errado" }, 401, ["GET /rest/v1/nx_config"]]]) {
      const { stream, st } = corpoEmPedacos({ total: 20_000, pedaco: 4096 });
      const b = bancoFalso();
      const r = await aTempo(fn(pedido(`${FN}/${nome}`, { metodo, corpo: stream, cab }), ENV, { fetch: b.fetch }));
      assert.equal(r.status, status, `${nome} ${metodo} ${JSON.stringify(cab)}`);
      drenadoInteiro(st, 20_000, `${nome} ${metodo}:`);
      assert.deepEqual(b.chamadas, chamadas, `${nome} ${metodo} ${JSON.stringify(cab)}`);
    }
    const p = corpoEmPedacos({ parado: true });
    const { valor: rp, ms } = await cronometro(aTempo(fn(pedido(`${FN}/${nome}`, { metodo: "PUT", corpo: p.stream }), ENV, { fetch: bancoFalso().fetch, drenagem: DRENO })));
    assert.equal(rp.status, 405);
    cortadoNoPrazo(p.st, ms, `${nome} parado:`);

    const g = corpoEmPedacos({ total: 300 * 1024, pedaco: 16 * 1024 });
    const b = bancoFalso();
    const r = await aTempo(fn(pedido(`${FN}/${nome}`, { corpo: g.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: b.fetch }));
    assert.equal(r.status, 413, nome);
    drenadoInteiro(g.st, 300 * 1024, `${nome} 413:`);
    assert.deepEqual(b.chamadas, [], `${nome}: 413 antes de qualquer acesso ao banco`);

    const sf = corpoEmPedacos({ pedaco: MIB });
    const r2 = await aTempo(fn(pedido(`${FN}/${nome}`, { corpo: sf.stream, cab: { "x-nx-cron": CRON } }), ENV, { fetch: b.fetch }), 5000);
    assert.equal(r2.status, 413);
    assert.equal(sf.st.cancelado, true, `${nome}: corpo sem fim cortado no teto absoluto`);
    assert.deepEqual(b.chamadas, []);
  }
});
