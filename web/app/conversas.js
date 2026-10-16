/* ============================================================
   ÓRBITA — conversas.js · frente F5 · ESPEC §7.7 T4 (entrada do módulo)
   Central multiatendente: lista · chat · lateral (negócio, tarefas,
   atendimentos). Tempo real pelo pulso do shell + delta de mensagens
   por cursor duplo (nx_cv_mensagens). Sem import estático: os
   pedaços da tela entram por import() com ?v= (ctx.versao).
   Rotas: #/conversas · #/conversas/<id> · #/conversas?contato=<id>
   ============================================================ */

let A = null;          // estado do módulo (sobrevive às trocas de rota dentro de Conversas)
/** plano 1000 · CA-105: depois de quanto tempo a conversa que não abre ganha o aviso de conexão lenta (os testes encurtam). */
export const CONF = { verLentoMs: 8000 };

const ICONES_LOCAIS = Object.freeze({
  responder: ["M9.5 14.5 4.5 9.5l5-5", "M4.5 9.5h10a5.5 5.5 0 0 1 0 11h-3"],
  baixar: ["M12 4v11", "M7.5 10.5 12 15l4.5-4.5", "M5 19.5h14"],
  documento: ["M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z", "M14 3.5v5h5", "M8.5 13h7M8.5 16.5h5"],
  imagem: ["M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z", "M3.5 16l4.5-4.5 4 4 3-3 5.5 5.5", "M15.5 9a1.5 1.5 0 1 0 0-.01"],
  transferir: ["M4 8h13", "M13.5 4.5 17 8l-3.5 3.5", "M20 16H7", "M10.5 12.5 7 16l3.5 3.5"],
  pendente: ["M12 7v5l3 2", "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z"],
  reabrir: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  modelo: ["M4.5 5.5h15v4h-15z", "M4.5 12.5h9", "M4.5 16.5h12", "M4.5 20h6"],
  lateral: ["M4 5h16v14H4z", "M14.5 5v14"],
  // plano 50: tipo da última mensagem na lista, player de áudio e visualizador de mídia
  video: ["M4 6.5h11a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5z", "M16.5 10.5 21.5 8v8l-5-2.5"],
  play: ["M8 5.5v13l10.5-6.5z"],
  pausa: ["M8 5.5h3v13H8z", "M13.5 5.5h3v13h-3z"],
  ampliar: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M15.5 15.5 20 20", "M10.5 7.5v6M7.5 10.5h6"],
});

function icone(nome, cls) {
  const ui = A.ui;
  const p = ICONES_LOCAIS[nome];
  if (!p) return ui.icone(nome, cls);
  return ui.h("svg", { class: cls ? `ic ${cls}` : "ic", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    p.map(d => ui.h("path", { d })));
}

/* ============================================================ montar / desmontar */
export async function montar(ctx) {
  if (A && A.raiz && A.raiz.isConnected && A.ctx.cliente && ctx.cliente && A.ctx.cliente.id === ctx.cliente.id) {
    A.ctx = ctx;
    await aplicarRota(ctx.rota);
    return;
  }
  desmontar();
  const v = encodeURIComponent(ctx.versao || "dev");
  const [L, mLista, mChat, mComposer, mLateral, , G] = await Promise.all([
    import(`./cv-logica.js?v=${v}`), import(`./cv-lista.js?v=${v}`), import(`./cv-chat.js?v=${v}`),
    import(`./cv-composer.js?v=${v}`), import(`./cv-lateral.js?v=${v}`),
    ctx.ui.carregarCss("conversas"),
    import(`./graficos.js?v=${v}`).catch(() => null),      // mini-gráfico da lateral (plano 50 · 35): sem ele a lateral mostra só os contadores
  ]);
  const { ui } = ctx;
  A = {
    ctx, ui, api: ctx.api, L, G, icone: (n, c) => icone(n, c),
    raiz: null, base: null, eu: null, podeEscrever: ctx.pode("atendente"),
    aba: lerPreferencia("aba", "minhas"), filtro: lerFiltroGuardado(ctx.cliente && ctx.cliente.id), busca: "",   // plano 1000 · CA-229: o filtro volta como a pessoa deixou
    itens: [], contagens: {}, temMais: false, carregandoLista: false,
    selId: null, ver: null, msgs: [], conversasContato: [], agora: null, ultimoId: null, temMaisAntes: false,
    iaEstado: null, iaEstadoEm: 0, iaEstadoPendente: false,
    carregandoAntes: false, rascunhos: new Map(), midia: new Map(), pedidosMidia: new Set(), blobs: new Set(), envios: new Map(),
    fila: { itens: new Map(), db: null, rodando: false, emVoo: new Set(), pronta: null },
    painel: "lista", timers: [], limpar: [], seqConversa: 0, seqLista: 0, destruido: false, acoes,
    buscaMsgs: null, seqMsgs: 0,
    avancar: lerPreferencia("avancar", "0") === "1",       // M35: «Ao resolver, abrir a próxima» (preferência por navegador; desligada até a pessoa ligar)
    focoAoAbrir: null, resolvendo: new Set(), atendendo: false,
    reenviadas: new Set(),          // falhas gravadas pelo servidor em que a pessoa já tocou em «Tentar de novo» (o botão da bolha antiga some)
    marcaNovas: null,               // plano 50 · 31: id da 1ª mensagem não lida ao abrir (separador «Mensagens novas»)
    velocidadeAudio: L.velocidadeValida(lerPreferencia("audio-vel", "1")),   // plano 50 · 32: 1× · 1,5× · 2×, lembrada por navegador
    densidade: lerPreferencia("densidade", "confortavel") === "compacta" ? "compacta" : "confortavel",   // plano 50 · 34: linhas da lista
    // plano 100
    etiquetasEmVoo: 0, etqFila: Promise.resolve(),   // D20: pedidos de etiqueta em ordem, um por vez
    notaSemReq: false,                               // D2: banco sem o nx_cv_nota com p_req (S-B13): a nota sai sem ele
    canaisCaidosShell: null,                         // D18: números caídos que o shell conhece (ctx.canais); null = o shell não oferece
  };
  { const daRota = abaDaRota(ctx.rota); if (daRota) A.aba = daRota; }
  if (!A.podeEscrever && A.aba === "minhas") A.aba = "abertas";

  // esqueleto da tela
  A.raiz = ui.h("div", { class: "cv", dataset: { painel: "lista", densidade: A.densidade } });
  const colLista = ui.h("section", { class: "cv-col cv-col-lista", "aria-label": "Lista de conversas" });
  const colChat = ui.h("section", { class: "cv-col cv-col-chat", "aria-label": "Conversa" });
  const colLat = ui.h("aside", { class: "cv-col cv-col-lat", "aria-label": "Detalhes do contato" });
  A.raiz.append(colLista, colChat, colLat);
  A.colLat = colLat;
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(A.raiz);
  colLista.appendChild(ui.esqueleto("lista", 8));
  colChat.appendChild(ui.h("div", { class: "cvc-vazio" }, ui.h("div", { class: "cvc-vazio-in" }, ui.esqueleto("cartoes", 1))));

  // pedaços da tela
  A.lista = mLista.criarLista(A);
  A.composer = mComposer.criarComposer(A);
  A.chat = mChat.criarChat(A);
  A.lateral = mLateral.criarLateral(A);

  ajustarAltura();
  observarLayout();

  // M40: base da central e primeira página da fila não dependem uma da outra; começa a leitura da lista enquanto chega a configuração.
  const listaInicial = carregarLista({ reset: true });
  try {
    await carregarBase();
  } catch (e) {
    desmontar();
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(ui.erroCartao(e, () => montar(ctx)));
    return;
  }
  // plano 1000b · CB-116: filtro lembrado com departamento/número/etiqueta/pessoa que não existe mais esvaziava a lista
  if (podarFiltroGuardado()) {
    gravarFiltro(A.filtro);
    ui.toast("Um filtro guardado foi removido: o que ele filtrava não existe mais.", { tipo: "info" });
    listaInicial.catch(() => {}).then(() => { if (A) carregarLista({ reset: true }); });
  }
  ui.limpar(colLista); colLista.appendChild(A.lista.el);
  ui.limpar(colChat); colChat.appendChild(A.chat.el);
  A.chat.mostrarVazio();
  A.lateral.montarEm(colLat);

  // fila de saída (M36): o que a pessoa mandou e ainda não foi confirmado pelo servidor sobrevive a recarregar, a aba descartada e a internet que cai
  A.fila.pronta = filaIniciar();
  // tempo real: pulso do shell (3 s com Conversas aberta) + relógio de 1 min para janelas e esperas
  A.limpar.push(ctx.pulso.assinar(() => aoPulso()));
  // teclado da central (M35) e ações na paleta de comandos (Ctrl/⌘+K), quando o shell oferece o registro
  document.addEventListener("keydown", aoTeclaCentral);
  A.limpar.push(() => document.removeEventListener("keydown", aoTeclaCentral));
  registrarComandos();
  // o navegador só deixa tocar som depois de um toque/clique na página
  const destravar = () => desbloquearAudio();
  document.addEventListener("pointerdown", destravar, { once: true, capture: true });
  A.limpar.push(() => document.removeEventListener("pointerdown", destravar, { capture: true }));
  // D18: número de WhatsApp caído — o shell (ctx.canais) avisa quando muda; sem ele vale o estado de nx_cv_base.canais
  if (ctx.canais && typeof ctx.canais.caidos === "function") {
    try { A.canaisCaidosShell = ctx.canais.caidos() || []; } catch { A.canaisCaidosShell = null; }
    if (typeof ctx.canais.assinar === "function") {
      try {
        const cancelar = ctx.canais.assinar(lista => { if (!A) return; A.canaisCaidosShell = Array.isArray(lista) ? lista : []; A.lista.render(); A.chat.renderCabecalho(); });
        if (typeof cancelar === "function") A.limpar.push(cancelar);
      } catch { /* sem a assinatura, a faixa segue o nx_cv_base */ }
    }
  }
  // D3: voltar à aba com a conversa aberta marca como lida o que chegou enquanto ela estava escondida
  // plano 1000 · CA-244: e a lista/conversa se atualizam NA HORA (antes ficavam velhas até o 1º pulso depois de voltar)
  const aoVisivel = () => { if (!A || document.hidden) return; if (A.ver) marcarLida(); aoPulso(); };
  document.addEventListener("visibilitychange", aoVisivel);
  A.limpar.push(() => document.removeEventListener("visibilitychange", aoVisivel));
  // D10: «Enviar agora» acompanha a conexão (desligado sem internet, com o motivo)
  const aoRede = () => { if (A && A.ver) A.chat.renderMensagens({ rolar: "manter" }); };
  window.addEventListener("online", aoRede);
  window.addEventListener("offline", aoRede);
  A.limpar.push(() => { window.removeEventListener("online", aoRede); window.removeEventListener("offline", aoRede); });
  A.timers.push(setInterval(() => { if (!document.hidden) { A.lista.render(); A.chat.renderCabecalho(); A.composer.atualizar(); } }, 60000));
  A.timers.push(setInterval(() => { if (Date.now() - (A.baseEm || 0) > 5 * 60000) carregarBase().catch(() => {}); }, 60000));

  await listaInicial;
  await aplicarRota(ctx.rota);
}

export function desmontar() {
  if (!A) return;
  A.destruido = true;
  // D9: timers do módulo (pulso, nx_cv_ver, mídia, rascunho) não podem rodar contra a tela que montar em seguida
  clearTimeout(_pulsoT); clearTimeout(_verT); clearTimeout(_midiaT); clearTimeout(_rascT);
  _pulsoT = _verT = _midiaT = _rascT = null;
  _lida = { id: null, em: 0 };
  if (A.lista && typeof A.lista.desmontar === "function") A.lista.desmontar();   // plano 1000b · CB-072: o IntersectionObserver da lista
  if (A.chat && typeof A.chat.desmontar === "function") A.chat.desmontar();
  if (A.composer && typeof A.composer.desmontar === "function") A.composer.desmontar();
  for (const t of A.timers) clearInterval(t);
  for (const f of A.limpar) try { f(); } catch { /* ok */ }
  for (const cancelar of A.envios.values()) try { cancelar(); } catch { /* ok */ }
  for (const u of A.blobs) try { URL.revokeObjectURL(u); } catch { /* ok */ }
  document.documentElement.classList.remove("cv-chat-aberto");
  if (A.gavetaLateral) try { A.gavetaLateral.fechar(); } catch { /* ok */ }
  A = null;
}

/* ============================================================ preferências (por navegador) */
function lerPreferencia(k, padrao) { try { return localStorage.getItem(`nx-cv-${k}`) || padrao; } catch { return padrao; } }
function gravarPreferencia(k, v) { try { localStorage.setItem(`nx-cv-${k}`, v); } catch { /* sem storage */ } }
/** plano 1000 · CA-229: o filtro da lista lembrado por navegador e por empresa (os ids de departamento/número/etiqueta são dela); só as
    chaves conhecidas e com o formato certo voltam. */
const CHAVES_FILTRO = ["departamento_id", "canal_id", "atendente", "etiquetas", "nao_lidas"];
const chaveFiltro = cliente => `nx-cv-filtro:${cliente || "-"}`;
function lerFiltroGuardado(cliente) {
  try {
    const f = JSON.parse(localStorage.getItem(chaveFiltro(cliente)) || "{}");
    if (!f || typeof f !== "object" || Array.isArray(f)) return {};
    const r = {};
    for (const k of CHAVES_FILTRO) {
      const v = f[k];
      if (k === "etiquetas") { if (Array.isArray(v) && v.length) r.etiquetas = v.filter(x => typeof x === "string" || typeof x === "number").slice(0, 20); }
      else if (k === "nao_lidas") { if (v === true) r.nao_lidas = true; }
      else if (typeof v === "string" && v) r[k] = v.slice(0, 80);
    }
    return r;
  } catch { return {}; }
}
/** plano 1000b · CB-116: tira do A.filtro os ids que a base não conhece mais (só confere a lista que a base mandou). → true se mudou. */
function podarFiltroGuardado() {
  const f = A.filtro || {}, b = A.base || {};
  const existe = (lista, id) => !Array.isArray(lista) || lista.some(x => x && String(x.id) === String(id));
  let mudou = false;
  for (const [k, lista] of [["departamento_id", b.departamentos], ["canal_id", b.canais]]) {
    if (f[k] && !existe(lista, f[k])) { delete f[k]; mudou = true; }
  }
  if (f.atendente && !["eu", "sem"].includes(f.atendente) && !existe(b.usuarios, f.atendente)) { delete f.atendente; mudou = true; }
  if (f.atendente === "eu" && !A.podeEscrever) { delete f.atendente; mudou = true; }   // CB-068: «Comigo» não vale para quem só lê
  if (Array.isArray(f.etiquetas) && Array.isArray(b.etiquetas)) {
    const ok = f.etiquetas.filter(id => existe(b.etiquetas, id));
    if (ok.length !== f.etiquetas.length) { mudou = true; if (ok.length) f.etiquetas = ok; else delete f.etiquetas; }
  }
  A.filtro = f;
  return mudou;
}
function gravarFiltro(f) {
  const k = chaveFiltro(A && A.ctx.cliente && A.ctx.cliente.id);
  try { const vazio = !f || !Object.keys(f).length; if (vazio) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(f)); } catch { /* sem storage */ }
}

/* ============================================================ layout */
function ajustarAltura() {
  if (!A || !A.raiz || !A.raiz.isConnected) return;
  const vv = window.visualViewport;
  const alturaTela = vv ? vv.height : window.innerHeight;
  const topo = A.raiz.getBoundingClientRect().top + (window.scrollY || 0) - (vv ? vv.offsetTop : 0);
  const celular = matchMedia("(max-width: 760px)").matches;
  const chatCheio = celular && A.painel === "chat";
  const barra = document.querySelector(".barra");
  const hBarra = celular && !chatCheio && barra ? barra.getBoundingClientRect().height : 0;
  const h = Math.max(0, Math.floor(alturaTela - Math.max(0, topo) - hBarra));
  A.raiz.style.setProperty("--cv-altura", `${h}px`);
}

function observarLayout() {
  // plano 1000b · CB-052: resize e visualViewport.resize chegam dezenas de vezes por segundo (girar o celular, abrir o teclado) — um
  // trabalho por quadro (requestAnimationFrame), não um redesenho do cabeçalho por evento
  let quadro = 0;
  const onResize = () => {
    if (quadro) return;
    quadro = requestAnimationFrame(() => { quadro = 0; if (!A) return; mostrarPainel(A.painel); ajustarAltura(); posicionarLateral(); });
  };
  A.limpar.push(() => { if (quadro && typeof cancelAnimationFrame === "function") cancelAnimationFrame(quadro); quadro = 0; });
  addEventListener("resize", onResize);
  const vv = window.visualViewport;
  if (vv) vv.addEventListener("resize", onResize);
  A.limpar.push(() => { removeEventListener("resize", onResize); if (vv) vv.removeEventListener("resize", onResize); });
  const mq = matchMedia("(max-width: 1280px)");
  const onMq = () => posicionarLateral();
  mq.addEventListener("change", onMq);
  A.limpar.push(() => mq.removeEventListener("change", onMq));
  posicionarLateral();
  // faixas do shell (suporte/teste) mudam a altura disponível
  const faixas = document.getElementById("faixas") || document.querySelector(".faixas");
  if (faixas && "ResizeObserver" in window) {
    const ro = new ResizeObserver(() => ajustarAltura());
    ro.observe(faixas);
    A.limpar.push(() => ro.disconnect());
  }
}

function posicionarLateral() {
  if (!A || !A.raiz) return;
  const gaveta = matchMedia("(max-width: 1280px)").matches;
  A.raiz.dataset.lateral = gaveta ? "gaveta" : "coluna";
  if (!gaveta && A.gavetaLateral) { try { A.gavetaLateral.fechar(); } catch { /* ok */ } A.gavetaLateral = null; A.lateral.montarEm(A.colLat); }
  if (A.chat) A.chat.renderCabecalho();
}

function mostrarPainel(p) {
  A.painel = p;
  A.raiz.dataset.painel = p;
  const celular = matchMedia("(max-width: 760px)").matches;
  document.documentElement.classList.toggle("cv-chat-aberto", celular && p === "chat");
  requestAnimationFrame(ajustarAltura);
}

/** Abre a lateral numa gaveta (telas ≤ 1280 px). */
function abrirDetalhes() {
  if (!A.ver) return;
  const corpo = A.ui.h("div", { class: "cv-lat-gaveta" });
  A.gavetaLateral = A.ui.gaveta({
    titulo: "Detalhes", corpo, largura: "m",
    aoFechar: () => { A && (A.gavetaLateral = null); if (A) A.lateral.montarEm(A.colLat); },
  });
  A.lateral.montarEm(corpo);
}

/* ============================================================ dados */
async function carregarBase() {
  const b = await A.api.rpcC("nx_cv_base");
  if (!A) return;
  A.base = b || {};
  A.baseEm = Date.now();
  A.eu = A.base.eu || { id: A.ctx.sessao.conta.id, nome: A.ctx.sessao.conta.nome, papel: A.ctx.papel };
  if (A.lista && A.lista.el.isConnected) A.lista.render();
  if (A.chat && A.ver) A.chat.renderCabecalho();
}

function filtroAtual() {
  const f = { aba: A.aba, ...A.filtro };
  if (A.busca && A.busca.trim().length >= 2) f.busca = A.busca.trim();
  return f;
}

/** Lista da aba atual. reset: volta ao topo; manter: recarrega o que já está na tela (pulso). */
async function carregarLista({ reset = false, mais = false } = {}) {
  if (!A) return;
  const seq = ++A.seqLista;
  let antes = null, limite = 50;
  if (mais && A.itens.length) {
    const ult = A.itens[A.itens.length - 1];
    antes = A.aba === "aguardando" && !filtroAtual().busca ? ult.ultima_entrada_em : ult.ultima_msg_em;
  } else if (!reset) {
    limite = Math.min(100, Math.max(50, A.itens.length));
  }
  A.carregandoLista = true;
  if (reset) A.lista.mostrarCarregando();
  try {
    const filtro = filtroAtual(), chave = JSON.stringify(filtro);
    // plano 1000 · CA-103: a 1ª página da aba (troca de aba/abertura) usa a última resposta guardada no aparelho (cache.js) para a 1ª
    // pintura; se a rede falhar depois, a lista guardada fica com a faixa «Sem conexão · lista de 14:02»
    const opc = reset && !mais ? { cache: true, aoCache: (dados, em) => {
      if (!A || seq !== A.seqLista || !dados || !Array.isArray(dados.itens)) return;
      A.itens = itensComPendencia(dados.itens); A.temMais = !!dados.tem_mais; A.contagens = dados.contagens || {}; A.itensChave = chave;
      A.listaCacheEm = em || Date.now(); A.carregandoLista = false; A.lista.render({ reset: true }); A.carregandoLista = true;
    } } : {};
    // plano 1000b · CB-205: na página seguinte por «última mensagem», o id da última linha desempata conversas com o mesmo horário
    // (o servidor usa p_filtro.antes_id: (ultima_msg_em, id) < (p_antes, antes_id)); a chave do cache continua sem ele
    const ultLinha = mais && A.itens.length ? A.itens[A.itens.length - 1] : null;
    const usaMsgEm = ultLinha && !(A.aba === "aguardando" && !filtro.busca);
    const filtroReq = usaMsgEm && ultLinha.id != null ? { ...filtro, antes_id: ultLinha.id } : filtro;
    const r = await A.api.rpcC("nx_cv_listar", { p_filtro: filtroReq, p_limite: limite, p_antes: antes }, opc);
    if (!A || seq !== A.seqLista) return;
    A.listaCacheEm = null; A.listaSoCache = false;
    // revisão: o que está na tela é de OUTRO filtro (trocou de aba e um pulso descartou a leitura da troca)? então nada de mesclar
    // nem de somar «carregar mais» — a lista vira só a página que chegou (antes: conversas abertas penduradas em «Resolvidas»)
    const mesmoFiltro = A.itensChave === chave;
    if (!reset && !mais && mesmoFiltro) {
      avisarNovidades(A.itens, r.itens || [], A.contagens && A.contagens.nao_lidas, r.contagens && r.contagens.nao_lidas);
      // leitor de tela: a lista anuncia a conversa nova (a que está aberta e à vista não: quem a lê já viu)
      const novas = A.L.novasEntradas(A.itens, r.itens || [], { ignorar: A.selId && !document.hidden ? A.selId : null });
      if (novas.length) A.lista.anunciar(A.L.textoNovaMensagem(novas));
    }
    // D6: o pulso relê a 1ª página e o que «Carregar mais» já trouxe DEPOIS dela fica (antes a lista voltava a 100 e conversas sumiam)
    const pulso = !reset && !mais && mesmoFiltro ? A.L.mesclarPaginaLista(A.itens, r.itens || [], { temMais: !!r.tem_mais, aguardando: A.aba === "aguardando" && !filtroAtual().busca }) : null;
    // plano 1000 · CA-094: a página seguinte entra por um Set de ids (antes some() dentro de filter: quadrático com listas grandes)
    A.itens = itensComPendencia(mais && mesmoFiltro ? A.L.juntarPagina(A.itens, r.itens || []) : pulso ? pulso.itens : (r.itens || []));
    A.temMais = pulso && pulso.preservadas ? A.temMais : !!r.tem_mais;
    A.itensChave = chave;
    A.contagens = r.contagens || {};
    A.ctx.badge("conversas", A.contagens.nao_lidas || 0);
    A.erroLista = null;
    A.falhasLista = 0; A.listaOkEm = new Date().toISOString();   // plano 1000b · CB-087
  } catch (e) {
    if (!A || seq !== A.seqLista) return;
    A.falhasLista = (Number(A.falhasLista) || 0) + 1;            // plano 1000b · CB-087: 3 seguidas → faixa «Lista sem atualizar desde…»
    if (e && e.comCache && A.listaCacheEm) { A.erroLista = null; A.listaSoCache = true; return; }   // a lista guardada fica na tela, com a faixa
    A.erroLista = e;
    if (e && e.codigo === "sessao_invalida") return;
  } finally {
    if (A && seq === A.seqLista) { A.carregandoLista = false; A.lista.render({ reset }); }
  }
}

/* ============================================================ avisos de mensagem nova (P1)
   Com a aba do navegador escondida: som curto (Web Audio, sem arquivo) e, se a pessoa
   permitiu, aviso na área de trabalho. Preferência por navegador (localStorage). */
