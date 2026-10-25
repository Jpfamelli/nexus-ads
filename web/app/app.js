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
const ROTAS_PUBLICAS = new Set(["login", "convite", "senha", "testar"]);   // plano 1500c · UC-001: #/testar
/** plano 1500c · UCC-030: quando o servidor diz até quando o token vale (nx_entrar.expira_em), o antes.js não pré-carrega o app com um token vencido. */
const CHAVE_TOKEN_EXPIRA = "nx-token-expira";

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
  telaVista: null,       // a tela que está na vista (chave do módulo ou do bloqueio): a transição de rota só roda quando ela muda
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
  naoLidasAnterior: null,  // A2: última contagem de não lidas vista pelo shell (null = sem referência: a 1ª leitura não avisa)
  pulsoTemNaoLidas: false, // A3: nx_pulso já mandou nao_lidas (contrato 8): o nx_cv_listar de reserva deixa de ser consultado
  somEm: 0,                // A2: último som de mensagem nova (no máximo um a cada 10 s)
  canais: { lista: [], fonte: null, assinantes: new Set(), toast: null, toastAssinatura: "", dispensado: "", avisouQueda: false, conferiuEm: 0 },   // A10: números caídos
  versaoRemotaP: null,     // A4: leitura única do versao.json (min_migracao)
};

/** plano 1500c · UCC-064: o nome do produto guardado com a marca (o mesmo que o antes.js já pôs no título) vale desde o boot — o título não pisca
    «Órbita» numa revenda antes de a marca chegar. Só o desta origem; qualquer coisa estranha fica no padrão. */
function produtoGuardado(ls = LS, host = typeof location !== "undefined" ? location.host : "") {
  const m = ls.ler("nx-app-marca");
  if (!m || typeof m.produto !== "string" || (m.host && m.host !== host)) return null;
  const p = m.produto.replace(/[<>]/g, "").trim().slice(0, 40);
  return p || null;
}
E.produto = produtoGuardado() || E.produto;

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
/* plano 1500c · UCC-135: erro de JavaScript que escapou (tela que quebrou) vai para o relatório central — só o TIPO do erro (TypeError…),
   a tela, a versão e o navegador; a mensagem e a pilha ficam de fora (podem ter nome ou telefone). Também entra nos «Erros recentes» do Sobre.
   No máximo um por tipo+tela a cada 5 min (um laço de erro não vira enxurrada); o api.erroCliente ainda limita 10 por aba. */
function resumoDoErroJs(erro, { tela = "", versao = "", navegador = "" } = {}) {
  const nome = erro && typeof erro === "object" && typeof erro.name === "string" ? erro.name : typeof erro === "string" ? "Error" : "Rejeicao";
  return { codigo: `js:${String(nome).replace(/[^A-Za-z]/g, "").slice(0, 40) || "Error"}`, tela, versao, navegador };
}
function vigiarErrosDoApp(alvo = typeof window !== "undefined" ? window : null) {
  if (!alvo || typeof alvo.addEventListener !== "function") return;
  const vistos = new Map();
  const relatar = erro => {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : {};
      const r = resumoDoErroJs(erro, { tela: (E.ultimaRota && E.ultimaRota.modulo) || "", versao: VERSAO,
        navegador: E.pwaMod && E.pwaMod.nomeDoNavegador ? E.pwaMod.nomeDoNavegador(nav.userAgent) : "" });
      const k = `${r.codigo}|${r.tela}`, agora = Date.now();
      if (agora - (vistos.get(k) || -Infinity) < 5 * 60000) return;
      vistos.set(k, agora);
      if (E.M.api && E.M.api.guardarErroRecente) E.M.api.guardarErroRecente({ codigo: r.codigo }, r.tela || null);
      if (E.api && E.api.erroCliente) E.api.erroCliente(r).catch(() => {});
    } catch { /* o relatório nunca derruba a tela */ }
  };
  alvo.addEventListener("error", ev => { if (ev && ev.error) relatar(ev.error); });
  alvo.addEventListener("unhandledrejection", ev => { const m = ev && ev.reason; if (m && m.codigo) return; relatar(m); });   // erro da API já está no anel (UCC-134)
}

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
  // A2: o som de mensagem nova (Web Audio) só pode nascer depois de um gesto da pessoa
  document.addEventListener("pointerdown", desbloquearAudio, { once: true, passive: true });
  document.addEventListener("keydown", desbloquearAudio, { once: true });
  vigiarErrosDoApp();   // plano 1500c · UCC-135
  // plano 1000b · UB-168: em aparelho compartilhado, toque/tecla/rolagem contam como uso (o pulso, que lê sozinho, não conta)
  // plano 1500c · UCC-020: o mesmo toque marca o último uso (o pulso alonga para 60 s depois de 10 min sem ninguém mexer)
  for (const t of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(t, () => { E.tocadoEm = Date.now(); if (E.ocioso) E.ocioso.tocar(); }, { capture: true, passive: true });
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
    // plano 2000d · DU-276: o título nasce com o produto guardado da marca (revenda) — nada de «Órbita · Nexus» antes de a marca chegar
    document.title = rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name;
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
  // plano 1000 (AS-296): com a faixa de conexão à vista, os erros de rede das telas não viram uma cascata de toasts
  ui.configurar({ mensagemErro: api.mensagemErro, suprimirToast: toastRepetidoDeRede });
  // M16: última resposta de leituras seguras no aparelho (IndexedDB, 12 h, lista branca): a tela abre com o que havia e revalida.
  // Plano 1000 (AS-185): aparelho compartilhado («Lembrar neste aparelho» desmarcado no login) → só na memória da aba
  E.cache = E.M.cache.criarCache(aparelhoCompartilhado() ? { disco: false } : {});
  // M14: estado de conexão (online · lento · offline · servidor fora) alimentado por cada chamada do api.js
  E.rede = E.M.rede.criarRede({ ping: pingDoSite, sondar: sondarServidor });
  E.api = api.criarApi({
    url: dados.SUPA_URL, chave: dados.CHAVE_PUBLICA,
    token: () => dados.lerToken(),
    cliente: () => (E.cliente ? E.cliente.id : null),
    aoSessaoInvalida: e => sessaoCaiu(e),   // plano 2000d · DU-400: o motivo (hint) diz se foi o tempo ou alguém que encerrou
    rede: E.rede, contexto: true, retentar: true,
    cache: E.cache, conta: () => (E.sessao ? E.sessao.conta.id : LS.lerTxt(CHAVE_CONTA)), aoCache: ev => aoCacheEvento(ev),
    aoErro: e => aoErroApi(e),   // A4: cliente_pausado vira bloqueio honesto
  });
  // M17: rascunhos por conta + empresa (localStorage, 7 dias, ~200 KB, nunca senha); somem no logout
  E.rascunhos = E.M.rascunho.criarRascunhos({ conta: () => (E.sessao ? E.sessao.conta.id : null), cliente: () => (E.cliente ? E.cliente.id : null) });
  E.pulso = E.M.pulso.criarPulso({
    ler: () => (E.cliente ? E.api.rpcC("nx_pulso") : Promise.resolve(null)),
    aoNotif: n => atualizarSino(n),
    // A3: nx_pulso.nao_lidas (contrato 8) é a fonte do badge; o nx_cv_listar de atualizarNaoLidas fica só como reserva da RPC antiga
    aoNaoLidas: (n, ultima) => { E.naoLidasPulsoEm = Date.now(); E.pulsoTemNaoLidas = true; definirBadge("conversas", n); avisarNaoLidas(n, ultima); },
    aoCanais: lista => atualizarCanais({ canais: lista }, "pulso"),   // A10: estado dos números quando o servidor manda
    escopo: () => E.cliente && E.cliente.id,
    avisoTela: () => lerAvisosConversas().tela,   // AS-188: quem ligou o aviso de área de trabalho continua a 15 s com a aba escondida
    // plano 1000b · UB-279: o pulso parou por sessão inválida (aba parada, token vencido): abre a janela de login; o «ok» dela reinicia o pulso
    // plano 1500c · UCC-016: parou por conta pausada/suspensa ou teste vencido → o mesmo bloqueio honesto do aoErroApi
    aoParar: motivo => { if (motivo === "sessao_invalida") { if (E.sessao) sessaoCaiu(); } else aoErroApi({ codigo: motivo }); },
    codigosDeParada: E.M.rede.CODIGOS_DE_CONTA,                      // plano 1500c · UCC-013: os mesmos códigos «de conta» do rede.js
    ocioso: () => Date.now() - (E.tocadoEm || Date.now()) >= OCIOSO_PULSO_MS,   // plano 1500c · UCC-020
    aoCliente: sit => atualizarSituacaoDoCliente(sit),               // plano 1500c · UCC-019
  });
  E.pulso.assinar(() => { atualizarNaoLidas(); });
  E.rede.aoVoltar(() => { if (E.pulso) E.pulso.agora(); });   // reconectou: o pulso lê agora (e as telas pelo orbita:online / ctx.rede.aoVoltar)
  montarIndicadoresRede();
  montarSeloCache();
  marcarSemInternet();
  seguirEsquemaDoSistema();
  ouvirOutrasAbas();

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
    if (outroDialogoAberto(document)) return;   // plano 1000b · UB-127: com «Excluir?» (ou outra janela) aberto, a paleta não empilha por cima
    ev.preventDefault();
    abrirPaleta();
  });
  // «?» fora de campo: folha de atalhos (a tela que registra o próprio «?», como Conversas, fica com ele; janela aberta também)
  ui.atalho("?", ev => {
    if (!E.sessao || $("app").hidden || E.comandos.temAtalho("?") || document.querySelector("dialog[open]")) return;
    ev.preventDefault();
    abrirAtalhos();
  });
  // plano 1500c · UCC-086: «g» e depois a letra (g c = Conversas…), fora de campo e sem janela aberta; a tela que usa «g» para si fica com ele
  const seqG = E.M.comandos.criarSequenciaG ? E.M.comandos.criarSequenciaG() : null;
  if (seqG) document.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented || !E.sessao || $("app").hidden) return;
    const alvo = ev.target;
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || ""))) return;
    if (document.querySelector("dialog[open]") || E.comandos.temAtalho("g")) return;
    const r = seqG.tecla(ev.key);
    if (typeof r === "string") { ev.preventDefault(); navegar(r); }
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
  E.rede.aoVoltar(() => { releituraAoReconectar(); });
}

/** Plano 1000b · CB-166: o rede.assinar do rede.js também fala a cada segundo da contagem e no «Reconectado»; os módulos só querem saber
    quando o ESTADO muda (online ↔ lento ↔ offline ↔ servidor_fora). fn({estado, antes, online}); devolve cancelar(). */
function assinarMudancaDeRede(rede, fn) {
  if (!rede || typeof rede.assinar !== "function" || typeof fn !== "function") return () => {};
  let ultimo = rede.estado;
  return rede.assinar(f => {
    const estado = f && f.estado;
    if (!estado || estado === ultimo) return;
    const antes = ultimo; ultimo = estado;
    try { fn({ estado, antes, online: estado === "online" || estado === "lento" }); } catch (e) { console.error("ctx.rede.assinar", e); }
  });
}

/** Plano 1000b · UB-009: a conexão voltou com dado velho na tela. Remontar a tela apagaria o que está sendo editado (editor de automação,
    formulário sem rascunho): com trabalho em curso (ocupadoParaAtualizar ou guarda de rota registrada) só avisa, com «Atualizar» para quem quiser. */
function releituraAoReconectar() {
  if (!selo.falhou) return "nada";
  if (ocupadoParaAtualizar() || guardasDeRota.size > 0) {
    E.ui.toast("Os dados podem estar desatualizados.", { tipo: "info", acao: { rotulo: "Atualizar", fn: () => aoMudarRota(false) } });
    return "avisou";
  }
  aoMudarRota(false);
  return "remontou";
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
      // plano 1500c · UCC-014: tela pintada com o que o aparelho guardava → a faixa diz isso (antes só «sem internet»)
      const doAparelho = selo.em != null && (selo.servidos > 0 || selo.falhou) ? "mostrando o que estava salvo neste aparelho" : null;
      return [ROTULO_REDE[f.estado], hora(quando) ? `dados de ${hora(quando)}` : null, doAparelho].filter(Boolean).join(" · ");
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
      el = ui.h("div", { class: "faixa faixa-rede" }, ui.icone("info"), ui.h("p", { class: "rede-msg" }), espera, bt);   // plano 1000b · UB-121: sem aria-live (o ui.anunciar abaixo já fala; eram duas vezes)
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

/* ---- plano 1000 (AS-296): uma faixa só — sem internet (ou servidor fora), os erros de conexão das telas não viram toast ---- */
let frasesDeRede = null;
const RE_ESTADO_FALHA = /^(offline|servidor_fora)$/;
function toastRepetidoDeRede(texto, { tipo } = {}) {
  if (tipo !== "erro" || !E.rede || !RE_ESTADO_FALHA.test(E.rede.estado)) return false;
  if (!frasesDeRede) {
    const api = E.M.api, ui = E.M.ui;
    const f = new Set(), escrita = new Set();
    for (const codigo of ["sem_conexao", "tempo_rede", "servico_indisponivel", "http_502", "http_503", "http_504"]) {
      // plano 1500c · UCC-001: só as frases de LEITURA somem — «Sem internet: nada foi salvo» (escrita) sempre aparece, a cada tentativa
      try { f.add(api.mensagemErro({ codigo, contexto: { leitura: true } })); } catch { /* ok */ }
      try { escrita.add(api.mensagemErro({ codigo, contexto: { leitura: false } })); } catch { /* ok */ }
      try { f.add(api.mensagemErro({ codigo })); } catch { /* ok */ }
      try { if (ui && ui.fraseDeErro) f.add(ui.fraseDeErro(codigo)); } catch { /* ok */ }
    }
    for (const x of escrita) f.delete(x);
    frasesDeRede = [...f].filter(x => typeof x === "string" && x.length > 12);
  }
  const t = String(texto || "");
  return frasesDeRede.some(fr => t.includes(fr));
}

/* ---- plano 1000 (AS-209): sem internet, os botões de salvar avisam ANTES do clique (classe no <html> + aria-disabled + dica) ---- */
const SEL_ESCRITA = "form button[type=submit], .modal-rod .bt-prim, [data-escrita]";
function marcarSemInternet() {
  let obs = null;
  const marcarBotoes = sem => {
    if (sem) {
      for (const b of document.querySelectorAll(SEL_ESCRITA)) {
        if (b.dataset.semRede || b.closest("#publico")) continue;      // a tela de entrada tem a própria mensagem
        b.dataset.semRede = "1";
        b.setAttribute("aria-disabled", "true");
        if (!b.hasAttribute("title")) { b.setAttribute("title", "Sem internet: salve quando a conexão voltar"); b.dataset.semRedeTitle = "1"; }
      }
    } else {
      for (const b of document.querySelectorAll("[data-sem-rede]")) {
        delete b.dataset.semRede;
        if (!b.dataset.soConsulta) b.removeAttribute("aria-disabled");   // plano 1500c · UC-025: o «só consulta» continua valendo
        if (b.dataset.semRedeTitle) { b.removeAttribute("title"); delete b.dataset.semRedeTitle; }
      }
    }
  };
  const aplicar = f => {
    const sem = !!f && RE_ESTADO_FALHA.test(f.estado);
    document.documentElement.classList.toggle("sem-internet", sem);
    marcarBotoes(sem);
    if (sem && !obs && typeof MutationObserver === "function") {
      let agendado = false;
      obs = new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; marcarBotoes(true); }); });
      obs.observe(document.body, { childList: true, subtree: true });
    } else if (!sem && obs) { obs.disconnect(); obs = null; }
  };
  E.rede.assinar(aplicar);
  aplicar(E.rede.foto());
}

/* ---- plano 1500c · UC-025: teste vencido ou empresa suspensa → só consulta, avisado ANTES do clique (a mesma mecânica do sem internet:
   classe no <html>, aria-disabled e a dica). A equipe da plataforma/revenda não é afetada (ela continua alterando). ---- */
function somenteConsulta(cli, sessao, hoje) {
  if (!cli || !sessao) return null;
  const equipe = cli.papel === "gestor" || cli.papel === "super" || !!(sessao.conta && (sessao.conta.super || sessao.conta.papel === "gestor"));
  if (equipe) return null;
  if (cli.status === "suspenso" || cli.status === "cancelado") return "O acesso está suspenso: só consulta.";
  if (cli.status === "teste" && cli.teste_ate) {
    const d = E.M.rotas.diasAteFimTeste(cli.teste_ate, hoje);
    if (d !== null && d < 0) return "O teste terminou: só consulta.";
  }
  return null;
}
let obsConsulta = null;
function aplicarSomenteConsulta() {
  if (!E.M.rotas || !E.ui) return;
  const dica = somenteConsulta(E.cliente, E.sessao, E.ui.hojeSP(new Date(E.M.api.agoraServidor ? E.M.api.agoraServidor() : Date.now())));
  document.documentElement.classList.toggle("somente-consulta", !!dica);
  const marcar = () => {
    if (dica) {
      for (const b of document.querySelectorAll(SEL_ESCRITA)) {
        if (b.dataset.soConsulta || b.closest("#publico")) continue;
        b.dataset.soConsulta = "1";
        b.setAttribute("aria-disabled", "true");
        if (!b.hasAttribute("title")) { b.setAttribute("title", dica); b.dataset.soConsultaTitle = "1"; }
      }
    } else {
      for (const b of document.querySelectorAll("[data-so-consulta]")) {
        delete b.dataset.soConsulta;
        if (!b.dataset.semRede) b.removeAttribute("aria-disabled");
        if (b.dataset.soConsultaTitle) { b.removeAttribute("title"); delete b.dataset.soConsultaTitle; }
      }
    }
  };
  marcar();
  if (dica && !obsConsulta && typeof MutationObserver === "function") {
    let agendado = false;
    obsConsulta = new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; marcar(); }); });
    obsConsulta.observe(document.body, { childList: true, subtree: true });
  } else if (!dica && obsConsulta) { obsConsulta.disconnect(); obsConsulta = null; }
}

/* ---- plano 1000 (AS-174): Sair numa aba fecha as outras (computador compartilhado); entrar com outra conta noutra aba recarrega esta ---- */
function ouvirOutrasAbas() {
  // plano 2000d · DU-150: a marca salva noutra aba (o Configurações grava nx-marca-hash) repinta esta sem recarregar
  addEventListener("storage", ev => {
    if (!ev || ev.key !== "nx-marca-hash" || ev.oldValue === ev.newValue || !E.sessao) return;
    E.sessaoPromessa = null;
    lerSessao().then(() => aplicarMarcaCliente()).catch(() => { /* fica a marca de agora */ });
  });
  addEventListener("storage", ev => {
    if (!ev || (ev.key !== "nx-token" && ev.key !== null)) return;
    if (ev.key === null && E.M.dados.lerToken()) return;            // localStorage.clear() de outra coisa, com o token ainda lá
    if (ev.oldValue === ev.newValue && ev.key !== null) return;
    if (!E.sessao && !ev.newValue) return;                          // já está na entrada e o token sumiu: nada a fazer
    if (E.sessao && ev.newValue) {
      // token novo com esta aba aberta: a MESMA conta renovou a sessão noutra aba (segue igual, as chamadas já leem o token novo);
      // OUTRA conta entrou → nada da anterior pode ficar na tela
      const antes = E.sessao.conta.id;
      lerSessao().then(s => { if (E.sessao && s.conta.id !== antes) limparERecarregar(); }).catch(() => { /* sessão inválida: o api.js já cuida */ });
      return;
    }
    if (!ev.newValue) {
      // a outra aba saiu: nada desta conta fica na tela (o aparelho já foi limpo por quem saiu) e a recarga abre a entrada
      E.sessao = null; E.cliente = null;
      if (E.pulso) E.pulso.parar();
      try { E.ui.limpar($("vista")); } catch { /* recarrega do mesmo jeito */ }
      try { history.replaceState(null, "", location.pathname + location.search + "#/login"); } catch { /* ok */ }
    }
    location.reload();
  });
}

/** Plano 1000 (AS-185): o login marcou «aparelho compartilhado» (Lembrar neste aparelho desmarcado). */
const CHAVE_COMPARTILHADO = "nx-app-compartilhado";
function aparelhoCompartilhado() { return LS.lerTxt(CHAVE_COMPARTILHADO) === "1"; }
function definirAparelhoCompartilhado(sim) {
  if (sim) { LS.gravar(CHAVE_COMPARTILHADO, "1"); if (E.cache && typeof E.cache.desligarDisco === "function") E.cache.desligarDisco().catch(() => {}); }
  else LS.apagar(CHAVE_COMPARTILHADO);
}

/* ---- plano 1000b · UB-168: saída por inatividade em aparelho compartilhado (recepção) — 2 h sem toque nem tecla, com aviso 1 min antes ---- */
const OCIOSO_MS = 2 * 3600e3, AVISO_OCIOSO_MS = 60e3;
/** plano 2000d · DU-140: a política da empresa (inatividade_min: 30 / 60 / 120; 0 = nunca) vale em TODOS os aparelhos; sem política, o de sempre:
    só o aparelho compartilhado sai depois de 2 h. → ms ou null (não vigia). */
function limiteOciosidade({ politicaMin = null, compartilhado = false } = {}) {
  const n = Number(politicaMin);
  if (politicaMin !== null && politicaMin !== undefined && politicaMin !== "" && Number.isFinite(n)) return n > 0 ? Math.max(5, Math.min(24 * 60, n)) * 60e3 : null;
  return compartilhado ? OCIOSO_MS : null;
}
function textoTempoOcioso(ms) { const min = Math.round(ms / 60e3); return min >= 60 && min % 60 === 0 ? `${min / 60} h` : `${min} min`; }
/** criarVigiaOciosidade({agora, agendar, cancelar, limite, aviso, aoAvisar, aoSair, aoVoltar}) → {ligar, desligar, tocar, estado}.
    O relógio de verdade (agora) decide: um setTimeout atrasado pela aba em segundo plano não apressa nem adia a saída. */
function criarVigiaOciosidade({ agora = () => Date.now(), agendar = setTimeout, cancelar = clearTimeout, limite = OCIOSO_MS, aviso = AVISO_OCIOSO_MS, aoAvisar, aoSair, aoVoltar } = {}) {
  let ultimo = agora(), timer = null, avisado = false, ligado = false;
  const programar = ms => { cancelar(timer); timer = agendar(passo, Math.max(0, ms)); };
  function passo() {
    if (!ligado) return;
    const parado = agora() - ultimo;
    if (parado >= limite) { ligado = false; avisado = false; if (aoSair) aoSair(); return; }
    if (parado >= limite - aviso) { if (!avisado) { avisado = true; if (aoAvisar) aoAvisar(Math.ceil((limite - parado) / 1000)); } programar(limite - parado); return; }
    programar(limite - aviso - parado);
  }
  return {
    ligar() { ligado = true; avisado = false; ultimo = agora(); programar(limite - aviso); },
    desligar() { ligado = false; avisado = false; cancelar(timer); timer = null; },
    tocar() {
      if (!ligado) return;
      ultimo = agora();
      if (avisado) { avisado = false; if (aoVoltar) aoVoltar(); programar(limite - aviso); }
    },
    get estado() { return { ligado, avisado, ultimo }; },
  };
}
function ligarOciosidade() {
  const comp = aparelhoCompartilhado();
  // plano 2000d · DU-140: a política da empresa (marca da org ou do cliente) decide o tempo; sem ela, só o compartilhado
  const politica = E.cliente && E.cliente.inatividade_min !== undefined ? E.cliente.inatividade_min : (E.marca && E.marca.inatividade_min !== undefined ? E.marca.inatividade_min : null);
  const limite = limiteOciosidade({ politicaMin: politica, compartilhado: comp });
  if (E.ocioso && E.ocioso.limite === limite && limite) return;   // sessão revalidada pela rede não é uso: o relógio que já corre continua
  if (E.ocioso) { E.ocioso.desligar(); E.ocioso = null; }
  if (!limite) return;
  let aviso = null;
  const fecharAviso = () => { if (aviso) { aviso.fechar("acao"); aviso = null; } };
  const comPin = () => temPinDeBloqueio();
  E.ocioso = criarVigiaOciosidade({
    limite,
    aoAvisar: () => {
      // plano 2000d · DU-141: com PIN definido neste aparelho, a tela é bloqueada (não sai da conta)
      aviso = E.ui.toast(comPin() ? "Por segurança, a tela será bloqueada em 1 minuto por falta de uso." : `Por segurança, este aparelho sai da conta em 1 minuto por falta de uso.`, { tipo: "aten", ms: 0, fixo: true,
        acao: { rotulo: "Continuar conectado", fn: () => { if (E.ocioso) E.ocioso.tocar(); } }, aoFechar: () => { aviso = null; } });
    },
    aoVoltar: fecharAviso,
    aoSair: async () => {
      fecharAviso();
      if (!E.sessao) return;
      if (comPin()) { bloquearTela(); return; }
      if (await sair({ perguntar: false })) E.ui.toast(`Você saiu depois de ${textoTempoOcioso(limite)} sem uso. Entre de novo para continuar.`, { tipo: "info", ms: 0 });
    },
  });
  E.ocioso.limite = limite;
  E.ocioso.ligar();
}

/* ---- plano 2000d · DU-141: bloquear a tela com PIN (recepção) — cobre o app sem encerrar a sessão; 5 erros = sair ---- */
const CHAVE_PIN = "nx-pin-bloqueio", PIN_MAX_ERROS = 5;
function chavePin() { return `${CHAVE_PIN}:${E.sessao && E.sessao.conta ? E.sessao.conta.id : "-"}`; }
function temPinDeBloqueio() { return !!LS.lerTxt(chavePin()); }
async function resumoPin(pin, sal) {
  const txt = `${sal}:${String(pin)}`;
  try {
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder === "function") {
      const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* sem subtle (http): cai no simples */ }
  let h = 0; for (const c of txt) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return `s${h.toString(16)}`;
}
async function definirPinDeBloqueio() {
  const { ui } = E;
  let janela = null;
  const campo = ui.campo({ rotulo: "PIN de 4 números", nome: "pin", inputmode: "numeric", autocomplete: "off", max: 4, obrigatorio: true, ajuda: "Vale só neste aparelho. Desbloqueia a tela sem digitar a senha." });
  const inp = campo.querySelector("input"); if (inp) inp.setAttribute("type", "password");
  return new Promise(resolve => {
    janela = ui.modal({ titulo: "Bloquear a tela com PIN", largura: "p", protegerTexto: false, corpo: ui.h("div", { class: "pilha-p" }, campo),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", fn: () => { resolve(false); return true; } },
        { rotulo: "Salvar PIN", tipo: "primario", fn: async () => {
          const v = String(inp ? inp.value : "").replace(/\D/g, "");
          if (v.length !== 4) { ui.marcarErro(janela.el || campo.parentNode, "pin", "Digite exatamente 4 números."); return false; }
          LS.gravar(chavePin(), await resumoPin(v, E.sessao.conta.id));
          ui.toast("PIN salvo. Use «Bloquear a tela» na paleta ou espere o tempo sem uso.", { tipo: "ok" });
          resolve(true); return true;
        } }] });
  });
}
function bloquearTela() {
  const { ui } = E;
  if (!E.sessao || document.querySelector(".tela-bloqueio")) return null;
  if (!temPinDeBloqueio()) { definirPinDeBloqueio().then(ok => { if (ok) bloquearTela(); }); return null; }
  const app = $("app");
  let erros = 0;
  const campo = ui.campo({ rotulo: "PIN", nome: "pin", inputmode: "numeric", autocomplete: "off", max: 4 });
  const inp = campo.querySelector("input"); if (inp) inp.setAttribute("type", "password");
  const msg = ui.h("p", { class: "entrar-erro", role: "alert", hidden: true });
  const form = ui.h("form", { class: "pilha-p", novalidate: true }, campo, msg, ui.h("button", { type: "submit", class: "bt bt-prim bt-bloco" }, "Desbloquear"));
  const sairBt = ui.h("button", { type: "button", class: "link" }, "Sair da conta");
  const tela = ui.h("div", { class: "tela-bloqueio", role: "dialog", "aria-modal": "true", "aria-labelledby": "t-bloqueio" },
    ui.h("div", { class: "tela-bloqueio-cartao" }, ui.icone("cadeado"), ui.h("h2", { id: "t-bloqueio" }, "Tela bloqueada"),
      ui.h("p", { class: "sub" }, `${E.sessao.conta.nome || "Conta"} continua conectada. Digite o PIN para voltar.`), form, sairBt));
  const destravar = () => { tela.remove(); if (app) { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); } if (E.ocioso) E.ocioso.ligar(); };
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = String(inp ? inp.value : "").replace(/\D/g, "");
    if (v.length === 4 && await resumoPin(v, E.sessao.conta.id) === LS.lerTxt(chavePin())) { destravar(); return; }
    erros += 1;
    if (inp) inp.value = "";
    if (erros >= PIN_MAX_ERROS) { tela.remove(); if (app) { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); } await sair({ perguntar: false }); return; }
    msg.textContent = `PIN incorreto. ${PIN_MAX_ERROS - erros} tentativa${PIN_MAX_ERROS - erros === 1 ? "" : "s"} antes de sair da conta.`; msg.hidden = false;
    if (inp) inp.focus();
  });
  sairBt.addEventListener("click", async () => { tela.remove(); if (app) { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); } await sair({ perguntar: false }); });
  if (app) { app.setAttribute("inert", ""); app.setAttribute("aria-hidden", "true"); }
  document.body.appendChild(tela);
  if (E.ocioso) E.ocioso.desligar();
  setTimeout(() => { if (inp) inp.focus(); }, 0);
  return tela;
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
/** O que o service worker pede à aba aberta: abrir a conversa do aviso (plano 1500c · UCC-123); plano 2000d · DU-253: «Marcar como lida» no próprio
    aviso (a aba tem a sessão); DU-254: a inscrição de push renovada pelo navegador volta ao servidor (melhor esforço: sem a RPC, nada muda). */
