/* ============================================================
   ÓRBITA — testes do shell, da conectividade e do PWA (frente B do plano de melhorias de 01/10/2026)
   node testes/shell.teste.mjs
   M11 abertura em paralelo (modulepreload, preload da tela, sessão junto com a marca)
   M12 service worker, versão e cabeçalhos        M14 estado de conexão (rede.js)
   M15 leituras que insistem, escritas que não duplicam, boot que se recupera (api.js, app.js)
   M17 sessão que não derruba o trabalho e rascunhos (rascunho.js, SQL)
   M13 instalável com a marca    M16 cache (cache.js)    M18 paleta    M19 avisos e pulso    M21 ícones    M22 acessibilidade de fluxo
   Node puro, sem dependências; nada de rede. Rodar com ORBITA_COMPLETO=1 não muda nada aqui.
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APP = join(RAIZ, "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const imp = f => import(pathToFileURL(join(APP, f)).href);

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.message || e).split("\n").join("\n      ")}`); }
}
function secao(titulo) { console.log(`\n${titulo}`); }

const HTML = ler("index.html");
const APP_JS = ler("app.js");

/* ============================================================ M11 */
secao("M11 · abrir em paralelo");

const versaoDe = html => (/<script type="module" src="app\.js\?v=([^"]+)"/.exec(html) || [])[1];
const preloads = html => [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);

await teste("index.html: modulepreload do app.js e de TODO módulo base, com o MESMO ?v= do app.js", () => {
  const v = versaoDe(HTML);
  assert.ok(v, "app.js com ?v=");
  const base = (/const MODULOS_BASE = \[([^\]]*)\]/.exec(APP_JS) || [])[1];
  assert.ok(base, "app.js declara MODULOS_BASE");
  const modulos = [...base.matchAll(/"([a-z-]+\.js)"/g)].map(m => m[1]);
  assert.ok(modulos.length >= 6, "MODULOS_BASE lido");
  const esperados = ["app.js", "../dados.js", ...modulos, "prontos.js"];
  const feitos = preloads(HTML);
  for (const e of esperados) assert.ok(feitos.includes(`${e}?v=${v}`), `falta <link rel="modulepreload" href="${e}?v=${v}">`);
  for (const h of feitos) assert.match(h, new RegExp(`\\?v=${v}$`), `${h}: ?v= diferente do app.js`);
});

await teste("app.js: o boot lê os mesmos arquivos que o index.html pré-carrega (dados.js, MODULOS_BASE e prontos.js em paralelo)", () => {
  assert.match(APP_JS, /const prontosP = arq\("prontos\.js"\);/, "prontos.js sai junto, não depois");
  assert.match(APP_JS, /import\(`\.\.\/dados\.js\?v=\$\{encodeURIComponent\(VERSAO\)\}`\), \.\.\.MODULOS_BASE\.map\(arq\)/);
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.ok(iniciar.indexOf("const prontosP") < iniciar.indexOf("await Promise.all"), "prontos.js começa antes de esperar os módulos");
});