function lerAvisos() {
  // plano 1000b · CB-049: semFoco (ligado por padrão) — avisa também com a janela visível mas sem foco (Órbita atrás do sistema da clínica)
  // plano 1000b · CB-050: quem (ligado por padrão) — desligado, a tela bloqueada não mostra o nome do paciente
  try { const p = JSON.parse(localStorage.getItem("nx-cv-avisos") || "{}"); return { som: p.som !== false, tela: p.tela === true, texto: p.texto === true, semFoco: p.semFoco !== false, quem: p.quem !== false }; }
  catch { return { som: true, tela: false, texto: false, semFoco: true, quem: true }; }
}
function gravarAvisos(p) { try { localStorage.setItem("nx-cv-avisos", JSON.stringify(p)); } catch { /* sem storage */ } }

let _audio = null;
function desbloquearAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _audio = _audio || new AC();
    if (_audio.state === "suspended") _audio.resume().catch(() => {});
  } catch { /* sem áudio */ }
}
function tocarSom() {
  try {
    desbloquearAudio();
    if (!_audio || _audio.state !== "running") return;
    const t0 = _audio.currentTime + 0.02;
    for (const [freq, atraso] of [[880, 0], [1318.5, 0.13]]) {
      const o = _audio.createOscillator(), g = _audio.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + atraso);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + atraso + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.38);
      o.connect(g); g.connect(_audio.destination);
      o.start(t0 + atraso); o.stop(t0 + atraso + 0.42);
    }
  } catch { /* sem áudio */ }
}
function avisarNovidades(antes, depois, nlAntes, nlDepois) {
  if (!A) return;
  // plano 1000b · CB-049: aba escondida OU janela sem foco (com a preferência ligada) — antes só com a aba escondida
  const semFoco = typeof document.hasFocus === "function" && !document.hasFocus();
  if (!document.hidden && !(semFoco && lerAvisos().semFoco)) return;
  const mapa = new Map((antes || []).map(x => [x.id, x]));
  const chegaram = (depois || []).filter(c => c.ultima_msg_dir === "in" && !c.oculta
    && (Number(c.nao_lidas) || 0) > (Number((mapa.get(c.id) || {}).nao_lidas) || 0));
  if (!chegaram.length && !(Number(nlDepois) > Number(nlAntes))) return;
  const pref = lerAvisos();
  if (pref.som) tocarSom();
  if (pref.tela && "Notification" in window && Notification.permission === "granted") {
    const c = chegaram[0];
    try {
      // plano 1000 · CA-123: o texto do paciente só vai para a tela bloqueada se a pessoa ligou «Mostrar o texto da mensagem no aviso»
      // plano 1000b · CB-050: «Mostrar quem escreveu» desligado → título neutro (nada do paciente na tela bloqueada)
      const n = new Notification(c && pref.quem ? nomeContato(c.contato) : c ? "Mensagem nova na central" : "Mensagem nova", {
        body: c ? (pref.texto ? String(c.ultima_msg_resumo || "Mensagem nova").slice(0, 140) : "Mensagem nova") : "Chegou mensagem nova na central.",
        tag: c ? `nx-cv-${c.id}` : "nx-cv", silent: true });
      n.addEventListener("click", () => { try { window.focus(); } catch { /* ok */ } if (c && A) abrir(c.id); n.close(); });
    } catch { /* navegador sem suporte */ }
  }
}
async function menuAvisos(ancora) {
  const ui = A.ui;
  const pref = lerAvisos();
  const suporta = "Notification" in window;
  const perm = suporta ? Notification.permission : "denied";
  ui.menu(ancora, [
    { rotulo: pref.som ? "Som de mensagem nova: ligado" : "Som de mensagem nova: desligado", icone: "sino", fn: () => {
      const p = lerAvisos(); p.som = !p.som; gravarAvisos(p);
      if (p.som) { desbloquearAudio(); tocarSom(); }
      ui.toast(p.som ? "Som ligado: toca quando chega mensagem com a aba escondida." : "Som desligado.", { tipo: "info" });
      A.lista.render();
    } },
    { rotulo: pref.tela && perm === "granted" ? "Aviso na área de trabalho: ligado" : "Aviso na área de trabalho: desligado", icone: "info",
      desabilitado: !suporta, fn: async () => {
        const p = lerAvisos();
        if (p.tela && perm === "granted") { p.tela = false; gravarAvisos(p); ui.toast("Avisos na área de trabalho desligados.", { tipo: "info" }); A.lista.render(); return; }
        let r = perm;
        if (r === "default") { try { r = await Notification.requestPermission(); } catch { r = "denied"; } }
        if (r === "granted") { p.tela = true; gravarAvisos(p); ui.toast("Pronto: avisamos na área de trabalho quando chegar mensagem com a aba escondida.", { tipo: "ok" }); }
        else ui.toast("O navegador bloqueou os avisos deste site. Libere em Configurações do site (cadeado ao lado do endereço).", { tipo: "info", ms: 8000 });
        if (A) A.lista.render();
      } },
    // plano 1000b · CB-049: a preferência «com a janela sem foco» (ligada por padrão)
    { rotulo: pref.semFoco ? "Avisar também com a janela sem foco: ligado" : "Avisar também com a janela sem foco: desligado", icone: "sino", fn: () => {
      const p = lerAvisos(); p.semFoco = !p.semFoco; gravarAvisos(p);
      ui.toast(p.semFoco ? "Avisamos também quando o Órbita está aberto atrás de outra janela." : "Avisamos só com a aba escondida.", { tipo: "info" });
    } },
    // plano 1000 · CA-123: por padrão o aviso só diz o nome (a tela bloqueada não mostra o que o paciente escreveu)
    pref.tela && perm === "granted" ? { rotulo: pref.texto ? "Mostrar o texto da mensagem no aviso: ligado" : "Mostrar o texto da mensagem no aviso: desligado", icone: "olho", fn: () => {
      const p = lerAvisos(); p.texto = !p.texto; gravarAvisos(p);
      ui.toast(p.texto ? "O aviso mostra o começo da mensagem." : "O aviso mostra só o nome de quem escreveu.", { tipo: "info" });
    } } : null,
    // plano 1000b · CB-050: o nome do paciente também pode sair da tela bloqueada
    pref.tela && perm === "granted" ? { rotulo: pref.quem ? "Mostrar quem escreveu no aviso: ligado" : "Mostrar quem escreveu no aviso: desligado", icone: "olho", fn: () => {
      const p = lerAvisos(); p.quem = !p.quem; gravarAvisos(p);
      ui.toast(p.quem ? "O aviso mostra o nome de quem escreveu." : "O aviso diz só «Mensagem nova na central».", { tipo: "info" });
    } } : null,
    "-",
    // CA-228: a densidade das linhas mora aqui (antes ficava escondida dentro de Filtros, e não é filtro)
    { rotulo: A.densidade === "compacta" ? "Linhas compactas: ligado" : "Linhas compactas: desligado", icone: "menu", fn: () => {
      acoes.definirDensidade(A.densidade === "compacta" ? "confortavel" : "compacta");
      ui.toast(A.densidade === "compacta" ? "Linhas compactas: cabem mais conversas na tela." : "Linhas confortáveis.", { tipo: "info" });
    } },
  ].filter(Boolean));
}

/** Mudou a aba, a busca ou os filtros. */
function mudarLista({ aba, busca, filtro } = {}) {
  if (aba !== undefined && aba !== A.aba) { A.aba = aba; gravarPreferencia("aba", aba); }
  if (busca !== undefined && busca !== A.busca) { A.busca = busca; buscarMensagens(); }
  if (filtro !== undefined) { A.filtro = filtro; gravarFiltro(filtro); }    // CA-229: «Limpar filtros» apaga também a lembrança
  return carregarLista({ reset: true });
}

/** Busca nas mensagens (P0-B): com 3+ letras, junto da busca por nome/telefone/protocolo. */
async function buscarMensagens() {
  if (!A) return;
  const q = (A.busca || "").trim();
  const seq = ++A.seqMsgs;
  if (q.length < 3) { A.buscaMsgs = null; return; }
  A.buscaMsgs = { q, carregando: true, itens: [], erro: null };
  A.lista.render();
  try {
    const r = await A.api.rpcC("nx_cv_buscar_msgs", { p_q: q, p_limite: 20 });
    if (!A || seq !== A.seqMsgs) return;
    A.buscaMsgs = { q, carregando: false, itens: Array.isArray(r) ? r : [], erro: null };
  } catch (e) {
    if (!A || seq !== A.seqMsgs) return;
    A.buscaMsgs = { q, carregando: false, itens: [], erro: e };
  }
  A.lista.render();
  // anuncia UMA vez por resultado: o bloco «Nas mensagens» é redesenhado a cada render e uma região viva ali repetiria a frase sem parar
  const b = A.buscaMsgs;
  if (b && b.q === q && !b.carregando && A.ui && typeof A.ui.anunciar === "function") {
    A.ui.anunciar(b.erro ? "Não deu para procurar nas mensagens agora. Use «Tentar novamente» na lista."
      : b.itens.length ? `${b.itens.length} ${b.itens.length === 1 ? "mensagem" : "mensagens"} com «${q}».` : `Nenhuma mensagem com «${q}».`);
  }
}

/** Abre a conversa já na mensagem (resultado da busca): carrega páginas anteriores até achar. */
async function irParaMensagem(mid) {
  if (!A || !mid) return;
  const conv = A.selId;
  for (let i = 0; i < 8 && A && A.selId === conv; i++) {
    if (A.msgs.some(m => Number(m.id) === mid)) break;
    if (!A.temMaisAntes) break;
    await carregarAntes();
  }
  if (!A || A.selId !== conv) return;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  A.chat.destacar(mid);
}

/* ============================================================ rota e seleção */
/** #/conversas?aba=<id> (links do Início): id válido de L.ABAS que o papel pode ver, senão null. */
function abaDaRota(r) {
  const q = (r && r.query && r.query.aba) || "";
  const aba = A.L.ABAS.find(x => x.id === q);
  if (!aba) return null;
  if (aba.min && !A.L.pode(A.ctx.papel, aba.min)) return null;
  return aba.id;
}

async function aplicarRota(r) {
  if (!A) return;
  const partes = (r && r.partes) || [];
  const query = (r && r.query) || {};
  const id = partes[0] && /^\d+$/.test(partes[0]) ? Number(partes[0]) : null;
  A.ctx.titulo("Conversas");
  const abaRota = abaDaRota(r);
  if (abaRota && abaRota !== A.aba) mudarLista({ aba: abaRota });
  const textoPronto = textoProntoDaRota(query);
  if (id) {
    await selecionar(id);
    if (query.msg && /^\d+$/.test(query.msg)) irParaMensagem(Number(query.msg));
    if (textoPronto) colocarTextoPronto(id, textoPronto);
    return;
  }
  if (query.contato && /^\d+$/.test(query.contato)) { await abrirPorContato(Number(query.contato), textoPronto); return; }
  if (textoPronto) copiarTextoPronto(textoPronto, { limparRota: true });
  A.selId = null; A.ver = null; A.msgs = [];
  A.chat.mostrarVazio();
  A.lateral.render();
  A.lista.render();
  mostrarPainel("lista");
  if (A.focoAoAbrir === "lista") {            // sem próxima conversa: o foco volta para a lista (depois de o shell levar o foco ao título)
    A.focoAoAbrir = null;
    setTimeout(() => focarListaOuVazio(), 160);
  }
}

function abrir(id) { A.ctx.navegar(`#/conversas/${id}`); }

async function selecionar(id) {
  if (!A) return;
  const trocou = A.selId !== id;
  // o texto do campo é guardado na conversa DELE (o composer sabe qual é), não na selecionada: numa troca dupla rápida o campo ainda é da primeira
  if (A.selId && trocou) guardarRascunho();
  A.selId = id;
  mostrarPainel("chat");
  A.lista.render();
  A.lista.mostrarSelecionada();
  if (!trocou && A.ver) { A.chat.focarMensagens(); return; }
  const seq = ++A.seqConversa;
  A.ver = null; A.msgs = []; A.conversasContato = []; A.ultimoId = null; A.agora = null; A.temMaisAntes = false;
  A.iaEstado = null; A.iaEstadoEm = 0; A.iaEstadoPendente = false; A.marcaNovas = null;
  A.erroVer = null;   // plano 1000b · CB-131
  A.chat.mostrarCarregando();
  A.lateral.render();
  // plano 1000 · CA-105: passou de 8 s sem abrir — «A conexão está lenta… ainda tentando» + «Tentar de novo» (antes o esqueleto ficava mudo)
  const tLento = setTimeout(() => { if (A && seq === A.seqConversa && !A.ver) A.chat.mostrarLento(() => { if (A && A.selId === id) { A.ver = null; A.selId = null; selecionar(id); } }); }, CONF.verLentoMs);
  try {
    const [ver, pag] = await Promise.all([
      A.api.rpcC("nx_cv_ver", { p_id: id }),
      A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_limite: 50 }),
    ]).finally(() => clearTimeout(tLento));
    if (!A || seq !== A.seqConversa) return;
    if (A.fila.pronta) await A.fila.pronta;
    if (!A || seq !== A.seqConversa) return;        // a conversa pode ter mudado enquanto a fila abria
    A.ver = { ...ver, conversa: comPendencia(ver.conversa) };
    A.msgs = A.L.mesclarDelta([], pag.itens || []);
    for (const it of filaDaConversa(id)) A.msgs = A.L.mesclarDelta(A.msgs, [bolhaDeItem(it)]);
    A.conversasContato = pag.conversas || [];
    A.agora = pag.agora || null;
    A.ultimoId = pag.ultimo_id ?? A.L.ultimoId(A.msgs);
    A.temMaisAntes = !!pag.tem_mais;
    A.marcaNovas = A.L.primeiraNaoLida(A.msgs, ver.conversa && ver.conversa.nao_lidas);   // «Mensagens novas» fica onde a leitura parou
    atualizarItemLista(A.ver.conversa);
    // plano 1000 · CA-240: «Mariana Costa · Conversas» — com várias abas abertas dá para saber que esta é a central
    A.ctx.titulo(nomeContato(ver.contato) ? `${nomeContato(ver.contato)} · Conversas` : "Conversas");
    // CA-087: mais de 3 não lidas — abre no separador «Mensagens novas» (lendo de onde parou), com a pílula «Ir para o fim»
    A.chat.renderTudo({ rolar: A.L.abrirNoSeparador(A.marcaNovas, ver.conversa && ver.conversa.nao_lidas) ? "separador" : "fim" });
    A.composer.definirConversa();
    A.lateral.render();
    if (A.focoAoAbrir === "composer") {            // veio do teclado (próxima, anterior, atender, resolver que avança): o campo já está pronto para digitar
      A.focoAoAbrir = null;
      if (!matchMedia("(pointer: coarse)").matches) A.composer.focar();
    }
    marcarLida();
    if (ver.conversa?.canal?.provedor === "codewords") carregarEstadoIA(id, seq);
  } catch (e) {
    if (!A || seq !== A.seqConversa) return;
    A.focoAoAbrir = null;
    A.erroVer = id;   // plano 1000b · CB-131: a lateral sai do esqueleto («Sem detalhes: a conversa não abriu»)
    A.chat.mostrarErro(e, () => selecionar(id));
    A.lateral.render();
  }
}

/** plano 1000 · AS-272: `?texto=` (ex.: o convite «Enviar pela central») — no máximo 1000 caracteres, sem \r; vazio → "". */
export function textoProntoDaRota(query) {
  const t = query && typeof query.texto === "string" ? query.texto.replace(/\r/g, "").slice(0, 1000) : "";
  return t.trim() ? t : "";
}

/** AS-272: o texto pronto só PREENCHE o campo da conversa aberta (a pessoa revisa e envia); nunca envia sozinho. Sem campo para escrever: copia. */
function colocarTextoPronto(id, texto) {
  if (!A) return;
  // plano 1000b · CB-125: conversa resolvida tem o campo desligado — o texto vai para a área de transferência e a pessoa sabe o que fazer
  if (A.selId === id && A.ver && A.ver.conversa && A.ver.conversa.status === "resolvida") {
    Promise.resolve(A.ui.copiar(texto, { aviso: "Texto copiado. Reabra o atendimento para enviar." })).catch(() => {});
    A.ui.toast("Reabra o atendimento para enviar: esta conversa está resolvida (o texto foi copiado).", { tipo: "info" });
    A.ctx.navegar(`#/conversas/${id}`, { substituir: true });
    return;
  }
  if (A.selId === id && A.ver && A.podeEscrever && A.composer && typeof A.composer.devolverTexto === "function") {
    A.composer.devolverTexto(texto);
    A.ui.toast("Texto pronto no campo da conversa. Revise e envie quando quiser.", { tipo: "info" });
    A.ctx.navegar(`#/conversas/${id}`, { substituir: true });     // tira o ?texto= do endereço (recarregar não cola de novo)
  } else copiarTextoPronto(texto, { id });
}

/** AS-272: sem conversa aberta, o texto vai para a área de transferência e a pessoa é avisada (escolhe a conversa e cola). */
function copiarTextoPronto(texto, { id = null, limparRota = false } = {}) {
  if (!A) return;
  Promise.resolve(A.ui.copiar(texto, { aviso: "Texto copiado. Abra a conversa da pessoa e cole no campo para enviar." })).catch(() => {});
  if (id) A.ctx.navegar(`#/conversas/${id}`, { substituir: true });
  else if (limparRota) A.ctx.navegar("#/conversas", { substituir: true });
}

async function abrirPorContato(contatoId, textoPronto = "") {
  try {
    const r = await A.api.rpcC("nx_contato_ver", { p_id: contatoId });
    const lista = (r && r.conversas) || [];
    const aberta = lista.find(c => c.status !== "resolvida") || lista.slice().sort((a, b) => String(b.aberta_em).localeCompare(String(a.aberta_em)))[0];
    const comTexto = textoPronto ? `?texto=${encodeURIComponent(textoPronto)}` : "";
    if (aberta) { A.ctx.navegar(`#/conversas/${aberta.id}${comTexto}`, { substituir: true }); return; }
    A.ctx.navegar("#/conversas", { substituir: true });
    if (textoPronto) copiarTextoPronto(textoPronto);
    novaConversa({ contato: r && r.contato ? r.contato : { id: contatoId } });
  } catch (e) {
    A.ui.toast(A.ui.mensagemErro(e), { tipo: "erro" });
    A.ctx.navegar("#/conversas", { substituir: true });
  }
}

function nomeContato(c) {
  if (!c) return "";
  return (c.nome && String(c.nome).trim()) || (c.telefone ? A.ui.telBR(c.telefone) : "Contato");
}

function atualizarItemLista(conv) {
  if (!conv) return;
  conv = comPendencia(conv);
  const i = A.itens.findIndex(x => x.id === conv.id);
  if (i >= 0) {
    const novo = { ...A.itens[i], ...pick(conv, ["status", "aguardando", "nao_lidas", "atribuida_a", "atribuida_nome", "departamento_id",
      "etiquetas", "negocio", "ultima_msg_em", "ultima_msg_resumo", "ultima_msg_dir", "ultima_entrada_em", "janela_ate", "contato", "oculta"]) };
    A.itens[i] = novo;
  }
  A.lista.render();
}
function pick(o, ks) { const r = {}; for (const k of ks) if (o && k in o) r[k] = o[k]; return r; }

async function recarregarVer() {
  if (!A || !A.selId) return;
  const id = A.selId;
  A.verEm = Date.now();                                    // CA-096: sem mudança na linha da lista, o pulso só relê o nx_cv_ver a cada 30 s
  try {
    const ver = await A.api.rpcC("nx_cv_ver", { p_id: id });
    if (!A || A.selId !== id) return;
    A.ver = { ...ver, conversa: comPendencia(ver.conversa) };
    atualizarItemLista(A.ver.conversa);
    A.chat.renderCabecalho();
    A.composer.atualizar();
    A.lateral.render();
    if (ver.conversa?.canal?.provedor === "codewords" && Date.now() - A.iaEstadoEm > 15000 && !A.iaEstadoPendente) {
      carregarEstadoIA(id, A.seqConversa);
    } else if (ver.conversa?.canal?.provedor !== "codewords" && A.iaEstado) {
      A.iaEstado = null; A.iaEstadoEm = 0; A.chat.renderCabecalho();
    }
  } catch (e) {
    if (e && e.codigo === "conversa_nao_encontrada" && A && A.selId === id) {
      A.ui.toast("Esta conversa saiu do seu alcance (transferida ou removida).", { tipo: "info" });
      A.ctx.navegar("#/conversas");
    }
  }
}

async function carregarEstadoIA(id = A?.selId, seq = A?.seqConversa) {
  if (!A || !id || A.selId !== id || A.iaEstadoPendente || A.ver?.conversa?.canal?.provedor !== "codewords") return;
  A.iaEstadoPendente = true;
  try {
    const r = await A.api.rpcC("nx_cv_ia_estado", { p_conversa: id });
    if (!A || A.selId !== id || A.seqConversa !== seq) return;
    A.iaEstado = r || { disponivel: false };
  } catch (e) {
    if (!A || A.selId !== id || A.seqConversa !== seq) return;
    A.iaEstado = { disponivel: false, erro: A.ui.mensagemErro(e) };
  } finally {
    if (A && A.selId === id && A.seqConversa === seq) {
      A.iaEstadoEm = Date.now();
      A.iaEstadoPendente = false;
      A.chat.renderCabecalho();
    }
  }
}

/** Delta da conversa aberta (cursor duplo: id > último visto OU atualizado nos últimos 30 s do servidor). */
/** Bolha local de mídia cujo arquivo já veio numa mensagem gravada pelo servidor: vale a do servidor (o path é único por upload). */
function descartarMidiaLocalGravada() {
  if (!A) return;
  const gravados = new Set(A.msgs.filter(m => !m.local && m.midia && m.midia.path).map(m => m.midia.path));
  if (gravados.size) A.msgs = A.msgs.filter(m => !(m.local && m.pedido && m.pedido.path && gravados.has(m.pedido.path)));
}
/** plano 1000 · CA-025: falhas seguidas do delta — a partir de 3 o chat mostra «Sem atualizar desde 14:02 · Tentar agora». */
export const DELTA_FALHAS_AVISO = 3;
/** CA-136: delta com tem_mais (voltou de uma queda com centenas de mensagens) pede o resto na hora, até 5 vezes. */
const DELTA_REPETIR_MAX = 5;
async function delta({ repeticao = 0 } = {}) {
  if (!A || !A.selId || !A.ver) return;
  const id = A.selId, seq = A.seqConversa;
  let r;
  try {
    r = await A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_desde: A.agora, p_depois_id: A.ultimoId });
  } catch {
    // o próximo pulso tenta de novo — mas depois de 3 falhas seguidas a pessoa fica sabendo (a conversa parou de atualizar)
    if (!A || seq !== A.seqConversa) return;
    A.deltaFalhas = (A.deltaFalhas || 0) + 1;
    if (A.deltaFalhas >= DELTA_FALHAS_AVISO) A.chat.mostrarAtraso(A.deltaOkEm || Date.now(), () => { A.chat.esconderAtraso(); aoPulso(); });
    return;
  }
  if (!A || seq !== A.seqConversa) return;
  if (A.deltaFalhas) { A.deltaFalhas = 0; A.chat.esconderAtraso(); }
  A.deltaOkEm = Date.now();
  const antes = A.msgs.length;
  const tinhaUlt = A.L.ultimoId(A.msgs);
  A.msgs = A.L.mesclarDelta(A.msgs, r.itens || []);
  descartarMidiaLocalGravada();
  A.conversasContato = r.conversas || A.conversasContato;
  A.agora = r.agora || A.agora;
  A.ultimoId = r.ultimo_id ?? A.L.ultimoId(A.msgs, A.ultimoId);
  const chegouDoCliente = (r.itens || []).some(m => m.direcao === "in" && Number(m.id) > Number(tinhaUlt || 0));
  if ((r.itens || []).length || A.msgs.length !== antes) A.chat.renderMensagens({ rolar: "novas" });
  // D3: chegou mensagem do cliente na conversa aberta e à vista — marca como lida já (uma RPC por lote), sem esperar a lista e o
  // nx_cv_ver trazerem nao_lidas (antes a conversa ficava «1 não lida» com o atendente olhando para ela)
  if (chegouDoCliente && !document.hidden) marcarLida({ forcar: true });
  if (r.tem_mais && (r.itens || []).length && repeticao < DELTA_REPETIR_MAX) await delta({ repeticao: repeticao + 1 });
}

