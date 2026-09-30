/* ============================================================
   ÓRBITA — crm-kanban.js · frente F4 · T5 CRM — Kanban
   - topo: funil, busca (sem acento; dígitos = telefone), filtros com
     chips removíveis, totais (abertos, soma, previsão ponderada) e a
     distribuição por etapa; "+ Novo"
   - colunas com cor, contagem, soma, "+"; "Ver mais" de 30 em 30;
     ganho/perdido só dos últimos 30 dias ("Ver mais antigos")
   - arrastar com mouse (pointer events, fantasma, lugar, rolagem nas
     bordas, zonas Ganhou/Perdeu) e teclado (Espaço pega, ←/→ etapa,
     ↑/↓ posição, Enter solta, Esc cancela; aria-live)
   - soltar em ganho/perdido/agendada abre o modal (valor; motivo;
     data e hora) e só então chama nx_negocio_mover; erro volta o
     cartão e mostra a frase certa (trava do Ads incluída)
   - celular: colunas com rolagem lateral com snap, sem arrastar
   ============================================================ */

const LIMIAR_ARRASTO = 6;           // px antes de virar arrasto
const BORDA_ROLAGEM = 70;           // px da borda que começam a rolar
const PULSO_MIN_MS = 8000;          // recarga silenciosa no máximo a cada 8 s

