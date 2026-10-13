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
   - plano 50 (04/10): resumo do funil acima do quadro (barras por etapa +
     «quantos seguem» entre etapas, com versão em tabela), mini-barra de
     participação no cabeçalho da coluna, cartão com avatar, barra de
     «tempo na etapa» (verde→âmbar→vermelho pelo prazo da etapa ou 3/7 dias),
     próxima tarefa e selo da origem; totais que contam ao entrar e acendem
     ao mudar; legenda da distribuição leva à coluna; «/» foca a busca
   ============================================================ */

const LIMIAR_ARRASTO = 6;           // px antes de virar arrasto
const BORDA_ROLAGEM = 70;           // px da borda que começam a rolar
const PULSO_MIN_MS = 8000;          // recarga silenciosa no máximo a cada 8 s
const LIMITE_NA_TELA = 300;         // plano 1000 (CR-028): acima disso a rolagem não traz mais cartões sozinha (o botão continua)
const CONFERIR_MS = [15000, 60000]; // plano 1000 (CR-003): reconferência de um movimento sem confirmação (a internet pode nem ter caído)
/** JSON com as chaves em ordem (o filtro guardado e o montado no popover podem ter a mesma coisa em outra ordem). */
const canonico = v => (Array.isArray(v) ? `[${v.map(canonico).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).filter(x => v[x] !== undefined).sort().map(x => `${JSON.stringify(x)}:${canonico(v[x])}`).join(",")}}` : JSON.stringify(v));
const OUTRO_FUNIL = "__outro_funil__";  // plano 1000 (CR-044): escolha «Outro funil…» da folha «Mover para…»
const agora = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

