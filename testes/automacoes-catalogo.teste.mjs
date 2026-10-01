/* ÓRBITA — catálogo compartilhado das automações (painel ⇄ servidor).
   Rodar: node --test testes/automacoes-catalogo.teste.mjs
   O catálogo (web/app/auto-catalogo.js) é a fonte única de gatilhos, ações, campos e limites:
   o painel desenha o editor a partir dele, a nx-ia (automacao_montar) valida contra ele e o banco
   (nx_auto_normalizar, na ÚLTIMA migração que o redefine) tem de aceitar exatamente o mesmo conjunto. Aqui:
   1. a cópia que vai para supabase/dist/<função> é BYTE A BYTE a do painel (hash);
   2. a ponte do layout de desenvolvimento enxerga o mesmo módulo;
   3. todo gatilho e toda ação tem rótulo e campos válidos;
   4. o SQL do banco conhece os mesmos gatilhos, ações, campos e limites. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGO = join(RAIZ, "web", "app", "auto-catalogo.js");
const DIST = join(RAIZ, "supabase", "dist");
const FUNCOES = ["nx-ciclo", "nx-relatorio", "nx-whatsapp", "nx-enviar", "nx-midia", "nx-ia", "nx-codewords"];
const sha = b => createHash("sha256").update(b).digest("hex");

const CAT = await import("../web/app/auto-catalogo.js");
const PONTE = await import("../supabase/functions/_compartilhado/auto-catalogo.js");
const SQL = readFileSync(join(RAIZ, "supabase", "migrations", "20261001a_automacoes_ia.sql"), "utf8");   // constraint, permissões e tarefas da IA
const L = await import("../web/app/auto-logica.js");

/* O que vale no banco é a ÚLTIMA definição de cada função: uma migração nova que a redefina passa a ser a conferida aqui
   (ler um arquivo fixo deixava o teste verde olhando para uma versão que o banco já não usa). */
const MIGRACOES = join(RAIZ, "supabase", "migrations");
function corpoFuncao(nome) {
  const marca = `create or replace function public.${nome}(`;
  for (const arquivo of readdirSync(MIGRACOES).filter(a => a.endsWith(".sql")).sort().reverse()) {
    const sql = readFileSync(join(MIGRACOES, arquivo), "utf8");
    const i = sql.lastIndexOf(marca);
    if (i < 0) continue;
    const fim = sql.indexOf("\nend $$;", i);
    assert.ok(fim > i, `${arquivo}: não achei o fim de ${nome}`);
    return { arquivo, sql: sql.slice(i, fim) };
  }
  assert.fail(`nenhuma migração define ${nome}`);
}
const NORMALIZAR = corpoFuncao("nx_auto_normalizar");
const PASSOS = corpoFuncao("nx_auto_passos");

