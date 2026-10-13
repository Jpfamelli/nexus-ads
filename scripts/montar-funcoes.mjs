/* ============================================================
   NEXUS ADS — montar-funcoes.mjs
   Monta supabase/dist/<funcao>/ em diretório PLANO, do jeito que o
   deploy sem CLI envia: index.ts + todos os .js de _compartilhado +
   cópia byte a byte de web/nucleo.js e de web/app/auto-catalogo.js (o
   catálogo das automações, compartilhado com o painel). Funções: nx-ciclo, nx-relatorio,
   nx-whatsapp, nx-enviar, nx-midia, nx-ia, nx-codewords (verify_jwt: false).
   Uso: node scripts/montar-funcoes.mjs
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCOES = join(RAIZ, "supabase", "functions");
const COMPARTILHADO = join(FUNCOES, "_compartilhado");
const NUCLEO = join(RAIZ, "web", "nucleo.js");
const CATALOGO = join(RAIZ, "web", "app", "auto-catalogo.js");
const DIST = join(RAIZ, "supabase", "dist");
// As funções usam verify_jwt: false e validação própria do handler.
const LISTA = ["nx-ciclo", "nx-relatorio", "nx-whatsapp", "nx-enviar", "nx-midia", "nx-ia", "nx-codewords"];
// handler de cada função (o index.ts importa tratar dele)
const HANDLER = {
  "nx-ciclo": "ciclo.js", "nx-relatorio": "relatorio.js", "nx-whatsapp": "webhook.js",
  "nx-enviar": "enviar.js", "nx-midia": "midia.js", "nx-ia": "ia_conversas.js",
  "nx-codewords": "codewords.js",
};

const sha = b => createHash("sha256").update(b).digest("hex").slice(0, 12);

/** Plano 1000 (SV-164): a versão gravada em versao.js de cada função (cabeçalho x-orbita-versao): ORBITA_VERSAO; no Actions,
    GITHUB_REF_NAME (a tag funcoes-*) + os 7 primeiros do GITHUB_SHA; fora dele, o commit local (+ «-alterado» com mudança não
    commitada); sem git, «local». Só [A-Za-z0-9._+-], até 80 caracteres. */
export function versaoDoDeploy(env = process.env, git = args => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()) {
  const limpar = v => String(v || "").replace(/[^A-Za-z0-9._+-]/g, "").slice(0, 80);
  if (env.ORBITA_VERSAO) return limpar(env.ORBITA_VERSAO) || "local";
  if (env.GITHUB_SHA) return limpar(`${env.GITHUB_REF_NAME ? `${env.GITHUB_REF_NAME}+` : ""}${env.GITHUB_SHA.slice(0, 7)}`);
  try {
    const commit = git(["rev-parse", "--short=7", "HEAD"]);
    let sujo = false;
    try { sujo = git(["status", "--porcelain", "--", "supabase/functions", "web/nucleo.js", "web/app/auto-catalogo.js"]) !== ""; } catch { /* sem status */ }
    return limpar(`${commit}${sujo ? "-alterado" : ""}`) || "local";
  } catch { return "local"; }
}
export const textoVersao = v => `// gerado por scripts/montar-funcoes.mjs (plano 1000, SV-164) — não editar
export const VERSAO = ${JSON.stringify(v)};
`;
const falhar = msg => { console.error(`ERRO: ${msg}`); process.exit(1); };

if (!existsSync(NUCLEO)) falhar(`não achei ${NUCLEO}`);
if (!existsSync(CATALOGO)) falhar(`não achei ${CATALOGO}`);
// _compartilhado/nucleo.js e _compartilhado/auto-catalogo.js são só as pontes do layout de desenvolvimento:
// no deploy vão os originais (cópia byte a byte)
const PONTES = new Set(["nucleo.js", "auto-catalogo.js"]);
const modulos = readdirSync(COMPARTILHADO).filter(n => n.endsWith(".js") && !PONTES.has(n)).sort();
const nucleo = readFileSync(NUCLEO);
const catalogo = readFileSync(CATALOGO);

/** Todo import relativo precisa apontar para um arquivo que está na mesma pasta plana. */
function conferirImports(pasta) {
  const presentes = new Set(readdirSync(pasta));
  for (const arq of presentes) {
    const txt = readFileSync(join(pasta, arq), "utf8");
    for (const m of txt.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
      const alvo = m[1];
      if (!alvo.startsWith("./") || alvo.slice(2).includes("/")) falhar(`${arq}: import "${alvo}" não é plano`);
      if (!presentes.has(alvo.slice(2))) falhar(`${arq}: import "${alvo}" não existe em ${pasta}`);
    }
    if (arq !== "index.ts" && /\bDeno\./.test(txt)) falhar(`${arq}: usa Deno.* fora do index.ts`);
    if (arq !== "ia.js" && /["']npm:/.test(txt)) falhar(`${arq}: importa npm: fora do ia.js`);
    // plano 1000 (SV-062): import npm: sem versão exata resolve a última publicada a cada deploy (e a cada deno check do CI)
    for (const x of txt.matchAll(/["']npm:((?:@[^/"']+\/)?[^@"']+)(?:@([^"']*))?["']/g)) {
      if (!/^\d+\.\d+\.\d+$/.test(x[2] || "")) falhar(`${arq}: import "npm:${x[1]}" sem versão exata (use npm:${x[1]}@x.y.z)`);
    }
  }
}

const VERSAO = versaoDoDeploy();
console.log(`versão     ${VERSAO}  (x-orbita-versao)`);
console.log(`nucleo.js  sha256 ${sha(nucleo)}  (${nucleo.length} bytes)`);
console.log(`auto-catalogo.js  sha256 ${sha(catalogo)}  (${catalogo.length} bytes)\n`);
for (const fn of LISTA) {
  const entrada = join(FUNCOES, fn, "index.ts");
  if (!existsSync(entrada)) falhar(`não achei ${entrada}`);
  const destino = join(DIST, fn);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });

  writeFileSync(join(destino, "index.ts"), readFileSync(entrada));
  for (const m of modulos) writeFileSync(join(destino, m), readFileSync(join(COMPARTILHADO, m)));
  writeFileSync(join(destino, "nucleo.js"), nucleo);
  writeFileSync(join(destino, "auto-catalogo.js"), catalogo);
  writeFileSync(join(destino, "versao.js"), textoVersao(VERSAO));

  if (sha(readFileSync(join(destino, "nucleo.js"))) !== sha(nucleo)) falhar(`${fn}: nucleo.js diferente do original`);
  if (sha(readFileSync(join(destino, "auto-catalogo.js"))) !== sha(catalogo)) falhar(`${fn}: auto-catalogo.js diferente do original`);
  conferirImports(destino);
  const idx = readFileSync(join(destino, "index.ts"), "utf8");
  if (!idx.includes(`from "./${HANDLER[fn]}"`)) falhar(`${fn}: index.ts não importa tratar de ${HANDLER[fn]}`);

  const arquivos = readdirSync(destino).sort((a, b) => (a === "index.ts" ? -1 : b === "index.ts" ? 1 : a.localeCompare(b)));
  console.log(`${fn}  (entrypoint index.ts, verify_jwt: false)`);
  for (const a of arquivos) console.log(`  ${a.padEnd(14)} ${String(statSync(join(destino, a)).size).padStart(6)} bytes`);
  console.log("");
}
console.log(`pronto: ${DIST}`);
