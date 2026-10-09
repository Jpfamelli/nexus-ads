/* ============================================================
   ÓRBITA — ui.js · frente F3 · ESPEC §7.3
   Componentes do app (DOM puro). Os módulos recebem isto em ctx.ui.
   Regras: texto de usuário SEMPRE por textContent (h() faz isso);
   nada de innerHTML; nada de on*= inline; nenhuma cor escrita aqui
   (cor vem dos tokens do app.css ou de --cor validada).

   Classes de apoio que os módulos podem usar no próprio HTML
   (estilo em app.css): botões .bt + .bt-prim | .bt-sec | .bt-fant |
   .bt-perigo | .bt-contorno-perigo, tamanhos .bt-p | .bt-g, .bt-icone
   (redondo, só ícone); .cartao (cartão opaco), .cartao-cab, .rotulo
   (Satoshi 600 13 px), .dado (Plex: protocolo, hora, telefone, ID),
   .selo-caps (único caixa-alta), .narr (Zodiak itálica: manchetes,
   vazios, resumo de IA), .num-moeda (R$ e centavos a 60 %), .entra /
   .assenta / .destaque (movimento), .titulo-pag (Clash), .sub,
   .grade-2/.grade-3 (minmax), .pilha (coluna com gap), .linha (flex
   com gap), .fita (barra de ferramentas), .sel (select pílula), .busca
   (campo de busca com ícone), .mono (Plex), .sr-only, .num-grande
   (Clash, número), .aviso(.aviso-ruim|-aten|-ok).

   Contratos da linguagem visual (plano de 01/10/2026, frente A):
   cabecalho({rotulo?, titulo, sub?, acoes?, nivel: 1|2}) → <header>;
   segmentado({opcoes:[{valor, rotulo, contador?}], valor, tipo:
   "abas"|"filtro", aoMudar}) → <div role=tablist> (.ativar, .contar, .valor);
   toqueLongo(el, fn, {ms}) e deslizar(el, {esquerda?, direita?}) → desligar();
   esqueleto(tipo, opcoes) / trocarEsqueleto(el, conteudo);
   erroCartao(erro, tentar) refaz sozinho em "orbita:online";
   acaoComDesfazer({texto, aplicar, reverter, ms}) → Promise<{estado, desfeita, erro?}>
   (Ctrl/⌘+Z desfaz a mais recente, fila de 3; com `firmar`, a escrita adiada sai com firmar({saindo: true})
   quando a página fecha ou vai para segundo plano); copiar(texto) e copiarDepois(promessaDeTexto, {aviso})
   (texto que ainda vem do servidor: chamar dentro do clique); modal/gaveta({protegerTexto = true});
   campo({validar: "telefone"|"email"|"senha"|"moeda"|fn}); vazio({tipo, ...}).
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

const RE_ERRO_IMPORT = /dynamically imported module|importing a module script|module script failed|error loading dynamically/i;
const RE_ERRO_REDE = /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|err_network/i;
const FRASES_CODIGO = {
  sem_conexao: "Sem conexão com o servidor. Confira a internet e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  servico_indisponivel: "O serviço está indisponível agora. Tentamos de novo sozinhos; se continuar, tente em alguns minutos.",
  http_408: "O servidor demorou para responder. Tente de novo.",
  http_429: "Muitas tentativas seguidas. Aguarde um instante e tente de novo.",
  http_5xx: "O servidor está com problema agora. Tente de novo em instantes.",
};
/** Tira jargão e endereço de mensagens que vêm do navegador ("Failed to fetch dynamically imported module: https://…"):
    erro de transporte e de import() viram frase em português, sem URL. Texto que já é frase de produto passa intacto. */
