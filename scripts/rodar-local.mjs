#!/usr/bin/env node
/* ÓRBITA — scripts/rodar-local.mjs (plano «100+ melhorias» · frente H, item H4)
   Roda as migrações e os smokes SQL (supabase/testes/NN_*.sql) num Postgres LOCAL (PGlite, Postgres em WebAssembly): nada toca o
   banco compartilhado. É para ITERAR; o ensaio em begin … rollback no banco real (pelo MCP) continua sendo o que vale para publicar.

   Uso:  npm install                                       (uma vez: @electric-sql/pglite vem de devDependencies; node_modules/ está no .gitignore)
         node scripts/rodar-local.mjs                      todas as migrações + todos os smokes
         node scripts/rodar-local.mjs 18 19                só os smokes cujo nome começa com esses prefixos
         node scripts/rodar-local.mjs --ate 20261008a 19   aplica só as migrações ANTERIORES à 20261008a (prova que o smoke 19 falha antes dela)
         node scripts/rodar-local.mjs --sem 20261003a 17   pula UMA migração (repetível)
         node scripts/rodar-local.mjs --sem-b 13           = --ate 20261001b (o que o smoke 13 pega antes dela)
         MAXMSG=9000 node scripts/rodar-local.mjs          não corta a mensagem de falha
         npm run smokes

   Como: stubs do que o Supabase tem e o PGlite não (roles; schemas extensions/vault/net/cron/storage; pg_cron só grava em cron.job;
   pg_net só grava em net.http_chamadas; Vault e Storage de mentira); migrações em ordem, lidas em LF — o checkout no Windows é CRLF
   e a 20261003a casa a âncora do corpo da função com "\n", como o texto que foi aplicado no banco real; smokes em ordem; smoke que
   termina em exceção «OK…/VERDE…» (para o execute_sql dar rollback) conta como passou.
   Saída: 0 tudo ok · 1 algum smoke falhou (ou nenhum casou) · 2 PGlite ausente, opção desconhecida ou migração que não aplica.
   Limites conhecidos (F8.md): pgcrypto/pg_trgm/unaccent são as versões do PGlite; o smoke 02 depende do gestor real do banco e
   falha aqui por desenho; nada disso substitui o ensaio no Postgres/Supabase real.
   Substitui supabase/testes/rodar-local.mjs (01/10), que lia os arquivos crus (CRLF) e parava na 20261003a. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRACOES = resolve(RAIZ, "supabase/migrations");
export const SMOKES = resolve(RAIZ, "supabase/testes");

/** O PGlite está instalado (o pacote resolve como módulo ES a partir daqui; o `exports` dele não expõe o package.json ao require)? */
export function temPglite(resolver = esp => import.meta.resolve(esp)) {
  try { return !!resolver("@electric-sql/pglite"); } catch { return false; }
}

export const MENSAGEM_SEM_PGLITE = [
  "O PGlite não está instalado: os smokes SQL só podem rodar localmente com ele.",
  "  Instale uma vez, na raiz do repositório:  npm install",
  "  (traz @electric-sql/pglite de devDependencies; node_modules/ está no .gitignore e nada vai para produção)",
  "Sem ele, o ensaio das migrações continua sendo feito no banco real, em begin … rollback.",
].join("\n");

/** O que o Supabase tem e o PGlite não: roles, schemas, pg_cron/pg_net/Vault/Storage de mentira (nada roda, nada sai). */
export const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if;
end $$;
create schema if not exists extensions; create schema if not exists vault; create schema if not exists net;
create schema if not exists cron; create schema if not exists storage;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create table cron.job_run_details (jobid bigint, runid bigserial primary key, status text, end_time timestamptz);
create function cron.schedule(p_nome text, p_agenda text, p_cmd text) returns bigint language plpgsql as $f$
declare v bigint; begin
  insert into cron.job(jobname, schedule, command) values (p_nome, p_agenda, p_cmd)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into v; return v; end $f$;
