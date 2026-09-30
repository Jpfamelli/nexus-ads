/* ============================================================
   ÓRBITA — app.js (shell) · frente F3 · ESPEC §7.1–7.2, T2
   Carrega tudo por import() com ?v=<VERSAO> (nenhum import
   estático: cada arquivo tem UM endereço); resolve a marca antes
   do login; sessão leve (nx_app_sessao); empresa ativa; menu por
   módulos × papel × prontos.js; faixas; pulso; roteador por #hash
   e o ctx que os módulos recebem.
   ============================================================ */

const VERSAO = new URL(import.meta.url).searchParams.get("v") || "dev";
const arq = nome => import(`./${nome}?v=${encodeURIComponent(VERSAO)}`);

const $ = id => document.getElementById(id);
const LS = {
  ler(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  lerTxt(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* modo privado */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* ok */ } },
};
const CHAVE_CLIENTE = "nx-app-cliente";
const CHAVE_ESQUEMA = "nx-app-esquema";
const PRONTOS_PADRAO = { MODULOS_PRONTOS: [], CONFIG_PRONTAS: ["perfil"] };
const ROTAS_PUBLICAS = new Set(["login", "convite", "senha"]);

const E = {
  M: {},                 // módulos base: dados, api, ui, tema, vocab, rotas, pulso
  api: null, ui: null,
  prontos: PRONTOS_PADRAO,
  marcaPublica: null,    // resposta de nx_marca_publica
  sessao: null,          // resposta de nx_app_sessao
  cliente: null,         // empresa ativa (item de sessao.clientes + tema)
  pulso: null,
  atual: null,           // { arquivo, mod, chave }
  assinaturas: new Set(),
  badges: {},
  titulo: "",
  produto: "Órbita",
  workspace: null,       // CRM, Nexus Ads ou Atendimento; filtro visual sobre as mesmas permissões
  faviconPadrao: null,
  ultimaRota: null,
  montando: 0,
  naoLidasEm: 0,
  temaAviso: false,
};

/* ============================================================
   ABRINDO / ERRO DE ABERTURA
   ============================================================ */
function bootMsg(texto, comAcoes = false) {
  const b = $("boot");
  if (!b) return;
  b.hidden = false;
  $("boot-msg").textContent = texto;
  $("boot-acoes").hidden = !comAcoes;
}
function bootEsconder() { const b = $("boot"); if (b) b.hidden = true; }

/* ============================================================
   INÍCIO
   ============================================================ */
async function iniciar() {
  E.faviconPadrao = $("favicon") && $("favicon").getAttribute("href");
  $("boot-tentar").addEventListener("click", () => location.reload());
  $("boot-sair").addEventListener("click", () => { try { E.M.dados && E.M.dados.apagarToken(); } catch { /* ok */ } location.hash = "#/login"; location.reload(); });
  try {
    const [dados, api, ui, tema, vocab, rotas, pulso] = await Promise.all([
      import(`../dados.js?v=${encodeURIComponent(VERSAO)}`), arq("api.js"), arq("ui.js"), arq("tema.js"), arq("vocab.js"), arq("rotas.js"), arq("pulso.js")]);
    E.M = { dados, api, ui, tema, vocab, rotas, pulso };
    E.workspace = rotas.produtoDe(location.search);
    document.documentElement.dataset.produto = E.workspace || "orbita";
    document.title = E.workspace ? rotas.PRODUTOS[E.workspace].titulo : "Órbita · Nexus";
    const manifesto = $("manifest");
    if (manifesto) manifesto.setAttribute("href", E.workspace ? rotas.manifestoProduto(E.workspace) : "manifest.webmanifest");
  } catch (e) {
    console.error(e);
    bootMsg("Não foi possível abrir o sistema. Confira a internet e tente de novo.", true);
    return;
  }
  try {
    const p = await arq("prontos.js");
    E.prontos = {
      MODULOS_PRONTOS: Array.isArray(p.MODULOS_PRONTOS) ? p.MODULOS_PRONTOS : [],
      CONFIG_PRONTAS: Array.isArray(p.CONFIG_PRONTAS) ? p.CONFIG_PRONTAS : ["perfil"],
    };
  } catch { E.prontos = PRONTOS_PADRAO; }

  const { dados, api, ui } = E.M;
  E.ui = ui;
  ui.configurar({ mensagemErro: api.mensagemErro });
  E.api = api.criarApi({
    url: dados.SUPA_URL, chave: dados.CHAVE_PUBLICA,
    token: () => dados.lerToken(),
    cliente: () => (E.cliente ? E.cliente.id : null),
    aoSessaoInvalida: () => sessaoCaiu(),
  });
  E.pulso = E.M.pulso.criarPulso({
    ler: () => (E.cliente ? E.api.rpcC("nx_pulso") : Promise.resolve(null)),
    aoNotif: n => atualizarSino(n),
  });
  E.pulso.assinar(() => { atualizarNaoLidas(); });

  if (LS.lerTxt("nx-app-menu") === "1") document.documentElement.classList.add("menu-recolhido");
  const dev = new URLSearchParams(location.search).get("dev");
  if (dev === "1") try { sessionStorage.setItem("nx-app-dev", "1"); } catch { /* ok */ }
  if (dev === "0") try { sessionStorage.removeItem("nx-app-dev"); } catch { /* ok */ }

  await carregarMarcaPublica();
  addEventListener("hashchange", () => aoMudarRota(true));
  ui.atalho("mod+k", ev => {
    if (!E.sessao || !buscaDisponivel() || $("app").hidden) return;
    ev.preventDefault();
    abrirBusca();
  });
  montarEsqueletoShell();
  await aoMudarRota(false);
}

/* ============================================================
   MARCA (white-label)
   ============================================================ */
function orgDaUrl() {
  try {
    const q = new URLSearchParams(location.search).get("org");
    if (q) return q;
    const r = E.M.rotas.rotear(location.hash);
    return r.query.org || null;
  } catch { return null; }
}

async function carregarMarcaPublica({ pintar = true } = {}) {
  const { tema } = E.M;
  try {
    const r = await E.api.publica("nx_marca_publica", { p_host: location.hostname, p_org: orgDaUrl() });
    if (r && r.marca) E.marcaPublica = r;
  } catch (e) {
    console.warn("marca pública indisponível", e && e.codigo);
  }
  const m = tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {});
  if (pintar) pintarMarca(m, { guardar: true });
  else guardarMarcaPublica(m);
}

/** Cache da marca da tela de entrada (antes.js pinta com ele antes do primeiro quadro). */
function guardarMarcaPublica(m) {
  const t = E.M.tema.derivarTema(E.M.tema.coresNoEsquema(m.cores, esquemaPreferido()));
  LS.gravar("nx-app-marca", { host: location.host, org: E.marcaPublica ? E.marcaPublica.org.slug : null, vars: t.vars, produto: m.produto, favicon: m.favicon });
}

function esquemaPreferido() {
  const t = E.M.tema;
  const salvo = LS.lerTxt(CHAVE_ESQUEMA);
  return t && t.ESQUEMAS && Object.hasOwn(t.ESQUEMAS, salvo) ? salvo : "claro";
}

function atualizarBotaoTema() {
  const b = $("bt-tema");
  if (!b || !E.M.tema) return;
  const modo = esquemaPreferido();
  const nomes = { claro: "claro", escuro: "escuro", marca: "da marca" };
  const rotulo = `Aparência ${nomes[modo]}. Escolher tema`;
  b.setAttribute("aria-label", rotulo);
  b.title = rotulo;
  const use = b.querySelector("use");
  if (use) use.setAttribute("href", `#i-${modo === "escuro" ? "lua" : modo === "marca" ? "pincel" : "sol"}`);
}

function abrirMenuTema(ancora) {
  if (!E.ui || !E.M.tema) return;
  const modo = esquemaPreferido();
  const opcoes = [["claro", "Tema claro", "sol"], ["escuro", "Tema escuro", "lua"], ["marca", "Tema da empresa", "pincel"]];
  E.ui.menu(ancora, opcoes.map(([id, rotulo, icone]) => ({
    rotulo: modo === id ? `${rotulo} · atual` : rotulo,
    icone: modo === id ? "check" : icone,
    fn: () => definirEsquema(id),
  })));
}

