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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APP = join(RAIZ, "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const readdirSyncApp = () => readdirSync(APP);
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
  assert.match(APP_JS, /Promise\.all\(\[arqRaiz\("dados\.js"\), \.\.\.MODULOS_BASE\.map\(arq\)\]\)/);
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.ok(iniciar.indexOf("const prontosP") < iniciar.indexOf("await Promise.all"), "prontos.js começa antes de esperar os módulos");
});

await teste("app.js: nx_app_sessao sai junto com a marca pública (antes do await) e aoMudarRota consome a mesma promessa", () => {
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  const iSessao = iniciar.indexOf("E.sessaoPromessa = lerSessao()");
  const iMarca = iniciar.indexOf("await carregarMarcaPublica()");
  assert.ok(iSessao > 0 && iMarca > 0 && iSessao < iMarca, "a sessão é pedida antes de esperar a marca");
  const rota = /async function aoMudarRota\(doUsuario\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(rota, /let antecipada = E\.sessaoPromessa;/);
  assert.match(rota, /antecipada \|\| lerSessao\(\)/, "a promessa antecipada é a 1ª tentativa; as repetições leem de novo");
  assert.match(rota, /adotarSessao\(s\)/);
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
  return { preloads: filhos.map(f => `${f.rel}:${f.href}`), classe: attrs.classe, attrs };
}

await teste("antes.js: injeta o modulepreload da tela do endereço (8 telas + login), com o ?v= do próprio script", () => {
  const casos = [
    ["#/inicio", "inicio.js"], ["#/conversas/901", "conversas.js"], ["#/crm", "crm.js"], ["#/contatos/5", "crm.js"], ["#/empresas", "crm.js"], ["#/tarefas", "crm.js"],
    ["#/agenda", "agenda.js"], ["#/anuncios", "anuncios.js"], ["#/automacoes", "automacoes.js"], ["#/relatorios/vendas", "relatorios.js"], ["#/config/numeros", "config.js"],
    ["#/crm?c=clinica", "crm.js"],
  ];
  const extras = {
    // plano 50: o Início carrega relatorios.css + inicio.css; as Conversas usam graficos.js (sparkline da lateral)
    "inicio.js": ["modulepreload:rel-logica.js?v=VTESTE", "modulepreload:graficos.js?v=VTESTE", "preload:relatorios.css?v=VTESTE", "preload:inicio.css?v=VTESTE"],
    "conversas.js": ["modulepreload:cv-logica.js?v=VTESTE", "modulepreload:cv-lista.js?v=VTESTE", "modulepreload:cv-chat.js?v=VTESTE", "modulepreload:cv-composer.js?v=VTESTE", "modulepreload:cv-lateral.js?v=VTESTE", "modulepreload:graficos.js?v=VTESTE", "preload:conversas.css?v=VTESTE"],
    "crm.js": ["modulepreload:crm-logica.js?v=VTESTE", "modulepreload:crm-kanban.js?v=VTESTE", "modulepreload:crm-negocio.js?v=VTESTE", "modulepreload:crm-visoes.js?v=VTESTE", "preload:crm.css?v=VTESTE"],
  };
  for (const [hash, arq] of casos) assert.deepEqual(rodarAntes({ hash, token: "t" }).preloads, [`modulepreload:${arq}?v=VTESTE`, ...(extras[arq] || [])], hash);
  assert.deepEqual(rodarAntes({ hash: "", token: "t" }).preloads, ["modulepreload:inicio.js?v=VTESTE", ...extras["inicio.js"]], "sem rota: Início");
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=ads", token: "t" }).preloads, ["modulepreload:anuncios.js?v=VTESTE"], "entrada do Nexus Ads");
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=atendimento", token: "t" }).preloads, ["modulepreload:conversas.js?v=VTESTE", ...extras["conversas.js"]]);
  assert.deepEqual(rodarAntes({ hash: "", search: "?produto=crm", token: "t" }).preloads, ["modulepreload:crm.js?v=VTESTE", ...extras["crm.js"]]);
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

/* ============================================================ M12 */
secao("M12 · service worker, versão e cabeçalhos");

const SW_TXT = ler("sw.js");
const TOML = readFileSync(join(RAIZ, "netlify.toml"), "utf8");

await teste("versao.json bate com o ?v= do index.html (o integrador sobe os dois juntos)", () => {
  const v = versaoDe(HTML);
  const j = JSON.parse(ler("versao.json"));
  assert.equal(j.versao, v, "versao.json × ?v= do index.html");
  assert.equal(j.sw, true, 'versao.json traz "sw": true (false desliga o service worker — chave de emergência)');
  const vs = [...HTML.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map(m => m[1]);
  assert.equal(new Set(vs).size, 1, "um só ?v= no index.html");
});

await teste("todo import() e todo carregarCss levam ?v= (cada arquivo tem UM endereço por versão)", () => {
  const arquivos = readdirSyncApp().filter(f => f.endsWith(".js") && f !== "sw.js");
  for (const f of arquivos) {
    const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of t.matchAll(/\bimport\(\s*(`[^`]*`|[^)]*)/g)) assert.match(m[1].trim(), /^`[^`]*\?v=\$\{[^`]*`$/, `${f}: import(${m[1].trim()}) sem ?v=`);
  }
  const carregarCss = /export function carregarCss\(nome\) \{[\s\S]*?\n\}\n/.exec(ler("ui.js"))[0];
  assert.match(carregarCss, /\?v=\$\{encodeURIComponent\(VERSAO\)\}/, "carregarCss põe o ?v= do ui.js");
});

await teste("sw.js: nunca cita *.supabase.co e só intercepta o MESMO site (o resto passa direto)", () => {
  assert.doesNotMatch(SW_TXT, /supabase\.co/i);
  assert.match(SW_TXT, /if \(!mesmoSite\(url\)\) return;/);
  assert.match(SW_TXT, /if \(req\.method !== "GET"\) return;/);
  assert.doesNotMatch(SW_TXT, /skipWaiting\(\)(?![^\n]*pular)/.source ? /^$/ : /^$/, "");   // sem skipWaiting solto: a checagem comportamental está abaixo
  assert.doesNotMatch(SW_TXT.replace(/\/\*[\s\S]*?\*\//g, ""), /addEventListener\("install"[\s\S]{0,400}skipWaiting/, "o install não pula a espera sozinho");
});

/** Roda o sw.js num mundo de mentira: caches em memória, fetch programável, relógio curto. */
function criarMundoSW({ versao = "V1", site = "http://site.test", escopo = "/app/", resposta } = {}) {
  const armazem = new Map();
  const cachesFalso = {
    async open(n) {
      if (!armazem.has(n)) armazem.set(n, new Map());
      const m = armazem.get(n);
      return { async match(u) { const r = m.get(String(u)); return r ? r.clone() : undefined; }, async put(u, r) { m.set(String(u), r.clone ? r.clone() : r); }, async keys() { return [...m.keys()]; } };
    },
    async keys() { return [...armazem.keys()]; },
    async delete(n) { return armazem.delete(n); },
  };
  const chamadas = [];
  const fetchFalso = async (req) => {
    const url = typeof req === "string" ? req : req.url;
    chamadas.push(url);
    const r = await (resposta ? resposta(url, req) : new Response("ok:" + url, { status: 200, headers: { "content-type": "text/plain" } }));
    return r;
  };
  const ouvintes = {};
  const state = { pulou: false, claim: false };
  const self_ = {
    location: { href: `${site}${escopo}sw.js?v=${versao}`, origin: site },
    registration: { scope: `${site}${escopo}` },
    clients: { claim: async () => { state.claim = true; } },
    skipWaiting() { state.pulou = true; },
    addEventListener: (t, fn) => { ouvintes[t] = fn; },
  };
  const relogioCurto = (fn, ms) => setTimeout(fn, Math.min(ms, 15));
  runInNewContext(SW_TXT, { self: self_, caches: cachesFalso, fetch: fetchFalso, Request, Response, URL, URLSearchParams, Promise, AbortController, setTimeout: relogioCurto, clearTimeout, console });
  const evento = extra => { const pend = []; return { ...extra, respondWith(p) { this.resposta = p; }, waitUntil(p) { pend.push(p); }, async fim() { await Promise.all(pend); } }; };
  const req = (url, extra = {}) => ({ method: "GET", url: `${site}${url}`, mode: "cors", headers: new Headers(), ...extra });
  return { armazem, cachesFalso, chamadas, ouvintes, state, evento, req, site, escopo };
}

await teste("sw.js: cross-origin, POST, ambiente fictício e versao.json passam direto (nenhum respondWith)", async () => {
  const m = criarMundoSW();
  const casos = [
    m.req("", { url: "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/rpc/nx_pulso" }),
    m.req("/app/app.js?v=V1", { method: "POST" }),
    m.req("/__dev_falso/boot.js"),
    m.req("/app/versao.json"),
    m.req("/app/versao.json?t=1"),
    m.req("/app/sw.js?v=V1"),
    m.req("/app/manifest.webmanifest"),
    m.req("/app/api.js"),                                   // sem ?v=: não é arquivo versionado
    m.req("/app/", { mode: "navigate", url: "https://outro.test/app/" }),
  ];
  for (const r of casos) { const ev = m.evento({ request: r }); m.ouvintes.fetch(ev); assert.equal(ev.resposta, undefined, `interceptou ${r.method} ${r.url}`); }
  assert.equal(m.chamadas.length, 0, "nenhuma chamada de rede feita pelo sw");
  const fora = m.evento({ request: m.req("/outro-site/", { mode: "navigate" }) }); m.ouvintes.fetch(fora);
  assert.equal(fora.resposta, undefined, "navegação fora de /app/ não é do escopo");
});

await teste("sw.js: arquivo com ?v= e /fonts/ = cache primeiro, chave = URL completa (outra versão é outro arquivo)", async () => {
  const m = criarMundoSW();
  const pega = async url => { const ev = m.evento({ request: m.req(url) }); m.ouvintes.fetch(ev); const r = await ev.resposta; await ev.fim(); return r.text(); };
  assert.equal(await pega("/app/ui.js?v=V1"), `ok:${m.site}/app/ui.js?v=V1`);
  assert.equal(m.chamadas.length, 1);
  assert.equal(await pega("/app/ui.js?v=V1"), `ok:${m.site}/app/ui.js?v=V1`);
  assert.equal(m.chamadas.length, 1, "segunda vez vem do cache");
  await pega("/app/ui.js?v=V0");
  assert.equal(m.chamadas.length, 2, "outro ?v= = outra URL = vai à rede");
  await pega("/fonts/satoshi-variable.woff2"); await pega("/fonts/satoshi-variable.woff2");
  assert.equal(m.chamadas.length, 3, "fonte também fica guardada");
  assert.deepEqual([...m.armazem.keys()], ["orbita-shell-V1"], "o cache tem o nome da versão do ?v= do sw");
});

await teste("sw.js: navegação com rede primeiro (prazo de 3 s) e cai no index.html guardado quando offline ou lenta", async () => {
  let modo = "ok";
  const m = criarMundoSW({ resposta: (url) => {
    if (modo === "offline") throw new TypeError("Failed to fetch");
    if (modo === "lenta") return new Promise(() => {});
    return new Response("<html>v1</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  } });
  const navega = async (q = "") => { const ev = m.evento({ request: m.req(`/app/${q}`, { mode: "navigate" }) }); m.ouvintes.fetch(ev); const r = await ev.resposta; const t = await r.text(); return { status: r.status, t }; };
  assert.deepEqual(await navega("?produto=crm"), { status: 200, t: "<html>v1</html>" });
  modo = "offline";
  assert.deepEqual(await navega("?produto=ads&org=x"), { status: 200, t: "<html>v1</html>" }, "offline: o index guardado serve QUALQUER query");
  modo = "lenta";
  assert.deepEqual(await navega(), { status: 200, t: "<html>v1</html>" }, "rede travada: depois do prazo entrega o guardado");
  const vazio = criarMundoSW({ resposta: () => { throw new TypeError("Failed to fetch"); } });
  const ev = vazio.evento({ request: vazio.req("/app/", { mode: "navigate" }) }); vazio.ouvintes.fetch(ev);
  assert.equal((await ev.resposta).status, 503, "sem rede e sem nada guardado: página mínima de 'sem conexão', nunca o dinossauro");
  const erro404 = criarMundoSW({ resposta: () => new Response("nao", { status: 404, headers: { "content-type": "text/html" } }) });
  const e2 = erro404.evento({ request: erro404.req("/app/", { mode: "navigate" }) }); erro404.ouvintes.fetch(e2); await e2.resposta; await e2.fim();
  assert.equal(await erro404.cachesFalso.open("orbita-shell-V1").then(c => c.match(`${erro404.site}/app/index.html`)), undefined, "erro nunca vira o 'shell offline'");
});

await teste("sw.js: install guarda os arquivos que o index.html do ar lista (essenciais obrigatórios, o resto no que der)", async () => {
  const html = `<link rel="stylesheet" href="app.css?v=V1"><link rel="stylesheet" href="shell.css?v=V1"><link rel="modulepreload" href="../dados.js?v=V1">
    <link rel="preload" href="../fonts/a.woff2"><link rel="icon" href="data:image/svg+xml,%3Csvg%3E"><script src="https://cdn.exemplo.test/x.js"></script><script type="module" src="app.js?v=V1"></script>`;
  let quebrar = null;
  const m = criarMundoSW({ resposta: (url) => {
    if (quebrar && url.includes(quebrar)) return new Response("x", { status: 404 });
    if (url.endsWith("/app/index.html")) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("ok", { status: 200 });
  } });
  let ev = m.evento({}); m.ouvintes.install(ev); await ev.fim();
  const chaves = await (await m.cachesFalso.open("orbita-shell-V1")).keys();
  for (const e of ["/app/index.html", "/app/app.css?v=V1", "/app/shell.css?v=V1", "/dados.js?v=V1", "/fonts/a.woff2", "/app/app.js?v=V1"]) assert.ok(chaves.includes(`${m.site}${e}`), `faltou guardar ${e}`);
  assert.ok(!chaves.some(k => /cdn\.exemplo|^data:/.test(k)), "outro domínio e data: ficam de fora");
  quebrar = "fonts/a.woff2";
  const m2 = criarMundoSW({ resposta: (url) => url.includes("a.woff2") ? new Response("x", { status: 404 }) : url.endsWith("/app/index.html") ? new Response(html, { status: 200, headers: { "content-type": "text/html" } }) : new Response("ok") });
  ev = m2.evento({}); m2.ouvintes.install(ev); await ev.fim();
  const m3 = criarMundoSW({ resposta: (url) => url.includes("app.js?") ? new Response("x", { status: 500 }) : url.endsWith("/app/index.html") ? new Response(html, { status: 200, headers: { "content-type": "text/html" } }) : new Response("ok") });
  ev = m3.evento({}); m3.ouvintes.install(ev);
  await assert.rejects(ev.fim(), /shell_incompleto/, "sem o app.js a instalação falha (tenta de novo depois) em vez de guardar um shell quebrado");
});

await teste("sw.js: activate conserva a versão atual + duas anteriores para abas abertas; remove versões mais antigas", async () => {
  const m = criarMundoSW({ versao: "V5" });
  for (const v of ["V0", "V1", "V2", "V3", "V4", "V5"]) await m.cachesFalso.open(`orbita-shell-${v}`);
  await m.cachesFalso.open("outro-app-cache");
  const ev = m.evento({}); m.ouvintes.activate(ev); await ev.fim();
  assert.deepEqual([...m.armazem.keys()].sort(), ["orbita-shell-V3", "orbita-shell-V4", "orbita-shell-V5", "outro-app-cache"]);
  assert.equal(m.state.claim, true);
  assert.equal(m.state.pulou, false, "nada de skipWaiting sozinho");
  m.ouvintes.message(m.evento({ data: { tipo: "qualquer" } }));
  assert.equal(m.state.pulou, false);
  m.ouvintes.message(m.evento({ data: { tipo: "pular" } }));
  assert.equal(m.state.pulou, true, "só com a mensagem pular");
});

await teste("sw.js: fetch que não responde é abortado; navegação e recurso sem cache devolvem fallback limitado", async () => {
  const preso = criarMundoSW({ resposta: () => new Promise(() => {}) });
  const nav = preso.evento({ request: preso.req("/app/", { mode: "navigate" }) }); preso.ouvintes.fetch(nav);
  assert.equal((await nav.resposta).status, 503, "sem shell guardado termina com a tela offline após o prazo");
  const asset = preso.evento({ request: preso.req("/app/crm.js?v=V1") }); preso.ouvintes.fetch(asset);
  assert.equal((await asset.resposta).status, 503, "módulo sem cache também não fica carregando para sempre");
});

await teste("sw.js: precache opcional com servidor travado encerra no prazo", async () => {
  const m = criarMundoSW({ resposta: url => url.endsWith("/app/index.html")
    ? new Response('<script type="module" src="app.js?v=V1"></script>', { status: 200, headers: { "content-type": "text/html" } })
    : new Promise(() => {}) });
  const ev = m.evento({ data: { tipo: "precache", urls: [`${m.site}/app/crm.js?v=V1`] } });
  m.ouvintes.message(ev);
  await Promise.race([ev.fim(), new Promise((_, rej) => setTimeout(() => rej(new Error("precache travou")), 100))]);
});

await teste("sw.js: mensagem precache guarda só arquivo versionado do mesmo site (nada de outro domínio, nada sem ?v=)", async () => {
  const m = criarMundoSW();
  const ev = m.evento({ data: { tipo: "precache", urls: [`${m.site}/app/crm.js?v=V1`, `${m.site}/app/agenda.css?v=V1`, `${m.site}/fonts/x.woff2`,
    "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/x?v=1", `${m.site}/app/api.js`, `${m.site}/app/versao.json?v=V1`, "javascript:alert(1)", 42, null] } });
  m.ouvintes.message(ev); await ev.fim();
  const chaves = await (await m.cachesFalso.open("orbita-shell-V1")).keys();
  assert.deepEqual(chaves.sort(), [`${m.site}/app/agenda.css?v=V1`, `${m.site}/app/crm.js?v=V1`, `${m.site}/fonts/x.woff2`].sort());
  assert.ok(!m.chamadas.some(u => /supabase|versao\.json/.test(u)), "não buscou o que não devia");
});

await teste("chave de emergência: o texto documentado no sw.js é código válido e desregistra, apaga caches e recarrega as abas", async () => {
  const bloco = /1\. Troque o conteúdo[\s\S]*?\n((?:\s{8}[^\n]*\n)+)/.exec(SW_TXT);
  assert.ok(bloco, "o cabeçalho traz o texto da chave de emergência");
  const codigo = bloco[1].split("\n").map(l => l.replace(/^ {8}/, "")).join("\n");
  const estado = { pulou: false, apagados: [], desregistrou: false, navegou: [] };
  const ouv = {};
  runInNewContext(codigo, { self: { skipWaiting() { estado.pulou = true; }, addEventListener: (t, f) => { ouv[t] = f; }, registration: { unregister: async () => { estado.desregistrou = true; } },
    clients: { matchAll: async () => [{ url: "http://x/app/", navigate: u => estado.navegou.push(u) }] } }, caches: { keys: async () => ["a", "b"], delete: async n => { estado.apagados.push(n); } } });
  ouv.install(); assert.equal(estado.pulou, true);
  let pend; ouv.activate({ waitUntil: p => { pend = p; } }); await pend;
  assert.deepEqual(estado.apagados, ["a", "b"]); assert.equal(estado.desregistrou, true); assert.deepEqual(estado.navegou, ["http://x/app/"]);
});

await teste("netlify.toml: sw.js e versao.json sem cache; /app/*.js e *.css imutáveis; fontes 30 dias; manifesto com o tipo certo (e sw.js declarado DEPOIS do *.js)", () => {
  const blocos = TOML.split("[[headers]]").slice(1).map(b => ({ para: (/for = "([^"]+)"/.exec(b) || [])[1], b }));
  const de = p => blocos.find(x => x.para === p);
  assert.match(de("/app/*.js").b, /Cache-Control = "public, max-age=31536000, immutable"/);
  assert.match(de("/app/*.css").b, /Cache-Control = "public, max-age=31536000, immutable"/);
  assert.match(de("/app/sw.js").b, /Cache-Control = "no-cache"/);
  assert.match(de("/app/versao.json").b, /Cache-Control = "no-cache"/);
  assert.match(de("/fonts/*").b, /Cache-Control = "public, max-age=2592000"/);
  assert.match(de("/app/*.webmanifest").b, /Content-Type = "application\/manifest\+json"/);
  assert.ok(blocos.findIndex(x => x.para === "/app/sw.js") > blocos.findIndex(x => x.para === "/app/*.js"), "sw.js depois de /app/*.js (o mais específico por último)");
  assert.match(de("/app/index.html").b, /Cache-Control = "no-cache"/, "o index.html continua sem cache");
});

const PWA = await imp("pwa.js");

await teste("pwa.decidirVersao: versão diferente = nova; igual ou lixo = nada; sw:false = desligar", () => {
  assert.deepEqual(PWA.decidirVersao("A", { versao: "B", sw: true }), { acao: "nova", versao: "B" });
  assert.deepEqual(PWA.decidirVersao("A", { versao: "A" }), { acao: "nada" });
  for (const lixo of [null, undefined, "x", [], {}, { versao: 5 }, { versao: "a b" }, { versao: "<script>" }, { versao: "" }]) assert.deepEqual(PWA.decidirVersao("A", lixo), { acao: "nada" }, JSON.stringify(lixo));
  assert.deepEqual(PWA.decidirVersao("A", { versao: "A", sw: false }), { acao: "desligar" });
  assert.deepEqual(PWA.decidirVersao("A", { sw: false }), { acao: "desligar" });
  assert.equal(PWA.versaoDaUrl("http://x/app/sw.js?v=20261001c"), "20261001c");
  assert.equal(PWA.versaoDaUrl("http://x/app/sw.js"), null);
});

await teste("pwa.swPermitido: https e localhost sim; http em outro host não; dev-falso só com ?sw=1; ?sw=0 desliga", () => {
  const nav = { serviceWorker: {} };
  const p = (protocolo, hostname, search = "") => PWA.swPermitido({ nav, loc: { protocol: protocolo, hostname, search } });
  assert.equal(p("https:", "orbita-nexus-ads.netlify.app"), true);
  assert.equal(p("http:", "localhost"), true);
  assert.equal(p("http:", "127.0.0.1"), true);
  assert.equal(p("http:", "orbita.exemplo.com"), false);
  assert.equal(p("https:", "orbita.exemplo.com", "?sw=0"), false);
  assert.equal(p("http:", "127.0.0.1", "?dev-falso=1&dev=1"), false, "ambiente fictício: arquivo editado não pode ficar escondido");
  assert.equal(p("http:", "127.0.0.1", "?dev-falso=1&sw=1"), true);
  assert.equal(PWA.swPermitido({ nav: {}, loc: { protocol: "https:", hostname: "x", search: "" } }), false, "navegador sem service worker");
});

await teste("pwa.criarVersao: avisa uma vez; aplica sozinha só ociosa há 2 min, sem modal/rascunho/fila e sem recarga recente", async () => {
  let t = 1_000_000, ocupado = false, recarga = null, aplicou = 0, desligou = 0, remoto = { versao: "B" };
  const avisos = [];
  const v = PWA.criarVersao({ versao: "A", agora: () => t, buscar: async () => { if (remoto === "erro") throw new Error("rede"); return remoto; },
    ocupado: () => ocupado, recarregou: () => recarga, aoPronta: i => avisos.push(i), aoAplicar: async () => { aplicou++; }, aoDesligar: async () => { desligou++; } });
  remoto = "erro"; await v.verificar(); assert.equal(v.pronta, null, "falha de rede nunca vira aviso");
  remoto = { versao: "A" }; await v.verificar(); assert.equal(v.pronta, null);
  remoto = { versao: "B" }; await v.verificar(); await v.verificar();
  assert.equal(avisos.length, 1, "avisa uma vez só"); assert.deepEqual(v.pronta, { motivo: "versao", versao: "B" });
  assert.equal(v.podeAplicarSozinha(), false, "acabou de interagir (agora == criação)");
  t += 119_000; assert.equal(v.podeAplicarSozinha(), false, "menos de 2 min");
  t += 2_000; ocupado = true; assert.equal(v.podeAplicarSozinha(), false, "modal aberto, rascunho ou fila segura");
  ocupado = false; recarga = t - 30_000; assert.equal(v.podeAplicarSozinha(), false, "recarregou há pouco: não entra em laço");
  recarga = t - 90_000; v.interagiu(); assert.equal(v.podeAplicarSozinha(), false, "interação zera o relógio");
  t += 121_000; assert.equal(v.podeAplicarSozinha(), true);
  await v.tique(); assert.equal(aplicou, 1);
  await v.tique(); assert.equal(aplicou, 1, "não aplica duas vezes");
  remoto = { versao: "A", sw: false }; await v.verificar(); assert.equal(desligou, 1);
});

/** Mini DOM para a faixa e o iniciar() do pwa.js. */
function criarAmbientePWA({ controller = true, protocolo = "http:", hostname = "localhost", search = "" } = {}) {
  const el = (tag, attrs, ...filhos) => { const o = { tag, attrs: attrs || {}, filhos: filhos.flat(), ouvintes: {}, addEventListener(e, f) { this.ouvintes[e] = f; }, appendChild(f) { this.filhos.push(f); return f; }, clique() { return this.ouvintes.click && this.ouvintes.click(); } }; return o; };
  const texto = n => (typeof n === "string" ? n : (n.filhos || []).map(texto).join(""));
  const ui = { h: el, icone: n => el("svg", { icone: n }), anunciar: () => {} };
  const alvo = el("div");
  const eventos = { sw: {}, doc: {}, jan: {} };
  const postadas = [];
  const reg = { waiting: null, installing: null, active: { postMessage: m => postadas.push(m) }, ouvintes: {}, addEventListener(e, f) { this.ouvintes[e] = f; } };
  const swFalso = { controller: controller ? { postMessage: m => postadas.push(m) } : null, registrado: null, ready: Promise.resolve(), ouvintes: {},
    register: async (url, opc) => { swFalso.registrado = { url, opc }; return reg; }, addEventListener(e, f) { swFalso.ouvintes[e] = f; }, getRegistrations: async () => [{ unregister: async () => { swFalso.desregistrou = true; } }] };
  const recargas = [];
  const loc = { href: "http://localhost/app/", protocol: protocolo, hostname, search, reload: () => recargas.push(1) };
  const store = new Map();
  const doc = { visibilityState: "visible", querySelector: () => null, addEventListener: (e, f) => { eventos.doc[e] = f; }, removeEventListener() {} };
  const jan = { addEventListener: (e, f) => { eventos.jan[e] = f; }, removeEventListener() {}, performance: { getEntriesByType: () => [{ name: "http://localhost/app/ui.js?v=VT" }] } };
  return { ui, alvo, nav: { serviceWorker: swFalso }, sw: swFalso, reg, doc, jan, loc, recargas, postadas, eventos, texto,
    storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

await teste("pwa.iniciar: registra sw.js?v=<versão> com escopo ./ e sem cache, manda o precache e ignora o claim da primeira instalação", async () => {
  const a = criarAmbientePWA({ controller: false });
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, produto: () => "Órbita", nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, urlsPrecache: () => ["http://localhost/app/crm.js?v=VT"],
    fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  await espera(10);
  assert.deepEqual(a.sw.registrado, { url: "sw.js?v=VT", opc: { scope: "./", updateViaCache: "none" } });
  const pre = a.postadas.find(m => m.tipo === "precache");
  assert.ok(pre && pre.urls.includes("http://localhost/app/crm.js?v=VT") && pre.urls.includes("http://localhost/app/ui.js?v=VT"), "telas + o que a página já carregou");
  a.sw.ouvintes.controllerchange();                         // o clients.claim da primeira instalação
  assert.equal(a.alvo.filhos.length, 0, "primeira instalação não é versão nova");
  assert.equal(a.recargas.length, 0);
  p.destruir();
});

await teste("pwa.iniciar: versão nova → faixa «Nova versão do Órbita pronta · Atualizar»; Atualizar recarrega (anti-laço guardado)", async () => {
  const a = criarAmbientePWA({ controller: true });
  let remoto = { versao: "VT" };
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, produto: () => "Órbita", nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, fetchFn: async () => ({ ok: true, json: async () => remoto }) });
  await espera(10);
  await p.verificar(); assert.equal(a.alvo.filhos.length, 0);
  remoto = { versao: "VN" };
  await p.verificar(); await p.verificar();
  assert.equal(a.alvo.filhos.length, 1, "uma faixa só");
  const faixa = a.alvo.filhos[0];
  assert.match(a.texto(faixa), /Nova versão do Órbita pronta\./);
  const botao = faixa.filhos.find(f => f.tag === "button"); assert.equal(a.texto(botao), "Atualizar");
  botao.clique(); await espera(5);
  assert.equal(a.recargas.length, 1, "sem worker em espera: recarrega direto");
  assert.ok(a.storage.getItem("nx-versao-recarga"), "guarda a hora da recarga (anti-laço)");
  p.destruir();
});

await teste("pwa.iniciar: worker em espera da MESMA versão da página só ativa (sem faixa); de outra versão avisa; «Atualizar» manda pular e recarrega no controllerchange", async () => {
  const a = criarAmbientePWA({ controller: true });
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, produto: () => "Órbita", nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  await espera(10);
  const msgsMesma = [];
  a.reg.ouvintes.updatefound();                              // sem installing: nada
  a.reg.installing = { scriptURL: "http://localhost/app/sw.js?v=VT", state: "installing", postMessage: m => msgsMesma.push(m), ouvintes: {}, addEventListener(e, f) { this.ouvintes[e] = f; } };
  a.reg.ouvintes.updatefound(); a.reg.installing.state = "installed"; a.reg.installing.ouvintes.statechange();
  assert.deepEqual(msgsMesma, [{ tipo: "pular" }], "mesma versão: pede o skipWaiting sozinho");
  a.sw.ouvintes.controllerchange();                          // o controlador troca por causa disso
  assert.equal(a.alvo.filhos.length, 0, "sem faixa");
  assert.equal(a.recargas.length, 0, "sem recarga: a página já roda a versão nova");
  const msgsOutra = [];
  a.reg.waiting = { scriptURL: "http://localhost/app/sw.js?v=OUTRA", postMessage: m => msgsOutra.push(m) };
  a.reg.installing = { scriptURL: "http://localhost/app/sw.js?v=OUTRA", state: "installing", postMessage() {}, ouvintes: {}, addEventListener(e, f) { this.ouvintes[e] = f; } };
  a.reg.ouvintes.updatefound(); a.reg.installing.state = "installed"; a.reg.installing.ouvintes.statechange();
  assert.equal(a.alvo.filhos.length, 1, "versão diferente da página: avisa");
  a.alvo.filhos[0].filhos.find(f => f.tag === "button").clique(); await espera(5);
  assert.deepEqual(msgsOutra, [{ tipo: "pular" }]);
  a.sw.ouvintes.controllerchange();
  assert.equal(a.recargas.length, 1, "quem clicou recarrega quando o controlador novo assume");
  p.destruir();
});

await teste("pwa.iniciar: outra aba trocou o worker (controllerchange que não foi minha) → faixa, sem recarga atropelando quem está digitando", async () => {
  const a = criarAmbientePWA({ controller: true });
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, produto: () => "Órbita", nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  await espera(10);
  a.sw.ouvintes.controllerchange();
  assert.equal(a.alvo.filhos.length, 1); assert.equal(a.recargas.length, 0);
  p.destruir();
});

await teste("pwa.iniciar: versao.json com \"sw\": false desregistra o service worker, apaga os caches e recarrega UMA vez por aba", async () => {
  const a = criarAmbientePWA({ controller: true });
  const apagados = [];
  const cachesAntes = globalThis.caches;
  globalThis.caches = { keys: async () => ["orbita-shell-V1", "outro"], delete: async n => { apagados.push(n); } };
  try {
    const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT", sw: false }) }) });
    await espera(10);
    await p.verificar(); await p.verificar();
    assert.equal(a.sw.desregistrou, true);
    assert.deepEqual(apagados, ["orbita-shell-V1"], "só os caches do próprio prefixo");
    assert.equal(a.recargas.length, 1, "uma vez só");
    p.destruir();
  } finally { if (cachesAntes === undefined) delete globalThis.caches; else globalThis.caches = cachesAntes; }
});

await teste("pwa.iniciar: falha de import() vira a mesma faixa; ambiente fictício não registra o service worker sem ?sw=1", async () => {
  const a = criarAmbientePWA({ controller: true });
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage, fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  p.falhaDeImport(); p.falhaDeImport();
  assert.equal(a.alvo.filhos.length, 1);
  p.destruir();
  const d = criarAmbientePWA({ hostname: "127.0.0.1", search: "?dev-falso=1&dev=1" });
  const q = PWA.iniciar({ versao: "VT", ui: d.ui, alvo: d.alvo, nav: d.nav, doc: d.doc, janela: d.jan, loc: d.loc, storage: d.storage, fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  await espera(10);
  assert.equal(d.sw.registrado, null);
  q.destruir();
});

await teste("app.js: pwa.js entra DEPOIS do boot (não está nos preloads) e ctx.naoAtualizar segura a atualização automática", () => {
  assert.doesNotMatch(HTML, /pwa\.js/, "o pwa.js não é preload: não pesa na abertura");
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.ok(iniciar.indexOf("await aoMudarRota(false)") < iniciar.indexOf("iniciarPwa()"), "registro do sw depois do boot");
  assert.match(APP_JS, /naoAtualizar\(fn\) \{/);
  assert.match(APP_JS, /E\.pwa\.falhaDeImport\(\)/);
});

/** O texto de uma função de primeiro nível do app.js (para rodar SÓ ela num mundo de mentira: o app.js inteiro não importa em Node). */
const fnDoApp = nome => {
  const m = new RegExp(`(?:async )?function ${nome}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`).exec(APP_JS);
  assert.ok(m, `app.js tem ${nome}()`);
  return m[0];
};

await teste("revisão R119: o precache leva TODO .js e .css de web/app (menos o sw.js) mais ../dados.js e ../nucleo.js — lista conferida com a pasta, e o sw.js aceita cada endereço", async () => {
  const bloco = /const ARQUIVOS_DO_APP = \[([\s\S]*?)\];/.exec(APP_JS);
  assert.ok(bloco, "app.js declara ARQUIVOS_DO_APP");
  const lista = [...bloco[1].matchAll(/"([a-z0-9-]+\.(?:js|css))"/g)].map(m => m[1]);
  const pasta = readdirSyncApp().filter(f => /\.(js|css)$/.test(f) && f !== "sw.js");
  assert.deepEqual([...lista].sort(), [...pasta].sort(), "arquivo novo em web/app tem de entrar em ARQUIVOS_DO_APP (e arquivo apagado tem de sair)");
  assert.equal(new Set(lista).size, lista.length, "sem repetidos");
  const raizDecl = /const ARQUIVOS_DA_RAIZ = \[([^\]]*)\];/.exec(APP_JS);
  const raiz = [...raizDecl[1].matchAll(/"([a-z0-9-]+\.js)"/g)].map(m => m[1]);
  for (const f of raiz) assert.ok(existsSync(join(RAIZ, "web", f)), `web/${f} existe`);
  // tudo o que alguma tela importa de fora da pasta (../x.js) está na lista da raiz
  const deFora = new Set(["dados.js"]);
  for (const f of pasta.filter(x => x.endsWith(".js"))) for (const m of ler(f).matchAll(/import\(`\.\.\/([a-z0-9-]+\.js)\?v=/g)) deFora.add(m[1]);
  for (const f of deFora) assert.ok(raiz.includes(f), `../${f} é importado por uma tela e não está em ARQUIVOS_DA_RAIZ`);
  // os endereços são os MESMOS que o import() usa (./arquivo?v=<versão>) e o service worker guarda todos
  const m = criarMundoSW({ versao: "V9" });
  const fonte = [bloco[0], raizDecl[0], /const urlArq = [^\n]+/.exec(APP_JS)[0], /const urlArqRaiz = [^\n]+/.exec(APP_JS)[0], fnDoApp("urlsPrecache")].join("\n")
    .replaceAll("import.meta.url", JSON.stringify(`${m.site}/app/app.js?v=V9`));
  const urls = runInNewContext(`const VERSAO = "V9";\n${fonte}\nurlsPrecache();`, { URL, encodeURIComponent });
  assert.equal(urls.length, lista.length + raiz.length);
  for (const f of ["cv-chat.js", "crm-kanban.js", "auto-editor.js", "graficos.js", "cv-config.js", "conversas.css"]) assert.ok(urls.includes(`${m.site}/app/${f}?v=V9`), `${f} no precache`);
  assert.ok(urls.includes(`${m.site}/nucleo.js?v=V9`) && urls.includes(`${m.site}/dados.js?v=V9`), "os dois arquivos da raiz");
  assert.ok(urls.length <= 250, "cabe no teto de uma mensagem de precache do sw.js (MAX_PRECACHE)");
  const ev = m.evento({ data: { tipo: "precache", urls } }); m.ouvintes.message(ev); await ev.fim();
  const chaves = await (await m.cachesFalso.open("orbita-shell-V9")).keys();
  assert.deepEqual([...chaves].sort(), [...urls].sort(), "o sw.js guarda cada um (todos têm ?v= e são do mesmo site)");
});

await teste("revisão R119: na atualização própria a lista do precache vai de novo ao worker NOVO; worker de outra versão no controle não recebe a lista", async () => {
  const a = criarAmbientePWA({ controller: true });
  const paraOAntigo = [];
  a.sw.controller = { scriptURL: "http://localhost/app/sw.js?v=VELHA", postMessage: m => paraOAntigo.push(m) };
  const p = PWA.iniciar({ versao: "VT", ui: a.ui, alvo: a.alvo, produto: () => "Órbita", nav: a.nav, doc: a.doc, janela: a.jan, loc: a.loc, storage: a.storage,
    urlsPrecache: () => ["http://localhost/app/cv-chat.js?v=VT"], fetchFn: async () => ({ ok: true, json: async () => ({ versao: "VT" }) }) });
  try {
    await espera(10);
    assert.equal(paraOAntigo.length, 0, "o worker antigo não baixa a versão nova para um cache que o novo apaga ao assumir");
    const paraONovo = [];
    const novo = { scriptURL: "http://localhost/app/sw.js?v=VT", state: "installing", postMessage: m => paraONovo.push(m), ouvintes: {}, addEventListener(e, f) { this.ouvintes[e] = f; } };
    a.reg.installing = novo; a.reg.ouvintes.updatefound(); novo.state = "installed"; novo.ouvintes.statechange();
    assert.deepEqual(paraONovo, [{ tipo: "pular" }], "mesma versão da página: só ativa");
    a.sw.controller = novo;                                    // o worker novo assumiu a aba
    a.sw.ouvintes.controllerchange();
    const pre = paraONovo.find(x => x.tipo === "precache");
    assert.ok(pre, "a lista foi mandada de novo, agora ao worker novo");
    assert.ok(pre.urls.includes("http://localhost/app/cv-chat.js?v=VT") && pre.urls.includes("http://localhost/app/ui.js?v=VT"), "telas + o que a página já carregou");
    assert.equal(a.recargas.length, 0); assert.equal(a.alvo.filhos.length, 0, "sem faixa e sem recarga: a página já roda a versão nova");
  } finally { p.destruir(); }                                  // os relógios do pwa.js não podem prender o processo se uma conferência falhar
});

await teste("revisão R119: formulário mexido segura a atualização automática (30 min à vista; com a aba oculta, qualquer edição desde que a tela abriu); busca não conta; mudar de tela zera", async () => {
  let agora = 5_000_000, pendentes = 0;
  const E = { rascunhos: { pendentes: () => pendentes }, naoAtualizar: new Set(), editouEm: 0, hashEdicao: null };
  const document = { hidden: false };
  const s = runInNewContext(`${/const EDICAO_RECENTE_MS = [^;]+;/.exec(APP_JS)[0]}\n${fnDoApp("marcarEdicao")}\n${fnDoApp("ocupadoParaAtualizar")}\n({ marcarEdicao, ocupadoParaAtualizar, EDICAO_RECENTE_MS })`,
    { E, document, Date: { now: () => agora } });
  assert.equal(s.EDICAO_RECENTE_MS, 30 * 60 * 1000);
  assert.equal(s.ocupadoParaAtualizar(), false, "nada mexido: pode atualizar");
  s.marcarEdicao({ target: { type: "search" } }); assert.equal(E.editouEm, 0, "digitar numa busca não é trabalho a perder");
  s.marcarEdicao({ target: { type: "text" } }); assert.equal(E.editouEm, agora);
  assert.equal(s.ocupadoParaAtualizar(), true, "acabou de digitar");
  agora += 29 * 60_000; assert.equal(s.ocupadoParaAtualizar(), true, "29 min depois ainda segura");
  agora += 2 * 60_000; assert.equal(s.ocupadoParaAtualizar(), false, "31 min com a aba à vista: libera");
  document.hidden = true; assert.equal(s.ocupadoParaAtualizar(), true, "aba oculta com algo editado nesta tela: nunca recarrega sozinha");
  E.editouEm = 0; assert.equal(s.ocupadoParaAtualizar(), false, "aba oculta sem nada editado: pode");
  document.hidden = false;
  s.marcarEdicao({ target: { tagName: "SELECT" } }); assert.equal(s.ocupadoParaAtualizar(), true, "escolher numa lista (change) também conta");
  E.editouEm = 0; pendentes = 1; assert.equal(s.ocupadoParaAtualizar(), true, "rascunho recente continua segurando");
  pendentes = 0; E.naoAtualizar.add(() => true); assert.equal(s.ocupadoParaAtualizar(), true, "ctx.naoAtualizar continua segurando");
  // a máquina da faixa respeita: ociosa há 2 min mas com formulário mexido não aplica; o botão «Atualizar» aplica na hora
  E.naoAtualizar.clear(); E.editouEm = agora;
  let aplicou = 0, t = 1_000;
  const v = PWA.criarVersao({ versao: "A", agora: () => t, buscar: async () => ({ versao: "B" }), ocupado: () => s.ocupadoParaAtualizar(), aoAplicar: async () => { aplicou++; } });
  await v.verificar(); t += 5 * 60_000;
  await v.tique(); assert.equal(aplicou, 0, "não recarrega por cima do que foi digitado");
  await v.aplicar(); assert.equal(aplicou, 1, "quem clica em «Atualizar» aplica na hora");
  // ligação no shell
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(iniciar, /document\.addEventListener\("input", marcarEdicao, true\);\s*document\.addEventListener\("change", marcarEdicao, true\);/);
  assert.match(fnDoApp("aoMudarRota"), /if \(location\.hash !== E\.hashEdicao\) \{ E\.hashEdicao = location\.hash; E\.editouEm = 0; \}/, "outra tela zera; remontar a mesma não");
  assert.match(APP_JS, /ocupado: ocupadoParaAtualizar,/);
});

/* ============================================================ M14 */
secao("M14 · estado de conexão honesto e recuperação automática");

const REDE = await imp("rede.js");
const API = await imp("api.js");

/** Relógio de mentira (como o do app.teste.mjs): agendar/cancelar/andar. */
function relogioFalso() {
  let t = 1_000_000, fila = [];
  return {
    agora: () => t,
    agendar(fn, ms) { const id = Symbol(); fila.push({ id, fn, em: t + ms }); return id; },
    cancelar(id) { fila = fila.filter(x => x.id !== id); },
    async andar(ms) {
      const fim = t + ms;
      for (;;) {
        fila.sort((a, b) => a.em - b.em);
        const prox = fila[0];
        if (!prox || prox.em > fim) break;
        fila.shift(); t = prox.em; await prox.fn(); await new Promise(r => setImmediate(r));
      }
      t = fim;
    },
    proximo() { fila.sort((a, b) => a.em - b.em); return fila[0] ? fila[0].em - t : null; },
    pendentes: () => fila.length,
  };
}
function janelaFalsa() {
  const ouv = {}, disparados = [];
  return { addEventListener: (e, f) => { (ouv[e] ||= []).push(f); }, removeEventListener: (e, f) => { ouv[e] = (ouv[e] || []).filter(x => x !== f); },
    dispatchEvent: ev => { disparados.push(ev.type + ":" + JSON.stringify(ev.detail || {})); return true; }, emitir: e => (ouv[e] || []).forEach(f => f()), disparados, ouvintes: ouv };
}
function novaRede({ onLine = true, ping = async () => true, sondar } = {}) {
  const rel = relogioFalso(), jan = janelaFalsa(), nav = { onLine };
  const r = REDE.criarRede({ nav, janela: jan, agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, ping, sondar });
  const vistos = []; r.assinar(f => { if (f.mudouEstado || (!f.reconectado && vistos.at(-1)?.endsWith("*"))) vistos.push(`${f.antes}>${f.estado}${f.reconectado ? "*" : ""}`); });
  return { r, rel, jan, nav, vistos };
}

await teste("rede.js: estado inicial vem do navegador; online/offline do navegador mudam o estado na hora", () => {
  assert.equal(novaRede({ onLine: false }).r.estado, "offline");
  const x = novaRede();
  assert.equal(x.r.estado, "online");
  x.nav.onLine = false; x.jan.emitir("offline");
  assert.equal(x.r.estado, "offline");
  assert.deepEqual(x.vistos, ["online>offline"]);
  assert.deepEqual(x.jan.disparados, ['orbita:rede:{"estado":"offline","antes":"online"}']);
  assert.ok(REDE.ESTADOS.includes("lento") && REDE.ESTADOS.includes("servidor_fora"));
});

await teste("rede.js: sem_conexao com onLine verdadeiro pergunta à página — responde = servidor fora; não responde = offline", async () => {
  let a = novaRede({ ping: async () => true });
  a.r.falha({ codigo: "sem_conexao" }); await new Promise(r => setImmediate(r));
  assert.equal(a.r.estado, "servidor_fora");
  let b = novaRede({ ping: async () => false });
  b.r.falha({ codigo: "sem_conexao" }); await new Promise(r => setImmediate(r));
  assert.equal(b.r.estado, "offline");
  let c = novaRede({ onLine: false });
  c.nav.onLine = false; c.r.falha({ codigo: "sem_conexao" });
  assert.equal(c.r.estado, "offline");
});

await teste("rede.js: 502/503/504 e servico_indisponivel = servidor fora; timeout só depois de 2 seguidos; erro de negócio e 57014 não contam", () => {
  for (const codigo of ["http_503", "http_502", "http_504", "servico_indisponivel"]) { const x = novaRede(); x.r.falha({ codigo }); assert.equal(x.r.estado, "servidor_fora", codigo); }
  const t = novaRede();
  t.r.falha({ codigo: "tempo_rede" }); assert.equal(t.r.estado, "online", "um timeout isolado pode ser consulta pesada");
  t.r.sucesso(); t.r.falha({ codigo: "tempo_rede" }); assert.equal(t.r.estado, "online", "sucesso entre os dois zera a conta");
  t.r.falha({ codigo: "tempo_rede" }); assert.equal(t.r.estado, "servidor_fora");
  const n = novaRede();
  for (const codigo of ["tempo_esgotado", "limite_plano", "sessao_invalida", "http_500", "erro_interno", "http_429", undefined]) n.r.falha({ codigo });
  assert.equal(n.r.estado, "online");
  assert.equal(REDE.falhaDeConexao({ codigo: "sem_conexao" }), true);
  assert.equal(REDE.falhaDeConexao({ codigo: "tempo_esgotado" }), false);
});

await teste("rede.js: ao voltar — assinantes, aoVoltar, orbita:online e 'Reconectado' por 2 s", async () => {
  const x = novaRede();
  let voltou = 0; x.r.aoVoltar(() => voltou++);
  x.r.falha({ codigo: "http_503" });
  assert.equal(x.r.estado, "servidor_fora"); assert.equal(voltou, 0);
  x.r.sucesso();
  assert.equal(x.r.estado, "online"); assert.equal(voltou, 1);
  assert.equal(x.r.reconectado, true, "mostra 'Reconectado'");
  assert.ok(x.jan.disparados.some(d => d.startsWith("orbita:online")), "evento orbita:online na janela (o ui.erroCartao escuta)");
  assert.deepEqual(x.vistos.slice(0, 2), ["online>servidor_fora", "servidor_fora>online*"]);
  await x.rel.andar(1999); assert.equal(x.r.reconectado, true);
  await x.rel.andar(2); assert.equal(x.r.reconectado, false, "some depois de 2 s");
  assert.equal(x.vistos.at(-1).includes("*"), false, "e avisa quem desenha a faixa");
  x.r.sucesso(); assert.equal(voltou, 1, "sucesso normal não é 'voltou'");
});

await teste("rede.js: chamada lenta (aos 4 s) vira 'lento' e volta sozinha; offline não é mascarado por lento", () => {
  const x = novaRede();
  x.r.lento(1); assert.equal(x.r.estado, "lento");
  x.r.lento(1); x.r.lento(-1); assert.equal(x.r.estado, "lento", "ainda há uma lenta em voo");
  x.r.lento(-1); assert.equal(x.r.estado, "online");
  x.r.lento(-5); assert.equal(x.r.estado, "online", "contador nunca fica negativo");
  x.r.falha({ codigo: "http_503" }); x.r.lento(1); assert.equal(x.r.estado, "servidor_fora");
  x.r.sucesso(); assert.equal(x.r.estado, "lento", "recuperou, mas a chamada lenta ainda está em voo");
});

await teste("rede.js: tenta sozinho em 2, 4, 8, 15 e 30 s (e 30 s depois); acha a internet, depois o servidor, e volta", async () => {
  let internet = false, servidor = false, sondagens = 0;
  const rel = relogioFalso(), jan = janelaFalsa(), nav = { onLine: false };
  const r = REDE.criarRede({ nav, janela: jan, agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, ping: async () => internet,
    sondar: async () => { sondagens++; if (servidor) r.sucesso(); else r.falha({ codigo: "http_503" }); } });
  assert.equal(r.estado, "offline");
  const esperas = [];
  for (let i = 0; i < 7; i++) { esperas.push(rel.proximo()); await rel.andar(rel.proximo()); }
  assert.deepEqual(esperas, [2000, 4000, 8000, 15000, 30000, 30000, 30000], "recuo 2-4-8-15-30 s");
  assert.equal(r.estado, "offline", "internet ainda fora");
  assert.ok(r.proximaTentativaEm > rel.agora(), "a faixa mostra 'tentando em N s'");
  internet = true; nav.onLine = true;
  await rel.andar(rel.proximo());
  assert.equal(r.estado, "servidor_fora", "a internet voltou; o servidor ainda não responde");
  assert.ok(sondagens >= 1);
  servidor = true;
  await rel.andar(rel.proximo());
  assert.equal(r.estado, "online");
  assert.equal(rel.pendentes(), 1 /* só o relógio do 'Reconectado' */, "sem tentativas agendadas depois de voltar");
  r.destruir();
});

await teste("rede.js: «Tentar agora» e o evento online tentam já (sem esperar o recuo)", async () => {
  let sondagens = 0, internet = false;
  const rel = relogioFalso(), jan = janelaFalsa(), nav = { onLine: true };
  const r = REDE.criarRede({ nav, janela: jan, agendar: rel.agendar, cancelar: rel.cancelar, agora: rel.agora, ping: async () => internet, sondar: async () => { sondagens++; r.sucesso(); } });
  r.falha({ codigo: "http_503" });
  assert.equal(r.proximaTentativaEm - rel.agora(), 2000);
  internet = false; await r.tentarAgora();
  assert.equal(r.estado, "offline", "o ping disse que a internet não existe");
  assert.equal(sondagens, 0);
  internet = true; await r.tentarAgora();
  assert.equal(sondagens, 1); assert.equal(r.estado, "online");
  r.falha({ codigo: "http_503" }); jan.emitir("online"); await new Promise(res => setImmediate(res)); await new Promise(res => setImmediate(res));
  assert.equal(sondagens, 2, "o evento online do navegador tenta na hora");
  r.destruir();
  assert.equal((jan.ouvintes.online || []).length, 0, "destruir solta os ouvintes");
});

await teste("api.js (contexto): erros de conexão trazem leitura × escrita; mensagens por contexto só no modo do shell", async () => {
  const falha = () => { throw new TypeError("Failed to fetch"); };
  const legado = API.criarApi({ url: "https://x.test", chave: "k", fetch: async () => falha() });
  const e0 = await legado.rpc("nx_inicio").catch(x => x);
  assert.equal(e0.contexto, undefined, "sem a opção, o erro é o de antes");
  assert.match(API.mensagemErro(e0), /A comunicação foi interrompida/);
  const api = API.criarApi({ url: "https://x.test", chave: "k", contexto: true, fetch: async () => falha() });
  const leit = await api.rpcC("nx_negocios_kanban").catch(x => x);
  assert.deepEqual(leit.contexto, { leitura: true });
  assert.equal(API.mensagemErro(leit), "Sem internet. Confira a conexão e tente de novo.");
  assert.equal(API.mensagemErro({ ...leit, contexto: { leitura: true, comCache: true } }), "Sem internet. Mostrando o que já tinha.");
  const esc = await api.rpcC("nx_negocio_salvar", { p_negocio: {} }).catch(x => x);
  assert.deepEqual(esc.contexto, { leitura: false });
  assert.equal(API.mensagemErro(esc), "Sem internet: nada foi salvo.");
  const fnErro = await api.fn("nx-enviar", { acao: "texto" }).catch(x => x);
  assert.equal(API.mensagemErro(fnErro), "Sem internet: nada foi salvo.", "função de envio é escrita");
  assert.doesNotMatch(API.mensagemErro(leit), /salvar|enviar|confira o resultado/, "tela só de leitura não fala em salvar ou enviar");
  const lenta = API.criarApi({ url: "https://x.test", chave: "k", contexto: true, prazoMs: 10, fetch: () => new Promise(() => {}) });
  const t = await lenta.rpc("nx_inicio").catch(x => x), tw = await lenta.rpc("nx_tarefa_salvar").catch(x => x);
  assert.equal(API.mensagemErro(t), "O servidor demorou a responder. Tente de novo em instantes.");
  assert.match(API.mensagemErro(tw), /confira o resultado antes de repetir/, "só o prazo estourado de uma ESCRITA pede conferência");
  for (const c of ["servico_indisponivel", "http_429", "http_500", "http_502", "http_503", "http_504"]) assert.doesNotMatch(API.mensagemErro({ codigo: c }), /Não deu certo agora|http_|servico_/, c);
});

await teste("api.js (rede): sucesso e falha de cada chamada chegam ao rede.js; 4xx de negócio prova que o servidor responde; 503 não; lenta aos 4 s", async () => {
  const eventos = [];
  const rede = { sucesso: () => eventos.push("ok"), falha: i => eventos.push("falha:" + i.codigo), lento: d => eventos.push("lento:" + d) };
  const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, text: async () => (corpo === undefined ? "" : JSON.stringify(corpo)) });
  let proxima = resp(200, {});
  const mk = (extra = {}) => API.criarApi({ url: "https://x.test", chave: "k", rede, fetch: async () => (typeof proxima === "function" ? proxima() : proxima), ...extra });
  const api = mk();
  await api.rpc("nx_inicio"); assert.deepEqual(eventos.splice(0), ["ok"]);
  proxima = resp(400, { message: "limite_plano" }); await api.rpc("nx_x_salvar").catch(() => {}); assert.deepEqual(eventos.splice(0), ["ok"], "erro de negócio = servidor respondeu");
  proxima = resp(401, { message: "sessao_invalida" }); await api.rpc("nx_inicio").catch(() => {}); assert.deepEqual(eventos.splice(0), ["ok"]);
  proxima = resp(500, { message: "erro_interno" }); await api.rpc("nx_x_salvar").catch(() => {}); assert.deepEqual(eventos.splice(0), ["ok"], "500 de função não é 'servidor fora'");
  proxima = resp(503); const e503 = await api.rpc("nx_inicio").catch(x => x); assert.deepEqual(eventos.splice(0), ["falha:http_503"]); assert.equal(e503.codigo, "http_503");
  proxima = () => { throw new TypeError("Failed to fetch"); }; await api.rpc("nx_inicio").catch(() => {}); assert.deepEqual(eventos.splice(0), ["falha:sem_conexao"]);
  const lenta = mk({ lentoMs: 15 });
  proxima = () => new Promise(r => setTimeout(() => r(resp(200, {})), 60));
  await lenta.rpc("nx_inicio"); assert.deepEqual(eventos.splice(0), ["lento:1", "ok", "lento:-1"], "aos 4 s (aqui 15 ms) conta como lenta e desconta ao terminar");
  proxima = resp(200, {}); await lenta.rpc("nx_inicio"); assert.deepEqual(eventos.splice(0), ["ok"], "chamada rápida nunca conta como lenta");
  const sem = API.criarApi({ url: "https://x.test", chave: "k", fetch: async () => resp(200, {}) });
  await sem.rpc("nx_inicio"); assert.deepEqual(eventos, [], "sem a opção rede nada é reportado");
});

await teste("api.ehLeitura: sufixos e nomes de leitura; escritas e desconhecidas NÃO são leitura", () => {
  for (const n of ["nx_contatos_listar", "nx_negocio_ver", "nx_crm_base", "nx_negocios_kanban", "nx_negocios_coluna", "nx_buscar", "nx_pulso", "nx_app_sessao", "nx_marca_publica", "nx_inicio",
    "nx_rel_vendas", "nx_rel_atendimento", "nx_agenda_dia", "nx_agenda_livres", "nx_cv_base", "nx_cv_listar", "nx_cv_ver", "nx_cv_mensagens", "nx_notificacoes_listar", "nx_dados"]) assert.equal(API.ehLeitura(n), true, n);
  for (const n of ["nx_negocio_salvar", "nx_negocio_mover", "nx_contato_salvar", "nx_tarefa_concluir", "nx_cv_status", "nx_cv_nota", "nx_cv_atribuir", "nx_cv_marcar_lida", "nx_notificacoes_marcar",
    "nx_entrar", "nx_sair", "nx_agenda_marcar", "nx_agenda_desmarcar", "nx_etiqueta_salvar", "nx_algo_novo", ""]) assert.equal(API.ehLeitura(n), false, n || "(vazio)");
});

await teste("app.js: o shell liga rede.js ao api.js, desenha a faixa (aria-live) e o ponto junto ao sino, e expõe ctx.rede.aoVoltar", () => {
  assert.match(APP_JS, /E\.rede = E\.M\.rede\.criarRede\(\{ ping: pingDoSite, sondar: sondarServidor \}\);/);
  assert.match(APP_JS, /rede: E\.rede, contexto: true,/);
  assert.match(APP_JS, /class: "rede-msg", "aria-live": "polite"/);
  assert.match(APP_JS, /class: "rede-ponto", id: "rede-ponto"/);
  assert.match(APP_JS, /Tentar agora/);
  assert.match(APP_JS, /rede: \{\s*get estado\(\) \{ return E\.rede\.estado; \},\s*aoVoltar\(fn\)/);
  assert.match(HTML, /<link rel="modulepreload" href="rede\.js\?v=/, "rede.js é módulo base: preload no index.html");
  const css = ler("shell.css");
  assert.match(css, /\.faixa-rede/);
  assert.match(css, /\.rede-ponto/);
});

await teste("app.js: import() que falhou é refeito com &r=<n> (o navegador guarda a falha da URL) e erro de dependência recarrega a página em vez de repetir em vão", () => {
  assert.match(APP_JS, /const importFalhou = new Map\(\);/);
  assert.match(APP_JS, /const r = n \? "&r=" \+ n : "";\s*try \{ return await import\(`\.\/\$\{nome\}\?v=\$\{encodeURIComponent\(VERSAO\)\}\$\{r\}`\); \}/);
  assert.match(APP_JS, /importFalhou\.set\(nome, n \+ 1\)/);
  assert.match(APP_JS, /ehFalhaDeImport\(e\) \? \(\) => location\.reload\(\) : \(\) => aoMudarRota\(false\)/);
  // a falha de abertura da tela usa o cartão de erro do ui.js (frase em português, sem URL, refaz no orbita:online)
  assert.match(APP_JS, /ui\.erroCartao\(e, \(\) => aoMudarRota\(false\)\)/);
  assert.doesNotMatch(APP_JS, /Recarregue a página\. Se continuar, fale com o suporte\./);
});

/* ============================================================ M15 */
secao("M15 · leituras que insistem, escritas que não duplicam e boot que se recupera");

/** api com fetch simulado, espera instantânea (registra os tempos) e sem sorteio (jitter 0). */
function apiRetentando({ respostas, extra = {} } = {}) {
  const chamadas = [], esperas = [];
  const fila = [...respostas];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body) });
    const r = fila.length > 1 ? fila.shift() : fila[0];
    if (r instanceof Error) throw r;
    const h = new Map(Object.entries(r.headers || {}));
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: k => h.get(String(k).toLowerCase()) ?? null }, text: async () => (r.corpo === undefined ? "" : JSON.stringify(r.corpo)) };
  };
  let t = 1_000_000;
  const api = API.criarApi({ url: "https://x.test", chave: "k", token: () => "tok", cliente: () => "cli", fetch: fetchFalso, retentar: true, aleatorio: () => 0.5,
    agora: () => t, esperar: async ms => { esperas.push(ms); t += ms; }, online: () => true, ...extra });
  return { api, chamadas, esperas, relogio: { avanca: ms => { t += ms; } } };
}
const ok200 = { status: 200, corpo: { v: 1 } };
const s503 = { status: 503 };

