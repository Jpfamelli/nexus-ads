/* ============================================================
   NEXUS ADS — cinema.js · o PALCO e a luz (decoração pura)
   Carregado por import() dinâmico; se falhar, o painel fica com o
   fundo sólido e funciona igual. Nada aqui mexe em número, tabela,
   kanban ou formulário: o fundo respira, os números nunca tremem.

   · ligar({ anim, semente })  acende o palco (bokeh, vazamentos, grão,
     vinheta, respiração) e, com pointer:fine + anim, a luz do cursor,
     os cantos de autofoco, a luz-chave nos cartões, o tilt (só herói e
     celulares) e os botões magnéticos.
   · semente(n)   troca o cenário do bokeh (painel 1, login 3, curta 5).
   · corte()      a faixa de luz quente que cruza a tela na troca de aba
                  (e entre as cenas do curta).
   · radar(scope) varredura com persistência de fósforo.
   · vinheta()    o monograma se desenha na primeira abertura da sessão.
   Leis: rAF só com a aba visível e o objeto em quadro; celular = palco
   estático; ?noanim e movimento reduzido = um quadro só, determinístico.
   ============================================================ */

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const html = document.documentElement;
let ANIM = false, FINO = false, MOVEL = false;

/* ============================================================
   1. PALCO
   ============================================================ */
const CORES = ["207,149,64", "245,233,214", "176,118,31", "224,160,90", "230,190,130", "207,149,64", "224,160,90"];
const AZUL_RARO = "120,160,200";
const ESCALA = .34;               // o bokeh já é desfocado: desenhar a 1/3 e ampliar sai de graça
const P = { el: null, cv: null, ctx: null, luzes: [], sprites: {}, W: 0, H: 0, t: 0, mx: .5, my: .5, tx: .5, ty: .5,
  raf: 0, ult: 0, semente: 1, deltas: [], cortou: false, visivel: true };

function sprite(c, a) {
  const k = c + a.toFixed(3);
  if (P.sprites[k]) return P.sprites[k];
  const s = document.createElement("canvas");
  s.width = s.height = 128;
  const g = s.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  // borda um pouco mais forte a 86%: o anel de uma lente de verdade
  r.addColorStop(0, `rgba(${c},${a * .9})`);
  r.addColorStop(.72, `rgba(${c},${a * .82})`);
  r.addColorStop(.86, `rgba(${c},${Math.min(1, a * 1.12)})`);
  r.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = r; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  return (P.sprites[k] = s);
}

function gerarLuzes(seed) {
  const r = mulberry32(seed * 7919 + 17);
  const n = MOVEL ? 14 : 24;
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = r();
    // puxadas para as bordas e para o alto à direita (o centro é dos cartões)
    const lado = r() < .64;
    const x = lado ? 1 - Math.pow(r(), 2.1) * .52 : Math.pow(r(), 2.1) * .46;
    const y = Math.pow(r(), 1.5) * .96;
    const c = r() < .07 ? AZUL_RARO : CORES[(r() * CORES.length) | 0];
    out.push({ x, y, z, r: 16 + z * 64, c, a: .10 + r() * .22, ph: r() * 6.283, sp: .2 + r() * .5 });
  }
  return out;
}

function medir() {
  if (!P.cv) return;
  const w = Math.max(1, Math.round(P.cv.clientWidth * ESCALA)), h = Math.max(1, Math.round(P.cv.clientHeight * ESCALA));
  if (w !== P.W || h !== P.H) { P.W = P.cv.width = w; P.H = P.cv.height = h; }
}