function mensagemDoSW(m) {
  if (!m || typeof m !== "object") return null;
  if (m.tipo === "abrir" && /^#\//.test(String(m.hash || ""))) { navegar(m.hash); return "abrir"; }
  if (m.tipo === "ler" && /^[A-Za-z0-9_-]{1,64}$/.test(String(m.conversa || "")) && E.api && E.cliente) {
    Promise.resolve().then(() => (E.api.rpcC ? E.api.rpcC("nx_cv_marcar_lida", { p_conversa: m.conversa }) : E.api.rpc("nx_cv_marcar_lida", { p_conversa: m.conversa })))
      .then(() => { if (E.pulso && typeof E.pulso.agora === "function") E.pulso.agora(); }).catch(() => { /* fica não lida */ });
    return "ler";
  }
  if (m.tipo === "push-renovar" && m.inscricao && typeof m.inscricao === "object" && E.api && E.sessao) {
    E.api.rpc("nx_push_inscrever", { p_inscricao: m.inscricao }).catch(() => { /* servidor sem push: nada muda */ });
    return "push-renovar";
  }
  return null;
}
/** Plano 1000b · UB-126: ícone do aviso de área de trabalho — o da marca já rasterizado, o favicon/logo da marca ou o ícone empacotado do app. */
function iconeDoAviso() {
  if (E.iconeAviso) return E.iconeAviso;
  const m = E.marca || {};
  const u = m.favicon || m.logo_cliente || m.logo;
  if (typeof u === "string" && /^(https:|data:image[/])/.test(u)) return u;
  try { return new URL("icones/icon-192.png", location.href).href; } catch { return undefined; }
}
async function atualizarManifestoApp() {
  const P = E.pwaMod;
  if (!P || !E.marca) return;
  const seq = ++manifestoEstado.seq;
  try {
    const base = new URL("./", location.href).href;
    // plano 2000d · DU-153: a descrição da revenda (login_texto) em vez do slogan da plataforma; DU-445: o nome no ícone escolhido pela revenda
    const nome = E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace, texto: E.marca && E.marca.login_texto, curto: E.marca && E.marca.nome_curto });
    const fundo = getComputedStyle(document.documentElement).getPropertyValue("--c-fundo").trim() || E.M.tema.FUNDOS_ESQUEMA.escuro;
    const m = E.marca;
    let raster = null;
    // plano 2000d · DU-147: o ícone próprio do app (icone_app) vence o logo — logo largo fica ilegível no ícone do celular
    try { raster = await P.rasterizarIcones({ origem: m.icone_app || m.logo_cliente || m.favicon || m.logo || null, fundo }); }
    catch (e) { raster = null; console.warn("ícones da marca indisponíveis; ficam os empacotados", e && e.message); }   // sem logo próprio ou imagem sem CORS
    if (seq !== manifestoEstado.seq) return;
    // plano 2000d · DU-261: atalhos do ícone pelos módulos da empresa (com o nome da vertical); DU-446: recebe «Compartilhar» do celular
    const atalhos = P.atalhosDoIcone ? P.atalhosDoIcone(E.cliente && E.cliente.modulos, mod => { try { return mod === "crm" && E.M.vocab ? E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico").crm : null; } catch { return null; } }) : [];
    const manifesto = P.construirManifesto({ nome, base, workspace: E.workspace, rota: E.workspace ? E.M.rotas.produtoInicial(E.workspace) : null, fundo,
      icones: raster ? P.iconesDeRaster(raster) : P.iconesPadrao(base), atalhos, compartilhar: !!E.sessao });
    if (!P.aplicarManifesto({ manifesto, estado: manifestoEstado })) throw new Error("manifesto_nao_aplicado");
    E.iconeAviso = raster ? raster.apple180 : null;   // plano 1000b · UB-126: o aviso de área de trabalho usa o ícone da marca
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
    // plano 2000d · DU-258: cada passo com o desenho do botão e onde ele fica (a pessoa procura a figura, não o nome)
    const passos = E.pwaMod.PASSOS_IOS_VISUAL || E.pwaMod.PASSOS_IOS.map(texto => ({ texto }));
    ui.modal({ titulo: "Instalar no iPhone ou iPad", largura: "p", protegerTexto: false,
      corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", null, "O iPhone instala pelo menu do Safari:"),
        ui.h("ol", { class: "instalar-passos instalar-passos-ios" }, passos.map(p => ui.h("li", null,
          p.icone ? ui.h("span", { class: "instalar-passo-ico", "aria-hidden": "true" }, ui.icone(p.icone)) : null,
          ui.h("span", { class: "instalar-passo-txt" }, p.texto, p.onde ? ui.h("small", null, p.onde) : null))))),
      acoes: [{ rotulo: "Entendi", tipo: "primario" }] });
    return;
  }
  // plano 1500c · UCC-061: Firefox no computador — o botão não fica mudo: diz o que dá para fazer
  if (modo === "firefox") {
    const [intro, ...passos] = E.pwaMod.PASSOS_FIREFOX;
    ui.modal({ titulo: "Usar como app no Firefox", largura: "p", protegerTexto: false,
      corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", null, intro), ui.h("ol", { class: "instalar-passos" }, passos.map(t => ui.h("li", null, t)))),
      acoes: [{ rotulo: "Entendi", tipo: "primario" }] });
  }
}

/** Plano 1000 (AS-262): no celular, quem não abre o menu da conta não descobre que dá para instalar. Na 3ª abertura (com sessão) o app sugere UMA
    vez, num aviso com «Instalar» que some sozinho; fechar no X (ou instalar) encerra a sugestão para sempre neste aparelho. */
const CHAVE_ABERTURAS = "nx-app-aberturas", CHAVE_SUGESTAO_INSTALAR = "nx-app-sugeriu-instalar";
// plano 1500c · UCC-060: o computador também recebe a sugestão (só quando o navegador instala de verdade: evento nativo ou iPhone/iPad)
function deveSugerirInstalacao({ aberturas, jaSugeriu, toque, modo }) { return (modo === "evento" || modo === "ios") && !jaSugeriu && aberturas >= 3 && (toque || modo === "evento"); }
function sugerirInstalacao() {
  let toque = false;
  try { toque = typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { toque = false; }
  if (!E.sessao) return;
  const aberturas = (Number(LS.lerTxt(CHAVE_ABERTURAS)) || 0) + 1;
  LS.gravar(CHAVE_ABERTURAS, String(Math.min(aberturas, 99)));
  // o beforeinstallprompt pode chegar depois do boot: confere de novo em alguns segundos
  setTimeout(() => {
    if (!deveSugerirInstalacao({ aberturas, jaSugeriu: !!LS.lerTxt(CHAVE_SUGESTAO_INSTALAR), toque, modo: modoInstalacao() }) || !E.sessao) return;
    LS.gravar(CHAVE_SUGESTAO_INSTALAR, "1");
    E.ui.toast(toque ? "Use como app: instale na tela do celular para abrir com um toque." : "Use como app: instale no computador e abra numa janela própria, sem procurar a aba.", { tipo: "info", ms: 12000, acao: { rotulo: "Instalar", fn: () => instalarApp() } });
  }, 8000);
}

/* ============================================================
   PWA (M12): service worker, versão nova sem aba quebrada — depois do boot, nada disto atrasa a primeira pintura
   ============================================================ */
/** TODOS os .js e .css de web/app que o app carrega (menos o sw.js): as telas e também os pedaços que elas importam por conta própria (cv-*, crm-*,
    auto-*, gráficos, *-config). Lista fixa, conferida com a pasta por testes/shell.teste.mjs: arquivo novo que não entrar aqui quebra o teste. */
const ARQUIVOS_DO_APP = [
  "antes.js", "app.js", "api.js", "ui.js", "tema.js", "vocab.js", "rotas.js", "pulso.js", "rede.js", "rascunho.js", "cache.js", "comandos.js",
  "prontos.js", "pwa.js", "paleta.js", "login.js", "inicio.js", "config.js", "admin.js", "ajuda.js",   // plano 1500c · UCC-038: Central de ajuda
  "conversas.js", "cv-logica.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js", "cv-config.js",
  "crm.js", "crm-logica.js", "crm-kanban.js", "crm-listas.js", "crm-visoes.js", "crm-negocio.js", "crm-tarefas.js", "crm-importar.js", "crm-config.js",
  "agenda.js", "agenda-config.js", "rastreio-config.js",
  "anuncios.js", "ads-config.js", "relatorios.js", "rel-logica.js", "graficos.js",
  "automacoes.js", "auto-logica.js", "auto-catalogo.js", "auto-pecas.js", "auto-editor.js",
  "app.css", "shell.css", "conversas.css", "crm.css", "agenda.css", "relatorios.css", "automacoes.css", "inicio.css", "config.css",
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

/** Plano 1000 (AS-177): os pedaços de cada tela (o resto do app vai sempre). Uma tela que a pessoa não pode abrir (papel, plano, prontos.js) não
    é baixada para o aparelho dela: o atendente não leva admin.js nem o editor de automações. Configurações vão para todos (o hub abre para todos). */
const ARQUIVOS_POR_TELA = Object.freeze({
  admin: ["admin.js"],
  automacoes: ["automacoes.js", "auto-logica.js", "auto-catalogo.js", "auto-pecas.js", "auto-editor.js", "automacoes.css"],
  anuncios: ["anuncios.js"],
  conversas: ["conversas.js", "cv-logica.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js", "conversas.css"],
  crm: ["crm.js", "crm-kanban.js", "crm-listas.js", "crm-visoes.js", "crm-negocio.js", "crm-tarefas.js", "crm-importar.js", "crm.css"],
  agenda: ["agenda.js", "agenda.css"],
  relatorios: ["relatorios.js"],
});
const RAIZ_POR_TELA = Object.freeze({ anuncios: ["nucleo.js"] });
/** urlsPrecache() filtrada para ESTA pessoa; com «economia de dados» ligada (navigator.connection.saveData) nada além do que a página já usou. */
function urlsPrecacheDoAparelho() {
  try {
    const con = navigator.connection;
    if (con && con.saveData) return [];
    if (!E.sessao || !E.M.rotas) return urlsPrecache();
    const op = opcoesAcesso();
    const fora = new Set(), foraRaiz = new Set();
    for (const [tela, arquivos] of Object.entries(ARQUIVOS_POR_TELA)) {
      if (E.M.rotas.acessoRota(tela, op) === "ok") continue;
      for (const a of arquivos) fora.add(a);
      for (const a of RAIZ_POR_TELA[tela] || []) foraRaiz.add(a);
    }
    return [...ARQUIVOS_DO_APP.filter(a => !fora.has(a)).map(urlArq), ...ARQUIVOS_DA_RAIZ.filter(a => !foraRaiz.has(a)).map(urlArqRaiz)];
  } catch { return urlsPrecache(); }
}

/** import() que falhou por arquivo que não existe mais naquela URL (a versão mudou por baixo da aba). */
function ehFalhaDeImport(e) { return /dynamically imported module|importing a module script|module script failed|error loading dynamically/i.test(String((e && e.message) || "")); }

/** Transição de rota (plano 50 · A12): a vista entra com fade + 6 px em 180 ms (token --t-rota, zerado com movimento reduzido).
    A classe sai no fim da animação; trocar de tela duas vezes seguidas reinicia o movimento (reflow forçado). O foco no título já é do focarTitulo. */
function transicaoRota(vista) {
  if (!vista || !vista.classList) return;
  vista.classList.remove("rota-entra");
  void vista.offsetWidth;
  vista.classList.add("rota-entra");
  vista.addEventListener("animationend", () => vista.classList.remove("rota-entra"), { once: true });
}

/** Por quanto tempo um campo mexido segura a atualização automática (a faixa «Atualizar» continua lá para quem quiser aplicar na hora). */
const EDICAO_RECENTE_MS = 30 * 60 * 1000;

/** A pessoa digitou ou escolheu algo num campo desta tela. Busca não conta: não é trabalho que se perde. */
function marcarEdicao(ev) {
  const alvo = ev && ev.target;
  if (!alvo || alvo.type === "search") return;
  // plano 1000b · UB-123: interruptor que grava na hora (Usuários, Avisos) não é trabalho a perder — não segura a atualização por 30 min
  if (alvo.getAttribute && (alvo.getAttribute("role") === "switch" || (alvo.closest && alvo.closest("[data-salva-na-hora]")))) return;
  E.editouEm = Date.now();
  // AS-191: o pedido de armazenamento persistente (o Firefox pergunta à pessoa) sai na 1ª vez que um texto longo — rascunho — é escrito, não no login
  if (E.sessao && (alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) pedirArmazenamentoPersistente();
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
      if (E.sessao && !$("app").hidden) avisarNovidades();   // plano 1500c · UC-037: o pwa.js chegou depois do mostrarApp
      // plano 1500c · UCC-052: uma leitura do versao.json (60 s) para a faixa de versão e a conferência de migração
      if (typeof pwa.criarLeitorVersao === "function") E.leitorVersao = pwa.criarLeitorVersao(() => pwa.buscarVersaoComPrazo((...a) => fetch(...a), new URL(`versao.json?t=${Date.now()}`, location.href).href));
      E.pwa = pwa.iniciar({ versao: VERSAO, ui: E.ui, alvo: $("faixas-sistema"), produto: () => E.produto || "Órbita", ocupado: ocupadoParaAtualizar, urlsPrecache: urlsPrecacheDoAparelho, leitorVersao: E.leitorVersao || null,
        aoVerificar: () => conferirMigracao() });   // plano 1500c · UCC-129: mesmo relógio da versão
      // plano 1500c · UCC-123: o service worker pede para abrir a conversa do aviso clicado (aba já aberta)
      try { if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => mensagemDoSW(e.data || {})); } catch { /* sem SW */ }
      agendarManifesto();
      conferirMigracao();   // A4: a sessão pode ter chegado antes do pwa.js (que tem a comparação de migrações)
      // plano 1000b · UB-131: a faixa de migração reconfere a cada 10 min com a aba à vista (some quando o banco for atualizado)
      // plano 1500c · UCC-129: agora pelo relógio do pwa.js (aoVerificar, acima) — eram dois setInterval de 10 min
      sugerirInstalacao();
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
  LS.gravar("nx-app-marca", { host: location.host, org: E.marcaPublica ? E.marcaPublica.org.slug : null, vars: t.vars, produto: m.produto, favicon: m.favicon, hash: E.M.tema.hashCurto(t.vars) });
}

/** O aparelho está no modo escuro? (prefers-color-scheme) */
function sistemaEscuro() {
  try { return typeof matchMedia === "function" && !!matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}
/** O que a pessoa ESCOLHEU: "auto" (padrão de quem nunca escolheu — plano 1000 · AS-189), "claro", "escuro" ou "marca". */
function esquemaEscolhido() {
  const t = E.M.tema;
  const salvo = LS.lerTxt(CHAVE_ESQUEMA);
  return t && t.ESQUEMAS && Object.hasOwn(t.ESQUEMAS, salvo) ? salvo : "auto";
}
/** O esquema que vale agora: o escolhido, ou o do aparelho quando é «Automático». */
function esquemaPreferido() {
  const e = esquemaEscolhido();
  return e === "auto" ? (sistemaEscuro() ? "escuro" : "claro") : e;
}
/** «Automático»: o aparelho trocou de claro para escuro (fim de tarde, modo noturno) → o app acompanha sem recarregar. */
function seguirEsquemaDoSistema() {
  try {
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    if (!mq || typeof mq.addEventListener !== "function") return;
    mq.addEventListener("change", () => {
      if (esquemaEscolhido() !== "auto" || !E.M.tema) return;
      const m = E.marca || E.M.tema.marcaEfetiva(marcaOrgSessao(), {}, {});
      pintarMarca(m, { guardar: true });
    });
  } catch { /* navegador antigo: vale o esquema da abertura */ }
}

function atualizarBotaoTema() {
  const b = $("bt-tema");
  if (!b || !E.M.tema) return;
  const escolhido = esquemaEscolhido(), modo = esquemaPreferido();
  const nomes = { claro: "claro", escuro: "escuro", marca: "da marca" };
  const rotulo = escolhido === "auto" ? `Aparência automática (${nomes[modo]}, como o aparelho). Escolher tema` : `Aparência ${nomes[modo]}. Escolher tema`;
  b.setAttribute("aria-label", rotulo);
  b.title = rotulo;
  const use = b.querySelector("use");
  if (use) use.setAttribute("href", `#i-${modo === "escuro" ? "lua" : modo === "marca" ? "pincel" : "sol"}`);
}

function abrirMenuTema(ancora) {
  if (!E.ui || !E.M.tema) return;
  const modo = esquemaEscolhido();
  const opcoes = [["auto", "Automático (do aparelho)", "reabrir"], ["claro", "Tema claro", "sol"], ["escuro", "Tema escuro", "lua"], ["marca", "Cores da empresa (fundo da marca)", "pincel"]];   // plano 1000b · UB-272
  E.ui.menu(ancora, opcoes.map(([id, rotulo, icone]) => ({
    rotulo: modo === id ? `${rotulo} · atual` : rotulo,
    icone: modo === id ? "check" : icone,
    fn: () => definirEsquema(id),
  })));
}

function definirEsquema(modo) {
  if (!E.M.tema || !(modo === "auto" || Object.hasOwn(E.M.tema.ESQUEMAS, modo))) return;
  LS.gravar(CHAVE_ESQUEMA, modo);
  const m = E.marca || E.M.tema.marcaEfetiva(marcaOrgSessao(), {}, {});
  pintarMarca(m, { guardar: true });
  atualizarBotaoTema();
  const nome = { auto: "automático (segue o aparelho)", claro: "claro", escuro: "escuro", marca: "da empresa" }[modo];
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
  // plano 1000b · UB-181: são duas metas (claro/escuro do aparelho) no index.html — o tema escolhido vale para as duas
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", t.vars["--c-fundo"]);
  pintarLogoShell();
  atualizarBotaoTema();
  atualizarTitulo();
  // A5: o hash das vars gravadas acompanha o cache; o antes.js só pinta o tema da empresa quando ele bate (entrada velha ou mexida é ignorada)
  if (guardar) LS.gravar("nx-app-marca", { host: location.host, org: E.marcaPublica ? E.marcaPublica.org.slug : null, vars: t.vars, produto: m.produto, favicon: m.favicon, hash: tema.hashCurto(t.vars) });
  agendarManifesto();
  // plano 1500c · UCC-049: a página «Sem conexão» do service worker sai com a cor e o nome desta marca
  try {
    const ctl = typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller;
    // plano 2000d · DU-251: o ícone da marca vai junto (o aviso de push de uma revenda não sai com o ícone da plataforma)
    if (ctl) ctl.postMessage({ tipo: "marca", fundo: t.vars["--c-fundo"], texto: t.vars["--c-texto"], produto: m.produto || "Órbita", icone: (() => { const u = m.favicon || m.logo_cliente || m.logo; return typeof u === "string" && /^https:/.test(u) ? u : null; })() });
  } catch { /* sem service worker */ }
  if (cacheCliente) LS.gravar(`nx-app-tema-${cacheCliente.id}`, { ...cacheCliente.dados, vars: t.vars, hash: tema.hashCurto(t.vars), host: location.host });
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
  // M18: os «Recentes» da paleta têm nomes de pessoas: saem com a sessão. Plano 1000 (pedido de CRM/Início/Conversas/Automações): também os
  // filtros e buscas guardados por conta (podem ter nome e telefone digitados), o histórico dos números do Início, os últimos comandos e os
  // rascunhos/pedidos de IA das Automações. Preferência de aparência (tema, menu recolhido, densidade) fica: não é dado de ninguém.
  try {
    // AS-192: «Sair» da janela de sessão expirada guarda os rascunhos (inclusive os das Automações) para a MESMA conta
    const manter = E.manterRascunhos || !!LS.lerTxt(CHAVE_RASCUNHOS_DE);   // o próximo login decide (adotarSessao): mesma conta fica, outra apaga
    const prefixos = [E.M.comandos ? E.M.comandos.PREFIXO_RECENTES : "nx-rec:", ...PREFIXOS_DA_CONTA].filter(p => !(manter && p === "nx-au-rasc:"));
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && prefixos.some(p => k.startsWith(p))) localStorage.removeItem(k); }
    // plano 1000b · UB-230: os rascunhos das Automações também moram no sessionStorage (nx-au-rasc:*) — o mesmo laço, a mesma regra do «manter»
    if (typeof sessionStorage !== "undefined" && sessionStorage) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && prefixos.some(p => k.startsWith(p))) sessionStorage.removeItem(k); }
    }
  } catch { /* sem armazenamento: nada a apagar */ }
  LS.apagar(CHAVE_CONTA);
  E.sessaoGuardada = null;
  return feito;
}
/** Chaves do localStorage com dado da conta que saem no logout, na queda de sessão e na troca de conta (plano 1000, pedido das frentes). */
const PREFIXOS_DA_CONTA = Object.freeze(["nx-app-crm-kb-", "nx-app-crm-ct-", "nx-app-crm-fr-", "nx-app-visoes-v1:", "nx-ini-hist:", "nx-ini-kpis:", "nx-ini-blocos:",
  "nx-cv-filtro:", "nx-cmd:", "nx-au-rasc:", "nx-au-ia-recentes:", "nx-canal-hist:",
  // plano 1000b · UB-280: ordem das Automações e passos pulados do «Primeiros passos» levam id da conta e da empresa (são só preferências)
  "nx-au-ordem:", "nx-onb:"]);
/** Limpa o aparelho e espera a limpeza assentar (no máximo 0,8 s): um location.reload() logo em seguida cortaria a transação do IndexedDB. */
function limparComPrazo(ms = 800) {
  return Promise.race([limparDadosDoAparelho(), new Promise(r => setTimeout(r, ms))]);
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
    uso). Uma vez por aparelho, na 1ª vez que a fila ou um rascunho é usado (plano 1000 · AS-191: logo depois do login o Firefox perguntava sem
    contexto) — marcarEdicao (texto longo digitado) e ctx.armazenamentoPersistente() (Conversas, ao pôr a 1ª mensagem na fila). Aparelho
    compartilhado nunca pede. */
function pedirArmazenamentoPersistente() {
  try {
    if (aparelhoCompartilhado() || LS.lerTxt("nx-app-persistir") || !navigator.storage || typeof navigator.storage.persist !== "function") return;
    LS.gravar("nx-app-persistir", "1");
    Promise.resolve(navigator.storage.persist()).catch(() => {});
  } catch { /* sem suporte: fica como está */ }
}

/**
 * Chamado pelo api.js quando o servidor diz sessao_invalida. Devolve (Promise de) true quando a pessoa entrou de novo: as LEITURAS que
 * falharam esperam por isso e se repetem com o token novo. A tela NÃO é desmontada e nada do que foi digitado se perde: abre por cima
 * uma janela «Sua sessão expirou» com o e-mail preenchido. Na abertura (ainda sem sessão) não há tela a preservar: volta ao login como antes.
 */
/** plano 2000d · DU-400: por que a sessão caiu — o servidor manda no hint (encerrada_admin, outro_aparelho, senha_trocada); sem motivo, «expirou». */
const MOTIVOS_QUEDA = Object.freeze({
  encerrada_admin: { titulo: "Sua sessão foi encerrada", texto: "Um administrador da empresa encerrou esta sessão. Entre de novo para continuar." },
  outro_aparelho: { titulo: "Sua sessão foi encerrada", texto: "A sessão foi encerrada em outro aparelho (em «Sessões abertas»). Entre de novo para continuar." },
  senha_trocada: { titulo: "Sua senha foi trocada", texto: "A senha desta conta mudou e as sessões antigas foram encerradas. Entre com a senha nova." },
});
function textoSessaoCaiu(e) {
  const bruto = e && (e.hint || (e.detalhe && typeof e.detalhe === "object" && e.detalhe.motivo) || e.motivo);
  const m = String(bruto || "").trim().toLowerCase().replace(/[^a-z_]/g, "");
  const alias = { admin: "encerrada_admin", encerrada: "encerrada_admin", revogada: "encerrada_admin", sessao_encerrada: "encerrada_admin", senha: "senha_trocada" };
  const chave = Object.hasOwn(MOTIVOS_QUEDA, m) ? m : alias[m];
  if (chave) return { motivo: chave, ...MOTIVOS_QUEDA[chave] };
  return { motivo: "expirou", titulo: "Sua sessão expirou", texto: "Entre para continuar de onde parou. O que você digitou fica guardado." };
}
function sessaoCaiu(e = null) {
  E.motivoQueda = textoSessaoCaiu(e);   // plano 2000d · DU-400
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
    const queda = E.motivoQueda || (typeof textoSessaoCaiu === "function" ? textoSessaoCaiu(null) : { motivo: "expirou", titulo: "Sua sessão expirou", texto: "Entre para continuar de onde parou. O que você digitou fica guardado." });   // plano 2000d · DU-400
    const r = await ui.modal({
      titulo: queda.titulo, largura: "p", fecharFora: false, protegerTexto: false,
      descricao: queda.motivo === "expirou" ? queda.texto : `${queda.texto} O que você digitou fica guardado.`,
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
    if (r === "ok") {
      // plano 1000b · UB-010: o pulso parou no sessao_invalida — sem reiniciar, sino, não lidas e número caído ficavam congelados
      if (E.pulso && E.cliente) E.pulso.iniciar();
      atualizarSinoUI();
      ui.toast("Sessão renovada. Pode continuar.", { tipo: "ok" });
      return true;
    }
    if (r === "outra") {
      if (E.rascunhos) E.rascunhos.apagarTudo();
      // plano 1500c · UCC-027: o IndexedDB da conta anterior termina de ser limpo ANTES do reload (sem await, a transação podia ser cortada)
      await limparComPrazo(1500);
      apagarFilaDeSaida();
      try { sessionStorage.removeItem("nx-app-destino"); } catch { /* ok */ }
      location.hash = "#/";
      location.reload();
      return false;
    }
    // AS-192: a janela prometeu guardar o que foi digitado — os rascunhos ficam para a mesma conta (somem se outra conta entrar)
    if (r === "sair") { if (await sair({ manterRascunhos: true })) return false; continue; }
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
  reiniciarCanais();                             // revisão: o aviso fixo de número caído não fica na tela de login
  desmontarAtual();
  // plano 2000d · DU-400: a tela de entrar diz o motivo (encerrada por um administrador, em outro aparelho, senha trocada)
  const queda = E.motivoQueda || (typeof textoSessaoCaiu === "function" ? textoSessaoCaiu(null) : { motivo: "expirou", texto: "" });
  E.motivoQueda = null;
  if (!_avisouSessao) { _avisouSessao = true; E.ui.toast(queda.motivo === "expirou" ? "Sua sessão expirou. Entre de novo." : queda.texto, { tipo: queda.motivo === "expirou" ? "info" : "aten", ms: queda.motivo === "expirou" ? undefined : 12000 }); setTimeout(() => { _avisouSessao = false; }, 4000); }
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
    c.ativo = c.ativo !== false;                                  // contrato 9 (A4): «Cliente ativo» do painel; a RPC antiga não manda = ativo
    c.canais = Array.isArray(c.canais) ? c.canais : null;         // A10: estado dos números, se a sessão trouxer
  }
  s.migracao = typeof s.migracao === "string" ? s.migracao : null;   // contrato 9 (A4): última migração aplicada no banco
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
    cli ? [cli.id, cli.papel, [...(cli.modulos || [])].sort(), cli.status, cli.teste_ate || null, cli.plano || null, cli.vertical || null, cli.ativo !== false] : null]);
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
  }).catch(e => {
    // revisão: a sessão guardada pintou a empresa como ativa, mas a rede diz que ela foi PAUSADA — o erro era engolido e o app seguia
    // aberto com a cópia antiga. Agora: bloqueio honesto na hora e a cópia da sessão deixa de valer (a próxima abertura lê a rede)
    if (e && e.codigo === "cliente_pausado") {
      LS.apagar(CHAVE_CONTA);
      if (E.cliente) aoErroApi(e);
    }
  });
}

