/* ============================================================
   ÓRBITA — login.js · frente F3 · ESPEC T1 (§7.7), §5.2
   #/login · #/convite/<token> · #/senha/<token> · #/testar · troca obrigatória
   Sem cadastro aberto (o #/testar só existe quando a marca da org liga
   teste_aberto — plano 1500c · UC-001). A tela nunca pergunta ao servidor
   se um e-mail existe. Marca da org (nx_marca_publica / nx_convite_ver).
   ============================================================ */

let _ctx = null;
const _relogios = new Set();   // contagem regressiva do bloqueio (A9): some ao desmontar
const _limpezas = new Set();   // plano 1500c · UCB-051: ouvintes do claro/escuro do logo (saem no desmontar)

export async function montar(ctx) {
  _ctx = ctx;
  const { rota } = ctx;
  if (rota.modulo === "convite") return telaConvite(ctx, rota.partes[0] || "");
  if (rota.modulo === "senha") return telaSenha(ctx, rota.partes[0] || "");
  if (rota.modulo === "trocar") return telaTrocar(ctx);
  if (rota.modulo === "testar") return telaTestar(ctx);   // plano 1500c · UC-001
  return telaEntrar(ctx);
}

export function desmontar() {
  _ctx = null;
  for (const t of _relogios) clearInterval(t); _relogios.clear();
  for (const f of _limpezas) { try { f(); } catch { /* ok */ } } _limpezas.clear();
}

/** Plano 100 · A9 (contrato 10): `muitas_tentativas` chega com o hint em minutos → segundos de bloqueio (padrão 15 min). */
export function segundosDeBloqueio(e, minutosDoHint) {
  const min = typeof minutosDoHint === "function" ? minutosDoHint(e && e.hint) : null;
  return (min || 15) * 60;
}
/** «14:59» para a contagem regressiva. */
export function formatarContagem(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  // plano 2000d · SX-043: bloqueio de 1 h ou mais em horas («1:15:00», não «75:00»)
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** plano 1500c · UCB-046: segundos que ainda faltam de um bloqueio que termina em `fimMs` (0 = já pode tentar; valor inválido = 0). */
export function restanteBloqueio(fimMs, agoraMs = Date.now()) {
  const f = Number(fimMs), a = Number(agoraMs);
  if (!Number.isFinite(f) || !Number.isFinite(a) || f <= a) return 0;
  return Math.min(24 * 3600, Math.ceil((f - a) / 1000));
}
const CHAVE_BLOQUEIO = "nx-login-bloq";
function lerBloqueio() { try { return Number(sessionStorage.getItem(CHAVE_BLOQUEIO)) || 0; } catch { return 0; } }
function gravarBloqueio(fim) { try { if (fim) sessionStorage.setItem(CHAVE_BLOQUEIO, String(fim)); else sessionStorage.removeItem(CHAVE_BLOQUEIO); } catch { /* sem storage */ } }

/** plano 1500c · UCB-047: o servidor que mandar `restam:N` no hint de credenciais_invalidas → N (senão null). */
export function tentativasRestantes(hint) {
  const m = /restam:(\d{1,2})\b/.exec(String(hint ?? ""));
  return m ? Number(m[1]) : null;
}
/** plano 1500c · UCB-047: a frase do erro de senha com o aviso das tentativas que faltam antes do bloqueio. */
export function fraseSenhaErrada(base, hint) {
  const n = tentativasRestantes(hint);
  if (n === null) return base;
  if (n <= 0) return `${base} A próxima tentativa errada bloqueia a entrada por 15 min.`;
  return `${base} Mais ${n} tentativa${n === 1 ? "" : "s"} antes de bloquear por 15 min.`;
}

/** Plano 1000 (AS-202): a marca é a padrão da plataforma (produto «Órbita» ou sem nome próprio)? Revenda com nome próprio → false. */
export function marcaPadrao(m) {
  const p = String((m && m.produto) || "").trim();
  return !p || p === "Órbita";
}
/** Plano 1000 (AS-291): o e-mail como o servidor compara — sem espaços nas pontas (autopreenchimento) e em minúsculas.
    plano 2000d · SX-047: sem os caracteres invisíveis que vêm junto quando se cola de um PDF/WhatsApp (espaço de largura zero, BOM) e sem o
    ponto final de quem escreveu o e-mail no fim de uma frase («ana@x.com.»). */
export function normalizarEmail(v) {
  // plano 2000d · SX-103: e-mail copiado de um link («mailto:ana@x.com») perde o «mailto:»
  return String(v ?? "").replace(/[​-‍⁠﻿­]/g, "").trim().toLowerCase().replace(/^mailto:/, "").replace(/\.+$/, "");
}
/** plano 2000d · SX-046: o domínio digitado errado dos provedores mais comuns («gmial.com», «hotmail.con») → o e-mail certo para sugerir, ou null. */
const DOMINIOS_COMUNS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "yahoo.com", "icloud.com", "live.com", "uol.com.br", "bol.com.br", "terra.com.br"];
function distanciaCurta(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export function sugestaoEmail(v) {
  const e = normalizarEmail(v);
  const m = /^([^\s@]+)@([^\s@]+)$/.exec(e);
  if (!m) return null;
  const dom = m[2];
  if (DOMINIOS_COMUNS.includes(dom)) return null;
  let melhor = null, menor = 3;
  for (const c of DOMINIOS_COMUNS) { const d = distanciaCurta(dom, c); if (d < menor) { menor = d; melhor = c; } }
  return melhor && menor <= 2 ? `${m[1]}@${melhor}` : null;
}
/** plano 2000d · SX-046: ao sair do campo de e-mail, «Você quis dizer ana@gmail.com?» — um toque corrige; nada é trocado sozinho. */
function ligarSugestaoEmail(ui, entrada) {
  if (!entrada || !entrada.parentNode) return null;
  const caixa = ui.h("p", { class: "entrar-sugestao fraco", role: "status", hidden: true });
  entrada.parentNode.appendChild(caixa);
  const conferir = () => {
    const s = sugestaoEmail(entrada.value);
    ui.limpar(caixa);
    caixa.hidden = !s;
    if (!s) return;
    const bt = ui.h("button", { type: "button", class: "link" }, s);
    bt.addEventListener("click", () => { entrada.value = s; caixa.hidden = true; ui.limpar(caixa); entrada.focus(); });
    caixa.append("Você quis dizer ", bt, "?");
  };
  entrada.addEventListener("blur", conferir);
  entrada.addEventListener("input", () => { if (!caixa.hidden && !sugestaoEmail(entrada.value)) { caixa.hidden = true; ui.limpar(caixa); } });
  return caixa;
}
/** Plano 1000 (AS-195): formato mínimo de e-mail antes de gastar uma tentativa no servidor («ana@» não sai daqui). */
export function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "")); }

/* ---------------- plano 1500c · UCB-044: senha fácil de adivinhar ---------------- */
const SENHAS_COMUNS = new Set(["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344", "102030405060",
  "senha123", "senha1234", "senha12345", "senhasenha", "password", "password1", "password123", "qwerty123", "qwertyui", "asdfghjk", "abc12345",
  "abcd1234", "iloveyou", "admin123", "admin1234", "mudar123", "mudar1234", "brasil123", "orbita123", "teste123", "teste1234", "minhasenha",
  "trocar123", "a1b2c3d4", "1q2w3e4r", "q1w2e3r4", "aaaaaaaa", "zaq12wsx"]);
function sequencia(t) {
  if (t.length < 4) return false;
  if ([...t].every(c => c === t[0])) return true;
  const cod = [...t].map(c => c.codePointAt(0));
  const passo = cod[1] - cod[0];
  return (passo === 1 || passo === -1) && cod.every((c, i) => i === 0 || c - cod[i - 1] === passo);
}
/** senhaFraca(senha, {email, nome}) → true quando a senha é fácil de adivinhar: lista curta das mais usadas, sequência ou repetição
    («12345678», «aaaaaaaa», «abcdefgh»), «senha»/«password» seguida só de números, ou que contém o e-mail (antes do @) ou o nome da pessoa. */
