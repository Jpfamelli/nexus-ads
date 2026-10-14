#!/usr/bin/env node
/* ÓRBITA — scripts/carga-local.mjs (plano «1000+ melhorias», SV-167)
   Carga sintética LOCAL (PGlite, nada toca o banco real) para provar índices e consultas antes do banco de produção: aplica as
   migrações (os mesmos stubs do scripts/rodar-local.mjs), gera volume num cliente de teste e mede as RPCs mais chamadas do painel
   com o plano de CADA consulta interna (auto_explain com log_nested_statements, em NOTICE): tempo, nós de índice usados e
   varreduras sequenciais nas tabelas grandes.

   Uso:  node scripts/carga-local.mjs                         volume padrão (2.000 contatos — roda em segundos)
         node scripts/carga-local.mjs --contatos 20000 --mensagens 10 --dias 130
         CONTATOS=20000 MENSAGENS=10 node scripts/carga-local.mjs
         node scripts/carga-local.mjs --orcamento 300 --planos  (teto por RPC em ms; --planos imprime os planos inteiros)
   Gera: N contatos, N conversas (abertas/pendentes/resolvidas, 1/4 aguardando, 1/40 com não lidas), N×mensagens mensagens,
   N negócios (leads) e «dias» dias de métricas (10 anúncios por dia). Mede: nx_cv_listar (abertas, aguardando, resolvidas,
   busca por nome e por telefone), nx_pulso, nx_cv_mensagens, nx_dados e nx_inicio.
   Saída: 0 tudo dentro do orçamento · 1 alguma RPC acima do orçamento · 2 PGlite ausente/argumento inválido/erro de carga.
   Os números do PGlite (WebAssembly) são piores que os do Postgres real: servem para COMPARAR planos (antes × depois de um
   índice), não como promessa de tempo em produção. */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { STUBS, MIGRACOES, MENSAGEM_SEM_PGLITE, temPglite, lerSql, semExtensoesFalsas, selecionarMigracoes } from "./rodar-local.mjs";

export const PADRAO = Object.freeze({ contatos: 2000, mensagens: 10, dias: 130, orcamento: 300, planos: false });
const LIMITES = { contatos: [10, 200_000], mensagens: [1, 100], dias: [1, 400], orcamento: [1, 600_000] };
const ENV = { contatos: "CONTATOS", mensagens: "MENSAGENS", dias: "DIAS", orcamento: "ORCAMENTO_MS" };

/** Argumentos (--contatos N, --mensagens N, --dias N, --orcamento ms, --planos) e variáveis (CONTATOS, MENSAGENS, DIAS,
    ORCAMENTO_MS); a linha de comando vence o ambiente. Valor fora dos limites ou opção desconhecida → erro claro. */
export function lerArgsCarga(argv = [], env = {}) {
  const o = { ...PADRAO };
  for (const [k, v] of Object.entries(ENV)) if (env[v] != null && env[v] !== "") o[k] = numero(k, env[v]);
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === "--planos") { o.planos = true; continue; }
    const m = /^--(contatos|mensagens|dias|orcamento)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`opção desconhecida: ${a} (use --contatos N, --mensagens N, --dias N, --orcamento ms, --planos)`);
    const v = m[2] ?? argv[++i];
    if (v == null) throw new Error(`--${m[1]} precisa de um número`);
    o[m[1]] = numero(m[1], v);
  }
  return o;
}
function numero(nome, v) {
  const n = Number(String(v).replace(/[._](?=\d{3}\b)/g, ""));
  const [min, max] = LIMITES[nome];
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome} deve ser inteiro entre ${min} e ${max} (veio «${v}»)`);
  return n;
}

/** Um NOTICE do auto_explain → {ms, consulta, indices:[nomes], seq:[tabelas], texto}. Outros avisos → null. */
export function lerPlano(msg) {
  const s = String(msg ?? "");
  const m = /^duration: ([\d.]+) ms\s+plan:\n([\s\S]*)$/.exec(s);
  if (!m) return null;
  const corpo = m[2];
  const consulta = (/^Query Text: (.*)$/m.exec(corpo)?.[1] || "").replace(/\s+/g, " ").trim();
  const indices = [...new Set([...corpo.matchAll(/(?:Index Scan|Index Only Scan|Bitmap Index Scan)(?: Backward)? (?:using|on) (\S+)/g)].map(x => x[1]))];
  const seq = [...new Set([...corpo.matchAll(/Seq Scan on (\S+)/g)].map(x => x[1]))];
  return { ms: Number(m[1]), consulta, indices, seq, texto: corpo };
}

/** Resumo de uma medição: as consultas internas mais lentas primeiro; varredura sequencial em tabela grande vira alerta. */
export function resumirPlanos(planos, grandes = ["nx_mensagens", "nx_conversas", "nx_contatos", "nx_leads", "nx_metricas_dia", "nx_historico"]) {
  const internos = planos.filter(p => !/^select public\.nx_/i.test(p.consulta));
  const indices = [...new Set(internos.flatMap(p => p.indices))].sort();
  const seqGrandes = [...new Set(internos.flatMap(p => p.seq).filter(t => grandes.includes(t.replace(/^public\./, ""))))].sort();
  const lentas = [...internos].sort((a, b) => b.ms - a.ms).slice(0, 3).map(p => ({ ms: p.ms, consulta: p.consulta.slice(0, 120) }));
  return { indices, seqGrandes, lentas };
}

/** O SQL que gera o volume (um cliente de teste, conta admin com sessão «tok-carga»). */
export function sqlCarga({ contatos, mensagens, dias }) {
  return `