export function fraseDeErro(texto, { bruto = false } = {}) {
  const t = String(texto ?? "");
  const porCodigo = FRASES_CODIGO[t.trim()] || (/^http_5\d\d$/.test(t.trim()) ? FRASES_CODIGO.http_5xx : null);
  if (porCodigo) return porCodigo;                    // rede de segurança: código técnico nunca chega à tela (o api.js do shell também traduz)
  if (RE_ERRO_IMPORT.test(t)) return "Não foi possível abrir esta tela agora. Confira a internet e tente de novo.";
  if (RE_ERRO_REDE.test(t)) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  if (bruto && /https?:\/\//i.test(t)) return "Não deu certo agora. Tente de novo.";
  return t;
}
export function mensagemErro(e) {
  return fraseDeErro(_mensagemErro(e), { bruto: e instanceof Error && !e.codigo });
}
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

/** Olho cortado («senha à mostra»): o único ícone desenhado fora do sprite, com o mesmo traço (.ic). */
function iconeOlhoCortado() {
  return h("svg", { class: "ic", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    h("path", { d: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.7 10.7 0 0 1 12 4.9c5 0 8.6 3.6 10 7.1a11.4 11.4 0 0 1-2.7 3.9M6.6 6.6C4.3 8 2.8 10 2 12c1.4 3.5 5 7.1 10 7.1 1.8 0 3.4-.5 4.8-1.2" }));
}

let _graficosP = null;
/** graficos.js sob demanda (mesmo ?v=): o KPI desenha a sparkline e conta o número com as peças de lá, sem duplicar geometria aqui. */
function graficos() {
  if (!_graficosP) _graficosP = import(`./graficos.js?v=${VERSAO}`).catch(e => { console.error("graficos.js não carregou", e); return null; });
  return _graficosP;
}

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
  if (_toasts && document.contains(_toasts)) return _toasts;
  _toasts = document.getElementById("toasts") || h("div", { id: "toasts" });
  _toasts.classList.add("toasts");
  _toasts.setAttribute("popover", "manual");
  // o anúncio ao leitor de tela é de ui.anunciar (uma só voz); a caixa deixa de ser aria-live para não falar duas vezes
  _toasts.removeAttribute("aria-live");
  _toasts.removeAttribute("aria-relevant");
  if (!_toasts.isConnected) document.body.appendChild(_toasts);
  return _toasts;
}

/** toast(texto, {tipo:'ok'|'erro'|'info'|'aten', desfazer:fn, acao:{rotulo, fn}, ms:5000, fixo, aoFechar(motivo)}) → {fechar(motivo?), el}
    motivo de aoFechar: "tempo" | "fechado" | "desfazer" | "acao" | "fila" | o que fechar(motivo) receber. Todo toast é anunciado ao leitor de tela
    (erro, de forma urgente). Plano 100 · A10: `ms: 0` não fecha sozinho; `fixo: true` também não sai da fila quando chegam outros (avisos de
    estado que duram enquanto o problema durar: número de WhatsApp caído); `acao` é um botão próprio («Ver número»). */
export function toast(texto, { tipo = "info", desfazer = null, acao = null, ms, fixo = false, aoFechar = null } = {}) {
  const caixa = caixaToasts();
  const dur = ms ?? (tipo === "erro" ? 7000 : desfazer || acao ? 7000 : 4500);
  let timer = null, fechado = false;
  const fechar = (motivo = "fechado") => {
    if (fechado) return; fechado = true;
    clearTimeout(timer);
    el.classList.add("saindo");
    setTimeout(() => { el.remove(); if (!caixa.children.length && caixa.hidePopover) try { caixa.hidePopover(); } catch { /* ok */ } }, 180);
    if (aoFechar) try { aoFechar(motivo); } catch (e) { console.error(e); }
  };
  const temAcao = !!(acao && typeof acao.fn === "function" && String(acao.rotulo || "").trim());
  const el = h("div", { class: ["toast", `toast-${tipo}`, fixo && "toast-fixo"], role: fixo ? "status" : null },
    icone(tipo === "ok" ? "check" : tipo === "erro" || tipo === "aten" ? "alerta" : "info"),
    h("p", null, String(texto)),
    desfazer ? h("button", { type: "button", class: "toast-acao", title: "Desfazer (Ctrl ou ⌘ + Z)", on: { click: () => { fechar("desfazer"); desfazer(); } } }, "Desfazer") : null,
    temAcao ? h("button", { type: "button", class: "toast-acao", on: { click: () => { fechar("acao"); try { acao.fn(); } catch (e) { console.error(e); } } } }, String(acao.rotulo).trim()) : null,
    h("button", { type: "button", class: "toast-x", "aria-label": "Fechar aviso", on: { click: () => fechar("fechado") } }, icone("fechar")));
  el.__fechar = fechar;
  caixa.appendChild(el);
  // fila de 4: os mais antigos saem; um toast fixo não conta nem sai (ele dura enquanto o estado durar)
  const vivos = [...caixa.children].filter(c => !c.classList.contains("saindo") && !c.classList.contains("toast-fixo"));
  for (const c of vivos.slice(0, Math.max(0, vivos.length - 4))) { if (c.__fechar) c.__fechar("fila"); else c.remove(); }
  mostrarNoTopo(caixa);
  if (dur > 0) {
    timer = setTimeout(() => fechar("tempo"), dur);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", () => { if (!fechado) timer = setTimeout(() => fechar("tempo"), 2500); });
  }
  anunciar(String(texto), { urgente: tipo === "erro" });
  return { fechar: (motivo = "fechado") => fechar(typeof motivo === "string" && motivo ? motivo : "fechado"), el };
}

/** Anúncio só para leitor de tela (aria-live). `urgente` usa a região assertiva (erros). */
export function anunciar(texto, { urgente = false } = {}) {
  const id = urgente ? "anuncio-urgente" : "anuncio";
  let r = document.getElementById(id);
  if (!r) { r = h("div", { id, class: "sr-only", "aria-live": urgente ? "assertive" : "polite", "aria-atomic": "true" }); document.body.appendChild(r); }
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

/** Celular/tablet: o toque abre o teclado se o foco cair num campo, então o diálogo foca a si mesmo (M08). */
function toqueGrosso() {
  try { return typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { return false; }
}
/** Foco inicial de um diálogo: em toque, o próprio diálogo (tabindex -1); com mouse/teclado, o 1º campo (ou o rodapé). */
function focoInicial(dlg, alvoDesktop) {
  if (toqueGrosso()) {
    dlg.setAttribute("tabindex", "-1");
    try { dlg.focus({ preventScroll: true }); } catch { try { dlg.focus(); } catch { /* ok */ } }
    return;
  }
  if (alvoDesktop) focarPrimeiro(alvoDesktop);
}

/* ------------------------------------------------------------
   Proteção do texto digitado (M08): modal e gaveta comparam o formulário da abertura com o atual.
   Só o que a PESSOA mexeu conta (a base acompanha formulários preenchidos por RPC depois de abrir) e só os campos
   com `name` (como ui.lerForm); busca (type=search), arquivo e [data-sem-protecao] ficam de fora.
   Esc, clique fora e Voltar do navegador abrem a faixa "Descartar o que você digitou?"; os botões do próprio diálogo não.
   ------------------------------------------------------------ */
const TIPOS_SEM_PROTECAO = new Set(["search", "file", "button", "submit", "reset", "image"]);
function assinaturaForm(raiz) {
  const partes = [];
  for (const el of raiz.querySelectorAll("input[name], select[name], textarea[name]")) {
    const t = String(el.type || "").toLowerCase();
    if (TIPOS_SEM_PROTECAO.has(t) || (el.hasAttribute && el.hasAttribute("data-sem-protecao"))) continue;
    const v = t === "checkbox" || t === "radio" ? (el.checked ? "1" : "0") : String(el.value ?? "").trim();
    partes.push(`${el.name}\u0001${t}\u0001${v}`);
  }
  return hashNum(partes.join("\u0002"));   // só o hash fica na memória (pode haver senha digitada)
}
function criarProtecao(raiz, ativo) {
  let base = null, tocou = false;
  const confiavel = ev => !ev || ev.isTrusted !== false;
  if (ativo) {
    setTimeout(() => { if (!tocou) base = assinaturaForm(raiz); }, 0);
    const antes = () => { if (!tocou) base = assinaturaForm(raiz); };      // formulário preenchido por RPC depois de abrir não conta como "digitado"
    for (const ev of ["pointerdown", "keydown", "focusin"]) raiz.addEventListener(ev, antes, true);
    const mexeu = ev => { if (confiavel(ev)) tocou = true; };
    for (const ev of ["input", "change", "click", "paste", "cut", "drop"]) raiz.addEventListener(ev, mexeu, true);
  }
  return {
    sujo: () => !!ativo && tocou && base !== null && assinaturaForm(raiz) !== base,
    zerar: () => { tocou = false; base = assinaturaForm(raiz); },
  };
}
/** Faixa "Descartar o que você digitou?" (insere-se entre o cabeçalho e o corpo). */
function criarFaixaDescartar(aoDescartar, aoContinuar) {
  const continuar = h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => aoContinuar() } }, "Continuar editando");
  const descartar = h("button", { type: "button", class: "bt bt-contorno-perigo bt-p", on: { click: () => aoDescartar() } }, icone("lixeira"), "Descartar");
  const el = h("div", { class: "protege-faixa", role: "alert", hidden: true },
    h("p", null, "Descartar o que você digitou?"), h("div", { class: "linha" }, continuar, descartar));
  return { el, continuar };
}

/** modal({titulo, corpo, acoes:[{rotulo, tipo, fn, valor, icone?}], largura:'p'|'m'|'g', aoAbrir, protegerTexto = true}) → Promise<valor>.
    tipo "perigo" é CONTORNO (nunca preenchido, M04) e deve levar `icone` (confirmar() já põe a lixeira).
    fn(api) pode ser async; devolver false mantém aberto; erro lançado aparece dentro do modal. Esc/fechar → null.
    protegerTexto: Esc, clique fora e Voltar com texto digitado pedem confirmação (X e botões do rodapé fecham direto). */
export function modal({ titulo, corpo, acoes, largura = "m", aoAbrir, fecharFora = true, descricao, protegerTexto = true } = {}) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    const idT = novoId("modal-t");
    const erro = h("p", { class: "modal-erro", role: "alert", hidden: true });
    const corpoEl = h("div", { class: "modal-corpo" }, descricao ? h("p", { class: "sub" }, descricao) : null, corpo, erro);
    const lista = acoes && acoes.length ? acoes : [{ rotulo: "Fechar", tipo: "neutro", valor: null }];
    let feito = false, camada = null;
    const dlg = h("dialog", { class: ["modal", `modal-${largura}`], "aria-labelledby": idT });
    const prot = criarProtecao(corpoEl, protegerTexto !== false);
    const api = {
      el: dlg, corpo: corpoEl,
      estaSujo: () => prot.sujo(),
      fechar(v = null) {
        if (feito) return; feito = true;
        if (camada) camada.liberar();
        dlg.classList.add("saindo");
        setTimeout(() => { try { dlg.close(); } catch { /* ok */ } dlg.remove(); if (anterior && anterior.focus && anterior.isConnected) try { anterior.focus({ preventScroll: true }); } catch { /* ok */ } }, 160);
        resolve(v);
      },
      erro(texto) { erro.textContent = texto || ""; erro.hidden = !texto; },
    };
    const faixa = criarFaixaDescartar(() => api.fechar(null), () => { faixa.el.hidden = true; });
    /** Esc, clique fora e Voltar: com texto digitado mostra a faixa em vez de fechar. Devolve true se fechou. */
    function tentarFechar() {
      if (feito) return true;
      if (prot.sujo()) {
        if (faixa.el.hidden) { faixa.el.hidden = false; try { faixa.continuar.focus({ preventScroll: true }); } catch { /* ok */ } }
        else faixa.el.hidden = true;     // 2º Esc: dispensa o aviso e volta a editar
        return false;
      }
      api.fechar(null);
      return true;
    }
    const abrirCamada = () => camadas.abrir(() => {
      if (feito) return;
      if (prot.sujo()) {
        tentarFechar();
        // o Voltar gastou a entrada do histórico: recoloca depois do popstate (dentro dele a pilha ainda está sendo esvaziada)
        setTimeout(() => { if (!feito) camada = abrirCamada(); }, 0);
      } else api.fechar(null);
    });
    const botoes = lista.map(a => {
      const b = h("button", { type: "button", class: ["bt", a.tipo === "primario" ? "bt-prim" : a.tipo === "perigo" ? "bt-perigo" : "bt-sec"],
        dataset: { tipo: a.tipo || "neutro" }, disabled: !!a.desabilitado }, a.icone ? icone(a.icone) : null, a.rotulo);
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
      faixa.el,
      corpoEl,
      h("footer", { class: "modal-rod" }, botoes));
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); tentarFechar(); });
    dlg.addEventListener("mousedown", ev => { if (fecharFora && ev.target === dlg) dlg.dataset.fora = "1"; });
    dlg.addEventListener("click", ev => { if (fecharFora && ev.target === dlg && dlg.dataset.fora === "1") tentarFechar(); delete dlg.dataset.fora; });
    dlg.addEventListener("submit", ev => { ev.preventDefault(); if (primario && !primario.disabled) primario.click(); });
    if (toqueGrosso()) dlg.setAttribute("autofocus", "");
    document.body.appendChild(dlg);
    dlg.showModal();
    camada = abrirCamada();   // botão Voltar do navegador fecha o modal (ou pergunta, se houver texto digitado)
    focoInicial(dlg, corpoEl.querySelector("input,select,textarea") ? corpoEl : dlg.querySelector(".modal-rod"));
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
    titulo, corpo, largura: "p", protegerTexto: false,
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: rotulo || (perigo ? "Excluir" : "Confirmar"), tipo: perigo ? "perigo" : "primario", icone: perigo ? "lixeira" : undefined,
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

/** gaveta({titulo, corpo, largura:'m'|'g', aoFechar, acoes:Node, protegerTexto = true}) → {el, corpo, fechar, trocarTitulo, estaSujo}
    Esc e clique fora com texto digitado pedem confirmação; fechar() (botões, código) fecha direto. */
export function gaveta({ titulo = "", corpo, largura = "m", aoFechar, acoes, protegerTexto = true } = {}) {
  const anterior = document.activeElement;
  const idT = novoId("gav-t");
  const tit = h("h2", { id: idT }, titulo);
  const corpoEl = h("div", { class: "gaveta-corpo" }, corpo);
  const dlg = h("dialog", { class: ["gaveta", `gaveta-${largura}`], "aria-labelledby": idT });
  let fechada = false;
  const prot = criarProtecao(corpoEl, protegerTexto !== false);
  const g = {
    el: dlg, corpo: corpoEl,
    estaSujo: () => prot.sujo(),
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
  const faixa = criarFaixaDescartar(() => g.fechar(), () => { faixa.el.hidden = true; });
  function tentarFechar() {
    if (fechada) return;
    if (prot.sujo()) {
      if (faixa.el.hidden) { faixa.el.hidden = false; try { faixa.continuar.focus({ preventScroll: true }); } catch { /* ok */ } }
      else faixa.el.hidden = true;
      return;
    }
    g.fechar();
  }
  dlg.append(
    h("header", { class: "gaveta-cab" },
      h("button", { type: "button", class: "bt-icone gaveta-voltar", "aria-label": "Fechar", on: { click: () => g.fechar() } }, icone("seta-esq")),
      tit, acoes || null,
      h("button", { type: "button", class: "bt-icone gaveta-x", "aria-label": "Fechar", on: { click: () => g.fechar() } }, icone("fechar"))),
    faixa.el,
    corpoEl);
  dlg.addEventListener("cancel", ev => { ev.preventDefault(); tentarFechar(); });
  dlg.addEventListener("mousedown", ev => { if (ev.target === dlg) dlg.dataset.fora = "1"; });
  dlg.addEventListener("click", ev => { if (ev.target === dlg && dlg.dataset.fora === "1") tentarFechar(); delete dlg.dataset.fora; });
  if (toqueGrosso()) dlg.setAttribute("autofocus", "");
  document.body.appendChild(dlg);
  dlg.showModal();
  if (toqueGrosso()) focoInicial(dlg, null); else setTimeout(() => focarPrimeiro(corpoEl), 30);
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
/** Órbita em SVG (createElementNS via h, só classes de token): planeta + 2 órbitas + um satélite por passo, aceso quando feito. */
function orbitaSvg({ total = 3, feitos = 0, selo = false } = {}) {
  const n = Math.max(1, Math.min(8, total));
  const sats = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return h("circle", { class: ["vo-sat", i < feitos && "vo-sat-on"], cx: (60 + 50 * Math.cos(a)).toFixed(1), cy: (60 + 24 * Math.sin(a)).toFixed(1), r: "5" });
  });
  return h("svg", { class: "vazio-orbita", viewBox: "0 0 120 120", "aria-hidden": "true", focusable: "false" },
    h("g", { transform: "rotate(-18 60 60)" },
      h("ellipse", { class: "vo-orbita", cx: "60", cy: "60", rx: "50", ry: "24" }),
      h("ellipse", { class: ["vo-orbita", "vo-orbita-2"], cx: "60", cy: "60", rx: "30", ry: "14" }),
      h("circle", { class: "vo-planeta", cx: "60", cy: "60", r: "9" }),
      sats),
    selo ? h("g", null, h("circle", { class: "vo-selo", cx: "98", cy: "24", r: "13" }), h("path", { class: "vo-selo-v", d: "M91.5 24.5 L96 29 L105 19.5" })) : null);
}

/* Ilustrações leves por tema (plano 50 · A5): SVG inline só com classes de token (.vz-*), 160 × 100, aria-hidden.
   Cada uma conta a cena da tela vazia: bolhas sem conversa, quadro sem cartões, mês sem consulta, campanha sem retorno, fluxo sem passos, lupa sem achado. */
const TEMAS_ILUSTRACAO = {
  conversas: () => [
    h("rect", { class: "vz-a", x: "18", y: "18", width: "78", height: "40", rx: "14" }),
    h("path", { class: "vz-a", d: "M34 58 L30 72 L48 58 Z" }),
    h("circle", { class: "vz-pt", cx: "44", cy: "38", r: "3.5" }), h("circle", { class: "vz-pt", cx: "57", cy: "38", r: "3.5" }), h("circle", { class: "vz-pt", cx: "70", cy: "38", r: "3.5" }),
    h("rect", { class: "vz-b", x: "72", y: "50", width: "70", height: "34", rx: "12" }),
    h("path", { class: "vz-b", d: "M126 84 L132 94 L116 84 Z" }),
    h("line", { class: "vz-tr", x1: "86", y1: "63", x2: "126", y2: "63" }), h("line", { class: "vz-tr vz-curta", x1: "86", y1: "72", x2: "112", y2: "72" }),
  ],
  crm: () => [
    ...[0, 1, 2].map(i => h("rect", { class: "vz-col", x: String(14 + i * 46), y: "12", width: "40", height: "78", rx: "8" })),
    h("rect", { class: "vz-card vz-acento", x: "20", y: "22", width: "28", height: "14", rx: "4" }),
    h("rect", { class: "vz-card", x: "20", y: "40", width: "28", height: "14", rx: "4" }),
    h("rect", { class: "vz-card", x: "66", y: "22", width: "28", height: "14", rx: "4" }),
    h("path", { class: "vz-tr", d: "M118 50 h20 m-6 -6 l6 6 -6 6" }),
  ],
  agenda: () => [
    h("rect", { class: "vz-col", x: "24", y: "14", width: "112", height: "76", rx: "10" }),
    h("rect", { class: "vz-a", x: "24", y: "14", width: "112", height: "18", rx: "10" }),
    h("line", { class: "vz-tr", x1: "50", y1: "8", x2: "50", y2: "20" }), h("line", { class: "vz-tr", x1: "110", y1: "8", x2: "110", y2: "20" }),
    ...[0, 1, 2].flatMap(l => [0, 1, 2, 3, 4].map(c => h("circle", { class: l === 1 && c === 2 ? "vz-pt vz-acento" : "vz-pt vz-fraco", cx: String(44 + c * 18), cy: String(46 + l * 15), r: l === 1 && c === 2 ? "5" : "2.5" }))),
  ],
  ads: () => [
    ...[0, 1, 2, 3].map(i => h("rect", { class: i === 3 ? "vz-card vz-acento" : "vz-card", x: String(22 + i * 22), y: String(70 - i * 14), width: "14", height: String(20 + i * 14), rx: "4" })),
    h("path", { class: "vz-tr", d: "M24 58 C 50 50, 70 44, 100 26" }), h("path", { class: "vz-tr", d: "M92 24 h10 v10" }),
    h("path", { class: "vz-a", d: "M114 38 l22 -10 v40 l-22 -10 z" }), h("rect", { class: "vz-a", x: "106", y: "42", width: "10", height: "12", rx: "3" }),
  ],
  automacoes: () => [
    h("circle", { class: "vz-a", cx: "28", cy: "50", r: "12" }), h("path", { class: "vz-acento-tr", d: "M24 44 l8 6 -8 6" }),
    h("line", { class: "vz-tr", x1: "40", y1: "50", x2: "62", y2: "50" }),
    h("rect", { class: "vz-col", x: "62", y: "36", width: "30", height: "28", rx: "7", transform: "rotate(45 77 50)" }),
    h("line", { class: "vz-tr", x1: "92", y1: "50", x2: "112", y2: "50" }),
    h("circle", { class: "vz-b", cx: "126", cy: "50", r: "12" }), h("path", { class: "vz-acento-tr", d: "M120 50 l4 4 8 -8" }),
    h("line", { class: "vz-tr vz-pontilhada", x1: "77", y1: "70", x2: "77", y2: "90" }),
  ],
  busca: () => [
    h("circle", { class: "vz-col", cx: "70", cy: "46", r: "28" }),
    h("circle", { class: "vz-pontilhada vz-tr", cx: "70", cy: "46", r: "14" }),
    h("line", { class: "vz-grossa", x1: "92", y1: "68", x2: "118", y2: "92" }),
    h("path", { class: "vz-tr vz-fraco", d: "M24 20 h12 M30 14 v12 M128 24 h8 M132 20 v8" }),
  ],
};
/** ilustracaoVazio(tema) → <svg class="vazio-il"> ou null quando o tema não existe (a tela cai no vazio de sempre). */
export function ilustracaoVazio(tema) {
  const f = TEMAS_ILUSTRACAO[tema];
  if (!f) return null;
  return h("svg", { class: ["vazio-il", `vazio-il-${tema}`], viewBox: "0 0 160 100", "aria-hidden": "true", focusable: "false" }, f());
}
export const TEMAS_VAZIO = Object.freeze(Object.keys(TEMAS_ILUSTRACAO));

/** vazio({tipo, titulo, texto, acao:{rotulo, fn, icone?}, acoes, passos, icone, tema}) → Node
    tipo "primeiro_uso": órbita com um satélite por passo (aceso se feito) + lista de passos + 1 ação;
    tipo "em_dia": selo ✓ na órbita + a frase (titulo) em .narr;
    tipo "sem_resultado": 1 linha + ação ("Limpar filtros" por padrão).
    Sem `tipo` é o vazio genérico (título + texto + ação); só leva o círculo de ícone se `icone` for dado (o "+" que todo vazio sem ícone herdava saiu, M09).
    `tema` ("conversas" | "crm" | "agenda" | "ads" | "automacoes" | "busca") troca o ícone por uma ilustração leve (plano 50 · A5), também no sem_resultado.
    passos: ["texto" | {rotulo, feito}]. */
export function vazio({ tipo, titulo, texto, acao, icone: ic, acoes, passos, tema } = {}) {
  const lista = [...(acao ? [acao] : []), ...(acoes || [])];
  const il = tema ? ilustracaoVazio(tema) : null;
  const botao = (a, i, extra) => h("button", { type: "button", class: ["bt", i === 0 ? "bt-prim" : "bt-sec", extra], on: { click: a.fn } },
    a.icone ? icone(a.icone) : null, a.rotulo || (tipo === "sem_resultado" ? "Limpar filtros" : "Continuar"));
  if (tipo === "sem_resultado") {
    return h("div", { class: ["vazio", "vazio-sem", il && "vazio-sem-il"], dataset: { tipo, tema: il ? tema : null } },
      il,
      h("p", { class: "vazio-linha" }, titulo || "Nada encontrado.", texto ? ` ${texto}` : ""),
      lista.length ? h("div", { class: "linha" }, lista.map((a, i) => botao(a, i === 0 ? 1 : i, "bt-p"))) : null);
  }
  if (tipo === "em_dia") {
    return h("div", { class: ["vazio", "vazio-em-dia"], dataset: { tipo } },
      orbitaSvg({ total: 3, feitos: 3, selo: true }),
      h("div", { class: "vazio-txt" },
        h("p", { class: "narr vazio-narr" }, titulo || "Tudo em dia."),
        texto ? h("p", null, texto) : null,
        lista.length ? h("div", { class: "linha vazio-acoes" }, lista.map((a, i) => botao(a, i === 0 ? 1 : i))) : null));
  }
  if (tipo === "primeiro_uso") {
    const itens = (passos || []).map(p => typeof p === "string" ? { rotulo: p, feito: false } : { rotulo: p.rotulo, feito: !!p.feito });
    return h("div", { class: ["vazio", "vazio-primeiro"], dataset: { tipo } },
      orbitaSvg({ total: itens.length || 3, feitos: itens.filter(p => p.feito).length }),
      h("div", { class: "vazio-txt" },
        titulo ? h("h2", null, titulo) : null,
        texto ? h("p", null, texto) : null,
        itens.length ? h("ol", { class: "vazio-passos" }, itens.map(p => h("li", { dataset: { feito: p.feito ? "1" : "0" } }, p.rotulo))) : null,
        lista.length ? h("div", { class: "linha vazio-acoes" }, lista.map((a, i) => botao(a, i))) : null));
  }
  const botoes = lista.map((a, i) => botao(a, i));
  return h("div", { class: ["vazio", !ic && !il && "vazio-sem-ic", il && "vazio-tema"], dataset: il ? { tema } : null },
    il || (ic ? h("div", { class: "vazio-ic", "aria-hidden": "true" }, icone(ic)) : null),
    h("div", { class: "vazio-txt" },
      titulo ? h("h2", null, titulo) : null,
      texto ? h("p", null, texto) : null,
      botoes.length ? h("div", { class: "linha vazio-acoes" }, botoes) : null));
}

/** esqueleto(tipo, opcoes) → Node com a forma da tela (as mesmas classes de grade do conteúdo; a troca não desloca).
    tipo: "inicio" | "chat" | "lista" | "kanban" | "ads" | "tabela" | "agenda" | "cartoes" (legado) | "cartao" | "grafico" | "kpi" (plano 50 · A6).
    opcoes: número (= {n}) ou {n, cabecalho}. `cabecalho` (título + subtítulo + ação) vem ligado nas telas inteiras
    (inicio, chat, ads, agenda) e desligado em lista/kanban/tabela/cartoes, que são só o miolo. `cabecalho` também aceita
    {rotulo = false, sub = true, acao = true} para espelhar o ui.cabecalho da tela (sem o rótulo de cima, que a tela nova não tem). */
export function esqueleto(tipo = "lista", opcoes = {}) {
  const o = typeof opcoes === "number" ? { n: opcoes } : (opcoes || {});
  const n = o.n ?? (tipo === "inicio" ? 4 : tipo === "ads" ? 8 : 6);
  const telaInteira = tipo === "inicio" || tipo === "chat" || tipo === "ads" || tipo === "agenda";
  const comCab = !!(o.cabecalho ?? telaInteira);
  const cabOpc = { rotulo: false, sub: true, acao: true, ...(o.cabecalho && typeof o.cabecalho === "object" ? o.cabecalho : {}) };
  const b = cls => h("span", { class: ["sk", cls] });
  const cab = () => h("div", { class: "sk-cab" },
    h("div", { class: "sk-cab-txt" },
      cabOpc.rotulo ? h("div", { class: "sk-rotulo-l" }, b("sk-rotulo")) : null, b("sk-titulo"),
      cabOpc.sub ? h("div", { class: "sk-sub-l" }, b("sk-sub")) : null),
    cabOpc.acao ? b("sk-acao") : null);
  const cartaoKpi = () => h("div", { class: "sk-cartao" }, b("sk-l1"), b("sk-num"), b("sk-l2"));
  const itensLista = k => Array.from({ length: k }, () => h("div", { class: "sk-item" }, h("span", { class: "sk sk-av" }), h("div", { class: "sk-txt" }, b("sk-l1"), b("sk-l2"))));
  // gráfico: 10 barras de alturas fixas (nada aleatório: a forma é a mesma a cada abertura) e uma linha de base
  const ALTURAS = [38, 62, 48, 80, 56, 70, 44, 90, 66, 52];
  const grafico = () => h("div", { class: "sk-cartao sk-grafico" }, b("sk-l1"),
    h("div", { class: "sk-gr-barras", "aria-hidden": "true" }, ALTURAS.slice(0, Math.max(4, Math.min(o.n || 10, 10))).map((a, i) => h("span", { class: "sk sk-gr-b", style: { "--h": `${a}%`, "--i": i } }))),
    h("div", { class: "sk-gr-eixo" }, b("sk-gr-rot"), b("sk-gr-rot"), b("sk-gr-rot")));
  const kpi = () => h("div", { class: "sk-cartao sk-kpi" }, b("sk-l1"), b("sk-num"), h("span", { class: "sk sk-spark" }));
  let corpo;
  if (tipo === "cartoes") corpo = h("div", { class: "sk-cartoes" }, Array.from({ length: n }, cartaoKpi));
  else if (tipo === "cartao") corpo = h("div", { class: "sk-cartao sk-um" }, b("sk-l1"), b("sk-l2"), b("sk-l2 sk-l2-curta"), b("sk-l2"));
  else if (tipo === "grafico") corpo = grafico();
  else if (tipo === "kpi" || tipo === "kpis") corpo = h("div", { class: "sk-kpis" }, Array.from({ length: Math.max(2, Math.min(o.n ?? 4, 6)) }, kpi));
  else if (tipo === "tabela") corpo = h("div", { class: "sk-tabela" }, h("div", { class: "sk-tr sk-th" }, b(), b(), b(), b()),
    Array.from({ length: n }, () => h("div", { class: "sk-tr" }, b(), b(), b(), b())));
  else if (tipo === "kanban") corpo = h("div", { class: "sk-kanban" }, Array.from({ length: Math.max(3, Math.min(n, 6)) }, (_, i) =>
    h("div", { class: "sk-col" }, b("sk-l1"), Array.from({ length: 3 - (i % 2) }, () => h("div", { class: "sk-card" }, b("sk-l1"), b("sk-l2"))))));
  else if (tipo === "inicio") corpo = h("div", { class: "sk-pilha" },
    h("div", { class: "sk-kpis" }, Array.from({ length: Math.max(2, Math.min(n, 6)) }, cartaoKpi)),
    h("div", { class: "grade-2" }, h("div", { class: ["sk-cartao", "sk-grande"] }, b("sk-l1"), b("sk-l2")), h("div", { class: ["sk-cartao", "sk-grande"] }, b("sk-l1"), b("sk-l2"))));
  else if (tipo === "chat") corpo = h("div", { class: "sk-chat" },
    h("div", { class: "sk-chat-lista" }, h("div", { class: "sk-linha-ctl" }, b("sk-chip"), b("sk-chip"), b("sk-chip")), h("div", { class: "sk-lista" }, itensLista(n))),
    h("div", { class: "sk-chat-painel" },
      h("div", { class: "sk-chat-topo" }, h("span", { class: "sk sk-av" }), h("div", { class: "sk-txt" }, b("sk-l1"), b("sk-l2"))),
      b("sk-bolha"), b("sk-bolha fim"), b("sk-bolha"), b("sk-chat-campo")));
  else if (tipo === "ads") corpo = h("div", { class: "sk-pilha" },
    h("div", { class: "sk-linha-ctl" }, b("sk-chip"), b("sk-chip"), b("sk-chip sk-chip-g")),
    h("div", { class: "sk-manchete" }, b("sk-l1"), b("sk-num"), b("sk-l2")),
    h("div", { class: "sk-kpis" }, Array.from({ length: Math.max(2, Math.min(n, 12)) }, cartaoKpi)),
    h("div", { class: ["sk-cartao", "sk-grande"] }, b("sk-l1"), b("sk-l2")));
  else if (tipo === "agenda") corpo = h("div", { class: "sk-pilha" },
    h("div", { class: "sk-linha-ctl" }, b("sk-chip"), b("sk-chip")),
    h("div", { class: "sk-agenda-grade" }, Array.from({ length: 7 }, (_, d) =>
      h("div", { class: "sk-agenda-col" }, b("sk-l1"), Array.from({ length: 2 + (d % 3) }, () => b("sk-card"))))));
  else corpo = h("div", { class: "sk-lista" }, itensLista(n));   // "lista" (e qualquer tipo desconhecido)
  const raiz = h("div", { class: ["esqueleto", `esqueleto-${tipo}`], dataset: { tipo }, "aria-busy": "true" },
    h("span", { class: "sr-only", role: "status" }, "Carregando…"), comCab ? cab() : null, corpo);
  return raiz;
}
export const TIPOS_ESQUELETO = Object.freeze(["inicio", "chat", "lista", "kanban", "ads", "tabela", "agenda", "cartoes", "cartao", "grafico", "kpi"]);

/** trocarEsqueleto(el, conteudo, {ms = 120}) → Promise. `el` é o contêiner que mostra o esqueleto (ou o próprio .esqueleto):
    o esqueleto some em ms e o conteúdo (Node, lista ou null) entra com fade; sem esqueleto na tela, só põe o conteúdo. */
export function trocarEsqueleto(el, conteudo, { ms = 120 } = {}) {
  return new Promise(resolve => {
    if (!el) return resolve(false);
    const itens = (Array.isArray(conteudo) ? conteudo : [conteudo]).flat(Infinity).filter(x => x !== null && x !== undefined && x !== false);
    const proprio = !!(el.classList && el.classList.contains("esqueleto"));
    const alvo = proprio ? el.parentNode : el;
    if (!alvo) return resolve(false);
    const sks = proprio ? [el] : [...alvo.children].filter(c => c.classList && c.classList.contains("esqueleto"));
    const colocar = () => {
      const novos = itens.map(x => (x && x.nodeType ? x : document.createTextNode(String(x))));
      for (const nv of novos) if (nv.nodeType === 1) nv.classList.add("troca-entra");
      if (proprio) { const pai = el.parentNode || alvo; for (const nv of novos) pai.insertBefore(nv, el); el.remove(); }
      else { for (const s of sks) s.remove(); if (!sks.length) limpar(alvo); for (const nv of novos) alvo.appendChild(nv); }
      resolve(true);
    };
    let reduz = false;
    try { reduz = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ok */ }
    if (!sks.length || reduz || !(ms > 0)) return colocar();
    for (const s of sks) s.classList.add("saindo");
    setTimeout(colocar, ms);
  });
}

/* O erro de carregamento tenta de novo sozinho quando a rede volta (evento "orbita:online", disparado pelo rede.js do shell). */
const _erros = new Set();
let _ouvindoOnline = null;       // a função addEventListener em que já nos penduramos (no navegador é sempre a mesma; nos testes cada janela falsa tem a sua)
function aoVoltarOnline() {
  for (const el of [..._erros]) {
    _erros.delete(el);
    if (!el.isConnected) continue;
    const f = el.__tentar;
    if (typeof f === "function") { try { f(); } catch (e) { console.error(e); } }
  }
}
const RE_CODIGO_REDE = /^(sem_conexao|tempo_esgotado|servico_indisponivel|http_(408|429|5\d\d))$/;
/** erroCartao(erro, tentarDeNovo) → Node (texto de api.mensagemErro, sem URL nem jargão). Com `tentarDeNovo`, refaz sozinho em "orbita:online". */
export function erroCartao(erro, tentarDeNovo) {
  const frase = mensagemErro(erro);
  const semRede = RE_ERRO_REDE.test(String((erro && (erro.message || erro.codigo)) || "")) || RE_ERRO_IMPORT.test(String((erro && erro.message) || ""))
    || RE_CODIGO_REDE.test(String((erro && erro.codigo) || "")) || (typeof navigator !== "undefined" && navigator.onLine === false);
  const el = h("div", { class: "vazio vazio-erro", role: "alert" },
    h("div", { class: "vazio-ic", "aria-hidden": "true" }, icone("alerta")),
    h("div", { class: "vazio-txt" },
      h("h2", null, "Não foi possível carregar"),
      h("p", null, frase),
      tentarDeNovo && semRede ? h("p", { class: "vazio-auto" }, "Quando a internet voltar, tentamos de novo sozinhos.") : null,
      tentarDeNovo ? h("div", { class: "linha vazio-acoes" },
        h("button", { type: "button", class: "bt bt-prim", on: { click: tentarDeNovo } }, "Tentar de novo")) : null));
  if (tentarDeNovo) {
    el.__tentar = tentarDeNovo;
    for (const x of [..._erros]) if (!x.isConnected) _erros.delete(x);
    _erros.add(el);
    if (typeof addEventListener === "function" && _ouvindoOnline !== addEventListener) { addEventListener("orbita:online", aoVoltarOnline); _ouvindoOnline = addEventListener; }
  }
  return el;
}

/* ============================================================
   Formulários
   ============================================================ */
function opcoesDe(opcoes) {
  return (opcoes || []).map(o => typeof o === "object" && o !== null ? o : { valor: o, rotulo: String(o) });
}

/* ------------------------------------------------------------
   Máscaras e validação ao vivo (M08). Funções PURAS (testáveis sem DOM) + a ligação em campo().
   ------------------------------------------------------------ */
const SIGNIFICA = { telefone: /\d/, moeda: /[\d,]/ };   // o que conta para manter o cursor no lugar

/** Telefone BR enquanto digita: (12) 99830-3030 · (12) 3456-7890. Aceita +55 colado; "+" de outro país fica só com os dígitos. */
export function formatarTelefone(bruto) {
  const t = String(bruto ?? "").trim();
  let d = t.replace(/\D/g, "");
  if (t.startsWith("+") && !/^\+\s*55/.test(t)) return d ? `+${d.slice(0, 15)}` : "+";
  if (/^\+\s*55/.test(t) || (d.length > 11 && d.startsWith("55"))) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Moeda BR enquanto digita: "1234,5" → "1.234,5"; só uma vírgula, até 2 casas, sem zeros à esquerda; "1234.56" colado vira "1.234,56". */
export function formatarMoeda(bruto) {
  let t = String(bruto ?? "").replace(/[^\d,.]/g, "");
  if (!t.includes(",") && /^\d+\.\d{1,2}$/.test(t)) t = t.replace(".", ",");
  t = t.replace(/\./g, "");
  const i = t.indexOf(",");
  let inteiro = i >= 0 ? t.slice(0, i) : t;
  const dec = i >= 0 ? t.slice(i + 1).replace(/,/g, "").slice(0, 2) : null;
  inteiro = inteiro.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec === null ? inteiro : `${inteiro || "0"},${dec}`;
}

/** mascarar("telefone"|"moeda", textoBruto, posicaoDoCursor, {apagando, anterior}) → {texto, cursor}.
    O cursor acompanha o mesmo caractere útil (dígito, ou dígito/vírgula na moeda) depois da formatação; apagar um separador
    (ex.: o "-" do telefone) apaga o dígito anterior em vez de não fazer nada. */
export function mascarar(tipo, bruto, cursor, { apagando = false, anterior = "" } = {}) {
  const fmt = tipo === "moeda" ? formatarMoeda : formatarTelefone;
  const sig = SIGNIFICA[tipo] || /\d/;
  let texto = String(bruto ?? "");
  const pos = cursor == null ? texto.length : Math.max(0, Math.min(cursor, texto.length));
  let antes = 0;
  for (let i = 0; i < pos; i++) if (sig.test(texto[i])) antes++;
  if (tipo === "moeda" && !texto.includes(",") && /^\d+\.\d{1,2}$/.test(texto.replace(/[^\d.]/g, ""))) {
    const f = fmt(texto); return { texto: f, cursor: f.length };    // "1234.56" colado: cursor no fim
  }
  if (apagando && anterior && texto.length < anterior.length && fmt(texto) === anterior && antes > 0) {
    let k = 0, corte = -1;
    for (let i = 0; i < texto.length; i++) if (sig.test(texto[i]) && ++k === antes) { corte = i; break; }
    if (corte >= 0) { texto = texto.slice(0, corte) + texto.slice(corte + 1); antes--; }
  }
  const formatado = fmt(texto);
  let novo = 0, vistos = 0;
  if (antes > 0) {
    for (; novo < formatado.length; novo++) if (sig.test(formatado[novo]) && ++vistos === antes) { novo++; break; }
    if (vistos < antes) novo = formatado.length;
  }
  return { texto: formatado, cursor: novo };
}

/** 0 vazio · 1 curta (< 8) · 2 razoável · 3 boa · 4 forte */
export function forcaSenha(s) {
  const t = String(s ?? "");
  if (!t) return 0;
  if (t.length < 8) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(t)).length;
  return t.length >= 12 && classes >= 3 ? 4 : t.length >= 10 && classes >= 2 ? 3 : 2;
}
const ROTULOS_FORCA = ["", "Curta", "Razoável", "Boa", "Forte"];

const VALIDADORES = {
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Confira o e-mail (exemplo: nome@empresa.com.br).",
  telefone: v => {
    const d = String(v).replace(/\D/g, "");
    return d.length === 10 || d.length === 11 || (String(v).trim().startsWith("+") && d.length >= 8 && d.length <= 15) ? null
      : "Informe o telefone com DDD, por exemplo (12) 99830-3030.";
  },
  senha: v => v.length >= 8 ? null : "A senha precisa ter pelo menos 8 caracteres.",
  moeda: v => { const n = lerMoeda(v); return n !== null && n >= 0 ? null : "Informe um valor, por exemplo 1.234,56."; },
};

function ligarMascara(entrada, mascara) {
  entrada.dataset.mascara = mascara;          // lerForm: telefone devolve só dígitos (com o «+» inicial de outro país); moeda já vai por data-moeda
  if (mascara === "moeda") entrada.dataset.moeda = "1";
  let anterior = String(entrada.value ?? "");
  entrada.addEventListener("input", ev => {
    const bruto = String(entrada.value ?? "");
    const r = mascarar(mascara, bruto, entrada.selectionStart, { apagando: !!ev && ev.inputType === "deleteContentBackward", anterior });
    if (r.texto !== bruto) {
      entrada.value = r.texto;
      try { entrada.setSelectionRange(r.cursor, r.cursor); } catch { /* tipos sem seleção */ }
    }
    anterior = String(entrada.value ?? "");
  });
}

function ligarContador(w, entrada, max) {
  const c = h("small", { class: "campo-contador", hidden: true });
  w.appendChild(c);
  const atualizar = () => {
    const n = String(entrada.value ?? "").length;
    c.hidden = n < max * 0.8;
    c.textContent = `${n}/${max}`;
    c.dataset.limite = n >= max ? "1" : "0";
  };
  entrada.addEventListener("input", atualizar);
  atualizar();
}

function ligarValidacao(w, entrada, { validar, obrigatorio, tipo, erroEl }) {
  const nome = typeof validar === "string" ? validar : null;
  const fn = typeof validar === "function" ? validar : null;
  const estadoEl = h("small", { class: "campo-estado", "aria-hidden": "true" });
  w.insertBefore(estadoEl, erroEl);
  let medidor = null;
  if (nome === "senha" && tipo === "senha") {
    const barras = h("span", { class: "medidor-seg" }, [0, 1, 2, 3].map(() => h("i")));
    const txt = h("span", { class: "medidor-txt" });
    medidor = h("div", { class: "medidor", role: "meter", "aria-label": "Força da senha", "aria-valuemin": "0", "aria-valuemax": "4", "aria-valuenow": "0", dataset: { nivel: "0" } }, barras, txt);
    w.insertBefore(medidor, estadoEl);
  }
  const verificar = () => {
    const v = String(entrada.value ?? "").trim();
    if (!v) return obrigatorio ? "Preencha este campo." : null;
    if (nome && VALIDADORES[nome]) return VALIDADORES[nome](v);
    if (fn) return fn(v, { el: entrada, campo: w }) || null;
    return null;
  };
  let errou = false;
  const marcar = msg => {
    const v = String(entrada.value ?? "").trim();
    w.dataset.estado = msg ? "erro" : v ? "ok" : "";
    erroEl.textContent = msg || ""; erroEl.hidden = !msg;
    estadoEl.textContent = !msg && v ? "✓ Confere" : "";
    const ids = new Set((entrada.getAttribute("aria-describedby") || "").split(" ").filter(Boolean));
    if (msg) { entrada.setAttribute("aria-invalid", "true"); ids.add(erroEl.id); } else { entrada.removeAttribute("aria-invalid"); ids.delete(erroEl.id); }
    if (ids.size) entrada.setAttribute("aria-describedby", [...ids].join(" ")); else entrada.removeAttribute("aria-describedby");
  };
  const atualizarMedidor = () => {
    if (!medidor) return;
    const nv = forcaSenha(entrada.value);
    medidor.dataset.nivel = String(nv); medidor.setAttribute("aria-valuenow", String(nv));
    medidor.setAttribute("aria-valuetext", ROTULOS_FORCA[nv] || "Vazia");
    medidor.lastChild.textContent = ROTULOS_FORCA[nv];
  };
  w.validar = () => { const m = verificar(); marcar(m); if (m) errou = true; return !m; };
  entrada.addEventListener("blur", () => { w.validar(); });
  entrada.addEventListener("input", () => { if (errou) marcar(verificar()); atualizarMedidor(); });
  atualizarMedidor();
}

/** Valida UM campo criado com `validar` (mostra ✓/!, aria-invalid). → true se está ok. Sem `validar` → true. */
export function validarCampo(campoEl) { return !campoEl || typeof campoEl.validar !== "function" ? true : campoEl.validar(); }
/** Valida todos os campos com `validar` dentro de `raiz`; foca o primeiro com erro. → true se tudo ok. */
export function validarForm(raiz) {
  let primeiro = null;
  for (const c of raiz.querySelectorAll(".campo")) {
    if (typeof c.validar !== "function") continue;
    if (!c.validar() && !primeiro) primeiro = c;
  }
  if (primeiro) {
    const ctl = primeiro.querySelector("input:not([type=hidden]), select, textarea");
    if (ctl) try { ctl.focus({ preventScroll: false }); } catch { /* ok */ }
  }
  return !primeiro;
}

/** campo({rotulo, nome, tipo, valor, opcoes, obrigatorio, ajuda, max, min, placeholder, validar, ...}) → Node
    tipos: texto (padrão), email, senha, tel, numero, moeda, data, datahora, hora, textarea, select,
    interruptor (checkbox), multipla (caixas), cor (paleta + hex), url, busca.
    validar: "telefone" | "email" | "senha" | "moeda" | fn(valor, {el, campo}) → texto de erro (ou vazio se ok).
    Valida ao sair do campo e, depois do 1º erro, a cada tecla (✓/! além da cor, aria-invalid). "telefone" e "moeda" ganham máscara
    com cursor estável (tipo "moeda" já tem a máscara); "telefone" faz lerForm devolver só os dígitos (e o «+» inicial, se houver); "senha" mostra o medidor;
    `max` mostra o contador perto do limite. Use validarCampo(el) / validarForm(raiz) antes de enviar. */
export function campo(o = {}) {
  const { rotulo, nome, tipo = "texto", valor, opcoes, obrigatorio, ajuda, max, min, placeholder, desabilitado, autocomplete,
    linhas = 3, passo, id: idDado, inputmode, paleta, validar } = o;
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

  let ctl, entrada;
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
      inputmode: inputmode || (tipo === "moeda" ? "decimal" : tipo === "tel" || validar === "telefone" ? "tel" : null), dataset: tipo === "moeda" ? { moeda: "1" } : null });
    if (tipo === "moeda" && typeof valor === "number") ctl.value = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (validar === "telefone" && ctl.value) ctl.value = formatarTelefone(ctl.value);
    entrada = ctl;
    if (tipo === "senha") {
      // o ícone acompanha o estado (olho aberto = senha escondida; olho cortado = senha à mostra): o sprite não tem o cortado, então ele é desenhado aqui
      const olhoAberto = icone("olho"), olhoCortado = iconeOlhoCortado();
      const olho = h("button", { type: "button", class: "bt-icone campo-olho", "aria-label": "Mostrar senha", "aria-pressed": "false" }, olhoAberto);
      // `entrada` é o <input>: `ctl` vira o embrulho logo abaixo, e o olho antigo trocava o type do <div> (a senha nunca aparecia)
      olho.addEventListener("click", () => {
        const vis = entrada.type === "password"; entrada.type = vis ? "text" : "password";
        olho.setAttribute("aria-pressed", String(vis)); olho.setAttribute("aria-label", vis ? "Esconder senha" : "Mostrar senha");
        limpar(olho).appendChild(vis ? olhoCortado : olhoAberto);
        try { entrada.focus({ preventScroll: true }); } catch { /* ok */ }
      });
      ctl = h("div", { class: "campo-senha" }, ctl, olho);
    }
  }
  const w = h("div", { class: ["campo", `campo-${tipo}`], dataset: { campo: nome } },
    h("label", { for: id }, rotulo, obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null), ctl, aj, erro);
  entrada = entrada || ctl;
  const mascara = tipo === "moeda" || validar === "moeda" ? "moeda" : validar === "telefone" ? "telefone" : null;
  if (mascara && entrada.addEventListener) ligarMascara(entrada, mascara);
  if (validar !== undefined && validar !== null && validar !== false) ligarValidacao(w, entrada, { validar, obrigatorio, tipo, erroEl: erro });
  if (max && tipo !== "numero" && (tipo === "textarea" || entrada.tagName === "INPUT")) ligarContador(w, entrada, max);
  return w;
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
    // o «+» inicial (número de outro país) fica: sem ele o servidor trataria 10–11 dígitos como brasileiros e poria 55 na frente
    else if (el.dataset.mascara === "telefone") { const t = String(el.value ?? "").trim(); r[n] = (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, ""); }
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
      if (c.dataset && c.dataset.estado === "erro") c.dataset.estado = "";
      for (const x of c.querySelectorAll("[aria-invalid]")) x.removeAttribute("aria-invalid");
    }
    return;
  }
  const c = form.querySelector(`[data-campo="${CSS.escape(nome)}"]`);
  if (!c) return;
  const e = c.querySelector(".campo-erro");
  const ctl = c.querySelector("input:not([type=hidden]), select, textarea");
  if (e) { e.textContent = texto || ""; e.hidden = !texto; }
  if (texto) c.dataset.estado = "erro"; else if (c.dataset.estado === "erro") c.dataset.estado = "";
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
/** tabela({colunas:[{chave, rotulo, render, largura, ordenavel, alinhar}], linhas, aoClicar, selecao, vazio, rotulo, rolagem}) → {el, selecionados(), atualizar(linhas)}
    `rolagem: true` (opcional) põe .tabela-rolavel: no desktop a tabela ganha altura máxima e rola por dentro com o cabeçalho preso. Fica desligado
    por padrão: dentro de uma página que já rola, a caixa com barra própria vira rolagem dupla e esconde o rodapé e a paginação. */
