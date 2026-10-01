/* ============================================================
   ÓRBITA — conversas.js · frente F5 · ESPEC §7.7 T4 (entrada do módulo)
   Central multiatendente: lista · chat · lateral (negócio, tarefas,
   atendimentos). Tempo real pelo pulso do shell + delta de mensagens
   por cursor duplo (nx_cv_mensagens). Sem import estático: os
   pedaços da tela entram por import() com ?v= (ctx.versao).
   Rotas: #/conversas · #/conversas/<id> · #/conversas?contato=<id>
   ============================================================ */

let A = null;          // estado do módulo (sobrevive às trocas de rota dentro de Conversas)

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
  const [L, mLista, mChat, mComposer, mLateral] = await Promise.all([
    import(`./cv-logica.js?v=${v}`), import(`./cv-lista.js?v=${v}`), import(`./cv-chat.js?v=${v}`),
    import(`./cv-composer.js?v=${v}`), import(`./cv-lateral.js?v=${v}`),
    ctx.ui.carregarCss("conversas"),
  ]);
  const { ui } = ctx;
  A = {
    ctx, ui, api: ctx.api, L, icone: (n, c) => icone(n, c),
    raiz: null, base: null, eu: null, podeEscrever: ctx.pode("atendente"),
    aba: lerPreferencia("aba", "minhas"), filtro: {}, busca: "",
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
  };
  { const daRota = abaDaRota(ctx.rota); if (daRota) A.aba = daRota; }
  if (!A.podeEscrever && A.aba === "minhas") A.aba = "abertas";

  // esqueleto da tela
  A.raiz = ui.h("div", { class: "cv", dataset: { painel: "lista" } });
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
  A.timers.push(setInterval(() => { if (!document.hidden) { A.lista.render(); A.chat.renderCabecalho(); A.composer.atualizar(); } }, 60000));
  A.timers.push(setInterval(() => { if (Date.now() - (A.baseEm || 0) > 5 * 60000) carregarBase().catch(() => {}); }, 60000));

  await listaInicial;
  await aplicarRota(ctx.rota);
}

export function desmontar() {
  if (!A) return;
  A.destruido = true;
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
  const onResize = () => { mostrarPainel(A.painel); ajustarAltura(); posicionarLateral(); };
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
    const r = await A.api.rpcC("nx_cv_listar", { p_filtro: filtroAtual(), p_limite: limite, p_antes: antes });
    if (!A || seq !== A.seqLista) return;
    if (!reset && !mais) {
      avisarNovidades(A.itens, r.itens || [], A.contagens && A.contagens.nao_lidas, r.contagens && r.contagens.nao_lidas);
      // leitor de tela: a lista anuncia a conversa nova (a que está aberta e à vista não: quem a lê já viu)
      const novas = A.L.novasEntradas(A.itens, r.itens || [], { ignorar: A.selId && !document.hidden ? A.selId : null });
      if (novas.length) A.lista.anunciar(A.L.textoNovaMensagem(novas));
    }
    A.itens = itensComPendencia(mais ? [...A.itens, ...(r.itens || []).filter(n => !A.itens.some(x => x.id === n.id))] : (r.itens || []));
    A.temMais = !!r.tem_mais;
    A.contagens = r.contagens || {};
    A.ctx.badge("conversas", A.contagens.nao_lidas || 0);
    A.erroLista = null;
  } catch (e) {
    if (!A || seq !== A.seqLista) return;
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
  try { const p = JSON.parse(localStorage.getItem("nx-cv-avisos") || "{}"); return { som: p.som !== false, tela: p.tela === true }; }
  catch { return { som: true, tela: false }; }
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
  if (!document.hidden || !A) return;
  const mapa = new Map((antes || []).map(x => [x.id, x]));
  const chegaram = (depois || []).filter(c => c.ultima_msg_dir === "in" && !c.oculta
    && (Number(c.nao_lidas) || 0) > (Number((mapa.get(c.id) || {}).nao_lidas) || 0));
  if (!chegaram.length && !(Number(nlDepois) > Number(nlAntes))) return;
  const pref = lerAvisos();
  if (pref.som) tocarSom();
  if (pref.tela && "Notification" in window && Notification.permission === "granted") {
    const c = chegaram[0];
    try {
      const n = new Notification(c ? nomeContato(c.contato) : "Mensagem nova", {
        body: c ? String(c.ultima_msg_resumo || "Mensagem nova").slice(0, 140) : "Chegou mensagem nova na central.",
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
  ]);
}

/** Mudou a aba, a busca ou os filtros. */
function mudarLista({ aba, busca, filtro } = {}) {
  if (aba !== undefined && aba !== A.aba) { A.aba = aba; gravarPreferencia("aba", aba); }
  if (busca !== undefined && busca !== A.busca) { A.busca = busca; buscarMensagens(); }
  if (filtro !== undefined) A.filtro = filtro;
  return carregarLista({ reset: true });
}

/** Busca nas mensagens (P0-B): com 3+ letras, junto da busca por nome/telefone/protocolo. */
async function buscarMensagens() {
  if (!A) return;
  const q = (A.busca || "").trim();
  const seq = ++A.seqMsgs;
  if (q.length < 3) { A.buscaMsgs = null; return; }
  A.buscaMsgs = { q, carregando: true, itens: [], erro: null };
  try {
    const r = await A.api.rpcC("nx_cv_buscar_msgs", { p_q: q, p_limite: 20 });
    if (!A || seq !== A.seqMsgs) return;
    A.buscaMsgs = { q, carregando: false, itens: Array.isArray(r) ? r : [], erro: null };
  } catch (e) {
    if (!A || seq !== A.seqMsgs) return;
    A.buscaMsgs = { q, carregando: false, itens: [], erro: e };
  }
  A.lista.render();
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
  if (id) {
    await selecionar(id);
    if (query.msg && /^\d+$/.test(query.msg)) irParaMensagem(Number(query.msg));
    return;
  }
  if (query.contato && /^\d+$/.test(query.contato)) { await abrirPorContato(Number(query.contato)); return; }
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
  A.iaEstado = null; A.iaEstadoEm = 0; A.iaEstadoPendente = false;
  A.chat.mostrarCarregando();
  A.lateral.render();
  try {
    const [ver, pag] = await Promise.all([
      A.api.rpcC("nx_cv_ver", { p_id: id }),
      A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_limite: 50 }),
    ]);
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
    atualizarItemLista(A.ver.conversa);
    A.ctx.titulo(nomeContato(ver.contato) || "Conversas");
    A.chat.renderTudo({ rolar: "fim" });
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
    A.chat.mostrarErro(e, () => selecionar(id));
  }
}

