/* ============================================================
   NEXUS ADS — folha.js · A FOLHA DO MÊS (A4 para imprimir ou PDF)
   Carregado por import() dinâmico (botão "Folha do mês" em
   Relatórios, créditos do curta, ?folha=AAAA-MM). Uma página A4 de
   papel com a marca da clínica — para deixar na mesa do dentista ou
   mandar em PDF pelo WhatsApp. A agência assina no rodapé (a Nexus só quando não há
   outra marca — plano 1500c · AC-262).
   Mesmo número em todo lugar: M.consolidar(M.linhasDe(m.de, m.ate)) e
   M.crmTot(m.de, m.ate) — os MESMOS do resumo mensal do WhatsApp.
   Gráficos em SVG inline (nunca canvas: sai nítido no PDF).
   ============================================================ */
import { brl, brl0, int, esc, fin, MESES, MES3, retornoInvestimento, plural, pluralDec, nomePlat, varPct, variacao } from "./nucleo.js";

/** PURO: os números da folha de um mês (iguais aos do relMensal). O "Cada R$ 1 investido virou"
    usa a MESMA base do herói e do curta — tratamentos ÷ (anúncios + gestão do mês) —, porque é a
    frase que o dentista leva; o "só anúncio" (a do resumo do WhatsApp) fica como linha de apoio. */
export function dadosFolha(M, m) {
  const t = M.consolidar(M.linhasDe(m.de, m.ate)), c = M.crmTot(m.de, m.ate);
  const fee = (M.CFG && M.CFG.fee) || 0, custo = t.gasto + fee;
  return {
    // plano 1500c · AC-016: a mesma função do resumo mensal e do herói do painel
    t, c, roas: t.gasto ? c.receita / t.gasto : null, fee, custo, retorno: retornoInvestimento({ receita: c.receita, gasto: t.gasto, fee }),
    serv: Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v).map(([nome, s]) => ({ nome, n: s.n, v: s.v })),
  };
}

/** Plano 1000 (AD-211): as palavras da folha por vertical (M.vertical) — antes a oficina e a loja recebiam «pacientes» e «tratamentos». PURO. */
export const TEXTOS_FOLHA = {
  odonto: { pessoa: ["paciente", "pacientes"], novo: ["paciente novo", "pacientes novos"], marcada: ["avaliação marcada", "avaliações marcadas"], marcaram: "marcaram avaliação",
    vieram: "vieram à clínica", fecharam: "fecharam tratamento", receita: "Tratamentos", receitaEm: "em tratamentos", servico: "tratamento", local: "da clínica" },
  oficina: { pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"], marcada: ["visita marcada", "visitas marcadas"], marcaram: "marcaram visita",
    vieram: "vieram à oficina", fecharam: "aprovaram o orçamento", receita: "Serviços", receitaEm: "em serviços", servico: "serviço", local: "da oficina" },
  loja: { pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"], marcada: ["visita marcada", "visitas marcadas"], marcaram: "marcaram visita",
    vieram: "vieram à loja", fecharam: "compraram", receita: "Vendas", receitaEm: "em vendas", servico: "venda", local: "da loja" },
  generico: { pessoa: ["cliente", "clientes"], novo: ["cliente novo", "clientes novos"], marcada: ["agendamento", "agendamentos"], marcaram: "agendaram",
    vieram: "compareceram", fecharam: "fecharam", receita: "Vendas", receitaEm: "em vendas", servico: "venda", local: "do negócio" },
};
export const textosFolha = vertical => TEXTOS_FOLHA[vertical] || TEXTOS_FOLHA.odonto;
const cap1 = x => String(x).charAt(0).toUpperCase() + String(x).slice(1);
let T = TEXTOS_FOLHA.odonto;

let ctx = null, modal = null, folha = null, volta = null, m = null;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const p2 = n => String(n).padStart(2, "0");

