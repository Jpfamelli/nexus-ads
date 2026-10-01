/* ============================================================
   ÓRBITA — app.js (shell) · frente F3 · ESPEC §7.1–7.2, T2
   Carrega tudo por import() com ?v=<VERSAO> (nenhum import
   estático: cada arquivo tem UM endereço); resolve a marca antes
   do login; sessão leve (nx_app_sessao); empresa ativa; menu por
   módulos × papel × prontos.js; faixas; pulso; roteador por #hash
   e o ctx que os módulos recebem.
   ============================================================ */

const VERSAO = new URL(import.meta.url).searchParams.get("v") || "dev";
/** Quantas vezes o import() de cada arquivo já falhou. O navegador GUARDA a falha de um import() para aquela URL (mesmo com a rede de volta,
    a mesma URL continua falhando até recarregar a página): a nova tentativa usa a mesma versão com &r=<n> e carrega de verdade. */
const importFalhou = new Map();
const arq = async nome => {
  const n = importFalhou.get(nome) || 0;
  const r = n ? "&r=" + n : "";
  try { return await import(`./${nome}?v=${encodeURIComponent(VERSAO)}${r}`); }
  catch (e) { importFalhou.set(nome, n + 1); throw e; }
};
/** O mesmo para o dados.js, que mora uma pasta acima (web/dados.js, compartilhado com o painel clássico). */
const arqRaiz = async nome => {
  const k = "../" + nome, n = importFalhou.get(k) || 0;
  const r = n ? "&r=" + n : "";
  try { return await import(`../${nome}?v=${encodeURIComponent(VERSAO)}${r}`); }
  catch (e) { importFalhou.set(k, n + 1); throw e; }
};

const $ = id => document.getElementById(id);
const LS = {
  ler(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  lerTxt(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* modo privado */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* ok */ } },
};
const CHAVE_CLIENTE = "nx-app-cliente";
const CHAVE_ESQUEMA = "nx-app-esquema";
const CHAVE_CONTA = "nx-app-conta";      // id da conta da última sessão lida (a chave do cache da sessão precisa dele antes de ler a rede)
const PRONTOS_PADRAO = { MODULOS_PRONTOS: [], CONFIG_PRONTAS: ["perfil"] };
const ROTAS_PUBLICAS = new Set(["login", "convite", "senha"]);

/** Os módulos que o boot carrega juntos. Cada um tem um <link rel="modulepreload"> no index.html com o MESMO ?v= (testes/shell.teste.mjs confere). */
const MODULOS_BASE = ["api.js", "ui.js", "tema.js", "vocab.js", "rotas.js", "pulso.js", "rede.js", "rascunho.js", "cache.js", "comandos.js"];

