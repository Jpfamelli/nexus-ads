/* ============================================================
   NEXUS ADS — montar-funcoes.mjs
   Monta supabase/dist/<funcao>/ em diretório PLANO, do jeito que o
   deploy sem CLI envia: index.ts + todos os .js de _compartilhado +
   cópia byte a byte de web/nucleo.js. Funções: nx-ciclo, nx-relatorio,
   nx-whatsapp, nx-enviar, nx-midia, nx-ia (todas verify_jwt: false).
   Uso: node scripts/montar-funcoes.mjs
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCOES = join(RAIZ, "supabase", "functions");
const COMPARTILHADO = join(FUNCOES, "_compartilhado");
const NUCLEO = join(RAIZ, "web", "nucleo.js");
const DIST = join(RAIZ, "supabase", "dist");
// as 6 funções (ESPEC §6): todas com verify_jwt: false (autenticação própria)
const LISTA = ["nx-ciclo", "nx-relatorio", "nx-whatsapp", "nx-enviar", "nx-midia", "nx-ia"];
// handler de cada função (o index.ts importa tratar dele)
const HANDLER = {
  "nx-ciclo": "ciclo.js", "nx-relatorio": "relatorio.js", "nx-whatsapp": "webhook.js",
  "nx-enviar": "enviar.js", "nx-midia": "midia.js", "nx-ia": "ia_conversas.js",
};

const sha = b => createHash("sha256").update(b).digest("hex").slice(0, 12);
const falhar = msg => { console.error(`ERRO: ${msg}`); process.exit(1); };

if (!existsSync(NUCLEO)) falhar(`não achei ${NUCLEO}`);
// _compartilhado/nucleo.js é só a ponte do layout de desenvolvimento: no deploy vai o original
const modulos = readdirSync(COMPARTILHADO).filter(n => n.endsWith(".js") && n !== "nucleo.js").sort();
const nucleo = readFileSync(NUCLEO);

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
  }
}

console.log(`nucleo.js  sha256 ${sha(nucleo)}  (${nucleo.length} bytes)\n`);
for (const fn of LISTA) {
  const entrada = join(FUNCOES, fn, "index.ts");
  if (!existsSync(entrada)) falhar(`não achei ${entrada}`);
  const destino = join(DIST, fn);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });

  writeFileSync(join(destino, "index.ts"), readFileSync(entrada));
  for (const m of modulos) writeFileSync(join(destino, m), readFileSync(join(COMPARTILHADO, m)));
  writeFileSync(join(destino, "nucleo.js"), nucleo);

  if (sha(readFileSync(join(destino, "nucleo.js"))) !== sha(nucleo)) falhar(`${fn}: nucleo.js diferente do original`);
  conferirImports(destino);
  const idx = readFileSync(join(destino, "index.ts"), "utf8");
  if (!idx.includes(`from "./${HANDLER[fn]}"`)) falhar(`${fn}: index.ts não importa tratar de ${HANDLER[fn]}`);

  const arquivos = readdirSync(destino).sort((a, b) => (a === "index.ts" ? -1 : b === "index.ts" ? 1 : a.localeCompare(b)));
  console.log(`${fn}  (entrypoint index.ts, verify_jwt: false)`);
  for (const a of arquivos) console.log(`  ${a.padEnd(14)} ${String(statSync(join(destino, a)).size).padStart(6)} bytes`);
  console.log("");
}
console.log(`pronto: ${DIST}`);