test("montar-funcoes: o catálogo de cada função é a cópia byte a byte do painel", () => {
  const r = spawnSync(process.execPath, [join(RAIZ, "scripts", "montar-funcoes.mjs")], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const original = readFileSync(CATALOGO);
  for (const fn of FUNCOES) {
    const copia = join(DIST, fn, "auto-catalogo.js");
    assert.ok(existsSync(copia), `${fn}: falta auto-catalogo.js`);
    assert.equal(sha(readFileSync(copia)), sha(original), `${fn}: auto-catalogo.js difere do web/app/auto-catalogo.js`);
    // a ponte do layout de desenvolvimento nunca vai no lugar do original
    assert.ok(!/export \* from/.test(readFileSync(copia, "utf8")), `${fn}: a ponte foi copiada no lugar do catálogo`);
  }
});

test("catálogo: não tem imports, DOM nem Deno (roda no navegador, no Node e na Edge Function)", () => {
  const txt = readFileSync(CATALOGO, "utf8");
  assert.ok(!/^\s*import\s/m.test(txt) && !/\bimport\s*\(/.test(txt), "sem import");
  assert.ok(!/\bdocument\b|\bwindow\b|\blocalStorage\b|\bDeno\b|\bprocess\b/.test(txt), "sem DOM/Deno/process");
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(txt), "sem cor");
});

test("ponte do layout de desenvolvimento: é o mesmo módulo do painel", () => {
  assert.ok(PONTE.GATILHOS === CAT.GATILHOS && PONTE.ACOES === CAT.ACOES && PONTE.LIMITES === CAT.LIMITES, "mesma instância");
  assert.deepEqual(Object.keys(PONTE).sort(), Object.keys(CAT).sort());
  const dist = readdirSync(join(DIST, "nx-ia"));
  assert.ok(dist.includes("auto-catalogo.js"), "nx-ia leva o catálogo");
});

/* ------------------------------------------------------------------ rótulos e campos */
const VV = {
  v: { negocio: "Oportunidade", contato: "Paciente", ganhar: "Fechou", perder: "Não fechou", vertical: "odonto" },
  vertical: "odonto",
  min: k => String(VV.v[k] || k).toLowerCase(),
  art: () => "a", um: () => "uma", conc: (k, m, f) => f,
};
const TIPOS_GATILHO = new Set(["canal", "departamento", "funil", "estagio", "etiqueta", "numero", "palavras", "sim_nao", "campo_data", "hora", "dias_semana"]);
const TIPOS_ACAO = new Set(["texto", "texto_longo", "numero", "opcoes", "estagio", "funil", "etiqueta", "pessoa", "dono", "para", "template", "parametros",
  "departamento", "sim_nao", "alvo_etiqueta", "modo_atribuir", "duracao", "tarefa_ia", "campo_contato"]);

function conferirItem(item, tipos, rotuloItem) {
  assert.match(item.id, /^[a-z][a-z_]*$/, `${rotuloItem}: id`);
  const r = item.rotulo(VV);
  assert.equal(typeof r, "string", `${rotuloItem}: rótulo é texto`);
  assert.ok(r.trim().length >= 3 && !/undefined|\[object/.test(r), `${rotuloItem}: rótulo legível (${r})`);
  if (item.dica) { const d = item.dica(VV); assert.ok(typeof d === "string" && d.length > 3 && !/undefined/.test(d), `${rotuloItem}: dica`); }
  assert.ok(typeof item.descricao === "string" && item.descricao.length > 5, `${rotuloItem}: descrição`);
  assert.ok(Array.isArray(item.campos), `${rotuloItem}: campos é lista`);
  const nomes = new Set();
  for (const c of item.campos) {
    assert.match(c.nome, /^[a-z][a-z0-9_]*$/, `${rotuloItem}.${c.nome}: nome em snake_case`);
    assert.ok(!nomes.has(c.nome), `${rotuloItem}.${c.nome}: nome repetido`);
    nomes.add(c.nome);
    assert.ok(tipos.has(c.tipo), `${rotuloItem}.${c.nome}: tipo «${c.tipo}» desconhecido (a validação do servidor precisa conhecê-lo)`);
    assert.ok(typeof c.rotulo === "string" && c.rotulo.length > 1, `${rotuloItem}.${c.nome}: rótulo do campo`);
    assert.ok(!(c.obrigatorio && c.opcional), `${rotuloItem}.${c.nome}: obrigatório e opcional ao mesmo tempo`);
    if (c.min != null || c.max != null) assert.ok(Number.isFinite(c.min ?? 0) && Number.isFinite(c.max ?? 0) && (c.min ?? 0) <= (c.max ?? Infinity), `${rotuloItem}.${c.nome}: faixa`);
    if (c.tipo === "opcoes") assert.ok(Array.isArray(c.opcoes) && c.opcoes.length > 1 && c.opcoes.every(o => Array.isArray(o) && o.length === 2), `${rotuloItem}.${c.nome}: opções [id, rótulo]`);
    if (c.tipo === "numero" || c.tipo === "duracao") assert.ok(Number.isFinite(c.min) && Number.isFinite(c.max), `${rotuloItem}.${c.nome}: número com min e max`);
    if (c.padrao !== undefined && (c.tipo === "numero" || c.tipo === "duracao")) assert.ok(c.padrao >= c.min && c.padrao <= c.max, `${rotuloItem}.${c.nome}: padrão dentro da faixa`);
    if (c.quando) for (const k of Object.keys(c.quando)) assert.ok(item.campos.some(x => x.nome === k), `${rotuloItem}.${c.nome}: «quando» aponta para o campo ${k}`);
    if (c.filtraPor) assert.ok(item.campos.some(x => x.nome === c.filtraPor), `${rotuloItem}.${c.nome}: filtraPor aponta para um campo do mesmo item`);
  }
}

test("catálogo: todo gatilho tem rótulo, descrição e campos válidos (ids únicos)", () => {
  const ids = CAT.GATILHOS.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length, "ids de gatilho repetidos");
  for (const g of CAT.GATILHOS) {
    conferirItem(g, TIPOS_GATILHO, `gatilho ${g.id}`);
    assert.equal(CAT.GATILHO[g.id], g, `GATILHO[${g.id}]`);
    assert.ok(typeof g.grupo === "string" && g.grupo, `gatilho ${g.id}: grupo`);
  }
  for (const novo of ["agendado", "apos_data", "conversa_resolvida"]) assert.ok(CAT.GATILHO[novo], `gatilho ${novo} do contrato`);
});

test("catálogo: toda ação tem rótulo, descrição e campos válidos (ids únicos)", () => {
  const ids = CAT.ACOES.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, "ids de ação repetidos");
  for (const a of CAT.ACOES) {
    conferirItem(a, TIPOS_ACAO, `ação ${a.id}`);
    assert.equal(CAT.ACAO[a.id], a, `ACAO[${a.id}]`);
    assert.ok(CAT.GRUPOS_ACAO.includes(a.grupo), `ação ${a.id}: grupo «${a.grupo}» fora de GRUPOS_ACAO`);
  }
  for (const nova of ["mover_funil", "atribuir", "etiqueta_adicionar", "etiqueta_remover", "campo_atualizar", "nota", "notificar", "esperar", "parar", "ia_decidir"])
    assert.ok(CAT.ACAO[nova], `ação ${nova} do contrato`);
});

