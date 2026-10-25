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
const SELECIONAR = "__selecionar__";     // plano 1000b · RB-205: escolha «Selecionar vários» da folha «Mover para…»
const TAREFA = "__tarefa__", CONVERSA = "__conversa__";   // plano 1000b · RB-247: «Nova tarefa»/«Abrir conversa» na folha (toque)
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
  let paradosDaUrl = null;      // plano 1000b · RB-032: o «?parados=N» do link (não é gravado no aparelho)
  const gravarLocal = () => {
    const { busca: _b, ...semBusca } = S.filtro || {};
    // plano 1000b · RB-032: o «Parados há N dias» que veio do LINK vale só nesta visita — não gruda na preferência enquanto for o do link
    if (paradosDaUrl != null && semBusca.parado_dias === paradosDaUrl) delete semBusca.parado_dias;
    try { localStorage.setItem(chaveLocal, JSON.stringify({ funil: S.funil && S.funil.id, filtro: semBusca, todosFechados: S.todosFechados, fechadosDias: S.fechadosDias })); } catch { /* ok */ }
    if (controlesVisoes) controlesVisoes.atualizar();
    atualizarAtalhos();
  };

  /** plano 1000b · RB-028: preferência do aparelho por conta; a chave antiga (só da empresa) migra uma vez. */
  const lerPorConta = (nova, antiga) => {
    try {
      let v = localStorage.getItem(nova);
      if (v === null && (v = localStorage.getItem(antiga)) !== null) { localStorage.setItem(nova, v); localStorage.removeItem(antiga); }
      return v;
    } catch { return null; }
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
  // plano 1000b · RB-033: filtro guardado com campo personalizado que foi excluído (ou mudou de tipo) não vai cru ao servidor
  if (S.filtro.campo) { const fc = L.filtroCampoLimpo(S.filtro.campo, k.base.campos); if (fc) S.filtro.campo = fc; else delete S.filtro.campo; }
  definirFechados(S.fechadosDias);
  // plano 1000 (CR-185): «Ver todos com “mar”» da paleta abre o quadro com a busca preenchida (vale só nesta visita: a busca não é gravada)
  if (rota.query && typeof rota.query.busca === "string" && rota.query.busca.trim()) S.filtro.busca = rota.query.busca.trim().slice(0, 120);
  // plano 1000 (CR-246): «revisar as paradas» (vazio de Tarefas) abre o quadro já no atalho «Parados há 7+ dias»
  // plano 1500c · RC-327: link com filtros (?f=, de «Copiar link com estes filtros») abre o quadro com os mesmos filtros
  let ignoradosDoLink = [];
  if (rota.query && typeof rota.query.f === "string") {
    const fl = L.filtroDoLink(rota.query.f);
    if (fl) {
      // plano 2000d · DR-075: o link conferido com esta empresa — responsável/etiqueta/campo que não existem aqui saem e a tela avisa (antes, quadro vazio calado)
      const r = L.filtroDoLinkNaBase ? L.filtroDoLinkNaBase(fl, { temDono: id => !!k.usuario(id), temEtiqueta: id => !!k.etiqueta(id), campos: k.base.campos }) : { filtro: fl, ignorados: [] };
      ignoradosDoLink = r.ignorados;
      S.filtro = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}), ...r.filtro };
    }
  }  // plano 1500c · RC-324: 60 e 90 dias também
  if (ignoradosDoLink.length) ui.toast(`O link tinha filtros que não existem aqui (${ignoradosDoLink.join(", ")}): foram ignorados.`, { tipo: "aten", ms: 8000 });
  if (rota.query && /^(3|7|15|30|60|90)$/.test(String(rota.query.parados || ""))) S.filtro.parado_dias = paradosDaUrl = Number(rota.query.parados);
  const podeMover = k.pode("atendente");
  const comConversas = !!(ctx.temModulo && ctx.temModulo("conversas"));
  ctx.titulo(k.v.crm);
  /** CR-030: «Tarefa» do cartão — o formulário de sempre, já ligado ao negócio (e ao contato). */
  async function novaTarefa(c, idContato) {
    try {
      const T = await k.mod("tarefas");
      // plano 1000b · RB-246: o título já vem sugerido com o contexto do cartão («Retomar contato — Ana Souza»)
      const t = await T.formTarefa(k, null, { negocio_id: c.id, contato_id: idContato ?? null, ...(c.dono_id != null ? { dono_id: c.dono_id } : {}) /* plano 1500c · RC-240 */, titulo: `Retomar contato — ${L.tituloCard(c)}`.slice(0, 200) });
      if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); S.meus.add(c.id); carregar({ silencioso: true }); }
    } catch (e) { k.toastErro(e); }
  }

  /* ============================================================ estrutura */
  // troca de funil (M30): ui.segmentado com até 5 funis; no celular (e com mais de 5) um seletor no cabeçalho
  const selFunil = h("div", { class: "crm-funis" });
  const selFunilM = h("div", { class: "crm-funil-m" });
  function trocarFunil(id) {
    if (S.funil && S.funil.id === id) return;
    // plano 1000b · RB-003: o funil pode ter sido excluído por outro admin (Alt+N, seletor velho) — avisa em vez de derrubar a tela
    const f = k.funil(id);
    if (!f) { ui.toast("Esse funil não existe mais.", { tipo: "aten" }); desenharSelFunil(); return; }
    S.funil = f;
    S.recolher = lerRecolher();      // plano 2000d · DR-035: cada funil com a sua escolha
    btRecolher.setAttribute("aria-pressed", String(S.recolher));
    gravarLocal();
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm?funil=${encodeURIComponent(S.funil.id)}`);
    carregar();
  }
  // plano 2000d · DR-058: «Funil» pelo vocabulário da vertical (vocab.funil/funis quando existir; senão «Funil»)
  const termoFunil = (k.v && k.v.funil) || "Funil", termoFunis = (k.v && k.v.funis) || "Funis";
  function desenharSelFunil() {
    ui.limpar(selFunil); ui.limpar(selFunilM);
    const lista = funis();
    selFunil.hidden = selFunilM.hidden = lista.length < 2;
    if (lista.length < 2) return;
    const select = classe => {
      const s = h("select", { class: ["sel", "crm-funil-sel", classe], "aria-label": termoFunil }, lista.map(f => h("option", { value: f.id, selected: S.funil && f.id === S.funil.id }, f.nome)));
      s.addEventListener("change", () => trocarFunil(s.value));
      return s;
    };
    if (lista.length <= 5) {
      selFunil.appendChild(ui.segmentado({ opcoes: lista.map(f => ({ valor: f.id, rotulo: f.nome, icone: f.conta_no_ads ? "anuncio" : null })),
        valor: S.funil && S.funil.id, rotulo: termoFunis, aoMudar: trocarFunil }));
      selFunilM.appendChild(select("crm-funil-sel-m"));        // o CSS mostra um dos dois: abas no desktop, seletor no celular
    } else {
      selFunil.hidden = true;
      selFunilM.appendChild(select("crm-funil-sel-todos"));
    }
  }

  // plano 1000b · RB-037: a visão corta a busca em 120 (crm-logica) — o campo também
  // plano 1500c · RC-309: no computador o atalho «/» aparece na própria caixa (e o leitor recebe aria-keyshortcuts)
  const busca = h("input", { type: "search", enterkeyhint: "search", maxlength: "120", placeholder: `Buscar ${k.v.min("negocios")}, nome ou telefone${(() => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } })() ? "" : " (/)"}`, "aria-label": `Buscar ${k.v.min("negocios")}`, "aria-keyshortcuts": "/", value: S.filtro.busca || "" });      // plano 1500c · RX-030: enterkeyhint="search" em todas as buscas do CRM (o teclado do celular mostra «Buscar» em vez de «Enter»)
  // plano 1000 (CR-031): depois de buscar, o leitor de tela ouve quantos cartões sobraram (o quadro muda em silêncio)
  const aoBuscar = ui.debounce(async () => {
    const q = busca.value.trim(); if (q) S.filtro.busca = q; else delete S.filtro.busca; gravarLocal();
    await carregar({ silencioso: true });
    if (!S.vivo || !S.dados || (S.filtro.busca || "") !== q) return;
    const n = S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0);
    ui.anunciar(q ? `${ui.num(n)} ${n === 1 ? "cartão encontrado" : "cartões encontrados"} para «${q}».` : `Busca limpa: ${ui.num(n)} ${n === 1 ? "cartão" : "cartões"} no quadro.`);
  }, 320);
  busca.addEventListener("input", aoBuscar);
  busca.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    if (busca.value) { busca.value = ""; aoBuscar(); return; }
    // plano 1000b · RB-259: Esc com a busca já vazia leva o foco ao 1º cartão (ou ao quadro) — «/», Esc, Esc volta ao quadro pelo teclado
    if (ev.preventDefault) ev.preventDefault();
    const alvo = quadro.querySelector(".kc") || quadro;
    try { alvo.focus({ preventScroll: false }); } catch { alvo.focus(); }
  });

  const nFiltros = h("span", { class: "crm-filtro-n", hidden: true });
  const btFiltros = h("button", { type: "button", class: "bt bt-sec crm-filtro-bt", "aria-haspopup": "dialog" }, ui.icone("filtro"), "Filtros", nFiltros);
  btFiltros.addEventListener("click", abrirFiltros);
  const chips = h("div", { class: "crm-chips", role: "group", "aria-label": "Filtros ativos" });      // plano 2000d · DR-008: aria-label só vale com papel
  // plano 2000d · DR-061: com filtro/busca, a contagem do recorte («Mostrando 34 de 210» quando o servidor manda o total sem filtro)
  const recorte = h("p", { class: "crm-recorte fraco", role: "status", hidden: true });
  // plano 2000d · DR-024/025/027: aviso de filtro que vale só nos cartões carregados
  const notaLocal = h("p", { class: "crm-recorte crm-nota-local fraco", hidden: true });
  const btMeus = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(S.filtro.dono === "eu"), on: { click: () => {
    S.filtro.dono = S.filtro.dono === "eu" ? undefined : "eu"; if (!S.filtro.dono) delete S.filtro.dono;
    gravarLocal(); carregar({ silencioso: true });
  } } }, `${k.v.art("negocio") === "a" ? "Minhas" : "Meus"} ${k.v.min("negocios")}`);       // plano 1000 (CR-006): o termo da vertical
  const btParados = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho", "aria-pressed": String(Number(S.filtro.parado_dias) === 7), on: { click: () => {
    if (Number(S.filtro.parado_dias) === 7) delete S.filtro.parado_dias; else S.filtro.parado_dias = 7;
    gravarLocal(); carregar({ silencioso: true });
  } }, title: "Sem mudar de etapa há 7 dias ou mais" }, "Parados há 7+ dias");      // plano 1000 (CR-205): o rótulo diz o que é
  // plano 1000 (CR-036): «Recolher vazias» — coluna sem cartão vira uma faixa estreita (continua destino do arrasto); lembrado por empresa no aparelho
  // plano 1000b · RB-028: lembrado por CONTA (como o filtro, CR-024) — a chave antiga (só da empresa) é lida uma vez e apagada
  // plano 2000d · DR-035: e por FUNIL — recolher no «Pós-venda» não recolhe no funil de vendas (a chave sem funil vale como padrão antigo)
  const chaveRecolherConta = `nx-app-crm-kb-recolher-${cli}-${conta}`;
  const chaveRecolherFunil = () => `${chaveRecolherConta}-${S.funil ? S.funil.id : "-"}`;
  const lerRecolher = () => { try { const v = localStorage.getItem(chaveRecolherFunil()); if (v !== null) return v === "1"; } catch { /* ok */ } return lerPorConta(chaveRecolherConta, `nx-app-crm-kb-recolher-${cli}`) === "1"; };
  S.recolher = lerRecolher();
  const btRecolher = h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho crm-recolher", "aria-pressed": String(S.recolher), title: "Colunas sem cartão viram uma faixa estreita",
    on: { click: () => {
      S.recolher = !S.recolher;
      btRecolher.setAttribute("aria-pressed", String(S.recolher));
      try { localStorage.setItem(chaveRecolherFunil(), S.recolher ? "1" : "0"); } catch { /* ok */ }
      for (const [id, c] of colEls) marcarRecolhida(c, colunaDe(id));
      ui.anunciar(S.recolher ? "Colunas vazias recolhidas." : "Todas as colunas abertas.");
    } } }, "Recolher vazias");
  // plano 1000 (CR-296): «atualizado às 14:02» discreto; passa de 2 min sem recarga (pulso parado, rede caída) e fica âmbar
  const idade = h("small", { class: "crm-kb-idade", hidden: true });
  function pintarIdade() {
    if (!S.ultimaRecarga) { idade.hidden = true; return; }
    const min = Math.floor((Date.now() - S.ultimaRecarga) / 60000);
    idade.hidden = false;
    // plano 1000b · RB-015: velho, o texto VISÍVEL diz há quanto tempo (o title some no toque e no leitor de tela)
    idade.textContent = `atualizado às ${ui.horaBR(new Date(S.ultimaRecarga).toISOString())}${min >= 2 ? ` · ${L.idadeCurta(min)}` : ""}`;      // plano 2000d · DR-034: «há 2 h», não «há 125 min»
    idade.classList.toggle("velho", min >= 2);
    if (min >= 2) idade.setAttribute("title", `Sem atualizar ${L.idadeCurta(min)}. Confira a internet ou recarregue a página.`); else idade.removeAttribute("title");
  }
  const tIdade = setInterval(() => { if (S.vivo) pintarIdade(); }, 30000);
  if (tIdade && typeof tIdade.unref === "function") tIdade.unref();     // (no Node dos testes o relógio não segura o processo)
  const atalhos = h("div", { class: "crm-atalhos", role: "group", "aria-label": "Filtros rápidos" }, btMeus, btParados, btRecolher, idade);      // plano 2000d · DR-008
  function atualizarAtalhos() {
    if (!btMeus || !btParados) return;
    btMeus.setAttribute("aria-pressed", String(S.filtro.dono === "eu"));
    btParados.setAttribute("aria-pressed", String(Number(S.filtro.parado_dias) === 7));
  }
  const fitaBusca = h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca), btFiltros);
  controlesVisoes = Vis.controlesVisoes(k, { tipo: "kanban",
    // plano 1000b · RB-004: o período dos fechados (30/90/todos) vai e volta com a visão
    obterDados: () => ({ funil: S.funil && String(S.funil.id), filtro: S.filtro, todosFechados: S.todosFechados, fechadosDias: S.fechadosDias }),
    aplicar: async dados => {
      const funil = k.funil(dados.funil);
      if (!funil || funil.ativo === false) throw new Error("O funil deste filtro salvo não está disponível.");
      S.funil = funil; S.filtro = dados.filtro || {};
      definirFechados([30, 90, 0].includes(dados.fechadosDias) ? dados.fechadosDias : (dados.todosFechados === true ? 0 : 30));
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
  // plano 1000b · RB-022: «toque» calculado UMA vez (e protegido: sem matchMedia, como no Node, não lança) — antes, a cada coluna vazia redesenhada
  const toqueTela = (() => { try { return typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { return false; } })();
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
  const chaveResumo = `nx-app-crm-fr-${cli}-${conta}`;      // plano 1000b · RB-028: por conta
  let resumoAberto = (() => { try { const v = lerPorConta(chaveResumo, `nx-app-crm-fr-${cli}`); return v === null ? (!telaPequena() && telaAlta()) : v !== "0"; } catch { return false; } })();
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
  const resPessoas = h("div", { class: "crm-fr-pessoas" });      // plano 1500c · RC-257: abertos, valor e previsão ponderada por responsável
  const resMeses = h("div", { class: "crm-fr-pessoas crm-fr-meses" });      // plano 1500c · RC-294: previsão de receita por mês
  const resCorpo = h("div", { class: "crm-fr-corpo", id: idRes }, resLista, resTabela, resNota, resPessoas, resMeses);
  const btResumo = h("button", { type: "button", class: "crm-fr-cab", "aria-expanded": String(resumoAberto), "aria-controls": idRes, on: { click: () => {
    resumoAberto = !resumoAberto; aplicarResumoAberto();
    try { localStorage.setItem(chaveResumo, resumoAberto ? "1" : "0"); } catch { /* ok */ }
  } } }, h("span", { class: "crm-fr-titulo" }, "Resumo do funil"), h("span", { class: "crm-fr-sub" }, "quantos seguem de uma etapa para a próxima"), resMini, ui.icone("seta-baixo"));
  const resumoFunil = h("section", { class: "crm-fr", "aria-label": "Resumo do funil", hidden: true }, h("div", { class: "crm-fr-topo" }, btResumo, btResTabela), resCorpo);
  function aplicarResumoAberto() { btResumo.setAttribute("aria-expanded", String(resumoAberto)); resCorpo.hidden = !resumoAberto; btResTabela.hidden = !resumoAberto; }
  aplicarResumoAberto();

  const quadro = h("div", { class: "kb", role: "region", "aria-label": `Quadro de ${k.v.min("negocios")}`, tabindex: "-1" });
  const instr = h("p", { id: `kb-instr-${cli}`, class: "sr-only" },
    podeMover ? "Enter abre. Espaço pega o cartão para mover: setas esquerda e direita trocam de etapa, cima e baixo mudam a posição, Enter solta, Esc cancela. A tecla M abre a lista de etapas para mover o cartão. A tecla N cria um cartão novo. Shift com Espaço (ou a tecla X) seleciona o cartão para mover vários de uma vez; Shift com clique também seleciona vários para mover de uma vez; " + L.teclaModificadora(L.plataformaAparelho()) + " com clique abre numa nova aba." : "Enter abre.");      // plano 1000b · RB-014: ⌘ no Mac
  // plano 1000b · RB-034: a instrução longa fica ligada ao QUADRO (lida ao entrar nele), não a cada cartão focado pelas setas
  quadro.setAttribute("aria-describedby", instr.id);
  const areaVazia = h("div", { hidden: true });
  const corpoQuadro = h("div", { class: "kb-env" }, quadro);

  // celular (M23): fita de etapas fixa sob a busca (também é destino do arrasto) + totais numa linha que expande ao toque
  const fitaEtapas = h("nav", { class: "kb-fita", "aria-label": "Etapas do funil" });
  // plano 2000d · DR-067: no celular, com muitas etapas, «Etapa 3 de 10» diz onde se está no funil
  const fitaPos = h("small", { class: "kb-fita-pos dado", "aria-hidden": "true" });
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
  // plano 1500c · RC-087: modo apresentação (reunião/TV) — tela cheia, sem ferramentas e filtros, letra maior; sai com Esc (ou no mesmo botão)
  const btApresentar = h("button", { type: "button", class: "bt bt-fant bt-p crm-apresentar", "aria-pressed": "false", title: "Tela cheia para reunião (Esc sai)",
    on: { click: () => alternarApresentacao() } }, ui.icone("ampliar"), h("span", { class: "crm-apresentar-txt" }, "Tela cheia"));
  // plano 2000d · DR-007: no modo apresentação as ferramentas somem — um botão visível «Sair da apresentação» fica sempre (iPhone sem tela cheia, TV sem teclado)
  const btSairApres = h("button", { type: "button", class: "bt bt-sec bt-p kb-sair-apres", hidden: true, on: { click: () => { alternarApresentacao(false); try { btApresentar.focus(); } catch { /* ok */ } } } }, ui.icone("fechar"), "Sair da apresentação");
  function alternarApresentacao(forcar) {
    const ligar = forcar === undefined ? !el.classList.contains("kb-apresentacao") : !!forcar;
    el.classList.toggle("kb-apresentacao", ligar);
    btApresentar.setAttribute("aria-pressed", String(ligar));
    btSairApres.hidden = !ligar;
    try {
      if (ligar && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
      else if (!ligar && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch { /* sem a API de tela cheia: fica só o modo enxuto */ }
  }
  const aoSairTelaCheia = () => { if (!document.fullscreenElement && el.classList.contains("kb-apresentacao")) alternarApresentacao(false); };
  document.addEventListener("fullscreenchange", aoSairTelaCheia);
  el.append(...[
    ui.cabecalho({ titulo: k.v.crm, acoes: [btApresentar, btNovo, selFunilM] }),
    selFunil,
    h("div", { class: "pilha-p crm-kb-ferramentas" }, fitaBusca, atalhos, controlesVisoes.el, chips, recorte, notaLocal),
    fitaEtapas, fitaPos, resumoLinha, totais, resumoFunil, areaVazia, corpoQuadro, instr, fab, btSairApres].filter(Boolean));
  desenharSelFunil();

  // plano 1000 (CR-035): barra da seleção — «3 selecionados · Mover para… · Limpar»
  // plano 1500c · RC-050: sem role=status — a seleção é anunciada UMA vez (ui.anunciar em alternarSel), não duas
  const selTxt = h("b", { class: "crm-sel-n" });
  const barraSel = h("div", { class: "crm-sel", role: "group", "aria-label": "Cartões selecionados", hidden: true }, selTxt,
    h("button", { type: "button", class: "bt bt-prim bt-p crm-sel-mover", on: { click: () => moverSelecionados() } }, "Mover para…"),
    // plano 1500c · RC-083: etiquetar e trocar o responsável dos selecionados (em fila, um nx_negocio_salvar por cartão)
    h("button", { type: "button", class: "bt bt-sec bt-p crm-sel-etq", on: { click: () => loteEtiquetar() } }, "Etiquetar…"),
    // plano 1500c · RX-043: o caminho de volta do «Etiquetar…» — tira uma etiqueta de todos os selecionados
    h("button", { type: "button", class: "bt bt-sec bt-p crm-sel-tirar-etq", on: { click: () => loteTirarEtiqueta() } }, "Tirar etiqueta…"),
    h("button", { type: "button", class: "bt bt-sec bt-p crm-sel-dono", on: { click: () => loteResponsavel() } }, "Responsável…"),
    h("button", { type: "button", class: "bt bt-fant bt-p crm-sel-limpar", on: { click: () => limparSel() } }, "Limpar seleção"));
  el.insertBefore(barraSel, corpoQuadro);

  // plano 1500c · RC-264: sem internet, uma faixa discreta avisa e o arrasto desliga (antes arrastava, falhava e voltava)
  const semRede = () => typeof navigator !== "undefined" && !!navigator && navigator.onLine === false;
  const faixaRede = h("p", { class: "aviso aviso-aten kb-sem-rede", role: "status", hidden: !semRede() }, ui.icone("alerta"), h("span", null, "Sem internet — mudanças não são salvas. O quadro volta a mexer quando a conexão voltar."));
  el.insertBefore(faixaRede, barraSel);
  // plano 2000d · DR-345: lead sem responsável não fica parado calado — a faixa conta e o supervisor distribui em rodízio (com «Desfazer»)
  const ativosDist = () => (k.base.usuarios || []).filter(u => u && u.ativo !== false);
  const btDistribuir = h("button", { type: "button", class: "bt bt-sec bt-p kb-sem-dono-bt", on: { click: () => distribuirSemDono() } }, "Distribuir entre a equipe");
  const faixaSemDono = k.pode("supervisor") && podeMover ? h("p", { class: "aviso aviso-aten kb-sem-dono", role: "note", hidden: true }, ui.icone("contato"), h("span", { class: "kb-sem-dono-txt" }), btDistribuir) : null;
  if (faixaSemDono) el.insertBefore(faixaSemDono, barraSel);
  function pintarSemDono() {
    if (!faixaSemDono || !S.dados || !S.funil) return;
    const ids = L.cartoesSemDono(S.dados.colunas, S.funil.estagios);
    faixaSemDono.hidden = !ids.length;
    faixaSemDono.querySelector(".kb-sem-dono-txt").textContent = ids.length === 1 ? "1 cartão aberto está sem responsável." : `${ids.length} cartões abertos estão sem responsável.`;
    btDistribuir.hidden = ativosDist().length < 2;
  }
  async function distribuirSemDono() {
    const ids = L.cartoesSemDono(S.dados ? S.dados.colunas : [], S.funil ? S.funil.estagios : []);
    const ativos = ativosDist();
    if (!ids.length || ativos.length < 2) return;
    S.sel.clear(); for (const id of ids) S.sel.add(id);
    const plano = new Map(L.rodizio(ids, ativos.map(u => u.id)).map(x => [String(x.id), x.dono_id]));
    await aplicarEmLote(c => ({ dono_id: plano.get(String(c.id)) ?? c.dono_id ?? null }), n => `${n} ${n === 1 ? "cartão distribuído" : "cartões distribuídos"} entre ${ativos.length} pessoas.`,
      { desfazerDe: c => ({ dono_id: c.dono_id ?? null }) });
    if (S.vivo) { limparSel(); pintarSemDono(); }
  }
  const aoMudarRede = () => {
    faixaRede.hidden = !semRede(); el.classList.toggle("kb-offline", semRede());
    // plano 2000d · DR-053: a faixa diz de quando são os números na tela («mostrando o de 14:32»)
    const hora = semRede() && S.ultimaRecarga ? ui.horaBR(new Date(S.ultimaRecarga).toISOString()) : "";
    faixaRede.lastChild.textContent = `Sem internet${hora ? ` — mostrando o de ${hora}` : ""}. Mudanças não são salvas; o quadro volta a mexer quando a conexão voltar.`;
  };
  aoMudarRede();
  try { addEventListener("online", aoMudarRede); addEventListener("offline", aoMudarRede); } catch { /* ok */ }

  // plano 1500c · RC-253: na 1ª visita, três dicas do quadro (arrastar · filtros salvos · abrir para ver tudo) com «Entendi»; guardado no aparelho
  // plano 2000d · DR-006: a chave é por empresa e CONTA (recepção com computador compartilhado: cada pessoa vê as dicas uma vez)
  const CHAVE_TOUR = `nx-app-crm-tour-quadro:${cli}:${conta}`;
  let tourVisto = true;
  try { tourVisto = localStorage.getItem(CHAVE_TOUR) === "1"; } catch { /* sem armazenamento: não mostra */ }
  // plano 2000d · DR-004: chegou por link de negócio (#/crm/negocio/ID → partes[0]) ou há diálogo aberto — as dicas ficam para a próxima entrada
  const comNegocioNaRota = !!(rota && ((rota.query && rota.query.negocio) || (Array.isArray(rota.partes) && rota.partes[0] === "negocio")));
  const comDialogo = (() => { try { return !!(typeof document !== "undefined" && document.querySelector && document.querySelector("dialog[open]")); } catch { return false; } })();
  if (!tourVisto && !comNegocioNaRota && !comDialogo) {
    const fecharTour = () => { try { localStorage.setItem(CHAVE_TOUR, "1"); } catch { /* ok */ } tour.remove(); };
    const tour = h("section", { class: "cartao kb-tour", "aria-label": "Dicas do quadro" },
      h("h2", { class: "kb-tour-t" }, "Primeira vez neste quadro?"),      // plano 2000d · DR-005: sem artigo fixo («no Vendas», «no Orçamentos»)
      h("ol", { class: "kb-tour-lista" },
        h("li", null, podeMover ? "Arraste o cartão para outra etapa (no celular, segure e arraste) — ou use o botão de mover do cartão." : "Cada coluna é uma etapa do funil; os cartões andam da esquerda para a direita."),
        h("li", null, "Use «Filtros» e salve os que você usa sempre em «Salvar filtro»."),
        h("li", null, `Toque no cartão para abrir ${k.v.art("negocio") === "a" ? "a" : "o"} ${k.v.min("negocio")} com tudo: conversa, tarefas, notas e histórico.`)),
      h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-prim bt-p kb-tour-ok", on: { click: fecharTour } }, "Entendi"),
        h("button", { type: "button", class: "bt bt-fant bt-p kb-tour-pular", on: { click: fecharTour } }, "Pular")));
    el.insertBefore(tour, faixaRede);
  }
  function pintarSel() {
    for (const x of S.sel) if (!cardDe(x)) S.sel.delete(x);
    barraSel.hidden = !S.sel.size;
    // plano 1500c · RC-335: a faixa mostra também o valor somado dos selecionados (a mesma régua do quadro)
    const somaSel = [...S.sel].reduce((s, x) => s + L.valorCard(cardDe(x)), 0);
    selTxt.textContent = `${S.sel.size} ${S.sel.size === 1 ? "selecionado" : "selecionados"}${somaSel > 0 ? ` · ${ui.brl(somaSel, { centavos: false })}` : ""}`;
    for (const art of quadro.querySelectorAll(".kc")) art.classList.toggle("kc-sel", S.sel.has(Number(art.dataset.id)) || S.sel.has(art.dataset.id));
  }
  function alternarSel(id) {
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
    if (!S.sel.size) S.modoSel = false;
    pintarSel();
    ui.anunciar(`${S.sel.size} ${S.sel.size === 1 ? "cartão selecionado" : "cartões selecionados"}.`);
  }
  function limparSel() { S.sel.clear(); S.modoSel = false; pintarSel(); }
  /** plano 1500c · RC-083: grava um patch em cada selecionado (fila), recarrega e diz quantos deram certo. */
  /**
   * plano 2000d · DR-013/016/042: `pular(c)` tira do lote quem já está como deveria (e conta «já tinham»); `desfazerDe(c)` = o patch que devolve o
   * cartão ao que era — com ele o aviso final ganha «Desfazer». `viaRpc(cards)` (DR-014): uma operação incremental no servidor; devolve null
   * quando a RPC não existe (aí vale o laço de nx_negocio_salvar).
   */
  async function aplicarEmLote(patchDe, textoOk, { pular = null, desfazerDe = null, viaRpc = null } = {}) {
    const todos = [...S.sel].map(cardDe).filter(Boolean);
    const livres = todos.filter(c => !S.pend.has(c.id));
    // plano 1500c · RX-042: cartão que ainda está salvando fica de fora — e a pessoa fica sabendo (antes sumia calado da conta)
    const pulados = todos.length - livres.length;
    if (!livres.length) { if (pulados) ui.toast(`${pulados === 1 ? "O cartão ainda está" : "Os cartões ainda estão"} salvando. Tente de novo em instantes.`, { tipo: "info" }); return; }
    const cards = pular ? livres.filter(c => !pular(c)) : livres;
    const jaEstavam = livres.length - cards.length;
    if (cards.length > 5) ui.anunciar(`Alterando ${cards.length} cartões…`);
    const antes = new Map(cards.map(c => [c.id, desfazerDe ? desfazerDe(c) : null]));
    let ok = 0, primeiroErro = null;
    const feitos = [];
    let foiRpc = false;
    if (viaRpc && cards.length) {
      try { const r = await viaRpc(cards); if (r) { foiRpc = true; for (const c of cards) if (r.has(String(c.id))) { ok++; feitos.push(c); S.meus.add(c.id); } if (ok < cards.length) primeiroErro = primeiroErro || new Error("parcial"); } }
      catch (e) { if (!L.rpcAusente(e)) { foiRpc = true; primeiroErro = e; } }
    }
    if (!foiRpc) for (const c of cards) {
      try { await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: c.id, ...patchDe(c) } }); ok++; feitos.push(c); S.meus.add(c.id); }
      catch (e) { primeiroErro = primeiroErro || e; }
    }
    limparSel();
    if (S.vivo) await carregar({ silencioso: true });
    const sufixo = pulados ? ` ${pulados} ${pulados === 1 ? "ficou" : "ficaram"} de fora (ainda salvando).` : "";
    const texto = `${textoOk(ok, jaEstavam)}${sufixo}`;
    if (ok && desfazerDe) {
      ui.acaoComDesfazer({ texto, reverter: async () => {
        let falhou = 0;
        for (const c of feitos) { try { await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: c.id, ...antes.get(c.id) } }); S.meus.add(c.id); } catch { falhou++; } }
        if (S.vivo) await carregar({ silencioso: true });
        if (falhou) ui.toast(`${falhou} de ${feitos.length} não ${falhou === 1 ? "voltou" : "voltaram"} ao que era.`, { tipo: "erro" });
      } });
    } else if (ok || (jaEstavam && !primeiroErro)) ui.toast(texto, { tipo: ok ? "ok" : "info" });
    if (primeiroErro) ui.toast(`${cards.length - ok} não ${cards.length - ok === 1 ? "foi alterado" : "foram alterados"}${primeiroErro.message === "parcial" ? "." : `: ${k.erro(primeiroErro)}`}`, { tipo: "erro" });
  }
  /** plano 2000d · DR-014: etiquetar/tirar em lote como operação incremental (não sobrescreve a etiqueta que outra pessoa pôs depois do último pulso). */
  const etiquetarViaRpc = (adicionar, remover) => async cards => {
    if (S.semEtiquetarLote) return null;
    try {
      const r = await k.api.rpcC("nx_negocios_etiquetar_lote", { p_ids: cards.map(c => c.id), p_adicionar: adicionar, p_remover: remover });
      if (!r || !Array.isArray(r.ok)) return null;
      return new Set(r.ok.map(String));
    } catch (e) { if (L.rpcAusente(e)) { S.semEtiquetarLote = true; return null; } throw e; }
  };
  async function escolherNaLista(titulo, opcoes) {
    let modalApi = null;
    const lista = h("ul", { class: "kb-mover" }, opcoes.map(o => h("li", { dataset: { busca: L.semAcento(o.rotulo) } }, h("button", { type: "button", class: "kb-mover-op", on: { click: () => modalApi && modalApi.fechar(o.valor) } },
      h("span", { class: "kb-mover-nome" }, o.rotulo)))));
    // plano 1500c · RX-044: mais de 8 opções (etiquetas, equipe grande) → uma busca no topo filtra a lista
    let corpo = lista;
    if (opcoes.length > 8) {
      const campo = h("input", { type: "search", enterkeyhint: "search", class: "kb-mover-busca", maxlength: "60" /* plano 2000d · PX-078: busca com limite (colar texto enorme travava a digitação) */, placeholder: "Buscar", "aria-label": "Buscar na lista", autocomplete: "off" });
      const nada = h("p", { class: "fraco", hidden: true }, "Nada encontrado.");
      campo.addEventListener("input", () => {
        const q = L.semAcento(campo.value.trim());
        let n = 0;
        for (const li of lista.querySelectorAll("li")) { const mostra = !q || String(li.dataset.busca || "").includes(q); li.hidden = !mostra; if (mostra) n++; }
        nada.hidden = n > 0;
      });
      // plano 1500c · RX-074: Enter com uma opção só sobrando escolhe ela
      campo.addEventListener("keydown", ev => {
        // plano 2000d · PX-087/088: Esc com texto limpa (sem fechar); seta para baixo vai à 1ª opção que sobrou
        if (ev.key === "Escape" && campo.value) { ev.preventDefault(); ev.stopPropagation(); campo.value = ""; for (const li of lista.querySelectorAll("li")) li.hidden = false; nada.hidden = true; return; }
        if (ev.key === "ArrowDown") { const li1 = [...lista.querySelectorAll("li")].find(li => !li.hidden); const b = li1 && li1.querySelector("button"); if (b) { ev.preventDefault(); b.focus(); } return; }
        if (ev.key !== "Enter") return;
        const sobra = [...lista.querySelectorAll("li")].filter(li => !li.hidden);
        if (sobra.length === 1) { if (ev.preventDefault) ev.preventDefault(); const b = sobra[0].querySelector("button"); if (b) b.click(); }
      });
      corpo = h("div", { class: "pilha-p" }, campo, lista, nada);
    }
    return ui.modal({ titulo, corpo, largura: "p", protegerTexto: false, acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
  }
  async function loteEtiquetar() {
    const etqs = (k.base.etiquetas || []);
    if (!etqs.length) { ui.toast("Crie uma etiqueta antes (Configurações → Etiquetas).", { tipo: "info" }); return; }
    const id = await escolherNaLista(`Etiquetar ${S.sel.size} ${S.sel.size === 1 ? "cartão" : "cartões"}`, etqs.map(e => ({ valor: e.id, rotulo: e.nome })));
    if (id == null || !S.vivo) return;
    const nome = (k.etiqueta(id) || {}).nome || "etiqueta";
    // plano 2000d · DR-393: LGPD — quem não quer marketing está no lote? avisa antes (a etiqueta pode virar campanha)
    const semMkt = L.contarSemMarketing([...S.sel].map(cardDe).filter(Boolean));
    if (semMkt && !(await ui.confirmar({ titulo: `Etiquetar com «${nome}»?`, rotulo: "Etiquetar",
      texto: `${semMkt === 1 ? "1 dos selecionados não quer" : `${semMkt} dos selecionados não querem`} receber marketing. Se esta etiqueta for usada em campanha, ${semMkt === 1 ? "ele fica" : "eles ficam"} de fora pelo opt-out — confira antes.` }))) return;
    if (!S.vivo) return;
    // plano 2000d · DR-013/014/016: só quem ainda não tinha; incremental no servidor; com «Desfazer»
    const tem = c => (c.etiquetas || []).some(x => String(x) === String(id));
    await aplicarEmLote(c => ({ etiquetas: [...new Set([...(c.etiquetas || []), id])] }), (n, ja) => L.textoLoteEtiqueta(nome, n, ja),
      { pular: tem, desfazerDe: c => ({ etiquetas: [...(c.etiquetas || [])] }), viaRpc: etiquetarViaRpc([id], []) });
  }
  async function loteTirarEtiqueta() {
    const usadas = new Set([...S.sel].map(cardDe).filter(Boolean).flatMap(c => (c.etiquetas || []).map(String)));
    const etqs = (k.base.etiquetas || []).filter(e => usadas.has(String(e.id)));
    if (!etqs.length) { ui.toast("Nenhum dos selecionados tem etiqueta.", { tipo: "info" }); return; }
    const id = await escolherNaLista(`Tirar etiqueta de ${S.sel.size} ${S.sel.size === 1 ? "cartão" : "cartões"}`, etqs.map(e => ({ valor: e.id, rotulo: e.nome })));
    if (id == null || !S.vivo) return;
    const nome = (k.etiqueta(id) || {}).nome || "etiqueta";
    await aplicarEmLote(c => ({ etiquetas: (c.etiquetas || []).filter(x => String(x) !== String(id)) }), n => `Etiqueta «${nome}» tirada de ${n} ${n === 1 ? "cartão" : "cartões"}.`,
      { pular: c => !(c.etiquetas || []).some(x => String(x) === String(id)), desfazerDe: c => ({ etiquetas: [...(c.etiquetas || [])] }), viaRpc: etiquetarViaRpc([], [id]) });      // plano 2000d · DR-013/014
  }
  async function loteResponsavel() {
    const SEM = "__sem__", RODIZIO = "__rodizio__";
    const ativos = (k.base.usuarios || []).filter(u => u.ativo !== false);
    const id = await escolherNaLista(`Responsável de ${S.sel.size} ${S.sel.size === 1 ? "cartão" : "cartões"}`,
      [...(k.base.usuarios || []).map(u => ({ valor: u.id, rotulo: u.nome })), { valor: SEM, rotulo: "Sem responsável" },
        // plano 2000d · DR-040: «Distribuir entre a equipe» — reparte os selecionados em rodízio (1º para a 1ª pessoa, 2º para a 2ª…)
        ...(S.sel.size > 1 && ativos.length > 1 ? [{ valor: RODIZIO, rotulo: `Distribuir entre ${ativos.length} pessoas (rodízio)` }] : [])]);
    if (id == null || !S.vivo) return;
    if (id === RODIZIO) {
      const plano = new Map(L.rodizio([...S.sel], ativos.map(u => u.id)).map(x => [String(x.id), x.dono_id]));
      await aplicarEmLote(c => ({ dono_id: plano.get(String(c.id)) ?? c.dono_id ?? null }), n => `${n} ${n === 1 ? "cartão distribuído" : "cartões distribuídos"} entre ${ativos.length} pessoas.`,
        { desfazerDe: c => ({ dono_id: c.dono_id ?? null }) });
      return;
    }
    const nome = id === SEM ? "ninguém" : ((k.usuario(id) || {}).nome || "—");
    const novoDono = id === SEM ? null : id;
    // plano 2000d · DR-042: com «Desfazer» (cada cartão volta ao responsável de antes); quem já era dessa pessoa fica de fora da conta
    await aplicarEmLote(() => ({ dono_id: novoDono }), n => `Responsável (${nome}) trocado em ${n} ${n === 1 ? "cartão" : "cartões"}.`,
      { pular: c => String(c.dono_id ?? "") === String(novoDono ?? ""), desfazerDe: c => ({ dono_id: c.dono_id ?? null }) });
  }

  /** plano 1500c · RC-057: seleciona todos os cartões CARREGADOS da etapa (avisa quando o servidor tem mais). */
  function selecionarColuna(estagioId) {
    const col = colunaDe(estagioId);
    const ids = col ? col.itens.filter(x => !S.pend.has(x.id)).map(x => x.id) : [];
    if (!ids.length) { ui.anunciar("Nenhum cartão nesta etapa."); return; }
    for (const id of ids) S.sel.add(id);
    S.modoSel = true;
    pintarSel();
    const total = Number(col.total) || ids.length;
    ui.anunciar(`${S.sel.size} ${S.sel.size === 1 ? "cartão selecionado" : "cartões selecionados"}.`);
    if (total > col.itens.length) ui.toast(`Selecionados os ${ids.length} cartões carregados. A etapa tem ${total}: use «Ver mais» para juntar os outros.`, { tipo: "info" });
  }

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

  /** plano 2000d · DR-024/025/027: «só com não lida», serviço e temperatura valem nos cartões carregados (o servidor ainda não filtra por eles). */
  function filtrarLocal(d) {
    if (!d || !Array.isArray(d.colunas)) return d;
    const r = L.aplicarFiltroLocal(d.colunas, S.filtro);
    d.colunas = r.colunas;
    notaLocal.hidden = !L.temFiltroLocal(S.filtro);
    notaLocal.textContent = r.parcial ? "Alguns filtros valem só para os cartões já carregados em cada etapa." : "";
    if (!r.parcial) notaLocal.hidden = true;
    return d;
  }

  async function carregar({ silencioso = false } = {}) {
    const minha = ++S.seq;
    if (!S.funil) { mostrarSemFunil(); return; }
    for (const b of [btNovo, fab]) if (b) b.hidden = false;      // plano 1000b · RB-001: voltou a haver funil
    const trocouTudo = !silencioso || !S.dados;
    if (trocouTudo) { S.teclado = null; S.adiado = null; ui.limpar(quadro); quadro.appendChild(ui.esqueleto("kanban", Math.min(6, S.funil.estagios.length || 4))); }   // o cartão pego pelo teclado saiu da tela junto
    desenharChips();
    let doCache = false;
    try {
      const d = await k.api.rpcC("nx_negocios_kanban", { p_funil: S.funil.id, p_filtro: filtroServidor(), p_por_coluna: 30 }, { cache: true, aoCache: dc => {
        // M16/M30: a 1ª pintura é o último quadro guardado (só quando ainda não há nada na tela); a rede chega logo depois
        if (minha !== S.seq || !S.vivo || S.dados || !dc || !Array.isArray(dc.colunas)) return;
        S.dados = filtrarLocal(dc); doCache = true;
        desenharQuadro();
        if (S.pronta) S.pronta();       // a tela já pode entrar: o quadro guardado está pintado
      } });
      if (minha !== S.seq || !S.vivo) return;
      filtrarLocal(d);      // plano 2000d · DR-024/025/027
      const igual = doCache && mesmoQuadro(d);     // nada mudou desde o guardado: não refaz o quadro (plano 1000b · RB-262)
      S.ultimaRecarga = Date.now();
      S.avisouFalha = false;      // plano 2000d · DR-001: voltou a atualizar — a próxima falha avisa de novo
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
      // plano 1000b · RB-002: a recarga da base pode falhar (sem rejeição solta) e, sem funil padrão, a tela é a de «Nenhum funil ativo» (não o cartão de erro)
      if (e && e.codigo === "funil_invalido") {
        let recarregou = true;
        try { await k.recarregarBase(); } catch { recarregou = false; }
        if (minha !== S.seq || !S.vivo) return;
        if (recarregou) {
          S.funil = k.funilPadrao(); desenharSelFunil();
          if (S.funil) return carregar();
          mostrarSemFunil(); return;
        }
      }
      // plano 2000d · DR-001: recarga silenciosa (pulso, busca, filtro) que falhou com o quadro JÁ desenhado não apaga o que o vendedor está vendo —
      // o selo fica âmbar e um aviso (uma vez por sequência de falhas) diz de quando é o quadro, com «Tentar»
      if (silencioso && S.dados && colEls.size) {
        idade.classList.add("velho");
        if (!S.avisouFalha) {
          S.avisouFalha = true;
          const hora = S.ultimaRecarga ? ui.horaBR(new Date(S.ultimaRecarga).toISOString()) : "";
          ui.toast(`Não consegui atualizar${hora ? ` — mostrando o de ${hora}` : ""}.`, { tipo: "aten", acao: { rotulo: "Tentar", fn: () => carregar({ silencioso: true }) } });
        }
        return;
      }
      ui.limpar(quadro);
      const cartaoErro = ui.erroCartao(e, () => carregar());
      // plano 2000d · DR-021: o código para o suporte, pequeno, no cartão de erro do quadro
      const cod = L.codigoSuporte(e);
      if (cod && cartaoErro && cartaoErro.appendChild) cartaoErro.appendChild(h("small", { class: "kb-erro-cod fraco" }, `código ${cod}`));
      quadro.appendChild(cartaoErro);
    }
  }

  function mostrarSemFunil() {
    for (const b of [btNovo, fab]) if (b) b.hidden = true;      // plano 1000b · RB-001: sem funil não há onde criar
    ui.limpar(quadro);
    // plano 1000b · RB-017: quem não é admin não tem «Configurações → Funis» — pede ao administrador
    quadro.appendChild(ui.vazio({ titulo: "Nenhum funil ativo.", texto: k.pode("admin") ? "Crie um funil em Configurações → Funis e etapas." : "Peça ao administrador para criar ou ativar um funil.", tema: "crm",
      acao: k.pode("admin") ? { rotulo: "Abrir configurações", fn: () => ctx.navegar("#/config/funis") } : null }));
  }

  /* ============================================================ desenho */
  const colEls = new Map();    // estagio_id → {sec, lista, n, soma, extra}

  function colunaDe(id) { return S.dados.colunas.find(c => c.estagio_id === id); }
  /**
   * plano 1000b · RB-036: o cartão pelo id SEM montar seletor CSS com o id do servidor (aspas ou barra quebravam o seletor com SyntaxError) —
   * compara o data-id de cada cartão.
   */
  function cartaoEl(id, raiz = quadro) {
    const alvo = String(id);
    return Array.from(raiz.querySelectorAll(".kc")).find(x => x.dataset && x.dataset.id === alvo) || null;
  }
  /** O que a coluna desenhou (CR-023); nas fechadas entra também o período dos fechados (CR-215: o rodapé «últimos 90 dias» muda sem a resposta mudar). */
  const jsonColuna = (e, col) => JSON.stringify(col) + (e && e.tipo !== "aberto" ? `|${S.fechadosDias}` : "");
  /**
   * plano 1000b · RB-262: a resposta da rede é o mesmo quadro que o cache pintou? Antes: JSON.stringify do quadro INTEIRO duas vezes (milhares
   * de cartões). Agora coluna a coluna contra o c.json que cada coluna já guardou, parando na 1ª diferença.
   */
  function mesmoQuadro(d) {
    if (!d || !Array.isArray(d.colunas) || !S.dados || !Array.isArray(S.dados.colunas) || d.colunas.length !== S.dados.colunas.length) return false;
    const { colunas: _a, ...restoNovo } = d, { colunas: _b, ...restoVelho } = S.dados;
    if (JSON.stringify(restoNovo) !== JSON.stringify(restoVelho)) return false;
    for (const col of d.colunas) {
      const c = col && colEls.get(col.estagio_id);
      if (!c || jsonColuna(c.e, col) !== c.json) return false;
    }
    return true;
  }

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
        // plano 1000b · RB-016: sem o módulo Conversas nada chega sozinho pelo WhatsApp — o texto não promete isso
        texto: comConversas ? `${fem ? "Elas aparecem sozinhas" : "Eles aparecem sozinhos"} quando alguém chama no WhatsApp — ou ${fem ? "crie uma" : "crie um"} agora.`
          : k.pode("supervisor") ? `${fem ? "Crie a primeira" : "Crie o primeiro"} ou importe uma planilha.` : `${fem ? "Crie a primeira" : "Crie o primeiro"} agora.`,
        tema: "crm", acao: podeMover ? { rotulo: k.v.novo("negocio"), fn: () => novo({}) } : null,
        // plano 2000d · DR-019: o texto fala em importar — o botão leva à importação (quem pode importar: supervisor)
        acoes: k.pode("supervisor") ? [{ rotulo: "Importar planilha", fn: () => ctx.navegar("#/crm?importar=1") }] : [] }));
    } else if (S.estadoVazio === "filtro") {
      // plano 1000 (CR-200): a busca e os filtros valem para todos os funis — trocar para um funil sem nada que passe neles não pode parecer «quadro vazio»
      areaVazia.appendChild(ui.vazio({ tipo: "sem_resultado", tema: "crm", titulo: "Nada com estes filtros neste funil.",
        texto: S.filtro.busca ? `A busca «${S.filtro.busca}» e os filtros ativos valem para todos os funis.` : "Os filtros ativos valem para todos os funis.",
        acao: { rotulo: "Limpar filtros", fn: limparTudo } }));
      sugerirOutrosFunis();
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
    garantirRoving();      // plano 2000d · DR-029
    restaurarVolta();      // plano 2000d · DR-346
  }

  /* plano 2000d · DR-346: do cartão para a conversa e de volta — guarda funil e rolagem (do quadro e da página) e, na volta, o quadro
     reabre onde estava; a conversa recebe ?de=crm (para o botão «Voltar ao quadro» de lá). */
  const chaveVolta = `nx-app-crm-kb-volta-${cli}`;
  function irConversa(idContato) {
    try {
      const se = typeof document !== "undefined" && document.scrollingElement;
      sessionStorage.setItem(chaveVolta, JSON.stringify({ funil: S.funil ? S.funil.id : null, x: quadro.scrollLeft || 0, y: se ? se.scrollTop || 0 : 0, em: Date.now() }));
    } catch { /* sem sessionStorage: só não volta ao mesmo lugar */ }
    ctx.navegar(`#/conversas?contato=${encodeURIComponent(idContato)}&de=crm`);
  }
  function restaurarVolta() {
    let v = null;
    try { v = JSON.parse(sessionStorage.getItem(chaveVolta) || "null"); } catch { return; }
    if (!v) return;
    try { sessionStorage.removeItem(chaveVolta); } catch { /* ok */ }
    if (!S.funil || String(v.funil) !== String(S.funil.id) || !(Date.now() - (v.em || 0) < 30 * 60000)) return;
    quadro.style.scrollBehavior = "auto";
    quadro.scrollLeft = Number(v.x) || 0;
    quadro.style.scrollBehavior = "";
    try { const se = typeof document !== "undefined" && document.scrollingElement; if (se && v.y) se.scrollTop = Number(v.y) || 0; } catch { /* ok */ }
  }

  /** «» (há cartões) · «total» (funil vazio de verdade) · «filtro» (nada passa na busca/filtros neste funil). */
  function estadoVazioAgora() {
    if (!S.dados.colunas.every(c => !c.total)) return "";
    return L.filtroVazio(S.filtro) ? "total" : "filtro";
  }
  /**
   * plano 2000d · DR-033: a busca não achou nada NESTE funil — pergunta ao servidor (nx_negocios_buscar_funis) quantos há nos outros e oferece
   * «2 em Pós-venda». Sem a RPC no servidor, nada aparece (e não pergunta de novo nesta tela).
   */
  async function sugerirOutrosFunis() {
    const q = S.filtro.busca;
    if (!q || S.semBuscaFunis || funis().length < 2) return;
    const funil0 = S.funil && S.funil.id;
    let r;
    try { r = await k.api.rpcC("nx_negocios_buscar_funis", { p_busca: q }); }
    catch (e) { if (L.rpcAusente(e)) S.semBuscaFunis = true; return; }
    if (!S.vivo || S.filtro.busca !== q || !S.funil || S.funil.id !== funil0 || areaVazia.hidden) return;
    const outros = (Array.isArray(r) ? r : (r && r.funis) || []).filter(x => x && String(x.funil_id) !== String(funil0) && Number(x.n) > 0 && k.funil(x.funil_id));
    if (!outros.length) return;
    areaVazia.appendChild(h("div", { class: "linha kb-outros-funis" }, h("span", { class: "fraco" }, "Achamos em outro funil:"),
      outros.map(x => h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { trocarFunil(x.funil_id); desenharSelFunil(); } } },
        `${ui.num(Number(x.n))} em ${k.funil(x.funil_id).nome}`))));
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
  // plano 1000b · RB-023: os avisos de «movido» guardam os timers — o desmontar cancela
  const timers = new Set();
  const depois = (f, ms) => { const t = setTimeout(() => { timers.delete(t); f(); }, ms); timers.add(t); return t; };
  function destacarMovidos(antes) {
    if (!antes) return;
    const movidos = [], movidosIds = [];
    for (const col of S.dados.colunas) for (const x of col.itens || []) {
      const era = antes.get(x.id);
      if (era === undefined || era === col.estagio_id || S.pend.has(x.id) || S.meus.has(x.id)) continue;
      const el = cartaoEl(x.id);
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
        depois(() => selo.remove(), 4000);
      }
      depois(() => { el.classList.remove("kc-movido"); if (tituloAntes) el.setAttribute("title", tituloAntes); else el.removeAttribute("title"); }, 2000);
      movidos.push(`«${L.tituloCard(x)}» foi para ${(k.estagio(col.estagio_id) || {}).nome || "outra etapa"}${quem ? ` (${quem})` : ""}`);
      movidosIds.push(x.id);
    }
    S.meus.clear();
    if (movidos.length && movidos.length <= 2) ui.anunciar(`${movidos.join("; ")}.`);
    // plano 2000d · DR-010: acima de 2 o pulso de cada cartão passa despercebido — uma nota curta com «Ver» (rola até o primeiro)
    else if (movidos.length > 2) {
      const primeiro = movidosIds[0];
      ui.toast(`${ui.num(movidos.length)} cartões mudaram de etapa.`, { tipo: "info", ms: 6000, acao: { rotulo: "Ver", fn: () => {
        const a = cartaoEl(primeiro);
        if (!a) return;
        try { a.scrollIntoView({ block: "nearest", inline: "center", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ }
        try { a.focus({ preventScroll: true }); } catch { a.focus(); }
      } } });
    }
  }

  /* ---------- fita de etapas (celular): atalho para cada coluna + destino do arrasto ---------- */
  /** plano 1000b · RB-007: o mesmo rótulo ao desenhar e ao recontar (antes a recontagem perdia «fechada, ganho/perda»). */
  const rotuloFita = (e, n) => `${e.nome}${e.tipo === "ganho" ? " (fechada, ganho)" : e.tipo === "perdido" ? " (fechada, perda)" : ""}, ${n} ${n === 1 ? "cartão" : "cartões"}`;
  function desenharFita() {
    ui.limpar(fitaEtapas);
    if (!S.dados) return;
    for (const e of S.funil.estagios) {
      const col = colunaDe(e.id);
      const n = col ? Number(col.total) || 0 : 0;
      const b = h("button", { type: "button", class: "kb-fita-b", dataset: { estagio: e.id }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
        "aria-label": rotuloFita(e, n), on: { click: () => irParaColuna(e.id) } },
        // plano 1000 (CR-269): Ganho/Perdido com ✓/✕ — na fita as etapas fechadas não parecem abertas
        e.tipo === "ganho" || e.tipo === "perdido" ? h("span", { class: `kb-fita-ic kb-fita-${e.tipo}`, "aria-hidden": "true" }, ui.icone(e.tipo === "ganho" ? "check" : "fechar")) : h("i", { "aria-hidden": "true" }),
        h("span", null, e.nome), h("b", { class: "dado" }, ui.num(n)));
      fitaEtapas.appendChild(b);
    }
    marcarColunaAtual();
  }

  /** Só os números da fita (depois de mover um cartão): a fita inteira só é refeita ao redesenhar o quadro. */
  function contarFita() {
    for (const b of fitaEtapas.children) {
      const col = colunaDe(b.dataset.estagio), n = col ? Number(col.total) || 0 : 0;
      if (b.lastChild) b.lastChild.textContent = ui.num(n);
      b.setAttribute("aria-label", rotuloFita(k.estagio(b.dataset.estagio) || { nome: "", tipo: "aberto" }, n));      // plano 1000b · RB-007
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
    const ids = [...colEls.keys()];
    const pos = ids.indexOf(melhor);
    fitaPos.textContent = ids.length > 1 && pos >= 0 ? `Etapa ${pos + 1} de ${ids.length}` : "";      // plano 2000d · DR-067
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
    const n = h("span", { class: "kb-col-n" });      // plano 1000b · RB-011: número visível + «cartões» só para o leitor (aria-label em span era ignorado)
    const soma = h("span", { class: "kb-col-soma" });
    const lista = h("div", { class: "kb-lista", role: "list", dataset: { estagio: e.id }, "aria-labelledby": idNome });
    const extra = h("div");
    // plano 1000b · RB-005: etapa salva sem chance (null) não mostra «null% de chance» — usa a chance padrão do tipo
    const probCol = Number.isFinite(Number(e.probabilidade)) && e.probabilidade !== null && e.probabilidade !== "" ? Number(e.probabilidade) : L.probPadrao(e.tipo);
    const tipoTxt = e.tipo === "ganho" ? k.v.ganhar : e.tipo === "perdido" ? k.v.perder : `${probCol}% de chance`;
    const mais = podeMover && e.tipo === "aberto"
      ? h("button", { type: "button", class: "bt-icone kb-col-mais", "aria-label": `${k.v.novo("negocio")} em ${e.nome}`, title: `${k.v.novo("negocio")} em ${e.nome}`,
        on: { click: () => novo({ estagio_id: e.id }) } }, ui.icone("mais")) : null;
    // plano 1500c · RC-057: «Selecionar os desta etapa» (os carregados, respeitando os filtros) — mover 30 leads frios sem marcar um por um
    const selCol = podeMover ? h("button", { type: "button", class: "bt-icone kb-col-sel", "aria-label": `Selecionar os cartões de ${e.nome}`, title: `Selecionar os cartões desta etapa`,
      on: { click: () => selecionarColuna(e.id) } }, ui.icone("check")) : null;
    // plano 50 (item 23): mini-barra de participação — quanto desta etapa há no funil (abertas: entre as abertas; fechadas: no quadro todo)
    const prop = h("span", { class: "kb-col-prop", role: "img" }, h("i"));
    const pct = h("span", { class: "kb-col-pct dado" });
    // plano 1500c · RC-310: coluna fechada diz no cabeçalho de que período são os cartões (30/90 dias ou todos) — antes só no rodapé
    const periodo = e.tipo !== "aberto" ? h("small", { class: "kb-col-periodo" }) : null;
    const anun = h("span", { class: "kb-col-anuncio", hidden: true });      // C10: «2 de anúncio» quando a coluna tem cartão vindo de anúncio
    // plano 2000d · DR-066: «3 fora do prazo» no cabeçalho — a etapa em alerta sem precisar olhar cartão por cartão
    const slaEl = e.tipo === "aberto" && e.sla_horas ? h("span", { class: "kb-col-sla", hidden: true, title: `Passaram do prazo da etapa (${L.textoPrazoSla(e.sla_horas)})` }) : null;
    const sec = h("section", { class: "kb-col", dataset: { estagio: e.id, tipo: e.tipo }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, "aria-labelledby": idNome },
      h("header", { class: "kb-col-cab" },
        // plano 1500c · RC-071: nome longo cortado pelo CSS ganha a dica com o nome inteiro
        h("div", { class: "kb-col-l1" }, h("i", { "aria-hidden": "true" }), h("h2", { class: "kb-col-nome", id: idNome, title: e.nome }, e.nome), n, selCol, mais),
        h("div", { class: "kb-col-l2" }, soma, h("span", { class: "kb-col-tipo" }, tipoTxt), periodo),
        h("div", { class: "kb-col-l3" }, prop, pct, anun, slaEl)),
      lista, extra);
    colEls.set(e.id, { sec, lista, n, soma, extra, e, prop, pct, anun, periodo, slaEl });
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
    // plano 1500c · RC-078: a taxa de ganho do período dos fechados (ganhos ÷ fechados) — o número que o vendedor mostra ao dono
    const tx = L.taxaGanho(S.dados.colunas, S.funil.estagios);
    // plano 1500c · RC-257: «Por pessoa» — dos cartões abertos JÁ carregados (a nota diz isso quando há colunas com mais)
    ui.limpar(resPessoas);
    const porPessoa = L.resumoPorPessoa(S.dados.colunas, S.funil.estagios);
    // plano 2000d · DR-011: ganhos, valor ganho e taxa de ganho por pessoa (dos fechados do período carregados) — o gerente vê quem fecha
    const fech = L.fechadosPorPessoa(S.dados.colunas, S.funil.estagios);
    for (const [chave, f] of fech) if (!porPessoa.linhas.some(p => String(p.dono_id) === chave)) porPessoa.linhas.push({ dono_id: f.dono_id, n: 0, valor: 0, ponderado: 0 });
    if (porPessoa.linhas.length > 1 || (porPessoa.linhas.length === 1 && porPessoa.linhas[0].dono_id != null)) {
      const nomeDe = id => (id == null ? "Sem responsável" : ((k.usuario(id) || {}).nome || "Pessoa removida"));
      // plano 2000d · DR-012: o nome filtra o quadro por essa pessoa (o mesmo do avatar do cartão)
      const celNome = p => {
        const u = p.dono_id != null ? k.usuario(p.dono_id) : null;
        return u ? h("button", { type: "button", class: "link crm-fr-pessoa", title: `Ver só os cartões de ${u.nome}`, on: { click: () => filtrarDono(u) } }, u.nome) : nomeDe(p.dono_id);
      };
      const periodo = S.fechadosDias ? `${S.fechadosDias} dias` : "todos";
      resPessoas.append(h("h3", { class: "crm-fr-pessoas-t" }, "Por pessoa"),
        h("table", { class: "tabela crm-fr-tab crm-fr-tab-pessoas" },
          h("caption", { class: "sr-only" }, `Abertos, valor, previsão ponderada, ganhos e taxa de ganho (${periodo}) por responsável`),
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Responsável"), h("th", { scope: "col", class: "dir" }, "Abertos"), h("th", { scope: "col", class: "dir" }, "Valor"), h("th", { scope: "col", class: "dir" }, "Previsão"),
            h("th", { scope: "col", class: "dir", title: `Fechados como ${k.v.ganhar} (${periodo})` }, k.v.ganhar), h("th", { scope: "col", class: "dir" }, "Valor ganho"), h("th", { scope: "col", class: "dir", title: "Ganhos ÷ fechados" }, "Taxa"))),
          h("tbody", null, porPessoa.linhas.map(p => { const f = fech.get(String(p.dono_id)) || { ganhos: 0, valorGanho: 0, taxa: null }; return h("tr", null, h("th", { scope: "row" }, celNome(p)),
            h("td", { class: "dir", dataset: { rotulo: "Abertos" } }, ui.num(p.n)),
            h("td", { class: "dir", dataset: { rotulo: "Valor" } }, p.valor ? ui.brl(p.valor, { centavos: false }) : "—"),
            h("td", { class: "dir", dataset: { rotulo: "Previsão" }, title: "Valor × chance da etapa" }, p.ponderado ? ui.brl(p.ponderado, { centavos: false }) : "—"),
            h("td", { class: "dir", dataset: { rotulo: k.v.ganhar } }, ui.num(f.ganhos)),
            h("td", { class: "dir", dataset: { rotulo: "Valor ganho" } }, f.valorGanho ? ui.brl(f.valorGanho, { centavos: false }) : "—"),
            h("td", { class: "dir", dataset: { rotulo: "Taxa" } }, f.taxa == null ? "—" : L.pctInteiro(f.taxa))); }))),
        ...(porPessoa.parcial ? [h("p", { class: "sub" }, "Conta só os cartões já carregados nas colunas.")] : [])); // plano 1500c · RX-001: nunca append(null)
    }
    // plano 1500c · RC-294: «Previsão por mês» — pela data de previsão de fechamento dos abertos carregados (sem o campo nos cartões, a tabela não aparece)
    ui.limpar(resMeses);
    const pm = L.previsaoPorMes(S.dados.colunas, S.funil.estagios);
    if (pm.meses.length) {
      resMeses.append(h("h3", { class: "crm-fr-pessoas-t" }, "Previsão por mês"),
        h("table", { class: "tabela crm-fr-tab crm-fr-tab-meses" },
          h("caption", { class: "sr-only" }, "Abertos, valor e previsão ponderada pelo mês da previsão de fechamento"),
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Mês"), h("th", { scope: "col", class: "dir" }, "Abertos"), h("th", { scope: "col", class: "dir" }, "Valor"), h("th", { scope: "col", class: "dir" }, "Ponderado"))),
          h("tbody", null, pm.meses.map(p => h("tr", null, h("th", { scope: "row" }, L.rotuloMes(p.mes)),
            h("td", { class: "dir", dataset: { rotulo: "Abertos" } }, ui.num(p.n)),
            h("td", { class: "dir", dataset: { rotulo: "Valor" } }, p.valor ? ui.brl(p.valor, { centavos: false }) : "—"),
            h("td", { class: "dir", dataset: { rotulo: "Ponderado" }, title: "Valor × chance da etapa" }, p.ponderado ? ui.brl(p.ponderado, { centavos: false }) : "—"))))),
        h("p", { class: "sub" }, [pm.semData ? `${ui.num(pm.semData)} sem previsão de fechamento.` : "", pm.parcial ? "Conta só os cartões já carregados nas colunas." : ""].filter(Boolean).join(" ") || null));
    }
    if (tx.taxa != null) resNota.textContent = `Taxa de ganho ${S.fechadosDias ? `(fechados nos últimos ${S.fechadosDias} dias)` : "(todos os fechados)"}: ${L.pctInteiro(tx.taxa)} — ${ui.num(tx.ganhos)} de ${ui.num(tx.ganhos + tx.perdidos)}. ` + resNota.textContent;
    // plano 1000b · RB-030: as barras «crescem» só na 1ª pintura de cada funil — a recarga silenciosa (pulso de 8 s) redesenha sem animar de novo
    const chaveAnim = String(S.funil && S.funil.id);
    const animar = !reduzido() && S.resumoAnimado !== chaveAnim;
    resLista.classList.toggle("anim", animar);
    S.resumoAnimado = chaveAnim;
  }

  function preencherColuna(estagioId, col) {
    const c = colEls.get(estagioId);
    if (!c) return;
    const e = c.e;
    col = col || colunaDe(estagioId);
    const tot = Number(col.total) || 0;
    c.n.textContent = ui.num(tot);      // plano 2000d · DR-009: «1.250», como o valor ao lado
    c.n.append(h("span", { class: "sr-only" }, tot === 1 ? " cartão" : " cartões"));      // plano 1000b · RB-011
    const valorSoma = e.tipo === "ganho" ? col.soma_valor : col.soma_previsto;
    c.soma.textContent = Number(valorSoma) ? ui.brl(valorSoma, { centavos: false }) : "R$ 0";
    // plano 1500c · RC-066: a soma dos perdidos é o que DEIXOU de entrar — riscada e com a dica, para não parecer dinheiro ganho
    if (e.tipo === "perdido") { c.soma.classList.add("kb-col-soma-perdida"); c.soma.setAttribute("title", "Valor que deixou de entrar (previsto dos perdidos)"); const txt = c.soma.textContent; c.soma.textContent = ""; c.soma.appendChild(h("span", { class: "sr-only" }, "Deixou de entrar: ")); c.soma.appendChild(h("span", null, txt)); }
    // C10: quantos cartões da coluna vieram de anúncio (dos carregados; com «Ver mais» pendente, «2+ de anúncio»)
    const anuncio = L.contarDeAnuncio(col);
    ui.limpar(c.anun);
    c.anun.hidden = !anuncio.n;
    if (anuncio.n) c.anun.appendChild(ui.pilula(anuncio.texto, "anuncio", { variante: "origem", tamanho: "p",
      title: `${anuncio.texto}${anuncio.parcial ? " (entre os cartões carregados)" : ""} nesta etapa` }));
    if (c.slaEl) {      // plano 2000d · DR-066
      const nSla = L.contarSla(col.itens, e.sla_horas);
      c.slaEl.hidden = !nSla;
      c.slaEl.textContent = nSla ? `${ui.num(nSla)} fora do prazo` : "";
      c.sec.classList.toggle("kb-col-alerta", nSla > 0);
    }
    ui.limpar(c.lista);
    for (const it of col.itens) c.lista.appendChild(criarCartao(it, e));
    if (!col.itens.length) c.lista.appendChild(h("div", { class: "kb-vazia", role: "listitem" }, ui.vazio({ tipo: "sem_resultado", titulo: podeMover
      ? (toqueTela ? "Segure um cartão e arraste até aqui" : "Arraste um cartão para cá")      // plano 1000b · RB-022: calculado uma vez, com try
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
    garantirRoving();      // plano 2000d · DR-029
    if (c.periodo) c.periodo.textContent = S.fechadosDias === 0 ? "todos" : `últimos ${S.fechadosDias} dias`;     // plano 1500c · RC-310
    if (e.tipo !== "aberto") {
      c.extra.appendChild(h("div", { class: "kb-antigos" },
        // plano 1000b · RB-031: sem «(mude em Filtros)» — o botão do lado já muda
        S.fechadosDias === 0 ? "Mostrando todos os fechados." : `Fechados nos últimos ${S.fechadosDias} dias.`, " ",
        // plano 1000 (CR-005): a escolha fica gravada (ao voltar ao CRM continua «todos os fechados») e o seletor de visões a reconhece
        h("button", { type: "button", class: "link", on: { click: () => { definirFechados(S.fechadosDias === 0 ? 30 : 0); gravarLocal(); carregar({ silencioso: true }); } } },
          S.fechadosDias === 0 ? "Só os recentes" : "Ver mais antigos")));
    }
  }

  /** plano 2000d · DR-029: o cartão focado vira o único com tabindex=0; se o «atual» sumiu, o 1º cartão do quadro assume. */
  function marcarRoving(id) {
    S.rovingId = id;
    for (const x of quadro.querySelectorAll(".kc")) x.setAttribute("tabindex", x.dataset.id === String(id) ? "0" : "-1");
  }
  function garantirRoving() {
    const cards = quadro.querySelectorAll(".kc");
    if (!cards.length) return;
    if (cards.some ? cards.some(x => x.getAttribute("tabindex") === "0") : [...cards].some(x => x.getAttribute("tabindex") === "0")) return;
    cards[0].setAttribute("tabindex", "0");
    S.rovingId = cards[0].dataset.id;
  }
  /** CR-036: a coluna vazia recolhida (faixa estreita com o nome na vertical); o arrasto continua achando a coluna (.kb-col). */
  function marcarRecolhida(c, col) {
    if (!c || !c.sec) return;
    c.sec.classList.toggle("kb-col-recolhida", !!S.recolher && !(Number(col && col.total) > 0));
  }

  function desenharTotais() {
    if (S.sel.size) pintarSel();
    pintarSemDono();      // plano 2000d · DR-345
    const t = L.previsao(S.dados.colunas, S.funil.estagios);
    pintarNumero(totAbertos, t.abertos, v => ui.num(Math.round(v)));
    pintarNumero(totSoma, t.soma_aberto, v => ui.brl(v, { centavos: false }));
    pintarNumero(totPrev, t.previsao_ponderada, v => ui.brl(v, { centavos: false }));
    const gq = L.ganhosDoQuadro(S.dados.colunas, S.funil.estagios);
    pintarNumero(totGanho, gq.valor, v => ui.brl(v, { centavos: false }));
    rotGanho.textContent = `${k.v.ganhar} · ${S.fechadosDias === 0 ? "todos" : `${S.fechadosDias} dias`}`;
    legGanho.textContent = `${ui.num(gq.n)} ${gq.n === 1 ? k.v.min("negocio") : k.v.min("negocios")} · valor final`;
    const filtrado = contarFiltros() > 0 || !!S.filtro.busca;
    // plano 2000d · DR-046: o título da aba diz o filtro salvo e o funil («Quentes · Pacientes · CRM»)
    try {
      const visao = controlesVisoes && typeof controlesVisoes.nomeAtual === "function" ? controlesVisoes.nomeAtual() : null;
      ctx.titulo([visao, funis().length > 1 && S.funil ? S.funil.nome : null, k.v.crm].filter(Boolean).join(" · "));
    } catch { /* sem título */ }
    totais.classList.toggle("crm-totais-filtrado", filtrado);
    legTot.forEach((s, i) => { s.textContent = filtrado ? (i === 0 ? "com os filtros" : `${LEG_TOT[i]} · com os filtros`) : LEG_TOT[i]; });
    totais.setAttribute("aria-label", filtrado ? "Totais do funil com os filtros ativos" : "Totais do funil");
    // plano 2000d · DR-061: «Mostrando 34 de 210 cartões» (o «de N» quando o servidor manda total_sem_filtro); sem filtro, some
    const nRecorte = S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const semFiltro = Number(S.dados.total_sem_filtro);
    recorte.hidden = !filtrado;
    recorte.textContent = filtrado ? `Mostrando ${ui.num(nRecorte)}${Number.isFinite(semFiltro) && semFiltro >= nRecorte ? ` de ${ui.num(semFiltro)}` : ""} ${nRecorte === 1 && !(semFiltro > 1) ? "cartão" : "cartões"} com os filtros.` : "";
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
  /** plano 2000d · DR-032: o trecho da busca marcado (<mark>) no título e na linha do contato — sem acento e sem maiúscula, como a busca. */
  function marcarBusca(txt) {
    const q = String(S.filtro.busca || "").trim();
    if (!q || /^[0-9\s().+-]+$/.test(q) || !txt) return txt;
    const i = L.semAcento(txt).indexOf(L.semAcento(q));
    if (i < 0) return txt;
    return [txt.slice(0, i), h("mark", { class: "kc-achado" }, txt.slice(i, i + q.length)), txt.slice(i + q.length)].filter(x => x !== "");
  }
  /** plano 2000d · DR-032: busca só de dígitos que achou pelo telefone → os últimos dígitos digitados (ou null). */
  function telAchado(c) {
    const q = String(S.filtro.busca || "").trim();
    const dig = q.replace(/\D/g, "");
    if (!q || !/^[0-9\s().+-]+$/.test(q) || dig.length < 4) return null;
    const tel = String(c.telefone || (c.contato && c.contato.telefone) || "");
    return tel.includes(dig) ? dig.slice(-8) : null;
  }
  function criarCartao(c, e) {
    const titulo = L.tituloCard(c);
    const achouTel = telAchado(c);
    const nomeContato = c.contato && c.contato.nome && c.contato.nome !== titulo ? c.contato.nome : null;
    const sub = [nomeContato, c.servico].filter(Boolean).join(" · ");
    const valor = e.tipo === "ganho" ? (c.valor ?? c.valor_previsto) : c.valor_previsto;
    const sla = e.tipo === "aberto" && L.slaEstourado(c.estagio_em, e.sla_horas);
    const dono = k.usuario(c.dono_id);
    const etqs = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean);
    // plano 1000 (CR-038): etiqueta ou responsável que a base em memória (5 min) ainda não conhece — criados agora por outra pessoa: relê a base
    if ((c.dono_id && !dono) || etqs.length < (c.etiquetas || []).length)
      pedirBaseNova([...(c.dono_id && !dono ? [`u:${c.dono_id}`] : []), ...(c.etiquetas || []).filter(id => !k.etiqueta(id)).map(id => `e:${id}`)]);
    const pont = L.pontuacao(c);
    const origemTxt = L.descricaoOrigem(c);
    const tarefa = c.tarefa && typeof c.tarefa === "object" ? c.tarefa : null;
    // plano 1500c · RC-069: a atrasada diz há quanto tempo venceu («atrasada há 2 dias»)
    const atrasoTxt = tarefa && tarefa.atrasada && tarefa.vence_em ? ui.relativo(tarefa.vence_em) : "";
    const tarefaTxt = tarefa ? (tarefa.atrasada ? `Tarefa atrasada${atrasoTxt ? ` (venceu ${atrasoTxt})` : ""}` : tarefa.vence_em ? `Tarefa ${ui.relativo(tarefa.vence_em)}` : "Tarefa") : "";
    // plano 1500c · RC-051: a palavra do compromisso da vertical (consulta · visita · entrega) e o gênero do negócio
    const cp = L.palavraCompromisso(k.v);
    const Cp = cp.charAt(0).toUpperCase() + cp.slice(1);
    const aNeg = k.v && typeof k.v.art === "function" && k.v.art("negocio") === "a" ? "a" : "o";
    // plano 1500c · RC-073: o cartão perdido diz o motivo
    const motivoTxt = e.tipo === "perdido" ? (((k.motivosPorId ? k.motivosPorId() : {})[c.motivo_perda_id]) || c.motivo_perda_txt || "") : "";
    const consultaTxt = c.consulta_em ? `${ui.dataCurtaBR ? ui.dataCurtaBR(c.consulta_em) : ui.dataBR(c.consulta_em)} ${ui.horaBR(c.consulta_em)}` : "";
    // plano 50 (item 22): barra de tempo na etapa pelo prazo da etapa (sla_horas da base) ou 3/7 dias; avatar do contato; selo da origem sem anúncio
    const faixa = e.tipo === "aberto" ? L.faixaTempoEtapa(c.estagio_em, e.sla_horas) : null;
    // plano 1500c · RC-086: sem contato, o avatar não inventa iniciais do título — fica o ícone neutro
    const nomeAvatar = (c.contato && (c.contato.nome || c.contato.telefone)) || c.nome || c.telefone || null;
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
    const tituloCurto = L.cortarNaPalavra(titulo, 48);      // plano 1500c · RC-088: corta no fim da palavra
    const rotulo = `${tituloCurto}${valor != null ? `, ${ui.brl(valor, { centavos: false })}` : ""}${faixa ? `, ${faixa.texto.toLowerCase()}` : ""}`;
    // plano 1000b · RB-035: «entrou em dd/mm» no detalhe sr-only e na dica do rodapé (não mais no title do cartão inteiro)
    const entrouEm = c.criado_em ? (ui.dataCurtaBR ? ui.dataCurtaBR(c.criado_em) : ui.dataBR(c.criado_em)) : "";
    const novoLead = e.tipo === "aberto" && L.leadNovo(c);      // plano 2000d · DR-072
    const detalhes = [novoLead ? "lead novo" : "", sub, entrouEm ? `entrou em ${entrouEm}` : "", consultaTxt ? `${cp} ${consultaTxt}` : "", semPresenca ? `presença da ${cp} não marcada` : "", semData ? `agendad${aNeg} sem data` : "",
      motivoTxt ? `motivo: ${motivoTxt}` : "",
      tarefaTxt.toLowerCase(), origemTxt ? `origem ${origemTxt}` : "", etqs.length ? `etiquetas ${etqs.map(x => x.nome).join(", ")}` : "",
      pont ? `pontuação ${pont.score} de 100` : "", dono ? `responsável ${dono.nome}` : "",
      c.nao_lidas ? `${c.nao_lidas} ${c.nao_lidas === 1 ? "mensagem não lida" : "mensagens não lidas"}` : ""].filter(Boolean).join(", ");      // plano 1500c · RC-052: singular
    const naoLidasTxt = c.nao_lidas === 1 ? "1 não lida" : `${c.nao_lidas} não lidas`;      // plano 1500c · RX-028: «1 não lida» no selo (não «1 não lidas»)
    const idDet = `kc-d-${cli}-${c.id}`;
    // plano 2000d · DR-029: «tabindex móvel» — só UM cartão do quadro fica na ordem do Tab (o último focado); as setas andam entre eles e o Tab sai do quadro
    const art = h("article", { class: ["kc", novoLead && "kc-novo", S.sel.has(c.id) && "kc-sel", S.pend.has(c.id) && "confirmando salvando", faixa && `kc-prazo-${faixa.nivel}`], role: "listitem", tabindex: String(S.rovingId) === String(c.id) ? "0" : "-1", dataset: { id: c.id }, "aria-roledescription": "cartão",
      "aria-label": rotulo, "aria-describedby": detalhes ? idDet : null, "aria-busy": S.pend.has(c.id) ? "true" : null, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null },
      detalhes ? h("span", { class: "sr-only", id: idDet }, detalhes) : null,
      h("div", { class: "kc-l1" }, nomeAvatar ? ui.avatar(nomeAvatar, idAvatar) : h("span", { class: "kc-avatar-vazio kc-sem-contato", title: "Sem contato" }, ui.icone("usuario")),
        h("span", { class: "kc-t dado-pessoal", title: Array.from(titulo).length > 48 ? titulo : null }, marcarBusca(titulo)),
        novoLead ? h("span", { class: "kc-novo-selo", title: `Chegou ${ui.relativo(c.criado_em)}` }, "novo") : null),      // plano 1500c · RX-080: a mesma régua do corte (caracteres, não unidades UTF-16 — emoji contava 2)
      h("div", { class: "kc-l2" },
        // plano 1500c · RC-074: no ganho, o valor FINAL em destaque (com a dica «valor final»)
        valor != null ? h("b", { class: ["kc-valor", e.tipo === "ganho" && c.valor != null && "kc-valor-final"], title: e.tipo === "ganho" && c.valor != null ? "Valor final" : null }, ui.brl(valor, { centavos: L.temCentavos(valor) }))      // plano 1500c · RC-287: centavos só quando há
          : h("span", { class: ["kc-valor", "sem"] }, "Sem valor"),      // plano 1000b · RB-236: mesma caixa da gaveta
        sub ? h("span", { class: "kc-s dado-pessoal", title: sub }, marcarBusca(sub)) : null,
        // plano 2000d · DR-032: achou pelo telefone (que o cartão não mostra) — o fim do número aparece marcado
        achouTel ? h("span", { class: "kc-s kc-tel-achado dado-pessoal" }, "tel. …", h("mark", { class: "kc-achado" }, achouTel)) : null),      // plano 1500c · UC-030: nome/telefone somem no modo apresentação
      motivoTxt ? h("span", { class: "kc-motivo", title: `Motivo: ${motivoTxt}` }, motivoTxt) : null,
      // plano 1500c · RC-085: a barra é só visual (o tempo já está no rótulo do cartão) — sem role=img repetindo. RC-280: a dica diz quanto falta para o prazo
      faixa ? h("span", { class: ["kc-tempo", faixa.nivel], "aria-hidden": "true", title: `${L.textoDiasEtapa(c.estagio_em)} · ${faixa.texto}${L.textoFaltaPrazo(c.estagio_em, e.sla_horas) ? ` · ${L.textoFaltaPrazo(c.estagio_em, e.sla_horas)}` : ""}` },
        h("i", { style: { "--w": `${Math.round(faixa.pct * 100)}%` } })) : null,
      h("div", { class: "kc-rod" },
        h("span", { class: ["kc-dias", sla && "sla", faixa && faixa.nivel !== "ok" && faixa.nivel], title: e.tipo === "aberto" ? `${L.textoDiasEtapa(c.estagio_em)}${sla ? ` — passou do prazo da etapa (${L.textoPrazoSla(e.sla_horas)})` /* plano 1000b · RB-080 */ : faixa ? ` · ${faixa.texto}` : ""}` : null },
          e.tipo === "aberto" ? L.textoDiasEtapa(c.estagio_em).replace(" na etapa", "") : c.fechado_em ? `${e.tipo === "ganho" ? k.v.ganhar.toLowerCase() : k.v.perder.toLowerCase()} ${ui.relativo(c.fechado_em)}` : ""),     // plano 1000b · RB-009: perdido usa o termo da vertical
        consultaTxt ? h("span", { class: "kc-consulta", title: `${Cp} marcada` }, ui.icone("relogio"), consultaTxt) : null,
        semPresenca ? h("button", { type: "button", class: "kc-presenca", title: `A ${cp} já passou: confirme se compareceu ou faltou`,
          "aria-label": `Confirmar a presença de «${tituloCurto}» na ${cp}`, on: { click: ev => { ev.stopPropagation(); abrir(c.id, { aba: "presenca" }); } } },      // plano 2000d · PX-065
          h("i", { class: "kc-ponto-aten", "aria-hidden": "true" }), h("span", null, "presença")) : null,
        // plano 1500c · RC-065: previsão de fechamento no rodapé (vermelha quando passou) — aparece quando nx_negocios_kanban mandar o campo
        e.tipo === "aberto" && c.previsao_fechamento ? h("span", { class: ["kc-previsao", L.dataPassou(String(c.previsao_fechamento).slice(0, 10)) && "vencida"],
          title: L.dataPassou(String(c.previsao_fechamento).slice(0, 10)) ? "A previsão de fechamento já passou" : "Previsão de fechamento" },
          ui.icone("calendario"), `fecha ${ui.dataCurtaBR ? ui.dataCurtaBR(c.previsao_fechamento) : ui.dataBR(c.previsao_fechamento)}`) : null,
        semData ? h("span", { class: "kc-semdata", title: `Está em «Agendou» sem data: a agenda e o lembrete não sabem dessa ${cp}` }, ui.icone("calendario"), "sem data") : null,
        tarefa ? h("span", { class: ["kc-tarefa", tarefa.atrasada && "atrasada"], title: tarefaTxt }, tarefa.atrasada ? h("i", { class: "kc-ponto-ruim", "aria-hidden": "true" }) : ui.icone("tarefa"),
          h("span", { class: "kc-tarefa-txt" }, tarefa.atrasada ? `atrasada${atrasoTxt ? ` ${atrasoTxt}` : ""}` : tarefa.vence_em ? ui.relativo(tarefa.vence_em) : "")) : null,
        // plano 1500c · RC-084: a pontuação diz o que é (legenda curta «pts» e a faixa na dica)
        pont ? h("span", { class: ["kc-score", pont.faixa], title: `Pontuação do lead (0 a 100): ${pont.score} — ${pont.faixa === "alta" ? "quente" : pont.faixa === "media" ? "morno" : "frio"}${pont.motivo ? ` — ${pont.motivo}` : ""}` }, String(pont.score),
          h("small", { class: "kc-score-un", "aria-hidden": "true" }, "pts")) : null,
        pilOrigem,
        // plano 1000 (CR-212): no desktop a 1ª etiqueta aparece com o NOME (pílula pequena) e as outras como pontos — a cor não é a única pista
        etqs.length ? h("span", { class: "kc-pontos", title: etqs.map(x => x.nome).join(", ") },
          h("span", { class: "kc-etq1", style: k.cor(etqs[0].cor) ? { "--cor": k.cor(etqs[0].cor) } : null }, etqs[0].nome),
          etqs.slice(0, 3).map((x, i) => h("i", { class: ["kc-ponto", i === 0 && "kc-ponto-1"], "aria-hidden": "true", style: k.cor(x.cor) ? { "--cor": k.cor(x.cor) } : null })),
          etqs.length > 3 ? h("small", null, `+${etqs.length - 3}`) : null) : null,
        h("span", { class: "kc-fim" },
          // plano 1000 (CR-213): tocar no avatar filtra o quadro por esse responsável (chip «Responsável: Ana», removível)
          dono ? h("button", { type: "button", class: "kc-dono", title: `Responsável: ${dono.nome} — toque para ver só os cartões de ${dono.nome}`,
            "aria-label": `Ver só os cartões de ${dono.nome}`,      // plano 1500c · RX-027: o rótulo do botão tinha virado comentário (o leitor de tela lia só «botão»)
            on: { click: ev => { ev.stopPropagation(); filtrarDono(dono); } } }, ui.avatar(dono.nome, dono.id)) : h("span", { class: "kc-avatar-vazio", title: "Sem responsável" }, ui.icone("usuario")),
          // alternativa ao arrastar (toque, leitor de tela): a mesma folha «Mover para…» do toque longo
          podeMover ? h("button", { type: "button", class: "bt-icone kc-mover", "aria-label": `Mover «${titulo}» para outra etapa`, title: "Mover para…",
            on: { click: ev => { ev.stopPropagation(); abrirMoverPara(c.id); } } }, ui.icone("opcoes")) : null)),
      // plano 1000 (CR-029): o selo de não lidas leva direto à conversa do contato (antes era só informativo)
      c.nao_lidas ? (idContato != null && comConversas
        ? h("button", { type: "button", class: "kc-naolidas", title: `Abrir conversa (${naoLidasTxt})`, "aria-label": `Abrir conversa de «${tituloCurto}» (${naoLidasTxt})`,
          on: { click: ev => { ev.stopPropagation(); irConversa(idContato); } } }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas))      // plano 2000d · DR-346
        : h("span", { class: "kc-naolidas", title: naoLidasTxt }, String(c.nao_lidas > 99 ? "99+" : c.nao_lidas))) : null,
      // plano 1000 (CR-030): no desktop, ao passar o mouse (ou com o foco no cartão), «Conversa» e «Tarefa» sem abrir a gaveta
      podeMover ? h("span", { class: "kc-rapidas" },
        idContato != null && comConversas ? h("button", { type: "button", class: "bt-icone kc-rapida", dataset: { acao: "conversa" }, "aria-label": `Abrir conversa de «${tituloCurto}»`, title: "Abrir conversa",
          on: { click: ev => { ev.stopPropagation(); irConversa(idContato); } } }, ui.icone("whatsapp")) : null,      // plano 2000d · DR-346
        h("button", { type: "button", class: "bt-icone kc-rapida", dataset: { acao: "tarefa" }, "aria-label": `Nova tarefa para «${tituloCurto}»`, title: "Nova tarefa",
          on: { click: ev => { ev.stopPropagation(); novaTarefa(c, idContato); } } }, ui.icone("tarefa"))) : null);
    // plano 1000 (CR-271): quando o lead entrou, sem abrir a gaveta. plano 1000b · RB-035: na dica do rodapé (kc-dias), não no cartão inteiro
    if (entrouEm) { const dias = art.querySelector(".kc-dias"); if (dias) dias.setAttribute("title", [dias.getAttribute("title"), `Entrou em ${entrouEm}`].filter(Boolean).join(" · ")); }
    art.addEventListener("click", ev => {
      if (S.arrasto && (S.arrasto.moveu || S.arrasto.engoleClique)) return;
      if (S.teclado) return;
      if (ev.target.closest("a, button")) return;
      // plano 1000 (CR-281): Ctrl/⌘ + clique abre o negócio numa nova aba (como um link); (CR-035) Shift + clique seleciona vários para mover
      if (ev.ctrlKey || ev.metaKey) { abrirEmNovaAba(c.id); return; }
      // plano 1000b · RB-205: no modo seleção (aberto pelo «Selecionar vários» da folha «Mover para…», sem Shift no toque) o toque seleciona
      if (podeMover && (ev.shiftKey || (S.modoSel && S.sel.size))) { alternarSel(c.id); return; }
      abrir(c.id);
    });
    // botão do meio do mouse: nova aba também
    art.addEventListener("auxclick", ev => { if (ev.button === 1 && !(ev.target && ev.target.closest && ev.target.closest("a, button"))) { ev.preventDefault(); abrirEmNovaAba(c.id); } });
    art.addEventListener("keydown", ev => teclaCartao(ev, c.id));
    art.addEventListener("focus", () => marcarRoving(c.id));      // plano 2000d · DR-029
    // o toque longo do celular não pode abrir o menu do sistema (copiar/colar, imagem) em cima do cartão
    art.addEventListener("contextmenu", ev => { if (S.arrasto && S.arrasto.toque) ev.preventDefault(); });
    if (podeMover) art.addEventListener("pointerdown", ev => inicioPonteiro(ev, c.id, art));
    return art;
  }

  /** CR-038: no máximo 1× por minuto relê a base (k.recarregarBase) e redesenha os cartões com os nomes/cores novos. */
  let ultimaBaseNova = 0;
  // plano 1000b · RB-012: ids já procurados numa releitura — etiqueta EXCLUÍDA que ficou no cartão continua desconhecida depois de reler,
  // e não faz o quadro reler a base a cada minuto para sempre (só um id novo pede de novo)
  const jaProcurados = new Set();
  function pedirBaseNova(ids = []) {
    const novos = ids.filter(x => !jaProcurados.has(x));
    if (ids.length && !novos.length) return;
    if (typeof k.recarregarBase !== "function" || Date.now() - ultimaBaseNova < 60000) return;
    ultimaBaseNova = Date.now();
    for (const x of novos) jaProcurados.add(x);
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
  // plano 2000d · PX-065: `aba` vai para a gaveta (o «Confirmar a presença» do cartão abre já em Compareceu/Faltou)
  function abrir(id, { aba = null } = {}) {
    lembrar(id);
    const cPrev = cardDe(id);      // plano 2000d · DR-359: título e valor do cartão aparecem na gaveta antes da leitura
    N.abrirNegocio(k, id, { aba, aoMudar: c => { S.meus.add((c && c.id) ?? id); carregar({ silencioso: true }); }, vizinhos: vizinhosDe, aoNavegar: lembrar,
      previa: cPrev ? { titulo: L.tituloCard(cPrev), valor: cPrev.valor ?? null, valor_previsto: cPrev.valor_previsto ?? null, status: cPrev.status } : null });
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
    // plano 1000b · RB-001: sem funil ativo (S.funil null) o «Novo», o «+» e a tecla N avisam em vez de lançar TypeError
    if (!S.funil) { ui.toast("Crie um funil antes.", { tipo: "aten" }); return; }
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
      // plano 1000b · RB-006: resposta vazia (null) não lança — é «não tem mais»
      const temMais = !!(r && r.tem_mais);
      if (!temMais) col.total = col.itens.length;
      else col.total = Math.max(Number(col.total) || 0, col.itens.length);
      preencherColuna(estagioId, col);
      desenharTotais();
      // plano 1000 (CR-022): o botão some quando a coluna é refeita — o foco vai para o 1º cartão novo e o leitor ouve quantos chegaram
      if (novos.length) {
        const lista = (colEls.get(estagioId) || c).lista;
        const primeiro = cartaoEl(novos[0].id, lista) || lista.querySelectorAll(".kc")[antes];
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
    ui.toast(msg, { tipo: "info" });      // plano 1000b · RB-013: o toast já anuncia (ui.toast → anunciar); sem repetir
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
      ui.toast(msg, { tipo: "erro" });      // plano 1000b · RB-013
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
    if (extra === null) {
      preencherColuna(origemCol.estagio_id); if (destCol !== origemCol) preencherColuna(estagioId); focarCartao(id);
      // plano 2000d · DR-064: o cartão voltou — e o aviso diz por quê (a pergunta foi cancelada)
      const faltou = { ganho: "faltou o valor final", perdido: "faltou o motivo", agendada: "faltou a data" }[L.pedidoAoMover(destino, k.estagio(origemCol.estagio_id))];
      ui.toast(`Movimento cancelado${faltou ? `: ${faltou}` : ""}. O cartão ficou onde estava.`, { tipo: "info", ms: 4000 });
      return;
    }
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
      // plano 1500c · RC-293: o aviso com «Desfazer» já fala o movimento — sem o ui.anunciar antes (o leitor ouvia duas vezes) nem o «movido» da gravação
      mov.avisado = true;
      // firmar = a gravação adiada. Se a página sair ou ficar oculta antes dos 7 s, o aviso chama firmar({ saindo: true }) e o pedido vai com keepalive
      const res = await ui.acaoComDesfazer({ texto, reverter: () => desfazerMovimento(mov), firmar: o => efetivar(mov, { saindo: !!(o && o.saindo) }) });
      if (res.estado === "desfeita") return;
      const ok = await efetivar(mov);       // «mantida» (o aviso acabou) ou a tela saiu: agora vai ao servidor
      if (ok && destino.tipo === "ganho" && S.vivo) ofertarPosVenda(cardDe(id) || card);
      return;
    }
    // mesma natureza (aberto → aberto): grava já; o «Desfazer» move de volta
    if (origemCol !== destCol) mov.avisado = true;       // plano 1500c · RC-293: quem fala é o aviso com «Desfazer» abaixo
    const ok = await efetivar(mov);
    if (!ok || origemCol === destCol) return;       // só reordenar dentro da etapa não pede «Desfazer»
    // plano 1000b · RB-008: «movida» quando o registro da vertical é feminino (oportunidade, venda) — também no aviso do leitor
    // plano 1500c · RC-293: os totais novos (CR-268) vão no próprio aviso — ele é a única fala do movimento
    // plano 2000d · DR-028: a posição na coluna nova também («posição 1 de 5»)
    const nDest = (colunaDe(estagioId) || { itens: [] }).itens.length;
    const posTxt = nDest > 1 ? ` (posição ${pos + 1} de ${nDest})` : "";
    ui.acaoComDesfazer({ texto: `«${titulo}» movid${k.v.art("negocio")} para ${destino.nome}${posTxt}.${totaisDoMovimento(mov)}`, reverter: () => desfazerMovimento(mov) });
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
    const el = cartaoEl(id);
    if (!el) return;
    el.classList.remove("assenta", "kc-solto");
    void el.offsetWidth;
    el.classList.add("assenta", "kc-solto");     // kc-solto (plano 50): entrada animada do cartão solto — sobe 6 px e acende a borda da cor da etapa
    el.addEventListener("animationend", () => el.classList.remove("assenta", "kc-solto"), { once: true });
  }

  function marcarConfirmando(id, sim) {
    const el = cartaoEl(id);
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
        const el = cartaoEl(mov.id);
        if (el) { el.classList.add("chegou"); el.classList.add("assenta"); el.classList.add("kc-solto"); }   // a coluna foi redesenhada: a entrada animada continua no cartão novo
        marcarConfirmando(mov.id, false);
        if (!mov.avisado) ui.anunciar(`${L.tituloCard(mov.card)} movid${k.v.art("negocio")} para ${mov.destino.nome}.${totaisDoMovimento(mov)}`);     // plano 1500c · RC-293
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
        ui.toast(`Não foi possível mover: ${msg}`, { tipo: "erro" });      // plano 1000b · RB-013: uma mensagem só (o toast anuncia)
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
      // plano 1000b · RB-059: a etapa já voltou; se a data não voltar, o aviso diz exatamente isso (e o «Desfazer» não é repetido)
      try { await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: mov.id, consulta_em: mov.origem.consulta_em || null } }); }
      catch {
        ui.toast(L.avisoDataNaoVoltou(k.v.vertical), { tipo: "erro" });
        if (S.vivo) await carregar({ silencioso: true });
        // plano 1500c · RC-070: a etapa voltou e a data não — a gaveta abre para conferir a data (o cartão já mostra o selo «sem data» quando ficou sem)
        if (S.vivo) abrir(mov.id);
        return;
      }
    }
    if (S.vivo) await carregar({ silencioso: true });
    ui.anunciar("Movimento desfeito.");
  }

  /** Depois de recarregar o quadro do servidor, os cartões que ainda não chegaram ao servidor voltam para o destino (a tela não pode «pular»). */
  function reaplicarPendentes() {
    // plano 1500c · RC-333: a regra virou função pura testada (cartão que sumiu da recarga — outra pessoa excluiu — não é recriado)
    S.dados.colunas = L.reaplicarPendentes(S.dados.colunas, S.pend.values()).colunas;
  }

  /**
   * A tela vai sair (outra rota, aba fechada, aparelho bloqueado): o que está esperando o fim do aviso vai ao servidor agora.
   * `saindo` = a página está fechando ou ficou oculta: o pedido vai com keepalive (um pedido comum seria cancelado junto com a aba e o Ganho/Perdido se perderia).
   */
  function efetivarPendentes({ saindo = false } = {}) { for (const mov of [...S.pend.values()]) if (!mov.efetivado) { mov.firmadoAoSair = saindo; efetivar(mov, { saindo }); } }
  // plano 1500c · RC-054: a aba escondeu durante os 7 s do «Desfazer» — o Ganho/Perdido já foi gravado (e as automações podem ter saído).
  // Ao voltar, a pessoa fica sabendo; o «Desfazer» passa a mover de volta (sem desfazer o que já foi enviado).
  const avisarFirmados = () => {
    const firmados = [...S.movsFirmados || []];
    S.movsFirmados = new Set();
    if (!firmados.length || !S.vivo) return;
    const t = firmados.length === 1 ? `«${L.tituloCard(firmados[0].card)}» já foi gravado em «${firmados[0].destino.nome}»` : `${firmados.length} movimentos já foram gravados`;
    ui.toast(`${t} quando a aba saiu da tela — mensagens automáticas podem ter saído. «Desfazer» move de volta, mas não desfaz o que já foi enviado.`, { tipo: "info", ms: 9000 });
  };
  const aoEsconder = () => {
    const antes = document.hidden ? [...S.pend.values()].filter(m => !m.efetivado) : [];
    if (document.hidden) efetivarPendentes({ saindo: true });
    if (antes.length) { S.movsFirmados = S.movsFirmados || new Set(); for (const m of antes) S.movsFirmados.add(m); }
    if (!document.hidden) {
      avisarFirmados();
      // plano 2000d · DR-020/052: voltou para a aba depois de um tempo (ou o pulso foi pulado com ela oculta): recarrega já, sem esperar o próximo pulso
      if (S.vivo && S.dados && !emGesto() && (S.pulsoPendente || Date.now() - S.ultimaRecarga > 60000)) { S.pulsoPendente = false; carregar({ silencioso: true }); }
    }
  };
  const aoSairDaPagina = () => efetivarPendentes({ saindo: true });
  document.addEventListener("visibilitychange", aoEsconder);
  addEventListener("pagehide", aoSairDaPagina);

  function focarCartao(id) {
    const c = cartaoEl(id);
    // plano 2000d · DR-068: depois do «Mover para…» o botão ⋮ que tinha o foco foi redesenhado (saiu do documento) — o foco vai para o cartão movido
    const focoPerdido = !document.activeElement || (document.activeElement !== document.body && !document.activeElement.isConnected);
    if (c && (S.teclado || S.focarApos === id || focoPerdido || document.activeElement === document.body || el.contains(document.activeElement))) {
      if (S.focarApos === id) S.focarApos = null;
      try { c.focus({ preventScroll: false }); } catch { c.focus(); }
    }
  }

  /* ============================================================ teclado */
  function teclaCartao(ev, id) {
    const t = S.teclado;
    const art = ev.currentTarget;
    if (!t) {
      if (ev.key === "Enter") { ev.preventDefault(); abrir(id); return; }
      // plano 1000b · RB-024: Shift+Espaço (ou X) seleciona pelo teclado — mover vários deixava de ser só do mouse (antes do Espaço que pega)
      if (podeMover && ((ev.shiftKey && (ev.key === " " || ev.key === "Spacebar")) || ((ev.key === "x" || ev.key === "X") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.target === art))) {
        ev.preventDefault(); alternarSel(id); return;
      }
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
      // plano 1500c · RC-058: Home/End = 1º/último cartão da coluna; Ctrl+Home/End = 1ª/última coluna
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(ev.key) || (["Home", "End"].includes(ev.key) && (!ev.target || ev.target === art))) { ev.preventDefault(); navegar(art, ev.key, { ctrl: !!(ev.ctrlKey || ev.metaKey) }); }
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
      // plano 1000b · RB-206: «Gravando…» só quando não vem pergunta (valor, motivo, data) antes de gravar
      const colOrig = colunaDeCard(id);
      const pede = L.pedidoAoMover(etapaSolta, colOrig ? k.estagio(colOrig.estagio_id) : null);
      ui.anunciar(`Soltou em «${etapaSolta ? etapaSolta.nome : "etapa"}», posição ${indice + 1}.${pede ? "" : " Gravando…"}`);
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

  function navegar(art, tecla, { ctrl = false } = {}) {
    const lista = art.parentElement;
    const cards = [...lista.querySelectorAll(".kc")];
    const i = cards.indexOf(art);
    if ((tecla === "Home" || tecla === "End") && ctrl) {
      const ids = S.funil.estagios.map(e => e.id);
      const ordem = tecla === "Home" ? ids : [...ids].reverse();
      for (const id of ordem) { const c = colEls.get(id); const l = c ? [...c.lista.querySelectorAll(".kc")] : []; if (l.length) return (tecla === "Home" ? l[0] : l[l.length - 1]).focus(); }
      return;
    }
    if (tecla === "Home" && cards.length) return cards[0].focus();
    if (tecla === "End" && cards.length) return cards[cards.length - 1].focus();
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
  /**
   * plano 1500c · RC-330: funil com mais de 8 etapas ganha uma busca no topo da folha «Mover para…» (no celular a lista longa rolava sem fim).
   * Filtra só os itens de etapa (data-etapa); «Outro funil…»/«Selecionar vários» ficam sempre. → o corpo a entregar ao modal.
   */
  function comBuscaEtapas(lista) {
    if (S.funil.estagios.length <= 8) return lista;
    const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nada = h("p", { class: "fraco kb-mover-nada", hidden: true }, "Nenhuma etapa com esse nome.");
    const busca = h("input", { type: "search", enterkeyhint: "search", class: "kb-mover-busca", maxlength: "60" /* plano 2000d · PX-078: busca com limite (colar texto enorme travava a digitação) */, placeholder: "Buscar etapa", "aria-label": "Buscar etapa", autocomplete: "off" });
    busca.addEventListener("input", () => {
      const q = norm(busca.value.trim());
      let vistos = 0;
      for (const li of lista.children) {
        if (!li.dataset || !li.dataset.etapa) continue;
        const ok = !q || norm(li.textContent).includes(q);
        li.hidden = !ok;
        if (ok) vistos++;
      }
      nada.hidden = vistos > 0;
    });
    // plano 1500c · RX-074: Enter com UMA etapa sobrando escolhe ela (teclado: digitar «fech» + Enter)
    busca.addEventListener("keydown", ev => {
      // plano 2000d · PX-087: Esc com texto limpa a busca (e mostra todas) sem fechar a folha · PX-088: seta para baixo vai à 1ª etapa que sobrou
      if (ev.key === "Escape" && busca.value) { ev.preventDefault(); ev.stopPropagation(); busca.value = ""; for (const li of lista.children) if (li.dataset && li.dataset.etapa) li.hidden = false; nada.hidden = true; return; }
      if (ev.key === "ArrowDown") { const b = [...lista.children].filter(li => li.dataset && li.dataset.etapa && !li.hidden).map(li => li.querySelector("button")).find(x => x && !x.disabled); if (b) { ev.preventDefault(); b.focus(); } return; }
      if (ev.key !== "Enter") return;
      const sobra = [...lista.children].filter(li => li.dataset && li.dataset.etapa && !li.hidden).map(li => li.querySelector("button")).filter(b => b && !b.disabled);
      if (sobra.length === 1) { if (ev.preventDefault) ev.preventDefault(); sobra[0].click(); }
    });
    return h("div", { class: "kb-mover-com-busca" }, busca, nada, lista);
  }
  /** Folha com as etapas do funil (cor, nome, quantos cartões; a atual marcada). Escolher = soltar no topo da etapa, com as mesmas perguntas (valor, motivo, data). */
  async function abrirMoverPara(id) {
    const card = cardDe(id);
    if (!card || !podeMover || recusarSePendente(id)) return;
    const atualId = (colunaDeCard(id) || {}).estagio_id;
    let modalApi = null;
    // plano 1000b · RB-010: <ul><li><button> — cada opção é anunciada como BOTÃO dentro de um item de lista (antes: <button role=listitem>)
    const corpo = h("ul", { class: "kb-mover" }, S.funil.estagios.map(e => {
      const col = colunaDe(e.id), n = col ? Number(col.total) || 0 : 0, atual = e.id === atualId;
      return h("li", { dataset: { etapa: e.id } }, h("button", { type: "button", class: ["kb-mover-op", atual && "atual"], disabled: atual, "aria-current": atual ? "step" : null,
        style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, on: { click: () => modalApi && modalApi.fechar(e.id) } },
        h("i", { "aria-hidden": "true" }), h("span", { class: "kb-mover-nome" }, e.nome),
        h("small", null, atual ? "etapa atual" : `${n} ${n === 1 ? "cartão" : "cartões"}`)));
    }));
    // plano 2000d · DR-056: cartão perdido ganha «Reabrir» no topo da folha (volta para a 1ª etapa aberta, com o «Desfazer» de sempre)
    const primeiraAberta = S.funil.estagios.find(e => e.tipo === "aberto");
    if ((k.estagio(atualId) || {}).tipo === "perdido" && primeiraAberta) {
      corpo.prepend(h("li", null, h("button", { type: "button", class: "kb-mover-op kb-mover-reabrir", on: { click: () => modalApi && modalApi.fechar(primeiraAberta.id) } },
        ui.icone("desfazer"), h("span", { class: "kb-mover-nome" }, "Reabrir"), h("small", null, `volta para «${primeiraAberta.nome}»`))));
    }
    // plano 1000 (CR-044): trocar de funil daqui mesmo (antes só pela gaveta → ⋮), com a mesma trava do funil de anúncios
    if (funis().length > 1 && typeof N.moverDeFunil === "function") {
      corpo.appendChild(h("li", null, h("button", { type: "button", class: "kb-mover-op kb-mover-funil", on: { click: () => modalApi && modalApi.fechar(OUTRO_FUNIL) } },
        ui.icone("funil"), h("span", { class: "kb-mover-nome" }, "Outro funil…"), h("small", null, "escolher funil e etapa"))));
    }
    // plano 1000b · RB-205: no celular não há Shift — «Selecionar vários» liga o modo seleção (a barra «Mover para…» em lote aparece)
    corpo.appendChild(h("li", null, h("button", { type: "button", class: "kb-mover-op kb-mover-sel", on: { click: () => modalApi && modalApi.fechar(SELECIONAR) } },
      ui.icone("check"), h("span", { class: "kb-mover-nome" }, "Selecionar vários"), h("small", null, "toque nos outros cartões para juntar"))));
    // plano 1000b · RB-247: no toque os botões rápidos do cartão (só hover/foco) nunca aparecem — «Nova tarefa» e «Abrir conversa» entram na folha
    const idContato = card.contato && card.contato.id != null ? card.contato.id : (card.contato_id ?? null);
    if (toqueTela) {
      if (idContato != null && comConversas) corpo.appendChild(h("li", null, h("button", { type: "button", class: "kb-mover-op kb-mover-rapida", dataset: { acao: "conversa" }, on: { click: () => modalApi && modalApi.fechar(CONVERSA) } },
        ui.icone("whatsapp"), h("span", { class: "kb-mover-nome" }, "Abrir conversa"), h("small", null, "no WhatsApp"))));
      corpo.appendChild(h("li", null, h("button", { type: "button", class: "kb-mover-op kb-mover-rapida", dataset: { acao: "tarefa" }, on: { click: () => modalApi && modalApi.fechar(TAREFA) } },
        ui.icone("tarefa"), h("span", { class: "kb-mover-nome" }, "Nova tarefa"), h("small", null, "para este cartão"))));
    }
    const escolhida = await ui.modal({ titulo: "Mover para…", descricao: L.tituloCard(card), corpo: comBuscaEtapas(corpo), largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
    if (escolhida === TAREFA && S.vivo) { novaTarefa(card, idContato); return; }
    if (escolhida === CONVERSA && S.vivo) { irConversa(idContato); return; }      // plano 2000d · DR-346
    if (escolhida === SELECIONAR && S.vivo) {
      S.modoSel = true;
      if (!S.sel.has(id)) alternarSel(id);
      ui.anunciar("Modo de seleção: toque nos outros cartões para juntar e use «Mover para…» na barra.");
      return;
    }
    if (escolhida === OUTRO_FUNIL && S.vivo) {
      const status = (k.estagio(atualId) || {}).tipo || card.status || "aberto";
      await N.moverDeFunil(k, { ...card, funil_id: S.funil.id, status }, { aoMover: () => { S.meus.add(id); carregar({ silencioso: true }); } });
      return;
    }
    if (escolhida && S.vivo) { S.focarApos = id; soltar(id, escolhida, 0); }      // plano 2000d · DR-068
  }
  /**
   * plano 1000 (CR-035): mover os selecionados de uma vez — a etapa uma vez, o motivo da perda uma vez, as gravações em fila (com o progresso para o
   * leitor de tela) e UM aviso com «Desfazer». Ganho fica de fora (cada um tem o seu valor final); etapa com data vai sem data (cada um tem a sua).
   */
  async function moverSelecionados() {
    const todos = [...S.sel].map(cardDe).filter(Boolean);
    const cards = todos.filter(c => !S.pend.has(c.id));
    // plano 1000b · RB-026: os que ainda estão gravando ficam de fora — e o título diz quantos (antes sumiam do lote em silêncio)
    const foraPend = todos.length - cards.length;
    if (!cards.length && foraPend) { ui.toast(foraPend === 1 ? "O cartão selecionado ainda está gravando. Tente de novo em instantes." : "Os cartões selecionados ainda estão gravando. Tente de novo em instantes.", { tipo: "info" }); return; }
    if (!cards.length || !podeMover) { limparSel(); return; }
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) { ui.toast("Sem internet: nada foi movido. Tente de novo quando a conexão voltar.", { tipo: "erro" }); return; }
    let modalApi = null;
    const corpo = h("ul", { class: "kb-mover" }, S.funil.estagios.map(e =>      // plano 1000b · RB-010: <ul><li><button>
      h("li", { dataset: { etapa: e.id } }, h("button", { type: "button", class: "kb-mover-op", style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, on: { click: () => modalApi && modalApi.fechar(e.id) } },
        h("i", { "aria-hidden": "true" }), h("span", { class: "kb-mover-nome" }, e.nome), h("small", null, e.tipo === "ganho" ? "com o valor previsto de cada" : "")))));      // plano 2000d · DR-017
    const destinoId = await ui.modal({ titulo: `Mover ${cards.length} ${cards.length === 1 ? "cartão" : "cartões"} para…${foraPend ? ` (${foraPend} ainda gravando, ${foraPend === 1 ? "fica" : "ficam"} de fora)` : ""}`, corpo: comBuscaEtapas(corpo), largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }], aoAbrir: a => { modalApi = a; } });
    const destino = destinoId && k.estagio(destinoId);
    if (!destino || !S.vivo) return;
    if (destino.tipo === "ganho") { await ganharEmLote(cards, destino); return; }
    const mover = cards.filter(c => (colunaDeCard(c.id) || {}).estagio_id !== destino.id);
    if (!mover.length) { limparSel(); return; }
    let extra = {};
    // plano 1500c · RC-080/081: o motivo é pedido UMA vez para o lote (qualquer cartão que vá para a perda) e a pergunta fala do lote, não do 1º cartão
    if (mover.some(c => L.pedidoAoMover(destino, k.estagio((colunaDeCard(c.id) || {}).estagio_id)) === "perdido")) {
      const doLote = mover.length === 1 ? mover[0] : { ...mover[0], id: mover[0].id, titulo: `${mover.length} cartões`, nome: `${mover.length} cartões`, contato: null };
      try { extra = await N.prepararMovimento(k, doLote, destino); } catch (e) { k.toastErro(e); return; }
      if (extra === null) { ui.anunciar("Movimento cancelado."); return; }
    }
    const feitos = [], falhas = [];
    const origens = new Map(mover.map(c => [c.id, k.estagio((colunaDeCard(c.id) || {}).estagio_id)]));
    // plano 1500c · RC-055: uma ida ao servidor para o lote (nx_negocios_mover_lote); sem a RPC no servidor, o laço de antes (uma por cartão)
    let viaLote = false;
    if (mover.length > 1 && !S.semLoteRpc) {
      try {
        const r = await k.api.rpcC("nx_negocios_mover_lote", { p_ids: mover.map(c => c.id), p_estagio: destino.id, p_extra: extra || {}, p_req: k.novaReq ? k.novaReq() : null });
        if (!r || !Array.isArray(r.ok)) throw Object.assign(new Error("resposta_invalida"), { status: 404 });      // resposta que não é do lote: volta ao laço
        const ok = new Set(r.ok.map(String));
        for (const c of mover) if (ok.has(String(c.id))) { feitos.push({ c, origem: origens.get(c.id) }); S.meus.add(c.id); }
        for (const f of (r && r.falhas) || []) falhas.push(Object.assign(new Error(f.codigo || "erro"), { codigo: f.codigo || "erro", card: mover.find(c => String(c.id) === String(f.id)) || null }));
        viaLote = true;
        ui.anunciar(`Movidos ${feitos.length} de ${mover.length}.`);
      } catch (e) {
        if (L.rpcAusente(e)) S.semLoteRpc = true;
        else { k.toastErro(e); if (S.vivo) await carregar({ silencioso: true }); return; }
      }
    }
    if (!viaLote) for (let i = 0; i < mover.length; i++) {
      const c = mover[i], origem = origens.get(c.id);
      try { await N.moverNegocio(k, c, destino, { extra }); feitos.push({ c, origem }); S.meus.add(c.id); }
      catch (e) { falhas.push(Object.assign(e, { card: c })); }
      // plano 1000b · RB-027: o leitor ouve o 1º, a cada 5 e o último (antes: um aviso por cartão inundava a fala)
      if (i === 0 || (i + 1) % 5 === 0 || i === mover.length - 1) ui.anunciar(`Movendo ${i + 1} de ${mover.length}…`);
    }
    limparSel();
    if (S.vivo) await carregar({ silencioso: true });
    if (falhas.length) avisarFalhasLote(falhas, "movido");
    if (!feitos.length) return;
    // plano 1000b · RB-025: etapa com data (marco «agendada») em lote vai sem data — o aviso diz isso e o que fazer
    const semData = destino.marco === "agendada" ? ` — sem data marcada: abra cada um para agendar` : "";
    ui.acaoComDesfazer({ texto: `${feitos.length} ${feitos.length === 1 ? "cartão movido" : "cartões movidos"} para «${destino.nome}»${semData}.${destino.tipo !== "aberto" ? " Mensagens automáticas já enviadas não voltam." : ""}`,
      reverter: async () => {
        // plano 1500c · RC-056: tenta TODOS (um erro no meio não deixa metade movida) e diz quantos não voltaram
        let naoVoltaram = 0, primeiroErro = null;
        for (const f of feitos) {
          if (!f.origem) { naoVoltaram++; continue; }
          try {
            await N.moverNegocio(k, { id: f.c.id }, f.origem, { ordem: f.c.ordem ?? null, extra: L.extraDeVolta({ estagio: f.origem, valor: f.c.valor, valor_previsto: f.c.valor_previsto,
              motivo_perda_id: f.c.motivo_perda_id, motivo_perda_txt: f.c.motivo_perda_txt }) });
          } catch (e) { naoVoltaram++; primeiroErro = primeiroErro || e; }
        }
        if (S.vivo) await carregar({ silencioso: true });
        if (naoVoltaram) ui.toast(`${naoVoltaram} de ${feitos.length} não ${naoVoltaram === 1 ? "voltou" : "voltaram"} para a etapa de antes${primeiroErro ? `: ${k.erro(primeiroErro)}` : "."}`, { tipo: "erro" });
      } });
  }
  /** plano 2000d · DR-018: quais falharam (títulos e motivo) e «Selecionar só estes» para tentar de novo. */
  function avisarFalhasLote(falhas, verbo) {
    const comCard = falhas.filter(f => f && f.card);
    const nomes = comCard.slice(0, 3).map(f => `«${L.tituloCard(f.card)}»`).join(", ");
    const resto = comCard.length > 3 ? ` e mais ${comCard.length - 3}` : "";
    const n = falhas.length;
    const texto = `${n} não ${n === 1 ? `foi ${verbo}` : `foram ${verbo}s`}${nomes ? `: ${nomes}${resto}` : ""} — ${k.erro(falhas[0])}`;
    const ids = comCard.map(f => f.card.id).filter(id => cardDe(id));
    ui.toast(texto, { tipo: "erro", acao: ids.length ? { rotulo: "Selecionar só estes", fn: () => { S.sel.clear(); for (const id of ids) S.sel.add(id); S.modoSel = true; pintarSel(); ui.anunciar(`${ids.length} ${ids.length === 1 ? "cartão selecionado" : "cartões selecionados"}.`); } } : null });
  }
  /**
   * plano 2000d · DR-017: ganho em lote — cada cartão fecha com o SEU valor previsto (confirmação com o total). Quem não tem valor previsto fica de fora
   * (cada um precisa do valor final). Um por vez no servidor (as automações do ganho saem por cartão), com o progresso para o leitor de tela.
   */
  async function ganharEmLote(cards, destino) {
    const comValor = cards.filter(c => Number(c.valor_previsto) > 0 && (colunaDeCard(c.id) || {}).estagio_id !== destino.id);
    const semValor = cards.filter(c => !(Number(c.valor_previsto) > 0));
    if (!comValor.length) { ui.toast(`Nenhum dos selecionados tem valor previsto: marque como «${destino.nome}» um por vez, com o valor final de cada.`, { tipo: "info" }); return; }
    const total = comValor.reduce((s, c) => s + Number(c.valor_previsto), 0);
    const ok = await ui.confirmar({ titulo: `Marcar ${comValor.length} como «${destino.nome}»?`,
      texto: `Cada um fecha com o valor previsto — total de ${ui.brl(total, { centavos: L.temCentavos(total) })}.${semValor.length ? ` ${semValor.length} sem valor previsto ${semValor.length === 1 ? "fica" : "ficam"} de fora.` : ""} Mensagens automáticas do ganho podem sair para cada um.`,
      rotulo: `Marcar ${comValor.length}` });
    if (!ok || !S.vivo) return;
    const feitos = [], falhas = [];
    for (let i = 0; i < comValor.length; i++) {
      const c = comValor[i];
      try { await N.moverNegocio(k, c, destino, { extra: { valor: Number(c.valor_previsto) } }); feitos.push(c); S.meus.add(c.id); }
      catch (e) { falhas.push(Object.assign(e, { card: c })); }
      if (i === 0 || (i + 1) % 5 === 0 || i === comValor.length - 1) ui.anunciar(`Marcando ${i + 1} de ${comValor.length}…`);
    }
    limparSel();
    if (S.vivo) await carregar({ silencioso: true });
    if (falhas.length) avisarFalhasLote(falhas, "marcado");
    if (feitos.length) ui.toast(`${feitos.length} ${feitos.length === 1 ? "marcado" : "marcados"} como «${destino.nome}» · ${ui.brl(feitos.reduce((s, c) => s + Number(c.valor_previsto), 0), { centavos: false })}.`, { tipo: "ok" });
  }
  function colunaDeCard(id) { return S.dados.colunas.find(c => c.itens.some(x => x.id === id)) || null; }

  /* ============================================================ mouse e toque (pointer events) */
  let zonasEl = null;
  function inicioPonteiro(ev, id, art) {
    if (ev.button !== 0 || S.teclado || S.arrasto) return;
    if (semRede()) return;      // plano 1500c · RC-264: sem internet o arrasto fica desligado (a faixa explica)
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
    // plano 1500c · RX-041: sem a API de tela cheia (iPhone, navegador da TV) o Esc também sai do modo apresentação
    if (ev.key === "Escape" && el.classList.contains("kb-apresentacao") && !(typeof document !== "undefined" && document.fullscreenElement)
      && !(ev.target && ev.target.closest && ev.target.closest("[role=dialog],dialog"))) { alternarApresentacao(false); ui.anunciar("Saiu da tela cheia."); return; }
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
    if ((ev.key === "n" || ev.key === "N") && !ev.altKey && !ev.ctrlKey && !ev.metaKey && podeMover && S.funil && !S.arrasto && !S.teclado) {     // plano 1000b · RB-001: S.funil
      const a = ev.target;
      const editando = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || (a.closest && a.closest("[role=dialog],dialog")));
      if (!editando && !(typeof document !== "undefined" && document.querySelector && document.querySelector("dialog[open]"))) { ev.preventDefault(); novo({}); return; }
    }
    // «/» foca a busca (como em Pacientes), fora de campos e diálogos
    if (ev.key === "/" && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      const a = ev.target;
      const editando = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || (a.closest && a.closest("[role=dialog],dialog")));
      // plano 2000d · DR-022: com um diálogo aberto (confirmação, gaveta), «/» não puxa o foco para a busca atrás dele
      const dialogoAberto = typeof document !== "undefined" && document.querySelector && document.querySelector("dialog[open]");
      if (!editando && !dialogoAberto) { ev.preventDefault(); busca.focus(); }
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
    if ((f.valor_min != null && Number(f.valor_min) > 0) || f.valor_max != null) n++;      // plano 1500c · RC-059
    if (f.parado_dias) n++;
    if (f.criado_de || f.criado_ate) n++;
    if (f.campo) n++;
    if (f.nao_lidas) n++;      // plano 2000d · DR-024/025/027
    if (f.servico) n++;
    if (f.temperatura) n++;
    if (f.campanha) n++;      // plano 2000d · DR-026
    return n;
  }

  function desenharChips() {
    ui.limpar(chips);
    const f = S.filtro;
    // plano 1500c · RX-045: tirar um chip devolve o foco ao chip seguinte (ou ao «Filtros») e diz o que saiu — antes o foco caía no começo da página
    const focarDepois = i => Promise.resolve(carregar({ silencioso: true })).catch(() => {}).finally(() => {
      const bts = chips.querySelectorAll(".crm-chip button");
      const alvo = bts.length ? bts[Math.min(i, bts.length - 1)] : btFiltros;
      try { if (alvo && alvo.focus) alvo.focus(); } catch { /* ok */ }
    });
    const add = (txt, tirar, dica) => { const i = chips.querySelectorAll(".crm-chip").length; chips.appendChild(h("span", { class: "crm-chip" }, h("span", null, txt, dica ? h("small", null, ` ${dica}`) : null),
      h("button", { type: "button", "aria-label": `Tirar o filtro ${txt}`, on: { click: () => { tirar(); gravarLocal(); focarDepois(i).then(() => {
        // plano 2000d · DR-060: depois de recarregar, o leitor ouve o que saiu E quantos cartões há agora
        const n = S.dados ? S.dados.colunas.reduce((s, c) => s + (Number(c.total) || 0), 0) : null;
        ui.anunciar(`Filtro tirado: ${txt}.${n != null ? ` ${ui.num(n)} ${n === 1 ? "cartão" : "cartões"} no quadro.` : ""}`);
      }); } } }, ui.icone("fechar")))); };
    if (f.dono) add(L.textoChipDono(f.dono, k.usuario(f.dono)), () => delete f.dono);     // plano 1000b · RB-029: «pessoa removida» em vez de «—»
    if (f.etiquetas && f.etiquetas.ids && f.etiquetas.ids.length) {
      // plano 1000b · RB-018: frase («Tem todas: VIP, Retorno»), sem o código do operador; etiqueta apagada vira «etiqueta removida»
      add(L.textoChipEtiquetas(f.etiquetas.op, L.nomesEtiquetasChip(f.etiquetas.ids, k.etiqueta)), () => delete f.etiquetas);
    }
    if (Array.isArray(f.origem) && f.origem.length) add(`Origem: ${f.origem.map(o => L.ROTULO_ORIGEM[o] || o).join(", ")}`, () => delete f.origem);
    if (f.valor_min != null || f.valor_max != null) add(`Valor ${f.valor_min != null ? `≥ ${ui.brl(f.valor_min, { centavos: false })}` : ""}${f.valor_min != null && f.valor_max != null ? " e " : ""}${f.valor_max != null ? `≤ ${ui.brl(f.valor_max, { centavos: false })}` : ""}`, () => { delete f.valor_min; delete f.valor_max; });
    if (f.parado_dias) add(`Parados há ${f.parado_dias}+ dias`, () => delete f.parado_dias);
    if (f.criado_de || f.criado_ate) add(`Criados ${f.criado_de ? `de ${ui.dataBR(f.criado_de)} ` : ""}${f.criado_ate ? `até ${ui.dataBR(f.criado_ate)}` : ""}`.trim(), () => { delete f.criado_de; delete f.criado_ate; });
    if (f.campo) add(L.textoFiltroCampo(f.campo, k.base.campos), () => delete f.campo);
    if (f.nao_lidas) add("Com mensagem não lida", () => delete f.nao_lidas);      // plano 2000d · DR-024
    if (f.servico) add(`${k.v.servico || "Serviço"}: ${f.servico}`, () => delete f.servico);      // plano 2000d · DR-025
    if (f.temperatura) add(`Temperatura: ${{ quente: "quentes", morno: "mornos", frio: "frios" }[f.temperatura] || f.temperatura}`, () => delete f.temperatura);      // plano 2000d · DR-027
    if (f.campanha) add(`Campanha: ${f.campanha}`, () => delete f.campanha);      // plano 2000d · DR-026
    const n = contarFiltros();
    if (n > 0) chips.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p crm-chips-limpar", on: { click: () => {
      const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; gravarLocal();
      ui.anunciar("Filtros limpos.");      // plano 1500c · RX-046: avisa e o foco vai para «Filtros» (o botão clicado some)
      Promise.resolve(carregar({ silencioso: true })).catch(() => {}).finally(() => { try { btFiltros.focus(); } catch { /* ok */ } });
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
    // plano 1000b · RB-020: texto com teclado decimal, lido como a gaveta (L.lerNumero) — «1.500,00» funciona e 75 não fica «inválido» pelo passo de 50
    // plano 1500c · RX-048: o valor já aplicado volta escrito como a pessoa digita («1.500», não «1500»)
    const fmtV = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? (v ?? "") : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
    const vMin = h("input", { type: "text", inputmode: "decimal", maxlength: "18" /* plano 2000d · PX-079: dinheiro com limite de tamanho (o servidor guarda até 12 dígitos) */, enterkeyhint: "done", autocomplete: "off", placeholder: "Mínimo", "aria-label": "Valor mínimo", value: fmtV(f.valor_min) });
    const vMax = h("input", { type: "text", inputmode: "decimal", maxlength: "18" /* plano 2000d · PX-079: dinheiro com limite de tamanho (o servidor guarda até 12 dígitos) */, enterkeyhint: "done", autocomplete: "off", placeholder: "Máximo", "aria-label": "Valor máximo", value: fmtV(f.valor_max) });
    // plano 1000 (CR-010): erro de valor aparece junto do campo (e o popover continua aberto)
    const erroValor = h("small", { class: "ed-erro crm-filtros-erro", role: "alert", id: `crm-fv-${cli}`, hidden: true });
    const parado = h("select", { "aria-label": "Parados há" }, [["", "Qualquer tempo"], ["3", "3 dias ou mais"], ["7", "7 dias ou mais"], ["15", "15 dias ou mais"], ["30", "30 dias ou mais"], ["60", "60 dias ou mais"], ["90", "90 dias ou mais"]]     // plano 1500c · RC-324
      .map(([v, t]) => h("option", { value: v, selected: String(f.parado_dias || "") === v }, t)));
    const de = h("input", { type: "date", "aria-label": "Criados de", value: f.criado_de || "" });
    const ate = h("input", { type: "date", "aria-label": "Criados até", value: f.criado_ate || "" });
    // plano 1500c · RC-327: «Copiar link com estes filtros» — o gerente manda ao vendedor o quadro já filtrado (#/crm?funil=..&f=..; a busca digitada não vai)
    // plano 2000d · DR-003: o link sai do que está NO FORMULÁRIO agora (o mesmo que «Aplicar» leria) — não do filtro de quando o popover abriu
    const btLink = h("button", { type: "button", class: "bt bt-fant bt-p crm-filtros-link", on: { click: () => {
      const r = lerNovo();
      if (!r.nf) { mostrarErro(r); return; }
      const codLink = L.filtroParaLink(r.nf);
      if (!codLink) { ui.toast("Escolha algum filtro para copiar o link.", { tipo: "info" }); return; }
      const base = typeof location !== "undefined" && location ? `${location.origin || ""}${location.pathname || ""}` : "";
      ui.copiar(`${base}#/crm?${S.funil ? `funil=${encodeURIComponent(S.funil.id)}&` : ""}f=${codLink}`, { aviso: "Link com os filtros copiado." });
    } } }, ui.icone("link"), "Copiar link com estes filtros");    // plano 1500c · RC-323: período invertido mostra o erro junto das datas (antes só um aviso que some — e a visão salva perdia o período)
    // plano 2000d · DR-023: «Este mês» / «Mês passado» preenchem as datas (dia de São Paulo)
    const atalhoPeriodo = (rot, tipo) => h("button", { type: "button", class: "bt bt-fant bt-p crm-filtros-periodo", on: { click: () => {
      const p = L.periodoAtalho(tipo, ui.hojeSP()); if (!p) return;
      de.value = p.de; ate.value = p.ate; contarPend();
    } } }, rot);
    // plano 2000d · DR-024/025/027: «só com mensagem não lida», serviço e temperatura (pontuação)
    const soNaoLidas = h("input", { type: "checkbox", checked: !!f.nao_lidas });
    const servicos = L.servicosDoQuadro(S.dados && S.dados.colunas);
    if (f.servico && !servicos.includes(f.servico)) servicos.unshift(f.servico);
    const selServico = servicos.length ? h("select", { class: "sel", "aria-label": k.v.servico || "Serviço" }, h("option", { value: "" }, "Qualquer um"), servicos.map(s => h("option", { value: s, selected: f.servico === s }, s))) : null;
    const selTemp = h("select", { class: "sel", "aria-label": "Temperatura do lead" }, [["", "Qualquer"], ["quente", "Quentes (70+ pts)"], ["morno", "Mornos (40 a 69)"], ["frio", "Frios (até 39)"]]
      .map(([v, t]) => h("option", { value: v, selected: (f.temperatura || "") === v }, t)));
    // plano 2000d · DR-026: campanha do anúncio (aparece quando os cartões trazem a campanha)
    const campanhas = L.servicosDoQuadro(S.dados && S.dados.colunas, L.campanhaDoCard);
    if (f.campanha && !campanhas.includes(f.campanha)) campanhas.unshift(f.campanha);
    const selCampanha = campanhas.length ? h("select", { class: "sel", "aria-label": "Campanha do anúncio" }, h("option", { value: "" }, "Qualquer uma"), campanhas.map(s => h("option", { value: s, selected: f.campanha === s }, s))) : null;
    if (selCampanha) selCampanha.value = f.campanha || "";
    // o valor do <select> também pelo .value (o «Copiar link» lê o formulário antes de qualquer mudança — DR-003)
    parado.value = String(f.parado_dias || ""); selTemp.value = f.temperatura || ""; if (selServico) selServico.value = f.servico || "";
    const erroData = h("small", { class: "ed-erro crm-filtros-erro", role: "alert", id: `crm-fd-${cli}`, hidden: true });
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
      k.base.etiquetas.length ? h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Etiquetas"), segEt,
        Vis.buscaEtiquetas ? Vis.buscaEtiquetas(k, opsEt) : null, opsEt) : null,     // plano 1000b · RB-021: busca com catálogo grande
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Origem"), opsOrig),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Valor (R$)"), h("div", { class: "crm-filtros-linha" }, vMin, vMax), erroValor),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Parados na etapa"), parado),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Criados entre"), h("div", { class: "crm-filtros-linha" }, de, ate),
        h("div", { class: "crm-filtros-linha crm-filtros-atalhos" }, atalhoPeriodo("Este mês", "mes"), atalhoPeriodo("Mês passado", "mes_passado")), erroData),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Mensagens"), h("label", { class: "crm-op" }, soNaoLidas, h("span", null, "Só com mensagem não lida"))),
      selServico ? h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, k.v.servico || "Serviço"), selServico) : null,
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Temperatura"), selTemp),
      selCampanha ? h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Campanha"), selCampanha) : null,
      grupoCampo ? grupoCampo.el : null,
      h("fieldset", { class: "crm-filtros-grupo crm-filtros-fech" }, h("legend", { class: "rotulo" }, "Fechados no quadro"), segFech),
      btLink,
      h("div", { class: "crm-filtros-rod" }, pendTxt, limpar, aplicar));
    let resolvido = false;      // Aplicar/Limpar já trataram: o fechar que vem depois não aplica de novo
    /** O filtro novo do formulário → {nf} | {erro, foco} (sem tocar no estado). */
    function lerNovo() {
      const nf = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}) };
      if (f.dono) nf.dono = f.dono;
      if (et.ids && et.ids.length) nf.etiquetas = { op: et.op || "alguma", ids: et.ids };
      if (orig.size) nf.origem = [...orig];
      const lerV = el => { const t = String(el.value ?? "").trim(); if (t === "") return null; const n = L.lerNumero(t); return n === null ? NaN : n; };
      const mn = lerV(vMin), mx = lerV(vMax);
      if (mn != null && !(mn >= 0)) return { erro: "Valor mínimo inválido: use 0 ou mais.", foco: vMin, valor: true };
      if (mx != null && !(mx >= 0)) return { erro: "Valor máximo inválido: use 0 ou mais.", foco: vMax, valor: true };
      if (mn != null && mx != null && mn > mx) return { erro: "O valor mínimo precisa ser menor ou igual ao máximo.", foco: vMin, valor: true };
      if (de.value && ate.value && de.value > ate.value) return { erro: "A data inicial precisa ser anterior ou igual à final.", foco: de, data: true };     // plano 1500c · RC-323
      if (mn != null && mn > 0) nf.valor_min = mn;      // plano 1500c · RC-059: «≥ R$ 0» não filtra nada — não vira chip nem conta
      if (mx != null && mx >= 0) nf.valor_max = mx;
      if (parado.value) nf.parado_dias = Number(parado.value);
      if (de.value) nf.criado_de = de.value;
      if (ate.value) nf.criado_ate = ate.value;
      if (soNaoLidas.checked) nf.nao_lidas = true;      // plano 2000d · DR-024/025/027
      if (selServico && selServico.value) nf.servico = selServico.value;
      if (selTemp.value) nf.temperatura = selTemp.value;
      if (selCampanha && selCampanha.value) nf.campanha = selCampanha.value;      // plano 2000d · DR-026
      if (grupoCampo) { const c = grupoCampo.ler(); if (c.erro) return { erro: c.erro, foco: null }; if (c.campo) nf.campo = c.campo; }
      else if (S.filtro.campo) nf.campo = S.filtro.campo;
      return { nf };
    }
    /** O erro do formulário junto do campo (valor, datas) ou num aviso — o mesmo para «Aplicar» e para «Copiar link» (DR-003). */
    function mostrarErro(r) {
      if (r.valor) { erroValor.textContent = r.erro; erroValor.hidden = false; r.foco.setAttribute("aria-invalid", "true"); r.foco.setAttribute("aria-describedby", erroValor.id); }
      else if (r.data) { erroData.textContent = r.erro; erroData.hidden = false; for (const x of [de, ate]) { x.setAttribute("aria-invalid", "true"); x.setAttribute("aria-describedby", erroData.id); } }     // plano 1500c · RC-323
      else ui.toast(r.erro, { tipo: "erro" });
      if (r.foco) r.foco.focus();
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
    // plano 1500c · RX-047: Enter num campo de texto/data do popover aplica (antes não fazia nada)
    for (const x of [vMin, vMax, de, ate]) x.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.isComposing) { if (ev.preventDefault) ev.preventDefault(); aplicar.click(); } });
    limpar.addEventListener("click", () => { resolvido = true; const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; gravarLocal(); pop.fechar(); carregar({ silencioso: true }); });
    aplicar.addEventListener("click", () => {
      const r = lerNovo();
      for (const x of [vMin, vMax, de, ate]) x.removeAttribute("aria-invalid");
      erroValor.hidden = true; erroValor.textContent = "";
      erroData.hidden = true; erroData.textContent = "";        // plano 1500c · RC-323
      if (!r.nf) { mostrarErro(r); return; }
      resolvido = true;
      aplicarFech();
      S.filtro = r.nf; gravarLocal(); pop.fechar(); carregar({ silencioso: true });
    });
  }

  /* ============================================================ tempo real */
  const cancelarPulso = ctx.pulso && ctx.pulso.assinar ? ctx.pulso.assinar(() => {
    // plano 1000 (CR-003): só os movimentos ainda NÃO enviados (os 7 s do «Desfazer») seguram o pulso; um já enviado e sem confirmação não pode
    // travar a atualização do quadro (a recarga reaplica o cartão no destino enquanto a conferência roda)
    if (S.vivo && document.hidden) { S.pulsoPendente = true; return; }      // plano 2000d · DR-052: oculta não recarrega; recarrega ao voltar
    if (!S.vivo || S.arrasto || S.teclado || [...S.pend.values()].some(m => !m.efetivado)) return;
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
      // plano 1000b · RB-023: nada do quadro fica vivo depois de sair (rAF da fita, avisos de «movido», ouvintes de rolagem/toque)
      if (rafFita) { cancelAnimationFrame(rafFita); rafFita = 0; }
      for (const t of timers) clearTimeout(t);
      timers.clear();
      quadro.removeEventListener("scroll", aoRolarQuadro, { passive: true });
      quadro.removeEventListener("touchmove", aoToqueMover, { passive: false });
      for (const f of [...S.conferencias]) f();
      if (obsMais) obsMais.disconnect();
      if (S.arrasto) cancelarPonteiro();
      efetivarPendentes();
      document.removeEventListener("visibilitychange", aoEsconder);
      document.removeEventListener("fullscreenchange", aoSairTelaCheia);      // plano 1500c · RC-087
      // plano 1500c · RX-040: trocar de tela com o quadro em tela cheia não deixa a próxima tela presa em tela cheia
      try { if (document.fullscreenElement && (document.fullscreenElement === el || (el.contains && el.contains(document.fullscreenElement))) && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* ok */ }
      try { removeEventListener("online", aoMudarRede); removeEventListener("offline", aoMudarRede); } catch { /* ok */ }      // plano 1500c · RC-264
      removeEventListener("pagehide", aoSairDaPagina);
      document.removeEventListener("keydown", aoTeclaGlobal);
      if (cancelarPulso) cancelarPulso();
      if (cancelarBase) cancelarBase();
      if (controlesVisoes && typeof controlesVisoes.desmontar === "function") controlesVisoes.desmontar();      // plano 2000d · DR-044
    },
  };
}
