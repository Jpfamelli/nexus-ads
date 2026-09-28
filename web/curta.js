/* ============================================================
   NEXUS ADS — curta.js · O CURTA (modo apresentação, ~45 s)
   Carregado por import() dinâmico (botão "Apresentar", tecla P ou
   ?apresentar). Sem ele, o painel segue igual.

   Sete cenas feitas de OBJETOS reais e dos números da própria clínica,
   do anúncio à cadeira: abertura · o anúncio · a conversa · a agenda ·
   a cadeira · a conta · créditos. Tarjas de cinema, legendas em Zodiak,
   cortes com vazamento de luz (View Transitions + cinema.corte()).
   Mesmo número em todo lugar: tudo sai de ctx.P (numerosPeriodo do
   painel) e de M.* — o retorno da cena 6 é o MESMO do herói.

   Controles: → / Espaço / metade direita avançam · ← / metade esquerda
   voltam · segurar > 250 ms pausa · Esc sai · F tela cheia · D discreto
   (nomes viram iniciais). ?cena=N abre direto. Com ?noanim ou movimento
   reduzido: sem avanço automático, números já no valor final.
   ============================================================ */
import { brl, brl0, int, esc, fin, fmtN, MESES, MES3, SEMANA, nomePlat } from "./nucleo.js";

export const CENAS = [
  { id: "abertura", titulo: "Abertura", dur: 4000 },
  { id: "anuncio", titulo: "O anúncio", dur: 8500 },
  { id: "conversa", titulo: "A conversa", dur: 8500 },
  { id: "agenda", titulo: "A agenda", dur: 7500 },
  { id: "cadeira", titulo: "A cadeira", dur: 8500 },
  { id: "conta", titulo: "A conta", dur: 8500 },
  { id: "creditos", titulo: "Créditos", dur: 0 },
];
/** Tempo até os créditos (a cena 7 fica parada): precisa caber em 50 s. */
export const ATE_CREDITOS = CENAS.slice(0, 6).reduce((s, c) => s + c.dur, 0);

/** PURO: os números de cada cena, direto de P (numerosPeriodo) e de M. Nada de fórmula nova. */
export function dadosCurta({ M, P, campeao = null }) {
  const { t, c, de, ate } = P, f = P.plat || "";
  const deAnuncio = L => L.plat && (!f || L.plat === f);
  const conversas = M.LEADS.filter(L => deAnuncio(L) && L.i >= de && L.i <= ate)
    .sort((a, b) => (b.i - a.i) || String(b.id).localeCompare(String(a.id), "pt-BR", { numeric: true }));
  const agenda = M.LEADS.filter(L => deAnuncio(L) && L.iAgenda != null && L.iAgenda >= de && L.iAgenda <= ate && L.iConsulta != null)
    .sort((a, b) => (b.iConsulta - a.iConsulta) || (b.iAgenda - a.iAgenda));
  return {
    impressoes: t.impressoes, cliques: t.cliques, cpa: t.cpa, gasto: t.gasto,
    conversas: c.conversas, agendadas: c.agendadas, vieram: c.compareceram, fecharam: c.fecharam, receita: c.receita,
    custo: P.custoTotal, retorno: P.retorno, comGestao: !f,
    serv: Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v).map(([nome, s]) => ({ nome, n: s.n, v: s.v })),
    lista: conversas, agenda, campeao,
  };
}
export const iniciais = nome => String(nome || "").trim().split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + ".").join(" ") || "—";

/* ============================================================
   ESTADO
   ============================================================ */
let ctx = null, el = null, D = null;
const st = { i: 0, auto: true, pausa: false, segura: false, t0: 0, resta: 0, timer: 0, tSeg: 0, discreto: false,
  volta: null, rolagem: 0, telaCheia: false, tCursor: 0, ouvintes: [], vt: null, titulo: false };
