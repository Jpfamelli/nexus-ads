/* ============================================================
   ÓRBITA — ui.js · frente F3 · ESPEC §7.3
   Componentes do app (DOM puro). Os módulos recebem isto em ctx.ui.
   Regras: texto de usuário SEMPRE por textContent (h() faz isso);
   nada de innerHTML; nada de on*= inline; nenhuma cor escrita aqui
   (cor vem dos tokens do app.css ou de --cor validada).

   Classes de apoio que os módulos podem usar no próprio HTML
   (estilo em app.css): botões .bt + .bt-prim | .bt-sec | .bt-fant |
   .bt-perigo, tamanhos .bt-p | .bt-g, .bt-icone (redondo, só ícone);
   .cartao (cartão opaco), .cartao-cab, .rotulo (Plex 11 px caixa alta),
   .titulo-pag (Clash), .sub, .grade-2/.grade-3 (minmax), .pilha (coluna
   com gap), .linha (flex com gap), .fita (barra de ferramentas), .sel
   (select pílula), .busca (campo de busca com ícone), .mono (Plex),
   .sr-only, .num-grande (Clash, número), .aviso(.aviso-ruim|-aten|-ok).
   ============================================================ */

const VERSAO = (() => { try { return new URL(import.meta.url).searchParams.get("v") || "dev"; } catch { return "dev"; } })();
const FUSO = "America/Sao_Paulo";
const SVG_NS = "http://www.w3.org/2000/svg";
const TAGS_SVG = new Set(["svg", "use", "path", "g", "circle", "rect", "line", "polyline", "polygon", "text", "tspan",
  "defs", "linearGradient", "radialGradient", "stop", "title", "clipPath", "mask", "ellipse", "pattern"]);
const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden", "multiple", "readOnly", "required",
  "indeterminate", "open", "defaultValue", "defaultChecked"]);
const RE_HEX = /^#[0-9a-fA-F]{6}$/;
const RE_URL_OK = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/|[a-z0-9-]+\.html)/i;

let _mensagemErro = e => (e && (e.codigo || e.message)) ? String(e.codigo || e.message) : "Não deu certo agora. Tente de novo.";
let _seq = 0;
const novoId = p => `${p || "u"}-${++_seq}`;

/** O shell liga o tradutor de erros (api.mensagemErro). */
export function configurar({ mensagemErro } = {}) { if (typeof mensagemErro === "function") _mensagemErro = mensagemErro; }
export function mensagemErro(e) { return _mensagemErro(e); }
export const versao = VERSAO;

/* ============================================================
   DOM
   ============================================================ */
function anexar(el, filhos) {
  for (const f of filhos) {
    if (f === null || f === undefined || f === false || f === true) continue;
    if (Array.isArray(f)) anexar(el, f);
    else if (typeof f === "object" && f.nodeType) el.appendChild(f);
    else el.appendChild(document.createTextNode(String(f)));
  }
}

/** h(tag, attrs, ...filhos). attrs: class (texto ou lista), dataset, style (texto ou {prop: valor}),
    on:{evento: fn}, aria-*, qualquer atributo; filhos texto viram textNode. */
export function h(tag, attrs, ...filhos) {
  const svg = TAGS_SVG.has(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) {
    filhos.unshift(attrs); attrs = null;
  }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class" || k === "className") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v));
    else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv); }
    else if (k === "on") { for (const [ev, fn] of Object.entries(v)) if (typeof fn === "function") el.addEventListener(ev, fn); }
    else if (/^on[A-Z]?[a-z]+$/.test(k) && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (/^on/i.test(k)) continue;                     // CSP: nunca handler em atributo
    else if (k === "style") {
      if (typeof v === "string") el.setAttribute("style", v);
      else for (const [p, val] of Object.entries(v)) if (val !== null && val !== undefined) el.style.setProperty(p, String(val));
    }
    else if (k === "text") el.textContent = String(v);
    else if ((k === "href" || k === "src" || k === "action" || k === "formaction") && !RE_URL_OK.test(String(v)) && !String(v).startsWith("data:image/") && !String(v).startsWith("blob:")) continue;
    else if (!svg && PROPS.has(k)) el[k] = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  anexar(el, filhos);
  return el;
}

export function limpar(el) { if (el) while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Ícone do sprite do index.html: <svg><use href="#i-nome"></svg>. */
export function icone(nome, cls) {
  const s = document.createElementNS(SVG_NS, "svg");
  s.setAttribute("class", cls ? `ic ${cls}` : "ic");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  const u = document.createElementNS(SVG_NS, "use");
  u.setAttribute("href", `#i-${nome}`);
  s.appendChild(u);
  return s;
}

const _css = new Map();
/** <link> único por arquivo de CSS do app, com ?v=. Promise resolve quando carregou (ou falhou). */
export function carregarCss(nome) {
  const arq = String(nome).replace(/\.css$/, "") + ".css";
  if (!/^[a-z0-9-]+\.css$/.test(arq)) return Promise.resolve(false);
  if (_css.has(arq)) return _css.get(arq);
  const p = new Promise(ok => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = new URL(`./${arq}?v=${encodeURIComponent(VERSAO)}`, import.meta.url).href;
    l.dataset.css = arq;
    l.addEventListener("load", () => ok(true));
    l.addEventListener("error", () => ok(false));
    document.head.appendChild(l);
  });
  _css.set(arq, p);
  return p;
}

/** Cor vinda do banco (etapa, etiqueta…) só entra se for #RRGGBB. */
export function corOk(c) { return typeof c === "string" && RE_HEX.test(c) ? c : null; }

/* ============================================================
   Camada de cima (popover) — fica acima de <dialog> aberto
   ============================================================ */
function mostrarNoTopo(el) {
  if (!el.isConnected) document.body.appendChild(el);
  if (typeof el.showPopover === "function") {
    try { if (el.matches(":popover-open")) el.hidePopover(); el.showPopover(); } catch { /* sem popover */ }
  }
}

/* ============================================================
   Avisos
   ============================================================ */
let _toasts = null;
function caixaToasts() {
  if (_toasts && _toasts.isConnected) return _toasts;
  _toasts = document.getElementById("toasts") || h("div", { id: "toasts" });
  _toasts.classList.add("toasts");
  _toasts.setAttribute("popover", "manual");
  _toasts.setAttribute("aria-live", "polite");
  _toasts.setAttribute("aria-relevant", "additions");
  if (!_toasts.isConnected) document.body.appendChild(_toasts);
  return _toasts;
}

/** toast(texto, {tipo:'ok'|'erro'|'info', desfazer:fn, ms:5000}) → {fechar} */
export function toast(texto, { tipo = "info", desfazer = null, ms } = {}) {
  const caixa = caixaToasts();
  const dur = ms ?? (tipo === "erro" ? 7000 : desfazer ? 7000 : 4500);
  let timer = null;
  const fechar = () => {
    clearTimeout(timer);
    el.classList.add("saindo");
    setTimeout(() => { el.remove(); if (!caixa.children.length && caixa.hidePopover) try { caixa.hidePopover(); } catch { /* ok */ } }, 180);
  };
  const el = h("div", { class: ["toast", `toast-${tipo}`], role: tipo === "erro" ? "alert" : "status" },
    icone(tipo === "ok" ? "check" : tipo === "erro" ? "alerta" : "info"),
    h("p", null, String(texto)),
    desfazer ? h("button", { type: "button", class: "toast-acao", on: { click: () => { fechar(); desfazer(); } } }, "Desfazer") : null,
    h("button", { type: "button", class: "toast-x", "aria-label": "Fechar aviso", on: { click: fechar } }, icone("fechar")));
  caixa.appendChild(el);
  while (caixa.children.length > 4) caixa.firstElementChild.remove();
  mostrarNoTopo(caixa);
  if (dur > 0) {
    timer = setTimeout(fechar, dur);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", () => { timer = setTimeout(fechar, 2500); });
  }
  return { fechar };
}