const E = {
  M: {},                 // módulos base: dados, api, ui, tema, vocab, rotas, pulso
  api: null, ui: null,
  prontos: PRONTOS_PADRAO,
  marcaPublica: null,    // resposta de nx_marca_publica
  sessao: null,          // resposta de nx_app_sessao
  sessaoPromessa: null,  // a leitura de nx_app_sessao que o boot dispara em paralelo com a marca (aoMudarRota consome)
  sessaoGuardada: null,  // M16: {dados, em} da última sessão guardada no aparelho (o shell pinta com ela e revalida pela rede)
  cliente: null,         // empresa ativa (item de sessao.clientes + tema)
  pulso: null,
  atual: null,           // { arquivo, mod, chave }
  assinaturas: new Set(),
  naoAtualizar: new Set(), // funções de módulos com trabalho pendente: enquanto alguma devolver true, a atualização automática espera
  editouEm: 0,             // quando a pessoa mexeu por último num campo desta tela (0 = nada desde que a rota abriu): segura a atualização automática
  hashEdicao: null,        // o endereço a que o editouEm se refere (mudou de tela → zera)
  pwa: null,
  regioes: null,           // M22: atalhos «Ir para…» registrados pelo módulo ativo (ctx.atalhosDeRegiao); null = valem os padrões da rota
  instalarEvento: null,    // M13: o beforeinstallprompt guardado (o botão «Instalar o app» usa)
  pwaMod: null,            // M13: o módulo pwa.js depois de carregado
  comandos: null,          // M18: registro de comandos das telas (comandos.js); a paleta e a folha «?» leem dele
  paleta: { mod: null, janela: null },   // M18: o módulo paleta.js (sob demanda) e a janela aberta
  bootTentar: null,        // o que o botão da tela de abertura faz agora (pular a espera do laço, refazer a etapa…)
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
/** acoes: true (as duas) ou {tentar, sair}. «Sair» só aparece quando o problema é da conta/sessão: erro de rede nunca apaga o token. */
function bootMsg(texto, acoes = null) {
  const b = $("boot");
  if (!b) return;
  b.hidden = false;
  $("boot-msg").textContent = texto;
  const a = acoes === true ? { tentar: true, sair: true } : (acoes || {});
  $("boot-acoes").hidden = !(a.tentar || a.sair);
  $("boot-tentar").hidden = !a.tentar;
  $("boot-sair").hidden = !a.sair;
}

/** Espera visível do laço de abertura: «<prefixo> Tentando de novo em N s…», interrompida por «Tentar agora» ou pela volta da internet. */
function esperarAbertura(segundos, prefixo) {
  return new Promise(resolve => {
    let restam = segundos, timer = null;
    const fim = () => {
      clearInterval(timer);
      removeEventListener("online", fim); removeEventListener("orbita:online", fim);
      E.bootTentar = null;
      bootMsg("Tentando de novo…", { tentar: true });    // enquanto a nova tentativa está em voo
      resolve();
    };
    const desenhar = () => { $("boot-tentar").textContent = "Tentar agora"; bootMsg(`${prefixo} Tentando de novo em ${Math.max(restam, 0)} s…`, { tentar: true }); };
    desenhar();
    timer = setInterval(() => { restam -= 1; if (restam <= 0) fim(); else desenhar(); }, 1000);
    E.bootTentar = fim;
    addEventListener("online", fim); addEventListener("orbita:online", fim);
  });
}
/** Mesmas esperas do rede.js (ESPERAS_ABERTURA); aqui ficam por perto porque a etapa dos módulos roda ANTES de o rede.js carregar. */
const ESPERAS_ABERTURA = [2000, 4000, 8000, 16000];
const MAX_ABERTURA = 8;
function fraseCurta(e) {
  const c = e && (e.codigo || "");
  if (c === "sem_conexao") return "Sem conexão.";
  if (/^(http_50[234]|servico_indisponivel)$/.test(c)) return "Servidor indisponível.";
  if (c === "tempo_rede") return "O servidor demorou a responder.";
  return "Não deu certo agora.";
}
function bootEsconder() { const b = $("boot"); if (b) b.hidden = true; }

/* ============================================================
   INÍCIO
   ============================================================ */
async function iniciar() {
  E.faviconPadrao = $("favicon") && $("favicon").getAttribute("href");
  $("boot-tentar").addEventListener("click", () => { if (E.bootTentar) E.bootTentar(); else location.reload(); });
  $("boot-sair").addEventListener("click", async () => {
    try { E.M.dados && E.M.dados.apagarToken(); } catch { /* ok */ }
    // este botão também é um logout: rascunhos, respostas guardadas, Recentes e a fila de mensagens da conta não ficam no aparelho
    try { if (E.rascunhos) E.rascunhos.apagarTudo(); apagarFilaDeSaida(); await limparComPrazo(); } catch { /* ok */ }
    location.hash = "#/login"; location.reload();
  });
  // a pessoa mexeu num formulário: a atualização automática não recarrega por cima (ocupadoParaAtualizar)
  document.addEventListener("input", marcarEdicao, true);
  document.addEventListener("change", marcarEdicao, true);
  // M11: tudo o que o boot precisa começa AGORA, junto (o index.html já pré-carrega estes arquivos com <link rel="modulepreload">)
  const prontosP = arq("prontos.js");
  prontosP.catch(() => { /* tratado abaixo; aqui só evita o aviso de promessa sem dono */ });
  try {
    // sem internet ou com o servidor ocupado a abertura NÃO desiste: repete sozinha (2, 4, 8, 16 s…) mostrando quanto falta
    let carregados = null;
    for (let i = 0; !carregados; i++) {
      try { carregados = await Promise.all([arqRaiz("dados.js"), ...MODULOS_BASE.map(arq)]); }
      catch (e) {
        console.error("abertura: módulos", e);
        if (i + 1 >= MAX_ABERTURA) throw e;
        await esperarAbertura(ESPERAS_ABERTURA[Math.min(i, ESPERAS_ABERTURA.length - 1)] / 1000, navigator.onLine === false ? "Sem conexão." : "Não consegui abrir o sistema.");
      }
    }
    const [dados, api, ui, tema, vocab, rotas, pulso, rede, rascunho, cache, comandos] = carregados;
    E.M = { dados, api, ui, tema, vocab, rotas, pulso, rede, rascunho, cache, comandos };
    E.comandos = comandos.criarComandos();      // M18: o que as telas oferecem à paleta (ctx.comandos.registrar)
    E.workspace = rotas.produtoDe(location.search);
    document.documentElement.dataset.produto = E.workspace || "orbita";
    document.title = E.workspace ? rotas.PRODUTOS[E.workspace].titulo : "Órbita · Nexus";
    const manifesto = $("manifest");
    if (manifesto) manifesto.setAttribute("href", E.workspace ? rotas.manifestoProduto(E.workspace) : "manifest.webmanifest");
  } catch (e) {
    console.error(e);
    $("boot-tentar").textContent = "Tentar de novo";
    bootMsg("Não foi possível abrir o sistema. Confira a internet e tente de novo.", { tentar: true });
    return;
  }
  try {
    const p = await prontosP;
    E.prontos = {
      MODULOS_PRONTOS: Array.isArray(p.MODULOS_PRONTOS) ? p.MODULOS_PRONTOS : [],
      CONFIG_PRONTAS: Array.isArray(p.CONFIG_PRONTAS) ? p.CONFIG_PRONTAS : ["perfil"],
    };
  } catch { E.prontos = PRONTOS_PADRAO; }

  const { dados, api, ui } = E.M;
  E.ui = ui;
  ui.configurar({ mensagemErro: api.mensagemErro });
  // M16: última resposta de leituras seguras no aparelho (IndexedDB, 12 h, lista branca): a tela abre com o que havia e revalida
  E.cache = E.M.cache.criarCache();
  // M14: estado de conexão (online · lento · offline · servidor fora) alimentado por cada chamada do api.js
  E.rede = E.M.rede.criarRede({ ping: pingDoSite, sondar: sondarServidor });
  E.api = api.criarApi({
    url: dados.SUPA_URL, chave: dados.CHAVE_PUBLICA,
    token: () => dados.lerToken(),
    cliente: () => (E.cliente ? E.cliente.id : null),
    aoSessaoInvalida: () => sessaoCaiu(),
    rede: E.rede, contexto: true, retentar: true,
    cache: E.cache, conta: () => (E.sessao ? E.sessao.conta.id : LS.lerTxt(CHAVE_CONTA)), aoCache: ev => aoCacheEvento(ev),
  });
  // M17: rascunhos por conta + empresa (localStorage, 7 dias, ~200 KB, nunca senha); somem no logout
  E.rascunhos = E.M.rascunho.criarRascunhos({ conta: () => (E.sessao ? E.sessao.conta.id : null), cliente: () => (E.cliente ? E.cliente.id : null) });
  E.pulso = E.M.pulso.criarPulso({
    ler: () => (E.cliente ? E.api.rpcC("nx_pulso") : Promise.resolve(null)),
    aoNotif: n => atualizarSino(n),
  });
  E.pulso.assinar(() => { atualizarNaoLidas(); });
  E.rede.aoVoltar(() => { if (E.pulso) E.pulso.agora(); });   // reconectou: o pulso lê agora (e as telas pelo orbita:online / ctx.rede.aoVoltar)
  montarIndicadoresRede();
  montarSeloCache();

  if (LS.lerTxt("nx-app-menu") === "1") document.documentElement.classList.add("menu-recolhido");
  const dev = new URLSearchParams(location.search).get("dev");
  if (dev === "1") try { sessionStorage.setItem("nx-app-dev", "1"); } catch { /* ok */ }
  if (dev === "0") try { sessionStorage.removeItem("nx-app-dev"); } catch { /* ok */ }

  // M11: a sessão (nx_app_sessao, a chamada mais pesada) sai junto com a marca pública, não depois dela.
  // Em rota pública que continua pública com token (convite, nova senha) ninguém consome essa leitura, e quem entrar por ali pode ser OUTRA conta:
  // nem a sessão antecipada nem a guardada são preparadas (o login com token vai direto para o app, então segue antecipando)
  const rotaInicial = E.M.rotas.rotear(location.hash).modulo;
  const ficaPublica = ROTAS_PUBLICAS.has(rotaInicial) && rotaInicial !== "login";
  if (dados.lerToken() && !ficaPublica) {
    E.sessaoPromessa = lerSessao();
    E.sessaoPromessa.catch(() => { /* quem consome (aoMudarRota) trata o erro */ });
    // M16: com a sessão guardada no aparelho o shell pinta na hora e a rede só confirma depois
    const conta = LS.lerTxt(CHAVE_CONTA);
    if (conta) {
      try {
        const g = await E.cache.ler(E.cache.chaveDe("nx_app_sessao", {}, { conta }));
        if (g && g.dados && g.dados.conta && g.dados.conta.id === conta && !g.dados.conta.trocar_senha && Array.isArray(g.dados.clientes)) E.sessaoGuardada = g;
      } catch { /* sem cache: abre pela rede */ }
    }
  }
  if (E.sessaoGuardada) carregarMarcaPublica({ pintar: false }); else await carregarMarcaPublica();
  addEventListener("hashchange", () => aoMudarRota(true));
  // «Pular para o conteúdo»: o href="#vista" mudaria o hash e o roteador mostraria «Página não encontrada»; aqui só o foco se move
  const pular = document.querySelector(".pular");
  if (pular) pular.addEventListener("click", ev => {
    ev.preventDefault();
    const alvo = $("app") && !$("app").hidden ? $("vista") : $("publico");
    if (!alvo) return;
    if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
    try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
    scrollTo({ top: 0 });
  });
  ui.atalho("mod+k", ev => {
    if (!E.sessao || $("app").hidden) return;
    ev.preventDefault();
    abrirPaleta();
  });
  // «?» fora de campo: folha de atalhos (a tela que registra o próprio «?», como Conversas, fica com ele; janela aberta também)
  ui.atalho("?", ev => {
    if (!E.sessao || $("app").hidden || E.comandos.temAtalho("?") || document.querySelector("dialog[open]")) return;
    ev.preventDefault();
    abrirAtalhos();
  });
  montarEsqueletoShell();
  observarRegioes();
  await aoMudarRota(false);
  iniciarPwa();
}

/* ============================================================
   DADOS GUARDADOS (M16): selo único «Mostrando dados de 14:02 · atualizando…» em #faixas-sistema
   ============================================================ */
const selo = { servidos: 0, em: null, falhou: false, el: null };
let renderSelo = () => {};
let atualizarFaixaRede = () => {};

/** Eventos do api.js: {fase:"servido", em} quando uma tela foi pintada do cache; {fase:"fim", ok, em} quando a rede respondeu (ou falhou). */
function aoCacheEvento(ev) {
  if (!ev) return;
  if (ev.fase === "servido") { selo.servidos += 1; selo.em = selo.em == null ? ev.em : Math.min(selo.em, ev.em); }
  else if (ev.fase === "fim") {
    selo.servidos = Math.max(0, selo.servidos - 1);
    if (ev.ok) { if (!selo.servidos) selo.falhou = false; }
    else { selo.falhou = true; if (ev.em != null) selo.em = selo.em == null ? ev.em : Math.min(selo.em, ev.em); }
  }
  renderSelo();
  atualizarFaixaRede();
}
function reiniciarSelo() { selo.servidos = 0; selo.em = null; selo.falhou = false; renderSelo(); }

function montarSeloCache() {
  const { ui } = E;
  const alvo = $("faixas-sistema");
  renderSelo = () => {
    const falhando = E.rede && (E.rede.estado === "offline" || E.rede.estado === "servidor_fora");
    const mostrar = selo.em != null && (selo.servidos > 0 || selo.falhou) && !falhando;   // offline/servidor fora: a faixa de conexão já fala
    if (!mostrar) { if (selo.el) { selo.el.remove(); selo.el = null; } return; }
    const hora = ui.horaBR(new Date(selo.em).toISOString());
    const texto = selo.servidos > 0 ? `Mostrando dados de ${hora} · atualizando…` : `Mostrando dados de ${hora} · não foi possível atualizar`;
    if (!selo.el) {
      selo.el = ui.h("div", { class: "faixa faixa-cache" }, ui.icone("relogio"), ui.h("p", null));
      alvo.appendChild(selo.el);
    }
    const p = selo.el.querySelector("p");
    if (p.textContent !== texto) p.textContent = texto;
  };
  E.rede.assinar(() => renderSelo());
  // a conexão voltou e a tela está com dado velho: relê a tela (o cartão de erro já refaz sozinho; aqui é a tela pintada do cache)
  E.rede.aoVoltar(() => { if (selo.falhou) aoMudarRota(false); });
}

/* ============================================================
   CONEXÃO (M14): faixa fina, ponto junto ao sino e releitura quando a internet volta
   ============================================================ */
const ROTULO_REDE = { offline: "Sem conexão", servidor_fora: "Servidor indisponível", lento: "Conexão lenta" };

/** A página do próprio site responde? (distingue "sem internet" de "servidor fora"). Qualquer resposta HTTP serve. */
async function pingDoSite() {
  try {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 4000);
    try { await fetch(new URL(`versao.json?t=${Date.now()}`, location.href).href, { cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) }); return true; }
    finally { clearTimeout(t); }
  } catch { return false; }
}

/** Uma chamada real e barata ao servidor; o api.js reporta o resultado ao rede.js. */
async function sondarServidor() {
  if (E.cliente) return E.api.rpcC("nx_pulso");
  if (E.sessao) return E.api.rpc("nx_app_sessao");
  return E.api.publica("nx_marca_publica", { p_host: location.hostname, p_org: orgDaUrl() });
}

function atualizarPontoRede() {
  const p = $("rede-ponto");
  if (!p || !E.rede) return;
  const e = E.rede.estado;
  p.hidden = e === "online";
  p.dataset.estado = e;
}