const $ = (s, r = el) => r.querySelector(s);
const $$ = (s, r = el) => [...r.querySelectorAll(s)];
const raizDoc = () => document.documentElement;
const ouvir = (alvo, ev, fn, o) => { alvo.addEventListener(ev, fn, o); st.ouvintes.push(() => alvo.removeEventListener(ev, fn, o)); };

/* ============================================================
   CENAS — cada uma devolve { txt, obj, leg } (HTML já escapado)
   ============================================================ */
const nomeP = (L, n = null) => `<b class="ct-pn" data-nome="${esc(ctx.nomeCurto(L.nome))}">${esc(st.discreto ? iniciais(ctx.nomeCurto(L.nome)) : ctx.nomeCurto(L.nome))}</b>`;
const dataCurta = i => { const d = ctx.M.dataDe(i); return `${SEMANA[d.getDay()]} · ${ctx.M.ddmm(i)}`; };
const quandoAtras = i => { const d = ctx.M.R - i; return d <= 0 ? "ontem" : d === 1 ? "anteontem" : `há ${d + 1} dias`; };
const num = (v, f, cls = "") => `<b class="ct-n ${cls}" data-ct-n="${fin(v) ? v : ""}" data-f="${f}">${fmtN(v, f)}</b>`;
const rotulo = (n, t) => `<p class="ct-rot"><span>${String(n).padStart(2, "0")}</span>${t}</p>`;
const periodoTxt = () => {
  const M = ctx.M, a = M.dataDe(ctx.P.de), b = M.dataDe(ctx.P.ate);
  return `${a.getDate()} de ${MES3[a.getMonth()]} a ${b.getDate()} de ${MES3[b.getMonth()]}`;
};
const tempoTxt = () => (ctx.P.dias === 7 ? "Uma semana" : ctx.P.dias === 60 ? "Dois meses" : "Um mês");
function limparGancho(nome) {
  const partes = String(nome || "").split(/\s+·\s+/);
  const tipo = partes.length > 1 ? partes[0] : "", resto = (partes.length > 1 ? partes.slice(1).join(" · ") : partes[0]) || "";
  return { tipo: tipo.toLowerCase(), texto: resto.replace(/^[“"«]+|[”"»]+$/g, "").trim() };
}

function cenaAbertura() {
  return {
    cls: "cn-abertura",
    txt: `<p class="ct-rot ct-apresenta"><svg class="nx-mono" aria-hidden="true"><use href="#nx-mono"/></svg>Nexus apresenta</p>
      <div class="ct-marca"><span class="selo-av ct-av-g" data-av></span><p class="ct-nome">${esc(ctx.nome)}</p></div>
      <h2 class="ct-h">Do anúncio<br>à cadeira.</h2>
      <p class="ct-periodo">${ctx.P.plat ? `Só ${nomePlat(ctx.P.plat)} · ` : ""}últimos ${ctx.P.dias} dias · ${periodoTxt()}</p>`,
    obj: "",
    leg: `${tempoTxt()} de anúncios da ${esc(ctx.nome)}, do primeiro toque à cadeira.`,
  };
}