/** Anúncio só para leitor de tela (aria-live). */
export function anunciar(texto) {
  let r = document.getElementById("anuncio");
  if (!r) { r = h("div", { id: "anuncio", class: "sr-only", "aria-live": "polite" }); document.body.appendChild(r); }
  r.textContent = "";
  setTimeout(() => { r.textContent = String(texto); }, 30);
}

/* ============================================================
   Diálogos
   ============================================================ */
/* ------------------------------------------------------------
   Camadas (modal) × botão Voltar do navegador.
   Abrir um modal empurra UMA entrada no histórico (mesma URL); o Voltar desfaz essa entrada e FECHA o
   modal, sem trocar a rota por baixo. Fechar por botão, Esc ou salvar desfaz a entrada sozinho.
   O history.back() é assíncrono: quem navega logo depois de fechar um modal espera por aposVolta().
   Sem history/window (testes em Node) tudo vira no-op.
   ------------------------------------------------------------ */
export function criarCamadas(amb = {}) {
  const hist = amb.history !== undefined ? amb.history : (typeof history !== "undefined" ? history : null);
  const ouvir = amb.addEventListener || (typeof addEventListener === "function" ? addEventListener : null);
  const agendar = amb.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
  const cancelar = amb.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);
  const pilha = [];
  let voltando = 0, prazo = null, esperando = [];
  const marcaDe = st => (st && typeof st === "object" && typeof st.nxCamada === "string" ? st.nxCamada : null);

  function despertar() {
    voltando = 0;
    if (prazo != null && cancelar) cancelar(prazo);
    prazo = null;
    const fila = esperando; esperando = [];
    for (const f of fila) try { f(); } catch (e) { console.error(e); }
  }
  function desfazerEntrada() {
    voltando++;
    if (prazo == null && agendar) prazo = agendar(despertar, 600);   // se o popstate nunca vier, ninguém fica esperando
    try { hist.back(); } catch { despertar(); }
  }
  const aposVolta = f => { if (voltando > 0) esperando.push(f); else f(); };

  function empurrar(c) {
    if (c.fechada || !hist) return;
    try {
      const st = hist.state && typeof hist.state === "object" ? hist.state : {};
      hist.pushState({ ...st, nxCamada: c.marca }, "");
      c.empurrou = true;
    } catch { /* sem histórico: o Voltar segue o comportamento antigo */ }
  }
  function liberar(c) {
    if (c.fechada) return;
    c.fechada = true;
    const i = pilha.indexOf(c); if (i >= 0) pilha.splice(i, 1);
    if (c.porVoltar) return;   // o próprio Voltar já desfez a entrada
    aposVolta(() => { if (c.empurrou && hist && marcaDe(hist.state) === c.marca) desfazerEntrada(); });
  }
  /** Registra uma camada aberta; fechar() é chamado quando o usuário aperta Voltar. Devolve {liberar}. */
  function abrir(fechar) {
    const c = { marca: novoId("camada"), fechar, empurrou: false, fechada: false, porVoltar: false };
    pilha.push(c);
    aposVolta(() => empurrar(c));
    return { liberar: () => liberar(c) };
  }
  /** Uma navegação com camada aberta REAPROVEITA a entrada dela (replaceState): o Voltar não precisa de dois toques. */
  function consumirEntrada() {
    if (!hist) return false;
    const m = marcaDe(hist.state);
    const c = m && pilha.find(x => x.marca === m && x.empurrou);
    if (!c) return false;
    c.empurrou = false;
    return true;
  }
  function aoPop(ev) {
    if (voltando > 0) { voltando--; if (voltando === 0) despertar(); return; }   // foi o nosso history.back()
    const atual = marcaDe(ev && ev.state !== undefined ? ev.state : hist && hist.state);
    while (pilha.length && pilha[pilha.length - 1].marca !== atual) {
      const c = pilha.pop(); c.porVoltar = true;
      try { c.fechar(); } catch (e) { console.error(e); }
    }
  }
  if (ouvir) ouvir("popstate", aoPop);
  return { abrir, aposVolta, consumirEntrada, voltaPendente: () => voltando > 0, abertas: () => pilha.length, _aoPop: aoPop };
}
export const camadas = criarCamadas();

function focarPrimeiro(raiz) {
  const alvo = raiz.querySelector("[autofocus], input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)")
    || raiz.querySelector("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])");
  if (alvo) try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
}

/** modal({titulo, corpo, acoes:[{rotulo, tipo, fn, valor}], largura:'p'|'m'|'g', aoAbrir}) → Promise<valor>.
    fn(api) pode ser async; devolver false mantém aberto; erro lançado aparece dentro do modal. Esc/fechar → null. */
export function modal({ titulo, corpo, acoes, largura = "m", aoAbrir, fecharFora = true, descricao } = {}) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    const idT = novoId("modal-t");
    const erro = h("p", { class: "modal-erro", role: "alert", hidden: true });
    const corpoEl = h("div", { class: "modal-corpo" }, descricao ? h("p", { class: "sub" }, descricao) : null, corpo, erro);
    const lista = acoes && acoes.length ? acoes : [{ rotulo: "Fechar", tipo: "neutro", valor: null }];
    let feito = false, camada = null;
    const dlg = h("dialog", { class: ["modal", `modal-${largura}`], "aria-labelledby": idT });
    const api = {
      el: dlg, corpo: corpoEl,
      fechar(v = null) {
        if (feito) return; feito = true;
        if (camada) camada.liberar();
        dlg.classList.add("saindo");
        setTimeout(() => { try { dlg.close(); } catch { /* ok */ } dlg.remove(); if (anterior && anterior.focus && anterior.isConnected) try { anterior.focus({ preventScroll: true }); } catch { /* ok */ } }, 160);
        resolve(v);
      },
      erro(texto) { erro.textContent = texto || ""; erro.hidden = !texto; },
    };
    const botoes = lista.map(a => {
      const b = h("button", { type: "button", class: ["bt", a.tipo === "primario" ? "bt-prim" : a.tipo === "perigo" ? "bt-perigo" : "bt-sec"],
        dataset: { tipo: a.tipo || "neutro" }, disabled: !!a.desabilitado }, a.rotulo);
      b.addEventListener("click", async () => {
        api.erro("");
        if (!a.fn) { api.fechar(a.valor !== undefined ? a.valor : a.tipo === "neutro" ? null : true); return; }
        b.setAttribute("aria-busy", "true"); botoes.forEach(x => { x.disabled = true; });
        try {
          const r = await a.fn(api);
          if (r !== false) api.fechar(r === undefined ? true : r);
        } catch (e) {
          api.erro(mensagemErro(e));
        } finally {
          b.removeAttribute("aria-busy"); botoes.forEach(x => { x.disabled = false; });
        }
      });
      return b;
    });
    const primario = botoes.find(b => b.dataset.tipo === "primario" || b.dataset.tipo === "perigo");
    dlg.append(
      h("header", { class: "modal-cab" },
        h("h2", { id: idT }, titulo || ""),
        h("button", { type: "button", class: "bt-icone modal-x", "aria-label": "Fechar", on: { click: () => api.fechar(null) } }, icone("fechar"))),
      corpoEl,
      h("footer", { class: "modal-rod" }, botoes));
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); api.fechar(null); });
    dlg.addEventListener("mousedown", ev => { if (fecharFora && ev.target === dlg) dlg.dataset.fora = "1"; });
    dlg.addEventListener("click", ev => { if (fecharFora && ev.target === dlg && dlg.dataset.fora === "1") api.fechar(null); delete dlg.dataset.fora; });
    dlg.addEventListener("submit", ev => { ev.preventDefault(); if (primario && !primario.disabled) primario.click(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    camada = camadas.abrir(() => api.fechar(null));   // botão Voltar do navegador fecha o modal
    focarPrimeiro(corpoEl.querySelector("input,select,textarea") ? corpoEl : dlg.querySelector(".modal-rod"));
    if (aoAbrir) try { aoAbrir(api); } catch (e) { console.error(e); }
  });
}

