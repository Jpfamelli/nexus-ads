/* ============================================================
   NEXUS ADS — efeitos.js · a CÂMERA (sistema de movimento)
   Carregado por import() dinâmico no painel.js; se falhar, o painel
   continua de pé, só que parado (quadro final).

   COMO USAR
   · ligar({ anim })         o painel chama uma vez. anim = false com ?noanim
                             ou prefers-reduced-motion → nada se mexe.
   · MOV                     os tokens do painel.css em JS (curvas em string,
                             durações em ms): MOV.eOut, MOV.mola, MOV.tDados…
                             Use-os no WAAPI/rAF; nunca uma curva solta.
   · cenas(raiz, aoEntrar)   todo [data-cena] ainda fora de quadro é observado;
                             ao entrar ganha .em-cena + .entrando (puxada de foco)
                             UMA vez. Animações internas usam ".entrando X".
   · odometro(el, de, para)  número rola do texto anterior ao novo (strings já
                             formatadas). Largura travada por uma cópia fantasma.
   · caneta(path)            desenha um traço (pathLength=1) com a caneta de luz.
   · fotografar / flip       guardam a geometria antes de um redesenho e
                             interpolam depois (barras que mudam de altura).
   · emQuadro(el, cb)        avisa quando o elemento entra/sai da tela
                             (pausar loops fora de quadro).
   Regra de ouro: o fundo respira, os números nunca tremem.
   ============================================================ */

export const MOV = {
  eOut: "cubic-bezier(.23, 1, .32, 1)", eIo: "cubic-bezier(.77, 0, .175, 1)", eGaveta: "cubic-bezier(.32, .72, 0, 1)",
  mola: "cubic-bezier(.23, 1, .32, 1)", molaSuave: "cubic-bezier(.23, 1, .32, 1)",
  tMicro: 120, tUi: 220, tSai: 160, tFoco: 600, tMove: 620, tDados: 900, tInterp: 420, tCaneta: 1200, tCorte: 700, tNotif: 220,
  escada: 40, escadaCena: 60,
};
let ANIM = false;
const temDom = typeof document !== "undefined";

/** Lê os tokens do :root (o CSS é a fonte; o JS só espelha). */
export function lerTokens() {
  if (!temDom) return MOV;
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  const ms = n => { const s = v(n); if (!s) return null; const x = parseFloat(s); return /ms$/.test(s) ? x : x * 1000; };
  const curvas = { eOut: "--e-out", eIo: "--e-io", eGaveta: "--e-gaveta", mola: "--mola", molaSuave: "--mola-suave" };
  for (const [k, n] of Object.entries(curvas)) { const s = v(n); if (s && !/^var\(/.test(s)) MOV[k] = s; }
  const tempos = { tMicro: "--t-micro", tUi: "--t-ui", tSai: "--t-sai", tFoco: "--t-foco", tMove: "--t-move", tDados: "--t-dados",
    tInterp: "--t-interp", tCaneta: "--t-caneta", tCorte: "--t-corte", tNotif: "--t-notif", escada: "--escada", escadaCena: "--escada-cena" };
  for (const [k, n] of Object.entries(tempos)) { const x = ms(n); if (x != null && Number.isFinite(x)) MOV[k] = x; }
  // linear() pode não existir no WAAPI de navegador antigo: testa antes de usar
  try { document.createElement("i").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, easing: MOV.mola }).cancel(); }
  catch { MOV.mola = MOV.eOut; MOV.molaSuave = MOV.eOut; }
  return MOV;
}

export function ligar({ anim }) {
  ANIM = !!anim;
  lerTokens();
  if (ANIM && temDom && "IntersectionObserver" in window) document.documentElement.classList.add("cena-on");
  return MOV;
}

/* ============================================================
   CENAS — cada bloco entra em quadro uma vez
   ============================================================ */
