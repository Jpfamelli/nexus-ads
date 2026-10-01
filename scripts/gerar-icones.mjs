#!/usr/bin/env node
// Gera os ícones PNG do app instalável (M13) a partir de web/app/orbita-icon.svg: 192 e 512 (qualquer), 512 maskable (com a zona segura de 80 %
// para o Android recortar em círculo sem comer a órbita) e o apple-touch-icon de 180. Saída: web/app/icones/*.png (versionados no repositório).
// Uso:  node scripts/gerar-icones.mjs        (precisa do Chrome e do puppeteer-core: PUPPETEER_CORE=<pasta do pacote>)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const SAIDA = join(RAIZ, "web", "app", "icones");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FUNDO = "#07090C";

async function carregarPuppeteer() {
  const req = createRequire(join(RAIZ, "x.js"));
  for (const c of [process.env.PUPPETEER_CORE, "puppeteer-core"].filter(Boolean)) {
    try { return req(c); } catch { /* próximo */ }
    try { return (await import(pathToFileURL(c).href)).default; } catch { /* próximo */ }
  }
  throw new Error("puppeteer-core não encontrado: defina PUPPETEER_CORE=<pasta do pacote>");
}

const svg = readFileSync(join(RAIZ, "web", "app", "orbita-icon.svg"), "utf8").replace(/<\?xml[^>]*>/, "").trim();
const puppeteer = await carregarPuppeteer();
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
mkdirSync(SAIDA, { recursive: true });

/** Renderiza o SVG num quadrado `tam` px; `escala` < 1 deixa margem (maskable); `fundoCheio` pinta o quadrado todo (maskable e iOS não aceitam transparência). */
async function gerar(arquivo, tam, { escala = 1, fundoCheio = false } = {}) {
  const page = await navegador.newPage();
  await page.setViewport({ width: tam, height: tam, deviceScaleFactor: 1 });
  const lado = Math.round(tam * escala);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${tam}px;height:${tam}px;background:${fundoCheio ? FUNDO : "transparent"};display:grid;place-items:center;overflow:hidden}svg{width:${lado}px;height:${lado}px;display:block}</style>${svg}`);
  const png = await page.screenshot({ type: "png", omitBackground: !fundoCheio, clip: { x: 0, y: 0, width: tam, height: tam } });
  writeFileSync(join(SAIDA, arquivo), png);
  await page.close();
  console.log(`${arquivo}  ${tam}×${tam}  ${png.length} bytes`);
}

try {
  await gerar("icon-192.png", 192);
  await gerar("icon-512.png", 512);
  await gerar("icon-maskable-512.png", 512, { escala: 0.66, fundoCheio: true });   // a órbita dentro da zona segura (80 % do círculo)
  await gerar("apple-touch-icon.png", 180, { escala: 1, fundoCheio: true });
} finally { await navegador.close(); }
