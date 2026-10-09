/* ÓRBITA — suíte completa, serial para não disputar supabase/dist.
   Uso: node testes/rodar-tudo.mjs [--rapido] [--so <texto>] [--exigir]
     --rapido   pula os arquivos marcados como lentos (app, plano50-sistema/inicio, dev-falso, corpo-limite, conversas-funcoes):
                ~25 s em vez de ~80 s — para iterar; antes de integrar roda-se tudo.
     --so x     só os arquivos cujo caminho contém x (ex.: --so plano100, --so crm).
     --exigir   arquivo opcional ausente (plano100-* de frente que ainda não entregou) FALHA em vez de ser pulado.
   ORBITA_COMPLETO=1 faz a suíte falhar se faltar arquivo de qualquer frente (os testes leem essa variável). */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/* {args, lento?: true (fica fora do --rapido), opcional?: true (pulado enquanto o arquivo não existe)}.
   Os plano100-* entram já aqui, opcionais: cada frente cria o seu e ele passa a rodar sozinho. */
export const COMANDOS = [
  { args: ["testes/painel.teste.mjs"] },
  { args: ["testes/nucleo.teste.mjs"] },
  { args: ["--test", "testes/plano100-painel.teste.mjs"], opcional: true },        // P
  { args: ["testes/app.teste.mjs"], lento: true },
  { args: ["testes/crm.teste.mjs"] },
  { args: ["testes/conversas.teste.mjs"] },
  { args: ["testes/relatorios.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261002.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-crm.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-ads.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-visual.teste.mjs"] },
  { args: ["--test", "testes/plano50-sistema.teste.mjs"], lento: true },
  { args: ["--test", "testes/plano100-sistema.teste.mjs"], opcional: true },       // A
  { args: ["--test", "testes/plano50-inicio.teste.mjs"], lento: true },
  { args: ["--test", "testes/plano100-inicio.teste.mjs"], opcional: true },        // B (onda 2)
  { args: ["--test", "testes/plano50-crm.teste.mjs"] },
  { args: ["--test", "testes/plano100-crm.teste.mjs"], opcional: true },           // C (onda 2)
  { args: ["--test", "testes/plano50-conversas.teste.mjs"] },
  { args: ["--test", "testes/plano100-conversas.teste.mjs"], opcional: true },     // D (onda 2)
  { args: ["--test", "testes/plano50-agenda.teste.mjs"] },
  { args: ["--test", "testes/plano100-agenda.teste.mjs"], opcional: true },        // E (onda 2)
  { args: ["--test", "testes/plano50-ads.teste.mjs"] },
  { args: ["--test", "testes/plano100-ads.teste.mjs"], opcional: true },           // F (onda 2)
  { args: ["--test", "testes/plano50-automacoes.teste.mjs"] },
  { args: ["--test", "testes/plano100-automacoes.teste.mjs"], opcional: true },    // G (onda 2)
  { args: ["testes/shell.teste.mjs"] },
  { args: ["--test", "testes/funcoes.teste.mjs"] },
  { args: ["--test", "testes/plano100-funcoes.teste.mjs"], opcional: true },       // S-F
  { args: ["--test", "testes/scripts.teste.mjs"] },
  { args: ["--test", "testes/dev-falso.teste.mjs"], lento: true },
  { args: ["--test", "testes/conversas-funcoes.teste.mjs"], lento: true },
  { args: ["--test", "testes/corpo-limite.teste.mjs"], lento: true },
  { args: ["--test", "testes/codewords.teste.mjs"] },
  { args: ["--test", "testes/rastreio.teste.mjs"] },
  { args: ["--test", "testes/automacoes.teste.mjs"] },
  { args: ["--test", "testes/automacoes-catalogo.teste.mjs"] },
  { args: ["--test", "testes/automacoes-ia.teste.mjs"] },
  { args: ["--test", "testes/correcoes-backend.teste.mjs"] },
  { args: ["--test", "testes/isolamento.teste.mjs"] },
  { args: ["--test", "testes/plano100-banco.teste.mjs"], opcional: true },         // S-B
];

/** O que roda com estes argumentos: {rodar: [args], pulados (lentos fora do --rapido), ausentes (opcionais que ainda não existem)}. */
export function selecionar(argv = [], existe = f => existsSync(resolve(raiz, f))) {
  const rapido = argv.includes("--rapido"), exigir = argv.includes("--exigir");
  const so = argv.includes("--so") ? String(argv[argv.indexOf("--so") + 1] || "") : "";
  const rodar = [], pulados = [], ausentes = [];
  for (const c of COMANDOS) {
    const arquivo = c.args.at(-1);
    if (so && !arquivo.includes(so)) continue;
    if (rapido && c.lento) { pulados.push(arquivo); continue; }
    if (c.opcional && !exigir && !existe(arquivo)) { ausentes.push(arquivo); continue; }
    rodar.push(c.args);
  }
  return { rodar, pulados, ausentes, rapido, so, exigir };
}

function principal() {
  const sel = selecionar(process.argv.slice(2));
  if (!sel.rodar.length) {
    console.error(sel.so ? `nenhum arquivo casa com --so ${sel.so}` : "nenhum arquivo para rodar");
    process.exitCode = 1;
    return;
  }
  const env = { ...process.env, ORBITA_COMPLETO: "1" };
  const resultados = [];
  for (const args of sel.rodar) {
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
  const notas = [
    sel.pulados.length ? `${sel.pulados.length} pulado${sel.pulados.length === 1 ? "" : "s"} pelo --rapido` : "",
    sel.ausentes.length ? `${sel.ausentes.length} opciona${sel.ausentes.length === 1 ? "l" : "is"} ainda sem arquivo (${sel.ausentes.map(a => a.replace(/^testes\/|\.teste\.mjs$/g, "")).join(", ")})` : "",
  ].filter(Boolean);
  console.log(`\nSuíte final: ${resultados.length - falhas.length}/${resultados.length} arquivos passaram.${notas.length ? ` · ${notas.join(" · ")}` : ""}`);
  if (falhas.length) {
    for (const f of falhas) console.error(`- ${f.nome}: código ${f.codigo}${f.erro ? ` (${f.erro})` : ""}`);
    process.exitCode = 1;
  }
}

// só roda quando chamado direto (os testes importam COMANDOS/selecionar sem disparar a suíte)
const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) principal();