// plano 2000d · DU-219: também recusa a senha que contém o nome da empresa ou do produto («sorriso2026» na Clínica Sorriso)
const PALAVRAS_GENERICAS = new Set(["clinica", "oficina", "loja", "empresa", "consultorio", "odontologia", "mecanica", "comercio", "servicos"]);
export function senhaFraca(senha, { email = "", nome = "", empresa = "", produto = "" } = {}) {
  const t = String(senha ?? "").toLowerCase();
  if (!t) return false;
  if (SENHAS_COMUNS.has(t) || sequencia(t)) return true;
  if (/^(senha|password|orbita|admin|mudar|teste|qwerty)[\d!@#.]*$/.test(t)) return true;
  if (/^(\d{2,4})\1+$/.test(t) || /^([a-z]{2,4})\1+$/.test(t)) return true;
  // plano 2000d · SX-044: linha do teclado («qwertyuiop», «asdfghjkl», «zxcvbnm», «1qaz2wsx»…) com ou sem números no fim
  const semNum = t.replace(/[\d!@#.]+$/, "");
  if (semNum.length >= 6 && ["qwertyuiop", "asdfghjkl", "zxcvbnm", "poiuytrewq", "lkjhgfdsa", "mnbvcxz"].some(l => l.includes(semNum))) return true;
  // plano 2000d · SX-045: data (aniversário) — «15031990», «15/03/1990», «1990-03-15»
  const dig = t.replace(/[/.-]/g, "");
  if (/^\d{8}$/.test(dig) && /^[\d/.-]+$/.test(t)) {
    const dmA = /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(dig), aMd = /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(dig);
    if (dmA || aMd) return true;
  }
  const local = normalizarEmail(email).split("@")[0];
  if (local && local.length >= 4 && t.includes(local)) return true;
  const semAcento = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tSem = semAcento(t);
  for (const pedaco of semAcento(nome).split(/\s+/)) {
    if (pedaco.length >= 4 && tSem.includes(pedaco)) return true;
  }
  for (const pedaco of semAcento(`${empresa} ${produto}`).split(/[^a-z0-9]+/)) {
    if (pedaco.length >= 4 && !PALAVRAS_GENERICAS.has(pedaco) && tSem.includes(pedaco)) return true;
  }
  return false;
}
export const FRASE_SENHA_FRACA = "Essa senha é fácil de adivinhar. Misture palavras, números e símbolos (ex.: Cavalo-azul-77).";

/** plano 1500c · UCB-120: «Vence em 30 min» quando falta pouco (< 2 h); senão null. */
export function avisoValidade(expiraIso, agoraMs = Date.now()) {
  const t = Date.parse(String(expiraIso || ""));
  if (!Number.isFinite(t)) return null;
  const min = Math.ceil((t - agoraMs) / 60000);
  if (min <= 0 || min >= 120) return null;
  return min < 60 ? `Vence em ${min} min — crie o acesso agora.` : `Vence em ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""} — crie o acesso agora.`;
}

/** plano 1500c · UCB-053 + UC-031: o caminho de quem ainda não é cliente, no rodapé da entrada.
    teste_aberto (marca da org) → «Testar grátis» (#/testar); marca padrão com WhatsApp → pedido de teste de 14 dias; revenda com WhatsApp →
    «Fale com <produto>»; sem nada disso, null (nada aparece). → {rotulo, href, externo} */
export function caminhoProspect(m, linkWhatsApp) {
  const marca = m || {};
  if (marca.teste_aberto === true) return { rotulo: "Ainda não usa? Testar grátis", href: "#/testar", externo: false };
  if (!marca.suporte_wa || typeof linkWhatsApp !== "function") return null;
  // plano 2000d · DU-223: sem o nome do produto (a marca da revenda ainda não chegou) o caminho não aparece — nada de «testar o Órbita» errado
  if (!String(marca.produto || "").trim()) return null;
  const dias = diasDeTeste(marca);   // plano 2000d · DU-215
  if (marcaPadrao(marca)) return { rotulo: `Ainda não tem acesso? Peça um teste grátis de ${dias} dias`,
    href: linkWhatsApp(`Olá! Quero testar o ${String(marca.produto).trim()} na minha empresa por ${dias} dias.`, marca.suporte_wa), externo: true };
  const nome = String(marca.produto).trim().slice(0, 40);
  return { rotulo: `Ainda não usa? Fale com ${nome}`, href: linkWhatsApp(`Olá! Quero conhecer o ${nome}.`, marca.suporte_wa), externo: true };
}

/** plano 2000d · DU-215: o prazo do teste da revenda (marca.dias_teste, de nx_marca_publica); sem o dado, 14. */
export function diasDeTeste(m) {
  const n = Number(m && m.dias_teste);
  return Number.isInteger(n) && n > 0 && n <= 90 ? n : 14;
}
/** plano 2000d · DU-224: o último e-mail que entrou neste aparelho (nunca a senha) — só com «Lembrar neste aparelho» marcado. */
export const CHAVE_EMAIL_LEMBRADO = "nx-login-email";
export function lerEmailLembrado(ls, compartilhado = false) {
  if (compartilhado) return "";
  try { const v = ls && ls.getItem(CHAVE_EMAIL_LEMBRADO); return v && emailValido(v) ? v : ""; } catch { return ""; }
}
export function gravarEmailLembrado(ls, email, lembrar) {
  try { const e = normalizarEmail(email); if (lembrar && emailValido(e)) ls.setItem(CHAVE_EMAIL_LEMBRADO, e); else ls.removeItem(CHAVE_EMAIL_LEMBRADO); } catch { /* sem storage */ }
}
/** plano 2000d · DU-229: «A+» — texto 12 % maior no aparelho (vale no app todo; o antes.js aplica antes de pintar). */
export const CHAVE_TEXTO_GRANDE = "nx-texto-grande";
export function alternarTextoGrande(doc = globalThis.document, ls = globalThis.localStorage) {
  const raiz = doc && doc.documentElement;
  if (!raiz) return false;
  const liga = raiz.dataset.texto !== "grande";
  if (liga) raiz.dataset.texto = "grande"; else delete raiz.dataset.texto;
  try { if (liga) ls.setItem(CHAVE_TEXTO_GRANDE, "1"); else ls.removeItem(CHAVE_TEXTO_GRANDE); } catch { /* vale até recarregar */ }
  return liga;
}
/** plano 2000d · DU-217: mais tipos de empresa no teste, cada um levado ao modelo mais próximo (com a nota do que foi escolhido). */
export const TIPOS_EMPRESA_TESTE = Object.freeze([
  Object.freeze({ valor: "odonto", rotulo: "Clínica odontológica", vertical: "odonto" }),
  Object.freeze({ valor: "estetica", rotulo: "Estética ou salão de beleza", vertical: "odonto", nota: "Usa o modelo de clínica: agenda com lembrete e confirmação." }),
  Object.freeze({ valor: "saude", rotulo: "Consultório ou clínica de saúde", vertical: "odonto", nota: "Usa o modelo de clínica: agenda com lembrete e confirmação." }),
  Object.freeze({ valor: "oficina", rotulo: "Oficina mecânica", vertical: "oficina" }),
  Object.freeze({ valor: "loja", rotulo: "Loja", vertical: "loja" }),
  Object.freeze({ valor: "imobiliaria", rotulo: "Imobiliária", vertical: "generico", nota: "Usa o modelo geral, com funil de visita e proposta." }),
  Object.freeze({ valor: "servicos", rotulo: "Prestação de serviços", vertical: "generico", nota: "Usa o modelo geral de atendimento e vendas." }),
  Object.freeze({ valor: "generico", rotulo: "Outro tipo de empresa", vertical: "generico" }),
]);
export function verticalDoTipo(valor) { const t = TIPOS_EMPRESA_TESTE.find(x => x.valor === valor); return t ? t.vertical : "generico"; }
/** plano 2000d: a função do servidor ainda não tem o parâmetro novo (PostgREST: PGRST202/203)? Então o pedido é refeito sem os extras. */
export function funcaoSemAssinatura(e) {
  if (!e) return false;
  if (e.funcaoAusente) return true;
  const code = String((e.resposta && e.resposta.code) || "").toUpperCase();
  return code === "PGRST202" || code === "PGRST203" || /could not find the function/i.test(String(e.codigo || e.message || ""));
}
export async function publicaComExtras(api, nome, base, extras = {}) {
  const limpos = Object.fromEntries(Object.entries(extras || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  if (!Object.keys(limpos).length) return api.publica(nome, base);
  try { return await api.publica(nome, { ...base, ...limpos }); }
  catch (e) { if (funcaoSemAssinatura(e)) return api.publica(nome, base); throw e; }
}
/** plano 2000d · DU-134: segundos de espera antes de «Mandar outro código» (e do «Mandar de novo» do e-mail do teste — DU-216). */
export const ESPERA_REENVIO_CODIGO_S = 30, ESPERA_REENVIO_EMAIL_S = 60;
/** plano 2000d · DU-136: o aparelho confiável (o servidor devolve um token ao marcar «Não pedir código por 30 dias»). */
export const CHAVE_APARELHO = "nx-aparelho-confiavel";
function lerAparelho() { try { return localStorage.getItem(CHAVE_APARELHO) || ""; } catch { return ""; } }
function gravarAparelho(t) { try { if (t) localStorage.setItem(CHAVE_APARELHO, String(t).slice(0, 200)); else localStorage.removeItem(CHAVE_APARELHO); } catch { /* ok */ } }
/** plano 2000d · DU-221: a frase do leitor de tela durante o bloqueio, de minuto em minuto. */
export function fraseMinutosRestantes(segundos) {
  const min = Math.max(1, Math.ceil(Number(segundos) / 60));
  return `Faltam ${min} minuto${min === 1 ? "" : "s"} para tentar de novo.`;
}

/** Toque (celular/tablet): o foco automático abriria o teclado por cima da marca (AS-203). */
function toque() { try { return typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { return false; } }
/** Foca o campo só com mouse/teclado (AS-203). */
function focarDepois(ctx, seletor) {
  if (toque()) return;
  setTimeout(() => { const i = ctx.alvo && ctx.alvo.querySelector(seletor); if (i) i.focus(); }, 60);
}

/** plano 1500c · UCB-041: o rótulo do papel vem do config.js (rotuloPapel, o mesmo do app inteiro); sem ele, o mapa de antes. */
const PAPEL_LOCAL = { gestor: "gestor", admin: "administrador", supervisor: "supervisor", atendente: "atendente", leitura: "somente leitura" };
async function rotuloDoPapel(ctx, papel) {
  // plano 2000d · DU-218: o rótulo vem do rotas.js (já carregado no boot); o config.js (171 KB) só se o shell não mandou
  if (ctx.rotas && typeof ctx.rotas.rotuloPapel === "function") return ctx.rotas.rotuloPapel(papel, { minusculo: true });
  try {
    const cfg = await import(`./config.js?v=${encodeURIComponent(ctx.versao || "dev")}`);
    if (cfg && typeof cfg.rotuloPapel === "function") return cfg.rotuloPapel(papel, { minusculo: true });
  } catch { /* sem o config.js (offline): o mapa local */ }
  return PAPEL_LOCAL[papel] || papel;
}

/* ---------------- moldura: arte editorial + cartão ---------------- */
/** plano 1500c · UCB-051: qual logo vale no esquema da tela (escuro → logo; claro → logo_claro, ou o logo). */
export function logoDoEsquema(m, escuro) { return escuro ? (m && m.logo) : ((m && (m.logo_claro || m.logo)) || null); }
function moldura(ctx, { titulo, sub, cartao, marca }) {
  const { ui } = ctx;
  const h = ui.h;
  const m = marca || ctx.marca || {};
  const escuroAgora = () => typeof document !== "undefined" && document.documentElement && document.documentElement.dataset.esquema !== "claro";
  const logo = logoDoEsquema(m, escuroAgora());
  const nomeProd = h("span", null, m.produto || "Órbita");
  let imgLogo = null;
  const marcaEl = h("div", { class: "entrar-marca" },
    logo ? (() => {
      const i = h("img", { src: logo, alt: "" });
      imgLogo = i;
      // logo largo (já traz o nome escrito): não repete o nome do produto ao lado
      i.addEventListener("load", () => { if (i.naturalWidth > i.naturalHeight * 1.6) { i.classList.add("largo"); nomeProd.classList.add("sr-only"); } });
      return i;
    })() : h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })),
    nomeProd);
  // plano 1500c · UCB-051: o aparelho trocou claro/escuro com a tela aberta (ou o shell repintou o esquema) → o logo acompanha
  if (imgLogo && m.logo_claro && m.logo !== m.logo_claro) {
    const trocar = () => { const novo = logoDoEsquema(m, escuroAgora()); if (novo && imgLogo.getAttribute("src") !== novo) imgLogo.setAttribute("src", novo); };
    try {
      const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
      if (mq && typeof mq.addEventListener === "function") {
        const f = () => setTimeout(trocar, 0);   // o shell repinta o data-esquema no mesmo evento
        mq.addEventListener("change", f); _limpezas.add(() => mq.removeEventListener("change", f));
      }
      if (typeof MutationObserver === "function" && document.documentElement) {
        const obs = new MutationObserver(trocar);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-esquema"] });
        _limpezas.add(() => obs.disconnect());
      }
    } catch { /* navegador antigo: vale o logo da abertura */ }
  }
  const t = String(titulo || "").trim();
  const i = t.lastIndexOf(" ");
  const tituloEl = h("p", { class: "entrar-titulo" }, i > 0 ? [t.slice(0, i + 1), h("em", null, t.slice(i + 1))] : t);
  // plano 1000 (AS-202): a régua «Anúncio · Conversa · Venda» e as pílulas são o discurso da Órbita — numa marca de revenda não aparecem
  const padrao = marcaPadrao(m);
  const arte = h("section", { class: "entrar-arte", "aria-label": m.produto || "Órbita" },
    marcaEl,
    padrao ? h("p", { class: "entrar-regua", "aria-hidden": "true" }, h("i"), h("span", { class: "selo-caps" }, "Anúncio · Conversa · Venda")) : null,   // régua editorial acima da manchete (plano 50 · A14)
    tituloEl,
    sub ? h("p", { class: "entrar-sub" }, sub) : null,
    h("div", { class: "entrar-orbita", "aria-hidden": "true" }, h("i", { class: "o1" }), h("i", { class: "o2" }), h("i", { class: "p" }), h("i", { class: "l l1" }), h("i", { class: "l l2" }), h("i", { class: "l l3" })),
    padrao ? h("div", { class: "entrar-pontos", "aria-hidden": "true" },
      ui.pilula("WhatsApp oficial", "prim", { icone: "whatsapp" }), ui.pilula("Funil de vendas", "sec", { icone: "funil" }), ui.pilula("Retorno do anúncio", "neutra", { icone: "anuncio" })) : null);
  return h("main", { class: "entrar", id: "vista-publica" }, arte, cartao);
}

function caixaMsg(ui) { return ui.h("p", { class: "entrar-erro", role: "alert", hidden: true }); }
function mostrar(el, texto) { el.textContent = texto || ""; el.hidden = !texto; }

/** Plano 1000 (AS-201): o caminho de «Esqueci a senha». Sem WhatsApp de suporte na marca, quem é o único administrador não fica sem saída:
    a frase aponta para quem fornece o sistema (a revenda/plataforma da marca deste endereço). */
export function textosEsqueci(ctx, m) {
  const base = "Peça ao administrador da sua empresa um link para criar uma senha nova.";
  if (m && m.suporte_wa) return [base];
  const org = ctx && ctx.marcaPublica && ctx.marcaPublica.org && ctx.marcaPublica.org.nome;
  const quem = org ? `a equipe da ${String(org).slice(0, 80)}` : `quem fornece o ${(m && m.produto) || "Órbita"} para a sua empresa`;
  return [base, `Se você é o administrador, fale com ${quem}: só a plataforma gera um link novo para o administrador.`];
}

/** plano 1500c · UCB-048: «Avisar o administrador» pela própria tela — só quando a marca diz que o servidor tem o pedido (pedir_senha: true);
    a resposta é sempre a mesma frase (não revela se o e-mail existe). Sem a RPC (servidor atual), o formulário nem aparece. */
export const FRASE_PEDIDO_SENHA = "Se o e-mail estiver cadastrado, o administrador foi avisado.";
function formPedirSenha(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const msg = h("p", { class: "entrar-ok", role: "status", hidden: true });
  const f = h("form", { class: "entrar-form entrar-pedido", novalidate: true },
    ui.campo({ rotulo: "Seu e-mail", nome: "email_pedido", tipo: "email", autocomplete: "username", inputmode: "email" }),
    h("button", { type: "submit", class: "bt bt-sec bt-bloco" }, "Avisar o administrador"), msg);
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(f, null);
    const email = normalizarEmail(ui.lerForm(f).email_pedido);
    if (!emailValido(email)) return ui.marcarErro(f, "email_pedido", "Confira o e-mail (exemplo: nome@empresa.com.br).");
    const bt = f.querySelector("button[type=submit]");
    try { await ui.carregando(bt, api.publica("nx_senha_pedir", { p_email: email })); mostrar(msg, FRASE_PEDIDO_SENHA); }
    catch (e) {
      if (e && (e.codigo === "credenciais_invalidas" || e.codigo === "conta_pendente" || e.codigo === "dados_invalidos")) mostrar(msg, FRASE_PEDIDO_SENHA);
      else mostrar(msg, api.mensagemErro(e));
    }
  });
  return f;
}

/* ---------------- #/login ---------------- */
function telaEntrar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Entrar");
  const erro = caixaMsg(ui);
  // o botão mostra o que está acontecendo («Entrando…» com o giro ao lado) em vez de sumir o texto (plano 50 · A14)
  const rotuloBt = h("span", { class: "bt-rotulo" }, "Entrar");
  const botao = h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco bt-carrega" }, rotuloBt);
  // plano 1000 (AS-185): «Lembrar neste aparelho» desmarcado = aparelho compartilhado — as respostas guardadas (contatos, telefones) ficam só na
  // memória da aba, nunca no disco do aparelho
  // plano 2000d · DU-225: diz também que a conta sai sozinha depois de 2 h sem uso
  const lembrar = typeof ctx.aparelhoCompartilhado === "function"
    ? ui.campo({ rotulo: "Lembrar neste aparelho", nome: "lembrar", tipo: "checkbox", valor: !ctx.aparelhoCompartilhado(),
      ajuda: "Desmarque em computador compartilhado: os dados da tela não ficam guardados aqui e a conta sai sozinha depois de 2 h sem uso." }) : null;
  // plano 2000d · DU-224: o último e-mail que entrou aqui já vem preenchido (aparelho compartilhado não guarda)
  let lsLocal = null; try { lsLocal = typeof localStorage !== "undefined" ? localStorage : null; } catch { lsLocal = null; }
  const emailLembrado = lerEmailLembrado(lsLocal, typeof ctx.aparelhoCompartilhado === "function" ? !!ctx.aparelhoCompartilhado() : false);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "username", obrigatorio: true, inputmode: "email", valor: emailLembrado }),
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
    lembrar,
    erro,
    botao);
  ligarSugestaoEmail(ui, form.querySelector("input[name=email]"));   // plano 2000d · SX-046
  const esqueci = h("button", { type: "button", class: "link", "aria-expanded": "false" }, "Esqueci a senha");
  const ajuda = h("div", { class: "aviso", hidden: true, role: "status" }, ui.icone("info"),
    h("div", { class: "pilha-p" }, textosEsqueci(ctx, m).map(t => h("p", null, t)),
      m.pedir_senha === true ? formPedirSenha(ctx) : null,   // plano 1500c · UCB-048
      m.suporte_wa ? h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp("Olá! Preciso de ajuda para entrar no sistema.", m.suporte_wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null));
  esqueci.addEventListener("click", () => { ajuda.hidden = !ajuda.hidden; esqueci.setAttribute("aria-expanded", String(!ajuda.hidden)); });
  // plano 100 · A9: depois da 3ª senha errada o caminho de recuperação fica em destaque e já aberto (quem erra 3 vezes não lembra a senha)
  let falhas = 0;
  const destacarEsqueci = () => {
    esqueci.classList.add("entrar-destaque");
    if (ajuda.hidden) { ajuda.hidden = false; esqueci.setAttribute("aria-expanded", "true"); }
  };
  // bloqueio por tentativas (contrato 10): o botão espera o prazo com a contagem visível; o leitor de tela ouve a frase uma vez (a contagem é aria-hidden)
  const contagem = h("span", { class: "entrar-contagem dado", "aria-hidden": "true" });
  // plano 2000d · DU-221: o leitor de tela ouve quanto falta de minuto em minuto (a contagem por segundo continua escondida dele)
  const faltaSr = h("span", { class: "sr-only entrar-falta", role: "status", "aria-live": "polite" });
  const bloquearPor = (segundos, frase) => {
    let restam = Math.max(1, Math.round(segundos));
    botao.disabled = true;
    // plano 1500c · UCB-046: o fim do bloqueio fica na aba (sessionStorage): recarregar a página não libera o botão antes da hora
    gravarBloqueio(Date.now() + restam * 1000);
    mostrar(erro, frase);
    erro.append(" ", contagem);
    if (!faltaSr.isConnected) form.appendChild(faltaSr);
    faltaSr.textContent = fraseMinutosRestantes(restam);
    const pintar = () => { contagem.textContent = `(${formatarContagem(restam)})`; };
    pintar();
    const t = setInterval(() => {
      restam -= 1;
      if (restam > 0 && restam % 60 === 0) faltaSr.textContent = fraseMinutosRestantes(restam);
      if (restam > 0) { pintar(); return; }
      faltaSr.textContent = "";
      clearInterval(t); _relogios.delete(t);
      gravarBloqueio(0);
      botao.disabled = false;
      mostrar(erro, "Pode tentar de novo.");
      // plano 1000 (AS-200): o foco volta ao campo de senha e o leitor de tela ouve que já pode tentar
      const s = form.querySelector("input[name=senha]");
      if (s && s.isConnected) try { s.focus({ preventScroll: true }); } catch { s.focus(); }
      if (typeof ui.anunciar === "function") ui.anunciar("Pode tentar de novo.");
    }, 1000);
    _relogios.add(t);
    destacarEsqueci();
  };
  const bloquear = e => bloquearPor(segundosDeBloqueio(e, api.minutosDoHint), api.mensagemErro(e));

  /** plano 1500c · UCB-049: conta com verificação em duas etapas — o servidor devolve {precisa_codigo, desafio} e o 2º passo pede o código. */
  /* plano 2000d · DU-134 (reenviar com espera), DU-135 (6 números enviam sozinhos), DU-133 (código de recuperação, quando o servidor
     oferece — `extras.recuperacao`), DU-136 («não pedir neste aparelho por 30 dias», quando o servidor oferece — `extras.lembrar_aparelho`) */
  const pedirCodigo = (desafio, opcoesEntrada, extras = {}) => {
    const erroC = caixaMsg(ui);
    let modoRecuperacao = false;
    const campoCodigo = ui.campo({ rotulo: "Código de verificação", nome: "codigo", inputmode: "numeric", autocomplete: "one-time-code", obrigatorio: true, max: 8,
      ajuda: extras.ajuda || "O código de 6 números que chegou no seu WhatsApp ou no app autenticador." });
    const lembrarAparelho = extras.lembrar_aparelho === true
      ? ui.campo({ rotulo: "Não pedir código neste aparelho por 30 dias", nome: "lembrar_aparelho", tipo: "checkbox", valor: false,
        ajuda: "Só em aparelho seu. Trocar a senha desfaz." }) : null;
    const okC = h("p", { class: "entrar-ok", role: "status", hidden: true });
    const fc = h("form", { class: "entrar-form", novalidate: true }, campoCodigo, lembrarAparelho, erroC, okC,
      h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Confirmar e entrar"));
    const voltar = h("a", { class: "link", href: "#/login" }, "Voltar");
    voltar.addEventListener("click", ev => { ev.preventDefault(); telaEntrar(ctx); });
    // DU-134: «Mandar outro código» depois de 30 s, com a contagem no próprio botão
    const reenviar = h("button", { type: "button", class: "link entrar-reenviar", disabled: true });
    let espera = ESPERA_REENVIO_CODIGO_S, relogio = null;
    const pintarReenvio = () => { reenviar.textContent = espera > 0 ? `Mandar outro código em ${espera} s` : "Mandar outro código"; reenviar.disabled = espera > 0; };
    const contar = () => {
      espera = ESPERA_REENVIO_CODIGO_S; pintarReenvio();
      if (relogio) { clearInterval(relogio); _relogios.delete(relogio); }
      relogio = setInterval(() => { espera -= 1; pintarReenvio(); if (espera <= 0) { clearInterval(relogio); _relogios.delete(relogio); relogio = null; } }, 1000);
      _relogios.add(relogio);
    };
    reenviar.addEventListener("click", async () => {
      if (espera > 0) return;
      mostrar(erroC, ""); mostrar(okC, "");
      try {
        await ui.carregando(reenviar, api.publica("nx_entrar_codigo_reenviar", { p_desafio: desafio }));
        mostrar(okC, "Mandamos um código novo. O anterior deixou de valer.");
        contar();
      } catch (e) {
        if (funcaoSemAssinatura(e)) { reenviar.hidden = true; mostrar(erroC, "Se o código não chegar, volte e entre de novo para receber outro."); return; }
        mostrar(erroC, api.mensagemErro(e)); contar();
      }
    });
    contar();
    // DU-133: o código de recuperação (para quem perdeu o celular) — só quando o servidor diz que a conta tem códigos
    const recuperar = extras.recuperacao === true ? h("button", { type: "button", class: "link" }, "Usar um código de recuperação") : null;
    if (recuperar) recuperar.addEventListener("click", () => {
      modoRecuperacao = !modoRecuperacao;
      const inp = fc.querySelector("input[name=codigo]");
      const rot = campoCodigo.querySelector("label");
      if (rot && rot.firstChild) rot.firstChild.textContent = modoRecuperacao ? "Código de recuperação" : "Código de verificação";
      if (inp) { inp.value = ""; inp.setAttribute("inputmode", modoRecuperacao ? "text" : "numeric"); inp.setAttribute("autocomplete", modoRecuperacao ? "off" : "one-time-code"); inp.setAttribute("maxlength", modoRecuperacao ? "14" : "8"); }
      recuperar.textContent = modoRecuperacao ? "Usar o código do celular" : "Usar um código de recuperação";
      reenviar.hidden = modoRecuperacao;
    });
    let enviando = false, autoEnviou = false;
    const enviar = async () => {
      if (enviando) return;
      mostrar(erroC, ""); mostrar(okC, "");
      ui.marcarErro(fc, null);
      const d = ui.lerForm(fc);
      const bruto = String(d.codigo || "");
      const codigo = modoRecuperacao ? bruto.toUpperCase().replace(/[^A-Z0-9]/g, "") : bruto.replace(/\D/g, "");
      if (!modoRecuperacao && codigo.length < 6) return ui.marcarErro(fc, "codigo", "Digite os 6 números do código.");
      if (modoRecuperacao && codigo.length < 8) return ui.marcarErro(fc, "codigo", "Digite o código de recuperação inteiro (8 letras e números ou mais).");
      enviando = true;
      try {
        const bt = fc.querySelector("button[type=submit]");
        const r2 = await ui.carregando(bt, modoRecuperacao
          ? api.publica("nx_entrar_recuperacao", { p_desafio: desafio, p_codigo: codigo })
          : publicaComExtras(api, "nx_entrar_codigo", { p_desafio: desafio, p_codigo: codigo }, { p_lembrar: d.lembrar_aparelho === true ? true : null }));
        if (!r2 || !r2.token) throw Object.assign(new Error("codigo_invalido"), { codigo: "codigo_invalido" });
        if (r2.aparelho) gravarAparelho(r2.aparelho);   // DU-136
        await ctx.aoEntrar(r2.token, opcoesEntrada);
      } catch (e) {
        if (e && (e.codigo === "codigo_invalido" || e.codigo === "credenciais_invalidas")) {
          ui.marcarErro(fc, "codigo", modoRecuperacao ? "Código de recuperação incorreto ou já usado." : "Código incorreto ou vencido. Confira e tente de novo.");
          const c = fc.querySelector("input[name=codigo]"); if (c) c.value = "";
          autoEnviou = false;
        } else mostrar(erroC, api.mensagemErro(e));
      } finally { enviando = false; }
    };
    fc.addEventListener("submit", ev2 => { ev2.preventDefault(); enviar(); });
    // DU-135: os 6 números completos (digitados ou sugeridos pelo celular) enviam sozinhos, uma vez
    const inpCodigo = fc.querySelector("input[name=codigo]");
    if (inpCodigo) inpCodigo.addEventListener("input", () => {
      if (modoRecuperacao || autoEnviou) return;
      if (String(inpCodigo.value || "").replace(/\D/g, "").length === 6) { autoEnviou = true; enviar(); }
    });
    ui.limpar(cartao);
    cartao.append(h("h1", { id: "t-entrar", tabindex: "-1" }, extras.titulo || "Confirme que é você"),
      h("p", { class: "sub" }, extras.sub || "Sua conta pede um código de verificação além da senha."), fc,
      h("div", { class: "entrar-rodape" }, voltar, reenviar, recuperar));
    const t = cartao.querySelector("h1"); if (t) try { t.focus({ preventScroll: true }); } catch { t.focus(); }
  };

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (botao.disabled) return;
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const email = normalizarEmail(d.email);
    if (!email) return ui.marcarErro(form, "email", "Informe o e-mail.");
    // AS-195: «ana@» não vai ao servidor (não conta tentativa nem aproxima o bloqueio)
    if (!emailValido(email)) return ui.marcarErro(form, "email", "Confira o e-mail (exemplo: nome@empresa.com.br).");
    if (!d.senha) return ui.marcarErro(form, "senha", "Informe a senha.");
    const bt = form.querySelector("button[type=submit]");
    rotuloBt.textContent = "Entrando…";
    const opcoesEntrada = lembrar ? { compartilhado: d.lembrar === false } : {};
    gravarEmailLembrado(lsLocal, email, lembrar ? d.lembrar !== false : true);   // plano 2000d · DU-224
    try {
      // plano 2000d · DU-136: o aparelho confiável vai junto (servidor sem o parâmetro: o pedido é refeito sem ele)
      const r = await ui.carregando(bt, publicaComExtras(api, "nx_entrar", { p_email: email, p_senha: d.senha }, { p_aparelho: lerAparelho() || null }));
      if (r && r.precisa_codigo && r.desafio) {   // UCB-049
        rotuloBt.textContent = "Entrar";
        pedirCodigo(String(r.desafio), opcoesEntrada, { recuperacao: r.recuperacao === true, lembrar_aparelho: r.lembrar_aparelho === true });
        return;
      }
      if (!r || !r.token) throw Object.assign(new Error("credenciais_invalidas"), { codigo: "credenciais_invalidas" });
      rotuloBt.textContent = "Abrindo…";
      // plano 2000d · DU-222: o servidor que contar tentativas erradas recentes manda o resumo; o shell avisa depois de entrar
      // plano 2000d · DU-119: a empresa exige verificação em duas etapas e esta conta ainda não ligou → abre direto no passo de ligar
      await ctx.aoEntrar(r.token, { ...opcoesEntrada, ...(r.expira_em ? { expira_em: r.expira_em } : {}), ...(r.tentativas_recentes ? { tentativas: r.tentativas_recentes } : {}), ...(r.precisa_ativar_2fa === true ? { ativar2fa: true } : {}) });
    } catch (e) {
      rotuloBt.textContent = "Entrar";
      const msg = api.mensagemErro(e);
      // plano 1000b · UB-157: a senha só é apagada quando o problema é ELA (credenciais/tentativas); sem internet ou servidor lento ela fica no campo
      const s = form.querySelector("input[name=senha]"); if (s && e && (e.codigo === "credenciais_invalidas" || e.codigo === "muitas_tentativas")) s.value = "";
      // senha ou e-mail errados: o erro fica colado no campo de senha (inline) e o foco volta para lá; erro de rede/servidor usa a caixa
      // plano 1500c · UCB-047: com o hint «restam:N» do servidor, a frase diz quantas tentativas faltam antes do bloqueio
      if (e && e.codigo === "credenciais_invalidas") ui.marcarErro(form, "senha", fraseSenhaErrada(msg, e.hint));
      else if (e && e.codigo === "muitas_tentativas") bloquear(e);
      else { mostrar(erro, msg); if (s) s.focus(); }
      if (e && e.codigo === "credenciais_invalidas" && ++falhas >= 3) destacarEsqueci();
    }
  });

  // plano 1500c · UCB-054: «Ver demonstração» — só quando a marca diz que o servidor tem a empresa de demonstração (demo_publica: true)
  let demo = null;
  if (m.demo_publica === true) {
    demo = h("button", { type: "button", class: "bt bt-sec bt-bloco" }, ui.icone("olho"), "Ver demonstração");
    demo.addEventListener("click", async () => {
      mostrar(erro, "");
      try {
        const r = await ui.carregando(demo, api.publica("nx_demo_entrar", {}));
        if (!r || !r.token) throw Object.assign(new Error("demo_indisponivel"), { codigo: "demo_indisponivel" });
        await ctx.aoEntrar(r.token, { demo: true, compartilhado: true });
      } catch (e) { mostrar(erro, e && e.codigo === "demo_indisponivel" ? "A demonstração não está disponível agora." : api.mensagemErro(e)); }
    });
  }
  // plano 2000d · DU-212: «Entrar com código no WhatsApp» (sem senha) — só quando a marca diz que o servidor tem o pedido (entrar_codigo: true).
  // A resposta é sempre a mesma frase: a tela não revela se o e-mail existe.
  let porCodigo = null;
  if (m.entrar_codigo === true) {
    porCodigo = h("button", { type: "button", class: "bt bt-sec bt-bloco" }, ui.icone("whatsapp"), "Entrar com código no WhatsApp");
    porCodigo.addEventListener("click", async () => {
      mostrar(erro, "");
      ui.marcarErro(form, null);
      const email = normalizarEmail(ui.lerForm(form).email);
      if (!emailValido(email)) { ui.marcarErro(form, "email", "Digite o seu e-mail acima para receber o código."); const i = form.querySelector("input[name=email]"); if (i) i.focus(); return; }
      try {
        const r = await ui.carregando(porCodigo, api.publica("nx_entrar_codigo_pedir", { p_email: email }));
        const opcoes = lembrar ? { compartilhado: ui.lerForm(form).lembrar === false } : {};
        pedirCodigo(String((r && r.desafio) || ""), opcoes, { titulo: "Digite o código", sub: "Se o e-mail tiver um WhatsApp verificado, o código de 6 números chega em instantes.",
          ajuda: "O código que chegou no seu WhatsApp." });
      } catch (e) { mostrar(erro, api.mensagemErro(e)); }
    });
  }
  // plano 2000d · DU-229: «A+» aumenta o texto no aparelho (baixa visão), sem depender do zoom do navegador
  const textoGrande = h("button", { type: "button", class: "link entrar-a-mais", "aria-pressed": String(typeof document !== "undefined" && document.documentElement && document.documentElement.dataset.texto === "grande") },
    h("span", { "aria-hidden": "true" }, "A+"), h("span", { class: "sr-only" }, "Aumentar o texto"));
  textoGrande.addEventListener("click", () => { const on = alternarTextoGrande(); textoGrande.setAttribute("aria-pressed", String(on)); });
  const prospect = caminhoProspect(m, ui.linkWhatsApp);   // plano 1500c · UCB-053 + UC-031
  const prospectEl = prospect ? h("p", { class: "entrar-prospect" }, h("a", { class: "link", href: prospect.href,
    ...(prospect.externo ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, prospect.rotulo)) : null;

  const prod = ctx.produtoAberto;
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-entrar" },
    prod ? h("p", { class: "entrar-produto" }, ui.icone(prod.icone), h("span", null, h("b", null, prod.titulo), " · ", prod.resumo)) : null,
    h("p", { class: "entrar-kicker selo-caps", "aria-hidden": "true" }, m.produto || "Órbita"),
    h("h1", { id: "t-entrar" }, "Entrar"),
    // plano 2000d · DU-231: com o teste aberto, quem entra criou a própria senha (ninguém «recebeu» nada)
    h("p", { class: "sub" }, m.login_texto || (m.teste_aberto === true ? "Entre com seu e-mail e senha." : "Entre com o e-mail e a senha que você recebeu.")),
    form,
    porCodigo,
    demo,
    h("div", { class: "entrar-rodape" }, esqueci, textoGrande),
    ajuda,
    prospectEl,
    // plano 2000d · DU-145: termos, privacidade e suporte da revenda
    (() => { const ls = linksDoRodape(m); return ls.length ? h("nav", { class: "entrar-links", "aria-label": "Informações" }, ls.map(l => h("a", { class: "link", href: l.href, ...(l.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, l.rotulo))) : null; })());
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, sub: null, cartao }));
  // UCB-046: bloqueio que ainda corre (a página foi recarregada no meio) retoma a contagem
  const resta = restanteBloqueio(lerBloqueio(), Date.now());
  if (resta > 0) bloquearPor(resta, api.mensagemErro({ codigo: "muitas_tentativas" }));
  else gravarBloqueio(0);
  focarDepois(ctx, "input[name=email]");
}

