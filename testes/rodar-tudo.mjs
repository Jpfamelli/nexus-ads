/* ÓRBITA — suíte completa, serial para não disputar supabase/dist.
   Uso: node testes/rodar-tudo.mjs [--rapido] [--so <texto>] [--exigir]
     --rapido   pula os arquivos marcados como lentos (app, plano50-sistema/inicio, dev-falso, corpo-limite, conversas-funcoes):
                ~25 s em vez de ~80 s — para iterar; antes de integrar roda-se tudo.
     --so x     só os arquivos cujo caminho contém x (ex.: --so plano100, --so crm).
     --exigir   arquivo opcional ausente (plano1000-* de frente que ainda não entregou) FALHA em vez de ser pulado (o deploy usa).
   ORBITA_COMPLETO=1 faz a suíte falhar se faltar arquivo de qualquer frente (os testes leem essa variável). */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/* {args, lento?: true (fica fora do --rapido), opcional?: true (pulado enquanto o arquivo não existe)}.
   Os plano100-* já existem todos e deixaram de ser opcionais (SV-160: um apagado/renomeado FALHA, não some do portão em silêncio);
   os plano1000-* seguem opcionais até a frente entregar — o deploy roda com --exigir. */
export const COMANDOS = [
  { args: ["testes/painel.teste.mjs"] },
  { args: ["testes/nucleo.teste.mjs"] },
  { args: ["--test", "testes/plano100-painel.teste.mjs"] },        // P
  { args: ["testes/app.teste.mjs"], lento: true },
  { args: ["testes/crm.teste.mjs"] },
  { args: ["testes/conversas.teste.mjs"] },
  { args: ["testes/relatorios.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261002.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-crm.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-ads.teste.mjs"] },
  { args: ["--test", "testes/melhorias-20261003-visual.teste.mjs"] },
  { args: ["--test", "testes/plano50-sistema.teste.mjs"], lento: true },
  { args: ["--test", "testes/plano100-sistema.teste.mjs"] },       // A
  { args: ["--test", "testes/plano50-inicio.teste.mjs"], lento: true },
  { args: ["--test", "testes/plano100-inicio.teste.mjs"] },        // B (onda 2)
  { args: ["--test", "testes/plano50-crm.teste.mjs"] },
  { args: ["--test", "testes/plano100-crm.teste.mjs"] },           // C (onda 2)
  { args: ["--test", "testes/plano50-conversas.teste.mjs"] },
  { args: ["--test", "testes/plano100-conversas.teste.mjs"] },     // D (onda 2)
  { args: ["--test", "testes/plano50-agenda.teste.mjs"] },
  { args: ["--test", "testes/plano100-agenda.teste.mjs"] },        // E (onda 2)
  { args: ["--test", "testes/plano50-ads.teste.mjs"] },
  { args: ["--test", "testes/plano100-ads.teste.mjs"] },           // F (onda 2)
  { args: ["--test", "testes/plano50-automacoes.teste.mjs"] },
  { args: ["--test", "testes/plano100-automacoes.teste.mjs"] },    // G (onda 2)
  { args: ["testes/shell.teste.mjs"] },
  { args: ["--test", "testes/funcoes.teste.mjs"] },
  { args: ["--test", "testes/plano100-funcoes.teste.mjs"] },       // S-F
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
  // plano 1000 (13/10): um por frente, opcionais até a frente entregar (antes do isolamento e do banco, que fecham a lista)
  { args: ["--test", "testes/plano1000-conversas.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-crm.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-ads.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-automacoes.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-agenda.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-sistema.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-funcoes.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-banco.teste.mjs"], opcional: true },
  { args: ["--test", "testes/plano1000-ci.teste.mjs"], opcional: true },
  // plano 1000b (14–15/10): um arquivo por frente + cobertura
  ...["conv", "crm", "ads", "auto", "config", "classico", "agenda", "inicio", "sis", "funcoes", "cobertura"]
    .map(f => ({ args: ["--test", `testes/plano1000b-${f}.teste.mjs`], opcional: true })),
  // plano 1500c (21/10): um arquivo por frente, opcionais até a frente entregar (ausente = pulado; com --exigir, falha)
  ...["conv", "crm", "ads", "auto", "config", "classico", "agenda", "inicio", "sis", "funcoes"]
    .map(f => ({ args: ["--test", `testes/plano1500c-${f}.teste.mjs`], opcional: true })),
  { args: ["--test", "testes/isolamento.teste.mjs"] },
  { args: ["--test", "testes/plano100-banco.teste.mjs"] },         // S-B
];

/** SV-157: com ORBITA_AGORA no ambiente, todo processo de teste (e os filhos do node --test) carrega testes/apoio/relogio.mjs
    antes de tudo (NODE_OPTIONS --import): o relógio fica fixado nesse instante. Sem ORBITA_AGORA, o ambiente não muda. */
export function ambienteDaSuite(base = process.env) {
  const env = { ...base, ORBITA_COMPLETO: "1" };
  if (base.ORBITA_AGORA) {
    const imp = `--import=${pathToFileURL(resolve(raiz, "testes/apoio/relogio.mjs")).href}`;
    if (!String(base.NODE_OPTIONS || "").includes(imp)) env.NODE_OPTIONS = [base.NODE_OPTIONS, imp].filter(Boolean).join(" ");
  }
  return env;
}

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
  const env = ambienteDaSuite();
  if (env.ORBITA_AGORA) console.log(`relógio fixado: ORBITA_AGORA=${env.ORBITA_AGORA} · TZ=${env.TZ || "(do sistema)"}`);
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