/** CA-096: o que da conversa aberta a lista mostra — mudou, o nx_cv_ver relê; senão, só a cada 30 s (antes: a cada pulso de 3 s). */
const VER_INTERVALO_MS = 30000;
function marcaDaAberta() {
  const it = A && A.itens.find(x => x.id === A.selId);
  return it ? JSON.stringify([it.atualizado_em, it.ultima_msg_em, it.ultima_entrada_em, it.status, it.atribuida_a, it.departamento_id, it.etiquetas, it.negocio, it.nao_lidas, it.oculta]) : null;
}
let _pulsoT = null, _verT = null;
function aoPulso() {
  if (!A) return;
  A.pulsoEm = Date.now();                       // CA-126: o diagnóstico diz quando foi o último pulso
  if (A.fila.itens.size) esvaziarFila();
  clearTimeout(_pulsoT);
  _pulsoT = setTimeout(async () => {
    if (!A) return;
    await Promise.all([carregarLista({}), delta()]);
    if (!A || !A.selId) return;
    // a marca é tirada logo depois de a lista chegar do servidor (o recarregarVer mexe na linha da lista; aqui ela é a do servidor)
    const marca = marcaDaAberta();
    const mudou = marca === null || marca !== A.marcaPulso || A.marcaPulsoId !== A.selId;
    A.marcaPulso = marca; A.marcaPulsoId = A.selId;
    if (!mudou && Date.now() - (A.verEm || 0) < VER_INTERVALO_MS) return;
    clearTimeout(_verT);
    _verT = setTimeout(() => recarregarVer(), 800);
  }, 250);
}

let _lida = { id: null, em: 0 };
/** Marca a conversa aberta como lida. Sem nada novo (nao_lidas 0 na conversa e na lista) não chama nada — nem o recibo ao cliente (D9).
    forcar (D3): o delta acabou de trazer mensagem do cliente com a conversa à vista; os contadores ainda são os antigos. */
async function marcarLida({ forcar = false } = {}) {
  if (!A || !A.selId || !A.ver) return;
  const id = A.selId;
  const agora = Date.now();
  if (!forcar && _lida.id === id && agora - _lida.em < 1500) return;
  const conv = A.ver.conversa;
  // plano 1000 · CA-132 (parte da tela do CA-001): quem só lê, ou espia a conversa de um colega, não zera as não lidas de quem atende
  if (!A.L.podeMarcarLida(conv, A.eu, A.podeEscrever)) return;   // plano 1000b · CB-007: a mesma regra do lote e do deslizar
  const itemTinha = A.itens.some(x => x.id === id && x.nao_lidas > 0);
  if (!forcar && !(conv.nao_lidas > 0) && !itemTinha) return;
  _lida = { id, em: agora };
  try {
    await A.api.rpcC("nx_cv_marcar_lida", { p_conversa: id });
    if (!A || A.selId !== id || !A.ver) return;
    A.ver.conversa.nao_lidas = 0;
    const it = A.itens.find(x => x.id === id);
    if (it && it.nao_lidas > 0) {
      it.nao_lidas = 0; A.lista.render();
      if (A.contagens.nao_lidas > 0) { A.contagens.nao_lidas--; A.ctx.badge("conversas", A.contagens.nao_lidas); }
    }
    // confirmação de leitura para o cliente (opcional por empresa; a função confere janela e token) — só quando havia mensagem nova
    if (A.podeEscrever && A.base && A.base.cfg && A.base.cfg.recibo_leitura && A.L.janela(A.ver.conversa).aberta && A.ver.conversa.canal_id)
      A.api.fn("nx-enviar", { acao: "lido", conversa: id }).catch(() => {});
  } catch { /* não bloqueia nada */ }
}

/** Mensagens mais antigas (rolagem para cima). */
async function carregarAntes({ forcar = false } = {}) {
  if (!A || !A.selId || !A.temMaisAntes || A.carregandoAntes) return;
  // plano 1000b · CB-051: depois de uma falha, a rolagem só tenta sozinha de novo em 10 s (antes: um toast a cada 150 ms de rolagem);
  // o topo diz «Não carregou · Tentar de novo» (forcar)
  if (!forcar && A.falhaAntes && A.falhaAntes.id === A.selId && Date.now() - A.falhaAntes.em < 10000) return;
  const primeira = A.msgs.find(m => !(typeof m.id === "string"));
  if (!primeira) return;
  A.carregandoAntes = true;
  A.chat.renderTopo();
  const id = A.selId;
  try {
    const r = await A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_antes_id: primeira.id, p_limite: 50 });
    if (!A || A.selId !== id) return;
    A.msgs = A.L.mesclarDelta(A.msgs, r.itens || []);
    descartarMidiaLocalGravada();
    A.temMaisAntes = !!r.tem_mais;
    A.conversasContato = r.conversas || A.conversasContato;
    A.falhaAntes = null;
    A.chat.renderMensagens({ rolar: "anterior" });
  } catch (e) {
    if (A && A.selId === id) { const repetida = !!(A.falhaAntes && A.falhaAntes.id === id); A.falhaAntes = { id, em: Date.now() }; if (!repetida) A.ui.anunciar(`Mensagens anteriores não carregaram: ${A.ui.mensagemErro(e)}`); }
  } finally {
    if (A) { A.carregandoAntes = false; A.chat.renderTopo(); }
  }
}

/* ============================================================ mídia (URLs assinadas de 1 h) */
let _midiaT = null;
function urlMidia(path) {
  if (!path || !A) return null;
  const c = A.midia.get(path);
  if (c && c.url && Date.now() - c.em < 50 * 60000) return c.url;
  if (c && c.erro && Date.now() - c.em < 2 * 60000) return null;
  A.pedidosMidia.add(path);
  clearTimeout(_midiaT);
  _midiaT = setTimeout(buscarMidias, 60);
  return null;
}
function estadoMidia(path) { if (!A) return "erro"; const c = A.midia.get(path); return c ? (c.url ? "ok" : c.erro ? "erro" : "buscando") : "buscando"; }
async function buscarMidias() {
  if (!A) return;
  const paths = [...A.pedidosMidia].slice(0, 50);
  A.pedidosMidia.clear();
  if (!paths.length) return;
  for (const p of paths) A.midia.set(p, { em: Date.now() });
  try {
    const r = await A.api.fn("nx-midia", { acao: "ver", paths });
    if (!A) return;
    const urls = (r && r.urls) || {};
    for (const p of paths) {
      const u = urls[p];
      A.midia.set(p, /^https:\/\//.test(String(u || "")) ? { url: u, em: Date.now() } : { erro: true, em: Date.now() });
    }
  } catch {
    if (!A) return;
    for (const p of paths) A.midia.set(p, { erro: true, em: Date.now() });
  }
  A.chat.renderMensagens({ rolar: "manter" });
}

/* ============================================================ rascunhos */
/** Guarda o texto do campo como rascunho da conversa a que ele pertence (nunca o de uma nota interna): quem sabe isso é o composer. */
function guardarRascunho() { if (A && A.composer) A.composer.guardar(); }

/** O que a pessoa digitou e não enviou nesta conversa (para o "Rascunho:" da lista): o campo aberto, o da sessão ou o guardado no aparelho. */
function rascunhoDe(id) {
  if (!A) return "";
  // o campo só conta se o texto dele é DESTA conversa e não é nota interna (durante a troca de conversa ele ainda é da anterior)
  if (A.composer) { const t = A.composer.textoDe(id); if (t && t.trim()) return t; }
  const m = A.rascunhos.get(id);
  if (m && m.trim()) return m;
  const r = A.ctx.rascunho;
  if (r && typeof r.texto === "function") { const t = r.texto(`conversa:${id}`); if (t && t.trim()) return t; }
  return "";
}
let _rascT = null;
/** O texto do campo mudou: a linha da lista acompanha (sem refazer a lista a cada tecla). */
function rascunhoMudou() {
  clearTimeout(_rascT);
  _rascT = setTimeout(() => { if (A && A.lista && A.lista.el.isConnected) A.lista.render(); }, 500);
}

/* ============================================================ ações */
function trocarConversa(item) {
  if (!item) return;
  item = comPendencia(item);
  if (A.ver && A.ver.conversa && A.ver.conversa.id === item.id) A.ver.conversa = { ...A.ver.conversa, ...item };
  atualizarItemLista(item);
  A.chat.renderCabecalho();
  A.composer.atualizar();
}

async function executar(promessa, { ok, botao } = {}) {
  try {
    const r = await (botao ? A.ui.carregando(botao, promessa) : promessa);
    if (ok) A.ui.toast(ok, { tipo: "ok" });
    return r;
  } catch (e) {
    tratarErro(e);
    return null;
  }
}

function tratarErro(e) {
  const ui = A.ui;
  // CA-126: os últimos erros (só o código e a hora) entram no «Copiar diagnóstico»
  A.errosRecentes = [...(A.errosRecentes || []), { em: Date.now(), codigo: (e && e.codigo) || "erro" }].slice(-10);
  if (e && e.codigo === "ja_existe_aberta" && e.hint && /^\d+$/.test(String(e.hint))) {
    const outra = Number(e.hint);
    // a aberta pode estar com um colega (invisível para quem pediu — é o caso do nx_cv_nova):
    // só oferece "Abrir" se a pessoa consegue ver; senão explica o que fazer (nunca "não encontrado")
    A.api.rpcC("nx_cv_ver", { p_id: outra }).then(() => {
      if (!A) return;
      ui.confirmar({ titulo: "Já existe um atendimento aberto", texto: "Esse contato já tem um atendimento aberto neste número. Quer abrir esse atendimento?", rotulo: "Abrir" })
        .then(sim => { if (sim && A) abrir(outra); });
    }, err => {
      if (!A) return;
      if (err && err.codigo === "conversa_nao_encontrada") {
        ui.toast("Esse contato já está em atendimento com outra pessoa da equipe neste número. Peça ao supervisor para transferir a conversa para você.", { tipo: "info", ms: 9000 });
      } else ui.toast(ui.mensagemErro(e), { tipo: "erro" });
    });
    return;
  }
  ui.toast(ui.mensagemErro(e), { tipo: "erro" });
}

const acoes = {
  abrir, carregarAntes, carregarLista, mudarLista, repetirBuscaMensagens: buscarMensagens, urlMidia, estadoMidia, abrirDetalhes, nomeContato, tratarErro,
  menuAvisos: ancora => menuAvisos(ancora), lerAvisos: () => lerAvisos(),
  voltar() { A.ctx.navegar("#/conversas"); },
  /** plano 1000b · CB-132: modelos e respostas rápidas frescos — a base com mais de `maxMs` é relida (uma leitura por vez). → Promise | null */
  baseFresca(maxMs = 60000) {
    if (!A || Date.now() - (A.baseEm || 0) <= maxMs) return null;
    if (A.baseVoo) return A.baseVoo;
    const E = A;
    E.baseVoo = carregarBase().catch(() => {}).finally(() => { E.baseVoo = null; });
    return E.baseVoo;
  },
  recarregarVer,
  async assumir(botao) {
    const r = await executar(A.api.rpcC("nx_cv_atribuir", { p_conversa: A.selId, p_conta: A.eu.id }), { botao, ok: "Conversa com você." });
    if (r) { trocarConversa(r); delta(); recarregarVer(); }
  },
  /** horas (CA-227): null = o prazo padrão do canal; 1, até amanhã 8h…; 0 = até alguém devolver (o servidor grava «infinity»). */
  async assumirIA(botao, { horas = null } = {}) {
    if (!A?.selId || A.ver?.conversa?.canal?.provedor !== "codewords") return;
    const r = await executar(A.api.rpcC("nx_cv_ia_pausar", { p_conversa: A.selId, p_horas: horas }), { botao });
    if (r && A) {
      A.iaEstado = r; A.iaEstadoEm = Date.now(); A.chat.renderCabecalho();
      let atribuida = true;
      if (A.eu?.id && A.ver?.conversa?.atribuida_a !== A.eu.id) {
        const dono = await executar(A.api.rpcC("nx_cv_atribuir", { p_conversa: A.selId, p_conta: A.eu.id }));
        if (dono) trocarConversa(dono); else atribuida = false;
      }
      delta(); carregarLista({});
      const prazo = horas === 0 ? "A IA só volta quando alguém devolver." : horas ? `A IA volta em ${horas} ${horas === 1 ? "hora" : "horas"}.` : "A IA volta conforme o prazo configurado.";
      A.ui.toast(atribuida ? `Você assumiu a conversa. ${prazo}` : "A IA foi pausada; não foi possível atribuir a conversa a você.", { tipo: atribuida ? "ok" : "info" });
    }
  },
  async devolverIA(botao) {
    if (!A?.selId || A.ver?.conversa?.canal?.provedor !== "codewords") return;
    const r = await executar(A.api.rpcC("nx_cv_ia_devolver", { p_conversa: A.selId }), { botao });
    if (r && A) {
      A.iaEstado = r; A.iaEstadoEm = Date.now(); A.chat.renderCabecalho();
      A.ui.toast("Atendimento devolvido para a IA.", { tipo: "ok" });
    }
  },
  atualizarIA: () => carregarEstadoIA(),
  transferir: () => transferir(),
  resolver: botao => resolverComDesfazer(botao),
  atenderProximo: botao => atenderProximo(botao),
  focarLista: () => focarListaOuVazio(),
  avancarAoResolver: () => !!(A && A.avancar),
  definirAvancar(sim) {
    A.avancar = !!sim; gravarPreferencia("avancar", sim ? "1" : "0");
    A.ui.toast(sim ? "Ao resolver, a próxima conversa abre sozinha." : "Ao resolver, a conversa continua aberta.", { tipo: "info" });
  },
  abrirAjudaTeclado: () => abrirAjudaTeclado(),
  async status(novo, botao) {
    if (novo === "resolvida") return resolverComDesfazer(botao);
    const textos = { resolvida: "Atendimento resolvido.", aberta: "Atendimento reaberto.", pendente: "Marcado como pendente." };
    // «Reabrir» com o Resolver ainda esperando o Desfazer: o servidor nunca soube do Resolver — basta cancelá-lo (senão ele resolveria de novo ao fechar o aviso)
    const pend = _pendResolver.get(A.selId);
    if (pend && !pend.firmando) {   // com o Resolver já a caminho do servidor (firmando), o Reabrir segue para o nx_cv_status normal
      const id = A.selId;
      pend.cancelado = true; _pendResolver.delete(id); A.resolvendo.delete(id);   // libera o próximo «Resolver» desta conversa
      if (novo === pend.antes.status) {
        trocarConversa({ id, ...pend.antes });
        A.ui.toast(textos[novo], { tipo: "ok" });
        carregarLista({}); recarregarVer();
        return;
      }
    }
    // plano 1000 · CA-230: reaberta na aba Resolvidas — a conversa sai da lista; o aviso diz para onde ela foi e leva até lá
    const daResolvidas = novo === "aberta" && A.aba === "resolvidas";
    const r = await executar(A.api.rpcC("nx_cv_status", { p_conversa: A.selId, p_status: novo }), { botao, ok: daResolvidas ? null : textos[novo] });
    if (r) {
      trocarConversa(r); delta(); recarregarVer(); carregarLista({});
      if (daResolvidas && A) {
        const destino = A.L.abaDe({ ...r, status: r.status || "aberta" }, A.eu && A.eu.id);
        const rot = (A.L.ABAS.find(x => x.id === destino) || {}).rotulo || "Todas abertas";
        const t = A.ui.toast(`Reaberta: agora está em ${rot}.`, { tipo: "ok", ms: 8000 });
        try {
          const b = A.ui.h("button", { type: "button", class: "toast-acao", on: { click: () => { try { t.fechar(); } catch { /* ok */ } if (A) mudarLista({ aba: destino, busca: "" }); } } }, `Ir para ${rot}`);
          if (t && t.el) t.el.insertBefore(b, t.el.querySelector(".toast-x"));
        } catch { /* sem o botão o aviso continua valendo */ }
      }
    }
  },
  async ocultar(sim) {
    const ui = A.ui;
    if (sim) {
      const ok = await ui.confirmar({ titulo: "Ocultar e bloquear este contato?", perigo: true, rotulo: "Ocultar e bloquear",
        // plano 1000 · CA-151: diz ONDE se desfaz (antes só «Dá para desfazer»)
        texto: "O atendimento é resolvido e sai das listas. O que esse contato mandar depois fica guardado na aba Ocultas, sem avisar ninguém. Para desfazer: aba Ocultas (em «Mais situações») → abra a conversa → ⋮ → Desfazer bloqueio." });
      if (!ok || !A) return;
    }
    const r = await executar(A.api.rpcC("nx_cv_ocultar", { p_conversa: A.selId, p_ocultar: !!sim }), { ok: sim ? "Conversa ocultada e contato bloqueado." : "Bloqueio desfeito. O contato volta a aparecer." });
    if (!r || !A) return;
    trocarConversa(r); delta(); recarregarVer(); carregarLista({});
    if (sim) A.ctx.navegar("#/conversas");
  },
  /** D20: um pedido de etiqueta por vez, na ordem; a resposta só vale para a tela se ainda é a última intenção (atual()):
      marcar A e B rápido nunca termina com [A] na tela nem no servidor. */
  etiquetas(ids, { atual = () => true } = {}) {
    const E = A, conv = A.selId;
    E.etiquetasEmVoo++;
    const vez = E.etqFila.then(async () => {
      try {
        const r = await E.api.rpcC("nx_cv_etiquetas", { p_conversa: conv, p_etiquetas: ids });
        if (A === E && r && atual() && A.selId === conv) trocarConversa(r);
        return r;
      } catch (e) { if (A === E && atual()) tratarErro(e); return null; }
      finally { E.etiquetasEmVoo = Math.max(0, E.etiquetasEmVoo - 1); }
    });
    E.etqFila = vez.catch(() => null);
    return vez;
  },
  async criarEtiqueta(nome) {
    // plano 1000 · CA-010: «urgente» com «Urgente» já existente (sem caixa nem acento) usa a que existe — nada de três etiquetas iguais
    const igual = A.L.etiquetaIgual(A.base.etiquetas || [], nome);
    if (igual) { A.ui.toast(`Já existia: usei a etiqueta «${igual.nome}».`, { tipo: "info" }); return igual; }
    const cores = A.ctx.paleta || [];
    const cor = cores.length ? cores[(A.base.etiquetas || []).length % cores.length] : null;
    const e = await A.api.rpcC("nx_etiqueta_salvar", { p_etiqueta: { nome, cor } });
    if (e && e.id) A.base.etiquetas = [...(A.base.etiquetas || []).filter(x => x.id !== e.id), e];
    return e;
  },
  async vincular(negocioId) {
    const r = await executar(A.api.rpcC("nx_cv_vincular_negocio", { p_conversa: A.selId, p_negocio: negocioId }), { ok: negocioId ? "Negócio ligado a este atendimento." : "Negócio desligado." });
    if (r) { trocarConversa(r); recarregarVer(); }
  },
  novaConversa: (o) => novaConversa(o),
  /* plano 1000 — lote conv-1 */
  irParaMensagem: id => irParaMensagem(Number(id)),                         // CA-009: citação antiga carrega as páginas anteriores
  devolverFila: conv => devolverFila(conv),                                  // CA-008: com Desfazer
  offline: () => estaOffline(),                                              // CA-106/CA-107
  enterQuebra: () => lerPreferencia("enter", "envia") === "quebra",         // CA-068
  resolverLote: ids => resolverLote(ids),                                    // CA-046
  lidaLote: ids => lidaLote(ids),
  /* plano 1000 — lote conv-2 */
  transferirLote: ids => transferirLote(ids),                                // CA-046 (conv-2): transferir e etiquetar as marcadas
  etiquetarLote: ids => etiquetarLote(ids),
  lidaComDesfazer: id => lidaComDesfazer(id),                                // CA-109: deslizar a linha
  podeMarcarLida: c => !!A && A.L.podeMarcarLida(c, A.eu, A.podeEscrever),   // plano 1000b · CB-007: o gesto só aparece quando vale
  exportar: () => exportarConversa(),                                        // CA-232
  mostrarSistema: () => lerPreferencia("sistema", "1") !== "0",              // CA-231
  definirMostrarSistema: sim => gravarPreferencia("sistema", sim ? "1" : "0"),
  enviar: (...a) => enviar(...a),
  reenviarLocal: (m) => reenviarLocal(m),
  podeCancelarEnvio: m => !!(A && m && A.envios.has(m.id)),
  cancelarEnvio(m) { const c = m && A.envios.get(m.id); if (c) c(); },
  descartarLocal(m) {
    if (m && m.ref) { filaRemover(m.ref); }
    A.msgs = A.msgs.filter(x => x.id !== m.id); A.chat.renderMensagens({ rolar: "manter" });
  },
  /** Nota interna (D2): com p_req da intenção (S-B13) — a repetição pela rede não grava outra; banco sem a função nova
      (404 PGRST202) cai na de sempre, uma vez por montagem. */
  async nota(texto, { req = null, conversa = A.selId } = {}) {
    const E = A, p = { p_conversa: conversa, p_texto: texto };
    let r = null;
    if (req && !E.notaSemReq) {
      try { r = await E.api.rpcC("nx_cv_nota", { ...p, p_req: req }); }
      catch (e) { if (!E.L.rpcAusente(e)) throw e; E.notaSemReq = true; }
    }
    if (!r) r = await E.api.rpcC("nx_cv_nota", p);
    if (A !== E || A.selId !== conversa) return r;
    A.msgs = A.L.mesclarDelta(A.msgs, [r]);
    A.ultimoId = A.L.ultimoId(A.msgs, A.ultimoId);
    A.chat.renderMensagens({ rolar: "fim" });
    return r;
  },
  /** D11: atalho «Agenda» da lateral — marcar consulta (agenda.js) já com o negócio da conversa; sem a agenda, abre a tela. */
  async agendar(negocio = null) {
    const E = A;
    try {
      const m = await import(`./agenda.js?v=${encodeURIComponent(E.ctx.versao || "dev")}`);
      if (!m || typeof m.marcarConsulta !== "function") throw new Error("agenda_ausente");
      // plano 1000b · CB-123: a pessoa já está na conversa — «Avisar paciente» do aviso põe a confirmação no campo (sem enviar)
      const conversa = E.selId;
      const avisar = typeof m.textoConfirmacao === "function" ? (info, tipo) => {
        if (A !== E || E.selId !== conversa || tipo !== "confirmacao") return;
        const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const nome = (E.ver && E.ver.contato && E.ver.contato.nome) || (info && info.nome) || "";
        const texto = m.textoConfirmacao({ ...(info || {}), nome }, hoje);
        if (!texto || !E.composer || typeof E.composer.devolverTexto !== "function") return;
        E.composer.devolverTexto(texto);
        E.ui.toast("Confirmação no campo da conversa. Revise e envie.", { tipo: "info" });
      } : null;
      // plano 1000b · CB-124: sem negócio único, a janela da agenda recebe o nome do contato para já começar a busca com ele
      // (a agenda.js usa `busca` para abrir a janela já com a busca feita — plano 1000b · CB-124)
      const busca = !negocio ? (E.ver && E.ver.contato && E.ver.contato.nome) || "" : "";
      await m.marcarConsulta(E.ctx, { negocio: negocio || null, avisar, aoMudar: () => { if (A === E) recarregarVer(); }, ...(busca ? { busca } : {}) });
      if (A === E) recarregarVer();
    } catch (e) {
      console.error("conversas: marcar consulta", e);
      // plano 1000b · CB-092: a pessoa sabe por que foi parar na Agenda (antes navegava calada)
      if (A === E) { E.ui.toast("Não deu para marcar por aqui; abrindo a Agenda.", { tipo: "info" }); E.ctx.navegar("#/agenda"); }
    }
  },
  /** D18: números de WhatsApp desconectados agora (shell → ctx.canais; sem ele, nx_cv_base.canais[].estado). */
  canaisCaidos: () => canaisCaidos(),
  canalCaido: id => (id ? canaisCaidos().find(c => String(c.id) === String(id)) || null : null),
  verNumero() { if (A.ctx.canais && typeof A.ctx.canais.verNumero === "function") A.ctx.canais.verNumero(); else A.ctx.navegar("#/config/numeros"); },
  /** D10: «Enviar agora» de uma bolha da fila: {motivo, espera} — motivo vazio = pode. */
  estadoEnviarAgora(m) {
    const it = m && m.ref && A ? A.fila.itens.get(m.ref) : null;
    const espera = it ? A.L.esperaReenvioFila(it) : 0;
    return { motivo: A ? A.L.motivoEnviarAgora({ offline: estaOffline(), espera }) : "", espera };
  },
  async sugerirIA() {
    const r = await A.api.fn("nx-ia", { acao: "sugerir", conversa: A.selId });
    // a cota da tela acompanha o uso (o servidor é quem manda; isto só evita chamadas inúteis)
    const cota = A && A.base && A.base.ia && A.base.ia.cota;
    if (cota && r && r.texto) cota.usadas = (Number(cota.usadas) || 0) + 1;
    return r;
  },
  respostaUsada(id) { if (A.podeEscrever) A.api.rpcC("nx_resposta_usada", { p_id: id }).catch(() => {}); },
  pode: min => A.L.pode(A.ctx.papel, min),
  guardarRascunho, rascunhoDe, rascunhoMudou,
  /* plano 50 — preferências visuais da central (por navegador) e ações das bolhas */
  velocidadeAudio: () => (A ? A.velocidadeAudio : 1),
  definirVelocidadeAudio(v) { if (!A) return 1; A.velocidadeAudio = A.L.velocidadeValida(v); gravarPreferencia("audio-vel", String(A.velocidadeAudio)); return A.velocidadeAudio; },
  densidade: () => (A ? A.densidade : "confortavel"),
  definirDensidade(d) {
    if (!A) return;
    A.densidade = d === "compacta" ? "compacta" : "confortavel";
    gravarPreferencia("densidade", A.densidade);
    if (A.raiz) A.raiz.dataset.densidade = A.densidade;
  },
  copiarTexto(m) { if (m && m.corpo) A.ui.copiar(String(m.corpo), { aviso: "Mensagem copiada." }); },
  cancelarFila: m => cancelarFila(m), enviarAgora: m => enviarAgora(m),
  filaResumo: id => filaResumo(id),
  reenviarGravada: m => reenviarGravada(m), foiReenviada: m => !!(A && m && A.reenviadas.has(m.id)),
};

/** Sem internet agora (o shell sabe melhor; sem ele, o navigator). */
function estaOffline() {
  if (A && A.ctx.rede && typeof A.ctx.rede.estado === "string") return A.ctx.rede.estado === "offline";
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** D18: números caídos — o que o shell conhece (ctx.canais) ou, sem ele, nx_cv_base.canais[].estado === "desconectado". */
function canaisCaidos() {
  if (!A) return [];
  const base = (A.base && A.base.canais) || [];
  // o nome que a tela conhece (o do shell pode vir do título da notificação: «Recepção: número desconectado»)
  if (Array.isArray(A.canaisCaidosShell)) return A.canaisCaidosShell.map(c => { const k = base.find(x => c && String(x.id) === String(c.id)); return k && k.nome ? { ...c, nome: k.nome } : c; });
  return base.filter(c => c && c.estado === "desconectado")
    .map(c => ({ id: c.id, nome: c.nome || "WhatsApp", desde: c.estado_desde || c.desde || null }));
}
/** plano 1000b · CB-044: o estado do número na «Nova conversa» — o da base (CB-045) ou «desconectado» quando o shell sabe que caiu. */
function estadoNovaConversa(c) {
  const est = A.L.rotuloEstadoCanal(c);
  if (est) return est;
  return canaisCaidos().some(k => k && String(k.id) === String(c.id)) ? "desconectado" : "";
}

/**
 * D12: Transferir com Desfazer. O modal escolhe pessoa/departamento; a tela muda na hora e o nx_cv_atribuir só vai quando o aviso
 * «Transferida para Ana · Mariana» fecha (como o Resolver): o Desfazer sempre funciona — mesmo quando, depois de transferida, a conversa
 * sairia do alcance de quem transferiu. Tirar a conversa das MINHAS pede confirmação no próprio modal (o aviso diz que ela sai da aba).
 */
async function transferir() {
  const ui = A.ui;
  const conv = A.ver && A.ver.conversa;
  if (!conv) return;
  const pessoas = (A.base.usuarios || []).filter(u => u.papel !== "leitura" && u.aprovado !== false);
  const deps = A.base.departamentos || [];
  const eu = A.eu && A.eu.id;
  const conta = conv.atribuida_a || "", dep = conv.departamento_id || "";
  const sPessoa = ui.h("select", { class: "sel", id: "cv-tr-pessoa", "aria-label": "Pessoa" },
    ui.h("option", { value: "" }, "Sem responsável (fila do departamento)"),
    pessoas.map(u => ui.h("option", { value: u.id, selected: u.id === conta }, u.id === eu ? `${u.nome} (você)` : u.nome)));
  const sDep = ui.h("select", { class: "sel", id: "cv-tr-dep", "aria-label": "Departamento" },
    deps.map(d => ui.h("option", { value: d.id, selected: d.id === dep }, d.nome)));
  const avisoMinhas = ui.h("p", { class: "aviso aviso-aten cv-tr-aviso", role: "status", hidden: true }, ui.icone("info"),
    ui.h("span", null, "A conversa sai da sua aba Minhas. Por 7 segundos dá para desfazer no aviso."));
  // plano 1000 · CA-026: a pessoa escolhida não atende o departamento escolhido — marca na lista e avisa antes de confirmar
  const avisoDep = ui.h("p", { class: "aviso aviso-aten cv-tr-dep-aviso", role: "status", hidden: true }, ui.icone("alerta"), ui.h("span", null, ""));
  const nomeOpcao = u => `${u.id === eu ? `${u.nome} (você)` : u.nome}`;
  const conferir = () => {
    avisoMinhas.hidden = !(conta && conta === eu && (sPessoa.value || "") !== eu);
    const depId = deps.length ? (sDep.value || null) : null;
    for (const op of sPessoa.querySelectorAll("option")) {
      const u = pessoas.find(x => String(x.id) === String(op.value));
      if (u) op.textContent = depId && !A.L.atendeDepartamento(u, depId) ? `${nomeOpcao(u)} (não atende este departamento)` : nomeOpcao(u);
    }
    const u = pessoas.find(x => String(x.id) === String(sPessoa.value));
    const fora = !!(u && depId && !A.L.atendeDepartamento(u, depId));
    avisoDep.hidden = !fora;
    if (fora) avisoDep.lastChild.textContent = `${u.nome} não atende ${deps.find(d => d.id === depId)?.nome || "este departamento"}: a conversa vai para ${u.nome} mesmo assim.`;
  };
  sPessoa.addEventListener("change", conferir);
  sDep.addEventListener("change", conferir);
  // CA-055: equipe grande (mais de 10 pessoas) ganha busca acima da lista
  const buscaPessoa = pessoas.length > 10 ? ui.h("input", { type: "search", id: "cv-tr-busca", class: "cv-tr-busca", placeholder: "Buscar pessoa", "aria-label": "Buscar pessoa", "aria-controls": "cv-tr-pessoa", autocomplete: "off" }) : null;
  if (buscaPessoa) buscaPessoa.addEventListener("input", () => {
    const q = A.L.semAcento(buscaPessoa.value.trim());
    for (const op of sPessoa.querySelectorAll("option")) { if (!op.value) continue; const ok = !q || A.L.semAcento(op.textContent).includes(q); op.hidden = !ok; op.disabled = !ok && op.value !== sPessoa.value; }
  });
  // CA-054: recado opcional para quem recebe (vira nota interna «Transferência: …»)
  const recado = ui.h("textarea", { id: "cv-tr-recado", rows: 2, maxlength: 500, placeholder: "Ex.: quer remarcar para sexta de manhã" });
  conferir();
  const corpo = ui.h("div", { class: "pilha" },
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-tr-pessoa" }, "Pessoa"), buscaPessoa, sPessoa),
    deps.length ? ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-tr-dep" }, "Departamento"), sDep) : null,
    avisoMinhas, avisoDep,
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-tr-recado" }, "Recado para quem recebe (opcional)"), recado),
    ui.h("p", { class: "sub" }, "Quem recebe é avisado no sino. Fica registrado no histórico da conversa."));
  const escolha = await ui.modal({
    titulo: "Transferir conversa", corpo, largura: "p",
    acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Transferir", tipo: "primario", fn: () => ({
      conta: sPessoa.value || null,
      dep: deps.length && sDep.value && sDep.value !== conv.departamento_id ? sDep.value : null,
      recado: String(recado.value || "").trim(),
    }) }],
  });
  if (!escolha || !A || !A.ver || A.ver.conversa.id !== conv.id) return;
  if ((escolha.conta || null) === (conv.atribuida_a || null) && !escolha.dep) {
    // plano 1000b · CB-047: sem mudança mas com recado — o recado não se perde: vira só a nota interna
    if (escolha.recado) {
      try { await acoes.nota(`Recado: ${escolha.recado}`, { conversa: conv.id }); ui.toast("A conversa continua com a mesma pessoa. O recado ficou como nota interna.", { tipo: "ok" }); }
      catch (e) { tratarErro(e); }
      return;
    }
    ui.toast("Nada mudou: a conversa já está com quem você escolheu.", { tipo: "info" }); return;
  }
  await transferirComDesfazer(conv, escolha);
}
/** plano 1000 · CA-008: «Devolver para a fila» pelo mesmo caminho do Transferir (Desfazer de 7 s; nada vai ao servidor antes). */
async function devolverFila(conv) {
  if (!A || !conv) return;
  const nome = nomeContato((A.ver && A.ver.contato) || conv.contato) || "Conversa";
  await transferirComDesfazer(conv, { conta: null, dep: null, texto: `Devolvida para a fila · ${nome}` });
}