/** Plano 1000b · UB-162: convite feito para um e-mail → o campo vem somente leitura (o servidor aceita só esse); sem e-mail, campo livre. */
export function campoEmailDoConvite(ui, email) {
  const fixo = !!String(email || "").trim();
  const c = ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: email || "", autocomplete: "username", obrigatorio: true,
    ajuda: fixo ? "O convite é para este e-mail." : undefined });
  const inp = c.querySelector("input");
  if (fixo && inp) { inp.setAttribute("readonly", ""); inp.readOnly = true; }
  else if (inp) ligarSugestaoEmail(ui, inp);   // plano 2000d · SX-099: no convite sem e-mail fixo também
  return c;
}

/* ---------------- #/convite/<token> ---------------- */
async function telaConvite(ctx, token) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Convite");
  ui.limpar(ctx.alvo);
  const carregandoEl = h("main", { class: "entrar" }, h("div", null), h("section", { class: "entrar-cartao" }, ui.esqueleto("lista", 3)));
  ctx.alvo.appendChild(carregandoEl);

  let cv;
  try {
    if (!/^[0-9a-f]{64}$/i.test(token)) throw Object.assign(new Error("convite_invalido"), { codigo: "convite_invalido" });
    cv = await api.publica("nx_convite_ver", { p_convite: token });
  } catch (e) {
    ui.limpar(ctx.alvo);
    const ir = h("a", { class: "bt bt-prim", href: "#/login" }, "Ir para a entrada");
    // plano 1000b · UB-166: com WhatsApp de suporte na marca, um caminho para pedir um convite novo
    const wa = ctx.marca && ctx.marca.suporte_wa;
    const suporte = wa ? h("a", { class: "bt bt-sec", href: ui.linkWhatsApp("Olá! Meu convite para o sistema não abre. Pode me mandar um novo?", wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
    ctx.alvo.appendChild(moldura(ctx, {
      titulo: (ctx.marca && ctx.marca.login_titulo) || "", cartao: h("section", { class: "entrar-cartao" },
        h("h1", null, "Convite indisponível"), h("p", { class: "sub" }, api.mensagemErro(e)), h("div", { class: "entrar-form" }, ir, suporte)),
    }));
    return;
  }

  // a marca do convite é a da org que convidou
  if (cv.org && cv.org.marca) ctx.pintarMarcaOrg(cv.org.marca);
  const marca = ctx.tema.marcaEfetiva((cv.org && cv.org.marca) || {}, {});
  const papelTxt = await rotuloDoPapel(ctx, cv.papel);   // plano 1500c · UCB-041
  const destinoTxt = cv.cliente ? cv.cliente.nome : (cv.org ? cv.org.nome : marca.produto);
  const erro = caixaMsg(ui);
  const gestor = cv.papel === "gestor";
  // plano 1500c · UCB-013: «Já tenho conta neste sistema» — um campo de senha só, sem medidor nem mínimo de 8 (a senha antiga pode ser de antes da regra)
  const jaTenho = gestor ? null : ui.campo({ rotulo: "Já tenho conta neste sistema", nome: "ja_tenho", tipo: "checkbox", valor: false,
    ajuda: "Use o mesmo e-mail e a senha que você já usa: o novo acesso entra na sua conta." });
  const campoSenha = ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" });
  const campoSenha2 = ui.campo({ rotulo: "Repita a senha", nome: "senha2", tipo: "senha", autocomplete: "new-password", obrigatorio: true });
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Seu nome", nome: "nome", valor: cv.nome || "", autocomplete: "name", obrigatorio: true, max: 80 }),
    campoEmailDoConvite(ui, cv.email),
    jaTenho,
    // plano 1000 (AS-197): medidor de força e «Repita a senha» — um erro de digitação ao criar a conta deixava a pessoa trancada
    campoSenha,
    campoSenha2,
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Criar acesso"),
    gestor
      // plano 1500c · UCB-119: diz por quê (a conta de gestor é separada das contas de empresa)
      ? h("p", { class: "entrar-nota" }, "Gestores têm uma conta separada: use um e-mail que ainda não entra no sistema.")
      : h("p", { class: "entrar-nota" }, "Já usa o sistema em outra empresa? Marque «Já tenho conta» e use o mesmo e-mail e a sua senha atual — o novo acesso é acrescentado à sua conta."));
  const existente = () => !!(jaTenho && jaTenho.querySelector("input") && jaTenho.querySelector("input").checked);
  if (jaTenho) {
    const caixa = jaTenho.querySelector("input");
    const aplicar = () => {
      const sim = existente();
      campoSenha2.hidden = sim;
      const medidor = campoSenha.querySelector(".medidor"); if (medidor) medidor.hidden = sim;
      const aj = campoSenha.querySelector(".campo-ajuda"); if (aj) aj.hidden = sim;
      const s = campoSenha.querySelector("input"); if (s) s.setAttribute("autocomplete", sim ? "current-password" : "new-password");
      const bt = form.querySelector("button[type=submit]"); if (bt) bt.textContent = sim ? "Entrar e aceitar" : "Criar acesso";
    };
    caixa.addEventListener("change", aplicar);
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o seu nome.");
    const email = normalizarEmail(d.email);
    if (!emailValido(email)) return ui.marcarErro(form, "email", "Esse e-mail não parece válido.");
    if (existente()) {
      if (!d.senha) return ui.marcarErro(form, "senha", "Informe a sua senha atual.");
    } else {
      if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
      if (d.senha !== d.senha2) return ui.marcarErro(form, "senha2", "As duas senhas não são iguais.");
      if (senhaFraca(d.senha, { email, nome: d.nome })) return ui.marcarErro(form, "senha", FRASE_SENHA_FRACA);   // UCB-044
    }
    const bt = form.querySelector("button[type=submit]");
    try {
      const r = await ui.carregando(bt, api.publica("nx_convite_aceitar", { p_convite: token, p_nome: d.nome, p_email: email, p_senha: d.senha }));
      // plano 1500c · UC-019: o shell diz em que empresa e com que papel a pessoa entrou
      await ctx.aoEntrar(r.token, { cliente_id: r.cliente_id || null, boasVindas: { empresa: destinoTxt || null, papel: papelTxt || null } });
    } catch (e) {
      // plano 1000b · UB-165: o convite deixou de valer (vencido, já usado, cancelado) → o formulário morto dá lugar ao motivo e ao caminho
      if (e && e.codigo === "convite_invalido" && e.hint !== "conta_existente") {
        const novo = cartaoLinkMorto(ui, "t-convite", "Este convite não vale mais", `${api.mensagemErro(e)} Peça um convite novo a quem convidou você.`);
        const pai = cartao.parentNode; if (pai) { pai.insertBefore(novo, cartao); cartao.remove(); }
        const ir = novo.querySelector("a.bt-prim"); if (ir) ir.focus();
        return;
      }
      // plano 1500c · UCB-052: «conta_existente» é problema do e-mail — o campo fica marcado (e focado, se ele puder ser trocado)
      if (e && e.codigo === "convite_invalido" && e.hint === "conta_existente") {
        ui.marcarErro(form, "email", api.mensagemErro(e));
        const em = form.querySelector("input[name=email]");
        if (em && !em.readOnly) em.focus();
        else { mostrar(erro, `${api.mensagemErro(e)} Se esse e-mail já é seu, entre por «Ir para a entrada».`); const ir = h("a", { class: "link", href: "#/login" }, "Ir para a entrada"); erro.append(" ", ir); ir.focus(); }
        return;
      }
      mostrar(erro, api.mensagemErro(e));
      // plano 1500c · UCB-010: senha errada (conta que já existe) limpa os DOIS campos — «Repita a senha» com o valor antigo travava o próximo envio
      if (e.codigo === "credenciais_invalidas") {
        const s2 = form.querySelector("input[name=senha2]"); if (s2) s2.value = "";
        const s = form.querySelector("input[name=senha]"); if (s) { s.value = ""; s.focus(); }
      }
    }
  });

  // plano 1000b · UB-163: o servidor que mandar a validade (expira_em) mostra até quando o convite vale (o atual não manda: nada aparece)
  const expira = cv && typeof cv.expira_em === "string" && !Number.isNaN(Date.parse(cv.expira_em)) ? cv.expira_em : null;
  const logo = expira ? avisoValidade(expira) : null;   // plano 1500c · UCB-120: faltando menos de 2 h, o aviso em tom de atenção
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-convite" },
    h("h1", { id: "t-convite" }, "Você recebeu um convite"),   // plano 2000d · DU-120: sem gênero
    h("div", { class: "entrar-convite" }, ui.icone("convidar"),
      h("p", null, gestor ? "Para gerenciar " : "Para ", h("b", null, destinoTxt), " como ", h("b", null, papelTxt), "."),
      expira ? h("p", { class: ["entrar-validade", logo ? "entrar-validade-aten" : "fraco"] }, logo || `Vale até ${ui.dataCurtaBR(expira)} ${ui.horaBR(expira)}.`) : null),
    form);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: marca.login_titulo, cartao, marca }));
  focarDepois(ctx, cv.nome ? "input[name=senha]" : "input[name=nome]");
}