await teste("app.js: nx_app_sessao sai junto com a marca pública (antes do await) e aoMudarRota consome a mesma promessa", () => {
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  const iSessao = iniciar.indexOf("E.sessaoPromessa = lerSessao()");
  const iMarca = iniciar.indexOf("await carregarMarcaPublica()");
  assert.ok(iSessao > 0 && iMarca > 0 && iSessao < iMarca, "a sessão é pedida antes de esperar a marca");
  const rota = /async function aoMudarRota\(doUsuario\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(rota, /const antecipada = E\.sessaoPromessa;/);
  assert.match(rota, /adotarSessao\(await antecipada\)/);
  assert.match(APP_JS, /E\.sessaoPromessa\.catch\(/, "promessa antecipada nunca vira 'unhandled rejection'");
});

/** Roda o antes.js num DOM de mentira e devolve o que ele fez. */
function rodarAntes({ hash = "", search = "", token = null, src = "http://x/app/antes.js?v=VTESTE", semDom = false, createElementLanca = false } = {}) {
  const estilos = {}; const attrs = {}; const filhos = [];
  const raiz = { style: { colorScheme: "", setProperty: (k, v) => { estilos[k] = v; } }, setAttribute(k, v) { attrs[k] = v; }, classList: { add(c) { attrs.classe = c; } } };
  const storage = { getItem: k => (k === "nx-token" ? token : null) };
  const document = {
    documentElement: raiz, title: "Órbita", getElementById: () => null, currentScript: semDom ? null : { src },
    createElement: createElementLanca ? () => { throw new Error("sem DOM"); } : () => ({ rel: "", href: "" }),
    head: { appendChild: f => filhos.push(f) },
  };
  const sandbox = { document, window: { localStorage: storage }, localStorage: storage, location: { host: "local", search, hash, href: "http://x/app/" }, URLSearchParams, URL };
  runInNewContext(ler("antes.js"), sandbox);
  return { preloads: filhos.map(f => `${f.rel}:${f.href}`), classe: attrs.classe };
}

await teste("antes.js: injeta o modulepreload da tela do endereço (8 telas + login), com o ?v= do próprio script", () => {
  const casos = [
    ["#/inicio", "inicio.js"], ["#/conversas/901", "conversas.js"], ["#/crm", "crm.js"], ["#/contatos/5", "crm.js"], ["#/empresas", "crm.js"], ["#/tarefas", "crm.js"],
    ["#/agenda", "agenda.js"], ["#/anuncios", "anuncios.js"], ["#/automacoes", "automacoes.js"], ["#/relatorios/vendas", "relatorios.js"], ["#/config/numeros", "config.js"],
    ["#/crm?c=clinica", "crm.js"],
  ];
  for (const [hash, arq] of casos) assert.deepEqual(rodarAntes({ hash, token: "t" }).preloads, [`modulepreload:${arq}?v=VTESTE`], hash);
  assert.deepEqual(rodarAntes({ hash: "", token: "t" }).preloads, ["modulepreload:inicio.js?v=VTESTE"], "sem rota: Início");
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=ads", token: "t" }).preloads, ["modulepreload:anuncios.js?v=VTESTE"], "entrada do Nexus Ads");
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=atendimento", token: "t" }).preloads, ["modulepreload:conversas.js?v=VTESTE"]);
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=crm", token: "t" }).preloads, ["modulepreload:crm.js?v=VTESTE"]);
});

await teste("antes.js: sem sessão guardada (ou rota pública) pré-carrega só o login; rota desconhecida não pré-carrega nada", () => {
  assert.deepEqual(rodarAntes({ hash: "#/crm", token: null }).preloads, ["modulepreload:login.js?v=VTESTE"]);
  assert.deepEqual(rodarAntes({ hash: "#/convite/abc", token: "t" }).preloads, ["modulepreload:login.js?v=VTESTE"]);
  assert.deepEqual(rodarAntes({ hash: "#/senha/abc", token: "t" }).preloads, ["modulepreload:login.js?v=VTESTE"]);
  assert.deepEqual(rodarAntes({ hash: "#/qualquer-coisa", token: "t" }).preloads, []);
});

await teste("antes.js: preload que falha nunca quebra o boot (sem currentScript, sem versão, DOM sem createElement, ?v= suspeito)", () => {
  assert.equal(rodarAntes({ hash: "#/crm", token: "t", semDom: true }).classe, "js", "sem currentScript o boot segue");
  assert.deepEqual(rodarAntes({ hash: "#/crm", token: "t", semDom: true }).preloads, []);
  assert.deepEqual(rodarAntes({ hash: "#/crm", token: "t", src: "http://x/app/antes.js" }).preloads, [], "sem ?v= não adivinha");
  assert.deepEqual(rodarAntes({ hash: "#/crm", token: "t", src: "http://x/app/antes.js?v=a%22%3E%3Cscript" }).preloads, [], "?v= fora do padrão é ignorado");
  const r = rodarAntes({ hash: "#/crm", token: "t", createElementLanca: true });
  assert.equal(r.classe, "js", "createElement lançando erro: a classe .js (fim do antes.js) ainda é posta");
});

await teste("index.html: o antes.js fica por último no <head> (os preloads saem antes do script síncrono) e a meta de CSP continua primeiro", () => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(HTML)[1];
  const iScript = head.indexOf('<script src="antes.js');
  assert.ok(iScript > 0, "antes.js no head");
  assert.ok(head.lastIndexOf("<link") < iScript, "nenhum <link> depois do antes.js");
  assert.ok(head.indexOf("Content-Security-Policy") < head.indexOf("<link"), "CSP antes de qualquer <link>");
});

/* ============================================================ fim */
console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
if (falhas) process.exitCode = 1;
