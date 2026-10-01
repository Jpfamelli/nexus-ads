/* ============================================================
   ÓRBITA — sw.js · frente B · M12 (plano de 01/10/2026)
   Service worker do shell. Escopo /app/ (o registro é feito pelo pwa.js, depois do boot, só em https ou localhost).
   Regras (nada de exceção):
   - NUNCA intercepta outro domínio (o banco e as funções são de outro endereço) nem o que não é GET: pedidos de dados passam direto.
   - Navegação (abrir o app, recarregar): rede primeiro, com 3 s de prazo; estourou ou está offline, entrega o index.html guardado.
   - Arquivo do próprio site com ?v= (módulos, CSS, ícones) e /fonts/*: cache primeiro, chave = URL completa. Como cada versão tem URLs
     próprias, uma aba antiga continua achando os arquivos da versão dela (não mistura agenda.js novo com ui.js antigo).
   - O cache tem o nome da versão (orbita-shell-<v>); a versão vem do ?v= do próprio sw.js. Versões antigas são apagadas no activate.
   - Instalação: o index.html do ar diz quais arquivos formam o shell (links e scripts dele); não há lista para esquecer de atualizar.
     A página manda o resto por mensagem ({tipo:"precache", urls:[…]}): telas e CSS que ainda não foram abertas.
   - Nunca chama skipWaiting sozinho: só com a mensagem {tipo:"pular"} (o clique em «Atualizar» ou a regra de ociosidade do pwa.js).

   CHAVE DE EMERGÊNCIA (se este arquivo um dia servir algo quebrado):
   1. Troque o conteúdo de web/app/sw.js por EXATAMENTE o texto abaixo e publique (o navegador confere o sw.js a cada abertura do app):
        self.addEventListener("install", () => self.skipWaiting());
        self.addEventListener("activate", ev => ev.waitUntil((async () => {
          for (const n of await caches.keys()) await caches.delete(n);
          await self.registration.unregister();
          for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
        })()));
   2. Opcional, antes de precisar do passo 1: web/app/versao.json com "sw": false. Quem abrir o app (ou voltar à aba) desregistra o
      service worker e apaga os caches sozinho, uma vez, e recarrega.
   Depois de resolver, volte ao sw.js normal com "sw": true e suba o ?v= (index.html + versao.json) para forçar a reinstalação.
   ============================================================ */
"use strict";

const VERSAO = (() => { try { return new URL(self.location.href).searchParams.get("v") || "dev"; } catch (e) { return "dev"; } })();
const PREFIXO = "orbita-shell-";
const NOME_CACHE = PREFIXO + VERSAO;
const PRAZO_REDE_MS = 3000;
const MAX_PRECACHE = 250;
const ESCOPO = new URL(self.registration.scope);
const URL_INDEX = new URL("index.html", ESCOPO).href;      // a navegação cai aqui, qualquer que seja a query (?produto=, ?org=)

function mesmoSite(url) { return url.origin === self.location.origin; }
function dentroDoEscopo(url) { return mesmoSite(url) && url.pathname.startsWith(ESCOPO.pathname); }
/** O que vale guardar para sempre sob a URL completa: arquivos versionados, fontes e ícones. */
function versionado(url) {
  if (!mesmoSite(url)) return false;
  if (/\/versao\.json$/.test(url.pathname) || /\/sw\.js$/.test(url.pathname)) return false;
  if (url.pathname.startsWith("/fonts/")) return true;
  if (url.pathname.startsWith(ESCOPO.pathname + "icones/")) return true;
  return url.searchParams.has("v") && /\.(js|css|svg|png|webp|woff2|webmanifest)$/.test(url.pathname);
}

/** Arquivos do shell = os links e scripts do index.html que está no ar agora. */
async function urlsDoShell() {
  const r = await fetch(new Request(URL_INDEX, { cache: "no-store" }));
  if (!r.ok) throw new Error("index_indisponivel");
  const html = await r.clone().text();
  const urls = new Set();
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"#]+)"/g)) {
    try { const u = new URL(m[1], URL_INDEX); if (mesmoSite(u) && !/^data:/.test(m[1])) urls.add(u.href); } catch (e) { /* ignora */ }
  }
  return { index: r, urls: [...urls] };
}

