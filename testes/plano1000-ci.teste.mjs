/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente srv, lote srv-2 (parte CI/operação)
   node --test testes/plano1000-ci.teste.mjs
   Um caso por item SV-… (cada um falha no estado anterior): smokes locais com falha esperada declarada (SV-153/154/155/156/131/168),
   relógio controlado (SV-157/158/159), portões do deploy (SV-160/161/163/262/277), carga local (SV-167), lint de migração (SV-169)
   e testes estáticos das migrações (SV-130/133/214), fixtures da Cloud API (SV-192), idempotência das funções com banco falso com
   estado (SV-246/247/248) e o backup (SV-186). Sem rede, sem banco real: PostgREST/Graph/CodeWords são dublês; o SQL roda no PGlite.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESPERADAS, AJUSTES_SESSAO, resumir, STUBS, MIGRACOES, temPglite, lerSql, semExtensoesFalsas, selecionarMigracoes } from "../scripts/rodar-local.mjs";
import { lintMigracao, mascarar, definicoesFuncoes, arquivosConferidos, PRIMEIRA_CONFERIDA } from "../scripts/lint-migracoes.mjs";
import { lerArgsCarga, lerPlano, resumirPlanos, PADRAO as CARGA_PADRAO, MEDIDAS } from "../scripts/carga-local.mjs";
import { COMANDOS, selecionar, ambienteDaSuite } from "./rodar-tudo.mjs";
import { interpretarAgora, fixarRelogio, restaurarRelogio, relogioFixado } from "./apoio/relogio.mjs";
import { evento, mensagem, recibo, TIPOS_FIXTURE, MENSAGENS } from "./apoio/meta-fixtures.mjs";
import { montarPayload, TIPOS, TIPOS_EXTRAS } from "../scripts/simular-webhook.mjs";
import { normalizarMensagem } from "../supabase/functions/_compartilhado/conversas.js";
import { tratar as webhook } from "../supabase/functions/_compartilhado/webhook.js";
import { tratar as enviar } from "../supabase/functions/_compartilhado/enviar.js";
import { tratar as codewords } from "../supabase/functions/_compartilhado/codewords.js";
import { tratar as ciclo } from "../supabase/functions/_compartilhado/ciclo.js";
import { tratar as relatorio } from "../supabase/functions/_compartilhado/relatorio.js";
import { tratar as midia } from "../supabase/functions/_compartilhado/midia.js";
import { tratar as ia } from "../supabase/functions/_compartilhado/ia_conversas.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = p => readFileSync(join(RAIZ, p), "utf8").replace(/\r\n/g, "\n");
const SMOKES = join(RAIZ, "supabase", "testes");
const migracoes = readdirSync(MIGRACOES).filter(f => f.endsWith(".sql")).sort();