/** CA-046: resolver várias de uma vez — a tela resolve na hora e UM «Desfazer» devolve todas; o servidor só ouve quando o aviso fecha
    (um nx_cv_status por conversa, em série). A conversa aberta entre elas segue o caminho de sempre. */
async function resolverLote(ids) {
  if (!A || !ids || !ids.length) return;
  const lista = ids.map(id => A.itens.find(x => x.id === id)).filter(c => c && c.status !== "resolvida" && !_pendResolver.has(c.id));
  if (!lista.length) { aviso("Nada para resolver: as escolhidas já estão resolvidas."); return; }
  const api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  const naMesmaEmpresa = () => !!A && (A.ctx.cliente && A.ctx.cliente.id) === cliente;
  // (revisão 13/10: guarda a última mensagem do cliente vista no clique — quem escrever durante o «Desfazer» não é resolvido por cima,
  // como no Resolver de uma conversa só; vale também para o deslizar da lista, que passa por aqui)
  const pends = lista.map(c => [c.id, { antes: { status: c.status, aguardando: !!c.aguardando, nao_lidas: Number(c.nao_lidas) || 0 }, cancelado: false,
    entradaAntes: Date.parse(c.ultima_entrada_em || "") || 0 }]);
  const voltar = () => {
    for (const [id, p] of pends) { if (p.cancelado) continue; p.cancelado = true; if (_pendResolver.get(id) === p) _pendResolver.delete(id); }
    if (!naMesmaEmpresa()) return;
    for (const [id, p] of pends) { if (A.selId === id) trocarConversa({ id, ...p.antes }); else atualizarItemLista({ id, ...p.antes }); }
    carregarLista({});
  };
  await A.ui.acaoComDesfazer({
    texto: `${lista.length} ${lista.length === 1 ? "conversa resolvida" : "conversas resolvidas"}`,
    aplicar: () => {
      for (const [id, p] of pends) { _pendResolver.set(id, p); if (A.selId === id) trocarConversa({ id, status: "resolvida" }); else atualizarItemLista({ id, status: "resolvida" }); }
      A.itens = itensComPendencia(A.itens);
      A.lista.render();
    },
    firmar: async ({ saindo = false } = {}) => {
      let erro = null;
      const escreveram = [];
      for (const [id, p] of pends) {
        if (p.cancelado) continue;
        if (!saindo) {
          let lido = null;
          try { lido = await api.rpc("nx_cv_ver", { p_cliente: cliente, p_id: id }); } catch { /* sem a leitura, o Resolver vale */ }
          if (p.cancelado) continue;
          const c = lido && lido.conversa;
          if (c && (Date.parse(c.ultima_entrada_em || "") || 0) > p.entradaAntes) {
            p.cancelado = true;
            if (_pendResolver.get(id) === p) _pendResolver.delete(id);
            escreveram.push(nomeContato(c.contato) || "Uma conversa");
            if (naMesmaEmpresa()) { if (A.selId === id) trocarConversa(c); else atualizarItemLista(c); }
            continue;
          }
        }
        p.firmando = true;
        try { await api.rpc("nx_cv_status", { p_cliente: cliente, p_conversa: id, p_status: "resolvida" }, saindo ? { keepalive: true } : {}); }
        catch (e) { erro = erro || e; p.firmando = false; if (_pendResolver.get(id) === p) _pendResolver.delete(id); p.cancelado = true; if (naMesmaEmpresa()) atualizarItemLista({ id, ...p.antes }); continue; }
        if (_pendResolver.get(id) === p) _pendResolver.delete(id);
        p.cancelado = true;
      }
      if (escreveram.length && A) A.ui.toast(escreveram.length === 1 ? `${escreveram[0]} escreveu de novo: a conversa continua aberta.`
        : `${escreveram.length} pessoas escreveram de novo: essas conversas continuam abertas.`, { tipo: "info" });
      if (naMesmaEmpresa()) { carregarLista({}); if (A.selId && pends.some(([id]) => id === A.selId)) recarregarVer(); }
      if (erro) throw erro;
    },
    reverter: voltar,
  });
}

/** CA-046: marcar várias como lidas (nx_cv_marcar_lida, em série; sem recibo ao cliente — ninguém leu de verdade a conversa). */
async function lidaLote(ids) {
  if (!A || !ids || !ids.length) return { restantes: [] };
  // revisão 1000b · CB-093: o cliente (empresa) é o do clique — o firmar vai por api.rpc com p_cliente, como o lidaComDesfazer
  const E = A, api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  // plano 1000b · CB-007: a mesma regra do marcarLida — conversa de colega (ou papel leitura) fica como estava, e a pessoa fica sabendo
  const doItem = id => A.itens.find(x => x.id === id) || { id };
  const meus = ids.filter(id => A.L.podeMarcarLida(doItem(id), A.eu, A.podeEscrever));
  const deColegas = ids.length - meus.length;
  if (deColegas) A.ui.toast(deColegas === 1 ? "1 conversa de colega ficou como estava." : `${deColegas} conversas de colegas ficaram como estavam.`, { tipo: "info" });
  if (!meus.length) return { restantes: [] };
  // plano 1000b · CB-093: com Desfazer, como o resolverLote — a tela zera na hora; o servidor só ouve quando o aviso fecha
  const antes = new Map(meus.map(id => [id, Number(doItem(id).nao_lidas) || 0]));
  let restantes = [];
  // revisão 1000b · CB-093: durante os 7 s do «Desfazer» um pulso/carregarLista trazia as não lidas de volta (o servidor ainda não
  // ouviu) — como o _pendResolver, o _pendLida segura «0 não lidas» até firmar ou desfazer
  const marca = {};
  const soltar = id => { if (_pendLida.get(id) === marca) _pendLida.delete(id); };
  await A.ui.acaoComDesfazer({
    texto: `${meus.length} ${meus.length === 1 ? "conversa marcada" : "conversas marcadas"} como lida${meus.length === 1 ? "" : "s"}`,
    aplicar: () => { for (const id of meus) { _pendLida.set(id, marca); atualizarItemLista({ id, nao_lidas: 0 }); } },
    firmar: async ({ saindo = false } = {}) => {
      // plano 1000b · CB-018: em série; se uma falha, as que faltam voltam ao número de antes e a seleção as recebe de volta
      for (let i = 0; i < meus.length; i++) {
        try { await api.rpc("nx_cv_marcar_lida", { p_cliente: cliente, p_conversa: meus[i] }, saindo ? { keepalive: true } : {}); soltar(meus[i]); }
        catch (e) {
          restantes = meus.slice(i);
          for (const id of restantes) soltar(id);
          if (A === E) {
            for (const id of restantes) atualizarItemLista({ id, nao_lidas: antes.get(id) });
            A.ui.toast(`${restantes.length} ${restantes.length === 1 ? "conversa ficou" : "conversas ficaram"} sem marcar: ${A.ui.mensagemErro(e)}. Continuam selecionadas.`, { tipo: "erro" });
          }
          break;
        }
      }
      for (const id of meus) soltar(id);
      if (A === E) carregarLista({});
    },
    reverter: () => { for (const id of meus) soltar(id); if (A === E) { for (const [id, n] of antes) atualizarItemLista({ id, nao_lidas: n }); carregarLista({}); } },
  });
  return { restantes };
}

/** plano 1000 · CA-046 (conv-2): transferir as conversas marcadas de uma vez — escolhe pessoa/departamento, a tela muda na hora e UM
    «Desfazer» devolve todas; o servidor só ouve (um nx_cv_atribuir por conversa, em série) quando o aviso fecha. → true se confirmou. */
async function transferirLote(ids) {
  if (!A || !ids || !ids.length) return false;
  const ui = A.ui;
  const lista = ids.map(id => A.itens.find(x => x.id === id)).filter(Boolean);
  if (!lista.length) return false;
  const pessoas = (A.base.usuarios || []).filter(u => u.papel !== "leitura" && u.aprovado !== false);
  const deps = A.base.departamentos || [];
  const eu = A.eu && A.eu.id;
  const sPessoa = ui.h("select", { class: "sel", id: "cv-trl-pessoa" }, ui.h("option", { value: "" }, "Sem responsável (fila do departamento)"),
    pessoas.map(u => ui.h("option", { value: u.id }, u.id === eu ? `${u.nome} (você)` : u.nome)));
  const sDep = ui.h("select", { class: "sel", id: "cv-trl-dep" }, ui.h("option", { value: "" }, "Manter o departamento de cada uma"), deps.map(d => ui.h("option", { value: d.id }, d.nome)));
  // plano 1000b · CB-048: os avisos do transferir único — quem não atende o departamento escolhido (CA-026), busca com mais de 10
  // pessoas (CA-055) e o recado opcional (vira nota «Transferência: …» em cada conversa, antes do nx_cv_atribuir, como no CA-054)
  const nomeOpcao = u => (u.id === eu ? `${u.nome} (você)` : u.nome);
  const avisoDep = ui.h("p", { class: "aviso aviso-aten cv-tr-dep-aviso", role: "status", hidden: true }, ui.icone("alerta"), ui.h("span", null, ""));
  const conferir = () => {
    const depId = deps.length ? (sDep.value || null) : null;
    for (const op of sPessoa.querySelectorAll("option")) {
      const u = pessoas.find(x => String(x.id) === String(op.value));
      if (u) op.textContent = depId && !A.L.atendeDepartamento(u, depId) ? `${nomeOpcao(u)} (não atende este departamento)` : nomeOpcao(u);
    }
    const u = pessoas.find(x => String(x.id) === String(sPessoa.value));
    const fora = !!(u && depId && !A.L.atendeDepartamento(u, depId));
    avisoDep.hidden = !fora;
    if (fora) avisoDep.lastChild.textContent = `${u.nome} não atende ${deps.find(d => d.id === depId)?.nome || "este departamento"}: as conversas vão para ${u.nome} mesmo assim.`;
  };
  sPessoa.addEventListener("change", conferir);
  sDep.addEventListener("change", conferir);
  const buscaPessoa = pessoas.length > 10 ? ui.h("input", { type: "search", id: "cv-trl-busca", class: "cv-tr-busca", placeholder: "Buscar pessoa", "aria-label": "Buscar pessoa", "aria-controls": "cv-trl-pessoa", autocomplete: "off" }) : null;
  if (buscaPessoa) buscaPessoa.addEventListener("input", () => {
    const q = A.L.semAcento(buscaPessoa.value.trim());
    for (const op of sPessoa.querySelectorAll("option")) { if (!op.value) continue; const ok = !q || A.L.semAcento(op.textContent).includes(q); op.hidden = !ok; op.disabled = !ok && op.value !== sPessoa.value; }
  });
  const recado = ui.h("textarea", { id: "cv-trl-recado", rows: 2, maxlength: 500, placeholder: "Ex.: clientes do anúncio de implante" });
  conferir();
  const corpo = ui.h("div", { class: "pilha" },
    ui.h("p", { class: "sub" }, `${lista.length} ${lista.length === 1 ? "conversa marcada" : "conversas marcadas"}. Por 7 segundos dá para desfazer no aviso.`),
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-trl-pessoa" }, "Pessoa"), buscaPessoa, sPessoa),
    deps.length ? ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-trl-dep" }, "Departamento"), sDep) : null,
    avisoDep,
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-trl-recado" }, "Recado para quem recebe (opcional)"), recado));
  const escolha = await ui.modal({ titulo: `Transferir ${lista.length} ${lista.length === 1 ? "conversa" : "conversas"}`, corpo, largura: "p",
    acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Transferir", tipo: "primario", fn: () => ({ conta: sPessoa.value || null, dep: deps.length && sDep.value ? sDep.value : null, recado: String(recado.value || "").trim() }) }] });
  if (!escolha || !A) return false;
  const u = escolha.conta ? pessoas.find(x => x.id === escolha.conta) : null;
  const d = escolha.dep ? deps.find(x => x.id === escolha.dep) : null;
  const api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  const naMesmaEmpresa = () => !!A && (A.ctx.cliente && A.ctx.cliente.id) === cliente;
  const pends = lista.map(c => [c.id, { antes: { atribuida_a: c.atribuida_a || null, atribuida_nome: c.atribuida_nome || null, departamento_id: c.departamento_id || null },
    depois: { atribuida_a: escolha.conta, atribuida_nome: u ? u.nome : null, ...(d ? { departamento_id: d.id } : {}) }, cancelado: false }]);
  const voltar = () => {
    for (const [id, p] of pends) { if (p.cancelado) continue; p.cancelado = true; if (_pendTransferir.get(id) === p) _pendTransferir.delete(id); }
    if (!naMesmaEmpresa()) return;
    for (const [id, p] of pends) { if (A.selId === id) trocarConversa({ id, ...p.antes }); else atualizarItemLista({ id, ...p.antes }); }
    carregarLista({});
  };
  const para = u ? (u.id === eu ? "você" : u.nome) : d ? `a fila de ${d.nome}` : "a fila";
  // sem await: o aviso com Desfazer dura 7 s e a lista sai do modo seleção já (o resultado chega pelo próprio aviso)
  Promise.resolve(ui.acaoComDesfazer({
    texto: `${lista.length} ${lista.length === 1 ? "conversa transferida" : "conversas transferidas"} para ${para}`,
    aplicar: () => {
      for (const [id, p] of pends) { _pendTransferir.set(id, p); if (A.selId === id) trocarConversa({ id, ...p.depois }); else atualizarItemLista({ id, ...p.depois }); }
      A.itens = itensComPendencia(A.itens);
      A.lista.render();
    },
    firmar: async ({ saindo = false } = {}) => {
      let erro = null, recadoFalhou = 0;
      for (const [id, p] of pends) {
        if (p.cancelado) continue;
        p.firmando = true;
        if (escolha.recado) {   // plano 1000b · CB-048: o recado antes da transferência (depois dela quem transferiu pode não enxergar mais a conversa)
          try { await api.rpc("nx_cv_nota", { p_cliente: cliente, p_conversa: id, p_texto: `Transferência: ${escolha.recado}` }, saindo ? { keepalive: true } : {}); }
          catch { recadoFalhou++; /* o recado é opcional: a transferência segue (aviso único no fim) */ }
        }
        try { await api.rpc("nx_cv_atribuir", { p_cliente: cliente, p_conversa: id, p_conta: escolha.conta, p_departamento: escolha.dep }, saindo ? { keepalive: true } : {}); }
        catch (e) { erro = erro || e; if (naMesmaEmpresa()) atualizarItemLista({ id, ...p.antes }); }
        if (_pendTransferir.get(id) === p) _pendTransferir.delete(id);
        p.cancelado = true;
      }
      if (recadoFalhou && naMesmaEmpresa()) A.ui.toast(`O recado não foi gravado em ${recadoFalhou} ${recadoFalhou === 1 ? "conversa" : "conversas"}; a transferência seguiu.`, { tipo: "erro" });
      if (naMesmaEmpresa()) { carregarLista({}); if (A.selId && pends.some(([id]) => id === A.selId)) recarregarVer(); }
      if (erro) throw erro;
    },
    reverter: voltar,
  })).then(r => { if (r && r.estado === "falhou" && r.erro && A) tratarErro(r.erro); }, e => { if (A) tratarErro(e); });
  return true;
}

/** CA-046 (conv-2): acrescentar etiquetas às marcadas (cada uma mantém as que já tinha) — um nx_cv_etiquetas por conversa. → true se confirmou. */
/** plano 1000b · CB-094: «3 etiquetadas · 2 já tinham» (sem mudança não é «etiquetada»). */
export function textoEtiquetadas(ok, jaTinham = 0) {
  const a = ok ? `${ok} ${ok === 1 ? "conversa etiquetada" : "conversas etiquetadas"}` : "Nenhuma conversa mudou";
  return jaTinham ? `${a} · ${jaTinham} já ${jaTinham === 1 ? "tinha" : "tinham"} as etiquetas.` : `${a}.`;
}
async function etiquetarLote(ids) {
  if (!A || !ids || !ids.length) return false;
  const ui = A.ui;
  const etqs = A.base.etiquetas || [];
  if (!etqs.length) { ui.toast("Ainda não há etiquetas. Crie a primeira dentro de uma conversa (⋮ → Etiquetas…).", { tipo: "info" }); return false; }
  const caixas = etqs.map(e => ({ e, inp: ui.h("input", { type: "checkbox", id: `cv-etl-${e.id}`, value: e.id }) }));
  const corpo = ui.h("div", { class: "pilha" },
    ui.h("p", { class: "sub" }, `Marque as etiquetas para acrescentar a ${ids.length} ${ids.length === 1 ? "conversa" : "conversas"} (as que elas já têm continuam).`),
    ui.h("div", { class: "multi-opcoes" }, caixas.map(({ e, inp }) => ui.h("label", { class: "chip-check", for: `cv-etl-${e.id}` }, inp, ui.etiqueta(e)))));
  const escolhidas = await ui.modal({ titulo: "Etiquetar as conversas marcadas", corpo, largura: "p",
    acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Etiquetar", tipo: "primario", fn: api => {
      const v = caixas.filter(x => x.inp.checked).map(x => x.e.id);
      if (!v.length) { api.erro("Marque pelo menos uma etiqueta."); return false; }
      return v;
    } }] });
  if (!escolhidas || !A) return false;
  const E = A;
  let ok = 0, jaTinham = 0;   // plano 1000b · CB-094: as que já tinham as etiquetas não contam como «etiquetadas»
  for (const id of ids) {
    const it = E.itens.find(x => x.id === id);
    const atuais = (it && it.etiquetas) || [];
    const novas = [...new Set([...atuais, ...escolhidas])];
    if (novas.length === atuais.length) { jaTinham++; continue; }
    try {
      const r = await E.api.rpcC("nx_cv_etiquetas", { p_conversa: id, p_etiquetas: novas });
      ok++;
      if (A === E) { if (A.selId === id && r) trocarConversa(r); else atualizarItemLista(r && r.id ? r : { id, etiquetas: novas }); }
    } catch (e) { if (A === E) tratarErro(e); break; }
  }
  if (A !== E) return true;
  carregarLista({});
  ui.toast(textoEtiquetadas(ok, jaTinham), { tipo: "ok" });
  return true;
}

