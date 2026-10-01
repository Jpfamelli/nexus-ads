#!/usr/bin/env node
// Auditoria de acessibilidade (axe-core) das telas principais no ambiente fictício. Plano M22 (01/10/2026): 0 violações sérias/críticas.
// Roda em 1440×900 e 390×844 (celular com toque). axe-core só entra aqui, nos testes: nada vai para o app (CSP sem CDN).
//
// Uso:  node scripts/auditar-a11y.mjs [--telas inicio,conversas,crm,agenda,anuncios,relatorios] [--moderadas]
// Precisa do Chrome instalado e de dois pacotes que o repositório não traz: puppeteer-core e axe-core
// (PUPPETEER_CORE=<pasta do pacote> e AXE_CORE=<pasta do pacote>; ou instale-os em qualquer pasta acima desta: npm i --no-save axe-core puppeteer-core).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import net from "node:net";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const arg = (nome, padrao) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 ? process.argv[i + 1] : padrao; };
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TELAS = {
  inicio: "#/inicio", conversas: "#/conversas/901", crm: "#/crm", agenda: "#/agenda", anuncios: "#/anuncios", relatorios: "#/relatorios/vendas", config: "#/config",
};
const escolhidas = String(arg("telas", "inicio,conversas,crm,agenda,anuncios,relatorios")).split(",").map(s => s.trim()).filter(Boolean);
const mostrarModeradas = process.argv.includes("--moderadas");

async function carregarPacote(env, nome) {
  const req = createRequire(join(RAIZ, "x.js"));
  for (const c of [process.env[env], nome].filter(Boolean)) {
    try { return req(c); } catch { /* próximo */ }
    try { return (await import(pathToFileURL(c).href)).default; } catch { /* próximo */ }
  }
  throw new Error(`${nome} não encontrado: defina ${env}=<pasta do pacote>`);
}
async function portaLivre() {
  const s = net.createServer();
  await new Promise((ok, falha) => s.listen(0, "127.0.0.1", ok).once("error", falha));
  const { port } = s.address();
  await new Promise(ok => s.close(ok));
  return port;
}

const puppeteer = await carregarPacote("PUPPETEER_CORE", "puppeteer-core");
const axeDir = process.env.AXE_CORE || dirname(createRequire(join(RAIZ, "x.js")).resolve("axe-core/package.json"));
const axeFonte = readFileSync(join(axeDir, "axe.min.js"), "utf8");
const porta = await portaLivre();
const servidor = spawn(process.execPath, [join(RAIZ, "scripts/dev-falso.mjs")], { cwd: RAIZ, env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(porta) }, stdio: "ignore", windowsHide: true });
const base = `http://127.0.0.1:${porta}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/app/index.html`)).status === 200) break; } catch { /* subindo */ } await sleep(50); }

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let graves = 0, moderadas = 0;
try {
  for (const [largura, altura, toque] of [[1440, 900, false], [390, 844, true]]) {
    for (const nome of escolhidas) {
      const hash = TELAS[nome];
      if (!hash) { console.log(`? tela desconhecida: ${nome}`); continue; }
      const page = await navegador.newPage();
      await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1, isMobile: toque, hasTouch: toque });
      await page.goto(`${base}/app/?dev-falso=1&dev=1${hash}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const v = document.getElementById("vista"); return v && v.innerText.length > 40 && !v.querySelector(".esqueleto, .sk"); }, { timeout: 20000 }).catch(() => {});
      await sleep(900);
      await page.evaluate(axeFonte);
      const r = await page.evaluate(async () => {
        const res = await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
        return res.violations.map(v => ({ id: v.id, impacto: v.impact, ajuda: v.help, qtd: v.nodes.length, exemplo: v.nodes[0] ? { alvo: v.nodes[0].target.join(" "), resumo: String(v.nodes[0].failureSummary || "").split("\n").slice(0, 3).join(" ") } : null }));
      });
      const sérias = r.filter(v => v.impacto === "serious" || v.impacto === "critical");
      const outras = r.filter(v => !(v.impacto === "serious" || v.impacto === "critical"));
      graves += sérias.length; moderadas += outras.length;
      console.log(`${sérias.length ? "FALHOU" : "ok    "} ${String(largura).padStart(4)} ${nome.padEnd(11)} sérias/críticas: ${sérias.length} · moderadas/leves: ${outras.length}`);
      for (const v of sérias) console.log(`         [${v.impacto}] ${v.id} ×${v.qtd}: ${v.ajuda} — ${v.exemplo ? `${v.exemplo.alvo} — ${v.exemplo.resumo}` : ""}`);
      if (mostrarModeradas) for (const v of outras) console.log(`         (${v.impacto}) ${v.id} ×${v.qtd}: ${v.ajuda}`);
      await page.close();
    }
  }
} finally { await navegador.close(); servidor.kill(); }
console.log(`\nTotal: ${graves} violação(ões) séria(s)/crítica(s) · ${moderadas} moderada(s)/leve(s)`);
process.exitCode = graves ? 1 : 0;
