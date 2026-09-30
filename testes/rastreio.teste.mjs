/* ============================================================
   ÓRBITA — testes do web/rastreio.js (script colado no site do cliente)
   Rodar: node --test testes/rastreio.teste.mjs
   Sem navegador e sem rede: o script roda num contexto vm com window/document/localStorage/fetch falsos.
   Prova: captura e validade (30 dias) dos parâmetros, código curto pedido ao Órbita, reescrita dos links
   do WhatsApp, e que o link NUNCA quebra (Órbita fora, lento, resposta ruim, sem chave, sem storage).
   O banco (limite de taxa, atribuição) está em supabase/testes/11_agenda_rastreio.sql.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = readFileSync(join(RAIZ, "web/rastreio.js"), "utf8");
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";   // 48 hex, sintética
const WA = "https://wa.me/5512999990000?text=Ol%C3%A1%2C%20quero%20agendar";

/** Elemento falso mínimo (âncora ou nó qualquer). */
function el(tag, attrs = {}, pai = null) {
  const a = { ...attrs };
  return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: pai, closed: false,
    getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, _a: a };
}

/**
 * Monta o "navegador" e carrega o script.
 * opcoes: {search, dados (localStorage inicial), fetch, semStorage, config (data-*), gpc, agora}
 */
function montar({ search = "", guardado = null, fetch, semStorage = false, config = { chave: CHAVE_SITE }, gpc = false, espera } = {}) {
  const ouvintes = {};
  const loja = new Map();
  if (guardado) loja.set("orbita:rastreio:v1", JSON.stringify(guardado));
  const localStorage = semStorage
    ? { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } }
    : { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)) };
  const navegacao = [], abertas = [];
  const chamadas = [];
  const cfgAttrs = {};
  for (const [k, v] of Object.entries(config)) cfgAttrs[`data-${k}`] = v;
  if (espera) cfgAttrs["data-espera"] = String(espera);
  const script = el("script", cfgAttrs);
  const janela = {
    document: { currentScript: script, addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); } },
    localStorage,
    location: { search, origin: "https://site.com", pathname: "/implante", href: "https://site.com/implante" + search,
      assign: u => navegacao.push(u) },
    navigator: gpc ? { globalPrivacyControl: true } : {},
    open: (u, alvo, feat) => { const w = { closed: false, opener: {}, location: { replace: v => { w.destino = v; } }, url: u, alvo, feat }; abertas.push(w); return w; },
    fetch: (url, init) => { chamadas.push({ url, init, corpo: JSON.parse(init.body) }); return fetch ? fetch(url, init) : Promise.reject(new Error("sem rede")); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp,
    console: { warn() { /* silencioso nos testes */ } },
  };
  janela.window = janela;
  const ctx = vm.createContext(janela);
  vm.runInContext(FONTE, ctx, { filename: "rastreio.js" });
  const clicar = (alvo, extra = {}) => {
    const ev = { target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const f of ouvintes.click || []) f(ev);
    return ev;
  };
  const passar = (alvo) => { for (const t of ["pointerover", "touchstart", "focusin"]) for (const f of ouvintes[t] || []) f({ target: alvo }); };
  const guardadoAgora = () => JSON.parse(loja.get("orbita:rastreio:v1") || "null");
  return { janela, ouvintes, clicar, passar, navegacao, abertas, chamadas, guardadoAgora, loja, api: janela.OrbitaRastreio };
}
const respostaOk = codigo => async () => ({ ok: true, json: async () => ({ ok: true, codigo }) });
const esperar = ms => new Promise(r => setTimeout(r, ms));

test("captura: só os parâmetros conhecidos, limpos e limitados; visita sem parâmetros mantém os últimos; 30 dias", () => {
  const m = montar({ search: "?utm_source=google&utm_medium=cpc&utm_campaign=Implante%20Taubat%C3%A9&gclid=Cj0KCQ-abc&x=1&cpf=12345678900&utm_term=" });
  const g = m.guardadoAgora();
  assert.deepEqual(g.d, { utm_source: "google", utm_medium: "cpc", utm_campaign: "Implante Taubaté", gclid: "Cj0KCQ-abc" }, "só os conhecidos e não vazios");
  assert.ok(!JSON.stringify(g).includes("12345678900"), "parâmetro desconhecido (cpf) não é guardado");
  assert.deepEqual(JSON.parse(JSON.stringify(m.api.dados())), g.d);
  // visita sem parâmetros: mantém
  const m2 = montar({ search: "", guardado: g });
  assert.deepEqual(m2.guardadoAgora().d, g.d);
  // parâmetros novos substituem
  const m3 = montar({ search: "?gclid=NOVO&utm_source=google", guardado: g });
  assert.deepEqual(m3.guardadoAgora().d, { gclid: "NOVO", utm_source: "google" });
  assert.equal(m3.guardadoAgora().c, null, "origem nova pede código novo");
  // 31 dias depois, sem parâmetros: some
  const velho = { ...g, t: Date.now() - 31 * 86400000 };
  assert.deepEqual(montar({ search: "", guardado: velho }).guardadoAgora().d, {});
  // 29 dias depois: ainda vale
  assert.deepEqual(montar({ search: "", guardado: { ...g, t: Date.now() - 29 * 86400000 } }).guardadoAgora().d, g.d);
  // capturar puro: truncamento e controle
  const c = montar({}).api.capturar("?utm_campaign=" + "x".repeat(400) + "&fbclid=a%00b%0Ac");
  assert.equal(c.utm_campaign.length, 150); assert.ok(!/[\u0000-\u001f]/.test(c.fbclid));
});