function quadro() {
  const { ctx, W, H } = P;
  if (!ctx || !W) return;
  P.mx += (P.tx - P.mx) * .04; P.my += (P.ty - P.my) * .04;
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  const lim = P.cortou ? Math.ceil(P.luzes.length / 2) : P.luzes.length;
  for (let i = 0; i < lim; i++) {
    const b = P.luzes[i];
    const prof = 1 + b.z * 2;
    const px = (b.x + Math.sin(P.t * .05 * b.sp + b.ph) * .02) * W + (P.mx - .5) * 40 * ESCALA * prof;
    const py = (b.y + Math.cos(P.t * .04 * b.sp + b.ph) * .02) * H + (P.my - .5) * 26 * ESCALA * prof;
    const pul = .75 + .25 * Math.sin(P.t * b.sp + b.ph);
    const s = b.r * 2 * ESCALA * 2.2;
    ctx.globalAlpha = pul;
    ctx.drawImage(sprite(b.c, b.a), px - s / 2, py - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function laco(now) {
  P.raf = 0;
  if (!ANIM || MOVEL || document.hidden || !P.visivel) return;
  // governador: se o navegador está sofrendo (média > 24 ms entre quadros), metade das luzes
  if (P.antes) {
    P.deltas.push(now - P.antes);
    if (P.deltas.length > 60) P.deltas.shift();
    if (!P.cortou && P.deltas.length === 60 && P.deltas.reduce((s, x) => s + x, 0) / 60 > 24) P.cortou = true;
  }
  P.antes = now;
  if (now - P.ult >= 33) { P.ult = now; P.t += .033; quadro(); }   // 30 fps bastam para luz fora de foco
  P.raf = requestAnimationFrame(laco);
}
function tocar() { if (!P.raf && ANIM && !MOVEL && !document.hidden && P.visivel) { P.antes = 0; P.raf = requestAnimationFrame(laco); } }
function parar() { if (P.raf) cancelAnimationFrame(P.raf); P.raf = 0; }

function grao(seed) {
  const c = document.createElement("canvas");
  c.width = c.height = 220;
  const g = c.getContext("2d"), d = g.createImageData(220, 220), r = mulberry32(seed * 131 + 7);
  for (let i = 0; i < d.data.length; i += 4) { const v = (r() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c.toDataURL();
}

function montarPalco() {
  if (P.el) return;
  const el = document.createElement("div");
  el.className = "palco";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<canvas></canvas><i class="leak leak-a"></i><i class="leak leak-b"></i><i class="grao"></i><i class="lente"></i>`;
  document.body.prepend(el);
  P.el = el; P.cv = el.querySelector("canvas"); P.ctx = P.cv.getContext("2d");
  el.querySelector(".grao").style.backgroundImage = `url(${grao(11)})`;
}

export function semente(n) {
  P.semente = n;
  P.luzes = gerarLuzes(n);
  P.t = n * 3.7;              // quadro de partida fixo por semente: ?noanim sai idêntico sempre
  P.mx = P.tx = .5; P.my = P.ty = .5;
  medir(); quadro();
}

/* ============================================================
   2. LUZ DO CURSOR + CANTOS DE AUTOFOCO (pointer:fine)
   ============================================================ */
const C = { luz: null, cantos: [], x: -100, y: -100, lx: -100, ly: -100, raf: 0, alvo: null, dentro: false };
const SEL_SOME = "input, textarea, select, table, [contenteditable], .campo, .ph-body";
const SEL_BOTAO = "button, a, [role='radio'], [role='switch'], .lead, label.chk";

function montarCursor() {
  C.luz = document.createElement("div");
  C.luz.className = "luz some";
  C.luz.setAttribute("aria-hidden", "true");
  document.body.appendChild(C.luz);
  for (const k of ["a", "b", "c", "d"]) {
    const c = document.createElement("i");
    c.className = "canto canto-" + k;
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    C.cantos.push(c);
  }
}
function posCantos() {
  const [a, b, c, d] = C.cantos;
  if (C.alvo && document.contains(C.alvo) && C.alvo.offsetParent !== null) {
    const r = C.alvo.getBoundingClientRect(), m = 6, s = 14;
    const L = r.left - m, T = r.top - m, R = r.right + m - s, B = r.bottom + m - s;
    a.style.transform = `translate3d(${L}px,${T}px,0)`; b.style.transform = `translate3d(${R}px,${T}px,0)`;
    c.style.transform = `translate3d(${L}px,${B}px,0)`; d.style.transform = `translate3d(${R}px,${B}px,0)`;
    C.cantos.forEach(x => x.classList.add("on"));
  } else {
    const x = C.x - 7, y = C.y - 7;
    C.cantos.forEach(k => { k.style.transform = `translate3d(${x}px,${y}px,0)`; k.classList.remove("on"); });
  }
}
function lacoCursor() {
  C.lx += (C.x - C.lx) * .2; C.ly += (C.y - C.ly) * .2;
  C.luz.style.transform = `translate3d(${C.lx.toFixed(1)}px,${C.ly.toFixed(1)}px,0)`;
  C.raf = Math.abs(C.x - C.lx) + Math.abs(C.y - C.ly) > .3 ? requestAnimationFrame(lacoCursor) : 0;   // parado = sem rAF
}

/* ============================================================
   3. LUZ-CHAVE, TILT E BOTÕES MAGNÉTICOS
   ============================================================ */
let cartaoLuz = null, rafLuz = 0, ultEv = null;
function luzChave() {
  rafLuz = 0;
  const e = ultEv;
  if (!e) return;
  const alvo = e.target && e.target.closest ? e.target.closest(".card, .lead") : null;
  if (cartaoLuz && cartaoLuz !== alvo) { cartaoLuz.style.setProperty("--mx", "-999px"); cartaoLuz.style.setProperty("--my", "-999px"); }
  cartaoLuz = alvo;
  if (alvo) {
    const r = alvo.getBoundingClientRect();
    alvo.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px");
    alvo.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
  }
}

const T = { itens: new Map(), raf: 0 };
function tiltAlvo(e) {
  document.querySelectorAll("[data-tilt]").forEach(el => {
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return;
    const max = +el.dataset.tilt || 2;
    let st = T.itens.get(el);
    if (!st) { st = { rx: 0, ry: 0, tx: 0, ty: 0 }; T.itens.set(el, st); }
    const r = el.getBoundingClientRect();
    const dentro = e && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (dentro) {
      const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
      st.ty = Math.max(-max, Math.min(max, nx * max * 2));
      st.tx = Math.max(-max, Math.min(max, -ny * max * 2));
      el.style.willChange = "transform";
    } else { st.tx = 0; st.ty = 0; }
  });
  if (!T.raf) T.raf = requestAnimationFrame(lacoTilt);
}
function lacoTilt() {
  T.raf = 0;
  let mexe = false;
  T.itens.forEach((st, el) => {
    if (!el.isConnected) { T.itens.delete(el); return; }   // o celular do herói é redesenhado a cada filtro
    st.rx += (st.tx - st.rx) * .12; st.ry += (st.ty - st.ry) * .12;
    if (Math.abs(st.tx - st.rx) > .01 || Math.abs(st.ty - st.ry) > .01) mexe = true;
    else if (!st.tx && !st.ty) el.style.willChange = "";
    el.style.setProperty("--rx", st.rx.toFixed(3) + "deg");
    el.style.setProperty("--ry", st.ry.toFixed(3) + "deg");
    el.style.setProperty("--gx", (.09 + Math.abs(st.ry) * .012).toFixed(3));
  });
  if (mexe) T.raf = requestAnimationFrame(lacoTilt);
}

const MAG = { itens: new Map(), raf: 0, x: -1e4, y: -1e4 };
const SEL_MAG = ".pill-bronze, .pill-ink, .seg button, .nav-b";
function magAlvos() {
  const vis = [...document.querySelectorAll(SEL_MAG)].filter(b => !b.disabled && b.offsetParent !== null);
  for (const b of vis) {
    let st = MAG.itens.get(b);
    if (!st) { st = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 }; MAG.itens.set(b, st); }
    const r = b.getBoundingClientRect();
    const dx = Math.max(r.left - MAG.x, 0, MAG.x - r.right), dy = Math.max(r.top - MAG.y, 0, MAG.y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d <= 80) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, vx = MAG.x - cx, vy = MAG.y - cy, n = Math.hypot(vx, vy) || 1;
      const f = (1 - d / 80) * Math.min(1, n / 40) * 6;
      st.ax = vx / n * f; st.ay = vy / n * f;
    } else { st.ax = 0; st.ay = 0; }
  }
  if (!MAG.raf) MAG.raf = requestAnimationFrame(lacoMag);
}
function lacoMag() {
  MAG.raf = 0;
  let mexe = false;
  MAG.itens.forEach((st, b) => {
    if (!document.contains(b)) { MAG.itens.delete(b); return; }
    // mola k = .18, amortecimento .75: volta com uma passadinha
    st.vx = (st.vx + (st.ax - st.x) * .18) * .75; st.vy = (st.vy + (st.ay - st.y) * .18) * .75;
    st.x += st.vx; st.y += st.vy;
    if (Math.abs(st.ax - st.x) + Math.abs(st.ay - st.y) + Math.abs(st.vx) + Math.abs(st.vy) > .05) mexe = true;
    else { st.x = st.ax; st.y = st.ay; }
    b.style.translate = Math.abs(st.x) + Math.abs(st.y) < .05 ? "" : `${st.x.toFixed(2)}px ${st.y.toFixed(2)}px`;
  });
  if (mexe) MAG.raf = requestAnimationFrame(lacoMag);
}

function ligarPonteiro() {
  montarCursor();
  let rafCur = 0, ev = null;
  const aplicar = () => {
    rafCur = 0;
    const e = ev;
    if (!e) return;
    C.x = e.clientX; C.y = e.clientY;
    if (!C.dentro) { C.lx = C.x; C.ly = C.y; C.dentro = true; }
    const t = e.target && e.target.closest ? e.target : null;
    const some = !t || !!t.closest(SEL_SOME);
    C.luz.classList.toggle("some", some);
    C.luz.classList.toggle("sobre-botao", !some && !!t.closest(SEL_BOTAO));
    const foco = t && t.closest("[data-foco]");
    if (foco !== C.alvo) C.alvo = foco;
    posCantos();
    if (!C.raf) C.raf = requestAnimationFrame(lacoCursor);
    // palco: o cursor dá profundidade às luzes
    P.tx = e.clientX / innerWidth; P.ty = e.clientY / innerHeight;
    tiltAlvo(e);
    MAG.x = e.clientX; MAG.y = e.clientY; magAlvos();
  };
  addEventListener("pointermove", e => {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    ev = e; ultEv = e;
    if (!rafCur) rafCur = requestAnimationFrame(aplicar);
    if (!rafLuz) rafLuz = requestAnimationFrame(luzChave);
  }, { passive: true });
  document.addEventListener("pointerleave", () => {
    C.luz.classList.add("some"); C.alvo = null; C.dentro = false; posCantos();
    MAG.x = MAG.y = -1e4; magAlvos(); tiltAlvo(null);
    if (cartaoLuz) { cartaoLuz.style.setProperty("--mx", "-999px"); cartaoLuz.style.setProperty("--my", "-999px"); cartaoLuz = null; }
  });
  addEventListener("scroll", () => { if (C.alvo) posCantos(); }, { passive: true });
  // teclado nunca desloca nada: ao navegar por Tab, o magnetismo e o tilt se desligam
  addEventListener("keydown", e => { if (e.key === "Tab") { MAG.x = MAG.y = -1e4; magAlvos(); tiltAlvo(null); C.luz.classList.add("some"); } });
}

/* ============================================================
   4. CORTE — faixa de luz quente entre abas
   ============================================================ */
let corteEl = null;
export function corte() {
  if (!ANIM) return;
  if (!corteEl) {
    corteEl = document.createElement("div");
    corteEl.className = "corte";
    corteEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(corteEl);
    corteEl.addEventListener("animationend", () => corteEl.classList.remove("passa"));
  }
  corteEl.classList.remove("passa");
  void corteEl.offsetWidth;
  corteEl.classList.add("passa");
}

/* ============================================================
   5. RADAR — persistência de fósforo
   ============================================================ */
const COR_SEV = { critico: [240, 106, 78], alerta: [226, 176, 102], info: [143, 179, 211] };
export function radar(scope) {
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  scope.appendChild(cv);
  scope.classList.add("com-canvas");
  const ctx = cv.getContext("2d");
  const st = { blips: [], ang: -Math.PI / 2, vel: 1, t0: 0, raf: 0, visivel: false, realce: null, ult: 0, surto: 0, aoApontar: null, W: 0 };
  const BASE = Math.PI * 2 / 3.6;   // uma volta a cada 3,6 s
  const medirR = () => {
    const w = scope.clientWidth; if (!w) return false;
    const d = Math.min(devicePixelRatio || 1, 2);
    if (w !== st.W) { st.W = w; cv.width = cv.height = Math.round(w * d); ctx.setTransform(d, 0, 0, d, 0, 0); }
    return true;
  };
  const desenhar = now => {
    if (!medirR()) return;
    const w = st.W, c = w / 2, R = w / 2 - 1;
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = "rgba(205,187,155,.18)"; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(c, c, R * k / 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, w); ctx.moveTo(0, c); ctx.lineTo(w, c); ctx.stroke();
    // feixe em cunha com rastro de 60°
    const passos = 30, rastro = Math.PI / 3;
    for (let i = 0; i < passos; i++) {
      const a1 = st.ang - rastro * (i / passos), a0 = st.ang - rastro * ((i + 1) / passos);
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a1); ctx.closePath();
      ctx.fillStyle = `rgba(207,149,64,${(.34 * Math.pow(1 - i / passos, 1.6)).toFixed(3)})`;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(247,217,166,.85)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(st.ang) * R, c + Math.sin(st.ang) * R); ctx.stroke();
    for (const b of st.blips) {
      const x = c + Math.cos(b.ang) * R * b.rad, y = c + Math.sin(b.ang) * R * b.rad;
      const dt = ANIM ? (now - (b.passou || -1e9)) / 1000 : 0;
      const luz = ANIM ? Math.max(.32, Math.exp(-dt / 1.4)) : 1;
      const [r, g, bb] = COR_SEV[b.sev] || COR_SEV.alerta;
      const real = st.realce === b.chave;
      const rr = (real ? 7.5 : 5) + luz * 1.5;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
      grd.addColorStop(0, `rgba(${r},${g},${bb},${(.55 * luz).toFixed(3)})`); grd.addColorStop(1, `rgba(${r},${g},${bb},0)`);
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, rr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${bb},${(.35 + .65 * luz).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      if (b.sev === "critico" && ANIM) {
        const f = ((now / 1000) % 1.5) / 1.5;
        ctx.strokeStyle = `rgba(${r},${g},${bb},${(.6 * (1 - f)).toFixed(3)})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, rr + f * 14, 0, Math.PI * 2); ctx.stroke();
      }
      if (real) { ctx.strokeStyle = "rgba(245,233,214,.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr + 4, 0, Math.PI * 2); ctx.stroke(); }
      b.x = x; b.y = y;
    }
  };
  const laco = now => {
    st.raf = 0;
    if (!ANIM || !st.visivel || document.hidden) return;
    const dt = st.ult ? Math.min(.05, (now - st.ult) / 1000) : 0;
    st.ult = now;
    // "Varrer agora": 1 → 6 → 1 com inércia, em 1,4 s
    let mult = 1;
    if (st.surto) { const p = (now - st.surto) / 1400; if (p >= 1) st.surto = 0; else mult = 1 + 5 * Math.sin(Math.PI * p); }
    const antes = st.ang;
    st.ang += BASE * mult * dt;
    const dois = Math.PI * 2;
    for (const b of st.blips) {
      const rel = ((b.ang - antes) % dois + dois) % dois;
      if (rel <= st.ang - antes) b.passou = now;
    }
    if (st.ang > Math.PI * 4) st.ang -= dois;
    desenhar(now);
    st.raf = requestAnimationFrame(laco);
  };
  const tocarR = () => { if (!st.raf && ANIM && st.visivel && !document.hidden) { st.ult = 0; st.raf = requestAnimationFrame(laco); } };
  const io = "IntersectionObserver" in window ? new IntersectionObserver(en => {
    st.visivel = en[en.length - 1].isIntersecting;
    if (st.visivel) tocarR(); else if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
  }) : null;
  if (io) io.observe(scope); else st.visivel = true;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tocarR(); });
  cv.addEventListener("pointermove", e => {
    if (!st.aoApontar) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let melhor = null, dm = 18;
    for (const b of st.blips) { const d = Math.hypot((b.x || 0) - x, (b.y || 0) - y); if (d < dm) { dm = d; melhor = b.chave; } }
    st.aoApontar(melhor);
  });
  cv.addEventListener("pointerleave", () => st.aoApontar && st.aoApontar(null));
  const api = {
    atualizar(blips) { st.blips = blips.map(b => ({ ...b })); desenhar(performance.now()); tocarR(); },
    varrer() { st.surto = performance.now(); tocarR(); },
    realcar(chave) { st.realce = chave; if (!st.raf) desenhar(performance.now()); },
    aoApontar(fn) { st.aoApontar = fn; },
    redesenhar() { desenhar(performance.now()); },
  };
  return api;
}

