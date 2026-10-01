/* ============================================================
   ÓRBITA — supabase/testes/rodar-local.mjs
   Roda as migrações e os smokes SQL (01…13) num Postgres LOCAL (PGlite, WebAssembly): nada toca o banco compartilhado.
   É para ITERAR rápido (o ensaio no banco real, em begin … rollback pelo MCP, continua sendo o que vale para a publicação).

   Uso (uma vez):  npm i --no-save @electric-sql/pglite      (node_modules/ está no .gitignore)
        depois:    node supabase/testes/rodar-local.mjs                 todas as migrações + todos os smokes
                   node supabase/testes/rodar-local.mjs 12 13            só os smokes cujo nome começa com 12 ou 13
                   node supabase/testes/rodar-local.mjs --sem-b 13       sem a 20261001b (prova o que o smoke 13 pega ANTES)
                   MAXMSG=9000 node …                                    não corta a mensagem de falha

   Stubs do que o Supabase tem e o PGlite não: roles, schemas extensions/vault/net/cron/storage, pg_cron (agenda gravada em
   cron.job, nada roda), pg_net (chamadas gravadas em net.http_chamadas, nada sai), Vault e storage de mentira.
   O smoke 02 depende de dados do banco real (o gestor atual) e falha aqui — é esperado.
   Os smokes terminam em exceção «OK…/VERDE…» (para o execute_sql dar rollback): aqui isso conta como passou.
   ============================================================ */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACOES = resolve(AQUI, "..", "migrations");

const STUBS = `
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

const args = process.argv.slice(2);
const semB = args.includes("--sem-b");
const prefixos = args.filter(a => !a.startsWith("--"));
const maxMsg = Number(process.env.MAXMSG || 500);

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm, unaccent } });
await db.exec(STUBS);
for (const arq of readdirSync(MIGRACOES).filter(f => f.endsWith(".sql")).sort()) {
  if (semB && arq >= "20261001b") break;
  // as extensões que o PGlite não tem já estão nos stubs acima
  const sql = readFileSync(join(MIGRACOES, arq), "utf8").replace(/create extension if not exists (pg_net|pg_cron|supabase_vault)[^;]*;/gi, "-- (extensão de mentira)");
  try { await db.exec(sql); }
  catch (e) { console.error(`ERRO na migração ${arq}: ${String(e.message).slice(0, 400)}`); process.exit(2); }
}
console.log(`migrações aplicadas${semB ? " (sem a 20261001b)" : ""}`);

let falhas = 0;
const smokes = readdirSync(AQUI).filter(f => /^\d\d.*\.sql$/.test(f)).sort().filter(f => !prefixos.length || prefixos.some(p => f.startsWith(p)));
for (const f of smokes) {
  const t0 = Date.now();
  try {
    await db.exec(readFileSync(join(AQUI, f), "utf8"));
    console.log(`OK      ${f} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    const m = String(e.message);
    if (/^(OK|VERDE)|passaram|^[A-Z0-9_]*OK_|: VERDE/i.test(m)) console.log(`OK      ${f} — ${m.slice(0, 120)}`);
    else { falhas++; console.log(`FALHOU  ${f} -> ${m.slice(0, maxMsg)}${e.hint ? " | hint: " + e.hint : ""}`); }
    try { await db.exec("rollback"); } catch { /* sem transação aberta */ }
  }
}
console.log(falhas ? `${falhas} arquivo(s) com falha` : "todos ok");
process.exit(falhas ? 1 : 0);
