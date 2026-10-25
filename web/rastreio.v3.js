/* ============================================================
   ÓRBITA — rastreio.v3.js · da campanha (Google Ads, Meta, site) até o CRM
   Script para colar em QUALQUER site (HTML puro, WordPress, Wix, Webflow…), antes de </body>:

     <script src="https://jpfamelli.github.io/nexus-ads/rastreio.v3.js" integrity="sha384-…" crossorigin="anonymous" data-chave="SUA_CHAVE_DO_FORMULARIO" defer></script>

   (o Órbita › Configurações › Site e anúncios gera o código pronto, com o integrity certo, quando esta versão estiver publicada).
   A chave é a mesma do formulário do site. Ela é pública e identifica a empresa: com ela dá para registrar cliques de rastreio
   (com limite por minuto e por hora) e também mandar contatos pelo formulário do site. Se vazar, gere outra no Órbita e atualize
   o script E o formulário.

   O que faz:
   1. Guarda no navegador (localStorage do próprio site, 30 dias, SEM cookies) os parâmetros da URL: utm_source,
      utm_medium, utm_campaign, utm_content, utm_term, utm_id, gclid, gbraid, wbraid, fbclid, ttclid e msclkid (a chave em qualquer caixa:
      UTM_Source vale). Visita sem parâmetros mantém os últimos; parâmetros novos substituem os antigos.
      Visita SEM campanha guarda só o TIPO de origem (busca do Google, Instagram, Facebook, outro site ou direto) — nunca o endereço
      completo de onde a pessoa veio.
   2. Quando a pessoa clica num botão/link do WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com, whatsapp://send),
      envia ao Órbita esses parâmetros e o endereço da página (sem a consulta), recebe um código curto e distinto
      (ex.: K7Q2P) e o coloca no final do texto da mensagem: "[ref K7Q2P]". O Órbita guarda o clique por até 45 dias.
      Link de mensagem curta (wa.me/message/…) usa o texto definido no WhatsApp Business: não é alterado (aviso no console).
      Com o código já pronto, o href também é reescrito no botão direito e no clique do meio (copiar link / nova aba).
      Na primeira mensagem, o Órbita lê o código e grava no negócio a origem: plataforma, campanha, anúncio e gclid.
   3. NUNCA quebra o link: se o Órbita estiver fora, sem internet, lento (mais de ~1,5 s) ou a chave estiver errada,
      a pessoa segue para o WhatsApp pelo link original, sem código.
   4. Formulário do próprio site: campos ESCONDIDOS com name="utm_source", "utm_campaign", "gclid"… (os mesmos nomes acima),
      name="orbita_origem" (o tipo de origem) e name="orbita_ref" (o código, quando já existe) são preenchidos sozinhos.

   Opções (atributos data- no <script>, ou window.ORBITA_RASTREIO = {...} antes dele):
     data-chave    chave do formulário (obrigatória, 48 caracteres)
     data-url      endereço do registro (padrão: o Supabase do Órbita, função nx_rastreio_registrar)
     data-apikey   chave pública do Supabase (padrão: a do Órbita)
     data-dias     validade dos parâmetros guardados, em dias (padrão 30; 0 = só esta visita)
     data-texto    texto da mensagem quando o link não tem um (padrão "Olá! Vim pelo site."); por botão: data-orbita-texto="…" no link
     data-espera   milissegundos que o clique espera pelo código (padrão 1500; 0 = não espera)
     data-gpc      "ignorar" para NÃO respeitar o sinal Global Privacy Control do navegador (padrão: respeita e não rastreia)
     data-consentimento  "aguardar": nada é guardado nem enviado até o banner de cookies do site chamar OrbitaRastreio.consentir()

   Botão que não é <a> (construtores de site): <button data-orbita-wa="https://wa.me/5512…?text=Olá">; window.open("https://wa.me/…")
   também recebe o código quando ele já está pronto. Link encurtado (wa.link, bit.ly, linktr.ee…) não pode receber o código: o console avisa.
   Link que o rastreio deve deixar em paz (o site trata sozinho): data-orbita-ignorar no <a> ou num elemento pai.
   Site de uma página só (Next, Wix, Webflow): troca de endereço por history.pushState/popstate/hashchange também recaptura utm/gclid.
   Diagnóstico: abra o site com ?orbita_debug=1 e veja no console do navegador parâmetros, código, links e o que foi reescrito.

   www × sem www: o armazenamento do navegador é separado por endereço — «www.site.com.br» e «site.com.br» não enxergam a origem um
   do outro. Se o site redireciona de um para o outro, o redirecionamento PRECISA manter a consulta (?utm_…, gclid, fbclid).

   Versões: rastreio.v1.js e rastreio.v2.js são cópias CONGELADAS, servidas com integrity (SRI) — nunca editadas depois de publicadas.
   ESTE arquivo é o rastreio.v3.js (plano 1500c, 21/10/2026), também congelado depois de publicado (correção = rastreio.v4.js). Mudou:
     AC-195  este cabeçalho cita o arquivo certo (o da v2 ainda falava em «rastreio.js»).
     AC-196  visita sem campanha guarda o tipo de origem (busca/Instagram/Facebook/outro site/direto) e o clique o envia em
             p_dados.referencia / p_dados.referencia_tipo (aditivo: servidor antigo ignora). Navegação interna do site não conta.
     AC-197  campos escondidos de formulário com os nomes dos parâmetros recebem a origem (e orbita_ref o código) — no carregamento,
             na troca de endereço e no envio do formulário.
     AC-198  toque em tel:, ig.me e m.me vira p_dados.evento = "contato" com o canal — SÓ quando o servidor já disse que entende
             eventos ({eventos: true}); servidor antigo nunca recebe (contaria como clique no WhatsApp). O link nunca é alterado.
     AC-199  o aquecimento não acontece mais ao só passar o mouse (pointerover criava código para quem nem clicava): só no toque,
             no pointerdown (mouse apertado) e no foco pelo teclado.
     AC-200  mais encurtadores e páginas de links reconhecidos (linktr.ee, beacons.ai, bitly.com, bit.do, lnk.bio, taplink…).
     AC-201  o armazenamento é «orbita:rastreio:v3» (com a versão no objeto); a origem guardada pela v1/v2 é lida e levada para a v3
             uma vez (quem troca a v2 pela v3 no site não perde a campanha nem o código).

   API opcional: window.OrbitaRastreio.link(url) devolve (Promise) o link com o código, ou o original; .codigo() e .dados().
   Aviso de privacidade: cite na política do site que o script guarda no navegador a origem da visita (utm/ids de clique e o tipo de
   origem, 30 dias) e que, no toque no WhatsApp, esses dados e a página vão ao Órbita (até 45 dias). O Órbita mostra um parágrafo modelo.
   ============================================================ */