/** Monta a faixa em #faixas-sistema (primeira da pilha, antes da de versão) e acompanha o estado. */
function montarIndicadoresRede() {
  const { ui } = E;
  const alvo = $("faixas-sistema");
  let el = null, relogio = null;
  const pararRelogio = () => { if (relogio) { clearInterval(relogio); relogio = null; } };
  const hora = ms => (ms ? ui.horaBR(new Date(ms).toISOString()) : null);
  const segundos = f => (f.proxima ? Math.max(0, Math.ceil((f.proxima - Date.now()) / 1000)) : null);
  function texto(f) {
    if (f.estado === "offline" || f.estado === "servidor_fora") {
      const quando = f.ultimoOk || selo.em;      // aberto sem internet: vale a hora do dado guardado que a tela mostra
      return [ROTULO_REDE[f.estado], hora(quando) ? `dados de ${hora(quando)}` : null].filter(Boolean).join(" · ");
    }
    if (f.estado === "lento") return "Conexão lenta · ainda carregando…";
    return "Reconectado";
  }
  function render(f) {
    atualizarPontoRede();
    atualizarSinoUI();
    const mostrar = f.estado !== "online" || f.reconectado;
    if (!mostrar) { if (el) { el.remove(); el = null; } pararRelogio(); return; }
    const chave = f.estado !== "online" ? f.estado : "ok";
    const msg = texto(f);
    if (!el) {
      const espera = ui.h("span", { class: "rede-espera", "aria-hidden": "true" });
      const bt = ui.h("button", { type: "button", class: "bt bt-sec" }, "Tentar agora");
      bt.addEventListener("click", () => { E.rede.tentarAgora(); });
      el = ui.h("div", { class: "faixa faixa-rede" }, ui.icone("info"), ui.h("p", { class: "rede-msg", "aria-live": "polite" }), espera, bt);
      alvo.insertBefore(el, alvo.firstChild);
    }
    const p = el.querySelector(".rede-msg");
    const mudou = el.dataset.estado !== chave || p.textContent !== msg;
    el.dataset.estado = chave;
    p.textContent = msg;
    const espera = el.querySelector(".rede-espera"), bt = el.querySelector("button");
    const falhando = f.estado === "offline" || f.estado === "servidor_fora";
    bt.hidden = !falhando;
    const atualizarEspera = () => {
      const s = segundos(E.rede.foto());
      espera.textContent = falhando && s != null ? `tentando em ${s} s` : "";
    };
    atualizarEspera();
    pararRelogio();
    if (falhando) relogio = setInterval(atualizarEspera, 1000);
    if (mudou) ui.anunciar(msg);
  }
  E.rede.assinar(render);
  render(E.rede.foto());
  atualizarFaixaRede = () => render(E.rede.foto());
}

/* ============================================================
   INSTALÁVEL COM A MARCA (M13): manifesto dinâmico em blob:, apple-touch-icon e «Instalar o app»
   ============================================================ */
const manifestoEstado = { blob: null, original: null, seq: 0 };
let manifestoTimer = null;
function agendarManifesto() {
  clearTimeout(manifestoTimer);
  manifestoTimer = setTimeout(atualizarManifestoApp, 350);   // várias pinturas seguidas (marca, tema da empresa) viram uma montagem só
}
async function atualizarManifestoApp() {
  const P = E.pwaMod;
  if (!P || !E.marca) return;
  const seq = ++manifestoEstado.seq;
  try {
    const base = new URL("./", location.href).href;
    const nome = E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace });
    const fundo = getComputedStyle(document.documentElement).getPropertyValue("--c-fundo").trim() || E.M.tema.FUNDOS_ESQUEMA.escuro;
    const m = E.marca;
    let raster = null;
    try { raster = await P.rasterizarIcones({ origem: m.logo_cliente || m.favicon || m.logo || null, fundo }); }
    catch (e) { raster = null; console.warn("ícones da marca indisponíveis; ficam os empacotados", e && e.message); }   // sem logo próprio ou imagem sem CORS
    if (seq !== manifestoEstado.seq) return;
    const manifesto = P.construirManifesto({ nome, base, workspace: E.workspace, rota: E.workspace ? E.M.rotas.produtoInicial(E.workspace) : null, fundo,
      icones: raster ? P.iconesDeRaster(raster) : P.iconesPadrao(base) });
    if (!P.aplicarManifesto({ manifesto, estado: manifestoEstado })) throw new Error("manifesto_nao_aplicado");
    P.atualizarMetasApple({ titulo: nome.short_name, icone: raster ? raster.apple180 : null, escuro: document.documentElement.dataset.esquema !== "claro" });
  } catch (e) {
    console.warn("manifesto dinâmico indisponível; fica o estático", e && e.message);
    P.voltarAoEstatico({ estado: manifestoEstado });
  }
}

/** Como instalar neste aparelho: "evento" (botão nativo), "ios" (passo a passo) ou null (já instalado ou sem suporte). */
function modoInstalacao() { return E.pwaMod ? E.pwaMod.modoDeInstalacao({ evento: E.instalarEvento }) : null; }
async function instalarApp() {
  const { ui } = E;
  const modo = modoInstalacao();
  if (modo === "evento") {
    const ev = E.instalarEvento;
    E.instalarEvento = null;                       // o evento só vale uma vez
    try { await ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === "accepted") ui.toast("App instalado. Procure o ícone na tela do aparelho.", { tipo: "ok" }); }
    catch { /* a pessoa fechou */ }
    return;
  }
  if (modo === "ios") {
    ui.modal({ titulo: "Instalar no iPhone ou iPad", largura: "p", protegerTexto: false,
      corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", null, "O iPhone instala pelo menu do Safari:"), ui.h("ol", { class: "instalar-passos" }, E.pwaMod.PASSOS_IOS.map(t => ui.h("li", null, t)))),
      acoes: [{ rotulo: "Entendi", tipo: "primario" }] });
  }
}

/* ============================================================
   PWA (M12): service worker, versão nova sem aba quebrada — depois do boot, nada disto atrasa a primeira pintura
   ============================================================ */
/** TODOS os .js e .css de web/app que o app carrega (menos o sw.js): as telas e também os pedaços que elas importam por conta própria (cv-*, crm-*,
    auto-*, gráficos, *-config). Lista fixa, conferida com a pasta por testes/shell.teste.mjs: arquivo novo que não entrar aqui quebra o teste. */
const ARQUIVOS_DO_APP = [
  "antes.js", "app.js", "api.js", "ui.js", "tema.js", "vocab.js", "rotas.js", "pulso.js", "rede.js", "rascunho.js", "cache.js", "comandos.js",
  "prontos.js", "pwa.js", "paleta.js", "login.js", "inicio.js", "config.js", "admin.js",
  "conversas.js", "cv-logica.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js", "cv-config.js",
  "crm.js", "crm-logica.js", "crm-kanban.js", "crm-listas.js", "crm-negocio.js", "crm-tarefas.js", "crm-importar.js", "crm-config.js",
  "agenda.js", "agenda-config.js", "rastreio-config.js",
  "anuncios.js", "ads-config.js", "relatorios.js", "rel-logica.js", "graficos.js",
  "automacoes.js", "auto-logica.js", "auto-catalogo.js", "auto-pecas.js", "auto-editor.js",
  "app.css", "shell.css", "conversas.css", "crm.css", "agenda.css", "relatorios.css", "automacoes.css",
];
/** O que o app importa de fora da pasta (web/): os dados de conexão e o núcleo de cálculo que Anúncios divide com o painel clássico. */
const ARQUIVOS_DA_RAIZ = ["dados.js", "nucleo.js"];
const urlArq = nome => new URL(`./${nome}?v=${encodeURIComponent(VERSAO)}`, import.meta.url).href;
const urlArqRaiz = nome => new URL(`../${nome}?v=${encodeURIComponent(VERSAO)}`, import.meta.url).href;

/** O que o service worker deve ter guardado mesmo que a tela ainda não tenha sido aberta: o app inteiro desta versão. Sem isso, depois de uma
    publicação, a aba antiga abria uma tela pela primeira vez e recebia os pedaços NOVOS no endereço antigo (código misturado); offline, a tela falhava. */
function urlsPrecache() {
  return [...ARQUIVOS_DO_APP.map(urlArq), ...ARQUIVOS_DA_RAIZ.map(urlArqRaiz)];
}

/** import() que falhou por arquivo que não existe mais naquela URL (a versão mudou por baixo da aba). */
function ehFalhaDeImport(e) { return /dynamically imported module|importing a module script|module script failed|error loading dynamically/i.test(String((e && e.message) || "")); }

/** Por quanto tempo um campo mexido segura a atualização automática (a faixa «Atualizar» continua lá para quem quiser aplicar na hora). */
const EDICAO_RECENTE_MS = 30 * 60 * 1000;

/** A pessoa digitou ou escolheu algo num campo desta tela. Busca não conta: não é trabalho que se perde. */
function marcarEdicao(ev) {
  const alvo = ev && ev.target;
  if (!alvo || alvo.type === "search") return;
  E.editouEm = Date.now();
}

/** Trabalho que uma atualização automática não pode interromper (o módulo ativo registra por ctx.naoAtualizar). */
function ocupadoParaAtualizar() {
  if (E.rascunhos && E.rascunhos.pendentes() > 0) return true;
  // formulário mexido (qualquer tela, mesmo as que não registram nada): recarregar apagaria o que foi digitado. Com a aba em segundo plano a pessoa
  // pode ter ido buscar um texto em outra aba, então qualquer edição desde que a tela abriu segura; com a aba à vista, vale por 30 minutos
  if (E.editouEm && (document.hidden || Date.now() - E.editouEm < EDICAO_RECENTE_MS)) return true;
  for (const f of E.naoAtualizar) { try { if (f()) return true; } catch { /* ignora */ } }
  return false;
}

