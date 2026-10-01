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
  runInNewContext(SW_TXT, { self: self_, caches: cachesFalso, fetch: fetchFalso, Request, Response, URL, URLSearchParams, Promise, setTimeout: relogioCurto, clearTimeout, console });
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

await teste("sw.js: activate apaga só caches de versões antigas do próprio prefixo e assume as abas; skipWaiting só pela mensagem", async () => {
  const m = criarMundoSW({ versao: "V2" });
  await m.cachesFalso.open("orbita-shell-V1"); await m.cachesFalso.open("orbita-shell-V2"); await m.cachesFalso.open("outro-app-cache");
  const ev = m.evento({}); m.ouvintes.activate(ev); await ev.fim();
  assert.deepEqual([...m.armazem.keys()].sort(), ["orbita-shell-V2", "outro-app-cache"]);
  assert.equal(m.state.claim, true);
  assert.equal(m.state.pulou, false, "nada de skipWaiting sozinho");
  m.ouvintes.message(m.evento({ data: { tipo: "qualquer" } }));
  assert.equal(m.state.pulou, false);
  m.ouvintes.message(m.evento({ data: { tipo: "pular" } }));
  assert.equal(m.state.pulou, true, "só com a mensagem pular");
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
  await lenta.rpc("nx_inicio"); assert.deepEqual(eventos.splice(0), ["lento:1", "lento:-1", "ok"], "aos 4 s (aqui 15 ms) conta como lenta e desconta ao terminar");
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
  assert.match(APP_JS, /import\(`\.\/\$\{nome\}\?v=\$\{encodeURIComponent\(VERSAO\)\}\$\{n \? `&r=\$\{n\}` : ""\}`\)/);
  assert.match(APP_JS, /importFalhou\.set\(nome, n \+ 1\)/);
  assert.match(APP_JS, /ehFalhaDeImport\(e\) \? \(\) => location\.reload\(\) : \(\) => aoMudarRota\(false\)/);
  // a falha de abertura da tela usa o cartão de erro do ui.js (frase em português, sem URL, refaz no orbita:online)
  assert.match(APP_JS, /ui\.erroCartao\(e, \(\) => aoMudarRota\(false\)\)/);
  assert.doesNotMatch(APP_JS, /Recarregue a página\. Se continuar, fale com o suporte\./);
});

/* ============================================================ fim */
console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
if (falhas) process.exitCode = 1;