/** CA-109: marcar como lida pelo gesto, com Desfazer — a tela zera o contador na hora e o nx_cv_marcar_lida só vai quando o aviso fecha
    (sem recibo ao cliente: ninguém leu a conversa de verdade). */
async function lidaComDesfazer(id) {
  if (!A) return;
  const it = A.itens.find(x => x.id === id);
  if (!it || !(Number(it.nao_lidas) > 0)) return;
  // plano 1000b · CB-007: a conversa de um colega (ou o papel leitura) não é zerada pelo gesto
  if (!A.L.podeMarcarLida(it, A.eu, A.podeEscrever)) { A.ui.toast("Essa conversa é de um colega: ficou como estava.", { tipo: "info" }); return; }
  const antes = Number(it.nao_lidas) || 0, E = A, api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  await A.ui.acaoComDesfazer({
    texto: `Marcada como lida · ${nomeContato(it.contato) || "Conversa"}`,
    aplicar: () => { atualizarItemLista({ id, nao_lidas: 0 }); },
    firmar: async ({ saindo = false } = {}) => {
      await api.rpc("nx_cv_marcar_lida", { p_cliente: cliente, p_conversa: id }, saindo ? { keepalive: true } : {});
      if (A === E) carregarLista({});
    },
    reverter: () => { if (A === E) { atualizarItemLista({ id, nao_lidas: antes }); carregarLista({}); } },
  });
}

/** CA-232: «Exportar conversa (.txt)» — carrega as páginas anteriores (até 40, ~2.000 mensagens) e baixa «data hora · quem: texto», sem notas internas. */
const EXPORTAR_PAGINAS = 40;
async function exportarConversa() {
  if (!A || !A.ver || !A.selId) return;
  const E = A, id = A.selId;
  // plano 1000b · CB-130: o .txt tem dados do paciente e fica no computador (recepção compartilhada) — confirma antes de baixar
  const seguir = await A.ui.confirmar({ titulo: "Exportar a conversa", rotulo: "Exportar",
    texto: "O arquivo tem dados do paciente e fica neste computador. Guarde em local seguro e apague depois." });
  if (!seguir || A !== E || A.selId !== id || !A.ver) return;
  // plano 1000b · CB-054: as páginas anteriores vêm direto da RPC para um array local — o chat não é redesenhado a cada página
  let paginas = 0, temMais = !!A.temMaisAntes;
  let coletadas = A.msgs.slice();
  // plano 1000b · CB-055: aviso com o progresso («12 de até 40 páginas») e «Cancelar» — cancelado, nada é baixado
  let cancelado = false, progresso = null;
  if (temMais) {
    A.ui.anunciar("Preparando a exportação: carregando as mensagens anteriores…");
    progresso = A.ui.toast(`Preparando a exportação… 0 de até ${EXPORTAR_PAGINAS} páginas`, { tipo: "info", fixo: true, ms: 0,
      acao: { rotulo: "Cancelar", fn: () => { cancelado = true; } }, aoFechar: motivo => { if (motivo === "fechado") cancelado = true; } });
  }
  const pintarProgresso = () => { const p = progresso && progresso.el && progresso.el.querySelector("p"); if (p) p.textContent = `Preparando… ${paginas} de até ${EXPORTAR_PAGINAS} páginas`; };
  const fecharProgresso = () => { if (progresso) { const pr = progresso; progresso = null; try { pr.fechar("pronto"); } catch { /* ok */ } } };
  while (A === E && A.selId === id && temMais && !cancelado && paginas < EXPORTAR_PAGINAS) {
    const primeira = coletadas.find(m => !(typeof m.id === "string"));
    if (!primeira) break;
    let r;
    try { r = await E.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_antes_id: primeira.id, p_limite: 50 }); }
    catch (e) { if (A === E) A.ui.toast(A.ui.mensagemErro(e), { tipo: "erro" }); break; }
    paginas++;
    pintarProgresso();
    const antes = coletadas.length;
    coletadas = E.L.mesclarDelta(coletadas, (r && r.itens) || []);
    temMais = !!(r && r.tem_mais);
    if (coletadas.length === antes) break;
  }
  fecharProgresso();
  if (cancelado) { if (A === E) A.ui.toast("Exportação cancelada: nada foi baixado.", { tipo: "info" }); return; }
  if (A !== E || A.selId !== id || !A.ver) return;
  const nome = nomeContato(A.ver.contato) || "Cliente";
  const conv = A.ver.conversa || {};
  const titulo = `Conversa com ${nome}${conv.protocolo ? ` · protocolo ${conv.protocolo}` : ""} · exportada em ${A.ui.dataHoraBR(new Date().toISOString())}`;
  const texto = A.L.textoExportacao(coletadas, { contato: nome, titulo });
  const n = coletadas.filter(m => m && !m.local && m.tipo !== "nota").length;
  let url = null;
  try {
    url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const arq = `conversa-${A.L.semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente"}-${A.L.diaSP(Date.now())}.txt`;
    const a = A.ui.h("a", { href: url, download: arq, hidden: true });
    document.body.appendChild(a);
    a.click();
    a.remove();
    A.ui.toast(`Conversa exportada: ${n} ${n === 1 ? "mensagem" : "mensagens"}${temMais ? " (as mais antigas ficaram de fora)" : ""}, sem notas internas.`, { tipo: "ok" });
  } catch (e) {
    A.ui.toast("Não foi possível gerar o arquivo neste navegador.", { tipo: "erro" });
  } finally { if (url) setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ok */ } }, 4000); }
}

async function transferirComDesfazer(conv, { conta, dep, texto = null, recado = "" }) {
  const id = conv.id;
  const u = conta ? (A.base.usuarios || []).find(x => x.id === conta) : null;
  const d = dep ? (A.base.departamentos || []).find(x => x.id === dep) : null;
  const antes = { atribuida_a: conv.atribuida_a || null, atribuida_nome: conv.atribuida_nome || (conv.atribuida && conv.atribuida.nome) || null,
    atribuida: conv.atribuida || null, departamento_id: conv.departamento_id || null, departamento: conv.departamento || null };
  const depois = { atribuida_a: conta, atribuida_nome: u ? u.nome : null, atribuida: u ? { id: u.id, nome: u.nome } : null,
    ...(d ? { departamento_id: d.id, departamento: { id: d.id, nome: d.nome } } : {}) };
  const pend = { depois, cancelado: false };
  const nome = nomeContato(A.ver.contato || conv.contato) || "Conversa";
  const para = u ? (u.id === (A.eu && A.eu.id) ? "você" : u.nome) : d ? `a fila de ${d.nome}` : "a fila";
  const api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  const naMesmaEmpresa = () => !!A && (A.ctx.cliente && A.ctx.cliente.id) === cliente;
  const voltarTela = () => {
    if (pend.cancelado) return;
    pend.cancelado = true;
    if (_pendTransferir.get(id) === pend) _pendTransferir.delete(id);
    if (!naMesmaEmpresa()) return;
    if (A.selId === id) trocarConversa({ id, ...antes }); else atualizarItemLista({ id, ...antes });
    carregarLista({});
    if (A.selId === id) recarregarVer();
  };
  await A.ui.acaoComDesfazer({
    texto: texto || `Transferida para ${para} · ${nome}`,
    // só a tela: nada vai ao servidor antes de o aviso fechar
    aplicar: () => {
      _pendTransferir.set(id, pend);
      if (A.selId === id) trocarConversa({ id, ...depois }); else atualizarItemLista({ id, ...depois });
      A.itens = itensComPendencia(A.itens);
      A.lista.render();
    },
    firmar: async ({ saindo = false } = {}) => {
      if (pend.cancelado) return;
      pend.firmando = true;
      // CA-054: o recado para quem recebe vira nota interna «Transferência: …». Gravado ANTES do nx_cv_atribuir (revisão 13/10): depois
      // da transferência quem transferiu pode deixar de enxergar a conversa (departamento/ver_todas) e a nota falhava, perdendo o recado
      if (recado) {
        try { await api.rpc("nx_cv_nota", { p_cliente: cliente, p_conversa: id, p_texto: `Transferência: ${recado}` }, saindo ? { keepalive: true } : {}); }
        catch (e) { if (naMesmaEmpresa()) A.ui.toast(`O recado não foi gravado (${A.ui.mensagemErro(e)}); a transferência segue.`, { tipo: "erro" }); }
      }
      let r;
      try { r = await api.rpc("nx_cv_atribuir", { p_cliente: cliente, p_conversa: id, p_conta: conta, p_departamento: dep }, saindo ? { keepalive: true } : {}); }
      catch (e) { if (saindo) voltarTela(); throw e; }      // fora do «saindo» quem devolve a tela é o próprio aviso (reverter)
      if (_pendTransferir.get(id) === pend) _pendTransferir.delete(id);
      pend.cancelado = true;
      if (!naMesmaEmpresa()) return;
      if (r && r.id) { if (A.selId === id) { trocarConversa(r); delta(); recarregarVer(); } else atualizarItemLista(r); }
      carregarLista({});
    },
    reverter: voltarTela,
  });
}

/* ============================================================ teclado da central (M35)
   Acordes com Alt valem até dentro do campo de mensagem (Alt+Shift+letra evita o AltGr do ABNT2); as letras soltas (j, k, /, ?) só fora dos
   campos. A decisão de «qual tecla é qual comando» é pura e fica em cv-logica.js (acordeDoEvento). */
function aviso(texto) { if (A) A.ui.toast(texto, { tipo: "info" }); }

function emCampoDeTexto(el) { return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }

