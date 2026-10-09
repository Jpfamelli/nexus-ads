/* ÓRBITA — testes/plano100-banco.teste.mjs · frente S-B (plano «100+ melhorias», 08/10/2026)
   Âncoras das migrações 20261008a/b/c, dos smokes 19/20/21 e da rede de proteção do 09 (RLS/grants/search_path).
   Estático: lê os arquivos e confere regras de ouro (aditiva, idempotente, security definer + search_path '', versão no fim,
   notify), as ASSINATURAS dos contratos 3–12 que as funções e a onda 2 consomem, o casamento JS × SQL (comum.js, codewords.js,
   ia_automacoes.js) e os casos que os smokes cobrem. Com ORBITA_PGLITE=1 (e @electric-sql/pglite instalado) roda também os
   smokes 20 e 21 num Postgres local de verdade (a 20261003a é pulada: ela é um patch por âncora que só casa no banco real).
   Sem PGlite o teste é só estático; o ensaio no banco real (begin … rollback pelo MCP) continua sendo o que vale. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMANDOS } from "./rodar-tudo.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = p => readFileSync(join(RAIZ, p), "utf8").replace(/\r\n/g, "\n");
const MIG = join(RAIZ, "supabase", "migrations");
const semComentario = s => s.replace(/^\s*--.*$/gm, "").replace(/\s--[^\n']*$/gm, "");

const ARQ_A = "supabase/migrations/20261008a_entrada_lead_rastreio.sql";
const ARQ_B = "supabase/migrations/20261008b_operacao_seguranca.sql";
const ARQ_C = "supabase/migrations/20261008c_dados_telas.sql";
const A = ler(ARQ_A), B = ler(ARQ_B), C = ler(ARQ_C);
const S19 = ler("supabase/testes/19_entrada_lead_rastreio.sql");
const S20 = ler("supabase/testes/20_operacao_seguranca.sql");
const S21 = ler("supabase/testes/21_dados_telas.sql");
const S09 = ler("supabase/testes/09_isolamento.sql");

const migracoes = readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
/** Última definição de uma função nas migrações (ordem de aplicação) → { arquivo, params:[{nome, opcional}], corpo }. */
function ultimaDef(nome) {
  let def = null;
  for (const f of migracoes) {
    const sql = readFileSync(join(MIG, f), "utf8").replace(/\r\n/g, "\n");
    const re = new RegExp(`create or replace function public\\.${nome}\\(([^)]*)\\)\\s*returns\\s+[\\w. \\[\\]]+?\\s+language[\\s\\S]*?as\\s+\\$(\\w*)\\$([\\s\\S]*?)\\$\\2\\$`, "gi");
    for (const m of sql.matchAll(re)) {
      const params = m[1].split(",").map(a => a.trim()).filter(Boolean)
        .map(a => ({ nome: a.split(/\s+/)[0], opcional: /\sdefault\s/i.test(a) }));
      def = { arquivo: f, params, corpo: m[3], texto: m[0] };
    }
  }
  return def;
}
/** Todas as definições de um nome (sobrecargas incluídas), na ordem. */
function todasDefs(nome) {
  const out = [];
  for (const f of migracoes) {
    const sql = readFileSync(join(MIG, f), "utf8").replace(/\r\n/g, "\n");
    for (const m of sql.matchAll(new RegExp(`create or replace function public\\.${nome}\\(([^)]*)\\)`, "gi"))) {
      out.push({ arquivo: f, params: m[1].split(",").map(a => a.trim()).filter(Boolean).map(a => a.split(/\s+/)[0]) });
    }
  }
  return out;
}
const params = nome => ultimaDef(nome).params.map(p => p.nome);
const obrigatorios = nome => ultimaDef(nome).params.filter(p => !p.opcional).map(p => p.nome);