/** Adota a sessão lida e busca as imagens da org (depende da marca pública já resolvida). */
async function adotarSessao(s, { forcarImagens = false } = {}) {
  E.sessao = s;
  // AS-255: só a conta da plataforma vê o código técnico de um erro desconhecido
  try { if (E.M.api && typeof E.M.api.mostrarCodigoTecnico === "function") E.M.api.mostrarCodigoTecnico(!!(s.conta && s.conta.super)); } catch { /* ok */ }
  // plano 1000b · UB-277: o sem_permissao do administrador da empresa manda falar com o suporte (não «com o administrador»)
  try { if (E.M.api && typeof E.M.api.definirPapelDasMensagens === "function") E.M.api.definirPapelDasMensagens(() => papelAtual()); } catch { /* ok */ }
  // plano 2000d · DU-157: as frases de erro usam a palavra da vertical (orçamentos na oficina, visita em vez de consulta)
  try { if (E.M.api && typeof E.M.api.definirVocabDasMensagens === "function" && E.M.vocab) E.M.api.definirVocabDasMensagens(() => E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico")); } catch { /* ok */ }
  // AS-192: rascunhos guardados por um «Sair» da sessão expirada são de outra conta → saem antes de a tela nascer
  const donoRascunhos = LS.lerTxt(CHAVE_RASCUNHOS_DE);
  if (donoRascunhos && s.conta && donoRascunhos !== s.conta.id) {
    if (E.rascunhos) E.rascunhos.apagarTudo();
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("nx-au-rasc:")) localStorage.removeItem(k); } } catch { /* ok */ }
  }
  if (donoRascunhos) LS.apagar(CHAVE_RASCUNHOS_DE);
  ligarOciosidade();    // plano 1000b · UB-168: aparelho compartilhado sai sozinho depois de 2 h sem uso
  conferirMigracao();   // A4: front novo × banco velho (sem await: a faixa chega quando o versao.json responder)
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

/** Plano 1000 (AS-173): quantas mensagens a fila de saída das Conversas (IndexedDB «orbita-fila», loja «saida») ainda guarda sem confirmação.
    Nunca cria o banco (quem nunca abriu Conversas não ganha um banco vazio) e nunca espera mais de 1,5 s: na dúvida, 0. */
async function contarFilaDeSaida() {
  try {
    if (typeof indexedDB === "undefined" || !indexedDB || typeof indexedDB.open !== "function") return 0;
    if (typeof indexedDB.databases === "function") {
      const l = await indexedDB.databases();
      if (Array.isArray(l) && !l.some(d => d && d.name === "orbita-fila")) return 0;
    }
    return await new Promise(resolve => {
      let novo = false, fim = false;
      const acabar = n => { if (fim) return; fim = true; clearTimeout(t); resolve(n); };
      const t = setTimeout(() => acabar(0), 1500);
      const req = indexedDB.open("orbita-fila");
      req.onupgradeneeded = () => { novo = true; try { req.transaction.abort(); } catch { /* o onerror responde */ } };
      req.onerror = req.onblocked = () => acabar(0);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (novo || !db.objectStoreNames.contains("saida")) { db.close(); acabar(0); return; }
          const c = db.transaction("saida", "readonly").objectStore("saida").count();
          c.onsuccess = () => { db.close(); acabar(Number(c.result) || 0); };
          c.onerror = () => { db.close(); acabar(0); };
        } catch { try { db.close(); } catch { /* ok */ } acabar(0); }
      };
    });
  } catch { return 0; }
}

/** Sair pelo menu, pela paleta ou pela janela de sessão expirada.
    perguntar (padrão): guarda de rota (formulário sem salvar) e fila de saída com mensagem ainda não enviada pedem confirmação (AS-173).
    manterRascunhos (AS-192): a janela «Sua sessão expirou» prometeu guardar o que foi digitado — os rascunhos ficam no aparelho e só saem
    quando OUTRA conta entrar (adotarSessao confere). */
