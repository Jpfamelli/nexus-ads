#!/usr/bin/env node
/* ============================================================
   ÓRBITA — scripts/varrer-segredos.mjs (plano «1000+ melhorias», SV-212)
   Procura segredos de verdade nos arquivos VERSIONADOS (git ls-files): chave da Anthropic, token do Meta, chave secreta do
   Supabase, JWT com papel service_role, chave do CodeWords, tokens do Google e do GitHub. Roda no CI (.github/workflows/ci.yml)
   e localmente: node scripts/varrer-segredos.mjs [arquivo…]
   Saída: 0 limpo · 1 achou (lista caminho:linha e o TIPO — nunca o valor).
   Os dublês dos testes («sk-ant-api03-SEGREDO…», «cwk-kkkk…») não casam: os padrões exigem o comprimento real de cada
   segredo e variedade de caracteres (um valor de verdade é aleatório).
   ============================================================ */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TETO_ARQUIVO = 2 * 1024 * 1024;

const variado = (v, n = 12) => new Set(v).size >= n;
const jwtServico = v => {
  try {
    const carga = JSON.parse(Buffer.from(v.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return carga && carga.role === "service_role";
  } catch { return false; }
};

/** [tipo, regex global, conferência extra do valor] */
export const PADROES = [
  ["chave da Anthropic", /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}/g, variado],
  ["token do Meta", /\bEAA[A-Za-z0-9]{100,}/g, variado],
  ["chave secreta do Supabase", /\bsb_secret_[A-Za-z0-9_-]{28,}/g, variado],
  ["JWT service_role", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g, jwtServico],
  ["chave do CodeWords", /\bcw(?:k|otk)-[A-Za-z0-9_-]{30,}/g, v => variado(v, 14)],
  ["refresh token do Google", /(?:^|[^\w/])1\/\/0[A-Za-z0-9_-]{40,}/g, variado],
  ["access token do Google", /\bya29\.[A-Za-z0-9_-]{60,}/g, variado],
  ["client secret do Google", /\bGOCSPX-[A-Za-z0-9_-]{24,}/g, variado],
  ["token do GitHub", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/g, variado],
];

/** Achados de um texto: [{linha, tipo}] (nunca o valor). */
export function varrerTexto(txt) {
  const out = [];
  const linhas = String(txt).split(/\r?\n/);
  linhas.forEach((l, i) => {
    for (const [tipo, re, confere] of PADROES) {
      for (const m of l.matchAll(re)) if (!confere || confere(m[0])) out.push({ linha: i + 1, tipo });
    }
  });
  return out;
}

export function arquivosVersionados(raiz = RAIZ) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: raiz, encoding: "utf8" }).split("\0").filter(Boolean);
}

export function varrer(arquivos, raiz = RAIZ) {
  const achados = [];
  for (const a of arquivos) {
    const caminho = resolve(raiz, a);
    let st;
    try { st = statSync(caminho); } catch { continue; }
    if (!st.isFile() || st.size > TETO_ARQUIVO) continue;
    const buf = readFileSync(caminho);
    if (buf.includes(0)) continue;   // binário (ícone, imagem)
    for (const x of varrerTexto(buf.toString("utf8"))) achados.push({ arquivo: a, ...x });
  }
  return achados;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pedidos = process.argv.slice(2);
  const achados = varrer(pedidos.length ? pedidos : arquivosVersionados());
  if (!achados.length) { console.log("varrer-segredos: nenhum segredo nos arquivos versionados"); process.exit(0); }
  for (const a of achados) console.error(`::error file=${a.arquivo},line=${a.linha}::possível ${a.tipo} (${a.arquivo}:${a.linha}) — tire do arquivo e troque o segredo`);
  process.exit(1);
}