async function guardar(cache, url) {
  try {
    if (await cache.match(url)) return true;
    const r = await fetch(new Request(url, { cache: "reload" }));
    if (r && r.ok) { await cache.put(url, r.clone()); return true; }
  } catch (e) { /* offline ou arquivo ausente: a instalação não depende dele */ }
  return false;
}

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(NOME_CACHE);
    const { index, urls } = await urlsDoShell();
    await cache.put(URL_INDEX, index);
    // o essencial tem de entrar (senão a instalação falha e tenta de novo depois); o resto é no que der
    const essenciais = urls.filter(u => /\/(app\.js|app\.css|shell\.css)\?/.test(u));
    const falhou = [];
    await Promise.all(essenciais.map(async u => { if (!(await guardar(cache, u))) falhou.push(u); }));
    if (falhou.length) throw new Error("shell_incompleto");
    await Promise.all(urls.filter(u => !essenciais.includes(u)).map(u => guardar(cache, u)));
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome.startsWith(PREFIXO) && nome !== NOME_CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

const PAGINA_OFFLINE = "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Sem conexão</title>"
  + "<body style=\"font-family:system-ui,sans-serif;display:grid;place-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center\">"
  + "<h1 style=\"font-size:1.25rem\">Sem conexão</h1><p>Confira a internet e tente de novo.</p><p><a href=\"\">Tentar de novo</a></p>";

async function navegacao(ev) {
  const cache = await caches.open(NOME_CACHE);
  const rede = fetch(ev.request).then(async r => {
    // só guarda página de verdade: HTML e 200 (um redirecionamento ou erro nunca vira o "shell offline")
    if (r && r.ok && !r.redirected && /text\/html/i.test(r.headers.get("content-type") || "")) { try { await cache.put(URL_INDEX, r.clone()); } catch (e) { /* cheio */ } }
    return r;
  });
  ev.waitUntil(rede.then(() => null, () => null));
  let prazo;
  const limite = new Promise(ok => { prazo = setTimeout(() => ok(null), PRAZO_REDE_MS); });
  try {
    const r = await Promise.race([rede, limite]);
    if (r) return r;
  } catch (e) { /* offline: cai no que está guardado */ } finally { clearTimeout(prazo); }
  const guardada = await cache.match(URL_INDEX);
  if (guardada) return guardada;
  try { return await rede; } catch (e) { /* sem cache e sem rede */ }
  return new Response(PAGINA_OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function cachePrimeiro(ev) {
  const cache = await caches.open(NOME_CACHE);
  const url = ev.request.url;
  const achado = await cache.match(url);
  if (achado) return achado;
  const r = await fetch(ev.request);
  if (r && r.ok && r.type !== "opaque") ev.waitUntil(cache.put(url, r.clone()).catch(() => null));
  return r;
}

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (!mesmoSite(url)) return;                                // nunca o endereço do banco nem qualquer outro domínio
  if (url.pathname.startsWith("/__dev_falso/")) return;       // ambiente fictício local
  if (req.mode === "navigate") { if (dentroDoEscopo(url)) ev.respondWith(navegacao(ev)); return; }
  if (versionado(url)) ev.respondWith(cachePrimeiro(ev));
});

/** Mensagens da página: pular (aplicar a versão nova) e precache (telas que ainda não foram abertas). */
self.addEventListener("message", ev => {
  const d = ev.data || {};
  if (d.tipo === "pular") { self.skipWaiting(); return; }
  if (d.tipo === "precache" && Array.isArray(d.urls)) {
    ev.waitUntil((async () => {
      const cache = await caches.open(NOME_CACHE);
      const lista = [];
      for (const bruto of d.urls.slice(0, MAX_PRECACHE)) {
        try { const u = new URL(String(bruto), URL_INDEX); if (versionado(u)) lista.push(u.href); } catch (e) { /* ignora */ }
      }
      for (const u of lista) await guardar(cache, u);
    })());
  }
});