test("catálogo: contrato das ações novas (nomes e campos exatos do PLANO)", () => {
  const nomes = id => (CAT.ACAO[id] || CAT.GATILHO[id]).campos.map(c => c.nome);
  assert.deepEqual(nomes("agendado"), ["horario", "dias_semana", "funil_id", "estagio_id"]);
  assert.deepEqual(nomes("apos_data"), ["campo", "horas", "funil_id"]);
  assert.deepEqual(nomes("conversa_resolvida"), ["canal_id", "departamento_id"]);
  assert.deepEqual(nomes("mover_funil"), ["funil_id", "estagio_id"]);
  assert.deepEqual(nomes("atribuir"), ["dono", "conta_id", "departamento_id"]);
  assert.deepEqual(nomes("etiqueta_adicionar"), ["etiqueta_id"]);
  assert.deepEqual(nomes("etiqueta_remover"), ["etiqueta_id"]);
  assert.deepEqual(nomes("campo_atualizar"), ["campo", "valor"]);
  assert.deepEqual(nomes("nota"), ["texto"]);
  assert.deepEqual(nomes("notificar"), ["para", "departamento_id", "titulo", "texto"]);
  assert.deepEqual(nomes("esperar"), ["minutos", "cancelar_se_cliente_responder"]);
  assert.deepEqual(nomes("parar"), []);
  assert.deepEqual(nomes("ia_decidir"), ["tarefa", "instrucao"]);
  assert.deepEqual(CAT.TAREFAS_IA.map(t => t[0]), ["classificar_etapa", "resumir_nota", "pontuar_lead"]);
  assert.deepEqual(CAT.DIAS_SEMANA.map(d => d[0]), [0, 1, 2, 3, 4, 5, 6]);
});