function definirEsquema(modo) {
  if (!E.M.tema || !Object.hasOwn(E.M.tema.ESQUEMAS, modo)) return;
  LS.gravar(CHAVE_ESQUEMA, modo);
  const m = E.marca || E.M.tema.marcaEfetiva(marcaOrgSessao(), {}, {});
  pintarMarca(m, { guardar: true });
  atualizarBotaoTema();
  const nome = { claro: "claro", escuro: "escuro", marca: "da empresa" }[modo];
  E.ui && E.ui.toast(`Tema ${nome} aplicado neste navegador.`, { tipo: "ok" });
}

/** A sessão leve vem sem as imagens da marca da org. Se a marca pública do endereço é de OUTRA org
    (ex.: cliente de revenda entrando pelo endereço padrão), busca logo/favicon da org da conta
    pela própria nx_marca_publica (?org=slug), com cache de 1 h no navegador. */
async function carregarImagensOrg({ forcar = false } = {}) {
  const org = E.sessao && E.sessao.org;
  E.imgOrg = null;
  if (!org || !org.slug) return;
  const pub = E.marcaPublica;
  if (pub && pub.org && pub.org.slug === org.slug) return;
  const chave = `nx-app-org-${org.slug}`;
  // img_hash (nx_app_sessao) muda quando o logo/favicon muda: quem já estava logado vê a troca na hora
  const assinatura = E.M.tema.hashCurto(org.marca || {}) + (org.img_hash ? `.${org.img_hash}` : "");
  const cache = forcar ? null : LS.ler(chave);
  if (cache && cache.h === assinatura && Date.now() - (cache.em || 0) < 3600e3) { E.imgOrg = cache.img || null; return; }
  try {
    const r = await E.api.publica("nx_marca_publica", { p_host: "", p_org: org.slug });
    if (r && r.org && r.org.slug === org.slug && r.marca) {
      E.imgOrg = { logo: r.marca.logo || null, logo_claro: r.marca.logo_claro || null, favicon: r.marca.favicon || null };
      LS.gravar(chave, { h: assinatura, em: Date.now(), img: E.imgOrg });
    }
  } catch { /* segue sem as imagens: o app usa o símbolo padrão */ }
}

/** Depois de salvar marca/tema: relê marca pública, sessão e imagens e repinta sem recarregar a página. */
async function recarregarMarca() {
  await carregarMarcaPublica({ pintar: false });
  await carregarSessao({ forcarImagens: true });
  const novo = E.cliente && E.sessao.clientes.find(c => c.id === E.cliente.id);
  await escolherCliente(novo ? novo.id : null, { remontar: false });
}

/** Aplica a marca efetiva (cores → tokens, produto, favicon, logos). */
function pintarMarca(m, { guardar = false, cacheCliente = null, respeitarEsquema = true } = {}) {
  const { tema } = E.M;
  const cores = tema.coresNoEsquema(m.cores, respeitarEsquema ? esquemaPreferido() : "marca");
  const t = tema.derivarTema(cores);
  tema.aplicarTema(t.vars);
  E.produto = m.produto;
  E.marca = m;
  const fav = $("favicon");
  if (fav) fav.setAttribute("href", m.favicon || E.faviconPadrao || "");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.vars["--c-fundo"]);
  pintarLogoShell();
  atualizarBotaoTema();
  atualizarTitulo();
  if (guardar) LS.gravar("nx-app-marca", { host: location.host, org: E.marcaPublica ? E.marcaPublica.org.slug : null, vars: t.vars, produto: m.produto, favicon: m.favicon });
  if (cacheCliente) LS.gravar(`nx-app-tema-${cacheCliente.id}`, { ...cacheCliente.dados, vars: t.vars });
  return t;
}

function marcaOrgSessao() {
  const org = E.sessao && E.sessao.org;
  const pub = E.marcaPublica;
  const base = { ...(org && org.marca ? org.marca : {}) };
  // a sessão não traz imagens (leve); se a org é a mesma da marca pública, as imagens vêm dela
  if (pub && pub.marca && org && pub.org && pub.org.slug === org.slug) {
    for (const k of ["logo", "logo_claro", "favicon"]) if (pub.marca[k]) base[k] = pub.marca[k];
  } else if (org && E.imgOrg) {
    for (const k of ["logo", "logo_claro", "favicon"]) if (E.imgOrg[k]) base[k] = E.imgOrg[k];
  }
  if (!org && pub) return pub.marca || {};
  return base;
}

function pintarLogoShell() {
  const { ui } = E;
  if (!ui || !E.marca) return;
  const m = E.marca;
  const escuro = document.documentElement.dataset.esquema !== "claro";
  const logo = (E.cliente && (escuro ? m.logo_cliente : (m.logo_cliente_claro || m.logo_cliente))) || (escuro ? m.logo : (m.logo_claro || m.logo));
  for (const id of ["lat-logo", "topo-marca"]) {
    const alvo = $(id);
    if (!alvo) continue;
    ui.limpar(alvo);
    if (logo) {
      const img = ui.h("img", { src: logo, alt: "" });
      img.addEventListener("load", () => { if (img.naturalWidth > img.naturalHeight * 1.6) img.classList.add("largo"); });
      alvo.appendChild(img);
    } else {
      alvo.appendChild(ui.h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, ui.h("use", { href: "#marca-orbita" })));
    }
  }
  const p = $("lat-produto");
  if (p) p.textContent = m.produto;
  const home = $("lat-home");
  if (home) home.setAttribute("aria-label", `${m.produto} — início`);
}

/** Tema da empresa ativa: cache no navegador por hash (nx_cliente_tema só quando mudou). */
async function temaDoCliente(cli) {
  if (!cli || !cli.tem_tema) return { tema: {}, marca_cliente: {} };
  const chave = `nx-app-tema-${cli.id}`;
  const cache = LS.ler(chave);
  if (cache && cache.atualizado && cache.atualizado === cli.tema_hash) return { tema: cache.tema || {}, marca_cliente: cache.marca_cliente || {}, cache: true };
  try {
    const r = await E.api.rpc("nx_cliente_tema", { p_cliente: cli.id });
    return { tema: (r && r.tema) || {}, marca_cliente: (r && r.marca_cliente) || {}, atualizado: r && r.atualizado };
  } catch (e) {
    if (cache) return { tema: cache.tema || {}, marca_cliente: cache.marca_cliente || {} };
    return { tema: {}, marca_cliente: {} };
  }
}

async function aplicarMarcaCliente() {
  const { tema } = E.M;
  const cli = E.cliente;
  const t = await temaDoCliente(cli);
  if (cli) { cli.tema = t.tema; cli.marca_cliente = t.marca_cliente; }
  const m = tema.marcaEfetiva(marcaOrgSessao(), t.tema, t.marca_cliente);
  const cache = cli && cli.tem_tema && !t.cache ? { id: cli.id, dados: { atualizado: t.atualizado || cli.tema_hash, tema: t.tema, marca_cliente: t.marca_cliente } } : null;
  pintarMarca(m, { cacheCliente: cache });
  if (cli && !cli.tem_tema) LS.apagar(`nx-app-tema-${cli.id}`);
}

/* ============================================================
   SESSÃO
   ============================================================ */
let _avisouSessao = false;
function sessaoCaiu() {
  if (!E.sessao && !E.M.dados.lerToken()) return;
  E.M.dados.apagarToken();
  E.sessao = null; E.cliente = null;
  if (E.pulso) E.pulso.parar();
  desmontarAtual();
  if (!_avisouSessao) { _avisouSessao = true; E.ui.toast("Sua sessão expirou. Entre de novo.", { tipo: "info" }); setTimeout(() => { _avisouSessao = false; }, 4000); }
  const r = E.M.rotas.rotear(location.hash);
  if (!ROTAS_PUBLICAS.has(r.modulo)) {
    try { sessionStorage.setItem("nx-app-destino", location.hash); } catch { /* ok */ }
    navegar("#/login", { substituir: true });
  }
}