/** confirmar({titulo, texto, perigo, digitar:'excluir'|null, rotulo}) → Promise<boolean> */
export async function confirmar({ titulo = "Confirmar", texto = "", perigo = false, digitar = null, rotulo } = {}) {
  let campoDig = null;
  const corpo = h("div", { class: "pilha" },
    texto ? h("p", { class: "confirma-txt" }, texto) : null,
    digitar ? (campoDig = campo({ rotulo: `Digite «${digitar}» para confirmar`, nome: "digitar", autocomplete: "off" })) : null);
  const r = await modal({
    titulo, corpo, largura: "p",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: rotulo || (perigo ? "Excluir" : "Confirmar"), tipo: perigo ? "perigo" : "primario",
        fn: api => {
          if (!digitar) return true;
          const v = campoDig.querySelector("input").value.trim().toLowerCase();
          if (v !== String(digitar).toLowerCase()) { api.erro(`Digite «${digitar}» para confirmar.`); return false; }
          return true;
        } },
    ],
  });
  return r === true;
}

/** gaveta({titulo, corpo, largura:'m'|'g', aoFechar, acoes:Node}) → {el, corpo, fechar, trocarTitulo} */
export function gaveta({ titulo = "", corpo, largura = "m", aoFechar, acoes } = {}) {
  const anterior = document.activeElement;
  const idT = novoId("gav-t");
  const tit = h("h2", { id: idT }, titulo);
  const corpoEl = h("div", { class: "gaveta-corpo" }, corpo);
  const dlg = h("dialog", { class: ["gaveta", `gaveta-${largura}`], "aria-labelledby": idT });
  let fechada = false;
  const g = {
    el: dlg, corpo: corpoEl,
    fechar() {
      if (fechada) return; fechada = true;
      dlg.classList.add("saindo");
      setTimeout(() => {
        try { dlg.close(); } catch { /* ok */ }
        dlg.remove();
        if (anterior && anterior.focus && anterior.isConnected) try { anterior.focus({ preventScroll: true }); } catch { /* ok */ }
        if (aoFechar) try { aoFechar(); } catch (e) { console.error(e); }
      }, 220);
    },
    trocarTitulo(t) { tit.textContent = t || ""; },
  };
  dlg.append(
    h("header", { class: "gaveta-cab" },
      h("button", { type: "button", class: "bt-icone gaveta-voltar", "aria-label": "Fechar", on: { click: () => g.fechar() } }, icone("seta-esq")),
      tit, acoes || null,
      h("button", { type: "button", class: "bt-icone gaveta-x", "aria-label": "Fechar", on: { click: () => g.fechar() } }, icone("fechar"))),
    corpoEl);
  dlg.addEventListener("cancel", ev => { ev.preventDefault(); g.fechar(); });
  dlg.addEventListener("mousedown", ev => { if (ev.target === dlg) dlg.dataset.fora = "1"; });
  dlg.addEventListener("click", ev => { if (ev.target === dlg && dlg.dataset.fora === "1") g.fechar(); delete dlg.dataset.fora; });
  document.body.appendChild(dlg);
  dlg.showModal();
  setTimeout(() => focarPrimeiro(corpoEl), 30);
  return g;
}

/* ============================================================
   Menu suspenso (popover, teclado ↑↓ Home End Esc)
   ============================================================ */
let _menuAberto = null;
/** menu(ancora, [{rotulo, icone, fn, perigo, desabilitado} | '-']) → {fechar} */
export function menu(ancora, itens) {
  if (_menuAberto) _menuAberto.fechar();
  const botoes = [];
  const pop = h("div", { class: "menu-pop", role: "menu", popover: "manual" });
  for (const it of itens.filter(Boolean)) {
    if (it === "-") { pop.appendChild(h("hr", { class: "menu-sep" })); continue; }
    const b = h("button", { type: "button", role: "menuitem", class: ["menu-item", it.perigo && "perigo"], disabled: !!it.desabilitado, tabindex: "-1" },
      it.icone ? icone(it.icone) : null, h("span", null, it.rotulo));
    b.addEventListener("click", () => { fechar(); if (it.fn) it.fn(); });
    botoes.push(b); pop.appendChild(b);
  }
  function posicionar() {
    const r = ancora.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const w = pop.offsetWidth, hh = pop.offsetHeight;
    let x = r.right - w; if (x < 8) x = Math.min(r.left, vw - w - 8); x = Math.max(8, Math.min(x, vw - w - 8));
    let y = r.bottom + 6; if (y + hh > vh - 8) y = Math.max(8, r.top - hh - 6);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  }
  const ativos = () => botoes.filter(b => !b.disabled);
  function aoTecla(ev) {
    const lista = ativos(); const i = lista.indexOf(document.activeElement);
    if (ev.key === "ArrowDown") { ev.preventDefault(); (lista[(i + 1) % lista.length] || lista[0])?.focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); (lista[(i - 1 + lista.length) % lista.length] || lista[0])?.focus(); }
    else if (ev.key === "Home") { ev.preventDefault(); lista[0]?.focus(); }
    else if (ev.key === "End") { ev.preventDefault(); lista[lista.length - 1]?.focus(); }
    else if (ev.key === "Escape") { ev.preventDefault(); fechar(); ancora.focus(); }
    else if (ev.key === "Tab") fechar();
  }
  function fora(ev) { if (!pop.contains(ev.target) && ev.target !== ancora && !ancora.contains(ev.target)) fechar(); }
  function fechar() {
    if (!pop.isConnected) return;
    document.removeEventListener("pointerdown", fora, true);
    removeEventListener("resize", fechar); removeEventListener("scroll", aoRolar, true);
    ancora.setAttribute("aria-expanded", "false");
    try { pop.hidePopover(); } catch { /* ok */ }
    pop.remove();
    if (_menuAberto && _menuAberto.pop === pop) _menuAberto = null;
  }
  function aoRolar(ev) { if (!pop.contains(ev.target)) fechar(); }
  pop.addEventListener("keydown", aoTecla);
  mostrarNoTopo(pop);
  posicionar();
  ancora.setAttribute("aria-haspopup", "menu");
  ancora.setAttribute("aria-expanded", "true");
  setTimeout(() => {
    document.addEventListener("pointerdown", fora, true);
    addEventListener("resize", fechar); addEventListener("scroll", aoRolar, true);
    ativos()[0]?.focus();
  }, 0);
  _menuAberto = { pop, fechar };
  return { fechar };
}

