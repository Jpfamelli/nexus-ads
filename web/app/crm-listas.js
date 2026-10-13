/* ============================================================
   ÓRBITA — crm-listas.js · frente F4
   T7 Contatos (#/contatos): tabela com busca sem acento, filtros
      (etiquetas alguma/todas/nenhuma, origem, responsável, criados
      entre, com negócio aberto), ordenação, páginas de 50; "+ Novo",
      "Importar" (supervisor+). No celular (M28) a tabela vira uma lista
      compacta (linha de ~72 px com Ligar / Abrir conversa / ⋮ e deslizar
      para agir), Exportar/Importar no ⋮ do cabeçalho, "Novo" flutuante e
      a busca fixa ao rolar.
   Ficha 360 (#/contatos/<id> — página; também em gaveta pelo
      abrirContato): dados editáveis, campos, etiquetas, consentimento,
      RFM, negócios, atendimentos, tarefas, notas e linha do tempo.
   T8 Empresas (#/empresas, #/empresas/<id>).
   Plano 50 (04/10): densidade compacta/confortável lembrada e «último
      contato» relativo com a data na dica (contatos); empresas em cartões
      com contagens e «Ver negócios»/«Ver contatos»; página da empresa com
      resumo e foco na seção pedida (?sec=negocios).
   ============================================================ */

const POR_PAGINA = 50;
/** plano 1000 (CR-105): de onde a ficha foi aberta (hash e página da lista) — o «Voltar» da ficha devolve a pessoa à mesma página. */
let memLista = null;
// plano 1000 (CR-294): «Recentes» era pela data do cadastro — o nome diz isso agora, e o padrão é «Último contato» (quem voltou a falar hoje aparece em cima)
const ORDENS = [["ultimo_contato", "Último contato"], ["recentes", "Cadastrados por último"], ["nome", "Nome (A–Z)"]];
const ORDEM_PADRAO = "ultimo_contato";

/* ============================================================ T7 — lista de contatos */
// celular (≤ 760 px): a busca fixa divide a linha com Filtros e Ordenar, então o texto de ajuda é curto
const pequena = () => { try { return !!(globalThis.matchMedia && globalThis.matchMedia("(max-width: 760px)").matches); } catch { return false; } };

