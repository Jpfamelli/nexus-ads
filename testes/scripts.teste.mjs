/* Testes dos scripts de apoio. Rodar: node --test testes/scripts.teste.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { obterRefreshToken, lerArgumentos, ErroAmigavel, ESCOPO } from "../scripts/google-refresh-token.mjs";
import { montarSeed, conferir, gerarSql, contagens, SLUG } from "../scripts/popular-demo.mjs";
import { COMANDOS, selecionar } from "./rodar-tudo.mjs";
import { temPglite, MENSAGEM_SEM_PGLITE, STUBS, normalizarLf, passou, lerArgs, selecionarMigracoes, selecionarSmokes, rodar } from "../scripts/rodar-local.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_GOOGLE = resolve(RAIZ, "scripts/google-refresh-token.mjs");

/* ============================================================
   google-refresh-token.mjs
   ============================================================ */

/** Servidor de token falso: confere o que o script manda e responde como o Google. */
async function tokenFalso(responder) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", c => (corpo += c));
    req.on("end", () => {
      const p = Object.fromEntries(new URLSearchParams(corpo));
      pedidos.push(p);
      const [status, json] = responder(p);
      res.writeHead(status, { "Content-Type": "application/json", Connection: "close" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise(ok => srv.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${srv.address().port}/token`, pedidos, fechar: () => { srv.close(); srv.closeAllConnections(); } };
}

/** "Navegador" falso: lê a URL de consentimento e chama o endereço de retorno. */
function navegador(passos) {
  const visto = {};
  let terminou;
  const fim = new Promise(ok => (terminou = ok));
  const abrir = url => {
    const u = new URL(url);
    Object.assign(visto, Object.fromEntries(u.searchParams));
    (async () => {
      for (const passo of passos) {
        const q = new URLSearchParams(passo(visto));
        const r = await fetch(`${visto.redirect_uri}/?${q}`);
        (visto.respostas ||= []).push(r.status);
        await r.text();
      }
    })().catch(e => { visto.erroNavegador = e; }).finally(terminou);
  };
  return { abrir, visto, fim };
}

test("refresh token: fluxo completo com PKCE, state e loopback", async () => {
  const tk = await tokenFalso(() => [200, { access_token: "ya29.x", expires_in: 3599, refresh_token: "1//teste-refresh", scope: ESCOPO, token_type: "Bearer" }]);
  const nav = navegador([
    () => ({ code: "roubado", state: "estado-errado" }),   // resposta de outra tentativa: deve ser recusada
    v => ({ code: "codigo-bom", state: v.state, scope: ESCOPO }),
  ]);
  try {
    const t = await obterRefreshToken({ clientId: " 123-abc.apps.googleusercontent.com ", clientSecret: "'GOCSPX-seg'", log: () => {},
      abrirNavegador: nav.abrir, urlToken: tk.url, prazoMs: 5000 });
    assert.equal(t.refresh_token, "1//teste-refresh");
    await nav.fim;

    const v = nav.visto;
    assert.equal(v.erroNavegador, undefined);
    assert.equal(v.scope, "https://www.googleapis.com/auth/adwords");
    assert.equal(v.access_type, "offline");
    assert.equal(v.prompt, "consent");
    assert.equal(v.response_type, "code");
    assert.equal(v.code_challenge_method, "S256");
    assert.match(v.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(v.client_id, "123-abc.apps.googleusercontent.com");   // espaços removidos
    assert.deepEqual(v.respostas, [400, 200]);

    assert.equal(tk.pedidos.length, 1, "só o código com state certo é trocado");
    const p = tk.pedidos[0];
    assert.equal(p.code, "codigo-bom");
    assert.equal(p.grant_type, "authorization_code");
    assert.equal(p.redirect_uri, v.redirect_uri);
    assert.equal(p.client_secret, "GOCSPX-seg");                         // aspas removidas
    assert.equal(createHash("sha256").update(p.code_verifier).digest("base64url"), v.code_challenge);
  } finally { tk.fechar(); }
});

test("refresh token: usuário cancela (access_denied)", async () => {
  const nav = navegador([v => ({ error: "access_denied", state: v.state })]);
  await assert.rejects(
    obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "s", log: () => {}, abrirNavegador: nav.abrir, prazoMs: 5000 }),
    e => e instanceof ErroAmigavel && /não foi concedida/.test(e.message) && /Usuários de teste/.test(e.message));
});

test("refresh token: Client secret errado (invalid_client)", async () => {
  const tk = await tokenFalso(() => [401, { error: "invalid_client", error_description: "Unauthorized" }]);
  const nav = navegador([v => ({ code: "c", state: v.state })]);
  try {
    await assert.rejects(
      obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "errado", log: () => {}, abrirNavegador: nav.abrir, urlToken: tk.url, prazoMs: 5000 }),
      e => e instanceof ErroAmigavel && /Client ID ou o Client secret/.test(e.message) && /Unauthorized/.test(e.message));
  } finally { tk.fechar(); }
});

test("refresh token: cliente OAuth do tipo errado (redirect_uri_mismatch)", async () => {
  const tk = await tokenFalso(() => [400, { error: "redirect_uri_mismatch" }]);
  const nav = navegador([v => ({ code: "c", state: v.state })]);
  try {
    await assert.rejects(
      obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "s", log: () => {}, abrirNavegador: nav.abrir, urlToken: tk.url, prazoMs: 5000 }),
      e => e instanceof ErroAmigavel && /App para computador/.test(e.message));
  } finally { tk.fechar(); }
});

test("refresh token: Google não manda refresh_token", async () => {
  const tk = await tokenFalso(() => [200, { access_token: "ya29.x", expires_in: 3599 }]);
  const nav = navegador([v => ({ code: "c", state: v.state })]);
  try {
    await assert.rejects(
      obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "s", log: () => {}, abrirNavegador: nav.abrir, urlToken: tk.url, prazoMs: 5000 }),
      e => e instanceof ErroAmigavel && /myaccount\.google\.com\/permissions/.test(e.message));
  } finally { tk.fechar(); }
});

test("refresh token: sem internet na troca do código", async () => {
  const nav = navegador([v => ({ code: "c", state: v.state })]);
  await assert.rejects(
    obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "s", log: () => {}, abrirNavegador: nav.abrir,
      urlToken: "http://127.0.0.1:1/token", prazoMs: 5000 }),
    e => e instanceof ErroAmigavel && /sem internet/.test(e.message));
});

test("refresh token: tempo esgotado e campos vazios", async () => {
  await assert.rejects(
    obterRefreshToken({ clientId: "x.apps.googleusercontent.com", clientSecret: "s", log: () => {}, abrirNavegador: () => {}, prazoMs: 150 }),
    e => e instanceof ErroAmigavel && /Tempo esgotado/.test(e.message));
  await assert.rejects(obterRefreshToken({ clientId: "", clientSecret: "s", log: () => {} }), /Falta o Client ID/);
  await assert.rejects(obterRefreshToken({ clientId: "a", clientSecret: "  ", log: () => {} }), /Falta o Client secret/);
});

test("refresh token: argumentos e linha de comando", () => {
  assert.deepEqual(lerArgumentos(["id1", "seg1"]), { abrir: true, ajuda: false, clientId: "id1", clientSecret: "seg1" });
  assert.deepEqual(lerArgumentos(["--client-id=id2", "--client-secret=seg2", "--nao-abrir"]),
    { abrir: false, ajuda: false, clientId: "id2", clientSecret: "seg2" });
  assert.deepEqual(lerArgumentos(["--client-id", "id3", "--client-secret", "seg3"]),
    { abrir: true, ajuda: false, clientId: "id3", clientSecret: "seg3" });
  assert.throws(() => lerArgumentos(["--client-id"]), /Falta o valor/);
  assert.throws(() => lerArgumentos(["--xyz"]), ErroAmigavel);

  const ajuda = spawnSync(process.execPath, [SCRIPT_GOOGLE, "--ajuda"], { encoding: "utf8" });
  assert.equal(ajuda.status, 0);
  assert.match(ajuda.stdout, /App para computador/);
  const ruim = spawnSync(process.execPath, [SCRIPT_GOOGLE, "--xyz"], { encoding: "utf8" });
  assert.equal(ruim.status, 1);
  assert.match(ruim.stderr, /Opção desconhecida/);
  const vazio = spawnSync(process.execPath, [SCRIPT_GOOGLE, "--nao-abrir"], { encoding: "utf8", input: "" });
  assert.equal(vazio.status, 1);
  assert.match(vazio.stderr, /Falta o Client ID/);

  // "não salva nada em disco"
  assert.doesNotMatch(readFileSync(SCRIPT_GOOGLE, "utf8"), /node:fs|writeFile/);
});

/* ============================================================
   popular-demo.mjs
   ============================================================ */

/** Separa o SQL em comandos (ignorando ; dentro de strings e comentários) e confere parênteses. */
function comandosSql(sql) {
  const cmds = [];
  let atual = "", emTexto = false, emComentario = false, prof = 0;
  for (let k = 0; k < sql.length; k++) {
    const ch = sql[k];
    if (emComentario) { if (ch === "\n") emComentario = false; continue; }
    if (emTexto) {
      atual += ch;
      if (ch === "'") { if (sql[k + 1] === "'") { atual += "'"; k++; } else emTexto = false; }
      continue;
    }
    if (ch === "-" && sql[k + 1] === "-") { emComentario = true; continue; }
    if (ch === "'") { emTexto = true; atual += ch; continue; }
    if (ch === "(") prof++;
    if (ch === ")") { prof--; assert.ok(prof >= 0, "parêntese fechando sem abrir"); }
    if (ch === ";") { assert.equal(prof, 0, `parênteses desbalanceados em: ${atual.trim().slice(0, 80)}`); cmds.push(atual.trim()); atual = ""; continue; }
    atual += ch;
  }
  assert.equal(emTexto, false, "string sem fechar");
  assert.equal(atual.trim(), "", "sobrou texto sem ; no fim");
  return cmds;
}

const HOJES = ["2026-09-27", "2026-10-01", "2027-01-01", "2026-03-01"];

test("seed demo: recalculado pelo banco dá os mesmos números do ?demo", () => {
  for (const hoje of HOJES) assert.deepEqual(conferir(montarSeed({ hoje })), [], `hoje = ${hoje}`);
});

test("seed demo: linhas respeitam o esquema e as regras do contrato", () => {
  const seed = montarSeed({ hoje: "2026-09-27" });
  const pk = new Set();
  const somaAd = new Map();
  for (const m of seed.metricas) {
    const chave = [m.plataforma, m.i, m.nivel, m.campanha_ext, m.anuncio_ext].join("|");
    assert.ok(!pk.has(chave), `PK repetida: ${chave}`); pk.add(chave);
    assert.ok(["meta", "google"].includes(m.plataforma));
    assert.ok(m.campanha_ext.startsWith("demo-"));
    if (m.nivel === "campanha") assert.equal(m.anuncio_ext, "");
    else {
      assert.ok(m.anuncio_ext.startsWith("demo-"));
      const k = `${m.campanha_ext}|${m.i}`, s = somaAd.get(k) || { g: 0, conv: 0, imp: 0, cli: 0 };
      s.g += m.gasto; s.conv += m.conversoes; s.imp += m.impressoes; s.cli += m.cliques; somaAd.set(k, s);
    }
    for (const c of ["impressoes", "alcance", "cliques"]) assert.ok(Number.isInteger(m[c]), `${c} inteiro`);
    assert.equal(Math.round(m.gasto * 100) / 100, m.gasto, "gasto em centavos");
    assert.ok(seed.diasAtras(m.i) >= 1, "métrica nunca é de hoje ou do futuro");
  }
  for (const m of seed.metricas.filter(x => x.nivel === "campanha")) {
    const s = somaAd.get(`${m.campanha_ext}|${m.i}`);
    assert.ok(Math.abs(s.g - m.gasto) < 1e-6 && s.conv === m.conversoes && s.imp === m.impressoes && s.cli === m.cliques,
      `campanha = soma dos anúncios (${m.campanha_ext} dia ${m.i})`);
  }
  assert.equal(somaAd.size, seed.metricas.filter(x => x.nivel === "campanha").length);

  const ETAPAS = new Set(["nova", "agendada", "orcamento", "fechou", "nao_fechou", "faltou", "perdida"]);
  for (const L of seed.leads) {
    assert.ok(ETAPAS.has(L.etapa));
    assert.equal(L.origem, "anuncio");
    assert.ok(L.anuncio_ext.startsWith("demo-") && L.campanha_ext.startsWith("demo-"));
    assert.ok(seed.diasAtras(L.i) >= 1, "conversa até ontem");
    assert.equal(L.valor != null, L.etapa === "fechou", "valor só para quem fechou");
    if (L.etapa === "fechou") assert.ok(L.valor > 0);
    const marcou = !["nova", "perdida"].includes(L.etapa);
    assert.equal(L.iAgenda != null, marcou);
    assert.equal(L.iConsulta != null, marcou);
    if (marcou) assert.ok(seed.diasAtras(L.iAgenda) >= 1, "agendamento já aconteceu");
    if (L.etapa === "agendada") assert.ok(seed.diasAtras(L.iConsulta) <= 0, "consulta marcada para hoje ou depois");
    if (["orcamento", "fechou", "nao_fechou", "faltou"].includes(L.etapa)) assert.ok(seed.diasAtras(L.iConsulta) >= 1);
  }
  assert.match(SLUG, /^[a-z0-9-]{2,40}$/);
});

test("seed demo: SQL executável de uma vez e idempotente", () => {
  const seed = montarSeed({ hoje: "2026-09-27" });
  const sql = gerarSql(seed);
  const cmds = comandosSql(sql);
  const tipo = c => c.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  assert.equal(cmds[0], "begin");
  assert.match(cmds[1], /^insert into public\.nx_clientes[\s\S]*on conflict \(slug\) do update/);
  assert.deepEqual(cmds.slice(2, 6).map(tipo), ["delete from public.nx_alertas", "delete from public.nx_relatorios",
    "delete from public.nx_leads", "delete from public.nx_metricas_dia"]);
  const insM = cmds.filter(c => c.startsWith("insert into public.nx_metricas_dia"));
  const insL = cmds.filter(c => c.startsWith("insert into public.nx_leads"));
  assert.ok(insM.every(c => c.endsWith("do nothing")));
  const tuplas = cs => cs.reduce((s, c) => s + (c.match(/^\s+\('/gm) || []).length, 0);
  assert.equal(tuplas(insM), seed.metricas.length);
  assert.equal(tuplas(insL), seed.leads.length);
  assert.equal(cmds.at(-2), "commit");
  assert.match(cmds.at(-1), /^select/);
  assert.equal(cmds.length, 6 + insM.length + insL.length + 2);
  assert.doesNotMatch(sql, /\bNaN\b|undefined|Infinity/);

  const c = contagens(seed);
  assert.equal(c.anuncio + c.campanha, seed.metricas.length);
  assert.equal(Object.values(c.etapas).reduce((a, b) => a + b, 0), seed.leads.length);
});

test("seed demo: arquivo supabase/seed-demo.sql está atualizado", () => {
  const arq = readFileSync(resolve(RAIZ, "supabase/seed-demo.sql"), "utf8");
  const hoje = arq.match(/em (\d{4}-\d{2}-\d{2})\./)?.[1];
  assert.ok(hoje, "cabeçalho com a data de geração");
  assert.equal(arq, gerarSql(montarSeed({ hoje })));
});

/* ============================================================
   .github/workflows/funcoes-supabase.yml (deploy das Edge Functions)
   ============================================================ */
test("workflow de funções: só tag funcoes-*, contents: read, um por vez, portão, lista validada e segredo só por env", () => {
  const y = readFileSync(resolve(RAIZ, ".github/workflows/funcoes-supabase.yml"), "utf8").replace(/\r\n/g, "\n");
  const semComentario = y.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  // gatilho: SÓ push de tag funcoes-* (nada de PR, workflow_run, branch ou disparo manual)
  assert.match(semComentario, /^on:\n {2}push:\n {4}tags: \["funcoes-\*"\]\n\n/m);
  for (const proibido of ["pull_request", "pull_request_target", "workflow_run", "workflow_dispatch", "branches:", "schedule:"]) {
    assert.ok(!semComentario.includes(proibido), `gatilho proibido: ${proibido}`);
  }
  assert.match(semComentario, /^permissions:\n {2}contents: read\n\n/m, "só leitura do repositório");
  assert.match(semComentario, /concurrency:\n {2}group: funcoes-supabase\n {2}cancel-in-progress: false/);
  // nada de github.event em lugar nenhum; ref_name só por variável de ambiente
  assert.doesNotMatch(y, /github\.event/);
  for (const m of semComentario.matchAll(/\$\{\{([^}]*)\}\}/g)) {
    assert.match(m[1].trim(), /^(secrets\.SUPABASE_ACCESS_TOKEN|github\.ref_name)$/, `expressão inesperada: ${m[0]}`);
  }
  const linhasExpr = semComentario.split("\n").filter(l => l.includes("${{"));
  for (const l of linhasExpr) assert.match(l, /^\s+(SUPABASE_ACCESS_TOKEN|TAG): \$\{\{ (secrets\.SUPABASE_ACCESS_TOKEN|github\.ref_name) \}\}$/, `expressão fora de env: ${l.trim()}`);
  // ordem: segredo → checkout → node → portão → montar → CLI fixado → lista → deploy
  const ordem = ["SUPABASE_ACCESS_TOKEN presente", "actions/checkout@", "actions/setup-node@", "node testes/rodar-tudo.mjs",
    "node scripts/montar-funcoes.mjs", "supabase/setup-cli@", "Validar supabase/deploy-lista.txt", "supabase functions deploy"];
  const pos = ordem.map(t => semComentario.indexOf(t));
  assert.ok(pos.every(p => p >= 0), `passos: ${ordem.filter((_, i) => pos[i] < 0).join(", ")}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "passos na ordem");
  // toda action fixada pelo SHA completo do commit (40 hex), com a versão no comentário; nada de @v4/@main
  const usos = [...semComentario.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map(m => m[1].trim());
  assert.deepEqual(usos.map(u => u.split("@")[0]), ["actions/checkout", "actions/setup-node", "supabase/setup-cli"]);
  for (const u of usos) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `action sem SHA de 40 hex + versão: ${u}`);
  assert.match(semComentario, /\n {10}version: 2\.118\.0\n/, "CLI do Supabase fixado em 2.118.0");
  assert.match(semComentario, /if \[ -z "\$\{SUPABASE_ACCESS_TOKEN\}" \]; then/, "falha cedo com o segredo vazio");
  assert.doesNotMatch(semComentario, /echo[^\n]*SUPABASE_ACCESS_TOKEN\}/, "o segredo nunca é impresso");
  assert.match(semComentario, /grep -Eq '\^nx-\[a-z\]\+\$'/, "nome validado com ^nx-[a-z]+$");
  assert.match(semComentario, /\[ ! -f "supabase\/dist\/\$\{fn\}\/index\.ts" \]/, "a pasta montada existe");
  assert.match(semComentario, /supabase functions deploy "\$\{fn\}" --use-api --no-verify-jwt --project-ref "\$\{PROJETO\}"/);
  assert.match(semComentario, /PROJETO: dtjznipitihnwmcgpzqh\n/);
  assert.match(semComentario, /persist-credentials: false/);
  // a lista publicada: nomes válidos, sem repetição, todos montados pelo montar-funcoes
  const lista = readFileSync(resolve(RAIZ, "supabase/deploy-lista.txt"), "utf8").split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
  assert.deepEqual(lista, ["nx-ia", "nx-codewords", "nx-enviar", "nx-whatsapp", "nx-ciclo", "nx-relatorio", "nx-midia"]);
  const montar = readFileSync(resolve(RAIZ, "scripts/montar-funcoes.mjs"), "utf8");
  for (const fn of lista) {
    assert.match(fn, /^nx-[a-z]+$/);
    assert.ok(montar.includes(`"${fn}"`), `${fn} fora do montar-funcoes`);
  }
});

test("workflow de funções: sondas de autenticação (401/403/405) são fatais; a do 413 só avisa e nunca deixa o run vermelho", () => {
  const y = readFileSync(resolve(RAIZ, ".github/workflows/funcoes-supabase.yml"), "utf8").replace(/\r\n/g, "\n");
  const semComentario = y.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  const ini = semComentario.indexOf("- name: Sondas sem segredo");
  assert.ok(ini >= 0, "passo de sondas");
  const sondas = semComentario.slice(ini);
  // fatal: confere soma em falhas e o passo termina com exit 1
  assert.match(sondas, /confere\(\) \{[^\n]*\n[^\n]*::error::[^\n]*falhas=\$\(\(falhas \+ 1\)\)/);
  assert.match(sondas, /if \[ "\$\{falhas\}" -gt 0 \]; then [^\n]*exit 1; fi/);
  for (const [cod, desc] of [[401, "nx-whatsapp POST sem assinatura"], [403, "nx-whatsapp GET com verify token inválido"],
    [401, "nx-codewords ?ch= curto"], [405, "nx-codewords GET"], [401, "nx-enviar ação válida sem sessão"]]) {
    assert.ok(sondas.includes(`confere ${cod} "${desc}"`), `sonda fatal: ${cod} ${desc}`);
  }
  // 413: nunca pela confere; avisa413 emite ::warning:: e não mexe em falhas nem sai
  assert.doesNotMatch(sondas, /confere 413/);
  const avisa = sondas.match(/avisa413\(\) \{[^\n]*\n([^\n]*)\n\s*\}/);
  assert.ok(avisa, "função avisa413");
  assert.match(avisa[1], /::warning::/);
  assert.doesNotMatch(avisa[1], /falhas|exit|::error::/);
  const usos = sondas.match(/^\s+avisa413 "nx-whatsapp [^"]+" "\$\(head -c \d+ \/dev\/zero \| curl [^\n]+-w '%\{http_code\} %\{time_total\}s'[^\n]+\|\| true\)"$/gm) || [];
  assert.equal(usos.length, 2, "2 MiB + 1 com Content-Length e 2,4 MB em pedaços");
  assert.ok(usos.some(l => l.includes("head -c 2097153")) && usos.some(l => l.includes("Transfer-Encoding: chunked")));
});

/* ============================================================
   testes/rodar-tudo.mjs — seleção da suíte (--rapido, --so, --exigir e os plano100-* opcionais)
   ============================================================ */
const FRENTES_PLANO100 = ["banco", "funcoes", "painel", "sistema", "inicio", "crm", "conversas", "agenda", "ads", "automacoes"];

test("rodar-tudo: lista sem repetição, plano100-* das 10 frentes opcionais enquanto não existem, --rapido pula só os lentos, --so filtra, --exigir cobra os ausentes", () => {
  const arquivos = COMANDOS.map(c => c.args.at(-1));
  assert.equal(new Set(arquivos).size, arquivos.length, "sem repetição");
  for (const f of FRENTES_PLANO100) {
    const c = COMANDOS.find(x => x.args.at(-1) === `testes/plano100-${f}.teste.mjs`);
    assert.ok(c && c.opcional && c.args[0] === "--test", `plano100-${f} entra como opcional (node --test)`);
  }
  for (const c of COMANDOS) if (!c.opcional) assert.ok(existsSync(resolve(RAIZ, c.args.at(-1))), `obrigatório existe: ${c.args.at(-1)}`);
  const tudo = selecionar([], () => true);
  assert.equal(tudo.rodar.length, COMANDOS.length); assert.deepEqual(tudo.pulados, []); assert.deepEqual(tudo.ausentes, []);
  const semNada = selecionar([], () => false);
  assert.equal(semNada.ausentes.length, FRENTES_PLANO100.length); assert.equal(semNada.rodar.length, COMANDOS.length - FRENTES_PLANO100.length);
  assert.equal(selecionar(["--exigir"], () => false).rodar.length, COMANDOS.length, "--exigir não pula os ausentes (o node falha ao não achar o arquivo)");
  const lentos = COMANDOS.filter(c => c.lento).map(c => c.args.at(-1));
  for (const f of ["testes/app.teste.mjs", "testes/dev-falso.teste.mjs", "testes/plano50-sistema.teste.mjs"]) assert.ok(lentos.includes(f), `${f} é lento`);
  const rapido = selecionar(["--rapido"], () => true);
  assert.deepEqual(rapido.pulados, lentos); assert.equal(rapido.rodar.length, COMANDOS.length - lentos.length);
  assert.ok(rapido.rodar.some(a => a.at(-1) === "testes/scripts.teste.mjs"), "este arquivo roda no modo rápido");
  const so = selecionar(["--so", "plano100", "--exigir"], () => true);
  assert.equal(so.rodar.length, FRENTES_PLANO100.length); assert.ok(so.rodar.every(a => a.at(-1).includes("plano100")));
  assert.deepEqual(selecionar(["--so", "nao-existe-nada"], () => true).rodar, []);
  // a ordem continua a de antes: painel primeiro, isolamento (e o banco do plano 100) por último
  assert.equal(arquivos[0], "testes/painel.teste.mjs");
  assert.deepEqual(arquivos.slice(-2), ["testes/isolamento.teste.mjs", "testes/plano100-banco.teste.mjs"]);
});

test("rodar-tudo pela linha de comando: --so roda só o que casa e resume; filtro sem arquivo sai com código 1 e explica", () => {
  const r = spawnSync(process.execPath, ["testes/rodar-tudo.mjs", "--so", "isolamento"], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /=== OK · --test testes\/isolamento\.teste\.mjs/);
  assert.match(r.stdout, /Suíte final: 1\/1 arquivos passaram\./);
  const nada = spawnSync(process.execPath, ["testes/rodar-tudo.mjs", "--so", "xyz-nao-existe"], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(nada.status, 1);
  assert.match(nada.stderr, /nenhum arquivo casa com --so xyz-nao-existe/);
});

/* ============================================================
   scripts/rodar-local.mjs — smokes SQL no PGlite (H4): runner próprio (SQL em LF, stubs, --ate/--sem); sem a dependência só explica
   ============================================================ */
test("rodar-local: detecta o PGlite, lê o SQL em LF (a 20261003a casa a âncora com \\n), conta OK…/VERDE… como passou, --ate/--sem/--sem-b e prefixos; sem o PGlite explica (código 2)", () => {
  assert.equal(temPglite(() => "file:///x/node_modules/@electric-sql/pglite/dist/index.js"), true);
  assert.equal(temPglite(() => { throw new Error("Cannot find package"); }), false);
  assert.equal(temPglite(), existsSync(resolve(RAIZ, "node_modules/@electric-sql/pglite/package.json")), "a detecção real bate com o que está em node_modules");
  assert.match(MENSAGEM_SEM_PGLITE, /npm install/);
  assert.doesNotMatch(MENSAGEM_SEM_PGLITE, /--no-save/, "a instalação é a do package.json (devDependencies), não um --no-save avulso");
  assert.equal(normalizarLf("a\r\nb\rc\n"), "a\nb\nc\n");
  for (const m of ["OK_19_ENTRADA_LEAD_RASTREIO — telefone…", "VERDE 03_plataforma: 169 casos", "07_relatorios: VERDE · nx_rel_vendas", "OK 09_isolamento — org Nexus", "todos os casos passaram"]) assert.ok(passou(m), m);
  for (const m of ["FALHOU: existe o gestor atual", "nx_codewords_sync_gravar: âncora encontrada 0 vez(es), esperava 1", ""]) assert.equal(passou(m), false, m || "(vazio)");
  assert.deepEqual(lerArgs(["18", "19", "--ate", "20261008a", "--sem", "20261003a", "--sem", "20261004a"]), { prefixos: ["18", "19"], ate: "20261008a", sem: ["20261003a", "20261004a"] });
  assert.deepEqual(lerArgs(["--sem-b", "13"]), { prefixos: ["13"], ate: "20261001b", sem: [] });
  assert.throws(() => lerArgs(["--xyz"]), /opção desconhecida/);
  const arqs = ["20261002b_z.sql", "LEIA.md", "20261001a_x.sql", "20261001b_y.sql"];
  assert.deepEqual(selecionarMigracoes(arqs, { ate: "20261002b", sem: ["20261001b"] }), [{ arquivo: "20261001a_x.sql", pulada: false }, { arquivo: "20261001b_y.sql", pulada: true }], "--ate para antes do prefixo; --sem só marca");
  assert.deepEqual(selecionarMigracoes(arqs).map(m => m.arquivo), ["20261001a_x.sql", "20261001b_y.sql", "20261002b_z.sql"], "em ordem, só .sql");
  assert.deepEqual(selecionarSmokes(["19_a.sql", "02_b.sql", "rodar-local.mjs", "18_c.sql"], ["18", "19"]), ["18_c.sql", "19_a.sql"]);
  assert.equal(selecionarSmokes(["19_a.sql", "02_b.sql"]).length, 2, "sem prefixos, todos");
  for (const s of [/create table cron\.job\b/, /cron\.job_run_details/, /net\.http_post/, /vault\.decrypted_secrets/, /storage\.objects/, /create role service_role/]) assert.match(STUBS, s);
  const pkg = JSON.parse(readFileSync(resolve(RAIZ, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies && pkg.devDependencies["@electric-sql/pglite"], "PGlite em devDependencies");
  assert.equal(pkg.dependencies, undefined, "nada de dependência de produção: o front não tem build e as funções são Deno");
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.smokes, "node scripts/rodar-local.mjs");
  assert.equal(pkg.scripts.test, "node testes/rodar-tudo.mjs");
  const script = readFileSync(resolve(RAIZ, "scripts/rodar-local.mjs"), "utf8");
  assert.match(script, /chamadoDireto/, "importável sem rodar");
  assert.doesNotMatch(script, /supabase\.co|cron_token|sb_secret|eyJ/, "nunca toca o banco real nem carrega segredo");
  // opção desconhecida sai com 2 antes de carregar o PGlite (barato)
  const r = spawnSync(process.execPath, ["scripts/rodar-local.mjs", "--xyz"], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(r.status, 2); assert.match(r.stderr, /opção desconhecida: --xyz/);
});

test("rodar-local no PGlite de verdade: TODAS as migrações do repositório aplicam (a 20261003a inclusive, graças ao LF) e os smokes 18 e 19 passam", { skip: !temPglite() && "PGlite não instalado (npm install)" }, async () => {
  const linhas = [];
  const r = await rodar({ prefixos: ["18", "19"], log: l => linhas.push(l), erro: l => linhas.push(l) });
  assert.equal(r.codigo, 0, linhas.join("\n"));
  const migs = readdirSync(resolve(RAIZ, "supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
  assert.deepEqual(r.migracoes.map(m => m.arquivo), migs, "todas as migrações, em ordem, nenhuma pulada");
  assert.ok(r.migracoes.every(m => !m.pulada));
  assert.ok(r.migracoes.some(m => m.arquivo.startsWith("20261003a")), "a migração que casa a âncora por texto aplicou");
  assert.deepEqual(r.smokes.map(s => [s.arquivo.slice(0, 2), s.ok]), [["18", true], ["19", true]]);
  assert.match(r.smokes[0].mensagem, /^OK_18_/); assert.match(r.smokes[1].mensagem, /^OK_19_/);
  assert.match(linhas.at(-1), /^todos ok$/);
});
