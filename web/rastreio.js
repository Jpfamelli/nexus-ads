/* ============================================================
   ÓRBITA — rastreio.js · da campanha (Google Ads, Meta, site) até o CRM
   Script para colar em QUALQUER site (HTML puro, WordPress, Wix, Webflow…), antes de </body>:

     <script src="https://jpfamelli.github.io/nexus-ads/rastreio.js" data-chave="SUA_CHAVE_DO_FORMULARIO" defer></script>

   A chave é a "Chave do formulário" (Órbita › Configurações › Formulário do site). Ela só identifica a
   empresa: o mais que alguém faz com ela é registrar cliques de rastreio (até 30 por minuto).

   O que faz:
   1. Guarda no navegador (localStorage do próprio site, 30 dias, SEM cookies e sem terceiros) os parâmetros
      da URL: utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, gbraid, wbraid e fbclid.
      Visita sem parâmetros mantém os últimos; parâmetros novos substituem os antigos.
   2. Quando a pessoa clica num botão/link do WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com, whatsapp://send),
      pede ao Órbita um código curto e distinto (ex.: K7Q2P) e o coloca no final do texto da mensagem: "[ref K7Q2P]".
      Na primeira mensagem, o Órbita lê o código e grava no negócio a origem: plataforma, campanha, anúncio e gclid.
      O atendente vê o código no texto; a IA é instruída a ignorá-lo.
   3. NUNCA quebra o link: se o Órbita estiver fora, sem internet, lento (mais de ~1,5 s) ou a chave estiver errada,
      a pessoa segue para o WhatsApp pelo link original, sem código.

   Opções (atributos data- no <script>, ou window.ORBITA_RASTREIO = {...} antes dele):
     data-chave    chave do formulário (obrigatória, 48 caracteres)
     data-url      endereço do registro (padrão: o Supabase do Órbita, função nx_rastreio_registrar)
     data-apikey   chave pública do Supabase (padrão: a do Órbita)
     data-dias     validade dos parâmetros guardados (padrão 30)
     data-texto    texto da mensagem quando o link não tem um (padrão "Olá! Vim pelo site.")
     data-espera   milissegundos que o clique espera pelo código (padrão 1500)
     data-gpc      "ignorar" para NÃO respeitar o sinal Global Privacy Control do navegador (padrão: respeita e não rastreia)

   API opcional: window.OrbitaRastreio.link(url) devolve (Promise) o link com o código, ou o original; .codigo() e .dados().
   Aviso de privacidade: cite na política do site que guardamos, no navegador, a origem da visita (utm/click id), sem dados pessoais.
   ============================================================ */