export async function montarContatos(k, el, rota) {
  const { ui, h, L, ctx } = k;
  const Vis = await k.mod("visoes");
  ctx.titulo(k.v.contatos);
  // plano 1000 (CR-024): preferência por CONTA (aparelho compartilhado) e sem a busca digitada; a chave antiga (só da empresa) é lida uma vez e apagada
  const conta = (typeof k.eu === "function" && k.eu()) || "-";
  const chaveLocal = `nx-app-crm-ct-${ctx.cliente.id}-${conta}`;
  const chaveAntiga = `nx-app-crm-ct-${ctx.cliente.id}`;
  let salvo = {};
  try {
    let bruto = localStorage.getItem(chaveLocal);
    if (bruto === null && (bruto = localStorage.getItem(chaveAntiga)) !== null) localStorage.removeItem(chaveAntiga);
    salvo = JSON.parse(bruto || "{}") || {};
  } catch { salvo = {}; }
  const S = { filtro: salvo.filtro && typeof salvo.filtro === "object" ? salvo.filtro : {}, ordem: ORDENS.some(o => o[0] === salvo.ordem) ? salvo.ordem : ORDEM_PADRAO, pagina: 1, seq: 0, vivo: true, total: null };
  delete S.filtro.busca;
  // plano 1000 (CR-105): voltando da ficha pelo «Voltar», a lista reabre na página em que estava
  if (memLista && memLista.voltando && (typeof location === "undefined" || memLista.hash === location.hash) && Date.now() - memLista.em < 30 * 60000) S.pagina = memLista.pagina || 1;
  if (memLista && memLista.voltando) memLista = null;
  // plano 1000 (CR-077): o que veio do LINK (?busca, ?empresa, ?origem, ?criado_de) vale só nesta visita — não é gravado como preferência
  // (antes, abrir «Pacientes» pelo menu depois de «Ver contatos» da empresa continuava filtrado pela empresa)
  const daUrl = {};
  const q = rota.query || {};
  if (q.busca) daUrl.busca = String(q.busca);
  // «Ver pacientes» do cartão da empresa (plano 50, item 30): #/contatos?empresa=<id>&empresa_nome=<nome> já abre filtrado, com o chip removível
  if (q.empresa) { daUrl.empresa_id = q.empresa; daUrl.empresa_nome = q.empresa_nome || ""; }
  // plano 1000 (CR-126): o fim da importação abre a lista de quem acabou de entrar (#/contatos?origem=importacao&criado_de=AAAA-MM-DD)
  if (q.origem && L.ROTULO_ORIGEM[q.origem]) daUrl.origem = [q.origem];
  if (q.criado_de && /^\d{4}-\d{2}-\d{2}$/.test(q.criado_de)) daUrl.criado_de = q.criado_de;
  if (q.etiqueta) daUrl.etiquetas = { op: "alguma", ids: [q.etiqueta] };
  if (Object.keys(daUrl).length) {
    // o link manda: os filtros que a pessoa tinha guardado ficam guardados, mas não se misturam com os do link
    S.filtro = { ...daUrl };
  }
  let controlesVisoes = null;
  const gravar = () => {
    const f = { ...S.filtro };
    delete f.busca;
    for (const [ch, v] of Object.entries(daUrl)) if (JSON.stringify(f[ch]) === JSON.stringify(v)) delete f[ch];
    if (!f.empresa_id) delete f.empresa_nome;
    // com o filtro do link ainda ativo, a preferência guardada fica como estava (o link não a substitui)
    const guardar = Object.keys(daUrl).some(ch => ch !== "busca" && JSON.stringify(S.filtro[ch]) === JSON.stringify(daUrl[ch])) ? (salvo.filtro || {}) : f;
    try { localStorage.setItem(chaveLocal, JSON.stringify({ filtro: guardar, ordem: S.ordem })); } catch { /* ok */ }
    if (controlesVisoes) controlesVisoes.atualizar();
  };
  // densidade da tabela (plano 50, item 27): compacta/confortável, lembrada por empresa neste aparelho
  const chaveDens = `nx-app-crm-ct-dens-${ctx.cliente.id}`;
  let densidade = L.densidadeLista((() => { try { return localStorage.getItem(chaveDens); } catch { return null; } })());
  const aplicarDensidade = () => { el.classList.toggle("crm-dens-compacta", densidade === "compacta"); el.dataset.densidade = densidade; };
  const segDens = ui.segmentado({ opcoes: [{ valor: "confortavel", rotulo: "Confortável" }, { valor: "compacta", rotulo: "Compacta" }], valor: densidade, tipo: "filtro", rotulo: "Densidade da lista", classe: "crm-dens",
    aoMudar: v => { densidade = L.densidadeLista(v); try { localStorage.setItem(chaveDens, densidade); } catch { /* ok */ } aplicarDensidade(); ui.anunciar(densidade === "compacta" ? "Lista compacta." : "Lista confortável."); } });
  aplicarDensidade();

  const sub = h("span");      // a contagem «12 pacientes» entra no subtítulo do ui.cabecalho
  const busca = h("input", { type: "search", placeholder: pequena() ? `Buscar ${k.v.min("contatos")}` : "Buscar por nome, telefone, e-mail ou documento", "aria-label": `Buscar ${k.v.min("contatos")}`, value: S.filtro.busca || "" });
  const aoBuscar = ui.debounce(() => { const q = busca.value.trim(); if (q) S.filtro.busca = q; else delete S.filtro.busca; S.pagina = 1; gravar(); carregar(); }, 320);
  busca.addEventListener("input", aoBuscar);
  const nF = h("span", { class: "crm-filtro-n", hidden: true });
  const btF = h("button", { type: "button", class: "bt bt-sec crm-filtro-bt", "aria-haspopup": "dialog", "aria-label": "Filtros" }, ui.icone("filtro"), h("span", { class: "crm-filtro-txt" }, "Filtros"), nF);
  btF.addEventListener("click", abrirFiltros);
  const selOrdem = h("select", { class: "sel", "aria-label": "Ordenar" }, ORDENS.map(([v, t]) => h("option", { value: v, selected: v === S.ordem }, t)));
  selOrdem.addEventListener("change", () => { S.ordem = selOrdem.value; S.pagina = 1; gravar(); carregar(); });
  const chips = h("div", { class: "crm-chips", "aria-label": "Filtros ativos" });
  const corpo = h("div", { class: "pilha" });
  const pag = h("nav", { class: "ct-pag", "aria-label": "Páginas" });
  controlesVisoes = Vis.controlesVisoes(k, { tipo: "contatos", obterDados: () => ({ filtro: S.filtro, ordem: S.ordem }), aplicar: async dados => {
    S.filtro = dados.filtro || {}; S.ordem = ORDENS.some(o => o[0] === dados.ordem) ? dados.ordem : ORDEM_PADRAO; S.pagina = 1;
    busca.value = S.filtro.busca || ""; selOrdem.value = S.ordem;
    gravar(); await carregar();
    ui.toast("Filtro salvo aplicado; lista reiniciada na primeira página.", { tipo: "ok", ms: 1800 });
  } });

  // plano 1000 (CR-293/292): atalhos «Meus pacientes» e «Sem responsável» ao lado da busca (como «Meus negócios» no quadro), com aria-pressed
  const atalhoDono = (valor, rotulo) => h("button", { type: "button", class: "bt bt-fant bt-p crm-atalho ct-atalho", dataset: { dono: valor }, "aria-pressed": String(S.filtro.dono === valor),
    on: { click: () => { if (S.filtro.dono === valor) delete S.filtro.dono; else S.filtro.dono = valor; S.pagina = 1; gravar(); carregar(); ui.anunciar(S.filtro.dono ? `Filtro: ${rotulo.toLowerCase()}.` : "Filtro de responsável tirado."); } } }, rotulo);
  const atalhosCt = h("div", { class: "crm-atalhos ct-atalhos", "aria-label": "Filtros rápidos" },
    atalhoDono("eu", `${k.v.art("contato") === "a" ? "Minhas" : "Meus"} ${k.v.min("contatos")}`), atalhoDono("sem", "Sem responsável"));
  const marcarAtalhos = () => { for (const b of atalhosCt.querySelectorAll(".ct-atalho")) b.setAttribute("aria-pressed", String(S.filtro.dono === b.dataset.dono)); };
  // plano 1000 (CR-078): no celular estreito o «Ordenar» vira ícone (o select continua lá, transparente: toque abre o seletor nativo) — o texto cortado
  // «Últ…» sumia e a busca ficava espremida
  const ordEnv = h("span", { class: "ct-ord-env", title: "Ordenar" }, selOrdem, h("span", { class: "ct-ord-ic", "aria-hidden": "true" }, ui.icone("ordenar")));
  const fita = h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca), btF, ordEnv, segDens);
  // M28: no celular Exportar/Importar/Novo saem do cabeçalho — viram o ⋮ (aqui) e o botão flutuante
  const maisBt = k.pode("supervisor") ? h("button", { type: "button", class: "bt-icone crm-cab-mais", "aria-label": "Mais ações" }, ui.icone("opcoes")) : null;
  if (maisBt) maisBt.addEventListener("click", () => ui.menu(maisBt, [
    k.pode("admin") ? { rotulo: "Exportar planilha", icone: "baixar", fn: () => exportar(maisBt) } : null,
    { rotulo: "Importar planilha", icone: "camadas", fn: () => ctx.navegar("#/contatos/importar") }]));
  const fab = k.pode("atendente") ? h("button", { type: "button", class: "crm-fab", "aria-label": k.v.novo("contato"), title: k.v.novo("contato"), on: { click: novoContato } },
    ui.icone("mais"), h("span", { class: "crm-fab-txt" }, k.v.novo("contato"))) : null;
  const acoes = [
    maisBt,
    k.pode("admin") ? h("button", { type: "button", class: "bt bt-sec", title: "Baixa uma planilha (CSV) com os filtros atuais",
      on: { click: ev => exportar(ev.currentTarget) } }, ui.icone("baixar"), "Exportar") : null,
    k.pode("supervisor") ? h("a", { class: "bt bt-sec", href: "#/contatos/importar" }, ui.icone("camadas"), "Importar") : null,
    k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: novoContato } }, ui.icone("mais"), k.v.novo("contato")) : null];
  el.append(
    ui.cabecalho({ titulo: k.v.contatos, sub, acoes }),
    h("div", { class: "pilha-p crm-fixa" }, fita, atalhosCt, controlesVisoes.el, chips),
    corpo, pag);
  if (fab) el.appendChild(fab);
  // «último contato» relativo com a data completa na dica e para o leitor de tela (item 27)
  const quando = iso => iso ? h("time", { class: "ct-rel", datetime: iso, title: ui.dataHoraBR(iso), "aria-label": `Último contato em ${ui.dataHoraBR(iso)}` }, ui.relativo(iso)) : null;

  const colunas = [
    // plano 1000 (CR-280): o nome é um link de verdade (Ctrl+clique / botão do meio abrem em nova aba); a linha continua clicável
    { chave: "nome", rotulo: "Nome", principal: true, render: c => h("div", { class: "cel-nome" }, ui.avatar(c.nome || c.telefone, c.id),
      h("div", null, h("a", { class: "ct-nome-link", href: `#/contatos/${c.id}`, on: { click: ev => { if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) { if (ev.stopPropagation) ev.stopPropagation(); return; } lembrarLista(); } } }, h("b", null, L.nomeContato(c))),
        h("small", null, c.cidade || (c.optin_marketing === false ? "Não quer marketing" : L.ROTULO_ORIGEM[c.origem] || "")))) },
    { chave: "telefone", rotulo: "Telefone", render: c => c.telefone ? h("span", { class: "mono" }, ui.telBR(c.telefone)) : null },
    { chave: "email", rotulo: "E-mail" },
    // plano 1000 (CR-085): nome longo de empresa em no máximo 2 linhas (o nome inteiro na dica)
    { chave: "empresa", rotulo: "Empresa", render: c => c.empresa ? h("span", { class: "ct-emp", title: c.empresa.nome }, c.empresa.nome) : null },
    { chave: "etiquetas", rotulo: "Etiquetas", render: c => {
      const e = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean);
      return e.length ? h("div", { class: "ct-etqs" }, e.slice(0, 3).map(x => ui.etiqueta(x)), e.length > 3 ? h("span", { class: "kc-mais-etq" }, `+${e.length - 3}`) : null) : null;
    } },
    // C4: a origem com a pílula padrão (anúncio com a plataforma; site, orgânico, WhatsApp, manual…)
    { chave: "origem", rotulo: "Origem", render: c => { const o = L.origemPilula(c); return o ? ui.pilula(null, o.chave, { variante: "origem", plataforma: o.plataforma, tamanho: "p" }) : (c.origem || null); } },
    { chave: "negocios_abertos", rotulo: `${k.v.negocios} abert${k.v.art("negocio")}s`, alinhar: "dir", render: c => h("span", { class: ["ct-nneg", c.negocios_abertos > 0 && "tem"] }, String(c.negocios_abertos || 0)) },
    { chave: "ultimo_contato_em", rotulo: "Último contato", render: c => quando(c.ultimo_contato_em) },
  ];
  // plano 1000 (CR-084): menu «Colunas» — esconder E-mail, Empresa… (o Nome fica sempre); lembrado por empresa e conta neste aparelho
  const chaveCols = `nx-app-crm-ct-cols-${ctx.cliente.id}-${conta}`;
  const ocultas = new Set((() => { try { const v = JSON.parse(localStorage.getItem(chaveCols) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } })()
    .filter(x => colunas.some(c => c.chave === x && !c.principal)));
  let tab = null, cabsOrd = [], ultimos = null;
  function criarTabela() {
    const vis = colunas.filter(c => !ocultas.has(c.chave));
    tab = ui.tabela({
      rotulo: k.v.contatos,
      colunas: vis,
      aoClicar: c => { lembrarLista(); ctx.navegar(`#/contatos/${c.id}`); },
      vazio: "Nada encontrado com esses filtros.",
    });
    // C9: «Nome» e «Último contato» ordenam no SERVIDOR (p_ordem — a lista é paginada; ordenar só a página na tela mentiria). Clicar de novo volta a «Recentes».
    const ths = tab.el.querySelectorAll("thead th");
    cabsOrd = [];
    ["nome", "ultimo_contato_em"].forEach(chave => {
      const th = ths[vis.findIndex(x => x.chave === chave)];
      if (!th) return;
      const rot = th.textContent;
      const b = h("button", { type: "button", class: "th-ord ct-ord", title: chave === "nome" ? "Ordenar por nome (A–Z)" : "Ordenar pelo último contato (mais recente primeiro)" }, rot, ui.icone("ordenar"));
      b.addEventListener("click", () => {
        S.ordem = L.ordemAoClicar(chave, S.ordem);
        selOrdem.value = S.ordem; S.pagina = 1; gravar(); marcarOrdem(); carregar();
        ui.anunciar(S.ordem === "recentes" ? "Ordenado pelos cadastros mais recentes." : `Ordenado por ${chave === "nome" ? "nome, de A a Z" : "último contato, do mais recente"}.`);
      });
      ui.limpar(th); th.appendChild(b);
      cabsOrd.push({ chave, th });
    });
    marcarOrdem();
  }
  function marcarOrdem() { for (const { chave, th } of cabsOrd) th.setAttribute("aria-sort", L.ariaSortDe(chave, S.ordem)); }
  criarTabela();
  selOrdem.addEventListener("change", marcarOrdem);
  const btCols = h("button", { type: "button", class: "bt bt-sec ct-cols-bt", "aria-haspopup": "dialog", title: "Escolher as colunas da tabela" }, ui.icone("camadas"), "Colunas");
  btCols.addEventListener("click", () => {
    const caixa = h("div", { class: "ct-cols", role: "group", "aria-label": "Colunas da tabela" },
      colunas.filter(c => !c.principal).map(c => {
        const inp = h("input", { type: "checkbox", checked: !ocultas.has(c.chave), dataset: { coluna: c.chave } });
        inp.addEventListener("change", () => {
          if (inp.checked) ocultas.delete(c.chave); else ocultas.add(c.chave);
          try { localStorage.setItem(chaveCols, JSON.stringify([...ocultas])); } catch { /* ok */ }
          const antes = tab.el;
          criarTabela();
          if (ultimos) tab.atualizar(ultimos);
          if (antes.parentElement) { antes.parentElement.insertBefore(tab.el, antes); antes.remove(); }
          ui.anunciar(`Coluna ${c.rotulo} ${inp.checked ? "à mostra" : "escondida"}.`);
        });
        return h("label", { class: "crm-op" }, inp, h("span", null, c.rotulo));
      }));
    ui.flutuante(btCols, caixa, { classe: "flut-crm", largura: "auto" });
  });
  fita.appendChild(btCols);
  const listaM = listaCompacta(k, { aoMudar: () => carregar(), aoAbrir: () => lembrarLista() });

  /** plano 1000 (CR-105): a lista lembra a página de onde a ficha foi aberta — o «Voltar» da ficha volta a ela (history.back). */
  function lembrarLista() { memLista = { hash: typeof location !== "undefined" ? location.hash : "", pagina: S.pagina, em: Date.now(), voltando: false }; }

  // plano 1000 (CR-092): só a forma visível vai para a página (tabela no desktop, lista compacta no celular); trocar a largura troca a forma
  const mqCel = typeof matchMedia === "function" ? matchMedia("(max-width: 760px)") : null;
  const forma = () => (mqCel && mqCel.matches ? listaM : tab);
  const formaNaTela = () => corpo.contains(tab.el) || corpo.contains(listaM.el);
  const trocarForma = () => {
    if (!S.vivo || !ultimos || !formaNaTela()) return;
    const f = forma(), outra = f === tab ? listaM : tab;
    if (corpo.contains(f.el)) return;
    f.atualizar(ultimos);
    corpo.insertBefore(f.el, outra.el); outra.el.remove();
  };
  if (mqCel && typeof mqCel.addEventListener === "function") mqCel.addEventListener("change", trocarForma);

  async function carregar({ silencioso = false } = {}) {
    const minha = ++S.seq;
    desenharChips();
    if (!formaNaTela()) { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("tabela", 8)); }
    else if (!silencioso) forma().el.setAttribute("aria-busy", "true");
    // plano 1000 (CR-093): a 1ª página sem filtros usa o último resultado guardado no aparelho (sem internet a lista ainda abre; o selo do shell avisa)
    const usaCache = S.pagina === 1 && L.filtroVazio(S.filtro) && (S.ordem === ORDEM_PADRAO || S.ordem === "recentes");
    const pintar = r => {
      S.total = r.total;
      S.ultima = Date.now();
      const n = r.total != null ? r.total : r.total_aprox;
      sub.textContent = n != null ? `${ui.num(n)}${r.total == null ? "+" : ""} ${n === 1 ? k.v.min("contato") : k.v.min("contatos")}` : "";
      ui.limpar(corpo);
      if (!r.itens.length && L.filtroVazio(S.filtro) && S.pagina === 1) {
        const fem = k.v.art("contato") === "a";
        corpo.appendChild(ui.vazio({ titulo: `${k.v.nenhum("contato")} ainda.`, tema: "crm",
          texto: `${fem ? "Elas entram sozinhas" : "Eles entram sozinhos"} pelo WhatsApp ou pela importação de planilha.`,
          acao: k.pode("atendente") ? { rotulo: k.v.novo("contato"), fn: novoContato } : null,
          acoes: k.pode("supervisor") ? [{ rotulo: "Importar planilha", fn: () => ctx.navegar("#/contatos/importar") }] : [] }));
        ui.limpar(pag);
        ultimos = null;
        return;
      }
      ultimos = r.itens;
      const f = forma();
      f.el.removeAttribute("aria-busy");
      f.atualizar(r.itens);
      corpo.appendChild(f.el);
      desenharPaginas(r);
    };
    try {
      let doCache = false;
      const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: S.filtro, p_pagina: S.pagina, p_por_pagina: POR_PAGINA, p_ordem: S.ordem },
        usaCache ? { cache: true, aoCache: dc => { if (minha !== S.seq || !S.vivo || formaNaTela() || !dc || !Array.isArray(dc.itens)) return; doCache = true; pintar(dc); } } : undefined);
      if (minha !== S.seq || !S.vivo) return;
      if (silencioso && JSON.stringify(r.itens) === JSON.stringify(ultimos) && formaNaTela()) { S.ultima = Date.now(); return; }
      void doCache;
      pintar(r);
    } catch (e) {
      if (minha !== S.seq || !S.vivo) return;
      if (e && e.comCache && formaNaTela()) return;      // a rede falhou depois de pintar a lista guardada: fica o que está (o shell avisa)
      if (silencioso && formaNaTela()) return;            // recarga do pulso que falhou: a lista continua
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function desenharPaginas(r) {
    ui.limpar(pag);
    const ini = (S.pagina - 1) * POR_PAGINA + 1, fim = ini + r.itens.length - 1;
    const tot = r.total != null ? ui.num(r.total) : `${ui.num(r.total_aprox || fim)}+`;
    const ir = p => { S.pagina = Math.max(1, p); carregar(); el.scrollIntoView({ block: "start" }); };
    // plano 1000 (CR-079): com o total conhecido, «Página __ de N» + primeira/última; com total aproximado, saltos de 10 páginas
    const nPag = r.total != null ? Math.max(1, Math.ceil(r.total / POR_PAGINA)) : null;
    let saltos = null;
    if (nPag && nPag > 2) {
      const campo = h("input", { type: "number", class: "ct-pag-n", min: "1", max: String(nPag), value: String(S.pagina), inputmode: "numeric", "aria-label": `Página (de 1 a ${nPag})` });
      const irCampo = () => { const v = Math.round(Number(campo.value)); if (!Number.isFinite(v) || v < 1 || v > nPag) { campo.value = String(S.pagina); ui.toast(`Escolha uma página de 1 a ${ui.num(nPag)}.`, { tipo: "info" }); return; } if (v !== S.pagina) ir(v); };
      campo.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); irCampo(); } });
      campo.addEventListener("change", irCampo);
      saltos = h("div", { class: "linha ct-pag-ir" },
        h("button", { type: "button", class: "bt bt-fant bt-p", disabled: S.pagina <= 1, "aria-label": "Primeira página", title: "Primeira página", on: { click: () => ir(1) } }, "«"),
        h("label", { class: "ct-pag-campo" }, "Página ", campo, ` de ${ui.num(nPag)}`),
        h("button", { type: "button", class: "bt bt-fant bt-p", disabled: S.pagina >= nPag, "aria-label": "Última página", title: "Última página", on: { click: () => ir(nPag) } }, "»"));
    } else if (!nPag && (r.tem_mais || S.pagina > 10)) {
      saltos = h("div", { class: "linha ct-pag-ir" },
        h("button", { type: "button", class: "bt bt-fant bt-p", disabled: S.pagina <= 10, on: { click: () => ir(S.pagina - 10) } }, "−10 páginas"),
        h("button", { type: "button", class: "bt bt-fant bt-p", disabled: !r.tem_mais, on: { click: () => ir(S.pagina + 10) } }, "+10 páginas"));
    }
    pag.append(...[h("span", { "aria-live": "polite" }, r.itens.length ? `${ui.num(ini)}–${ui.num(fim)} de ${tot}` : "Nenhum resultado"),
      saltos,
      h("div", { class: "linha" },
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: S.pagina <= 1, on: { click: () => ir(S.pagina - 1) } }, ui.icone("seta-esq"), "Anterior"),
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: !r.tem_mais, on: { click: () => ir(S.pagina + 1) } }, "Próxima", ui.icone("seta-dir")))].filter(Boolean));
  }

  function desenharChips() {
    ui.limpar(chips);
    const f = S.filtro;
    let n = 0;
    const add = (txt, tirar) => { n++; chips.appendChild(h("span", { class: "crm-chip" }, h("span", null, txt),
      h("button", { type: "button", "aria-label": `Tirar o filtro ${txt}`, on: { click: () => { tirar(); S.pagina = 1; gravar(); carregar(); } } }, ui.icone("fechar")))); };
    if (f.etiquetas && f.etiquetas.ids && f.etiquetas.ids.length)
      add(`Etiquetas (${f.etiquetas.op || "alguma"}): ${f.etiquetas.ids.map(id => (k.etiqueta(id) || {}).nome).filter(Boolean).join(", ")}`, () => delete f.etiquetas);
    if (Array.isArray(f.origem) && f.origem.length) add(`Origem: ${f.origem.map(o => L.ROTULO_ORIGEM[o] || o).join(", ")}`, () => delete f.origem);
    if (f.dono) add(`Responsável: ${f.dono === "eu" ? "eu" : f.dono === "sem" ? "sem responsável" : (k.usuario(f.dono) || {}).nome || "—"}`, () => delete f.dono);
    if (f.criado_de || f.criado_ate) add(`Cadastrados ${f.criado_de ? `de ${ui.dataBR(f.criado_de)} ` : ""}${f.criado_ate ? `até ${ui.dataBR(f.criado_ate)}` : ""}`.trim(), () => { delete f.criado_de; delete f.criado_ate; });
    if (typeof f.tem_negocio_aberto === "boolean") add(f.tem_negocio_aberto ? `Com ${k.v.min("negocio")} abert${k.v.art("negocio")}` : `Sem ${k.v.min("negocio")} abert${k.v.art("negocio")}`, () => delete f.tem_negocio_aberto);
    if (f.empresa_id) add(`Empresa: ${f.empresa_nome || "escolhida"}`, () => { delete f.empresa_id; delete f.empresa_nome; });
    if (f.optin_marketing === false) add("Não querem marketing", () => delete f.optin_marketing);
    if (f.campo) add(L.textoFiltroCampo(f.campo, k.base.campos), () => delete f.campo);
    if (n) chips.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p crm-chips-limpar", on: { click: () => {
      const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; S.pagina = 1; gravar(); carregar();
    } } }, "Limpar filtros"));
    nF.textContent = String(n); nF.hidden = !n;
    btF.classList.toggle("ativo", n > 0);
    chips.hidden = !n;
    marcarAtalhos();
  }

  function abrirFiltros() {
    const f = JSON.parse(JSON.stringify(S.filtro));
    const et = f.etiquetas || { op: "alguma", ids: [] };
    const orig = new Set(f.origem || []);
    const seg = (itens, atual, aoMudar, rotulo) => {
      const g = h("div", { class: "crm-seg", role: "group", "aria-label": rotulo });
      for (const [v, t] of itens) {
        const b = h("button", { type: "button", "aria-pressed": String(atual !== null && String(atual ?? "") === v) }, t);
        b.addEventListener("click", () => { for (const x of g.children) x.setAttribute("aria-pressed", "false"); b.setAttribute("aria-pressed", "true"); aoMudar(v); });
        g.appendChild(b);
      }
      return g;
    };
    const opsEt = h("div", { class: "crm-opcoes" }, k.base.etiquetas.map(e => {
      const inp = h("input", { type: "checkbox", checked: (et.ids || []).includes(e.id) });
      inp.addEventListener("change", () => { et.ids = inp.checked ? [...new Set([...(et.ids || []), e.id])] : (et.ids || []).filter(x => x !== e.id); });
      return h("label", { class: "crm-op" }, inp, h("span", { style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }, h("i"), e.nome));
    }));
    const opsOrig = h("div", { class: "crm-opcoes" }, Object.entries(L.ROTULO_ORIGEM).map(([v, t]) => {
      const inp = h("input", { type: "checkbox", checked: orig.has(v) });
      inp.addEventListener("change", () => { inp.checked ? orig.add(v) : orig.delete(v); });
      return h("label", { class: "crm-op" }, inp, h("span", null, t));
    }));
    // plano 1000 (CR-011): pessoa escolhida no seletor desmarca «Todos/Meus/Sem» (e o segmentado limpa o seletor)
    let segDono = null;
    const selPessoa = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: f.dono && !["eu", "sem"].includes(f.dono) ? f.dono : null, vazio: "Qualquer pessoa", rotulo: "Responsável",
      aoMudar: id => { f.dono = id || undefined; if (segDono) for (const b of segDono.children) b.setAttribute("aria-pressed", String(!id && b.textContent === "Todos")); } });
    const de = h("input", { type: "date", "aria-label": "Cadastrados de", value: f.criado_de || "" });
    const ate = h("input", { type: "date", "aria-label": "Cadastrados até", value: f.criado_ate || "" });
    // empresa (busca no servidor; escolhe uma)
    let empresa = f.empresa_id ? { id: f.empresa_id, nome: f.empresa_nome } : null;
    const empBusca = h("input", { type: "search", placeholder: "Buscar empresa", "aria-label": "Buscar empresa", autocomplete: "off" });
    const empRes = h("div", { class: "crm-busca-res", role: "listbox", "aria-label": "Empresas encontradas" });
    const empEsc = h("div", { class: "crm-escolhido" });
    function desenharEmp() {
      ui.limpar(empEsc); ui.limpar(empRes);
      empEsc.hidden = !empresa; empBusca.hidden = !!empresa;
      if (empresa) empEsc.append(ui.icone("empresa"), h("span", null, h("b", null, empresa.nome || "Empresa escolhida")),
        h("button", { type: "button", class: "bt-icone", "aria-label": "Tirar a empresa do filtro", on: { click: () => { empresa = null; desenharEmp(); empBusca.focus(); } } }, ui.icone("fechar")));
    }
    let seqEmp = 0;
    empBusca.addEventListener("input", ui.debounce(async () => {
      const q = empBusca.value.trim(), minha = ++seqEmp;
      ui.limpar(empRes);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_empresas_listar", { p_filtro: { busca: q }, p_por_pagina: 6 });
        if (minha !== seqEmp) return;
        if (!r.itens.length) { empRes.appendChild(h("p", { class: "fraco" }, "Nenhuma empresa com esse nome.")); return; }
        for (const e of r.itens) empRes.appendChild(h("button", { type: "button", role: "option", on: { click: () => { empresa = { id: e.id, nome: e.nome }; empBusca.value = ""; desenharEmp(); } } },
          ui.icone("empresa"), h("span", null, h("b", null, e.nome), h("small", null, [e.cidade, `${e.contatos || 0} ${k.v.min(e.contatos === 1 ? "contato" : "contatos")}`].filter(Boolean).join(" · ")))));
      } catch (err) { if (minha === seqEmp) empRes.appendChild(h("p", { class: "fraco" }, k.erro(err))); }
    }, 250));
    desenharEmp();
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limpar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const grupoCampo = Vis.grupoFiltroCampo ? Vis.grupoFiltroCampo(k, { entidade: "contato", atual: f.campo }) : null;     // plano 1000 (CR-013)
    const pendTxt = h("small", { class: "crm-filtros-pend", "aria-live": "polite", hidden: true });                          // plano 1000 (CR-012)
    // plano 1000 (CR-277): no celular, folha inferior com título fixo e «Limpar · Aplicar» fixos (o CSS faz a folha)
    let pop = null;
    const cabFolha = pequena() ? h("div", { class: "crm-filtros-cab" }, h("b", null, "Filtros"),
      h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar os filtros", on: { click: () => pop && pop.fechar() } }, ui.icone("fechar"))) : null;
    const corpoF = h("div", { class: ["crm-filtros", cabFolha && "crm-filtros-folha"] },
      cabFolha,
      k.base.etiquetas.length ? h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Etiquetas"),
        seg([["alguma", "Alguma"], ["todas", "Todas"], ["nenhuma", "Nenhuma"]], et.op || "alguma", v => { et.op = v; }, "Como combinar as etiquetas"), opsEt) : null,
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Origem"), opsOrig),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Responsável"),
        segDono = seg([["", "Todos"], ["eu", "Meus"], ["sem", "Sem responsável"]], ["eu", "sem"].includes(f.dono) ? f.dono : (f.dono ? null : ""), v => { f.dono = v || undefined; selPessoa.value = ""; }, "Responsável"), selPessoa),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, `${k.v.negocios} abert${k.v.art("negocio")}s`),
        seg([["", "Tanto faz"], ["true", "Com"], ["false", "Sem"]], typeof f.tem_negocio_aberto === "boolean" ? String(f.tem_negocio_aberto) : "", v => { f.tem_negocio_aberto = v === "" ? undefined : v === "true"; }, "Com negócio aberto")),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Cadastrados entre"), h("div", { class: "crm-filtros-linha" }, de, ate)),
      h("fieldset", { class: "crm-filtros-grupo" }, h("legend", { class: "rotulo" }, "Empresa"), empEsc, empBusca, empRes),
      grupoCampo ? grupoCampo.el : null,
      h("div", { class: "crm-filtros-rod" }, pendTxt, limpar, aplicar));
    let resolvido = false;
    function lerNovo() {
      const nf = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}) };
      if (et.ids && et.ids.length) nf.etiquetas = { op: et.op || "alguma", ids: et.ids };
      if (orig.size) nf.origem = [...orig];
      if (f.dono) nf.dono = f.dono;
      if (typeof f.tem_negocio_aberto === "boolean") nf.tem_negocio_aberto = f.tem_negocio_aberto;
      if (de.value) nf.criado_de = de.value;
      if (ate.value) nf.criado_ate = ate.value;
      if (de.value && ate.value && de.value > ate.value) return { erro: "A data inicial precisa ser anterior ou igual à final.", foco: de };
      if (empresa) { nf.empresa_id = empresa.id; nf.empresa_nome = empresa.nome; }
      if (S.filtro.optin_marketing === false) nf.optin_marketing = false;
      if (grupoCampo) { const c = grupoCampo.ler(); if (c.erro) return { erro: c.erro }; if (c.campo) nf.campo = c.campo; }
      else if (S.filtro.campo) nf.campo = S.filtro.campo;
      return { nf };
    }
    const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).filter(x => v[x] !== undefined).sort().map(x => `${JSON.stringify(x)}:${canon(v[x])}`).join(",")}}` : JSON.stringify(v));
    const contarPend = () => { const r = lerNovo(); const m = !r.nf || canon(r.nf) !== canon(S.filtro); pendTxt.hidden = !m; pendTxt.textContent = m ? "Mudanças ainda não aplicadas" : ""; };
    corpoF.addEventListener("change", contarPend);
    corpoF.addEventListener("click", ev => { if (ev.target && ev.target.closest && ev.target.closest(".crm-seg, .crm-busca-res, .crm-escolhido")) setTimeout(contarPend, 0); });
    // plano 1000 (CR-012): tocar fora / Esc com mudanças marcadas aplica (no celular é comum tocar fora) — antes descartava tudo sem aviso
    pop = ui.flutuante(btF, corpoF, { classe: cabFolha ? "flut-crm flut-crm-folha" : "flut-crm", largura: "auto", aoFechar: () => {
      if (resolvido || !S.vivo) return;
      resolvido = true;
      const r = lerNovo();
      if (!r.nf) { ui.toast(`Os filtros não foram aplicados: ${r.erro}`, { tipo: "erro" }); return; }
      if (canon(r.nf) === canon(S.filtro)) return;
      S.filtro = r.nf; S.pagina = 1; gravar(); carregar();
      ui.anunciar("Filtros aplicados.");
    } });
    limpar.addEventListener("click", () => { resolvido = true; const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; S.pagina = 1; gravar(); pop.fechar(); carregar(); });
    aplicar.addEventListener("click", () => {
      const r = lerNovo();
      if (!r.nf) { ui.toast(r.erro, { tipo: "erro" }); if (r.foco) r.foco.focus(); return; }
      resolvido = true;
      S.filtro = r.nf; S.pagina = 1; gravar(); pop.fechar(); carregar();
    });
  }

  /** Exportar (admin): páginas de 2.000 do nx_contatos_exportar com os filtros atuais → CSV com ; e BOM. */
  async function exportar(bt) {
    const filtro = { ...S.filtro };
    delete filtro.empresa_nome;
    const itens = [];
    if (S.exportando) { S.exportando.cancelado = true; return; }       // 2º toque no botão durante a exportação = Cancelar
    const job = { cancelado: false };
    S.exportando = job;
    // plano 1000 (CR-076): o progresso aparece NO botão («Exportando… 6.000 de ~20.000») e o mesmo botão cancela
    const noBotao = !!bt && !bt.classList.contains("crm-cab-mais");     // o ⋮ do celular continua ícone: lá o progresso vai só para o leitor de tela
    const txtOriginal = noBotao ? [...(bt.childNodes || bt.children || [])] : [];
    const estimado = S.total != null ? S.total : null;
    const progresso = n => {
      if (!noBotao || !bt.isConnected) return;
      bt.textContent = `Exportando… ${ui.num(n)}${estimado ? ` de ~${ui.num(estimado)}` : ""} · Cancelar`;
      bt.setAttribute("aria-label", `Exportando ${n} ${k.v.min("contatos")}. Toque para cancelar.`);
    };
    let completo = false;
    try {
      progresso(0);
      for (let p = 1; p <= 200; p++) {
        if (!S.vivo || job.cancelado) break;
        const r = await k.api.rpcC("nx_contatos_exportar", { p_filtro: filtro, p_pagina: p });
        if (!S.vivo || job.cancelado) break;
        itens.push(...(r.itens || []));
        progresso(itens.length);
        if (!r.tem_mais) { completo = true; break; }
        ui.anunciar(`Exportando… ${itens.length} ${k.v.min("contatos")} até agora.`);
      }
    } catch (e) { k.toastErro(e); return; }
    finally {
      S.exportando = null;
      if (noBotao && bt.isConnected) { bt.textContent = ""; bt.append(...txtOriginal); bt.removeAttribute("aria-label"); }
    }
    // plano 1000 (CR-075): parou no meio (saiu da tela, cancelou ou bateu no limite de páginas) → NÃO baixa uma planilha parcial como se fosse completa
    if (!completo) {
      ui.toast(job.cancelado ? "Exportação cancelada. Nenhum arquivo foi baixado."
        : !S.vivo ? `Exportação interrompida ao sair da tela (${ui.num(itens.length)} ${k.v.min("contatos")} lidos): nenhum arquivo foi baixado.`
          : `Exportação interrompida em ${ui.num(itens.length)} ${k.v.min("contatos")}: nenhum arquivo foi baixado. Use filtros para exportar em partes.`, { tipo: "info" });
      return;
    }
    if (!itens.length) { ui.toast("Nada para exportar com esses filtros.", { tipo: "info" }); return; }
    const { cabecalho, linhas } = L.linhasExportacao(itens, k.base.campos);
    const url = URL.createObjectURL(new Blob([L.gerarCSV(cabecalho, linhas)], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: `${k.v.min("contatos")}-${ui.hojeSP()}.csv`, hidden: true });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ui.toast(`${ui.num(itens.length)} ${itens.length === 1 ? k.v.min("contato") : k.v.min("contatos")} na planilha.`, { tipo: "ok" });
  }

  async function novoContato() {
    const c = await formContato(k);
    if (c) { ui.toast(`${k.v.contato} cadastrad${k.v.art("contato")}.`, { tipo: "ok" }); ctx.navegar(`#/contatos/${c.id}`); }
  }

  const aoTeclaBusca = ev => {
    const alvo = ev.target;
    const editando = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.closest?.("[role=dialog],dialog"));
    if (ev.key === "/" && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !editando) { ev.preventDefault(); busca.focus(); }
    else if (ev.key === "Escape" && alvo === busca && busca.value) { busca.value = ""; aoBuscar(); }
  };
  document.addEventListener("keydown", aoTeclaBusca);
  await carregar();
  // plano 1000 (CR-189): «Exportar planilha» da paleta chega com ?exportar=1 — exporta com os filtros guardados e tira o ?exportar do endereço
  if (q.exportar === "1" && k.pode("admin") && S.vivo) {
    try { if (typeof history !== "undefined" && typeof location !== "undefined") history.replaceState(history.state, "", `${location.pathname}${location.search}#/contatos`); } catch { /* ok */ }
    exportar(acoes.find(b => b && b.classList && !b.classList.contains("crm-cab-mais") && /Exportar/.test(b.textContent || "")) || null);
  }
  // plano 1000 (CR-087): lead novo pelo WhatsApp aparece sozinho — no pulso, só na 1ª página em «Recentes» e sem busca, no máximo a cada 30 s
  const cancelarPulso = ctx.pulso && typeof ctx.pulso.assinar === "function" ? ctx.pulso.assinar(() => {
    if (!S.vivo || document.hidden || S.pagina !== 1 || !["recentes", ORDEM_PADRAO].includes(S.ordem) || S.filtro.busca || S.exportando) return;
    if (Date.now() - (S.ultima || 0) < 30000) return;
    if (document.querySelector("dialog[open]")) return;
    const a = document.activeElement;
    if (a && a !== document.body && corpo.contains(a)) return;      // a lista seria refeita debaixo do foco
    carregar({ silencioso: true });
  }) : null;
  return { desmontar() { S.vivo = false; S.seq++; document.removeEventListener("keydown", aoTeclaBusca); if (cancelarPulso) cancelarPulso();
    if (mqCel && typeof mqCel.removeEventListener === "function") mqCel.removeEventListener("change", trocarForma); } };
}