export function tabela({ colunas, linhas = [], aoClicar, selecao = false, vazio: txtVazio = "Nada por aqui.", rotulo, chave = "id", rolagem = false } = {}) {
  let dados = linhas.slice(), ordem = null;
  const marcadas = new Set();
  const tbody = h("tbody");
  const cabs = colunas.map(c => {
    const th = h("th", { scope: "col", style: c.largura ? { width: c.largura } : null, class: c.alinhar === "dir" ? "dir" : null });
    if (c.ordenavel) {
      // aria-sort="none" desde o início: o leitor de tela sabe que a coluna ordena; o ícone vira seta no sentido ativo (CSS por [aria-sort])
      th.setAttribute("aria-sort", "none");
      const b = h("button", { type: "button", class: "th-ord", title: `Ordenar por ${c.rotulo}` }, c.rotulo, icone("ordenar"));
      b.addEventListener("click", () => {
        ordem = ordem && ordem.chave === c.chave ? { chave: c.chave, dir: -ordem.dir } : { chave: c.chave, dir: 1 };
        for (const x of cabs) if (x.hasAttribute("aria-sort")) x.setAttribute("aria-sort", "none");
        th.setAttribute("aria-sort", ordem.dir > 0 ? "ascending" : "descending");
        anunciar(`Ordenado por ${c.rotulo}, ${ordem.dir > 0 ? "crescente" : "decrescente"}.`);
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
  const env = h("div", { class: ["tabela-env", rolagem && "tabela-rolavel"] }, table);

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
/* Variantes semânticas da pílula (plano 50 · A9): o mesmo chip em todas as telas para canal, prioridade e situação.
   A chave entra em `cor` (ex.: pilula("WhatsApp", "whatsapp", {variante: "canal"})); texto nulo usa o rótulo da tabela. */
export const PILULA_CANAIS = Object.freeze({
  whatsapp: { tok: "ok", icone: "whatsapp", rotulo: "WhatsApp" }, meta: { tok: "meta", icone: "meta", rotulo: "Meta" }, instagram: { tok: "meta", icone: "meta", rotulo: "Instagram" },
  facebook: { tok: "meta", icone: "meta", rotulo: "Facebook" }, google: { tok: "google", icone: "google", rotulo: "Google" }, site: { tok: "info", icone: "globo", rotulo: "Site" },
  indicacao: { tok: "prim", icone: "usuario", rotulo: "Indicação" }, telefone: { tok: "neutra", icone: "telefone", rotulo: "Telefone" }, manual: { tok: "neutra", icone: "editar", rotulo: "Manual" },
  anuncio: { tok: "sec", icone: "anuncio", rotulo: "Anúncio" }, importacao: { tok: "neutra", icone: "baixar", rotulo: "Importação" },
  // plano 100 · A8: provedores dos números (nx_canais.provedor) e a origem orgânica do rastreio
  codewords: { tok: "ok", icone: "whatsapp", rotulo: "WhatsApp · CodeWords" }, organico: { tok: "ok", icone: "folha", rotulo: "Orgânico" },
});
/** Origem do contato/negócio (nx_contatos.origem + o que o rastreio classifica): pilula(null, "site", {variante: "origem"}) → «Site» com globo.
    `plataforma` ("meta" | "instagram" | "facebook" | "google") completa o anúncio: «Anúncio · Meta» com o símbolo e a cor da plataforma. */
export const PILULA_ORIGENS = Object.freeze({
  anuncio: { tok: "sec", icone: "anuncio", rotulo: "Anúncio" }, site: { tok: "info", icone: "globo", rotulo: "Site" }, organico: { tok: "ok", icone: "folha", rotulo: "Orgânico" },
  whatsapp: { tok: "ok", icone: "whatsapp", rotulo: "WhatsApp" }, manual: { tok: "neutra", icone: "editar", rotulo: "Manual" }, importacao: { tok: "neutra", icone: "baixar", rotulo: "Importação" },
  formulario: { tok: "prim", icone: "modelo", rotulo: "Formulário" }, indicacao: { tok: "prim", icone: "usuario", rotulo: "Indicação" },
});
const ALIAS_ORIGEM = Object.freeze({ ads: "anuncio", anuncios: "anuncio", lead_anuncio: "anuncio", import: "importacao", importado: "importacao", form: "formulario", lead_form: "formulario", organic: "organico", web: "site" });
const PILULA_PLATAFORMAS = Object.freeze({ meta: { tok: "meta", icone: "meta", rotulo: "Meta" }, instagram: { tok: "meta", icone: "meta", rotulo: "Instagram" }, facebook: { tok: "meta", icone: "meta", rotulo: "Facebook" }, google: { tok: "google", icone: "google", rotulo: "Google" } });
export const PILULA_PRIORIDADES = Object.freeze({
  urgente: { tok: "ruim", rotulo: "Urgente", n: 3 }, alta: { tok: "ruim", rotulo: "Alta", n: 3 }, media: { tok: "aten", rotulo: "Média", n: 2 }, normal: { tok: "neutra", rotulo: "Normal", n: 1 }, baixa: { tok: "neutra", rotulo: "Baixa", n: 1 },
});
export const PILULA_STATUS = Object.freeze({
  ativo: "ok", ligado: "ok", ok: "ok", ganho: "ok", resolvido: "ok", concluido: "ok", conectado: "ok", aprovado: "ok",
  pausado: "aten", pendente: "aten", aguardando: "aten", atrasado: "aten", em_teste: "aten", rascunho: "neutra", desligado: "neutra", inativo: "neutra", arquivado: "neutra",
  erro: "ruim", perdido: "ruim", falhou: "ruim", bloqueado: "ruim", desconectado: "ruim", recusado: "ruim",
  novo: "info", aberto: "info", andamento: "info", info: "info",
});
const chaveDe = v => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]+/g, "_");
/** pilula(texto, cor, {icone, title, class, variante: "status"|"prioridade"|"canal"|"origem", plataforma, tamanho: "p"}) — cor = token ('ok','ruim','aten','info','prim','sec','neutra') ou #RRGGBB do banco;
    com `variante`, `cor` é a chave semântica (ex.: "whatsapp", "alta", "pausado", "site") e a cor sai da tabela; texto nulo usa o rótulo da tabela. */
export function pilula(texto, cor = "neutra", extra = {}) {
  let tok = TOKENS_COR.has(cor) ? cor : null;
  let hex = !tok ? corOk(cor) : null;
  let ic = extra.icone || null, glifo = null;
  const classes = ["pilula"];
  const v = extra.variante;
  if (v === "canal") {
    const c = PILULA_CANAIS[chaveDe(cor)] || PILULA_CANAIS[chaveDe(texto)];
    if (c) { tok = c.tok; hex = null; ic = ic || c.icone; if (texto === null || texto === undefined) texto = c.rotulo; }
    classes.push("pilula-canal");
  } else if (v === "prioridade") {
    const p = PILULA_PRIORIDADES[chaveDe(cor)] || PILULA_PRIORIDADES[chaveDe(texto)];
    if (p) { tok = p.tok; hex = null; if (texto === null || texto === undefined) texto = p.rotulo; glifo = h("i", { class: "pilula-prio", "aria-hidden": "true", dataset: { n: p.n } }, h("b"), h("b"), h("b")); }
    classes.push("pilula-prioridade");
  } else if (v === "status") {
    const st = PILULA_STATUS[chaveDe(cor)];
    if (st) { tok = st; hex = null; }
    classes.push("pilula-status");
  } else if (v === "origem") {
    const chave = chaveDe(cor), base = PILULA_ORIGENS[ALIAS_ORIGEM[chave] || chave] || PILULA_ORIGENS[chaveDe(texto)];
    const plat = extra.plataforma ? PILULA_PLATAFORMAS[chaveDe(extra.plataforma)] : null;
    if (base) {
      const anuncioDaPlataforma = !!plat && base === PILULA_ORIGENS.anuncio;   // só o anúncio herda símbolo e cor da plataforma
      tok = anuncioDaPlataforma ? plat.tok : base.tok; hex = null;
      ic = ic || (anuncioDaPlataforma ? plat.icone : base.icone);
      if (texto === null || texto === undefined) texto = plat ? `${base.rotulo} · ${plat.rotulo}` : base.rotulo;
    }
    classes.push("pilula-origem");
  }
  classes.push(tok ? `pilula-${tok}` : hex ? "pilula-cor" : "pilula-neutra");
  if (extra.tamanho === "p") classes.push("pilula-p");
  if (extra.class) classes.push(extra.class);
  return h("span", { class: classes, style: hex ? { "--cor": hex } : null, title: extra.title || null, dataset: v ? { variante: v } : null },
    glifo, ic ? icone(ic) : null, String(texto ?? ""));
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

/** 8 matizes da paleta bem separados (azul, âmbar, verde, coral, bronze, lilás, verde-azulado, rosa): o avatar mistura cada um com o fundo e
    com o texto do tema, então o mesmo tom é legível no claro e no escuro (plano 50 · A9). */
export const TONS_AVATAR = Object.freeze([0, 2, 4, 5, 7, 9, 10, 11]);
/** tomAvatar(nome, id) → índice 0..11 da paleta: estável pelo NOME (a mesma pessoa tem a mesma cor em qualquer lista); sem nome, pelo id. */
export function tomAvatar(nome, id) {
  const chave = String(nome ?? "").trim().toLowerCase() || String(id ?? "");
  return TONS_AVATAR[hashNum(chave) % TONS_AVATAR.length];
}
/** avatar(nome, id, img?, {tamanho: "p"|"g", estado: "online"|"ausente"|"ocupado"}) — iniciais sobre uma cor estável por nome; `estado` põe o ponto no canto. */
export function avatar(nome, id, img, { tamanho, estado } = {}) {
  const i = tomAvatar(nome, id);
  const el = h("span", { class: ["avatar", tamanho === "g" && "avatar-g", tamanho === "p" && "avatar-p"], style: { "--cor": `var(--pal-${i})` }, "aria-hidden": "true", title: nome || null, dataset: { tom: i } });
  const src = typeof img === "string" && (/^data:image\/(png|jpeg|webp);base64,/.test(img) || /^https:\/\//.test(img)) ? img : null;
  if (src) el.appendChild(h("img", { src, alt: "" }));
  else el.textContent = iniciais(nome);
  if (estado && /^(online|ausente|ocupado)$/.test(estado)) el.appendChild(h("i", { class: ["avatar-estado", `avatar-${estado}`] }));
  return el;
}

/* ============================================================
   Seletores
   ============================================================ */
/** seletorEtiquetas({todas:[{id,nome,cor}], marcadas:[id], aoMudar(ids, {seq}), podeCriar: async nome→{id,nome,cor} | false, rotulo, debounceMs = 300}) → Node
    Plano 100 · A7 [G261]: a tela responde na hora (a etiqueta entra/sai do DOM) e `aoMudar` sai UMA vez depois de `debounceMs` sem toques, com
    `seq` crescente (1, 2, …). Quem salva no servidor guarda o seq do pedido e ignora a resposta cujo seq for menor que `raiz.seqAtual()`
    (resposta antiga não sobrescreve a nova). `raiz.definir(ids)` sincroniza a seleção com o que o servidor devolveu, sem emitir;
    `raiz.marcadas()` lê a seleção; `raiz.emitirAgora()` dispara o que está na pausa (ex.: ao fechar o painel). debounceMs: 0 = emite na hora. */
export function seletorEtiquetas({ todas = [], marcadas = [], aoMudar, podeCriar = false, rotulo = "Etiquetas", debounceMs = 300 } = {}) {
  let catalogo = todas.slice();
  const sel = new Set(marcadas);
  let seq = 0, timer = null;
  const raiz = h("div", { class: "sel-etiq", role: "group", "aria-label": rotulo });
  const botao = h("button", { type: "button", class: "bt bt-fant bt-p sel-etiq-mais" }, icone("etiqueta"), "Etiqueta");
  function emitir() {
    timer = null;
    seq += 1;
    raiz.dataset.seq = String(seq);
    if (aoMudar) aoMudar([...sel], { seq });
  }
  function mudou() {
    desenhar();
    if (!(debounceMs > 0)) { emitir(); return; }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(emitir, debounceMs);
  }
  raiz.seqAtual = () => seq;
  raiz.marcadas = () => [...sel];
  raiz.pendente = () => timer !== null;
  raiz.emitirAgora = () => { if (timer !== null) { clearTimeout(timer); emitir(); } };
  raiz.definir = ids => { sel.clear(); for (const id of Array.isArray(ids) ? ids : []) sel.add(id); desenhar(); };
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
 * abas({itens:[{id, rotulo, n, painel, icone}], ativo, aoMudar(id), rotulo, classe}) → {el, ativar(id), contar(id, n), ativo}
 * É o segmentado "abas" (M05: um segmentado só, com indicador que desliza) com a API de antes: aoMudar também no clique do item já ativo,
 * setas ←→ Home End (roving tabindex), `painel` (elemento) vira role=tabpanel ligado à aba por aria-controls/aria-labelledby,
 * contador separado do rótulo por um espaço («Execuções 3», não «Execuções3» no leitor de tela).
 * As classes antigas (.abas na faixa, .aba em cada item, .abas-n no contador) continuam no DOM como gancho dos CSS dos módulos.
 */
export function abas({ itens = [], ativo, aoMudar, rotulo = "Seções", classe = "" } = {}) {
  const seg = segmentado({
    opcoes: itens.map(it => ({ valor: it.id, rotulo: it.rotulo, contador: it.n, icone: it.icone, painel: it.painel })),
    valor: ativo ?? (itens[0] && itens[0].id), tipo: "abas", rotulo, repetir: true, classe: ["abas", classe].filter(Boolean).join(" "),
    aoMudar: aoMudar ? v => aoMudar(v) : undefined,
  });
  for (const b of seg.querySelectorAll(".seg-op")) b.classList.add("aba");
  for (const n of seg.querySelectorAll(".seg-n")) n.classList.add("abas-n");
  return {
    el: seg, ativar: v => seg.ativar(v), get ativo() { return seg.valor; },
    contar: (id, n) => seg.contar(id, n),
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

/** Plano B do copiar (o navegador recusou navigator.clipboard): <textarea> + execCommand. Com um <dialog> modal aberto o resto da página fica
    inerte (não recebe foco nem seleção), então o textarea entra NO diálogo de cima. Só vale se o foco chegou nele e o navegador disse que copiou:
    antes a tela dizia «copiado» sem ter copiado nada. */
function copiarPorSelecao(texto) {
  const antes = document.activeElement;
  let t = null;
  try {
    t = h("textarea", { class: "sr-only", readonly: true }, String(texto));
    const base = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
    base.appendChild(t);
    try { t.focus({ preventScroll: true }); } catch { t.focus(); }
    t.select();
    return document.activeElement === t && document.execCommand("copy") === true;
  } catch { return false; }
  finally {
    if (t) t.remove();
    if (antes && antes !== t && antes.focus && antes.isConnected) try { antes.focus({ preventScroll: true }); } catch { /* ok */ }
  }
}

/** copiar(texto) → Promise<boolean> (+ aviso "Copiado."). */
export async function copiar(texto, { aviso = "Copiado." } = {}) {
  let ok = false;
  try { await navigator.clipboard.writeText(String(texto)); ok = true; } catch { ok = copiarPorSelecao(texto); }
  if (aviso) toast(ok ? aviso : "Não foi possível copiar. Selecione e copie manualmente.", { tipo: ok ? "ok" : "erro" });
  return ok;
}

/** copiarDepois(promessaDeTexto, {aviso}) → Promise<boolean>. Para um texto que ainda vai chegar (do servidor): chame de forma SÍNCRONA dentro do
    clique, passando a promessa. O navegador só deixa copiar durante o gesto da pessoa; o ClipboardItem aceita a promessa e espera por ela. Sem
    ClipboardItem (ou se ele falhar), espera o texto e cai no copiar(). Texto vazio ou nulo = false, sem aviso. O aviso só aparece quando copiou. */
export async function copiarDepois(promessaDeTexto, { aviso } = {}) {
  const texto = Promise.resolve(promessaDeTexto).then(t => (t === null || t === undefined ? "" : String(t)));
  texto.catch(() => {});                                   // quem chamou trata o erro da própria promessa
  let ok = false;
  try {
    if (typeof ClipboardItem === "function" && navigator.clipboard && typeof navigator.clipboard.write === "function") {
      const blob = texto.then(t => { if (!t) throw new Error("texto_vazio"); return new Blob([t], { type: "text/plain" }); });
      blob.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      ok = true;
    }
  } catch { ok = false; }
  let t = "";
  try { t = await texto; } catch { return false; }
  if (!t) return false;
  if (!ok) ok = await copiar(t, { aviso: null });
  if (ok && aviso) toast(aviso, { tipo: "ok" });
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

/* ============================================================
   Contratos da linguagem visual (frente A, plano de 01/10/2026)
   ============================================================ */
/** pausarEmSegundoPlano(doc) → desligar(). Põe a classe html.aba-oculta enquanto a aba está oculta (o app.css pausa o palco animado ali).
    Roda sozinha ao carregar o ui.js no navegador. */
export function pausarEmSegundoPlano(doc = typeof document !== "undefined" ? document : null) {
  if (!doc || typeof doc.addEventListener !== "function" || !doc.documentElement) return () => {};
  const marcar = () => { try { doc.documentElement.classList.toggle("aba-oculta", !!doc.hidden); } catch { /* sem classList */ } };
  doc.addEventListener("visibilitychange", marcar);
  marcar();
  return () => doc.removeEventListener("visibilitychange", marcar);
}
pausarEmSegundoPlano();

/** sincronizarPalco(doc, loc) → body.palco-vivo ligada só quando a tela pública (#publico) está à vista ou a rota é o Início (hash vazio, "#/" ou "#/inicio").
    Nas outras telas o palco fica parado (M10). Roda ao carregar, a cada hashchange e quando #publico/#app trocam o atributo hidden. */
const RE_ROTA_INICIO = /^(#\/?|#\/inicio([/?].*)?)?$/;
export function sincronizarPalco(doc = typeof document !== "undefined" ? document : null, loc = typeof location !== "undefined" ? location : null) {
  if (!doc || !doc.body || !doc.body.classList) return false;
  const pub = typeof doc.getElementById === "function" ? doc.getElementById("publico") : null;
  const vivo = (!!pub && !pub.hidden) || RE_ROTA_INICIO.test((loc && loc.hash) || "");
  doc.body.classList.toggle("palco-vivo", vivo);
  return vivo;
}
export function ligarPalco(doc = typeof document !== "undefined" ? document : null, janela = typeof window !== "undefined" ? window : null) {
  if (!doc || !janela || typeof janela.addEventListener !== "function") return () => {};
  const sync = () => sincronizarPalco(doc, janela.location);
  janela.addEventListener("hashchange", sync);
  let mo = null;
  try {
    if (typeof MutationObserver === "function" && typeof doc.getElementById === "function") {
      mo = new MutationObserver(sync);
      for (const id of ["publico", "app"]) { const el = doc.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] }); }
    }
  } catch { /* sem MutationObserver: só o hashchange */ }
  sync();
  return () => { janela.removeEventListener("hashchange", sync); if (mo) mo.disconnect(); };
}
ligarPalco();

function movimentoReduzido() {
  try { return typeof matchMedia === "function" && !!matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
const proximoQuadro = f => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(f) : setTimeout(f, 16));

/** cabecalho({rotulo?, titulo, sub?, acoes?, nivel: 1|2}) → <header class="cab">.
    nível 1 gera o <h1> da página (tabindex -1: o shell leva o foco para ele ao navegar); nível 2 gera o <h2> de uma seção.
    `rotulo` é a linha pequena acima (.rotulo); `acoes` é Node ou lista de Nodes (botões à direita). */
export function cabecalho({ rotulo, titulo, sub, acoes, nivel = 1 } = {}) {
  const n2 = nivel === 2;
  const lista = (Array.isArray(acoes) ? acoes : [acoes]).flat(Infinity).filter(x => x !== null && x !== undefined && x !== false);
  return h("header", { class: ["cab", n2 ? "cab-n2" : "cab-n1"] },
    h("div", { class: "cab-txt" },
      rotulo ? h("p", { class: "rotulo cab-rotulo" }, rotulo) : null,
      h(n2 ? "h2" : "h1", { class: "cab-titulo", tabindex: n2 ? null : "-1" }, titulo ?? ""),
      sub ? h("p", { class: "cab-sub" }, sub) : null),
    lista.length ? h("div", { class: "cab-acoes" }, lista) : null);
}

/** segmentado({opcoes:[{valor, rotulo, contador?}], valor, tipo: "abas"|"filtro", aoMudar(valor), rotulo}) → elemento (role=tablist).
    "abas" navegam (pílula neutra); "filtro" muda dados (--c-prim-suave + texto escuro, nunca cheio). O indicador desliza (translateX/width,
    --t-ui; sem animação com movimento reduzido). Setas/Home/End movem e ativam; Enter/Espaço ativam o item em foco; roving tabindex.
    Opção: {valor, rotulo, contador?, icone?, painel?}; `painel` (elemento) vira role=tabpanel ligado à aba por aria-controls/aria-labelledby.
    Extras de configuração: `repetir` (chama aoMudar também ao tocar no item já ativo) e `classe` (classes extras no elemento).
    Extras no elemento: .ativar(valor) (sem chamar aoMudar), .contar(valor, n), .valor, .reposicionar(). */
export function segmentado({ opcoes = [], valor, tipo = "abas", aoMudar, rotulo = "Opções", repetir = false, classe = "" } = {}) {
  const t = tipo === "filtro" ? "filtro" : "abas";
  const itens = opcoes.filter(Boolean);
  let atual = itens.some(o => o.valor === valor) ? valor : (itens[0] ? itens[0].valor : null);
  const ind = h("span", { class: "seg-ind", "aria-hidden": "true" });
  const el = h("div", { class: ["seg", `seg-${t}`, classe], role: "tablist", "aria-label": rotulo }, ind);
  const mapa = new Map();
  for (const it of itens) {
    const n = h("span", { class: "seg-n dado", hidden: it.contador === undefined || it.contador === null }, it.contador ?? "");
    const b = h("button", { type: "button", role: "tab", class: "seg-op", id: novoId("seg"), dataset: { valor: String(it.valor) } },
      it.icone ? icone(it.icone) : null, h("span", { class: "seg-rot" }, it.rotulo), " ", n);
    if (it.painel) {
      if (!it.painel.id) it.painel.setAttribute("id", novoId("painel"));
      b.setAttribute("aria-controls", it.painel.id);
      it.painel.setAttribute("role", "tabpanel");
      it.painel.setAttribute("aria-labelledby", b.id);
    }
    b.addEventListener("click", () => escolher(it.valor, true));
    mapa.set(it.valor, { b, n });
    el.appendChild(b);
  }
  function posicionar() {
    const x = mapa.get(atual);
    if (!x) return;
    const w = x.b.offsetWidth, esq = x.b.offsetLeft;
    if (!w) return;      // ainda sem layout (oculto): o ResizeObserver chama de novo quando aparecer
    el.style.setProperty("--seg-x", `${esq}px`);
    el.style.setProperty("--seg-w", `${w}px`);
    if (!el.classList.contains("seg-pronto")) {
      el.classList.add("seg-pronto");
      if (!movimentoReduzido()) proximoQuadro(() => el.classList.add("seg-anima"));   // a 1ª colocação não desliza desde o zero
    }
  }
  function marcar() {
    for (const [k, { b }] of mapa) { const on = k === atual; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }
    posicionar();
  }
  function escolher(v, usuario) {
    if (!mapa.has(v)) return;
    const mudou = v !== atual;
    atual = v; marcar();
    if (usuario) {
      const b = mapa.get(v).b;
      try { b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: comportamentoRolagem() }); } catch { /* ok */ }
      if ((mudou || repetir) && aoMudar) aoMudar(v);
    }
  }
  el.addEventListener("keydown", ev => {
    const chaves = [...mapa.keys()], bts = [...mapa.values()].map(x => x.b);
    const i = bts.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === "ArrowRight") j = (i + 1) % bts.length; else if (ev.key === "ArrowLeft") j = (i - 1 + bts.length) % bts.length;
    else if (ev.key === "Home") j = 0; else if (ev.key === "End") j = bts.length - 1;
    if (j !== null) { ev.preventDefault(); bts[j].focus(); escolher(chaves[j], true); return; }
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); escolher(chaves[i], true); }
  });
  marcar();
  if (typeof ResizeObserver === "function") { try { new ResizeObserver(() => posicionar()).observe(el); } catch { /* ok */ } }
  try { if (typeof document !== "undefined" && document.fonts && document.fonts.ready) document.fonts.ready.then(posicionar); } catch { /* ok */ }
  proximoQuadro(posicionar);
  el.ativar = v => escolher(v, false);
  el.contar = (v, n) => { const x = mapa.get(v); if (!x) return; x.n.textContent = n ?? ""; x.n.hidden = n === null || n === undefined || n === ""; };
  el.reposicionar = posicionar;
  Object.defineProperty(el, "valor", { get: () => atual, configurable: true });
  return el;
}

/** toqueLongo(el, fn, {ms = 350, mouse = false}) → desligar(). Segurar o dedo (ou a caneta) por `ms` chama fn(ev) e engole o clique que viria
    depois; mexer mais de 10 px, soltar antes ou rolar cancela. Com mouse só se `mouse: true`. Sempre ofereça também um botão visível. */
export function toqueLongo(el, fn, { ms = 350, mouse = false } = {}) {
  let timer = null, x0 = 0, y0 = 0, disparou = false, id = null;
  const cancelar = () => { clearTimeout(timer); timer = null; id = null; };
  const aceita = ev => mouse || (ev.pointerType && ev.pointerType !== "mouse");
  const baixo = ev => {
    if (!aceita(ev) || (ev.button !== undefined && ev.button > 0)) return;
    disparou = false; id = ev.pointerId ?? null; x0 = ev.clientX ?? 0; y0 = ev.clientY ?? 0;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null; disparou = true;
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); } catch { /* ok */ }
      try { fn(ev); } catch (e) { console.error(e); }
      setTimeout(() => { disparou = false; }, 500);
    }, ms);
  };
  const mover = ev => { if (timer && (id === null || ev.pointerId === id) && Math.hypot((ev.clientX ?? 0) - x0, (ev.clientY ?? 0) - y0) > 10) cancelar(); };
  const solto = ev => { if (!disparou) cancelar(); else if (ev && ev.type === "pointercancel") disparou = false; };
  const clique = ev => { if (disparou) { disparou = false; ev.preventDefault(); ev.stopPropagation(); } };
  const menu = ev => { if (timer || disparou) ev.preventDefault(); };
  el.addEventListener("pointerdown", baixo);
  el.addEventListener("pointermove", mover);
  el.addEventListener("pointerup", solto);
  el.addEventListener("pointercancel", solto);
  el.addEventListener("pointerleave", () => { if (!disparou) cancelar(); });
  el.addEventListener("click", clique, true);
  el.addEventListener("contextmenu", menu);
  el.classList.add("toque-longo");
  return () => {
    cancelar();
    el.removeEventListener("pointerdown", baixo); el.removeEventListener("pointermove", mover); el.removeEventListener("pointerup", solto);
    el.removeEventListener("pointercancel", solto); el.removeEventListener("click", clique, true); el.removeEventListener("contextmenu", menu);
    el.classList.remove("toque-longo");
  };
}

