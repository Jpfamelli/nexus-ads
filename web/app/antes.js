/* ============================================================
   ÓRBITA — antes.js · frente F3 · ESPEC §2.2, §3.9, §7.4
   Roda SÍNCRONO no <head>, antes da primeira pintura (a CSP proíbe
   <script> inline). Pinta a marca guardada no navegador para não
   piscar: localStorage['nx-app-marca'] = {host, org, vars, produto,
   favicon}; e, se houver empresa ativa com tema próprio,
   localStorage['nx-app-tema-<cliente>'] = {vars, ...}. O app.js
   confirma com nx_marca_publica e atualiza o cache.
   Sem import, sem módulo, nada que possa lançar erro para fora.
   ============================================================ */
(function () {
  "use strict";
  var raiz = document.documentElement;
  function ler(k) { try { var s = window.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function esquema() { try { return window.localStorage.getItem("nx-app-esquema") || "claro"; } catch (e) { return "claro"; } }
  // M13: o produto aberto (?produto=crm|ads|atendimento) marca o <html> antes da primeira pintura: o acento do produto não pisca
  try {
    var produtoAberto = new URLSearchParams(location.search).get("produto");
    if (produtoAberto === "crm" || produtoAberto === "ads" || produtoAberto === "atendimento") raiz.setAttribute("data-produto", produtoAberto);
  } catch (e) { /* sem query: o app.js põe depois */ }
  var preferido = esquema();
  if (preferido === "claro" || preferido === "escuro") {
    raiz.setAttribute("data-esquema", preferido);
    raiz.style.colorScheme = preferido === "claro" ? "light" : "dark";
  }
  function aplicar(vars) {
    if (!vars || typeof vars !== "object") return;
    if (preferido !== "marca" && vars["--esquema"] !== preferido) return;
    for (var k in vars) {
      if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
      if (k.indexOf("--") !== 0 || k === "--esquema") continue;
      var v = String(vars[k]);
      if (/[;{}<>]/.test(v)) continue;
      raiz.style.setProperty(k, v);
    }
    var esq = vars["--esquema"] === "claro" ? "claro" : "escuro";
    raiz.setAttribute("data-esquema", esq);
    raiz.style.colorScheme = esq === "claro" ? "light" : "dark";
  }
  try {
    var m = ler("nx-app-marca");
    var orgUrl = null;
    try { orgUrl = new URLSearchParams(location.search).get("org"); } catch (e) { orgUrl = null; }
    if (m && (!m.host || m.host === location.host) && (!orgUrl || m.org === orgUrl)) {
      aplicar(m.vars);
      if (typeof m.produto === "string" && m.produto) document.title = m.produto;
      if (typeof m.favicon === "string" && /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(m.favicon)) {
        var l = document.getElementById("favicon");
        if (l) l.setAttribute("href", m.favicon);
      }
    }
    // tema da empresa ativa (só depois do login; a tela de entrar usa a marca da org)
    var h = location.hash || "";
    if (!/^#\/?(login|convite|senha)(\/|$|\?)/.test(h)) {
      var cli = null;
      try { cli = window.localStorage.getItem("nx-app-cliente"); } catch (e) { cli = null; }
      if (cli && /^[0-9a-f-]{36}$/.test(cli)) {
        var t = ler("nx-app-tema-" + cli);
        if (t && t.vars) aplicar(t.vars);
      }
    }
  } catch (e) { /* sem cache: o app.js pinta */ }
  // M11: pré-carrega o módulo da tela que o endereço pede, em paralelo com o app.js. Falha aqui nunca quebra o boot:
  // sem o preload o app.js carrega o módulo quando precisar (só fica uns 0,3 s mais lento).
  try {
    var cs = document.currentScript, ver = null;
    if (cs && cs.src) ver = new URL(cs.src, location.href).searchParams.get("v");
    if (ver && /^[A-Za-z0-9._-]+$/.test(ver)) {
      var tela = { inicio: "inicio", conversas: "conversas", crm: "crm", contatos: "crm", empresas: "crm", tarefas: "crm", agenda: "agenda",
        anuncios: "anuncios", automacoes: "automacoes", relatorios: "relatorios", config: "config" };
      var aquecer = {
        inicio: { js: ["rel-logica.js", "graficos.js"], css: "relatorios.css" },
        conversas: { js: ["cv-logica.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js"], css: "conversas.css" },
        crm: { js: ["crm-logica.js", "crm-kanban.js", "crm-negocio.js"], css: "crm.css" },
      };
      var seg = (location.hash || "").replace(/^#\/?/, "").split(/[\/?]/)[0];
      var logado = false;
      try { logado = !!window.localStorage.getItem("nx-token"); } catch (e) { logado = false; }
      var alvo = null;
      if (/^(login|convite|senha)$/.test(seg) || !logado) alvo = "login";
      else if (Object.prototype.hasOwnProperty.call(tela, seg)) alvo = tela[seg];
      else if (!seg) {
        var prod = new URLSearchParams(location.search).get("produto");
        alvo = prod === "crm" ? "crm" : prod === "ads" ? "anuncios" : prod === "atendimento" ? "conversas" : "inicio";
      }
      if (alvo) {
        var lk = document.createElement("link");
        lk.rel = "modulepreload";
        lk.href = alvo + ".js?v=" + ver;
        document.head.appendChild(lk);
        var extras = aquecer[alvo];
        if (extras) {
          for (var i = 0; i < extras.js.length; i++) {
            var modulo = document.createElement("link");
            modulo.rel = "modulepreload";
            modulo.href = extras.js[i] + "?v=" + ver;
            document.head.appendChild(modulo);
          }
          var estilo = document.createElement("link");
          estilo.rel = "preload";
          estilo.as = "style";
          estilo.href = extras.css + "?v=" + ver;
          document.head.appendChild(estilo);
        }
      }
    }
  } catch (e) { /* ver acima */ }
  raiz.classList.add("js");
})();