/* ------------------------------------------------------------ lista compacta do celular (M28) */
/**
 * listaCompacta(k, {aoMudar}) → {el, atualizar(itens)}. Em ≤ 760 px a CSS troca a tabela por esta lista: linha de ~72 px com avatar, nome,
 * «telefone · cidade», UMA pílula (origem do anúncio, senão a 1ª etiqueta, senão a origem), Ligar (tel:), Abrir conversa e ⋮. Tocar na linha abre a ficha.
 * Deslizar: direita = nova tarefa, esquerda = nova oportunidade. Gesto e botão chamam a MESMA função (`executar`); L.acoesDoContato diz quais
 * ações existem e que lado leva a qual (o ⋮ sempre tem as duas, para quem não desliza).
 */
export function listaCompacta(k, { aoMudar, aoAbrir }) {
  const { ui, h, L, ctx } = k;
  const pode = k.pode("atendente");
  const comConversas = !!(ctx.temModulo && ctx.temModulo("conversas"));
  const ROT = { abrir: ["Abrir ficha", "contato"], tarefa: ["Nova tarefa", "tarefa"], negocio: [k.v.novo("negocio"), "funil"] };
  const FUNDO = { tarefa: "Tarefa", negocio: k.v.negocio };
  const raiz = h("div", { class: "ct-lista-env" });
  if (aoAbrir) raiz.addEventListener("click", ev => { if (ev.target && ev.target.closest && ev.target.closest(".ct-abrir")) aoAbrir(); });

  async function executar(id, c) {
    if (id === "abrir") { if (aoAbrir) aoAbrir(); ctx.navegar(`#/contatos/${c.id}`); return; }
    try {
      if (id === "tarefa") {
        const T = await k.mod("tarefas");
        const t = await T.formTarefa(k, null, { contato_id: c.id });
        if (t) ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 });
      } else if (id === "negocio") {
        const N = await k.mod("negocio");
        await N.novoNegocio(k, { contato_id: c.id }, { aoCriar: () => aoMudar() });
      }
    } catch (e) { k.toastErro(e); }
  }

  function linha(c) {
    const nome = L.nomeContato(c);
    const sub = [c.telefone ? ui.telBR(c.telefone) : null, c.cidade, c.ultimo_contato_em ? ui.relativo(c.ultimo_contato_em) : null].filter(Boolean).join(" · ")
      || (c.optin_marketing === false ? "Não quer marketing" : L.ROTULO_ORIGEM[c.origem] || "");
    const etq = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean)[0];
    // C4: anúncio (com a plataforma) vence; depois a 1ª etiqueta; senão a origem — sempre a pílula padrão de origem
    const orig = L.origemPilula(c, { manual: false });
    const pilOrig = orig ? ui.pilula(null, orig.chave, { variante: "origem", plataforma: orig.plataforma, tamanho: "p" }) : null;
    const pil = orig && orig.chave === "anuncio" ? pilOrig : etq ? ui.etiqueta(etq) : pilOrig;
    const A = L.acoesDoContato({ pode, conversas: comConversas, telefone: !!L.hrefTel(c.telefone) });
    const mais = h("button", { type: "button", class: "bt-icone ct-bt", "aria-label": `Mais ações para ${nome}`, title: "Mais ações" }, ui.icone("opcoes"));
    mais.addEventListener("click", () => ui.menu(mais, A.menu.map(id => ({ rotulo: ROT[id][0], icone: ROT[id][1], fn: () => executar(id, c) }))));
    const frente = h("div", { class: "ct-linha" },
      h("a", { class: "ct-abrir", href: `#/contatos/${c.id}` }, ui.avatar(c.nome || c.telefone, c.id),
        h("span", { class: "ct-txt" }, h("b", { class: "ct-nome" }, nome), h("small", { class: "ct-sub" }, sub), pil)),
      h("div", { class: "ct-bts" },
        A.botoes.includes("ligar") ? h("a", { class: "bt-icone ct-bt", href: L.hrefTel(c.telefone), "aria-label": `Ligar para ${nome}`, title: "Ligar" }, ui.icone("telefone")) : null,
        A.botoes.includes("conversa") ? h("a", { class: "bt-icone ct-bt", href: `#/conversas?contato=${c.id}`, "aria-label": `Abrir conversa com ${nome}`, title: "Abrir conversa" }, ui.icone("whatsapp")) : null,
        mais));
    const fundo = (lado, id) => id ? h("div", { class: `ct-fundo ct-fundo-${lado}`, "aria-hidden": "true" }, ui.icone(ROT[id][1]), h("span", null, FUNDO[id])) : null;
    const li = h("li", { class: "ct-li", dataset: { id: c.id } }, fundo("d", A.direita), fundo("e", A.esquerda), frente);
    ui.deslizar(frente, { direita: A.direita ? () => executar(A.direita, c) : undefined, esquerda: A.esquerda ? () => executar(A.esquerda, c) : undefined });
    return li;
  }

  return {
    el: raiz,
    atualizar(itens) {
      ui.limpar(raiz);
      if (!itens.length) { raiz.appendChild(ui.vazio({ tipo: "sem_resultado", titulo: "Nada encontrado com esses filtros." })); return; }
      raiz.appendChild(h("ul", { class: "ct-lista", role: "list", "aria-label": k.v.contatos }, itens.map(linha)));
    },
  };
}

