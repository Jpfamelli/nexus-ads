#!/usr/bin/env node
// Sobe a versão do app em UM passo: troca o ?v= atual por um novo em web/app/index.html, nas entradas (/crm, /ads, /atendimento)
// e em web/app/versao.json (o shell compara os dois; o service worker nasce de sw.js?v=<versão>).
// Uso:  node scripts/bump-versao.mjs <nova-versao>     (ex.: 20261002a)  — sem argumento, só mostra a versão atual.
// Só mexe nesses arquivos. Depois rode: node testes/shell.teste.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RAIZ, "web");
const ARQUIVOS = ["app/index.html", "app/versao.json", "crm/index.html", "ads/index.html", "atendimento/index.html"].map(f => join(WEB, f));

const html = readFileSync(join(WEB, "app/index.html"), "utf8");
const atual = (/<script type="module" src="app\.js\?v=([^"]+)"/.exec(html) || [])[1];
if (!atual) { console.error("não achei o ?v= do app.js em web/app/index.html"); process.exit(1); }
const nova = process.argv[2];
if (!nova) { console.log(`versão atual: ${atual}`); process.exit(0); }
if (!/^[A-Za-z0-9._-]{1,40}$/.test(nova)) { console.error("versão inválida (letras, números, . _ -)"); process.exit(1); }
if (nova === atual) { console.log("já é essa versão"); process.exit(0); }
let total = 0;
for (const arq of ARQUIVOS) {
  const t = readFileSync(arq, "utf8");
  const n = t.split(atual).length - 1;
  if (!n) continue;
  writeFileSync(arq, t.split(atual).join(nova));
  total += n;
  console.log(`${String(n).padStart(3)} × ${arq.replace(WEB, "web").replaceAll("\\", "/")}`);
}
console.log(`${atual} → ${nova} (${total} trocas)`);
