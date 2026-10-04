/* ============================================================
   ÓRBITA — crm-kanban.js · frente F4 · T5 CRM — Kanban
   - topo (M30): ui.cabecalho (sem a empresa em cima), funis em ui.segmentado, busca (sem acento; dígitos = telefone), filtros com
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
   - celular (M23): colunas com rolagem lateral com snap; TOQUE LONGO de
     350 ms levanta o cartão e o dedo o arrasta (rolagem de borda, fita de
     etapas e «Ganhou/Perdeu» como destinos); toque longo sem arrastar, a
     tecla M e o botão ⋮ do cartão abrem a folha «Mover para…»; a rolagem
     vertical/horizontal normal nunca inicia arrasto (limiar + touch-action);
     fita de etapas fixa sob a busca, totais numa linha e «Novo» flutuante
   ============================================================ */

const LIMIAR_ARRASTO = 6;           // px antes de virar arrasto
const BORDA_ROLAGEM = 70;           // px da borda que começam a rolar
const PULSO_MIN_MS = 8000;          // recarga silenciosa no máximo a cada 8 s
const agora = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

export async function montarKanban(k, el, rota) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  const Vis = await k.mod("visoes");
  const cli = ctx.cliente.id;
  const chaveLocal = `nx-app-crm-kb-${cli}`;
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(chaveLocal) || "{}") || {}; } catch { return {}; } };
  let controlesVisoes = null;
  const gravarLocal = () => {
    try { localStorage.setItem(chaveLocal, JSON.stringify({ funil: S.funil && S.funil.id, filtro: S.filtro, todosFechados: S.todosFechados })); } catch { /* ok */ }
    if (controlesVisoes) controlesVisoes.atualizar();
    atualizarAtalhos();
  };

  const salvo = lerLocal();
  const funis = () => k.base.funis.filter(f => f.ativo !== false);
  const S = {
    funil: k.funil(rota.query && rota.query.funil) || k.funil(salvo.funil) || k.funilPadrao(),
    filtro: salvo.filtro && typeof salvo.filtro === "object" ? salvo.filtro : {},
    todosFechados: salvo.todosFechados === true,
    dados: null,
    seq: 0,
    arrasto: null,
    teclado: null,
    ultimaRecarga: 0,
    vivo: true,
    pend: new Map(),      // M25: movimentos que ainda não chegaram ao servidor (adiados pelos 7 s do Desfazer) ou à espera de confirmação
    adiado: null,         // redesenho que chegou no meio de um arrasto: {dados?} — feito quando o gesto termina (aplicarAdiado)
  };
  delete S.filtro.fechados_dias;
  const podeMover = k.pode("atendente");
  ctx.titulo(k.v.crm);

  /* ============================================================ estrutura */
  // troca de funil (M30): ui.segmentado com até 5 funis; no celular (e com mais de 5) um seletor no cabeçalho
  const selFunil = h("div", { class: "crm-funis" });
  const selFunilM = h("div", { class: "crm-funil-m" });
  function trocarFunil(id) {
    if (S.funil && S.funil.id === id) return;
    S.funil = k.funil(id);
    gravarLocal();
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm?funil=${encodeURIComponent(S.funil.id)}`);
    carregar();
  }
  function desenharSelFunil() {
    ui.limpar(selFunil); ui.limpar(selFunilM);
    const lista = funis();
    selFunil.hidden = selFunilM.hidden = lista.length < 2;
    if (lista.length < 2) return;
    const select = classe => {
      const s = h("select", { class: ["sel", "crm-funil-sel", classe], "aria-label": "Funil" }, lista.map(f => h("option", { value: f.id, selected: S.funil && f.id === S.funil.id }, f.nome)));
      s.addEventListener("change", () => trocarFunil(s.value));
      return s;
    };
    if (lista.length <= 5) {
      selFunil.appendChild(ui.segmentado({ opcoes: lista.map(f => ({ valor: f.id, rotulo: f.nome, icone: f.conta_no_ads ? "anuncio" : null })),
        valor: S.funil && S.funil.id, rotulo: "Funis", aoMudar: trocarFunil }));
      selFunilM.appendChild(select("crm-funil-sel-m"));        // o CSS mostra um dos dois: abas no desktop, seletor no celular
    } else {
      selFunil.hidden = true;
      selFunilM.appendChild(select("crm-funil-sel-todos"));
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
  const btMeus = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(S.filtro.dono === "eu"), on: { click: () => {
    S.filtro.dono = S.filtro.dono === "eu" ? undefined : "eu"; if (!S.filtro.dono) delete S.filtro.dono;
    gravarLocal(); carregar({ silencioso: true });
  } } }, "Meus negócios");
  const btParados = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(Number(S.filtro.parado_dias) === 7), on: { click: () => {
    if (Number(S.filtro.parado_dias) === 7) delete S.filtro.parado_dias; else S.filtro.parado_dias = 7;
    gravarLocal(); carregar({ silencioso: true });
  } } }, "Parados · 7 dias+");
  const atalhos = h("div", { class: "crm-atalhos", "aria-label": "Filtros rápidos" }, btMeus, btParados);
  function atualizarAtalhos() {
    if (!btMeus || !btParados) return;
    btMeus.setAttribute("aria-pressed", String(S.filtro.dono === "eu"));
    btParados.setAttribute("aria-pressed", String(Number(S.filtro.parado_dias) === 7));
  }
  const fitaBusca = h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca), btFiltros);
  controlesVisoes = Vis.controlesVisoes(k, { tipo: "kanban",
    obterDados: () => ({ funil: S.funil && String(S.funil.id), filtro: S.filtro, todosFechados: S.todosFechados }),
    aplicar: async dados => {
      const funil = k.funil(dados.funil);
      if (!funil || funil.ativo === false) throw new Error("O funil desta visão não está disponível.");
      S.funil = funil; S.filtro = dados.filtro || {}; S.todosFechados = dados.todosFechados === true;
      busca.value = S.filtro.busca || "";
      history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm?funil=${encodeURIComponent(funil.id)}`);
      desenharSelFunil(); gravarLocal(); await carregar({ silencioso: true });
      ui.toast("Visão aplicada.", { tipo: "ok", ms: 1600 });
    } });

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
    podeMover ? "Enter abre. Espaço pega o cartão para mover: setas esquerda e direita trocam de etapa, cima e baixo mudam a posição, Enter solta, Esc cancela. A tecla M abre a lista de etapas para mover o cartão." : "Enter abre.");
  const areaVazia = h("div", { hidden: true });
  const corpoQuadro = h("div", { class: "kb-env" }, quadro);

  // celular (M23): fita de etapas fixa sob a busca (também é destino do arrasto) + totais numa linha que expande ao toque
  const fitaEtapas = h("nav", { class: "kb-fita", "aria-label": "Etapas do funil" });
  const idTotais = `crm-totais-${cli}`;
  totais.id = idTotais;
  const resumoLinha = h("button", { type: "button", class: "crm-resumo", "aria-expanded": "false", "aria-controls": idTotais,
    on: { click: () => { const aberto = totais.classList.toggle("aberto"); resumoLinha.setAttribute("aria-expanded", String(aberto)); } } });
  const resumoTxt = h("span", null, "—");
  resumoLinha.append(resumoTxt, ui.icone("seta-baixo"));

  const btNovo = podeMover ? h("button", { type: "button", class: "bt bt-prim crm-novo", on: { click: () => novo({}) } }, ui.icone("mais"), k.v.novo("negocio")) : null;
  // botão flutuante do celular: irmão direto do .crm (um ancestral com transform prenderia o position:fixed)
  const fab = podeMover ? h("button", { type: "button", class: "crm-fab", "aria-label": k.v.novo("negocio"), title: k.v.novo("negocio"), on: { click: () => novo({}) } },
    ui.icone("mais"), h("span", { class: "crm-fab-txt" }, k.v.novo("negocio"))) : null;
  el.append(...[
    ui.cabecalho({ titulo: k.v.crm, acoes: [btNovo, selFunilM] }),
    selFunil,
    h("div", { class: "pilha-p crm-kb-ferramentas" }, fitaBusca, atalhos, controlesVisoes.el, chips),
    fitaEtapas, resumoLinha, totais, areaVazia, corpoQuadro, instr, fab].filter(Boolean));
  desenharSelFunil();

  /* ============================================================ dados */
  function filtroServidor() {
    const f = { ...S.filtro };
    if (S.todosFechados) f.fechados_dias = 0;
    return f;
  }

  /** Há um gesto mexendo no quadro agora (ponteiro apertado sobre um cartão, ou cartão pego pelo teclado)? Redesenhar apagaria o cartão escondido e o marcador do arrasto. */
  const emGesto = () => !!((S.arrasto && !S.arrasto.encerrado) || S.teclado);

  /** O gesto terminou: faz o redesenho que ficou esperando (com os dados que a rede trouxe no meio do arrasto, se trouxe). */
  function aplicarAdiado() {
    const ad = S.adiado;
    if (!ad || !S.vivo || emGesto() || !S.dados) return;
    S.adiado = null;
    if (ad.dados) { S.dados = ad.dados; reaplicarPendentes(); }
    desenharQuadro();
  }

  async function carregar({ silencioso = false } = {}) {
    const minha = ++S.seq;
    if (!S.funil) { mostrarSemFunil(); return; }
    const trocouTudo = !silencioso || !S.dados;
    if (trocouTudo) { S.teclado = null; S.adiado = null; ui.limpar(quadro); quadro.appendChild(ui.esqueleto("kanban", Math.min(6, S.funil.estagios.length || 4))); }   // o cartão pego pelo teclado saiu da tela junto
    desenharChips();
    let doCache = false;
    try {
      const d = await k.api.rpcC("nx_negocios_kanban", { p_funil: S.funil.id, p_filtro: filtroServidor(), p_por_coluna: 30 }, { cache: true, aoCache: dc => {
        // M16/M30: a 1ª pintura é o último quadro guardado (só quando ainda não há nada na tela); a rede chega logo depois
        if (minha !== S.seq || !S.vivo || S.dados || !dc || !Array.isArray(dc.colunas)) return;
        S.dados = dc; doCache = true;
        desenharQuadro();
        if (S.pronta) S.pronta();       // a tela já pode entrar: o quadro guardado está pintado
      } });
      if (minha !== S.seq || !S.vivo) return;
      const igual = doCache && JSON.stringify(S.dados) === JSON.stringify(d);     // nada mudou desde o guardado: não refaz o quadro
      S.ultimaRecarga = Date.now();
      // a resposta chegou com um cartão sendo arrastado: redesenhar agora apagaria o cartão e o marcador do gesto (no celular o arrasto cairia) — fica para o fim do gesto
      if (!igual && !trocouTudo && emGesto()) { S.adiado = { dados: d }; return; }
      S.adiado = null;
      S.dados = d;
      if (igual) return;
      reaplicarPendentes();
      desenharQuadro();
    } catch (e) {
      if (minha !== S.seq || !S.vivo) return;
      if (e && e.comCache) return;      // a rede falhou depois de pintar o último quadro: a tela fica com o que mostra (o selo do shell avisa)
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
    // a recarga silenciosa (pulso, busca) refaz as colunas: guarda a rolagem para o quadro não voltar à 1ª coluna no celular
    const rolagem = colEls.size ? { x: quadro.scrollLeft, y: new Map([...colEls].map(([id, c]) => [id, c.lista.scrollTop])) } : null;
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
    if (rolagem) {
      quadro.style.scrollBehavior = "auto";
      quadro.scrollLeft = rolagem.x;
      for (const [id, c] of colEls) { const y = rolagem.y.get(id); if (y) c.lista.scrollTop = y; }
      quadro.style.scrollBehavior = "";
    }
    desenharTotais();
    desenharFita();
  }

  /* ---------- fita de etapas (celular): atalho para cada coluna + destino do arrasto ---------- */
  function desenharFita() {
    ui.limpar(fitaEtapas);
    if (!S.dados) return;
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id);
      const n = col ? Number(col.total) || 0 : 0;
      const b = h("button", { type: "button", class: "kb-fita-b", dataset: { estagio: e.id }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
        "aria-label": `${e.nome}, ${n} ${n === 1 ? "cartão" : "cartões"}`, on: { click: () => irParaColuna(e.id) } },
        h("i", { "aria-hidden": "true" }), h("span", null, e.nome), h("b", { class: "dado" }, ui.num(n)));
      fitaEtapas.appendChild(b);
    }
    marcarColunaAtual();
  }

  /** Só os números da fita (depois de mover um cartão): a fita inteira só é refeita ao redesenhar o quadro. */
  function contarFita() {
    for (const b of fitaEtapas.children) {
      const col = colunaDe(b.dataset.estagio), n = col ? Number(col.total) || 0 : 0;
      if (b.lastChild) b.lastChild.textContent = ui.num(n);
      b.setAttribute("aria-label", `${(k.estagio(b.dataset.estagio) || {}).nome || ""}, ${n} ${n === 1 ? "cartão" : "cartões"}`);
    }
  }

  function irParaColuna(estagioId) {
    const c = colEls.get(estagioId);
    if (!c) return;
    const r = c.sec.getBoundingClientRect(), q = quadro.getBoundingClientRect();
    quadro.scrollTo({ left: quadro.scrollLeft + (r.left - q.left) - 16, behavior: ui.comportamentoRolagem() });
  }

  /** A coluna cujo lado esquerdo está mais perto da borda do quadro é a «atual» na fita (e a fita acompanha). */
  function marcarColunaAtual() {
    if (!colEls.size) return;
    const q = quadro.getBoundingClientRect();
    let melhor = null, dist = Infinity;
    for (const [id, c] of colEls) { const d = Math.abs(c.sec.getBoundingClientRect().left - q.left - 16); if (d < dist) { dist = d; melhor = id; } }
    for (const b of fitaEtapas.children) {
      const atual = b.dataset.estagio === melhor;
      if (atual) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      if (atual && !S.arrasto) { const f = fitaEtapas.getBoundingClientRect(), r = b.getBoundingClientRect(); if (r.left < f.left || r.right > f.right) fitaEtapas.scrollTo({ left: fitaEtapas.scrollLeft + (r.left - f.left) - 12, behavior: "auto" }); }
    }
  }
  let rafFita = 0;
  const aoRolarQuadro = () => { if (rafFita) return; rafFita = requestAnimationFrame(() => { rafFita = 0; marcarColunaAtual(); }); };
  quadro.addEventListener("scroll", aoRolarQuadro, { passive: true });

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
    if (!col.itens.length) c.lista.appendChild(h("div", { class: "kb-vazia", role: "listitem" }, ui.vazio({ tipo: "sem_resultado", titulo: podeMover
      ? (matchMedia("(pointer: coarse)").matches ? "Segure um cartão e arraste até aqui" : "Arraste um cartão para cá")
      : "Nada nesta etapa" })));
    ui.limpar(c.extra);
    const faltam = (col.total || 0) - col.itens.length;
    if (faltam > 0) {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p kb-mais" }, `Ver mais (${ui.num(faltam)})`);
      b.addEventListener("click", () => verMais(estagioId, b));
      c.lista.appendChild(h("div", { class: "kb-mais-item", role: "listitem" }, b));
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
    resumoTxt.textContent = L.resumoDoFunil({ abertos: t.abertos, soma: ui.brl(t.soma_aberto, { centavos: false }), previsao: ui.brl(t.previsao_ponderada, { centavos: false }) }, k.v.art("negocio"));
    contarFita();
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

  /** O símbolo do sprite existe? (i-meta e i-google chegam com os ícones novos da frente B; antes disso o megafone genérico). */
  const simbolo = (nome, reserva) => (typeof document !== "undefined" && document.getElementById(`i-${nome}`) ? nome : reserva);

  /**
   * Cartão em 3 linhas (M24): título · valor + «contato · procedimento» · rodapé (tempo na etapa — âmbar depois do prazo —, consulta, tarefa
   * [ponto vermelho se atrasada], pontuação, glifo da origem, até 3 pontos de etiqueta e o dono). Nenhum texto abaixo de 12 px.
   */
  function criarCartao(c, e) {
    const titulo = L.tituloCard(c);
    const nomeContato = c.contato && c.contato.nome && c.contato.nome !== titulo ? c.contato.nome : null;
    const sub = [nomeContato, c.servico].filter(Boolean).join(" · ");
    const valor = e.tipo === "ganho" ? (c.valor ?? c.valor_previsto) : c.valor_previsto;
    const sla = e.tipo === "aberto" && L.slaEstourado(c.estagio_em, e.sla_horas);
    const dono = k.usuario(c.dono_id);
    const etqs = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean);
    const pont = L.pontuacao(c);
    const origemTxt = L.descricaoOrigem(c);
    const tarefa = c.tarefa && typeof c.tarefa === "object" ? c.tarefa : null;
    const tarefaTxt = tarefa ? (tarefa.atrasada ? "Tarefa atrasada" : tarefa.vence_em ? `Tarefa ${ui.relativo(tarefa.vence_em)}` : "Tarefa") : "";
    const consultaTxt = c.consulta_em ? `${ui.dataCurtaBR ? ui.dataCurtaBR(c.consulta_em) : ui.dataBR(c.consulta_em)} ${ui.horaBR(c.consulta_em)}` : "";
    const rotulo = `${titulo}${valor != null ? `, ${ui.brl(valor)}` : ""}${sub ? `, ${sub}` : ""}${consultaTxt ? `, consulta ${consultaTxt}` : ""}${tarefaTxt ? `, ${tarefaTxt.toLowerCase()}` : ""}${origemTxt ? `, origem ${origemTxt}` : ""}${etqs.length ? `, etiquetas ${etqs.map(x => x.nome).join(", ")}` : ""}${pont ? `, pontuação ${pont.score} de 100` : ""}${dono ? `, responsável ${dono.nome}` : ""}${c.nao_lidas ? `, ${c.nao_lidas} mensagens não lidas` : ""}`;
    const art = h("article", { class: ["kc", S.pend.has(c.id) && "confirmando salvando"], role: "listitem", tabindex: "0", dataset: { id: c.id }, "aria-roledescription": "cartão",
      "aria-label": rotulo, "aria-describedby": instr.id, "aria-busy": S.pend.has(c.id) ? "true" : null, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null },
      h("span", { class: "kc-t" }, titulo),
      h("div", { class: "kc-l2" },
        valor != null ? h("b", { class: "kc-valor" }, ui.brl(valor, { centavos: false })) : h("span", { class: ["kc-valor", "sem"] }, "sem valor"),
        sub ? h("span", { class: "kc-s", title: sub }, sub) : null),
      h("div", { class: "kc-rod" },
        h("span", { class: ["kc-dias", sla && "sla"], title: e.tipo === "aberto" ? `${L.textoDiasEtapa(c.estagio_em)}${sla ? ` — passou do prazo da etapa (${e.sla_horas} h)` : ""}` : null },
          e.tipo === "aberto" ? L.textoDiasEtapa(c.estagio_em).replace(" na etapa", "") : c.fechado_em ? `${e.tipo === "ganho" ? k.v.ganhar.toLowerCase() : "fechado"} ${ui.relativo(c.fechado_em)}` : ""),
        consultaTxt ? h("span", { class: "kc-consulta", title: "Consulta/visita marcada" }, ui.icone("relogio"), consultaTxt) : null,
        tarefa ? h("span", { class: ["kc-tarefa", tarefa.atrasada && "atrasada"], title: tarefaTxt }, tarefa.atrasada ? h("i", { class: "kc-ponto-ruim", "aria-hidden": "true" }) : ui.icone("tarefa")) : null,
        pont ? h("span", { class: ["kc-score", pont.faixa], title: `Pontuação do lead: ${pont.score} de 100${pont.motivo ? ` — ${pont.motivo}` : ""}` }, String(pont.score)) : null,
        c.plataforma ? h("span", { class: ["kc-origem", c.plataforma], title: origemTxt }, ui.icone(simbolo(c.plataforma === "google" ? "google" : "meta", "anuncio"))) : null,
        etqs.length ? h("span", { class: "kc-pontos", title: etqs.map(x => x.nome).join(", ") },
          etqs.slice(0, 3).map(x => h("i", { class: "kc-ponto", "aria-hidden": "true", style: k.cor(x.cor) ? { "--cor": k.cor(x.cor) } : null })),
          etqs.length > 3 ? h("small", null, `+${etqs.length - 3}`) : null) : null,
        h("span", { class: "kc-fim" },
          dono ? ui.avatar(dono.nome, dono.id) : h("span", { class: "kc-avatar-vazio", title: "Sem responsável" }, ui.icone("usuario")),
          // alternativa ao arrastar (toque, leitor de tela): a mesma folha «Mover para…» do toque longo
          podeMover ? h("button", { type: "button", class: "bt-icone kc-mover", "aria-label": `Mover «${titulo}» para outra etapa`, title: "Mover para…",
            on: { click: ev => { ev.stopPropagation(); abrirMoverPara(c.id); } } }, ui.icone("opcoes")) : null)),
      c.nao_lidas ? h("span", { class: "kc-naolidas", title: `${c.nao_lidas} não lidas` }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas)) : null);
    art.addEventListener("click", ev => {
      if (S.arrasto && (S.arrasto.moveu || S.arrasto.engoleClique)) return;
      if (S.teclado) return;
      if (ev.target.closest("a, button")) return;
      abrir(c.id);
    });
    art.addEventListener("keydown", ev => teclaCartao(ev, c.id));
    // o toque longo do celular não pode abrir o menu do sistema (copiar/colar, imagem) em cima do cartão
    art.addEventListener("contextmenu", ev => { if (S.arrasto && S.arrasto.toque) ev.preventDefault(); });
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

  /**
   * O cartão ainda tem um movimento sem confirmação (os 7 s do «Desfazer», ou a gravação em andamento)? Então não aceita outro por cima: o movimento antigo
   * iria ao servidor de qualquer jeito (com as mensagens automáticas) e a tela ficaria diferente do banco. Avisa e devolve true.
   */
  function recusarSePendente(id) {
    const mov = S.pend.get(id);
    if (!mov) return false;
    const msg = mov.efetivado ? "Ainda estamos gravando a última mudança deste cartão. Tente de novo em instantes."
      : "A última mudança deste cartão ainda pode ser desfeita. Toque em «Desfazer» ou espere alguns segundos para mover de novo.";
    ui.toast(msg, { tipo: "info" });
    ui.anunciar(msg);
    return true;
  }
  /** Tira o movimento da lista de pendentes só se ainda for ELE (um movimento antigo não pode apagar o pendente mais novo do mesmo cartão). */
  function soltarPendente(mov) { if (S.pend.get(mov.id) === mov) S.pend.delete(mov.id); }

  /** soltar(id, etapa, pos) — pos = posição entre os OUTROS cartões da coluna de destino (0 = topo). */
  async function soltar(id, estagioId, indice) {
    const origemCol = S.dados.colunas.find(c => c.itens.some(x => x.id === id));
    if (!origemCol) return;
    if (recusarSePendente(id)) { preencherColunaDoCartao(id); focarCartao(id); return; }
    const card = origemCol.itens.find(x => x.id === id);
    const posOrig = origemCol.itens.indexOf(card);
    const destino = k.estagio(estagioId);
    const destCol = colunaDe(estagioId);
    if (!destino || !destCol) { desenharQuadro(); return; }
    // vizinhos no destino (sem o próprio cartão)
    const itens = destCol.itens.filter(x => x.id !== id);
    const pos = Math.max(0, Math.min(indice, itens.length));
    if (origemCol === destCol && pos === posOrig) { preencherColuna(estagioId); focarCartao(id); return; }
    // soltou no fim de uma coluna com «Ver mais» pendente: o vizinho de baixo é o próximo cartão do SERVIDOR (ainda não carregado), não «ninguém»
    let proxima;
    if (pos >= itens.length && (Number(destCol.total) || 0) > destCol.itens.length) {
      try {
        const r = await k.api.rpcC("nx_negocios_coluna", { p_estagio: estagioId, p_filtro: filtroServidor(), p_offset: destCol.itens.length });
        const viz = ((r && r.itens) || []).find(x => x.id !== id);
        if (viz) proxima = viz.ordem ?? null;
      } catch { /* sem o vizinho, vale a ordem de fim de lista */ }
    }
    const ordem = L.ordemDoSoltar(itens, pos, proxima);
    // perguntas (valor / motivo / data e hora) ANTES de gravar
    let extra = {};
    try { extra = await N.prepararMovimento(k, card, destino); }
    catch (e) { extra = null; k.toastErro(e); }
    if (extra === null) { preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId); focarCartao(id); ui.anunciar("Movimento cancelado."); return; }
    // otimista: a tela já mostra o cartão no destino
    const patch = { status: destino.tipo, ...(extra.valor != null ? { valor: extra.valor } : {}), ...(extra.consulta_em ? { consulta_em: extra.consulta_em } : {}) };
    S.dados.colunas = L.moverLocal(S.dados.colunas, id, estagioId, pos, ordem, patch);
    preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId);
    desenharTotais();
    focarCartao(id);
    assentar(id);
    const tipoOrigem = (k.estagio(origemCol.estagio_id) || {}).tipo;
    const mov = { id, card, destino, estagioId, pos, ordem, extra, patch, origemEstagioId: origemCol.estagio_id, origemPos: posOrig,
      origemPatch: { status: card.status, valor: card.valor, consulta_em: card.consulta_em }, origem: { ordem: card.ordem ?? null, consulta_em: card.consulta_em ?? null },
      pendente: false, efetivado: false, promessa: null };
    const titulo = L.tituloCard(card);
    if (L.movimentoAdiado(tipoOrigem, destino.tipo)) {
      // ganho/perdido (e reabrir) disparam automações (mensagens, tarefas): só vai ao servidor DEPOIS dos 7 s do «Desfazer». Desfazer antes disso = nada aconteceu.
      mov.pendente = true;
      S.pend.set(id, mov);
      marcarConfirmando(id, true);
      const valorTxt = patch.valor != null || card.valor_previsto != null ? ` · ${ui.brl(patch.valor ?? card.valor_previsto)}` : "";
      const texto = destino.tipo === "ganho" ? `${k.v.ganhar}! «${titulo}»${valorTxt}`
        : destino.tipo === "perdido" ? `«${titulo}» registrad${k.v.art("negocio")} como «${destino.nome}»` : `«${titulo}» reaberto em «${destino.nome}»`;
      ui.anunciar(`${titulo}: ${destino.nome}. Dá para desfazer por 7 segundos.`);
      // firmar = a gravação adiada. Se a página sair ou ficar oculta antes dos 7 s, o aviso chama firmar({ saindo: true }) e o pedido vai com keepalive
      const res = await ui.acaoComDesfazer({ texto, reverter: () => desfazerMovimento(mov), firmar: o => efetivar(mov, { saindo: !!(o && o.saindo) }) });
      if (res.estado === "desfeita") return;
      await efetivar(mov);       // «mantida» (o aviso acabou) ou a tela saiu: agora vai ao servidor
      return;
    }
    // mesma natureza (aberto → aberto): grava já; o «Desfazer» move de volta
    const ok = await efetivar(mov);
    if (!ok || origemCol === destCol) return;       // só reordenar dentro da etapa não pede «Desfazer»
    ui.acaoComDesfazer({ texto: `«${titulo}» movido para ${destino.nome}`, reverter: () => desfazerMovimento(mov) });
  }

  /** O cartão solto «assenta» no lugar (M10: .assenta = escala 1,015 → 1; sem movimento reduzido o CSS zera a animação). */
  function assentar(id) {
    const el = quadro.querySelector(`.kc[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove("assenta");
    void el.offsetWidth;
    el.classList.add("assenta");
    el.addEventListener("animationend", () => el.classList.remove("assenta"), { once: true });
  }

  function marcarConfirmando(id, sim) {
    const el = quadro.querySelector(`.kc[data-id="${id}"]`);
    if (!el) return;
    el.classList.toggle("confirmando", sim);
    el.classList.toggle("salvando", sim);
    if (sim) el.setAttribute("aria-busy", "true"); else el.removeAttribute("aria-busy");
  }

  /** O pedido pode ter sido gravado mesmo com o erro (prazo, conexão): pergunta ao servidor em que etapa o cartão está. → estagio_id | null (não deu para saber). */
  async function consultarEtapa(id) {
    try { const d = await k.api.rpcC("nx_negocio_ver", { p_id: id }); return d && d.negocio ? d.negocio.estagio_id : null; }
    catch { return null; }
  }

  /**
   * Grava o movimento no servidor. → true se ficou gravado. Erro ambíguo: confere no servidor ANTES de reverter o cartão.
   * `saindo` = a página está fechando ou ficou oculta: o pedido vai com keepalive, para o navegador não o cancelar junto com a aba.
   */
  function efetivar(mov, { saindo = false } = {}) {
    if (mov.promessa) return mov.promessa;
    mov.efetivado = true;
    mov.promessa = (async () => {
      marcarConfirmando(mov.id, true);
      const chegou = novoCard => {
        soltarPendente(mov);
        const col = colunaDe(mov.estagioId);
        const i = col ? col.itens.findIndex(x => x.id === mov.id) : -1;
        if (i >= 0) col.itens[i] = { ...col.itens[i], ...novoCard };
        // o servidor devolve o valor real: corrige a soma da coluna
        if (col && mov.destino.tipo === "ganho" && novoCard.valor != null && mov.patch.valor == null) col.soma_valor = (Number(col.soma_valor) || 0) + Number(novoCard.valor) - Number(mov.card.valor || 0);
        // outro cartão está sendo arrastado: refazer a coluna agora derrubaria o gesto — o quadro é refeito quando ele terminar
        // (com o que está em memória: dados que a rede trouxe ANTES desta gravação mostrariam este cartão na etapa antiga)
        if (emGesto()) S.adiado = {};
        else { if (col) preencherColuna(mov.estagioId); desenharTotais(); }
        const el = quadro.querySelector(`.kc[data-id="${mov.id}"]`);
        if (el) { el.classList.add("chegou"); el.classList.add("assenta"); }
        marcarConfirmando(mov.id, false);
        ui.anunciar(`${L.tituloCard(mov.card)} movido para ${mov.destino.nome}.`);
        return true;
      };
      try {
        return chegou(await N.moverNegocio(k, mov.card, mov.destino, { ordem: mov.ordem, extra: mov.extra, keepalive: saindo }));
      } catch (e) {
        if (L.erroAmbiguo(e)) {
          const real = await consultarEtapa(mov.id);
          if (real === mov.destino.id) return chegou({});     // o servidor já tinha aplicado: o cartão fica onde está
          if (real === null) {                                 // sem resposta: mostra o que se sabe e confere quando a internet voltar
            ui.toast("Não deu para confirmar a mudança de etapa. Vamos conferir com o servidor quando a conexão voltar.", { tipo: "info", ms: 6000 });
            const conferir = () => { soltarPendente(mov); if (S.vivo) carregar({ silencioso: true }); };
            if (typeof addEventListener === "function") addEventListener("orbita:online", conferir, { once: true });
            return false;
          }
          // o servidor está em OUTRA etapa: não foi aplicado → volta o cartão
        }
        soltarPendente(mov);
        reverterNaTela(mov);
        // erro de prazo/conexão com o servidor ainda na etapa antiga: a mudança NÃO foi feita (a mensagem padrão de «tempo esgotado» fala de relatórios)
        const msg = L.erroAmbiguo(e) ? "O servidor não confirmou a mudança de etapa e o cartão voltou para onde estava. Tente de novo." : k.erro(e);
        ui.toast(msg, { tipo: "erro" });
        ui.anunciar(`Não foi possível mover: ${msg}`);
        return false;
      }
    })();
    return mov.promessa;
  }

  /** Volta o cartão para onde estava, só na tela (sem mexer nos outros cartões que também estejam esperando). */
  function reverterNaTela(mov) {
    S.dados.colunas = L.moverLocal(S.dados.colunas, mov.id, mov.origemEstagioId, mov.origemPos, mov.origem.ordem, mov.origemPatch);
    if (emGesto()) { S.adiado = {}; return; }       // outro cartão em arrasto: o quadro é refeito quando o gesto terminar
    preencherColuna(mov.origemEstagioId); if (mov.estagioId !== mov.origemEstagioId) preencherColuna(mov.estagioId);
    desenharTotais();
    focarCartao(mov.id);
  }

  /** «Desfazer» (botão do aviso ou Ctrl/⌘+Z). Ainda não foi ao servidor → só a tela; já foi → move de volta (e devolve a data da consulta, se esta mudou). */
  async function desfazerMovimento(mov) {
    if (!mov.efetivado) { soltarPendente(mov); reverterNaTela(mov); ui.anunciar("Movimento desfeito."); return; }
    const volta = k.estagio(mov.origemEstagioId);
    if (!volta) throw new Error("estagio_invalido");
    const atual = cardDe(mov.id) || mov.card;
    await N.moverNegocio(k, atual, volta, { ordem: mov.origem.ordem, extra: {} });
    if (mov.extra && mov.extra.consulta_em && mov.origem.consulta_em !== mov.extra.consulta_em) {
      await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: mov.id, consulta_em: mov.origem.consulta_em || null } });
    }
    if (S.vivo) await carregar({ silencioso: true });
    ui.anunciar("Movimento desfeito.");
  }

  /** Depois de recarregar o quadro do servidor, os cartões que ainda não chegaram ao servidor voltam para o destino (a tela não pode «pular»). */
  function reaplicarPendentes() {
    for (const mov of S.pend.values()) {
      if (!S.dados.colunas.some(c => c.itens.some(x => x.id === mov.id))) continue;
      S.dados.colunas = L.moverLocal(S.dados.colunas, mov.id, mov.estagioId, mov.pos, mov.ordem, mov.patch);
    }
  }

  /**
   * A tela vai sair (outra rota, aba fechada, aparelho bloqueado): o que está esperando o fim do aviso vai ao servidor agora.
   * `saindo` = a página está fechando ou ficou oculta: o pedido vai com keepalive (um pedido comum seria cancelado junto com a aba e o Ganho/Perdido se perderia).
   */
  function efetivarPendentes({ saindo = false } = {}) { for (const mov of [...S.pend.values()]) if (!mov.efetivado) efetivar(mov, { saindo }); }
  const aoEsconder = () => { if (document.hidden) efetivarPendentes({ saindo: true }); };
  const aoSairDaPagina = () => efetivarPendentes({ saindo: true });
  document.addEventListener("visibilitychange", aoEsconder);
  addEventListener("pagehide", aoSairDaPagina);

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
        if (recusarSePendente(id)) return;
        const lista = art.parentElement;
        S.teclado = { id, estagio: lista.dataset.estagio, origem: lista.dataset.estagio, art };
        art.classList.add("pego");
        art.setAttribute("aria-pressed", "true");
        ui.anunciar(`Pegou «${L.tituloCard(cardDe(id))}». Setas esquerda e direita trocam de etapa, cima e baixo a posição. Enter solta, Esc cancela.`);
        return;
      }
      if ((ev.key === "m" || ev.key === "M") && podeMover && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.target === art) { ev.preventDefault(); abrirMoverPara(id); return; }
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
      aplicarAdiado();
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
      alvo.sec.scrollIntoView({ block: "nearest", inline: "nearest", behavior: ui.comportamentoRolagem() });
      ui.anunciar(`Etapa «${alvo.e.nome}», posição ${pos + 1} de ${cards.length + 1}.`);
    }
  }

  function cancelarTeclado(anunciar) {
    const t = S.teclado;
    if (!t) return;
    S.teclado = null;
    preencherColuna(t.origem);
    if (t.estagio !== t.origem) preencherColuna(t.estagio);
    aplicarAdiado();
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

  /* ============================================================ «Mover para…» (alternativa a arrastar) */
  /** Folha com as etapas do funil (cor, nome, quantos cartões; a atual marcada). Escolher = soltar no topo da etapa, com as mesmas perguntas (valor, motivo, data). */
  async function abrirMoverPara(id) {
    const card = cardDe(id);
    if (!card || !podeMover || recusarSePendente(id)) return;
    const atualId = (colunaDeCard(id) || {}).estagio_id;
    let modalApi = null;
    const corpo = h("div", { class: "kb-mover", role: "list" }, S.funil.estagios.map(e => {
      const col = colunaDe(e.id), n = col ? Number(col.total) || 0 : 0, atual = e.id === atualId;
      return h("button", { type: "button", role: "listitem", class: ["kb-mover-op", atual && "atual"], disabled: atual, "aria-current": atual ? "step" : null,
        style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, on: { click: () => modalApi && modalApi.fechar(e.id) } },
        h("i", { "aria-hidden": "true" }), h("span", { class: "kb-mover-nome" }, e.nome),
        h("small", null, atual ? "etapa atual" : `${n} ${n === 1 ? "cartão" : "cartões"}`));
    }));
    const escolhida = await ui.modal({ titulo: "Mover para…", descricao: L.tituloCard(card), corpo, largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
    if (escolhida && S.vivo) soltar(id, escolhida, 0);
  }
  function colunaDeCard(id) { return S.dados.colunas.find(c => c.itens.some(x => x.id === id)) || null; }

  /* ============================================================ mouse e toque (pointer events) */
  let zonasEl = null;
  function inicioPonteiro(ev, id, art) {
    if (ev.button !== 0 || S.teclado || S.arrasto) return;
    if (ev.target.closest("a, button, input, select, textarea")) return;
    // toque: o cartão só sai do lugar depois de segurar 350 ms (antes disso o dedo está rolando o quadro ou tocando para abrir)
    const toque = ev.pointerType === "touch";
    S.arrasto = { id, art, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, moveu: false, pid: ev.pointerId, toque };
    const a = S.arrasto;
    if (toque) {
      a.gesto = L.novoGesto(ev.clientX, ev.clientY, agora());
      a.timer = setTimeout(() => {
        if (S.arrasto !== a) return;
        a.gesto = L.gestoTempo(a.gesto, a.gesto.t0 + L.TOQUE.MS_LONGO);
        if (a.gesto.acao === "levantar") levantarCartao(a);
      }, L.TOQUE.MS_LONGO);
    }
    addEventListener("pointermove", movePonteiro);
    addEventListener("pointerup", fimPonteiro);
    addEventListener("pointercancel", cancelarPonteiro);
  }

  /** Segurou 350 ms: o cartão «sobe» (vibração curta, sombra) e o dedo passa a arrastá-lo. Soltar sem mexer abre «Mover para…». */
  function levantarCartao(a) {
    if (a.levantado) return;
    a.levantado = true;
    a.engoleClique = true;
    try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* sem vibração */ }
    a.art.classList.add("kc-pega-toque");
    document.body.style.userSelect = "none";
    ui.anunciar(`Pegou «${L.tituloCard(cardDe(a.id))}». Arraste até a etapa ou solte para escolher onde colocar.`);
  }

  // enquanto o cartão está levantado a rolagem do navegador fica desligada (o touchmove é cancelável até a rolagem começar);
  // antes disso (dedo rolando) nada é cancelado. O ouvinte nasce ao montar a tela: a rolagem só espera o JS depois de existir um ouvinte não passivo
  const aoToqueMover = ev => { const a = S.arrasto; if (a && a.toque && a.levantado && ev.cancelable) ev.preventDefault(); };
  quadro.addEventListener("touchmove", aoToqueMover, { passive: false });

  function comecarArrasto(a, ev) {
    a.moveu = true;
    const r = a.art.getBoundingClientRect();
    a.dx = ev.clientX - r.left; a.dy = ev.clientY - r.top;
    a.fantasma = a.art.cloneNode(true);
    a.fantasma.classList.remove("kc-pega-toque");   // o clone nasce de um cartão já «levantado»: o transform é do fantasma
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
    el.classList.add("crm-arrastando");
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
    if (!a || ev.pointerId !== a.pid) return;
    a.x = ev.clientX; a.y = ev.clientY;
    if (a.toque) {
      // quem decide é a máquina de estados do crm-logica: dedo rolando nunca vira arrasto; só o cartão levantado se move
      a.gesto = L.gestoMover(a.gesto, ev.clientX, ev.clientY, agora());
      const acao = a.gesto.acao;
      if (acao === "rolar") { clearTimeout(a.timer); return; }
      if (acao === "levantar" || acao === "arrastar") levantarCartao(a);
      if (acao === "arrastar" && !a.moveu) comecarArrasto(a, ev);
      if (!a.moveu) return;
    } else if (!a.moveu) {
      if (Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < LIMIAR_ARRASTO) return;
      comecarArrasto(a, ev);
    }
    a.fantasma.style.setProperty("--x", `${ev.clientX - a.dx}px`);
    a.fantasma.style.setProperty("--y", `${ev.clientY - a.dy}px`);
    posicionarLugar(ev.clientX, ev.clientY);
  }

  /** O ponto está dentro do quadro, logo ABAIXO de uma coluna curta e na largura dela (a «raia» da coluna)? Soltar ali vale como soltar no fim da coluna. */
  function colunaDaRaia(x, y) {
    const q = quadro.getBoundingClientRect();
    const raias = [...colEls].map(([id, c]) => { const r = c.sec.getBoundingClientRect(); return { id, left: Math.max(r.left, q.left), right: Math.min(r.right, q.right), top: r.bottom, bottom: q.bottom }; });
    return colEls.get(L.alvoDoPonto(raias, x, y)) || null;
  }

  function posicionarLugar(x, y) {
    const a = S.arrasto;
    const sob = document.elementFromPoint(x, y);
    for (const z of (zonasEl ? zonasEl.children : [])) z.classList.toggle("alvo", !!sob && z.contains(sob));
    const zona = sob && sob.closest && sob.closest(".kb-zona, .kb-fita-b");     // «Ganhou/Perdeu» e a fita de etapas do celular
    for (const b of fitaEtapas.children) b.classList.toggle("alvo", !!zona && zona === b);
    for (const c of colEls.values()) c.sec.classList.remove("alvo");
    if (zona) { a.alvo = { zona: zona.dataset.estagio }; a.lugar.hidden = true; return; }
    const col = sob && sob.closest && sob.closest(".kb-col");
    const info = (col && quadro.contains(col) ? colEls.get(col.dataset.estagio) : null) || colunaDaRaia(x, y);
    // fora de qualquer coluna e de qualquer zona: não há destino — soltar aqui devolve o cartão (antes valia a última etapa em que o dedo encostou, sem destaque nenhum)
    if (!info) { a.alvo = null; a.lugar.hidden = true; return; }
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
      // a própria página rola quando o dedo chega perto do topo (abaixo da fita fixa) ou da base (acima das zonas Ganhou/Perdeu)
      const sobreZona = sob && sob.closest && sob.closest(".kb-zona, .kb-fita-b");
      if (!sobreZona) {
        const topoFixo = (fitaEtapas.offsetParent ? fitaEtapas.getBoundingClientRect().bottom : 0) || 70;
        if (a.y < topoFixo + 36) window.scrollBy(0, -Math.ceil((topoFixo + 36 - a.y) / 5));
        else if (a.y > innerHeight - 130) window.scrollBy(0, Math.ceil((a.y - (innerHeight - 130)) / 5));
      }
      if (vx) posicionarLugar(a.x, a.y);
    }
    a.raf = requestAnimationFrame(rolarBordas);
  }

  function limparArrasto() {
    const a = S.arrasto;
    if (!a) return;
    a.encerrado = true;                 // o ponteiro soltou: daqui em diante um redesenho não atrapalha mais (emGesto)
    clearTimeout(a.timer);
    removeEventListener("pointermove", movePonteiro);
    removeEventListener("pointerup", fimPonteiro);
    removeEventListener("pointercancel", cancelarPonteiro);
    if (a.raf) cancelAnimationFrame(a.raf);
    if (a.fantasma) a.fantasma.remove();
    if (zonasEl) { zonasEl.remove(); zonasEl = null; }
    a.art.classList.remove("kc-pega-toque");
    quadro.classList.remove("arrastando");
    el.classList.remove("crm-arrastando");
    document.body.style.userSelect = "";
    for (const c of colEls.values()) c.sec.classList.remove("alvo");
    for (const b of fitaEtapas.children) b.classList.remove("alvo");
  }

  function fimPonteiro(ev) {
    const a = S.arrasto;
    if (!a || (ev && ev.pointerId !== a.pid)) return;
    let acao = a.moveu ? "soltar" : "nada";
    if (a.toque) acao = (a.gesto = L.gestoSoltar(a.gesto, agora())).acao;
    limparArrasto();
    // redesenho que chegou no meio do gesto: nos casos sem soltar, só depois do click que ainda vem (ele precisa achar o cartão no lugar)
    if (!a.toque && !a.moveu) { S.arrasto = null; setTimeout(aplicarAdiado, 0); return; }        // clique simples do mouse
    if (acao === "toque") { S.arrasto = null; setTimeout(aplicarAdiado, 0); return; }            // toque curto: o click normal abre o cartão
    if (acao === "nada") {                                         // o dedo estava rolando (ou o sistema tomou o gesto)
      if (a.lugar) a.lugar.remove();
      a.art.hidden = false;
      S.arrasto = null;
      if (a.moveu) preencherColunaDoCartao(a.id);
      aplicarAdiado();
      return;
    }
    if (acao === "mover_para") {                                   // segurou e soltou sem arrastar: a folha «Mover para…»
      a.engoleClique = true;
      setTimeout(() => { if (S.arrasto === a) S.arrasto = null; }, 450);   // o click que vem depois do pointerup não abre a gaveta
      aplicarAdiado();
      abrirMoverPara(a.id);
      return;
    }
    const alvo = a.alvo;
    if (a.lugar) a.lugar.remove();
    a.art.hidden = false;
    setTimeout(() => { S.arrasto = null; }, 0);   // o click que vem depois do pointerup não abre a gaveta
    aplicarAdiado();                              // antes de soltar: o movimento parte do quadro já atualizado
    if (!alvo) { preencherColunaDoCartao(a.id); return; }
    if (alvo.zona) { soltar(a.id, alvo.zona, 0); return; }
    soltar(a.id, alvo.estagio, Math.max(0, alvo.indice));
  }

  function cancelarPonteiro(ev) {
    const a = S.arrasto;
    if (!a || (ev && ev.pointerId !== undefined && a.pid !== undefined && ev.pointerId !== a.pid)) return;
    limparArrasto();
    if (a.lugar) a.lugar.remove();
    a.art.hidden = false;
    S.arrasto = null;
    if (a.moveu) preencherColunaDoCartao(a.id);
    aplicarAdiado();
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
    if (n > 0) chips.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p crm-chips-limpar", on: { click: () => {
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
      if (mn != null && mx != null && mn > mx) { ui.toast("O valor mínimo precisa ser menor ou igual ao máximo.", { tipo: "erro" }); vMin.focus(); return; }
      if (de.value && ate.value && de.value > ate.value) { ui.toast("A data inicial precisa ser anterior ou igual à final.", { tipo: "erro" }); de.focus(); return; }
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
    if (!S.vivo || S.arrasto || S.teclado || document.hidden || S.pend.size) return;
    if (Date.now() - S.ultimaRecarga < PULSO_MIN_MS) return;
    if (document.querySelector("dialog[open]")) return;
    carregar({ silencioso: true });
  }) : null;

  // a base veio do aparelho e a rede trouxe funis/etapas diferentes: o quadro foi montado com os antigos — refaz o funil atual, o seletor e recarrega em silêncio
  const cancelarBase = typeof k.aoBaseMudar === "function" ? k.aoBaseMudar(() => {
    if (!S.vivo) return;
    S.funil = (S.funil && k.funil(S.funil.id)) || k.funilPadrao();
    gravarLocal();
    desenharSelFunil();
    carregar({ silencioso: true });
  }) : null;

  // M30: a tela entra assim que há o que mostrar — o último quadro guardado (aoCache) ou a resposta da rede, o que vier primeiro
  const pronta = new Promise(res => { S.pronta = res; });
  carregar().finally(() => S.pronta());
  await pronta;
  return {
    aoMudarNegocio: () => carregar({ silencioso: true }),
    desmontar() {
      S.vivo = false; S.seq++;
      if (S.arrasto) cancelarPonteiro();
      efetivarPendentes();
      document.removeEventListener("visibilitychange", aoEsconder);
      removeEventListener("pagehide", aoSairDaPagina);
      document.removeEventListener("keydown", aoTeclaGlobal);
      if (cancelarPulso) cancelarPulso();
      if (cancelarBase) cancelarBase();
    },
  };
}