/** Painel flutuante genérico ancorado (popover): conteúdo livre. → {el, fechar} */
export function flutuante(ancora, conteudo, { classe = "", aoFechar, largura } = {}) {
  if (_menuAberto) _menuAberto.fechar();
  const pop = h("div", { class: ["flut", classe], popover: "manual", role: "dialog" }, conteudo);
  if (largura) pop.style.width = typeof largura === "number" ? `${largura}px` : largura;
  function posicionar() {
    const r = ancora.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const w = pop.offsetWidth, hh = pop.offsetHeight;
    let x = Math.max(8, Math.min(r.left, vw - w - 8));
    let y = r.bottom + 6; if (y + hh > vh - 8) y = Math.max(8, r.top - hh - 6);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  }
  function fora(ev) { if (!pop.contains(ev.target) && !ancora.contains(ev.target)) fechar(); }
  function tecla(ev) { if (ev.key === "Escape") { ev.preventDefault(); fechar(); ancora.focus(); } }
  function fechar() {
    if (!pop.isConnected) return;
    document.removeEventListener("pointerdown", fora, true);
    pop.removeEventListener("keydown", tecla);
    removeEventListener("resize", fechar);
    ancora.setAttribute("aria-expanded", "false");
    try { pop.hidePopover(); } catch { /* ok */ }
    pop.remove();
    if (_menuAberto && _menuAberto.pop === pop) _menuAberto = null;
    if (aoFechar) try { aoFechar(); } catch (e) { console.error(e); }
  }
  pop.addEventListener("keydown", tecla);
  mostrarNoTopo(pop);
  posicionar();
  ancora.setAttribute("aria-expanded", "true");
  setTimeout(() => { document.addEventListener("pointerdown", fora, true); addEventListener("resize", fechar); focarPrimeiro(pop); }, 0);
  _menuAberto = { pop, fechar };
  return { el: pop, fechar, posicionar };
}

/* ============================================================
   Estados: vazio, esqueleto, erro
   ============================================================ */
/** vazio({titulo, texto, acao:{rotulo, fn}, icone}) → Node */
export function vazio({ titulo, texto, acao, icone: ic = "mais", acoes } = {}) {
  const botoes = [...(acao ? [acao] : []), ...(acoes || [])].map((a, i) =>
    h("button", { type: "button", class: ["bt", i === 0 ? "bt-prim" : "bt-sec"], on: { click: a.fn } }, a.icone ? icone(a.icone) : null, a.rotulo));
  return h("div", { class: "vazio" },
    h("div", { class: "vazio-ic", "aria-hidden": "true" }, icone(ic)),
    h("div", { class: "vazio-txt" },
      titulo ? h("h2", null, titulo) : null,
      texto ? h("p", null, texto) : null,
      botoes.length ? h("div", { class: "linha vazio-acoes" }, botoes) : null));
}

/** esqueleto('lista'|'cartoes'|'tabela'|'kanban', n) → Node com a geometria real */
export function esqueleto(tipo = "lista", n = 6) {
  const b = cls => h("span", { class: ["sk", cls] });
  let corpo;
  if (tipo === "cartoes") corpo = h("div", { class: "sk-cartoes" }, Array.from({ length: n }, () => h("div", { class: "sk-cartao" }, b("sk-l1"), b("sk-num"), b("sk-l2"))));
  else if (tipo === "tabela") corpo = h("div", { class: "sk-tabela" }, h("div", { class: "sk-tr sk-th" }, b(), b(), b(), b()),
    Array.from({ length: n }, () => h("div", { class: "sk-tr" }, b(), b(), b(), b())));
  else if (tipo === "kanban") corpo = h("div", { class: "sk-kanban" }, Array.from({ length: Math.max(3, Math.min(n, 6)) }, (_, i) =>
    h("div", { class: "sk-col" }, b("sk-l1"), Array.from({ length: 3 - (i % 2) }, () => h("div", { class: "sk-card" }, b("sk-l1"), b("sk-l2"))))));
  else corpo = h("div", { class: "sk-lista" }, Array.from({ length: n }, () => h("div", { class: "sk-item" }, h("span", { class: "sk sk-av" }), h("div", { class: "sk-txt" }, b("sk-l1"), b("sk-l2")))));
  return h("div", { class: ["esqueleto", `esqueleto-${tipo}`], "aria-busy": "true" }, h("span", { class: "sr-only", role: "status" }, "Carregando…"), corpo);
}

/** erroCartao(erro, tentarDeNovo) → Node (texto de api.mensagemErro) */
export function erroCartao(erro, tentarDeNovo) {
  return h("div", { class: "vazio vazio-erro", role: "alert" },
    h("div", { class: "vazio-ic", "aria-hidden": "true" }, icone("alerta")),
    h("div", { class: "vazio-txt" },
      h("h2", null, "Não foi possível carregar"),
      h("p", null, mensagemErro(erro)),
      tentarDeNovo ? h("div", { class: "linha vazio-acoes" },
        h("button", { type: "button", class: "bt bt-prim", on: { click: tentarDeNovo } }, "Tentar de novo")) : null));
}

/* ============================================================
   Formulários
   ============================================================ */
function opcoesDe(opcoes) {
  return (opcoes || []).map(o => typeof o === "object" && o !== null ? o : { valor: o, rotulo: String(o) });
}

/** campo({rotulo, nome, tipo, valor, opcoes, obrigatorio, ajuda, max, min, placeholder, ...}) → Node
    tipos: texto (padrão), email, senha, tel, numero, moeda, data, datahora, hora, textarea, select,
    interruptor (checkbox), multipla (caixas), cor (paleta + hex), url, busca. */
