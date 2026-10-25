#!/usr/bin/env node
/* ÓRBITA — scripts/lint-migracoes.mjs (plano «1000+ melhorias», SV-169 e SV-182)
   A regra «migração só ADITIVA e IDEMPOTENTE» conferida por máquina, não a olho. Vale para as migrações a partir de
   PRIMEIRA_CONFERIDA (as anteriores já estão aplicadas no banco real e não mudam mais).

   Uso:  node scripts/lint-migracoes.mjs              confere supabase/migrations/<arquivos >= 20261013c>
         node scripts/lint-migracoes.mjs a.sql b.sql  confere só esses arquivos (qualquer nome)
   Saída: 0 limpo · 1 alguma violação (arquivo:linha · regra · trecho).

   Recusa (fora de corpo de função; dentro de bloco DO conta, porque roda na hora da migração):
     drop          drop table/column/function/index/view/schema
     apagar        delete from / truncate
     tipo_coluna   alter column … type
   Exige:
     if_not_exists create table/index e add column com «if not exists»
     or_replace    create function/view com «or replace»
     versao        insert into public.nx_versao_banco com o nome do arquivo (sem .sql)
     notify        o último comando é notify pgrst, 'reload schema'
     permissoes    quem cria função tem bloco de permissões: revoke … from public/anon/authenticated ou nx_revogar_authenticated()
   Por função (plano 1500c · SC-039/040/041): search_path em toda security definer, nenhum grant a authenticated e toda
   função NOVA citada num revoke/grant do próprio arquivo (ver lintPorFuncao).
   Exceção: comentário «-- lint:permitido <motivo>» na mesma linha ou na linha de cima (regras de linha); para as regras do
   arquivo inteiro (versao, notify, permissoes), «-- lint:permitido <regra>: <motivo>» em qualquer linha. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRACOES = resolve(RAIZ, "supabase/migrations");
/** A partir desta (inclusive) o lint vale; as anteriores já foram aplicadas no banco real. */
export const PRIMEIRA_CONFERIDA = "20261013c";

/** Troca por espaços (mantendo as quebras de linha, para o número da linha continuar certo) os comentários, as strings e os
    corpos $tag$…$tag$ de FUNÇÃO. Corpo de bloco DO fica (mascarado por dentro), porque roda na hora da migração. */
export function mascarar(sql) {
  const s = String(sql).replace(/\r\n?/g, "\n");
  const branco = t => t.replace(/[^\n]/g, " ");
  let out = "", i = 0, inicioComando = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "-" && d === "-") { const f = s.indexOf("\n", i); const fim = f < 0 ? s.length : f; out += branco(s.slice(i, fim)); i = fim; continue; }
    if (c === "/" && d === "*") { const f = s.indexOf("*/", i + 2); const fim = f < 0 ? s.length : f + 2; out += branco(s.slice(i, fim)); i = fim; continue; }
    if (c === "'") {
      let j = i + 1;
      while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; } if (s[j] === "'") break; j++; }
      out += "'" + branco(s.slice(i + 1, j)) + (j < s.length ? "'" : ""); i = j + 1; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m) {
        const tag = m[0], f = s.indexOf(tag, i + tag.length);
        const fim = f < 0 ? s.length : f;
        const corpo = s.slice(i + tag.length, fim);
        const comando = out.slice(inicioComando);
        const ehDo = /(^|;)\s*do\s*$/i.test(comando.replace(/\s+$/, "")) || /^\s*do\s*$/i.test(comando);
        out += tag + (ehDo ? mascarar(corpo) : branco(corpo)) + (f < 0 ? "" : tag);
        i = f < 0 ? s.length : f + tag.length; continue;
      }
    }
    if (c === ";") inicioComando = out.length + 1;
    out += c; i++;
  }
  return out;
}

/** Sem comentários (strings ficam): para achar o bloco de permissões, que às vezes vem em execute format('revoke …'). */
export const semComentarios = sql => String(sql).replace(/\r\n?/g, "\n").replace(/--[^\n]*/g, "");

