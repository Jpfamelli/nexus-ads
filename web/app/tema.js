/* ============================================================
   ÓRBITA — tema.js (PURO, sem imports) · frente F3 · ESPEC §7.4
   Três cores da marca (primária, secundária, fundo) → todos os
   tokens CSS do app, com guarda de contraste (WCAG 2.x).
   ÚNICO arquivo JS do app que pode ter cor escrita em hex.
   ============================================================ */

export const PRODUTO_PADRAO = "Órbita";

export const PADRAO = Object.freeze({
  produto: PRODUTO_PADRAO,
  cores: Object.freeze({ primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#FAFAF8" }),
});

/** Preferência visual do usuário. `marca` respeita o fundo configurado pela empresa. */
export const ESQUEMAS = Object.freeze({ claro: "claro", escuro: "escuro", marca: "marca" });
export const FUNDOS_ESQUEMA = Object.freeze({ claro: "#FAFAF8", escuro: "#07090C" });
export function coresNoEsquema(cores = {}, esquema = "claro") {
  const modo = Object.hasOwn(ESQUEMAS, esquema) ? esquema : "claro";
  return { ...PADRAO.cores, ...(cores || {}), ...(modo === "marca" ? {} : { fundo: FUNDOS_ESQUEMA[modo] }) };
}

/** 12 cores para etapas, etiquetas e departamentos (Apêndice A + 5). */
export const PALETA = Object.freeze([
  "#6FA3CF", "#8FB8DD", "#E5B35C", "#C9BFAF", "#7FD1A5", "#F08A74", "#9D9486",
  "#B0761F", "#CF9540", "#A98BD6", "#5FB3A8", "#D67FA3",
]);

/** Fundos sugeridos no editor de marca: 5 noturnos (palco) e 3 claros. */
export const FUNDOS = Object.freeze([
  "#07090C", "#0B1416", "#0E1116", "#12100E", "#0A0F1A",
  "#FAFAF8", "#F4F1EA", "#FFFFFF",
]);

const TEXTO_ESCURO = "#F2EEE8";   // texto no esquema escuro
const TEXTO_CLARO = "#141A21";    // texto no esquema claro
const TINTA = "#0B1B2B";          // tinta da marca (texto escuro preferido sobre cor)
const BRANCO = "#FFFFFF";
const PRETO = "#000000";

const FIXOS = {
  escuro: { ok: "#7FD1A5", ruim: "#F08A74", aten: "#E5B35C", info: "#8FB8DD", meta: "#6FA3CF", google: "#CF9540" },
  claro: { ok: "#1E7A4C", ruim: "#B3261E", aten: "#8A5A00", info: "#2B5A80", meta: "#2B5A80", google: "#8A5A00" },
};

const RE_HEX = /^#[0-9a-f]{6}$/i;

/* ---------------- conversões ---------------- */
export function corValida(c) { return typeof c === "string" && RE_HEX.test(c.trim()); }
export function normalizarHex(c) {
  if (typeof c !== "string") return null;
  let s = c.trim();
  if (/^[0-9a-f]{6}$/i.test(s)) s = "#" + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + s.slice(1).split("").map(x => x + x).join("");
  return RE_HEX.test(s) ? s.toUpperCase() : null;
}
function rgb(hex) {
  const h = normalizarHex(hex);
  if (!h) throw new Error("cor_invalida");
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function hexDe([r, g, b]) {
  const p = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return ("#" + p(r) + p(g) + p(b)).toUpperCase();
}
function hsl(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function deHsl([h, s, l]) {
  l = Math.max(0, Math.min(1, l));
  if (s === 0) return hexDe([l * 255, l * 255, l * 255]);
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = x => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < .5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return hexDe([t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255]);
}

/** Luminância relativa (WCAG). */
export function luminancia(hex) {
  const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b;
}
/** Contraste WCAG entre duas cores (1..21). */
export function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
}
/** Mistura: t = quanto de `b` entra (0..1). */
export function misturar(a, b, t) {
  const x = rgb(a), y = rgb(b);
  return hexDe(x.map((v, i) => v + (y[i] - v) * t));
}
/** rgba() de uma cor hex. */
export function rgba(hex, alfa) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${+alfa.toFixed(3)})`;
}
/** Texto legível sobre `bg`: a tinta da marca ou branco; se nenhum chegar a 4,5:1, preto ou branco puro. */
export function corTexto(bg) {
  const cb = contraste(bg, BRANCO), ct = contraste(bg, TINTA);
  const melhor = ct >= cb ? TINTA : BRANCO;
  if (Math.max(cb, ct) >= 4.5) return melhor;
  return contraste(bg, PRETO) >= cb ? PRETO : BRANCO;
}

/** Ajusta a luminosidade (HSL) de `cor` em passos de 4% até ter contraste ≥ `alvo` com `fundo`.
    Tenta primeiro no sentido que afasta do fundo; se não chegar, no outro; último recurso: corTexto(fundo). */
export function ajustarContraste(cor, fundo, alvo = 4.5) {
  if (contraste(cor, fundo) >= alvo) return { cor: normalizarHex(cor), mudou: false };
  const [h, s, l0] = hsl(cor);
  const escuro = luminancia(fundo) < .2;
  for (const dir of escuro ? [1, -1] : [-1, 1]) {
    for (let i = 1; i <= 25; i++) {
      const c = deHsl([h, s, l0 + dir * .04 * i]);
      if (contraste(c, fundo) >= alvo) return { cor: c, mudou: true };
    }
  }
  return { cor: corTexto(fundo), mudou: true };
}

/** Todas as variáveis do app a partir das 3 cores. Nunca lança: cor inválida cai no padrão (com aviso). */
export function derivarTema(cores = {}) {
  const avisos = [];
  const pega = (k, rotulo) => {
    const c = normalizarHex(cores && cores[k]);
    if (c) return c;
    if (cores && cores[k]) avisos.push({ campo: k, texto: `A cor ${rotulo} não é válida; usamos a cor padrão.` });
    return PADRAO.cores[k];
  };
  let fundo = pega("fundo", "de fundo");
  const prim = pega("primaria", "primária");
  const sec = pega("secundaria", "secundária");

  const escuro = luminancia(fundo) < .2;
  const texto = escuro ? TEXTO_ESCURO : TEXTO_CLARO;
  // guarda do fundo: o texto do app precisa de pelo menos 7:1 sobre ele
  if (contraste(texto, fundo) < 7) {
    const [h, s, l0] = hsl(fundo);
    let f = fundo;
    for (let i = 1; i <= 25 && contraste(texto, f) < 7; i++) f = deHsl([h, s, l0 + (escuro ? -.03 : .03) * i]);
    if (contraste(texto, f) < 7) f = escuro ? "#050608" : "#FAFAF8";
    avisos.push({ campo: "fundo", texto: escuro
      ? "O fundo ficou claro demais para o texto claro; usamos um tom mais escuro."
      : "O fundo ficou escuro demais para o texto escuro; usamos um tom mais claro." });
    fundo = f;
  }
  const esq = escuro ? "escuro" : "claro";
  const fx = FIXOS[esq];

  const primLuz = ajustarContraste(prim, fundo);
  if (primLuz.mudou) avisos.push({ campo: "primaria", texto: escuro
    ? "A cor primária ficou escura demais sobre o fundo; usamos um tom mais claro para textos e links."
    : "A cor primária ficou clara demais sobre o fundo; usamos um tom mais escuro para texto." });
  const secLuz = ajustarContraste(sec, fundo);
  if (secLuz.mudou) avisos.push({ campo: "secundaria", texto: escuro
    ? "A cor secundária ficou escura demais sobre o fundo; usamos um tom mais claro para texto."
    : "A cor secundária ficou clara demais sobre o fundo; usamos um tom mais escuro para texto." });
  const primTxt = corTexto(prim);
  // o botão primário fica "apagado" se quase não se destaca do fundo
  if (contraste(prim, fundo) < 1.6) avisos.push({ campo: "primaria", texto: "A cor primária quase some sobre o fundo; os botões vão aparecer pouco." });

  const vars = {
    "--esquema": esq,
    "--c-fundo": fundo,
    "--c-texto": texto,
    "--c-texto-2": misturar(fundo, texto, .72),
    "--c-texto-3": misturar(fundo, texto, .56),
    "--c-sup": misturar(fundo, texto, .05),
    "--c-sup-2": misturar(fundo, texto, .09),
    "--c-sup-3": misturar(fundo, texto, .14),
    "--c-borda": misturar(fundo, texto, .12),
    "--c-borda-2": misturar(fundo, texto, .20),
    "--c-prim": prim,
    "--c-prim-hi": escuro ? misturar(prim, BRANCO, .12) : misturar(prim, PRETO, .12),
    "--c-prim-txt": primTxt,
    "--c-prim-luz": primLuz.cor,
    "--c-prim-suave": misturar(fundo, prim, .16),
    "--c-sec": sec,
    "--c-sec-luz": secLuz.cor,
    "--c-sec-suave": misturar(fundo, sec, .14),
    "--c-foco": primLuz.cor,
    "--c-ok": fx.ok, "--c-ruim": fx.ruim, "--c-aten": fx.aten, "--c-info": fx.info,
    "--c-ok-txt": corTexto(fx.ok), "--c-ruim-txt": corTexto(fx.ruim),
    "--c-ok-suave": misturar(fundo, fx.ok, .16),
    "--c-ruim-suave": misturar(fundo, fx.ruim, .16),
    "--c-aten-suave": misturar(fundo, fx.aten, .16),
    "--c-info-suave": misturar(fundo, fx.info, .16),
    "--c-nota": misturar(fundo, fx.aten, .18),
    "--c-nota-txt": texto,
    "--c-meta": fx.meta, "--c-google": fx.google,
    "--c-bolha-in": misturar(fundo, texto, .09),
    "--c-bolha-out": misturar(fundo, prim, .16),
    // palco e vidro
    "--c-brilho-1": rgba(prim, escuro ? .18 : .08),
    "--c-brilho-2": rgba(sec, escuro ? .12 : .08),
    "--c-vidro": rgba(fundo, escuro ? .72 : .78),
    "--c-vidro-forte": rgba(fundo, .9),
    "--c-veu": escuro ? "rgba(0, 0, 0, .6)" : "rgba(20, 26, 33, .38)",
    "--c-sombra": escuro ? "rgba(0, 0, 0, .55)" : "rgba(20, 26, 33, .16)",
    "--c-tinta": rgba(texto, escuro ? .05 : .04),
    "--c-sel": rgba(prim, .32),
  };
  PALETA.forEach((c, i) => { vars[`--pal-${i}`] = c; });
  return { vars, escuro, avisos };
}

/** Aplica as variáveis num elemento (padrão: <html>) e marca o esquema. */
export function aplicarTema(vars, raiz = globalThis.document && globalThis.document.documentElement) {
  if (!raiz || !vars) return;
  for (const [k, v] of Object.entries(vars)) if (k.startsWith("--") && k !== "--esquema") raiz.style.setProperty(k, v);
  const esq = vars["--esquema"] === "claro" ? "claro" : "escuro";
  if (raiz.dataset) raiz.dataset.esquema = esq;
  if (raiz.style) raiz.style.colorScheme = esq === "claro" ? "light" : "dark";
}

const RE_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Imagem que pode ir para img.src: data:image png/jpeg/webp em base64 ou https://. Nunca SVG. */
export function imagemSegura(u) {
  if (typeof u !== "string" || !u) return null;
  if (RE_IMG.test(u)) return u;
  if (/^https:\/\/[^\s"'<>]+$/i.test(u) && !/\.svg(\?|#|$)/i.test(u)) return u;
  return null;
}

/** Marca efetiva: cores do tema do cliente → cores da org → padrão (chave a chave). */
export function marcaEfetiva(marcaOrg = {}, temaCliente = {}, reserva = {}) {
  const m = marcaOrg || {}, t = temaCliente || {}, r = reserva || {};
  const cor = k => normalizarHex(t.cores && t.cores[k]) || (k === "primaria" && normalizarHex(r.corMarca))
    || normalizarHex(m.cores && m.cores[k]) || PADRAO.cores[k];
  return {
    produto: (typeof m.produto === "string" && m.produto.trim()) || PADRAO.produto,
    logo: imagemSegura(m.logo),
    logo_claro: imagemSegura(m.logo_claro),
    favicon: imagemSegura(m.favicon),
    logo_cliente: imagemSegura(t.logo) || imagemSegura(r.logoUrl),
    logo_cliente_claro: imagemSegura(t.logo_claro),
    cores: { primaria: cor("primaria"), secundaria: cor("secundaria"), fundo: cor("fundo") },
    login_titulo: m.login_titulo || "Anúncio, conversa e venda na mesma órbita.",
    login_texto: m.login_texto || "Entre com o e-mail e a senha que você recebeu.",
    suporte_wa: typeof m.suporte_wa === "string" && /^\d{10,15}$/.test(m.suporte_wa) ? m.suporte_wa : null,
    assinatura: m.assinatura || null,
  };
}

/* ---------------- validação da marca (espelha o servidor: marca_invalida, hint = campo) ---------------- */
export const LIMITES_MARCA = Object.freeze({ produto: 40, logo: 80000, logo_claro: 80000, favicon: 30000,
  login_titulo: 80, login_texto: 200, assinatura: 60 });

/** Devolve [{campo, texto}] (vazio = ok). `soTema` = tema do cliente (só logo, logo_claro e cores). */
export function validarMarca(m = {}, soTema = false) {
  const erros = [];
  const permitidos = soTema ? ["logo", "logo_claro", "cores"]
    : ["produto", "logo", "logo_claro", "favicon", "cores", "login_titulo", "login_texto", "suporte_wa", "assinatura"];
  for (const k of Object.keys(m || {})) if (!permitidos.includes(k)) erros.push({ campo: k, texto: "Campo não aceito." });
  for (const k of ["logo", "logo_claro", "favicon"]) {
    if (m[k] == null || m[k] === "") continue;
    if (!permitidos.includes(k)) continue;
    if (!imagemSegura(m[k])) erros.push({ campo: k, texto: "Use PNG, JPEG ou WebP (nunca SVG)." });
    else if (m[k].startsWith("data:") && m[k].length > LIMITES_MARCA[k]) erros.push({ campo: k, texto: "Imagem grande demais." });
  }
  if (m.cores != null) {
    if (typeof m.cores !== "object") erros.push({ campo: "cores", texto: "Cores inválidas." });
    else for (const k of Object.keys(m.cores)) {
      if (!["primaria", "secundaria", "fundo"].includes(k) || !corValida(m.cores[k])) erros.push({ campo: "cores." + k, texto: "Use uma cor no formato #RRGGBB." });
    }
  }
  if (!soTema) {
    for (const k of ["produto", "login_titulo", "login_texto", "assinatura"]) {
      if (m[k] == null) continue;
      if (typeof m[k] !== "string" || m[k].length > LIMITES_MARCA[k]) erros.push({ campo: k, texto: `Até ${LIMITES_MARCA[k]} caracteres.` });
    }
    if (m.produto != null && typeof m.produto === "string" && m.produto.trim().length < 2) erros.push({ campo: "produto", texto: "Informe o nome do produto." });
    if (m.suporte_wa != null && m.suporte_wa !== "" && !/^\d{10,15}$/.test(String(m.suporte_wa))) erros.push({ campo: "suporte_wa", texto: "Só números, com DDI e DDD (ex.: 5512999998888)." });
  }
  return erros;
}

/** PURO: cores mais frequentes de uma imagem (RGBA), quantizadas; descarta transparente, quase branco/preto e cinza. */
export function coresSugeridas(px, n = 5) {
  const cont = new Map();
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (a < 128) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
    const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
    if (l > .92 || l < .08 || s < .18) continue;
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = cont.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    cont.set(k, e);
  }
  return [...cont.values()].sort((a, b) => b.n - a.n).slice(0, n).map(e => hexDe([e.r / e.n, e.g / e.n, e.b / e.n]));
}

/** Hash curto e estável de um objeto (cache do tema no navegador). */
export function hashCurto(obj) {
  const s = JSON.stringify(obj || {});
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
