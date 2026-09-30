/* ============================================================
   ÓRBITA — anuncios.js (frente F6) · tela T11 Anúncios
   O Nexus Ads dentro do app: carrega nx_dados(p_dias = 130) e monta
   com o MESMO web/nucleo.js do painel clássico (datasetDeLinhas +
   montar). As contas do período vêm de rel-logica.numerosPeriodo, que
   é cópia fiel da do painel — os números nunca discordam (teste de
   igualdade em testes/relatorios.teste.mjs).
   Rotas: #/anuncios · #/anuncios/campanhas · #/anuncios/radar ·
          #/anuncios/relatorios
   ============================================================ */

const DIAS_JANELA = 130;             // igual ao painel clássico
const VALIDADE_MS = 5 * 60 * 1000;   // números do Ads mudam de hora em hora
const PERIODOS = [7, 30, 60];
const PLATS = [["", "Tudo"], ["meta", "Meta"], ["google", "Google"]];
const ABAS = [
  { id: "", rotulo: "Visão geral", hash: "#/anuncios" },
  { id: "campanhas", rotulo: "Campanhas", hash: "#/anuncios/campanhas" },
  { id: "radar", rotulo: "Radar", hash: "#/anuncios/radar" },
  { id: "relatorios", rotulo: "Relatórios", hash: "#/anuncios/relatorios" },
];

let N = null, L = null, G = null;    // nucleo.js, rel-logica.js, graficos.js
const cache = new Map();             // clienteId → {dados, M, em}
const S = { dias: 30, plat: "", ordem: { chave: "gasto", dir: -1 }, rel: null, rank: null };
let graficos = [], tPilula = 0, montagem = 0;

const lerLocal = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* modo privado */ } };
const voc = (ctx, chave, padrao) => {
  const v = ctx.vocab;
  const r = typeof v === "function" ? v(chave) : v && v[chave];
  return typeof r === "string" && r ? r : padrao;
};
const eGestor = ctx => ctx.papel === "gestor" || ctx.papel === "super";

function soltarGraficos() { for (const g of graficos) { try { g.destruir(); } catch { /* já foi */ } } graficos = []; }

export function desmontar() { soltarGraficos(); clearInterval(tPilula); tPilula = 0; montagem++; }