const REGRAS_LINHA = [
  { regra: "drop", re: /\bdrop\s+(table|column|function|index|view|materialized\s+view|schema)\b/gi, msg: "drop recusado (migração só aditiva)" },
  { regra: "apagar", re: /\b(delete\s+from|truncate)\b/gi, msg: "delete/truncate fora de corpo de função" },
  { regra: "tipo_coluna", re: /\balter\s+column\s+("?[\w]+"?)\s+(set\s+data\s+)?type\b/gi, msg: "alter column … type recusado" },
  { regra: "if_not_exists", re: /\bcreate\s+(?:unlogged\s+)?table\s+(?!if\s+not\s+exists\b)/gi, msg: "create table sem if not exists" },
  { regra: "if_not_exists", re: /\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?!if\s+not\s+exists\b)/gi, msg: "create index sem if not exists" },
  { regra: "if_not_exists", re: /\badd\s+column\s+(?!if\s+not\s+exists\b)/gi, msg: "add column sem if not exists" },
  { regra: "or_replace", re: /\bcreate\s+(?:function|view)\b/gi, msg: "create function/view sem or replace" },
];

const linhaDe = (texto, pos) => texto.slice(0, pos).split("\n").length;
const PERMITIDO = /--\s*lint:permitido\s+\S/i;
const permitidoArquivo = (linhas, regra) => linhas.some(l => new RegExp(`--\\s*lint:permitido\\s+${regra}\\s*:\\s*\\S`, "i").test(l));

