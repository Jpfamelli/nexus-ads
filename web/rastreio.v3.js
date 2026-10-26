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
   plano 2000d (ainda antes de publicar): Shadow DOM e iframe do mesmo site (DA-267/268), utm depois do # (DA-269), navegador dos
     apps, android-app://, Google pago sem gclid e assistentes de IA (DA-270..273), rolar não aquece (DA-275), telefone na 1ª visita e
     mailto (DA-277/278), formulário que aparece depois (DA-279), revogar desfaz os links (DA-280), um script só por página (DA-281),
     fila window.ORBITA_RASTREIO_FILA e data-consentimento="google" (Consent Mode v2) (DA-282/283), utm repetida e codificada 2×
     (DA-296/297), toque repetido enquanto espera (DA-300), caminho sem dado pessoal (DA-307), fbclid novo do mesmo anúncio e
     «direto» que não trava a origem (DA-315/316). Opção nova: data-consentimento="google".
   plano 2000d (lote NX): robôs e páginas pré-renderizadas não registram (NX-212/213); macro não trocada, «amp;» e dado pessoal na
     utm (NX-206/207/214); subdomínio do site, webmail, mais redes/buscadores/IAs (NX-201..205, 216); sms: e t.me (NX-215); formulário
     do Elementor e data-orbita="utm_source", atualizado e limpo ao revogar (NX-221..225); <div data-orbita-wa> pelo teclado (NX-218);
     data-dias ≤ 90, data-espera ≤ 5000, data-url só https (NX-227/228).

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
  // plano 2000d · DA-281: outro script do Órbita já está na página (v2 e v3 juntos, ou o mesmo colado duas vezes) — este não instala
  // nada (antes os dois interceptavam o clique e geravam dois códigos)
  if (janela.__orbitaRastreio || (janela.OrbitaRastreio && janela.OrbitaRastreio.versao)) {
    try { if (janela.console && janela.console.warn) janela.console.warn("[Órbita rastreio] outro script de rastreio do Órbita já está nesta página: este foi ignorado. Deixe só um."); } catch (e) { /* sem console */ }
    return;
  }
  janela.__orbitaRastreio = 3;
  // plano 2000d · DA-321/DA-322: em gerenciadores de tag o document.currentScript vem nulo — procura o próprio <script> pelo endereço
  var atual = (doc && doc.currentScript) || (function () {
    try { var s = doc && doc.querySelectorAll ? doc.querySelectorAll('script[src*="rastreio.v3"][data-chave]') : []; return s.length ? s[s.length - 1] : null; } catch (e) { return null; }
  })();
  var cfgJanela = janela.ORBITA_RASTREIO || {};
  function attr(nome) { return atual && atual.getAttribute ? atual.getAttribute("data-" + nome) : null; }
  /** Número ≥ 0 da configuração: 0 é um valor válido (antes «|| padrão» o transformava no padrão). */
  function numero(nome, padrao) {
    var bruto = cfgJanela[nome] != null && cfgJanela[nome] !== "" ? cfgJanela[nome] : attr(nome);
    if (bruto == null || String(bruto).trim() === "") return padrao;
    var n = Number(bruto);
    return isFinite(n) && n >= 0 ? n : padrao;
  }
  /** plano 2000d · NX-227: o registro só vai para https (ou para este computador, no servidor de teste) — data-url «http://…» de outro
      endereço mandaria a origem da visita sem criptografia; volta para o padrão do Órbita e avisa. */
  function urlSegura(u) {
    var s = String(u || "").trim();
    if (/^https:\/\/[^\/?#]+/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(s)) return s;
    try { if (janela.console && janela.console.warn) janela.console.warn("[Órbita rastreio] data-url precisa começar com https:// — usando o endereço padrão do Órbita."); } catch (e) { /* sem console */ }
    return PADRAO_URL;
  }
  var urlCfg = cfgJanela.url || attr("url");
  var cfg = {
    // plano 2000d · NX-226: chave colada em MAIÚSCULAS (copiada de planilha/documento) vale igual — a chave é hex minúsculo
    chave: String(cfgJanela.chave || attr("chave") || "").trim().toLowerCase(),
    url: urlCfg ? urlSegura(urlCfg) : PADRAO_URL,   // plano 2000d · NX-227
    apikey: String(cfgJanela.apikey || attr("apikey") || PADRAO_APIKEY),
    // plano 2000d · NX-228: no máximo 90 dias guardados no aparelho (data-dias="365" guardava um ano — o texto de privacidade diz até 90)
    dias: Math.min(90, numero("dias", 30)),
    // plano 1000b · AB-128: o texto global passa pela mesma limpeza do texto por botão (sem caracteres de controle, até 300)
    texto: limpar(cfgJanela.texto || attr("texto") || "Olá! Vim pelo site.", 300) || "Olá! Vim pelo site.",
    // plano 2000d · NX-228: a espera do clique tem teto de 5 s (data-espera="30000" deixava a pessoa 30 s olhando um botão parado)
    espera: Math.min(5000, numero("espera", 1500)),
    gpc: String(cfgJanela.gpc || attr("gpc") || ""),
    consentimento: String(cfgJanela.consentimento || attr("consentimento") || "")
  };
  // plano 1000 (AD-166): com data-consentimento="aguardar" o script não guarda nem envia nada até o site chamar consentir()
  // plano 2000d · DA-283: data-consentimento="google" segue o Google Consent Mode v2 do site (gtag('consent', …) no dataLayer)
  var consentido = cfg.consentimento !== "aguardar" && cfg.consentimento !== "google";
  // AD-170: ?orbita_debug=1 liga o diagnóstico no console (nada muda no comportamento)
  // plano 2000d · NX-232: também depois do # («/#/contato?orbita_debug=1»), como os utm do DA-269
  var depurar = /[?&]orbita_debug=1(&|$)/.test(String((janela.location && janela.location.search) || "")) ||
    /[?&]orbita_debug=1(&|$)/.test(String((janela.location && janela.location.hash) || ""));
  function log(rotulo, dado) { try { if (depurar && janela.console && janela.console.info) janela.console.info("[Órbita rastreio] " + rotulo, dado === undefined ? "" : dado); } catch (e) { /* sem console */ } }
  // AD-160: iPhone/iPad — fora do gesto do clique o iOS não abre o app do WhatsApp (mostra «Continuar para a conversa» ou deixa aba em branco)
  var nav = janela.navigator || {};
  var ios = /iPhone|iPad|iPod/i.test(String(nav.userAgent || "")) || (/Macintosh/i.test(String(nav.userAgent || "")) && Number(nav.maxTouchPoints) > 1);
  // plano 2000d · NX-212: robôs (o AdsBot do Google confere a página do anúncio COM o gclid; Lighthouse, pré-visualização de links,
  // navegador automatizado) não pedem código nem registram nada — antes cada passagem do robô virava um «registro do site».
  // O link nunca muda: segue o original.
  // «bot/» (Googlebot/2.1, bingbot/2.0) e não «bot» solto: celular CUBOT tem «CUBOT» no userAgent
  var RE_ROBO = /bot\/|crawler|spider|slurp|AdsBot|Mediapartners|Lighthouse|PageSpeed|HeadlessChrome|facebookexternalhit|Prerender|GTmetrix|Pingdom/i;
  var robo = nav.webdriver === true || RE_ROBO.test(String(nav.userAgent || ""));

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
      // plano 2000d · DA-317: o que foi para a reserva (localStorage cheio) também é lido
      if (!bruto && reserva) { try { bruto = janela[reserva] ? janela[reserva].getItem(CHAVE_LS) : null; } catch (e) { bruto = null; } }
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
  // plano 2000d · DA-317: localStorage cheio (QuotaExceeded) ou bloqueado — a origem vai para o sessionStorage, que ainda vale nas
  // páginas seguintes da visita (antes ficava só na memória e sumia na troca de página)
  var reserva = loja === "localStorage" ? "sessionStorage" : null;
  function gravar(o) {
    if (!consentido) return;
    var txt = JSON.stringify(o);
    try { janela[loja].setItem(CHAVE_LS, txt); return; } catch (e) { /* cheio ou bloqueado: a reserva */ }
    try { if (reserva && janela[reserva]) janela[reserva].setItem(CHAVE_LS, txt); } catch (e) { /* sem storage: segue só em memória */ }
  }
  var memoria = null;   // espelho para quando o localStorage não existe
  function estado() { return ler() || memoria || { v: VERSAO, t: 0, d: {}, c: null, r: null }; }
  function salvar(o) { memoria = o; gravar(o); }

  /* ---------------- 1) captura dos parâmetros da URL ---------------- */
  function limpar(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max || 200);
  }
  /** plano 2000d · NX-206: e-mail, CPF com pontos ou telefone COM formatação — número puro não (o id de campanha do Meta tem 18 dígitos). */
  function dadoPessoal(v) {
    var s = String(v || "");
    return /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(s) || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(s) || (/^\+?[\d\s().-]{10,}$/.test(s) && /[\s()+]/.test(s));
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
      // plano 2000d · NX-214: endereço copiado de um HTML («?a=1&amp;utm_source=meta») — a chave vinha «amp;utm_source» e a campanha sumia
      k = k.replace(/^(amp;)+/, "");
      if (PARAMS.indexOf(k) < 0) continue;
      var v = kv.slice(1).join("=");
      try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* mantém cru */ }
      // plano 2000d · DA-297: valor codificado DUAS vezes («%25C3%25A9» → «%C3%A9») é decodificado mais uma vez («é»)
      if (/%[0-9a-f]{2}/i.test(v)) { try { v = decodeURIComponent(v); } catch (e) { /* mantém */ } }
      v = limpar(v, k.indexOf("utm_") === 0 ? 150 : 250);
      // plano 2000d · NX-207: macro que a plataforma NÃO trocou (pré-visualização do anúncio, link de teste): «{campaignid}»,
      // «{{campaign.id}}», «__CAMPAIGN_ID__», «{gclid}» — não é campanha nenhuma e não pode apagar a origem verdadeira
      if (/^\{\{?[\w.]+\}\}?$|^__[A-Z0-9_]+__$/.test(v)) v = "";
      // plano 2000d · NX-206: valor com cara de dado pessoal (e-mail, CPF, telefone) não é guardado nem enviado — ferramentas de e-mail
      // às vezes põem o endereço da pessoa em utm_term/utm_content
      if (v && dadoPessoal(v)) v = "";
      // plano 2000d · DA-296: parâmetro repetido (?utm_source=a&utm_source=b) — vale o PRIMEIRO não vazio (antes o último, sem regra)
      if (v && !achou[k]) achou[k] = v;
    }
    return achou;
  }
  /** plano 2000d · DA-269: sites com roteamento por # («/#/landing?utm_source=…») — a consulta depois do # também é lida. */
  function buscaDoHash(hash) {
    var s = String(hash || ""), i = s.indexOf("?");
    return i >= 0 ? s.slice(i + 1) : "";
  }
  /** plano 2000d · DA-269: a origem da URL = a consulta normal + a do # (a normal vence no mesmo parâmetro). */
  function capturarUrl(loc) {
    var a = capturar(loc && loc.search), b = capturar(buscaDoHash(loc && loc.hash));
    for (var k in b) { if (Object.prototype.hasOwnProperty.call(b, k) && !a[k]) a[k] = b[k]; }
    return a;
  }
  /** plano 1500c · AC-196: o TIPO de origem de uma visita sem campanha, a partir do document.referrer — só o nome do site (nunca o
      endereço completo). Navegação dentro do próprio site → null (não troca a origem). */
  // plano 2000d · NX-203: mais buscadores (Qwant, Startpage, AOL, Baidu, Naver) — antes viravam «outro site»
  var BUSCAS = { google: 1, bing: 1, duckduckgo: 1, yahoo: 1, ecosia: 1, yandex: 1, brave: 1, qwant: 1, startpage: 1, aol: 1, baidu: 1, naver: 1 };
  // plano 2000d · NX-202: Reddit, Bluesky, Discord e Telegram também são redes sociais
  var SOCIAIS = { instagram: "instagram", facebook: "facebook", fb: "facebook", "t": "x", twitter: "x", x: "x", linkedin: "linkedin", lnkd: "linkedin", youtube: "youtube", youtu: "youtube", tiktok: "tiktok", pinterest: "pinterest", threads: "threads", kwai: "kwai",
    reddit: "reddit", bsky: "bluesky", discord: "discord", telegram: "telegram" };
  // plano 2000d · NX-202: hosts sociais que o nome do domínio não diz (t.me = Telegram; l.wl.co = o atalho de links do WhatsApp)
  var SOCIAIS_HOST = { "t.me": "telegram", "l.wl.co": "whatsapp", "redd.it": "reddit", "bsky.app": "bluesky" };
  // plano 2000d · NX-204: webmail — o Gmail no navegador manda «mail.google.com» (virava «busca do Google»)
  var EMAILS = { "mail.google.com": "gmail", "outlook.live.com": "outlook", "outlook.office.com": "outlook", "outlook.office365.com": "outlook", "mail.yahoo.com": "yahoo-mail",
    "mail.uol.com.br": "uol-mail", "email.uol.com.br": "uol-mail", "webmail.terra.com.br": "terra-mail", "mail.proton.me": "proton-mail", "mail.zoho.com": "zoho-mail" };
  // plano 2000d · DA-273: assistentes de IA já mandam visitas — tipo «ia» (antes «outro site»)
  // plano 2000d · NX-205: e DeepSeek, Grok, Mistral (Le Chat) e o Copilot no Bing
  var IAS = { "chatgpt.com": "chatgpt", "chat.openai.com": "chatgpt", "perplexity.ai": "perplexity", "gemini.google.com": "gemini", "bard.google.com": "gemini",
    "copilot.microsoft.com": "copilot", "claude.ai": "claude", "you.com": "you", "phind.com": "phind", "meta.ai": "meta-ai",
    "chat.deepseek.com": "deepseek", "deepseek.com": "deepseek", "grok.com": "grok", "chat.mistral.ai": "mistral", "copilot.cloud.microsoft": "copilot" };
  // plano 2000d · DA-272: clique pago do Google sem gclid (marcação automática desligada) — vem destes domínios
  var PAGOS_GOOGLE = { "googleadservices.com": 1, "googlesyndication.com": 1, "doubleclick.net": 1 };
  // plano 2000d · DA-271: referência de app Android («android-app://com.instagram.android»)
  var APPS = { "com.instagram.android": ["instagram", "social"], "com.facebook.katana": ["facebook", "social"], "com.facebook.lite": ["facebook", "social"],
    "com.facebook.orca": ["messenger", "social"], "com.google.android.gm": ["gmail", "email"], "com.google.android.googlequicksearchbox": ["google", "busca"],
    "com.linkedin.android": ["linkedin", "social"], "com.zhiliaoapp.musically": ["tiktok", "social"], "com.ss.android.ugc.trill": ["tiktok", "social"],
    "com.twitter.android": ["x", "social"], "com.pinterest": ["pinterest", "social"], "com.google.android.youtube": ["youtube", "social"], "com.whatsapp": ["whatsapp", "social"] };
  // plano 2000d · DA-270: navegador interno dos apps (sem referência) — o userAgent diz de onde veio
  function origemDoNavegador(ua) {
    var s = String(ua || "");
    if (/Instagram/i.test(s)) return { src: "instagram", tipo: "social" };
    if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(s)) return { src: "facebook", tipo: "social" };
    if (/musical_ly|BytedanceWebview|TikTok/i.test(s)) return { src: "tiktok", tipo: "social" };
    if (/LinkedInApp/i.test(s)) return { src: "linkedin", tipo: "social" };
    if (/Pinterest/i.test(s)) return { src: "pinterest", tipo: "social" };
    if (/Snapchat/i.test(s)) return { src: "snapchat", tipo: "social" };
    // plano 2000d · NX-216: Threads (o app se identifica como «Barcelona») e o X/Twitter no navegador interno
    if (/\bBarcelona\b/.test(s)) return { src: "threads", tipo: "social" };
    if (/TwitterAndroid|Twitter for i(Phone|Pad)/i.test(s)) return { src: "x", tipo: "social" };
    return null;
  }
  function classificarReferencia(ref, hostAtual, ua) {
    var bruto = String(ref == null ? "" : ref).trim();
    var app = /^android-app:\/\/([a-z0-9_.]+)/i.exec(bruto);
    if (app) { var pk = app[1].toLowerCase(), conh = APPS[pk]; return conh ? { src: conh[0], tipo: conh[1] } : { src: pk.slice(0, 100), tipo: "app" }; }
    var m = /^https?:\/\/([^\/?#:]+)/i.exec(bruto);
    if (!m) return origemDoNavegador(ua) || { src: "direto", tipo: "direto" };
    var host = m[1].toLowerCase().replace(/^www\./, ""), aqui = String(hostAtual || "").toLowerCase().replace(/^www\./, "");
    if (aqui && host === aqui) return null;
    // plano 2000d · NX-201: subdomínio do próprio site («loja.clinica.com.br» → «clinica.com.br», e o contrário) é navegação interna —
    // antes a pessoa que vinha do blog para o site virava «outro site» e a origem verdadeira se perdia
    // (o domínio mais curto precisa ser um site, não só o sufixo: «com.br» nunca casa)
    var curto = host.length < aqui.length ? host : aqui, rotulos = curto.split(".").length;
    var ehSite = rotulos > (/\.(com|co|net|org|gov|edu)\.[a-z]{2}$/.test(curto) ? 2 : 1);
    if (aqui && ehSite && (host.slice(-(aqui.length + 1)) === "." + aqui || aqui.slice(-(host.length + 1)) === "." + host)) return null;
    if (IAS[host]) return { src: IAS[host], tipo: "ia" };
    if (EMAILS[host]) return { src: EMAILS[host], tipo: "email" };   // plano 2000d · NX-204
    if (SOCIAIS_HOST[host]) return { src: SOCIAIS_HOST[host], tipo: "social" };   // plano 2000d · NX-202
    for (var pg in PAGOS_GOOGLE) { if (Object.prototype.hasOwnProperty.call(PAGOS_GOOGLE, pg) && (host === pg || host.slice(-(pg.length + 1)) === "." + pg)) return { src: "google", tipo: "pago" }; }
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
    var novos = capturarUrl(janela.location);   // plano 2000d · DA-269: também a consulta depois do #
    var temNovos = false; for (var k in novos) { if (Object.prototype.hasOwnProperty.call(novos, k)) { temNovos = true; break; } }
    // plano 1000b · AB-226: só uma origem de verdade troca a guardada — utm_source/utm_campaign ou um id de clique diferente do
    // guardado; parâmetro solto (só utm_term, ?utm_source=&gclid=<o mesmo>) não apaga a campanha anterior
    if (temNovos && (vencido || vazio(e.d) || origemNova(novos, e.d))) e = { v: VERSAO, t: agora, d: novos, c: null, r: null };
    else if (vencido) e = { v: VERSAO, t: agora, d: {}, c: null, r: null };
    // plano 1500c · AC-196: sem campanha guardada nem na URL, guarda o tipo de origem (a 1ª da visita vale; interna não troca)
    // plano 2000d · DA-316: a 1ª visita «direta» não trava a origem — uma visita depois por busca/rede social/IA troca o «direto»
    if (!temNovos && vazio(e.d) && (!e.r || e.r.tipo === "direto")) {
      var ref = null;
      try { ref = classificarReferencia(doc && doc.referrer, janela.location && janela.location.hostname, nav.userAgent); } catch (x) { ref = null; }
      if (ref && !(e.r && ref.tipo === "direto")) { e.r = ref; if (!e.t) e.t = agora; }
    }
    if (e.v !== VERSAO) e.v = VERSAO;
    salvar(e);
  }
  function vazio(d) { for (var k in d || {}) { if (Object.prototype.hasOwnProperty.call(d, k)) return false; } return true; }
  function origemNova(novos, guardados) {
    if (novos.utm_source || novos.utm_campaign) return true;
    for (var i = 0; i < IDS_CLIQUE.length; i++) {
      var id = IDS_CLIQUE[i];
      // plano 2000d · DA-315: o Meta gera um fbclid NOVO a cada clique no mesmo anúncio — sem utm novo, outro fbclid sobre um fbclid
      // guardado não é outra origem (antes: o mesmo anúncio clicado 2× virava duas origens e dois códigos)
      if (id === "fbclid" && (guardados || {}).fbclid) continue;
      if (novos[id] && novos[id] !== (guardados || {})[id]) return true;
    }
    return false;
  }

  /* ---------------- 2) código curto (chamada ao Órbita) ---------------- */
  var voo = null;          // chamada em andamento (uma só por vez)
  var falhouEm = 0, falhas = 0;
  function pausaAtual() { return falhas ? Math.min(PAUSA_FALHA_MAX_MS, PAUSA_FALHA_MS * Math.pow(2, falhas - 1)) : 0; }
  function assinatura(d) { var s = ""; for (var i = 0; i < PARAMS.length; i++) s += (d[PARAMS[i]] || "") + "|"; return s; }
  function paginaAtual() {
    var l = janela.location;
    // plano 2000d · NX-209: no máximo 300 caracteres — o servidor recusa p_dados acima de 8 KB e o clique saía sem código
    return l ? (String(l.origin || "") + caminhoSeguro(l.pathname)).slice(0, 300) : "";
  }
  /** plano 2000d · NX-208: pedaço com cara de token (link de redefinir senha, pedido, convite): 20+ letras/números sem palavras, com 4+ dígitos. */
  function pareceToken(d) {
    return /^[A-Za-z0-9_=-]{20,}$/.test(d) && (d.match(/\d/g) || []).length >= 4 && !/[a-z]{3,}-[a-z]{3,}/i.test(d);
  }
  /** plano 2000d · DA-307: pedaço do caminho com cara de dado pessoal (e-mail, CPF, telefone, número longo) vira «-» antes de sair. */
  function caminhoSeguro(p) {
    return String(p || "").split("/").map(function (seg) {
      var d = seg; try { d = decodeURIComponent(seg); } catch (e) { /* cru */ }
      return /@/.test(d) || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(d) || /^\+?[\d\s().-]{10,}$/.test(d) || pareceToken(d) ? "-" : seg;   // NX-208
    }).join("/");
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
    if (robo || recusada || preRenderizando()) return Promise.resolve(null);   // plano 2000d · NX-212 / NX-211 / NX-213
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
      if (!r || !r.ok) {
        var eh = new Error("http"); eh.status = r ? r.status : 0;
        // plano 2000d · NX-210: o corpo do erro (PostgREST: {message: "limite_taxa"}) diz o motivo
        if (r && typeof r.json === "function") return Promise.resolve().then(function () { return r.json(); }).then(function (b) { eh.codigo = b && (b.message || b.erro || b.code); throw eh; }, function () { throw eh; });
        throw eh;
      }
      return r.json();
    }).then(function (j) {
      var c = j && j.codigo;
      if (!j || j.ok !== true || typeof c !== "string" || !RE_CODIGO.test(c)) throw new Error("formato");
      // e: o evento com que o código nasceu; ev: o servidor entende eventos (aceita a confirmação do clique)
      var est = estado(); est.c = { c: c, t: Date.now(), s: assinatura(est.d), e: evento, ev: j.eventos === true }; salvar(est);
      falhas = 0;
      // plano 2000d · NX-223: o campo orbita_ref do formulário recebe o código assim que ele chega (antes só no próximo carregamento,
      // troca de endereço ou envio — a integração que lê o campo antes ficava sem o código)
      try { preencherFormularios(); } catch (y) { /* nunca quebra o site */ }
      if (evento === "aquecimento" && vooClique) { vooClique = false; confirmarClique(); }   // clicou enquanto o aquecimento voava
      return c;
    }).catch(function (x) {
      falhouEm = Date.now(); falhas++;
      // plano 1000b · AB-125: o motivo fica guardado (diagnostico().ultimoErro) e vai ao console com ?orbita_debug=1 — chave revogada
      // (401/403) deixava de funcionar em silêncio até no diagnóstico
      ultimoErro = { em: falhouEm, status: (x && x.status) || 0, motivo: motivoErro(x) };   // plano 2000d · NX-210
      // plano 2000d · NX-211: 401/403 = a chave pública (data-apikey) foi recusada — tentar de novo a cada clique não adianta: para
      // nesta página e avisa UMA vez no console, mesmo sem ?orbita_debug (antes só o diagnóstico sabia)
      if (ultimoErro.status === 401 || ultimoErro.status === 403) {
        recusada = true;
        try { if (janela.console && janela.console.warn) janela.console.warn("[Órbita rastreio] o Órbita recusou o acesso (" + ultimoErro.status + "): confira data-apikey e data-url no código do site — os links seguem sem o código [ref]."); } catch (y) { /* sem console */ }
      }
      log("registro recusado:", ultimoErro);
      return null;
    })
      .then(function (c) { janela.clearTimeout(timer); voo = null; vooClique = false; return c; });
    return voo;
  }
  var vooClique = false;
  var ultimoErro = null;   // plano 1000b · AB-125
  var recusada = false;    // plano 2000d · NX-211
  /** plano 2000d · NX-210: o motivo da falha em português (antes «http» ou «Failed to fetch» cru no diagnóstico). */
  function motivoErro(x) {
    var st = (x && x.status) || 0, cod = String((x && x.codigo) || "");
    if (x && x.name === "AbortError") return "tempo esgotado (o Órbita demorou mais de 4 s)";
    if (/limite_taxa/.test(cod) || st === 429) return "limite de cliques por minuto atingido";
    if (st === 401 || st === 403) return "chave pública (data-apikey) recusada";
    if (/dados_invalidos/.test(cod)) return "dados recusados pelo Órbita";
    if (st >= 500) return "o Órbita está fora do ar (erro " + st + ")";
    if (x && x.message === "formato") return "resposta inesperada do Órbita";
    if (!st) return "sem conexão com o Órbita";
    return "erro " + st;
  }
  /** plano 2000d · NX-213: página PRÉ-RENDERIZADA pelo navegador (speculation rules) — a pessoa ainda nem abriu: nada é pedido até ela ver. */
  function preRenderizando() { return !!(doc && doc.prerendering === true); }
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
    "linktr.ee": 1, "beacons.ai": 1, "bitly.com": 1, "bit.do": 1, "lnk.bio": 1, "taplink.cc": 1, "linkme.bio": 1, "shorturl.at": 1, "s.id": 1, "ow.ly": 1, "buff.ly": 1, "walink.co": 1, "zap.ly": 1, "wa.link.br": 1, "goo.gl": 1,
    // plano 2000d · NX-217: mais encurtadores e páginas de link comuns no Brasil
    "rb.gy": 1, "t.ly": 1, "tiny.cc": 1, "v.gd": 1, "cutt.us": 1, "l.ead.me": 1, "qrco.de": 1, "linkr.bio": 1 };
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
  /** plano 2000d · DA-267: botões dentro de Shadow DOM (widgets flutuantes de WhatsApp, web components) — o ev.target é o HOST e o <a>
      fica escondido; o caminho real do evento (composedPath) acha o link. Sem composedPath, o caminho de sempre (ancoraDe). */
  function ancoraDoEvento(ev) {
    try {
      var cam = ev && typeof ev.composedPath === "function" ? ev.composedPath() : null;
      if (cam && cam.length) {
        var achado = null;
        for (var n = 0; n < cam.length && n < 64; n++) {
          var el = cam[n];
          if (!el || el.nodeType !== 1 || !el.getAttribute) continue;
          if (el.getAttribute("data-orbita-ignorar") != null) return null;   // no link ou num pai dele (dentro ou fora da sombra)
          if (!achado && ((String(el.tagName).toLowerCase() === "a" && el.getAttribute("href")) || el.getAttribute("data-orbita-wa"))) achado = el;
        }
        return achado;
      }
    } catch (x) { /* segue o caminho antigo */ }
    return ancoraDe(ev && ev.target);
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
      var a = ancoraDoEvento(ev);   // plano 2000d · DA-267
      var href = a ? hrefDe(a) : null;
      if (a && ehLinkWhatsapp(href) && !ehMensagemCurta(href)) registrar("aquecimento");
    } catch (e) { /* nunca quebra o site */ }
  }
  /** Botão direito («copiar link»), clique do meio e toque longo: o navegador usa o href SEM passar pelo click — com o código já
      em cache, o href é reescrito aqui (síncrono); sem código, aquece para a próxima vez e o link original segue. */
  function aoApontar(ev) {
    if (!ativo || !consentido) return;
    var a = ancoraDoEvento(ev);   // plano 2000d · DA-267
    if (!a || ehBotao(a)) return;
    var original = hrefDe(a);
    if (!ehLinkWhatsapp(original) || ehMensagemCurta(original)) return;
    var pronto = codigoGuardado();
    if (pronto) { a.setAttribute("href", reescrever(originalDe(a), pronto, textoDe(a))); return; }
    restaurarHref(a);           // plano 2000d · NX-231
    registrar("aquecimento");   // plano 1000b · AB-007
  }
  /** plano 2000d · NX-231: o código que estava no href venceu (mais de 6 h com a aba aberta, ou a origem mudou) — o link volta ao
      original antes de o navegador usá-lo sozinho (copiar link, ctrl+clique); antes ia com o [ref] velho, que casava com a campanha errada. */
  function restaurarHref(a) {
    var o = a && a.getAttribute ? a.getAttribute("data-orbita-original") : null;
    if (o != null && a.getAttribute("href") !== o) a.setAttribute("href", o);
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
    if (/^mailto:/i.test(s)) return "email";   // plano 2000d · DA-278
    if (/^sms:/i.test(s)) return "sms";         // plano 2000d · NX-215
    var m = /^(?:https?:)?\/\/([^\/?#:]+)/i.exec(s);
    var host = m ? m[1].toLowerCase().replace(/^www\./, "") : "";
    // plano 2000d · NX-215: Telegram (t.me / telegram.me) também é canal de contato
    return host === "ig.me" ? "instagram" : host === "m.me" ? "messenger" : host === "t.me" || host === "telegram.me" ? "telegram" : null;
  }
  /** O toque num contato vai ao Órbita como evento «contato» — só com servidor que já respondeu {eventos: true} (est.c.ev); o link
      segue sozinho, nunca é segurado nem alterado. */
  function registrarContato(canal) {
    try {
      var est = estado();
      if (!ativo || !consentido || !temFetch()) return false;
      if (robo || recusada || preRenderizando()) return false;   // plano 2000d · NX-212 / NX-211
      // plano 2000d · DA-277: 1ª visita (sem código guardado) — antes o toque no telefone sumia do funil. Prepara o código como
      // «aquecimento» (o servidor antigo não o conta como clique) e, se o servidor disser que entende eventos, manda o contato
      if (!est.c) {
        var p0 = registrar("aquecimento");
        if (p0 && typeof p0.then === "function") p0.then(function () { var e2 = estado(); if (e2.c && e2.c.ev === true) enviarContato(canal); }, function () { /* extra */ });
        return true;
      }
      if (est.c.ev !== true) return false;
      return enviarContato(canal);
    } catch (x) { return false; }
  }
  function enviarContato(canal) {
    try {
      var est = estado();
      var corpo = { evento: "contato", canal: canal, pagina: paginaAtual() };
      for (var k in est.d) { if (Object.prototype.hasOwnProperty.call(est.d, k)) corpo[k] = est.d[k]; }
      if (vazio(est.d) && est.r && est.r.src) { corpo.referencia = est.r.src; corpo.referencia_tipo = est.r.tipo; }
      var p = postar({ corpo: corpo });
      if (p && typeof p.then === "function") p.then(null, function () { /* extra: nunca quebra o link */ });
      log("contato registrado:", canal);
      return true;
    } catch (x) { return false; }
  }
  var segurando = false;   // plano 2000d · DA-300: um clique está esperando o código
  function aoClicar(ev) {
    if (ev.defaultPrevented) return;
    var a = ancoraDoEvento(ev);   // plano 2000d · DA-267
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
    // plano 2000d · DA-300: 2º toque enquanto o 1º ainda espera o código (rede lenta) — ignorado; antes abria duas conversas
    if (segurando && !modificado) { ev.preventDefault(); log("toque repetido enquanto o primeiro segue: ignorado"); return; }
    registrar();                                                                    // aquece para o próximo clique
    if (modificado && !botao) { restaurarHref(a); return; }                         // sem esperar: vai o link original (NX-231: sem o [ref] vencido)
    ev.preventDefault();
    segurando = true;
    // AD-160: no iPhone nunca abre janela vazia (fora do gesto o iOS deixa aba em branco ou pede «Continuar para a conversa»):
    // vai na MESMA aba e espera menos
    var aberta = null;
    if (novaAba && !ios) { try { aberta = abrirJanela("", "_blank"); } catch (e) { aberta = null; } }
    var terminou = false;
    function ir(c) {
      if (terminou) return; terminou = true; segurando = false;
      var url = c ? reescrever(original, c, textoDe(a)) : original;
      if (c && !botao) a.setAttribute("href", url);
      log(c ? "clique: código recebido, seguindo para" : "clique: sem código a tempo, link original", url);
      seguir(a, url, novaAba, aberta);
    }
    var espera = janela.setTimeout(function () { ir(null); }, ios ? Math.min(cfg.espera, ESPERA_IOS_MS) : cfg.espera);     // órbita lento: link original
    registrar().then(function (c) { janela.clearTimeout(espera); ir(c); }, function () { janela.clearTimeout(espera); ir(null); });
  }

  /** plano 2000d · NX-218: <div>/<span data-orbita-wa> (construtores de site) não recebia foco nem abria pelo teclado — quem navega
      com Tab ou leitor de tela não chegava ao WhatsApp. Ganha tabindex="0" e role="link" (se o site não definiu) e Enter/Espaço abrem. */
  function prepararBotoes(raiz) {
    var base = raiz && raiz.querySelectorAll ? raiz : doc;
    var lista; try { lista = base && base.querySelectorAll ? base.querySelectorAll("[data-orbita-wa]") : []; } catch (x) { lista = []; }
    var n = 0;
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i], tag = String(el.tagName || "").toLowerCase();
      if (tag === "a" || tag === "button" || !el.getAttribute || !el.setAttribute) continue;
      if (el.getAttribute("tabindex") == null) { el.setAttribute("tabindex", "0"); n++; }
      if (el.getAttribute("role") == null) el.setAttribute("role", "link");
    }
    return n;
  }
  function aoTeclar(ev) {
    if (!ev || ev.defaultPrevented || ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var k = ev.key;
    if (k !== "Enter" && k !== " " && k !== "Spacebar") return;
    var a = ancoraDoEvento(ev);
    if (!a || !ehBotao(a) || String(a.tagName).toLowerCase() === "button") return;   // <a> e <button> o navegador já abre
    aoClicar(ev);
    if (!ev.defaultPrevented && typeof ev.preventDefault === "function") ev.preventDefault();   // Espaço não rola a página
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
      var lista = camposDe(base, nome);   // plano 2000d · NX-221
      for (var j = 0; j < lista.length; j++) {
        var inp = lista[j], tipo = String((inp.getAttribute && inp.getAttribute("type")) || inp.type || "").toLowerCase();
        var v = String(valor).slice(0, 250);
        if (tipo !== "hidden" || inp.value === v) continue;
        // plano 2000d · NX-222: o campo que O SCRIPT preencheu é atualizado quando a origem muda (nova campanha no site de uma página
        // só); o que veio preenchido pelo site continua intocado
        if (inp.value && String(inp.value).trim() && inp.__orbitaValor !== inp.value) continue;
        inp.value = v; inp.__orbitaValor = v; n++;
        avisarCampo(inp);   // plano 2000d · NX-224
      }
    }
    if (n) log("formulário: campos preenchidos", n);
    return n;
  }
  /** plano 2000d · NX-221: os campos de um parâmetro — name="utm_source", o formato do Elementor/WordPress
      (name="form_fields[utm_source]") e o mapeamento explícito data-orbita="utm_source" (campo com outro nome no CRM do site). */
  function camposDe(base, nome) {
    var sels = ['input[name="' + nome + '"]', 'input[name$="[' + nome + ']"]', 'input[data-orbita="' + nome + '"]'], out = [];
    for (var s = 0; s < sels.length; s++) {
      var l; try { l = base.querySelectorAll(sels[s]) || []; } catch (x) { l = []; }
      for (var i = 0; i < l.length; i++) if (out.indexOf(l[i]) < 0) out.push(l[i]);
    }
    return out;
  }
  /** plano 2000d · NX-224: formulários de React/Vue só enxergam o valor novo com o evento — dispara input e change (borbulhando). */
  function avisarCampo(inp) {
    try {
      var Ev = janela.Event;
      if (typeof inp.dispatchEvent !== "function" || typeof Ev !== "function") return;
      inp.dispatchEvent(new Ev("input", { bubbles: true })); inp.dispatchEvent(new Ev("change", { bubbles: true }));
    } catch (x) { /* nunca quebra o site */ }
  }
  /** plano 2000d · NX-225: revogar o consentimento também esvazia os campos escondidos que o script preencheu (antes a origem seguia no
      próximo envio do formulário mesmo depois de a pessoa recusar). */
  function limparFormularios() {
    var n = 0;
    if (!doc || typeof doc.querySelectorAll !== "function") return 0;
    for (var i = 0; i < CAMPOS_FORM.length; i++) {
      var lista = camposDe(doc, CAMPOS_FORM[i]);
      for (var j = 0; j < lista.length; j++) {
        var inp = lista[j];
        if (inp.__orbitaValor != null && inp.value === inp.__orbitaValor) { inp.value = ""; inp.__orbitaValor = null; n++; avisarCampo(inp); }
      }
    }
    return n;
  }
  function aoEnviarForm(ev) { try { var f = ev && ev.target; if (f && String(f.tagName || "").toLowerCase() === "form") preencherFormularios(f); } catch (x) { /* nunca quebra o site */ } }
  /** plano 2000d · DA-279: formulário inserido DEPOIS do carregamento (popup, multi-etapas, CRM embutido) recebe a origem quando
      aparece — antes só no envio, e a integração que lê o campo antes recebia vazio. Um preenchimento por quadro, no máximo. */
  var agendadoForm = false;
  function observarFormularios() {
    var MO = janela.MutationObserver;
    if (typeof MO !== "function" || !doc || !doc.documentElement) return false;
    new MO(function (mudancas) {
      var temCampo = false, temIframe = false, temBotao = false;
      for (var i = 0; i < mudancas.length; i++) {
        var add = mudancas[i].addedNodes || [];
        for (var j = 0; j < add.length; j++) {
          var no = add[j];
          if (!no || no.nodeType !== 1) continue;
          var tag = String(no.tagName).toLowerCase();
          if (tag === "input" || (no.querySelector && no.querySelector('input[type="hidden"]'))) temCampo = true;
          // plano 2000d · NX-219: iframe inserido depois do carregamento (widget de chat, construtor) também é ligado
          if (tag === "iframe" || (no.querySelector && no.querySelector("iframe"))) temIframe = true;
          if ((no.getAttribute && no.getAttribute("data-orbita-wa")) || (no.querySelector && no.querySelector("[data-orbita-wa]"))) temBotao = true;   // NX-218
        }
      }
      if (temIframe) { try { ligarIframes(); } catch (e) { /* ok */ } }
      if (temBotao) { try { prepararBotoes(); } catch (e) { /* plano 2000d · NX-218: botão que aparece depois também ganha o foco */ } }
      if (agendadoForm || !ativo || !consentido || !temCampo) return;
      agendadoForm = true;
      janela.setTimeout(function () { agendadoForm = false; try { preencherFormularios(); } catch (e) { /* ok */ } }, 0);
    }).observe(doc.documentElement, { childList: true, subtree: true });
    return true;
  }
  /** plano 2000d · DA-268: botão do WhatsApp dentro de um iframe do MESMO site (construtores que isolam o widget) — o clique de
      dentro do iframe passa pelo mesmo tratamento; iframe de outro domínio é inacessível por segurança e fica como está. */
  function ligarIframes() {
    var lista = doc && doc.querySelectorAll ? doc.querySelectorAll("iframe") : [];
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      // plano 2000d · NX-219: no DOMContentLoaded o iframe ainda mostra o «about:blank» inicial; quando ele CARREGA, o documento é
      // outro e os ouvintes se perdiam — o load liga o documento novo
      if (f && !f.__orbitaLoad && typeof f.addEventListener === "function") {
        f.__orbitaLoad = true;
        f.addEventListener("load", function () { try { ligarIframes(); } catch (e) { /* ok */ } });
      }
      ligarDocIframe(f);
    }
    return lista.length;
  }
  function ligarDocIframe(f) {
    var d = null;
    try { d = f.contentDocument; } catch (e) { d = null; }   // outro domínio: lança ou devolve null
    if (!d || !d.addEventListener || d.__orbita) return;
    d.__orbita = true;
    d.addEventListener("click", function (ev) { try { aoClicar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
    d.addEventListener("pointerdown", function (ev) { try { aoApontar(ev); } catch (e) { /* ok */ } }, true);
    d.addEventListener("keydown", function (ev) { try { aoTeclar(ev); } catch (e) { /* ok */ } }, true);   // plano 2000d · NX-218
  }

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
      ios: ios, parametros: e.d, referencia: e.r || null, codigo: codigoGuardado(), links: links, ultimoErro: ultimoErro,
      // plano 2000d · NX-233: o que mais explica «não registra nada»: versão, modo de consentimento, onde guarda, robô, chave recusada
      versao: VERSAO_SCRIPT, consentimento: cfg.consentimento || "automatico", guardaEm: cfg.dias === 0 ? "só esta visita (sessionStorage)" : "localStorage, " + cfg.dias + " dias",
      robo: robo, recusada: recusada, preRenderizada: preRenderizando() };
  }

  /* ---------------- API pública ---------------- */
  var api = {
    versao: VERSAO_SCRIPT,
    ativo: function () { return ativo; },
    dados: function () { var e = estado(), o = {}; for (var k in e.d) { if (Object.prototype.hasOwnProperty.call(e.d, k)) o[k] = e.d[k]; } return o; },
    // plano 2000d · NX-229: ler o código pela API não é um toque no WhatsApp — vai como «aquecimento» (antes contava um clique a cada
    // chamada do site, e o painel inflava)
    codigo: function () { return registrar("aquecimento"); },
    link: function (href) {
      var original = String(href == null ? "" : href);
      // plano 2000d · NX-230: link de mensagem curta (wa.me/message) não leva código — devolve o original sem criar registro à toa
      if (!ativo || !ehLinkWhatsapp(original) || ehMensagemCurta(original)) return Promise.resolve(original);
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
    capturarUrl: capturarUrl,                       // plano 2000d · DA-269
    caminhoSeguro: caminhoSeguro,                   // plano 2000d · DA-307
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
      // plano 2000d · DA-280: os links já reescritos voltam ao original (antes o [ref] continuava na página depois de revogar)
      try {
        var reescritos = doc && doc.querySelectorAll ? doc.querySelectorAll("[data-orbita-original]") : [];
        for (var r = 0; r < reescritos.length; r++) { var a = reescritos[r]; a.setAttribute("href", a.getAttribute("data-orbita-original")); a.removeAttribute("data-orbita-original"); }
      } catch (e) { /* sem DOM */ }
      try { limparFormularios(); } catch (e) { /* plano 2000d · NX-225 */ }
      log("consentimento retirado: origem apagada");
      return true;
    }
  };
  janela.OrbitaRastreio = api;

  /** plano 2000d · DA-282: o banner de cookies clicado ANTES de o script (defer) carregar deixa o pedido numa fila —
      window.ORBITA_RASTREIO_FILA = ["consentir"] (ou "revogar"); o script executa a fila ao carregar e, daí em diante, cada push na hora. */
  function executarComando(cmd) {
    try { if (cmd === "consentir") api.consentir(); else if (cmd === "revogar") api.revogar(); } catch (e) { /* nunca quebra o site */ }
  }
  function ligarFila() {
    var fila = janela.ORBITA_RASTREIO_FILA;
    var pendentes = fila && typeof fila.length === "number" ? Array.prototype.slice.call(fila) : [];
    janela.ORBITA_RASTREIO_FILA = { push: function () { for (var i = 0; i < arguments.length; i++) executarComando(arguments[i]); return 0; }, length: 0 };
    for (var i = 0; i < pendentes.length; i++) executarComando(pendentes[i]);
  }
  /** plano 2000d · DA-283: Google Consent Mode v2 — com data-consentimento="google", o estado vem do dataLayer do site:
      gtag('consent', 'default'|'update', {ad_storage|analytics_storage: 'granted'}) consente; 'denied' depois de consentido revoga. */
  function estadoConsentMode(entrada) {
    var a = entrada && typeof entrada === "object" ? entrada : null;
    if (!a || a[0] !== "consent" || !a[2] || typeof a[2] !== "object") return null;
    var v = a[2].analytics_storage || a[2].ad_storage;
    return v === "granted" ? true : v === "denied" ? false : null;
  }
  function ligarConsentMode() {
    if (cfg.consentimento !== "google") return;
    var dl = janela.dataLayer = janela.dataLayer || [];
    var aplicar = function (entrada) { var s = estadoConsentMode(entrada); if (s === true && !consentido) api.consentir(); else if (s === false && consentido) api.revogar(); };
    for (var i = 0; i < dl.length; i++) aplicar(dl[i]);
    var pushOrig = dl.push;
    try { dl.push = function () { var r = pushOrig.apply(dl, arguments); for (var j = 0; j < arguments.length; j++) aplicar(arguments[j]); return r; }; } catch (e) { /* dataLayer congelado */ }
  }
  api.estadoConsentMode = estadoConsentMode;

  /** AD-160: visita com origem de campanha (utm/ids de clique) e sem código pronto: pede o código já no carregamento — no clique
      ele está em cache e o link segue síncrono, dentro do gesto (o que o iPhone exige para abrir o app). */
  var esperaPreRender = false;
  function preaquecer() {
    // plano 2000d · NX-213: pré-renderizada — o aquecimento espera a pessoa abrir a página de fato (prerenderingchange)
    if (preRenderizando()) {
      if (!esperaPreRender && doc.addEventListener) { esperaPreRender = true; doc.addEventListener("prerenderingchange", function () { try { preaquecer(); } catch (x) { /* ok */ } }); }
      return;
    }
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
  // plano 2000d · NX-218: o teclado também abre o <div data-orbita-wa> (Enter/Espaço); NX-220: os iframes do site são ligados mesmo
  // antes do consentimento (o ouvinte só age depois dele) — antes, com data-consentimento, o botão no iframe nunca recebia o código
  if (doc && doc.addEventListener) {
    doc.addEventListener("keydown", function (ev) { try { aoTeclar(ev); } catch (e) { /* nunca quebra o site */ } }, true);
    var prepararTudo = function () { try { prepararBotoes(); ligarIframes(); } catch (e) { /* ok */ } };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", prepararTudo); else prepararTudo();
  }
  if (ativo && doc && doc.addEventListener) {
    if (consentido) { try { registrarVisita(); preaquecer(); } catch (e) { /* nunca quebra o site */ } }
    try { envolverHistorico(); } catch (e) { /* sem history: segue */ }
    try { envolverOpen(); } catch (e) { /* sem window.open: segue */ }
    // plano 1500c · AC-199: sem «pointerover» — só passar o mouse criava código (e registro) para quem nem clicava; o aquecimento é no
    // toque, no pointerdown (abaixo, aoApontar) e no foco pelo teclado
    // plano 2000d · DA-275: ROLAR a página com o dedo sobre o botão não aquece — só o toque que termina parado (touchend a menos de
    // 10 px de onde começou); antes cada rolagem criava um «aquecimento» e uma chamada
    var toque = null;
    doc.addEventListener("touchstart", function (ev) { try { var t = ev.touches && ev.touches[0]; toque = t ? { x: t.clientX, y: t.clientY, alvo: ev.target } : null; } catch (e) { toque = null; } }, { capture: true, passive: true });
    doc.addEventListener("touchend", function (ev) {
      try {
        var t = ev.changedTouches && ev.changedTouches[0], ini = toque; toque = null;
        if (!ini || !t || Math.abs(t.clientX - ini.x) > 10 || Math.abs(t.clientY - ini.y) > 10) return;
        aoInteragir(ev);
      } catch (e) { /* nunca quebra o site */ }
    }, { capture: true, passive: true });
    // plano 1500c · AC-197: campos escondidos do formulário — já no carregamento (DOM pronto) e de novo no envio
    doc.addEventListener("submit", aoEnviarForm, true);
    if (consentido) {
      // (os iframes são ligados acima, para todos — plano 2000d · NX-220)
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { try { preencherFormularios(); } catch (e) { /* ok */ } });
      else { try { preencherFormularios(); } catch (e) { /* ok */ } }
    }
    try { observarFormularios(); } catch (e) { /* sem MutationObserver */ }
    try { ligarConsentMode(); } catch (e) { /* ok */ }
    doc.addEventListener("focusin", aoInteragir, true);
    doc.addEventListener("contextmenu", function (ev) { try { aoApontar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
    doc.addEventListener("pointerdown", function (ev) { try { aoApontar(ev); } catch (e) { /* nunca quebra o link */ } }, true);
  }
  try { ligarFila(); } catch (e) { /* plano 2000d · DA-282: nunca quebra o site */ }
  if (depurar) { try { log("diagnóstico", diagnostico()); } catch (e) { /* ok */ } }
})(typeof window !== "undefined" ? window : this);