/** Bloco «run: |» de um passo do workflow (pelo começo do nome), sem a indentação. */
function passo(yml, nome) {
  const linhas = yml.split("\n");
  const i = linhas.findIndex(l => new RegExp(`^\\s*- name: ${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(l));
  assert.ok(i >= 0, `passo «${nome}»`);
  const j = linhas.findIndex((l, k) => k > i && /^\s*run: \|\s*$/.test(l));
  const ind = linhas[j].indexOf("run:") + 2, bloco = [];
  for (let k = j + 1; k < linhas.length; k++) {
    const l = linhas[k];
    if (l.trim() && l.length - l.trimStart().length < ind) break;
    bloco.push(l.slice(ind));
  }
  return bloco.join("\n");
}
const temBash = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).stdout?.trim() === "ok";
const temGit = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;

/* ================================================================== SV-153/155/168: rodar-local */
test("SV-153 rodar-local: ESPERADAS só com o 02 (com motivo); saída 0 só quando todo smoke FORA da lista passa", () => {
  assert.deepEqual(Object.keys(ESPERADAS), ["02_acesso.sql"]);
  assert.match(ESPERADAS["02_acesso.sql"], /gestor/);
  const ok = (arquivo, passou = true) => ({ arquivo, ok: passou });
  assert.deepEqual(resumir([ok("01_base.sql"), ok("02_acesso.sql", false), ok("03_x.sql")]),
    { codigo: 0, falhas: [], esperadas: ["02_acesso.sql"], esperadasQuePassaram: [] });
  assert.equal(resumir([ok("01_base.sql"), ok("02_acesso.sql", false), ok("04_crm.sql", false)]).codigo, 1, "falha fora da lista derruba");
  assert.deepEqual(resumir([ok("02_acesso.sql")]).esperadasQuePassaram, ["02_acesso.sql"], "esperada que passou vira aviso, não falha");
  assert.equal(resumir([]).codigo, 1, "nenhum smoke não é verde");
  // o CI roda TODOS (sem lista manual) e o deploy também
  const ci = ler(".github/workflows/ci.yml");
  assert.match(ci, /- name: Smokes SQL locais \(PGlite\)\n\s+run: node scripts\/rodar-local\.mjs\n/);
  assert.doesNotMatch(ci, /rodar-local\.mjs 01 03/);
});

test("SV-155/SV-168 rodar-local: teto de tempo do PGlite (nx.teste_lento_ms = 6000) antes dos smokes e default privileges do Supabase nos stubs", () => {
  assert.match(AJUSTES_SESSAO, /set nx\.teste_lento_ms = '6000'/);
  const src = ler("scripts/rodar-local.mjs");
  assert.ok(src.indexOf("await db.exec(AJUSTES_SESSAO)") > 0 && src.indexOf("await db.exec(AJUSTES_SESSAO)") < src.indexOf("for (const f of lista)"), "ajuste antes dos smokes");
  assert.match(STUBS, /alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;/);
  assert.ok(STUBS.indexOf("alter default privileges") < STUBS.indexOf("create schema if not exists extensions"), "antes de qualquer função");
  const b = ler("supabase/testes/04_crm_b.sql");
  assert.doesNotMatch(b, /ms < 2000/, "nenhum teto fixo de 2 s");
  assert.match(b, /teto numeric := coalesce\(nullif\(current_setting\('nx\.teste_lento_ms', true\), ''\)::numeric, 2000\)/, "padrão 2000 no banco real");
  assert.equal((b.match(/ms < teto/g) || []).length, 11);
});

test("SV-154/SV-156/SV-131 anâncoras dos smokes: 17 em UTC, 04 com consulta no futuro, 09 com a lista pública do anon", () => {
  for (const f of readdirSync(SMOKES).filter(x => x.endsWith(".sql"))) {
    const s = readFileSync(join(SMOKES, f), "utf8");
    assert.doesNotMatch(s, /to_char\(now\(\)(?!\s+at time zone)[^)]*"Z"/, `${f}: to_char(now(), …"Z") escreve a hora LOCAL com Z`);
  }
  const s04 = ler("supabase/testes/04_crm.sql");
  assert.doesNotMatch(s04, /'consulta_em', '2026-10-05/, "data fixa que já passou");
  assert.match(s04, /dC date := \(now\(\) at time zone 'America\/Sao_Paulo'\)::date \+ 7;/);
  const s09 = ler("supabase/testes/09_isolamento.sql");
  assert.match(s09, /anon executa função fora da lista pública/);
  for (const fn of ["nx_entrar", "nx_criar_conta", "nx_convite_ver", "nx_convite_aceitar", "nx_senha_redefinir", "nx_lead_entrada", "nx_rastreio_registrar", "nx_marca_publica"])
    assert.ok(s09.includes(`'${fn}'`), fn);
});

/* PGlite de verdade: os smokes corrigidos passam; função interna nova sem revoke vira executável por anon (default privileges) e
   o smoke 09 a acusa pelo nome; o 17 passa com a sessão em São Paulo e em UTC. */
test("SV-131/154/155/156/168 no PGlite: 04, 04_crm_b, 09 e 17 verdes; função interna sem revoke → anon executa e o 09 FALHA com o nome", { skip: !temPglite() && "PGlite não instalado (npm install)", timeout: 300_000 }, async () => {
  const [{ PGlite }, { pgcrypto }, { uuid_ossp }, { pg_trgm }, { unaccent }] = await Promise.all([
    import("@electric-sql/pglite"), import("@electric-sql/pglite/contrib/pgcrypto"), import("@electric-sql/pglite/contrib/uuid_ossp"),
    import("@electric-sql/pglite/contrib/pg_trgm"), import("@electric-sql/pglite/contrib/unaccent")]);
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm, unaccent } });
  const smoke = async f => {
    try { await db.exec(lerSql(join(SMOKES, f))); return "sem exceção"; }
    catch (e) { try { await db.exec("rollback"); } catch { /* sem transação */ } return String(e.message); }
  };
  try {
    await db.exec(STUBS);
    for (const m of selecionarMigracoes(readdirSync(MIGRACOES))) await db.exec(semExtensoesFalsas(lerSql(join(MIGRACOES, m.arquivo))));
    await db.exec(AJUSTES_SESSAO);
    assert.match(await smoke("04_crm.sql"), /^OK 04_crm/);
    assert.match(await smoke("04_crm_b.sql"), /^OK 04_crm_b/);
    assert.match(await smoke("09_isolamento.sql"), /^OK 09_isolamento/);
    await db.exec("set timezone = 'America/Sao_Paulo'");
    assert.match(await smoke("17_codewords_gemea_midia.sql"), /^OK_17_/, "17 com a sessão em São Paulo");
    await db.exec("set timezone = 'UTC'");
    assert.match(await smoke("17_codewords_gemea_midia.sql"), /^OK_17_/, "17 com a sessão em UTC");
    // SV-168: sem revoke, a função nova nasce executável por anon/authenticated (como no Supabase)
    await db.exec("create function public.nx_interna_sem_revoke(p_x int) returns int language sql as 'select 1'");
    const r = await db.query("select has_function_privilege('anon', 'public.nx_interna_sem_revoke(int)', 'execute') a, has_function_privilege('authenticated', 'public.nx_interna_sem_revoke(int)', 'execute') b");
    assert.deepEqual(r.rows[0], { a: true, b: true });
    // SV-131: o 09 acusa a função pelo nome
    assert.match(await smoke("09_isolamento.sql"), /anon executa função fora da lista pública \(sem p_token\): nx_interna_sem_revoke\(integer\)|authenticated não executa nx_interna_sem_revoke/);
  } finally { await db.close(); }
});

/* ================================================================== SV-157/158/159: relógio */
test("SV-157 relogio.mjs: ORBITA_AGORA em ISO, HH:MMZ (hoje) e dia1THH:MMZ; o relógio anda a partir do instante; new Date(x) e instanceof intactos", () => {
  const real = Date.parse("2026-10-13T15:20:00Z");
  assert.equal(interpretarAgora("2026-11-01T02:59:00Z", real), Date.parse("2026-11-01T02:59:00Z"));
  assert.equal(interpretarAgora("02:50Z", real), Date.parse("2026-10-13T02:50:00Z"));
  assert.equal(interpretarAgora("dia1T03:05Z", real), Date.parse("2026-10-01T03:05:00Z"));
  assert.equal(interpretarAgora("", real), null);
  assert.throws(() => interpretarAgora("amanhã", real), /ORBITA_AGORA inválido/);
  try {
    fixarRelogio("2026-12-31T23:00:00Z");
    assert.ok(relogioFixado());
    assert.ok(Math.abs(Date.now() - Date.parse("2026-12-31T23:00:00Z")) < 5000);
    assert.ok(Math.abs(new Date().getTime() - Date.parse("2026-12-31T23:00:00Z")) < 5000);
    assert.equal(new Date(5).toISOString(), "1970-01-01T00:00:00.005Z");
    assert.ok(new Date() instanceof Date);
    assert.equal(typeof Date(), "string");
  } finally { restaurarRelogio(); }
  assert.ok(!relogioFixado());
  assert.ok(Math.abs(Date.now() - performance.timeOrigin - performance.now()) < 5000, "relógio real de volta");
});

test("SV-157 rodar-tudo: ORBITA_AGORA põe o relogio.mjs no NODE_OPTIONS (os filhos do node --test herdam); sem ele, nada muda", () => {
  const sem = ambienteDaSuite({ PATH: "x" });
  assert.equal(sem.NODE_OPTIONS, undefined); assert.equal(sem.ORBITA_COMPLETO, "1");
  const com = ambienteDaSuite({ ORBITA_AGORA: "02:50Z", NODE_OPTIONS: "--max-old-space-size=512" });
  assert.match(com.NODE_OPTIONS, /^--max-old-space-size=512 --import=file:\/\/.*testes\/apoio\/relogio\.mjs$/);
  assert.equal(ambienteDaSuite(com).NODE_OPTIONS, com.NODE_OPTIONS, "não repete o --import");
  // de verdade: um processo filho com esse ambiente nasce com o relógio fixado
  const r = spawnSync(process.execPath, ["-e", "console.log(new Date().toISOString())"], { env: { ...process.env, ...ambienteDaSuite({ ...process.env, ORBITA_AGORA: "2026-11-01T02:50:00Z" }) }, encoding: "utf8" });
  assert.match(r.stdout, /^2026-11-01T02:50:0\d\.\d{3}Z/);
  // matriz no CI: TZ × agora, sobre o rodar-tudo
  const ci = ler(".github/workflows/ci.yml");
  assert.match(ci, /tz: \["UTC", "America\/Sao_Paulo"\]/);
  assert.match(ci, /agora: \["02:50Z", "dia1T03:05Z"\]/);
  assert.match(ci, /ORBITA_AGORA: \$\{\{ matrix\.agora \}\}/);
  assert.match(ci, /TZ: \$\{\{ matrix\.tz \}\}/);
});

test("SV-158/SV-159 plano100-crm e plano100-agenda fixam o relógio ANTES de carregar os módulos (meio-dia de quarta / quinta 10:00 em SP)", () => {
  for (const [arq, instante] of [["testes/plano100-crm.teste.mjs", "2026-10-14T12:00:00-03:00"], ["testes/plano100-agenda.teste.mjs", "2026-10-15T10:00:00-03:00"]]) {
    const s = ler(arq);
    const fixa = s.indexOf(`fixarRelogio("${instante}")`);
    assert.ok(fixa > 0, `${arq}: fixarRelogio(${instante})`);
    assert.match(s, /import \{ fixarRelogio \} from "\.\/apoio\/relogio\.mjs";/);
    assert.ok(fixa < s.indexOf('await import("../web/app/'), `${arq}: antes do import dos módulos`);
  }
  assert.equal(new Date(Date.parse("2026-10-15T10:00:00-03:00")).getUTCDay(), 4, "quinta");
});

/* ================================================================== SV-160/161/163/262/277: portões */
test("SV-160 plano100-* obrigatórios; plano1000-ci registrado (opcional); o deploy roda com --exigir e falha com arquivo listado que sumiu", () => {
  for (const c of COMANDOS.filter(c => /plano100-/.test(c.args.at(-1)))) assert.ok(!c.opcional, c.args.at(-1));
  assert.ok(COMANDOS.some(c => c.args.at(-1) === "testes/plano1000-ci.teste.mjs" && c.opcional && c.args[0] === "--test"));
  const semPlano100 = selecionar([], f => !f.includes("plano100-crm"));
  assert.ok(semPlano100.rodar.some(a => a.at(-1) === "testes/plano100-crm.teste.mjs"), "plano100 sumido continua na lista (o node falha)");
  assert.ok(selecionar(["--exigir"], () => false).rodar.some(a => a.at(-1) === "testes/plano1000-ci.teste.mjs"), "--exigir cobra os plano1000-* também");
  const y = ler(".github/workflows/funcoes-supabase.yml");
  assert.match(y, /run: node testes\/rodar-tudo\.mjs --exigir/);
});

test("SV-161 deploy: o token é CONFERIDO na API de gestão antes de tudo (sem imprimir) — 401 falha com «renove SUPABASE_ACCESS_TOKEN», 200 segue", { skip: !temBash && "sem bash" }, () => {
  const y = ler(".github/workflows/funcoes-supabase.yml");
  const corpo = passo(y, "Segredo SUPABASE_ACCESS_TOKEN presente e válido");
  assert.match(corpo, /https:\/\/api\.supabase\.com\/v1\/projects\/\$\{PROJETO\}/);
  assert.ok(y.indexOf("Segredo SUPABASE_ACCESS_TOKEN presente e válido") < y.indexOf("actions/checkout@"), "1º passo, antes do checkout e da suíte");
  const dir = mkdtempSync(join(tmpdir(), "orbita-curl-"));
  try {
    writeFileSync(join(dir, "curl"), "#!/bin/sh\nprintf '%s' \"$CODIGO_FALSO\"\n", { mode: 0o755 });
    const rodar = (codigo, token = "tok-falso-123") => spawnSync("bash", ["-c", corpo], { encoding: "utf8",
      env: { ...process.env, PATH: `${dir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, CODIGO_FALSO: codigo, SUPABASE_ACCESS_TOKEN: token, PROJETO: "projfalso", TAG: "funcoes-x" } });
    const ruim = rodar("401");
    assert.equal(ruim.status, 1);
    assert.match(ruim.stdout, /renove SUPABASE_ACCESS_TOKEN/);
    assert.doesNotMatch(ruim.stdout + ruim.stderr, /tok-falso-123/, "o token nunca aparece");
    const bom = rodar("200");
    assert.equal(bom.status, 0, bom.stdout + bom.stderr);
    assert.doesNotMatch(bom.stdout, /tok-falso-123/);
    assert.equal(rodar("200", "").status, 1, "vazio falha antes");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SV-277 deploy: tag só de commit que está na main (merge-base --is-ancestor); tag -volta é exceção", { skip: (!temBash || !temGit) && "sem bash/git" }, () => {
  const y = ler(".github/workflows/funcoes-supabase.yml");
  const corpo = passo(y, "Portão — a tag aponta para um commit da main");
  assert.match(y, /fetch-depth: 0/);
  const dir = mkdtempSync(join(tmpdir(), "orbita-git-"));
  const git = (...a) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    git("init", "-q"); git("commit", "-q", "--allow-empty", "-m", "a");
    const naMain = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", naMain);
    git("commit", "-q", "--allow-empty", "-m", "b (só na branch)");
    const foraDaMain = git("rev-parse", "HEAD");
    const rodar = (sha, tag) => spawnSync("bash", ["-c", corpo], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_SHA: sha, TAG: tag } });
    const fora = rodar(foraDaMain, "funcoes-20261013-9");
    assert.equal(fora.status, 1); assert.match(fora.stdout, /NÃO está na main/);
    assert.equal(rodar(naMain, "funcoes-20261013-9").status, 0);
    assert.equal(rodar(foraDaMain, "funcoes-20261013-9-volta").status, 0, "tag de volta passa");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SV-262/SV-169 deploy: lint das migrações e PGlite (migrações + smokes) são portões ANTES de publicar; o CI também roda o lint", () => {
  const y = ler(".github/workflows/funcoes-supabase.yml");
  const pos = ["node testes/rodar-tudo.mjs --exigir", "node scripts/lint-migracoes.mjs", "node scripts/rodar-local.mjs", "supabase functions deploy"].map(t => y.indexOf(t));
  assert.ok(pos.every(p => p > 0), String(pos));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  assert.match(passo(y, "Portão — migrações e smokes SQL no PGlite"), /npm ci --no-audit --no-fund\nnode scripts\/rodar-local\.mjs/);
  assert.match(ler(".github/workflows/ci.yml"), /run: node scripts\/lint-migracoes\.mjs/);
});