export async function montarKanban(k, el, rota) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  const Vis = await k.mod("visoes");
  const cli = ctx.cliente.id;
  // plano 1000 (CR-024): a preferência é da CONTA (aparelho compartilhado: a próxima pessoa não herda «dono: eu») e a busca digitada
  // (nome/telefone de paciente) não fica gravada no aparelho. A chave antiga (só da empresa) é lida uma vez, sem a busca, e apagada.
  const conta = (typeof k.eu === "function" && k.eu()) || "-";
  const chaveLocal = `nx-app-crm-kb-${cli}-${conta}`;
  const chaveAntiga = `nx-app-crm-kb-${cli}`;
  const lerLocal = () => {
    try {
      let bruto = localStorage.getItem(chaveLocal);
      if (bruto === null && (bruto = localStorage.getItem(chaveAntiga)) !== null) localStorage.removeItem(chaveAntiga);
      const o = JSON.parse(bruto || "{}") || {};
      if (o.filtro && typeof o.filtro === "object") delete o.filtro.busca;
      return o;
    } catch { return {}; }
  };
  let controlesVisoes = null;
  const gravarLocal = () => {
    const { busca: _b, ...semBusca } = S.filtro || {};
    try { localStorage.setItem(chaveLocal, JSON.stringify({ funil: S.funil && S.funil.id, filtro: semBusca, todosFechados: S.todosFechados, fechadosDias: S.fechadosDias })); } catch { /* ok */ }
    if (controlesVisoes) controlesVisoes.atualizar();
    atualizarAtalhos();
  };

  const salvo = lerLocal();
  const funis = () => k.base.funis.filter(f => f.ativo !== false);
  const S = {
    funil: k.funil(rota.query && rota.query.funil) || k.funil(salvo.funil) || k.funilPadrao(),
    filtro: salvo.filtro && typeof salvo.filtro === "object" ? salvo.filtro : {},
    todosFechados: salvo.todosFechados === true,
    // plano 1000 (CR-215): quantos dias de fechados o quadro mostra (30 · 90 · 0 = todos) — escolhido nos Filtros, lembrado no aparelho
    fechadosDias: [30, 90, 0].includes(salvo.fechadosDias) ? salvo.fechadosDias : (salvo.todosFechados === true ? 0 : 30),
    dados: null,
    seq: 0,
    arrasto: null,
    teclado: null,
    ultimaRecarga: 0,
    vivo: true,
    pend: new Map(),      // M25: movimentos que ainda não chegaram ao servidor (adiados pelos 7 s do Desfazer) ou à espera de confirmação
    adiado: null,         // redesenho que chegou no meio de um arrasto: {dados?} — feito quando o gesto termina (aplicarAdiado)
    conferencias: new Set(),   // plano 1000 (CR-003): reconferências agendadas (canceladas ao sair da tela)
    meus: new Set(),      // plano 1000 (CR-204): cartões que esta tela (ou a gaveta aberta daqui) acabou de mudar — não acendem como «movido por outra pessoa»
    estadoVazio: "",
    sel: new Set(),       // plano 1000 (CR-035): cartões selecionados (Shift/Ctrl + clique) para mover de uma vez
  };
  let obsMais = null;     // plano 1000 (CR-028): observa o «Ver mais» de cada coluna para carregar a próxima página ao rolar até ele
  delete S.filtro.fechados_dias;
  definirFechados(S.fechadosDias);
  // plano 1000 (CR-185): «Ver todos com “mar”» da paleta abre o quadro com a busca preenchida (vale só nesta visita: a busca não é gravada)
  if (rota.query && typeof rota.query.busca === "string" && rota.query.busca.trim()) S.filtro.busca = rota.query.busca.trim().slice(0, 120);
  // plano 1000 (CR-246): «revisar as paradas» (vazio de Tarefas) abre o quadro já no atalho «Parados há 7+ dias»
  if (rota.query && /^(3|7|15|30)$/.test(String(rota.query.parados || ""))) S.filtro.parado_dias = Number(rota.query.parados);
  const podeMover = k.pode("atendente");
  const comConversas = !!(ctx.temModulo && ctx.temModulo("conversas"));
  ctx.titulo(k.v.crm);
  /** CR-030: «Tarefa» do cartão — o formulário de sempre, já ligado ao negócio (e ao contato). */
  async function novaTarefa(c, idContato) {
    try {
      const T = await k.mod("tarefas");
      const t = await T.formTarefa(k, null, { negocio_id: c.id, contato_id: idContato ?? null });
      if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); S.meus.add(c.id); carregar({ silencioso: true }); }
    } catch (e) { k.toastErro(e); }
  }

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
  // plano 1000 (CR-031): depois de buscar, o leitor de tela ouve quantos cartões sobraram (o quadro muda em silêncio)
  const aoBuscar = ui.debounce(async () => {
    const q = busca.value.trim(); if (q) S.filtro.busca = q; else delete S.filtro.busca; gravarLocal();
    await carregar({ silencioso: true });
    if (!S.vivo || !S.dados || (S.filtro.busca || "") !== q) return;
    const n = S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0);
    ui.anunciar(q ? `${ui.num(n)} ${n === 1 ? "cartão encontrado" : "cartões encontrados"} para «${q}».` : `Busca limpa: ${ui.num(n)} ${n === 1 ? "cartão" : "cartões"} no quadro.`);
  }, 320);
  busca.addEventListener("input", aoBuscar);
  busca.addEventListener("keydown", ev => { if (ev.key === "Escape" && busca.value) { busca.value = ""; aoBuscar(); } });

  const nFiltros = h("span", { class: "crm-filtro-n", hidden: true });
  const btFiltros = h("button", { type: "button", class: "bt bt-sec crm-filtro-bt", "aria-haspopup": "dialog" }, ui.icone("filtro"), "Filtros", nFiltros);
  btFiltros.addEventListener("click", abrirFiltros);
  const chips = h("div", { class: "crm-chips", "aria-label": "Filtros ativos" });
  const btMeus = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(S.filtro.dono === "eu"), on: { click: () => {
    S.filtro.dono = S.filtro.dono === "eu" ? undefined : "eu"; if (!S.filtro.dono) delete S.filtro.dono;
    gravarLocal(); carregar({ silencioso: true });
  } } }, `${k.v.art("negocio") === "a" ? "Minhas" : "Meus"} ${k.v.min("negocios")}`);       // plano 1000 (CR-006): o termo da vertical
  const btParados = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(Number(S.filtro.parado_dias) === 7), on: { click: () => {
    if (Number(S.filtro.parado_dias) === 7) delete S.filtro.parado_dias; else S.filtro.parado_dias = 7;
    gravarLocal(); carregar({ silencioso: true });
  } }, title: "Sem mudar de etapa há 7 dias ou mais" }, "Parados há 7+ dias");      // plano 1000 (CR-205): o rótulo diz o que é
  // plano 1000 (CR-036): «Recolher vazias» — coluna sem cartão vira uma faixa estreita (continua destino do arrasto); lembrado por empresa no aparelho
  const chaveRecolher = `nx-app-crm-kb-recolher-${cli}`;
  S.recolher = (() => { try { return localStorage.getItem(chaveRecolher) === "1"; } catch { return false; } })();
  const btRecolher = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho crm-recolher", "aria-pressed": String(S.recolher), title: "Colunas sem cartão viram uma faixa estreita",
    on: { click: () => {
      S.recolher = !S.recolher;
      btRecolher.setAttribute("aria-pressed", String(S.recolher));
      try { localStorage.setItem(chaveRecolher, S.recolher ? "1" : "0"); } catch { /* ok */ }
      for (const [id, c] of colEls) marcarRecolhida(c, colunaDe(id));
      ui.anunciar(S.recolher ? "Colunas vazias recolhidas." : "Todas as colunas abertas.");
    } } }, "Recolher vazias");
  // plano 1000 (CR-296): «atualizado às 14:02» discreto; passa de 2 min sem recarga (pulso parado, rede caída) e fica âmbar
  const idade = h("small", { class: "crm-kb-idade", hidden: true });
  function pintarIdade() {
    if (!S.ultimaRecarga) { idade.hidden = true; return; }
    const min = Math.floor((Date.now() - S.ultimaRecarga) / 60000);
    idade.hidden = false;
    idade.textContent = `atualizado às ${ui.horaBR(new Date(S.ultimaRecarga).toISOString())}`;
    idade.classList.toggle("velho", min >= 2);
    if (min >= 2) idade.setAttribute("title", `Sem atualizar há ${min} min. Confira a internet ou recarregue a página.`); else idade.removeAttribute("title");
  }
  const tIdade = setInterval(() => { if (S.vivo) pintarIdade(); }, 30000);
  if (tIdade && typeof tIdade.unref === "function") tIdade.unref();     // (no Node dos testes o relógio não segura o processo)
  const atalhos = h("div", { class: "crm-atalhos", "aria-label": "Filtros rápidos" }, btMeus, btParados, btRecolher, idade);
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
      if (!funil || funil.ativo === false) throw new Error("O funil deste filtro salvo não está disponível.");
      S.funil = funil; S.filtro = dados.filtro || {}; S.todosFechados = dados.todosFechados === true; S.fechadosDias = S.todosFechados ? 0 : 30;
      // plano 1000: escolhido dentro da folha de Filtros (celular), a escolha já resolveu — a folha fecha sem reler o formulário antigo por cima
      if (S.fecharFiltros) S.fecharFiltros();
      busca.value = S.filtro.busca || "";
      history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm?funil=${encodeURIComponent(funil.id)}`);
      desenharSelFunil(); gravarLocal(); await carregar({ silencioso: true });
      ui.toast("Filtro salvo aplicado.", { tipo: "ok", ms: 1600 });
    } });

  const totAbertos = h("b", null, "—"), totSoma = h("b", null, "—"), totPrev = h("b", null, "—"), totGanho = h("b", null, "—");
  const distBarra = h("div", { class: "crm-dist-barra", role: "img" });
  const distLeg = h("div", { class: "crm-dist-leg" });
  // plano 1000 (CR-018): com filtro ou busca ativos os números são do RECORTE — a legenda e um ponto no cartão dizem isso
  const legTot = [h("small", null, "no funil agora"), h("small", null, "soma dos valores previstos"), h("small", null, "valor × chance de cada etapa")];
  const LEG_TOT = ["no funil agora", "soma dos valores previstos", "valor × chance de cada etapa"];
  // plano 1000 (CR-032): 4º número — o que foi ganho no período do quadro (a soma da coluna de ganho, a mesma conta do servidor)
  const rotGanho = h("span", { class: "rotulo" }, `${k.v.ganhar} · 30 dias`);
  const legGanho = h("small", null, "valor final dos ganhos");
  const totais = h("section", { class: "crm-totais", "aria-label": "Totais do funil" },
    h("div", { class: "crm-tot" }, h("span", { class: "rotulo" }, `${k.v.negocios} abert${k.v.art("negocio")}s`), totAbertos, legTot[0]),
    h("div", { class: "crm-tot" }, h("span", { class: "rotulo" }, "Em aberto"), totSoma, legTot[1]),
    h("div", { class: "crm-tot crm-tot-prev" }, h("span", { class: "rotulo" }, "Previsão (pela chance de cada etapa)"), totPrev, legTot[2]),
    h("div", { class: "crm-tot crm-tot-ganho" }, rotGanho, totGanho, legGanho),
    h("div", { class: "crm-dist" }, h("span", { class: "rotulo" }, "Distribuição por etapa"), distBarra, distLeg));
  const reduzido = () => { try { return !!(matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
  const telaPequena = () => { try { return !!(matchMedia && matchMedia("(max-width: 760px)").matches); } catch { return false; } };
  /** Número do topo: na 1ª pintura conta até o valor (G.contar); quando muda depois, troca e acende (G.destacar). Sem graficos.js só troca o texto.
      Compara com o ALVO (o aria-label guarda o valor final durante a contagem), não com o número parcial; a rede que chega no meio da contagem do
      quadro guardado para a contagem e escreve o valor novo no texto e no aria-label. */
  function pintarNumero(el, valor, fmt) {
    const txt = fmt(valor), alvo = el.getAttribute("aria-label");
    if (alvo === txt || (alvo === null && el.textContent === txt)) return;
    const primeira = el.textContent === "—";
    const G = k.G;
    // plano 1000 (CR-211): com movimento reduzido o número entra direto, sem contar até o valor
    if (primeira && G && typeof G.contar === "function" && !reduzido()) { G.contar(el, valor, fmt); return; }
    if (typeof el.__pararContagem === "function") el.__pararContagem();
    el.textContent = txt;
    el.setAttribute("aria-label", txt);
    if (!primeira && G && typeof G.destacar === "function") G.destacar(el);
  }

  // plano 50 (item 24): resumo do funil — barras «chegaram até aqui» por etapa e «quantos seguem» para a próxima, só com as contagens do quadro.
  // Recolhível (estado por empresa no aparelho). Começa aberto só em tela alta (≥ 900 px) e larga: em 768 px de altura e no celular o quadro
  // precisa aparecer na 1ª tela — recolhido, o cabeçalho mostra a faixa compacta (contagem e % entre as etapas). Com versão em tabela.
  const telaAlta = () => { try { return !!(matchMedia && matchMedia("(min-height: 900px)").matches); } catch { return false; } };
  const chaveResumo = `nx-app-crm-fr-${cli}`;
  let resumoAberto = (() => { try { const v = localStorage.getItem(chaveResumo); return v === null ? (!telaPequena() && telaAlta()) : v !== "0"; } catch { return false; } })();
  const resMini = h("span", { class: "crm-fr-mini", "aria-hidden": "true" });      // «● 4 → 75% ● 3 → 67% …» enquanto recolhido (o texto completo está nas linhas)
  const resLista = h("ol", { class: "crm-fr-lista", "aria-label": "Etapas do funil" });
  const resTabela = h("div", { class: "crm-fr-tabela", hidden: true });
  const resNota = h("p", { class: "crm-fr-nota" });
  const btResTabela = h("button", { type: "button", class: "bt bt-fant bt-p crm-fr-vertabela", "aria-pressed": "false", on: { click: () => {
    const liga = resTabela.hidden;
    resTabela.hidden = !liga; resLista.hidden = liga;
    btResTabela.setAttribute("aria-pressed", String(liga));
    btResTabela.textContent = liga ? "Ver como barras" : "Ver como tabela";
  } } }, "Ver como tabela");
  const idRes = `crm-fr-${cli}`;
  const resCorpo = h("div", { class: "crm-fr-corpo", id: idRes }, resLista, resTabela, resNota);
  const btResumo = h("button", { type: "button", class: "crm-fr-cab", "aria-expanded": String(resumoAberto), "aria-controls": idRes, on: { click: () => {
    resumoAberto = !resumoAberto; aplicarResumoAberto();
    try { localStorage.setItem(chaveResumo, resumoAberto ? "1" : "0"); } catch { /* ok */ }
  } } }, h("span", { class: "crm-fr-titulo" }, "Resumo do funil"), h("span", { class: "crm-fr-sub" }, "quantos seguem de uma etapa para a próxima"), resMini, ui.icone("seta-baixo"));
  const resumoFunil = h("section", { class: "crm-fr", "aria-label": "Resumo do funil", hidden: true }, h("div", { class: "crm-fr-topo" }, btResumo, btResTabela), resCorpo);
  function aplicarResumoAberto() { btResumo.setAttribute("aria-expanded", String(resumoAberto)); resCorpo.hidden = !resumoAberto; btResTabela.hidden = !resumoAberto; }
  aplicarResumoAberto();

  const quadro = h("div", { class: "kb", role: "region", "aria-label": `Quadro de ${k.v.min("negocios")}`, tabindex: "-1" });
  const instr = h("p", { id: `kb-instr-${cli}`, class: "sr-only" },
    podeMover ? "Enter abre. Espaço pega o cartão para mover: setas esquerda e direita trocam de etapa, cima e baixo mudam a posição, Enter solta, Esc cancela. A tecla M abre a lista de etapas para mover o cartão. A tecla N cria um cartão novo. Shift com clique seleciona vários para mover de uma vez; Ctrl com clique abre numa nova aba." : "Enter abre.");
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
  // plano 1000 (CR-299): o KPI «Em aberto» do Início chega com ?resumo=1 — os totais (celular) e o resumo do funil já abertos (só nesta visita)
  if (rota.query && rota.query.resumo === "1") {
    totais.classList.add("aberto"); resumoLinha.setAttribute("aria-expanded", "true");
    resumoAberto = true; aplicarResumoAberto();
  }

  const btNovo = podeMover ? h("button", { type: "button", class: "bt bt-prim crm-novo", on: { click: () => novo({}) } }, ui.icone("mais"), k.v.novo("negocio")) : null;
  // botão flutuante do celular: irmão direto do .crm (um ancestral com transform prenderia o position:fixed)
  const fab = podeMover ? h("button", { type: "button", class: "crm-fab", "aria-label": k.v.novo("negocio"), title: k.v.novo("negocio"), on: { click: () => novo({}) } },
    ui.icone("mais"), h("span", { class: "crm-fab-txt" }, k.v.novo("negocio"))) : null;
  el.append(...[
    ui.cabecalho({ titulo: k.v.crm, acoes: [btNovo, selFunilM] }),
    selFunil,
    h("div", { class: "pilha-p crm-kb-ferramentas" }, fitaBusca, atalhos, controlesVisoes.el, chips),
    fitaEtapas, resumoLinha, totais, resumoFunil, areaVazia, corpoQuadro, instr, fab].filter(Boolean));
  desenharSelFunil();

  // plano 1000 (CR-035): barra da seleção — «3 selecionados · Mover para… · Limpar»
  const selTxt = h("b", { class: "crm-sel-n", role: "status" });
  const barraSel = h("div", { class: "crm-sel", role: "group", "aria-label": "Cartões selecionados", hidden: true }, selTxt,
    h("button", { type: "button", class: "bt bt-prim bt-p crm-sel-mover", on: { click: () => moverSelecionados() } }, "Mover para…"),
    h("button", { type: "button", class: "bt bt-fant bt-p crm-sel-limpar", on: { click: () => limparSel() } }, "Limpar seleção"));
  el.insertBefore(barraSel, corpoQuadro);
  function pintarSel() {
    for (const x of S.sel) if (!cardDe(x)) S.sel.delete(x);
    barraSel.hidden = !S.sel.size;
    selTxt.textContent = `${S.sel.size} ${S.sel.size === 1 ? "selecionado" : "selecionados"}`;
    for (const art of quadro.querySelectorAll(".kc")) art.classList.toggle("kc-sel", S.sel.has(Number(art.dataset.id)) || S.sel.has(art.dataset.id));
  }
  function alternarSel(id) {
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
    pintarSel();
    ui.anunciar(`${S.sel.size} ${S.sel.size === 1 ? "cartão selecionado" : "cartões selecionados"}.`);
  }
  function limparSel() { S.sel.clear(); pintarSel(); }

  // plano 1000 (CR-270): no toque, uma dica única («Segure o cartão para mover») — some no primeiro arrasto (ou no «Entendi») e não volta neste aparelho
  const CHAVE_DICA_SEGURAR = "nx-app-crm-dica-segurar";
  let dicaSegurar = null;
  const fecharDicaSegurar = () => {
    if (!dicaSegurar) return;
    dicaSegurar.remove(); dicaSegurar = null;
    try { localStorage.setItem(CHAVE_DICA_SEGURAR, "1"); } catch { /* ok */ }
  };
  try {
    const toqueAqui = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    if (podeMover && toqueAqui && localStorage.getItem(CHAVE_DICA_SEGURAR) !== "1") {
      dicaSegurar = h("p", { class: "aviso crm-dica-segurar", role: "note" }, ui.icone("arrastar"),
        h("span", null, "Segure o cartão por um instante para movê-lo de etapa."),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: fecharDicaSegurar } }, "Entendi"));
      el.insertBefore(dicaSegurar, corpoQuadro);
    }
  } catch { /* sem armazenamento: sem dica */ }

  /** plano 1000 (CR-215): 30 · 90 · 0 (todos) — «todosFechados» continua para os filtros salvos e o rodapé das colunas fechadas. */
  function definirFechados(d) { S.fechadosDias = [30, 90, 0].includes(d) ? d : 30; S.todosFechados = S.fechadosDias === 0; }

  /* ============================================================ dados */
  function filtroServidor() {
    const f = { ...S.filtro };
    if (S.fechadosDias !== 30) f.fechados_dias = S.fechadosDias;      // plano 1000 (CR-215): 90 dias ou todos (0)
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
      pintarIdade();
      // a resposta chegou com um cartão sendo arrastado: redesenhar agora apagaria o cartão e o marcador do gesto (no celular o arrasto cairia) — fica para o fim do gesto
      if (!igual && !trocouTudo && emGesto()) { S.adiado = { dados: d }; return; }
      S.adiado = null;
      const antes = !trocouTudo && S.dados ? etapasNaTela() : null;
      S.dados = d;
      if (igual) return;
      reaplicarPendentes();
      // plano 1000 (CR-023): recarga silenciosa (pulso, busca) refaz SÓ as colunas que mudaram — o resto mantém os nós (hover, foco, animação)
      if (antes) atualizarQuadro(antes); else desenharQuadro();
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
    quadro.appendChild(ui.vazio({ titulo: "Nenhum funil ativo.", texto: "Crie um funil em Configurações → Funis e etapas.", tema: "crm",
      acao: k.pode("admin") ? { rotulo: "Abrir configurações", fn: () => ctx.navegar("#/config/funis") } : null }));
  }

  /* ============================================================ desenho */
  const colEls = new Map();    // estagio_id → {sec, lista, n, soma, extra}

  function colunaDe(id) { return S.dados.colunas.find(c => c.estagio_id === id); }
  /** O que a coluna desenhou (CR-023); nas fechadas entra também o período dos fechados (CR-215: o rodapé «últimos 90 dias» muda sem a resposta mudar). */
  const jsonColuna = (e, col) => JSON.stringify(col) + (e && e.tipo !== "aberto" ? `|${S.fechadosDias}` : "");

  function desenharQuadro() {
    // a recarga silenciosa (pulso, busca) refaz as colunas: guarda a rolagem para o quadro não voltar à 1ª coluna no celular
    const rolagem = colEls.size ? { x: quadro.scrollLeft, y: new Map([...colEls].map(([id, c]) => [id, c.lista.scrollTop])) } : null;
    colEls.clear();
    if (obsMais) obsMais.disconnect();
    ui.limpar(quadro);
    S.estadoVazio = estadoVazioAgora();
    areaVazia.hidden = !S.estadoVazio;
    ui.limpar(areaVazia);
    if (S.estadoVazio === "total") {
      const fem = k.v.art("negocio") === "a";
      areaVazia.appendChild(ui.vazio({
        titulo: `${k.v.nenhum("negocio")} aqui ainda.`,
        texto: `${fem ? "Elas aparecem sozinhas" : "Eles aparecem sozinhos"} quando alguém chama no WhatsApp — ou ${fem ? "crie uma" : "crie um"} agora.`,
        tema: "crm", acao: podeMover ? { rotulo: k.v.novo("negocio"), fn: () => novo({}) } : null }));
    } else if (S.estadoVazio === "filtro") {
      // plano 1000 (CR-200): a busca e os filtros valem para todos os funis — trocar para um funil sem nada que passe neles não pode parecer «quadro vazio»
      areaVazia.appendChild(ui.vazio({ tipo: "sem_resultado", tema: "crm", titulo: "Nada com estes filtros neste funil.",
        texto: S.filtro.busca ? `A busca «${S.filtro.busca}» e os filtros ativos valem para todos os funis.` : "Os filtros ativos valem para todos os funis.",
        acao: { rotulo: "Limpar filtros", fn: limparTudo } }));
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

  /** «» (há cartões) · «total» (funil vazio de verdade) · «filtro» (nada passa na busca/filtros neste funil). */
  function estadoVazioAgora() {
    if (!S.dados.colunas.every(c => !c.total)) return "";
    return L.filtroVazio(S.filtro) ? "total" : "filtro";
  }
  /** «Limpar filtros» do quadro vazio por filtro: tira também a busca. */
  function limparTudo() { S.filtro = {}; busca.value = ""; gravarLocal(); carregar({ silencioso: true }); }

  /** id do cartão → etapa em que ele está NA TELA agora (para notar o que outra pessoa moveu). */
  function etapasNaTela() {
    const m = new Map();
    for (const c of (S.dados && S.dados.colunas) || []) for (const x of c.itens || []) m.set(x.id, c.estagio_id);
    return m;
  }

  /**
   * plano 1000 (CR-023): a recarga silenciosa compara coluna a coluna (o JSON que a coluna desenhou) e só refaz as que mudaram; os totais
   * uma vez. Funil/etapas diferentes do que está desenhado, ou o quadro passou a (ou deixou de) estar vazio → desenha tudo.
   */
  function atualizarQuadro(antes) {
    const ids = S.funil.estagios.map(e => e.id), naTela = [...colEls.keys()];
    if (ids.length !== naTela.length || ids.some((id, i) => naTela[i] !== id) || estadoVazioAgora() !== (S.estadoVazio || "")) { desenharQuadro(); destacarMovidos(antes); return; }
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id) || { estagio_id: e.id, total: 0, soma_previsto: 0, soma_valor: 0, itens: [] };
      const c = colEls.get(e.id);
      if (jsonColuna(e, col) === c.json) continue;
      const y = c.lista.scrollTop;
      preencherColuna(e.id, col);
      c.lista.scrollTop = y;
    }
    desenharTotais();
    destacarMovidos(antes);
  }

  /**
   * plano 1000 (CR-204): o cartão que chegou de outra etapa numa recarga — e não foi esta tela nem a gaveta aberta daqui que moveu — acende por
   * 2 s com «Mudou de etapa agora (outra pessoa da equipe)»: dois atendentes no mesmo quadro percebem o movimento do colega.
   */
  function quemMoveu(x) {
    if (!x || !("movido_por" in x || "movido_por_id" in x)) return null;
    if (x.movido_por_id === null || x.movido_por_id === undefined) return x.movido_em ? "por uma automação" : null;
    if (typeof k.eu === "function" && String(x.movido_por_id) === String(k.eu())) return "por você, em outra tela";
    const nome = String(x.movido_por || (typeof k.usuario === "function" && (k.usuario(x.movido_por_id) || {}).nome) || "").trim();
    return nome ? `por ${nome}` : null;
  }
  function destacarMovidos(antes) {
    if (!antes) return;
    const movidos = [];
    for (const col of S.dados.colunas) for (const x of col.itens || []) {
      const era = antes.get(x.id);
      if (era === undefined || era === col.estagio_id || S.pend.has(x.id) || S.meus.has(x.id)) continue;
      const el = quadro.querySelector(`.kc[data-id="${x.id}"]`);
      if (!el) continue;
      el.classList.add("kc-movido");
      const tituloAntes = el.getAttribute("title");      // CR-271: a dica «Entrou em…» volta depois do aviso
      // contrato 20261013d (CR-204): o cartão diz QUEM moveu (movido_por); sem autor = automação; servidor antigo (sem o campo) = «outra pessoa da equipe»
      const quem = quemMoveu(x);
      el.setAttribute("title", `Mudou de etapa agora (${quem || "outra pessoa da equipe"})`);
      if (quem) {
        // o nome fica à vista por 4 s no canto do cartão (o leitor de tela ouve pelo anúncio abaixo)
        const selo = h("span", { class: "kc-movido-por", "aria-hidden": "true" }, `Movido ${quem}`);
        el.appendChild(selo);
        setTimeout(() => selo.remove(), 4000);
      }
      setTimeout(() => { el.classList.remove("kc-movido"); if (tituloAntes) el.setAttribute("title", tituloAntes); else el.removeAttribute("title"); }, 2000);
      movidos.push(`«${L.tituloCard(x)}» foi para ${(k.estagio(col.estagio_id) || {}).nome || "outra etapa"}${quem ? ` (${quem})` : ""}`);
    }
    S.meus.clear();
    if (movidos.length && movidos.length <= 2) ui.anunciar(`${movidos.join("; ")}.`);
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
        // plano 1000 (CR-269): Ganho/Perdido com ✓/✕ — na fita as etapas fechadas não parecem abertas
        e.tipo === "ganho" || e.tipo === "perdido" ? h("span", { class: `kb-fita-ic kb-fita-${e.tipo}`, "aria-hidden": "true" }, ui.icone(e.tipo === "ganho" ? "check" : "fechar")) : h("i", { "aria-hidden": "true" }),
        h("span", null, e.nome), h("b", { class: "dado" }, ui.num(n)));
      if (e.tipo !== "aberto") b.setAttribute("aria-label", `${e.nome} (${e.tipo === "ganho" ? "fechada, ganho" : "fechada, perda"}), ${n} ${n === 1 ? "cartão" : "cartões"}`);
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
    // plano 50 (item 23): mini-barra de participação — quanto desta etapa há no funil (abertas: entre as abertas; fechadas: no quadro todo)
    const prop = h("span", { class: "kb-col-prop", role: "img" }, h("i"));
    const pct = h("span", { class: "kb-col-pct dado" });
    const anun = h("span", { class: "kb-col-anuncio", hidden: true });      // C10: «2 de anúncio» quando a coluna tem cartão vindo de anúncio
    const sec = h("section", { class: "kb-col", dataset: { estagio: e.id, tipo: e.tipo }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, "aria-labelledby": idNome },
      h("header", { class: "kb-col-cab" },
        h("div", { class: "kb-col-l1" }, h("i", { "aria-hidden": "true" }), h("h2", { class: "kb-col-nome", id: idNome }, e.nome), n, mais),
        h("div", { class: "kb-col-l2" }, soma, h("span", { class: "kb-col-tipo" }, tipoTxt)),
        h("div", { class: "kb-col-l3" }, prop, pct, anun)),
      lista, extra);
    colEls.set(e.id, { sec, lista, n, soma, extra, e, prop, pct, anun });
    preencherColuna(e.id, col);
    return sec;
  }

  /** Participação de cada coluna (item 23): largura da mini-barra e a porcentagem ao lado. */
  function desenharParticipacao() {
    const part = L.participacaoEtapas(S.dados.colunas, S.funil.estagios);
    for (const [id, c] of colEls) {
      const p = part.get(id) || { n: 0, fracao: 0, pct: 0 };
      c.prop.style.setProperty("--w", `${Math.max(p.n ? 2 : 0, p.fracao * 100).toFixed(1)}%`);
      c.pct.textContent = `${p.pct}%`;
      c.prop.setAttribute("aria-label", `${p.pct}% d${k.v.art("negocio")}s ${k.v.min("negocios")} ${c.e.tipo === "aberto" ? `abert${k.v.art("negocio")}s` : "do quadro"}`);
    }
  }

  /** Resumo do funil (item 24): uma linha por etapa aberta (e a de ganho) com a barra «chegaram», o que está nela agora e quantos seguem. */
  function desenharResumoFunil() {
    const linhas = L.resumoFunil(S.dados.colunas, S.funil.estagios);
    ui.limpar(resLista); ui.limpar(resTabela); ui.limpar(resMini);
    resumoFunil.hidden = !linhas.length;
    if (!linhas.length) return;
    linhas.forEach((l, i) => {
      // append nativo: nada de null na lista (viraria o texto «null»)
      resMini.append(h("i", { class: "crm-fr-mini-p", style: k.cor(l.cor) ? { "--cor": k.cor(l.cor) } : null, title: l.nome }), h("b", { class: "dado" }, ui.num(l.chegaram)));
      if (l.conversao != null) resMini.append(h("small", { class: ["dado", l.conversao >= .5 ? "boa" : l.conversao >= .25 ? "media" : "baixa"] }, `→ ${L.pctInteiro(l.conversao)} →`));
      else if (linhas[i + 1]) resMini.append(h("small", { class: "dado" }, "→"));
    });
    linhas.forEach((l, i) => {
      const prox = linhas[i + 1];
      const conv = l.conversao;
      resLista.appendChild(h("li", { class: ["crm-fr-it", `t-${l.tipo}`], style: { "--i": String(i), ...(k.cor(l.cor) ? { "--cor": k.cor(l.cor) } : {}) } },
        h("button", { type: "button", class: "crm-fr-nome", title: `Ir para a coluna ${l.nome}`, on: { click: () => irParaColuna(l.id) } }, h("i", { "aria-hidden": "true" }), h("span", null, l.nome)),
        h("span", { class: "crm-fr-trilho", role: "img", "aria-label": `${l.nome}: ${ui.num(l.chegaram)} ${l.chegaram === 1 ? "cartão chegou" : "cartões chegaram"} até aqui; ${ui.num(l.n)} ${l.n === 1 ? "está" : "estão"} nela agora` },
          h("i", { class: "crm-fr-barra", style: { "--w": `${Math.max(l.chegaram > 0 ? 3 : 0, l.pctTopo * 100).toFixed(1)}%` } }),
          h("b", { class: "dado" }, ui.num(l.chegaram))),
        h("span", { class: "crm-fr-agora" }, `${ui.num(l.n)} agora`, l.valor ? h("small", { class: "dado" }, ui.brl(l.valor, { centavos: false })) : null),
        h("span", { class: ["crm-fr-conv", conv != null && (conv >= .5 ? "boa" : conv >= .25 ? "media" : "baixa")] },
          prox ? (conv != null ? [h("b", { class: "dado" }, L.pctInteiro(conv)), ` seguem para ${prox.nome}`] : "—") : h("span", { class: "crm-fr-fim" }, "fim do funil"))));
    });
    resTabela.appendChild(h("table", { class: "tabela crm-fr-tab" },
      h("caption", { class: "sr-only" }, "Resumo do funil por etapa"),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Etapa"), h("th", { scope: "col", class: "dir" }, "Chegaram"), h("th", { scope: "col", class: "dir" }, "Agora"), h("th", { scope: "col", class: "dir" }, "Valor"), h("th", { scope: "col", class: "dir" }, "Seguem"))),
      // data-rotulo: no celular a .tabela vira cartões e cada número leva o rótulo da coluna (o padrão do ui.tabela)
      h("tbody", null, linhas.map(l => h("tr", null, h("th", { scope: "row" }, l.nome), h("td", { class: "dir", dataset: { rotulo: "Chegaram" } }, ui.num(l.chegaram)), h("td", { class: "dir", dataset: { rotulo: "Agora" } }, ui.num(l.n)),
        h("td", { class: "dir", dataset: { rotulo: "Valor" } }, l.valor ? ui.brl(l.valor, { centavos: false }) : "—"), h("td", { class: "dir", dataset: { rotulo: "Seguem" } }, L.pctInteiro(l.conversao)))))));
    // etapas laterais (marco «faltou»): não são degrau do funil — só a contagem, sem taxa para elas nem a partir delas
    const fora = (linhas.fora || []).map(f => `«${f.nome}» (${ui.num(f.n)} agora)`);
    resNota.textContent = `Estimativa pelo quadro de agora: um cartão «chegou» a uma etapa se está nela ou numa etapa à frente (${k.v.art("negocio") === "a" ? "as perdidas" : "os perdidos"} não entram).`
      + (fora.length ? ` ${fora.join(" e ")} ${fora.length === 1 ? "fica" : "ficam"} fora da sequência: é desvio, não passo do funil.` : "");
    if (!reduzido()) resLista.classList.add("anim");
  }

  function preencherColuna(estagioId, col) {
    const c = colEls.get(estagioId);
    if (!c) return;
    const e = c.e;
    col = col || colunaDe(estagioId);
    c.n.textContent = String(col.total || 0);
    const valorSoma = e.tipo === "ganho" ? col.soma_valor : col.soma_previsto;
    c.soma.textContent = Number(valorSoma) ? ui.brl(valorSoma, { centavos: false }) : "R$ 0";
    // C10: quantos cartões da coluna vieram de anúncio (dos carregados; com «Ver mais» pendente, «2+ de anúncio»)
    const anuncio = L.contarDeAnuncio(col);
    ui.limpar(c.anun);
    c.anun.hidden = !anuncio.n;
    if (anuncio.n) c.anun.appendChild(ui.pilula(anuncio.texto, "anuncio", { variante: "origem", tamanho: "p",
      title: `${anuncio.texto}${anuncio.parcial ? " (entre os cartões carregados)" : ""} nesta etapa` }));
    ui.limpar(c.lista);
    for (const it of col.itens) c.lista.appendChild(criarCartao(it, e));
    if (!col.itens.length) c.lista.appendChild(h("div", { class: "kb-vazia", role: "listitem" }, ui.vazio({ tipo: "sem_resultado", titulo: podeMover
      ? (matchMedia("(pointer: coarse)").matches ? "Segure um cartão e arraste até aqui" : "Arraste um cartão para cá")
      : "Nada nesta etapa" })));
    ui.limpar(c.extra);
    const faltam = (col.total || 0) - col.itens.length;
    if (c.itemMais && obsMais) obsMais.unobserve(c.itemMais);
    c.itemMais = null;
    if (faltam > 0) {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p kb-mais" }, `Ver mais (${ui.num(faltam)})`);
      b.addEventListener("click", () => verMais(estagioId, b));
      const noLimite = col.itens.length >= LIMITE_NA_TELA;
      c.itemMais = h("div", { class: "kb-mais-item", role: "listitem", dataset: { estagio: estagioId } }, b,
        // plano 1000 (CR-028): passou de 300 cartões na coluna, a rolagem para de trazer sozinha — a busca acha mais rápido
        noLimite ? h("small", { class: "kb-mais-aviso" }, `Mostrando ${ui.num(col.itens.length)} de ${ui.num(col.total)}. Use a busca ou os filtros para achar o resto.`) : null);
      c.lista.appendChild(c.itemMais);
      if (!noLimite) observarMais(c.itemMais);
    }
    marcarRecolhida(c, col);
    c.json = jsonColuna(e, col);       // o que esta coluna desenhou: a recarga silenciosa só refaz a coluna se a resposta for diferente (CR-023)
    if (e.tipo !== "aberto") {
      c.extra.appendChild(h("div", { class: "kb-antigos" },
        S.fechadosDias === 0 ? "Mostrando todos os fechados." : `Fechados nos últimos ${S.fechadosDias} dias (mude em Filtros).`,
        // plano 1000 (CR-005): a escolha fica gravada (ao voltar ao CRM continua «todos os fechados») e o seletor de visões a reconhece
        h("button", { type: "button", class: "link", on: { click: () => { definirFechados(S.fechadosDias === 0 ? 30 : 0); gravarLocal(); carregar({ silencioso: true }); } } },
          S.fechadosDias === 0 ? "Só os recentes" : "Ver mais antigos")));
    }
  }

  /** CR-036: a coluna vazia recolhida (faixa estreita com o nome na vertical); o arrasto continua achando a coluna (.kb-col). */
  function marcarRecolhida(c, col) {
    if (!c || !c.sec) return;
    c.sec.classList.toggle("kb-col-recolhida", !!S.recolher && !(Number(col && col.total) > 0));
  }

  function desenharTotais() {
    if (S.sel.size) pintarSel();
    const t = L.previsao(S.dados.colunas, S.funil.estagios);
    pintarNumero(totAbertos, t.abertos, v => ui.num(Math.round(v)));
    pintarNumero(totSoma, t.soma_aberto, v => ui.brl(v, { centavos: false }));
    pintarNumero(totPrev, t.previsao_ponderada, v => ui.brl(v, { centavos: false }));
    const gq = L.ganhosDoQuadro(S.dados.colunas, S.funil.estagios);
    pintarNumero(totGanho, gq.valor, v => ui.brl(v, { centavos: false }));
    rotGanho.textContent = `${k.v.ganhar} · ${S.fechadosDias === 0 ? "todos" : `${S.fechadosDias} dias`}`;
    legGanho.textContent = `${ui.num(gq.n)} ${gq.n === 1 ? k.v.min("negocio") : k.v.min("negocios")} · valor final`;
    const filtrado = contarFiltros() > 0 || !!S.filtro.busca;
    totais.classList.toggle("crm-totais-filtrado", filtrado);
    legTot.forEach((s, i) => { s.textContent = filtrado ? (i === 0 ? "com os filtros" : `${LEG_TOT[i]} · com os filtros`) : LEG_TOT[i]; });
    totais.setAttribute("aria-label", filtrado ? "Totais do funil com os filtros ativos" : "Totais do funil");
    resumoTxt.textContent = L.resumoDoFunil({ abertos: t.abertos, soma: ui.brl(t.soma_aberto, { centavos: false }), previsao: ui.brl(t.previsao_ponderada, { centavos: false }) }, k.v.art("negocio"))
      + (filtrado ? " · com filtros" : "");
    contarFita();
    ui.limpar(distBarra); ui.limpar(distLeg);
    const totalGeral = S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const partes = [];
    const legenda = e => {
      const col = colunaDe(e.id), n = col ? Number(col.total) || 0 : 0;
      // a legenda leva à coluna (plano 50): mesmo atalho da fita de etapas do celular
      return h("button", { type: "button", class: ["crm-dist-leg-b", !n && "crm-dist-leg-vazia"], style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, title: `Ir para a coluna ${e.nome}`,
        on: { click: () => irParaColuna(e.id) } }, h("i", { "aria-hidden": "true" }), `${e.nome} `, h("b", { class: "dado" }, ui.num(n)));
    };
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id);
      const n = col ? Number(col.total) || 0 : 0;
      partes.push(`${e.nome}: ${n}`);
      if (n > 0) distBarra.appendChild(h("i", { style: { "flex-grow": String(n), ...(k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : {}) }, title: `${e.nome}: ${n}` }));
    }
    // plano 1000 (CR-019): a legenda mostra só as etapas com cartões; as vazias viram «+3 vazias» (que abre a lista esmaecida)
    const dist = L.partesDistribuicao(S.dados.colunas, S.funil.estagios);
    for (const x of (S.legVazias || !dist.cheias.length ? S.funil.estagios.map(e => ({ e })) : dist.cheias)) distLeg.appendChild(legenda(x.e));
    if (dist.vazias.length && dist.cheias.length) {
      distLeg.appendChild(h("button", { type: "button", class: "crm-dist-leg-b crm-dist-mais", "aria-expanded": String(!!S.legVazias), on: { click: () => { S.legVazias = !S.legVazias; desenharTotais(); const b = distLeg.querySelector(".crm-dist-mais"); if (b) b.focus(); } } },
        S.legVazias ? "Esconder vazias" : `+${dist.vazias.length} ${dist.vazias.length === 1 ? "vazia" : "vazias"}`));
    }
    if (!totalGeral) distBarra.appendChild(h("i", { style: { "flex-grow": "1" } }));
    distBarra.setAttribute("aria-label", `Distribuição por etapa — ${partes.join(", ")}`);
    desenharParticipacao();
    desenharResumoFunil();
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
    // plano 1000 (CR-038): etiqueta ou responsável que a base em memória (5 min) ainda não conhece — criados agora por outra pessoa: relê a base
    if ((c.dono_id && !dono) || etqs.length < (c.etiquetas || []).length) pedirBaseNova();
    const pont = L.pontuacao(c);
    const origemTxt = L.descricaoOrigem(c);
    const tarefa = c.tarefa && typeof c.tarefa === "object" ? c.tarefa : null;
    const tarefaTxt = tarefa ? (tarefa.atrasada ? "Tarefa atrasada" : tarefa.vence_em ? `Tarefa ${ui.relativo(tarefa.vence_em)}` : "Tarefa") : "";
    const consultaTxt = c.consulta_em ? `${ui.dataCurtaBR ? ui.dataCurtaBR(c.consulta_em) : ui.dataBR(c.consulta_em)} ${ui.horaBR(c.consulta_em)}` : "";
    // plano 50 (item 22): barra de tempo na etapa pelo prazo da etapa (sla_horas da base) ou 3/7 dias; avatar do contato; selo da origem sem anúncio
    const faixa = e.tipo === "aberto" ? L.faixaTempoEtapa(c.estagio_em, e.sla_horas) : null;
    const nomeAvatar = (c.contato && (c.contato.nome || c.contato.telefone)) || c.nome || c.telefone || titulo;
    const idAvatar = c.contato && c.contato.id != null ? c.contato.id : nomeAvatar;
    const idContato = c.contato && c.contato.id != null ? c.contato.id : (c.contato_id ?? null);
    // plano 100 · C4: a origem é a pílula padrão (ui.pilula variante «origem», pequena): anúncio com a plataforma (símbolo i-meta/i-google, ou o
    // megafone se o sprite ainda não tem), site, orgânico, WhatsApp, indicação, importação… Cadastro manual não ganha pílula.
    const orig = L.origemPilula(c, { manual: false });
    const pilOrigem = orig ? ui.pilula(null, orig.chave, { variante: "origem", plataforma: orig.plataforma, tamanho: "p", title: origemTxt || null,
      class: orig.chave === "anuncio" ? "kc-origem" : "kc-origem kc-origem-outra",
      icone: orig.plataforma ? simbolo(c.plataforma === "google" ? "google" : "meta", "anuncio") : null }) : null;
    // plano 1000 (CR-027): a consulta já passou e ninguém marcou Compareceu/Faltou — um ponto âmbar no rodapé leva direto à gaveta (bloco da presença)
    const semPresenca = e.tipo === "aberto" && !!c.consulta_em && L.consultaPassou(c) && !L.presencaDe(c);
    // plano 1000 (CR-217): na etapa «Agendou» sem data, a agenda e o lembrete não sabem de nada — o cartão diz isso
    const semData = e.tipo === "aberto" && e.marco === "agendada" && !c.consulta_em;
    // plano 1000 (CR-021): o leitor de tela ouve o essencial a cada seta (título, valor, tempo na etapa); o resto fica num texto ligado por
    // aria-describedby, lido sob demanda
    const tituloCurto = titulo.length > 48 ? `${titulo.slice(0, 47)}…` : titulo;
    const rotulo = `${tituloCurto}${valor != null ? `, ${ui.brl(valor, { centavos: false })}` : ""}${faixa ? `, ${faixa.texto.toLowerCase()}` : ""}`;
    const detalhes = [sub, consultaTxt ? `consulta ${consultaTxt}` : "", semPresenca ? "presença da consulta não marcada" : "", semData ? "agendado sem data" : "",
      tarefaTxt.toLowerCase(), origemTxt ? `origem ${origemTxt}` : "", etqs.length ? `etiquetas ${etqs.map(x => x.nome).join(", ")}` : "",
      pont ? `pontuação ${pont.score} de 100` : "", dono ? `responsável ${dono.nome}` : "", c.nao_lidas ? `${c.nao_lidas} mensagens não lidas` : ""].filter(Boolean).join(", ");
    const idDet = `kc-d-${cli}-${c.id}`;
    const art = h("article", { class: ["kc", S.sel.has(c.id) && "kc-sel", S.pend.has(c.id) && "confirmando salvando", faixa && `kc-prazo-${faixa.nivel}`], role: "listitem", tabindex: "0", dataset: { id: c.id }, "aria-roledescription": "cartão",
      "aria-label": rotulo, "aria-describedby": detalhes ? `${idDet} ${instr.id}` : instr.id, "aria-busy": S.pend.has(c.id) ? "true" : null, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null },
      detalhes ? h("span", { class: "sr-only", id: idDet }, detalhes) : null,
      h("div", { class: "kc-l1" }, ui.avatar(nomeAvatar, idAvatar), h("span", { class: "kc-t" }, titulo)),
      h("div", { class: "kc-l2" },
        valor != null ? h("b", { class: "kc-valor" }, ui.brl(valor, { centavos: false })) : h("span", { class: ["kc-valor", "sem"] }, "sem valor"),
        sub ? h("span", { class: "kc-s", title: sub }, sub) : null),
      faixa ? h("span", { class: ["kc-tempo", faixa.nivel], role: "img", "aria-label": `${L.textoDiasEtapa(c.estagio_em)}: ${faixa.texto.toLowerCase()}`, title: `${L.textoDiasEtapa(c.estagio_em)} · ${faixa.texto}` },
        h("i", { style: { "--w": `${Math.round(faixa.pct * 100)}%` } })) : null,
      h("div", { class: "kc-rod" },
        h("span", { class: ["kc-dias", sla && "sla", faixa && faixa.nivel !== "ok" && faixa.nivel], title: e.tipo === "aberto" ? `${L.textoDiasEtapa(c.estagio_em)}${sla ? ` — passou do prazo da etapa (${e.sla_horas} h)` : faixa ? ` · ${faixa.texto}` : ""}` : null },
          e.tipo === "aberto" ? L.textoDiasEtapa(c.estagio_em).replace(" na etapa", "") : c.fechado_em ? `${e.tipo === "ganho" ? k.v.ganhar.toLowerCase() : "fechado"} ${ui.relativo(c.fechado_em)}` : ""),
        consultaTxt ? h("span", { class: "kc-consulta", title: "Consulta/visita marcada" }, ui.icone("relogio"), consultaTxt) : null,
        semPresenca ? h("button", { type: "button", class: "kc-presenca", title: "A consulta já passou: confirme se compareceu ou faltou",
          "aria-label": `Confirmar a presença de «${tituloCurto}» na consulta`, on: { click: ev => { ev.stopPropagation(); abrir(c.id); } } },
          h("i", { class: "kc-ponto-aten", "aria-hidden": "true" }), h("span", null, "presença")) : null,
        semData ? h("span", { class: "kc-semdata", title: "Está em «Agendou» sem data: a agenda e o lembrete não sabem dessa consulta" }, ui.icone("calendario"), "sem data") : null,
        tarefa ? h("span", { class: ["kc-tarefa", tarefa.atrasada && "atrasada"], title: tarefaTxt }, tarefa.atrasada ? h("i", { class: "kc-ponto-ruim", "aria-hidden": "true" }) : ui.icone("tarefa"),
          h("span", { class: "kc-tarefa-txt" }, tarefa.atrasada ? "atrasada" : tarefa.vence_em ? ui.relativo(tarefa.vence_em) : "")) : null,
        pont ? h("span", { class: ["kc-score", pont.faixa], title: `Pontuação do lead: ${pont.score} de 100${pont.motivo ? ` — ${pont.motivo}` : ""}` }, String(pont.score)) : null,
        pilOrigem,
        // plano 1000 (CR-212): no desktop a 1ª etiqueta aparece com o NOME (pílula pequena) e as outras como pontos — a cor não é a única pista
        etqs.length ? h("span", { class: "kc-pontos", title: etqs.map(x => x.nome).join(", ") },
          h("span", { class: "kc-etq1", style: k.cor(etqs[0].cor) ? { "--cor": k.cor(etqs[0].cor) } : null }, etqs[0].nome),
          etqs.slice(0, 3).map((x, i) => h("i", { class: ["kc-ponto", i === 0 && "kc-ponto-1"], "aria-hidden": "true", style: k.cor(x.cor) ? { "--cor": k.cor(x.cor) } : null })),
          etqs.length > 3 ? h("small", null, `+${etqs.length - 3}`) : null) : null,
        h("span", { class: "kc-fim" },
          // plano 1000 (CR-213): tocar no avatar filtra o quadro por esse responsável (chip «Responsável: Ana», removível)
          dono ? h("button", { type: "button", class: "kc-dono", title: `Responsável: ${dono.nome} — ver só os cartões dele(a)`, "aria-label": `Ver só os cartões de ${dono.nome}`,
            on: { click: ev => { ev.stopPropagation(); filtrarDono(dono); } } }, ui.avatar(dono.nome, dono.id)) : h("span", { class: "kc-avatar-vazio", title: "Sem responsável" }, ui.icone("usuario")),
          // alternativa ao arrastar (toque, leitor de tela): a mesma folha «Mover para…» do toque longo
          podeMover ? h("button", { type: "button", class: "bt-icone kc-mover", "aria-label": `Mover «${titulo}» para outra etapa`, title: "Mover para…",
            on: { click: ev => { ev.stopPropagation(); abrirMoverPara(c.id); } } }, ui.icone("opcoes")) : null)),
      // plano 1000 (CR-029): o selo de não lidas leva direto à conversa do contato (antes era só informativo)
      c.nao_lidas ? (idContato != null && comConversas
        ? h("button", { type: "button", class: "kc-naolidas", title: `Abrir conversa (${c.nao_lidas} não lidas)`, "aria-label": `Abrir conversa de «${tituloCurto}» (${c.nao_lidas} não lidas)`,
          on: { click: ev => { ev.stopPropagation(); ctx.navegar(`#/conversas?contato=${encodeURIComponent(idContato)}`); } } }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas))
        : h("span", { class: "kc-naolidas", title: `${c.nao_lidas} não lidas` }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas))) : null,
      // plano 1000 (CR-030): no desktop, ao passar o mouse (ou com o foco no cartão), «Conversa» e «Tarefa» sem abrir a gaveta
      podeMover ? h("span", { class: "kc-rapidas" },
        idContato != null && comConversas ? h("button", { type: "button", class: "bt-icone kc-rapida", dataset: { acao: "conversa" }, "aria-label": `Abrir conversa de «${tituloCurto}»`, title: "Abrir conversa",
          on: { click: ev => { ev.stopPropagation(); ctx.navegar(`#/conversas?contato=${encodeURIComponent(idContato)}`); } } }, ui.icone("whatsapp")) : null,
        h("button", { type: "button", class: "bt-icone kc-rapida", dataset: { acao: "tarefa" }, "aria-label": `Nova tarefa para «${tituloCurto}»`, title: "Nova tarefa",
          on: { click: ev => { ev.stopPropagation(); novaTarefa(c, idContato); } } }, ui.icone("tarefa"))) : null);
    // plano 1000 (CR-271): quando o lead entrou, na dica do cartão (sem abrir a gaveta)
    if (c.criado_em) { const dt = ui.dataCurtaBR ? ui.dataCurtaBR(c.criado_em) : ui.dataBR(c.criado_em); if (dt) art.setAttribute("title", `Entrou em ${dt}`); }
    art.addEventListener("click", ev => {
      if (S.arrasto && (S.arrasto.moveu || S.arrasto.engoleClique)) return;
      if (S.teclado) return;
      if (ev.target.closest("a, button")) return;
      // plano 1000 (CR-281): Ctrl/⌘ + clique abre o negócio numa nova aba (como um link); (CR-035) Shift + clique seleciona vários para mover
      if (ev.ctrlKey || ev.metaKey) { abrirEmNovaAba(c.id); return; }
      if (podeMover && ev.shiftKey) { alternarSel(c.id); return; }
      abrir(c.id);
    });
    // botão do meio do mouse: nova aba também
    art.addEventListener("auxclick", ev => { if (ev.button === 1 && !(ev.target && ev.target.closest && ev.target.closest("a, button"))) { ev.preventDefault(); abrirEmNovaAba(c.id); } });
    art.addEventListener("keydown", ev => teclaCartao(ev, c.id));
    // o toque longo do celular não pode abrir o menu do sistema (copiar/colar, imagem) em cima do cartão
    art.addEventListener("contextmenu", ev => { if (S.arrasto && S.arrasto.toque) ev.preventDefault(); });
    if (podeMover) art.addEventListener("pointerdown", ev => inicioPonteiro(ev, c.id, art));
    return art;
  }

  /** CR-038: no máximo 1× por minuto relê a base (k.recarregarBase) e redesenha os cartões com os nomes/cores novos. */
  let ultimaBaseNova = 0;
  function pedirBaseNova() {
    if (typeof k.recarregarBase !== "function" || Date.now() - ultimaBaseNova < 60000) return;
    ultimaBaseNova = Date.now();
    Promise.resolve().then(() => k.recarregarBase()).then(() => { if (S.vivo && S.dados && !emGesto()) desenharQuadro(); }, () => { /* fica como está; tenta de novo em 1 min */ });
  }

  /* ============================================================ gaveta e novo */
  /** Os cartões da coluna do negócio, na ordem da tela (CR-072: ‹ › e J/K na gaveta seguem esta ordem). */
  function vizinhosDe(id) {
    const col = colunaDeCard(id);
    if (!col) return { anterior: null, proximo: null };
    const i = col.itens.findIndex(x => x.id === id);
    return { anterior: i > 0 ? col.itens[i - 1].id : null, proximo: i >= 0 && i < col.itens.length - 1 ? col.itens[i + 1].id : null };
  }
  /** CR-188: o negócio aberto pelo quadro entra em «Recentes» da paleta (abrir pelo cartão não muda o endereço). */
  function lembrar(id) {
    const c = cardDe(id);
    if (c && typeof k.lembrarRecente === "function") k.lembrarRecente({ hash: `#/crm/negocio/${id}`, titulo: L.tituloCard(c), tipo: "negocio" });
  }
  function abrir(id) {
    lembrar(id);
    N.abrirNegocio(k, id, { aoMudar: c => { S.meus.add((c && c.id) ?? id); carregar({ silencioso: true }); }, vizinhos: vizinhosDe, aoNavegar: lembrar });
  }
  /** CR-281: o link do negócio numa aba nova (noopener: a aba nova não mexe nesta). */
  function abrirEmNovaAba(id) {
    try { if (typeof window !== "undefined" && typeof window.open === "function") window.open(`#/crm/negocio/${encodeURIComponent(id)}`, "_blank", "noopener"); } catch { /* bloqueado: nada */ }
  }
  /** CR-213: filtra o quadro pelo responsável do cartão (o mesmo filtro do popover; o chip mostra o nome). */
  function filtrarDono(dono) {
    if (!dono || dono.id == null) return;
    S.filtro.dono = dono.id; gravarLocal(); carregar({ silencioso: true });
    ui.anunciar(`Mostrando só os cartões de ${dono.nome}.`);
  }
  function novo(extra) {
    N.novoNegocio(k, { funil_id: S.funil.id, ...extra }, { aoCriar: () => carregar({ silencioso: true }) });
  }

  function observarMais(item) {
    if (typeof IntersectionObserver !== "function") return;
    if (!obsMais) obsMais = new IntersectionObserver(ents => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        const b = en.target.querySelector(".kb-mais");
        if (b && !b.disabled) verMais(en.target.dataset.estagio, b, { auto: true });
      }
    }, { rootMargin: "0px 0px 160px 0px" });
    obsMais.observe(item);
  }

  async function verMais(estagioId, botao, { auto = false } = {}) {
    const c = colEls.get(estagioId);
    if (!c || c.carregandoMais) return;
    const col0 = colunaDe(estagioId);
    if (!col0) return;
    // plano 1000 (CR-004): a resposta só vale para o MESMO funil e o MESMO filtro; o quadro pode ter sido recarregado no meio (a coluna é relida depois)
    const funil0 = S.funil && S.funil.id, filtro0 = JSON.stringify(filtroServidor()), vistos0 = col0.itens.length;
    const focoNoBotao = !auto && (document.activeElement === botao || document.activeElement === document.body);
    // C5: enquanto a página seguinte chega, um cartão-esqueleto no fim da coluna (o mesmo formato do cartão; some quando a coluna é refeita)
    const sk = h("div", { class: "kb-sk", role: "listitem" }, ui.esqueleto("cartao"));
    const itemMais = botao && botao.parentElement;
    if (itemMais && itemMais.parentElement === c.lista) c.lista.insertBefore(sk, itemMais);
    c.carregandoMais = true;
    try {
      const r = await ui.carregando(botao, k.api.rpcC("nx_negocios_coluna", { p_estagio: estagioId, p_filtro: JSON.parse(filtro0), p_offset: vistos0 }));
      if (!S.vivo || !S.funil || S.funil.id !== funil0 || JSON.stringify(filtroServidor()) !== filtro0) return;   // outra busca/filtro/funil: a página velha não entra
      const col = colunaDe(estagioId);
      if (!col) return;
      const ids = new Set(col.itens.map(x => x.id));
      const novos = ((r && r.itens) || []).filter(x => !ids.has(x.id));
      const antes = col.itens.length;
      col.itens = col.itens.concat(novos);
      // plano 1000 (CR-272): sem «tem_mais», o servidor não tem mais nada — o total é o que está carregado (cartões que saíram da etapa
      // depois da carga deixavam «Ver mais (10)» preso para sempre)
      if (!r.tem_mais) col.total = col.itens.length;
      else col.total = Math.max(Number(col.total) || 0, col.itens.length);
      preencherColuna(estagioId, col);
      desenharTotais();
      // plano 1000 (CR-022): o botão some quando a coluna é refeita — o foco vai para o 1º cartão novo e o leitor ouve quantos chegaram
      if (novos.length) {
        const lista = (colEls.get(estagioId) || c).lista;
        const primeiro = lista.querySelector(`.kc[data-id="${novos[0].id}"]`) || lista.querySelectorAll(".kc")[antes];
        if (focoNoBotao && primeiro) { try { primeiro.focus({ preventScroll: false }); } catch { primeiro.focus(); } }
        ui.anunciar(`${novos.length} ${novos.length === 1 ? "cartão carregado" : "cartões carregados"} em ${c.e.nome}.`);
      }
    } catch (e) { k.toastErro(e); }
    finally { c.carregandoMais = false; sk.remove(); }
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
    // plano 1000 (CR-025): sem internet o movimento não iria ao servidor — recusa ANTES das perguntas (valor, motivo, data) e devolve o cartão
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
      preencherColunaDoCartao(id);
      if (estagioId !== origemCol.estagio_id && colEls.has(estagioId)) preencherColuna(estagioId);     // o teclado já tinha levado o cartão até lá
      focarCartao(id);
      const msg = "Sem internet: o cartão não foi movido. Tente de novo quando a conexão voltar.";
      ui.toast(msg, { tipo: "erro" }); ui.anunciar(msg);
      return;
    }
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
    const patch = L.patchMovimento(destino, extra);       // o mesmo que a gaveta do negócio aplica (C1)
    S.dados.colunas = L.moverLocal(S.dados.colunas, id, estagioId, pos, ordem, patch);
    preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId);
    desenharTotais();
    if (destCol !== origemCol) destacarColunas(origemCol.estagio_id, estagioId);
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
      // o mesmo texto da gaveta (C1): «Fechou! «Ana» · R$ 900», «… registrada como «Perdido»», «… reaberta em «Nova»»
      const texto = L.textoMovimento({ titulo, destino, valor: destino.tipo === "ganho" ? (patch.valor ?? card.valor_previsto ?? null) : null,
        ganhar: k.v.ganhar, artigo: k.v.art("negocio"), brl: v => ui.brl(v) });
      ui.anunciar(`${titulo}: ${destino.nome}. Dá para desfazer por 7 segundos.`);
      // firmar = a gravação adiada. Se a página sair ou ficar oculta antes dos 7 s, o aviso chama firmar({ saindo: true }) e o pedido vai com keepalive
      const res = await ui.acaoComDesfazer({ texto, reverter: () => desfazerMovimento(mov), firmar: o => efetivar(mov, { saindo: !!(o && o.saindo) }) });
      if (res.estado === "desfeita") return;
      const ok = await efetivar(mov);       // «mantida» (o aviso acabou) ou a tela saiu: agora vai ao servidor
      if (ok && destino.tipo === "ganho" && S.vivo) ofertarPosVenda(cardDe(id) || card);
      return;
    }
    // mesma natureza (aberto → aberto): grava já; o «Desfazer» move de volta
    const ok = await efetivar(mov);
    if (!ok || origemCol === destCol) return;       // só reordenar dentro da etapa não pede «Desfazer»
    ui.acaoComDesfazer({ texto: `«${titulo}» movido para ${destino.nome}`, reverter: () => desfazerMovimento(mov) });
  }

  /**
   * plano 1000 (CR-297): depois do ganho confirmado, o próximo passo — «Iniciar pós-venda» (o mesmo da gaveta) quando há funil fora dos anúncios
   * e o cartão tem contato. Sem isso o fluxo terminava no «Fechou» e o retorno ficava esquecido.
   */
  function ofertarPosVenda(card) {
    const contato = card && card.contato && card.contato.id != null ? card.contato : (card && card.contato_id != null ? { id: card.contato_id, nome: card.nome || null } : null);
    if (!contato || !podeMover || typeof N.iniciarPosVenda !== "function") return;
    if (!k.base.funis.some(f => !f.conta_no_ads && f.ativo !== false)) return;
    ui.toast(`${L.tituloCard(card)}: ${k.v.ganhar.toLowerCase()}. Próximo passo?`, { tipo: "ok", ms: 9000,
      acao: { rotulo: "Iniciar pós-venda", fn: () => N.iniciarPosVenda(k, { ...card, funil_id: S.funil && S.funil.id, status: "ganho" }, contato, { aoCriar: () => carregar({ silencioso: true }) }) } });
  }

  /** plano 1000 (CR-203): depois de soltar em outra etapa, a contagem das duas colunas acende por um instante (G.destacar) — dá para ver o que mudou. */
  function destacarColunas(...ids) {
    const G = k.G;
    if (!G || typeof G.destacar !== "function") return;
    for (const id of ids) { const c = colEls.get(id); if (c && c.n) { try { G.destacar(c.n); } catch { /* sem destaque */ } } }
  }
  /** plano 1000 (CR-268): o total novo das duas colunas depois de mover — dito ao leitor de tela junto com a confirmação. */
  function totaisDoMovimento(mov) {
    const t = id => { const col = colunaDe(id), e = k.estagio(id); const n = col ? Number(col.total) || 0 : 0; return `«${e ? e.nome : "etapa"}» com ${n} ${n === 1 ? "cartão" : "cartões"}`; };
    return mov.estagioId === mov.origemEstagioId ? "" : ` Agora ${t(mov.estagioId)} e ${t(mov.origemEstagioId)}.`;
  }

  /** O cartão solto «assenta» no lugar (M10: .assenta = escala 1,015 → 1; sem movimento reduzido o CSS zera a animação). */
  function assentar(id) {
    const el = quadro.querySelector(`.kc[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove("assenta", "kc-solto");
    void el.offsetWidth;
    el.classList.add("assenta", "kc-solto");     // kc-solto (plano 50): entrada animada do cartão solto — sobe 6 px e acende a borda da cor da etapa
    el.addEventListener("animationend", () => el.classList.remove("assenta", "kc-solto"), { once: true });
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
        if (el) { el.classList.add("chegou"); el.classList.add("assenta"); el.classList.add("kc-solto"); }   // a coluna foi redesenhada: a entrada animada continua no cartão novo
        marcarConfirmando(mov.id, false);
        ui.anunciar(`${L.tituloCard(mov.card)} movido para ${mov.destino.nome}.${totaisDoMovimento(mov)}`);
        return true;
      };
      try {
        return chegou(await N.moverNegocio(k, mov.card, mov.destino, { ordem: mov.ordem, extra: mov.extra, keepalive: saindo }));
      } catch (e) {
        if (L.erroAmbiguo(e)) {
          const real = await consultarEtapa(mov.id);
          if (real === mov.destino.id) return chegou({});     // o servidor já tinha aplicado: o cartão fica onde está
          if (real === null) {                                 // sem resposta: mostra o que se sabe e confere de novo (internet voltando, ou em 15 s e 60 s)
            ui.toast("Não deu para confirmar a mudança de etapa. Vamos conferir com o servidor de novo em instantes.", { tipo: "info", ms: 6000 });
            agendarConferencia(mov);
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

  /**
   * plano 1000 (CR-003): resposta ambígua E conferência sem resposta. Antes só o evento «orbita:online» destravava — com o servidor lento (504) a
   * internet não «volta» e o cartão ficava «confirmando» para sempre (o pulso nem recarregava). Agora reconfere em 15 s e 60 s (ou na volta da
   * conexão); com a etapa real em mãos — ou depois da última tentativa — solta o pendente e recarrega o quadro do servidor.
   */
  function agendarConferencia(mov) {
    let feito = false, timer = 0, tentativa = 0;
    const encerrar = () => {
      feito = true; clearTimeout(timer);
      if (typeof removeEventListener === "function") removeEventListener("orbita:online", aoOnline);
      S.conferencias.delete(encerrar);
    };
    const resolver = () => { encerrar(); soltarPendente(mov); marcarConfirmando(mov.id, false); if (S.vivo) carregar({ silencioso: true }); };
    async function conferir(ultima) {
      if (feito) return;
      if (!S.vivo) { encerrar(); return; }
      const real = await consultarEtapa(mov.id);
      if (feito) return;
      if (real === null && !ultima && tentativa < CONFERIR_MS.length) { proxima(); return; }
      resolver();
    }
    function proxima() { const ms = CONFERIR_MS[tentativa++]; timer = setTimeout(() => conferir(tentativa >= CONFERIR_MS.length), ms); }
    function aoOnline() { clearTimeout(timer); conferir(true); }
    if (typeof addEventListener === "function") addEventListener("orbita:online", aoOnline, { once: true });
    S.conferencias.add(encerrar);
    proxima();
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
  function desfazerMovimento(mov) {
    // plano 1000 (CR-026): clique duplo no «Desfazer» ou Ctrl+Z repetido não dispara duas reversões — a 2ª recebe a mesma promessa
    if (mov.revertendo) return mov.revertendo;
    mov.revertendo = reverterMovimento(mov).catch(e => { mov.revertendo = null; throw e; });   // falhou: dá para tentar de novo
    return mov.revertendo;
  }
  async function reverterMovimento(mov) {
    if (!mov.efetivado) { soltarPendente(mov); reverterNaTela(mov); ui.anunciar("Movimento desfeito."); return; }
    const volta = k.estagio(mov.origemEstagioId);
    if (!volta) throw new Error("estagio_invalido");
    const atual = cardDe(mov.id) || mov.card;
    // voltar a uma etapa de ganho exige o valor; a de perda leva o motivo de volta (L.extraDeVolta, o mesmo da gaveta)
    await N.moverNegocio(k, atual, volta, { ordem: mov.origem.ordem, extra: L.extraDeVolta({ estagio: volta, valor: mov.card.valor, valor_previsto: mov.card.valor_previsto,
      motivo_perda_id: mov.card.motivo_perda_id, motivo_perda_txt: mov.card.motivo_perda_txt }) });
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
      // plano 1000 (CR-202): o leitor ouve onde soltou na hora — a gravação (e o anúncio dela) pode demorar
      const etapaSolta = k.estagio(destino);
      ui.anunciar(`Soltou em «${etapaSolta ? etapaSolta.nome : "etapa"}», posição ${indice + 1}. Gravando…`);
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
      // plano 1000 (CR-002): a referência do insertBefore é o FILHO da lista (.kb-mais-item), não o botão (neto) — com o botão o navegador
      // lançava NotFoundError e o cartão ficava preso no modo «pego»
      try { alvo.lista.insertBefore(art, cards[pos] || alvo.lista.querySelector(".kb-mais-item") || null); }
      catch { cancelarTeclado(false); ui.toast("Não deu para levar o cartão até essa etapa pelo teclado. Use a tecla M (Mover para…).", { tipo: "erro" }); return; }
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
    // plano 1000 (CR-044): trocar de funil daqui mesmo (antes só pela gaveta → ⋮), com a mesma trava do funil de anúncios
    if (funis().length > 1 && typeof N.moverDeFunil === "function") {
      corpo.appendChild(h("button", { type: "button", role: "listitem", class: "kb-mover-op kb-mover-funil", on: { click: () => modalApi && modalApi.fechar(OUTRO_FUNIL) } },
        ui.icone("funil"), h("span", { class: "kb-mover-nome" }, "Outro funil…"), h("small", null, "escolher funil e etapa")));
    }
    const escolhida = await ui.modal({ titulo: "Mover para…", descricao: L.tituloCard(card), corpo, largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
    if (escolhida === OUTRO_FUNIL && S.vivo) {
      const status = (k.estagio(atualId) || {}).tipo || card.status || "aberto";
      await N.moverDeFunil(k, { ...card, funil_id: S.funil.id, status }, { aoMover: () => { S.meus.add(id); carregar({ silencioso: true }); } });
      return;
    }
    if (escolhida && S.vivo) soltar(id, escolhida, 0);
  }
  /**
   * plano 1000 (CR-035): mover os selecionados de uma vez — a etapa uma vez, o motivo da perda uma vez, as gravações em fila (com o progresso para o
   * leitor de tela) e UM aviso com «Desfazer». Ganho fica de fora (cada um tem o seu valor final); etapa com data vai sem data (cada um tem a sua).
   */
  async function moverSelecionados() {
    const cards = [...S.sel].map(cardDe).filter(c => c && !S.pend.has(c.id));
    if (!cards.length || !podeMover) { limparSel(); return; }
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) { ui.toast("Sem internet: nada foi movido. Tente de novo quando a conexão voltar.", { tipo: "erro" }); return; }
    let modalApi = null;
    const corpo = h("div", { class: "kb-mover", role: "list" }, S.funil.estagios.map(e =>
      h("button", { type: "button", role: "listitem", class: "kb-mover-op", style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, on: { click: () => modalApi && modalApi.fechar(e.id) } },
        h("i", { "aria-hidden": "true" }), h("span", { class: "kb-mover-nome" }, e.nome), h("small", null, e.tipo === "ganho" ? "um por vez (valor de cada)" : ""))));
    const destinoId = await ui.modal({ titulo: `Mover ${cards.length} ${cards.length === 1 ? "cartão" : "cartões"} para…`, corpo, largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
    const destino = destinoId && k.estagio(destinoId);
    if (!destino || !S.vivo) return;
    if (destino.tipo === "ganho") { ui.toast(`Para marcar como «${destino.nome}», mova um por vez: cada um tem o seu valor final.`, { tipo: "info" }); return; }
    const mover = cards.filter(c => (colunaDeCard(c.id) || {}).estagio_id !== destino.id);
    if (!mover.length) { limparSel(); return; }
    let extra = {};
    if (L.pedidoAoMover(destino, k.estagio(colunaDeCard(mover[0].id).estagio_id)) === "perdido") {
      try { extra = await N.prepararMovimento(k, mover[0], destino); } catch (e) { k.toastErro(e); return; }
      if (extra === null) { ui.anunciar("Movimento cancelado."); return; }
    }
    const feitos = [], falhas = [];
    for (let i = 0; i < mover.length; i++) {
      const c = mover[i], origem = k.estagio(colunaDeCard(c.id).estagio_id);
      try { await N.moverNegocio(k, c, destino, { extra }); feitos.push({ c, origem }); S.meus.add(c.id); }
      catch (e) { falhas.push(e); }
      ui.anunciar(`Movendo ${i + 1} de ${mover.length}…`);
    }
    limparSel();
    if (S.vivo) await carregar({ silencioso: true });
    if (falhas.length) ui.toast(`${falhas.length} não ${falhas.length === 1 ? "foi movido" : "foram movidos"}: ${k.erro(falhas[0])}`, { tipo: "erro" });
    if (!feitos.length) return;
    ui.acaoComDesfazer({ texto: `${feitos.length} ${feitos.length === 1 ? "cartão movido" : "cartões movidos"} para «${destino.nome}».${destino.tipo !== "aberto" ? " Mensagens automáticas já enviadas não voltam." : ""}`,
      reverter: async () => {
        for (const f of feitos) {
          if (!f.origem) continue;
          await N.moverNegocio(k, { id: f.c.id }, f.origem, { ordem: f.c.ordem ?? null, extra: L.extraDeVolta({ estagio: f.origem, valor: f.c.valor, valor_previsto: f.c.valor_previsto,
            motivo_perda_id: f.c.motivo_perda_id, motivo_perda_txt: f.c.motivo_perda_txt }) });
        }
        if (S.vivo) await carregar({ silencioso: true });
      } });
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
    fecharDicaSegurar();           // CR-270: aprendeu o gesto — a dica não volta
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
    // plano 1000 (CR-001): o «Ver mais» é um botão DENTRO de .kb-mais-item — a referência tem de ser o filho direto da lista (com o botão,
    // cada pointermove lançava NotFoundError, o marcador sumia e o soltar usava o alvo anterior)
    const ref = antesDe || info.lista.querySelector(".kb-mais-item") || null;
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

  const aoTeclaGlobal = ev => {
    if (ev.key === "Escape" && S.arrasto && S.arrasto.moveu) { ev.preventDefault(); cancelarPonteiro(); ui.anunciar("Movimento cancelado."); return; }
    if (ev.key === "Escape" && S.sel.size && !(ev.target && ev.target.closest && ev.target.closest("[role=dialog],dialog"))) { limparSel(); ui.anunciar("Seleção limpa."); return; }
    // plano 1000 (CR-037): Alt+1…5 troca de funil (a ordem do seletor). Pelo código da tecla: no Mac Alt+1 escreve «¡»
    const dig = /^Digit([1-9])$/.exec(ev.code || "") || (/^[1-9]$/.test(ev.key || "") ? [null, ev.key] : null);
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && dig && !S.arrasto && !S.teclado) {
      const lista = funis(), alvo = lista[Number(dig[1]) - 1];
      if (alvo && Number(dig[1]) <= 5) {
        ev.preventDefault();
        if (!S.funil || alvo.id !== S.funil.id) { trocarFunil(alvo.id); desenharSelFunil(); }
        ui.anunciar(`Funil «${alvo.nome}».`);
      }
      return;
    }
    // plano 1000 (CR-267): N (fora de campos e diálogos) abre um cartão novo — o mesmo «+» do cabeçalho; aparece na folha «?» pelo comando registrado
    if ((ev.key === "n" || ev.key === "N") && !ev.altKey && !ev.ctrlKey && !ev.metaKey && podeMover && !S.arrasto && !S.teclado) {
      const a = ev.target;
      const editando = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || (a.closest && a.closest("[role=dialog],dialog")));
      if (!editando && !(typeof document !== "undefined" && document.querySelector && document.querySelector("dialog[open]"))) { ev.preventDefault(); novo({}); return; }
    }
    // «/» foca a busca (como em Pacientes), fora de campos e diálogos
    if (ev.key === "/" && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      const a = ev.target;
      const editando = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || (a.closest && a.closest("[role=dialog],dialog")));
      if (!editando) { ev.preventDefault(); busca.focus(); }
    }
  };
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
    if (f.campo) n++;
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
    if (f.campo) add(L.textoFiltroCampo(f.campo, k.base.campos), () => delete f.campo);
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
        const b = h("button", { type: "button", "aria-pressed": String(atual !== null && (atual || "") === v) }, t);
        b.addEventListener("click", () => { for (const x of g.children) x.setAttribute("aria-pressed", "false"); b.setAttribute("aria-pressed", "true"); aoMudar(v); });
        g.appendChild(b);
      }
      return g;
    };
    // responsável
    // plano 1000 (CR-011): pessoa escolhida no seletor desmarca o segmentado (nada de «Todos» marcado com «Ana» escolhida); o segmentado limpa o seletor
    let segDono = null;
    const selPessoa = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: f.dono && !["eu", "sem"].includes(f.dono) ? f.dono : null, vazio: "Qualquer pessoa", rotulo: "Responsável",
      aoMudar: id => { f.dono = id || undefined; marcarSegDono(id ? null : ""); } });
    segDono = seg([["", "Todos"], ["eu", "Meus"], ["sem", "Sem responsável"]], ["eu", "sem"].includes(f.dono) ? f.dono : (f.dono ? null : ""), v => { f.dono = v || undefined; selPessoa.value = ""; }, "Responsável");
    function marcarSegDono(v) { if (segDono) for (const b of segDono.children) b.setAttribute("aria-pressed", String(v !== null && b.textContent === { "": "Todos", eu: "Meus", sem: "Sem responsável" }[v])); }
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
    // plano 1000 (CR-010): erro de valor aparece junto do campo (e o popover continua aberto)
    const erroValor = h("small", { class: "ed-erro crm-filtros-erro", role: "alert", id: `crm-fv-${cli}`, hidden: true });
    const parado = h("select", { "aria-label": "Parados há" }, [["", "Qualquer tempo"], ["3", "3 dias ou mais"], ["7", "7 dias ou mais"], ["15", "15 dias ou mais"], ["30", "30 dias ou mais"]]
      .map(([v, t]) => h("option", { value: v, selected: String(f.parado_dias || "") === v }, t)));
    const de = h("input", { type: "date", "aria-label": "Criados de", value: f.criado_de || "" });
    const ate = h("input", { type: "date", "aria-label": "Criados até", value: f.criado_ate || "" });
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limpar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const grupoCampo = Vis.grupoFiltroCampo ? Vis.grupoFiltroCampo(k, { entidade: "negocio", funilId: S.funil && S.funil.id, atual: f.campo }) : null;
    // plano 1000 (CR-012): o que foi marcado e não aplicado aparece no rodapé — e fechar o popover (fora, Esc) aplica sozinho
    const pendTxt = h("small", { class: "crm-filtros-pend", "aria-live": "polite", hidden: true });
    // plano 1000 (CR-008): no celular as visões salvas moram aqui dentro (a linha delas empurrava o quadro para baixo da 1ª tela)
    const casaVisoes = telaPequena() && controlesVisoes ? controlesVisoes.el.parentElement : null;
    const grupoVisoes = casaVisoes ? h("fieldset", { class: "crm-filtros-grupo crm-filtros-visoes" }, h("legend", { class: "rotulo" }, "Filtros salvos"), controlesVisoes.el) : null;
    // plano 1000 (CR-277): no celular os filtros abrem como folha inferior — título fixo em cima e «Limpar · Aplicar» fixos embaixo (o CSS faz a folha)
    const cabFolha = telaPequena() ? h("div", { class: "crm-filtros-cab" }, h("b", null, "Filtros"),
      h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar os filtros", on: { click: () => pop && pop.fechar() } }, ui.icone("fechar"))) : null;
    let pop = null;
    // plano 1000 (CR-215): quantos dias de fechados aparecem — antes só no rodapé de cada coluna fechada, fácil de perder
    let fechSel = S.fechadosDias;
    const segFech = seg([["30", "30 dias"], ["90", "90 dias"], ["0", "Todos"]], String(S.fechadosDias), v => { fechSel = Number(v); }, "Fechados no quadro");
    // plano 1000 (CR-210): cada grupo é um fieldset com legend — o leitor de tela diz «Origem, grupo» ao entrar nas caixas
    const corpo = h("div", { class: ["crm-filtros", cabFolha && "crm-filtros-folha"] },
      cabFolha,
      grupoVisoes,
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Responsável"), segDono, selPessoa),
      k.base.etiquetas.length ? h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Etiquetas"), segEt, opsEt) : null,
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Origem"), opsOrig),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Valor (R$)"), h("div", { class: "crm-filtros-linha" }, vMin, vMax), erroValor),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Parados na etapa"), parado),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Criados entre"), h("div", { class: "crm-filtros-linha" }, de, ate)),
      grupoCampo ? grupoCampo.el : null,
      h("fieldset", { class: "crm-filtros-grupo crm-filtros-fech" }, h("legend", { class: "rotulo" }, "Fechados no quadro"), segFech),
      h("div", { class: "crm-filtros-rod" }, pendTxt, limpar, aplicar));
    let resolvido = false;      // Aplicar/Limpar já trataram: o fechar que vem depois não aplica de novo
    /** O filtro novo do formulário → {nf} | {erro, foco} (sem tocar no estado). */
    function lerNovo() {
      const nf = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}) };
      if (f.dono) nf.dono = f.dono;
      if (et.ids && et.ids.length) nf.etiquetas = { op: et.op || "alguma", ids: et.ids };
      if (orig.size) nf.origem = [...orig];
      const mn = vMin.value === "" ? null : Number(vMin.value), mx = vMax.value === "" ? null : Number(vMax.value);
      if (mn != null && !(mn >= 0)) return { erro: "Valor mínimo inválido: use 0 ou mais.", foco: vMin, valor: true };
      if (mx != null && !(mx >= 0)) return { erro: "Valor máximo inválido: use 0 ou mais.", foco: vMax, valor: true };
      if (mn != null && mx != null && mn > mx) return { erro: "O valor mínimo precisa ser menor ou igual ao máximo.", foco: vMin, valor: true };
      if (de.value && ate.value && de.value > ate.value) return { erro: "A data inicial precisa ser anterior ou igual à final.", foco: de };
      if (mn != null && mn >= 0) nf.valor_min = mn;
      if (mx != null && mx >= 0) nf.valor_max = mx;
      if (parado.value) nf.parado_dias = Number(parado.value);
      if (de.value) nf.criado_de = de.value;
      if (ate.value) nf.criado_ate = ate.value;
      if (grupoCampo) { const c = grupoCampo.ler(); if (c.erro) return { erro: c.erro, foco: null }; if (c.campo) nf.campo = c.campo; }
      else if (S.filtro.campo) nf.campo = S.filtro.campo;
      return { nf };
    }
    const mudancas = () => { const r = lerNovo(); return r.nf ? canonico(r.nf) !== canonico(S.filtro) || fechSel !== S.fechadosDias : true; };
    /** CR-215: a escolha dos fechados vale junto com os filtros (Aplicar ou fechar o popover). → mudou? */
    const aplicarFech = () => { if (fechSel === S.fechadosDias) return false; definirFechados(fechSel); return true; };
    const contarPend = () => { const m = mudancas(); pendTxt.hidden = !m; pendTxt.textContent = m ? "Mudanças ainda não aplicadas" : ""; };
    corpo.addEventListener("change", contarPend);
    corpo.addEventListener("click", ev => { if (ev.target && ev.target.closest && ev.target.closest(".crm-seg")) contarPend(); });
    const fecharResolvido = () => { resolvido = true; if (pop) pop.fechar(); };
    S.fecharFiltros = fecharResolvido;
    pop = ui.flutuante(btFiltros, corpo, { classe: ["flut-crm", cabFolha && "flut-crm-folha"].filter(Boolean).join(" "), largura: "auto", aoFechar: () => {
      if (S.fecharFiltros === fecharResolvido) S.fecharFiltros = null;
      if (grupoVisoes && casaVisoes) casaVisoes.appendChild(controlesVisoes.el);      // as visões voltam para a linha de ferramentas (escondida no celular)
      if (resolvido || !S.vivo) return;
      resolvido = true;
      const r = lerNovo();
      if (!r.nf) { ui.toast(`Os filtros não foram aplicados: ${r.erro}`, { tipo: "erro" }); return; }
      const mudouFech = aplicarFech();
      if (canonico(r.nf) === canonico(S.filtro) && !mudouFech) return;
      S.filtro = r.nf; gravarLocal(); carregar({ silencioso: true });
      ui.anunciar("Filtros aplicados.");
    } });
    limpar.addEventListener("click", () => { resolvido = true; const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; gravarLocal(); pop.fechar(); carregar({ silencioso: true }); });
    aplicar.addEventListener("click", () => {
      const r = lerNovo();
      for (const x of [vMin, vMax]) x.removeAttribute("aria-invalid");
      erroValor.hidden = true; erroValor.textContent = "";
      if (!r.nf) {
        if (r.valor) { erroValor.textContent = r.erro; erroValor.hidden = false; r.foco.setAttribute("aria-invalid", "true"); r.foco.setAttribute("aria-describedby", erroValor.id); }
        else ui.toast(r.erro, { tipo: "erro" });
        if (r.foco) r.foco.focus();
        return;
      }
      resolvido = true;
      aplicarFech();
      S.filtro = r.nf; gravarLocal(); pop.fechar(); carregar({ silencioso: true });
    });
  }

  /* ============================================================ tempo real */
  const cancelarPulso = ctx.pulso && ctx.pulso.assinar ? ctx.pulso.assinar(() => {
    // plano 1000 (CR-003): só os movimentos ainda NÃO enviados (os 7 s do «Desfazer») seguram o pulso; um já enviado e sem confirmação não pode
    // travar a atualização do quadro (a recarga reaplica o cartão no destino enquanto a conferência roda)
    if (!S.vivo || S.arrasto || S.teclado || document.hidden || [...S.pend.values()].some(m => !m.efetivado)) return;
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
    aoMudarNegocio: c => { if (c && c.id != null) S.meus.add(c.id); carregar({ silencioso: true }); },
    /** plano 1000 (CR-039): o link direto abriu um negócio de OUTRO funil — o quadro por baixo passa a mostrar esse funil (sem mexer no endereço da gaveta). */
    mostrarFunil(id) {
      const f = k.funil(id);
      if (!S.vivo || !f || f.ativo === false || (S.funil && S.funil.id === f.id)) return false;
      S.funil = f; gravarLocal(); desenharSelFunil(); carregar();
      return true;
    },
    funilAtual: () => (S.funil ? S.funil.id : null),
    desmontar() {
      S.vivo = false; S.seq++;
      clearInterval(tIdade);
      for (const f of [...S.conferencias]) f();
      if (obsMais) obsMais.disconnect();
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