/* ------------------------------------------------------------ formulário de contato novo */
export async function formContato(k, { nome = "", telefone = "" } = {}) {
  const { ui, h, L } = k;
  const N = await k.mod("negocio");
  const campos = L.camposDe(k.base.campos, "contato").filter(c => c.obrigatorio);
  // plano 1000 (CR-222): etiquetas e responsável já no cadastro (antes era preciso abrir a ficha depois). O seletor só guarda (grava no «Cadastrar»): emite na hora.
  let etiquetas = [];
  const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas: [], rotulo: "Etiquetas", podeCriar: nome => k.criarEtiqueta(nome), aoMudar: ids => { etiquetas = ids; }, debounceMs: 0 });
  const dono = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: null, rotulo: "Responsável" });
  dono.name = "dono_id";
  const form = h("form", { class: "crm-form", novalidate: true },
    h("div", { class: "crm-form-2" },
      h("div", { class: "inteiro" }, ui.campo({ rotulo: "Nome", nome: "nome", valor: nome, max: 160, autocomplete: "off" })),
      ui.campo({ rotulo: "Telefone / WhatsApp", nome: "telefone", tipo: "tel", valor: telefone, placeholder: "(12) 99830-3030", autocomplete: "off", validar: "telefone" }),
      ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "off" }),
      ui.campo({ rotulo: "Origem", nome: "origem", tipo: "select", valor: "manual", opcoes: L.origensManuais().map(([valor, rotulo]) => ({ valor, rotulo })) }),     // plano 1000 (CR-094): sem «Anúncio» (nem «Importação») à mão
      ui.campo({ rotulo: "Cidade", nome: "cidade", max: 80 }),
      h("div", { class: "campo" }, h("label", null, "Responsável"), dono)),
    h("div", { class: "pilha-p" }, h("span", { class: "campo-rot" }, "Etiquetas"), etq),
    ...campos.map(c => N.campoPersonalizado(k, c, null)),
    h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true }));
  const status = form.querySelector(".crm-status");
  // M24: o aviso de cadastro já existente aparece enquanto digita o telefone (não só depois de salvar)
  let apiModal = null;
  const caixaDup = N.avisoDuplicado(k, form.querySelector("[name=telefone]"), { aoUsar: achado => { if (apiModal) apiModal.fechar(null); k.ctx.navegar(`#/contatos/${achado.id}`); } });
  form.querySelector("[name=telefone]").closest(".campo").appendChild(caixaDup);
  let reqAtual = null, reqConteudo = "";   // M25: uma chave por intenção; erro ambíguo repete com a MESMA chave
  return ui.modal({
    titulo: k.v.novo("contato"), corpo: form, aoAbrir: a => { apiModal = a; },
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Cadastrar", tipo: "primario", fn: async api => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome && !d.telefone && !d.email) { ui.marcarErro(form, "nome", "Informe o nome, o telefone ou o e-mail."); return false; }
        if (d.telefone && !L.normalizarTelefone(d.telefone)) { ui.marcarErro(form, "telefone", "Telefone inválido. Use DDD + número."); return false; }
        const { valores, erros } = N.lerCamposPersonalizados(k, form, campos);
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
        const p = { nome: d.nome || null, telefone: d.telefone || null, email: d.email || null, origem: d.origem, cidade: d.cidade || null,
          ...(etiquetas.length ? { etiquetas } : {}), ...(dono.value ? { dono_id: dono.value } : {}), ...(campos.length ? { campos: valores } : {}) };
        try {
          const conteudo = JSON.stringify(p);
          if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await k.escrever("nx_contato_salvar", { p_contato: p }, { req: reqAtual, aoStatus: txt => { status.textContent = txt; status.hidden = false; } });
          status.hidden = true;
          return resultado;
        }
        catch (e) {
          status.hidden = true;
          if (e && e.ambigua) { api.erro("Não foi possível confirmar se foi salvo. Toque em «Cadastrar» de novo: é seguro, não duplica."); return false; }
          if (e && e.codigo === "telefone_em_uso" && /^\d+$/.test(String(e.hint || ""))) {
            api.erro(`${k.erro(e)} Abrindo o cadastro existente…`);
            setTimeout(() => { api.fechar(null); k.ctx.navegar(`#/contatos/${e.hint}`); }, 900);
            return false;
          }
          api.erro(k.erro(e)); return false;
        }
      } },
    ],
  });
}