await teste("api.js: leitura com 503 + 503 + 200 resolve (2 repetições, 400 ms e 1,2 s) sem mostrar erro", async () => {
  const x = apiRetentando({ respostas: [s503, s503, ok200] });
  assert.deepEqual(await x.api.rpcC("nx_negocios_kanban", { p_funil: "f1" }), { v: 1 });
  assert.equal(x.chamadas.length, 3);
  assert.deepEqual(x.esperas, [400, 1200]);
  assert.deepEqual(x.chamadas[2].corpo, { p_token: "tok", p_cliente: "cli", p_funil: "f1" }, "mesmos parâmetros a cada tentativa");
});

await teste("api.js: leitura que continua falhando para depois da 2ª repetição, com a frase em português e o número de tentativas", async () => {
  const x = apiRetentando({ respostas: [s503] });
  const e = await x.api.rpc("nx_inicio").catch(v => v);
  assert.equal(x.chamadas.length, 3); assert.equal(e.codigo, "http_503"); assert.equal(e.tentativas, 3);
  assert.doesNotMatch(API.mensagemErro(e), /http_|503/);
  const t = apiRetentando({ respostas: [new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), ok200] });
  assert.deepEqual(await t.api.rpc("nx_pulso"), { v: 1 }, "falha de transporte também repete");
});