async function carregarSessao({ forcarImagens = false } = {}) {
  const s = await E.api.rpc("nx_app_sessao");
  if (!s || !s.conta) throw Object.assign(new Error("sessao_invalida"), { codigo: "sessao_invalida" });
  s.clientes = Array.isArray(s.clientes) ? s.clientes : [];
  // a sessão vem enxuta (só o que foge do padrão, para caber em < 50 KB): completa aqui
  const porPlano = s.modulos_plano && typeof s.modulos_plano === "object" ? s.modulos_plano : {};
  for (const c of s.clientes) {
    c.status = c.status || "ativo";
    c.teste_ate = c.teste_ate || null;
    c.link_base = c.link_base || s.link_base_padrao || null;
    c.modulos = Array.isArray(c.modulos) ? c.modulos : (Array.isArray(porPlano[c.plano]) ? porPlano[c.plano].slice() : []);
    c.tem_tema = !!c.tem_tema;
    c.suporte = (c.papel === "gestor" || c.papel === "super") && !c.proprio;
  }
  E.sessao = s;
  await carregarImagensOrg({ forcar: forcarImagens });
  return s;
}

async function recarregarSessao() {
  const idAtual = E.cliente && E.cliente.id;
  await carregarSessao();
  const novo = E.sessao.clientes.find(c => c.id === idAtual);
  await escolherCliente(novo ? novo.id : null, { remontar: true });
}

async function sair() {
  try { await E.api.rpc("nx_sair"); } catch { /* sai do mesmo jeito */ }
  E.M.dados.apagarToken();
  E.sessao = null; E.cliente = null; E.imgOrg = null; E.notif = 0;
  if (E.pulso) E.pulso.parar();
  desmontarAtual();
  const m = E.M.tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {});
  pintarMarca(m);
  navegar("#/login", { substituir: true });
}

/* ============================================================
   EMPRESA ATIVA
   ============================================================ */
function clienteInicial() {
  const lista = E.sessao.clientes;
  if (!lista.length) return null;
  const r = E.M.rotas.rotear(location.hash);
  if (r.query.c) { const porSlug = lista.find(c => c.slug === r.query.c); if (porSlug) return porSlug.id; }
  const guardado = LS.lerTxt(CHAVE_CLIENTE);
  if (guardado && lista.some(c => c.id === guardado)) return guardado;
  const proprio = lista.find(c => !c.suporte);
  return (proprio || lista[0]).id;
}

async function escolherCliente(id, { remontar = true } = {}) {
  const lista = E.sessao ? E.sessao.clientes : [];
  const novo = lista.find(c => c.id === id) || null;
  const mudou = (E.cliente && E.cliente.id) !== (novo && novo.id);
  E.cliente = novo;
  if (novo) LS.gravar(CHAVE_CLIENTE, novo.id);
  await aplicarMarcaCliente();
  desenharShell();
  if (E.pulso) { if (novo) E.pulso.iniciar(); else E.pulso.parar(); }
  E.badges = {};
  atualizarBadges();
  if (mudou) { E.notif = 0; atualizarSinoUI(); }
  if (mudou && remontar) {
    desmontarAtual();
    await aoMudarRota(false);
  }
}

/* ============================================================
   PRONTOS / ACESSO
   ============================================================ */
function devLigado() {
  let d = false;
  try { d = sessionStorage.getItem("nx-app-dev") === "1"; } catch { d = false; }
  return d && !!(E.sessao && E.sessao.conta && E.sessao.conta.super);
}
function pronto(chave) { return E.prontos.MODULOS_PRONTOS.includes(chave) || devLigado(); }
function configPronta(id) { return E.prontos.CONFIG_PRONTAS.includes(id) || devLigado(); }
function papelAtual() { return E.cliente ? E.cliente.papel : null; }
function opcoesAcesso() {
  const papel = papelAtual();
  return {
    pronto,
    temModulo: m => !!E.cliente && E.cliente.modulos.includes(m),
    pode: min => E.M.rotas.podePapel(papel, min),
    gestorConta: !!(E.sessao && E.sessao.conta && E.sessao.conta.papel === "gestor"),
    temCliente: !!E.cliente,
    produto: E.workspace,
  };
}

/* ============================================================
   NAVEGAÇÃO
   ============================================================ */
function navegar(hash, { substituir = false } = {}) {
  const h = String(hash || "#/");
  const alvo = h.startsWith("#") ? h : "#" + (h.startsWith("/") ? h : "/" + h);
  // um modal acabou de fechar: o history.back() dele ainda está no ar; navega só depois que o histórico assentar
  if (E.ui && E.ui.camadas && E.ui.camadas.voltaPendente()) { E.ui.camadas.aposVolta(() => navegar(hash, { substituir })); return; }
  // navegar com modal aberto reaproveita a entrada do modal no histórico (senão o Voltar precisaria de dois toques)
  if (!substituir && location.hash !== alvo && E.ui && E.ui.camadas && E.ui.camadas.consumirEntrada()) {
    history.replaceState(null, "", location.pathname + location.search + alvo);
    aoMudarRota(false);
    return;
  }
  if (substituir) {
    history.replaceState(history.state, "", location.pathname + location.search + alvo);
    aoMudarRota(false);
  } else if (location.hash === alvo) {
    aoMudarRota(false);
  } else {
    location.hash = alvo;
  }
}

function linkPublico(caminhoHash) {
  const base = (E.cliente && E.cliente.link_base) || new URL("./", location.href).href.split("#")[0];
  const h = String(caminhoHash || "");
  return base.replace(/\/?$/, "/") + (h.startsWith("#") ? h : "#/" + h.replace(/^\/+/, ""));
}