do $carga$
declare cT uuid; k uuid; canal uuid; st uuid[];
begin
  insert into public.nx_clientes (slug, nome, vertical) values ('carga-local', 'Carga Local', 'odonto') returning id into cT;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('carga@teste.local', 'Carga Admin', 'x', 'clinica', true) returning id into k;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k, cT, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-carga'), k, now() + interval '1 day');
  insert into public.nx_canais (cliente_id, nome, status) values (cT, 'Número de carga', 'ativo') returning id into canal;
  select array_agg(e.id order by e.ordem) into st from public.nx_estagios e join public.nx_funis f on f.id = e.funil_id where f.cliente_id = cT and f.padrao;
  perform set_config('nx.lote', '1', true);
  perform set_config('nx.sem_historico', '1', true);
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id, criado_em)
  select cT, 'Contato ' || g || case when g % 7 = 0 then ' Araújo' else '' end, '551299' || lpad(g::text, 7, '0'), '551299' || lpad(g::text, 7, '0'),
         now() - make_interval(mins => g)
    from generate_series(1, ${contatos}) g;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, ultima_msg_em, ultima_entrada_em)
  select cT, canal, k2.id, 'C-' || k2.rn,
         case when k2.rn % 3 = 0 then 'resolvida' when k2.rn % 3 = 1 then 'aberta' else 'pendente' end,
         k2.rn % 4 = 1, case when k2.rn % 40 = 0 then 2 else 0 end,
         now() - make_interval(mins => k2.rn::int), now() - make_interval(mins => k2.rn::int)
    from (select id, row_number() over (order by id) rn from public.nx_contatos where cliente_id = cT) k2;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, criado_em)
  select cv.cliente_id, cv.id, cv.contato_id, canal, case when g % 2 = 0 then 'in' else 'out' end, 'texto',
         'Mensagem ' || g || ' da conversa ' || cv.id, case when g % 2 = 0 then 'recebida' else 'enviada' end,
         now() - make_interval(mins => (cv.id % 1000)::int * 10 + g)
    from public.nx_conversas cv cross join generate_series(1, ${mensagens}) g where cv.cliente_id = cT;
  insert into public.nx_leads (cliente_id, contato_id, estagio_id, titulo, valor_previsto, criado_em)
  select cT, k2.id, st[1 + (k2.rn % greatest(array_length(st, 1) - 2, 1))::int], 'Negócio ' || k2.rn, (k2.rn % 10) * 150,
         now() - make_interval(days => (k2.rn % ${dias})::int)
    from (select id, row_number() over (order by id) rn from public.nx_contatos where cliente_id = cT) k2;
  insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome, impressoes, cliques, gasto, conversoes)
  select cT, 'meta', (now() at time zone 'America/Sao_Paulo')::date - d, 'anuncio', 'CAMP-' || (a % 3), 'Campanha ' || (a % 3), 'AD-' || a, 'Anúncio ' || a,
         1000 + a * 10, 20 + a, 30 + a, a % 4
    from generate_series(1, ${dias}) d cross join generate_series(1, 10) a;
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  perform set_config('nx.sem_historico', '', true);
end $carga$;
analyze;`;
}

/** As RPCs medidas: [rótulo, sql] (o cliente é lido do banco). */
export const MEDIDAS = [
  ["nx_cv_listar abertas", c => `select public.nx_cv_listar('tok-carga', '${c}', '{"aba":"abertas"}'::jsonb)`],
  ["nx_cv_listar aguardando", c => `select public.nx_cv_listar('tok-carga', '${c}', '{"aba":"aguardando"}'::jsonb)`],
  ["nx_cv_listar resolvidas", c => `select public.nx_cv_listar('tok-carga', '${c}', '{"aba":"resolvidas"}'::jsonb)`],
  ["nx_cv_listar busca nome", c => `select public.nx_cv_listar('tok-carga', '${c}', '{"aba":"abertas","busca":"araujo"}'::jsonb)`],
  ["nx_cv_listar busca telefone", c => `select public.nx_cv_listar('tok-carga', '${c}', '{"aba":"abertas","busca":"0001234"}'::jsonb)`],
  ["nx_pulso", c => `select public.nx_pulso('tok-carga', '${c}')`],
  ["nx_cv_mensagens", c => `select public.nx_cv_mensagens('tok-carga', '${c}', (select max(id) from public.nx_conversas where cliente_id = '${c}'))`],
  ["nx_dados 130 dias", c => `select public.nx_dados('tok-carga', '${c}', 130)`],
  ["nx_inicio", c => `select public.nx_inicio('tok-carga', '${c}')`],
];

export async function rodarCarga(o = PADRAO, { log = console.log, erro = console.error } = {}) {
  if (!temPglite()) { erro(MENSAGEM_SEM_PGLITE); return { codigo: 2, medidas: [] }; }
  const [{ PGlite }, { pgcrypto }, { uuid_ossp }, { pg_trgm }, { unaccent }, { auto_explain }] = await Promise.all([
    import("@electric-sql/pglite"), import("@electric-sql/pglite/contrib/pgcrypto"), import("@electric-sql/pglite/contrib/uuid_ossp"),
    import("@electric-sql/pglite/contrib/pg_trgm"), import("@electric-sql/pglite/contrib/unaccent"), import("@electric-sql/pglite/contrib/auto_explain")]);
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm, unaccent, auto_explain } });
  const medidas = [];
  try {
    await db.exec(STUBS);
    const t0 = Date.now();
    for (const m of selecionarMigracoes(readdirSync(MIGRACOES))) await db.exec(semExtensoesFalsas(lerSql(join(MIGRACOES, m.arquivo))));
    log(`migrações aplicadas em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const t1 = Date.now();
    await db.exec(sqlCarga(o));
    log(`carga: ${o.contatos} contatos/conversas/negócios, ${o.contatos * o.mensagens} mensagens, ${o.dias * 10} linhas de métricas em ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    const cliente = (await db.query("select id from public.nx_clientes where slug = 'carga-local'")).rows[0].id;
    await db.exec("load 'auto_explain'; set auto_explain.log_min_duration = 0; set auto_explain.log_nested_statements = on; set auto_explain.log_analyze = on; set auto_explain.log_level = 'notice';");
    for (const [rotulo, sql] of MEDIDAS) {
      const notas = [];
      const ini = performance.now();
      try { await db.query(sql(cliente), [], { onNotice: n => notas.push(n.message) }); }
      catch (e) { medidas.push({ rotulo, erro: String(e.message).slice(0, 300) }); erro(`ERRO   ${rotulo}: ${String(e.message).slice(0, 300)}`); continue; }
      const ms = performance.now() - ini;
      const planos = notas.map(lerPlano).filter(Boolean);
      const r = { rotulo, ms: Math.round(ms), ...resumirPlanos(planos), acima: ms > o.orcamento };
      medidas.push(r);
      log(`${r.acima ? "ACIMA " : "ok    "} ${rotulo.padEnd(28)} ${String(r.ms).padStart(6)} ms · índices: ${r.indices.join(", ") || "(nenhum)"}`
        + `${r.seqGrandes.length ? ` · SEQ SCAN em ${r.seqGrandes.join(", ")}` : ""}`);
      for (const l of r.lentas) log(`         ${String(l.ms.toFixed(1)).padStart(8)} ms  ${l.consulta}`);
      if (o.planos) for (const p of planos) log(`--- ${p.ms} ms\n${p.texto}`);
    }
  } catch (e) {
    erro(`ERRO na carga: ${String(e.message).slice(0, 1200)}`);
    return { codigo: 2, medidas };
  } finally {
    try { await db.close(); } catch { /* já fechado */ }
  }
  const acima = medidas.filter(m => m.acima || m.erro);
  log(acima.length ? `${acima.length} medida(s) acima do orçamento de ${o.orcamento} ms ou com erro` : `todas dentro do orçamento de ${o.orcamento} ms`);
  return { codigo: acima.length ? 1 : 0, medidas };
}

const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) {
  let o;
  try { o = lerArgsCarga(process.argv.slice(2), process.env); }
  catch (e) { console.error(e.message); process.exitCode = 2; }
  if (o) rodarCarga(o).then(r => { process.exitCode = r.codigo; });
}