// ------------------------------------------------------------ regras de ouro das três migrações
for (const [nome, sql, versao] of [["a", A, "20261008a_entrada_lead_rastreio"], ["b", B, "20261008b_operacao_seguranca"], ["c", C, "20261008c_dados_telas"]]) {
  test(`migração ${nome}: aditiva e idempotente, toda função security definer + search_path '', versão no fim, notify, sem segredo`, () => {
    const s = semComentario(sql);
    assert.ok(!/create\s+table\s+(?!if not exists)/i.test(s), "create table sem if not exists");
    assert.ok(!/create\s+(unique\s+)?index\s+(?!if not exists)/i.test(s), "create index sem if not exists");
    assert.ok(!/add\s+column\s+(?!if not exists)/i.test(s), "add column sem if not exists");
    assert.ok(!/create\s+function/i.test(s), "função sem or replace");
    assert.ok(!/\btruncate\b/i.test(s), "nada de truncate");
    assert.ok(!/\bdelete\s+from\s+public\.nx_(clientes|contatos|leads|mensagens|historico|auditoria|notas|conversas)\b/i.test(s), "nenhuma tabela de dado do cliente é apagada");
    // nx_config: nenhuma escrita de DADO pela migração (a única escrita é o corpo da RPC nx_config_salvar, que é o que ela faz)
    const fora = semComentario(sql.replace(ultimaDef("nx_config_salvar").texto, ""));
    assert.ok(!/\b(update|insert\s+into|delete\s+from)\s+public\.nx_config\b/i.test(fora), "nada escreve em nx_config fora de nx_config_salvar");
    // o único drop: constraint de CHECK trocada dentro de do $ … $ (nx_mensagens.status / nx_notificacoes.tipo / nx_auto_ia_pedidos.status).
    // Nada de drop function: assinatura que existe no banco não sai nem muda (sobrecarga nova só sem default — PGRST203)
    for (const m of s.matchAll(/\bdrop\s+(\w+)[^;]*/gi)) {
      const t = m[0];
      assert.ok(/^drop constraint %I', r\.conname\)$/i.test(t.trim()), `drop fora do permitido: ${t}`);
    }
    assert.ok(!/\bdrop\s+function\b/i.test(s), "nenhum drop function");
    const n = (s.match(/create or replace function/g) || []).length;
    assert.ok(n > 0);
    assert.equal((s.match(/security definer\s*\n\s*set search_path = ''/gi) || []).length, n, "toda função: security definer + set search_path = ''");
    assert.ok(!/set search_path\s*(to|=)\s*'public/i.test(s), "nenhuma função com search_path público");
    assert.match(s, new RegExp(`insert into public\\.nx_versao_banco \\(nome\\) values \\('${versao}'\\)\\s*on conflict \\(nome\\) do update set aplicada_em = now\\(\\);`), "grava a própria versão");
    assert.ok(s.trimEnd().endsWith("notify pgrst, 'reload schema';"), "termina em notify");
    assert.ok(s.indexOf("nx_versao_banco (nome) values") < s.lastIndexOf("notify pgrst"), "versão antes do notify");
    assert.ok(!/sk-ant-|cwk-[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}|service_role_key|cron_token\s*=\s*'/i.test(sql), "nenhum segredo");
    assert.ok(!/raise exception '[^']*' *;?\s*$/m.test("") , "sanidade");
  });
}

test("a migração b é a mais nova depois da a e a c depois da b (ordem de aplicação) e nenhuma redefine a a", () => {
  const i = migracoes.indexOf("20261008a_entrada_lead_rastreio.sql"), j = migracoes.indexOf("20261008b_operacao_seguranca.sql"), k = migracoes.indexOf("20261008c_dados_telas.sql");
  assert.ok(i >= 0 && j > i && k > j);
  // a c depende de nx_canal_estado e nx_revogar_authenticated (da b): a ordem alfabética garante b antes de c
  assert.match(C, /public\.nx_canal_estado\(k\)/); assert.match(C, /public\.nx_revogar_authenticated\(\)/);
  assert.match(B, /create or replace function public\.nx_canal_estado\(/); assert.match(B, /create or replace function public\.nx_revogar_authenticated\(/);
});

// ------------------------------------------------------------ assinaturas dos contratos (PGRST203: nenhuma assinatura existente muda)
test("contratos 3, 6, 7, 10, 11: assinaturas exatas das RPCs novas e das reescritas", () => {
  assert.deepEqual(params("nx_canal_historico_listar"), ["p_token", "p_cliente", "p_canal", "p_limite"]);
  assert.deepEqual(obrigatorios("nx_canal_historico_listar"), ["p_token", "p_cliente", "p_canal"]);
  assert.deepEqual(params("nx_codewords_vigia_alvos"), ["p_limite"]); assert.deepEqual(obrigatorios("nx_codewords_vigia_alvos"), []);
  assert.deepEqual(params("nx_codewords_contar"), ["p_canal", "p_chave"]);
  assert.deepEqual(params("nx_agenda_presenca"), ["p_token", "p_cliente", "p_negocio", "p_estado"]);
  assert.deepEqual(params("nx_automacao_execucoes_dia"), ["p_token", "p_cliente", "p_automacao", "p_dias"]);
  assert.deepEqual(obrigatorios("nx_automacao_execucoes_dia"), ["p_token", "p_cliente", "p_automacao"]);
  assert.deepEqual(params("nx_ia_uso_dia"), ["p_token", "p_cliente", "p_dias"]); assert.deepEqual(obrigatorios("nx_ia_uso_dia"), ["p_token", "p_cliente"]);
  assert.deepEqual(params("nx_ia_registrar_reserva"), ["p_reserva", "p_modelo", "p_in", "p_out", "p_ok", "p_custo_usd", "p_stop_reason", "p_ms"]);
  assert.deepEqual(obrigatorios("nx_ia_registrar_reserva"), ["p_reserva", "p_modelo", "p_in", "p_out", "p_ok", "p_custo_usd", "p_stop_reason", "p_ms"],
    "a sobrecarga de 8 não tem default (com default, 5 chaves casariam com as duas → PGRST203)");
  const reservas = todasDefs("nx_ia_registrar_reserva");
  assert.ok(reservas.some(d => d.params.join() === "p_reserva,p_modelo,p_in,p_out,p_ok" && d.arquivo.startsWith("20260930c")), "a de 5 argumentos (20260930c) continua");
  assert.ok(reservas.every(d => !d.arquivo.startsWith("20261008") || d.params.length === 8), "a c só acrescenta a de 8");
  // reescritas: a lista de parâmetros é a MESMA de antes
  assert.deepEqual(params("nx_auto_ia_falhar"), ["p_pedido", "p_erro", "p_tentar", "p_em", "p_conta"]);
  assert.deepEqual(params("nx_auto_ia_pegar"), ["p_pedido", "p_max"]);
  assert.deepEqual(params("nx_entrar"), ["p_email", "p_senha"]);
  assert.deepEqual(params("nx_criar_conta"), ["p_email", "p_senha", "p_nome", "p_codigo"]);
  assert.deepEqual(params("nx_sessao"), ["p_token"]); assert.deepEqual(params("nx_app_sessao"), ["p_token"]);
  assert.deepEqual(params("nx_conta_definir"), ["p_token", "p_conta", "p_aprovado", "p_papel", "p_clientes"]);
  assert.deepEqual(params("nx_config_salvar"), ["p_token", "p_cfg"]);
  assert.deepEqual(params("nx_codewords_situacao"), ["p_canal", "p_cliente", "p_dados"]);
  assert.deepEqual(params("nx_fila_concluir"), ["p_id", "p_status", "p_erro", "p_mensagem"]);
  assert.deepEqual(params("nx_pulso"), ["p_token", "p_cliente"]); assert.deepEqual(params("nx_inicio"), ["p_token", "p_cliente"]);
  assert.deepEqual(params("nx_dados"), ["p_token", "p_cliente", "p_dias"]);
  assert.deepEqual(params("nx_agenda_dia"), ["p_token", "p_cliente", "p_data", "p_dias"]);
  assert.deepEqual(params("nx_agenda_marcar_core"), ["p_cliente", "p_negocio", "p_inicio", "p_servico", "p_remarcar", "p_encaixe", "p_quem", "p_obs", "p_conta"]);
  assert.deepEqual(params("nx_saas_faxina"), []); assert.deepEqual(params("nx_auto_ia_chamar"), []);
  assert.deepEqual(params("nx_hash"), ["p"]); assert.deepEqual(params("nx_conta_do_token"), ["p_token"]);
  // nx_cv_nota: a de 4 continua e a de 5 (p_req SEM default, padrão de 20261002c) é nova
  const notas = todasDefs("nx_cv_nota");
  assert.ok(notas.some(d => d.params.join() === "p_token,p_cliente,p_conversa,p_texto"), "nx_cv_nota de 4 argumentos continua");
  assert.ok(notas.some(d => d.params.join() === "p_token,p_cliente,p_conversa,p_texto,p_req" && d.arquivo.startsWith("20261008b")), "nx_cv_nota de 5 argumentos na b");
  assert.match(B, /create or replace function public\.nx_cv_nota\(p_token text, p_cliente uuid, p_conversa bigint, p_texto text, p_req uuid\)/, "p_req sem default");
  // todas as reescritas vieram da ÚLTIMA definição (a b/c é a última de cada uma)
  assert.deepEqual(params("nx_contas_listar"), ["p_token"]);
  assert.deepEqual(params("nx_codewords_origem"), ["p_canal", "p_telefone", "p_origem", "p_detalhe"]); assert.deepEqual(obrigatorios("nx_codewords_origem"), ["p_canal", "p_telefone", "p_origem"]);
  assert.deepEqual(params("nx_notificacoes_listar"), ["p_token", "p_cliente", "p_limite"]); assert.deepEqual(obrigatorios("nx_notificacoes_listar"), ["p_token", "p_cliente"]);
  // nx_pulso ganhou canais na 20261009b (integração): a última definição passou para lá — conferido no teste das migrações de 09/10
  assert.ok(ultimaDef("nx_pulso").arquivo.startsWith("20261009b"), `nx_pulso: última definição na 20261009b (${ultimaDef("nx_pulso").arquivo})`);
  assert.match(ultimaDef("nx_pulso").corpo, /'nao_lidas'/); assert.match(ultimaDef("nx_pulso").corpo, /'canais'/);
  for (const n of ["nx_entrar", "nx_criar_conta", "nx_sessao", "nx_app_sessao", "nx_conta_definir", "nx_config_salvar", "nx_codewords_situacao", "nx_fila_concluir", "nx_saas_faxina", "nx_hash", "nx_conta_do_token", "nx_exigir_gestor", "nx_canal_json",
                   "nx_contas_listar", "nx_notificacoes_listar", "nx_codewords_origem"]) {
    assert.ok(ultimaDef(n).arquivo.startsWith("20261008b"), `${n}: última definição na b (${ultimaDef(n).arquivo})`);
  }
  for (const n of ["nx_auto_ia_falhar", "nx_auto_ia_pegar", "nx_auto_ia_chamar", "nx_ia_registrar_reserva", "nx_inicio", "nx_dados", "nx_agenda_marcar_core", "nx_agenda_dia"]) {
    assert.ok(ultimaDef(n).arquivo.startsWith("20261008c"), `${n}: última definição na c (${ultimaDef(n).arquivo})`);
  }
});

// ------------------------------------------------------------ JS × SQL
test("as Edge Functions chamam exatamente o que o banco oferece (comum.js, codewords.js, ia_automacoes.js)", () => {
  const comum = ler("supabase/functions/_compartilhado/comum.js"), cw = ler("supabase/functions/_compartilhado/codewords.js"), ia = ler("supabase/functions/_compartilhado/ia_automacoes.js");
  for (const k of ["p_custo_usd", "p_stop_reason", "p_ms"]) assert.ok(comum.includes(k), `comum.js registrarUsoIA manda ${k}`);
  assert.match(cw, /db\.rpc\("nx_codewords_contar", \{ p_canal: canal\.canal_id, p_chave: chave \}\)/);
  assert.match(cw, /db\.rpc\("nx_codewords_vigia_alvos", \{ p_limite: VIGIA_LIMITE \}\)/);
  for (const k of ["canal_id", "cliente_id", "caiu_em", "codewords_aviso_em"]) assert.match(ultimaDef("nx_codewords_vigia_alvos").corpo, new RegExp(`'${k}'`), `vigia devolve ${k} (lido por vigiarAparelhos)`);
  assert.match(cw, /codewords_aviso_em/);
  assert.match(ia, /interna\(db, "nx_auto_ia_falhar", \{ p_pedido: id, p_erro: erro, p_tentar: tentar, p_em: em, p_conta: conta \}\)/);
  for (const k of ["eco", "grupo", "lid", "payload_desconhecido", "http_422", "http_413"]) assert.match(ultimaDef("nx_codewords_contar").corpo, new RegExp(`'${k}'`), `contador ${k}`);
});

// ------------------------------------------------------------ regras novas no corpo (quebram se alguém «simplificar» a função)
test("S-B9/S-B10: login com bloqueio, cadastro limitado, sessão renovada, super/migracao/ativo, cliente_pausado", () => {
  const e = ultimaDef("nx_entrar").corpo;
  assert.match(e, /raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text/);
  assert.match(e, /nx_login_bloqueio\('conta:' \|\| v_email, 10, interval '15 minutes'\)/);
  assert.match(e, /nx_login_bloqueio\('ip:' \|\| v_ip, 10, interval '15 minutes'\)/);
  assert.match(e, /current_setting\('request\.headers', true\)/, "detecta a chamada pelo PostgREST");
  assert.match(e, /set_config\('response\.status', '400', true\)/, "pelo PostgREST a falha vira 400 com a transação commitada");
  assert.match(e, /json_build_object\('code', 'P0001', 'message', 'credenciais_invalidas', 'details', null, 'hint', null\)/, "o MESMO JSON de erro do PostgREST");
  assert.match(e, /raise exception 'credenciais_invalidas'/, "por SQL continua lançando (smokes 03/13)");
  assert.doesNotMatch(e, /delete from public\.nx_sessoes/, "a purga das vencidas saiu do login (vai para a faxina)");
  assert.match(e, /perform pg_sleep\(0\.4\)/);
  const c = ultimaDef("nx_criar_conta").corpo;
  assert.match(c, /nx_login_bloqueio\('cadastro:' \|\| v_ip, 5, interval '1 hour'\)/);
  assert.match(c, /nx_login_falha_registrar\(array\['cadastro:' \|\| v_ip\]\)/);
  assert.match(ultimaDef("nx_login_ip").corpo, /x-forwarded-for/);
  assert.match(B, /create table if not exists public\.nx_login_falhas/);
  assert.match(B, /create index if not exists nx_sessoes_expira on public\.nx_sessoes \(expira_em\)/);
  const s = ultimaDef("nx_sessao").corpo;
  assert.match(s, /update public\.nx_sessoes set expira_em = now\(\) \+ interval '30 days'\s*where token_hash = public\.nx_hash\(p_token\) and expira_em < now\(\) \+ interval '20 days'/);
  assert.match(s, /'super', public\.nx_super\(c\)/); assert.match(s, /'migracao', public\.nx_versao_atual\(\)/); assert.match(s, /nx_cliente_pausado_checar\(c\)/);
  const a = ultimaDef("nx_app_sessao").corpo;
  assert.match(a, /'ativo', coalesce\(x\.ativo, true\)/); assert.match(a, /'migracao', public\.nx_versao_atual\(\)/); assert.match(a, /nx_cliente_pausado_checar\(c\)/);
  assert.match(a, /c public\.nx_contas := public\.nx_conta_do_token\(p_token\)/, "continua validando o token antes de qualquer escrita");
  const p = ultimaDef("nx_cliente_pausado_checar").corpo;
  assert.match(p, /raise exception 'cliente_pausado' using errcode = '22023',\s*hint = /);
  assert.match(p, /p_conta\.papel = 'gestor' then return/, "gestor/super nunca são barrados");
  assert.match(ultimaDef("nx_versao_atual").corpo, /select max\(x\.nome\) from public\.nx_versao_banco x/);
});

test("S-B7/S-B8: nx_conta_definir no escopo com papel explícito; nx_config_salvar com null explícito e auditoria", () => {
  const d = ultimaDef("nx_conta_definir").corpo;
  const del = d.match(/delete from public\.nx_acessos a[\s\S]*?;/)[0];
  assert.match(del, /and public\.nx_pode\(c, a\.cliente_id\)/, "só apaga dentro do escopo do chamador");
  assert.match(d, /insert into public\.nx_acessos \(conta_id, cliente_id, papel\) values \(p_conta, v_cli, coalesce\(v_papel_acesso, 'admin'\)\)/, "papel explícito no acesso novo");
  assert.match(d, /'removidos', v_removidos, 'novos', v_novos, 'papel_acesso'/, "auditoria conta o que mudou");
  // pedido da frente P (P8): o clássico tira da tela as contas que o Órbita administra (painel.js contaDaPlataforma)
  const cl = ultimaDef("nx_contas_listar").corpo;
  assert.match(cl, /'origem', case when x\.papel <> 'gestor'/); assert.match(cl, /then 'orbita' else 'plataforma' end/);
  assert.match(cl, /cv\.usado_por = x\.id/); assert.match(cl, /a\.papel <> 'admin' or cardinality\(a\.departamentos\) > 0 or not a\.ver_todas/);
  assert.match(ler("web/painel.js"), /c\.origem !== "orbita"/);
  const cfg = ultimaDef("nx_config_salvar").corpo;
  for (const k of ["anthropic_api_key", "wa_access_token", "meta_app_secret"]) {
    assert.match(cfg, new RegExp(`case when jsonb_typeof\\(p_cfg->'${k}'\\) = 'null' then null\\s*else coalesce\\(nullif\\(p_cfg->>'${k}', ''\\), ${k}\\) end`), `${k}: null apaga, '' mantém`);
  }
  assert.match(cfg, /if not public\.nx_super\(c\) then raise exception 'so_plataforma'/);
  assert.match(cfg, /saas_url\s*=\s*case when p_cfg \? 'saas_url' then nullif\(p_cfg->>'saas_url', ''\) else saas_url end/);
  for (const k of ["painel_url", "wa_phone_number_id"]) assert.match(cfg, new RegExp(`${k}\\s*=\\s*case when p_cfg \\? '${k}' then nullif`));
  assert.match(cfg, /'config_segredo_removido' else 'config_salva'/);
  assert.match(cfg, /jsonb_object_keys\(p_cfg\)/, "a auditoria leva os NOMES das chaves");
  assert.doesNotMatch(cfg, /p_cfg->>'anthropic_api_key'\)\)/, "e nunca valores");
  assert.match(cfg, /hint = 'modelo_ia'/);
});

test("S-B11 (contrato 3): histórico do número, notificação, vigia, contadores, nx_canal_json", () => {
  assert.match(B, /create table if not exists public\.nx_canal_historico \(/);
  assert.match(B, /add column if not exists codewords_aviso_em timestamptz/); assert.match(B, /add column if not exists codewords_contadores jsonb not null default '\{\}'::jsonb/);
  assert.match(B, /'canal_caiu', 'canal_voltou'\)\)/, "tipos novos de notificação no CHECK");
  const sit = ultimaDef("nx_codewords_situacao").corpo;
  assert.match(sit, /v_antes := public\.nx_canal_estado\(k\);/); assert.match(sit, /if d \? 'conectado' then[\s\S]*nx_canal_historico_gravar\(k\.id, k\.cliente_id, v_antes, v_depois/);
  const g = ultimaDef("nx_canal_historico_gravar").corpo;
  assert.match(g, /if v_tem and p_depois is not distinct from p_antes then return false/, "mesmo estado não grava");
  assert.match(g, /p_antes = 'conectado' and p_depois = 'desconectado'[\s\S]*'canal_caiu'/); assert.match(g, /p_antes = 'desconectado' and p_depois = 'conectado'[\s\S]*'canal_voltou'/);
  assert.match(g, /'#\/config\/numeros'/); assert.match(g, /nx_pulso_bater\(p_cliente\)/);
  const v = ultimaDef("nx_codewords_vigia_alvos").corpo;
  assert.match(v, /interval '20 minutes'/); assert.match(v, /interval '2 hours'/); assert.match(v, /k\.codewords_api_segredo is not null/); assert.match(v, /c\.status in \('ativo', 'teste'\) and c\.ativo/);
  const ct = ultimaDef("nx_codewords_contar").corpo;
  assert.match(ct, /raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave'/); assert.match(ct, /k\.provedor = 'codewords'/);
  assert.match(ultimaDef("nx_canal_json").corpo, /'contadores', coalesce\(k\.codewords_contadores, '\{\}'::jsonb\), 'aviso_em', k\.codewords_aviso_em/);
  assert.match(ultimaDef("nx_canal_json").corpo, /'estado', public\.nx_canal_estado\(k\)/);
  assert.match(ultimaDef("nx_canal_historico_listar").corpo, /raise exception 'canal_nao_encontrado' using errcode = '22023'/);
  assert.match(ultimaDef("nx_canal_historico_listar").corpo, /nx_ctx\(p_token, p_cliente, 'admin'\)/);
  // pedido da frente A: o shell junta caiu × voltou do MESMO número por dados.canal_id (pulso.js canaisCaidosDe)
  assert.match(B, /alter table public\.nx_notificacoes add column if not exists dados jsonb;/);
  assert.match(g, /set dados = jsonb_build_object\('canal_id', p_canal, 'canal_nome', v_nome, 'estado', p_depois\)/);
  assert.match(ultimaDef("nx_notificacoes_listar").corpo, /'criado_em', n\.criado_em, 'dados', n\.dados\)/);
  const pulsoJs = ler("web/app/pulso.js");
  assert.match(pulsoJs, /d\.canal_id/); assert.match(pulsoJs, /d\.canal_nome/);
});

test("S-B12/S-B13/S-B16/S-B17: fila com recuo, nota com p_req, pulso com nao_lidas, faxina de transitórios, revoke de authenticated", () => {
  const f = ultimaDef("nx_fila_concluir").corpo;
  assert.match(f, /processado_em = null, pego_em = null, lote = null/);
  for (const t of ["1 minute", "5 minutes", "15 minutes", "60 minutes"]) assert.match(f, new RegExp(`interval '${t}'`));
  assert.match(f, /enviar_em = now\(\) \+ case when f\.tentativas <= 1/);
  const nota = todasDefs("nx_cv_nota").at(-1);
  assert.match(B, /nx_req_usar\(p_cliente, p_req, 'nx_cv_nota'\)/); assert.match(B, /nx_req_guardar\(p_cliente, p_req, 'nx_cv_nota', r::jsonb\)/);
  assert.equal(nota.params.length, 5);
  const pulso = ultimaDef("nx_pulso").corpo;
  assert.match(pulso, /'nao_lidas', \(select count\(\*\) from public\.nx_conversas cv/); assert.match(pulso, /cv\.nao_lidas > 0/); assert.match(pulso, /not cv\.oculta/);
  const fx = ultimaDef("nx_saas_faxina").corpo;
  assert.match(fx, /delete from public\.nx_sessoes where expira_em < now\(\) - interval '1 day'/);
  assert.match(fx, /delete from public\.nx_requisicoes where criado_em < now\(\) - interval '7 days'/);
  assert.match(fx, /delete from public\.nx_envio_refs where criado_em < now\(\) - interval '7 days'/);
  assert.match(fx, /delete from public\.nx_notificacoes where lida_em is not null and criado_em < now\(\) - interval '90 days'/);
  assert.match(fx, /delete from public\.nx_codewords_status_pendentes where expira_em < now\(\)/);
  assert.match(fx, /delete from public\.nx_login_falhas where em < now\(\) - interval '1 day'/);
  assert.match(fx, /delete from cron\.job_run_details where end_time < now\(\) - interval '3 days';/, "histórico do cron de TODOS os jobs");
  assert.doesNotMatch(fx, /nx_mensagens|nx_historico|nx_auditoria|nx_ia_uso/, "mensagens, histórico, auditoria e uso de IA ficam (decisão 6)");
  const rv = ultimaDef("nx_revogar_authenticated").corpo;
  assert.match(rv, /revoke execute on function %s from public, authenticated/); assert.match(rv, /if v_anon then execute format\('grant execute on function %s to anon'/);
  assert.match(B, /raise notice 'nx_revogar_authenticated: % funções', public\.nx_revogar_authenticated\(\);/); assert.match(C, /public\.nx_revogar_authenticated\(\)/);
  assert.equal((B.match(/from public, anon, authenticated/g) || []).length >= 3, true);
});

test("S-B14 (contrato 7): IA adiada, uso com custo/stop_reason/ms, séries por dia", () => {
  assert.match(C, /check \(status in \('pendente', 'processando', 'adiado', 'aplicado', 'erro', 'cancelado'\)\)/);
  assert.match(C, /add column if not exists custo_usd numeric\(12, 6\)/); assert.match(C, /add column if not exists stop_reason text/); assert.match(C, /add column if not exists ms int/);
  const fl = ultimaDef("nx_auto_ia_falhar").corpo;
  assert.match(fl, /v_adiar := coalesce\(p_tentar, false\) and not coalesce\(p_conta, true\) and coalesce\(p_em, 120\) >= 300;/, "adiado = espera longa sem gastar tentativa");
  assert.match(fl, /status = case when v_adiar then 'adiado' else 'pendente' end/); assert.match(fl, /'adiado', v_adiar, 'proximo_em', v_prox/);
  assert.match(fl, /if v_adiar then perform public\.nx_auto_ia_avisar_pausa\(r\.cliente_id, v_erro\); end if;/);
  assert.match(ultimaDef("nx_auto_ia_avisar_pausa").corpo, /interval '24 hours'/);
  assert.match(ultimaDef("nx_auto_ia_pegar").corpo, /q\.status in \('pendente', 'adiado'\) and q\.proximo_em <= now\(\)/);
  const ch = ultimaDef("nx_auto_ia_chamar").corpo;
  assert.match(ch, /q\.status in \('pendente', 'processando'\) and coalesce\(q\.acordou_em, q\.criado_em\) < now\(\) - interval '2 hours'/,
    "adiado fora do corte de 2 h; pendente/processando morrem 2 h depois da criação ou de quando ACORDOU (não no meio da decisão)");
  assert.match(C, /alter table public\.nx_auto_ia_pedidos add column if not exists acordou_em timestamptz;/);
  assert.match(ultimaDef("nx_auto_ia_pegar").corpo, /acordou_em = case when r\.status = 'adiado' then now\(\) else acordou_em end/);
  assert.match(ch, /anthropic_api_key, ''\)\), ''\) is not null\) then\s*return 0;/, "sem chave nada é despachado");
  assert.match(ch, /status in \('pendente', 'adiado'\) and proximo_em <= now\(\)/);
  const rr = ultimaDef("nx_ia_registrar_reserva").corpo;
  assert.match(rr, /insert into public\.nx_ia_uso\(reserva_id, cliente_id, conta_id, acao, modelo, tokens_in, tokens_out, ok, custo_usd, stop_reason, ms\)/);
  const ud = ultimaDef("nx_ia_uso_dia").corpo;
  assert.match(ud, /json_build_object\('dia', to_char\(d\.dia, 'YYYY-MM-DD'\), 'chamadas', coalesce\(u\.chamadas, 0\),\s*'tokens_in', coalesce\(u\.tin, 0\), 'tokens_out', coalesce\(u\.tout, 0\),\s*'custo_usd', coalesce\(u\.custo, 0\)\) order by d\.dia/, "chaves e ordem do contrato");
  assert.match(ud, /least\(greatest\(coalesce\(p_dias, 14\), 1\), 90\)/); assert.match(ud, /nx_ctx\(p_token, p_cliente, 'admin'\)/);
  const ex = ultimaDef("nx_automacao_execucoes_dia").corpo;
  assert.match(ex, /json_build_object\('dia', to_char\(d\.dia, 'YYYY-MM-DD'\), 'ok', coalesce\(e\.n_ok, 0\), 'erro', coalesce\(e\.n_erro, 0\)\) order by d\.dia/);
  assert.match(ex, /and not \(x\.ok and x\.detalhe = 'Condições não atendidas — nada feito\.'\)/, "a MESMA lista de nx_automacao_execucoes");
  assert.match(ex, /raise exception 'automacao_nao_encontrada' using errcode = '22023'/); assert.match(ex, /nx_ctx\(p_token, p_cliente, 'supervisor'\)/);
});

test("S-B15 (contratos 4–6): nx_inicio, nx_dados.hora_conversa, agenda com encaixe/dono_nome/presença", () => {
  const i = ultimaDef("nx_inicio").corpo;
  for (const k of ["'respondidas_no_prazo_pct', v_prazo", "'aguardando_lista', j_ag::jsonb", "'funil_mes', j_funil", "'series_14d', json_build_object('aguardando', j_s_ag, 'consultas', j_s_cs, 'valor_aberto', j_s_va, 'leads', j_s_ld)",
                   "'provedor', coalesce(k.provedor, 'meta')", "'estado', public.nx_canal_estado(k)", "'sync_em', k.codewords_sync_em"]) {
    assert.ok(i.includes(k), `nx_inicio devolve ${k}`);
  }
  assert.match(i, /json_build_object\('id', x\.id, 'nome', x\.nome, 'espera_min', x\.espera_min, 'canal', x\.canal\)/);
  assert.match(i, /limit 5\) x;/, "aguardando_lista ≤ 5");
  assert.match(i, /interval '15 minutes'/); assert.match(i, /interval '7 days'/);
  assert.match(i, /generate_series\(0, 13\)/, "14 dias");
  assert.match(i, /'leads', count\(\*\),\s*'conversas', count\(\*\) filter/, "funil = coorte do mês");
  // as chaves antigas continuam (o front antigo e o novo leem o mesmo JSON)
  for (const k of ["'conversas', (j_cv::jsonb", "'tarefas', (j_tf::jsonb", "'negocios', j_ng", "'leads', j_ld", "'canais', j_cn", "'notificacoes_nao_lidas', v_notif"]) assert.ok(i.includes(k), k);
  const d = ultimaDef("nx_dados").corpo;
  assert.match(d, /'nome', nome, 'vertical', vertical, 'cfg'/, "nx_dados.cliente.vertical (pedido da frente P)");
  assert.match(d, /as hora_conversa/); assert.match(d, /extract\(hour from \(min\(m\.criado_em\) at time zone 'America\/Sao_Paulo'\)\)::int/); assert.match(d, /m\.direcao = 'in' and m\.tipo <> 'sistema'/);
  assert.match(d, /perform public\.nx_exigir_modulo\(p_cliente, 'ads'\)/); assert.match(d, /erro_envio\n\s+from public\.nx_alertas/);
  const mc = ultimaDef("nx_agenda_marcar_core").corpo;
  assert.match(mc, /campos = \(coalesce\(x\.campos, '\{\}'::jsonb\) - 'presenca'\) \|\| jsonb_build_object\('encaixe', coalesce\(p_encaixe, false\)\)/);
  assert.match(mc, /'etapa', e\.nome/, "continua devolvendo a etapa");
  const ad = ultimaDef("nx_agenda_dia").corpo;
  assert.match(ad, /'dono_nome', \(select a\.nome from public\.nx_contas a where a\.id = l\.dono_id\)/); assert.match(ad, /'encaixe', coalesce\(\(l\.campos ->> 'encaixe'\)::boolean, false\)/);
  assert.match(ad, /'presenca', case when l\.campos ->> 'presenca' in \('compareceu', 'faltou'\)/);
  const pr = ultimaDef("nx_agenda_presenca").corpo;
  assert.match(pr, /v_estado not in \('compareceu', 'faltou', 'limpar'\)/); assert.match(pr, /hint = 'presenca'/); assert.match(pr, /hint = 'sem_consulta'/);
  assert.match(pr, /s\.marco = 'faltou'/); assert.match(pr, /return json_build_object\('ok', true, 'presenca', l\.campos ->> 'presenca', 'estagio_id', l\.estagio_id\)/);
  assert.match(pr, /nx_historico_add\(p_cliente, 'presenca'/); assert.match(pr, /nx_ctx\(p_token, p_cliente, 'atendente'\)/);
});

test("pedidos da S-F na b: meta_api_versao, status sem_confirmacao, origem contada com plataforma; CHECKs superconjunto NOT VALID", () => {
  assert.match(B, /alter table public\.nx_config\s+add column if not exists meta_api_versao text/);
  assert.match(B, /pg_get_constraintdef\(c\.oid\) not like '%''sem_confirmacao''%'/, "troca o CHECK só quando falta sem_confirmacao (idempotente)");
  assert.match(B, /check \(status in \('recebida', 'pendente', 'enviada', 'entregue', 'lida', 'falhou', 'sistema', 'sem_confirmacao'\)\) not valid;/);
  assert.match(B, /'canal_caiu', 'canal_voltou'\)\) not valid;/); assert.match(C, /'erro', 'cancelado'\)\) not valid;/);
  const o = ultimaDef("nx_codewords_origem").corpo;
  assert.match(o, /v_plat := case p_origem when 'instagram' then 'meta' when 'facebook' then 'meta' when 'google' then 'google' end;/);
  assert.match(o, /if l\.plataforma is not null or nullif\(l\.anuncio_ext, ''\) is not null or l\.gclid is not null or l\.origem = 'anuncio' then/, "anúncio/rastreio nunca é sobrescrito");
  assert.match(o, /and plataforma is null and origem = 'whatsapp';/, "contato só quando ainda é whatsapp sem plataforma");
  const cw = ler("supabase/functions/_compartilhado/ciclo.js");
  assert.match(cw, /meta_api_versao/);
});