function grafMeses(meses) {
  const W = 300, H = 132, base = 104, mx = Math.max(1, ...meses.map(x => x.fecharam));
  const n = meses.length, bw = Math.min(46, W / n * .5);
  // plano 2000d · KX-028: os números do gráfico com separador de milhar (int), como a tabela ao lado
  return `<svg class="fl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cap1(T.novo[1]))} por mês: ${meses.map(x => `${MESES[x.mes]} ${int(x.fecharam)}`).join(", ")}">
    <line class="fl-eixo" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
    ${meses.map((x, k) => {
      const cx = (k + .5) * W / n, h = Math.max(3, x.fecharam / mx * 80), atual = k === n - 1;
      return `<rect class="${atual ? "fl-b-marca" : "fl-b"}" x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>
        <text class="fl-v" x="${cx.toFixed(1)}" y="${(base - h - 6).toFixed(1)}" text-anchor="middle">${int(x.fecharam)}</text>
        <text class="fl-m" x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${MES3[x.mes]}${x.completo ? "" : " (parcial)"}</text>`;
    }).join("")}</svg>`;
}
/** Plano 2000d · DA-124: a tabela do gráfico (texto de verdade no PDF — o leitor de tela e a busca acham os números). PURO. */
export function tabelaMeses(meses = []) {
  if (!meses.length) return "";
  return `<table class="fl-tab"><caption>${esc(cap1(T.novo[1]))} por mês</caption><tr><th scope="row">Mês</th>${meses.map(x => `<td>${MES3[x.mes]}${x.completo ? "" : "*"}</td>`).join("")}</tr><tr><th scope="row">${esc(cap1(T.novo[1]))}</th>${meses.map(x => `<td>${int(x.fecharam)}</td>`).join("")}</tr></table>`;
}
/* "O que fechou" em tons da cor da clínica (100 → 25%), não na paleta padrão do painel */
const TOM_SERV = [100, 75, 55, 40, 25];
function grafServ(serv, total) {
  if (!serv.length) return `<p class="fl-vazio">Nenhum ${esc(T.servico)} fechado no mês.</p>`;
  const lin = serv.slice(0, 5), W = 300, L = 26, mx = Math.max(...lin.map(s => s.v), 1);
  return `<svg class="fl-svg" viewBox="0 0 ${W} ${lin.length * L + 4}" role="img" aria-label="O que fechou: ${lin.map(s => `${s.nome} ${brl0(s.v)}`).join(", ")}">
    ${lin.map((s, k) => {
      const y = k * L + 4, w = Math.max(4, s.v / mx * 110);
      return `<text class="fl-sn" x="0" y="${y + 13}"><title>${esc(s.nome)}</title>${esc(nomeGraf(s.nome))}</text>
        <rect x="118" y="${y + 3}" width="${w.toFixed(1)}" height="12" rx="3" style="fill: color-mix(in oklab, var(--marca) ${TOM_SERV[k] || 25}%, #FBF8F2)"/>
        <text class="fl-sv" x="${W}" y="${y + 13}" text-anchor="end">${brl0(s.v)} · ${int(s.n)}</text>`;
    }).join("")}</svg>
    <p class="fl-mini">${total ? `${Math.round(lin[0].v / total * 100)}% do mês veio de ${esc(lin[0].nome.toLowerCase())}.` : ""}</p>`;
}

/** Plano 1500c · AC-258/AC-259: os contatos do mês separados — conversas no WhatsApp (Meta e outras) × conversões do Google (que não são
    «conversas no WhatsApp»; antes tudo saía como conversa). PURO. → {conversas, google, frase, rotulo} */
// plano 2000d · DA-104: cada canal pelo nome — só o Meta é «conversa no WhatsApp»; TikTok e as outras plataformas viram «contatos pelo
// TikTok» (antes somavam em «conversas no WhatsApp»). `outras` = {plataforma: contatos}
export function contatosFolha(M, m) {
  const ls = M.linhasDe(m.de, m.ate);
  let conversas = 0, google = 0, temMeta = false;
  const outras = {};
  for (const l of ls) {
    const v = +l.conversoes || 0;
    if (l.plat === "google") google += v; else if (l.plat === "meta" || !l.plat) { conversas += v; temMeta = true; } else outras[l.plat] = (outras[l.plat] || 0) + v;
  }
  const pedacos = [];
  if (conversas > 0 || temMeta || (!google && !Object.values(outras).some(v => v > 0))) pedacos.push(`<b>${plural(conversas, "conversa", "conversas")}</b> no WhatsApp`);
  if (google > 0) pedacos.push(`<b>${pluralDec(google, "contato", "contatos")}</b> pelo Google`);
  for (const [p, v] of Object.entries(outras)) if (v > 0) pedacos.push(`<b>${pluralDec(v, "contato", "contatos")}</b> pelo ${esc(nomePlat(p))}`);
  const frase = juntarE(pedacos);
  const totOutras = Object.values(outras).reduce((a, b) => a + b, 0), soWa = !google && !totOutras;
  return { conversas, google, outras, total: conversas + google + totOutras, frase, pedacos,
    rotulo: soWa ? "conversas no WhatsApp" : conversas > 0 ? "conversas e contatos" : google > 0 && !totOutras ? "contatos pelo Google" : "contatos" };
}
/** Plano 2000d · KX-026: «a, b e c» — uma lista vira frase com UM «e» no fim (antes a folha dizia «… no WhatsApp e 3 contatos pelo
    Google e 4 avaliações marcadas», com dois «e»). PURO. */