/* ============================================================
   6. VINHETA — o N×X se desenha (≤ 1,2 s, uma vez por sessão)
   ============================================================ */
/** Devolve uma promessa que resolve quando a vinheta começa a sair (ou null se não houver vinheta). */
export function vinheta() {
  if (!ANIM) return null;
  try { if (sessionStorage.getItem("nx-vinheta")) return null; sessionStorage.setItem("nx-vinheta", "1"); } catch { return null; }
  const boot = document.querySelector(".boot-mark");
  if (!boot) return null;
  let saiu;
  const p = new Promise(r => { saiu = r; });
  const v = document.createElement("div");
  v.className = "vinheta";
  v.setAttribute("aria-hidden", "true");
  v.appendChild(boot.cloneNode(true));
  document.body.appendChild(v);
  let foi = false;
  const sair = () => {
    if (foi) return; foi = true;
    v.classList.add("sai");
    setTimeout(() => v.remove(), 260);
    removeEventListener("keydown", sair, true);
    saiu();
  };
  v.addEventListener("click", sair);
  addEventListener("keydown", sair, true);
  setTimeout(sair, 880);
  return p;
}

/* ============================================================
   7. FAÍSCAS — o momento "Fechou" (LUZ, não confete)
   24 faíscas bronze sobem 60–120 px e somem em ≤ 1,4 s; depois o
   canvas sai do DOM. Nada disso com ?noanim / movimento reduzido.
   ============================================================ */
