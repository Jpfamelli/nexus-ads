/* ============================================================
   NEXUS ADS — arrastar.js · fichas do kanban mudando de coluna
   Carregado por import() dinâmico; sem ele, a ficha muda de etapa
   pela gaveta (como sempre). CÂMERA: a ficha levantada anda com
   lerp .35, inclina pela velocidade (±7°) e encaixa com mola; a
   coluna de destino abre uma vaga (FLIP, só transform).
   · Mouse/caneta (pointer:fine): 6 px de movimento levanta a ficha.
   · Teclado (sempre): Espaço pega, ←/→ escolhem a coluna, Espaço
     solta, Esc cancela — tudo anunciado em aria-live.
   · Toque: continua pela gaveta (nada aqui).
   ============================================================ */

let api = null, raiz = null, bloqueiaClique = false;
const MOV = () => (api && api.FX && api.FX.MOV) || { tMove: 620, tUi: 220, mola: "ease-out", eOut: "ease-out" };
const colunasEl = () => [...raiz.querySelectorAll(".kcol")];
const colDe = el => (el && el.closest ? el.closest(".kcol") : null);
const focar = id => { const c = raiz.querySelector(`[data-lead="${CSS.escape(String(id))}"]`); if (c) c.focus(); return c; };

export function ligar(kanban, o) {
  api = o;
  if (raiz === kanban) return;
  raiz = kanban;
  kanban.addEventListener("keydown", tecla);
  // Espaço numa ficha é "pegar", não "clicar" (o clique de botão sai no keyup)
  kanban.addEventListener("keyup", e => { if ((e.key === " " || e.key === "Spacebar") && e.target.closest(".lead")) e.preventDefault(); });
  kanban.addEventListener("pointerdown", aperta);
  kanban.addEventListener("click", e => { if (bloqueiaClique) { e.preventDefault(); e.stopPropagation(); } }, true);
}

/* ============================================================
   TECLADO
   ============================================================ */
const K = { pego: null };
function tecla(e) {
  if (K.pego) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); alvoTeclado(e.key === "ArrowRight" ? 1 : -1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); soltarTeclado(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelarTeclado(true); }
    else if (e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown") cancelarTeclado(false);
    return;
  }
  const card = e.target.closest && e.target.closest(".lead");
  if (card && (e.key === " " || e.key === "Spacebar")) { e.preventDefault(); pegarTeclado(card); }
}
function pegarTeclado(card) {
  const L = api.lead(card.dataset.lead);
  if (!L) return;
  const origem = card.dataset.col;
  K.pego = { card, L, origem, id: card.dataset.lead, k: api.colunas.indexOf(origem) };
  card.classList.add("pego");
  raiz.classList.add("pegando");
  api.anunciar(`${api.nome(L)} pego, em ${api.nomeColuna(origem)}. Setas escolhem a coluna, Espaço solta, Esc cancela.`);
}
function alvoTeclado(d) {
  const p = K.pego, n = api.colunas.length;
  p.k = Math.max(0, Math.min(n - 1, p.k + d));
  const col = api.colunas[p.k];
  colunasEl().forEach((c, i) => c.classList.toggle("kcol-alvo", i === p.k && col !== p.origem));
  const c = colunasEl()[p.k];
  if (c) c.scrollIntoView({ block: "nearest", inline: "nearest", behavior: api.anim ? "smooth" : "auto" });
  api.anunciar(col === p.origem ? `${api.nomeColuna(col)}: onde já está.` : `Soltar em ${api.nomeColuna(col)}?`);
}
function limparTeclado() {
  if (!K.pego) return null;
  const p = K.pego;
  K.pego = null;
  p.card.classList.remove("pego");
  raiz.classList.remove("pegando");
  colunasEl().forEach(c => c.classList.remove("kcol-alvo"));
  return p;
}
function cancelarTeclado(anunciar) {
  const p = limparTeclado();
  if (p && anunciar) { api.anunciar(`Cancelado: ${api.nome(p.L)} ficou em ${api.nomeColuna(p.origem)}.`); p.card.focus(); }
}
async function soltarTeclado() {
  const p = limparTeclado(), col = api.colunas[p.k];
  if (col === p.origem) { api.anunciar(`${api.nome(p.L)} ficou em ${api.nomeColuna(col)}.`); p.card.focus(); return; }
  const r = p.card.getBoundingClientRect();
  const ok = await api.soltar(p.L, col, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  if (ok) { api.anunciar(`${api.nome(p.L)} foi para ${api.nomeColuna(col)}.`); focar(p.id); }
  else if (document.contains(p.card) && document.activeElement === document.body) p.card.focus();
}

/* ============================================================
   MOUSE / CANETA — levantar, voar, abrir vaga, encaixar
   ============================================================ */
const A = { on: false };
function aperta(e) {
  if (!api.fino || e.button !== 0 || e.pointerType === "touch" || K.pego) return;
  const card = e.target.closest(".lead");
  if (!card) return;
  const x0 = e.clientX, y0 = e.clientY;
  const mover = ev => {
    if (!A.on) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; levantar(card, x0, y0); }
    if (A.on) arrastar(ev);
  };
  const fim = ev => {
    removeEventListener("pointermove", mover); removeEventListener("pointerup", fim); removeEventListener("pointercancel", cancela);
    if (A.on) { bloqueiaClique = true; setTimeout(() => { bloqueiaClique = false; }, 0); soltar(ev); }
  };
  const cancela = () => {
    removeEventListener("pointermove", mover); removeEventListener("pointerup", fim); removeEventListener("pointercancel", cancela);
    if (A.on) voltarParaOrigem().then(limpar);
  };
  addEventListener("pointermove", mover);
  addEventListener("pointerup", fim);
  addEventListener("pointercancel", cancela);
}