/** deslizar(el, {esquerda?, direita?, limiar = 72}) → desligar(). Arrastar o dedo na horizontal: `esquerda` roda ao soltar depois de
    deslizar PARA a esquerda (≥ limiar px), `direita` para a direita. Cada lado é fn(ev) ou {fn, rotulo}. O elemento acompanha o dedo com resistência
    e volta ao lugar; passou do limiar, ganha data-armado="1" (borda de acento: "solte para acionar"); com prefers-reduced-motion
    não anda, só mostra esse aviso. Só assume o gesto se ele começar mais horizontal que vertical (a rolagem vertical segue livre: touch-action pan-y).
    Sempre ofereça também um botão equivalente visível. Mouse não desliza. */
export function deslizar(el, { esquerda, direita, limiar = 72 } = {}) {
  const acao = a => (typeof a === "function" ? a : a && typeof a.fn === "function" ? a.fn : null);
  const fnE = acao(esquerda), fnD = acao(direita);
  let ativo = false, travado = false, x0 = 0, y0 = 0, dx = 0, id = null, moveu = false;
  const resistir = d => { const a = Math.abs(d), s = d < 0 ? -1 : 1; return s * (a <= limiar ? a : limiar + (a - limiar) * 0.3); };
  const aplicar = d => {
    // movimento reduzido: o elemento não anda com o dedo; só ganha o aviso de "armado" (borda de acento) ao passar do limiar
    el.style.setProperty("transform", d && !movimentoReduzido() ? `translateX(${d}px)` : "");
    el.dataset.deslizando = d < 0 ? "esquerda" : d > 0 ? "direita" : "";
    if (Math.abs(d) >= limiar) el.dataset.armado = "1"; else delete el.dataset.armado;
    el.style.setProperty("--dx", `${d}px`);
  };
  const baixo = ev => {
    if (!ev.pointerType || ev.pointerType === "mouse" || (ev.button !== undefined && ev.button > 0)) return;
    ativo = true; travado = false; moveu = false; dx = 0; id = ev.pointerId ?? null; x0 = ev.clientX ?? 0; y0 = ev.clientY ?? 0;
    el.classList.remove("desliza-volta");
  };
  const mover = ev => {
    if (!ativo || (id !== null && ev.pointerId !== id)) return;
    const mx = (ev.clientX ?? 0) - x0, my = (ev.clientY ?? 0) - y0;
    if (!travado) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { ativo = false; return; }          // é rolagem vertical: larga
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.5) return;                        // ainda não é um gesto horizontal claro
      travado = true;
      try { if (el.setPointerCapture && ev.pointerId !== undefined) el.setPointerCapture(ev.pointerId); } catch { /* ok */ }
    }
    dx = mx;
    if ((mx < 0 && !fnE) || (mx > 0 && !fnD)) dx = 0;      // sem ação nesse lado: não se move
    moveu = true;
    aplicar(resistir(dx));
  };
  const fim = ev => {
    if (!ativo) return;
    ativo = false;
    const cancelou = ev && ev.type === "pointercancel";
    const d = dx; dx = 0;
    if (moveu) setTimeout(() => { moveu = false; }, 400);       // um toque simples logo depois não pode ser engolido
    if (travado) {
      el.classList.add("desliza-volta"); aplicar(0);
      if (!cancelou && Math.abs(d) >= limiar) { const f = d < 0 ? fnE : fnD; if (f) try { f(ev); } catch (e) { console.error(e); } }
      try { if (el.releasePointerCapture && ev && ev.pointerId !== undefined) el.releasePointerCapture(ev.pointerId); } catch { /* ok */ }
    }
  };
  const cliqueGesto = ev => { if (moveu) { moveu = false; ev.preventDefault(); ev.stopPropagation(); } };   // o clique que o navegador solta depois do arrasto
  el.addEventListener("pointerdown", baixo);
  el.addEventListener("pointermove", mover);
  el.addEventListener("pointerup", fim);
  el.addEventListener("pointercancel", fim);
  el.addEventListener("click", cliqueGesto, true);
  el.classList.add("deslizavel");
  return () => {
    el.removeEventListener("pointerdown", baixo); el.removeEventListener("pointermove", mover); el.removeEventListener("pointerup", fim);
    el.removeEventListener("pointercancel", fim); el.removeEventListener("click", cliqueGesto, true);
    el.classList.remove("deslizavel", "desliza-volta"); aplicar(0);
  };
}