async function sair({ perguntar = true, manterRascunhos = false } = {}) {
  if (perguntar) {
    if (!(await podeSairDaRota({ motivo: "sair" }))) return false;
    const n = await contarFilaDeSaida();
    if (n > 0 && !(await E.ui.confirmar({ titulo: "Mensagens não enviadas", perigo: true, rotulo: "Sair e descartar", icone: "alerta",
      texto: `${n === 1 ? "1 mensagem ainda não foi enviada" : `${n} mensagens ainda não foram enviadas`} (sem internet ou com falha). Se sair agora, ${n === 1 ? "ela é descartada" : "elas são descartadas"} deste aparelho.` }))) return false;
  }
  // plano 1500c · UCC-028: «Saindo…» na hora e no máximo 3 s de espera pelo nx_sair (antes, até 20 s sem retorno); o pedido sai com keepalive e
  // termina mesmo que a página vá para o login antes da resposta
  const aviso = E.ui.toast("Saindo…", { tipo: "info", ms: 0 });
  await esperarNoMaximo(E.api.rpc("nx_sair", {}, { keepalive: true }), SAIR_PRAZO_MS);
  try { aviso.fechar("sistema"); } catch { /* ok */ }
  if (E.ocioso) { E.ocioso.desligar(); E.ocioso = null; }   // UB-168
  E.manterRascunhos = !!manterRascunhos;
  if (manterRascunhos && E.sessao) { if (E.rascunhos) E.rascunhos.salvarTudo(); LS.gravar(CHAVE_RASCUNHOS_DE, E.sessao.conta.id); }
  else { LS.apagar(CHAVE_RASCUNHOS_DE); if (E.rascunhos) E.rascunhos.apagarTudo(); }   // logout: nenhum rascunho fica no aparelho
  // plano 1000b · UB-135: espera a limpeza do IndexedDB assentar (no máximo 0,8 s) antes de ir ao login — fechar a aba logo depois não corta a transação
  await limparComPrazo();
  E.manterRascunhos = false;
  E.M.dados.apagarToken();
  LS.apagar(CHAVE_TOKEN_EXPIRA);                 // plano 1500c · UCC-030
  E.modoDemo = false; try { sessionStorage.removeItem("nx-app-demo"); } catch { /* ok */ }
  E.sessao = null; E.cliente = null; E.imgOrg = null; E.notif = 0;
  atualizarSeloDoApp();
  if (E.pulso) E.pulso.parar();
  reiniciarCanais();                             // revisão: o aviso fixo de número caído não fica na tela de login
  desmontarAtual();
  apagarFilaDeSaida();                           // depois de desmontar: Conversas já largou a fila
  const m = E.M.tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {});
  // plano 1500c · UCC-140: a marca guardada no aparelho volta a ser a do endereço (a da revenda/empresa de quem saiu não pinta a próxima abertura)
  pintarMarca(m, { guardar: true });
  navegar("#/login", { substituir: true });
  return true;
}
/** plano 1500c · UCC-028: quanto o Sair espera pelo servidor antes de seguir limpando o aparelho. */
const SAIR_PRAZO_MS = 3000;
/** A promessa ou o prazo, o que vier primeiro; nunca lança (o resultado não importa a quem chama). */
function esperarNoMaximo(promessa, ms) {
  let t;
  return Promise.race([Promise.resolve(promessa).catch(() => null), new Promise(r => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t));
}
/** AS-192: de quem são os rascunhos que ficaram no aparelho depois de um «Sair» da janela de sessão expirada. */
const CHAVE_RASCUNHOS_DE = "nx-app-rascunhos-de";

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
  const anterior = E.cliente && E.cliente.id;
  E.cliente = novo;
  // plano 2000d · DU-345: trocou de empresa → o que o aparelho guardava da anterior sai (aparelho compartilhado entre empresas não acumula dados)
  if (mudou && anterior && E.cache && typeof E.cache.apagarEmpresa === "function" && E.sessao && E.sessao.conta) E.cache.apagarEmpresa({ conta: E.sessao.conta.id, cliente: anterior }).catch(() => {});
  if (mudou) { E.naoLidasAnterior = null; reiniciarCanais(); }                              // A2/A10: a referência é por empresa
  if (mudou) E.faixasAbertas = false;   // plano 1500c · UCC-117: a outra empresa volta a mostrar uma faixa só
  if (novo && Array.isArray(novo.canais)) atualizarCanais({ canais: novo.canais }, "sessao");   // A10: a sessão já diz o estado dos números
  conferirMigracao();   // A4: a sessão revalidada pela rede pode trazer outra migração do banco (a guardada é de antes)
  if (novo) LS.gravar(CHAVE_CLIENTE, novo.id);
  await aplicarMarcaCliente();
  desenharShell();
  aplicarSomenteConsulta();   // plano 1500c · UC-025
  if (E.pulso) { if (novo) E.pulso.iniciar(); else E.pulso.parar(); }
  E.badges = {};
  atualizarBadges();
  if (mudou) { E.notif = 0; atualizarSinoUI(); }
  if (mudou && remontar) {
    desmontarAtual();
    // plano 2000d · DU-451: fica na mesma tela; um item aberto (contato, conversa) é da empresa anterior → volta à lista da tela
    const destino = E.M.rotas.rotaAoTrocarEmpresa ? E.M.rotas.rotaAoTrocarEmpresa(E.ultimaRota) : null;
    if (destino && destino !== location.hash) { navegar(destino, { substituir: true }); return; }
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
    papel,   // plano 2000d · DU-110: o papel «marketing» entra por módulo
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
  return base.replace(/\/?$/, "/") + comEmpresa(h.startsWith("#") ? h : "#/" + h.replace(/^\/+/, ""));
}
/** Plano 1000 (AS-190): link de uma tela interna leva a empresa (?c=<slug> no hash; o roteador troca a empresa e tira o parâmetro). Quem tem várias
    empresas abria o link do colega na empresa guardada no aparelho. Rotas públicas (convite, nova senha) e hash que já tem ?c= ficam como estão. */
function comEmpresa(hash, slug = E.cliente && E.cliente.slug) {
  const h = String(hash || "");
  if (!slug || !/^[a-z0-9_-]{1,80}$/.test(slug) || /^#\/?(login|convite|senha)(\/|\?|$)/.test(h) || /[?&]c=/.test(h)) return h;
  return `${h}${h.includes("?") ? "&" : "?"}c=${encodeURIComponent(slug)}`;
}

/* ---- plano 1000 (pedido das frentes): guarda de rota. A tela registra ctx.aoSairDaRota(fn) e o shell pergunta ANTES de trocar de tela, de
   empresa ou de sair. Contrato: fn({ destino, motivo }) → boolean | Promise<boolean>; false = fica (a tela já perguntou/avisou a pessoa).
   destino = rotas.rotear(hash) do endereço pedido (null na troca de empresa e no Sair); motivo = "rota" | "empresa" | "sair". Some sozinha ao
   desmontar a tela (como as outras assinaturas do ctx). Uma guarda que lança erro não segura ninguém (o erro vai para o console). ---- */
const guardasDeRota = new Set();
/* ---- plano 1500c · UCC-041/UCC-042: cada entrada do histórico ganha um número (history.state.nxIdx). Saber se a navegação foi para a frente
   (link, entrada nova) ou para trás (Voltar) permite desfazer a navegação sem duplicar entradas e devolver a rolagem só na volta. ---- */
E.idxAtual = 0; E.idxMax = 0; E.voltou = false; E.rolagens = new Map();
function idxDoEstado(st) { return st && typeof st === "object" && Number.isFinite(st.nxIdx) ? st.nxIdx : null; }
/** idxNovo (da entrada em que o navegador está) × idxAtual (da tela que estava) → como voltar para a tela que estava. */
function desfazerNavegacao(idxNovo, idxAtual) {
  if (idxNovo === null || idxNovo === undefined) return "back";      // entrada nova (link, hash digitado): voltar remove ela
  if (idxNovo > idxAtual) return "back";
  if (idxNovo < idxAtual) return "forward";                          // a pessoa apertou Voltar: avançar devolve a tela
  return "replace";
}
function marcarEntradaDoHistorico() {
  try {
    const idx = idxDoEstado(history.state);
    E.voltou = idx !== null && idx < E.idxAtual;
    if (idx === null) {
      E.idxMax += 1;
      E.idxAtual = E.idxMax;
      history.replaceState({ ...(history.state && typeof history.state === "object" ? history.state : {}), nxIdx: E.idxAtual }, "");
    } else { E.idxAtual = idx; if (idx > E.idxMax) E.idxMax = idx; }
  } catch { E.voltou = false; }
}
function guardarRolagem(hash) {
  try {
    E.rolagens.set(hash, typeof scrollY === "number" ? scrollY : 0);
    if (E.rolagens.size > 50) E.rolagens.delete(E.rolagens.keys().next().value);
  } catch { /* ok */ }
}

async function podeSairDaRota({ destino = null, motivo = "rota" } = {}) {
  for (const fn of [...guardasDeRota]) {
    let ok = true;
    try { ok = (await fn({ destino, motivo })) !== false; } catch (e) { console.error("guarda de rota falhou", e); ok = true; }
    if (!ok) return false;
  }
  return true;
}

async function aoMudarRota(doUsuario) {
  // plano 1500c · UCC-041: a volta que a própria guarda pediu (history.back/forward) não remonta a tela que ficou
  if (E.voltaDaGuarda) {
    const h = E.voltaDaGuarda; E.voltaDaGuarda = null;
    if (location.hash === h) return;
  }
  // guarda de rota: outro endereço com uma tela que tem trabalho pendente → pergunta antes; «ficar» devolve o endereço anterior
  if (guardasDeRota.size && E.hashAtual != null && location.hash !== E.hashAtual) {
    if (E.guardando) return;                       // a pergunta já está na tela: a resposta decide pelo endereço que estiver valendo
    E.guardando = true;
    let ok = true;
    try { ok = await podeSairDaRota({ destino: E.M.rotas.rotear(location.hash), motivo: "rota" }); } finally { E.guardando = false; }
    if (!ok) {
      // plano 1500c · UCC-041: «ficar» desfaz a navegação no histórico (voltar uma entrada nova, avançar depois de um Voltar) em vez de
      // sobrescrever a entrada nova com o endereço antigo — antes o histórico ficava com a mesma tela duas vezes e o Voltar pedia 2 toques
      const passo = desfazerNavegacao(idxDoEstado(history.state), E.idxAtual);
      try {
        if (passo === "back" || passo === "forward") { E.voltaDaGuarda = E.hashAtual; if (passo === "back") history.back(); else history.forward(); }
        else history.replaceState(history.state, "", location.pathname + location.search + E.hashAtual);
      } catch { /* ok */ }
      return;
    }
  }
  // plano 1500c · UCC-042: a rolagem da tela que sai fica guardada; voltar a ela (Voltar do navegador) devolve a posição
  if (E.hashAtual != null && E.hashAtual !== location.hash) guardarRolagem(E.hashAtual);
  marcarEntradaDoHistorico();
  E.hashAtual = location.hash;
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
    // plano 1500c · UCC-036: #/inicio dentro do CRM fica no CRM (vai para a entrada dele), não atravessa para o Nexus Ads
    const destino = rotas.produtoDaRota(r.modulo, E.workspace);
    if (destino && destino !== E.workspace) {
      const href = urlWorkspace(destino, rotas.montarHash(r.modulo, r.partes, r.query));
      if (href) return location.assign(href);
    }
    return navegar(rotas.hashDaRota(rotas.rotaPadrao(opcoesAcesso())), { substituir: true });   // plano 1500c · UCC-043
  }

  mostrarApp();
  if (!r.modulo) {
    const destino = (() => { try { const d = sessionStorage.getItem("nx-app-destino"); sessionStorage.removeItem("nx-app-destino"); return d; } catch { return null; } })();
    if (destino && !/^#\/?(login|convite|senha|testar)/.test(destino) && destino !== "#/" && destino !== "#") return navegar(destino, { substituir: true });
    return navegar(rotas.hashDaRota(rotas.rotaPadrao(opcoesAcesso())), { substituir: true });   // plano 1500c · UCC-043: o mesmo hashDaRota
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
    sessao: { conta: E.sessao.conta, org: E.sessao.org, migracao: E.sessao.migracao || null },
    cliente: cli ? {
      id: cli.id, slug: cli.slug, nome: cli.nome, status: cli.status, teste_ate: cli.teste_ate || null, plano: cli.plano,
      modulos: cli.modulos.slice(), vertical: cli.vertical, papel: cli.papel, tem_tema: !!cli.tem_tema,
      link_base: cli.link_base || null, tema: cli.tema || {}, suporte: !!cli.suporte, ativo: cli.ativo !== false,
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
      /** plano 1000b · CB-166: fn({estado, antes, online}) em TODA mudança de estado da conexão (cair e voltar). Devolve cancelar(). */
      assinar(fn) {
        const cancelar = assinarMudancaDeRede(E.rede, fn);
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
    /** Plano 1000 · guarda de rota: fn({ destino, motivo: "rota"|"empresa"|"sair" }) → boolean | Promise<boolean> (false = fica). O shell consulta
        antes de trocar de endereço, de empresa ou de sair; a tela pergunta à pessoa do jeito dela (ui.confirmar) e devolve a resposta.
        Devolve cancelar(); some sozinha quando a tela é desmontada. */
    aoSairDaRota(fn) {
      if (typeof fn !== "function") return () => {};
      guardasDeRota.add(fn);
      const cancelar = () => { guardasDeRota.delete(fn); };
      E.assinaturas.add(cancelar);
      return () => { cancelar(); E.assinaturas.delete(cancelar); };
    },
    /** RC-151 (plano 1500c) · plano 2000d: o atalho do caso comum — fn() → true enquanto houver alteração não salva; o shell pergunta
        «Sair sem salvar?» antes de trocar de tela, de empresa ou de sair (a tela não precisa montar a pergunta). Devolve cancelar(). */
    guardaSaida(fn, { titulo = "Sair sem salvar?", texto = "As alterações desta tela ainda não foram salvas e vão se perder." } = {}) {
      if (typeof fn !== "function") return () => {};
      const guarda = async () => {
        let sujo = false;
        try { sujo = !!fn(); } catch { sujo = false; }
        if (!sujo) return true;
        return E.ui.confirmar({ titulo, texto, rotulo: "Sair sem salvar", perigo: true });
      };
      guardasDeRota.add(guarda);
      const cancelar = () => { guardasDeRota.delete(guarda); };
      E.assinaturas.add(cancelar);
      return () => { cancelar(); E.assinaturas.delete(cancelar); };
    },
    /** AS-191: a tela começou a guardar algo que não pode se perder (fila de saída): pede ao navegador armazenamento persistente (uma vez). */
    armazenamentoPersistente: () => pedirArmazenamentoPersistente(),
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
    /** A10: números de WhatsApp caídos que o shell conhece (`canais` do nx_pulso/nx_app_sessao ou notificações canal_caiu/canal_voltou):
        caidos() → [{id, nome, desde, fonte}], assinar(fn(lista)) → cancelar() (some ao sair da tela), verNumero() abre Configurações › Números. */
    canais: {
      caidos: () => E.canais.lista.slice(),
      assinar(fn) {
        E.canais.assinantes.add(fn);
        const cancelar = () => { E.canais.assinantes.delete(fn); };
        E.assinaturas.add(cancelar);
        return () => { cancelar(); E.assinaturas.delete(cancelar); };
      },
      verNumero: () => navegar("#/config/numeros"),
    },
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
  /** Plano 1000 (pedido de Conversas): moverNegocio(id, {tipo: "ganho"|"perdido"} | {estagio_id}, {aoMudar}) → negócio movido | null (cancelado,
      sem etapa desse tipo no funil ou CRM indisponível). Usa o MESMO fluxo do quadro do CRM (crm-negocio.moverComPerguntas: valor do ganho,
      motivo da perda, campos obrigatórios). Erro do servidor vira toast com a frase do CRM. */
  ctx.moverNegocio = async (id, alvo = {}, { aoMudar } = {}) => {
    if (!cli || !cli.modulos.includes("crm") || !pronto("crm")) { E.ui.toast("O CRM não está disponível.", { tipo: "info" }); return null; }
    let k = null;
    try {
      const m = await carregar("crm");
      k = await m.kit(ctx);
      const N = await k.mod("negocio");
      const r = await ctx.api.rpcC("nx_negocio_ver", { p_id: id });
      const card = r && r.negocio;
      if (!card) throw Object.assign(new Error("negocio_nao_encontrado"), { codigo: "negocio_nao_encontrado" });
      const funil = k.funilDoEstagio(card.estagio_id);
      const estagio = alvo && alvo.estagio_id ? k.estagio(alvo.estagio_id) : (funil ? funil.estagios.find(e => e.tipo === (alvo && alvo.tipo)) : null);
      if (!estagio) { E.ui.toast(`Este funil não tem uma etapa de ${alvo && alvo.tipo === "perdido" ? "perda" : "ganho"}. Ajuste em Configurações › Funis.`, { tipo: "info" }); return null; }
      if (estagio.id === card.estagio_id) return card;
      const novo = await N.moverComPerguntas(k, card, estagio);
      if (!novo) return null;
      if (typeof aoMudar === "function") try { aoMudar(novo); } catch (e) { console.error(e); }
      E.ui.toast(estagio.tipo === "ganho" ? "Venda registrada como ganha." : estagio.tipo === "perdido" ? "Registrado como perdido." : `Movido para «${estagio.nome}».`, { tipo: "ok" });
      return novo;
    } catch (e) {
      console.error(e);
      E.ui.toast(k && typeof k.erro === "function" ? k.erro(e) : E.api.mensagemErro(e), { tipo: "erro" });
      return null;
    }
  };
  return ctx;
}

/** import(`./<arquivo do módulo>.js?v=<versao>`) — o MESMO endereço que o roteador usa. */
function carregar(modulo) {
  const a = E.M.rotas.ARQUIVOS[modulo] || `${modulo}.js`;
  if (!/^[a-z0-9-]+\.js$/.test(a)) return Promise.reject(new Error("modulo_invalido"));
  return arq(a);
}

/** plano 1000b · UB-129: «Sem acesso» diz o papel exigido pela rota e o da pessoa («Esta área é de Supervisor ou acima; seu papel é Atendente.»).
    Sem papel mínimo ou sem papel conhecido, a frase de antes. */
function textoSemAcesso(min, papel, rotulos = {}) {
  const r = p => rotulos[p] || null;
  const fim = "Fale com o administrador da sua empresa.";
  if (!r(min)) return fim;
  const exigido = min === "gestor" || min === "super" ? "Esta área é da equipe da plataforma" : `Esta área é de ${r(min)} ou acima`;
  return `${exigido}${r(papel) ? `; seu papel é ${r(papel)}` : ""}. ${fim}`;
}

function cartaoBloqueio(tipo, modulo) {
  const { ui } = E;
  const rotaB = modulo ? E.M.rotas.rotaDe(modulo) : null;
  const tx = {
    em_breve: { titulo: "Esta área chega em breve.", texto: "Estamos terminando esta parte. Enquanto isso, use as outras áreas do menu.", icone: "relogio" },
    fora_do_plano: { titulo: "Esta área não faz parte do seu plano.", texto: "Para liberar, fale com o suporte.", icone: "cadeado" },
    sem_acesso: { titulo: "Você não tem acesso a esta área", texto: textoSemAcesso(rotaB && rotaB.papel, rotaB && rotaB.conta ? (E.sessao && E.sessao.conta.papel) : papelAtual(), E.M.vocab ? E.M.vocab.ROTULO_PAPEL : {}), icone: "cadeado" },
    inexistente: { titulo: "Página não encontrada", texto: "O endereço pode estar incompleto.", icone: "alerta" },
    sem_cliente: E.sessao && E.sessao.conta.papel === "gestor"
      ? { titulo: "Nenhum cliente por aqui ainda.", texto: "Crie o primeiro em Admin → Clientes.", icone: "empresa", acao: { rotulo: "Ir para Admin", fn: () => navegar("#/admin/clientes") } }
      : { titulo: "Sua conta ainda não tem acesso a nenhuma empresa.", texto: "Peça ao administrador um convite.", icone: "empresa" },
    // A4 (contrato 9): «Cliente ativo» desligado no painel — nada de erro cru por RPC: a tela diz o que está parado e com quem falar
    pausado: { titulo: "Esta empresa está pausada.", texto: "A plataforma pausou o acesso: o atendimento, a leitura de anúncios e o rastreio do site ficam parados até ela voltar. Fale com o suporte para reativar.", icone: "pausa",
      acao: E.marca && E.marca.suporte_wa ? { rotulo: "Falar com o suporte", icone: "whatsapp",
        fn: () => window.open(E.ui.linkWhatsApp(`Olá! O acesso da ${E.cliente ? E.cliente.nome : "minha empresa"} está pausado.`, E.marca.suporte_wa), "_blank", "noopener,noreferrer") } : null },
  }[tipo];
  // plano 1500c · UCC-040: endereço errado por uma letra («#/crn») sugere a tela parecida que a pessoa pode abrir
  if (tipo === "inexistente" && modulo) {
    let itens = [];
    try { itens = itensVisiveis(); } catch { itens = []; }
    const id = E.M.comandos && typeof E.M.comandos.sugerirRota === "function" ? E.M.comandos.sugerirRota(modulo, itens) : null;
    const it = id && itens.find(x => x.id === id);
    if (it) { tx.texto = `Você quis dizer «${it.rotulo}»?`; tx.acao = { rotulo: `Ir para ${it.rotulo}`, fn: () => navegar(`#/${it.rota}`) }; }
  }
  const acao = tx.acao || (tipo === "inexistente" || tipo === "sem_acesso" || tipo === "em_breve" || tipo === "fora_do_plano"
    ? { rotulo: "Ir para o início", fn: () => navegar("#/") } : null);
  const acoes = tipo === "fora_do_plano" ? acoesForaDoPlano(modulo) : [];
  // plano 1500c · UCC-095: o que a área resolve (3 frases), para quem decide pedir o módulo
  const beneficios = tipo === "fora_do_plano" && modulo && E.M.rotas.beneficiosDe ? E.M.rotas.beneficiosDe(modulo) : [];
  if (tipo === "fora_do_plano" && modulo && E.api && E.api.evento) E.api.evento("viu_fora_do_plano", { modulo });
  return ui.h("div", { class: "area-bloqueada" }, ui.vazio({ titulo: tx.titulo, texto: tx.texto, icone: tx.icone, acao, acoes }),
    beneficios.length ? ui.h("ul", { class: "beneficios" }, beneficios.map(b => ui.h("li", null, ui.icone("check"), ui.h("span", null, b)))) : null);
}

/** Plano 1000b · UB-128: «Fora do plano» com caminho — o administrador vê o Plano e uso; havendo WhatsApp de suporte, «Falar com o suporte». */
function acoesForaDoPlano(modulo = null) {
  const out = [];
  // plano 1500c · UCC-095: «Pedir este módulo» — o pedido vai ao comercial (nx_plano_upgrade_pedido); sem a RPC, vira mensagem ao suporte
  if (modulo && E.M.rotas.podePapel(papelAtual(), "admin")) out.push({ rotulo: "Pedir este módulo", icone: "mais", fn: () => pedirModulo(modulo) });
  if (E.M.rotas.podePapel(papelAtual(), "admin")) out.push({ rotulo: "Ver Plano e uso", icone: "cartao", fn: () => navegar("#/config/plano") });
  const wa = E.marca && E.marca.suporte_wa;
  if (wa) out.push({ rotulo: "Falar com o suporte", icone: "whatsapp",
    fn: () => window.open(E.ui.linkWhatsApp(`Olá! Quero liberar uma área do sistema para a ${E.cliente ? E.cliente.nome : "minha empresa"}.`, wa), "_blank", "noopener,noreferrer") });
  return out;
}

/** plano 1500c · UCC-095/UCC-094: pede o módulo ao comercial. Servidor atual (sem a RPC): abre o WhatsApp do suporte com o pedido pronto. */
async function pedirModulo(modulo) {
  const nome = (E.M.rotas.ROTAS[modulo] && E.M.rotas.ROTAS[modulo].plano) || modulo;
  if (E.api && E.api.evento) E.api.evento("pedir_modulo", { modulo: nome });
  try {
    await E.api.rpcC("nx_plano_upgrade_pedido", { p_modulo: nome });
    E.ui.toast("Pedido enviado. O comercial fala com você em breve.", { tipo: "ok" });
  } catch (e) {
    const wa = E.marca && E.marca.suporte_wa;
    if (wa && (E.M.api.ehFuncaoAusente(e) || Number(e && e.status) === 404)) {
      window.open(E.ui.linkWhatsApp(`Olá! Quero incluir o módulo «${nome}» no plano da ${E.cliente ? E.cliente.nome : "minha empresa"}.`, wa), "_blank", "noopener,noreferrer");
    } else E.ui.toast(E.M.api.ehFuncaoAusente(e) ? "Peça este módulo ao suporte da sua plataforma." : E.api.mensagemErro(e), { tipo: E.M.api.ehFuncaoAusente(e) ? "info" : "erro" });
  }
}

async function montarNoShell(r, seq, doUsuario) {
  const { rotas, ui } = E.M;
  const vista = $("vista");
  const acessoDaRota = rotas.acessoRota(r.modulo, opcoesAcesso());
  const def = rotas.rotaDe(r.modulo);
  // A4 (contrato 9): empresa pausada — quem não é da plataforma vê o bloqueio honesto em vez de cada RPC falhar com cliente_pausado
  const equipe = !!(E.sessao && E.sessao.conta && (E.sessao.conta.super || E.sessao.conta.papel === "gestor"));
  const acesso = acessoDaRota === "ok" && E.cliente && E.cliente.ativo === false && !equipe && !(def && def.semCliente) ? "pausado" : acessoDaRota;
  E.ultimaRota = r;
  // plano 2000d · DU-408: a última tela principal aberta (o app instalado reabre nela)
  try { if (acesso === "ok" && E.sessao && /^[a-z-]{2,20}$/.test(String(r.modulo || "")) && r.modulo !== "inicio") LS.gravar(E.pwaMod && E.pwaMod.CHAVE_ULTIMA_ROTA || "nx-ultima-rota", `#/${r.modulo}`); } catch { /* lembrar a rota nunca atrapalha a tela */ }
  reiniciarSelo();
  marcarMenu(r.modulo);
  if (E.pulso) E.pulso.modo(r.modulo === "conversas" ? "conversas" : "normal");

  if (acesso !== "ok") {
    // o mesmo bloqueio em outro endereço do mesmo módulo não pisca a vista de novo
    const chaveBloq = `bloqueio|${acesso}|${r.modulo}`;
    const bloqueioNovo = E.telaVista !== chaveBloq;
    E.telaVista = chaveBloq;
    desmontarAtual();
    ui.limpar(vista);
    if (bloqueioNovo) transicaoRota(vista);
    vista.appendChild(cartaoBloqueio(acesso, r.modulo));
    definirTitulo({ em_breve: "Em breve", fora_do_plano: "Fora do plano", sem_acesso: "Sem acesso", inexistente: "Página não encontrada", sem_cliente: "Início", pausado: "Empresa pausada" }[acesso]);
    desenharRegioes();
    if (doUsuario) focarTitulo(seq);
    return;
  }

  const chave = `${def.arquivo}|${E.cliente ? E.cliente.id : "-"}`;
  // abrir uma conversa, trocar de aba (Relatórios) ou de seção (Configurações) reaproveita o módulo: isso não é trocar de tela, a vista não pisca.
  // Calculado antes do if/else: o else desmonta (zera E.atual) e grava a chave nova.
  const trocouDeTela = !(E.atual && E.atual.chave === chave);
  E.telaVista = chave;
  let mod = null;
  if (E.atual && E.atual.chave === chave) mod = E.atual.mod;
  else {
    desmontarAtual();
    ui.limpar(vista);
    // a forma da tela, não 4 cartões iguais · plano 2000d · DU-360: depois de 5 s diz o que está carregando
    vista.appendChild(ui.esqueleto(rotas.esqueletoDaRota(r.modulo, r.partes), { demorou: rotas.textoCarregandoDemorou ? rotas.textoCarregandoDemorou(r.modulo) : null }));
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
  if (trocouDeTela) transicaoRota(vista);
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
  // plano 1500c · UCC-075: o foco vai ao título só quando a TELA mudou — abrir um item ou trocar de aba na mesma tela não tira o teclado do lugar
  if (doUsuario && trocouDeTela) focarTitulo(seq);
  // plano 2000d · DU-246: primeira visita a esta tela → o tour dela (depois do foco no título e dos dados chegarem)
  if (trocouDeTela) setTimeout(() => { try { if (seq === E.montando) iniciarTourDaRota(r.modulo); } catch { /* o tour nunca derruba a tela */ } }, 1800);
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
    scrollTo({ top: rolagemDeVolta() });   // plano 1500c · UCC-042: no Voltar, a posição em que a pessoa estava
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
  scrollTo({ top: rolagemDeVolta() });
}
/** plano 1500c · UCC-042: voltando (Voltar do navegador) a uma tela já vista → a rolagem guardada dela; senão o topo. */
function rolagemDeVolta() {
  if (!E.voltou) return 0;
  const y = Number(E.rolagens.get(location.hash));
  return Number.isFinite(y) && y > 0 ? y : 0;
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
    rotas: E.M.rotas,   // plano 2000d · DU-218: o rótulo do papel do convite sai do rotas.js (sem baixar o config.js)
    marca: E.marca, marcaPublica: E.marcaPublica,
    produtoAberto: E.workspace ? { id: E.workspace, titulo: E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name, resumo: E.M.rotas.PRODUTOS[E.workspace].resumo,
      icone: E.M.rotas.iconeDoProduto(E.workspace) } : null,
    sessao: E.sessao,
    navegar,
    pintarMarcaOrg(marcaOrg) { pintarMarca(E.M.tema.marcaEfetiva(marcaOrg || {}, {}), { respeitarEsquema: false }); },
    restaurarMarca() { pintarMarca(E.M.tema.marcaEfetiva(E.marcaPublica ? E.marcaPublica.marca : {}, {})); },
    titulo: definirTitulo,
    /** AS-185: o aparelho está marcado como compartilhado? (o login mostra «Lembrar neste aparelho» desmarcado) */
    aparelhoCompartilhado,
    /** depois de entrar/aceitar convite: guarda o token e abre o app. `compartilhado` (login): true = nada vai para o disco do aparelho. */
    async aoEntrar(token, { cliente_id, compartilhado, expira_em, boasVindas, demo, tentativas, ativar2fa = false } = {}) {
      // plano 2000d · DU-222: houve tentativas erradas recentes nesta conta → aviso depois de abrir, com o caminho para as sessões
      E.tentativasRecentes = tentativas && typeof tentativas === "object" ? tentativas : null;
      if (typeof compartilhado === "boolean") definirAparelhoCompartilhado(compartilhado);
      // outra conta podia estar aberta neste navegador (o admin testando o convite que acabou de criar): a sessão lida com o token antigo e o
      // que o aparelho guardava dela (sessão, respostas, Recentes) não podem ser adotados por quem entrou agora
      E.sessaoPromessa = null; E.sessaoGuardada = null;
      limparDadosDoAparelho();
      E.M.dados.guardarToken(token);
      // plano 1500c · UCC-030: a validade do token (quando o servidor manda) fica junto dele; sem ela, a chave antiga sai
      const exp = Date.parse(String(expira_em || ""));
      if (Number.isFinite(exp)) LS.gravar(CHAVE_TOKEN_EXPIRA, String(exp)); else LS.apagar(CHAVE_TOKEN_EXPIRA);
      // plano 1500c · UC-019: depois de aceitar o convite, o shell diz em que empresa e com que papel a pessoa entrou (uma vez, na abertura)
      E.boasVindasConvite = boasVindas && (boasVindas.empresa || boasVindas.papel) ? boasVindas : null;
      E.modoDemo = demo === true;   // plano 1500c · UCB-054: faixa «Demonstração · dados fictícios»
      try { if (E.modoDemo) sessionStorage.setItem("nx-app-demo", "1"); else sessionStorage.removeItem("nx-app-demo"); } catch { /* ok */ }
      if (cliente_id) LS.gravar(CHAVE_CLIENTE, cliente_id);
      E.sessao = null; E.cliente = null;
      let destino = "#/";
      try { const d = sessionStorage.getItem("nx-app-destino"); sessionStorage.removeItem("nx-app-destino"); if (d && !/^#\/?(login|convite|senha|testar)/.test(d)) destino = d; } catch { /* ok */ }
      // plano 2000d · DU-119: a empresa pede verificação em duas etapas → primeiro o Perfil, no passo de ligar (o config.js lê ?ativar2fa=1)
      if (ativar2fa) { destino = "#/config/perfil?ativar2fa=1"; setTimeout(() => E.ui.toast("Esta empresa pede a verificação em duas etapas. Ligue agora para continuar usando.", { tipo: "aten", ms: 12000 }), 600); }
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
  mostrarBoasVindasConvite();   // plano 1500c · UC-019
  avisarTentativasRecentes();   // plano 2000d · DU-222
  vigiarValidadeDaSessao();     // plano 1500c · UCC-031
  ouvirPassosDaEquipe();        // plano 1500c · UC-012
  aplicarApresentacao();        // plano 1500c · UC-030: o modo continua depois de recarregar a aba
  avisarNovidades();            // plano 1500c · UC-037
  try { if (sessionStorage.getItem("nx-modo-foco") === "1") document.documentElement.classList.add("modo-foco"); } catch { /* ok */ }   // plano 2000d · DU-281
  abrirNaUltimaRota();          // plano 2000d · DU-408
  receberCompartilhado();       // plano 2000d · DU-446
  // plano 1500c · UC-018/UC-005: boas-vindas (1ª vez do admin na empresa) ou, se não, o aviso do fim do teste; o tour só quando nenhum dos dois abriu
  const abriu = E.sessao && (mostrarBoasVindas() || avisarFimDoTeste());
  if (E.sessao && !E.tourAgendado && !abriu) { E.tourAgendado = true; setTimeout(() => iniciarTour(), 2500); }   // plano 1500c · UCC-098
}

/** plano 2000d · DU-408: uma vez por abertura — instalado, sem hash próprio → a última tela principal. nx-abrir-ultima="0" desliga (Perfil). */
function abrirNaUltimaRota() {
  if (E.abriuUltimaRota || !E.sessao || !E.pwaMod || !E.pwaMod.rotaAoAbrirInstalado) return null;
  E.abriuUltimaRota = true;
  const alvo = E.pwaMod.rotaAoAbrirInstalado({ instalado: rodandoInstalado(), hash: location.hash, ultima: LS.lerTxt(E.pwaMod.CHAVE_ULTIMA_ROTA), ligado: LS.lerTxt("nx-abrir-ultima") !== "0" });
  if (alvo) navegar(alvo, { substituir: true });
  return alvo;
}
/** plano 2000d · DU-446: texto recebido pelo «Compartilhar» do celular → guardado para a próxima mensagem (nx-compartilhado, só nesta aba) e a
    pessoa vai às Conversas escolher o contato. O endereço perde o ?compartilhar (recarregar não repete). */
function receberCompartilhado() {
  if (!E.pwaMod || !E.pwaMod.textoCompartilhado || !E.sessao) return null;
  const texto = E.pwaMod.textoCompartilhado(location.search);
  if (!texto) return null;
  try { sessionStorage.setItem("nx-compartilhado", texto); } catch { /* sem armazenamento: fica só o aviso */ }
  try { history.replaceState(null, "", `${location.pathname}${location.hash || ""}`); } catch { /* ok */ }
  navegar("#/conversas", { substituir: true });
  E.ui.toast("Texto recebido. Abra a conversa do contato para enviar.", { acao: navigator.clipboard ? { rotulo: "Copiar texto", fn: () => { navigator.clipboard.writeText(texto).catch(() => {}); } } : null });
  return texto;
}
/** plano 1500c · UCC-098: tour de primeira vez — 4 balões (busca, produtos, sino, conta) que apontam para o topo, com «Próximo» e «Pular».
    Visto uma vez por conta neste aparelho (nx-tour-visto:<conta>); o servidor (nx_onboarding_marcar) guardará entre aparelhos quando existir.
    {forcar}: menu Ajuda e paleta («Fazer o tour»). Sem paradas na tela (celular estreito), nada acontece. */
let tourAberto = null;
function iniciarTour({ forcar = false } = {}) {
  const C = E.M.comandos;
  if (!E.sessao || !C || !C.paradasDoTour || $("app").hidden) return false;
  const chave = C.chaveTour(E.sessao.conta.id);
  if (!forcar && (LS.lerTxt(chave) || emModoDemo() || document.querySelector("dialog[open]"))) return false;
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const paradas = C.paradasDoTour(document, C.PASSOS_TOUR, (nav.userAgentData && nav.userAgentData.platform) || nav.platform || "");   // plano 2000d · DU-447
  if (!paradas.length) return false;
  if (tourAberto) tourAberto.fechar();
  LS.gravar(chave, "1");
  if (E.api && E.api.rpc && !forcar) E.api.rpc("nx_onboarding_marcar", { p_passo: "tour" }).catch(() => {});   // melhor esforço: servidor atual não tem
  return mostrarParadasDoTour(paradas);
}
/** plano 2000d · DU-246: o tour de cada tela na primeira visita (Conversas: responder; CRM: arrastar; Automações: receitas) — só depois do tour geral. */
function iniciarTourDaRota(modulo, { forcar = false } = {}) {
  const R = E.M.rotas, C = E.M.comandos;
  if (!E.sessao || !R.paradasDoTour || !C || tourAberto || emModoDemo()) return false;
  const conta = E.sessao.conta.id;
  const chave = R.chaveTourRota(conta, modulo);
  if (!forcar && (LS.lerTxt(chave) || !LS.lerTxt(C.chaveTour(conta)) || document.querySelector("dialog[open]"))) return false;
  const paradas = R.paradasDoTour(modulo).map(p => { let el = null; try { el = document.querySelector(p.alvo); } catch { el = null; } return { ...p, el }; }).filter(p => p.el && !p.el.hidden);
  if (!paradas.length) return false;
  LS.gravar(chave, "1");
  return mostrarParadasDoTour(paradas);
}
/** As paradas de um tour (geral ou da tela) em balões. plano 2000d · DU-247: o foco vai ao «Próximo» de cada balão e, no fim (ou no Esc),
    volta para onde estava antes do tour. */
function mostrarParadasDoTour(paradas) {
  const { ui } = E;
  const focoAntes = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  let i = 0, f = null;
  const mostrar = () => {
    if (f) { const velho = f; f = null; velho.fechar(); }
    const p = paradas[i];
    if (!p || !p.el.isConnected) { tourAberto = null; return; }
    const ultimo = i === paradas.length - 1;
    const prox = ui.h("button", { type: "button", class: "bt bt-prim bt-p" }, ultimo ? "Concluir" : "Próximo");
    const pular = ultimo ? null : ui.h("button", { type: "button", class: "bt bt-fant bt-p" }, "Pular o tour");
    prox.addEventListener("click", () => { i += 1; if (i < paradas.length) mostrar(); else fim(); });
    if (pular) pular.addEventListener("click", () => fim());
    const corpo = ui.h("div", { class: "tour pilha-p" },
      ui.h("p", { class: "rotulo" }, `${p.titulo} · ${i + 1} de ${paradas.length}`),
      ui.h("p", null, p.texto),
      ui.h("div", { class: "linha linha-entre" }, pular || ui.h("span"), prox));
    // o Esc do balão foca a âncora depois do aoFechar: o foco volta ao lugar de antes do tour no próximo giro
    f = ui.flutuante(p.el, corpo, { classe: "tour-balao", rotulo: `Tour: ${p.titulo}`, aoFechar: () => { if (f) { f = null; tourAberto = null; setTimeout(devolverFoco, 0); } } });
    setTimeout(() => { if (prox.isConnected) try { prox.focus({ preventScroll: true }); } catch { prox.focus(); } }, 20);   // plano 2000d · DU-247
  };
  const devolverFoco = () => { if (focoAntes && focoAntes.isConnected) try { focoAntes.focus({ preventScroll: true }); } catch { focoAntes.focus(); } };
  const fim = () => { const velho = f; f = null; tourAberto = null; if (velho) velho.fechar(); devolverFoco(); };
  tourAberto = { fechar: fim };
  mostrar();
  return true;
}

/** plano 1500c · UCC-031: com a validade do token conhecida (nx_entrar.expira_em), avisa uma vez quando faltam 10 min para a sessão vencer
    («Salve o que está fazendo»), com «Entrar de novo» que abre o login na própria tela. Sem validade guardada (servidor atual), não faz nada. */
let _vigiaValidade = null, _validadeAvisada = null;
function vigiarValidadeDaSessao() {
  if (_vigiaValidade) return;
  const olhar = () => {
    const exp = Number(LS.lerTxt(CHAVE_TOKEN_EXPIRA));
    if (!E.sessao || !(exp > 0) || _validadeAvisada === exp) return;
    if (!E.M.rotas.sessaoPertoDeVencer(exp, Date.now())) return;
    _validadeAvisada = exp;
    const min = Math.max(1, Math.round((exp - Date.now()) / 60000));
    E.ui.toast(`Sua sessão vence em ${min} min. Salve o que está fazendo.`, { tipo: "aten", fixo: true,
      acao: { rotulo: "Entrar de novo", fn: () => { pedirLoginNaTela(); } } });
  };
  _vigiaValidade = setInterval(olhar, 60000);
  olhar();
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
  const recolhido = document.documentElement.classList.contains("menu-recolhido");
  bt.setAttribute("aria-pressed", String(recolhido));
  bt.setAttribute("aria-label", recolhido ? "Expandir menu" : "Recolher menu");   // plano 1000b · UB-134: aberto já recolhido, o rótulo acompanha
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
      ui.h("span", { class: "badge-ponto", hidden: true, dataset: { ponto: it.id } }),
      it.id === "conversas" ? pontoCanal() : null));
  }
  atualizarSeloPrimeirosPassos();   // plano 1500c · UC-034
  // barra inferior: até 4 + Mais
  // plano 1000b · UB-278: o item mais aberto pelo «Mais» neste aparelho ganha o 4º lugar
  const prefer = E.M.rotas.itensDaBarra(itens, lerUsosDaBarra(), undefined, lerEscolhaDaBarra());   // plano 2000d · DU-277
  const resto = itens.filter(i => !prefer.includes(i));
  for (const it of prefer) {
    barra.appendChild(ui.h("a", { class: "barra-b", href: `#/${it.rota}`, dataset: { id: it.id } },
      ui.icone(it.icone), ui.h("span", null, it.rotulo), ui.h("span", { class: "badge", hidden: true, dataset: { badge: it.id } }),
      it.id === "conversas" ? pontoCanal() : null));
  }
  atualizarPontoCanal();
  if (resto.length) {
    // plano 1000b · UB-271: um ponto no «Mais» quando algum item escondido nele tem contador
    const mais = ui.h("button", { type: "button", class: "barra-b", dataset: { id: "mais" } }, ui.icone("menu"), ui.h("span", null, "Mais"),
      ui.h("span", { class: "barra-ponto", hidden: true, dataset: { pontoMais: resto.map(i => i.id).join(",") } }, ui.h("span", { class: "sr-only" }, "(há novidades)")));
    mais.addEventListener("click", () => abrirFolhaMais(resto));
    barra.appendChild(mais);
  }
  atualizarBadges();
}

/** Plano 1000 (AS-243): ponto de saúde no item Conversas do menu e da barra — vermelho enquanto algum número de WhatsApp estiver desconectado. */
function pontoCanal() {
  return E.ui.h("span", { class: "canal-ponto", hidden: true, dataset: { canal: "1" } }, E.ui.h("span", { class: "sr-only" }, "(número de WhatsApp desconectado)"));
}
function atualizarPontoCanal() {
  const caidos = E.canais.lista.length;
  for (const el of document.querySelectorAll("[data-canal]")) {
    el.hidden = !caidos;
    el.title = caidos ? (caidos === 1 ? "Um número de WhatsApp está desconectado" : `${caidos} números de WhatsApp desconectados`) : "";
  }
}

/** plano 1000b · UB-278: quantas vezes cada área foi aberta pelo «Mais» NESTE aparelho (só ids de módulo — nada da conta). */
const CHAVE_USOS_BARRA = "nx-app-barra-usos";
function lerUsosDaBarra() {
  const o = LS.ler(CHAVE_USOS_BARRA);
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}
function contarUsoDaBarra(id) {
  const usos = lerUsosDaBarra();
  const n = Math.min(999, (Number(usos[id]) || 0) + 1);
  usos[id] = n;
  LS.gravar(CHAVE_USOS_BARRA, usos);
  return n;
}

/** plano 2000d · DU-277: a barra de baixo do celular escolhida pela pessoa (até 4 + «Mais»), por conta, neste aparelho. */
function chaveEscolhaBarra() { return `nx-barra-escolha:${E.sessao && E.sessao.conta ? E.sessao.conta.id : "-"}`; }
function lerEscolhaDaBarra() {
  const v = LS.ler(chaveEscolhaBarra());
  return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 8) : null;
}
function editarBarra() {
  const { ui } = E;
  const itens = itensVisiveis().filter(i => !i.fixo);
  const atuais = E.M.rotas.itensDaBarra(itensVisiveis(), lerUsosDaBarra(), undefined, lerEscolhaDaBarra()).map(i => i.id);
  const MAX = E.M.rotas.MAX_ITENS_BARRA || 4;
  const aviso = ui.h("p", { class: "sub", "aria-live": "polite" }, `Escolha até ${MAX}. O resto fica em «Mais».`);
  const caixas = itens.map(it => {
    const c = ui.h("input", { type: "checkbox", name: "barra", value: it.id });
    c.checked = atuais.includes(it.id);
    return { it, c, el: ui.h("label", { class: "opcao-check" }, c, ui.icone(it.icone), ui.h("span", null, it.rotulo)) };
  });
  const conferir = () => {
    const n = caixas.filter(x => x.c.checked).length;
    for (const x of caixas) x.c.disabled = !x.c.checked && n >= MAX;
    aviso.textContent = n >= MAX ? `Limite de ${MAX} itens: desmarque um para trocar.` : `Escolha até ${MAX}. O resto fica em «Mais».`;
  };
  for (const x of caixas) x.c.addEventListener("change", conferir);
  conferir();
  ui.modal({ titulo: "Editar a barra de baixo", largura: "p", protegerTexto: false, corpo: ui.h("div", { class: "pilha-p" }, aviso, ...caixas.map(x => x.el)),
    acoes: [
      { rotulo: "Voltar ao automático", tipo: "neutro", fn: () => { LS.apagar(chaveEscolhaBarra()); desenharMenu(); return true; } },
      { rotulo: "Salvar", tipo: "primario", fn: () => {
        const ids = caixas.filter(x => x.c.checked).map(x => x.it.id);
        if (ids.length) LS.gravar(chaveEscolhaBarra(), ids); else LS.apagar(chaveEscolhaBarra());
        desenharMenu();
        ui.toast("Barra atualizada.", { tipo: "ok" });
        return true;
      } }] });
}
function abrirFolhaMais(itens) {
  const { ui } = E;
  let api = null;
  const grade = ui.h("div", { class: "folha-mais" }, itens.map(it => {
    // plano 1000b · UB-271: o item da folha repete o contador do menu
    const a = ui.h("a", { href: `#/${it.rota}` }, ui.icone(it.icone), it.rotulo, ui.h("span", { class: "badge", hidden: true, dataset: { badge: it.id } }));
    a.addEventListener("click", () => {
      if (api) api.fechar(null);
      // UB-278: conta a abertura; ao chegar a 3 o menu é redesenhado com o item na barra
      if (contarUsoDaBarra(it.id) === E.M.rotas.USOS_PARA_BARRA) setTimeout(() => { if (E.sessao) desenharMenu(); }, 0);
    });
    return a;
  }));
  if (modoInstalacao()) {
    const bt = ui.h("button", { type: "button" }, ui.icone("baixar"), "Instalar o app");
    bt.addEventListener("click", () => { if (api) api.fechar(null); instalarApp(); });
    grade.appendChild(bt);
  }
  // plano 2000d · DU-277: «Editar barra» no fim da folha
  const editar = ui.h("button", { type: "button" }, ui.icone("editar"), "Editar barra");
  editar.addEventListener("click", () => { if (api) api.fechar(null); setTimeout(editarBarra, 0); });
  grade.appendChild(editar);
  ui.modal({ titulo: "Mais", corpo: grade, acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: a => { api = a; } });
  atualizarBadges();
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
// plano 1500c · UCC-105: «Ocultar por 24 h» não vale nos 2 últimos dias — quem ocultou antes volta a ver quando falta pouco
function testeOculto(cli) {
  const t = Number(LS.lerTxt(`${CHAVE_TESTE_OCULTO}:${cli.id}`));
  if (!(t > 0 && Date.now() - t < DIA_MS)) return false;
  const d = diasDeTeste(cli);
  return !(d !== null && d <= 2);
}
/** plano 1500c · UCC-136: o «hoje» de São Paulo pelo relógio do SERVIDOR (cabeçalho Date da última resposta): aparelho com a data errada não muda a conta do teste. */
function hojeServidor() {
  let t = Date.now();
  try { if (E.M.api && typeof E.M.api.agoraServidor === "function") t = E.M.api.agoraServidor(t); } catch { /* relógio do aparelho */ }
  return E.ui.hojeSP(new Date(t));
}
function diasDeTeste(cli) {
  return E.M.rotas.diasAteFimTeste(cli.teste_ate, hojeServidor());   // plano 1500c · UC-004: a mesma conta do Admin (aceita data ou timestamp)
}
function pilulaDeTeste(cli) {
  const { ui } = E;
  // plano 1500c · UC-039: teste sem data (cadastro antigo) — «Em teste» para o administrador, sem contagem; o Admin mostra «sem data de fim» à revenda
  if (cli.status === "teste" && !cli.teste_ate) {
    if (!E.M.rotas.podePapel(papelAtual(), "admin") || testeOculto(cli)) return null;
    const bt0 = ui.h("button", { type: "button", class: "pilula-teste", "aria-haspopup": "dialog", dataset: { urgente: "0" }, title: "Empresa em teste grátis", "aria-label": "Empresa em teste grátis" },
      ui.icone("relogio"), ui.h("span", { class: "pt-txt", "aria-hidden": "true" }, "Em teste"));
    bt0.addEventListener("click", () => abrirAvisoTeste(bt0, cli, null));
    return bt0;
  }
  if (!(cli.status === "teste" && cli.teste_ate && cli.teste_ate >= hojeServidor()) || testeOculto(cli)) return null;
  const dias = diasDeTeste(cli);
  // plano 1500c · UC-027: nos últimos 7 dias a pílula conta os dias («Teste: 3 dias»); antes disso, a data
  const txTeste = E.M.rotas.textoPilulaTeste(dias, ui.dataCurtaBR(String(cli.teste_ate).slice(0, 10)));
  // plano 2000d · DU-278: o nome diz para onde a pílula leva («… Ver planos»)
  const bt = ui.h("button", { type: "button", class: "pilula-teste", "aria-haspopup": "dialog", dataset: { urgente: dias !== null && dias <= 3 ? "1" : "0" },
    title: txTeste.longo, "aria-label": `${txTeste.longo} Ver planos e como continuar.` }, ui.icone("relogio"), ui.h("span", { class: "pt-txt", "aria-hidden": "true" }, txTeste.curto),
    // plano 1500c · UCC-092: no celular, o número compacto («3 d») em vez de sumir com os dias
    dias !== null && dias >= 0 && dias <= 7 ? ui.h("span", { class: "pt-compacto", "aria-hidden": "true" }, dias === 0 ? "hoje" : `${dias} d`) : null);
  bt.addEventListener("click", () => abrirAvisoTeste(bt, cli, dias));
  return bt;
}
function abrirAvisoTeste(ancora, cli, dias) {
  const { ui } = E;
  const wa = E.marca && E.marca.suporte_wa;
  let f = null;
  // plano 1500c · UC-002: nos 2 últimos dias não há «Ocultar» (a pílula voltaria de qualquer jeito — UCC-105)
  const ocultar = dias === null || dias > 2 ? ui.h("button", { type: "button", class: "bt bt-fant bt-p" }, "Ocultar por 24 h") : null;
  if (ocultar) ocultar.addEventListener("click", () => { LS.gravar(`${CHAVE_TESTE_OCULTO}:${cli.id}`, String(Date.now())); if (f) f.fechar(); desenharEmpresa(); });
  // plano 1500c · UC-003: «Quero continuar» abre o pedido pronto (copiar ou WhatsApp), com ou sem o WhatsApp do suporte
  const continuar = ui.h("button", { type: "button", class: "bt bt-sec bt-p" }, "Quero continuar");
  continuar.addEventListener("click", () => { if (f) f.fechar(); abrirPedidoDeContratacao(cli, "pilula_teste"); });
  const falar = wa ? ui.h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp(`Olá! Quero continuar usando o sistema na ${cli.nome}.`, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
  // plano 1500c · UCC-093: o administrador vai direto ao Plano e uso
  const planos = E.M.rotas.podePapel(papelAtual(), "admin") ? ui.h("a", { class: "bt bt-prim bt-p", href: "#/config/plano" }, "Ver planos") : null;
  if (planos) planos.addEventListener("click", () => { if (f) f.fechar(); if (E.api && E.api.evento) E.api.evento("ver_plano", { origem: "pilula_teste" }); });
  f = ui.flutuante(ancora, ui.h("div", { class: "pilha-p" },
    ui.h("p", { class: "rotulo" }, "Período de teste"),
    cli.teste_ate ? ui.h("p", null, "Teste grátis até ", ui.h("b", null, ui.dataCurtaBR(cli.teste_ate)), dias === null ? "." : dias <= 0 ? " (termina hoje)." : ` (${dias} dia${dias === 1 ? "" : "s"}).`)
      : ui.h("p", null, "Esta empresa está em teste grátis (sem data de fim definida)."),   // plano 1500c · UC-039
    cli.teste_ate ? ui.h("p", { class: "fraco" }, "Depois dessa data você só consegue consultar. Para continuar, peça a assinatura.") : null,
    ui.h("div", { class: "linha" }, planos, continuar, falar, ocultar)), { largura: 300 });
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
    // plano 2000d · DU-452: com mais de uma empresa, o celular mostra o nome curto ao lado do avatar (o nome inteiro some abaixo de 480 px)
    conteudo.push(ui.h("span", { class: "emp-curto", "aria-hidden": "true" }, E.M.rotas.nomeCurtoEmpresa ? E.M.rotas.nomeCurtoEmpresa(cli.nome) : cli.nome));
    const bt = ui.h("button", { type: "button", class: "empresa-bt", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": `Empresa ativa: ${cli.nome}. Trocar de empresa` },
      conteudo, ui.icone("seta-baixo"));
    bt.addEventListener("click", () => abrirSeletorEmpresa(bt));
    alvo.appendChild(bt);
    if (topo) topo.classList.add("topo-emp-troca");
  }
  const pilula = pilulaDeTeste(cli);
  if (pilula) { alvo.appendChild(pilula); if (topo) topo.classList.add("topo-pilula-on"); }
}

/** Plano 1000 (AS-254): o que a lista de empresas sinaliza quando a sessão traz — número de WhatsApp caído, teste acabando (≤ 3 dias) ou vencido,
    empresa pausada. → [{texto, cor, icone}] (vazio quando está tudo bem ou a sessão não diz). */
function sinaisDaEmpresa(c, hoje = hojeServidor()) {
  const s = [];
  if (!c) return s;
  const caidos = Array.isArray(c.canais) ? c.canais.filter(x => x && x.estado === "desconectado").length : 0;
  if (caidos) s.push({ texto: caidos === 1 ? "número caído" : `${caidos} números caídos`, cor: "ruim", icone: "alerta" });
  if (c.status === "teste" && c.teste_ate) {
    const dias = Math.round((Date.parse(`${c.teste_ate}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / DIA_MS);
    if (Number.isFinite(dias) && dias < 0) s.push({ texto: "teste vencido", cor: "ruim", icone: "cadeado" });
    else if (Number.isFinite(dias) && dias <= 3) s.push({ texto: dias === 0 ? "teste acaba hoje" : `teste: ${dias} dia${dias === 1 ? "" : "s"}`, cor: "aten", icone: "relogio" });
  }
  if (c.ativo === false) s.push({ texto: "pausada", cor: "aten", icone: "pausa" });
  return s;
}

function abrirSeletorEmpresa(ancora) {
  const { ui } = E;
  const lista = E.sessao.clientes;
  const busca = lista.length > 8 ? ui.h("input", { type: "search", class: "flut-busca", placeholder: "Buscar empresa", "aria-label": "Buscar empresa" }) : null;
  // plano 1000b · UB-132: grupo de botões com aria-current (listbox exigiria setas e aria-selected; option não pode ser botão)
  const caixa = ui.h("div", { class: "empresa-lista", role: "group", "aria-label": "Empresas" });
  let flut = null;
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const desenhar = () => {
    ui.limpar(caixa);
    const q = busca ? norm(busca.value) : "";
    const achados = lista.filter(c => !q || norm(c.nome).includes(q) || norm(c.slug).includes(q));
    for (const c of achados.slice(0, 200)) {
      const sinais = sinaisDaEmpresa(c);
      const b = ui.h("button", { type: "button", class: "empresa-op", "aria-current": E.cliente && c.id === E.cliente.id ? "true" : null },
        ui.avatar(c.nome, c.id),
        ui.h("span", null, ui.h("b", null, c.nome), ui.h("small", null, [c.org_nome, c.suporte ? "suporte" : E.M.vocab.ROTULO_PAPEL[c.papel], c.status !== "ativo" ? E.M.vocab.ROTULO_STATUS[c.status] : null].filter(Boolean).join(" · ")),
          sinais.length ? ui.h("span", { class: "empresa-sinais" }, sinais.map(s => ui.pilula(s.texto, s.cor, { icone: s.icone, tamanho: "p" }))) : null));
      // AS-175: trocar de empresa desmonta a tela — a guarda de rota (formulário sem salvar) pergunta antes
      b.addEventListener("click", async () => {
        if (flut) flut.fechar();
        if (E.cliente && c.id === E.cliente.id) return;
        if (!(await podeSairDaRota({ motivo: "empresa" }))) return;
        await escolherCliente(c.id);
      });
      caixa.appendChild(b);
    }
    if (!achados.length) caixa.appendChild(ui.h("p", { class: "flut-vazio" }, "Nenhuma empresa com esse nome."));
  };
  if (busca) busca.addEventListener("input", desenhar);
  // plano 1000b · UB-133: Enter na busca escolhe o 1º resultado (o único, quando a busca já filtrou)
  if (busca) busca.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" || ev.isComposing) return;
    const primeiro = caixa.querySelector(".empresa-op");
    if (!primeiro) return;
    ev.preventDefault();
    primeiro.click();
  });
  desenhar();
  flut = ui.flutuante(ancora, ui.h("div", { class: "pilha-p" }, ui.h("p", { class: "rotulo" }, "Trocar de empresa"), busca, caixa), { largura: 320, rotulo: "Trocar de empresa" });   // UB-138
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
    // plano 2000d · DU-128: «Ficar ausente» leva direto aos avisos do Perfil (onde está a ausência)
    E.cliente && E.cliente.modulos && E.cliente.modulos.includes("conversas") ? { rotulo: "Ficar ausente", icone: "relogio", fn: () => navegar("#/config/perfil?secao=avisos#cfg-pf-avisos") } : null,
    { rotulo: "Configurações", icone: "engrenagem", fn: () => navegar("#/config") },
    { rotulo: "Aparência", icone: { claro: "sol", escuro: "lua", marca: "pincel" }[esquemaPreferido()] || "sol", fn: () => abrirMenuTema(ancora) },
    { rotulo: novidadesPendentes() ? "Ajuda · há novidades" : "Ajuda", icone: "ajuda", fn: () => abrirMenuAjuda(ancora) },   // plano 2000d · DU-286
    modoInstalacao() ? { rotulo: "Instalar o app", icone: "baixar", fn: () => instalarApp() } : null,
    // app instalado não tem o botão de recarregar do navegador: se uma tela travar, a saída é esta
    E.pwaMod && E.pwaMod.emStandalone() ? { rotulo: "Recarregar", icone: "reabrir", fn: () => location.reload() } : null,
    // plano 1500c · UC-030: borra os dados de clientes para mostrar a tela a alguém (só nesta aba)
    E.cliente ? { rotulo: emApresentacao() ? "Desligar modo apresentação" : "Modo apresentação", icone: "olho", fn: () => alternarApresentacao() } : null,
    "-",
    { rotulo: "Sair", icone: "sair", fn: () => sair() },
  ].filter(Boolean));
  // plano 2000d · DU-286: ponto discreto na conta enquanto houver novidade da versão não aberta
  const temNovidade = novidadesPendentes();
  const btPe = ui.h("button", { type: "button", class: "lat-conta", "aria-label": `Conta de ${c.nome}${temNovidade ? " (há novidades desta versão)" : ""}`, dataset: { novidade: temNovidade ? "1" : null } },
    ui.avatar(c.nome, c.id), ui.h("span", null, ui.h("b", null, c.nome), ui.h("small", null, papelTxt)));
  btPe.addEventListener("click", () => abrirMenuConta(btPe));
  pe.appendChild(btPe);
  // topo: busca Ctrl/⌘+K, sino e avatar
  desenharFerramentasTopo(dir);
  const btTopo = ui.h("button", { type: "button", class: "bt-icone", id: "bt-conta-topo", "aria-label": `Conta de ${c.nome}` }, ui.avatar(c.nome, c.id));   // plano 1500c · UCC-098: o tour aponta para ele
  btTopo.addEventListener("click", () => abrirMenuConta(btTopo));
  dir.appendChild(btTopo);
}

/** Produtos, tema (no celular o tema vai para o menu da conta), paleta Ctrl/⌘+K e sino (este só com uma empresa ativa). */
function desenharFerramentasTopo(dir) {
  const { ui } = E;
  if (E.sessao) {
    // plano 2000d · DU-154/DU-197: nomes e resumos calculados — numa revenda o Ads é «Anúncios» (nunca o nome da plataforma); o resumo só promete o que o plano tem
    const R = E.M.rotas;
    const padraoMarca = (E.produto || "") === "Órbita";
    const nomesProd = R.nomesProdutos ? R.nomesProdutos({ padrao: padraoMarca }) : {};
    const prodAberto = E.workspace ? R.PRODUTOS[E.workspace] : null;
    const resumoAberto = prodAberto ? (R.resumoDoProduto ? R.resumoDoProduto(E.workspace, E.cliente ? E.cliente.modulos : null) : prodAberto.resumo) : "";
    const trocar = R.textoTrocarProdutos ? R.textoTrocarProdutos({ padrao: padraoMarca }) : "Trocar de produto";
    const btProdutos = ui.h("button", { type: "button", class: "topo-produtos", "aria-haspopup": "dialog", title: prodAberto ? resumoAberto : trocar,
      "aria-label": prodAberto ? `${R.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name}: ${resumoAberto} Trocar de produto` : trocar },
      ui.icone(E.M.rotas.iconeDoProduto(E.workspace, E.cliente ? E.M.vocab.vocab(E.cliente.vertical).icone_crm : "funil")), ui.h("span", null, prodAberto ? (nomesProd[E.workspace] || prodAberto.nome) : "Produtos"));
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
  // plano 1500c · UCC-035: relativo à página do app (o espelho do GitHub Pages mora em /nexus-ads/app/)
  const base = E.M.rotas.urlProduto(id, { base: location.pathname });
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
  // plano 1500c · UCC-094: produto fora do plano da empresa ganha o selo «Não incluso»; o toque abre o «Conhecer» (o que ele faz + pedir)
  const modulos = E.cliente ? E.cliente.modulos : null;
  const nomesProd = rotas.nomesProdutos ? rotas.nomesProdutos({ padrao: (E.produto || "") === "Órbita" }) : {};   // plano 2000d · DU-154
  let janela = null;
  const grade = ui.h("div", { class: "produto-grade" }, Object.entries(rotas.PRODUTOS).map(([id, item0]) => {
    const item = { ...item0, nome: nomesProd[id] || item0.nome, resumo: rotas.resumoDoProduto ? rotas.resumoDoProduto(id, modulos) : item0.resumo };
    const atual = id === E.workspace;
    const incluso = !modulos || !rotas.produtoIncluso || rotas.produtoIncluso(id, modulos);
    const b = ui.h("button", { type: "button", class: ["produto-op", !incluso && "produto-op-fora"], "aria-current": atual ? "page" : null },
      ui.h("span", { class: "produto-op-icone" }, ui.icone(id === "crm" ? "funil" : id === "ads" ? "anuncio" : "chat")),
      ui.h("span", { class: "produto-op-corpo" }, ui.h("b", null, item.nome), ui.h("small", null, item.resumo)),
      atual ? ui.h("span", { class: "produto-op-atual" }, "Aberto") : !incluso ? ui.h("span", { class: "produto-op-selo" }, "Não incluso") : ui.icone("seta-dir"));
    b.addEventListener("click", () => {
      if (!incluso) { if (janela && janela.fechar) janela.fechar(null); setTimeout(() => conhecerProduto(id), 0); return; }
      const href = urlWorkspace(id); if (href) location.assign(href);
    });
    return b;
  }));
  ui.modal({ titulo: "Seus produtos", corpo: ui.h("div", { class: "pilha-p" }, grade,
    ui.h("p", { class: "produto-nota" }, "Os três produtos usam a mesma conta, empresa e histórico. Plano e permissões da empresa continuam valendo em cada área.")),
    acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: modal => {
      janela = modal;
      const atual = modal.el?.querySelector?.('.produto-op[aria-current="page"]');
      const primeiro = atual || modal.el?.querySelector?.(".produto-op");
      if (primeiro) primeiro.focus();
    } });
}

/** plano 1500c · UCC-094: «Conhecer» um produto fora do plano — o que ele resolve e o caminho para pedir (registra o interesse). */
function conhecerProduto(id) {
  const { ui } = E, rotas = E.M.rotas;
  const item0 = rotas.PRODUTOS[id];
  if (!item0) return;
  const item = { ...item0, nome: rotas.nomesProdutos ? rotas.nomesProdutos({ padrao: (E.produto || "") === "Órbita" })[id] || item0.nome : item0.nome };   // plano 2000d · DU-154
  if (E.api && E.api.evento) E.api.evento("conhecer_produto", { produto: id });
  const lista = rotas.beneficiosDe ? rotas.beneficiosDe(id) : [];
  const admin = rotas.podePapel(papelAtual(), "admin");
  ui.modal({ titulo: item.nome, largura: "p", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", null, item.resumo),
      lista.length ? ui.h("ul", { class: "beneficios" }, lista.map(b => ui.h("li", null, ui.icone("check"), ui.h("span", null, b)))) : null,
      ui.h("p", { class: "fraco" }, admin ? "Não faz parte do plano atual da empresa." : "Não faz parte do plano atual. Quem pode incluir é o administrador da empresa.")),
    acoes: [{ rotulo: "Fechar", tipo: "neutro" }, admin ? { rotulo: "Pedir este módulo", tipo: "primario", fn: async () => { await pedirModulo(rotas.PLANO_DO_PRODUTO[id] || id); return true; } } : null].filter(Boolean) });
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
/** CR-186: a busca de dados respondeu 404 há menos de 10 min (E.buscaFora guarda o instante; true de versões antigas vale como «agora»). */
const BUSCA_FORA_MS = 10 * 60 * 1000;
function buscaForaAgora(agora = Date.now()) {
  const t = E.buscaFora === true ? agora : Number(E.buscaFora) || 0;
  if (t && agora - t < BUSCA_FORA_MS) return true;
  E.buscaFora = 0;
  return false;
}
function gruposDeDados() {
  const c = E.cliente;
  if (!c || buscaForaAgora() || !c.modulos.includes("crm") || !pronto("crm")) return [];
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
    // plano 2000d · DU-283: quantos produtos a empresa tem (o «Trocar de produto» só com 2+); DU-281: o modo foco; DU-239: passos dispensados
    produtosLiberados: cli ? Object.keys(rotas.PRODUTOS).filter(id => !rotas.produtoIncluso || rotas.produtoIncluso(id, cli.modulos)).length : 0,
    outrosProdutos: cli && rotas.nomesProdutos ? Object.keys(rotas.PRODUTOS).filter(id => id !== E.workspace && (!rotas.produtoIncluso || rotas.produtoIncluso(id, cli.modulos)))
      .map(id => rotas.nomesProdutos({ padrao: (E.produto || "") === "Órbita" })[id]) : [],
    modoFoco: document.documentElement.classList.contains("modo-foco"),
    passosDispensados: !!(E.onbDispensado),
    // plano 1500c · UC-012/UC-037: «Comece aqui» só para a equipe com passo pendente; «Novidades» quando a versão nova trouxe notas
    passosEquipe: !!(cli && !rotas.podePapel(papelAtual(), "admin") && estadoComeceAqui() && !estadoComeceAqui().completo),
    novidades: novidadesDestaVersao().length > 0,
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
  // plano 2000d · DU-285: empresa, tela, versão e aparelho já vão na mensagem (nada de dado de cliente)
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const aparelho = `${String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || "").slice(0, 30)}${typeof innerWidth === "number" ? ` · ${innerWidth} px` : ""}`.trim();
  const texto = E.M.comandos && E.M.comandos.textoSuporte ? E.M.comandos.textoSuporte({ app, tela: E.titulo, empresa: E.cliente ? E.cliente.nome : "", versao: VERSAO, aparelho })
    : `Olá! Preciso de ajuda no ${app}.`;
  window.open(E.ui.linkWhatsApp(texto, wa), "_blank", "noopener,noreferrer");
}
/** plano 2000d · DU-281: modo foco — recolhe o menu lateral e esconde as faixas que não bloqueiam; vale nesta aba até sair. */
function alternarModoFoco(on = !document.documentElement.classList.contains("modo-foco")) {
  document.documentElement.classList.toggle("modo-foco", !!on);
  try { if (on) sessionStorage.setItem("nx-modo-foco", "1"); else sessionStorage.removeItem("nx-modo-foco"); } catch { /* vale até recarregar */ }
  if (E.ui) E.ui.anunciar(on ? "Modo foco ligado: menu lateral e avisos escondidos." : "Modo foco desligado.");
  return !!on;
}
/** plano 2000d · DU-284: «Recarregar o app» com texto não enviado pergunta antes (o rascunho fica guardado, mas o formulário aberto se perde). */
async function recarregarComCuidado(recarregar = () => location.reload()) {
  if (ocupadoParaAtualizar()) {
    const ok = await E.ui.confirmar({ titulo: "Recarregar agora?", rotulo: "Recarregar", icone: "alerta",
      texto: "Há texto digitado ou um formulário mexido nesta tela. Os rascunhos de mensagem ficam guardados, mas o que não foi salvo no formulário se perde." });
    if (!ok) return false;
  }
  recarregar();
  return true;
}
/** plano 2000d · DU-270: as automações da empresa para a paleta (lidas uma vez por abertura, 60 s de memória). */
function automacoesParaPaleta() {
  const cli = E.cliente;
  if (!cli || !E.api || !cli.modulos.includes("automacoes") || !E.M.rotas.podePapel(papelAtual(), "supervisor")) return;
  const memo = E.autoPaleta && E.autoPaleta.cli === cli.id && Date.now() - E.autoPaleta.em < 60000;
  if (memo) return;
  E.autoPaleta = { cli: cli.id, em: Date.now(), lista: E.autoPaleta && E.autoPaleta.cli === cli.id ? E.autoPaleta.lista : [] };
  Promise.resolve().then(() => (E.api.rpcC ? E.api.rpcC("nx_automacoes_listar") : E.api.rpc("nx_automacoes_listar", {})))
    .then(r => { const l = Array.isArray(r) ? r : (r && Array.isArray(r.itens) ? r.itens : r && Array.isArray(r.automacoes) ? r.automacoes : []); if (E.autoPaleta && E.autoPaleta.cli === cli.id) E.autoPaleta.lista = l; })
    .catch(() => { /* sem a lista: a paleta não mostra automações */ });
}
async function alternarAutomacaoPelaPaleta(a) {
  if (a.ativo && !(await E.ui.confirmar({ titulo: `Desligar «${a.nome}»?`, rotulo: "Desligar", perigo: true, icone: "pausa",
    texto: "Enquanto estiver desligada, ela não roda para ninguém. Dá para ligar de novo a qualquer momento." }))) return false;
  try {
    await (E.api.rpcC ? E.api.rpcC("nx_automacao_ativar", { p_id: a.id, p_ativo: !a.ativo }) : E.api.rpc("nx_automacao_ativar", { p_id: a.id, p_ativo: !a.ativo }));
    if (E.autoPaleta) E.autoPaleta.em = 0;
    E.ui.toast(a.ativo ? `«${a.nome}» desligada.` : `«${a.nome}» ligada.`, { tipo: "ok" });
    return true;
  } catch (e) { E.ui.toast(E.api.mensagemErro(e), { tipo: "erro" }); return false; }
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
    "primeiros-passos": () => abrirPrimeirosPassos(),   // plano 1500c · UC-011
    "suporte": () => falarComSuporte(),
    "sair": () => sair(),
    // plano 1500c · UCC-082…085
    "central-ajuda": () => navegar("#/ajuda"),
    "ver-plano": () => { if (E.api && E.api.evento) E.api.evento("ver_plano", { origem: "paleta" }); navegar("#/config/plano"); },
    "tour": () => iniciarTour({ forcar: true }),
    "recarregar": () => recarregarComCuidado(),   // plano 2000d · DU-284
    "bloquear-tela": () => bloquearTela(),        // plano 2000d · DU-141
    "modo-foco": () => alternarModoFoco(),        // plano 2000d · DU-281
    "reabrir-passos": () => { E.onbDispensado = false; if (E.api && E.api.rpc) E.api.rpc("nx_onboarding_marcar", { p_passo: "reabrir" }).catch(() => {}); navegar("#/inicio?passos=1"); },   // plano 2000d · DU-239
    "notificacoes": () => { const b = $("bt-sino"); if (b) abrirSino(b); else E.ui.toast("Escolha uma empresa para ver as notificações.", { tipo: "info" }); },
    // plano 1500c · UC-028: o Configurações e o CRM leem a query (convidar=1, assistente=novo, importar=1) — pendência das frentes config/crm;
    // até lá a pessoa chega na tela certa
    "convidar-pessoa": () => navegar("#/config/equipe?convidar=1"),
    "conectar-whatsapp": () => navegar("#/config/numeros?assistente=novo"),
    "importar-contatos": () => navegar("#/crm?importar=1"),
    "comece-aqui": () => abrirComeceAqui(),          // plano 1500c · UC-012
    "novidades": () => abrirNovidades(),             // plano 1500c · UC-037
    "situacao-servicos": () => abrirSituacaoServicos(),   // plano 1500c · UC-038
  };
}

/** Plano 1000 (pedido do CRM): «Novo paciente» e «Cadastrar «x» como paciente» na paleta de QUALQUER tela (antes só dentro do CRM). Quando o CRM
    está aberto ele registra o próprio comando com o mesmo rótulo e o juntarAcoes tira este. A ficha abre por cima da tela atual (crm-listas.formContato)
    e o aviso traz «Abrir». */
function acaoNovoContato(a) {
  if (!a.rotaOk("crm") || !a.pode("atendente")) return null;
  const v = a.vocab;
  const cadastrar = async (pre = {}) => {
    try {
      const m = await carregar("crm");
      const k = await m.kit(ctxDaAcao());
      const L = await k.mod("listas");
      const c = await L.formContato(k, pre);
      if (!c) return;
      E.ui.toast(`${v.contato} cadastrad${v.art("contato")}.`, { tipo: "ok", ms: 6000, acao: { rotulo: "Abrir", fn: () => navegar(`#/contatos/${encodeURIComponent(c.id)}`) } });
    } catch (e) { console.error(e); E.ui.toast("Não foi possível abrir o cadastro.", { tipo: "erro" }); }
  };
  return { id: "novo-contato", rotulo: v.novo("contato"), palavras: "paciente contato cliente cadastrar criar novo pessoa", icone: "contato", atalho: "", origem: "shell", grupo: "Criar",
    fazer: () => cadastrar(),
    rotuloTermo: t => `Cadastrar «${t}» como ${v.min("contato")}`,
    comTermo: t => cadastrar(/^[+\d\s().-]{8,}$/.test(t) && t.replace(/\D/g, "").length >= 8 ? { telefone: t } : { nome: t }) };
}

function destinosDaPaleta() {
  const v = E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico");
  const base = E.M.comandos.destinos(E.M.rotas.itensDoMenu({ op: opcoesAcesso(), vocab: v, workspace: E.workspace, prontos: E.prontos.MODULOS_PRONTOS, dev: devLigado() }));
  // plano 1000b · UB-101: as seções das Configurações também fora do hub (com o hub aberto, os comandos config.<id> dele já estão lá)
  let registrados = new Set();
  try { registrados = new Set((E.comandos ? E.comandos.listar() : []).map(c => c && c.id).filter(Boolean)); } catch { /* ok */ }
  return [...base, ...destinosDeConfig({
    pronta: configPronta, pode: min => E.M.rotas.podePapel(papelAtual(), min), gestor: !!(E.sessao && E.sessao.conta && E.sessao.conta.papel === "gestor"),
    cliente: E.cliente, registrados })];
}

/** Plano 1000b · UB-101: o catálogo das seções do hub #/config para a paleta do shell (o hub carrega as seções sob demanda; aqui só id, título e
    quem vê — testes/plano1000b-sis confere cada título contra o config.js e os *-config.js). Regras de visibilidade como o visivel() do config.js. */
const SECOES_CONFIG_PALETA = Object.freeze([
  { id: "perfil", titulo: "Perfil", palavras: "senha nome celular conta", semCliente: true },
  { id: "usuarios", titulo: "Usuários e convites", palavras: "equipe convidar pessoas acesso papel", papelMin: "admin" },
  { id: "dominio", titulo: "Domínio próprio", palavras: "dns endereco url", conta: "gestor" },
  { id: "plano", titulo: "Plano e uso", palavras: "limite cota assinatura", papelMin: "admin" },
  { id: "funis", titulo: "Funis e etapas", palavras: "pipeline funil etapa", papelMin: "admin", modulo: "crm" },
  { id: "campos", titulo: "Campos personalizados", palavras: "campo cadastro", papelMin: "admin", modulo: "crm" },
  { id: "etiquetas", titulo: "Etiquetas", palavras: "tag marcador", papelMin: "supervisor", modulo: "crm" },
  { id: "motivos", titulo: "Motivos de perda", palavras: "perdido perda", papelMin: "admin", modulo: "crm" },
  { id: "numeros", titulo: "Números de WhatsApp", palavras: "whatsapp numero conectar codewords meta", papelMin: "admin", modulo: "conversas" },
  { id: "respostas", titulo: "Respostas rápidas", palavras: "atalho frase pronta", papelMin: "supervisor", modulo: "conversas" },
  { id: "atendimento", titulo: "Preferências do atendimento", palavras: "assinatura leitura", papelMin: "admin", modulo: "conversas" },
  { id: "ia", titulo: "Assistente de IA", palavras: "ia robo inteligencia", papelMin: "admin", modulo: "conversas" },
  { id: "departamentos", titulo: "Departamentos e horários", palavras: "horario expediente setor", papelMin: "admin", modulo: "conversas" },
  { id: "anuncios", titulo: "Anúncios", palavras: "meta google facebook contas", papelMin: "gestor", modulo: "ads" },
  { id: "formulario", titulo: "Formulário do site", palavras: "site form lead", papelMin: "admin", modulo: "crm" },
  { id: "agenda", titulo: "Agenda", palavras: "horario duracao feriado", papelMin: "admin", modulo: "crm" },
  { id: "rastreio", titulo: "Site e anúncios", palavras: "script rastreio utm campanha", papelMin: "admin", modulo: "crm" },
]);
function destinosDeConfig({ pronta, pode, gestor, cliente, registrados = new Set() }) {
  const out = [];
  for (const s of SECOES_CONFIG_PALETA) {
    if (registrados.has(`config.${s.id}`)) continue;
    if (typeof pronta === "function" && !pronta(s.id)) continue;
    if (s.conta === "gestor") { if (!gestor) continue; }
    else if (!s.semCliente) {
      if (!cliente) continue;
      if (s.modulo && !(Array.isArray(cliente.modulos) && cliente.modulos.includes(s.modulo))) continue;
      if (s.papelMin && !(typeof pode === "function" && pode(s.papelMin))) continue;
    }
    out.push({ id: `config.${s.id}`, rotulo: `Configurações: ${s.titulo}`, hash: `#/config/${s.id}`, icone: "engrenagem",
      palavras: `configuracoes ajustes ${s.palavras || ""}`, emConstrucao: false });
  }
  return out;
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
    // CR-186: busca ausente (404) desliga por 10 min, não pela sessão inteira — a migração pode entrar com o app aberto
    if (e && (e.status === 404 || /could not find the function/i.test(String(e.codigo)))) { E.buscaFora = Date.now(); return { grupos: [], aviso: "A busca de dados chega em breve." }; }
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
  const novoContato = acaoNovoContato(a);
  const { daTela, geral } = C.juntarAcoes([...C.acoesPadrao(a, acoesDoShell()), ...(novoContato ? [novoContato] : [])], E.comandos.listar());
  const gs = gruposDeDados();
  const v = a.vocab;
  const rec = recentesDaEmpresa();
  // plano 50 · 59: os últimos comandos executados neste aparelho (por conta) voltam como «Usados por último»
  let ult = null;
  try { if (typeof C.criarUltimosComandos === "function") ult = C.criarUltimosComandos({ armazenamento: localStorage, chave: C.chaveUltimos(E.sessao.conta.id) }); } catch { ult = null; }
  const que = gs.includes("contatos") ? `${v.contatos.toLowerCase()}, ${v.negocios.toLowerCase()}${gs.includes("conversas") ? " e conversas" : ""}` : gs.includes("conversas") ? "conversas" : "";
  return {
    ui: E.ui, C, destinos: destinosDaPaleta(), acoes: geral, daTela, inicial,
    placeholder: que ? `Buscar ${que} ou digitar um comando` : "Ir para uma tela ou executar um comando",
    recentes: () => (rec ? rec.ler() : []),
    ultimos: () => (ult ? ult.ler() : []),
    buscarDados: gs.length ? buscarNaPaleta : null,
    // plano 1500c · UC-014: artigos da Central de ajuda na paleta (o arquivo é carregado junto da paleta; sem ele, nada muda)
    ajuda: E.ajudaMod ? termo => E.ajudaMod.artigosDaPaleta(termo, { vocab: v }) : null,
    // plano 1500c · UCC-138: «Trocar para <empresa>» pelo nome
    empresas: typeof C.empresasDaPaleta === "function" ? termo => C.empresasDaPaleta(E.sessao ? E.sessao.clientes : [], termo, { atualId: E.cliente && E.cliente.id })
      .map(e => ({ ...e, fazer: async () => { if (await podeSairDaRota()) escolherCliente(e.id); } })) : null,
    // plano 2000d · DU-270: automações pelo nome (Abrir · Ligar/Desligar)
    automacoes: E.autoPaleta && E.autoPaleta.cli === (E.cliente && E.cliente.id) ? termo => C.automacoesDaPaleta(E.autoPaleta.lista, termo)
      .map(a => ({ ...a, hash: "#/automacoes", abrir: () => navegar(`#/automacoes?abrir=${encodeURIComponent(a.id)}`), alternar: () => alternarAutomacaoPelaPaleta(a) })) : null,
    // plano 2000d · DU-275: «Limpar recentes» nesta empresa
    limparRecentes: rec ? () => { rec.limpar(); E.ui.anunciar("Recentes apagados deste aparelho."); } : null,
    navegar, mensagemErro: E.api.mensagemErro,
    aoEscolher: it => {
      if (rec && it.hash && it.tipo) rec.registrar({ hash: it.hash, titulo: it.titulo, sub: it.sub, tipo: it.tipo });
      if (ult && it.id && typeof it.fazer === "function") ult.registrar(it.id);
    },
  };
}

/** plano 1000b · UB-127: há uma janela modal aberta que NÃO é a própria paleta (.busca-g)? Então o Ctrl/⌘+K não faz nada. */
function outroDialogoAberto(doc) {
  try { return [...doc.querySelectorAll("dialog[open]")].some(d => !d.classList.contains("busca-g")); } catch { return false; }
}

let paletaAbrindo = false;
/** Ctrl/⌘+K, o botão «Buscar» do topo e o prefixo «>»: abre a paleta; apertar de novo fecha. */
async function abrirPaleta(inicial = "") {
  if (!E.sessao || !$("app") || $("app").hidden) return;
  if (E.paleta.janela) { E.paleta.janela.fechar(); return; }
  if (paletaAbrindo) return;
  paletaAbrindo = true;
  try {
    automacoesParaPaleta();   // plano 2000d · DU-270: a lista chega enquanto a paleta carrega (sem esperar)
    if (!E.paleta.mod) E.paleta.mod = await arq("paleta.js");
    if (!E.ajudaMod) try { E.ajudaMod = await arq("ajuda.js"); } catch { E.ajudaMod = null; }   // plano 1500c · UC-014
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
async function abrirMenuAjuda(ancora) {
  const a = ambienteComandos();
  // plano 1500c · UCC-038/UC-015: Central de ajuda e «Ajuda desta tela» (o artigo da rota aberta num painel, sem sair da tela)
  let artigoDaTela = null;
  try {
    const aj = await arq("ajuda.js");
    const r = E.M.rotas.rotear(location.hash);
    const art = aj.artigoDaRota(r.modulo);
    if (art) artigoDaTela = () => abrirArtigoNoPainel(aj, art);
  } catch { /* sem o arquivo: o menu fica como antes */ }
  E.ui.menu(ancora, [
    { rotulo: "Central de ajuda", icone: "ajuda", fn: () => navegar("#/ajuda") },
    { rotulo: "Fazer o tour", icone: "info", fn: () => iniciarTour({ forcar: true }) },   // plano 1500c · UCC-097
    artigoDaTela ? { rotulo: "Ajuda desta tela", icone: "info", fn: artigoDaTela } : null,
    a.rotaOk("inicio") && a.pode("admin") ? { rotulo: "Primeiros passos", icone: "check", fn: () => abrirPrimeirosPassos() } : null,   // plano 1500c · UC-011
    a.passosEquipe ? { rotulo: `Comece aqui (${estadoComeceAqui().feitos}/${estadoComeceAqui().total})`, icone: "check", fn: () => abrirComeceAqui() } : null,   // plano 1500c · UC-012
    a.novidades ? { rotulo: novidadesPendentes() ? "Novidades desta versão (nova)" : "Novidades desta versão", icone: "info", fn: () => abrirNovidades() } : null,   // plano 1500c · UC-037 · plano 2000d · DU-286
    E.cliente ? { rotulo: "Situação dos serviços", icone: "info", fn: () => abrirSituacaoServicos() } : null,   // plano 1500c · UC-038
    { rotulo: "Atalhos de teclado", icone: "ajuda", fn: () => abrirAtalhos() },
    E.marca && E.marca.suporte_wa ? { rotulo: "Falar com o suporte", icone: "whatsapp", fn: () => falarComSuporte() } : null,
    "-",
    // o suporte pergunta «qual versão aparece aí?»: fica à vista e um toque copia
    { rotulo: `Versão ${VERSAO}`, icone: "info", fn: () => E.ui.copiar(VERSAO, { aviso: "Versão copiada." }) },
    { rotulo: "Sobre este app", icone: "ajuda", fn: () => abrirSobre() },
    { rotulo: "Limpar dados deste aparelho", icone: "lixeira", fn: () => limparAparelhoPeloMenu() },   // plano 1500c · UCC-133
  ].filter(Boolean));
}

/* plano 1500c · UCC-133: «Limpar dados deste aparelho» (o que o suporte pede quando algo travou): confirma, sai da conta e apaga o que o app
   guardou AQUI — telas guardadas, rascunhos, fila de saída, preferências nx-* e a cópia sem internet. Nada na nuvem é apagado. */
function chavesDoAppNoAparelho(ls) {
  const out = [];
  try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (typeof k === "string" && /^nx-/.test(k)) out.push(k); } } catch { /* sem storage */ }
  return out;
}
async function limparAparelhoPeloMenu() {
  const ok = await E.ui.confirmar({ titulo: "Limpar dados deste aparelho?", perigo: true, rotulo: "Limpar e sair", icone: "lixeira",
    texto: "Você sai da conta e o app apaga o que guardou neste aparelho: telas guardadas, rascunhos, mensagens ainda não enviadas e preferências. Seus dados na nuvem continuam intactos." });
  if (!ok) return false;
  await sair({ perguntar: false });
  try { for (const k of chavesDoAppNoAparelho(localStorage)) localStorage.removeItem(k); } catch { /* ok */ }
  try { if (typeof caches !== "undefined") for (const n of await caches.keys()) if (n.startsWith("orbita-")) await caches.delete(n); } catch { /* ok */ }
  E.ui.toast("Pronto: este aparelho está limpo.", { tipo: "ok" });
  return true;
}

/* ============================================================
   plano 1500c · lote sis-a3 — primeira semana, venda e diagnóstico
   ============================================================ */

/** plano 1500c · UC-034/UC-011: o checklist do Início (nx_onboarding_estado) para o shell — 60 s por empresa; erro ou servidor sem a função → null. */
function estadoOnboarding() {
  const cli = E.cliente;
  if (!cli || !E.api || !E.M.rotas.podePapel(papelAtual(), "admin")) return Promise.resolve(null);
  const memo = E.onbCache && E.onbCache.cli === cli.id && Date.now() - E.onbCache.em < 60000 ? E.onbCache : null;
  if (memo) return memo.p;
  const p = Promise.resolve().then(() => (E.api.rpcC ? E.api.rpcC("nx_onboarding_estado", {}) : E.api.rpc("nx_onboarding_estado", {}))).catch(() => null);
  E.onbCache = { cli: cli.id, em: Date.now(), p };
  return p;
}
/** plano 1500c · UC-034: o selo «3/9» junto do Início no menu lateral (some ao completar; sem o estado, nada aparece). */
function atualizarSeloPrimeirosPassos() {
  estadoOnboarding().then(est => {
    const s = est ? E.M.rotas.seloPrimeirosPassos(est) : null;
    // plano 2000d · DU-236: o selo diz qual é o próximo passo e quanto tempo leva
    const prox = s && E.M.rotas.proximoPasso ? E.M.rotas.proximoPasso(est) : null;
    const rotulo = s ? `${s.rotulo}${prox && prox.titulo ? `. Próximo: ${prox.titulo}${prox.tempo ? ` (${prox.tempo})` : ""}` : ""}` : "";
    for (const a of document.querySelectorAll('.nav-b[data-id="inicio"]')) {
      let selo = a.querySelector(".nav-passos");
      if (!s) { if (selo) selo.remove(); continue; }
      if (!selo) { selo = E.ui.h("span", { class: "nav-passos" }); a.appendChild(selo); }
      selo.textContent = s.texto;
      selo.setAttribute("title", rotulo);
      selo.setAttribute("aria-label", rotulo);
    }
    conferirMarcos(est);   // plano 2000d · DU-238
  }).catch(() => { /* sem selo */ });
}
/** plano 2000d · DU-238: os contadores de ativação (est.contadores: ia_respostas, automacoes_execucoes, conversas_respondidas — quando o servidor
    mandar) comemoram o 1º, o 10º e o 100º. A última contagem vista fica no aparelho: a primeira leitura só guarda (não comemora o passado). */
function conferirMarcos(est, { ls = LS, ui = E.ui, cli = E.cliente } = {}) {
  const cont = est && est.contadores && typeof est.contadores === "object" ? est.contadores : null;
  if (!cont || !cli || !E.M.rotas.marcoAtingido) return [];
  const chave = `nx-marcos:${cli.id}`;
  const visto = ls.ler(chave);
  const antes = visto && typeof visto === "object" ? visto : null;
  const ditos = [];
  for (const tipo of ["ia_respostas", "automacoes_execucoes", "conversas_respondidas"]) {
    const n = Number(cont[tipo]);
    if (!Number.isFinite(n)) continue;
    const m = antes ? E.M.rotas.marcoAtingido(antes[tipo], n) : null;
    const txt = m ? E.M.rotas.textoMarco(tipo, n) : null;
    if (txt) { ditos.push(txt); ui.toast(txt, { tipo: "ok", ms: 9000 }); }
  }
  ls.gravar(chave, Object.fromEntries(["ia_respostas", "automacoes_execucoes", "conversas_respondidas"].map(t => [t, Number(cont[t]) || 0])));
  return ditos;
}
/** plano 1500c · UC-011: «Primeiros passos» leva direto ao cartão (#/inicio?passos=1 — o Início rola até ele); tudo feito → «Tudo pronto». */
async function abrirPrimeirosPassos() {
  let est = null;
  try { est = await Promise.race([estadoOnboarding(), new Promise(r => setTimeout(() => r(null), 1500))]); } catch { est = null; }
  if (est && E.M.rotas.onboardingCompleto(est)) { E.ui.toast("Tudo pronto: nada pendente nos primeiros passos.", { tipo: "ok" }); return false; }
  navegar("#/inicio?passos=1");
  return true;
}

/* ---- plano 1500c · UC-012: «Comece aqui» de quem é da equipe ---- */
function lerPassosEquipe() {
  const conta = E.sessao && E.sessao.conta ? E.sessao.conta.id : null;
  const o = conta ? LS.ler(E.M.comandos.chavePassosEquipe(conta)) : null;
  return o && Array.isArray(o.feitos) ? o.feitos.filter(x => typeof x === "string").slice(0, 10) : [];
}
function marcarPassoEquipe(id) {
  if (!E.sessao || !E.M.comandos || !E.M.comandos.chavePassosEquipe) return;
  const feitos = lerPassosEquipe();
  if (feitos.includes(id)) return;
  LS.gravar(E.M.comandos.chavePassosEquipe(E.sessao.conta.id), { feitos: [...feitos, id] });
}
function permissaoDeAvisos() {
  try { return typeof Notification === "undefined" ? "sem" : Notification.permission; } catch { return "sem"; }
}
function estadoComeceAqui() {
  if (!E.sessao || !E.cliente || !E.M.comandos || !E.M.comandos.passosDaEquipe) return null;
  return E.M.comandos.passosDaEquipe({ feitos: lerPassosEquipe(), avisos: permissaoDeAvisos(), instalado: rodandoInstalado(),
    podeInstalar: !!modoInstalacao(), temConversas: !!(E.cliente.modulos && E.cliente.modulos.includes("conversas")) });
}
function rodandoInstalado() {
  try { return !!(E.pwaMod && E.pwaMod.emStandalone ? E.pwaMod.emStandalone() : matchMedia("(display-mode: standalone)").matches); } catch { return false; }
}
function abrirComeceAqui({ destaque = null } = {}) {
  const { ui } = E;
  const est = estadoComeceAqui();
  if (!est || !est.itens.length) return null;
  let janela = null;
  const fazer = {
    perfil: () => { marcarPassoEquipe("perfil"); navegar("#/config/perfil"); },
    avisos: () => pedirPermissaoAvisos(),
    instalar: () => instalarApp(),
    responder: () => navegar("#/conversas"),
  };
  const lista = ui.h("ul", { class: "passos-equipe" }, est.itens.map(it => {
    const bt = ui.h("button", { type: "button", class: "bt bt-sec bt-p", disabled: it.feito }, it.feito ? "Feito" : "Fazer agora");
    bt.addEventListener("click", () => { if (janela) janela.fechar(null); setTimeout(() => fazer[it.id] && fazer[it.id](), 0); });
    // plano 2000d · DU-227: o passo pedido (ex.: instalar, depois do convite) vem destacado
    return ui.h("li", { class: "passo-equipe", dataset: { feito: it.feito ? "1" : "0", destaque: destaque === it.id && !it.feito ? "1" : null } },
      ui.icone(it.feito ? "check" : "relogio"), ui.h("span", null, it.rotulo), bt);
  }));
  ui.modal({ titulo: "Comece aqui", largura: "p", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", { class: "sub" }, `${est.feitos} de ${est.total} feitos. Quatro coisas rápidas para trabalhar sem perder mensagem.`), lista),
    acoes: [{ rotulo: "Fechar", tipo: "neutro" }], aoAbrir: m => { janela = m; } });
  return est;
}
/** plano 1500c · UC-012: a primeira mensagem respondida (o Conversas dispara «nx:mensagem-enviada» — pendência da frente conv) marca o passo. */
function ouvirPassosDaEquipe() {
  if (E.ouvindoPassos) return;
  E.ouvindoPassos = true;
  document.addEventListener("nx:mensagem-enviada", () => marcarPassoEquipe("responder"));
}

/* ---- plano 1500c · UCC-121: antes do pedido nativo do navegador (que, recusado, não volta a perguntar), uma pergunta do próprio app ---- */
async function pedirPermissaoAvisos() {
  const perm = permissaoDeAvisos();
  if (perm === "sem") { E.ui.toast("Este navegador não mostra avisos na área de trabalho.", { tipo: "info" }); return "sem"; }
  if (perm === "granted") { marcarPassoEquipe("avisos"); E.ui.toast("Os avisos já estão ligados neste aparelho.", { tipo: "ok" }); return "granted"; }
  if (perm === "denied") {
    E.ui.toast("Os avisos estão bloqueados neste navegador. Libere em Configurações do site (o cadeado ao lado do endereço) e recarregue.", { tipo: "aten", ms: 10000 });
    return "denied";
  }
  const sim = await E.ui.confirmar({ titulo: "Avisar quando chegar mensagem?", rotulo: "Sim, avisar", icone: "sino",
    texto: "Com o app em outra aba ou minimizado, o computador mostra um aviso quando um cliente escrever. O navegador vai pedir a sua permissão em seguida." });
  if (!sim) return "default";
  let r = "default";
  try { r = await Notification.requestPermission(); } catch { r = "denied"; }
  if (r === "granted") { marcarPassoEquipe("avisos"); E.ui.toast("Pronto: os avisos estão ligados.", { tipo: "ok" }); }
  return r;
}

/* ---- plano 1500c · UC-037: novidades da versão (o pwa.js guarda as notas ao aplicar a atualização) ---- */
function novidadesDestaVersao() {
  try { return E.pwaMod && E.pwaMod.novidadesDaVersao ? E.pwaMod.novidadesDaVersao(localStorage, VERSAO).notas : []; } catch { return []; }
}
/** plano 2000d · DU-286: há notas desta versão que a pessoa ainda não abriu? (ponto discreto na conta e «nova» no item do menu) */
function novidadesPendentes() {
  try { if (!E.pwaMod || !E.pwaMod.novidadesDaVersao) return false; const n = E.pwaMod.novidadesDaVersao(localStorage, VERSAO); return n.notas.length > 0 && !n.abertas; } catch { return false; }
}
function abrirNovidades() {
  const notas = novidadesDestaVersao();
  if (!notas.length) { E.ui.toast("Esta versão não trouxe notas de novidade.", { tipo: "info" }); return null; }
  try { if (E.pwaMod && E.pwaMod.marcarNovidadesAbertas) E.pwaMod.marcarNovidadesAbertas(localStorage); } catch { /* ok */ }   // plano 2000d · DU-286
  for (const el of document.querySelectorAll("[data-novidade]")) delete el.dataset.novidade;
  return E.ui.modal({ titulo: "Novidades desta versão", largura: "p", protegerTexto: false,
    corpo: E.ui.h("ul", { class: "lista-novidades" }, notas.map(t => E.ui.h("li", null, t))), acoes: [{ rotulo: "Fechar", tipo: "primario" }] });
}
function avisarNovidades() {
  try {
    if (!E.pwaMod || !E.pwaMod.novidadesDaVersao) return;
    const n = E.pwaMod.novidadesDaVersao(localStorage, VERSAO);
    if (!n.notas.length || n.vistas) return;
    E.pwaMod.marcarNovidadesVistas(localStorage);
    E.ui.toast("Atualizado: veja o que mudou.", { tipo: "ok", ms: 9000, acao: { rotulo: "Ver", fn: () => abrirNovidades() } });
  } catch { /* sem armazenamento: sem aviso */ }
}

/* ---- plano 1500c · UC-038: «Situação dos serviços» — este aparelho, os números da empresa, a IA e a versão, num painel ---- */
function linhasSituacao({ rede = null, canais = null, ia = null, versao = VERSAO, dataHora = x => x } = {}) {
  const out = [];
  out.push({ rotulo: "Este aparelho", texto: rede === "offline" ? "sem internet" : rede === "lento" || rede === "instavel" ? "conexão instável" : "conectado", tom: rede === "offline" ? "ruim" : rede === "lento" || rede === "instavel" ? "aten" : "bom" });
  if (Array.isArray(canais)) {
    if (!canais.length) out.push({ rotulo: "WhatsApp", texto: "nenhum número conectado", tom: "aten" });
    for (const c of canais.slice(0, 8)) {
      const caiu = c && c.estado === "desconectado";
      const desde = c && (c.desde || c.estado_em) ? ` desde ${dataHora(c.desde || c.estado_em)}` : "";
      out.push({ rotulo: `WhatsApp ${c && (c.nome || c.numero) ? c.nome || c.numero : ""}`.trim(), texto: caiu ? `desconectado${desde}` : "conectado", tom: caiu ? "ruim" : "bom" });
    }
  }
  if (ia && typeof ia === "object") out.push({ rotulo: "Assistente de IA", texto: ia.ligada === false ? "desligado" : ia.cota_esgotada ? "cota do mês esgotada" : "ligado", tom: ia.cota_esgotada ? "aten" : ia.ligada === false ? "neutro" : "bom" });
  out.push({ rotulo: "Versão do app", texto: String(versao), tom: "neutro" });
  return out;
}
function abrirSituacaoServicos() {
  const { ui } = E;
  const cli = E.cliente;
  const linhas = linhasSituacao({ rede: E.rede ? E.rede.estado : null, canais: cli && Array.isArray(cli.canais) ? cli.canais : null,
    ia: cli && cli.ia && typeof cli.ia === "object" ? cli.ia : null, dataHora: x => { try { return ui.dataHoraBR ? ui.dataHoraBR(x) : String(x); } catch { return String(x); } } });
  const admin = E.M.rotas.podePapel(papelAtual(), "admin");
  const lista = ui.h("ul", { class: "situacao-lista" }, linhas.map(l => ui.h("li", { class: "situacao-it", dataset: { tom: l.tom } },
    ui.h("span", { class: "situacao-ponto", "aria-hidden": "true" }), ui.h("b", null, l.rotulo), ui.h("span", null, l.texto))));
  let g = null;
  const numeros = admin && cli ? ui.h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { if (g) g.fechar(); navegar("#/config/numeros"); } } }, "Configurações › Números") : null;
  g = ui.gaveta({ titulo: "Situação dos serviços", corpo: ui.h("div", { class: "pilha-p" }, lista), largura: "p", protegerTexto: false, acoes: numeros });
  return linhas;
}

/* ---- plano 1500c · UC-003: «Quero continuar» — o pedido de contratação pronto para copiar ou mandar ao suporte ---- */
function abrirPedidoDeContratacao(cli = E.cliente, origem = "teste") {
  const { ui } = E;
  if (!cli) return null;
  if (E.api && E.api.evento) E.api.evento("quero_continuar", { origem });
  const revenda = E.sessao && E.sessao.org && E.sessao.org.nome ? E.sessao.org.nome : "";
  const texto = E.M.rotas.textoPedidoContratacao({ produto: E.produto, empresa: cli.nome, plano: cli.plano, revenda });
  const wa = E.marca && E.marca.suporte_wa;
  const admin = E.M.rotas.podePapel(papelAtual(), "admin");
  const acoes = [{ rotulo: "Copiar o pedido", tipo: wa ? "neutro" : "primario", icone: "copiar", fn: async () => { await ui.copiar(texto, { aviso: "Pedido copiado." }); return true; } }];
  if (wa) acoes.push({ rotulo: "Enviar no WhatsApp", tipo: "primario", icone: "whatsapp", fn: () => { window.open(ui.linkWhatsApp(texto, wa), "_blank", "noopener"); return true; } });
  return ui.modal({ titulo: "Quero continuar", largura: "p", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p" },
      ui.h("p", { class: "sub" }, revenda ? `Mande este pedido para a ${revenda}: ela responde com os valores e como assinar.` : "Mande este pedido para o suporte: ele responde com os valores e como assinar."),
      ui.h("pre", { class: "pedido-contratacao dado" }, texto),
      admin ? ui.h("a", { href: "#/config/plano", class: "link" }, "Ver Plano e uso") : null),
    acoes });
}

/* ---- plano 1500c · UC-005: a janela «Seu teste acaba em N dias» (3 e 1 dia), uma vez por dia, para o administrador ---- */
function avisarFimDoTeste() {
  const cli = E.cliente;
  if (!cli || !E.sessao || cli.status !== "teste" || !cli.teste_ate) return false;
  const hoje = hojeServidor();
  const chave = E.M.rotas.chaveAvisoTeste(cli.id, hoje);
  const dias = diasDeTeste(cli);
  if (!E.M.rotas.deveAvisarFimTeste({ cli, dias, papel: papelAtual(), visto: !!LS.lerTxt(chave) })) return false;
  if (document.querySelector("dialog[open]") || ocupadoParaAtualizar()) return false;   // não abre por cima de outra janela nem de formulário mexido
  LS.gravar(chave, "1");
  const { ui } = E;
  // plano 2000d · DU-233: 7, 3, 1 e 0 dias, com o tom mudando (lembrança → urgência) e «Ver planos» direto
  const av = E.M.rotas.avisoFimTeste ? E.M.rotas.avisoFimTeste(dias) : { titulo: dias === 1 ? "Seu teste acaba amanhã" : `Seu teste acaba em ${dias} dias`, texto: "", tom: "aviso" };
  ui.modal({ titulo: av.titulo, largura: "p", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p", dataset: { tom: av.tom } },
      av.texto ? ui.h("p", { class: "aviso-teste-tom" }, av.texto) : null,
      ui.h("p", null, `O teste grátis da ${cli.nome} vai até ${ui.dataCurtaBR(String(cli.teste_ate).slice(0, 10))}. Depois disso, dá para consultar, mas não alterar nada, e os envios automáticos param.`),
      ui.h("p", { class: "fraco" }, "Para continuar sem interrupção, peça a assinatura agora.")),
    acoes: [{ rotulo: dias > 1 ? "Lembrar depois" : "Lembrar amanhã", tipo: "neutro" },
      { rotulo: "Ver planos", tipo: "neutro", fn: () => { setTimeout(() => navegar("#/config/plano"), 0); return true; } },
      { rotulo: "Quero continuar", tipo: "primario", fn: () => { setTimeout(() => abrirPedidoDeContratacao(cli, "aviso_teste"), 0); return true; } }] });
  return true;
}

/* ---- plano 1500c · UC-018 + UC-017: boas-vindas na primeira entrada do administrador na empresa ---- */
function mostrarBoasVindas() {
  const cli = E.cliente;
  if (!cli || !E.sessao) return false;
  const chave = E.M.rotas.chaveBoasVindas(E.sessao.conta.id, cli.id);
  if (!E.M.rotas.deveMostrarBoasVindas({ cli, papel: papelAtual(), visto: !!LS.lerTxt(chave), dialogoAberto: !!document.querySelector("dialog[open]"), demo: emModoDemo() })) return false;
  LS.gravar(chave, "1");
  const { ui } = E;
  const v = E.M.vocab.vocab(cli.vertical || "generico");
  let janela = null;
  const ir = hash => () => { if (janela) janela.fechar(null); setTimeout(() => navegar(hash), 0); };
  const cartao = (icone, titulo, texto, fn) => {
    const b = ui.h("button", { type: "button", class: "bv-cartao" }, ui.icone(icone), ui.h("b", null, titulo), ui.h("small", null, texto));
    b.addEventListener("click", fn);
    return b;
  };
  const cartoes = [
    cli.modulos && cli.modulos.includes("conversas") ? cartao("whatsapp", "Conectar o WhatsApp", "O número da empresa atendendo por aqui.", ir("#/config/numeros?assistente=novo")) : null,
    cli.modulos && cli.modulos.includes("crm") ? cartao("contato", `Trazer meus ${v.contatos.toLowerCase()}`, "Importe a planilha que você já tem.", ir("#/crm?importar=1")) : null,
    cartao("usuario", "Convidar a equipe", "Cada pessoa com o próprio acesso.", ir("#/config/equipe?convidar=1")),
    // UC-017: a empresa de exemplo da revenda (marca.demo_cliente_id, quando o servidor tiver) — sem ela, o cartão não aparece
    E.marca && E.marca.demo_cliente_id && E.sessao.clientes.some(c => c.id === E.marca.demo_cliente_id)
      ? cartao("info", "Ver com dados de exemplo", "Uma empresa fictícia para explorar sem medo.", () => { if (janela) janela.fechar(null); escolherCliente(E.marca.demo_cliente_id); }) : null,
  ].filter(Boolean);
  // plano 2000d · DU-152: a revenda escreve a própria boas-vindas e o contato do gerente de conta (marca.boas_vindas / marca.contato_agencia)
  const textosOrg = textosBoasVindasDaOrg(E.marca);
  // plano 2000d · DU-242: uma pergunta — o objetivo principal ordena o Início e os primeiros passos (guardado por empresa neste aparelho)
  const R = E.M.rotas;
  const objetivo = R.OBJETIVOS ? ui.h("fieldset", { class: "bv-objetivo" }, ui.h("legend", null, "O que você quer resolver primeiro?"),
    R.OBJETIVOS.map(o => {
      const b = ui.h("button", { type: "button", class: "chip-op", "aria-pressed": String(LS.lerTxt(R.chaveObjetivo(cli.id)) === o.id), dataset: { objetivo: o.id } }, o.rotulo);
      b.addEventListener("click", () => {
        LS.gravar(R.chaveObjetivo(cli.id), o.id);
        for (const x of b.parentNode.querySelectorAll("[data-objetivo]")) x.setAttribute("aria-pressed", String(x === b));
        try { document.dispatchEvent(new CustomEvent("nx:objetivo", { detail: { objetivo: o.id, cliente: cli.id } })); } catch { /* ok */ }
        if (E.api && E.api.evento) E.api.evento("objetivo", { objetivo: o.id });
      });
      return b;
    })) : null;
  ui.modal({ titulo: textosOrg.titulo || `Bem-vindo ao ${E.produto || "sistema"}`, largura: "m", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p" },
      textosOrg.texto ? ui.h("p", { class: "bv-org" }, textosOrg.texto) : null,
      ui.h("p", { class: "sub" }, `Três coisas deixam a ${cli.nome} pronta para atender. Comece por qualquer uma.`),
      objetivo,
      ui.h("div", { class: "bv-grade" }, cartoes),
      textosOrg.contato ? ui.h("p", { class: "bv-contato fraco" }, ui.icone("usuario"), textosOrg.contato) : null),
    acoes: [{ rotulo: "Explorar sozinho", tipo: "neutro", fn: () => { setTimeout(() => iniciarTour({ forcar: true }), 300); return true; } }],
    aoAbrir: m => { janela = m; } });
  return true;
}
/** plano 2000d · DU-152: os textos da revenda para as boas-vindas (sem eles, o padrão). Texto puro, cortado; nada de HTML. */
function textosBoasVindasDaOrg(marca) {
  const limpo = (v, n) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
  const m = marca || {};
  return { titulo: limpo(m.boas_vindas_titulo, 80), texto: limpo(m.boas_vindas, 400), contato: limpo(m.contato_agencia, 160) };
}

/* ---- plano 1500c · UC-030: modo apresentação — borra nomes, fotos e telefones de clientes para mostrar a tela (só nesta aba) ---- */
const CHAVE_APRESENTACAO = "nx-apresentacao";
function emApresentacao() { try { return sessionStorage.getItem(CHAVE_APRESENTACAO) === "1"; } catch { return false; } }
function aplicarApresentacao(on = emApresentacao()) {
  document.documentElement.classList.toggle("apresentacao", !!on);
  if (on && !E.avisoApresentacao) {
    E.avisoApresentacao = E.ui.toast("Modo apresentação: nomes, fotos e telefones de clientes estão borrados.", { tipo: "info", fixo: true, ms: 0,
      acao: { rotulo: "Desligar", fn: () => alternarApresentacao(false) } });
  } else if (!on && E.avisoApresentacao) { try { E.avisoApresentacao.fechar("sistema"); } catch { /* ok */ } E.avisoApresentacao = null; }
}
function alternarApresentacao(on = !emApresentacao()) {
  try { if (on) sessionStorage.setItem(CHAVE_APRESENTACAO, "1"); else sessionStorage.removeItem(CHAVE_APRESENTACAO); } catch { /* sem storage: vale até recarregar */ }
  aplicarApresentacao(on);
  return on;
}

/* ---- plano 1500c · UC-020: empresa sem nenhum número de WhatsApp ---- */
function faixaSemWhatsapp(cli) {
  const { ui } = E;
  const chave = E.M.rotas.chaveSemWhatsapp(cli.id);
  if (!E.M.rotas.faltaWhatsapp({ cli, papel: papelAtual(), dispensadoEm: Number(LS.lerTxt(chave)) || 0 })) return null;
  const conectar = ui.h("a", { class: "bt bt-prim", href: "#/config/numeros?assistente=novo" }, ui.icone("whatsapp"), "Conectar o WhatsApp");
  const depois = ui.h("button", { type: "button", class: "bt bt-fant", "aria-label": cli.status === "teste" ? "Lembrar daqui a 2 dias" : "Lembrar daqui a 7 dias" }, "Depois");   // plano 2000d · DU-244
  depois.addEventListener("click", () => { LS.gravar(chave, String(Date.now())); desenharFaixas(); });
  return ui.h("div", { class: "faixa faixa-aviso faixa-sem-whatsapp", role: "status" }, ui.icone("whatsapp"),
    ui.h("p", null, "Conecte o WhatsApp para começar a atender."), conectar, depois);
}

/** plano 1500c · UC-015: o artigo da tela aberta numa gaveta (a pessoa não perde o que estava fazendo); o link do artigo fecha a gaveta e navega. */
function abrirArtigoNoPainel(aj, art) {
  const vocab = E.M.vocab ? E.M.vocab.vocab(E.cliente ? E.cliente.vertical : "generico") : {};
  let g = null;
  const corpo = aj.painelArtigo(E.ui, { ...art, titulo: "Passo a passo" }, { vocab, nivel: 3, navegar: hash => { if (g) g.fechar(); navegar(hash); } });
  g = E.ui.gaveta({ titulo: art.titulo.replace(/\{(\w+)\}/g, (_, k) => vocab[k] || k), corpo, largura: "p", protegerTexto: false,
    acoes: E.ui.h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { g.fechar(); navegar("#/ajuda"); } } }, "Todos os artigos") });
  return g;
}