/** Confere uma migração. Devolve [{regra, linha, msg, trecho}] (vazio = limpa). `nome` é o nome do arquivo (com ou sem .sql). */
export function lintMigracao(nome, sql, anteriores = null) {
  const original = String(sql).replace(/\r\n?/g, "\n");
  const linhas = original.split("\n");
  const m = mascarar(original);
  const viol = [];
  for (const { regra, re, msg } of REGRAS_LINHA) {
    for (const x of m.matchAll(re)) {
      const linha = linhaDe(m, x.index);
      if (PERMITIDO.test(linhas[linha - 1] || "") || PERMITIDO.test(linhas[linha - 2] || "")) continue;
      viol.push({ regra, linha, msg, trecho: (linhas[linha - 1] || "").trim().slice(0, 160) });
    }
  }
  const stem = basename(String(nome)).replace(/\.sql$/i, "");
  const limpo = semComentarios(original);
  const versao = new RegExp(`insert\\s+into\\s+(public\\.)?nx_versao_banco\\s*\\([^)]*\\)\\s*values\\s*\\(\\s*'${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "i");
  if (!versao.test(limpo) && !permitidoArquivo(linhas, "versao"))
    viol.push({ regra: "versao", linha: 0, msg: `falta insert into public.nx_versao_banco (nome) values ('${stem}')`, trecho: "" });
  const comandos = m.split(";").map(c => c.trim()).filter(Boolean);
  if (!/^notify\s+pgrst\b/i.test(comandos.at(-1) || "") && !permitidoArquivo(linhas, "notify"))
    viol.push({ regra: "notify", linha: 0, msg: "o último comando tem de ser notify pgrst, 'reload schema'", trecho: (comandos.at(-1) || "").slice(0, 80) });
  const criaFuncao = /\bcreate\s+(or\s+replace\s+)?function\s+public\./i.test(m);
  const temPermissoes = /\brevoke\b[\s\S]*?\bfrom\b[^;]*\b(public|anon|authenticated)\b/i.test(limpo) || /\bnx_revogar_authenticated\s*\(/i.test(limpo);
  if (criaFuncao && !temPermissoes && !permitidoArquivo(linhas, "permissoes"))
    viol.push({ regra: "permissoes", linha: 0, msg: "cria função mas não tem bloco de permissões (revoke … from public, anon, authenticated / nx_revogar_authenticated())", trecho: "" });
  viol.push(...lintPorFuncao(original, m, linhas, anteriores));
  return viol.sort((a, b) => a.linha - b.linha);
}

/** plano 1500c · SC-039 / SC-040 / SC-041: regras por FUNÇÃO (não só por arquivo).
     search_path      toda função security definer declara «set search_path» (sem ele, um objeto com o mesmo nome em outro schema
                      do caminho é chamado com os direitos do dono)
     grant_authenticated  nenhum grant … to authenticated (o painel usa anon + p_token; authenticated não tem sessão nossa)
     permissao_funcao função NOVA (nome que nenhuma migração anterior define) aparece num revoke/grant do arquivo — o bloco
                      genérico do arquivo não basta: função interna esquecida fica executável por anon (o default do Postgres é
                      execute para public). Só confere com `anteriores` (Set de nomes já definidos); sem ele, pula. */
function lintPorFuncao(original, m, linhas, anteriores) {
  const viol = [];
  const permitido = linha => PERMITIDO.test(linhas[linha - 1] || "") || PERMITIDO.test(linhas[linha - 2] || "");
  // corpos de função (posições iguais no original e no mascarado: mascarar só troca caracteres por espaços)
  const corpos = [], defs = [];
  for (const x of m.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const d = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(m.slice(x.index));
    if (!d) continue;
    const iniCorpo = x.index + d.index + d[0].length;
    const fimCorpo = m.indexOf(d[0], iniCorpo);
    corpos.push([iniCorpo, fimCorpo < 0 ? m.length : fimCorpo]);
    const linha = linhaDe(m, x.index);
    defs.push({ nome: x[1].toLowerCase(), linha, cabecalho: m.slice(x.index, x.index + d.index) });
  }
  for (const f of defs) {
    if (/\bsecurity\s+definer\b/i.test(f.cabecalho) && !/\bset\s+search_path\b/i.test(f.cabecalho) && !permitido(f.linha))
      viol.push({ regra: "search_path", linha: f.linha, msg: `${f.nome}: security definer sem set search_path = ''`, trecho: (linhas[f.linha - 1] || "").trim().slice(0, 160) });
  }
  // fora dos corpos de função e sem comentários (as strings ficam: os blocos de permissão usam execute format('grant …'))
  let fora = "";
  let p = 0;
  for (const [a, b] of corpos) { fora += original.slice(p, a) + original.slice(a, b).replace(/[^\n]/g, " "); p = b; }
  fora += original.slice(p);
  fora = fora.replace(/--[^\n]*/g, t => " ".repeat(t.length));
  for (const x of fora.matchAll(/\bgrant\b[^;]*?\bto\b[^;]*?\bauthenticated\b/gi)) {
    const linha = linhaDe(fora, x.index);
    if (!permitido(linha)) viol.push({ regra: "grant_authenticated", linha, msg: "grant para authenticated recusado (anon + service_role)", trecho: (linhas[linha - 1] || "").trim().slice(0, 160) });
  }
  if (anteriores && /\b(revoke|grant)\b/i.test(fora)) {
    const vistos = new Set();
    for (const f of defs) {
      if (anteriores.has(f.nome) || vistos.has(f.nome)) continue;
      vistos.add(f.nome);
      const citada = [...fora.matchAll(new RegExp(`public\\.${f.nome}\\s*\\(`, "gi"))].some(x => linhaDe(fora, x.index) !== f.linha);
      if (!citada && !permitido(f.linha))
        viol.push({ regra: "permissao_funcao", linha: f.linha, msg: `${f.nome}: função nova sem revoke/grant próprio (fica executável por anon)`, trecho: "" });
    }
  }
  return viol;
}

/** Nomes de função public.* definidos nos arquivos de migração ANTERIORES a `arquivo` (para a regra permissao_funcao). */
export function funcoesAnteriores(arquivo, dir = MIGRACOES) {
  const nomes = new Set();
  for (const f of readdirSync(dir).filter(x => x.endsWith(".sql") && x < basename(arquivo)).sort())
    for (const d of definicoesFuncoes(readFileSync(join(dir, f), "utf8"))) nomes.add(d.nome);
  return nomes;
}

/** Divide a lista de parâmetros nas vírgulas de nível zero (fora de parênteses e de strings). */
function dividirParams(txt) {
  const partes = []; let prof = 0, atual = "", aspas = false;
  for (const c of txt) {
    if (c === "'") aspas = !aspas;
    if (!aspas && c === "(") prof++;
    if (!aspas && c === ")") prof--;
    if (!aspas && prof === 0 && c === ",") { partes.push(atual); atual = ""; continue; }
    atual += c;
  }
  if (atual.trim()) partes.push(atual);
  return partes.map(p => p.trim()).filter(Boolean);
}
const MODOS = new Set(["in", "out", "inout", "variadic"]);
/** Parâmetro SQL → {nome, tipo, opcional}; o tipo vem normalizado (minúsculas, espaços simples, sem «public.»). */
function lerParam(p) {
  const semDefault = p.split(/\s+default\s+|\s*=\s*/i)[0].trim();
  const toks = semDefault.split(/\s+/);
  if (MODOS.has(toks[0].toLowerCase())) toks.shift();
  const nome = toks.length > 1 ? toks.shift() : "";
  const tipo = toks.join(" ").toLowerCase().replace(/\bpublic\./g, "").replace(/\s+/g, " ");
  return { nome, tipo, opcional: /\sdefault\s|=/i.test(p) };
}

/** Todas as definições de função public.* de um texto de migração, na ordem em que aparecem:
    [{nome, params: [{nome, tipo, opcional}], assinatura: "nome(tipo,tipo)", corpo, pos}]. Parênteses aninhados (numeric(10,2),
    default '{}'::jsonb) e corpo $tag$…$tag$ entendidos. Serve ao lint e aos testes estáticos (SV-130, SV-133, SV-214). */
export function definicoesFuncoes(sql) {
  const s = String(sql).replace(/\r\n?/g, "\n");
  const m = mascarar(s);   // comentário e string não abrem definição
  const defs = [];
  for (const x of m.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
    let i = x.index + x[0].length, prof = 1;
    while (i < s.length && prof > 0) { if (m[i] === "(") prof++; else if (m[i] === ")") prof--; i++; }
    const params = dividirParams(s.slice(x.index + x[0].length, i - 1)).map(lerParam);
    const resto = s.slice(i);
    const d = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(resto);
    let corpo = "";
    if (d && !/;/.test(m.slice(i, i + d.index))) {
      const ini = d.index + d[0].length, fim = resto.indexOf(d[0], ini);
      corpo = resto.slice(ini, fim < 0 ? undefined : fim);
    }
    const nome = x[1].toLowerCase();
    defs.push({ nome, params, assinatura: `${nome}(${params.map(p => p.tipo).join(",")})`, corpo, pos: x.index });
  }
  return defs;
}

/** Quais arquivos do diretório entram no lint (>= PRIMEIRA_CONFERIDA, só .sql, em ordem). */
export const arquivosConferidos = (arquivos, primeira = PRIMEIRA_CONFERIDA) =>
  [...arquivos].filter(f => f.endsWith(".sql") && f >= primeira).sort();

function principal(argv) {
  const alvos = argv.length ? argv.map(a => resolve(a)) : arquivosConferidos(readdirSync(MIGRACOES)).map(f => join(MIGRACOES, f));
  let total = 0;
  for (const arq of alvos) {
    // plano 1500c · SC-041: só as migrações do diretório conferem a permissão por função nova (precisam das anteriores)
    const ant = dirname(arq) === MIGRACOES ? funcoesAnteriores(arq) : null;
    const v = lintMigracao(basename(arq), readFileSync(arq, "utf8"), ant);
    total += v.length;
    for (const x of v) console.error(`${basename(arq)}${x.linha ? `:${x.linha}` : ""} · ${x.regra} · ${x.msg}${x.trecho ? ` · ${x.trecho}` : ""}`);
    if (!v.length) console.log(`ok  ${basename(arq)}`);
  }
  if (!alvos.length) console.log(`nenhuma migração a partir de ${PRIMEIRA_CONFERIDA} (nada a conferir)`);
  if (total) console.error(`${total} violação(ões). Exceção só com «-- lint:permitido <motivo>» (ver o cabeçalho deste script).`);
  return total ? 1 : 0;
}

const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) process.exitCode = principal(process.argv.slice(2));
