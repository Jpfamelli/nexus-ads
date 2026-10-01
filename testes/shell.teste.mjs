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

/* ============================================================ fim */
console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
if (falhas) process.exitCode = 1;