export async function montar(ctx) {
  const minha = ++montagem;
  soltarGraficos();
  clearInterval(tPilula);
  const { ui } = ctx;
  const v = ctx.versao;
  ui.carregarCss("relatorios.css");
  ctx.titulo("Anúncios");
  if (!N) {
    try {
      [N, L, G] = await Promise.all([import(`../nucleo.js?v=${v}`), import(`./rel-logica.js?v=${v}`), import(`./graficos.js?v=${v}`)]);
    } catch (e) {
      ui.limpar(ctx.alvo);
      ctx.alvo.append(ui.erroCartao(e, () => montar(ctx)));
      return;
    }
    if (minha !== montagem) return;
  }
  const h = G.criarH(ui);
  S.dias = PERIODOS.includes(+lerLocal("nx-app-ads-dias", 30)) ? +lerLocal("nx-app-ads-dias", 30) : 30;
  S.plat = ["", "meta", "google"].includes(lerLocal("nx-app-ads-plat", "")) ? lerLocal("nx-app-ads-plat", "") : "";
  S.rank = L.RANK_CRI.some(([k]) => k === lerLocal("nx-app-ads-rank", "")) ? lerLocal("nx-app-ads-rank", "") : "receita";

  const aba = ABAS.some(a => a.id === (ctx.rota.partes[0] || "")) ? (ctx.rota.partes[0] || "") : "";
  ui.limpar(ctx.alvo);
  const raiz = h("section", { class: "rel ads", "aria-labelledby": "ads-h" });
  ctx.alvo.append(raiz);

  // topo: título, pílula de conexão, atualizar, atalhos do gestor
  const pilula = h("span", { class: "ads-pilula", role: "status" });
  pilula.hidden = true;
  const btnAtualizar = h("button", { type: "button", class: "rel-btn rel-btn-sec", on: { click: () => recarregar(true) } }, "Atualizar");
  const acoes = h("div", { class: "rel-topo-acoes" }, pilula, btnAtualizar);
  if (eGestor(ctx)) {
    acoes.append(h("a", { class: "rel-btn rel-btn-sec", href: "#/config/anuncios" }, "Ajustes de anúncios"));
    acoes.append(h("a", { class: "rel-link", href: "https://jpfamelli.github.io/nexus-ads/", target: "_blank", rel: "noopener noreferrer" }, "Painel de apresentação ↗"));
  }
  const tituloAba = (ABAS.find(a => a.id === aba) || ABAS[0]).rotulo;
  raiz.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Anúncios · ${ctx.cliente.nome}`), h("h1", { id: "ads-h", class: "rel-h1" }, tituloAba)),
    acoes));

  // abas (navegação por rota)
  const nav = h("nav", { class: "rel-abas", "aria-label": "Seções de Anúncios" });
  const badge = h("span", { class: "rel-badge", "aria-label": "" });
  badge.hidden = true;
  for (const a of ABAS) {
    const link = h("a", { href: a.hash, class: "rel-aba" }, a.rotulo);
    if (a.id === aba) link.setAttribute("aria-current", "page");
    if (a.id === "radar") link.append(badge);
    nav.append(link);
  }
  raiz.append(nav);

  const faixa = h("div", { class: "rel-faixa rel-faixa-ruim", role: "alert" });
  faixa.hidden = true;
  const filtros = h("div", { class: "rel-filtros" });
  // sem aria-live aqui: o corpo inteiro (com números que "contam") seria lido a cada filtro
  const corpo = h("div", { class: "rel-corpo", "aria-busy": "true" });
  raiz.append(faixa, filtros, corpo);

  async function recarregar(forcar) {
    const id = ctx.cliente.id;
    let item = cache.get(id);
    if (forcar || !item || Date.now() - item.em > VALIDADE_MS) {
      if (!item) { ui.limpar(corpo); corpo.append(ui.esqueleto(aba === "campanhas" ? "tabela" : aba ? "lista" : "cartoes", aba ? 6 : 4)); }
      corpo.setAttribute("aria-busy", "true");
      btnAtualizar.disabled = true;
      try {
        const dados = await ctx.api.rpcC("nx_dados", { p_dias: DIAS_JANELA }) || {};
        const M = N.montar(N.datasetDeLinhas({ metricas: dados.metricas || [], leads: dados.leads || [],
          cliente: dados.cliente || { nome: ctx.cliente.nome, cfg: {} }, hoje: dados.hoje || N.hojeSP(), dias: DIAS_JANELA }));
        item = { dados, M, em: Date.now() };
        cache.set(id, item);
        if (forcar) ui.toast("Números atualizados.", { tipo: "ok", ms: 2500 });
      } catch (e) {
        if (minha !== montagem) return;
        corpo.setAttribute("aria-busy", "false");
        if (e && e.codigo === "sessao_invalida") return;
        if (item && forcar) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora. Tente de novo em instantes.", { tipo: "erro" }); return; }
        ui.limpar(corpo);
        corpo.append(ui.erroCartao(e, () => recarregar(true)));
        return;
      } finally { btnAtualizar.disabled = false; }
    }
    if (minha !== montagem) return;
    desenhar(item);
  }

  function desenhar({ dados, M }) {
    soltarGraficos();
    corpo.setAttribute("aria-busy", "false");
    // pílula de conexão + faixa de queda (em todas as abas)
    const pintarPilula = () => {
      const e = L.estadoIntegracao(dados.integracoes || [], dados.alertas || []);
      pilula.hidden = e.nivel === "nenhuma";
      pilula.className = `ads-pilula ads-p-${e.nivel}`;
      pilula.textContent = L.textoPilula(e);
      pilula.title = e.canais.map(c => `${L.nomePlat(c.canal)}: ${c.sync ? `lida ${L.quandoSP(c.sync)}` : "ainda não leu"}`).join(" · ");
      faixa.hidden = !e.erros.length;
      ui.limpar(faixa);
      if (e.erros.length) {
        faixa.append(h("p", {}, L.textoQueda(e.erros)),
          eGestor(ctx) ? h("a", { class: "rel-btn rel-btn-prim", href: "#/config/anuncios" }, "Refazer a conexão")
            : h("p", { class: "rel-nota" }, "A equipe de gestão já foi avisada e está resolvendo."));
      }
    };
    pintarPilula();
    clearInterval(tPilula);
    tPilula = setInterval(() => { if (!document.hidden && pilula.isConnected) pintarPilula(); }, 30000);
    const radar = L.montarRadar(M, dados);
    badge.hidden = !radar.ativos;
    badge.textContent = String(radar.ativos);
    badge.setAttribute("aria-label", `${radar.ativos} ${radar.ativos === 1 ? "alerta ativo" : "alertas ativos"}`);

    // filtros (período e plataforma) só onde fazem sentido
    ui.limpar(filtros);
    filtros.hidden = !(aba === "" || aba === "campanhas") || L.semAnuncios(M);
    if (!filtros.hidden) {
      filtros.append(segmento("Período", PERIODOS.map(d => [d, `${d} dias`]), S.dias, d => { S.dias = d; gravarLocal("nx-app-ads-dias", d); desenhar({ dados, M }); }),
        segmento("Plataforma", PLATS, S.plat, p => { S.plat = p; gravarLocal("nx-app-ads-plat", p); desenhar({ dados, M }); }),
        h("p", { class: "rel-nota rel-ate" }, `Números até ontem, ${M.dataBR(M.R)}`));
    }

    ui.limpar(corpo);
    if (aba === "radar") return abaRadar(M, dados, radar);
    if (aba === "relatorios") return abaRelatorios(M, dados);
    if (L.semAnuncios(M)) return corpo.append(vazioAds());
    if (aba === "campanhas") return abaCampanhas(M);
    return abaGeral(M);
  }

  function segmento(rotulo, opcoes, atual, aoMudar) {
    const g = h("div", { class: "rel-seg", role: "group", "aria-label": rotulo });
    for (const [valor, texto] of opcoes) {
      const b = h("button", { type: "button", class: "rel-seg-b", "aria-pressed": String(valor === atual) }, texto);
      b.addEventListener("click", () => {
        if (valor === atual) return;
        aoMudar(valor);
        // o redesenho troca os botões: o foco do teclado volta para o botão escolhido (nunca cai no <body>)
        const novo = [...raiz.querySelectorAll(".rel-seg")].find(x => x.getAttribute("aria-label") === rotulo);
        const alvo = novo && novo.querySelector('[aria-pressed="true"]');
        if (alvo) alvo.focus();
      });
      g.append(b);
    }
    return g;
  }

  function vazioAds() {
    return eGestor(ctx)
      ? ui.vazio({ titulo: "Nenhum número de anúncio ainda", texto: "Conecte o Meta/Google em Configurações → Anúncios.", acao: { rotulo: "Abrir Ajustes de anúncios", fn: () => ctx.navegar("#/config/anuncios") } })
      : ui.vazio({ titulo: "Nenhum número de anúncio ainda", texto: "Os números aparecem aqui assim que os anúncios começarem a rodar." });
  }

  const num = (valor, fmt, cls = "") => {
    const b = h("b", { class: `rel-num ${cls}` });
    G.contar(b, valor, fmt);
    return b;
  };
  const chip = (atual, anterior, sentido) => {
    const c = L.chipVar(atual, anterior, sentido);
    return h("span", { class: `rel-var rel-var-${c.cls}`, title: `vs. ${S.dias} dias antes` }, c.v == null ? c.txt : `${c.seta} ${c.txt}`);
  };

  /* ---------------- VISÃO GERAL ---------------- */
  function abaGeral(M) {
    const P = L.numerosPeriodo(M, { dias: S.dias, plat: S.plat });
    const { t, ta, c, ca } = P;
    const contatos = voc(ctx, "contatos", "Clientes").toLowerCase();
    const umContato = voc(ctx, "contato", "Cliente").toLowerCase();

    // herói: a frase que o dono lê em 3 segundos + a conta do retorno
    const frase = h("p", { class: "ads-frase" }, "Os anúncios trouxeram ", num(c.conversas, N.int), ` ${c.conversas === 1 ? "conversa" : "conversas"} no WhatsApp, `,
      num(c.agendadas, N.int), ` ${c.agendadas === 1 ? "agendamento" : "agendamentos"} e `, num(c.fecharam, N.int),
      ` ${c.fecharam === 1 ? `novo ${umContato}` : `novos ${contatos}`}.`);
    const conta = h("div", { class: "ads-conta" },
      h("p", { class: "rel-olho" }, S.plat ? `Retorno sobre ${L.nomePlat(S.plat)}` : "Retorno total"),
      Number.isFinite(P.retorno)
        ? h("p", { class: "ads-retorno" }, `Cada R$ 1 ${S.plat ? "em anúncio" : "investido"} virou `, num(P.retorno, N.brl, "ads-retorno-n"))
        : h("p", { class: "ads-retorno" }, "Sem investimento no período"),
      h("p", { class: "rel-nota" }, S.plat ? "receita ÷ investimento em anúncios" : "receita ÷ (anúncios + gestão)"),
      h("p", { class: "ads-receita" }, num(c.receita, N.brl0), h("span", {}, " em receita fechada")));
    corpo.append(h("div", { class: "ads-heroi rel-cartao rel-entra" },
      h("div", { class: "ads-heroi-t" }, h("p", { class: "rel-olho" }, `Últimos ${S.dias} dias${S.plat ? ` · só ${L.nomePlat(S.plat)}` : ""}`), frase), conta));

    // trilha do funil: conversas → agendaram → compareceram → fecharam
    const passos = [
      { v: c.conversas, a: ca.conversas, l: "Conversas no WhatsApp", taxa: null },
      { v: c.agendadas, a: ca.agendadas, l: "Agendaram", taxa: L.razao(c.agendadas, c.conversas), tl: "das conversas" },
      { v: c.compareceram, a: ca.compareceram, l: "Compareceram", taxa: L.razao(c.compareceram, c.agendadas), tl: "dos agendados" },
      { v: c.fecharam, a: ca.fecharam, l: "Fecharam", taxa: L.razao(c.fecharam, c.compareceram), tl: "de quem veio" },
    ];
    const trilha = h("ol", { class: "ads-trilha rel-cartao rel-entra", "aria-label": "Do anúncio ao fechamento" });
    passos.forEach((p, n) => trilha.append(h("li", { class: "ads-passo", style: `--i:${n}` },
      p.taxa == null ? h("span", { class: "ads-taxa ads-taxa-0", "aria-hidden": "true" }) : h("span", { class: "ads-taxa" }, `${N.pc(Math.min(p.taxa, 100), 0)} ${p.tl}`),
      num(p.v, N.int, "ads-passo-n"), h("span", { class: "ads-passo-l" }, p.l), chip(p.v, p.a, "cima"))));
    corpo.append(trilha);

    // régua de 4 KPIs
    const meta = M.CFG.cpaAlvo, dif = Number.isFinite(t.cpa) ? Math.abs(t.cpa - meta) / meta * 100 : null;
    const kpis = [
      { l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: N.brl0, s: "neutro", extra: Number.isFinite(P.fee) && P.fee > 0 && eGestor(ctx) ? `+ ${N.brl0(P.fee)} de gestão no período` : "" },
      { l: "Custo por conversa", v: t.cpa, a: ta.cpa, f: N.brl, s: "baixo", medidor: true,
        extra: !Number.isFinite(t.cpa) ? `meta ${N.brl(meta)}` : `meta ${N.brl(meta)} · ${N.pc(dif, 0)} ${t.cpa <= meta ? "abaixo" : "acima"}` },
      { l: "Conversas contadas pela plataforma", v: t.conversoes, a: ta.conversoes, f: N.int, s: "cima", extra: "o que o Meta/Google registrou" },
      { l: "Receita fechada", v: c.receita, a: ca.receita, f: N.brl0, s: "cima",
        extra: eGestor(ctx) && Number.isFinite(P.roas) ? `${N.dec(P.roas, 1)}x o investido em anúncios` : "valor informado nos negócios ganhos do CRM" },
    ];
    const regua = h("div", { class: "rel-kpis rel-kpis-4" });
    kpis.forEach((k, n) => {
      const cel = h("div", { class: "rel-kpi rel-cartao rel-entra", style: `--i:${n + 2}` },
        h("span", { class: "rel-kpi-l" }, k.l),
        Number.isFinite(k.v) ? num(k.v, k.f, "rel-kpi-v") : h("b", { class: "rel-num rel-kpi-v" }, "—"),
        h("span", { class: "rel-kpi-linha" }, chip(k.v, k.a, k.s), h("span", { class: "rel-nota" }, `vs. ${S.dias} dias antes`)));
      if (k.medidor) {
        const w = Number.isFinite(t.cpa) ? Math.min(t.cpa / (meta * 2), 1) * 100 : 0;
        const med = h("span", { class: `rel-medidor rel-m-${L.nivelCpa(t.cpa, meta)}`, "aria-hidden": "true" }, h("i"), h("b", { title: "meta" }));
        med.style.setProperty("--w", `${w.toFixed(1)}%`);
        cel.append(med);
      }
      if (k.extra) cel.append(h("span", { class: "rel-kpi-extra" }, k.extra));
      regua.append(cel);
    });
    corpo.append(regua);

    // gráfico diário + coluna lateral (plataformas e orçamento do mês)
    const serie = L.serieDiaria(M, { dias: S.dias, plat: S.plat });
    const alvoG = h("div", { class: "rel-grafico" });
    const rodape = h("div", { class: "rel-cartao-rodape" });
    const legenda = h("ul", { class: "g-legenda", "aria-hidden": "true" },
      (S.plat !== "google" ? h("li", {}, h("i", { class: "g-marca g-meta" }), "Meta") : null),
      (S.plat !== "meta" ? h("li", {}, h("i", { class: "g-marca g-google" }), "Google") : null),
      h("li", {}, h("i", { class: "g-marca g-linha-m g-linha-texto" }), "Conversas (média de 7 dias)"),
      h("li", {}, h("i", { class: "g-marca g-ant-m" }), `${S.dias} dias antes`));
    const cartaoG = h("div", { class: "rel-cartao ads-cartao-g rel-entra" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, "Investimento por dia × conversas"), legenda),
      alvoG, rodape);
    const tot = { g: 0, conv: 0 };
    serie.atual.forEach(d => { tot.g += d.gasto; tot.conv += d.conv; });
    graficos.push(G.grafDiario(alvoG, {
      serie: serie.atual, anterior: serie.anterior, rotuloDia: M.ddmm,
      diaLongo: i => `${L.SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`,
      fmtGasto: N.brl, fmtGastoCurto: N.brl0, fmtNum: N.int,
      resumo: `Investimento diário e conversas nos últimos ${S.dias} dias: ${N.brl0(tot.g)} investidos e ${N.int(tot.conv)} conversas registradas pelas plataformas`,
    }));
    G.alternarTabela(rodape, alvoG, {
      legenda: `Investimento e conversas por dia, últimos ${S.dias} dias`,
      colunas: ["Dia", "Meta", "Google", "Conversas", "Custo por conversa"],
      linhas: serie.atual.map(d => [M.dataBR(d.i), N.brl(d.meta), N.brl(d.google), N.int(d.conv), d.conv ? N.brl(d.gasto / d.conv) : "—"]),
    });

    const lado = h("div", { class: "ads-lado" });
    // Meta × Google
    if (!S.plat) {
      const { de, ate } = L.janela(M, S.dias);
      const pl = ["meta", "google"].map(p => ({ p, t: M.consolidar(M.linhasDe(de, ate, { plat: p })), c: M.crmTot(de, ate, { plat: p }) })).filter(x => x.t.gasto > 0 || x.c.conversas > 0);
      if (pl.length) {
        const maxG = Math.max(1, ...pl.map(x => x.t.gasto));
        lado.append(h("div", { class: "rel-cartao ads-plats rel-entra" }, h("h2", { class: "rel-h2" }, "Por plataforma"),
          h("ul", { class: "ads-plat-lista" }, pl.map(x => {
            const barra = h("span", { class: `ads-plat-barra g-${x.p}` });
            barra.style.setProperty("--w", `${(x.t.gasto / maxG * 100).toFixed(1)}%`);
            return h("li", {},
              h("span", { class: "ads-plat-nome" }, h("i", { class: `g-marca g-${x.p}` }), L.nomePlat(x.p)),
              h("span", { class: "ads-plat-trilho" }, barra),
              h("span", { class: "ads-plat-num" }, `${N.brl0(x.t.gasto)} · ${N.int(x.c.conversas)} ${x.c.conversas === 1 ? "conversa" : "conversas"} · ${N.brl(x.t.cpa)} cada · ${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechou" : "fecharam"}`));
          }))));
      }
    }
    // orçamento do mês (todas as plataformas)
    const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, m.proj, 1) * 1.08;
    const acima = m.proj > orc * 1.02, noLimite = !acima && m.proj >= orc * .98;
    const msg = m.restam === 0 ? `Mês fechado em ${N.brl0(m.gasto)}.`
      : acima ? `No ritmo atual o mês fecha ${N.brl0(m.proj - orc)} acima do orçamento — segurar ${N.brl((m.proj - orc) / m.restam)} por dia resolve.`
      : noLimite ? `No limite: o mês deve fechar em ${N.brl0(m.proj)}, praticamente no orçamento.`
      : `Dentro do orçamento: o mês deve fechar em ${N.brl0(m.proj)} (sobram ${N.brl0(orc - m.proj)}).`;
    const barra = h("div", { class: `ads-orc-barra${acima ? " acima" : ""}`, role: "img", "aria-label": `${N.brl0(m.gasto)} investidos de ${N.brl0(orc)}; projeção ${N.brl0(m.proj)}` }, h("i"), h("u"), h("b"));
    barra.style.setProperty("--w", `${(m.gasto / escala * 100).toFixed(1)}%`);
    barra.style.setProperty("--wp", `${(Math.max(0, m.proj - m.gasto) / escala * 100).toFixed(1)}%`);
    barra.style.setProperty("--m", `${(orc / escala * 100).toFixed(1)}%`);
    lado.append(h("div", { class: "rel-cartao ads-orc rel-entra" },
      h("h2", { class: "rel-h2" }, "Orçamento do mês"),
      h("p", { class: "rel-nota" }, `${L.MESES[m.mes]} · dia ${m.pass} de ${m.diasMes} · todas as plataformas`),
      h("p", { class: "ads-orc-n" }, num(m.gasto, N.brl0), h("span", {}, ` de ${N.brl0(orc)}`)),
      barra,
      h("p", { class: "ads-orc-leg rel-nota" }, h("span", {}, "gasto até ontem"), h("span", {}, `projeção ${N.brl0(m.proj)}`), h("span", {}, "▮ orçamento")),
      h("p", { class: `ads-orc-msg${acima ? " rel-txt-aten" : ""}` }, msg)));
    corpo.append(h("div", { class: "ads-grade" }, cartaoG, lado));
  }

  /* ---------------- CAMPANHAS ---------------- */
  function abaCampanhas(M) {
    const { linhas, total } = L.linhasCampanhas(M, { dias: S.dias, plat: S.plat });
    const COLS = [["nome", "Campanha"], ["gasto", "Investido"], ["conv", "Conversas"], ["cpa", "Custo/conversa"],
      ["ag", "Agendados"], ["fe", "Fechados"], ["rec", "Receita"], ["roas", "Retorno", "Receita ÷ investimento em anúncios desta campanha (sem a gestão)."]];
    const cartao = h("div", { class: "rel-cartao rel-entra ads-camp" });
    corpo.append(cartao);
    if (!linhas.length) {
      cartao.append(ui.vazio({ titulo: "Nenhuma campanha no período", texto: `Nenhuma campanha com investimento nos últimos ${S.dias} dias${S.plat ? ` no ${L.nomePlat(S.plat)}` : ""}.` }));
      return;
    }
    const desenharTabela = () => {
      ui.limpar(cartao);
      const rows = L.ordenarCampanhas(linhas, S.ordem.chave, S.ordem.dir);
      const meta = M.CFG.cpaAlvo;
      const thead = h("thead", {}, h("tr", {}, COLS.map(([k, l, dica]) => {
        const th = h("th", { scope: "col", class: k === "nome" ? "" : "num" });
        if (S.ordem.chave === k) th.setAttribute("aria-sort", S.ordem.dir < 0 ? "descending" : "ascending");
        const b = h("button", { type: "button", class: "rel-ord", title: dica || `Ordenar por ${l.toLowerCase()}` }, l,
          h("span", { class: "rel-ord-seta", "aria-hidden": "true" }, S.ordem.chave === k ? (S.ordem.dir < 0 ? "↓" : "↑") : ""));
        b.addEventListener("click", () => { S.ordem = { chave: k, dir: S.ordem.chave === k ? -S.ordem.dir : (k === "nome" ? 1 : -1) }; desenharTabela(); cartao.querySelector(`[data-ord="${k}"]`)?.focus(); });
        b.dataset.ord = k;
        th.append(b);
        return th;
      })));
      const td = (k, texto, rot) => h("td", { class: `num c-${k}`, dataset: { l: rot || "" } }, texto);
      const tbody = h("tbody", {}, rows.map((r, n) => {
        const abrir = h("button", { type: "button", class: "ads-camp-nome", "aria-haspopup": "dialog" },
          h("i", { class: `rel-ponto rel-ponto-${L.nivelCpa(r.t.cpa, meta)}`, title: "custo por conversa × meta" }),
          h("span", { class: "ads-camp-t" }, h("span", {}, r.c.nome), h("small", {}, h("span", { class: `rel-chip rel-chip-${r.c.plat}` }, L.nomePlat(r.c.plat)), " · ver criativos")));
        abrir.addEventListener("click", () => criativos(M, r));
        return h("tr", { style: `--i:${n}` }, h("td", { class: "c-nome" }, abrir),
          td("gasto", N.brl0(r.t.gasto), "Investido"), td("conv", N.int(r.t.conversoes), "Conversas"), td("cpa", N.brl(r.t.cpa), "Custo por conversa"),
          td("ag", N.int(r.k.agendadas), "Agendados"), td("fe", N.int(r.k.fecharam), "Fechados"), td("rec", N.brl0(r.k.receita), "Receita"),
          td("roas", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—", "Retorno"));
      }));
      const T = total.t;
      const tfoot = h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "Total"),
        td("gasto", N.brl0(T.gasto), "Investido"), td("conv", N.int(T.conversoes), "Conversas"), td("cpa", N.brl(T.cpa), "Custo por conversa"),
        td("ag", N.int(total.ag), "Agendados"), td("fe", N.int(total.fe), "Fechados"), td("rec", N.brl0(total.rec), "Receita"),
        td("roas", Number.isFinite(total.roas) ? `${N.dec(total.roas, 1)}x` : "—", "Retorno")));
      cartao.append(h("div", { class: "rel-cartao-topo" }, h("h2", { class: "rel-h2" }, `Campanhas nos últimos ${S.dias} dias`),
        h("p", { class: "rel-nota" }, "Toque numa campanha para ver os criativos. Agendados, fechados e receita vêm do CRM, pela data de cada evento.")),
        h("div", { class: "rel-tabela-rolagem" }, h("table", { class: "rel-tabela ads-tabela" },
          h("caption", { class: "sr-only" }, `Campanhas nos últimos ${S.dias} dias`), thead, tbody, tfoot)));
    };
    desenharTabela();
    corpo.append(rankingCriativos(M));
  }

  /* Ranking de criativos (P1): investimento do Ads × resultado do CRM, por criativo */
  function rankingCriativos(M) {
    const cartao = h("section", { class: "rel-cartao rel-entra ads-rank", "aria-labelledby": "ads-rank-h", style: "--i:1" });
    const pintar = () => {
      const R = L.rankingCriativos(M, { dias: S.dias, plat: S.plat, por: S.rank });
      ui.limpar(cartao);
      const nomeRank = (L.RANK_CRI.find(([k]) => k === R.por) || L.RANK_CRI[0])[1].toLowerCase();
      cartao.append(h("div", { class: "rel-cartao-topo" },
        h("h2", { id: "ads-rank-h", class: "rel-h2" }, "Ranking de criativos"),
        segmento("Ordenar o ranking", L.RANK_CRI, R.por, v => { S.rank = v; gravarLocal("nx-app-ads-rank", v); pintar(); cartao.querySelector('[aria-pressed="true"]')?.focus(); }),
        h("p", { class: "rel-nota" }, R.por === "cpa"
          ? `Os ${R.lista.length} criativos com menor custo por conversa nos últimos ${S.dias} dias (com pelo menos ${L.MIN_CONV_CPA} conversas).`
          : `Os ${R.lista.length} criativos com ${nomeRank} nos últimos ${S.dias} dias. Fechados e receita vêm do CRM, pelo anúncio que trouxe cada ${voc(ctx, "contato", "contato").toLowerCase()}.`)));
      if (!R.lista.length) {
        cartao.append(h("p", { class: "rel-vazio-txt" }, !R.total ? "Nenhum criativo com investimento no período."
          : R.por === "cpa" ? `Nenhum criativo com ${L.MIN_CONV_CPA} conversas ou mais no período.`
          : `Nenhum criativo trouxe ${R.por === "receita" ? "receita" : "fechamento"} nos últimos ${S.dias} dias ainda. Veja “Menor custo por conversa”.`));
        return;
      }
      const ol = h("ol", { class: "ads-rank-lista" });
      R.lista.forEach((x, n) => {
        const destaque = R.por === "receita" ? N.brl0(x.c.receita) : R.por === "fechados" ? `${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechado" : "fechados"}` : `${N.brl(x.t.cpa)} por conversa`;
        ol.append(h("li", { class: `ads-rank-item${x.pos === 1 ? " ads-rank-1" : ""}`, style: `--i:${n}` },
          h("span", { class: "ads-rank-pos rel-num", "aria-hidden": "true" }, String(x.pos)),
          h("div", { class: "ads-rank-t" },
            h("p", { class: "ads-rank-nome" }, h("span", { class: "sr-only" }, `${x.pos}º: `), x.k.nome),
            h("p", { class: "rel-nota" }, h("span", { class: `rel-chip rel-chip-${x.k.plat}` }, L.nomePlat(x.k.plat)), ` ${x.camp ? x.camp.curto || x.camp.nome : ""}`),
            h("span", { class: "ads-rank-barra", "aria-hidden": "true" }, h("i", { style: { "--w": `${Math.round(x.barra * 100)}%` } }))),
          h("div", { class: "ads-rank-dest" }, h("b", { class: "rel-num" }, destaque),
            h("span", { class: "rel-nota" }, `${N.brl0(x.t.gasto)} investidos · ${N.int(x.t.conversoes)} conversas · ${N.int(x.c.agendadas)} agendados`),
            h("span", { class: "rel-nota" }, R.por === "receita" || R.por === "fechados"
              ? `${N.brl(x.t.cpa)} por conversa · retorno ${Number.isFinite(x.roas) ? `${N.dec(x.roas, 1)}x` : "—"}`
              : `${N.int(x.c.fecharam)} ${x.c.fecharam === 1 ? "fechado" : "fechados"} · ${N.brl0(x.c.receita)}`))));
      });
      cartao.append(ol);
    };
    pintar();
    return cartao;
  }

  function criativos(M, r) {
    const lista = L.criativosDaCampanha(M, r.c.id, { dias: S.dias });
    const corpoG = h("div", { class: "ads-cri" },
      h("p", { class: "rel-nota" }, `${L.nomePlat(r.c.plat)} · últimos ${S.dias} dias · ${N.brl0(r.t.gasto)} investidos · ${N.int(r.t.conversoes)} conversas · ${N.brl(r.t.cpa)} cada`),
      h("div", { class: "ads-cri-resumo" },
        [["Agendados", N.int(r.k.agendadas)], ["Fechados", N.int(r.k.fecharam)], ["Receita", N.brl0(r.k.receita)], ["Retorno", Number.isFinite(r.roas) ? `${N.dec(r.roas, 1)}x` : "—"]]
          .map(([l, v]) => h("div", {}, h("span", { class: "rel-kpi-l" }, l), h("b", { class: "rel-num" }, v)))));
    if (!lista.length) corpoG.append(h("p", { class: "rel-vazio-txt" }, "Nenhum criativo com investimento no período."));
    else {
      corpoG.append(h("ul", { class: "ads-cri-lista" }, lista.map(({ k, t, fadiga, ctrBaixo }) => {
        const chips = h("span", { class: "ads-cri-chips" });
        if (fadiga) chips.append(h("span", { class: "rel-chip rel-chip-ruim", title: `frequência nos últimos ${fadiga.janela} dias` }, `cansado · ${N.dec(fadiga.valor, 1)} vezes em ${fadiga.janela}d`));
        if (ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-aten", title: `CTR nos últimos ${ctrBaixo.janela} dias` }, `CTR ${N.pc(ctrBaixo.valor, 2)} em ${ctrBaixo.janela}d`));
        if (!fadiga && !ctrBaixo) chips.append(h("span", { class: "rel-chip rel-chip-bom" }, "ok"));
        return h("li", { class: "ads-cri-item" },
          h("p", { class: "ads-cri-nome" }, k.nome), chips,
          h("dl", { class: "ads-cri-num" },
            [["Investido", N.brl0(t.gasto)], ["Impressões", N.int(t.impressoes)], ["CTR", N.pc(t.ctr, 2)],
             ["Frequência", Number.isFinite(t.freq) ? N.dec(t.freq, 1) : "—"], ["Conversas", N.int(t.conversoes)], ["Custo/conversa", N.brl(t.cpa)]]
              .map(([l, v]) => h("div", {}, h("dt", {}, l), h("dd", {}, v)))));
      })));
    }
    ui.gaveta({ titulo: r.c.nome, corpo: corpoG, largura: "g" });
  }

  /* ---------------- RADAR ---------------- */
  function abaRadar(M, dados, R) {
    const u = (dados.integracoes || []).map(i => i.ultimo_sync).filter(Boolean).sort().pop();
    const qtd = `${R.ativos} ${R.ativos === 1 ? "alerta ativo" : "alertas ativos"}`;
    corpo.append(h("p", { class: "ads-radar-status rel-cartao rel-entra" },
      h("span", { class: `ads-radar-luz${R.ativos ? " ativo" : ""}`, "aria-hidden": "true" }),
      L.semAnuncios(M) ? "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar."
        : u ? `Última leitura dos anúncios: ${L.quandoSP(u)} · ${qtd}.` : `${qtd}.`));
    const lista = h("ul", { class: "ads-alertas" });
    R.conexoes.forEach((x, n) => lista.append(h("li", { class: "ads-al ads-al-critico", style: `--i:${n}` },
      h("span", { class: "ads-sev ads-sev-critico", role: "img", "aria-label": "conexão parada" }, ui.icone("alerta")),
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-nome" }, x.nome, " ", h("span", { class: `rel-chip ${x.ativo ? "rel-chip-ruim" : "rel-chip-bom"}` }, x.ativo ? "ativo" : "resolvido")),
        h("p", { class: "ads-al-msg" }, x.a.mensagem || ""),
        h("p", { class: "rel-nota" }, L.quandoSP(x.a.criado_em), x.envio ? envio(x.envio, " · aviso ") : null),
        x.ativo && eGestor(ctx) ? h("a", { class: "rel-link", href: "#/config/anuncios" }, "Resolver em Ajustes de anúncios") : null))));
    R.episodios.forEach((e, n) => lista.append(h("li", { class: `ads-al ads-al-${e.sev}${e.ativo ? "" : " resolvido"}`, style: `--i:${n + R.conexoes.length}` },
      h("span", { class: `ads-sev ads-sev-${e.sev}`, role: "img", "aria-label": L.SEV_NOME[e.sev] }),
      h("div", { class: "ads-al-t" },
        h("p", { class: "ads-al-nome" }, e.nome, " ", h("span", { class: `rel-chip ${e.ativo ? (e.sev === "critico" ? "rel-chip-ruim" : "rel-chip-aten") : "rel-chip-bom"}` }, e.ativo ? "ativo" : "resolvido")),
        h("p", { class: "ads-al-msg" }, e.msg),
        e.ativo ? h("p", { class: "ads-al-acao" }, h("span", { class: "rel-olho" }, "O que fazer "), e.acao) : null,
        h("p", { class: "rel-nota" }, e.desde, e.envio ? envio(e.envio, " · aviso ") : null)))));
    if (!lista.childElementCount) lista.append(h("li", { class: "rel-vazio-txt" }, "Nenhum alerta nos últimos 14 dias. Todas as campanhas dentro dos limites."));
    const regras = h("ul", { class: "ads-regras" }, M.REGRAS.map(r => h("li", {},
      h("div", {}, h("p", { class: "ads-regra-n" }, r.nome, " ", h("span", { class: `rel-chip rel-chip-${r.sev === "critico" ? "ruim" : r.sev === "alerta" ? "aten" : "info"}` }, L.SEV_NOME[r.sev])),
        h("p", { class: "rel-nota" }, descreverRegra(r))),
      h("span", { class: `rel-chip ${r.ativa ? "rel-chip-bom" : "rel-chip-neutro"}` }, r.ativa ? "ligada" : "desligada"))));
    const log = h("ul", { class: "ads-log" });
    R.registro.forEach(x => log.append(h("li", {},
      h("span", { class: `ads-sev ads-sev-${x.sev}`, "aria-hidden": "true" }),
      h("div", {}, h("p", { class: "ads-al-nome" }, x.nome), h("p", { class: "ads-al-msg" }, x.a.mensagem || ""),
        h("p", { class: "rel-nota" }, `registrado ${x.quando}`, x.envio ? envio(x.envio, " · ") : null)))));
    if (!log.childElementCount) log.append(h("li", { class: "rel-vazio-txt" }, "Nenhum aviso enviado ainda."));
    corpo.append(h("div", { class: "ads-radar-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Alertas dos últimos 14 dias"), lista),
      h("div", { class: "ads-radar-lado" },
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Avisos enviados no WhatsApp"), log),
        h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Regras do radar"), regras,
          h("p", { class: "rel-nota" }, eGestor(ctx) ? "Metas e regras são ajustadas em Ajustes de anúncios." : "As metas e as regras são definidas pela equipe de gestão.")))));
  }
  const MET = { cpa: "Custo por conversa", ctr: "CTR", freq: "Frequência", conversoes: "Conversas" };
  const OPS = { ">": "acima de", "<": "abaixo de", ">=": "a partir de", "<=": "até" };
  function descreverRegra(r) {
    const f = { cpa: N.brl, ctr: x => N.pc(x, 2), freq: x => N.dec(x, 1), conversoes: N.int }[r.metrica] || String;
    return `${MET[r.metrica] || r.metrica} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${N.brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
  }
  function envio(st, antes = "") {
    return h("span", { class: `ads-env ads-env-${st.k}`, title: st.erro || st.rotulo }, antes, st.rotulo, " ", h("i", { class: "ads-tique", "aria-hidden": "true" }, st.tique));
  }

  /* ---------------- RELATÓRIOS ---------------- */
  function abaRelatorios(M, dados) {
    const lista = L.listaRelatorios(dados.relatorios || []);
    const previas = [];
    if (!L.semAnuncios(M)) {
      const enviado = chave => lista.some(x => x.chave === chave);
      if (!enviado(`diario|${N.isoDe(M.dataDe(M.R))}`))
        previas.push({ chave: "previa|diario", titulo: `Prévia do diário de ${M.dataBR(M.R)}`, previa: true, tipo: "diario", texto: () => M.relDiario(M.R) });
      const mes = M.mesesDados().filter(x => x.completo).pop();
      if (mes && !enviado(`mensal|${N.isoDe(M.dataDe(mes.de))}`)) previas.push({ chave: "previa|mensal", titulo: `Prévia do resumo de ${L.MESES[mes.mes]}`, previa: true, tipo: "mensal", texto: () => M.relMensal(mes) });
    }
    const itens = [...lista, ...previas];
    if (!itens.length) {
      corpo.append(ui.vazio({ titulo: "Nenhum relatório ainda", texto: "O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios." }));
      return;
    }
    if (!S.rel || !itens.some(i => i.chave === S.rel)) S.rel = itens[0].chave;
    const ul = h("ul", { class: "ads-rel-lista", role: "list" });
    const tela = h("div", { class: "ads-fone" });
    const statusLeitor = h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    const mostrar = () => {
      for (const b of ul.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.chave === S.rel));
      const it = itens.find(i => i.chave === S.rel);
      const st = it.previa ? null : it.envio;
      statusLeitor.textContent = it.previa ? `${it.titulo}. Prévia ainda não enviada.`
        : `${it.titulo}. ${st?.rotulo || "Status de envio indisponível"}${st?.hora ? ` às ${st.hora}` : ""}.`;
      ui.limpar(tela);
      const texto = it.previa ? it.texto() : it.r.texto || "";
      const bolha = h("div", { class: "ads-bolha" });
      for (const tk of L.tokensWa(texto)) {
        if (tk.t === "br") bolha.append(h("br"));
        else if (tk.t === "b") bolha.append(h("strong", {}, tk.v));
        else if (tk.t === "i") bolha.append(h("em", {}, tk.v));
        else bolha.append(document.createTextNode(tk.v));
      }
      bolha.append(h("span", { class: "ads-bolha-hora" }, st ? (st.hora || st.rotulo) : "prévia", st ? h("i", { class: `ads-tique ads-env-${st.k}`, "aria-hidden": "true" }, ` ${st.tique}`) : null));
      tela.append(...[
        h("div", { class: "ads-fone-topo" }, h("span", { class: "ads-fone-av", "aria-hidden": "true" }, ui.icone("whatsapp")),
          h("span", {}, h("b", {}, it.tipo === "mensal" ? "Resumo do mês" : "Relatório diário"), h("small", {}, it.previa ? "prévia calculada agora com os números do painel" : st ? st.rotulo : ""))),
        h("div", { class: "ads-fone-corpo" }, bolha),
        st && st.erro ? h("p", { class: "ads-rel-erro" }, st.erro) : null,
        it.ia ? h("p", { class: "rel-nota" }, "Leitura do dia escrita por IA a partir dos números.") : null].filter(Boolean));
    };
    for (const it of itens) {
      const b = h("button", { type: "button", class: "ads-rel-item", "aria-pressed": "false" },
        h("span", { class: "ads-rel-t" }, it.titulo, it.ia ? h("span", { class: "rel-chip rel-chip-info" }, "IA") : null),
        it.previa ? h("span", { class: "rel-nota" }, "ainda não enviado · prévia") : envio(it.envio));
      b.dataset.chave = it.chave;
      b.addEventListener("click", () => { S.rel = it.chave; mostrar(); });
      ul.append(h("li", {}, b));
    }
    corpo.append(h("div", { class: "ads-rel-grade" },
      h("div", { class: "rel-cartao rel-entra" }, h("h2", { class: "rel-h2" }, "Relatórios e prévias"), ul,
        h("p", { class: "rel-nota" }, "✓ a API aceitou · ✓✓ chegou no celular · ! não saiu. Quando o relatório de um dia ainda não foi enviado, aparece a prévia calculada agora.")),
      h("div", { class: "rel-cartao ads-fone-cartao rel-entra" }, tela, statusLeitor)));
    mostrar();
  }

  await recarregar(false);
}