/* SV-163: as sondas das 7 funções com os códigos que o CÓDIGO devolve de verdade (cada tratar() chamado como a sonda chama) */
const SUPA = "https://fake.supabase.co", FN = `${SUPA}/functions/v1`, ENV = { url: SUPA, chave: "service-role-falsa" };
const resp = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
const semSessao = { token: "sonda-invalida", cliente: "00000000-0000-4000-8000-000000000000" };
const fetchSonda = async (e, i = {}) => {
  const r = new Request(e, i);
  if (r.url.includes("/rest/v1/rpc/")) return resp({ code: "P0001", message: "sessao_invalida" }, 400);
  if (r.url.includes("/rest/v1/nx_config")) return resp([{ id: 1, cron_token: "cron-de-verdade" }]);
  return resp([]);
};
test("SV-163 sondas das 7 funções: nx-ciclo/nx-relatorio 401 sem x-nx-cron, nx-midia/nx-ia 401 sem sessão, GET 405 — o yml espera o que o código devolve", async () => {
  const y = ler(".github/workflows/funcoes-supabase.yml");
  const post = (fn, corpo) => new Request(`${FN}/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const casos = [
    [ciclo, post("nx-ciclo", {}), 401], [ciclo, new Request(`${FN}/nx-ciclo`), 405],
    [relatorio, post("nx-relatorio", {}), 401], [relatorio, new Request(`${FN}/nx-relatorio`), 405],
    [midia, post("nx-midia", { acao: "ver", paths: ["x"], ...semSessao }), 401], [midia, new Request(`${FN}/nx-midia`), 405],
    [ia, post("nx-ia", { acao: "sugerir", conversa: 1, ...semSessao }), 401], [ia, new Request(`${FN}/nx-ia`), 405],
    [enviar, post("nx-enviar", { acao: "texto", ...semSessao }), 401], [enviar, new Request(`${FN}/nx-enviar`), 405],
  ];
  for (const [tratar, req, esperado] of casos) {
    const r = await tratar(req, ENV, { fetch: fetchSonda, ia: async () => ({}) });
    assert.equal(r.status, esperado, `${req.method} ${req.url}`);
  }
  for (const s of ['sonda 401 "${fn} POST sem x-nx-cron"', 'sonda 405 "${fn} GET"', 'sonda 401 "nx-midia «ver» sem sessão"', 'sonda 405 "nx-midia GET"',
    'sonda 401 "nx-ia «sugerir» sem sessão"', 'sonda 405 "nx-ia GET"', 'sonda 405 "nx-enviar GET"', 'sonda 401 "nx-whatsapp POST sem assinatura"', 'sonda 405 "nx-codewords GET"'])
    assert.ok(y.includes(s), s);
  assert.match(y, /for fn in nx-ciclo nx-relatorio; do/);
  assert.match(y, /"acao\\":\\"ver\\",\\"paths\\":\[\\"x\\"\]/);
  assert.match(y, /"acao\\":\\"sugerir\\",\\"conversa\\":1/);
  // SV-164 (outra frente): a sonda confere o x-orbita-versao = <tag>+…
  assert.match(y, /grep -i '\^x-orbita-versao:'/);
  assert.match(y, /\$\{versao#"\$\{TAG\}\+"\}/);
});

/* ================================================================== SV-167: carga local */
test("SV-167 carga-local: argumentos/variáveis com limites, leitura do plano do auto_explain e resumo (índices × seq scan)", () => {
  assert.deepEqual(lerArgsCarga([], {}), { ...CARGA_PADRAO });
  assert.equal(lerArgsCarga([], { CONTATOS: "20000" }).contatos, 20000);
  assert.equal(lerArgsCarga(["--contatos", "5000"], { CONTATOS: "20000" }).contatos, 5000, "linha de comando vence o ambiente");
  assert.deepEqual(lerArgsCarga(["--contatos=20.000", "--mensagens", "10", "--dias", "130", "--orcamento", "300", "--planos"], {}),
    { contatos: 20000, mensagens: 10, dias: 130, orcamento: 300, planos: true });
  assert.throws(() => lerArgsCarga(["--contatos", "0"], {}), /contatos deve ser inteiro entre 10 e 200000/);
  assert.throws(() => lerArgsCarga(["--xyz"], {}), /opção desconhecida/);
  assert.throws(() => lerArgsCarga(["--dias"], {}), /precisa de um número/);
  const p = lerPlano("duration: 12.5 ms  plan:\nQuery Text: select * from public.nx_conversas where cliente_id = $1\nLimit  (cost=…)\n  ->  Index Scan using nx_conversas_lista on nx_conversas cv\n  ->  Seq Scan on nx_contatos k");
  assert.equal(p.ms, 12.5); assert.deepEqual(p.indices, ["nx_conversas_lista"]); assert.deepEqual(p.seq, ["nx_contatos"]);
  assert.equal(lerPlano("outro aviso"), null);
  const r = resumirPlanos([p, { ...lerPlano("duration: 1 ms  plan:\nQuery Text: select x\nBitmap Index Scan on nx_contatos_tel_trgm"), consulta: "select x" },
    { ms: 99, consulta: "select public.nx_cv_listar(…)", indices: [], seq: ["nx_mensagens"] }]);
  assert.deepEqual(r.indices, ["nx_contatos_tel_trgm", "nx_conversas_lista"]);
  assert.deepEqual(r.seqGrandes, ["nx_contatos"], "a chamada de fora (select public.nx_…) não conta; seq scan em tabela grande vira alerta");
  assert.deepEqual(MEDIDAS.map(m => m[0].split(" ")[0]).filter((v, i, a) => a.indexOf(v) === i), ["nx_cv_listar", "nx_pulso", "nx_cv_mensagens", "nx_dados", "nx_inicio"]);
});

/* ================================================================== SV-169: lint de migração */
const MIG_BOA = nome => `-- ${nome}
create table if not exists public.nx_coisa (id bigint primary key);
alter table public.nx_coisa add column if not exists nome text;
create index if not exists nx_coisa_nome on public.nx_coisa(nome);
create or replace function public.nx_coisa_limpar(p_cliente uuid) returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin delete from public.nx_coisa where id < 0; get diagnostics n = row_count; return n; end $$;
revoke all on function public.nx_coisa_limpar(uuid) from public, anon, authenticated;
grant execute on function public.nx_coisa_limpar(uuid) to service_role;
insert into public.nx_versao_banco (nome) values ('${nome}') on conflict (nome) do update set aplicada_em = now();
notify pgrst, 'reload schema';
`;
test("SV-169 lint: migração boa passa; drop, delete/truncate fora de função (inclusive em DO), alter column type, create sem if not exists/or replace falham", () => {
  assert.deepEqual(lintMigracao("20261099a_x.sql", MIG_BOA("20261099a_x")), []);
  const regras = sql => lintMigracao("20261099a_x.sql", sql).map(v => v.regra);
  const base = MIG_BOA("20261099a_x");
  const com = extra => base.replace("insert into public.nx_versao_banco", `${extra}\ninsert into public.nx_versao_banco`);
  assert.deepEqual(regras(com("drop table public.nx_velha;")), ["drop"]);
  assert.deepEqual(regras(com("alter table public.nx_coisa drop column nome;")), ["drop"]);
  assert.deepEqual(regras(com("drop index if exists public.nx_coisa_nome;")), ["drop"]);
  assert.deepEqual(regras(com("drop function if exists public.nx_coisa_limpar(uuid);")), ["drop"]);
  assert.deepEqual(regras(com("delete from public.nx_coisa;")), ["apagar"]);
  assert.deepEqual(regras(com("truncate public.nx_coisa;")), ["apagar"]);
  assert.deepEqual(regras(com("do $$ begin delete from public.nx_coisa where id = 1; end $$;")), ["apagar"], "bloco DO roda na migração");
  assert.deepEqual(regras(com("alter table public.nx_coisa alter column nome type varchar(10);")), ["tipo_coluna"]);
  assert.deepEqual(regras(com("create table public.nx_outra (id int);")), ["if_not_exists"]);
  assert.deepEqual(regras(com("create index nx_x on public.nx_coisa(id);")), ["if_not_exists"]);
  assert.deepEqual(regras(com("alter table public.nx_coisa add column idade int;")), ["if_not_exists"]);
  assert.deepEqual(regras(com("create function public.nx_f() returns int language sql as 'select 1';")), ["or_replace"]);
  // comentário e texto em string não contam
  assert.deepEqual(regras(com("-- drop table public.nx_velha;\nselect 'delete from x; drop table y';")), []);
  // exceção anotada
  assert.deepEqual(regras(com("-- lint:permitido índice duplicado criado por engano na 20261099a, sem uso\ndrop index if exists public.nx_coisa_nome;")), []);
  assert.deepEqual(regras(com("drop index if exists public.nx_coisa_nome; -- lint:permitido índice duplicado")), []);
  assert.deepEqual(regras(com("-- lint:permitido\ndrop index if exists public.nx_coisa_nome;")), ["drop"], "sem motivo não vale");
});

test("SV-169 lint: exige versão com o nome do arquivo, notify pgrst no fim e bloco de permissões quando cria função", () => {
  const base = MIG_BOA("20261099a_x");
  const regras = sql => lintMigracao("20261099a_x.sql", sql).map(v => v.regra);
  assert.deepEqual(regras(base.replace("values ('20261099a_x')", "values ('20261099a_outro')")), ["versao"]);
  assert.deepEqual(regras(base.replace("notify pgrst, 'reload schema';\n", "")), ["notify"]);
  assert.deepEqual(regras(base + "select 1;\n"), ["notify"], "notify tem de ser o último comando");
  assert.deepEqual(regras(base.replace(/revoke all[^\n]*\n/, "")), ["permissoes"]);
  assert.deepEqual(regras(base.replace(/revoke all[^\n]*\n/, "select public.nx_revogar_authenticated();\nrevoke execute on function public.nx_coisa_limpar(uuid) from anon;\n")), []);
  assert.deepEqual(regras(base.replace(/revoke all[^\n]*\n/, "-- lint:permitido permissoes: troca o corpo de função existente, privilégios mantidos\n")), []);
  assert.deepEqual(regras(base.replace(/create or replace function[\s\S]*?to service_role;\n/, "")), [], "sem função, sem exigência de permissões");
  // as aplicadas ficam fora; as recentes passam (sem falso positivo)
  assert.equal(PRIMEIRA_CONFERIDA, "20261013c");
  assert.deepEqual(arquivosConferidos(["20261013b_y.sql", "20261013c_z.sql", "20261014a_w.sql", "LEIA.md"]), ["20261013c_z.sql", "20261014a_w.sql"]);
  for (const f of ["20261008a_entrada_lead_rastreio.sql", "20261008b_operacao_seguranca.sql", "20261009d_origem_frase_sem_negocio.sql", "20261013a_operacao_fila_codewords.sql", "20261013b_seguranca_dados.sql"])
    assert.deepEqual(lintMigracao(f, readFileSync(join(MIGRACOES, f), "utf8")), [], f);
  // mascarar preserva o tamanho e as linhas
  const s = "select 'a;b' -- c\n, $$x\ny$$;";
  assert.equal(mascarar(s).length, s.length); assert.equal(mascarar(s).split("\n").length, s.split("\n").length);
});

/* ================================================================== SV-130/214/133: testes estáticos das migrações */
const defsPorArquivo = migracoes.map(f => ({ arquivo: f, sql: readFileSync(join(MIGRACOES, f), "utf8").replace(/\r\n/g, "\n") }))
  .map(m => ({ ...m, defs: definicoesFuncoes(m.sql) }));
/** Funções NOVAS (assinatura nunca vista antes) de cada migração posterior à 20261008b sem bloco de permissões. */
function novasSemPermissao(lista, depoisDe = "20261008b") {
  const vistas = new Set(), problemas = [];
  for (const m of lista) {
    const limpo = m.sql.replace(/--[^\n]*/g, "");
    for (const d of m.defs) {
      const nova = !vistas.has(d.assinatura);
      vistas.add(d.assinatura);
      if (!nova || m.arquivo < depoisDe || m.arquivo.startsWith(depoisDe)) continue;
      const revogaDela = new RegExp(`revoke[^;]*on\\s+function\\s+public\\.${d.nome}\\s*\\([^;]*from[^;]*\\b(public|anon|authenticated)\\b`, "i").test(limpo);
      // ou o laço de permissões da migração (foreach … execute format('revoke all on function %s from public, anon, authenticated'))
      const noLaco = limpo.includes(`'public.${d.nome}(`) && /revoke[^;]*from[^;]*\b(public|anon|authenticated)\b/i.test(limpo);
      if (!revogaDela && !noLaco && !/nx_revogar_authenticated\s*\(/i.test(limpo)) problemas.push(`${m.arquivo}: ${d.assinatura}`);
    }
  }
  return problemas;
}
test("SV-130 toda migração posterior à 20261008b que cria função NOVA tem bloco de permissões explícito (e o teste pega um exemplo sem)", () => {
  assert.deepEqual(novasSemPermissao(defsPorArquivo), []);
  const exemplo = "create or replace function public.nx_nova_interna(p_x int) returns int language sql as $$ select 1 $$;\nnotify pgrst, 'reload schema';\n";
  assert.deepEqual(novasSemPermissao([...defsPorArquivo, { arquivo: "20261099z_exemplo.sql", sql: exemplo, defs: definicoesFuncoes(exemplo) }]),
    ["20261099z_exemplo.sql: nx_nova_interna(int)"]);
  // trocar o corpo de uma função que JÁ existe (mesma assinatura) não exige: os privilégios ficam
  const troca = "create or replace function public.nx_pulso(p_token text, p_cliente uuid) returns json language sql as $$ select null::json $$;";
  assert.deepEqual(novasSemPermissao([...defsPorArquivo, { arquivo: "20261099z_exemplo.sql", sql: troca, defs: definicoesFuncoes(troca) }]), []);
});

/** Na ÚLTIMA definição de cada assinatura: RPC com p_token passa por um portão de sessão (direto ou por outra nx_* que passa). */
const PORTOES_CLIENTE = new Set(["nx_ctx", "nx_fn_ctx"]);
const PORTOES_CONTA = new Set([...PORTOES_CLIENTE, "nx_conta_do_token", "nx_exigir_gestor"]);
function rpcsSemPortao(lista) {
  const ultima = new Map();
  for (const m of lista) for (const d of m.defs) ultima.set(d.assinatura, { ...d, arquivo: m.arquivo });
  const porNome = new Map();
  for (const d of ultima.values()) porNome.set(d.nome, [...(porNome.get(d.nome) || []), d]);
  const chamadas = d => [...new Set([...d.corpo.matchAll(/\bpublic\.(nx_[a-z0-9_]+)\s*\(/gi)].map(x => x[1].toLowerCase()))];
  const alcanca = (nome, portoes, vis = new Set()) => {
    if (portoes.has(nome)) return true;
    if (vis.has(nome)) return false;
    vis.add(nome);
    return (porNome.get(nome) || []).some(d => chamadas(d).some(c => c !== nome && alcanca(c, portoes, vis)));
  };
  const ruins = [];
  for (const d of ultima.values()) {
    if (!d.nome.startsWith("nx_") || !d.params.some(p => p.nome === "p_token") || PORTOES_CONTA.has(d.nome)) continue;
    // a sessão de conta pura (nx_conta_do_token, nx_sair) consulta nx_sessoes pelo hash do token
    const sessaoPropria = /nx_sessoes/.test(d.corpo) && /nx_hash\s*\(\s*p_token\s*\)/.test(d.corpo);
    const tenant = d.params.some(p => p.nome === "p_cliente" && p.tipo === "uuid");
    const ok = tenant
      ? chamadas(d).some(c => c !== d.nome && (alcanca(c, PORTOES_CLIENTE) || c === "nx_exigir_gestor"))
      : sessaoPropria || chamadas(d).some(c => c !== d.nome && alcanca(c, PORTOES_CONTA));
    if (!ok) ruins.push(`${d.arquivo}: ${d.assinatura}`);
  }
  return ruins.sort();
}
test("SV-214 toda RPC nx_* com p_token passa pelo nx_ctx/nx_fn_ctx (as de cliente) ou pela sessão (as de conta) — e uma de exemplo sem nx_ctx é pega", () => {
  assert.deepEqual(rpcsSemPortao(defsPorArquivo), []);
  const ruim = "create or replace function public.nx_vaza(p_token text, p_cliente uuid) returns json language sql security definer set search_path = '' as $$ select json_agg(l) from public.nx_leads l where l.cliente_id = p_cliente $$;";
  assert.deepEqual(rpcsSemPortao([...defsPorArquivo, { arquivo: "20261099z_exemplo.sql", defs: definicoesFuncoes(ruim) }]), ["20261099z_exemplo.sql: nx_vaza(text,uuid)"]);
  const boa = ruim.replace("select json_agg", "select public.nx_ctx(p_token, p_cliente, 'leitura') is not null; select json_agg");
  assert.deepEqual(rpcsSemPortao([...defsPorArquivo, { arquivo: "20261099z_exemplo.sql", defs: definicoesFuncoes(boa) }]), []);
  // o parser entende parênteses aninhados e default com cast
  const [d] = definicoesFuncoes("create or replace function public.nx_t(p_token text, p_valor numeric(10,2) default 0, p_f jsonb default '{}'::jsonb) returns int language sql as $f$ select 1 $f$;");
  assert.equal(d.assinatura, "nx_t(text,numeric(10,2),jsonb)"); assert.deepEqual(d.params.map(p => p.opcional), [false, true, true]); assert.match(d.corpo, /select 1/);
});

test("SV-133 a definição vigente de nx_codewords_sync_gravar e nx_codewords_saida tem a gêmea de MÍDIA do painel (completa na última migração OU a âncora da 20261003a ainda vigente)", () => {
  const MARCA = "-- gêmea de MÍDIA do painel";
  const ancora = defsPorArquivo.find(m => m.arquivo.startsWith("20261003a"));
  assert.ok(ancora, "20261003a existe");
  for (const nome of ["nx_codewords_sync_gravar", "nx_codewords_saida"]) {
    const defs = defsPorArquivo.flatMap(m => m.defs.filter(d => d.nome === nome).map(d => ({ ...d, arquivo: m.arquivo })));
    const ultima = defs.at(-1);
    assert.ok(ultima, nome);
    if (ultima.arquivo > ancora.arquivo) {
      assert.ok(ultima.corpo.includes(MARCA), `${nome}: a última definição (${ultima.arquivo}) foi recriada SEM a gêmea de mídia — copie o corpo VIGENTE`);
    } else {
      // hoje: a 20261003a corrige o corpo em vigor por âncora (replace), sem migração com a versão completa — vale enquanto
      // ninguém recriar a função; a migração falha se não achar a âncora exatamente uma vez e confere as 2 funções no fim
      assert.ok(ancora.sql.includes(`v_marca constant text := '${MARCA}'`));
      assert.ok(ancora.sql.includes(`p.proname = '${nome}'`), `a 20261003a corrige ${nome}`);
      assert.match(ancora.sql, /position\('-- gêmea de MÍDIA do painel' in p\.prosrc\) > 0\) <> 2/);
    }
  }
});

/* ================================================================== SV-192: fixtures da Cloud API */
const CLI_A = "11111111-1111-4111-8111-111111111111";
const K_M = "bbbbbbbb-0000-4000-8000-00000000000b";
const TEL = "5512988887777";
const assinar = (corpo, segredo = "segredo-do-app") => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;

/** PostgREST falso por RPC (handlers com estado) + tabelas por handler + Graph/CodeWords de mentira. */
function dbFalso({ rpcs = {}, tabelas = {}, atraso = 0 } = {}) {
  const chamadas = [];
  const CONFIG = { id: 1, cron_token: "cron-secreto", wa_access_token: "wa-tok", wa_phone_number_id: "900900", wa_template: "nexus_aviso",
    meta_app_secret: "segredo-do-app", wa_verify_token: "verifica-123" };
  const fetch = async (entrada, init = {}) => {
    if (atraso) await new Promise(r => setTimeout(r, atraso));
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    if (u.host === "graph.facebook.com") {
      chamadas.push({ nome: `GRAPH ${req.method} ${u.pathname}`, corpo: req.method === "POST" ? JSON.parse(await req.text() || "{}") : null });
      if (req.method === "POST" && u.pathname.endsWith("/messages")) return resp({ messaging_product: "whatsapp", messages: [{ id: `wamid.SAIDA-${chamadas.length}` }] });
      return resp({ id: "x" });
    }
    if (u.origin !== SUPA) throw new TypeError(`host inesperado: ${u.host}`);
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const nome = u.pathname.split("/").at(-1);
      const corpo = JSON.parse(await req.text() || "{}");
      chamadas.push({ nome, corpo });
      const fn = rpcs[nome];
      if (!fn) return resp({ code: "PGRST202", message: `Could not find the function public.${nome} in the schema cache` }, 404);
      try { return resp(await fn(corpo, chamadas) ?? null); }
      catch (e) { return resp({ code: e.code || "P0001", message: e.message }, e.status || 400); }
    }
    const tabela = u.pathname.replace("/rest/v1/", "");
    const q = Object.fromEntries(u.searchParams);
    chamadas.push({ nome: `${req.method} ${tabela}`, corpo: q });
    if (tabela === "nx_config" && req.method === "GET") return resp([CONFIG]);
    const t = tabelas[tabela];
    if (typeof t === "function") return t({ req, q });
    if (req.method === "GET") return resp(Array.isArray(t) ? t : []);
    return new Response(null, { status: req.method === "POST" ? 201 : 204 });
  };
  return { fetch, chamadas, de: nome => chamadas.filter(c => c.nome === nome) };
}
const postMeta = (s, corpo) => webhook(new Request(`${FN}/nx-whatsapp`, {
  method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) }, body: corpo }), ENV, { fetch: s.fetch, esperar: async () => {} });