export async function montarKanban(k, el, rota) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  const cli = ctx.cliente.id;
  const chaveLocal = `nx-app-crm-kb-${cli}`;
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(chaveLocal) || "{}") || {}; } catch { return {}; } };
  const gravarLocal = () => { try { localStorage.setItem(chaveLocal, JSON.stringify({ funil: S.funil && S.funil.id, filtro: S.filtro })); } catch { /* ok */ } };

  const salvo = lerLocal();
  const funis = () => k.base.funis.filter(f => f.ativo !== false);
  const S = {
    funil: k.funil(rota.query && rota.query.funil) || k.funil(salvo.funil) || k.funilPadrao(),
    filtro: salvo.filtro && typeof salvo.filtro === "object" ? salvo.filtro : {},
    todosFechados: false,
    dados: null,
    seq: 0,
    arrasto: null,
    teclado: null,
    ultimaRecarga: 0,
    vivo: true,
  };
  delete S.filtro.fechados_dias;
  const podeMover = k.pode("atendente");
  ctx.titulo(k.v.crm);

  /* ============================================================ estrutura */
  // troca de funil: abas (até 5 funis) ou select (mais que isso)
  const selFunil = h("div", { class: "crm-funis" });
  function trocarFunil(id) {
    if (S.funil && S.funil.id === id) return;
    S.funil = k.funil(id);
    gravarLocal();
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm?funil=${encodeURIComponent(S.funil.id)}`);
    carregar();
  }
  function desenharSelFunil() {
    ui.limpar(selFunil);
    const lista = funis();
    selFunil.hidden = lista.length < 2;
    if (lista.length < 2) return;
    if (lista.length <= 5) {
      const ab = ui.abas({ itens: lista.map(f => ({ id: f.id, rotulo: f.nome, icone: f.conta_no_ads ? "anuncio" : null })),
        ativo: S.funil && S.funil.id, rotulo: "Funis", aoMudar: trocarFunil });
      selFunil.appendChild(ab.el);
    } else {
      const s = h("select", { class: "sel crm-funil-sel", "aria-label": "Funil" }, lista.map(f => h("option", { value: f.id, selected: S.funil && f.id === S.funil.id }, f.nome)));
      s.addEventListener("change", () => trocarFunil(s.value));
      selFunil.appendChild(s);
    }
  }

  const busca = h("input", { type: "search", placeholder: `Buscar ${k.v.min("negocios")}, nome ou telefone`, "aria-label": `Buscar ${k.v.min("negocios")}`, value: S.filtro.busca || "" });
  const aoBuscar = ui.debounce(() => { const q = busca.value.trim(); if (q) S.filtro.busca = q; else delete S.filtro.busca; gravarLocal(); carregar({ silencioso: true }); }, 320);
  busca.addEventListener("input", aoBuscar);
  busca.addEventListener("keydown", ev => { if (ev.key === "Escape" && busca.value) { busca.value = ""; aoBuscar(); } });

  const nFiltros = h("span", { class: "crm-filtro-n", hidden: true });
  const btFiltros = h("button", { type: "button", class: "bt bt-sec crm-filtro-bt", "aria-haspopup": "dialog" }, ui.icone("filtro"), "Filtros", nFiltros);
  btFiltros.addEventListener("click", abrirFiltros);
  const chips = h("div", { class: "crm-chips", "aria-label": "Filtros ativos" });

  const totAbertos = h("b", null, "—"), totSoma = h("b", null, "—"), totPrev = h("b", null, "—");
  const distBarra = h("div", { class: "crm-dist-barra", role: "img" });
  const distLeg = h("div", { class: "crm-dist-leg" });
  const totais = h("section", { class: "crm-totais", "aria-label": "Totais do funil" },
    h("div", { class: "crm-tot" }, h("span", { class: "rotulo" }, `${k.v.negocios} abert${k.v.art("negocio")}s`), totAbertos, h("small", null, "no funil agora")),
    h("div", { class: "crm-tot" }, h("span", { class: "rotulo" }, "Em aberto"), totSoma, h("small", null, "soma dos valores previstos")),
    h("div", { class: "crm-tot crm-tot-prev" }, h("span", { class: "rotulo" }, "Previsão ponderada"), totPrev, h("small", null, "valor × chance de cada etapa")),
    h("div", { class: "crm-dist" }, h("span", { class: "rotulo" }, "Distribuição por etapa"), distBarra, distLeg));

  const quadro = h("div", { class: "kb", role: "region", "aria-label": `Quadro de ${k.v.min("negocios")}`, tabindex: "-1" });
  const instr = h("p", { id: `kb-instr-${cli}`, class: "sr-only" },
    podeMover ? "Enter abre. Espaço pega o cartão para mover: setas esquerda e direita trocam de etapa, cima e baixo mudam a posição, Enter solta, Esc cancela." : "Enter abre.");
  const areaVazia = h("div", { hidden: true });
  const corpoQuadro = h("div", { class: "kb-env" }, quadro);

  const btNovo = podeMover ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => novo({}) } }, ui.icone("mais"), k.v.novo("negocio")) : null;
  el.append(
    h("header", { class: "crm-cab" },
      h("div", null, h("p", { class: "rotulo" }, ctx.cliente.nome), h("div", { class: "crm-titulo" }, h("h1", { class: "titulo-pag" }, k.v.crm), selFunil)),
      h("div", { class: "crm-cab-acoes" }, btNovo)),
    h("div", { class: "pilha-p" }, h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca), btFiltros), chips),
    totais, areaVazia, corpoQuadro, instr);
  desenharSelFunil();

  /* ============================================================ dados */
  function filtroServidor() {
    const f = { ...S.filtro };
    if (S.todosFechados) f.fechados_dias = 0;
    return f;
  }

  async function carregar({ silencioso = false } = {}) {
    const minha = ++S.seq;
    if (!S.funil) { mostrarSemFunil(); return; }
    if (!silencioso || !S.dados) { ui.limpar(quadro); quadro.appendChild(ui.esqueleto("kanban", Math.min(6, S.funil.estagios.length || 4))); }
    desenharChips();
    try {
      const d = await k.api.rpcC("nx_negocios_kanban", { p_funil: S.funil.id, p_filtro: filtroServidor(), p_por_coluna: 30 });
      if (minha !== S.seq || !S.vivo) return;
      S.dados = d;
      S.ultimaRecarga = Date.now();
      desenharQuadro();
    } catch (e) {
      if (minha !== S.seq || !S.vivo) return;
      if (e && e.codigo === "funil_invalido") { await k.recarregarBase(); S.funil = k.funilPadrao(); desenharSelFunil(); if (S.funil) return carregar(); }
      ui.limpar(quadro);
      quadro.appendChild(ui.erroCartao(e, () => carregar()));
    }
  }

  function mostrarSemFunil() {
    ui.limpar(quadro);
    quadro.appendChild(ui.vazio({ titulo: "Nenhum funil ativo.", texto: "Crie um funil em Configurações → Funis e etapas.", icone: "funil",
      acao: k.pode("admin") ? { rotulo: "Abrir configurações", fn: () => ctx.navegar("#/config/funis") } : null }));
  }

  /* ============================================================ desenho */
  const colEls = new Map();    // estagio_id → {sec, lista, n, soma, extra}

  function colunaDe(id) { return S.dados.colunas.find(c => c.estagio_id === id); }

  function desenharQuadro() {
    colEls.clear();
    ui.limpar(quadro);
    const vazioTotal = S.dados.colunas.every(c => !c.total) && L.filtroVazio(S.filtro);
    areaVazia.hidden = !vazioTotal;
    ui.limpar(areaVazia);
    if (vazioTotal) {
      const fem = k.v.art("negocio") === "a";
      areaVazia.appendChild(ui.vazio({
        titulo: `${k.v.nenhum("negocio")} aqui ainda.`,
        texto: `${fem ? "Elas aparecem sozinhas" : "Eles aparecem sozinhos"} quando alguém chama no WhatsApp — ou ${fem ? "crie uma" : "crie um"} agora.`,
        icone: "funil", acao: podeMover ? { rotulo: k.v.novo("negocio"), fn: () => novo({}) } : null }));
    }
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id) || { estagio_id: e.id, total: 0, soma_previsto: 0, soma_valor: 0, itens: [] };
      quadro.appendChild(criarColuna(e, col));
    }
    desenharTotais();
  }

  function criarColuna(e, col) {
    const idNome = `kb-c-${e.id}`;
    const n = h("span", { class: "kb-col-n", "aria-label": "quantidade" });
    const soma = h("span", { class: "kb-col-soma" });
    const lista = h("div", { class: "kb-lista", role: "list", dataset: { estagio: e.id }, "aria-labelledby": idNome });
    const extra = h("div");
    const tipoTxt = e.tipo === "ganho" ? k.v.ganhar : e.tipo === "perdido" ? k.v.perder : `${e.probabilidade}% de chance`;
    const mais = podeMover && e.tipo === "aberto"
      ? h("button", { type: "button", class: "bt-icone kb-col-mais", "aria-label": `${k.v.novo("negocio")} em ${e.nome}`, title: `${k.v.novo("negocio")} em ${e.nome}`,
        on: { click: () => novo({ estagio_id: e.id }) } }, ui.icone("mais")) : null;
    const sec = h("section", { class: "kb-col", dataset: { estagio: e.id, tipo: e.tipo }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, "aria-labelledby": idNome },
      h("header", { class: "kb-col-cab" },
        h("div", { class: "kb-col-l1" }, h("i", { "aria-hidden": "true" }), h("h2", { class: "kb-col-nome", id: idNome }, e.nome), n, mais),
        h("div", { class: "kb-col-l2" }, soma, h("span", { class: "kb-col-tipo" }, tipoTxt))),
      lista, extra);
    colEls.set(e.id, { sec, lista, n, soma, extra, e });
    preencherColuna(e.id, col);
    return sec;
  }

  function preencherColuna(estagioId, col) {
    const c = colEls.get(estagioId);
    if (!c) return;
    const e = c.e;
    col = col || colunaDe(estagioId);
    c.n.textContent = String(col.total || 0);
    const valorSoma = e.tipo === "ganho" ? col.soma_valor : col.soma_previsto;
    c.soma.textContent = Number(valorSoma) ? ui.brl(valorSoma, { centavos: false }) : "R$ 0";
    ui.limpar(c.lista);
    for (const it of col.itens) c.lista.appendChild(criarCartao(it, e));
    if (!col.itens.length) c.lista.appendChild(h("div", { class: "kb-vazia" }, podeMover ? "Arraste um cartão para cá" : "Nada nesta etapa"));
    ui.limpar(c.extra);
    const faltam = (col.total || 0) - col.itens.length;
    if (faltam > 0) {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p kb-mais" }, `Ver mais (${ui.num(faltam)})`);
      b.addEventListener("click", () => verMais(estagioId, b));
      c.lista.appendChild(b);
    }
    if (e.tipo !== "aberto") {
      c.extra.appendChild(h("div", { class: "kb-antigos" },
        S.todosFechados ? "Mostrando todos os fechados." : "Fechados nos últimos 30 dias.",
        h("button", { type: "button", class: "link", on: { click: () => { S.todosFechados = !S.todosFechados; carregar({ silencioso: true }); } } },
          S.todosFechados ? "Só os recentes" : "Ver mais antigos")));
    }
  }

  function desenharTotais() {
    const t = L.previsao(S.dados.colunas, S.funil.estagios);
    totAbertos.textContent = ui.num(t.abertos);
    totSoma.textContent = ui.brl(t.soma_aberto, { centavos: false });
    totPrev.textContent = ui.brl(t.previsao_ponderada, { centavos: false });
    ui.limpar(distBarra); ui.limpar(distLeg);
    const totalGeral = S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const partes = [];
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id);
      const n = col ? Number(col.total) || 0 : 0;
      partes.push(`${e.nome}: ${n}`);
      if (n > 0) distBarra.appendChild(h("i", { style: { "flex-grow": String(n), ...(k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : {}) }, title: `${e.nome}: ${n}` }));
      distLeg.appendChild(h("span", { style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }, h("i", { "aria-hidden": "true" }), `${e.nome} ${n}`));
    }
    if (!totalGeral) distBarra.appendChild(h("i", { style: { "flex-grow": "1" } }));
    distBarra.setAttribute("aria-label", `Distribuição por etapa — ${partes.join(", ")}`);
  }

  function criarCartao(c, e) {
    const titulo = L.tituloCard(c);
    const nomeContato = c.contato && c.contato.nome && c.contato.nome !== titulo ? c.contato.nome : null;
    const sub = [nomeContato, c.servico].filter(Boolean).join(" · ");
    const valor = e.tipo === "ganho" ? (c.valor ?? c.valor_previsto) : c.valor_previsto;
    const sla = e.tipo === "aberto" && L.slaEstourado(c.estagio_em, e.sla_horas);
    const dono = k.usuario(c.dono_id);
    const etqs = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean);
    const selos = [];
    if (c.plataforma) {
      const plataforma = c.plataforma === "google" ? "Google Ads" : c.plataforma === "meta" ? "Meta Ads" : "Anúncio";
      selos.push(ui.pilula(plataforma, c.plataforma === "google" ? "google" : "meta", { icone: "anuncio" }));
    }
    const rastreio = c.rastreio && typeof c.rastreio === "object" ? c.rastreio : {};
    const campanha = c.campanha_nome || c.campanha || c.campanha_ext || rastreio.utm_campaign;
    if (campanha) selos.push(ui.pilula(`Campanha · ${campanha}`, "neutra", { title: String(campanha) }));
    const anuncioNome = c.anuncio_nome || c.anuncio_ext || rastreio.utm_content;
    if (anuncioNome) selos.push(ui.pilula(`Anúncio · ${anuncioNome}`, "neutra", { title: String(anuncioNome) }));
    const origem = c.origem && c.origem !== "anuncio" ? (L.ROTULO_ORIGEM[c.origem] || c.origem) : null;
    if (origem) selos.push(ui.pilula(origem, "neutra", { title: `Origem: ${origem}` }));
    if (c.consulta_em) selos.push(ui.pilula(`${ui.dataCurtaBR ? ui.dataCurtaBR(c.consulta_em) : ui.dataBR(c.consulta_em)} ${ui.horaBR(c.consulta_em)}`, "info", { icone: "relogio", title: "Consulta/visita marcada" }));
    if (c.tarefa) {
      const txt = c.tarefa.atrasada ? "Tarefa atrasada" : c.tarefa.vence_em ? `Tarefa ${ui.relativo(c.tarefa.vence_em)}` : "Tarefa";
      selos.push(h("span", { class: ["kc-tarefa", c.tarefa.atrasada && "atrasada"] }, ui.icone("tarefa"), txt));
    }
    const rotulo = `${titulo}${valor != null ? `, ${ui.brl(valor)}` : ""}${dono ? `, responsável ${dono.nome}` : ""}${c.nao_lidas ? `, ${c.nao_lidas} mensagens não lidas` : ""}`;
    const art = h("article", { class: "kc", role: "listitem", tabindex: "0", dataset: { id: c.id }, "aria-roledescription": "cartão",
      "aria-label": rotulo, "aria-describedby": instr.id, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null },
      h("span", { class: "kc-t" }, titulo),
      sub ? h("span", { class: "kc-s" }, sub) : null,
      selos.length ? h("div", { class: "kc-selos" }, selos) : null,
      etqs.length ? h("div", { class: "kc-etiqs" }, etqs.slice(0, 2).map(x => ui.etiqueta(x)), etqs.length > 2 ? h("span", { class: "kc-mais-etq" }, `+${etqs.length - 2}`) : null) : null,
      h("div", { class: "kc-rod" },
        valor != null ? h("span", { class: "kc-valor" }, ui.brl(valor, { centavos: false })) : h("span", { class: ["kc-valor", "sem"] }, "sem valor"),
        h("span", { class: ["kc-dias", sla && "sla"], title: e.tipo === "aberto" ? `${L.textoDiasEtapa(c.estagio_em)}${sla ? ` — passou do prazo da etapa (${e.sla_horas} h)` : ""}` : null },
          e.tipo === "aberto" ? L.textoDiasEtapa(c.estagio_em).replace(" na etapa", "") : c.fechado_em ? `${e.tipo === "ganho" ? k.v.ganhar.toLowerCase() : "fechado"} ${ui.relativo(c.fechado_em)}` : ""),
        dono ? ui.avatar(dono.nome, dono.id) : h("span", { class: "kc-avatar-vazio", title: "Sem responsável" }, ui.icone("usuario"))),
      c.nao_lidas ? h("span", { class: "kc-naolidas", title: `${c.nao_lidas} não lidas` }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas)) : null);
    art.addEventListener("click", ev => {
      if (S.arrasto && S.arrasto.moveu) return;
      if (S.teclado) return;
      if (ev.target.closest("a, button")) return;
      abrir(c.id);
    });
    art.addEventListener("keydown", ev => teclaCartao(ev, c.id));
    if (podeMover) art.addEventListener("pointerdown", ev => inicioPonteiro(ev, c.id, art));
    return art;
  }

  /* ============================================================ gaveta e novo */
  function abrir(id) {
    N.abrirNegocio(k, id, { aoMudar: () => carregar({ silencioso: true }) });
  }
  function novo(extra) {
    N.novoNegocio(k, { funil_id: S.funil.id, ...extra }, { aoCriar: () => carregar({ silencioso: true }) });
  }

  async function verMais(estagioId, botao) {
    const col = colunaDe(estagioId);
    try {
      const r = await ui.carregando(botao, k.api.rpcC("nx_negocios_coluna", { p_estagio: estagioId, p_filtro: filtroServidor(), p_offset: col.itens.length }));
      const ids = new Set(col.itens.map(x => x.id));
      col.itens = col.itens.concat(r.itens.filter(x => !ids.has(x.id)));
      if (!r.tem_mais) col.total = Math.max(col.total, col.itens.length);
      preencherColuna(estagioId, col);
    } catch (e) { k.toastErro(e); }
  }

  /* ============================================================ mover (comum a mouse e teclado) */
  function indiceNaLista(lista, idIgnorar) {
    return [...lista.querySelectorAll(".kc, .kb-lugar")].filter(x => x.dataset.id !== String(idIgnorar));
  }

  /** soltar(id, etapa, pos) — pos = posição entre os OUTROS cartões da coluna de destino (0 = topo). */
  async function soltar(id, estagioId, indice) {
    const origemCol = S.dados.colunas.find(c => c.itens.some(x => x.id === id));
    if (!origemCol) return;
    const card = origemCol.itens.find(x => x.id === id);
    const posOrig = origemCol.itens.indexOf(card);
    const destino = k.estagio(estagioId);
    const destCol = colunaDe(estagioId);
    if (!destino || !destCol) { desenharQuadro(); return; }
    // vizinhos no destino (sem o próprio cartão)
    const itens = destCol.itens.filter(x => x.id !== id);
    const pos = Math.max(0, Math.min(indice, itens.length));
    if (origemCol === destCol && pos === posOrig) { preencherColuna(estagioId); focarCartao(id); return; }
    const ordem = L.ordemEntre(itens[pos - 1] ? itens[pos - 1].ordem : null, itens[pos] ? itens[pos].ordem : null);
    // perguntas (valor / motivo / data e hora) ANTES de gravar
    let extra = {};
    try { extra = await N.prepararMovimento(k, card, destino); }
    catch (e) { extra = null; k.toastErro(e); }
    if (extra === null) { preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId); focarCartao(id); ui.anunciar("Movimento cancelado."); return; }
    // otimista
    const antes = S.dados.colunas;
    const patch = { status: destino.tipo, ...(extra.valor != null ? { valor: extra.valor } : {}), ...(extra.consulta_em ? { consulta_em: extra.consulta_em } : {}) };
    S.dados.colunas = L.moverLocal(S.dados.colunas, id, estagioId, pos, ordem, patch);
    preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId);
    desenharTotais();
    const elCard = quadro.querySelector(`.kc[data-id="${id}"]`);
    if (elCard) { elCard.classList.add("salvando"); elCard.setAttribute("aria-busy", "true"); }
    focarCartao(id);
    try {
      const novoCard = await N.moverNegocio(k, card, destino, { ordem, extra });
      const col = colunaDe(estagioId);
      const i = col.itens.findIndex(x => x.id === id);
      if (i >= 0) col.itens[i] = { ...col.itens[i], ...novoCard };
      // o servidor devolve o valor real: corrige a soma da coluna
      if (destino.tipo === "ganho" && novoCard.valor != null && patch.valor == null) col.soma_valor = (Number(col.soma_valor) || 0) + Number(novoCard.valor) - Number(card.valor || 0);
      preencherColuna(estagioId);
      desenharTotais();
      const ok = quadro.querySelector(`.kc[data-id="${id}"]`);
      if (ok) ok.classList.add("chegou");
      focarCartao(id);
      if (destino.tipo === "ganho") ui.toast(`${k.v.ganhar}! ${novoCard.valor != null ? ui.brl(novoCard.valor) + " registrados." : ""}`, { tipo: "ok" });
      else if (destino.tipo === "perdido") ui.toast(`Registrado como «${destino.nome}».`, { tipo: "info" });
      ui.anunciar(`${L.tituloCard(card)} movido para ${destino.nome}.`);
    } catch (e) {
      S.dados.colunas = antes;
      preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId);
      desenharTotais();
      focarCartao(id);
      k.toastErro(e);
      ui.anunciar(`Não foi possível mover: ${k.erro(e)}`);
    }
  }

  function focarCartao(id) {
    const c = quadro.querySelector(`.kc[data-id="${id}"]`);
    if (c && (S.teclado || document.activeElement === document.body || el.contains(document.activeElement))) {
      try { c.focus({ preventScroll: false }); } catch { c.focus(); }
    }
  }

  /* ============================================================ teclado */
  function teclaCartao(ev, id) {
    const t = S.teclado;
    const art = ev.currentTarget;
    if (!t) {
      if (ev.key === "Enter") { ev.preventDefault(); abrir(id); return; }
      if ((ev.key === " " || ev.key === "Spacebar") && podeMover) {
        ev.preventDefault();
        const lista = art.parentElement;
        S.teclado = { id, estagio: lista.dataset.estagio, origem: lista.dataset.estagio, art };
        art.classList.add("pego");
        art.setAttribute("aria-pressed", "true");
        ui.anunciar(`Pegou «${L.tituloCard(cardDe(id))}». Setas esquerda e direita trocam de etapa, cima e baixo a posição. Enter solta, Esc cancela.`);
        return;
      }
      // setas sem pegar: navega entre cartões
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(ev.key)) { ev.preventDefault(); navegar(art, ev.key); }
      return;
    }
    if (t.id !== id) return;
    const lista = art.parentElement;
    if (ev.key === "Escape" || ev.key === "Tab") {
      if (ev.key === "Escape") ev.preventDefault();
      cancelarTeclado(true);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      const destino = lista.dataset.estagio;
      const cards = [...lista.querySelectorAll(".kc")];
      const indice = cards.indexOf(art);
      art.classList.remove("pego"); art.removeAttribute("aria-pressed");
      S.teclado = null;
      soltar(id, destino, indice);
      return;
    }
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      ev.preventDefault();
      const cards = [...lista.querySelectorAll(".kc")];
      const i = cards.indexOf(art);
      const j = ev.key === "ArrowUp" ? i - 1 : i + 1;
      if (j < 0 || j >= cards.length) return;
      if (ev.key === "ArrowUp") lista.insertBefore(art, cards[j]); else lista.insertBefore(art, cards[j].nextSibling);
      art.focus();
      ui.anunciar(`Posição ${j + 1} de ${cards.length}.`);
      return;
    }
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const ids = S.funil.estagios.map(e => e.id);
      const i = ids.indexOf(lista.dataset.estagio);
      const j = ev.key === "ArrowLeft" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      const alvo = colEls.get(ids[j]);
      const cards = [...alvo.lista.querySelectorAll(".kc")];
      const pos = Math.min([...lista.querySelectorAll(".kc")].indexOf(art), cards.length);
      const vazia = alvo.lista.querySelector(".kb-vazia"); if (vazia) vazia.hidden = true;
      alvo.lista.insertBefore(art, cards[pos] || alvo.lista.querySelector(".kb-mais") || null);
      art.style.setProperty("--cor", k.cor(alvo.e.cor) || "");
      t.estagio = ids[j];
      art.focus();
      alvo.sec.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      ui.anunciar(`Etapa «${alvo.e.nome}», posição ${pos + 1} de ${cards.length + 1}.`);
    }
  }

  function cancelarTeclado(anunciar) {
    const t = S.teclado;
    if (!t) return;
    S.teclado = null;
    preencherColuna(t.origem);
    if (t.estagio !== t.origem) preencherColuna(t.estagio);
    focarCartao(t.id);
    if (anunciar) ui.anunciar("Movimento cancelado.");
  }

  function navegar(art, tecla) {
    const lista = art.parentElement;
    const cards = [...lista.querySelectorAll(".kc")];
    const i = cards.indexOf(art);
    if (tecla === "ArrowDown" && cards[i + 1]) return cards[i + 1].focus();
    if (tecla === "ArrowUp" && cards[i - 1]) return cards[i - 1].focus();
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      const ids = S.funil.estagios.map(e => e.id);
      let j = ids.indexOf(lista.dataset.estagio);
      while (true) {
        j += tecla === "ArrowLeft" ? -1 : 1;
        if (j < 0 || j >= ids.length) return;
        const alvo = colEls.get(ids[j]);
        const outros = [...alvo.lista.querySelectorAll(".kc")];
        if (outros.length) return outros[Math.min(i, outros.length - 1)].focus();
      }
    }
  }

  function cardDe(id) {
    for (const c of S.dados.colunas) { const x = c.itens.find(y => y.id === id); if (x) return x; }
    return null;
  }

  /* ============================================================ mouse (pointer events) */
  let zonasEl = null;
  function inicioPonteiro(ev, id, art) {
    if (ev.button !== 0 || ev.pointerType === "touch" || S.teclado) return;
    if (ev.target.closest("a, button, input, select, textarea")) return;
    if (matchMedia("(max-width: 760px)").matches) return;
    S.arrasto = { id, art, x0: ev.clientX, y0: ev.clientY, moveu: false, pid: ev.pointerId };
    addEventListener("pointermove", movePonteiro);
    addEventListener("pointerup", fimPonteiro);
    addEventListener("pointercancel", cancelarPonteiro);
  }

  function comecarArrasto(a, ev) {
    a.moveu = true;
    const r = a.art.getBoundingClientRect();
    a.dx = ev.clientX - r.left; a.dy = ev.clientY - r.top;
    a.fantasma = a.art.cloneNode(true);
    a.fantasma.classList.add("kc-fantasma");
    a.fantasma.removeAttribute("id");
    a.fantasma.setAttribute("aria-hidden", "true");
    a.fantasma.style.setProperty("--w", `${r.width}px`);
    a.fantasma.style.left = "0px"; a.fantasma.style.top = "0px";
    document.body.appendChild(a.fantasma);
    a.lugar = h("div", { class: "kb-lugar", style: { height: `${r.height}px` }, "aria-hidden": "true" });
    a.art.parentElement.insertBefore(a.lugar, a.art);
    a.art.hidden = true;
    quadro.classList.add("arrastando");
    document.body.style.userSelect = "none";
    // zonas Ganhou / Perdeu
    const g = S.funil.estagios.find(e => e.tipo === "ganho"), p = S.funil.estagios.find(e => e.tipo === "perdido");
    zonasEl = h("div", { class: "kb-zonas", "aria-hidden": "true" },
      g ? h("div", { class: "kb-zona kb-zona-ganho", dataset: { estagio: g.id } }, ui.icone("check"), h("span", null, k.v.ganhar)) : null,
      p ? h("div", { class: "kb-zona kb-zona-perda", dataset: { estagio: p.id } }, ui.icone("fechar"), h("span", null, k.v.perder)) : null);
    document.body.appendChild(zonasEl);
    a.raf = requestAnimationFrame(rolarBordas);
  }

  function movePonteiro(ev) {
    const a = S.arrasto;
    if (!a) return;
    a.x = ev.clientX; a.y = ev.clientY;
    if (!a.moveu) {
      if (Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < LIMIAR_ARRASTO) return;
      comecarArrasto(a, ev);
    }
    a.fantasma.style.setProperty("--x", `${ev.clientX - a.dx}px`);
    a.fantasma.style.setProperty("--y", `${ev.clientY - a.dy}px`);
    posicionarLugar(ev.clientX, ev.clientY);
  }

  function posicionarLugar(x, y) {
    const a = S.arrasto;
    const sob = document.elementFromPoint(x, y);
    for (const z of (zonasEl ? zonasEl.children : [])) z.classList.toggle("alvo", !!sob && z.contains(sob));
    const zona = sob && sob.closest && sob.closest(".kb-zona");
    for (const c of colEls.values()) c.sec.classList.remove("alvo");
    if (zona) { a.alvo = { zona: zona.dataset.estagio }; a.lugar.hidden = true; return; }
    const col = sob && sob.closest && sob.closest(".kb-col");
    if (!col || !quadro.contains(col)) return;
    const info = colEls.get(col.dataset.estagio);
    if (!info) return;
    info.sec.classList.add("alvo");
    a.lugar.hidden = false;
    a.lugar.style.setProperty("--cor", k.cor(info.e.cor) || "");
    const cards = [...info.lista.querySelectorAll(".kc:not([hidden])")];
    let antesDe = null;
    for (const c of cards) { const r = c.getBoundingClientRect(); if (y < r.top + r.height / 2) { antesDe = c; break; } }
    const vazia = info.lista.querySelector(".kb-vazia"); if (vazia) vazia.hidden = true;
    const ref = antesDe || info.lista.querySelector(".kb-mais") || null;
    if (a.lugar.parentElement !== info.lista || a.lugar.nextSibling !== ref) info.lista.insertBefore(a.lugar, ref);
    a.alvo = { estagio: info.e.id, indice: [...info.lista.querySelectorAll(".kc:not([hidden]), .kb-lugar")].indexOf(a.lugar) };
  }

  function rolarBordas() {
    const a = S.arrasto;
    if (!a || !a.moveu) return;
    if (a.x !== undefined) {
      const r = quadro.getBoundingClientRect();
      let vx = 0;
      if (a.x < r.left + BORDA_ROLAGEM) vx = -Math.ceil((r.left + BORDA_ROLAGEM - a.x) / 6);
      else if (a.x > r.right - BORDA_ROLAGEM) vx = Math.ceil((a.x - (r.right - BORDA_ROLAGEM)) / 6);
      if (vx) quadro.scrollLeft += vx;
      const sob = document.elementFromPoint(a.x, a.y);
      const lista = sob && sob.closest && sob.closest(".kb-lista");
      if (lista) {
        const rl = lista.getBoundingClientRect();
        if (a.y < rl.top + 40) lista.scrollTop -= Math.ceil((rl.top + 40 - a.y) / 5);
        else if (a.y > rl.bottom - 40) lista.scrollTop += Math.ceil((a.y - (rl.bottom - 40)) / 5);
      }
      if (vx) posicionarLugar(a.x, a.y);
    }
    a.raf = requestAnimationFrame(rolarBordas);
  }

  function limparArrasto() {
    const a = S.arrasto;
    if (!a) return;
    removeEventListener("pointermove", movePonteiro);
    removeEventListener("pointerup", fimPonteiro);
    removeEventListener("pointercancel", cancelarPonteiro);
    if (a.raf) cancelAnimationFrame(a.raf);
    if (a.fantasma) a.fantasma.remove();
    if (zonasEl) { zonasEl.remove(); zonasEl = null; }
    quadro.classList.remove("arrastando");
    document.body.style.userSelect = "";
    for (const c of colEls.values()) c.sec.classList.remove("alvo");
  }

  function fimPonteiro() {
    const a = S.arrasto;
    if (!a) return;
    limparArrasto();
    if (!a.moveu) { S.arrasto = null; return; }
    const alvo = a.alvo;
    if (a.lugar) a.lugar.remove();
    a.art.hidden = false;
    setTimeout(() => { S.arrasto = null; }, 0);   // o click que vem depois do pointerup não abre a gaveta
    if (!alvo) { preencherColunaDoCartao(a.id); return; }
    if (alvo.zona) { soltar(a.id, alvo.zona, 0); return; }
    soltar(a.id, alvo.estagio, Math.max(0, alvo.indice));
  }

  function cancelarPonteiro() {
    const a = S.arrasto;
    if (!a) return;
    limparArrasto();
    if (a.lugar) a.lugar.remove();
    a.art.hidden = false;
    S.arrasto = null;
    preencherColunaDoCartao(a.id);
  }

  function preencherColunaDoCartao(id) {
    const col = S.dados.colunas.find(c => c.itens.some(x => x.id === id));
    if (col) preencherColuna(col.estagio_id);
    for (const c of colEls.values()) { const v = c.lista.querySelector(".kb-vazia"); if (v) v.hidden = false; }
  }

  const aoTeclaGlobal = ev => { if (ev.key === "Escape" && S.arrasto && S.arrasto.moveu) { ev.preventDefault(); cancelarPonteiro(); ui.anunciar("Movimento cancelado."); } };
  document.addEventListener("keydown", aoTeclaGlobal);

  /* ============================================================ filtros */
  function contarFiltros() {
    const f = S.filtro;
    let n = 0;
    if (f.dono) n++;
    if (f.etiquetas && f.etiquetas.ids && f.etiquetas.ids.length) n++;
    if (Array.isArray(f.origem) && f.origem.length) n++;
    if (f.valor_min != null || f.valor_max != null) n++;
    if (f.parado_dias) n++;
    if (f.criado_de || f.criado_ate) n++;
    return n;
  }

  function desenharChips() {
    ui.limpar(chips);
    const f = S.filtro;
    const add = (txt, tirar, dica) => chips.appendChild(h("span", { class: "crm-chip" }, h("span", null, txt, dica ? h("small", null, ` ${dica}`) : null),
      h("button", { type: "button", "aria-label": `Tirar o filtro ${txt}`, on: { click: () => { tirar(); gravarLocal(); carregar({ silencioso: true }); } } }, ui.icone("fechar"))));
    if (f.dono) add(`Responsável: ${f.dono === "eu" ? "eu" : f.dono === "sem" ? "sem responsável" : (k.usuario(f.dono) || {}).nome || "—"}`, () => delete f.dono);
    if (f.etiquetas && f.etiquetas.ids && f.etiquetas.ids.length) {
      const nomes = f.etiquetas.ids.map(id => (k.etiqueta(id) || {}).nome).filter(Boolean);
      add(`Etiquetas: ${nomes.join(", ")}`, () => delete f.etiquetas, `(${{ alguma: "alguma", todas: "todas", nenhuma: "nenhuma" }[f.etiquetas.op || "alguma"]})`);
    }
    if (Array.isArray(f.origem) && f.origem.length) add(`Origem: ${f.origem.map(o => L.ROTULO_ORIGEM[o] || o).join(", ")}`, () => delete f.origem);
    if (f.valor_min != null || f.valor_max != null) add(`Valor ${f.valor_min != null ? `≥ ${ui.brl(f.valor_min, { centavos: false })}` : ""}${f.valor_min != null && f.valor_max != null ? " e " : ""}${f.valor_max != null ? `≤ ${ui.brl(f.valor_max, { centavos: false })}` : ""}`, () => { delete f.valor_min; delete f.valor_max; });
    if (f.parado_dias) add(`Parados há ${f.parado_dias}+ dias`, () => delete f.parado_dias);
    if (f.criado_de || f.criado_ate) add(`Criados ${f.criado_de ? `de ${ui.dataBR(f.criado_de)} ` : ""}${f.criado_ate ? `até ${ui.dataBR(f.criado_ate)}` : ""}`.trim(), () => { delete f.criado_de; delete f.criado_ate; });
    const n = contarFiltros();
    if (n > 1) chips.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p crm-chips-limpar", on: { click: () => {
      const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; gravarLocal(); carregar({ silencioso: true });
    } } }, "Limpar filtros"));
    nFiltros.textContent = String(n); nFiltros.hidden = !n;
    btFiltros.classList.toggle("ativo", n > 0);
    chips.hidden = !chips.children.length;
  }

  function abrirFiltros() {
    const f = JSON.parse(JSON.stringify(S.filtro));
    const seg = (itens, atual, aoMudar, rotulo) => {
      const g = h("div", { class: "crm-seg", role: "group", "aria-label": rotulo });
      for (const [v, t] of itens) {
        const b = h("button", { type: "button", "aria-pressed": String((atual || "") === v) }, t);
        b.addEventListener("click", () => { for (const x of g.children) x.setAttribute("aria-pressed", "false"); b.setAttribute("aria-pressed", "true"); aoMudar(v); });
        g.appendChild(b);
      }
      return g;
    };
    // responsável
    const selPessoa = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: f.dono && !["eu", "sem"].includes(f.dono) ? f.dono : null, vazio: "Qualquer pessoa", rotulo: "Responsável",
      aoMudar: id => { f.dono = id || undefined; } });
    const segDono = seg([["", "Todos"], ["eu", "Meus"], ["sem", "Sem responsável"]], ["eu", "sem"].includes(f.dono) ? f.dono : "", v => { f.dono = v || undefined; selPessoa.value = ""; }, "Responsável");
    // etiquetas
    const et = f.etiquetas || { op: "alguma", ids: [] };
    const segEt = seg([["alguma", "Alguma"], ["todas", "Todas"], ["nenhuma", "Nenhuma"]], et.op || "alguma", v => { et.op = v; }, "Como combinar as etiquetas");
    const opsEt = h("div", { class: "crm-opcoes" }, k.base.etiquetas.map(e => {
      const inp = h("input", { type: "checkbox", value: e.id, checked: (et.ids || []).includes(e.id) });
      inp.addEventListener("change", () => { et.ids = inp.checked ? [...new Set([...(et.ids || []), e.id])] : (et.ids || []).filter(x => x !== e.id); });
      return h("label", { class: "crm-op" }, inp, h("span", { style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }, h("i"), e.nome));
    }));
    // origem
    const orig = new Set(f.origem || []);
    const opsOrig = h("div", { class: "crm-opcoes" }, Object.entries(L.ROTULO_ORIGEM).map(([v, t]) => {
      const inp = h("input", { type: "checkbox", value: v, checked: orig.has(v) });
      inp.addEventListener("change", () => { inp.checked ? orig.add(v) : orig.delete(v); });
      return h("label", { class: "crm-op" }, inp, h("span", null, t));
    }));
    const vMin = h("input", { type: "number", min: "0", step: "50", placeholder: "Mínimo", "aria-label": "Valor mínimo", value: f.valor_min ?? "" });
    const vMax = h("input", { type: "number", min: "0", step: "50", placeholder: "Máximo", "aria-label": "Valor máximo", value: f.valor_max ?? "" });
    const parado = h("select", { "aria-label": "Parados há" }, [["", "Qualquer tempo"], ["3", "3 dias ou mais"], ["7", "7 dias ou mais"], ["15", "15 dias ou mais"], ["30", "30 dias ou mais"]]
      .map(([v, t]) => h("option", { value: v, selected: String(f.parado_dias || "") === v }, t)));
    const de = h("input", { type: "date", "aria-label": "Criados de", value: f.criado_de || "" });
    const ate = h("input", { type: "date", "aria-label": "Criados até", value: f.criado_ate || "" });
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limpar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const corpo = h("div", { class: "crm-filtros" },
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Responsável"), segDono, selPessoa),
      k.base.etiquetas.length ? h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Etiquetas"), segEt, opsEt) : null,
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Origem"), opsOrig),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Valor (R$)"), h("div", { class: "crm-filtros-linha" }, vMin, vMax)),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Parados na etapa"), parado),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Criados entre"), h("div", { class: "crm-filtros-linha" }, de, ate)),
      h("div", { class: "crm-filtros-rod" }, limpar, aplicar));
    const pop = ui.flutuante(btFiltros, corpo, { classe: "flut-crm", largura: "auto" });
    limpar.addEventListener("click", () => { const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; gravarLocal(); pop.fechar(); carregar({ silencioso: true }); });
    aplicar.addEventListener("click", () => {
      const nf = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}) };
      if (f.dono) nf.dono = f.dono;
      if (et.ids && et.ids.length) nf.etiquetas = { op: et.op || "alguma", ids: et.ids };
      if (orig.size) nf.origem = [...orig];
      const mn = vMin.value === "" ? null : Number(vMin.value), mx = vMax.value === "" ? null : Number(vMax.value);
      if (mn != null && mn >= 0) nf.valor_min = mn;
      if (mx != null && mx >= 0) nf.valor_max = mx;
      if (parado.value) nf.parado_dias = Number(parado.value);
      if (de.value) nf.criado_de = de.value;
      if (ate.value) nf.criado_ate = ate.value;
      S.filtro = nf; gravarLocal(); pop.fechar(); carregar({ silencioso: true });
    });
  }

  /* ============================================================ tempo real */
  const cancelarPulso = ctx.pulso && ctx.pulso.assinar ? ctx.pulso.assinar(() => {
    if (!S.vivo || S.arrasto || S.teclado || document.hidden) return;
    if (Date.now() - S.ultimaRecarga < PULSO_MIN_MS) return;
    if (document.querySelector("dialog[open]")) return;
    carregar({ silencioso: true });
  }) : null;

  await carregar();
  return {
    aoMudarNegocio: () => carregar({ silencioso: true }),
    desmontar() {
      S.vivo = false; S.seq++;
      if (S.arrasto) cancelarPonteiro();
      document.removeEventListener("keydown", aoTeclaGlobal);
      if (cancelarPulso) cancelarPulso();
    },
  };
}