/** plano 1000b · UB-159/UB-165: cartão de link/convite que não vale mais — o motivo e o caminho para a entrada (nada de formulário morto). */
function cartaoLinkMorto(ui, idTitulo, titulo, texto, extra = null) {
  const h = ui.h;
  return h("section", { class: "entrar-cartao", "aria-labelledby": idTitulo },
    h("h1", { id: idTitulo, tabindex: "-1" }, titulo),
    h("p", { class: "sub" }, texto),
    h("div", { class: "entrar-form" }, h("a", { class: "bt bt-prim bt-g bt-bloco", href: "#/login" }, "Ir para a entrada"), extra));
}

/* ---------------- #/senha/<token> ---------------- */
function telaSenha(ctx, token) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Nova senha");
  // plano 1500c · UCB-012: com WhatsApp de suporte, «Pedir um link novo» ao lado do «Ir para a entrada»
  const pedirNovo = () => (m.suporte_wa ? h("a", { class: "bt bt-sec bt-bloco", href: ui.linkWhatsApp("Olá! Meu link de nova senha não vale mais. Pode me mandar outro?", m.suporte_wa),
    target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Pedir um link novo") : null);
  // plano 1000b · UB-159: link com formato que nunca valeria (#/senha/abc) não mostra formulário para digitar duas vezes à toa
  if (!/^[0-9a-f]{64}$/i.test(String(token || ""))) {
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao: cartaoLinkMorto(ui, "t-senha", "Este link não vale mais",
      "O link de nova senha está incompleto ou já foi usado. Peça outro ao administrador da sua empresa.", pedirNovo()) }));
    focarDepois(ctx, "a.bt-prim");
    return;
  }
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    // plano 1000b · UB-158: o mesmo medidor de força do convite
    ui.campo({ rotulo: "Senha nova", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" }),
    ui.campo({ rotulo: "Repita a senha nova", nome: "senha2", tipo: "senha", autocomplete: "new-password", obrigatorio: true }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Salvar senha"));
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-senha" },
    h("h1", { id: "t-senha" }, "Crie uma senha nova"),
    h("p", { class: "sub" }, "Depois de salvar, todas as sessões abertas com a senha antiga são encerradas."),
    form);
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.senha !== d.senha2) return ui.marcarErro(form, "senha2", "As duas senhas não são iguais.");
    if (senhaFraca(d.senha, { produto: m.produto })) return ui.marcarErro(form, "senha", FRASE_SENHA_FRACA);   // plano 1500c · UCB-044 · plano 2000d · DU-219
    const bt = form.querySelector("button[type=submit]");
    try {
      if (!/^[0-9a-f]{64}$/i.test(token)) throw Object.assign(new Error("link_invalido"), { codigo: "link_invalido" });
      const r = await ui.carregando(bt, api.publica("nx_senha_redefinir", { p_link: token, p_senha: d.senha }));
      // plano 1000b · UB-164: o servidor que devolver uma sessão nova já entra direto (por detecção; o atual não devolve e cai no «Entrar»)
      if (r && typeof r === "object" && typeof r.token === "string" && r.token && typeof ctx.aoEntrar === "function") { await ctx.aoEntrar(r.token, {}); return; }
      ui.limpar(cartao);
      // plano 1500c · UCB-011: o título novo continua sendo o nome da seção (id t-senha) e recebe o foco — antes o foco caía no body
      const t = h("h1", { id: "t-senha", tabindex: "-1" }, "Senha criada");
      cartao.append(
        t,
        h("p", { class: "entrar-ok", role: "status" }, "Pronto. Entre com o seu e-mail e a senha nova."),
        h("div", { class: "entrar-form" }, h("a", { class: "bt bt-prim bt-g bt-bloco", href: "#/login" }, "Entrar")));
      try { t.focus({ preventScroll: true }); } catch { t.focus(); }
    } catch (e) {
      // plano 1500c · UCB-012: link vencido ou já usado → o formulário morto dá lugar ao motivo e ao caminho (como o convite)
      if (e && e.codigo === "link_invalido") {
        const novo = cartaoLinkMorto(ui, "t-senha", "Este link não vale mais", `${api.mensagemErro(e)}`, pedirNovo());
        const pai = cartao.parentNode; if (pai) { pai.insertBefore(novo, cartao); cartao.remove(); }
        const ir = novo.querySelector("a.bt-prim"); if (ir) ir.focus();
        return;
      }
      mostrar(erro, api.mensagemErro(e));
    }
  });
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  focarDepois(ctx, "input[name=senha]");
}