test("links: reconhece wa.me / api.whatsapp.com / whatsapp://send e ignora o resto", () => {
  const { api } = montar({});
  for (const ok of ["https://wa.me/5512999990000", "http://wa.me/5512999990000?text=oi", "https://api.whatsapp.com/send?phone=5512999990000",
    "https://web.whatsapp.com/send?phone=5512999990000&text=oi", "whatsapp://send?phone=5512999990000", "https://wa.me/message/ABC123"]) {
    assert.equal(api.ehLinkWhatsapp(ok), true, ok);
  }
  for (const nao of ["https://exemplo.com/wa.me", "https://wa.me.evil.com/5512999990000", "https://evil.com/?u=https://wa.me/1", "mailto:a@b.com",
    "tel:+5512999990000", "https://faq.whatsapp.com/123", "", null, "/contato"]) {
    assert.equal(api.ehLinkWhatsapp(nao), false, String(nao));
  }
});

test("reescrever: acrescenta [ref CODIGO] ao texto, cria o texto quando falta, troca código antigo, preserva o resto do link", () => {
  const { api } = montar({});
  const dec = u => decodeURIComponent(u.split("text=")[1].split("&")[0]);
  assert.equal(dec(api.reescrever(WA, "K7Q2P")), "Olá, quero agendar [ref K7Q2P]");
  assert.ok(api.reescrever(WA, "K7Q2P").startsWith("https://wa.me/5512999990000?text="));
  assert.equal(dec(api.reescrever("https://wa.me/5512999990000", "K7Q2P")), "Olá! Vim pelo site. [ref K7Q2P]", "sem texto: usa o padrão");
  assert.equal(dec(api.reescrever("https://wa.me/5512999990000?text=oi%20%5Bref%20AAAAA%5D", "K7Q2P")), "oi [ref K7Q2P]", "troca o código antigo");
  const api2 = api.reescrever("https://api.whatsapp.com/send?phone=5512999990000&text=Ol%C3%A1&app_absent=0#topo", "K7Q2P");
  assert.match(api2, /^https:\/\/api\.whatsapp\.com\/send\?phone=5512999990000&app_absent=0&text=Ol%C3%A1%20%5Bref%20K7Q2P%5D#topo$/, "parâmetros e âncora preservados");
  assert.equal(dec(api.reescrever("whatsapp://send?phone=5512999990000&text=oi", "K7Q2P")), "oi [ref K7Q2P]");
  assert.equal(api.reescrever("https://exemplo.com/?text=oi", "K7Q2P"), "https://exemplo.com/?text=oi", "não mexe em link que não é do WhatsApp");
  assert.equal(api.reescrever(WA, "ILO01"), WA, "código inválido: link original");
  assert.equal(api.reescrever(WA, ""), WA);
  assert.match(api.reescrever("https://wa.me/1?text=a+b", "K7Q2P"), /text=a%20b%20%5Bref%20K7Q2P%5D$/, "+ vira espaço");
});

test("clique: pede o código ao Órbita com a chave e os parâmetros (sem query na página), espera e segue com [ref K7Q2P]", async () => {
  const m = montar({ search: "?utm_source=google&utm_medium=cpc&utm_campaign=Implante&gclid=Cj0KCQ-abc&cpf=999", fetch: respostaOk("K7Q2P") });
  const a = el("a", { href: WA });
  const ev = m.clicar(a);
  assert.equal(ev.defaultPrevented, true, "espera o código antes de navegar");
  await esperar(20);
  assert.equal(m.chamadas.length, 1);
  const c = m.chamadas[0];
  assert.match(c.url, /\/rest\/v1\/rpc\/nx_rastreio_registrar$/);
  assert.equal(c.init.method, "POST"); assert.equal(c.init.credentials, "omit", "sem cookies");
  assert.match(c.init.headers.apikey, /^sb_publishable_/); assert.equal(c.init.headers["Content-Type"], "application/json");
  assert.deepEqual(c.corpo, { p_chave: CHAVE_SITE, p_dados: { utm_source: "google", utm_medium: "cpc", utm_campaign: "Implante", gclid: "Cj0KCQ-abc", pagina: "https://site.com/implante" } });
  assert.ok(!JSON.stringify(c.corpo).includes("999"), "nada além dos parâmetros conhecidos");
  assert.equal(m.navegacao.length, 1);
  assert.match(m.navegacao[0], /^https:\/\/wa\.me\/5512999990000\?text=Ol%C3%A1%2C%20quero%20agendar%20%5Bref%20K7Q2P%5D$/);
  assert.equal(m.guardadoAgora().c.c, "K7Q2P", "código guardado para os próximos cliques");
});

test("clique com código já guardado: síncrono (não espera), reescreve o href e não chama o Órbita de novo", async () => {
  const m = montar({ search: "?gclid=G1", fetch: respostaOk("K7Q2P") });
  m.passar(el("a", { href: WA }));            // intenção (passar o mouse) aquece o código
  await esperar(20);
  assert.equal(m.chamadas.length, 1);
  const a = el("a", { href: WA });
  const ev = m.clicar(a);
  assert.equal(ev.defaultPrevented, false, "o clique segue normalmente");
  assert.match(a.getAttribute("href"), /%5Bref%20K7Q2P%5D$/);
  assert.equal(a.getAttribute("data-orbita-original"), WA, "o original fica guardado");
  m.clicar(a);                                 // de novo: parte do original, não empilha código
  assert.equal(a.getAttribute("href").match(/%5Bref/g).length, 1);
  assert.equal(m.chamadas.length, 1, "um código por visita/origem");
  // origem nova (outro gclid) → código novo
  const m2 = montar({ search: "?gclid=G2", guardado: m.guardadoAgora(), fetch: respostaOk("Z9Y8X") });
  const b = el("a", { href: WA }); m2.clicar(b); await esperar(20);
  assert.match(m2.navegacao[0], /%5Bref%20Z9Y8X%5D$/);
});

test("Órbita fora do ar, resposta ruim, chave recusada ou lento: o link ORIGINAL segue (nunca quebra)", async () => {
  const falhas = {
    "rede caiu": () => Promise.reject(new Error("offline")),
    "HTTP 500": async () => ({ ok: false, status: 500, json: async () => ({}) }),
    "limite_taxa (400)": async () => ({ ok: false, status: 400, json: async () => ({ message: "limite_taxa" }) }),
    "JSON inválido": async () => ({ ok: true, json: async () => { throw new Error("x"); } }),
    "código fora do formato": async () => ({ ok: true, json: async () => ({ ok: true, codigo: "ILO01" }) }),
    "ok:false": async () => ({ ok: true, json: async () => ({ ok: false }) }),
    "sem código": async () => ({ ok: true, json: async () => ({ ok: true }) }),
  };
  for (const [nome, f] of Object.entries(falhas)) {
    const m = montar({ search: "?gclid=G1", fetch: f });
    const a = el("a", { href: WA });
    const ev = m.clicar(a);
    assert.equal(ev.defaultPrevented, true, nome);
    await esperar(20);
    assert.deepEqual(m.navegacao, [WA], `${nome}: navega para o link original`);
    assert.equal(a.getAttribute("href"), WA, `${nome}: href intacto`);
    assert.equal(m.guardadoAgora().c, null, `${nome}: nada de código guardado`);
    // depois de uma falha, não martela o Órbita por 1 minuto: segundo clique vai direto
    const b = el("a", { href: WA }); m.clicar(b); await esperar(20);
    assert.equal(m.chamadas.length, 1, `${nome}: não insiste`);
    assert.deepEqual(m.navegacao, [WA, WA]);
  }
  // lento: passa da espera → link original; a resposta tardia não navega de novo
  let solta;
  const lento = montar({ search: "?gclid=G1", espera: 40, fetch: () => new Promise(ok => { solta = () => ok({ ok: true, json: async () => ({ ok: true, codigo: "K7Q2P" }) }); }) });
  lento.clicar(el("a", { href: WA }));
  await esperar(90);
  assert.deepEqual(lento.navegacao, [WA], "passou de 40 ms: link original");
  solta(); await esperar(20);
  assert.equal(lento.navegacao.length, 1, "resposta tardia não navega de novo");
});

test("link com target=_blank: abre a janela na hora (sem bloqueio de pop-up) e a leva ao link com código; falha → original", async () => {
  const m = montar({ search: "?gclid=G1", fetch: respostaOk("K7Q2P") });
  const a = el("a", { href: WA, target: "_blank" });
  const ev = m.clicar(a);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(m.abertas.length, 1, "janela aberta no próprio clique"); assert.equal(m.abertas[0].url, "");
  await esperar(20);
  assert.match(m.abertas[0].destino, /%5Bref%20K7Q2P%5D$/); assert.equal(m.abertas[0].opener, null, "sem opener");
  assert.deepEqual(m.navegacao, []);
  const f = montar({ search: "?gclid=G1" });    // fetch rejeita
  f.clicar(el("a", { href: WA, target: "_blank" })); await esperar(20);
  assert.equal(f.abertas[0].destino, WA);
});

test("clique modificado (Ctrl/Cmd/botão do meio) e cliques em outros links: não esperam nem interferem", () => {
  const m = montar({ search: "?gclid=G1", fetch: respostaOk("K7Q2P") });
  const a = el("a", { href: WA });
  assert.equal(m.clicar(a, { ctrlKey: true }).defaultPrevented, false, "Ctrl+clique segue o link original na hora");
  assert.equal(m.clicar(a, { button: 1 }).defaultPrevented, false, "botão do meio idem");
  const outro = el("a", { href: "https://exemplo.com/sobre" });
  assert.equal(m.clicar(outro).defaultPrevented, false);
  assert.equal(outro.getAttribute("href"), "https://exemplo.com/sobre");
  assert.equal(m.clicar(el("a", { href: "mailto:oi@site.com" })).defaultPrevented, false);
  const dentro = el("span", {}, el("div", {}, a));   // clique num filho do link (ícone dentro do botão)
  assert.equal(m.clicar(dentro).defaultPrevented, true, "acha a âncora pai");
});

test("sem chave válida ou com Global Privacy Control: o script fica desligado e não toca em nada", () => {
  for (const [nome, o] of [["sem chave", { config: {} }], ["chave curta", { config: { chave: "abc" } }], ["GPC", { gpc: true }]]) {
    const m = montar(o);
    assert.equal(m.api.ativo(), false, nome);
    assert.deepEqual(m.ouvintes, {}, `${nome}: nenhum ouvinte`);
    assert.equal(m.loja.size, 0, `${nome}: nada gravado`);
    assert.equal(m.api.reescrever(WA, "K7Q2P").includes("K7Q2P"), true, "a API pura continua disponível");
  }
  const ignora = montar({ gpc: true, config: { chave: CHAVE_SITE, gpc: "ignorar" } });
  assert.equal(ignora.api.ativo(), true, "data-gpc=ignorar");
});

test("navegador sem localStorage (modo privado/bloqueado): continua funcionando em memória", async () => {
  const m = montar({ search: "?gclid=G1", semStorage: true, fetch: respostaOk("K7Q2P") });
  m.clicar(el("a", { href: WA })); await esperar(20);
  assert.match(m.navegacao[0], /%5Bref%20K7Q2P%5D$/);
  assert.equal(m.chamadas[0].corpo.p_dados.gclid, "G1");
});

test("API opcional: link() e codigo() — link original quando desligado, lento ou com erro", async () => {
  const ok = montar({ search: "?gclid=G1", fetch: respostaOk("K7Q2P") });
  assert.match(await ok.api.link(WA), /%5Bref%20K7Q2P%5D$/);
  assert.equal(await ok.api.link("https://exemplo.com"), "https://exemplo.com");
  assert.equal(await ok.api.codigo(), "K7Q2P");
  const fora = montar({ search: "?gclid=G1" });
  assert.equal(await fora.api.link(WA), WA);
  assert.equal(await montar({ config: {} }).api.link(WA), WA);
});

test("segurança do script: sem innerHTML, eval, document.write, cookies nem carregar código de fora; só o endereço do Órbita", () => {
  const codigo = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /\beval\s*\(/, /new Function/, /document\.write/, /document\.cookie/, /createElement\s*\(\s*["']script/i, /importScripts/, /sendBeacon/]) {
    assert.ok(!proibido.test(codigo), `não pode usar ${proibido}`);
  }
  const urls = [...codigo.matchAll(/https?:\/\/[^\s"']+/g)].map(x => x[0]);
  assert.ok(urls.every(u => /supabase\.co|wa\.me|whatsapp\.com/.test(u)), `URLs fora do esperado: ${urls}`);
  assert.ok(!/service_role|cwk-|sb_secret/.test(codigo), "nenhum segredo (só a chave pública sb_publishable_)");
  assert.match(codigo, /sb_publishable_/);
  assert.ok(codigo.includes("credentials: \"omit\""), "fetch sem credenciais");
});