function iniciarPwa() {
  setTimeout(async () => {
    try {
      const pwa = await arq("pwa.js");
      E.pwaMod = pwa;
      E.pwa = pwa.iniciar({ versao: VERSAO, ui: E.ui, alvo: $("faixas-sistema"), produto: () => E.produto || "Órbita", ocupado: ocupadoParaAtualizar, urlsPrecache });
      agendarManifesto();
    } catch (e) { console.warn("pwa indisponível", e && e.message); }
    // M18: a paleta abre sem esperar a rede na primeira vez que alguém aperta Ctrl/⌘+K
    try { if (!E.paleta.mod) E.paleta.mod = await arq("paleta.js"); } catch { /* abre sob demanda */ }
  }, 0);
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
  let mudou = false;
  try {
    const r = await E.api.publica("nx_marca_publica", { p_host: location.hostname, p_org: orgDaUrl() });
    if (r && r.marca) { mudou = !E.marcaPublica || tema.hashCurto(r.marca) !== tema.hashCurto(E.marcaPublica.marca); E.marcaPublica = r; }
  } catch (e) {
    console.warn("marca pública indisponível", e && e.codigo);
  }
  const m = tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {});
  if (pintar) pintarMarca(m, { guardar: true });
  else {
    guardarMarcaPublica(m);
    // boot pelo cache (M16): a sessão já pintou o shell e a marca pública (logo, nome) chegou depois: repinta e refaz o manifesto
    if (E.sessao && mudou) aplicarMarcaCliente().catch(() => { /* a próxima pintura corrige */ });
  }
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
  agendarManifesto();
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
  const p = $("lat-produto");
  // repintura (troca de empresa/tema): volta ao estado sem logo largo até a imagem nova carregar
  if (p) p.classList.remove("sr-only");
  for (const id of ["lat-logo", "topo-marca"]) {
    const alvo = $(id);
    if (!alvo) continue;
    ui.limpar(alvo);
    alvo.classList.remove("largo");
    if (logo) {
      const img = ui.h("img", { src: logo, alt: "" });
      img.addEventListener("load", () => {
        // imagem de uma pintura anterior (já trocada) não mexe em nada
        if (!img.isConnected || !(img.naturalWidth > img.naturalHeight * 1.6)) return;
        img.classList.add("largo");
        alvo.classList.add("largo");
        // logo largo (já traz o nome escrito): o nome do produto sai da vista e fica só para
        // leitor de tela — como na entrada (login.js); senão a imagem cobre o nome no menu
        if (id === "lat-logo" && p) p.classList.add("sr-only");
      });
      alvo.appendChild(img);
    } else {
      alvo.appendChild(ui.h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, ui.h("use", { href: "#marca-orbita" })));
    }
  }
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
let loginPendente = null;

/** nx_sair, queda de sessão, login e troca de conta: nenhuma resposta guardada fica no aparelho (privacidade).
    Devolve a promessa da limpeza do IndexedDB (quem vai recarregar a página espera por ela: limparComPrazo). */
function limparDadosDoAparelho() {
  const feito = E.cache ? E.cache.limpar().catch(() => {}) : Promise.resolve();
  // M18: os «Recentes» da paleta têm nomes de pessoas: saem com a sessão
  try {
    const pref = E.M.comandos ? E.M.comandos.PREFIXO_RECENTES : "nx-rec:";
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(pref)) localStorage.removeItem(k); }
  } catch { /* sem armazenamento: nada a apagar */ }
  LS.apagar(CHAVE_CONTA);
  E.sessaoGuardada = null;
  return feito;
}
/** Limpa o aparelho e espera a limpeza assentar (no máximo 0,8 s): um location.reload() logo em seguida cortaria a transação do IndexedDB. */
function limparComPrazo() {
  return Promise.race([limparDadosDoAparelho(), new Promise(r => setTimeout(r, 800))]);
}
async function limparERecarregar() {
  await limparComPrazo(); location.reload();
}

/** A fila de saída das Conversas (IndexedDB «orbita-fila», o nome está em conversas.js) guarda o texto das mensagens que ainda não saíram: no Sair
    e na troca de conta ela sai do aparelho, senão a mensagem seria enviada dias depois, quando a conta entrasse de novo. */
function apagarFilaDeSaida() {
  try { if (typeof indexedDB !== "undefined" && indexedDB && typeof indexedDB.deleteDatabase === "function") indexedDB.deleteDatabase("orbita-fila"); }
  catch { /* sem IndexedDB (janela anônima): não há fila guardada */ }
}

/** A fila de saída e os rascunhos vivem no aparelho: sem este pedido o navegador pode despejá-los quando falta espaço (o Safari, depois de dias sem
    uso). Uma vez por aparelho, depois do login (o Firefox pergunta à pessoa; pedir a cada abertura seria um incômodo). */
function pedirArmazenamentoPersistente() {
  try {
    if (LS.lerTxt("nx-app-persistir") || !navigator.storage || typeof navigator.storage.persist !== "function") return;
    LS.gravar("nx-app-persistir", "1");
    Promise.resolve(navigator.storage.persist()).catch(() => {});
  } catch { /* sem suporte: fica como está */ }
}

/**
 * Chamado pelo api.js quando o servidor diz sessao_invalida. Devolve (Promise de) true quando a pessoa entrou de novo: as LEITURAS que
 * falharam esperam por isso e se repetem com o token novo. A tela NÃO é desmontada e nada do que foi digitado se perde: abre por cima
 * uma janela «Sua sessão expirou» com o e-mail preenchido. Na abertura (ainda sem sessão) não há tela a preservar: volta ao login como antes.
 */
function sessaoCaiu() {
  if (!E.sessao) { sessaoCaiuTotal(); return false; }
  if (!loginPendente) loginPendente = pedirLoginNaTela().finally(() => { loginPendente = null; });
  return loginPendente;
}

async function pedirLoginNaTela() {
  const { ui } = E;
  const antes = E.sessao.conta;
  if (E.rascunhos) E.rascunhos.salvarTudo();
  for (;;) {
    const form = ui.h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: antes.email || "", autocomplete: "username", obrigatorio: true, inputmode: "email" }),
      ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "current-password", obrigatorio: true }));
    const r = await ui.modal({
      titulo: "Sua sessão expirou", largura: "p", fecharFora: false, protegerTexto: false,
      descricao: "Entre para continuar de onde parou. O que você digitou fica guardado.",
      corpo: form,
      aoAbrir: a => { const s = a.el.querySelector("input[name=senha]"); if (s && !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)) s.focus(); },
      acoes: [
        { rotulo: "Sair", tipo: "neutro", valor: "sair" },
        { rotulo: "Entrar", tipo: "primario", fn: async () => {
          const d = ui.lerForm(form);
          if (!d.email || !d.senha) throw Object.assign(new Error("credenciais_invalidas"), { codigo: "credenciais_invalidas" });
          const tokenAntigo = E.M.dados.lerToken();
          const r2 = await E.api.publica("nx_entrar", { p_email: d.email, p_senha: d.senha });
          if (!r2 || !r2.token) throw Object.assign(new Error("credenciais_invalidas"), { codigo: "credenciais_invalidas" });
          E.M.dados.guardarToken(r2.token);
          let nova;
          try { nova = await lerSessao(); } catch (e) { E.M.dados.guardarToken(tokenAntigo); throw e; }
          if (nova.conta.id !== antes.id) return "outra";       // entrou com OUTRA conta: nada do que era da anterior pode ficar
          return "ok";
        } },
      ],
    });
    if (r === "ok") { ui.toast("Sessão renovada. Pode continuar.", { tipo: "ok" }); return true; }
    if (r === "outra") {
      if (E.rascunhos) E.rascunhos.apagarTudo();
      limparDadosDoAparelho();
      apagarFilaDeSaida();
      try { sessionStorage.removeItem("nx-app-destino"); } catch { /* ok */ }
      location.hash = "#/";
      location.reload();
      return false;
    }
    if (r === "sair") { await sair(); return false; }
    // Esc ou Voltar: a janela é obrigatória, pergunta de novo
  }
}

/** Sem sessão na memória (abertura) ou sem como continuar: apaga o token, limpa a tela e volta ao login. */
function sessaoCaiuTotal() {
  if (!E.sessao && !E.M.dados.lerToken()) return;
  limparDadosDoAparelho();
  E.M.dados.apagarToken();
  E.sessao = null; E.cliente = null;
  atualizarSeloDoApp();
  if (E.pulso) E.pulso.parar();
  desmontarAtual();
  if (!_avisouSessao) { _avisouSessao = true; E.ui.toast("Sua sessão expirou. Entre de novo.", { tipo: "info" }); setTimeout(() => { _avisouSessao = false; }, 4000); }
  const r = E.M.rotas.rotear(location.hash);
  if (!ROTAS_PUBLICAS.has(r.modulo)) {
    try { sessionStorage.setItem("nx-app-destino", location.hash); } catch { /* ok */ }
    navegar("#/login", { substituir: true });
  }
}

/** Só a chamada (nx_app_sessao) e a normalização: não mexe em E, pode rodar em paralelo com a marca pública. */
async function lerSessao() {
  const token = E.M.dados.lerToken();
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
  // M16: a sessão já normalizada fica no aparelho (a próxima abertura pinta menu, empresa e marca sem esperar a rede).
  // Só se o token ainda é o desta leitura: um login ou um Sair no meio do caminho não deixa a sessão da conta anterior para a próxima abertura
  if (E.M.dados.lerToken() === token) {
    LS.gravar(CHAVE_CONTA, s.conta.id);
    E.cache.gravar(E.cache.chaveDe("nx_app_sessao", {}, { conta: s.conta.id }), "nx_app_sessao", s).catch(() => {});
  }
  return s;
}