function aoTeclaCentral(ev) {
  if (!A || ev.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return;       // modal ou gaveta aberta: o teclado é dela
  const id = A.L.acordeDoEvento(ev, { emCampo: emCampoDeTexto(ev.target) });
  if (!id) return;
  ev.preventDefault();
  executarComando(id);
}

/** Pede uma conversa aberta onde a pessoa possa escrever; avisa o motivo quando não há. */
function conversaParaAgir() {
  const conv = A.ver && A.ver.conversa;
  if (!conv || !A.selId) { aviso("Abra uma conversa para usar este atalho."); return null; }
  if (!A.podeEscrever) { aviso("Seu acesso é só de leitura nesta central."); return null; }
  return conv;
}

function executarComando(id) {
  if (!A) return;
  switch (id) {
    case "proxima": irParaVizinha(1); break;
    case "anterior": irParaVizinha(-1); break;
    case "atender": atenderProximo(); break;
    case "assumir": comandoAssumir(); break;
    case "resolver": if (conversaParaAgir()) resolverComDesfazer(); break;
    case "nota": if (conversaParaAgir()) A.composer.alternarNota(); break;
    case "transferir": if (conversaParaAgir()) acoes.transferir(); break;
    case "abrir_negocio": comandoAbrirNegocio(); break;                                // plano 1000 · CA-157
    case "etiquetas": if (conversaParaAgir()) A.chat.abrirEtiquetas(); break;           // CA-158
    case "mover_baixo": A.lista.moverFoco(1); break;
    case "mover_cima": A.lista.moverFoco(-1); break;
    case "buscar": A.lista.focarBusca(); break;
    case "ajuda": abrirAjudaTeclado(); break;
    case "foco_lista": focarListaOuVazio(); break;
  }
}

/** Alt+↓ / Alt+↑: abre a conversa seguinte (ou anterior) da lista e deixa o cursor no campo de mensagem. */
async function irParaVizinha(dir) {
  if (!A.itens.length) { aviso("Não há conversas nesta lista."); return; }
  let id = A.L.proximaConversa(A.itens, A.selId, dir);
  if (id == null && dir > 0 && A.temMais) {                   // fim da página carregada: busca a seguinte antes de desistir
    await carregarLista({ mais: true });
    if (!A) return;
    id = A.L.proximaConversa(A.itens, A.selId, dir);
  }
  if (id == null) { aviso(dir > 0 ? "Esta é a última conversa da lista." : "Esta é a primeira conversa da lista."); return; }
  A.focoAoAbrir = "composer";
  abrir(id);
}

/** plano 1000 · CA-157: Alt+Shift+O abre o negócio ligado à conversa (a gaveta do CRM); sem negócio ligado, diz isso. */
function comandoAbrirNegocio() {
  const conv = A.ver && A.ver.conversa;
  if (!conv || !A.selId) { aviso("Abra uma conversa para usar este atalho."); return; }
  const id = conv.negocio && conv.negocio.id;
  if (!id) { aviso("Esta conversa não tem negócio ligado. Ligue um na lateral («Ligar a este atendimento»)."); return; }
  if (typeof A.ctx.abrirNegocio !== "function") { aviso("O CRM não está disponível nesta conta."); return; }
  A.ctx.abrirNegocio(id, { aoMudar: () => recarregarVer() });
}

/** Alt+Shift+A: a mesma regra do botão principal do cabeçalho (assumir; com a IA atendendo, pausa a IA e assume). */
async function comandoAssumir() {
  const conv = conversaParaAgir();
  if (!conv) return;
  const est = A.chat.estadoAcoes() || {};
  if (est.primaria === "assumir_ia") return acoes.assumirIA();
  if (est.primaria === "assumir") return acoes.assumir();
  aviso(conv.status === "resolvida" ? "A conversa está resolvida. Reabra antes de assumir." : "A conversa já está com você.");
}

/** Espera a conversa `id` terminar de abrir (a rota chama `selecionar`, que é assíncrona). */
async function esperarConversa(id, ms = 6000) {
  const fim = Date.now() + ms;
  while (A && Date.now() < fim) {
    if (A.selId === id && A.ver && A.ver.conversa && A.ver.conversa.id === id) return true;
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
}

/** «Atender o próximo»: a conversa aberta que espera resposta há mais tempo (a que é de outra pessoa fica de fora): abre, assume e deixa o cursor no campo. */
async function atenderProximo(botao) {
  if (!A || A.atendendo) return;
  if (!A.podeEscrever) { aviso("Seu acesso é só de leitura nesta central."); return; }
  A.atendendo = true;
  if (botao) botao.setAttribute("aria-busy", "true");
  try {
    // plano 1000b · CB-121: lê até 3 páginas da aba Aguardando — as 50 mais antigas podiam ser todas de colegas
    let c = null, antes = null;
    for (let pag = 0; pag < 3 && !c; pag++) {
      const r = await A.api.rpcC("nx_cv_listar", { p_filtro: { aba: "aguardando" }, p_limite: 50, p_antes: antes });
      if (!A) return;
      const itens = (r && r.itens) || [];
      // a que acabou de ser resolvida (o «Desfazer» ainda na tela; o servidor ainda a tem aberta) não volta como «a próxima»
      c = A.L.proximaParaAtender(itens.filter(x => !_pendResolver.has(x.id)), A.eu && A.eu.id);
      if (c || !(r && r.tem_mais) || !itens.length) break;
      const ult = itens[itens.length - 1];
      antes = ult.ultima_entrada_em || ult.ultima_msg_em || null;
      if (!antes) break;
    }
    if (!c) { aviso("Ninguém sem dono (nem seu) esperando agora."); return; }
    A.focoAoAbrir = "composer";
    if (A.selId !== c.id) A.ctx.navegar(`#/conversas/${c.id}`);
    if (!await esperarConversa(c.id)) return;
    const est = A.chat.estadoAcoes() || {};
    if (est.primaria === "assumir_ia") await acoes.assumirIA();
    else if (est.primaria === "assumir") await acoes.assumir();
    else A.composer.focar();
  } catch (e) {
    if (A) tratarErro(e);
  } finally {
    if (A) A.atendendo = false;
    if (botao) botao.removeAttribute("aria-busy");
  }
}

/* Resolver adiado: enquanto o «Desfazer» está na tela, NADA foi ao servidor (como Ganho/Perdido no CRM). Fica no módulo, e não no A, para
   valer também se a pessoa sair de Conversas e voltar nesses 7 s. id da conversa → { antes: {status, aguardando, nao_lidas}, cancelado }. */
const _pendResolver = new Map();
/* D12: Transferir adiado, pelo mesmo caminho (nada vai ao servidor antes de o «Desfazer» fechar): id → { depois: {campos da tela}, cancelado } */
const _pendTransferir = new Map();
/* revisão 1000b · CB-093: «Marcar como lidas» em lote adiado (Desfazer): id → marca do lote; a tela mostra 0 não lidas até firmar/desfazer */
const _pendLida = new Map();

/** A conversa como a tela deve mostrá-la: resolvida, se o «Resolver» dela ainda espera o fim do Desfazer (o servidor ainda a tem aberta). */
function comPendencia(conv) {
  if (!conv) return conv;
  let c = _pendResolver.has(conv.id) ? { ...conv, status: "resolvida", aguardando: false, nao_lidas: 0 } : conv;
  const t = _pendTransferir.get(c.id);
  if (t && !t.cancelado) c = { ...c, ...t.depois };
  if (_pendLida.has(c.id) && Number(c.nao_lidas) > 0) c = { ...c, nao_lidas: 0 };
  return c;
}
/** A lista com os «Resolver» pendentes aplicados: a conversa sai das abas de abertas (como o servidor fará) e continua visível na busca. */
function itensComPendencia(itens) {
  if (!_pendResolver.size && !_pendTransferir.size && !_pendLida.size) return itens;
  const eu = A.eu && A.eu.id, busca = !!filtroAtual().busca;
  return itens.map(comPendencia).filter(c => (!_pendResolver.has(c.id) && !_pendTransferir.has(c.id)) || busca || A.L.pertenceAba(c, A.aba, eu));
}

/**
 * Resolver com Desfazer (ui.acaoComDesfazer): a tela resolve na hora e o toast «Resolvida · Mariana» dura 7 s; a mudança só vai ao servidor
 * (nx_cv_status) quando o aviso fecha (firmar). Assim o Desfazer devolve a conversa exatamente como estava (aberta ou pendente, ainda na fila
 * de espera) e nenhuma automação de «conversa resolvida» dispara por engano. Com «Ao resolver, abrir a próxima» ligado, a seguinte da lista
 * abre com o cursor no campo; sem seguinte, volta ao painel da fila; o Desfazer volta para a resolvida.
 */
async function resolverComDesfazer() {
  const conv = A && A.ver && A.ver.conversa;
  if (!conv || !A.selId) { aviso("Abra uma conversa para resolver."); return; }
  const id = conv.id;
  if (conv.status === "resolvida") { aviso("Esta conversa já está resolvida."); return; }
  if (A.resolvendo.has(id)) return;
  A.resolvendo.add(id);
  const antes = conv.status;                                 // «aberta» ou «pendente»: é o que o Desfazer devolve
  const entradaAntes = Date.parse(conv.ultima_entrada_em || "") || 0;   // última mensagem do cliente vista no clique
  const pend = { antes: { status: antes, aguardando: !!conv.aguardando, nao_lidas: Number(conv.nao_lidas) || 0 }, cancelado: false };
  const nome = nomeContato(A.ver.contato || conv.contato) || "Conversa";
  const proxima = A.avancar ? A.L.proximaAposResolver(A.itens, id, { aba: A.aba }) : null;
  // o api e a empresa ficam guardados: a escrita sai 7 s depois, e até lá a pessoa pode ter saído de Conversas ou trocado de empresa
  const api = A.api, cliente = A.ctx.cliente && A.ctx.cliente.id;
  const naMesmaEmpresa = () => !!A && (A.ctx.cliente && A.ctx.cliente.id) === cliente;
  let avancou = false;
  // Desfazer (ou a escrita adiada falhou): nada mudou no servidor, basta devolver a tela ao que era
  const voltarTela = () => {
    if (pend.cancelado) return;
    pend.cancelado = true;
    if (_pendResolver.get(id) === pend) _pendResolver.delete(id);
    if (!naMesmaEmpresa()) return;                           // a pessoa saiu de Conversas: ao voltar, a tela lê o servidor, que nunca soube do «Resolver»
    if (A.selId === id) trocarConversa({ id, ...pend.antes }); else atualizarItemLista({ id, ...pend.antes });
    carregarLista({});
    const aindaNaProxima = proxima ? A.selId === proxima.id : A.selId == null;
    if (avancou && aindaNaProxima) { A.focoAoAbrir = "composer"; abrir(id); }
    else if (A.selId === id) { delta(); recarregarVer(); }
  };
  try {
    await A.ui.acaoComDesfazer({
      texto: `Resolvida · ${nome}`,
      // só a tela: nada vai ao servidor antes de o aviso fechar
      aplicar: () => {
        _pendResolver.set(id, pend);
        if (A.selId === id) { trocarConversa({ id, status: "resolvida" }); A.chat.sucesso("Atendimento resolvido."); } else atualizarItemLista({ id, status: "resolvida" });
        A.itens = itensComPendencia(A.itens);
        if (A.avancar && A.selId === id) {
          avancou = true;
          if (proxima) { A.focoAoAbrir = "composer"; A.ctx.navegar(`#/conversas/${proxima.id}`); }
          else { A.focoAoAbrir = "lista"; A.ctx.navegar("#/conversas"); }
        } else if (A.selId === id) A.lateral.render();
        A.lista.render();
      },
      // o aviso fechou sem Desfazer: agora sim o servidor resolve. Página saindo ou oculta (saindo): keepalive, para o pedido sobreviver ao fechamento
      firmar: async ({ saindo = false } = {}) => {
        if (pend.cancelado) return;
        if (!saindo) {
          // o cliente escreveu com o «Desfazer» na tela: não resolve por cima da mensagem nova (com a página saindo não dá tempo de ler)
          let lido = null;
          try { lido = await api.rpc("nx_cv_ver", { p_cliente: cliente, p_id: id }); } catch { /* sem a leitura, o Resolver vale */ }
          if (pend.cancelado) return;
          const c = lido && lido.conversa;
          if (c && (Date.parse(c.ultima_entrada_em || "") || 0) > entradaAntes) {
            pend.cancelado = true;
            if (_pendResolver.get(id) === pend) _pendResolver.delete(id);
            if (A) A.ui.toast(`${nome} escreveu de novo: a conversa continua aberta.`, { tipo: "info" });
            if (naMesmaEmpresa()) { if (A.selId === id) { trocarConversa(c); delta(); recarregarVer(); } else atualizarItemLista(c); carregarLista({}); }
            return;
          }
        }
        pend.firmando = true;
        let r;
        try { r = await api.rpc("nx_cv_status", { p_cliente: cliente, p_conversa: id, p_status: "resolvida" }, saindo ? { keepalive: true } : {}); }
        catch (e) { if (saindo) voltarTela(); throw e; }     // fora do «saindo» quem devolve a tela é o próprio aviso (chama reverter)
        if (_pendResolver.get(id) === pend) _pendResolver.delete(id);
        pend.cancelado = true;                               // já está no servidor: um Desfazer atrasado não mexe mais na tela
        if (!naMesmaEmpresa()) return;
        if (A.selId === id) { trocarConversa(r); delta(); recarregarVer(); } else atualizarItemLista(r);
        carregarLista({});
      },
      reverter: voltarTela,
    });
  } finally {
    if (A) A.resolvendo.delete(id);
  }
}

/** Devolve o foco à lista (Esc no campo); sem conversa à vista, ao painel vazio ou à busca. */
function focarListaOuVazio() {
  if (!A) return;
  if (A.lista.focarItem()) return;
  const b = A.raiz.querySelector(".cvc-atender, .cvc-num");
  if (b && b.getClientRects().length) { b.focus(); return; }
  A.lista.focarBusca();
}

/** Folha de atalhos da central (também por «?» fora de campo e pelo menu ⋮). A preferência «Ao resolver, abrir a próxima» mora aqui. */
function abrirAjudaTeclado() {
  if (!A) return;
  const ui = A.ui, h = ui.h;
  const grupos = [...new Set(A.L.ACORDES.map(a => a.grupo))];
  const teclas = txt => h("span", { class: "cv-teclas-k" }, txt.split("+").flatMap((t, i) => (i ? ["+"] : []).concat([h("kbd", null, t)])));
  const campoAvancar = ui.campo({ tipo: "interruptor", nome: "avancar", rotulo: "Ao resolver, abrir a próxima conversa", valor: A.avancar });
  const entrada = campoAvancar.querySelector("input");
  if (entrada) entrada.addEventListener("change", () => A.acoes.definirAvancar(entrada.checked));
  // plano 1000 · CA-068: «Ctrl+Enter envia» (Enter quebra a linha) — lembrado por navegador; a dica do campo acompanha
  const campoEnter = ui.campo({ tipo: "interruptor", nome: "enter_quebra", rotulo: "Enter quebra a linha (Ctrl+Enter envia)", valor: A.acoes.enterQuebra() });
  const entradaEnter = campoEnter.querySelector("input");
  if (entradaEnter) entradaEnter.addEventListener("change", () => {
    gravarPreferencia("enter", entradaEnter.checked ? "quebra" : "envia");
    if (A && A.composer) A.composer.atualizar();
    A.ui.toast(entradaEnter.checked ? "Enter quebra a linha; Ctrl+Enter envia." : "Enter envia; Shift+Enter quebra a linha.", { tipo: "info" });
  });
  // plano 1000 · CA-160: filtro da folha (a lista cresce) e «Imprimir» (o CSS de impressão mostra só a folha)
  const filtro = h("input", { type: "search", class: "cv-teclas-filtro", placeholder: "Filtrar atalhos (ex.: nota, resolver)", "aria-label": "Filtrar atalhos", autocomplete: "off" });
  const nada = h("p", { class: "sub cv-teclas-nada", hidden: true }, "Nenhum atalho com esse termo.");
  const extras = [
    { teclas: "Ctrl+/", rotulo: "No campo de mensagem: respostas rápidas no meio do texto" },
  ];
  const linhaAtalho = a => h("div", { class: "cv-teclas-item", dataset: { busca: A.L.semAcento(`${a.teclas} ${a.rotulo} ${a.grupo || ""}`) } }, h("dt", null, teclas(a.teclas)), h("dd", null, a.rotulo));
  const secoes = grupos.map(g => h("section", { class: "cv-teclas-grupo" },
    h("h3", { class: "rotulo" }, g),
    h("dl", { class: "cv-teclas-lista" }, A.L.ACORDES.filter(a => a.grupo === g).map(linhaAtalho), g === "Atender" ? extras.map(linhaAtalho) : null)));
  filtro.addEventListener("input", () => {
    const q = A.L.semAcento(filtro.value.trim());
    let n = 0;
    for (const s of secoes) {
      let ns = 0;
      for (const it of s.querySelectorAll(".cv-teclas-item")) { const ok = !q || it.dataset.busca.includes(q); it.hidden = !ok; if (ok) { n++; ns++; } }
      s.hidden = ns === 0;
    }
    nada.hidden = n > 0;
  });
  // CA-144: no número do CodeWords (aparelho) não existe «responder citando» — explicado uma vez, aqui
  const temCw = ((A.base && A.base.canais) || []).some(c => c && c.provedor === "codewords");
  const notaCw = temCw ? h("p", { class: "sub cv-teclas-cw" }, "Nos números do CodeWords (aparelho) não dá para responder citando: a mensagem vai normal, sem a citação.") : null;
  // CA-126: «Copiar diagnóstico» para o suporte — estado da tela sem texto de mensagem, token ou telefone
  const btDiag = h("button", { type: "button", class: "bt bt-fant bt-p cv-diag" }, ui.icone("copiar"), "Copiar diagnóstico para o suporte");
  btDiag.addEventListener("click", () => { ui.copiar(diagnostico(), { aviso: "Diagnóstico copiado: cole na conversa com o suporte." }); });
  const btImprimir = h("button", { type: "button", class: "bt bt-fant bt-p cv-imprimir" }, "Imprimir");
  // plano 1000b · CB-095: no Safari/iOS o print() volta antes de imprimir — a classe só sai no afterprint (como a agenda.js), com reserva
  // de 60 s para navegador que não avisa (a classe só vale no @media print: na tela ela não muda nada)
  btImprimir.addEventListener("click", () => {
    const raiz = document.documentElement;
    let reserva = null;
    const fim = () => { clearTimeout(reserva); raiz.classList.remove("cv-imprimindo-atalhos"); try { window.removeEventListener("afterprint", fim); } catch { /* ok */ } };
    raiz.classList.add("cv-imprimindo-atalhos");
    try { window.addEventListener("afterprint", fim); } catch { /* ok */ }
    reserva = setTimeout(fim, 60000);
    try { window.print(); } catch { fim(); /* sem impressão */ }
  });
  const corpo = h("div", { class: "pilha cv-teclas" },
    h("p", { class: "sub" }, "Os acordes com Alt valem também com o cursor no campo de mensagem. As letras soltas só valem fora dos campos de texto."),
    filtro, nada, secoes, notaCw,
    campoAvancar, campoEnter,
    h("div", { class: "linha cv-teclas-rod" }, btImprimir, btDiag));
  ui.modal({ titulo: "Atalhos da central de conversas", corpo, largura: "m", acoes: [{ rotulo: "Fechar", tipo: "primario" }] });
}

/** CA-126: o texto do «Copiar diagnóstico» (cv-logica.textoDiagnostico) com o estado desta tela. */
function diagnostico() {
  if (!A) return "";
  return A.L.textoDiagnostico({
    versao: A.ctx.versao || "", conta: A.ctx.sessao && A.ctx.sessao.conta && A.ctx.sessao.conta.id, cliente: A.ctx.cliente && A.ctx.cliente.id, aba: A.aba,
    conversa: A.selId, fila: [...A.fila.itens.values()].map(x => ({ estado: x.estado })), deltaOkEm: A.deltaOkEm || null, deltaFalhas: A.deltaFalhas || 0,
    pulsoEm: A.pulsoEm || null, erros: A.errosRecentes || [], online: !estaOffline(),
  });
}

/** Ações na paleta de comandos (Ctrl/⌘+K) enquanto Conversas está aberta; só se o shell oferecer o registro (ctx.comandos.registrar, M18). */
function registrarComandos() {
  const reg = A.ctx.comandos;
  if (!reg || typeof reg.registrar !== "function") return;
  const def = (id, rotulo, palavras, fazer, atalho) => {
    try { const cancelar = reg.registrar({ id: `conversas.${id}`, rotulo, palavras, atalho, fazer }); if (typeof cancelar === "function") A.limpar.push(cancelar); } catch { /* o registro não pode derrubar a tela */ }
  };
  if (A.podeEscrever) {
    def("atender", "Atender o próximo", "conversa fila espera atender proxima responder cliente", () => atenderProximo(), "Alt+Shift+P");
    def("nova", "Nova conversa", "conversa nova mensagem iniciar whatsapp contato", () => novaConversa());
    def("assumir", "Assumir a conversa aberta", "conversa assumir atribuir", () => executarComando("assumir"), "Alt+Shift+A");
    def("resolver", "Resolver a conversa aberta", "conversa resolver encerrar finalizar", () => executarComando("resolver"), "Alt+Shift+R");
    def("nota", "Nota interna na conversa", "conversa nota interna equipe", () => executarComando("nota"), "Alt+Shift+N");
    def("transferir", "Transferir a conversa aberta", "conversa transferir passar atendente departamento", () => executarComando("transferir"), "Alt+Shift+T");
    def("etiquetas", "Etiquetas da conversa aberta", "conversa etiqueta marcar organizar", () => executarComando("etiquetas"), "Alt+Shift+E");
  }
  def("negocio", "Abrir o negócio da conversa aberta", "conversa negocio oportunidade crm abrir", () => executarComando("abrir_negocio"), "Alt+Shift+O");
  def("atalhos", "Atalhos da central de conversas", "atalhos teclado ajuda conversas", () => abrirAjudaTeclado(), "?");
}

/** plano 1000b · CB-053: os arquivos enviados ficavam na memória (object URL) até sair de Conversas — uma tarde de vídeos segurava
    centenas de MB. Mantém só os BLOBS_MAX mais novos; o mais velho que nenhuma bolha local (pendente/falha) usa é revogado e a mídia
    dele volta a vir pela URL assinada. */
const BLOBS_MAX = 20;
function podarBlobs() {
  if (!A || A.blobs.size <= BLOBS_MAX) return;
  const emUso = new Set((A.msgs || []).filter(m => m && m.local && m.midia && m.midia.local_url).map(m => m.midia.local_url));
  for (const u of [...A.blobs]) {
    if (A.blobs.size <= BLOBS_MAX) break;
    if (emUso.has(u)) continue;
    A.blobs.delete(u);
    try { URL.revokeObjectURL(u); } catch { /* ok */ }
    for (const [p, v] of A.midia) if (v && v.local === u) A.midia.delete(p);
  }
}

/* ============================================================ envio (nx-enviar) */
/** enviar({tipo:'texto'|'midia'|'template', texto, arquivo, legenda, template, parametros, respondeA}) */
async function enviar(o) {
  const L = A.L;
  const conv = A.ver && A.ver.conversa;
  if (!conv) return null;
  // quem pede o envio diz para qual conversa ele foi preparado: se a aberta já é outra, nada sai (nunca para o cliente errado)
  if (o.conversa != null && (o.conversa !== conv.id || A.selId !== conv.id)) {
    A.ui.toast("Você trocou de conversa antes de enviar: nada foi enviado. Volte à conversa certa e envie de novo.", { tipo: "info", ms: 8000 });
    return null;
  }
  if (o.tipo === "texto") return enviarTexto(o);
  const eu = { id: A.eu.id, nome: A.eu.nome };
  let tmp;
  if (o.tipo === "midia") {
    const url = URL.createObjectURL(o.arquivo);
    A.blobs.add(url);
    podarBlobs();   // plano 1000b · CB-053
    tmp = L.mensagemOtimista({ conversaId: conv.id, tipo: o.validacao.tipo, corpo: o.legenda || null, eu,
      midia: { nome: o.arquivo.name, mime: o.validacao.mime, tamanho: o.arquivo.size, estado: "enviando", local_url: url, progresso: 0, fase: "subindo" } });
  } else {
    tmp = L.mensagemOtimista({ conversaId: conv.id, tipo: "template", corpo: L.preencherModelo(o.template.corpo, o.parametros), eu,
      template: { nome: o.template.nome, idioma: o.template.idioma } });
  }
  tmp.pedido = o;
  A.msgs = L.mesclarDelta(A.msgs, [tmp]);
  A.chat.renderMensagens({ rolar: "fim" });
  await enviarPedido(tmp, o);
  return { persistido: false };
}

async function enviarPedido(tmp, o) {
  const L = A.L, ui = A.ui, ctx = A.ctx;
  const convId = A.selId;
  const para = nomeContato(A.ver && (A.ver.contato || (A.ver.conversa && A.ver.conversa.contato))) || "um contato";
  try {
    let r;
    // D8: client_ref por INTENÇÃO também no modelo (a Meta cobra cada modelo entregue): «Enviar de novo» repete o MESMO
    o.client_ref = o.client_ref || L.novoClientRef();
    if (o.tipo === "midia") {
      // o arquivo já subiu numa tentativa anterior (a nx-enviar é que falhou): "Tentar de novo" não sobe tudo outra vez
      if (!o.path) {
        definirProgresso(tmp, 0, "subindo", convId);
        const s = await A.api.fn("nx-midia", { acao: "subir", nome: o.arquivo.name, mime: o.validacao.mime, tamanho: o.arquivo.size });
        if (!s || !s.path || !/^https:\/\//.test(String(s.upload_url || ""))) throw Object.assign(new Error("envio_falhou"), { codigo: "envio_falhou", detalhe_texto: "o servidor não liberou o envio do arquivo" });
        const subir = () => subirArquivo(s.upload_url, o.arquivo, o.validacao.mime, {
          aoProgresso: (env, total) => definirProgresso(tmp, L.progressoEnvio(env, total).pct, "subindo", convId),
          registrar: cancelar => { A.envios.set(tmp.id, cancelar); if (A.selId === convId) A.chat.renderMensagens({ rolar: "manter" }); } });
        try {
          try { await subir(); }
          catch (e) {
            // D15: a conexão piscou no meio do PUT (rede/tempo, não recusa do servidor): mais UMA tentativa sozinha, com o mesmo path
            if (!(e && e.codigo === "upload_falhou" && e.rede) || !A) throw e;
            // revisão: na espera o «Cancelar» à vista apontava para o PUT que já falhou (abort() num pedido encerrado não faz nada)
            // e a 2ª tentativa subia e enviava o arquivo mesmo assim — na espera, cancelar marca a desistência
            let desistiu = false;
            A.envios.set(tmp.id, () => { desistiu = true; });
            await new Promise(ok => setTimeout(ok, SUBIR_ESPERA_MS));
            if (!A || desistiu) throw Object.assign(new Error("upload_cancelado"), { codigo: "upload_cancelado" });
            definirProgresso(tmp, 0, "subindo", convId);
            await subir();
          }
        } finally { if (A) A.envios.delete(tmp.id); }
        o.path = s.path;
      }
      definirProgresso(tmp, 100, "entregando", convId);
      // sem responde_a: mídia nunca vai como citação (e o aparelho do CodeWords nem tem citação)
      r = await A.api.fn("nx-enviar", { acao: "midia", conversa: convId, path: o.path, mime: o.validacao.mime, nome: o.arquivo.name, legenda: o.legenda || undefined, tamanho: o.arquivo.size, client_ref: o.client_ref });
    } else {
      r = await A.api.fn("nx-enviar", { acao: "template", conversa: convId, template_id: o.template.id, parametros: o.parametros || [], client_ref: o.client_ref });
    }
    if (!A || A.selId !== convId) return;
    const msg = r && r.mensagem ? { ...r.mensagem, ...(r.ambigua === true ? { ambigua: true } : {}) } : null;
    A.msgs = A.msgs.filter(m => m.id !== tmp.id);
    if (msg && msg.id) {
      if (tmp.midia && tmp.midia.local_url && msg.midia && msg.midia.path) A.midia.set(msg.midia.path, { url: null, local: tmp.midia.local_url, em: Date.now() });
      A.msgs = L.mesclarDelta(A.msgs, [msg]);
      A.ultimoId = L.ultimoId(A.msgs, A.ultimoId);
    }
    A.chat.renderMensagens({ rolar: "fim" });
    delta();
    carregarLista({});
  } catch (e) {
    const codigo = e && e.codigo;
    if (!A || A.selId !== convId) {
      // a pessoa já está em outra conversa (ou saiu de Conversas) e a bolha não está mais à vista: a falha não pode passar em branco
      if (codigo === "upload_cancelado") {            // sair de Conversas interrompe o arquivo que ainda subia: diga isso
        if (!A) ui.toast(`O envio do arquivo para ${para} foi interrompido porque você saiu de Conversas. Nada foi enviado.`, { tipo: "info", ms: 8000 });
      } else {
        const oQue = o.tipo === "midia" ? "O arquivo" : "O modelo";
        const duvida = e?.resposta?.ambigua === true || ["sem_conexao", "tempo_rede", "envio_em_andamento"].includes(codigo) || Number(e?.status) === 504;
        const motivo = (typeof e?.resposta?.detalhe === "string" && e.resposta.detalhe) || L.dicaErroEnvio(codigo) || ui.mensagemErro(e);
        toastAbrir(ui, ctx, duvida ? `${oQue} para ${para} pode ter saído — confira no WhatsApp antes de reenviar.`
          : `${oQue} para ${para} não foi enviado: ${motivo}`, convId);
      }
      return;
    }
    // D8: outro pedido com o MESMO client_ref ainda está enviando (409): não é falha — confere de novo em ~20 s com o mesmo ref
    if (codigo === "envio_em_andamento") {
      const vezes = (tmp.andamento || 0) + 1;
      A.msgs = A.msgs.map(m => m.id === tmp.id ? { ...m, status: "pendente", andamento: vezes, erro: null, falhaLocal: false } : m);
      A.chat.renderMensagens({ rolar: "manter" });
      if (vezes <= 3) A.timers.push(setTimeout(() => {      // vai junto com os timers da tela (desmontar limpa)
        if (!A || A.selId !== convId) return;
        const atual = A.msgs.find(m => m.id === tmp.id);
        if (atual) enviarPedido(atual, o);
      }, L.FILA_EM_ANDAMENTO_MS + 250));
      else {
        A.msgs = A.msgs.map(m => m.id === tmp.id ? { ...m, ambigua: true, erro: "Pode ter saído — confira no WhatsApp antes de reenviar." } : m);
        A.chat.renderMensagens({ rolar: "manter" });
      }
      return;
    }
    if (codigo === "upload_cancelado") {   // a pessoa cancelou: nada saiu, a bolha local some
      A.msgs = A.msgs.filter(m => m.id !== tmp.id);
      A.chat.renderMensagens({ rolar: "manter" });
      A.ui.toast("Envio cancelado.", { tipo: "info" });
      return;
    }
    // Só a resposta marcada pelo servidor ou um timeout de transporte deixa incerto se o
    // aparelho recebeu. Um 5xx interno sem essa marca não deve bloquear a recuperação.
    const envioAmbiguo = e?.resposta?.ambigua === true || ["sem_conexao", "tempo_rede"].includes(codigo)
      || Number(e?.status) === 504;
    // a Graph recusou e o servidor gravou a mensagem como "falhou" (com o motivo): o api.js anexa o corpo
    // inteiro em e.resposta ({ok:false, erro, detalhe, mensagem}) — mostra a do servidor sem outra chamada
    const salva = (e && e.resposta && e.resposta.mensagem) || (e && e.detalhe && typeof e.detalhe === "object" && e.detalhe.mensagem) || null;
    if (codigo === "envio_falhou" && salva && salva.id) {
      A.msgs = L.mesclarDelta(A.msgs.filter(m => m.id !== tmp.id), [envioAmbiguo ? { ...salva, ambigua: true } : salva]);
      A.ultimoId = L.ultimoId(A.msgs, A.ultimoId);
    } else if (codigo === "envio_falhou" || envioAmbiguo) {
      // o servidor pode ter gravado a saída como "falhou": o delta traz; se não trouxer, fica a bolha local com "!"
      const antesId = L.ultimoId(A.msgs) || 0;
      A.msgs = A.msgs.filter(m => m.id !== tmp.id);
      await delta();
      if (!A || A.selId !== convId) return;
      const encontrada = A.msgs.find(m => Number(m.id) > antesId && m.direcao === "out" &&
        ((o.path && m.midia && m.midia.path === o.path) || m.status === "falhou" || (envioAmbiguo && m.status === "pendente")));
      if (encontrada && envioAmbiguo && encontrada.status === "pendente") {
        A.msgs = A.msgs.map(m => m.id === encontrada.id ? { ...m, ambigua: true } : m);
      } else if (!encontrada) {
        A.msgs = L.mesclarDelta(A.msgs, [{ ...tmp, status: envioAmbiguo ? "pendente" : "falhou",
          erro: envioAmbiguo ? "Pode ter saído — confira no WhatsApp antes de reenviar." : e?.resposta?.detalhe || A.ui.mensagemErro(e),
          ambigua: envioAmbiguo, falhaLocal: !envioAmbiguo }]);
      }
    } else {
      const dica = L.dicaErroEnvio(codigo) || A.ui.mensagemErro(e);
      A.msgs = A.msgs.map(m => m.id === tmp.id ? { ...m, status: "falhou", erro: dica, falhaLocal: true } : m);
      if (codigo === "fora_da_janela" || codigo === "conversa_resolvida") recarregarVer();
    }
    A.chat.renderMensagens({ rolar: "manter" });
  }
}

const SUBIR_ESPERA_MS = 1500;      // D15: espera antes da nova tentativa automática do PUT
/** PUT com progresso: o fetch não diz quanto já subiu. Rejeita com codigo "upload_falhou" (rede/HTTP) ou "upload_cancelado". */
/** plano 1000b · CB-056: prazo do envio de arquivo — 60 s + 30 s por MB, no máximo 10 min (vídeo de 16 MB em 3G passava dos 180 s). */
export function prazoUpload(bytes) {
  const mb = Math.max(0, Number(bytes) || 0) / 1048576;
  return Math.min(600000, Math.round(60000 + 30000 * mb));
}
export function subirArquivo(url, arquivo, mime, { aoProgresso, registrar } = {}) {   // exportada para o teste (CB-056)
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    const falha = (codigo, texto) => reject(Object.assign(new Error(codigo), { codigo, detalhe_texto: texto }));
    x.open("PUT", url);
    x.setRequestHeader("content-type", mime);
    x.setRequestHeader("x-upsert", "true");
    x.timeout = prazoUpload(arquivo && arquivo.size);   // plano 1000b · CB-056: proporcional ao tamanho (antes 180 s fixos)
    let ultimo = 0;
    x.upload.addEventListener("progress", ev => {
      if (!ev.lengthComputable || !aoProgresso) return;
      const agora = Date.now();
      if (agora - ultimo < 120) return;       // no máximo ~8 atualizações por segundo
      ultimo = agora;
      aoProgresso(ev.loaded, ev.total);
    });
    x.addEventListener("load", () => (x.status >= 200 && x.status < 300 ? resolve() : falha("upload_falhou", `não foi possível subir o arquivo (${x.status})`)));
    // rede: true — a conexão caiu ou o prazo estourou (vale uma nova tentativa sozinha, D15); status HTTP é recusa e não repete
    x.addEventListener("error", () => reject(Object.assign(new Error("upload_falhou"), { codigo: "upload_falhou", detalhe_texto: "a conexão caiu durante o envio", rede: true })));
    x.addEventListener("timeout", () => reject(Object.assign(new Error("upload_falhou"), { codigo: "upload_falhou", detalhe_texto: "o envio demorou demais", rede: true })));
    x.addEventListener("abort", () => falha("upload_cancelado", "envio cancelado"));
    if (registrar) registrar(() => x.abort());
    x.send(arquivo);
  });
}

/** Barra de progresso da bolha local (só se a conversa ainda é a aberta). */
function definirProgresso(tmp, pct, fase, convId) {
  if (!A || A.selId !== convId) return;
  let mudou = false, trocouFase = false;
  A.msgs = A.msgs.map(m => {
    if (m.id !== tmp.id || !m.midia || (m.midia.progresso === pct && m.midia.fase === fase)) return m;
    mudou = true;
    if (m.midia.fase !== fase) trocouFase = true;
    return { ...m, midia: { ...m.midia, progresso: pct, fase } };
  });
  // plano 1000b · CB-140: só a porcentagem mudou → a barra muda no lugar; a fase («Entregando…», sem Cancelar) redesenha a bolha
  if (mudou && (trocouFase || typeof A.chat.pintarProgresso !== "function" || !A.chat.pintarProgresso(tmp.id, pct))) A.chat.renderMensagens({ rolar: "manter" });
}

async function reenviarLocal(m) {
  if (m && m.ref && A.fila.itens.has(m.ref)) {
    const velho = A.fila.itens.get(m.ref);
    if (velho.parada) {
      // ficou PARADA na fila (ninguém a recusou): tenta com o MESMO client_ref — se a primeira tentativa tinha saído, o servidor devolve a mesma mensagem em vez de enviar outra
      if (avisarEsperaReenvio(velho)) return;
      velho.proxima_em = 0;
      return transmitir(velho);
    }
    // falha DEFINITIVA (ou "pode ter saído", depois de a pessoa conferir): "tentar de novo" é uma intenção nova (client_ref novo), senão o servidor devolveria a mesma resposta
    await filaRemover(velho.id);
    A.msgs = A.msgs.filter(x => x.id !== m.id);
    A.chat.renderMensagens({ rolar: "manter" });
    return enviarTexto({ tipo: "texto", texto: velho.texto, reenvio: velho.reenvio || null,
      respondeA: velho.respondeA ? { id: velho.respondeA.id, wamid: velho.respondeA.wamid, direcao: velho.respondeA.direcao } : null });
  }
  if (!m || !m.pedido) return;
  A.msgs = A.msgs.map(x => x.id === m.id ? { ...x, status: "pendente", erro: null, falhaLocal: false, ambigua: false, andamento: 0, ...(x.midia && x.midia.local_url ? { midia: { ...x.midia, progresso: 0, fase: x.pedido && x.pedido.path ? "entregando" : "subindo" } } : {}) } : x);
  A.chat.renderMensagens({ rolar: "manter" });
  await enviarPedido(m, m.pedido);
}

/** «Tentar de novo» de uma falha que o SERVIDOR gravou: pede o reenvio da própria mensagem (ação "reenviar" do nx-enviar). O texto gravado já
    saiu assinado e o servidor não assina de novo — mandar como texto novo repetiria a assinatura. Passa pela fila como qualquer texto. */
async function reenviarGravada(m) {
  if (!A || !m || !m.id || !m.corpo || !A.ver || !A.ver.conversa || A.reenviadas.has(m.id)) return;
  A.reenviadas.add(m.id);                 // o botão da bolha antiga some: um toque só
  // o servidor reenvia na conversa DA MENSAGEM: falha de um atendimento anterior (já resolvido) vai como texto novo no atendimento aberto
  const daAberta = m.conversa_id == null || Number(m.conversa_id) === Number(A.ver.conversa.id);
  if (daAberta) return enviarTexto({ tipo: "texto", texto: m.corpo, reenvio: Number(m.id) });
  // texto novo: tira a assinatura «*Nome:*» que o servidor já tinha gravado, para não sair assinada duas vezes
  return enviarTexto({ tipo: "texto", texto: String(m.corpo).replace(/^\*[^*\n]+:\*\n/, ""), reenvio: null });
}

/* ============================================================ fila de saída (M36)
   Todo texto passa por aqui: grava no IndexedDB (orbita-fila) ANTES de falar com o servidor, envia com o client_ref da intenção e só apaga
   quando o servidor confirma. Offline, timeout ou 5xx deixam o item na fila e a MESMA mensagem é repetida com o MESMO client_ref
   (o servidor devolve a que já gravou: nunca sai em dobro). Falha definitiva (janela fechada, conversa resolvida…) vira "Não enviada"
   com o motivo e o texto continua guardado até a pessoa tentar de novo ou descartar. Roda enquanto Conversas está aberta.
   Três travas contra o envio em dobro e fora de hora (regras puras em cv-logica.js):
   - a hora de cada pedido (enviada_em) é gravada ANTES de ele sair, e o mesmo item nunca é retransmitido antes de 90 s — nem com «Enviar
     agora», nem ao remontar a tela, nem quando a internet volta (o primeiro pedido ainda pode estar a caminho);
   - item parado há mais de 15 min não sai sozinho: vira "Não enviada · Ficou na fila desde…" e a pessoa decide;
   - resposta "pode ter saído" sem mensagem gravada fica na tela com o aviso e nunca é reenviada sozinha.
   Item de outra conta ou de outra empresa nunca é tocado: fica guardado para quem o escreveu. */
const DB_FILA = "orbita-fila", ST_FILA = "saida";
const FILA_PRAZO_ABRIR_MS = 1500;      // há navegador em que o IndexedDB nunca responde: o chat não espera mais que isto por ele
const reqIdb = req => new Promise((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });
function abrirFila() {
  return new Promise((ok, no) => {
    let r;
    try { r = indexedDB.open(DB_FILA, 1); } catch (e) { return no(e); }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST_FILA)) r.result.createObjectStore(ST_FILA, { keyPath: "id" }); };
    r.onsuccess = () => {
      const db = r.result;
      // o shell apaga este banco no Sair (deleteDatabase): sem fechar aqui o pedido fica bloqueado e todo open() seguinte espera atrás dele
      db.onversionchange = () => { try { db.close(); } catch { /* ok */ } };
      ok(db);
    };
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error("fila_bloqueada"));
  });
}
const lojaFila = (db, modo) => db.transaction(ST_FILA, modo).objectStore(ST_FILA);
const serializarItem = it => ({ id: it.id, conta: it.conta, cliente: it.cliente, conversa: it.conversa, texto: it.texto, respondeA: it.respondeA || null,
  criada_em: it.criada_em, tentativas: it.tentativas || 0, proxima_em: it.proxima_em || 0, enviada_em: it.enviada_em || 0,
  estado: it.estado === "enviando" ? "fila" : it.estado, motivo: it.motivo || null, para: it.para || null, parada: !!it.parada, reenvio: it.reenvio || null });