/** Plano 1000 (AS-292): o que o suporte precisa saber, num texto só (sem dado pessoal: nada de e-mail, token ou telefone). */
function textoSobre({ cache = null } = {}) {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const cli = E.cliente;
  // plano 1500c · UCC-103: o plano e o fim do teste; UCC-026: o que está guardado no aparelho; UCC-134: os últimos erros (só códigos)
  const plano = cli ? `Plano: ${cli.plano || "—"}${cli.status === "teste" && cli.teste_ate ? ` · teste até ${E.ui.dataBR(String(cli.teste_ate).slice(0, 10))}` : cli.status && cli.status !== "ativo" ? ` · ${cli.status}` : ""}` : null;
  const guardado = cache && Number.isFinite(cache.entradas) ? `Guardado no aparelho: ${cache.entradas} ${cache.entradas === 1 ? "item" : "itens"} (~${Math.max(1, Math.round((cache.bytesAprox || 0) / 1024))} KB${cache.emDisco ? "" : ", só nesta aba"})` : null;
  let erros = [];
  try { erros = E.M.api && E.M.api.errosRecentes ? E.M.api.errosRecentes().slice(-5) : []; } catch { erros = []; }
  const errosTxt = erros.length ? `Erros recentes: ${erros.map(x => `${x.codigo}${x.fn ? ` (${x.fn})` : ""}`).join(", ")}` : null;
  const app = E.M.rotas ? E.M.rotas.nomeDoApp({ produto: E.produto, workspace: E.workspace }).name : (E.produto || "Órbita");
  return [
    `${app} · versão do app ${VERSAO}`,
    `Banco: ${(E.sessao && E.sessao.migracao) || "não informado"}`,
    E.cliente ? `Empresa: ${E.cliente.nome}${E.cliente.slug ? ` (${E.cliente.slug})` : ""}` : null,
    plano,
    E.titulo ? `Tela: ${E.titulo}` : null,
    `Conexão: ${E.rede ? E.rede.estado : "—"}`,
    `Aparelho: ${String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || "—").slice(0, 40)} · ${typeof innerWidth === "number" ? `${innerWidth} px` : "—"}`,
    // plano 1500c · UCC-132: o navegador (nome e versão principal); UCC-131: o modo sem internet e a versão do cache
    E.pwaMod && E.pwaMod.nomeDoNavegador ? `Navegador: ${E.pwaMod.nomeDoNavegador(nav.userAgent)}` : null,
    E.pwaMod && E.pwaMod.estadoDoSW ? E.pwaMod.estadoDoSW(nav).texto : null,
    guardado,
    errosTxt,
  ].filter(Boolean).join("\n");
}
async function abrirSobre() {
  const { ui } = E;
  let cache = null;
  try { cache = E.cache && E.cache.estatisticas ? await Promise.race([E.cache.estatisticas(), new Promise(r => setTimeout(() => r(null), 800))]) : null; } catch { cache = null; }
  const texto = textoSobre({ cache });
  const linhas = texto.split("\n");
  ui.modal({ titulo: "Sobre este app", largura: "p", protegerTexto: false,
    corpo: ui.h("div", { class: "pilha-p" }, ui.h("p", { class: "sub" }, "Se o suporte pedir, copie e cole estas informações na conversa."),
      ui.h("pre", { class: "sobre-app dado" }, linhas.join("\n"))),
    acoes: [{ rotulo: "Fechar", tipo: "neutro" }, { rotulo: "Copiar para o suporte", tipo: "primario", icone: "copiar", fn: async () => { await ui.copiar(texto, { aviso: "Informações copiadas." }); return true; } }] });
}