function cenaAnuncio() {
  const cp = D.campeao, meta = !cp || cp.camp.plat !== "google";
  const g = limparGancho(cp && cp.cri ? cp.cri.nome : cp ? cp.camp.nome : "Avaliação sem compromisso");
  let tela;
  if (meta) {
    tela = `<div class="feed" aria-hidden="true">
        <div class="feed-top"><span class="selo-av feed-av" data-av></span><div><b>${esc(ctx.nome)}</b><small>Patrocinado</small></div><span class="feed-mais">···</span></div>
        <div class="feed-midia">${/v[ií]deo|reels/.test(g.tipo) ? `<span class="feed-play"></span>` : ""}<p class="feed-gancho">${esc(g.texto)}</p>${g.tipo ? `<span class="feed-tag">${esc(g.tipo)}</span>` : ""}</div>
        <div class="feed-cta"><span>Enviar mensagem</span><svg><use href="#ic-wa"/></svg></div>
        <div class="feed-acoes"><i class="fa-cor"></i><i class="fa-bal"></i><i class="fa-env"></i></div>
        <p class="feed-leg"><b>${esc(ctx.nome)}</b> ${esc(cp ? cp.camp.nome : "")}</p>
      </div>`;
  } else {
    const busca = cp.camp.nome.split(/\s+·\s+/).pop();
    tela = `<div class="busca-g" aria-hidden="true">
        <div class="bg-barra"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>${esc(busca)}</div>
        <div class="bg-res"><small>Patrocinado</small><p class="bg-site"><span class="selo-av" data-av></span>${esc(ctx.nome)}</p>
          <p class="bg-tit">${esc(g.texto)}</p><p class="bg-desc">${esc(cp.camp.nome)}</p><span class="bg-cta"><svg><use href="#ic-wa"/></svg>Enviar mensagem</span></div>
        <div class="bg-org"><i></i><i></i><i></i></div><div class="bg-org"><i></i><i></i></div>
      </div>`;
  }
  return {
    cls: "cn-anuncio",
    txt: `${rotulo(1, "O anúncio")}
      <p class="ct-grande">${num(D.impressoes, "int")}</p><p class="ct-sob">vezes na tela</p>
      <p class="ct-linha">${num(D.cliques, "int", "ct-n2")} tocaram para saber mais</p>
      ${cp ? `<p class="ct-nota">O que mais trouxe pacientes: <b>${esc(cp.camp.nome)}</b> · ${nomePlat(cp.camp.plat)}</p>` : ""}`,
    obj: ctx.foneHtml(tela, "fone-ct", 6),
    leg: `O anúncio apareceu ${int(D.impressoes)} vezes. ${int(D.cliques)} pessoas tocaram para saber mais.`,
  };
}

function cenaConversa() {
  const lista = D.lista.slice(0, 6), M = ctx.M;
  const linhas = lista.map((L, n) => {
    const k = L.cri && M.CRI[L.cri], cp = M.CAMP[L.camp], via = (k && k.curto) || (cp && cp.curto) || "anúncio";
    const ini = ctx.nomeCurto(L.nome).split(/\s+/).map(p => p[0] || "").join("").slice(0, 2).toUpperCase();
    // demo: tratamento + quando · modo real: só "Chamou pelo anúncio «…»" (nunca frase de paciente)
    const prev = ctx.demo ? `${esc(L.servico)} · via «${esc(via)}»` : `Chamou pelo anúncio «${esc(via)}»`;
    return `<li class="wl-i" style="--n:${n}"><span class="wl-av" style="--c:${ctx.AVC[ctx.hash(L.nome) % ctx.AVC.length]}">${esc(ini)}</span>
      <span class="wl-q">${nomeP(L)}<span class="wl-p">${prev}</span></span><span class="wl-h">${quandoAtras(L.i)}${n < 2 ? `<i class="wl-nl">1</i>` : ""}</span></li>`;
  }).join("");
  const tela = `<div class="wa-lista"><div class="wl-top"><b>Conversas</b><small>WhatsApp da clínica${ctx.demo ? " · exemplo" : ""}</small></div><ul>${linhas}</ul></div>`;
  return {
    cls: "cn-conversa",
    txt: `${rotulo(2, "A conversa")}
      <p class="ct-grande">${num(D.conversas, "int")}</p><p class="ct-sob">${D.conversas === 1 ? "conversa" : "conversas"} no WhatsApp</p>
      <p class="ct-linha">cada conversa custou ${num(D.cpa, "brl", "ct-n2")}</p>`,
    obj: ctx.foneHtml(tela, "fone-ct fone-wa", 6),
    leg: `${int(D.conversas)} pessoas chamaram no WhatsApp. Cada conversa custou ${brl(D.cpa)}.`,
  };
}