/* ============================================================ ficha 360 */
export async function montarFicha(k, el, id, { gaveta = null, aoMudar } = {}) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  const T = await k.mod("tarefas");
  let vivo = true;
  const idNum = Number(id);

  let ultimoJson = "", ultimaLeitura = 0;
  async function carregar() {
    ui.limpar(el);
    el.appendChild(ui.esqueleto("cartoes", 4));
    try {
      const d = await k.api.rpcC("nx_contato_ver", { p_id: idNum });
      if (!vivo) return;
      ultimoJson = JSON.stringify(d); ultimaLeitura = Date.now();
      desenhar(d);
    } catch (e) {
      if (!vivo) return;
      ui.limpar(el);
      if (e && e.codigo === "contato_nao_encontrado") {
        el.appendChild(ui.vazio({ titulo: "Cadastro não encontrado", texto: "Ele pode ter sido removido ou você não tem acesso a ele.", icone: "contato",
          acao: gaveta ? { rotulo: "Fechar", fn: () => gaveta.fechar() } : { rotulo: `Ver ${k.v.min("contatos")}`, fn: () => ctx.navegar("#/contatos") } }));
      } else el.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function desenhar(d) {
    const c = d.contato;
    const pode = k.pode("atendente");
    ui.limpar(el);
    const nomeOuTipo = c.nome || (c.telefone && ui.telBR(c.telefone)) || c.email || k.v.contato;
    if (!gaveta) ctx.titulo(nomeOuTipo);
    else gaveta.trocarTitulo(nomeOuTipo);
    const avisar = () => { if (aoMudar) try { aoMudar(c); } catch { /* ok */ } };
    async function salvar(chaves) {
      const r = await k.api.rpcC("nx_contato_salvar", { p_contato: { id: c.id, ...chaves } });
      Object.assign(c, r);
      avisar();
      return r;
    }
    const conv = (d.conversas || []).find(x => x.status !== "resolvida");

    /** plano 1000 (CR-095): bloco «Empresa» da ficha — a empresa ligada (link para a página dela + «Tirar da empresa») ou a busca para ligar uma. */
    function campoEmpresa() {
      let empresa = d.empresa || c.empresa || null;
      const dd = h("dd", { class: "fx-empresa" });
      const msg = h("small", { class: "ed-erro", role: "alert", hidden: true });
      async function ligar(nova) {
        const antes = empresa;
        msg.hidden = true;
        try {
          await salvar({ empresa_id: nova ? nova.id : null });
          empresa = nova; desenharEmp();
          ui.toast(nova ? `Ligad${k.v.art("contato")} à empresa «${nova.nome}».` : `Tirad${k.v.art("contato")} da empresa.`, { tipo: "ok", ms: 2000 });
        } catch (e) { empresa = antes; desenharEmp(); msg.textContent = k.erro(e); msg.hidden = false; }
      }
      function desenharEmp() {
        ui.limpar(dd);
        if (empresa && empresa.id != null) {
          dd.append(h("div", { class: "crm-escolhido" }, ui.icone("empresa"), h("a", { class: "link", href: `#/empresas/${empresa.id}` }, empresa.nome || "Empresa"),
            pode ? h("button", { type: "button", class: "bt bt-fant bt-p fx-emp-tirar", on: { click: () => ligar(null) } }, "Tirar da empresa") : null));
          return;
        }
        if (!pode) { dd.append(h("span", { class: "fraco" }, "Sem empresa")); return; }
        const busca = h("input", { type: "search", class: "ed fx-emp-busca", placeholder: "Buscar empresa para ligar", "aria-label": "Buscar empresa para ligar", autocomplete: "off" });
        const res = h("div", { class: "crm-busca-res", role: "listbox", "aria-label": "Empresas encontradas" });
        let seqE = 0;
        busca.addEventListener("input", ui.debounce(async () => {
          const q = busca.value.trim(), minha = ++seqE;
          ui.limpar(res);
          if (q.length < 2) return;
          try {
            const r = await k.api.rpcC("nx_empresas_listar", { p_filtro: { busca: q }, p_por_pagina: 6 });
            if (minha !== seqE) return;
            const itensE = (r && r.itens) || [];
            if (!itensE.length) { res.appendChild(h("p", { class: "fraco" }, "Nenhuma empresa com esse nome. Cadastre em Empresas.")); return; }
            for (const e of itensE) res.appendChild(h("button", { type: "button", role: "option", on: { click: () => ligar({ id: e.id, nome: e.nome }) } },
              ui.icone("empresa"), h("span", null, h("b", null, e.nome), e.cidade ? h("small", null, e.cidade) : null)));
          } catch (err) { if (minha === seqE) res.appendChild(h("p", { class: "fraco" }, k.erro(err))); }
        }, 250));
        dd.append(busca, res);
      }
      desenharEmp();
      return h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Empresa"), dd, msg);
    }

    /* cabeçalho */
    const hojeFx = ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10);
    const aniv = c.nascimento && L.aniversario ? L.aniversario(c.nascimento, hojeFx) : null;
    const idade = c.nascimento && L.idadeEm ? L.idadeEm(c.nascimento, hojeFx) : null;
    const nomeH = h("h1", null, L.nomeContato(c));
    const menuBt = h("button", { type: "button", class: "bt-icone", "aria-label": "Mais ações" }, ui.icone("opcoes"));
    const novoNeg = () => N.novoNegocio(k, { contato_id: c.id }, { aoCriar: () => carregar() });
    const novaTar = async () => { const t = await T.formTarefa(k, null, { contato_id: c.id }); if (t) { ui.toast("Tarefa criada.", { tipo: "ok" }); carregar(); } };
    menuBt.addEventListener("click", () => ui.menu(menuBt, [
      // plano 1000 (CR-228): no celular a ação principal fica à vista e «+ Oportunidade» / «+ Tarefa» moram aqui (os botões quebravam em 3 linhas a 360 px)
      pode && pequena() ? { rotulo: k.v.novo("negocio"), icone: "funil", fn: novoNeg } : null,
      pode && pequena() ? { rotulo: "Nova tarefa", icone: "tarefa", fn: novaTar } : null,
      pode && pequena() ? "-" : null,
      c.telefone ? { rotulo: "Copiar telefone", icone: "copiar", fn: () => ui.copiar(ui.telBR(c.telefone)) } : null,
      // plano 1000 (CR-263): o e-mail também se copia daqui
      c.email ? { rotulo: "Copiar e-mail", icone: "copiar", fn: () => ui.copiar(c.email) } : null,
      { rotulo: "Copiar link da ficha", icone: "link", fn: () => ui.copiar(ctx.linkPublico ? ctx.linkPublico(`#/contatos/${c.id}`) : location.href) },
      gaveta ? { rotulo: "Abrir em página", icone: "externo", fn: () => { gaveta.fechar(); ctx.navegar(`#/contatos/${c.id}`); } } : null,
      k.pode("admin") ? "-" : null,
      // plano 1000 (CR-103): direito de acesso do titular — um arquivo com tudo o que a ficha tem DESTA pessoa (nada de outros contatos)
      k.pode("admin") ? { rotulo: "Baixar dados do titular (LGPD)", icone: "baixar", fn: () => baixarDadosTitular(k, d) } : null,
      k.pode("admin") ? { rotulo: "Excluir cadastro (LGPD)", icone: "lixeira", perigo: true, fn: excluir } : null,
    ].filter(Boolean)));
    const cab = h("section", { class: "fx-cab", "aria-label": "Identificação" },
      ui.avatar(c.nome || c.telefone, c.id),
      h("div", { class: "fx-id" }, nomeH,
        h("p", null,
          c.telefone ? h("span", null, ui.icone("telefone"), h("span", { class: "mono" }, ui.telBR(c.telefone))) : null,
          c.email ? h("span", null, ui.icone("enviar"), c.email) : null,
          c.cidade ? h("span", null, ui.icone("globo"), `${c.cidade}${c.uf ? `/${c.uf}` : ""}`) : null),
        h("div", { class: "linha", style: { gap: ".35rem" } },
          // plano 1000 (CR-101): a mesma pílula de origem da lista e do quadro («Anúncio · Google», «WhatsApp»…)
          (() => { const o = L.origemPilula(c); return o ? ui.pilula(null, o.chave, { variante: "origem", plataforma: o.plataforma, class: "fx-origem" }) : null; })(),
          c.optin_marketing === false ? ui.pilula("Não quer marketing", "aten", { icone: "alerta" }) : null,
          // plano 1000 (CR-225): aniversário nos próximos 7 dias (ou hoje) no cabeçalho — a data era guardada e não aparecia
          aniv ? ui.pilula(aniv.texto, aniv.dias === 0 ? "ok" : "info", { icone: "calendario", class: "fx-aniv" }) : null,
          c.bloqueado ? ui.pilula("Bloqueado", "ruim", { title: "Não recebe mensagens" }) : null),
        // plano 1000 (CR-261): o que «Bloqueado» quer dizer e onde desfazer
        c.bloqueado ? h("p", { class: "aviso aviso-ruim fx-bloqueado", role: "note" }, ui.icone("alerta"),
          h("span", null, `Bloquead${k.v.art("contato")}: não recebe mensagens nem automações e as mensagens que mandar não abrem atendimento. `,
            k.pode("supervisor") && ctx.temModulo && ctx.temModulo("conversas")
              ? h("a", { class: "link", href: conv ? `#/conversas/${conv.id}` : `#/conversas?contato=${c.id}` }, "Desbloquear na conversa")
              : "Para desbloquear, peça a um supervisor (na conversa, botão «Desbloquear»).")) : null),
      h("div", { class: "fx-acoes" },
        ctx.temModulo && ctx.temModulo("conversas") ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => {
          if (gaveta) gaveta.fechar();
          ctx.navegar(conv ? `#/conversas/${conv.id}` : `#/conversas?contato=${c.id}`);
        } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
        pode ? h("button", { type: "button", class: "bt bt-sec fx-ac-sec", on: { click: novoNeg } }, ui.icone("mais"), k.v.novo("negocio")) : null,
        pode ? h("button", { type: "button", class: "bt bt-sec fx-ac-sec", on: { click: novaTar } }, ui.icone("tarefa"), "Tarefa") : null,
        menuBt));

    /* coluna da esquerda: dados */
    const dl = h("dl", { class: "ng-kv" });
    const inp = (tipo, valor, extra = {}) => h("input", { type: tipo, value: valor ?? "", ...extra });
    dl.append(
      ...N.linhaEd(k, { rotulo: "Nome", desabilitado: !pode, controle: inp("text", c.nome, { maxlength: 160 }), ler: x => x.value.trim() || null,
        salvar: async v => { await salvar({ nome: v }); nomeH.textContent = L.nomeContato(c); } }),
      ...N.linhaEd(k, { rotulo: "Telefone", desabilitado: !pode, controle: inp("tel", c.telefone ? ui.telBR(c.telefone) : "", { placeholder: "(12) 99830-3030" }),
        ler: x => { const dg = x.value.replace(/\D/g, ""); return dg ? (x.value.trim().startsWith("+") ? "+" : "") + dg : null; },
        // plano 1000 (CR-097): apagar o telefone de quem tem conversa corta o WhatsApp — pergunta antes
        salvar: async v => {
          if (!v && c.telefone && (d.conversas || []).length) {
            const ok = await ui.confirmar({ titulo: "Tirar o telefone?", texto: `Sem telefone, ${c.nome || "esta pessoa"} não recebe mais mensagens pelo WhatsApp nem automações. Continuar?`, perigo: true, rotulo: "Tirar o telefone" });
            if (!ok) { const x = el.querySelector('input[type="tel"].ed'); if (x) x.value = ui.telBR(c.telefone); return N.CANCELAR_EDICAO; }
          }
          return salvar({ telefone: v });
        },
        aoErro: (e, erroEl) => {
          if (e && e.codigo === "telefone_em_uso" && /^\d+$/.test(String(e.hint || ""))) {
            erroEl.append(" ", h("a", { href: `#/contatos/${e.hint}`, class: "link" }, "Abrir cadastro"));
          }
        } }),
      // plano 1000 (CR-098): e-mail e UF conferidos aqui, com a mesma regra do servidor — sem ida e volta e com a frase certa
      ...N.linhaEd(k, { rotulo: "E-mail", desabilitado: !pode, controle: inp("email", c.email), ler: x => x.value.trim() || null, salvar: v => salvar({ email: v }),
        validar: x => (x.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.value.trim()) ? "E-mail inválido. Confira, por exemplo: ana@exemplo.com.br." : null) }),
      // plano 1000 (CR-111): máscara de CPF/CNPJ ao sair do campo e aviso (sem bloquear) quando o dígito verificador não confere
      ...N.linhaEd(k, { rotulo: "CPF / CNPJ", desabilitado: !pode, controle: (() => { const x = inp("text", L.formatarDoc(c.documento || ""), { maxlength: 40, inputmode: "numeric" });
        x.addEventListener("blur", () => { x.value = L.formatarDoc(x.value); }, { capture: true }); return x; })(),
        ler: x => L.formatarDoc(x.value).trim() || null, aviso: x => L.avisoDoc(x.value), salvar: v => salvar({ documento: v }) }),
      // plano 1000 (CR-099): nascimento no futuro não é gravado (o calendário também para em hoje)
      // plano 1000 (CR-226): a idade ao lado («Nascimento (34 anos)»)
      ...N.linhaEd(k, { rotulo: idade != null ? `Nascimento (${idade} ${idade === 1 ? "ano" : "anos"})` : "Nascimento", desabilitado: !pode, controle: inp("date", c.nascimento, { max: ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10) }), ler: x => x.value || null,
        validar: x => (x.value && x.value > (ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10)) ? "A data de nascimento não pode ser no futuro." : null),
        salvar: v => salvar({ nascimento: v }) }),
      ...N.linhaEd(k, { rotulo: "Cidade", desabilitado: !pode, controle: inp("text", c.cidade, { maxlength: 80 }), ler: x => x.value.trim() || null, salvar: v => salvar({ cidade: v }) }),
      ...N.linhaEd(k, { rotulo: "UF", desabilitado: !pode, controle: inp("text", c.uf, { maxlength: 2, style: { "text-transform": "uppercase", "max-width": "6rem" } }), ler: x => x.value.trim().toUpperCase() || null, salvar: v => salvar({ uf: v }),
        validar: x => (x.value.trim() && !/^[A-Za-z]{2}$/.test(x.value.trim()) ? "UF deve ter 2 letras (ex.: SP)." : null) }),
      // plano 1000 (CR-095): ligar o contato a uma empresa pela ficha (nx_contato_salvar já aceita empresa_id) — busca, link e «Tirar da empresa»
      campoEmpresa(),
      ...N.linhaEd(k, { rotulo: "Responsável", desabilitado: !pode,
        controle: h("select", null, h("option", { value: "" }, "Sem responsável"), k.base.usuarios.map(u => h("option", { value: u.id, selected: u.id === c.dono_id }, u.nome))),
        ler: x => x.value || null, salvar: v => salvar({ dono_id: v }) }),
      // plano 1000 (CR-046): sem origem gravada, a ficha diz isso (antes mostrava «Anúncio», a 1ª opção) e nada é gravado até escolherem
      ...N.linhaEd(k, { rotulo: "Origem", desabilitado: !pode || !!c.plataforma,
        controle: h("select", null, c.origem ? null : h("option", { value: "", selected: true }, "— não informada —"),
          L.origensManuais(c.origem).map(([v, t]) => h("option", { value: v, selected: v === c.origem }, t))),     // plano 1000 (CR-094)
        ler: x => x.value || null, salvar: v => salvar({ origem: v }) }));
    const ddEtq = h("dd", null);
    const montarEtq = marcadas => {
      const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas, rotulo: "Etiquetas",
        podeCriar: pode ? nome => k.criarEtiqueta(nome) : false, aoMudar: ids => etiquetar(ids) });
      if (!pode) for (const b of etq.querySelectorAll("button")) b.disabled = true;
      ui.limpar(ddEtq); ddEtq.appendChild(etq);
    };
    // M25: etiquetar grava na hora e oferece «Desfazer» — que desfaz só ESTA troca (uma etiqueta posta depois continua)
    async function etiquetar(ids) {
      const antes = (c.etiquetas || []).slice();
      const nomeDe = id => (k.etiqueta(id) || {}).nome || "etiqueta";
      const mais = ids.filter(i => !antes.includes(i)), menos = antes.filter(i => !ids.includes(i));
      const texto = mais.length ? `Etiqueta «${nomeDe(mais[0])}» adicionada` : menos.length ? `Etiqueta «${nomeDe(menos[0])}» removida` : "Etiquetas atualizadas";
      try { await salvar({ etiquetas: ids }); }
      catch (e) { k.toastErro(e); montarEtq(antes); return; }
      ui.acaoComDesfazer({ texto, reverter: async () => {
        const volta = L.desfazerEtiquetas(c.etiquetas || [], mais, menos);
        await salvar({ etiquetas: volta });
        montarEtq(c.etiquetas || volta);
      } });
    }
    montarEtq(c.etiquetas || []);
    dl.append(h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Etiquetas"), ddEtq));
    const obs = h("textarea", { rows: 3, maxlength: 5000, placeholder: "Observações gerais" }, c.obs || "");
    dl.append(...N.linhaEd(k, { rotulo: "Observação", desabilitado: !pode, controle: obs, largo: true, ler: x => x.value.trim() || null, salvar: v => salvar({ obs: v }) }));
    const blocoDados = h("section", { class: "ng-bloco", "aria-label": "Dados" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Dados")), dl);

    /* campos personalizados */
    const campos = L.camposDe(k.base.campos, "contato");
    let blocoCampos = null;
    if (campos.length) {
      const form = h("form", { class: "crm-form", novalidate: true }, campos.map(cp => N.campoPersonalizado(k, cp, (c.campos || {})[cp.chave])));
      if (!pode) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
      form.addEventListener("change", async ev => {
        const cmp = ev.target.closest("[data-campo]");
        const cp = cmp && campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
        if (!cp) return;
        const { valores, erros } = N.lerCamposPersonalizados(k, form, [cp]);
        ui.marcarErro(form, cmp.dataset.campo, "");
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
        try { await salvar({ campos: { [cp.chave]: valores[cp.chave] ?? null } }); ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
        catch (e) { ui.marcarErro(form, cmp.dataset.campo, k.erro(e)); }
      });
      blocoCampos = h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")), form);
    }

    /* consentimento */
    const estadoOptin = c.optin_marketing === true ? ui.pilula("Aceita mensagens de marketing", "ok", { icone: "check" })
      // plano 1000 (CR-106): pela decisão 3, sem registro PODE receber marketing (só «não quer» barra) — o texto diz isso
      : c.optin_marketing === false ? ui.pilula("Não quer marketing", "aten", { icone: "alerta" }) : ui.pilula("Sem registro — pode receber marketing até pedir para sair", "neutra", { class: "fx-optin-sem" });
    const blocoConsent = h("section", { class: "ng-bloco", "aria-label": "Consentimento" },
      h("div", { class: "ng-bloco-cab" }, h("h3", null, "Consentimento de marketing"),
        pode ? h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: registrarOptin } }, "Registrar") : null),
      h("div", { class: "fx-consent" }, estadoOptin,
        c.optin_em ? h("span", { class: "fraco", style: { "font-size": "var(--fs-13)" } }, `${ui.dataBR(c.optin_em)}${c.optin_origem ? ` · ${c.optin_origem}` : ""}`) : null),
      h("p", { class: "campo-ajuda" }, "Quem pediu para sair não recebe automações nem envios em lista. Resposta de atendimento continua possível."));

    /* coluna da direita */
    const rfm = d.rfm || {};
    // plano 1000 (CR-102): sem nenhuma compra, uma linha só em vez de «R$ 0 · 0 · — · —»
    const blocoRfm = !(Number(rfm.ganhos) > 0) && !(Number(rfm.total_gasto) > 0)
      ? h("section", { class: "fx-rfm fx-rfm-vazio", "aria-label": "Resumo de compras" }, h("p", { class: "fraco" }, "Ainda sem compras."))
      : h("section", { class: "fx-rfm", "aria-label": "Resumo de compras" },
      h("div", null, h("span", { class: "rotulo" }, "Total gasto"), h("b", null, ui.brl(rfm.total_gasto || 0, { centavos: false }))),
      h("div", null, h("span", { class: "rotulo" }, "Compras"), h("b", null, ui.num(rfm.ganhos || 0))),
      h("div", null, h("span", { class: "rotulo" }, "Última compra"), h("b", null, rfm.ultima_compra ? ui.dataBR(rfm.ultima_compra) : "—")),
      h("div", null, h("span", { class: "rotulo" }, "Ticket médio"), h("b", null, rfm.ticket_medio != null ? ui.brl(rfm.ticket_medio, { centavos: false }) : "—")));
    const listaNeg = h("div", { class: "ng-outros" });
    for (const n of d.negocios || []) {
      const e = k.estagio(n.estagio_id), f = k.funil(n.funil_id);
      listaNeg.appendChild(h("button", { type: "button", class: "ng-mini", style: e && k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
        on: { click: () => N.abrirNegocio(k, n.id, { aoMudar: () => carregar() }) } },
        h("i", { "aria-hidden": "true" }),
        h("span", null, `${L.tituloCard(n)} · ${e ? e.nome : "—"}${f ? ` · ${f.nome}` : ""}`),
        h("b", null, (n.status === "ganho" ? n.valor : n.valor_previsto) != null ? ui.brl(n.status === "ganho" ? n.valor : n.valor_previsto, { centavos: false }) : "—")));
    }
    if (!(d.negocios || []).length) listaNeg.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, `${k.v.nenhum("negocio")} ainda.`));
    const blocoNeg = h("section", { class: "ng-bloco", "aria-label": k.v.negocios },
      h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.negocios),
        pode ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => N.novoNegocio(k, { contato_id: c.id }, { aoCriar: () => carregar() }) } }, ui.icone("mais"), k.v.novo("negocio")) : null),
      listaNeg);
    const listaConv = h("div", { class: "ng-outros" });
    for (const x of d.conversas || []) {
      listaConv.appendChild(h("a", { class: "fx-proto", href: `#/conversas/${x.id}`, on: { click: () => { if (gaveta) gaveta.fechar(); } } },
        ui.icone("chat"), h("b", { class: "mono" }, x.protocolo),
        h("span", null, L.linhaAtendimento(x, ui.dataBR, { comResponsavel: true })),     // plano 1000 (CR-062): sem «—» quando não há aberta_em
        x.nao_lidas ? h("span", { class: "badge" }, String(x.nao_lidas)) : null));
    }
    if (!(d.conversas || []).length) listaConv.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, "Nenhum atendimento ainda."));
    const blocoConv = h("section", { class: "ng-bloco", "aria-label": "Atendimentos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Atendimentos")), listaConv);
    const blocoTar = T.blocoTarefas(k, { tarefas: d.tarefas || [], contato_id: c.id });
    const blocoNotas = T.blocoNotas(k, { notas: d.notas || [], contato_id: c.id });
    const blocoTempo = T.blocoTempo(k, d.tempo || [], { pagina: { p_contato: c.id } });

    // plano 1000 (CR-233): «De onde veio» também na ficha — o rastreio do negócio que veio de anúncio/site (ou do próprio cadastro), igual à gaveta
    const negOrigem = (d.negocios || []).find(x => x && (x.plataforma || x.origem === "anuncio" || x.campanha_ext || x.campanha_nome || x.anuncio_nome || x.rastreio)) || null;
    const rs = L.resumoRastreio({ ...c, ...(negOrigem || {}), origem: (negOrigem && negOrigem.origem) || c.origem },
      { anuncio: (negOrigem && negOrigem.anuncio) || d.anuncio || {}, fmtData: iso => `${ui.dataCurtaBR ? ui.dataCurtaBR(iso) : ui.dataBR(iso)} ${ui.horaBR(iso)}` });
    const blocoOrigem = rs && (rs.chave === "anuncio" || rs.chave === "site" || rs.detalhes.length || / · /.test(rs.frase))
      ? h("section", { class: ["ng-bloco", "ng-anuncio", "ng-rastreio", "fx-b-origem", rs.plataforma === "google" && "google"], "aria-label": "De onde veio" },
        rs.chave ? ui.pilula(null, rs.chave, { variante: "origem", plataforma: rs.plataforma }) : ui.icone("anuncio"),
        h("div", { class: "ng-origem-detalhes" }, h("b", { class: "ng-rastreio-frase" }, rs.frase), ...rs.detalhes.map(t => h("small", null, t)))) : null;
    // plano 1000 (CR-227): no celular a ficha vem na ordem do trabalho — negócios e tarefas antes dos dados (classes fx-b-* e a ordem no CSS)
    blocoDados.classList.add("fx-b-dados"); if (blocoCampos) blocoCampos.classList.add("fx-b-campos"); blocoConsent.classList.add("fx-b-consent");
    blocoRfm.classList.add("fx-b-rfm"); blocoNeg.classList.add("fx-b-neg"); blocoConv.classList.add("fx-b-conv");
    if (blocoTar.classList) blocoTar.classList.add("fx-b-tar"); if (blocoNotas.classList) blocoNotas.classList.add("fx-b-notas"); if (blocoTempo.classList) blocoTempo.classList.add("fx-b-tempo");
    // plano 1000 (CR-105): veio da lista? «Voltar» volta para ela (mesma página e filtros); veio por link, vai para #/contatos
    const voltar = !gaveta ? h("a", { class: "bt bt-fant bt-p fx-voltar", href: "#/contatos" }, ui.icone("seta-esq"), k.v.contatos) : null;
    if (voltar) voltar.addEventListener("click", ev => {
      if (!memLista || Date.now() - memLista.em > 30 * 60000 || typeof history === "undefined" || typeof history.back !== "function") return;
      ev.preventDefault(); memLista.voltando = true; history.back();
    });
    el.append(...[
      voltar,
      h("div", { class: "fx" }, cab,
        h("div", { class: "fx-grade" },
          h("div", { class: "fx-col" }, blocoDados, blocoCampos, blocoConsent),
          h("div", { class: "fx-col" }, blocoOrigem, blocoRfm, blocoNeg, blocoConv, blocoTar, blocoNotas, blocoTempo)))].filter(Boolean));

    async function registrarOptin() {
      const nome = `opt-${Date.now()}`;
      const form = h("form", { class: "crm-form", novalidate: true },
        h("div", { class: "crm-motivos", role: "radiogroup", "aria-label": "Autorização" },
          h("label", { class: "crm-motivo" }, h("input", { type: "radio", name: nome, value: "sim", checked: c.optin_marketing !== false }), h("span", null, "Aceita receber mensagens de marketing")),
          h("label", { class: "crm-motivo" }, h("input", { type: "radio", name: nome, value: "nao", checked: c.optin_marketing === false }), h("span", null, "Não quer receber marketing"))),
        ui.campo({ rotulo: "Como foi registrado", nome: "optin_origem", max: 60, obrigatorio: true, placeholder: "Ex.: ficha assinada na recepção" }));
      const r = await ui.modal({ titulo: "Registrar consentimento", corpo: form, largura: "p", acoes: [
        { rotulo: "Cancelar", tipo: "neutro", valor: null },
        { rotulo: "Registrar", tipo: "primario", fn: async api => {
          const sel = form.querySelector(`input[name="${nome}"]:checked`);
          const o = form.querySelector("[name=optin_origem]").value.trim();
          if (!o) { ui.marcarErro(form, "optin_origem", "Diga de onde veio a autorização."); return false; }
          try { return await salvar({ optin_marketing: sel.value === "sim", optin_origem: o }); } catch (e) { api.erro(k.erro(e)); return false; }
        } }] });
      if (r) { ui.toast("Consentimento registrado.", { tipo: "ok" }); carregar(); }
    }

    async function excluir() {
      const ok = await ui.confirmar({
        titulo: "Excluir este cadastro?", perigo: true, digitar: "excluir", rotulo: "Excluir de vez",
        texto: `Some tudo o que identifica ${c.nome || "esta pessoa"}: cadastro, conversas, mensagens, fotos e arquivos, tarefas e notas. ${k.v.negocios} ficam sem o nome (como «Removido») para os números do anúncio e as vendas não mudarem. Não dá para desfazer.`,
      });
      if (!ok) return;
      try {
        const r = await k.api.rpcC("nx_contato_excluir", { p_id: c.id, p_confirmacao: "excluir" });
        ui.toast(`Cadastro excluído${r.midias_na_fila ? ` — ${r.midias_na_fila} arquivo(s) de mídia entram na faxina` : ""}.`, { tipo: "ok" });
        if (aoMudar) try { aoMudar({ id: c.id, excluido: true }); } catch { /* ok */ }
        if (gaveta) gaveta.fechar(); else ctx.navegar("#/contatos", { substituir: true });
      } catch (e) { k.toastErro(e); }
    }
  }

  await carregar();
  // plano 1000 (CR-104): a ficha aberta acompanha o que chega (tarefa de automação, conversa nova) — no pulso, no máximo a cada 30 s, em silêncio
  // (sem esqueleto) e nunca com um campo em edição, um diálogo aberto ou a aba escondida
  async function recarregarQuieto() {
    if (!vivo || document.hidden || Date.now() - ultimaLeitura < 30000) return;
    if (document.querySelector("dialog[open]")) return;
    const a = document.activeElement;
    if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "")) return;
    if (gaveta && typeof gaveta.estaSujo === "function" && gaveta.estaSujo()) return;
    ultimaLeitura = Date.now();
    try {
      const d = await k.api.rpcC("nx_contato_ver", { p_id: idNum });
      if (!vivo) return;
      const j = JSON.stringify(d);
      if (j === ultimoJson) return;
      const a2 = document.activeElement;
      if (a2 && el.contains(a2) && /^(INPUT|TEXTAREA|SELECT)$/.test(a2.tagName || "")) return;     // começou a editar enquanto a leitura voltava
      ultimoJson = j;
      desenhar(d);
    } catch { /* fica o que está; o próximo pulso tenta de novo */ }
  }
  const cancelarPulso = ctx.pulso && typeof ctx.pulso.assinar === "function" ? ctx.pulso.assinar(recarregarQuieto) : null;
  return { desmontar() { vivo = false; if (cancelarPulso) cancelarPulso(); } };
}