export function campo(o = {}) {
  const { rotulo, nome, tipo = "texto", valor, opcoes, obrigatorio, ajuda, max, min, placeholder, desabilitado, autocomplete,
    linhas = 3, passo, id: idDado, inputmode, paleta } = o;
  const id = idDado || novoId(`c-${nome || "x"}`);
  const idAj = ajuda ? `${id}-aj` : null, idEr = `${id}-er`;
  const desc = [idAj].filter(Boolean).join(" ") || null;
  const erro = h("small", { class: "campo-erro", id: idEr, hidden: true });
  const aj = ajuda ? h("small", { class: "campo-ajuda", id: idAj }, ajuda) : null;

  if (tipo === "interruptor" || tipo === "checkbox") {
    const inp = h("input", { type: "checkbox", id, name: nome, role: tipo === "interruptor" ? "switch" : null, checked: !!valor, disabled: !!desabilitado, "aria-describedby": desc });
    return h("div", { class: ["campo", "campo-check", tipo === "interruptor" && "campo-switch"], dataset: { campo: nome } },
      h("label", { for: id }, inp, h("span", { class: "check-marca", "aria-hidden": "true" }), h("span", { class: "check-txt" }, rotulo)), aj, erro);
  }
  if (tipo === "multipla") {
    const sel = new Set(Array.isArray(valor) ? valor.map(String) : []);
    const grupo = h("fieldset", { class: "campo campo-multi", dataset: { campo: nome, multi: nome } },
      h("legend", null, rotulo, obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null),
      h("div", { class: "multi-opcoes" }, opcoesDe(opcoes).map(op => {
        const i2 = novoId(`m-${nome}`);
        return h("label", { class: "chip-check", for: i2 },
          h("input", { type: "checkbox", id: i2, name: nome, value: String(op.valor), checked: sel.has(String(op.valor)), disabled: !!(desabilitado || op.desabilitado) }),
          h("span", null, op.rotulo));
      })), aj, erro);
    return grupo;
  }
  if (tipo === "cor") {
    const oculto = h("input", { type: "hidden", name: nome, value: corOk(valor) || "" });
    const sc = seletorCor({ valor, paleta, rotulo, aoMudar: c => { oculto.value = c || ""; oculto.dispatchEvent(new Event("change", { bubbles: true })); } });
    return h("div", { class: "campo campo-cor", dataset: { campo: nome } }, h("span", { class: "campo-rot" }, rotulo), sc, oculto, aj, erro);
  }

  let ctl;
  const comuns = { id, name: nome, required: !!obrigatorio, disabled: !!desabilitado, placeholder: placeholder || null,
    "aria-describedby": desc, autocomplete: autocomplete || null };
  if (tipo === "textarea") ctl = h("textarea", { ...comuns, rows: linhas, maxlength: max || null }, valor ?? "");
  else if (tipo === "select") {
    ctl = h("select", comuns, opcoesDe(opcoes).map(op => h("option", { value: String(op.valor ?? ""), selected: String(op.valor ?? "") === String(valor ?? ""), disabled: !!op.desabilitado }, op.rotulo)));
  } else {
    const mapa = { texto: "text", email: "email", senha: "password", tel: "tel", numero: "number", moeda: "text", data: "date",
      datahora: "datetime-local", hora: "time", url: "url", busca: "search" };
    const t = mapa[tipo] || "text";
    ctl = h("input", { ...comuns, type: t, value: valor ?? "", maxlength: t !== "number" && max ? max : null,
      max: t === "number" && max != null ? max : null, min: min != null ? min : null, step: passo || (tipo === "moeda" ? null : null),
      inputmode: inputmode || (tipo === "moeda" ? "decimal" : tipo === "tel" ? "tel" : null), dataset: tipo === "moeda" ? { moeda: "1" } : null });
    if (tipo === "moeda" && typeof valor === "number") ctl.value = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (tipo === "senha") {
      const olho = h("button", { type: "button", class: "bt-icone campo-olho", "aria-label": "Mostrar senha", "aria-pressed": "false" }, icone("olho"));
      olho.addEventListener("click", () => {
        const vis = ctl.type === "password"; ctl.type = vis ? "text" : "password";
        olho.setAttribute("aria-pressed", String(vis)); olho.setAttribute("aria-label", vis ? "Esconder senha" : "Mostrar senha");
      });
      ctl = h("div", { class: "campo-senha" }, ctl, olho);
    }
  }
  return h("div", { class: ["campo", `campo-${tipo}`], dataset: { campo: nome } },
    h("label", { for: id }, rotulo, obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null), ctl, aj, erro);
}

/** "1.234,56" → 1234.56 ; "2.000" → 2000 (ponto de milhar do jeito brasileiro) ; "297.5" → 297.5 ; "" → null */
export function lerMoeda(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/[R$\s ]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
  return Number.isFinite(n) ? n : null;
}

/** lerForm(form) → objeto: caixa única → boolean; multipla → lista; número/moeda → Number|null; texto → aparado. */
export function lerForm(form) {
  const r = {};
  const multis = new Set([...form.querySelectorAll("[data-multi]")].map(f => f.dataset.multi));
  for (const m of multis) r[m] = [];
  for (const el of form.querySelectorAll("input[name], select[name], textarea[name]")) {
    const n = el.name;
    if (el.type === "checkbox") {
      if (multis.has(n)) { if (el.checked) r[n].push(el.value); }
      else r[n] = el.checked;
    } else if (el.type === "radio") { if (el.checked) r[n] = el.value; else if (!(n in r)) r[n] = null; }
    else if (el.type === "number") r[n] = el.value === "" ? null : Number(el.value);
    else if (el.dataset.moeda) r[n] = lerMoeda(el.value);
    else if (el.tagName === "SELECT" && el.multiple) r[n] = [...el.selectedOptions].map(o => o.value);
    else r[n] = typeof el.value === "string" ? el.value.trim() : el.value;
  }
  return r;
}

/** marcarErro(form, nome, texto) — nome null limpa todos. */
export function marcarErro(form, nome, texto) {
  if (!form) return;
  if (nome === null || nome === undefined) {
    for (const c of form.querySelectorAll(".campo")) {
      const e = c.querySelector(".campo-erro"); if (e) { e.hidden = true; e.textContent = ""; }
      for (const x of c.querySelectorAll("[aria-invalid]")) x.removeAttribute("aria-invalid");
    }
    return;
  }
  const c = form.querySelector(`[data-campo="${CSS.escape(nome)}"]`);
  if (!c) return;
  const e = c.querySelector(".campo-erro");
  const ctl = c.querySelector("input:not([type=hidden]), select, textarea");
  if (e) { e.textContent = texto || ""; e.hidden = !texto; }
  if (ctl) {
    if (texto) {
      ctl.setAttribute("aria-invalid", "true");
      const ids = new Set((ctl.getAttribute("aria-describedby") || "").split(" ").filter(Boolean)); if (e) ids.add(e.id);
      ctl.setAttribute("aria-describedby", [...ids].join(" "));
      try { ctl.focus({ preventScroll: false }); } catch { /* ok */ }
    } else ctl.removeAttribute("aria-invalid");
  }
}

/* ============================================================
   Tabela (vira cartões no celular via data-rotulo)
   ============================================================ */
/** tabela({colunas:[{chave, rotulo, render, largura, ordenavel, alinhar}], linhas, aoClicar, selecao, vazio, rotulo}) → {el, selecionados(), atualizar(linhas)} */
export function tabela({ colunas, linhas = [], aoClicar, selecao = false, vazio: txtVazio = "Nada por aqui.", rotulo, chave = "id" } = {}) {
  let dados = linhas.slice(), ordem = null;
  const marcadas = new Set();
  const tbody = h("tbody");
  const cabs = colunas.map(c => {
    const th = h("th", { scope: "col", style: c.largura ? { width: c.largura } : null, class: c.alinhar === "dir" ? "dir" : null });
    if (c.ordenavel) {
      const b = h("button", { type: "button", class: "th-ord" }, c.rotulo, icone("ordenar"));
      b.addEventListener("click", () => {
        ordem = ordem && ordem.chave === c.chave ? { chave: c.chave, dir: -ordem.dir } : { chave: c.chave, dir: 1 };
        for (const x of cabs) x.removeAttribute("aria-sort");
        th.setAttribute("aria-sort", ordem.dir > 0 ? "ascending" : "descending");
        desenhar();
      });
      th.appendChild(b);
    } else th.textContent = c.rotulo;
    return th;
  });
  const todas = selecao ? h("input", { type: "checkbox", "aria-label": "Selecionar todas" }) : null;
  if (todas) todas.addEventListener("change", () => { marcadas.clear(); if (todas.checked) dados.forEach(l => marcadas.add(l[chave])); desenhar(); });
  const table = h("table", { class: ["tabela", aoClicar && "tabela-clicavel"] },
    rotulo ? h("caption", { class: "sr-only" }, rotulo) : null,
    h("thead", null, h("tr", null, selecao ? h("th", { class: "th-sel" }, todas) : null, cabs)), tbody);
  const env = h("div", { class: "tabela-env" }, table);

  function valorOrd(l, c) { const v = l[c]; return v === null || v === undefined ? "" : v; }
  function desenhar() {
    limpar(tbody);
    let lista = dados;
    if (ordem) {
      lista = dados.slice().sort((a, b) => {
        const x = valorOrd(a, ordem.chave), y = valorOrd(b, ordem.chave);
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true, sensitivity: "base" });
        return r * ordem.dir;
      });
    }
    if (!lista.length) {
      tbody.appendChild(h("tr", { class: "tr-vazia" }, h("td", { colspan: String(colunas.length + (selecao ? 1 : 0)) }, txtVazio)));
      return;
    }
    for (const l of lista) {
      const tr = h("tr", { tabindex: aoClicar ? "0" : null, dataset: { id: l[chave] } });
      if (selecao) {
        const cb = h("input", { type: "checkbox", "aria-label": "Selecionar", checked: marcadas.has(l[chave]) });
        cb.addEventListener("change", () => { cb.checked ? marcadas.add(l[chave]) : marcadas.delete(l[chave]); });
        cb.addEventListener("click", ev => ev.stopPropagation());
        tr.appendChild(h("td", { class: "td-sel" }, cb));
      }
      for (const c of colunas) {
        const v = c.render ? c.render(l) : l[c.chave];
        tr.appendChild(h("td", { dataset: { rotulo: c.rotulo }, class: [c.alinhar === "dir" && "dir", c.principal && "td-principal"] }, v === null || v === undefined || v === "" ? "—" : v));
      }
      if (aoClicar) {
        tr.addEventListener("click", ev => { if (ev.target.closest("button, a, input, select, textarea, label")) return; aoClicar(l, ev); });
        tr.addEventListener("keydown", ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === tr) { ev.preventDefault(); aoClicar(l, ev); } });
      }
      tbody.appendChild(tr);
    }
  }
  desenhar();
  return {
    el: env,
    selecionados: () => dados.filter(l => marcadas.has(l[chave])),
    atualizar(novas) { dados = (novas || []).slice(); for (const k of [...marcadas]) if (!dados.some(l => l[chave] === k)) marcadas.delete(k); desenhar(); },
  };
}

