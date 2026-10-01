/* ============================================================
   ÓRBITA — relatorios.js (frente F6) · tela T13 Relatórios
   #/relatorios/vendas      → nx_rel_vendas      (funil, origem, responsável, perdas)
   #/relatorios/atendimento → nx_rel_atendimento (1ª resposta, atendentes, mapa de calor)
   Período 7/30/90 dias ou personalizado (até 1 ano); variação contra o
   período anterior do mesmo tamanho. Gráficos de graficos.js (SVG feito
   à mão, cores só de tokens, "Ver como tabela" em cada um) e CSV por bloco.
   ============================================================ */

const ABAS = [
  { id: "vendas", rotulo: "Vendas", hash: "#/relatorios/vendas" },
  { id: "atendimento", rotulo: "Atendimento", hash: "#/relatorios/atendimento" },
];
const CHAVE = "nx-app-rel";
let L = null, G = null, montagem = 0, graficos = [];

const lerPref = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch { return {}; } };
const gravarPref = p => { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* modo privado */ } };
function soltar() { for (const g of graficos) try { g.destruir(); } catch { /* ok */ } graficos = []; }

export function desmontar() { montagem++; soltar(); }

export async function montar(ctx) {
  desmontar();
  const minha = montagem;
  const { ui } = ctx;
  ui.carregarCss("relatorios.css");
  const aba = ABAS.some(a => a.id === ctx.rota.partes[0]) ? ctx.rota.partes[0] : "vendas";
  ctx.titulo(aba === "vendas" ? "Relatório de vendas" : "Relatório de atendimento");
  ui.limpar(ctx.alvo);
  const raiz = ui.h("section", { class: "rel relat", "aria-labelledby": "relat-h" });
  ctx.alvo.append(raiz);
  if (!L) {
    try { [L, G] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`)]); }
    catch (e) { raiz.append(ui.erroCartao(e, () => montar(ctx))); return; }
  }
  if (minha !== montagem) return;
  const h = G.criarH(ui);
  const V = ctx.vocab || {};
  const vcap = (k, p) => (V[k] || p);
  const fem = (typeof V.art === "function" ? V.art("negocio") : V.g_negocio) === "a";
  const abertosTxt = fem ? "abertas" : "abertos";
  const int = v => (Number.isFinite(+v) && v !== null ? Math.round(+v).toLocaleString("pt-BR") : "—");
  const brl0 = v => ui.brl(v, { centavos: false });
  const pctTxt = v => (Number.isFinite(+v) && v !== null ? `${String(+v).replace(".", ",")}%` : "—");
  const FMT = { int, brl0, pct: pctTxt, dias: v => (Number.isFinite(+v) && v !== null ? `${String(+v).replace(".", ",")} dias` : "—"), min: L.duracaoMin, h: L.duracaoH };

  // preferências (período e filtros) por pessoa, neste navegador
  const pref = lerPref();
  const P = {
    preset: [7, 30, 90, "per"].includes(pref.preset) ? pref.preset : 30,
    de: pref.de || null, ate: pref.ate || null,
    funil: (pref.funil && pref.funil[ctx.cliente.id]) || "",
    dep: (pref.dep && pref.dep[ctx.cliente.id]) || "",
  };
  const salvar = () => {
    const p = lerPref();
    gravarPref({ ...p, preset: P.preset, de: P.de, ate: P.ate,
      funil: { ...(p.funil || {}), [ctx.cliente.id]: P.funil }, dep: { ...(p.dep || {}), [ctx.cliente.id]: P.dep } });
  };
  const periodo = () => (P.preset === "per" && P.de && P.ate ? { de: P.de, ate: P.ate } : L.periodoPreset(P.preset === "per" ? 30 : P.preset));

  // ---------- topo: título, abas, filtros
  const nav = ui.segmentado({ tipo: "abas", rotulo: "Relatórios", valor: aba, classe: "rel-abas-seg",
    opcoes: ABAS.map(a => ({ valor: a.id, rotulo: a.rotulo })),
    aoMudar: v => { const a = ABAS.find(x => x.id === v); if (a) ctx.navegar(a.hash); } });
  const btnAtualizar = h("button", { type: "button", class: "rel-btn rel-btn-sec rel-btn-ic", title: "Atualizar os números" }, ui.icone("reabrir"), h("span", { class: "rel-rot" }, "Atualizar"));
  raiz.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Relatórios · ${ctx.cliente.nome}`),
      h("h1", { id: "relat-h", class: "rel-h1" }, aba === "vendas" ? "Vendas" : "Atendimento")),
    h("div", { class: "rel-topo-acoes" }, btnAtualizar)), nav);

  const filtros = h("div", { class: "rel-filtros relat-filtros" });
  const seg = h("div", { class: "rel-seg", role: "group", "aria-label": "Período" });
  const deIn = h("input", { type: "date", class: "relat-data", "aria-label": "De", value: P.de || "" });
  const ateIn = h("input", { type: "date", class: "relat-data", "aria-label": "Até", value: P.ate || "" });
  const aplicar = h("button", { type: "button", class: "rel-btn rel-btn-prim" }, "Aplicar");
  const erroPer = h("p", { class: "relat-erro", role: "alert" });
  erroPer.hidden = true;
  const personal = h("div", { class: "relat-per" }, h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, "De"), deIn),
    h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, "Até"), ateIn), aplicar, erroPer);
  const selWrap = h("label", { class: "relat-sel" });
  const legenda = h("p", { class: "rel-nota rel-ate", "aria-live": "polite" });
  let filtroExtra = null;       // {lista, atual, rotulo, todos, aoMudar} do funil (Vendas) ou do departamento (Atendimento): alimenta o chip e a folha
  const chipTxt = h("span", { class: "rel-resumo-t" }, "");
  const chipResumo = h("button", { type: "button", class: "rel-resumo", "aria-haspopup": "dialog", title: "Período e filtros" }, chipTxt, ui.icone("seta-baixo"));
  chipResumo.addEventListener("click", () => abrirFolha());
  filtros.append(chipResumo, h("div", { class: "rel-filtros-lg" }, seg, selWrap, personal), legenda);
  raiz.append(filtros);
  const corpo = h("div", { class: "rel-corpo", "aria-busy": "true" });
  raiz.append(corpo);

  function pintarSeg() {
    ui.limpar(seg);
    for (const [valor, rot] of [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], ["per", "Personalizado"]]) {
      const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(P.preset === valor) }, rot);
      b.addEventListener("click", () => {
        if (valor === "per") {
          P.preset = "per"; pintarSeg(); personal.hidden = false;
          if (!P.de || !P.ate) { const pp = L.periodoPreset(30); deIn.value = pp.de; ateIn.value = pp.ate; }
          deIn.focus();
          return;
        }
        P.preset = valor; personal.hidden = true; salvar(); pintarSeg(); carregar();
        const alvo = seg.querySelector('[aria-pressed="true"]');   // o botão foi recriado: o foco não cai no <body>
        if (alvo) alvo.focus();
      });
      seg.append(b);
    }
    personal.hidden = P.preset !== "per";
  }
  aplicar.addEventListener("click", () => {
    const v = L.validarPeriodo(deIn.value, ateIn.value);
    erroPer.hidden = v.ok;
    erroPer.textContent = v.ok ? "" : v.texto;
    if (!v.ok) { (v.erro === "periodo_grande" ? deIn : ateIn).focus(); return; }
    P.de = deIn.value; P.ate = ateIn.value; salvar(); carregar();
  });
  btnAtualizar.addEventListener("click", () => carregar());
  pintarSeg();
  pintarChip();

  function pintarChip() {
    const nome = filtroExtra && filtroExtra.atual ? ((filtroExtra.lista || []).find(x => x.id === filtroExtra.atual) || {}).nome || "" : "";
    chipTxt.textContent = L.textoChipRelatorios({ preset: P.preset, de: P.de, ate: P.ate, aba, nome });
  }
  /** O chip-resumo «Últimos 30 dias · Todos os funis ▾» abre esta folha: período (com datas) e funil/departamento, aplicados de uma vez. */
  async function abrirFolha() {
    let preset = P.preset, de = P.de || deIn.value || "", ate = P.ate || ateIn.value || "", extra = filtroExtra ? filtroExtra.atual : "";
    const campoSeg = (rotulo, el) => h("div", { class: "campo" }, h("p", { class: "rotulo" }, rotulo), el);
    const dataIn = (rotulo, valor, aoMudar) => { const i = h("input", { type: "date", class: "relat-data", "aria-label": rotulo, value: valor }); i.addEventListener("change", () => aoMudar(i.value)); return h("label", { class: "relat-per-c" }, h("span", { class: "rel-nota" }, rotulo), i); };
    const personal2 = h("div", { class: "relat-per" }, dataIn("De", de, v => { de = v; }), dataIn("Até", ate, v => { ate = v; }));
    personal2.hidden = preset !== "per";
    const segPer = ui.segmentado({ tipo: "filtro", rotulo: "Período", valor: preset, opcoes: [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], ["per", "Outro"]].map(([v, t]) => ({ valor: v, rotulo: t })),
      aoMudar: v => {
        preset = v; personal2.hidden = v !== "per";
        if (v === "per" && (!de || !ate)) { const pp = L.periodoPreset(30); de = pp.de; ate = pp.ate; for (const [i, val] of [...personal2.querySelectorAll("input")].map((x, k) => [x, k ? ate : de])) i.value = val; }
      } });
    let sel = null;
    if (filtroExtra && filtroExtra.lista && filtroExtra.lista.length) {
      sel = h("select", { class: "sel relat-select", "aria-label": filtroExtra.rotulo },
        h("option", { value: "" }, filtroExtra.todos), filtroExtra.lista.map(x => h("option", { value: x.id, selected: x.id === extra }, x.nome)));
      sel.addEventListener("change", () => { extra = sel.value; });
    }
    const r = await ui.modal({ titulo: "Período e filtros", largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, campoSeg("Período", segPer), personal2, sel ? campoSeg(filtroExtra.rotulo, sel) : null),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: api => {
        if (preset === "per") {
          const v = L.validarPeriodo(de, ate);
          if (!v.ok) { api.erro(v.texto); return false; }
        }
        return true;
      } }] });
    if (r !== true) return;
    const mudouExtra = filtroExtra && extra !== filtroExtra.atual;
    P.preset = preset;
    if (preset === "per") { P.de = de; P.ate = ate; deIn.value = de; ateIn.value = ate; }
    if (mudouExtra) { if (aba === "vendas") P.funil = extra; else P.dep = extra; }
    salvar(); pintarSeg(); pintarChip(); carregar();
    setTimeout(() => chipResumo.focus(), 220);      // depois de a folha devolver o foco (o botão que a abriu é o mesmo)
  }

  function montarSelect(lista, atual, rotulo, todos, aoMudar) {
    filtroExtra = lista && lista.length ? { lista, atual, rotulo, todos, aoMudar } : null;
    pintarChip();
    const tinhaFoco = selWrap.contains(document.activeElement);   // trocou o funil pelo teclado: o foco fica no seletor novo
    ui.limpar(selWrap);
    if (!lista || !lista.length) { selWrap.hidden = true; return; }
    selWrap.hidden = false;
    const s = h("select", { class: "sel relat-select", "aria-label": rotulo },
      h("option", { value: "" }, todos),
      lista.map(x => h("option", { value: x.id, selected: x.id === atual }, x.nome)));
    s.addEventListener("change", () => aoMudar(s.value));
    selWrap.append(s);
    if (tinhaFoco) s.focus();
  }

  // ---------- carga
  let pedido = 0;
  async function carregar() {
    const n = ++pedido;
    soltar();
    corpo.setAttribute("aria-busy", "true");
    ui.limpar(corpo);
    corpo.append(ui.esqueleto("cartoes", 6));
    const { de, ate } = periodo();
    legenda.textContent = `${L.dataIsoBR(de)} a ${L.dataIsoBR(ate)} · comparado com os ${L.difDias(de, ate) + 1} dias anteriores`;
    btnAtualizar.disabled = true;
    try {
      const r = aba === "vendas"
        ? await ctx.api.rpcC("nx_rel_vendas", { p_de: de, p_ate: ate, p_funil: P.funil || null })
        : await ctx.api.rpcC("nx_rel_atendimento", { p_de: de, p_ate: ate, p_departamento: P.dep || null });
      if (n !== pedido || minha !== montagem) return;
      ui.limpar(corpo);
      corpo.setAttribute("aria-busy", "false");
      if (aba === "vendas") desenharVendas(r); else desenharAtendimento(r);
    } catch (e) {
      if (n !== pedido || minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      // filtro que não existe mais (funil/departamento apagado): volta para "todos" e tenta de novo, uma vez
      if (e && e.codigo === "dados_invalidos" && (P.funil || P.dep) && /p_funil|p_departamento/.test(String(e.hint || ""))) {
        P.funil = ""; P.dep = ""; salvar(); return carregar();
      }
      ui.limpar(corpo);
      corpo.setAttribute("aria-busy", "false");
      corpo.append(ui.erroCartao(e, () => carregar()));
    } finally { if (n === pedido) btnAtualizar.disabled = false; }
  }

  // ---------- peças comuns
  function kpis(lista) {
    const g = h("div", { class: "rel-kpis rel-kpis-6" });
    lista.forEach((k, i) => {
      // valor ou base ausentes ficam null (+null seria 0: «—» ganhava um falso ▼ 100%); sem base o chip diz «sem base», neutro
      const vv = k.v === null || k.v === undefined ? null : +k.v;
      const c = L.chipVar(vv, k.a == null ? null : +k.a, k.sentido);
      const b = h("b", { class: "rel-num rel-kpi-v" });
      if (vv === null || !Number.isFinite(vv)) b.textContent = "—";
      else if (k.fmt === "min" || k.fmt === "h" || k.fmt === "pct" || k.fmt === "dias") b.textContent = FMT[k.fmt](vv);
      else if (k.fmt === "brl0") L.contarMoeda(ui, G, b, vv, { centavos: false });     // "R$" a 60 %, colado ao valor
      else G.contar(b, vv, FMT[k.fmt]);
      g.append(h("div", { class: "rel-kpi rel-cartao rel-entra", style: `--i:${i}` },
        h("span", { class: "rel-kpi-l" }, k.rotulo), b,
        k.agora ? h("span", { class: "rel-kpi-linha" }, h("span", { class: "rel-nota" }, "agora"))   // só o estado de agora (abertas agora) não tem período anterior
          : h("span", { class: "rel-kpi-linha" },
            h("span", { class: `rel-var rel-var-${c.cls}`, title: `antes: ${k.a == null ? "—" : FMT[k.fmt](+k.a)}` }, c.v == null ? c.txt : `${c.seta} ${c.txt}`),
            h("span", { class: "rel-nota" }, "vs. período anterior")),
        k.extra ? h("span", { class: "rel-kpi-extra" }, k.extra) : null));
    });
    return g;
  }
  function cartao(titulo, { sub, largo, csv } = {}) {
    const alvo = h("div", { class: "rel-grafico" });
    const rodape = h("div", { class: "rel-cartao-rodape" });
    const c = h("section", { class: `rel-cartao rel-entra relat-bloco${largo ? " relat-largo" : ""}` },
      h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, titulo), sub ? h("p", { class: "rel-nota" }, sub) : null), alvo, rodape);
    if (csv) {
      const b = h("button", { type: "button", class: "g-ver-tabela relat-csv", title: "Baixar este bloco em CSV (abre no Excel)" }, "CSV");
      b.addEventListener("click", () => baixarCsv(csv.nome, csv.colunas, csv.linhas()));
      rodape.append(b);
    }
    return { c, alvo, rodape };
  }
  function baixarCsv(nome, colunas, linhas) {
    const { de, ate } = periodo();
    const url = URL.createObjectURL(new Blob([L.csv(colunas, linhas)], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: `${nome}-${de}-a-${ate}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function tabelaSimples({ colunas, linhas, legenda: leg }) {
    return h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": leg }, h("table", { class: "rel-tabela relat-tabela" },
      h("caption", { class: "sr-only" }, leg),
      h("thead", {}, h("tr", {}, colunas.map((c, j) => h("th", { scope: "col", class: j ? "num" : "" }, c)))),
      h("tbody", {}, linhas.map((l, i) => h("tr", { style: `--i:${i}` }, l.map((v, j) => j ? h("td", { class: "num", dataset: { l: colunas[j] } }, v) : h("th", { scope: "row" }, v)))))));
  }
  function semDados(msg = "Sem dados no período.") {
    return h("div", { class: "rel-cartao relat-vazio rel-entra" }, ui.vazio({ titulo: msg, texto: "Escolha outro período ou outro filtro.", icone: "grafico" }));
  }

  // ---------- VENDAS
  function desenharVendas(r) {
    montarSelect(r.funis, P.funil, "Funil", "Todos os funis", v => { P.funil = v; salvar(); carregar(); });
    corpo.append(kpis(L.kpisVendas(r, { negocios: typeof V.min === "function" ? V.min("negocios") : "negócios" })));
    const k = r.kpis || {};
    corpo.append(h("div", { class: "relat-carteira rel-cartao rel-entra" },
      h("p", { class: "rel-olho" }, "Carteira agora"),
      h("p", {}, h("b", { class: "rel-num" }, int(k.abertos)), ` ${V.min ? V.min("negocios") : "negócios"} ${abertosTxt} · `,
        h("b", { class: "rel-num" }, brl0(k.valor_aberto)), " previstos · ",
        h("b", { class: "rel-num" }, brl0(k.previsao_ponderada)), " na previsão ponderada"),
      +k.perdidos ? h("p", { class: "rel-nota" }, `${k.perdidos} ${fem ? (+k.perdidos === 1 ? "perdida" : "perdidas") : (+k.perdidos === 1 ? "perdido" : "perdidos")} no período (${brl0(k.valor_perdido)} previstos)`) : null));
    if (L.vendasVazio(r)) { corpo.append(semDados()); return; }

    const grade = h("div", { class: "relat-grade" });
    corpo.append(grade);

    // funil por etapa
    const fr = r.funil_ref;
    const bf = cartao(fr ? `Funil «${fr.nome}»` : "Funil", { sub: "Quantos estão em cada etapa agora (ganhos e perdidos: fechados no período) e quantos seguiram adiante.", largo: true,
      csv: { nome: "funil", colunas: ["Etapa", "Agora", "Valor", "Entraram no período", "Seguiram", "Conversão %"],
        linhas: () => (r.funil || []).map(e => [e.nome, e.qtd_atual, e.valor_atual, e.passaram, e.avancaram, e.conversao_proxima_pct ?? ""]) } });
    grade.append(bf.c);
    if ((r.funil || []).length) {
      graficos.push(G.funil(bf.alvo, {
        resumo: `Funil ${fr ? fr.nome : ""}: ${(r.funil || []).map(e => `${e.nome} ${e.qtd_atual}`).join(", ")}`,
        etapas: (r.funil || []).map(e => ({ nome: e.nome, cor: ui.corOk(e.cor), tipo: e.tipo, qtd: +e.qtd_atual || 0, valorTxt: brl0(e.valor_atual), conversao: L.textoConversao(e) })),
      }));
      G.alternarTabela(bf.rodape, bf.alvo, { legenda: "Funil por etapa", colunas: ["Etapa", "Agora", "Valor", "Entraram", "Seguiram"],
        linhas: (r.funil || []).map(e => [e.nome, int(e.qtd_atual), brl0(e.valor_atual), int(e.passaram), e.tipo === "aberto" ? pctTxt(e.conversao_proxima_pct) : "—"]) });
    } else bf.alvo.append(h("p", { class: "rel-vazio-txt" }, "Nenhum funil ativo."));

    // série diária
    const serie = r.serie || [];
    const bs = cartao("Dia a dia", { sub: "Criados × ganhos por dia (fuso de São Paulo).", largo: true,
      csv: { nome: "vendas-dia-a-dia", colunas: ["Dia", "Criados", "Ganhos", "Receita"], linhas: () => serie.map(d => [L.dataIsoBR(d.d), d.criados, d.ganhos, d.receita]) } });
    grade.append(bs.c);
    graficos.push(G.linha(bs.alvo, {
      resumo: `Criados e ganhos por dia: ${serie.reduce((s, d) => s + (+d.criados || 0), 0)} criados e ${serie.reduce((s, d) => s + (+d.ganhos || 0), 0)} ganhos`,
      pontos: serie.map(d => ({ rotulo: L.ddmmIso(d.d), longo: `${L.diaLongoIso(d.d)} · receita ${brl0(d.receita)}`, valores: [+d.criados || 0, +d.ganhos || 0] })),
      series: [{ nome: "Criados", classe: "g-s1" }, { nome: "Ganhos", classe: "g-s0" }],
      fmt: v => int(v), fmtEixo: v => int(v),
    }));
    G.alternarTabela(bs.rodape, bs.alvo, { legenda: "Criados e ganhos por dia", colunas: ["Dia", "Criados", "Ganhos", "Receita"],
      linhas: serie.map(d => [L.dataIsoBR(d.d), int(d.criados), int(d.ganhos), brl0(d.receita)]) });

    // por origem
    const orig = r.por_origem || [];
    const bo = cartao("Por origem", { sub: "Quem chegou × quem fechou, por canal de entrada.",
      csv: { nome: "vendas-por-origem", colunas: ["Origem", "Criados", "Ganhos", "Perdidos", "Receita", "Conversão %"],
        linhas: () => orig.map(o => [L.nomeOrigem(o.origem, o.plataforma), o.criados, o.ganhos, o.perdidos, o.receita, o.conversao_pct ?? ""]) } });
    grade.append(bo.c);
    if (orig.length) {
      graficos.push(G.barras(bo.alvo, {
        resumo: `Por origem: ${orig.map(o => `${L.nomeOrigem(o.origem, o.plataforma)} ${o.criados} criados e ${o.ganhos} ganhos`).join("; ")}`,
        itens: orig.map(o => ({ rotulo: L.nomeOrigem(o.origem, o.plataforma), extra: `${brl0(o.receita)}${o.conversao_pct != null ? ` · ${pctTxt(o.conversao_pct)} conversão` : ""}`, valores: [+o.criados || 0, +o.ganhos || 0] })),
        series: [{ nome: "Criados", classe: "g-s1" }, { nome: "Ganhos", classe: "g-s0" }], fmt: int,
      }));
      G.alternarTabela(bo.rodape, bo.alvo, { legenda: "Por origem", colunas: ["Origem", "Criados", "Ganhos", "Receita", "Conversão"],
        linhas: orig.map(o => [L.nomeOrigem(o.origem, o.plataforma), int(o.criados), int(o.ganhos), brl0(o.receita), pctTxt(o.conversao_pct)]) });
    } else bo.alvo.append(h("p", { class: "rel-vazio-txt" }, "Sem negócios no período."));

    // motivos de perda
    const mot = r.motivos_perda || [];
    const bm = cartao("Motivos de perda", { sub: `${vcap("negocios", "Negócios")} ${fem ? "perdidas" : "perdidos"} no período, por motivo.`,
      csv: { nome: "motivos-de-perda", colunas: ["Motivo", "Quantidade", "Valor previsto"], linhas: () => mot.map(m => [m.nome, m.qtd, m.valor]) } });
    grade.append(bm.c);
    if (mot.length) {
      const tot = mot.reduce((s, m) => s + (+m.qtd || 0), 0);
      graficos.push(G.rosca(bm.alvo, {
        resumo: `Motivos de perda: ${mot.map(m => `${m.nome} ${m.qtd}`).join(", ")}`,
        fatias: mot.map(m => ({ rotulo: m.nome, valor: +m.qtd || 0, extra: `${brl0(m.valor)} previstos` })),
        fmt: int, centro: { valor: tot, rotulo: fem ? (tot === 1 ? "perdida" : "perdidas") : (tot === 1 ? "perdido" : "perdidos") },
      }));
      G.alternarTabela(bm.rodape, bm.alvo, { legenda: "Motivos de perda", colunas: ["Motivo", "Quantidade", "%", "Valor previsto"],
        linhas: mot.map(m => [m.nome, int(m.qtd), tot ? pctTxt(Math.round((+m.qtd || 0) / tot * 1000) / 10) : "—", brl0(m.valor)]) });
    } else bm.alvo.append(h("p", { class: "rel-vazio-txt" }, "Nenhuma perda no período."));

    // por responsável
    const dono = r.por_dono || [];
    const bd = cartao("Por responsável", { largo: true,
      csv: { nome: "vendas-por-responsavel", colunas: ["Responsável", "Criados", "Ganhos", "Receita", "Ticket médio", "Abertos"],
        linhas: () => dono.map(d => [d.nome, d.criados, d.ganhos, d.receita, d.ticket_medio ?? "", d.abertos]) } });
    grade.append(bd.c);
    bd.alvo.append(dono.length ? tabelaSimples({ legenda: "Vendas por responsável", colunas: ["Responsável", "Criados", "Ganhos", "Receita", "Ticket médio", "Abertos agora"],
      linhas: dono.map(d => [d.nome, int(d.criados), int(d.ganhos), brl0(d.receita), d.ticket_medio == null ? "—" : brl0(d.ticket_medio), int(d.abertos)]) })
      : h("p", { class: "rel-vazio-txt" }, "Sem negócios no período."));

    // parados
    const par = r.parados || [];
    const bp = cartao("Parados há mais de 7 dias", { largo: true, sub: `${vcap("negocios", "Negócios")} ${abertosTxt} que não mudam de etapa há uma semana.` });
    grade.append(bp.c);
    if (par.length) {
      const ul = h("ul", { class: "relat-parados" });
      par.forEach(p => {
        const cor = ui.corOk(p.cor);
        ul.append(h("li", {}, h("i", { class: "g-fcor", style: cor ? { "--cor": cor } : null }), h("span", {}, p.nome), h("b", { class: "rel-num" }, int(p.qtd))));
      });
      bp.alvo.append(ul);
      if (ctx.temModulo("crm") && ctx.pronto("crm") && fr) bp.rodape.append(h("a", { class: "rel-link", href: `#/crm?funil=${encodeURIComponent(fr.id)}` }, "Abrir o funil"));
    } else bp.alvo.append(h("p", { class: "rel-vazio-txt" }, "Nada parado. Tudo andando."));
  }

  // ---------- ATENDIMENTO
  function desenharAtendimento(r) {
    montarSelect(r.departamentos, P.dep, "Departamento", "Todos os departamentos", v => { P.dep = v; salvar(); carregar(); });
    corpo.append(kpis(L.kpisAtendimento(r)));
    if (L.atendimentoVazio(r)) { corpo.append(semDados()); return; }
    const grade = h("div", { class: "relat-grade" });
    corpo.append(grade);

    // série novas × resolvidas
    const serie = r.serie || [];
    const bs = cartao("Dia a dia", { sub: "Conversas novas × resolvidas por dia (fuso de São Paulo).", largo: true,
      csv: { nome: "atendimento-dia-a-dia", colunas: ["Dia", "Novas", "Resolvidas"], linhas: () => serie.map(d => [L.dataIsoBR(d.d), d.novas, d.resolvidas]) } });
    grade.append(bs.c);
    graficos.push(G.linha(bs.alvo, {
      resumo: `Novas e resolvidas por dia: ${serie.reduce((s, d) => s + (+d.novas || 0), 0)} novas e ${serie.reduce((s, d) => s + (+d.resolvidas || 0), 0)} resolvidas`,
      pontos: serie.map(d => ({ rotulo: L.ddmmIso(d.d), longo: L.diaLongoIso(d.d), valores: [+d.novas || 0, +d.resolvidas || 0] })),
      series: [{ nome: "Novas", classe: "g-s1" }, { nome: "Resolvidas", classe: "g-s2" }], fmt: int, fmtEixo: int,
    }));
    G.alternarTabela(bs.rodape, bs.alvo, { legenda: "Novas e resolvidas por dia", colunas: ["Dia", "Novas", "Resolvidas"],
      linhas: serie.map(d => [L.dataIsoBR(d.d), int(d.novas), int(d.resolvidas)]) });

    // mapa de calor
    const m = L.matrizCalor(r.mapa_calor);
    const pico = L.picoCalor(m);
    const bc = cartao("Quando os clientes chamam", { sub: pico ? `Mensagens recebidas por dia e hora (São Paulo). Pico: ${L.SEMANA[pico.dow]} às ${String(pico.hora).padStart(2, "0")}h.` : "Mensagens recebidas por dia e hora (São Paulo).", largo: true,
      csv: { nome: "mapa-de-calor", colunas: ["Dia", ...Array.from({ length: 24 }, (_, i) => `${i}h`)], linhas: () => [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...m[d]]) } });
    grade.append(bc.c);
    graficos.push(G.calor(bc.alvo, { matriz: m, dias: L.SEMANA, fmt: v => `${int(v)} ${+v === 1 ? "mensagem" : "mensagens"}`,
      resumo: pico ? `Mapa de calor das mensagens recebidas; o horário de pico é ${L.SEMANA[pico.dow]} às ${pico.hora} horas` : "Mapa de calor sem mensagens no período" }));
    G.alternarTabela(bc.rodape, bc.alvo.querySelector(".g-cal-rolagem") || bc.alvo, { legenda: "Mensagens recebidas por dia da semana e hora",
      colunas: ["Dia", "Madrugada (0–5h)", "Manhã (6–11h)", "Tarde (12–17h)", "Noite (18–23h)"],
      linhas: [1, 2, 3, 4, 5, 6, 0].map(d => [L.SEMANA[d], ...[0, 6, 12, 18].map(i => int(m[d].slice(i, i + 6).reduce((s, x) => s + x, 0)))]) });

    // por atendente
    const at = r.por_atendente || [];
    const ba = cartao("Por atendente", { largo: true,
      csv: { nome: "atendimento-por-atendente", colunas: ["Atendente", "Conversas", "Resolvidas", "1ª resposta (min)", "Mensagens enviadas"],
        linhas: () => at.map(a => [a.nome, a.conversas, a.resolvidas, a.tpr_mediana_min ?? "", a.msgs_out]) } });
    grade.append(ba.c);
    ba.alvo.append(at.length ? tabelaSimples({ legenda: "Atendimento por atendente", colunas: ["Atendente", "Conversas", "Resolvidas", "1ª resposta (mediana)", "Mensagens enviadas"],
      linhas: at.map(a => [a.nome, int(a.conversas), int(a.resolvidas), L.duracaoMin(a.tpr_mediana_min), int(a.msgs_out)]) })
      : h("p", { class: "rel-vazio-txt" }, "Nenhum atendimento atribuído no período."));

    // por departamento
    const dep = r.por_departamento || [];
    const bdp = cartao("Por departamento", { csv: { nome: "atendimento-por-departamento", colunas: ["Departamento", "Novas", "Resolvidas", "Abertas agora", "1ª resposta (min)"],
      linhas: () => dep.map(d => [d.nome, d.novas, d.resolvidas, d.abertas_agora, d.tpr_mediana_min ?? ""]) } });
    grade.append(bdp.c);
    if (dep.length) {
      graficos.push(G.barras(bdp.alvo, { resumo: `Por departamento: ${dep.map(d => `${d.nome} ${d.novas} novas`).join(", ")}`,
        itens: dep.map(d => ({ rotulo: d.nome, extra: `1ª resposta ${L.duracaoMin(d.tpr_mediana_min)} · ${d.abertas_agora} abertas agora`, valores: [+d.novas || 0, +d.resolvidas || 0] })),
        series: [{ nome: "Novas", classe: "g-s1" }, { nome: "Resolvidas", classe: "g-s2" }], fmt: int }));
      G.alternarTabela(bdp.rodape, bdp.alvo, { legenda: "Atendimento por departamento", colunas: ["Departamento", "Novas", "Resolvidas", "Abertas agora", "1ª resposta"],
        linhas: dep.map(d => [d.nome, int(d.novas), int(d.resolvidas), int(d.abertas_agora), L.duracaoMin(d.tpr_mediana_min)]) });
    } else bdp.alvo.append(h("p", { class: "rel-vazio-txt" }, "Sem conversas no período."));

    // por número
    const can = r.por_canal || [];
    const bn = cartao("Por número", { csv: { nome: "atendimento-por-numero", colunas: ["Número", "Novas", "Recebidas", "Enviadas"],
      linhas: () => can.map(c => [c.numero_exibicao ? `${c.nome} (${c.numero_exibicao})` : c.nome, c.novas, c.msgs_in, c.msgs_out]) } });
    grade.append(bn.c);
    if (can.length) {
      graficos.push(G.barras(bn.alvo, { resumo: `Por número: ${can.map(c => `${c.nome} ${c.msgs_in} recebidas e ${c.msgs_out} enviadas`).join("; ")}`,
        itens: can.map(c => ({ rotulo: c.nome, extra: `${c.numero_exibicao ? `${c.numero_exibicao} · ` : ""}${int(c.novas)} ${+c.novas === 1 ? "conversa nova" : "conversas novas"}`, valores: [+c.msgs_in || 0, +c.msgs_out || 0] })),
        series: [{ nome: "Recebidas", classe: "g-s1" }, { nome: "Enviadas", classe: "g-s0" }], fmt: int }));
      G.alternarTabela(bn.rodape, bn.alvo, { legenda: "Mensagens por número", colunas: ["Número", "Conversas novas", "Recebidas", "Enviadas"],
        linhas: can.map(c => [c.numero_exibicao ? `${c.nome} · ${c.numero_exibicao}` : c.nome, int(c.novas), int(c.msgs_in), int(c.msgs_out)]) });
    } else bn.alvo.append(h("p", { class: "rel-vazio-txt" }, "Sem mensagens no período."));
  }

  await carregar();
}