/* ---- desfazer (M07): ação imediata + toast "Desfazer" + Ctrl/⌘+Z, fila de 3 ---- */
const _desfazer = [];            // mais recente por último
let _ouvindoZ = null;             // o document em que já ouvimos o teclado
function aoTeclaZ(ev) {
  if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey || String(ev.key || "").toLowerCase() !== "z") return;
  if (dentroDeCampo(ev.target)) return;                    // dentro de texto o Ctrl+Z é do navegador
  const item = _desfazer[_desfazer.length - 1];
  if (!item) return;
  ev.preventDefault();
  desfazerItem(item);                                      // marca o item como encerrado ANTES de fechar o toast (o fechamento não vira "mantida")
  if (item.t) item.t.fechar();
}
async function desfazerItem(item) {
  if (item.fim) return;
  item.fim = true;
  const i = _desfazer.indexOf(item); if (i >= 0) _desfazer.splice(i, 1);
  try {
    await item.reverter();
    anunciar("Desfeito.");
    item.resolve({ estado: "desfeita", desfeita: true });
  } catch (e) {
    // não deu para voltar: o estado real é o aplicado — diga isso em vez de fingir que desfez
    toast(`Não foi possível desfazer. ${mensagemErro(e)}`, { tipo: "erro" });
    item.resolve({ estado: "falhou", desfeita: false, erro: e });
  }
}
/** O toast fechou sem desfazer: a ação vale. Com `firmar` (a escrita no servidor que ficou adiada), roda agora; se falhar, volta a tela ao estado real.
    `saida` ({saindo: true}) só vem quando a página está saindo ou foi para segundo plano: a escrita deve ir com keepalive (ctx.api, {keepalive: true}). */