export const juntarE = l => { const a = (l || []).filter(Boolean); return a.length > 1 ? `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}` : a[0] || ""; };
/** Plano 2000d · KX-027: nome de serviço longo no gráfico «O que fechou» corta com «…» antes da barra (o texto ia por cima dela); o nome
    inteiro fica no <title>. PURO. */
export const nomeGraf = (s, max = 17) => { const a = Array.from(String(s || "")); return a.length > max ? `${a.slice(0, max - 1).join("").trimEnd()}…` : a.join(""); };
/** Plano 2000d · KX-029/KX-030: o rótulo honesto da receita na folha — «(parte estimada)» quando há valor confirmado junto; e o bloco do
    retorno com fechamentos SEM valor não diz «ainda sem tratamento fechado». PURO. */
export const rotuloEstimativa = c => ((+c.receitaEstimada || 0) > 0 ? ((+c.receitaReal || 0) > 0 ? " (parte estimada)" : " (estimativa)") : "");
export const textoSemRetorno = (c, servico = "tratamento") => ((+c.fecharam || 0) > 0 && !((+c.receita || 0) > 0)
  ? `${int(c.fecharam)} ${c.fecharam === 1 ? "fechamento" : "fechamentos"} sem valor informado` : `Ainda sem ${servico} fechado`);
/** Plano 2000d · DA-102: «Gerado em» pelo relógio de São Paulo (antes o fuso do aparelho). PURO. */
const FMT_GERADO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
export const geradoEmSP = (agora = new Date()) => FMT_GERADO.format(agora);
/** Plano 2000d · DA-103: investimento total = anúncios + gestão (quando há gestão) — o dono vê o custo de verdade. PURO. */
export const linhaInvestimento = ({ t, fee }) => (fee > 0 ? `anúncios ${brl0(t.gasto)} + gestão ${brl0(fee)} = <b>${brl0(t.gasto + fee)}</b> no total` : "");
/** Plano 2000d · DA-123: mês sem número nenhum (sem gasto, sem contato, sem fechamento) — a folha não imprime zeros. PURO. */
export const folhaVazia = (M, m) => { const d = dadosFolha(M, m), k = contatosFolha(M, m); return !(d.t.gasto > 0) && !(d.t.impressoes > 0) && !(k.total > 0) && !(d.c.fecharam > 0) && !(d.c.agendadas > 0); };
/** Plano 1500c · AC-262: quem assina a folha — a marca da agência quando o cliente/org tem (cfg.agenciaNome/agenciaCidade, ou
    ctx.agencia {nome, cidade}); só sem nenhuma marca vale a Nexus (com Taubaté-SP). Revenda não imprime «Nexus». PURO. */
export function assinaturaFolha(cfg = {}, agencia = null) {
  const nome = String((agencia && agencia.nome) || cfg.agenciaNome || (cfg.agencia && cfg.agencia.nome) || "").trim();
  if (!nome) return { nome: "Nexus", cidade: "Taubaté-SP", nexus: true };
  const cidade = String((agencia && agencia.cidade) || cfg.agenciaCidade || (cfg.agencia && cfg.agencia.cidade) || "").trim();
  return { nome: nome.slice(0, 60), cidade: cidade.slice(0, 40), nexus: /^nexus\b/i.test(nome) };
}
/** Plano 1500c · AC-261: o nome da plataforma na folha — o Meta é «Instagram e Facebook» para o dono; as outras pelo nome próprio. */
export const platFolha = p => (p === "meta" ? "Instagram e Facebook" : nomePlat(p));
/** Plano 2000d · KX-031: o campeão do Google trouxe «contatos» (o Google não abre conversa no WhatsApp) — o Meta segue «conversas». PURO. */
export const palavraContato = (p, n) => (p === "meta" ? plural(n, "conversa", "conversas") : plural(n, "contato", "contatos"));