function cenaAgenda() {
  const cartoes = D.agenda.slice(0, 6), POS = [[-2, 4, 0], [3, 52, 6], [-1, 8, 34], [2, 56, 40], [-2.5, 2, 68], [1.5, 50, 74]];
  const html = cartoes.map((L, n) => {
    const [r, x, y] = POS[n];
    return `<div class="cc" style="--r:${r}deg;--x:${x}%;--y:${y}%;--n:${n}">
        <p class="cc-top"><span class="selo-av" data-av></span><b>${esc(ctx.nome)}</b></p>
        <p class="cc-t">Avaliação</p><p class="cc-nome">${nomeP(L)}</p><p class="cc-d">${dataCurta(L.iConsulta)}</p></div>`;
  }).join("");
  return {
    cls: "cn-agenda",
    txt: `${rotulo(3, "A agenda")}
      <p class="ct-grande">${num(D.agendadas, "int")}</p><p class="ct-sob">marcaram avaliação</p>
      <p class="ct-linha">${num(D.vieram, "int", "ct-n2")} vieram até a clínica</p>`,
    obj: `<div class="cartoes" aria-hidden="true">${html}</div>`,
    leg: `${int(D.agendadas)} marcaram avaliação. ${int(D.vieram)} vieram até a clínica.`,
  };
}

function cenaCadeira() {
  const linhas = D.serv.slice(0, 6).map((s, n) => `<li style="--n:${n}"><span>${esc(s.nome)}</span><i>×${s.n}</i><b>${brl0(s.v)}</b></li>`).join("");
  return {
    cls: "cn-cadeira",
    txt: `${rotulo(4, "A cadeira")}
      <p class="ct-grande">${num(D.fecharam, "int")}</p><p class="ct-sob">${D.fecharam === 1 ? "paciente novo" : "pacientes novos"}</p>
      <p class="ct-linha">${num(D.receita, "brl0", "ct-n2")} em tratamentos</p>`,
    obj: `<div class="recibo" aria-hidden="true" style="--linhas:${Math.min(6, D.serv.length)}">
        <p class="rc-top"><span class="selo-av" data-av></span><b>${esc(ctx.nome)}</b></p>
        <p class="rc-sub">Tratamentos fechados · últimos ${ctx.P.dias} dias</p>
        <ol class="rc-l">${linhas}</ol>
        <p class="rc-tot" style="--n:${Math.min(6, D.serv.length)}"><span>Total</span><b>${brl0(D.receita)}</b></p>
        <p class="rc-nota" style="--n:${Math.min(6, D.serv.length) + 1}">estimativa pela tabela da clínica</p>
      </div>`,
    leg: `${int(D.fecharam)} ${D.fecharam === 1 ? "virou paciente" : "viraram pacientes"}: ${brl0(D.receita)} em tratamentos.`,
  };
}

function cenaConta() {
  const mx = Math.max(D.custo, D.receita, 1), w = v => Math.max(2, v / mx * 100).toFixed(1);
  const cada = fin(D.retorno) ? brl(D.retorno) : "—";
  return {
    cls: "cn-conta",
    txt: `${rotulo(5, "A conta")}
      <p class="ct-frase">Cada R$ 1 ${D.comGestao ? "investido" : "em anúncio"} virou <b class="ct-varre">${cada}</b></p>
      <div class="barras">
        <div class="br"><span class="br-l">${D.comGestao ? "Investido · anúncios + gestão" : "Investido em anúncios"}</span>${num(D.custo, "brl0", "br-v")}<span class="br-b"><i style="--w:${w(D.custo)}%"></i></span></div>
        <div class="br br-volta"><span class="br-l">Voltou em tratamentos</span>${num(D.receita, "brl0", "br-v")}<span class="br-b"><i style="--w:${w(D.receita)}%"></i></span></div>
      </div>
      <p class="ct-nota">Tratamentos pela tabela da clínica ÷ ${D.comGestao ? "(anúncios + gestão da Nexus)" : "anúncios"}.</p>`,
    obj: "",
    leg: `Cada R$ 1 ${D.comGestao ? "investido" : "em anúncio"} virou ${cada}.`,
  };
}