/* ============================================================
   Pílulas, etiquetas, avatar
   ============================================================ */
const TOKENS_COR = new Set(["ok", "ruim", "aten", "info", "prim", "sec", "neutra", "meta", "google"]);
/** pilula(texto, cor) — cor = token ('ok','ruim','aten','info','prim','sec','neutra') ou #RRGGBB do banco */
export function pilula(texto, cor = "neutra", extra = {}) {
  const tok = TOKENS_COR.has(cor) ? cor : null;
  const hex = !tok ? corOk(cor) : null;
  return h("span", { class: ["pilula", tok ? `pilula-${tok}` : hex ? "pilula-cor" : "pilula-neutra", extra.class], style: hex ? { "--cor": hex } : null, title: extra.title || null },
    extra.icone ? icone(extra.icone) : null, String(texto));
}

/** etiqueta({nome, cor}) */
export function etiqueta({ nome, cor } = {}, { remover } = {}) {
  const c = corOk(cor);
  return h("span", { class: "etiq", style: c ? { "--cor": c } : null },
    h("i", { "aria-hidden": "true" }), h("span", null, String(nome ?? "")),
    remover ? h("button", { type: "button", class: "etiq-x", "aria-label": `Tirar a etiqueta ${nome}`, on: { click: remover } }, icone("fechar")) : null);
}

function iniciais(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ""))).toUpperCase();
}
function hashNum(s) { let x = 0; for (const ch of String(s || "")) x = (x * 31 + ch.codePointAt(0)) >>> 0; return x; }