// plano 2000d · DA-122: «Ocultar valores de venda» (o dono mostra a folha ao sócio sem o faturamento)
let ocultarValores = false;
function montar() {
  const M = ctx.M, d = dadosFolha(M, m), { t, c, roas, retorno, fee } = d;
  // plano 2000d · DA-123: mês sem número nenhum — avisa e não deixa imprimir uma folha de zeros
  const btnImp = modal.querySelector("#folha-imprimir");
  if (folhaVazia(M, m)) {
    folha.innerHTML = `<div class="bloco fl-sem"><h1 class="fl-t">${esc(cap(MESES[m.mes]))} de ${m.ano} ainda não tem números</h1><p class="fl-resumo">Nenhum anúncio rodou e nenhum contato foi registrado neste mês. Escolha outro mês para gerar a folha.</p></div>`;
    if (btnImp) { btnImp.disabled = true; btnImp.title = "Mês sem números: nada para imprimir"; }
    modal.querySelector("#folha-barra-t").textContent = `Folha de ${MESES[m.mes]} de ${m.ano}`;
    return;
  }
  if (btnImp) { btnImp.disabled = false; btnImp.removeAttribute("title"); }
  T = textosFolha(M.vertical);
  const est = (+c.receitaEstimada || 0) > 0;
  const mesNome = MESES[m.mes];
  const cp = ctx.campeao, k = contatosFolha(M, m), ass = assinaturaFolha(M.CFG || {}, ctx.agencia);
  // plano 1500c · AC-258/AC-259: conversa no WhatsApp ≠ conversão do Google, com plural certo («1 conversa»)
  const frase = c.fecharam
    ? `Em ${mesNome}, os anúncios apareceram ${int(t.impressoes)} vezes e trouxeram ${juntarE([...k.pedacos, `<b>${int(c.agendadas)} ${c.agendadas === 1 ? T.marcada[0] : T.marcada[1]}</b>`, `<b>${int(c.fecharam)} ${c.fecharam === 1 ? T.novo[0] : T.novo[1]}</b>`])}${ocultarValores ? "" : ` — ${brl0(c.receita)} ${T.receitaEm}`}.`   // plano 2000d · KX-026
    : `Em ${mesNome}, os anúncios apareceram ${int(t.impressoes)} vezes e trouxeram ${juntarE([...k.pedacos, `<b>${int(c.agendadas)} ${c.agendadas === 1 ? T.marcada[0] : T.marcada[1]}</b>`])}.`;
  const etapas = [[t.impressoes, "vezes na tela"], [t.cliques, "tocaram no anúncio"], [k.total, k.rotulo],
    [c.agendadas, T.marcaram], [c.compareceram, T.vieram], [c.fecharam, T.fecharam]];
  // plano 1500c · AC-263: o mês anterior ao lado (fechamentos), quando a lista de meses tem o anterior
  const iM = (ctx.meses || []).findIndex(x => x.de === m.de), ant = iM > 0 ? ctx.meses[iM - 1] : null;
  const vsAnt = ant ? `vs. ${MESES[ant.mes]}: ${int(ant.fecharam)} → ${int(c.fecharam)}${ant.fecharam > 0 ? ` (${varPct(variacao(c.fecharam, ant.fecharam))})` : ""}` : "";
  // plano 1500c · AC-264: as mudanças anotadas (marcos) do mês
  const marcos = typeof M.marcosEntre === "function" ? M.marcosEntre(m.de, m.ate).slice(0, 5) : [];
  const passos = ctx.proximos.length ? ctx.proximos : ["Seguir como está."];
  folha.innerHTML = `
    <header class="fl-faixa bloco">
      <div class="fl-cli"><span class="selo-av fl-av" data-av></span><div><b>${esc(ctx.nome)}</b><small>Relatório do mês · tráfego pago</small></div></div>
      <h1 class="fl-t">Resultados de ${mesNome} de ${m.ano}</h1>
    </header>
    <p class="fl-resumo bloco">${frase}</p>
    <ol class="fl-trilha bloco">${etapas.map(([v, l], k) => `<li${k === etapas.length - 1 ? ` class="fim"` : ""}><b>${int(v)}</b><span>${l}</span></li>`).join("")}</ol>
    <div class="fl-blocos">
      <div class="bloco"><span class="fl-rot">Investido em anúncios</span><b>${brl0(t.gasto)}</b><small>${k.total !== k.conversas ? pluralDec(k.total, "contato", "contatos") : plural(k.total, "conversa", "conversas")}${fin(t.cpa) ? ` · ${brl(t.cpa)} cada` : ""}</small>${linhaInvestimento(d) ? `<small class="fl-total">${linhaInvestimento(d)}</small>` : ""}</div>
      ${ocultarValores ? `<div class="bloco"><span class="fl-rot">${esc(cap1(T.novo[1]))}</span><b>${int(c.fecharam)}</b><small>${vsAnt ? esc(vsAnt) : "valores de venda ocultos nesta folha"}</small></div>` : `<div class="bloco"><span class="fl-rot">${esc(T.receita)}${rotuloEstimativa(c)}</span><b>${brl0(c.receita)}</b><small>${int(c.fecharam)} ${c.fecharam === 1 ? T.novo[0] : T.novo[1]}${vsAnt ? ` · ${esc(vsAnt)}` : ""}</small></div>
      <div class="bloco fl-ret"><span class="fl-rot">Retorno</span><b>${fin(retorno) && c.receita ? `Cada R$ 1 investido virou ${brl(retorno)}` : esc(textoSemRetorno(c, T.servico))}</b><small>${fee ? `${T.receita.toLowerCase()} ÷ (anúncios + gestão)` : `${T.receita.toLowerCase()} ÷ investimento em anúncios`}${fee && fin(roas) && c.receita ? ` · só anúncio: ${brl(roas)}` : ""}</small></div>`}
    </div>
    <div class="fl-duo">
      <section class="bloco"><h2 class="fl-h">${esc(cap1(T.novo[1]))} por mês</h2>${grafMeses(ctx.meses)}${tabelaMeses(ctx.meses)}</section>
      <section class="bloco"><h2 class="fl-h">O que fechou</h2>${ocultarValores ? `<p class="fl-vazio">${d.serv.map(s => `${esc(s.nome)}: ${int(s.n)}`).join(" · ") || `Nenhum ${esc(T.servico)} fechado no mês.`}</p>` : grafServ(d.serv, c.receita)}</section>
    </div>
    <div class="fl-duo">
      <section class="bloco"><h2 class="fl-h">O anúncio que mais trouxe ${esc(T.pessoa[1])}</h2>
        ${cp ? `<p class="fl-camp">${esc(cp.camp.nome)}</p><p class="fl-camp-q">${esc(platFolha(cp.camp.plat))} · ${palavraContato(cp.camp.plat, cp.k.conversas)} · ${int(cp.k.fecharam)} ${cp.k.fecharam === 1 ? T.pessoa[0] : T.pessoa[1]}${ocultarValores ? "" : ` · ${brl0(cp.k.receita)} ${T.receitaEm}`}</p>
          ${cp.cri ? `<p class="fl-mini">Criativo que mais chamou gente: ${esc(cp.cri.nome)}</p>` : ""}` : `<p class="fl-vazio">Sem anúncio com ${esc(T.pessoa[0])} no mês.</p>`}
      </section>
      <section class="bloco"><h2 class="fl-h">Para o próximo mês</h2>
        ${ctx.editavel ? `<p class="fl-dica">Toque no texto para editar antes de imprimir.</p>` : ""}
        <ol class="fl-passos"${ctx.editavel ? ` contenteditable="true" spellcheck="true" aria-label="Para o próximo mês — dá para editar antes de imprimir"` : ""}>${passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol>
      </section>
    </div>
    ${marcos.length ? `<section class="bloco fl-marcos"><h2 class="fl-h">O que mudamos no mês</h2><ul class="fl-passos">${marcos.map(x => `<li><b>${esc(M.ddmm(x.i))}</b> — ${esc(x.t)}</li>`).join("")}</ul></section>` : ""}
    <footer class="fl-pe bloco">
      <p class="fl-assina">${ass.nexus ? `<svg class="nx-mono" aria-hidden="true"><use href="#nx-mono"/></svg>` : ""}<span>Preparado pela <b>${esc(ass.nome)}</b> · gestão de tráfego${ass.cidade ? ` · ${esc(ass.cidade)}` : ""}</span></p>
      <p class="fl-meta">Gerado em ${geradoEmSP()}${est && !ocultarValores ? ` · valores de ${esc(T.servico)} estimados pela tabela ${esc(T.local)}` : ""}</p>
    </footer>
    ${ctx.demo ? `<p class="fl-agua" aria-hidden="true">DEMONSTRAÇÃO · números ilustrativos</p>` : ""}`;
  folha.querySelectorAll("[data-av]").forEach(a => ctx.avatarMarca(a, ctx.nome, ctx.marca));
  folha.setAttribute("aria-label", `Resultados de ${mesNome} de ${m.ano} — ${ctx.nome}`);
  modal.querySelector("#folha-barra-t").textContent = `Folha de ${mesNome} de ${m.ano}`;
}