let io = null, portao = Promise.resolve();
const aoEntrarDe = new WeakMap();
/** Segura as entradas em cena até a promessa resolver (ex.: a vinheta de abertura sair). */
export function segurar(p) { portao = Promise.resolve(p).catch(() => {}); }
function entrou(lote) {
  lote.forEach((b, n) => {
    b.style.setProperty("--ordem", n);
    b.classList.add("em-cena", "entrando");
    const cb = aoEntrarDe.get(b);
    if (cb) { try { cb(b); } catch (e) { console.error(e); } }
    clearTimeout(b._tEnt);
    b._tEnt = setTimeout(() => { b.classList.remove("entrando"); b.style.removeProperty("--ordem"); }, 2800);
  });
}
function observador() {
  if (io) return io;
  io = new IntersectionObserver(ents => {
    const lote = [];
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const alto = e.boundingClientRect.height, vh = innerHeight || 800;
      // bloco alto (funil, kanban) demoraria a chegar a 30%: vale mostrar 160 px (ou 40% da tela)
      if (e.intersectionRatio >= .3 || e.intersectionRect.height >= Math.min(vh * .4, 160) || (alto < 60 && e.intersectionRatio > 0)) {
        io.unobserve(e.target); e.target._obs = false; lote.push(e.target);
      }
    }
    if (lote.length) portao.then(() => entrou(lote.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)));
  }, { threshold: [0, .3, .6], rootMargin: "0px 0px -8% 0px" });
  return io;
}
/**
 * @param raiz      elemento cuja subárvore tem [data-cena]
 * @param aoEntrar  (bloco) => void — roda na hora em que o bloco entra (números, caneta…)
 */
export function cenas(raiz, aoEntrar) {
  const blocos = [...raiz.querySelectorAll("[data-cena]")];
  if (raiz.matches && raiz.matches("[data-cena]")) blocos.unshift(raiz);
  for (const b of blocos) {
    if (b.classList.contains("em-cena")) continue;
    if (!ANIM || !temDom || !("IntersectionObserver" in window)) { b.classList.add("em-cena"); continue; }
    if (aoEntrar) aoEntrarDe.set(b, aoEntrar);
    if (!b._obs) { b._obs = true; observador().observe(b); }
  }
}
/** O bloco já está em cena e parado (pode transformar em vez de entrar)? */
export const assentado = b => !b || (b.classList.contains("em-cena") && !b.classList.contains("entrando"));

/** Avisa quando o elemento entra/sai da tela. Devolve o desligador. */
export function emQuadro(el, cb, margem = "0px") {
  if (!temDom || !("IntersectionObserver" in window)) { cb(true); return () => {}; }
  const o = new IntersectionObserver(en => cb(en[en.length - 1].isIntersecting), { rootMargin: margem });
  o.observe(el);
  return () => o.disconnect();
}

/* ============================================================
   ODÔMETRO — dígitos em colunas 0–9, separadores fixos
   ============================================================ */
/** PURO (testável no Node): alinha os dígitos pela direita.
    Devolve [{ d: true, de, para, ch } | { d: false, ch }] na ordem do texto final. */
export function colunasOdo(txtDe, txtPara) {
  const digDe = [...String(txtDe ?? "")].filter(c => c >= "0" && c <= "9");
  const out = [];
  const chars = [...String(txtPara ?? "")];
  let r = 0;   // posição do dígito contando da direita
  for (let i = chars.length - 1; i >= 0; i--) {
    const c = chars[i];
    if (c >= "0" && c <= "9") {
      const ant = digDe[digDe.length - 1 - r];
      out.unshift({ d: true, ch: c, para: +c, de: ant != null ? +ant : 0, r });
      r++;
    } else out.unshift({ d: false, ch: c });
  }
  return out;
}