/* ------------------------------------------------------------------ o banco conhece o mesmo conjunto */
const listaSql = (txt, inicio) => {
  const i = txt.indexOf(inicio);
  assert.ok(i >= 0, `trecho não achado no SQL: ${inicio}`);
  const abre = txt.indexOf("(", i + inicio.length - 1);
  let nivel = 0, fim = abre;
  for (let k = abre; k < txt.length; k++) { if (txt[k] === "(") nivel++; if (txt[k] === ")") { nivel--; if (!nivel) { fim = k; break; } } }
  return [...txt.slice(abre, fim).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
};
const mesmos = (a, b, msg) => assert.deepEqual([...new Set(a)].sort(), [...new Set(b)].sort(), msg);

test("SQL: a constraint e o nx_auto_normalizar aceitam exatamente os gatilhos do catálogo", () => {
  const catalogo = CAT.GATILHOS.map(g => g.id);
  mesmos(listaSql(SQL, "check (gatilho in ("), catalogo, "constraint nx_automacoes_gatilho_check2");
  mesmos(listaSql(NORMALIZAR.sql, "v_gat not in ("), catalogo, `gatilhos do nx_auto_normalizar (${NORMALIZAR.arquivo})`);
  assert.ok(SQL.includes("p.proname in (") && SQL.includes("'nx_auto_simular'"), "permissões declaradas");
});

test("SQL: o nx_auto_normalizar aceita exatamente as ações do catálogo", () => {
  const catalogo = CAT.ACOES.map(a => a.id);
  mesmos(listaSql(NORMALIZAR.sql, "(x ->> 'tipo', '') not in ("), catalogo, `ações do nx_auto_normalizar (${NORMALIZAR.arquivo})`);
  // o executor tem um ramo para cada uma (nx_auto_passos)
  const passos = PASSOS.sql;
  for (const id of catalogo) assert.ok(new RegExp(`when [^\\n]*'${id}'`).test(passos), `nx_auto_passos sem ramo para «${id}»`);
});

test("SQL: todo campo do catálogo é lido pelo normalizador (nome exato)", () => {
  const norm = NORMALIZAR.sql;
  for (const item of [...CAT.GATILHOS, ...CAT.ACOES]) {
    for (const c of item.campos) {
      assert.ok(norm.includes(`'${c.nome}'`) || norm.includes(`->> '${c.nome}'`), `${item.id}.${c.nome}: o nx_auto_normalizar não lê esse campo`);
    }
  }
});

test("SQL: os limites do catálogo são os do banco", () => {
  const norm = NORMALIZAR.sql;
  const passos = PASSOS.sql;
  for (const k of ["sem_resposta", "tempo_no_estagio", "antes_da_data", "apos_data", "prazo_tarefa", "esperar"]) {
    const [min, max] = CAT.LIMITES[k];
    assert.ok(new RegExp(`between ${min} and ${max}\\b`).test(norm), `faixa ${k}: ${min}..${max} não está no normalizador`);
  }
  for (const k of ["nome", "condicoes", "acoes", "palavras", "palavra", "titulo_tarefa", "titulo_negocio", "mensagem", "titulo_aviso", "texto_aviso",
                   "alerta", "nota", "instrucao_ia", "valor_campo", "esperas", "parametros"]) {
    const n = CAT.LIMITES[k];
    assert.ok(new RegExp(`> ${n}\\b`).test(norm), `limite ${k} = ${n} não está no normalizador`);
  }
  assert.ok(passos.includes("43200") && passos.includes("1000") && passos.includes("500"), "o executor repete os tetos principais");
  // campos com max no catálogo: o mesmo número aparece no SQL
  for (const item of [...CAT.GATILHOS, ...CAT.ACOES]) for (const c of item.campos) {
    if (c.tipo === "texto" || c.tipo === "texto_longo") if (c.max) assert.ok(norm.includes(String(c.max)), `${item.id}.${c.nome}: max ${c.max} ausente no SQL`);
  }
});

test("SQL: a ordem do 'atribuir' (dono/modo) e as tarefas da IA batem com o catálogo", () => {
  assert.ok(/'rodizio', 'conta', 'departamento'/.test(NORMALIZAR.sql), "dono: rodizio | conta | departamento");
  assert.deepEqual(CAT.ACAO.atribuir.campos.find(c => c.nome === "dono").legado, "modo", "o catálogo avisa que «modo» é o nome antigo");
  for (const t of CAT.TAREFAS_IA.map(x => x[0])) assert.ok(SQL.includes(`'${t}'`), `tarefa da IA ${t} no SQL`);
});

test("SQL: o teste lê a última migração que redefine o normalizador e o executor (não um arquivo fixo)", () => {
  const ultima = nome => readdirSync(MIGRACOES).filter(a => a.endsWith(".sql")).sort()
    .filter(a => readFileSync(join(MIGRACOES, a), "utf8").includes(`create or replace function public.${nome}(`)).pop();
  assert.equal(NORMALIZAR.arquivo, ultima("nx_auto_normalizar"));
  assert.equal(PASSOS.arquivo, ultima("nx_auto_passos"));
  assert.ok(NORMALIZAR.arquivo >= "20261001b_correcoes.sql", `o normalizador em vigor é o de 20261001b ou de uma migração mais nova (lido: ${NORMALIZAR.arquivo})`);
  assert.ok(NORMALIZAR.sql.startsWith("create or replace function public.nx_auto_normalizar("));
  assert.ok(!NORMALIZAR.sql.includes("create or replace function public.nx_auto_passos("), "o corpo lido é só o do normalizador");
});

test("SQL × editor: etiqueta só pelo nome vale em «etiquetar»; «Pôr etiqueta» e «Tirar etiqueta» exigem a etiqueta escolhida, dos dois lados", () => {
  const norm = NORMALIZAR.sql;
  const ramo = (de, ate) => { const i = norm.indexOf(de); assert.ok(i >= 0, `ramo ${de}`); const j = norm.indexOf(ate, i + de.length); return norm.slice(i, j < 0 ? undefined : j); };
  const etiquetar = ramo("when 'etiquetar' then", "when 'etiqueta_adicionar', 'etiqueta_remover' then");
  const adicionar = ramo("when 'etiqueta_adicionar', 'etiqueta_remover' then", "when 'campo_atualizar' then");
  assert.ok(etiquetar.includes("etiqueta_nome"), "o banco cria a etiqueta pelo nome no «etiquetar»");
  assert.ok(!adicionar.includes("etiqueta_nome"), "o banco NÃO aceita etiqueta_nome em etiqueta_adicionar/etiqueta_remover");
  assert.ok(adicionar.includes("x ->> 'etiqueta_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha a etiqueta')"), "sem etiqueta_id o banco responde «escolha a etiqueta»");
  // o editor recusa o mesmo caso (antes dizia «Pronta» e o servidor devolvia «escolha a etiqueta»)
  const auto = ac => ({ nome: "T", gatilho: "tarefa_vencida", config: {}, condicoes: [], acoes: [ac] });
  assert.equal(L.validar(auto({ tipo: "etiqueta_adicionar", etiqueta_nome: "Orçamento" })).motivo, "ação 1: escolha a etiqueta");
  assert.equal(L.validar(auto({ tipo: "etiqueta_remover", etiqueta_nome: "Orçamento" })).motivo, "ação 1: escolha a etiqueta");
  assert.equal(L.validar(auto({ tipo: "etiquetar", etiqueta_nome: "Orçamento", alvo: "contato" })).ok, true);
  assert.equal(L.limpar(auto({ tipo: "etiqueta_adicionar", etiqueta_nome: "Orçamento" })).acoes[0].etiqueta_nome, undefined, "o nome não vai para o servidor");
  assert.equal(L.limpar(auto({ tipo: "etiquetar", etiqueta_nome: "Orçamento", alvo: "contato" })).acoes[0].etiqueta_nome, "Orçamento");
});