/** Na tela, a folha é um papel sobre a mesa: escala para caber (sem rolagem lateral no celular). */
function escalar() {
  if (!modal || modal.hidden) return;
  const k = Math.min(1, (innerWidth - 32) / 794);
  const mesa = modal.querySelector(".folha-mesa");
  folha.style.setProperty("--k", k.toFixed(4));
  mesa.style.setProperty("--kw", `${Math.round(794 * k)}px`);
  mesa.style.setProperty("--kh", `${Math.round(folha.offsetHeight * k)}px`);
}

async function imprimir() {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* sem FontFaceSet */ }
  const antes = document.title;
  // o título vira o nome do PDF
  document.title = `Resultados ${MESES[m.mes]} ${m.ano} — ${ctx.nome}`;
  const devolver = () => { document.title = antes; removeEventListener("afterprint", devolver); };
  addEventListener("afterprint", devolver);
  window.print();
}

function tecla(e) {
  if (modal.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
  else if (e.key === "Tab") {
    const f = [...modal.querySelectorAll('button:not([disabled]), [contenteditable="true"]')].filter(b => b.offsetParent !== null);   // AC-265: o texto editável entra no ciclo do Tab
    if (!f.length) { e.preventDefault(); return; }   // plano 2000d · KX-032: nada focável (botões desligados) — o Tab não sai do diálogo nem dá erro
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
}
let ligado = false;
function ligar() {
  if (ligado) return;
  ligado = true;
  modal.querySelector("#folha-imprimir").addEventListener("click", imprimir);
  modal.querySelector("#folha-fechar").addEventListener("click", fechar);
  const oc = modal.querySelector("#folha-ocultar");   // plano 2000d · DA-122
  if (oc) oc.addEventListener("click", () => { ocultarValores = !ocultarValores; oc.setAttribute("aria-pressed", String(ocultarValores)); montar(); escalar(); });
  modal.addEventListener("keydown", tecla);
  addEventListener("resize", () => { clearTimeout(modal._rz); modal._rz = setTimeout(escalar, 120); });
}

export const aberta = () => !!modal && !modal.hidden;

/** @param c { M, m, nome, marca, demo, meses, proximos, campeao, avatarMarca, corServ, volta } */
export function abrir(c) {
  ctx = c; m = c.m;
  modal = document.getElementById("folha-modal");
  folha = document.getElementById("folha");
  volta = c.volta || document.activeElement;
  ligar();
  montar();
  folha.hidden = false;
  modal.hidden = false;
  document.documentElement.classList.add("folha-aberta");
  document.getElementById("app").inert = true;
  escalar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(escalar);
  modal.querySelector("#folha-imprimir").focus({ preventScroll: true });
}
export function fechar() {
  if (!aberta()) return;
  modal.hidden = true;
  folha.hidden = true;
  document.documentElement.classList.remove("folha-aberta");
  document.getElementById("app").inert = false;
  if (volta && document.contains(volta) && volta.offsetParent !== null) volta.focus({ preventScroll: true });
}