async function manterItem(item, saida = null) {
  if (item.fim) return;
  item.fim = true;
  const i = _desfazer.indexOf(item); if (i >= 0) _desfazer.splice(i, 1);
  if (item.firmar) {
    try { await (saida ? item.firmar(saida) : item.firmar()); }
    catch (e) {
      toast(`Não foi possível concluir. ${mensagemErro(e)}`, { tipo: "erro" });
      try { await item.reverter(); } catch { /* a tela fica como está; o erro já foi dito */ }
      item.resolve({ estado: "falhou", desfeita: false, erro: e });
      return;
    }
  }
  item.resolve({ estado: "mantida", desfeita: false });
}
let _ouvindoSaida = null;          // a função addEventListener em que já pedimos o pagehide
let _ouvindoOculta = null;         // o document em que já pedimos o visibilitychange
/** A página está saindo (pagehide) ou foi para segundo plano (no celular, trocar de app ou bloquear a tela não dispara pagehide, e a aba pode ser
    encerrada sem aviso): firma JÁ o que estava pendente, com {saindo: true} para a escrita sair com keepalive. O aviso «Desfazer» fecha, porque a
    ação passou a valer; se a página continuar viva e a escrita falhar, a tela volta ao estado real como em qualquer firmar. */
function aoSair() {
  for (const item of [..._desfazer]) {
    if (item.fim || !item.firmar) continue;
    manterItem(item, { saindo: true });            // chama item.firmar ainda dentro do evento (o envio precisa sair antes de a página morrer)
    if (item.t) try { item.t.fechar(); } catch { /* saindo da página: melhor esforço */ }
  }
}
function aoOcultar() { if (typeof document !== "undefined" && document.hidden) aoSair(); }
/** acaoComDesfazer({texto, aplicar, reverter, firmar?, ms = 7000}) → Promise<{estado: "mantida"|"desfeita"|"falhou", desfeita, erro?}>.
    Roda `aplicar()` na hora (UI otimista), mostra o toast com "Desfazer" por `ms` e liga Ctrl/⌘+Z (fora de campo de texto) ao mais recente
    (até 3 pendentes: o 4º firma o mais antigo). A promessa só resolve quando o toast fecha (mantida), a pessoa desfaz (desfeita) ou algo falha.
    `aplicar` que falha → toast de erro e estado "falhou" (nada fica pendente); `reverter` que falha → toast de erro dizendo que o estado real é o aplicado.
    `firmar` (opcional) é a escrita REAL adiada: quando `aplicar` só mexe na tela (excluir, mover para Ganho/Perdido…), `firmar` roda se o toast fechar sem
    desfazer e nunca roda se a pessoa desfizer; se falhar, a tela volta (reverter) e o estado é "falhou". Se a página for fechada (pagehide) ou for para
    segundo plano (visibilitychange com document.hidden) com a ação pendente, `firmar({ saindo: true })` roda na hora: use o `saindo` para mandar a
    escrita com {keepalive: true}. Quando o aviso fecha normalmente, `firmar()` é chamada sem argumento. */
