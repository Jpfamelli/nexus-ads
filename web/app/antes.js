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
  raiz.classList.add("js");
})();