/* ============================================================
   SINO — nx_notificacoes_listar / nx_notificacoes_marcar
   ============================================================ */
const ICONE_NOTIF = { atribuida: "chat", sem_resposta: "relogio", tarefa: "tarefa", sla_etapa: "alerta", automacao: "raio",
  lead_anuncio: "anuncio", mencao: "usuario", sistema: "info", plano: "cartao", canal_caiu: "alerta", canal_voltou: "check" };   // plano 1500c · UC-024: «plano» = aviso do fim do teste (o nx-ciclo cria)
/** A10 (S-B11): notificação de número caído/voltou sem `link` do servidor abre Configurações › Números. */
const LINK_NOTIF = { canal_caiu: "#/config/numeros", canal_voltou: "#/config/numeros" };
LINK_NOTIF.plano = "#/config/plano";   // plano 1500c · UC-024: o aviso do fim do teste abre o Plano e uso
/** AS-186: o sino lê de 30 em 30, até o teto do servidor (100). */
const NOTIF_PAGINA = 30, NOTIF_MAXIMO = 100;
/** Destino de uma notificação: o `link` do servidor (só #/…), o fixo do tipo (LINK_NOTIF) ou, na automação (AS-187), as execuções dela. null = sem destino. */
function linkDaNotificacao(it) {
  if (!it) return null;
  if (typeof it.link === "string" && /^#\//.test(it.link)) return it.link;
  if (LINK_NOTIF[it.tipo]) return LINK_NOTIF[it.tipo];
  if (it.tipo === "automacao") {
    const d = it.dados && typeof it.dados === "object" ? it.dados : {};
    const id = d.automacao_id ?? d.automacao ?? it.automacao_id ?? null;
    return id != null && /^[\w-]{1,64}$/.test(String(id)) ? `#/automacoes/${encodeURIComponent(String(id))}?aba=execucoes` : "#/automacoes";
  }
  return null;
}
/** «Hoje», «Ontem» ou a data (dd/mm/aaaa) do dia em São Paulo. */
function rotuloDoDia(iso, agora = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "Antes";
  const hoje = E.ui.hojeSP(agora), dia = E.ui.hojeSP(d);
  if (dia === hoje) return "Hoje";
  if (dia === E.ui.hojeSP(new Date(agora.getTime() - DIA_MS))) return "Ontem";
  return E.ui.dataBR(dia);
}

/** Plano 1000b · UB-124: a frase única que o leitor de tela ouve ao abrir (e quando muda) a lista do sino. */
function resumoDoSino(total, naoLidas) {
  const t = Math.max(0, Number(total) || 0), n = Math.max(0, Number(naoLidas) || 0);
  if (!t) return "Nenhuma notificação";
  return `${t} notificaç${t === 1 ? "ão" : "ões"}, ${n} não lida${n === 1 ? "" : "s"}`;
}
/** Plano 1000b · UB-269: notificação de automação com o nome dela (dados.automacao_nome) quando o título do servidor é o genérico. */
function tituloDaNotificacao(it) {
  const titulo = String((it && it.titulo) || "").trim();
  if (!it || it.tipo !== "automacao") return titulo;
  const d = it.dados && typeof it.dados === "object" ? it.dados : {};
  const nome = String(d.automacao_nome || "").trim().slice(0, 80);
  if (!nome || titulo.includes(nome)) return titulo || "Automação";
  if (!titulo || /^automa[çc][ãa]o( com erro)?\.?$/i.test(titulo)) return `Automação «${nome}» com erro`;
  return titulo;
}

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
  // plano 1000b · UB-124: a lista não é região viva (cada releitura do pulso lia todas as notificações); um status curto conta o resumo
  const lista = ui.h("div", { class: "notif-lista" }, ui.esqueleto("lista", 3));
  const resumo = ui.h("p", { class: "sr-only", role: "status" });
  const btTodas = ui.h("button", { type: "button", class: "bt bt-fant bt-p", hidden: true }, ui.icone("checks"), "Marcar todas como lidas");
  // AS-186: «Não lidas» (filtro na lista que já veio), cabeçalhos Hoje/Ontem/data e «Carregar mais» (o servidor devolve até 100)
  let soNaoLidas = false, limite = NOTIF_PAGINA, ultimo = null;
  const filtro = ui.segmentado({ opcoes: [{ valor: "todas", rotulo: "Todas" }, { valor: "nao_lidas", rotulo: "Não lidas" }], valor: "todas", tipo: "filtro", rotulo: "Mostrar",
    aoMudar: v => { soNaoLidas = v === "nao_lidas"; if (ultimo) desenhar(ultimo); } });
  const mais = ui.h("button", { type: "button", class: "bt bt-sec bt-p notif-mais", hidden: true }, "Carregar mais");
  mais.addEventListener("click", () => { limite = Math.min(NOTIF_MAXIMO, limite + NOTIF_PAGINA); ui.carregando(mais, recarregar()); });
  const conteudo = ui.h("div", { class: "pilha-p" },
    ui.h("div", { class: "linha linha-entre notif-cab" }, ui.h("h2", { class: "rotulo" }, "Notificações"), btTodas), filtro, resumo, lista, mais);
  let seq = 0;
  const f = ui.flutuante(ancora, conteudo, { classe: "notifs", rotulo: "Notificações", aoFechar: () => { E.sinoAberto = null; } });   // UB-138

  async function marcar(ids) {
    try {
      const r = await E.api.rpcC("nx_notificacoes_marcar", { p_ids: ids });
      if (r && typeof r.nao_lidas === "number") { E.notif = r.nao_lidas; atualizarSinoUI(); }
    } catch (e) { ui.toast(E.api.mensagemErro(e), { tipo: "erro" }); }
  }
  function desenhar(r) {
    ui.limpar(lista);
    const todos = Array.isArray(r.itens) ? r.itens : [];
    const itens = soNaoLidas ? todos.filter(it => !it.lida_em) : todos;
    mais.hidden = !(todos.length >= limite && limite < NOTIF_MAXIMO);
    if (!itens.length) {
      lista.appendChild(soNaoLidas && todos.length
        ? ui.h("p", { class: "flut-vazio" }, "Nenhuma notificação não lida.")
        : ui.h("div", { class: "notif-vazio" }, ui.icone("sino"),
          ui.h("p", null, ui.h("b", null, "Nenhuma notificação por aqui."), ui.h("br"), "Conversas atribuídas a você, tarefas e avisos das automações aparecem aqui.")));
      return;
    }
    let dia = null;
    for (const it of itens) {
      const rot = rotuloDoDia(it.criado_em);
      if (rot !== dia) { dia = rot; lista.appendChild(ui.h("p", { class: "notif-dia rotulo" }, rot)); }
      const lida = !!it.lida_em;
      const link = linkDaNotificacao(it);
      const corpo = it.corpo ? ui.h("p", null, it.corpo) : null;
      const b = ui.h("button", { type: "button", class: ["notif-item", lida && "lida"], "aria-expanded": !link && corpo ? "false" : null },
        ui.h("span", { class: "notif-ic" }, ui.icone(ICONE_NOTIF[it.tipo] || "info")),
        ui.h("span", null, ui.h("b", null, tituloDaNotificacao(it)), corpo,
          ui.h("small", { title: ui.dataHoraBR(it.criado_em) }, ui.relativo(it.criado_em))),
        ui.h("i", { "aria-hidden": "true" }),
        lida ? null : ui.h("span", { class: "sr-only" }, "(não lida)"));
      b.addEventListener("click", async () => {
        if (!it.lida_em) { it.lida_em = new Date().toISOString(); marcar([it.id]); }
        if (link) { f.fechar(); navegar(link); return; }
        // AS-187: sem destino, o toque abre o texto inteiro no próprio item (antes ficava cortado e nada acontecia)
        b.classList.add("lida");
        if (corpo) { const aberto = b.classList.toggle("notif-aberta"); b.setAttribute("aria-expanded", String(aberto)); }
      });
      lista.appendChild(b);
    }
  }
  async function recarregar() {
    const n = ++seq;
    try {
      const r = await E.api.rpcC("nx_notificacoes_listar", { p_limite: limite });
      if (n !== seq || !lista.isConnected) return;
      E.notif = r.nao_lidas || 0; atualizarSinoUI();
      atualizarCanais({ notificacoes: r.itens }, "notificacao");   // A10: canal_caiu/canal_voltou na lista alimentam o aviso de número caído
      btTodas.hidden = !(r.nao_lidas > 0);
      const frase = resumoDoSino(Array.isArray(r.itens) ? r.itens.length : 0, r.nao_lidas);
      if (resumo.textContent !== frase) resumo.textContent = frase;   // UB-124: só fala quando o resumo muda
      ultimo = r;
      desenhar(r);
    } catch (e) {
      if (n !== seq) return;
      ui.limpar(lista);
      // plano 1000b · UB-270: o erro não deixa a lista sem saída — «Tentar de novo» relê
      const tentar = ui.h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("reabrir"), "Tentar de novo");
      tentar.addEventListener("click", () => { ui.carregando(tentar, recarregar()); });
      lista.appendChild(ui.h("div", { class: "flut-vazio pilha-p" }, ui.h("p", null, E.api.mensagemErro(e)), tentar));
    }
  }
  // plano 1000b · UB-125: com mais de 10 não lidas, «Marcar todas» pede um 2º toque (a RPC não desfaz); o pedido some sozinho em 6 s
  const ROTULO_TODAS = "Marcar todas como lidas";
  let esperaConfirmar = null;
  const voltarRotuloTodas = () => { clearTimeout(esperaConfirmar); esperaConfirmar = null; delete btTodas.dataset.confirmar; btTodas.lastChild.textContent = ROTULO_TODAS; };
  btTodas.addEventListener("click", async () => {
    const n = Math.max(0, Number(E.notif) || 0);
    if (n > 10 && btTodas.dataset.confirmar !== "1") {
      btTodas.dataset.confirmar = "1";
      btTodas.lastChild.textContent = `Confirmar: marcar ${n} como lidas`;
      ui.anunciar(`Toque de novo para marcar as ${n} notificações como lidas.`);
      esperaConfirmar = setTimeout(voltarRotuloTodas, 6000);
      return;
    }
    voltarRotuloTodas();
    await ui.carregando(btTodas, marcar(null)); recarregar();
  });
  E.sinoAberto = { recarregar, fechar: () => f.fechar() };
  recarregar();
}