function cenaCreditos() {
  const passos = (ctx.proximos || []).slice(0, 3);
  return {
    cls: `cn-creditos${ctx.demo ? " com-sim" : ""}`,
    txt: `<p class="ct-rot"><span>06</span>Para o próximo mês</p>
      ${passos.length ? `<ol class="ct-passos">${passos.map((p, n) => `<li style="--n:${n}">${esc(p)}</li>`).join("")}</ol>` : ""}
      <p class="ct-assina"><svg class="nx-mono" aria-hidden="true"><use href="#nx-mono"/></svg><span>Preparado pela <b>Nexus</b><small>gestão de tráfego · Taubaté-SP</small></span></p>
      <div class="ct-acoes"><button class="pill pill-bronze" type="button" data-ct="folha">Folha do mês</button><button class="pill pill-ghost" type="button" data-ct="sair">Voltar ao painel</button></div>`,
    obj: ctx.demo ? `<div class="ct-sim">${ctx.simuladorHtml(true)}</div>` : "",
    leg: `Preparado pela Nexus para a ${esc(ctx.nome)}.`,
  };
}
const MONTA = [cenaAbertura, cenaAnuncio, cenaConversa, cenaAgenda, cenaCadeira, cenaConta, cenaCreditos];

/* ============================================================
   O QUADRO — tarjas, legenda, progresso, controles
   ============================================================ */
function montarQuadro() {
  el.innerHTML = `
    <header class="ct-tarja ct-tarja-a">
      <p class="ct-selo"><span class="selo-av" data-av></span><b>${esc(ctx.nome)}</b>${ctx.demo ? `<span class="ct-simula">simulação</span>` : ""}</p>
      <button class="ct-sair" type="button" data-ct="sair" aria-label="Sair da apresentação (Esc)">Sair<kbd>Esc</kbd></button>
    </header>
    <div class="ct-cena" id="ct-cena"></div>
    <p class="ct-legenda" id="ct-legenda" aria-hidden="true"></p>
    <footer class="ct-tarja ct-tarja-b">
      <div class="ct-ctl">
        <button type="button" data-ct="ant" aria-label="Cena anterior (←)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button type="button" data-ct="pausa" aria-label="Pausar" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-pausa" d="M8 5v14M16 5v14"/><path class="i-toca" d="M8 5.5v13l10.5-6.5z"/></svg></button>
        <button type="button" data-ct="prox" aria-label="Próxima cena (→)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <ol class="ct-prog" aria-hidden="true">${CENAS.map(() => `<li><i></i></li>`).join("")}</ol>
      <p class="ct-conta" id="ct-conta"></p>
      <p class="ct-dicas" aria-hidden="true"><kbd>D</kbd> discreto <kbd>F</kbd> tela cheia</p>
    </footer>
    <p class="sr-only" id="ct-vivo" aria-live="polite"></p>
    <div class="ct-titulo" id="ct-titulo" hidden></div>`;
  $$("[data-av]").forEach(a => ctx.avatarMarca(a, ctx.nome, ctx.marca));
}

function renderCena() {
  const c = CENAS[st.i], m = MONTA[st.i]();
  const cena = $("#ct-cena");
  cena.className = `ct-cena ${m.cls}${m.obj ? "" : " sem-obj"}`;
  cena.innerHTML = `<div class="ct-txt">${m.txt}</div>${m.obj ? `<div class="ct-obj">${m.obj}</div>` : ""}`;
  $$("[data-av]", cena).forEach(a => ctx.avatarMarca(a, ctx.nome, ctx.marca));
  $("#ct-legenda").innerHTML = m.leg;
  $("#ct-conta").innerHTML = `<b>${String(st.i + 1).padStart(2, "0")}</b> / 07 · ${c.titulo}`;
  $("#ct-vivo").textContent = `Cena ${st.i + 1} de 7: ${c.titulo}. ${$("#ct-legenda").textContent}`;
  $$(".ct-prog li").forEach((li, n) => { li.className = n < st.i ? "feito" : n === st.i ? "on" : ""; });
  el.style.setProperty("--ct-dur", `${c.dur || 1}ms`);
  if (st.i === 6 && ctx.demo) { const s = $(".ct-sim", cena); if (s) ctx.ligarSimulador(s); }
  // entra em quadro: objetos e números (com ?noanim / reduzido, tudo já no valor final)
  if (ctx.anim) {
    cena.classList.remove("entra"); void cena.offsetWidth; cena.classList.add("entra");
    if (ctx.FX) $$("[data-ct-n]", cena).forEach(b => { const v = +b.dataset.ctN; if (b.dataset.ctN !== "" && fin(v) && v) ctx.FX.odometro(b, fmtN(0, b.dataset.f), fmtN(v, b.dataset.f), { dur: 1300 }); });
  }
}

