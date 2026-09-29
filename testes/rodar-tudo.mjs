/* ÓRBITA — suíte completa, serial para não disputar supabase/dist.
   Uso: node testes/rodar-tudo.mjs
   ORBITA_COMPLETO=1 faz a suíte falhar se faltar arquivo de qualquer frente. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const comandos = [
  ["testes/painel.teste.mjs"],
  ["testes/nucleo.teste.mjs"],
  ["testes/app.teste.mjs"],
  ["testes/crm.teste.mjs"],
  ["testes/conversas.teste.mjs"],
  ["testes/relatorios.teste.mjs"],
  ["--test", "testes/funcoes.teste.mjs"],
  ["--test", "testes/scripts.teste.mjs"],
  ["--test", "testes/conversas-funcoes.teste.mjs"],
  ["--test", "testes/automacoes.teste.mjs"],
];

const env = { ...process.env, ORBITA_COMPLETO: "1" };
const resultados = [];
for (const args of comandos) {
  const nome = args.join(" ");
  console.log(`\n=== ${nome} ===`);
  const inicio = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: raiz,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const codigo = r.error ? 1 : (r.status ?? 1);
  resultados.push({ nome, codigo, ms: Date.now() - inicio, erro: r.error?.message });
  console.log(`=== ${codigo === 0 ? "OK" : "FALHOU"} · ${nome} · ${((Date.now() - inicio) / 1000).toFixed(1)} s ===`);
}

const falhas = resultados.filter(r => r.codigo !== 0);
console.log(`\nSuíte final: ${resultados.length - falhas.length}/${resultados.length} arquivos passaram.`);
if (falhas.length) {
  for (const f of falhas) console.error(`- ${f.nome}: código ${f.codigo}${f.erro ? ` (${f.erro})` : ""}`);
  process.exitCode = 1;
}