/** Banco com ESTADO do caminho do webhook (canal Meta): mensagens por wamid, contatos, conversas, negócios por telefone, fila do
    «fora do horário». As regras de verdade (SQL) estão nos smokes 06/19; aqui só a idempotência que o banco garante. */
function bancoWebhook({ foraHorario = "Estamos fora do horário" } = {}) {
  const E = { mensagens: [], contatos: [], conversas: [], leads: [], fila: [], recibos: [], modelos: [], origens: [] };
  let seq = 1000;
  const canal = { canal_id: K_M, cliente_id: CLI_A, phone_number_id: "TESTE-PID-111", cliente_slug: "a", waba_id: "100000000000001", verify_token: "v", app_secret: null, tem_token: true, status: "ativo" };
  const s = dbFalso({
    rpcs: {
      nx_wa_canal: () => canal,
      nx_wa_entrada: ({ p_msg }) => {
        const dup = E.mensagens.find(m => m.wamid === p_msg.wamid);
        if (dup) return { duplicada: true, mensagem_id: dup.id, conversa_id: dup.conversa_id, contato_id: dup.contato_id };
        let ct = E.contatos.find(c => c.wa_id === p_msg.wa_id);
        if (!ct) { ct = { id: ++seq, wa_id: p_msg.wa_id, nome: p_msg.nome, bloqueado: false }; E.contatos.push(ct); }
        if (p_msg.reacao) return { reacao: true, contato_id: ct.id };
        let cv = E.conversas.find(c => c.contato_id === ct.id), nova = false;
        if (!cv) { cv = { id: ++seq, contato_id: ct.id }; E.conversas.push(cv); nova = true; }
        const m = { id: ++seq, wamid: p_msg.wamid, conversa_id: cv.id, contato_id: ct.id, referral: p_msg.referral || null, midia: p_msg.midia || null, criado_em: new Date().toISOString() };
        E.mensagens.push(m);
        let fila = null;
        if (nova && foraHorario) { fila = { id: ++seq, conversa_id: cv.id }; E.fila.push(fila); }
        return { mensagem_id: m.id, conversa_id: cv.id, contato_id: ct.id, nova_conversa: nova, duplicada: false, bloqueado: false, optout: false, midia_pendente: false, fila_id: fila?.id ?? null };
      },
      nx_lead_webhook: ({ p_telefone, p_atr }) => {
        if (E.leads.some(l => l.telefone === p_telefone)) return "existente";
        E.leads.push({ telefone: p_telefone, atr: p_atr }); return p_atr ? "atribuido" : "criado";
      },
      nx_rastreio_atribuir: () => ({ ok: true }),
      nx_origem_frase: p => { E.origens.push(p); return { ok: true }; },
      nx_wa_status: ({ p_statuses }) => { E.recibos.push(...p_statuses); return { atualizados: p_statuses.length, falhas: 0, ignorados: 0 }; },
      nx_template_status: p => { E.modelos.push(p); return { atualizados: 1 }; },
      nx_fila_pegar: () => [],
      nx_trava_pegar: () => true, nx_trava_soltar: () => true,
    },
    tabelas: {
      nx_contatos: ({ q }) => resp(E.contatos.filter(c => q.id === `eq.${c.id}`).map(c => ({ id: c.id, wa_id: c.wa_id, nome: c.nome, bloqueado: c.bloqueado }))),
      nx_mensagens: ({ q }) => resp(E.mensagens.filter(m => q.id === `eq.${m.id}`).map(m => ({ referral: m.referral, midia: m.midia, criado_em: m.criado_em }))),
      nx_metricas_dia: [], nx_clientes: [],
    },
  });
  return { ...s, E };
}