export async function acaoComDesfazer({ texto, aplicar, reverter, firmar, ms = 7000, aoCriar } = {}) {
  if (typeof document !== "undefined" && _ouvindoZ !== document) { document.addEventListener("keydown", aoTeclaZ); _ouvindoZ = document; }
  if (typeof addEventListener === "function" && _ouvindoSaida !== addEventListener) { addEventListener("pagehide", aoSair); _ouvindoSaida = addEventListener; }
  if (typeof document !== "undefined" && _ouvindoOculta !== document) { document.addEventListener("visibilitychange", aoOcultar); _ouvindoOculta = document; }
  let resolver;
  const fim = new Promise(r => { resolver = r; });
  const item = { reverter: reverter || (() => {}), firmar: typeof firmar === "function" ? firmar : null, resolve: resolver, fim: false, t: null };
  try {
    if (aplicar) await aplicar();
  } catch (e) {
    toast(mensagemErro(e), { tipo: "erro" });
    return { estado: "falhou", desfeita: false, erro: e };
  }
  while (_desfazer.length >= 3) { const velho = _desfazer[0]; manterItem(velho); if (velho.t) velho.t.fechar(); }
  _desfazer.push(item);
  item.t = toast(texto, { tipo: "info", ms, desfazer: () => desfazerItem(item), aoFechar: motivo => { if (motivo !== "desfazer") manterItem(item); } });
  // aoCriar({firmarAgora}): quem chama pode encerrar o prazo antes (ex.: a gaveta que mostrava o movimento fechou) — firma na hora e o
  // aviso «Desfazer» sai, como quando a página sai (nunca fica um «Desfazer» à vista de algo que já valeu)
  if (typeof aoCriar === "function") {
    try { aoCriar({ firmarAgora: () => { if (item.fim) return; manterItem(item); if (item.t) try { item.t.fechar(); } catch { /* ok */ } } }); } catch { /* ok */ }
  }
  return fim;
}

/* ============================================================
   Plano 50 (04/10/2026) — frente A: KPI, dica, check de sucesso, número compacto
   ============================================================ */
/** numCompacto(1234) → "1,2 mil"; 2500000 → "2,5 mi"; abaixo de mil, o número inteiro. Para KPI onde o espaço é curto. */
export function numCompacto(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return vazioFmt;
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  const um = x => (Math.round(x * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (a >= 1e9) return `${s}${um(a / 1e9)} bi`;
  if (a >= 1e6) return `${s}${um(a / 1e6)} mi`;
  if (a >= 1e3) return `${s}${um(a / 1e3)} mil`;
  return _fmt.num.format(n);
}
const FORMATOS_KPI = {
  int: v => _fmt.num.format(Math.round(v)), num: v => _fmt.num.format(v), moeda: v => brl(v, { centavos: false }), moeda2: v => brl(v),
  pct: v => pct(v), pct1: v => pct(v, 1), compacto: v => numCompacto(v), minutos: v => `${_fmt.num.format(Math.round(v))} min`,
};
/** Variação do KPI: fração (0.12 = +12 %) ou {valor, texto?, sr?, invertido?}. `invertido` = subir é ruim (tempo de espera, custo). */
export function variacaoKpi(v, invertido = false) {
  const x = typeof v === "number" ? { valor: v } : (v && typeof v === "object" ? v : null);
  if (!x || !Number.isFinite(Number(x.valor))) return null;
  const n = Number(x.valor), inv = x.invertido ?? invertido;
  const sinal = n > 0.0005 ? "sobe" : n < -0.0005 ? "desce" : "igual";
  const tom = sinal === "igual" ? "neutra" : ((sinal === "sobe") !== !!inv ? "bom" : "ruim");
  const casas = Math.abs(n) < 0.1 && n !== 0 ? 1 : 0;
  const texto = x.texto || (sinal === "igual" ? "0%" : `${n > 0 ? "+" : "−"}${pct(Math.abs(n), casas)}`);
  const sr = x.sr || (sinal === "igual" ? "sem mudança em relação ao período anterior" : `${sinal === "sobe" ? "subiu" : "caiu"} ${pct(Math.abs(n), casas)} em relação ao período anterior`);
  return { sinal, tom, texto, sr, seta: sinal === "sobe" ? "↑" : sinal === "desce" ? "↓" : "→" };
}
/** kpi({rotulo, valor, formato, variacao, serie, ajuda, invertido, aoClicar, destaque, estimativa}) → <article class="kpi"> (ou <button> com aoClicar).
    Plano 100 · A12 (decisão 5): `estimativa: true` marca o cartão (.kpi-estimado, data-estimativa), põe o selo «estimado» no rótulo, «≈» antes do
    número (CSS) e completa a ajuda com «Valor estimado, não medido.» (a ajuda nasce mesmo sem texto próprio).
    formato: "int" (padrão) | "num" | "moeda" | "moeda2" | "pct" | "pct1" | "compacto" | "minutos" | fn(valor) → texto.
    Número grande em Plex (contado com G.contar quando o tema anima), seta ↑↓ com cor semântica (invertido = subir é ruim), sparkline opcional
    (`serie`, desenhada por G.sparkline) e `ajuda` na dica do «i» (sem title: o tooltip nativo repetia o mesmo texto por cima). No cartão comum
    o «i» é focável (Tab abre a dica; Enter, espaço e o toque também) e o nome dele já diz a ajuda, uma vez só; no cartão-botão (aoClicar) não cabe
    outro controle dentro: a dica é do botão e a ajuda vira a descrição dele. Valor nulo mostra «—» (nunca inventa zero). `el.pronto` resolve
    quando a sparkline e a contagem terminaram de montar (os gráficos carregam sob demanda). */
export function kpi(o = {}) {
  const { rotulo, valor, formato = "int", variacao, serie, ajuda: ajudaDada, invertido = false, aoClicar, destaque, estimativa = false } = o;
  const ajuda = estimativa ? [ajudaDada ? String(ajudaDada).trim() : "", "Valor estimado, não medido."].filter(Boolean).join(" ") : ajudaDada;
  const fmt = typeof formato === "function" ? formato : (FORMATOS_KPI[formato] || FORMATOS_KPI.int);
  const n = Number(valor);
  const temValor = valor !== null && valor !== undefined && valor !== "" && Number.isFinite(n);
  const idAj = ajuda && aoClicar ? novoId("kpi-aj") : null;
  const valorEl = h("p", { class: "kpi-valor dado" }, temValor ? fmt(n) : vazioFmt);
  const varInfo = variacaoKpi(variacao, invertido);
  const varEl = varInfo ? h("p", { class: ["kpi-var", `kpi-var-${varInfo.tom}`], dataset: { sinal: varInfo.sinal } },
    h("span", { class: "kpi-seta", "aria-hidden": "true" }, varInfo.seta), h("span", { "aria-hidden": "true" }, varInfo.texto), h("span", { class: "sr-only" }, varInfo.sr)) : null;
  const temSerie = Array.isArray(serie) && serie.filter(x => Number.isFinite(Number(x))).length >= 2;
  const sparkEl = temSerie ? h("div", { class: "kpi-spark", "aria-hidden": "true" }) : null;
  let ajudaEl = null;
  if (ajuda && !aoClicar) {
    ajudaEl = h("span", { class: "kpi-ajuda", tabindex: "0", role: "button", "aria-label": `Ajuda: ${ajuda}`, dataset: { dica: ajuda } }, icone("info"));
    // Enter, espaço e o toque (que não tem hover) abrem a dica na hora
    ajudaEl.addEventListener("click", () => mostrarDica(ajudaEl, String(ajuda)));
    ajudaEl.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); mostrarDica(ajudaEl, String(ajuda)); } });
  } else if (ajuda) ajudaEl = h("span", { class: "kpi-ajuda", "aria-hidden": "true" }, icone("info"));
  const el = h(aoClicar ? "button" : "article", {
    class: ["kpi", !temValor && "kpi-vazio", aoClicar && "kpi-clicavel", destaque && "kpi-destaque", temSerie && "kpi-com-serie", estimativa && "kpi-estimado"], type: aoClicar ? "button" : null,
    "aria-describedby": idAj, dataset: { formato: typeof formato === "string" ? formato : "fn", dica: idAj ? ajuda : null, estimativa: estimativa ? "1" : null },
  },
    h("p", { class: "kpi-rot rotulo" }, rotulo ?? "", estimativa ? h("span", { class: "kpi-est selo-caps" }, "estimado") : null, ajudaEl),
    h("div", { class: "kpi-corpo" }, h("div", { class: "kpi-num" }, valorEl, varEl), sparkEl),
    // aria-hidden: entra só como descrição do botão, não no nome dele (senão o leitor de tela lia a ajuda duas vezes)
    idAj ? h("span", { class: "sr-only", id: idAj, "aria-hidden": "true" }, ajuda) : null);
  if (aoClicar) el.addEventListener("click", aoClicar);
  el.pronto = graficos().then(G => {
    if (!G) return false;
    if (sparkEl) G.sparkline(sparkEl, { valores: serie, rotulo: String(rotulo || "Série"), area: true });
    if (temValor && n !== 0 && typeof G.contar === "function") G.contar(valorEl, n, fmt);
    return true;
  });
  return el;
}

