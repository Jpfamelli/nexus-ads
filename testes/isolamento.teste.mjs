import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raiz = new URL("../", import.meta.url);
const sql = await readFile(new URL("supabase/testes/09_isolamento.sql", raiz), "utf8");

test("09_isolamento prepara todas as entidades B exigidas pela §8.4", () => {
  const entidades = [
    "nx_orgs", "nx_clientes", "nx_contas", "nx_acessos", "nx_sessoes",
    "nx_empresas", "nx_contatos", "nx_leads", "nx_conversas", "nx_mensagens",
    "nx_estagios", "nx_funis", "nx_etiquetas", "nx_tarefas", "nx_notas",
    "nx_canais", "nx_departamentos", "nx_respostas", "nx_automacoes", "nx_campos",
    "nx_motivos_perda", "nx_templates", "nx_convites", "nx_visoes",
  ];
  for (const tabela of entidades) {
    assert.match(sql, new RegExp(`insert\\s+into\\s+public\\.${tabela}\\b`, "i"), `${tabela}: fixture B ausente`);
  }
});

test("09_isolamento deriva RPCs com IDs do catálogo e verifica alterações/vazamento de B", () => {
  assert.match(sql, /pg_catalog\.pg_proc/i, "inventário de RPCs precisa vir de pg_proc");
  assert.match(sql, /has_function_privilege\s*\(\s*'anon'/i, "filtra funções concedidas ao painel");
  assert.match(sql, /proargnames/i, "seleciona sondas pelo nome dos parâmetros");
  assert.match(sql, /execute\s+format/i, "invoca as sondas do catálogo dinamicamente");
  assert.match(sql, /v_sqlstate\s*=\s*returned_sqlstate/i, "captura SQLSTATE das sondas");
  assert.match(sql, /v_sqlstate\s+like\s+'42%'/i, "falhas estruturais de SQL não podem passar como negação segura");
  assert.match(sql, /md5\s*\([^)]*row_to_json/is, "compara hash das linhas de B antes e depois");
  assert.match(sql, /sem_acesso/i, "verifica o token A contra o tenant B");
  assert.match(sql, /F8_B_PRIVATE/i, "detecta se uma resposta revela dados privados de B");
});

test("09_isolamento só permite o retorno idempotente fixo de nx_sair sem sessão", () => {
  assert.match(
    sql,
    /r\.proname\s*=\s*'nx_sair'\s+and\s+v_result\s*=\s*'\[\{\"ok\":true\}\]'\s*::jsonb/i,
    "logout sem sessão só pode devolver [{\"ok\":true}]",
  );
});