/** avatar(nome, id, img?) — iniciais sobre uma cor da paleta (estável por id). */
export function avatar(nome, id, img) {
  const i = hashNum(id ?? nome) % 12;
  const el = h("span", { class: "avatar", style: { "--cor": `var(--pal-${i})` }, "aria-hidden": "true", title: nome || null });
  const src = typeof img === "string" && (/^data:image\/(png|jpeg|webp);base64,/.test(img) || /^https:\/\//.test(img)) ? img : null;
  if (src) el.appendChild(h("img", { src, alt: "" }));
  else el.textContent = iniciais(nome);
  return el;
}

/* ============================================================
   Seletores
   ============================================================ */
/** seletorEtiquetas({todas:[{id,nome,cor}], marcadas:[id], aoMudar(ids), podeCriar: async nome→{id,nome,cor} | false, rotulo}) → Node */
export function seletorEtiquetas({ todas = [], marcadas = [], aoMudar, podeCriar = false, rotulo = "Etiquetas" } = {}) {
  let catalogo = todas.slice();
  const sel = new Set(marcadas);
  const raiz = h("div", { class: "sel-etiq", role: "group", "aria-label": rotulo });
  const botao = h("button", { type: "button", class: "bt bt-fant bt-p sel-etiq-mais" }, icone("etiqueta"), "Etiqueta");
  function mudou() { if (aoMudar) aoMudar([...sel]); desenhar(); }
  function desenhar() {
    limpar(raiz);
    for (const id of sel) {
      const e = catalogo.find(x => x.id === id);
      if (e) raiz.appendChild(etiqueta(e, { remover: () => { sel.delete(id); mudou(); } }));
    }
    raiz.appendChild(botao);
  }
  botao.addEventListener("click", () => {
    const busca = h("input", { type: "search", class: "flut-busca", placeholder: "Buscar etiqueta", "aria-label": "Buscar etiqueta" });
    const lista = h("div", { class: "flut-lista", role: "listbox", "aria-multiselectable": "true" });
    const desenharLista = () => {
      limpar(lista);
      const q = busca.value.trim().toLowerCase();
      const achadas = catalogo.filter(e => !q || e.nome.toLowerCase().includes(q));
      for (const e of achadas) {
        const op = h("label", { class: "flut-op" },
          h("input", { type: "checkbox", checked: sel.has(e.id), on: { change: ev => { ev.target.checked ? sel.add(e.id) : sel.delete(e.id); mudou(); } } }),
          etiqueta(e));
        lista.appendChild(op);
      }
      if (q && podeCriar && !catalogo.some(e => e.nome.toLowerCase() === q)) {
        const nomeNovo = busca.value.trim();
        lista.appendChild(h("button", { type: "button", class: "flut-criar", on: { click: async ev => {
          const b = ev.currentTarget;
          try {
            const nova = await carregando(b, podeCriar(nomeNovo));
            if (nova && nova.id) { catalogo = [...catalogo, nova]; sel.add(nova.id); busca.value = ""; mudou(); desenharLista(); }
          } catch (e) { toast(mensagemErro(e), { tipo: "erro" }); }
        } } }, icone("mais"), `Criar «${nomeNovo}»`));
      }
      if (!lista.children.length) lista.appendChild(h("p", { class: "flut-vazio" }, "Nenhuma etiqueta."));
    };
    busca.addEventListener("input", desenharLista);
    desenharLista();
    flutuante(botao, h("div", { class: "pilha-p" }, busca, lista), { classe: "flut-etiq", largura: 260 });
  });
  desenhar();
  return raiz;
}

/** seletorPessoa({usuarios:[{id,nome}], valor, aoMudar(id|null), vazio:'Sem responsável', rotulo}) → <select> */
export function seletorPessoa({ usuarios = [], valor = null, aoMudar, vazio: txtVazio = "Sem responsável", rotulo = "Responsável", desabilitado } = {}) {
  const s = h("select", { class: "sel", "aria-label": rotulo, disabled: !!desabilitado },
    h("option", { value: "" }, txtVazio),
    usuarios.map(u => h("option", { value: u.id, selected: u.id === valor }, u.nome)));
  s.addEventListener("change", () => { if (aoMudar) aoMudar(s.value || null); });
  return s;
}

/** seletorCor({valor, paleta:[hex], aoMudar(hex), rotulo}) → paleta clicável + campo hex (teclado: setas na paleta). */
export function seletorCor({ valor = null, paleta, aoMudar, rotulo = "Cor" } = {}) {
  const cores = (paleta && paleta.length ? paleta : Array.from({ length: 12 }, (_, i) => `var(--pal-${i})`));
  let atual = corOk(valor);
  const nome = novoId("cor");
  const hex = h("input", { type: "text", class: "cor-hex mono", value: atual || "", maxlength: 7, "aria-label": `${rotulo} em hexadecimal`, placeholder: "#RRGGBB", spellcheck: "false" });
  const amostra = h("span", { class: "cor-amostra", "aria-hidden": "true", style: atual ? { "--cor": atual } : null });
  const grupo = h("div", { class: "cor-paleta", role: "radiogroup", "aria-label": rotulo });
  const botoes = cores.map((c, i) => {
    const hexC = corOk(c);
    const b = h("button", { type: "button", role: "radio", class: "cor-op", "aria-label": hexC || `Cor ${i + 1}`,
      "aria-checked": String(!!hexC && hexC.toUpperCase() === (atual || "").toUpperCase()), tabindex: "-1",
      style: { "--cor": hexC || c }, dataset: { cor: hexC || "" } });
    b.addEventListener("click", () => escolher(hexC));
    return b;
  });
  grupo.append(...botoes);
  grupo.addEventListener("keydown", ev => {
    const i = botoes.indexOf(document.activeElement);
    if (i < 0) return;
    const d = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0;
    if (d) { ev.preventDefault(); const j = (i + d + botoes.length) % botoes.length; botoes[j].focus(); escolher(botoes[j].dataset.cor || null); }
  });
  function marcar() {
    let algum = false;
    for (const b of botoes) {
      const on = !!b.dataset.cor && b.dataset.cor.toUpperCase() === (atual || "").toUpperCase();
      b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; algum = algum || on;
    }
    if (!algum && botoes[0]) botoes[0].tabIndex = 0;
    if (atual) amostra.style.setProperty("--cor", atual); else amostra.style.removeProperty("--cor");
  }
  function escolher(c) {
    if (!c) return;
    atual = c.toUpperCase(); hex.value = atual; hex.removeAttribute("aria-invalid"); marcar();
    if (aoMudar) aoMudar(atual);
  }
  hex.addEventListener("input", () => {
    let v = hex.value.trim(); if (v && !v.startsWith("#")) v = "#" + v;
    if (corOk(v)) { atual = v.toUpperCase(); hex.removeAttribute("aria-invalid"); marcar(); if (aoMudar) aoMudar(atual); }
    else hex.setAttribute("aria-invalid", "true");
  });
  marcar();
  const el = h("div", { class: "seletor-cor", dataset: { nome } }, grupo, h("div", { class: "cor-linha" }, amostra, hex));
  el.valor = () => atual;
  el.definir = c => { const x = corOk(c); if (x) { atual = x.toUpperCase(); hex.value = atual; marcar(); } };
  return el;
}

/**
 * abas({itens:[{id, rotulo, n, painel}], ativo, aoMudar(id), rotulo}) → {el, ativar(id), contar(id, n)} (setas ←→, roving tabindex)
 * `painel` (elemento, opcional): vira role=tabpanel, ligado à aba por aria-controls/aria-labelledby (padrão ARIA de abas).
 * O contador vem separado do rótulo por um espaço («Execuções 3», não «Execuções3» no leitor de tela).
 */
export function abas({ itens = [], ativo, aoMudar, rotulo = "Seções", classe = "" } = {}) {
  let atual = ativo ?? (itens[0] && itens[0].id);
  const bts = new Map();
  const lista = h("div", { class: ["abas", classe], role: "tablist", "aria-label": rotulo });
  for (const it of itens) {
    const n = h("span", { class: "abas-n", hidden: it.n === undefined || it.n === null }, it.n ?? "");
    const b = h("button", { type: "button", role: "tab", class: "aba", id: novoId("aba"), dataset: { id: it.id } }, it.icone ? icone(it.icone) : null, h("span", null, it.rotulo), " ", n);
    if (it.painel) {
      if (!it.painel.id) it.painel.id = novoId("painel");
      b.setAttribute("aria-controls", it.painel.id);
      it.painel.setAttribute("role", "tabpanel");
      it.painel.setAttribute("aria-labelledby", b.id);
    }
    b.addEventListener("click", () => { ativar(it.id); if (aoMudar) aoMudar(it.id); });
    bts.set(it.id, { b, n });
    lista.appendChild(b);
  }
  lista.addEventListener("keydown", ev => {
    const arr = [...bts.values()].map(x => x.b); const i = arr.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === "ArrowRight") j = (i + 1) % arr.length; else if (ev.key === "ArrowLeft") j = (i - 1 + arr.length) % arr.length;
    else if (ev.key === "Home") j = 0; else if (ev.key === "End") j = arr.length - 1;
    if (j !== null) { ev.preventDefault(); arr[j].focus(); arr[j].click(); }
  });
  function ativar(id) {
    atual = id;
    for (const [k, { b }] of bts) { const on = k === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }
  }
  ativar(atual);
  return {
    el: lista, ativar, get ativo() { return atual; },
    contar(id, n) { const x = bts.get(id); if (!x) return; x.n.textContent = n ?? ""; x.n.hidden = n === null || n === undefined || n === ""; },
  };
}

/* ============================================================
   Formatação (fuso America/Sao_Paulo)
   ============================================================ */