function desenharFaixas() {
  const alvo = $("faixas");
  if (alvo) reconciliarFaixas(alvo, umaFaixaPorVez(faixasDoMomento(), { abertas: !!E.faixasAbertas, ui: E.ui, abrir: () => { E.faixasAbertas = true; desenharFaixas(); } }));
}
/* plano 1500c · UCC-117: faixas empilhadas comiam meia tela do celular. Fica UMA, a mais importante (bloqueio > fim do teste > suporte >
   demonstração > demo local); as outras ficam atrás de «+N avisos» na própria faixa, que abre todas até a próxima troca de empresa. */
const PRIORIDADE_FAIXA = ["faixa-bloqueio", "faixa-fim-teste", "faixa-suporte", "faixa-demo", "faixa-demo-local"];
function prioridadeDaFaixa(n) {
  const cls = String((n && n.className) || "").split(/\s+/);
  const i = PRIORIDADE_FAIXA.findIndex(c => cls.includes(c));
  return i < 0 ? PRIORIDADE_FAIXA.length : i;
}
function umaFaixaPorVez(lista, { abertas = false, ui = E.ui, abrir } = {}) {
  const ordem = [...(lista || [])].map((n, i) => ({ n, i })).sort((a, b) => prioridadeDaFaixa(a.n) - prioridadeDaFaixa(b.n) || a.i - b.i).map(x => x.n);
  if (abertas || ordem.length <= 1) return ordem;
  const resto = ordem.length - 1;
  const mais = ui.h("button", { type: "button", class: "bt bt-fant faixa-mais", "aria-label": `Ver mais ${resto} aviso${resto === 1 ? "" : "s"}` }, `+${resto} aviso${resto === 1 ? "" : "s"}`);
  mais.addEventListener("click", () => { if (abrir) abrir(); });
  ordem[0].appendChild(mais);
  return [ordem[0]];
}
/** plano 1000b · UB-207: a cada desenharShell as faixas (role=status) eram recriadas e o leitor de tela relia «O teste terminou…» a cada troca de
    tela. Faixa com a mesma classe e o mesmo texto fica (o MESMO nó: nada é reanunciado); só a que aparece ou muda entra nova. */
function reconciliarFaixas(alvo, novas) {
  const chave = n => `${n.className}|${n.textContent}`;
  const antigas = new Map();
  for (const n of [...alvo.children]) { const k = chave(n); if (!antigas.has(k)) antigas.set(k, n); }
  const ficam = novas.map(n => { const k = chave(n); const velha = antigas.get(k); if (velha) { antigas.delete(k); return velha; } return n; });
  for (const n of antigas.values()) n.remove();
  for (const n of [...alvo.childNodes]) if (!ficam.includes(n)) n.remove();
  // só reposiciona o que está fora de ordem (um nó que já está no lugar nem é tocado)
  ficam.forEach((n, i) => { const atual = alvo.children[i] || null; if (atual !== n) alvo.insertBefore(n, atual); });
  return ficam;
}
/** plano 1500c · UCC-091: a faixa «o teste acaba em N dias» — só para o administrador da empresa (não a equipe da plataforma), de 0 a 3 dias.
    → {dias, texto} ou null. */
