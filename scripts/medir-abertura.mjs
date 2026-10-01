#!/usr/bin/env node
// Mede em quanto tempo o app mostra conteúdo REAL (não esqueleto) em Início, Conversas e CRM, com rede lenta e sem cache.
// Condições do plano M11 (01/10/2026): celular 390x844, 150 ms de latência, 4 Mbps, cache desligado, 3 rodadas por tela.
// Aceite: mediana <= 1,8 s nas três telas. Sai com código 1 se alguma passar do limite.
//
// Uso:  node scripts/medir-abertura.mjs [--raiz <pasta com web/ e scripts/dev-falso.mjs>] [--limite 1800] [--rodadas 3]
// Precisa do Chrome instalado e do pacote puppeteer-core (o repositório não o traz: aponte com PUPPETEER_CORE=<pasta do pacote>
// ou instale em qualquer pasta acima desta). O servidor é o dev-falso (dados fictícios, nenhuma chamada externa).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import net from "node:net";

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (nome, padrao) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 ? process.argv[i + 1] : padrao; };
const RAIZ = resolve(arg("raiz", join(AQUI, "..")));
const LIMITE = Number(arg("limite", 1800));
const RODADAS = Number(arg("rodadas", 3));
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function carregarPuppeteer() {
  const candidatos = [process.env.PUPPETEER_CORE, "puppeteer-core"].filter(Boolean);
  const req = createRequire(join(RAIZ, "x.js"));
  for (const c of candidatos) {
    try { return req(c); } catch { /* próximo */ }
    try { return (await import(pathToFileURL(c).href)).default; } catch { /* próximo */ }
  }
  throw new Error("puppeteer-core não encontrado: defina PUPPETEER_CORE=<pasta do pacote>");
}
async function portaLivre() {
  const s = net.createServer();
  await new Promise((ok, falha) => s.listen(0, "127.0.0.1", ok).once("error", falha));
  const { port } = s.address();
  await new Promise(ok => s.close(ok));
  return port;
}
const mediana = v => { const o = [...v].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };

const puppeteer = await carregarPuppeteer();
const porta = await portaLivre();
const servidor = spawn(process.execPath, [join(RAIZ, "scripts/dev-falso.mjs")], { cwd: RAIZ, env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(porta) }, stdio: "ignore", windowsHide: true });
const base = `http://127.0.0.1:${porta}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/app/index.html`)).status === 200) break; } catch { /* subindo */ } await sleep(50); }

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let falhou = false;
try {
  console.log(`Abertura com rede lenta (390x844, 150 ms, 4 Mbps, sem cache), ${RODADAS} rodadas, limite ${LIMITE} ms`);
  for (const rota of ["#/inicio", "#/conversas", "#/crm"]) {
    const tempos = [];
    for (let i = 0; i < RODADAS; i++) {
      const page = await navegador.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      // O boot do dev-falso é instalado antes do primeiro script sem uma requisição extra bloqueante.
      // Isso mantém o custo de rede do app/RPCs e evita contar o próprio harness (ausente em produção).
      await page.evaluateOnNewDocument(() => {
        if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") return;
        try {
          if (!localStorage.getItem("nx-token")) localStorage.setItem("nx-token", "demo-local-session");
          sessionStorage.setItem("nx-app-dev", "1");
        } catch { /* armazenamento indisponível */ }
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
          let u;
          try { u = new URL(typeof input === "string" ? input : input.url, location.href); }
          catch { return original(input, init); }
          if (u.hostname === "dtjznipitihnwmcgpzqh.supabase.co") {
            u = new URL("/__dev_falso" + u.pathname + u.search, location.origin);
            return original(u, init);
          }
          return original(input, init);
        };
      });
      const cdp = await page.createCDPSession();
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8 });
      const t0 = Date.now();
      await page.goto(`${base}/app/?dev-falso=1&dev=1&boot=0${rota}`, { waitUntil: "domcontentloaded" });
      const ok = await page.waitForFunction(() => { const v = document.getElementById("vista"); return v && v.innerText.length > 60 && !v.querySelector(".esqueleto,.sk"); }, { timeout: 30000 }).then(() => true, () => false);
      tempos.push(ok ? Date.now() - t0 : Infinity);
      await page.close();
    }
    const m = mediana(tempos);
    const passou = m <= LIMITE;
    if (!passou) falhou = true;
    console.log(`${passou ? "ok    " : "FALHOU"} ${rota.padEnd(11)} mediana ${Number.isFinite(m) ? m : "nunca"} ms  (${tempos.join(", ")})`);
  }
} finally { await navegador.close(); servidor.kill(); }
process.exitCode = falhou ? 1 : 0;