(function (janela) {
  "use strict";
  var VERSAO = 1;
  var CHAVE_LS = "orbita:rastreio:v1";
  var PADRAO_URL = "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/rpc/nx_rastreio_registrar";
  var PADRAO_APIKEY = "sb_publishable_jy1CT7Lwi3gdPUAVSE791w_tOqYLVZr";
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];
  var RE_CODIGO = /^[A-HJKMNP-Z2-9]{5}$/;
  var RE_REF = /\s*\[ref [A-HJKMNP-Z2-9]{5}\]/gi;
  var HOSTS_WA = { "wa.me": 1, "api.whatsapp.com": 1, "web.whatsapp.com": 1, "whatsapp.com": 1, "www.whatsapp.com": 1 };
  var VALE_CODIGO_MS = 6 * 3600 * 1000;      // o mesmo código serve para cliques repetidos na mesma visita
  var PAUSA_FALHA_MS = 60 * 1000;            // depois de uma falha, não insiste por 1 minuto

  var doc = janela.document;
  var atual = doc && doc.currentScript;
  var cfgJanela = janela.ORBITA_RASTREIO || {};
  function attr(nome) { return atual && atual.getAttribute ? atual.getAttribute("data-" + nome) : null; }
  var cfg = {
    chave: String(cfgJanela.chave || attr("chave") || "").trim(),
    url: String(cfgJanela.url || attr("url") || PADRAO_URL),
    apikey: String(cfgJanela.apikey || attr("apikey") || PADRAO_APIKEY),
    dias: Number(cfgJanela.dias || attr("dias")) || 30,
    texto: String(cfgJanela.texto || attr("texto") || "Olá! Vim pelo site."),
    espera: Number(cfgJanela.espera || attr("espera")) || 1500,
    gpc: String(cfgJanela.gpc || attr("gpc") || "")
  };

  var ativo = /^[0-9a-f]{48}$/.test(cfg.chave);
  if (!ativo && janela.console && janela.console.warn) janela.console.warn("[Órbita rastreio] data-chave ausente ou inválida: o rastreio está desligado e os links não foram alterados.");
  if (ativo && cfg.gpc !== "ignorar" && janela.navigator && janela.navigator.globalPrivacyControl === true) ativo = false;

  /* ---------------- armazenamento (nunca lança) ---------------- */
  function ler() {
    try {
      var bruto = janela.localStorage.getItem(CHAVE_LS);
      var o = bruto ? JSON.parse(bruto) : null;
      if (!o || o.v !== VERSAO || typeof o !== "object") return null;
      return o;
    } catch (e) { return null; }
  }
  function gravar(o) { try { janela.localStorage.setItem(CHAVE_LS, JSON.stringify(o)); } catch (e) { /* sem storage: segue só em memória */ } }
  var memoria = null;   // espelho para quando o localStorage não existe
  function estado() { return ler() || memoria || { v: VERSAO, t: 0, d: {}, c: null }; }
  function salvar(o) { memoria = o; gravar(o); }

  /* ---------------- 1) captura dos parâmetros da URL ---------------- */
  function limpar(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max || 200);
  }
  function capturar(busca) {
    var achou = {};
    var q = String(busca || "").replace(/^\?/, "");
    if (!q) return achou;
    var partes = q.split("&");
    for (var i = 0; i < partes.length; i++) {
      var kv = partes[i].split("=");
      var k = kv[0];
      if (PARAMS.indexOf(k) < 0) continue;
      var v = kv.slice(1).join("=");
      try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* mantém cru */ }
      v = limpar(v, k.indexOf("utm_") === 0 ? 150 : 250);
      if (v) achou[k] = v;
    }
    return achou;
  }
  function registrarVisita() {
    var agora = Date.now();
    var e = estado();
    var vencido = !e.t || agora - e.t > cfg.dias * 86400000;
    var novos = capturar(janela.location && janela.location.search);
    var temNovos = false; for (var k in novos) { if (Object.prototype.hasOwnProperty.call(novos, k)) { temNovos = true; break; } }
    if (temNovos) e = { v: VERSAO, t: agora, d: novos, c: null };     // parâmetros novos: nova origem, novo código
    else if (vencido) e = { v: VERSAO, t: agora, d: {}, c: null };
    salvar(e);
  }

  /* ---------------- 2) código curto (chamada ao Órbita) ---------------- */
  var voo = null;          // chamada em andamento (uma só por vez)
  var falhouEm = 0;
  function assinatura(d) { var s = ""; for (var i = 0; i < PARAMS.length; i++) s += (d[PARAMS[i]] || "") + "|"; return s; }
  function paginaAtual() {
    var l = janela.location;
    return l ? String(l.origin || "") + String(l.pathname || "") : "";
  }
  function codigoGuardado() {
    var e = estado();
    if (e.c && RE_CODIGO.test(e.c.c) && e.c.s === assinatura(e.d) && Date.now() - e.c.t < VALE_CODIGO_MS) return e.c.c;
    return null;
  }
  function registrar() {
    if (!ativo) return Promise.resolve(null);
    var guardado = codigoGuardado();
    if (guardado) return Promise.resolve(guardado);
    if (voo) return voo;
    if (Date.now() - falhouEm < PAUSA_FALHA_MS) return Promise.resolve(null);
    var e = estado();
    var dados = {}; for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) dados[k] = e.d[k]; }
    dados.pagina = paginaAtual();
    var ctl = typeof janela.AbortController === "function" ? new janela.AbortController() : null;
    var timer = janela.setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    voo = janela.fetch(cfg.url, {
      method: "POST", mode: "cors", credentials: "omit", signal: ctl ? ctl.signal : undefined,
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({ p_chave: cfg.chave, p_dados: dados })
    }).then(function (r) {
      if (!r.ok) throw new Error("http");
      return r.json();
    }).then(function (j) {
      var c = j && j.codigo;
      if (!j || j.ok !== true || typeof c !== "string" || !RE_CODIGO.test(c)) throw new Error("formato");
      var est = estado(); est.c = { c: c, t: Date.now(), s: assinatura(est.d) }; salvar(est);
      return c;
    }).catch(function () { falhouEm = Date.now(); return null; })
      .then(function (c) { janela.clearTimeout(timer); voo = null; return c; });
    return voo;
  }

  /* ---------------- 3) reescrita dos links do WhatsApp ---------------- */
  function ehLinkWhatsapp(href) {
    var s = String(href == null ? "" : href).trim();
    if (!s) return false;
    if (/^whatsapp:\/\/send/i.test(s)) return true;
    var m = /^https?:\/\/([^\/?#:]+)(?::\d+)?([^?#]*)/i.exec(s);
    if (!m) return false;
    var host = m[1].toLowerCase(), caminho = m[2] || "";
    if (!HOSTS_WA[host]) return false;
    return host === "wa.me" || /^\/send(\/|$)/i.test(caminho);
  }
  /** Devolve o link com "[ref CODIGO]" no fim do parâmetro text (cria o parâmetro se faltar). Puro: só texto. */
  function reescrever(href, codigo, textoPadrao) {
    var s = String(href == null ? "" : href);
    if (!ehLinkWhatsapp(s) || !RE_CODIGO.test(String(codigo || ""))) return s;
    var hash = "", i = s.indexOf("#");
    if (i >= 0) { hash = s.slice(i); s = s.slice(0, i); }
    var busca = "", j = s.indexOf("?");
    if (j >= 0) { busca = s.slice(j + 1); s = s.slice(0, j); }
    var partes = busca ? busca.split("&") : [], texto = null, out = [];
    for (var n = 0; n < partes.length; n++) {
      var p = partes[n];
      if (/^text=/i.test(p)) {
        var v = p.slice(5);
        try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* mantém cru */ }
        texto = v;
      } else if (p) out.push(p);
    }
    var base = String(texto == null || texto === "" ? (textoPadrao == null ? cfg.texto : textoPadrao) : texto).replace(RE_REF, "").trim();
    out.push("text=" + encodeURIComponent((base ? base + " " : "") + "[ref " + codigo + "]"));
    return s + "?" + out.join("&") + hash;
  }

  function ancoraDe(alvo) {
    var el = alvo;
    for (var n = 0; el && n < 12; n++, el = el.parentNode) {
      if (el.nodeType === 1 && String(el.tagName).toLowerCase() === "a" && el.getAttribute && el.getAttribute("href")) return el;
    }
    return null;
  }
  function originalDe(a) {
    var o = a.getAttribute("data-orbita-original");
    if (o == null) { o = a.getAttribute("href"); a.setAttribute("data-orbita-original", o); }
    return o;
  }
  function seguir(a, url, novaAba, janelaAberta) {
    try {
      if (novaAba) {
        if (janelaAberta && !janelaAberta.closed) { try { janelaAberta.opener = null; } catch (e) { /* ok */ } janelaAberta.location.replace(url); return; }
        var w = janela.open(url, "_blank", "noopener");
        if (w) return;
      }
      janela.location.assign(url);
    } catch (e) { janela.location.href = url; }
  }

  function aoInteragir(ev) {   // intenção: aquece o código antes do clique
    var a = ancoraDe(ev.target);
    if (a && ehLinkWhatsapp(a.getAttribute("href"))) registrar();
  }
  function aoClicar(ev) {
    if (!ativo || ev.defaultPrevented) return;
    var a = ancoraDe(ev.target);
    if (!a) return;
    var original = a.getAttribute("data-orbita-original") != null ? a.getAttribute("data-orbita-original") : a.getAttribute("href");
    if (!ehLinkWhatsapp(original)) return;
    original = originalDe(a);
    var pronto = codigoGuardado();
    if (pronto) { a.setAttribute("href", reescrever(original, pronto)); return; }   // síncrono: o clique segue normalmente
    var modificado = ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || (typeof ev.button === "number" && ev.button > 0);
    registrar();                                                                    // aquece para o próximo clique
    if (modificado) return;                                                         // sem esperar: vai o link original
    ev.preventDefault();
    var novaAba = String(a.getAttribute("target") || "").toLowerCase() === "_blank";
    var aberta = null;
    if (novaAba) { try { aberta = janela.open("", "_blank"); } catch (e) { aberta = null; } }
    var terminou = false;
    function ir(c) {
      if (terminou) return; terminou = true;
      var url = c ? reescrever(original, c) : original;
      if (c) a.setAttribute("href", url);
      seguir(a, url, novaAba, aberta);
    }
    var espera = janela.setTimeout(function () { ir(null); }, cfg.espera);     // órbita lento: link original
    registrar().then(function (c) { janela.clearTimeout(espera); ir(c); }, function () { janela.clearTimeout(espera); ir(null); });
  }

  /* ---------------- API pública ---------------- */
  var api = {
    versao: VERSAO,
    ativo: function () { return ativo; },
    dados: function () { var e = estado(), o = {}; for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) o[k] = e.d[k]; } return o; },
    codigo: function () { return registrar(); },
    link: function (href) {
      var original = String(href == null ? "" : href);
      if (!ativo || !ehLinkWhatsapp(original)) return Promise.resolve(original);
      var limite = new Promise(function (ok) { janela.setTimeout(function () { ok(null); }, cfg.espera); });
      return Promise.race([registrar(), limite]).then(function (c) { return c ? reescrever(original, c) : original; }, function () { return original; });
    },
    reescrever: reescrever,
    ehLinkWhatsapp: ehLinkWhatsapp,
    capturar: capturar
  };
  janela.OrbitaRastreio = api;

  if (ativo && doc && doc.addEventListener) {
    try { registrarVisita(); } catch (e) { /* nunca quebra o site */ }
    doc.addEventListener("pointerover", aoInteragir, true);
    doc.addEventListener("touchstart", aoInteragir, { capture: true, passive: true });
    doc.addEventListener("focusin", aoInteragir, true);
    doc.addEventListener("click", function (ev) { try { aoClicar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
  }
})(typeof window !== "undefined" ? window : this);