test("SV-192 meta-fixtures: cada fixture da v23 passa por normalizarMensagem e pela nx-whatsapp (tratar) com 200, sem erro", async () => {
  assert.deepEqual(TIPOS_FIXTURE.length, 15);
  for (const t of MENSAGENS) {
    const m = mensagem(t);
    const n = normalizarMensagem(m, [{ profile: { name: "Paciente Teste" }, wa_id: TEL }]);
    assert.ok(n && n.wa_id === TEL && n.wamid === m.id, t);
    if (t.startsWith("reacao")) assert.equal(n.reacao.wamid, "wamid.TESTE-SAIDA-1", t);
    else assert.notEqual(n.tipo, "desconhecido", `${t} é um tipo conhecido`);
  }
  assert.equal(normalizarMensagem(mensagem("reacao_removida")).reacao.emoji, "", "reação removida = emoji vazio");
  assert.match(normalizarMensagem(mensagem("order")).corpo, /^Pedido do catálogo: 1× SKU-CLAREAMENTO, 2× SKU-LIMPEZA — /);
  assert.equal(normalizarMensagem(mensagem("request_welcome")).corpo, "Abriu a conversa pelo anúncio");
  assert.equal(normalizarMensagem(mensagem("nfm_reply")).corpo, "Sent");
  assert.equal(normalizarMensagem(mensagem("button")).responde_a_wamid, "wamid.TESTE-SAIDA-1");
  assert.equal(recibo("failed").errors[0].code, 131047);
  for (const nome of TIPOS_FIXTURE) {
    const s = bancoWebhook();
    const r = await postMeta(s, JSON.stringify(evento(nome)));
    assert.equal(r.status, 200, `${nome}: ${await r.clone().text()}`);
    const corpo = await r.json().catch(() => ({}));
    assert.ok(!corpo.erros && !corpo.falhas, `${nome}: ${JSON.stringify(corpo)}`);
  }
  // o que cada grupo grava
  const s1 = bancoWebhook(); await postMeta(s1, JSON.stringify(evento("status_failed")));
  assert.equal(s1.E.recibos.length, 1); assert.equal(s1.E.recibos[0].errors[0].code, 131047);
  const s2 = bancoWebhook(); await postMeta(s2, JSON.stringify(evento("template_status", { evento: "REJECTED" })));
  assert.deepEqual([s2.E.modelos[0].p_waba, s2.E.modelos[0].p_status, s2.E.modelos[0].p_motivo], ["100000000000001", "REJECTED", "INVALID_FORMAT"]);
});