async function abrirPorContato(contatoId) {
  try {
    const r = await A.api.rpcC("nx_contato_ver", { p_id: contatoId });
    const lista = (r && r.conversas) || [];
    const aberta = lista.find(c => c.status !== "resolvida") || lista.slice().sort((a, b) => String(b.aberta_em).localeCompare(String(a.aberta_em)))[0];
    if (aberta) { A.ctx.navegar(`#/conversas/${aberta.id}`, { substituir: true }); return; }
    A.ctx.navegar("#/conversas", { substituir: true });
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
async function delta() {
  if (!A || !A.selId || !A.ver) return;
  const id = A.selId, seq = A.seqConversa;
  try {
    const r = await A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_desde: A.agora, p_depois_id: A.ultimoId });
    if (!A || seq !== A.seqConversa) return;
    const antes = A.msgs.length;
    const tinhaUlt = A.L.ultimoId(A.msgs);
    A.msgs = A.L.mesclarDelta(A.msgs, r.itens || []);
    A.conversasContato = r.conversas || A.conversasContato;
    A.agora = r.agora || A.agora;
    A.ultimoId = r.ultimo_id ?? A.L.ultimoId(A.msgs, A.ultimoId);
    const chegouDoCliente = (r.itens || []).some(m => m.direcao === "in" && Number(m.id) > Number(tinhaUlt || 0));
    if ((r.itens || []).length || A.msgs.length !== antes) A.chat.renderMensagens({ rolar: "novas" });
    if (chegouDoCliente && !document.hidden) marcarLida();
  } catch { /* o próximo pulso tenta de novo */ }
}

let _pulsoT = null, _verT = null;
function aoPulso() {
  if (!A) return;
  if (A.fila.itens.size) esvaziarFila();
  clearTimeout(_pulsoT);
  _pulsoT = setTimeout(async () => {
    if (!A) return;
    await Promise.all([carregarLista({}), delta()]);
    clearTimeout(_verT);
    _verT = setTimeout(() => recarregarVer(), 800);
  }, 250);
}