/* ---------------- troca obrigatória (conta.trocar_senha) ---------------- */
function telaTrocar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Nova senha");
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Senha atual", nome: "atual", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
    ui.campo({ rotulo: "Senha nova", nome: "nova", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" }),   // plano 1000b · UB-158
    ui.campo({ rotulo: "Repita a senha nova", nome: "nova2", tipo: "senha", autocomplete: "new-password", obrigatorio: true }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Salvar e entrar"));
  const sair = h("button", { type: "button", class: "link" }, "Sair");
  // plano 1500c · UCB-121: com algo digitado, «Sair» pergunta antes (o que foi digitado se perde)
  sair.addEventListener("click", async () => {
    const digitou = [...form.querySelectorAll("input")].some(i => String(i.value || "").length > 0);
    if (digitou && typeof ui.confirmar === "function"
      && !(await ui.confirmar({ titulo: "Sair sem trocar a senha?", texto: "O que você digitou aqui se perde. Na próxima entrada a troca será pedida de novo.", rotulo: "Sair", perigo: true }))) return;
    ctx.sair();
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.atual) return ui.marcarErro(form, "atual", "Informe a senha atual.");
    if (!d.nova || d.nova.length < 8) return ui.marcarErro(form, "nova", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.nova !== d.nova2) return ui.marcarErro(form, "nova2", "As duas senhas não são iguais.");
    // plano 1000b · UB-160: repetir a senha que o administrador criou não protege nada — erro aqui, sem gastar chamada
    if (d.nova === d.atual) return ui.marcarErro(form, "nova", "Use uma senha diferente da que o administrador criou.");
    const conta = ctx.sessao && ctx.sessao.conta;
    if (senhaFraca(d.nova, { email: conta && conta.email, nome: conta && conta.nome, produto: m.produto })) return ui.marcarErro(form, "nova", FRASE_SENHA_FRACA);   // plano 1500c · UCB-044 · plano 2000d · DU-219
    const bt = form.querySelector("button[type=submit]");
    try {
      await ui.carregando(bt, api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      await ctx.aoTrocarSenha();
    } catch (e) {
      // plano 1000b · UB-161: senha atual errada fica colada no campo «Senha atual» (como no Perfil), com o foco nele
      if (e && e.codigo === "credenciais_invalidas") {
        ui.marcarErro(form, "atual", "A senha atual não confere.");
        const a = form.querySelector("input[name=atual]"); if (a) { a.value = ""; a.focus(); }
      } else mostrar(erro, api.mensagemErro(e));
    }
  });
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-trocar" },
    h("h1", { id: "t-trocar" }, "Troque a sua senha"),
    // plano 1000 (AS-263): diz o motivo — a senha atual foi criada por outra pessoa
    h("p", { class: "sub" }, "Sua senha foi criada por um administrador. Crie uma que só você saiba."),
    form, h("div", { class: "entrar-rodape" }, sair));
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  focarDepois(ctx, "input[name=atual]");
}

/* ---------------- #/testar (plano 1500c · UC-001) ---------------- */
export const VERTICAIS_TESTE = Object.freeze([
  { valor: "odonto", rotulo: "Clínica odontológica" }, { valor: "oficina", rotulo: "Oficina mecânica" },
  { valor: "loja", rotulo: "Loja" }, { valor: "generico", rotulo: "Outro tipo de empresa" },
]);
/** plano 2000d · DU-145: os links da revenda no rodapé da entrada (termos, privacidade, e-mail de suporte) — só https e e-mail válido. */
export function linksDoRodape(m) {
  const x = m || {};
  const url = v => (typeof v === "string" && /^https:\/\/[^\s"<>]+$/i.test(v.trim()) ? v.trim() : null);
  const out = [];
  if (url(x.termos_url)) out.push({ rotulo: "Termos de uso", href: url(x.termos_url) });
  if (url(x.privacidade_url)) out.push({ rotulo: "Privacidade", href: url(x.privacidade_url) });
  const em = String(x.suporte_email || "").trim();
  if (/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(em)) out.push({ rotulo: "Suporte por e-mail", href: `mailto:${em}` });
  return out;
}
/** plano 2000d · DU-214: o texto do aceite com os links da marca (termos_url, privacidade_url); sem link, o texto sozinho. */
export function partesDoAceite(m) {
  const url = v => (typeof v === "string" && /^https:\/\//i.test(v.trim()) ? v.trim() : null);
  return { termos: url(m && m.termos_url), privacidade: url(m && m.privacidade_url) };
}
/** Conta de teste de 14 dias pela própria tela — só quando a marca da org liga `teste_aberto` (o servidor tem nx_teste_criar, com limite por
    IP/e-mail e confirmação). Sem isso, o endereço #/testar mostra o caminho de sempre (falar com a revenda) em vez de um formulário que falharia. */
function telaTestar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Testar grátis");
  if (m.teste_aberto !== true) {
    const prospect = caminhoProspect(m, ui.linkWhatsApp);
    const extra = prospect && prospect.externo ? h("a", { class: "bt bt-sec bt-bloco", href: prospect.href, target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Pedir um teste") : null;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao: cartaoLinkMorto(ui, "t-testar", "Teste pelo site indisponível",
      "Para testar, fale com quem fornece o sistema: a conta de teste é criada para a sua empresa.", extra) }));
    return;
  }
  const erro = caixaMsg(ui);
  const dias = diasDeTeste(m);   // plano 2000d · DU-215: o prazo da revenda, não «14» fixo
  const aceite = partesDoAceite(m);
  // plano 2000d · DU-214: aceite obrigatório dos termos e da política de privacidade (LGPD), com os links da marca
  const caixaAceite = h("div", { class: "campo campo-check campo-aceite", dataset: { campo: "aceite" } },
    h("label", { for: "t-aceite" }, h("input", { type: "checkbox", id: "t-aceite", name: "aceite", required: true, "aria-describedby": "t-aceite-er" }),
      h("span", { class: "check-marca", "aria-hidden": "true" }),
      h("span", { class: "check-txt" }, "Li e aceito os ",
        aceite.termos ? h("a", { class: "link", href: aceite.termos, target: "_blank", rel: "noopener noreferrer" }, "Termos de uso") : "Termos de uso",
        " e a ", aceite.privacidade ? h("a", { class: "link", href: aceite.privacidade, target: "_blank", rel: "noopener noreferrer" }, "Política de privacidade") : "Política de privacidade", ".")),
    h("small", { class: "campo-erro", id: "t-aceite-er", hidden: true }));
  // plano 2000d · DU-217: o modelo escolhido aparece numa nota quando o tipo usa o de outra vertical
  const notaTipo = h("p", { class: "entrar-nota nota-tipo", "aria-live": "polite", hidden: true });
  const campoTipo = ui.campo({ rotulo: "Tipo de empresa", nome: "vertical", tipo: "select", opcoes: TIPOS_EMPRESA_TESTE, valor: "generico" });
  const selTipo = campoTipo.querySelector("select");
  if (selTipo) selTipo.addEventListener("change", () => { const t = TIPOS_EMPRESA_TESTE.find(x => x.valor === selTipo.value); notaTipo.textContent = (t && t.nota) || ""; notaTipo.hidden = !(t && t.nota); });
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Nome da empresa", nome: "empresa", obrigatorio: true, max: 80, autocomplete: "organization" }),
    campoTipo, notaTipo,
    ui.campo({ rotulo: "Seu nome", nome: "nome", obrigatorio: true, max: 80, autocomplete: "name" }),
    ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", obrigatorio: true, autocomplete: "username", inputmode: "email" }),
    // plano 2000d · DU-213: o WhatsApp de quem testa (opcional) — a revenda consegue ajudar na configuração
    ui.campo({ rotulo: "WhatsApp (para ajudar na configuração)", nome: "whatsapp", tipo: "tel", autocomplete: "tel", validar: "telefone", ajuda: "Opcional. Só usamos para ajudar você a começar." }),
    // plano 2000d · DU-358: a regra da senha aparece antes do erro
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", obrigatorio: true, autocomplete: "new-password", ajuda: "Pelo menos 8 caracteres. Evite o nome da empresa ou o seu.", validar: "senha" }),
    // armadilha para robôs: invisível para pessoas (fora da tela e fora do Tab); preenchido = não envia
    h("div", { class: "sr-only", "aria-hidden": "true" }, h("label", null, "Site", h("input", { name: "site_url", tabindex: "-1", autocomplete: "off" }))),
    caixaAceite,
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, `Começar o teste de ${dias} dias`),
    h("p", { class: "entrar-nota" }, `Sem cartão. Depois de ${dias} dias você decide se continua; nada é cobrado sozinho.`));
  ligarSugestaoEmail(ui, form.querySelector("input[name=email]"));   // plano 2000d · SX-099: o e-mail do teste também ganha o «Você quis dizer…?»
  const marcarAceite = msg => {
    const er = caixaAceite.querySelector(".campo-erro"), inp = caixaAceite.querySelector("input");
    er.textContent = msg || ""; er.hidden = !msg;
    if (msg) { inp.setAttribute("aria-invalid", "true"); caixaAceite.dataset.estado = "erro"; } else { inp.removeAttribute("aria-invalid"); delete caixaAceite.dataset.estado; }
  };
  let ultimoEnvio = null;
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    marcarAceite(null);
    const d = ui.lerForm(form);
    if (d.site_url) return;
    if (!d.empresa || d.empresa.trim().length < 2) return ui.marcarErro(form, "empresa", "Informe o nome da empresa.");
    if (!d.nome || d.nome.trim().length < 2) return ui.marcarErro(form, "nome", "Informe o seu nome.");
    const email = normalizarEmail(d.email);
    if (!emailValido(email)) return ui.marcarErro(form, "email", "Confira o e-mail (exemplo: nome@empresa.com.br).");
    const tel = String(d.whatsapp || "").replace(/[^\d+]/g, "");
    if (tel && !(/^\d{10,11}$/.test(tel) || /^\+\d{8,15}$/.test(tel))) return ui.marcarErro(form, "whatsapp", "Informe o WhatsApp com DDD, por exemplo (12) 99830-3030 — ou deixe em branco.");
    if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
    if (senhaFraca(d.senha, { email, nome: d.nome, empresa: d.empresa, produto: m.produto })) return ui.marcarErro(form, "senha", FRASE_SENHA_FRACA);
    if (d.aceite !== true) { marcarAceite("Para criar a conta, aceite os Termos de uso e a Política de privacidade."); const a = caixaAceite.querySelector("input"); if (a) a.focus(); return; }
    const org = ctx.marcaPublica && ctx.marcaPublica.org ? ctx.marcaPublica.org.slug || null : null;
    const base = { p_org_slug: org, p_empresa: d.empresa.trim(), p_vertical: verticalDoTipo(d.vertical), p_nome: d.nome.trim(), p_email: email, p_senha: d.senha };
    ultimoEnvio = { d, email };
    try {
      // servidor sem os parâmetros novos (telefone, aceite, tipo): o pedido é refeito com os de sempre
      const r = await ui.carregando(form.querySelector("button[type=submit]"), publicaComExtras(api, "nx_teste_criar", base,
        { p_telefone: tel || null, p_aceite_em: new Date().toISOString(), p_tipo: d.vertical && verticalDoTipo(d.vertical) !== d.vertical ? d.vertical : null }));
      if (r && r.token) { await ctx.aoEntrar(r.token, { cliente_id: r.cliente_id || null, boasVindas: { empresa: d.empresa.trim(), papel: "administrador" } }); return; }
      confiraEmail(email);
    } catch (e) {
      if (e && e.codigo === "email_em_uso") { ui.marcarErro(form, "email", api.mensagemErro(e)); return; }
      mostrar(erro, api.mensagemErro(e));
    }
  });
  /** plano 2000d · DU-216: «Confira o seu e-mail» com «Mandar de novo» (espera de 60 s) e «Errei o e-mail» (volta ao formulário preenchido). */
  const confiraEmail = email => {
    ui.limpar(cartao);
    const ok = h("p", { class: "entrar-ok", role: "status" }, `Mandamos um link para ${email}. Abra para ativar o teste.`);
    const de = h("button", { type: "button", class: "bt bt-sec bt-bloco entrar-reenviar", disabled: true });
    let espera = ESPERA_REENVIO_EMAIL_S, rel = null;
    const pintar = () => { de.textContent = espera > 0 ? `Mandar de novo em ${espera} s` : "Mandar de novo"; de.disabled = espera > 0; };
    const contar = () => {
      espera = ESPERA_REENVIO_EMAIL_S; pintar();
      if (rel) { clearInterval(rel); _relogios.delete(rel); }
      rel = setInterval(() => { espera -= 1; pintar(); if (espera <= 0) { clearInterval(rel); _relogios.delete(rel); rel = null; } }, 1000);
      _relogios.add(rel);
    };
    de.addEventListener("click", async () => {
      if (espera > 0) return;
      try { await ui.carregando(de, api.publica("nx_teste_reenviar", { p_email: email })); ok.textContent = `Mandamos de novo para ${email}. Confira também a caixa de spam.`; contar(); }
      catch (e) { if (funcaoSemAssinatura(e)) { de.hidden = true; ok.textContent = `Confira a caixa de spam de ${email}. Se não chegar, fale com quem fornece o sistema.`; } else { ok.textContent = api.mensagemErro(e); contar(); } }
    });
    const errei = h("button", { type: "button", class: "link" }, "Errei o e-mail");
    errei.addEventListener("click", () => {
      if (rel) { clearInterval(rel); _relogios.delete(rel); rel = null; }
      ui.limpar(cartao);
      cartao.append(tituloCartao, subCartao, form, rodapeCartao);
      const em = form.querySelector("input[name=email]"); if (em) { em.focus(); try { em.select(); } catch { /* ok */ } }
    });
    cartao.append(h("h1", { id: "t-testar", tabindex: "-1" }, "Confira o seu e-mail"), ok,
      h("div", { class: "entrar-form" }, de, h("a", { class: "bt bt-fant bt-bloco", href: "#/login" }, "Ir para a entrada")), h("div", { class: "entrar-rodape" }, errei));
    contar();
    const t = cartao.querySelector("h1"); if (t) t.focus();
  };
  const tituloCartao = h("h1", { id: "t-testar" }, `Teste grátis por ${dias} dias`);
  const subCartao = h("p", { class: "sub" }, `Crie a conta da sua empresa no ${m.produto || "sistema"} e comece agora.`);
  const rodapeCartao = h("div", { class: "entrar-rodape" }, h("a", { class: "link", href: "#/login" }, "Já tenho conta: entrar"));
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-testar" },
    tituloCartao,
    subCartao,
    form, rodapeCartao);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  focarDepois(ctx, "input[name=empresa]");
}
