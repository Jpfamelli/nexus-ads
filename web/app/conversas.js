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
    carregandoAntes: false, rascunhos: new Map(), midia: new Map(), pedidosMidia: new Set(), blobs: new Set(),
    painel: "lista", timers: [], limpar: [], seqConversa: 0, seqLista: 0, destruido: false, acoes,
    buscaMsgs: null, seqMsgs: 0,
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

  try {
    await carregarBase();
  } catch (e) {
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(ui.erroCartao(e, () => { desmontar(); montar(A ? A.ctx : ctx); }));
    return;
  }
  ui.limpar(colLista); colLista.appendChild(A.lista.el);
  ui.limpar(colChat); colChat.appendChild(A.chat.el);
  A.chat.mostrarVazio();
  A.lateral.montarEm(colLat);

  // tempo real: pulso do shell (3 s com Conversas aberta) + relógio de 1 min para janelas e esperas
  A.limpar.push(ctx.pulso.assinar(() => aoPulso()));
  // o navegador só deixa tocar som depois de um toque/clique na página
  const destravar = () => desbloquearAudio();
  document.addEventListener("pointerdown", destravar, { once: true, capture: true });
  A.limpar.push(() => document.removeEventListener("pointerdown", destravar, { capture: true }));
  A.timers.push(setInterval(() => { if (!document.hidden) { A.lista.render(); A.chat.renderCabecalho(); A.composer.atualizar(); } }, 60000));
  A.timers.push(setInterval(() => { if (Date.now() - (A.baseEm || 0) > 5 * 60000) carregarBase().catch(() => {}); }, 60000));

  await carregarLista({ reset: true });
  await aplicarRota(ctx.rota);
}

export function desmontar() {
  if (!A) return;
  A.destruido = true;
  if (A.composer && typeof A.composer.desmontar === "function") A.composer.desmontar();
  for (const t of A.timers) clearInterval(t);
  for (const f of A.limpar) try { f(); } catch { /* ok */ }
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
    if (!reset && !mais) avisarNovidades(A.itens, r.itens || [], A.contagens && A.contagens.nao_lidas, r.contagens && r.contagens.nao_lidas);
    A.itens = mais ? [...A.itens, ...(r.itens || []).filter(n => !A.itens.some(x => x.id === n.id))] : (r.itens || []);
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
}

function abrir(id) { A.ctx.navegar(`#/conversas/${id}`); }

async function selecionar(id) {
  if (!A) return;
  const trocou = A.selId !== id;
  if (A.selId && trocou) guardarRascunho();
  A.selId = id;
  mostrarPainel("chat");
  A.lista.render();
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
    A.ver = ver;
    A.msgs = A.L.mesclarDelta([], pag.itens || []);
    A.conversasContato = pag.conversas || [];
    A.agora = pag.agora || null;
    A.ultimoId = pag.ultimo_id ?? A.L.ultimoId(A.msgs);
    A.temMaisAntes = !!pag.tem_mais;
    atualizarItemLista(ver.conversa);
    A.ctx.titulo(nomeContato(ver.contato) || "Conversas");
    A.chat.renderTudo({ rolar: "fim" });
    A.composer.definirConversa();
    A.lateral.render();
    marcarLida();
    if (ver.conversa?.canal?.provedor === "codewords") carregarEstadoIA(id, seq);
  } catch (e) {
    if (!A || seq !== A.seqConversa) return;
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
    A.ver = ver;
    atualizarItemLista(ver.conversa);
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
function guardarRascunho() { if (A.composer && A.selId) A.rascunhos.set(A.selId, A.composer.lerRascunho()); }

/* ============================================================ ações */
function trocarConversa(item) {
  if (!item) return;
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
  async status(novo, botao) {
    const textos = { resolvida: "Atendimento resolvido.", aberta: "Atendimento reaberto.", pendente: "Marcado como pendente." };
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
  descartarLocal(m) { A.msgs = A.msgs.filter(x => x.id !== m.id); A.chat.renderMensagens({ rolar: "manter" }); },
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
  guardarRascunho,
};

/* ============================================================ envio (nx-enviar) */
/** enviar({tipo:'texto'|'midia'|'template', texto, arquivo, legenda, template, parametros, respondeA}) */
async function enviar(o) {
  const L = A.L;
  const conv = A.ver && A.ver.conversa;
  if (!conv) return;
  if (o.tipo === "texto" && !o.clientRef) {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    o = { ...o, clientRef: `orbita:${id}` };
  }
  const eu = { id: A.eu.id, nome: A.eu.nome };
  let tmp;
  if (o.tipo === "texto") {
    tmp = L.mensagemOtimista({ conversaId: conv.id, corpo: o.texto, eu,
      respondeA: o.respondeA ? { id: o.respondeA.id, direcao: o.respondeA.direcao, resumo: L.resumoMensagem(o.respondeA, 100) } : null });
  } else if (o.tipo === "midia") {
    const url = URL.createObjectURL(o.arquivo);
    A.blobs.add(url);
    tmp = L.mensagemOtimista({ conversaId: conv.id, tipo: o.validacao.tipo, corpo: o.legenda || null, eu,
      midia: { nome: o.arquivo.name, mime: o.validacao.mime, tamanho: o.arquivo.size, estado: "enviando", local_url: url } });
  } else {
    tmp = L.mensagemOtimista({ conversaId: conv.id, tipo: "template", corpo: L.preencherModelo(o.template.corpo, o.parametros), eu,
      template: { nome: o.template.nome, idioma: o.template.idioma } });
  }
  tmp.pedido = o;
  A.msgs = L.mesclarDelta(A.msgs, [tmp]);
  A.chat.renderMensagens({ rolar: "fim" });
  await enviarPedido(tmp, o);
}

async function enviarPedido(tmp, o) {
  const L = A.L;
  const convId = A.selId;
  try {
    let r;
    if (o.tipo === "texto") {
      r = await A.api.fn("nx-enviar", { acao: "texto", conversa: convId, texto: o.texto, client_ref: o.clientRef,
        responde_a: o.respondeA && o.respondeA.wamid ? o.respondeA.wamid : undefined });
    } else if (o.tipo === "midia") {
      const s = await A.api.fn("nx-midia", { acao: "subir", nome: o.arquivo.name, mime: o.validacao.mime, tamanho: o.arquivo.size });
      if (!s || !s.path || !/^https:\/\//.test(String(s.upload_url || ""))) throw Object.assign(new Error("envio_falhou"), { codigo: "envio_falhou", detalhe_texto: "o servidor não liberou o envio do arquivo" });
      const put = await fetch(s.upload_url, { method: "PUT", headers: { "content-type": o.validacao.mime, "x-upsert": "true" }, body: o.arquivo });
      if (!put.ok) throw Object.assign(new Error("envio_falhou"), { codigo: "envio_falhou", detalhe_texto: `não foi possível subir o arquivo (${put.status})` });
      r = await A.api.fn("nx-enviar", { acao: "midia", conversa: convId, path: s.path, mime: o.validacao.mime, nome: o.arquivo.name, legenda: o.legenda || undefined });
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
    if (!A || A.selId !== convId) return;
    const codigo = e && e.codigo;
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

async function reenviarLocal(m) {
  if (!m || !m.pedido) return;
  A.msgs = A.msgs.map(x => x.id === m.id ? { ...x, status: "pendente", erro: null } : x);
  A.chat.renderMensagens({ rolar: "manter" });
  await enviarPedido(m, m.pedido);
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