/** Abre o banco da fila e lê o que está guardado, com prazo: passou de 1,5 s, a tela segue sem fila persistente (o envio continua funcionando na aba). */
function lerFilaGuardada(fila) {
  const lido = (async () => { const db = await abrirFila(); return { db, itens: await reqIdb(lojaFila(db, "readonly").getAll()) }; })();
  return new Promise((ok, no) => {
    let desistiu = false;
    const t = setTimeout(() => { desistiu = true; no(new Error("fila_lenta")); }, FILA_PRAZO_ABRIR_MS);
    lido.then(r => {
      clearTimeout(t);
      if (desistiu) { try { r.db.close(); } catch { /* ok */ } return; }     // abriu depois do prazo: ninguém vai usar
      fila.db = r.db; ok(r.itens);
    }, e => { clearTimeout(t); no(e); });
  });
}

async function filaIniciar() {
  if (!A) return;
  const fila = A.fila;
  const conta = A.ctx.sessao && A.ctx.sessao.conta && A.ctx.sessao.conta.id, cliente = A.ctx.cliente && A.ctx.cliente.id;
  let guardados = [];
  try { guardados = await lerFilaGuardada(fila); }
  catch { fila.db = null; }       // janela anônima/Safari sem IndexedDB (ou banco que não respondeu a tempo): a fila vale só nesta aba (o envio continua funcionando)
  if (!A || A.fila !== fila) return;
  const agora = Date.now();
  const paradas = [];
  for (const it of guardados || []) {
    const destino = A.L.filaDestino(it, { conta, cliente, agora });
    if (destino === "pular") continue;       // de outra conta ou de outra empresa: fica guardado para quem o escreveu (nunca se apaga o que é de outro escopo)
    if (destino === "apagar") { if (fila.db) reqIdb(lojaFila(fila.db, "readwrite").delete(it.id)).catch(() => {}); continue; }
    if (it.estado === "falhou" || it.estado === "ambigua") { fila.itens.set(it.id, { ...it }); continue; }     // esperam a pessoa: nunca saem sozinhos
    if (A.L.filaParada(it, agora)) {         // parada há mais de 15 min: não sai sozinha (nada de mensagem de sexta chegando na segunda)
      const parado = { ...it, estado: "falhou", parada: true, motivo: A.L.motivoFilaParada(it.criada_em, new Date(agora)) };
      paradas.push(parado);
      filaSalvar(parado);
      continue;
    }
    // o que estava a caminho quando a aba fechou volta a ser tentado com o MESMO client_ref (o servidor devolve a mensagem se ela já tinha
    // saído) — mas só 90 s depois do último pedido (filaDevidos): recarregar a página não pode repetir um envio que ainda está a caminho
    fila.itens.set(it.id, { ...it, estado: it.enviada_em ? "incerto" : "fila", proxima_em: 0 });
  }
  // plano 1000 · CA-127: mensagens de OUTRA conta/empresa guardadas neste navegador (ninguém as via) — o admin fica sabendo e pode apagar;
  // passados 7 dias elas saem sozinhas (filaDestino)
  const deOutros = (guardados || []).filter(it => it && it.id && conta && cliente && (it.conta !== conta || it.cliente !== cliente) && A.L.filaDestino(it, { conta, cliente, agora }) === "pular");
  if (deOutros.length && A.L.pode(A.ctx.papel, "admin")) {
    const n = deOutros.length;
    const t = A.ui.toast(`${n} ${n === 1 ? "mensagem de outra conta guardada" : "mensagens de outra conta guardadas"} neste navegador, esperando quem as escreveu entrar.`, { tipo: "info", ms: 12000 });
    try {
      const b = A.ui.h("button", { type: "button", class: "toast-acao", on: { click: async () => {
        try { t.fechar(); } catch { /* ok */ }
        // plano 1000b · CB-113: apagar o texto de outra pessoa pede confirmação (antes: um toque e sumia)
        const E = A;
        const ok = E && await E.ui.confirmar({ titulo: "Apagar mensagens guardadas", perigo: true, rotulo: "Apagar",
          texto: `Apagar ${n} ${n === 1 ? "mensagem que ainda não saiu" : "mensagens que ainda não saíram"}? Quem escreveu perde o texto.` });
        if (!ok || A !== E) return;
        if (fila.db) for (const it of deOutros) reqIdb(lojaFila(fila.db, "readwrite").delete(it.id)).catch(() => {});
        A && A.ui.toast(`${n} ${n === 1 ? "mensagem apagada" : "mensagens apagadas"} deste navegador.`, { tipo: "ok" });
      } } }, "Apagar");
      if (t && t.el) t.el.insertBefore(b, t.el.querySelector(".toast-x"));
    } catch { /* sem o botão o aviso continua valendo */ }
  }
  if (paradas.length) {
    const p = paradas[0];
    toastAbrir(A.ui, A.ctx, paradas.length === 1
      ? `Uma mensagem para ${p.para || "um contato"} ficou na fila e não foi enviada. Abra a conversa para enviar de novo ou descartar.`
      : `${paradas.length} mensagens ficaram na fila e não foram enviadas. Abra as conversas marcadas na lista para enviar de novo ou descartar.`, p.conversa);
  }
  if (typeof A.ctx.naoAtualizar === "function") A.limpar.push(A.ctx.naoAtualizar(() => filaPendentes() > 0));
  A.timers.push(setInterval(() => { esvaziarFila(); }, 20000));
  if (A.ctx.rede && typeof A.ctx.rede.aoVoltar === "function") A.limpar.push(A.ctx.rede.aoVoltar(() => esvaziarFila({ forcar: true })));
  const aoOnline = () => esvaziarFila({ forcar: true });
  window.addEventListener("orbita:online", aoOnline);
  A.limpar.push(() => window.removeEventListener("orbita:online", aoOnline));
  filaNaLista();
  esvaziarFila();
}
const ESPERA_PESSOA = new Set(["falhou", "ambigua"]);      // não saem sozinhos: a pessoa decide
const filaPendentes = () => (A ? [...A.fila.itens.values()].filter(x => !ESPERA_PESSOA.has(x.estado)).length : 0);
const filaDaConversa = id => (A ? [...A.fila.itens.values()].filter(x => x.conversa === id).sort((a, b) => a.criada_em - b.criada_em) : []);
/** Marca da linha da lista: "falhou" (há mensagem não enviada ou em dúvida nesta conversa), "pendente" (há mensagem esperando na fila) ou null. */
function filaResumo(id) {
  if (!A || !A.fila.itens.size) return null;
  let r = null;
  for (const x of A.fila.itens.values()) {
    if (x.conversa !== id) continue;
    if (ESPERA_PESSOA.has(x.estado)) return "falhou";
    if (x.estado !== "enviando") r = "pendente";       // o envio normal (1 s) não pisca na lista
  }
  return r;
}
/** A fila mudou: a marca da linha da lista acompanha. */
function filaNaLista() { if (A && A.lista && A.lista.el.isConnected) A.lista.render(); }

/** plano 1000b · CB-129: sem IndexedDB (janela anônima, Safari, banco lento) a fila vale só nesta aba — a 1ª mensagem que volta para a
    fila (falha de rede/servidor) avisa, uma vez por sessão (antes: silêncio, e a mensagem sumia se a aba fechasse). */
let _avisouFilaVolatil = false;
function avisarFilaVolatil() {
  if (_avisouFilaVolatil || !A) return;
  _avisouFilaVolatil = true;
  try { if (sessionStorage.getItem("nx-cv-fila-volatil")) return; sessionStorage.setItem("nx-cv-fila-volatil", "1"); } catch { /* sem storage: vale a variável */ }
  A.ui.toast("Neste navegador as mensagens na fila não ficam guardadas: se a aba fechar antes de saírem, elas se perdem.", { tipo: "info", ms: 9000 });
}
async function filaSalvar(it) {
  if (!A) return false;
  A.fila.itens.set(it.id, it);
  if (!A.fila.db) return false;
  try { await reqIdb(lojaFila(A.fila.db, "readwrite").put(serializarItem(it))); return true; }
  catch { if (A) A.fila.db = null; return false; }
}
async function filaRemover(id) {
  if (!A) return;
  A.fila.itens.delete(id);
  filaNaLista();
  if (A.fila.db) { try { await reqIdb(lojaFila(A.fila.db, "readwrite").delete(id)); } catch { /* a limpeza das 7 dias pega */ } }
}
/** A pessoa saiu de Conversas com o pedido a caminho: guarda (ou apaga) o item direto no banco da fila, sem a tela. Melhor esforço. */
function filaSemTela(fila, it, apagar = false) {
  if (!fila || !fila.db) return;
  try { const loja = lojaFila(fila.db, "readwrite"); if (apagar) loja.delete(it.id); else loja.put(serializarItem(it)); } catch { /* ok */ }
}

/** Aviso de erro com o atalho «Abrir» para a conversa (o toast do shell só traz «Desfazer»: o botão entra aqui, antes do X). */
function toastAbrir(ui, ctx, texto, conversaId) {
  const t = ui.toast(texto, { tipo: "erro", ms: 12000 });
  try {
    const b = ui.h("button", { type: "button", class: "toast-acao", on: { click: () => { t.fechar(); ctx.navegar(`#/conversas/${conversaId}`); } } }, "Abrir");
    t.el.insertBefore(b, t.el.querySelector(".toast-x"));
  } catch { /* sem o botão o aviso continua valendo */ }
  return t;
}
/** Texto que falhou (ou ficou em dúvida) numa conversa que NÃO está aberta: ninguém veria a bolha, então avisa com o nome e o «Abrir». */
function avisarFalhaFora(it, motivo, { ui = A && A.ui, ctx = A && A.ctx } = {}) {
  if (!ui || !ctx || (A && A.selId === it.conversa)) return;
  const nome = it.para || "um contato";
  toastAbrir(ui, ctx, it.estado === "ambigua"
    ? `A mensagem para ${nome} pode ter saído — confira no WhatsApp antes de reenviar.`
    : `Mensagem para ${nome} não foi enviada: ${motivo || it.motivo || "o canal não aceitou a mensagem."}`, it.conversa);
}

/** A bolha local de um item da fila (◷ + "Na fila", "tentando de novo" ou "Não enviada"). */
function bolhaDeItem(it) {
  const b = A.L.mensagemOtimista({ conversaId: it.conversa, corpo: it.texto, eu: { id: A.eu.id, nome: A.eu.nome }, agora: new Date(it.criada_em),
    respondeA: it.respondeA ? { id: it.respondeA.id, direcao: it.respondeA.direcao, resumo: it.respondeA.resumo } : null });
  b.ref = it.id;
  b.pedido = { tipo: "texto", texto: it.texto, clientRef: it.id };
  return aplicarEstado(b, it);
}
function aplicarEstado(b, it) {
  const falhou = it.estado === "falhou", ambigua = it.estado === "ambigua", espera = it.estado === "fila" || it.estado === "incerto";
  // "ambigua": pode ter saído e o servidor não tem a mensagem gravada — a bolha fica com o aviso e os botões, e nunca é reenviada sozinha
  return Object.assign(b, { filaEstado: it.estado, status: falhou ? "falhou" : "pendente", falhaLocal: falhou, ambigua,
    filaProxima: espera ? A.L.proximaSaidaFila(it) : 0,
    erro: falhou ? (it.motivo || "A mensagem não foi enviada.") : ambigua ? (it.motivo || "Pode ter saído — confira no WhatsApp antes de reenviar.") : espera ? (it.motivo || null) : null });
}
function atualizarBolha(it) {
  if (!A) return;
  filaNaLista();
  if (A.selId !== it.conversa) return;
  let mudou = false;
  A.msgs = A.msgs.map(m => { if (m.ref !== it.id) return m; mudou = true; return aplicarEstado({ ...m }, it); });
  if (mudou) A.chat.renderMensagens({ rolar: "manter" });
}
function concluirBolha(it, msg) {
  const L = A.L;
  A.msgs = A.msgs.filter(m => m.ref !== it.id);
  if (A.selId === it.conversa) {
    if (msg && msg.id) { A.msgs = L.mesclarDelta(A.msgs, [msg]); A.ultimoId = L.ultimoId(A.msgs, A.ultimoId); }
    A.chat.renderMensagens({ rolar: "fim" });
    delta();
    // plano 1000 · CA-246: o leitor de tela fica sabendo que saiu (o ✓ sozinho não é anunciado)
    if (msg && msg.id && !msg.ambigua && msg.status !== "falhou") A.ui.anunciar("Mensagem enviada.");
  }
  carregarLista({});
}

/** Texto novo: grava na fila, mostra a bolha e manda (se houver rede). Resolve quando o item está GUARDADO (não quando o servidor responde). */
async function enviarTexto(o) {
  const L = A.L, conv = A.ver.conversa;
  const it = { id: o.clientRef || L.novoClientRef(globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : null),
    conta: A.ctx.sessao.conta.id, cliente: A.ctx.cliente.id, conversa: conv.id, texto: o.texto,
    respondeA: o.respondeA ? { id: o.respondeA.id, wamid: o.respondeA.wamid || null, direcao: o.respondeA.direcao, resumo: L.resumoMensagem(o.respondeA, 100) } : null,
    criada_em: Date.now(), tentativas: 0, proxima_em: 0, enviada_em: 0, estado: "fila", motivo: null,
    para: nomeContato(A.ver.contato || conv.contato) || null,      // para o aviso «Mensagem para Mariana não foi enviada» quando a conversa já não é a aberta
    reenvio: o.reenvio || null };                                    // «Tentar de novo» de uma falha gravada pelo servidor: id da mensagem a reenviar
  let persistido = await filaSalvar(it);
  A.msgs = L.mesclarDelta(A.msgs, [bolhaDeItem(it)]);
  A.chat.renderMensagens({ rolar: "fim" });
  const offline = A.ctx.rede ? A.ctx.rede.estado === "offline" : (typeof navigator !== "undefined" && navigator.onLine === false);
  if (offline) {
    it.motivo = "Sem internet: a mensagem espera na fila.";
    it.proxima_em = Date.now() + 20000;
    persistido = (await filaSalvar(it)) || persistido;
    if (!persistido) {
      await filaRemover(it.id);          // sai também da fila em memória: senão a mensagem «não guardada» é enviada sozinha quando a rede volta
      A.msgs = A.msgs.filter(m => m.ref !== it.id);
      A.chat.renderMensagens({ rolar: "manter" });
      if (A.composer && A.selId === it.conversa && typeof A.composer.devolverTexto === "function") A.composer.devolverTexto(it.texto);
      A.ui.toast("Sem conexão: não foi possível guardar a mensagem neste aparelho. O texto continua no campo; tente novamente.", { tipo: "erro", ms: 9000 });
      return { persistido: false };
    }
    atualizarBolha(it);
    A.ui.anunciar("Sem internet: a mensagem ficou na fila e sai quando a conexão voltar.");   // CA-246
  }
  else transmitir(it);          // sem await: a tela não espera o servidor
  return { persistido };
}

/** Uma tentativa de envio. Devolve "ok" | "rede" (parar e tentar depois) | "espera" (o último pedido deste item saiu há menos de 90 s) | "definitiva". */
async function transmitir(it) {
  const L = A.L;
  if (A.fila.emVoo.has(it.id)) return "ok";
  // NUNCA antes de 90 s do último pedido do mesmo item (nem «Enviar agora», nem remontar a tela, nem a internet voltar): o primeiro ainda pode estar a caminho
  if (L.esperaReenvioFila(it) > 0) return "espera";
  const fila = A.fila, ui = A.ui, ctx = A.ctx;      // seguem valendo se a pessoa sair de Conversas com o pedido a caminho
  // D19: duas abas abertas leem a mesma fila do IndexedDB — só a que pegar a trava do item (Web Locks) transmite; sem a API, o que está
  // GUARDADO decide (outra aba já concluiu ou pediu há menos de 90 s)
  const travas = typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function" ? navigator.locks : null;
  if (travas) {
    fila.emVoo.add(it.id);
    try {
      return await travas.request(`orbita-fila:${it.id}`, { ifAvailable: true }, async trava => {
        if (!trava) return "espera";                                // outra aba está mandando este item agora
        const conferido = await conferirGuardado(fila, it);
        if (conferido !== "ok") return conferido;
        return await transmitirAgora(it, { L, fila, ui, ctx, comTrava: true });
      });
    } catch { return "espera"; }
    finally { fila.emVoo.delete(it.id); if (A && A.fila !== fila) A.fila.emVoo.delete(it.id); }
  }
  const conferido = await conferirGuardado(fila, it);
  if (conferido !== "ok") return conferido;
  return transmitirAgora(it, { L, fila, ui, ctx });
}
/** D19: o item ainda é para sair daqui? "ok" | "espera" (outra aba pediu agora) | "ok" sem banco. Sumiu do banco: outra aba concluiu — a bolha sai. */
async function conferirGuardado(fila, it) {
  if (!fila.db) return "ok";
  let guardado;
  try { guardado = await reqIdb(lojaFila(fila.db, "readonly").get(it.id)); } catch { return "ok"; }
  const d = A ? A.L.filaConferirGuardado(guardado, it, Date.now()) : "ok";
  if (d === "ok") return "ok";
  if (d === "sumiu" && A && A.fila === fila) {
    fila.itens.delete(it.id);
    A.msgs = A.msgs.filter(m => m.ref !== it.id);
    if (A.selId === it.conversa) { A.chat.renderMensagens({ rolar: "manter" }); delta(); }
    filaNaLista();
  } else if (d === "outra_aba" && guardado && A && A.fila === fila) {
    Object.assign(it, { enviada_em: guardado.enviada_em || it.enviada_em, estado: guardado.estado === "enviando" ? "incerto" : guardado.estado, motivo: guardado.motivo || it.motivo });
    atualizarBolha(it);
  }
  return "espera";
}
async function transmitirAgora(it, { L, fila, ui, ctx, comTrava = false }) {
  if (!comTrava) fila.emVoo.add(it.id);
  try {
    it.estado = "enviando"; it.motivo = null; it.enviada_em = Date.now();
    atualizarBolha(it);
    await filaSalvar(it);                           // a hora do pedido fica guardada ANTES de ele sair: recarregar a página não o repete na hora
    if (!A) return "rede";
    let r;
    try {
      r = await A.api.fn("nx-enviar", it.reenvio
        ? { acao: "reenviar", mensagem: it.reenvio, client_ref: it.id }      // falha gravada pelo servidor: ele reenvia o texto gravado, sem assinar de novo
        : { acao: "texto", conversa: it.conversa, texto: it.texto, client_ref: it.id,
          responde_a: it.respondeA && it.respondeA.wamid ? it.respondeA.wamid : undefined });
    } catch (e) {
      return await falhaDeEnvio(it, e, { L, fila, ui, ctx });      // só o pedido cai aqui: um erro de tela DEPOIS da confirmação nunca vira "Não enviada"
    }
    const msg = r && r.mensagem ? { ...r.mensagem, ...(r.ambigua === true ? { ambigua: true } : {}) } : null;
    const duvida = msg && msg.ambigua ? { ...it, estado: "ambigua" } : null;      // o servidor gravou, mas não sabe se o aparelho enviou
    if (!A) {                                       // saiu de Conversas: o item confirmado não fica para ser reenviado na volta
      filaSemTela(fila, it, true);
      if (duvida) avisarFalhaFora(duvida, "", { ui, ctx });
      return "ok";
    }
    await filaRemover(it.id);
    concluirBolha(it, msg);
    if (duvida) avisarFalhaFora(duvida);
    return "ok";
  } finally { if (!comTrava) { fila.emVoo.delete(it.id); if (A && A.fila !== fila) A.fila.emVoo.delete(it.id); } }
}