/* ============================================================
   TEMPO — avanço automático com pausa (segurar, aba oculta, botão)
   ============================================================ */
function agendar() {
  clearTimeout(st.timer);
  const c = CENAS[st.i];
  if (!st.auto || !c.dur || st.titulo) return;
  if (st.pausa || st.segura || document.hidden) return;
  st.t0 = performance.now();
  st.timer = setTimeout(() => ir(st.i + 1, 1), st.resta);
}
function pausar(motivo) {
  if (motivo === "segura") st.segura = true; else st.pausa = true;
  if (st.timer) { clearTimeout(st.timer); st.timer = 0; st.resta = Math.max(0, st.resta - (performance.now() - st.t0)); }
  el.classList.add("pausado");
  atualizarPausa();
}
function retomar(motivo) {
  if (motivo === "segura") st.segura = false; else st.pausa = false;
  if (st.pausa || st.segura) return;
  el.classList.remove("pausado");
  atualizarPausa();
  agendar();
}
function atualizarPausa() {
  const b = $('[data-ct="pausa"]');
  if (!b) return;
  const p = st.pausa || !st.auto;
  b.setAttribute("aria-pressed", String(p));
  b.setAttribute("aria-label", p ? "Continuar" : "Pausar");
  b.classList.toggle("parado", p);
}

function ir(i, dir) {
  i = Math.max(0, Math.min(CENAS.length - 1, i));
  if (i === st.i && !dir) return;
  if (i === st.i) return;
  const trocar = () => { st.i = i; st.resta = CENAS[i].dur; renderCena(); };
  clearTimeout(st.timer); st.timer = 0;
  if (ctx.anim && document.startViewTransition) {
    try { if (st.vt) st.vt.skipTransition(); } catch { /* já acabou */ }
    try { st.vt = document.startViewTransition({ update: trocar, types: [dir < 0 ? "voltar" : "avancar"] }); }
    catch { try { st.vt = document.startViewTransition(trocar); } catch { st.vt = null; trocar(); } }
    if (st.vt) { st.vt.ready.catch(() => {}); st.vt.updateCallbackDone.catch(() => {}); st.vt.finished.catch(() => {}).then(() => { st.vt = null; }); }
  } else trocar();
  if (ctx.anim && ctx.CINE && ctx.CINE.corte) ctx.CINE.corte();
  agendar();
}
const avancar = () => ir(st.i + 1, 1);
const voltarCena = () => ir(st.i - 1, -1);

/* ============================================================
   TELA CHEIA, CURSOR, FOCO
   ============================================================ */