// ------------------------------------------------------------ smokes e rede de proteção
test("smokes 19, 20 e 21: begin … rollback, terminam em OK_NN e cobrem os casos do plano", () => {
  for (const [s, ok] of [[S19, "OK_19_ENTRADA_LEAD_RASTREIO"], [S20, "OK_20_OPERACAO_SEGURANCA"], [S21, "OK_21_DADOS_TELAS"]]) {
    assert.match(s, /^begin;/m); assert.match(s, /^rollback;/m); assert.ok(s.includes(`raise exception '${ok}`), ok);
    assert.match(s, /create or replace function pg_temp\.ok\(/); assert.match(s, /create or replace function pg_temp\.erro\(/);
    assert.ok(!/sk-ant-|cwk-[A-Za-z0-9]{8,}/.test(s), "sem segredo");
  }
  for (const caso of ["aberto há 45 dias → existente", "último negócio fechado → nasce um novo", "nome do negócio = nome do contato no CRM", "campanha_ext preenchida", "fixo 3333-4444 e «celular» 93333-4444", "canal Meta aceito", "terça 1h aberto"]) assert.ok(S19.includes(caso), `19 cobre: ${caso}`);
  for (const caso of ["por SQL: senha errada lança credenciais_invalidas", "11ª tentativa → muitas_tentativas", "a senha certa também fica bloqueada", "outro e-mail do MESMO IP está bloqueado pelo IP", "recém-bloqueado: 15 min (nunca mais)", "vencido o bloqueio a senha certa entra", "6º cadastro na hora → muitas_tentativas",
                      "nx_sessao renova a sessão", "cliente_pausado", "super entra e vê ativo=false", "acesso que continua mantém o papel", "acesso novo herda o papel", "null explícito apaga SÓ a chave da IA", "nenhum valor de segredo na auditoria",
                      "caiu: linha desconectado", "admin do cliente recebe canal_caiu", "mesmo estado de novo: nem linha nem notificação", "voltou: linha conectado + canal_voltou", "vigia: aparelho conferido há 30 min é alvo", "com conversa recente a sync já confere: fora", "contadores por canal",
                      "pegar: enviando, pego_em pelo gatilho, lote do cabeçalho", "devolver lote", "concluir(pendente) na 1ª tentativa: volta daqui a 1 min", "4ª em diante: 60 min", "a mesma p_req devolve a MESMA nota", "admin: 2 conversas não lidas", "sessão vencida some", "só notificação LIDA há > 90 d some",
                      "nenhuma nx_* executável por authenticated", "muitas_tentativas sai com errcode 22023", "cliente_pausado sai com errcode 22023", "canal_caiu leva dados.canal_id, dados.canal_nome",
                      "nx_notificacoes_listar devolve dados do canal", "canal_voltou leva o MESMO canal_id", "origem: atendente (papel que o clássico não conhece) = orbita", "origem: conta que entrou por convite = orbita",
                      "origem: clínica do clássico (acesso admin, vê tudo) = plataforma", "meta_api_versao aceita", "nx_mensagens aceita status sem_confirmacao",
                      "origem instagram: orgânico com plataforma meta", "anúncio (CTWA) nunca é sobrescrito pela origem contada"]) assert.ok(S20.includes(caso), `20 cobre: ${caso}`);
  for (const caso of ["respondidas no prazo: 1 de 2", "aguardando_lista: {id, nome, espera_min, canal}", "funil_mes: coorte do mês", "tem 14 pontos", "valor em aberto: hoje 1000+500+200", "Meta ativo = conectado", "hora da 1ª mensagem recebida = 14",
                      "campos.encaixe gravado", "nx_agenda_dia: encaixe=true, dono_nome", "faltou: vai para o estágio de marco «faltou»", "limpar: só tira a marca", "remarcar limpa a presença",
                      "pedido adiado por 30 min sem gastar tentativa", "admin avisado uma vez", "espera curta (60 s) continua pendente", "adiado há 3 h sobrevive ao corte de 2 h", "pendente esquecido há 2 h (desde que acordou) vira erro", "pegar um adiado marca acordou_em", "adiado que acordou há 1 min (criado há 3 h) não morre", "a de 5 argumentos continua e a de 8 existe", "nenhuma sobrecarga com default",
                      "nx_dados.cliente.vertical",
                      "a chamada de 5 argumentos continua valendo", "nx_ia_uso_dia: 14 dias, mais antigo primeiro", "chaves na ordem do contrato", "a série soma a lista de nx_automacao_execucoes"]) assert.ok(S21.includes(caso), `21 cobre: ${caso}`);
});

test("09_isolamento ganhou a rede de proteção: RLS + nenhum privilégio de anon/authenticated em todas as nx_%, nenhuma nx_* para authenticated, search_path fixo", () => {
  assert.match(S09, /has_table_privilege\('anon', 'public\.' \|\| r\.relname, 'select, insert, update, delete'\)/);
  assert.match(S09, /has_table_privilege\('authenticated', 'public\.' \|\| r\.relname, 'select, insert, update, delete'\)/);
  assert.match(S09, /has_any_column_privilege\('anon'/);
  assert.match(S09, /not has_function_privilege\('authenticated', r\.oid, 'execute'\)/);
  assert.match(S09, /not r\.prosecdef or r\.cfg like '%search_path=%'/);
  assert.match(S09, /relrowsecurity/);
  // o que já existia continua
  assert.match(S09, /pg_catalog\.pg_proc/i); assert.match(S09, /F8_B_PRIVATE/); assert.match(S09, /raise exception 'OK 09_isolamento/);
});

test("rodar-tudo.mjs conhece o plano100-banco e o runner local do PGlite existe", () => {
  assert.ok(COMANDOS.some(c => c.args.at(-1) === "testes/plano100-banco.teste.mjs"));
  assert.ok(existsSync(join(RAIZ, "supabase/testes/rodar-local.mjs")) && existsSync(join(RAIZ, "scripts/rodar-local.mjs")));
});

// ------------------------------------------------------------ opcional: PGlite de verdade (ORBITA_PGLITE=1)
test("PGlite: as migrações aplicam e os smokes 20 e 21 passam (ORBITA_PGLITE=1)", { skip: !process.env.ORBITA_PGLITE && "ORBITA_PGLITE=1 (e @electric-sql/pglite instalado) para rodar os smokes num Postgres local" }, async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { uuid_ossp } = await import("@electric-sql/pglite/contrib/uuid_ossp");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { unaccent } = await import("@electric-sql/pglite/contrib/unaccent");
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm, unaccent } });
  // os mesmos dublês de supabase/testes/rodar-local.mjs (roles, extensions, cron, net, vault, storage)
  await db.exec(`
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if;
end $$;
create schema if not exists extensions; create schema if not exists vault; create schema if not exists net; create schema if not exists cron; create schema if not exists storage;
create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions; create extension if not exists unaccent with schema extensions;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create table cron.job_run_details (jobid bigint, runid bigserial primary key, status text, end_time timestamptz);
create function cron.schedule(p_nome text, p_agenda text, p_cmd text) returns bigint language plpgsql as $f$ declare v bigint; begin
  insert into cron.job(jobname, schedule, command) values (p_nome, p_agenda, p_cmd) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into v; return v; end $f$;
create function cron.unschedule(p_nome text) returns boolean language plpgsql as $f$ begin delete from cron.job where jobname = p_nome; return true; end $f$;
create function cron.unschedule(p_id bigint) returns boolean language plpgsql as $f$ begin delete from cron.job where jobid = p_id; return true; end $f$;
create table net.http_chamadas (id bigserial primary key, url text, corpo jsonb, headers jsonb, criado_em timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language plpgsql as $f$ declare v bigint; begin insert into net.http_chamadas(url, corpo, headers) values (url, body, headers) returning id into v; return v; end $f$;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language plpgsql as $f$ declare v uuid; begin insert into vault.secrets(name, description, secret) values (new_name, new_description, new_secret) returning id into v; return v; end $f$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void language plpgsql as $f$ begin update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name), updated_at = now() where id = secret_id; end $f$;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  for (const arq of migracoes) {
    if (arq.startsWith("20261003a")) continue;   // patch por âncora de texto: só casa no banco real
    const sql = readFileSync(join(MIG, arq), "utf8").replace(/create extension if not exists (pg_net|pg_cron|supabase_vault)[^;]*;/gi, "-- (extensão de mentira)");
    await db.exec(sql);
  }
  for (const [arq, ok] of [["20_operacao_seguranca.sql", "OK_20_OPERACAO_SEGURANCA"], ["21_dados_telas.sql", "OK_21_DADOS_TELAS"], ["09_isolamento.sql", "OK 09_isolamento"]]) {
    let msg = "";
    try { await db.exec(ler(`supabase/testes/${arq}`)); } catch (e) { msg = String(e.message); }
    try { await db.exec("rollback"); } catch { /* sem transação aberta */ }
    assert.ok(msg.startsWith(ok), `${arq}: ${msg.slice(0, 300)}`);
  }
});

test("migrações de 09/10 (revisão + integração): aditivas, registram a versão, e os smokes 22–25 terminam em OK", () => {
  const dir = join(RAIZ, "supabase");
  for (const [mig, smoke, ok] of [["20261009a_origem_frase_botao", "22_origem_frase_botao", "OK_22_ORIGEM_FRASE_BOTAO"],
                                  ["20261009b_pulso_canais_origem", "23_pulso_canais_origem", "OK_23_PULSO_CANAIS_ORIGEM"],
                                  ["20261009c_admin_ativo_canais", "24_admin_ativo_canais", "OK_24_ADMIN_ATIVO_CANAIS"],
                                  ["20261009d_origem_frase_sem_negocio", "25_origem_frase_sem_negocio", "OK_25_ORIGEM_FRASE_SEM_NEGOCIO"]]) {
    const m = readFileSync(join(dir, "migrations", mig + ".sql"), "utf8"), s = readFileSync(join(dir, "testes", smoke + ".sql"), "utf8");
    assert.ok(!/\bdrop\s+(table|function|column)\b|\bdelete\s+from\b|\btruncate\b/i.test(m.replace(/--[^\n]*/g, "")), mig + ": nada destrutivo");
    assert.ok(m.includes(`insert into public.nx_versao_banco (nome) values ('${mig}')`), mig + ": registra a versão");
    assert.match(s, /^begin;/m); assert.match(s, /^rollback;/m); assert.ok(s.includes(`raise exception '${ok}`), ok);
    assert.ok(!/sk-ant-|cwk-[A-Za-z0-9]{8,}/.test(m + s), "sem segredo");
  }
  assert.ok(ultimaDef("nx_origem_frase").corpo.includes("ja_tem_anuncio"), "a frase do botão nunca sobrescreve anúncio");
  assert.match(ultimaDef("nx_cliente_admin_salvar").corpo, /if j \? 'ativo' then\s+if not v_super then raise exception 'so_plataforma'/);
  assert.match(ultimaDef("nx_cliente_admin_item").corpo, /'canais'/);
  assert.match(ultimaDef("nx_cv_json_item").corpo, /'origem', k\.origem/);
});