/** plano 1000 (CR-103): baixa o JSON do titular (L.dadosTitular: cadastro, consentimento, negócios, tarefas, notas, atendimentos, histórico). */
export function baixarDadosTitular(k, d) {
  const { ui, h, L } = k;
  const dados = L.dadosTitular(d, { geradoEm: new Date().toISOString() });
  if (!dados) { ui.toast("Não há dados deste cadastro para baixar.", { tipo: "info" }); return null; }
  const nome = `dados-titular-${String(dados.cadastro.id)}-${ui.hojeSP()}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json;charset=utf-8" }));
  const a = h("a", { href: url, download: nome, hidden: true });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  ui.toast("Arquivo com os dados do titular baixado. Envie só para a própria pessoa.", { tipo: "ok" });
  return nome;
}

/* ============================================================ T8 — Empresas */
/**
 * Cartão de empresa (plano 50, item 30): avatar, nome, documento/cidade, contagem de contatos e de negócios abertos, «Ver negócios» (abre a
 * empresa já na seção de negócios) e «Ver contatos» (lista de contatos filtrada pela empresa).
 */
export function cartaoEmpresa(k, e) {
  const { ui, h } = k;
  const nCt = Number(e.contatos) || 0, abertos = Number(e.negocios_abertos) || 0;
  const sub = [e.documento, e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ""}` : null].filter(Boolean).join(" · ");
  return h("li", { class: "emp-cartao", dataset: { id: e.id } },
    h("a", { class: "emp-cab", href: `#/empresas/${e.id}` }, ui.avatar(e.nome, e.id),
      h("span", { class: "emp-txt" }, h("b", { class: "emp-nome" }, e.nome || "Empresa"), h("small", null, sub || "Sem documento nem cidade"))),
    h("div", { class: "emp-nums" },
      h("span", { class: "emp-num" }, h("b", { class: "dado" }, ui.num(nCt)), h("small", null, nCt === 1 ? k.v.min("contato") : k.v.min("contatos"))),
      h("span", { class: ["emp-num", abertos > 0 && "tem"] }, h("b", { class: "dado" }, ui.num(abertos)), h("small", null, `${abertos === 1 ? k.v.min("negocio") : k.v.min("negocios")} abert${k.v.art("negocio")}${abertos === 1 ? "" : "s"}`))),
    h("div", { class: "emp-acoes" },
      h("a", { class: "bt bt-sec bt-p emp-ver-neg", href: `#/empresas/${e.id}?sec=negocios` }, ui.icone("funil"), `Ver ${k.v.min("negocios")}`),
      h("a", { class: "bt bt-fant bt-p emp-ver-ct", href: `#/contatos?empresa=${encodeURIComponent(e.id)}&empresa_nome=${encodeURIComponent(e.nome || "")}` }, ui.icone("contato"), `Ver ${k.v.min("contatos")}`)));
}