function levantar(card, x0, y0) {
  const L = api.lead(card.dataset.lead);
  if (!L) return;
  const r = card.getBoundingClientRect();
  Object.assign(A, { on: true, card, L, id: card.dataset.lead, origem: card.dataset.col, col: null, vaga: null,
    dx: x0 - r.left, dy: y0 - r.top, w: r.width, h: r.height, x: r.left, y: r.top, tx: r.left, ty: r.top, rot: 0, px: x0, py: y0 });
  const f = card.cloneNode(true);
  f.classList.add("lead-voo");
  f.classList.remove("pego", "destaque", "brilha");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.width = r.width + "px";
  f.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
  document.body.appendChild(f);
  A.fant = f;
  card.classList.add("lead-origem");
  raiz.classList.add("arrastando");
  document.documentElement.classList.add("arrastando-ficha");
  api.anunciar(`Arrastando ${api.nome(L)}.`);
  A.raf = requestAnimationFrame(passo);
}

function arrastar(ev) {
  A.tx = ev.clientX - A.dx; A.ty = ev.clientY - A.dy; A.px = ev.clientX; A.py = ev.clientY;
  const sob = document.elementFromPoint(ev.clientX, ev.clientY);
  mirar(colDe(sob));
  if (!api.anim) desenhar(1);
}

/** Um quadro: posição com lerp .35, inclinação pela velocidade (limitada a ±7°) e rolagem perto das bordas. */
function passo() {
  if (!A.on || !A.fant) return;
  desenhar(api.anim ? .35 : 1);
  // rolagem automática: janela (topo/fundo) e o próprio kanban (esquerda/direita, quando rola)
  const m = 64, vy = A.py < m ? -(m - A.py) / 4 : A.py > innerHeight - m ? (A.py - innerHeight + m) / 4 : 0;
  if (vy) scrollBy(0, vy);
  const kr = raiz.getBoundingClientRect();
  if (raiz.scrollWidth > raiz.clientWidth) {
    const vx = A.px < kr.left + m ? -(kr.left + m - A.px) / 3 : A.px > kr.right - m ? (A.px - kr.right + m) / 3 : 0;
    if (vx) raiz.scrollLeft += vx;
  }
  A.raf = requestAnimationFrame(passo);
}
function desenhar(k) {
  const antes = A.x;
  A.x += (A.tx - A.x) * k; A.y += (A.ty - A.y) * k;
  const alvoRot = api.anim ? Math.max(-7, Math.min(7, (A.x - antes) * .55)) : 0;
  A.rot += (alvoRot - A.rot) * (api.anim ? .2 : 1);
  A.fant.style.transform = `translate3d(${A.x.toFixed(1)}px, ${A.y.toFixed(1)}px, 0) rotate(${A.rot.toFixed(2)}deg) scale(${api.anim ? 1.03 : 1})`;
}

