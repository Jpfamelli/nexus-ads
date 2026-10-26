/* ============================================================
   ÓRBITA — sw.js · frente B · M12 (plano de 01/10/2026)
   Service worker do shell. Escopo /app/ (o registro é feito pelo pwa.js, depois do boot, só em https ou localhost).
   Regras (nada de exceção):
   - NUNCA intercepta outro domínio (o banco e as funções são de outro endereço) nem o que não é GET: pedidos de dados passam direto.
   - Navegação (abrir o app, recarregar): rede primeiro, com 3 s de prazo; estourou ou está offline, entrega o index.html guardado.
   - Arquivo do próprio site com ?v= (módulos, CSS, ícones, fontes): cache primeiro, chave = URL completa, e pode vir de uma versão
     anterior. Como cada versão tem URLs próprias, uma aba antiga continua achando os arquivos da versão dela (não mistura agenda.js novo
     com ui.js antigo).
   - Fonte ou ícone SEM ?v= (/fonts/*, /app/icones/*): cache primeiro só no cache DESTA versão, nunca de uma anterior (plano 100 · A1: a
     URL igual era achada no cache da versão passada e a fonte trocada só chegava quando as duas anteriores fossem descartadas).
   - O cache tem o nome da versão (orbita-shell-<v>); a versão vem do ?v= do próprio sw.js. Mantém a atual + 2 anteriores para abas antigas.
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
/** plano 1500c · UCC-047: prefixos de cache que já foram deste app (inclui nomes antigos): o que não está na lista de manter sai, de qualquer um deles. */
const PREFIXOS_DO_APP = ["orbita-", "nexus-"];
const NOME_CACHE = PREFIXO + VERSAO;
const PRAZO_REDE_MS = 3000;
const PRAZO_ARQUIVO_MS = 8000;
const MAX_PRECACHE = 250;
const ESCOPO = new URL(self.registration.scope);
const CAMINHO_FONTES = new URL("../fonts/", ESCOPO).pathname;   // plano 1000b · UB-173
const URL_INDEX = new URL("index.html", ESCOPO).href;      // a navegação cai aqui, qualquer que seja a query (?produto=, ?org=)

function mesmoSite(url) { return url.origin === self.location.origin; }
function dentroDoEscopo(url) { return mesmoSite(url) && url.pathname.startsWith(ESCOPO.pathname); }

/** Um fetch preso não deve impedir instalação, precache ou carregamento de um módulo. */
async function fetchComPrazo(recurso, ms, opcoes = {}) {
  const ctl = new AbortController();
  let timer, expirou = false;
  const limite = new Promise((_, rejeita) => { timer = setTimeout(() => { expirou = true; ctl.abort(); rejeita(new Error("rede_sem_resposta")); }, ms); });
  try { return await Promise.race([fetch(recurso, { ...opcoes, signal: ctl.signal }), limite]); }
  finally { clearTimeout(timer); if (expirou) { try { ctl.abort(); } catch { /* já cancelado */ } } }
}
/** Arquivo versionado pelo endereço (?v=): vale para sempre sob a URL completa, mesmo vindo do cache de uma versão anterior. */
function comVersao(url) {
  if (!mesmoSite(url)) return false;
  if (/\/versao\.json$/.test(url.pathname) || /\/sw\.js$/.test(url.pathname)) return false;
  return url.searchParams.has("v") && /\.(js|css|svg|png|webp|woff2|webmanifest)$/.test(url.pathname);
}
/** Fonte ou ícone sem ?v=: guardado por versão (só no cache desta), nunca servido do cache de uma versão anterior. */
function estatico(url) {
  if (!mesmoSite(url) || url.searchParams.has("v")) return false;
  // plano 1000b · UB-173: as fontes moram em ../fonts/ do escopo (/fonts/ no Netlify, /nexus-ads/fonts/ no espelho do GitHub Pages)
  return url.pathname.startsWith("/fonts/") || url.pathname.startsWith(CAMINHO_FONTES) || url.pathname.startsWith(ESCOPO.pathname + "icones/")
    // plano 1500c · UCC-045: o manifesto do index.html entrava no precache e nunca era servido (nem versionado nem estático)
    || (url.pathname.startsWith(ESCOPO.pathname) && /\/manifest(-[a-z]+)?\.webmanifest$/.test(url.pathname));
}
/** O que vale guardar no cache (instalação e precache): o versionado e o estático. */
function versionado(url) { return comVersao(url) || estatico(url); }