export async function montarEmpresas(k, el) {
  const { ui, h, ctx } = k;
  ctx.titulo("Empresas");
  const S = { busca: "", pagina: 1, seq: 0 };
  const busca = h("input", { type: "search", placeholder: "Buscar empresa", "aria-label": "Buscar empresa" });
  const corpo = h("div", { class: "pilha" });
  const pag = h("nav", { class: "ct-pag", "aria-label": "Páginas" });
  busca.addEventListener("input", ui.debounce(() => { S.busca = busca.value.trim(); S.pagina = 1; carregar(); }, 300));
  el.append(
    ui.cabecalho({ titulo: "Empresas", sub: "Convênios, frotas, parceiros — as organizações por trás dos seus contatos.",
      acoes: k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: async () => {
        const e = await formEmpresa(k, null);
        if (e) ctx.navegar(`#/empresas/${e.id}`);
      } } }, ui.icone("mais"), "Empresa") : null }),
    h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca)), corpo, pag);
  // cartões em vez de tabela (item 30): contagens à vista e as duas ações sem abrir a empresa
  const grade = h("ul", { class: "emp-grade", role: "list", "aria-label": "Empresas" });
  async function carregar() {
    const minha = ++S.seq;
    if (!corpo.contains(grade)) { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("cartoes", 6)); }
    else grade.setAttribute("aria-busy", "true");
    try {
      const r = await k.api.rpcC("nx_empresas_listar", { p_filtro: S.busca ? { busca: S.busca } : {}, p_pagina: S.pagina });
      if (minha !== S.seq) return;
      // resposta fora do formato (sem «itens») não vira exceção em inglês na tela: o servidor recusou o formato, e a frase diz isso
      if (!r || !Array.isArray(r.itens)) throw Object.assign(new Error("resposta_invalida"), { codigo: "resposta_invalida" });
      grade.removeAttribute("aria-busy");
      ui.limpar(corpo); ui.limpar(pag);
      if (!r.itens.length && !S.busca && S.pagina === 1) {
        corpo.appendChild(ui.vazio({ titulo: "Nenhuma empresa ainda.", texto: "Cadastre empresas quando atender outras empresas (convênios, frotas, parceiros).", icone: "empresa",
          acao: k.pode("atendente") ? { rotulo: "Cadastrar empresa", fn: async () => { const e = await formEmpresa(k, null); if (e) ctx.navegar(`#/empresas/${e.id}`); } } : null }));
        return;
      }
      ui.limpar(grade);
      if (!r.itens.length) corpo.appendChild(ui.vazio({ tipo: "sem_resultado", titulo: "Nenhuma empresa com esse nome.", acao: { rotulo: "Limpar busca", fn: () => { busca.value = ""; S.busca = ""; S.pagina = 1; carregar(); } } }));
      for (const e of r.itens) grade.appendChild(cartaoEmpresa(k, e));
      corpo.appendChild(grade);
      pag.append(h("span", null, `${ui.num(r.total)} empresa${r.total === 1 ? "" : "s"}`), h("div", { class: "linha" },
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: S.pagina <= 1, on: { click: () => { S.pagina--; carregar(); } } }, ui.icone("seta-esq"), "Anterior"),
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: !r.tem_mais, on: { click: () => { S.pagina++; carregar(); } } }, "Próxima", ui.icone("seta-dir"))));
    } catch (e) { if (minha === S.seq) { ui.limpar(corpo); corpo.appendChild(ui.erroCartao(e, carregar)); } }
  }
  await carregar();
  return { desmontar() { S.seq++; } };
}

export async function formEmpresa(k, emp) {     // plano 1000 (CR-189): também pela paleta («Nova empresa»)
  const { ui, h, L } = k;
  const e = emp || {};
  const N = await k.mod("negocio");
  // na criação, os campos obrigatórios de empresa já entram no formulário (o servidor recusa sem eles)
  const obrig = emp ? [] : L.camposDe(k.base.campos, "empresa").filter(c => c.obrigatorio);
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: "Nome", nome: "nome", valor: e.nome || "", obrigatorio: true, max: 160 }),
    h("div", { class: "crm-form-2" },
      ui.campo({ rotulo: "CNPJ / documento", nome: "documento", valor: L.formatarDoc(e.documento || ""), max: 40 }),
      ui.campo({ rotulo: "Telefone", nome: "telefone", tipo: "tel", valor: e.telefone || "" }),
      ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: e.email || "" }),
      ui.campo({ rotulo: "Site", nome: "site", tipo: "url", valor: e.site || "", placeholder: "https://" }),
      ui.campo({ rotulo: "Cidade", nome: "cidade", valor: e.cidade || "", max: 80 }),
      ui.campo({ rotulo: "UF", nome: "uf", valor: e.uf || "", max: 2 })),
    ui.campo({ rotulo: "Observação", nome: "obs", tipo: "textarea", valor: e.obs || "", max: 5000 }),
    obrig.map(c => N.campoPersonalizado(k, c, null)));
  const inDoc = form.querySelector("[name=documento]");
  if (inDoc) {
    const av = h("small", { class: "ed-aviso", role: "status", hidden: true });
    inDoc.after(av);
    inDoc.addEventListener("blur", () => { inDoc.value = L.formatarDoc(inDoc.value); const t = L.avisoDoc(inDoc.value); av.textContent = t || ""; av.hidden = !t; });
  }
  return ui.modal({ titulo: emp ? "Editar empresa" : "Nova empresa", corpo: form, acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: emp ? "Salvar" : "Cadastrar", tipo: "primario", fn: async api => {
      const d = ui.lerForm(form);
      ui.marcarErro(form, null);
      if (!d.nome) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
      const { valores, erros } = N.lerCamposPersonalizados(k, form, obrig);
      if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
      const dados = Object.fromEntries(Object.entries(d).filter(([kk]) => !kk.startsWith("campo__")));
      // plano 1000 (CR-111/112): documento com máscara (o dígito que não confere avisa sem bloquear) e site com https://
      if (dados.documento) dados.documento = L.formatarDoc(dados.documento);
      if (dados.site) dados.site = L.normalizarSite(dados.site);
      try { return await k.api.rpcC("nx_empresa_salvar", { p_empresa: { ...(emp ? { id: emp.id } : {}), ...dados, uf: dados.uf ? dados.uf.toUpperCase() : null, ...(obrig.length ? { campos: valores } : {}) } }); }
      catch (err) {
        if (err && err.codigo === "telefone_invalido") { ui.marcarErro(form, "telefone", k.erro(err)); return false; }
        if (err && err.codigo === "dados_invalidos" && ["email", "site", "uf"].includes(err.hint)) { ui.marcarErro(form, err.hint, k.erro(err)); return false; }
        api.erro(k.erro(err)); return false;
      }
    } }] });
}