(function (janela) {
  "use strict";
  var VERSAO = 3;                            // plano 1500c · AC-201: formato do armazenamento da v3 (a versão vai no objeto)
  var VERSAO_SCRIPT = 3;                     // plano 1500c: rastreio.v3.js
  var CHAVE_LS = "orbita:rastreio:v3";
  var CHAVE_LS_V1 = "orbita:rastreio:v1";    // o que a v1 e a v2 gravaram (lido uma vez para migrar; apagado com GPC/revogar)
  // plano 1000b · AB-121: TikTok (ttclid) e Microsoft Ads (msclkid) também são ids de clique; utm_id (id da campanha) entra nos utm_*
  var IDS_CLIQUE = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"];
  var PADRAO_URL = "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/rpc/nx_rastreio_registrar";
  var PADRAO_APIKEY = "sb_publishable_jy1CT7Lwi3gdPUAVSE791w_tOqYLVZr";
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"];
  var RE_CODIGO = /^[A-HJKMNP-Z2-9]{5}$/;
  var RE_REF = /\s*\[ref [A-HJKMNP-Z2-9]{5}\]/gi;
  var HOSTS_WA = { "wa.me": 1, "api.whatsapp.com": 1, "web.whatsapp.com": 1, "whatsapp.com": 1, "www.whatsapp.com": 1 };
  var VALE_CODIGO_MS = 6 * 3600 * 1000;      // o mesmo código serve para cliques repetidos na mesma visita
  // plano 1000 (AD-188): depois de uma falha, pausa CURTA com recuo (10 s, 20 s, 40 s, teto 60 s) — antes 1 minuto inteiro sem código
  var PAUSA_FALHA_MS = 10 * 1000, PAUSA_FALHA_MAX_MS = 60 * 1000;
  var ESPERA_IOS_MS = 700;                   // no iPhone o gesto «esfria» rápido: espera menor antes de seguir sem código

  var doc = janela.document;
  var atual = doc && doc.currentScript;
  var cfgJanela = janela.ORBITA_RASTREIO || {};
  function attr(nome) { return atual && atual.getAttribute ? atual.getAttribute("data-" + nome) : null; }
  /** Número ≥ 0 da configuração: 0 é um valor válido (antes «|| padrão» o transformava no padrão). */
  function numero(nome, padrao) {
    var bruto = cfgJanela[nome] != null && cfgJanela[nome] !== "" ? cfgJanela[nome] : attr(nome);
    if (bruto == null || String(bruto).trim() === "") return padrao;
    var n = Number(bruto);
    return isFinite(n) && n >= 0 ? n : padrao;
  }
  var cfg = {
    chave: String(cfgJanela.chave || attr("chave") || "").trim(),
    url: String(cfgJanela.url || attr("url") || PADRAO_URL),
    apikey: String(cfgJanela.apikey || attr("apikey") || PADRAO_APIKEY),
    dias: numero("dias", 30),
    // plano 1000b · AB-128: o texto global passa pela mesma limpeza do texto por botão (sem caracteres de controle, até 300)
    texto: limpar(cfgJanela.texto || attr("texto") || "Olá! Vim pelo site.", 300) || "Olá! Vim pelo site.",
    espera: numero("espera", 1500),
    gpc: String(cfgJanela.gpc || attr("gpc") || ""),
    consentimento: String(cfgJanela.consentimento || attr("consentimento") || "")
  };
  // plano 1000 (AD-166): com data-consentimento="aguardar" o script não guarda nem envia nada até o site chamar consentir()
  var consentido = cfg.consentimento !== "aguardar";
  // AD-170: ?orbita_debug=1 liga o diagnóstico no console (nada muda no comportamento)
  var depurar = /[?&]orbita_debug=1(&|$)/.test(String((janela.location && janela.location.search) || ""));
  function log(rotulo, dado) { try { if (depurar && janela.console && janela.console.info) janela.console.info("[Órbita rastreio] " + rotulo, dado === undefined ? "" : dado); } catch (e) { /* sem console */ } }
  // AD-160: iPhone/iPad — fora do gesto do clique o iOS não abre o app do WhatsApp (mostra «Continuar para a conversa» ou deixa aba em branco)
  var nav = janela.navigator || {};
  var ios = /iPhone|iPad|iPod/i.test(String(nav.userAgent || "")) || (/Macintosh/i.test(String(nav.userAgent || "")) && Number(nav.maxTouchPoints) > 1);

  var ativo = /^[0-9a-f]{48}$/.test(cfg.chave);
  if (!ativo && janela.console && janela.console.warn) janela.console.warn("[Órbita rastreio] data-chave ausente ou inválida: o rastreio está desligado e os links não foram alterados.");
  var porGpc = ativo && cfg.gpc !== "ignorar" && janela.navigator && janela.navigator.globalPrivacyControl === true;
  if (porGpc) {
    ativo = false;
    // plano 1000b · AB-124: o GPC ligado DEPOIS também apaga a origem guardada antes (não fica até 30 dias no aparelho)
    var lojasGpc = ["localStorage", "sessionStorage"];
    for (var g = 0; g < lojasGpc.length; g++) { try { if (janela[lojasGpc[g]] && janela[lojasGpc[g]].removeItem) { janela[lojasGpc[g]].removeItem(CHAVE_LS); janela[lojasGpc[g]].removeItem(CHAVE_LS_V1); } } catch (e) { /* sem storage */ } }
  }

  /* ---------------- armazenamento (nunca lança) ---------------- */
  // data-dias="0" («só esta visita»): a origem vive no sessionStorage — vale nas páginas seguintes da MESMA visita (a pessoa entra
  // pela página da campanha e vai para «/contato» antes do WhatsApp) e some na próxima visita. Antes: qualquer página sem parâmetros apagava
  var loja = cfg.dias === 0 ? "sessionStorage" : "localStorage";
  function ler() {
    try {
      var bruto = janela[loja].getItem(CHAVE_LS);
      var o = bruto ? JSON.parse(bruto) : null;
      if (o && typeof o === "object" && o.v === VERSAO) return o;
      // plano 1500c · AC-201: sem a v3 guardada, a origem (e o código) da v1/v2 vira v3 — a chave antiga fica (voltar para a v2 não perde)
      if (!bruto) {
        var velho = janela[loja].getItem(CHAVE_LS_V1);
        var w = velho ? JSON.parse(velho) : null;
        if (w && typeof w === "object" && w.v === 1 && w.d && typeof w.d === "object") return { v: VERSAO, t: +w.t || 0, d: w.d, c: w.c || null, r: null };
      }
      return null;
    } catch (e) { return null; }
  }
  function gravar(o) { if (!consentido) return; try { janela[loja].setItem(CHAVE_LS, JSON.stringify(o)); } catch (e) { /* sem storage: segue só em memória */ } }
  var memoria = null;   // espelho para quando o localStorage não existe
  function estado() { return ler() || memoria || { v: VERSAO, t: 0, d: {}, c: null, r: null }; }
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
      try { k = decodeURIComponent(k.replace(/\+/g, " ")); } catch (e) { /* mantém cru */ }
      k = String(k).trim().toLowerCase();
      if (PARAMS.indexOf(k) < 0) continue;
      var v = kv.slice(1).join("=");
      try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* mantém cru */ }
      v = limpar(v, k.indexOf("utm_") === 0 ? 150 : 250);
      if (v) achou[k] = v;
    }
    return achou;
  }
  /** plano 1500c · AC-196: o TIPO de origem de uma visita sem campanha, a partir do document.referrer — só o nome do site (nunca o
      endereço completo). Navegação dentro do próprio site → null (não troca a origem). */
  var BUSCAS = { google: 1, bing: 1, duckduckgo: 1, yahoo: 1, ecosia: 1, yandex: 1, brave: 1 };
  var SOCIAIS = { instagram: "instagram", facebook: "facebook", fb: "facebook", "t": "x", twitter: "x", x: "x", linkedin: "linkedin", lnkd: "linkedin", youtube: "youtube", youtu: "youtube", tiktok: "tiktok", pinterest: "pinterest", threads: "threads", kwai: "kwai" };
  function classificarReferencia(ref, hostAtual) {
    var m = /^https?:\/\/([^\/?#:]+)/i.exec(String(ref == null ? "" : ref).trim());
    if (!m) return { src: "direto", tipo: "direto" };
    var host = m[1].toLowerCase().replace(/^www\./, ""), aqui = String(hostAtual || "").toLowerCase().replace(/^www\./, "");
    if (aqui && host === aqui) return null;
    var partes = host.split("."), nome = partes.length > 1 ? partes[partes.length - 2] : partes[0];
    // google.com.br / bing.com: o nome antes do sufixo do país (google.com.br → «google»)
    if (partes.length > 2 && /^(com|co|net|org|gov|edu)$/.test(nome)) nome = partes[partes.length - 3];
    // só o nome do domínio decide (l.instagram.com, m.facebook.com, google.com.br) — «x.minhaloja.com.br» continua «outro site»
    if (BUSCAS[nome]) return { src: nome, tipo: "busca" };
    if (SOCIAIS[nome] && (nome !== "t" || host === "t.co")) return { src: SOCIAIS[nome], tipo: "social" };
    if (/(^|\.)whatsapp\.com$|^wa\.me$/.test(host)) return { src: "whatsapp", tipo: "social" };
    return { src: host.slice(0, 100), tipo: "site" };
  }
  function registrarVisita() {
    var agora = Date.now();
    var e = estado();
    var vencido = !e.t || (cfg.dias > 0 && agora - e.t > cfg.dias * 86400000);
    var novos = capturar(janela.location && janela.location.search);
    var temNovos = false; for (var k in novos) { if (Object.prototype.hasOwnProperty.call(novos, k)) { temNovos = true; break; } }
    // plano 1000b · AB-226: só uma origem de verdade troca a guardada — utm_source/utm_campaign ou um id de clique diferente do
    // guardado; parâmetro solto (só utm_term, ?utm_source=&gclid=<o mesmo>) não apaga a campanha anterior
    if (temNovos && (vencido || vazio(e.d) || origemNova(novos, e.d))) e = { v: VERSAO, t: agora, d: novos, c: null, r: null };
    else if (vencido) e = { v: VERSAO, t: agora, d: {}, c: null, r: null };
    // plano 1500c · AC-196: sem campanha guardada nem na URL, guarda o tipo de origem (a 1ª da visita vale; interna não troca)
    if (!temNovos && vazio(e.d) && !e.r) {
      var ref = null;
      try { ref = classificarReferencia(doc && doc.referrer, janela.location && janela.location.hostname); } catch (x) { ref = null; }
      if (ref) { e.r = ref; if (!e.t) e.t = agora; }
    }
    if (e.v !== VERSAO) e.v = VERSAO;
    salvar(e);
  }
  function vazio(d) { for (var k in d || {}) { if (Object.prototype.hasOwnProperty.call(d, k)) return false; } return true; }
  function origemNova(novos, guardados) {
    if (novos.utm_source || novos.utm_campaign) return true;
    for (var i = 0; i < IDS_CLIQUE.length; i++) { var id = IDS_CLIQUE[i]; if (novos[id] && novos[id] !== (guardados || {})[id]) return true; }
    return false;
  }

  /* ---------------- 2) código curto (chamada ao Órbita) ---------------- */
  var voo = null;          // chamada em andamento (uma só por vez)
  var falhouEm = 0, falhas = 0;
  function pausaAtual() { return falhas ? Math.min(PAUSA_FALHA_MAX_MS, PAUSA_FALHA_MS * Math.pow(2, falhas - 1)) : 0; }
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
  /** plano 1000b · AB-122: sem window.fetch (navegador antigo, ambiente travado) nada é pedido — o link segue sem código, sem erro. */
  function temFetch() { return typeof janela.fetch === "function"; }
  function postar(dados) {
    return janela.fetch(cfg.url, {
      method: "POST", mode: "cors", credentials: "omit", keepalive: true, signal: dados.__sinal,
      headers: { "Content-Type": "application/json", apikey: cfg.apikey },
      body: JSON.stringify({ p_chave: cfg.chave, p_dados: dados.corpo })
    });
  }
  /** plano 1000b · AB-007: `evento` = "aquecimento" (mouse/foco/toque, carregamento com campanha) ou "clique" (o toque real). */
  function registrar(evento) {
    evento = evento === "aquecimento" ? "aquecimento" : "clique";
    if (!ativo || !consentido || !temFetch()) return Promise.resolve(null);
    var guardado = codigoGuardado();
    if (guardado) { if (evento === "clique") confirmarClique(); return Promise.resolve(guardado); }
    if (voo) { if (evento === "clique") vooClique = true; return voo; }
    if (falhas && Date.now() - falhouEm < pausaAtual()) return Promise.resolve(null);
    var e = estado();
    var dados = {}; for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) dados[k] = e.d[k]; }
    dados.pagina = paginaAtual();
    dados.evento = evento;
    // plano 1500c · AC-196: o tipo de origem da visita sem campanha (aditivo: servidor antigo ignora)
    if (vazio(e.d) && e.r && e.r.src) { dados.referencia = String(e.r.src).slice(0, 100); dados.referencia_tipo = e.r.tipo; }
    vooClique = evento === "clique";
    var ctl = typeof janela.AbortController === "function" ? new janela.AbortController() : null;
    var timer = janela.setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    // AD-187: keepalive — o registro não é cancelado quando o clique já navegou para o WhatsApp
    var pedido;
    try { pedido = postar({ corpo: dados, __sinal: ctl ? ctl.signal : undefined }); } catch (x) { pedido = Promise.reject(x); }
    voo = Promise.resolve(pedido).then(function (r) {
      if (!r || !r.ok) { var eh = new Error("http"); eh.status = r ? r.status : 0; throw eh; }
      return r.json();
    }).then(function (j) {
      var c = j && j.codigo;
      if (!j || j.ok !== true || typeof c !== "string" || !RE_CODIGO.test(c)) throw new Error("formato");
      // e: o evento com que o código nasceu; ev: o servidor entende eventos (aceita a confirmação do clique)
      var est = estado(); est.c = { c: c, t: Date.now(), s: assinatura(est.d), e: evento, ev: j.eventos === true }; salvar(est);
      falhas = 0;
      if (evento === "aquecimento" && vooClique) { vooClique = false; confirmarClique(); }   // clicou enquanto o aquecimento voava
      return c;
    }).catch(function (x) {
      falhouEm = Date.now(); falhas++;
      // plano 1000b · AB-125: o motivo fica guardado (diagnostico().ultimoErro) e vai ao console com ?orbita_debug=1 — chave revogada
      // (401/403) deixava de funcionar em silêncio até no diagnóstico
      ultimoErro = { em: falhouEm, status: (x && x.status) || 0, motivo: x && x.name === "AbortError" ? "tempo esgotado" : String((x && x.message) || "falha") };
      log("registro recusado:", ultimoErro);
      return null;
    })
      .then(function (c) { janela.clearTimeout(timer); voo = null; vooClique = false; return c; });
    return voo;
  }
  var vooClique = false;
  var ultimoErro = null;   // plano 1000b · AB-125
  /** plano 1000b · AB-007: o código pronto nasceu de um aquecimento e agora houve o clique real — com servidor que entende eventos
      (est.c.ev), confirma uma vez (fire-and-forget, keepalive); servidor antigo não recebe nada (criaria um clique novo). */
  function confirmarClique() {
    try {
      var est = estado(), c = est.c;
      if (!c || c.e !== "aquecimento" || c.ev !== true || !temFetch()) return;
      c.e = "clique"; salvar(est);
      var p = postar({ corpo: { evento: "clique", confirmar: c.c, pagina: paginaAtual() } });
      if (p && typeof p.then === "function") p.then(null, function () { /* a confirmação é um extra: nunca quebra o link */ });
    } catch (x) { /* nunca quebra o link */ }
  }

  /* ---------------- 3) reescrita dos links do WhatsApp ---------------- */
  var abrir = typeof janela.open === "function" ? janela.open : null;   // o original: o script usa este (o window.open do site é envolvido abaixo)
  function abrirJanela(url, alvo, feat) { return abrir ? abrir.call(janela, url, alvo, feat) : null; }
  /* AD-161: encurtadores (wa.link, bit.ly…) escondem o wa.me — o código não pode ser acrescentado; avisa uma vez no console */
  // plano 1500c · AC-200: páginas de links (linktr.ee, beacons.ai…) e mais encurtadores — o wa.me fica escondido do mesmo jeito
  var ENCURTADORES = { "wa.link": 1, "bit.ly": 1, "tinyurl.com": 1, "cutt.ly": 1, "encurtador.com.br": 1, "abre.ai": 1, "is.gd": 1, "rebrand.ly": 1, "t.co": 1, "zapix.me": 1,
    "linktr.ee": 1, "beacons.ai": 1, "bitly.com": 1, "bit.do": 1, "lnk.bio": 1, "taplink.cc": 1, "linkme.bio": 1, "shorturl.at": 1, "s.id": 1, "ow.ly": 1, "buff.ly": 1, "walink.co": 1, "zap.ly": 1, "wa.link.br": 1, "goo.gl": 1 };
  function ehEncurtador(href) {
    var m = /^(?:https?:)?\/\/([^\/?#:]+)/i.exec(String(href == null ? "" : href).trim());
    return !!(m && ENCURTADORES[m[1].toLowerCase().replace(/^www\./, "")]);
  }
  var avisouEncurtador = false;
  function avisarEncurtador(href) {
    if (avisouEncurtador || !janela.console || !janela.console.warn) return;
    avisouEncurtador = true;
    janela.console.warn("[Órbita rastreio] link encurtado (" + String(href).slice(0, 60) + ") não passa pelo rastreio: o clique vai sem o código [ref]. Use wa.me/<número>?text=… direto no botão.");
  }
  function ehLinkWhatsapp(href) {
    var s = String(href == null ? "" : href).trim();
    if (!s) return false;
    if (/^whatsapp:\/\/send/i.test(s)) return true;
    // plano 1000 (AD-162): intent://send…#Intent;scheme=whatsapp;… (Android) e o endereço sem protocolo («//wa.me/…») também
    if (/^intent:\/\/send/i.test(s)) return /[#;]scheme=whatsapp(;|$)/i.test(s);
    var m = /^(?:https?:)?\/\/([^\/?#:]+)(?::\d+)?([^?#]*)/i.exec(s);
    if (!m) return false;
    var host = m[1].toLowerCase(), caminho = m[2] || "";
    if (!HOSTS_WA[host]) return false;
    // AD-252: api.whatsapp.com/message/… é link de WhatsApp (de mensagem curta: avisa e segue, como o wa.me/message)
    return host === "wa.me" || /^\/(send|message)(\/|$)/i.test(caminho);
  }
  /** wa.me/message/<código> e api.whatsapp.com/message/<código>: link de mensagem curta do WhatsApp Business — o texto vem do próprio
      WhatsApp e o ?text= é ignorado. */
  function ehMensagemCurta(href) { return /^(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com|(?:www\.)?whatsapp\.com)\/message\//i.test(String(href == null ? "" : href).trim()); }
  var avisouCurta = false;
  function avisarCurta() {
    if (avisouCurta || !janela.console || !janela.console.warn) return;
    avisouCurta = true;
    janela.console.warn("[Órbita rastreio] link wa.me/message/… usa a mensagem definida no WhatsApp Business: o código [ref] não pode ser acrescentado. Use wa.me/<número>?text=… para rastrear a campanha.");
  }
  /** Devolve o link com "[ref CODIGO]" no fim do parâmetro text (cria o parâmetro se faltar). Puro: só texto. */
  function reescrever(href, codigo, textoPadrao) {
    var s = String(href == null ? "" : href);
    if (!ehLinkWhatsapp(s) || ehMensagemCurta(s) || !RE_CODIGO.test(String(codigo || ""))) return s;
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

  var SELETOR_ALVO = "a[href], [data-orbita-wa], [data-orbita-ignorar]";
  function ancoraDe(alvo) {
    // plano 1000b · AB-205: el.closest acha o link em qualquer profundidade (antes 12 níveis: o ícone SVG de construtores passava sem
    // código) — mesma prioridade (o mais próximo vence) e data-orbita-ignorar também num pai do link, como diz o cabeçalho
    try {
      var base = alvo && alvo.nodeType === 1 ? alvo : alvo && alvo.parentNode;
      if (base && typeof base.closest === "function") {
        var achado = base.closest(SELETOR_ALVO);
        if (!achado || achado.getAttribute("data-orbita-ignorar") != null) return null;
        if (typeof achado.closest === "function" && achado.closest("[data-orbita-ignorar]")) return null;
        return achado;
      }
    } catch (x) { /* seletor sem suporte: o laço abaixo */ }
    var el = alvo;
    for (var n = 0; el && n < 64; n++, el = el.parentNode) {
      // AD-171: data-orbita-ignorar no link (ou num pai) deixa o clique inteiro com o site — o rastreio não toca nele
      if (el.nodeType === 1 && el.getAttribute && el.getAttribute("data-orbita-ignorar") != null) return null;
      if (el.nodeType === 1 && String(el.tagName).toLowerCase() === "a" && el.getAttribute && el.getAttribute("href")) return el;
      // AD-163: botão sem <a> marcado com data-orbita-wa="https://wa.me/…" (construtores de site)
      if (el.nodeType === 1 && el.getAttribute && el.getAttribute("data-orbita-wa")) return el;
    }
    return null;
  }
  /** O link do WhatsApp de um alvo: href da âncora ou o data-orbita-wa do botão. */
  function hrefDe(a) {
    if (a.getAttribute("data-orbita-wa")) return a.getAttribute("data-orbita-wa");
    return a.getAttribute("data-orbita-original") != null ? a.getAttribute("data-orbita-original") : a.getAttribute("href");
  }
  /** AD-251: data-orbita-texto no link/botão = o texto daquele botão quando o link não traz ?text= (o do implante ≠ o da limpeza). */
  function textoDe(a) { var t = a && a.getAttribute ? a.getAttribute("data-orbita-texto") : null; return t && String(t).trim() ? limpar(t, 300) : null; }
  function ehBotao(a) { return !!(a && a.getAttribute && a.getAttribute("data-orbita-wa")) && String(a.tagName).toLowerCase() !== "a"; }
  function originalDe(a) {
    if (ehBotao(a)) return a.getAttribute("data-orbita-wa");
    var o = a.getAttribute("data-orbita-original");
    if (o == null) { o = a.getAttribute("href"); a.setAttribute("data-orbita-original", o); }
    return o;
  }
  function seguir(a, url, novaAba, janelaAberta) {
    try {
      if (novaAba && !ios) {
        // revisão (13/10): window.open(url, "_blank", "noopener") devolve null POR ESPECIFICAÇÃO — o «if (w)» caía no
        // location.assign e o WhatsApp abria duas vezes. Agora: janela em branco (mesma origem), opener zerado e só então o destino.
        var w = janelaAberta && !janelaAberta.closed ? janelaAberta : abrirJanela("", "_blank");
        if (w) { try { w.opener = null; } catch (e) { /* ok */ } w.location.replace(url); return; }
      }
      janela.location.assign(url);
    } catch (e) { janela.location.href = url; }
  }

  function aoInteragir(ev) {   // intenção: aquece o código antes do clique (AB-007: como «aquecimento», não como clique)
    // plano 1000b · AB-122: envolvido como os outros ouvintes — um erro aqui nunca sobe para o console do site
    try {
      var a = ancoraDe(ev.target);
      var href = a ? hrefDe(a) : null;
      if (a && ehLinkWhatsapp(href) && !ehMensagemCurta(href)) registrar("aquecimento");
    } catch (e) { /* nunca quebra o site */ }
  }
  /** Botão direito («copiar link»), clique do meio e toque longo: o navegador usa o href SEM passar pelo click — com o código já
      em cache, o href é reescrito aqui (síncrono); sem código, aquece para a próxima vez e o link original segue. */
  function aoApontar(ev) {
    if (!ativo || !consentido) return;
    var a = ancoraDe(ev.target);
    if (!a || ehBotao(a)) return;
    var original = hrefDe(a);
    if (!ehLinkWhatsapp(original) || ehMensagemCurta(original)) return;
    var pronto = codigoGuardado();
    if (pronto) { a.setAttribute("href", reescrever(originalDe(a), pronto, textoDe(a))); return; }
    registrar("aquecimento");   // plano 1000b · AB-007
  }
  /** Revisão (13/10): <button data-orbita-wa> não tem navegação própria — com o rastreio desligado (GPC, chave inválida), sem
      consentimento, com link encurtado ou de mensagem curta, ele segue para o destino original SEM código (antes ficava morto).
      Um <a> normal navega sozinho e não é tocado. */
  function seguirSemCodigo(ev, a, original) {
    if (!ehBotao(a) || !(ehLinkWhatsapp(original) || ehEncurtador(original))) return;
    var novaAba = a.getAttribute("data-orbita-aba") === "nova";
    ev.preventDefault(); janela.setTimeout(function () { seguir(a, original, novaAba, null); }, 0);
  }
  /** plano 1500c · AC-198: o canal de um link de contato que não é WhatsApp — telefone, Instagram Direct (ig.me) e Messenger (m.me). */
  function canalContato(href) {
    var s = String(href == null ? "" : href).trim();
    if (/^tel:/i.test(s)) return "telefone";
    var m = /^(?:https?:)?\/\/([^\/?#:]+)/i.exec(s);
    var host = m ? m[1].toLowerCase().replace(/^www\./, "") : "";
    return host === "ig.me" ? "instagram" : host === "m.me" ? "messenger" : null;
  }
  /** O toque num contato vai ao Órbita como evento «contato» — só com servidor que já respondeu {eventos: true} (est.c.ev); o link
      segue sozinho, nunca é segurado nem alterado. */
  function registrarContato(canal) {
    try {
      var est = estado();
      if (!ativo || !consentido || !temFetch() || !est.c || est.c.ev !== true) return false;
      var corpo = { evento: "contato", canal: canal, pagina: paginaAtual() };
      for (var k in est.d) { if (Object.prototype.hasOwnProperty.call(est.d, k)) corpo[k] = est.d[k]; }
      if (vazio(est.d) && est.r && est.r.src) { corpo.referencia = est.r.src; corpo.referencia_tipo = est.r.tipo; }
      var p = postar({ corpo: corpo });
      if (p && typeof p.then === "function") p.then(null, function () { /* extra: nunca quebra o link */ });
      log("contato registrado:", canal);
      return true;
    } catch (x) { return false; }
  }
  function aoClicar(ev) {
    if (ev.defaultPrevented) return;
    var a = ancoraDe(ev.target);
    if (!a) return;
    var original = hrefDe(a);
    var canal = canalContato(original);
    if (canal) { registrarContato(canal); return; }   // plano 1500c · AC-198
    if (!ativo || !consentido) { seguirSemCodigo(ev, a, original); return; }
    if (ehEncurtador(original)) { avisarEncurtador(original); log("link encurtado, segue sem código:", original); seguirSemCodigo(ev, a, original); return; }
    if (!ehLinkWhatsapp(original)) return;
    if (ehMensagemCurta(original)) { avisarCurta(); seguirSemCodigo(ev, a, original); return; }   // segue o link do WhatsApp Business como está
    var botao = ehBotao(a);
    original = originalDe(a);
    var novaAba = String(a.getAttribute("target") || "").toLowerCase() === "_blank" || (botao && a.getAttribute("data-orbita-aba") === "nova");
    var pronto = codigoGuardado();
    if (pronto) {
      var pr = reescrever(original, pronto, textoDe(a));
      log("clique com código pronto:", pr);
      confirmarClique();   // plano 1000b · AB-007: o código veio de um aquecimento — este é o clique de verdade
      if (!botao) { a.setAttribute("href", pr); return; }                          // síncrono: o clique segue normalmente
      // AD-171: navega DEPOIS do ciclo do evento — os ouvintes do próprio site (gtag, Pixel) rodam antes de a página sair
      ev.preventDefault(); janela.setTimeout(function () { seguir(a, pr, novaAba, null); }, 0); return;
    }
    var modificado = ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || (typeof ev.button === "number" && ev.button > 0);
    registrar();                                                                    // aquece para o próximo clique
    if (modificado && !botao) return;                                               // sem esperar: vai o link original
    ev.preventDefault();
    // AD-160: no iPhone nunca abre janela vazia (fora do gesto o iOS deixa aba em branco ou pede «Continuar para a conversa»):
    // vai na MESMA aba e espera menos
    var aberta = null;
    if (novaAba && !ios) { try { aberta = abrirJanela("", "_blank"); } catch (e) { aberta = null; } }
    var terminou = false;
    function ir(c) {
      if (terminou) return; terminou = true;
      var url = c ? reescrever(original, c, textoDe(a)) : original;
      if (c && !botao) a.setAttribute("href", url);
      log(c ? "clique: código recebido, seguindo para" : "clique: sem código a tempo, link original", url);
      seguir(a, url, novaAba, aberta);
    }
    var espera = janela.setTimeout(function () { ir(null); }, ios ? Math.min(cfg.espera, ESPERA_IOS_MS) : cfg.espera);     // órbita lento: link original
    registrar().then(function (c) { janela.clearTimeout(espera); ir(c); }, function () { janela.clearTimeout(espera); ir(null); });
  }

  /* AD-163: botão do construtor que abre o WhatsApp por window.open("https://wa.me/…"): com o código pronto, vai com o código;
     sem ele, o link original (nunca espera: o navegador só deixa abrir janela dentro do gesto) e o código esquenta para o próximo. */
  function envolverOpen() {
    if (!abrir || janela.open === envolvido) return;
    janela.open = envolvido;
  }
  function envolvido(url, alvo, feat) {
    var u = url;
    try {
      if (ativo && consentido && typeof url === "string" && ehLinkWhatsapp(url) && !ehMensagemCurta(url)) {
        var c = codigoGuardado();
        if (c) { u = reescrever(url, c); confirmarClique(); } else registrar("clique");   // plano 1000b · AB-007
        log("window.open do site:", u);
      }
    } catch (e) { u = url; }
    return arguments.length > 2 ? abrirJanela(u, alvo, feat) : arguments.length > 1 ? abrirJanela(u, alvo) : abrirJanela(u);
  }

  /** plano 1500c · AC-197: os campos ESCONDIDOS do formulário do site com o nome de um parâmetro (utm_source, gclid…) recebem a origem
      guardada; orbita_origem o tipo de origem e orbita_ref o código já pronto. Campo visível ou já preenchido não é tocado. */
  var CAMPOS_FORM = PARAMS.concat(["orbita_origem", "orbita_ref"]);
  function preencherFormularios(raizForm) {
    if (!ativo || !consentido) return 0;
    var base = raizForm && raizForm.querySelectorAll ? raizForm : doc;
    if (!base || typeof base.querySelectorAll !== "function") return 0;
    var e = estado(), n = 0, pronto = codigoGuardado();
    for (var i = 0; i < CAMPOS_FORM.length; i++) {
      var nome = CAMPOS_FORM[i];
      var valor = nome === "orbita_ref" ? pronto : nome === "orbita_origem" ? (vazio(e.d) && e.r ? e.r.src + " (" + e.r.tipo + ")" : (e.d.utm_source || "")) : e.d[nome];
      if (!valor) continue;
      var lista;
      try { lista = base.querySelectorAll('input[name="' + nome + '"]'); } catch (x) { lista = []; }
      for (var j = 0; j < lista.length; j++) {
        var inp = lista[j], tipo = String((inp.getAttribute && inp.getAttribute("type")) || inp.type || "").toLowerCase();
        if (tipo !== "hidden" || (inp.value && String(inp.value).trim())) continue;
        inp.value = String(valor).slice(0, 250); n++;
      }
    }
    if (n) log("formulário: campos preenchidos", n);
    return n;
  }
  function aoEnviarForm(ev) { try { var f = ev && ev.target; if (f && String(f.tagName || "").toLowerCase() === "form") preencherFormularios(f); } catch (x) { /* nunca quebra o site */ } }

  /** AD-170: o que o script vê nesta página (só com ?orbita_debug=1, só no console). */
  function diagnostico() {
    var e = estado(), links = [];
    try {
      var lista = doc && doc.querySelectorAll ? doc.querySelectorAll("a[href], [data-orbita-wa]") : [];
      for (var i = 0; i < lista.length && links.length < 50; i++) {
        var h = hrefDe(lista[i]);
        if (ehLinkWhatsapp(h) || ehEncurtador(h)) links.push({ link: String(h).slice(0, 120), rastreia: ehLinkWhatsapp(h) && !ehMensagemCurta(h), motivo: ehEncurtador(h) ? "encurtado" : ehMensagemCurta(h) ? "mensagem curta do WhatsApp Business" : "" });
      }
    } catch (x) { /* sem DOM */ }
    return { ativo: ativo, motivo: !/^[0-9a-f]{48}$/.test(cfg.chave) ? "data-chave ausente ou inválida" : !ativo ? "Global Privacy Control do navegador" : !consentido ? "aguardando consentimento" : "",
      ios: ios, parametros: e.d, referencia: e.r || null, codigo: codigoGuardado(), links: links, ultimoErro: ultimoErro };
  }

  /* ---------------- API pública ---------------- */
  var api = {
    versao: VERSAO_SCRIPT,
    ativo: function () { return ativo; },
    dados: function () { var e = estado(), o = {}; for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) o[k] = e.d[k]; } return o; },
    codigo: function () { return registrar(); },
    link: function (href) {
      var original = String(href == null ? "" : href);
      if (!ativo || !ehLinkWhatsapp(original)) return Promise.resolve(original);
      // plano 1000b · AB-126: o relógio do limite é desligado quando o registro responde antes (antes ficava pendurado até cfg.espera)
      var relogio = null;
      var limite = new Promise(function (ok) { relogio = janela.setTimeout(function () { relogio = null; ok(null); }, cfg.espera); });
      var soltar = function () { if (relogio != null) { janela.clearTimeout(relogio); relogio = null; } };
      return Promise.race([registrar(), limite]).then(function (c) { soltar(); return c ? reescrever(original, c) : original; }, function () { soltar(); return original; });
    },
    reescrever: reescrever,
    classificarReferencia: classificarReferencia,   // plano 1500c · AC-196
    canalContato: canalContato,                     // plano 1500c · AC-198
    preencherFormularios: preencherFormularios,     // plano 1500c · AC-197
    ehLinkWhatsapp: ehLinkWhatsapp,
    ehMensagemCurta: ehMensagemCurta,
    ehEncurtador: ehEncurtador,
    capturar: capturar,
    diagnostico: diagnostico,
    /** AD-166: o banner de cookies do site chama isto quando a pessoa aceita (com data-consentimento="aguardar"). */
    consentir: function () {
      if (consentido) return true;
      consentido = true;
      if (ativo) { try { registrarVisita(); preaquecer(); preencherFormularios(); } catch (e) { /* nunca quebra o site */ } }
      log("consentimento recebido", diagnostico());
      return true;
    },
    /** plano 1000b · AB-123: a pessoa retirou o consentimento no banner — nada mais é guardado nem enviado e a origem guardada é
        apagada (localStorage, sessionStorage e a memória). consentir() liga de novo. */
    revogar: function () {
      consentido = false;
      memoria = null;
      var lojas = ["localStorage", "sessionStorage"];
      for (var i = 0; i < lojas.length; i++) { try { if (janela[lojas[i]] && janela[lojas[i]].removeItem) { janela[lojas[i]].removeItem(CHAVE_LS); janela[lojas[i]].removeItem(CHAVE_LS_V1); } } catch (e) { /* sem storage */ } }
      log("consentimento retirado: origem apagada");
      return true;
    }
  };
  janela.OrbitaRastreio = api;

  /** AD-160: visita com origem de campanha (utm/ids de clique) e sem código pronto: pede o código já no carregamento — no clique
      ele está em cache e o link segue síncrono, dentro do gesto (o que o iPhone exige para abrir o app). */
  function preaquecer() {
    var e = estado(), tem = false;
    for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) { tem = true; break; } }
    if (tem && !codigoGuardado()) janela.setTimeout(function () { try { registrar("aquecimento"); } catch (x) { /* ok */ } }, 0);   // plano 1000b · AB-007
  }

  /** AD-164: site de uma página só (Next, Wix…) troca o endereço por history.pushState/replaceState ou popstate, sem recarregar —
      a visita com utm/gclid nova é recapturada na troca (antes só no carregamento). */
  function aoMudarEndereco() {
    if (!consentido) return;
    try { registrarVisita(); preaquecer(); preencherFormularios(); log("endereço mudou (SPA): parâmetros", estado().d); } catch (e) { /* nunca quebra o site */ }
  }
  function envolverHistorico() {
    var hist = janela.history;
    if (hist) {
      var nomes = ["pushState", "replaceState"];
      for (var i = 0; i < nomes.length; i++) (function (nome) {
        var orig = hist[nome];
        if (typeof orig !== "function" || orig.__orbita) return;
        var novo = function () { var r = orig.apply(this, arguments); janela.setTimeout(aoMudarEndereco, 0); return r; };
        novo.__orbita = true;
        try { hist[nome] = novo; } catch (e) { /* history congelado: só o popstate */ }
      })(nomes[i]);
    }
    if (typeof janela.addEventListener === "function") {
      janela.addEventListener("popstate", function () { aoMudarEndereco(); });
      // plano 1000b · AB-127: sites que navegam por #/página (com ?utm na URL) também recapturam a campanha
      janela.addEventListener("hashchange", function () { aoMudarEndereco(); });
    }
  }

  // o ouvinte de clique existe SEMPRE (revisão 13/10): sem ele o <button data-orbita-wa> ficava morto com GPC/chave inválida
  if (doc && doc.addEventListener) doc.addEventListener("click", function (ev) { try { aoClicar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
  if (ativo && doc && doc.addEventListener) {
    if (consentido) { try { registrarVisita(); preaquecer(); } catch (e) { /* nunca quebra o site */ } }
    try { envolverHistorico(); } catch (e) { /* sem history: segue */ }
    try { envolverOpen(); } catch (e) { /* sem window.open: segue */ }
    // plano 1500c · AC-199: sem «pointerover» — só passar o mouse criava código (e registro) para quem nem clicava; o aquecimento é no
    // toque, no pointerdown (abaixo, aoApontar) e no foco pelo teclado
    doc.addEventListener("touchstart", aoInteragir, { capture: true, passive: true });
    // plano 1500c · AC-197: campos escondidos do formulário — já no carregamento (DOM pronto) e de novo no envio
    doc.addEventListener("submit", aoEnviarForm, true);
    if (consentido) {
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { try { preencherFormularios(); } catch (e) { /* ok */ } });
      else { try { preencherFormularios(); } catch (e) { /* ok */ } }
    }
    doc.addEventListener("focusin", aoInteragir, true);
    doc.addEventListener("contextmenu", function (ev) { try { aoApontar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
    doc.addEventListener("pointerdown", function (ev) { try { aoApontar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
  }
  if (depurar) { try { log("diagnóstico", diagnostico()); } catch (e) { /* ok */ } }
})(typeof window !== "undefined" ? window : this);
