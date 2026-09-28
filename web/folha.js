/* ============================================================
   NEXUS ADS — folha.js · A FOLHA DO MÊS (A4 para imprimir ou PDF)
   Carregado por import() dinâmico (botão "Folha do mês" em
   Relatórios, créditos do curta, ?folha=AAAA-MM). Uma página A4 de
   papel com a marca da clínica — para deixar na mesa do dentista ou
   mandar em PDF pelo WhatsApp. A Nexus assina no rodapé.
   Mesmo número em todo lugar: M.consolidar(M.linhasDe(m.de, m.ate)) e
   M.crmTot(m.de, m.ate) — os MESMOS do resumo mensal do WhatsApp.
   Gráficos em SVG inline (nunca canvas: sai nítido no PDF).
   ============================================================ */
import { brl, brl0, int, esc, fin, MESES, MES3 } from "./nucleo.js";

/** PURO: os números da folha de um mês (iguais aos do relMensal). O "Cada R$ 1 investido virou"
    usa a MESMA base do herói e do curta — tratamentos ÷ (anúncios + gestão do mês) —, porque é a
    frase que o dentista leva; o "só anúncio" (a do resumo do WhatsApp) fica como linha de apoio. */
export function dadosFolha(M, m) {
  const t = M.consolidar(M.linhasDe(m.de, m.ate)), c = M.crmTot(m.de, m.ate);
  const fee = (M.CFG && M.CFG.fee) || 0, custo = t.gasto + fee;
  return {
    t, c, roas: t.gasto ? c.receita / t.gasto : null, fee, custo, retorno: custo ? c.receita / custo : null,
    serv: Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v).map(([nome, s]) => ({ nome, n: s.n, v: s.v })),
  };
}

let ctx = null, modal = null, folha = null, volta = null, m = null;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const p2 = n => String(n).padStart(2, "0");

function grafMeses(meses) {
  const W = 300, H = 132, base = 104, mx = Math.max(1, ...meses.map(x => x.fecharam));
  const n = meses.length, bw = Math.min(46, W / n * .5);
  return `<svg class="fl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pacientes novos por mês: ${meses.map(x => `${MESES[x.mes]} ${x.fecharam}`).join(", ")}">
    <line class="fl-eixo" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
    ${meses.map((x, k) => {
      const cx = (k + .5) * W / n, h = Math.max(3, x.fecharam / mx * 80), atual = k === n - 1;
      return `<rect class="${atual ? "fl-b-marca" : "fl-b"}" x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>
        <text class="fl-v" x="${cx.toFixed(1)}" y="${(base - h - 6).toFixed(1)}" text-anchor="middle">${x.fecharam}</text>
        <text class="fl-m" x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${MES3[x.mes]}${x.completo ? "" : " (parcial)"}</text>`;
    }).join("")}</svg>`;
}
/* "O que fechou" em tons da cor da clínica (100 → 25%), não na paleta padrão do painel */
const TOM_SERV = [100, 75, 55, 40, 25];
function grafServ(serv, total) {
  if (!serv.length) return `<p class="fl-vazio">Nenhum tratamento fechado no mês.</p>`;
  const lin = serv.slice(0, 5), W = 300, L = 26, mx = Math.max(...lin.map(s => s.v), 1);
  return `<svg class="fl-svg" viewBox="0 0 ${W} ${lin.length * L + 4}" role="img" aria-label="O que fechou: ${lin.map(s => `${s.nome} ${brl0(s.v)}`).join(", ")}">
    ${lin.map((s, k) => {
      const y = k * L + 4, w = Math.max(4, s.v / mx * 110);
      return `<text class="fl-sn" x="0" y="${y + 13}">${esc(s.nome)}</text>
        <rect x="118" y="${y + 3}" width="${w.toFixed(1)}" height="12" rx="3" style="fill: color-mix(in oklab, var(--marca) ${TOM_SERV[k] || 25}%, #FBF8F2)"/>
        <text class="fl-sv" x="${W}" y="${y + 13}" text-anchor="end">${brl0(s.v)} · ${s.n}</text>`;
    }).join("")}</svg>
    <p class="fl-mini">${total ? `${Math.round(lin[0].v / total * 100)}% do mês veio de ${esc(lin[0].nome.toLowerCase())}.` : ""}</p>`;
}