/** O que a tela montada recebeu sobre o acesso da pessoa (conta, empresa ativa, papel, módulos, situação): se mudar, a tela precisa nascer de novo. */
function fotoDoAcesso(sessao, cli) {
  const c = sessao && sessao.conta;
  return JSON.stringify([c ? [c.papel, !!c.super, !!c.trocar_senha] : null,
    cli ? [cli.id, cli.papel, [...(cli.modulos || [])].sort(), cli.status, cli.teste_ate || null, cli.plano || null, cli.vertical || null] : null]);
}

/** M16: depois de pintar com a sessão guardada, a leitura da rede confirma. Mudou algo (empresas, módulos, papel) → repinta o shell; se o que
    mudou é o acesso que a tela aberta usa (empresa ativa, papel, módulos), a tela é montada de novo. Outra conta → limpa o aparelho e recarrega.
    sessao_invalida já abriu a janela de login (api.js → sessaoCaiu); falha de rede só mantém o que está (a faixa de conexão avisa). */
function revalidarSessao() {
  const p = E.sessaoPromessa;
  E.sessaoPromessa = null;
  if (!p) return;
  p.then(async nova => {
    if (!E.sessao) return;
    // a rede respondeu por OUTRA conta (o token mudou por baixo: convite aceito, login em outra aba). O shell foi pintado com a conta que o
    // aparelho guardava: nada dela pode ficar na tela nem no aparelho, e a próxima abertura lê tudo da rede
    if (nova.conta.id !== E.sessao.conta.id) { await limparERecarregar(); return; }
    const mudou = E.M.tema.hashCurto(nova) !== E.M.tema.hashCurto(E.sessao);
    const antes = E.cliente, fotoAntes = fotoDoAcesso(E.sessao, antes);
    E.sessao = nova;
    if (!mudou) return;
    const novo = antes ? nova.clientes.find(c => c.id === antes.id) : null;
    // a empresa ativa saiu da lista (acesso retirado): o que o aparelho guardava dela é apagado e a pessoa cai na empresa que a abertura escolheria
    if (antes && !novo) E.cache.apagarEmpresa({ conta: nova.conta.id, cliente: antes.id }).catch(() => {});
    await escolherCliente(novo ? novo.id : clienteInicial(), { remontar: false });
    // a tela já montada (e pintada do cache) usa o acesso antigo: empresa removida ou papel rebaixado continuariam à vista até a pessoa navegar
    if (fotoDoAcesso(E.sessao, E.cliente) !== fotoAntes) {
      desmontarAtual();
      await aoMudarRota(false);
      E.ui.toast("Seu acesso foi alterado. A tela foi atualizada.", { tipo: "info" });
    }
  }).catch(() => { /* ver acima */ });
}

/** Adota a sessão lida e busca as imagens da org (depende da marca pública já resolvida). */
async function adotarSessao(s, { forcarImagens = false } = {}) {
  E.sessao = s;
  pedirArmazenamentoPersistente();
  await carregarImagensOrg({ forcar: forcarImagens });
  return s;
}

async function carregarSessao({ forcarImagens = false } = {}) {
  return adotarSessao(await lerSessao(), { forcarImagens });
}

async function recarregarSessao() {
  const idAtual = E.cliente && E.cliente.id;
  await carregarSessao();
  const novo = E.sessao.clientes.find(c => c.id === idAtual);
  await escolherCliente(novo ? novo.id : null, { remontar: true });
}