test("SV-192 simular-webhook --tipo: os tipos antigos continuam; os novos saem das fixtures (com pid/from/wamid da linha de comando)", () => {
  assert.deepEqual(TIPOS, ["texto", "imagem", "recibo", "sair"]);
  assert.deepEqual(TIPOS_EXTRAS, TIPOS_FIXTURE.filter(t => !TIPOS.includes(t)));
  const p = montarPayload({ pid: "999", tipo: "audio", from: "5511999990000", wamid: "wamid.X1" });
  const m = p.entry[0].changes[0].value.messages[0];
  assert.deepEqual([p.entry[0].changes[0].value.metadata.phone_number_id, m.type, m.from, m.id], ["999", "audio", "5511999990000", "wamid.X1"]);
  assert.equal(montarPayload({ pid: "1", tipo: "template_status" }).entry[0].changes[0].field, "message_template_status_update");
  assert.equal(montarPayload({ pid: "1", tipo: "status_failed", wamid: "wamid.Y" }).entry[0].changes[0].value.statuses[0].id, "wamid.Y");
  assert.throws(() => montarPayload({ pid: "1", tipo: "nao-existe" }), /--tipo deve ser texto\|imagem\|recibo\|sair\|audio/);
  // o «recibo» antigo continua o mesmo (code 190)
  assert.equal(montarPayload({ pid: "1", tipo: "recibo", wamid: "wamid.X", status: "failed" }).entry[0].changes[0].value.statuses[0].errors[0].code, 190);
});