let _lida = { id: null, em: 0 };
async function marcarLida() {
  if (!A || !A.selId || !A.ver) return;
  const id = A.selId;
  const agora = Date.now();
  if (_lida.id === id && agora - _lida.em < 1500) return;
  _lida = { id, em: agora };
  const conv = A.ver.conversa;
  try {
    if (conv.nao_lidas > 0 || A.itens.some(x => x.id === id && x.nao_lidas > 0)) {
      await A.api.rpcC("nx_cv_marcar_lida", { p_conversa: id });
      if (!A) return;
      conv.nao_lidas = 0;
      const it = A.itens.find(x => x.id === id);
      if (it) { it.nao_lidas = 0; A.lista.render(); }
      if (A.contagens.nao_lidas > 0) { A.contagens.nao_lidas--; A.ctx.badge("conversas", A.contagens.nao_lidas); }
    }
    // confirmação de leitura para o cliente (opcional por empresa; a função confere janela e token)
    if (A.podeEscrever && A.base && A.base.cfg && A.base.cfg.recibo_leitura && A.L.janela(conv).aberta && conv.canal_id)
      A.api.fn("nx-enviar", { acao: "lido", conversa: id }).catch(() => {});
  } catch { /* não bloqueia nada */ }
}

/** Mensagens mais antigas (rolagem para cima). */
async function carregarAntes() {
  if (!A || !A.selId || !A.temMaisAntes || A.carregandoAntes) return;
  const primeira = A.msgs.find(m => !(typeof m.id === "string"));
  if (!primeira) return;
  A.carregandoAntes = true;
  A.chat.renderTopo();
  const id = A.selId;
  try {
    const r = await A.api.rpcC("nx_cv_mensagens", { p_conversa: id, p_antes_id: primeira.id, p_limite: 50 });
    if (!A || A.selId !== id) return;
    A.msgs = A.L.mesclarDelta(A.msgs, r.itens || []);
    A.temMaisAntes = !!r.tem_mais;
    A.conversasContato = r.conversas || A.conversasContato;
    A.chat.renderMensagens({ rolar: "anterior" });
  } catch (e) {
    A && A.ui.toast(A.ui.mensagemErro(e), { tipo: "erro" });
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
  abrir, carregarAntes, carregarLista, mudarLista, urlMidia, estadoMidia, abrirDetalhes, nomeContato, tratarErro,
  menuAvisos: ancora => menuAvisos(ancora), lerAvisos: () => lerAvisos(),
  voltar() { A.ctx.navegar("#/conversas"); },
  recarregarVer,
  async assumir(botao) {
    const r = await executar(A.api.rpcC("nx_cv_atribuir", { p_conversa: A.selId, p_conta: A.eu.id }), { botao, ok: "Conversa com você." });
    if (r) { trocarConversa(r); delta(); recarregarVer(); }
  },
  async assumirIA(botao) {
    if (!A?.selId || A.ver?.conversa?.canal?.provedor !== "codewords") return;
    const r = await executar(A.api.rpcC("nx_cv_ia_pausar", { p_conversa: A.selId, p_horas: null }), { botao });
    if (r && A) {
      A.iaEstado = r; A.iaEstadoEm = Date.now(); A.chat.renderCabecalho();
      let atribuida = true;
      if (A.eu?.id && A.ver?.conversa?.atribuida_a !== A.eu.id) {
        const dono = await executar(A.api.rpcC("nx_cv_atribuir", { p_conversa: A.selId, p_conta: A.eu.id }));
        if (dono) trocarConversa(dono); else atribuida = false;
      }
      delta(); carregarLista({});
      A.ui.toast(atribuida ? "Você assumiu a conversa. A IA volta conforme o prazo configurado." : "A IA foi pausada; não foi possível atribuir a conversa a você.", { tipo: atribuida ? "ok" : "info" });
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
  async transferir() {
    const ui = A.ui;
    const conv = A.ver.conversa;
    const pessoas = (A.base.usuarios || []).filter(u => u.papel !== "leitura" && u.aprovado !== false);
    const deps = A.base.departamentos || [];
    let conta = conv.atribuida_a || "", dep = conv.departamento_id || "";
    const sPessoa = ui.h("select", { class: "sel", id: "cv-tr-pessoa", "aria-label": "Pessoa" },
      ui.h("option", { value: "" }, "Sem responsável (fila do departamento)"),
      pessoas.map(u => ui.h("option", { value: u.id, selected: u.id === conta }, u.id === A.eu.id ? `${u.nome} (você)` : u.nome)));
    const sDep = ui.h("select", { class: "sel", id: "cv-tr-dep", "aria-label": "Departamento" },
      deps.map(d => ui.h("option", { value: d.id, selected: d.id === dep }, d.nome)));
    const corpo = ui.h("div", { class: "pilha" },
      ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-tr-pessoa" }, "Pessoa"), sPessoa),
      deps.length ? ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-tr-dep" }, "Departamento"), sDep) : null,
      ui.h("p", { class: "sub" }, "Quem recebe é avisado no sino. Fica registrado no histórico da conversa."));
    const r = await ui.modal({
      titulo: "Transferir conversa", corpo, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Transferir", tipo: "primario", fn: async () => {
        const novaConta = sPessoa.value || null;
        const novoDep = deps.length && sDep.value && sDep.value !== conv.departamento_id ? sDep.value : null;
        return A.api.rpcC("nx_cv_atribuir", { p_conversa: A.selId, p_conta: novaConta, p_departamento: novoDep });
      } }],
    });
    if (r && r.id) { trocarConversa(r); ui.toast("Conversa transferida.", { tipo: "ok" }); delta(); recarregarVer(); carregarLista({}); }
  },
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
    if (pend) {
      const id = A.selId;
      pend.cancelado = true; _pendResolver.delete(id);
      if (novo === pend.antes.status) {
        trocarConversa({ id, ...pend.antes });
        A.ui.toast(textos[novo], { tipo: "ok" });
        carregarLista({}); recarregarVer();
        return;
      }
    }
    const r = await executar(A.api.rpcC("nx_cv_status", { p_conversa: A.selId, p_status: novo }), { botao, ok: textos[novo] });
    if (r) { trocarConversa(r); delta(); recarregarVer(); carregarLista({}); }
  },
  async ocultar(sim) {
    const ui = A.ui;
    if (sim) {
      const ok = await ui.confirmar({ titulo: "Ocultar e bloquear este contato?", perigo: true, rotulo: "Ocultar e bloquear",
        texto: "O atendimento é resolvido e sai das listas. O que esse contato mandar depois fica guardado na aba Ocultas, sem avisar ninguém. Dá para desfazer." });
      if (!ok || !A) return;
    }
    const r = await executar(A.api.rpcC("nx_cv_ocultar", { p_conversa: A.selId, p_ocultar: !!sim }), { ok: sim ? "Conversa ocultada e contato bloqueado." : "Bloqueio desfeito. O contato volta a aparecer." });
    if (!r || !A) return;
    trocarConversa(r); delta(); recarregarVer(); carregarLista({});
    if (sim) A.ctx.navegar("#/conversas");
  },
  async etiquetas(ids) {
    const r = await executar(A.api.rpcC("nx_cv_etiquetas", { p_conversa: A.selId, p_etiquetas: ids }));
    if (r) trocarConversa(r);
  },
  async criarEtiqueta(nome) {
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
  enviar: (...a) => enviar(...a),
  reenviarLocal: (m) => reenviarLocal(m),
  podeCancelarEnvio: m => !!(A && m && A.envios.has(m.id)),
  cancelarEnvio(m) { const c = m && A.envios.get(m.id); if (c) c(); },
  descartarLocal(m) {
    if (m && m.ref) { filaRemover(m.ref); }
    A.msgs = A.msgs.filter(x => x.id !== m.id); A.chat.renderMensagens({ rolar: "manter" });
  },
  async nota(texto) {
    const r = await A.api.rpcC("nx_cv_nota", { p_conversa: A.selId, p_texto: texto });
    A.msgs = A.L.mesclarDelta(A.msgs, [r]);
    A.ultimoId = A.L.ultimoId(A.msgs, A.ultimoId);
    A.chat.renderMensagens({ rolar: "fim" });
    return r;
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
  cancelarFila: m => cancelarFila(m), enviarAgora: m => enviarAgora(m),
  filaResumo: id => filaResumo(id),
  reenviarGravada: m => reenviarGravada(m), foiReenviada: m => !!(A && m && A.reenviadas.has(m.id)),
};

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
    const r = await A.api.rpcC("nx_cv_listar", { p_filtro: { aba: "aguardando" }, p_limite: 50, p_antes: null });
    if (!A) return;
    // a que acabou de ser resolvida (o «Desfazer» ainda na tela; o servidor ainda a tem aberta) não volta como «a próxima»
    const esperando = ((r && r.itens) || []).filter(x => !_pendResolver.has(x.id));
    const c = A.L.proximaParaAtender(esperando, A.eu && A.eu.id);
    if (!c) { aviso("Ninguém espera resposta agora."); return; }
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

/** A conversa como a tela deve mostrá-la: resolvida, se o «Resolver» dela ainda espera o fim do Desfazer (o servidor ainda a tem aberta). */
function comPendencia(conv) {
  return conv && _pendResolver.has(conv.id) ? { ...conv, status: "resolvida", aguardando: false, nao_lidas: 0 } : conv;
}
/** A lista com os «Resolver» pendentes aplicados: a conversa sai das abas de abertas (como o servidor fará) e continua visível na busca. */
function itensComPendencia(itens) {
  if (!_pendResolver.size) return itens;
  const eu = A.eu && A.eu.id, busca = !!filtroAtual().busca;
  return itens.map(comPendencia).filter(c => !_pendResolver.has(c.id) || busca || A.L.pertenceAba(c, A.aba, eu));
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
        if (A.selId === id) trocarConversa({ id, status: "resolvida" }); else atualizarItemLista({ id, status: "resolvida" });
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
  const corpo = h("div", { class: "pilha cv-teclas" },
    h("p", { class: "sub" }, "Os acordes com Alt valem também com o cursor no campo de mensagem. As letras soltas só valem fora dos campos de texto."),
    grupos.map(g => h("section", { class: "cv-teclas-grupo" },
      h("h3", { class: "rotulo" }, g),
      h("dl", { class: "cv-teclas-lista" }, A.L.ACORDES.filter(a => a.grupo === g).flatMap(a => [h("dt", null, teclas(a.teclas)), h("dd", null, a.rotulo)])))),
    campoAvancar);
  ui.modal({ titulo: "Atalhos da central de conversas", corpo, largura: "m", acoes: [{ rotulo: "Fechar", tipo: "primario" }] });
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
  }
  def("atalhos", "Atalhos da central de conversas", "atalhos teclado ajuda conversas", () => abrirAjudaTeclado(), "?");
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
    if (o.tipo === "midia") {
      // o arquivo já subiu numa tentativa anterior (a nx-enviar é que falhou): "Tentar de novo" não sobe tudo outra vez
      if (!o.path) {
        definirProgresso(tmp, 0, "subindo", convId);
        const s = await A.api.fn("nx-midia", { acao: "subir", nome: o.arquivo.name, mime: o.validacao.mime, tamanho: o.arquivo.size });
        if (!s || !s.path || !/^https:\/\//.test(String(s.upload_url || ""))) throw Object.assign(new Error("envio_falhou"), { codigo: "envio_falhou", detalhe_texto: "o servidor não liberou o envio do arquivo" });
        try {
          await subirArquivo(s.upload_url, o.arquivo, o.validacao.mime, {
            aoProgresso: (env, total) => definirProgresso(tmp, L.progressoEnvio(env, total).pct, "subindo", convId),
            registrar: cancelar => { A.envios.set(tmp.id, cancelar); if (A.selId === convId) A.chat.renderMensagens({ rolar: "manter" }); } });
        } finally { if (A) A.envios.delete(tmp.id); }
        o.path = s.path;
      }
      definirProgresso(tmp, 100, "entregando", convId);
      r = await A.api.fn("nx-enviar", { acao: "midia", conversa: convId, path: o.path, mime: o.validacao.mime, nome: o.arquivo.name, legenda: o.legenda || undefined });
    } else {
      r = await A.api.fn("nx-enviar", { acao: "template", conversa: convId, template_id: o.template.id, parametros: o.parametros || [] });
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
        const duvida = e?.resposta?.ambigua === true || ["sem_conexao", "tempo_rede"].includes(codigo) || Number(e?.status) === 504;
        const motivo = (typeof e?.resposta?.detalhe === "string" && e.resposta.detalhe) || L.dicaErroEnvio(codigo) || ui.mensagemErro(e);
        toastAbrir(ui, ctx, duvida ? `${oQue} para ${para} pode ter saído — confira no WhatsApp antes de reenviar.`
          : `${oQue} para ${para} não foi enviado: ${motivo}`, convId);
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
        (m.status === "falhou" || (envioAmbiguo && m.status === "pendente")));
      if (encontrada && envioAmbiguo) {
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

/** PUT com progresso: o fetch não diz quanto já subiu. Rejeita com codigo "upload_falhou" (rede/HTTP) ou "upload_cancelado". */
function subirArquivo(url, arquivo, mime, { aoProgresso, registrar } = {}) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    const falha = (codigo, texto) => reject(Object.assign(new Error(codigo), { codigo, detalhe_texto: texto }));
    x.open("PUT", url);
    x.setRequestHeader("content-type", mime);
    x.setRequestHeader("x-upsert", "true");
    x.timeout = 180000;
    let ultimo = 0;
    x.upload.addEventListener("progress", ev => {
      if (!ev.lengthComputable || !aoProgresso) return;
      const agora = Date.now();
      if (agora - ultimo < 120) return;       // no máximo ~8 atualizações por segundo
      ultimo = agora;
      aoProgresso(ev.loaded, ev.total);
    });
    x.addEventListener("load", () => (x.status >= 200 && x.status < 300 ? resolve() : falha("upload_falhou", `não foi possível subir o arquivo (${x.status})`)));
    x.addEventListener("error", () => falha("upload_falhou", "a conexão caiu durante o envio"));
    x.addEventListener("timeout", () => falha("upload_falhou", "o envio demorou demais"));
    x.addEventListener("abort", () => falha("upload_cancelado", "envio cancelado"));
    if (registrar) registrar(() => x.abort());
    x.send(arquivo);
  });
}