create function cron.unschedule(p_nome text) returns boolean language plpgsql as $f$ begin delete from cron.job where jobname = p_nome; return true; end $f$;
create function cron.unschedule(p_id bigint) returns boolean language plpgsql as $f$ begin delete from cron.job where jobid = p_id; return true; end $f$;
create table net.http_chamadas (id bigserial primary key, url text, corpo jsonb, headers jsonb, criado_em timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language plpgsql as $f$ declare v bigint; begin insert into net.http_chamadas(url, corpo, headers) values (url, body, headers) returning id into v; return v; end $f$;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language plpgsql as $f$
declare v uuid; begin insert into vault.secrets(name, description, secret) values (new_name, new_description, new_secret) returning id into v; return v; end $f$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void language plpgsql as $f$
begin update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name), updated_at = now() where id = secret_id; end $f$;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
`;

/** Texto SQL como o banco real o recebeu: LF puro (o CRLF do checkout no Windows vira \n). */
export const normalizarLf = s => String(s).replace(/\r\n?/g, "\n");
/** As extensões que o PGlite não tem já estão nos stubs: o create extension delas vira comentário. */
export const semExtensoesFalsas = sql => sql.replace(/create extension if not exists (pg_net|pg_cron|supabase_vault)[^;]*;/gi, "-- (extensão de mentira)");
export const lerSql = arq => normalizarLf(readFileSync(arq, "utf8"));
/** Os smokes terminam em exceção «OK…/VERDE…» (para o execute_sql dar rollback): isso conta como passou. */
export const passou = m => /^(OK|VERDE)|passaram|^[A-Z0-9_]*OK_|: VERDE/i.test(String(m || ""));

/** Linha de comando: prefixos de smoke; --ate <prefixo>; --sem <prefixo> (repetível); --sem-b (= --ate 20261001b). */
export function lerArgs(argv = []) {
  const r = { prefixos: [], ate: null, sem: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === "--ate") r.ate = argv[++i] || null;
    else if (a === "--sem") { if (argv[i + 1]) r.sem.push(String(argv[++i])); }
    else if (a === "--sem-b") r.ate = "20261001b";
    else if (a.startsWith("--")) throw new Error(`opção desconhecida: ${a} (use --ate <prefixo>, --sem <prefixo>, --sem-b ou prefixos de smoke)`);
    else r.prefixos.push(a);
  }
  return r;
}
/** Quais migrações entram, em ordem: [{arquivo, pulada}] — para na primeira >= --ate; as de --sem ficam marcadas como puladas. */
export function selecionarMigracoes(arquivos, { ate = null, sem = [] } = {}) {
  const sel = [];
  for (const arq of [...arquivos].filter(f => f.endsWith(".sql")).sort()) {
    if (ate && arq >= ate) break;
    sel.push({ arquivo: arq, pulada: sem.some(s => arq.startsWith(s)) });
  }
  return sel;
}
/** Smokes NN_*.sql em ordem; com prefixos, só os que começam por um deles. */
export const selecionarSmokes = (arquivos, prefixos = []) =>
  [...arquivos].filter(f => /^\d\d.*\.sql$/.test(f)).sort().filter(f => !prefixos.length || prefixos.some(p => f.startsWith(p)));

/** Aplica as migrações e roda os smokes num PGlite novo (em memória).
    Devolve {codigo, migracoes: [{arquivo, pulada, ms}], smokes: [{arquivo, ok, ms, mensagem}]}. */
export async function rodar({ prefixos = [], ate = null, sem = [], maxMsg = 600, log = console.log, erro = console.error } = {}) {
  if (!temPglite()) { erro(MENSAGEM_SEM_PGLITE); return { codigo: 2, migracoes: [], smokes: [] }; }
  const [{ PGlite }, { pgcrypto }, { uuid_ossp }, { pg_trgm }, { unaccent }] = await Promise.all([
    import("@electric-sql/pglite"), import("@electric-sql/pglite/contrib/pgcrypto"), import("@electric-sql/pglite/contrib/uuid_ossp"),
    import("@electric-sql/pglite/contrib/pg_trgm"), import("@electric-sql/pglite/contrib/unaccent")]);
  const t00 = Date.now();
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm, unaccent } });
  const migracoes = [], smokes = [];
  try {
    await db.exec(STUBS);
    for (const m of selecionarMigracoes(readdirSync(MIGRACOES), { ate, sem })) {
      if (m.pulada) { log(`(pulou ${m.arquivo})`); migracoes.push({ ...m, ms: 0 }); continue; }
      const t0 = Date.now();
      try { await db.exec(semExtensoesFalsas(lerSql(join(MIGRACOES, m.arquivo)))); }
      catch (e) {
        erro(`ERRO na migração ${m.arquivo}: ${String(e.message).slice(0, 1200)}${e.hint ? ` | hint: ${e.hint}` : ""}${e.position ? ` | pos ${e.position}` : ""}`);
        return { codigo: 2, migracoes, smokes };
      }
      migracoes.push({ ...m, ms: Date.now() - t0 });
      log(`mig ok  ${m.arquivo} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    log(`migrações aplicadas em ${((Date.now() - t00) / 1000).toFixed(1)} s${ate ? ` (só as anteriores a ${ate})` : ""}`);
    const lista = selecionarSmokes(readdirSync(SMOKES), prefixos);
    if (!lista.length) { erro(`nenhum smoke casa com: ${prefixos.join(" ")}`); return { codigo: 1, migracoes, smokes }; }
    for (const f of lista) {
      const t0 = Date.now();
      let ok = true, mensagem = "";
      try { await db.exec(lerSql(join(SMOKES, f))); }
      catch (e) {
        mensagem = String(e.message) + (e.hint && !passou(e.message) ? ` | hint: ${e.hint}` : "");
        ok = passou(e.message);
        try { await db.exec("rollback"); } catch { /* sem transação aberta */ }
      }
      smokes.push({ arquivo: f, ok, ms: Date.now() - t0, mensagem });
      log(ok ? `OK      ${f} ${((Date.now() - t0) / 1000).toFixed(1)} s${mensagem ? ` — ${mensagem.slice(0, 160)}` : " (sem exceção)"}`
        : `FALHOU  ${f} -> ${mensagem.slice(0, maxMsg)}`);
    }
  } finally {
    try { await db.close(); } catch { /* já fechado */ }
  }
  const falhas = smokes.filter(s => !s.ok).length;
  log(falhas ? `${falhas} arquivo(s) com falha` : "todos ok");
  return { codigo: falhas ? 1 : 0, migracoes, smokes };
}

async function principal(argv) {
  let args;
  try { args = lerArgs(argv); } catch (e) { console.error(e.message); return 2; }
  return (await rodar({ ...args, maxMsg: Number(process.env.MAXMSG || 600) })).codigo;
}

// só roda quando chamado direto (os testes importam as funções sem disparar o PGlite)
const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) principal(process.argv.slice(2)).then(c => { process.exitCode = c; });