const _fmt = {
  brl: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  brl0: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  num: new Intl.NumberFormat("pt-BR"),
  data: new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }),
  dataCurta: new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }),
  hora: new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }),
  dia: new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }),
};
const vazioFmt = "—";
function dataDe(iso) {
  if (iso instanceof Date) return iso;
  if (iso === null || iso === undefined || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** R$ 1.234,56 (centavos:false → R$ 1.235) */
export function brl(v, { centavos = true } = {}) { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? vazioFmt : (centavos ? _fmt.brl : _fmt.brl0).format(n); }
export function num(v) { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? vazioFmt : _fmt.num.format(n); }
/** pct(0.234) → "23%"; pct(0.234, 1) → "23,4%" (recebe fração) */
export function pct(v, casas = 0) {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return vazioFmt;
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
}
/** "AAAA-MM-DD" do dia no fuso de SP */
export function hojeSP(d = new Date()) { return _fmt.dia.format(d); }
export function dataBR(iso) {
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
  const d = dataDe(iso); return d ? _fmt.data.format(d) : vazioFmt;
}
export function dataCurtaBR(iso) {
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
  const d = dataDe(iso); return d ? _fmt.dataCurta.format(d) : vazioFmt;
}
export function horaBR(iso) { const d = dataDe(iso); return d ? _fmt.hora.format(d) : vazioFmt; }
export function dataHoraBR(iso) { const d = dataDe(iso); return d ? `${_fmt.data.format(d)} ${_fmt.hora.format(d)}` : vazioFmt; }
/**
 * Período [inicio, fim) para a tela. O fim é EXCLUSIVO: um bloqueio de dia(s) inteiro(s) termina à meia-noite do dia seguinte, e escrever
 * «06/10 00:00 — 07/10 00:00» parece bloquear também o dia 07. Dia(s) inteiro(s) viram «Dia inteiro · 06/10/2026» ou «Dias inteiros · 06/10/2026 a 08/10/2026».
 */
export function periodoBR(inicio, fim, sep = " — ") {
  const a = dataDe(inicio), b = dataDe(fim);
  if (!a || !b) return `${dataHoraBR(inicio)}${sep}${dataHoraBR(fim)}`;
  if (_fmt.hora.format(a) === "00:00" && _fmt.hora.format(b) === "00:00" && b > a) {
    const d1 = _fmt.data.format(a), d2 = _fmt.data.format(new Date(b.getTime() - 60_000));   // 23:59 do último dia
    return d1 === d2 ? `Dia inteiro · ${d1}` : `Dias inteiros · ${d1} a ${d2}`;
  }
  return `${dataHoraBR(a)}${sep}${dataHoraBR(b)}`;
}
/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", "em 2 h", "amanhã"… depois de 7 dias, a data. */
export function relativo(iso, agora = new Date()) {
  const d = dataDe(iso); if (!d) return vazioFmt;
  const s = Math.round((agora.getTime() - d.getTime()) / 1000);
  const fut = s < 0, a = Math.abs(s);
  if (a < 45) return fut ? "em instantes" : "agora";
  if (a < 3600) { const m = Math.max(1, Math.round(a / 60)); return fut ? `em ${m} min` : `há ${m} min`; }
  const hojeK = hojeSP(agora), diaK = hojeSP(d);
  const dias = Math.round((Date.parse(diaK) - Date.parse(hojeK)) / 86400000);
  if (dias === 0) { const hh = Math.max(1, Math.round(a / 3600)); return fut ? `em ${hh} h` : `há ${hh} h`; }
  if (dias === -1) return "ontem";
  if (dias === 1) return "amanhã";
  if (Math.abs(dias) < 7) return dias < 0 ? `há ${-dias} dias` : `em ${dias} dias`;
  return dataBR(d);
}
/** "5512998303030" → "(12) 99830-3030"; estrangeiro → "+44 7911 123456" */
export function telBR(digitos) {
  let d = String(digitos ?? "").replace(/\D/g, "");
  if (!d) return vazioFmt;
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${d}`;
}

/* ============================================================
   Utilidades
   ============================================================ */
export function debounce(fn, ms = 250) {
  let t = null;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.cancelar = () => clearTimeout(t);
  return f;
}

function dentroDeCampo(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
/** atalho('mod+k' | 'esc' | '/' | 'shift+?', fn) → cancelar(). Sem modificador, ignora dentro de campos. */
export function atalho(combinacao, fn) {
  const partes = String(combinacao).toLowerCase().split("+");
  const tecla = partes.pop();
  const mod = partes.includes("mod"), ctrl = partes.includes("ctrl"), alt = partes.includes("alt"), shift = partes.includes("shift");
  const nomeTecla = { esc: "escape", espaco: " ", space: " " }[tecla] || tecla;
  const ouvir = ev => {
    const k = String(ev.key || "").toLowerCase();
    if (k !== nomeTecla) return;
    if (mod && !(ev.ctrlKey || ev.metaKey)) return;
    if (!mod && !ctrl && (ev.ctrlKey || ev.metaKey)) return;
    if (ctrl && !ev.ctrlKey) return;
    if (alt !== ev.altKey) return;
    if (shift && !ev.shiftKey) return;
    if (!mod && !ctrl && !alt && nomeTecla !== "escape" && dentroDeCampo(ev.target)) return;
    fn(ev);
  };
  document.addEventListener("keydown", ouvir);
  return () => document.removeEventListener("keydown", ouvir);
}

/**
 * manterFoco(el) → devolver(): lembra se `el` tem o foco do teclado agora. Um botão/campo desabilitado perde o foco
 * (cai no <body>) e, ao reabilitar, ele não volta sozinho: `devolver()` o traz de volta, se ninguém mais o pegou no meio
 * do caminho e o elemento ainda está na tela (WCAG 2.4.3 — quem usa só o teclado não precisa procurar o controle de novo).
 */
export function manterFoco(el) {
  const tinha = !!el && typeof document !== "undefined" && document.activeElement === el;
  return () => {
    if (!tinha || !el.isConnected || el.disabled) return;
    const a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) { try { el.focus({ preventScroll: true }); } catch { /* ok */ } }
  };
}

/** carregando(botao, promessa|função) — trava o botão (aria-busy) até terminar; devolve o resultado e o foco do teclado. */
export async function carregando(botao, promessa) {
  const estavaDesab = botao ? botao.disabled : false;
  const devolverFoco = botao ? manterFoco(botao) : null;
  if (botao) { botao.disabled = true; botao.setAttribute("aria-busy", "true"); }
  try {
    return await (typeof promessa === "function" ? promessa() : promessa);
  } finally {
    if (botao) { botao.disabled = estavaDesab; botao.removeAttribute("aria-busy"); devolverFoco(); }
  }
}

/** «smooth» só para quem não pediu menos movimento (prefers-reduced-motion): para scrollIntoView/scrollTo. */
export function comportamentoRolagem() {
  try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; } catch { return "auto"; }
}

/** copiar(texto) → Promise<boolean> (+ aviso "Copiado."). */
export async function copiar(texto, { aviso = "Copiado." } = {}) {
  let ok = false;
  try { await navigator.clipboard.writeText(String(texto)); ok = true; } catch {
    try {
      const t = h("textarea", { class: "sr-only", readonly: true }, String(texto));
      document.body.appendChild(t); t.select(); ok = document.execCommand("copy"); t.remove();
    } catch { ok = false; }
  }
  if (aviso) toast(ok ? aviso : "Não foi possível copiar. Selecione e copie manualmente.", { tipo: ok ? "ok" : "erro" });
  return ok;
}

/** Link "Enviar pelo WhatsApp" (wa.me com o texto). */
export function linkWhatsApp(texto, numero) {
  const n = String(numero || "").replace(/\D/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(String(texto))}`;
}

/** Bloco de link gerado (convite / nova senha): campo só leitura + Copiar + WhatsApp. */
export function blocoLink(link, { rotulo = "Link", textoWhats } = {}) {
  const id = novoId("lnk");
  const inp = h("input", { id, type: "text", class: "mono", readonly: true, value: link });
  inp.addEventListener("focus", () => inp.select());
  return h("div", { class: "bloco-link" },
    h("label", { for: id, class: "rotulo" }, rotulo),
    inp,
    h("div", { class: "linha" },
      h("button", { type: "button", class: "bt bt-prim", on: { click: () => copiar(link, { aviso: "Link copiado." }) } }, icone("copiar"), "Copiar"),
      h("a", { class: "bt bt-sec", href: linkWhatsApp(textoWhats ? `${textoWhats}\n${link}` : link), target: "_blank", rel: "noopener noreferrer" }, icone("whatsapp"), "Enviar pelo WhatsApp")));
}

/** Barra de uso × limite (Plano e uso, Admin). limite null = sem limite. */
export function barraUso(rotulo, uso, limite, { detalhe } = {}) {
  const u = Number(uso) || 0;
  const semLimite = limite === null || limite === undefined;
  const p = semLimite ? 0 : limite === 0 ? 100 : Math.min(100, Math.round((u / limite) * 100));
  const txt = semLimite ? `${num(u)} · sem limite` : `${num(u)} / ${num(limite)}`;
  return h("div", { class: "uso" },
    h("div", { class: "uso-l" }, h("span", null, rotulo), h("span", null, txt)),
    h("div", { class: ["uso-barra", p >= 100 ? "cheia" : p >= 80 ? "alta" : null], role: "meter", "aria-valuemin": "0",
      "aria-valuemax": String(semLimite ? Math.max(u, 1) : limite), "aria-valuenow": String(u), "aria-label": rotulo, "aria-valuetext": txt },
      h("i", { style: { "--p": `${semLimite ? 0 : p}%` } })),
    detalhe ? h("small", { class: "uso-det" }, detalhe) : null);
}