async function aoMudarRota(doUsuario) {
  const seq = ++E.montando;
  const { rotas, dados } = E.M;
  const r = rotas.rotear(location.hash);

  if (r.modulo === "login" && dados.lerToken()) return navegar("#/", { substituir: true });
  if (ROTAS_PUBLICAS.has(r.modulo)) return montarPublico(r, seq);
  if (!dados.lerToken()) {
    if (r.modulo) try { sessionStorage.setItem("nx-app-destino", location.hash); } catch { /* ok */ }
    return navegar("#/login", { substituir: true });
  }
  if (!E.sessao) {
    bootMsg("Abrindo…");
    try {
      await carregarSessao();
    } catch (e) {
      if (e && e.codigo === "sessao_invalida") return; // sessaoCaiu já levou ao login
      if (e && e.codigo === "conta_pendente") { dados.apagarToken(); E.ui.toast(E.api.mensagemErro(e), { tipo: "erro" }); return navegar("#/login", { substituir: true }); }
      bootMsg(E.api.mensagemErro(e), true);
      return;
    }
    if (seq !== E.montando) return;
    if (E.sessao.conta.trocar_senha) return montarPublico({ modulo: "trocar", partes: [], query: {} }, seq);
    await escolherCliente(clienteInicial(), { remontar: false });
  }
  if (seq !== E.montando) return;
  if (E.sessao.conta.trocar_senha) return montarPublico({ modulo: "trocar", partes: [], query: {} }, seq);

  // ?c=<slug> troca a empresa ativa
  if (r.query.c) {
    const alvo = E.sessao.clientes.find(c => c.slug === r.query.c);
    const q = { ...r.query }; delete q.c;
    if (alvo && (!E.cliente || alvo.id !== E.cliente.id)) {
      history.replaceState(history.state, "", location.pathname + location.search + rotas.montarHash(r.modulo, r.partes, q));
      await escolherCliente(alvo.id, { remontar: false });
      return aoMudarRota(doUsuario);
    }
  }

  // Links profundos entre produtos mantêm o destino e atravessam para o espaço certo.
  // Acesso por papel, plano e prontos.js continua sendo validado separadamente.
  if (E.workspace && r.modulo && !rotas.rotaNoProduto(E.workspace, r.modulo)) {
    const destino = rotas.produtoDaRota(r.modulo);
    if (destino && destino !== E.workspace) {
      const href = urlWorkspace(destino, rotas.montarHash(r.modulo, r.partes, r.query));
      if (href) return location.assign(href);
    }
    const padrao = rotas.rotaPadrao(opcoesAcesso());
    return navegar(padrao === "relatorios" ? "#/relatorios/vendas" : padrao === "admin" ? "#/admin/clientes" : `#/${padrao}`, { substituir: true });
  }

  mostrarApp();
  if (!r.modulo) {
    const destino = (() => { try { const d = sessionStorage.getItem("nx-app-destino"); sessionStorage.removeItem("nx-app-destino"); return d; } catch { return null; } })();
    if (destino && !/^#\/?(login|convite|senha)/.test(destino) && destino !== "#/" && destino !== "#") return navegar(destino, { substituir: true });
    const padrao = rotas.rotaPadrao(opcoesAcesso());
    return navegar(padrao === "relatorios" ? "#/relatorios/vendas" : padrao === "admin" ? "#/admin/clientes" : `#/${padrao}`, { substituir: true });
  }
  await montarNoShell(r, seq, doUsuario);
}

/* ============================================================
   MONTAGEM DE MÓDULOS
   ============================================================ */
function desmontarAtual() {
  for (const cancelar of E.assinaturas) try { cancelar(); } catch { /* ok */ }
  E.assinaturas.clear();
  if (E.atual && E.atual.mod && typeof E.atual.mod.desmontar === "function") {
    try { E.atual.mod.desmontar(); } catch (e) { console.error("desmontar falhou", e); }
  }
  E.atual = null;
}

function construirCtx(r, alvo) {
  const { vocab, tema, rotas } = E.M;
  const cli = E.cliente;
  const papel = papelAtual();
  const ctx = {
    alvo,
    versao: VERSAO,
    rota: r,
    sessao: { conta: E.sessao.conta, org: E.sessao.org },
    cliente: cli ? {
      id: cli.id, slug: cli.slug, nome: cli.nome, status: cli.status, teste_ate: cli.teste_ate || null, plano: cli.plano,
      modulos: cli.modulos.slice(), vertical: cli.vertical, papel: cli.papel, tem_tema: !!cli.tem_tema,
      link_base: cli.link_base || null, tema: cli.tema || {}, suporte: !!cli.suporte,
    } : null,
    papel,
    pode: min => rotas.podePapel(papel, min),
    temModulo: m => !!cli && cli.modulos.includes(m),
    pronto,
    configPronta,
    vocab: vocab.vocab(cli ? cli.vertical : "generico"),
    paleta: tema.PALETA,
    api: E.api,
    ui: E.ui,
    navegar,
    linkPublico,
    pulso: {
      assinar(fn) {
        const cancelar = E.pulso.assinar(fn);
        E.assinaturas.add(cancelar);
        return () => { cancelar(); E.assinaturas.delete(cancelar); };
      },
    },
    carregar,
    titulo: definirTitulo,
    badge: definirBadge,
    // extras do shell (usados pelas telas da F3: config, admin)
    shell: { recarregarSessao, recarregarMarca, escolherCliente, sair, pintarMarca, marcaEfetiva: () => E.marca, marcaOrg: marcaOrgSessao,
      aplicarMarcaCliente, tema, dev: devLigado(), prontos: E.prontos, clientes: () => (E.sessao ? E.sessao.clientes : []),
      marcaPublica: () => E.marcaPublica },
  };
  const ponte = nome => async (...args) => {
    if (!cli || !cli.modulos.includes("crm") || !pronto("crm")) { E.ui.toast("O CRM não está disponível.", { tipo: "info" }); return null; }
    try {
      const m = await carregar("crm");
      if (typeof m[nome] !== "function") throw new Error(`crm.${nome} ausente`);
      return await m[nome](ctx, ...args);
    } catch (e) {
      console.error(e);
      E.ui.toast("O CRM não está disponível.", { tipo: "erro" });
      return null;
    }
  };
  ctx.abrirNegocio = ponte("abrirNegocio");
  ctx.novoNegocio = ponte("novoNegocio");
  ctx.abrirContato = ponte("abrirContato");
  return ctx;
}

/** import(`./<arquivo do módulo>.js?v=<versao>`) — o MESMO endereço que o roteador usa. */
function carregar(modulo) {
  const a = E.M.rotas.ARQUIVOS[modulo] || `${modulo}.js`;
  if (!/^[a-z0-9-]+\.js$/.test(a)) return Promise.reject(new Error("modulo_invalido"));
  return arq(a);
}

function cartaoBloqueio(tipo) {
  const { ui } = E;
  const tx = {
    em_breve: { titulo: "Esta área chega em breve.", texto: "Estamos terminando esta parte. Enquanto isso, use as outras áreas do menu.", icone: "relogio" },
    fora_do_plano: { titulo: "Esta área não faz parte do seu plano.", texto: "Para liberar, fale com o suporte.", icone: "cadeado" },
    sem_acesso: { titulo: "Você não tem acesso a esta área", texto: "Fale com o administrador da sua empresa.", icone: "cadeado" },
    inexistente: { titulo: "Página não encontrada", texto: "O endereço pode estar incompleto.", icone: "alerta" },
    sem_cliente: E.sessao && E.sessao.conta.papel === "gestor"
      ? { titulo: "Nenhum cliente por aqui ainda.", texto: "Crie o primeiro em Admin → Clientes.", icone: "empresa", acao: { rotulo: "Ir para Admin", fn: () => navegar("#/admin/clientes") } }
      : { titulo: "Sua conta ainda não tem acesso a nenhuma empresa.", texto: "Peça ao administrador um convite.", icone: "empresa" },
  }[tipo];
  const acao = tx.acao || (tipo === "inexistente" || tipo === "sem_acesso" || tipo === "em_breve" || tipo === "fora_do_plano"
    ? { rotulo: "Ir para o início", fn: () => navegar("#/") } : null);
  return ui.h("div", { class: "area-bloqueada" }, ui.vazio({ titulo: tx.titulo, texto: tx.texto, icone: tx.icone, acao }));
}

async function montarNoShell(r, seq, doUsuario) {
  const { rotas, ui } = E.M;
  const vista = $("vista");
  const acesso = rotas.acessoRota(r.modulo, opcoesAcesso());
  const def = rotas.rotaDe(r.modulo);
  E.ultimaRota = r;
  marcarMenu(r.modulo);
  if (E.pulso) E.pulso.modo(r.modulo === "conversas" ? "conversas" : "normal");

  if (acesso !== "ok") {
    desmontarAtual();
    ui.limpar(vista);
    vista.appendChild(cartaoBloqueio(acesso));
    definirTitulo({ em_breve: "Em breve", fora_do_plano: "Fora do plano", sem_acesso: "Sem acesso", inexistente: "Página não encontrada", sem_cliente: "Início" }[acesso]);
    if (doUsuario) focarVista();
    return;
  }

  const chave = `${def.arquivo}|${E.cliente ? E.cliente.id : "-"}`;
  let mod = null;
  if (E.atual && E.atual.chave === chave) mod = E.atual.mod;
  else {
    desmontarAtual();
    ui.limpar(vista);
    vista.appendChild(ui.esqueleto("cartoes", 4));
    try {
      mod = await arq(def.arquivo);
    } catch (e) {
      console.error(`falha ao carregar ${def.arquivo}`, e);
      if (seq !== E.montando) return;
      ui.limpar(vista);
      vista.appendChild(ui.h("div", { class: "area-bloqueada" }, ui.vazio({
        titulo: "Não foi possível abrir esta área.", texto: "Recarregue a página. Se continuar, fale com o suporte.", icone: "alerta",
        acao: { rotulo: "Recarregar", fn: () => location.reload() } })));
      return;
    }
    if (seq !== E.montando) return;
    ui.limpar(vista);
    E.atual = { arquivo: def.arquivo, mod, chave };
  }
  if (typeof mod.montar !== "function") {
    ui.limpar(vista);
    vista.appendChild(cartaoBloqueio("em_breve"));
    return;
  }
  const ctx = construirCtx(r, vista);
  try {
    await mod.montar(ctx);
  } catch (e) {
    console.error(`montar ${def.arquivo} falhou`, e);
    if (seq !== E.montando) return;
    ui.limpar(vista);
    vista.appendChild(ui.erroCartao(e, () => aoMudarRota(false)));
  }
  if (doUsuario) focarVista();
}

function focarVista() {
  const v = $("vista");
  if (!v) return;
  try { v.focus({ preventScroll: true }); } catch { v.focus(); }
  scrollTo({ top: 0 });
}

async function montarPublico(r, seq) {
  const { ui } = E.M;
  desmontarAtual();
  if (E.pulso) E.pulso.parar();
  $("app").hidden = true;
  const alvo = $("publico");
  alvo.hidden = false;
  let mod;
  try { mod = await arq("login.js"); } catch (e) {
    console.error(e);
    bootMsg("Não foi possível abrir a tela de entrada. Recarregue a página.", true);
    return;
  }
  if (seq !== E.montando) return;
  bootEsconder();
  ui.limpar(alvo);
  const ctx = {
    alvo, versao: VERSAO, rota: r, api: E.api, ui, tema: E.M.tema,
    marca: E.marca, marcaPublica: E.marcaPublica,
    sessao: E.sessao,
    navegar,
    pintarMarcaOrg(marcaOrg) { pintarMarca(E.M.tema.marcaEfetiva(marcaOrg || {}, {}), { respeitarEsquema: false }); },
    restaurarMarca() { pintarMarca(E.M.tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {})); },
    titulo: definirTitulo,
    /** depois de entrar/aceitar convite: guarda o token e abre o app. */
    async aoEntrar(token, { cliente_id } = {}) {
      E.M.dados.guardarToken(token);
      if (cliente_id) LS.gravar(CHAVE_CLIENTE, cliente_id);
      E.sessao = null; E.cliente = null;
      let destino = "#/";
      try { const d = sessionStorage.getItem("nx-app-destino"); sessionStorage.removeItem("nx-app-destino"); if (d && !/^#\/?(login|convite|senha)/.test(d)) destino = d; } catch { /* ok */ }
      navegar(destino, { substituir: true });
    },
    /** depois de trocar a senha obrigatória. */
    async aoTrocarSenha() { E.sessao = null; navegar("#/", { substituir: true }); },
    sair,
  };
  E.atual = { arquivo: "login.js", mod, chave: "login" };
  try { await mod.montar(ctx); } catch (e) {
    console.error(e);
    ui.limpar(alvo);
    alvo.appendChild(ui.h("div", { class: "entrar" }, ui.erroCartao(e, () => location.reload())));
  }
}

function mostrarApp() {
  bootEsconder();
  $("publico").hidden = true;
  E.ui.limpar($("publico"));
  $("app").hidden = false;
}

/* ============================================================
   SHELL: menu, empresa, faixas, conta
   ============================================================ */
function montarEsqueletoShell() {
  const bt = $("bt-recolher");
  bt.addEventListener("click", () => {
    const on = document.documentElement.classList.toggle("menu-recolhido");
    bt.setAttribute("aria-pressed", String(on));
    bt.setAttribute("aria-label", on ? "Expandir menu" : "Recolher menu");
    LS.gravar("nx-app-menu", on ? "1" : "0");
  });
  bt.setAttribute("aria-pressed", String(document.documentElement.classList.contains("menu-recolhido")));
}

function itensVisiveis() {
  const { rotas, vocab } = E.M;
  const op = opcoesAcesso();
  const v = vocab.vocab(E.cliente ? E.cliente.vertical : "generico");
  const itens = [];
  for (const it of rotas.MENU) {
    if (it.id === "admin") { if (op.gestorConta) itens.push({ ...it, rotulo: "Admin" }); continue; }
    if (it.id === "config") { itens.push(it); continue; }
    const acesso = rotas.acessoRota(it.id, op);
    const emConstrucao = devLigado() && !E.prontos.MODULOS_PRONTOS.includes(rotas.ROTAS[it.id].pronto);
    if (acesso === "ok") itens.push({ ...it, rotulo: it.rotulo.replace(/\{(\w+)\}/g, (_, k) => v[k] || k), emConstrucao });
  }
  return rotas.itensDoProduto(E.workspace, itens);
}

function desenharShell() {
  desenharMenu();
  desenharEmpresa();
  desenharConta();
  desenharFaixas();
  pintarLogoShell();
  if (E.ultimaRota) marcarMenu(E.ultimaRota.modulo);
}

function desenharMenu() {
  const { ui } = E;
  const nav = $("nav"), barra = $("barra");
  ui.limpar(nav); ui.limpar(barra);
  const itens = itensVisiveis();
  let separou = false;
  for (const it of itens) {
    if (it.fixo && !separou) { separou = true; if (itens.some(i => !i.fixo)) nav.appendChild(ui.h("p", { class: "rotulo nav-grupo" }, "Conta")); }
    nav.appendChild(ui.h("a", { class: "nav-b", href: `#/${it.rota}`, dataset: { id: it.id }, title: it.rotulo },
      ui.icone(it.icone), ui.h("span", { class: "nav-txt" }, it.rotulo),
      it.emConstrucao ? ui.h("span", { class: "nav-selo" }, "obra") : null,
      ui.h("span", { class: "badge", hidden: true, dataset: { badge: it.id } }),
      ui.h("span", { class: "badge-ponto", hidden: true, dataset: { ponto: it.id } })));
  }
  // barra inferior: até 4 + Mais
  const prefer = E.M.rotas.BARRA.map(id => itens.find(i => i.id === id)).filter(Boolean);
  for (const it of itens) if (prefer.length < 4 && !prefer.includes(it) && !it.fixo) prefer.push(it);
  const resto = itens.filter(i => !prefer.includes(i));
  for (const it of prefer) {
    barra.appendChild(ui.h("a", { class: "barra-b", href: `#/${it.rota}`, dataset: { id: it.id } },
      ui.icone(it.icone), ui.h("span", null, it.rotulo), ui.h("span", { class: "badge", hidden: true, dataset: { badge: it.id } })));
  }
  if (resto.length) {
    const mais = ui.h("button", { type: "button", class: "barra-b", dataset: { id: "mais" } }, ui.icone("menu"), ui.h("span", null, "Mais"));
    mais.addEventListener("click", () => abrirFolhaMais(resto));
    barra.appendChild(mais);
  }
  atualizarBadges();
}

function abrirFolhaMais(itens) {
  const { ui } = E;
  let api = null;
  const grade = ui.h("div", { class: "folha-mais" }, itens.map(it => {
    const a = ui.h("a", { href: `#/${it.rota}` }, ui.icone(it.icone), it.rotulo);
    a.addEventListener("click", () => api && api.fechar(null));
    return a;
  }));
  ui.modal({ titulo: "Mais", corpo: grade, acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: a => { api = a; } });
}

function marcarMenu(modulo) {
  const grupo = { contatos: "crm", crm: "crm", empresas: "empresas", tarefas: "tarefas" }[modulo] || modulo;
  for (const a of document.querySelectorAll(".nav-b, .barra-b")) {
    if (a.dataset.id === grupo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}

function desenharEmpresa() {
  const { ui } = E;
  const alvo = $("topo-empresa");
  ui.limpar(alvo);
  if (!E.sessao) return;
  const lista = E.sessao.clientes;
  const cli = E.cliente;
  if (!cli) {
    if (E.sessao.conta.papel === "gestor") alvo.appendChild(ui.h("span", { class: "fraco" }, "Nenhum cliente selecionado"));
    return;
  }
  const sub = cli.suporte ? "suporte" : (E.M.vocab.ROTULO_PAPEL[cli.papel] || cli.papel);
  const conteudo = [ui.avatar(cli.nome, cli.id, E.marca && E.marca.logo_cliente), ui.h("span", { class: "emp-txt" }, ui.h("b", null, cli.nome), ui.h("small", null, sub))];
  if (lista.length <= 1) {
    alvo.appendChild(ui.h("div", { class: "empresa-bt empresa-fixa" }, conteudo));
    return;
  }
  const bt = ui.h("button", { type: "button", class: "empresa-bt", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": `Empresa ativa: ${cli.nome}. Trocar de empresa` },
    conteudo, ui.icone("seta-baixo"));
  bt.addEventListener("click", () => abrirSeletorEmpresa(bt));
  alvo.appendChild(bt);
}

function abrirSeletorEmpresa(ancora) {
  const { ui } = E;
  const lista = E.sessao.clientes;
  const busca = lista.length > 8 ? ui.h("input", { type: "search", class: "flut-busca", placeholder: "Buscar empresa", "aria-label": "Buscar empresa" }) : null;
  const caixa = ui.h("div", { class: "empresa-lista", role: "listbox", "aria-label": "Empresas" });
  let flut = null;
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const desenhar = () => {
    ui.limpar(caixa);
    const q = busca ? norm(busca.value) : "";
    const achados = lista.filter(c => !q || norm(c.nome).includes(q) || norm(c.slug).includes(q));
    for (const c of achados.slice(0, 200)) {
      const b = ui.h("button", { type: "button", class: "empresa-op", role: "option", "aria-current": String(E.cliente && c.id === E.cliente.id) },
        ui.avatar(c.nome, c.id),
        ui.h("span", null, ui.h("b", null, c.nome), ui.h("small", null, [c.org_nome, c.suporte ? "suporte" : E.M.vocab.ROTULO_PAPEL[c.papel], c.status !== "ativo" ? E.M.vocab.ROTULO_STATUS[c.status] : null].filter(Boolean).join(" · "))));
      b.addEventListener("click", async () => { if (flut) flut.fechar(); if (!E.cliente || c.id !== E.cliente.id) await escolherCliente(c.id); });
      caixa.appendChild(b);
    }
    if (!achados.length) caixa.appendChild(ui.h("p", { class: "flut-vazio" }, "Nenhuma empresa com esse nome."));
  };
  if (busca) busca.addEventListener("input", desenhar);
  desenhar();
  flut = ui.flutuante(ancora, ui.h("div", { class: "pilha-p" }, ui.h("p", { class: "rotulo" }, "Trocar de empresa"), busca, caixa), { largura: 320 });
}

function desenharConta() {
  const { ui } = E;
  const pe = $("lat-pe"), dir = $("topo-dir");
  ui.limpar(pe); ui.limpar(dir);
  if (!E.sessao) return;
  const c = E.sessao.conta;
  const papelTxt = c.super ? "Plataforma" : c.papel === "gestor" ? "Gestor" : (E.cliente ? E.M.vocab.ROTULO_PAPEL[E.cliente.papel] : "");
  const abrirMenuConta = ancora => ui.menu(ancora, [
    { rotulo: "Perfil e senha", icone: "usuario", fn: () => navegar("#/config/perfil") },
    { rotulo: "Configurações", icone: "engrenagem", fn: () => navegar("#/config") },
    "-",
    { rotulo: "Sair", icone: "sair", fn: () => sair() },
  ]);
  const btPe = ui.h("button", { type: "button", class: "lat-conta", "aria-label": `Conta de ${c.nome}` },
    ui.avatar(c.nome, c.id), ui.h("span", null, ui.h("b", null, c.nome), ui.h("small", null, papelTxt)));
  btPe.addEventListener("click", () => abrirMenuConta(btPe));
  pe.appendChild(btPe);
  // topo: busca Ctrl/⌘+K, sino e avatar
  desenharFerramentasTopo(dir);
  const btTopo = ui.h("button", { type: "button", class: "bt-icone", "aria-label": `Conta de ${c.nome}` }, ui.avatar(c.nome, c.id));
  btTopo.addEventListener("click", () => abrirMenuConta(btTopo));
  dir.appendChild(btTopo);
}

/** Busca global (Ctrl/⌘+K) e sino — só com uma empresa ativa. */
function desenharFerramentasTopo(dir) {
  const { ui } = E;
  if (E.sessao) {
    const btProdutos = ui.h("button", { type: "button", class: "topo-produtos", "aria-haspopup": "dialog",
      "aria-label": "Trocar entre CRM, Nexus Ads e Atendimento" }, ui.icone("camadas"), ui.h("span", null, E.M.rotas.PRODUTOS[E.workspace]?.nome || "Produtos"));
    btProdutos.addEventListener("click", () => abrirSeletorProduto(btProdutos));
    dir.appendChild(btProdutos);
  }
  const btTema = ui.h("button", { type: "button", class: "bt-icone bt-tema", id: "bt-tema", "aria-haspopup": "menu" }, ui.icone("sol"));
  btTema.addEventListener("click", () => abrirMenuTema(btTema));
  dir.appendChild(btTema);
  atualizarBotaoTema();
  if (!E.cliente) return;
  if (buscaDisponivel()) {
    const bt = ui.h("button", { type: "button", class: "topo-busca", id: "bt-busca", "aria-label": `Buscar (${teclaMod()}+K)`, "aria-keyshortcuts": "Control+K Meta+K" },
      ui.icone("busca"), ui.h("span", { class: "rot" }, "Buscar"), ui.h("kbd", null, `${teclaMod()} K`));
    bt.addEventListener("click", () => abrirBusca());
    dir.appendChild(bt);
  }
  const sino = ui.h("button", { type: "button", class: "bt-icone sino", id: "bt-sino", "aria-haspopup": "dialog", "aria-expanded": "false" },
    ui.icone("sino"), ui.h("span", { class: "badge", id: "sino-n", hidden: true }));
  sino.addEventListener("click", () => abrirSino(sino));
  dir.appendChild(sino);
  atualizarSinoUI();
}

function urlWorkspace(id, rotaOverride = null) {
  const base = E.M.rotas.urlProduto(id);
  if (!base) return null;
  const q = new URLSearchParams();
  for (const k of ["org", "dev", "dev-falso"]) {
    const v = new URLSearchParams(location.search).get(k);
    if (v) q.set(k, v);
  }
  q.set("produto", id);
  const rota = rotaOverride || E.M.rotas.montarHash(E.M.rotas.produtoInicial(id));
  return `${base}?${q.toString()}${rota}`;
}

function abrirSeletorProduto(ancora) {
  const { ui } = E;
  const rotas = E.M.rotas;
  const grade = ui.h("div", { class: "produto-grade" }, Object.entries(rotas.PRODUTOS).map(([id, item]) => {
    const atual = id === E.workspace;
    const b = ui.h("button", { type: "button", class: "produto-op", "aria-current": atual ? "page" : null },
      ui.h("span", { class: "produto-op-icone" }, ui.icone(id === "crm" ? "funil" : id === "ads" ? "anuncio" : "chat")),
      ui.h("span", { class: "produto-op-corpo" }, ui.h("b", null, item.nome), ui.h("small", null, item.resumo)),
      atual ? ui.h("span", { class: "produto-op-atual" }, "Aberto") : ui.icone("seta-dir"));
    b.addEventListener("click", () => { const href = urlWorkspace(id); if (href) location.assign(href); });
    return b;
  }));
  ui.modal({ titulo: "Seus produtos", corpo: ui.h("div", { class: "pilha-p" }, grade,
    ui.h("p", { class: "produto-nota" }, "Os três produtos usam a mesma conta, empresa e histórico. Plano e permissões da empresa continuam valendo em cada área.")),
    acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: modal => {
      const atual = modal.el?.querySelector?.('.produto-op[aria-current="page"]');
      const primeiro = atual || modal.el?.querySelector?.(".produto-op");
      if (primeiro) primeiro.focus();
    } });
}

function teclaMod() {
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  return /mac|iphone|ipad/i.test(p) ? "⌘" : "Ctrl";
}

/* ============================================================
   BUSCA GLOBAL (Ctrl/⌘+K) — nx_buscar (F4): contatos, negócios, conversas
   ============================================================ */
function buscaDisponivel() {
  const c = E.cliente;
  return (E.workspace === null || E.workspace === "crm") && !!c && c.modulos.includes("crm") && pronto("crm") && !E.buscaFora;
}

function normTxt(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
/** Texto com o trecho buscado em <mark> — sem innerHTML (nós de texto). */
function realce(texto, q) {
  const { ui } = E;
  const s = String(texto || "");
  const n = [...s].map(ch => normTxt(ch));
  if (!q || n.some(x => x.length !== 1)) return [s];
  const i = n.join("").indexOf(normTxt(q));
  if (i < 0) return [s];
  const chars = [...s];
  const t = normTxt(q).length;
  return [chars.slice(0, i).join(""), ui.h("mark", null, chars.slice(i, i + t).join("")), chars.slice(i + t).join("")];
}

let _buscaAberta = null;
function abrirBusca() {
  const { ui } = E;
  if (!buscaDisponivel() || _buscaAberta) return;
  const v = E.M.vocab.vocab(E.cliente.vertical);
  const conversasOk = !E.workspace && E.cliente.modulos.includes("conversas") && pronto("conversas");
  const idLista = "busca-res";
  const campo = ui.h("input", { type: "search", class: "busca-campo", placeholder: `Buscar ${v.contatos.toLowerCase()}, ${v.negocios.toLowerCase()}${conversasOk ? " e conversas" : ""}`,
    "aria-label": "O que você procura", role: "combobox", "aria-expanded": "true", "aria-controls": idLista, "aria-autocomplete": "list", autocomplete: "off", spellcheck: "false" });
  const res = ui.h("div", { class: "busca-res", id: idLista, role: "listbox", "aria-label": "Resultados" });
  const status = ui.h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  const dica = ui.h("p", { class: "busca-dica" }, ui.h("kbd", null, "↑"), ui.h("kbd", null, "↓"), " navegar  ", ui.h("kbd", null, "Enter"), " abrir  ", ui.h("kbd", null, "Esc"), " fechar");
  let itens = [], sel = -1, seq = 0, api = null;

  function marcar(i) {
    sel = itens.length ? (i + itens.length) % itens.length : -1;
    itens.forEach((it, j) => it.el.setAttribute("aria-selected", String(j === sel)));
    if (sel >= 0) { campo.setAttribute("aria-activedescendant", itens[sel].el.id); itens[sel].el.scrollIntoView({ block: "nearest" }); }
    else campo.removeAttribute("aria-activedescendant");
  }
  function abrir(it) { if (api) api.fechar(null); navegar(it.hash); }
  function vazioTxt(t) { ui.limpar(res); itens = []; sel = -1; res.appendChild(ui.h("p", { class: "busca-vazio" }, t)); status.textContent = t; }
  function desenhar(r, q) {
    ui.limpar(res); itens = []; sel = -1;
    const grupos = [
      { chave: "contatos", titulo: v.contatos, icone: "contato", hash: x => `#/contatos/${encodeURIComponent(x.id)}`,
        l1: x => x.nome || ui.telBR(x.telefone), l2: x => x.telefone ? ui.telBR(x.telefone) : "" },
      { chave: "negocios", titulo: v.negocios, icone: "funil", hash: x => `#/crm/negocio/${encodeURIComponent(x.id)}`,
        l1: x => x.titulo || x.contato_nome || v.negocio, l2: x => [x.contato_nome, x.estagio_nome].filter(Boolean).join(" · ") },
      ...(conversasOk ? [{ chave: "conversas", titulo: "Conversas", icone: "chat", hash: x => `#/conversas/${encodeURIComponent(x.id)}`,
        l1: x => x.contato_nome || "Conversa", l2: x => [x.protocolo ? `Protocolo ${x.protocolo}` : null, x.status === "resolvida" ? "resolvida" : x.status === "aberta" ? "aberta" : x.status].filter(Boolean).join(" · ") }] : []),
    ];
    for (const g of grupos) {
      const lista = Array.isArray(r && r[g.chave]) ? r[g.chave] : [];
      if (!lista.length) continue;
      res.appendChild(ui.h("p", { class: "rotulo busca-grupo", role: "presentation" }, g.titulo));
      for (const x of lista) {
        const it = { hash: g.hash(x) };
        const el = ui.h("button", { type: "button", class: "busca-item", role: "option", id: `busca-op-${itens.length}`, tabindex: "-1", "aria-selected": "false" },
          ui.h("span", { class: "busca-ic" }, ui.icone(g.icone)),
          ui.h("span", null, ui.h("b", null, realce(g.l1(x), q)), g.l2(x) ? ui.h("small", null, realce(g.l2(x), q)) : null));
        const idx = itens.length;
        el.addEventListener("click", () => abrir(it));
        el.addEventListener("mousemove", () => { if (sel !== idx) marcar(idx); });
        it.el = el;
        itens.push(it);
        res.appendChild(el);
      }
    }
    if (!itens.length) return vazioTxt(`Nada encontrado para “${q}”.`);
    marcar(0);
    status.textContent = `${itens.length} resultado${itens.length === 1 ? "" : "s"}.`;
  }
  const buscar = ui.debounce(async () => {
    const q = campo.value.trim();
    const n = ++seq;
    if (q.length < 2) return vazioTxt("Digite pelo menos 2 letras: nome, telefone (só números) ou protocolo.");
    res.setAttribute("aria-busy", "true");
    try {
      const r = await E.api.rpcC("nx_buscar", { p_q: q });
      if (n !== seq) return;
      desenhar(r, q);
    } catch (e) {
      if (n !== seq) return;
      if (e && (e.status === 404 || /could not find the function/i.test(String(e.codigo)))) {
        E.buscaFora = true;
        const b = $("bt-busca"); if (b) b.remove();
        return vazioTxt("A busca chega em breve.");
      }
      vazioTxt(E.api.mensagemErro(e));
    } finally { if (n === seq) res.removeAttribute("aria-busy"); }
  }, 180);
  campo.addEventListener("input", buscar);
  campo.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); marcar(sel + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); marcar(sel - 1); }
    else if (ev.key === "Enter") { ev.preventDefault(); if (itens[sel]) abrir(itens[sel]); }
  });
  vazioTxt("Digite pelo menos 2 letras: nome, telefone (só números) ou protocolo.");
  _buscaAberta = ui.modal({
    titulo: "Buscar", largura: "m",
    corpo: ui.h("div", { class: "pilha-p" }, ui.h("label", { class: "busca-grande" }, ui.icone("busca"), campo), res, status, dica),
    aoAbrir: a => {
      api = a;
      a.el.classList.add("busca-g");
      const rod = a.el.querySelector(".modal-rod"); if (rod) rod.hidden = true;
      setTimeout(() => campo.focus(), 0);
    },
  }).finally(() => { _buscaAberta = null; buscar.cancelar(); seq++; });
}

/* ============================================================
   SINO — nx_notificacoes_listar / nx_notificacoes_marcar
   ============================================================ */
const ICONE_NOTIF = { atribuida: "chat", sem_resposta: "relogio", tarefa: "tarefa", sla_etapa: "alerta", automacao: "raio",
  lead_anuncio: "anuncio", mencao: "usuario", sistema: "info" };

function atualizarSinoUI() {
  const n = Math.max(0, Number(E.notif) || 0);
  const badge = $("sino-n"), bt = $("bt-sino");
  if (badge) { badge.hidden = n <= 0; badge.textContent = n > 99 ? "99+" : n > 0 ? String(n) : ""; }
  if (bt) bt.setAttribute("aria-label", n > 0 ? `Notificações: ${n} não lida${n === 1 ? "" : "s"}` : "Notificações");
}

function abrirSino(ancora) {
  const { ui } = E;
  if (!E.cliente) return;
  if (E.sinoAberto) { E.sinoAberto.fechar(); return; }   // segundo clique no sino fecha a lista
  const lista = ui.h("div", { class: "notif-lista", "aria-live": "polite" }, ui.esqueleto("lista", 3));
  const btTodas = ui.h("button", { type: "button", class: "bt bt-fant bt-p", hidden: true }, ui.icone("checks"), "Marcar todas como lidas");
  const conteudo = ui.h("div", { class: "pilha-p" },
    ui.h("div", { class: "linha linha-entre notif-cab" }, ui.h("h2", { class: "rotulo" }, "Notificações"), btTodas), lista);
  let seq = 0;
  const f = ui.flutuante(ancora, conteudo, { classe: "notifs", aoFechar: () => { E.sinoAberto = null; } });

  async function marcar(ids) {
    try {
      const r = await E.api.rpcC("nx_notificacoes_marcar", { p_ids: ids });
      if (r && typeof r.nao_lidas === "number") { E.notif = r.nao_lidas; atualizarSinoUI(); }
    } catch (e) { ui.toast(E.api.mensagemErro(e), { tipo: "erro" }); }
  }
  async function recarregar() {
    const n = ++seq;
    try {
      const r = await E.api.rpcC("nx_notificacoes_listar", { p_limite: 30 });
      if (n !== seq || !lista.isConnected) return;
      ui.limpar(lista);
      E.notif = r.nao_lidas || 0; atualizarSinoUI();
      btTodas.hidden = !(r.nao_lidas > 0);
      if (!r.itens || !r.itens.length) {
        lista.appendChild(ui.h("div", { class: "notif-vazio" }, ui.icone("sino"),
          ui.h("p", null, ui.h("b", null, "Nenhuma notificação por aqui."), ui.h("br"), "Conversas atribuídas a você, tarefas e avisos das automações aparecem aqui.")));
        return;
      }
      for (const it of r.itens) {
        const lida = !!it.lida_em;
        const b = ui.h("button", { type: "button", class: ["notif-item", lida && "lida"] },
          ui.h("span", { class: "notif-ic" }, ui.icone(ICONE_NOTIF[it.tipo] || "info")),
          ui.h("span", null, ui.h("b", null, it.titulo), it.corpo ? ui.h("p", null, it.corpo) : null,
            ui.h("small", { title: ui.dataHoraBR(it.criado_em) }, ui.relativo(it.criado_em))),
          ui.h("i", { "aria-hidden": "true" }),
          lida ? null : ui.h("span", { class: "sr-only" }, "(não lida)"));
        b.addEventListener("click", async () => {
          if (!lida) marcar([it.id]);
          if (typeof it.link === "string" && /^#\//.test(it.link)) { f.fechar(); navegar(it.link); }
          else { b.classList.add("lida"); }
        });
        lista.appendChild(b);
      }
    } catch (e) {
      if (n !== seq) return;
      ui.limpar(lista);
      lista.appendChild(ui.h("p", { class: "flut-vazio" }, E.api.mensagemErro(e)));
    }
  }
  btTodas.addEventListener("click", async () => { await ui.carregando(btTodas, marcar(null)); recarregar(); });
  E.sinoAberto = { recarregar, fechar: () => f.fechar() };
  recarregar();
}

function desenharFaixas() {
  const { ui } = E;
  const alvo = $("faixas");
  ui.limpar(alvo);
  if ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && new URLSearchParams(location.search).get("dev-falso") === "1") {
    alvo.appendChild(ui.h("div", { class: "faixa faixa-demo-local", role: "status" }, ui.icone("info"),
      ui.h("p", null, "DEMO LOCAL · dados fictícios; mensagens e integrações não são reais.")));
  }
  const cli = E.cliente;
  if (!cli || !E.sessao) return;
  const suporteWa = E.marca && E.marca.suporte_wa;
  const btWa = texto => suporteWa ? ui.h("a", { class: "bt bt-sec", href: ui.linkWhatsApp(texto, suporteWa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
  const equipe = cli.papel === "gestor" || cli.papel === "super";
  if (cli.suporte && equipe) {
    const sair = ui.h("button", { type: "button", class: "bt bt-sec" }, "Sair");
    sair.addEventListener("click", () => navegar("#/admin/clientes"));
    alvo.appendChild(ui.h("div", { class: "faixa faixa-suporte", role: "status" }, ui.icone("escudo"),
      ui.h("p", null, "Você está no ambiente de ", ui.h("b", null, cli.nome), ` como suporte da ${E.sessao.org ? E.sessao.org.nome : "plataforma"}.`), sair));
  }
  const hoje = E.ui.hojeSP();
  if (cli.status === "teste" && cli.teste_ate && cli.teste_ate >= hoje) {
    alvo.appendChild(ui.h("div", { class: "faixa", role: "status" }, ui.icone("relogio"),
      ui.h("p", null, "Teste grátis até ", ui.h("b", null, ui.dataCurtaBR(cli.teste_ate)), "."), btWa(`Olá! Quero continuar usando o sistema na ${cli.nome}.`)));
  } else if (cli.status === "teste" && cli.teste_ate && cli.teste_ate < hoje) {
    alvo.appendChild(ui.h("div", { class: "faixa faixa-bloqueio", role: "status" }, ui.icone("cadeado"),
      ui.h("p", null, equipe ? "O teste deste cliente terminou. Só a equipe consegue alterar dados." : "O período de teste terminou. Você pode consultar, mas não alterar nada. Para continuar, fale com o suporte."),
      equipe ? null : btWa(`Olá! O teste da ${cli.nome} terminou e quero continuar.`)));
  } else if (cli.status === "suspenso" || cli.status === "cancelado") {
    alvo.appendChild(ui.h("div", { class: "faixa faixa-bloqueio", role: "status" }, ui.icone("cadeado"),
      ui.h("p", null, equipe ? `Este cliente está ${cli.status}. A equipe dele não entra; só a gestão (${E.sessao.conta.super ? "plataforma" : "agência"}) enxerga os dados.` : "O acesso desta empresa está suspenso. Fale com o suporte."),
      equipe ? null : btWa(`Olá! O acesso da ${cli.nome} está suspenso.`)));
  }
}

/* ============================================================
   TÍTULO, CONTADORES, NÃO LIDAS, SINO
   ============================================================ */
function definirTitulo(texto) { E.titulo = texto || ""; atualizarTitulo(); }
function atualizarTitulo() {
  const n = E.badges.conversas || 0;
  const nomeApp = E.workspace ? E.M?.rotas?.PRODUTOS?.[E.workspace]?.nome : "";
  const marca = E.produto || "Órbita";
  const contextoProduto = nomeApp ? `${nomeApp} · ${marca}` : marca;
  document.title = `${n > 0 ? `(${n > 99 ? "99+" : n}) ` : ""}${E.titulo ? `${E.titulo} · ` : ""}${contextoProduto}`;
}
function definirBadge(modulo, n) {
  const antes = E.badges[modulo] || 0;
  E.badges[modulo] = Math.max(0, Number(n) || 0);
  atualizarBadges(E.badges[modulo] > antes ? modulo : null);
  if (modulo === "conversas") atualizarTitulo();
}
function atualizarBadges(pulsar) {
  for (const el of document.querySelectorAll("[data-badge]")) {
    const n = E.badges[el.dataset.badge] || 0;
    el.hidden = n <= 0;
    el.textContent = n > 99 ? "99+" : n > 0 ? String(n) : "";
    if (pulsar && el.dataset.badge === pulsar) { el.classList.remove("pulsa"); void el.offsetWidth; el.classList.add("pulsa"); }
  }
  for (const el of document.querySelectorAll("[data-ponto]")) el.hidden = !(E.badges[el.dataset.ponto] > 0);
}

/** Não lidas de Conversas no menu e no título, mesmo fora da tela de Conversas (no máximo a cada 10 s). */
async function atualizarNaoLidas() {
  const cli = E.cliente;
  if (!cli || !cli.modulos.includes("conversas") || !pronto("conversas")) return;
  if (E.atual && E.atual.arquivo === "conversas.js") return; // a própria tela chama ctx.badge
  const agora = Date.now();
  if (agora - E.naoLidasEm < 10000) return;
  E.naoLidasEm = agora;
  try {
    const r = await E.api.rpcC("nx_cv_listar", { p_filtro: { aba: "abertas" }, p_limite: 1 });
    const n = r && r.contagens ? r.contagens.nao_lidas : null;
    if (typeof n === "number") definirBadge("conversas", n);
  } catch { E.naoLidasEm = agora + 50000; }
}

/** Não lidas do sino (vem do pulso: nx_pulso.notif). Chegou notificação nova → o sino pulsa e a lista aberta relê. */
function atualizarSino(n) {
  const antes = Number(E.notif) || 0;
  E.notif = Math.max(0, Number(n) || 0);
  atualizarSinoUI();
  if (E.notif > antes) {
    const b = $("sino-n");
    if (b) { b.classList.remove("pulsa"); void b.offsetWidth; b.classList.add("pulsa"); }
  }
  if (E.sinoAberto && E.notif !== antes) E.sinoAberto.recarregar();
}

iniciar();
