/* ============================================================
   ÓRBITA — cv-lista.js · frente F5 · ESPEC §7.7 T4 (coluna da lista)
   Abas com contadores, busca (nome / telefone / protocolo), filtros
   (departamento, número, atendente, etiquetas, só não lidas),
   "Nova conversa" e os itens (avatar, resumo, hora, não lidas,
   etapa do negócio, etiquetas, dono, espera na aba Aguardando).
   Itens são links (#/conversas/<id>) reaproveitados por id para não
   piscar a cada pulso.
   ============================================================ */

export function criarLista(A) {
  const { ui, L } = A;
  const h = ui.h;

  /* ---------------- cabeçalho */
  const sub = h("small", null, "");
  const titulo = h("h1", { class: "cvl-titulo" }, "Conversas", sub);
  const btNova = A.podeEscrever
    ? h("button", { type: "button", class: "bt bt-prim bt-p", title: "Nova conversa", "aria-label": "Nova conversa", on: { click: () => A.acoes.novaConversa() } }, ui.icone("mais"), "Nova")
    : null;

  /* M35: «Atender o próximo» — abre e assume a que espera há mais tempo; só aparece com fila e para quem pode escrever */
  const nAtender = h("b", { class: "cvl-atender-n", "aria-hidden": "true" }, "");
  const btAtender = A.podeEscrever
    ? h("button", { type: "button", class: "bt bt-sec bt-p cvl-atender", hidden: true, title: "Abre e assume a conversa que espera resposta há mais tempo (Alt+Shift+P)" },
      ui.icone("seta-dir"), h("span", null, "Atender o próximo"), nAtender)
    : null;
  if (btAtender) btAtender.addEventListener("click", () => A.acoes.atenderProximo(btAtender));
  /* M35: a lista anuncia a conversa nova a leitor de tela («Nova mensagem de Mariana, aguardando há 3 min»), no máximo 1 a cada 10 s */
  const leitor = h("div", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  let ultimoAnuncio = 0, textoPendente = null, tAnuncio = null, ultimoTexto = "";
  function dizer(texto) {
    ultimoAnuncio = Date.now();
    leitor.textContent = "";
    setTimeout(() => { ultimoTexto = ultimoTexto === texto ? `${texto}\u200b` : texto; leitor.textContent = ultimoTexto; }, 30);   // esvaziar e repor: o leitor repete até o mesmo texto
  }
  function anunciar(texto) {
    if (!texto) return;
    const falta = L.esperaAnuncio(ultimoAnuncio, Date.now());
    if (falta <= 0) { dizer(texto); return; }
    textoPendente = texto;                                // dentro dos 10 s: o texto mais novo espera a vez
    if (!tAnuncio) tAnuncio = setTimeout(() => { tAnuncio = null; const t = textoPendente; textoPendente = null; if (t && leitor.isConnected) dizer(t); }, falta);
  }

  /* ---------------- busca e filtros */
  // plano 1000b · CB-069: até 100 caracteres (colar um texto enorme não vai a cada tecla ao nx_cv_listar/nx_cv_buscar_msgs)
  const BUSCA_MAX = 100;
  const busca = h("input", { type: "search", placeholder: "Nome, telefone, protocolo", "aria-label": "Buscar conversas", autocomplete: "off", maxlength: BUSCA_MAX, value: String(A.busca || "").slice(0, BUSCA_MAX) });
  const buscaAjuda = h("p", { class: "cvl-busca-ajuda", role: "status", "aria-live": "polite", "aria-atomic": "true", hidden: true });
  let timerBusca = null, compondoBusca = false;
  function cancelarBuscaPendente() { clearTimeout(timerBusca); timerBusca = null; }
  function aplicarBusca() {
    const q = String(busca.value || "").slice(0, BUSCA_MAX).trim();   // CB-069: o maxlength não vale para valor posto por código
    if (q.length === 1) {
      if (A.busca) A.acoes.mudarLista({ busca: "" });
      buscaAjuda.textContent = "Digite mais 1 caractere para buscar conversas.";
      buscaAjuda.hidden = false;
      return;
    }
    buscaAjuda.hidden = true;
    if (q !== (A.busca || "")) A.acoes.mudarLista({ busca: q });
  }
  function programarBusca(imediato = false) {
    cancelarBuscaPendente();
    if (compondoBusca) return;
    const q = String(busca.value || "").trim();
    if (q.length < 2 || imediato) { aplicarBusca(); return; }
    timerBusca = setTimeout(() => { timerBusca = null; aplicarBusca(); }, 320);
  }
  busca.addEventListener("input", ev => { if (ev.isComposing || compondoBusca) return; programarBusca(); });
  busca.addEventListener("compositionstart", () => { compondoBusca = true; cancelarBuscaPendente(); });
  busca.addEventListener("compositionend", () => { compondoBusca = false; programarBusca(true); });
  busca.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && busca.value) { ev.preventDefault(); busca.value = ""; cancelarBuscaPendente(); buscaAjuda.hidden = true; aplicarBusca(); return; }
    if (ev.key === "Enter" && !ev.isComposing && !compondoBusca && ev.keyCode !== 229) { ev.preventDefault(); programarBusca(true); }
  });
  const ponto = h("span", { class: "cvl-ponto", hidden: true });
  const btFiltro = h("button", { type: "button", class: "bt-icone cvl-filtro", "aria-label": "Filtros", title: "Filtros" }, ui.icone("filtro"), ponto);
  btFiltro.addEventListener("click", () => abrirFiltros());
  const btAvisos = h("button", { type: "button", class: "bt-icone cvl-avisos", "aria-label": "Avisos e aparência da lista", title: "Avisos de mensagem nova e aparência da lista" }, ui.icone("sino"));
  btAvisos.addEventListener("click", () => A.acoes.menuAvisos(btAvisos));

  /* ---------------- CA-046: ações em lote — modo seleção (toque/clique marca a conversa) e a barra «Marcar como lida · Resolver» */
  let selecionando = false;
  const selecao = new Set();
  const nSel = h("span", { class: "cvl-lote-n", role: "status", "aria-live": "polite" }, "");
  const btLoteLida = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("check"), "Marcar como lida");
  const btLoteResolver = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("check"), "Resolver");
  // plano 1000 · CA-046 (conv-2): também Transferir e Etiquetar as marcadas de uma vez (antes só lida e resolver)
  const btLoteTransferir = typeof A.acoes.transferirLote === "function" ? h("button", { type: "button", class: "bt bt-sec bt-p cvl-lote-transf" }, ui.icone("transferir"), "Transferir") : null;
  const btLoteEtiquetar = typeof A.acoes.etiquetarLote === "function" ? h("button", { type: "button", class: "bt bt-sec bt-p cvl-lote-etq" }, ui.icone("etiqueta"), "Etiquetar") : null;
  const btLoteSair = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Cancelar");
  const barraLote = h("div", { class: "cvl-lote", role: "toolbar", "aria-label": "Ações nas conversas selecionadas", hidden: true }, nSel, btLoteLida, btLoteResolver, btLoteTransferir, btLoteEtiquetar, btLoteSair);
  const btSelecionar = A.podeEscrever && typeof A.acoes.resolverLote === "function"
    ? h("button", { type: "button", class: "bt-icone cvl-sel-bt", "aria-label": "Selecionar várias conversas", "aria-pressed": "false", title: "Selecionar várias (resolver, marcar como lidas, transferir, etiquetar)"   /* plano 1000b · CB-066 */ }, ui.icone("check"))
    : null;
  function modoSelecao(sim) {
    selecionando = !!sim;
    if (!selecionando) selecao.clear();
    if (btSelecionar) btSelecionar.setAttribute("aria-pressed", String(selecionando));
    pintarLote();
    renderItens();
  }
  function pintarLote() {
    barraLote.hidden = !selecionando;
    const n = selecao.size;
    // plano 1000b · CB-067: «Toque» só no aparelho de toque; com mouse, «Clique»
    nSel.textContent = n ? `${n} ${n === 1 ? "selecionada" : "selecionadas"}` : `${L.aparelhoDeToque() ? "Toque" : "Clique"} nas conversas para selecionar`;
    btLoteLida.disabled = btLoteResolver.disabled = !n;
    if (btLoteTransferir) btLoteTransferir.disabled = !n;
    if (btLoteEtiquetar) btLoteEtiquetar.disabled = !n;
  }
  if (btSelecionar) btSelecionar.addEventListener("click", () => modoSelecao(!selecionando));
  btLoteSair.addEventListener("click", () => modoSelecao(false));
  // plano 1000b · CB-018: se o servidor falhar no meio, as que não foram voltam selecionadas (a pessoa não precisa marcar tudo de novo)
  btLoteLida.addEventListener("click", async () => {
    const ids = [...selecao]; modoSelecao(false);
    // revisão 1000b · CB-018: a falha chega até 7 s depois — só religa a seleção se a pessoa não começou outra seleção
    // nem trocou de aba/busca desde o clique (senão marcaria conversas de outra lista ou atropelaria a seleção nova)
    const abaClique = A.aba, buscaClique = String(A.busca || "");
    const r = await A.acoes.lidaLote(ids);
    const restantes = (r && Array.isArray(r.restantes) ? r.restantes : []).filter(id => A.itens.some(x => x.id === id));
    if (restantes.length && !selecionando && A.aba === abaClique && String(A.busca || "") === buscaClique) { for (const id of restantes) selecao.add(id); modoSelecao(true); }
  });
  btLoteResolver.addEventListener("click", async () => { const ids = [...selecao]; modoSelecao(false); await A.acoes.resolverLote(ids); });
  // transferir/etiquetar perguntam antes (modal): a seleção só sai quando a ação foi confirmada
  if (btLoteTransferir) btLoteTransferir.addEventListener("click", async () => { const ids = [...selecao]; if (await A.acoes.transferirLote(ids)) modoSelecao(false); });
  if (btLoteEtiquetar) btLoteEtiquetar.addEventListener("click", async () => { const ids = [...selecao]; if (await A.acoes.etiquetarLote(ids)) modoSelecao(false); });

  /* ---------------- abas: uma linha só — Minhas · Sem dono · Aguardando (ui.segmentado) + botão "Mais situações ▾" */
  const abasEl = h("div", { class: "cvl-abas" });
  let seg = null, btVisoes = null, abasMais = [];
  const contadoresAba = new Map();   // id → número já conhecido (para o menu "Mais")
  function escolherAba(id) { if (A.aba !== id || A.busca) { busca.value = ""; A.acoes.mudarLista({ aba: id, busca: "" }); } }
  function montarAbas() {
    ui.limpar(abasEl);
    const { fixas, mais } = L.abasVisiveis(A.ctx.papel, A.podeEscrever);
    abasMais = mais;
    seg = ui.segmentado({ opcoes: fixas.map(x => ({ valor: x.id, rotulo: x.rotulo, contador: null })), valor: abaDestaque(), tipo: "abas",
      rotulo: "Situação das conversas", aoMudar: escolherAba });
    // a aba marcada pode ser a mesma que o segmentado "lembra" (quando a atual mora no menu ou há busca): clique e Enter/Espaço escolhem sempre
    seg.addEventListener("click", ev => { const op = ev.target.closest && ev.target.closest(".seg-op"); if (op) escolherAba(op.dataset.valor); });
    seg.addEventListener("keydown", ev => {
      if ((ev.key === "Enter" || ev.key === " ") && abasEl.dataset.semsel === "1") {
        const op = document.activeElement && document.activeElement.closest && document.activeElement.closest(".seg-op");
        if (op) { ev.preventDefault(); ev.stopImmediatePropagation(); escolherAba(op.dataset.valor); }
      }
    }, true);
    abasEl.appendChild(seg);
    if (mais.length) {
      // plano 1000b · CB-065: o title lista as abas que o menu tem de verdade (o supervisor também tem Ocultas)
      btVisoes = h("button", { type: "button", class: "cvl-visoes", "aria-label": "Mais situações", title: `Mais situações: ${mais.map(x => x.rotulo).join(", ")}` }, ui.icone("seta-baixo"));
      btVisoes.addEventListener("click", () => {
        ui.menu(btVisoes, abasMais.map(x => {
          const n = contadoresAba.get(x.id);
          return { rotulo: n ? `${x.rotulo} · ${n}` : x.rotulo, icone: A.aba === x.id && !A.busca ? "check" : undefined, fn: () => escolherAba(x.id) };
        }));
      });
      abasEl.appendChild(btVisoes);
    }
  }
  /** A aba fixa que fica marcada (ou a 1ª quando a atual mora no menu "Mais"). */
  function abaDestaque() { return L.ABAS_FIXAS.includes(A.aba) ? A.aba : L.ABAS_FIXAS.find(x => !(x === "minhas" && !A.podeEscrever)) || "sem_dono"; }
  montarAbas();

  const avisoCanal = h("div", { class: "cvl-aviso", hidden: true });
  // plano 1000 · CA-103: sem conexão, a lista que aparece é a última guardada no aparelho — a faixa diz de quando ela é
  const avisoCache = h("p", { class: "cvl-cache", role: "status", hidden: true });
  // plano 1000b · CB-087: o pulso falhou 3 vezes seguidas com a lista na tela — «Lista sem atualizar desde 14:02 · Tentar agora»
  const atrasoTxt = h("span", null, "");
  const btAtraso = h("button", { type: "button", class: "bt bt-fant bt-p cvl-atraso-bt" }, "Tentar agora");
  const avisoAtraso = h("p", { class: "cvl-cache cvl-atraso", role: "status", hidden: true }, atrasoTxt, " ", btAtraso);
  btAtraso.addEventListener("click", () => ui.carregando(btAtraso, A.acoes.carregarLista({})));
  // plano 1000b · CB-070: quantas conversas a busca achou, num aviso só (com espera: não a cada tecla)
  let sigBuscaAnunciada = "", timerAnuncioBusca = null;
  // D18: número de WhatsApp desconectado (ctx.canais do shell ou nx_cv_base.canais[].estado): faixa na central com «Ver número»
  const avisoCaido = h("div", { class: "cvl-caido", role: "status", hidden: true });
  let sigCaido = "";
  const infoBusca = h("div", { class: "cvl-busca-info", hidden: true });
  const filtrosEl = h("div", { class: "cvl-filtros-ativos", role: "group", hidden: true, "aria-label": "Filtros aplicados" });
  const lista = h("div", { class: "cvl-lista", id: "cvl-lista", role: "tabpanel" });
  const maisBox = h("div", { class: "cvl-mais", hidden: true });
  const btMais = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Carregar mais");
  // CA-050: a próxima página também chega sozinha quando o fim da lista aparece (IntersectionObserver, com trava); o botão continua
  let carregandoMais = false;
  function carregarMais() {
    if (carregandoMais || !A.temMais) return null;
    carregandoMais = true;
    return Promise.resolve(ui.carregando(btMais, A.acoes.carregarLista({ mais: true }))).finally(() => { carregandoMais = false; });
  }
  btMais.addEventListener("click", () => carregarMais());
  maisBox.appendChild(btMais);
  let observador = null;
  if (typeof IntersectionObserver === "function") {
    try {
      observador = new IntersectionObserver(ents => { if (ents.some(e => e.isIntersecting) && A.temMais && !A.carregandoLista && !A.busca) carregarMais(); }, { root: lista, rootMargin: "160px 0px" });
      observador.observe(maisBox);
    } catch { observador = null; }
  }

  const el = h("div", { class: "cvl" },
    h("header", { class: "cvl-cab" }, titulo, btNova, btAtender),
    leitor,
    h("div", { class: "cvl-busca" }, h("label", { class: "busca" }, ui.icone("busca"), busca), btFiltro, btSelecionar, btAvisos),
    buscaAjuda, infoBusca, filtrosEl, abasEl, avisoCanal, avisoCaido, avisoCache, avisoAtraso, lista, barraLote);
  // CA-046: no modo seleção, tocar na linha marca/desmarca (não abre a conversa)
  function alternarItem(a, { focar = false } = {}) {
    const id = Number(a.dataset.id);
    if (selecao.has(id)) selecao.delete(id); else selecao.add(id);
    pintarLote();
    renderItens();
    if (focar) { const novo = lista.querySelector(`.cvl-item[data-id="${id}"]`); try { if (novo) novo.focus(); } catch { /* ok */ } }
  }
  lista.addEventListener("click", ev => {
    if (!selecionando) return;
    const a = ev.target && ev.target.closest ? ev.target.closest(".cvl-item") : null;
    if (!a) return;
    ev.preventDefault();
    alternarItem(a);
  });
  // plano 1000b · CB-017: no modo seleção a linha é role=checkbox — Espaço (e Enter) marcam, como o leitor de tela promete (antes o
  // Espaço rolava a lista e o Enter abria a conversa)
  lista.addEventListener("keydown", ev => {
    if (!selecionando || (ev.key !== " " && ev.key !== "Spacebar" && ev.key !== "Enter")) return;
    const a = ev.target && ev.target.closest ? ev.target.closest(".cvl-item") : null;
    if (!a) return;
    ev.preventDefault();
    alternarItem(a, { focar: true });
  });

  /* ---------------- filtros (popover) */
  function filtrosAtivos() {
    const f = A.filtro || {};
    return !!(f.departamento_id || f.canal_id || f.atendente || (f.etiquetas && f.etiquetas.length) || f.nao_lidas);
  }
  function contarFiltrosAtivos() {
    const f = A.filtro || {};
    return Number(!!f.departamento_id) + Number(!!f.canal_id) + Number(!!f.atendente)
      + (Array.isArray(f.etiquetas) ? f.etiquetas.length : 0) + Number(!!f.nao_lidas);
  }
  function desenharFiltrosAtivos() {
    const f = A.filtro || {};
    const deps = (A.base && A.base.departamentos) || [];
    const canais = (A.base && A.base.canais) || [];
    const pessoas = (A.base && A.base.usuarios) || [];
    const etqs = (A.base && A.base.etiquetas) || [];
    const rotulo = (lista, id, fallback) => lista.find(x => x.id === id)?.nome || fallback;
    const ativos = [];
    if (f.departamento_id) ativos.push({ chave: "departamento_id", rotulo: `Depto.: ${rotulo(deps, f.departamento_id, "selecionado")}` });
    if (f.canal_id) ativos.push({ chave: "canal_id", rotulo: `Número: ${rotulo(canais, f.canal_id, "selecionado")}` });
    if (f.atendente) {
      const nome = f.atendente === "eu" ? "Comigo" : f.atendente === "sem" ? "Sem dono" : rotulo(pessoas, f.atendente, "selecionado");
      ativos.push({ chave: "atendente", rotulo: `Atendente: ${nome}` });
    }
    for (const id of f.etiquetas || []) ativos.push({ chave: "etiquetas", id, rotulo: `Etiqueta: ${rotulo(etqs, id, "selecionada")}` });
    if (f.nao_lidas) ativos.push({ chave: "nao_lidas", rotulo: "Só não lidas" });

    ui.limpar(filtrosEl);
    filtrosEl.hidden = ativos.length === 0;
    for (const [idx, item] of ativos.entries()) {
      const b = h("button", { type: "button", class: "cvl-filtro-chip", "aria-label": `Remover filtro ${item.rotulo}` }, h("span", null, item.rotulo), h("b", { "aria-hidden": "true" }, "×"));
      b.addEventListener("click", () => {
        focoDepoisDoFiltro(idx);   // plano 1000b · CB-126
        const novo = { ...f };
        if (item.chave === "etiquetas") {
          novo.etiquetas = (f.etiquetas || []).filter(id => id !== item.id);
          if (!novo.etiquetas.length) delete novo.etiquetas;
        } else delete novo[item.chave];
        A.acoes.mudarLista({ filtro: novo });
      });
      filtrosEl.appendChild(b);
    }
    if (ativos.length > 1) {
      const limpar = h("button", { type: "button", class: "bt bt-fant bt-p cvl-filtros-limpar" }, "Limpar filtros");
      limpar.addEventListener("click", () => { focoDepoisDoFiltro(-1); A.acoes.mudarLista({ filtro: {} }); });   // CB-126
      filtrosEl.appendChild(limpar);
    }
  }
  /** plano 1000b · CB-126: o chip (ou o «Limpar») some ao ser clicado — o foco vai ao chip que ficou no lugar, senão ao botão Filtros. */
  function focoDepoisDoFiltro(idx) {
    setTimeout(() => {
      if (!el.isConnected) return;
      const chips = filtrosEl.hidden ? [] : [...filtrosEl.querySelectorAll(".cvl-filtro-chip")];
      const alvo = idx >= 0 && chips.length ? chips[Math.min(idx, chips.length - 1)] : btFiltro;
      try { alvo.focus(); } catch { /* ok */ }
    }, 0);
  }
  function abrirFiltros() {
    const f = { ...(A.filtro || {}) };
    const deps = (A.base && A.base.departamentos) || [];
    const canais = (A.base && A.base.canais) || [];
    const pessoas = ((A.base && A.base.usuarios) || []).filter(u => u.papel !== "leitura");
    const etqs = (A.base && A.base.etiquetas) || [];
    const sel = (id, rot, ops, valor) => h("div", { class: "campo" }, h("label", { for: id }, rot),
      h("select", { id, class: "sel cvf-sel" }, ops.map(o => h("option", { value: o.v, selected: String(o.v) === String(valor || "") }, o.r))));
    const cDep = deps.length > 1 ? sel("cvf-dep", "Departamento", [{ v: "", r: "Todos" }, ...deps.map(d => ({ v: d.id, r: d.nome }))], f.departamento_id) : null;
    const cCanal = canais.length > 1 ? sel("cvf-canal", "Número", [{ v: "", r: "Todos" }, ...canais.map(c => ({ v: c.id, r: c.nome }))], f.canal_id) : null;
    // plano 1000b · CB-068: quem só lê nunca tem conversa atribuída — «Comigo» esvaziaria a lista
    const cAt = sel("cvf-at", "Atendente", [{ v: "", r: "Qualquer um" }, A.podeEscrever ? { v: "eu", r: "Comigo" } : null, { v: "sem", r: "Sem dono" }].filter(Boolean).concat(
      pessoas.filter(p => !A.eu || p.id !== A.eu.id).map(p => ({ v: p.id, r: p.nome }))), f.atendente);
    const marcadas = new Set(f.etiquetas || []);
    const cEtq = etqs.length ? h("fieldset", { class: "campo" }, h("legend", null, "Etiquetas (qualquer uma)"),
      h("div", { class: "multi-opcoes cvf-etqs" }, etqs.map(e => {
        const idc = `cvf-e-${e.id}`;
        return h("label", { class: "chip-check", for: idc }, h("input", { type: "checkbox", id: idc, value: e.id, checked: marcadas.has(e.id) }), ui.etiqueta(e));
      }))) : null;
    const cNl = ui.campo({ tipo: "interruptor", nome: "nao_lidas", rotulo: "Só não lidas", valor: !!f.nao_lidas });
    // plano 1000 · CA-228: «Linhas compactas» não é filtro — mudou para o menu do sino (preferências da central, junto de som e avisos)
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limparB = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const corpo = h("div", { class: "pilha cvf" },
      h("p", { class: "rotulo" }, "Filtrar a lista"), cDep, cCanal, cAt, cEtq, cNl,
      h("div", { class: "linha linha-fim" }, limparB, aplicar));
    const pop = ui.flutuante(btFiltro, corpo, { largura: 300 });
    const ler = () => {
      const r = {};
      const v = id => { const x = corpo.querySelector(`#${id}`); return x ? x.value : ""; };
      if (v("cvf-dep")) r.departamento_id = v("cvf-dep");
      if (v("cvf-canal")) r.canal_id = v("cvf-canal");
      if (v("cvf-at")) r.atendente = v("cvf-at");
      const ids = [...corpo.querySelectorAll("fieldset input[type=checkbox]:checked")].map(x => x.value);
      if (ids.length) r.etiquetas = ids;
      const nl = corpo.querySelector("input[name=nao_lidas]");
      if (nl && nl.checked) r.nao_lidas = true;
      return r;
    };
    aplicar.addEventListener("click", () => { pop.fechar(); A.acoes.mudarLista({ filtro: ler() }); });
    limparB.addEventListener("click", () => { pop.fechar(); A.acoes.mudarLista({ filtro: {} }); });
  }

  /* ---------------- itens */
  const cache = new Map();   // id → {el, sig}
  function etiquetaDe(id) { return ((A.base && A.base.etiquetas) || []).find(e => e.id === id); }
  // plano 50 · 34: ícone do tipo da última mensagem (o servidor manda só o resumo: «Foto», «Áudio: …») e selo do canal quando há mais de um número
  const ICONE_TIPO = Object.freeze({ imagem: "imagem", sticker: "imagem", audio: "microfone", video: "video", documento: "documento", template: "modelo", localizacao: "globo", contato: "contato" });
  const ROTULO_TIPO = Object.freeze({ imagem: "Foto", sticker: "Figurinha", audio: "Áudio", video: "Vídeo", documento: "Documento", template: "Modelo", localizacao: "Localização", contato: "Contato" });
  const ORIGEM_LISTA = Object.freeze({ anuncio: "Anúncio", site: "Site", organico: "Orgânico", indicacao: "Indicação", formulario: "Formulário" });
  function multiCanal() { return ((A.base && A.base.canais) || []).length > 1; }
  function avatarComCanal(c, nome) {
    const av = ui.avatar(nome, c.contato && c.contato.id);
    const canal = c.canal || ((A.base && A.base.canais) || []).find(k => k.id === c.canal_id);
    if (!multiCanal() || !canal) return av;
    const prov = canal.provedor === "codewords" ? "codewords" : "meta";
    return h("span", { class: "cvl-av", "aria-hidden": "true" }, av,
      // plano 1000 · CA-090: o title diz que é o NÚMERO por onde a conversa chegou (antes «via Recepção», sem dizer o quê)
      h("i", { class: "cvl-canal", dataset: { provedor: prov }, title: `Chegou pelo número ${canal.nome || (prov === "codewords" ? "CodeWords" : "WhatsApp oficial")}` }, ui.icone("whatsapp")));
  }

  /** CA-052: o horário de atendimento que vale para a conversa (departamento dela ou o padrão), quando a tela o conhece
      (hoje só o admin recebe base.config.departamentos[].horario); undefined = a espera conta minutos corridos. */
  function horarioDe(c) {
    const deps = (A.base && A.base.config && A.base.config.departamentos) || [];
    const d = deps.find(x => x && x.id === c.departamento_id) || deps.find(x => x && x.padrao);
    return d && Object.prototype.hasOwnProperty.call(d, "horario") ? d.horario : undefined;
  }
  /** A espera da linha (SLA), nos minutos de atendimento quando o horário é conhecido. */
  function esperaDe(c) {
    if (!(c.status === "aberta" && c.aguardando && c.ultima_entrada_em)) return null;
    const hor = horarioDe(c);
    return hor === undefined ? { ...L.nivelEspera(c.ultima_entrada_em), uteis: false, chegouFechado: false } : L.nivelEsperaUtil(c.ultima_entrada_em, new Date(), hor);
  }
  /** CA-092: só a linha com SLA (aguardando) muda a cada minuto; as outras só na virada do dia (a hora «14:05» vira «Ontem»). */
  function assinatura(c, sel, minuto, dia) {
    const comSla = c.status === "aberta" && c.aguardando && c.ultima_entrada_em;
    return JSON.stringify([A.acoes.rascunhoDe(c.id), A.acoes.filaResumo(c.id), c.contato && c.contato.nome, c.contato && c.contato.telefone, c.ultima_msg_em, c.ultima_msg_resumo, c.ultima_msg_dir,
      c.nao_lidas, c.status, c.atribuida_a, c.atribuida_nome, c.aguardando, c.ultima_entrada_em, c.etiquetas, c.negocio, sel, comSla ? minuto : dia, A.aba, !!A.busca, c.contato && c.contato.origem,
      (A.base && A.base.etiquetas || []).length, c.departamento_id, selecionando ? (selecao.has(c.id) ? 2 : 1) : 0,
      c.oculta, c.ultima_msg_origem, c.ultima_msg_por, c.ultima_msg_por_nome,
      comSla ? (horarioDe(c) === undefined ? "-" : horarioDe(c)) : 0]);
  }

  function criarItem(c, sel) {
    const nome = A.acoes.nomeContato(c.contato);
    const nl = Number(c.nao_lidas) || 0;
    const resumo = c.ultima_msg_resumo ? String(c.ultima_msg_resumo) : (c.status === "aberta" && !c.ultima_msg_dir ? "Conversa iniciada — sem mensagens ainda" : "");
    const rascunho = L.textoRascunhoLista(A.acoes.rascunhoDe(c.id));       // M36: o que foi digitado e não enviado aparece na linha, em itálico
    // com mensagem nova do cliente, a linha mostra a mensagem DELE (é o que precisa ser lido) e o rascunho vira um selo pequeno
    const rascunhoNaLinha = !!rascunho && !nl;
    // plano 1000 · CA-247: «Você:» só quando foi a própria pessoa — IA, automação ou colega têm o nome deles (por detecção: o servidor ainda não manda a origem)
    const prefixo = L.prefixoResumoLista(c, A.eu && A.eu.id);
    const meta = [];
    // fila de saída: mensagem desta conversa que não saiu ("!") ou que ainda espera na fila (relógio) — visível sem abrir a conversa
    const fila = A.acoes.filaResumo(c.id);
    const filaTxt = fila === "falhou" ? "Mensagem não enviada" : fila === "pendente" ? "Mensagem na fila de envio" : "";
    if (fila === "falhou") meta.push(h("span", { class: "cvl-fila cvl-fila-falhou", title: `${filaTxt}: abra para ver o motivo` }, "!"));
    else if (fila === "pendente") meta.push(h("span", { class: "cvl-fila", title: filaTxt }, ui.icone("relogio")));
    if (rascunho && !rascunhoNaLinha) meta.push(h("span", { class: "cvl-selo-rasc", title: `Rascunho: ${rascunho}` }, ui.icone("editar")));
    // etapa e etiquetas viram pontos de cor (o nome fica no tooltip e no rótulo do item): nenhum selo é cortado com reticências
    if (c.negocio && c.negocio.estagio_nome) {
      const cor = ui.corOk(c.negocio.estagio_cor);
      meta.push(h("span", { class: "cvl-dot cvl-dot-etapa", style: cor ? { "--cor": cor } : null, title: `Etapa: ${c.negocio.estagio_nome}`, role: "img", "aria-label": `Etapa: ${c.negocio.estagio_nome}` }));
    }
    // SLA visual (34): a espera muda de cor aos 15, 30 e 60 min; a linha ganha a mesma marca na borda.
    // CA-052: com o horário de atendimento conhecido, só conta o tempo com a empresa aberta (sábado 20h → segunda 9h15 = 75 min, não 37 h)
    const sla = esperaDe(c);
    const esperaTxt = sla ? (sla.uteis ? L.textoMinutos(sla.minutos) : L.tempoEspera(c.ultima_entrada_em)) : "";
    if (sla) {
      // CA-090: «Esperando resposta há 4 min» (sem o dois-pontos sobrando); nas faixas longas, a faixa e o tempo exato
      const rotSla = { aten: "Esperando há mais de 15 min", ruim: "Esperando há mais de 30 min", critico: "Esperando há mais de 1 h" }[sla.nivel];
      const util = sla.uteis ? ` de atendimento${sla.chegouFechado ? " (chegou fora do horário)" : ""}` : "";
      const esperaLonga = sla.uteis ? esperaTxt : L.tempoEsperaLongo(c.ultima_entrada_em);   // plano 1000b · CB-029: title «há 3 dias», selo «3 d»
      meta.push(h("span", { class: "cvl-espera", dataset: { sla: sla.nivel, uteis: sla.uteis ? "1" : null },
        title: rotSla ? `${rotSla} (${esperaLonga}${util})` : `Esperando resposta há ${esperaLonga}${util}` }, ui.icone("relogio"), esperaTxt));
    }
    // CA-235: na aba Ocultas e na busca, a linha diz que o contato está bloqueado
    if (c.oculta) meta.push(ui.pilula("Bloqueado", "ruim", { class: "cvl-bloq", title: "Contato bloqueado: o que ele manda fica guardado aqui, sem avisar ninguém" }));
    if (A.busca && c.status !== "aberta") meta.push(ui.pilula(c.status === "resolvida" ? "Resolvida" : "Pendente", c.status === "resolvida" ? "neutra" : "aten"));
    // D17: de onde o contato veio (pílula de origem da frente A), por detecção — o nx_cv_listar de hoje ainda não manda contato.origem
    const origem = c.contato && c.contato.origem;
    if (origem && ORIGEM_LISTA[origem]) meta.push(ui.pilula(ORIGEM_LISTA[origem], origem, { variante: "origem", tamanho: "p", title: `Veio de: ${ORIGEM_LISTA[origem]}` }));
    const etqs = (c.etiquetas || []).map(etiquetaDe).filter(Boolean);
    for (const e of etqs.slice(0, 3)) {
      const cor = ui.corOk(e.cor);
      meta.push(h("span", { class: "cvl-dot", style: cor ? { "--cor": cor } : null, title: `Etiqueta: ${e.nome}`, role: "img", "aria-label": `Etiqueta: ${e.nome}` }));
    }
    if (etqs.length > 3) meta.push(h("span", { class: "cvl-mais-etq", title: etqs.slice(3).map(e => e.nome).join(", ") }, `+${etqs.length - 3}`));
    // CA-043: no toque ninguém vê o title dos pontos — no celular a etapa e a 1ª etiqueta aparecem por extenso («Avaliação · Urgente +1»)
    const metaTxt = L.textoMetaLista(c.negocio && c.negocio.estagio_nome, etqs);
    if (metaTxt) meta.push(h("span", { class: "cvl-meta-txt" }, metaTxt));
    if (c.atribuida_a) {
      const av = ui.avatar(c.atribuida_nome || "?", c.atribuida_a);
      av.classList.add("cvl-dono");
      av.setAttribute("title", `Com ${c.atribuida_nome || "atendente"}`);
      meta.push(av);
    }
    const rotuloA11y = [nome, c.negocio && c.negocio.estagio_nome ? `etapa ${c.negocio.estagio_nome}` : null, etqs.length ? `etiquetas ${etqs.map(e => e.nome).join(", ")}` : null, nl ? `${nl} não ${nl === 1 ? "lida" : "lidas"}` : null,
      filaTxt || null,
      rascunhoNaLinha ? `Rascunho: ${rascunho}` : resumo ? `${prefixo}${resumo}` : null,
      rascunho && !rascunhoNaLinha ? "tem rascunho" : null, L.horaLista(c.ultima_msg_em),
      sla ? `esperando há ${esperaTxt}${sla.uteis ? " de atendimento" : ""}${sla.nivel === "critico" || sla.nivel === "ruim" ? ", espera longa" : ""}` : null,
      multiCanal() && c.canal ? `via ${c.canal.nome}` : null,
      c.atribuida_nome ? `com ${c.atribuida_nome}` : "sem dono"].filter(Boolean).join(", ");
    const tipoUlt = rascunhoNaLinha ? null : L.tipoDoResumo(resumo);
    const marcada = selecionando && selecao.has(c.id);
    const a = h("a", { class: "cvl-item", href: `#/conversas/${c.id}`, "aria-current": sel && !selecionando ? "true" : null, "aria-label": rotuloA11y,
      role: selecionando ? "checkbox" : null, "aria-checked": selecionando ? String(marcada) : null,
      dataset: { id: c.id, naoLida: nl ? "1" : "0", sla: sla ? sla.nivel : null, sel: selecionando ? (marcada ? "1" : "0") : null } },
      selecionando ? h("span", { class: "cvl-check", "aria-hidden": "true" }, marcada ? ui.icone("check") : null) : avatarComCanal(c, nome),
      h("span", { class: "cvl-nome" }, nome),
      h("span", { class: "cvl-hora" }, L.horaLista(c.ultima_msg_em)),
      rascunhoNaLinha ? h("span", { class: "cvl-resumo cvl-rascunho" }, h("em", null, "Rascunho: "), rascunho)
        : h("span", { class: "cvl-resumo", dataset: { tipo: tipoUlt || "texto" } }, prefixo && resumo ? h("b", null, prefixo) : null,
          tipoUlt ? h("span", { class: "cvl-tipo", title: ROTULO_TIPO[tipoUlt] || "" }, A.icone(ICONE_TIPO[tipoUlt] || "clipe", "cvl-tipo-ic")) : null, resumo),
      nl ? h("span", { class: "cvl-badge", "aria-hidden": "true" }, nl > 99 ? "99+" : String(nl)) : h("span", { "aria-hidden": "true" }),
      meta.length ? h("span", { class: "cvl-meta", "aria-hidden": "true" }, meta) : null);
    // plano 1000 · CA-109: no celular, deslizar a linha para a esquerda resolve e para a direita marca como lida — sempre com Desfazer
    if (!selecionando && A.podeEscrever && L.aparelhoDeToque() && typeof ui.deslizar === "function") {
      const esq = c.status !== "resolvida" && typeof A.acoes.resolverLote === "function" ? () => A.acoes.resolverLote([c.id]) : null;
      // plano 1000b · CB-007: deslizar para marcar como lida só na conversa que a pessoa pode zerar (sem dono ou dela)
      const podeLida = typeof A.acoes.podeMarcarLida === "function" ? A.acoes.podeMarcarLida(c) : L.podeMarcarLida(c, A.eu, A.podeEscrever);
      const dir = nl > 0 && podeLida && typeof A.acoes.lidaComDesfazer === "function" ? () => A.acoes.lidaComDesfazer(c.id) : null;
      if (esq || dir) {
        a.dataset.gestoE = esq ? "Resolver" : "";
        a.dataset.gestoD = dir ? "Marcar como lida" : "";
        try { ui.deslizar(a, { esquerda: esq, direita: dir }); } catch { /* sem gesto: o ⋮ da conversa continua */ }
      }
    }
    return a;
  }

  /* ---------------- busca nas mensagens (P0-B) */
  const blocoMsgs = h("section", { class: "cvl-msgs", "aria-label": "Mensagens encontradas", hidden: true });
  /** Desenha o bloco "Nas mensagens"; devolve true quando há algo para mostrar (itens, carregando ou erro). */
  function renderBlocoMsgs() {
    ui.limpar(blocoMsgs);
    const b = A.buscaMsgs;
    const q = (A.busca || "").trim();
    if (!b || q.length < 3 || b.q !== q) { blocoMsgs.hidden = true; return false; }
    blocoMsgs.hidden = false;
    blocoMsgs.appendChild(h("h2", { class: "rotulo cvl-msgs-tit" }, "Nas mensagens"));
    blocoMsgs.setAttribute("aria-busy", String(!!b.carregando));
    if (b.carregando) { blocoMsgs.appendChild(h("p", { class: "sub cvl-msgs-info", role: "status" }, "Procurando nas mensagens…")); return true; }
    if (b.erro) {
      // sem role=alert/status aqui: este bloco é redesenhado a cada render e repetiria a frase sem parar; quem anuncia (uma vez) é buscarMensagens
      const aviso = h("p", { class: "sub cvl-msgs-info" }, "Não deu para procurar nas mensagens agora.");
      const tentar = h("button", { type: "button", class: "bt bt-fant bt-p cvl-msgs-tentar", "aria-label": "Tentar buscar mensagens novamente" }, "Tentar novamente");
      tentar.addEventListener("click", () => {
        try { busca.focus({ preventScroll: true }); } catch { /* o botão vai ser redesenhado: o foco volta para a busca */ }
        if (A.acoes.repetirBuscaMensagens) A.acoes.repetirBuscaMensagens();
      });
      blocoMsgs.append(aviso, tentar); return true;
    }
    if (!b.itens.length) { blocoMsgs.appendChild(h("p", { class: "sub cvl-msgs-info" }, `Nenhuma mensagem com «${q}».`)); return false; }
    for (const r of b.itens) {
      const partes = L.partesDestaque(r.trecho || "", q).map(p => (p.marca ? h("mark", null, p.t) : p.t));
      const nota = r.tipo === "nota";
      blocoMsgs.appendChild(h("a", { class: "cvl-msg", href: `#/conversas/${r.conversa_id}?msg=${r.mensagem_id}`,
        "aria-label": `${r.contato_nome || "Contato"}${nota ? ", nota interna" : ""}: ${r.trecho || ""}` },
        h("span", { class: "cvl-msg-l1", "aria-hidden": "true" }, h("b", null, r.contato_nome || "Contato"),
          nota ? ui.pilula("Nota", "aten") : null,
          h("time", { class: "cvl-hora", datetime: r.criado_em }, L.horaLista(r.criado_em))),
        h("span", { class: "cvl-msg-trecho", "aria-hidden": "true" }, (() => { const pre = L.prefixoMsgBusca(r, A.eu && A.eu.id); return pre ? h("b", null, pre) : null; })(), ...partes)));   // plano 1000b · CB-008
    }
    return true;
  }

  let ultimoVazio = null;
  function renderItens({ reset } = {}) {
    if (A.erroLista && !A.itens.length) {
      cache.clear();
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(A.erroLista, () => A.acoes.carregarLista({ reset: true })));
      return;
    }
    if (A.carregandoLista && reset) { cache.clear(); ui.limpar(lista); lista.appendChild(ui.esqueleto("lista", 8)); return; }
    if (!A.itens.length) {
      cache.clear();
      const aba = L.ABAS.find(x => x.id === A.aba);
      const semCanal = A.base && !(A.base.canais || []).length;
      const bm = A.buscaMsgs;
      const cont = A.contagens || {};
      const chave = `${A.aba}|${A.busca}|${semCanal}|${filtrosAtivos()}|${bm ? `${bm.q}:${bm.carregando}:${bm.itens.length}:${!!bm.erro}` : "-"}|${Number(cont.aguardando) || 0}:${Number(cont.sem_dono) || 0}`;
      if (ultimoVazio === chave && (lista.querySelector(".vazio") || lista.contains(blocoMsgs))) return;
      ultimoVazio = chave;
      ui.limpar(lista);
      if (A.busca) {
        const temMsgs = renderBlocoMsgs();
        if (temMsgs) lista.appendChild(h("p", { class: "sub cvl-msgs-info", role: "status" }, "Nenhum contato ou protocolo com esse termo."));
        else lista.appendChild(ui.vazio({ titulo: "Nada encontrado.", texto: "Confira o nome, o telefone, o protocolo ou um trecho da mensagem.", icone: "busca", tema: "busca" }));   // `tema`: ilustração da frente A (ignorado onde não existe)
        // plano 1000 · CA-091: a busca é um telefone válido e ninguém tem esse número — o próximo passo é falar com ele
        const q = String(A.busca || "").trim();
        if (A.podeEscrever && /^[\d\s()+.-]{8,}$/.test(q) && !L.erroTelefone(q)) {
          lista.appendChild(h("div", { class: "linha cvl-vazio-acoes cvl-nova-tel" },
            h("button", { type: "button", class: "bt bt-prim bt-p", on: { click: () => A.acoes.novaConversa({ telefone: q }) } }, ui.icone("mais"), `Nova conversa com ${L.mascaraTelefone(q)}`)));
        }
        if (!blocoMsgs.hidden) lista.appendChild(blocoMsgs);
      }
      else if (filtrosAtivos()) lista.appendChild(ui.vazio({ titulo: "Nenhuma conversa com esses filtros.", icone: "filtro", tema: "busca", acao: { rotulo: "Limpar filtros", fn: () => A.acoes.mudarLista({ filtro: {} }) } }));
      else if (A.aba === "minhas" && A.podeEscrever && ((Number(cont.aguardando) || 0) > 0 || (Number(cont.sem_dono) || 0) > 0)) {
        // CA-049: «Minhas» vazia com gente esperando — o próximo passo está no próprio vazio
        const ag = Number(cont.aguardando) || 0, sd = Number(cont.sem_dono) || 0;
        const caixa = h("div", { class: "cvl-vazio-minhas" }, ui.vazio({ titulo: aba ? aba.vazio : "Nada por aqui.", icone: "chat", tema: "conversas",
          texto: ag ? `${ag} ${ag === 1 ? "cliente espera" : "clientes esperam"} resposta.` : `${sd} ${sd === 1 ? "conversa está" : "conversas estão"} sem dono.` }));
        const acoesVazio = h("div", { class: "linha cvl-vazio-acoes" },
          ag ? h("button", { type: "button", class: "bt bt-prim bt-p cvl-vazio-atender", on: { click: ev => A.acoes.atenderProximo(ev.currentTarget) } }, ui.icone("seta-dir"), `Atender o próximo (${ag} esperando)`) : null,
          sd ? h("button", { type: "button", class: "bt bt-fant bt-p cvl-vazio-semdono", on: { click: () => escolherAba("sem_dono") } }, `Ver Sem dono (${sd})`) : null);
        caixa.appendChild(acoesVazio);
        lista.appendChild(caixa);
      }
      else lista.appendChild(ui.vazio({ titulo: aba ? aba.vazio : "Nada por aqui.", icone: "chat", tema: "conversas" }));
      maisBox.hidden = true;
      return;
    }
    ultimoVazio = null;
    const minuto = Math.floor(Date.now() / 60000);
    const dia = L.diaSP(Date.now());
    // j/k: a linha com o foco pode ser recriada neste desenho (vira o minuto, chega mensagem); o foco volta para a MESMA conversa no fim
    const focada = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".cvl-item") : null;
    const idFocado = focada && lista.contains(focada) ? focada.dataset.id : null;
    const vivos = new Set();
    const ordem = [];
    for (const c of A.itens) {
      const sel = c.id === A.selId;
      const sig = assinatura(c, sel, minuto, dia);
      let x = cache.get(c.id);
      if (!x || x.sig !== sig) {
        const novo = criarItem(c, sel);
        if (x && x.el.isConnected) x.el.replaceWith(novo);
        x = { el: novo, sig };
        cache.set(c.id, x);
      }
      vivos.add(c.id);
      ordem.push(x.el);
    }
    for (const [id, x] of cache) if (!vivos.has(id)) { x.el.remove(); cache.delete(id); }
    for (const n of [...lista.children]) if (!n.classList.contains("cvl-item") && n !== maisBox && n !== blocoMsgs) n.remove();
    ordem.forEach((node, i) => { if (lista.children[i] !== node) lista.insertBefore(node, lista.children[i] || null); });
    maisBox.hidden = !A.temMais;
    if (A.temMais) {
      // CA-050: quantas faltam, quando a contagem da aba vale para o que está na tela (sem busca nem filtro)
      const total = !A.busca && !filtrosAtivos() ? (A.contagens || {})[A.aba] : undefined;
      const rot = L.textoCarregarMais(total, A.itens.length);
      if (!carregandoMais && btMais.textContent !== rot) btMais.textContent = rot;
    }
    if (!A.temMais) maisBox.remove(); else lista.appendChild(maisBox);
    renderBlocoMsgs();
    if (blocoMsgs.hidden) blocoMsgs.remove(); else if (blocoMsgs.parentNode !== lista || lista.lastElementChild !== blocoMsgs) lista.appendChild(blocoMsgs);
    if (idFocado && !(document.activeElement && lista.contains(document.activeElement))) {
      const volta = [...lista.querySelectorAll(".cvl-item")].find(x => x.dataset.id === idFocado);
      if (volta) try { volta.focus({ preventScroll: true }); } catch { volta.focus(); }
    }
    if (reset) lista.scrollTop = 0;
  }

  function renderCabecalho() {
    const cont = A.contagens || {};
    for (const a of L.ABAS) {
      const v = a.id === "resolvidas" || a.id === "ocultas" ? null : cont[a.id];
      contadoresAba.set(a.id, v === undefined || v === null ? 0 : v);
      if (L.ABAS_FIXAS.includes(a.id) && seg) seg.contar(a.id, v === undefined || v === null ? null : (v > 999 ? "999+" : String(v)));
      const x = seg && seg.querySelector(`[data-valor="${a.id}"] .seg-n`);
      if (x) x.dataset.alerta = a.id === "aguardando" && v > 0 ? "1" : "0";
    }
    const extra = A.aba && !L.ABAS_FIXAS.includes(A.aba) ? L.ABAS.find(x => x.id === A.aba) : null;
    // sem aba marcada quando há busca (a lista mostra todas as abas) ou quando a aba atual mora no menu "Mais situações"
    const semSel = !!A.busca || !!extra;
    abasEl.dataset.semsel = semSel ? "1" : "0";
    if (seg) {
      for (const x of L.ABAS_FIXAS) { const op = seg.querySelector(`[data-valor="${x}"]`); if (op) op.title = `${op.querySelector(".seg-rot").textContent}: ${contadoresAba.get(x) || 0}`; }
      if (!semSel) seg.ativar(abaDestaque());
      for (const b of seg.querySelectorAll(".seg-op")) {
        if (A.busca) { b.removeAttribute("role"); b.removeAttribute("aria-selected"); b.tabIndex = 0; }
        else { b.setAttribute("role", "tab"); if (semSel) { b.setAttribute("aria-selected", "false"); b.tabIndex = 0; } }
      }
      seg.setAttribute("role", A.busca ? "none" : "tablist");
      seg.reposicionar();
    }
    // a lista é o painel da aba marcada; durante a busca ela mostra todas as abas e as abas viram um grupo de filtros
    const abaAtiva = seg && seg.querySelector('.seg-op[aria-selected="true"]');
    if (A.busca) {
      abasEl.setAttribute("role", "group");
      abasEl.setAttribute("aria-label", "Filtrar conversas por situação");
      lista.removeAttribute("role");
      lista.removeAttribute("aria-labelledby");
    } else {
      abasEl.removeAttribute("role");
      abasEl.removeAttribute("aria-label");
      lista.setAttribute("role", "tabpanel");
      if (abaAtiva) lista.setAttribute("aria-labelledby", abaAtiva.id);
      else lista.removeAttribute("aria-labelledby");
    }
    if (btVisoes) {
      btVisoes.dataset.ativo = extra && !A.busca ? "1" : "0";
      btVisoes.setAttribute("aria-label", extra && !A.busca ? `Mais situações (agora: ${extra.rotulo})` : "Mais situações");
    }
    const ag = Number(cont.aguardando) || 0, nl = Number(cont.nao_lidas) || 0;
    sub.textContent = extra && !A.busca ? `${extra.rotulo}${contadoresAba.get(extra.id) ? ` · ${contadoresAba.get(extra.id)}` : ""}`
      // plano 1000 · CA-125: conta CONVERSAS (o selo do menu tem o mesmo número e era lido como «3 mensagens»)
      : ag ? `${ag} esperando resposta` : nl ? `${nl} ${nl === 1 ? "conversa com mensagens novas" : "conversas com mensagens novas"}`
      // plano 1000b · CB-015: «Tudo respondido» só com as contagens lidas e zeradas — antes de chegar, «Carregando…»; com a lista em erro, «Sem atualizar»
      : A.erroLista ? "Sem atualizar" : !Object.keys(cont).length ? "Carregando…" : "Tudo respondido";
    if (btAtender) { btAtender.hidden = !(ag > 0); nAtender.textContent = ag > 99 ? "99+" : String(ag); btAtender.setAttribute("aria-label", `Atender o próximo (${ag} esperando)`); }
    ponto.hidden = !filtrosAtivos();
    { const p = A.acoes.lerAvisos(); btAvisos.dataset.ligado = p.som || p.tela ? "1" : "0";
      btAvisos.setAttribute("aria-label", `Avisos e aparência da lista (${p.som ? "som ligado" : "som desligado"}${p.tela ? ", área de trabalho ligada" : ""})`); }
    const nFiltros = contarFiltrosAtivos();
    btFiltro.setAttribute("aria-pressed", String(nFiltros > 0));
    btFiltro.setAttribute("aria-label", nFiltros ? `Filtros (${nFiltros} ativo${nFiltros === 1 ? "" : "s"})` : "Filtros");
    desenharFiltrosAtivos();
    // sem número conectado
    const semCanal = A.base && !(A.base.canais || []).length;
    avisoCanal.hidden = !semCanal;
    if (semCanal && !avisoCanal.firstChild) {
      const admin = A.acoes.pode("admin");
      avisoCanal.appendChild(h("div", { class: "aviso aviso-aten" }, ui.icone("whatsapp"),
        h("div", { class: "pilha-p" },
          h("p", null, admin ? "Conecte o WhatsApp da empresa para receber conversas aqui." : "Peça ao administrador para conectar o WhatsApp."),
          admin ? h("div", null, h("a", { class: "bt bt-prim bt-p", href: "#/config/numeros" }, "Conectar número")) : null)));
    }
    desenharCaido();
    const soCache = !!(A.listaSoCache && A.listaCacheEm);
    avisoCache.hidden = !soCache;
    // plano 1000b · CB-016: a lista guardada de ontem diz «lista de ontem às 14:02» (a regra do desdeTexto), não só a hora
    if (soCache) { const t = `Sem conexão · lista de ${L.desdeTexto(A.listaCacheEm).replace(/^desde /, "")}. Atualiza sozinha quando a internet voltar.`; if (avisoCache.textContent !== t) avisoCache.textContent = t; }
    const atrasada = !soCache && (Number(A.falhasLista) || 0) >= 3 && A.itens.length > 0;   // plano 1000b · CB-087
    avisoAtraso.hidden = !atrasada;
    if (atrasada) { const t = A.listaOkEm ? `Lista sem atualizar ${L.desdeTexto(A.listaOkEm)}.` : "Lista sem atualizar."; if (atrasoTxt.textContent !== t) atrasoTxt.textContent = t; }
    // busca ativa
    const q = (A.busca || "").trim();
    infoBusca.hidden = q.length < 2;
    if (q.length >= 2) {
      ui.limpar(infoBusca);
      // plano 1000b · CB-070: a contagem vai para o leitor de tela uma vez por resultado (600 ms depois da última mudança)
      const n = A.itens.length;
      const sig = A.carregandoLista ? "" : `${q}|${n}|${A.temMais ? 1 : 0}`;
      if (sig && sig !== sigBuscaAnunciada) {
        clearTimeout(timerAnuncioBusca);
        timerAnuncioBusca = setTimeout(() => {
          if (sigBuscaAnunciada === sig) return;
          sigBuscaAnunciada = sig;
          if (typeof ui.anunciar === "function" && el.isConnected) ui.anunciar(n ? `${n}${A.temMais ? " ou mais" : ""} ${n === 1 ? "conversa" : "conversas"} para «${q}»` : `Nenhuma conversa para «${q}»`);
        }, 600);
      }
      // plano 1000b · CB-071: com departamento/etiqueta filtrando, a frase não promete «todas as abas» sem ressalva
      infoBusca.append(h("span", null, `Resultados para «${q}» em todas as abas${filtrosAtivos() ? ", com os filtros" : ""}`),
        h("button", { type: "button", class: "bt bt-fant bt-p cvl-busca-limpar", on: { click: () => { busca.value = ""; A.acoes.mudarLista({ busca: "" }); busca.focus(); } } }, "Limpar"));   // CB-126: o foco volta à busca
    }
  }

  /** D18: «Número «Recepção» desconectado desde 14:02 — as mensagens não chegam nem saem» + «Ver número» (admin). Só redesenha quando muda. */
  function desenharCaido() {
    const caidos = typeof A.acoes.canaisCaidos === "function" ? A.acoes.canaisCaidos() : [];
    const s = JSON.stringify(caidos.map(c => [c.id, c.nome, c.desde]));
    if (s === sigCaido) return;
    sigCaido = s;
    ui.limpar(avisoCaido);
    avisoCaido.hidden = !caidos.length;
    if (!caidos.length) return;
    const admin = A.acoes.pode("admin");
    const um = caidos[0];
    // plano 1000 · CA-007: «desde 14:02» · «desde ontem às 14:02» · «desde 25/09 às 14:02» (antes: «desde Ontem», com maiúscula no meio)
    const desde = um.desde ? ` ${L.desdeTexto(um.desde)}` : "";
    const texto = caidos.length === 1
      ? `Número «${um.nome || "WhatsApp"}» desconectado${desde}: as mensagens não chegam nem saem por ele até reconectar.`
      : `${caidos.length} números desconectados: as mensagens não chegam nem saem por eles até reconectar.`;
    avisoCaido.append(h("div", { class: "aviso aviso-ruim cvl-caido-in" }, ui.icone("alerta"),
      h("div", { class: "pilha-p" }, h("p", null, texto),
        admin ? h("div", null, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => A.acoes.verNumero() } }, "Ver número"))
          : h("p", { class: "sub" }, "Avise o administrador da empresa."))));
  }

  function render(o = {}) {
    renderCabecalho();
    lista.setAttribute("aria-busy", String(!!A.carregandoLista));
    renderItens(o);
  }

  return {
    el,
    render,
    /** plano 1000b · CB-072: solta o observador da rolagem infinita (a central chama no desmontar). */
    desmontar() { clearTimeout(timerAnuncioBusca); if (observador) { try { observador.disconnect(); } catch { /* ok */ } observador = null; } },   // CB-070: e o aviso da busca
    mostrarCarregando() { cache.clear(); lista.setAttribute("aria-busy", "true"); ui.limpar(lista); lista.appendChild(ui.esqueleto("lista", 8)); renderCabecalho(); },
    focarBusca() { busca.focus(); busca.select(); },
    anunciar,
    /** Rola a lista até a conversa aberta (Alt+↓/↑ abrem vizinhas que podem estar fora da tela). */
    mostrarSelecionada() { const x = lista.querySelector('.cvl-item[aria-current="true"]'); if (x && x.getClientRects().length) x.scrollIntoView({ block: "nearest" }); },
    /** Devolve o foco do teclado à lista: a conversa aberta ou, sem ela, a primeira. false se a lista está escondida (celular com o chat aberto) ou vazia. */
    focarItem() {
      const alvo = lista.querySelector('.cvl-item[aria-current="true"]') || lista.querySelector(".cvl-item");
      if (!alvo || !alvo.getClientRects().length) return false;
      try { alvo.focus({ preventScroll: false }); } catch { alvo.focus(); }
      return document.activeElement === alvo;
    },
    /** j / k: move o foco entre as conversas (Enter abre). Sem foco numa conversa, parte da aberta ou da primeira. */
    moverFoco(dir) {
      const itens = [...lista.querySelectorAll(".cvl-item")].filter(x => x.getClientRects().length);
      if (!itens.length) return false;
      const atual = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".cvl-item") : null;
      let i = atual ? itens.indexOf(atual) : itens.findIndex(x => x.getAttribute("aria-current") === "true");
      if (i < 0) i = dir > 0 ? -1 : itens.length;
      const j = Math.min(itens.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)));
      itens[j].focus();
      return true;
    },
  };
}