/** O pedido de envio falhou: decide o destino do item (volta à fila, "Não enviada", "pode ter saído") e avisa quem não está vendo a bolha. */
async function falhaDeEnvio(it, e, { L, fila, ui, ctx }) {
  const c = L.classificarFalhaEnvio(e);
  // definitiva com a saída GRAVADA pelo servidor ("falhou"/"pendente", com o motivo): mostra a do servidor e libera o item
  const salva = c.tipo === "definitiva" && e && e.resposta && e.resposta.mensagem && e.resposta.mensagem.id ? e.resposta.mensagem : null;
  if (salva) {
    const motivo = (e.resposta && typeof e.resposta.detalhe === "string" && e.resposta.detalhe) || salva.erro || c.motivo || "";
    it.estado = c.ambigua ? "ambigua" : "falhou";
    if (!A) { filaSemTela(fila, it, true); avisarFalhaFora(it, motivo, { ui, ctx }); return "definitiva"; }
    await filaRemover(it.id);
    concluirBolha(it, { ...salva, ...(c.ambigua ? { ambigua: true } : {}) });
    avisarFalhaFora(it, motivo);
    return "definitiva";
  }
  // o que fazer com o item é regra pura (cv-logica.js): rede/sessão voltam à fila com backoff; 409 "em andamento" pergunta de novo em ~20 s sem
  // contar como falha; "pode ter saído" SEM mensagem gravada e falha definitiva ficam guardadas com o aviso e nunca saem sozinhas (fim)
  const p = L.aposFalhaFila(it, c, { agora: Date.now(), jitter: Math.floor(Math.random() * 3000), textoErro: ui.mensagemErro(e) });
  Object.assign(it, p.campos);
  if (!A) { filaSemTela(fila, it); if (p.fim) avisarFalhaFora(it, it.motivo, { ui, ctx }); return p.fim ? "definitiva" : "rede"; }
  await filaSalvar(it); atualizarBolha(it);
  if (!p.fim && A && !A.fila.db) avisarFilaVolatil();   // plano 1000b · CB-129
  // "em andamento": pergunta de novo logo que o prazo vence, sem esperar o próximo tique de 20 s da fila (que pode cair quase 20 s depois)
  if (it.estado === "andamento") setTimeout(() => { if (A) esvaziarFila(); }, L.FILA_EM_ANDAMENTO_MS + 250);
  if (!p.fim) return "rede";
  avisarFalhaFora(it, it.motivo);
  if (c.codigo === "fora_da_janela" || c.codigo === "conversa_resolvida") recarregarVer();
  return "definitiva";
}

/** Item parado há mais de 15 min: deixa de sair sozinho e vira "Não enviada · Ficou na fila desde…" (Tentar de novo usa o MESMO client_ref). */
async function filaParar(it, agora = Date.now()) {
  it.estado = "falhou"; it.parada = true; it.motivo = A.L.motivoFilaParada(it.criada_em, new Date(agora));
  await filaSalvar(it); atualizarBolha(it);
  avisarFalhaFora(it, it.motivo);
}

/** Esvazia a fila em ordem: no online, no 1º pulso bom e a cada 20 s (com o backoff de cada item). Para na 1ª falha de rede (a ordem importa). */
async function esvaziarFila({ forcar = false } = {}) {
  if (!A || A.fila.rodando || !A.fila.itens.size) return;
  const fila = A.fila;
  fila.rodando = true;
  try {
    const agora = Date.now();
    for (const it of [...fila.itens.values()]) {
      if (!A) return;
      if (A.L.filaParada(it, agora) && !fila.emVoo.has(it.id)) await filaParar(it, agora);
    }
    if (!A) return;
    for (const it of A.L.filaDevidos([...fila.itens.values()], Date.now(), { forcar })) {
      if (!A) return;
      if (await transmitir(it) === "rede") break;
    }
  } finally { fila.rodando = false; }
}

/** "Cancelar" numa bolha da fila: o texto volta para o campo (nada se perde) e o item sai. */
async function cancelarFila(m) {
  if (!A || !m || !m.ref) return;
  const it = A.fila.itens.get(m.ref);
  if (!it) return;
  // plano 1000b · CB-114: em voo não dá para cancelar — antes saía calado
  if (A.fila.emVoo.has(it.id)) { A.ui.toast("Já está saindo; se falhar, o texto volta para o campo.", { tipo: "info" }); return; }
  await filaRemover(it.id);
  A.msgs = A.msgs.filter(x => x.ref !== it.id);
  A.chat.renderMensagens({ rolar: "manter" });
  if (A.composer && A.selId === it.conversa && typeof A.composer.devolverTexto === "function") A.composer.devolverTexto(it.texto);
  A.ui.toast("Envio cancelado. O texto voltou para o campo.", { tipo: "info" });
}
/** "Enviar agora": tenta já, sem esperar o backoff — mas nunca antes de 90 s do último pedido (ele ainda pode estar a caminho). */
async function enviarAgora(m) {
  if (!A || !m || !m.ref) return;
  const it = A.fila.itens.get(m.ref);
  if (!it) return;
  if (avisarEsperaReenvio(it)) return;
  it.proxima_em = 0;
  await transmitir(it);
}
/** Dentro dos 90 s do último pedido: explica a espera (true) em vez de arriscar a mensagem em dobro. */
function avisarEsperaReenvio(it) {
  const falta = A.L.esperaReenvioFila(it);
  if (!(falta > 0)) return false;
  A.ui.toast(`A última tentativa ainda pode estar a caminho. Para a mensagem não sair em dobro, a próxima só pode sair em ${Math.ceil(falta / 1000)} s.`, { tipo: "info" });
  return true;
}

/* ============================================================ nova conversa */
async function novaConversa({ contato = null, telefone: telIni = null, nome: nomeIni = null } = {}) {
  const ui = A.ui, L = A.L;
  const canais = (A.base.canais || []);
  if (!A.podeEscrever) { ui.toast("Seu acesso é só de leitura.", { tipo: "info" }); return; }
  if (!canais.length) {
    ui.toast(A.L.pode(A.ctx.papel, "admin") ? "Conecte um número de WhatsApp primeiro (Configurações → Números)." : "Peça ao administrador para conectar o WhatsApp.", { tipo: "info" });
    return;
  }
  let modo = contato ? "contato" : "buscar";
  let escolhido = contato && contato.id ? contato : null;
  const sCanal = ui.h("select", { class: "sel", id: "cv-nv-canal" },
    // plano 1000b · CB-045: o rótulo diz o estado de verdade («com erro», «configurando», «desconectado»), não «não verificado» para tudo
    canais.map(c => { const est = estadoNovaConversa(c); return ui.h("option", { value: c.id }, `${c.nome}${c.numero_exibicao ? ` · ${c.numero_exibicao}` : ""}${est ? ` (${est})` : ""}`); }));
  // plano 1000b · CB-044: começa num número que funciona; escolher um caído mostra o aviso (a 1ª mensagem não sairia)
  const preferido = canais.find(c => !estadoNovaConversa(c)) || canais[0];
  sCanal.value = String(preferido.id);
  const avisoCaido = ui.h("p", { class: "aviso aviso-aten cv-nv-caido", role: "status", hidden: true });
  const pintarCaido = () => {
    const k = canais.length > 1 ? canais.find(c => String(c.id) === String(sCanal.value)) : canais[0];
    const est = k ? estadoNovaConversa(k) : "";
    avisoCaido.textContent = est ? `O número ${k.nome} está ${est}: a conversa abre, mas a primeira mensagem só sai depois que ele voltar.` : "";
    avisoCaido.hidden = !est;
  };
  const campoCanal = canais.length > 1 ? ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-canal" }, "Enviar pelo número"), sCanal) : null;

  const bBuscar = ui.h("button", { type: "button", "aria-pressed": "true" }, "Contato cadastrado");
  const bDigitar = ui.h("button", { type: "button", "aria-pressed": "false" }, "Digitar telefone");
  const alterna = ui.h("div", { class: "cv-alterna", role: "group", "aria-label": "Como escolher o contato" }, bBuscar, bDigitar);

  const busca = ui.h("input", { type: "search", id: "cv-nv-busca", placeholder: "Nome ou telefone", autocomplete: "off" });
  // plano 1000 · CA-057: lista de verdade (<ul><li><button aria-pressed>): o botão continua botão para o leitor de tela
  // CA-114: sem aria-live no container (cada busca lia os 8 nomes inteiros) — um status à parte diz só quantos vieram
  const resultados = ui.h("div", { class: "cv-busca-contato" });
  const statusBusca = ui.h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const blocoBusca = ui.h("div", { class: "pilha-p" },
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-busca" }, A.ctx.vocab.contato || "Contato"), busca), statusBusca, resultados);
  const tel = ui.h("input", { type: "tel", id: "cv-nv-tel", placeholder: "(12) 99999-9999", inputmode: "tel", autocomplete: "off", "aria-describedby": "cv-nv-tel-ajuda" });
  const nome = ui.h("input", { type: "text", id: "cv-nv-nome", placeholder: "Opcional", maxlength: 160, autocomplete: "off" });
  // D13: máscara enquanto digita (só número do Brasil; «+» fica como foi digitado) e o erro no próprio campo ao sair dele
  const telErro = ui.h("small", { class: "campo-erro cv-nv-tel-erro", id: "cv-nv-tel-erro", role: "alert", hidden: true });
  let telTocado = false;
  const mostrarErroTel = () => {
    const msg = telTocado ? L.erroTelefone(tel.value) : "";
    telErro.textContent = msg; telErro.hidden = !msg;
    if (msg) { tel.setAttribute("aria-invalid", "true"); tel.setAttribute("aria-describedby", "cv-nv-tel-erro cv-nv-tel-ajuda"); }
    else { tel.removeAttribute("aria-invalid"); tel.setAttribute("aria-describedby", "cv-nv-tel-ajuda"); }
    return msg;
  };
  tel.addEventListener("input", () => {
    const fim = tel.selectionStart == null || tel.selectionStart >= String(tel.value).length;   // só mexe com o cursor no fim (não pula o cursor)
    if (fim) { const m = L.mascaraTelefone(tel.value); if (m !== tel.value) tel.value = m; }
    if (telTocado) mostrarErroTel();
  });
  tel.addEventListener("blur", () => { if (String(tel.value).trim()) { telTocado = true; tel.value = L.mascaraTelefone(tel.value); } mostrarErroTel(); });
  const blocoDigitar = ui.h("div", { class: "pilha-p", hidden: true },
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-tel" }, "Telefone com DDD"), tel, telErro,
      ui.h("small", { class: "campo-ajuda", id: "cv-nv-tel-ajuda" }, "Número do Brasil ganha o 55 sozinho. Outro país: comece com + e o código dele (ex.: +1 415 555 1234).")),
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-nome" }, "Nome"), nome));
  const blocoEscolhido = ui.h("div", { class: "aviso", hidden: true });

  function desenharEscolhido() {
    ui.limpar(blocoEscolhido);
    blocoEscolhido.hidden = !escolhido;
    if (!escolhido) return;
    blocoEscolhido.append(ui.icone("contato"), ui.h("div", null,
      ui.h("b", null, nomeContato(escolhido)), escolhido.telefone ? ui.h("div", { class: "mono" }, ui.telBR(escolhido.telefone)) : null));
  }
  function trocarModo(m) {
    modo = m;
    bBuscar.setAttribute("aria-pressed", String(m !== "digitar"));
    bDigitar.setAttribute("aria-pressed", String(m === "digitar"));
    blocoBusca.hidden = m === "digitar" || m === "contato";
    blocoDigitar.hidden = m !== "digitar";
    setTimeout(() => (m === "digitar" ? tel : busca).focus(), 30);
  }
  bBuscar.addEventListener("click", () => { escolhido = null; desenharEscolhido(); trocarModo("buscar"); });
  bDigitar.addEventListener("click", () => { escolhido = null; desenharEscolhido(); trocarModo("digitar"); });

  let seq = 0;
  const POR_PAGINA = 8;
  /** Um contato da busca: o telefone completo ao lado do nome (homônimos «Maria» se distinguem — CA-238). */
  const opcaoContato = c => {
    const b = ui.h("button", { type: "button", class: "cv-contato-op", "aria-pressed": "false" },
      ui.avatar(c.nome || c.telefone, c.id), ui.h("span", null, ui.h("b", null, nomeContato(c)), ui.h("small", { class: "mono" }, c.telefone ? ui.telBR(c.telefone) : "sem telefone")));
    b.addEventListener("click", () => { escolhido = c; for (const x of resultados.querySelectorAll(".cv-contato-op")) x.setAttribute("aria-pressed", String(x === b)); desenharEscolhido(); });
    return ui.h("li", null, b);
  };
  const procurar = ui.debounce(async () => {
    const q = busca.value.trim();
    const meu = ++seq;
    ui.limpar(resultados);
    statusBusca.textContent = "";
    if (q.length < 2) return;
    resultados.appendChild(ui.h("p", { class: "sub" }, "Procurando…"));
    try {
      const r = await A.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_pagina: 1, p_por_pagina: POR_PAGINA });
      if (meu !== seq) return;
      ui.limpar(resultados);
      const itens = (r && r.itens) || [];
      if (!itens.length) {
        statusBusca.textContent = "Nenhum contato encontrado.";
        resultados.appendChild(ui.h("p", { class: "sub" }, "Ninguém com esse nome ou telefone. "));
        const dig = L.normalizarTelefone(q);
        resultados.appendChild(ui.h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { tel.value = dig ? q : ""; nome.value = dig ? "" : q; trocarModo("digitar"); } } },
          ui.icone("mais"), "Digitar o telefone"));
        return;
      }
      const ul = ui.h("ul", { class: "cv-contato-lista", "aria-label": "Contatos encontrados" });
      const idsMostrados = new Set();   // plano 1000b · CB-046
      for (const c of itens) { if (c && c.id != null) { if (idsMostrados.has(String(c.id))) continue; idsMostrados.add(String(c.id)); } ul.appendChild(opcaoContato(c)); }
      resultados.appendChild(ul);
      const total = Number(r && r.total);
      const contar = () => { const n = ul.children.length; statusBusca.textContent = Number.isFinite(total) && total > n ? `${n} de ${total} contatos encontrados.` : `${n} ${n === 1 ? "contato encontrado" : "contatos encontrados"}.`; };
      contar();
      // CA-238: «Ver mais» traz a página seguinte (antes só os 8 primeiros: homônimos ficavam de fora)
      let pagina = 1;
      const temMais = () => (r && r.tem_mais === true) || (Number.isFinite(total) ? total > ul.children.length : itens.length === POR_PAGINA);
      if (temMais()) {
        const verMais = ui.h("button", { type: "button", class: "bt bt-fant bt-p cv-nv-mais" }, "Ver mais");
        verMais.addEventListener("click", async () => {
          const minha = seq;
          verMais.disabled = true;
          try {
            const r2 = await A.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_pagina: pagina + 1, p_por_pagina: POR_PAGINA });
            if (minha !== seq) return;
            pagina += 1;
            const vistos = new Set([...ul.querySelectorAll(".cv-contato-op")].map(x => x));
            const novos = ((r2 && r2.itens) || []);
            // plano 1000b · CB-046: a lista pode mudar entre as páginas — contato que já está na tela não aparece de novo
            for (const c of novos) { if (c && c.id != null && idsMostrados.has(String(c.id))) continue; if (c && c.id != null) idsMostrados.add(String(c.id)); ul.appendChild(opcaoContato(c)); }
            contar();
            const acabou = !novos.length || (r2 && r2.tem_mais === false) || (Number.isFinite(total) && ul.children.length >= total) || (!(r2 && "tem_mais" in r2) && novos.length < POR_PAGINA);
            if (acabou || (vistos.size === ul.children.length && !(r2 && r2.tem_mais === true))) verMais.remove(); else verMais.disabled = false;
          } catch (e) { verMais.disabled = false; ui.toast(ui.mensagemErro(e), { tipo: "erro" }); }
        });
        resultados.appendChild(verMais);
      }
    } catch (e) {
      if (meu !== seq) return;
      ui.limpar(resultados);
      resultados.appendChild(ui.h("p", { class: "sub" }, `Não deu para procurar agora (${ui.mensagemErro(e)}). Use "Digitar telefone".`));
    }
  }, 280);
  busca.addEventListener("input", procurar);
  // plano 1000b · CB-115: ↓ na busca leva ao 1º contato; ↑↓ andam entre eles (↑ no 1º volta à busca); Enter escolhe (é um botão)
  busca.addEventListener("keydown", ev => {
    if (ev.key !== "ArrowDown") return;
    const op = resultados.querySelector(".cv-contato-op");
    if (op) { ev.preventDefault(); op.focus(); }
  });
  resultados.addEventListener("keydown", ev => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    const ops = [...resultados.querySelectorAll(".cv-contato-op")];
    const i = ops.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    if (ev.key === "ArrowUp" && i === 0) { busca.focus(); return; }
    const j = ev.key === "Home" ? 0 : ev.key === "End" ? ops.length - 1 : Math.max(0, Math.min(ops.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
    ops[j].focus();
  });

  // CA-056: o texto acompanha o número escolhido — Meta explica a janela e os modelos; CodeWords é um WhatsApp comum
  const textoCanal = ui.h("p", { class: "sub cv-nv-regra" });
  const explicarCanal = () => {
    const k = canais.length > 1 ? canais.find(c => String(c.id) === String(sCanal.value)) : canais[0];
    textoCanal.textContent = k && k.provedor === "codewords"
      ? "Este número é um WhatsApp comum (CodeWords): a mensagem sai como texto normal, sem janela de 24 h e sem modelos."
      : "Número da Meta (WhatsApp oficial): se o cliente não falou com a empresa nas últimas 24 h, só vale um modelo aprovado — o seletor de modelos abre em seguida.";
  };
  sCanal.addEventListener("change", explicarCanal);
  sCanal.addEventListener("change", pintarCaido);   // plano 1000b · CB-044
  explicarCanal(); pintarCaido();
  // plano 1000 · CA-155: o contato já tem atendimento aberto por OUTRO número — aviso com «Abrir aquele» antes de criar a segunda conversa
  const avisoOutro = ui.h("div", { class: "aviso aviso-aten cv-nv-outro", role: "status", hidden: true });
  let avisadoOutro = null, apiModal = null;
  const corpo = ui.h("div", { class: "pilha" }, campoCanal, avisoCaido, contato || telIni ? null : alterna, blocoEscolhido, blocoBusca, blocoDigitar, avisoOutro, textoCanal);
  desenharEscolhido();
  if (contato) { blocoBusca.hidden = true; }
  // CA-091 / CA-142: veio de uma busca por telefone (ou de um contato recebido): o número já entra digitado
  if (telIni && !contato) { modo = "digitar"; tel.value = L.mascaraTelefone(String(telIni)); if (nomeIni) nome.value = String(nomeIni); blocoBusca.hidden = true; blocoDigitar.hidden = false; bBuscar.setAttribute("aria-pressed", "false"); bDigitar.setAttribute("aria-pressed", "true"); }

  /** O atendimento aberto deste contato por outro número (nx_contato_ver), ou null. */
  async function abertaEmOutroNumero(contatoId, canalId) {
    try {
      const r = await A.api.rpcC("nx_contato_ver", { p_id: contatoId });
      return ((r && r.conversas) || []).find(c => c && c.status !== "resolvida" && c.canal_id && String(c.canal_id) !== String(canalId)) || null;
    } catch { return null; }
  }

  const item = await ui.modal({
    titulo: "Nova conversa", corpo, largura: "m",
    aoAbrir: api => { apiModal = api; if (!contato && !telIni) setTimeout(() => busca.focus(), 40); else if (telIni) setTimeout(() => nome.focus(), 40); },
    acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Abrir conversa", tipo: "primario", fn: async api => {
      const params = { p_canal: canais.length > 1 ? sCanal.value : canais[0].id };
      if (modo === "digitar") {
        telTocado = true;
        const errTel = mostrarErroTel();
        if (errTel || !L.normalizarTelefone(tel.value)) { api.erro(errTel || "Digite o telefone com DDD (10 ou 11 números)."); tel.focus(); return false; }
        params.p_telefone = tel.value; params.p_nome = nome.value.trim() || null;
      } else {
        if (!escolhido || !escolhido.id) { api.erro("Escolha alguém da lista ou use “Digitar telefone”."); return false; }
        params.p_contato = escolhido.id;
        const chave = `${escolhido.id}:${params.p_canal}`;
        if (avisadoOutro !== chave) {
          const outra = await abertaEmOutroNumero(escolhido.id, params.p_canal);
          if (outra) {
            avisadoOutro = chave;
            const k = canais.find(c => String(c.id) === String(outra.canal_id));
            ui.limpar(avisoOutro);
            avisoOutro.append(ui.icone("info"), ui.h("div", { class: "pilha-p" },
              ui.h("p", null, `Já existe atendimento aberto com ${nomeContato(escolhido)} pelo número ${(k && k.nome) || "de outro canal"}${outra.protocolo ? ` (${outra.protocolo})` : ""}. Abrir aquele?`),
              ui.h("div", { class: "linha" }, ui.h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { const a = apiModal || api; a.fechar({ abrirExistente: outra.id }); } } }, "Abrir aquele atendimento"))));
            avisoOutro.hidden = false;
            api.erro("Para começar outra conversa por este número mesmo assim, toque em «Abrir conversa» de novo.");
            return false;
          }
        }
      }
      try {
        return await A.api.rpcC("nx_cv_nova", params);
      } catch (e) {
        // nx_cv_nova só dá ja_existe_aberta quando a aberta NÃO é visível para quem pediu (está com um colega)
        if (e && e.codigo === "ja_existe_aberta") {
          api.erro("Esse contato já está em atendimento com outra pessoa da equipe neste número. Peça ao supervisor para transferir a conversa para você.");
          return false;
        }
        throw e;
      }
    } }],
  }).catch(e => { tratarErro(e); return null; });
  if (item && item.abrirExistente) { abrir(item.abrirExistente); return; }       // CA-155
  if (!item || !item.id) return;
  await carregarLista({});
  abrir(item.id);
  // sem janela → direto para os modelos (só na Meta; o aparelho do CodeWords não tem janela de 24 h)
  const provedorItem = (item.canal && item.canal.provedor) || ((A.base && A.base.canais) || []).find(c => c.id === item.canal_id)?.provedor || "meta";
  if (L.canalTemJanela(provedorItem) && !L.janela(item).aberta) {
    const espera = async () => {
      for (let i = 0; i < 40 && A && (!A.ver || A.ver.conversa.id !== item.id); i++) await new Promise(r => setTimeout(r, 100));
      if (A && A.ver && A.ver.conversa.id === item.id) A.composer.abrirModelos();
    };
    espera();
  }
}