/* ================================================================== SV-247: webhook idempotente */
test("SV-247 o MESMO POST assinado 3× (a Meta reentrega depois de 503): 1 mensagem, 1 contato, 1 negócio, 1 conversa e 1 item de fila", async () => {
  const s = bancoWebhook();
  const corpo = JSON.stringify(evento("texto", { wamid: "wamid.TESTE-REPETIDA", texto: "Oi, quero marcar" }));
  for (let i = 0; i < 3; i++) assert.equal((await postMeta(s, corpo)).status, 200);
  assert.equal(s.E.mensagens.length, 1, "mensagem");
  assert.equal(s.E.contatos.length, 1, "contato");
  assert.equal(s.E.conversas.length, 1, "conversa");
  assert.equal(s.E.leads.length, 1, "negócio");
  assert.equal(s.E.fila.length, 1, "fila do fora do horário");
  assert.equal(s.de("nx_wa_entrada").length, 3, "as 3 entregas chegaram ao banco (a idempotência é do banco, por wamid)");
  assert.ok(s.de("nx_lead_webhook").every(c => c.corpo.p_telefone === TEL), "reparo do lead na reentrega usa o mesmo telefone (idempotente)");
  // anúncio: a atribuição vai uma vez só (o negócio já existe nas reentregas)
  const a = bancoWebhook();
  const comAnuncio = evento("texto", { wamid: "wamid.TESTE-ANUNCIO" });
  comAnuncio.entry[0].changes[0].value.messages[0].referral = { source_url: "https://fb.me/t", source_id: "AD-1", source_type: "ad", ctwa_clid: "CL1" };
  for (let i = 0; i < 3; i++) await postMeta(a, JSON.stringify(comAnuncio));
  assert.equal(a.E.leads.length, 1); assert.equal(a.E.leads[0].atr.anuncio_ext, "AD-1");
});

/* ================================================================== SV-246: mutação da reserva do client_ref */
function cenarioEnviar({ reservaReal = true } = {}) {
  let seq = 100;
  const refs = new Map();
  const CX = {
    conversa: { id: 601, status: "aberta", canal_id: K_M, contato_id: 501 }, contato: { id: 501, wa_id: TEL, telefone: TEL, nome: "Paula", optin_marketing: null, bloqueado: false },
    canal_id: K_M, canal: { id: K_M, provedor: "meta" }, janela_aberta: true, ultimo_wamid_in: "wamid.in1", cfg_cv: { recibo_leitura: true, assinatura: false },
    atendente_nome: "Ana Lima", empresa: "Clínica Alfa",
  };
  const mensagens = [];
  return dbFalso({
    atraso: 2,
    rpcs: {
      nx_fn_ctx: () => ({ conta_id: "c-adm", papel: "admin" }), nx_exigir_modulo: () => null, nx_envio_vez: () => ({ ok: true }),
      nx_cv_contexto_envio: () => CX,
      nx_canal_credencial: () => ({ canal_id: K_M, cliente_id: CLI_A, provedor: "meta", token: "EAAtoken", phone_number_id: "111", waba_id: "W1", app_secret: null }),
      // a regra do banco (20261002d, smoke 15): novo → em_andamento → gravada; o MUTANTE responde «novo» sempre (sem reserva)
      nx_cv_ref_reservar: ({ p_ref }) => {
        if (!reservaReal) return { estado: "novo" };
        const r = refs.get(p_ref);
        if (!r) { refs.set(p_ref, { mensagem: null }); return { estado: "novo" }; }
        return r.mensagem ? { estado: "gravada", mensagem: r.mensagem } : { estado: "em_andamento" };
      },
      nx_cv_ref_marcar: ({ p_ref, p_mensagem }) => { const r = refs.get(p_ref); if (r) r.mensagem = mensagens.find(m => m.id === p_mensagem); return true; },
      nx_cv_ref_liberar: ({ p_ref }) => { refs.delete(p_ref); return true; },
      nx_cv_saida: ({ p_msg }) => { const m = { id: ++seq, conversa_id: 601, direcao: "out", ...p_msg }; mensagens.push(m); return m; },
      nx_cv_ia_pausa_auto: () => null,
    },
  });
}
const painelEnviar = (s, corpo) => enviar(new Request(`${FN}/nx-enviar`, {
  method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" },
  body: JSON.stringify({ token: "tok-adm", cliente: CLI_A, ...corpo }) }), ENV, { fetch: s.fetch, prazoRede: 500 });

test("SV-246 mutação: sem a reserva do client_ref (nx_cv_ref_reservar sempre «novo») o mesmo pedido SAI 2× pela Graph; com a reserva real, 1×", async () => {
  const pedido = { acao: "texto", conversa: 601, texto: "Confirmado para amanhã", client_ref: "ref-teste-0001" };
  const contar = s => s.chamadas.filter(c => c.nome.startsWith("GRAPH POST") && c.nome.endsWith("/messages")).length;
  // simultâneos (duplo clique / retry do painel)
  const real = cenarioEnviar();
  const [a, b] = await Promise.all([painelEnviar(real, pedido), painelEnviar(real, pedido)]);
  assert.equal(contar(real), 1, "reserva real: uma saída");
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "o 2º recebe envio_em_andamento");
  // em sequência: a repetição devolve a gravada
  const rep = await painelEnviar(real, pedido);
  assert.equal(rep.status, 200); assert.equal((await rep.json()).repetida, true); assert.equal(contar(real), 1);
  // mutante
  const mutante = cenarioEnviar({ reservaReal: false });
  await Promise.all([painelEnviar(mutante, pedido), painelEnviar(mutante, pedido)]);
  assert.equal(contar(mutante), 2, "prova de mutação: a reserva é o que impede a mensagem em dobro");
});