/** A coluna de destino ganha luz quente e abre uma vaga com mola (as fichas de baixo descem por FLIP). */
function mirar(col) {
  const valida = col && col.dataset.col && col.dataset.col !== A.origem ? col : null;
  if (valida === A.col) return;
  if (A.col) { A.col.classList.remove("kcol-alvo"); fecharVaga(); }
  A.col = valida;
  if (!valida) return;
  valida.classList.add("kcol-alvo");
  const irmas = [...valida.querySelectorAll(".lead, .kmore")];
  const antes = new Map(irmas.map(c => [c, c.getBoundingClientRect().top]));
  const v = document.createElement("div");
  v.className = "lead-vaga";
  v.style.height = A.h + "px";
  v.setAttribute("aria-hidden", "true");
  valida.querySelector(".kcol-h").after(v);
  A.vaga = v;
  if (api.anim) irmas.forEach(c => {
    const d = antes.get(c) - c.getBoundingClientRect().top;
    if (Math.abs(d) > .5) c.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: MOV().tMove, easing: MOV().mola });
  });
}
function fecharVaga() {
  const v = A.vaga;
  if (!v) return;
  const col = colDe(v), irmas = col ? [...col.querySelectorAll(".lead, .kmore")] : [];
  const antes = new Map(irmas.map(c => [c, c.getBoundingClientRect().top]));
  v.remove();
  A.vaga = null;
  if (api.anim) irmas.forEach(c => {
    const d = antes.get(c) - c.getBoundingClientRect().top;
    if (Math.abs(d) > .5) c.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: MOV().tUi, easing: MOV().eOut });
  });
}

/** A ficha voa até um ponto e assenta (mola). */
function voar(x, y) {
  cancelAnimationFrame(A.raf);
  const f = A.fant;
  if (!f) return Promise.resolve();
  const de = f.style.transform, para = `translate3d(${x}px, ${y}px, 0) rotate(0deg) scale(1)`;
  if (!api.anim || !f.animate) { f.style.transform = para; return Promise.resolve(); }
  const a = f.animate([{ transform: de }, { transform: para }], { duration: MOV().tMove, easing: MOV().mola, fill: "forwards" });
  return a.finished.catch(() => {});
}
function voltarParaOrigem() {
  const r = A.card && document.contains(A.card) ? A.card.getBoundingClientRect() : null;
  if (A.col) { A.col.classList.remove("kcol-alvo"); fecharVaga(); A.col = null; }
  return r ? voar(r.left, r.top) : Promise.resolve();
}
function limpar() {
  cancelAnimationFrame(A.raf);
  if (A.fant) A.fant.remove();
  if (A.vaga) A.vaga.remove();
  if (A.col) A.col.classList.remove("kcol-alvo");
  if (A.card) A.card.classList.remove("lead-origem");
  if (raiz) raiz.classList.remove("arrastando");
  document.documentElement.classList.remove("arrastando-ficha");
  Object.assign(A, { on: false, fant: null, vaga: null, col: null, card: null, L: null });
}

async function soltar(ev) {
  const destino = A.col ? A.col.dataset.col : null, L = A.L, card = A.card, id = A.id;
  if (!destino) { await voltarParaOrigem(); limpar(); return; }
  // agendar/fechar/"não seguiu" pedem dado novo (gaveta ou mini-menu): a ficha volta e a pergunta abre
  const pede = destino === "agendada" || destino === "fechou" || destino === "parou";
  if (pede) {
    await voltarParaOrigem();
    limpar();
    await api.soltar(L, destino, { x: ev.clientX, y: ev.clientY });
    return;
  }
  const r = A.vaga ? A.vaga.getBoundingClientRect() : null;
  if (r) await voar(r.left, r.top);
  const ok = await api.soltar(L, destino, { x: ev.clientX, y: ev.clientY });
  if (ok) {
    // o kanban já foi redesenhado com a ficha na coluna nova: ela assenta onde a vaga estava (FLIP)
    const nova = raiz.querySelector(`[data-lead="${CSS.escape(String(id))}"]`);
    if (nova && A.fant && api.anim) {
      const a = A.fant.getBoundingClientRect(), b = nova.getBoundingClientRect();
      if (b.width) nova.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], { duration: MOV().tUi, easing: MOV().eOut });
    }
    limpar();
    return;
  }
  // deu errado: a ficha volta com um tremido (o toast já explicou)
  await voltarParaOrigem();
  limpar();
  if (card && document.contains(card)) { card.classList.remove("treme"); void card.offsetWidth; card.classList.add("treme"); setTimeout(() => card.classList.remove("treme"), 700); }
}