export function faiscas(r) {
  if (!ANIM || !r || document.hidden) return;
  const cv = document.createElement("canvas");
  cv.className = "faiscas";
  cv.setAttribute("aria-hidden", "true");
  const d = Math.min(devicePixelRatio || 1, MOVEL ? 1.5 : 2), W = innerWidth, H = innerHeight;
  cv.width = Math.round(W * d); cv.height = Math.round(H * d);
  document.body.appendChild(cv);
  const g = cv.getContext("2d");
  g.setTransform(d, 0, 0, d, 0, 0);
  const rnd = mulberry32((Date.now() & 0xffff) + 99);
  const ps = Array.from({ length: 24 }, () => ({
    x: r.left + rnd() * r.width, y: r.top + r.height * (.25 + rnd() * .6), sobe: 60 + rnd() * 60, dx: (rnd() - .5) * 36,
    t0: rnd() * 180, dur: 800 + rnd() * 400, s: 1.1 + rnd() * 2, c: rnd() < .72 ? "226,176,102" : "247,217,166",
  }));
  const ini = performance.now();
  const passo = now => {
    const t = now - ini;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    let vivas = 0;
    for (const p of ps) {
      const k = (t - p.t0) / p.dur;
      if (k >= 1) continue;
      vivas++;
      if (k < 0) continue;
      const e = 1 - Math.pow(1 - k, 3);   // sai rápido e assenta: nunca acelera no fim
      const x = p.x + p.dx * e, y = p.y - p.sobe * e, a = (1 - k) * Math.min(1, k / .12);
      const grd = g.createRadialGradient(x, y, 0, x, y, p.s * 4);
      grd.addColorStop(0, `rgba(${p.c},${a.toFixed(3)})`);
      grd.addColorStop(1, `rgba(${p.c},0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, p.s * 4, 0, Math.PI * 2); g.fill();
    }
    if (vivas && t < 1400 && !document.hidden) requestAnimationFrame(passo); else cv.remove();
  };
  requestAnimationFrame(passo);
}

/* ============================================================
   LIGAR
   ============================================================ */
export function ligar({ anim, semente: s = 1 } = {}) {
  ANIM = !!anim;
  FINO = matchMedia("(pointer: fine)").matches;
  MOVEL = innerWidth <= 700 || matchMedia("(pointer: coarse)").matches;
  montarPalco();
  P.luzes = gerarLuzes(s); P.semente = s; P.t = s * 3.7;
  medir(); quadro();
  if (ANIM) html.classList.add(MOVEL ? "palco-movel" : "palco-anim");
  // redesenha no resize (debounce 150 ms); com animação, o laço cuida
  let rz = 0, larg = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const eraMovel = MOVEL;
      MOVEL = innerWidth <= 700 || matchMedia("(pointer: coarse)").matches;
      if (eraMovel !== MOVEL && Math.abs(innerWidth - larg) > 40) {
        larg = innerWidth;
        P.luzes = gerarLuzes(P.semente);
        if (ANIM) { html.classList.toggle("palco-movel", MOVEL); html.classList.toggle("palco-anim", !MOVEL); }
      }
      medir(); quadro(); tocar();
    }, 150);
  });
  document.addEventListener("visibilitychange", () => {
    html.classList.toggle("oculta", document.hidden);
    if (document.hidden) parar(); else tocar();
  });
  tocar();
  if (ANIM && FINO && !MOVEL) ligarPonteiro();
}