/** Arquivos do shell = os links e scripts do index.html que está no ar agora. */
async function urlsDoShell() {
  const r = await fetchComPrazo(new Request(URL_INDEX, { cache: "no-store" }), PRAZO_ARQUIVO_MS);
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
    const r = await fetchComPrazo(new Request(url, { cache: "reload" }), PRAZO_ARQUIVO_MS);
    if (r && r.ok) { await cache.put(url, r.clone()); return true; }
  } catch (e) { /* offline ou arquivo ausente: a instalação não depende dele */ }
  return false;
}

/** Plano 1000 (AS-208): o precache baixa 4 arquivos por vez (um por vez levava minutos em rede lenta; todos de uma vez disputariam a banda
    com a tela que a pessoa está usando). */
const CONCORRENCIA_PRECACHE = 4;
async function guardarEmLotes(cache, urls, n = CONCORRENCIA_PRECACHE) {
  const fila = urls.slice();
  const trabalhador = async () => { while (fila.length) await guardar(cache, fila.shift()); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, fila.length)) }, trabalhador));
}

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(NOME_CACHE);
    const { index, urls } = await urlsDoShell();
    await cache.put(URL_INDEX, index);
    // o essencial tem de entrar (senão a instalação falha e tenta de novo depois); o resto é no que der
    // plano 1500c · UCC-051: além de app.js/app.css/shell.css, os módulos que a 1ª tela não abre sem eles (ui, api, rotas, rede)
    const essenciais = urls.filter(u => /\/(app\.js|app\.css|shell\.css|ui\.js|api\.js|rotas\.js|rede\.js)\?/.test(u));
    const falhou = [];
    await Promise.all(essenciais.map(async u => { if (!(await guardar(cache, u))) falhou.push(u); }));
    if (falhou.length) throw new Error("shell_incompleto");
    await guardarEmLotes(cache, urls.filter(u => !essenciais.includes(u)));   // plano 1000b · UB-175: 4 por vez, como o precache
  })());
});

/** plano 1500c · UCC-047: o que o activate apaga — fica esta versão e as 2 anteriores do shell; todo o resto com prefixo do app sai. */
function cachesParaApagar(chaves, atual = NOME_CACHE) {
  const versoes = chaves.filter(nome => nome.startsWith(PREFIXO) && nome !== atual).sort();
  const manter = new Set([atual, ...versoes.slice(-2)]);
  return chaves.filter(nome => !manter.has(nome) && PREFIXOS_DO_APP.some(p => nome.startsWith(p)));
}
self.cachesParaApagar = cachesParaApagar;   // os testes conferem a regra sem um navegador

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const nome of cachesParaApagar(await caches.keys())) await caches.delete(nome);
    // plano 1500c · UCC-046: a navegação não espera o service worker acordar para sair à rede
    try { if (self.registration.navigationPreload && typeof self.registration.navigationPreload.enable === "function") await self.registration.navigationPreload.enable(); } catch (e) { /* sem suporte */ }
    await self.clients.claim();
  })());
});

/* Plano 1000 (AS-204): idioma, claro/escuro do aparelho e um «Tentar de novo» de 44 px. Estilo num <style> da própria resposta: esta página não
   passa pela CSP do app (é gerada aqui, sem cabeçalho) e não carrega nada de fora. */