await teste("api.js: escrita comum NUNCA repete sozinha (503 falha com 1 chamada); erro de negócio e 4xx nunca repetem", async () => {
  const w = apiRetentando({ respostas: [s503, ok200] });
  const e = await w.api.rpcC("nx_negocio_salvar", { p_negocio: { titulo: "x" } }).catch(v => v);
  assert.equal(w.chamadas.length, 1); assert.equal(e.codigo, "http_503"); assert.deepEqual(w.esperas, []);
  const f = apiRetentando({ respostas: [new TypeError("Failed to fetch"), ok200] });
  await f.api.fn("nx-enviar", { acao: "texto" }).catch(() => {}); assert.equal(f.chamadas.length, 1, "função de envio nunca repete");
  for (const r of [{ status: 400, corpo: { message: "limite_plano" } }, { status: 401, corpo: { message: "sessao_invalida" } }, { status: 404, corpo: { message: "x" } }, { status: 500, corpo: { message: "erro_interno" } }]) {
    const x = apiRetentando({ respostas: [r, ok200] });
    await x.api.rpc("nx_inicio").catch(() => {}); assert.equal(x.chamadas.length, 1, `status ${r.status}`);
  }
});

await teste("api.js: {req:true} repete com o MESMO uuid em p_req (e o erro final devolve o uuid para o «Salvar de novo»)", async () => {
  const x = apiRetentando({ respostas: [s503, s503, ok200] });
  assert.deepEqual(await x.api.rpcC("nx_negocio_salvar", { p_negocio: { titulo: "x" } }, { req: true }), { v: 1 });
  assert.equal(x.chamadas.length, 3);
  const reqs = x.chamadas.map(c => c.corpo.p_req);
  assert.match(reqs[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "uuid v4");
  assert.deepEqual([...new Set(reqs)], [reqs[0]], "o mesmo uuid em todas as tentativas");
  const y = apiRetentando({ respostas: [s503] });
  const e = await y.api.rpcC("nx_tarefa_salvar", { p_tarefa: {} }, { req: true }).catch(v => v);
  assert.equal(e.req, y.chamadas[0].corpo.p_req, "o erro carrega o req para repetir com o mesmo uuid");
  assert.equal(y.chamadas.length, 3);
  const z = apiRetentando({ respostas: [ok200] });
  await z.api.rpcC("nx_agenda_marcar", {}, { req: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
  assert.equal(z.chamadas[0].corpo.p_req, "ffffffff-ffff-4fff-8fff-ffffffffffff", "uuid informado pela tela é respeitado");
  const w = apiRetentando({ respostas: [ok200] });
  await w.api.rpcC("nx_negocio_salvar", { p_negocio: {}, p_req: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  assert.equal(w.chamadas[0].corpo.p_req, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const sem = apiRetentando({ respostas: [ok200] });
  await sem.api.rpcC("nx_negocio_salvar", { p_negocio: {} });
  assert.equal("p_req" in sem.chamadas[0].corpo, false, "sem a opção não manda p_req (as funções antigas não conhecem o parâmetro)");
});

await teste("api.js: Retry-After manda na espera; orçamento de ~8 s e offline limitam as repetições; sem a opção retentar nada muda", async () => {
  const a = apiRetentando({ respostas: [{ status: 429, headers: { "retry-after": "2" } }, ok200] });
  await a.api.rpc("nx_inicio"); assert.deepEqual(a.esperas, [2000], "respeita o Retry-After (maior que o recuo)");
  const b = apiRetentando({ respostas: [{ status: 429, headers: { "retry-after": "30" } }, ok200] });
  const eb = await b.api.rpc("nx_inicio").catch(v => v); assert.equal(b.chamadas.length, 1, "30 s estoura o orçamento: não espera, falha"); assert.equal(eb.codigo, "http_429");
  const c = apiRetentando({ respostas: [s503], extra: { retentar: { orcamentoMs: 1000 } } });
  await c.api.rpc("nx_inicio").catch(() => {}); assert.equal(c.chamadas.length, 2, "orçamento de 1 s: cabe o recuo de 400 ms, não o de 1,2 s");
  const off = apiRetentando({ respostas: [new TypeError("Failed to fetch"), ok200], extra: { online: () => false } });
  const eo = await off.api.rpc("nx_inicio").catch(v => v); assert.equal(off.chamadas.length, 1, "offline não gasta repetição: o rede.js cuida da volta"); assert.equal(eo.codigo, "sem_conexao");
  const legado = API.criarApi({ url: "https://x.test", chave: "k", fetch: async () => ({ ok: false, status: 503, text: async () => "" }) });
  const el = await legado.rpc("nx_inicio").catch(v => v); assert.equal(el.codigo, "http_503", "sem retentar o cliente é o de sempre");
  assert.equal(API.lerRetryAfter("120"), 120000); assert.equal(API.lerRetryAfter(""), null); assert.equal(API.lerRetryAfter("amanhã"), null);
  assert.equal(API.lerRetryAfter(new Date(1_005_000).toUTCString(), 1_000_000), 5000);
});

await teste("api.js: o rede.js só recebe o resultado FINAL (503 + 200 não vira 'servidor fora'); falha final vira uma falha só", async () => {
  const ev = [];
  const rede = { sucesso: () => ev.push("ok"), falha: i => ev.push("falha:" + i.codigo), lento: d => ev.push("lento:" + d) };
  const a = apiRetentando({ respostas: [s503, ok200], extra: { rede } });
  await a.api.rpc("nx_inicio"); assert.deepEqual(ev.splice(0), ["ok"], "a primeira falha não piscou 'servidor indisponível'");
  const b = apiRetentando({ respostas: [s503], extra: { rede } });
  await b.api.rpc("nx_inicio").catch(() => {}); assert.deepEqual(ev.splice(0), ["falha:http_503"]);
});

await teste("api.js: sessao_invalida — leitura espera a pessoa entrar de novo e repete com o token novo; escrita falha na hora; cancelou = erro", async () => {
  let token = "velho", liberar = null;
  const respostas = (url, init) => (JSON.parse(init.body).p_token === "velho" ? { status: 401, corpo: { message: "sessao_invalida" } } : { status: 200, corpo: { v: 2 } });
  const chamadas = [];
  const fetchFalso = async (url, init) => { const r = respostas(url, init); chamadas.push(JSON.parse(init.body).p_token); return { ok: r.status === 200, status: r.status, headers: { get: () => null }, text: async () => JSON.stringify(r.corpo) }; };
  let avisos = 0;
  const mk = decisao => API.criarApi({ url: "https://x.test", chave: "k", token: () => token, fetch: fetchFalso, retentar: true,
    aoSessaoInvalida: () => { avisos++; return decisao(); } });
  const api = mk(() => new Promise(r => { liberar = r; }));
  let resolvida = false;
  const leitura = api.rpc("nx_app_sessao").then(v => { resolvida = true; return v; });
  await new Promise(r => setImmediate(r));
  assert.equal(resolvida, false, "a leitura fica esperando enquanto a janela de login está aberta");
  token = "novo"; liberar(true);
  assert.deepEqual(await leitura, { v: 2 });
  assert.deepEqual(chamadas, ["velho", "novo"], "repetiu com o token novo");
  token = "velho"; chamadas.length = 0; avisos = 0;
  const w = mk(() => new Promise(() => {}));
  const e = await w.rpc("nx_negocio_salvar", {}).catch(v => v);
  assert.equal(e.codigo, "sessao_invalida"); assert.equal(avisos, 1); assert.deepEqual(chamadas, ["velho"], "escrita não espera nem repete");
  const c = mk(async () => false);
  const ec = await c.rpc("nx_inicio").catch(v => v);
  assert.equal(ec.codigo, "sessao_invalida", "cancelou o login: o erro sobe");
  token = "velho";
  const d = mk(async () => true);
  assert.equal((await d.rpc("nx_inicio").catch(v => v)).codigo, "sessao_invalida", "entrou mas continua inválido: não entra em laço");
});

await teste("revisão R119: {keepalive: true} em rpc, rpcC e fn sai com keepalive no fetch, em UMA tentativa (nem leitura nem {req} repetem); sem a opção nada muda", async () => {
  const inits = [];
  const fetchFalso = async (url, init) => { inits.push({ url, init }); return { ok: false, status: 503, headers: { get: () => null }, text: async () => "" }; };
  let pediuLogin = 0;
  const api = API.criarApi({ url: "https://x.test", chave: "k", token: () => "tok", cliente: () => "cli", fetch: fetchFalso, retentar: true, aleatorio: () => 0.5,
    esperar: async () => {}, online: () => true, aoSessaoInvalida: () => { pediuLogin++; return new Promise(() => {}); } });
  const e1 = await api.rpcC("nx_negocio_mover", { p_id: 7 }, { keepalive: true, req: true }).catch(e => e);
  assert.equal(inits.length, 1, "escrita com {req} normalmente repete; saindo da página, não"); assert.equal(inits[0].init.keepalive, true);
  assert.equal(JSON.parse(inits[0].init.body).p_cliente, "cli"); assert.equal(e1.status, 503);
  inits.length = 0;
  await api.rpc("nx_pulso", {}, { keepalive: true }).catch(e => e);
  assert.equal(inits.length, 1, "leitura normalmente repete; com keepalive, uma só"); assert.equal(inits[0].init.keepalive, true);
  inits.length = 0;
  await api.fn("nx-enviar", { acao: "lido" }, { keepalive: true }).catch(e => e);
  assert.equal(inits.length, 1); assert.equal(inits[0].init.keepalive, true); assert.match(inits[0].url, /\/functions\/v1\/nx-enviar$/);
  inits.length = 0;
  await api.rpcC("nx_negocios_kanban", {}).catch(e => e); await api.rpcC("nx_negocio_mover", { p_id: 7 }, { keepalive: false }).catch(e => e); await api.fn("nx-enviar", { acao: "lido" }).catch(e => e);
  assert.equal(inits.length, 5, "sem a opção: a leitura repete 2 vezes, a escrita e a função não");
  assert.ok(inits.every(x => !("keepalive" in x.init)), "e o fetch sai como sempre saiu");
  // sessão caída com a página saindo: não fica esperando a pessoa entrar de novo
  const caida = API.criarApi({ url: "https://x.test", chave: "k", token: () => "tok", cliente: () => "cli", retentar: true,
    fetch: async () => ({ ok: false, status: 400, headers: { get: () => null }, text: async () => JSON.stringify({ message: "sessao_invalida" }) }), aoSessaoInvalida: () => { pediuLogin++; return new Promise(() => {}); } });
  const e2 = await Promise.race([caida.rpc("nx_pulso", {}, { keepalive: true }).catch(e => e), new Promise(r => setTimeout(() => r("travou"), 80))]);
  assert.equal(e2.codigo, "sessao_invalida", "a leitura com keepalive não espera o login");
});

await teste("revisão R119: rpcC lê a empresa UMA vez — a repetição depois de trocar de empresa manda (e guarda no cache) a empresa do pedido original", async () => {
  let cli = "empresa-x";
  const x = apiRetentando({ respostas: [s503, ok200], extra: { cliente: () => cli } });
  const esperarOriginal = x.esperas;
  const p = x.api.rpcC("nx_crm_base", {});
  cli = "empresa-y";                                         // a pessoa trocou de empresa durante a espera da repetição
  assert.deepEqual(await p, { v: 1 });
  assert.equal(x.chamadas.length, 2); assert.equal(esperarOriginal.length, 1);
  assert.deepEqual(x.chamadas.map(c => c.corpo.p_cliente), ["empresa-x", "empresa-x"], "a repetição não busca os dados da outra empresa");
  // com cache: corpo e chave com a MESMA empresa
  let cli2 = "e1"; const gravadas = [];
  const cache = { cacheavel: () => true, chaveDe: (n, pp, o) => `${o.conta}:${o.cliente}:${n}`, ler: async () => null, gravar: async k => { gravadas.push(k); return true; } };
  const corpos = [];
  const api = API.criarApi({ url: "https://x.test", chave: "k", token: () => "t", cliente: () => cli2, conta: () => "c1", cache,
    fetch: async (u, init) => { corpos.push(JSON.parse(init.body)); cli2 = "e2"; return { ok: true, status: 200, headers: { get: () => null }, text: async () => "{}" }; } });
  await api.rpcC("nx_crm_base", {}, { cache: true });
  await new Promise(r => setImmediate(r));
  assert.equal(corpos[0].p_cliente, "e1"); assert.deepEqual(gravadas, ["c1:e1:nx_crm_base"], "gravou na chave da empresa que pediu");
});

await teste("rede.repetirAbertura: refaz só a etapa que falhou (2, 4, 8, 16, 16 s…), erro de conta sobe na hora e o laço tem limite", async () => {
  const esperas = [], falhas = [];
  let n = 0;
  const r = await REDE.repetirAbertura(async () => { n++; if (n < 4) throw Object.assign(new Error("x"), { codigo: "http_503" }); return "aberta"; },
    { esperar: async s => { esperas.push(s); }, aoFalha: (e, i, s) => falhas.push([e.codigo, i, s]) });
  assert.equal(r, "aberta"); assert.deepEqual(esperas, [2, 4, 8]); assert.deepEqual(falhas, [["http_503", 0, 2], ["http_503", 1, 4], ["http_503", 2, 8]]);
  esperas.length = 0; n = 0;
  await REDE.repetirAbertura(async () => { n++; if (n < 7) throw new Error("y"); return 1; }, { esperar: async s => { esperas.push(s); }, maximo: 20 });
  assert.deepEqual(esperas, [2, 4, 8, 16, 16, 16], "depois de 16 s continua de 16 em 16");
  for (const codigo of ["sessao_invalida", "conta_pendente", "conta_suspensa", "sem_acesso"]) {
    let chamou = 0;
    await assert.rejects(REDE.repetirAbertura(async () => { chamou++; throw Object.assign(new Error(codigo), { codigo }); }, { esperar: async () => { throw new Error("não devia esperar"); } }), e => e.codigo === codigo);
    assert.equal(chamou, 1, codigo);
  }
  let tentou = 0;
  await assert.rejects(REDE.repetirAbertura(async () => { tentou++; throw new Error("sempre"); }, { esperar: async () => {}, maximo: 3 }), /sempre/);
  assert.equal(tentou, 3, "limite de tentativas");
  for (const c of ["sem_conexao", "http_503", "tempo_rede", "erro_interno", undefined]) assert.equal(REDE.erroDeConta({ codigo: c }), false, String(c));
  assert.deepEqual([...REDE.ESPERAS_ABERTURA], [2000, 4000, 8000, 16000]);
});

await teste("app.js: o boot repete sozinho (módulos e sessão), mostra o tempo que falta, «Sair» só em erro de conta e a api nasce com retentar", () => {
  assert.match(APP_JS, /const ESPERAS_ABERTURA = \[2000, 4000, 8000, 16000\];/, "as mesmas esperas do rede.js (a etapa dos módulos roda antes dele carregar)");
  assert.match(APP_JS, /Tentando de novo em \$\{Math\.max\(restam, 0\)\} s…/);
  assert.match(APP_JS, /E\.M\.rede\.repetirAbertura\(/);
  assert.match(APP_JS, /sair: E\.M\.rede\.erroDeConta\(e\)/, "«Sair» só aparece em erro de conta/sessão");
  assert.match(APP_JS, /rede: E\.rede, contexto: true, retentar: true,/);
  assert.match(APP_JS, /arqRaiz\("dados\.js"\)/, "dados.js também ganha a memória de falhas de import()");
  assert.doesNotMatch(APP_JS, /bootMsg\(E\.api\.mensagemErro\(e\), true\)/, "o erro da sessão não oferece mais «Sair» sem critério");
  const boot = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.doesNotMatch(boot, /Sair/, "iniciar() não apaga o token por erro de rede");
  const html = HTML;
  assert.match(html, /id="boot-tentar"/); assert.match(html, /id="boot-sair"/);
});

/* ============================================================ M17 */
secao("M17 · sessão que não derruba o trabalho e rascunhos que sobrevivem");

const RASC = await imp("rascunho.js");

function storageFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
/** textarea de mentira com ouvintes e um pai que sabe inserir o selo. */
function campoFalso({ tag = "TEXTAREA", tipo = "textarea", valor = "", atributos = {}, ancestrais = [] } = {}) {
  const ouv = {}; const irmaos = [];
  const c = { tagName: tag, type: tipo, value: valor, isContentEditable: false, disparos: 0, ouv,
    addEventListener(e, f) { (ouv[e] ||= []).push(f); }, removeEventListener(e, f) { ouv[e] = (ouv[e] || []).filter(x => x !== f); },
    dispatchEvent(ev) { c.disparos++; (ouv[ev.type] || []).forEach(f => f(ev)); return true; },
    hasAttribute: a => a in atributos, getAttribute: a => atributos[a] ?? null,
    closest: sel => (sel === "[data-segredo]" && ancestrais.includes("data-segredo") ? {} : null),
    parentNode: { filhos: irmaos, insertBefore(el) { irmaos.push(el); } },
    digitar(txt) { c.value = txt; (ouv.input || []).forEach(f => f({ type: "input", isTrusted: true })); } };
  return c;
}
function docFalso() {
  const el = tag => { const e = { tag, className: "", filhos: [], attrs: {}, ouv: {}, setAttribute(k, v) { e.attrs[k] = v; }, appendChild(f) { e.filhos.push(f); return f; }, addEventListener(ev, f) { e.ouv[ev] = f; }, clique() { e.ouv.click && e.ouv.click(); } }; return e; };
  const ouv = {};
  return { visibilityState: "visible", createElement: el, createTextNode: t => ({ texto: t }), addEventListener: (e, f) => { ouv[e] = f; }, ouv,
    textoDoSelo: s => s.filhos.map(f => f.texto ?? f.textContent).join("") };
}
function novoRasc({ storage = storageFalso(), conta = "conta-1", cliente = "cli-1", rel = relogioFalso(), extra = {} } = {}) {
  const doc = docFalso();
  const r = RASC.criarRascunhos({ storage, conta: () => conta, cliente: () => cliente, agora: rel.agora, agendar: rel.agendar, cancelar: rel.cancelar, doc, janela: { addEventListener() {} }, ...extra });
  return { r, storage, rel, doc };
}

await teste("rascunho.js: nunca guarda senha, chave de API ou data-segredo (campo, ancestral, autocomplete) nem tipos que não são texto", async () => {
  const x = novoRasc();
  const proibidos = [campoFalso({ tag: "INPUT", tipo: "password" }), campoFalso({ atributos: { "data-segredo": "" } }), campoFalso({ ancestrais: ["data-segredo"] }),
    campoFalso({ tag: "INPUT", tipo: "text", atributos: { autocomplete: "current-password" } }), campoFalso({ tag: "INPUT", tipo: "text", atributos: { autocomplete: "new-password" } }),
    campoFalso({ tag: "INPUT", tipo: "hidden" }), campoFalso({ tag: "INPUT", tipo: "file" }), campoFalso({ tag: "INPUT", tipo: "checkbox" }), campoFalso({ tag: "DIV" }), null];
  for (const c of proibidos) {
    assert.equal(RASC.campoPermitido(c), false);
    const ctl = x.r.ligar(c, "qualquer"); if (c) c.digitar && c.digitar("minha-senha-123");
    await x.rel.andar(1000);
    assert.equal(ctl.restaurado, false);
  }
  assert.equal(x.storage.m.size, 0, "nada foi para o armazenamento");
  assert.equal(RASC.campoPermitido(campoFalso()), true);
  assert.equal(RASC.campoPermitido(campoFalso({ tag: "INPUT", tipo: "text" })), true);
  assert.equal(RASC.campoPermitido(campoFalso({ tag: "INPUT", tipo: "search" })), true);
});

await teste("rascunho.js: grava com debounce de 400 ms (só o último texto) e apaga quando o campo esvazia", async () => {
  const x = novoRasc();
  const c = campoFalso(); x.r.ligar(c, "conversa:901");
  c.digitar("Olá"); await x.rel.andar(300); assert.equal(x.storage.m.size, 0, "antes de 400 ms nada é gravado");
  c.digitar("Olá, tudo bem?"); await x.rel.andar(399); assert.equal(x.storage.m.size, 0, "digitar de novo reinicia o relógio");
  await x.rel.andar(2);
  const [[k, v]] = [...x.storage.m.entries()];
  assert.equal(k, "nx-rasc:conta-1:cli-1:conversa:901"); assert.equal(JSON.parse(v).t, "Olá, tudo bem?");
  c.digitar("   "); await x.rel.andar(500); assert.equal(x.storage.m.size, 0, "texto vazio apaga o rascunho");
});

await teste("rascunho.js: restaura ao voltar, mostra «Rascunho restaurado · descartar», dispara input sem tratar como digitação e respeita campo já preenchido", async () => {
  const st = storageFalso();
  const a = novoRasc({ storage: st }); const c1 = campoFalso(); a.r.ligar(c1, "nota:7"); c1.digitar("Retornar a ligação amanhã"); await a.rel.andar(500);
  const b = novoRasc({ storage: st, rel: a.rel }); const c2 = campoFalso();
  const ctl = b.r.ligar(c2, "nota:7");
  assert.equal(ctl.restaurado, true); assert.equal(c2.value, "Retornar a ligação amanhã"); assert.equal(c2.disparos, 1, "o módulo é avisado por um evento input");
  assert.equal(c2.parentNode.filhos.length, 1); const selo = c2.parentNode.filhos[0];
  assert.equal(b.doc.textoDoSelo(selo), "Rascunho restaurado · descartar"); assert.equal(selo.attrs.role, "status");
  assert.equal(st.m.size, 1, "restaurar não apaga: só o envio confirmado apaga");
  selo.filhos[1].clique();                                   // descartar
  assert.equal(c2.value, ""); assert.equal(st.m.size, 0); assert.equal(c2.parentNode.filhos.length, 1, "(o selo some do DOM de verdade na tela; aqui o pai falso só acumula)");
  const d = novoRasc({ storage: st, rel: a.rel }); a.r.ligar(campoFalso(), "nota:8");
  const cheio = campoFalso({ valor: "texto que já estava lá" });
  st.setItem("nx-rasc:conta-1:cli-1:nota:9", JSON.stringify({ t: "rascunho antigo", em: a.rel.agora() }));
  assert.equal(d.r.ligar(cheio, "nota:9").restaurado, false); assert.equal(cheio.value, "texto que já estava lá", "campo com texto não é sobrescrito");
});

await teste("rascunho.js: apagar() só quando o servidor confirma; digitar depois de restaurar tira o selo; escopo por conta e empresa", async () => {
  const st = storageFalso();
  const a = novoRasc({ storage: st }); const c = campoFalso(); const ctl = a.r.ligar(c, "cv:1"); c.digitar("rascunho A"); await a.rel.andar(500);
  assert.equal(a.r.existe("cv:1"), true);
  ctl.apagar(); assert.equal(st.m.size, 0); assert.equal(a.r.existe("cv:1"), false);
  const w = novoRasc({ storage: st, rel: a.rel }); const c1 = campoFalso(); w.r.ligar(c1, "cv:2"); c1.digitar("segredo da conta 1"); await w.rel.andar(500);
  const outraConta = novoRasc({ storage: st, rel: a.rel, conta: "conta-2" }); const c2 = campoFalso();
  assert.equal(outraConta.r.ligar(c2, "cv:2").restaurado, false, "outra conta não vê o rascunho");
  const outraEmpresa = novoRasc({ storage: st, rel: a.rel, cliente: "cli-2" }); const c3 = campoFalso();
  assert.equal(outraEmpresa.r.ligar(c3, "cv:2").restaurado, false, "outra empresa também não");
  const mesma = novoRasc({ storage: st, rel: a.rel }); const c4 = campoFalso(); mesma.r.ligar(c4, "cv:2");
  assert.equal(c4.parentNode.filhos.length, 1); c4.digitar("novo texto"); assert.equal(c4.disparos, 1);
  mesma.r.apagar("cv:2"); assert.equal(mesma.r.existe("cv:2"), false);
});

await teste("rascunho.js: TTL de 7 dias, teto de ~200 KB no total (o mais antigo sai) e ~100 KB por rascunho", async () => {
  const x = novoRasc(); const dia = 24 * 3600 * 1000;
  const c = campoFalso(); x.r.ligar(c, "velho"); c.digitar("rascunho antigo"); await x.rel.andar(500);
  await x.rel.andar(6 * dia); assert.equal(x.r.existe("velho"), true, "6 dias: ainda vale");
  await x.rel.andar(1 * dia + 1000); assert.equal(x.r.existe("velho"), false, "passou de 7 dias: venceu");
  x.r.varrer(); assert.equal(x.storage.m.size, 0, "e a varredura apaga do armazenamento");
  const grande = "x".repeat(45 * 1024);                      // ~90 KB em UTF-16
  for (let i = 0; i < 4; i++) { const f = campoFalso(); x.r.ligar(f, `g${i}`); f.digitar(grande); await x.rel.andar(500); await x.rel.andar(1000); }
  let total = 0; for (const [k, v] of x.storage.m) total += (k.length + v.length) * 2;
  assert.ok(total <= RASC.TETO_TOTAL_BYTES, `total ${total} ≤ ${RASC.TETO_TOTAL_BYTES}`);
  assert.equal(x.r.existe("g3"), true, "o mais novo fica"); assert.equal(x.r.existe("g0"), false, "o mais antigo saiu para caber");
  const enorme = campoFalso(); x.r.ligar(enorme, "enorme"); enorme.digitar("y".repeat(60 * 1024)); await x.rel.andar(500);
  assert.equal(x.r.existe("enorme"), false, "rascunho acima de ~100 KB não é guardado");
});

await teste("rascunho.js: logout apaga tudo (de qualquer conta); salvarTudo e esconder a aba gravam o que estava no debounce; pendentes() = mexidos há menos de 10 min", async () => {
  const x = novoRasc(); const c = campoFalso(); x.r.ligar(c, "a"); c.digitar("não deu tempo do debounce");
  assert.equal(x.storage.m.size, 0); x.doc.visibilityState = "hidden"; x.doc.ouv.visibilitychange(); assert.equal(x.storage.m.size, 1, "esconder a aba grava na hora");
  assert.equal(x.r.pendentes(), 1);
  await x.rel.andar(11 * 60 * 1000); assert.equal(x.r.pendentes(), 0, "rascunho velho não segura a atualização automática");
  const o = novoRasc({ storage: x.storage, rel: x.rel, conta: "conta-2" }); const c2 = campoFalso(); o.r.ligar(c2, "b"); c2.digitar("de outra conta"); await o.rel.andar(500);
  assert.equal(x.storage.m.size, 2);
  x.storage.setItem("outra-coisa", "não é rascunho");
  x.r.apagarTudo();
  assert.deepEqual([...x.storage.m.keys()], ["outra-coisa"], "só some o que tem o prefixo nx-rasc:");
});

await teste("rascunho.js: sem armazenamento ou com armazenamento que lança erro (janela anônima, cota cheia) nada quebra", async () => {
  const sem = novoRasc({ storage: null }); const c = campoFalso(); const ctl = sem.r.ligar(c, "x"); c.digitar("texto"); await sem.rel.andar(500);
  assert.equal(ctl.restaurado, false); assert.equal(sem.r.existe("x"), false); assert.equal(sem.r.pendentes(), 0); sem.r.apagarTudo();
  const explode = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); }, removeItem() { throw new Error("x"); }, key() { throw new Error("x"); }, get length() { throw new Error("x"); } };
  const e = novoRasc({ storage: explode }); const c2 = campoFalso(); e.r.ligar(c2, "y"); c2.digitar("texto"); await e.rel.andar(500);
  e.r.apagar("y"); e.r.apagarTudo(); e.r.salvarTudo();
  assert.equal(e.r.existe("y"), false);
  const cheia = storageFalso(); let n = 0; const orig = cheia.setItem; cheia.setItem = (k, v) => { if (n++ === 0) throw new Error("QuotaExceededError"); orig(k, v); };
  const q = novoRasc({ storage: cheia }); const c3 = campoFalso(); q.r.ligar(c3, "z"); c3.digitar("tenta de novo uma vez"); await q.rel.andar(500);
  assert.equal(q.r.existe("z"), true, "cota cheia: limpa o mais velho e tenta mais uma vez");
});

await teste("app.js (M17): sessão expirada abre a janela sem desmontar a tela; outra conta limpa tudo; logout apaga os rascunhos; ctx.rascunho e rascunho.js entram no boot", () => {
  const pedir = /async function pedirLoginNaTela\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.doesNotMatch(pedir, /desmontarAtual\(|ui\.limpar\(/, "a tela e o que foi digitado ficam como estão");
  assert.match(pedir, /titulo: "Sua sessão expirou"/); assert.match(pedir, /valor: antes\.email/, "e-mail preenchido");
  assert.match(pedir, /nova\.conta\.id !== antes\.id\) return "outra"/);
  assert.match(pedir, /if \(r === "outra"\) \{\s*if \(E\.rascunhos\) E\.rascunhos\.apagarTudo\(\);/);
  assert.match(pedir, /E\.M\.dados\.guardarToken\(r2\.token\)/);
  const caiu = /function sessaoCaiu\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(caiu, /if \(!E\.sessao\) \{ sessaoCaiuTotal\(\); return false; \}/, "na abertura (sem sessão) segue o caminho antigo");
  assert.match(caiu, /loginPendente = pedirLoginNaTela\(\)/, "várias leituras que falham dividem UMA janela");
  assert.match(/async function sair\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0], /E\.rascunhos\.apagarTudo\(\)/);
  assert.match(APP_JS, /rascunho: \{\s*ligar: \(campo, chave, opcoes\) => E\.rascunhos\.ligar\(campo, chave, opcoes\),\s*apagar: chave => E\.rascunhos\.apagar\(chave\),/);
  assert.match(APP_JS, /if \(E\.rascunhos && E\.rascunhos\.pendentes\(\) > 0\) return true;/, "rascunho recente segura a atualização automática");
  assert.match(APP_JS, /const MODULOS_BASE = \[[^\]]*"rascunho\.js"/);
  assert.match(HTML, /<link rel="modulepreload" href="rascunho\.js\?v=/);
  assert.match(ler("api.js"), /sessao_invalida: "Sua sessão expirou\. Entre para continuar; o que você digitou fica guardado\."/);
});

await teste("migração 20261002b (M17): aditiva e idempotente; nx_app_sessao renova só com < 20 dias e só o que nx_conta_do_token aceitou; smoke 16 existe", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20261002b_sessao_pulso_push.sql"), "utf8");
  const semComentario = sql.replace(/^\s*--.*$/gm, "");
  assert.match(semComentario, /create or replace function public\.nx_app_sessao\(p_token text\)/);
  assert.match(semComentario, /update public\.nx_sessoes set expira_em = now\(\) \+ interval '30 days'\s*where token_hash = public\.nx_hash\(p_token\) and expira_em < now\(\) \+ interval '20 days';/);
  assert.match(semComentario, /c public\.nx_contas := public\.nx_conta_do_token\(p_token\)/, "continua validando o token antes de qualquer escrita");
  assert.doesNotMatch(semComentario, /\bdrop\b|\bdelete\s+from\b|\btruncate\b|alter\s+table\s+\S+\s+drop/i, "aditiva: nada de drop, delete nem truncate");
  assert.doesNotMatch(semComentario, /\b(update|insert\s+into|delete\s+from)\s+public\.nx_config\b/i, "e nenhuma escrita em nx_config (a leitura do saas_url já era do corpo original)");
  const smoke = readFileSync(join(RAIZ, "supabase/testes/16_sessao_pulso_push.sql"), "utf8");
  assert.match(smoke, /^begin;/m); assert.match(smoke, /^rollback;/m); assert.match(smoke, /OK_16_SESSAO_PULSO_PUSH/);
  for (const caso of ["faltando 10 dias", "faltando 25 dias", "sessão vencida", "outra conta", "ociosa"]) assert.ok(smoke.includes(caso), `smoke cobre: ${caso}`);
});

await teste("rascunho.js: apagarTudo (logout, outra conta) desliga os campos — um flush depois (esconder a aba, pagehide) não ressuscita o que foi apagado", async () => {
  const x = novoRasc(); const c = campoFalso(); x.r.ligar(c, "cv:5"); c.digitar("vai sumir no logout"); await x.rel.andar(500);
  c.digitar("e este texto estava no debounce");
  x.r.apagarTudo();
  assert.equal(x.storage.m.size, 0);
  x.r.salvarTudo(); x.doc.visibilityState = "hidden"; x.doc.ouv.visibilitychange(); await x.rel.andar(1000);
  assert.equal(x.storage.m.size, 0, "nada voltou para o armazenamento");
  c.digitar("digitou depois do logout"); await x.rel.andar(1000);
  assert.equal(x.storage.m.size, 0, "e o campo desligado não grava mais");
});

/* ============================================================ M16 */
secao("M16 · telas que abrem com o último dado (cache.js)");

const CACHE = await imp("cache.js");
const ROTAS_MOD = await imp("rotas.js");

function armazemFalso({ quebra = false } = {}) {
  const m = new Map();
  const falha = () => { if (quebra) throw new Error("IndexedDB indisponível"); };
  return { m, ler: async k => { falha(); return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; }, gravar: async (k, v) => { falha(); m.set(k, JSON.parse(JSON.stringify({ k, ...v }))); return true; },
    apagar: async k => { falha(); m.delete(k); return true; }, limpar: async () => { falha(); m.clear(); return true; } };
}

await teste("cache.js: lista branca — só leituras seguras; nunca mensagem, configuração, Admin, segredo, convite, domínio, usuário", () => {
  for (const n of ["nx_app_sessao", "nx_inicio", "nx_crm_base", "nx_negocios_kanban", "nx_negocios_coluna", "nx_contatos_listar", "nx_empresas_listar", "nx_tarefas_listar", "nx_agenda_dia",
    "nx_rel_vendas", "nx_rel_atendimento", "nx_dados", "nx_cv_listar", "nx_marca_publica"]) assert.equal(CACHE.cacheavel(n), true, n);
  for (const n of ["nx_cv_mensagens", "nx_cv_buscar_msgs", "nx_cv_ver", "nx_cv_base", "nx_cv_config_salvar", "nx_ia_config_salvar", "nx_agenda_config_ver", "nx_usuarios_listar", "nx_clientes_admin", "nx_orgs_listar",
    "nx_dominios_listar", "nx_planos_listar", "nx_canais_listar", "nx_entrada_chave", "nx_integracoes_status", "nx_buscar", "nx_notificacoes_listar", "nx_contato_ver", "nx_negocio_ver", "nx_convite_criar",
    "nx_senha_redefinir", "nx_entrar", "nx_sair", "nx_negocio_salvar", "nx_automacoes_listar", "", undefined]) assert.equal(CACHE.cacheavel(n), false, String(n));
  // defesa em profundidade: mesmo que alguém ponha um nome perigoso na lista, o filtro de palavras segura
  for (const n of ["nx_x_config", "nx_admin_dados", "nx_cv_mensagens", "nx_chave_listar", "nx_token_ver", "nx_usuarios", "nx_convite_listar"]) assert.match(n, CACHE.PROIBIDO, n);
});

await teste("cache.js: a chave leva conta, empresa, RPC e os parâmetros (em qualquer ordem); token, empresa e p_req não entram no hash", () => {
  const k = (p, e = {}) => CACHE.chaveDe("nx_negocios_kanban", p, { conta: "c1", cliente: "e1", ...e });
  assert.equal(k({ p_funil: "f1", p_busca: "x" }), k({ p_busca: "x", p_funil: "f1" }), "ordem dos parâmetros não muda a chave");
  assert.notEqual(k({ p_funil: "f1" }), k({ p_funil: "f2" }));
  assert.equal(k({ p_funil: "f1", p_token: "t", p_cliente: "e1", p_req: "r" }), k({ p_funil: "f1" }), "token, p_cliente e p_req ficam de fora");
  assert.notEqual(k({}, { conta: "c2" }), k({}), "outra conta = outra chave");
  assert.notEqual(k({}, { cliente: "e2" }), k({}), "outra empresa = outra chave");
  assert.match(k({}), /^c1:e1:nx_negocios_kanban:[0-9a-f]{8}$/);
  assert.equal(CACHE.chaveDe("nx_app_sessao", {}, { conta: "c1" }), CACHE.chaveDe("nx_app_sessao", {}, { conta: "c1", cliente: null }));
  assert.match(CACHE.chaveDe("nx_marca_publica", { p_host: "x" }), /^-:-:nx_marca_publica:/);
  assert.equal(CACHE.estavel({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
});

await teste("cache.js: guarda e devolve com a hora; vence em 12 h; ignora formato de outra versão; resposta enorme não fica; só cacheável", async () => {
  let t = 5_000_000; const arm = armazemFalso();
  const c = CACHE.criarCache({ armazem: arm, agora: () => t });
  const k = CACHE.chaveDe("nx_inicio", {}, { conta: "c", cliente: "e" });
  assert.equal(await c.ler(k), null, "vazio");
  assert.equal(await c.gravar(k, "nx_inicio", { n: 1 }), true);
  assert.deepEqual(await c.ler(k), { dados: { n: 1 }, em: 5_000_000 });
  t += 12 * 3600 * 1000 - 1; assert.ok(await c.ler(k), "11h59: ainda vale");
  t += 2; assert.equal(await c.ler(k), null, "passou de 12 h: vence"); assert.equal(arm.m.size, 0, "e some do armazém");
  assert.equal(await c.gravar("x", "nx_cv_mensagens", { corpo: "oi" }), false, "mensagem nunca"); assert.equal(arm.m.size, 0);
  assert.equal(await c.gravar("y", "nx_inicio", { grande: "z".repeat(600 * 1024) }), false, "> 1 MB não fica");
  arm.m.set("v2", { k: "v2", v: 99, em: t, dados: { x: 1 } }); assert.equal(await c.ler("v2"), null, "formato de outra versão é ignorado");
  const circular = {}; circular.a = circular; assert.equal(await c.gravar("c", "nx_inicio", circular), false, "não serializável não quebra");
});

await teste("cache.js: a lista de conversas só leva nome, prévia de até 80 caracteres e contadores (nada de mensagens)", async () => {
  const c = CACHE.criarCache({ armazem: armazemFalso() });
  const longa = "Olá, tudo bem? ".repeat(20);
  const dados = { itens: [{ id: 1, contato: { nome: "Mariana" }, ultima_msg_resumo: longa, mensagens: [{ corpo: "segredo" }], ultimas_mensagens: [1], nao_lidas: 2 }], contagens: { minhas: 1, nao_lidas: 2 }, tem_mais: false };
  const k = CACHE.chaveDe("nx_cv_listar", { p_filtro: { aba: "abertas" } }, { conta: "c", cliente: "e" });
  await c.gravar(k, "nx_cv_listar", dados);
  const lido = (await c.ler(k)).dados;
  assert.ok(lido.itens[0].ultima_msg_resumo.length <= 80, "prévia até 80 caracteres"); assert.match(lido.itens[0].ultima_msg_resumo, /…$/);
  assert.equal(lido.itens[0].mensagens, undefined); assert.equal(lido.itens[0].ultimas_mensagens, undefined);
  assert.equal(lido.itens[0].contato.nome, "Mariana"); assert.deepEqual(lido.contagens, { minhas: 1, nao_lidas: 2 });
  assert.equal(JSON.stringify(lido).includes("segredo"), false);
  assert.equal(dados.itens[0].mensagens.length, 1, "o objeto original não foi alterado");
});

await teste("cache.js: limpar() apaga tudo (nx_sair, queda de sessão, troca de conta); armazém que falha vira cache só em memória", async () => {
  const arm = armazemFalso(); const c = CACHE.criarCache({ armazem: arm });
  await c.gravar("a", "nx_inicio", { n: 1 }); await c.gravar("b", "nx_crm_base", { n: 2 });
  assert.equal(arm.m.size, 2);
  await c.limpar(); assert.equal(arm.m.size, 0); assert.equal(await c.ler("a"), null, "nem na memória");
  const q = CACHE.criarCache({ armazem: armazemFalso({ quebra: true }) });
  assert.equal(await q.gravar("a", "nx_inicio", { n: 1 }), true); assert.deepEqual((await q.ler("a")).dados, { n: 1 }, "IndexedDB indisponível: fica na memória desta aba");
  await q.limpar(); assert.equal(await q.ler("a"), null);
  const sem = CACHE.criarCache({ armazem: null }); await sem.gravar("a", "nx_inicio", { n: 1 }); assert.ok(await sem.ler("a"));
  assert.equal(CACHE.criarArmazemIDB(undefined) === null || typeof CACHE.criarArmazemIDB(undefined) === "object", true);
  assert.equal(CACHE.criarArmazemIDB({}), null, "sem indexedDB.open não há armazém");
});

/** api com cache de mentira e rede programável. */
function apiComCache({ rede, cacheado = null, esperaCache = 0, extra = {} }) {
  const eventos = [], chamadas = [];
  const cache = { cacheavel: CACHE.cacheavel, chaveDe: CACHE.chaveDe,
    ler: async k => { chamadas.push("ler:" + k); if (esperaCache) await new Promise(r => setTimeout(r, esperaCache)); return cacheado; },
    gravar: async (k, n, d) => { chamadas.push("gravar:" + n); eventos.push("gravou"); return true; } };
  const fetchFalso = async () => { const r = await rede(); if (r instanceof Error) throw r; return { ok: r.status === 200, status: r.status, headers: { get: () => null }, text: async () => JSON.stringify(r.corpo ?? {}) }; };
  const api = API.criarApi({ url: "https://x.test", chave: "k", token: () => "t", cliente: () => "e1", conta: () => "c1", cache, fetch: fetchFalso, contexto: true, aoCache: ev => eventos.push("selo:" + ev.fase + (ev.ok === false ? ":falhou" : "")), ...extra });
  return { api, eventos, chamadas };
}

await teste("cache.js: IndexedDB travado tem prazo curto, cache degrada para memória e a transação atrasada é abortada", async () => {
  const abertoTravado = CACHE.criarArmazemIDB({ open: () => ({}) }, { prazoMs: 8 });
  assert.equal(await abertoTravado.ler("x"), null, "open que nunca responde não segura o boot");

  let abortou = false;
  const db = { transaction() { return { objectStore: () => ({ get: () => ({}) }), abort() { abortou = true; this.onabort?.(); } }; } };
  const idb = { open() { const r = {}; queueMicrotask(() => { r.result = db; r.onsuccess?.(); }); return r; } };
  const armazem = CACHE.criarArmazemIDB(idb, { prazoMs: 8 });
  assert.equal(await armazem.ler("x"), null, "transação sem evento termina como miss de cache");
  assert.equal(abortou, true, "aborta a transação presa para evitar trabalho pendente");
  const memoria = CACHE.criarCache({ armazem: abertoTravado, varrer: false });
  assert.equal(await memoria.gravar("c:e:nx_inicio:0", "nx_inicio", { n: 7 }), true);
  assert.deepEqual((await memoria.ler("c:e:nx_inicio:0")).dados, { n: 7 });
});

await teste("api.js (cache): serve o guardado ANTES da rede (aoCache), devolve o da rede, atualiza o cache e avisa o selo", async () => {
  const x = apiComCache({ rede: async () => { await new Promise(r => setTimeout(r, 30)); return { status: 200, corpo: { v: "rede" } }; }, cacheado: { dados: { v: "cache" }, em: 1234 } });
  const ordem = [];
  const dados = await x.api.rpcC("nx_negocios_kanban", { p_funil: "f1" }, { cache: true, aoCache: (d, em) => ordem.push(["cache", d.v, em]) });
  assert.deepEqual(ordem, [["cache", "cache", 1234]]); assert.deepEqual(dados, { v: "rede" });
  await new Promise(r => setImmediate(r));
  assert.ok(x.eventos.includes("selo:servido") && x.eventos.includes("selo:fim") && x.eventos.includes("gravou"));
  assert.ok(x.eventos.indexOf("selo:servido") < x.eventos.indexOf("selo:fim"));
  assert.match(x.chamadas[0], /^ler:c1:e1:nx_negocios_kanban:[0-9a-f]{8}$/, "chave com conta e empresa");
});

await teste("api.js (cache): rede falhou depois de pintar do cache → erro com comCache (a tela mantém o que mostra) e mensagem 'Mostrando o que já tinha'; sem cache nada disso", async () => {
  const x = apiComCache({ rede: async () => new TypeError("Failed to fetch"), cacheado: { dados: { v: "cache" }, em: 99 }, esperaCache: 0 });
  let pintou = 0;
  const e = await x.api.rpcC("nx_crm_base", {}, { cache: true, aoCache: () => pintou++ }).catch(v => v);
  assert.equal(pintou, 1); assert.equal(e.comCache, true); assert.equal(e.codigo, "sem_conexao");
  assert.equal(API.mensagemErro(e), "Sem internet. Mostrando o que já tinha.");
  assert.ok(x.eventos.includes("selo:fim:falhou"));
  const y = apiComCache({ rede: async () => new TypeError("Failed to fetch"), cacheado: null });
  let pintou2 = 0;
  const e2 = await y.api.rpcC("nx_crm_base", {}, { cache: true, aoCache: () => pintou2++ }).catch(v => v);
  assert.equal(pintou2, 0); assert.equal(e2.comCache, undefined); assert.equal(API.mensagemErro(e2), "Sem internet. Confira a conexão e tente de novo.");
});

await teste("api.js (cache): rede mais rápida que o cache não pinta o velho depois do novo; RPC fora da lista e opção ausente ignoram o cache", async () => {
  const x = apiComCache({ rede: async () => ({ status: 200, corpo: { v: "rede" } }), cacheado: { dados: { v: "velho" }, em: 1 }, esperaCache: 40 });
  let pintou = 0;
  assert.deepEqual(await x.api.rpcC("nx_inicio", {}, { cache: true, aoCache: () => pintou++ }), { v: "rede" });
  await new Promise(r => setTimeout(r, 80));
  assert.equal(pintou, 0, "o dado velho nunca aparece por cima do novo");
  const y = apiComCache({ rede: async () => ({ status: 200, corpo: { v: 1 } }), cacheado: { dados: { v: "cache" }, em: 1 } });
  let p = 0;
  await y.api.rpcC("nx_cv_mensagens", { p_conversa: 1 }, { cache: true, aoCache: () => p++ }); await y.api.rpcC("nx_inicio", {}, { aoCache: () => p++ }); await y.api.rpc("nx_inicio", {});
  assert.equal(p, 0); assert.deepEqual(y.chamadas, [], "mensagem não passa pelo cache; sem {cache:true} também não");
  const sem = API.criarApi({ url: "https://x.test", chave: "k", fetch: async () => ({ ok: true, status: 200, text: async () => "{}" }) });
  assert.deepEqual(await sem.rpcC("nx_inicio", {}, { cache: true, aoCache: () => { throw new Error("não devia"); } }), {}, "api sem cache ignora a opção");
});

await teste("app.js (M16): sessão guardada pinta o shell e a rede revalida; selo único; limpa no logout, queda e troca de conta; esqueleto com a forma da rota", () => {
  assert.match(APP_JS, /E\.cache = E\.M\.cache\.criarCache\(\);/);
  assert.match(APP_JS, /cache: E\.cache, conta: \(\) => \(E\.sessao \? E\.sessao\.conta\.id : LS\.lerTxt\(CHAVE_CONTA\)\), aoCache: ev => aoCacheEvento\(ev\)/);
  assert.match(APP_JS, /E\.cache\.gravar\(E\.cache\.chaveDe\("nx_app_sessao", \{\}, \{ conta: s\.conta\.id \}\), "nx_app_sessao", s\)/, "a sessão normalizada fica no aparelho");
  assert.match(APP_JS, /!g\.dados\.conta\.trocar_senha/, "troca de senha obrigatória nunca abre pelo cache");
  assert.match(APP_JS, /if \(E\.sessaoGuardada\) carregarMarcaPublica\(\{ pintar: false \}\); else await carregarMarcaPublica\(\);/, "com sessão guardada o shell não espera a marca pública");
  assert.match(APP_JS, /await adotarSessao\(guardada\.dados\);\s*revalidarSessao\(\);/);
  for (const nome of ["async function sair()", "function sessaoCaiuTotal()"]) {
    const corpo = APP_JS.slice(APP_JS.indexOf(nome), APP_JS.indexOf("\n}\n", APP_JS.indexOf(nome)));
    assert.match(corpo, /limparDadosDoAparelho\(\)/, `${nome} limpa o cache`);
  }
  assert.match(/async function pedirLoginNaTela\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0], /if \(r === "outra"\) \{[\s\S]*?limparDadosDoAparelho\(\);/, "troca de conta limpa o cache");
  assert.match(APP_JS, /function limparDadosDoAparelho\(\) \{\s*const feito = E\.cache \? E\.cache\.limpar\(\)\.catch\(\(\) => \{\}\) : Promise\.resolve\(\);/);
  assert.match(APP_JS, /Mostrando dados de \$\{hora\} · atualizando…/);
  assert.match(APP_JS, /reiniciarSelo\(\);\s*marcarMenu\(r\.modulo\);/, "o selo recomeça a cada tela");
  assert.match(HTML, /<link rel="modulepreload" href="cache\.js\?v=/);
  assert.match(APP_JS, /ui\.esqueleto\(rotas\.esqueletoDaRota\(r\.modulo, r\.partes\)\)/);
  const tiposUi = [...ler("ui.js").matchAll(/tipo === "([a-z]+)"/g)].map(m => m[1]);
  for (const m of ["inicio", "conversas", "crm", "contatos", "empresas", "tarefas", "agenda", "anuncios", "relatorios", "automacoes", "config", "admin", "qualquer"]) {
    const tipo = ROTAS_MOD.esqueletoDaRota(m, []);
    assert.ok(["inicio", "chat", "lista", "kanban", "ads", "tabela", "agenda"].includes(tipo), `${m} → ${tipo}`);
    assert.ok(tiposUi.includes(tipo) || tipo === "lista", `ui.esqueleto conhece "${tipo}"`);
  }
  assert.equal(ROTAS_MOD.esqueletoDaRota("crm", []), "kanban"); assert.equal(ROTAS_MOD.esqueletoDaRota("crm", ["negocio", "9"]), "lista"); assert.equal(ROTAS_MOD.esqueletoDaRota("conversas", ["901"]), "chat");
});

/* ============================================================ revisão R119 */
secao("Revisão R119 · sessão certa, cache limpo e dados que saem do aparelho");

/** Armazém de mentira que também sabe listar (como o do IndexedDB): [{k, v, em, bytes}]. */
function armazemComLista() {
  const a = armazemFalso();
  a.listar = async () => [...a.m.values()].map(x => ({ k: x.k, v: x.v, em: x.em, bytes: x.b }));
  return a;
}

await teste("cache.js: varrer() apaga o que venceu (12 h) e o que é de outro formato, mesmo que ninguém leia de novo", async () => {
  let t = 10_000_000; const arm = armazemComLista();
  const c = CACHE.criarCache({ armazem: arm, agora: () => t, varrer: false });
  await c.gravar("c:e:nx_inicio:1", "nx_inicio", { n: 1 });
  t += 6 * 3600 * 1000; await c.gravar("c:e:nx_crm_base:1", "nx_crm_base", { n: 2 });
  arm.m.set("velho-formato", { k: "velho-formato", v: 99, em: t, dados: { x: 1 } });
  assert.equal(await c.varrer(), 1, "só o formato estranho sai por enquanto"); assert.equal(arm.m.size, 2);
  t += 7 * 3600 * 1000;                                        // a 1ª entrada tem 13 h; a 2ª, 7 h
  assert.equal(await c.varrer(), 1); assert.deepEqual([...arm.m.keys()], ["c:e:nx_crm_base:1"], "o vencido saiu do aparelho sem ninguém ter lido");
  assert.equal(await c.ler("c:e:nx_inicio:1"), null, "nem na memória da aba");
  assert.ok(await c.ler("c:e:nx_crm_base:1"));
  // armazém sem listar (ou que falha ao listar) não quebra
  assert.equal(await CACHE.criarCache({ armazem: armazemFalso(), varrer: false }).varrer(), 0);
  const ruim = armazemComLista(); ruim.listar = async () => { throw new Error("IndexedDB indisponível"); };
  assert.equal(await CACHE.criarCache({ armazem: ruim, varrer: false }).varrer(), 0);
  assert.equal(await CACHE.criarCache({ armazem: null, varrer: false }).varrer(), 0);
});

await teste("cache.js: teto total — passou de 200 entradas ou de 20 MB, as mais antigas saem primeiro", async () => {
  let t = 20_000_000; const arm = armazemComLista();
  const c = CACHE.criarCache({ armazem: arm, agora: () => t, varrer: false });
  for (let i = 0; i < CACHE.TETO_ENTRADAS + 5; i++) { t += 1000; await c.gravar(`c:e:nx_negocios_kanban:${String(i).padStart(3, "0")}`, "nx_negocios_kanban", { filtro: i }); }
  assert.equal(await c.varrer(), 5); assert.equal(arm.m.size, CACHE.TETO_ENTRADAS);
  for (let i = 0; i < 5; i++) assert.equal(arm.m.has(`c:e:nx_negocios_kanban:00${i}`), false, `a ${i + 1}ª mais antiga saiu`);
  assert.ok(arm.m.has("c:e:nx_negocios_kanban:005") && arm.m.has("c:e:nx_negocios_kanban:204"), "as mais novas ficam");
  // por tamanho: 6 entradas de 4 MB = 24 MB → a mais antiga sai (5 × 4 MB cabem no teto de 20 MB)
  const arm2 = armazemComLista(); const c2 = CACHE.criarCache({ armazem: arm2, agora: () => t, varrer: false });
  for (let i = 0; i < 6; i++) arm2.m.set(`g${i}`, { k: `g${i}`, v: CACHE.VERSAO_FORMATO, em: t - (6 - i) * 1000, nome: "nx_dados", b: 4 * 1024 * 1024, dados: {} });
  assert.equal(await c2.varrer(), 1); assert.deepEqual([...arm2.m.keys()].sort(), ["g1", "g2", "g3", "g4", "g5"]);
  assert.equal(CACHE.TETO_TOTAL_BYTES, 20 * 1024 * 1024); assert.equal(CACHE.VARRER_A_CADA_MS, 3600 * 1000);
  assert.match(ler("cache.js"), /setTimeout\(rodar, VARRER_AO_ABRIR_MS\)\);\s*solto\(setInterval\(rodar, VARRER_A_CADA_MS\)\);/, "a varredura roda ao abrir e a cada hora");
});

await teste("cache.js: apagarEmpresa tira do aparelho só o que era daquela empresa (acesso retirado); o resto da conta fica", async () => {
  const arm = armazemComLista(); const c = CACHE.criarCache({ armazem: arm, varrer: false });
  const k = (rpc, cliente, conta = "c1") => CACHE.chaveDe(rpc, {}, { conta, cliente });
  await c.gravar(k("nx_crm_base", "e1"), "nx_crm_base", { n: 1 }); await c.gravar(k("nx_negocios_kanban", "e1"), "nx_negocios_kanban", { n: 2 });
  await c.gravar(k("nx_crm_base", "e2"), "nx_crm_base", { n: 3 }); await c.gravar(k("nx_app_sessao", null), "nx_app_sessao", { conta: { id: "c1" } });
  await c.gravar(k("nx_crm_base", "e1", "c2"), "nx_crm_base", { n: 4 });
  assert.equal(await c.apagarEmpresa({ conta: "c1", cliente: "e1" }), 2);
  assert.deepEqual([...arm.m.keys()].sort(), [k("nx_app_sessao", null), k("nx_crm_base", "e2"), k("nx_crm_base", "e1", "c2")].sort());
  assert.equal(await c.ler(k("nx_crm_base", "e1")), null, "nem na memória");
  assert.equal(await c.apagarEmpresa({ conta: "c1", cliente: null }), 0, "sem empresa não apaga nada (não vira 'apagar tudo')");
  // sem IndexedDB (só memória) também funciona
  const mem = CACHE.criarCache({ armazem: null, varrer: false }); await mem.gravar(k("nx_inicio", "e1"), "nx_inicio", { n: 1 });
  assert.equal(await mem.apagarEmpresa({ conta: "c1", cliente: "e1" }), 1); assert.equal(await mem.ler(k("nx_inicio", "e1")), null);
});

await teste("cache.js: o armazém do IndexedDB lista as entradas com cursor (chave, hora e tamanho, sem devolver os dados)", async () => {
  // IndexedDB de mentira: o bastante para open/transaction/objectStore com get, put, delete, clear e openCursor
  const loja = new Map();
  const pedido = fazer => { const r = { result: undefined, onsuccess: null, onerror: null }; queueMicrotask(() => { fazer(r); }); return r; };
  const idbFalso = { open() {
    const r = { result: null, onupgradeneeded: null, onsuccess: null };
    const db = { objectStoreNames: { contains: () => true }, createObjectStore() {}, transaction() {
      const tx = { oncomplete: null, pend: 0, objectStore: () => store };
      const feito = () => { tx.pend--; if (tx.pend === 0) setTimeout(() => { if (tx.pend === 0 && tx.oncomplete) tx.oncomplete(); }, 0); };
      const um = fazer => { tx.pend++; return pedido(r2 => { fazer(r2); if (r2.onsuccess) r2.onsuccess(); feito(); }); };
      const store = {
        get: k => um(r2 => { r2.result = loja.get(k); }), put: v => um(() => { loja.set(v.k, v); }), delete: k => um(() => { loja.delete(k); }), clear: () => um(() => { loja.clear(); }),
        openCursor() {
          const chaves = [...loja.keys()]; let i = 0; tx.pend++;
          const r2 = { result: null, onsuccess: null };
          const passo = () => queueMicrotask(() => {
            r2.result = i < chaves.length ? { primaryKey: chaves[i], value: loja.get(chaves[i]), continue() { i++; passo(); } } : null;
            if (r2.onsuccess) r2.onsuccess();
            if (!r2.result) feito();
          });
          passo(); return r2;
        },
      };
      return tx;
    } };
    queueMicrotask(() => { r.result = db; if (r.onsuccess) r.onsuccess(); });
    return r;
  } };
  const arm = CACHE.criarArmazemIDB(idbFalso);
  assert.deepEqual(await arm.listar(), [], "banco vazio");
  await arm.gravar("a", { v: 1, em: 111, nome: "nx_inicio", b: 40, dados: { segredo: "não sai na listagem" } });
  await arm.gravar("b", { v: 1, em: 222, nome: "nx_inicio", dados: { semTamanho: true } });
  const lista = await arm.listar();
  assert.deepEqual(lista.map(x => [x.k, x.v, x.em]), [["a", 1, 111], ["b", 1, 222]]);
  assert.equal(lista[0].bytes, 40); assert.ok(lista[1].bytes > 0, "entrada sem tamanho gravado é medida na hora");
  assert.ok(lista.every(x => !("dados" in x)), "a listagem não carrega os dados para a memória");
  assert.deepEqual((await arm.ler("a")).dados, { segredo: "não sai na listagem" }, "ler e gravar continuam iguais");
  // varredura de ponta a ponta sobre este armazém
  let t = 1000; const c = CACHE.criarCache({ armazem: arm, agora: () => t, varrer: false });
  t = 222 + CACHE.TTL_MS - 1; assert.equal(await c.varrer(), 1); assert.deepEqual([...loja.keys()], ["b"]);
});

await teste("api.js (cache): a resposta de uma leitura em voo NÃO volta para o aparelho se o token ou a conta mudaram (Sair, outra conta)", async () => {
  let tok = "t1";
  const x = apiComCache({ rede: async () => { tok = null; return { status: 200, corpo: { v: "da conta que saiu" } }; }, extra: { token: () => tok } });
  assert.deepEqual(await x.api.rpcC("nx_crm_base", {}, { cache: true }), { v: "da conta que saiu" }, "quem pediu ainda recebe a resposta");
  await new Promise(r => setImmediate(r));
  assert.ok(!x.eventos.includes("gravou"), "mas ela não é regravada no cache depois do limpar()");
  let conta = "c1";
  const y = apiComCache({ rede: async () => { conta = "c2"; return { status: 200, corpo: { v: 1 } }; }, extra: { conta: () => conta } });
  await y.api.rpcC("nx_crm_base", {}, { cache: true }); await new Promise(r => setImmediate(r));
  assert.ok(!y.eventos.includes("gravou"), "outra conta entrou no meio: não grava");
  const z = apiComCache({ rede: async () => ({ status: 200, corpo: { v: 1 } }) });
  await z.api.rpcC("nx_crm_base", {}, { cache: true }); await new Promise(r => setImmediate(r));
  assert.ok(z.eventos.includes("gravou"), "nada mudou: grava como sempre");
});

/** Roda o revalidarSessao() do app.js com um shell de mentira; devolve o que ele mandou fazer. */
async function rodarRevalidar({ guardada, nova, cliente }) {
  const log = [];
  const E = { sessao: guardada, cliente, sessaoPromessa: Promise.resolve(nova), M: { tema: { hashCurto: o => JSON.stringify(o) } },
    cache: { apagarEmpresa: async a => { log.push(["apagarEmpresa", a.conta, a.cliente]); return 1; } }, ui: { toast: t => log.push(["toast", t]) } };
  runInNewContext(`${fnDoApp("fotoDoAcesso")}\n${fnDoApp("revalidarSessao")}\nrevalidarSessao();`, { E, JSON,
    limparERecarregar: async () => { log.push(["limparERecarregar"]); },
    clienteInicial: () => (E.sessao.clientes[0] ? E.sessao.clientes[0].id : null),
    escolherCliente: async (id, o) => { log.push(["escolher", id, o.remontar]); E.cliente = E.sessao.clientes.find(c => c.id === id) || null; },
    desmontarAtual: () => { log.push(["desmontar"]); }, aoMudarRota: async () => { log.push(["rota"]); } });
  await new Promise(r => setTimeout(r, 10));
  return { E, log };
}
const cliDe = (id, extra = {}) => ({ id, papel: "admin", modulos: ["crm", "conversas"], status: "ativo", teste_ate: null, plano: "pro", vertical: "odonto", ...extra });
const sessaoDe = (conta, clientes, extra = {}) => ({ conta: { id: conta, papel: "usuario", super: false }, org: { nome: "Org" }, clientes, ...extra });

await teste("app.js (revisão R119): a rede devolveu OUTRA conta → limpa o aparelho e recarrega, sem adotar nada", async () => {
  const guardada = sessaoDe("conta-A", [cliDe("e1")]);
  const r = await rodarRevalidar({ guardada, nova: sessaoDe("conta-B", [cliDe("e9")]), cliente: guardada.clientes[0] });
  assert.deepEqual(r.log, [["limparERecarregar"]]);
  assert.equal(r.E.sessao, guardada, "a sessão da outra conta não é misturada à tela da anterior");
  const limpar = fnDoApp("limparERecarregar");
  assert.match(limpar, /await limparComPrazo\(\); location\.reload\(\);/);
  assert.match(fnDoApp("limparComPrazo"), /Promise\.race\(\[limparDadosDoAparelho\(\), new Promise\(r => setTimeout\(r, 800\)\)\]\)/, "a limpeza do IndexedDB não é cortada pelo recarregamento");
  const dados = fnDoApp("limparDadosDoAparelho");
  assert.match(dados, /LS\.apagar\(CHAVE_CONTA\);\s*E\.sessaoGuardada = null;\s*return feito;/, "sem CHAVE_CONTA a próxima abertura lê a sessão da rede (não há laço de recarga)");
});

await teste("app.js (revisão R119): empresa removida → cache dela apagado, outra empresa assume e a tela nasce de novo; papel ou módulos alterados → tela de novo", async () => {
  // empresa ativa saiu da lista
  let g = sessaoDe("c1", [cliDe("e1"), cliDe("e2")]);
  let r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", [cliDe("e2")]), cliente: g.clientes[0] });
  assert.deepEqual(r.log.slice(0, 4), [["apagarEmpresa", "c1", "e1"], ["escolher", "e2", false], ["desmontar"], ["rota"]]);
  assert.equal(r.log[4][0], "toast"); assert.match(r.log[4][1], /acesso foi alterado/);
  // única empresa removida: fica sem empresa (cartão «sem acesso a nenhuma empresa»), e a tela antiga sai
  g = sessaoDe("c1", [cliDe("e1")]);
  r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", []), cliente: g.clientes[0] });
  assert.deepEqual(r.log.slice(0, 4), [["apagarEmpresa", "c1", "e1"], ["escolher", null, false], ["desmontar"], ["rota"]]);
  // papel rebaixado na mesma empresa
  g = sessaoDe("c1", [cliDe("e1")]);
  r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", [cliDe("e1", { papel: "leitura" })]), cliente: g.clientes[0] });
  assert.deepEqual(r.log.slice(0, 3), [["escolher", "e1", false], ["desmontar"], ["rota"]], "sem apagar cache: a empresa continua dela");
  // módulo retirado do plano
  g = sessaoDe("c1", [cliDe("e1")]);
  r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", [cliDe("e1", { modulos: ["crm"] })]), cliente: g.clientes[0] });
  assert.ok(r.log.some(x => x[0] === "desmontar"), "módulos mudaram: remonta");
  // mudou algo que a tela aberta não usa (outra empresa entrou na lista; módulos na mesma, em outra ordem): só o shell é redesenhado
  g = sessaoDe("c1", [cliDe("e1")]);
  r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", [cliDe("e1", { modulos: ["conversas", "crm"] }), cliDe("e3")]), cliente: g.clientes[0] });
  assert.deepEqual(r.log, [["escolher", "e1", false]], "não desmonta a tela de quem está trabalhando");
  // nada mudou: nem o shell é tocado
  g = sessaoDe("c1", [cliDe("e1")]);
  r = await rodarRevalidar({ guardada: g, nova: sessaoDe("c1", [cliDe("e1")]), cliente: g.clientes[0] });
  assert.deepEqual(r.log, []);
});

await teste("app.js (revisão R119): entrar ou aceitar convite com outra conta aberta não adota a sessão antiga; rota pública não dispara a sessão antecipada", () => {
  const entrar = /async aoEntrar\(token, \{ cliente_id \} = \{\}\) \{[\s\S]*?\n    \},/.exec(APP_JS)[0];
  assert.match(entrar, /E\.sessaoPromessa = null; E\.sessaoGuardada = null;\s*limparDadosDoAparelho\(\);\s*E\.M\.dados\.guardarToken\(token\);/, "zera a antecipada e a guardada e limpa o aparelho ANTES de guardar o token e navegar");
  assert.ok(entrar.indexOf("limparDadosDoAparelho()") < entrar.indexOf("navegar(destino"), "limpa antes de navegar");
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(iniciar, /const ficaPublica = ROTAS_PUBLICAS\.has\(rotaInicial\) && rotaInicial !== "login";\s*if \(dados\.lerToken\(\) && !ficaPublica\) \{\s*E\.sessaoPromessa = lerSessao\(\);/,
    "convite e nova senha não leem a sessão com o token antigo (o login com token vai direto para o app e segue antecipando)");
  const ler2 = fnDoApp("lerSessao");
  assert.match(ler2, /const token = E\.M\.dados\.lerToken\(\);\s*const s = await E\.api\.rpc\("nx_app_sessao"\);/);
  assert.match(ler2, /if \(E\.M\.dados\.lerToken\(\) === token\) \{\s*LS\.gravar\(CHAVE_CONTA, s\.conta\.id\);/, "sessão lida com um token que já foi trocado não fica guardada para a próxima abertura");
});

await teste("app.js (revisão R119): o Sair da tela de abertura e a conta pendente limpam o aparelho; o Sair apaga a fila de saída das Conversas (mesmo nome do conversas.js)", () => {
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(iniciar, /\$\("boot-sair"\)\.addEventListener\("click", async \(\) => \{[\s\S]*?apagarToken\(\);[\s\S]*?E\.rascunhos\.apagarTudo\(\); apagarFilaDeSaida\(\); await limparComPrazo\(\);[\s\S]*?location\.reload\(\);/);
  assert.match(fnDoApp("aoMudarRota"), /e\.codigo === "conta_pendente"\) \{\s*dados\.apagarToken\(\);\s*if \(E\.rascunhos\) E\.rascunhos\.apagarTudo\(\);[^\n]*\s*limparDadosDoAparelho\(\);/);
  const sair = fnDoApp("sair");
  assert.ok(sair.indexOf("desmontarAtual();") > 0 && sair.indexOf("desmontarAtual();") < sair.indexOf("apagarFilaDeSaida();"), "apaga a fila depois de desmontar (Conversas já largou o banco)");
  assert.match(/async function pedirLoginNaTela\(\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0], /if \(r === "outra"\) \{[\s\S]*?apagarFilaDeSaida\(\);/, "troca de conta também");
  const nomeFila = (/const DB_FILA = "([^"]+)"/.exec(ler("conversas.js")) || [])[1];
  assert.ok(nomeFila, "conversas.js declara o nome do banco da fila");
  const apagar = fnDoApp("apagarFilaDeSaida");
  assert.ok(apagar.includes(`indexedDB.deleteDatabase("${nomeFila}")`), `o shell apaga o banco «${nomeFila}»`);
  const apagados = [];
  runInNewContext(`${apagar}\napagarFilaDeSaida();`, { indexedDB: { deleteDatabase: n => apagados.push(n) } });
  assert.deepEqual(apagados, [nomeFila]);
  runInNewContext(`${apagar}\napagarFilaDeSaida();`, { indexedDB: { deleteDatabase() { throw new Error("SecurityError"); } } });   // janela anônima: não quebra o Sair
  runInNewContext(`${apagar}\napagarFilaDeSaida();`, {});                                                                        // sem IndexedDB
  assert.doesNotMatch(APP_JS, /import\(["'`]\.\/conversas\.js/, "sem importar o módulo de Conversas só para isso");
});

await teste("app.js (revisão R119): não lidas no ícone do app, armazenamento persistente pedido uma vez, «Recarregar» no app instalado e a versão no menu Ajuda", () => {
  // selo do ícone
  const chamadas = [];
  const E = { sessao: { conta: {} }, cliente: { id: "e1" }, badges: { conversas: 3 } };
  const nav = { setAppBadge: async n => { chamadas.push(["set", n]); }, clearAppBadge: async () => { chamadas.push(["clear"]); } };
  const selo = runInNewContext(`let seloDoApp = null;\n${fnDoApp("atualizarSeloDoApp")}\natualizarSeloDoApp`, { E, navigator: nav, Math, Number, Promise });
  selo(); selo(); assert.deepEqual(chamadas, [["set", 3]], "o mesmo número não é mandado duas vezes");
  E.badges.conversas = 120; selo(); E.badges.conversas = 0; selo(); assert.deepEqual(chamadas.slice(1), [["set", 120], ["clear"]]);
  E.badges.conversas = 4; selo(); E.sessao = null; selo(); assert.deepEqual(chamadas.slice(3), [["set", 4], ["clear"]], "sem sessão o número sai do ícone");
  const semSuporte = runInNewContext(`let seloDoApp = null;\n${fnDoApp("atualizarSeloDoApp")}\natualizarSeloDoApp`, { E: { sessao: {}, cliente: {}, badges: { conversas: 2 } }, navigator: {}, Math, Number, Promise });
  semSuporte();                                              // navegador sem a função: nada acontece, nada quebra
  const limpos = [];
  runInNewContext(`let seloDoApp = null;\n${fnDoApp("atualizarSeloDoApp")}\natualizarSeloDoApp();`, { E: { sessao: null, cliente: null, badges: {} }, navigator: { clearAppBadge: async () => { limpos.push(1); } }, Math, Number, Promise });
  assert.equal(limpos.length, 1, "na 1ª chamada o ícone é acertado mesmo com zero (um número antigo não fica lá)");
  assert.match(fnDoApp("atualizarBadges"), /atualizarSeloDoApp\(\);/); assert.match(fnDoApp("sair"), /atualizarSeloDoApp\(\);/);
  // armazenamento persistente: uma vez por aparelho, depois de adotar a sessão
  const guardado = new Map(); let pedidos = 0;
  const LS = { lerTxt: k => guardado.get(k) ?? null, gravar: (k, v) => guardado.set(k, v) };
  const pedir = runInNewContext(`${fnDoApp("pedirArmazenamentoPersistente")}\npedirArmazenamentoPersistente`, { LS, navigator: { storage: { persist: async () => { pedidos++; return true; } } }, Promise });
  pedir(); pedir(); assert.equal(pedidos, 1, "pede uma vez só");
  runInNewContext(`${fnDoApp("pedirArmazenamentoPersistente")}\npedirArmazenamentoPersistente();`, { LS: { lerTxt: () => null, gravar() {} }, navigator: {}, Promise });
  runInNewContext(`${fnDoApp("pedirArmazenamentoPersistente")}\npedirArmazenamentoPersistente();`, { LS: { lerTxt: () => null, gravar() {} }, navigator: { storage: { persist() { throw new Error("negado"); } } }, Promise });
  assert.match(fnDoApp("adotarSessao"), /pedirArmazenamentoPersistente\(\);/);
  // menu da conta e Ajuda
  assert.ok(APP_JS.includes('E.pwaMod && E.pwaMod.emStandalone() ? { rotulo: "Recarregar", icone: "reabrir", fn: () => location.reload() } : null,'), "«Recarregar» só no app instalado");
  assert.ok(fnDoApp("abrirMenuAjuda").includes("{ rotulo: `Versão ${VERSAO}`, icone: \"info\", fn: () => E.ui.copiar(VERSAO, { aviso: \"Versão copiada.\" }) }"), "a versão em uso aparece no menu Ajuda");
  assert.match(HTML, /<symbol id="i-reabrir"/);
});

/* ============================================================ M21 */
secao("M21 · ícones que dizem a coisa certa");

const VOC = await imp("vocab.js");
const sprite = new Set([...HTML.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1]));

/** Nomes de ícone usados nos .js do app (literais; os dinâmicos são cobertos pelos mapas que o teste confere à parte). */
function iconesUsados() {
  const usos = new Map();
  for (const f of readdirSyncApp().filter(x => x.endsWith(".js"))) {
    const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    const nomes = new Set();
    for (const m of t.matchAll(/\bicone\(\s*["']([a-z0-9-]+)["']/g)) nomes.add(m[1]);
    for (const m of t.matchAll(/\bicone:\s*["']([a-z0-9-]+)["']/g)) nomes.add(m[1]);
    for (const m of t.matchAll(/\bicone\([^()]*\?\s*["']([a-z0-9-]+)["']\s*:\s*(?:[^()]*?\?\s*["']([a-z0-9-]+)["']\s*:\s*)?["']([a-z0-9-]+)["']/g)) for (const n of [m[1], m[2], m[3]]) if (n) nomes.add(n);
    for (const m of t.matchAll(/["']#i-([a-z0-9-]+)["']/g)) nomes.add(m[1]);
    for (const n of nomes) { if (!usos.has(n)) usos.set(n, new Set()); usos.get(n).add(f); }
  }
  return usos;
}

await teste("todo ícone usado no código (ui.icone, icone: «…», #i-…) existe no sprite do index.html", () => {
  const faltam = [...iconesUsados()].filter(([n]) => !sprite.has(n)).map(([n, fs_]) => `i-${n} ← ${[...fs_].join(", ")}`);
  assert.deepEqual(faltam, [], `símbolos que as telas pedem e o sprite não tem (peça a B para acrescentar em web/app/index.html): ${faltam.join(" | ")}`);
  assert.ok(sprite.size >= 60, `sprite com ${sprite.size} símbolos`);
});

await teste("i-anuncio deixa de ser um alto-falante (megafone); Meta e Google são símbolos monocromáticos em currentColor; ícones novos sem cor fixa", () => {
  assert.ok(!HTML.includes('M3.5 10.5v3a1 1 0 0 0 1 1h2l5 4v-13l-5 4h-2a1 1 0 0 0-1 1z'), "o desenho do alto-falante saiu de i-anuncio");
  const simbolo = id => (new RegExp(`<symbol id="${id}"[^>]*>([\\s\\S]*?)</symbol>`).exec(HTML) || [])[1];
  assert.match(simbolo("i-anuncio"), /M3\.5 10v4l11 5V5z/, "megafone: cone alargando para a boca + cabo + ondas");
  for (const id of ["i-meta", "i-google", "i-dente", "i-chave", "i-sacola", "i-reabrir", "i-transferir", "i-lateral", "i-baixar", "i-modelo", "i-responder", "i-anuncio"]) {
    const s = simbolo(id);
    assert.ok(s, `${id} existe`);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|fill="(?!none)|stroke="(?!none)|style=/, `${id} não traz cor fixa: herda currentColor do CSS (.ic)`);
  }
});

await teste("vocab.js: o CRM ganha ícone por vertical (odonto dente, oficina chave, loja sacola, genérico funil) e o menu usa", () => {
  assert.deepEqual(VOC.ICONE_CRM, { odonto: "dente", oficina: "chave", loja: "sacola", generico: "funil" });
  for (const [vert, ic] of Object.entries(VOC.ICONE_CRM)) { assert.equal(VOC.vocab(vert).icone_crm, ic, vert); assert.ok(sprite.has(ic), `i-${ic} no sprite`); }
  assert.equal(VOC.vocab("xpto").icone_crm, "funil", "vertical desconhecida = genérico");
  assert.ok(ler("rotas.js").includes('icone: it.id === "crm" ? (vocab.icone_crm || it.icone) : it.icone'), "rotas.itensDoMenu (menu e paleta) troca só o ícone do CRM");
  assert.ok(APP_JS.includes("E.M.rotas.itensDoMenu({ op: opcoesAcesso()"), "app.js monta o menu por rotas.itensDoMenu");
  for (const it of ROTAS_MOD.MENU) assert.ok(sprite.has(it.icone), `menu: i-${it.icone} no sprite`);
});

/* ============================================================ M22 */
secao("M22 · acessibilidade de fluxo (atalhos «Ir para…», foco no título, anúncio da página)");

await teste("rotas.regioesDaRota: lista → conversa → campo de mensagem (o campo fica a 3 Tabs do topo), quadro do CRM; rota sem regiões = nada", () => {
  const c = ROTAS_MOD.regioesDaRota("conversas");
  assert.deepEqual(c.map(r => r.rotulo), ["Ir para a lista de conversas", "Ir para a conversa", "Ir para o campo de mensagem"]);
  assert.deepEqual(ROTAS_MOD.regioesDaRota("crm").map(r => r.rotulo), ["Ir para o quadro"]);
  for (const m of ["inicio", "agenda", "config", "admin", "qualquer"]) assert.deepEqual(ROTAS_MOD.regioesDaRota(m), [], m);
  assert.throws(() => { ROTAS_MOD.REGIOES_DA_ROTA.conversas.push(1); }, TypeError, "tabela congelada");
});

await teste("contrato com as telas: os seletores dos atalhos usam rótulos acessíveis que o código de Conversas e do CRM realmente tem", () => {
  const fontes = { conversas: ler("conversas.js") + ler("cv-chat.js") + ler("cv-composer.js") + ler("cv-lista.js"), crm: ler("crm-kanban.js") + ler("crm.js") };
  const tem = (modulo, trecho, msg) => assert.ok(fontes[modulo].includes(trecho), `${msg}: ${trecho}`);
  tem("conversas", '"aria-label": "Lista de conversas"', "coluna da lista (conversas.js)");
  tem("conversas", 'role: "log"', "mensagens são um log (cv-chat.js)"); tem("conversas", '"aria-label": "Mensagens"', "rótulo das mensagens (cv-chat.js)");
  tem("conversas", '"aria-label": "Mensagem"', "textarea do compositor (cv-composer.js)");
  tem("crm", 'role: "region", "aria-label": `Quadro de ', "quadro do kanban (crm-kanban.js)");
  for (const [rot, alvo] of ROTAS_MOD.REGIOES_DA_ROTA.conversas) assert.match(alvo, /aria-label/, `${rot}: o seletor usa aria-label, não classe de CSS`);
  assert.doesNotMatch(JSON.stringify(ROTAS_MOD.REGIOES_DA_ROTA), /\.cv-|\.kb-/, "nenhuma classe de CSS das telas no contrato");
});

await teste("index.html e shell.css: atalhos de região antes do «Pular para o conteúdo» (que continua lá); escondidos até o foco; forced-colors com cores do sistema", () => {
  const iReg = HTML.indexOf('<nav class="pular-regioes" id="pular-regioes"'), iPular = HTML.indexOf('<a class="pular" href="#vista">');
  assert.ok(iReg > 0 && iPular > iReg, "os atalhos da tela vêm primeiro na ordem do Tab");
  const css = ler("shell.css");
  assert.match(css, /\.pular-regiao \{ position: absolute; left: -9999px;/); assert.match(css, /\.pular-regiao:focus \{ left: 1rem; \}/);
  assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*?:focus-visible \{ outline: 2px solid Highlight;/);
  assert.match(css, /\.faixa \{ border: 1px solid CanvasText; \}/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "shell.css sem cor fixa");
});

await teste("app.js (M22): ctx.atalhosDeRegiao, alvo resolvido na hora do clique, foco no <h1> com anúncio «<título>, carregado» e o <main> só como reserva", () => {
  assert.match(APP_JS, /atalhosDeRegiao\(lista\) \{/);
  assert.match(APP_JS, /if \(alvo\) focarElemento\(alvo\); else E\.ui\.anunciar\("Essa área não está disponível agora\."\);/);
  assert.match(APP_JS, /b\.el\.hidden = !resolverAlvo\(b\.alvo\)/, "alvo que não existe agora não ganha atalho");
  const montar = /async function montarNoShell\([\s\S]*?\nfunction focarVista/.exec(APP_JS)[0];
  assert.equal([...montar.matchAll(/if \(doUsuario\) focarTitulo\(seq\);/g)].length, 2, "as duas saídas de montarNoShell focam o título");
  assert.doesNotMatch(montar, /if \(doUsuario\) focarVista\(\);/, "nada de focar o <main> direto");
  const f = /function focarTitulo\(seq\) \{[\s\S]*?\n\}\n/.exec(APP_JS)[0];
  assert.match(f, /h1\.setAttribute\("tabindex", "-1"\)/); assert.match(f, /E\.ui\.anunciar\(`\$\{nome\}, carregado`\)/);
  assert.match(f, /if \(seq !== E\.montando\) return true;/, "navegação mais nova cancela o foco da antiga");
  assert.match(f, /setTimeout\(\(\) => \{[\s\S]*?focarVista\(\)/, "sem <h1> em 3 s cai para o <main>");
  assert.match(APP_JS, /observarRegioes\(\);/); assert.match(APP_JS, /E\.regioes = null;\s*if \(E\.rascunhos\)/, "desmontar limpa os atalhos do módulo");
  assert.match(APP_JS, /document\.querySelector\("\.pular"\)/, "o «Pular para o conteúdo» continua sendo o .pular (teste T09 da frente A)");
});

/* ============================================================ M13 */
secao("M13 · instalável com a marca do cliente e com o produto certo");

/** largura × altura de um PNG (cabeçalho IHDR). */
function dimensoesPng(arquivo) {
  const b = readFileSync(join(APP, "icones", arquivo));
  assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${arquivo} é PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

await teste("ícones empacotados: PNG 192, 512, 512 maskable e apple-touch 180; manifesto do /app/ os lista (o Chrome reprovava com icons: [])", () => {
  assert.deepEqual(dimensoesPng("icon-192.png"), [192, 192]); assert.deepEqual(dimensoesPng("icon-512.png"), [512, 512]);
  assert.deepEqual(dimensoesPng("icon-maskable-512.png"), [512, 512]); assert.deepEqual(dimensoesPng("apple-touch-icon.png"), [180, 180]);
  const m = JSON.parse(ler("manifest.webmanifest"));
  assert.ok(m.icons.length >= 3, "ícones no manifesto do /app/");
  const por = (tam, fim) => m.icons.find(i => i.sizes === tam && i.purpose === fim);
  assert.ok(por("192x192", "any") && por("512x512", "any") && por("512x512", "maskable"), "192 e 512 (qualquer) e 512 maskable");
  for (const i of m.icons) if (i.type === "image/png") assert.ok(existsSync(join(APP, i.src)), `${i.src} existe`);
  assert.equal(m.scope, "/app/"); assert.equal(m.start_url, "/app/");
  assert.match(HTML, /<link rel="apple-touch-icon" id="apple-icone" href="icones\/apple-touch-icon\.png\?v=[A-Za-z0-9._-]+">/, "plano 100 · A1: ícone do iPhone versionado");
  for (const n of ["mobile-web-app-capable", "apple-mobile-web-app-capable", "apple-mobile-web-app-title", "apple-mobile-web-app-status-bar-style"]) assert.match(HTML, new RegExp(`<meta name="${n}"`), n);
});

await teste("CSP: manifest-src 'self' blob: no index.html (<meta>) e no netlify.toml (/app/*) — o mesmo texto nas duas pontas; as entradas não mudam", () => {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(HTML)[1];
  const bloco = TOML.split("[[headers]]").find(b => b.includes('for = "/app/*"'));
  const cab = /Content-Security-Policy = "([^"]+)"/.exec(bloco)[1];
  assert.match(meta, /font-src 'self'; manifest-src 'self' blob:; base-uri 'self'/);
  assert.match(cab, /font-src 'self'; manifest-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'/);
  assert.equal(cab.replace(" frame-ancestors 'none';", ""), meta, "meta e cabeçalho = mesma política (menos frame-ancestors, que só vale em cabeçalho)");
  assert.doesNotMatch(meta, /script-src[^;]*blob:/, "blob: só para manifesto, nunca para script");
  for (const e of ["/crm/*", "/ads/*", "/atendimento/*"]) assert.doesNotMatch(TOML.split("[[headers]]").find(b => b.includes(`for = "${e}"`)), /manifest-src/, `${e}: entrada só redireciona, sem manifesto`);
});

await teste("rotas.nomeDoApp: org padrão usa os títulos de sempre; white-label troca «Órbita» pelo produto da org; nome curto cabe no ícone", () => {
  const n = (produto, workspace) => ROTAS_MOD.nomeDoApp({ produto, workspace });
  assert.deepEqual([n("Órbita", "crm").name, n("Órbita", "ads").name, n("Órbita", "atendimento").name], ["Órbita CRM", "Nexus Ads · Órbita", "Órbita Atendimento"]);
  assert.deepEqual([n("Órbita", "crm").short_name, n("Órbita", "ads").short_name, n("Órbita", "atendimento").short_name], ["CRM", "Ads", "Atendimento"]);
  assert.deepEqual([n("Conecta", "crm").name, n("Conecta", "ads").name, n("Conecta", "atendimento").name], ["Conecta CRM", "Conecta Anúncios", "Conecta Atendimento"]);
  assert.equal(n("Conecta", "ads").short_name, "Conecta Ads"); assert.equal(n("Conecta", "crm").short_name, "Conecta CRM");
  for (const x of [n("Clínica Sorriso Vivo Odontologia", "atendimento"), n("Órbita", "atendimento"), n("X", "crm")]) assert.ok(x.short_name.length <= 12, x.short_name);
  assert.equal(n("Conecta", null).name, "Conecta"); assert.equal(n("", null).name, "Órbita"); assert.equal(n(undefined, "inexistente").name, "Órbita");
  assert.equal(n("Conecta", "crm").description, "Contatos, oportunidades, vendas e automações.");
  assert.deepEqual(["crm", "ads", "atendimento", null].map(w => ROTAS_MOD.iconeDoProduto(w, "dente")), ["dente", "anuncio", "chat", "camadas"]);
  for (const ic of ["dente", "anuncio", "chat", "camadas", "funil"]) assert.ok(sprite.has(ic), `i-${ic} no sprite`);
});

await teste("pwa.construirManifesto: URLs absolutas (manifesto em blob: não resolve caminho relativo), escopo /app/, início do produto, cor do esquema na splash", () => {
  const base = "https://crm.conecta.com.br/app/";
  const m = PWA.construirManifesto({ nome: ROTAS_MOD.nomeDoApp({ produto: "Conecta", workspace: "atendimento" }), base, workspace: "atendimento", rota: "conversas", fundo: "#FAFAF8", icones: PWA.iconesPadrao(base) });
  assert.equal(m.name, "Conecta Atendimento"); assert.equal(m.start_url, "https://crm.conecta.com.br/app/?produto=atendimento#/conversas");
  assert.equal(m.scope, "https://crm.conecta.com.br/app/"); assert.equal(m.id, "https://crm.conecta.com.br/app/?produto=atendimento");
  assert.equal(m.display, "standalone"); assert.equal(m.theme_color, "#FAFAF8"); assert.equal(m.background_color, "#FAFAF8", "a splash abre na cor do esquema, não preta com o app claro");
  for (const i of m.icons) assert.match(i.src, /^https:\/\/crm\.conecta\.com\.br\/app\/icones\//);
  assert.deepEqual(m.icons.map(i => i.purpose), ["any", "any", "maskable"]);
  const sem = PWA.construirManifesto({ nome: ROTAS_MOD.nomeDoApp({ produto: "Órbita" }), base, fundo: "#07090C", icones: [] });
  assert.equal(sem.start_url, base); assert.equal(sem.id, base); assert.deepEqual(sem.icons, []);
});

await teste("pwa.rasterizarIcones: logo → 4 PNGs (192, 512, maskable com zona segura, 180 do iOS); sem logo = null; canvas contaminado ou imagem que não carrega = erro (volta aos ícones empacotados)", async () => {
  const desenhos = [];
  const canvases = [];
  const doc = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ({ set fillStyle(v) { c.fundo = v; }, fillRect() { c.cheio = true; }, drawImage: (img, x, y, w, h) => desenhos.push({ tam: c.width, x, y, w, h }) }), toDataURL: () => `data:image/png;base64,T${c.width}${c.cheio ? "C" : ""}` }; canvases.push(c); return c; } };
  class Img { constructor() { this.naturalWidth = 400; this.naturalHeight = 100; } async decode() { if (/ruim/.test(this.src)) throw new Error("decode"); } }
  const r = await PWA.rasterizarIcones({ origem: "data:image/png;base64,AAAA", fundo: "#FAFAF8", doc, ImagemCtor: Img });
  assert.deepEqual(Object.keys(r), ["any192", "any512", "maskable512", "apple180"]);
  assert.equal(r.maskable512, "data:image/png;base64,T512C"); assert.equal(r.any512, "data:image/png;base64,T512"); assert.equal(r.apple180, "data:image/png;base64,T180C");
  const d = tam => desenhos.find(x => x.tam === tam);
  assert.ok(Math.abs(d(512).w - 512 * 0.86) < 1 && d(512).h < d(512).w, "logo largo cabe sem distorcer");
  const mask = desenhos.filter(x => x.tam === 512).map(x => x.w);
  assert.ok(Math.min(...mask) <= 512 * 0.6 + 1, "a versão maskable fica dentro da zona segura (60 %)");
  assert.equal(await PWA.rasterizarIcones({ origem: null, fundo: "#FAFAF8", doc, ImagemCtor: Img }), null);
  await assert.rejects(PWA.rasterizarIcones({ origem: "https://ruim.exemplo.test/logo.png", fundo: "#FAFAF8", doc, ImagemCtor: Img }), /decode/);
  const contaminado = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => { throw new Error("SecurityError"); } }) };
  await assert.rejects(PWA.rasterizarIcones({ origem: "https://x.test/l.png", fundo: "#FAFAF8", doc: contaminado, ImagemCtor: Img }), /SecurityError/);
  const m = PWA.iconesDeRaster(r);
  assert.deepEqual(m.map(i => i.sizes + "/" + i.purpose), ["192x192/any", "512x512/any", "512x512/maskable"]);
});

await teste("pwa.aplicarManifesto: põe o blob: no <link rel=manifest>, revoga o anterior e volta ao estático se algo falhar; metas apple acompanham a marca", () => {
  const atributos = { href: "manifest-crm.webmanifest" };
  const link = { getAttribute: k => atributos[k], setAttribute: (k, v) => { atributos[k] = v; } };
  const doc = { getElementById: id => (id === "manifest" ? link : id === "apple-icone" ? { setAttribute: (k, v) => { doc.apple = v; } } : null), querySelector: sel => { const n = /name="([^"]+)"/.exec(sel)[1]; return { setAttribute: (k, v) => { doc.metas[n] = v; } }; }, metas: {} };
  const revogados = []; let n = 0;
  const URLFalso = { createObjectURL: () => `blob:http://x/${++n}`, revokeObjectURL: u => revogados.push(u) };
  class BlobFalso { constructor(p, o) { this.p = p; this.o = o; } }
  const estado = { blob: null, original: null };
  assert.equal(PWA.aplicarManifesto({ doc, manifesto: { name: "a" }, estado, URLCtor: URLFalso, BlobCtor: BlobFalso }), true);
  assert.equal(atributos.href, "blob:http://x/1"); assert.equal(estado.original, "manifest-crm.webmanifest");
  PWA.aplicarManifesto({ doc, manifesto: { name: "b" }, estado, URLCtor: URLFalso, BlobCtor: BlobFalso });
  assert.deepEqual(revogados, ["blob:http://x/1"], "o blob antigo é revogado"); assert.equal(estado.original, "manifest-crm.webmanifest", "o original não é sobrescrito");
  PWA.voltarAoEstatico({ doc, estado, URLCtor: URLFalso });
  assert.equal(atributos.href, "manifest-crm.webmanifest"); assert.deepEqual(revogados, ["blob:http://x/1", "blob:http://x/2"]); assert.equal(estado.blob, null);
  assert.equal(PWA.aplicarManifesto({ doc: { getElementById: () => null }, manifesto: {}, estado: {}, URLCtor: URLFalso }), false, "sem <link> não faz nada");
  assert.equal(PWA.aplicarManifesto({ doc, manifesto: {}, estado: {}, URLCtor: { createObjectURL() { throw new Error("x"); } }, BlobCtor: BlobFalso }), false, "createObjectURL falhou: devolve false e o app.js volta ao estático");
  PWA.atualizarMetasApple({ doc, titulo: "Conecta Atendimento, nome muito comprido que passa de trinta", icone: "data:image/png;base64,Z", escuro: true });
  assert.equal(doc.metas["apple-mobile-web-app-title"].length, 30); assert.equal(doc.metas["apple-mobile-web-app-status-bar-style"], "black-translucent"); assert.equal(doc.apple, "data:image/png;base64,Z");
});

await teste("pwa.modoDeInstalacao: evento nativo (Chrome/Edge/Android), passo a passo no iPhone/iPad, nada se já instalado ou sem suporte", () => {
  const nav = (ua, extra = {}) => ({ userAgent: ua, platform: "", maxTouchPoints: 0, ...extra });
  const jan = standalone => ({ matchMedia: q => ({ matches: standalone && /standalone/.test(q) }) });
  const ev = { prompt() {} };
  const chrome = nav("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36");
  assert.equal(PWA.modoDeInstalacao({ evento: ev, janela: jan(false), nav: chrome }), "evento");
  assert.equal(PWA.modoDeInstalacao({ evento: null, janela: jan(false), nav: chrome }), null, "sem evento nem iOS não há o que oferecer");
  assert.equal(PWA.modoDeInstalacao({ evento: ev, janela: jan(true), nav: chrome }), null, "já aberto como app: o item some");
  assert.equal(PWA.modoDeInstalacao({ evento: null, janela: jan(false), nav: nav("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1") }), "ios");
  assert.equal(PWA.modoDeInstalacao({ evento: null, janela: jan(false), nav: nav("Mozilla/5.0 (Macintosh) Safari/605", { platform: "MacIntel", maxTouchPoints: 5 }) }), "ios", "iPad com Safari 'desktop'");
  assert.equal(PWA.modoDeInstalacao({ evento: null, janela: jan(false), nav: nav("Mozilla/5.0 (Macintosh) Safari/605", { platform: "MacIntel", maxTouchPoints: 0 }) }), null, "Mac de verdade");
  assert.equal(PWA.modoDeInstalacao({ evento: null, janela: jan(false), nav: nav("Mozilla/5.0 (iPhone) Safari", { standalone: true }) }), null, "iOS já na tela de início (navigator.standalone)");
  assert.equal(PWA.PASSOS_IOS.length, 3); assert.match(PWA.PASSOS_IOS[1], /Adicionar à Tela de Início/);
});

await teste("antes.js põe data-produto no <html> antes da primeira pintura (crm, ads, atendimento); outro valor é ignorado", () => {
  for (const [search, esperado] of [["?produto=crm", "crm"], ["?produto=ads&org=x", "ads"], ["?dev=1&produto=atendimento", "atendimento"], ["?produto=outro", undefined], ["", undefined], ["?produto=<script>", undefined]])
    assert.equal(rodarAntes({ search, token: "t" }).attrs["data-produto"], esperado, search);
});

await teste("app.js/login.js (M13): evento de instalação guardado cedo, «Instalar o app» no menu da conta e na folha Mais, manifesto dinâmico com volta ao estático, marca tardia repinta, login e pílula mostram o produto", () => {
  const tem = (txt, trecho, porque) => assert.ok(txt.includes(trecho), `${porque || "falta"}: ${trecho}`);
  tem(APP_JS, 'addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); E.instalarEvento = ev; });', "evento guardado cedo");
  tem(APP_JS, 'addEventListener("appinstalled", () => { E.instalarEvento = null; });', "evento some depois de instalar");
  tem(APP_JS, 'modoInstalacao() ? { rotulo: "Instalar o app", icone: "baixar", fn: () => instalarApp() } : null,', "menu da conta");
  tem(APP_JS, 'ui.h("button", { type: "button" }, ui.icone("baixar"), "Instalar o app")', "folha «Mais»");
  tem(APP_JS, "P.voltarAoEstatico({ estado: manifestoEstado });", "falha em qualquer passo: volta ao manifesto estático");
  tem(APP_JS, "if (seq !== manifestoEstado.seq) return;", "montagem antiga não sobrescreve a nova");
  tem(APP_JS, "setTimeout(atualizarManifestoApp, 350)", "pinturas seguidas viram uma montagem só");
  tem(APP_JS, "E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace })", "nome do app = produto da org + área");
  tem(APP_JS, 'getPropertyValue("--c-fundo").trim() || E.M.tema.FUNDOS_ESQUEMA.escuro', "a cor da splash é a do esquema, sem hex no código");
  tem(APP_JS, "if (E.sessao && mudou) aplicarMarcaCliente()", "marca pública que chega depois da sessão guardada repinta");
  tem(APP_JS, "produtoAberto: E.workspace ? { id: E.workspace, titulo: E.M.rotas.nomeDoApp(", "login recebe o produto aberto");
  tem(ler("login.js"), 'h("p", { class: "entrar-produto" }, ui.icone(prod.icone)', "cabeçalho do produto no login");
  tem(APP_JS, 'E.M.rotas.iconeDoProduto(E.workspace, E.cliente ? E.M.vocab.vocab(E.cliente.vertical).icone_crm : "funil")', "a pílula do topo usa o ícone do produto");
  tem(ler("shell.css"), ".entrar-produto {", "estilo do cabeçalho do produto");
  assert.doesNotMatch(APP_JS.slice(APP_JS.indexOf("INSTALÁVEL COM A MARCA"), APP_JS.indexOf("function modoInstalacao")), /#[0-9a-fA-F]{6}\b/, "sem cor hex no trecho do manifesto (regra A: hex só em :root/tema.js)");
});

/* ============================================================ M18 */
secao("M18 · paleta de comandos Ctrl/⌘+K, atalhos e Ajuda");

const CMD = await imp("comandos.js");
const PALETA_JS = ler("paleta.js");
const COMANDOS_JS = ler("comandos.js");

await teste("comandos.normalizar/pontuar/filtrar: sem acento e sem caixa, todas as palavras, começo do rótulo vence, empate = ordem de origem", () => {
  assert.equal(CMD.normalizar("  Ação  de  AÇÃO  "), "acao de acao");
  assert.equal(CMD.pontuar("", "qualquer"), 1);
  assert.equal(CMD.pontuar("nova oport", "Nova oportunidade") > CMD.pontuar("oport", "Nova oportunidade"), true, "começo do rótulo vale mais que o meio");
  assert.ok(CMD.pontuar("consulta marcar", "Marcar consulta") > 0 && CMD.pontuar("marcar consulta", "Marcar consulta") > CMD.pontuar("consulta marcar", "Marcar consulta"), "rótulo igual vence");
  assert.equal(CMD.pontuar("xyz", "Nova oportunidade", "venda lead"), 0);
  assert.ok(CMD.pontuar("venda", "Nova oportunidade", "venda lead") > 0, "palavras extras também casam");
  const itens = [{ rotulo: "Agenda", palavras: "calendario" }, { rotulo: "Nova tarefa", palavras: "lembrete" }, { rotulo: "Marcar consulta", palavras: "agenda horario" }, { rotulo: "Alternar tema", palavras: "aparencia" }];
  assert.deepEqual(CMD.filtrar(itens, "AGENDA").map(x => x.rotulo), ["Agenda", "Marcar consulta"], "rótulo começando pelo termo antes do que só casa por palavra extra");
  assert.deepEqual(CMD.filtrar(itens, "aparência").map(x => x.rotulo), ["Alternar tema"], "acento no termo");
  assert.deepEqual(CMD.filtrar(itens, "").map(x => x.rotulo), itens.map(x => x.rotulo), "sem termo: tudo, na ordem de origem");
  assert.equal(CMD.filtrar(itens, "a", { limite: 2 }).length, 2);
});

await teste("comandos.interpretar: «>» só ações, «#» protocolo, o resto tudo; espaços sobrando não atrapalham", () => {
  assert.deepEqual(CMD.interpretar("> nova"), { modo: "acoes", termo: "nova" });
  assert.deepEqual(CMD.interpretar("  >tema "), { modo: "acoes", termo: "tema" });
  assert.deepEqual(CMD.interpretar("#2026-14"), { modo: "protocolo", termo: "2026-14" });
  assert.deepEqual(CMD.interpretar(" mariana "), { modo: "tudo", termo: "mariana" });
  assert.deepEqual(CMD.interpretar(""), { modo: "tudo", termo: "" });
  assert.deepEqual(CMD.interpretar(">"), { modo: "acoes", termo: "" });
  assert.deepEqual(CMD.interpretar(null), { modo: "tudo", termo: "" });
});

await teste("comandos.partesDeRealce: marca o trecho achado sem acento, por palavra; texto que muda de tamanho ao normalizar não é marcado", () => {
  const j = ps => ps.map(p => (p.marca ? `[${p.texto}]` : p.texto)).join("");
  assert.equal(j(CMD.partesDeRealce("Mariana Costa", "mari")), "[Mari]ana Costa");
  assert.equal(j(CMD.partesDeRealce("João da Conceição", "conceicao")), "João da [Conceição]", "termo sem acento marca a palavra com acento");
  assert.equal(j(CMD.partesDeRealce("Ana Maria Souza", "maria sou")), "Ana [Maria] [Sou]za");
  assert.equal(j(CMD.partesDeRealce("Nada a ver", "zzz")), "Nada a ver");
  assert.equal(j(CMD.partesDeRealce("Ana 😀 Maria", "maria")), "Ana 😀 [Maria]", "emoji antes do trecho não desloca o destaque");
  assert.equal(j(CMD.partesDeRealce("Ânima", "anima")), "[Ânima]");
  assert.equal(j(CMD.partesDeRealce("abc", "")), "abc");
  assert.deepEqual(CMD.partesDeRealce("<b>x</b>", "x").map(p => p.texto).join(""), "<b>x</b>", "o texto sai intacto (quem desenha usa nós de texto)");
});

await teste("comandos.criarComandos (ctx.comandos.registrar): registra, devolve cancelar, mesmo id substitui, inválido não lança, aguardar espera a tela registrar", async () => {
  const reg = CMD.criarComandos();
  const f = () => {};
  const cancelar = reg.registrar({ id: "agenda.marcar", rotulo: "Marcar consulta", palavras: "agenda", fazer: f });
  assert.equal(reg.listar().length, 1); assert.equal(reg.obter("agenda.marcar").rotulo, "Marcar consulta");
  assert.equal(reg.obter("agenda.marcar").origem, "tela");
  const c2 = reg.registrar({ id: "agenda.marcar", rotulo: "Marcar consulta (nova)", fazer: f });
  assert.equal(reg.listar().length, 1, "mesmo id substitui"); assert.equal(reg.obter("agenda.marcar").rotulo, "Marcar consulta (nova)");
  cancelar();   // o cancelar do registro ANTIGO não derruba o novo
  assert.equal(reg.listar().length, 1, "cancelar de um registro substituído não apaga o novo");
  c2(); assert.equal(reg.listar().length, 0);
  for (const ruim of [null, {}, { rotulo: "x" }, { rotulo: " ", fazer: f }, { fazer: f }]) assert.equal(typeof reg.registrar(ruim), "function", "comando inválido devolve um cancelar vazio e não lança");
  assert.equal(reg.listar().length, 0);
  reg.registrar({ id: "conv.atalhos", rotulo: "Atalhos", atalho: "?", fazer: f });
  assert.equal(reg.temAtalho("?"), true); assert.equal(reg.temAtalho("Alt+X"), false);
  const esperando = reg.aguardar("conversas.nova", 200);
  reg.registrar({ id: "conversas.nova", rotulo: "Nova conversa", fazer: f });
  assert.equal((await esperando).id, "conversas.nova", "aguardar resolve quando a tela registra");
  assert.equal(await reg.aguardar("nao.existe", 20), null, "e devolve null no fim do prazo");
  assert.equal((await reg.aguardar("conversas.nova", 20)).id, "conversas.nova", "já registrado: resolve na hora");
  assert.equal(reg.registrar({ id: "x", rotulo: "X", icone: "<script>", fazer: f }) && reg.obter("x").icone, "raio", "ícone fora do padrão cai no padrão (vai para um <use href>)");
  let avisos = 0; const off = reg.aoMudar(() => avisos++); reg.registrar({ id: "y", rotulo: "Y", fazer: f }); off(); reg.registrar({ id: "z", rotulo: "Z", fazer: f });
  assert.equal(avisos, 1);
});

/** Ambiente da paleta como o app.js monta, com as regras de verdade (rotas.acessoRota). */
function ambiente({ papel = "admin", workspace = null, modulos = ["crm", "conversas", "relatorios", "ads", "automacoes"], prontos = ["inicio", "conversas", "crm", "empresas", "tarefas", "ads", "automacoes", "relatorios"], empresas = 1, instalar = false, suporte = false, gestorConta = false } = {}) {
  const op = { pronto: k => prontos.includes(k), temModulo: m => modulos.includes(m), pode: min => ROTAS_MOD.podePapel(papel, min), gestorConta, temCliente: true, produto: workspace };
  return { op, a: { workspace, vocab: VOC.vocab("odonto"), rotaOk: CMD.criarRotaOk({ rotas: ROTAS_MOD, op, workspace }), pode: min => ROTAS_MOD.podePapel(papel, min), empresas, instalar, suporte, temCliente: true }, prontos, modulos };
}
const FAZER_TODAS = Object.fromEntries(CMD.CATALOGO.map(c => [c.id, () => {}]));
const idsDe = amb => CMD.acoesPadrao(amb.a, FAZER_TODAS).map(x => x.id);

await teste("ações do catálogo filtradas por papel e produto (aceite do M18)", () => {
  const todas = idsDe(ambiente({ papel: "admin" }));
  for (const id of ["nova-oportunidade", "marcar-consulta", "nova-conversa", "nova-tarefa", "alternar-tema", "abrir-produto", "atalhos", "primeiros-passos", "sair"]) assert.ok(todas.includes(id), `admin no Órbita completo: ${id}`);
  assert.ok(!todas.includes("trocar-empresa") && !todas.includes("instalar") && !todas.includes("suporte"), "sem várias empresas, sem evento de instalação e sem número de suporte essas somem");
  // CRM: sem conversas nem Primeiros passos (o Início é do Atendimento/Anúncios)
  const crm = idsDe(ambiente({ workspace: "crm" }));
  assert.ok(crm.includes("nova-oportunidade") && crm.includes("marcar-consulta") && crm.includes("nova-tarefa"));
  assert.ok(!crm.includes("nova-conversa") && !crm.includes("primeiros-passos"), "no CRM não há Conversas nem Início");
  // Atendimento: conversas e agenda, não oportunidade nem tarefa
  const at = idsDe(ambiente({ workspace: "atendimento" }));
  assert.ok(at.includes("nova-conversa") && at.includes("marcar-consulta") && at.includes("primeiros-passos"));
  assert.ok(!at.includes("nova-oportunidade") && !at.includes("nova-tarefa"), "no Atendimento não há CRM (oportunidade, tarefa)");
  // Anúncios: só o que vale em qualquer lugar
  const ads = idsDe(ambiente({ workspace: "ads" }));
  assert.deepEqual(ads.filter(i => !["alternar-tema", "abrir-produto", "atalhos", "sair", "primeiros-passos"].includes(i)), [], "em Anúncios nenhuma ação de CRM/Conversas/Agenda");
  // papel: leitura não cria nada; atendente cria mas não vê Primeiros passos (é do admin)
  const leitura = idsDe(ambiente({ papel: "leitura" }));
  assert.deepEqual(leitura.filter(i => i.startsWith("nova-") || i === "marcar-consulta" || i === "primeiros-passos"), [], "papel leitura: sem ações de criar");
  const atendente = idsDe(ambiente({ papel: "atendente" }));
  assert.ok(atendente.includes("nova-oportunidade") && atendente.includes("nova-conversa") && !atendente.includes("primeiros-passos"));
  // plano e prontos: sem o módulo ou com a tela em obra, a ação some junto com a tela
  const semCrm = idsDe(ambiente({ modulos: ["conversas"] }));
  assert.ok(!semCrm.includes("nova-oportunidade") && !semCrm.includes("marcar-consulta") && !semCrm.includes("nova-tarefa") && semCrm.includes("nova-conversa"), "plano sem CRM");
  const semConversas = idsDe(ambiente({ prontos: ["inicio", "crm", "empresas", "tarefas"] }));
  assert.ok(!semConversas.includes("nova-conversa") && semConversas.includes("nova-oportunidade"), "Conversas ainda não pronta");
  // situações do aparelho e da conta
  const extra = idsDe(ambiente({ empresas: 3, instalar: true, suporte: true }));
  assert.ok(extra.includes("trocar-empresa") && extra.includes("instalar") && extra.includes("suporte"));
  // só vira ação se o shell sabe executar
  assert.deepEqual(CMD.acoesPadrao(ambiente().a, { sair: () => {} }).map(x => x.id), ["sair"]);
  // rótulo da oportunidade segue a vertical
  assert.equal(CMD.acoesPadrao(ambiente().a, FAZER_TODAS).find(x => x.id === "nova-oportunidade").rotulo, VOC.vocab("odonto").novo("negocio"));
  assert.equal(CMD.acoesPadrao({ ...ambiente().a, vocab: VOC.vocab("loja") }, FAZER_TODAS).find(x => x.id === "nova-oportunidade").rotulo, VOC.vocab("loja").novo("negocio"));
});

await teste("juntarAcoes: a ação da tela aberta manda; a genérica de mesmo nome não repete (Agenda registra «Marcar consulta», o shell também tem)", () => {
  const padrao = CMD.acoesPadrao(ambiente().a, FAZER_TODAS);
  const daTela = [{ id: "agenda.marcar", rotulo: "Marcar consulta", palavras: "", atalho: "", icone: "calendario", fazer() {}, origem: "tela" }, { id: "conversas.atender", rotulo: "Atender o próximo", fazer() {}, origem: "tela" }];
  const j = CMD.juntarAcoes(padrao, daTela);
  assert.equal(j.daTela.length, 2); assert.ok(!j.geral.some(c => c.id === "marcar-consulta"), "a genérica sai");
  assert.ok(j.geral.some(c => c.id === "nova-oportunidade"), "as outras ficam");
  assert.equal(CMD.juntarAcoes(padrao, []).geral.length, padrao.length);
});

await teste("rotas.itensDoMenu (o «Ir para» e o menu do shell): papel, plano, prontos e produto — a mesma lista para os dois", () => {
  const op = (o = {}) => ({ pronto: k => ["inicio", "conversas", "crm", "empresas", "tarefas", "ads", "automacoes", "relatorios"].includes(k), temModulo: () => true, pode: min => ROTAS_MOD.podePapel("admin", min), gestorConta: false, temCliente: true, ...o });
  const ids = (o, ws, extra = {}) => ROTAS_MOD.itensDoMenu({ op: op(o), vocab: VOC.vocab("odonto"), workspace: ws, prontos: ["inicio", "conversas", "crm"], ...extra }).map(i => i.id);
  assert.deepEqual(ids({}, "crm"), ["crm", "agenda", "empresas", "tarefas", "automacoes", "config"]);
  assert.deepEqual(ids({}, "atendimento"), ["inicio", "conversas", "agenda", "automacoes", "config"]);
  assert.deepEqual(ids({}, "ads"), ["inicio", "anuncios", "relatorios", "config"]);
  assert.ok(ids({ pode: min => ROTAS_MOD.podePapel("leitura", min) }, "ads").indexOf("anuncios") < 0, "Anúncios exige admin");
  assert.ok(!ids({ pode: min => ROTAS_MOD.podePapel("atendente", min) }, "atendimento").includes("automacoes"), "Automações exige supervisor");
  assert.ok(!ids({ temModulo: m => m !== "conversas" }, "atendimento").includes("conversas"), "plano sem Conversas");
  assert.ok(!ids({ pronto: k => k !== "agenda" && k !== "crm" }, "atendimento").includes("agenda"), "tela ainda não pronta (prontos.js)");
  assert.ok(ids({ gestorConta: true }, null).includes("admin") && !ids({}, null).includes("admin"), "Admin só para a conta gestora");
  const crm = ROTAS_MOD.itensDoMenu({ op: op(), vocab: VOC.vocab("odonto"), workspace: "crm" }).find(i => i.id === "crm");
  assert.equal(crm.rotulo, VOC.vocab("odonto").crm); assert.equal(crm.icone, VOC.vocab("odonto").icone_crm, "rótulo e ícone do CRM seguem a vertical");
  assert.ok(ROTAS_MOD.itensDoMenu({ op: op(), vocab: {}, workspace: "crm" }).find(i => i.id === "crm").icone, "vocabulário vazio não quebra");
  assert.equal(ROTAS_MOD.itensDoMenu({ op: op(), vocab: VOC.vocab("odonto"), workspace: "ads", dev: true, prontos: ["inicio"] }).find(i => i.id === "anuncios").emConstrucao, true, "dev marca «obra»");
  const d = CMD.destinos(ROTAS_MOD.itensDoMenu({ op: op(), vocab: VOC.vocab("odonto"), workspace: "atendimento" }));
  assert.deepEqual(d.find(x => x.id === "conversas"), { id: "conversas", rotulo: "Conversas", hash: "#/conversas", icone: "chat", palavras: CMD.PALAVRAS_DESTINO.conversas, emConstrucao: false });
  assert.deepEqual(CMD.filtrar(d, "whatsapp").map(x => x.id), ["conversas"], "«whatsapp» leva a Conversas pelas palavras extras");
  assert.equal(ROTAS_MOD.itensDoMenu({ op: op(), vocab: VOC.vocab("odonto"), workspace: "relatorios_nao_existe" }).length > 5, true, "produto desconhecido não filtra (como antes)");
  assert.equal(d.find(x => x.id === "config").hash, "#/config");
  assert.equal(CMD.destinos(ROTAS_MOD.itensDoMenu({ op: op(), vocab: VOC.vocab("odonto"), workspace: "ads" })).find(x => x.id === "relatorios").hash, "#/relatorios/vendas");
});

await teste("Recentes: 5 por empresa, o mais novo primeiro, sem repetir, só endereços internos, nunca lança erro", () => {
  const mem = new Map();
  const arm = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); }, removeItem: k => { mem.delete(k); } };
  const chave = CMD.chaveRecentes("conta1", "cli1");
  assert.equal(chave, "nx-rec:conta1:cli1"); assert.ok(chave.startsWith(CMD.PREFIXO_RECENTES));
  const r = CMD.criarRecentes({ armazenamento: arm, chave });
  assert.deepEqual(r.ler(), []);
  for (let i = 1; i <= 7; i++) r.registrar({ hash: `#/contatos/${i}`, titulo: `Pessoa ${i}`, sub: "Contato", tipo: "contato" });
  assert.equal(r.ler().length, 5, "5 no máximo"); assert.equal(r.ler()[0].titulo, "Pessoa 7"); assert.equal(r.ler()[4].titulo, "Pessoa 3");
  r.registrar({ hash: "#/contatos/4", titulo: "Pessoa 4 (renomeada)", sub: "Contato", tipo: "contato" });
  assert.deepEqual(r.ler().map(x => x.hash).slice(0, 2), ["#/contatos/4", "#/contatos/7"], "reabrir sobe para o topo sem duplicar"); assert.equal(r.ler().length, 5);
  assert.equal(r.ler()[0].titulo, "Pessoa 4 (renomeada)", "o título novo vale");
  const antes = arm.getItem(chave);
  r.registrar({ hash: "#/contatos/4", titulo: "Pessoa 4 (renomeada)", sub: "Contato", tipo: "contato" });
  assert.equal(arm.getItem(chave), antes, "mesmo item no topo: nem regrava");
  for (const ruim of [null, {}, { hash: "https://x.test", titulo: "a" }, { hash: "#/x", titulo: "  " }, { hash: "javascript:alert(1)", titulo: "a" }, { hash: "#/" + "a".repeat(300), titulo: "a" }]) r.registrar(ruim);
  assert.equal(r.ler().length, 5, "itens inválidos não entram");
  assert.equal(CMD.criarRecentes({ armazenamento: { getItem: () => "{lixo", setItem() {}, removeItem() {} }, chave }).ler().length, 0, "JSON quebrado = lista vazia");
  const quebrado = CMD.criarRecentes({ armazenamento: { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("cheio"); }, removeItem() { throw new Error("x"); } }, chave });
  assert.deepEqual(quebrado.ler(), []); quebrado.registrar({ hash: "#/contatos/1", titulo: "a" }); quebrado.limpar();   // não lança
  assert.equal(CMD.criarRecentes({ armazenamento: arm, chave: CMD.chaveRecentes("conta1", "cli2") }).ler().length, 0, "outra empresa, outra lista");
  assert.equal(r.registrar({ hash: "#/contatos/9", titulo: "x".repeat(200), tipo: "inventado" })[0].titulo.length, 80, "título limitado a 80");
  assert.equal(r.ler()[0].tipo, "contato", "tipo desconhecido vira contato");
  r.limpar(); assert.deepEqual(r.ler(), []);
});

await teste("recenteDaRota: contato, oportunidade e conversa abertos viram Recentes quando a tela diz o nome; título genérico e rotas de lista não", () => {
  const rec = (modulo, partes, titulo) => CMD.recenteDaRota({ modulo, partes, query: {} }, titulo);
  assert.deepEqual(rec("contatos", ["501"], "Mariana Costa"), { hash: "#/contatos/501", titulo: "Mariana Costa", sub: "Contato", tipo: "contato" });
  assert.deepEqual(rec("crm", ["negocio", "801"], "Aparelho invisível"), { hash: "#/crm/negocio/801", titulo: "Aparelho invisível", sub: "Oportunidade", tipo: "negocio" });
  assert.deepEqual(rec("conversas", ["901"], "Mariana Costa"), { hash: "#/conversas/901", titulo: "Mariana Costa", sub: "Conversa", tipo: "conversa" });
  assert.equal(rec("conversas", ["901"], "Conversas"), null, "«Conversas» é o título da tela, não de uma pessoa");
  assert.equal(rec("contatos", ["501"], "Pacientes"), null);
  assert.equal(rec("conversas", [], "Mariana"), null, "sem id: é a lista");
  assert.equal(rec("crm", [], "Pacientes"), null); assert.equal(rec("agenda", ["1"], "Agenda"), null);
  assert.equal(rec("contatos", ["../../x"], "Fulano"), null, "id fora do padrão");
  assert.equal(rec("crm", ["negocio", "8 01"], "x"), null);
  assert.equal(CMD.recenteDaRota(null, "x"), null); assert.equal(CMD.recenteDaRota({ modulo: "contatos", partes: ["1"] }, ""), null);
});

await teste("paleta.js e comandos.js: sem innerHTML, sem hex, sem import estático, sem dado cru no DOM; combobox + listbox + grupos + opções; teclado completo", () => {
  for (const [nome, js] of [["paleta.js", PALETA_JS], ["comandos.js", COMANDOS_JS]]) {
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/, `${nome}: nada de HTML montado com dado`);
    assert.doesNotMatch(js, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z])/, `${nome}: cor só por token`);
    assert.doesNotMatch(js, /^\s*import\s/m, `${nome}: sem import estático`);
    assert.doesNotMatch(js, /\bon[a-z]+\s*=\s*["']/, `${nome}: sem on*= em HTML`);
  }
  for (const trecho of ['role: "combobox"', '"aria-expanded": "true"', '"aria-controls": idLista', '"aria-autocomplete": "list"', 'role: "listbox"', 'role: "group"', '"aria-labelledby": idT', 'role: "option"', '"aria-selected"', '"aria-activedescendant"', 'role: "status"']) assert.ok(PALETA_JS.includes(trecho), `paleta.js: ${trecho}`);
  for (const tecla of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.ok(PALETA_JS.includes(`ev.key === "${tecla}"`), `paleta.js: ${tecla}`);
  assert.match(PALETA_JS, /marcar\(sel \+ 1\)/); assert.match(PALETA_JS, /marcar\(sel - 1\)/);
  assert.match(PALETA_JS, /\(i \+ itens\.length\) % itens\.length/, "as setas dão a volta");
  assert.ok(PALETA_JS.includes("C.partesDeRealce("), "destaque por nós de texto (<mark>), não por HTML");
  assert.ok(PALETA_JS.includes('"Recentes"') && PALETA_JS.includes('"Nesta tela"') && PALETA_JS.includes('"Ir para"') && PALETA_JS.includes('"Ações"'), "os quatro grupos");
});

await teste("app.js (M18): a paleta abre em todo produto, módulo carregado sob demanda com ?v=, ctx.comandos, «?», recentes, tema e Ajuda no menu da conta, pílula de teste", () => {
  const tem = (txt, trecho, porque) => assert.ok(txt.includes(trecho), `${porque || "falta"}: ${trecho}`);
  // sem a trava antiga de produto: Ctrl/⌘+K abre com sessão em /crm/, /ads/ e /atendimento/
  tem(APP_JS, 'ui.atalho("mod+k", ev => {\n    if (!E.sessao || $("app").hidden) return;', "Ctrl/⌘+K sem trava de produto");
  assert.doesNotMatch(APP_JS, /buscaDisponivel|abrirBusca\(/, "a busca antiga saiu");
  tem(APP_JS, 'E.workspace === null || E.workspace === "crm"', "contatos e negócios só no completo e no CRM (teste de A)");
  tem(APP_JS, 'E.workspace === null || E.workspace === "atendimento") && c.modulos.includes("conversas")', "Atendimento busca conversas");
  tem(APP_JS, 'E.paleta.mod = await arq("paleta.js")', "paleta.js sob demanda pelo mesmo arq() (?v=)");
  assert.match(/const ARQUIVOS_DO_APP = \[[\s\S]*?\];/.exec(APP_JS)[0], /"paleta\.js"/, "paleta.js no precache do service worker");
  assert.match(APP_JS, /const MODULOS_BASE = \[[^\]]*"comandos\.js"[^\]]*\]/, "o registro de comandos nasce no boot (a tela monta antes de alguém abrir a paleta)");
  assert.match(APP_JS, /E\.comandos = comandos\.criarComandos\(\)/);
  tem(APP_JS, "comandos: {\n      registrar(cmd) {\n        const cancelar = E.comandos.registrar(cmd);\n        E.assinaturas.add(cancelar);", "ctx.comandos.registrar some sozinho ao trocar de tela");
  tem(APP_JS, 'ui.atalho("?", ev => {', "folha de atalhos");
  tem(APP_JS, 'E.comandos.temAtalho("?") || document.querySelector("dialog[open]")', "«?» fica com a tela que o registra (Conversas) e não abre sobre outra janela");
  tem(APP_JS, "function definirTitulo(texto) { E.titulo = texto || \"\"; atualizarTitulo(); lembrarRecente(texto); }", "Recentes pelo título da tela de detalhe");
  tem(APP_JS, "const pref = E.M.comandos ? E.M.comandos.PREFIXO_RECENTES", "Recentes (nomes de pessoas) saem no logout/queda de sessão");
  tem(APP_JS, '{ rotulo: "Aparência", icone:', "tema no menu da conta"); tem(APP_JS, '{ rotulo: "Ajuda", icone: "ajuda", fn: () => abrirMenuAjuda(ancora) }', "Ajuda no menu da conta");
  tem(APP_JS, '"Primeiros passos"', "Ajuda: Primeiros passos"); tem(APP_JS, '"Atalhos de teclado"', "Ajuda: Atalhos"); tem(APP_JS, '"Falar com o suporte"', "Ajuda: suporte");
  tem(APP_JS, "Preciso de ajuda no ${app}${tela}${emp}", "o texto do suporte leva produto, tela e empresa");
  tem(APP_JS, "E.ui.linkWhatsApp(", "link pelo helper (número só com dígitos)");
  tem(APP_JS, 'class: "pilula-teste"', "pílula de teste"); tem(APP_JS, "Ocultar por 24 h", "dispensável por 24 h");
  assert.doesNotMatch(APP_JS.slice(APP_JS.indexOf("function desenharFaixas")), /Teste grátis até/, "o teste em andamento não é mais faixa de linha inteira");
  tem(APP_JS, 'aria-label": `Buscar e comandos (${teclaMod()}+K)`', "botão do topo");
  assert.match(ler("shell.css"), /\.bt-tema \{ display: none; \}/, "tema sai do topo do celular");
  assert.match(ler("shell.css"), /\.topo\.topo-emp-troca \.topo-marca, \.topo\.topo-pilula-on \.topo-marca \{ display: none; \}/);
  assert.match(HTML, /<symbol id="i-ajuda"/); assert.match(HTML, /<link rel="modulepreload" href="comandos\.js\?v=/);
  // paleta.js nunca é importado de forma estática nem sem ?v=
  assert.doesNotMatch(APP_JS, /import\(["']\.\/paleta\.js/, "só pelo arq()");
});

await teste("sw.js e ícones: o precache inclui o que a paleta usa; i-ajuda existe e o catálogo só usa ícones do sprite", () => {
  for (const c of CMD.CATALOGO) assert.ok(sprite.has(c.icone), `ícone ${c.icone} (${c.id}) no sprite`);
  for (const t of Object.values(CMD.TIPOS_RECENTE)) assert.ok(sprite.has(t.icone), `ícone ${t.icone}`);
  for (const [id, ic] of Object.entries({ inicio: "inicio", conversas: "chat", agenda: "calendario" })) assert.ok(sprite.has(ic), `${id}: ${ic}`);
});

/* ============================================================ fim */
console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
if (falhas) process.exitCode = 1;