async function sair() {
  try { await E.api.rpc("nx_sair"); } catch { /* sai do mesmo jeito */ }
  if (E.rascunhos) E.rascunhos.apagarTudo();     // logout: nenhum rascunho fica no aparelho
  limparDadosDoAparelho();
  E.M.dados.apagarToken();
  E.sessao = null; E.cliente = null; E.imgOrg = null; E.notif = 0;
  atualizarSeloDoApp();
  if (E.pulso) E.pulso.parar();
  desmontarAtual();
  apagarFilaDeSaida();                           // depois de desmontar: Conversas já largou a fila
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
  // outra tela: o formulário da anterior não existe mais (remontar a MESMA tela, ex.: ao reconectar, não zera)
  if (location.hash !== E.hashEdicao) { E.hashEdicao = location.hash; E.editouEm = 0; }

  if (r.modulo === "login" && dados.lerToken()) return navegar("#/", { substituir: true });
  if (ROTAS_PUBLICAS.has(r.modulo)) return montarPublico(r, seq);
  if (!dados.lerToken()) {
    if (r.modulo) try { sessionStorage.setItem("nx-app-destino", location.hash); } catch { /* ok */ }
    return navegar("#/login", { substituir: true });
  }
  if (!E.sessao) {
    bootMsg("Abrindo…");
    const guardada = E.sessaoGuardada;
    E.sessaoGuardada = null;
    if (guardada) {
      // M16: pinta com a sessão do aparelho; a leitura da rede (já em voo) confirma em segundo plano
      await adotarSessao(guardada.dados);
      revalidarSessao();
    } else try {
      let antecipada = E.sessaoPromessa;             // M11: já saiu junto com a marca pública
      E.sessaoPromessa = null;
      let ultimo = null;
      // M15: só a etapa que falhou é refeita (a sessão), com o laço visível; erro de conta/sessão não repete
      const s = await E.M.rede.repetirAbertura(() => { const p = antecipada || lerSessao(); antecipada = null; return p; }, {
        maximo: 12, aoFalha: e => { ultimo = e; }, esperar: seg => esperarAbertura(seg, fraseCurta(ultimo)),
      });
      await adotarSessao(s);
    } catch (e) {
      if (e && e.codigo === "sessao_invalida") return; // sessaoCaiu já levou ao login
      if (e && e.codigo === "conta_pendente") {
        dados.apagarToken();
        if (E.rascunhos) E.rascunhos.apagarTudo();   // a conta não entra mais: nada dela fica no aparelho
        limparDadosDoAparelho();
        E.ui.toast(E.api.mensagemErro(e), { tipo: "erro" });
        return navegar("#/login", { substituir: true });
      }
      // desistiu depois de várias tentativas: «Tentar de novo» recomeça o laço; «Sair» só se o problema for da conta
      $("boot-tentar").textContent = "Tentar de novo";
      E.bootTentar = () => { E.bootTentar = null; aoMudarRota(false); };
      bootMsg(E.api.mensagemErro(e), { tentar: true, sair: E.M.rede.erroDeConta(e) });
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
  E.regioes = null;
  if (E.rascunhos) E.rascunhos.salvarTudo();
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
    /** Rascunho de um campo: ligar(campo, chave) guarda o que a pessoa digita e devolve na volta («Rascunho restaurado · descartar»);
        apagar(chave) SÓ depois que o servidor confirmar o envio. Nunca guarda senha nem campo com data-segredo. */
    rascunho: {
      ligar: (campo, chave, opcoes) => E.rascunhos.ligar(campo, chave, opcoes),
      apagar: chave => E.rascunhos.apagar(chave),
      existe: chave => E.rascunhos.existe(chave),
      texto: chave => E.rascunhos.texto(chave),
    },
    /** Atalhos de teclado «Ir para…» desta tela (M22): [{rotulo, alvo: Element | seletor | () => Element}]. Aparecem ao receber o foco (Tab),
        antes do «Pular para o conteúdo». Sem chamar isto, valem as regiões padrão da rota (rotas.REGIOES_DA_ROTA). Devolve cancelar(). */
    atalhosDeRegiao(lista) {
      E.regioes = Array.isArray(lista) ? lista.filter(x => x && x.rotulo && x.alvo) : null;
      desenharRegioes();
      const cancelar = () => { if (E.regioes) { E.regioes = null; desenharRegioes(); } };
      E.assinaturas.add(cancelar);
      return () => { cancelar(); E.assinaturas.delete(cancelar); };
    },
    /** Conexão: estado atual e aoVoltar(fn) — fn() roda quando a internet/servidor voltam (releia o que está na tela). Devolve cancelar(). */
    rede: {
      get estado() { return E.rede.estado; },
      aoVoltar(fn) {
        const cancelar = E.rede.aoVoltar(fn);
        E.assinaturas.add(cancelar);
        return () => { cancelar(); E.assinaturas.delete(cancelar); };
      },
    },
    /** fn() → true enquanto este módulo tem trabalho que uma atualização automática não pode interromper (rascunho enviando, fila de saída…). Devolve cancelar(). */
    naoAtualizar(fn) {
      E.naoAtualizar.add(fn);
      const cancelar = () => { E.naoAtualizar.delete(fn); };
      E.assinaturas.add(cancelar);
      return () => { cancelar(); E.assinaturas.delete(cancelar); };
    },
    /** Comandos desta tela na paleta Ctrl/⌘+K (M18): registrar({ id, rotulo, palavras?, atalho?, icone?, fazer }) → cancelar(). Somem sozinhos ao sair da tela. */
    comandos: {
      registrar(cmd) {
        const cancelar = E.comandos.registrar(cmd);
        E.assinaturas.add(cancelar);
        return () => { cancelar(); E.assinaturas.delete(cancelar); };
      },
    },
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
  reiniciarSelo();
  marcarMenu(r.modulo);
  if (E.pulso) E.pulso.modo(r.modulo === "conversas" ? "conversas" : "normal");

  if (acesso !== "ok") {
    desmontarAtual();
    ui.limpar(vista);
    vista.appendChild(cartaoBloqueio(acesso));
    definirTitulo({ em_breve: "Em breve", fora_do_plano: "Fora do plano", sem_acesso: "Sem acesso", inexistente: "Página não encontrada", sem_cliente: "Início" }[acesso]);
    desenharRegioes();
    if (doUsuario) focarTitulo(seq);
    return;
  }

  const chave = `${def.arquivo}|${E.cliente ? E.cliente.id : "-"}`;
  let mod = null;
  if (E.atual && E.atual.chave === chave) mod = E.atual.mod;
  else {
    desmontarAtual();
    ui.limpar(vista);
    vista.appendChild(ui.esqueleto(rotas.esqueletoDaRota(r.modulo, r.partes)));   // a forma da tela, não 4 cartões iguais
    try {
      mod = await arq(def.arquivo);
    } catch (e) {
      console.error(`falha ao carregar ${def.arquivo}`, e);
      if (E.pwa && navigator.onLine !== false) E.pwa.falhaDeImport();   // arquivo que a versão nova trocou: a faixa de versão avisa
      if (seq !== E.montando) return;
      ui.limpar(vista);
      // frase em português sem endereço; refaz sozinho quando a internet volta (orbita:online) e tem «Tentar de novo»
      vista.appendChild(ui.h("div", { class: "area-bloqueada" }, ui.erroCartao(e, () => aoMudarRota(false))));
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
    if (E.pwa && ehFalhaDeImport(e) && navigator.onLine !== false) E.pwa.falhaDeImport();
    if (seq !== E.montando) return;
    ui.limpar(vista);
    // dependência que não carregou: o navegador guarda a falha para aquela URL, então recarregar é o único jeito de tentar de verdade
    vista.appendChild(ui.erroCartao(e, ehFalhaDeImport(e) ? () => location.reload() : () => aoMudarRota(false)));
  }
  desenharRegioes();
  if (doUsuario) focarTitulo(seq);
}

/* ============================================================
   ACESSIBILIDADE DE FLUXO (M22): atalhos «Ir para…», foco no título e anúncio da página
   ============================================================ */
function resolverAlvo(alvo) {
  try {
    const el = typeof alvo === "function" ? alvo() : (typeof alvo === "string" ? document.querySelector(alvo) : alvo);
    return el && el.isConnected ? el : null;
  } catch { return null; }
}
/** Foca um alvo que talvez não seja focável por natureza (região, mensagens): ganha tabindex -1 e rola até ele. */
function focarElemento(el) {
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  try { el.scrollIntoView({ block: "nearest" }); } catch { /* ok */ }
}
let regioesBotoes = [];
function atualizarVisibilidadeRegioes() {
  for (const b of regioesBotoes) b.el.hidden = !resolverAlvo(b.alvo);   // alvo que não existe agora não ganha atalho
}
function desenharRegioes() {
  const cont = $("pular-regioes");
  if (!cont || !E.ui) return;
  E.ui.limpar(cont);
  regioesBotoes = [];
  const lista = E.regioes || (E.ultimaRota ? E.M.rotas.regioesDaRota(E.ultimaRota.modulo) : []);
  for (const r of lista) {
    const el = E.ui.h("button", { type: "button", class: "pular-regiao" }, r.rotulo);
    el.addEventListener("click", ev => {
      ev.preventDefault();
      const alvo = resolverAlvo(r.alvo);
      if (alvo) focarElemento(alvo); else E.ui.anunciar("Essa área não está disponível agora.");
    });
    cont.appendChild(el);
    regioesBotoes.push({ el, alvo: r.alvo });
  }
  atualizarVisibilidadeRegioes();
}
/** A tela muda por dentro (a conversa abre, o quadro troca de visão): os atalhos acompanham, no máximo uma vez por quadro de tela. */
function observarRegioes() {
  const v = $("vista");
  if (!v || typeof MutationObserver !== "function") return;
  let agendado = false;
  new MutationObserver(() => {
    if (agendado || !regioesBotoes.length) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; atualizarVisibilidadeRegioes(); });
  }).observe(v, { childList: true, subtree: true });
}

/** Depois de navegar: o foco vai para o <h1> da tela (tabindex -1) e o leitor de tela ouve «Pacientes, carregado». Se o título ainda não existe,
    espera até 3 s por ele; sem <h1>, cai para a própria vista com o título da aba. */
function focarTitulo(seq) {
  const v = $("vista");
  if (!v) return;
  const pronto = h1 => {
    if (seq !== E.montando) return true;
    const nome = String(h1.textContent || "").replace(/\s+/g, " ").trim();
    h1.setAttribute("tabindex", "-1");
    try { h1.focus({ preventScroll: true }); } catch { h1.focus(); }
    scrollTo({ top: 0 });
    if (nome) E.ui.anunciar(`${nome}, carregado`);
    return true;
  };
  const achado = v.querySelector("h1");
  if (achado) { pronto(achado); return; }
  if (typeof MutationObserver !== "function") { focarVista(); return; }
  let feito = false;
  const fim = () => { if (feito) return; feito = true; obs.disconnect(); clearTimeout(limite); };
  const obs = new MutationObserver(() => { const h1 = v.querySelector("h1"); if (h1) { fim(); pronto(h1); } });
  obs.observe(v, { childList: true, subtree: true });
  const limite = setTimeout(() => { if (feito) return; fim(); if (seq === E.montando) { focarVista(); if (E.titulo) E.ui.anunciar(`${E.titulo}, carregado`); } }, 3000);
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
    produtoAberto: E.workspace ? { id: E.workspace, titulo: E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name, resumo: E.M.rotas.PRODUTOS[E.workspace].resumo,
      icone: E.M.rotas.iconeDoProduto(E.workspace) } : null,
    sessao: E.sessao,
    navegar,
    pintarMarcaOrg(marcaOrg) { pintarMarca(E.M.tema.marcaEfetiva(marcaOrg || {}, {}), { respeitarEsquema: false }); },
    restaurarMarca() { pintarMarca(E.M.tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {})); },
    titulo: definirTitulo,
    /** depois de entrar/aceitar convite: guarda o token e abre o app. */
    async aoEntrar(token, { cliente_id } = {}) {
      // outra conta podia estar aberta neste navegador (o admin testando o convite que acabou de criar): a sessão lida com o token antigo e o
      // que o aparelho guardava dela (sessão, respostas, Recentes) não podem ser adotados por quem entrou agora
      E.sessaoPromessa = null; E.sessaoGuardada = null;
      limparDadosDoAparelho();
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

/** Os itens que esta pessoa vê neste produto (papel, plano, prontos): o menu lateral, a barra de baixo e o «Ir para» da paleta leem a mesma lista. */
function itensVisiveis() {
  const v = E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico");
  return E.M.rotas.itensDoMenu({ op: opcoesAcesso(), vocab: v, workspace: E.workspace, prontos: E.prontos.MODULOS_PRONTOS, dev: devLigado() });
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
  if (modoInstalacao()) {
    const bt = ui.h("button", { type: "button" }, ui.icone("baixar"), "Instalar o app");
    bt.addEventListener("click", () => { if (api) api.fechar(null); instalarApp(); });
    grade.appendChild(bt);
  }
  ui.modal({ titulo: "Mais", corpo: grade, acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: a => { api = a; } });
}

function marcarMenu(modulo) {
  const grupo = { contatos: "crm", crm: "crm", empresas: "empresas", tarefas: "tarefas" }[modulo] || modulo;
  for (const a of document.querySelectorAll(".nav-b, .barra-b")) {
    if (a.dataset.id === grupo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}

/* ---- período de teste (M18): uma pílula de 28 px junto à empresa, não uma faixa de linha inteira; dispensável por 24 h ---- */
const CHAVE_TESTE_OCULTO = "nx-teste-oculto";
const DIA_MS = 24 * 3600 * 1000;
function testeOculto(cli) { const t = Number(LS.lerTxt(`${CHAVE_TESTE_OCULTO}:${cli.id}`)); return t > 0 && Date.now() - t < DIA_MS; }
function diasDeTeste(cli) {
  const d = Math.round((Date.parse(`${cli.teste_ate}T12:00:00Z`) - Date.parse(`${E.ui.hojeSP()}T12:00:00Z`)) / DIA_MS);
  return Number.isFinite(d) ? d : null;
}
function pilulaDeTeste(cli) {
  const { ui } = E;
  if (!(cli.status === "teste" && cli.teste_ate && cli.teste_ate >= ui.hojeSP()) || testeOculto(cli)) return null;
  const dias = diasDeTeste(cli);
  const bt = ui.h("button", { type: "button", class: "pilula-teste", "aria-haspopup": "dialog", dataset: { urgente: dias !== null && dias <= 3 ? "1" : "0" },
    title: `Teste grátis até ${ui.dataCurtaBR(cli.teste_ate)}` }, ui.icone("relogio"), ui.h("span", null, ui.h("span", { class: "pt-pre" }, "Teste "), `até ${ui.dataCurtaBR(cli.teste_ate)}`));
  bt.addEventListener("click", () => abrirAvisoTeste(bt, cli, dias));
  return bt;
}
function abrirAvisoTeste(ancora, cli, dias) {
  const { ui } = E;
  const wa = E.marca && E.marca.suporte_wa;
  let f = null;
  const ocultar = ui.h("button", { type: "button", class: "bt bt-fant bt-p" }, "Ocultar por 24 h");
  ocultar.addEventListener("click", () => { LS.gravar(`${CHAVE_TESTE_OCULTO}:${cli.id}`, String(Date.now())); if (f) f.fechar(); desenharEmpresa(); });
  const falar = wa ? ui.h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp(`Olá! Quero continuar usando o sistema na ${cli.nome}.`, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
  f = ui.flutuante(ancora, ui.h("div", { class: "pilha-p" },
    ui.h("p", { class: "rotulo" }, "Período de teste"),
    ui.h("p", null, "Teste grátis até ", ui.h("b", null, ui.dataCurtaBR(cli.teste_ate)), dias === null ? "." : dias <= 0 ? " (termina hoje)." : ` (${dias} dia${dias === 1 ? "" : "s"}).`),
    ui.h("p", { class: "fraco" }, "Depois dessa data você só consegue consultar. Fale com o suporte para continuar."),
    ui.h("div", { class: "linha" }, falar, ocultar)), { largura: 300 });
  if (f && f.el) f.el.setAttribute("aria-label", "Período de teste");   // o painel é role="dialog": precisa de nome
}

function desenharEmpresa() {
  const { ui } = E;
  const alvo = $("topo-empresa");
  ui.limpar(alvo);
  const topo = $("topo");
  if (topo) topo.classList.remove("topo-emp-troca", "topo-pilula-on");   // o CSS do celular esconde a marca quando a empresa troca ou há pílula (topo com ≤ 5 controles)
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
  } else {
    const bt = ui.h("button", { type: "button", class: "empresa-bt", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": `Empresa ativa: ${cli.nome}. Trocar de empresa` },
      conteudo, ui.icone("seta-baixo"));
    bt.addEventListener("click", () => abrirSeletorEmpresa(bt));
    alvo.appendChild(bt);
    if (topo) topo.classList.add("topo-emp-troca");
  }
  const pilula = pilulaDeTeste(cli);
  if (pilula) { alvo.appendChild(pilula); if (topo) topo.classList.add("topo-pilula-on"); }
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
    { rotulo: "Aparência", icone: { claro: "sol", escuro: "lua", marca: "pincel" }[esquemaPreferido()] || "sol", fn: () => abrirMenuTema(ancora) },
    { rotulo: "Ajuda", icone: "ajuda", fn: () => abrirMenuAjuda(ancora) },
    modoInstalacao() ? { rotulo: "Instalar o app", icone: "baixar", fn: () => instalarApp() } : null,
    // app instalado não tem o botão de recarregar do navegador: se uma tela travar, a saída é esta
    E.pwaMod && E.pwaMod.emStandalone() ? { rotulo: "Recarregar", icone: "reabrir", fn: () => location.reload() } : null,
    "-",
    { rotulo: "Sair", icone: "sair", fn: () => sair() },
  ].filter(Boolean));
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

/** Produtos, tema (no celular o tema vai para o menu da conta), paleta Ctrl/⌘+K e sino (este só com uma empresa ativa). */
function desenharFerramentasTopo(dir) {
  const { ui } = E;
  if (E.sessao) {
    const prodAberto = E.workspace ? E.M.rotas.PRODUTOS[E.workspace] : null;
    const btProdutos = ui.h("button", { type: "button", class: "topo-produtos", "aria-haspopup": "dialog", title: prodAberto ? prodAberto.resumo : "Trocar entre CRM, Nexus Ads e Atendimento",
      "aria-label": prodAberto ? `${E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name}: ${prodAberto.resumo} Trocar de produto` : "Trocar entre CRM, Nexus Ads e Atendimento" },
      ui.icone(E.M.rotas.iconeDoProduto(E.workspace, E.cliente ? E.M.vocab.vocab(E.cliente.vertical).icone_crm : "funil")), ui.h("span", null, prodAberto?.nome || "Produtos"));
    btProdutos.addEventListener("click", () => abrirSeletorProduto(btProdutos));
    dir.appendChild(btProdutos);
  }
  const btTema = ui.h("button", { type: "button", class: "bt-icone bt-tema", id: "bt-tema", "aria-haspopup": "menu" }, ui.icone("sol"));
  btTema.addEventListener("click", () => abrirMenuTema(btTema));
  dir.appendChild(btTema);
  atualizarBotaoTema();
  if (E.sessao) {
    const bt = ui.h("button", { type: "button", class: "topo-busca", id: "bt-busca", "aria-label": `Buscar e comandos (${teclaMod()}+K)`, "aria-keyshortcuts": "Control+K Meta+K" },
      ui.icone("busca"), ui.h("span", { class: "rot" }, "Buscar"), ui.h("kbd", null, `${teclaMod()} K`));
    bt.addEventListener("click", () => abrirPaleta());
    dir.appendChild(bt);
  }
  if (!E.cliente) return;
  const sino = ui.h("button", { type: "button", class: "bt-icone sino", id: "bt-sino", "aria-haspopup": "dialog", "aria-expanded": "false" },
    ui.icone("sino"), ui.h("span", { class: "badge", id: "sino-n", hidden: true }), ui.h("span", { class: "rede-ponto", id: "rede-ponto", hidden: true, "aria-hidden": "true" }));
  sino.addEventListener("click", () => abrirSino(sino));
  dir.appendChild(sino);
  atualizarSinoUI();
  atualizarPontoRede();
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
   PALETA DE COMANDOS (M18) — Ctrl/⌘+K nos três produtos: Recentes, Ir para, ações do shell e da tela aberta, depois os dados (nx_buscar).
   A janela vive em paleta.js (sob demanda); o que ela sabe (catálogo, filtro, recentes, registro de comandos) em comandos.js (puro).
   ============================================================ */

/** Contatos e negócios (CRM) só existem no Órbita completo ou no CRM; Atendimento busca só conversas; Anúncios não busca dados. */
function gruposDeDados() {
  const c = E.cliente;
  if (!c || E.buscaFora || !c.modulos.includes("crm") || !pronto("crm")) return [];
  const g = [];
  if (E.workspace === null || E.workspace === "crm") g.push("contatos", "negocios");
  if ((E.workspace === null || E.workspace === "atendimento") && c.modulos.includes("conversas") && pronto("conversas")) g.push("conversas");
  return g;
}

/** O que a paleta pode oferecer AGORA a esta pessoa neste produto (papel, plano, prontos, produto, o que o aparelho sabe fazer). */
function ambienteComandos() {
  const { rotas, vocab, comandos } = E.M;
  const cli = E.cliente;
  return {
    workspace: E.workspace, vocab: vocab.vocab(cli ? cli.vertical : "generico"),
    rotaOk: comandos.criarRotaOk({ rotas, op: opcoesAcesso(), workspace: E.workspace }),
    pode: min => rotas.podePapel(papelAtual(), min),
    empresas: E.sessao ? E.sessao.clientes.length : 0,
    instalar: !!modoInstalacao(), suporte: !!(E.marca && E.marca.suporte_wa), temCliente: !!cli,
  };
}

/** Contexto para as ações do shell que abrem janelas de um módulo (nova oportunidade, marcar consulta), de qualquer tela. */
function ctxDaAcao() { return construirCtx(E.ultimaRota || { modulo: null, partes: [], query: {} }, $("vista")); }
const ancoraTopo = seletor => document.querySelector(seletor) || $("topo");
const naTela = hash => location.hash === hash || location.hash.startsWith(hash + "/") || location.hash.startsWith(hash + "?");

/** Vai para a tela e executa o comando que ela registra ao abrir (ex.: «Nova conversa» em Conversas). Sem o comando (sem permissão), só chega à tela. */
async function irEFazer(hash, comandoId) {
  if (!naTela(hash)) navegar(hash);
  const cmd = await E.comandos.aguardar(comandoId, 6000);
  if (cmd) cmd.fazer();
}
/** Vai para a tela e aperta o botão dela quando aparecer (a tela ainda não registra o comando). */
function irEClicar(hash, seletor, ms = 6000) {
  if (!naTela(hash)) navegar(hash);
  const ate = Date.now() + ms;
  const tentar = () => {
    const el = $("vista") && $("vista").querySelector(seletor);
    if (el && !el.disabled) { el.click(); return; }
    if (Date.now() < ate) setTimeout(tentar, 120);
  };
  tentar();
}

function falarComSuporte() {
  const wa = E.marca && E.marca.suporte_wa;
  if (!wa) return;
  const app = E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name;
  const tela = E.titulo ? ` na tela «${E.titulo}»` : "";
  const emp = E.cliente ? ` (empresa ${E.cliente.nome})` : "";
  window.open(E.ui.linkWhatsApp(`Olá! Preciso de ajuda no ${app}${tela}${emp}.`, wa), "_blank", "noopener,noreferrer");
}

/** Como o shell executa cada ação do catálogo (comandos.CATALOGO); a paleta só mostra as que valem para a pessoa. */
function acoesDoShell() {
  return {
    "nova-oportunidade": () => ctxDaAcao().novoNegocio(),
    "marcar-consulta": async () => {
      try { const m = await carregar("agenda"); await m.marcarConsulta(ctxDaAcao()); }
      catch (e) { console.error(e); E.ui.toast("A agenda não está disponível agora.", { tipo: "erro" }); }
    },
    "nova-conversa": () => irEFazer("#/conversas", "conversas.nova"),
    "nova-tarefa": () => irEClicar("#/tarefas", 'button[aria-label="Nova tarefa"]'),
    "alternar-tema": () => definirEsquema(esquemaPreferido() === "escuro" ? "claro" : "escuro"),
    "trocar-empresa": () => abrirSeletorEmpresa(ancoraTopo("#topo-empresa button")),
    "abrir-produto": () => abrirSeletorProduto(ancoraTopo(".topo-produtos")),
    "instalar": () => instalarApp(),
    "atalhos": () => abrirAtalhos(),
    "primeiros-passos": () => navegar("#/inicio"),
    "suporte": () => falarComSuporte(),
    "sair": () => sair(),
  };
}

function destinosDaPaleta() {
  const v = E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico");
  return E.M.comandos.destinos(E.M.rotas.itensDoMenu({ op: opcoesAcesso(), vocab: v, workspace: E.workspace, prontos: E.prontos.MODULOS_PRONTOS, dev: devLigado() }));
}

/** Os últimos abertos desta empresa neste aparelho (localStorage; some no logout). null sem sessão ou sem armazenamento. */
function recentesDaEmpresa() {
  if (!E.sessao || !E.cliente || !E.M.comandos) return null;
  try { return E.M.comandos.criarRecentes({ armazenamento: localStorage, chave: E.M.comandos.chaveRecentes(E.sessao.conta.id, E.cliente.id) }); } catch { return null; }
}
/** A tela de detalhe aberta (contato, oportunidade, conversa) entra em «Recentes» quando diz o nome da pessoa (ctx.titulo). */
function lembrarRecente(titulo) {
  try {
    const it = E.M.comandos && E.M.comandos.recenteDaRota(E.ultimaRota, titulo);
    const r = it && recentesDaEmpresa();
    if (r) r.registrar(it);
  } catch { /* recentes nunca atrapalham a tela */ }
}

/** nx_buscar → grupos já com título, ícone e destino (por produto: gruposDeDados). «#» só conversas. */
async function buscarNaPaleta(q, modo) {
  const v = E.M.vocab.vocab(E.cliente.vertical);
  const { ui } = E;
  const gs = gruposDeDados().filter(k => modo !== "protocolo" || k === "conversas");
  if (!gs.length) return { grupos: [] };
  let r;
  try { r = await E.api.rpcC("nx_buscar", { p_q: q }); }
  catch (e) {
    if (e && (e.status === 404 || /could not find the function/i.test(String(e.codigo)))) { E.buscaFora = true; return { grupos: [], aviso: "A busca de dados chega em breve." }; }
    throw e;
  }
  const def = {
    contatos: { titulo: v.contatos, icone: "contato", tipo: "contato", hash: x => `#/contatos/${encodeURIComponent(x.id)}`, l1: x => x.nome || ui.telBR(x.telefone), l2: x => (x.telefone ? ui.telBR(x.telefone) : "") },
    negocios: { titulo: v.negocios, icone: "funil", tipo: "negocio", hash: x => `#/crm/negocio/${encodeURIComponent(x.id)}`, l1: x => x.titulo || x.contato_nome || v.negocio,
      l2: x => [x.contato_nome, x.estagio_nome].filter(Boolean).join(" · ") },
    conversas: { titulo: "Conversas", icone: "chat", tipo: "conversa", hash: x => `#/conversas/${encodeURIComponent(x.id)}`, l1: x => x.contato_nome || "Conversa",
      l2: x => [x.protocolo ? `Protocolo ${x.protocolo}` : null, x.status === "resolvida" ? "resolvida" : x.status === "aberta" ? "aberta" : x.status].filter(Boolean).join(" · ") },
  };
  return { grupos: gs.map(k => ({ titulo: def[k].titulo, icone: def[k].icone, itens: (Array.isArray(r && r[k]) ? r[k] : []).map(x => ({ l1: def[k].l1(x), l2: def[k].l2(x), hash: def[k].hash(x), tipo: def[k].tipo })) })) };
}

/** Monta o que a paleta recebe a cada abertura (papel, plano e produto podem ter mudado desde a última). */
function ambientePaleta(inicial) {
  const C = E.M.comandos;
  const a = ambienteComandos();
  const { daTela, geral } = C.juntarAcoes(C.acoesPadrao(a, acoesDoShell()), E.comandos.listar());
  const gs = gruposDeDados();
  const v = a.vocab;
  const rec = recentesDaEmpresa();
  const que = gs.includes("contatos") ? `${v.contatos.toLowerCase()}, ${v.negocios.toLowerCase()}${gs.includes("conversas") ? " e conversas" : ""}` : gs.includes("conversas") ? "conversas" : "";
  return {
    ui: E.ui, C, destinos: destinosDaPaleta(), acoes: geral, daTela, inicial,
    placeholder: que ? `Buscar ${que} ou digitar um comando` : "Ir para uma tela ou executar um comando",
    recentes: () => (rec ? rec.ler() : []),
    buscarDados: gs.length ? buscarNaPaleta : null,
    navegar, mensagemErro: E.api.mensagemErro,
    aoEscolher: it => { if (rec && it.hash && it.tipo) rec.registrar({ hash: it.hash, titulo: it.titulo, sub: it.sub, tipo: it.tipo }); },
  };
}

let paletaAbrindo = false;
/** Ctrl/⌘+K, o botão «Buscar» do topo e o prefixo «>»: abre a paleta; apertar de novo fecha. */
async function abrirPaleta(inicial = "") {
  if (!E.sessao || !$("app") || $("app").hidden) return;
  if (E.paleta.janela) { E.paleta.janela.fechar(); return; }
  if (paletaAbrindo) return;
  paletaAbrindo = true;
  try {
    if (!E.paleta.mod) E.paleta.mod = await arq("paleta.js");
    if (E.paleta.janela || !E.sessao) return;
    const j = E.paleta.mod.abrir(ambientePaleta(inicial));
    E.paleta.janela = j;
    j.fim.finally(() => { if (E.paleta.janela === j) E.paleta.janela = null; });
  } catch (e) {
    console.error("paleta indisponível", e);
    E.ui.toast("Não consegui abrir a busca agora. Tente de novo.", { tipo: "erro" });
  } finally { paletaAbrindo = false; }
}

/** Folha de atalhos («?» fora de campo, menu Ajuda e ação «Atalhos de teclado»): os do shell e os que a tela aberta registrou. */
async function abrirAtalhos() {
  try {
    if (!E.paleta.mod) E.paleta.mod = await arq("paleta.js");
    E.paleta.mod.abrirAtalhos({ ui: E.ui, C: E.M.comandos, tecla: teclaMod(), daTela: E.comandos.listar() });
  } catch (e) {
    console.error("atalhos indisponíveis", e);
    E.ui.toast("Não consegui abrir os atalhos agora.", { tipo: "erro" });
  }
}

/** Menu «Ajuda» da conta: Primeiros passos (só admin, onde o Início existe), Atalhos e Falar com o suporte. */
function abrirMenuAjuda(ancora) {
  const a = ambienteComandos();
  E.ui.menu(ancora, [
    a.rotaOk("inicio") && a.pode("admin") ? { rotulo: "Primeiros passos", icone: "check", fn: () => navegar("#/inicio") } : null,
    { rotulo: "Atalhos de teclado", icone: "ajuda", fn: () => abrirAtalhos() },
    E.marca && E.marca.suporte_wa ? { rotulo: "Falar com o suporte", icone: "whatsapp", fn: () => falarComSuporte() } : null,
    "-",
    // o suporte pergunta «qual versão aparece aí?»: fica à vista e um toque copia
    { rotulo: `Versão ${VERSAO}`, icone: "info", fn: () => E.ui.copiar(VERSAO, { aviso: "Versão copiada." }) },
  ].filter(Boolean));
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
  if (bt) {
    const base = n > 0 ? `Notificações: ${n} não lida${n === 1 ? "" : "s"}` : "Notificações";
    const sit = E.rede ? ROTULO_REDE[E.rede.estado] : null;
    bt.setAttribute("aria-label", sit ? `${base}. ${sit}` : base);
  }
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
  // teste em andamento: pílula junto à empresa (pilulaDeTeste); só o que BLOQUEIA continua sendo faixa
  if (cli.status === "teste" && cli.teste_ate && cli.teste_ate < hoje) {
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
function definirTitulo(texto) { E.titulo = texto || ""; atualizarTitulo(); lembrarRecente(texto); }
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
  atualizarSeloDoApp();
}

/** Conversas não lidas no ícone do app instalado (Chrome/Edge instalados, iPhone 16.4+): dá para ver quantas esperam sem abrir o app.
    Navegador sem essa função simplesmente não mostra nada; sem sessão o número sai do ícone. Começa em null: a 1ª chamada sempre acerta o ícone
    (um número que ficou da última vez não continua lá). */
let seloDoApp = null;
function atualizarSeloDoApp() {
  const n = E.sessao && E.cliente ? Math.max(0, Number(E.badges.conversas) || 0) : 0;
  if (n === seloDoApp) return;
  seloDoApp = n;
  try {
    if (n > 0 && typeof navigator.setAppBadge === "function") Promise.resolve(navigator.setAppBadge(n)).catch(() => {});
    else if (n === 0 && typeof navigator.clearAppBadge === "function") Promise.resolve(navigator.clearAppBadge()).catch(() => {});
  } catch { /* sem suporte */ }
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

// M13: o Chrome/Edge/Android avisam que o app é instalável; guardamos o evento para o botão «Instalar o app» e escondemos o aviso automático
addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); E.instalarEvento = ev; });
addEventListener("appinstalled", () => { E.instalarEvento = null; });

iniciar();