/** plano 1500c · UCC-049: a cor e o nome da marca que a página mandou (mensagem {tipo:"marca"}): a página offline sai com eles. */
let marcaOffline = null;
function corSegura(c) { return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; }
function textoSeguro(t) { return String(t || "").replace(/[<>&"]/g, "").slice(0, 40); }
function paginaOffline() {
  const m = marcaOffline;
  if (!m) return PAGINA_OFFLINE;
  const fundo = corSegura(m.fundo), texto = corSegura(m.texto), nome = textoSeguro(m.produto);
  let p = PAGINA_OFFLINE;
  if (fundo && texto) p = p.replace("</style>", "body{background:" + fundo + ";color:" + texto + "}a{background:" + texto + ";color:" + fundo + "}</style>");
  if (nome) p = p.replace("<title>Sem conexão</title>", "<title>Sem conexão · " + nome + "</title>").replace("<main><h1>", "<main><p>" + nome + "</p><h1>");
  return p;
}
self.paginaOffline = paginaOffline;   // testes
const PAGINA_OFFLINE = "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
  + "<meta name=\"color-scheme\" content=\"light dark\"><title>Sem conexão</title>"
  // cores do SISTEMA (Canvas/CanvasText): com color-scheme light dark elas seguem o claro/escuro do aparelho, sem cor escrita aqui
  + "<style>:root{color-scheme:light dark}"
  + "body{font-family:system-ui,sans-serif;display:grid;place-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center;background:Canvas;color:CanvasText}"
  + "h1{font-size:1.25rem;margin:0 0 .5rem}p{opacity:.8;margin:0 0 1.25rem}"
  + "a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 1.25rem;border-radius:999px;background:CanvasText;color:Canvas;font-weight:600;text-decoration:none}"
  + "a:focus-visible{outline:3px solid Highlight;outline-offset:3px}</style>"
  // plano 1000b · UB-174: diz que nada se perdeu e que o app volta quando a internet voltar
  + "<body><main><h1>Sem conexão</h1><p>Quando a internet voltar, toque em Tentar de novo. Nada do que você salvou se perdeu.</p><a href=\"\">Tentar de novo</a></main>"
  // plano 2000d · SX-062: a página se recarrega sozinha quando o aparelho avisa que a internet voltou (ninguém precisa lembrar de tocar)
  + "<script>addEventListener(\"online\",function(){location.reload()})</script></body></html>";

async function navegacao(ev) {
  const cache = await caches.open(NOME_CACHE);
  // plano 1500c · UCC-046: a resposta pré-carregada (navigationPreload) quando existir; senão o fetch de sempre
  const rede = Promise.resolve(ev.preloadResponse).then(pre => pre || fetch(ev.request)).then(async r => {   // sem abortar: estourado o prazo, a resposta ainda atualiza o shell guardado
    // só guarda página de verdade: HTML e 200 (um redirecionamento ou erro nunca vira o "shell offline")
    if (r && r.ok && !r.redirected && /text\/html/i.test(r.headers.get("content-type") || "")) { try { await cache.put(URL_INDEX, r.clone()); } catch (e) { /* cheio */ } }
    return r;
  });
  ev.waitUntil(rede.then(() => null, () => null));
  const ate = ms => { let t; return Promise.race([rede, new Promise(ok => { t = setTimeout(() => ok(null), ms); })]).finally(() => clearTimeout(t)); };
  try { const r = await ate(PRAZO_REDE_MS); if (r) return r; } catch (e) { /* offline: cai no que está guardado */ }
  const guardada = await cache.match(URL_INDEX);
  if (guardada) return guardada;
  // sem shell guardado, a rede lenta ainda pode atender: espera mais um pouco antes da tela «Sem conexão»
  try { const r = await ate(PRAZO_ARQUIVO_MS); if (r) return r; } catch (e) { /* sem cache e sem rede */ }
  return new Response(paginaOffline(), { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Aba antiga: o arquivo da versão dela está num dos caches anteriores que o activate conserva. */
async function acharEmVersoesAnteriores(url) {
  for (const nome of (await caches.keys()).filter(n => n.startsWith(PREFIXO) && n !== NOME_CACHE).sort().reverse()) {
    const r = await (await caches.open(nome)).match(url);
    if (r) return r;
  }
  return undefined;
}

/** plano 1500c · UCC-048: arquivo que não veio (offline, prazo): um módulo .js recebe JavaScript que lança um erro legível (o import() mostra
    «Arquivo do app indisponível…» em vez de um erro de MIME); um .css recebe CSS vazio; o resto, o texto de antes. */
function respostaIndisponivel(url) {
  const msg = "Arquivo do app indisponível agora (sem conexão). Confira a internet e tente de novo.";
  if (/\.m?js$/.test(url.pathname)) return new Response("throw new Error(" + JSON.stringify(msg) + ");", { status: 503, headers: { "content-type": "application/javascript; charset=utf-8" } });
  if (/\.css$/.test(url.pathname)) return new Response("/* indisponível: sem conexão */", { status: 503, headers: { "content-type": "text/css; charset=utf-8" } });
  return new Response("Recurso temporariamente indisponível. Tente novamente.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** `anteriores`: só o arquivo com ?v= pode vir do cache de outra versão; fonte/ícone sem ?v= fica preso a esta (A1). */
async function cachePrimeiro(ev, { anteriores = true } = {}) {
  const cache = await caches.open(NOME_CACHE);
  const url = ev.request.url;
  const achado = await cache.match(url) || (anteriores ? await acharEmVersoesAnteriores(url) : undefined);
  if (achado) return achado;
  let r;
  try { r = await fetchComPrazo(ev.request, PRAZO_ARQUIVO_MS); }
  catch { return respostaIndisponivel(new URL(url)); }
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
  // plano 1500c · UCC-050: versao.json sempre da rede, sem cache HTTP (é ele que diz que há versão nova); sem rede, 503 em JSON
  if (/\/versao\.json$/.test(url.pathname)) {
    ev.respondWith(fetch(req, { cache: "no-store" }).catch(() => new Response('{"erro":"sem_conexao"}', { status: 503, headers: { "content-type": "application/json" } })));
    return;
  }
  if (comVersao(url)) ev.respondWith(cachePrimeiro(ev));
  else if (estatico(url)) ev.respondWith(cachePrimeiro(ev, { anteriores: false }));
});

/** Mensagens da página: pular (aplicar a versão nova) e precache (telas que ainda não foram abertas). */
self.addEventListener("message", ev => {
  const d = ev.data || {};
  if (d.tipo === "pular") { self.skipWaiting(); return; }
  // plano 1500c · UCC-049; plano 2000d · DU-251: o ícone da marca (https ou imagem embutida) também fica para os avisos de push
  if (d.tipo === "marca") { marcaOffline = { fundo: d.fundo, texto: d.texto, produto: d.produto, icone: iconeSeguro(d.icone) }; return; }
  if (d.tipo === "precache" && Array.isArray(d.urls)) {
    ev.waitUntil((async () => {
      const cache = await caches.open(NOME_CACHE);
      const lista = [];
      for (const bruto of d.urls.slice(0, MAX_PRECACHE)) {
        try { const u = new URL(String(bruto), URL_INDEX); if (versionado(u)) lista.push(u.href); } catch (e) { /* ignora */ }
      }
      await guardarEmLotes(cache, lista);
    })());
  }
});

/* plano 1500c · UCC-123: clicar no aviso (mostrado pelo SW no Android, ou vindo de push) foca a aba do app que já está aberta e leva à
   conversa/tela de data.hash; sem aba aberta, abre o app já no endereço. Só endereços #/… do próprio app (nada de ir para fora). */
function hashDoAviso(data) {
  const h = data && typeof data.hash === "string" ? data.hash : "";
  return /^#\/[\w\-/?=&%.]*$/.test(h) ? h : "#/conversas";
}
self.hashDoAviso = hashDoAviso;   // plano 2000d · DU-267: testes
/** plano 2000d · DU-251: ícone aceitável num aviso — https ou imagem embutida (png/jpeg/webp); o resto vira null. */
function iconeSeguro(u) {
  if (typeof u !== "string") return null;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 200000) return u;
  return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null;
}
/** plano 2000d · DU-253: o id da conversa de um aviso (para «Marcar como lida»), só o formato de id. */
function conversaDoAviso(data) {
  const c = data && (data.conversa || data.conversa_id);
  if (typeof c === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(c)) return c;
  const m = /^#\/conversas\/([A-Za-z0-9_-]{1,64})/.exec(hashDoAviso(data));
  return m ? m[1] : null;
}
self.addEventListener("notificationclick", ev => {
  const data = ev.notification && ev.notification.data;
  const hash = hashDoAviso(data);
  const acao = ev.action || "";
  try { ev.notification.close(); } catch (e) { /* ok */ }
  ev.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const doApp = abertas.find(c => { try { return dentroDoEscopo(new URL(c.url)); } catch (e) { return false; } });
    // plano 2000d · DU-253: «Marcar como lida» não abre nada — a aba aberta (que tem a sessão) faz o pedido ao servidor
    if (acao === "ler") {
      const conversa = conversaDoAviso(data);
      if (doApp && conversa) { try { doApp.postMessage({ tipo: "ler", conversa }); } catch (e) { /* ok */ } return; }
      // sem aba aberta não há sessão para marcar: abre a conversa (o mesmo do toque no aviso)
    }
    if (doApp) {
      try { doApp.postMessage({ tipo: "abrir", hash }); } catch (e) { /* ok */ }
      try { await doApp.focus(); } catch (e) { /* o navegador pode negar o foco */ }
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(URL_INDEX + hash);
  })());
});

/* plano 1500c · UCC-122: Web Push com o app fechado. O SW já sabe mostrar o aviso que chegar ({titulo, corpo, hash, tag});
   a inscrição (chave VAPID + nx_push_inscrever) depende do servidor — sem ela nada chega e nada muda. */
/* plano 2000d · DU-251/DU-252/DU-253/DU-256: o aviso usa o ícone da marca (do servidor ou o guardado pela página), o badge monocromático do Android,
   as ações «Marcar como lida»/«Abrir» quando é uma conversa e a tag POR CONVERSA; com mais de 3 conversas avisadas, vira um aviso-resumo. */
const MAX_AVISOS_SOLTOS = 3, TAG_RESUMO = "nx-push-resumo";
function opcoesDoAviso(d, { iconePadrao, badge } = {}) {
  const conversa = conversaDoAviso(d);
  const tag = String(d.tag || (conversa ? `nx-conv-${conversa}` : "nx-push")).slice(0, 80);
  const o = {
    body: String(d.corpo || "").slice(0, 200), tag, renotify: true,
    icon: iconeSeguro(d.icone) || (marcaOffline && marcaOffline.icone) || iconePadrao,
    badge, data: { hash: hashDoAviso(d), conversa },
  };
  if (conversa) o.actions = [{ action: "ler", title: "Marcar como lida" }, { action: "abrir", title: "Abrir" }];
  return o;
}
self.opcoesDoAviso = opcoesDoAviso;   // testes
self.addEventListener("push", ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { corpo: ev.data ? ev.data.text() : "" }; }
  const titulo = String(d.titulo || "Mensagem nova").slice(0, 80);
  const o = opcoesDoAviso(d, { iconePadrao: new URL("icones/icon-192.png", ESCOPO).href, badge: new URL("icones/badge-96.png", ESCOPO).href });
  ev.waitUntil((async () => {
    let abertos = [];
    try { abertos = typeof self.registration.getNotifications === "function" ? await self.registration.getNotifications() : []; } catch (e) { abertos = []; }
    const conversas = new Set(abertos.map(n => n && n.data && n.data.conversa).filter(Boolean));
    if (o.data.conversa) conversas.add(o.data.conversa);
    if (o.data.conversa && conversas.size > MAX_AVISOS_SOLTOS) {
      // muitas conversas: os avisos soltos dão lugar a um só («5 conversas novas»), que abre a lista
      for (const n of abertos) { try { if (n.data && n.data.conversa) n.close(); } catch (e) { /* ok */ } }
      await self.registration.showNotification(`${conversas.size} conversas novas`, { body: "Toque para ver as conversas.", tag: TAG_RESUMO, renotify: true,
        icon: o.icon, badge: o.badge, data: { hash: "#/conversas", conversas: [...conversas].slice(0, 50) } });
      return;
    }
    await self.registration.showNotification(titulo, o);
  })());
});

/* plano 2000d · DU-254: o navegador renovou (ou perdeu) a inscrição de push — reinscreve com a mesma chave e conta para a aba aberta gravar
   no servidor (nx_push_inscrever precisa da sessão, que só a página tem). Sem aba aberta, a página regrava na próxima abertura. */
self.addEventListener("pushsubscriptionchange", ev => {
  ev.waitUntil((async () => {
    let nova = ev.newSubscription || null;
    try {
      const chave = ev.oldSubscription && ev.oldSubscription.options ? ev.oldSubscription.options.applicationServerKey : null;
      if (!nova && chave && self.registration.pushManager) nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    } catch (e) { nova = null; }
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) { try { c.postMessage({ tipo: "push-renovar", inscricao: nova && typeof nova.toJSON === "function" ? nova.toJSON() : null }); } catch (e) { /* ok */ } }
  })());
});