function telaCheia(on) {
  try {
    if (on && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(() => { st.telaCheia = true; }, () => {});
    else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch { /* sem tela cheia (iframe, navegador antigo) */ }
}
function mexeuCursor() {
  el.classList.remove("sem-cursor");
  clearTimeout(st.tCursor);
  if (ctx.fino) st.tCursor = setTimeout(() => el.classList.add("sem-cursor"), 2000);
}
const focaveis = () => $$("button, [href], input, select, textarea, [tabindex='0']").filter(x => !x.disabled && x.offsetParent !== null);
function prenderFoco(e) {
  const f = focaveis();
  if (!f.length) { e.preventDefault(); el.focus(); return; }
  const a = document.activeElement, i = f.indexOf(a);
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
}
function discreto() {
  st.discreto = !st.discreto;
  $$("[data-nome]").forEach(b => { b.textContent = st.discreto ? iniciais(b.dataset.nome) : b.dataset.nome; });
  el.classList.toggle("discreto", st.discreto);
  $("#ct-vivo").textContent = st.discreto ? "Modo discreto: nomes viram iniciais." : "Nomes voltaram.";
}

function tecla(e) {
  if (el.hidden) return;
  const k = e.key, t = e.target, emControle = t && t.closest && t.closest("button, input, select, textarea, a");
  if (k === "Escape") { e.preventDefault(); e.stopPropagation(); return sair(); }
  if (k === "Tab") return prenderFoco(e);
  if (st.titulo) { if (k === "Enter" || k === " ") { e.preventDefault(); comecar(); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "ArrowRight" || k === "PageDown" || (k === " " && !emControle)) { e.preventDefault(); e.stopPropagation(); avancar(); }
  else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); e.stopPropagation(); voltarCena(); }
  else if ((k === "f" || k === "F") && !(t && t.closest && t.closest("input"))) { e.preventDefault(); telaCheia(!document.fullscreenElement); }
  else if ((k === "d" || k === "D") && !(t && t.closest && t.closest("input"))) { e.preventDefault(); discreto(); }
  else if (k === "Home") { e.preventDefault(); ir(0, -1); }
  else if (k === "End") { e.preventDefault(); ir(6, 1); }
}

/* clique: metade direita avança, esquerda volta; segurar > 250 ms pausa (e soltar continua) */
let aperto = null;
function aperta(e) {
  if (st.titulo || e.button > 0 || e.target.closest("button, a, input, select, textarea, label, .ct-sim, .ct-tarja")) return;
  aperto = { x: e.clientX, segurou: false };
  clearTimeout(st.tSeg);
  st.tSeg = setTimeout(() => { if (aperto) { aperto.segurou = true; pausar("segura"); } }, 250);
}
function solta(e) {
  if (!aperto) return;
  clearTimeout(st.tSeg);
  const a = aperto;
  aperto = null;
  if (a.segurou) { retomar("segura"); return; }
  if (e.clientX > innerWidth / 2) avancar(); else voltarCena();
}

function clique(e) {
  const b = e.target.closest("[data-ct]");
  if (!b) return;
  const acao = b.dataset.ct;
  if (acao === "sair") sair();
  else if (acao === "prox") avancar();
  else if (acao === "ant") voltarCena();
  else if (acao === "pausa") { if (!st.auto) { st.auto = true; st.pausa = false; el.classList.remove("pausado"); atualizarPausa(); agendar(); } else if (st.pausa) retomar(); else pausar(); }
  else if (acao === "folha") { const f = ctx.aoFolha; sair(); f(); }
  else if (acao === "comecar") comecar();
}

/* ============================================================
   ABRIR / SAIR
   ============================================================ */
function mostrarTitulo() {
  st.titulo = true;
  const t = $("#ct-titulo");
  t.innerHTML = `<div class="ctt-in"><p class="ct-rot ct-apresenta"><svg class="nx-mono" aria-hidden="true"><use href="#nx-mono"/></svg>Nexus apresenta</p>
      <div class="ct-marca"><span class="selo-av ct-av-g" data-av></span><p class="ct-nome">${esc(ctx.nome)}</p></div>
      <p class="ctt-sub">${tempoTxt()} de anúncios, do anúncio à cadeira · cerca de 45 segundos</p>
      <button class="pill pill-bronze pill-lg ctt-go" type="button" data-ct="comecar">Começar <span aria-hidden="true">▶</span></button>
      <p class="ctt-dica"><kbd>→</kbd> avança <kbd>←</kbd> volta <kbd>Esc</kbd> sai</p></div>`;
  $$("[data-av]", t).forEach(a => ctx.avatarMarca(a, ctx.nome, ctx.marca));
  t.hidden = false;
  el.classList.add("com-titulo");
  $(".ctt-go", t).focus();
}
function comecar() {
  if (!st.titulo) return;
  st.titulo = false;
  $("#ct-titulo").hidden = true;
  el.classList.remove("com-titulo");
  telaCheia(true);   // é um gesto (clique ou tecla): a tela cheia pode pedir
  st.resta = CENAS[st.i].dur;
  if (ctx.anim) { const cena = $("#ct-cena"); cena.classList.remove("entra"); void cena.offsetWidth; renderCena(); }
  el.focus({ preventScroll: true });
  agendar();
}

export const aberto = () => !!el && !el.hidden;

/**
 * @param c   contexto do painel (M, P, nome, marca, demo, anim, FX, CINE, helpers)
 * @param o   { cena: 1–7, titulo: bool (cartão "Começar ▶", para ?apresentar) }
 */
export function abrir(c, o = {}) {
  if (aberto()) return;
  ctx = c;
  el = document.getElementById("palco-curta");
  D = dadosCurta(ctx);
  st.volta = ctx.voltar() || document.activeElement;
  st.rolagem = scrollY;
  st.auto = !!ctx.anim;
  st.pausa = false; st.segura = false; st.discreto = false;
  st.i = Math.max(0, Math.min(6, (parseInt(o.cena, 10) || 1) - 1));
  st.resta = CENAS[st.i].dur;
  montarQuadro();
  el.tabIndex = -1;
  el.hidden = false;
  raizDoc().classList.add("apresentando");
  document.getElementById("app").inert = true;
  el.classList.toggle("anim", !!ctx.anim);
  renderCena();
  atualizarPausa();
  // as tarjas entram (600 ms); com ?noanim/reduzido já estão lá
  requestAnimationFrame(() => el.classList.add("tarjas-on"));
  ouvir(window, "keydown", tecla, true);
  ouvir(el, "click", clique);
  ouvir(el, "pointerdown", aperta);
  ouvir(window, "pointerup", solta);
  ouvir(el, "pointermove", mexeuCursor, { passive: true });
  ouvir(document, "visibilitychange", () => { if (document.hidden) pausar("segura"); else retomar("segura"); });
  ouvir(document, "fullscreenchange", () => { st.telaCheia = !!document.fullscreenElement; });
  mexeuCursor();
  if (o.titulo) mostrarTitulo();
  else {
    // tela cheia só dentro de um gesto (botão, tecla P): ?apresentar&cena=N abre sem pedir
    if (o.gesto && (!navigator.userActivation || navigator.userActivation.isActive)) telaCheia(true);
    el.focus({ preventScroll: true });
    agendar();
  }
}

export function sair() {
  if (!aberto()) return;
  clearTimeout(st.timer); clearTimeout(st.tSeg); clearTimeout(st.tCursor);
  st.timer = 0;
  try { if (st.vt) st.vt.skipTransition(); } catch { /* ok */ }
  st.ouvintes.forEach(f => f()); st.ouvintes = [];
  const emTelaCheia = !!document.fullscreenElement;
  el.hidden = true;
  el.classList.remove("tarjas-on", "pausado", "com-titulo", "sem-cursor", "discreto");
  el.innerHTML = "";
  raizDoc().classList.remove("apresentando");
  document.getElementById("app").inert = false;
  const c0 = ctx;
  // volta à mesma aba, à mesma rolagem e com o foco no botão "Apresentar" (depois de sair da tela cheia)
  const devolver = () => {
    scrollTo({ top: st.rolagem, behavior: "instant" });
    const v = c0.voltar();
    const alvo = v && v.offsetParent ? v : st.volta && document.contains(st.volta) && st.volta.offsetParent ? st.volta : document.getElementById("main");
    if (alvo) alvo.focus({ preventScroll: true });
  };
  if (emTelaCheia && document.exitFullscreen) document.exitFullscreen().catch(() => {}).then(() => requestAnimationFrame(devolver));
  else devolver();
  if (c0.aoSair) c0.aoSair();
}