/** Barra de progresso da bolha local (só se a conversa ainda é a aberta). */
function definirProgresso(tmp, pct, fase, convId) {
  if (!A || A.selId !== convId) return;
  let mudou = false;
  A.msgs = A.msgs.map(m => {
    if (m.id !== tmp.id || !m.midia || (m.midia.progresso === pct && m.midia.fase === fase)) return m;
    mudou = true;
    return { ...m, midia: { ...m.midia, progresso: pct, fase } };
  });
  if (mudou) A.chat.renderMensagens({ rolar: "manter" });
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
  A.msgs = A.msgs.map(x => x.id === m.id ? { ...x, status: "pendente", erro: null, falhaLocal: false, ...(x.midia && x.midia.local_url ? { midia: { ...x.midia, progresso: 0, fase: x.pedido && x.pedido.path ? "entregando" : "subindo" } } : {}) } : x);
  A.chat.renderMensagens({ rolar: "manter" });
  await enviarPedido(m, m.pedido);
}

/** «Tentar de novo» de uma falha que o SERVIDOR gravou: pede o reenvio da própria mensagem (ação "reenviar" do nx-enviar). O texto gravado já
    saiu assinado e o servidor não assina de novo — mandar como texto novo repetiria a assinatura. Passa pela fila como qualquer texto. */