function montar() {
  const M = ctx.M, d = dadosFolha(M, m), { t, c, roas, retorno, fee } = d;
  const mesNome = MESES[m.mes], hoje = new Date();
  const cp = ctx.campeao;
  const frase = c.fecharam
    ? `Em ${mesNome}, os anúncios apareceram ${int(t.impressoes)} vezes, trouxeram <b>${int(t.conversoes)} ${Math.round(t.conversoes) === 1 ? "conversa" : "conversas"}</b> no WhatsApp, <b>${int(c.agendadas)} ${c.agendadas === 1 ? "avaliação marcada" : "avaliações marcadas"}</b> e <b>${int(c.fecharam)} ${c.fecharam === 1 ? "paciente novo" : "pacientes novos"}</b> — ${brl0(c.receita)} em tratamentos.`
    : `Em ${mesNome}, os anúncios apareceram ${int(t.impressoes)} vezes e trouxeram <b>${int(t.conversoes)} conversas</b> no WhatsApp e <b>${int(c.agendadas)} avaliações marcadas</b>.`;
  const etapas = [[t.impressoes, "vezes na tela"], [t.cliques, "tocaram no anúncio"], [t.conversoes, "conversas no WhatsApp"],
    [c.agendadas, "marcaram avaliação"], [c.compareceram, "vieram à clínica"], [c.fecharam, "fecharam tratamento"]];
  folha.innerHTML = `
    <header class="fl-faixa bloco">
      <div class="fl-cli"><span class="selo-av fl-av" data-av></span><div><b>${esc(ctx.nome)}</b><small>Relatório do mês · tráfego pago</small></div></div>
      <h1 class="fl-t">Resultados de ${mesNome} de ${m.ano}</h1>
    </header>
    <p class="fl-resumo bloco">${frase}</p>
    <ol class="fl-trilha bloco">${etapas.map(([v, l], k) => `<li${k === etapas.length - 1 ? ` class="fim"` : ""}><b>${int(v)}</b><span>${l}</span></li>`).join("")}</ol>
    <div class="fl-blocos">
      <div class="bloco"><span class="fl-rot">Investido em anúncios</span><b>${brl0(t.gasto)}</b><small>${int(t.conversoes)} conversas · ${brl(t.cpa)} cada</small></div>
      <div class="bloco"><span class="fl-rot">Tratamentos (estimativa)</span><b>${brl0(c.receita)}</b><small>${int(c.fecharam)} ${c.fecharam === 1 ? "paciente novo" : "pacientes novos"}</small></div>
      <div class="bloco fl-ret"><span class="fl-rot">Retorno</span><b>${fin(retorno) && c.receita ? `Cada R$ 1 investido virou ${brl(retorno)}` : "Ainda sem tratamento fechado"}</b><small>${fee ? "tratamentos ÷ (anúncios + gestão)" : "tratamentos ÷ investimento em anúncios"}${fee && fin(roas) && c.receita ? ` · só anúncio: ${brl(roas)}` : ""}</small></div>
    </div>
    <div class="fl-duo">
      <section class="bloco"><h2 class="fl-h">Pacientes novos por mês</h2>${grafMeses(ctx.meses)}</section>
      <section class="bloco"><h2 class="fl-h">O que fechou</h2>${grafServ(d.serv, c.receita)}</section>
    </div>
    <div class="fl-duo">
      <section class="bloco"><h2 class="fl-h">O anúncio que mais trouxe pacientes</h2>
        ${cp ? `<p class="fl-camp">${esc(cp.camp.nome)}</p><p class="fl-camp-q">${cp.camp.plat === "google" ? "Google" : "Instagram e Facebook"} · ${int(cp.k.conversas)} conversas · ${int(cp.k.fecharam)} ${cp.k.fecharam === 1 ? "paciente" : "pacientes"} · ${brl0(cp.k.receita)} em tratamentos</p>
          ${cp.cri ? `<p class="fl-mini">Criativo que mais chamou gente: ${esc(cp.cri.nome)}</p>` : ""}` : `<p class="fl-vazio">Sem anúncio com paciente no mês.</p>`}
      </section>
      <section class="bloco"><h2 class="fl-h">Para o próximo mês</h2>
        ${ctx.proximos.length ? `<ol class="fl-passos">${ctx.proximos.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : `<p class="fl-vazio">Seguir como está.</p>`}
      </section>
    </div>
    <footer class="fl-pe bloco">
      <p class="fl-assina"><svg class="nx-mono" aria-hidden="true"><use href="#nx-mono"/></svg><span>Preparado pela <b>Nexus</b> · gestão de tráfego · Taubaté-SP</span></p>
      <p class="fl-meta">Gerado em ${p2(hoje.getDate())}/${p2(hoje.getMonth() + 1)}/${hoje.getFullYear()} · valores de tratamento estimados pela tabela da clínica</p>
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
    const f = [...modal.querySelectorAll("button")].filter(b => b.offsetParent !== null);
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