export async function montarEmpresa(k, el, id, rota = {}) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  let vivo = true;
  let focarNegocios = !!(rota && rota.query && rota.query.sec === "negocios");   // veio de «Ver negócios» do cartão: abre já na seção
  /** plano 1000 (CR-096): busca um contato e liga à empresa. */
  async function ligarContato(emp) {
    const busca = h("input", { type: "search", placeholder: "Nome ou telefone", "aria-label": `Buscar ${k.v.min("contato")}`, autocomplete: "off" });
    const res = h("div", { class: "crm-busca-res", role: "listbox", "aria-label": "Resultados" });
    let apiM = null, seq = 0;
    busca.addEventListener("input", ui.debounce(async () => {
      const q = busca.value.trim(), minha = ++seq;
      ui.limpar(res);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_por_pagina: 8 });
        if (minha !== seq) return;
        const itens = (r && r.itens) || [];
        if (!itens.length) { res.appendChild(h("p", { class: "flut-vazio" }, "Nada encontrado.")); return; }
        for (const c of itens) res.appendChild(h("button", { type: "button", role: "option", disabled: !!(c.empresa && c.empresa.id === emp.id),
          on: { click: async () => {
            try { await k.api.rpcC("nx_contato_salvar", { p_contato: { id: c.id, empresa_id: emp.id } }); if (apiM) apiM.fechar(c); }
            catch (err) { if (apiM) apiM.erro(k.erro(err)); }
          } } }, ui.avatar(c.nome || c.telefone, c.id),
          h("span", null, h("b", null, L.nomeContato(c)), h("small", null, c.empresa && c.empresa.nome ? (c.empresa.id === emp.id ? "já está nesta empresa" : `hoje em «${c.empresa.nome}»`) : (c.telefone ? ui.telBR(c.telefone) : "")))));
      } catch (err) { if (minha === seq) res.appendChild(h("p", { class: "flut-vazio" }, k.erro(err))); }
    }, 250));
    const ligado = await ui.modal({ titulo: `Ligar ${k.v.min("contato")} a «${emp.nome}»`, corpo: h("div", { class: "pilha-p" }, h("div", { class: "busca" }, ui.icone("busca"), busca), res),
      largura: "p", acoes: [{ rotulo: "Fechar", tipo: "neutro", valor: null }], aoAbrir: a => { apiM = a; setTimeout(() => busca.focus(), 60); } });
    if (ligado) { ui.toast(`${L.nomeContato(ligado)} ligad${k.v.art("contato")} à empresa.`, { tipo: "ok" }); carregar(); }
  }
  async function carregar() {
    ui.limpar(el); el.appendChild(ui.esqueleto("cartoes", 3));
    try {
      const bruto = await k.api.rpcC("nx_empresa_ver", { p_id: Number(id) });
      if (!vivo) return;
      if (!bruto || !bruto.empresa || typeof bruto.empresa !== "object") throw Object.assign(new Error("resposta_invalida"), { codigo: "resposta_invalida" });
      const d = { ...bruto, contatos: Array.isArray(bruto.contatos) ? bruto.contatos : [], negocios: Array.isArray(bruto.negocios) ? bruto.negocios : [] };
      const e = d.empresa;
      ctx.titulo(e.nome);
      ui.limpar(el);
      // resumo da empresa (item 30): contatos, negócios abertos (e o valor em aberto), fechados — do que nx_empresa_ver já devolve
      const res = L.resumoEmpresa(d);
      const resumo = h("div", { class: "emp-resumo", role: "group", "aria-label": "Resumo da empresa" },
        h("div", { class: "emp-res-it" }, h("b", { class: "dado" }, ui.num(res.contatos)), h("span", null, res.contatos === 1 ? k.v.min("contato") : k.v.min("contatos"))),
        h("div", { class: ["emp-res-it", res.abertos > 0 && "tem"] }, h("b", { class: "dado" }, ui.num(res.abertos)), h("span", null, `${res.abertos === 1 ? k.v.min("negocio") : k.v.min("negocios")} abert${k.v.art("negocio")}${res.abertos === 1 ? "" : "s"}`), res.valorAberto ? h("small", null, ui.brl(res.valorAberto, { centavos: false })) : null),
        h("div", { class: ["emp-res-it", res.ganhos > 0 && "ok"] }, h("b", { class: "dado" }, ui.num(res.ganhos)), h("span", null, `${k.v.ganhar.toLowerCase()}${res.ganhos === 1 ? "" : "s"}`), res.valorGanho ? h("small", null, ui.brl(res.valorGanho, { centavos: false })) : null));
      const contatos = h("div", { class: "ng-outros" }, (d.contatos || []).map(c => h("a", { class: "fx-proto", href: `#/contatos/${c.id}` },
        ui.avatar(c.nome || c.telefone, c.id), h("b", null, c.nome || ui.telBR(c.telefone)), h("span", null, c.telefone ? ui.telBR(c.telefone) : c.email || ""))));
      if (!(d.contatos || []).length) contatos.appendChild(h("p", { class: "fraco" }, `Nenhum ${k.v.min("contato")} ligado. Use «Ligar ${k.v.min("contato")}» ou escolha esta empresa na ficha de alguém.`));
      // plano 1000 (CR-096): ligar contatos daqui mesmo (busca → nx_contato_salvar com empresa_id)
      const btLigar = k.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p emp-ligar", on: { click: () => ligarContato(e) } }, ui.icone("mais"), `Ligar ${k.v.min("contato")}`) : null;
      const negs = h("div", { class: "ng-outros" }, (d.negocios || []).map(n => {
        const est = k.estagio(n.estagio_id);
        return h("button", { type: "button", class: "ng-mini", style: est && k.cor(est.cor) ? { "--cor": k.cor(est.cor) } : null, on: { click: () => N.abrirNegocio(k, n.id, { aoMudar: carregar }) } },
          h("i"), h("span", null, `${L.tituloCard(n)} · ${est ? est.nome : ""}`), h("b", null, ui.brl(n.status === "ganho" ? n.valor : n.valor_previsto, { centavos: false })));
      }));
      if (!(d.negocios || []).length) {
        negs.appendChild(h("p", { class: "fraco" }, `${k.v.nenhum("negocio")} por aqui.`));
        // plano 1000 (CR-235): a frase vira ação — uma oportunidade para alguém desta empresa (um contato: direto; vários: escolhe; nenhum: o formulário busca)
        if (k.pode("atendente")) {
          const btNeg = h("button", { type: "button", class: "bt bt-sec bt-p emp-novo-neg" }, ui.icone("mais"), `${typeof k.v.novo === "function" ? k.v.novo("negocio") : `Nov${k.v.art("negocio")} ${k.v.min("negocio")}`} para ${k.v.art("contato") === "a" ? "uma" : "um"} ${k.v.min("contato")} desta empresa`);
          const criar = contatoId => N.novoNegocio(k, contatoId != null ? { contato_id: contatoId } : {}, { aoCriar: () => carregar() });
          btNeg.addEventListener("click", () => {
            const cts = d.contatos || [];
            if (cts.length === 1) return criar(cts[0].id);
            if (!cts.length) return criar(null);
            ui.menu(btNeg, cts.slice(0, 12).map(c => ({ rotulo: c.nome || ui.telBR(c.telefone) || k.v.contato, icone: "contato", fn: () => criar(c.id) })));
          });
          negs.appendChild(btNeg);
        }
      }
      // campos personalizados da empresa (salva ao sair do campo)
      const campos = L.camposDe(k.base.campos, "empresa");
      let blocoCampos = null;
      if (campos.length) {
        const pode = k.pode("atendente");
        const form = h("form", { class: "crm-form", novalidate: true }, campos.map(cp => N.campoPersonalizado(k, cp, (e.campos || {})[cp.chave])));
        if (!pode) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
        form.addEventListener("change", async ev => {
          const cmp = ev.target.closest("[data-campo]");
          const cp = cmp && campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
          if (!cp) return;
          const { valores, erros } = N.lerCamposPersonalizados(k, form, [cp]);
          ui.marcarErro(form, cmp.dataset.campo, "");
          if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
          try { await k.api.rpcC("nx_empresa_salvar", { p_empresa: { id: e.id, campos: { [cp.chave]: valores[cp.chave] ?? null } } }); ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
          catch (err) { ui.marcarErro(form, cmp.dataset.campo, k.erro(err)); }
        });
        blocoCampos = h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")), form);
      }
      el.append(h("a", { class: "bt bt-fant bt-p fx-voltar", href: "#/empresas" }, ui.icone("seta-esq"), "Empresas"),
        h("div", { class: "fx" },
          h("section", { class: "fx-cab" }, ui.avatar(e.nome, e.id),
            h("div", { class: "fx-id" }, h("h1", null, e.nome), h("p", null,
              e.documento ? h("span", null, e.documento) : null, e.telefone ? h("span", null, ui.icone("telefone"), ui.telBR(e.telefone)) : null,
              e.email ? h("span", null, e.email) : null, e.cidade ? h("span", null, ui.icone("globo"), `${e.cidade}${e.uf ? `/${e.uf}` : ""}`) : null,
              // plano 1000 (CR-112): «www.empresa.com» vira link de verdade (https://)
              e.site ? h("a", { href: L.normalizarSite(e.site), target: "_blank", rel: "noopener noreferrer", class: "link" }, e.site) : null)),
            h("div", { class: "fx-acoes" },
              k.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec", on: { click: async () => { if (await formEmpresa(k, e)) carregar(); } } }, ui.icone("editar"), "Editar") : null,
              k.pode("admin") ? h("button", { type: "button", class: "bt bt-fant", on: { click: async () => {
                // plano 1000 (CR-109): a frase diz QUANTOS deixam de estar ligados
                const nCt = res.contatos;
                const txtCt = nCt ? `${ui.num(nCt)} ${nCt === 1 ? k.v.min("contato") : k.v.min("contatos")} deixa${nCt === 1 ? "" : "m"} de estar ligad${k.v.art("contato")}${nCt === 1 ? "" : "s"} a ela (os cadastros continuam).`
                  : `Nenhum ${k.v.min("contato")} está ligado a ela.`;
                if (!(await ui.confirmar({ titulo: `Excluir a empresa «${e.nome}»?`, texto: txtCt, perigo: true }))) return;
                try { await k.api.rpcC("nx_empresa_excluir", { p_id: e.id }); ui.toast("Empresa excluída.", { tipo: "ok" }); ctx.navegar("#/empresas", { substituir: true }); } catch (err) { k.toastErro(err); }
              } } }, ui.icone("lixeira"), "Excluir") : null)),
          resumo,
          e.obs ? h("p", { class: "aviso" }, ui.icone("nota"), h("span", null, e.obs)) : null,
          blocoCampos,
          h("div", { class: "fx-grade" },
            h("section", { class: "ng-bloco", "aria-label": k.v.contatos }, h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.contatos),
              h("div", { class: "linha" }, btLigar,
                (d.contatos || []).length ? h("a", { class: "bt bt-fant bt-p", href: `#/contatos?empresa=${encodeURIComponent(e.id)}&empresa_nome=${encodeURIComponent(e.nome || "")}` }, "Ver na lista") : null)), contatos),
            h("section", { class: "ng-bloco emp-negocios", "aria-label": k.v.negocios, tabindex: "-1" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.negocios)), negs))));
      if (focarNegocios) {
        focarNegocios = false;
        // depois do shell: ao fim do montar ele põe o foco no <h1> e volta a página ao topo (focarTitulo) — focar agora seria desfeito na hora
        setTimeout(() => {
          const sec = vivo && el.querySelector(".emp-negocios");
          if (sec) { try { sec.scrollIntoView({ block: "start", behavior: ui.comportamentoRolagem ? ui.comportamentoRolagem() : "auto" }); sec.focus({ preventScroll: true }); } catch { /* ok */ } }
        }, 0);
      }
    } catch (err) {
      if (!vivo) return;
      ui.limpar(el);
      el.appendChild(ui.erroCartao(err, carregar));
    }
  }
  await carregar();
  return { desmontar() { vivo = false; } };
}
