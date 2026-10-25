#!/usr/bin/env node
/* ============================================================
   ÓRBITA — scripts/conferir-migracoes.mjs (plano 1500c · SC-157)
   O deploy das funções só segue se TODAS as migrações do repositório que se registram em public.nx_versao_banco já estão
   aplicadas no banco: código novo chamando RPC que ainda não existe derruba a tela em produção.

   Uso:  node scripts/conferir-migracoes.mjs < aplicadas.json
         aplicadas.json = a resposta da Management API (POST /v1/projects/<ref>/database/query com
         «select nome from public.nx_versao_banco»): [{"nome": "..."}, …] — ou uma lista de nomes.
   Saída: 0 todas aplicadas · 1 falta alguma (lista os nomes) · 2 entrada ilegível.
   Nada aqui conecta no banco: quem consulta é o passo do workflow (leitura). Sem segredo na saída.
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRACOES = resolve(RAIZ, "supabase/migrations");

/** Os nomes (sem .sql) das migrações que se registram em nx_versao_banco com o próprio nome, em ordem. */
export function migracoesEsperadas(dir = MIGRACOES) {
  return readdirSync(dir).filter(f => f.endsWith(".sql")).sort().map(f => f.slice(0, -4)).filter(nome => {
    const sql = readFileSync(join(dir, `${nome}.sql`), "utf8").replace(/--[^\n]*/g, "");
    return new RegExp(`insert\\s+into\\s+(public\\.)?nx_versao_banco\\s*\\([^)]*\\)\\s*values\\s*\\(\\s*'${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "i").test(sql);
  });
}

/** A resposta da consulta → Set de nomes. Aceita [{nome}], [nome] ou {result:[…]}. Formato estranho → null. */
export function lerAplicadas(texto) {
  let j;
  try { j = JSON.parse(String(texto || "")); } catch { return null; }
  const lista = Array.isArray(j) ? j : Array.isArray(j?.result) ? j.result : null;
  if (!lista) return null;
  const nomes = lista.map(x => (typeof x === "string" ? x : x && typeof x.nome === "string" ? x.nome : null));
  return nomes.every(n => typeof n === "string") ? new Set(nomes) : null;
}

export const faltando = (esperadas, aplicadas) => esperadas.filter(n => !aplicadas.has(n));

function principal() {
  const aplicadas = lerAplicadas(readFileSync(0, "utf8"));
  if (!aplicadas) { console.error("conferir-migracoes: resposta ilegível (esperado JSON [{\"nome\": …}])"); return 2; }
  const falta = faltando(migracoesEsperadas(), aplicadas);
  if (falta.length) {
    console.error(`conferir-migracoes: ${falta.length} migração(ões) do repositório ainda não aplicada(s) no banco: ${falta.join(", ")}`);
    console.error("Aplique (ensaio em ROLLBACK antes) e rode o deploy de novo. Nada foi publicado.");
    return 1;
  }
  console.log(`conferir-migracoes: as ${migracoesEsperadas().length} migrações registradas estão aplicadas`);
  return 0;
}

const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) process.exitCode = principal();