async function reenviarGravada(m) {
  if (!A || !m || !m.id || !m.corpo || !A.ver || A.reenviadas.has(m.id)) return;
  A.reenviadas.add(m.id);                 // o botão da bolha antiga some: um toque só
  return enviarTexto({ tipo: "texto", texto: m.corpo, reenvio: Number(m.id) });
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
    r.onsuccess = () => ok(r.result);
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
  const persistido = await filaSalvar(it);
  A.msgs = L.mesclarDelta(A.msgs, [bolhaDeItem(it)]);
  A.chat.renderMensagens({ rolar: "fim" });
  const offline = A.ctx.rede ? A.ctx.rede.estado === "offline" : (typeof navigator !== "undefined" && navigator.onLine === false);
  if (offline) { it.motivo = "Sem internet: a mensagem espera na fila."; it.proxima_em = Date.now() + 20000; await filaSalvar(it); atualizarBolha(it); }
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
  fila.emVoo.add(it.id);
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
  } finally { fila.emVoo.delete(it.id); if (A && A.fila !== fila) A.fila.emVoo.delete(it.id); }
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
  if (!it || A.fila.emVoo.has(it.id)) return;
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
async function novaConversa({ contato = null } = {}) {
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
    canais.map(c => ui.h("option", { value: c.id }, `${c.nome}${c.numero_exibicao ? ` · ${c.numero_exibicao}` : ""}${c.status !== "ativo" ? " (não verificado)" : ""}`)));
  const campoCanal = canais.length > 1 ? ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-canal" }, "Enviar pelo número"), sCanal) : null;

  const bBuscar = ui.h("button", { type: "button", "aria-pressed": "true" }, "Contato cadastrado");
  const bDigitar = ui.h("button", { type: "button", "aria-pressed": "false" }, "Digitar telefone");
  const alterna = ui.h("div", { class: "cv-alterna", role: "group", "aria-label": "Como escolher o contato" }, bBuscar, bDigitar);

  const busca = ui.h("input", { type: "search", id: "cv-nv-busca", placeholder: "Nome ou telefone", autocomplete: "off" });
  const resultados = ui.h("div", { class: "cv-busca-contato", role: "list", "aria-live": "polite" });
  const blocoBusca = ui.h("div", { class: "pilha-p" },
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-busca" }, A.ctx.vocab.contato || "Contato"), busca), resultados);
  const tel = ui.h("input", { type: "tel", id: "cv-nv-tel", placeholder: "(12) 99999-9999", inputmode: "tel", autocomplete: "off" });
  const nome = ui.h("input", { type: "text", id: "cv-nv-nome", placeholder: "Opcional", maxlength: 160, autocomplete: "off" });
  const blocoDigitar = ui.h("div", { class: "pilha-p", hidden: true },
    ui.h("div", { class: "campo" }, ui.h("label", { for: "cv-nv-tel" }, "Telefone com DDD"), tel,
      ui.h("small", { class: "campo-ajuda" }, "Número do Brasil ganha o 55 sozinho. Outro país: comece com o código dele (ex.: +1).")),
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
  const procurar = ui.debounce(async () => {
    const q = busca.value.trim();
    const meu = ++seq;
    ui.limpar(resultados);
    if (q.length < 2) return;
    resultados.appendChild(ui.h("p", { class: "sub" }, "Procurando…"));
    try {
      const r = await A.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_pagina: 1, p_por_pagina: 8 });
      if (meu !== seq) return;
      ui.limpar(resultados);
      const itens = (r && r.itens) || [];
      if (!itens.length) {
        resultados.appendChild(ui.h("p", { class: "sub" }, "Ninguém com esse nome ou telefone. "));
        const dig = L.normalizarTelefone(q);
        resultados.appendChild(ui.h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { tel.value = dig ? q : ""; nome.value = dig ? "" : q; trocarModo("digitar"); } } },
          ui.icone("mais"), "Digitar o telefone"));
        return;
      }
      for (const c of itens) {
        const b = ui.h("button", { type: "button", class: "cv-contato-op", role: "listitem", "aria-pressed": "false" },
          ui.avatar(c.nome || c.telefone, c.id), ui.h("span", null, ui.h("b", null, nomeContato(c)), ui.h("small", null, c.telefone ? ui.telBR(c.telefone) : "sem telefone")));
        b.addEventListener("click", () => { escolhido = c; for (const x of resultados.querySelectorAll(".cv-contato-op")) x.setAttribute("aria-pressed", String(x === b)); desenharEscolhido(); });
        resultados.appendChild(b);
      }
    } catch (e) {
      if (meu !== seq) return;
      ui.limpar(resultados);
      resultados.appendChild(ui.h("p", { class: "sub" }, `Não deu para procurar agora (${ui.mensagemErro(e)}). Use "Digitar telefone".`));
    }
  }, 280);
  busca.addEventListener("input", procurar);

  const corpo = ui.h("div", { class: "pilha" }, campoCanal, contato ? null : alterna, blocoEscolhido, blocoBusca, blocoDigitar,
    ui.h("p", { class: "sub" }, "Em número da Meta (WhatsApp oficial), se o cliente não falou com a empresa nas últimas 24 h só vale um modelo aprovado — o seletor de modelos abre em seguida. Em número do CodeWords não há essa janela."));
  desenharEscolhido();
  if (contato) { blocoBusca.hidden = true; }

  const item = await ui.modal({
    titulo: "Nova conversa", corpo, largura: "m",
    aoAbrir: () => { if (!contato) setTimeout(() => busca.focus(), 40); },
    acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Abrir conversa", tipo: "primario", fn: async api => {
      const params = { p_canal: canais.length > 1 ? sCanal.value : canais[0].id };
      if (modo === "digitar") {
        if (!L.normalizarTelefone(tel.value)) { api.erro("Digite o telefone com DDD (10 ou 11 números)."); tel.focus(); return false; }
        params.p_telefone = tel.value; params.p_nome = nome.value.trim() || null;
      } else {
        if (!escolhido || !escolhido.id) { api.erro("Escolha alguém da lista ou use “Digitar telefone”."); return false; }
        params.p_contato = escolhido.id;
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