const PILHA = "0123456789";
export function odometro(el, txtDe, txtPara, o = {}) {
  if (!el) return;
  if (el._odoFim) el._odoFim();
  if (!ANIM || !temDom || txtDe === txtPara) { el.textContent = txtPara; return; }
  const cols = colunasOdo(txtDe, txtPara);
  const dur = o.dur ?? MOV.tDados, passo = 30;
  const nDig = cols.filter(c => c.d).length;
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  el.innerHTML = `<span class="sr-only">${esc(txtPara)}</span><span class="odo-v" aria-hidden="true"><span class="odo-g">${esc(txtPara)}</span><span class="odo-t">${
    cols.map(c => c.d
      ? `<span class="odo-c"><span class="odo-s">${c.ch}</span><span class="odo-p" style="--d:${c.de};transition-delay:${c.r * passo}ms">${[...PILHA].map(x => `<span>${x}</span>`).join("")}</span></span>`
      : `<span class="odo-x">${esc(c.ch)}</span>`).join("")}</span></span>`;
  const t = el.querySelector(".odo-t");
  const pilhas = [...el.querySelectorAll(".odo-p")];
  void t.offsetWidth;   // fixa o quadro de partida antes de mandar rolar
  t.classList.add("girando");
  const dig = cols.filter(c => c.d);
  pilhas.forEach((p, i) => { p.style.setProperty("--d", dig[i].para); });
  const total = dur + Math.max(0, nDig - 1) * passo;
  const fim = () => { clearTimeout(el._odoT); el._odoFim = null; el.textContent = txtPara; };
  el._odoFim = fim;
  el._odoT = setTimeout(fim, total + 60);
}

/* ============================================================
   CANETA DE LUZ — o traço se desenha com um ponto brilhante na ponta
   ============================================================ */
export function caneta(path, o = {}) {
  if (!ANIM || !path || !path.getTotalLength || !path.animate) return null;
  const dur = o.dur ?? MOV.tCaneta, atraso = o.atraso ?? 0;
  const svg = path.ownerSVGElement;
  let L = 0;
  try { L = path.getTotalLength(); } catch { return null; }
  if (!L) return null;
  path.style.strokeDasharray = "1";
  const a = path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dur, delay: atraso, easing: MOV.eOut, fill: "backwards" });
  let ponto = null;
  if (svg && o.ponto !== false) {
    ponto = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ponto.setAttribute("r", o.r || 4);
    ponto.setAttribute("class", "caneta");
    svg.appendChild(ponto);
  }
  let raf = 0;
  const passo = () => {
    const p = a.effect && a.effect.getComputedTiming().progress;
    if (ponto && p != null) {
      const q = path.getPointAtLength(Math.min(1, Math.max(0, p)) * L);
      ponto.setAttribute("cx", q.x); ponto.setAttribute("cy", q.y);
      ponto.style.opacity = p > 0 && p < 1 ? 1 : 0;
    }
    if (a.playState !== "finished" && a.playState !== "idle") raf = requestAnimationFrame(passo);
  };
  raf = requestAnimationFrame(passo);
  a.finished.catch(() => {}).then(() => {
    cancelAnimationFrame(raf);
    path.style.strokeDasharray = "";
    if (ponto) {
      const f = ponto.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOV.tUi, easing: MOV.eOut, fill: "forwards" });
      f.finished.catch(() => {}).then(() => ponto.remove());
    }
  });
  return a;
}

/* ============================================================
   FLIP — interpolar a geometria depois de um redesenho
   ============================================================ */
export function fotografar(raiz, sel, chave) {
  const m = new Map();
  if (!raiz) return m;
  raiz.querySelectorAll(sel).forEach(el => { const k = el.getAttribute(chave); if (k != null) m.set(k, el.getBoundingClientRect()); });
  return m;
}
export function flip(raiz, sel, foto, chave, o = {}) {
  if (!ANIM || !raiz || !foto || !foto.size) return;
  const dur = o.dur ?? MOV.tInterp;
  raiz.querySelectorAll(sel).forEach(el => {
    const a = foto.get(el.getAttribute(chave)), b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (!a) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: MOV.eOut }); return; }
    let k = 1;
    const svg = el.ownerSVGElement;
    if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width || 1;
    const dx = (a.left - b.left) / k, dy = (a.top - b.top) / k, sx = a.width / b.width || 1, sy = a.height / b.height || 1;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
    el.style.transformOrigin = "0 0";
    if (svg) el.style.transformBox = "fill-box";
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }], { duration: dur, easing: MOV.molaSuave });
  });
}

/* ============================================================
   UTILIDADES
   ============================================================ */
export const lerp = (a, b, t) => a + (b - a) * t;
export const espera = ms => new Promise(r => setTimeout(r, ms));
