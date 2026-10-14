/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente srv: âncoras das migrações 20261013a/b e dos smokes 26/27
   node --test testes/plano1000-banco.teste.mjs
   O comportamento SQL é provado pelos smokes (PGlite: node scripts/rodar-local.mjs 26 27; banco real: begin … rollback).
   Aqui: as regras de migração do plano 100 (aditiva, idempotente, versão registrada, notify), as cópias com a MESMA
   assinatura da definição em vigor e as permissões.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(RAIZ, "supabase/migrations");
const ler = f => readFileSync(resolve(MIG, f), "utf8").replace(/\r\n/g, "\n");
const A = "20261013a_operacao_fila_codewords.sql", B = "20261013b_seguranca_dados.sql";

/** Assinatura (nome + tipos) de cada «create or replace function public.x(...)» do texto. */
function assinaturas(sql) {
  const out = [];
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*returns/gi)) {
    const tipos = m[2].split(",").map(p => p.trim()).filter(Boolean).map(p => p.replace(/\s+default\s+.*$/i, "").split(/\s+/).slice(1).join(" ").toLowerCase());
    out.push(`${m[1]}(${tipos.join(",")})`);
  }
  return out;
}

test("migrações 20261013a/b: aditivas e idempotentes, registram a versão e recarregam o PostgREST", () => {
  for (const f of [A, B]) {
    const sql = ler(f);
    assert.doesNotMatch(sql, /\bdrop\s+(table|function|column|index|type)\b/i, `${f}: nada de drop`);
    assert.doesNotMatch(sql, /\bdelete\s+from\s+public\.nx_(?!taxa)\w+\s*;/i, `${f}: nada de apagar dados`);
    assert.doesNotMatch(sql, /\bconcurrently\b/i, `${f}: índice sem CONCURRENTLY (roda em transação)`);
    assert.doesNotMatch(sql, /nx_config\s+set|update\s+public\.nx_config/i, `${f}: nx_config intocada`);
    for (const m of sql.matchAll(/create (table|index)(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    for (const m of sql.matchAll(/add column(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    const nome = f.replace(/\.sql$/, "");
    assert.ok(sql.includes(`insert into public.nx_versao_banco (nome) values ('${nome}')\non conflict (nome) do update set aplicada_em = now();`), `${f}: versão`);
    assert.match(sql.trimEnd(), /notify pgrst, 'reload schema';$/, `${f}: termina no notify`);
    assert.ok(!/\$\s*;/.test(sql.replace(/\$\$\s*;/g, "")), `${f}: nenhum «$;» quebrado`);
  }
});

test("create or replace na MESMA assinatura: toda função que já existia mantém nome e tipos dos argumentos", () => {
  const antes = new Map();
  for (const f of readdirSync(MIG).filter(x => x.endsWith(".sql") && x < "20261013a").sort()) {
    for (const s of assinaturas(ler(f))) antes.set(s.split("(")[0] + "|" + s, true);
  }
  const nomesAntes = new Set([...antes.keys()].map(k => k.split("|")[0]));
  const novasPermitidas = new Set(["nx_crm_tempo(uuid,public.nx_ctx_t,bigint,bigint,timestamptz)"]);   // sobrecarga nova, sem default
  for (const f of [A, B]) {
    for (const s of assinaturas(ler(f))) {
      const nome = s.split("(")[0];
      if (!nomesAntes.has(nome) || novasPermitidas.has(s)) continue;
      assert.ok(antes.has(`${nome}|${s}`), `${f}: ${s} muda a assinatura de uma função existente`);
    }
  }
});

test("as cópias levam o marcado «plano 1000» e citam a origem; funções novas só para a service_role (a página do CRM para anon)", () => {
  const a = ler(A), b = ler(B);
  for (const fn of ["nx_fila_concluir", "nx_fila_pegar", "nx_codewords_vigia_alvos", "nx_codewords_sync_chamar", "nx_codewords_sync_alvos"]) assert.match(a, new RegExp(`function public\\.${fn}\\(`));
  for (const fn of ["nx_login_ip", "nx_ctx", "nx_ia_reservar", "nx_lead_entrada", "nx_rastreio_registrar", "nx_cv_listar", "nx_crm_tempo"]) assert.match(b, new RegExp(`— cópia de 202609\\d\\d\\w*\\.sql|— cópia de 20261\\d\\d\\d\\w*\\.sql`), fn);
  for (const f of ["nx_taxa_usar(text,int,int)", "nx_envio_vez(uuid,uuid)", "nx_codewords_envio_vez(uuid)", "nx_fila_adiar(bigint,timestamptz)", "nx_midia_presas(int)",
    "nx_codewords_status_lote(uuid,text[],text)", "nx_template_status(text,text,text,text,text)", "nx_ciclo_chamar()"]) assert.ok(a.includes(`'public.${f}'`), `${f} só service_role`);
  assert.match(b, /revoke all on function public\.nx_crm_tempo_pagina\(text,uuid,bigint,bigint,timestamptz\) from public, authenticated;/);
  assert.match(b, /'public\.nx_midia_visiveis\(jsonb,uuid,text\[\]\)'/);
  assert.match(a, /alter table public\.%I enable row level security/);
  assert.match(b, /raise exception 'cliente_pausado' using errcode = '22023'/);
  assert.match(b, /cf-connecting-ip/);
});

test("crons: nx-ciclo reagendado pelo nome (mesma hora) para nx_ciclo_chamar; segunda chance dos relatórios", () => {
  const a = ler(A);
  assert.match(a, /perform cron\.schedule\('nx-ciclo', coalesce\(v_agenda, '7 \* \* \* \*'\), 'select public\.nx_ciclo_chamar\(\)'\);/);
  assert.match(a, /'nx-relatorio-diario-2', '0 13 \* \* \*'/);
  assert.match(a, /'nx-relatorio-mensal-2', '0 15 1 \* \*'/);
  assert.match(a, /'nx-relatorio-mensal-3', '0 12 2 \* \*'/);
});

test("smokes 26 e 27: begin … rollback, terminam em OK_26/OK_27 e conferem a versão", () => {
  for (const [f, ok, versao] of [["26_operacao_fila_codewords.sql", "OK_26_OPERACAO_FILA_CODEWORDS", "20261013a_operacao_fila_codewords"], ["27_seguranca_dados.sql", "OK_27_SEGURANCA_DADOS", "20261013b_seguranca_dados"]]) {
    const sql = readFileSync(resolve(RAIZ, "supabase/testes", f), "utf8").replace(/\r\n/g, "\n");
    assert.match(sql, /^-- [^\n]*\n(?:--[^\n]*\n)*begin;\n/);
    assert.match(sql.trimEnd(), /end \$t\$;\nrollback;$/);
    assert.ok(sql.includes(`raise exception '${ok}`), ok);
    assert.ok(sql.includes(`nome = '${versao}'`), versao);
  }
});

test("smokes antigos ajustados ao comportamento novo (plano 1000) continuam válidos antes e depois das migrações", () => {
  const s20 = readFileSync(resolve(RAIZ, "supabase/testes/20_operacao_seguranca.sql"), "utf8");
  assert.match(s20, /plano 1000 \(SV-040\): concluir só mexe em item 'enviando'/);
  assert.match(s20, /or not exists \(select 1 from public\.nx_versao_banco where nome = '20261013a_operacao_fila_codewords'\)/);
  const s07 = readFileSync(resolve(RAIZ, "supabase/testes/07_relatorios.sql"), "utf8");
  assert.match(s07, /plano 1000 \(SV-107, 20261013b\)/);
});

/* ==================================================================
   Lote srv-2: migrações 20261013c (operação/índices) e 20261013d (contratos das telas), smokes 28 e 29
   ================================================================== */
const C = "20261013c_operacao_indices.sql", D = "20261013d_contratos_telas.sql";

test("migrações 20261013c/d: aditivas e idempotentes, registram a versão, recarregam o PostgREST e passam pelo nx_revogar_authenticated", () => {
  for (const f of [C, D]) {
    const sql = ler(f);
    assert.doesNotMatch(sql, /\bdrop\s+(table|function|column|index|type)\b/i, `${f}: nada de drop`);
    // fora dos corpos de função ($$ … $$, $function$ …): a faxina apaga quando roda, a migração nunca
    const solto = sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "");
    assert.doesNotMatch(solto, /\bdelete\s+from\s+public\.nx_\w+/i, `${f}: nada de apagar dados na migração (a faxina apaga por função)`);
    assert.doesNotMatch(solto, /\bupdate\s+public\.nx_\w+\s+set\b/i, `${f}: nada de alterar dados na migração`);
    assert.doesNotMatch(sql, /\bconcurrently\b/i, `${f}: índice sem CONCURRENTLY (roda em transação)`);
    assert.doesNotMatch(sql, /nx_config\s+set|update\s+public\.nx_config/i, `${f}: dados da nx_config intocados`);
    assert.doesNotMatch(sql, /alter\s+column\s+\w+\s+(set\s+data\s+)?type/i, `${f}: nada de trocar tipo de coluna`);
    for (const m of sql.matchAll(/create (table|index)(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    for (const m of sql.matchAll(/add column(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    const nome = f.replace(/\.sql$/, "");
    assert.ok(sql.includes(`insert into public.nx_versao_banco (nome) values ('${nome}')\non conflict (nome) do update set aplicada_em = now();`), `${f}: versão`);
    assert.match(sql.trimEnd(), /notify pgrst, 'reload schema';$/, `${f}: termina no notify`);
    assert.match(sql, /raise notice 'nx_revogar_authenticated: % funções', public\.nx_revogar_authenticated\(\);/, `${f}: permissões de volta ao padrão`);
    for (const m of sql.matchAll(/create or replace function public\.\w+\([^)]*\)[\s\S]*?\n(as \$\w*\$)/g)) {
      assert.match(m[0], /set search_path = ''/, `${f}: search_path fixo em ${m[0].split("(")[0]}`);
    }
  }
});

test("20261013c/d na MESMA assinatura da definição em vigor; funções novas só as do lote; copias citam a origem", () => {
  const antes = new Set();
  for (const f of readdirSync(MIG).filter(x => x.endsWith(".sql") && x < "20261013c").sort()) for (const s of assinaturas(ler(f))) antes.add(s);
  const nomesAntes = new Set([...antes].map(s => s.split("(")[0]));
  const novas = new Set(["nx_conversa_primeira_entrada", "nx_conversas_primeira_preencher", "nx_saas_faxina_lotes", "nx_metricas_renomear", "nx_metricas_zerar_ausentes",
    "nx_envios_pausado", "nx_envios_pausar", "nx_relatorio_chamar", "nx_saude_dados", "nx_saude"]);
  for (const f of [C, D]) {
    for (const s of assinaturas(ler(f))) {
      const nome = s.split("(")[0];
      if (!nomesAntes.has(nome)) { assert.ok(novas.has(nome), `${f}: ${nome} é nova e não está na lista do lote`); continue; }
      assert.ok(antes.has(s), `${f}: ${s} muda a assinatura de uma função existente`);
    }
  }
  const c = ler(C), d = ler(D);
  for (const [fn, origem] of [["nx_ia_reservar", "20261013b"], ["nx_rastreio_registrar", "20261013b"], ["nx_trava_pegar", "20260927"], ["nx_saas_faxina", "20261008b"],
    ["nx_fila_pegar", "20261013a"], ["nx_auto_ia_pegar", "20261008c"]]) assert.match(c, new RegExp(`${fn}[^\\n]*cópia de ${origem}|cópia de ${origem}[^\\n]*\\n[^\\n]*${fn}|${fn} — cópia de ${origem}|${fn} \\(cópia de ${origem}`), `${fn} cita ${origem}`);
  for (const [fn, origem] of [["nx_cv_json_item", "20261009b"], ["nx_cv_listar", "20261013b"], ["nx_cv_marcar_lida", "20260928e_conversas"], ["nx_cv_horario_normalizar", "20260928e_conversas_b"],
    ["nx_cv_base", "20260930e"], ["nx_crm_cards", "20260929c"], ["nx_inicio", "20261008c"], ["nx_dados", "20261008c"]]) assert.match(d, new RegExp(`${fn} — cópia de ${origem}`), `${fn} cita ${origem}`);
});

test("20261013c: o que mudou de comportamento está nas definições (sem DELETE no caminho quente, faxina em lotes, pausa respeitada, relatório na cota)", () => {
  const c = ler(C);
  const corpo = nome => { const i = c.indexOf(`create or replace function public.${nome}(`); assert.ok(i >= 0, nome); return c.slice(i, c.indexOf("end $$;", i)); };
  assert.doesNotMatch(corpo("nx_rastreio_registrar"), /delete from/i, "SV-109: o clique não apaga mais");
  assert.doesNotMatch(corpo("nx_trava_pegar"), /delete from/i, "SV-122: pegar trava não faz faxina");
  const fx = corpo("nx_saas_faxina");
  for (const t of ["nx_eventos", "nx_auto_execucoes", "nx_notificacoes", "nx_envios_fila", "nx_rastreio", "nx_travas", "nx_execucoes"]) assert.match(fx, new RegExp(`nx_saas_faxina_lotes\\('${t}'`), `SV-124: ${t} em lotes`);
  assert.match(corpo("nx_saas_faxina_lotes"), /if p_tabela not in \(/, "faxina só nas tabelas dela");
  assert.match(corpo("nx_fila_pegar"), /from public\.nx_operacao o where o\.id = 1\), false\) then return '\[\]'::json/, "SV-150: plataforma pausada");
  assert.match(corpo("nx_fila_pegar"), /c\.envios_pausados/, "SV-150: cliente pausado");
  assert.match(corpo("nx_auto_ia_pegar"), /c\.envios_pausados/);
  assert.match(corpo("nx_ia_reservar"), /'automacao', 'relatorio'\)/, "SV-063");
  assert.match(c, /check \(acao in \(%L, %L, %L, %L\)\)',\s+t, t \|\| '_acao_check3', 'sugerir', 'resumir', 'automacao', 'relatorio'/);
  assert.match(corpo("nx_metricas_zerar_ausentes"), /jsonb_array_length\(p_chaves\) = 0 then\s+return 0;/, "SV-080: leitura vazia nunca zera");
  assert.match(c, /create trigger nx_conversa_primeira_entrada before insert or update of ultima_entrada_em on public\.nx_conversas/, "SV-116");
  assert.match(c, /format\('select public\.nx_relatorio_chamar\(%L\)', x\.tipo\)/, "SV-197/SV-125: crons dos relatórios");
  assert.match(c, /if not exists \(select 1 from cron\.job where jobname = x\.nome\) then/, "SV-125: só cria o que falta");
  for (const i of ["nx_conversas_lista_ordem", "nx_conversas_aguardando", "nx_conversas_nao_lidas", "nx_contatos_tel_trgm", "nx_metricas_anuncio", "nx_execucoes_tarefa",
    "nx_travas_ate", "nx_mensagens_enviado_por", "nx_historico_autor", "nx_conversas_atribuida", "nx_tarefas_dono", "nx_notas_autor"]) assert.match(c, new RegExp(`create index if not exists ${i} on`), i);
  // permissões: internas só service_role; plataforma pela chave pública (com nx_exigir_gestor + nx_super)
  for (const f of ["nx_saas_faxina_lotes(text,text,int,int)", "nx_metricas_renomear(uuid,date,jsonb)", "nx_metricas_zerar_ausentes(uuid,text,date,date,jsonb)", "nx_relatorio_chamar(text)", "nx_saude_dados()"]) {
    assert.ok(c.includes(`'public.${f}'`), `${f} na lista da service_role`);
  }
  assert.match(c, /array\['public\.nx_saude\(text\)', 'public\.nx_envios_pausar\(text,uuid,boolean,text\)'\][\s\S]*?grant execute on function %s to anon, service_role/);
  for (const n of ["nx_saude", "nx_envios_pausar"]) assert.match(corpo(n), /public\.nx_exigir_gestor\(p_token\)[\s\S]*nx_super\(c\)/, `${n}: só plataforma`);
});

test("20261013d: contratos novos nas respostas (nenhum campo some) e marcar lida só de quem atende", () => {
  const d = ler(D);
  const corpo = nome => { const i = d.indexOf(`create or replace function public.${nome}(`); assert.ok(i >= 0, nome); return d.slice(i, d.indexOf("end $", i)); };
  for (const k of ["'ultima_msg_origem', v_origem", "'ultima_msg_por', v_por", "'ultima_msg_por_nome', v_por_nome", "'ultima_msg_resumo'", "'janela_ate'", "'negocio', v_neg"]) assert.ok(corpo("nx_cv_json_item").includes(k), k);
  const lst = corpo("nx_cv_listar");
  assert.doesNotMatch(lst, /row_number\(\)/, "SV-110: sem janela sobre todas as conversas");
  assert.match(lst, /order by cv\.ultima_entrada_em asc nulls last, cv\.ultima_msg_em desc, cv\.id desc\s+limit v_lim \+ 1/);
  assert.match(lst, /order by cv\.ultima_msg_em desc, cv\.id desc\s+limit v_lim \+ 1/);
  assert.match(lst, /'itens', v_itens, 'tem_mais', v_n > v_lim, 'contagens', v_cont,\s+'aba', v_aba, 'busca', v_busca/, "a mesma resposta");
  const ml = corpo("nx_cv_marcar_lida");
  assert.match(ml, /v_ignorado := v\.papel = 'leitura' or \(v_dono is not null and v_dono is distinct from v\.conta_id\);/, "CA-001");
  assert.match(ml, /'ultimo_wamid_in', v_w, 'ignorado', v_ignorado/);
  assert.match(corpo("nx_cv_horario_normalizar"), /or \(fim < ini and j <> n - 1\)/, "AS-145: noturna só na última faixa");
  assert.match(corpo("nx_cv_base"), /'distribuicao', d\.distribuicao, 'ativo', d\.ativo, 'horario', d\.horario\)/);
  assert.match(corpo("nx_crm_cards"), /'movido_por', mv\.nome, 'movido_por_id', mv\.autor_id, 'movido_em', mv\.criado_em/);
  assert.match(corpo("nx_inicio"), /'agendados_sem_data', j_sem_data\);/); assert.match(corpo("nx_inicio"), /e\.marco = 'agendada'\s+and l\.consulta_em is null/);
  const dd = corpo("nx_dados");
  assert.match(dd, /'agora', now\(\),/); assert.match(dd, /'ultimo_sync_parcial', ultimo_sync_parcial/); assert.match(dd, /coalesce\(cv\.primeira_entrada_em,/);
});

test("smokes 28 e 29: begin … rollback, terminam em OK_28/OK_29 e conferem a versão; os antigos 06/11/21 valem antes e depois", () => {
  for (const [f, ok, versao] of [["28_operacao_indices.sql", "OK_28_OPERACAO_INDICES", "20261013c_operacao_indices"], ["29_contratos_telas.sql", "OK_29_CONTRATOS_TELAS", "20261013d_contratos_telas"]]) {
    const sql = readFileSync(resolve(RAIZ, "supabase/testes", f), "utf8").replace(/\r\n/g, "\n");
    assert.match(sql, /^-- [^\n]*\n(?:--[^\n]*\n)*begin;\n/);
    assert.match(sql.trimEnd(), /end \$t\$;\nrollback;$/);
    assert.ok(sql.includes(`raise exception '${ok}`), ok);
    assert.ok(sql.includes(`nome = '${versao}'`), versao);
  }
  const s = n => readFileSync(resolve(RAIZ, "supabase/testes", n), "utf8");
  assert.match(s("06_conversas.sql"), /plano 1000 \(CA-001, 20261013d\)[\s\S]*if exists \(select 1 from public\.nx_versao_banco where nome = '20261013d_contratos_telas'\)/);
  assert.match(s("06_conversas.sql"), /plano 1000 \(AS-145, 20261013d\)/);
  assert.match(s("11_agenda_rastreio.sql"), /plano 1000 \(SV-109, 20261013c\)[\s\S]*if exists \(select 1 from public\.nx_versao_banco where nome = '20261013c_operacao_indices'\)/);
  assert.match(s("21_dados_telas.sql"), /plano 1000 \(SV-116, 20261013c\)[\s\S]*column_name = 'primeira_entrada_em'/);
});

/* ================================================================== lote srv-3: 20261013e / f / g e os smokes 30, 31, 32 */
const E = "20261013e_funcoes_seguranca.sql", F = "20261013f_entrada_contratos.sql", G = "20261013g_validar_status_mensagens.sql";

test("migrações 20261013e/f/g: aditivas e idempotentes, versão registrada, notify no fim, search_path fixo; e/f passam pelo nx_revogar_authenticated", () => {
  for (const f of [E, F, G]) {
    const sql = ler(f);
    assert.doesNotMatch(sql, /\bdrop\s+(table|function|column|index|type|constraint)\b/i, `${f}: nada de drop`);
    const solto = sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "");
    assert.doesNotMatch(solto, /\bdelete\s+from\s+public\.nx_\w+/i, `${f}: nada de apagar dados na migração`);
    assert.doesNotMatch(solto, /\bupdate\s+public\.nx_\w+\s+set\b/i, `${f}: nada de alterar dados na migração`);
    // a cópia do nx_config_salvar (corpo de função) grava a config quando o painel salva; a migração em si não toca nela
    assert.doesNotMatch(solto, /update\s+public\.nx_config/i, `${f}: dados da nx_config intocados (fora das funções)`);
    assert.doesNotMatch(sql, /alter\s+column\s+\w+\s+(set\s+data\s+)?type/i, `${f}: nada de trocar tipo de coluna`);
    for (const m of sql.matchAll(/create (table|index)(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    for (const m of sql.matchAll(/add column(?! if not exists)/gi)) assert.fail(`${f}: ${m[0]} sem if not exists`);
    const nome = f.replace(/\.sql$/, "");
    assert.ok(sql.includes(`insert into public.nx_versao_banco (nome) values ('${nome}')\non conflict (nome) do update set aplicada_em = now();`), `${f}: versão`);
    assert.match(sql.trimEnd(), /notify pgrst, 'reload schema';$/, `${f}: termina no notify`);
    for (const m of sql.matchAll(/create or replace function public\.\w+\([^)]*\)[\s\S]*?\n(as \$\w*\$)/g)) assert.match(m[0], /set search_path = ''/, `${f}: search_path fixo`);
  }
  for (const f of [E, F]) assert.match(ler(f), /raise notice 'nx_revogar_authenticated: % funções', public\.nx_revogar_authenticated\(\);/, `${f}: permissões de volta ao padrão`);
  assert.match(ler(G), /alter table public\.nx_mensagens validate constraint nx_mensagens_status_check/);
  assert.match(ler(G), /not c\.convalidated/, "g: só valida quando ainda não está validada");
});

test("20261013e/f na MESMA assinatura da definição em vigor (cópias citam a origem); funções novas só as do lote, com permissões explícitas", () => {
  const antes = new Set();
  for (const f of readdirSync(MIG).filter(x => x.endsWith(".sql") && x < "20261013e").sort()) for (const s of assinaturas(ler(f))) antes.add(s);
  const nomesAntes = new Set([...antes].map(s => s.split("(")[0]));
  const novas = new Set(["nx_midia_apagada", "nx_midia_referenciadas", "nx_canal_qualidade", "nx_canal_contar", "nx_cv_msg_reenvio_v2", "nx_ia_cache_ler",
    "nx_ia_cache_gravar", "nx_ia_custo_alto", "nx_sessoes_encerrar", "nx_canais_estado_desde_preencher", "nx_dados_colunas"]);
  // sobrecargas NOVAS de propósito (nome existente, assinatura nova que não casa com as chamadas de antes)
  const sobrecargas = new Set(["nx_codewords_canal(text,text)", "nx_negocio_mover(text,uuid,bigint,uuid,double precision,jsonb,uuid)"]);
  for (const f of [E, F]) {
    const sql = ler(f);
    for (const s of assinaturas(sql)) {
      const nome = s.split("(")[0];
      if (!nomesAntes.has(nome)) { assert.ok(novas.has(nome), `${f}: ${nome} é nova e não está na lista do lote`); assert.match(sql, new RegExp(`public\\.${nome}\\(`)); continue; }
      if (sobrecargas.has(s)) continue;
      assert.ok(antes.has(s), `${f}: ${s} muda a assinatura de uma função existente`);
    }
  }
  const e = ler(E), f = ler(F);
  for (const [fn, origem] of [["nx_config_salvar", "20261008b"], ["nx_disparar", "20261001a"], ["nx_saas_faxina_lotes", "20261013c"], ["nx_saas_faxina", "20261013c"], ["nx_entrar", "20261008b"]])
    assert.match(e, new RegExp(`${fn}[^\n]* — cópia de ${origem}`), `${fn} cita ${origem}`);
  for (const [fn, origem] of [["nx_lead_entrada", "20261013b"], ["nx_wa_entrada", "20261008a"], ["nx_lead_webhook", "20261008a"], ["nx_auto_base", "20261001a"],
    ["nx_usuarios_listar", "20260928c"], ["nx_automacao_execucoes", "20261001a"], ["nx_cv_mensagens", "20260928e"], ["nx_canal_historico_gravar", "20261008b"], ["nx_pulso", "20261009b"]])
    assert.match(f, new RegExp(`${fn}[^\n]* — cópia de ${origem}`), `${fn} cita ${origem}`);
  // a sobrecarga do mover não pode casar com as chamadas de 4–6 argumentos (todos os 7 sem default)
  assert.match(f, /nx_negocio_mover\(p_token text, p_cliente uuid, p_id bigint, p_estagio uuid,\s*p_ordem double precision, p_extra jsonb, p_req uuid\)/);
  assert.doesNotMatch(f, /p_req uuid default/);
});

test("20261013e/f: o comportamento novo está nas definições (marcados «plano 1000»)", () => {
  const e = ler(E), f = ler(F);
  assert.match(e, /timeout_milliseconds := 155000/); assert.match(e, /raise exception 'funcoes_url_invalida'/);
  assert.match(e, /\^claude-\[a-z0-9\.-\]\{2,60\}\$/, "modelo_ia só claude-*");
  assert.match(e, /'contaip:' \|\| v_email \|\| '\|' \|\| v_ip/); assert.match(e, /offset 20\)/);
  assert.match(e, /delete from public\.nx_login_falhas where chave = 'conta:' \|\| v_email/);
  assert.match(e, /'nx_ia_reservas', 'nx_codewords_taxa', 'nx_taxa', 'nx_ia_cache'/);
  assert.match(f, /perform set_config\('lock_timeout', '5s', true\);/g);
  assert.equal((f.match(/perform set_config\('lock_timeout', '5s', true\);/g) || []).length, 3, "lock_timeout nas três entradas");
  assert.equal((f.match(/nx_tel_chave/g) || []).length >= 2, true);
  assert.match(f, /elsif not coalesce\(ct\.bloqueado, false\) then/);
  assert.match(f, /raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone'/);
  assert.match(f, /when v_delta or p_antes_id is not null then '\{\}'::jsonb/);
  assert.match(f, /'utm_medium', v_utm_m/); assert.match(f, /'aceite_privacidade', v_aceite/);
});

test("smokes 30, 31 e 32: begin … rollback, terminam em OK_30/31/32 e conferem a versão; os antigos 07/20/26/28 ajustados valem antes e depois", () => {
  for (const [f, ok, versao] of [["30_funcoes_seguranca.sql", "OK_30_FUNCOES_SEGURANCA", "20261013e_funcoes_seguranca"],
    ["31_entrada_contratos.sql", "OK_31_ENTRADA_CONTRATOS", "20261013f_entrada_contratos"], ["32_validar_status_mensagens.sql", "OK_32_VALIDAR_STATUS_MENSAGENS", "20261013g_validar_status_mensagens"]]) {
    const sql = readFileSync(resolve(RAIZ, "supabase/testes", f), "utf8").replace(/\r\n/g, "\n");
    assert.match(sql, /^-- [^\n]*\n(?:--[^\n]*\n)*begin;\n/);
    assert.match(sql.trimEnd(), /end \$t\$;\nrollback;$/);
    assert.ok(sql.includes(`raise exception '${ok}`), ok);
    assert.ok(sql.includes(`nome = '${versao}'`), versao);
  }
  const s = n => readFileSync(resolve(RAIZ, "supabase/testes", n), "utf8");
  assert.match(s("07_relatorios.sql"), /plano 1000 \(SV-137, 20261013f\)[\s\S]*nome = '20261013f_entrada_contratos'/);
  assert.match(s("20_operacao_seguranca.sql"), /plano 1000 \(SV-238, 20261013e\)/); assert.match(s("20_operacao_seguranca.sql"), /plano 1000 \(SV-239, 20261013e\)/);
  for (const n of ["26_operacao_fila_codewords.sql", "28_operacao_indices.sql"]) assert.match(s(n), /https:\/\/abcdefghijklmnopqrst\.supabase\.co\/functions\/v1/, n);
});