function faixaFimDeTeste(cli, { hoje, equipe = false, papel = papelAtual() } = {}) {
  if (!cli || equipe || cli.status !== "teste" || !cli.teste_ate) return null;
  if (!E.M.rotas.podePapel(papel, "admin")) return null;
  const dias = E.M.rotas.diasAteFimTeste(cli.teste_ate, hoje);
  if (dias === null || dias < 0 || dias > 3) return null;
  return { dias, texto: dias === 0 ? "O teste grátis termina hoje. Assine para não perder o acesso de amanhã." : `O teste grátis termina em ${dias} dia${dias === 1 ? "" : "s"}. Assine para continuar sem interrupção.` };
}

/** plano 1500c · UCB-054: a sessão é a da demonstração (marcada no aoEntrar; sobrevive ao recarregar da aba, some ao sair). */
function emModoDemo() {
  if (E.modoDemo) return true;
  try { return sessionStorage.getItem("nx-app-demo") === "1"; } catch { return false; }
}

/** plano 1500c · UC-019: «Bem-vindo à <empresa>. Você entrou como <papel>.» — uma vez, logo depois de aceitar o convite. */
function textoBoasVindas(bv, rotuloPapel = {}) {
  if (!bv) return "";
  const papel = bv.papel ? (rotuloPapel[bv.papel] || bv.papel) : "";
  return [bv.empresa ? `Bem-vindo à ${bv.empresa}.` : "Bem-vindo.", papel ? `Você entrou como ${String(papel).toLowerCase()}.` : ""].filter(Boolean).join(" ");
}
function mostrarBoasVindasConvite() {
  const bv = E.boasVindasConvite;
  if (!bv) return;
  E.boasVindasConvite = null;
  const t = textoBoasVindas(bv, E.M.vocab ? E.M.vocab.ROTULO_PAPEL || {} : {});
  // plano 2000d · DU-227: entrou por convite → o «Comece aqui» (com o passo de instalar o app) fica a um toque, sem esperar a 3ª abertura
  if (t) E.ui.toast(t, { tipo: "ok", ms: 12000, acao: { rotulo: "Comece aqui", fn: () => abrirComeceAqui({ destaque: "instalar" }) } });
}
/** plano 2000d · DU-222: «Houve 5 tentativas erradas ontem às 22:10» — o servidor manda {quantas, ultima_em} no nx_entrar. */
function textoTentativas(t, dataHora = x => String(x)) {
  const n = Number(t && t.quantas);
  if (!Number.isInteger(n) || n <= 0) return "";
  return `Houve ${n} tentativa${n === 1 ? "" : "s"} errada${n === 1 ? "" : "s"} de entrar na sua conta${t.ultima_em ? `, a última em ${dataHora(t.ultima_em)}` : ""}. Se não foi você, troque a senha.`;
}
function avisarTentativasRecentes() {
  const t = E.tentativasRecentes;
  E.tentativasRecentes = null;
  const txt = textoTentativas(t, x => { try { return E.ui.dataHoraBR ? E.ui.dataHoraBR(x) : String(x); } catch { return String(x); } });
  if (txt) E.ui.toast(txt, { tipo: "aten", ms: 0, fixo: true, acao: { rotulo: "Ver sessões", fn: () => navegar("#/config/perfil") } });
}

function faixasDoMomento() {
  const { ui } = E;
  const out = [];
  if ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && new URLSearchParams(location.search).get("dev-falso") === "1") {
    // AS-274: no celular, uma linha só («Demo local · dados fictícios»); o texto inteiro continua para o leitor de tela e no desktop
    out.push(ui.h("div", { class: "faixa faixa-demo-local", role: "status" }, ui.icone("info"),
      ui.h("p", null, ui.h("span", { class: "demo-longo" }, "DEMO LOCAL · dados fictícios; mensagens e integrações não são reais."),
        ui.h("span", { class: "demo-curto", "aria-hidden": "true" }, "Demo local · dados fictícios"))));
  }
  // plano 1500c · UCB-054: entrou pela «Ver demonstração» (empresa de exemplo): a faixa diz que os dados são fictícios, com «Sair da demonstração»
  if (E.sessao && emModoDemo()) {
    const sairDemo = ui.h("button", { type: "button", class: "bt bt-sec" }, "Sair da demonstração");
    sairDemo.addEventListener("click", () => sair());
    out.push(ui.h("div", { class: "faixa faixa-demo", role: "status" }, ui.icone("info"),
      ui.h("p", null, "Demonstração · dados fictícios. Nada do que você fizer aqui chega a um cliente real."), sairDemo));
  }
  const cli = E.cliente;
  if (!cli || !E.sessao) return out;
  const suporteWa = E.marca && E.marca.suporte_wa;
  const btWa = texto => suporteWa ? ui.h("a", { class: "bt bt-sec", href: ui.linkWhatsApp(texto, suporteWa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
  const equipe = cli.papel === "gestor" || cli.papel === "super";
  const plataforma = !!(E.sessao.conta.super || E.sessao.conta.papel === "gestor");   // quem a tela pausada deixa entrar (montarNoShell) só vê a faixa
  if (cli.suporte && equipe) {
    const sair = ui.h("button", { type: "button", class: "bt bt-sec" }, "Sair");
    // plano 1000 · AS-248: volta para onde o «Entrar» foi clicado (o detalhe do cliente), guardado pelo Admin em nx-admin-volta;
    // só endereços do próprio Admin valem (nada de redirecionar para fora)
    sair.addEventListener("click", () => {
      let volta = null;
      try { volta = sessionStorage.getItem("nx-admin-volta"); } catch { /* sem storage */ }
      navegar(volta && /^#\/admin\//.test(volta) ? volta : "#/admin/clientes");
    });
    out.push(ui.h("div", { class: "faixa faixa-suporte", role: "status" }, ui.icone("escudo"),
      ui.h("p", null, "Você está no ambiente de ", ui.h("b", null, cli.nome), ` como suporte da ${E.sessao.org ? E.sessao.org.nome : "plataforma"}.`), sair));
  }
  const hoje = hojeServidor();   // plano 1500c · UCC-136
  // teste em andamento: pílula junto à empresa (pilulaDeTeste); só o que BLOQUEIA continua sendo faixa
  if (cli.status === "teste" && cli.teste_ate && cli.teste_ate < hoje) {
    // plano 1500c · UC-006: diz o que para e (com marca.retencao_dias) por quanto tempo os dados ficam; UC-003: «Quero continuar» abre o pedido pronto
    const continuar = equipe ? null : ui.h("button", { type: "button", class: "bt bt-prim" }, "Quero continuar");
    if (continuar) continuar.addEventListener("click", () => abrirPedidoDeContratacao(cli, "faixa_vencido"));
    // plano 2000d · DU-240: o próximo passo — «Ver planos» para quem pode assinar
    const planos = !equipe && E.M.rotas.podePapel(papelAtual(), "admin") ? ui.h("a", { class: "bt bt-sec", href: "#/config/plano" }, "Ver planos") : null;
    out.push(ui.h("div", { class: "faixa faixa-bloqueio", role: "status" }, ui.icone("cadeado"),
      ui.h("p", null, E.M.rotas.textoTesteVencido({ equipe, retencaoDias: E.marca && E.marca.retencao_dias })),
      continuar, planos, equipe ? null : btWa(`Olá! O teste da ${cli.nome} terminou e quero continuar.`)));
  } else if (faixaFimDeTeste(cli, { hoje, equipe })) {
    // plano 1500c · UCC-091: faltam 3 dias ou menos — o administrador da empresa vê a faixa com «Assinar agora» (antes, só depois de vencer)
    const d = faixaFimDeTeste(cli, { hoje, equipe });
    const assinar = ui.h("a", { class: "bt bt-prim", href: "#/config/plano" }, "Assinar agora");
    assinar.addEventListener("click", () => { if (E.api && E.api.evento) E.api.evento("assinar", { origem: "faixa_teste", dias: d.dias }); });
    out.push(ui.h("div", { class: "faixa faixa-aviso faixa-fim-teste", role: "status" }, ui.icone("relogio"), ui.h("p", null, d.texto), assinar));
  } else if (cli.status === "suspenso" || cli.status === "cancelado") {
    out.push(ui.h("div", { class: "faixa faixa-bloqueio", role: "status" }, ui.icone("cadeado"),
      ui.h("p", null, equipe ? `Este cliente está ${cli.status}. A equipe dele não entra; só a gestão (${E.sessao.conta.super ? "plataforma" : "agência"}) enxerga os dados.` : "O acesso desta empresa está suspenso. Fale com o suporte."),
      equipe ? null : btWa(`Olá! O acesso da ${cli.nome} está suspenso.`)));
  } else if (cli.ativo === false && (equipe || plataforma)) {
    // A4 (contrato 9): quem é da plataforma continua vendo as telas, mas sabe que o cliente está pausado (quem não é vê o cartão de bloqueio)
    out.push(ui.h("div", { class: "faixa faixa-bloqueio", role: "status" }, ui.icone("pausa"),
      ui.h("p", null, "Este cliente está pausado («Cliente ativo» desligado no painel): a equipe dele não entra, e a leitura de anúncios, os relatórios e o rastreio do site ficam parados até religar.")));
  }
  // plano 1500c · UC-020: o administrador de uma empresa com Conversas e nenhum número: o primeiro passo é conectar
  if (!equipe) { const sw = faixaSemWhatsapp(cli); if (sw) out.push(sw); }
  return out;
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
/** Plano 1000b · UB-206: o contexto falado do número do menu («, 3 não lidas»). */
function textoDoBadge(modulo, n) {
  const q = Math.max(0, Number(n) || 0), um = q === 1;
  if (modulo === "conversas") return `, ${q} não lida${um ? "" : "s"}`;
  if (modulo === "automacoes") return `, ${q} com erro`;
  return `, ${q} pendente${um ? "" : "s"}`;
}
function atualizarBadges(pulsar) {
  for (const el of document.querySelectorAll("[data-badge]")) {
    const n = E.badges[el.dataset.badge] || 0;
    el.hidden = n <= 0;
    el.textContent = n > 99 ? "99+" : n > 0 ? String(n) : "";
    // plano 1000b · UB-206: o leitor de tela ouve «Conversas, 3 não lidas», não só «3»
    if (n > 0) el.appendChild(E.ui.h("span", { class: "sr-only" }, textoDoBadge(el.dataset.badge, n)));
    if (pulsar && el.dataset.badge === pulsar) { el.classList.remove("pulsa"); void el.offsetWidth; el.classList.add("pulsa"); }
  }
  for (const el of document.querySelectorAll("[data-ponto]")) el.hidden = !(E.badges[el.dataset.ponto] > 0);
  for (const el of document.querySelectorAll("[data-ponto-mais]")) el.hidden = !el.dataset.pontoMais.split(",").some(id => E.badges[id] > 0);   // UB-271
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
  if (E.pulsoTemNaoLidas) return; // A3 (contrato 8): o servidor manda nao_lidas no pulso; a lista é reserva só da RPC antiga
  if (Date.now() - (E.naoLidasPulsoEm || 0) < 10000) return; // nx_pulso já trouxe a contagem: não consulta a lista de novo
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
  if (E.notif > antes) conferirNotificacoesDeCanal();   // A10: chegou notificação — pode ser canal_caiu/canal_voltou
}

/* ============================================================
   PLANO 100 · A2 — aviso de mensagem nova fora de Conversas (o pulso traz nao_lidas e, com a aba escondida, lê a cada 15 s).
   Dentro de Conversas a própria tela avisa (conversas.js); aqui vale para as outras telas e para a aba escondida em outra tela.
   Mesmas preferências do menu «Avisos» de Conversas (localStorage nx-cv-avisos: som ligado por padrão, aviso de tela só se a pessoa ligou).
   ============================================================ */
let _audio = null;
function desbloquearAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _audio = _audio || new AC();
    if (_audio.state === "suspended") _audio.resume().catch(() => {});
  } catch { /* sem áudio */ }
}
/** O mesmo toque curto de conversas.js (duas notas, sem arquivo), no máximo um a cada 10 s. */
function tocarSomNaoLidas() {
  const agora = Date.now();
  if (agora - E.somEm < 10000) return;
  try {
    desbloquearAudio();
    if (!_audio || _audio.state !== "running") return;
    E.somEm = agora;
    const t0 = _audio.currentTime + 0.02;
    for (const [freq, atraso] of [[880, 0], [1318.5, 0.13]]) {
      const osc = _audio.createOscillator(), g = _audio.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + atraso);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + atraso + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.38);
      osc.connect(g); g.connect(_audio.destination);
      osc.start(t0 + atraso); osc.stop(t0 + atraso + 0.42);
    }
  } catch { /* sem áudio */ }
}
function lerAvisosConversas() {
  // plano 2000d · DU-142: as preferências são por conta (nx-cv-avisos:<conta>, gravadas pelo Perfil); a chave antiga vale até a primeira gravação
  const conta = E.sessao && E.sessao.conta ? E.sessao.conta.id : null;
  const p = (conta && LS.ler(`nx-cv-avisos:${conta}`)) || LS.ler("nx-cv-avisos") || {};
  // plano 2000d · DU-268: o horário silencioso guardado no Perfil ({de, ate}) vai junto
  return { som: p.som !== false, tela: p.tela === true, silencio: p.silencio && typeof p.silencio === "object" ? p.silencio : null };
}
/* plano 1500c · UCC-120: um aviso por empresa (tag nx-cv-<empresa>) que se SUBSTITUI e volta a alertar (renotify) em vez de empilhar;
   quando o som do app já tocou, o aviso fica mudo — e aí sem renotify (o navegador recusa silent + renotify juntos).
   UCC-123: data.hash leva o clique à fila de quem aguarda, também pelo service worker (notificationclick). */
function opcoesDoAvisoNaoLidas({ novas, total, cliId, somProprio = true, icone } = {}) {
  const titulo = novas === 1 ? "Mensagem nova" : `${novas} mensagens novas`;
  const opcoes = { body: total === 1 ? "1 conversa aguarda resposta." : `${total} conversas aguardam resposta.`, tag: `nx-cv-${cliId || "shell"}`,
    icon: icone, data: { hash: "#/conversas?aba=aguardando" } };
  if (somProprio) opcoes.silent = true; else opcoes.renotify = true;
  return { titulo, opcoes };
}
function notificarNaoLidas(novas, total, { somProprio = true } = {}) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const { titulo, opcoes } = opcoesDoAvisoNaoLidas({ novas, total, cliId: E.cliente && E.cliente.id, somProprio, icone: iconeDoAviso() });
    let n = null;
    try { n = new Notification(titulo, opcoes); }
    catch {
      // Android: «new Notification» não existe na página — o aviso sai pelo service worker (o clique volta pelo notificationclick)
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification(titulo, opcoes)).catch(() => {});
      return;
    }
    n.addEventListener("click", () => { try { window.focus(); } catch { /* ok */ } navegar(opcoes.data.hash); n.close(); });
  } catch { /* navegador sem suporte */ }
}
/** nao_lidas subiu e a pessoa está em outra tela (ou com a aba escondida): som e, se permitido, aviso na área de trabalho. */
function avisarNaoLidas(n, ultima = null) {
  const antes = E.naoLidasAnterior, ultimaAntes = E.ultimaMsgEm || null;
  E.naoLidasAnterior = n;
  if (ultima) E.ultimaMsgEm = ultima;   // plano 1500c · UCC-018: carimbo da última mensagem (servidor novo)
  if (!E.cliente || !E.cliente.modulos.includes("conversas") || !pronto("conversas")) return;
  const a = E.M.pulso.avisoDeNaoLidas({ antes, depois: n, emConversas: !!(E.atual && E.atual.arquivo === "conversas.js"), escondida: !!document.hidden, pref: lerAvisosConversas(),
    ultimaAntes, ultimaDepois: ultima, agora: new Date() });   // plano 2000d · DU-268
  // revisão: toda aba recebe o resultado do pulso — o som (que é do aparelho, não da aba) toca só na líder (ou na aba sozinha): um som por mensagem
  const papel = E.pulso && E.pulso.estado ? E.pulso.estado.papel : "solo";
  if (a.som && (papel === "lider" || papel === "solo")) tocarSomNaoLidas();
  if (a.tela) notificarNaoLidas(a.novas, n, { somProprio: !!(a.som && (papel === "lider" || papel === "solo")) });   // plano 1500c · UCC-120: o aviso só toca quando o app não tocou
}

/* ============================================================
   PLANO 100 · A10 — número de WhatsApp caído: toast fixo enquanto durar, «Ver número» (#/config/numeros) e o estado para as telas (ctx.canais).
   Fontes, por detecção: `canais` do nx_pulso ou do nx_app_sessao (quando o servidor mandar) vencem; sem elas, as notificações do sino
   (canal_caiu / canal_voltou — S-B11), conferidas quando o sino sobe (no máximo a cada 30 s) e sempre que a lista do sino é lida.
   ============================================================ */
const PESO_FONTE_CANAIS = { pulso: 3, sessao: 2, notificacao: 1 };
function reiniciarCanais() {
  const c = E.canais;
  c.lista = []; c.fonte = null; c.dispensado = ""; c.avisouQueda = false; c.conferiuEm = 0; c.toastAssinatura = "";
  if (c.toast) { c.toast.fechar("sistema"); c.toast = null; }
  atualizarPontoCanal();
}
/** Recebe a matéria-prima de uma fonte; uma fonte mais fraca nunca sobrescreve uma mais forte já vista nesta empresa. */
function atualizarCanais({ canais = null, notificacoes = null } = {}, fonte) {
  const c = E.canais;
  if (!E.cliente || !PESO_FONTE_CANAIS[fonte]) return;
  if (c.fonte && PESO_FONTE_CANAIS[c.fonte] > PESO_FONTE_CANAIS[fonte]) return;
  if (fonte === "notificacao" && !(Array.isArray(notificacoes) && notificacoes.some(n => n && (n.tipo === "canal_caiu" || n.tipo === "canal_voltou")))) return;
  const lista = E.M.pulso.canaisCaidosDe(Array.isArray(canais) ? { canais } : { notificacoes });
  c.fonte = fonte;
  const chaveDe = l => l.map(x => String(x.id ?? x.nome)).sort().join("|");
  const assinatura = chaveDe(lista), mudou = assinatura !== chaveDe(c.lista);
  c.lista = lista;
  if (mudou) for (const fn of [...c.assinantes]) { try { fn(lista.slice()); } catch (e) { console.error("canais: assinante falhou", e); } }
  renderNumeroCaido(assinatura);
}
/** O sino subiu e não há fonte forte: olha as últimas notificações à procura de canal_caiu/canal_voltou. */
async function conferirNotificacoesDeCanal() {
  const c = E.canais;
  if (!E.cliente || (c.fonte && c.fonte !== "notificacao")) return;
  const agora = Date.now();
  if (agora - c.conferiuEm < 30000) return;
  c.conferiuEm = agora;
  const cli = E.cliente.id;
  try {
    const r = await E.api.rpcC("nx_notificacoes_listar", { p_limite: 10 });
    if (!E.cliente || E.cliente.id !== cli) return;
    atualizarCanais({ notificacoes: r && r.itens }, "notificacao");
  } catch { /* o sino mostra a lista quando aberto */ }
}
/** Plano 1000 (AS-244): «há 25 min» / «desde 13/10 14:02» de quando o número caiu (o `desde` da lista); sem data, nada. */
function desdeQuando(iso, agora = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime()) || d > agora) return "";
  const min = Math.round((agora.getTime() - d.getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) { const h = Math.round(min / 60); return `há ${h} h`; }
  return `desde ${E.ui.dataCurtaBR(d.toISOString())} ${E.ui.horaBR(d.toISOString())}`;
}
function renderNumeroCaido(assinatura) {
  const { ui } = E;
  const c = E.canais;
  atualizarPontoCanal();
  if (!c.lista.length) {
    if (c.toast) { c.toast.fechar("sistema"); c.toast = null; }
    if (c.avisouQueda) ui.toast("Número de WhatsApp reconectado.", { tipo: "ok" });
    c.avisouQueda = false; c.dispensado = ""; c.toastAssinatura = "";
    return;
  }
  if (c.dispensado === assinatura || (c.toast && c.toastAssinatura === assinatura)) return;
  if (c.toast) c.toast.fechar("sistema");
  const nomes = c.lista.map(x => { const q = desdeQuando(x.desde); return q ? `${x.nome} (${q})` : x.nome; }).join(", ");
  const admin = E.M.rotas.podePapel(papelAtual(), "admin");
  // plano 1000b · UB-130: quem não é admin não tem o «Ver número» — o texto diz o que fazer
  const texto = (c.lista.length === 1 ? `Número de WhatsApp desconectado: ${nomes}. As mensagens não chegam até reconectar.`
    : `${c.lista.length} números de WhatsApp desconectados: ${nomes}. As mensagens não chegam até reconectar.`) + (admin ? "" : " Avise o administrador da empresa.");
  c.toastAssinatura = assinatura; c.avisouQueda = true;
  c.toast = ui.toast(texto, { tipo: "aten", ms: 0, fixo: true, acao: admin ? { rotulo: "Ver número", fn: () => navegar("#/config/numeros") } : null,
    aoFechar: motivo => { if (c.toastAssinatura !== assinatura) return; c.toast = null; if (motivo === "fechado") c.dispensado = assinatura; } });
}

/* ============================================================
   PLANO 100 · A4 — front novo × banco velho (nx_app_sessao.migracao contra versao.json.min_migracao) e empresa pausada (cliente_pausado)
   ============================================================ */
/** plano 1000b · UB-131: a leitura do versao.json vale 10 min (o ritmo do pwa.js) — min_migracao novo (ou o banco já atualizado) chega sem recarregar. */
const VALIDADE_VERSAO_MS = 10 * 60000;
function versaoRemota(agora = Date.now()) {
  if (E.leitorVersao) return E.leitorVersao.ler();   // plano 1500c · UCC-052: a mesma leitura da faixa de versão
  if (!E.versaoRemotaP || !(agora - (E.versaoRemotaEm || 0) < VALIDADE_VERSAO_MS)) {
    E.versaoRemotaEm = agora;
    E.versaoRemotaP = (async () => {
      try {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        const t = setTimeout(() => ctl && ctl.abort(), 5000);
        try {
          const r = await fetch(new URL(`versao.json?t=${Date.now()}`, location.href).href, { cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) });
          return r.ok ? await r.json() : null;
        } finally { clearTimeout(t); }
      } catch { return null; }
    })();
  }
  return E.versaoRemotaP;
}
let faixaMigracao = null;
/** Sem `migracao` na sessão (RPC antiga) ou sem `min_migracao` no versao.json nada é dito; com os dois e o banco atrás, a faixa avisa (sem travar o app). */
async function conferirMigracao() {
  const s = E.sessao;
  if (!s || typeof s.migracao !== "string" || !E.pwaMod || typeof E.pwaMod.migracaoPendente !== "function") return;
  const remoto = await versaoRemota();
  if (E.sessao !== s) return;   // a sessão mudou enquanto o versao.json chegava: a próxima conferência decide
  const minima = remoto && typeof remoto.min_migracao === "string" ? remoto.min_migracao : null;
  desenharFaixaMigracao(E.pwaMod.migracaoPendente(s.migracao, minima) ? { banco: s.migracao, minima } : null);
}
function desenharFaixaMigracao(info) {
  const { ui } = E;
  if (!info) { if (faixaMigracao) { faixaMigracao.remove(); faixaMigracao = null; } return; }
  const P = E.pwaMod;
  // plano 1000 (AS-176): frase simples para todos; o detalhe técnico (nome das migrações) só para a conta da plataforma
  const superConta = !!(E.sessao && E.sessao.conta && E.sessao.conta.super);
  const texto = superConta
    ? `O servidor ainda não recebeu a atualização desta versão do app (banco em «${P.chaveMigracao(info.banco) || info.banco}», esta versão precisa de «${P.chaveMigracao(info.minima) || info.minima}»). Algumas telas podem falhar até a equipe aplicar a atualização.`
    : "Algumas telas podem falhar até a atualização do servidor, que a equipe já está fazendo.";
  if (!faixaMigracao) {
    faixaMigracao = ui.h("div", { class: "faixa faixa-migracao", role: "status" }, ui.icone("alerta"), ui.h("p", null));
    $("faixas-sistema").appendChild(faixaMigracao);
    ui.anunciar("Atualização do servidor pendente.");
  }
  const p = faixaMigracao.querySelector("p");
  if (p.textContent !== texto) p.textContent = texto;
}
/** O servidor recusou com cliente_pausado (contrato 9): marca a empresa como pausada e troca a tela pelo bloqueio honesto (a plataforma só vê a faixa). */
function aoErroApi(e) {
  if (!e) return;
  // plano 1500c · UCC-096: teste vencido e conta suspensa também mudam a situação da empresa na hora (faixa + só consulta), sem esperar recarregar
  if (e.codigo === "teste_expirado" || e.codigo === "conta_suspensa") {
    const cli = E.cliente;
    if (!cli) return;
    const antes = `${cli.status}|${cli.teste_ate}`;
    if (e.codigo === "teste_expirado") { cli.status = "teste"; if (!cli.teste_ate || cli.teste_ate >= E.ui.hojeSP()) cli.teste_ate = diaAnteriorSP(); }
    else cli.status = "suspenso";
    if (`${cli.status}|${cli.teste_ate}` !== antes) { desenharEmpresa(); desenharFaixas(); aplicarSomenteConsulta(); }
    avisarErroDePlano(e);
    return;
  }
  if (e.codigo === "modulo_desligado") { avisarErroDePlano(e); return; }
  if (e.codigo !== "cliente_pausado") return;
  const cli = E.cliente;
  if (!cli || cli.ativo === false) return;
  cli.ativo = false;
  desenharFaixas();
  const equipe = !!(E.sessao && E.sessao.conta && (E.sessao.conta.super || E.sessao.conta.papel === "gestor"));
  if (!equipe && E.ultimaRota) { desmontarAtual(); aoMudarRota(false); }
}
/** plano 1500c · UCC-096/UCC-007: um aviso (no máximo 1 por minuto) com o caminho de venda para o administrador («Ver planos»). */
function avisarErroDePlano(e) {
  const agora = Date.now();
  if (agora - (E.avisoPlanoEm || 0) < 60000) return;
  E.avisoPlanoEm = agora;
  const admin = E.M.rotas.podePapel(papelAtual(), "admin");
  const a = E.M.api.acaoDoErro ? E.M.api.acaoDoErro(e) : null;
  E.ui.toast(E.api.mensagemErro(e), { tipo: "aten", acao: admin && a ? { rotulo: a.rotulo, fn: () => navegar(a.hash) } : null });
}
/** O dia anterior ao de hoje em São Paulo (o teste que o servidor diz vencido, sem data na sessão). */
function diaAnteriorSP() { return E.ui.hojeSP(new Date(Date.now() - DIA_MS)); }
/** plano 1500c · UCC-019: o pulso trouxe outra situação da empresa (status, teste_ate) — a pílula, as faixas e o «só consulta» acompanham. */
function atualizarSituacaoDoCliente(sit) {
  const cli = E.cliente;
  if (!cli || !sit) return;
  const antes = `${cli.status}|${cli.teste_ate}`;
  if (typeof sit.status === "string" && sit.status) cli.status = sit.status;
  if (sit.teste_ate === null || typeof sit.teste_ate === "string") cli.teste_ate = sit.teste_ate || null;
  if (`${cli.status}|${cli.teste_ate}` === antes) return;
  desenharEmpresa(); desenharFaixas(); aplicarSomenteConsulta();
}
/** plano 1500c · UCC-020: o pulso alonga para o teto (60 s) depois disto sem toque nem tecla. */
const OCIOSO_PULSO_MS = 10 * 60000;

// M13: o Chrome/Edge/Android avisam que o app é instalável; guardamos o evento para o botão «Instalar o app» e escondemos o aviso automático
addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); E.instalarEvento = ev; });
addEventListener("appinstalled", () => { E.instalarEvento = null; });

iniciar();