/* ---- dica (tooltip) genérica: um só elemento role=tooltip para a página, delegado no documento ---- */
let _dicaEl = null, _dicaAlvo = null, _dicaT = null, _dicaVigia = null, _dicaPendente = null, _semTitle = null;
function caixaDica() {
  if (_dicaEl && _dicaEl.isConnected) return _dicaEl;
  _dicaEl = h("div", { class: "dica", role: "tooltip", id: "dica-global", popover: "manual", hidden: true });
  document.body.appendChild(_dicaEl);
  return _dicaEl;
}
/* Enquanto a dica vale para um alvo (agendada pelo mouse ou à mostra), o title dele fica guardado em data-title: senão o tooltip nativo
   do navegador aparece por cima da dica, às vezes com outro texto. Ao fechar, o title volta (se a tela não tiver posto outro nesse meio-tempo). */
function guardarTitle(el) {
  if (_semTitle && _semTitle !== el) devolverTitle();
  if (!el || typeof el.hasAttribute !== "function" || !el.hasAttribute("title")) return;
  el.setAttribute("data-title", el.getAttribute("title"));
  el.removeAttribute("title");
  _semTitle = el;
}
function devolverTitle() {
  const el = _semTitle; _semTitle = null;
  if (!el || !el.hasAttribute("data-title")) return;
  if (!el.hasAttribute("title")) el.setAttribute("title", el.getAttribute("data-title"));
  el.removeAttribute("data-title");
}
function esconderDica() {
  clearTimeout(_dicaT); _dicaT = null; _dicaPendente = null;
  clearInterval(_dicaVigia); _dicaVigia = null;
  devolverTitle();
  if (_dicaAlvo && _dicaAlvo.classList) _dicaAlvo.classList.remove("com-dica");
  _dicaAlvo = null;
  if (!_dicaEl) return;
  _dicaEl.hidden = true;
  if (typeof _dicaEl.hidePopover === "function") try { _dicaEl.hidePopover(); } catch { /* ok */ }
}
function mostrarDica(el, texto) {
  if (!el || !texto || !el.isConnected) return;
  clearTimeout(_dicaT); _dicaT = null; _dicaPendente = null;
  if (_semTitle && _semTitle !== el) devolverTitle();
  if (_dicaAlvo && _dicaAlvo !== el && _dicaAlvo.classList) _dicaAlvo.classList.remove("com-dica");
  const d = caixaDica();
  d.textContent = texto;
  d.hidden = false;
  mostrarNoTopo(d);
  _dicaAlvo = el;
  if (el.classList) el.classList.add("com-dica");
  // o elemento pode sumir sem pointerout nem focusout (troca de rota, lista redesenhada): a dica não pode ficar órfã na tela
  clearInterval(_dicaVigia);
  _dicaVigia = setInterval(() => { if (!_dicaAlvo || !_dicaAlvo.isConnected) esconderDica(); }, 300);
  if (_dicaVigia && typeof _dicaVigia.unref === "function") _dicaVigia.unref();   // Node (testes): o vigia não segura o processo
  try {
    // mede com a caixa no canto: na posição anterior (perto da borda direita, como o «Fechar» das gavetas) ela encolhe, o texto quebra
    // em várias linhas e a conta põe a dica longe do alvo
    d.style.left = "0px"; d.style.top = "0px";
    const m = d.getBoundingClientRect();
    const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, w = m.width || d.offsetWidth || 160, hh = m.height || d.offsetHeight || 32;
    let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(x, vw - w - 8));
    let y = r.top - hh - 8, lado = "cima";
    if (y < 8) { y = Math.min(vh - hh - 8, r.bottom + 8); lado = "baixo"; }
    d.style.left = `${Math.round(x)}px`; d.style.top = `${Math.round(y)}px`; d.dataset.lado = lado;
    d.style.setProperty("--seta-x", `${Math.round(Math.max(10, Math.min(w - 10, r.left + r.width / 2 - x)))}px`);
  } catch { /* sem layout (testes) */ }
}
const SEL_DICA = "[data-dica], .bt-icone[aria-label]";
function textoDaDica(el) { return (el.dataset && el.dataset.dica) || el.getAttribute("aria-label") || ""; }
/** O foco veio do teclado? Gaveta e modal focam o «Fechar» por script e, ao fechar, o foco volta ao botão que os abriu: depois de um clique
    o navegador não marca esse foco como :focus-visible, e a dica não deve abrir sozinha. Navegador sem :focus-visible: abre como antes. */
function focoDeTeclado(el) {
  try { return !el || typeof el.matches !== "function" ? true : el.matches(":focus-visible"); } catch { return true; }
}
let _dicaDoc = null;
/** ligarDicas(doc) — delegação única: tudo que tiver data-dica (ou for .bt-icone com aria-label) ganha dica ao passar o mouse (400 ms) ou focar
    pelo teclado (150 ms; foco por script não abre); toque não abre dica ao encostar (o rótulo já está no aria-label); Esc, clique e rolagem fecham.
    Andar do fundo do botão para o ícone dentro dele não fecha nem reabre a dica. Roda sozinha ao carregar o ui.js. */
export function ligarDicas(doc = typeof document !== "undefined" ? document : null) {
  if (!doc || typeof doc.addEventListener !== "function" || _dicaDoc === doc) return () => {};
  _dicaDoc = doc;
  const alvoDe = ev => { const t = ev.target; return t && typeof t.closest === "function" ? t.closest(SEL_DICA) : null; };
  const sobre = ev => {
    const el = alvoDe(ev);
    if (!el || el === _dicaAlvo || el === _dicaPendente || el.hasAttribute("data-sem-dica")) return;
    const foco = ev.type === "focusin";
    if (!foco && ev.pointerType === "touch") return;
    if (foco && !focoDeTeclado(ev.target)) return;
    clearTimeout(_dicaT);
    _dicaPendente = el;
    // só no mouse: no foco o title continua lá, ele é a descrição que o leitor de tela lê (o tooltip nativo não abre no foco)
    if (!foco) guardarTitle(el);
    _dicaT = setTimeout(() => {
      _dicaT = null; _dicaPendente = null;
      if (el.isConnected) mostrarDica(el, textoDaDica(el)); else devolverTitle();
    }, foco ? 150 : 400);
  };
  const fora = ev => {
    const el = alvoDe(ev);
    if (!el) return;
    // pointerout do fundo do botão para o <svg> filho (ou foco que passa para dentro do mesmo alvo): continua no mesmo alvo
    const para = ev.relatedTarget;
    if (para && para.nodeType && typeof el.contains === "function" && el.contains(para)) return;
    if (el === _dicaAlvo || el === _dicaPendente) esconderDica();
  };
  const fechar = () => esconderDica();
  // rolar só fecha a dica que já está à mostra: focar por Tab rola o elemento para a vista, e isso não pode cancelar a dica que ia abrir
  const aoRolar = () => { if (_dicaEl && !_dicaEl.hidden) esconderDica(); };
  const tecla = ev => { if (ev.key === "Escape") esconderDica(); };
  const janela = doc.defaultView && typeof doc.defaultView.addEventListener === "function" ? doc.defaultView : null;
  doc.addEventListener("pointerover", sobre); doc.addEventListener("focusin", sobre);
  doc.addEventListener("pointerout", fora); doc.addEventListener("focusout", fora);
  doc.addEventListener("pointerdown", fechar, true); doc.addEventListener("keydown", tecla, true); doc.addEventListener("scroll", aoRolar, true);
  // trocar de tela ou de aba do navegador fecha a dica (o botão que a abriu já não está mais ali)
  if (janela) janela.addEventListener("hashchange", fechar);
  doc.addEventListener("visibilitychange", fechar);
  return () => {
    doc.removeEventListener("pointerover", sobre); doc.removeEventListener("focusin", sobre); doc.removeEventListener("pointerout", fora); doc.removeEventListener("focusout", fora);
    doc.removeEventListener("pointerdown", fechar, true); doc.removeEventListener("keydown", tecla, true); doc.removeEventListener("scroll", aoRolar, true);
    if (janela) janela.removeEventListener("hashchange", fechar);
    doc.removeEventListener("visibilitychange", fechar);
    esconderDica(); _dicaDoc = null;
  };
}
ligarDicas();
/** dica(el, texto) → desligar(). Tooltip no hover e no foco (atraso de 400 ms, role=tooltip) com o texto também em aria-describedby
    (só quando difere do nome acessível, para não ler duas vezes). Plano 50 · A10. */
export function dica(el, texto, { descrever = true } = {}) {
  if (!el || !el.dataset || !texto) return () => {};
  el.dataset.dica = String(texto);
  let desc = null;
  const nome = (el.getAttribute("aria-label") || el.textContent || "").trim();
  if (descrever && nome !== String(texto).trim()) {
    desc = h("span", { class: "sr-only", id: novoId("dica") }, String(texto));
    if (el.parentNode) el.parentNode.insertBefore(desc, el.nextSibling); else el.appendChild(desc);
    const ids = new Set((el.getAttribute("aria-describedby") || "").split(" ").filter(Boolean)); ids.add(desc.id);
    el.setAttribute("aria-describedby", [...ids].join(" "));
  }
  return () => {
    delete el.dataset.dica;
    if (_dicaAlvo === el) esconderDica();
    if (desc) {
      const ids = new Set((el.getAttribute("aria-describedby") || "").split(" ").filter(Boolean)); ids.delete(desc.id);
      if (ids.size) el.setAttribute("aria-describedby", [...ids].join(" ")); else el.removeAttribute("aria-describedby");
      desc.remove();
    }
  };
}
/** dicaAberta() → o elemento que tem a dica à mostra agora (ou null): para testes e para a tela saber se deve esperar. */
export function dicaAberta() { return _dicaEl && !_dicaEl.hidden ? _dicaAlvo : null; }

/** checkSucesso(el, {ms = 900, texto}) → Promise<true>. Um ✓ desenhado em 300 ms cobre o botão/cartão e some depois de `ms` (plano 50 · A7);
    `texto` é anunciado ao leitor de tela («Salvo.»). Com movimento reduzido o ✓ aparece sem traço e fica 400 ms. */
export function checkSucesso(el, { ms = 900, texto } = {}) {
  if (!el || !el.appendChild) return Promise.resolve(false);
  const marca = h("span", { class: "ok-check", "aria-hidden": "true" },
    h("svg", { viewBox: "0 0 24 24", focusable: "false" }, h("path", { d: "M5 12.5l4.5 4.5L19 7", pathLength: "1" })));
  el.classList.add("tem-ok-check");
  el.appendChild(marca);
  if (texto) anunciar(String(texto));
  return new Promise(r => setTimeout(() => { marca.remove(); el.classList.remove("tem-ok-check"); r(true); }, movimentoReduzido() ? 400 : ms));
}

/** numMoeda(valor, {centavos = true}) → <span class="num-moeda"> com "R$" e centavos a 60 % (use no lugar de texto "R$ 1.234,56" nos números grandes). */
export function numMoeda(valor, { centavos = true } = {}) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n)) return h("span", { class: "num-moeda" }, "—");
  const neg = n < 0 ? "−" : "";
  const [inteiro, cent] = Math.abs(n).toFixed(2).split(".");
  return h("span", { class: "num-moeda" },
    h("span", { class: "nm-rs" }, "R$"), neg + _fmt.num.format(Number(inteiro)),
    centavos ? h("span", { class: "nm-cent" }, `,${cent}`) : null);
}