/* ================================================================== SV-248: reentrega simultânea no agente (CodeWords) */
test("SV-248 CodeWords: duas entregas SIMULTÂNEAS da mesma message_id → só uma responde (trava nx-cw-decidir); sem trava, as duas responderiam", async () => {
  const SEG_A = "a".repeat(64), K_A = "aaaaaaaa-0000-4000-8000-00000000000a";
  const rodar = async ({ comTrava }) => {
    const travas = new Map(), entradas = new Set();
    const s = dbFalso({
      rpcs: {
        nx_codewords_canal: ({ p_chave }) => (p_chave === SEG_A ? { canal_id: K_A, cliente_id: CLI_A, numero: "+5512991230001", rota: "fluxo", ia_ligada: true, excedido: false } : null),
        nx_codewords_contar: () => ({ ok: true }), nx_codewords_forma: () => null,
        nx_wa_entrada: ({ p_msg }) => {
          if (entradas.has(p_msg.wamid)) return { duplicada: true, mensagem_id: 7001, conversa_id: 601, contato_id: 501 };
          entradas.add(p_msg.wamid);
          return { mensagem_id: 7001, conversa_id: 601, contato_id: 501, nova_conversa: false, duplicada: false, bloqueado: false, optout: false, fila_id: null };
        },
        nx_lead_webhook: () => "existente",
        nx_trava_pegar: ({ p_nome, p_segundos, p_dono }) => {
          if (!comTrava) return true;
          const t = travas.get(p_nome);
          if (t && t.ate > Date.now()) return false;
          travas.set(p_nome, { ate: Date.now() + p_segundos * 1000, dono: p_dono }); return true;
        },
        nx_trava_soltar: ({ p_nome }) => { travas.delete(p_nome); return true; },
        // a IA leva um tempo para decidir: a reentrega chega no meio
        nx_codewords_decidir: async () => { await new Promise(r => setTimeout(r, 40)); return { responder: true, dados: { empresa: { nome: "Clínica Alfa" } } }; },
      },
      tabelas: { nx_mensagens: [], nx_metricas_dia: [] },
    });
    const msg = { acao: "mensagem", telefone: TEL, texto: "Tem horário amanhã?", nome: "Paula", message_id: "3EB0REENTREGA1", direcao: "entrada" };
    const chamar = () => codewords(new Request(`${FN}/nx-codewords?ch=${SEG_A}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(msg) }), ENV, { fetch: s.fetch });
    const rs = await Promise.all([chamar(), chamar()]);
    return Promise.all(rs.map(async r => ({ status: r.status, ...(await r.json()) })));
  };
  const com = await rodar({ comTrava: true });
  assert.deepEqual(com.map(r => r.status), [200, 200]);
  assert.equal(com.filter(r => r.responder === true).length, 1, JSON.stringify(com.map(r => [r.responder, r.motivo])));
  assert.ok(com.some(r => r.responder === false && r.motivo === "duplicada"));
  const sem = await rodar({ comTrava: false });
  assert.equal(sem.filter(r => r.responder === true).length, 2, "prova de mutação: sem a trava as duas responderiam");
});

/* ================================================================== SV-186: backup */
test("SV-186 backup.yml: diário, só nx_*, papel somente leitura (BACKUP_DB_URL), gpg simétrico (BACKUP_SENHA por descritor), 14 dias, actions por SHA", { skip: !temBash && "sem bash" }, () => {
  const y = ler(".github/workflows/backup.yml");
  assert.match(y, /schedule:\n\s+- cron: "17 6 \* \* \*"/);
  assert.match(y, /--table='public\.nx_\*'/);
  assert.match(y, /default_transaction_read_only=on/);
  assert.match(y, /gpg --batch [^\n]*--passphrase-fd 3 --symmetric --cipher-algo AES256/);
  assert.match(y, /3<<<"\$\{BACKUP_SENHA\}"/);
  assert.doesNotMatch(y, /--passphrase [^-]|echo[^\n]*\$\{BACKUP_(SENHA|DB_URL)\}/, "segredo nunca na linha de comando nem no log");
  assert.match(y, /retention-days: 14/);
  assert.match(y, /^permissions:\n {2}contents: read$/m);
  const ci = ler(".github/workflows/ci.yml");
  const usos = [...y.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map(m => m[1].trim());
  for (const u of usos) {
    assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, u);
    if (/^actions\/(checkout|setup-node)@/.test(u)) assert.ok(ci.includes(u), `mesma versão do ci.yml: ${u}`);
  }
  // segredo ausente: no agendamento, aviso e run verde (sem e-mail de erro diário até o João criar os segredos) e os passos
  // seguintes pulam; rodado à mão (workflow_dispatch), falha clara — integração 13/10
  const corpo = passo(y, "Segredos BACKUP_DB_URL e BACKUP_SENHA presentes");
  const pasta = mkdtempSync(join(tmpdir(), "orbita-backup-"));
  const saida = join(pasta, "out");
  const rodar = (env) => { writeFileSync(saida, ""); return spawnSync("bash", ["-c", corpo], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: saida, ...env } }); };
  try {
    const agendado = rodar({ BACKUP_DB_URL: "", BACKUP_SENHA: "x", GITHUB_EVENT_NAME: "schedule" });
    assert.equal(agendado.status, 0); assert.match(agendado.stdout, /::warning::segredo\(s\) ausente\(s\): BACKUP_DB_URL/);
    assert.match(readFileSync(saida, "utf8"), /ok=false/);
    const manual = rodar({ BACKUP_DB_URL: "", BACKUP_SENHA: "x", GITHUB_EVENT_NAME: "workflow_dispatch" });
    assert.equal(manual.status, 1); assert.match(manual.stdout, /::error::segredo\(s\) ausente\(s\): BACKUP_DB_URL/);
    const ok = rodar({ BACKUP_DB_URL: "postgres://x", BACKUP_SENHA: "x", GITHUB_EVENT_NAME: "schedule" });
    assert.equal(ok.status, 0); assert.match(readFileSync(saida, "utf8"), /ok=true/);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
  for (const nome of ["Cliente do PostgreSQL 17", "pg_dump das tabelas nx_* (somente leitura) e criptografia"]) {
    assert.ok(y.includes(`- name: ${nome}\n        if: steps.segredos.outputs.ok == 'true'`), `${nome} só roda com os segredos`);
  }
  assert.match(y, /uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n\s+if: steps\.segredos\.outputs\.ok == 'true'/);
  const doc = ler("docs/orbita/DEPLOY-FUNCOES.md");
  assert.match(doc, /## Backup do banco/); assert.match(doc, /BYPASSRLS/i); assert.match(doc, /ensaio de restauração/i);
});

/* ================================================================== docs */
test("SV-174/175/176/177/178/179/180/181/182 documentação: AGENTS (suíte e regras de migração), DEPLOY-FUNCOES (lista, passos, token, crons), OPERACAO e ESTADO", () => {
  const ag = ler("AGENTS.md");
  const arquivos = COMANDOS.length;
  assert.ok(ag.includes(`${arquivos} arquivos`), `AGENTS.md com o número de arquivos da suíte (${arquivos})`);
  assert.doesNotMatch(ag, /19\/19 arquivos/);
  assert.match(ag, /conferido em 13\/10\/2026/);
  for (const r of [/nx_revogar_authenticated/, /nx_versao_banco/, /notify pgrst/, /mesma assinatura/i, /scripts\/lint-migracoes\.mjs/, /EM VIGOR/]) assert.match(ag, r);
  const d = ler("docs/orbita/DEPLOY-FUNCOES.md");
  for (const fn of ["nx-ia", "nx-codewords", "nx-enviar", "nx-whatsapp", "nx-ciclo", "nx-relatorio", "nx-midia"]) assert.ok(d.includes(fn), fn);
  assert.match(d, /deno@2\.6\.0 check/); assert.match(d, /git diff --check/);
  assert.doesNotMatch(d, /ainda sem migração/);
  assert.match(d, /## Renovar o SUPABASE_ACCESS_TOKEN/); assert.match(d, /gh run rerun/); assert.match(d, /supabase\.com\/dashboard\/account\/tokens/);
  assert.match(d, /## Crons/); for (const j of ["nx-fila", "nx-automacoes", "nx-codewords-sync", "cron.alter_job"]) assert.ok(d.includes(j), j);
  const op = ler("docs/orbita/OPERACAO.md");
  for (const t of ["Número caiu", "Token da Meta venceu", "Cota de IA", "Fila travada", "Cron parado", "Mídia presa", "nx_saude"]) assert.ok(op.includes(t), t);
  assert.match(ler("docs/orbita/estado/ESTADO.md"), /teste-e2e vence 13\/10/);
});

/* ================================================================== lote srv-3: CI, workflows e documentação */
test("srv-3 lint: 20261013e/f/g passam (aditivas, versão, notify, permissões); são conferidas por padrão", () => {
  for (const f of ["20261013e_funcoes_seguranca.sql", "20261013f_entrada_contratos.sql", "20261013g_validar_status_mensagens.sql"]) {
    assert.ok(arquivosConferidos(readdirSync(MIGRACOES)).includes(f), `${f} entra no lint`);
    assert.deepEqual(lintMigracao(f, readFileSync(join(MIGRACOES, f), "utf8")), [], f);
  }
});

test("SV-165 deploy de funções com aprovação: o job publicar roda no environment «producao» (revisor obrigatório configurado pelo João)", () => {
  const yml = ler(".github/workflows/funcoes-supabase.yml");
  assert.match(yml, /jobs:\n  publicar:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n(?:    #[^\n]*\n)*    environment: producao\n/);
  assert.match(ler("docs/orbita/DEPLOY-FUNCOES.md"), /Required reviewers/);
});

test("srv-3 pages.yml: rastreio.v1.js (o snippet com SRI aponta para ele) é exigido na publicação do Pages", () => {
  const yml = ler(".github/workflows/pages.yml");
  assert.match(yml, /for exigido in index\.html painel\.js painel\.css dados\.js nucleo\.js rastreio\.js rastreio\.v1\.js fonts; do/);
  assert.ok(existsSync(join(RAIZ, "web/rastreio.v1.js")), "o arquivo existe no repositório");
});

test("srv-3 documentação: DEPLOY-FUNCOES (ordem e/f/g, funcoes_url antes da e, g fora do horário, critério do caminho antigo) e AGENTS", () => {
  const d = ler("docs/orbita/DEPLOY-FUNCOES.md");
  for (const re of [/20261013e_funcoes_seguranca/, /20261013f_entrada_contratos/, /20261013g_validar_status_mensagens/, /FORA DO HORÁRIO/i,
    /funcoes_url ~ /, /nx_canais_estado_desde_preencher/, /webhook_caminho_antigo/, /30 dias seguidos/]) assert.match(d, re);
  const a = ler("AGENTS.md");
  assert.match(a, /20261013e_funcoes_seguranca/); assert.match(a, /20261013g_validar_status_mensagens/);
  // o prompt do CodeWords documenta o limite por tipo, o motivo «suspenso» e o contexto sem o telefone inteiro (SV-268/208/036)
  const p = ler("docs/orbita/CODEWORDS-PROMPT.md");
  assert.match(p, /240 mensagens\/min/); assert.match(p, /lid_sem_numero, suspenso/); assert.match(p, /8\.000 caracteres/);
});
